// WebGLEngine/tools/ship/plannerStations.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerStationsCmd.mjs; the gate is tools/ship/plannerStations-selfcheck.mjs)
//
// ROUND 16 of brain/NEEDS_AND_LIMITS.md ("does the gain grow with the number of stations?", registered before this file existed): TUNED-R8 and the full twin flown on survey tasks with 3, 4, 5 and 6 stations
// (an own copy of needsTask.scenario with the station count a parameter; the shipped task is not edited), 192 fresh far-and-both dives per count (T1 1461-1508, T2 1521-1568), the gain read at each count and the growth from
// 3 to 6 stations read against the standard error of two independent means. THE SEEDS ARE READ ONLY BY flyArm() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as N from "../../physics/mechanics/subNeeds.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD, gapShare } from "./plannerReplicate.mjs";

export { HARD, gapShare, pooled, readingOf };
export const SET_RANGES = Object.freeze({ T1: [1461, 1508], T2: [1521, 1568] }), SET_NAMES = Object.freeze(["T1", "T2"]);
export const COUNTS = Object.freeze([3, 4, 5, 6]), REFERENCE_N = 3, TOP_N = 6;
export const ARMS = Object.freeze([...COUNTS.flatMap((n) => [`TUNED-R8@${n}`, `TWIN-FULL@${n}`]), "TWIN-ROUND11"]);
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** needsTask.scenario with `count` stations. At count 3 it IS needsTask.scenario (the gate and the round's checks compare them). */
export function scenarioN(seed, kind, count) {
    if (!T.KINDS.includes(kind)) throw new Error(`plannerStations.scenarioN: unknown kind "${kind}" (${T.KINDS.join(", ")})`);
    if (!Number.isInteger(count) || count < 1) throw new Error(`plannerStations.scenarioN: the station count must be a positive integer, got ${count}`);
    const r = mulberry((seed * 7919 + T.KINDS.indexOf(kind) * 104729 + 211) >>> 0), u = (lo, hi) => lo + (hi - lo) * r();
    const deepKind = kind === "deep" || kind === "both", farKind = kind === "far" || kind === "both";
    const damage0 = deepKind ? u(0.2, 0.5) : 0, frac0 = kind === "plain" ? 1 : kind === "deep" ? u(0.7, 1) : kind === "far" ? u(0.4, 0.65) : u(0.45, 0.7);
    const stations = [], a0 = u(0, 6.28);
    for (let i = 0; i < count; i++) {
        const ang = a0 + i * 2.1 + u(-0.4, 0.4), rad = farKind ? u(120, 200) : u(40, 90);
        const cd = N.collapseDepth(T.model(), damage0, T.CRUSH), d0 = deepKind ? u(0.5, 0.9) * T.CRUSH : u(10, 30), depth = i === 0 ? Math.min(d0, 0.85 * cd + T.CAPTURE.depth - 1) : d0;
        stations.push(Object.freeze({ x: rad * Math.cos(ang), y: -rad * Math.sin(ang), depth, unreachable: depth - T.CAPTURE.depth > T.HULL_DEPTH * cd }));
    }
    return Object.freeze({ seed, kind, depth0: u(10, 20), damage0, frac0, stations: Object.freeze(stations) });
}
/** The set of far-and-both (or `kinds`) scenarios of seeds a..b with `count` stations, in the order of needsTask.setOf. */
export const setN = (kinds, a, b, count) => Object.freeze(kinds.flatMap((k) => Array.from({ length: b - a + 1 }, (_, i) => scenarioN(a + i, k, count))));
/** The pilot kind and station count of an arm name. */
export function parseArm(arm) {
    if (arm === "TWIN-ROUND11") return { kind: "TWIN-ROUND11", n: REFERENCE_N };
    const m = /^(TUNED-R8|TWIN-FULL)@(3|4|5|6)$/.exec(arm);
    if (!m) throw new Error(`plannerStations.parseArm: unknown arm ${JSON.stringify(arm)}`);
    return { kind: m[1], n: Number(m[2]) };
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
export function flyArm(arm, r8, set) { const { kind } = parseArm(arm); return T.evaluate(pilotOf(kind, r8), set, { gauge: T.GAUGE, ...FLIGHT }); }
export function flySets(arm, r8, { ranges = SET_RANGES, kinds = HARD } = {}) { const { n } = parseArm(arm); return Object.fromEntries(SET_NAMES.map((s) => [s, flyArm(arm, r8, setN(kinds, ranges[s][0], ranges[s][1], n))])); }
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((s) => [s, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][s]]))]));
/** The twin's gain at one count: twin minus tuned, pooled, KEEPS / LOSES / HURTS. */
export function gainAt(au, n) {
    const p = pooled(au, `TWIN-FULL@${n}`, `TUNED-R8@${n}`, { sets: SET_NAMES }), r = readingOf(p);
    return { ...p, count: n, verdict: r.hurts ? "HURTS" : r.real ? "KEEPS" : "LOSES" };
}
/** Growth of the gain from the reference count to the top count, with the standard error of two independent means. */
export function growth(au) {
    const a = gainAt(au, REFERENCE_N), b = gainAt(au, TOP_N), mean = b.mean - a.mean, se = Math.sqrt(a.se * a.se + b.se * b.se);
    return { mean, se, verdict: mean > SE_FACTOR * se ? "GROWS" : mean < -SE_FACTOR * se ? "SHRINKS" : "FLAT" };
}
const meanScore = (au, arm) => SET_NAMES.reduce((a, s) => a + au[s][arm].score, 0) / SET_NAMES.length;
export function bottomLines(au) {
    const g = growth(au), keeps = COUNTS.filter((n) => gainAt(au, n).verdict === "KEEPS");
    return [
        g.verdict === "GROWS" ? "THE GAIN GROWS WITH THE NUMBER OF STATIONS" : g.verdict === "SHRINKS" ? "THE GAIN SHRINKS WITH THE NUMBER OF STATIONS" : "THE GAIN IS FLAT IN THE NUMBER OF STATIONS",
        `THE GAIN KEEPS AT N = ${keeps.length ? keeps.join(", ") : "NONE"}`,
    ];
}
export function checksOf(au, { gen = scenarioN } = {}) {
    const rows = [], sample = [[1, "far"], [2, "both"], [7, "plain"], [9, "deep"], [271, "far"], [33, "both"], [3, "deep"], [6, "deep"]];
    const same = sample.every(([s, k]) => JSON.stringify(gen(s, k, 3)) === JSON.stringify(T.scenario(s, k)));
    rows.push({ name: "GENERATOR", ok: same, text: `the generator at 3 stations equals needsTask.scenario on eight sample scenarios (two of them deep ones where the first station's reach clip binds): ${same}` });
    for (const s of SET_NAMES) {
        const x = au[s], id = x["TWIN-FULL@3"].runs.every((r, i) => r.fingerprint === x["TWIN-ROUND11"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${s}`, ok: id, text: `the full twin at 3 stations equals the Round 11 twin dive for dive on ${s}: ${id}` });
    }
    const ref = gainAt(au, REFERENCE_N);
    rows.push({ name: "REFERENCE GAIN IS REAL", ok: ref.verdict === "KEEPS", text: `the gain at ${REFERENCE_N} stations is REAL on these seeds (else the sweep has no reference): ${ref.verdict === "KEEPS"}` });
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 16: does the gain grow with the number of stations? pooled over ${SET_NAMES.map((s) => `${s} ${SET_RANGES[s][0]}-${SET_RANGES[s][1]}`).join(", ")} (far and both; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("means (tuned | twin) and crushed/stranded per station count");
    for (const n of COUNTS) {
        const t = `TUNED-R8@${n}`, w = `TWIN-FULL@${n}`;
        L.push(`  n ${n}  ${meanScore(au, t).toFixed(3)} | ${meanScore(au, w).toFixed(3)}   crushed ${SET_NAMES.reduce((a, s) => a + au[s][t].crashed, 0)}/${SET_NAMES.reduce((a, s) => a + au[s][w].crashed, 0)}  stranded ${SET_NAMES.reduce((a, s) => a + au[s][t].stranded, 0)}/${SET_NAMES.reduce((a, s) => a + au[s][w].stranded, 0)}`);
    }
    L.push("twin gain over the tuned rule at each station count:");
    for (const n of COUNTS) { const g = gainAt(au, n); L.push(`  n ${n}  ${fmt(g)}  ${g.verdict}`); }
    const gr = growth(au);
    L.push(`growth of the gain from n = ${REFERENCE_N} to n = ${TOP_N}: ${gr.mean >= 0 ? "+" : ""}${gr.mean.toFixed(4)} (se of two independent means ${gr.se.toFixed(4)}) ${gr.verdict}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
