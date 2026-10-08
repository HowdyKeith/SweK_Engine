// WebGLEngine/render/denoiseMask.mjs -- the denoiser arc, round 6: the emitter mask
//
// render/learned-denoiser-preregistration.md section 21, gated by render/denoiseMask-selfcheck.mjs. Round 5 stopped
// because the hand-written filter, tuned on families A and B, averaged a bright coloured emitter into family C's
// near-black sky: an emitter and the sky both carry albedo guide 1, and nothing else told them apart (section 20).
// This round gives BOTH methods one more guide -- the fraction of each pixel an emitter covers, from a fixed 8 x 8 grid
// of rays across it -- and the SAME hard rule for it: a pixel is never averaged with a neighbour whose mask differs.
// The filter applies the rule to its window; the kernel-predicting network applies it to its 9 x 9 kernel, and also
// sees the mask as input.
//
// WHY COVERAGE AND NOT A CENTRE-RAY 0/1. Measured on family-C scenes outside every split before this round was
// pre-registered: a pixel at an emitter's rim, whose centre ray misses but whose jittered samples hit, is bright and
// carries mask 0 like the sky beside it, so a 0/1 mask still let round 5's setting smear it into the sky (0.24 against
// a noisy 0.021 on one frame). With coverage the rim pixels carry their own value, and the same frame came to 0.0072.
//
// THE LAYOUT. A masked input is the nine channels every method reads -- [irradiance, albedo, normal] -- then the mask,
// at stride 10. A stride of 9 (one frame) or 13 (the temporal round) carries no mask, and those paths are bit for bit
// what they were. This module imports only the path tracer, so the scenes, the filter and the network can import it.
"use strict";
import { intersect, cameraBasis, pixelRay } from "../physics/render/pathTracer.mjs";

export const MASK_STRIDE = 10;   // the nine channels, then the mask
export const MASK_CHANNEL = 9;
export const COVERAGE_GRID = 8;  // 8 x 8 rays per pixel, at the centres of an even grid: coverage is k / 64

/**
 * The emitter coverage of scene S as its camera sees it, H x W: the fraction of COVERAGE_GRID^2 rays across each pixel,
 * at the centres of an even grid, whose first hit is an emitter. Deterministic -- it is a guide, not a render.
 */
export function emitterCoverage(S, w, h) {
    const B = cameraBasis(S), n = COVERAGE_GRID, cov = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let k = 0;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const hit = intersect(S.eye, pixelRay(x, y, (i + 0.5) / n, (j + 0.5) / n, w, h, B), S.scene);
            if (hit && hit.sphere.emit) k++;
        }
        cov[y * w + x] = k / (n * n);
    }
    return cov;
}

/** The mask's channel in an input of stride C: MASK_CHANNEL at MASK_STRIDE, and -1 (no mask) at any other stride. */
export const maskChannelOf = (C) => (C === MASK_STRIDE ? MASK_CHANNEL : -1);

/** A 9-channel input (n pixels) with the emitter mask (n values in [0, 1]) appended: n x MASK_STRIDE. */
export function withMask(x9, mask) {
    const n = mask.length;
    if (x9.length !== n * 9) throw new Error(`denoiseMask: ${x9.length} values are not a 9-channel input of ${n} pixels`);
    if (!Array.prototype.every.call(mask, (v) => v >= 0 && v <= 1)) throw new Error("denoiseMask: the mask is in [0, 1] at every pixel");
    const x = new Float64Array(n * MASK_STRIDE);
    for (let p = 0; p < n; p++) {
        for (let c = 0; c < 9; c++) x[p * MASK_STRIDE + c] = x9[p * 9 + c];
        x[p * MASK_STRIDE + MASK_CHANNEL] = mask[p];
    }
    return x;
}
