// WebGLEngine/render/adaptiveSampling.mjs -- FSR4 round 82 (pre-registration section 186): spend the samples where the history is short.
//
// Before frame f is traced its first hits are reprojected against frame f - 1's (render/denoiseTemporal.mjs's reproject, on geometry that costs
// no samples), and each half-size pixel's SHARE is the fraction of its 2 x 2 full-size pixels with no valid history. Its weight is
// 1 + SAMPLING.weight * share, and the frame's budget -- SAMPLING.budget samples a half-size pixel -- is shared in proportion, in integers by the
// largest remainder, each pixel 1 to SAMPLING.maxSpp, the total exact. Frame 0 has no history to lose, so its allocation is uniform.
//
// Each frame is traced as SAMPLING.maxSpp one-sample passes from its own seeds. The UNIFORM arm averages the first `budget` passes at every
// pixel, the ADAPTIVE arm each pixel's first m: the same passes, the same total, paired sample for sample. Both then go through the chain as it
// is (render/learnedUpscaleTemporal.mjs's exampleFrames' steps: the shipped denoiser, the emitter fill, EASU).
"use strict";
import { render } from "../physics/render/pathTracer.mjs";
import { guideBuffers, inputChannels } from "./denoiseScenes.mjs";
import { emitterCoverage, withMask } from "./denoiseMask.mjs";
import { FRAMES, cameraPath, firstHits, reproject } from "./denoiseTemporal.mjs";
import { JITTER, halfShift } from "./denoiseTemporalUpscale.mjs";
import { fillEmitters, upscale } from "./denoiseUpscale.mjs";
import { denoise } from "./denoiseNet.mjs";
import { sceneAt } from "./movingScenes.mjs";

/** Section 186's rule: 4 samples a half-size pixel on the mean, 1 to 12 at any one, weight 1 + 2 x the share of the pixel's history that will be rejected. */
export const SAMPLING = Object.freeze({ budget: 4, maxSpp: 12, weight: 2 });
/** The render seeds of frame f's one-sample passes: their own range, apart from every seed the temporal examples use. */
export const SAMPLING_SEED_BASE = 6e7;
export const samplingSeed = (seed, f, j) => SAMPLING_SEED_BASE + seed * 128 + f * SAMPLING.maxSpp + j;

/** Each half-size pixel's share of rejected history: of its 2 x 2 full-size pixels at W x W, the fraction with no valid history from `prev` (reproject's `valid`, 0 there). */
export function rejectedShare(prevHits, curHits, W) {
    const w = W / 2, { valid } = reproject(prevHits, curHits, W, W), s = new Float64Array(w * w);
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { let k = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (!valid[(2 * y + dy) * W + 2 * x + dx]) k++; s[y * w + x] = k / 4; }
    return s;
}

/** The budget shared by the weights: integers by the largest remainder, each in [lo, hi], summing to budget x n exactly (an Int32Array). */
export function allocate(weights, { budget = SAMPLING.budget, lo = 1, hi = SAMPLING.maxSpp } = {}) {
    const n = weights.length, total = budget * n, m = new Int32Array(n), fixed = new Uint8Array(n);
    if (!(total >= lo * n && total <= hi * n)) throw new Error(`adaptiveSampling: ${budget} a pixel is outside ${lo}-${hi}`);
    let left = total;
    for (let pass = 0; pass < n + 1; pass++) {
        let wsum = 0, free = 0; for (let p = 0; p < n; p++) if (!fixed[p]) { wsum += weights[p]; free++; }
        if (!free) break;
        const raw = new Float64Array(n), rem = [];
        let used = 0; for (let p = 0; p < n; p++) if (!fixed[p]) { raw[p] = wsum > 0 ? left * weights[p] / wsum : left / free; m[p] = Math.floor(raw[p]); used += m[p]; rem.push(p); }
        rem.sort((a, b) => (raw[b] - m[b]) - (raw[a] - m[a]) || a - b);
        for (let i = 0; i < left - used; i++) m[rem[i]]++;
        let clamped = false;
        for (let p = 0; p < n; p++) if (!fixed[p] && (m[p] < lo || m[p] > hi)) { m[p] = Math.min(hi, Math.max(lo, m[p])); fixed[p] = 1; left -= m[p]; clamped = true; }
        if (!clamped) break;
    }
    return m;
}

/**
 * A sequence's eight frames traced both ways from the same one-sample passes: { uniform, adaptive } (each exampleFrames' shape -- { input, cov,
 * y, shift } -- so render/learnedUpscaleTemporal.mjs's temporalExample takes them as `frames`), and for each frame the adaptive allocation
 * (`spp`) and the share it was made from.
 */
export function samplingFrames(S, net, { W, motion = null, budget = SAMPLING.budget, maxSpp = SAMPLING.maxSpp, weight = SAMPLING.weight }) {
    const w = W / 2, n = w * w, path = cameraPath(S), uniform = [], adaptive = [], spp = [], share = [];
    const hits = path.eyes.map((eye, f) => firstHits({ ...S, scene: sceneAt(S, motion, f) }, eye, W, W));
    const chain = (Sf, input, jitter) => { const g = guideBuffers(Sf, w, w, jitter), cov = emitterCoverage(Sf, w, w, jitter);
        const den = denoise(net, withMask(inputChannels(input, g.albedo, g.normal, w, w), cov), w, w).y;
        return { input, cov, y: upscale(fillEmitters(den, cov, w, w), w, w, W, W, "easu"), shift: halfShift(jitter) }; };
    path.eyes.forEach((eye, f) => {
        const Sf = { ...S, scene: sceneAt(S, motion, f), eye }, jitter = JITTER[f];
        const passes = Array.from({ length: maxSpp }, (_, j) => render(Sf.scene, { w, h: w, spp: 1, seed: samplingSeed(S.seed, f, j), rgb: true, eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, pixelOffset: jitter }));
        const sh = f === 0 ? new Float64Array(n) : rejectedShare(hits[f - 1], hits[f], W), m = allocate(Array.from(sh, (s) => 1 + weight * s), { budget, hi: maxSpp });
        const mean = (cnt) => { const o = new Float64Array(n * 3); for (let p = 0; p < n; p++) { const k = cnt(p); for (let j = 0; j < k; j++) for (let c = 0; c < 3; c++) o[p * 3 + c] += passes[j][p * 3 + c]; for (let c = 0; c < 3; c++) o[p * 3 + c] /= k; } return o; };
        uniform.push(chain(Sf, mean(() => budget), jitter)); adaptive.push(chain(Sf, mean((p) => m[p]), jitter)); spp.push(m); share.push(sh);
    });
    return { uniform, adaptive, spp, share, hits };
}

/** The measured frame's rejected pixels at full size: 1 where its first hit is a surface with no valid history from the frame before. */
export function rejectedMask(hits) {
    const W = Math.round(Math.sqrt(hits[FRAMES - 1].obj.length)), { valid } = reproject(hits[FRAMES - 2], hits[FRAMES - 1], W, W), cur = hits[FRAMES - 1].obj, m = new Uint8Array(W * W);
    for (let p = 0; p < W * W; p++) if (cur[p] >= 0 && !valid[p]) m[p] = 1;
    return m;
}
