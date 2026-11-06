// WebGLEngine/tools/ship/plannerChoose.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerChooseCmd.mjs; the gate is tools/ship/plannerChoose-selfcheck.mjs)
//
// ROUND 32 of brain/NEEDS_AND_LIMITS.md ("a robust choice of the low trip point", registered before this file existed): the tuned rule with its low trip point shifted by 0, -0.02 ... -0.12, flown on five
// conditions (REF, DMG starting damage x1.6, N20 gauge sd 0.20, N30 gauge sd 0.30, STN5 five stations; plannerRobust's generator), 600 selection dives per arm and condition; the shift whose WORST condition is best
// among those that do not crush more than the Round 8 constants (plus 3 dives) is written down; then it is confirmed on 300 fresh dives per arm and condition with the rule and with the full twin.
// THE SEEDS ARE READ ONLY BY flySelection() AND flyConfirm(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { pooled, readingOf, SE_FACTOR, HARD } from "./plannerReplicate.mjs";
import { scenarioX } from "./plannerRobust.mjs";
import { mergeKinds } from "./plannerCap.mjs";

export { HARD, pooled, readingOf, mergeKinds };
export const COND_NAMES = Object.freeze(["REF", "DMG", "N20", "N30", "STN5"]);
export const CONDITIONS = Object.freeze({
    REF: Object.freeze({ count: 3, damageScale: 1, sd: 0.1, sel: [8001, 8300], conf: [10001, 10150] }),
    DMG: Object.freeze({ count: 3, damageScale: 1.6, sd: 0.1, sel: [8401, 8700], conf: [10201, 10350] }),
    N20: Object.freeze({ count: 3, damageScale: 1, sd: 0.2, sel: [8801, 9100], conf: [10401, 10550] }),
    N30: Object.freeze({ count: 3, damageScale: 1, sd: 0.3, sel: [9201, 9500], conf: [10601, 10750] }),
    STN5: Object.freeze({ count: 5, damageScale: 1, sd: 0.1, sel: [9601, 9900], conf: [10801, 10950] }),
});
export const SHIFTS = Object.freeze([0, -0.02, -0.04, -0.06, -0.08, -0.10, -0.12]), ALLOW = 3, SEL_DIVES = 600, CONF_DIVES = 300;
export const nameOf = (shift) => (shift === 0 ? "L0" : "L" + shift.toFixed(2));
export const GRID = Object.freeze(SHIFTS.map(nameOf));
/** The shift an arm name stands for; a name outside the grid is refused. */
export function shiftOf(name) { const i = GRID.indexOf(name); if (i < 0) throw new Error(`plannerChoose.shiftOf: ${JSON.stringify(name)} is not a grid arm (${GRID.join(", ")})`); return SHIFTS[i]; }
/** The Round 8 constants with low moved by the arm's shift, nothing else. */
export const paramsOf = (name, r8) => ({ ...r8, low: r8.low + shiftOf(name) });
/** The scenarios of the given kinds of one condition and stage ("sel" or "conf"), kind-major as needsTask.setOf. */
export function setFor(cond, stage, kinds = HARD, range = null) {
    const c = CONDITIONS[cond]; if (!c) throw new Error(`plannerChoose.setFor: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    if (stage !== "sel" && stage !== "conf") throw new Error(`plannerChoose.setFor: unknown stage ${JSON.stringify(stage)} (sel, conf)`);
    const [a, b] = range || c[stage];   // `range` is for the gate; the real run never passes it
    return Object.freeze(kinds.flatMap((k) => Array.from({ length: b - a + 1 }, (_, i) => scenarioX(a + i, k, c.count, c.damageScale))));
}
let FLIGHT = {};
/** Flight options for every flight this library makes (the gate shortens dives; the real run never calls this). */
export const setFlight = (o) => { FLIGHT = { ...o }; };
/** One selection arm (the bare rule at a shift) on one condition's selection set. `kinds` is for the gate. */
export function flySelection(name, r8, cond, { kinds = HARD, range = null } = {}) {
    return T.evaluate(T.flyDecision(U.tunedSeat(paramsOf(name, r8), U.WIDE_BOUNDS)), setFor(cond, "sel", kinds, range), { ...FLIGHT, gauge: { sd: CONDITIONS[cond].sd, hz: T.GAUGE.hz } });
}
export const SEL_JOBS = Object.freeze(GRID.flatMap((n) => COND_NAMES.map((c) => [n, c])));
/** The selection table from sel[name][cond] = evaluate result: per shift and condition the mean score, the gain over L0, the crushed plus stranded dives and whether the hull allowance holds; per shift whether it is eligible and its value (the worst gain). */
export function tableOf(sel) {
    return GRID.map((name) => {
        const per = Object.fromEntries(COND_NAMES.map((c) => {
            const r = sel[name][c], z = sel[GRID[0]][c], bad = r.crashed + r.stranded, zbad = z.crashed + z.stranded;
            return [c, { score: r.score, gain: r.score - z.score, bad, ok: bad <= zbad + ALLOW }];
        }));
        return { name, shift: shiftOf(name), per, eligible: COND_NAMES.every((c) => per[c].ok), value: Math.min(...COND_NAMES.map((c) => per[c].gain)) };
    });
}
/** The winner: the eligible shift with the highest value; a tie goes to the smaller absolute shift (so L0, value 0, wins unless a shift has a strictly positive worst case). */
export function winnerOf(sel) {
    for (const n of GRID) for (const c of COND_NAMES) if (!sel[n] || !sel[n][c]) throw new Error(`plannerChoose.winnerOf: the selection must hold every grid arm in every condition (${n} ${c} is missing)`);
    const rows = tableOf(sel).filter((r) => r.eligible);
    return rows.sort((a, b) => b.value - a.value || Math.abs(a.shift) - Math.abs(b.shift))[0].name;
}
export const CONF_ARMS = Object.freeze(["TUNED-R8", "TUNED-WIN", "TWIN-WIN"]);
export const CONF_JOBS = Object.freeze(CONF_ARMS.flatMap((a) => COND_NAMES.flatMap((c) => HARD.map((k) => [a, c, k]))));
/** One confirmation arm on one kind of one condition, given the winner's name. `stage` and the sets are the real ones. */
export function flyConfirm(arm, winner, r8, cond, kind, { range = null } = {}) {
    if (!CONF_ARMS.includes(arm)) throw new Error(`plannerChoose.flyConfirm: unknown arm ${JSON.stringify(arm)} (${CONF_ARMS.join(", ")})`);
    const p = paramsOf(arm === "TUNED-R8" ? GRID[0] : winner, r8), sec = FLIGHT.seconds ? { seconds: FLIGHT.seconds } : {};
    const pilot = arm === "TWIN-WIN" ? T.flyDecision(Q.perturbedSeat(p, {}, sec)) : T.flyDecision(U.tunedSeat(p, U.WIDE_BOUNDS));
    return T.evaluate(pilot, setFor(cond, "conf", [kind], range), { ...FLIGHT, gauge: { sd: CONDITIONS[cond].sd, hz: T.GAUGE.hz } });
}
export const assemble = (byArm) => Object.fromEntries(COND_NAMES.map((c) => [c, Object.fromEntries(Object.keys(byArm).map((a) => [a, byArm[a][c]]))]));
const diff = (au, c, a, b) => pooled(au, a, b, { sets: [c] });
export function conditionOf(au, c) {
    const rule = diff(au, c, "TUNED-WIN", "TUNED-R8"), twin = diff(au, c, "TWIN-WIN", "TUNED-WIN"), rr = readingOf(rule), tr = readingOf(twin);
    const hull = Object.fromEntries(CONF_ARMS.map((a) => [a, au[c][a].crashed + au[c][a].stranded]));
    return { cond: c, rule, twin, ruleVerdict: rr.hurts ? "HURTS" : rr.real ? "KEEPS" : "LOSES", twinVerdict: tr.real ? "KEEPS" : "LOSES", hull, hullOk: hull["TUNED-WIN"] <= hull["TUNED-R8"] + ALLOW && hull["TWIN-WIN"] <= hull["TUNED-R8"] + ALLOW };
}
const list = (xs) => xs.join(", "), sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
export function bottomLines(au, winner, sel) {
    const cs = COND_NAMES.map((c) => conditionOf(au, c)), keep = cs.filter((x) => x.ruleVerdict === "KEEPS").map((x) => x.cond), hurt = cs.filter((x) => x.ruleVerdict === "HURTS").map((x) => x.cond), lose = cs.filter((x) => x.ruleVerdict === "LOSES").map((x) => x.cond);
    const twin = cs.filter((x) => x.twinVerdict === "KEEPS").map((x) => x.cond), worse = cs.filter((x) => !x.hullOk).map((x) => x.cond), value = tableOf(sel).find((r) => r.name === winner).value;
    return [
        winner === GRID[0] ? "NO SHIFT BEATS THE ROUND 8 CONSTANTS IN EVERY CONDITION WITHIN THE HULL ALLOWANCE" : `THE ROBUST CHOICE IS LOW ${shiftOf(winner).toFixed(2)} (WORST-CONDITION GAIN ${sgn(value)} ON SELECTION)`,
        `THE CHOICE KEEPS ITS GAIN IN ${keep.length} OF ${COND_NAMES.length} CONDITIONS (${list(keep) || "none"})${hurt.length ? `; IT HURTS IN (${list(hurt)})` : ""}${lose.length ? `; IT LOSES IT IN (${list(lose)})` : ""}`,
        `THE TWIN KEEPS ITS GAIN ON IT IN ${twin.length} OF ${COND_NAMES.length} CONDITIONS (${list(twin) || "none"})`,
        worse.length ? `THE HULL PAYS MORE THAN ROUND 8 IN ${list(worse)}` : "THE HULL IS NO WORSE THAN ROUND 8 IN ANY CONDITION",
    ];
}
export function checksOf(sel, au) {
    const rows = [], sample = [[1, "far"], [2, "both"], [271, "far"], [3, "deep"], [5, "plain"]];
    const gen = sample.every(([s, k]) => JSON.stringify(scenarioX(s, k, 3, 1)) === JSON.stringify(T.scenario(s, k)));
    rows.push({ name: "GENERATOR", ok: gen, text: `the generator at 3 stations and damage scale 1 equals needsTask.scenario on ${sample.length} sample scenarios: ${gen}` });
    const sizes = GRID.every((n) => COND_NAMES.every((c) => sel[n][c].runs.length === SEL_DIVES)) && COND_NAMES.every((c) => CONF_ARMS.every((a) => au[c][a].runs.length === CONF_DIVES));
    rows.push({ name: "SIZES", ok: sizes, text: `every selection arm has ${SEL_DIVES} dives and every confirmation arm ${CONF_DIVES} in every condition: ${sizes}` });
    const aligned = COND_NAMES.every((c) => GRID.every((n) => sel[n][c].runs.length === sel[GRID[0]][c].runs.length && sel[n][c].runs.every((r, i) => r.kind === sel[GRID[0]][c].runs[i].kind)) && CONF_ARMS.every((a) => au[c][a].runs.length === au[c]["TUNED-R8"].runs.length && au[c][a].runs.every((r, i) => r.kind === au[c]["TUNED-R8"].runs[i].kind)));
    rows.push({ name: "KINDS ALIGNED", ok: aligned, text: `within a condition every arm's dives are the same scenarios in the same order: ${aligned}` });
    const distinct = new Set(GRID.map((n) => sel[n].REF.runs.map((r) => r.fingerprint).join("|"))).size === GRID.length;
    rows.push({ name: "SHIFTS DISTINCT", ok: distinct, text: `the ${GRID.length} shifts are pairwise different on at least one REF dive: ${distinct}` });
    return rows;
}
const fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse}, same ${p.same})`;
export function report(sel, au, winner) {
    const L = [`ROUND 32: a robust choice of the low trip point. Selection ${COND_NAMES.map((c) => `${c} ${CONDITIONS[c].sel[0]}-${CONDITIONS[c].sel[1]}`).join(", ")} (${SEL_DIVES} dives per shift and condition); confirmation ${COND_NAMES.map((c) => `${c} ${CONDITIONS[c].conf[0]}-${CONDITIONS[c].conf[1]}`).join(", ")} (${CONF_DIVES} dives per arm and condition; read once)`];
    const checks = checksOf(sel, au), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    L.push(`selection table: per condition gain over L0 (crushed+stranded of ${SEL_DIVES}); '-' marks a condition where the hull allowance (L0 + ${ALLOW}) is broken`, "  shift     " + COND_NAMES.map((c) => c.padStart(14)).join("") + "   value   eligible");
    for (const r of tableOf(sel)) L.push(`  ${r.name.padEnd(8)}  ` + COND_NAMES.map((c) => `${sgn(r.per[c].gain)} (${r.per[c].bad})${r.per[c].ok ? " " : "-"}`.padStart(14)).join("") + `   ${sgn(r.value)}   ${r.eligible ? "yes" : "NO"}${r.name === winner ? "  <- WINNER" : ""}`);
    for (const c of COND_NAMES) {
        const x = conditionOf(au, c), mean = (a) => au[c][a].score.toFixed(4);
        L.push(`${c}: means R8 ${mean("TUNED-R8")}, winner ${mean("TUNED-WIN")}, twin ${mean("TWIN-WIN")}`, `   rule gain (winner minus R8) ${fmt(x.rule)}  ${x.ruleVerdict}`, `   twin gain (twin minus winner) ${fmt(x.twin)}  ${x.twinVerdict}`, `   crushed+stranded: R8 ${x.hull["TUNED-R8"]}, winner ${x.hull["TUNED-WIN"]}, twin ${x.hull["TWIN-WIN"]}`);
    }
    for (const l of bottomLines(au, winner, sel)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
export { SE_FACTOR };
