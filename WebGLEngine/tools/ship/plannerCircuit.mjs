// WebGLEngine/tools/ship/plannerCircuit.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/plannerCircuitCmd.mjs; the gate is tools/ship/plannerCircuit-selfcheck.mjs)
//
// ROUND 42 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): a circuit built on the planner. Round 41's recipe, sets, held-out selection,
// champion rule and score line, with ONE change: the base is the shipped seat's planner (brain/plannerCircuitSeat.mjs), not the rule.
// THE SEARCH RESUMES EXACTLY. The training runs on the rig (about 10-16 h a search), so each search writes a ledger line at every checkpoint -- the best
// weights at full float32, the best training score, the improved and neutral counts, the random draws consumed, and the checkpoint's held-out score -- and
// a restarted search resumes from its last whole line: a fresh mulberry(seed) skips that many draws and the loop continues. The gate holds a search
// stopped and resumed equal to one run unbroken, child for child.
// THE SEEDS ARE READ ONLY BY searchJob() AND auditJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as PC from "../../brain/plannerCircuitSeat.mjs";
import { mulberry } from "../../brain/pilotSubPolicy.mjs";
import { RECIPE, setsOf41, chosenOf, championOf, hullOk, mergeKinds, diffOf, keepsOf, badOf } from "./circuitRetrain2.mjs";
import { retrainPolicy, bothGauges, SOUND, BIASED } from "./circuitRetrain.mjs";
import { CIRCUIT_CHAMPION } from "../../render/subAquariumCircuitWeights.mjs";

export { RECIPE, setsOf41, chosenOf, championOf, hullOk, mergeKinds, diffOf, keepsOf, badOf, SOUND, BIASED };
export const SEARCHES = RECIPE.runs, SEARCH_SEEDS = Object.freeze([97700, 97701, 97702, 97703]), EVERY = 50;
export const CHECKPOINTS = Object.freeze(Array.from({ length: RECIPE.iters / EVERY + 1 }, (_, i) => i * EVERY));   // 0, 50, ..., 300
export const KIND = "both", SEEDS = Object.freeze([56001, 56300]), GATE_SEEDS = Object.freeze([56901, 56902]), DIVES = 300, CHUNKS = 4;
export const ARMS = Object.freeze(["NEW", "SEAT-04", "CUR"]), COND_NAMES = Object.freeze(["REF", "BIAS"]);
export const round6 = (w) => Float32Array.from(w, (v) => Math.round(v * 1e6) / 1e6);

/** The policy of the round: the 24 -> 84 -> 7 planner circuit, with the two-gauge seam. `evalOf` is a seam for the gate (a stub evaluate). */
export function plannerPolicy({ evalOf = T.evaluate } = {}) {
    const base = PC.createPlannerPolicy();
    const evaluate = (pilot, set) => bothGauges(evalOf(pilot, set, { gauge: SOUND }), evalOf(pilot, set, { gauge: BIASED }));
    return { ...base, evaluate };
}

/** mulberry(seed) that counts its draws, after skipping `skip` of them: the whole state a resume needs. */
export function countingRng(seed, skip = 0) {
    const r = mulberry(seed); let n = 0;
    const f = () => { n++; return r(); };
    for (let i = 0; i < skip; i++) f();
    Object.defineProperty(f, "draws", { get: () => n });
    return f;
}

/** The last whole lines of a ledger file's text: a line cut short by a crash is dropped, never half-read. */
export function readLedger(text) {
    const out = [];
    for (const l of String(text).split("\n")) { if (!l.trim()) continue; try { out.push(JSON.parse(l)); } catch { break; } }
    return out;
}

/** What a restarted search reads from its ledger file's text: the whole lines, how many resumes this one is, and the text to rewrite the file with (the torn line gone). */
export function resumeFromText(text) {
    const ledger = readLedger(text);
    return { ledger, resumes: ledger.length ? 1 + (ledger.at(-1).resumes || 0) : 0, clean: ledger.map((l) => JSON.stringify(l) + "\n").join("") };
}

/**
 * The (1+1)-ES of the recipe (Round 41's esWithCheckpoints, move for move), resumable. `ledger` = the lines already written (resume from the last);
 * `onLine(line)` is called with each new checkpoint line (the caller scores it on held-out and writes it); `stopAfter` (the gate) stops after that many
 * children of THIS run, to simulate a kill. Returns { lines (all, the prior ones first), stopped }.
 */
export function esResumable(Pol, seed, recipe, trainSet, { every = EVERY, ledger = [], onLine = (l) => l, stopAfter = Infinity } = {}) {
    const ev = (w) => Pol.evaluate(Pol.pilotFor(w), trainSet).score;
    const lines = [...ledger];
    let best, bestScore, improved, neutral, rng, from;
    if (ledger.length) {
        const L = ledger.at(-1);
        best = Float32Array.from(L.weights); bestScore = L.trainScore; improved = L.improved; neutral = L.neutral; rng = countingRng(seed, L.draws); from = L.at + 1;
    } else {
        rng = countingRng(seed); best = Float32Array.from(Pol.handWeights()); bestScore = ev(best); improved = 0; neutral = 0; from = 1;
        lines.push(onLine({ at: 0, weights: Array.from(best), trainScore: bestScore, improved, neutral, draws: rng.draws }));
    }
    let ran = 0;
    for (let i = from; i <= recipe.iters; i++) {
        if (ran >= stopAfter) return { lines, stopped: true };
        const cand = Pol.mutate(best, recipe.sigma, rng, recipe.maxK), score = ev(cand); ran++;
        if (score > bestScore + 1e-9) { best = cand; bestScore = score; improved++; } else if (score >= bestScore - 1e-9) { best = cand; neutral++; }
        if (i % every === 0) lines.push(onLine({ at: i, weights: Array.from(best), trainScore: bestScore, improved, neutral, draws: rng.draws }));
    }
    return { lines, stopped: false };
}

/** A checkpoint line scored on held-out (on its six-decimal weights, as the champion will fly them). */
export function scoredLine(Pol, heldOut) {
    return (line) => { const h = Pol.evaluate(Pol.pilotFor(round6(line.weights)), heldOut); return { ...line, heldOut: h.score, heldOutSound: h.sound, heldOutBiased: h.biased }; };
}

/** The record of a finished search from its ledger lines: Round 41's record shape, plus the ledger's own facts (draws, resumes). */
export function recordOf(k, lines, { Pol = plannerPolicy(), sets = setsOf41(), recipe = RECIPE, every = EVERY, resumes = 0 } = {}) {
    const cps = lines.map(({ weights, ...c }) => ({ ...c, w: round6(weights) })), ci = chosenOf(cps);
    const sc = (w, set) => Pol.evaluate(Pol.pilotFor(w), set), pool = sc(cps[ci].w, sets.pool), startPool = ci === 0 ? pool : sc(cps[0].w, sets.pool);
    return { k, seed: SEARCH_SEEDS[k], recipe, every, weightCount: Pol.WEIGHT_COUNT, improved: cps.at(-1).improved, neutral: cps.at(-1).neutral, finalTrain: cps.at(-1).trainScore,
        checkpoints: cps.map(({ w, ...c }) => c), chosen: ci, chosenAt: cps[ci].at, heldOut: cps[ci].heldOut, poolCrashed: pool.crashed,
        start: { train: cps[0].trainScore, heldOut: cps[0].heldOut, poolCrashed: startPool.crashed }, resumes, weights: Array.from(cps[ci].w) };
}

/** One search, whole or resumed: runs what the ledger lacks (writing each line through `onLine`) and returns the record, or null when stopped. */
export function searchJob(k, opts = {}) {
    if (!(Number.isInteger(k) && k >= 0 && k < SEARCHES)) throw new Error(`plannerCircuit.searchJob: search ${k} is not 0..${SEARCHES - 1}`);
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf41(), Pol = opts.policy || plannerPolicy(), every = opts.every || EVERY;
    const score = scoredLine(Pol, sets.heldOut), write = opts.onLine || ((l) => l);
    const r = esResumable(Pol, SEARCH_SEEDS[k], recipe, sets.train, { every, ledger: opts.ledger || [], onLine: (l) => write(score(l)), stopAfter: opts.stopAfter ?? Infinity });
    return r.stopped ? null : recordOf(k, r.lines, { Pol, sets, recipe, every, resumes: opts.resumes || 0 });
}

/** The ledger's checks: four searches once each, seven checkpoints each at 0..300 by 50, draws strictly rising, one recipe, one start, weights of their count, each search's own seed. */
export function ledgerChecks(records) {
    const f = [], ks = records.map((r) => r.k).sort((a, b) => a - b);
    if (ks.join() !== Array.from({ length: SEARCHES }, (_, i) => i).join()) f.push(`the searches are ${ks.join(",") || "none"} (it needs 0 to ${SEARCHES - 1}, once each)`);
    if (records.some((r) => !Array.isArray(r.checkpoints) || r.checkpoints.map((c) => c.at).join() !== CHECKPOINTS.join())) f.push(`a search's checkpoints are not ${CHECKPOINTS.join(",")}`);
    if (records.some((r) => r.checkpoints.some((c, i) => i > 0 && !(c.draws > r.checkpoints[i - 1].draws)))) f.push("a search's random draws do not rise from checkpoint to checkpoint");
    if (records.some((r) => JSON.stringify(r.recipe) !== JSON.stringify(records[0].recipe))) f.push("the records are of more than one recipe");
    if (records.some((r) => JSON.stringify(r.start) !== JSON.stringify(records[0].start))) f.push("the records disagree about the START");
    if (records.some((r) => !Array.isArray(r.weights) || r.weights.length !== r.weightCount || r.seed !== SEARCH_SEEDS[r.k])) f.push("a record's weights do not fit its count, or its seed is not its search's");
    return f;
}
export const championWeights = (records, Pol = plannerPolicy()) => { const c = championOf(records); return c.record ? Float32Array.from(c.record.weights) : Pol.handWeights(); };

/** An arm's pilot. NEW also returns the seats it made (for the station overrides), through `seats` when given. */
export function pilotOf(arm, { weights = null, overrides = {}, seats = null } = {}) {
    if (arm === "NEW") {
        if (!weights) throw new Error("plannerCircuit.pilotOf: NEW needs the champion's weights");
        const Pol = PC.createPlannerPolicy(), w = Float32Array.from(weights), seatOpts = Object.keys(overrides).length ? { plan: SS.planOf("standard", overrides) } : {};
        const seatOf = PC.makePlannerSeat(Pol.stepper(w), seatOpts);
        return T.flyDecision((ctx) => { const s = seatOf(ctx); if (seats) seats.push(s); return s; });
    }
    if (arm === "SEAT-04") return SS.surveyPilot({ overrides });
    if (arm === "CUR") return retrainPolicy().pilotFor(Float32Array.from(CIRCUIT_CHAMPION.weights));
    throw new Error(`plannerCircuit.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
export function chunkRange(j, range = SEEDS) {
    const n = range[1] - range[0] + 1, per = Math.ceil(n / CHUNKS);
    if (!(Number.isInteger(j) && j >= 0 && j < CHUNKS)) throw new Error(`plannerCircuit.chunkRange: chunk ${j} is not 0..${CHUNKS - 1}`);
    return [range[0] + j * per, Math.min(range[1], range[0] + (j + 1) * per - 1)];
}
export const AUDIT_JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => Array.from({ length: CHUNKS }, (_, j) => [a, c, String(j)]))));
export function auditJob(arm, cond, chunk, { weights = null, range = SEEDS, seconds = null } = {}) {
    if (!COND_NAMES.includes(cond)) throw new Error(`plannerCircuit.auditJob: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    const [a, b] = chunkRange(Number(chunk), range), seats = arm === "NEW" ? [] : null;
    const res = T.evaluate(pilotOf(arm, { weights, seats }), T.setOf([KIND], a, b), { gauge: cond === "REF" ? SOUND : BIASED, ...(seconds ? { seconds } : {}) });
    return seats ? { ...res, overrides: seats.map((s) => s.overrides) } : res;
}

/** The chunks of one arm and condition merged (mergeKinds), keeping NEW's station overrides a dive, which mergeKinds drops. */
export const mergeAudit = (parts) => ({ ...mergeKinds(parts), ...(parts.every((p) => Array.isArray(p.overrides)) ? { overrides: parts.flatMap((p) => p.overrides) } : {}) });
/** V3's test: the paired difference is not HURTS. V4's: it KEEPS. */
export const notHurts = (p) => keepsOf(p) !== "HURTS";
export const beats = (p) => keepsOf(p) === "KEEPS";
export function verdictsOf(res) {
    const bad = Object.fromEntries(ARMS.map((a) => [a, { REF: badOf(res[a].REF), BIAS: badOf(res[a].BIAS) }]));
    const v1 = hullOk(bad.NEW.BIAS, bad["SEAT-04"].BIAS), v2 = hullOk(bad.NEW.REF, bad["SEAT-04"].REF);
    const refVsSeat = diffOf(res.NEW.REF, res["SEAT-04"].REF), biasVsSeat = diffOf(res.NEW.BIAS, res["SEAT-04"].BIAS);
    const v3ref = notHurts(refVsSeat), v3bias = notHurts(biasVsSeat), v4 = beats(refVsSeat) && beats(biasVsSeat);
    return { bad, v1, v2, v3ref, v3bias, v3: v3ref && v3bias, v4, refVsSeat, biasVsSeat, refVsCur: diffOf(res.NEW.REF, res.CUR.REF), biasVsCur: diffOf(res.NEW.BIAS, res.CUR.BIAS) };
}
export function bottomLine(res, { isStart = false } = {}) {
    const v = verdictsOf(res), miss = [!v.v1 && "V1 the hull under BIAS", !v.v2 && "V2 the hull at REF", !v.v3ref && "V3 the score at REF", !v.v3bias && "V3 the score under BIAS"].filter(Boolean);
    if (miss.length) return `THE PLANNER CIRCUIT DOES NOT CLEAR THE LINE (${miss.join("; ")}): NOTHING IS REPLACED`;
    return "THE PLANNER CIRCUIT HOLDS ITS HULL AND ITS SCORE: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE" +
        (isStart ? " -- AND IT IS THE SHIPPED SEAT: THE TRAINING BOUGHT NOTHING" : "") + (v.v4 ? " -- AND IT BEATS THE SEAT" : "");
}

const gateSet = () => T.setOf([KIND], GATE_SEEDS[0], GATE_SEEDS[1]);
/** NEW'S START IS THE SHIPPED SEAT: the untrained policy against surveyPilot() on the gate's dives, both gauges, full length, fingerprint and command for command. */
export function startIsSeat({ set = gateSet(), weights = null } = {}) {
    const Pol = PC.createPlannerPolicy(), hand = weights || Pol.handWeights();
    for (const sc of set) for (const g of [SOUND, BIASED]) {
        const a = [], b = [];
        const fa = T.fly(Pol.pilotFor(hand), sc, { gauge: g, onTick: (t, st, nd, cmd) => a.push(JSON.stringify(cmd)) });
        const fb = T.fly(SS.surveyPilot(), sc, { gauge: g, onTick: (t, st, nd, cmd) => b.push(JSON.stringify(cmd)) });
        if (fa.fingerprint !== fb.fingerprint || a.length === 0 || a.join("|") !== b.join("|")) return false;
    }
    return true;
}
const fps = (pilot, gauge, seconds = null) => T.evaluate(pilot, gateSet(), { gauge, ...(seconds ? { seconds } : {}) }).runs.map((r) => r.fingerprint).join("|");
export const profileSame = (circuitSeatOf) => fps(pilotOf("CUR"), BIASED) === fps(T.flyDecision(circuitSeatOf("circuit")), BIASED);
export const shippedSame = () => fps(pilotOf("SEAT-04", { overrides: { seconds: 60 } }), BIASED, 60) === fps(SS.surveyPilot({ overrides: { seconds: 60 } }), BIASED, 60);

export function checksOf(res, records, { dives = DIVES, start = true, profile = true, shipped = true } = {}) {
    const rows = [], ref = res[ARMS[0]].REF.runs, sample = [SEEDS[0], SEEDS[0] + 150, SEEDS[1]], isStart = championOf(records).isStart;
    const gen = sample.every((s) => JSON.stringify(T.setOf([KIND], s, s)[0]) === JSON.stringify(T.scenario(s, KIND)));
    rows.push({ name: "GENERATOR", ok: gen, text: `the scenarios are needsTask.scenario's on ${sample.length} samples: ${gen}` });
    const sizes = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.length === dives));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm has ${dives} dives in both conditions: ${sizes}` });
    const aligned = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.every((r, i) => r.kind === KIND && r.damage0 === ref[i].damage0)));
    rows.push({ name: "ALIGNED", ok: aligned, text: `every arm and condition flies the same scenarios in the same order: ${aligned}` });
    const bite = ARMS.every((a) => res[a].BIAS.runs.some((r, i) => r.fingerprint !== res[a].REF.runs[i].fingerprint));
    rows.push({ name: "THE FAULT REACHES THE PILOT", ok: bite, text: `every arm's BIAS dives differ from its REF dives on at least one dive: ${bite}` });
    const differ = (a, b) => res[a].REF.runs.some((r, k) => r.fingerprint !== res[b].REF.runs[k].fingerprint);
    const newSeat = differ("NEW", "SEAT-04"), arms = (isStart ? !newSeat : newSeat) && differ("NEW", "CUR") && differ("SEAT-04", "CUR");
    rows.push({ name: "THE ARMS DIFFER", ok: arms, text: `NEW ${newSeat ? "differs from" : "EQUALS"} SEAT-04 (${isStart ? "the champion is the start, so it must equal it" : "it must differ"}); every other pair differs: ${arms}` });
    const led = ledgerChecks(records);
    rows.push({ name: "THE LEDGER IS COMPLETE", ok: led.length === 0, text: led.length ? led.join("; ") : `${SEARCHES} searches of ${CHECKPOINTS.length} checkpoints, draws rising, one recipe, one start; ${records.reduce((a, r) => a + (r.resumes || 0), 0)} resume(s)` });
    rows.push({ name: "NEW'S START IS THE SHIPPED SEAT", ok: start, text: `the untrained policy against surveyPilot() on the gate's dives, both gauges, full length, fingerprint and command for command: ${start}` });
    rows.push({ name: "CUR IS THE AQUARIUM'S CIRCUIT PROFILE", ok: profile, text: `CUR against subAquariumCircuit.circuitSeat("circuit") on the gate's dives (full BIAS dives): ${profile}` });
    rows.push({ name: "SEAT-04 IS THE SHIPPED SEAT", ok: shipped, text: `SEAT-04 against surveyPilot() on the gate's dives: ${shipped}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}) ${keepsOf(p)}`;
export function trainingLines(records) {
    const c = championOf(records), L = [`ROUND 42 TRAINING: ${records.length} searches of the planner circuit on TRAIN_SET (both gauges), checkpointed every ${EVERY} children, chosen on HELD_OUT_SET`];
    for (const r of [...records].sort((a, b) => a.k - b.k)) L.push(`  search ${r.k} (seed ${r.seed}): held-out by checkpoint ${r.checkpoints.map((x) => x.heldOut.toFixed(4)).join(" ")}; chose child ${r.chosenAt} (held-out ${r.heldOut.toFixed(4)}, start ${r.start.heldOut.toFixed(4)}); pool crushed ${r.poolCrashed} (start ${r.start.poolCrashed}) ${r.poolCrashed <= r.start.poolCrashed ? "ELIGIBLE" : "not eligible"}; ${r.resumes || 0} resume(s)`);
    L.push(c.none ? "CHAMPION: none eligible -- NEW is the start (the shipped seat)" : `CHAMPION: search ${c.record.k}, child ${c.record.chosenAt} (held-out ${c.record.heldOut.toFixed(4)})${c.isStart ? " -- THE START, i.e. THE SHIPPED SEAT: the training bought nothing measurable on held-out dives" : ""}, ${c.eligible} of ${c.searches} eligible`);
    return L;
}
export function report(res, records, opts = {}) {
    const L = [...trainingLines(records), `ROUND 42 AUDIT: ${ARMS.join(", ")} under REF and +0.10 BIAS; seeds ${SEEDS[0]}-${SEEDS[1]}, ${KIND}`];
    const checks = checksOf(res, records, opts), failed = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED and nothing is replaced.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const v = verdictsOf(res), isStart = championOf(records).isStart;
    for (const a of ARMS) L.push(`  ${a.padEnd(8)} REF ${res[a].REF.score.toFixed(4)} (${res[a].REF.crashed}/${res[a].REF.stranded})  BIAS ${res[a].BIAS.score.toFixed(4)} (${res[a].BIAS.crashed}/${res[a].BIAS.stranded})`);
    L.push(`  V1 NEW'S HULL IS ${v.v1 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S UNDER BIAS (${v.bad.NEW.BIAS} against ${v.bad["SEAT-04"].BIAS})`);
    L.push(`  V2 NEW'S HULL IS ${v.v2 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S AT REF (${v.bad.NEW.REF} against ${v.bad["SEAT-04"].REF})`);
    L.push(`  V3 THE SCORE LINE: NEW minus SEAT-04 at REF ${fmt(v.refVsSeat)} ${v.v3ref ? "clears" : "MISSES"}; under BIAS ${fmt(v.biasVsSeat)} ${v.v3bias ? "clears" : "MISSES"}`);
    L.push(`  V4 (for the claim only) NEW ${v.v4 ? "BEATS" : "does not beat"} THE SEAT beyond 2 se at both gauges`);
    const ov = (c) => { const o = res.NEW[c].overrides || []; return `${o.filter((x) => x > 0).length} of ${o.length} dives, ${o.reduce((a, x) => a + x, 0)} ticks`; };
    L.push(`REPORTED, NOT WEIGHED: NEW minus CUR at REF ${fmt(v.refVsCur)}, under BIAS ${fmt(v.biasVsCur)}; station overrides at REF ${ov("REF")}, under BIAS ${ov("BIAS")}`);
    L.push(`BOTTOM LINE: ${bottomLine(res, { isStart })}`);
    return L;
}
