// WebGLEngine/brain/pilotFlightPolicy.mjs -- v4867
//
// THE FRUIT-FLY PILOT FOR REAL FLIGHT: brain/autopilotFlight.mjs's contract -- (state, target, wind) -> { pitch, roll, yaw, throttle } -- from the 34 neurons of the real male-cns Giant Fiber Circuit (313 real synapses, three
// weight-tied recurrent steps, every other recurrent weight structurally zero), the same network brain/pilotAircraftPolicy.mjs and brain/pilot6dofPolicy.mjs wire (restated here, not imported, for the reason brain/pilot6dofPolicy.mjs's
// header gives: a gate on one pilot must not move when another's file does). Eighteen features in, four numbers out; a pilot is a weight vector of 1,099 numbers, and "hand", "noise", "zero" and a trained pilot are choices of that vector.
//
//   FEATURES   the autopilot's own intermediate quantities, scaled to about 1 (so a mutation of 0.3 means the same thing everywhere), then seven more it does not use that a learned pilot may:
//              0 bias; 1 the stick that holds level flight at this airspeed; 2 the throttle that holds the TARGET airspeed; 3 the extra back-stick a banked wing needs; 4 the climb error (the climb rate asked for, less the one
//              flown) / 5 m/s -- features 1, 3 and 4 already multiplied by `upright`, the factor that takes the pull out of a steeply banked or inverted aircraft, so they are what the autopilot's pitch law is a SUM of; 5 pitch rate / 0.5;
//              6 the bank error (the bank the heading error asks for, less the one flown) / 0.5; 7 roll rate; 8 the turn-rate error (g tan(bank) / V, less the yaw rate) / 0.2; 9 sideslip / 0.1; 10 the airspeed error / 10;
//              THEN the extras: 11 climb rate / 5; 12 angle of attack / 0.2; 13 bank / 0.5; 14 altitude error / 50 (clamped at 3); 15 heading error / pi; 16 pitch attitude / 0.5; 17 yaw rate / 0.2.
//   OUTPUTS    pitch, roll, yaw CLAMPED to [-1, 1], throttle CLAMPED to [0, 1] -- the ranges the flight model takes, so that the hand weights are the autopilot's laws and not an approximation of them.
//
// *** THE HAND WEIGHTS ARE THE AUTOPILOT, WRITTEN THROUGH THE NETWORK, AND THEY ARE IT TO FLOAT32 (5.8e-8). *** Each output is a sum of features through a PAIR of relu channels (z and -z, read back as the difference), the recurrent core
// left at zero, an exact identity: pitch = f1 + kBankInv f3 + kVsPitch f4 - 0.5 kQ f5; roll = 0.5 kBank f6 - kP f7; yaw = 0.2 kCoord f8 - 0.1 kBeta f9; throttle = f2 + 10 kSpd f10 + 5 kClimbThr f11. brain/pilotFlightPolicy-selfcheck.mjs
// holds the network to autopilotFlight.decide() over 1,500 random states, and the flight it makes to the flight the autopilot makes.
"use strict";
import * as Topo from "./gfcTopology.mjs";
import * as AF from "./autopilotFlight.mjs";

export const FEATURES = 18, HIDDEN = Topo.NEURON_ORDER.length, OUTPUTS = 4;
export const REC_STEPS = 3, REC_EDGES = Topo.EDGES.length;
export const FEATURE_NAMES = Object.freeze(["bias", "stickTrim", "thrTrim", "bankComp", "climbErr", "pitchRate", "bankErr", "rollRate", "turnErr", "beta", "speedErr", "climb", "alpha", "bank", "altErr", "headingErr", "pitch", "yawRate"]);
export const OUTPUT_NAMES = Object.freeze(["pitch", "roll", "yaw", "throttle"]);
export const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS;   // 612 + 34 + 313 + 136 + 4 = 1099
export const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
const ZERO_HIDDEN = new Float32Array(HIDDEN);

function expandRecurrent(Wrec) {
    const Wm = new Float32Array(HIDDEN * HIDDEN);
    for (let i = 0; i < HIDDEN; i++) Wm[i * HIDDEN + i] = 1;
    Topo.EDGES.forEach(([toIdx, fromIdx], k) => { Wm[toIdx * HIDDEN + fromIdx] += Wrec[k]; });
    return Wm;
}
const LAYERS_MEMO = new WeakMap(), REC_OFFSET = FEATURES * HIDDEN + HIDDEN;
function layersOfMemo(w) {
    const m = LAYERS_MEMO.get(w);
    if (m) { let k = 0; while (k < REC_EDGES && m.snap[k] === w[REC_OFFSET + k]) k++; if (k === REC_EDGES) return m.layers; }
    let o = 0;
    const W1 = w.subarray(o, o += FEATURES * HIDDEN), b1 = w.subarray(o, o += HIDDEN), Wrec = w.subarray(o, o += REC_EDGES), W2 = w.subarray(o, o += HIDDEN * OUTPUTS), b2 = w.subarray(o, o += OUTPUTS);
    const rec = { nIn: HIDDEN, nOut: HIDDEN, W: expandRecurrent(Wrec), b: ZERO_HIDDEN, act: "relu" };
    const layers = [{ nIn: FEATURES, nOut: HIDDEN, W: W1, b: b1, act: "relu" }, ...Array(REC_STEPS).fill(rec), { nIn: HIDDEN, nOut: OUTPUTS, W: W2, b: b2, act: "none" }];
    LAYERS_MEMO.set(w, { snap: Float32Array.from(w.subarray(REC_OFFSET, REC_OFFSET + REC_EDGES)), layers });
    return layers;
}
/** The network as mlpLayerCpu layers (the shape the TSL and GPU twins take): { nIn, nOut, W, b, act } x 5. forward() computes the same function over the edge list; the gate holds the two together. */
export const layersOf = (w) => layersOfMemo(w);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
// The forward pass is written out over the circuit's own edge list (313 synapses and the identity, not a dense 34 x 34 matrix): about a third of the multiplies of layersOf(w) run through mlpLayerCpu, which is the shape the TSL and GPU twins
// take, and the gate holds the two to each other (1e-5) and both to an independent restatement. Weights are read afresh on every call, so a vector a trainer mutates in place is never run stale.
const EDGE_TO = Int32Array.from(Topo.EDGES, (e) => e[0]), EDGE_FROM = Int32Array.from(Topo.EDGES, (e) => e[1]);
const H0 = new Float64Array(HIDDEN), H1 = new Float64Array(HIDDEN);
/** features -> { pitch, roll, yaw, throttle }: the linear output, clamped to each control's range; a non-finite output is read as 0. */
export function forward(w, x) {
    const W1 = FEATURES * HIDDEN, B1 = W1, REC = B1 + HIDDEN, W2 = REC + REC_EDGES, B2 = W2 + HIDDEN * OUTPUTS;
    let h = H0, n = H1;
    for (let j = 0; j < HIDDEN; j++) {
        let sum = w[B1 + j]; const row = j * FEATURES;
        for (let f = 0; f < FEATURES; f++) sum += w[row + f] * fin(x[f]);
        h[j] = sum > 0 ? sum : 0;
    }
    for (let step = 0; step < REC_STEPS; step++) {
        n.set(h);   // the identity: every neuron carries its own previous activity
        for (let k = 0; k < REC_EDGES; k++) n[EDGE_TO[k]] += w[REC + k] * h[EDGE_FROM[k]];
        for (let j = 0; j < HIDDEN; j++) if (!(n[j] > 0)) n[j] = 0;
        const t = h; h = n; n = t;
    }
    const y = new Array(OUTPUTS);
    for (let o = 0; o < OUTPUTS; o++) { let sum = w[B2 + o]; const row = W2 + o * HIDDEN; for (let j = 0; j < HIDDEN; j++) sum += w[row + j] * h[j]; y[o] = sum; }
    return { pitch: clamp(fin(y[0]), -1, 1), roll: clamp(fin(y[1]), -1, 1), yaw: clamp(fin(y[2]), -1, 1), throttle: clamp(fin(y[3]), 0, 1) };
}

/** The eighteen features of a guidance record (brain/autopilotFlight.mjs guidance()), in FEATURE_NAMES order. */
export function featuresFrom(gd) {
    const r = gd.rates, a = gd.att;
    return [
        1, gd.upright * gd.stickTrim, gd.thrTrim, gd.upright * gd.invCos, gd.upright * gd.climbErr / 5, clamp(r.pitch / 0.5, -12, 12), clamp(gd.bankErr / 0.5, -8, 8), clamp(r.roll, -12, 12), clamp((gd.turnRate - r.yaw) / 0.2, -15, 15), clamp(a.beta / 0.1, -16, 16), clamp(gd.speedErr / 10, -6, 6),
        clamp(gd.climb / 5, -12, 12), clamp(a.alpha / 0.2, -8, 8), clamp(a.bank / 0.5, -7, 7), clamp(gd.altErr / 50, -3, 3), gd.headingErr / Math.PI, clamp(a.pitch / 0.5, -4, 4), clamp(r.yaw / 0.2, -15, 15),
    ].map(fin);
}
/** The features for a state, a target and the wind. */
export const features = (state, target, wind = [0, 0, 0], opts = {}) => featuresFrom(AF.guidance(state, target, wind, opts));

/** A pilot (state, target, wind) -> { pitch, roll, yaw, throttle } from weights: the autopilot's own contract. */
export function pilotFor(w) { return (state, target, wind = [0, 0, 0]) => forward(w, features(state, target, wind)); }

/** The autopilot's laws in the network's own weights (see the header). `gains` default to AUTOPILOT_FLIGHT's. */
export function handWeights(gains = {}) {
    const K = { ...AF.AUTOPILOT_FLIGHT, ...gains }, w = zeroWeights(), W1 = (h, f, v) => { w[h * FEATURES + f] = v; };
    const outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, W2 = (o, h, v) => { w[outBase + o * HIDDEN + h] = v; };
    // z = sum of coefficient * feature: a pair of relu channels per output (z and -z), read back as h_a - h_b = z
    const channel = (o, terms) => { for (const [f, v] of terms) { W1(2 * o, f, v); W1(2 * o + 1, f, -v); } W2(o, 2 * o, 1); W2(o, 2 * o + 1, -1); };
    channel(0, [[1, 1], [3, K.kBankInv], [4, K.kVsPitch], [5, -0.5 * K.kQ]]);          // pitch    = stickTrim + kBankInv bankComp + kVsPitch climbErr - kQ pitchRate
    channel(1, [[6, 0.5 * K.kBank], [7, -K.kP]]);                                       // roll     = kBank bankErr - kP rollRate
    channel(2, [[8, 0.2 * K.kCoord], [9, -0.1 * K.kBeta]]);                             // yaw      = kCoord turnErr - kBeta beta
    channel(3, [[2, 1], [10, 10 * K.kSpd], [11, 5 * K.kClimbThr]]);                     // throttle = thrTrim + kSpd speedErr + kClimbThr climb
    return w;
}

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** A copy of `w` with a gaussian of `sigma` added to every weight (the roster's "hand + noise"). */
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

// ---- the front door ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const w = handWeights(), s = AF.defaultModel(), t = AF.trimTable(s)[7];
    return [
        `[pilotFlightPolicy] the Giant Fiber Circuit (${HIDDEN} neurons, ${REC_EDGES} synapses) as a real-flight pilot: ${FEATURES} features -> ${OUTPUTS} controls, ${WEIGHT_COUNT} weights`,
        `  hand weights: ${w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)} of ${WEIGHT_COUNT} non-zero; they are autopilotFlight's laws and fly the same flight`,
        `  trim table entry at ${t.v.toFixed(1)} m/s: stick ${t.pitch.toFixed(3)} throttle ${t.throttle.toFixed(3)}`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
