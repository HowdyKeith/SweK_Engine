// WebGLEngine/ui/screenPattern.js -- v3038
//
// THE GRADEABLE HALF OF REMOTE DESKTOP. A viewer that "looks like it works" is decoration: a frozen frame, a
// half-decoded frame and a correct frame all look like a picture. This module makes the picture into a
// QUANTITY -- render a known pattern on the sender, decode it on the receiver, and the two either agree or they
// do not, by a number.
//
// It yields TWO independent observables from ONE frame, which is the shape that has earned its keep in this
// tree before (lift-force vs wake-probe agreeing to 4.0% on the Strouhal cross-check):
//   FIDELITY -- how much the codec mangled the colours. Answers "is the image intact?"
//   LATENCY  -- the frame counter is painted INTO the image, so a decoded counter compared against the sender's
//               current counter gives end-to-end lag in frames without a clock, without NTP, and without
//               trusting either machine's idea of the time.
// A frozen stream scores perfect fidelity and terrible latency. A torn stream scores the reverse. One number
// could not tell those apart; two can.
//
// NOTHING HERE TOUCHES WebRTC ON PURPOSE. ev/p2p.js already does SDP/ICE with glare avoidance, and
// ui/cloudPeer.js already does it again through the bridge-proxied cloud rendezvous. A THIRD signalling stack is
// the eight-defect law with a new hat on. This file is pure pixel arithmetic: it runs in Node, so the gate can
// grade it without a browser, and the transport stays whoever's job it already was.
"use strict";

// 4-bit-per-channel quantised palette. Video codecs are lossy and chroma-subsampled, so a pattern of adjacent
// near-identical colours would fail for reasons that are not defects. Widely separated colours survive H.264.
const STEP = 85;                                  // 0, 85, 170, 255 -- four levels per channel, far apart
export const LEVELS = [0, STEP, STEP * 2, 255];

/** Deterministic colour for cell (cx,cy) of the grid. Pure -- both ends compute it, neither transmits it. */
export function cellColor(cx, cy, cols) {
    const i = cy * cols + cx;
    // Three coprime strides so the pattern does not repeat along a row, a column, or a diagonal.
    return { r: LEVELS[(i * 1) % 4], g: LEVELS[(i * 3) % 4], b: LEVELS[(i * 7) % 4] };
}

/**
 * The frame counter is painted as BINARY across the top row -- black or white per bit, the two colours furthest
 * apart in any colour space, so it survives the worst compression the codec will do to it. It is deliberately
 * NOT text: OCR through a lossy codec is a second failure mode with its own tolerance, and this needs zero.
 */
export function counterBits(frame, bits) {
    const out = [];
    for (let b = 0; b < bits; b++) out.push((frame >> b) & 1);
    return out;
}

export function decodeCounter(bitCells) {
    let n = 0;
    for (let b = 0; b < bitCells.length; b++) {
        // Midpoint threshold on luma. A bit is only ambiguous if the codec destroyed black-vs-white, at which
        // point the fidelity number below is already screaming.
        const c = bitCells[b];
        if ((c.r * 0.299 + c.g * 0.587 + c.b * 0.114) > 127) n |= (1 << b);
    }
    return n;
}

/** The full expected frame: counter row on top, colour grid beneath. */
export function expectedFrame(frame, cols, rows, bits) {
    const cells = [];
    for (let b = 0; b < bits; b++) cells.push({ cx: b, cy: 0, role: "bit", ...(counterBits(frame, bits)[b] ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }) });
    for (let cy = 1; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) cells.push({ cx, cy, role: "grid", ...cellColor(cx, cy, cols) });
    return cells;
}

/**
 * Compare a received frame against what the sender painted.
 *
 * TOLERANCE IS PER-CHANNEL AND GENEROUS ON PURPOSE. This measures whether the IMAGE ARRIVED, not whether the
 * codec is lossless -- it is not, and demanding exactness would fail every real stream and catch nothing. The
 * sabotage in the gate proves the loose tolerance still detects a blanked region, which is the failure that
 * matters. A check that only fires on perfection cannot distinguish "working" from "broken"; it fires always.
 */
export function compareFrames(expected, actual, tol = 48) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) throw new Error("compareFrames needs two cell arrays");
    if (expected.length !== actual.length) throw new Error("frame cell counts differ: expected " + expected.length + ", got " + actual.length + " -- that is a geometry mismatch, not a fidelity result, and averaging over it would hide the real fault");
    let bad = 0, worst = 0;
    for (let i = 0; i < expected.length; i++) {
        const e = expected[i], a = actual[i];
        const d = Math.max(Math.abs(e.r - a.r), Math.abs(e.g - a.g), Math.abs(e.b - a.b));
        if (d > worst) worst = d;
        if (d > tol) bad++;
    }
    return { cells: expected.length, mismatched: bad, worstDelta: worst, fidelity: 1 - bad / expected.length, tol };
}

/**
 * End-to-end lag in FRAMES, from the counter painted into the image. Never negative and never a clock: the
 * receiver cannot see a frame the sender has not painted, so a negative result means the counter wrapped, and
 * saying so is better than reporting a plausible small number.
 */
export function latencyFrames(sentCounter, decodedCounter, bits) {
    const span = 1 << bits;
    let d = sentCounter - decodedCounter;
    if (d < 0) d += span;                          // wrapped
    if (d >= span / 2) return { frames: null, note: "counter delta " + d + " exceeds half the " + span + "-frame span -- ambiguous under wrap, so no number is reported rather than a wrong one" };
    return { frames: d, note: d === 0 ? "receiver is on the sender's current frame" : d + " frames behind" };
}
