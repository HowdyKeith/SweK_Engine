// WebGLEngine/brain/helmSteerPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY'S OWN STEERING CIRCUIT AT A CAPITAL SHIP'S HELM. brain/helmPolicy.mjs put a network behind the rule that turns the hull -- and the network it put there is the Giant Fiber Circuit, the fly's ESCAPE reflex, because that was the circuit the tree had. Keith asked whether we are missing fly brain parts. For a helm, yes:
// the fly has a circuit whose job IS steering. The central complex holds the heading (the E-PG compass, brain/epgTopology.mjs) and compares it with a goal; its output cells PFL3 and PFL2 carry the difference to the descending neurons DNa02 and DNa03, which turn the fly. THAT OUTPUT STAGE is brain/pflTopology.mjs:
// 12 PFL2, 24 PFL3, 2 DNa02 and 2 DNa03 -- 40 neurons and the 523 connections among them, read off the male-cns v1.0 connectome (vendor/male-cns/cx-steering-circuit.json; PROVENANCE.md says how, and that the route was checked against the two circuits already here). What the wiring shows, pinned in the gate: all 24 PFL3
// cells reach a DNa02, and every one of those connections joins a PFL3 to the DNa02 whose cell body is on the OTHER side (by the dataset's `somaSide`; by the protocerebral-bridge side written in each PFL3's instance name it is 20 of the 24 -- the two labels are not the same thing, and the count is said for each); every PFL2
// reaches both DNa03; and DNa03 drives DNa02 (552 of the 559 synapses between the two types run that way).
//
// WHAT THIS IS: helmPolicy's helm with the wiring a parameter. The same twelve features (the 6DOF pilot's: the pointing error to the enemy, the spin, the range, the closing speed), the same five outputs read the same way (torque corrections about x, y and z, a throttle correction, one unused), the same limits (half the
// hull's torque limit, 0.3 of the pods' thrust), the same contract (helmFor, helmFactory), three weight-tied recurrent steps over the circuit's connections with every other recurrent weight structurally zero. createHelmCircuit(topo) is that for any wiring; OVER THE GIANT FIBER CIRCUIT IT IS brain/helmPolicy.mjs TO THE BIT
// (the gate compares), so what differs between this helm and that one is the wiring and its size: 40 neurons and 523 synapses against 34 and 313, 1,248 weights against 930.
//
// *** THE ZERO WEIGHTS ARE THE RULE, as helmPolicy's: every output is a correction and tanh(0) corrects nothing. NOTHING HERE IS TRAINED. A CONNECTOME IS A WIRING DIAGRAM, NOT A CONTROLLER: the neurons here are the fly's, but which feature reaches which neuron and which neuron drives which output is a dense learned
// encoder and decoder with no biological claim (no real PFL3 has a synapse that means "pointing error about z"), exactly as in every other circuit of this tree. Whether this wiring helps a helm is a question for a search and a control (`control`, a random circuit of its size), not for this file. ***
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as HP from "./helmPolicy.mjs";
import * as PFL from "./pflTopology.mjs";
import { controlTopology } from "./pilotSubFish.mjs";
import { createCore } from "./sparseRecurrent.mjs";

export const POLICY_ID = "helmSteerPolicy", CONTROL_SEED = 4242;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/**
 * A helm library over the wiring `topo` ({ NEURON_ORDER, EDGES: [toIdx, fromIdx] }): what brain/helmPolicy.mjs exports for the Giant Fiber Circuit, for this one. Frozen. `sparse: true` takes the recurrent steps over the connections only (brain/sparseRecurrent.mjs: the same float32 values, for a circuit
 * of hundreds of neurons); layersOf() is the dense layers either way.
 */
export function createHelmCircuit(topo, { sparse = false } = {}) {
    if (!topo || !topo.NEURON_ORDER?.length || !topo.EDGES?.length) throw new Error("helmSteerPolicy.createHelmCircuit: a wiring is { NEURON_ORDER, EDGES: [toIdx, fromIdx] pairs }");
    const FEATURES = HP.FEATURES, OUTPUTS = HP.OUTPUTS, HIDDEN = topo.NEURON_ORDER.length, REC_STEPS = HP.REC_STEPS, REC_EDGES = topo.EDGES.length;
    for (const [to, from] of topo.EDGES) if (!Number.isInteger(to) || !Number.isInteger(from) || to < 0 || from < 0 || to >= HIDDEN || from >= HIDDEN) throw new Error(`helmSteerPolicy.createHelmCircuit: an edge names a neuron the wiring does not have ([${to}, ${from}] of ${HIDDEN})`);
    const REC_OFFSET = FEATURES * HIDDEN + HIDDEN, OUT_BASE = REC_OFFSET + REC_EDGES, WEIGHT_COUNT = OUT_BASE + HIDDEN * OUTPUTS + OUTPUTS, ZERO_HIDDEN = new Float32Array(HIDDEN), MEMO = new WeakMap();
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT), core = sparse ? createCore(HIDDEN, topo.EDGES) : null, VALS = new WeakMap(), OUT_B = OUT_BASE + HIDDEN * OUTPUTS;
    function valsOf(w) { const m = VALS.get(w); if (m) { let k = 0; while (k < REC_EDGES && m.snap[k] === w[REC_OFFSET + k]) k++; if (k === REC_EDGES) return m.vals; } const snap = Float32Array.from(w.subarray(REC_OFFSET, REC_OFFSET + REC_EDGES)), vals = core.build(snap); VALS.set(w, { snap, vals }); return vals; }
    function layersOf(w) {
        const m = MEMO.get(w);
        if (m) { let k = 0; while (k < REC_EDGES && m.snap[k] === w[REC_OFFSET + k]) k++; if (k === REC_EDGES) return m.layers; }
        let o = 0;
        const W1 = w.subarray(o, o += FEATURES * HIDDEN), b1 = w.subarray(o, o += HIDDEN), Wrec = w.subarray(o, o += REC_EDGES), W2 = w.subarray(o, o += HIDDEN * OUTPUTS), b2 = w.subarray(o, o += OUTPUTS), Wm = new Float32Array(HIDDEN * HIDDEN);
        for (let i = 0; i < HIDDEN; i++) Wm[i * HIDDEN + i] = 1;
        topo.EDGES.forEach(([toIdx, fromIdx], k) => { Wm[toIdx * HIDDEN + fromIdx] += Wrec[k]; });
        const rec = { nIn: HIDDEN, nOut: HIDDEN, W: Wm, b: ZERO_HIDDEN, act: "relu" }, layers = [{ nIn: FEATURES, nOut: HIDDEN, W: W1, b: b1, act: "relu" }, ...Array(REC_STEPS).fill(rec), { nIn: HIDDEN, nOut: OUTPUTS, W: W2, b: b2, act: "none" }];
        MEMO.set(w, { snap: Float32Array.from(w.subarray(REC_OFFSET, REC_OFFSET + REC_EDGES)), layers });
        return layers;
    }
    /** features -> five numbers in [-1, 1]: the torque corrections about x, y and z, the throttle correction, and one that a helm does not read. */
    function forward(w, x) {
        let h, y;
        if (core) {
            const vals = valsOf(w); h = mlpLayerCpu({ nIn: FEATURES, nOut: HIDDEN, W: w.subarray(0, FEATURES * HIDDEN), b: w.subarray(FEATURES * HIDDEN, REC_OFFSET), act: "relu" }, Float32Array.from(x), 1);
            for (let s = 0; s < REC_STEPS; s++) h = core.step(vals, h);
            y = mlpLayerCpu({ nIn: HIDDEN, nOut: OUTPUTS, W: w.subarray(OUT_BASE, OUT_B), b: w.subarray(OUT_B, WEIGHT_COUNT), act: "none" }, h, 1);
        } else {
            const layers = layersOf(w); h = Float32Array.from(x);
            for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
            y = mlpLayerCpu(layers[layers.length - 1], h, 1);
        }
        return [Math.tanh(y[0]), Math.tanh(y[1]), Math.tanh(y[2]), Math.tanh(y[3]), Math.tanh(y[4])];
    }
    /** The helm for weights `w`: helm(rule, ctx) -> { torque, thrust }, brain/helmPolicy.mjs's contract and its arithmetic with this wiring's forward. With no enemy the rule's answer stands. */
    function helmFor(w) {
        function helm(rule, ctx) {
            if (!ctx.foe) { helm.last = null; return rule; }
            const x = HP.featuresOf(ctx.body, ctx.foe), y = forward(w, x), lim = ctx.ship.maxAlpha;
            helm.last = { x, y };
            return { torque: rule.torque.map((t, i) => t + HP.TORQUE_FRACTION * lim * ctx.body.I[i] * y[i]), thrust: clamp(rule.thrust + HP.THROTTLE_FRACTION * ctx.thrustMax * y[3], 0, ctx.thrustMax) };
        }
        helm.last = null;
        return helm;
    }
    const helmFactory = (w) => () => helmFor(w);
    const perturb = (w, sigma, rng) => { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; };
    /** Where a weight is: feature f into neuron h, neuron h's bias, synapse k, neuron h into output o, output o's bias. */
    const encoderAt = (h, f) => h * FEATURES + f, hiddenBiasAt = (h) => FEATURES * HIDDEN + h, synapseAt = (k) => REC_OFFSET + k, outputAt = (o, h) => OUT_BASE + o * HIDDEN + h, biasAt = (o) => OUT_BASE + HIDDEN * OUTPUTS + o;
    return Object.freeze({ FEATURES, HIDDEN, OUTPUTS, REC_STEPS, REC_EDGES, WEIGHT_COUNT, FEATURE_NAMES: HP.FEATURE_NAMES, OUTPUT_NAMES: HP.OUTPUT_NAMES, TORQUE_FRACTION: HP.TORQUE_FRACTION, THROTTLE_FRACTION: HP.THROTTLE_FRACTION, topology: topo, edges: topo.EDGES,
        zeroWeights, handWeights: zeroWeights, layersOf, forward, featuresOf: HP.featuresOf, helmFor, helmFactory, perturb, encoderAt, hiddenBiasAt, synapseAt, outputAt, biasAt });
}

const STEER = createHelmCircuit(PFL);
export const FEATURES = STEER.FEATURES, HIDDEN = STEER.HIDDEN, OUTPUTS = STEER.OUTPUTS, REC_STEPS = STEER.REC_STEPS, REC_EDGES = STEER.REC_EDGES, WEIGHT_COUNT = STEER.WEIGHT_COUNT;   // 12 x 40 + 40 + 523 + 40 x 5 + 5 = 1,248
export const FEATURE_NAMES = STEER.FEATURE_NAMES, OUTPUT_NAMES = STEER.OUTPUT_NAMES, TORQUE_FRACTION = STEER.TORQUE_FRACTION, THROTTLE_FRACTION = STEER.THROTTLE_FRACTION;
export const zeroWeights = STEER.zeroWeights, handWeights = STEER.handWeights, layersOf = STEER.layersOf, forward = STEER.forward, featuresOf = STEER.featuresOf, helmFor = STEER.helmFor, helmFactory = STEER.helmFactory, perturb = STEER.perturb;
export const encoderAt = STEER.encoderAt, hiddenBiasAt = STEER.hiddenBiasAt, synapseAt = STEER.synapseAt, outputAt = STEER.outputAt, biasAt = STEER.biasAt, topology = PFL;
/** The control: the same library over a random circuit of the steering circuit's size (40 neurons, 523 edges, drawn uniformly from seed 4242). One draw. */
export const control = createHelmCircuit(controlTopology(PFL, CONTROL_SEED));
const CONTROLS = new Map([[CONTROL_SEED, control]]);
/** The library for a wiring NAME: "fly" (the steering circuit), or "control:<seed>" (a random circuit of its size from that seed; one object a seed). What a search, a record and a pool job carry. */
export function wiringOf(name = "fly") {
    if (name === "fly") return STEER;
    const m = /^control:(\d+)$/.exec(String(name)); if (!m) throw new Error(`helmSteerPolicy.wiringOf: a wiring is "fly" or "control:<seed>" (got ${name})`);
    const seed = Number(m[1]); if (!CONTROLS.has(seed)) CONTROLS.set(seed, createHelmCircuit(controlTopology(PFL, seed)));
    return CONTROLS.get(seed);
}
/** The neurons by type, as indices into the hidden layer: { PFL2: [...], PFL3: [...], DNa02: [...], DNa03: [...] }, and the side ("L" | "R") written in each neuron's INSTANCE NAME -- for a PFL cell that is its protocerebral-bridge glomerulus's side, for a descending neuron its own; it is not the dataset's `somaSide` (vendor/male-cns/cx-steering-circuit.json has that). */
export const NEURONS = Object.freeze(Object.fromEntries([...new Set(PFL.NEURON_TYPES)].map((t) => [t, Object.freeze(PFL.NEURON_TYPES.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0))])));
export const NAME_SIDES = Object.freeze(PFL.NEURON_INSTANCES.map((s) => { const m = /_([LR])(\d|$|_)/.exec(s); return m ? m[1] : null; }));

export function reportLines() {
    const cross = PFL.EDGES.filter(([to, from]) => PFL.NEURON_TYPES[from] === "PFL3" && PFL.NEURON_TYPES[to] === "DNa02"), crossed = cross.filter(([to, from]) => NAME_SIDES[to] !== NAME_SIDES[from]).length;
    return ["[helmSteerPolicy] the fly's steering circuit at a capital ship's helm: the central complex's output cells PFL2 and PFL3 and the descending neurons DNa02 and DNa03 as the recurrent core of helmPolicy's correction to the rule",
        `  ${FEATURES} features, ${HIDDEN} neurons (${Object.entries(NEURONS).map(([t, v]) => `${v.length} ${t}`).join(", ")}), ${REC_EDGES} synapses, ${OUTPUTS} outputs: ${WEIGHT_COUNT} weights; ${crossed} of the ${cross.length} PFL3-to-DNa02 connections join a bridge side to the other side's DNa02 (all ${cross.length} by soma side); the zero weights are the rule; nothing is trained`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
