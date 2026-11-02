// WebGLEngine/tools/ship/plannerEasy.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerEasyCmd.mjs; the gate is tools/ship/plannerEasy-selfcheck.mjs)
//
// ROUND 20 of brain/NEEDS_AND_LIMITS.md ("does the twin do harm on the easy kinds?", registered before this file existed): TUNED-R8 and the full twin on all four kinds of the survey task (plain, deep, far, both),
// 384 fresh dives per arm (R1 2201-2248, R2 2261-2308; 96 per kind), and a non-inferiority reading per kind: the lower bound of the pooled paired difference (mean minus 2 se) above -0.01. THE SEEDS ARE READ ONLY BY flyArm()
// ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, SE_FACTOR } from "./plannerReplicate.mjs";

export const SET_RANGES = Object.freeze({ R1: [2201, 2248], R2: [2261, 2308] }), SET_NAMES = Object.freeze(["R1", "R2"]);
export const KINDS = T.KINDS, EASY = Object.freeze(["plain", "deep"]), HARD_KINDS = Object.freeze(["far", "both"]);
export const MARGIN = 0.01;
export const ARMS = Object.freeze(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL"]);
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
export function flyArm(arm, r8, set) {
    const sec = FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {};
    const pilot = arm === "TUNED-R8" ? T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS)) : arm === "TWIN-ROUND11" ? T.flyDecision(P.plannerSeat(r8, { mode: "twin", ...sec })) : arm === "TWIN-FULL" ? T.flyDecision(Q.perturbedSeat(r8, {}, sec)) : null;
    if (!pilot) throw new Error(`plannerEasy.flyArm: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
    return T.evaluate(pilot, set, { gauge: T.GAUGE, ...FLIGHT });
}
export function flySets(arm, r8, { ranges = SET_RANGES, kinds = KINDS } = {}) { return Object.fromEntries(SET_NAMES.map((n) => [n, flyArm(arm, r8, T.setOf(kinds, ranges[n][0], ranges[n][1]))])); }
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][n]]))]));
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };
/** The pooled paired difference twin minus tuned over the given kinds (all sets): { n, mean, se, better, worse, same }. */
export function diffOver(au, kinds, a = "TWIN-FULL", b = "TUNED-R8") {
    const d = [];
    for (const n of SET_NAMES) au[n][a].runs.forEach((r, i) => { if (kinds.includes(r.kind)) d.push(r.score - au[n][b].runs[i].score); });
    return { n: d.length, mean: meanOf(d), se: seOf(d), better: d.filter((x) => x > 1e-9).length, worse: d.filter((x) => x < -1e-9).length, same: d.filter((x) => Math.abs(x) <= 1e-9).length };
}
/** HURTS iff negative by more than 2 se; NON-INFERIOR iff the lower bound (mean - 2 se) is above -MARGIN; UNDECIDED otherwise. */
export function verdictOf(p) {
    if (p.mean < 0 && -p.mean > SE_FACTOR * p.se) return "HURTS";
    return p.mean - SE_FACTOR * p.se > -MARGIN ? "NON-INFERIOR" : "UNDECIDED";
}
export function bottomLines(au) {
    const v = (kinds) => verdictOf(diffOver(au, kinds)), easy = EASY.map((k) => [k, v([k])]), hard = HARD_KINDS.map((k) => [k, v([k])]);
    const line = (rows, who, ok) => { const hurt = rows.filter(([, x]) => x === "HURTS").map(([k]) => k), und = rows.filter(([, x]) => x === "UNDECIDED").map(([k]) => k); return hurt.length ? `THE TWIN HURTS ON ${hurt.join(", ").toUpperCase()}` : und.length ? `THE TWIN IS NOT SHOWN HARMLESS ON ${und.join(", ").toUpperCase()}` : ok; };
    return [line(easy, "easy", "THE TWIN DOES NO HARM ON THE EASY KINDS"), line(hard, "hard", "THE TWIN DOES NO HARM ON THE HARD KINDS")];
}
export function checksOf(au) {
    const rows = [];
    for (const n of SET_NAMES) {
        const same = au[n]["TWIN-FULL"].runs.every((r, i) => r.fingerprint === au[n]["TWIN-ROUND11"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${n}`, ok: same, text: `the full twin equals the Round 11 twin dive for dive on ${n}: ${same}` });
    }
    const hv = verdictOf(diffOver(au, HARD_KINDS));
    rows.push({ name: "HARD KINDS NOT HURT", ok: hv !== "HURTS", text: `the twin does not HURT on far and both together on these seeds (else the twin is broken here): ${hv !== "HURTS"}` });
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 20: does the twin do harm on the easy kinds? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")}, all four kinds (read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push(`twin minus tuned per kind (non-inferior iff the lower bound, mean minus ${SE_FACTOR} se, is above -${MARGIN}):`);
    for (const k of KINDS) { const p = diffOver(au, [k]); L.push(`  ${k.padEnd(5)} ${fmt(p)}  lower bound ${(p.mean - SE_FACTOR * p.se).toFixed(4)}  ${verdictOf(p)}`); }
    for (const [name, kinds] of [["easy (plain and deep)", EASY], ["hard (far and both)", HARD_KINDS]]) { const p = diffOver(au, kinds); L.push(`  ${name.padEnd(22)} ${fmt(p)}  ${verdictOf(p)}`); }
    const mean = (a) => SET_NAMES.reduce((s, n) => s + au[n][a].score, 0) / SET_NAMES.length;
    L.push(`means (tuned | twin): ${mean("TUNED-R8").toFixed(3)} | ${mean("TWIN-FULL").toFixed(3)}; crushed ${SET_NAMES.reduce((s, n) => s + au[n]["TUNED-R8"].crashed, 0)}/${SET_NAMES.reduce((s, n) => s + au[n]["TWIN-FULL"].crashed, 0)}, stranded ${SET_NAMES.reduce((s, n) => s + au[n]["TUNED-R8"].stranded, 0)}/${SET_NAMES.reduce((s, n) => s + au[n]["TWIN-FULL"].stranded, 0)}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
