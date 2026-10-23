// WebGLEngine/brain/pilotDronePolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FRUIT-FLY PILOT FOR THE QUADROTOR: brain/autopilotDrone.mjs's contract -- (state, target, wind, opts) -> { thrust, pitch, roll, yaw } -- from the 34 neurons of the real male-cns Giant Fiber Circuit (313 real synapses, three weight-tied recurrent steps, every other recurrent weight
// structurally zero), the same network brain/pilotRotorPolicy.mjs wires for the helicopter (restated here, not imported, so that a gate on one pilot does not move when another's file does). Twenty features in, four numbers out; a pilot is a weight vector of 1,167 numbers, and "hand", "noise", "zero" and a
// trained pilot are choices of that vector. FLIGHT ONLY.
//
//   FEATURES   the hand pilot's own intermediate quantities (brain/autopilotDrone.mjs guidance()), scaled to about 1 so that a mutation of 0.3 means the same thing everywhere, then twelve more it does not use that a learned pilot may:
//              0 bias; 1 the attitude error in pitch / 0.1 rad; 2 pitch rate / 0.5; 3 the bank error / 0.1 rad; 4 roll rate / 0.5; 5 (the yaw rate asked for, less the yaw rate flown) / 0.5 -- zero when a motor is out; 6 the thrust the loops feed forward (the hover's, times 1 / (cos bank cos pitch), times 4 over
//              the motors working); 7 the climb error / 5 m/s -- features 1 to 7 are the hand pilot's, and what the hand pilot's laws are is a SUM of the first eight (the bias is the constant 1 and no law uses it);
//              THEN the extras: 8 height over the ground / 50 m; 9 WHERE THE FAILED MOTOR IS, to the left (+1 left, -1 right, 0 none or one of each); 10 the speed along the nose / 10; 11 the speed to the right / 10; 12 bank / 0.5; 13 pitch / 0.5; 14 heading error / pi; 15 the motor-out flag (1 when a motor's health is under a half);
//              16 WHERE THE FAILED MOTOR IS, to the front (+1 front, -1 rear, 0 none or one of each) -- with 9 it says WHICH motor: the counter-yaw for a clockwise motor has the other sign from a counter-clockwise one's, and the imbalance in roll and pitch follows the corner;
//              17 the point to hold, ahead in the nose's frame / 20 m; 18 the same to the right; 19 the yaw rate / 1 rad/s.
//   OUTPUTS    thrust CLAMPED to [0, 1], pitch, roll and yaw to [-1, 1] -- the ranges the quadrotor model takes -- so that the hand weights are the pilot's laws and not an approximation of them.
//
// *** THE HAND WEIGHTS ARE THE HAND PILOT, WRITTEN THROUGH THE NETWORK, AND THEY ARE IT TO FLOAT32 (a few 1e-7). *** Each output is a sum of features through a PAIR of relu channels (z and -z, read back as the difference), the recurrent core left at zero, an exact identity:
// thrust = f6 + 5 kVs f7; pitch = 0.1 kTheta f1 - 0.5 kQ f2; roll = 0.1 kTheta f3 - 0.5 kQ f4; yaw = 0.5 kYaw f5 (kTheta and kQ the attitude gains the airframe's authority makes, brain/autopilotDrone.mjs attitudeGains). brain/pilotDronePolicy-selfcheck.mjs holds the network to
// autopilotDrone.decide() over 2,000 random states, and the flight it makes to the flight the hand pilot makes.
"use strict";
import * as Topo from "./gfcTopology.mjs";
import * as Q from "../physics/mechanics/multirotorModel6dof.mjs";
import * as AD from "./autopilotDrone.mjs";
import * as DT from "./droneTask.mjs";

export const FEATURES = 20, HIDDEN = Topo.NEURON_ORDER.length, OUTPUTS = 4;
export const REC_STEPS = 3, REC_EDGES = Topo.EDGES.length;
export const FEATURE_NAMES = Object.freeze(["bias", "pitchErr", "pitchRate", "bankErr", "rollRate", "yawRateErr", "thrustFF", "climbErr", "agl", "failedLeft", "speedFwd", "speedRight", "bank", "pitch", "headingErr", "motorOut", "failedFront", "pointFwd", "pointRight", "yawRate"]);
export const OUTPUT_NAMES = Object.freeze(["thrust", "pitch", "roll", "yaw"]);
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
/** Four raw outputs -> { thrust, pitch, roll, yaw }, each clamped to its control's range; a non-finite output is read as 0. */
export const controlsOf = (y) => ({ thrust: clamp(fin(y[0]), 0, 1), pitch: clamp(fin(y[1]), -1, 1), roll: clamp(fin(y[2]), -1, 1), yaw: clamp(fin(y[3]), -1, 1) });
/** features -> { thrust, pitch, roll, yaw }. */
export const forward = (w, x) => controlsOf(raw(w, x));

/** The twenty features of a guidance record (brain/autopilotDrone.mjs guidance()) and the state it came from, in FEATURE_NAMES order. The rates are clamped wide (15 rad/s) so that the hand weights are the hand pilot's laws even in a spin. */
export function featuresFrom(gd, state) {
    const r = gd.rates, a = gd.att, h = a.heading, vx = state.vel[0], vy = state.vel[1];
    return [
        1, clamp(gd.pitchErr / 0.1, -12, 12), clamp(r.pitch / 0.5, -30, 30), clamp(gd.bankErr / 0.1, -32, 32), clamp(r.roll / 0.5, -30, 30), clamp(gd.yawRateErr / 0.5, -30, 30), gd.thrustFF, clamp(gd.climbErr / 5, -12, 12),
        clamp(gd.agl / 50, -1, 4), clamp(gd.failedLR, -2, 2), clamp((vx * Math.cos(h) - vy * Math.sin(h)) / 10, -4, 4), clamp((-vx * Math.sin(h) - vy * Math.cos(h)) / 10, -4, 4), clamp(a.bank / 0.5, -7, 7), clamp(a.pitch / 0.5, -4, 4), gd.headingErr / Math.PI, gd.motorOut ? 1 : 0, clamp(gd.failedFB, -2, 2),
        clamp(gd.ePosF / 20, -4, 4), clamp(gd.ePosR / 20, -4, 4), clamp(r.yaw, -6, 6),
    ].map(fin);
}
/** The features for a state, a target, the wind and the options. */
export const features = (state, target, wind = [0, 0, 0], opts = {}) => featuresFrom(AD.guidance(state, target, wind, opts), state);

/** A pilot (state, target, wind, opts) -> { thrust, pitch, roll, yaw } from weights: the hand pilot's own contract. */
export function pilotFor(w) { return (state, target, wind = [0, 0, 0], opts = {}) => forward(w, features(state, target, wind, opts)); }

/** The hand pilot's laws in the network's own weights (see the header). `gains` default to AUTOPILOT_DRONE's; the airframe is the default one. */
export function handWeights(gains = {}) {
    const K = { ...AD.AUTOPILOT_DRONE, ...gains }, T = AD.trimOf(AD.defaultModel()), kp = AD.attitudeGains(T.alphaPitch, K), kr = AD.attitudeGains(T.alphaRoll, K);
    const w = zeroWeights(), W1 = (h, f, v) => { w[h * FEATURES + f] = v; };
    const outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES, W2 = (o, h, v) => { w[outBase + o * HIDDEN + h] = v; };
    // z = sum of coefficient * feature: a pair of relu channels per output (z and -z), read back as h_a - h_b = z
    const channel = (o, terms) => { for (const [f, v] of terms) { W1(2 * o, f, v); W1(2 * o + 1, f, -v); } W2(o, 2 * o, 1); W2(o, 2 * o + 1, -1); };
    channel(0, [[6, 1], [7, 5 * K.kVs]]);                                    // thrust = thrustFF + kVs climbErr
    channel(1, [[1, 0.1 * kp.kTheta], [2, -0.5 * kp.kQ]]);                   // pitch  = kTheta pitchErr - kQ pitchRate
    channel(2, [[3, 0.1 * kr.kTheta], [4, -0.5 * kr.kQ]]);                   // roll   = kTheta bankErr - kQ rollRate
    channel(3, [[5, 0.5 * K.kYaw]]);                                         // yaw    = kYaw yawRateErr
    return w;
}

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/** A copy of `w` with a gaussian of `sigma` added to every weight (the roster's "hand + noise"). */
export function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }

// ---- training: the recipe every pilot in this tree is made by --------------------------------------------------------------------------------------------------------------------------------------------
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** The weights `w` flown over a set of scenarios (brain/droneTask.mjs evaluate()): { score, runs, crashed, byKind }. */
export const evaluate = (w, set = DT.TRAIN_SET, opts = {}) => DT.evaluate(pilotFor(w), set, opts);
/** A copy of `w` with 1..maxK randomly chosen weights moved by a gaussian of `sigma`: the sparse mutation of brain/pilotRotorPolicy.mjs. */
export function mutate(w, sigma, rng, maxK = 4) {
    const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
    for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
    return o;
}
/** (1+1)-ES from the hand weights (the hand pilot) on TRAIN_SET. A child that scores exactly its parent replaces it, counted apart. Deterministic for a seed. */
export function train({ seed = 7, iters = 600, sigma = 0.3, maxK = 4, start = null, trainSet = DT.TRAIN_SET, onIter = null, objective = null } = {}) {   // `objective` (an evaluate() result -> number, e.g. DT.guarded) replaces the plain score as what a child is judged by; null is the score
    const rng = mulberry(seed); let best = start ? Float32Array.from(start) : handWeights();
    const judge = (x) => { const r = evaluate(x, trainSet); return objective ? objective(r) : r.score; };
    let bestScore = judge(best), improved = 0, neutral = 0; const history = [{ i: 0, score: bestScore }];
    for (let i = 1; i <= iters; i++) {
        const cand = mutate(best, sigma, rng, maxK), score = judge(cand);
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % 50 === 0 || i === iters) history.push({ i, score: bestScore });
        if (onIter) onIter(i, { score: bestScore, improved, neutral });
    }
    return { weights: best, trainScore: bestScore, history, iters, improved, neutral };
}
/** Put every weight that differs from `toward` (default: the hand weights) back whenever the TRAIN score does not fall, passes repeated to a fixed point. */
export function prune(w, { toward = null, trainSet = DT.TRAIN_SET, score = null, objective = null } = {}) {   // `score` (weights -> number) is for the gate, which drives the logic with a score whose interactions it controls; null is the weights flown over trainSet
    const base0 = toward ? Float32Array.from(toward) : handWeights(), out = Float32Array.from(w), ev = score || ((x) => { const r = evaluate(x, trainSet); return objective ? objective(r) : r.score; });
    const differs = () => { const idx = []; for (let i = 0; i < out.length; i++) if (Math.abs(out[i] - base0[i]) > 1e-6) idx.push(i); return idx; };
    const moved = differs().length; let best = ev(out), passes = 0, reverted;
    // GROUP TESTING FIRST. Most of what a search moves is drift (a child that scores exactly its parent replaces it), and a flight over the set costs seconds: putting 1,500 weights back one at a time is 1,500 flights. So try
    // putting back a whole block of them at once; if the score does not fall the block was nothing, and if it does, halve it and try the halves. What survives goes through the one-at-a-time loop below, which is what makes
    // the result a fixed point (no single weight left that could be put back without the score falling).
    const group = (idx) => {
        if (!idx.length) return;
        const keep = idx.map((i) => out[i]);
        for (const i of idx) out[i] = base0[i];
        const s = ev(out);
        if (s >= best - 1e-9) { best = Math.max(best, s); return; }
        idx.forEach((i, k) => { out[i] = keep[k]; });
        if (idx.length === 1) return;
        const h = idx.length >> 1; group(idx.slice(0, h)); group(idx.slice(h));
    };
    group(differs());
    do {
        reverted = 0; passes++;
        for (const i of differs()) {
            const keep = out[i]; out[i] = base0[i];
            const s = ev(out);
            if (s >= best - 1e-9) { best = Math.max(best, s); reverted++; } else out[i] = keep;
        }
    } while (reverted > 0 && passes < 64);   // each reverting pass shrinks differs(), so it ends on its own; the cap is for a revert that did not revert (then it would never)
    return { weights: out, kept: differs().length, moved, passes, trainScore: best };
}

// ---- the front door ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function reportLines() {
    const w = handWeights(), m = AD.defaultModel(), s = Q.createState(m, { pos: [0, 0, 50] });
    const c = pilotFor(w)(s, { pos: [30, 0], altitude: 60, heading: 0.5 });
    return [
        `[pilotDronePolicy] the Giant Fiber Circuit (${HIDDEN} neurons, ${REC_EDGES} synapses) as a quadrotor pilot: ${FEATURES} features -> ${OUTPUTS} controls, ${WEIGHT_COUNT} weights`,
        `  hand weights: ${w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)} of ${WEIGHT_COUNT} non-zero; they are autopilotDrone's laws and fly the same flight`,
        `  asked to go 30 m ahead, up 10 m and turn 29 degrees right from a hover: thrust ${c.thrust.toFixed(3)} pitch ${c.pitch.toFixed(3)} roll ${c.roll.toFixed(3)} yaw ${c.yaw.toFixed(3)}`,
    ];
}
if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
