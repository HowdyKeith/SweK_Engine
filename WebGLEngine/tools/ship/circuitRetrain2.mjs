// WebGLEngine/tools/ship/circuitRetrain2.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/circuitRetrain2Cmd.mjs; the gate is tools/ship/circuitRetrain2-selfcheck.mjs)
//
// ROUND 41 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): a better-trained circuit profile. Round 40's policy and two-gauge seam (imported), with three changes:
//   (1) TRAIN_SET (40 dives, 80 with both gauges) instead of TRAIN_SMALL;
//   (2) the champion chosen on HELD-OUT dives: the (1+1)-ES of the recipe, its best weights checkpointed every 50 children (seven checkpoints, the start included), each checkpoint
//       scored on HELD_OUT_SET; a search's result is its checkpoint of the best held-out score, ties to the earlier; no prune;
//   (3) a registered score line in the audit: NEW may replace the profile only if its hull is no worse than the seat's AND it does not score below the seat beyond 2 se (REF and BIAS).
// THE ES LOOP is trainNeedsCircuit.search()'s, written out because search() cannot checkpoint; the gate holds it to search() child for child (pruneBudget 0).
// THE SEEDS ARE READ ONLY BY searchJob() AND auditJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
import { RECIPE, setsOf } from "./trainNeedsCircuit.mjs";
import { gaugeOfCond, diffOf, keepsOf, hullOk, badOf } from "./gaugeFaults.mjs";
import { mergeKinds } from "./plannerCap.mjs";
import { retrainPolicy, BASE_04, SOUND, BIASED } from "./circuitRetrain.mjs";
import { CIRCUIT_CHAMPION } from "../../render/subAquariumCircuitWeights.mjs";

export { RECIPE, hullOk, mergeKinds, diffOf, keepsOf, badOf, retrainPolicy, BASE_04, SOUND, BIASED };
export const SEARCHES = RECIPE.runs, SEARCH_SEEDS = Object.freeze([97600, 97601, 97602, 97603]), EVERY = 50;
export const CHECKPOINTS = Object.freeze(Array.from({ length: RECIPE.iters / EVERY + 1 }, (_, i) => i * EVERY));   // 0, 50, ..., 300
export const KIND = "both", SEEDS = Object.freeze([55001, 55300]), GATE_SEEDS = Object.freeze([55901, 55902]), DIVES = 300, CHUNKS = 4;
export const ARMS = Object.freeze(["NEW", "CUR", "SEAT-04"]), COND_NAMES = Object.freeze(["REF", "BIAS"]);
const round6 = (w) => Float32Array.from(w, (v) => Math.round(v * 1e6) / 1e6);
/** The training sets of the round: TRAIN_SET for the fitness, HELD_OUT_SET for the checkpoints, POOL_SET for eligibility. `smoke` shrinks each (for the gate). */
export function setsOf41({ smoke = false } = {}) {
    const s = { train: T.TRAIN_SET, heldOut: T.HELD_OUT_SET, pool: T.POOL_SET };
    return smoke ? Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.filter((_, i) => i % 8 === 0)])) : s;
}
/** The ES loop with checkpoints. Returns { best (the final weights), bestScore, improved, neutral, checkpoints: [{ at, weights, trainScore }] }. The same moves as search() with pruneBudget 0. */
export function esWithCheckpoints(Pol, seed, recipe, trainSet, every = EVERY) {
    const rng = mulberry(seed), hand = Pol.handWeights(), ev = (w) => Pol.evaluate(Pol.pilotFor(w), trainSet).score;
    let best = Float32Array.from(hand), bestScore = ev(best), improved = 0, neutral = 0;
    const checkpoints = [{ at: 0, weights: Float32Array.from(best), trainScore: bestScore }];
    for (let i = 1; i <= recipe.iters; i++) {
        const cand = Pol.mutate(best, recipe.sigma, rng, recipe.maxK), score = ev(cand);
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % every === 0) checkpoints.push({ at: i, weights: Float32Array.from(best), trainScore: bestScore });
    }
    return { best, bestScore, improved, neutral, checkpoints };
}
/** The checkpoint a search chooses: the best held-out, ties to the earlier. */
export const chosenOf = (cps) => cps.reduce((b, c, i) => (c.heldOut > cps[b].heldOut + 1e-12 ? i : b), 0);
/** One search: the record the training file keeps. `opts`: recipe, sets, policy (for the gate). */
export function searchJob(k, opts = {}) {
    if (!(Number.isInteger(k) && k >= 0 && k < SEARCHES)) throw new Error(`circuitRetrain2.searchJob: search ${k} is not 0..${SEARCHES - 1}`);
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf41(), Pol = opts.policy || retrainPolicy(), every = opts.every || EVERY;
    const sc = (w, set) => Pol.evaluate(Pol.pilotFor(w), set);
    const r = esWithCheckpoints(Pol, SEARCH_SEEDS[k], recipe, sets.train, every);
    const cps = r.checkpoints.map((c) => { const w = round6(c.weights), h = sc(w, sets.heldOut); return { at: c.at, trainScore: c.trainScore, heldOut: h.score, heldOutSound: h.sound, heldOutBiased: h.biased, w }; });
    const ci = chosenOf(cps), pool = sc(cps[ci].w, sets.pool), startPool = sc(cps[0].w, sets.pool);
    return { k, seed: SEARCH_SEEDS[k], recipe, every, weightCount: Pol.WEIGHT_COUNT, improved: r.improved, neutral: r.neutral, finalTrain: r.bestScore,
        checkpoints: cps.map(({ w, ...c }) => c), chosen: ci, chosenAt: cps[ci].at, heldOut: cps[ci].heldOut, poolCrashed: pool.crashed,
        start: { train: cps[0].trainScore, heldOut: cps[0].heldOut, poolCrashed: startPool.crashed }, weights: Array.from(cps[ci].w) };
}
/** The champion from the four records: { record (null -> the start), eligible, none, isStart }. */
export function championOf(records) {
    const rs = [...records].sort((a, b) => a.k - b.k);
    const eligible = rs.filter((r) => r.poolCrashed <= r.start.poolCrashed).sort((a, b) => b.heldOut - a.heldOut || a.k - b.k);
    const record = eligible[0] || null;
    return { searches: rs.length, eligible: eligible.length, record, none: !record, isStart: !record || record.chosenAt === 0 };
}
/** The ledger's checks: four searches once each, seven checkpoints each at 0..300 by 50, one recipe, one start, weights of their count, each search's own seed. */
export function ledgerChecks(records) {
    const f = [], ks = records.map((r) => r.k).sort((a, b) => a - b);
    if (ks.join() !== Array.from({ length: SEARCHES }, (_, i) => i).join()) f.push(`the searches are ${ks.join(",") || "none"} (it needs 0 to ${SEARCHES - 1}, once each)`);
    if (records.some((r) => !Array.isArray(r.checkpoints) || r.checkpoints.map((c) => c.at).join() !== CHECKPOINTS.join())) f.push(`a search's checkpoints are not ${CHECKPOINTS.join(",")}`);
    if (records.some((r) => JSON.stringify(r.recipe) !== JSON.stringify(records[0].recipe))) f.push("the records are of more than one recipe");
    if (records.some((r) => JSON.stringify(r.start) !== JSON.stringify(records[0].start))) f.push("the records disagree about the START");
    if (records.some((r) => !Array.isArray(r.weights) || r.weights.length !== r.weightCount || r.seed !== SEARCH_SEEDS[r.k])) f.push("a record's weights do not fit its count, or its seed is not its search's");
    return f;
}
export const championWeights = (records, Pol = retrainPolicy()) => { const c = championOf(records); return c.record ? Float32Array.from(c.record.weights) : Pol.handWeights(); };
export function pilotOf(arm, { weights = null, overrides = {} } = {}) {
    if (arm === "NEW") { if (!weights) throw new Error("circuitRetrain2.pilotOf: NEW needs the champion's weights"); return retrainPolicy().pilotFor(Float32Array.from(weights)); }
    if (arm === "CUR") return retrainPolicy().pilotFor(Float32Array.from(CIRCUIT_CHAMPION.weights));
    if (arm === "SEAT-04") return SS.surveyPilot({ overrides });
    throw new Error(`circuitRetrain2.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
export function chunkRange(j, range = SEEDS) {
    const n = range[1] - range[0] + 1, per = Math.ceil(n / CHUNKS);
    if (!(Number.isInteger(j) && j >= 0 && j < CHUNKS)) throw new Error(`circuitRetrain2.chunkRange: chunk ${j} is not 0..${CHUNKS - 1}`);
    return [range[0] + j * per, Math.min(range[1], range[0] + (j + 1) * per - 1)];
}
export const AUDIT_JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => Array.from({ length: CHUNKS }, (_, j) => [a, c, String(j)]))));
export function auditJob(arm, cond, chunk, { weights = null, range = SEEDS, seconds = null, overrides = {} } = {}) {
    if (!COND_NAMES.includes(cond)) throw new Error(`circuitRetrain2.auditJob: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    const [a, b] = chunkRange(Number(chunk), range);
    return T.evaluate(pilotOf(arm, { weights, overrides }), T.setOf([KIND], a, b), { gauge: gaugeOfCond(cond), ...(seconds ? { seconds } : {}) });
}
/** V3's test: the paired difference is not HURTS (its mean is not below -2 se). */
export const notHurts = (p) => keepsOf(p) !== "HURTS";
export function verdictsOf(res) {
    const bad = Object.fromEntries(ARMS.map((a) => [a, { REF: badOf(res[a].REF), BIAS: badOf(res[a].BIAS) }]));
    const v1 = hullOk(bad.NEW.BIAS, bad["SEAT-04"].BIAS), v2 = hullOk(bad.NEW.REF, bad["SEAT-04"].REF);
    const refVsSeat = diffOf(res.NEW.REF, res["SEAT-04"].REF), biasVsSeat = diffOf(res.NEW.BIAS, res["SEAT-04"].BIAS);
    const v3ref = notHurts(refVsSeat), v3bias = notHurts(biasVsSeat);
    return { bad, v1, v2, v3ref, v3bias, v3: v3ref && v3bias, refVsSeat, biasVsSeat, refVsCur: diffOf(res.NEW.REF, res.CUR.REF), biasVsCur: diffOf(res.NEW.BIAS, res.CUR.BIAS) };
}
export function bottomLine(res) {
    const v = verdictsOf(res), miss = [!v.v1 && "V1 the hull under BIAS", !v.v2 && "V2 the hull at REF", !v.v3ref && "V3 the score at REF", !v.v3bias && "V3 the score under BIAS"].filter(Boolean);
    return miss.length ? `THE BETTER-TRAINED CIRCUIT DOES NOT CLEAR THE LINE (${miss.join("; ")}): NOTHING IS REPLACED` : "THE BETTER-TRAINED CIRCUIT HOLDS ITS HULL AND ITS SCORE: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE";
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
    rows.push({ name: "THE LEDGER IS COMPLETE", ok: led.length === 0, text: led.length ? led.join("; ") : `${SEARCHES} searches of ${CHECKPOINTS.length} checkpoints, one recipe, one start` });
    rows.push({ name: "NEW'S START IS R04", ok: start, text: `the untrained policy against tunedSeat on low -0.04 on the gate's dives, fingerprint for fingerprint: ${start}` });
    rows.push({ name: "CUR IS THE AQUARIUM'S CIRCUIT PROFILE", ok: profile, text: `CUR against subAquariumCircuit.circuitSeat("circuit") on the gate's dives (full BIAS dives): ${profile}` });
    rows.push({ name: "SEAT-04 IS THE SHIPPED SEAT", ok: shipped, text: `SEAT-04 against surveyPilot() on the gate's dives: ${shipped}` });
    return rows;
}
const gateSet = () => T.setOf([KIND], GATE_SEEDS[0], GATE_SEEDS[1]);
const fps = (pilot, gauge, seconds = null) => T.evaluate(pilot, gateSet(), { gauge, ...(seconds ? { seconds } : {}) }).runs.map((r) => r.fingerprint).join("|");
export const profileSame = (circuitSeatOf) => fps(pilotOf("CUR"), BIASED) === fps(T.flyDecision(circuitSeatOf("circuit")), BIASED);
export const shippedSame = () => fps(pilotOf("SEAT-04", { overrides: { seconds: 60 } }), BIASED, 60) === fps(SS.surveyPilot({ overrides: { seconds: 60 } }), BIASED, 60);
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}) ${keepsOf(p)}`;
export function trainingLines(records) {
    const c = championOf(records), L = [`ROUND 41 TRAINING: ${records.length} searches on TRAIN_SET (both gauges), checkpointed every ${EVERY} children, chosen on HELD_OUT_SET`];
    for (const r of [...records].sort((a, b) => a.k - b.k)) L.push(`  search ${r.k} (seed ${r.seed}): held-out by checkpoint ${r.checkpoints.map((x) => x.heldOut.toFixed(4)).join(" ")}; chose child ${r.chosenAt} (held-out ${r.heldOut.toFixed(4)}, start ${r.start.heldOut.toFixed(4)}); pool crushed ${r.poolCrashed} (start ${r.start.poolCrashed}) ${r.poolCrashed <= r.start.poolCrashed ? "ELIGIBLE" : "not eligible"}`);
    L.push(c.none ? "CHAMPION: none eligible -- NEW is the start (R04)" : `CHAMPION: search ${c.record.k}, child ${c.record.chosenAt} (held-out ${c.record.heldOut.toFixed(4)})${c.isStart ? " -- THE START: the training bought nothing measurable on held-out dives" : ""}, ${c.eligible} of ${c.searches} eligible`);
    return L;
}
export function report(res, records, opts = {}) {
    const L = [...trainingLines(records), `ROUND 41 AUDIT: ${ARMS.join(", ")} under REF and +0.10 BIAS; seeds ${SEEDS[0]}-${SEEDS[1]}, ${KIND}`];
    const checks = checksOf(res, records, opts), failed = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED and nothing is replaced.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const v = verdictsOf(res);
    for (const a of ARMS) L.push(`  ${a.padEnd(8)} REF ${res[a].REF.score.toFixed(4)} (${res[a].REF.crashed}/${res[a].REF.stranded})  BIAS ${res[a].BIAS.score.toFixed(4)} (${res[a].BIAS.crashed}/${res[a].BIAS.stranded})`);
    L.push(`  V1 NEW'S HULL IS ${v.v1 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S UNDER BIAS (${v.bad.NEW.BIAS} against ${v.bad["SEAT-04"].BIAS})`);
    L.push(`  V2 NEW'S HULL IS ${v.v2 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S AT REF (${v.bad.NEW.REF} against ${v.bad["SEAT-04"].REF})`);
    L.push(`  V3 THE SCORE LINE: NEW minus SEAT-04 at REF ${fmt(v.refVsSeat)} ${v.v3ref ? "clears" : "MISSES"}; under BIAS ${fmt(v.biasVsSeat)} ${v.v3bias ? "clears" : "MISSES"}`);
    L.push(`REPORTED, NOT WEIGHED: NEW minus CUR at REF ${fmt(v.refVsCur)}, under BIAS ${fmt(v.biasVsCur)}`);
    L.push(`BOTTOM LINE: ${bottomLine(res)}`);
    return L;
}
