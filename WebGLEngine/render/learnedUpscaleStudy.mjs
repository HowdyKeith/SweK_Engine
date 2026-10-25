// WebGLEngine/render/learnedUpscaleStudy.mjs -- FSR4's first round, round 65 (pre-registration section 148): its two harvests
//
// runUpscaleTraining: the training and validation examples rendered (render/learnedUpscale.mjs's upscaleExample), U trained on
// three seeds, the one with the lowest validation loss the candidate -- chosen before a test scene exists -- and C2's U, trained
// the same way on targets shuffled across the training images. runUpscaleTest: the 24 test scenes, the chain with U, with EASU
// and with bilinear in the upscale's place, graded in display space; H1 U against EASU, H2 U against bilinear.
"use strict";
import { SPLITS_UPSCALE_LEARNED, SPLITS_UPSCALE_LEARNED_67, SPLITS_UPSCALE_LEARNED_68, familyOf } from "./denoiseScenes.mjs";
import { upscaleExample, upscaleChain, trainUpscaler, learnedUpscale, tapsOf, UP_TRAIN, UP_SHAPE, UPE_SHAPE, UPE_TAPS } from "./learnedUpscale.mjs";
import { cached } from "./denoiseCache.mjs";
import { relMSE, verdict, effects } from "./denoiseStats.mjs";
import { toPerceptual } from "./denoiseUpscale.mjs";
import { seededRandom } from "../brain/convNet.mjs";

export const UPSCALE_SEEDS = Object.freeze([1, 2, 3]);
export const RESULTS_UPSCALE_TRAIN = "render/upscale-net-r65.json";
export const RESULTS_UPSCALE_TEST = "render/denoise-results-upscale-learned.json";
/** C2's shuffle: the training targets permuted across images by a fixed seed's stream, so U sees each input with another scene's truth. */
export const SHUFFLE_SEED = 65;
export const ROUND_UPSCALE_LEARNED = Object.freeze({ splits: SPLITS_UPSCALE_LEARNED, image: 256, sppIn: 4, sppRef: 32, test: "signflip", c1Of: "candidate", c1Min: 22,
    seeds: UPSCALE_SEEDS, train: UP_TRAIN, results: RESULTS_UPSCALE_TEST, net: RESULTS_UPSCALE_TRAIN, round: 65, variant: "box" });
/** Section 155, ROUND 67: the same round with 512-sample training targets and a 2048-sample test truth, on new test scenes. */
export const ROUND_UPSCALE_LEARNED_67 = Object.freeze({ ...ROUND_UPSCALE_LEARNED, splits: SPLITS_UPSCALE_LEARNED_67, sppRef: 512, sppRefTest: 2048,
    results: "render/denoise-results-upscale-learned-r67.json", net: "render/upscale-net-r67.json", round: 67 });
/** Section 157, ROUND 68: U_E (the 17th tap EASU's output, 32 wide) trained as round 67's U, tested on new scenes, H2 against round 67's U. */
export const ROUND_UPSCALE_LEARNED_68 = Object.freeze({ ...ROUND_UPSCALE_LEARNED_67, splits: SPLITS_UPSCALE_LEARNED_68, variant: "easu", prior: "render/upscale-net-r67.json",
    results: "render/denoise-results-upscale-learned-r68.json", net: "render/upscale-net-r68.json", round: 68 });
/** The round a harvest runs, by number: 65 (section 148) unless --round 67 (section 155) or 68 (section 157). */
export const upscaleRound = (n) => (n === 68 ? ROUND_UPSCALE_LEARNED_68 : n === 67 ? ROUND_UPSCALE_LEARNED_67 : n === 65 || n == null ? ROUND_UPSCALE_LEARNED : (() => { throw new Error(`learnedUpscaleStudy: no round ${n} -- 65, 67 or 68`); })());
/** An example from the cache when it holds one (keyed by everything it depends on), rendered and saved otherwise; no cache, rendered. */
export const exampleKey = (family, seed, { W, sppIn, sppRef, ref2 = false, harvest = false }) => `upscale-learned-${family}-${seed}-${W}-${sppIn}-${sppRef}-${ref2 ? "ref2" : "ref1"}-${harvest ? "harvest" : "gate"}`;
const cachedExample = (cache, family, seed, net, o) => cached(cache, exampleKey(family, seed, o), () => upscaleExample(family, seed, net, { ...o, H: o.W }));
/** The mean weight a U_E puts on EASU's tap over an example's pixels (section 157's P4); null for a 16-tap U. */
export function easuWeight(U, ex) {
    if (tapsOf(U) !== UPE_TAPS) return null;
    const w = learnedUpscale(U, ex.x, ex.half, ex.w, ex.h, ex.easuUp).w, n = 4 * ex.w * ex.h;
    let s = 0; for (let p = 0; p < n; p++) s += w[p * UPE_TAPS + UPE_TAPS - 1];
    return s / n;
}
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
                                     seeds = UPSCALE_SEEDS, train = UP_TRAIN, variant = "box", cache = null, log = () => {} } = {}) {
    if (!net) throw new Error("learnedUpscaleStudy: training needs the shipped denoiser, decoded by its caller");
    const t0 = Date.now(), ex = (split) => split.seeds.map((sd, i) => { const e = cachedExample(cache, familyOf(split, i), sd, net, { harvest, W, sppIn, sppRef });
        if ((i + 1) % 20 === 0) log(`rendered ${i + 1} of ${split.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(0)} s`); return e; });
    const trainEx = ex(splits.train), valEx = ex(splits.val);
    const runs = seeds.map((seed) => { const r = trainUpscaler(trainEx, { seed, ...train, variant }), val = valEx.map((e) => gradeDisplay(upscaleChain(r.net, e), e));
        log(`seed ${seed} trained at ${((Date.now() - t0) / 1000).toFixed(0)} s, validation ${(val.reduce((a, v) => a + v, 0) / val.length).toExponential(4)}`);
        return { seed, net: r.net, losses: r.losses, val, valMean: val.reduce((a, v) => a + v, 0) / val.length }; });
    const best = runs.reduce((b, r) => (r.valMean < b.valMean ? r : b));
    // C2: the candidate's seed, targets shuffled across the training images (each input with another scene's reference and light)
    const perm = derangement(trainEx.length, SHUFFLE_SEED), shuffled = trainEx.map((e, i) => ({ ...e, ref: trainEx[perm[i]].ref }));
    const c2 = trainUpscaler(shuffled, { seed: best.seed, ...train, variant });
    log(`C2's U trained at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return { candidate: best.seed, runs: runs.map((r) => ({ seed: r.seed, valMean: r.valMean, val: r.val, losses: r.losses, net: r.net })), c2: { seed: best.seed, shuffle: SHUFFLE_SEED, net: c2.net, losses: c2.losses },
             config: { W, sppIn, sppRef, train, variant, shape: variant === "easu" ? UPE_SHAPE : UP_SHAPE, splits: { train: splits.train.seeds.length, val: splits.val.seeds.length } }, ms: Date.now() - t0 };
}

// round 68 (section 157): `Uprior`, round 67's U, makes H2 U against it (bilinear then a secondary), and `round` names C2's citation
export function runUpscaleTest({ splits = SPLITS_UPSCALE_LEARNED, net, U, Uc2, Uprior = null, round = 65, harvest = false, W = ROUND_UPSCALE_LEARNED.image, sppIn = ROUND_UPSCALE_LEARNED.sppIn, sppRef = ROUND_UPSCALE_LEARNED.sppRef,
                                 test = ROUND_UPSCALE_LEARNED.test, c1Min = ROUND_UPSCALE_LEARNED.c1Min, cache = null, log = () => {} } = {}) {
    if (!net || !U || !Uc2) throw new Error("learnedUpscaleStudy: the test needs the shipped denoiser, the candidate U and C2's U");
    const t0 = Date.now(), T = { U: [], easu: [], bilinear: [], noisy: [], c2: [], floor: [], ...(Uprior ? { prior: [] } : {}) }, linear = { U: [], easu: [], bilinear: [] }, easuW = [];
    let determinism = true;
    splits.T1.seeds.forEach((sd, i) => {
        const e = cachedExample(cache, familyOf(splits.T1, i), sd, net, { harvest, W, sppIn, sppRef, ref2: true }), y = upscaleChain(U, e);
        if (Uprior) T.prior.push(gradeDisplay(upscaleChain(Uprior, e), e));
        easuW.push(easuWeight(U, e));
        T.U.push(gradeDisplay(y, e)); T.easu.push(gradeDisplay(e.easu, e)); T.bilinear.push(gradeDisplay(e.bilinear, e)); T.noisy.push(gradeDisplay(e.noisy, e));
        T.c2.push(gradeDisplay(upscaleChain(Uc2, e), e)); T.floor.push(relMSE(toD(e.ref2), toD(e.ref)));
        linear.U.push(relMSE(y, e.ref)); linear.easu.push(relMSE(e.easu, e.ref)); linear.bilinear.push(relMSE(e.bilinear, e.ref));
        if (i === 0) determinism = upscaleChain(U, e).every((v, j) => Object.is(v, y[j]));
        log(`image ${i + 1} of ${splits.T1.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    });
    const c2meanD = effects(T.easu, T.c2).reduce((a, v) => a + v, 0) / T.c2.length;
    const sets = { H1: { noisy: T.noisy, filter: T.easu, net: [T.U], floor: T.floor }, H2: { noisy: T.noisy, filter: Uprior ? T.prior : T.bilinear, net: [T.U], floor: T.floor } };
    const V = verdict({ sets, shuffled: null, c2Prior: { round, meanD: c2meanD, ok: c2meanD <= 0 }, determinism, seedsDistinct: new Set(splits.T1.seeds).size === splits.T1.seeds.length, test, c1Of: "candidate", c1Min });
    return { verdict: V, tables: T, secondary: { linear: { H1: effects(linear.easu, linear.U), H2: effects(linear.bilinear, linear.U) }, c2: effects(T.easu, T.c2),
             ...(Uprior ? { bilinear: effects(T.bilinear, T.U) } : {}), ...(easuW[0] !== null ? { easuWeight: easuW } : {}) }, determinism, ms: Date.now() - t0 };
}
