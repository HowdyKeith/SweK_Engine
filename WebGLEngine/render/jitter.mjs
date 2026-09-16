// render/jitter.mjs -- SUB-PIXEL JITTER: the Halton(2,3) sequence a temporal upscaler offsets its projection by,
// and the pair of matrices that offset produces.
//
// The third and last of the prerequisites render/motionVectors.mjs's gate named. FSR2/3 renders each frame through a
// projection nudged by a fraction of a pixel, so that over a full period the accumulated samples cover the pixel
// footprint and the history converges to a super-sampled image instead of oscillating between two positions.
//
// *** THE JITTERED MATRIX IS FOR RENDERING AND THE UNJITTERED ONE IS FOR MOTION VECTORS, AND THAT IS THE WHOLE
// REASON THIS MODULE HANDS BACK BOTH. *** A velocity computed from jittered matrices carries the jitter difference
// between two frames on top of the real motion -- a wobble of up to a pixel that the accumulator reads as movement
// and smears on. The reference says the same thing in one line of its README ("Motion vectors must be jitter-free");
// here it is a pair of return values so a caller cannot reach for the wrong one by accident, and a gate row that
// measures what happens when they do.
//
// CONVENTION: offsets are in RENDER-RESOLUTION PIXELS, x right and y DOWN -- the same orientation
// render/motionVectors.mjs's uv uses, because two orientations across two modules that must agree is the trap.
"use strict";

/**
 * The `index`-th element of the radical-inverse Halton sequence in `base`, in (0, 1). Index is 1-based: index 0 is
 * 0 for every base, which is the one point that is not a sub-pixel offset at all.
 */
export function halton(index, base) {
    let result = 0, fraction = 1 / base, i = Math.floor(index);
    while (i > 0) { result += (i % base) * fraction; i = Math.floor(i / base); fraction /= base; }
    return result;
}

/**
 * FSR's own phase count (`ffxFsr2GetJitterPhaseCount`): 8 * ratio^2, at least 1. A 2x upscale means each display
 * pixel sees a quarter of a render pixel's samples per frame, so the sequence has to be four times longer to cover
 * the footprint at display-pixel density.
 */
export function jitterPhaseCount(upscaleRatio) {
    return Math.max(1, Math.round(8 * upscaleRatio * upscaleRatio));
}

/** `count` centred Halton(2,3) offsets in [-0.5, 0.5), in render-resolution pixels. */
export function jitterSequence(count) {
    const out = [];
    for (let i = 1; i <= count; i++) out.push([halton(i, 2) - 0.5, halton(i, 3) - 0.5]);
    return out;
}

/**
 * The cyclic phase provider. `current` is this frame's offset, `previous` last frame's -- both, because the
 * accumulate pass wants the difference and a caller that recomputes it from an index will get it wrong at the wrap.
 */
export function makeJitterState(upscaleRatio) {
    const seq = jitterSequence(jitterPhaseCount(upscaleRatio));
    return { seq, index: 0, phaseCount: seq.length, ratio: upscaleRatio };
}
export function jitterCurrent(st) { return st.seq[st.index % st.seq.length]; }
export function jitterPrevious(st) { return st.seq[(st.index + st.seq.length - 1) % st.seq.length]; }
export function advanceJitter(st) { st.index = (st.index + 1) % st.seq.length; return jitterCurrent(st); }
export function resetJitter(st) { st.index = 0; }

/**
 * The jittered view-projection: `vp` with clip space translated so NDC shifts by the sub-pixel offset.
 *
 * Done as T * vp, where T adds (dx*w, dy*w) to clip xy. That is a CLIP-space translation, so it shifts NDC by
 * exactly (dx, dy) at every depth and works for any matrix the caller hands in -- a bare projection or a full
 * view-projection alike. Poking the third column instead only works on a bare projection, and fails silently on a
 * view-projection because that column is no longer the view-space z column.
 *
 * Returns a NEW matrix. The caller keeps the unjittered one, which is the point.
 */
export function jitterProjection(vp, jx, jy, renderW, renderH) {
    const dx = 2 * jx / renderW, dy = -2 * jy / renderH;   // pixels (y down) -> NDC (y up)
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        out[c * 4 + 0] = vp[c * 4 + 0] + dx * vp[c * 4 + 3];
        out[c * 4 + 1] = vp[c * 4 + 1] + dy * vp[c * 4 + 3];
        out[c * 4 + 2] = vp[c * 4 + 2];
        out[c * 4 + 3] = vp[c * 4 + 3];
    }
    return out;
}

/**
 * One frame's matrices, so the two roles cannot be confused: `render` is jittered and is what the scene is drawn
 * with; `motion` is NOT and is what render/motionVectors.mjs must be given. Same input, two named outputs.
 */
export function frameMatrices(vp, st, renderW, renderH) {
    const [jx, jy] = jitterCurrent(st);
    return { render: jitterProjection(vp, jx, jy, renderW, renderH), motion: Float32Array.from(vp), jitter: [jx, jy], phase: st.index };
}
