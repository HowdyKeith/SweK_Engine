// WebGLEngine/tools/ship/ruleMove.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/ruleMoveCmd.mjs; the gate is tools/ship/ruleMove-selfcheck.mjs)
//
// ROUND 39 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): Keith's option (b) after Round 38 -- the Sub Aquarium's `rule` profile moved from low -0.06 to
// low -0.04, confirmed against the profile it replaces before it changes. R04 (tunedSeat on the Round 8 constants with low -0.04, WIDE_BOUNDS) against R06 (the same on low -0.06,
// the aquarium's rule profile when the round was flown), in Round 37's six conditions (plannerRobust.scenarioX), 300 dives each (far and both), on fresh seeds. Built from
// tools/ship/ruleMove.mjs (Round 37), changed only in the arms, the seeds and check 5. THE SEEDS ARE READ ONLY BY flyJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import { scenarioX } from "./plannerRobust.mjs";
import { diffOf, keepsOf, hullOk, badOf, mergeKinds } from "./gaugeFaults.mjs";

export { hullOk, mergeKinds, diffOf };
export const KINDS = Object.freeze(["far", "both"]), DIVES = 300, GATE_SEEDS = Object.freeze([54901, 54902]);
export const CONDITIONS = Object.freeze({
    REF: Object.freeze({ count: 3, damageScale: 1, sd: 0.1, bias: 0, seeds: [53001, 53150] }),
    DMG: Object.freeze({ count: 3, damageScale: 1.6, sd: 0.1, bias: 0, seeds: [53201, 53350] }),
    N20: Object.freeze({ count: 3, damageScale: 1, sd: 0.2, bias: 0, seeds: [53401, 53550] }),
    N30: Object.freeze({ count: 3, damageScale: 1, sd: 0.3, bias: 0, seeds: [53601, 53750] }),
    STN5: Object.freeze({ count: 5, damageScale: 1, sd: 0.1, bias: 0, seeds: [53801, 53950] }),
    BIAS: Object.freeze({ count: 3, damageScale: 1, sd: 0.1, bias: 0.1, seeds: [54201, 54350] }),
});
export const COND_NAMES = Object.freeze(Object.keys(CONDITIONS));
/** The two arms' constants, by value: the Round 8 constants with low moved by -0.04 and -0.06. */
export const R8 = Object.freeze({ alpha: 0.001, low: 0.3803560726214647, high: 0.68938489754682, ramp: 20, cap: 0.8861494767879255 });
export const ARM_CONSTANTS = Object.freeze({ R04: Object.freeze({ ...R8, low: R8.low - 0.04 }), R06: Object.freeze({ ...R8, low: R8.low - 0.06 }) });
export const ARMS = Object.freeze(Object.keys(ARM_CONSTANTS));
export function pilotOf(arm) {
    if (!ARM_CONSTANTS[arm]) throw new Error(`ruleMove.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
    return T.flyDecision(U.tunedSeat(ARM_CONSTANTS[arm], U.WIDE_BOUNDS));
}
export function gaugeOf(cond) {
    const c = CONDITIONS[cond]; if (!c) throw new Error(`ruleMove.gaugeOf: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    return c.bias ? { sd: c.sd, hz: T.GAUGE.hz, fault: { bias: c.bias } } : { sd: c.sd, hz: T.GAUGE.hz };
}
export const setOf = (cond, kind, range = null) => { const c = CONDITIONS[cond], [a, b] = range || c.seeds; return Array.from({ length: b - a + 1 }, (_, i) => scenarioX(a + i, kind, c.count, c.damageScale)); };
export const JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => KINDS.map((k) => [a, c, k]))));
export function flyJob(arm, cond, kind, { range = null, seconds = null } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`ruleMove.flyJob: unknown kind ${JSON.stringify(kind)} (${KINDS.join(", ")})`);
    return T.evaluate(pilotOf(arm), setOf(cond, kind, range), { gauge: gaugeOf(cond), ...(seconds ? { seconds } : {}) });
}
export function rowsOf(res) {
    return COND_NAMES.map((c) => { const b4 = badOf(res.R04[c]), b6 = badOf(res.R06[c]), price = diffOf(res.R04[c], res.R06[c]); return { cond: c, b4, b6, noWorse: hullOk(b4, b6), price, priceVerdict: keepsOf(price) }; });
}
export function bottomLines(res) {
    const rows = rowsOf(res), worse = rows.filter((r) => !r.noWorse).map((r) => r.cond);
    return [...rows.map((r) => `R04'S HULL IS ${r.noWorse ? "NO WORSE THAN" : "WORSE THAN"} R06'S IN ${r.cond}`),
        worse.length ? `THE MOVE IS HELD: R04'S HULL IS WORSE IN ${worse.join(", ")}` : "THE MOVE IS CONFIRMED: R04'S HULL IS NO WORSE IN ANY CONDITION"];
}
export function checksOf(res, { dives = DIVES, profile = true } = {}) {
    const rows = [], sample = [[53001, "far"], [53077, "both"], [54350, "far"]];
    const gen = sample.every(([s, k]) => JSON.stringify(scenarioX(s, k, 3, 1)) === JSON.stringify(T.scenario(s, k)));
    rows.push({ name: "GENERATOR", ok: gen, text: `scenarioX at 3 stations and damage x1 equals needsTask.scenario on ${sample.length} samples: ${gen}` });
    const sizes = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.length === dives));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm has ${dives} dives in every condition: ${sizes}` });
    const aligned = COND_NAMES.every((c) => res.R04[c].runs.every((r, i) => r.kind === res.R06[c].runs[i].kind && r.damage0 === res.R06[c].runs[i].damage0));
    rows.push({ name: "ALIGNED", ok: aligned, text: `in every condition both arms fly the same scenarios in the same order: ${aligned}` });
    const differ = COND_NAMES.every((c) => res.R04[c].runs.some((r, i) => r.fingerprint !== res.R06[c].runs[i].fingerprint));
    rows.push({ name: "THE ARMS DIFFER", ok: differ, text: `the arms differ on at least one dive of every condition: ${differ}` });
    rows.push({ name: "R06 IS THE AQUARIUM'S RULE PROFILE", ok: profile, text: `R06's pilot is subAquariumCircuit.circuitSeat("rule") on the gate's dives, fingerprint for fingerprint, flown before the profile changes: ${profile}` });
    return rows;
}
/** Check 5, flown: R06 against the aquarium's rule profile on the gate's two dives (both kinds, BIAS, full length). True only while the profile is low -0.06. `circuitSeatOf` is subAquariumCircuit.circuitSeat. */
export function profileSame(circuitSeatOf) {
    const set = KINDS.map((k) => setOf("BIAS", k, GATE_SEEDS)).flat(), g = { gauge: gaugeOf("BIAS") };
    const a = T.evaluate(pilotOf("R06"), set, g), b = T.evaluate(T.flyDecision(circuitSeatOf("rule")), set, g);
    return a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint);
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
export function report(res, opts = {}) {
    const L = [`ROUND 39: R04 (the rule, low -0.04) against R06 (low -0.06, the aquarium's rule profile when flown) in ${COND_NAMES.join(", ")}; ${DIVES} dives each, far and both`];
    const checks = checksOf(res, opts), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED and the profile is NOT changed.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    for (const r of rowsOf(res)) L.push(`  ${r.cond.padEnd(5)} R04 ${res.R04[r.cond].score.toFixed(4)} (${res.R04[r.cond].crashed}/${res.R04[r.cond].stranded})  R06 ${res.R06[r.cond].score.toFixed(4)} (${res.R06[r.cond].crashed}/${res.R06[r.cond].stranded})  hull ${r.b4} vs ${r.b6} ${r.noWorse ? "no worse" : "WORSE"}  price ${sgn(r.price.mean)} (se ${r.price.se.toFixed(4)}) ${r.priceVerdict} (reported)`);
    for (const l of bottomLines(res)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
