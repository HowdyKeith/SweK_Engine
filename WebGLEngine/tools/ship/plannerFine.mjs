// WebGLEngine/tools/ship/plannerFine.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerFineCmd.mjs; the gate is tools/ship/plannerFine-selfcheck.mjs)
//
// ROUND 30 of brain/NEEDS_AND_LIMITS.md ("a finer grid around the low trip point's optimum", registered before this file existed): four full-twin arms on a fine grid of low trip-point
// shifts, flown on the selection set N1 (6301-6500, 400 dives per arm); the winner by mean score fixed BEFORE the confirmation set is flown; then the winner and the reference constants (low -0.12) flown as
// twin and as bare rule on the confirmation blocks N2a 6601-6700, N2b 6701-6800, N2c 6801-6900 (200 dives each, 600 per arm). THE SEEDS ARE READ ONLY BY flySelection() AND flyConfirm(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";

export { HARD, pooled, readingOf };
export const SEL_RANGE = Object.freeze([6301, 6500]);
export const CONF_RANGES = Object.freeze({ N2a: [6601, 6700], N2b: [6701, 6800], N2c: [6801, 6900] }), CONF_NAMES = Object.freeze(["N2a", "N2b", "N2c"]), BLOCK_DIVES = 200, SEL_DIVES = 400;
export const LOWS = Object.freeze([-0.08, -0.10, -0.12, -0.14]), HIGHS = Object.freeze([0]);
const sgnName = (x) => (x === 0 ? "0" : (x > 0 ? "+" : "-") + Math.abs(x).toFixed(2));
export const armName = (dl, dh) => `L${sgnName(dl)}H${sgnName(dh)}`;
export const GRID = Object.freeze(LOWS.flatMap((dl) => HIGHS.map((dh) => armName(dl, dh))));
export const REF = armName(-0.12, 0);
/** The shifts { dl, dh } an arm name stands for; a name outside the grid is refused. */
export function shiftsOf(name) {
    for (const dl of LOWS) for (const dh of HIGHS) if (armName(dl, dh) === name) return { dl, dh };
    throw new Error(`plannerFine.shiftsOf: ${JSON.stringify(name)} is not a grid arm (${GRID.join(", ")})`);
}
/** The tuned rule's parameters after the arm's shifts: the Round 8 constants with low and high moved, nothing else. */
export function paramsOf(name, r8) { const { dl, dh } = shiftsOf(name); return { ...r8, low: r8.low + dl, high: r8.high + dh }; }
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
const twin = (p) => T.flyDecision(Q.perturbedSeat(p, {}, FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {}));
/** One selection arm on the selection set: the evaluate result of the full twin on that arm's constants. `range` and `kinds` are for the gate. */
export function flySelection(name, r8, { range = SEL_RANGE, kinds = HARD } = {}) {
    return T.evaluate(twin(paramsOf(name, r8)), T.setOf(kinds, range[0], range[1]), { gauge: T.GAUGE, ...FLIGHT });
}
/** The winner of a selection { arm: result }: the highest mean score among the arms with no crushed and no stranded dive (the reference when none is clean); a tie goes to the arm nearest the reference (sum of the absolute shifts), then to the smaller low shift. */
export function winnerOf(sel) {
    const names = GRID.filter((n) => sel[n]);
    if (names.length !== GRID.length) throw new Error(`plannerFine.winnerOf: the selection must hold all ${GRID.length} grid arms, got ${names.length}`);
    const clean = names.filter((n) => sel[n].crashed + sel[n].stranded === 0);
    if (!clean.length) return REF;
    const dist = (n) => { const s = shiftsOf(n); return Math.round((Math.abs(s.dl + 0.12) + Math.abs(s.dh)) * 1e9) / 1e9; };   // rounded: -0.10 and -0.14 are both 0.02 from the reference, and floating point must not decide that tie
    return clean.slice().sort((a, b) => sel[b].score - sel[a].score || dist(a) - dist(b) || shiftsOf(b).dl - shiftsOf(a).dl)[0];
}
export const CONF_ARMS = Object.freeze(["TWIN-WIN", "TWIN-REF", "TUNED-WIN", "TUNED-REF"]);
/** The jobs of the confirmation: every arm on every block. */
export const JOBS = Object.freeze(CONF_ARMS.flatMap((a) => CONF_NAMES.map((b) => [a, b])));
/** One confirmation arm on one block, given the winner's name. */
export function flyConfirm(arm, winner, r8, block, { ranges = CONF_RANGES, kinds = HARD } = {}) {
    if (!CONF_ARMS.includes(arm)) throw new Error(`plannerFine.flyConfirm: unknown arm ${JSON.stringify(arm)} (${CONF_ARMS.join(", ")})`);
    if (!ranges[block]) throw new Error(`plannerFine.flyConfirm: unknown block ${JSON.stringify(block)} (${Object.keys(ranges).join(", ")})`);
    const p = paramsOf(/WIN$/.test(arm) ? winner : REF, r8), pilot = arm.startsWith("TWIN") ? twin(p) : T.flyDecision(U.tunedSeat(p, U.WIDE_BOUNDS));
    return T.evaluate(pilot, T.setOf(kinds, ranges[block][0], ranges[block][1]), { gauge: T.GAUGE, ...FLIGHT });
}
/** The assembled audit { N2a: { arm: result }, ... } from { arm: { N2a: result, ... } }. */
export const assemble = (byArm) => Object.fromEntries(CONF_NAMES.map((n) => [n, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][n]]))]));
const diff = (au, a, b) => pooled(au, a, b, { sets: CONF_NAMES });
export const differences = (au) => ({ retune: diff(au, "TWIN-WIN", "TWIN-REF"), twinGain: diff(au, "TWIN-WIN", "TUNED-WIN"), rule: diff(au, "TUNED-WIN", "TUNED-REF") });
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
export function bottomLines(au, winner, sel) {
    const d = differences(au), r = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, readingOf(v)]));
    const hull = [...CONF_ARMS.map((a) => ({ a, c: CONF_NAMES.reduce((s, n) => s + au[n][a].crashed, 0), t: CONF_NAMES.reduce((s, n) => s + au[n][a].stranded, 0) })), { a: `selection ${winner}`, c: sel[winner].crashed, t: sel[winner].stranded }], crushed = hull.reduce((s, x) => s + x.c, 0), stranded = hull.reduce((s, x) => s + x.t, 0);
    return [
        winner !== REF && r.retune.real ? `A CELL INSIDE THE BRACKET BEATS LOW -0.12 (${winner}: ${sgn(d.retune.mean)}, se ${d.retune.se.toFixed(4)})` : `LOW -0.12 STANDS AS THE OPTIMUM OF THE GRID (${winner})`,
        r.twinGain.real ? `THE TWIN'S GAIN SURVIVES (${sgn(d.twinGain.mean)}, se ${d.twinGain.se.toFixed(4)})` : "THE TWIN'S GAIN DOES NOT SURVIVE",
        r.rule.hurts ? "THE RULE ALONE WANTS OTHER CONSTANTS THAN THE TWIN" : r.rule.real ? "THE RULE ALONE IMPROVES TOO" : "THE RULE ALONE WANTS THE SAME CONSTANTS",
        crushed + stranded === 0 ? "THE HULL IS UNHARMED (0 CRUSHED, 0 STRANDED)" : `THE HULL PAYS: ${crushed} CRUSHED, ${stranded} STRANDED (${hull.filter((x) => x.c + x.t > 0).map((x) => x.a).join(", ")})`,
    ];
}
export function checksOf(sel, au) {
    const rows = [], fps = GRID.map((n) => sel[n].runs.map((r) => r.fingerprint).join("|"));
    const distinct = new Set(fps).size === GRID.length;
    rows.push({ name: "GRID DISTINCT", ok: distinct, text: `the four selection arms are pairwise different on at least one dive: ${distinct}` });
    const sizes = GRID.every((n) => sel[n].runs.length === SEL_DIVES) && CONF_NAMES.every((s) => CONF_ARMS.every((a) => au[s][a].runs.length === BLOCK_DIVES));
    rows.push({ name: "SIZES", ok: sizes, text: `every selection arm has ${SEL_DIVES} dives and every confirmation arm ${BLOCK_DIVES} a block: ${sizes}` });
    const aligned = CONF_NAMES.every((s) => CONF_ARMS.every((a) => au[s][a].runs.every((r, i) => r.kind === au[s]["TWIN-REF"].runs[i].kind)));
    rows.push({ name: "KINDS ALIGNED", ok: aligned, text: `every confirmation arm's dives are the same scenarios in the same order: ${aligned}` });
    return rows;
}
const fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(sel, au, winner) {
    const L = [`ROUND 30: a finer grid around the low trip point's optimum. Selection N1 ${SEL_RANGE[0]}-${SEL_RANGE[1]} (four arms, ${SEL_DIVES} dives each); confirmation ${CONF_NAMES.map((n) => `${n} ${CONF_RANGES[n][0]}-${CONF_RANGES[n][1]}`).join(", ")} (${CONF_NAMES.length * BLOCK_DIVES} dives per arm; read once)`];
    const checks = checksOf(sel, au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.");
    L.push("selection means (twin on the shifted constants; difference from the reference " + REF + "):");
    for (const n of GRID) L.push(`  ${n.padEnd(13)} ${sel[n].score.toFixed(4)}  ${sel[n].score - sel[REF].score >= 0 ? "+" : ""}${(sel[n].score - sel[REF].score).toFixed(4)}  crushed ${sel[n].crashed} stranded ${sel[n].stranded}${n === winner ? "  <- WINNER" : ""}${n === REF ? "  (reference)" : ""}`);
    const d = differences(au), mean = (a) => CONF_NAMES.reduce((s, n) => s + au[n][a].score, 0) / CONF_NAMES.length;
    L.push(`winner ${winner} (selection advantage over ${REF}: ${sgn(sel[winner].score - sel[REF].score)})`, `TWIN-WIN minus TWIN-REF: ${fmt(d.retune)}`, `TWIN-WIN minus TUNED-WIN (the twin over the rule on the winner's constants): ${fmt(d.twinGain)}`, `TUNED-WIN minus TUNED-REF (the rule alone, the winner's constants against the reference's): ${fmt(d.rule)}`);
    L.push(`confirmation means: TWIN-WIN ${mean("TWIN-WIN").toFixed(4)}, TWIN-REF ${mean("TWIN-REF").toFixed(4)}, TUNED-WIN ${mean("TUNED-WIN").toFixed(4)}, TUNED-REF ${mean("TUNED-REF").toFixed(4)}`);
    if (bad.length) L.push("BOTTOM LINE: NOT WEIGHED (a check failed)");
    else for (const l of bottomLines(au, winner, sel)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
export { SE_FACTOR };
