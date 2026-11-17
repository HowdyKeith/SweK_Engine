// WebGLEngine/tools/ship/seatMove.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/seatMoveCmd.mjs; the gate is tools/ship/seatMove-selfcheck.mjs)
//
// ROUND 37 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): Keith moved the seat to low -0.04; this confirms it against the seat it replaces before the constant
// changes. SEAT-04 (the seat's planner, profile standard, on the Round 8 constants with low -0.04) against SEAT-06 (the same on low -0.06, the shipped seat when the round was flown),
// in REF, DMG, N20, N30, STN5 (plannerRobust.scenarioX) and BIAS (+0.10), 300 dives each (far and both). Both arms' constants are written BY VALUE here, so this file names what it
// flew whatever surveySeat.mjs says later. THE SEEDS ARE READ ONLY BY flyJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { scenarioX } from "./plannerRobust.mjs";
import { diffOf, keepsOf, hullOk, badOf, mergeKinds } from "./gaugeFaults.mjs";

export { hullOk, mergeKinds, diffOf };
export const KINDS = Object.freeze(["far", "both"]), DIVES = 300, GATE_SEEDS = Object.freeze([50901, 50902]);
export const CONDITIONS = Object.freeze({
    REF: Object.freeze({ count: 3, damageScale: 1, sd: 0.1, bias: 0, seeds: [49001, 49150] }),
    DMG: Object.freeze({ count: 3, damageScale: 1.6, sd: 0.1, bias: 0, seeds: [49201, 49350] }),
    N20: Object.freeze({ count: 3, damageScale: 1, sd: 0.2, bias: 0, seeds: [49401, 49550] }),
    N30: Object.freeze({ count: 3, damageScale: 1, sd: 0.3, bias: 0, seeds: [49601, 49750] }),
    STN5: Object.freeze({ count: 5, damageScale: 1, sd: 0.1, bias: 0, seeds: [49801, 49950] }),
    BIAS: Object.freeze({ count: 3, damageScale: 1, sd: 0.1, bias: 0.1, seeds: [50201, 50350] }),
});
export const COND_NAMES = Object.freeze(Object.keys(CONDITIONS));
/** The two arms' constants, by value: the Round 8 constants with low moved by -0.04 and -0.06. */
export const R8 = Object.freeze({ alpha: 0.001, low: 0.3803560726214647, high: 0.68938489754682, ramp: 20, cap: 0.8861494767879255 });
export const ARM_CONSTANTS = Object.freeze({ "SEAT-04": Object.freeze({ ...R8, low: R8.low - 0.04 }), "SEAT-06": Object.freeze({ ...R8, low: R8.low - 0.06 }) });
export const ARMS = Object.freeze(Object.keys(ARM_CONSTANTS));
export function pilotOf(arm, overrides = {}) {
    if (!ARM_CONSTANTS[arm]) throw new Error(`seatMove.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
    return T.flyDecision(Q.perturbedSeat(ARM_CONSTANTS[arm], {}, SS.planOf("standard", overrides)));
}
export function gaugeOf(cond) {
    const c = CONDITIONS[cond]; if (!c) throw new Error(`seatMove.gaugeOf: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    return c.bias ? { sd: c.sd, hz: T.GAUGE.hz, fault: { bias: c.bias } } : { sd: c.sd, hz: T.GAUGE.hz };
}
export const setOf = (cond, kind, range = null) => { const c = CONDITIONS[cond], [a, b] = range || c.seeds; return Array.from({ length: b - a + 1 }, (_, i) => scenarioX(a + i, kind, c.count, c.damageScale)); };
export const JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => KINDS.map((k) => [a, c, k]))));
export function flyJob(arm, cond, kind, { range = null, seconds = null, overrides = {} } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`seatMove.flyJob: unknown kind ${JSON.stringify(kind)} (${KINDS.join(", ")})`);
    return T.evaluate(pilotOf(arm, overrides), setOf(cond, kind, range), { gauge: gaugeOf(cond), ...(seconds ? { seconds } : {}) });
}
export function rowsOf(res) {
    return COND_NAMES.map((c) => { const b4 = badOf(res["SEAT-04"][c]), b6 = badOf(res["SEAT-06"][c]), price = diffOf(res["SEAT-04"][c], res["SEAT-06"][c]); return { cond: c, b4, b6, noWorse: hullOk(b4, b6), price, priceVerdict: keepsOf(price) }; });
}
export function bottomLines(res) {
    const rows = rowsOf(res), worse = rows.filter((r) => !r.noWorse).map((r) => r.cond);
    return [...rows.map((r) => `SEAT-04'S HULL IS ${r.noWorse ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S IN ${r.cond}`),
        worse.length ? `THE MOVE IS HELD: SEAT-04'S HULL IS WORSE IN ${worse.join(", ")}` : "THE MOVE IS CONFIRMED: SEAT-04'S HULL IS NO WORSE IN ANY CONDITION"];
}
export function checksOf(res, { dives = DIVES, shipped = true } = {}) {
    const rows = [], sample = [[49001, "far"], [49077, "both"], [50350, "far"]];
    const gen = sample.every(([s, k]) => JSON.stringify(scenarioX(s, k, 3, 1)) === JSON.stringify(T.scenario(s, k)));
    rows.push({ name: "GENERATOR", ok: gen, text: `scenarioX at 3 stations and damage x1 equals needsTask.scenario on ${sample.length} samples: ${gen}` });
    const sizes = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.length === dives));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm has ${dives} dives in every condition: ${sizes}` });
    const aligned = COND_NAMES.every((c) => res["SEAT-04"][c].runs.every((r, i) => r.kind === res["SEAT-06"][c].runs[i].kind && r.damage0 === res["SEAT-06"][c].runs[i].damage0));
    rows.push({ name: "ALIGNED", ok: aligned, text: `in every condition both arms fly the same scenarios in the same order: ${aligned}` });
    const differ = COND_NAMES.every((c) => res["SEAT-04"][c].runs.some((r, i) => r.fingerprint !== res["SEAT-06"][c].runs[i].fingerprint));
    rows.push({ name: "THE ARMS DIFFER", ok: differ, text: `the arms differ on at least one dive of every condition: ${differ}` });
    rows.push({ name: "SEAT-06 IS THE SHIPPED SEAT", ok: shipped, text: `SEAT-06's pilot is surveyPilot() on the gate's dives, fingerprint for fingerprint: ${shipped}` });
    return rows;
}
/** Check 5, flown: SEAT-06 against surveyPilot() on the gate's two dives (both kinds, BIAS, 200 s: the shortest on which SEAT-04 and SEAT-06 differ there). True only while the shipped seat is low -0.06. */
export function shippedSame() {
    const o = { seconds: 200 }, set = KINDS.map((k) => setOf("BIAS", k, GATE_SEEDS)).flat(), g = { gauge: gaugeOf("BIAS"), seconds: 200 };
    const a = T.evaluate(pilotOf("SEAT-06", o), set, g), b = T.evaluate(SS.surveyPilot({ overrides: o }), set, g);
    return a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint);
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
export function report(res, opts = {}) {
    const L = [`ROUND 37: SEAT-04 (low -0.04) against SEAT-06 (low -0.06, the shipped seat when flown) in ${COND_NAMES.join(", ")}; ${DIVES} dives each, far and both`];
    const checks = checksOf(res, opts), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED and the constant is NOT changed.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    for (const r of rowsOf(res)) L.push(`  ${r.cond.padEnd(5)} SEAT-04 ${res["SEAT-04"][r.cond].score.toFixed(4)} (${res["SEAT-04"][r.cond].crashed}/${res["SEAT-04"][r.cond].stranded})  SEAT-06 ${res["SEAT-06"][r.cond].score.toFixed(4)} (${res["SEAT-06"][r.cond].crashed}/${res["SEAT-06"][r.cond].stranded})  hull ${r.b4} vs ${r.b6} ${r.noWorse ? "no worse" : "WORSE"}  price ${sgn(r.price.mean)} (se ${r.price.se.toFixed(4)}) ${r.priceVerdict} (reported)`);
    for (const l of bottomLines(res)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
