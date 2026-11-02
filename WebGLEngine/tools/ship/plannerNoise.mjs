// WebGLEngine/tools/ship/plannerNoise.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerNoiseCmd.mjs; the gate is tools/ship/plannerNoise-selfcheck.mjs)
//
// ROUND 15 of brain/NEEDS_AND_LIMITS.md ("how bad a gauge can the planner stand?", registered before this file existed, one amendment before any seed was flown): TUNED-R8 and the full twin flown at five gauge noise levels
// (sd 0, 0.05, 0.10, 0.20, 0.30) on 192 fresh far-and-both dives (U1 1341-1388, U2 1401-1448), the planner's gain read at each level and the tuned rule's loss against sd 0.10. THE SEEDS ARE READ ONLY BY flyArm() ON THESE SETS.
// No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, HARD, gapShare } from "./plannerReplicate.mjs";

export { HARD, gapShare, pooled, readingOf };
export const SET_RANGES = Object.freeze({ U1: [1341, 1388], U2: [1401, 1448] }), SET_NAMES = Object.freeze(["U1", "U2"]);
export const SDS = Object.freeze([0, 0.05, 0.1, 0.2, 0.3]), REFERENCE_SD = 0.1;
export const ARMS = Object.freeze([...SDS.flatMap((sd) => [`TUNED-R8@${sd}`, `TWIN-FULL@${sd}`]), "TWIN-ROUND11"]);
/** The pilot kind and gauge noise of an arm name: { kind, sd } (TWIN-ROUND11 is the Round 11 twin at the reference sd). */
export function parseArm(arm) {
    if (arm === "TWIN-ROUND11") return { kind: "TWIN-ROUND11", sd: REFERENCE_SD };
    const m = /^(TUNED-R8|TWIN-FULL)@(0|0\.05|0\.1|0\.2|0\.3)$/.exec(arm);
    if (!m) throw new Error(`plannerNoise.parseArm: unknown arm ${JSON.stringify(arm)}`);
    return { kind: m[1], sd: Number(m[2]) };
}
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
export function pilotOf(kind, r8) {
    if (kind === "TUNED-R8") return T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS));
    const sec = FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {};
    if (kind === "TWIN-ROUND11") return T.flyDecision(P.plannerSeat(r8, { mode: "twin", ...sec }));
    return T.flyDecision(Q.perturbedSeat(r8, {}, sec));
}
/** One arm on one set (`set` from T.setOf) with its gauge noise. */
export function flyArm(arm, r8, set) { const { kind, sd } = parseArm(arm); return T.evaluate(pilotOf(kind, r8), set, { ...FLIGHT, gauge: { sd, hz: T.GAUGE.hz } }); }
export function flySets(arm, r8, { ranges = SET_RANGES, kinds = HARD } = {}) { return Object.fromEntries(SET_NAMES.map((n) => [n, flyArm(arm, r8, T.setOf(kinds, ranges[n][0], ranges[n][1]))])); }
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][n]]))]));
const armName = (kind, sd) => `${kind}@${sd}`;
/** The planner's gain at one sd: twin minus tuned, pooled, with KEEPS / LOSES / HURTS. */
export function gainAt(au, sd) {
    const p = pooled(au, armName("TWIN-FULL", sd), armName("TUNED-R8", sd), { sets: SET_NAMES }), r = readingOf(p);
    return { sd, ...p, verdict: r.hurts ? "HURTS" : r.real ? "KEEPS" : "LOSES" };
}
/** The tuned rule at one sd minus the tuned rule at the reference sd, pooled; `hurtsByNoise` iff negative by more than 2 se. */
export function tunedLossAt(au, sd) {
    const p = pooled(au, armName("TUNED-R8", sd), armName("TUNED-R8", REFERENCE_SD), { sets: SET_NAMES }), r = readingOf(p);
    return { sd, ...p, hurtsByNoise: r.hurts };
}
const meanScore = (au, arm) => SET_NAMES.reduce((a, n) => a + au[n][arm].score, 0) / SET_NAMES.length;
/** The range of sd over which the gain keeps, chained outward from the reference: { low, high }. */
export function keepRange(au) {
    const keeps = (sd) => gainAt(au, sd).verdict === "KEEPS", ref = SDS.indexOf(REFERENCE_SD);
    let high = ref; while (high + 1 < SDS.length && keeps(SDS[high + 1])) high++;
    let low = ref; while (low - 1 >= 0 && keeps(SDS[low - 1])) low--;
    return { low: SDS[low], high: SDS[high] };
}
export function bottomLines(au) {
    const { low, high } = keepRange(au), noisy = tunedLossAt(au, SDS[SDS.length - 1]), clean = tunedLossAt(au, SDS[0]);
    const loss = clean.mean - noisy.mean;   // tuned at sd 0 minus tuned at sd 0.30, each already a difference from the reference
    return [
        `THE GAIN KEEPS FROM SD ${low} TO SD ${high}${low === SDS[0] && high === SDS[SDS.length - 1] ? " (NO LIMIT TESTED: EVERY LEVEL KEEPS IT)" : ""}`,
        `THE TUNED RULE LOSES ${loss.toFixed(3)} FROM SD 0 TO SD 0.30 (${loss < 0.05 ? "DEGRADES GRACEFULLY" : "DEGRADES BADLY"})`,
    ];
}
export function checksOf(au) {
    const rows = [];
    for (const n of SET_NAMES) {
        const x = au[n], same = x[armName("TWIN-FULL", REFERENCE_SD)].runs.every((r, i) => r.fingerprint === x["TWIN-ROUND11"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `the full twin at sd ${REFERENCE_SD} equals the Round 11 twin dive for dive on ${n}: ${same}` });
    }
    const ref = gainAt(au, REFERENCE_SD);
    rows.push({ name: "REFERENCE GAIN IS REAL", ok: ref.verdict === "KEEPS", text: `the gain at sd ${REFERENCE_SD} is REAL on these seeds (else the sweep has no reference): ${ref.verdict === "KEEPS"}` });
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 15: how bad a gauge can the planner stand? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means (tuned | twin) and crushed/stranded per level");
    for (const sd of SDS) {
        const t = armName("TUNED-R8", sd), w = armName("TWIN-FULL", sd);
        L.push(`  sd ${String(sd).padEnd(4)} ${meanScore(au, t).toFixed(3)} | ${meanScore(au, w).toFixed(3)}   crushed ${SET_NAMES.reduce((a, n) => a + au[n][t].crashed, 0)}/${SET_NAMES.reduce((a, n) => a + au[n][w].crashed, 0)}  stranded ${SET_NAMES.reduce((a, n) => a + au[n][t].stranded, 0)}/${SET_NAMES.reduce((a, n) => a + au[n][w].stranded, 0)}`);
    }
    L.push("planner gain (twin minus tuned) at each sd:");
    for (const sd of SDS) { const g = gainAt(au, sd); L.push(`  sd ${String(sd).padEnd(4)} ${fmt(g)}  ${g.verdict}`); }
    L.push("tuned rule against sd 0.10:");
    for (const sd of SDS) { const d = tunedLossAt(au, sd); L.push(`  sd ${String(sd).padEnd(4)} ${fmt(d)}${d.hurtsByNoise ? "  HURTS BY NOISE" : ""}`); }
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
