// WebGLEngine/brain/pilotRotorPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FRUIT-FLY PILOT FOR THE HELICOPTER: brain/autopilotRotor.mjs's contract -- (state, target, wind, opts) -> { collective, pitch, roll, yaw } -- from the 34 neurons of the real male-cns Giant Fiber Circuit (313 real synapses, three weight-tied
// recurrent steps, every other recurrent weight structurally zero), the same network brain/pilotFlightPolicy.mjs wires for the aeroplane (restated here, not imported, so that a gate on one pilot does not move when another's file does). Twenty features in,
// four numbers out; a pilot is a weight vector of 1,167 numbers, and "hand", "noise", "zero" and a trained pilot are choices of that vector.
//
//   FEATURES   the hand pilot's own intermediate quantities (brain/autopilotRotor.mjs guidance()), scaled to about 1 so that a mutation of 0.3 means the same thing everywhere, then nine more it does not use that a learned pilot may:
//              0 bias; 1 the cyclic pitch that holds the hover; 2 the attitude error in pitch / 0.1 rad; 3 pitch rate / 0.5; 4 the cyclic roll that holds the hover; 5 the bank error / 0.1 rad; 6 roll rate / 0.5; 7 the pedal that goes with the collective;
//              8 (the yaw rate asked for, less the yaw rate flown) / 0.5; 9 the collective the loops feed forward (the hover's, plus what a tilted disc and the autorotation want); 10 the climb error / 5 m/s -- features 1, 4, 7 and 9 are the hand pilot's trims
//              and feed-forwards, so what the hand pilot's laws are is a SUM of the first eleven;
//              THEN the extras: 11 rotor speed error / 3 rad/s; 12 height over the ground / 50 m (the ground the pilot is handed); 13 climb rate / 5; 14 the speed along the nose / 10; 15 the speed to the right / 10; 16 bank / 0.5; 17 pitch / 0.5;
//              18 heading error / pi; 19 the engine-out flag (1 when the pilot's annunciator or the low-rotor horn says so, else 0).
//   OUTPUTS    collective CLAMPED to [0, 1], cyclic pitch, cyclic roll and pedal to [-1, 1] -- the ranges the rotor model takes -- so that the hand weights are the pilot's laws and not an approximation of them.
//
// *** THE HAND WEIGHTS ARE THE HAND PILOT, WRITTEN THROUGH THE NETWORK, AND THEY ARE IT TO FLOAT32 (a few 1e-7). *** Each output is a sum of features through a PAIR of relu channels (z and -z, read back as the difference), the recurrent core left at zero,
// an exact identity: collective = f9 + 5 kVs f10; pitch = f1 + 0.1 kTheta f2 - 0.5 kQ f3; roll = f4 + 0.1 kPhi f5 - 0.5 kP f6; yaw = f7 + 0.5 kYaw f8. brain/pilotRotorPolicy-selfcheck.mjs holds the network to autopilotRotor.decide() over 2,000 random states, and the flight it
// makes to the flight the hand pilot makes. THE TERRAIN COMES IN THROUGH THE FEATURES: every one is read from the guidance record, which looks at the ground (`opts.terrain`, the fourth argument), so a network that has never seen a ridge still climbs over it
// the way the hand pilot does, and a search can change what it does about one.
"use strict";
import * as Topo from "./gfcTopology.mjs";
import * as H from "../physics/mechanics/rotorcraftModel6dof.mjs";
import * as AR from "./autopilotRotor.mjs";
import * as RT from "./rotorTask.mjs";

export const FEATURES = 20, HIDDEN = Topo.NEURON_ORDER.length, OUTPUTS = 4;
export const REC_STEPS = 3, REC_EDGES = Topo.EDGES.length;
export const FEATURE_NAMES = Object.freeze(["bias", "pitchTrim", "pitchErr", "pitchRate", "rollTrim", "bankErr", "rollRate", "pedalFF", "yawRateErr", "collectiveFF", "climbErr", "omegaErr", "agl", "climb", "speedFwd", "speedRight", "bank", "pitch", "headingErr", "engineOut"]);
export const OUTPUT_NAMES = Object.freeze(["collective", "pitch", "roll", "yaw"]);
export const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS;   // 680 + 34 + 313 + 136 + 4 = 1167
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
// The forward pass is written out over the circuit's own edge list (313 synapses and the identity, not a dense 34 x 34 matrix); the gate holds it to layersOf(w) through mlpLayerCpu (1e-5) and to an independent restatement.
// Weights are read afresh on every call, so a vector a trainer mutates in place is never run stale.
const EDGE_TO = Int32Array.from(Topo.EDGES, (e) => e[0]), EDGE_FROM = Int32Array.from(Topo.EDGES, (e) => e[1]);
const H0 = new Float64Array(HIDDEN), H1 = new Float64Array(HIDDEN);
/** The raw outputs of the network (before the clamp), four numbers. */
export function raw(w, x) {
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
    return y;
}
/** Four raw outputs -> { collective, pitch, roll, yaw }, each clamped to its control's range; a non-finite output is read as 0. */
export const controlsOf = (y) => ({ collective: clamp(fin(y[0]), 0, 1), pitch: clamp(fin(y[1]), -1, 1), roll: clamp(fin(y[2]), -1, 1), yaw: clamp(fin(y[3]), -1, 1) });
/** features -> { collective, pitch, roll, yaw }. */
export const forward = (w, x) => controlsOf(raw(w, x));

/** The twenty features of a guidance record (brain/autopilotRotor.mjs guidance()) and the state it came from, in FEATURE_NAMES order. */
export function featuresFrom(gd, state) {
    const r = gd.rates, a = gd.att, h = a.heading, vx = state.vel[0], vy = state.vel[1];
    return [
        1, gd.pitchTrim, clamp(gd.pitchErr / 0.1, -12, 12), clamp(r.pitch / 0.5, -12, 12), gd.rollTrim, clamp(gd.bankErr / 0.1, -16, 16), clamp(r.roll / 0.5, -12, 12), gd.pedalFF, clamp((gd.yawRateCmd - r.yaw) / 0.5, -12, 12), gd.collectiveFF, clamp(gd.climbErr / 5, -12, 12),
        clamp(gd.omegaErr / 3, -6, 6), clamp(gd.agl / 50, -1, 4), clamp(gd.climb / 5, -6, 6), clamp((vx * Math.cos(h) - vy * Math.sin(h)) / 10, -4, 4), clamp((-vx * Math.sin(h) - vy * Math.cos(h)) / 10, -4, 4), clamp(a.bank / 0.5, -7, 7), clamp(a.pitch / 0.5, -4, 4), gd.headingErr / Math.PI, gd.engineOut ? 1 : 0,
    ].map(fin);
}
/** The features for a state, a target, the wind and the options (the terrain among them). */
export const features = (state, target, wind = [0, 0, 0], opts = {}) => featuresFrom(AR.guidance(state, target, wind, opts), state);

/** A pilot (state, target, wind, opts) -> { collective, pitch, roll, yaw } from weights: the hand pilot's own contract. */
export function pilotFor(w) { return (state, target, wind = [0, 0, 0], opts = {}) => forward(w, features(state, target, wind, opts)); }

/** The hand pilot's laws in the network's own weights (see the header). `gains` default to AUTOPILOT_ROTOR's. */
export function handWeights(gains = {}) {
    const K = { ...AR.AUTOPILOT_ROTOR, ...gains }, w = zeroWeights(), W1 = (h, f, v) => { w[h * FEATURES + f] = v; };
    const outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, W2 = (o, h, v) => { w[outBase + o * HIDDEN + h] = v; };
    // z = sum of coefficient * feature: a pair of relu channels per output (z and -z), read back as h_a - h_b = z
    const channel = (o, terms) => { for (const [f, v] of terms) { W1(2 * o, f, v); W1(2 * o + 1, f, -v); } W2(o, 2 * o, 1); W2(o, 2 * o + 1, -1); };
    channel(0, [[9, 1], [10, 5 * K.kVs]]);                                   // collective = collectiveFF + kVs climbErr
    channel(1, [[1, 1], [2, 0.1 * K.kTheta], [3, -0.5 * K.kQ]]);             // pitch      = pitchTrim + kTheta pitchErr - kQ pitchRate
    channel(2, [[4, 1], [5, 0.1 * K.kPhi], [6, -0.5 * K.kP]]);               // roll       = rollTrim + kPhi bankErr - kP rollRate
    channel(3, [[7, 1], [8, 0.5 * K.kYaw]]);                                 // yaw        = pedalFF + kYaw (yawRateCmd - yawRate)
    return w;
}

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** A copy of `w` with a gaussian of `sigma` added to every weight (the roster's "hand + noise"). */
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

// ---- training: the recipe every pilot in this tree is made by --------------------------------------------------------------------------------------------------------------------------------------------
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** The weights `w` flown over a set of scenarios (brain/rotorTask.mjs evaluate()): { score, runs, crashed, byKind }. */
export const evaluate = (w, set = RT.TRAIN_SET, opts = {}) => RT.evaluate(pilotFor(w), set, opts);
/** A copy of `w` with 1..maxK randomly chosen weights moved by a gaussian of `sigma`: the sparse mutation of brain/pilotAircraftPolicy.mjs. */
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
    } while (reverted > 0);
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}

// ---- the front door ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const w = handWeights(), m = AR.defaultModel(), T = AR.trimOf(m), s = H.createState(m, { pos: [0, 0, 100], pitch: T.pitchAttitude, bank: T.bank });
    const c = pilotFor(w)(s, { pos: [200, 0], altitude: 120, heading: 0.5 });
    return [
        `[pilotRotorPolicy] the Giant Fiber Circuit (${HIDDEN} neurons, ${REC_EDGES} synapses) as a helicopter pilot: ${FEATURES} features -> ${OUTPUTS} controls, ${WEIGHT_COUNT} weights`,
        `  hand weights: ${w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)} of ${WEIGHT_COUNT} non-zero; they are autopilotRotor's laws and fly the same flight`,
        `  asked to go 200 m ahead, up 20 m and turn 29 degrees right from a hover: collective ${c.collective.toFixed(3)} pitch ${c.pitch.toFixed(3)} roll ${c.roll.toFixed(3)} pedal ${c.yaw.toFixed(3)}`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
