// WebGLEngine/brain/seatTurretCircuit.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE TURRET SEAT'S NETWORK OVER ANY WIRING, AND THE CONTROL THAT SAYS WHAT A WIRING DID. brain/seatTurretGunner.mjs seats brain/gunnerPolicy.mjs's network, whose recurrent core is the fruit fly's Giant Fiber Circuit and nothing else. Every result so far has had to say the same thing: "its synapse does what a
// bias would", "nothing here compares the fly's wiring with another". This is the other wiring to compare with: the same network -- eleven features, 34 hidden units, three weight-tied recurrent steps, five outputs, 896 weights in the same places -- with the 313 synapses drawn AT RANDOM instead of read off the fly.
//
//   createTurretCircuit(topo)   the seat-gunner library for a wiring ({ NEURON_ORDER, EDGES: [toIdx, fromIdx] }): forward(), layersOf(), post(), zeroWeights(), handWeights(), gunnerFor(), gunnerFactory(), `topology`, and the sizes. Its gunner is seatTurretGunner's own (the sight, the rates, the hand's error, the
//                               rounds-left sense) with this wiring's forward in it. OVER THE FLY'S WIRING IT IS brain/gunnerPolicy.mjs TO THE BIT (the gate compares), so a difference between a wiring and the fly's is the wiring and not this file's arithmetic.
//   controlOf(seed)             that library over a random circuit of the fly's size: 34 neurons and 313 edges drawn uniformly with no self-loop and no repeat (brain/pilotSubFish.mjs's controlTopology, the draw the submarine's and the fish seat's controls use). Seed 4242 unless said. ONE DRAW IS ONE DRAW: a
//                               difference from it is a hint; several seeds are a measurement.
//
// WHAT IS THE SAME FOR EVERY WIRING, and so cannot tell them apart: the hand weights (the car's: they put no weight on any synapse) and any network whose synapses are all zero -- with the core at zero the recurrent step is the identity whatever the wiring. A wiring only shows in what a SEARCH can reach through it.
// A CONTROL IS NOT A BRAIN TO SEAT: its weights mean nothing over the fly's wiring, it has no policy id, and nothing here writes a file for one. Pure: no I/O, no clock, no Math.random.
"use strict";
import { mlpLayerCpu } from "../render/brainTsl.mjs";
import * as GP from "./gunnerPolicy.mjs";
import * as ST from "./seatTurretGunner.mjs";
import * as GFC from "./gfcTopology.mjs";
import { controlTopology } from "./pilotSubFish.mjs";

export const CONTROL_SEED = 4242;
/** See the header. The wiring must have the fly's sizes (34 neurons, 313 edges): the weights then sit where seatTurretGunner's index helpers say, for every wiring. */
export function createTurretCircuit(topo) {
    if (!topo || !topo.NEURON_ORDER?.length || !topo.EDGES?.length) throw new Error("seatTurretCircuit.createTurretCircuit: a wiring is { NEURON_ORDER, EDGES: [toIdx, fromIdx] pairs }");
    const FEATURES = ST.FEATURES, OUTPUTS = ST.OUTPUTS, HIDDEN = topo.NEURON_ORDER.length, REC_EDGES = topo.EDGES.length, REC_STEPS = ST.REC_STEPS;
    if (HIDDEN !== ST.HIDDEN || REC_EDGES !== ST.REC_EDGES) throw new Error(`seatTurretCircuit.createTurretCircuit: a wiring to set beside the fly's has its sizes, ${ST.HIDDEN} neurons and ${ST.REC_EDGES} edges (got ${HIDDEN} and ${REC_EDGES})`);
    for (const [to, from] of topo.EDGES) if (!Number.isInteger(to) || !Number.isInteger(from) || to < 0 || from < 0 || to >= HIDDEN || from >= HIDDEN) throw new Error(`seatTurretCircuit.createTurretCircuit: an edge names a neuron the wiring does not have ([${to}, ${from}] of ${HIDDEN})`);
    const REC_OFFSET = FEATURES * HIDDEN + HIDDEN, ZERO_HIDDEN = new Float32Array(HIDDEN), MEMO = new WeakMap();
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
    /** features -> five numbers in [-1, 1] (a seat reads the first three). The dense layers: brain/gunnerPolicy.mjs walks only the nonzero entries of the recurrent step and says why that is the same float32 values. */
    function forward(w, x) {
        const layers = layersOf(w); let h = Float32Array.from(x);
        for (let i = 0; i < layers.length - 1; i++) h = mlpLayerCpu(layers[i], h, 1);
        return ST.post(mlpLayerCpu(layers[layers.length - 1], h, 1));
    }
    const gunnerFor = (w, sight, opts = {}) => ST.gunnerFor(w, sight, { ...opts, forward, layersOf, post: ST.post });
    const gunnerFactory = (w, makeSight, opts = {}) => (seat, k) => gunnerFor(w, makeSight(seat, k), { ...opts, seed: (opts.seed ?? 1) + k });
    return Object.freeze({ FEATURES, HIDDEN, OUTPUTS, REC_STEPS, REC_EDGES, WEIGHT_COUNT: ST.WEIGHT_COUNT, FEATURE_NAMES: ST.FEATURE_NAMES, OUTPUT_NAMES: ST.OUTPUT_NAMES, topology: topo, edges: topo.EDGES, zeroWeights: ST.zeroWeights, handWeights: GP.handWeights, post: ST.post, layersOf, forward, gunnerFor, gunnerFactory });
}
/** The fly's own wiring through this file (for the gate's comparison with brain/gunnerPolicy.mjs, and for a trainer that wants every wiring through one door). */
export const fly = createTurretCircuit(GFC);
const CONTROLS = new Map();
/** The control for a seed (see the header); the same object for the same seed. */
export function controlOf(seed = CONTROL_SEED) {
    if (!Number.isInteger(seed) || seed < 1) throw new Error(`seatTurretCircuit.controlOf: a control's seed is a whole number from 1 (got ${seed})`);
    if (!CONTROLS.has(seed)) CONTROLS.set(seed, createTurretCircuit(controlTopology(GFC, seed)));
    return CONTROLS.get(seed);
}
/** The library for a wiring NAME: "fly", or "control:<seed>". What a round, a record and a job carry. */
export function wiringOf(name = "fly") {
    if (name === "fly") return fly;
    const m = /^control:(\d+)$/.exec(String(name)); if (!m) throw new Error(`seatTurretCircuit.wiringOf: a wiring is "fly" or "control:<seed>" (got ${name})`);
    return controlOf(Number(m[1]));
}

export function reportLines() {
    const c = controlOf(), shared = c.edges.filter(([a, b]) => GFC.EDGES.some(([x, y]) => x === a && y === b)).length;
    return ["[seatTurretCircuit] the turret seat's network over any wiring, and a random circuit of the fly's size as its control",
        `  ${fly.FEATURES} features, ${fly.HIDDEN} hidden units, ${fly.REC_EDGES} synapses, ${fly.OUTPUTS} outputs: ${fly.WEIGHT_COUNT} weights; the control of seed ${CONTROL_SEED} shares ${shared} of its ${c.REC_EDGES} edges with the fly's`];
}
