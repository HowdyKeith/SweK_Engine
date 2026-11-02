// WebGLEngine/render/learnedUpscaleTemporalStudy.mjs -- FSR4 round 70 (pre-registration section 161): its two harvests
//
// runTemporalTraining: the training and validation SEQUENCES rendered (render/learnedUpscaleTemporal.mjs's temporalExample), U_T
// trained on three seeds, the candidate the lowest validation loss, and C2's U_T on targets shuffled across the training
// sequences. runTemporalTest: the 24 test sequences, U_T's chain against Bt (H1) and against the single-frame chain B1 (H2), graded
// in display space, with each scene's mean correction (P4).
"use strict";
import { SPLITS_UPSCALE_TEMPORAL, SPLITS_UPSCALE_TEMPORAL_72, familyOf } from "./denoiseScenes.mjs";
import { temporalExample, temporalChain, trainTemporal, temporalCorrection, UT_SHAPE, UTH_SHAPE } from "./learnedUpscaleTemporal.mjs";
import { UP_TRAIN } from "./learnedUpscale.mjs";
import { UPSCALE_SEEDS, SHUFFLE_SEED, derangement, gradeDisplay } from "./learnedUpscaleStudy.mjs";
import { cached } from "./denoiseCache.mjs";
import { relMSE, verdict, effects } from "./denoiseStats.mjs";
import { toPerceptual } from "./denoiseUpscale.mjs";

export const ROUND_UPSCALE_TEMPORAL = Object.freeze({ splits: SPLITS_UPSCALE_TEMPORAL, image: 256, sppIn: 4, sppRef: 512, sppRefTest: 2048, test: "signflip", c1Of: "candidate", c1Min: 22,
    seeds: UPSCALE_SEEDS, train: UP_TRAIN, results: "render/denoise-results-upscale-temporal-r70.json", net: "render/upscale-net-r70.json", round: 70, minGain: 0.01, variant: "full" });
/** Section 167, ROUND 72: U_TH (half size, 16 wide) trained and tested as round 70's U_T, on new test scenes. */
export const ROUND_UPSCALE_TEMPORAL_72 = Object.freeze({ ...ROUND_UPSCALE_TEMPORAL, splits: SPLITS_UPSCALE_TEMPORAL_72, variant: "half", round: 72,
    results: "render/denoise-results-upscale-temporal-r72.json", net: "render/upscale-net-r72.json" });
/** The temporal round a harvest runs: 70 (section 161) unless --round 72 (section 167). */
export const temporalRound = (n) => (n === 72 ? ROUND_UPSCALE_TEMPORAL_72 : n === 70 || n == null ? ROUND_UPSCALE_TEMPORAL : (() => { throw new Error(`learnedUpscaleTemporalStudy: no temporal round ${n} -- 70 or 72`); })());
/** A sequence's cache key: everything it depends on. */
export const temporalKey = (family, seed, { W, sppIn, sppRef, ref2 = false, harvest = false }) => `upscale-temporal-${family}-${seed}-${W}-${sppIn}-${sppRef}-${ref2 ? "ref2" : "ref1"}-${harvest ? "harvest" : "gate"}`;
const cachedSeq = (cache, family, seed, net, o) => cached(cache, temporalKey(family, seed, o), () => temporalExample(family, seed, net, o));
const toD = (y) => Float64Array.from(y, toPerceptual), mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;

export function runTemporalTraining({ splits = SPLITS_UPSCALE_TEMPORAL, net, harvest = false, W = 256, sppIn = 4, sppRef = 512, seeds = UPSCALE_SEEDS, train = UP_TRAIN, variant = "full", cache = null, log = () => {} } = {}) {
    if (!net) throw new Error("learnedUpscaleTemporalStudy: training needs the shipped denoiser, decoded by its caller");
    const t0 = Date.now(), ex = (split) => split.seeds.map((sd, i) => { const e = cachedSeq(cache, familyOf(split, i), sd, net, { harvest, W, sppIn, sppRef });
        if ((i + 1) % 20 === 0) log(`rendered ${i + 1} of ${split.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(0)} s`); return e; });
    const trainEx = ex(splits.train), valEx = ex(splits.val);
    const runs = seeds.map((seed) => { const r = trainTemporal(trainEx, { seed, ...train, variant }), val = valEx.map((e) => gradeDisplay(temporalChain(r.net, e), e));
        log(`seed ${seed} trained at ${((Date.now() - t0) / 1000).toFixed(0)} s, validation ${mean(val).toExponential(4)}`);
        return { seed, net: r.net, losses: r.losses, val, valMean: mean(val) }; });
    const best = runs.reduce((b, r) => (r.valMean < b.valMean ? r : b));
    const perm = derangement(trainEx.length, SHUFFLE_SEED), shuffled = trainEx.map((e, i) => ({ ...e, ref: trainEx[perm[i]].ref }));
    const c2 = trainTemporal(shuffled, { seed: best.seed, ...train, variant });
    log(`C2's U_T trained at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return { candidate: best.seed, runs: runs.map((r) => ({ seed: r.seed, valMean: r.valMean, val: r.val, losses: r.losses, net: r.net })), c2: { seed: best.seed, shuffle: SHUFFLE_SEED, net: c2.net, losses: c2.losses },
             config: { W, sppIn, sppRef, train, variant, shape: variant === "half" ? UTH_SHAPE : UT_SHAPE, splits: { train: splits.train.seeds.length, val: splits.val.seeds.length } }, ms: Date.now() - t0 };
}

export function runTemporalTest({ splits = SPLITS_UPSCALE_TEMPORAL, net, U, Uc2, round = 70, harvest = false, W = 256, sppIn = 4, sppRef = 2048, test = "signflip", c1Min = 22, cache = null, log = () => {} } = {}) {
    if (!net || !U || !Uc2) throw new Error("learnedUpscaleTemporalStudy: the test needs the shipped denoiser, the candidate U_T and C2's U_T");
    const t0 = Date.now(), T = { U: [], bt: [], b1: [], noisy: [], c2: [], floor: [] }, correction = [];
    let determinism = true;
    splits.T1.seeds.forEach((sd, i) => {
        const e = cachedSeq(cache, familyOf(splits.T1, i), sd, net, { harvest, W, sppIn, sppRef, ref2: true }), y = temporalChain(U, e);
        T.U.push(gradeDisplay(y, e)); T.bt.push(gradeDisplay(e.bt, e)); T.b1.push(gradeDisplay(e.b1, e)); T.noisy.push(gradeDisplay(e.noisy, e));
        T.c2.push(gradeDisplay(temporalChain(Uc2, e), e)); T.floor.push(relMSE(toD(e.ref2), toD(e.ref))); correction.push(temporalCorrection(U, e));
        if (i === 0) determinism = temporalChain(U, e).every((v, j) => Object.is(v, y[j]));
        log(`sequence ${i + 1} of ${splits.T1.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    });
    const c2meanD = mean(effects(T.bt, T.c2));
    const sets = { H1: { noisy: T.noisy, filter: T.bt, net: [T.U], floor: T.floor }, H2: { noisy: T.noisy, filter: T.b1, net: [T.U], floor: T.floor } };
    const V = verdict({ sets, shuffled: null, c2Prior: { round, meanD: c2meanD, ok: c2meanD <= 0 }, determinism, seedsDistinct: new Set(splits.T1.seeds).size === splits.T1.seeds.length, test, c1Of: "candidate", c1Min });
    return { verdict: V, tables: T, secondary: { c2: effects(T.bt, T.c2), correction, gainOverBt: 1 - mean(T.U) / mean(T.bt) }, determinism, ms: Date.now() - t0 };
}
