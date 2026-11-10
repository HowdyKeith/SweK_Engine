// WebGLEngine/render/countDenoiser.mjs -- round 86 (pre-registration section 192): a denoiser that is told each pixel's sample count.
//
// D_S is round 11's network (the large kernel-predicting one, with the emitter mask) with ONE more input channel, COUNT_CHANNEL: the
// pixel's sample count over the mean budget, m / SAMPLING.budget -- 1 everywhere in a uniform frame. Its first layer takes COUNT_STRIDE
// (11) channels; the kernel's taps keep the emitter mask's rule (denoiseMask.maskChannelOf reads the mask at this stride too).
//
// ITS TRAINING IMAGES are round 11's scenes at 64 x 64, each traced as SAMPLING.maxSpp one-sample passes from its own seeds (countSeed),
// each pixel the mean of its first m, m from round 82's rule (adaptiveSampling.allocate: the budget on the mean, 1 to maxSpp, weight
// 1 + weight x s) over a SHARE MAP drawn from the scene's own stream: 0 to COUNT_DISKS.max disks of radius rMin-rMax pixels where s = 1,
// s = 0 elsewhere. A scene with no disk is the uniform budget. The reference is round 11's (renderSeeds' ref, SPP_REF samples).
"use strict";
import { render } from "../physics/render/pathTracer.mjs";
import { rng } from "../physics/render/furnace.mjs";
import { makeScene, guideBuffers, inputChannels, renderSeeds, isDatasetSeed, IMAGE, SPP_REF } from "./denoiseScenes.mjs";
import { emitterCoverage, withMask, MASK_STRIDE } from "./denoiseMask.mjs";
import { SAMPLING, allocate } from "./adaptiveSampling.mjs";

/** D_S's input: the mask's ten channels, then the count. */
export const COUNT_STRIDE = MASK_STRIDE + 1;
export const COUNT_CHANNEL = 10;
/** Section 192's share maps: 0-3 disks of radius 3-12 pixels. */
export const COUNT_DISKS = Object.freeze({ max: 3, rMin: 3, rMax: 12 });
/** The salt that keeps the share map's stream apart from the scene's own. */
export const COUNT_SALT = 86;
/** The one-sample passes' render seeds: their own range, above round 82's (6e7 + seed x 128 + ...) and every other the arc uses. */
export const COUNT_SEED_BASE = 9e7;
export const countSeed = (seed, j) => COUNT_SEED_BASE + seed * 16 + j;

/** A 10-channel input (n pixels, the mask's stride) with each pixel's count over the budget appended: n x COUNT_STRIDE. */
export function withCounts(x10, counts, budget = SAMPLING.budget) {
    const n = counts.length;
    if (x10.length !== n * MASK_STRIDE) throw new Error(`countDenoiser: the counts go on a ${MASK_STRIDE}-channel input -- got ${x10.length / n} channels`);
    const x = new Float64Array(n * COUNT_STRIDE);
    for (let p = 0; p < n; p++) { for (let c = 0; c < MASK_STRIDE; c++) x[p * COUNT_STRIDE + c] = x10[p * MASK_STRIDE + c]; x[p * COUNT_STRIDE + COUNT_CHANNEL] = counts[p] / budget; }
    return x;
}

/** A scene's share map at w x h (1 inside its disks, 0 elsewhere) and the disks themselves, from the scene's own stream. */
export function shareMap(seed, w, h) {
    const r = rng((((seed >>> 0) * 3266489917) + COUNT_SALT) >>> 0), k = Math.floor(r() * (COUNT_DISKS.max + 1)), disks = [], s = new Float64Array(w * h);
    for (let i = 0; i < k; i++) disks.push({ cx: r() * w, cy: r() * h, rad: COUNT_DISKS.rMin + (COUNT_DISKS.rMax - COUNT_DISKS.rMin) * r() });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (disks.some((d) => (x + 0.5 - d.cx) ** 2 + (y + 0.5 - d.cy) ** 2 <= d.rad ** 2)) s[y * w + x] = 1;
    return { share: s, disks };
}

/** A share map's counts by round 82's rule: allocate over 1 + weight x s, the budget on the mean, 1 to maxSpp (an Int32Array). */
export const countsOf = (share, { budget = SAMPLING.budget, maxSpp = SAMPLING.maxSpp, weight = SAMPLING.weight } = {}) => allocate(Array.from(share, (s) => 1 + weight * s), { budget, hi: maxSpp });

/** Each pixel's mean of its first counts[p] passes (each n x 3). */
export function meanOfPasses(passes, counts) {
    const n = counts.length, o = new Float64Array(n * 3);
    for (let p = 0; p < n; p++) { const k = counts[p]; for (let j = 0; j < k; j++) for (let c = 0; c < 3; c++) o[p * 3 + c] += passes[j][p * 3 + c]; for (let c = 0; c < 3; c++) o[p * 3 + c] /= k; }
    return o;
}

/**
 * One training or validation image of section 192: scene family/seed at w x w, its maxSpp one-sample passes, its share map and counts,
 * the input (withCounts over the mask's ten channels) and round 11's reference. { family, seed, w, h, x, ref, counts, share, disks }.
 * *** THROWS FOR A DATASET SEED WITHOUT { harvest: true }. ***
 */
export function countImage(family, seed, { harvest = false, w = IMAGE, sppRef = SPP_REF, uniform = false } = {}) {
    if (isDatasetSeed(seed) && !harvest) throw new Error(`countDenoiser: seed ${seed} is a dataset seed -- rendering it needs { harvest: true }`);
    const S = makeScene(family, seed), h = w;
    const opts = (spp, s) => ({ w, h, spp, seed: s, rgb: true, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg, sky: S.sky, ...(S.maxDepth ? { maxDepth: S.maxDepth } : {}) });
    const passes = Array.from({ length: SAMPLING.maxSpp }, (_, j) => render(S.scene, opts(1, countSeed(seed, j))));
    const { share, disks } = uniform ? { share: new Float64Array(w * h), disks: [] } : shareMap(seed, w, h), counts = countsOf(share);
    const g = guideBuffers(S, w, h), cov = emitterCoverage(S, w, h);
    const x = withCounts(withMask(inputChannels(meanOfPasses(passes, counts), g.albedo, g.normal, w, h), cov), counts);
    return { family, seed, w, h, x, ref: render(S.scene, opts(sppRef, renderSeeds(seed).ref)), counts, share, disks };
}
