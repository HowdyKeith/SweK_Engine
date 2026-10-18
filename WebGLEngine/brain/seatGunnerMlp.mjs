// WebGLEngine/brain/seatGunnerMlp.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GPU BRAIN IN A GUN SEAT: brain/seatGunnerPolicy.mjs's gunner (the hand gunner's sight, a network for the hand: a correction to the aim and the trigger) with a plain 12 -> 32 -> 32 -> 3 relu network where the fruit fly's escape circuit was --
// the shape brain/pilotFlightMlp.mjs gave the flight pilot, and the same contract: features(), forward(), layersOf(), handWeights(), zeroWeights(), perturb(), mutate(), gunnerFor(), gunnerFactory(). The twelve features and the three outputs are the fruit fly's
// (they are imported, not restated), so a pilot-style roster can offer either in a seat. THIS IS THE CPU TWIN: the layers are brain/brainTsl.mjs's mlpLayerCpu, the mirror of the GPU kernel (render/brainTsl.mjs), so the device could run a whole ship's
// thirteen seats in one dispatch; nothing here does -- the page flies it on the CPU.
//
// THE HAND WEIGHTS ARE THE HAND GUNNER, as the fruit fly's: the 'aimed' feature through one unit of each hidden layer and into the trigger (+4, -2), no correction -- four non-zero weights. The zero gunner never fires.
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as SG from "./seatGunnerPolicy.mjs";

export const FEATURES = SG.FEATURES, OUTPUTS = SG.OUTPUTS, WIDTH = 32, HIDDEN = WIDTH;
export const FEATURE_NAMES = SG.FEATURE_NAMES, OUTPUT_NAMES = SG.OUTPUT_NAMES;
export const LAYER_SIZES = Object.freeze([FEATURES, WIDTH, WIDTH, OUTPUTS]);
const O_W1 = 0, O_B1 = O_W1 + WIDTH * FEATURES, O_W2 = O_B1 + WIDTH, O_B2 = O_W2 + WIDTH * WIDTH, O_W3 = O_B2 + WIDTH, O_B3 = O_W3 + OUTPUTS * WIDTH;
export const WEIGHT_COUNT = O_B3 + OUTPUTS;   // 384 + 32 + 1024 + 32 + 96 + 3 = 1571
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
export const features = SG.features;

export function layersOf(w) {
    return [
        { nIn: FEATURES, nOut: WIDTH, W: w.subarray(O_W1, O_B1), b: w.subarray(O_B1, O_W2), act: "relu" },
        { nIn: WIDTH, nOut: WIDTH, W: w.subarray(O_W2, O_B2), b: w.subarray(O_B2, O_W3), act: "relu" },
        { nIn: WIDTH, nOut: OUTPUTS, W: w.subarray(O_W3, O_B3), b: w.subarray(O_B3, WEIGHT_COUNT), act: "none" },
    ];
}
/** features -> three numbers in [-1, 1]: the yaw correction, the pitch correction, the trigger. */
export function forward(w, x) {
    let h = Float32Array.from(x);
    for (const l of layersOf(w)) h = mlpLayerCpu(l, h, 1);
    return [Math.tanh(h[0]), Math.tanh(h[1]), Math.tanh(h[2])];
}
export const gunnerFor = (w, sight, opts = {}) => SG.gunnerFor(w, sight, { ...opts, forward, layersOf, post: SG.post });
export const gunnerFactory = (w, makeSight, opts = {}) => (seat, k) => gunnerFor(w, makeSight(seat, k), opts);

/** The hand gunner in this network's weights: no correction, the trigger the sight's own flag (+4 and -2 through one unit of each hidden layer). */
export function handWeights() {
    const w = zeroWeights(), AIMED = FEATURE_NAMES.indexOf("aimed");
    w[O_W1 + 0 * FEATURES + AIMED] = 1;       // layer 1, unit 0 = relu(aimed)
    w[O_W2 + 0 * WIDTH + 0] = 1;              // layer 2, unit 0 = relu(layer 1 unit 0)
    w[O_W3 + 2 * WIDTH + 0] = 4;              // fire = tanh(4 h - 2)
    w[O_B3 + 2] = -2;
    return w;
}
export const perturb = SG.perturb, mutate = SG.mutate, rngFor = SG.rngFor;
/** The weights wired into the hand path (see seatGunnerPolicy.liveIndices): unit 0 of each hidden layer -- its row of the first layer, its two biases, the weight between them, its weights into the three outputs -- and the output biases: 12 + 1 + 1 + 1 + 3 + 3 = 21 of the 1,571. */
export function liveIndices() {
    const idx = [];
    for (let f = 0; f < FEATURES; f++) idx.push(O_W1 + 0 * FEATURES + f);
    idx.push(O_B1 + 0, O_W2 + 0 * WIDTH + 0, O_B2 + 0);
    for (let o = 0; o < OUTPUTS; o++) idx.push(O_W3 + o * WIDTH + 0);
    for (let o = 0; o < OUTPUTS; o++) idx.push(O_B3 + o);
    return idx;
}

export function reportLines() {
    const nz = Array.from(handWeights()).filter((v) => v !== 0).length;
    return ["[seatGunnerMlp] the GPU Brain's plain network in a gun seat: the same twelve features and three outputs as the fruit fly's gunner, 12 -> 32 -> 32 -> 3 relu (CPU twin of the device kernel)",
        `  ${WEIGHT_COUNT} weights; the hand weights are the hand gunner through the network in ${nz} non-zero weights`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
