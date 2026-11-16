// WebGLEngine/tools/ship/gaugeFaults.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/gaugeFaultsCmd.mjs; the gate is tools/ship/gaugeFaults-selfcheck.mjs)
//
// ROUND 34 of brain/NEEDS_AND_LIMITS.md ("gauge faults", registered before this file existed): the charge gauge made WRONG as well as noisy -- a +0.10 bias, a drift to +0.15
// over the dive, a reading that sticks for the second half of every minute -- flown with four arms on the same 300 dives (seeds 43001-43150, far and both) in every condition:
// R8 (the Round 8 rule, filter alpha 0.001), R8-RAW (the same constants with the filter taken out, alpha 1), L06 (the Round 33 constants) and SEAT (the shipped survey seat).
// Three verdicts per fault: is the filter a liability (R8-RAW beats R8 by max(0.02, 2 se)), does each arm's hull pay more than under REF (Round 33's Poisson test, the same
// dives), does the seat keep its lead over R8 (positive and above 2 se).
// THE SEEDS ARE READ ONLY BY flyJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import { hullOk } from "./plannerTolerate.mjs";
import { mergeKinds } from "./plannerCap.mjs";

export { hullOk, mergeKinds };
export const KINDS = Object.freeze(["far", "both"]), SEEDS = Object.freeze([43001, 43150]), GATE_SEEDS = Object.freeze([43901, 43902]), DIVES = 300, SD = 0.1, MARGIN = 0.02, SE_FACTOR = 2;
/** The registered faults (section 2). REF has none. */
export const FAULTS = Object.freeze({
    REF: null,
    BIAS: Object.freeze({ bias: 0.10 }),
    DRIFT: Object.freeze({ driftPerS: 0.15 / 600 }),
    DROP: Object.freeze({ dropEveryS: 60, dropFromS: 30 }),
});
export const COND_NAMES = Object.freeze(Object.keys(FAULTS)), FAULT_NAMES = Object.freeze(COND_NAMES.filter((c) => c !== "REF"));
export const ARMS = Object.freeze(["R8", "R8-RAW", "L06", "SEAT"]);
/** WIDE_BOUNDS with alpha's upper bound widened to admit 1 (the filter taken out); every other bound as it is. */
export const RAW_BOUNDS = Object.freeze({ ...U.WIDE_BOUNDS, alpha: Object.freeze([U.WIDE_BOUNDS.alpha[0], 1]) });
export const RAW_CONSTANTS = Object.freeze({ ...SS.SURVEY_R8, alpha: 1 });
/** The pilot factory of an arm. `overrides` is for the gate (shortened dives for the seat's planner); the real run never passes it. */
export function pilotOf(arm, overrides = {}) {
    if (arm === "R8") return T.flyDecision(U.tunedSeat(SS.SURVEY_R8, U.WIDE_BOUNDS));
    if (arm === "R8-RAW") return T.flyDecision(U.tunedSeat(RAW_CONSTANTS, RAW_BOUNDS));
    if (arm === "L06") return T.flyDecision(U.tunedSeat(SS.SURVEY_CONSTANTS, U.WIDE_BOUNDS));
    if (arm === "SEAT") return SS.surveyPilot({ overrides });
    throw new Error(`gaugeFaults.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
/** The gauge of a condition: the registered noise plus the condition's fault (none for REF). */
export function gaugeOfCond(cond) {
    if (!Object.prototype.hasOwnProperty.call(FAULTS, cond)) throw new Error(`gaugeFaults.gaugeOfCond: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    return FAULTS[cond] ? { sd: SD, hz: T.GAUGE.hz, fault: FAULTS[cond] } : { sd: SD, hz: T.GAUGE.hz };
}
/** The scenarios of one kind, seed-ordered; `range` is for the gate. */
export const setOfKind = (kind, range = SEEDS) => T.setOf([kind], range[0], range[1]);
export const JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => KINDS.map((k) => [a, c, k]))));
/** One job: an arm, a condition, a kind. `opts` ({ range, seconds, overrides }) is for the gate. */
export function flyJob(arm, cond, kind, { range = SEEDS, seconds = null, overrides = {} } = {}) {
    if (!KINDS.includes(kind)) throw new Error(`gaugeFaults.flyJob: unknown kind ${JSON.stringify(kind)} (${KINDS.join(", ")})`);
    return T.evaluate(pilotOf(arm, overrides), setOfKind(kind, range), { gauge: gaugeOfCond(cond), ...(seconds ? { seconds } : {}) });
}
/** The gauge formula as it was before Round 34, frozen here for check 2 (NO FAULT, NO CHANGE). */
export function oldGaugeOf(sc, { sd = T.GAUGE.sd, hz = T.GAUGE.hz } = {}, dt = T.DT) {
    let s = (sc.seed * 15485863 + T.KINDS.indexOf(sc.kind) * 32452843 + 977) >>> 0;
    const rng = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const every = Math.max(1, Math.round(1 / (hz * dt)));
    let held = null;
    return (i, frac) => { if (held === null || i % every === 0) { const v = frac + sd * gauss(); held = v < 0 ? 0 : v > 1 ? 1 : v; } return held; };
}
const meanOf = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const seOf = (a) => { if (a.length < 2) return 0; const m = meanOf(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1) / a.length); };
/** The pooled paired difference a - b over the same dives. */
export function diffOf(a, b) {
    if (a.runs.length !== b.runs.length) throw new Error("gaugeFaults.diffOf: results over different numbers of dives");
    const d = a.runs.map((r, i) => r.score - b.runs[i].score);
    return { n: d.length, mean: meanOf(d), se: seOf(d), better: d.filter((x) => x > 1e-9).length, worse: d.filter((x) => x < -1e-9).length };
}
/** The series' margin: A beats B iff the pooled paired difference exceeds max(0.02, 2 se). */
export const beats = (p) => p.mean > Math.max(MARGIN, SE_FACTOR * p.se);
/** The series' KEEPS / HURTS / LOSES on a pooled difference. */
export const keepsOf = (p) => (p.mean > 0 && p.mean > SE_FACTOR * p.se ? "KEEPS" : p.mean < 0 && -p.mean > SE_FACTOR * p.se ? "HURTS" : "LOSES");
export const badOf = (r) => r.crashed + r.stranded;
/** res[arm][cond] = evaluate result over all 300 dives (kinds merged). */
export function faultOf(res, c) {
    const filter = diffOf(res["R8-RAW"][c], res.R8[c]), lead = diffOf(res.SEAT[c], res.R8[c]);
    const hull = Object.fromEntries(ARMS.map((a) => [a, { bad: badOf(res[a][c]), ref: badOf(res[a].REF), ok: hullOk(badOf(res[a][c]), badOf(res[a].REF)) }]));
    return { cond: c, filter, liability: beats(filter), lead, leadVerdict: keepsOf(lead), hull };
}
export function bottomLines(res) {
    const fs = FAULT_NAMES.map((c) => faultOf(res, c)), liab = fs.filter((x) => x.liability).map((x) => x.cond), pays = (a) => fs.filter((x) => !x.hull[a].ok).map((x) => x.cond);
    const hullLine = (a, who) => (pays(a).length ? `${who} HULL PAYS MORE UNDER ${pays(a).join(", ")}` : `${who} HULL HOLDS UNDER ALL THREE FAULTS`);
    return [
        liab.length ? `THE FILTER IS A LIABILITY UNDER ${liab.join(", ")}` : "THE FILTER IS NOT A LIABILITY UNDER ANY FAULT",
        hullLine("SEAT", "THE SEAT'S"),
        ...fs.map((x) => `THE SEAT ${x.leadVerdict === "KEEPS" ? "KEEPS" : x.leadVerdict === "HURTS" ? "HURTS" : "LOSES"} ITS LEAD OVER THE ROUND 8 RULE UNDER ${x.cond}`),
    ];
}
export function checksOf(res, { dives = DIVES } = {}) {
    const rows = [], sample = [[SEEDS[0], "far"], [SEEDS[0] + 76, "both"], [SEEDS[1], "far"]];
    const gen = res.R8.REF.runs.length > 0 && sample.every(([s, k]) => JSON.stringify(setOfKind(k, [s, s])[0]) === JSON.stringify(T.scenario(s, k)));
    rows.push({ name: "GENERATOR", ok: gen, text: `the scenarios are needsTask.scenario's on ${sample.length} samples: ${gen}` });
    let same = true;
    for (const [s, k] of sample) {
        const sc = T.scenario(s, k), a = T.gaugeOf(sc, { sd: SD, hz: T.GAUGE.hz }), b = oldGaugeOf(sc, { sd: SD, hz: T.GAUGE.hz });
        for (let i = 0; i < 4000; i++) { const f = 1 - i / 5000; if (!Object.is(a(i, f), b(i, f))) { same = false; break; } }
    }
    rows.push({ name: "NO FAULT, NO CHANGE", ok: same, text: `with no fault, gaugeOf returns the pre-Round-34 formula's readings bit for bit (${sample.length} scenarios x 4000 ticks): ${same}` });
    const sizes = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.length === dives));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm has ${dives} dives in every condition: ${sizes}` });
    const ref = res.R8.REF.runs, aligned = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.every((r, i) => r.kind === ref[i].kind && r.damage0 === ref[i].damage0)));
    rows.push({ name: "ALIGNED", ok: aligned, text: `every arm and condition flies the same scenarios in the same order: ${aligned}` });
    const bite = FAULT_NAMES.every((c) => res.R8[c].runs.some((r, i) => r.fingerprint !== ref[i].fingerprint));
    rows.push({ name: "THE FAULTS REACH THE PILOT", ok: bite, text: `in each fault condition R8 differs from its REF dives on at least one dive: ${bite}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse})`;
export function report(res, opts = {}) {
    const L = [`ROUND 34: gauge faults (bias +0.10, drift to +0.15, the reading stuck for the second half of every minute) on noise sd ${SD}; seeds ${SEEDS[0]}-${SEEDS[1]}, ${KINDS.join(" and ")}; arms ${ARMS.join(", ")}`];
    const checks = checksOf(res, opts), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    L.push("means (crushed / stranded):");
    for (const a of ARMS) L.push(`  ${a.padEnd(7)} ` + COND_NAMES.map((c) => `${c} ${res[a][c].score.toFixed(4)} (${res[a][c].crashed}/${res[a][c].stranded})`).join("   "));
    L.push("fault cost (condition minus REF, the same dives):");
    for (const a of ARMS) L.push(`  ${a.padEnd(7)} ` + FAULT_NAMES.map((c) => `${c} ${fmt(diffOf(res[a][c], res[a].REF))}`).join("   "));
    L.push("L06 minus R8: " + COND_NAMES.map((c) => `${c} ${fmt(diffOf(res.L06[c], res.R8[c]))}`).join("   "));
    for (const c of FAULT_NAMES) {
        const x = faultOf(res, c);
        L.push(`${c}: the filter (R8-RAW minus R8) ${fmt(x.filter)} -> ${x.liability ? "A LIABILITY" : "not a liability"}; the seat's lead (SEAT minus R8) ${fmt(x.lead)} -> ${x.leadVerdict}`,
            `   hull (crushed+stranded under ${c} against REF, Poisson test): ` + ARMS.map((a) => `${a} ${x.hull[a].bad} vs ${x.hull[a].ref} ${x.hull[a].ok ? "holds" : "PAYS MORE"}`).join(", "));
    }
    for (const a of ARMS.filter((a) => a !== "SEAT")) { const p = FAULT_NAMES.filter((c) => !faultOf(res, c).hull[a].ok); L.push(`REPORTED: ${a}'s hull ${p.length ? "pays more under " + p.join(", ") : "holds under all three faults"}`); }
    for (const l of bottomLines(res)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
