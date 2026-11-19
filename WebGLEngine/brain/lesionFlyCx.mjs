// WebGLEngine/brain/lesionFlyCx.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is brain/lesionFlyCx-selfcheck.mjs; the lesion machinery is brain/lesion.mjs; the note is brain/LESION_TOGGLE_WIP.md)
//
// THE STATEFUL FLY ON THE SWITCHBOARD, AND ITS NEURONS AS LESION CLASSES (backlog `lesion-toggle`, the part brain/LESION_TOGGLE_WIP.md section 5 left: "the stateful fly (1,729 weights)").
//   reservoirTopology(circuit) turns the fly's heading-loop circuit (vendor/hemibrain/hemibrain-cx-heading-loop.json: 148 cells, 7,080 synapses; io 88 input and 64 output cells) into the topology brain/lesion.mjs takes, KIND "reservoir":
//     LABELS  type (the cell type: EPG, PEN_a, PEN_b, Delta7, PEG), side (type and side, e.g. PEN_b_L), glomerulus (the protocerebral-bridge glomerulus in the cell's instance name, e.g. L4, across types; Delta7 cells span several
//             glomeruli and are one class, "spans several (Delta7)").
//     STRATA  the four ROLES a cell can have in the pilot (input only, output only, both, neither), for the matched random control.
//     the weight layout of brain/pilotSubCircuitState.mjs createStatePolicy: [ W_in: 15 x inputs ][ bias: N ][ sigma ][ W_out ][ b_out ].
//   *** SAID PLAINLY: in this circuit each TYPE is exactly one role (EPG both; PEN_a and PEN_b input; Delta7 neither; PEG output), so a type has no role-matched random set and brain/lesion.mjs refuses it as matched. A whole-type
//   lesion can only be read unmatched, against random sets that mix roles -- so its cost includes losing a role (all of the readout's PEG, all of Delta7's inhibition), not the type's wiring alone. Type-and-side and glomerulus classes
//   can be matched. ***
//   flyCxArms({ circuit, file }) gives the switchboard's flying arms "flycx-stateful" and "flycx-stateless" (the same weights; the stateless kind wipes the memory every tick, the control for what the memory does), each held to the
//   autopilot, each carrying its topology (`topo`) for the lesion toggle and registering its kind on the tank (render/subAquariumFlyCx.mjs flyCxKind).
// Pure: no clock, no Math.random, no file, no DOM (the caller reads the circuit and the weights file).
"use strict";
import { reservoirOf, FEATURES as STATE_FEATURES, OUTPUTS } from "./pilotSubCircuitState.mjs";
import * as FX from "../render/subAquariumFlyCx.mjs";

export const FORMAT = "swek-brain-v1", POLICY = "pilotSubCircuitState", CIRCUIT = FX.CIRCUIT;
export const ROLES = Object.freeze(["input only", "output only", "input and output", "neither"]);
const MULTI = "spans several (Delta7)";

/** The glomerulus of an instance name ("PEN_b(PB06b)_L4" -> "L4"), or null when the name ends in a side alone (a Delta7, which spans several). */
export function glomerulusOf(instance) {
    const m = /_([LR]\d+)$/.exec(String(instance));
    return m ? m[1] : null;
}

/** The fly circuit as brain/lesion.mjs's reservoir topology (frozen). Refuses what reservoirOf refuses and a neuron without cls, side and instance. */
export function reservoirTopology(circuit) {
    const r = reservoirOf(circuit), N = r.N, NI = r.inputs.length, NO = r.outputs.length;
    circuit.neurons.forEach((n, i) => { if (!n || typeof n.cls !== "string" || !n.cls || (n.side !== "L" && n.side !== "R") || typeof n.instance !== "string") throw new Error(`lesionFlyCx.reservoirTopology: neuron ${i} needs cls, side (L or R) and instance`); });
    const isIn = new Set(r.inputs), isOut = new Set(r.outputs), role = (i) => (isIn.has(i) ? (isOut.has(i) ? 2 : 0) : isOut.has(i) ? 1 : 3);
    const STRATA = ROLES.map((_, k) => Object.freeze(Array.from({ length: N }, (_, i) => i).filter((i) => role(i) === k)));
    const OFF_B = STATE_FEATURES * NI, SIGMA_INDEX = OFF_B + N, WEIGHT_COUNT = SIGMA_INDEX + 1 + OUTPUTS * NO + OUTPUTS;
    const type = circuit.neurons.map((n) => n.cls);
    return Object.freeze({
        KIND: "reservoir",
        NEURON_ORDER: Object.freeze(circuit.neurons.map((n, i) => n.id ?? i)),
        EDGES: Object.freeze(Array.from({ length: r.E }, (_, k) => Object.freeze([r.to[k], r.from[k]]))),   // [to, from], as the other topologies
        NEURON_TYPES: Object.freeze(type),
        LABELS: Object.freeze({
            type: Object.freeze(type),
            side: Object.freeze(circuit.neurons.map((n) => `${n.cls}_${n.side}`)),
            glomerulus: Object.freeze(circuit.neurons.map((n) => glomerulusOf(n.instance) ?? MULTI)),
        }),
        STRATA: Object.freeze(STRATA), ROLE: Object.freeze(Array.from({ length: N }, (_, i) => ROLES[role(i)])),
        INPUTS: Object.freeze([...r.inputs]), OUTPUTS: Object.freeze([...r.outputs]),
        STATE_FEATURES, OFF_B, SIGMA_INDEX, WEIGHT_COUNT,
    });
}

/** The weights file's facts, checked: the weights of a swek-brain-v1 file of policy pilotSubCircuitState on circuit flycx with `topo`'s weight count. Throws naming the fault. */
export function checkFile(file, topo) {
    if (!file || typeof file !== "object") throw new Error("lesionFlyCx.checkFile: a weights file is an object (brain/pilotSubFlyCxWip.json)");
    if (file.format !== FORMAT) throw new Error(`lesionFlyCx.checkFile: format must be ${FORMAT}, got ${JSON.stringify(file.format)}`);
    if (file.policy !== POLICY) throw new Error(`lesionFlyCx.checkFile: policy must be ${POLICY}, got ${JSON.stringify(file.policy)}`);
    if (file.circuit !== CIRCUIT) throw new Error(`lesionFlyCx.checkFile: circuit must be ${CIRCUIT}, got ${JSON.stringify(file.circuit)}`);
    if (!Array.isArray(file.weights) || file.weights.length !== topo.WEIGHT_COUNT || file.weightCount !== topo.WEIGHT_COUNT) throw new Error(`lesionFlyCx.checkFile: the heading loop takes ${topo.WEIGHT_COUNT} weights; the file has weightCount ${file.weightCount} and ${Array.isArray(file.weights) ? file.weights.length : "no"} weights`);
    if (!file.weights.every(Number.isFinite)) throw new Error("lesionFlyCx.checkFile: a weight is not a finite number");
    return file.weights;
}

/** The two switchboard arms of the stateful fly: [stateful, stateless], flying layer, each held to `controls` (default the autopilot), carrying `topo`, registering its kind on the tank. */
export function flyCxArms({ circuit, file, controls = ["autopilot"] } = {}) {
    const topo = reservoirTopology(circuit), weights = checkFile(file, topo), circ = { neurons: circuit.neurons, edges: circuit.edges, io: circuit.io };
    const arm = (persist) => Object.freeze({
        id: persist ? "flycx-stateful" : "flycx-stateless", layer: "flying", controls: Object.freeze([...controls]), topo,
        note: persist
            ? `the fly heading-loop reservoir with memory (${topo.NEURON_ORDER.length} cells, ${topo.WEIGHT_COUNT} weights): the autopilot's laws plus a residual; its gain is the recipe's generic gain and NOT a compass skill (its file's limits)`
            : "the same weights with the memory wiped every tick (no state): the control for what the memory does",
        entry: () => ({ pilot: "stateful", circuit: CIRCUIT, weights: Array.from(weights) }),
        register: (tank) => tank.registerPilotKind(CIRCUIT, FX.flyCxKind(circ, { persist })),
    });
    return [arm(true), arm(false)];
}
