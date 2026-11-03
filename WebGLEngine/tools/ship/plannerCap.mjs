// WebGLEngine/tools/ship/plannerCap.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerCapCmd.mjs; the gate is tools/ship/plannerCap-selfcheck.mjs)
//
// ROUND 24 of brain/NEEDS_AND_LIMITS.md ("does the four-station cap cost anything at five stations?", registered before this file existed): the twin planner enumerating the orders of at most 2, 3, 4 (the shipped cap)
// or 5 nearest open stations (the `maxStations` option of brain/plannerPerturbed.mjs) on five-station scenarios (tools/ship/plannerStations.scenarioN), 384 fresh far-and-both dives (M1 3901-3996, M2 4001-4096).
// THE SEEDS ARE READ ONLY BY flyArm() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";
import { setN } from "./plannerStations.mjs";

export { HARD, pooled, readingOf };
export const SET_RANGES = Object.freeze({ M1: [3901, 3996], M2: [4001, 4096] }), SET_NAMES = Object.freeze(["M1", "M2"]), STATIONS = 5;
export const CAP_ARMS = Object.freeze(["CAP-2", "CAP-3", "CAP-4", "CAP-5"]), SMALLER = Object.freeze(["CAP-2", "CAP-3"]);
export const ARMS = Object.freeze(["TUNED-R8", "TWIN-FULL", ...CAP_ARMS]);
/** The planning options an arm stands for ({} for the default planner, which is cap 4; throws on a name that is not a twin arm). */
export function planOf(arm) {
    const table = { "TWIN-FULL": {}, "CAP-2": { maxStations: 2 }, "CAP-3": { maxStations: 3 }, "CAP-4": { maxStations: 4 }, "CAP-5": { maxStations: 5 } };
    if (!Object.prototype.hasOwnProperty.call(table, arm)) throw new Error(`plannerCap.planOf: unknown arm ${JSON.stringify(arm)}`);
    return table[arm];
}
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
/** One arm on one set: the evaluate result, plus for a twin arm `cost` (mean scheduled rollout seconds per dive) and `plans`. */
export function flyArm(arm, r8, set) {
    if (arm === "TUNED-R8") return T.evaluate(T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS)), set, { gauge: T.GAUGE, ...FLIGHT });
    const seats = [], plan = { ...planOf(arm), ...(FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {}) };
    const r = T.evaluate(T.flyDecision((c) => { const s = Q.perturbedSeat(r8, {}, plan)(c); seats.push(s); return s; }), set, { gauge: T.GAUGE, ...FLIGHT });
    const mean = (f) => (seats.length ? seats.reduce((a, s) => a + f(s.stats), 0) / seats.length : 0);
    return { ...r, cost: mean((s) => s.rolloutSeconds), plans: mean((s) => s.plans) };
}
/** One arm on one kind of one set: the half of flySets' result a worker flies (the dives of a set are independent, so the halves put back together are the set). */
export function flyChunk(arm, r8, set, kind, { ranges = SET_RANGES, count = STATIONS } = {}) {
    if (!ranges[set]) throw new Error(`plannerCap.flyChunk: unknown set ${JSON.stringify(set)} (${Object.keys(ranges).join(", ")})`);
    return flyArm(arm, r8, setN([kind], ranges[set][0], ranges[set][1], count));
}
/** The parts of one set in kind order [far, both] put back together exactly as flySets would have returned them: the runs in order, the means weighted by dives. */
export function mergeKinds(parts) {
    const runs = parts.flatMap((p) => p.runs), n = runs.length, w = (f) => parts.reduce((a, p) => a + f(p) * p.runs.length, 0) / n;
    const out = { score: w((p) => p.score), runs, crashed: parts.reduce((a, p) => a + p.crashed, 0), stranded: parts.reduce((a, p) => a + p.stranded, 0), byKind: Object.assign({}, ...parts.map((p) => p.byKind)) };
    if (parts[0].cost !== undefined) { out.cost = w((p) => p.cost); out.plans = w((p) => p.plans); }
    return out;
}
export function flySets(arm, r8, { ranges = SET_RANGES, kinds = HARD, count = STATIONS } = {}) { return Object.fromEntries(SET_NAMES.map((n) => [n, flyArm(arm, r8, setN(kinds, ranges[n][0], ranges[n][1], count))])); }
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][n]]))]));
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const costOf = (au, arm) => (au[SET_NAMES[0]][arm].cost === undefined ? null : meanOf(SET_NAMES.map((n) => au[n][arm].cost)));
/** KEEPS / LOSES / HURTS against TUNED-R8 and BETTER / SAME / WORSE against CAP-4, the shipped cap (real = above 2 se). */
export function verdictOf(au, arm) {
    const p = pooled(au, arm, "TUNED-R8", { sets: SET_NAMES }), r = readingOf(p), vs = pooled(au, arm, "CAP-4", { sets: SET_NAMES });
    return { arm, ...p, verdict: r.hurts ? "HURTS" : r.real ? "KEEPS" : "LOSES", rel: vs.mean > 0 && vs.mean > SE_FACTOR * vs.se ? "BETTER" : vs.mean < 0 && -vs.mean > SE_FACTOR * vs.se ? "WORSE" : "SAME", vsFull: vs, cost: costOf(au, arm) };
}
export function bottomLines(au) {
    const bigger = verdictOf(au, "CAP-5"), worse = SMALLER.filter((a) => verdictOf(au, a).rel === "WORSE");
    return [
        bigger.rel === "BETTER" ? "A LARGER CAP BEATS THE FOUR-STATION CAP" : "THE FOUR-STATION CAP COSTS NOTHING MEASURABLE AT FIVE STATIONS",
        worse.length ? `A SMALLER CAP LOSES GAIN (${worse.join(", ")})` : "A SMALLER CAP KEEPS THE GAIN",
    ];
}
export function checksOf(au) {
    const rows = [];
    for (const n of SET_NAMES) {
        const same = au[n]["CAP-4"].runs.every((r, i) => r.fingerprint === au[n]["TWIN-FULL"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `CAP-4 equals the default planner (TWIN-FULL) dive for dive on ${n}: ${same}` });
    }
    const ex = readingOf(pooled(au, "TWIN-FULL", "TUNED-R8", { sets: SET_NAMES }));
    rows.push({ name: "FULL IS REAL", ok: ex.real, text: `TWIN-FULL is REAL on these seeds (else there is no gain to cap): ${ex.real}` });
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 24: does the four-station cap cost anything at five stations? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both, ${STATIONS} stations; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const full = pooled(au, "TWIN-FULL", "TUNED-R8", { sets: SET_NAMES });
    L.push(`TWIN-FULL minus TUNED-R8: ${fmt(full)}; cost ${Math.round(costOf(au, "TWIN-FULL"))} rollout seconds per dive`);
    for (const a of CAP_ARMS) { const v = verdictOf(au, a); L.push(`  ${a.padEnd(6)} ${fmt(v)}  ${v.verdict.padEnd(5)} ${v.rel.padEnd(6)} vs CAP-4 ${v.vsFull.mean >= 0 ? "+" : ""}${v.vsFull.mean.toFixed(4)} (se ${v.vsFull.se.toFixed(4)})  cost ${Math.round(v.cost)}`); }
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
