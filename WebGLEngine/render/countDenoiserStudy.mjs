// WebGLEngine/render/countDenoiserStudy.mjs -- round 86 (pre-registration section 192): D_S trained, and tested in round 82's design.
//
// runCountTraining: round 11's training scenes and validation scenes as section 192's count images (render/countDenoiser.mjs's
// countImage), D_S trained on them as round 11 trained its network (the large kernel head, 4,500 steps of 4 crops of 32, seeds 1-3), the
// candidate by validation (display relMSE), and C2 (the candidate's seed on shuffled targets).
//
// runCountTest: round 82's test (render/learnedUpscaleTemporalStudy.mjs's runSamplingTest) on new moving scenes, the same one-sample passes
// in four arms -- S_U and S_A through the shipped denoiser (uniform, adaptive), D_U and D_A through D_S -- and C2's D_S on the adaptive
// passes; each through the chain as it is and graded on Bt's image. H1: D_A against D_U. H2: D_A against S_U.
"use strict";
import { SPLITS_R11, SPLITS_COUNT_86, familyOf, makeScene, IMAGE, SPP_REF } from "./denoiseScenes.mjs";
import { countImage, withCounts, COUNT_STRIDE, COUNT_DISKS } from "./countDenoiser.mjs";
import { trainDenoiser, denoise, TRAIN_LONG, INIT } from "./denoiseNet.mjs";
import { SHUFFLE_SEED, derangement, gradeDisplay } from "./learnedUpscaleStudy.mjs";
import { cached } from "./denoiseCache.mjs";
import { relMSE, verdict, effects } from "./denoiseStats.mjs";
import { samplingFrames, rejectedMask, SAMPLING } from "./adaptiveSampling.mjs";
import { temporalExample } from "./learnedUpscaleTemporal.mjs";
import { sceneMotion } from "./movingScenes.mjs";
import { maskedDisplay, temporalKey } from "./learnedUpscaleTemporalStudy.mjs";
import { toPerceptual } from "./denoiseUpscale.mjs";
import { FRAMES } from "./denoiseTemporal.mjs";

/** Section 192's round: round 11's training (its scenes, schedule and seeds) on count images, and round 82's test on new moving scenes. */
export const ROUND_COUNT_86 = Object.freeze({ round: 86, trainSplits: SPLITS_R11, splits: SPLITS_COUNT_86, image: IMAGE, sppRef: SPP_REF, seeds: Object.freeze([1, 2, 3]), train: TRAIN_LONG,
    head: "kernel", size: "large", testImage: 256, sppIn: 4, sppRefTest: 2048, test: "signflip", c1Min: 22, sampling: SAMPLING,
    net: "render/denoise-net-count-r86.json", results: "render/denoise-results-count-r86.json" });
/** The round a count harvest runs: 86 is the only one. */
export const countRound = (n) => (n === 86 ? ROUND_COUNT_86 : (() => { throw new Error(`countDenoiserStudy: no count round ${n} -- 86`); })());

/** A count image's cache key: everything it depends on. */
export const countKey = (family, seed, { w, sppRef, harvest = false }) => `count-image-${family}-${seed}-${w}-${sppRef}-${harvest ? "harvest" : "gate"}`;
/** A test scene's cache key: round 82's sampling pair's, marked as round 86's four arms. */
export const countTestKey = (family, seed, o) => temporalKey(family, seed, o) + "-count86";
const toD = (y) => Float64Array.from(y, toPerceptual), mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;
/** A denoised image's display relMSE against its reference. */
export const gradeImage = (net, im) => relMSE(toD(denoise(net, im.x, im.h, im.w).y), toD(im.ref));

/** A split's count images. */
export function countImages(split, { harvest = false, w = IMAGE, sppRef = SPP_REF, cache = null, log = () => {}, t0 = Date.now() } = {}) {
    return split.seeds.map((sd, i) => { const fam = familyOf(split, i), e = cached(cache, countKey(fam, sd, { w, sppRef, harvest }), () => countImage(fam, sd, { harvest, w, sppRef }));
        if ((i + 1) % 32 === 0) log(`rendered ${i + 1} of ${split.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(0)} s`); return e; });
}

export function runCountTraining({ splits = SPLITS_R11, harvest = false, w = IMAGE, sppRef = SPP_REF, seeds = ROUND_COUNT_86.seeds, train = TRAIN_LONG, cache = null, log = () => {} } = {}) {
    const t0 = Date.now(), tr = countImages(splits.train, { harvest, w, sppRef, cache, log, t0 }), va = countImages(splits.val, { harvest, w, sppRef, cache, log, t0 });
    const trainIm = tr.map((e) => ({ x: e.x, ref: e.ref, w: e.w, h: e.h }));
    const fit = (ims, seed) => trainDenoiser(ims, { seed, ...train, init: INIT, head: ROUND_COUNT_86.head, size: ROUND_COUNT_86.size });
    const runs = seeds.map((seed) => { const r = fit(trainIm, seed), val = va.map((e) => gradeImage(r.net, e));
        log(`seed ${seed} trained at ${((Date.now() - t0) / 1000).toFixed(0)} s, validation ${mean(val).toExponential(4)}`);
        return { seed, net: r.net, losses: r.losses, val, valMean: mean(val) }; });
    const best = runs.reduce((b, r) => (r.valMean < b.valMean ? r : b));
    const perm = derangement(trainIm.length, SHUFFLE_SEED), c2 = fit(trainIm.map((e, i) => ({ ...e, ref: trainIm[perm[i]].ref })), best.seed);
    log(`C2's D_S trained at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const uniformShare = tr.filter((e) => e.disks.length === 0).length;
    return { candidate: best.seed, runs: runs.map((r) => ({ seed: r.seed, valMean: r.valMean, val: r.val, losses: r.losses, net: r.net })), c2: { seed: best.seed, shuffle: SHUFFLE_SEED, net: c2.net, losses: c2.losses },
             config: { w, sppRef, train, head: ROUND_COUNT_86.head, size: ROUND_COUNT_86.size, stride: COUNT_STRIDE, disks: COUNT_DISKS, sampling: SAMPLING, splits: { train: tr.length, val: va.length }, uniformImages: uniformShare },
             ms: Date.now() - t0 };
}

export function runCountTest({ splits = SPLITS_COUNT_86, net, ds, dsC2, round = 86, harvest = false, W = 256, sppIn = 4, sppRef = 2048, test = "signflip", c1Min = 22, cache = null, log = () => {} } = {}) {
    if (!net || !ds || !dsC2) throw new Error("countDenoiserStudy: the test needs the shipped denoiser, the candidate D_S and C2's");
    if (ds.layers[0].Cin !== COUNT_STRIDE || dsC2.layers[0].Cin !== COUNT_STRIDE) throw new Error(`countDenoiserStudy: D_S takes ${COUNT_STRIDE} channels`);
    const t0 = Date.now(), T = { dA: [], dU: [], sA: [], sU: [], b1dA: [], b1dU: [], b1sA: [], b1sU: [], noisy: [], c2: [], floor: [] };
    const rej = { dA: [], dU: [], sA: [], sU: [], share: [], sppA: [] }, prep = (x10, counts) => withCounts(x10, counts, SAMPLING.budget);
    splits.T1.seeds.forEach((sd, i) => {
        const fam = familyOf(splits.T1, i), S = makeScene(fam, sd), motion = sceneMotion(S), o = { harvest, W, sppIn, sppRef, ref2: true };
        const arms = cached(cache, countTestKey(fam, sd, o), () => {
            const sf = samplingFrames(S, net, { W, motion, alts: [{ net: ds, prep }, { net: dsC2, prep }] }), sU = temporalExample(fam, sd, net, { ...o, motion, frames: sf.uniform }), refs = { ref: sU.ref, ref2: sU.ref2 };
            const ex = (frames) => temporalExample(fam, sd, net, { ...o, motion, frames, refs });
            return { sU, sA: ex(sf.adaptive), dU: ex(sf.alts[0].uniform), dA: ex(sf.alts[0].adaptive), c2: ex(sf.alts[1].adaptive), rmask: rejectedMask(sf.hits), spp: sf.spp[FRAMES - 1] }; });
        for (const k of ["dA", "dU", "sA", "sU"]) { T[k].push(gradeDisplay(arms[k].bt, arms[k])); T["b1" + k].push(gradeDisplay(arms[k].b1, arms[k])); rej[k].push(maskedDisplay(arms[k].bt, arms[k].ref, arms.rmask)); }
        T.noisy.push(gradeDisplay(arms.sU.noisy, arms.sU)); T.c2.push(gradeDisplay(arms.c2.bt, arms.c2)); T.floor.push(relMSE(toD(arms.sU.ref2), toD(arms.sU.ref)));
        rej.share.push(arms.rmask.reduce((q, m) => q + m, 0) / arms.rmask.length);
        { const w = W / 2; let s = 0, k = 0; for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (arms.rmask[(2 * y) * W + 2 * x]) { s += arms.spp[y * w + x]; k++; } rej.sppA.push(k ? s / k : null); }
        log(`sequence ${i + 1} of ${splits.T1.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    });
    // determinism: D_S on one count input twice, bit for bit
    const probe = new Float64Array(16 * 16 * COUNT_STRIDE).map((_, j) => ((j * 2654435761) >>> 0) / 4294967296), d0 = denoise(ds, probe, 16, 16).y, d1 = denoise(ds, probe, 16, 16).y;
    const determinism = d0.every((v, j) => Object.is(v, d1[j]));
    const c2meanD = mean(effects(T.dA, T.c2)), gain = (u, b) => { const k = u.map((v, i) => (v === null || b[i] === null ? null : i)).filter((i) => i !== null); return k.length ? 1 - mean(k.map((i) => u[i])) / mean(k.map((i) => b[i])) : null; };
    const sets = { H1: { noisy: T.noisy, filter: T.dU, net: [T.dA], floor: T.floor }, H2: { noisy: T.noisy, filter: T.sU, net: [T.dA], floor: T.floor } };
    const V = verdict({ sets, shuffled: null, c2Prior: { round, meanD: c2meanD, ok: c2meanD <= 0 }, determinism, seedsDistinct: new Set(splits.T1.seeds).size === splits.T1.seeds.length, test, c1Of: "candidate", c1Min });
    return { verdict: V, tables: T, determinism, sampling: SAMPLING, ms: Date.now() - t0,
             secondary: { c2: effects(T.dA, T.c2), gains: { dAoverdU: gain(T.dA, T.dU), dAoversU: gain(T.dA, T.sU), sAoversU: gain(T.sA, T.sU), dUoversU: gain(T.dU, T.sU),
                                                            b1: { dAoverdU: gain(T.b1dA, T.b1dU), sAoversU: gain(T.b1sA, T.b1sU) } },
                          rejected: { ...rej, gains: { dAoverdU: gain(rej.dA, rej.dU), sAoversU: gain(rej.sA, rej.sU) } } } };
}
