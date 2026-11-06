// WebGLEngine/brain/rotorcraftBoard.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is brain/ROTORCRAFT_BOARD_WIP.md, the command is tools/ship/takeRotorcraftBoard.mjs, the gate is brain/rotorcraftBoard-selfcheck.mjs)
//
// THE HELICOPTER AND QUADROTOR BRAINS ON A BOARD OF THEIR OWN: two flying-layer tasks, `rotor` (brain/rotorTask.mjs: hover in a wind, recovery from an upset, an engine out, a terrain flight) and `drone` (brain/droneTask.mjs: hover, recovery, a motor out, a goto), registered with
// the switchboard's own createBoard / addTask / addArm (brain/switchboard.mjs is NOT edited, and the arms are NOT added to its standardBoard: a rotorcraft arm on the tank's dropout task would throw). Arms: the hand autopilot, the hand pilot written as the 1,167-weight fruit-fly network
// ("hand-net": the same laws, it must TIE the hand pilot), the trained fruit-fly network, for the quadrotor the 1,860-weight MLP in its two committed trainings, and "zero" (the same network with every weight zero: a pilot that does nothing, the floor).
// Each trained brain has the hand pilot and the floor as its controls; the reading is the board's (pooled paired difference, BETTER iff above 2 se). Pure apart from the flights; no clock, no Math.random, no file (the command reads the weights).
"use strict";
import * as B from "./switchboard.mjs";
import * as RT from "./rotorTask.mjs";
import * as DT from "./droneTask.mjs";
import * as AR from "./autopilotRotor.mjs";
import * as AD from "./autopilotDrone.mjs";
import * as RP from "./pilotRotorPolicy.mjs";
import * as DP from "./pilotDronePolicy.mjs";
import * as DM from "./pilotDroneMlp.mjs";

export const RC_SETS = Object.freeze({ dev: Object.freeze({ from: 1, to: 3 }), held73: Object.freeze({ from: 8001, to: 8012 }) });
export const TASKS = Object.freeze({ rotor: Object.freeze({ T: RT, outKind: "engine" }), drone: Object.freeze({ T: DT, outKind: "motor" }) });
export const SAME_TOL = 1e-3, FLOOR_FRACTION = 5 / 6;
export const WEIGHT_FILES = Object.freeze({ rotorFly: "brain/pilotRotorWeightsDefault.json", droneFly: "brain/pilotDroneWeightsV2.json", droneMlp: "brain/pilotDroneMlpWeightsDefault.json", droneMlpV2: "brain/pilotDroneMlpWeightsV2.json" });
export const TRAINED = Object.freeze(["fly", "mlp", "mlp-v2"]);
export const ARM_IDS = Object.freeze({ rotor: Object.freeze(["hand", "hand-net", "fly", "zero"]), drone: Object.freeze(["hand", "hand-net", "fly", "mlp", "mlp-v2", "zero"]) });

/** A task of the board: `run(arm, range, opts)` flies the arm's pilot on seeds range.from..range.to of each kind (opts.kinds, default all four), kind-major; one run each: { key: "<kind>:<seed>", score, bad } (bad = the task's own "not standing"). */
const taskOf = (name) => {
    const { T, outKind } = TASKS[name];
    return Object.freeze({
        name, layer: "flying",
        run(arm, range, opts = {}) {
            if (typeof arm.pilot !== "function") throw new Error(`rotorcraftBoard.${name}: arm ${arm.id} has no pilot()`);
            const kinds = opts.kinds || T.KINDS, out = [];
            for (const kind of kinds) {
                if (!T.KINDS.includes(kind)) throw new Error(`rotorcraftBoard.${name}: unknown kind "${kind}" (${T.KINDS.join(", ")})`);
                for (let seed = range.from; seed <= range.to; seed++) { const r = T.fly(arm.pilot(), T.scenario(seed, kind)); out.push({ key: `${kind}:${seed}`, score: r.score, bad: kind === outKind ? !r.settled : r.status !== "airborne" }); }
            }
            return out;
        },
    });
};
export const rotorTask = taskOf("rotor"), droneTask = taskOf("drone");
const toF32 = (w) => (w instanceof Float32Array ? w : Float32Array.from(w));
/** The helicopter's arms from { fly: weights (1,167) }. */
export function rotorArms(w = {}) {
    const arms = [
        { id: "hand", layer: "flying", controls: [], pilot: () => AR.pilot, note: "the hand autopilot (brain/autopilotRotor.mjs)" },
        { id: "zero", layer: "flying", controls: [], pilot: () => RP.pilotFor(RP.zeroWeights()), note: "the fruit-fly network with every weight zero: it does nothing (the floor)" },
        { id: "hand-net", layer: "flying", controls: ["hand"], pilot: () => RP.pilotFor(RP.handWeights()), note: "the hand pilot written as the 1,167-weight network: the same laws" },
    ];
    if (w.fly) arms.push({ id: "fly", layer: "flying", controls: ["hand", "zero"], pilot: () => RP.pilotFor(toF32(w.fly)), note: "the fruit-fly network pilot, trained" });
    return arms;
}
/** The quadrotor's arms from { fly (1,167), mlp (1,860), mlpV2 (1,860) }. */
export function droneArms(w = {}) {
    const arms = [
        { id: "hand", layer: "flying", controls: [], pilot: () => AD.pilot, note: "the hand autopilot (brain/autopilotDrone.mjs)" },
        { id: "zero", layer: "flying", controls: [], pilot: () => DP.pilotFor(DP.zeroWeights()), note: "the fruit-fly network with every weight zero: it does nothing (the floor)" },
        { id: "hand-net", layer: "flying", controls: ["hand"], pilot: () => DP.pilotFor(DP.handWeights()), note: "the hand pilot written as the 1,167-weight network: the same laws" },
    ];
    if (w.fly) arms.push({ id: "fly", layer: "flying", controls: ["hand", "zero"], pilot: () => DP.pilotFor(toF32(w.fly)), note: "the fruit-fly network pilot (second recipe), trained" });
    if (w.mlp) arms.push({ id: "mlp", layer: "flying", controls: ["hand", "zero"], pilot: () => DM.pilotFor(toF32(w.mlp)), note: "the 1,860-weight MLP, first training" });
    if (w.mlpV2) arms.push({ id: "mlp-v2", layer: "flying", controls: ["hand", "zero"], pilot: () => DM.pilotFor(toF32(w.mlpV2)), note: "the 1,860-weight MLP, second training" });
    return arms;
}
/** The board: both tasks, the arms of each (arm ids are shared by name across the two tasks, so a board holds the arms of ONE rotorcraft at a time: `which` is "rotor" or "drone"). */
export function rotorcraftBoard(which, weights = {}) {
    if (!TASKS[which]) throw new Error(`rotorcraftBoard.rotorcraftBoard: unknown rotorcraft "${which}" (${Object.keys(TASKS).join(", ")})`);
    const b = B.createBoard().addTask(which === "rotor" ? rotorTask : droneTask);
    for (const a of (which === "rotor" ? rotorArms : droneArms)(weights)) b.addArm(a);
    return b;
}
const finite = (x) => Number.isFinite(x);
const kindOf = (r) => r.key.split(":")[0];
/**
 * The registered checks of a result (brain/ROTORCRAFT_BOARD_WIP.md section 2 and Amendment 2): every arm flew the same scenarios in the same order; no score is non-finite; hand-net and hand differ by less than SAME_TOL on every scenario;
 * zero is below hand on at least FLOOR_FRACTION of the scenarios of the kinds that are NOT the task's failure kind (the hand pilot loses most failure-kind flights, where doing nothing ties it or beats it: that comparison is printed, not checked).
 * Returns { ok, failures: [string], info: [string] } -- a failure and the readings are NOT WEIGHED; info lines are printed and weigh nothing.
 */
export function checksOf(res) {
    const ids = Object.keys(res.runs), failures = [], info = [], first = res.runs[ids[0]];
    for (const id of ids) {
        const rs = res.runs[id];
        if (rs.length !== first.length || rs.some((r, i) => r.key !== first[i].key)) failures.push(`${id} did not fly the same scenarios in the same order as ${ids[0]}`);
        if (rs.some((r) => !finite(r.score))) failures.push(`${id} has a non-finite score`);
    }
    const aligned = (a, b) => res.runs[a].length === res.runs[b].length;
    if (res.runs.hand && res.runs["hand-net"] && aligned("hand", "hand-net")) {
        const worst = Math.max(...res.runs.hand.map((r, i) => Math.abs(r.score - res.runs["hand-net"][i].score)));
        if (!(worst < SAME_TOL)) failures.push(`hand-net is not the hand pilot: the largest difference is ${worst.toExponential(2)} (the limit is ${SAME_TOL})`);
    }
    if (res.runs.hand && res.runs.zero && aligned("hand", "zero")) {
        const outKind = TASKS[res.task] ? TASKS[res.task].outKind : null, idx = first.map((r, i) => i).filter((i) => kindOf(first[i]) !== outKind), outIdx = first.map((r, i) => i).filter((i) => kindOf(first[i]) === outKind);
        const below = idx.filter((i) => res.runs.zero[i].score < res.runs.hand[i].score).length, need = Math.ceil(idx.length * FLOOR_FRACTION);
        if (below < need) failures.push(`zero is below hand on only ${below} of the ${idx.length} scenarios${outKind ? ` that are not ${outKind}` : ""} (at least ${need} are required)`);
        if (outIdx.length) {
            const lo = outIdx.filter((i) => res.runs.zero[i].score < res.runs.hand[i].score).length, hi = outIdx.filter((i) => res.runs.zero[i].score > res.runs.hand[i].score).length;
            info.push(`on the ${outKind} scenarios (not checked) zero is below hand on ${lo}, tied on ${outIdx.length - lo - hi}, above on ${hi}, of ${outIdx.length}`);
        }
    }
    return { ok: failures.length === 0, failures, info };
}
/** The reading per kind: for every arm with a control, its paired difference from that control within each kind: [{ arm, control, kind, n, mean, se, reading, better, worse }]. */
export function perKind(board, res) {
    const out = [], kinds = [...new Set(res.runs[Object.keys(res.runs)[0]].map((r) => r.key.split(":")[0]))];
    for (const id of Object.keys(res.runs)) for (const c of board.arms.get(id).controls) {
        if (!res.runs[c]) continue;
        for (const kind of kinds) {
            const sub = (rs) => rs.filter((r) => r.key.startsWith(kind + ":")), p = B.paired(sub(res.runs[id]), sub(res.runs[c]));
            out.push({ arm: id, control: c, kind, n: p.n, mean: p.mean, se: p.se, reading: id === "hand-net" && Math.abs(p.mean) < SAME_TOL ? "TIES" : B.readingOf(p), better: p.better, worse: p.worse });
        }
    }
    return out;
}
/** The trained brains against each other, pairwise and pooled (printed, not a registered reading): [{ a, b, n, mean, se, reading, better, worse }] for each unordered pair of the trained arms present, in TRAINED order. */
export function trainedPairs(res) {
    const present = TRAINED.filter((id) => res.runs[id]), out = [];
    for (let i = 0; i < present.length; i++) for (let j = i + 1; j < present.length; j++) { const p = B.paired(res.runs[present[i]], res.runs[present[j]]); out.push({ a: present[i], b: present[j], n: p.n, mean: p.mean, se: p.se, reading: B.readingOf(p), better: p.better, worse: p.worse }); }
    return out;
}
/** The lines of a read: the checks first (a failure is the first line and the readings follow marked NOT WEIGHED), the board's lines, the per-kind lines, then the trained brains against each other (printed, not registered). */
export function readLines(board, res) {
    const ck = checksOf(res), L = [];
    if (!ck.ok) for (const f of ck.failures) L.push(`CHECK FAILED -- the readings below are NOT WEIGHED: ${f}`);
    else L.push("checks: every arm flew the same scenarios, no score is non-finite, hand-net is the hand pilot, zero is a floor");
    for (const f of ck.info) L.push(`  ${f}`);
    try {
        L.push(...board.read(res).lines);
        for (const k of perKind(board, res)) L.push(`  by kind ${k.kind.padEnd(9)} ${k.arm} against ${k.control}: ${k.reading} (${k.mean >= 0 ? "+" : ""}${k.mean.toFixed(4)}, se ${k.se.toFixed(4)}, better ${k.better}, worse ${k.worse}, of ${k.n})`);
        for (const t of trainedPairs(res)) L.push(`  among the trained brains ${t.a} against ${t.b}: ${t.reading} (${t.mean >= 0 ? "+" : ""}${t.mean.toFixed(4)}, se ${t.se.toFixed(4)}, better ${t.better}, worse ${t.worse}, of ${t.n})`);
    } catch (e) { L.push(`the readings could not be paired: ${e.message}`); }
    return L;
}
