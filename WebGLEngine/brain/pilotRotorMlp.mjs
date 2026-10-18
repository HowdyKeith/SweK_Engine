// WebGLEngine/brain/pilotRotorMlp.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE GPU BRAIN'S PILOT FOR THE HELICOPTER: brain/autopilotRotor.mjs's contract -- (state, target, wind, opts) -> { collective, pitch, roll, yaw } -- from a plain multilayer perceptron, the network the GPU Brain (brain/mlp.js's BatchedMLP) runs:
// 20 features -> 32 relu -> 32 relu -> 4 outputs, 1,860 weights. It reads the SAME twenty features as the fruit fly (brain/pilotRotorPolicy.mjs; they are imported, not restated, because "the same senses" is the point) and writes the same four controls, so a score
// on brain/rotorTask.mjs means the same thing for the hand pilot, the fruit fly and this. What differs is the BRAIN: the fruit fly is 34 neurons wired as 313 real synapses with three recurrent steps; this is two dense layers, the shape a GPU is good at, run over
// a whole fleet in ONE dispatch per layer.
//
//   WEIGHTS   W1 (32 x 20, row-major: neuron-major) | b1 (32) | W2 (32 x 32) | b2 (32) | W3 (4 x 32) | b3 (4)  = 640 + 32 + 1024 + 32 + 128 + 4 = 1,860. The layer order is brain/mlp.js's own ({ nIn, nOut, W: nOut x nIn, b, act }).
//   OUTPUTS   collective CLAMPED to [0, 1], cyclic pitch, cyclic roll and pedal to [-1, 1] -- the ranges the rotor model takes; a non-finite output is read as 0. The clamp is done where the controls are READ, on the CPU, for both twins: the GPU kernel computes
//             y = act(W x + b) and nothing else, so the network is exactly what mlp.js runs.
//
// *** THE HAND WEIGHTS ARE THE HAND PILOT, WRITTEN THROUGH THIS NETWORK TOO. *** Each output is a sum of features through a PAIR of relu channels (z and -z, read back as the difference): the first eight first-layer neurons carry the fruit fly's own pair-of-channels
// coefficients (taken from brain/pilotRotorPolicy.mjs handWeights()), the second layer passes those eight through unchanged (an identity on neurons 0..7: relu(relu(z)) = relu(z)), the third reads them back as +1 and -1. The other 24 neurons of each layer have zero
// weights and are the room a search has to grow into. Float32 weights, so the hand MLP is the hand pilot to float32 (gate: 1e-6).
//
// TWO TWINS OF ONE FUNCTION: forward() is the CPU twin (double accumulation over the float32 weights; what a search runs); layersOf() hands the same weights to brain/mlp.js's BatchedMLP, which runs them on the GPU in float32 (and to render/brainTsl.mjs's
// mlpLayerCpu, the f32 mirror of that kernel). brain/pilotRotorMlp-selfcheck.mjs holds the CPU twin to the mirror and both to an independent restatement; a GPU row is NOT in this file's gate (see its header).
"use strict";
import * as PP from "./pilotRotorPolicy.mjs";
import * as RT from "./rotorTask.mjs";

export const FEATURES = PP.FEATURES, OUTPUTS = PP.OUTPUTS, WIDTH = 32, HIDDEN = WIDTH;
export const FEATURE_NAMES = PP.FEATURE_NAMES, OUTPUT_NAMES = PP.OUTPUT_NAMES;
export const LAYER_SIZES = Object.freeze([FEATURES, WIDTH, WIDTH, OUTPUTS]);
const O_W1 = 0, O_B1 = O_W1 + WIDTH * FEATURES, O_W2 = O_B1 + WIDTH, O_B2 = O_W2 + WIDTH * WIDTH, O_W3 = O_B2 + WIDTH, O_B3 = O_W3 + OUTPUTS * WIDTH;
export const WEIGHT_COUNT = O_B3 + OUTPUTS;   // 640 + 32 + 1024 + 32 + 128 + 4 = 1860
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
const H1 = new Float64Array(WIDTH), H2 = new Float64Array(WIDTH);

/** The raw outputs of the network (before the clamp), four numbers: the CPU twin of the three layers. */
export function raw(w, x) {
    for (let j = 0; j < WIDTH; j++) { let s = w[O_B1 + j]; const r = O_W1 + j * FEATURES; for (let f = 0; f < FEATURES; f++) s += w[r + f] * fin(x[f]); H1[j] = s > 0 ? s : 0; }
    for (let j = 0; j < WIDTH; j++) { let s = w[O_B2 + j]; const r = O_W2 + j * WIDTH; for (let k = 0; k < WIDTH; k++) s += w[r + k] * H1[k]; H2[j] = s > 0 ? s : 0; }
    const y = new Array(OUTPUTS);
    for (let o = 0; o < OUTPUTS; o++) { let s = w[O_B3 + o]; const r = O_W3 + o * WIDTH; for (let k = 0; k < WIDTH; k++) s += w[r + k] * H2[k]; y[o] = s; }
    return y;
}
/** Four raw outputs -> { collective, pitch, roll, yaw }, clamped to each control's range; a non-finite output is read as 0. The GPU twin's outputs go through the same function. */
export const controlsOf = (y) => ({ collective: clamp(fin(y[0]), 0, 1), pitch: clamp(fin(y[1]), -1, 1), roll: clamp(fin(y[2]), -1, 1), yaw: clamp(fin(y[3]), -1, 1) });
/** features -> { collective, pitch, roll, yaw }: the CPU twin. */
export const forward = (w, x) => controlsOf(raw(w, x));

/** The network as brain/mlp.js layers ({ nIn, nOut, W, b, act } x 3: relu, relu, none): the shape BatchedMLP and render/brainTsl.mjs's mlpLayerCpu take. Views onto `w`, not copies. */
export function layersOf(w) {
    return [
        { nIn: FEATURES, nOut: WIDTH, W: w.subarray(O_W1, O_B1), b: w.subarray(O_B1, O_W2), act: "relu" },
        { nIn: WIDTH, nOut: WIDTH, W: w.subarray(O_W2, O_B2), b: w.subarray(O_B2, O_W3), act: "relu" },
        { nIn: WIDTH, nOut: OUTPUTS, W: w.subarray(O_W3, O_B3), b: w.subarray(O_B3, WEIGHT_COUNT), act: "none" },
    ];
}

/** The twenty features of a state, a target, the wind and the options: the fruit fly's own (brain/pilotRotorPolicy.mjs). */
export const features = PP.features;
export const featuresFrom = PP.featuresFrom;
/** A pilot (state, target, wind, opts) -> controls from weights: the hand pilot's own contract. */
export function pilotFor(w) { return (state, target, wind = [0, 0, 0], opts = {}) => forward(w, features(state, target, wind, opts)); }

/** The hand pilot's laws in this network's weights. `gains` default to AUTOPILOT_ROTOR's; the first-layer coefficients are the fruit fly's (PP.handWeights), so the two brains start from the same laws. */
export function handWeights(gains = {}) {
    const hw = PP.handWeights(gains), w = zeroWeights();
    for (let h = 0; h < 2 * OUTPUTS; h++) for (let f = 0; f < FEATURES; f++) w[O_W1 + h * FEATURES + f] = hw[h * FEATURES + f];   // neurons 0..7: the pair of channels per output
    for (let h = 0; h < 2 * OUTPUTS; h++) w[O_W2 + h * WIDTH + h] = 1;                                                              // the second layer passes them on
    const ppW2 = PP.FEATURES * PP.HIDDEN + PP.HIDDEN + PP.REC_EDGES;
    for (let o = 0; o < OUTPUTS; o++) { w[O_W3 + o * WIDTH + 2 * o] = hw[ppW2 + o * PP.HIDDEN + 2 * o]; w[O_W3 + o * WIDTH + 2 * o + 1] = hw[ppW2 + o * PP.HIDDEN + 2 * o + 1]; }
    return w;
}

// ---- training: the recipe every pilot in this tree is made by (restated from brain/pilotRotorPolicy.mjs, which holds the same functions for the other brain, so a gate on one does not move when the other's file does) ---------
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** The weights `w` flown over a set of scenarios (brain/rotorTask.mjs evaluate()). */
export const evaluate = (w, set = RT.TRAIN_SET, opts = {}) => RT.evaluate(pilotFor(w), set, opts);
/** A copy of `w` with a gaussian of `sigma` added to every weight (the roster's "hand + noise"). */
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }
/** A copy of `w` with 1..maxK randomly chosen weights moved by a gaussian of `sigma`: the sparse mutation. */
export function mutate(w, sigma, rng, maxK = 4) {
    const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
    return o;
}
/** (1+1)-ES from the hand weights (the hand pilot) on TRAIN_SET. A child that scores exactly its parent replaces it, counted apart. Deterministic for a seed. */
export function train({ seed = 7, iters = 600, sigma = 0.3, maxK = 4, start = null, trainSet = RT.TRAIN_SET, onIter = null } = {}) {
    const rng = mulberry(seed); let best = start ? Float32Array.from(start) : handWeights();
    let bestScore = evaluate(best, trainSet).score, improved = 0, neutral = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = mutate(best, sigma, rng, maxK), score = evaluate(cand, trainSet).score;
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % 50 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved, neutral });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved, neutral };
}
/** Put every weight that differs from `toward` (default: the hand weights) back whenever the TRAIN score does not fall, passes repeated to a fixed point. */
export function prune(w, { toward = null, trainSet = RT.TRAIN_SET } = {}) {
    const base0 = toward ? Float32Array.from(toward) : handWeights(), out = Float32Array.from(w);
    const differs = () => { const idx = []; for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - base0[i]) > 1e-6) idx.push(i); return idx; };
    const moved = differs().length; let best = evaluate(out, trainSet).score, passes = 0, reverted;
    do {
        reverted = 0; passes++;
        for (const i of differs()) {
            const keep = out[i]; out[i] = base0[i];
            const s = evaluate(out, trainSet).score;
            if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep;
        }
    } while (reverted > 0 && passes < 64);   // each reverting pass shrinks differs(), so it ends on its own; the cap is for a revert that did not revert (then it would never)
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}

// ---- the front door ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const w = handWeights();
    return [
        `[pilotRotorMlp] the GPU Brain's helicopter pilot: ${LAYER_SIZES.join(" -> ")} (relu, relu, linear), ${WEIGHT_COUNT} weights, the fruit fly's ${FEATURES} features in and the same four controls out`,
        `  hand weights: ${w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)} of ${WEIGHT_COUNT} non-zero; they are autopilotRotor's laws (through eight relu channels of each layer) and fly the same flight`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
