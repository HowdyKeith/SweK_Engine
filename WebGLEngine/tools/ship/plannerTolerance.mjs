// WebGLEngine/tools/ship/plannerTolerance.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerToleranceCmd.mjs; the gate is tools/ship/plannerTolerance-selfcheck.mjs)
//
// ROUND 13 of brain/NEEDS_AND_LIMITS.md ("how good must the twin's model of the boat be before its gain disappears?", registered before this file existed): the Round 11 twin planned with a WRONG model of the boat
// (brain/plannerPerturbed.mjs: drag, drain, charge and start-energy errors of 5, 10 and 20 percent, both signs, one at a time, plus two combined arms) against TUNED-R8 on 192 fresh far-and-both dives (V1 1101-1148,
// V2 1161-1208), each arm's gain read as the pooled paired difference (Round 12's reading), and the TOLERANCE of each parameter and sign read off. THE SEEDS ARE READ ONLY BY flyArm() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD, gapShare } from "./plannerReplicate.mjs";
import { oracleRuns } from "./stationRound.mjs";

export { HARD, gapShare, pooled, readingOf };
export const SET_RANGES = Object.freeze({ V1: [1101, 1148], V2: [1161, 1208] }), SET_NAMES = Object.freeze(["V1", "V2"]);
export const PARAMS = Object.freeze(["DRAG", "DRAIN", "CHARGE", "START"]), LEVELS = Object.freeze([5, 10, 20]), SIGNS = Object.freeze(["-", "+"]);
export const COMBINED_LEVELS = Object.freeze([10, 20]);
/** Optimistic signs: the boat is cheaper to run than the twin thinks (less drag, less drain, more charge, more energy at the start). */
export const OPTIMISTIC = Object.freeze({ drag: -1, drain: -1, charge: 1, start: 1 });
export const singleArms = () => PARAMS.flatMap((p) => SIGNS.flatMap((s) => LEVELS.map((l) => `${p}${s}${l}`)));
export const combinedArms = () => ["ALL-OPTIMISTIC", "ALL-PESSIMISTIC"].flatMap((n) => COMBINED_LEVELS.map((l) => `${n}-${l}`));
export const ARMS = Object.freeze(["TUNED-R8", "TWIN-ROUND11", "TWIN-EXACT", ...singleArms(), ...combinedArms(), "ORACLE-ORDER"]);
const key = (p) => p.toLowerCase();
/** The error an arm name stands for ({} for the non-perturbed arms; throws on an unknown name). */
export function errFor(arm) {
    if (arm === "TWIN-EXACT") return {};
    let m = /^(DRAG|DRAIN|CHARGE|START)([-+])(5|10|20)$/.exec(arm);
    if (m) return { [key(m[1])]: (m[2] === "-" ? -1 : 1) * Number(m[3]) / 100 };
    m = /^ALL-(OPTIMISTIC|PESSIMISTIC)-(10|20)$/.exec(arm);
    if (m) { const sg = m[1] === "OPTIMISTIC" ? 1 : -1, l = Number(m[2]) / 100; return Object.fromEntries(Q.KEYS.map((k) => [k, sg * OPTIMISTIC[k] * l])); }
    throw new Error(`plannerTolerance.errFor: unknown arm ${JSON.stringify(arm)}`);
}
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
/** The flyable pilot of one arm (not the oracle). */
export function pilotOf(arm, { r8 = null, seconds = FLIGHT.seconds } = {}) {
    if (!r8) throw new Error("plannerTolerance.pilotOf: the tuned rule's parameters (r8) are needed");
    if (arm === "TUNED-R8") return T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS));
    if (arm === "TWIN-ROUND11") return T.flyDecision(P.plannerSeat(r8, { mode: "twin", ...(seconds ? { seconds } : {}) }));
    return T.flyDecision(Q.perturbedSeat(r8, errFor(arm), seconds ? { seconds } : {}));
}
/** One arm on one set (`set` from T.setOf): the oracle too. */
export const flyArm = (arm, r8, set) => (arm === "ORACLE-ORDER" ? oracleRuns(r8, set) : T.evaluate(pilotOf(arm, { r8 }), set, { gauge: T.GAUGE, ...FLIGHT }));
/** The arm's flights on both sets: { V1: result, V2: result }. `ranges` and `kinds` are for the gate. */
export function flySets(arm, r8, { ranges = SET_RANGES, kinds = HARD } = {}) {
    return Object.fromEntries(SET_NAMES.map((n) => [n, flyArm(arm, r8, T.setOf(kinds, ranges[n][0], ranges[n][1]))]));
}
/** The assembled audit: { V1: { arm: result }, V2: { arm: result } } from { arm: { V1, V2 } }. */
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][n]]))]));

/** KEEPS iff the gain over TUNED-R8 is REAL (more than SE_FACTOR se and positive); HURTS iff negative by more than SE_FACTOR se; LOSES otherwise. */
export function verdictOf(au, arm) {
    const p = pooled(au, arm, "TUNED-R8", { sets: SET_NAMES }), r = readingOf(p);
    return { arm, ...p, verdict: r.hurts ? "HURTS" : r.real ? "KEEPS" : "LOSES" };
}
/** The tolerance of one parameter and sign: the largest level such that it and every smaller one KEEPS (0 if the smallest does not). */
export function toleranceOf(au, param, sign) {
    let t = 0;
    for (const l of LEVELS) { if (verdictOf(au, `${param}${sign}${l}`).verdict !== "KEEPS") break; t = l; }
    return t;
}
export function tolerances(au) { return PARAMS.flatMap((p) => SIGNS.map((s) => ({ param: p, sign: s, tolerance: toleranceOf(au, p, s) }))); }
export function bottomLine(au) {
    const singles = singleArms().map((a) => verdictOf(au, a)), hurt = singles.filter((v) => v.verdict === "HURTS").map((v) => v.arm);
    const tol = tolerances(au), w = Math.min(...tol.map((t) => t.tolerance)), weak = tol.filter((t) => t.tolerance === w).map((t) => `${t.param}${t.sign}`);
    const tail = hurt.length ? `; HURTS: ${hurt.join(", ")}` : "";
    if (singles.every((v) => v.verdict === "KEEPS")) return `THE GAIN SURVIVES 20 PERCENT ERROR IN EVERY PARAMETER${tail}`;
    if (w === 0) return `THE GAIN IS FRAGILE: IT FAILS AT 5 PERCENT ON ${weak.join(", ")}${tail}`;
    return `THE GAIN NEEDS THE MODEL WITHIN ${w} PERCENT (weakest: ${weak.join(", ")})${tail}`;
}
export function checksOf(au) {
    const rows = [];
    for (const n of SET_NAMES) {
        const x = au[n], same = x["TWIN-EXACT"].runs.every((r, i) => r.fingerprint === x["TWIN-ROUND11"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `the perturbed seat with no error equals the Round 11 twin dive for dive on ${n}: ${same}` });
        const atLeast = x["ORACLE-ORDER"].runs.every((r, i) => r.score >= x["TUNED-R8"].runs[i].score - 1e-12);
        rows.push({ name: `ORACLE ${n}`, ok: atLeast, text: `the oracle is at least TUNED-R8 on every dive of ${n}: ${atLeast}` });
    }
    const ex = readingOf(pooled(au, "TWIN-EXACT", "TUNED-R8", { sets: SET_NAMES }));
    rows.push({ name: "EXACT IS REAL", ok: ex.real, text: `TWIN-EXACT is REAL on these seeds (else the sweep has no gain to lose): ${ex.real}` });
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au, { plans = null } = {}) {
    const L = [`ROUND 13: how good must the twin's model be? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const exact = pooled(au, "TWIN-EXACT", "TUNED-R8", { sets: SET_NAMES });
    L.push(`TWIN-EXACT minus TUNED-R8: ${fmt(exact)}`);
    const row = (a) => { const v = verdictOf(au, a), share = exact.mean > 1e-9 ? v.mean / exact.mean : null; return `  ${a.padEnd(18)} ${fmt(v)}  ${v.verdict}  share of exact gain ${share === null ? "n/a" : share.toFixed(2)}`; };
    for (const p of PARAMS) for (const s of SIGNS) { L.push(`${p}${s}: tolerance ${toleranceOf(au, p, s)} percent`); for (const l of LEVELS) L.push(row(`${p}${s}${l}`)); }
    L.push("combined arms (reported, not in the bottom line):"); for (const a of combinedArms()) L.push(row(a));
    L.push(`ORACLE-ORDER minus TUNED-R8 (reported, it sees the future and the noise): ${fmt(pooled(au, "ORACLE-ORDER", "TUNED-R8", { sets: SET_NAMES }))}`);
    if (plans !== null) L.push(`replans per dive (weakest arm): ${plans.toFixed(2)}`);
    L.push(`BOTTOM LINE: ${bad.length ? "NOT WEIGHED (a check failed)" : bottomLine(au)}`);
    return L;
}
