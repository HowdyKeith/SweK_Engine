// ai-bridge/brainCommentary.js -- the brain, described out loud.
//
// "Could it be a caption of a visual snapshot of the GPU brain?" -- yes, and almost all of it was already here, which
// is the nicest kind of round. geminiCommentator.js already grabs a frame and asks Gemini Vision to call what it sees;
// it was pointed at the kaiju spectator feed. /ai/brain/narrate already speaks a line. The brain already POSTs its
// state to /ai/brain/snapshot. This is the wire between them: a SECOND commentator, watching the brain instead of the
// battle, whose lines come out of the blob narrator's carved mouth.
//
// Two things it captions, and the difference is deliberate:
//   - the FRAME: whatever the brain pages (brain-3d, brain-quadrants, brain-maze) post of themselves. Gemini Vision
//     looks at the actual flow field and says what it sees. Needs a key and a browser rendering somewhere -- RIG.
//   - the STATE: the numbers the brain already posts to /ai/brain/snapshot. No key, no vision, no network. This is
//     the honest floor: with nothing configured at all, the brain can still say something true about itself, because
//     the truth is already in the JSON.
//
// It never blocks. No key, no frame, no network -- the caption falls back to the state line, and if there is no state
// either it says nothing at all rather than inventing something. A narrator that makes things up is worse than a quiet one.
"use strict";

const MAX_FRAME = 3 * 1024 * 1024;
const STALE_MS = 20000;

// The frame store: the brain pages post their own canvas here, exactly as the spectator feed does.
function makeFrameStore(opts = {}) {
    const staleMs = opts.staleMs == null ? STALE_MS : opts.staleMs;
    const now = opts._now || (() => Date.now());
    let frame = null, at = 0, from = null;
    function put(buf, meta = {}) {
        if (!buf || !buf.length) return { ok: false, reason: "empty frame" };
        if (buf.length > MAX_FRAME) return { ok: false, reason: "frame too large" };
        frame = buf; at = now(); from = meta.from || null;
        return { ok: true, bytes: buf.length, from };
    }
    // a stale frame is worse than none: it would have Gemini confidently describing a brain that has moved on
    function get() { if (!frame) return null; if (now() - at > staleMs) return null; return frame; }
    return { put, get, get age() { return frame ? now() - at : Infinity; }, get from() { return from; }, get bytes() { return frame ? frame.length : 0; } };
}

// The honest floor: a true sentence about the brain, built only from the numbers it already posts. No key required.
function stateLine(snap) {
    if (!snap || typeof snap !== "object") return "";
    const bits = [];
    const n = (v) => typeof v === "number" && Number.isFinite(v);
    if (n(snap.solves)) bits.push(snap.solves > 0 ? "solved " + snap.solves + " field" + (snap.solves === 1 ? "" : "s") : "idle, nothing to solve yet");
    if (n(snap.agents)) bits.push(snap.agents + " agent" + (snap.agents === 1 ? "" : "s") + " on the field");
    if (n(snap.quadrants)) bits.push(snap.quadrants + " quadrants packed into one dispatch");
    if (snap.backend) bits.push("running on " + String(snap.backend).slice(0, 24));
    if (n(snap.ms)) bits.push("last solve " + snap.ms.toFixed(1) + "ms");
    if (!bits.length) return "";
    return "The brain: " + bits.join(", ") + ".";
}

const PERSONA = "You are looking at a live visualisation of a GPU neural brain: flow fields, quadrant tiles and the "
    + "agents steering by them. In ONE short sentence, plainly and without hype, say what the field is doing right now. "
    + "No preamble, no markdown, under 20 words.";

// The commentator, pointed at the brain. `commentator` is injected so this is testable without a key or a network.
function makeBrainCommentary(opts = {}) {
    const frames = opts.frames || makeFrameStore({ _now: opts._now });
    const getSnapshot = opts.getSnapshot || (() => null);
    const speak = opts.speak || (() => {});
    const createCommentator = opts.createCommentator || null;
    let last = "", lastSource = "none", live = null;
    function fallback() { return stateLine(getSnapshot()); }   // always true, never invented
    // one caption. Vision when it can, the brain's own numbers when it cannot, silence when it has nothing.
    async function caption() {
        const frame = frames.get();
        if (frame && live && typeof live.once === "function") {
            try { const t = await live.once(frame, PERSONA);
                if (t && String(t).trim()) { last = String(t).trim(); lastSource = "vision"; speak(last, "vision"); return { text: last, source: "vision" }; } }
            catch (e) { /* rate limited, no key, offline -- fall through to the truth we already hold */ }
        }
        const s = fallback();
        if (s) { last = s; lastSource = "state"; speak(s, "state"); return { text: s, source: "state" }; }
        lastSource = "none";
        return { text: "", source: "none" };   // it says nothing rather than making something up
    }
    function attach(commentator) { live = commentator; return live; }
    if (createCommentator) live = createCommentator({ getFrame: () => frames.get(), broadcast: (m) => speak(m && m.text, "vision") });
    return { frames, caption, attach, stateLine: fallback, PERSONA, get last() { return last; }, get source() { return lastSource; } };
}
// ---- routes ----
//   POST /ai/brain/frame    <- a brain page posts its own canvas (image/jpeg). Body is raw bytes.
//   GET  /ai/brain/caption  -> { text, source: "vision"|"state"|"none", age, from }
// Registered BEFORE gpuBrainBridge, which owns the /ai/brain prefix and would swallow these silently -- the v2155 trap.
const ROUTE_FRAME = "/ai/brain/frame", ROUTE_CAPTION = "/ai/brain/caption";
let _singleton = null;
function attachRoutes(opts = {}) {
    _singleton = _singleton || makeBrainCommentary(opts);
    return _singleton;
}
function handle(req, res, url, body) {
    const p = String(url || "").split("?")[0];
    const bc = _singleton;
    if (!bc) return false;
    const json = (code, o) => { try { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); } catch {} return true; };
    if (p === ROUTE_FRAME && req.method === "POST") {
        const buf = Buffer.isBuffer(body) ? body : Buffer.from(body || "", "binary");
        const r = bc.frames.put(buf, { from: (req.headers && req.headers["x-swek-from"]) || null });
        return json(r.ok ? 200 : 413, r);
    }
    if (p === ROUTE_CAPTION && req.method === "GET") {
        return bc.caption().then(c => json(200, { ...c, age: bc.frames.age, from: bc.frames.from })).catch(() => json(200, { text: "", source: "none" })), true;
    }
    return false;
}
module.exports = { makeBrainCommentary, makeFrameStore, stateLine, PERSONA, MAX_FRAME, attachRoutes, handle, ROUTE_FRAME, ROUTE_CAPTION };
