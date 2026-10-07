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
// *** WITHOUT --harvest IT WILL NOT TOUCH THE DATASET. *** runStudy() passes `harvest` through to
// render/denoiseScenes.mjs's renderImages(), which refuses every dataset seed without it; this round commits the
// runner and gates it on --mini's scenes, seeded outside every split. The harvest round is the first to pass the flag.
"use strict";
import { SPLITS, IMAGE, SPP_IN, SPP_REF, renderImages, renderSeeds, inputChannels } from "./denoiseScenes.mjs";
import { jointBilateral, tuneFilter } from "./denoiseFilter.mjs";
import { trainDenoiser, denoise, TRAIN } from "./denoiseNet.mjs";
import { relMSE, verdict } from "./denoiseStats.mjs";

export const SEEDS = Object.freeze([1, 2, 3]);
export const RESULTS = "render/denoise-results.json";

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

/** Render one split's scenes and build their inputs. `ref2` for the test sets (control C3). */
export function renderSplit(split, { harvest, image, sppIn, sppRef, ref2 }) {
    return split.seeds.map((seed) => {
        const I = renderImages(split.family, seed, { harvest, w: image, h: image, sppIn, sppRef, ref2 });
        return { ...I, x: inputChannels(I.input, I.albedo, I.normal, image, image) };
    });
}

/** The study. Returns { verdict, tables, filter, secondary, timings, config }. */
export function runStudy({ splits = SPLITS, harvest = false, image = IMAGE, sppIn = SPP_IN, sppRef = SPP_REF, train = TRAIN,
                           seeds = SEEDS, secondarySpp = [1, 16], log = () => {} } = {}) {
    const t0 = Date.now(), timings = {};
    const lap = (k) => { timings[k] = Date.now() - t0; log(`${k} at ${(timings[k] / 1000).toFixed(1)} s`); };
    const R = {};
    for (const [name, split] of Object.entries(splits)) R[name] = renderSplit(split, { harvest, image, sppIn, sppRef, ref2: name === "T1" || name === "T2" });
    lap("rendered");
    const trainSet = R.train.map((im) => ({ x: im.x, ref: im.ref, w: image, h: image }));
    const filter = tuneFilter(trainSet, relMSE).best;
    lap("filter tuned");
    const nets = seeds.map((s) => trainDenoiser(trainSet, { seed: s, ...train }).net);
    const again = trainDenoiser(trainSet, { seed: seeds[0], ...train }).net;
    const flat = (net) => net.layers.flatMap((L) => [...L.W, ...L.b]);
    const a = flat(nets[0]), b = flat(again);
    const determinism = a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    lap("networks trained");
    const shuffledSet = shuffledTargets(trainSet);
    const shuffledNets = seeds.map((s) => trainDenoiser(shuffledSet, { seed: s, ...train }).net);
    lap("shuffled networks trained");
    // C5 over every scene this study rendered
    const allSeeds = Object.values(splits).flatMap((s) => s.seeds).flatMap((s) => { const r = renderSeeds(s); return [r.input, r.ref, r.ref2]; });
    const seedsDistinct = new Set(allSeeds).size === allSeeds.length;
    const measure = (ims) => ({
        noisy: ims.map((im) => relMSE(noisyOf(im), im.ref)),
        filter: ims.map((im) => relMSE(jointBilateral(im.x, image, image, filter), im.ref)),
        net: nets.map((net) => ims.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))),
        floor: ims.map((im) => relMSE(im.ref2 ?? im.ref, im.ref)),
    });
    const tables = { T1: measure(R.T1), T2: measure(R.T2), val: R.val ? measure(R.val) : null };
    const shuffled = shuffledNets.map((net) => R.T1.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref)));
    const V = verdict({ sets: { H1: tables.T1, H2: tables.T2 }, shuffled, determinism, seedsDistinct });
    lap("measured");
    // secondary: the trained networks on 1- and 16-sample inputs of the test scenes -- reported, never tested
    const secondary = {};
    for (const spp of secondarySpp) for (const name of ["T1", "T2"]) {
        // only the INPUT is new: the reference is the one the primary measurement used (a 1-sample "reference" is
        // rendered and dropped), so the secondary costs inputs, not another 1024 samples a pixel per scene
        const ims = renderSplit(splits[name], { harvest, image, sppIn: spp, sppRef: 1, ref2: false }).map((im, i) => ({ ...im, ref: R[name][i].ref }));
        secondary[`${name}@${spp}spp`] = {
            noisy: ims.map((im) => relMSE(im.input, im.ref)),
            filter: ims.map((im) => relMSE(jointBilateral(im.x, image, image, filter), im.ref)),
            net: nets.map((net) => ims.map((im) => relMSE(denoise(net, im.x, image, image).y, im.ref))),
        };
    }
    lap("secondary");
    return { verdict: V, tables, filter, secondary, timings, determinism, seedsDistinct,
             config: { image, sppIn, sppRef, train, seeds, harvest, splits: Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, { family: v.family, n: v.seeds.length }])) } };
}
