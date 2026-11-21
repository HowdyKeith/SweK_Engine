// WebGLEngine/ui/tvOut.js -- UNNUMBERED (the version is chosen at ship time)
//
// THIS PAGE ON A TV. Keith: "7" (a "To TV" button in the record controls) and "8" (the engine's canvas live, WebCodecs H.264 into tvpipe's stream()). The dock's
// sixth row (ui/svgGaugeSet.js) has three buttons that import this file on their first click:
//   TO TV    pick a TV, then the bridge has tvpipe open THIS PAGE in a browser of its own and mirror it (POST /tv/share). Everything on the page goes.
//   LIVE TV  pick a TV, then THIS PAGE encodes its largest <canvas> itself (WebCodecs, H.264, Annex B) and sends each frame over the /tv/live socket; the
//            bridge hands it to tvpipe, which sends it on without re-encoding. Only the canvas goes, with less delay than TO TV.
//   TV OFF   stop whatever this bridge is sending to a TV (POST /tv/stop).
// An Apple TV that shows a PIN is answered with a prompt here (GET /tv/status lists it, POST /tv/pin answers it). Every failure is a message on the button,
// never a silent no-op. The bridge's side, and what it refuses: ai-bridge/tvpipeBridge.js. Held by tools/ship/tvOut-selfcheck.mjs.
//
// THE WIRE (the bridge's parseLiveFrame reads it): one flags byte (1 = keyframe), the timestamp in microseconds as a little-endian u64, then the access unit.

/** One live frame as the bridge reads it. Pure. */
export function encodeLiveFrame(keyframe, ptsUs, au) {
    const out = new Uint8Array(9 + au.byteLength), dv = new DataView(out.buffer);
    out[0] = keyframe ? 1 : 0; dv.setBigUint64(1, BigInt(Math.max(0, Math.round(ptsUs))), true); out.set(au instanceof Uint8Array ? au : new Uint8Array(au), 9);
    return out;
}
/** The size to encode a w x h canvas at: even, and no larger than max (default 1920 x 1080), keeping its shape. Pure. */
export function liveSize(w, h, maxW = 1920, maxH = 1080) {
    const k = Math.min(1, maxW / w, maxH / h), even = (x) => Math.max(2, 2 * Math.floor((x * k) / 2));
    return { width: even(w), height: even(h) };
}
/** The H.264 profiles to ask the encoder for, in order: high, main, baseline. */
export const CODECS = Object.freeze(["avc1.640028", "avc1.4D4028", "avc1.42E01F"]);
/** The canvas a page means: the largest one on it. */
export function pickCanvas(doc = document) {
    let best = null, area = 0;
    for (const c of doc.querySelectorAll("canvas")) { const a = (c.width || 0) * (c.height || 0); if (a > area) { area = a; best = c; } }
    return best;
}

const json = async (url, body) => { const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return r.json(); };

/** While a session starts, answer an Apple TV's PIN with a prompt. Returns a stop function. */
export function watchPins(ask = (name) => window.prompt(`Enter the PIN shown on ${name}`)) {
    const seen = new Set(); let on = true;
    (async () => { while (on) { try { const s = await json("/tv/status"); for (const p of s.pins || []) if (!seen.has(p.id)) { seen.add(p.id); const pin = ask(p.name); if (pin) await json("/tv/pin", { id: p.id, pin: String(pin).trim() }); } } catch { /* the bridge will say */ } await new Promise((r) => setTimeout(r, 1000)); } })();
    return () => { on = false; };
}

/** A small list of the TVs tvpipe can see, under `anchor`; resolves to the name picked, or null. */
export async function pickTv(anchor) {
    const d = await json("/tv/devices");   // tvpipe's discovery; not installed, or no SDK, comes back as { ok: false, error } naming how to install it
    if (!d.ok) throw new Error(d.error || "tvpipe could not look for TVs");
    const list = [...(d.devices || []).filter((x) => x.video), { name: "browser", protocols: ["browser"], model: "a player page on this computer" }];
    return new Promise((resolve) => {
        const box = document.createElement("div"), r = anchor.getBoundingClientRect();
        Object.assign(box.style, { position: "fixed", left: Math.max(8, Math.min(window.innerWidth - 248, r.left)) + "px", top: Math.min(window.innerHeight - 40, r.bottom + 6) + "px", width: "240px", zIndex: 99999,
            background: "rgba(10,14,22,0.96)", border: "1px solid #2a3a52", borderRadius: "8px", padding: "6px", font: "12px system-ui, sans-serif", color: "#e8eefc" });
        const close = (v) => { box.remove(); removeEventListener("keydown", esc); resolve(v); }, esc = (e) => { if (e.key === "Escape") close(null); };
        const head = document.createElement("div"); head.textContent = list.length > 1 ? "Send to which TV?" : "No TVs found -- only this computer's player page:"; head.style.cssText = "padding:4px 6px;color:#8c98ad";
        box.appendChild(head);
        for (const dev of list) {
            const b = document.createElement("button"); b.type = "button";
            b.textContent = `${dev.name}${dev.protocols.length ? "  (" + dev.protocols.join(", ") + (dev.pin && !dev.paired ? ", asks for a PIN" : "") + ")" : ""}`;
            b.style.cssText = "display:block;width:100%;text-align:left;padding:6px;margin:2px 0;background:#141c28;color:inherit;border:1px solid #24304a;border-radius:6px;cursor:pointer";
            b.onclick = () => close(dev.name); box.appendChild(b);
        }
        const cancel = document.createElement("button"); cancel.type = "button"; cancel.textContent = "Cancel"; cancel.style.cssText = "margin-top:4px;padding:4px 8px;background:none;color:#8c98ad;border:none;cursor:pointer"; cancel.onclick = () => close(null);
        box.appendChild(cancel); document.body.appendChild(box); addEventListener("keydown", esc);
    });
}

/** Mirror this page to `to` (tvpipe's own browser renders it). */
export async function sharePage(to, url = location.href) {
    const stop = watchPins();
    try { const r = await json("/tv/share", { to, url }); if (!r.ok) throw new Error(r.error || "the TV did not start"); return r.session; } finally { stop(); }
}

/** Stop everything this bridge sends to a TV, and any live stream from this page. */
export async function stopTv() { if (_live) { _live.stop(); _live = null; } const r = await json("/tv/stop", {}); return r.stopped || []; }

let _live = null;
/** Stream `canvas` live to `to`. Resolves to a controller { stop(), stats() } once the TV is connected. */
export async function startLive(to, { canvas = pickCanvas(), fps = 30, bitrate = 6e6, socketUrl = null } = {}) {
    if (!canvas) throw new Error("this page has no <canvas> to send");
    if (typeof VideoEncoder === "undefined") throw new Error("this browser has no WebCodecs encoder (it needs a secure page: localhost or https)");
    if (_live) _live.stop();
    const { width, height } = liveSize(canvas.width, canvas.height);
    let config = null;
    for (const codec of CODECS) { const c = { codec, width, height, bitrate, framerate: fps, latencyMode: "realtime", avc: { format: "annexb" } }; try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch { /* next */ } }
    if (!config) throw new Error("this browser cannot encode H.264");
    const ws = new WebSocket(socketUrl || `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/tv/live`); ws.binaryType = "arraybuffer";
    const stopPins = watchPins();
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("the bridge's /tv/live socket did not open")); });
    const started = new Promise((res, rej) => { ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "started") res(m.session); else if (m.type === "error") rej(new Error(m.error)); }; ws.onclose = () => rej(new Error("the bridge closed the stream")); });
    ws.send(JSON.stringify({ type: "start", to, width, height, fps }));
    let session; try { session = await started; } finally { stopPins(); }
    // the frame is drawn into an even-sized canvas of the encoder's size, so any page canvas works
    const scratch = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height }), g = scratch.getContext("2d");
    const st = { frames: 0, sent: 0, keys: 0, skipped: 0, bytes: 0, ended: false, error: null, codec: config.codec, width, height, session };
    let wantKey = true, timer = 0;
    const enc = new VideoEncoder({ output: (chunk) => { const au = new Uint8Array(chunk.byteLength); chunk.copyTo(au); if (ws.readyState === 1) { ws.send(encodeLiveFrame(chunk.type === "key", chunk.timestamp, au)); st.sent++; if (chunk.type === "key") st.keys++; st.bytes += au.byteLength; } }, error: (e) => { st.error = String(e.message || e); stop(); } });
    enc.configure(config);
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "keyframe") wantKey = true; else if (m.type === "ended" || m.type === "error") { st.error = m.error || null; stop(); } };
    ws.onclose = () => stop();
    const t0 = performance.now();
    const tick = () => {
        if (st.ended) return;
        if (enc.encodeQueueSize > 2) { st.skipped++; return; }   // realtime: drop a frame rather than fall behind
        g.drawImage(canvas, 0, 0, width, height);
        const frame = new VideoFrame(scratch, { timestamp: Math.round((performance.now() - t0) * 1000) });
        enc.encode(frame, { keyFrame: wantKey || st.frames % (fps * 2) === 0 }); frame.close(); wantKey = false; st.frames++;
    };
    timer = setInterval(tick, 1000 / fps);
    function stop() { if (st.ended) return; st.ended = true; clearInterval(timer); try { enc.close(); } catch { /* closed */ } try { ws.close(); } catch { /* closed */ } if (_live === ctl) _live = null; }
    const ctl = { stop, stats: () => ({ ...st }) };
    _live = ctl; window.__tvLive = ctl;
    return ctl;
}
