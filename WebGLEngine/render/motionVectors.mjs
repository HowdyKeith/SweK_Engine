// render/motionVectors.mjs -- PER-PIXEL MOTION VECTORS, and the previous frame's view-projection to make them from.
//
// This tree had neither. Nothing in it kept a previous-frame matrix and nothing computed a velocity buffer, which is
// why fx/fsr's gate closes by saying the TEMPORAL path (FSR2/3) cannot start: it wants depth, per-pixel motion and a
// jittered projection with history, and two of those three were absent. This is the first of them, and it is useful
// on its own -- a velocity buffer is what temporal AA, motion blur and any reprojection want, not just FSR.
//
// WHAT A MOTION VECTOR IS HERE: for the surface visible at a pixel this frame, WHERE THAT SAME SURFACE POINT WAS ON
// SCREEN LAST FRAME, in UV units. So `history(uv + velocity)` samples the pixel that saw this surface last frame,
// which is the direction TAA and FSR want and the opposite of the one motion blur wants. The sign is stated because
// half of all reprojection bugs are this sign.
//
// THE CONVENTIONS, ALL FOUR, BECAUSE EVERY ONE OF THEM IS A PLACE THIS GOES SILENTLY WRONG:
//   * DEPTH goes through UNTOUCHED as the clip-space z, so its range is whatever the caller's own projection
//     produces: [0, 1] for a WebGPU-style projection, which is what gfx/device.js's depth32float target hands over,
//     and [-1, 1] for a GL-style one like render/rasterProbe.js's viewProj. This module is agnostic between them and
//     the caller must not be -- a depth in one range read against a projection in the other reconstructs a different
//     world point, and the picture looks almost right. (An earlier draft of this comment claimed [0, 1] outright,
//     which was a convention the code does not actually impose.)
//   * UV is (0,0) at the TOP-LEFT, matching the row order a compute pass indexes a buffer in.
//   * NDC is x = 2u - 1, y = 1 - 2v (uv's y runs down, clip's y runs up), z = d.
//   * The MATRICES are the caller's, in whatever convention the caller renders with, and this module never builds
//     one. It needs the CURRENT frame's inverse view-projection and the PREVIOUS frame's view-projection, and it
//     needs them to be the same convention as each other and as the depth. mat4Invert is here so a caller can get
//     the first from the second without importing a matrix library; the gate holds it to M * inv(M) = I rather than
//     to a reading of its source. (render/CloudVolume.js carries a private copy of this function. Unifying them is a
//     change to that file and belongs to a round that is about that file.)
"use strict";

/** Column-major 4x4 multiply, the same layout render/rasterProbe.js's viewProj emits. */
export function mat4Multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        out[c * 4 + r] = s;
    }
    return out;
}

/** Column-major 4x4 inverse by cofactors. Returns null for a singular matrix rather than a matrix of infinities. */
export function mat4Invert(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    const d = 1 / det;
    return new Float32Array([
        (a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d,
        (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d,
        (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d,
        (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d,
        (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d,
        (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d,
        (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d,
        (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d,
    ]);
}

/** Column-major 4x4 times a vec4, returned unhomogenised (w kept, so the caller can see a point behind the eye). */
export function transform4(m, x, y, z, w) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12] * w,
        m[1] * x + m[5] * y + m[9] * z + m[13] * w,
        m[2] * x + m[6] * y + m[10] * z + m[14] * w,
        m[3] * x + m[7] * y + m[11] * z + m[15] * w,
    ];
}

/**
 * The history this tree did not keep. `advance` takes THIS frame's view-projection, returns the PREVIOUS frame's,
 * and remembers this one for next time.
 *
 * *** THE FIRST FRAME HAS NO PREVIOUS FRAME, AND SAYING "ZERO VELOCITY" THERE IS A LIE. *** Zero velocity means "this
 * surface did not move", which a temporal pass will believe -- and it will blend a history buffer that holds nothing.
 * `advance` returns null on the first frame and `hasHistory` says so, so a caller can do the one thing that is
 * correct there: run without history for a frame.
 */
export function makeMotionState() { return { prevVP: null, frames: 0 }; }
export function advance(state, vp) {
    const prev = state.prevVP;
    state.prevVP = Float32Array.from(vp);
    state.frames++;
    return prev;
}
export function hasHistory(state) { return state.frames > 1 && state.prevVP != null; }

/**
 * Per-pixel motion vectors on the CPU: the ground truth the WGSL is held to.
 * `depth` is w*h clip-space z values; the result is w*h*4 floats per pixel -- (du, dv, valid, zPrev) -- with
 * (du, dv) in UV units and being uvPrev - uvCurr. Four floats because the WGSL writes the same four, so the two
 * can be compared without either side reshaping the other's answer.
 *
 * *** v4552 -- THE FOURTH CHANNEL WAS A HARD-CODED ZERO AND IS NOW zPrev, THE EXPECTED PREVIOUS DEPTH. *** It is
 * the clip-space z this surface WOULD have had last frame: q.z/q.w, one line further down a reprojection this
 * function already performs. DISOCCLUSION is exactly the comparison between that and the depth actually recorded
 * in the previous frame's buffer at (u+du, v+dv) -- if what was there was NEARER, this surface was hidden behind
 * something and its history belongs to that something. Computing it here rather than in render/temporalReject.mjs
 * is the tree's usual rule: the unproject-reproject is defined once, in the module whose subject it is, and the
 * consumer subtracts. On the invalid paths zPrev stays at `invalidTo` alongside the vector, so a caller that
 * ignores `valid` gets a consistent set of nonsense rather than a plausible depth beside a refused vector.
 *
 * A pixel whose reprojection lands BEHIND the previous eye (w <= 0) has no answer -- there was no such pixel last
 * frame -- and comes back with valid = 0 and the vector set to `invalidTo`. A caller that reads the vector without
 * reading `valid` gets a plausible-looking zero, which is why `valid` is a channel and not a footnote.
 */
export function motionVectorsCPU(depth, w, h, invVPCur, vpPrev, { invalidTo = 0 } = {}) {
    const out = new Float32Array(w * h * 4);
    const valid = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const d = depth[i];
        // uv -> ndc (y flips: uv runs down, clip runs up), then ndc -> world through the current inverse
        const nx = 2 * u - 1, ny = 1 - 2 * v;
        const p = transform4(invVPCur, nx, ny, d, 1);
        if (!p[3]) { out[i * 4] = invalidTo; out[i * 4 + 1] = invalidTo; out[i * 4 + 3] = invalidTo; valid[i] = 0; continue; }
        const wx = p[0] / p[3], wy = p[1] / p[3], wz = p[2] / p[3];
        // that world point, through LAST frame's view-projection
        const q = transform4(vpPrev, wx, wy, wz, 1);
        if (q[3] <= 0) { out[i * 4] = invalidTo; out[i * 4 + 1] = invalidTo; out[i * 4 + 3] = invalidTo; valid[i] = 0; continue; }
        const pu = (q[0] / q[3] + 1) * 0.5, pv = (1 - q[1] / q[3]) * 0.5;
        out[i * 4] = pu - u;
        out[i * 4 + 1] = pv - v;
        out[i * 4 + 2] = 1;
        out[i * 4 + 3] = q[2] / q[3];   // the depth this surface would have had last frame -- see the header
        valid[i] = 1;
    }
    return { data: out, valid, w, h };
}
