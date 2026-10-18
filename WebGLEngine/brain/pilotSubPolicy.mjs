// WebGLEngine/brain/pilotSubPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A CONNECTOME-WIRED PILOT FOR THE SUBMARINE: brain/autopilotSub.mjs's contract -- (state, target, current) -> { pitch, yaw, thrust, ballast } -- from a small recurrent network whose recurrent weights exist only where
// a real circuit has a synapse. It is brain/pilotFlightPolicy.mjs for the water, with ONE difference that is the point of this file: THE CIRCUIT IS A PARAMETER. `createSubPolicy(topology)` takes any module shaped like
// brain/gfcTopology.mjs ({ NEURON_ORDER, EDGES }, EDGES = [toIdx, fromIdx] pairs) and returns the whole pilot for it -- features, forward pass, hand weights, training. The default export wires the fruit fly's Giant Fiber
// Circuit (34 neurons, 313 synapses of Janelia FlyEM's male-cns), the only circuit this tree has a real connectome for; a FISH circuit is a second call, `createSubPolicy(zebrafishTopology)`, the day one is baked
// (tools/bakeConnectomeTopology.mjs makes the file from a vendored circuit JSON). Nothing else here knows which animal it is.
//
// *** WHAT THE FLY IS DOING IN A SUBMARINE, SAID PLAINLY. *** The hand weights are the autopilot's laws written through the network (they are it to float32), and training moves them from there. The circuit sets WHICH
// recurrent weights may exist; it does not know what a submarine is, and the Giant Fiber Circuit is an escape reflex, not a depth controller. This is the stand-in network the vessel, the task and the training loop are
// tested with. A result here says the pipeline works and what a connectome-shaped recurrent core costs or buys over the PD laws -- not that a fly can pilot a submarine.
//
//   FEATURES   the autopilot's own intermediate quantities (guidance()), scaled to about 1, then four it does not use that a learned pilot may:
//              0 bias; 1 the thrust that holds the TARGET speed; 2 pitch error ((the pitch the climb needs, less the pitch flown) / 0.3) x sched; 3 pitch rate / 0.2 x sched; 4 heading error / pi x sched;
//              5 yaw rate / 0.2 x sched; 6 sideslip / 0.2; 7 speed error (m/s); 8 depth error / 10 m (clamped at 6); 9 climb rate / 0.5 m/s;
//              THEN the extras: 10 pitch attitude / 0.3; 11 bank / 0.3; 12 speed / 3; 13 angle of attack / 0.2.   (`sched` is autopilotSub's (2.5 / V)^2 gain schedule: features 2-5 already carry it, as flightPolicy's carry `upright`.)
//   OUTPUTS    pitch, yaw, thrust, ballast CLAMPED to [-1, 1] -- the ranges the vessel takes, so the hand weights are the autopilot's laws and not an approximation of them.
//
// A pilot is a weight vector: FEATURES x HIDDEN + HIDDEN + EDGES + HIDDEN x OUTPUTS + OUTPUTS numbers (for the fly: 14 x 34 + 34 + 313 + 136 + 4 = 963). "hand", "noise", "zero" and a trained pilot are choices of that vector.
// THE HAND WEIGHTS ARE THE AUTOPILOT, WRITTEN THROUGH THE NETWORK: each output a sum of features through a PAIR of relu channels (z and -z, read back as the difference), the recurrent core left at zero, an exact identity.
"use strict";
import * as GFC from "./gfcTopology.mjs";
import * as AS from "./autopilotSub.mjs";
import * as T from "./subTask.mjs";

export const FEATURES = 14, OUTPUTS = 4, REC_STEPS = 3;
export const FEATURE_NAMES = Object.freeze(["bias", "thrTrim", "pitchErr", "pitchRate", "headingErr", "yawRate", "beta", "speedErr", "depthErr", "climb", "pitch", "bank", "speed", "alpha"]);
export const OUTPUT_NAMES = Object.freeze(["pitch", "yaw", "thrust", "ballast"]);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);

/** The features of a guidance record (brain/autopilotSub.mjs guidance()), in FEATURE_NAMES order. */
export function featuresFrom(gd) {
    const r = gd.rates, a = gd.att, s = gd.sched;
    return [
        1, gd.thrTrim, s * clamp(gd.pitchErr / 0.3, -8, 8), s * clamp(r.pitch / 0.2, -12, 12), s * gd.headingErr / Math.PI, s * clamp(r.yaw / 0.2, -15, 15), clamp(a.beta / 0.2, -8, 8), clamp(gd.speedErr, -6, 6), clamp(gd.depthErr / 10, -6, 6), clamp(gd.climb / 0.5, -12, 12),
        clamp(a.pitch / 0.3, -6, 6), clamp(a.bank / 0.3, -8, 8), a.speed / 3, clamp(a.alpha / 0.2, -8, 8),
    ].map(fin);
}
/** The features for a state, a target and the current. */
export const features = (state, target, current = [0, 0, 0], opts = {}) => featuresFrom(AS.guidance(state, target, current, opts));

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
export const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/**
 * The whole pilot for one circuit. `topo` is { NEURON_ORDER, EDGES } (brain/gfcTopology.mjs's shape); the circuit needs at least 2 x OUTPUTS neurons, since the hand weights use a relu pair per output.
 * Returns { name, FEATURES, HIDDEN, OUTPUTS, REC_STEPS, REC_EDGES, WEIGHT_COUNT, zeroWeights, layersOf, forward, pilotFor, handWeights, perturb, mutate, evaluate, train, prune, reportLines }.
 */
export function createSubPolicy(topo, name = "circuit") {
    const HIDDEN = topo.NEURON_ORDER.length, REC_EDGES = topo.EDGES.length;
    if (HIDDEN < 2 * OUTPUTS) throw new Error(`createSubPolicy: the circuit has ${HIDDEN} neurons; the hand weights need at least ${2 * OUTPUTS}`);
    for (const [to, from] of topo.EDGES) if (!(to >= 0 && to < HIDDEN && from >= 0 && from < HIDDEN)) throw new Error(`createSubPolicy: an edge [${to}, ${from}] is outside the ${HIDDEN} neurons`);
    const WEIGHT_COUNT = FEATURES * HIDDEN + HIDDEN + REC_EDGES + HIDDEN * OUTPUTS + OUTPUTS, ZERO_HIDDEN = new Float32Array(HIDDEN), REC_OFFSET = FEATURES * HIDDEN + HIDDEN;
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT);

    function expandRecurrent(Wrec) {
        const Wm = new Float32Array(HIDDEN * HIDDEN);
        for (let i = 0; i < HIDDEN; i++) Wm[i * HIDDEN + i] = 1;
        topo.EDGES.forEach(([toIdx, fromIdx], k) => { Wm[toIdx * HIDDEN + fromIdx] += Wrec[k]; });
        return Wm;
    }
    /** The network as mlpLayerCpu layers (the shape the TSL and GPU twins take): { nIn, nOut, W, b, act } x (REC_STEPS + 2). forward() computes the same function over the edge list. */
    function layersOf(w) {
        let o = 0;
        const W1 = w.subarray(o, o += FEATURES * HIDDEN), b1 = w.subarray(o, o += HIDDEN), Wrec = w.subarray(o, o += REC_EDGES), W2 = w.subarray(o, o += HIDDEN * OUTPUTS), b2 = w.subarray(o, o += OUTPUTS);
        const rec = { nIn: HIDDEN, nOut: HIDDEN, W: expandRecurrent(Wrec), b: ZERO_HIDDEN, act: "relu" };
        return [{ nIn: FEATURES, nOut: HIDDEN, W: W1, b: b1, act: "relu" }, ...Array(REC_STEPS).fill(rec), { nIn: HIDDEN, nOut: OUTPUTS, W: W2, b: b2, act: "none" }];
    }

    const EDGE_TO = Int32Array.from(topo.EDGES, (e) => e[0]), EDGE_FROM = Int32Array.from(topo.EDGES, (e) => e[1]);
    /** features -> { pitch, yaw, thrust, ballast }: the linear output, each clamped to [-1, 1]; a non-finite output is read as 0. Weights are read afresh on every call, so a vector a trainer mutates in place is never run stale. */
    function forward(w, x) {
        const H0 = new Float64Array(HIDDEN), H1 = new Float64Array(HIDDEN), W1 = FEATURES * HIDDEN, B1 = W1, REC = B1 + HIDDEN, W2 = REC + REC_EDGES, B2 = W2 + HIDDEN * OUTPUTS;
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
        return { pitch: clamp(fin(y[0]), -1, 1), yaw: clamp(fin(y[1]), -1, 1), thrust: clamp(fin(y[2]), -1, 1), ballast: clamp(fin(y[3]), -1, 1) };
    }

    /** A pilot (state, target, current) -> { pitch, yaw, thrust, ballast } from weights: the autopilot's own contract. */
    const pilotFor = (w) => (state, target, current = [0, 0, 0]) => forward(w, features(state, target, current));

    /** The autopilot's laws in the network's own weights. `gains` default to AUTOPILOT_SUB's. */
    function handWeights(gains = {}) {
        const K = { ...AS.AUTOPILOT_SUB, ...gains }, w = zeroWeights(), outBase = FEATURES * HIDDEN + HIDDEN + REC_EDGES;
        const W1 = (h, f, v) => { w[h * FEATURES + f] = v; }, W2 = (o, h, v) => { w[outBase + o * HIDDEN + h] = v; };
        const channel = (o, terms) => { for (const [f, v] of terms) { W1(2 * o, f, v); W1(2 * o + 1, f, -v); } W2(o, 2 * o, 1); W2(o, 2 * o + 1, -1); };
        channel(0, [[2, 0.3 * K.kTheta], [3, -0.2 * K.kQ]]);                                  // pitch   = sched (kTheta pitchErr - kQ pitchRate)
        channel(1, [[4, Math.PI * K.kHdg], [5, -0.2 * K.kR], [6, -0.2 * K.kBeta]]);           // yaw     = sched (kHdg headingErr - kR yawRate) - kBeta beta   (features 4-5 carry the schedule; 6 does not)
        channel(2, [[1, 1], [7, K.kSpd]]);                                                    // thrust  = thrTrim + kSpd speedErr
        channel(3, [[8, 10 * K.kBalD], [9, 0.5 * K.kBalV]]);                                  // ballast = kBalD depthErr + kBalV climb
        return w;
    }

    /** A copy of `w` with a gaussian of `sigma` added to every weight. */
    function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }
    /** The weights `w` dived over a set of scenarios (brain/subTask.mjs evaluate()): { score, runs, crashed, byKind }. */
    const evaluate = (w, set = T.TRAIN_SET, opts = {}) => T.evaluate(pilotFor(w), set, opts);
    /** A copy of `w` with 1..maxK randomly chosen weights moved by a gaussian of `sigma`: the sparse mutation of brain/pilotFlightPolicy.mjs. */
    function mutate(w, sigma, rng, maxK = 4) {
        const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
        for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
        return o;
    }
    /** (1+1)-ES from the hand weights (the autopilot) on `trainSet`; `evalOpts` go to every dive (e.g. { actuators } to train against rate limits). A child that scores exactly its parent replaces it, counted apart. Deterministic for a seed. */
    function train({ seed = 7, iters = 300, sigma = 0.3, maxK = 4, start = null, trainSet = T.TRAIN_SET, onIter = null, evalOpts = {} } = {}) {
        const rng = mulberry(seed); let best = start ? Float32Array.from(start) : handWeights();
        let bestScore = evaluate(best, trainSet, evalOpts).score, improved = 0, neutral = 0; const history = [{ i: 0, score: bestScore }];
        for (let i = 1; i <= iters; i++) {
            const cand = mutate(best, sigma, rng, maxK), score = evaluate(cand, trainSet, evalOpts).score;
            if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
            if (i % 50 === 0 || i === iters) history.push({ i, score: bestScore });
            if (onIter) onIter(i, { score: bestScore, improved, neutral });
        }
        return { weights: best, trainScore: bestScore, history, iters, improved, neutral };
    }
    /** Put every weight that differs from `toward` (default: the hand weights) back whenever the TRAIN score does not fall, passes repeated to a fixed point. */
    function prune(w, { toward = null, trainSet = T.TRAIN_SET } = {}) {
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
    function reportLines() {
        const w = handWeights();
        return [
            `[pilotSubPolicy] ${name} (${HIDDEN} neurons, ${REC_EDGES} synapses) as a submarine pilot: ${FEATURES} features -> ${OUTPUTS} controls, ${WEIGHT_COUNT} weights`,
            `  hand weights: ${w.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)} of ${WEIGHT_COUNT} non-zero; they are autopilotSub's laws and dive the same dive`,
        ];
    }
    return { name, FEATURES, HIDDEN, OUTPUTS, REC_STEPS, REC_EDGES, WEIGHT_COUNT, zeroWeights, layersOf, forward, pilotFor, handWeights, perturb, mutate, evaluate, train, prune, reportLines };
}

// ---- the default: the fruit fly's Giant Fiber Circuit -------------------------------------------------------------------------------------------------------------------------------------------------------
export const FLY = createSubPolicy(GFC, "the Giant Fiber Circuit");
export const { HIDDEN, REC_EDGES, WEIGHT_COUNT, zeroWeights, layersOf, forward, pilotFor, handWeights, perturb, mutate, evaluate, train, prune, reportLines } = FLY;

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see brain/pilotFlightPolicy.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
