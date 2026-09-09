// render/temporalAccumulate.mjs -- THE ACCUMULATION: history, reprojection, a neighbourhood clamp, and a blend.
//
// The first rung of this arc that makes a PICTURE. render/jitter.mjs's gate can say the Halton sequence is
// low-discrepancy and covers the pixel footprint, but "the accumulation converges to a super-sampled result" is a
// claim about an image, and nothing in this tree blended a history buffer, so nothing could test it. This can.
//
// *** THIS RUNG IS TEMPORAL ANTI-ALIASING, NOT TEMPORAL UPSCALING, AND THE DIFFERENCE IS ONE RESAMPLER. *** At an
// upscale ratio of 1 the jittered samples and the output share a grid, so accumulating them IS the super-sample and
// the convergence claim can be measured directly. Above 1, each frame's samples land between display pixels and FSR
// resolves them with a jitter-aware Lanczos2 upsample -- a separate piece with its own failure modes, and pretending
// this rung covers it would be the kind of half-done the tree keeps catching.
//
// The pass, per pixel:
//   1. REPROJECT through the motion vector (render/motionVectors.mjs) to find where this surface was last frame;
//   2. SAMPLE the history there, bilinearly, because the reprojection lands between texels;
//   3. CLAMP that sample to the min/max of the current frame's 3x3 neighbourhood -- the thing that stops ghosting,
//      because a history sample that cannot be reached from what is on screen NOW is history of something else;
//   4. BLEND: out = mix(clampedHistory, current, alpha).
//
// alpha = 1/(n+1) makes the output the exact running MEAN of every sample so far, which is what converges to the
// super-sample. A fixed alpha is what a real-time pass uses and converges to a weighted average instead, trading
// the last of the convergence for a shorter response to change. The gate measures both.
"use strict";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Bilinear sample of an rgba buffer at a uv, edge-clamped. */
export function sampleBilinear(buf, w, h, u, v) {
    const x = u * w - 0.5, y = v * h - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (xx, yy, c) => buf[(clamp(yy, 0, h - 1) * w + clamp(xx, 0, w - 1)) * 4 + c];
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++)
        out[c] = at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x0 + 1, y0, c) * fx * (1 - fy)
               + at(x0, y0 + 1, c) * (1 - fx) * fy + at(x0 + 1, y0 + 1, c) * fx * fy;
    return out;
}

/**
 * One accumulate step. `history` may be null, which is the honest first frame: the output is the current frame and
 * nothing is blended, because there is nothing to blend with. (render/jitter.mjs and render/motionVectors.mjs both
 * carry the same rule; a zero-filled history would be believed and would darken the first frames.)
 *
 * `motion` is w*h*4 as render/motionVectors.mjs writes it: (du, dv, valid, 0).
 */
export function temporalAccumulateCPU({ current, history, motion, w, h, alpha, clampToNeighbourhood = true }) {
    const out = new Float32Array(w * h * 4);
    const stats = { reused: 0, rejectedOffscreen: 0, rejectedInvalid: 0, clamped: 0 };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, o = i * 4;
        const cur = [current[o], current[o + 1], current[o + 2], current[o + 3]];
        if (!history) { out[o] = cur[0]; out[o + 1] = cur[1]; out[o + 2] = cur[2]; out[o + 3] = cur[3]; continue; }

        const u = (x + 0.5) / w, v = (y + 0.5) / h;
        const du = motion ? motion[o] : 0, dv = motion ? motion[o + 1] : 0;
        const valid = motion ? motion[o + 2] !== 0 : true;
        const hu = u + du, hv = v + dv;
        if (!valid) { stats.rejectedInvalid++; out[o] = cur[0]; out[o + 1] = cur[1]; out[o + 2] = cur[2]; out[o + 3] = cur[3]; continue; }
        if (hu < 0 || hu >= 1 || hv < 0 || hv >= 1) {   // it was off screen last frame; there is no history for it
            stats.rejectedOffscreen++; out[o] = cur[0]; out[o + 1] = cur[1]; out[o + 2] = cur[2]; out[o + 3] = cur[3]; continue;
        }
        let hist = sampleBilinear(history, w, h, hu, hv);
        stats.reused++;

        if (clampToNeighbourhood) {
            // the 3x3 of the CURRENT frame bounds what a believable history sample can be
            let did = false;
            for (let c = 0; c < 3; c++) {
                let lo = Infinity, hi = -Infinity;
                for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const nx = clamp(x + dx, 0, w - 1), ny = clamp(y + dy, 0, h - 1);
                    const s = current[(ny * w + nx) * 4 + c];
                    if (s < lo) lo = s; if (s > hi) hi = s;
                }
                const before = hist[c];
                hist[c] = clamp(hist[c], lo, hi);
                if (hist[c] !== before) did = true;
            }
            if (did) stats.clamped++;
        }

        for (let c = 0; c < 3; c++) out[o + c] = hist[c] * (1 - alpha) + cur[c] * alpha;
        out[o + 3] = 1;
    }
    return { data: out, w, h, stats };
}
