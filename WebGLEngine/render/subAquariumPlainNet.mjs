// WebGLEngine/render/subAquariumPlainNet.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is render/subAquariumPlainNet-selfcheck.mjs; the backlog entry is `plain-net-tank-kind` of brain/BACKLOG_2026-11-04_BRAINS.md on the switchboard branch)
//
// THE RUNG 4b PLAIN-NET CONTROL AS A KIND OF SUB THE SUB AQUARIUM'S TANK CAN SEAT, in the shape of render/subAquariumFlyCx.mjs: `tank.registerPilotKind(circuit, plainNetKind({ widths, scales }))` tells the tank how to build the pilot for weights of that net.
// The pilot is brain/pilotSubPlainNet.mjs's: the PD autopilot's laws plus a RESIDUAL read from a plain feed-forward relu net that is handed the same four tilt signals the fish circuit's afferents are (pitch and bank, attitude and rate), a mirrored pair with tied weights,
// NO STATE. The champions are in the tree: brain/rig-results/plainNetStudy.jsonl holds 8 weight-matched nets (MN) and 4 of the GPU Brain's size (MG) for each of the four cells of the registered study (brain/PLAIN_NET_CONTROL_WIP.md), each with its widths, its scales and its weights.
//
// *** WHAT SEATING ONE SHOWS, SAID PLAINLY ***
//   * The champions were trained on the two disturbances of rung 4b -- a pitching torque with three instant kicks (4b-P) and an unguided straight-runner with its pressure pulse (4b-E), tools/subVestibularTasks.mjs -- NOT on anything the tank does. The tank has no tilt, gust or hazard event (render/subAquariumSim.mjs EVENTS:
//     flood, sink, surface, dropout, navigator, fly-estimator, er-estimator, needs). A seated net is the autopilot plus a residual for disturbances that are not there; its tilt signals are small in the tank and so is the residual. The gate measures how much (section 7).
//   * It has no memory and reads no heading beyond the autopilot's own feature, so through the compass dropout it is NOT a heading pilot (the leaky unit of brain/pilotLeakyHeading.mjs is). The kind passes the compass flag by simply not taking it.
//   * The scales are part of the pilot (each signal divided to unit RMS over the training dives of its cell) and are NOT in the weight vector: a kind is built for one champion, `kindOfRecord(record)`, and its circuit name carries the spec, so two nets of one shape but different scales (P/whole and E/whole are both 72 hidden units) are different circuits.
//   * The untrained net is the autopilot (its output layer starts at zero): the gate holds that through the kind.
//   * This is the control to the FISH circuit pilot (brain/pilotSubVestibular.mjs), which is not a kind here; a righting demo would need that kind AND a tilt event in the tank (a shared file), and the notes say the plain net keeps 100 to 116 percent of the real wiring's gain.
// Pure: no DOM, no clock, no Math.random, no file (the caller reads the record).
"use strict";
import * as PN from "../brain/pilotSubPlainNet.mjs";

export const PREFIX = "plainnet";
export const SIGNAL_NAMES = Object.freeze(["pTonic", "rTonic", "pPhasic", "rPhasic"]);
export const FAMILIES = Object.freeze(["mn", "mg"]);

/** The scales as a plain object of the four finite positive numbers, or a thrown error naming the fault. */
export function checkScales(s) {
    if (!s) throw new Error(`subAquariumPlainNet.checkScales: the scales are { ${SIGNAL_NAMES.join(", ")} }, got ${JSON.stringify(s)}`);
    const out = {};
    for (const k of SIGNAL_NAMES) {
        if (!Number.isFinite(s[k]) || !(s[k] > 0)) throw new Error(`subAquariumPlainNet.checkScales: scale ${k} must be a finite number above 0, got ${JSON.stringify(s[k])}`);
        out[k] = s[k];
    }
    return out;
}

/**
 * The kind for one net: `widths` the hidden layer widths ([H] for MN, [32, 32] for MG), `scales` the unit-RMS scales of its cell, `circuit` the name the tank registers it under (default "plainnet:" + the widths joined by x).
 * Returns the frozen kind { circuit, label, weightCount, persist: false, widths, scales, build(weights, ctx) -> pilot(state, target, current) }. Bad widths, scales or a circuit named "gfc" throw.
 */
export function plainNetKind({ widths, scales, circuit } = {}) {
    const layout = PN.layoutOf(widths), sc = checkScales(scales), name = circuit === undefined ? `${PREFIX}:${widths.join("x")}` : circuit;
    if (typeof name !== "string" || !name || name === "gfc") throw new Error(`subAquariumPlainNet.plainNetKind: a circuit name other than "gfc", got ${JSON.stringify(name)}`);
    const policy = PN.createPlainNetPolicy(widths, name, { scales: sc });
    return Object.freeze({
        circuit: name, label: `plain relu net ${widths.join("-")} (${layout.count} weights, no state)`, weightCount: layout.count, persist: false, widths: Object.freeze([...widths]), scales: Object.freeze({ ...sc }),
        build(weights) {
            if (!weights || weights.length !== layout.count) throw new Error(`subAquariumPlainNet.build: the net ${widths.join("-")} takes exactly ${layout.count} weights, got ${weights ? weights.length : "none"}`);
            for (let i = 0; i < weights.length; i++) if (!Number.isFinite(weights[i])) throw new Error(`subAquariumPlainNet.build: weight ${i} is not a finite number`);
            return policy.pilotFor(Float32Array.from(weights));
        },
    });
}

/** The study record's own facts, checked: { spec, widths, scales, weights } of a record of family mn or mg whose weight count is its layout's. Throws naming the fault. */
export function checkRecord(r) {
    if (!r || typeof r !== "object") throw new Error("subAquariumPlainNet.checkRecord: a record is an object of brain/rig-results/plainNetStudy.jsonl");
    if (!FAMILIES.includes(r.family)) throw new Error(`subAquariumPlainNet.checkRecord: the record's family must be one of ${FAMILIES.join(", ")}, got ${JSON.stringify(r.family)}`);
    if (typeof r.spec !== "string" || !r.spec) throw new Error("subAquariumPlainNet.checkRecord: the record has no spec");
    const layout = PN.layoutOf(r.widths), scales = checkScales(r.scales);
    if (r.weightCount !== layout.count || !Array.isArray(r.weights) || r.weights.length !== layout.count) throw new Error(`subAquariumPlainNet.checkRecord: ${r.spec} should have ${layout.count} weights (widths ${r.widths.join("-")}), has weightCount ${r.weightCount} and ${Array.isArray(r.weights) ? r.weights.length : "no"} weights`);
    if (!r.weights.every(Number.isFinite)) throw new Error(`subAquariumPlainNet.checkRecord: ${r.spec} has a weight that is not a finite number`);
    return { spec: r.spec, widths: [...r.widths], scales, weights: r.weights };
}

/** The kind of a study record's champion: circuit "plainnet:<spec>" (for example plainnet:P/B/mn:3). */
export function kindOfRecord(record) {
    const r = checkRecord(record);
    return plainNetKind({ widths: r.widths, scales: r.scales, circuit: `${PREFIX}:${r.spec}` });
}

/** The tank entry of a record's champion: { pilot: "plainnet", circuit, weights } (a fresh array each call). */
export function entryOfRecord(record) {
    const r = checkRecord(record);
    return { pilot: PREFIX, circuit: `${PREFIX}:${r.spec}`, weights: Array.from(r.weights) };
}

/**
 * The switchboard arm of a record's champion: { id, layer: "flying", controls, note, entry(), register(tank) } (the shape brain/switchboard.mjs on claude/wizardly-einstein-wr30pd takes with addArm, as brain/pilotLeakyHeading.mjs leakyArm).
 * `opts`: { record (required), id (default "plainnet-" + the spec), controls (default ["autopilot"]) }.
 */
export function plainNetArm({ record, id, controls = ["autopilot"] } = {}) {
    const r = checkRecord(record), name = id === undefined ? `${PREFIX}-${r.spec}` : id;
    if (typeof name !== "string" || !name) throw new Error("subAquariumPlainNet.plainNetArm: an arm needs an id");
    if (!Array.isArray(controls) || !controls.every((c) => typeof c === "string" && c)) throw new Error("subAquariumPlainNet.plainNetArm: controls is a list of arm ids");
    const circuit = `${PREFIX}:${r.spec}`, weights = Array.from(r.weights);
    return Object.freeze({
        id: name, layer: "flying", controls: Object.freeze([...controls]),
        note: `the plain relu net ${r.widths.join("-")} of cell ${r.spec} (${weights.length} weights, no state), the control to the fish circuit; trained on rung 4b's tilt disturbances, not on anything in the tank`,
        entry: () => ({ pilot: PREFIX, circuit, weights: Array.from(weights) }),
        register: (tank) => tank.registerPilotKind(circuit, plainNetKind({ widths: r.widths, scales: r.scales, circuit })),
    });
}
