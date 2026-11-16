// WebGLEngine/tools/ship/gaugeShift.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/gaugeShiftCmd.mjs; the gate is tools/ship/gaugeShift-selfcheck.mjs)
//
// ROUND 35 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): is the Round 33 shift what crushes the seat under a biased gauge? The shipped seat (twin planner,
// SURVEY_CONSTANTS) against the same planner on the Round 8 constants (SURVEY_R8), each under REF (noise sd 0.10) and BIAS (+0.10, Round 34's fault), on 300 fresh `both` dives
// (seeds 45001-45300). Four verdicts: Round 34's failure replicates; the Round 8 seat holds its hull; the shift is what crushes; going back to the Round 8 constants costs score.
// THE SEEDS ARE READ ONLY BY flyJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as Q from "../../brain/plannerPerturbed.mjs";
import { gaugeOfCond, diffOf, keepsOf, hullOk, badOf, mergeKinds } from "./gaugeFaults.mjs";

export { hullOk, mergeKinds, diffOf };
export const KIND = "both", SEEDS = Object.freeze([45001, 45300]), GATE_SEEDS = Object.freeze([45901, 45902]), DIVES = 300, CHUNKS = 4;
export const ARMS = Object.freeze(["SEAT", "SEAT-R8"]), COND_NAMES = Object.freeze(["REF", "BIAS"]);
/** The pilot of an arm: the shipped seat, or the same planner and profile on the Round 8 constants. `overrides` is for the gate. */
export function pilotOf(arm, overrides = {}) {
    if (arm === "SEAT") return SS.surveyPilot({ overrides });
    if (arm === "SEAT-R8") return T.flyDecision(Q.perturbedSeat(SS.SURVEY_R8, {}, SS.planOf("standard", overrides)));
    throw new Error(`gaugeShift.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
/** The seeds of chunk j of CHUNKS (the run splits each arm and condition into equal seed ranges so the pool can share them out). */
export function chunkRange(j, range = SEEDS) {
    const n = range[1] - range[0] + 1, per = Math.ceil(n / CHUNKS);
    if (!(j >= 0 && j < CHUNKS && Number.isInteger(j))) throw new Error(`gaugeShift.chunkRange: chunk ${j} is not 0..${CHUNKS - 1}`);
    return [range[0] + j * per, Math.min(range[1], range[0] + (j + 1) * per - 1)];
}
export const JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => Array.from({ length: CHUNKS }, (_, j) => [a, c, String(j)]))));
/** One job: an arm, a condition, a chunk of the seeds. `opts` ({ range, seconds, overrides }) is for the gate. */
export function flyJob(arm, cond, chunk, { range = SEEDS, seconds = null, overrides = {} } = {}) {
    if (!COND_NAMES.includes(cond)) throw new Error(`gaugeShift.flyJob: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    const [a, b] = chunkRange(Number(chunk), range);
    return T.evaluate(pilotOf(arm, overrides), T.setOf([KIND], a, b), { gauge: gaugeOfCond(cond), ...(seconds ? { seconds } : {}) });
}
/** res[arm][cond] = evaluate result over all 300 dives (chunks merged, in seed order). */
export function verdictsOf(res) {
    const b = (a, c) => badOf(res[a][c]);
    const v1 = !hullOk(b("SEAT", "BIAS"), b("SEAT", "REF")), v2 = hullOk(b("SEAT-R8", "BIAS"), b("SEAT-R8", "REF")), v3 = !hullOk(b("SEAT", "BIAS"), b("SEAT-R8", "BIAS"));
    const price = diffOf(res["SEAT-R8"].REF, res.SEAT.REF), priceBias = diffOf(res["SEAT-R8"].BIAS, res.SEAT.BIAS), v4 = keepsOf(price) === "HURTS";
    return { v1, v2, v3, v4, price, priceBias, bad: Object.fromEntries(ARMS.map((a) => [a, Object.fromEntries(COND_NAMES.map((c) => [c, b(a, c)]))])) };
}
export function bottomLines(res) {
    const v = verdictsOf(res);
    return [
        v.v1 ? "ROUND 34'S FAILURE REPLICATES: THE SEAT'S HULL PAYS MORE UNDER BIAS" : "ROUND 34'S FAILURE DOES NOT REPLICATE",
        v.v2 ? "THE SEAT ON THE ROUND 8 CONSTANTS HOLDS ITS HULL UNDER BIAS" : "THE SEAT ON THE ROUND 8 CONSTANTS PAYS MORE UNDER BIAS",
        v.v3 ? "THE SHIFT IS WHAT CRUSHES" : "THE SHIFT IS NOT SHOWN TO CRUSH",
        v.v4 ? "GOING BACK TO THE ROUND 8 CONSTANTS COSTS SCORE" : "GOING BACK TO THE ROUND 8 CONSTANTS COSTS NO SCORE THE TEST CAN SEE",
    ];
}
export function checksOf(res, { dives = DIVES } = {}) {
    const rows = [], ref = res.SEAT.REF.runs, sample = [SEEDS[0], SEEDS[0] + 150, SEEDS[1]];
    const gen = sample.every((s) => JSON.stringify(T.setOf([KIND], s, s)[0]) === JSON.stringify(T.scenario(s, KIND)));
    rows.push({ name: "GENERATOR", ok: gen, text: `the scenarios are needsTask.scenario's on ${sample.length} samples: ${gen}` });
    const sizes = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.length === dives));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm has ${dives} dives in both conditions: ${sizes}` });
    const aligned = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.every((r, i) => r.kind === KIND && r.damage0 === ref[i].damage0)));
    rows.push({ name: "ALIGNED", ok: aligned, text: `every arm and condition flies the same scenarios in the same order: ${aligned}` });
    const bite = ARMS.every((a) => res[a].BIAS.runs.some((r, i) => r.fingerprint !== res[a].REF.runs[i].fingerprint));
    rows.push({ name: "THE FAULT REACHES THE PILOT", ok: bite, text: `each arm's BIAS dives differ from its REF dives on at least one dive: ${bite}` });
    const differ = res.SEAT.REF.runs.some((r, i) => r.fingerprint !== res["SEAT-R8"].REF.runs[i].fingerprint);
    rows.push({ name: "THE ARMS DIFFER", ok: differ, text: `SEAT and SEAT-R8 differ on at least one REF dive: ${differ}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}; better ${p.better}, worse ${p.worse})`;
export function report(res, opts = {}) {
    const L = [`ROUND 35: the shipped seat against the seat on the Round 8 constants, REF and +0.10 BIAS; seeds ${SEEDS[0]}-${SEEDS[1]}, ${KIND}`];
    const checks = checksOf(res, opts), bad = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (bad.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const v = verdictsOf(res);
    for (const a of ARMS) L.push(`  ${a.padEnd(8)} ` + COND_NAMES.map((c) => `${c} ${res[a][c].score.toFixed(4)} (${res[a][c].crashed}/${res[a][c].stranded})`).join("   ") + `   bias cost ${fmt(diffOf(res[a].BIAS, res[a].REF))}`);
    L.push(`hull (crushed+stranded): SEAT ${v.bad.SEAT.REF} -> ${v.bad.SEAT.BIAS}; SEAT-R8 ${v.bad["SEAT-R8"].REF} -> ${v.bad["SEAT-R8"].BIAS}`);
    L.push(`SEAT-R8 minus SEAT: REF ${fmt(v.price)} (weighed); BIAS ${fmt(v.priceBias)} (reported)`);
    for (const a of ARMS) L.push(`  ${a} crushed under BIAS, start damage: ` + (res[a].BIAS.runs.filter((r) => r.crushed).map((r) => r.damage0.toFixed(2)).join(", ") || "none"));
    for (const l of bottomLines(res)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
