// WebGLEngine/tools/ship/plannerEnsConfirm.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerEnsConfirmCmd.mjs; the gate is tools/ship/plannerEnsConfirm-selfcheck.mjs)
//
// ROUND 27 of brain/NEEDS_AND_LIMITS.md ("does the small start-energy ensemble replicate on fresh seeds?", registered before this file existed): TUNED-R8, the point-estimate twin (TWIN-FULL) and Round 23's two
// small ensembles (ENS-0.05, the PRIMARY arm, and ENS-0.10, reported) flown on 600 fresh far-and-both dives in three blocks of 200 (F1 4801-4900, F2 4901-5000, F3 5001-5100, 100 seeds of each kind a block).
// THE SEEDS ARE READ ONLY BY flyBlock() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";
import { planOf } from "./plannerEnsemble.mjs";

export { HARD, pooled, readingOf, SE_FACTOR };
export const SET_RANGES = Object.freeze({ F1: [4801, 4900], F2: [4901, 5000], F3: [5001, 5100] }), SET_NAMES = Object.freeze(["F1", "F2", "F3"]);
export const ARMS = Object.freeze(["TUNED-R8", "TWIN-FULL", "ENS-0.05", "ENS-0.10", "TWIN-ROUND11"]), BLOCK_DIVES = 200, PRIMARY = "ENS-0.05";
/** The jobs of the run: every arm on every block, except the identity arm TWIN-ROUND11, which is flown on the first block only. */
export const JOBS = Object.freeze(ARMS.flatMap((a) => SET_NAMES.filter((b) => a !== "TWIN-ROUND11" || b === SET_NAMES[0]).map((b) => [a, b])));
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
export function flyArm(arm, r8, set) {
    if (!ARMS.includes(arm)) throw new Error(`plannerEnsConfirm.flyArm: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
    const sec = FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {};
    if (arm === "TUNED-R8") return T.evaluate(T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS)), set, { gauge: T.GAUGE, ...FLIGHT });
    if (arm === "TWIN-ROUND11") return T.evaluate(T.flyDecision(P.plannerSeat(r8, { mode: "twin", ...sec })), set, { gauge: T.GAUGE, ...FLIGHT });
    const seats = [], plan = { ...planOf(arm), ...sec };
    const r = T.evaluate(T.flyDecision((c) => { const s = Q.perturbedSeat(r8, {}, plan)(c); seats.push(s); return s; }), set, { gauge: T.GAUGE, ...FLIGHT });
    return { ...r, cost: seats.length ? seats.reduce((a, s) => a + s.stats.rolloutSeconds, 0) / seats.length : 0 };
}
/** One arm on one block: the 200 (far-and-both) dives of the block's seeds. `ranges` and `kinds` are for the gate. */
export function flyBlock(arm, r8, block, { ranges = SET_RANGES, kinds = HARD } = {}) {
    if (!ranges[block]) throw new Error(`plannerEnsConfirm.flyBlock: unknown block ${JSON.stringify(block)} (${Object.keys(ranges).join(", ")})`);
    return flyArm(arm, r8, T.setOf(kinds, ranges[block][0], ranges[block][1]));
}
/** The assembled audit { F1: { arm: result }, ... } from { arm: { F1: result, ... } } (an arm without a block simply has none there). */
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).filter((a) => byArm[a][n]).map((a) => [a, byArm[a][n]]))]));
const diff = (au, a, b) => pooled(au, a, b, { sets: SET_NAMES });
/** The pooled differences the verdicts read (and the reported one). */
export const differences = (au) => ({ ens: diff(au, PRIMARY, "TWIN-FULL"), ensOverTuned: diff(au, PRIMARY, "TUNED-R8"), ens10: diff(au, "ENS-0.10", "TWIN-FULL"), twin: diff(au, "TWIN-FULL", "TUNED-R8") });
/** The fixed-effect (inverse-variance) combination of two pooled estimates { mean, se }: the pooled estimate over two measurements. */
export function combine(a, b) {
    const wa = 1 / (a.se * a.se), wb = 1 / (b.se * b.se);
    return { mean: (wa * a.mean + wb * b.mean) / (wa + wb), se: Math.sqrt(1 / (wa + wb)) };
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
export function bottomLines(au) {
    const d = differences(au), r = readingOf(d.ens);
    return [
        r.real ? `THE ENSEMBLE EFFECT REPLICATES (${PRIMARY}: ${sgn(d.ens.mean)}, se ${d.ens.se.toFixed(4)})` : `THE ENSEMBLE EFFECT DOES NOT REPLICATE (${PRIMARY}: ${sgn(d.ens.mean)}, se ${d.ens.se.toFixed(4)})`,
        `THE ENSEMBLE GAIN OVER THE TUNED RULE IS ${sgn(d.ensOverTuned.mean)} (se ${d.ensOverTuned.se.toFixed(4)}), ${d.ens.mean > 0 ? "IT EXCEEDS THE POINT-ESTIMATE TWIN'S" : "IT DOES NOT EXCEED THE POINT-ESTIMATE TWIN'S"}`,
    ];
}
export function checksOf(au) {
    const rows = [], f1 = SET_NAMES[0];
    const same = au[f1]["TWIN-FULL"].runs.every((r, i) => r.fingerprint === au[f1]["TWIN-ROUND11"].runs[i].fingerprint);
    rows.push({ name: `IDENTITY ${f1}`, ok: same, text: `the point-estimate twin equals the Round 11 twin dive for dive on ${f1}: ${same}` });
    const differs = (a) => SET_NAMES.some((s) => au[s][a].runs.some((r, i) => r.fingerprint !== au[s]["TWIN-FULL"].runs[i].fingerprint));
    const e5 = differs("ENS-0.05"), e10 = differs("ENS-0.10");
    rows.push({ name: "ENSEMBLE DIFFERS 0.05", ok: e5, text: `ENS-0.05 differs from the twin on at least one dive: ${e5}` });
    rows.push({ name: "ENSEMBLE DIFFERS 0.10", ok: e10, text: `ENS-0.10 differs from the twin on at least one dive: ${e10}` });
    const aligned = SET_NAMES.every((s) => ["TWIN-FULL", "ENS-0.05", "ENS-0.10"].every((a) => au[s][a].runs.length === au[s]["TUNED-R8"].runs.length && au[s][a].runs.every((r, i) => r.kind === au[s]["TUNED-R8"].runs[i].kind)));
    rows.push({ name: "KINDS ALIGNED", ok: aligned, text: `every arm's dives are the same scenarios in the same order: ${aligned}` });
    const sizes = SET_NAMES.every((s) => ["TUNED-R8", "TWIN-FULL", "ENS-0.05", "ENS-0.10"].every((a) => au[s][a].runs.length === BLOCK_DIVES));
    rows.push({ name: "BLOCK SIZE", ok: sizes, text: `every block has ${BLOCK_DIVES} dives per arm: ${sizes}` });
    return rows;
}
const fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
const meanCost = (au, a) => SET_NAMES.reduce((s, n) => s + (au[n][a].cost || 0), 0) / SET_NAMES.length;
/** The report. `prior` ({ mean, se }) is Round 23's pooled ENS-0.05 minus TWIN-FULL, for the reported combination; null when it is not available. */
export function report(au, prior = null) {
    const L = [`ROUND 27: does the small start-energy ensemble replicate? pooled over ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both, ${SET_NAMES.length * BLOCK_DIVES} dives per arm; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const d = differences(au), mean = (a) => SET_NAMES.reduce((s, n) => s + au[n][a].score, 0) / SET_NAMES.length;
    L.push(`${PRIMARY} minus TWIN-FULL (primary): ${fmt(d.ens)}`, `${PRIMARY} minus TUNED-R8: ${fmt(d.ensOverTuned)}`);
    L.push(`ENS-0.10 minus TWIN-FULL (reported): ${fmt(d.ens10)}`, `TWIN-FULL minus TUNED-R8 (reported; the twin's usual gain, on these seeds): ${fmt(d.twin)}`);
    if (prior) { const c = combine(prior, d.ens); L.push(`pooled over Round 23 and this round (reported, fixed-effect): ${PRIMARY} minus TWIN-FULL ${sgn(c.mean)} (se ${c.se.toFixed(4)}; Round 23 ${sgn(prior.mean)}, se ${prior.se.toFixed(4)})`); }
    L.push(`means: TUNED-R8 ${mean("TUNED-R8").toFixed(4)}, TWIN-FULL ${mean("TWIN-FULL").toFixed(4)}, ENS-0.05 ${mean("ENS-0.05").toFixed(4)}, ENS-0.10 ${mean("ENS-0.10").toFixed(4)}; scheduled rollout seconds per dive: twin ${meanCost(au, "TWIN-FULL").toFixed(0)}, ENS-0.05 ${meanCost(au, "ENS-0.05").toFixed(0)}, ENS-0.10 ${meanCost(au, "ENS-0.10").toFixed(0)}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
