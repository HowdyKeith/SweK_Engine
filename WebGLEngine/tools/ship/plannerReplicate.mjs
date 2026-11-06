// WebGLEngine/tools/ship/plannerReplicate.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerReplicateCmd.mjs; the gate is tools/ship/plannerReplicate-selfcheck.mjs)
//
// ROUND 12 of brain/NEEDS_AND_LIMITS.md ("does the twin's gain replicate?", registered before this file existed): the Round 11 twin and TUNED-R8 flown on 288 fresh far-and-both dives (881-1048), and the one registered verdict read from the POOLED paired difference:
// REAL iff it exceeds 2 standard errors, PRACTICAL iff it is at least 0.02. THE SEEDS ARE READ ONLY BY audits(). No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import { pilotOf, HARD, gapShare, plansOf } from "./plannerRound.mjs";
import { oracleRuns } from "./stationRound.mjs";

export { HARD, gapShare, plansOf };
export const SET_RANGES = Object.freeze({ Z1: [881, 928], Z2: [941, 988], Z3: [1001, 1048] }), SET_NAMES = Object.freeze(["Z1", "Z2", "Z3"]);
export const ARMS = Object.freeze(["TUNED-R8", "PLANNER-NEAREST", "PLANNER-TWIN", "ORACLE-ORDER"]);
export const PRACTICAL_FLOOR = 0.02, SE_FACTOR = 2;
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };

/** EVERY arm once on the three sets; `ranges` and `kinds` are for the gate. */
export function audits(opts, { ranges = SET_RANGES, kinds = HARD } = {}) {
    const out = {};
    for (const n of SET_NAMES) {
        const set = T.setOf(kinds, ranges[n][0], ranges[n][1]);
        out[n] = Object.fromEntries(ARMS.filter((a) => a !== "ORACLE-ORDER").map((a) => [a, T.evaluate(pilotOf(a, { r8: opts.r8, seconds: FLIGHT.seconds }), set, { gauge: T.GAUGE, ...FLIGHT })]));
        out[n]["ORACLE-ORDER"] = oracleRuns(opts.r8, set);
    }
    return out;
}
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };
/** The pooled paired difference a - b over the given sets (and optionally one kind): { n, mean, se, better, worse, same }. */
export function pooled(au, a, b, { sets = SET_NAMES, kind = null } = {}) {
    const d = [];
    for (const n of sets) au[n][a].runs.forEach((r, i) => { if (!kind || r.kind === kind) d.push(r.score - au[n][b].runs[i].score); });
    return { n: d.length, mean: meanOf(d), se: seOf(d), better: d.filter((x) => x > 1e-9).length, worse: d.filter((x) => x < -1e-9).length, same: d.filter((x) => Math.abs(x) <= 1e-9).length };
}
/** The registered reading of one pooled difference: real (mean > SE_FACTOR x se and positive), practical (mean >= PRACTICAL_FLOOR), hurts (mean < -SE_FACTOR x se). */
export const readingOf = (p) => ({ real: p.mean > 0 && p.mean > SE_FACTOR * p.se, practical: p.mean >= PRACTICAL_FLOOR, hurts: p.mean < 0 && -p.mean > SE_FACTOR * p.se });
export function bottomLine(r) {
    if (r.hurts) return "THE TWIN HURTS";
    if (!r.real) return "THE TWIN'S GAIN DOES NOT REPLICATE";
    return r.practical ? "THE TWIN'S GAIN REPLICATES AND IS PRACTICAL" : "THE TWIN'S GAIN REPLICATES BUT IS BELOW THE 0.02 FLOOR";
}
export function checksOf(au) {
    const rows = [];
    for (const n of SET_NAMES) {
        const x = au[n], same = x["PLANNER-NEAREST"].runs.every((r, i) => r.fingerprint === x["TUNED-R8"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `PLANNER-NEAREST equals TUNED-R8 dive for dive on ${n}: ${same}` });
        const atLeast = x["ORACLE-ORDER"].runs.every((r, i) => r.score >= x["TUNED-R8"].runs[i].score - 1e-12);
        rows.push({ name: `ORACLE ${n}`, ok: atLeast, text: `the oracle is at least TUNED-R8 on every dive of ${n}: ${atLeast}` });
    }
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}, n ${p.n}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au, { plans = null } = {}) {
    const L = [`ROUND 12: does the twin's gain replicate? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means " + SET_NAMES.join(" | "));
    for (const arm of ARMS) L.push(`  ${arm.padEnd(16)} ${SET_NAMES.map((n) => au[n][arm].score.toFixed(3)).join(" | ")}   crushed ${SET_NAMES.map((n) => au[n][arm].crashed).join("/")}  stranded ${SET_NAMES.map((n) => au[n][arm].stranded).join("/")}`);
    const all = pooled(au, "PLANNER-TWIN", "TUNED-R8"), rd = readingOf(all);
    L.push(`POOLED twin minus TUNED-R8: ${fmt(all)}`, `  real (> ${SE_FACTOR} se): ${rd.real}; practical (>= ${PRACTICAL_FLOOR}): ${rd.practical}`);
    for (const k of HARD) L.push(`  ${k}: ${fmt(pooled(au, "PLANNER-TWIN", "TUNED-R8", { kind: k }))}`);
    for (const n of SET_NAMES) L.push(`  ${n}: ${fmt(pooled(au, "PLANNER-TWIN", "TUNED-R8", { sets: [n] }))}`);
    L.push(`ORACLE-ORDER minus TUNED-R8 (reported, it sees the future and the noise): ${fmt(pooled(au, "ORACLE-ORDER", "TUNED-R8"))}`);
    const gap = pooled(au, "ORACLE-ORDER", "TUNED-R8").mean, share = gapShare(all.mean, 0, gap);
    L.push(`share of the oracle gap closed by the twin: ${share === null ? "n/a" : share.toFixed(2)}`);
    if (plans !== null) L.push(`replans per dive (twin): ${plans.toFixed(2)}`);
    L.push(`BOTTOM LINE: ${bad.length ? "NOT WEIGHED (a check failed)" : bottomLine(rd)}`);
    return L;
}
