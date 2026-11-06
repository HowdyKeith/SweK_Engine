// WebGLEngine/tools/ship/plannerHeadroom.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerHeadroomCmd.mjs; the gate is tools/ship/plannerHeadroom-selfcheck.mjs)
//
// ROUND 25 of brain/NEEDS_AND_LIMITS.md ("how much headroom is left above the twin?", registered before this file existed): TUNED-R8, the twin planner and the hindsight oracle (stationRound.oracleRuns: every fixed order
// of all the stations, the best run kept) at 3, 4 and 5 stations (tools/ship/plannerStations.scenarioN), 192 fresh far-and-both dives per count (H1 4201-4248, H2 4301-4348): the oracle's headroom above the twin
// at each count and its growth from 3 to 5 stations. THE SEEDS ARE READ ONLY BY flyArm() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";
import { setN, scenarioN } from "./plannerStations.mjs";
import { oracleRuns } from "./stationRound.mjs";

export { HARD, pooled, readingOf };
export const SET_RANGES = Object.freeze({ H1: [4201, 4248], H2: [4301, 4348] }), SET_NAMES = Object.freeze(["H1", "H2"]);
export const COUNTS = Object.freeze([3, 4, 5]), LOW_N = 3, HIGH_N = 5, KINDS = Object.freeze(["TUNED-R8", "TWIN", "ORACLE"]);
export const ARMS = Object.freeze(COUNTS.flatMap((n) => KINDS.map((k) => `${k}@${n}`)));
/** The pilot kind and station count of an arm name. */
export function parseArm(arm) {
    const m = /^(TUNED-R8|TWIN|ORACLE)@(3|4|5)$/.exec(arm);
    if (!m) throw new Error(`plannerHeadroom.parseArm: unknown arm ${JSON.stringify(arm)}`);
    return { kind: m[1], n: Number(m[2]) };
}
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
export function flyArm(arm, r8, set) {
    const { kind } = parseArm(arm), sec = FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {};
    if (kind === "ORACLE") return oracleRuns(r8, set);
    const pilot = kind === "TUNED-R8" ? T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS)) : T.flyDecision(Q.perturbedSeat(r8, {}, sec));
    return T.evaluate(pilot, set, { gauge: T.GAUGE, ...FLIGHT });
}
export function flySets(arm, r8, { ranges = SET_RANGES, kinds = HARD } = {}) { const { n } = parseArm(arm); return Object.fromEntries(SET_NAMES.map((s) => [s, flyArm(arm, r8, setN(kinds, ranges[s][0], ranges[s][1], n))])); }
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((s) => [s, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][s]]))]));
const at = (au, a, b) => pooled(au, a, b, { sets: SET_NAMES });
/** The twin's gain over the tuned rule, the oracle's gap over it and the oracle's headroom above the twin at count n (pooled, with se), the share the twin closes, and the headroom's reading. */
export function countOf(au, n) {
    const gain = at(au, `TWIN@${n}`, `TUNED-R8@${n}`), gap = at(au, `ORACLE@${n}`, `TUNED-R8@${n}`), head = at(au, `ORACLE@${n}`, `TWIN@${n}`);
    return { n, gain, gap, head, share: gap.mean > 1e-9 ? gain.mean / gap.mean : null, real: readingOf(head).real };
}
/** Growth of the headroom from LOW_N to HIGH_N stations against the se of two independent means. */
export function growth(au) {
    const a = countOf(au, LOW_N).head, b = countOf(au, HIGH_N).head, mean = b.mean - a.mean, se = Math.sqrt(a.se * a.se + b.se * b.se);
    return { mean, se, verdict: mean > SE_FACTOR * se ? "GROWS" : mean < -SE_FACTOR * se ? "SHRINKS" : "FLAT" };
}
/** The dives (over all counts and sets) on which the twin scores above the oracle. */
export function twinBeatsOracle(au) {
    let c = 0, n = 0;
    for (const k of COUNTS) for (const s of SET_NAMES) au[s][`TWIN@${k}`].runs.forEach((r, i) => { n++; if (r.score > au[s][`ORACLE@${k}`].runs[i].score + 1e-9) c++; });
    return { count: c, of: n };
}
export function bottomLines(au) {
    const real = COUNTS.filter((n) => countOf(au, n).real), g = growth(au);
    return [
        real.length ? `THERE IS HEADROOM ABOVE THE TWIN AT N = ${real.join(", ")}` : "THERE IS NO MEASURABLE HEADROOM ABOVE THE TWIN",
        g.verdict === "GROWS" ? "THE HEADROOM GROWS WITH THE NUMBER OF STATIONS" : g.verdict === "SHRINKS" ? "THE HEADROOM SHRINKS WITH THE NUMBER OF STATIONS" : "THE HEADROOM IS FLAT IN THE NUMBER OF STATIONS",
    ];
}
export function checksOf(au) {
    const rows = [], sample = [[1, "far"], [2, "both"], [271, "far"], [3, "deep"], [6, "deep"]];
    const gen = sample.every(([s, k]) => JSON.stringify(scenarioN(s, k, 3)) === JSON.stringify(T.scenario(s, k)));
    rows.push({ name: "GENERATOR", ok: gen, text: `the generator at 3 stations equals needsTask.scenario on five sample scenarios: ${gen}` });
    for (const n of COUNTS) {
        const ok = SET_NAMES.every((s) => au[s][`ORACLE@${n}`].runs.every((r, i) => r.score >= au[s][`TUNED-R8@${n}`].runs[i].score - 1e-12));
        rows.push({ name: `ORACLE ${n}`, ok, text: `the oracle is at least TUNED-R8 on every dive at ${n} stations: ${ok}` });
    }
    for (const n of COUNTS) { const g = countOf(au, n).gain; rows.push({ name: `GAIN ${n}`, ok: g.mean > 0, text: `the twin's gain over the tuned rule at ${n} stations is positive (${g.mean.toFixed(4)}): ${g.mean > 0}` }); }
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 25: how much headroom above the twin? pooled over ${SET_NAMES.map((s) => `${s} ${SET_RANGES[s][0]}-${SET_RANGES[s][1]}`).join(", ")} (far and both, 3 to 5 stations; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const mean = (a) => SET_NAMES.reduce((s, x) => s + au[x][a].score, 0) / SET_NAMES.length;
    for (const n of COUNTS) {
        const c = countOf(au, n);
        L.push(`n ${n}: means (tuned | twin | oracle) ${mean(`TUNED-R8@${n}`).toFixed(3)} | ${mean(`TWIN@${n}`).toFixed(3)} | ${mean(`ORACLE@${n}`).toFixed(3)}`, `   gain (twin - tuned) ${fmt(c.gain)}`, `   gap (oracle - tuned) ${fmt(c.gap)}`, `   headroom (oracle - twin) ${fmt(c.head)}  ${c.real ? "REAL" : "not real"}; the twin closes ${c.share === null ? "n/a" : c.share.toFixed(2)} of the gap`);
    }
    const g = growth(au), t = twinBeatsOracle(au);
    L.push(`headroom growth from ${LOW_N} to ${HIGH_N} stations: ${g.mean >= 0 ? "+" : ""}${g.mean.toFixed(4)} (se of two independent means ${g.se.toFixed(4)}) ${g.verdict}`, `the twin scores above the oracle on ${t.count} of ${t.of} dives`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
