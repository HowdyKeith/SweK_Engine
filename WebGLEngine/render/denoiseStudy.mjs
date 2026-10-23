// WebGLEngine/render/denoiseStudy.mjs -- the denoiser arc: the pre-registered study, end to end
//
// Run it through its CLI, tools/denoiseStudy.mjs: --harvest for the real study on the real splits (the harvest round's
// command), --mini for the same pipeline on a miniature of NON-dataset scenes.
//
// render/learned-denoiser-preregistration.md, sections 3-11, in the order they happen: render every scene of every
// split, build the 9-channel inputs, tune the filter on the TRAINING scenes, train the network with seeds 1, 2 and 3,
// train seed 1 again for control C4, train the shuffled-target network (C2) with the same seeds, measure every test
// image -- noisy, filter, each seed's network, the reference floor -- and hand it all to render/denoiseStats.mjs's
// verdict(). The secondaries (val, per seed, 1 and 16 samples) are reported beside it and never feed it.
//
// Section 13 (the re-run): control C0 is decided on the TRAINING images right after the networks are trained, and when
// it fires the run stops there -- the test scenes are never rendered, so a failed run cannot spend them.
//
// *** WITHOUT --harvest IT WILL NOT TOUCH THE DATASET. *** runStudy() passes `harvest` through to
// render/denoiseScenes.mjs's renderImages(), which refuses every dataset seed without it; this round commits the
// runner and gates it on --mini's scenes, seeded outside every split. The harvest round is the first to pass the flag.
//
// Section 24: with `cache` (render/denoiseCache.mjs's openCache), each rendered scene, tuned filter and trained network
// is kept, keyed by everything it depends on, and a second run of the same command resumes where the first stopped.
// Without it everything is computed, as before; with it the result is the same, bit for bit
// (render/denoiseCache-selfcheck.mjs). A scene rendered under --harvest is never served to a run without it.
"use strict";
import { SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6, SPLITS_R7, SPLITS_R8, SPLITS_R9, SPLITS_R10, SPLITS_R11, SPLITS_MESH, SPLITS_FSR1, SPLITS_HALFRES, SPLITS_EMITTER, SPLITS_TEMPORALUP, SPLITS_R47, SPLITS_MESH_C, SPLITS_PAGE, SPLITS_FRAMEGEN, SPLITS_FRAMEGEN_LF, SPLITS_FRAMEGEN_DISPLAY, familyOf, makeScene, IMAGE, SPP_IN, SPP_REF, renderImages, renderSeeds, inputChannels, remodulate } from "./denoiseScenes.mjs";
import { renderSequence, temporalChannels, sequenceSeeds } from "./denoiseTemporal.mjs";
import { withMask, emitterCoverage, emitterRadiance, MASK_STRIDE, MASK_CHANNEL, COVERAGE_GRID } from "./denoiseMask.mjs";
import { jointBilateral, tuneFilter } from "./denoiseFilter.mjs";
import { trainDenoiser, denoise, TRAIN, TRAIN_LONG, INIT } from "./denoiseNet.mjs";
import { relMSE, verdict, trainFit, historyFit, trainSanity, effects } from "./denoiseStats.mjs";
import { cached, cachedMany, hashArrays } from "./denoiseCache.mjs";
import { upscale, renderUpscaleImages, renderSeedsUpscale, emitterAwareUpscale, fillEmitters, compositeEmitters, nearEmitterShare, RCAS_SHARPNESS, RCAS_DENOISE, GAMMA, toPerceptual } from "./denoiseUpscale.mjs";
import { trainParallel } from "./denoisePool.mjs";
import { renderFrameGenImages, frameGenSeeds, frameGenFrames, FRAMEGEN_FILL } from "./denoiseFrameGen.mjs";
import { renderTemporalUpscaleImages, temporalUpscaleSeeds, accumulateUpscaled, shiftResample, sequenceGeometry, halfShift, JITTER } from "./denoiseTemporalUpscale.mjs";

export const SEEDS = Object.freeze([1, 2, 3]);
export const RESULTS = "render/denoise-results.json";
export const RESULTS_R2 = "render/denoise-results-r2.json";
export const RESULTS_R3 = "render/denoise-results-r3.json";
export const RESULTS_R4 = "render/denoise-results-r4.json";
export const RESULTS_R5 = "render/denoise-results-r5.json";
export const RESULTS_R6 = "render/denoise-results-r6.json";
export const RESULTS_R7 = "render/denoise-results-r7.json";
export const RESULTS_R8 = "render/denoise-results-r8.json";
export const RESULTS_R9 = "render/denoise-results-r9.json";
export const RESULTS_R10 = "render/denoise-results-r10.json";
export const RESULTS_R11 = "render/denoise-results-r11.json";
export const RESULTS_R47 = "render/denoise-results-r47.json";

/**
 * The two harvests, each exactly as its section of the pre-registration fixed it. ROUND1 is kept so its recorded run
 * can be reproduced; ROUND2 (section 13) is the zero-last initialisation, control C0, and new test scenes.
 */
export const ROUND1 = Object.freeze({ splits: SPLITS, init: "he", c0: false, results: RESULTS });
export const ROUND2 = Object.freeze({ splits: SPLITS_R2, init: INIT, c0: true, results: RESULTS_R2 });
/** Section 15: the kernel-predicting head, new test scenes, and round 2's residual network beside it as a secondary. */
export const ROUND3 = Object.freeze({ splits: SPLITS_R3, init: INIT, c0: true, head: "kernel", compareHeads: Object.freeze(["residual"]), results: RESULTS_R3 });
/**
 * Section 17: sequences. The kernel head over the accumulated history, C6 before the tests, and -- as secondaries -- the
 * accumulation alone, and the filter and the kernel network given the measured frame without its history.
 */
export const ROUND4 = Object.freeze({ splits: SPLITS_R4, init: INIT, c0: true, head: "kernel", compareHeads: Object.freeze([]), temporal: true,
                                      compareNoHistory: true, results: RESULTS_R4 });
/**
 * Section 19: the third family. Round 3's single-frame kernel network trained on A and B together (24 scenes), H1 on
 * held-out A and B, H2 on family C. Secondary: the filter and the network trained on round 3's 24 scenes of A alone,
 * measured on the same test images.
 */
export const ROUND5 = Object.freeze({ splits: SPLITS_R5, init: INIT, c0: true, head: "kernel", compareHeads: Object.freeze([]), temporal: false,
                                      compareTrainSplit: SPLITS.train, results: RESULTS_R5 });
/**
 * Section 21: round 5 again with the emitter mask -- both methods given it, and the same hard rule for it -- on new
 * test scenes. Secondary: both methods WITHOUT the mask, tuned and trained the same way, on the same test images.
 */
export const ROUND6 = Object.freeze({ splits: SPLITS_R6, init: INIT, c0: true, head: "kernel", compareHeads: Object.freeze([]), temporal: false,
                                      emitterMask: true, compareNoMask: true, results: RESULTS_R6 });
/**
 * Section 23: round 6 with its training split replaced by 96 scenes of the randomized family R. H1 on held-out R, H2
 * on family C. Secondary: the filter and networks trained on round 5/6's 24 scenes of A and B, on the same test images.
 */
export const ROUND7 = Object.freeze({ splits: SPLITS_R7, init: INIT, c0: true, head: "kernel", compareHeads: Object.freeze([]), temporal: false,
                                      emitterMask: true, compareTrainSplit: SPLITS_R5.train, results: RESULTS_R7 });
/**
 * Section 26: round 7 with control C1 decided on the TRAINING images before any test scene is rendered, as C0 is, and
 * new test scenes. Everything else -- training split, network, filter, secondaries -- is round 7's.
 */
export const ROUND8 = Object.freeze({ splits: SPLITS_R8, init: INIT, c0: true, head: "kernel", compareHeads: Object.freeze([]), temporal: false,
                                      emitterMask: true, compareTrainSplit: SPLITS_R5.train, c1OnTraining: true, results: RESULTS_R8 });
/**
 * Section 28: round 8 with two deliberate changes -- the LARGE kernel network trained three times as long, and the
 * hypotheses tested by the sign-flip test of the mean effect instead of the sign test of the count -- on new test
 * scenes. Secondary: round 8's small network, trained as round 8 trained it, on the same test images; the sign test
 * beside every sign-flip p.
 */
export const ROUND9 = Object.freeze({ splits: SPLITS_R9, init: INIT, c0: true, head: "kernel", size: "large", train: TRAIN_LONG, compareHeads: Object.freeze([]),
                                      temporal: false, emitterMask: true, c1OnTraining: true, test: "signflip",
                                      compareSize: Object.freeze({ size: "small", train: TRAIN }), results: RESULTS_R9 });
/**
 * Section 30: round 9's large network, schedule, test and controls, with ONE change -- trained on 96 scenes of family C,
 * the family it never beat the filter on. H1 on new scenes of C, H2 on new scenes of R, now the family not trained on.
 * Secondary: the filter and networks trained exactly as round 9 trained them, on its 96 scenes of R, on the same test images.
 */
export const ROUND10 = Object.freeze({ splits: SPLITS_R10, init: INIT, c0: true, head: "kernel", size: "large", train: TRAIN_LONG, compareHeads: Object.freeze([]),
                                       temporal: false, emitterMask: true, c1OnTraining: true, test: "signflip", compareTrainSplit: SPLITS_R7.train, results: RESULTS_R10 });
/**
 * Section 32, the deployment round: round 10's large network, schedule, test and controls, with ONE change -- ONE network
 * trained on both families, round 7's 96 scenes of R and round 10's 96 of C together. H1 on new scenes of R, H2 on new
 * scenes of C: both families it was trained on. Secondary: each family's own training -- the filter tuned and the
 * networks trained on its 96 scenes alone, as rounds 9 and 10 trained them -- on the same test images, and the primary
 * network against each family's own filter.
 */
export const ROUND11 = Object.freeze({ splits: SPLITS_R11, init: INIT, c0: true, head: "kernel", size: "large", train: TRAIN_LONG, compareHeads: Object.freeze([]),
                                       temporal: false, emitterMask: true, c1OnTraining: true, test: "signflip",
                                       compareTrainSplits: Object.freeze({ R: SPLITS_R7.train, C: SPLITS_R10.train }), results: RESULTS_R11 });
/**
 * Section 116, round 47 (denoise-smaller-network): round 11 exactly -- its 192 training scenes, schedule, seeds, test and
 * controls -- with ONE change, the network 16 channels wide (size "w16", SHAPE_KERNEL_W16), on new test scenes of both families.
 * Secondary: the 32-channel network round 11 shipped, trained again on the same scenes with the same schedule (compareSize),
 * measured on the same test images, so what the narrowing costs is read on one set of images.
 */
export const ROUND47 = Object.freeze({ ...ROUND11, splits: SPLITS_R47, size: "w16", compareTrainSplits: null,
                                       compareSize: Object.freeze({ size: "large", train: TRAIN_LONG }), results: RESULTS_R47 });
/**
 * tools/denoiseStudy.mjs's commands, each to its round, newest first (section 33). --secondary-r11 is round 11 exactly, writing its own file: the harvest's
 * results (render/denoise-results-r11.json) were written without section 32's secondary, and are never overwritten.
 */
export const HARVESTS = Object.freeze({
    "--harvest-r47": ROUND47,
    "--secondary-r11": Object.freeze({ ...ROUND11, results: "render/denoise-results-r11-secondary.json" }),
    "--harvest-r11": ROUND11, "--harvest-r10": ROUND10, "--harvest-r9": ROUND9, "--harvest-r8": ROUND8, "--harvest-r7": ROUND7, "--harvest-r6": ROUND6,
    "--harvest-r5": ROUND5, "--harvest-r4": ROUND4, "--harvest-r3": ROUND3, "--harvest-r2": ROUND2, "--harvest-r1": ROUND1,
});
/** What runStudy is handed for a round: every option the round names, as it names it, less the file it writes. */
export function studyOptions(round) {
    const { results, ...opts } = round;
    return opts;
}

/**
 * Section 79, THE MESH ROUND: the network and the filter the device ships, on scenes of the engine's own geometry, with
 * NOTHING trained or tuned here. The network is round 11's seed 1 as render/denoise-net-r11.json stores it -- the file
 * denoise.html loads -- and the filter is the setting that file names, tuned on round 11's 192 training scenes. The
 * caller decodes both (tools/denoiseStudy.mjs --harvest-mesh) and hands them in, so this module never reads a shipped
 * file it could read differently from the page.
 * C2 is CITED from round 11 (denoiseStats.verdict's c2Prior): this round trains no network, so it has no shuffled-target
 * network of its own; the one that trained this network lost to the filter there by a mean d of -1.856.
 */
export const RESULTS_MESH = "render/denoise-results-mesh.json";
export const SHIPPED_NET = "render/denoise-net-r11.json";
export const ROUND_MESH = Object.freeze({ splits: SPLITS_MESH, emitterMask: true, test: "signflip",
                                          c2Prior: Object.freeze({ round: 11, meanD: -1.8564223228700172, ok: true }), results: RESULTS_MESH });
/**
 * Round 56 (pre-registration section 127): section 79's round on the same shapes in family C's materials and light --
 * families VC and MC, the shipped pair, nothing trained, C2 cited from round 11 as section 79 cites it.
 */
export const RESULTS_MESH_C = "render/denoise-results-mesh-c.json";
export const ROUND_MESH_C = Object.freeze({ splits: SPLITS_MESH_C, emitterMask: true, test: "signflip", c2Prior: ROUND_MESH.c2Prior, results: RESULTS_MESH_C });
/**
 * Round 58 (pre-registration section 131): the same pair on path-tracer.html's own six scenes -- family P, one test set of 6,
 * so one hypothesis (no Holm step) and C1 at 5 of 6.
 */
export const RESULTS_PAGE = "render/denoise-results-page.json";
export const ROUND_PAGE = Object.freeze({ splits: SPLITS_PAGE, emitterMask: true, test: "signflip", c2Prior: ROUND_MESH.c2Prior, c1Min: 5, results: RESULTS_PAGE });
/**
 * The shipped pair on a test set, end to end: render T1 and T2 (each with its second reference, for C3), measure noisy,
 * filter, network and floor per image exactly as runStudy's `measure` does, and hand them to verdict(). C4 here is the
 * question a round with no training can ask -- the forward pass, run twice, bit for bit -- and C5 is runStudy's.
 * The network's column is ONE seed, the shipped one: a deployment question, about what the page runs.
 */
export function runShippedStudy({ splits = ROUND_MESH.splits, net, filter, emitterMask = ROUND_MESH.emitterMask, test = ROUND_MESH.test, c2Prior = ROUND_MESH.c2Prior, c1Min = undefined,
                                  harvest = false, image = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF, cache = null, log = () => {} } = {}) {
    if (!net || !filter) throw new Error("denoiseStudy: runShippedStudy needs the shipped network and filter, decoded by its caller");
    const t0 = Date.now(), timings = {};
    const lap = (k) => { timings[k] = Date.now() - t0; log(`${k} at ${(timings[k] / 1000).toFixed(1)} s`); };
    // round 58: the test sets are the split's own (T1, T2, ...), H1 on T1 and so on -- one set for the page's six scenes
    const sets = Object.keys(splits).filter((k) => /^T\d+$/.test(k)).sort();
    const config = { image, sppIn, sppRef, harvest, emitterMask, test, c2Prior, filter, ...(c1Min !== undefined ? { c1Min } : {}), trained: "nothing -- the shipped network and filter",
                     splits: Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, { family: v.family, n: v.seeds.length, first: v.seeds[0] }])) };
    const R = {};
    for (const name of sets) R[name] = renderSplit(splits[name], { harvest, image, sppIn, sppRef, ref2: true, emitterMask, cache });
    lap("tests rendered");
    const outs = Object.fromEntries(sets.map((name) => [name, R[name].map((im) => denoise(net, im.x, image, image).y)]));
    const again = R.T1.map((im) => denoise(net, im.x, image, image).y);
    const determinism = again.every((y, i) => y.length === outs.T1[i].length && y.every((v, j) => Object.is(v, outs.T1[i][j])));
    const allSeeds = Object.values(splits).flatMap((s) => s.seeds).flatMap((s) => { const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; });
    const seedsDistinct = new Set(allSeeds).size === allSeeds.length;
    const measure = (name) => ({
        noisy: R[name].map((im) => relMSE(noisyOf(im), im.ref)),
        filter: R[name].map((im) => relMSE(jointBilateral(im.x, image, image, filter), im.ref)),
        net: [R[name].map((im, i) => relMSE(outs[name][i], im.ref))],
        floor: R[name].map((im) => relMSE(im.ref2 ?? im.ref, im.ref)),
    });
    const tables = Object.fromEntries(sets.map((name) => [name, measure(name)]));
    lap("measured");
    const V = verdict({ sets: Object.fromEntries(sets.map((name) => ["H" + name.slice(1), tables[name]])), shuffled: null, c2Prior, determinism, seedsDistinct, test, ...(c1Min !== undefined ? { c1Min } : {}) });
    return { verdict: V, tables, filter, timings, determinism, seedsDistinct, seedCount: allSeeds.length, config };
}

/**
 * Section 81, THE UPSCALE ROUND: the shipped network on a frame traced at HALF resolution, brought to full resolution by
 * FSR1 (render/denoiseUpscale.mjs), against the frames it could be instead. Nothing trained or tuned. Per image, every
 * frame judged against the same full-size reference:
 *   A  full size, 4 samples, denoised -- today's page (reported, never tested: what the quarter costs)
 *   B  half size, 4 samples, denoised, then FSR1 -- the CANDIDATE
 *   C  the same denoised half-size frame, bilinear instead of FSR1 -- FSR1's control
 *   D  full size, 1 sample, denoised -- the SAME NUMBER OF SAMPLES as B
 * H1: B beats D. H2: B beats C. verdict()'s `filter` column is the arm B is held against and its `net` column is B; its
 * `noisy` is that hypothesis's own un-denoised frame (D's 1-sample input for H1, B's half-size input upscaled bilinearly
 * for H2), so C1 asks of both arms that they beat what they started from. C2 is cited from round 11, as in section 79.
 */
export const RESULTS_FSR1 = "render/denoise-results-fsr1.json";
export const ROUND_FSR1 = Object.freeze({ splits: SPLITS_FSR1, test: "signflip", c2Prior: ROUND_MESH.c2Prior, results: RESULTS_FSR1 });
/**
 * Section 89, ROUND 29: round 26's question at a frame size nearer real use -- 256 x 256, the half size 128 -- with EASU ALONE as
 * the candidate, because RCAS made every image worse at 64 x 64 (section 82). The same frames and hypotheses with B the half-size
 * frame through EASU: H1, B against D (full size at 1 sample, the same samples); H2, B against C (bilinear on the same frame).
 * FSR1 whole (EASU then RCAS) and RCAS without its denoise are reported against B, never tested.
 */
export const RESULTS_HALFRES = "render/denoise-results-halfres.json";
export const ROUND_HALFRES = Object.freeze({ splits: SPLITS_HALFRES, image: 256, candidate: "easu", test: "signflip", c2Prior: ROUND_MESH.c2Prior, results: RESULTS_HALFRES });
export function runUpscaleStudy({ splits = ROUND_FSR1.splits, net, test = ROUND_FSR1.test, c2Prior = ROUND_FSR1.c2Prior, candidate = "fsr1",
                                  harvest = false, image = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF, cache = null, log = () => {} } = {}) {
    if (!net) throw new Error("denoiseStudy: runUpscaleStudy needs the shipped network, decoded by its caller");
    if (candidate !== "fsr1" && candidate !== "easu") throw new Error(`denoiseStudy: the upscale round's candidate is "fsr1" (section 81) or "easu" (section 89), not "${candidate}"`);
    const t0 = Date.now(), timings = {};
    const lap = (k) => { timings[k] = Date.now() - t0; log(`${k} at ${(timings[k] / 1000).toFixed(1)} s`); };
    const split = splits.T1, half = image / 2;
    const label = candidate === "fsr1" ? "FSR1" : "EASU";
    const config = { image, half, sppIn, sppRef, harvest, test, c2Prior, upscale: { kind: candidate, rcasSharpness: RCAS_SHARPNESS, rcasDenoise: RCAS_DENOISE, gamma: GAMMA },
                     trained: "nothing -- the shipped network", split: { family: split.family, n: split.seeds.length, first: split.seeds[0] },
                     hypotheses: { H1: `B (half size + ${label}) against D (full size at 1 sample)`, H2: "B against C (half size + bilinear)" } };
    const ims = split.seeds.map((seed, i) => cached(cache, `upscale-${familyOf(split, i)}-${seed}-${image}-${sppIn}-${sppRef}-${harvest ? "harvest" : "gate"}`,
        () => renderUpscaleImages(familyOf(split, i), seed, { harvest, w: image, h: image, sppIn, sppRef })));
    lap("tests rendered");
    const den = (fr) => denoise(net, fr.x, fr.h, fr.w).y;
    const frames = (im) => { const h4 = den(im.half4); return {
        A: den(im.full4), B: upscale(h4, half, half, image, image, candidate), C: upscale(h4, half, half, image, image, "bilinear"), D: den(im.full1),
        easu: upscale(h4, half, half, image, image, "easu"), fsr1NoDenoise: upscale(h4, half, half, image, image, "fsr1-nodenoise"),
        // section 89: with EASU the candidate, FSR1 whole is a frame of its own, reported against it
        ...(candidate === "fsr1" ? {} : { fsr1: upscale(h4, half, half, image, image, "fsr1") }),
        noisyFull1: im.full1.input, noisyFull4: im.full4.input, noisyHalfUp: upscale(im.half4.input, half, half, image, image, "bilinear") }; };
    const F = ims.map(frames);
    // C4: the candidate's whole chain -- trace already done, so network and upscale -- twice, bit for bit
    const determinism = ims.every((im, i) => { const again = upscale(den(im.half4), half, half, image, image, candidate); return again.every((v, j) => Object.is(v, F[i].B[j])); });
    const allSeeds = split.seeds.flatMap((s) => Object.values(renderSeedsUpscale(s)));
    const seedsDistinct = new Set(allSeeds).size === allSeeds.length;
    const rel = (k) => F.map((f, i) => relMSE(f[k], ims[i].ref));
    const tables = Object.fromEntries(["A", "B", "C", "D", "easu", "fsr1NoDenoise", ...(candidate === "fsr1" ? [] : ["fsr1"]), "noisyFull1", "noisyFull4", "noisyHalfUp"].map((k) => [k, rel(k)]));
    tables.floor = ims.map((im) => relMSE(im.ref2, im.ref));
    lap("measured");
    const sets = { H1: { noisy: tables.noisyFull1, filter: tables.D, net: [tables.B], floor: tables.floor },
                   H2: { noisy: tables.noisyHalfUp, filter: tables.C, net: [tables.B], floor: tables.floor } };
    const V = verdict({ sets, shuffled: null, c2Prior, determinism, seedsDistinct, test });
    // reported, never tested: the price of the quarter (d of A against B: positive where the full-size frame was better),
    // and the two halves of FSR1 against the whole
    // (section 89, EASU the candidate: d of FSR1 whole and of RCAS without its denoise against B -- positive where EASU alone was better)
    const secondary = candidate === "fsr1"
        ? { priceOfHalf: effects(tables.B, tables.A), easuAloneVsFsr1: effects(tables.easu, tables.B), rcasNoDenoiseVsFsr1: effects(tables.fsr1NoDenoise, tables.B) }
        : { priceOfHalf: effects(tables.B, tables.A), fsr1VsEasu: effects(tables.fsr1, tables.B), rcasNoDenoiseVsEasu: effects(tables.fsr1NoDenoise, tables.B) };
    return { verdict: V, tables, secondary, timings, determinism, seedsDistinct, seedCount: allSeeds.length, config };
}

/**
 * Section 91, ROUND 30, THE EMITTER-AWARE UPSCALE: round 29's chain with the light sources taken out of the upscale. The
 * half-size frame's emitter pixels are filled from their neighbours, the rest goes through EASU, and the emitters are put
 * back at full size from the geometry -- E + (1 - cov) x the upscaled frame, emitterRadiance's coverage and emission
 * (render/denoiseUpscale.mjs's emitterAwareUpscale). Per image, every frame against the same full-size reference:
 *   A  full size, 4 samples, denoised -- today's page (reported)
 *   B  half size, 4 samples, denoised, emitter-aware EASU -- the CANDIDATE
 *   C  the same, emitter-aware bilinear -- EASU's control
 *   D  full size, 1 sample, denoised -- the same number of samples as B
 * H1: B beats D. H2: B beats C. H1's noisy frame is D's own 1-sample input; H2's is B's half-size input through the SAME
 * emitter-aware bilinear chain, so C1 asks of both arms that they beat what the composite alone gives the noise. Reported,
 * never tested: round 29's plain EASU and bilinear on the same frame, D with the emitters composited at full size, the
 * price of the quarter, and the share of each frame's error within 2 px of an emitter.
 */
export const RESULTS_EMITTER = "render/denoise-results-emitter.json";
export const ROUND_EMITTER = Object.freeze({ splits: SPLITS_EMITTER, image: 256, test: "signflip", c2Prior: ROUND_MESH.c2Prior, results: RESULTS_EMITTER });
/** Section 91's two hypotheses over a round 30 table: verdict()'s columns, by name, so the run and the verdict's re-derivation read one definition. */
export const emitterSets = (t) => ({ H1: { noisy: t.noisyFull1, filter: t.D, net: [t.B], floor: t.floor },
                                     H2: { noisy: t.noisyHalfAware, filter: t.C, net: [t.B], floor: t.floor } });
export function runEmitterAwareStudy({ splits = ROUND_EMITTER.splits, net, test = ROUND_EMITTER.test, c2Prior = ROUND_EMITTER.c2Prior,
                                       harvest = false, image = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF, cache = null, log = () => {} } = {}) {
    if (!net) throw new Error("denoiseStudy: runEmitterAwareStudy needs the shipped network, decoded by its caller");
    const t0 = Date.now(), timings = {};
    const lap = (k) => { timings[k] = Date.now() - t0; log(`${k} at ${(timings[k] / 1000).toFixed(1)} s`); };
    const split = splits.T1, half = image / 2;
    const config = { image, half, sppIn, sppRef, harvest, test, c2Prior,
                     upscale: { kind: "easu", gamma: GAMMA, coverageGrid: COVERAGE_GRID, fill: "cov > 0 at half size, filled ring by ring from the 8-neighbours known after the last ring",
                                composite: "E + (1 - cov) x the upscaled frame, emitterRadiance at full size" },
                     trained: "nothing -- the shipped network", split: { family: split.family, n: split.seeds.length, first: split.seeds[0] },
                     hypotheses: { H1: "B (half size + emitter-aware EASU) against D (full size at 1 sample)", H2: "B against C (half size + emitter-aware bilinear)" } };
    const ims = split.seeds.map((seed, i) => cached(cache, `upscale-${familyOf(split, i)}-${seed}-${image}-${sppIn}-${sppRef}-${harvest ? "harvest" : "gate"}`,
        () => renderUpscaleImages(familyOf(split, i), seed, { harvest, w: image, h: image, sppIn, sppRef })));
    lap("tests rendered");
    const maskOf = (fr) => Float64Array.from({ length: fr.w * fr.h }, (_, p) => fr.x[p * MASK_STRIDE + MASK_CHANNEL]);
    const fullOf = (i) => emitterRadiance(makeScene(familyOf(split, i), split.seeds[i]), image, image);
    const full = ims.map((im, i) => {
        const f = fullOf(i), m = maskOf(im.full4);
        // the composite's coverage IS the mask the network reads at full size -- a mismatch is a bug, and nothing is measured over it
        if (!f.cov.every((v, p) => Object.is(v, m[p]))) throw new Error(`denoiseStudy: image ${i}'s emitterRadiance coverage is not its full-size input's mask`);
        return f;
    });
    const den = (fr) => denoise(net, fr.x, fr.h, fr.w).y;
    const frames = (im, i) => {
        const h4 = den(im.half4), ch = maskOf(im.half4), F = full[i], D = den(im.full1);
        const aware = (img, kind) => emitterAwareUpscale(img, ch, half, half, image, image, kind, F);
        return { A: den(im.full4), B: aware(h4, "easu"), C: aware(h4, "bilinear"), D,
                 plainEasu: upscale(h4, half, half, image, image, "easu"), plainBilinear: upscale(h4, half, half, image, image, "bilinear"),
                 Daware: compositeEmitters(fillEmitters(D, F.cov, image, image), F),
                 noisyFull1: im.full1.input, noisyFull4: im.full4.input, noisyHalfAware: aware(im.half4.input, "bilinear"),
                 noisyHalfUp: upscale(im.half4.input, half, half, image, image, "bilinear") };
    };
    const Fr = ims.map(frames);
    // C4: the candidate's whole chain twice, bit for bit -- the network, the emitters' geometry, the fill, EASU, the composite
    const determinism = ims.every((im, i) => {
        const again = emitterAwareUpscale(den(im.half4), maskOf(im.half4), half, half, image, image, "easu", fullOf(i));
        return again.every((v, j) => Object.is(v, Fr[i].B[j]));
    });
    const allSeeds = split.seeds.flatMap((s) => Object.values(renderSeedsUpscale(s)));
    const seedsDistinct = new Set(allSeeds).size === allSeeds.length;
    const rel = (k) => Fr.map((f, i) => relMSE(f[k], ims[i].ref));
    const tables = Object.fromEntries(["A", "B", "C", "D", "plainEasu", "plainBilinear", "Daware", "noisyFull1", "noisyFull4", "noisyHalfAware", "noisyHalfUp"].map((k) => [k, rel(k)]));
    tables.floor = ims.map((im) => relMSE(im.ref2, im.ref));
    lap("measured");
    const sets = emitterSets(tables);
    const V = verdict({ sets, shuffled: null, c2Prior, determinism, seedsDistinct, test });
    // reported, never tested (each d positive where B was better, but the price of the quarter, positive where A was)
    const near = (k) => Fr.map((f, i) => nearEmitterShare(f[k], ims[i].ref, full[i].cov, image, image));
    const secondary = { priceOfHalf: effects(tables.B, tables.A), awareVsPlainEasu: effects(tables.plainEasu, tables.B), dAwareVsB: effects(tables.Daware, tables.B),
                        nearEmitter: { B: near("B"), C: near("C"), plainEasu: near("plainEasu"), D: near("D") },
                        emitterPixels: full.map((f) => f.cov.reduce((a, v) => a + (v > 0 ? 1 : 0), 0)) };
    return { verdict: V, tables, secondary, timings, determinism, seedsDistinct, seedCount: allSeeds.length, config };
}

/**
 * Section 95, ROUND 32, THE TEMPORAL UPSCALE: round 30's chain over a sequence of FRAMES jittered frames, accumulated at full
 * size (render/denoiseTemporalUpscale.mjs). Per image, against the measured frame's full-size reference:
 *   Bt  the CANDIDATE -- every frame half size at 4 samples, denoised, filled, EASU; accumulated; the light sources composited
 *   B1  the same chain on the measured frame alone, no history -- the same frame's data, so H1 is the history and nothing else
 *   Dt  every frame full size at 1 sample (the same samples a full-size pixel gets), denoised, accumulated the same way
 * H1: Bt beats B1. H2: Bt beats Dt. H1's noisy frame is the measured frame's half-size input through the same fill, bilinear
 * upscale, shift and composite (round 30's noisyHalfAware); H2's is the measured frame's 1-sample input, shifted. Reported,
 * never tested: Bt without the clamp, D1 (the measured frame alone at full size), Dt with the light sources composited, the
 * history length, and round 30's B on this round's images is NOT among them (it would need a frame no arm uses).
 */
export const RESULTS_TEMPORALUP = "render/denoise-results-temporalup.json";
export const ROUND_TEMPORALUP = Object.freeze({ splits: SPLITS_TEMPORALUP, image: 256, test: "signflip", c2Prior: ROUND_MESH.c2Prior, results: RESULTS_TEMPORALUP });
/** Section 95's two hypotheses over a round 32 table, by name, so the run and the verdict's re-derivation read one definition. */
export const temporalUpSets = (t) => ({ H1: { noisy: t.noisyHalf, filter: t.B1, net: [t.Bt], floor: t.floor },
                                        H2: { noisy: t.noisyFull1, filter: t.Dt, net: [t.Bt], floor: t.floor } });
/** One image's frames, every arm, from its rendered sequence: pure in (sequence, net), so C4 re-runs it whole. */
export function temporalUpFrames(seq, net) {
    const W = seq.w, H = seq.h, w = W / 2, h = H / 2, den = (fr) => denoise(net, fr.x, fr.h, fr.w).y, last = seq.frames.length - 1;
    const geo = sequenceGeometry(seq.family, seq.seed, seq.frames.map((f) => f.eye), W, H);
    const up = (img, cov, kind) => upscale(fillEmitters(img, cov, w, h), w, h, W, H, kind);
    const halfY = seq.frames.map((f) => ({ y: up(den(f.half), f.half.cov, "easu"), shift: halfShift(f.jitter) }));
    const fullY = seq.frames.map((f) => ({ y: den(f.full1), shift: [f.jitter[0], f.jitter[1]] }));
    const one = (fr) => shiftResample(fr.y, W, H, fr.shift[0], fr.shift[1]);
    const acc = accumulateUpscaled(halfY, geo, W, H), accNoClamp = accumulateUpscaled(halfY, geo, W, H, { clamp: false }), accD = accumulateUpscaled(fullY, geo, W, H);
    const m = seq.frames[last], comp = (y) => compositeEmitters(y, seq.full);
    return { light: acc.A, Bt: comp(acc.A), B1: comp(one(halfY[last])), Dt: accD.A, D1: one(fullY[last]), BtNoClamp: comp(accNoClamp.A),
             DtAware: compositeEmitters(fillEmitters(accD.A, seq.full.cov, W, H), seq.full),
             noisyHalf: comp(one({ y: up(m.half.input, m.half.cov, "bilinear"), shift: halfY[last].shift })), noisyFull1: one({ y: m.full1.input, shift: fullY[last].shift }),
             history: { meanN: acc.n.reduce((a, v) => a + v, 0) / acc.n.length, full: acc.n.filter((v) => v === seq.frames.length).length / acc.n.length } };
}
export function runTemporalUpscaleStudy({ splits = ROUND_TEMPORALUP.splits, net, test = ROUND_TEMPORALUP.test, c2Prior = ROUND_TEMPORALUP.c2Prior,
                                          harvest = false, image = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF, cache = null, log = () => {} } = {}) {
    if (!net) throw new Error("denoiseStudy: runTemporalUpscaleStudy needs the shipped network, decoded by its caller");
    const t0 = Date.now(), timings = {}, split = splits.T1;
    const lap = (k) => { timings[k] = Date.now() - t0; log(`${k} at ${(timings[k] / 1000).toFixed(1)} s`); };
    const config = { image, half: image / 2, sppIn, sppRef, harvest, test, c2Prior, frames: JITTER.length, jitter: JITTER,
                     accumulate: "reproject (round 4's rule) on each frame's unjittered grid, clamp to the current 3 x 3 range, n = min(n + 1, FRAMES)",
                     composite: "once, after the accumulation: E + (1 - cov) x it, emitterRadiance at full size from the measured frame's eye",
                     trained: "nothing -- the shipped network", split: { family: split.family, n: split.seeds.length, first: split.seeds[0] },
                     hypotheses: { H1: "Bt (the temporal upscale) against B1 (the same chain on the measured frame alone)", H2: "Bt against Dt (full size at 1 sample a frame, accumulated the same way)" } };
    // ONE IMAGE AT A TIME: a sequence is 16 frames, and twelve of them held at once is most of a gigabyte
    const keys = ["Bt", "B1", "Dt", "D1", "BtNoClamp", "DtAware", "noisyHalf", "noisyFull1"], tables = Object.fromEntries(keys.map((k) => [k, []]));
    tables.floor = [];
    const history = [];
    let determinism = true;
    split.seeds.forEach((seed, i) => {
        const fam = familyOf(split, i);
        const seq = cached(cache, `temporalup-${fam}-${seed}-${image}-${sppIn}-${sppRef}-${harvest ? "harvest" : "gate"}`,
            () => renderTemporalUpscaleImages(fam, seed, { harvest, w: image, h: image, sppIn, sppRef }));
        const F = temporalUpFrames(seq, net);
        for (const k of keys) tables[k].push(relMSE(F[k], seq.ref));
        tables.floor.push(relMSE(seq.ref2, seq.ref));
        history.push(F.history);
        // C4: the candidate's whole chain again on the first image, bit for bit -- the network, the fill, EASU, the shifts, the accumulation, the composite
        if (i === 0) determinism = temporalUpFrames(seq, net).Bt.every((v, j) => Object.is(v, F.Bt[j]));
        lap(`image ${i + 1} of ${split.seeds.length} (${fam} ${seed})`);
    });
    const allSeeds = split.seeds.flatMap((s) => { const r = temporalUpscaleSeeds(s); return [...r.half, ...r.full1, r.ref, r.ref2]; });
    const seedsDistinct = new Set(allSeeds).size === allSeeds.length;
    const V = verdict({ sets: temporalUpSets(tables), shuffled: null, c2Prior, determinism, seedsDistinct, test });
    const secondary = { clamp: effects(tables.BtNoClamp, tables.Bt), historyAtFull: effects(tables.D1, tables.Dt), dAwareVsBt: effects(tables.DtAware, tables.Bt), history };
    return { verdict: V, tables, secondary, timings, determinism, seedsDistinct, seedCount: allSeeds.length, config };
}

/**
 * Section 133, ROUND 59, FSR3's FRAME GENERATION between two of round 32's chain frames (render/denoiseFrameGen.mjs). Per image,
 * against a frame traced at the midpoint of the orbit's last step:
 *   G  the CANDIDATE -- interpolateFrameCPU at t = 0.5 between O6 and O7 along the scene's own motion, FRAMEGEN_FILL
 *   X  the cross-fade, 0.5 O6 + 0.5 O7         R  O6, the older frame repeated
 * H1: G beats X. H2: G beats R. Each hypothesis's noisy frame is the newer frame's half-size input through the chain's fill,
 * bilinear upscale, shift and composite. Reported, never tested: Bmid1 (the chain on the midpoint frame alone), G without its
 * fill, the holes, the field's check on the geometry.
 */
export const RESULTS_FRAMEGEN = "render/denoise-results-framegen.json";
export const ROUND_FRAMEGEN = Object.freeze({ splits: SPLITS_FRAMEGEN, image: 256, test: "signflip", c2Prior: ROUND_MESH.c2Prior, results: RESULTS_FRAMEGEN });
/** Section 133's two hypotheses over a round 59 table, by name, so the run and the verdict's re-derivation read one definition. */
export const frameGenSets = (t) => ({ H1: { noisy: t.noisy, filter: t.X, net: [t.G], floor: t.floor }, H2: { noisy: t.noisy, filter: t.R, net: [t.G], floor: t.floor } });
/**
 * Section 136, ROUND 60: the same generator between LIGHT-FREE frames (the chain's accumulations before the composite), every arm
 * then composited with the light sources at the midpoint (emitterRadiance from the midpoint eye) -- G' against the cross-fade X'
 * and the held frame R' made the same way, over the newer frame's noisy input composited the same way.
 */
export const RESULTS_FRAMEGEN_LF = "render/denoise-results-framegen-lf.json";
export const ROUND_FRAMEGEN_LF = Object.freeze({ splits: SPLITS_FRAMEGEN_LF, image: 256, test: "signflip", c2Prior: ROUND_MESH.c2Prior, arrangement: "lightFree", results: RESULTS_FRAMEGEN_LF });
export const frameGenSetsLightFree = (t) => ({ H1: { noisy: t.noisyMid, filter: t.Xl, net: [t.Gl], floor: t.floor }, H2: { noisy: t.noisyMid, filter: t.Rl, net: [t.Gl], floor: t.floor } });
/** Section 139, ROUND 61: the light-free arrangement graded in display space, C1 asked of the candidate alone, on new seeds. */
export const RESULTS_FRAMEGEN_DISPLAY = "render/denoise-results-framegen-display.json";
export const ROUND_FRAMEGEN_DISPLAY = Object.freeze({ splits: SPLITS_FRAMEGEN_DISPLAY, image: 256, test: "signflip", c2Prior: ROUND_MESH.c2Prior, arrangement: "lightFreeDisplay", c1Of: "candidate", results: RESULTS_FRAMEGEN_DISPLAY });
/** Round 26's transfer, Reinhard then gamma 2.2 -- the display space a secondary grades every arm in too, and round 61 grades in. */
export const toDisplay = (y) => Float64Array.from(y, toPerceptual);
export function runFrameGenStudy({ splits = ROUND_FRAMEGEN.splits, net, test = ROUND_FRAMEGEN.test, c2Prior = ROUND_FRAMEGEN.c2Prior, arrangement = "shown",
                                   harvest = false, image = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF, cache = null, log = () => {} } = {}) {
    if (!net) throw new Error("denoiseStudy: runFrameGenStudy needs the shipped network, decoded by its caller");
    if (!["shown", "lightFree", "lightFreeDisplay"].includes(arrangement)) throw new Error(`denoiseStudy: runFrameGenStudy's arrangement is "shown" (section 133), "lightFree" (section 136) or "lightFreeDisplay" (section 139), not ${arrangement}`);
    // round 61: "lightFreeDisplay" is round 60's arms graded in display space, and its linear grading kept as the secondary
    const lf = arrangement !== "shown", disp = arrangement === "lightFreeDisplay";
    const t0 = Date.now(), timings = {}, split = splits.T1;
    const lap = (k) => { timings[k] = Date.now() - t0; log(`${k} at ${(timings[k] / 1000).toFixed(1)} s`); };
    const config = { image, half: image / 2, sppIn, sppRef, harvest, test, c2Prior, fill: FRAMEGEN_FILL, t: 0.5, field: "the scene's own: eye 7's first hits projected into camera 6, per pixel",
                     trained: "nothing -- the shipped network", split: { family: split.family, n: split.seeds.length, first: split.seeds[0] },
                     arrangement, grading: disp ? "display: round 26's transfer, Reinhard then gamma 2.2, before relMSE" : "linear radiance", ...(disp ? { c1Of: "candidate" } : {}), hypotheses: lf
                         ? { H1: "G' (generated between L6 and L7, lit at the midpoint) against X' (their cross-fade, lit the same)", H2: "G' against R' (L6 held, lit the same)" }
                         : { H1: "G (generated between O6 and O7) against X (their cross-fade)", H2: "G against R (O6 repeated)" } };
    const keys = lf ? ["Gl", "Xl", "Rl", "noisyMid", "GlNoFill", "G", "X", "R", "O7", "noisy", "Bmid1"] : ["G", "X", "R", "O7", "noisy", "Bmid1", "GNoFill"], tables = Object.fromEntries(keys.map((k) => [k, []]));
    // round 60: and every arm graded in display space too, reported
    const display = lf ? Object.fromEntries(["Gl", "Xl", "Rl", "G", "X", "R"].map((k) => [k, []])) : null;
    tables.floor = [];
    const field = [];
    let determinism = true;
    // ONE IMAGE AT A TIME, as round 32: a sequence is nine frames and four full-size images
    split.seeds.forEach((seed, i) => {
        const fam = familyOf(split, i);
        const seq = cached(cache, `framegen-${fam}-${seed}-${image}-${sppIn}-${sppRef}-${harvest ? "harvest" : "gate"}`,
            () => renderFrameGenImages(fam, seed, { harvest, w: image, h: image, sppIn, sppRef }));
        const F = frameGenFrames(seq, net);
        const rD = disp ? toDisplay(seq.ref) : null;
        for (const k of keys) tables[k].push(disp ? relMSE(toDisplay(F[k]), rD) : relMSE(F[k], seq.ref));
        tables.floor.push(disp ? relMSE(toDisplay(seq.ref2), rD) : relMSE(seq.ref2, seq.ref));
        // the other space's grading, reported: display beside a linear run, linear beside a display one
        if (display) { const r = disp ? seq.ref : toDisplay(seq.ref); for (const k of Object.keys(display)) display[k].push(disp ? relMSE(F[k], r) : relMSE(toDisplay(F[k]), r)); }
        field.push(F.field);
        // C4: the candidate re-made from the same sequence, bit for bit -- the chain twice, the field, the splat, the fill
        const cand = lf ? "Gl" : "G";
        if (i === 0) determinism = frameGenFrames(seq, net)[cand].every((v, j) => Object.is(v, F[cand][j]));
        lap(`image ${i + 1} of ${split.seeds.length} (${fam} ${seed})`);
    });
    const allSeeds = split.seeds.flatMap((s) => { const r = frameGenSeeds(s); return [...r.half, r.mid, r.ref, r.ref2]; });
    const seedsDistinct = new Set(allSeeds).size === allSeeds.length;
    const V = verdict({ sets: (lf ? frameGenSetsLightFree : frameGenSets)(tables), shuffled: null, c2Prior, determinism, seedsDistinct, test, ...(disp ? { c1Of: "candidate" } : {}) });
    const secondary = lf
        ? { midTraced: effects(tables.Bmid1, tables.Gl), fill: effects(tables.GlNoFill, tables.Gl), overShown: effects(tables.G, tables.Gl), shown: { H1: effects(tables.X, tables.G), H2: effects(tables.R, tables.G) },
            // the other space's grading, named by its space: display beside a linear run (round 60), linear beside a display one (round 61)
            [disp ? "linear" : "display"]: { H1: effects(display.Xl, display.Gl), H2: effects(display.Rl, display.Gl), shownH1: effects(display.X, display.G) },
            [disp ? "linearTables" : "displayTables"]: display, field }
        : { midTraced: effects(tables.Bmid1, tables.G), fill: effects(tables.GNoFill, tables.G), newerShown: effects(tables.O7, tables.G), field };
    return { verdict: V, tables, secondary, timings, determinism, seedsDistinct, seedCount: allSeeds.length, config };
}

/** The miniature: the same pipeline, scenes seeded outside every split, sizes small enough for a gate. */
export const MINI = Object.freeze({
    splits: Object.freeze({
        train: Object.freeze({ family: "A", seeds: Object.freeze([910000, 910001, 910002]) }),
        val: Object.freeze({ family: "A", seeds: Object.freeze([920000]) }),
        T1: Object.freeze({ family: "A", seeds: Object.freeze([930000, 930001]) }),
        T2: Object.freeze({ family: "B", seeds: Object.freeze([940000, 940001]) }),
    }),
    image: 16, sppIn: 4, sppRef: 32, train: Object.freeze({ steps: 4, batch: 2, crop: 12 }), secondarySpp: Object.freeze([1]),
});

const noisyOf = (im) => im.input;

/** Control C2's training set: image i paired with the reference of image (i + 1) mod n -- a fixed derangement. */
export function shuffledTargets(set) {
    if (set.length < 2) throw new Error("denoiseStudy: a derangement needs at least two training images");
    return set.map((im, i) => ({ ...im, ref: set[(i + 1) % set.length].ref }));
}

/**
 * The stop before the tests: the "not reported" verdict when C0 (if on), C6 (if measured) or C1 (if decided on the
 * training images, section 26) fired, or null when the run may go on to render its test scenes. Nothing after a
 * non-null answer is rendered.
 */
export function stopBeforeTests(fit, hist, c0, c1Train = null) {
    return (c0 && !fit.ok) || (hist && !hist.ok) || (c1Train && !c1Train.ok) ? verdict({ c0: c0 ? fit : null, c6: hist, c1Train }) : null;
}

/**
 * Render one split's scenes and build their inputs. `ref2` for the test sets (control C3). With `temporal`, each scene
 * is a sequence (render/denoiseTemporal.mjs): `x` is the 13-channel input over the accumulated history, `x9` the
 * measured frame's own 9-channel input, `accum` the accumulation re-modulated -- the last two for the secondaries.
 */
export function renderSplit(split, { harvest, image, sppIn, sppRef, ref2, temporal = false, emitterMask = false, cache = null }) {
    return split.seeds.map((seed, i) => {
        const family = familyOf(split, i);
        // the key holds every argument the render reads -- and `harvest`, so a dataset scene is never served without it
        const key = `render-${temporal ? "seq" : "img"}-${family}-${seed}-${image}-${sppIn}-${sppRef}-${ref2 ? "ref2" : "ref1"}-${harvest ? "harvest" : "gate"}`;
        if (temporal) {
            const Q = cached(cache, key, () => renderSequence(family, seed, { harvest, w: image, h: image, sppIn, sppRef, ref2 }));
            return { ...Q, x: temporalChannels(Q), x9: inputChannels(Q.input, Q.albedo, Q.normal, image, image), accum: remodulate(Q.A, Q.albedo) };
        }
        const I = cached(cache, key, () => renderImages(family, seed, { harvest, w: image, h: image, sppIn, sppRef, ref2 }));
        const x9 = inputChannels(I.input, I.albedo, I.normal, image, image);
        if (!emitterMask) return { ...I, x: x9 };
        // section 21: the emitter coverage appended as a tenth channel; x9 kept for the no-mask secondary
        const emission = emitterCoverage(makeScene(family, seed), image, image);
        return { ...I, emission, x: withMask(x9, emission), x9 };
    });
}

// A training set's key: every input and reference, bit for bit, and the size. A filter is keyed by its set alone (the
// grid and the statistic are fixed); a network by its set and every training option, and by a tag -- control C4's
// second training is tagged "-again", so a resumed run still compares two trainings and never one record with itself.
const setKey = (set) => hashArrays(set.flatMap((s) => [s.x, s.ref, s.w, s.h]));
const tuned = (cache, set) => cached(cache, `filter-${setKey(set)}`, () => tuneFilter(set, relMSE).best);
const netKey = (set, opts, tag = "") => `net-${setKey(set)}-${hashArrays([JSON.stringify(opts)])}${tag}`;
const trained = (cache, set, opts, tag = "") => cached(cache, netKey(set, opts, tag), () => trainDenoiser(set, opts).net);
// several trainings at once (section 28): each kept and counted on its own, the missing ones trained side by side by
// render/denoisePool.mjs -- bit for bit what one after another gives. With a cache, each training also keeps a
// checkpoint every CHECKPOINT_EVERY steps (section 30), so a run stopped in the middle of a batch resumes each network
// where it was, not from its first step. An execution detail like `workers`: it changes no measured value, and a gate
// sets it small to reach a checkpoint in a few steps.
const trainedMany = (cache, jobs, workers, every) => {
    const keys = jobs.map((j) => netKey(j.set, j.opts, j.tag));
    return cachedMany(cache, keys, (miss) => trainParallel(miss.map((i) => ({ ...jobs[i], checkpoint: cache ? { dir: cache.dir, key: `ckpt-${keys[i]}`, every } : null })), workers));
};

/** The study. Returns { verdict, tables, filter, secondary, timings, config, ... }; tables is null when C0 or C6 stopped it. */
export function runStudy({ splits = ROUND2.splits, init = ROUND2.init, c0 = ROUND2.c0, head = "residual", compareHeads = [], temporal = false,
                           compareNoHistory = false, compareTrainSplit = null, compareTrainSplits = null, emitterMask = false, compareNoMask = false, c1OnTraining = false, size = "small", test = "sign",
                           compareSize = null, workers = 0, checkpointEvery = 250, harvest = false, image = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF, train = TRAIN, seeds = SEEDS,
                           secondarySpp = [1, 16], cache = null, log = () => {} } = {}) {
    const t0 = Date.now(), timings = {};
    const lap = (k) => { timings[k] = Date.now() - t0; log(`${k} at ${(timings[k] / 1000).toFixed(1)} s`); };
    const config = { image, sppIn, sppRef, train, seeds, harvest, init, c0, head, compareHeads, temporal, compareNoHistory, emitterMask, compareNoMask, c1OnTraining, size, test, compareSize,
                     compareTrain: compareTrainSplit ? { family: compareTrainSplit.family, n: compareTrainSplit.seeds.length, first: compareTrainSplit.seeds[0] } : null,
                     ...(compareTrainSplits ? { compareTrains: Object.fromEntries(Object.entries(compareTrainSplits).map(([f, x]) => [f, { family: x.family, n: x.seeds.length, first: x.seeds[0] }])) } : {}),
                     splits: Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, { family: v.family, n: v.seeds.length, first: v.seeds[0] }])) };
    const R = {};
    const render = (name) => { R[name] = renderSplit(splits[name], { harvest, image, sppIn, sppRef, ref2: name === "T1" || name === "T2", temporal, emitterMask, cache }); };
    for (const name of Object.keys(splits)) if (name !== "T1" && name !== "T2") render(name);
    lap("train rendered");
    const trainSet = R.train.map((im) => ({ x: im.x, ref: im.ref, w: image, h: image }));
    const filter = tuned(cache, trainSet);
    lap("filter tuned");
    // a network's options: the size is named only when it is not the small one, so a small network's options are word
    // for word what rounds 2-8 trained with
    const opt = (s, sz = size, tr = train, hd = head) => ({ seed: s, init, head: hd, ...tr, ...(sz !== "small" ? { size: sz } : {}) });
    const trainedNets = trainedMany(cache, [...seeds.map((s) => ({ set: trainSet, opts: opt(s) })), { set: trainSet, opts: opt(seeds[0]), tag: "-again" }], workers, checkpointEvery);
    const nets = trainedNets.slice(0, seeds.length), again = trainedNets[seeds.length];
    const flat = (net) => net.layers.flatMap((L) => [...L.W, ...L.b]);
    const a = flat(nets[0]), b = flat(again);
    const determinism = a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    lap("networks trained");
    // C0, on the training images, before a test scene exists
    const netTrain = nets.map((net) => R.train.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))), noisyTrain = R.train.map((im) => relMSE(noisyOf(im), im.ref));
    const fit = trainFit(netTrain, noisyTrain);
    lap("C0");
    // C1 (section 26), on the training images, before a test scene exists: both methods must beat the noisy input there
    const c1Train = c1OnTraining ? trainSanity(R.train.map((im) => relMSE(jointBilateral(im.x, image, image, filter), im.ref)), netTrain, noisyTrain) : null;
    if (c1OnTraining) lap("C1");
    // C6 (temporal only), on the training images, before a test scene exists: the shared history must beat one frame
    const hist = temporal ? historyFit(R.train.map((im) => relMSE(im.accum, im.ref)), R.train.map((im) => relMSE(noisyOf(im), im.ref))) : null;
    if (temporal) lap("C6");
    // C5 over every scene this study renders -- a sequence's history frames included
    const allSeeds = Object.values(splits).flatMap((s) => s.seeds).flatMap((s) => { if (temporal) return sequenceSeeds(s); const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; });
    const seedsDistinct = new Set(allSeeds).size === allSeeds.length;
    const stop = stopBeforeTests(fit, hist, c0, c1Train);
    if (stop) {
        return { verdict: stop, tables: null, filter, secondary: null, timings, determinism, seedsDistinct, seedCount: allSeeds.length, trainFit: fit, historyFit: hist, trainSanity: c1Train, config };
    }
    render("T1"); render("T2");
    lap("tests rendered");
    const shuffledSet = shuffledTargets(trainSet);
    const shuffledNets = trainedMany(cache, seeds.map((s) => ({ set: shuffledSet, opts: opt(s) })), workers, checkpointEvery);
    lap("shuffled networks trained");
    const measure = (ims) => ({
        noisy: ims.map((im) => relMSE(noisyOf(im), im.ref)),
        filter: ims.map((im) => relMSE(jointBilateral(im.x, image, image, filter), im.ref)),
        net: nets.map((net) => ims.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))),
        floor: ims.map((im) => relMSE(im.ref2 ?? im.ref, im.ref)),
    });
    const tables = { T1: measure(R.T1), T2: measure(R.T2), val: R.val ? measure(R.val) : null };
    // a comparison network's statistics against the primary filter on each test set, as for the primary -- reported, never
    // tested. With `filterX` ({ T1, T2 }: another filter's relMSE per test image), against that filter instead; with
    // `netsX` null, the primary networks'
    const statsOf = (netsX, filterX = null) => {
        const T = Object.fromEntries(["T1", "T2"].map((name) => [name, { ...tables[name],
            ...(netsX ? { net: netsX.map((net) => R[name].map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))) } : {}),
            ...(filterX ? { filter: filterX[name] } : {}) }]));
        const VS = verdict({ sets: { H1: T.T1, H2: T.T2 }, shuffled: null, determinism: true, seedsDistinct: true, c1Train, test });
        return Object.fromEntries([["T1", "H1"], ["T2", "H2"]].map(([name, h]) => [name, {
            net: T[name].net, k: VS.hypotheses[h].k, meanD: VS.hypotheses[h].meanD, p: VS.hypotheses[h].p, pSign: VS.hypotheses[h].pSign ?? VS.hypotheses[h].p }]));
    };
    const shuffled = shuffledNets.map((net) => R.T1.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref)));
    const V = verdict({ sets: { H1: tables.T1, H2: tables.T2 }, shuffled, determinism, seedsDistinct, c0: c0 ? fit : null, c6: hist, c1Train, test });
    lap("measured");
    // secondary: the trained networks on 1- and 16-sample inputs of the test scenes -- reported, never tested
    const secondary = {};
    for (const spp of secondarySpp) for (const name of ["T1", "T2"]) {
        // only the INPUT is new: the reference is the one the primary measurement used (a 1-sample "reference" is
        // rendered and dropped), so the secondary costs inputs, not another 1024 samples a pixel per scene
        const ims = renderSplit(splits[name], { harvest, image, sppIn: spp, sppRef: 1, ref2: false, temporal, emitterMask, cache }).map((im, i) => ({ ...im, ref: R[name][i].ref }));
        secondary[`${name}@${spp}spp`] = {
            noisy: ims.map((im) => relMSE(im.input, im.ref)),
            filter: ims.map((im) => relMSE(jointBilateral(im.x, image, image, filter), im.ref)),
            net: nets.map((net) => ims.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))),
        };
    }
    // secondary: other heads, trained identically on the same scenes and measured on the same test images -- reported,
    // never tested, never used to choose (section 15's comparison with round 2's residual network)
    for (const other of compareHeads) {
        const otherNets = seeds.map((s) => trained(cache, trainSet, opt(s, size, train, other)));
        for (const name of ["T1", "T2"]) secondary[`${name}@${other}`] = { net: otherNets.map((net) => R[name].map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))) };
    }
    // secondary (temporal): what the history alone buys, and both methods WITHOUT it on the same measured frames -- the
    // filter tuned again on the training scenes' single frames, and the network trained on them with the same seeds
    if (temporal) {
        const train9 = R.train.map((im) => ({ x: im.x9, ref: im.ref, w: image, h: image }));
        const filter9 = tuned(cache, train9);
        const nets9 = compareNoHistory ? seeds.map((s) => trained(cache, train9, opt(s))) : [];
        secondary.filterNoHistory = filter9;
        for (const name of ["T1", "T2"]) secondary[`${name}@noHistory`] = {
            accumulation: R[name].map((im) => relMSE(im.accum, im.ref)),
            filter: R[name].map((im) => relMSE(jointBilateral(im.x9, image, image, filter9), im.ref)),
            net: nets9.map((net) => R[name].map((im) => relMSE(denoise(net, im.x9, image, image).y, im.ref))),
        };
    }
    // secondary (section 19): the same filter and head trained on ANOTHER training split -- round 3's family A alone --
    // and measured on this round's test images, to say what the mixed training changed. Section 32 names several, one per
    // family ("trainedOnR", "trainedOnC"); one is "otherTraining", as rounds 5-10 named it
    const others = compareTrainSplits ? Object.entries(compareTrainSplits).map(([f, x]) => [`trainedOn${f}`, x]) : compareTrainSplit ? [["otherTraining", compareTrainSplit]] : [];
    for (const [label, split] of others) {
        const other = renderSplit(split, { harvest, image, sppIn, sppRef, ref2: false, temporal, emitterMask, cache }).map((im) => ({ x: im.x, ref: im.ref, w: image, h: image }));
        const filterO = tuned(cache, other), netsO = trainedMany(cache, seeds.map((s) => ({ set: other, opts: opt(s) })), workers, checkpointEvery);
        secondary[`filter${label[0].toUpperCase()}${label.slice(1)}`] = filterO;
        const filterRel = Object.fromEntries(["T1", "T2"].map((name) => [name, R[name].map((im) => relMSE(jointBilateral(im.x, image, image, filterO), im.ref))]));
        // section 30 tests by sign flips, and reports the other training's statistics as it reports the small network's in
        // section 28; every earlier round's secondary is as it was
        const SO = test === "signflip" ? statsOf(netsO) : null;
        // section 32: and the PRIMARY networks against this training's filter -- each family's own, which a device that
        // knew the family could run instead
        const PF = compareTrainSplits && test === "signflip" ? statsOf(null, filterRel) : null;
        for (const name of ["T1", "T2"]) secondary[`${name}@${label}`] = {
            filter: filterRel[name],
            net: netsO.map((net) => R[name].map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))),
            ...(SO ? { k: SO[name].k, meanD: SO[name].meanD, p: SO[name].p, pSign: SO[name].pSign } : {}),
            ...(PF ? { primaryVsFilter: { k: PF[name].k, meanD: PF[name].meanD, p: PF[name].p, pSign: PF[name].pSign } } : {}),
        };
    }
    // secondary (section 21): both methods WITHOUT the emitter mask -- the filter tuned and the network trained on the
    // same training scenes' 9-channel inputs -- on the same test images, to say what the mask changed
    if (emitterMask && compareNoMask) {
        const train9 = R.train.map((im) => ({ x: im.x9, ref: im.ref, w: image, h: image }));
        const filter9 = tuned(cache, train9), nets9 = seeds.map((s) => trained(cache, train9, opt(s)));
        secondary.filterNoMask = filter9;
        for (const name of ["T1", "T2"]) secondary[`${name}@noMask`] = {
            filter: R[name].map((im) => relMSE(jointBilateral(im.x9, image, image, filter9), im.ref)),
            net: nets9.map((net) => R[name].map((im) => relMSE(denoise(net, im.x9, image, image).y, im.ref))),
        };
    }
    // secondary (section 28): another SIZE of network, trained on the same scenes with its own schedule, on the same test
    // images -- each hypothesis's statistics for it as for the primary, both tests, reported and never tested
    if (compareSize) {
        const netsS = trainedMany(cache, seeds.map((s) => ({ set: trainSet, opts: opt(s, compareSize.size, compareSize.train) })), workers, checkpointEvery);
        const SS = statsOf(netsS);
        for (const name of ["T1", "T2"]) secondary[`${name}@${compareSize.size}`] = SS[name];
    }
    lap("secondary");
    return { verdict: V, tables, filter, secondary, timings, determinism, seedsDistinct, seedCount: allSeeds.length, trainFit: fit, historyFit: hist, trainSanity: c1Train, config };
}
