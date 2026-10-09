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
import { SPLITS, SPLITS_R2, SPLITS_R3, SPLITS_R4, SPLITS_R5, SPLITS_R6, SPLITS_R7, SPLITS_R8, SPLITS_R9, SPLITS_R10, SPLITS_R11, familyOf, makeScene, IMAGE, SPP_IN, SPP_REF, renderImages, renderSeeds, inputChannels, remodulate } from "./denoiseScenes.mjs";
import { renderSequence, temporalChannels, sequenceSeeds } from "./denoiseTemporal.mjs";
import { withMask, emitterCoverage } from "./denoiseMask.mjs";
import { jointBilateral, tuneFilter } from "./denoiseFilter.mjs";
import { trainDenoiser, denoise, TRAIN, TRAIN_LONG, INIT } from "./denoiseNet.mjs";
import { relMSE, verdict, trainFit, historyFit, trainSanity } from "./denoiseStats.mjs";
import { cached, cachedMany, hashArrays } from "./denoiseCache.mjs";
import { trainParallel } from "./denoisePool.mjs";

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
 * tools/denoiseStudy.mjs's commands, each to its round, newest first (section 33). --secondary-r11 is round 11 exactly, writing its own file: the harvest's
 * results (render/denoise-results-r11.json) were written without section 32's secondary, and are never overwritten.
 */
export const HARVESTS = Object.freeze({
    "--secondary-r11": Object.freeze({ ...ROUND11, results: "render/denoise-results-r11-secondary.json" }),
    "--harvest-r11": ROUND11, "--harvest-r10": ROUND10, "--harvest-r9": ROUND9, "--harvest-r8": ROUND8, "--harvest-r7": ROUND7, "--harvest-r6": ROUND6,
    "--harvest-r5": ROUND5, "--harvest-r4": ROUND4, "--harvest-r3": ROUND3, "--harvest-r2": ROUND2, "--harvest-r1": ROUND1,
});
/** What runStudy is handed for a round: every option the round names, as it names it, less the file it writes. */
export function studyOptions(round) {
    const { results, ...opts } = round;
    return opts;
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
