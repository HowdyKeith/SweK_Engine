// WebGLEngine/tools/ship/circuitRetrain.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/circuitRetrainCmd.mjs; the gate is tools/ship/circuitRetrain-selfcheck.mjs)
//
// ROUND 40 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): the decision-circuit net retrained with a biased gauge among its training conditions.
//   THE POLICY   brain/circuitSeat.mjs createPlainPolicy(84) -- the aquarium circuit's 21 -> 84 -> 7 relu net -- with its seat on the Round 8 constants with low -0.04 (BY VALUE), WIDE_BOUNDS.
//                Every readout starts at zero, so the untrained pilot IS R04 (tunedSeat on the same constants), decision for decision.
//   THE FITNESS  trainNeedsCircuit.search() unchanged, through the policy's `evaluate` seam: every evaluation flies the set TWICE, at the sound gauge and with +0.10 bias, and
//                returns their mean score (and their summed crushed / stranded, their runs one after the other). The same seam scores the held-out and the pool.
//   THE CHAMPION ELIGIBLE = crushed in no more POOL dives (both gauges) than the start; the best HELD-OUT of the eligible, ties to the lower k; none -> the start. Chosen from the
//                four search records BEFORE any audit seed is flown.
//   THE AUDIT    NEW (the champion), C06 (the aquarium's circuit profile as it ships) and SEAT-04 (the shipped seat) under REF and BIAS on 300 fresh `both` dives, 52001-52300.
// THE SEEDS ARE READ ONLY BY searchJob() AND auditJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as CS from "../../brain/circuitSeat.mjs";
import { RECIPE, setsOf, search } from "./trainNeedsCircuit.mjs";
import { gaugeOfCond, diffOf, keepsOf, hullOk, badOf } from "./gaugeFaults.mjs";
import { mergeKinds } from "./plannerCap.mjs";
import * as CB from "./circuitBias.mjs";

export { RECIPE, hullOk, mergeKinds, diffOf, keepsOf, badOf };
export const HIDDEN = 84, SEARCHES = RECIPE.runs, SEARCH_SEEDS = Object.freeze([97500, 97501, 97502, 97503]);
export const KIND = "both", SEEDS = Object.freeze([52001, 52300]), GATE_SEEDS = Object.freeze([52901, 52902]), DIVES = 300, CHUNKS = 4;
export const ARMS = Object.freeze(["NEW", "C06", "SEAT-04"]), COND_NAMES = Object.freeze(["REF", "BIAS"]);
/** The base, by value: the Round 8 constants with low -0.04 (the shipped seat's since Round 37). */
export const BASE_04 = Object.freeze({ ...SS.SURVEY_R8, low: SS.SURVEY_R8.low - 0.04 });
export const SOUND = gaugeOfCond("REF"), BIASED = gaugeOfCond("BIAS");
const round6 = (w) => Float32Array.from(w, (v) => Math.round(v * 1e6) / 1e6);
/** One result over both gauges: the mean score, the summed crushed and stranded, the runs of the sound gauge then the biased one. */
export function bothGauges(a, b) {
    if (a.runs.length !== b.runs.length) throw new Error("circuitRetrain.bothGauges: the two gauges flew different numbers of dives");
    return { score: (a.score + b.score) / 2, crashed: a.crashed + b.crashed, stranded: a.stranded + b.stranded, runs: [...a.runs, ...b.runs], sound: a.score, biased: b.score };
}
/** The policy of the round. `evalOf` is a seam for the gate (a stub evaluate); the real one is needsTask.evaluate. */
export function retrainPolicy({ evalOf = T.evaluate } = {}) {
    const base = CS.createPlainPolicy(HIDDEN, "plain-bias");
    const seatFor = (w) => () => CS.makeSeat(base.stepper(w), { params: BASE_04, bounds: U.WIDE_BOUNDS });
    const pilotFor = (w) => T.flyDecision(seatFor(w));
    const evaluate = (pilot, set) => bothGauges(evalOf(pilot, set, { gauge: SOUND }), evalOf(pilot, set, { gauge: BIASED }));
    return { ...base, name: "plain-bias", seatFor, pilotFor, evaluate };
}
/** One search: the record the training file keeps. `opts`: recipe, sets, policy (for the gate). */
export function searchJob(k, opts = {}) {
    if (!(Number.isInteger(k) && k >= 0 && k < SEARCHES)) throw new Error(`circuitRetrain.searchJob: search ${k} is not 0..${SEARCHES - 1}`);
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf(), Pol = opts.policy || retrainPolicy(), hand = Pol.handWeights();
    const sc = (w, set) => Pol.evaluate(Pol.pilotFor(w), set);
    const st = { train: sc(hand, sets.train), heldOut: sc(hand, sets.heldOut), pool: sc(hand, sets.pool) };
    const r = search(Pol, SEARCH_SEEDS[k], k, recipe, sets.train, null), w = round6(r.weights);
    const held = sc(w, sets.heldOut), pool = sc(w, sets.pool);
    return { k, seed: SEARCH_SEEDS[k], recipe, hidden: HIDDEN, base: BASE_04, weightCount: Pol.WEIGHT_COUNT, trainScore: r.trainScore, improved: r.improved, neutral: r.neutral, moved: r.moved, kept: r.kept, pruneEvals: r.pruneEvals,
        heldOut: held.score, heldOutSound: held.sound, heldOutBiased: held.biased, poolCrashed: pool.crashed,
        start: { train: st.train.score, heldOut: st.heldOut.score, poolCrashed: st.pool.crashed }, weights: Array.from(w) };
}
/** The champion from the four records: { record (null -> the start), eligible, none }. */
export function championOf(records) {
    const rs = [...records].sort((a, b) => a.k - b.k);
    const eligible = rs.filter((r) => r.poolCrashed <= r.start.poolCrashed).sort((a, b) => b.heldOut - a.heldOut || a.k - b.k);
    return { searches: rs.length, eligible: eligible.length, record: eligible[0] || null, none: !eligible[0] };
}
/** The ledger's checks: four searches, one record each, one recipe, one start. Returns the failures. */
export function ledgerChecks(records) {
    const f = [], ks = records.map((r) => r.k).sort((a, b) => a - b);
    if (ks.join() !== Array.from({ length: SEARCHES }, (_, i) => i).join()) f.push(`the searches are ${ks.join(",") || "none"} (it needs 0 to ${SEARCHES - 1}, once each)`);
    if (records.some((r) => JSON.stringify(r.recipe) !== JSON.stringify(records[0].recipe))) f.push("the records are of more than one recipe");
    if (records.some((r) => JSON.stringify(r.start) !== JSON.stringify(records[0].start))) f.push("the records disagree about the START");
    if (records.some((r) => !Array.isArray(r.weights) || r.weights.length !== r.weightCount || r.seed !== SEARCH_SEEDS[r.k])) f.push("a record's weights do not fit its count, or its seed is not its search's");
    return f;
}
/** The champion's weights (or the start's when none is eligible) as the policy takes them. */
export const championWeights = (records, Pol = retrainPolicy()) => { const c = championOf(records); return c.record ? Float32Array.from(c.record.weights) : Pol.handWeights(); };
/** The pilot of an audit arm. NEW needs the champion's weights; `overrides` is for the gate (the shipped seat's planner on short dives). */
export function pilotOf(arm, { weights = null, overrides = {} } = {}) {
    if (arm === "NEW") { if (!weights) throw new Error("circuitRetrain.pilotOf: NEW needs the champion's weights"); return retrainPolicy().pilotFor(Float32Array.from(weights)); }
    if (arm === "C06") return CB.pilotOf("C06");
    if (arm === "SEAT-04") return SS.surveyPilot({ overrides });
    throw new Error(`circuitRetrain.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
export function chunkRange(j, range = SEEDS) {
    const n = range[1] - range[0] + 1, per = Math.ceil(n / CHUNKS);
    if (!(Number.isInteger(j) && j >= 0 && j < CHUNKS)) throw new Error(`circuitRetrain.chunkRange: chunk ${j} is not 0..${CHUNKS - 1}`);
    return [range[0] + j * per, Math.min(range[1], range[0] + (j + 1) * per - 1)];
}
export const AUDIT_JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => Array.from({ length: CHUNKS }, (_, j) => [a, c, String(j)]))));
export function auditJob(arm, cond, chunk, { weights = null, range = SEEDS, seconds = null, overrides = {} } = {}) {
    if (!COND_NAMES.includes(cond)) throw new Error(`circuitRetrain.auditJob: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    const [a, b] = chunkRange(Number(chunk), range);
    return T.evaluate(pilotOf(arm, { weights, overrides }), T.setOf([KIND], a, b), { gauge: gaugeOfCond(cond), ...(seconds ? { seconds } : {}) });
}
export function verdictsOf(res) {
    const bad = Object.fromEntries(ARMS.map((a) => [a, { REF: badOf(res[a].REF), BIAS: badOf(res[a].BIAS) }]));
    const v1 = hullOk(bad.NEW.BIAS, bad["SEAT-04"].BIAS), v2 = hullOk(bad.NEW.REF, bad["SEAT-04"].REF);
    return { bad, v1, v2, refVsSeat: diffOf(res.NEW.REF, res["SEAT-04"].REF), biasVsSeat: diffOf(res.NEW.BIAS, res["SEAT-04"].BIAS), biasVsC06: diffOf(res.NEW.BIAS, res.C06.BIAS) };
}
export function bottomLine(res) {
    const v = verdictsOf(res);
    return v.v1 && v.v2 ? "THE RETRAINED CIRCUIT HOLDS ITS HULL: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE" : "THE RETRAINED CIRCUIT DOES NOT HOLD ITS HULL: NOTHING IS REPLACED";
}
export function checksOf(res, records, { dives = DIVES, start = true, profile = true, shipped = true } = {}) {
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
    const led = ledgerChecks(records);
    rows.push({ name: "THE LEDGER IS COMPLETE", ok: led.length === 0, text: led.length ? led.join("; ") : `${SEARCHES} searches, one record each, one recipe, one start` });
    rows.push({ name: "NEW'S START IS R04", ok: start, text: `the untrained policy against tunedSeat on low -0.04 on the gate's dives, fingerprint for fingerprint: ${start}` });
    rows.push({ name: "C06 IS THE AQUARIUM'S CIRCUIT PROFILE", ok: profile, text: `C06 against subAquariumCircuit.circuitSeat("circuit") on the gate's dives: ${profile}` });
    rows.push({ name: "SEAT-04 IS THE SHIPPED SEAT", ok: shipped, text: `SEAT-04 against surveyPilot() on the gate's dives: ${shipped}` });
    return rows;
}
const gateSet = () => T.setOf([KIND], GATE_SEEDS[0], GATE_SEEDS[1]);
const fps = (pilot, gauge, seconds = null) => T.evaluate(pilot, gateSet(), { gauge, ...(seconds ? { seconds } : {}) }).runs.map((r) => r.fingerprint).join("|");
/** Check: the untrained policy IS R04 on the gate's two dives, under BIAS (full length). */
export const startIsR04 = () => fps(retrainPolicy().pilotFor(retrainPolicy().handWeights()), BIASED) === fps(T.flyDecision(U.tunedSeat(BASE_04, U.WIDE_BOUNDS)), BIASED);
/** Check: C06 is the aquarium's circuit profile, by the library that flew it in Round 38. `circuitSeatOf` is subAquariumCircuit.circuitSeat. */
export const profileSame = (circuitSeatOf) => fps(pilotOf("C06"), BIASED) === fps(T.flyDecision(circuitSeatOf("circuit")), BIASED);
export const shippedSame = () => fps(pilotOf("SEAT-04", { overrides: { seconds: 60 } }), BIASED, 60) === fps(SS.surveyPilot({ overrides: { seconds: 60 } }), BIASED, 60);
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}) ${keepsOf(p)}`;
export function trainingLines(records) {
    const c = championOf(records), L = [`ROUND 40 TRAINING: ${records.length} searches of the plain net on the -0.04 base, fitness over the sound and the +0.10 gauge`];
    for (const r of [...records].sort((a, b) => a.k - b.k)) L.push(`  search ${r.k} (seed ${r.seed}): ${r.moved} moved, pruned to ${r.kept}; train ${r.trainScore.toFixed(4)} (start ${r.start.train.toFixed(4)}); held-out ${r.heldOut.toFixed(4)} (start ${r.start.heldOut.toFixed(4)}; sound ${r.heldOutSound.toFixed(4)}, biased ${r.heldOutBiased.toFixed(4)}); pool crushed ${r.poolCrashed} (start ${r.start.poolCrashed}) ${r.poolCrashed <= r.start.poolCrashed ? "ELIGIBLE" : "not eligible"}`);
    L.push(c.none ? "CHAMPION: none eligible -- NEW is the start (R04)" : `CHAMPION: search ${c.record.k} (held-out ${c.record.heldOut.toFixed(4)}), ${c.eligible} of ${c.searches} eligible`);
    return L;
}
export function report(res, records, opts = {}) {
    const L = [...trainingLines(records), `ROUND 40 AUDIT: ${ARMS.join(", ")} under REF and +0.10 BIAS; seeds ${SEEDS[0]}-${SEEDS[1]}, ${KIND}`];
    const checks = checksOf(res, records, opts), failed = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED and nothing is replaced.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const v = verdictsOf(res);
    for (const a of ARMS) L.push(`  ${a.padEnd(8)} REF ${res[a].REF.score.toFixed(4)} (${res[a].REF.crashed}/${res[a].REF.stranded})  BIAS ${res[a].BIAS.score.toFixed(4)} (${res[a].BIAS.crashed}/${res[a].BIAS.stranded})`);
    L.push(`  V1 NEW'S HULL IS ${v.v1 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S UNDER BIAS (${v.bad.NEW.BIAS} against ${v.bad["SEAT-04"].BIAS})`);
    L.push(`  V2 NEW'S HULL IS ${v.v2 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S AT REF (${v.bad.NEW.REF} against ${v.bad["SEAT-04"].REF})`);
    L.push(`REPORTED, NOT WEIGHED: NEW minus SEAT-04 at REF ${fmt(v.refVsSeat)}, under BIAS ${fmt(v.biasVsSeat)}; NEW minus C06 under BIAS ${fmt(v.biasVsC06)}; the champion is ${championOf(records).none ? "the start" : "a trained search"}`);
    L.push(`BOTTOM LINE: ${bottomLine(res)}`);
    return L;
}
