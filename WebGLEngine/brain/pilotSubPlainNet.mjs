// WebGLEngine/brain/pilotSubPlainNet.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/pilotSubPlainNet-selfcheck.mjs)
//
// THE PLAIN-NET CONTROL OF RUNG 4b, AS REGISTERED IN brain/PLAIN_NET_CONTROL_WIP.md (sections 2 and 10, written before this file existed). It is brain/pilotSubVestibular.mjs's pilot with ONE part replaced: the circuit (tuned afferents, 332 / 301 / 31 synapses, central cells) is a plain feed-forward relu net.
//
//   output  =  the PD autopilot's laws (brain/autopilotSub.mjs, on the same 14 features)  +  a RESIDUAL read from the net, all four clamped to [-1, 1]; the output layer and its biases start at ZERO, so the pilot STARTS AS THE AUTOPILOT, exactly
//   input   the SAME four tilt signals the circuit's afferents are driven by (brain/pilotSubVestibular.mjs sense(): pTonic, rTonic, pPhasic, rPhasic), each times its unit-RMS scale -- the circuit sees them only through sin(theta) P + cos(theta) R, a linear mix the first layer can represent
//   net     `widths` hidden layers of relu units, no state, no leak: a pilot reads the present tick only (the comparison is with the circuit's NO STATE pilots). Weights, in this order, layer by layer: [ W (nOut x nIn, row per output unit), b (nOut) ]
//   mirror  a MIRRORED PAIR with the SAME (tied) weights: the left copy's two roll signals (rTonic, rPhasic) are sign-flipped; the residuals are summed with yaw odd (the left copy's yaw negated), pitch, thrust and ballast even -- decode() of the 4b pilot, exactly
//   shapes  MN  one hidden layer of H = matchedHidden(the circuit's NO STATE weight count) units: 9H + 4 weights (65 -> 589, 72 -> 652, 9 -> 85)       MG  the GPU Brain's width and depth, 4 -> 32 -> 32 -> 4: 1,348 weights
//   start   hidden layer 1 ~ N(0, 0.5), hidden layer 2 ~ N(0, 0.25), biases 0, output layer 0; the draw is seeded (`opts.seed`, default 4711) with brain/pilotSubPolicy.mjs's mulberry
//
// THE CONTRACT is the part of brain/pilotSubVestibular.mjs's that tools/ship/trainSubVestibular.mjs's search() and refsRecord() use: { name, FEATURES, OUTPUTS, WEIGHT_COUNT, INPUTS, CELLS, persist, LAMBDA_INDEX, widths, zeroWeights, handWeights, pilotFor, mutate, evaluate, reportLines, reach, scales }.
// What it leaves out, because nothing in the study would call it: train and prune (search() does both itself), perturb, the wrap option, the leak and the dense-input variant.
// WHAT THIS IS NOT: a model of a fish, or a trained anything. Nothing has been trained on this pilot. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as AS from "./autopilotSub.mjs";
import * as T from "./subTask.mjs";
import * as V from "./pilotSubVestibular.mjs";
import { FEATURES, OUTPUTS, features, mulberry } from "./pilotSubPolicy.mjs";

export { FEATURES, OUTPUTS };
export const SIGNALS = V.SENSES.length;
export const INIT = Object.freeze({ seed: 4711, layer1: 0.5, layer2: 0.25 });
export const MG_WIDTHS = Object.freeze([32, 32]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** The weight layout of a net with these hidden widths: { layers: [{ nIn, nOut, offW, offB, relu }], count }; the last layer (the outputs) has no relu. */
export function layoutOf(widths) {
    if (!Array.isArray(widths) || widths.length < 1 || !widths.every((n) => Number.isInteger(n) && n >= 1)) throw new Error(`pilotSubPlainNet.layoutOf: the hidden widths are a list of whole numbers of 1 or more, got ${JSON.stringify(widths)}`);
    const sizes = [SIGNALS, ...widths, OUTPUTS], layers = []; let off = 0;
    for (let l = 0; l + 1 < sizes.length; l++) { const nIn = sizes[l], nOut = sizes[l + 1]; layers.push({ nIn, nOut, offW: off, offB: off + nIn * nOut, relu: l + 2 < sizes.length }); off += nIn * nOut + nOut; }
    return { layers, count: off };
}

/** The largest single hidden layer whose weights (SIGNALS H + H + OUTPUTS H + OUTPUTS) do not pass `count`; 0 when even one unit passes it. */
export const matchedHidden = (count) => Math.max(0, Math.floor((count - OUTPUTS) / (SIGNALS + 1 + OUTPUTS)));

/** A forward pass of the net `layers` with buffers of its own: (w, x, dest) -> dest, the OUTPUTS numbers; x holds SIGNALS numbers. */
export function makeForward(layers) {
    const bufs = layers.map((l) => new Float64Array(l.nOut));
    return (w, x, dest) => {
        let a = x;
        for (let l = 0; l < layers.length; l++) {
            const { nIn, nOut, offW, offB, relu } = layers[l], o = bufs[l];
            for (let j = 0; j < nOut; j++) { let s = w[offB + j]; const row = offW + j * nIn; for (let i = 0; i < nIn; i++) s += w[row + i] * a[i]; o[j] = relu && !(s > 0) ? 0 : s; }
            a = o;
        }
        for (let j = 0; j < OUTPUTS; j++) dest[j] = a[j];
        return dest;
    };
}

/**
 * The whole pilot for one net shape. `widths` the hidden layer widths ([H] for MN, MG_WIDTHS for MG). `opts`: { seed (the start draw, default INIT.seed), scales (default all 1), evaluate (pilot, set, opts) -> result, the task to train on; default brain/subTask.mjs's }.
 */
export function createPlainNetPolicy(widths, name = "plainnet", opts = {}, init = INIT) {
    const lay = layoutOf(widths), L = lay.layers, WEIGHT_COUNT = lay.count, run = opts.evaluate || T.evaluate, seed = opts.seed === undefined ? init.seed : opts.seed;
    const scales = { pTonic: 1, rTonic: 1, pPhasic: 1, rPhasic: 1, ...(opts.scales || {}) }, K = AS.AUTOPILOT_SUB;
    const law = (x) => [0.3 * K.kTheta * x[2] - 0.2 * K.kQ * x[3], Math.PI * K.kHdg * x[4] - 0.2 * K.kR * x[5] - 0.2 * K.kBeta * x[6], x[1] + K.kSpd * x[7], 10 * K.kBalD * x[8] + 0.5 * K.kBalV * x[9]];
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
    function handWeights() {
        const w = zeroWeights(), rng = mulberry(seed);
        for (let l = 0; l + 1 < L.length; l++) { const sd = l === 0 ? init.layer1 : init.layer2, n = L[l].nIn * L[l].nOut; for (let i = 0; i < n; i++) w[L[l].offW + i] = gauss(rng) * sd; }
        return w;
    }
    /** A pilot (state, target, current) -> controls from weights. */
    const pilotFor = (w) => {
        const forward = makeForward(L), xr = new Float64Array(SIGNALS), xl = new Float64Array(SIGNALS), r = new Float64Array(OUTPUTS), l = new Float64Array(OUTPUTS);
        return (state, tgt, current = [0, 0, 0]) => {
            const x = features(state, tgt, current), s = V.sense(state), base = law(x);
            xr[0] = s.pTonic * scales.pTonic; xr[1] = s.rTonic * scales.rTonic; xr[2] = s.pPhasic * scales.pPhasic; xr[3] = s.rPhasic * scales.rPhasic;
            xl[0] = xr[0]; xl[1] = -xr[1]; xl[2] = xr[2]; xl[3] = -xr[3];
            forward(w, xr, r); forward(w, xl, l);
            const y = [base[0] + r[0] + l[0], base[1] + r[1] - l[1], base[2] + r[2] + l[2], base[3] + r[3] + l[3]];
            return { pitch: clamp(fin(y[0]), -1, 1), yaw: clamp(fin(y[1]), -1, 1), thrust: clamp(fin(y[2]), -1, 1), ballast: clamp(fin(y[3]), -1, 1) };
        };
    };
    const evaluate = (w, set = T.TRAIN_SET, o = {}) => run(pilotFor(w), set, o);
    function mutate(w, sigma, rng, maxK = 4) {
        const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
        for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
        return o;
    }
    const cells = widths.reduce((s, n) => s + n, 0), reach = { pairs: L[0].nIn * L[0].nOut };
    const reportLines = () => [`[pilotSubPlainNet] ${name} (${widths.join("-")} relu units) as a NO-STATE mirrored pair: the ${SIGNALS} tilt signals -> net -> ${OUTPUTS} controls added to the autopilot's, ${WEIGHT_COUNT} trained weights`];
    return { name, FEATURES, OUTPUTS, WEIGHT_COUNT, INPUTS: SIGNALS, CELLS: cells, persist: false, LAMBDA_INDEX: -1, widths: [...widths], zeroWeights, handWeights, pilotFor, mutate, evaluate, reportLines, reach, scales };
}
