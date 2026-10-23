// WebGLEngine/brain/pilotJetMlp.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GPU BRAIN'S PILOT FOR THE JET: brain/pilotFlightMlp.mjs's plain multilayer perceptron -- 18 features -> 32 relu -> 32 relu -> 4 outputs, 1,796 weights, the network brain/mlp.js's BatchedMLP runs on the GPU -- reading the jet's eighteen numbers (brain/pilotJetPolicy.mjs: they are imported, not restated, because "the same senses as the fruit fly" is the point) and holding the jet's
// hand pilot (autopilotFlight.mjs, AUTOPILOT_JET_FIGHT) in its hand weights, to float32. forward(), raw(), controlsOf(), layersOf(), the weight count and the zero weights are the trainer's MLP's own, re-exported: a weight file for this layout is a weight file for that network, and the two differ in what the features mean and in the weights that read them.
//
// THE HAND WEIGHTS: the first eight first-layer neurons carry the fruit fly's pair of channels for each output (taken from pilotJetPolicy.handWeights()), the ninth is the angle-of-attack limiter's neuron (relu(kAlpha (0.2 f12 + lead 0.5 f13 - limit f14)) -- see pilotJetPolicy's header: upright x the limiter's excess); the second layer passes those nine through unchanged (relu(relu(z)) = relu(z)); the third layer reads
// the pairs back as +1 and -1 and the limiter's neuron as -1 into the pitch. The other 23 neurons of each layer have zero weights and are the room a search has to grow into.
//
// Pure: no DOM, no clock, no random. The CPU twin is what a search runs; layersOf() hands the same weights to the GPU and to render/brainTsl.mjs's mlpLayerCpu.
"use strict";
import * as PM from "./pilotFlightMlp.mjs";
import * as PJ from "./pilotJetPolicy.mjs";

export const FEATURES = PM.FEATURES, OUTPUTS = PM.OUTPUTS, WIDTH = PM.WIDTH, HIDDEN = PM.HIDDEN, LAYER_SIZES = PM.LAYER_SIZES, WEIGHT_COUNT = PM.WEIGHT_COUNT;
export const FEATURE_NAMES = PJ.FEATURE_NAMES, OUTPUT_NAMES = PJ.OUTPUT_NAMES, JET_GAINS = PJ.JET_GAINS;
export const zeroWeights = PM.zeroWeights, raw = PM.raw, controlsOf = PM.controlsOf, forward = PM.forward, layersOf = PM.layersOf;
/** The search's moves, the trainer's MLP's own: brain/dogfightTrain.mjs asks a policy for them (perturb: every weight; mutate: one to maxK weights, the sparse move). */
export const perturb = PM.perturb, mutate = PM.mutate;
export const features = PJ.features, featuresFrom = PJ.featuresFrom;
/** A pilot (state, target, wind) -> controls from weights: the autopilot's own contract, for the jet. */
export function pilotFor(w, gains = JET_GAINS) { return (state, target, wind = [0, 0, 0]) => forward(w, features(state, target, wind, gains)); }

/** The jet's hand pilot in this network's weights (see the header). `gains` default to the fighting pilot's; a set without an angle-of-attack limit writes no limiter neuron. */
export function handWeights(gains = JET_GAINS) {
    const hw = PJ.handWeights(gains), w = zeroWeights(), L = layersOf(w), n = PJ.LIMITER_NEURON + (hw[PJ.LIMITER_NEURON * FEATURES + 12] !== 0 ? 1 : 0);   // the eight channels, and the limiter's neuron when the gains have a limiter
    const pfW2 = PJ.FEATURES * PJ.HIDDEN + PJ.HIDDEN + PJ.REC_EDGES;
    for (let h = 0; h < n; h++) {
        for (let f = 0; f < FEATURES; f++) L[0].W[h * FEATURES + f] = hw[h * FEATURES + f];   // first layer: the fruit fly's rows
        L[1].W[h * WIDTH + h] = 1;                                                            // second layer: pass them on
    }
    for (let o = 0; o < OUTPUTS; o++) for (let h = 0; h < n; h++) L[2].W[o * WIDTH + h] = hw[pfW2 + o * PJ.HIDDEN + h];   // third layer: the fruit fly's readout
    return w;
}

export function reportLines() {
    const w = handWeights();
    return [
        `[pilotJetMlp] the GPU Brain's pilot for the jet: ${LAYER_SIZES.join(" -> ")} (relu, relu, linear), ${WEIGHT_COUNT} weights, the jet's ${FEATURES} features in and the same four controls out`,
        `  hand weights: ${w.reduce((k, v) => k + (v !== 0 ? 1 : 0), 0)} of ${WEIGHT_COUNT} non-zero; they are AUTOPILOT_JET_FIGHT's laws (through nine relu channels of each layer) and fly the same flight`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
