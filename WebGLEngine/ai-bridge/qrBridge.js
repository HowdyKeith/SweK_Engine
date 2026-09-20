// WebGLEngine/ai-bridge/qrBridge.js
//
// The LOCAL, server-side QR renderer wired behind fabric.html's HOP 3 "remote viewer" button. Before
// this file, that button's click handler built its QR by calling an EXTERNAL THIRD-PARTY SERVICE
// (api.qrserver.com), sending the user's live tunnel URL over the network to a stranger's server just
// to draw a QR code image -- a real privacy/reliability gap, and a mismatch with this tree's own
// local-first ethos (local whisper.cpp instead of cloud STT, local Ollama instead of cloud LLM cleanup
// -- see whisperBridge.js's header for the same ethos in its own words).
//
// NO NEW QR-ENCODING LOGIC: this reuses, unmodified, the exact vendored MIT QR encoder
// ui/phoneConnectQR.js already uses browser-side (ui/vendor/qrcode.mjs, Kazuhiko Arase's
// qrcode-generator -- `qrcode(0, "M"); qr.addData(url); qr.make();` mirrors that file's own
// construction exactly). The only new work is feeding its public renderTo2dContext(ctx, cellSize) --
// which draws via plain context.fillStyle/context.fillRect, so it does not care what kind of
// Canvas2D-compatible context it's handed -- into a canvas from @napi-rs/canvas instead of a browser
// <canvas> element.
//
// qrcode.mjs is an ES module (`export const qrcode = ...`); this file is CommonJS. Reached with a
// dynamic import(), the same technique exportBridge.js already uses to pull tools/export/captureLive.mjs
// into a CommonJS bridge (`const capMod = await import("../tools/export/captureLive.mjs");`).
//
// OWN memoized singleton for @napi-rs/canvas -- deliberately NOT reused from canvasBridge.js's private
// _canvasMod. require("@napi-rs/canvas") directly, mirroring canvasBridge.js's own _canvas() pattern:
// Node's require() cache means this does not double-load the native module, and it keeps this file
// independently correct/testable the same way typeBridge.js and canvasBridge.js don't reach into each
// other's internals.
//
// *** LINEAGE NOTE -- READ BEFORE TOUCHING renderQrPng(): *** a verification helper called OUTSIDE its
// caller's try/catch is a bug class this same session already found and fixed TWICE: once in
// canvasBridge.js's own _readPngHeader() (a too-short buffer threw an uncaught RangeError past the
// caller's catch) and once in webcodecsBridge.js's _verifyMp4()/_walkBoxes() (a truncated 64-bit box
// size sentinel did the same). Every fallible step below -- canvas creation, the draw, the pixel
// readback+verification, and the PNG encode -- has its OWN try/catch with an honest { ok:false }
// return. Do not let this file be the third repeat of that bug.
"use strict";

let _canvasMod; // undefined = not yet tried, false = unavailable, module object = ready
function _canvas() {
    if (_canvasMod !== undefined) return _canvasMod;
    try { _canvasMod = require("@napi-rs/canvas"); }
    catch { _canvasMod = false; /* optional dep missing, or no prebuilt binary for this platform/arch/libc */ }
    return _canvasMod;
}

// Report whether the native module loaded -- same shape as canvasBridge.js's own status(), so a caller
// checking "is the optional native canvas path up" reads the same shape from either bridge.
function status() {
    const mod = _canvas();
    return {
        ok: true,
        platform: process.platform,
        arch: process.arch,
        available: !!mod,
        tool: mod ? "@napi-rs/canvas" : "unavailable",
        note: mod ? "" : "optional dependency @napi-rs/canvas is not installed, or has no prebuilt native binary for " +
                         process.platform + "-" + process.arch + " -- npm install into ai-bridge/ to enable local " +
                         "server-side QR rendering (fabric.html's HOP 3 falls back to the external api.qrserver.com " +
                         "QR service automatically until then)",
    };
}

// Bound the INPUT length before ever calling addData(), not the output QR "version" -- qrcode(0, ...)
// means "auto-pick the smallest version that fits the data", so an attacker-controlled arbitrarily long
// `data` string is exactly what would otherwise drive an arbitrarily large matrix and therefore an
// arbitrarily large canvas. 2000 chars is generous for any real URL and rejected (not silently
// truncated -- truncating a URL can turn it into a different, still-plausible-looking URL) with an
// honest error.
const MAX_DATA_LEN = 2000;

// Target the QR matrix's own footprint at roughly 300-400px, derived from getModuleCount() once the
// encoder has run, and clamp the per-module cell size so neither a tiny (near-illegible) nor a huge
// (needlessly large PNG) render comes out the other end. Verified empirically: even at MAX_DATA_LEN
// (moduleCount=169 for 2000 'x' chars at level M) this keeps cellSize>=MIN_CELL and the total PNG in the
// low hundreds of px, not a page's worth of canvas.
const TARGET_QR_PX = 320;
const MIN_CELL = 2, MAX_CELL = 10;

let _qrcodeMod; // memoized dynamic import() of the vendored ES module encoder -- same shape as loadQR() in ui/phoneConnectQR.js
async function _qrcode() {
    if (_qrcodeMod) return _qrcodeMod;
    const mod = await import("../ui/vendor/qrcode.mjs");
    _qrcodeMod = mod.qrcode || mod.default;
    return _qrcodeMod;
}

// PNG file signature, fixed by the spec (ISO/IEC 15948): 89 50 4E 47 0D 0A 1A 0A. Own copy, not
// reached into canvasBridge.js's private PNG_SIG -- see the file header on why this file doesn't share
// internals with canvasBridge.js.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Hand-parse the PNG signature + IHDR chunk out of encoded bytes, independent of whatever the encoder
 * itself claims -- the same technique as canvasBridge.js's _readPngHeader() (IHDR is always the first
 * chunk, at a fixed offset right after the signature: length:4, type:4, width:4, height:4, big-endian),
 * re-derived here rather than imported so this file has no dependency on canvasBridge.js's internals.
 * The length guard is >= 26 from the start (not the too-short 24 canvasBridge.js's own review caught),
 * since the fields read below go up to and including offset 25 (colorType).
 */
function _readPngHeader(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 26) return { ok: false, error: "buffer too short to hold a PNG signature + IHDR" };
    if (!buf.slice(0, 8).equals(PNG_SIG)) return { ok: false, error: "missing PNG signature bytes" };
    if (buf.slice(12, 16).toString("ascii") !== "IHDR") return { ok: false, error: "first chunk is not IHDR" };
    return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bitDepth: buf.readUInt8(24), colorType: buf.readUInt8(25) };
}

/**
 * Independently re-check that the canvas actually drew the matrix the encoder computed -- not merely
 * that draw+encode didn't throw. Reads pixels back out of ctx.getImageData() (never trusting
 * toBuffer()'s own return) and spot-checks module centers against qr.isDark(row, col): the three
 * position-probe (finder pattern) corners, which the QR spec fixes as solid dark, PLUS a timing-pattern
 * module and a data-bearing module read generically through isDark() rather than assumed dark/light --
 * so this also catches a color-inversion or off-by-one draw bug in the ordinary data area, not only in
 * the fixed patterns. Same bar canvasBridge.js's _readPngHeader() and webcodecsBridge.js's _verifyMp4()
 * already hold themselves to in this session: independent verification of encoder output, not just
 * "no exception".
 */
function _verifyPixels(imageData, qr, moduleCount, cellSize, margin) {
    const centerOf = (row, col) => ({
        x: margin + col * cellSize + (cellSize >> 1),
        y: margin + row * cellSize + (cellSize >> 1),
    });
    const sampleIsDark = (row, col) => {
        const { x, y } = centerOf(row, col);
        const i = (y * imageData.width + x) * 4;
        const r = imageData.data[i], g = imageData.data[i + 1], b = imageData.data[i + 2];
        return r < 128 && g < 128 && b < 128; // renderTo2dContext fills pure 'black'/'white' only
    };
    const checks = [
        ["top-left finder", 3, 3],
        ["top-right finder", 3, moduleCount - 4],
        ["bottom-left finder", moduleCount - 4, 3],
        ["timing module", 6, 8],
        ["data module", moduleCount >> 1, moduleCount >> 1],
    ];
    for (const [label, row, col] of checks) {
        const expected = qr.isDark(row, col);
        const drawn = sampleIsDark(row, col);
        if (expected !== drawn) return { ok: false, mismatch: label, row, col, expected, drawn };
    }
    return { ok: true, checked: checks.length };
}

/**
 * Render `data` to a PNG QR code entirely server-side: the same vendored encoder ui/phoneConnectQR.js
 * uses in the browser, drawn via its own public renderTo2dContext(ctx, cellSize) onto an
 * @napi-rs/canvas 2D context, PNG-encoded, and independently pixel-verified before returning.
 *
 * Returns { ok:true, png: Buffer, moduleCount, cellSize, width, height } or { ok:false, error }.
 * Every fallible step (encode, canvas creation, draw, pixel readback+verification, PNG encode, PNG
 * header re-parse) is in its own try/catch -- see the file header's lineage note.
 */
async function renderQrPng(data, opts = {}) {
    // *** ADVERSARIAL-REVIEW FIX (same session, this task's own review pass, found independently by TWO
    // review lenses). *** `opts = {}` as a default parameter only covers the argument being omitted or
    // literally `undefined` -- an explicit `opts: null` still reaches `opts.cellSize` below and throws.
    // Normalized here rather than trusting the default alone.
    opts = opts || {};

    const mod = _canvas();
    if (!mod) return { ok: false, error: "canvas unavailable: " + status().note };

    // *** ADVERSARIAL-REVIEW FIX, continued. *** The file's own header lineage note claims every fallible
    // step below has its own try/catch -- this coercion was the one step that didn't: an adversarial
    // `data` argument with a throwing `toString()` propagated as an uncaught rejection instead of the
    // documented { ok:false, error } shape, a real (if not currently reachable -- the wired /qr.png route
    // only ever passes a plain string) violation of this exported function's own contract.
    let str;
    try { str = String(data == null ? "" : data).trim(); }
    catch (e) { return { ok: false, error: "invalid data input: " + String(e && e.message || e) }; }
    if (!str) return { ok: false, error: "no data to encode" };
    if (str.length > MAX_DATA_LEN) return { ok: false, error: "data too long (" + str.length + " chars, max " + MAX_DATA_LEN + ")" };

    let qr;
    try {
        const qrcode = await _qrcode();
        qr = qrcode(0, "M");
        qr.addData(str);
        qr.make();
    } catch (e) {
        return { ok: false, error: "QR encode failed: " + String(e && e.message || e) };
    }

    let moduleCount;
    try { moduleCount = qr.getModuleCount(); }
    catch (e) { return { ok: false, error: "getModuleCount failed: " + String(e && e.message || e) }; }
    if (!(moduleCount > 0)) return { ok: false, error: "encoder produced an empty matrix (moduleCount=" + moduleCount + ")" };

    const cellSize = opts.cellSize
        ? Math.max(1, Math.min(20, Math.round(+opts.cellSize)))
        : Math.max(MIN_CELL, Math.min(MAX_CELL, Math.round(TARGET_QR_PX / moduleCount)));
    const margin = cellSize * 4; // quiet zone, same default convention ui/vendor/qrcode.mjs's own createImgTag() uses
    const size = moduleCount * cellSize + margin * 2;

    let canvas, ctx;
    try {
        canvas = mod.createCanvas(size, size);
        ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, size, size); // quiet zone background; renderTo2dContext only paints the matrix itself
        ctx.translate(margin, margin);
        qr.renderTo2dContext(ctx, cellSize);
    } catch (e) {
        return { ok: false, error: "draw failed: " + String(e && e.message || e) };
    }

    // Pixel verification happens BEFORE encode: it is checking what the 2D context actually holds,
    // independent of whether toBuffer() below is trustworthy.
    let imageData, verify;
    try {
        imageData = ctx.getImageData(0, 0, size, size); // getImageData reads absolute canvas pixels, unaffected by the translate() above
        verify = _verifyPixels(imageData, qr, moduleCount, cellSize, margin);
    } catch (e) {
        return { ok: false, error: "pixel verification threw: " + String(e && e.message || e) };
    }
    if (!verify.ok) {
        return { ok: false, error: "canvas pixels do not match the QR encoder's own matrix at " + verify.mismatch +
            " (row " + verify.row + ", col " + verify.col + "): encoder says isDark=" + verify.expected +
            ", canvas drew isDark=" + verify.drawn };
    }

    let buf;
    try { buf = canvas.toBuffer("image/png"); }
    catch (e) { return { ok: false, error: "PNG encode failed: " + String(e && e.message || e) }; }

    let hdr;
    try { hdr = _readPngHeader(buf); }
    catch (e) { return { ok: false, error: "PNG header parse threw: " + String(e && e.message || e), bytes: buf.length }; }
    if (!hdr.ok) return { ok: false, error: "encoder returned bytes that do not decode as PNG: " + hdr.error, bytes: buf.length };
    if (hdr.width !== size || hdr.height !== size)
        return { ok: false, error: "PNG header size mismatch -- canvas is " + size + "x" + size + ", IHDR declares " + hdr.width + "x" + hdr.height, bytes: buf.length };

    return { ok: true, png: buf, moduleCount, cellSize, width: hdr.width, height: hdr.height, pixelsVerified: verify.checked };
}

module.exports = { status, renderQrPng, MAX_DATA_LEN, _readPngHeader, _verifyPixels };
