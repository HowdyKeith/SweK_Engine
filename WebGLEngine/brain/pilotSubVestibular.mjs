// WebGLEngine/brain/pilotSubVestibular.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/pilotSubVestibular-selfcheck.mjs)
//
// THE RUNG 4b PILOT: a submarine pilot whose only path from the sensors to the controls is the zebrafish vestibular circuit (brain/FISH_VESTIBULAR_HELPER_WIP.md, Addenda 1, 2 and 5), registered before it was built:
//
//   output  =  the PD autopilot's laws (brain/autopilotSub.mjs, on the same 14 features)  +  a RESIDUAL read from the circuit's central cells, all four clamped to [-1, 1]; the readout starts at ZERO, so the pilot STARTS AS THE AUTOPILOT, exactly
//   input   4b-T, tuning-derived: NO dense input layer. Afferent i is driven by the tilt signals projected on its own tuning angle theta_i (0 = rightward tilt, pi/2 = rostral = nose-down):
//              x_i = sin(theta_i) P + cos(theta_i) R         P = nose-down pitch, R = right-roll, each in the afferent's kinetic form:
//              phasic (myelinated) afferents read the RATES (P = -pitch rate, R = roll rate), tonic ones the ATTITUDE (P = -pitch, R = bank)
//           read from the vessel's sensed quantities (the 14 features have no roll rate), each scaled to unit RMS over the training dives (`scales`, measured by `scalesFrom`; 1 until given)
//   cells   every cell keeps a leaky copy of its own last activity (Addendum 5; the circuit has no loop, so the wiring alone remembers two ticks):
//              afferent:  h' = relu(b + x) + lambda h          central cell:  h' = relu(b + sum over its edges of w h'_afferent) + lambda h
//           an edge's weight is a trained MAGNITUDE (every edge is excitatory), starting at 0.3 x count / mean count; the biases start at 0; lambda is ONE trained scalar, the same for every cell, start 0.99, clamped to [0, 1];
//           the state is reset whenever the target object changes (a new dive, as tools/subDisturb.mjs detects one). NO STATE (`persist: false`) is lambda fixed at 0 and has no weight slot.
//   mirror  the tables are the RIGHT side only, so the pilot is a MIRRORED PAIR: the left copy has the SAME weights (tied) and the cosine (lateral) input terms sign-flipped; the two readouts are summed, yaw odd under the mirror
//           (the left copy's yaw is negated) and pitch, thrust and ballast even
//   4b-D    (option `dense`) the variant of Addendum 8: afferent i is driven by the 14 features through 14 trained weights (1,176 for the whole arm) instead of the tuning angle; the mirror flips the lateral features (headingErr, yawRate, beta, bank); the rest is unchanged
//   readout the four controls read ALL the central cells of the arm (dense, trainable, from zero) plus four biases
//   weights [ edge magnitudes: E ][ biases: inputs + cells ][ W_out: 4 x cells ][ b_out: 4 ][ lambda: 1, only with a state ]    (E arm: 31 + 30 + 20 + 4 = 85, and lambda = 86; the registration's 85 did not count lambda)
//
// THE CIRCUIT is { inputs: [{ name, theta, myelinated }], cells: [{ name, cls, pathway }], edges: [[input index, cell index, count]] }; `circuitOf(extraction, arm)` makes one from tools/fishVestibularCircuit.mjs's extract() for the arm "whole", "B" or "E".
// The controls (ER, CLASS, DEGREE, COUNT, TUNING) are pure functions of a circuit here; `reachOf` says how many (input, cell) pairs an arm connects.
//
// WHAT THIS IS NOT: a model of a fish, or a trained anything. Nothing has been trained on this pilot. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as AS from "./autopilotSub.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import * as T from "./subTask.mjs";
import { FEATURES, OUTPUTS, features, mulberry } from "./pilotSubPolicy.mjs";

export { FEATURES, OUTPUTS };
export const INIT = Object.freeze({ seed: 4711, recScale: 0.3, bias: 0, lambda0: 0.99, inScale: 0.2 });
export const ARMS = Object.freeze(["whole", "B", "E"]);
/** The lateral features among the 14 (headingErr, yawRate, beta, bank): odd under the mirror in the dense variant. */
export const LATERAL = Object.freeze([4, 5, 6, 11]);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** The circuit of an arm from an extraction ({ afferents: [{ name, myelinated, theta }], centrals: [{ name, cls, pathway }], edges: [{ a, c, w }] }): the arm's cells, the afferents that reach one of them (sorted by name) and the edges between. */
export function circuitOf(x, arm) {
    if (!ARMS.includes(arm)) throw new Error(`pilotSubVestibular.circuitOf: arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
    const cells = x.centrals.filter((c) => arm === "whole" || c.pathway === arm), cellIx = new Map(cells.map((c, i) => [c.name, i])), es = x.edges.filter((e) => cellIx.has(e.c));
    const aff = new Map(x.afferents.map((a) => [a.name, a])), names = [...new Set(es.map((e) => e.a))].sort(), inIx = new Map(names.map((n, i) => [n, i]));
    const inputs = names.map((n) => { const a = aff.get(n); if (!Number.isFinite(a.theta)) throw new Error(`pilotSubVestibular.circuitOf: afferent ${n} has no tuning angle`); return { name: n, theta: a.theta, myelinated: !!a.myelinated }; });
    return { inputs, cells: cells.map((c) => ({ name: c.name, cls: c.cls, pathway: c.pathway })), edges: es.map((e) => [inIx.get(e.a), cellIx.get(e.c), e.w]) };
}

/** The arrays the pilot and the controls need; refuses what cannot be a circuit. */
export function topologyOf(circuit) {
    if (!circuit || !Array.isArray(circuit.inputs) || !Array.isArray(circuit.cells) || !Array.isArray(circuit.edges)) throw new Error("pilotSubVestibular.topologyOf: a circuit is { inputs, cells, edges }");
    const NI = circuit.inputs.length, NC = circuit.cells.length, E = circuit.edges.length;
    if (NI < 1 || NC < 1) throw new Error(`pilotSubVestibular.topologyOf: ${NI} inputs and ${NC} cells are not a circuit`);
    circuit.inputs.forEach((a, i) => { if (!Number.isFinite(a.theta)) throw new Error(`pilotSubVestibular.topologyOf: input ${i} has no tuning angle`); });
    const seen = new Set(), from = new Int32Array(E), to = new Int32Array(E), count = new Float64Array(E);
    circuit.edges.forEach((e, k) => {
        const [a, c, n] = e;
        if (!(Number.isInteger(a) && a >= 0 && a < NI && Number.isInteger(c) && c >= 0 && c < NC)) throw new Error(`pilotSubVestibular.topologyOf: edge ${k} [${a}, ${c}] is outside the ${NI} inputs and ${NC} cells`);
        if (seen.has(a * NC + c)) throw new Error(`pilotSubVestibular.topologyOf: edge ${k} repeats the pair ${a} -> ${c}`);
        if (!(n > 0)) throw new Error(`pilotSubVestibular.topologyOf: edge ${k} has count ${n}, which is not above zero`);
        seen.add(a * NC + c); from[k] = a; to[k] = c; count[k] = n;
    });
    return { NI, NC, E, from, to, count };
}

/** How many (input, cell) pairs the edges connect and how many cells and inputs have at least one edge: { pairs, cellsReached, inputsReaching } (one step: the circuit has no loop). */
export function reachOf(circuit) {
    const t = topologyOf(circuit);
    return { pairs: t.E, cellsReached: new Set(t.to).size, inputsReaching: new Set(t.from).size };
}

// ---- the controls (pure functions of a circuit and a seed; each keeps the inputs, the cells and the edge count) ------------------------------------------------------------------------------------------------
const withEdges = (circuit, edges) => ({ ...circuit, edges });
const pick = (list, rng) => list[Math.floor(rng() * list.length)];
/** Edges redrawn endpoint by endpoint with `choose(k, rng) -> [input, cell]`; counts stay with their edge position; no repeat. */
function redraw(circuit, topo, rng, choose) {
    const used = new Set(), edges = [];
    for (let k = 0; k < topo.E; k++) { let a, c; do { [a, c] = choose(k, rng); } while (used.has(a * topo.NC + c)); used.add(a * topo.NC + c); edges.push([a, c, topo.count[k]]); }
    return withEdges(circuit, edges);
}
/** ER: every edge redrawn uniformly between the inputs and the cells. */
export function erControl(circuit, seed) {
    const t = topologyOf(circuit), rng = mulberry(seed), ins = Array.from({ length: t.NI }, (_, i) => i), cs = Array.from({ length: t.NC }, (_, i) => i);
    return redraw(circuit, t, rng, (k, r) => [pick(ins, r), pick(cs, r)]);
}
/** CLASS: every edge keeps its source's kinetic class (phasic or tonic) and its target's CELL class; the endpoints are redrawn inside those blocks. */
export function classControl(circuit, seed) {
    const t = topologyOf(circuit), rng = mulberry(seed), kin = (i) => (circuit.inputs[i].myelinated ? "phasic" : "tonic"), byKin = new Map(), byCls = new Map();
    circuit.inputs.forEach((_, i) => { if (!byKin.has(kin(i))) byKin.set(kin(i), []); byKin.get(kin(i)).push(i); });
    circuit.cells.forEach((c, i) => { if (!byCls.has(c.cls)) byCls.set(c.cls, []); byCls.get(c.cls).push(i); });
    return redraw(circuit, t, rng, (k, r) => [pick(byKin.get(kin(t.from[k])), r), pick(byCls.get(circuit.cells[t.to[k]].cls), r)]);
}
/** DEGREE: pairs of edges swap their targets (Maslov-Sneppen, 20 attempts an edge, a swap that repeats a pair is rejected): every input keeps its out-degree, every cell its in-degree, every edge its source and its count. */
export function degreeControl(circuit, seed) {
    const t = topologyOf(circuit), rng = mulberry(seed), E = t.E, NC = t.NC, from = Array.from(t.from), to = Array.from(t.to), has = new Set(from.map((a, k) => a * NC + to[k]));
    for (let attempt = 0; attempt < 20 * E; attempt++) {
        const a = Math.floor(rng() * E), b = Math.floor(rng() * E);
        const f1 = from[a], t1 = to[a], f2 = from[b], t2 = to[b];
        if (has.has(f1 * NC + t2) || has.has(f2 * NC + t1)) continue;
        has.delete(f1 * NC + t1); has.delete(f2 * NC + t2); has.add(f1 * NC + t2); has.add(f2 * NC + t1); to[a] = t2; to[b] = t1;
    }
    return withEdges(circuit, Array.from({ length: E }, (_, k) => [from[k], to[k], t.count[k]]));
}
/** COUNT (reported, not in the verdict): the counts permuted across the edges. */
export function countControl(circuit, seed) {
    const t = topologyOf(circuit), rng = mulberry(seed), counts = Array.from(t.count);
    for (let i = counts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [counts[i], counts[j]] = [counts[j], counts[i]]; }
    return withEdges(circuit, Array.from({ length: t.E }, (_, k) => [t.from[k], t.to[k], counts[k]]));
}
/** TUNING (reported, not in the verdict): tuning angles AND kinetic classes permuted together among the inputs, the wiring as it is. */
export function tuningControl(circuit, seed) {
    const t = topologyOf(circuit), rng = mulberry(seed), tags = circuit.inputs.map((a) => ({ theta: a.theta, myelinated: a.myelinated }));
    for (let i = tags.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [tags[i], tags[j]] = [tags[j], tags[i]]; }
    return { ...circuit, inputs: circuit.inputs.map((a, i) => ({ ...a, ...tags[i] })), edges: Array.from({ length: t.E }, (_, k) => [t.from[k], t.to[k], t.count[k]]) };
}
export const CONTROLS = Object.freeze({ er: erControl, class: classControl, degree: degreeControl, count: countControl, tuning: tuningControl });

// ---- the senses ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/** The four tilt signals of the vessel's sensed quantities: nose-down pitch and right-roll, in tonic form (attitude) and phasic form (rate). */
export function sense(state) {
    const a = S.attitude(state), r = S.rates(state);
    return { pTonic: -a.pitch, rTonic: a.bank, pPhasic: -r.pitch, rPhasic: r.roll };
}
export const SENSES = Object.freeze(["pTonic", "rTonic", "pPhasic", "rPhasic"]);
/** Scales that make each signal unit RMS over `samples` (an array of `sense` results); a signal that is always zero keeps scale 1. */
export function scalesFrom(samples) {
    const out = {};
    for (const k of SENSES) { const ms = samples.length ? samples.reduce((s, v) => s + fin(v[k]) ** 2, 0) / samples.length : 0; out[k] = ms > 0 ? 1 / Math.sqrt(ms) : 1; }
    return out;
}
/** The drive of afferent `a` from the senses: sin(theta) P + cos(theta) R in its kinetic form, scaled; `mirror` flips the lateral (cosine) term for the left copy. */
export function driveOf(a, sensed, scales, mirror = false) {
    const P = a.myelinated ? sensed.pPhasic * scales.pPhasic : sensed.pTonic * scales.pTonic, R = a.myelinated ? sensed.rPhasic * scales.rPhasic : sensed.rTonic * scales.rTonic;
    return Math.sin(a.theta) * P + (mirror ? -1 : 1) * Math.cos(a.theta) * R;
}

// ---- the pilot -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * The whole pilot for one circuit. `opts`: { persist (default true; false is NO STATE), scales (default all 1), wrap (wraps a pilot before it is flown, as in brain/pilotSubCircuitState.mjs), evaluate (pilot, set, opts) -> result, the task to train on; default brain/subTask.mjs's },
 * `init`. Returns the contract of brain/pilotSubPolicy.mjs's createSubPolicy -- { name, FEATURES, HIDDEN, OUTPUTS, WEIGHT_COUNT, zeroWeights, pilotFor, handWeights, perturb, mutate, evaluate, train, prune, reportLines } -- plus `step`, `LAMBDA_INDEX` and the arm's sizes.
 */
export function createVestibularPolicy(circuit, name = "circuit", opts = {}, init = INIT) {
    const persist = opts.persist !== false, dense = opts.dense === true, wrap = opts.wrap || ((p) => p), run = opts.evaluate || T.evaluate, scales = { pTonic: 1, rTonic: 1, pPhasic: 1, rPhasic: 1, ...(opts.scales || {}) };
    const topo = topologyOf(circuit), { NI, NC, E, from, to, count } = topo, NB = NI + NC;
    const OFF_B = E, OFF_W2 = OFF_B + NB, OFF_B2 = OFF_W2 + OUTPUTS * NC, OFF_L = OFF_B2 + OUTPUTS, OFF_IN = OFF_L + (persist ? 1 : 0), WEIGHT_COUNT = OFF_IN + (dense ? FEATURES * NI : 0), LAMBDA_INDEX = persist ? OFF_L : -1;
    const meanCount = E ? count.reduce((s, v) => s + v, 0) / E : 1, K = AS.AUTOPILOT_SUB;
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
    const law = (x) => [0.3 * K.kTheta * x[2] - 0.2 * K.kQ * x[3], Math.PI * K.kHdg * x[4] - 0.2 * K.kR * x[5] - 0.2 * K.kBeta * x[6], x[1] + K.kSpd * x[7], 10 * K.kBalD * x[8] + 0.5 * K.kBalV * x[9]];
    const lambdaOf = (w) => (persist ? clamp(fin(w[OFF_L]), 0, 1) : 0);
    function handWeights() {
        const w = zeroWeights();
        for (let k = 0; k < E; k++) w[k] = (init.recScale * count[k]) / meanCount;
        for (let i = 0; i < NB; i++) w[OFF_B + i] = init.bias;
        if (persist) w[OFF_L] = init.lambda0;
        if (dense) { const rng = mulberry(init.seed); for (let i = 0; i < FEATURES * NI; i++) w[OFF_IN + i] = gauss(rng) * init.inScale; }
        return w;
    }
    /** 4b-D: afferent i driven by the 14 features through its trained weights; the mirror flips the LATERAL features (headingErr, yawRate, beta, bank). `x` is the feature vector. */
    function denseDrive(w, i, x, mirror) {
        let sum = 0; const row = OFF_IN + i * FEATURES;
        for (let f = 0; f < FEATURES; f++) sum += w[row + f] * (mirror && LATERAL.includes(f) ? -1 : 1) * fin(x[f]);
        return sum;
    }
    /** One tick of one copy, in place: `h` holds the last activity of the NB cells (inputs first, then the central cells) and is replaced by the new one. */
    function updateInto(w, sensed, mirror, h, tmp) {
        const lam = lambdaOf(w);
        for (let i = 0; i < NI; i++) tmp[i] = Math.max(0, w[OFF_B + i] + (dense ? denseDrive(w, i, sensed, mirror) : driveOf(circuit.inputs[i], sensed, scales, mirror))) + lam * h[i];
        for (let c = 0; c < NC; c++) tmp[NI + c] = w[OFF_B + NI + c];
        for (let k = 0; k < E; k++) tmp[NI + to[k]] += Math.abs(w[k]) * tmp[from[k]];
        for (let c = 0; c < NC; c++) { const v = tmp[NI + c]; tmp[NI + c] = (v > 0 ? v : 0) + lam * h[NI + c]; }
        h.set(tmp);
        return h;
    }
    /** The four controls' residual from one copy's central-cell activity. */
    function residual(w, h) {
        const y = new Array(OUTPUTS);
        for (let o = 0; o < OUTPUTS; o++) { let sum = w[OFF_B2 + o]; const row = OFF_W2 + o * NC; for (let c = 0; c < NC; c++) sum += w[row + c] * h[NI + c]; y[o] = sum; }
        return y;
    }
    /** The autopilot's laws plus the mirrored pair's summed residual (yaw odd), clamped. `hr` and `hl` are the right and the left copy's activity, already updated. */
    function decode(w, x, hr, hl) {
        const base = law(x), r = residual(w, hr), l = residual(w, hl);
        const y = [base[0] + r[0] + l[0], base[1] + r[1] - l[1], base[2] + r[2] + l[2], base[3] + r[3] + l[3]];
        return { pitch: clamp(fin(y[0]), -1, 1), yaw: clamp(fin(y[1]), -1, 1), thrust: clamp(fin(y[2]), -1, 1), ballast: clamp(fin(y[3]), -1, 1) };
    }
    /** A pilot (state, target, current) -> controls from weights; both copies' activity is reset whenever the target object changes. */
    const pilotFor = (w) => {
        let target = null; const hr = new Float64Array(NB), hl = new Float64Array(NB), tmp = new Float64Array(NB);
        return (state, tgt, current = [0, 0, 0]) => {
            if (tgt !== target) { target = tgt; hr.fill(0); hl.fill(0); }
            const x = features(state, tgt, current), sensed = dense ? x : sense(state);
            updateInto(w, sensed, false, hr, tmp); updateInto(w, sensed, true, hl, tmp);
            return decode(w, x, hr, hl);
        };
    };
    /** The activity of all NB cells (inputs first) after each of a list of `sense` results, from rest; `mirror` for the left copy. For the gate and for reading a trained pilot. */
    function activityTrace(w, sensedList, mirror = false) {
        const h = new Float64Array(NB), tmp = new Float64Array(NB), out = [];
        for (const sd of sensedList) { updateInto(w, sd, mirror, h, tmp); out.push(Array.from(h)); }
        return out;
    }
    const evaluate = (w, set = T.TRAIN_SET, o = {}) => run(wrap(pilotFor(w)), set, o);
    const fix = (o) => { if (persist) o[OFF_L] = clamp(o[OFF_L], 0, 1); return o; };
    function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return fix(o); }
    function mutate(w, sigma, rng, maxK = 4) {
        const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
        for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
        return fix(o);
    }
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
    const reach = reachOf(circuit);
    function reportLines() {
        return [`[pilotSubVestibular] ${name} (${NI} inputs, ${NC} cells, ${E} synapses) as a ${persist ? "leaky-state" : "NO-STATE"} mirrored pair: ${dense ? "DENSE trained input from the 14 features" : "tuning-derived input"} -> ${NC} cells -> ${OUTPUTS} controls added to the autopilot's, ${WEIGHT_COUNT} trained weights`,
            `  ${reach.inputsReaching} of ${NI} inputs reach a cell; ${reach.cellsReached} of ${NC} cells are reached`];
    }
    return { name, FEATURES, HIDDEN: NB, OUTPUTS, WEIGHT_COUNT, INPUTS: NI, CELLS: NC, EDGES: E, LAMBDA_INDEX, persist, dense, zeroWeights, handWeights, activityTrace, pilotFor, perturb, mutate, evaluate, train, prune, reportLines, reach, scales };
}
