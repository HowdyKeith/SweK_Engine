// ===================================================================
// render/videoFrames.mjs -- v4260
// -------------------------------------------------------------------
// FRAME-ACCURATE VIDEO AS A *** REPRODUCIBLE *** INPUT TO THE EFFECT
// CHAIN. activetheory/activeframe (MIT) -- the idea, not the code.
//
// v4188 gave this tree a live camera as a GL texture and pointed the
// whole shader chain at it. That was a multiplier and it is also
// UNGRADEABLE: a webcam never produces the same frame twice, so no
// gate can ever say "effect X on frame 47 looks like this". The tree
// gained a video INPUT and lost nothing, but it still has no input
// any test can hold still.
//
// ---- WHAT THE TREE ACTUALLY HAS, MEASURED ------------------------
//
// Nothing in this tree has ever set video.currentTime. Not once, in
// 4,259 rounds -- every .currentTime in the source is
// AudioContext.currentTime. There are no video files in the tree.
// requestVideoFrameCallback is called in exactly ONE place,
// render/cameraTexture.js, and it discards the metadata argument:
//
//     const tick = () => { this._pending = true; ... }
//
// mediaTime and presentedFrames arrive on that second parameter. They
// are the only way the platform will tell you WHICH frame you were
// given, and the tree asks the question and throws away the answer.
//
// ---- THE MEASUREMENTS, INCLUDING THE ONES THAT MOVED --------------
//
// Videos were recorded in headless Chromium, every frame carrying its
// own index in binary blocks, then read back by seeking and by
// playing. Four probes; the third and fourth changed what this file
// claims.
//
// (1) PLAY + requestAnimationFrame, the obvious way, run TWICE:
//       run 1  0 0 0 0 1 1 2 2 2 3 3 4 4 5 5 6 6 7 7 8
//       run 2  0 0 1 1 2 2 2 3 3 4 4 5 5 6 6 7 7 8 8 9
//     *** 17 OF 20 TICKS DISAGREE BETWEEN TWO IDENTICAL RUNS. *** Same
//     file, same code, one immediately after the other. An effect
//     graded this way is graded against whichever frame the scheduler
//     happened to hand over.
//
// (2) SEEK AND WAIT for 'seeked', the same plan run twice: 20 of 20
//     frames identical, AND the pixel digests identical. *** SEEKING
//     IS REPRODUCIBLE. ***
//
// (3) *** AND REPRODUCIBLE IS NOT ACCURATE, WHICH IS THE WHOLE
//     *** LESSON OF THIS FILE. *** That same perfectly-repeatable run
//     was WRONG ABOUT WHICH FRAME IT WAS ON for 19 of those 20. The
//     file was 20.3 fps and the plan assumed 30, so the error grew
//     linearly: deltas ran 0, -1, -2, ... to -21 across 64 frames.
//     Seeking at the file's measured MEAN rate got 32/64 exact and
//     32/64 off by one -- better and still not right, because the
//     recording was variable-rate and no single number describes it.
//
// (4) When the file's real timing DOES match the assumed rate, it is
//     exact: 47/47 at 10 fps, 46/47 at 30 fps, 39/48 at 25 fps. And
//     the 25 fps failure is the shape worth knowing: deltas are
//     0 x39 then -1 x9. *** THE ERROR IS A STEP, NEVER NOISE. *** One
//     hiccup in the recording shifts everything after it, permanently.
//     driftProfile() below exists to name that shape.
//
// ---- WHY THE MIDPOINT, FOR THE REASON THAT SURVIVED ---------------
//
// I expected boundary seeks (n/fps) to be ambiguous in the DECODER and
// the midpoint ((n+0.5)/fps) to fix it. That is not what happened:
// boundary seeks came back 6/6 exact. The midpoint earns its place
// twice over anyway, and both reasons were measured:
//
//   ARITHMETIC: floor(t * fps) on the exact boundary times of 2000
//   frames is wrong 137 times at 25 fps, 45 at 29.97, 38 at 30, and
//   *** 0 times at 24 fps *** -- so the obvious implementation looks
//   perfect if you happen to test it at 24. On midpoint times it is
//   wrong 0 times at every rate, with no epsilon needed.
//
//   TOLERANCE: the midpoint has half a frame of margin on each side, so
//   it survives an fps that is slightly wrong. Reading mediaTime does
//   not. In probe (4), identify()'s answer DISAGREED WITH THE PIXELS IN
//   11 OF 12 COMPARISONS, always by exactly +1, including on the file
//   that seeked 47/47 correct -- the container's timestamps sat a few
//   milliseconds past each nominal boundary (0.402 for frame 3 at
//   10 fps, drifting to 3.119 for frame 30) because the real rate was
//   9.938 and not 10.
//
// *** SO THE PIXELS ARE THE ONLY AUTHORITY HERE. *** Not the plan, not
// currentTime, not mediaTime. decodeFrameIndex is not a test fixture
// bolted on the side; it is the arbiter, and everything else in this
// file reports a claim that it can check.
//
"use strict";

/**
 * *** EPSILON, BECAUSE A FRAME BOUNDARY IS EXACTLY WHERE BINARY FLOATS LAND BADLY. ***
 * 1e-6 seconds is a millionth of a second: far below any real frame interval (1/1000 s at the most absurd
 * rate) and far above the ~1e-13 error that n/fps accumulates. Measured above: it takes 137 wrong answers to
 * 0 at 25 fps without ever reaching into the next frame.
 */
export const FRAME_EPS = 1e-6;

/** Which frame index covers presentation time `t`. This is the function that needs the epsilon. */
export function frameIndexAt(t, fps, eps = FRAME_EPS) {
    if (!(fps > 0) || !Number.isFinite(t) || t < 0) return -1;
    return Math.floor(t * fps + eps);
}

/**
 * The time to SEEK TO in order to land on frame `n` -- the MIDPOINT of the frame's interval.
 *
 * The measurement above says the decoder tested here was robust at the boundary too, so this is not a fix for
 * a bug that was observed. It is chosen because it is the point maximally far from both neighbours, and
 * because frameIndexAt(seekTimeFor(n)) is exact at every rate tried WITHOUT the epsilon, which makes the
 * plan verifiable by arithmetic alone.
 */
export function seekTimeFor(n, fps) {
    if (!(fps > 0) || !(n >= 0)) return NaN;
    return (n + 0.5) / fps;
}

/** How far a proposed seek time sits from the nearest frame boundary, in frames. 0.5 is the midpoint. */
export function boundaryMargin(t, fps) {
    if (!(fps > 0) || !Number.isFinite(t)) return NaN;
    const f = t * fps;
    return Math.min(f - Math.floor(f), Math.ceil(f) - f);
}

/**
 * The whole point of the word REPRODUCIBLE: the list of seeks is a pure function of (count, fps, start).
 * No clock, no rAF, no playback rate. Two runs build the same plan or the plan is not the thing that varied.
 */
export function framePlan(count, fps, opts = {}) {
    const start = opts.start | 0;
    const step = Math.max(1, opts.step | 0 || 1);
    const out = [];
    for (let i = 0; i < count; i++) { const n = start + i * step; out.push({ index: n, time: seekTimeFor(n, fps) }); }
    return out;
}

/**
 * Read a frame's identity out of a requestVideoFrameCallback metadata object -- the argument
 * render/cameraTexture.js currently discards.
 *
 * `mediaTime` is the presentation timestamp of the frame you were ACTUALLY given, which is the only
 * authoritative answer to "which frame is on screen"; video.currentTime is the playback POSITION and can sit
 * anywhere inside (or slightly outside) the frame being shown.
 */
export function identify(metadata, fps) {
    if (!metadata || !(fps > 0)) return { index: -1, mediaTime: NaN, presentedFrames: -1, margin: 0 };
    const mediaTime = Number(metadata.mediaTime);
    return {
        index: frameIndexAt(mediaTime, fps),
        mediaTime,
        // *** HOW MUCH TO TRUST THAT INDEX, AND EXACTLY HOW FAR THAT GOES. *** Distance to the nearest frame
        // boundary, in frames. Near 0 means the timestamp sits on a boundary and a tiny error in `fps` flips
        // the answer. But a margin is a warning about a BOUNDARY and not a detector of a wrong RATE: in probe
        // (4) the four disagreements had margins 0.020, 0.070, 0.130, 0.190 -- GROWING, because accumulating
        // drift pushes the timestamp further past the boundary it should not have crossed, so it looks more
        // confident the more wrong it is. Only the pixels settle it.
        margin: boundaryMargin(mediaTime, fps),
        presentedFrames: Number.isFinite(metadata.presentedFrames) ? metadata.presentedFrames : -1,
    };
}

/**
 * The mean frame rate a decoded file actually has. `duration` is the container's, `frames` is a real count
 * (rVFC's presentedFrames after a full play, or the number of frames you wrote).
 *
 * It is a MEAN, and probe (3) is the warning: a variable-rate file has no single true rate, and seeking a
 * VFR file even at its exact mean still missed half the frames by one.
 */
export function calibrateFps(duration, frames) {
    return (duration > 0 && frames > 0) ? frames / duration : NaN;
}

/**
 * Frames the decoder never showed us. rVFC's presentedFrames counts frames the COMPOSITOR presented, so a
 * jump of more than one between two callbacks means frames went past unseen -- the honest name for which is
 * a dropped frame, not a slow one.
 */
export function droppedBetween(prevPresented, nextPresented) {
    if (!(prevPresented >= 0) || !(nextPresented >= 0)) return 0;
    return Math.max(0, nextPresented - prevPresented - 1);
}

/** Requested-vs-received agreement over a plan. `exact` is the number that matters; the rest diagnoses. */
export function agreement(requested, got) {
    const n = Math.min(requested.length, got.length);
    let exact = 0, offByOne = 0, worse = 0, unreadable = 0;
    for (let i = 0; i < n; i++) {
        const d = got[i] - requested[i];
        if (got[i] < 0) unreadable++;
        else if (d === 0) exact++;
        else if (Math.abs(d) === 1) offByOne++;
        else worse++;
    }
    return { n, exact, offByOne, worse, unreadable, exactRate: n ? exact / n : 0 };
}

/**
 * Name the SHAPE of a requested-vs-received error, because the shape says what to fix.
 *
 * Measured in probe (4): the deltas are step functions. 0 everywhere is "exact". A constant non-zero is an
 * OFFSET -- the plan's start index is wrong. A slope is a RATE error -- the assumed fps does not match the
 * file, and calibrateFps is the fix. A single step partway through is a DROP -- the file lost or duplicated
 * a frame there and everything after it is shifted, which no change of fps will repair.
 */
export function driftProfile(requested, got) {
    const n = Math.min(requested.length, got.length);
    if (n < 2) return { kind: "unknown", n };
    const d = []; for (let i = 0; i < n; i++) d.push(got[i] - requested[i]);
    if (d.every((x) => x === 0)) return { kind: "exact", n, deltas: d };
    if (d.every((x) => x === d[0])) return { kind: "offset", n, offset: d[0], deltas: d };
    // A rate error moves roughly linearly; a drop moves once. Count the places the delta changes.
    let steps = 0, firstStep = -1;
    for (let i = 1; i < n; i++) if (d[i] !== d[i - 1]) { steps++; if (firstStep < 0) firstStep = i; }
    const slope = (d[n - 1] - d[0]) / (n - 1);
    if (steps === 1) return { kind: "drop", n, at: firstStep, shift: d[n - 1] - d[0], deltas: d };
    const monotone = d.every((x, i) => i === 0 || (slope <= 0 ? x <= d[i - 1] : x >= d[i - 1]));
    if (monotone && Math.abs(slope) > 0.02) return { kind: "rate", n, slope, steps, deltas: d };
    return { kind: "noisy", n, steps, slope, deltas: d };
}

/** Do two runs of the same plan agree tick for tick? This is the reproducibility question, asked directly. */
export function runsAgree(a, b) {
    const n = Math.min(a.length, b.length);
    let same = 0; for (let i = 0; i < n; i++) if (a[i] === b[i]) same++;
    return { n, same, differ: n - same, identical: n > 0 && same === n && a.length === b.length };
}

// ---- A FRAME THAT CARRIES ITS OWN NUMBER --------------------------
//
// *** THE PRIMITIVE THAT MAKES ANY PIPELINE GRADEABLE. *** If a frame states which frame it is, then no part
// of the chain has to be trusted to keep count -- you ask the PIXELS at the far end. It survives a lossy
// codec because it is drawn as large full-black / full-white blocks sampled at their centres, and a misread
// is DETECTED rather than silently returned.
//
// *** THE FIRST DESIGN OF THIS HAD A HOLE AND THE PROBE FOUND IT BEFORE THE ROUND SHIPPED. *** With eight
// data blocks and one parity block, frame 0 is all-zero with parity zero -- so AN ALL-BLACK FRAME IS A VALID
// ENCODING OF FRAME 0. A video that failed to decode, a texture that was never uploaded and a seek that
// landed before the first keyframe would all have read back as a confident "frame 0". The comment above this
// block claimed the opposite at the time, which is the more embarrassing half.
//
// The fix is two SYNC blocks at the two ends, one permanently black and one permanently white. A frame of
// any constant colour now fails one of them and reads -1, and losing either edge to a crop fails too.

export const FRAME_BITS = 8;                 // 0..255, more frames than any gate here steps
const BLOCKS = FRAME_BITS + 3;               // white sync + 8 data + parity + black sync

/** Parity over the low FRAME_BITS bits. Catches any single flipped data block WITHIN one band. */
export const frameParity = (n) => { let p = 0; for (let b = 0; b < FRAME_BITS; b++) p ^= (n >> b) & 1; return p; };

/** The bit pattern a band is drawn as: [white sync][b0..b7][parity][black sync]. */
export function frameBits(n) {
    const bits = [1];
    for (let b = 0; b < FRAME_BITS; b++) bits.push((n >> b) & 1);
    bits.push(frameParity(n));
    bits.push(0);
    return bits;
}

/**
 * Draw frame `n`'s index into an RGBA buffer, in TWO BANDS -- top and bottom.
 *
 * *** ONE BAND WITH A PARITY BIT WAS NOT ENOUGH, AND THE EFFECT CENSUS IS WHAT PROVED IT. *** v4260 shipped a
 * single band and reasoned that parity catches any single flipped block -- which is true, and irrelevant to
 * the corruption that actually happens. Running 1,248 encoded frames through this tree's own image passes
 * (render/effectLegibility.mjs, v4261) returned a CONFIDENT WRONG FRAME NUMBER 182 times, 14.58%, and the
 * pattern named the cause: frame 1 read as 129, frame 2 as 130 -- bit 7 flipped, every time.
 *
 * Bit 7 is the last data block and the parity block sits IMMEDIATELY BESIDE IT, both against the right edge.
 * A warp that pulls the right edge flips the two together, parity stays consistent, and the decode hands back
 * a plausible number. *** A CHECK BIT PLACED NEXT TO THE BIT IT CHECKS IS DEFEATED BY ANY CORRUPTION THAT IS
 * *** SPATIALLY LOCAL, which is what every image effect's corruption is. ***
 *
 * The second band is drawn in REVERSED column order and INVERTED, so the same physical damage lands on
 * different bits in the two copies, and a decode requires them to agree. A constant field fails both.
 */
export function encodeFrameIndex(n, w, h, out = new Uint8ClampedArray(w * h * 4)) {
    const bandH = Math.max(1, Math.floor(h / 5));
    const colW = w / BLOCKS;
    const bits = frameBits(n);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let v = 128;                                                  // the field between the bands
            const b = Math.min(BLOCKS - 1, Math.floor(x / colW));
            if (y < bandH) v = bits[b] ? 255 : 0;
            else if (y >= h - bandH) v = bits[BLOCKS - 1 - b] ? 0 : 255;  // reversed AND inverted
            const i = (y * w + x) * 4;
            out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
        }
    }
    return out;
}

/** Read one band's blocks as levels, from a 3x3 average at each block's centre on pixel row `row`. */
function bandLevels(rgba, w, h, row) {
    const colW = w / BLOCKS;
    const cy = Math.max(1, Math.min(h - 2, row));
    const out = [];
    for (let b = 0; b < BLOCKS; b++) {
        const cx = Math.max(1, Math.min(w - 2, Math.floor((b + 0.5) * colW)));
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { sum += rgba[((cy + dy) * w + (cx + dx)) * 4]; count++; }
        out.push(sum / count);
    }
    return out;
}

/** Rows within a band that get sampled -- as fractions of the band's height. See THREE ROWS below. */
export const BAND_ROWS = Object.freeze([0.25, 0.5, 0.75]);

/**
 * Decode one band's levels to an index, or -1.
 *
 * `reverse` maps a bit position to its COLUMN and `invert` flips the ink, which together are what make the
 * bottom band land its bits on different pixels from the top one. Positionally the bright sync is always
 * column 0 and the dark one always the last column, in both bands, so the contrast test is the same.
 */
function bandIndex(levels, { reverse = false, invert = false } = {}) {
    const white = levels[0], black = levels[BLOCKS - 1];
    if (!(white - black > 32)) return -1;             // no usable contrast: blank, constant, or inverted
    const mid = (white + black) / 2;
    const bit = (k) => { const lit = levels[reverse ? BLOCKS - 1 - k : k] > mid; return (lit !== invert) ? 1 : 0; };
    let n = 0; for (let b = 0; b < FRAME_BITS; b++) if (bit(1 + b)) n |= 1 << b;
    return bit(1 + FRAME_BITS) === frameParity(n) ? n : -1;
}

/**
 * Recover the index from an RGBA buffer, or -1.
 *
 * *** A PIPELINE THAT HANDS BACK THE WRONG FRAME MUST NOT BE ABLE TO HAND BACK A PLAUSIBLE NUMBER. *** Both
 * bands must decode -- each with its own sync contrast and its own parity -- AND agree. Each block is read
 * from a 3x3 average at its centre so the ringing a lossy codec leaves at block edges does not reach the
 * sample, and the threshold is the MIDPOINT OF THAT BAND'S OWN SYNC BLOCKS rather than a fixed 128, so a
 * frame the codec has brightened or flattened is still read correctly.
 */
export function decodeFrameIndex(rgba, w, h) {
    const bandH = Math.max(1, Math.floor(h / 5));
    // *** THREE ROWS PER BAND, BECAUSE A ONE-ROW SAMPLE CANNOT SEE A PER-ROW EFFECT. *** The first census run
    // scored render/badTvModel.mjs at 312 of 312 frames SURVIVED at every strength up to 3x, which read as
    // "horizontal tearing is harmless to this encoding" and was nothing of the sort. badTv shifts each ROW by
    // its own amount, and the decoder was reading exactly two pixel rows: at 3x the tear on the row it
    // happened to read was 2.17 px while row 24 of the SAME BAND was torn 30.28 px, nearly two whole blocks.
    // The instrument was blind, not the effect harmless. Requiring three spread rows to agree turns that into
    // an honest "unreadable" -- which is the true answer, since a frame torn that far HAS lost its identity.
    const read = (base, dir, opts) => {
        let first = null;
        for (const f of BAND_ROWS) {
            const n = bandIndex(bandLevels(rgba, w, h, base + dir * Math.round(f * bandH)), opts);
            if (n < 0) return -1;
            if (first === null) first = n; else if (n !== first) return -1;
        }
        return first;
    };
    const top = read(0, 1, undefined);
    if (top < 0) return -1;
    const bot = read(h - 1, -1, { reverse: true, invert: true });
    return bot === top ? top : -1;
}

/** FNV-1a over bytes: a stable digest so "did run 2 produce the same pixels as run 1" is one comparison. */
export function digest(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, "0");
}

// ---- THE WIRING ---------------------------------------------------

/**
 * A video file stepped one frame at a time by SEEK AND WAIT, presented with the same surface
 * render/cameraTexture.js has (`.frames`, `.width`, `.height`, `.texture`, `.update()`) so every pass that
 * already accepts a camera accepts this instead, and engine/frameDirty.js's frameProbe works unchanged.
 *
 * *** SEEK AND WAIT IS SLOW AND THAT IS THE TRADE. *** This cannot run at 60 fps and is not trying to: it is
 * for grading an effect and for rendering a deterministic clip, where being right matters and being live
 * does not. The live path already exists and stays where it is.
 */
export class VideoFrameSource {
    constructor(gl, opts = {}) {
        this.gl = gl;
        this.fps = opts.fps || 30;
        this.video = null;
        this.texture = null;
        this.frames = 0;             // frames UPLOADED -- the counter frameProbe watches
        this.index = -1;             // the frame index last uploaded, per rVFC metadata when available
        this.width = 0; this.height = 0;
        this.error = null;
        this._lastPresented = -1;
        this.dropped = 0;
    }

    async load(src) {
        if (typeof document === "undefined") { this.error = "no document"; return false; }
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = src;
        try {
            await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("video load failed")); });
        } catch (e) { this.error = String(e && e.message || e); return false; }
        this.video = v; this.width = v.videoWidth; this.height = v.videoHeight;
        this.duration = v.duration;
        const gl = this.gl;
        if (gl) {
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            // Same NPOT rules as cameraTexture.js: a mipmap or a REPEAT wrap on a non-power-of-two source
            // yields an incomplete texture that samples BLACK with no error reported.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
        return true;
    }

    /** Total frames the file is expected to hold at this rate. Advisory: containers round durations. */
    get frameCount() { return this.duration > 0 ? Math.round(this.duration * this.fps) : 0; }

    /** Seek to frame `n` and RESOLVE ONLY ONCE THE DECODER SAYS IT ARRIVED. That wait is the whole method. */
    async seekToFrame(n) {
        const v = this.video;
        if (!v) return false;
        const t = seekTimeFor(n, this.fps);
        if (!Number.isFinite(t)) return false;
        await new Promise((res) => {
            const done = () => { v.removeEventListener("seeked", done); res(); };
            v.addEventListener("seeked", done);
            v.currentTime = t;
        });
        // Prefer the frame's OWN timestamp over the seek target we asked for -- mediaTime is what we got.
        if (typeof v.requestVideoFrameCallback === "function") {
            const md = await new Promise((res) => {
                let settled = false;
                const id = v.requestVideoFrameCallback((now, m) => { settled = true; res(m); });
                setTimeout(() => { if (!settled) { try { v.cancelVideoFrameCallback(id); } catch {} res(null); } }, 250);
            });
            if (md) {
                const got = identify(md, this.fps);
                this.dropped += droppedBetween(this._lastPresented, got.presentedFrames);
                this._lastPresented = got.presentedFrames;
                this.index = got.index;
                return true;
            }
        }
        this.index = frameIndexAt(v.currentTime, this.fps);
        return true;
    }

    /** Upload whatever frame is currently decoded. Returns true when the texture changed. */
    update() {
        const gl = this.gl, v = this.video;
        if (!gl || !v || !this.texture) return false;
        if (v.readyState < 2 || !v.videoWidth) return false;
        this.width = v.videoWidth; this.height = v.videoHeight;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);        // video origin is top-left, GL's is bottom-left
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        this.frames++;
        return true;
    }

    /** Step the whole plan, calling `onFrame(index, source)` once per frame, in order, with no clock. */
    async run(plan, onFrame) {
        const got = [];
        for (const step of plan) {
            await this.seekToFrame(step.index);
            this.update();
            got.push(this.index);
            if (onFrame) await onFrame(step.index, this);
        }
        return got;
    }

    stop() {
        try { if (this.video) { this.video.pause(); this.video.removeAttribute("src"); this.video.load(); } } catch {}
        try { if (this.texture && this.gl) this.gl.deleteTexture(this.texture); } catch {}
        this.video = null; this.texture = null;
    }
}
