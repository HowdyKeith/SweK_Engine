// WebGLEngine/brain/pilot6dofMlp.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GPU BRAIN'S PILOT FOR THE NEWTONIAN SPACE DUEL: brain/autopilot6dof.mjs's contract -- (body, target, opts) -> { torqueBody, thrust, firing, range, facingCos } -- from a plain multilayer perceptron, the shape the
// GPU Brain (brain/mlp.js's BatchedMLP) runs: 12 features -> 32 relu -> 32 relu -> 5 outputs, 1,637 weights. Registered before it was built: brain/SIXDOF_GPU_BRAIN_WIP.md.
//
//   FEATURES   the fruit fly's twelve (brain/pilot6dofPolicy.mjs geometry() / features(): imported, not restated, because "the same senses" is the point -- the flight and jet MLPs do the same).
//   OUTPUTS    read EXACTLY as the fruit fly reads its own: tanh on all five; torque about each body axis = that axis' moment of inertia x TORQUE_GAIN x the output; thrust when the fourth is positive; fire when the fifth is.
//   WEIGHTS    W1 (32 x 12, neuron-major) | b1 (32) | W2 (32 x 32) | b2 (32) | W3 (5 x 32) | b3 (5) = 384 + 32 + 1024 + 32 + 160 + 5 = 1,637. The layer order is brain/mlp.js's ({ nIn, nOut, W: nOut x nIn, b, act }).
//
// *** THE HAND WEIGHTS ARE THE PD AUTOPILOT, AND THEY FLY THE FRUIT FLY'S HAND PILOT TO THE BIT. *** Neurons 0..7 of the first layer carry the fruit fly's own hand rows (pilot6dofPolicy.handWeights(): a pair of relu channels
// per axis, the thrust gate, the fire gate); the second layer passes those eight on (relu(relu(z)) = relu(z)); the third reads them back with the fruit fly's readout weights and biases. The arithmetic is the fruit fly
// pilot's own -- render/brainTsl.mjs's mlpLayerCpu, the float32 mirror of the GPU kernel -- and a zero term adds exactly 0 in float32, so every sum the hand MLP makes is the fruit fly's sum in the same order: the same
// controls, the same duel, the same fingerprint (brain/pilot6dofMlp-selfcheck.mjs holds it on the twenty train and held-out seeds). The other 24 neurons of each layer are zero: the room a search has to grow into.
//
// NOT CLAIMED: that a duel runs on a GPU. A duel is two ships, and v4870 measured for flight that the GPU does not make that loop faster; layersOf() hands these weights to BatchedMLP for a page that flies a fleet.
//
// TRAINING is the fruit fly's recipe restated for this network (as brain/pilotFlightMlp.mjs restates pilotFlightPolicy's): mutate(), train() and prune() are pilot6dofPolicy's own algorithms, line for line, with this
// network's evaluate(); evaluate() IS pilot6dofPolicy's, handed this network's pilot as a function (duel() takes one).
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as P6 from "./pilot6dofPolicy.mjs";

export const FEATURES = P6.FEATURES, OUTPUTS = P6.OUTPUTS, WIDTH = 32, HIDDEN = WIDTH;
export const FEATURE_NAMES = P6.FEATURE_NAMES, OUTPUT_NAMES = P6.OUTPUT_NAMES, TORQUE_GAIN = P6.TORQUE_GAIN;
export const LAYER_SIZES = Object.freeze([FEATURES, WIDTH, WIDTH, OUTPUTS]);
const O_W1 = 0, O_B1 = O_W1 + WIDTH * FEATURES, O_W2 = O_B1 + WIDTH, O_B2 = O_W2 + WIDTH * WIDTH, O_W3 = O_B2 + WIDTH, O_B3 = O_W3 + OUTPUTS * WIDTH;
export const WEIGHT_COUNT = O_B3 + OUTPUTS;   // 384 + 32 + 1024 + 32 + 160 + 5 = 1637
/** How many of each layer's neurons the hand weights use: the fruit fly's eight (six torque channels, the thrust gate, the fire gate). */
export const HAND_NEURONS = 8;
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);

/** The network as brain/mlp.js layers ({ nIn, nOut, W, b, act } x 3: relu, relu, none): what BatchedMLP and mlpLayerCpu take. Views onto `w`, not copies. */
export function layersOf(w) {
    return [
        { nIn: FEATURES, nOut: WIDTH, W: w.subarray(O_W1, O_B1), b: w.subarray(O_B1, O_W2), act: "relu" },
        { nIn: WIDTH, nOut: WIDTH, W: w.subarray(O_W2, O_B2), b: w.subarray(O_B2, O_W3), act: "relu" },
        { nIn: WIDTH, nOut: OUTPUTS, W: w.subarray(O_W3, O_B3), b: w.subarray(O_B3, WEIGHT_COUNT), act: "none" },
    ];
}

/** features -> five numbers in [-1, 1]: torque about x, y, z, thrust, fire. The fruit fly's arithmetic (mlpLayerCpu, float32) and its tanh. */
export function forward(w, x) {
    const L = layersOf(w);
    let h = Float32Array.from(x);
    h = mlpLayerCpu(L[0], h, 1); h = mlpLayerCpu(L[1], h, 1);
    const y = mlpLayerCpu(L[2], h, 1);
    return [Math.tanh(y[0]), Math.tanh(y[1]), Math.tanh(y[2]), Math.tanh(y[3]), Math.tanh(y[4])];
}

/** The twelve features: the fruit fly's own. */
export const features = P6.features, geometry = P6.geometry, featuresFrom = P6.featuresFrom;

/** A pilot (body, target, opts) -> { torqueBody, thrust, firing, range, facingCos } from weights: the fruit fly's pilotFor() with this network in place of the circuit. */
export function pilotFor(w) {
    return (body, target, opts = {}) => {
        const g = P6.geometry(body, target, opts), y = forward(w, P6.featuresFrom(g, body));
        return { torqueBody: [0, 1, 2].map((i) => body.I[i] * TORQUE_GAIN * y[i]), thrust: y[3] > 0 ? g.spec.thrustForce : 0, firing: y[4] > 0, range: g.range, facingCos: g.facingCos };
    };
}

/** The PD autopilot in this network's weights: the fruit fly's hand rows and readout (see the header). kp and kd are pilot6dofPolicy.handWeights()'s. */
export function handWeights(gains = {}) {
    const hw = P6.handWeights(gains), w = zeroWeights(), L = layersOf(w);
    const pfOut = P6.FEATURES * P6.HIDDEN + P6.HIDDEN + P6.REC_EDGES;   // the fruit fly's readout: W2 (OUTPUTS x HIDDEN) then b2 (OUTPUTS)
    for (let h = 0; h < HAND_NEURONS; h++) {
        for (let f = 0; f < FEATURES; f++) L[0].W[h * FEATURES + f] = hw[h * P6.FEATURES + f];   // first layer: the fruit fly's rows
        L[0].b[h] = hw[P6.FEATURES * P6.HIDDEN + h];                                              // and its first-layer biases (zero today, carried so the twin cannot drift)
        L[1].W[h * WIDTH + h] = 1;                                                                // second layer: pass them on
    }
    for (let o = 0; o < OUTPUTS; o++) {
        for (let h = 0; h < HAND_NEURONS; h++) L[2].W[o * WIDTH + h] = hw[pfOut + o * P6.HIDDEN + h];
        L[2].b[o] = hw[pfOut + P6.HIDDEN * P6.OUTPUTS + o];
    }
    return w;
}

// ---- training: pilot6dofPolicy's recipe, restated for this network ---------------------------------------------------------------------------------------------------------------------------------------------
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** A copy of `w` with a gaussian of `sigma` added to every weight. */
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }
/** A child of `w` with 1..maxK weights moved by a gaussian of `sigma`: pilot6dofPolicy.mutate(), for this network's length. */
export function mutate(w, sigma, rng, maxK = 4) {
    const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
    return o;
}
/** These weights over `seeds`: pilot6dofPolicy.evaluate(), with this network's pilot handed in as a function (an `opponent` array is the league, from both sides). */
export const evaluate = (w, seeds, opts = {}) => P6.evaluate(pilotFor(w), seeds, opts);

/** (1+1)-ES from the hand weights on the duel: pilot6dofPolicy.train(), line for line, on this network. Deterministic for a seed. Returns { weights, trainScore, history, iters, improved, neutral }. */
export function train({ seed = 7, iters = 600, sigma = 0.3, start = null, seconds = 30, trainSeeds = P6.TRAIN_SEEDS, opponent = "autopilot", maxK = 4, onIter = null, collisions = false, ramPenalty = 0, scenarios = ["standoff"] } = {}) {
    const rng = mulberry(seed), ev = { seconds, opponent, collisions, ramPenalty, scenarios }; let best = start ? Float32Array.from(start) : handWeights();
    let bestScore = evaluate(best, trainSeeds, ev).score, improved = 0, neutral = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = mutate(best, sigma, rng, maxK), score = evaluate(cand, trainSeeds, ev).score;
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; }
        else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % 50 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved, neutral });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved, neutral };
}

/** Put every weight that differs from `toward` (default: the hand weights) back whenever the train score does not fall, passes repeated to a fixed point: pilot6dofPolicy.prune(), line for line, on this network. */
export function prune(w, { toward = null, trainSeeds = P6.TRAIN_SEEDS, opponent = "autopilot", seconds = 30, collisions = false, ramPenalty = 0, scenarios = ["standoff"] } = {}) {
    const ev = { seconds, opponent, collisions, ramPenalty, scenarios }, base0 = toward ? Float32Array.from(toward) : handWeights(), out = Float32Array.from(w);
    const differs = () => { const idx = []; for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - base0[i]) > 1e-6) idx.push(i); return idx; };
    const moved = differs().length;
    let best = evaluate(out, trainSeeds, ev).score, passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const i of differs()) {
            const keep = out[i]; out[i] = base0[i];
            const s = evaluate(out, trainSeeds, ev).score;
            if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep;
        }
    } while (reverted > 0);
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}

// ---- the front door -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const w = handWeights();
    return [
        `[pilot6dofMlp] the GPU Brain's pilot for the 6-DOF space duel: ${LAYER_SIZES.join(" -> ")} (relu, relu, linear, then tanh), ${WEIGHT_COUNT} weights, the fruit fly's ${FEATURES} features in and the same five outputs`,
        `  hand weights: ${w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)} of ${WEIGHT_COUNT} non-zero; they are the PD autopilot through ${HAND_NEURONS} relu channels of each layer, and fly the fruit fly's hand pilot to the bit`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
