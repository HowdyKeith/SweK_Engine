// =============================================================================
// FILE: /ui/spectatorCast.js
// ROUND: 182
// =============================================================================
//
// Approach C (the user's pick) for remote spectatorship: periodically capture
// the WebGL canvas as a JPEG and broadcast over the bridge's WebSocket. The
// bridge stores the latest frame and rebroadcasts to every other WS client.
// Two consumer paths:
//
//   1. Browser spectators → /spectator.html opens a WS, receives binary frames,
//      renders them in an <img>. ~5fps, ~50-150KB per frame at quality 0.6.
//
//   2. VBA/Excel spectators → poll GET /spectator/latest.jpg every 200ms,
//      LoadPicture into an Image control. No WebSocket needed on the Excel
//      side; the bridge serves the latest cached frame on every request.
//
// The whole point of approach C is that the receiver can be dumb. Excel
// doesn't need GLB parsing, doesn't need a 3D engine, doesn't need shaders.
// It needs an image control and an HTTP timer.
//
// Why a separate WebSocket from WSBridge: WSBridge always JSON.parse()s every
// incoming message (line 75 of wsBridge.js) and would warn-log every binary
// frame as "non-JSON payload". Cleaner to open a dedicated socket here and
// leave WSBridge untouched. The bridge sees this as a second "player" but
// doesn't matter — multiplayer code ignores clients that don't announce.
//
// Bandwidth math: 5 fps × ~80KB/frame ≈ 400KB/s. Fine on LAN. For internet
// over Tailscale, that's roughly 3-4 Mbit which is fine on most uplinks.
// FPS and quality are both configurable via start({fps, quality}).
//
// Requires preserveDrawingBuffer:true on the main canvas (engine/bootstrap.js
// sets this since round 182). Without it, canvas.toBlob would return a blank
// image because the browser is allowed to discard the back buffer after
// composite.
//
// Public API:
//   window.spectatorCast.start({fps?, quality?, canvasId?})
//     → opens WS, begins capture-and-publish loop, mounts a small badge in
//       the corner. Returns boolean (true = started, false = already running).
//   window.spectatorCast.stop()
//     → closes WS, clears interval, removes badge.
//   window.spectatorCast.isRunning() → boolean
//   window.spectatorCast.status()    → { running, fps, quality, framesSent,
//                                         bytesSent, lastBytes }
// =============================================================================

const DEFAULTS = {
    fps:       5,
    quality:   0.6,
    canvasId:  "glcanvas",
    wsUrl:     null,    // null = derive from location: ws://host:port
};

let _running = false;
let _ws        = null;
let _timer     = null;
let _canvas    = null;
let _badge     = null;
let _cfg       = null;
let _framesSent = 0;
let _bytesSent  = 0;
let _lastBytes  = 0;
let _inFlight   = false;   // gate so we don't queue toBlob calls if the
                            // previous one is still encoding (slow GPU, big canvas)
let _viewerCount = 0;       // Round 184 — live viewer count from bridge broadcast
let _statsEl     = null;    // text portion of the badge
let _fpsSlider   = null;    // <input range> for live fps tuning
let _qSlider     = null;    // <input range> for live quality tuning

// Round 184 — localStorage keys for persisted prefs. Survive reloads;
// the auto-resume IIFE in main.js reads these on boot.
const LS_FPS         = "voxelengine.spectatorFps";
const LS_QUALITY     = "voxelengine.spectatorQuality";
const LS_AUTO_RESUME = "voxelengine.spectatorAutoResume";

function _deriveWsUrl() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}`;
}

function _mountBadge() {
    if (_badge) return;
    _badge = document.createElement("div");
    _badge.id = "spectator_cast_badge";
    Object.assign(_badge.style, {
        position:   "fixed",
        bottom:     "10px",
        left:       "10px",
        background: "rgba(0,0,0,0.78)",
        color:      "#8aff9e",
        padding:    "6px 10px",
        font:       "11px monospace",
        borderRadius: "4px",
        border:     "1px solid #8aff9e88",
        zIndex:     "99999",
        userSelect: "none",
        display:    "flex",
        flexDirection: "column",
        gap:        "4px",
        minWidth:   "220px",
    });
    // Round 184 — three rows:
    //   1. live stats (fps · KB · frames · viewers)
    //   2. fps slider
    //   3. quality slider
    _statsEl = document.createElement("div");
    _statsEl.textContent = "📡 casting…";
    _statsEl.style.pointerEvents = "none";
    _badge.appendChild(_statsEl);

    const fpsRow = document.createElement("label");
    fpsRow.style.cssText = "display:flex; gap:6px; align-items:center; font-size:10px; color:#aaa;";
    fpsRow.innerHTML = `<span style="min-width:40px;">fps</span>`;
    _fpsSlider = document.createElement("input");
    _fpsSlider.type = "range";
    _fpsSlider.min = "1"; _fpsSlider.max = "15"; _fpsSlider.step = "1";
    _fpsSlider.value = String(_cfg.fps);
    _fpsSlider.style.flex = "1";
    const fpsVal = document.createElement("span");
    fpsVal.style.cssText = "min-width:24px; color:#ccc; text-align:right;";
    fpsVal.textContent = String(_cfg.fps);
    fpsRow.appendChild(_fpsSlider);
    fpsRow.appendChild(fpsVal);
    _fpsSlider.addEventListener("input", () => {
        const v = parseInt(_fpsSlider.value, 10);
        fpsVal.textContent = String(v);
        _cfg.fps = v;
        try { localStorage.setItem(LS_FPS, String(v)); } catch {}
        _restartTimer();
    });
    _badge.appendChild(fpsRow);

    const qRow = document.createElement("label");
    qRow.style.cssText = "display:flex; gap:6px; align-items:center; font-size:10px; color:#aaa;";
    qRow.innerHTML = `<span style="min-width:40px;">jpeg q</span>`;
    _qSlider = document.createElement("input");
    _qSlider.type = "range";
    _qSlider.min = "0.3"; _qSlider.max = "0.95"; _qSlider.step = "0.05";
    _qSlider.value = String(_cfg.quality);
    _qSlider.style.flex = "1";
    const qVal = document.createElement("span");
    qVal.style.cssText = "min-width:32px; color:#ccc; text-align:right;";
    qVal.textContent = (+_cfg.quality).toFixed(2);
    qRow.appendChild(_qSlider);
    qRow.appendChild(qVal);
    _qSlider.addEventListener("input", () => {
        const v = parseFloat(_qSlider.value);
        qVal.textContent = v.toFixed(2);
        _cfg.quality = v;
        try { localStorage.setItem(LS_QUALITY, String(v)); } catch {}
        // Quality takes effect on the next captured frame — no timer restart needed.
    });
    _badge.appendChild(qRow);

    document.body.appendChild(_badge);
}

function _updateBadge() {
    if (!_statsEl) return;
    const kb = _lastBytes > 0 ? (_lastBytes / 1024).toFixed(1) : "—";
    const totalKB = _bytesSent > 0 ? (_bytesSent / 1024).toFixed(0) : 0;
    // Round 184 — append viewer count. 0 viewers shown faintly so the
    // user can tell they're casting into the void (still useful for
    // the VBA HTTP-poll path, since pollers don't register as viewers).
    const viewersBit = _viewerCount > 0
        ? ` · ${_viewerCount} viewer${_viewerCount === 1 ? "" : "s"}`
        : ` · 0 viewers`;
    _statsEl.textContent = `📡 ${kb}KB · ${_framesSent}f (${totalKB}KB)${viewersBit}`;
}

// Round 184 — fps slider changes the polling interval, which means we
// need to recreate the setInterval. Quality changes don't (just apply
// to the next toBlob call).
function _restartTimer() {
    if (!_running) return;
    if (_timer) { clearInterval(_timer); _timer = null; }
    const intervalMs = Math.max(33, Math.round(1000 / _cfg.fps));
    _timer = setInterval(_captureAndSend, intervalMs);
}

function _unmountBadge() {
    if (_badge?.parentNode) _badge.parentNode.removeChild(_badge);
    _badge = null;
    _statsEl = null;
    _fpsSlider = null;
    _qSlider = null;
}

// v1066 — Pip-Boy green post-process for the cast. When the engine is in
// pipboy-theme (and cast-green isn't disabled), composite each captured frame
// through a 2D canvas with a green CRT filter + scanlines BEFORE encoding, so
// the spectator/Discord/phone mirror is green too (not just the local display).
let _fxCanvas = null, _fxCtx = null;
function _castGreenActive() {
    try {
        if (typeof document === "undefined") return false;
        if (!document.documentElement.classList.contains("pipboy-theme")) return false;
        return localStorage.getItem("voxelengine.castGreen") !== "0";
    } catch { return false; }
}
function _greenFrame(src) {
    const w = src.width | 0, h = src.height | 0;
    if (!w || !h) return src;
    if (!_fxCanvas) { _fxCanvas = document.createElement("canvas"); _fxCtx = _fxCanvas.getContext("2d"); }
    if (_fxCanvas.width !== w || _fxCanvas.height !== h) { _fxCanvas.width = w; _fxCanvas.height = h; }
    const ctx = _fxCtx;
    ctx.save();
    ctx.filter = "brightness(0.95) sepia(0.55) hue-rotate(60deg) saturate(2.3) contrast(1.06)";
    ctx.drawImage(src, 0, 0, w, h);
    ctx.filter = "none";
    ctx.globalAlpha = 0.16; ctx.fillStyle = "#000";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    ctx.globalAlpha = 1;
    ctx.restore();
    return _fxCanvas;
}

function _captureAndSend() {
    if (_inFlight) return;
    if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
    if (!_canvas) return;
    _inFlight = true;
    try {
        const _src = _castGreenActive() ? _greenFrame(_canvas) : _canvas;
        _src.toBlob(
            (blob) => {
                _inFlight = false;
                if (!blob) return;
                if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
                try {
                    _ws.send(blob);
                    _framesSent++;
                    _lastBytes = blob.size;
                    _bytesSent += blob.size;
                    _updateBadge();
                } catch (e) {
                    // Drop frame on send error; loop continues at next tick
                }
            },
            "image/jpeg",
            _cfg.quality,
        );
    } catch (e) {
        _inFlight = false;
    }
}

export function start(opts = {}) {
    if (_running) return false;
    _cfg = { ...DEFAULTS, ...opts };
    _cfg.fps     = Math.max(1, Math.min(30, _cfg.fps | 0));
    _cfg.quality = Math.max(0.1, Math.min(0.95, +_cfg.quality));

    _canvas = document.getElementById(_cfg.canvasId);
    if (!_canvas) {
        console.warn(`[spectatorCast] canvas "#${_cfg.canvasId}" not found`);
        return false;
    }
    const url = _cfg.wsUrl || _deriveWsUrl();
    try {
        _ws = new WebSocket(url);
        _ws.binaryType = "arraybuffer";
    } catch (e) {
        console.warn("[spectatorCast] WS connect failed:", e?.message);
        return false;
    }
    _framesSent = 0;
    _bytesSent  = 0;
    _lastBytes  = 0;
    _inFlight   = false;
    _viewerCount = 0;     // Round 184 — fresh start, will populate from bridge

    _ws.onopen = () => {
        const intervalMs = Math.max(33, Math.round(1000 / _cfg.fps));
        _timer = setInterval(_captureAndSend, intervalMs);
        console.log(`[spectatorCast] started — ${_cfg.fps}fps, JPEG q=${_cfg.quality}, ws=${url}`);
        _mountBadge();
        _updateBadge();
        // Round 184 — persist "casting was on" so the auto-resume IIFE
        // in main.js can restart cast on the next page load.
        try { localStorage.setItem(LS_AUTO_RESUME, "1"); } catch {}
    };
    _ws.onclose = () => {
        // If the bridge restarts mid-cast, tear down cleanly but DON'T
        // clear the auto-resume flag — the user didn't ask us to stop.
        // A page reload after bridge comes back will pick up casting again.
        if (_running) _internalTeardown();
    };
    _ws.onerror = () => {
        // Suppress noisy errors — onclose follows.
    };
    // Round 184 — bridge broadcasts {type:"spectator:viewers",count:N}
    // whenever a viewer connects/disconnects. Update the badge live.
    _ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        try {
            const m = JSON.parse(ev.data);
            if (m?.type === "spectator:viewers" && typeof m.count === "number") {
                _viewerCount = m.count;
                _updateBadge();
            }
        } catch {}
    };

    _running = true;
    return true;
}

// Round 184 — shared teardown used by both public stop() (user intent)
// and the WS onclose handler (bridge disconnect). Public stop also
// clears the auto-resume flag; the WS-disconnect path leaves it set so
// the next page load picks up casting again automatically.
function _internalTeardown() {
    _running = false;
    if (_timer) { clearInterval(_timer); _timer = null; }
    try { _ws?.close(); } catch {}
    _ws = null;
    _canvas = null;
    _unmountBadge();
}

export function stop() {
    if (!_running) return false;
    const total = _framesSent;
    const totalKB = (_bytesSent / 1024).toFixed(0);
    _internalTeardown();
    // User explicitly stopped — clear auto-resume so reload comes up dark.
    try { localStorage.setItem(LS_AUTO_RESUME, "0"); } catch {}
    console.log(`[spectatorCast] stopped — ${total} frames sent (${totalKB}KB)`);
    return true;
}

export function isRunning() { return _running; }

// v1219 — full-resolution one-shot grab. Captures the engine canvas at native
// size (PNG = lossless by default) and POSTs the bytes to the bridge, which the
// remote then fetches at /spectator/fullshot.png. Works whether or not the live
// cast is running. (Relies on the same preserveDrawingBuffer:true the cast uses.)
export async function shot(opts = {}) {
    const cv = _canvas || document.getElementById((opts && opts.canvasId) || _cfg && _cfg.canvasId || "glcanvas") || document.querySelector("canvas");
    if (!cv || !cv.toBlob) return { ok: false, error: "no_canvas" };
    const mime = (opts && opts.mime) || "image/png";
    const blob = await new Promise(r => { try { cv.toBlob(b => r(b), mime, (opts && opts.quality) || 0.95); } catch (e) { r(null); } });
    if (!blob || !blob.size) return { ok: false, error: "capture_failed" };
    try {
        const resp = await fetch("/spectator/fullshot", { method: "POST", headers: { "Content-Type": mime }, body: blob });
        const j = await resp.json().catch(() => ({}));
        return Object.assign({ ok: resp.ok, bytes: blob.size }, j);
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

export function status() {
    return {
        running:    _running,
        fps:        _cfg?.fps     ?? 0,
        quality:    _cfg?.quality ?? 0,
        framesSent: _framesSent,
        bytesSent:  _bytesSent,
        lastBytes:  _lastBytes,
    };
}

// Convenience global so the console can drive it without imports.
if (typeof window !== "undefined") {
    window.spectatorCast = { start, stop, isRunning, status, shot };
}
