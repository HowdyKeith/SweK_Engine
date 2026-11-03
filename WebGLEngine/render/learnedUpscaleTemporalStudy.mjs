// WebGLEngine/render/learnedUpscaleTemporalStudy.mjs -- FSR4 round 70 (pre-registration section 161): its two harvests
//
// runTemporalTraining: the training and validation SEQUENCES rendered (render/learnedUpscaleTemporal.mjs's temporalExample), U_T
// trained on three seeds, the candidate the lowest validation loss, and C2's U_T on targets shuffled across the training
// sequences. runTemporalTest: the 24 test sequences, U_T's chain against Bt (H1) and against the single-frame chain B1 (H2), graded
// in display space, with each scene's mean correction (P4).
"use strict";
import { SPLITS_UPSCALE_TEMPORAL, SPLITS_UPSCALE_TEMPORAL_72, SPLITS_UPSCALE_MOVING, SPLITS_UPSCALE_MOVING_78, SPLITS_UPSCALE_VECTORS, SPLITS_UPSCALE_CHECK, familyOf, makeScene } from "./denoiseScenes.mjs";
import { sceneMotion } from "./movingScenes.mjs";
import { temporalExample, temporalChain, trainTemporal, temporalCorrection, UT_SHAPE, UTH_SHAPE, UT_CHANNELS } from "./learnedUpscaleTemporal.mjs";
import { FRAMES } from "./denoiseTemporal.mjs";
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
/** Section 176, ROUND 77: a test only, of round 72's U_TH (its net file is the one read) on 24 new scenes whose objects move, each beside its still twin. */
export const ROUND_UPSCALE_MOVING = Object.freeze({ ...ROUND_UPSCALE_TEMPORAL_72, splits: SPLITS_UPSCALE_MOVING, round: 77, moving: true,
    results: "render/denoise-results-upscale-moving-r77.json" });
/** Section 178, ROUND 78: U_THM, U_TH's shape trained on round 65's scenes still AND moving, tested on new moving scenes against round 72's U_TH (`baseline`). */
export const ROUND_UPSCALE_MOVING_78 = Object.freeze({ ...ROUND_UPSCALE_TEMPORAL_72, splits: SPLITS_UPSCALE_MOVING_78, round: 78, moving: true, trainMoving: true,
    net: "render/upscale-net-r78.json", baseline: "render/upscale-net-r72.json", results: "render/denoise-results-upscale-moving-r78.json" });
/** Section 180, ROUND 79: object motion vectors for Bt's history -- a test only, of Bt_MV against Bt and round 72's U_TH on each, on new moving scenes. */
export const ROUND_UPSCALE_VECTORS = Object.freeze({ ...ROUND_UPSCALE_TEMPORAL_72, splits: SPLITS_UPSCALE_VECTORS, round: 79, moving: true, vectors: true,
    results: "render/denoise-results-upscale-vectors-r79.json" });
/** Section 182, ROUND 80: the mover history check -- Bt_MVC (the vectors plus a mean +- MOVER_GAMMA sigma clip on the movers) against Bt and Bt_MV, a test only. */
export const MOVER_GAMMA = 1.0;
export const ROUND_UPSCALE_CHECK = Object.freeze({ ...ROUND_UPSCALE_TEMPORAL_72, splits: SPLITS_UPSCALE_CHECK, round: 80, moving: true, vectors: true, check: true, moverGamma: MOVER_GAMMA,
    results: "render/denoise-results-upscale-check-r80.json" });
/** The temporal round a harvest runs: 70 (section 161) unless --round 72 (section 167), 77 (section 176, a test only), 78 (section 178), 79 (section 180, a test only) or 80 (section 182, a test only). */
export const temporalRound = (n) => (n === 80 ? ROUND_UPSCALE_CHECK : n === 79 ? ROUND_UPSCALE_VECTORS : n === 78 ? ROUND_UPSCALE_MOVING_78 : n === 77 ? ROUND_UPSCALE_MOVING : n === 72 ? ROUND_UPSCALE_TEMPORAL_72 : n === 70 || n == null ? ROUND_UPSCALE_TEMPORAL : (() => { throw new Error(`learnedUpscaleTemporalStudy: no temporal round ${n} -- 70, 72, 77, 78, 79 or 80`); })());
/** A sequence's cache key: everything it depends on. */
export const temporalKey = (family, seed, { W, sppIn, sppRef, ref2 = false, harvest = false }) => `upscale-temporal-${family}-${seed}-${W}-${sppIn}-${sppRef}-${ref2 ? "ref2" : "ref1"}-${harvest ? "harvest" : "gate"}`;
const cachedSeq = (cache, family, seed, net, o) => cached(cache, temporalKey(family, seed, o), () => temporalExample(family, seed, net, o));
/** Round 77: a moving sequence's cache key -- the still one's, marked moving (its references are the still twin's). */
export const movingKey = (family, seed, o) => temporalKey(family, seed, o) + "-moving";
const toD = (y) => Float64Array.from(y, toPerceptual), mean = (a) => a.reduce((q, v) => q + v, 0) / a.length;

/**
 * A split's sequences for training or validation. Round 78 (section 178): `moving` takes each scene twice, still and then moving (sceneMotion,
 * its twin's reference shared) -- the still ones first, so the first half is round 72's examples exactly.
 */
export function sequenceSet(split, net, { harvest = false, W = 256, sppIn = 4, sppRef = 512, moving = false, cache = null, log = () => {}, t0 = Date.now() } = {}) {
    const o = { harvest, W, sppIn, sppRef }, still = split.seeds.map((sd, i) => { const e = cachedSeq(cache, familyOf(split, i), sd, net, o);
        if ((i + 1) % 20 === 0) log(`rendered ${i + 1} of ${split.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(0)} s`); return e; });
    if (!moving) return still;
    const mv = split.seeds.map((sd, i) => { const fam = familyOf(split, i), motion = sceneMotion(makeScene(fam, sd));
        const e = cached(cache, movingKey(fam, sd, o), () => temporalExample(fam, sd, net, { ...o, motion, refs: { ref: still[i].ref } }));
        if ((i + 1) % 20 === 0) log(`moved ${i + 1} of ${split.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(0)} s`); return e; });
    return still.concat(mv);
}

export function runTemporalTraining({ splits = SPLITS_UPSCALE_TEMPORAL, net, harvest = false, W = 256, sppIn = 4, sppRef = 512, seeds = UPSCALE_SEEDS, train = UP_TRAIN, variant = "full", moving = false, cache = null, log = () => {} } = {}) {
    if (!net) throw new Error("learnedUpscaleTemporalStudy: training needs the shipped denoiser, decoded by its caller");
    const t0 = Date.now(), ex = (split) => sequenceSet(split, net, { harvest, W, sppIn, sppRef, moving, cache, log, t0 });
    const trainEx = ex(splits.train), valEx = ex(splits.val);
    const runs = seeds.map((seed) => { const r = trainTemporal(trainEx, { seed, ...train, variant }), val = valEx.map((e) => gradeDisplay(temporalChain(r.net, e), e));
        log(`seed ${seed} trained at ${((Date.now() - t0) / 1000).toFixed(0)} s, validation ${mean(val).toExponential(4)}`);
        return { seed, net: r.net, losses: r.losses, val, valMean: mean(val) }; });
    const best = runs.reduce((b, r) => (r.valMean < b.valMean ? r : b));
    const perm = derangement(trainEx.length, SHUFFLE_SEED), shuffled = trainEx.map((e, i) => ({ ...e, ref: trainEx[perm[i]].ref }));
    const c2 = trainTemporal(shuffled, { seed: best.seed, ...train, variant });
    log(`C2's U_T trained at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    return { candidate: best.seed, runs: runs.map((r) => ({ seed: r.seed, valMean: r.valMean, val: r.val, losses: r.losses, net: r.net })), c2: { seed: best.seed, shuffle: SHUFFLE_SEED, net: c2.net, losses: c2.losses },
             config: { W, sppIn, sppRef, train, variant, moving, shape: variant === "half" ? UTH_SHAPE : UT_SHAPE, splits: { train: trainEx.length, val: valEx.length } }, ms: Date.now() - t0 };
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

/** Pixels' display relMSE over a mask (1 = in): y and ref are W x H x 3. null where the mask is empty. */
export function maskedDisplay(y, ref, mask) {
    const idx = []; for (let p = 0; p < mask.length; p++) if (mask[p]) idx.push(p);
    if (!idx.length) return null;
    const a = new Float64Array(idx.length * 3), b = new Float64Array(idx.length * 3);
    idx.forEach((p, k) => { for (let c = 0; c < 3; c++) { a[k * 3 + c] = toPerceptual(y[p * 3 + c]); b[k * 3 + c] = toPerceptual(ref[p * 3 + c]); } });
    return relMSE(a, b);
}
/** Bt's mean history length over an example's pixels, read off U_T's input (channel 9 is n / FRAMES). */
export function meanHistory(ex) { let s = 0; const n = ex.W * ex.H; for (let p = 0; p < n; p++) s += ex.x[p * UT_CHANNELS + 9] * FRAMES; return s / n; }

/**
 * Round 77 (section 176): the 24 test scenes, each MOVING and STILL. The still example is runTemporalTest's; the moving one
 * moves the objects over the history (sceneMotion), shares the still one's references, and is graded the same way. The verdict
 * (H77a: U_TH against Bt; H77b: against B1) is on the moving scenes; the still ones, history lengths and mover pixels are
 * descriptive.
 */
export function runMovingTest({ splits = SPLITS_UPSCALE_MOVING, net, U, Uc2, U0 = null, round = 77, harvest = false, W = 256, sppIn = 4, sppRef = 2048, test = "signflip", c1Min = 22, cache = null, log = () => {} } = {}) {
    if (!net || !U || !Uc2) throw new Error("learnedUpscaleTemporalStudy: the moving test needs the shipped denoiser, the candidate U_TH and C2's");
    // round 78 (section 178): U0 is round 72's U_TH, graded beside U (U_THM) on every arm, and H1 is U against U0 rather than against Bt
    const t0 = Date.now(), T = { U: [], bt: [], b1: [], noisy: [], c2: [], floor: [], ...(U0 ? { U0: [] } : {}) }, still = { U: [], bt: [], ...(U0 ? { U0: [] } : {}) }, correction = [];
    const hist = { moving: [], still: [] }, mover = { U: [], bt: [], share: [], ...(U0 ? { U0: [] } : {}) }, rest = { U: [], bt: [], ...(U0 ? { U0: [] } : {}) }, speeds = [];
    let determinism = true;
    splits.T1.seeds.forEach((sd, i) => {
        const fam = familyOf(splits.T1, i), o = { harvest, W, sppIn, sppRef, ref2: true }, s = cachedSeq(cache, fam, sd, net, o), motion = sceneMotion(makeScene(fam, sd));
        const e = cached(cache, movingKey(fam, sd, o), () => temporalExample(fam, sd, net, { ...o, motion, refs: { ref: s.ref, ref2: s.ref2 } })), y = temporalChain(U, e);
        T.U.push(gradeDisplay(y, e)); T.bt.push(gradeDisplay(e.bt, e)); T.b1.push(gradeDisplay(e.b1, e)); T.noisy.push(gradeDisplay(e.noisy, e));
        T.c2.push(gradeDisplay(temporalChain(Uc2, e), e)); T.floor.push(relMSE(toD(e.ref2), toD(e.ref))); correction.push(temporalCorrection(U, e));
        still.U.push(gradeDisplay(temporalChain(U, s), s)); still.bt.push(gradeDisplay(s.bt, s));
        hist.moving.push(meanHistory(e)); hist.still.push(meanHistory(s));
        const inv = Uint8Array.from(e.mover, (m) => 1 - m);
        mover.U.push(maskedDisplay(y, e.ref, e.mover)); mover.bt.push(maskedDisplay(e.bt, e.ref, e.mover)); mover.share.push(e.mover.reduce((q, m) => q + m, 0) / e.mover.length);
        rest.U.push(maskedDisplay(y, e.ref, inv)); rest.bt.push(maskedDisplay(e.bt, e.ref, inv));
        if (U0) { const y0 = temporalChain(U0, e); T.U0.push(gradeDisplay(y0, e)); still.U0.push(gradeDisplay(temporalChain(U0, s), s));
                  mover.U0.push(maskedDisplay(y0, e.ref, e.mover)); rest.U0.push(maskedDisplay(y0, e.ref, inv)); }
        speeds.push(motion.map((m) => Math.hypot(m.v[0], m.v[2])));
        if (i === 0) determinism = temporalChain(U, e).every((v, j) => Object.is(v, y[j]));
        log(`sequence ${i + 1} of ${splits.T1.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    });
    const c2meanD = mean(effects(T.bt, T.c2)), gain = (u, b) => { const k = u.map((v, i) => (v === null || b[i] === null ? null : i)).filter((i) => i !== null); return k.length ? 1 - mean(k.map((i) => u[i])) / mean(k.map((i) => b[i])) : null; };
    const sets = U0 ? { H1: { noisy: T.noisy, filter: T.U0, net: [T.U], floor: T.floor }, H2: { noisy: T.noisy, filter: T.bt, net: [T.U], floor: T.floor } }
                    : { H1: { noisy: T.noisy, filter: T.bt, net: [T.U], floor: T.floor }, H2: { noisy: T.noisy, filter: T.b1, net: [T.U], floor: T.floor } };
    const V = verdict({ sets, shuffled: null, c2Prior: { round, meanD: c2meanD, ok: c2meanD <= 0 }, determinism, seedsDistinct: new Set(splits.T1.seeds).size === splits.T1.seeds.length, test, c1Of: "candidate", c1Min });
    const gm = gain(T.U, T.bt), gs = gain(still.U, still.bt);
    const vsU0 = U0 ? { moving: gain(T.U, T.U0), still: gain(still.U, still.U0), mover: gain(mover.U, mover.U0), rest: gain(rest.U, rest.U0),
                        u0OverBt: { moving: gain(T.U0, T.bt), still: gain(still.U0, still.bt), mover: gain(mover.U0, mover.bt) } } : null;
    return { verdict: V, tables: T, still, determinism, ms: Date.now() - t0,
             secondary: { c2: effects(T.bt, T.c2), correction, gainOverBt: gm, stillGainOverBt: gs, drop: gs - gm,
                          dropByScene: T.U.map((u, i) => (1 - still.U[i] / still.bt[i]) - (1 - u / T.bt[i])),
                          history: hist, mover: { ...mover, gain: gain(mover.U, mover.bt) }, rest: { ...rest, gain: gain(rest.U, rest.bt) }, speeds, ...(vsU0 ? { vsU0 } : {}) } };
}

/** Round 79: a vectors sequence's cache key -- the still one's, marked moving with vectors (it holds both accumulations). */
export const vectorsKey = (family, seed, o) => temporalKey(family, seed, o) + "-moving-vectors";

/**
 * Round 79 (section 180): the 24 moving test scenes, each rendered once and accumulated twice -- Bt as rounds 77-78 had it, and Bt_MV with the
 * movers' exact velocities. H79a is Bt_MV against Bt, H79b round 72's U_TH on Bt_MV against Bt_MV; U_TH on Bt, the mover pixels and the
 * history lengths are descriptive. C2 is round 72's on Bt_MV.
 */
export function runVectorTest({ splits = SPLITS_UPSCALE_VECTORS, net, U, Uc2, round = 79, harvest = false, W = 256, sppIn = 4, sppRef = 2048, test = "signflip", c1Min = 22, cache = null, log = () => {} } = {}) {
    if (!net || !U || !Uc2) throw new Error("learnedUpscaleTemporalStudy: the vectors test needs the shipped denoiser, round 72's U_TH and its C2");
    const t0 = Date.now(), T = { btMV: [], bt: [], uMV: [], u: [], b1: [], noisy: [], c2: [], floor: [] }, correction = [];
    const hist = { mv: [], bt: [] }, mover = { btMV: [], bt: [], uMV: [], u: [], share: [] }, speeds = [];
    let determinism = true;
    splits.T1.seeds.forEach((sd, i) => {
        const fam = familyOf(splits.T1, i), motion = sceneMotion(makeScene(fam, sd)), o = { harvest, W, sppIn, sppRef, ref2: true };
        const e = cached(cache, vectorsKey(fam, sd, o), () => temporalExample(fam, sd, net, { ...o, motion, vectors: true })), em = { ...e, x: e.mv.x, bt: e.mv.bt };
        const yMV = temporalChain(U, em), y = temporalChain(U, e);
        T.btMV.push(gradeDisplay(em.bt, e)); T.bt.push(gradeDisplay(e.bt, e)); T.uMV.push(gradeDisplay(yMV, e)); T.u.push(gradeDisplay(y, e));
        T.b1.push(gradeDisplay(e.b1, e)); T.noisy.push(gradeDisplay(e.noisy, e)); T.c2.push(gradeDisplay(temporalChain(Uc2, em), e)); T.floor.push(relMSE(toD(e.ref2), toD(e.ref)));
        correction.push(temporalCorrection(U, em)); hist.mv.push(meanHistory(em)); hist.bt.push(meanHistory(e));
        mover.btMV.push(maskedDisplay(em.bt, e.ref, e.mover)); mover.bt.push(maskedDisplay(e.bt, e.ref, e.mover));
        mover.uMV.push(maskedDisplay(yMV, e.ref, e.mover)); mover.u.push(maskedDisplay(y, e.ref, e.mover)); mover.share.push(e.mover.reduce((q, m) => q + m, 0) / e.mover.length);
        speeds.push(motion.map((m) => Math.hypot(m.v[0], m.v[2])));
        if (i === 0) determinism = temporalChain(U, em).every((v, j) => Object.is(v, yMV[j]));
        log(`sequence ${i + 1} of ${splits.T1.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    });
    const c2meanD = mean(effects(T.btMV, T.c2)), gain = (u, b) => { const k = u.map((v, i) => (v === null || b[i] === null ? null : i)).filter((i) => i !== null); return k.length ? 1 - mean(k.map((i) => u[i])) / mean(k.map((i) => b[i])) : null; };
    const sets = { H1: { noisy: T.noisy, filter: T.bt, net: [T.btMV], floor: T.floor }, H2: { noisy: T.noisy, filter: T.btMV, net: [T.uMV], floor: T.floor } };
    const V = verdict({ sets, shuffled: null, c2Prior: { round, meanD: c2meanD, ok: c2meanD <= 0 }, determinism, seedsDistinct: new Set(splits.T1.seeds).size === splits.T1.seeds.length, test, c1Of: "candidate", c1Min });
    return { verdict: V, tables: T, determinism, ms: Date.now() - t0,
             secondary: { c2: effects(T.btMV, T.c2), correction, gains: { btMVoverBt: gain(T.btMV, T.bt), uMVoverBtMV: gain(T.uMV, T.btMV), uMVoverU: gain(T.uMV, T.u), uOverBt: gain(T.u, T.bt) },
                          history: hist, mover: { ...mover, gains: { btMVoverBt: gain(mover.btMV, mover.bt), uMVoverBtMV: gain(mover.uMV, mover.btMV), uMVoverU: gain(mover.uMV, mover.u) } }, speeds } };
}

/** Round 80: a check sequence's cache key -- the still one's, marked moving with vectors and the mover clip's gamma. */
export const checkKey = (family, seed, o, gamma) => temporalKey(family, seed, o) + `-moving-vectors-clip${gamma}`;

/**
 * Round 80 (section 182): the 24 moving test scenes, each rendered once and accumulated three ways -- Bt, Bt_MV (the vectors) and Bt_MVC (the
 * vectors with the movers' history clipped to mean +- gamma sigma). H80a is Bt_MVC against Bt, H80b Bt_MVC against Bt_MV; round 72's U_TH on
 * each, the mover pixels and the history lengths are descriptive. C2 is round 72's on Bt_MVC.
 */
export function runCheckTest({ splits = SPLITS_UPSCALE_CHECK, net, U, Uc2, gamma = MOVER_GAMMA, round = 80, harvest = false, W = 256, sppIn = 4, sppRef = 2048, test = "signflip", c1Min = 22, cache = null, log = () => {} } = {}) {
    if (!net || !U || !Uc2) throw new Error("learnedUpscaleTemporalStudy: the check test needs the shipped denoiser, round 72's U_TH and its C2");
    const t0 = Date.now(), T = { btMVC: [], btMV: [], bt: [], uMVC: [], uMV: [], u: [], b1: [], noisy: [], c2: [], floor: [] }, correction = [];
    const hist = { mvc: [], mv: [], bt: [] }, mover = { btMVC: [], btMV: [], bt: [], uMVC: [], u: [], share: [] };
    let determinism = true;
    splits.T1.seeds.forEach((sd, i) => {
        const fam = familyOf(splits.T1, i), motion = sceneMotion(makeScene(fam, sd)), o = { harvest, W, sppIn, sppRef, ref2: true };
        const e = cached(cache, checkKey(fam, sd, o, gamma), () => temporalExample(fam, sd, net, { ...o, motion, vectors: true, moverGamma: gamma }));
        const em = { ...e, x: e.mv.x, bt: e.mv.bt }, ec = { ...e, x: e.mvc.x, bt: e.mvc.bt }, yC = temporalChain(U, ec), yM = temporalChain(U, em), y = temporalChain(U, e);
        T.btMVC.push(gradeDisplay(ec.bt, e)); T.btMV.push(gradeDisplay(em.bt, e)); T.bt.push(gradeDisplay(e.bt, e));
        T.uMVC.push(gradeDisplay(yC, e)); T.uMV.push(gradeDisplay(yM, e)); T.u.push(gradeDisplay(y, e));
        T.b1.push(gradeDisplay(e.b1, e)); T.noisy.push(gradeDisplay(e.noisy, e)); T.c2.push(gradeDisplay(temporalChain(Uc2, ec), e)); T.floor.push(relMSE(toD(e.ref2), toD(e.ref)));
        correction.push(temporalCorrection(U, ec)); hist.mvc.push(meanHistory(ec)); hist.mv.push(meanHistory(em)); hist.bt.push(meanHistory(e));
        mover.btMVC.push(maskedDisplay(ec.bt, e.ref, e.mover)); mover.btMV.push(maskedDisplay(em.bt, e.ref, e.mover)); mover.bt.push(maskedDisplay(e.bt, e.ref, e.mover));
        mover.uMVC.push(maskedDisplay(yC, e.ref, e.mover)); mover.u.push(maskedDisplay(y, e.ref, e.mover)); mover.share.push(e.mover.reduce((q, m) => q + m, 0) / e.mover.length);
        if (i === 0) determinism = temporalChain(U, ec).every((v, j) => Object.is(v, yC[j]));
        log(`sequence ${i + 1} of ${splits.T1.seeds.length} at ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    });
    const c2meanD = mean(effects(T.btMVC, T.c2)), gain = (u, b) => { const k = u.map((v, i) => (v === null || b[i] === null ? null : i)).filter((i) => i !== null); return k.length ? 1 - mean(k.map((i) => u[i])) / mean(k.map((i) => b[i])) : null; };
    const sets = { H1: { noisy: T.noisy, filter: T.bt, net: [T.btMVC], floor: T.floor }, H2: { noisy: T.noisy, filter: T.btMV, net: [T.btMVC], floor: T.floor } };
    const V = verdict({ sets, shuffled: null, c2Prior: { round, meanD: c2meanD, ok: c2meanD <= 0 }, determinism, seedsDistinct: new Set(splits.T1.seeds).size === splits.T1.seeds.length, test, c1Of: "candidate", c1Min });
    return { verdict: V, tables: T, determinism, gamma, ms: Date.now() - t0,
             secondary: { c2: effects(T.btMVC, T.c2), correction, history: hist,
                          gains: { btMVCoverBt: gain(T.btMVC, T.bt), btMVCoverBtMV: gain(T.btMVC, T.btMV), btMVoverBt: gain(T.btMV, T.bt), uMVCoverBtMVC: gain(T.uMVC, T.btMVC), uMVCoverU: gain(T.uMVC, T.u) },
                          mover: { ...mover, gains: { btMVCoverBt: gain(mover.btMVC, mover.bt), btMVoverBt: gain(mover.btMV, mover.bt), uMVCoverU: gain(mover.uMVC, mover.u) } } } };
}
