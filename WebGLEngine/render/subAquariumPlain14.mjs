// WebGLEngine/render/subAquariumPlain14.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/subAquariumPlain14-selfcheck.mjs; the control of the head-to-head round H2, brain/BACKLOG_2026-11-04_BRAINS.md on claude/wizardly-einstein-wr30pd)
//
// THE PLAIN CONTROL OF THE 963-WEIGHT TANK NETWORKS AS A KIND OF SUB THE SUB AQUARIUM'S TANK CAN SEAT, in the shape of render/subAquariumFish.mjs: `tank.registerPilotKind("plain14", plain14Kind())` tells the tank how to build the pilot for weights of the plain 14-50-4 relu net.
// The pilot is brain/pilotSubPlain.mjs's: the PD autopilot's laws written through 50 relu units with NO wiring at all, 14 features -> 50 -> 4 controls, 954 weights (14 x 50 + 50 + 0 + 50 x 4 + 4) against the fly's Giant Fiber Circuit network's 963 and the fish's 803.
// The champion is made by `node tools/ship/trainPilotSub.mjs --circuit plain14 --workers 4 --write --out brain/pilotSubPlain14Wip.json` (the fly's and the fish's recipe, the same dives and audits) and read here as a swek-brain-v1 file of policy pilotSubPlain14.
//
// *** WHAT SEATING IT SHOWS, SAID PLAINLY ***
//   * It has NO STATE across ticks and takes no compass flag: through the dropout it is the autopilot's law plus a learned residual, as the fish's is; the kind's pilot ignores the fourth argument the compass events pass.
//   * It is the CONTROL: a network of the size of the fly's with no connectome in it. What it scores beside the 963-weight networks is the question of the head-to-head round: does any wiring beat a net of its size that has none?
// Pure: no DOM, no clock, no Math.random, no file (the caller reads the weights file).
"use strict";
import * as PP from "../brain/pilotSubPlain.mjs";

export const CIRCUIT = "plain14";
export const FORMAT = "swek-brain-v1", POLICY = "pilotSubPlain14";

/** The kind for the plain net: the frozen kind { circuit, label, weightCount, persist: false, build(weights) -> pilot(state, target, current) }. */
export function plain14Kind() {
    const policy = PP.PLAIN14;
    return Object.freeze({
        circuit: CIRCUIT, label: `plain relu net, no wiring (${policy.HIDDEN} units, ${policy.WEIGHT_COUNT} weights)`, weightCount: policy.WEIGHT_COUNT, persist: false,
        build(weights) {
            if (!weights || weights.length !== policy.WEIGHT_COUNT) throw new Error(`subAquariumPlain14.build: the plain net takes exactly ${policy.WEIGHT_COUNT} weights, got ${weights ? weights.length : "none"}`);
            for (let i = 0; i < weights.length; i++) if (!Number.isFinite(weights[i])) throw new Error(`subAquariumPlain14.build: weight ${i} is not a finite number`);
            return policy.pilotFor(Float32Array.from(weights));
        },
    });
}

/** The champion file's facts, checked: { weights, score } of a swek-brain-v1 file of policy pilotSubPlain14 whose weightCount is 954 and whose weights are 954 finite numbers. Throws naming the fault. */
export function checkFile(file) {
    if (!file || typeof file !== "object") throw new Error("subAquariumPlain14.checkFile: a weights file is an object (brain/pilotSubPlain14Wip.json)");
    if (file.format !== FORMAT) throw new Error(`subAquariumPlain14.checkFile: format must be ${FORMAT}, got ${JSON.stringify(file.format)}`);
    if (file.policy !== POLICY) throw new Error(`subAquariumPlain14.checkFile: policy must be ${POLICY}, got ${JSON.stringify(file.policy)}`);
    const n = PP.PLAIN14.WEIGHT_COUNT;
    if (file.weightCount !== n || !Array.isArray(file.weights) || file.weights.length !== n) throw new Error(`subAquariumPlain14.checkFile: the plain-net file should have ${n} weights, has weightCount ${file.weightCount} and ${Array.isArray(file.weights) ? file.weights.length : "no"} weights`);
    if (!file.weights.every(Number.isFinite)) throw new Error("subAquariumPlain14.checkFile: a weight is not a finite number");
    return { weights: file.weights, score: file.score };
}

/** The tank entry of the champion file: { pilot: "plain14", circuit: "plain14", weights } (a fresh array each call). */
export function entryOfFile(file) {
    const f = checkFile(file);
    return { pilot: CIRCUIT, circuit: CIRCUIT, weights: Array.from(f.weights) };
}

/**
 * The switchboard arm of the champion: { id, layer: "flying", controls, note, entry(), register(tank) } (the shape brain/switchboard.mjs on claude/wizardly-einstein-wr30pd takes with addArm, as render/subAquariumFish.mjs fishArm).
 * `opts`: { file (required), id (default "plain14-954"), controls (default ["autopilot"]) }.
 */
export function plain14Arm({ file, id = "plain14-954", controls = ["autopilot"] } = {}) {
    const f = checkFile(file);
    if (typeof id !== "string" || !id) throw new Error("subAquariumPlain14.plain14Arm: an arm needs an id");
    if (!Array.isArray(controls) || !controls.every((c) => typeof c === "string" && c)) throw new Error("subAquariumPlain14.plain14Arm: controls is a list of arm ids");
    return Object.freeze({
        id, layer: "flying", controls: Object.freeze([...controls]),
        note: `the plain control of the 963-weight networks (${f.weights.length} weights, 50 relu units, no wiring, no state): the PD autopilot's laws plus a learned residual through a net with no connectome in it`,
        entry: () => ({ pilot: CIRCUIT, circuit: CIRCUIT, weights: Array.from(f.weights) }),
        register: (tank) => tank.registerPilotKind(CIRCUIT, plain14Kind()),
    });
}
