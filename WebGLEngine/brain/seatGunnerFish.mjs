// WebGLEngine/brain/seatGunnerFish.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FISH IN A GUN SEAT, AND THE CONTROL THAT SAYS WHAT THE WIRING DID: brain/seatGunnerPolicy.mjs's gunner (the hand gunner's sight, a network for the hand: a correction to the aim and the trigger) with the larval zebrafish's circuit where the fruit fly's escape circuit was. The fruit fly and the GPU Brain have had a
// seat since brain/seatGunnerPolicy.mjs and brain/seatGunnerMlp.mjs; the fish piloted only the submarine (brain/pilotSubFish.mjs). This is its seat, with the same contract -- features(), forward(), layersOf(), post(), handWeights(), zeroWeights(), liveIndices(), mutate(), perturb(), rngFor(), gunnerFor(), gunnerFactory() --
// so the arena, the fights, the trainer (tools/ship/trainSeatGunner.mjs's train(), prune() and run()) and brain/seatGunnerGpu.mjs's batch take it as they take the other two.
//
//   FISH     the 34-neuron, 153-synapse core of the Fish1 larval-zebrafish connectome's TEN analysis set (brain/zebrafishTopology.mjs; vendor/zebrafish/PROVENANCE.md says where it came from and what it is: mostly inputs to the dorsal motor nucleus of the vagus, the densest real wiring in a package that was open,
//            NOT a circuit anybody has shown aims anything). The twelve features and the three outputs are the fruit fly's (imported, not restated): 12 x 34 + 34 + 153 + 34 x 3 + 3 = 700 weights.
//   CONTROL  (`control`, the same library over another wiring) a RANDOM circuit of the fish's size, 34 neurons and 153 edges drawn uniformly from seed 4242 -- brain/pilotSubFish.mjs's controlTopology, the same draw the submarine's control uses. One draw: a difference from it is a hint and not a measurement.
//
// WHAT A CIRCUIT DOES HERE is set WHICH recurrent weights may exist: the twelve features through an encoder into the circuit's neurons, three weight-tied recurrent steps over its synapses (every other recurrent weight structurally zero, the identity added), out to three numbers. createSeatCircuit(topo) is that for any
// wiring of the baked shape ({ NEURON_ORDER, EDGES: [toIdx, fromIdx] }); the arithmetic is seatGunnerPolicy's own, layer by layer (the gate runs the fruit fly's wiring through this file and compares it with that file to the bit).
//
// *** THE HAND WEIGHTS ARE THE HAND GUNNER, as the fruit fly's: the 'aimed' feature through hidden unit 0 into the trigger (+4, -2), no correction, the recurrent core zero -- three non-zero weights, and a seat given them does what a seat given the hand gunner does, to the bit. NOTHING HERE IS TRAINED: a result
// would say what a fish-shaped recurrent core costs or buys over the hand gunner in a seat -- not that a fish can lay a gun. *** Pure: no I/O, no clock, no Math.random.
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as SG from "./seatGunnerPolicy.mjs";
import * as ZF from "./zebrafishTopology.mjs";
import { controlTopology } from "./pilotSubFish.mjs";

const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

/**
 * A seat-gunner library over the wiring `topo` ({ NEURON_ORDER, EDGES }): everything brain/seatGunnerPolicy.mjs exports for the fruit fly's, for this one. Frozen.
 */
export function createSeatCircuit(topo) {
    if (!topo || !topo.NEURON_ORDER?.length || !topo.EDGES?.length) throw new Error("seatGunnerFish.createSeatCircuit: a wiring is { NEURON_ORDER, EDGES: [toIdx, fromIdx] pairs }");
    const FEATURES = SG.FEATURES, OUTPUTS = SG.OUTPUTS, HIDDEN = topo.NEURON_ORDER.length, REC_STEPS = SG.REC_STEPS, REC_EDGES = topo.EDGES.length;
    for (const [to, from] of topo.EDGES) if (!Number.isInteger(to) || !Number.isInteger(from) || to < 0 || from < 0 || to >= HIDDEN || from >= HIDDEN) throw new Error(`seatGunnerFish.createSeatCircuit: an edge names a neuron the wiring does not have ([${to}, ${from}] of ${HIDDEN})`);
    const REC_OFFSET = FEATURES * HIDDEN + HIDDEN, OUT_BASE = REC_OFFSET + REC_EDGES, WEIGHT_COUNT = OUT_BASE + HIDDEN * OUTPUTS + OUTPUTS, ZERO_HIDDEN = new Float32Array(HIDDEN), MEMO = new WeakMap();
    const zeroWeights = () => new Float32Array(WEIGHT_COUNT);
    function expandRecurrent(Wrec) {
        const Wm = new Float32Array(HIDDEN * HIDDEN);
        for (let i = 0; i < HIDDEN; i++) Wm[i * HIDDEN + i] = 1;
        topo.EDGES.forEach(([toIdx, fromIdx], k) => { Wm[toIdx * HIDDEN + fromIdx] += Wrec[k]; });
        return Wm;
    }
    function layersOf(w) {
        const m = MEMO.get(w);
        if (m) { let k = 0; while (k < REC_EDGES && m.snap[k] === w[REC_OFFSET + k]) k++; if (k === REC_EDGES) return m.layers; }
        let o = 0;
        const W1 = w.subarray(o, o += FEATURES * HIDDEN), b1 = w.subarray(o, o += HIDDEN), Wrec = w.subarray(o, o += REC_EDGES), W2 = w.subarray(o, o += HIDDEN * OUTPUTS), b2 = w.subarray(o, o += OUTPUTS);
        const rec = { nIn: HIDDEN, nOut: HIDDEN, W: expandRecurrent(Wrec), b: ZERO_HIDDEN, act: "relu" };
        const layers = [{ nIn: FEATURES, nOut: HIDDEN, W: W1, b: b1, act: "relu" }, ...Array(REC_STEPS).fill(rec), { nIn: HIDDEN, nOut: OUTPUTS, W: W2, b: b2, act: "none" }];
        MEMO.set(w, { snap: Float32Array.from(w.subarray(REC_OFFSET, REC_OFFSET + REC_EDGES)), layers });
        return layers;
    }
    /** features -> three numbers in [-1, 1]: the yaw correction, the pitch correction, the trigger. */
    function forward(w, x) {
        const layers = layersOf(w);
        let h = Float32Array.from(x);
        for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
        return SG.post(mlpLayerCpu(layers[layers.length - 1], h, 1));
    }
    /** The hand gunner in this network's weights: no correction, the trigger the sight's own flag (+4 on `aimed`, -2 bias, through hidden unit 0). */
    function handWeights() {
        const w = zeroWeights(), AIMED = SG.FEATURE_NAMES.indexOf("aimed");
        w[0 * FEATURES + AIMED] = 1; w[OUT_BASE + 2 * HIDDEN + 0] = 4; w[OUT_BASE + HIDDEN * OUTPUTS + 2] = -2;
        return w;
    }
    /** The weights wired into the hand path (unit 0's row of the encoder, its bias, its weights into the outputs, the output biases): 12 + 1 + 3 + 3 = 19. The trainer breeds half its children from these. */
    function liveIndices() {
        const idx = [];
        for (let f = 0; f < FEATURES; f++) idx.push(f);
        idx.push(FEATURES * HIDDEN);
        for (let o = 0; o < OUTPUTS; o++) idx.push(OUT_BASE + o * HIDDEN);
        for (let o = 0; o < OUTPUTS; o++) idx.push(OUT_BASE + HIDDEN * OUTPUTS + o);
        return idx;
    }
    function mutate(w, sigma, rng, maxK = 4) { const o = Float32Array.from(w), k = 1 + Math.floor(rng() * maxK); for (let j = 0; j < k; j++) o[Math.floor(rng() * o.length)] += gauss(rng) * sigma; return o; }
    function perturb(w, sigma, rng) { const o = Float32Array.from(w); for (let i = 0; i < o.length; i++) o[i] += gauss(rng) * sigma; return o; }
    const gunnerFor = (w, sight, opts = {}) => SG.gunnerFor(w, sight, { ...opts, forward, layersOf, post: SG.post });
    const gunnerFactory = (w, makeSight, opts = {}) => (seat, k) => gunnerFor(w, makeSight(seat, k), opts);
    return Object.freeze({ FEATURES, HIDDEN, OUTPUTS, REC_STEPS, REC_EDGES, WEIGHT_COUNT, FEATURE_NAMES: SG.FEATURE_NAMES, OUTPUT_NAMES: SG.OUTPUT_NAMES, AIM_GAIN: SG.AIM_GAIN, topology: topo, features: SG.features, post: SG.post, zeroWeights, layersOf, forward, handWeights, liveIndices, mutate, perturb, rngFor: mulberry, gunnerFor, gunnerFactory });
}

const FISH = createSeatCircuit(ZF);
export const FEATURES = FISH.FEATURES, HIDDEN = FISH.HIDDEN, OUTPUTS = FISH.OUTPUTS, REC_STEPS = FISH.REC_STEPS, REC_EDGES = FISH.REC_EDGES, WEIGHT_COUNT = FISH.WEIGHT_COUNT;   // 408 + 34 + 153 + 102 + 3 = 700
export const FEATURE_NAMES = FISH.FEATURE_NAMES, OUTPUT_NAMES = FISH.OUTPUT_NAMES, AIM_GAIN = FISH.AIM_GAIN;
export const features = FISH.features, post = FISH.post, zeroWeights = FISH.zeroWeights, layersOf = FISH.layersOf, forward = FISH.forward, handWeights = FISH.handWeights, liveIndices = FISH.liveIndices, mutate = FISH.mutate, perturb = FISH.perturb, rngFor = FISH.rngFor, gunnerFor = FISH.gunnerFor, gunnerFactory = FISH.gunnerFactory;
export const CONTROL_SEED = 4242;
/** The control: the same library over a random circuit of the fish's size (see the header). */
export const control = createSeatCircuit(controlTopology(ZF, CONTROL_SEED));

export function reportLines() {
    const nz = Array.from(handWeights()).filter((v) => v !== 0).length;
    return ["[seatGunnerFish] the fish in a gun seat: the hand gunner's sight, and the larval zebrafish's circuit for the hand (a correction to the aim and the trigger); and a random circuit of its size as the control",
        `  ${FEATURES} features, ${HIDDEN} hidden neurons (the Fish1 TEN core, ${REC_EDGES} synapses), ${OUTPUTS} outputs: ${WEIGHT_COUNT} weights; the hand weights are the hand gunner through the network in ${nz} non-zero weights; nothing is trained`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
