// WebGLEngine/tools/ship/gaugeCurve.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/gaugeCurveCmd.mjs; the gate is tools/ship/gaugeCurve-selfcheck.mjs)
//
// ROUND 36 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): the seat's planner on the Round 8 constants with low moved by 0, -0.02, -0.04 and -0.06 (the shipped
// seat), each under REF (noise sd 0.10) and BIAS (+0.10), on 300 fresh `both` dives (seeds 48001-48300). Per shift: does its hull hold under BIAS against its own REF, and does it
// keep a gain over L0 at REF; the bottom line names the largest shift that does both. The break-even price per crushed boat is REPORTED for Keith's choice, never weighed.
// THE SEEDS ARE READ ONLY BY flyJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { gaugeOfCond, diffOf, keepsOf, hullOk, badOf, mergeKinds } from "./gaugeFaults.mjs";

export { hullOk, mergeKinds, diffOf };
export const SHARES = Object.freeze([0.05, 0.25, 1]);
export const KIND = "both", SEEDS = Object.freeze([48001, 48300]), GATE_SEEDS = Object.freeze([48901, 48902]), DIVES = 300, CHUNKS = 4;
export const SHIFTS = Object.freeze([0, -0.02, -0.04, -0.06]), COND_NAMES = Object.freeze(["REF", "BIAS"]);
export const nameOf = (s) => (s === 0 ? "L0" : "L" + s.toFixed(2));
export const ARMS = Object.freeze(SHIFTS.map(nameOf));
export function shiftOf(arm) { const i = ARMS.indexOf(arm); if (i < 0) throw new Error(`gaugeCurve.shiftOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`); return SHIFTS[i]; }
/** The constants of an arm: the Round 8 constants with low moved by its shift, nothing else. L-0.06 is SURVEY_CONSTANTS exactly. */
// 2026-11-17 (Round 37): the seat moved to low -0.04. This round FLEW the seat on low -0.06, so the constants it names are written here BY VALUE (every arm, L-0.06 included), not read from surveySeat.
export const constantsOf = (arm) => { const s = shiftOf(arm); return Object.freeze({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low + s }); };
/** The pilot of an arm: the seat's planner and profile on the arm's constants. `overrides` is for the gate. */
export const pilotOf = (arm, overrides = {}) => T.flyDecision(Q.perturbedSeat(constantsOf(arm), {}, SS.planOf("standard", overrides)));
export function chunkRange(j, range = SEEDS) {
    const n = range[1] - range[0] + 1, per = Math.ceil(n / CHUNKS);
    if (!(Number.isInteger(j) && j >= 0 && j < CHUNKS)) throw new Error(`gaugeCurve.chunkRange: chunk ${j} is not 0..${CHUNKS - 1}`);
    return [range[0] + j * per, Math.min(range[1], range[0] + (j + 1) * per - 1)];
}
export const JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => Array.from({ length: CHUNKS }, (_, j) => [a, c, String(j)]))));
export function flyJob(arm, cond, chunk, { range = SEEDS, seconds = null, overrides = {} } = {}) {
    if (!COND_NAMES.includes(cond)) throw new Error(`gaugeCurve.flyJob: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    const [a, b] = chunkRange(Number(chunk), range);
    return T.evaluate(pilotOf(arm, overrides), T.setOf([KIND], a, b), { gauge: gaugeOfCond(cond), ...(seconds ? { seconds } : {}) });
}
/** The price per crushed boat (in score points, beyond the 0 the dive already scores) at which a shift is worth exactly what L0 is, when a share f of dives has the biased gauge:
 *  (1 - f) x gain at REF + f x gain under BIAS = f x extra / DIVES x price. null when the shift crushes no more than L0. */
export const breakEvenOf = (gRef, gBias, extra, f) => (extra > 0 ? (((1 - f) * gRef + f * gBias) * DIVES) / (f * extra) : null);
/** Per arm: the hull under BIAS against its own REF, the gain over L0 at REF (and under BIAS, reported), the extra crushed under BIAS over L0, the break-even price. */
export function rowsOf(res) {
    const z = ARMS[0];
    return ARMS.map((a) => {
        const bad = { REF: badOf(res[a].REF), BIAS: badOf(res[a].BIAS) }, gain = diffOf(res[a].REF, res[z].REF), gainBias = diffOf(res[a].BIAS, res[z].BIAS);
        const extra = bad.BIAS - badOf(res[z].BIAS), holds = hullOk(bad.BIAS, bad.REF), verdict = a === z ? "BASE" : keepsOf(gain);
        return { arm: a, shift: shiftOf(a), bad, holds, gain, gainBias, verdict, extra, breakEven: SHARES.map((f) => breakEvenOf(gain.mean, gainBias.mean, extra, f)) };
    });
}
export function bottomLines(res) {
    const rows = rowsOf(res), ok = rows.filter((r) => r.shift !== 0 && r.holds && r.verdict === "KEEPS").sort((a, b) => a.shift - b.shift);
    const hull = rows.filter((r) => r.shift !== 0).map((r) => `${r.arm} ${r.holds ? "HOLDS ITS HULL UNDER BIAS" : "PAYS MORE UNDER BIAS"}`);
    const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4);
    return [...hull, ok.length ? `THE LARGEST SHIFT THAT HOLDS ITS HULL UNDER BIAS AND KEEPS A GAIN IS LOW ${ok[0].shift.toFixed(2)} (${sgn(ok[0].gain.mean)} AT A SOUND GAUGE)` : "NO SHIFT HOLDS ITS HULL UNDER BIAS AND KEEPS A GAIN"];
}
export function checksOf(res, { dives = DIVES, shipped = true } = {}) {
    const rows = [], ref = res[ARMS[0]].REF.runs, sample = [SEEDS[0], SEEDS[0] + 150, SEEDS[1]];
    const gen = sample.every((s) => JSON.stringify(T.setOf([KIND], s, s)[0]) === JSON.stringify(T.scenario(s, KIND)));
    rows.push({ name: "GENERATOR", ok: gen, text: `the scenarios are needsTask.scenario's on ${sample.length} samples: ${gen}` });
    const sizes = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.length === dives));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm has ${dives} dives in both conditions: ${sizes}` });
    const aligned = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.every((r, i) => r.kind === KIND && r.damage0 === ref[i].damage0)));
    rows.push({ name: "ALIGNED", ok: aligned, text: `every arm and condition flies the same scenarios in the same order: ${aligned}` });
    const bite = ARMS.every((a) => res[a].BIAS.runs.some((r, i) => r.fingerprint !== res[a].REF.runs[i].fingerprint));
    rows.push({ name: "THE FAULT REACHES THE PILOT", ok: bite, text: `every arm's BIAS dives differ from its REF dives on at least one dive: ${bite}` });
    const differ = ARMS.every((a, i) => ARMS.slice(i + 1).every((b) => res[a].REF.runs.some((r, k) => r.fingerprint !== res[b].REF.runs[k].fingerprint)));
    rows.push({ name: "THE SHIFTS DIFFER", ok: differ, text: `every pair of arms differs on at least one REF dive: ${differ}` });
    rows.push({ name: "L-0.06 IS THE SHIPPED SEAT", ok: shipped, text: `the L-0.06 arm's pilot is surveyPilot() on the gate's two dives, fingerprint for fingerprint: ${shipped}` });
    return rows;
}
/** Check 6, flown: the L-0.06 arm against surveyPilot() on the gate's two dives (60 s). */
export function shippedSame() {
    const o = { seconds: 60 }, set = T.setOf([KIND], GATE_SEEDS[0], GATE_SEEDS[1]), g = { gauge: gaugeOfCond("BIAS"), seconds: 60 };
    const a = T.evaluate(pilotOf("L-0.06", o), set, g), b = T.evaluate(SS.surveyPilot({ overrides: o }), set, g);
    return a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint);
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)})`;
export function report(res, opts = {}) {
    const L = [`ROUND 36: the seat's low shift (${ARMS.join(", ")}) under REF and +0.10 BIAS; seeds ${SEEDS[0]}-${SEEDS[1]}, ${KIND}`];
    const checks = checksOf(res, opts), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    for (const r of rowsOf(res)) L.push(`  ${r.arm.padEnd(7)} REF ${res[r.arm].REF.score.toFixed(4)} (${res[r.arm].REF.crashed}/${res[r.arm].REF.stranded})  BIAS ${res[r.arm].BIAS.score.toFixed(4)} (${res[r.arm].BIAS.crashed}/${res[r.arm].BIAS.stranded})  hull ${r.holds ? "holds" : "PAYS MORE"}` +
        (r.shift === 0 ? "" : `  gain over L0: REF ${fmt(r.gain)} ${r.verdict}, BIAS ${fmt(r.gainBias)} (reported)  extra crushed under BIAS ${r.extra}  break-even price a crushed boat ${r.breakEven[0] === null ? "n/a (no extra)" : SHARES.map((f, i) => `${f * 100}% biased ${r.breakEven[i].toFixed(2)}`).join(", ")}`));
    L.push("REPORTED, NOT WEIGHED: the break-even price is the cost of one crushed boat, in score points beyond its 0, above which the shift is worth less than L0, for a gauge biased on 5, 25 and 100 percent of dives; the share is not known.");
    for (const l of bottomLines(res)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
