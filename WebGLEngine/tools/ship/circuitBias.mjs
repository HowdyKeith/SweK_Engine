// WebGLEngine/tools/ship/circuitBias.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/circuitBiasCmd.mjs; the gate is tools/ship/circuitBias-selfcheck.mjs)
//
// ROUND 38 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): the Sub Aquarium's two decision-circuit survey profiles still fly the -0.06 base
// (render/subAquariumCircuit.mjs `rule` and `circuit`) after the shipped seat moved to -0.04 at Round 37. Four arms -- C06 (the circuit profile as it ships), C04 (the SAME
// weights on the -0.04 base, nothing retrained), R06 (the rule profile as it ships) and SEAT-04 (the shipped survey seat) -- under REF (noise sd 0.10) and BIAS (+0.10),
// on 300 fresh `both` dives (seeds 51001-51300). Per arm: does its hull hold under BIAS against its own REF; does the circuit's hull hold against the shipped seat's;
// and what does moving the circuit's base cost at REF. CHANGES NOTHING THAT SHIPS.
// THE SEEDS ARE READ ONLY BY flyJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as CS from "../../brain/circuitSeat.mjs";
import { PLAIN_CHAMPION } from "../../render/subAquariumCircuitWeights.mjs";
import { gaugeOfCond, diffOf, keepsOf, hullOk, badOf } from "./gaugeFaults.mjs";
import { mergeKinds } from "./plannerCap.mjs";

export { hullOk, mergeKinds, diffOf, keepsOf, badOf };
export const KIND = "both", SEEDS = Object.freeze([51001, 51300]), GATE_SEEDS = Object.freeze([51901, 51902]), DIVES = 300, CHUNKS = 4;
export const ARMS = Object.freeze(["C06", "C04", "R06", "SEAT-04"]), COND_NAMES = Object.freeze(["REF", "BIAS"]);
// The bases BY VALUE (as Rounds 34-37 name what they flew): the Round 8 constants with low moved by -0.06 and by -0.04, nothing else.
export const BASE_06 = Object.freeze({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.06 }), BASE_04 = Object.freeze({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.04 });
let plain = null;
const plainPolicy = () => plain || (plain = CS.createPlainPolicy(PLAIN_CHAMPION.hidden, "plain"));
/** The circuit profile's seat on a base: the champion's weights through circuitSeat.makeSeat with the given constants (the aquarium's builds the same seat on BASE_PARAMS). */
export const circuitSeatOn = (base) => { const Pol = plainPolicy(), w = Float32Array.from(PLAIN_CHAMPION.weights); return () => CS.makeSeat(Pol.stepper(w), { params: base, bounds: U.WIDE_BOUNDS }); };
/** The pilot of an arm. `overrides` is for the gate (shortened dives for the shipped seat's planner); the real run never passes it. */
export function pilotOf(arm, overrides = {}) {
    if (arm === "C06") return T.flyDecision(circuitSeatOn(BASE_06));
    if (arm === "C04") return T.flyDecision(circuitSeatOn(BASE_04));
    if (arm === "R06") return T.flyDecision(U.tunedSeat(BASE_06, U.WIDE_BOUNDS));
    if (arm === "SEAT-04") return SS.surveyPilot({ overrides });
    throw new Error(`circuitBias.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
export function chunkRange(j, range = SEEDS) {
    const n = range[1] - range[0] + 1, per = Math.ceil(n / CHUNKS);
    if (!(Number.isInteger(j) && j >= 0 && j < CHUNKS)) throw new Error(`circuitBias.chunkRange: chunk ${j} is not 0..${CHUNKS - 1}`);
    return [range[0] + j * per, Math.min(range[1], range[0] + (j + 1) * per - 1)];
}
export const JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => Array.from({ length: CHUNKS }, (_, j) => [a, c, String(j)]))));
export function flyJob(arm, cond, chunk, { range = SEEDS, seconds = null, overrides = {} } = {}) {
    if (!COND_NAMES.includes(cond)) throw new Error(`circuitBias.flyJob: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    const [a, b] = chunkRange(Number(chunk), range);
    return T.evaluate(pilotOf(arm, overrides), T.setOf([KIND], a, b), { gauge: gaugeOfCond(cond), ...(seconds ? { seconds } : {}) });
}
/** The verdicts of section 4. res[arm][cond] = an evaluate result over the 300 dives. */
export function verdictsOf(res) {
    const bad = Object.fromEntries(ARMS.map((a) => [a, { REF: badOf(res[a].REF), BIAS: badOf(res[a].BIAS) }]));
    const v1 = Object.fromEntries(ARMS.map((a) => [a, hullOk(bad[a].BIAS, bad[a].REF)]));
    const v2 = hullOk(bad.C06.BIAS, bad["SEAT-04"].BIAS), v2b = hullOk(bad.C04.BIAS, bad["SEAT-04"].BIAS);
    const price = diffOf(res.C04.REF, res.C06.REF), v3 = keepsOf(price);
    return { bad, v1, v2, v2b, price, v3 };
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)})`;
export function bottomLines(res) {
    const v = verdictsOf(res);
    const first = v.v1.C06 && v.v2 ? "THE CIRCUIT PROFILE ON -0.06 HOLDS ITS HULL UNDER BIAS: NOTHING TO MOVE"
        : v.v1.C04 && v.v2b ? `THE CIRCUIT PROFILE PAYS MORE UNDER BIAS ON -0.06 AND HOLDS ON -0.04 (price at REF: ${fmt(v.price)} ${v.v3})`
        : "THE CIRCUIT PROFILE PAYS MORE UNDER BIAS ON EITHER BASE";
    return [first, `THE RULE PROFILE ON -0.06 ${v.v1.R06 ? "HOLDS ITS HULL UNDER BIAS" : "PAYS MORE UNDER BIAS"}`];
}
export function checksOf(res, { dives = DIVES, profiles = true, shipped = true } = {}) {
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
    rows.push({ name: "THE ARMS DIFFER", ok: differ, text: `every pair of arms differs on at least one REF dive: ${differ}` });
    rows.push({ name: "C06 AND R06 ARE THE AQUARIUM'S PROFILES", ok: profiles, text: `C06 and R06 against subAquariumCircuit.circuitSeat("circuit") and ("rule") on the gate's two dives, fingerprint for fingerprint: ${profiles}` });
    rows.push({ name: "SEAT-04 IS THE SHIPPED SEAT", ok: shipped, text: `the SEAT-04 arm against surveyPilot() on the gate's two dives, fingerprint for fingerprint: ${shipped}` });
    return rows;
}
/**
 * Checks 6 and 7, flown: the library's arms against the shipped seats on the gate's two dives (BIAS). `circuitSeatOf` is subAquariumCircuit.circuitSeat, passed in so this library does not import the render tree twice.
 * 2026-11-20: check 6 (profilesSame) now flies FULL dives. It flew 60 s dives, on which the -0.06 and -0.04 rules fly the same (measured on the gate's two dives), so it could never tell
 * the two bases apart and stayed true after Round 39 moved the rule profile. Round 38's result does not change: what established C06 and R06 then was the gate's full-dive row.
 * Against TODAY's aquarium the check is false (Rounds 39 and 40 moved both profiles); against the profiles as Round 38 flew them it is true. Full dives cost about 0.7 s here.
 * Check 7 (shippedSame) keeps 60 s: SEAT-04 is surveyPilot() by construction, and the planner's dives are the expensive ones.
 */
export function profilesSame(circuitSeatOf) {
    const set = T.setOf([KIND], GATE_SEEDS[0], GATE_SEEDS[1]), g = { gauge: gaugeOfCond("BIAS") }, fp = (p) => T.evaluate(p, set, g).runs.map((r) => r.fingerprint).join("|");
    return fp(pilotOf("C06")) === fp(T.flyDecision(circuitSeatOf("circuit"))) && fp(pilotOf("R06")) === fp(T.flyDecision(circuitSeatOf("rule")));
}
export function shippedSame() {
    const o = { seconds: 60 }, set = T.setOf([KIND], GATE_SEEDS[0], GATE_SEEDS[1]), g = { gauge: gaugeOfCond("BIAS"), seconds: 60 };
    const a = T.evaluate(pilotOf("SEAT-04", o), set, g), b = T.evaluate(SS.surveyPilot({ overrides: o }), set, g);
    return a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint);
}
export function report(res, opts = {}) {
    const L = [`ROUND 38: the aquarium's circuit profiles (${ARMS.join(", ")}) under REF and +0.10 BIAS; seeds ${SEEDS[0]}-${SEEDS[1]}, ${KIND}`];
    const checks = checksOf(res, opts), failed = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const v = verdictsOf(res);
    for (const a of ARMS) L.push(`  ${a.padEnd(8)} REF ${res[a].REF.score.toFixed(4)} (${res[a].REF.crashed}/${res[a].REF.stranded})  BIAS ${res[a].BIAS.score.toFixed(4)} (${res[a].BIAS.crashed}/${res[a].BIAS.stranded})  V1 ${a} ${v.v1[a] ? "HOLDS ITS HULL UNDER BIAS" : "PAYS MORE UNDER BIAS"}`);
    L.push(`  V2  C06'S HULL IS ${v.v2 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S UNDER BIAS (${v.bad.C06.BIAS} against ${v.bad["SEAT-04"].BIAS})`);
    L.push(`  V2b C04'S HULL IS ${v.v2b ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S UNDER BIAS (${v.bad.C04.BIAS} against ${v.bad["SEAT-04"].BIAS})`);
    L.push(`  V3  the price of the move at REF, C04 minus C06: ${fmt(v.price)} ${v.v3}`);
    L.push(`REPORTED, NOT WEIGHED: C06 minus SEAT-04 REF ${fmt(diffOf(res.C06.REF, res["SEAT-04"].REF))}, BIAS ${fmt(diffOf(res.C06.BIAS, res["SEAT-04"].BIAS))}; C04 minus SEAT-04 REF ${fmt(diffOf(res.C04.REF, res["SEAT-04"].REF))}, BIAS ${fmt(diffOf(res.C04.BIAS, res["SEAT-04"].BIAS))}; R06 crushed under BIAS ${res.R06.BIAS.crashed} (Round 34's L06: 8 of 300)`);
    for (const l of bottomLines(res)) L.push(`BOTTOM LINE: ${l}`);
    return L;
}
