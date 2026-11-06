// WebGLEngine/tools/ship/plannerConfirm.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerConfirmCmd.mjs; the gate is tools/ship/plannerConfirm-selfcheck.mjs)
//
// ROUND 22 of brain/NEEDS_AND_LIMITS.md ("the confirmatory run", registered before this file existed): TUNED-R8 and the full twin on 2,000 fresh far-and-both dives in four blocks of 500 (C1 2401-2650, C2 2651-2900,
// C3 2901-3150, C4 3151-3400): the pooled gain with its standard error, whether it exceeds one point of the score, whether the four blocks agree (Round 19's Cochran's Q), the share of dives on which the twin differs.
// THE SEEDS ARE READ ONLY BY flyBlock() ON THESE SETS. No clock, no Math.random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as P from "../../brain/plannerSeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";
import { meta, P_LEVEL } from "./plannerMeta.mjs";

export { HARD, pooled, readingOf };
export const SET_RANGES = Object.freeze({ C1: [2401, 2650], C2: [2651, 2900], C3: [2901, 3150], C4: [3151, 3400] }), SET_NAMES = Object.freeze(["C1", "C2", "C3", "C4"]);
export const ARMS = Object.freeze(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL"]), FLOOR = 0.01, BLOCK_DIVES = 500;
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
export function flyArm(arm, r8, set) {
    const sec = FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {};
    const pilot = arm === "TUNED-R8" ? T.flyDecision(U.tunedSeat(r8, U.WIDE_BOUNDS)) : arm === "TWIN-ROUND11" ? T.flyDecision(P.plannerSeat(r8, { mode: "twin", ...sec })) : arm === "TWIN-FULL" ? T.flyDecision(Q.perturbedSeat(r8, {}, sec)) : null;
    if (!pilot) throw new Error(`plannerConfirm.flyArm: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
    return T.evaluate(pilot, set, { gauge: T.GAUGE, ...FLIGHT });
}
/** One arm on one block: the 500 (far-and-both) dives of seeds a..b. `ranges` and `kinds` are for the gate. */
export function flyBlock(arm, r8, block, { ranges = SET_RANGES, kinds = HARD } = {}) {
    if (!ranges[block]) throw new Error(`plannerConfirm.flyBlock: unknown block ${JSON.stringify(block)} (${Object.keys(ranges).join(", ")})`);
    return flyArm(arm, r8, T.setOf(kinds, ranges[block][0], ranges[block][1]));
}
/** The assembled audit { C1: { arm: result }, ... } from { arm: { C1: result, ... } }. */
export const assemble = (byArm) => Object.fromEntries(SET_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][n]]))]));
/** The pooled gain over the given blocks (all four by default) and, optionally, one kind. */
export const gainOver = (au, { sets = SET_NAMES, kind = null } = {}) => pooled(au, "TWIN-FULL", "TUNED-R8", { sets, kind });
/** The four block estimates for the heterogeneity test: [{ name, n, mean, se }]. */
export const blockEstimates = (au) => SET_NAMES.map((n) => ({ name: n, ...gainOver(au, { sets: [n] }) }));
/** How often the twin's dive is not the tuned rule's, and the mean gain on those dives. */
export function differing(au) {
    let n = 0, d = 0, sum = 0;
    for (const s of SET_NAMES) au[s]["TWIN-FULL"].runs.forEach((r, i) => { n++; if (r.fingerprint !== au[s]["TUNED-R8"].runs[i].fingerprint) { d++; sum += r.score - au[s]["TUNED-R8"].runs[i].score; } });
    return { n, differ: d, share: n ? d / n : 0, meanGainWhereDiffer: d ? sum / d : 0 };
}
/** Cochran's Q over the four blocks, or null when a block has no variance (identical dives: the statistic is undefined and the blocks agree iff their means do). */
export function blockStats(au) {
    const b = blockEstimates(au);
    return b.every((x) => x.se > 0) ? meta(b) : null;
}
const agree = (au) => { const m = blockStats(au); return m ? m.p >= P_LEVEL : blockEstimates(au).every((b, _, a) => Math.abs(b.mean - a[0].mean) < 1e-12); };
export function bottomLines(au) {
    const g = gainOver(au), rd = readingOf(g);
    return [
        rd.real ? `THE TWIN'S GAIN IS CONFIRMED AT ${g.mean >= 0 ? "+" : ""}${g.mean.toFixed(4)} (se ${g.se.toFixed(4)}; ${g.n} DIVES)` : `THE TWIN'S GAIN IS NOT CONFIRMED (${g.mean >= 0 ? "+" : ""}${g.mean.toFixed(4)}, se ${g.se.toFixed(4)})`,
        g.mean - SE_FACTOR * g.se > FLOOR ? "THE GAIN EXCEEDS ONE POINT OF THE SCORE" : "THE GAIN IS NOT SHOWN TO EXCEED ONE POINT OF THE SCORE",
        agree(au) ? "THE FOUR BLOCKS AGREE" : "THE FOUR BLOCKS DISAGREE BEYOND CHANCE",
    ];
}
export function checksOf(au) {
    const rows = [];
    for (const s of SET_NAMES) {
        const same = au[s]["TWIN-FULL"].runs.every((r, i) => r.fingerprint === au[s]["TWIN-ROUND11"].runs[i].fingerprint);
        rows.push({ name: `IDENTITY ${s}`, ok: same, text: `the full twin equals the Round 11 twin dive for dive on ${s}: ${same}` });
    }
    const aligned = SET_NAMES.every((s) => au[s]["TWIN-FULL"].runs.every((r, i) => r.kind === au[s]["TUNED-R8"].runs[i]?.kind) && au[s]["TWIN-FULL"].runs.length === au[s]["TUNED-R8"].runs.length);
    rows.push({ name: "KINDS ALIGNED", ok: aligned, text: `the twin's and the tuned rule's dives are the same scenarios in the same order: ${aligned}` });
    const sizes = SET_NAMES.every((s) => au[s]["TUNED-R8"].runs.length === BLOCK_DIVES && au[s]["TWIN-FULL"].runs.length === BLOCK_DIVES);
    rows.push({ name: "BLOCK SIZE", ok: sizes, text: `every block has ${BLOCK_DIVES} dives per arm: ${sizes}` });
    return rows;
}
const fmt = (p) => `${p.mean >= 0 ? "+" : ""}${p.mean.toFixed(4)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(au) {
    const L = [`ROUND 22: the confirmatory run, ${SET_NAMES.map((n) => `${n} ${SET_RANGES[n][0]}-${SET_RANGES[n][1]}`).join(", ")} (far and both, ${SET_NAMES.length * BLOCK_DIVES} dives per arm; read once)`];
    const checks = checksOf(au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    const g = gainOver(au), m = blockStats(au);
    L.push(`POOLED twin minus TUNED-R8: ${fmt(g)}; lower bound ${(g.mean - SE_FACTOR * g.se).toFixed(4)}`);
    for (const k of HARD) L.push(`  ${k.padEnd(4)} ${fmt(gainOver(au, { kind: k }))}`);
    for (const b of blockEstimates(au)) L.push(`  ${b.name} ${fmt(b)}`);
    L.push(m ? `blocks: Q ${m.Q.toFixed(2)} on ${m.df} df, p ${m.p.toFixed(4)}; I-squared ${(100 * m.i2).toFixed(0)}%; random-effects ${m.re >= 0 ? "+" : ""}${m.re.toFixed(4)} (se ${m.reSe.toFixed(4)})` : "blocks: a block has no variance (identical dives), Q is undefined");
    const d = differing(au), mean = (a) => SET_NAMES.reduce((s, n) => s + au[n][a].score, 0) / SET_NAMES.length;
    L.push(`the twin's dive differs from the tuned rule's on ${d.differ} of ${d.n} (${(100 * d.share).toFixed(1)}%), by ${d.meanGainWhereDiffer >= 0 ? "+" : ""}${d.meanGainWhereDiffer.toFixed(4)} on average where it differs; means (tuned | twin) ${mean("TUNED-R8").toFixed(4)} | ${mean("TWIN-FULL").toFixed(4)}; crushed ${SET_NAMES.reduce((s, n) => s + au[n]["TUNED-R8"].crashed, 0)}/${SET_NAMES.reduce((s, n) => s + au[n]["TWIN-FULL"].crashed, 0)}, stranded ${SET_NAMES.reduce((s, n) => s + au[n]["TUNED-R8"].stranded, 0)}/${SET_NAMES.reduce((s, n) => s + au[n]["TWIN-FULL"].stranded, 0)}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
