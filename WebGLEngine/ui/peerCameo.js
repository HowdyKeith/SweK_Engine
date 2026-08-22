// ui/peerCameo.js — v1613
//
// Visiting-avatar CAMEO for peer announcements. Subscribes to the engine's avatar-event SSE stream
// (GET /avatar/events) and, when a peer broadcasts an announcement (kind:"announce" — e.g. a box that's
// low on disk), a little visitor figure walks in from the right, shows the announcer's NAME + MESSAGE in
// a speech bubble, speaks it (best-effort TTS), then walks off.
//
//   - kind === "disk" (or a "jump" gesture): the visitor is RED and FRANTIC — jumping + waving — so an
//     out-of-space peer (or any alarm) is impossible to miss.
//   - any other kind: a calm blue visitor with a friendly wave.
//
// This is received-only (the bridge only emits kind:"announce" when it RECEIVES one from a peer, never for
// what this box sends), so no self-filtering is needed. It also generalizes: this is the engine's remote-
// alert surface — any future peer alert kind rides the same path.
//
//   window.peerCameo.test()        preview a fake disk alert
//   window.peerCameo.test("info")  preview a calm one
//   window.peerCameo.mute(true)    silence the spoken line (visual still plays)

let _es = null, _layer = null, _style = null, _busy = false, _muted = false;
const _queue = [];
const _seen = new Set();   // announcement ids already played (dedup re-broadcasts)

function _injectStyle() {
    if (_style) return;
    _style = document.createElement("style");
    _style.textContent = `
@keyframes swekCameoIn   { from { transform: translateX(60vw); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes swekCameoOut  { from { transform: translateX(0); opacity: 1; } to { transform: translateX(60vw); opacity: 0; } }
@keyframes swekCameoBob   { 0%,100%{ transform: translateY(0) rotate(0deg);} 50%{ transform: translateY(-3px) rotate(0deg);} }
@keyframes swekCameoFrantic{ 0%,100%{ transform: translateY(0) rotate(-3deg);} 22%{ transform: translateY(-20px) rotate(4deg);} 50%{ transform: translateY(0) rotate(-5deg);} 74%{ transform: translateY(-13px) rotate(3deg);} }
@keyframes swekCameoWave   { 0%,100%{ transform: rotate(-18deg);} 50%{ transform: rotate(-58deg);} }
@keyframes swekCameoFlail  { 0%,100%{ transform: rotate(-30deg);} 50%{ transform: rotate(-160deg);} }
@keyframes swekCameoRed    { 0%,100%{ filter: drop-shadow(0 0 4px rgba(255,50,50,0.55));} 50%{ filter: drop-shadow(0 0 17px rgba(255,40,40,0.95));} }
@keyframes swekCameoPop    { from { opacity:0; transform: translateY(10px) scale(0.92);} to { opacity:1; transform: translateY(0) scale(1);} }
`;
    document.head.appendChild(_style);
}

// A small, expressive humanoid. `alarm` => red body + a frantic flailing right arm; else cyan + a calm wave.
function _figureSVG(alarm) {
    const skin = alarm ? "#ff4d4d" : "#39c6ff";
    const dark = alarm ? "#a31515" : "#1b6f96";
    const waveAnim = alarm ? "swekCameoFlail 0.32s ease-in-out infinite" : "swekCameoWave 0.7s ease-in-out infinite";
    return `
<svg width="86" height="120" viewBox="0 0 86 120" xmlns="http://www.w3.org/2000/svg" style="overflow:visible;">
  <ellipse cx="43" cy="116" rx="22" ry="5" fill="rgba(0,0,0,0.35)"/>
  <!-- legs -->
  <rect x="33" y="74" width="8" height="34" rx="4" fill="${dark}"/>
  <rect x="45" y="74" width="8" height="34" rx="4" fill="${dark}"/>
  <!-- body -->
  <rect x="26" y="40" width="34" height="42" rx="12" fill="${skin}"/>
  <!-- left (static) arm -->
  <rect x="18" y="46" width="8" height="26" rx="4" fill="${skin}" transform="rotate(14 22 49)"/>
  <!-- right (waving) arm — pivots at the shoulder -->
  <g style="transform-origin: 60px 49px; animation:${waveAnim};">
    <rect x="58" y="44" width="8" height="26" rx="4" fill="${skin}"/>
    <circle cx="62" cy="42" r="5" fill="${skin}"/>
  </g>
  <!-- head -->
  <circle cx="43" cy="26" r="17" fill="${skin}"/>
  <circle cx="37" cy="24" r="3.2" fill="#06121c"/>
  <circle cx="49" cy="24" r="3.2" fill="#06121c"/>
  ${alarm
    ? '<path d="M36 34 Q43 28 50 34" stroke="#06121c" stroke-width="2.4" fill="none"/><path d="M31 17 L41 21 M55 17 L45 21" stroke="#06121c" stroke-width="2.2"/>'
    : '<path d="M36 32 Q43 38 50 32" stroke="#06121c" stroke-width="2.4" fill="none"/>'}
</svg>`;
}

function _speak(text) {
    if (_muted || !text) return;
    try { if (window.btts && typeof window.btts.speak === "function") { window.btts.speak(String(text).slice(0, 240)); return; } } catch {}
    try {
        if (window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined") {
            const u = new SpeechSynthesisUtterance(String(text).slice(0, 240));
            u.rate = 1.05; u.pitch = 1.0;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(u);
        }
    } catch {}
}

function _esc(s) { return String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }

// Text banner used when the REAL 3D stage performs the visit (the 3D avatars can't show the message text).
function _banner(ann, alarm) {
    if (!_layer) return;
    const accent = alarm ? "#ff5a5a" : "#5ad6ff";
    const b = document.createElement("div");
    Object.assign(b.style, {
        position: "absolute", left: "50%", top: "64px", transform: "translateX(-50%)", maxWidth: "360px",
        background: "rgba(8,14,24,0.94)", color: "#eaf4ff", border: "1px solid " + accent, borderRadius: "12px",
        padding: "9px 14px", font: "12px ui-monospace, Consolas, monospace", lineHeight: "1.4", textAlign: "center",
        boxShadow: "0 6px 22px rgba(0,0,0,0.5)", animation: "swekCameoPop 0.4s ease both", pointerEvents: "none",
    });
    b.innerHTML = "<div style='font-weight:bold;color:" + accent + ";margin-bottom:3px;'>" + (alarm ? "\u26A0\uFE0F " : "\uD83D\uDCE3 ") + _esc(ann.fromName || "a peer") + "</div>" + _esc(ann.text || "");
    _layer.appendChild(b);
    setTimeout(() => { b.style.transition = "opacity .5s"; b.style.opacity = "0"; setTimeout(() => { try { b.remove(); } catch {} }, 520); }, alarm ? 7800 : 6000);
}

function _play(ann) {
    return new Promise((resolve) => {
        if (!_layer) return resolve();
        const alarm = (ann.annKind === "disk") || (Array.isArray(ann.gestures) && ann.gestures.indexOf("jump") >= 0);
        // v1614 — prefer the REAL 3D stage when it can host a visitor (guest/duo: the visitor walks in;
        // studio: it's already standing by). It returns false in single-avatar scenes (e.g. diorama), so we
        // fall through to the self-contained 2D overlay below.
        let used3D = false;
        try { if (window._stage && typeof window._stage.peerVisit === "function") used3D = !!window._stage.peerVisit({ alarm, durationMs: alarm ? 9000 : 6500, talkMs: 4500, peer: ann.fromName || ann.from, avatarUrl: ann.avatar }); } catch {}
        if (used3D) {
            _banner(ann, alarm);
            setTimeout(() => _speak((ann.fromName ? ann.fromName + " says: " : "") + (ann.text || "")), 500);
            setTimeout(resolve, alarm ? 9000 : 6500);
            return;
        }
        const accent = alarm ? "#ff5a5a" : "#5ad6ff";

        const stage = document.createElement("div");
        Object.assign(stage.style, {
            position: "absolute", right: "5%", bottom: "12px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "8px",
            animation: "swekCameoIn 0.8s cubic-bezier(.2,.8,.2,1) both",
            pointerEvents: "none",
        });

        // speech bubble
        const bubble = document.createElement("div");
        Object.assign(bubble.style, {
            maxWidth: "320px", background: "rgba(8,14,24,0.94)", color: "#eaf4ff",
            border: "1px solid " + accent, borderRadius: "12px", padding: "8px 12px",
            font: "12px ui-monospace, Consolas, monospace", lineHeight: "1.4",
            boxShadow: "0 6px 22px rgba(0,0,0,0.5)", textAlign: "center",
            animation: "swekCameoPop 0.4s ease 0.5s both",
        });
        const who = document.createElement("div");
        who.style.cssText = "font-weight:bold;color:" + accent + ";margin-bottom:3px;";
        who.textContent = (alarm ? "\u26A0\uFE0F " : "\uD83D\uDCE3 ") + (ann.fromName || "a peer");
        const msg = document.createElement("div");
        msg.textContent = ann.text || (alarm ? "is low on disk space!" : "says hi!");
        bubble.append(who, msg);

        // figure (walk bob + jump/frantic applied to an inner wrapper so walk-in stays clean)
        const figWrap = document.createElement("div");
        figWrap.style.animation = (alarm ? "swekCameoFrantic 0.5s ease-in-out 0.85s infinite" : "swekCameoBob 0.6s ease-in-out 0.85s infinite");
        const fig = document.createElement("div");
        fig.innerHTML = _figureSVG(alarm);
        if (alarm) fig.style.animation = "swekCameoRed 0.45s ease-in-out infinite";
        figWrap.appendChild(fig);

        stage.append(bubble, figWrap);
        _layer.appendChild(stage);

        // speak shortly after the bubble pops
        setTimeout(() => _speak((ann.fromName ? ann.fromName + " says: " : "") + (ann.text || "")), 700);

        // hold, then walk off + clean up
        const HOLD = alarm ? 8200 : 6200;
        setTimeout(() => {
            stage.style.animation = "swekCameoOut 0.8s ease-in both";
            setTimeout(() => { try { stage.remove(); } catch {} resolve(); }, 820);
        }, HOLD);
    });
}

async function _drain() {
    if (_busy) return;
    _busy = true;
    try { while (_queue.length) { const a = _queue.shift(); await _play(a); } }
    finally { _busy = false; }
}

function _onAnnounce(ann) {
    if (!ann) return;
    const id = ann.id || (ann.fromName + "|" + ann.text + "|" + ann.ts);
    if (_seen.has(id)) return;
    _seen.add(id);
    if (_seen.size > 200) { _seen.clear(); _seen.add(id); }
    _queue.push(ann);
    if (_queue.length > 5) _queue.splice(0, _queue.length - 5);   // don't back up forever
    _drain();
}

function _connect() {
    try {
        if (_es) { try { _es.close(); } catch {} }
        _es = new EventSource("/avatar/events");
        _es.onmessage = (e) => { try { const d = JSON.parse(e.data); if (d && d.kind === "announce") _onAnnounce(d); } catch {} };
        _es.onerror = () => { /* EventSource auto-reconnects; nothing to do */ };
    } catch (e) { try { console.warn("[peerCameo] SSE connect failed:", e && e.message); } catch {} }
}

export function mountPeerCameo() {
    if (_layer) return;
    _injectStyle();
    _layer = document.createElement("div");
    _layer.id = "swekPeerCameo";
    Object.assign(_layer.style, {
        position: "fixed", inset: "0", zIndex: "9200", pointerEvents: "none", overflow: "hidden",
    });
    document.body.appendChild(_layer);
    _connect();
    try {
        window.peerCameo = {
            test: (kind) => _onAnnounce({ id: "test" + Date.now(), fromName: (kind === "info" ? "DESKTOP-NEIGHBOR" : "DESKTOP-40"), annKind: (kind === "info" ? "info" : "disk"), text: (kind === "info" ? "Hello from your peer engine!" : "I'm out of disk space \u2014 asset sync to me will pause!"), gestures: (kind === "info" ? ["wave", "speak"] : ["wave", "speak", "jump"]), ts: Date.now() }),
            // v1617 — fire a cameo from an EXTERNALLY-received announce (e.g. a remote peer over the WebRTC data
            // channel). Stamps an id if missing so the dedup doesn't drop it.
            inject: (ann) => { try { ann = ann || {}; if (!ann.id) ann.id = "ext" + Date.now(); _onAnnounce(ann); } catch {} },
            mute: (v) => { _muted = !!v; return _muted; },
            _layer: () => _layer,
        };
    } catch {}
    try { console.log("[peerCameo] visiting-avatar cameo ready \u2014 window.peerCameo.test() to preview"); } catch {}
}
