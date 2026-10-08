// WebGLEngine/render/denoiseFilter.mjs -- the denoiser arc, round 2: the bar the network has to clear
//
// render/learned-denoiser-preregistration.md section 8: a joint (cross) bilateral filter on the demodulated noisy
// irradiance, guided by the normal and albedo buffers and by the irradiance itself, over the network's own 9 x 9
// receptive field, its four sigmas chosen by grid search on the TRAINING scenes only. It is the filter a person would
// write without learning anything, and it gets exactly the data the network gets.
//
// The weight of neighbour q for pixel p is
//     exp( -|p-q|^2 / 2 sS^2  -  |n_p-n_q|^2 / 2 sN^2  -  |a_p-a_q|^2 / 2 sA^2  -  |l_p-l_q|^2 / 2 sI^2 )
// with n the normal, a the albedo and l = ln(1 + irradiance) per channel -- the log so one sigma serves a dim corner
// and a lit wall alike. A sigma of Infinity switches its term off. The output is the weighted mean of the neighbours'
// irradiance, re-modulated by the pixel's own albedo.
"use strict";
import { ALBEDO_FLOOR, strideOf } from "./denoiseScenes.mjs";
import { maskChannelOf } from "./denoiseMask.mjs";

export const RADIUS = 4;   // 9 x 9, the network's receptive field
/** The fixed grid: 3 x 3 x 3 x 4 = 108 settings. Written here, before any training scene exists. */
export const GRID = Object.freeze({
    sS: Object.freeze([1, 2, 4]),
    sN: Object.freeze([0.1, 0.3, 1]),
    sA: Object.freeze([0.05, 0.2, 1]),
    sI: Object.freeze([0.25, 1, 4, Infinity]),
});

/** Filter one input (H x W x C, its first nine channels as denoiseScenes lays them out). Returns the denoised RADIANCE, H x W x 3. */
export function jointBilateral(x, w, h, { sS, sN, sA, sI }) {
    const C = strideOf(x, w * h), m = maskChannelOf(C), out = new Float64Array(w * h * 3), lg = new Float64Array(w * h * 3);
    for (let p = 0; p < w * h; p++) for (let c = 0; c < 3; c++) lg[p * 3 + c] = Math.log1p(Math.max(0, x[p * C + c]));
    const kS = 1 / (2 * sS * sS), kN = Number.isFinite(sN) ? 1 / (2 * sN * sN) : 0, kA = Number.isFinite(sA) ? 1 / (2 * sA * sA) : 0,
          kI = Number.isFinite(sI) ? 1 / (2 * sI * sI) : 0;
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        const p = py * w + px, P = p * C;
        let W = 0, r = 0, g = 0, b = 0;
        for (let qy = Math.max(0, py - RADIUS); qy <= Math.min(h - 1, py + RADIUS); qy++)
            for (let qx = Math.max(0, px - RADIUS); qx <= Math.min(w - 1, px + RADIUS); qx++) {
                const q = qy * w + qx, Q = q * C;
                // section 21: with an emitter mask, a neighbour on the other side of it does not contribute at all
                if (m >= 0 && x[P + m] !== x[Q + m]) continue;
                let e = ((qx - px) ** 2 + (qy - py) ** 2) * kS;
                if (kN) e += ((x[P + 6] - x[Q + 6]) ** 2 + (x[P + 7] - x[Q + 7]) ** 2 + (x[P + 8] - x[Q + 8]) ** 2) * kN;
                if (kA) e += ((x[P + 3] - x[Q + 3]) ** 2 + (x[P + 4] - x[Q + 4]) ** 2 + (x[P + 5] - x[Q + 5]) ** 2) * kA;
                if (kI) e += ((lg[p * 3] - lg[q * 3]) ** 2 + (lg[p * 3 + 1] - lg[q * 3 + 1]) ** 2 + (lg[p * 3 + 2] - lg[q * 3 + 2]) ** 2) * kI;
                const wq = Math.exp(-e);
                W += wq; r += wq * x[Q]; g += wq * x[Q + 1]; b += wq * x[Q + 2];
            }
        // the centre always weighs 1, so W >= 1 and the division is safe
        out[p * 3] = r / W * Math.max(x[P + 3], ALBEDO_FLOOR);
        out[p * 3 + 1] = g / W * Math.max(x[P + 4], ALBEDO_FLOOR);
        out[p * 3 + 2] = b / W * Math.max(x[P + 5], ALBEDO_FLOOR);
    }
    return out;
}

/** Every setting of GRID, in a fixed order (sS outermost, sI innermost). */
export function gridSettings(grid = GRID) {
    const s = [];
    for (const sS of grid.sS) for (const sN of grid.sN) for (const sA of grid.sA) for (const sI of grid.sI) s.push({ sS, sN, sA, sI });
    return s;
}

/**
 * Choose the setting with the smallest mean ln relMSE over a set of { x, ref, w, h } images -- the TRAINING set only.
 * `relMSE` is passed in (render/denoiseStats.mjs's, the metric the verdict uses) so the filter is tuned on the exact
 * quantity it is judged by. Ties go to the earlier setting in gridSettings() order.
 */
export function tuneFilter(images, relMSE, grid = GRID) {
    let best = null;
    const table = [];
    for (const s of gridSettings(grid)) {
        let acc = 0;
        for (const im of images) acc += Math.log(relMSE(jointBilateral(im.x, im.w, im.h, s), im.ref));
        const score = acc / images.length;
        table.push({ ...s, score });
        if (best === null || score < best.score) best = { ...s, score };
    }
    return { best, table };
}
