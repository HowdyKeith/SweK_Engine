// WebGLEngine/brain/pilotSubCircuitState.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is brain/pilotSubCircuitState-selfcheck.mjs)
//
// A SUBMARINE PILOT WITH MEMORY WHOSE ONLY MEMORY IS A CIRCUIT'S WIRING: the rung 4a pilot of brain/SUBMARINE_WIP.md ("the fly central complex as a stateful heading pilot"), registered before it was built. brain/pilotSubCircuit.mjs gives a pilot whose only path from
// sensors to controls is a wiring, but its recurrence lives inside one control tick; this one carries the cells' ACTIVITY FROM TICK TO TICK, so a stretch of lost compass can be bridged by whatever the wiring remembers.
//
//   output  =  the PD autopilot's laws (brain/autopilotSub.mjs, on the same 14 features)  +  a RESIDUAL read from the output cells, all four clamped to [-1, 1]; the residual starts at zero, so the pilot STARTS AS THE AUTOPILOT, exactly
//   state   one activity per cell, carried from tick to tick and reset at the start of every dive (the target object changing, as tools/subDisturb.mjs detects a new dive); one update a tick:
//              h' = relu( b + W_in x (on the input cells) + sigma x M h )
//           M is the circuit's SIGNED COUNT MATRIX (Dale's law: an edge's sign is its source cell's; its magnitude the synapse count) scaled so that its largest singular value is exactly 1, so the recurrent map never expands for sigma <= 1; sigma is ONE trained
//           scalar (start 0.95, clamped to [0, 1]). THE RECURRENT WEIGHTS ARE FIXED: a graph this dense (the fly's heading loop: 7,080 edges among 148 cells) has more recurrent weights than a 400-child search can touch, so training moves only the input weights, the
//           cells' bias, sigma, the readout and its bias. That makes the pilot a RESERVOIR, and the question it asks is whether the real wiring is a better reservoir than other wirings of the same parts.
//   input   the 14 features of the other pilots and a 15th, `compassValid` (1 or 0, the 4th argument tools/subDropout.mjs hands the pilot; 1 when it is not given).
//   weights [ W_in: 15 x inputs ][ bias: N ][ sigma: 1 ][ W_out: 4 x outputs ][ b_out: 4 ] (for the fly's heading loop 15 x 88 + 148 + 1 + 4 x 64 + 4 = 1,729)
//   NO STATE is the same pilot with the state zeroed before every update: no recurrence at all. It is the control that says what the memory buys, whatever the wiring.
// The circuit is { neurons: [{ nt, layer, ... }], edges: [[from, to, n, sign]], io: { inputs, outputs } } (tools/flyCx.mjs writes it); the controls of brain/pilotSubCircuit.mjs apply to it unchanged (the cell type is its `layer`) and keep `io`.
// WHAT THIS IS NOT: a model of the fly's compass. A trained readout may find a route that the fly does not use, and with sigma below 1 the memory is a leak, not an integral. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as AS from "./autopilotSub.mjs";
import * as T from "./subTask.mjs";
import { FEATURES as BASE_FEATURES, OUTPUTS, features, mulberry } from "./pilotSubPolicy.mjs";

export const FEATURES = BASE_FEATURES + 1;
export { OUTPUTS };
/** The start of everything that is not the circuit (the same for every circuit, so that circuits are compared from one start). */
export const STATE_INIT = Object.freeze({ seed: 4711, inScale: 0.2, inputGain: 1, sigma0: 0.95, bias: 0 });
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fin = (v) => (Number.isFinite(v) ? v : 0);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/** The circuit as arrays, refusing what cannot be one: { N, E, from, to, mag (the count), sign, inputs, outputs }. */
export function reservoirOf(circuit) {
    if (!circuit || !Array.isArray(circuit.neurons) || !Array.isArray(circuit.edges) || !circuit.io) throw new Error("pilotSubCircuitState.reservoirOf: a circuit is { neurons, edges, io: { inputs, outputs } }");
    const N = circuit.neurons.length, E = circuit.edges.length, inRange = (a) => Array.isArray(a) && a.length > 0 && new Set(a).size === a.length && a.every((i) => Number.isInteger(i) && i >= 0 && i < N);
    if (N < 2) throw new Error(`pilotSubCircuitState.reservoirOf: ${N} neurons are not a circuit`);
    if (!inRange(circuit.io.inputs)) throw new Error("pilotSubCircuitState.reservoirOf: io.inputs must be a non-empty list of distinct cell indices");
    if (!inRange(circuit.io.outputs)) throw new Error("pilotSubCircuitState.reservoirOf: io.outputs must be a non-empty list of distinct cell indices");
    const sg = circuit.neurons.map((n) => (n.nt === "Exc" ? 1 : n.nt === "Inh" ? -1 : 0)), seen = new Set(), from = new Int32Array(E), to = new Int32Array(E), mag = new Float64Array(E), sign = new Int8Array(E);
    circuit.edges.forEach((e, k) => {
        const [f, t, n, s] = e;
        if (!(Number.isInteger(f) && f >= 0 && f < N && Number.isInteger(t) && t >= 0 && t < N)) throw new Error(`pilotSubCircuitState.reservoirOf: edge ${k} [${f}, ${t}] is outside the ${N} neurons`);
        if (f === t) throw new Error(`pilotSubCircuitState.reservoirOf: edge ${k} is a self-loop on neuron ${f}`);
        if (seen.has(f * N + t)) throw new Error(`pilotSubCircuitState.reservoirOf: edge ${k} repeats the pair ${f} -> ${t}`);
        if (!(n > 0)) throw new Error(`pilotSubCircuitState.reservoirOf: edge ${k} has count ${n}, which is not above zero`);
        if (s !== sg[f] || s === 0) throw new Error(`pilotSubCircuitState.reservoirOf: edge ${k} has sign ${s} but its source cell ${f} is ${circuit.neurons[f].nt}`);
        seen.add(f * N + t); from[k] = f; to[k] = t; mag[k] = n; sign[k] = s;
    });
    return { N, E, from, to, mag, sign, inputs: Array.from(circuit.io.inputs), outputs: Array.from(circuit.io.outputs) };
}

/** The largest singular value of the signed count matrix (power iteration on M^T M from a seeded start, 1000 steps at most, stopping when it settles to 1e-13); 0 for a circuit with no edges (the first product is zero). */
export function largestSingularValue(res) {
    const rng = mulberry(20260101), N = res.N; let v = Float64Array.from({ length: N }, () => 0.5 + rng()), lam = 0;
    const norm = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    let n0 = norm(v); v = v.map((x) => x / n0);
    for (let it = 0; it < 1000; it++) {
        const mv = new Float64Array(N); for (let k = 0; k < res.E; k++) mv[res.to[k]] += res.sign[k] * res.mag[k] * v[res.from[k]];
        const w = new Float64Array(N); for (let k = 0; k < res.E; k++) w[res.from[k]] += res.sign[k] * res.mag[k] * mv[res.to[k]];
        const nw = norm(w); if (nw === 0) return 0;
        const next = Math.sqrt(nw);
        v = w.map((x) => x / nw);
        if (Math.abs(next - lam) <= 1e-13 * Math.max(1, next)) { lam = next; break; }
        lam = next;
    }
    return lam;
}

/**
 * The whole pilot for one circuit. `opts`: { persist (default true; false is NO STATE), wrap (a function that wraps a pilot before it is flown, for the task -- tools/subDropout.mjs's dropout(pilot, ...) -- applied inside evaluate(), so that train(), prune() and finish()
 * of tools/ship/trainSubPilot.mjs all fly the task) }. Returns the contract of brain/pilotSubPolicy.mjs's createSubPolicy -- { name, FEATURES, HIDDEN, OUTPUTS, WEIGHT_COUNT, zeroWeights, pilotFor, handWeights, perturb, mutate, evaluate, train, prune, reportLines } -- so that
 * finish() takes it as `opts.policy`; `forward` is not offered (the pilot has state: use `step`).
 */
export function createStatePolicy(circuit, name = "circuit", opts = {}, init = STATE_INIT) {
    const persist = opts.persist !== false, wrap = opts.wrap || ((p) => p), res = reservoirOf(circuit), { N, E, from, to, inputs, outputs } = res, NI = inputs.length, NO = outputs.length;
    const OFF_B = FEATURES * NI, OFF_SIGMA = OFF_B + N, OFF_W2 = OFF_SIGMA + 1, OFF_B2 = OFF_W2 + OUTPUTS * NO, WEIGHT_COUNT = OFF_B2 + OUTPUTS, sigmaMax = largestSingularValue(res);
    const gain = Float64Array.from(res.mag, (m, k) => (sigmaMax > 0 ? (res.sign[k] * m) / sigmaMax : 0));   // the signed matrix with its largest singular value at 1
    // the edges grouped by SOURCE cell, so that a cell that is silent costs nothing: outStart[j]..outStart[j + 1] index the targets and the gains of the edges that leave cell j
    const outStart = new Int32Array(N + 1); for (let k = 0; k < E; k++) outStart[from[k] + 1]++;
    for (let j = 0; j < N; j++) outStart[j + 1] += outStart[j];
    const outTo = new Int32Array(E), outGain = new Float64Array(E), fill = outStart.slice(0, N);
    for (let k = 0; k < E; k++) { const at = fill[from[k]]++; outTo[at] = to[k]; outGain[at] = gain[k]; }
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT), K = AS.AUTOPILOT_SUB;
    const law = (x) => [0.3 * K.kTheta * x[2] - 0.2 * K.kQ * x[3], Math.PI * K.kHdg * x[4] - 0.2 * K.kR * x[5] - 0.2 * K.kBeta * x[6], x[1] + K.kSpd * x[7], 10 * K.kBalD * x[8] + 0.5 * K.kBalV * x[9]];

    function handWeights() {
        const w = zeroWeights(), rng = mulberry(init.seed);
        for (let i = 0; i < OFF_B; i++) w[i] = gauss(rng) * init.inScale;
        for (let i = 0; i < N; i++) w[OFF_B + i] = init.bias;
        w[OFF_SIGMA] = init.sigma0;
        return w;
    }
    /** One tick, in place: writes the new activity of every cell into `h` from the last one `hPrev` (not touched) and the 15 features. */
    function updateInto(w, x, hPrev, h) {
        const sigma = clamp(fin(w[OFF_SIGMA]), 0, 1);
        for (let i = 0; i < N; i++) h[i] = w[OFF_B + i];
        if (persist) for (let j = 0; j < N; j++) { const hj = hPrev[j]; if (hj > 0) { const sh = sigma * hj; for (let q = outStart[j]; q < outStart[j + 1]; q++) h[outTo[q]] += outGain[q] * sh; } }
        for (let a = 0; a < NI; a++) { let sum = 0; const row = a * FEATURES; for (let f = 0; f < FEATURES; f++) sum += w[row + f] * fin(x[f]); h[inputs[a]] += init.inputGain * sum; }
        for (let i = 0; i < N; i++) if (!(h[i] > 0)) h[i] = 0;
        return h;
    }
    /** One tick: the new activity of every cell from the last one and the 15 features (a new array). */
    const update = (w, x, hPrev) => updateInto(w, x, hPrev, new Float64Array(N));
    /** One tick of the whole pilot: { controls, h } (the readout of the new activity added to the autopilot's laws). */
    function readout(w, x, h) {
        const base = law(Array.from({ length: BASE_FEATURES }, (_, f) => fin(x[f]))), y = new Array(OUTPUTS);
        for (let o = 0; o < OUTPUTS; o++) { let sum = w[OFF_B2 + o]; const row = OFF_W2 + o * NO; for (let j = 0; j < NO; j++) sum += w[row + j] * h[outputs[j]]; y[o] = base[o] + sum; }
        return { pitch: clamp(fin(y[0]), -1, 1), yaw: clamp(fin(y[1]), -1, 1), thrust: clamp(fin(y[2]), -1, 1), ballast: clamp(fin(y[3]), -1, 1) };
    }
    const step = (w, x, hPrev) => { const h = update(w, x, hPrev); return { controls: readout(w, x, h), h }; };
    /** A pilot (state, target, current, aux) -> controls from weights; its activity is reset whenever the target object changes. */
    const pilotFor = (w) => {
        let target = null, h = new Float64Array(N), spare = new Float64Array(N);
        return (state, tgt, current = [0, 0, 0], aux = null) => {
            if (tgt !== target) { target = tgt; h.fill(0); }
            const x = [...features(state, tgt, current), aux && aux.compassValid === 0 ? 0 : 1];
            updateInto(w, x, h, spare);
            const t = h; h = spare; spare = t;   // the new activity becomes the last one; the old array is reused for the next tick
            return readout(w, x, h);
        };
    };
    function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; o[OFF_SIGMA] = clamp(o[OFF_SIGMA], 0, 1); return o; }
    const evaluate = (w, set = T.TRAIN_SET, o = {}) => T.evaluate(wrap(pilotFor(w)), set, o);
    function mutate(w, sigma, rng, maxK = 4) {
        const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK);
        for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma;
        o[OFF_SIGMA] = clamp(o[OFF_SIGMA], 0, 1);
        return o;
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
    function reportLines() {
        return [`[pilotSubCircuitState] ${name} (${N} cells, ${E} synapses, largest singular value ${sigmaMax.toFixed(3)} scaled to 1) as a ${persist ? "stateful" : "NO-STATE"} reservoir: ${FEATURES} features -> ${NI} input cells ... ${NO} output cells -> ${OUTPUTS} controls added to the autopilot's, ${WEIGHT_COUNT} trained weights`];
    }
    return { name, FEATURES, HIDDEN: N, OUTPUTS, WEIGHT_COUNT, INPUT_CELLS: NI, OUTPUT_CELLS: NO, REC_EDGES: E, SIGMA_INDEX: OFF_SIGMA, sigmaMax, persist, zeroWeights, step, update, pilotFor, handWeights, perturb, mutate, evaluate, train, prune, reportLines };
}
