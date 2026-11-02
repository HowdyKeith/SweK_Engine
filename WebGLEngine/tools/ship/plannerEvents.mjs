// WebGLEngine/tools/ship/plannerEvents.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerEventsCmd.mjs; the gate is tools/ship/plannerEvents-selfcheck.mjs)
//
// ROUND 17 of brain/NEEDS_AND_LIMITS.md ("replan on events instead of the clock?", registered before this file existed): the twin planner replanning when the boat leaves the surface (the `onDive` option of
// brain/plannerPerturbed.mjs) against the clock schedules of Round 14 and against a plan made once, on 288 fresh far-and-both dives (S1 1601-1648, S2 1661-1708, S3 1721-1768), with the scheduled rollout seconds as the cost.
// THE SEEDS ARE READ ONLY BY flyArm() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD, gapShare } from "./plannerReplicate.mjs";

export { HARD, gapShare, pooled, readingOf };
export const SET_RANGES = Object.freeze({ S1: [1601, 1648], S2: [1661, 1708], S3: [1721, 1768] }), SET_NAMES = Object.freeze(["S1", "S2", "S3"]);
export const SEARCH_ARMS = Object.freeze(["REPLAN-30", "REPLAN-60", "ONCE", "EVENT", "EVENT-240"]);
export const ARMS = Object.freeze(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL", ...SEARCH_ARMS]);
/** The planning options an arm stands for ({} for the full twin; throws on a name that is not a twin arm). */
export function planOf(arm) {
    const table = { "TWIN-FULL": {}, "REPLAN-30": { replanS: 30 }, "REPLAN-60": { replanS: 60 }, "ONCE": { replanS: Infinity }, "EVENT": { replanS: Infinity, onDive: true }, "EVENT-240": { replanS: 240, onDive: true } };
    if (!Object.prototype.hasOwnProperty.call(table, arm)) throw new Error(`plannerEvents.planOf: unknown arm ${JSON.stringify(arm)}`);
    return table[arm];
}
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
/** One arm on one set: the evaluate result, plus for a twin arm `cost` (mean scheduled rollout seconds per dive) and `plans` (mean plans per dive). */
export function flyArm(arm, r8, set) {
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
export const costOf = (au, arm) => (au[SET_NAMES[0]][arm].cost === undefined ? null : meanOf(SET_NAMES.map((n) => au[n][arm].cost)));
export const playsOf = (au, arm) => (au[SET_NAMES[0]][arm].plans === undefined ? null : meanOf(SET_NAMES.map((n) => au[n][arm].plans)));
/** KEEPS / LOSES / HURTS against TUNED-R8, MATCHES / WORSE against TWIN-FULL, and the cost share of TWIN-FULL. */
export function verdictOf(au, arm) {
    const p = pooled(au, arm, "TUNED-R8", { sets: SET_NAMES }), r = readingOf(p), vs = pooled(au, arm, "TWIN-FULL", { sets: SET_NAMES });
    const full = costOf(au, "TWIN-FULL"), c = costOf(au, arm);
    return { arm, ...p, verdict: r.hurts ? "HURTS" : r.real ? "KEEPS" : "LOSES", match: vs.mean < 0 && -vs.mean > SE_FACTOR * vs.se ? "WORSE" : "MATCHES", vsFull: vs, cost: c, share: c === null || !full ? null : c / full };
}
/** The better (higher pooled gain over TUNED-R8) of the two event arms; the first on a tie. */
export function betterEvent(au) {
    const a = verdictOf(au, "EVENT"), b = verdictOf(au, "EVENT-240");
    return b.mean > a.mean + 1e-12 ? b : a;
}
export function bottomLines(au) {
    const add = readingOf(pooled(au, "EVENT", "ONCE", { sets: SET_NAMES })).real, e = betterEvent(au);
    return [
        add ? "EVENTS ADD TO A PLAN MADE ONCE" : "EVENTS DO NOT ADD TO A PLAN MADE ONCE",
        e.verdict === "KEEPS" && e.match === "MATCHES" && e.share < 1 ? `EVENTS MATCH THE CLOCK AT ${Math.round(e.share * 100)} PERCENT OF ITS COST (${e.arm})` : "EVENTS DO NOT MATCH THE CLOCK",
    ];
}
export function checksOf(au) {
    const rows = [];
    for (const n of SET_NAMES) {
        const same = au[n]["TWIN-FULL"].runs.every((r, i) => r.fingerprint === au[n]["TWIN-ROUND11"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `the full twin with the new option off equals the Round 11 twin dive for dive on ${n}: ${same}` });
    }
    const ex = readingOf(pooled(au, "TWIN-FULL", "TUNED-R8", { sets: SET_NAMES }));
    rows.push({ name: "FULL IS REAL", ok: ex.real, text: `TWIN-FULL is REAL on these seeds (else the sweep has no gain to compare with): ${ex.real}` });
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 17: replan on events instead of the clock? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const full = pooled(au, "TWIN-FULL", "TUNED-R8", { sets: SET_NAMES });
    L.push(`TWIN-FULL minus TUNED-R8: ${fmt(full)}; cost ${Math.round(costOf(au, "TWIN-FULL"))} rollout seconds per dive, ${playsOf(au, "TWIN-FULL").toFixed(2)} plans`);
    for (const a of SEARCH_ARMS) {
        const v = verdictOf(au, a), share = full.mean > 1e-9 ? v.mean / full.mean : null;
        L.push(`  ${a.padEnd(9)} ${fmt(v)}  ${v.verdict.padEnd(5)} ${v.match.padEnd(7)} vs full ${v.vsFull.mean >= 0 ? "+" : ""}${v.vsFull.mean.toFixed(4)}  cost ${Math.round(v.cost)} (${Math.round(v.share * 100)}%), ${playsOf(au, a).toFixed(2)} plans  share of full gain ${share === null ? "n/a" : share.toFixed(2)}`);
    }
    L.push(`EVENT minus ONCE: ${fmt(pooled(au, "EVENT", "ONCE", { sets: SET_NAMES }))}`, `EVENT-240 minus REPLAN-60: ${fmt(pooled(au, "EVENT-240", "REPLAN-60", { sets: SET_NAMES }))}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
