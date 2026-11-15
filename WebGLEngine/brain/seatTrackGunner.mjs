// WebGLEngine/brain/seatTrackGunner.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY'S TARGET-TRACKING CIRCUIT IN A CAPITAL SHIP'S GUN SEAT. The gunners that lay a gun in this tree (brain/seatTurretGunner.mjs, the race car's) run on the fly's Giant Fiber Circuit -- its ESCAPE reflex -- because that was the circuit the tree had. A male fly has a circuit whose job is keeping a small moving
// object in front of it: the eye's LC10a cells onto AOTU019 and AOTU025, and those onto the steering neuron DNa02. brain/lc10Topology.mjs is that pathway off the male-cns connectome (vendor/male-cns/lc10-tracking-circuit.json; brain/maleCnsCircuits-selfcheck.mjs pins what is in it): 275 LC10a, 2 AOTU019, 2 AOTU025,
// 2 DNa02 -- 281 neurons, 6,589 connections. Keith: "build a gunner over the tracking circuit."
//
// WHAT THIS IS: brain/seatTurretGunner.mjs's gunner with the wiring a parameter AND ANY SIZE (brain/seatTurretCircuit.mjs takes only a wiring of the escape circuit's size, because its weights sit where the car's do). The same eleven features, the same five outputs of which a seat reads three (the gun's two rates and
// the trigger), the same sight, the same hand error, the same rounds-left sense -- seatTurretGunner's own gunnerFor with this wiring's forward. Three weight-tied recurrent steps over the connections only (brain/sparseRecurrent.mjs). createGunnerCircuit(topo) is that for any wiring of 34 neurons or more;
// OVER THE GIANT FIBER CIRCUIT IT IS brain/gunnerPolicy.mjs TO THE BIT (the gate compares). Over the tracking circuit: 11,371 weights = 3,091 + 281 + 6,589 + 1,405 + 5.
//
// THE HAND WEIGHTS ARE THE CAR'S HAND RULE, MOVED: brain/gunnerPolicy.mjs's hand weights route its rule through a few of its 34 hidden units and put no weight on any synapse; handWeights() here puts those same weights on the FIRST 34 neurons of the wiring (LC10a cells, for the tracking circuit -- a place to stand, not
// a claim about them), so the untrained gunner is the car's untrained gunner to the bit (the gate flies both). That start leads the seat's hand gunner by about 0.1 on 600 pairs (tools/ship/takeTurretAudit.mjs).
//
// *** NOTHING HERE IS TRAINED, and the wiring does nothing until a search puts weight on it. A CONNECTOME IS A WIRING DIAGRAM, NOT A CONTROLLER: no LC10a cell here sees an object -- every feature may reach every neuron through a dense learned encoder -- and the transmitter predictions (AOTU019 GABA, the rest
// acetylcholine) are not used: a synapse's weight is free in sign. What the wiring is worth is a question for a search and a control (`control`, `wiringOf`). ***
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as GP from "./gunnerPolicy.mjs";
import * as ST from "./seatTurretGunner.mjs";
import * as LC10 from "./lc10Topology.mjs";
import { controlTopology } from "./pilotSubFish.mjs";
import { createCore } from "./sparseRecurrent.mjs";

export const POLICY_ID = "seatTrackGunner", CONTROL_SEED = 4242;
/** A seat-gunner library over the wiring `topo` ({ NEURON_ORDER, EDGES: [toIdx, fromIdx] }), of any size from the car's 34 neurons up: what brain/seatTurretGunner.mjs exports for the Giant Fiber Circuit, for this one. Frozen. */
export function createGunnerCircuit(topo) {
    if (!topo || !topo.NEURON_ORDER?.length || !topo.EDGES?.length) throw new Error("seatTrackGunner.createGunnerCircuit: a wiring is { NEURON_ORDER, EDGES: [toIdx, fromIdx] pairs }");
    const FEATURES = ST.FEATURES, OUTPUTS = ST.OUTPUTS, HIDDEN = topo.NEURON_ORDER.length, REC_EDGES = topo.EDGES.length, REC_STEPS = ST.REC_STEPS;
    if (HIDDEN < ST.HIDDEN) throw new Error(`seatTrackGunner.createGunnerCircuit: the car's hand rule needs ${ST.HIDDEN} neurons to stand on (the wiring has ${HIDDEN})`);
    const core = createCore(HIDDEN, topo.EDGES), O_B1 = FEATURES * HIDDEN, O_REC = O_B1 + HIDDEN, O_OUT = O_REC + REC_EDGES, O_B2 = O_OUT + HIDDEN * OUTPUTS, WEIGHT_COUNT = O_B2 + OUTPUTS, VALS = new WeakMap(), ZERO_HIDDEN = new Float32Array(HIDDEN);
    const encoderAt = (h, f) => h * FEATURES + f, hiddenBiasAt = (h) => O_B1 + h, synapseAt = (k) => O_REC + k, outputAt = (o, h) => O_OUT + o * HIDDEN + h, biasAt = (o) => O_B2 + o;
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
    /** The car's hand weights on this wiring's first 34 neurons (see the header). No synapse carries a weight. */
    function handWeights(opts) {
        const g = GP.handWeights(opts), w = zeroWeights();
        for (let h = 0; h < ST.HIDDEN; h++) { for (let f = 0; f < FEATURES; f++) w[encoderAt(h, f)] = g[ST.encoderAt(h, f)]; w[hiddenBiasAt(h)] = g[ST.hiddenBiasAt(h)]; for (let o = 0; o < OUTPUTS; o++) w[outputAt(o, h)] = g[ST.outputAt(o, h)]; }
        for (let o = 0; o < OUTPUTS; o++) w[biasAt(o)] = g[ST.biasAt(o)];
        for (let k = 0; k < ST.REC_EDGES; k++) if (g[ST.synapseAt(k)] !== 0) throw new Error("seatTrackGunner.handWeights: the car's hand weights carry a weight on a synapse, which cannot be moved to another wiring");
        return w;
    }
    function valsOf(w) { const m = VALS.get(w); if (m) { let k = 0; while (k < REC_EDGES && m.snap[k] === w[O_REC + k]) k++; if (k === REC_EDGES) return m.vals; } const snap = Float32Array.from(w.subarray(O_REC, O_OUT)), vals = core.build(snap); VALS.set(w, { snap, vals }); return vals; }
    /** The dense layers (for a comparison or a picture; forward() does not use them). */
    function layersOf(w) { const rec = { nIn: HIDDEN, nOut: HIDDEN, W: core.dense(w.subarray(O_REC, O_OUT)), b: ZERO_HIDDEN, act: "relu" }; return [{ nIn: FEATURES, nOut: HIDDEN, W: w.subarray(0, O_B1), b: w.subarray(O_B1, O_REC), act: "relu" }, ...Array(REC_STEPS).fill(rec), { nIn: HIDDEN, nOut: OUTPUTS, W: w.subarray(O_OUT, O_B2), b: w.subarray(O_B2, WEIGHT_COUNT), act: "none" }]; }
    /** features -> five numbers in [-1, 1]; a seat reads the first three. */
    function forward(w, x) {
        const vals = valsOf(w); let h = mlpLayerCpu({ nIn: FEATURES, nOut: HIDDEN, W: w.subarray(0, O_B1), b: w.subarray(O_B1, O_REC), act: "relu" }, Float32Array.from(x), 1);
        for (let s = 0; s < REC_STEPS; s++) h = core.step(vals, h);
        return ST.post(mlpLayerCpu({ nIn: HIDDEN, nOut: OUTPUTS, W: w.subarray(O_OUT, O_B2), b: w.subarray(O_B2, WEIGHT_COUNT), act: "none" }, h, 1));
    }
    const gunnerFor = (w, sight, opts = {}) => ST.gunnerFor(w, sight, { ...opts, forward, layersOf, post: ST.post });
    const gunnerFactory = (w, makeSight, opts = {}) => (seat, k) => gunnerFor(w, makeSight(seat, k), { ...opts, seed: (opts.seed ?? 1) + k });
    const synapsesUsed = (w) => { let n = 0; for (let k = 0; k < REC_EDGES; k++) if (w[O_REC + k] !== 0) n++; return n; };
    return Object.freeze({ FEATURES, HIDDEN, OUTPUTS, REC_STEPS, REC_EDGES, WEIGHT_COUNT, FEATURE_NAMES: ST.FEATURE_NAMES, OUTPUT_NAMES: ST.OUTPUT_NAMES, READ_OUTPUTS: ST.READ_OUTPUTS, LIVE_FEATURES: ST.LIVE_FEATURES, LIVE_FEATURES_RATIONED: ST.LIVE_FEATURES_RATIONED, topology: topo, edges: topo.EDGES,
        zeroWeights, handWeights, layersOf, forward, post: ST.post, gunnerFor, gunnerFactory, encoderAt, hiddenBiasAt, synapseAt, outputAt, biasAt, synapsesUsed });
}

const TRACK = createGunnerCircuit(LC10);
export const FEATURES = TRACK.FEATURES, HIDDEN = TRACK.HIDDEN, OUTPUTS = TRACK.OUTPUTS, REC_STEPS = TRACK.REC_STEPS, REC_EDGES = TRACK.REC_EDGES, WEIGHT_COUNT = TRACK.WEIGHT_COUNT;   // 11 x 281 + 281 + 6,589 + 281 x 5 + 5 = 11,371
export const FEATURE_NAMES = TRACK.FEATURE_NAMES, OUTPUT_NAMES = TRACK.OUTPUT_NAMES, READ_OUTPUTS = TRACK.READ_OUTPUTS, LIVE_FEATURES = TRACK.LIVE_FEATURES, LIVE_FEATURES_RATIONED = TRACK.LIVE_FEATURES_RATIONED;
export const zeroWeights = TRACK.zeroWeights, handWeights = TRACK.handWeights, layersOf = TRACK.layersOf, forward = TRACK.forward, post = TRACK.post, gunnerFor = TRACK.gunnerFor, gunnerFactory = TRACK.gunnerFactory;
export const encoderAt = TRACK.encoderAt, hiddenBiasAt = TRACK.hiddenBiasAt, synapseAt = TRACK.synapseAt, outputAt = TRACK.outputAt, biasAt = TRACK.biasAt, synapsesUsed = TRACK.synapsesUsed, topology = LC10, edges = LC10.EDGES;
/** The control: the same library over a random circuit of the tracking circuit's size (281 neurons, 6,589 edges, drawn uniformly from seed 4242). One draw. */
export const control = createGunnerCircuit(controlTopology(LC10, CONTROL_SEED));
const CONTROLS = new Map([[CONTROL_SEED, control]]);
/** The library for a wiring NAME: "fly" (the tracking circuit) or "control:<seed>". */
export function wiringOf(name = "fly") {
    if (name === "fly") return TRACK;
    const m = /^control:(\d+)$/.exec(String(name)); if (!m) throw new Error(`seatTrackGunner.wiringOf: a wiring is "fly" or "control:<seed>" (got ${name})`);
    const seed = Number(m[1]); if (!CONTROLS.has(seed)) CONTROLS.set(seed, createGunnerCircuit(controlTopology(LC10, seed)));
    return CONTROLS.get(seed);
}
/** The neurons by type, as indices into the hidden layer: { LC10a: [...275], AOTU019: [...], AOTU025: [...], DNa02: [...] }. */
export const NEURONS = Object.freeze(Object.fromEntries([...new Set(LC10.NEURON_TYPES)].map((t) => [t, Object.freeze(LC10.NEURON_TYPES.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0))])));

export function reportLines() {
    return ["[seatTrackGunner] the fly's target-tracking circuit in a capital ship's gun seat: LC10a, AOTU019, AOTU025 and DNa02 as the recurrent core of the turret seat's gunner (it lays the gun itself)",
        `  ${FEATURES} features, ${HIDDEN} neurons (${Object.entries(NEURONS).map(([t, v]) => `${v.length} ${t}`).join(", ")}), ${REC_EDGES} synapses, ${OUTPUTS} outputs: ${WEIGHT_COUNT} weights; the hand weights are the race car's hand rule on the first ${ST.HIDDEN} neurons and no synapse; nothing is trained`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
