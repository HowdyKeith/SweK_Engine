// WebGLEngine/brain/pilotSubCircuit.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/pilotSubCircuit-selfcheck.mjs)
//
// A SUBMARINE PILOT WHOSE ONLY PATH FROM THE SENSORS TO THE CONTROLS IS A CIRCUIT'S WIRING. brain/pilotSubPolicy.mjs uses a circuit as a MASK on a hidden layer that the sensors reach densely and the controls read densely, and the
// fish result it gave (brain/SUBMARINE_WIP.md) was that most of the gain sits in those two dense layers every circuit has. This file closes them:
//
//   output  =  the PD autopilot's laws (brain/autopilotSub.mjs, written on the same 14 features, in float64)  +  a RESIDUAL that only the circuit can make, all four clamped to [-1, 1]
//   residual:  the 14 features reach ONLY the circuit's input cells (dense, trained), every cell has a bias; REC_STEPS (3) recurrent steps along the circuit's edges with the identity carry the other pilots use; an edge's weight is
//              its SOURCE cell's sign times a trained magnitude (Dale's law: a cell is excitatory or inhibitory, whatever the training does); the four controls read ONLY the circuit's output cells (dense, trained, starting at ZERO)
//
// The residual starts at zero (the readout is zero), so the pilot STARTS AS THE AUTOPILOT, EXACTLY, whatever the input weights and the wiring are; the same sparse (1+1)-ES the other pilots use moves it from there. The circuit is a
// parameter: { neurons: [{ nt, layer, ... }], edges: [[from, to, n, sign]] } -- the shape tools/fishHmi.mjs writes (vendor/zebrafish/fish1-hmi-spn.json). The INPUT cells are the neurons of the outermost layer and the OUTPUT cells are
// the neurons of layer 0 (the spinal projection neurons of that file); `topologyOf` refuses a circuit with neither.
//
// FIVE CONTROLS, each a circuit of the same neurons, input cells, output cells, edge count and counts (each is a pure function of the circuit and a seed): erControl (every edge redrawn: a signed source, any target), layerControl
// (every edge keeps its source layer and target layer and gets random endpoints inside them), degreeControl (pairs of edges swap their targets: every cell keeps its in- and out-degree), signControl (the signs of the signed cells permuted among them), countControl (the counts permuted across the edges). reachOf says
// how many output cells the input cells can reach in REC_STEPS steps: a random wiring that cannot reach the outputs is a different question from one that can.
//
// WHAT THIS IS NOT: a model of a fish. The pilot is STATELESS across control ticks (the recurrence is inside one tick, as in every pilot here), so a circuit that is an integrator has nowhere to integrate; the stateful variant is a
// later rung. A result says whether THIS WIRING, as the only route through a pilot, does better than other wirings of the same size and layering. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as AS from "./autopilotSub.mjs";
import * as T from "./subTask.mjs";
import { FEATURES, OUTPUTS, REC_STEPS, features, mulberry } from "./pilotSubPolicy.mjs";

export { FEATURES, OUTPUTS, REC_STEPS };
/** The start of everything that is not the circuit: one seed for the input weights (the same for every circuit, so that circuits are compared from the same start), the cells' bias, and the scale of the recurrent magnitudes. */
export const INIT = Object.freeze({ seed: 4711, inScale: 0.2, bias: 0.1, recScale: 0.3 });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const signOfNt = (nt) => (nt === "Exc" ? 1 : nt === "Inh" ? -1 : 0);

/** The arrays the policy and the controls need, from a circuit; refuses what cannot be one. */
export function topologyOf(circuit) {
    if (!circuit || !Array.isArray(circuit.neurons) || !Array.isArray(circuit.edges)) throw new Error("pilotSubCircuit.topologyOf: a circuit is { neurons: [...], edges: [...] }");
    const N = circuit.neurons.length, E = circuit.edges.length;
    if (N < 2) throw new Error(`pilotSubCircuit.topologyOf: ${N} neurons are not a circuit`);
    const layer = circuit.neurons.map((n, i) => { if (!Number.isInteger(n.layer) || n.layer < 0) throw new Error(`pilotSubCircuit.topologyOf: neuron ${i} has layer ${n.layer}, which is not a whole number of 0 or more`); return n.layer; });
    const sg = circuit.neurons.map((n) => signOfNt(n.nt)), top = Math.max(...layer);
    const inputs = [], outputs = [];
    layer.forEach((l, i) => { if (l === top) inputs.push(i); if (l === 0) outputs.push(i); });
    if (top === 0) throw new Error("pilotSubCircuit.topologyOf: every neuron is in layer 0, so there are no input cells apart from the output cells");
    if (!outputs.length) throw new Error("pilotSubCircuit.topologyOf: no neuron in layer 0 (the output cells)");
    const seen = new Set(), from = new Int32Array(E), to = new Int32Array(E), count = new Float64Array(E), sign = new Int8Array(E);
    circuit.edges.forEach((e, k) => {
        const [f, t, n, s] = e;
        if (!(Number.isInteger(f) && f >= 0 && f < N && Number.isInteger(t) && t >= 0 && t < N)) throw new Error(`pilotSubCircuit.topologyOf: edge ${k} [${f}, ${t}] is outside the ${N} neurons`);
        if (f === t) throw new Error(`pilotSubCircuit.topologyOf: edge ${k} is a self-loop on neuron ${f}`);
        if (seen.has(f * N + t)) throw new Error(`pilotSubCircuit.topologyOf: edge ${k} repeats the pair ${f} -> ${t}`);
        if (!(n > 0)) throw new Error(`pilotSubCircuit.topologyOf: edge ${k} has count ${n}, which is not above zero`);
        if (s !== sg[f] || s === 0) throw new Error(`pilotSubCircuit.topologyOf: edge ${k} has sign ${s} but its source cell ${f} is ${circuit.neurons[f].nt}`);
        seen.add(f * N + t); from[k] = f; to[k] = t; count[k] = n; sign[k] = s;
    });
    return { N, E, layer, sg, inputs, outputs, from, to, count, sign, top };
}

/** How many output cells the input cells reach in `steps` steps along the edges, how many input cells reach at least one, and the number of (input, output) pairs reached: { outputsReached, inputsReaching, pairs }. */
export function reachOf(circuit, steps = REC_STEPS) {
    const t = topologyOf(circuit), out = new Map(); for (let k = 0; k < t.E; k++) { if (!out.has(t.from[k])) out.set(t.from[k], []); out.get(t.from[k]).push(t.to[k]); }
    const isOut = new Set(t.outputs), reached = new Set(); let pairs = 0, inputsReaching = 0;
    for (const s of t.inputs) {
        let frontier = new Set([s]); const seen = new Set([s]);
        for (let d = 0; d < steps; d++) { const next = new Set(); for (const u of frontier) for (const v of out.get(u) || []) if (!seen.has(v)) { seen.add(v); next.add(v); } frontier = next; }
        let hit = 0; for (const v of seen) if (isOut.has(v)) { hit++; reached.add(v); }
        pairs += hit; if (hit) inputsReaching++;
    }
    return { outputsReached: reached.size, inputsReaching, pairs };
}

// ---- the four controls --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const withEdges = (circuit, edges) => ({ ...circuit, neurons: circuit.neurons, edges });
/** `edges` with the endpoints of edge k drawn by pick(k) = [from, to]; counts stay with their edge position, signs come from the new source cell; no self-loop, no repeat. */
function redraw(circuit, topo, rng, pick) {
    const used = new Set(), edges = [];
    for (let k = 0; k < topo.E; k++) {
        let f, t;
        do { [f, t] = pick(k, rng); } while (f === t || used.has(f * topo.N + t));   // the circuit's own edges are one arrangement that fits, so a free pair exists for every edge a draw can reach
        used.add(f * topo.N + t); edges.push([f, t, topo.count[k], topo.sg[f]]);
    }
    return withEdges(circuit, edges);
}
const drawFrom = (list, rng) => list[Math.floor(rng() * list.length)];
/** ER: every edge redrawn, the source among the signed cells, the target among all cells. */
export function erControl(circuit, seed) {
    const topo = topologyOf(circuit), rng = mulberry(seed), signed = topo.sg.map((s, i) => (s !== 0 ? i : -1)).filter((i) => i >= 0), all = Array.from({ length: topo.N }, (_, i) => i);
    return redraw(circuit, topo, rng, (k, r) => [drawFrom(signed, r), drawFrom(all, r)]);
}
/** LAYER: every edge keeps its source layer and its target layer; the source is a signed cell of that layer, the target any cell of that layer. */
export function layerControl(circuit, seed) {
    const topo = topologyOf(circuit), rng = mulberry(seed), byLayer = new Map(), signedByLayer = new Map();
    topo.layer.forEach((l, i) => { if (!byLayer.has(l)) byLayer.set(l, []); byLayer.get(l).push(i); if (topo.sg[i] !== 0) { if (!signedByLayer.has(l)) signedByLayer.set(l, []); signedByLayer.get(l).push(i); } });
    return redraw(circuit, topo, rng, (k, r) => [drawFrom(signedByLayer.get(topo.layer[topo.from[k]]), r), drawFrom(byLayer.get(topo.layer[topo.to[k]]), r)]);
}
/** DEGREE: pairs of edges swap their targets (Maslov-Sneppen), 20 attempts an edge, rejecting a swap that makes a self-loop or a repeat: every cell keeps its out-degree and its in-degree (the hubs), every edge its source (so its sign) and its count. */
export function degreeControl(circuit, seed) {
    const topo = topologyOf(circuit), rng = mulberry(seed), E = topo.E, N = topo.N, from = Array.from(topo.from), to = Array.from(topo.to), has = new Set(from.map((f, k) => f * N + to[k]));
    if (E >= 2) for (let attempt = 0; attempt < 20 * E; attempt++) {
        const a = Math.floor(rng() * E), b = Math.floor(rng() * E);
        if (a === b) continue;
        const f1 = from[a], t1 = to[a], f2 = from[b], t2 = to[b];
        if (f1 === t2 || f2 === t1 || has.has(f1 * N + t2) || has.has(f2 * N + t1)) continue;
        has.delete(f1 * N + t1); has.delete(f2 * N + t2); has.add(f1 * N + t2); has.add(f2 * N + t1); to[a] = t2; to[b] = t1;
    }
    return withEdges(circuit, Array.from({ length: E }, (_, k) => [from[k], to[k], topo.count[k], topo.sign[k]]));
}
/** SIGN: the transmitters of the signed cells permuted among them (Fisher-Yates); endpoints and counts as they were; each edge's sign follows its source. */
export function signControl(circuit, seed) {
    const topo = topologyOf(circuit), rng = mulberry(seed), signed = topo.sg.map((s, i) => (s !== 0 ? i : -1)).filter((i) => i >= 0), nts = signed.map((i) => circuit.neurons[i].nt);
    for (let i = nts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [nts[i], nts[j]] = [nts[j], nts[i]]; }
    const neurons = circuit.neurons.map((n) => n); signed.forEach((idx, k) => { neurons[idx] = { ...circuit.neurons[idx], nt: nts[k] }; });
    const sg = neurons.map((n) => signOfNt(n.nt));
    return { ...circuit, neurons, edges: Array.from({ length: topo.E }, (_, k) => [topo.from[k], topo.to[k], topo.count[k], sg[topo.from[k]]]) };
}
/** COUNT: the counts permuted across the edges (Fisher-Yates); endpoints and signs as they were. */
export function countControl(circuit, seed) {
    const topo = topologyOf(circuit), rng = mulberry(seed), counts = Array.from(topo.count);
    for (let i = counts.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [counts[i], counts[j]] = [counts[j], counts[i]]; }
    return withEdges(circuit, Array.from({ length: topo.E }, (_, k) => [topo.from[k], topo.to[k], counts[k], topo.sign[k]]));
}
export const CONTROLS = Object.freeze({ er: erControl, layer: layerControl, degree: degreeControl, sign: signControl, count: countControl });

// ---- the pilot ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * The whole pilot for one circuit. Returns the contract of brain/pilotSubPolicy.mjs's createSubPolicy -- { name, FEATURES, HIDDEN, OUTPUTS, REC_STEPS, REC_EDGES, WEIGHT_COUNT, zeroWeights, forward, pilotFor, handWeights,
 * perturb, mutate, evaluate, train, prune, reportLines } -- so that tools/ship/trainSubPilot.mjs's finish() takes it as `opts.policy`; `layersOf` is not offered (the GPU twin has no such network). `handWeights()` is the START:
 * the seeded input weights, the cells' bias, the recurrent magnitudes from the counts, and a ZERO readout.
 * Weight layout: [ W1: FEATURES x inputs ][ bias: N ][ recurrent magnitudes: E ][ W2: OUTPUTS x outputs ][ b2: OUTPUTS ].
 */
export function createCircuitPolicy(circuit, name = "circuit", init = INIT) {
    const topo = topologyOf(circuit), { N, E, inputs, outputs, from, to, sign, count } = topo, NI = inputs.length, NO = outputs.length;
    const OFF_B = FEATURES * NI, OFF_REC = OFF_B + N, OFF_W2 = OFF_REC + E, OFF_B2 = OFF_W2 + OUTPUTS * NO, WEIGHT_COUNT = OFF_B2 + OUTPUTS;
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
    const meanCount = E ? count.reduce((s, v) => s + v, 0) / E : 1;
    const K = AS.AUTOPILOT_SUB;
    /** The autopilot's laws on the features (the channels brain/pilotSubPolicy.mjs's handWeights writes through relu pairs). */
    const law = (x) => [0.3 * K.kTheta * x[2] - 0.2 * K.kQ * x[3], Math.PI * K.kHdg * x[4] - 0.2 * K.kR * x[5] - 0.2 * K.kBeta * x[6], x[1] + K.kSpd * x[7], 10 * K.kBalD * x[8] + 0.5 * K.kBalV * x[9]];

    function handWeights() {
        const w = zeroWeights(), rng = mulberry(init.seed);
        for (let i = 0; i < OFF_B; i++) w[i] = gauss(rng) * init.inScale;
        for (let i = 0; i < N; i++) w[OFF_B + i] = init.bias;
        for (let k = 0; k < E; k++) w[OFF_REC + k] = (init.recScale * count[k]) / meanCount;
        return w;
    }
    /** The residual's activity of the output cells: the features through the input cells, then REC_STEPS steps along the edges. */
    function activity(w, x) {
        let h = new Float64Array(N), n = new Float64Array(N);
        for (let i = 0; i < N; i++) h[i] = w[OFF_B + i];
        for (let a = 0; a < NI; a++) { let sum = 0; const row = a * FEATURES; for (let f = 0; f < FEATURES; f++) sum += w[row + f] * fin(x[f]); h[inputs[a]] += sum; }
        for (let i = 0; i < N; i++) if (!(h[i] > 0)) h[i] = 0;
        for (let step = 0; step < REC_STEPS; step++) {
            n.set(h);
            for (let k = 0; k < E; k++) n[to[k]] += sign[k] * Math.abs(w[OFF_REC + k]) * h[from[k]];
            for (let i = 0; i < N; i++) if (!(n[i] > 0)) n[i] = 0;
            const t = h; h = n; n = t;
        }
        return h;
    }
    function forward(w, x) {
        const base = law(Array.from({ length: FEATURES }, (_, f) => fin(x[f]))), h = activity(w, x), y = new Array(OUTPUTS);
        for (let o = 0; o < OUTPUTS; o++) { let sum = w[OFF_B2 + o]; const row = OFF_W2 + o * NO; for (let j = 0; j < NO; j++) sum += w[row + j] * h[outputs[j]]; y[o] = base[o] + sum; }
        return { pitch: clamp(fin(y[0]), -1, 1), yaw: clamp(fin(y[1]), -1, 1), thrust: clamp(fin(y[2]), -1, 1), ballast: clamp(fin(y[3]), -1, 1) };
    }
    const pilotFor = (w) => (state, target, current = [0, 0, 0]) => forward(w, features(state, target, current));

    function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }
    const evaluate = (w, set = T.TRAIN_SET, opts = {}) => T.evaluate(pilotFor(w), set, opts);
    function mutate(w, sigma, rng, maxK = 4) {
        const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
        for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
        return o;
    }
    /** (1+1)-ES from the start on `trainSet`: a child that scores exactly its parent replaces it, counted apart (the recipe of brain/pilotSubPolicy.mjs). */
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
    /** Put every weight that differs from `toward` (default: the start) back whenever the TRAIN score does not fall, passes repeated to a fixed point. */
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
        return [`[pilotSubCircuit] ${name} (${N} neurons, ${E} synapses) as the only path: ${FEATURES} features -> ${NI} input cells ... ${NO} output cells -> ${OUTPUTS} controls added to the autopilot's, ${WEIGHT_COUNT} weights`,
            `  the input cells reach ${reach.outputsReached} of the ${NO} output cells in ${REC_STEPS} steps (${reach.inputsReaching} of ${NI} input cells reach one; ${reach.pairs} input-output pairs)`];
    }
    return { name, FEATURES, HIDDEN: N, OUTPUTS, REC_STEPS, REC_EDGES: E, WEIGHT_COUNT, INPUT_CELLS: NI, OUTPUT_CELLS: NO, zeroWeights, forward, activity, pilotFor, handWeights, perturb, mutate, evaluate, train, prune, reportLines, reach };
}
