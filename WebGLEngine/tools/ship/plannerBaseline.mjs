// WebGLEngine/tools/ship/plannerBaseline.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerBaselineCmd.mjs; the gate is tools/ship/plannerBaseline-selfcheck.mjs)
//
// ROUND 26 of brain/NEEDS_AND_LIMITS.md ("does the twin's gain survive a better baseline?", registered before this file existed): the tuned rule TUNED-R8, the same rule with its low trip point
// moved down by 0.04 (TUNED-LOW, Round 18's LOW-0.04), the full twin on the Round 8 constants (TWIN-R8) and the full twin built on the shifted constants (TWIN-LOW), flown on 600 fresh far-and-both
// dives in three blocks of 200 (G1 4401-4500, G2 4501-4600, G3 4601-4700, 100 seeds of each kind a block). Three verdict lines: is the lower trip point a better baseline, does the twin still gain
// over it, does the twin on the better constants beat the twin on Round 8's. THE SEEDS ARE READ ONLY BY flyBlock() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";

export { HARD, pooled, readingOf };
export const SET_RANGES = Object.freeze({ G1: [4401, 4500], G2: [4501, 4600], G3: [4601, 4700] }), SET_NAMES = Object.freeze(["G1", "G2", "G3"]);
export const ARMS = Object.freeze(["TUNED-R8", "TUNED-LOW", "TWIN-R8", "TWIN-LOW", "TWIN-ROUND11"]), SHIFT = 0.04, BLOCK_DIVES = 200;
/** The jobs of the run: every arm on every block, except the identity arm TWIN-ROUND11, which is flown on the first block only. */
export const JOBS = Object.freeze(ARMS.flatMap((a) => SET_NAMES.filter((b) => a !== "TWIN-ROUND11" || b === SET_NAMES[0]).map((b) => [a, b])));
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
/** The tuned rule's parameters after the arm's shift: the Round 8 constants, with `low` moved down by SHIFT for the LOW arms. */
export const paramsOf = (arm, r8) => (/LOW$/.test(arm) ? { ...r8, low: r8.low - SHIFT } : r8);
export function flyArm(arm, r8, set) {
    if (!ARMS.includes(arm)) throw new Error(`plannerBaseline.flyArm: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
    const sec = FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {}, p = paramsOf(arm, r8);
    const pilot = arm.startsWith("TUNED") ? T.flyDecision(U.tunedSeat(p, U.WIDE_BOUNDS)) : arm === "TWIN-ROUND11" ? T.flyDecision(P.plannerSeat(p, { mode: "twin", ...sec })) : T.flyDecision(Q.perturbedSeat(p, {}, sec));
    return T.evaluate(pilot, set, { gauge: T.GAUGE, ...FLIGHT });
}
/** One arm on one block: the 200 (far-and-both) dives of the block's seeds. `ranges` and `kinds` are for the gate. */
export function flyBlock(arm, r8, block, { ranges = SET_RANGES, kinds = HARD } = {}) {
    if (!ranges[block]) throw new Error(`plannerBaseline.flyBlock: unknown block ${JSON.stringify(block)} (${Object.keys(ranges).join(", ")})`);
    return flyArm(arm, r8, T.setOf(kinds, ranges[block][0], ranges[block][1]));
}
/** The assembled audit { G1: { arm: result }, ... } from { arm: { G1: result, ... } } (an arm without a block simply has none there). */
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).filter((a) => byArm[a][n]).map((a) => [a, byArm[a][n]]))]));
const diff = (au, a, b) => pooled(au, a, b, { sets: SET_NAMES });
/** The four pooled differences the verdicts read. */
export const differences = (au) => ({ low: diff(au, "TUNED-LOW", "TUNED-R8"), overLow: diff(au, "TWIN-LOW", "TUNED-LOW"), overR8: diff(au, "TWIN-R8", "TUNED-R8"), twins: diff(au, "TWIN-LOW", "TWIN-R8") });
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
export function bottomLines(au) {
    const d = differences(au), r = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, readingOf(v)]));
    return [
        r.low.real ? `THE LOWER TRIP POINT IS A BETTER BASELINE (${sgn(d.low.mean)})` : "THE LOWER TRIP POINT IS NOT SHOWN TO BE A BETTER BASELINE",
        r.overLow.real ? `THE TWIN'S GAIN SURVIVES THE BETTER BASELINE (${sgn(d.overLow.mean)}, se ${d.overLow.se.toFixed(4)})` : "THE TWIN'S GAIN DOES NOT SURVIVE THE BETTER BASELINE",
        r.twins.real ? "THE TWIN ON THE BETTER CONSTANTS BEATS THE TWIN ON ROUND 8" : "THE TWIN ON THE BETTER CONSTANTS IS NOT SHOWN TO BEAT THE TWIN ON ROUND 8",
    ];
}
export function checksOf(au) {
    const rows = [], g1 = SET_NAMES[0];
    const same = au[g1]["TWIN-R8"].runs.every((r, i) => r.fingerprint === au[g1]["TWIN-ROUND11"].runs[i].fingerprint);
    rows.push({ name: `IDENTITY ${g1}`, ok: same, text: `the full twin on the Round 8 constants equals the Round 11 twin dive for dive on ${g1}: ${same}` });
    const differs = (a, b) => SET_NAMES.some((s) => au[s][a].runs.some((r, i) => r.fingerprint !== au[s][b].runs[i].fingerprint));
    const lowT = differs("TUNED-LOW", "TUNED-R8"), lowW = differs("TWIN-LOW", "TWIN-R8");
    rows.push({ name: "SHIFT REACHES THE RULE", ok: lowT, text: `TUNED-LOW differs from TUNED-R8 on at least one dive: ${lowT}` });
    rows.push({ name: "SHIFT REACHES THE TWIN", ok: lowW, text: `TWIN-LOW differs from TWIN-R8 on at least one dive: ${lowW}` });
    const aligned = SET_NAMES.every((s) => ["TUNED-LOW", "TWIN-R8", "TWIN-LOW"].every((a) => au[s][a].runs.length === au[s]["TUNED-R8"].runs.length && au[s][a].runs.every((r, i) => r.kind === au[s]["TUNED-R8"].runs[i].kind)));
    rows.push({ name: "KINDS ALIGNED", ok: aligned, text: `every arm's dives are the same scenarios in the same order: ${aligned}` });
    const sizes = SET_NAMES.every((s) => ["TUNED-R8", "TUNED-LOW", "TWIN-R8", "TWIN-LOW"].every((a) => au[s][a].runs.length === BLOCK_DIVES));
    rows.push({ name: "BLOCK SIZE", ok: sizes, text: `every block has ${BLOCK_DIVES} dives per arm: ${sizes}` });
    return rows;
}
const fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 26: does the twin's gain survive a better baseline? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both, ${SET_NAMES.length * BLOCK_DIVES} dives per arm; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const d = differences(au), mean = (a) => SET_NAMES.reduce((s, n) => s + au[n][a].score, 0) / SET_NAMES.length;
    L.push(`TUNED-LOW minus TUNED-R8: ${fmt(d.low)}`, `TWIN-LOW minus TUNED-LOW (the twin over the better baseline): ${fmt(d.overLow)}`, `TWIN-LOW minus TWIN-R8: ${fmt(d.twins)}`);
    L.push(`TWIN-R8 minus TUNED-R8 (reported; the series' usual gain, on these seeds): ${fmt(d.overR8)}`);
    L.push(`gain over the better baseline as a share of the gain over Round 8: ${d.overR8.mean > 0 ? (100 * d.overLow.mean / d.overR8.mean).toFixed(0) + "%" : "n/a (the gain over Round 8 is not positive)"}`);
    L.push(`means: TUNED-R8 ${mean("TUNED-R8").toFixed(4)}, TUNED-LOW ${mean("TUNED-LOW").toFixed(4)}, TWIN-R8 ${mean("TWIN-R8").toFixed(4)}, TWIN-LOW ${mean("TWIN-LOW").toFixed(4)}; crushed ${["TUNED-R8", "TUNED-LOW", "TWIN-R8", "TWIN-LOW"].map((a) => SET_NAMES.reduce((s, n) => s + au[n][a].crashed, 0)).join("/")}, stranded ${["TUNED-R8", "TUNED-LOW", "TWIN-R8", "TWIN-LOW"].map((a) => SET_NAMES.reduce((s, n) => s + au[n][a].stranded, 0)).join("/")}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
export { SE_FACTOR };
