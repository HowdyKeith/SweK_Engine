// WebGLEngine/ai-bridge/canvasBridge.js -- v(spike, task #92)
//
// SPIKE, NOT A FEATURE, for task #92. What was actually checked in this sandbox before this file was
// written, not taken on the package's own word: npm resolves a prebuilt native binary for this box
// with zero extra system packages (unlike @napi-rs/clipboard's spike in typeBridge.js, there was no
// X-server-style external dependency to fall back around -- Skia is fully bundled in the binary);
// createCanvas()+draw+toBuffer("image/png") was hand-verified by re-parsing the returned bytes' own
// PNG signature/IHDR rather than trusting the encoder's return value; and removing the installed
// native module (renamed out of node_modules, re-run, restored) degrades to an honest status() rather
// than an uncaught throw. There is no caller: server.js has no route for this file on purpose. Wiring
// one with nothing to call it would be scope creep past what task #92 asked for ("wire it in and
// prove it works").
//
// *** WHY THIS PACKAGE AND NOT "sharp" -- the name collision this task's own background note warns
// about: ai-bridge's existing sharpBridge.js is apple/ml-sharp (a Gaussian-splat PREDICTOR that shells
// out to a Python CLI), unrelated to image/canvas work despite the identical word. There is no image
// library named "sharp" wired into this tree before this file; @napi-rs/canvas is the first one. ***
//
// SAME DISCIPLINE AS typeBridge.js's @napi-rs/clipboard: optionalDependency, not dependency -- a
// tree/install missing it still boots. Lazily required and memoized so a missing/unbuildable native
// module is only ever attempted once, and every call after that skips straight to reporting `false`
// instead of re-running require() on the hot path.
"use strict";

let _canvasMod; // undefined = not yet tried, false = unavailable, module object = ready
function _canvas() {
    if (_canvasMod !== undefined) return _canvasMod;
    try { _canvasMod = require("@napi-rs/canvas"); }
    catch { _canvasMod = false; /* optional dep missing, or no prebuilt binary for this platform/arch/libc */ }
    return _canvasMod;
}

// PNG file signature, fixed by the spec (ISO/IEC 15948): 89 50 4E 47 0D 0A 1A 0A.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Hand-parse the PNG signature + IHDR chunk out of encoded bytes, independent of whatever the
 * encoder itself claims. IHDR is always the first chunk, at a fixed offset right after the
 * signature (length:4, type:4, width:4, height:4, big-endian), so no general PNG parser is needed
 * to pull the two fields worth checking. This is what proves toBuffer("image/png") produced a real,
 * correctly-sized PNG rather than merely "did not throw" -- the same bar this task's spike for
 * @napi-rs/clipboard held itself to (a live X11 call, not a trusted return value).
 */
function _readPngHeader(buf) {
    // *** ADVERSARIAL-REVIEW FIX (same session, this task's own review pass). *** The guard originally
    // read `buf.length < 24`, but the fields read below go up to and including offset 25 (colorType),
    // which needs length >= 26 -- a 24-25 byte buffer passed the guard and then threw an uncaught
    // RangeError out of readUInt8(24)/readUInt8(25), reproduced live against this exact function. The
    // real @napi-rs/canvas encoder never emits a PNG this small, so the bug never fired in this spike's
    // own testing -- exactly why an adversarial pass matters over trusting "it worked when I ran it".
    if (!Buffer.isBuffer(buf) || buf.length < 26) return { ok: false, error: "buffer too short to hold a PNG signature + IHDR" };
    if (!buf.slice(0, 8).equals(PNG_SIG)) return { ok: false, error: "missing PNG signature bytes" };
    if (buf.slice(12, 16).toString("ascii") !== "IHDR") return { ok: false, error: "first chunk is not IHDR" };
    return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf.readUInt8(24), colorType: buf.readUInt8(25) };
}

// Report whether the native module loaded, and which platform npm resolved a prebuilt binary for --
// same shape as typeBridge.js's `clipboard` field and sharpBridge.js's `sharpInstalled`/`invocation`,
// so a caller checking "is the optional native path up" reads the same shape across bridges.
function status() {
    const mod = _canvas();
    return {
        ok: true,
        platform: process.platform,
        arch: process.arch,
        available: !!mod,
        tool: mod ? "@napi-rs/canvas" : "unavailable",
        note: mod ? "" : "optional dependency @napi-rs/canvas is not installed, or has no prebuilt native binary for " +
                         process.platform + "-" + process.arch + " -- npm install into ai-bridge/ to enable server-side canvas rendering",
    };
}

/**
 * The ONE real, minimal exercise of the wiring: draw a couple of primitives, encode PNG, and hand
 * back the bytes plus the width/height read back OUT of those bytes via _readPngHeader() -- not the
 * width/height merely echoed back from the `width`/`height` arguments, so a caller can tell the
 * encode genuinely happened rather than trust two numbers that were never touched. Deliberately not
 * a general renderer: this is the spike proving the pipe works, not the feature that uses it.
 */
function renderPngSpike(width, height) {
    const w = Math.max(1, Math.min(4096, +width || 64));
    const h = Math.max(1, Math.min(4096, +height || 64));
    const mod = _canvas();
    if (!mod) return { ok: false, error: "canvas unavailable: " + status().note };

    let canvas, ctx, buf;
    try {
        canvas = mod.createCanvas(w, h);
        ctx = canvas.getContext("2d");
        ctx.fillStyle = "#202030";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#ffaa33";
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.min(w, h) / 3, 0, Math.PI * 2);
        ctx.fill();
        buf = canvas.toBuffer("image/png");
    } catch (e) {
        // A loaded module can still fail at draw/encode time (e.g. a corrupt Skia build) -- caught
        // separately from the require() above so that failure mode is reported honestly too, not
        // conflated with "the optional dependency isn't installed".
        return { ok: false, error: "draw/encode failed: " + String(e && e.message || e) };
    }

    // _readPngHeader is a diagnostic over untrusted encoder output -- it must never itself be the
    // thing that throws uncaught out of this function (the review pass that found the length-guard
    // bug above flagged this call site specifically for sitting outside the draw/encode try/catch).
    let hdr;
    try { hdr = _readPngHeader(buf); }
    catch (e) { return { ok: false, error: "PNG header parse threw: " + String(e && e.message || e), bytes: buf.length }; }
    if (!hdr.ok) return { ok: false, error: "encoder returned bytes that do not decode as PNG: " + hdr.error, bytes: buf.length };
    if (hdr.width !== w || hdr.height !== h)
        return { ok: false, error: "PNG header size mismatch -- asked for " + w + "x" + h + ", IHDR declares " + hdr.width + "x" + hdr.height, bytes: buf.length };

    return { ok: true, tool: "@napi-rs/canvas", width: hdr.width, height: hdr.height, bytes: buf.length, png: buf };
}

module.exports = { status, renderPngSpike };
