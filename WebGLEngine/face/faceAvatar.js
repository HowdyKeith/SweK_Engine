import { backoffDelay } from "../net/wsReconnect.js";
// FILE: face/faceAvatar.js
// VERSION: v1 - round 43o
//
// Standalone face avatar window. Connects to the engine's WebSocket
// bridge (same URL as the main page) and renders an animated SVG face
// that reacts to listener events.
//
// Supported expressions (matches Send-VoxelToast -Tama actions):
//   happy   — smile, raised brows, blush
//   sad     — frown, lowered brows
//   alert   — wide eyes, raised brows, neutral mouth, eye-flash
//   wave    — eyes scan side-to-side, mouth slight smile
//   feed    — open mouth, content brows
//   play    — wink + grin
//   sleep   — closed eyes (slits), Z over head
//   speak   — lip-flap animation while text shows
//
// Idle: subtle bob, periodic blink, neutral expression.
//
// Connection: ws://<host>:8787 (same as host that served this page).

const svg     = document.getElementById("face-svg");
const head    = document.getElementById("head");
const browL   = document.getElementById("brow-l");
const browR   = document.getElementById("brow-r");
const eyeL    = document.getElementById("eye-l");
const eyeR    = document.getElementById("eye-r");
const pupilL  = document.getElementById("pupil-l");
const pupilR  = document.getElementById("pupil-r");
const blushL  = document.getElementById("blush-l");
const blushR  = document.getElementById("blush-r");
const mouth   = document.getElementById("mouth");
const speakEl = document.getElementById("speak-text");
const emoLbl  = document.getElementById("emotion");
const stDot   = document.querySelector("#status .dot");
const stTxt   = document.getElementById("status-text");

// ---- Expression definitions ----------------------------------------------
// Each preset is a target state to ease toward.
const PRESETS = {
    neutral: {
        browL: "M -45 -35 L -20 -35",
        browR: "M 20 -35 L 45 -35",
        mouth: "M -22 28 Q 0 38 22 28",
        eyeRy: 14, pupilR: 6, blush: 0,
    },
    happy: {
        browL: "M -45 -38 L -20 -42",
        browR: "M 20 -42 L 45 -38",
        mouth: "M -28 22 Q 0 50 28 22",
        eyeRy: 11, pupilR: 5, blush: 0.6,
    },
    sad: {
        browL: "M -45 -42 L -20 -32",
        browR: "M 20 -32 L 45 -42",
        mouth: "M -22 35 Q 0 22 22 35",
        eyeRy: 13, pupilR: 6, blush: 0,
    },
    alert: {
        browL: "M -45 -45 L -20 -45",
        browR: "M 20 -45 L 45 -45",
        mouth: "M -16 30 L 16 30",
        eyeRy: 17, pupilR: 7, blush: 0,
    },
    wave: {
        browL: "M -45 -38 L -20 -38",
        browR: "M 20 -38 L 45 -38",
        mouth: "M -22 28 Q 0 36 22 28",
        eyeRy: 13, pupilR: 6, blush: 0.3,
    },
    feed: {
        browL: "M -45 -34 L -20 -36",
        browR: "M 20 -36 L 45 -34",
        mouth: "M -20 25 Q 0 50 20 25 Q 0 32 -20 25",     // ovalish open
        eyeRy: 11, pupilR: 5, blush: 0.4,
    },
    play: {
        browL: "M -45 -40 L -20 -40",
        browR: "M 20 -38 L 45 -42",
        mouth: "M -28 22 Q 0 46 28 22",
        eyeRy: 11, pupilR: 5, blush: 0.5,
    },
    sleep: {
        browL: "M -45 -32 L -20 -32",
        browR: "M 20 -32 L 45 -32",
        mouth: "M -14 30 Q 0 36 14 30",
        eyeRy: 2, pupilR: 0.5, blush: 0,
    },
    speak: {
        browL: "M -45 -36 L -20 -36",
        browR: "M 20 -36 L 45 -36",
        mouth: "M -22 28 Q 0 40 22 28",
        eyeRy: 13, pupilR: 6, blush: 0,
    },
};

// ---- State ---------------------------------------------------------------
let current = "neutral";
let target  = { ...PRESETS.neutral };
let cur     = { ...PRESETS.neutral, eyeRy_v: 14, pupilR_v: 6, blush_v: 0 };
let lastFrame = performance.now();
let bobPhase = 0;
let lastBlink = performance.now();
let blinkOpen = true;
let blinkCloseUntil = 0;
let speakUntil = 0;
let speakBaseRy = 14;

function setExpression(name, opts = {}) {
    if (!PRESETS[name]) { console.warn("[faceAvatar] unknown:", name); return; }
    current = name;
    target = { ...PRESETS[name] };
    emoLbl.textContent = `— ${name} —`;
    if (name === "speak" && opts.text) {
        speakEl.textContent = opts.text;
        speakEl.setAttribute("opacity", "1");
        speakUntil = performance.now() + Math.max(1500, opts.text.length * 80);
    }
    // alert: brief screen flash
    if (name === "alert") {
        head.setAttribute("fill", "#ffe89a");
        setTimeout(() => head.setAttribute("fill", "#ffd884"), 220);
    }
    // After 3s, ease back to neutral unless replaced
    clearTimeout(setExpression._t);
    if (name !== "neutral" && name !== "sleep") {
        setExpression._t = setTimeout(() => setExpression("neutral"), 3500);
    }
}

// ---- Animation loop ------------------------------------------------------
function tick() {
    const now = performance.now();
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;

    // Ease numeric props toward target
    const k = 1 - Math.pow(0.001, dt);   // critically damped-ish
    cur.eyeRy_v  += (target.eyeRy  - cur.eyeRy_v)  * k;
    cur.pupilR_v += (target.pupilR - cur.pupilR_v) * k;
    cur.blush_v  += (target.blush  - cur.blush_v)  * k;

    // Snap path-based props (no interpolation between SVG paths; just swap)
    if (cur.browL !== target.browL) { browL.setAttribute("d", target.browL); cur.browL = target.browL; }
    if (cur.browR !== target.browR) { browR.setAttribute("d", target.browR); cur.browR = target.browR; }
    if (cur.mouth !== target.mouth) { mouth.setAttribute("d", target.mouth); cur.mouth = target.mouth; }

    // Eye openness (blink override)
    let eyeRy = cur.eyeRy_v;
    if (now < blinkCloseUntil) eyeRy = 1;
    eyeL.setAttribute("ry", eyeRy.toFixed(2));
    eyeR.setAttribute("ry", eyeRy.toFixed(2));
    pupilL.setAttribute("r", cur.pupilR_v.toFixed(2));
    pupilR.setAttribute("r", cur.pupilR_v.toFixed(2));

    // Blush
    blushL.setAttribute("opacity", cur.blush_v.toFixed(2));
    blushR.setAttribute("opacity", cur.blush_v.toFixed(2));

    // Idle bob
    bobPhase += dt * 1.8;
    const bob = Math.sin(bobPhase) * 4;
    svg.style.transform = `translateY(${bob.toFixed(1)}px)`;

    // Periodic blink
    if (now > lastBlink + 2500 + Math.random() * 2000) {
        blinkCloseUntil = now + 120;
        lastBlink = now;
    }

    // Speak lip-flap
    if (now < speakUntil && current === "speak") {
        const flap = 28 + Math.sin(now * 0.02) * 12;
        mouth.setAttribute("d", `M -22 28 Q 0 ${flap} 22 28`);
    } else if (current === "speak" && now >= speakUntil) {
        speakEl.setAttribute("opacity", "0");
    }

    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// v522 — overlay the live phone camera over the avatar face (full-bleed). v523:
// auto-clears back to the SVG face ~2.5s after frames stop arriving.
let _camFace = null, _camFaceTimer = null;
function showCamOnFace(dataUrl) {
    if (typeof document === "undefined") return;
    if (!_camFace) {
        _camFace = document.createElement("img");
        Object.assign(_camFace.style, { position: "fixed", inset: "0", width: "100%", height: "100%", objectFit: "cover", zIndex: "50", borderRadius: "inherit", transition: "opacity .4s" });
        document.body.appendChild(_camFace);
    }
    _camFace.src = dataUrl;
    _camFace.style.opacity = "1";
    _camFace.style.display = "block";
    clearTimeout(_camFaceTimer);
    _camFaceTimer = setTimeout(() => {            // frames stopped → fade back to the face
        if (_camFace) { _camFace.style.opacity = "0"; setTimeout(() => { if (_camFace) _camFace.style.display = "none"; }, 450); }
    }, 2500);
}

// ---- WebSocket connection ------------------------------------------------
let _faceWsAttempt = 0;   // v1345 — jittered-backoff reconnect attempt counter
function connect() {
    const url = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host;
    let ws;
    try { ws = new WebSocket(url); }
    catch (e) {
        stTxt.textContent = "connection error";
        setTimeout(connect, backoffDelay(_faceWsAttempt++));
        return;
    }
    ws.addEventListener("open", () => {
        stDot.classList.add("on");
        stTxt.textContent = `connected ${url}`;
        _faceWsAttempt = 0;
    });
    ws.addEventListener("close", () => {
        stDot.classList.remove("on");
        stTxt.textContent = "disconnected — retrying";
        setTimeout(connect, backoffDelay(_faceWsAttempt++));
    });
    ws.addEventListener("error", () => {
        stDot.classList.remove("on");
        stTxt.textContent = "error";
    });
    ws.addEventListener("message", (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === "tama") {
            setExpression(m.action ?? "neutral", { text: m.text });
        } else if (m.type === "toast") {
            // Map toast type loosely to face
            const map = { error: "sad", warn: "alert", success: "happy", info: "wave", system: "neutral" };
            setExpression(map[m.type] ?? "neutral");
        } else if (m.type === "phoneCam" && m.data) {
            showCamOnFace(m.data);   // v522 — live phone camera over the avatar face
        }
    });
}
connect();

// Round 257 — listen for postMessage from parent window (PipAvatar).
// When this page is embedded as an iframe with ?voice=M2, only react
// to messages whose voice matches. This lets the engine drive two
// separate PIP avatars (M1 + M2) from the same kpop.speak pipeline.
const _myVoice = (() => {
    try { return new URLSearchParams(window.location.search).get("voice") || null; }
    catch { return null; }
})();
window.addEventListener("message", (e) => {
    const m = e?.data;
    if (!m || typeof m !== "object" || !m.type) return;
    if (_myVoice && m.voice && m.voice !== _myVoice) return;
    if (m.type === "kpop:speak") {
        const action = m.action || "speak";
        setExpression(action, { text: m.text });
        // After durationMs, return to neutral
        if (m.durationMs) {
            clearTimeout(window._kpopReturnTimer);
            window._kpopReturnTimer = setTimeout(() => setExpression("neutral"), m.durationMs);
        }
    } else if (m.type === "kpop:expression") {
        setExpression(m.action || "neutral");
    }
});

// Click on face to cycle for testing without a listener attached
let cycleIdx = 0;
const CYCLE = ["happy", "sad", "alert", "wave", "feed", "play", "sleep", "neutral"];
svg.addEventListener("click", () => {
    setExpression(CYCLE[cycleIdx]);
    cycleIdx = (cycleIdx + 1) % CYCLE.length;
});
