// WebGLEngine/tools/ship/plannerBudget.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerBudgetCmd.mjs; the gate is tools/ship/plannerBudget-selfcheck.mjs)
//
// ROUND 14 of brain/NEEDS_AND_LIMITS.md ("how much search does the twin need?", registered before this file existed): the twin planner (brain/plannerPerturbed.mjs, no model error) with its replan interval and its look-ahead cut,
// against TUNED-R8 and against the full twin, on 192 fresh far-and-both dives (W1 1221-1268, W2 1281-1328), with the simulated rollout seconds each arm spends as its cost. THE SEEDS ARE READ ONLY BY flyArm() ON THESE SETS.
// No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD, gapShare } from "./plannerReplicate.mjs";
import { oracleRuns } from "./stationRound.mjs";

export { HARD, gapShare, pooled, readingOf };
export const SET_RANGES = Object.freeze({ W1: [1221, 1268], W2: [1281, 1328] }), SET_NAMES = Object.freeze(["W1", "W2"]);
export const REPLANS = Object.freeze([30, 60, 240, 480]), LOOKS = Object.freeze([60, 120, 240, 360]);
export const SEARCH_ARMS = Object.freeze([...REPLANS.map((n) => `REPLAN-${n}`), ...LOOKS.map((n) => `LOOK-${n}`), "ONCE", "CHEAP-A", "CHEAP-B"]);
export const ARMS = Object.freeze(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL", ...SEARCH_ARMS, "ORACLE-ORDER"]);
/** The planning options an arm stands for ({} for the full twin; throws on a name that is not a twin arm). */
export function planOf(arm) {
    if (arm === "TWIN-FULL") return {};
    if (arm === "ONCE") return { replanS: Infinity };
    if (arm === "CHEAP-A") return { replanS: 240, horizon: 240 };
    if (arm === "CHEAP-B") return { replanS: 480, horizon: 120 };
    let m = /^REPLAN-(30|60|240|480)$/.exec(arm); if (m) return { replanS: Number(m[1]) };
    m = /^LOOK-(60|120|240|360)$/.exec(arm); if (m) return { horizon: Number(m[1]) };
    throw new Error(`plannerBudget.planOf: unknown arm ${JSON.stringify(arm)}`);
}
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
/** One arm on one set: the evaluate result, plus for a twin arm `cost` (mean scheduled rollout seconds per dive) and `plans` (mean plans per dive). */
export function flyArm(arm, r8, set) {
    if (arm === "ORACLE-ORDER") return oracleRuns(r8, set);
    if (arm === "TUNED-R8") return T.evaluate(T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS)), set, { gauge: T.GAUGE, ...FLIGHT });
    if (arm === "TWIN-ROUND11") return T.evaluate(T.flyDecision(P.plannerSeat(r8, { mode: "twin", ...(FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {}) })), set, { gauge: T.GAUGE, ...FLIGHT });
    const seats = [], plan = { ...planOf(arm), ...(FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {}) };
    const r = T.evaluate(T.flyDecision((c) => { const s = Q.perturbedSeat(r8, {}, plan)(c); seats.push(s); return s; }), set, { gauge: T.GAUGE, ...FLIGHT });
    const mean = (f) => (seats.length ? seats.reduce((a, s) => a + f(s.stats), 0) / seats.length : 0);
    return { ...r, cost: mean((s) => s.rolloutSeconds), plans: mean((s) => s.plans) };
}
export function flySets(arm, r8, { ranges = SET_RANGES, kinds = HARD } = {}) { return Object.fromEntries(SET_NAMES.map((n) => [n, flyArm(arm, r8, T.setOf(kinds, ranges[n][0], ranges[n][1]))])); }
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][n]]))]));
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/** Mean cost of an arm over both sets (each set weighs the same), or null for an arm with no cost. */
export const costOf = (au, arm) => (au[SET_NAMES[0]][arm].cost === undefined ? null : meanOf(SET_NAMES.map((n) => au[n][arm].cost)));
export const playsOf = (au, arm) => (au[SET_NAMES[0]][arm].plans === undefined ? null : meanOf(SET_NAMES.map((n) => au[n][arm].plans)));
/** KEEPS / LOSES / HURTS against TUNED-R8 and MATCHES / WORSE against TWIN-FULL, with the cost share of TWIN-FULL. */
export function verdictOf(au, arm) {
    const p = pooled(au, arm, "TUNED-R8", { sets: SET_NAMES }), r = readingOf(p), vs = pooled(au, arm, "TWIN-FULL", { sets: SET_NAMES });
    const full = costOf(au, "TWIN-FULL"), c = costOf(au, arm);
    return { arm, ...p, verdict: r.hurts ? "HURTS" : r.real ? "KEEPS" : "LOSES", match: vs.mean < 0 && -vs.mean > SE_FACTOR * vs.se ? "WORSE" : "MATCHES", vsFull: vs, cost: c, share: c === null || !full ? null : c / full };
}
export function bottomLine(au) {
    const keepers = SEARCH_ARMS.map((a) => verdictOf(au, a)).filter((v) => v.verdict === "KEEPS" && v.match === "MATCHES");
    if (!keepers.length) return "NO CHEAPER PLANNER KEEPS THE GAIN";
    const best = keepers.reduce((b, v) => (v.share < b.share - 1e-12 ? v : b));
    return `THE CHEAPEST PLANNER THAT KEEPS THE GAIN COSTS ${Math.round(best.share * 100)} PERCENT OF THE FULL ONE (${best.arm})`;
}
export function checksOf(au) {
    const rows = [];
    for (const n of SET_NAMES) {
        const x = au[n], same = x["TWIN-FULL"].runs.every((r, i) => r.fingerprint === x["TWIN-ROUND11"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `the full twin with the new options at their defaults equals the Round 11 twin dive for dive on ${n}: ${same}` });
        const atLeast = x["ORACLE-ORDER"].runs.every((r, i) => r.score >= x["TUNED-R8"].runs[i].score - 1e-12);
        rows.push({ name: `ORACLE ${n}`, ok: atLeast, text: `the oracle is at least TUNED-R8 on every dive of ${n}: ${atLeast}` });
    }
    const ex = readingOf(pooled(au, "TWIN-FULL", "TUNED-R8", { sets: SET_NAMES }));
    rows.push({ name: "FULL IS REAL", ok: ex.real, text: `TWIN-FULL is REAL on these seeds (else the sweep has no gain to keep): ${ex.real}` });
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 14: how much search does the twin need? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const full = pooled(au, "TWIN-FULL", "TUNED-R8", { sets: SET_NAMES });
    L.push(`TWIN-FULL minus TUNED-R8: ${fmt(full)}; cost ${Math.round(costOf(au, "TWIN-FULL"))} rollout seconds per dive, ${playsOf(au, "TWIN-FULL").toFixed(2)} plans`);
    for (const a of SEARCH_ARMS) {
        const v = verdictOf(au, a), share = full.mean > 1e-9 ? v.mean / full.mean : null;
        L.push(`  ${a.padEnd(9)} ${fmt(v)}  ${v.verdict.padEnd(5)} ${v.match.padEnd(7)} vs full ${v.vsFull.mean >= 0 ? "+" : ""}${v.vsFull.mean.toFixed(4)}  cost ${Math.round(v.cost)} (${Math.round(v.share * 100)}%), ${playsOf(au, a).toFixed(2)} plans  share of full gain ${share === null ? "n/a" : share.toFixed(2)}`);
    }
    L.push(`ORACLE-ORDER minus TUNED-R8 (reported, it sees the future and the noise): ${fmt(pooled(au, "ORACLE-ORDER", "TUNED-R8", { sets: SET_NAMES }))}`);
    L.push(`BOTTOM LINE: ${bad.length ? "NOT WEIGHED (a check failed)" : bottomLine(au)}`);
    return L;
}
