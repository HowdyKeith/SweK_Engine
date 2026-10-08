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
"use strict";
import { SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6, familyOf, makeScene, IMAGE, SPP_IN, SPP_REF, renderImages, renderSeeds, inputChannels, remodulate } from "./denoiseScenes.mjs";
import { renderSequence, temporalChannels, sequenceSeeds } from "./denoiseTemporal.mjs";
import { withMask, emitterCoverage } from "./denoiseMask.mjs";
import { jointBilateral, tuneFilter } from "./denoiseFilter.mjs";
import { trainDenoiser, denoise, TRAIN, INIT } from "./denoiseNet.mjs";
import { relMSE, verdict, trainFit, historyFit } from "./denoiseStats.mjs";

export const SEEDS = Object.freeze([1, 2, 3]);
export const RESULTS = "render/denoise-results.json";
export const RESULTS_R2 = "render/denoise-results-r2.json";
export const RESULTS_R3 = "render/denoise-results-r3.json";
export const RESULTS_R4 = "render/denoise-results-r4.json";
export const RESULTS_R5 = "render/denoise-results-r5.json";
export const RESULTS_R6 = "render/denoise-results-r6.json";

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
 * The stop before the tests: the "not reported" verdict when C0 (if on) or C6 (if measured) fired on the training
 * images, or null when the run may go on to render its test scenes. Nothing after a non-null answer is rendered.
 */
export function stopBeforeTests(fit, hist, c0) {
    return (c0 && !fit.ok) || (hist && !hist.ok) ? verdict({ c0: fit, c6: hist }) : null;
}

/**
 * Render one split's scenes and build their inputs. `ref2` for the test sets (control C3). With `temporal`, each scene
 * is a sequence (render/denoiseTemporal.mjs): `x` is the 13-channel input over the accumulated history, `x9` the
 * measured frame's own 9-channel input, `accum` the accumulation re-modulated -- the last two for the secondaries.
 */
export function renderSplit(split, { harvest, image, sppIn, sppRef, ref2, temporal = false, emitterMask = false }) {
    return split.seeds.map((seed, i) => {
        const family = familyOf(split, i);
        if (temporal) {
            const Q = renderSequence(family, seed, { harvest, w: image, h: image, sppIn, sppRef, ref2 });
            return { ...Q, x: temporalChannels(Q), x9: inputChannels(Q.input, Q.albedo, Q.normal, image, image), accum: remodulate(Q.A, Q.albedo) };
        }
        const I = renderImages(family, seed, { harvest, w: image, h: image, sppIn, sppRef, ref2 });
        const x9 = inputChannels(I.input, I.albedo, I.normal, image, image);
        if (!emitterMask) return { ...I, x: x9 };
        // section 21: the emitter coverage appended as a tenth channel; x9 kept for the no-mask secondary
        const emission = emitterCoverage(makeScene(family, seed), image, image);
        return { ...I, emission, x: withMask(x9, emission), x9 };
    });
}

/** The study. Returns { verdict, tables, filter, secondary, timings, config, ... }; tables is null when C0 or C6 stopped it. */
export function runStudy({ splits = ROUND2.splits, init = ROUND2.init, c0 = ROUND2.c0, head = "residual", compareHeads = [], temporal = false,
                           compareNoHistory = false, compareTrainSplit = null, emitterMask = false, compareNoMask = false, harvest = false, image = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF, train = TRAIN, seeds = SEEDS,
                           secondarySpp = [1, 16], log = () => {} } = {}) {
    const t0 = Date.now(), timings = {};
    const lap = (k) => { timings[k] = Date.now() - t0; log(`${k} at ${(timings[k] / 1000).toFixed(1)} s`); };
    const config = { image, sppIn, sppRef, train, seeds, harvest, init, c0, head, compareHeads, temporal, compareNoHistory, emitterMask, compareNoMask,
                     compareTrain: compareTrainSplit ? { family: compareTrainSplit.family, n: compareTrainSplit.seeds.length, first: compareTrainSplit.seeds[0] } : null,
                     splits: Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, { family: v.family, n: v.seeds.length, first: v.seeds[0] }])) };
    const R = {};
    const render = (name) => { R[name] = renderSplit(splits[name], { harvest, image, sppIn, sppRef, ref2: name === "T1" || name === "T2", temporal, emitterMask }); };
    for (const name of Object.keys(splits)) if (name !== "T1" && name !== "T2") render(name);
    lap("train rendered");
    const trainSet = R.train.map((im) => ({ x: im.x, ref: im.ref, w: image, h: image }));
    const filter = tuneFilter(trainSet, relMSE).best;
    lap("filter tuned");
    const nets = seeds.map((s) => trainDenoiser(trainSet, { seed: s, init, head, ...train }).net);
    const again = trainDenoiser(trainSet, { seed: seeds[0], init, head, ...train }).net;
    const flat = (net) => net.layers.flatMap((L) => [...L.W, ...L.b]);
    const a = flat(nets[0]), b = flat(again);
    const determinism = a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    lap("networks trained");
    // C0, on the training images, before a test scene exists
    const fit = trainFit(nets.map((net) => R.train.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))), R.train.map((im) => relMSE(noisyOf(im), im.ref)));
    lap("C0");
    // C6 (temporal only), on the training images, before a test scene exists: the shared history must beat one frame
    const hist = temporal ? historyFit(R.train.map((im) => relMSE(im.accum, im.ref)), R.train.map((im) => relMSE(noisyOf(im), im.ref))) : null;
    if (temporal) lap("C6");
    // C5 over every scene this study renders -- a sequence's history frames included
    const allSeeds = Object.values(splits).flatMap((s) => s.seeds).flatMap((s) => { if (temporal) return sequenceSeeds(s); const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; });
    const seedsDistinct = new Set(allSeeds).size === allSeeds.length;
    const stop = stopBeforeTests(fit, hist, c0);
    if (stop) {
        return { verdict: stop, tables: null, filter, secondary: null, timings, determinism, seedsDistinct, seedCount: allSeeds.length, trainFit: fit, historyFit: hist, config };
    }
    render("T1"); render("T2");
    lap("tests rendered");
    const shuffledSet = shuffledTargets(trainSet);
    const shuffledNets = seeds.map((s) => trainDenoiser(shuffledSet, { seed: s, init, head, ...train }).net);
    lap("shuffled networks trained");
    const measure = (ims) => ({
        noisy: ims.map((im) => relMSE(noisyOf(im), im.ref)),
        filter: ims.map((im) => relMSE(jointBilateral(im.x, image, image, filter), im.ref)),
        net: nets.map((net) => ims.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))),
        floor: ims.map((im) => relMSE(im.ref2 ?? im.ref, im.ref)),
    });
    const tables = { T1: measure(R.T1), T2: measure(R.T2), val: R.val ? measure(R.val) : null };
    const shuffled = shuffledNets.map((net) => R.T1.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref)));
    const V = verdict({ sets: { H1: tables.T1, H2: tables.T2 }, shuffled, determinism, seedsDistinct, c0: c0 ? fit : null, c6: hist });
    lap("measured");
    // secondary: the trained networks on 1- and 16-sample inputs of the test scenes -- reported, never tested
    const secondary = {};
    for (const spp of secondarySpp) for (const name of ["T1", "T2"]) {
        // only the INPUT is new: the reference is the one the primary measurement used (a 1-sample "reference" is
        // rendered and dropped), so the secondary costs inputs, not another 1024 samples a pixel per scene
        const ims = renderSplit(splits[name], { harvest, image, sppIn: spp, sppRef: 1, ref2: false, temporal, emitterMask }).map((im, i) => ({ ...im, ref: R[name][i].ref }));
        secondary[`${name}@${spp}spp`] = {
            noisy: ims.map((im) => relMSE(im.input, im.ref)),
            filter: ims.map((im) => relMSE(jointBilateral(im.x, image, image, filter), im.ref)),
            net: nets.map((net) => ims.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))),
        };
    }
    // secondary: other heads, trained identically on the same scenes and measured on the same test images -- reported,
    // never tested, never used to choose (section 15's comparison with round 2's residual network)
    for (const other of compareHeads) {
        const otherNets = seeds.map((s) => trainDenoiser(trainSet, { seed: s, init, head: other, ...train }).net);
        for (const name of ["T1", "T2"]) secondary[`${name}@${other}`] = { net: otherNets.map((net) => R[name].map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))) };
    }
    // secondary (temporal): what the history alone buys, and both methods WITHOUT it on the same measured frames -- the
    // filter tuned again on the training scenes' single frames, and the network trained on them with the same seeds
    if (temporal) {
        const train9 = R.train.map((im) => ({ x: im.x9, ref: im.ref, w: image, h: image }));
        const filter9 = tuneFilter(train9, relMSE).best;
        const nets9 = compareNoHistory ? seeds.map((s) => trainDenoiser(train9, { seed: s, init, head, ...train }).net) : [];
        secondary.filterNoHistory = filter9;
        for (const name of ["T1", "T2"]) secondary[`${name}@noHistory`] = {
            accumulation: R[name].map((im) => relMSE(im.accum, im.ref)),
            filter: R[name].map((im) => relMSE(jointBilateral(im.x9, image, image, filter9), im.ref)),
            net: nets9.map((net) => R[name].map((im) => relMSE(denoise(net, im.x9, image, image).y, im.ref))),
        };
    }
    // secondary (section 19): the same filter and head trained on ANOTHER training split -- round 3's family A alone --
    // and measured on this round's test images, to say what the mixed training changed
    if (compareTrainSplit) {
        const other = renderSplit(compareTrainSplit, { harvest, image, sppIn, sppRef, ref2: false, temporal }).map((im) => ({ x: im.x, ref: im.ref, w: image, h: image }));
        const filterO = tuneFilter(other, relMSE).best, netsO = seeds.map((s) => trainDenoiser(other, { seed: s, init, head, ...train }).net);
        secondary.filterOtherTraining = filterO;
        for (const name of ["T1", "T2"]) secondary[`${name}@otherTraining`] = {
            filter: R[name].map((im) => relMSE(jointBilateral(im.x, image, image, filterO), im.ref)),
            net: netsO.map((net) => R[name].map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))),
        };
    }
    // secondary (section 21): both methods WITHOUT the emitter mask -- the filter tuned and the network trained on the
    // same training scenes' 9-channel inputs -- on the same test images, to say what the mask changed
    if (emitterMask && compareNoMask) {
        const train9 = R.train.map((im) => ({ x: im.x9, ref: im.ref, w: image, h: image }));
        const filter9 = tuneFilter(train9, relMSE).best, nets9 = seeds.map((s) => trainDenoiser(train9, { seed: s, init, head, ...train }).net);
        secondary.filterNoMask = filter9;
        for (const name of ["T1", "T2"]) secondary[`${name}@noMask`] = {
            filter: R[name].map((im) => relMSE(jointBilateral(im.x9, image, image, filter9), im.ref)),
            net: nets9.map((net) => R[name].map((im) => relMSE(denoise(net, im.x9, image, image).y, im.ref))),
        };
    }
    lap("secondary");
    return { verdict: V, tables, filter, secondary, timings, determinism, seedsDistinct, seedCount: allSeeds.length, trainFit: fit, historyFit: hist, config };
}
