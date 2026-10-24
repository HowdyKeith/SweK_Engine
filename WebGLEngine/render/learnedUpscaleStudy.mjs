// WebGLEngine/render/learnedUpscaleStudy.mjs -- FSR4's first round, round 65 (pre-registration section 148): its two harvests
//
// runUpscaleTraining: the training and validation examples rendered (render/learnedUpscale.mjs's upscaleExample), U trained on
// three seeds, the one with the lowest validation loss the candidate -- chosen before a test scene exists -- and C2's U, trained
// the same way on targets shuffled across the training images. runUpscaleTest: the 24 test scenes, the chain with U, with EASU
// and with bilinear in the upscale's place, graded in display space; H1 U against EASU, H2 U against bilinear.
"use strict";
import { SPLITS_UPSCALE_LEARNED, familyOf } from "./denoiseScenes.mjs";
import { upscaleExample, upscaleChain, trainUpscaler, UP_TRAIN, UP_SHAPE } from "./learnedUpscale.mjs";
import { relMSE, verdict, effects } from "./denoiseStats.mjs";
import { toPerceptual } from "./denoiseUpscale.mjs";
import { seededRandom } from "../brain/convNet.mjs";

export const UPSCALE_SEEDS = Object.freeze([1, 2, 3]);
export const RESULTS_UPSCALE_TRAIN = "render/upscale-net-r65.json";
export const RESULTS_UPSCALE_TEST = "render/denoise-results-upscale-learned.json";
/** C2's shuffle: the training targets permuted across images by a fixed seed's stream, so U sees each input with another scene's truth. */
export const SHUFFLE_SEED = 65;
export const ROUND_UPSCALE_LEARNED = Object.freeze({ splits: SPLITS_UPSCALE_LEARNED, image: 256, sppIn: 4, sppRef: 32, test: "signflip", c1Of: "candidate", c1Min: 22,
    seeds: UPSCALE_SEEDS, train: UP_TRAIN, results: RESULTS_UPSCALE_TEST, net: RESULTS_UPSCALE_TRAIN });
const toD = (y) => Float64Array.from(y, toPerceptual);
/** An example's display-space relMSE of a frame against its reference -- round 65's grading. */
export const gradeDisplay = (y, ex) => relMSE(toD(y), toD(ex.ref));

/** A permutation of 0..n-1 with no fixed point, from a seeded stream (Sattolo's shuffle). */
export function derangement(n, seed) {
    const r = seededRandom(seed), a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r.u() * i); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

export function runUpscaleTraining({ splits = SPLITS_UPSCALE_LEARNED, net, harvest = false, W = ROUND_UPSCALE_LEARNED.image, sppIn = ROUND_UPSCALE_LEARNED.sppIn, sppRef = ROUND_UPSCALE_LEARNED.sppRef,
                                     seeds = UPSCALE_SEEDS, train = UP_TRAIN, log = () => {} } = {}) {
    if (!net) throw new Error("learnedUpscaleStudy: training needs the shipped denoiser, decoded by its caller");
    const t0 = Date.now(), ex = (split) => split.seeds.map((sd, i) => { const e = upscaleExample(familyOf(split, i), sd, net, { harvest, W, H: W, sppIn, sppRef });
        if ((i + 1) % 20 === 0) log(`rendered ${i + 1} of ${split.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(0)} s`); return e; });
    const trainEx = ex(splits.train), valEx = ex(splits.val);
    const runs = seeds.map((seed) => { const r = trainUpscaler(trainEx, { seed, ...train }), val = valEx.map((e) => gradeDisplay(upscaleChain(r.net, e), e));
        log(`seed ${seed} trained at ${((Date.now() - t0) / 1000).toFixed(0)} s, validation ${(val.reduce((a, v) => a + v, 0) / val.length).toExponential(4)}`);
        return { seed, net: r.net, losses: r.losses, val, valMean: val.reduce((a, v) => a + v, 0) / val.length }; });
    const best = runs.reduce((b, r) => (r.valMean < b.valMean ? r : b));
    // C2: the candidate's seed, targets shuffled across the training images (each input with another scene's reference and light)
    const perm = derangement(trainEx.length, SHUFFLE_SEED), shuffled = trainEx.map((e, i) => ({ ...e, ref: trainEx[perm[i]].ref }));
    const c2 = trainUpscaler(shuffled, { seed: best.seed, ...train });
    log(`C2's U trained at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return { candidate: best.seed, runs: runs.map((r) => ({ seed: r.seed, valMean: r.valMean, val: r.val, losses: r.losses, net: r.net })), c2: { seed: best.seed, shuffle: SHUFFLE_SEED, net: c2.net, losses: c2.losses },
             config: { W, sppIn, sppRef, train, shape: UP_SHAPE, splits: { train: splits.train.seeds.length, val: splits.val.seeds.length } }, ms: Date.now() - t0 };
}

export function runUpscaleTest({ splits = SPLITS_UPSCALE_LEARNED, net, U, Uc2, harvest = false, W = ROUND_UPSCALE_LEARNED.image, sppIn = ROUND_UPSCALE_LEARNED.sppIn, sppRef = ROUND_UPSCALE_LEARNED.sppRef,
                                 test = ROUND_UPSCALE_LEARNED.test, c1Min = ROUND_UPSCALE_LEARNED.c1Min, log = () => {} } = {}) {
    if (!net || !U || !Uc2) throw new Error("learnedUpscaleStudy: the test needs the shipped denoiser, the candidate U and C2's U");
    const t0 = Date.now(), T = { U: [], easu: [], bilinear: [], noisy: [], c2: [], floor: [] }, linear = { U: [], easu: [], bilinear: [] };
    let determinism = true;
    splits.T1.seeds.forEach((sd, i) => {
        const e = upscaleExample(familyOf(splits.T1, i), sd, net, { harvest, W, H: W, sppIn, sppRef, ref2: true }), y = upscaleChain(U, e);
        T.U.push(gradeDisplay(y, e)); T.easu.push(gradeDisplay(e.easu, e)); T.bilinear.push(gradeDisplay(e.bilinear, e)); T.noisy.push(gradeDisplay(e.noisy, e));
        T.c2.push(gradeDisplay(upscaleChain(Uc2, e), e)); T.floor.push(relMSE(toD(e.ref2), toD(e.ref)));
        linear.U.push(relMSE(y, e.ref)); linear.easu.push(relMSE(e.easu, e.ref)); linear.bilinear.push(relMSE(e.bilinear, e.ref));
        if (i === 0) determinism = upscaleChain(U, e).every((v, j) => Object.is(v, y[j]));
        log(`image ${i + 1} of ${splits.T1.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    });
    const c2meanD = effects(T.easu, T.c2).reduce((a, v) => a + v, 0) / T.c2.length;
    const sets = { H1: { noisy: T.noisy, filter: T.easu, net: [T.U], floor: T.floor }, H2: { noisy: T.noisy, filter: T.bilinear, net: [T.U], floor: T.floor } };
    const V = verdict({ sets, shuffled: null, c2Prior: { round: 65, meanD: c2meanD, ok: c2meanD <= 0 }, determinism, seedsDistinct: new Set(splits.T1.seeds).size === splits.T1.seeds.length, test, c1Of: "candidate", c1Min });
    return { verdict: V, tables: T, secondary: { linear: { H1: effects(linear.easu, linear.U), H2: effects(linear.bilinear, linear.U) }, c2: effects(T.easu, T.c2) }, determinism, ms: Date.now() - t0 };
}
