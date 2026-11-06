// WebGLEngine/tools/ship/headToHead.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/headToHeadCmd.mjs; the gate is tools/ship/headToHead-selfcheck.mjs)
//
// ROUND H1 of brain/HEAD_TO_HEAD.md (registered before this file existed): the eight 963-weight networks of the tree, the untrained hand weights and the PD autopilot flown on the tank's compass dropout (200 fresh ids, dark and
// lit) through the switchboard (brain/switchboard.mjs), and read as paired differences: each network against the autopilot and against the hand weights it was trained from, and whether its gain is specific to the dark.
// Reads nothing from disk (the command hands the weights in). THE IDS ARE READ ONLY BY audit(). No clock, no Math.random, no file.
"use strict";
import * as B from "../../brain/switchboard.mjs";

export const NETWORK_NAMES = Object.freeze(["Wip", "Actuators", "Robust", "RobustLong", "RobustTail", "RobustTail2", "RobustWide", "RobustNoisy"]);
export const IDS = Object.freeze({ from: 2000, to: 2199 }), SECONDS = 160;
export const ARM_IDS = Object.freeze(["autopilot", "network-hand", ...NETWORK_NAMES.map((n) => "network-" + n)]);
const netId = (n) => "network-" + n;
/** The board for this round: the dropout task and the ten arms; every trained network is held to the autopilot and to `network-hand`, the hand weights to the autopilot. `weights` = { hand, <network name>: 963 numbers }. */
export function boardOf(weights) {
    for (const n of ["hand", ...NETWORK_NAMES]) if (!weights || !Array.isArray(weights[n] || null) || weights[n].length !== 963) throw new Error(`headToHead.boardOf: weights.${n} must be an array of 963 numbers`);
    const b = B.createBoard().addTask(B.dropoutTask);
    for (const a of B.flyingArms(Object.fromEntries(["hand", ...NETWORK_NAMES].map((n) => [n, weights[n]])))) {
        if (a.id !== "autopilot" && a.id !== "network-hand") a.controls = ["autopilot", "network-hand"];
        b.addArm(a);
    }
    return b;
}
/** EVERY arm once, dark (the compass dropout) and lit (no event), on `range` ids; `seconds` and `range` are for the gate. Returns { dark: runs by arm, lit: runs by arm, range, seconds }. */
export function audit(weights, { range = IDS, seconds = SECONDS } = {}) {
    const b = boardOf(weights);
    return { dark: b.run("dropout", [...ARM_IDS], range, { seconds }).runs, lit: b.run("dropout", [...ARM_IDS], range, { seconds, event: null }).runs, range, seconds };
}
const diffRuns = (ra, rb) => ra.map((r, i) => ({ key: r.key, score: r.score - rb[i].score, bad: false }));
/** One network's readings: its dark gain over the autopilot and over the hand weights, its lit gain over the autopilot, and the dark-specific difference (dark gain minus lit gain, per id); each a pooled paired difference with its reading. */
export function readingsOf(au, name) {
    const id = netId(name), mk = (p) => ({ ...p, reading: B.readingOf(p) });
    const vsAuto = mk(B.paired(au.dark[id], au.dark.autopilot)), vsHand = mk(B.paired(au.dark[id], au.dark["network-hand"])), litAuto = mk(B.paired(au.lit[id], au.lit.autopilot));
    const specific = mk(B.paired(diffRuns(au.dark[id], au.dark.autopilot), diffRuns(au.lit[id], au.lit.autopilot)));
    return { name, vsAuto, vsHand, litAuto, specific };
}
const lostOf = (runs) => runs.reduce((s, r) => s + (r.bad ? 1 : 0), 0);
const list = (xs) => xs.join(", ");
export function bottomLines(au) {
    const rs = NETWORK_NAMES.map((n) => readingsOf(au, n)), pick = (f) => rs.filter(f).map((r) => r.name);
    const beat = pick((r) => r.vsAuto.reading === "BETTER"), below = pick((r) => r.vsAuto.reading === "WORSE"), hb = pick((r) => r.vsHand.reading === "BETTER"), hw = pick((r) => r.vsHand.reading === "WORSE"), sp = pick((r) => r.specific.reading === "BETTER");
    const hand = B.readingOf(B.paired(au.dark["network-hand"], au.dark.autopilot)), word = hand === "BETTER" ? "BEAT" : hand === "WORSE" ? "ARE BELOW" : "TIE";
    const lost = NETWORK_NAMES.map((n) => lostOf(au.dark[netId(n)]) + lostOf(au.lit[netId(n)])), la = lostOf(au.dark.autopilot) + lostOf(au.lit.autopilot), lh = lostOf(au.dark["network-hand"]) + lostOf(au.lit["network-hand"]);
    return [
        `${beat.length} OF ${NETWORK_NAMES.length} NETWORKS BEAT THE AUTOPILOT IN THE DARK (${list(beat) || "none"})${below.length ? `; ${list(below)} ARE BELOW IT` : ""}`,
        `${hb.length} OF ${NETWORK_NAMES.length} NETWORKS BEAT THEIR UNTRAINED START IN THE DARK (${list(hb) || "none"})${hw.length ? `; ${list(hw)} ARE BELOW IT` : ""}`,
        `THE UNTRAINED HAND WEIGHTS ${word} THE AUTOPILOT IN THE DARK`,
        `THE GAIN IS DARK-SPECIFIC IN ${sp.length} OF ${NETWORK_NAMES.length} (${list(sp) || "none"})`,
        `LOST SUBS: autopilot ${la}, hand ${lh}, networks ${lost.reduce((a, b) => a + b, 0)} (${Math.max(...lost)} in the worst)`,
    ];
}
export function checksOf(au) {
    const rows = [], n = au.range.to - au.range.from + 1, cells = ["dark", "lit"].flatMap((c) => ARM_IDS.map((a) => [c, a]));
    const sizes = cells.every(([c, a]) => au[c][a] && au[c][a].length === n);
    rows.push({ name: "SIZES", ok: sizes, text: `every arm flew ${n} ids in both conditions: ${sizes}` });
    const same = cells.every(([c, a]) => au[c][a] && au[c][a].every((r, i) => au[c].autopilot[i] && r.key === au[c].autopilot[i].key));
    rows.push({ name: "IDS ALIGNED", ok: same, text: `the ids are the same in every arm and condition: ${same}` });
    const inside = cells.every(([c, a]) => au[c][a] && au[c][a].every((r) => r.score > 0 && r.score < 1));
    rows.push({ name: "SCORES INSIDE (0, 1)", ok: inside, text: `no score outside (0, 1): ${inside}` });
    const event = au.dark.autopilot.some((r, i) => r.score !== au.lit.autopilot[i].score);
    rows.push({ name: "EVENT REACHES THE FLIGHT", ok: event, text: `the autopilot's dark and lit scores differ on at least one id: ${event}` });
    const distinct = new Set(ARM_IDS.map((a) => au.dark[a].map((r) => r.score).join("|"))).size === ARM_IDS.length;
    rows.push({ name: "ARMS DISTINCT", ok: distinct, text: `the ${ARM_IDS.length} arms are pairwise different in the dark: ${distinct}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same}) ${p.reading}`;
export function report(au) {
    const L = [`ROUND H1: the 963-weight networks on the compass dropout. Ids ${au.range.from}-${au.range.to} (${au.range.to - au.range.from + 1}), ${au.seconds} s, dark and lit; read once`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const mean = (runs) => runs.reduce((s, r) => s + r.score, 0) / runs.length;
    L.push("means (dark / lit):");
    for (const a of ARM_IDS) L.push(`  ${a.padEnd(20)} ${mean(au.dark[a]).toFixed(4)} / ${mean(au.lit[a]).toFixed(4)}`);
    L.push(`hand minus autopilot, dark: ${fmt({ ...B.paired(au.dark["network-hand"], au.dark.autopilot), reading: B.readingOf(B.paired(au.dark["network-hand"], au.dark.autopilot)) })}`);
    for (const n of NETWORK_NAMES) {
        const r = readingsOf(au, n);
        L.push(`${n}:`, `   dark vs autopilot ${fmt(r.vsAuto)}`, `   dark vs hand      ${fmt(r.vsHand)}`, `   lit  vs autopilot ${fmt(r.litAuto)}`, `   dark-specific     ${fmt(r.specific)}`);
    }
    const gains = NETWORK_NAMES.map((n) => readingsOf(au, n).vsAuto.mean);
    L.push(`spread of the eight dark gains over the autopilot: ${sgn(Math.min(...gains))} to ${sgn(Math.max(...gains))}`);
    for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
