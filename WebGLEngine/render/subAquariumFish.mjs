// WebGLEngine/render/subAquariumFish.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/subAquariumFish-selfcheck.mjs; the backlog entry is `fish-pilot-tank-kind`, brain/BACKLOG_2026-11-01.md, section C)
//
// THE ZEBRAFISH-WIRED PILOT AS A KIND OF SUB THE SUB AQUARIUM'S TANK CAN SEAT, in the shape of render/subAquariumFlyCx.mjs and render/subAquariumPlainNet.mjs: `tank.registerPilotKind("fish", fishKind())` tells the tank how to build the pilot for weights of the fish circuit.
// The pilot is brain/pilotSubFish.mjs's: the PD autopilot's laws written through a 34-neuron network whose recurrent core is the 153 edges of the Fish1 TEN-analysis core (brain/zebrafishTopology.mjs), 14 features -> 34 -> 3 recurrent steps inside ONE tick -> 4 controls, 803 weights (14 x 34 + 34 + 153 + 34 x 4 + 4).
// The champion is brain/pilotSubWeightsFishWip.json (policy pilotSubFish, 803 weights, a (1+1)-ES from the hand weights, pruned: 147 of the 803 differ from the autopilot's).
//
// *** WHAT SEATING IT SHOWS, SAID PLAINLY ***
//   * It has NO STATE across ticks (the three recurrent steps happen inside one control tick) and takes no compass flag: through the dropout it is the autopilot's law plus a learned residual, not a heading pilot. The kind's pilot ignores the fourth argument the compass events pass.
//   * The neurons are the densest core of a package about the dorsal motor nucleus of the vagus (vendor/zebrafish/PROVENANCE.md): not a circuit anybody has shown to steer a body, and not an escape circuit (brain/FISH_ESCAPE_PREREAD.md). The wiring only sets WHICH recurrent weights may exist; the hand weights are the autopilot's laws and the recurrent core starts at zero.
//   * The notes' reading of what such a pilot is worth is the generic one: a residual gain over the autopilot that a plain net of the same size keeps (brain/PLAIN_NET_CONTROL_WIP.md; render/subAquariumPlainNet.mjs is the control), and 38 shuffled wirings of this circuit score above it on all three audits (brain/fishCircuitStageA.jsonl).
//   * The CONTROL (`fishKind({ control: true })`) is the same pilot on a RANDOM circuit of the fish's size (pilotSubFish.mjs, seed 4242, one draw). There is no trained champion for it in the tree; the kind exists so that one, when trained, can be seated beside the fish without a new module.
// Pure: no DOM, no clock, no Math.random, no file (the caller reads the weights file).
"use strict";
import * as PF from "../brain/pilotSubFish.mjs";

export const CIRCUIT = "fish", CONTROL_CIRCUIT = "fish-control";
export const FORMAT = "swek-brain-v1", POLICY = "pilotSubFish";

/** The kind for the fish circuit (or, with `control`, for the random circuit of its size): the frozen kind { circuit, label, weightCount, persist: false, build(weights) -> pilot(state, target, current) }. */
export function fishKind({ control = false } = {}) {
    const policy = control ? PF.CONTROL : PF.FISH, circuit = control ? CONTROL_CIRCUIT : CIRCUIT;
    return Object.freeze({
        circuit, label: control ? `random circuit of the fish's size (${policy.HIDDEN} neurons, ${policy.REC_EDGES} edges, ${policy.WEIGHT_COUNT} weights)` : `zebrafish TEN core (${policy.HIDDEN} neurons, ${policy.REC_EDGES} edges, ${policy.WEIGHT_COUNT} weights)`, weightCount: policy.WEIGHT_COUNT, persist: false,
        build(weights) {
            if (!weights || weights.length !== policy.WEIGHT_COUNT) throw new Error(`subAquariumFish.build: the ${control ? "control" : "fish"} circuit takes exactly ${policy.WEIGHT_COUNT} weights, got ${weights ? weights.length : "none"}`);
            for (let i = 0; i < weights.length; i++) if (!Number.isFinite(weights[i])) throw new Error(`subAquariumFish.build: weight ${i} is not a finite number`);
            return policy.pilotFor(Float32Array.from(weights));
        },
    });
}

/** The champion file's facts, checked: { weights, score } of a swek-brain-v1 file of policy pilotSubFish whose weightCount is 803 and whose weights are 803 finite numbers. Throws naming the fault. */
export function checkFile(file) {
    if (!file || typeof file !== "object") throw new Error("subAquariumFish.checkFile: a weights file is an object (brain/pilotSubWeightsFishWip.json)");
    if (file.format !== FORMAT) throw new Error(`subAquariumFish.checkFile: format must be ${FORMAT}, got ${JSON.stringify(file.format)}`);
    if (file.policy !== POLICY) throw new Error(`subAquariumFish.checkFile: policy must be ${POLICY}, got ${JSON.stringify(file.policy)}`);
    const n = PF.FISH.WEIGHT_COUNT;
    if (file.weightCount !== n || !Array.isArray(file.weights) || file.weights.length !== n) throw new Error(`subAquariumFish.checkFile: the fish file should have ${n} weights, has weightCount ${file.weightCount} and ${Array.isArray(file.weights) ? file.weights.length : "no"} weights`);
    if (!file.weights.every(Number.isFinite)) throw new Error("subAquariumFish.checkFile: a weight is not a finite number");
    return { weights: file.weights, score: file.score };
}

/** The tank entry of the champion file: { pilot: "fish", circuit: "fish", weights } (a fresh array each call). */
export function entryOfFile(file) {
    const f = checkFile(file);
    return { pilot: CIRCUIT, circuit: CIRCUIT, weights: Array.from(f.weights) };
}

/**
 * The switchboard arm of the champion: { id, layer: "flying", controls, note, entry(), register(tank) } (the shape brain/switchboard.mjs on claude/wizardly-einstein-wr30pd takes with addArm, as brain/pilotLeakyHeading.mjs leakyArm).
 * `opts`: { file (required), id (default "fish-803"), controls (default ["autopilot"]) }.
 */
export function fishArm({ file, id = "fish-803", controls = ["autopilot"] } = {}) {
    const f = checkFile(file);
    if (typeof id !== "string" || !id) throw new Error("subAquariumFish.fishArm: an arm needs an id");
    if (!Array.isArray(controls) || !controls.every((c) => typeof c === "string" && c)) throw new Error("subAquariumFish.fishArm: controls is a list of arm ids");
    return Object.freeze({
        id, layer: "flying", controls: Object.freeze([...controls]),
        note: `the zebrafish TEN-core pilot (${f.weights.length} weights, no state): the PD autopilot's laws plus a learned residual through the connectome's recurrent core; not an escape circuit, and a plain net of the same size keeps its gain`,
        entry: () => ({ pilot: CIRCUIT, circuit: CIRCUIT, weights: Array.from(f.weights) }),
        register: (tank) => tank.registerPilotKind(CIRCUIT, fishKind()),
    });
}
