// WebGLEngine/brain/helmCompassPolicy.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY'S STEERING CIRCUIT WITH ITS INPUTS AT A CAPITAL SHIP'S HELM. brain/helmSteerPolicy.mjs put the central complex's OUTPUT stage behind the rule that turns the hull: 40 neurons, the cells that carry a steering error to the descending neurons. What they compare was not there. This is the circuit with it
// (brain/cxInputsTopology.mjs, from vendor/male-cns/cx-steering-inputs-circuit.json; brain/maleCnsCircuits-selfcheck.mjs pins what is in it): the COMPASS -- 46 EPG, the ring that holds the heading, and 42 Delta7, which shape it -- the GOAL cells of the fan-shaped body, 18 FC2A, 27 FC2B and 47 FC2C, and the same
// 12 PFL2, 24 PFL3, 2 DNa02 and 2 DNa03. 220 neurons, 7,981 connections. Keith: "build a helm over the larger circuit with its inputs."
//
// WHAT THIS IS: brain/helmSteerPolicy.mjs's createHelmCircuit over that wiring -- the same twelve features, the same five outputs read the same way, the same limits, the same contract (helmFor, helmFactory), three weight-tied recurrent steps -- with the steps taken over the connections only (brain/sparseRecurrent.mjs;
// the gate compares it with the dense layers bit for bit). 11,946 weights = 2,640 + 220 + 7,981 + 1,100 + 5. THE STEERING CIRCUIT'S 40 NEURONS ARE NEURONS 180-219 OF THIS ONE and its 523 connections are among these, so the smaller helm's wiring is inside this one (pinned).
//
// *** THE ZERO WEIGHTS ARE THE RULE. NOTHING HERE IS TRAINED BY THIS FILE. AND THE INPUTS ARE NOT WIRED AS THE FLY WIRES THEM: the fly's heading arrives at the EPG ring and its goal at the FC2 cells; here every feature may reach every neuron through a dense learned encoder, as in every other circuit of this tree,
// and nothing makes the ship's pointing error arrive where a fly's would. The transmitter predictions (Delta7 glutamate, the rest acetylcholine) are not used either: a synapse's weight is free in sign. What the wiring is worth is a question for a search and a control (`control`, `wiringOf`). ***
"use strict";
import * as CX from "./cxInputsTopology.mjs";
import * as PFL from "./pflTopology.mjs";
import { createHelmCircuit } from "./helmSteerPolicy.mjs";
import { controlTopology } from "./pilotSubFish.mjs";

export const POLICY_ID = "helmCompassPolicy", CONTROL_SEED = 4242;
const LIB = createHelmCircuit(CX, { sparse: true });
export const FEATURES = LIB.FEATURES, HIDDEN = LIB.HIDDEN, OUTPUTS = LIB.OUTPUTS, REC_STEPS = LIB.REC_STEPS, REC_EDGES = LIB.REC_EDGES, WEIGHT_COUNT = LIB.WEIGHT_COUNT;   // 12 x 220 + 220 + 7,981 + 220 x 5 + 5 = 11,946
export const FEATURE_NAMES = LIB.FEATURE_NAMES, OUTPUT_NAMES = LIB.OUTPUT_NAMES, TORQUE_FRACTION = LIB.TORQUE_FRACTION, THROTTLE_FRACTION = LIB.THROTTLE_FRACTION;
export const zeroWeights = LIB.zeroWeights, handWeights = LIB.handWeights, layersOf = LIB.layersOf, forward = LIB.forward, featuresOf = LIB.featuresOf, helmFor = LIB.helmFor, helmFactory = LIB.helmFactory, perturb = LIB.perturb;
export const encoderAt = LIB.encoderAt, hiddenBiasAt = LIB.hiddenBiasAt, synapseAt = LIB.synapseAt, outputAt = LIB.outputAt, biasAt = LIB.biasAt, topology = CX, edges = CX.EDGES;
/** The control: the same library over a random circuit of this circuit's size (220 neurons, 7,981 edges, drawn uniformly from seed 4242). One draw. */
export const control = createHelmCircuit(controlTopology(CX, CONTROL_SEED), { sparse: true });
const CONTROLS = new Map([[CONTROL_SEED, control]]);
/** The library for a wiring NAME: "fly" (this circuit) or "control:<seed>". What a search, a record and a pool job carry. */
export function wiringOf(name = "fly") {
    if (name === "fly") return LIB;
    const m = /^control:(\d+)$/.exec(String(name)); if (!m) throw new Error(`helmCompassPolicy.wiringOf: a wiring is "fly" or "control:<seed>" (got ${name})`);
    const seed = Number(m[1]); if (!CONTROLS.has(seed)) CONTROLS.set(seed, createHelmCircuit(controlTopology(CX, seed), { sparse: true }));
    return CONTROLS.get(seed);
}
/** The neurons by type, as indices into the hidden layer, and where the steering circuit's 40 neurons (brain/pflTopology.mjs's order) are in this one. */
export const NEURONS = Object.freeze(Object.fromEntries([...new Set(CX.NEURON_TYPES)].map((t) => [t, Object.freeze(CX.NEURON_TYPES.map((x, i) => (x === t ? i : -1)).filter((i) => i >= 0))])));
export const STEERING = Object.freeze(PFL.NEURON_ORDER.map((id) => CX.NEURON_ORDER.indexOf(id)));

export function reportLines() {
    return ["[helmCompassPolicy] the fly's steering circuit WITH ITS INPUTS at a capital ship's helm: the compass (EPG, Delta7), the goal cells (FC2A-C), PFL2 and PFL3, DNa02 and DNa03 as the recurrent core of helmPolicy's correction to the rule",
        `  ${FEATURES} features, ${HIDDEN} neurons (${Object.entries(NEURONS).map(([t, v]) => `${v.length} ${t}`).join(", ")}), ${REC_EDGES} synapses, ${OUTPUTS} outputs: ${WEIGHT_COUNT} weights; the steering circuit's 40 neurons are neurons ${Math.min(...STEERING)}-${Math.max(...STEERING)} of it; the zero weights are the rule; the features reach the neurons through a learned encoder, not as the fly's inputs do`];
}

if (typeof process !== "undefined" && Array.isArray(process.argv)) {   // see physics/mechanics/aircraftAssembly.mjs for why this is guarded and the import is dynamic
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) { for (const l of reportLines()) console.log(l); process.exit(0); }
}
