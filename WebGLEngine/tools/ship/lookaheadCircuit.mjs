// WebGLEngine/tools/ship/lookaheadCircuit.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/lookaheadCircuitCmd.mjs; the gate is tools/ship/lookaheadCircuit-selfcheck.mjs)
//
// ROUND 43 of brain/NEEDS_AND_LIMITS.md (registered before this file existed): the look-ahead circuit. Round 42's planner circuit with ONE change: the net's inputs gain eleven
// features read off the planner's last plan (brain/plannerCircuitSeat.mjs lookaheadFeatures, through plannerPerturbed's read-only `plan` getter). The search, its exact resume,
// the ledger, the checkpoint selection and the champion rule are Round 42's code (tools/ship/plannerCircuit.mjs), used here with this round's seeds and policy. The audit has
// two arms -- NEW and SEAT-04 -- because the aquarium's circuit profile IS the shipped seat since Round 42. The bottom line replaces the profile ONLY if NEW beats the seat (V4).
// THE SEEDS ARE READ ONLY BY searchJob() AND auditJob(). No clock, no random, no file.
"use strict";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import * as PC from "../../brain/plannerCircuitSeat.mjs";
import * as R42 from "./plannerCircuit.mjs";
import { bothGauges } from "./circuitRetrain.mjs";

const { RECIPE, setsOf41, chosenOf, championOf, hullOk, diffOf, keepsOf, badOf, SOUND, BIASED, esResumable, scoredLine, readLedger, resumeFromText, countingRng, round6, mergeAudit, notHurts, beats } = R42;
export { RECIPE, setsOf41, chosenOf, championOf, readLedger, resumeFromText, countingRng, round6, mergeAudit, SOUND, BIASED };
export const SEARCHES = RECIPE.runs, SEARCH_SEEDS = Object.freeze([97800, 97801, 97802, 97803]), EVERY = 50;
export const CHECKPOINTS = Object.freeze(Array.from({ length: RECIPE.iters / EVERY + 1 }, (_, i) => i * EVERY));
export const KIND = "both", SEEDS = Object.freeze([57001, 57300]), GATE_SEEDS = Object.freeze([57901, 57902]), DIVES = 300, CHUNKS = 4;
export const ARMS = Object.freeze(["NEW", "SEAT-04"]), COND_NAMES = Object.freeze(["REF", "BIAS"]);
/** Round 42's committed audit, whose SEAT-04 fingerprints were recorded BEFORE plannerPerturbed gained its `plan` getter: the passive-getter check replays them. */
export const R42_SEAT_JOB = "brain/rig-results/planner-circuit/SEAT-04__REF__0.json";

/** The policy of the round: the 35 -> 84 -> 7 look-ahead circuit with the two-gauge seam. `evalOf` is a seam for the gate. */
export function lookaheadPolicy({ evalOf = T.evaluate } = {}) {
    const base = PC.createLookaheadPolicy();
    const evaluate = (pilot, set) => bothGauges(evalOf(pilot, set, { gauge: SOUND }), evalOf(pilot, set, { gauge: BIASED }));
    return { ...base, evaluate };
}

/** The record of a finished search (Round 42's shape, this round's seed). */
export function recordOf(k, lines, { Pol = lookaheadPolicy(), sets = setsOf41(), recipe = RECIPE, every = EVERY, resumes = 0 } = {}) {
    const cps = lines.map(({ weights, ...c }) => ({ ...c, w: round6(weights) })), ci = chosenOf(cps);
    const sc = (w, set) => Pol.evaluate(Pol.pilotFor(w), set), pool = sc(cps[ci].w, sets.pool), startPool = ci === 0 ? pool : sc(cps[0].w, sets.pool);
    return { k, seed: SEARCH_SEEDS[k], recipe, every, weightCount: Pol.WEIGHT_COUNT, features: Pol.features, improved: cps.at(-1).improved, neutral: cps.at(-1).neutral, finalTrain: cps.at(-1).trainScore,
        checkpoints: cps.map(({ w, ...c }) => c), chosen: ci, chosenAt: cps[ci].at, heldOut: cps[ci].heldOut, poolCrashed: pool.crashed,
        start: { train: cps[0].trainScore, heldOut: cps[0].heldOut, poolCrashed: startPool.crashed }, resumes, weights: Array.from(cps[ci].w) };
}
/** One search, whole or resumed (Round 42's esResumable with this round's seed and policy). Returns the record, or null when stopped. */
export function searchJob(k, opts = {}) {
    if (!(Number.isInteger(k) && k >= 0 && k < SEARCHES)) throw new Error(`lookaheadCircuit.searchJob: search ${k} is not 0..${SEARCHES - 1}`);
    const recipe = { ...RECIPE, ...(opts.recipe || {}) }, sets = opts.sets || setsOf41(), Pol = opts.policy || lookaheadPolicy(), every = opts.every || EVERY;
    const score = scoredLine(Pol, sets.heldOut), write = opts.onLine || ((l) => l);
    const r = esResumable(Pol, SEARCH_SEEDS[k], recipe, sets.train, { every, ledger: opts.ledger || [], onLine: (l) => write(score(l)), stopAfter: opts.stopAfter ?? Infinity });
    return r.stopped ? null : recordOf(k, r.lines, { Pol, sets, recipe, every, resumes: opts.resumes || 0 });
}
/** The ledger's checks (Round 42's, this round's seeds and its 35-input weight count). */
export function ledgerChecks(records, weightCount = PC.createLookaheadPolicy().WEIGHT_COUNT) {
    const f = [], ks = records.map((r) => r.k).sort((a, b) => a - b);
    if (ks.join() !== Array.from({ length: SEARCHES }, (_, i) => i).join()) f.push(`the searches are ${ks.join(",") || "none"} (it needs 0 to ${SEARCHES - 1}, once each)`);
    if (records.some((r) => !Array.isArray(r.checkpoints) || r.checkpoints.map((c) => c.at).join() !== CHECKPOINTS.join())) f.push(`a search's checkpoints are not ${CHECKPOINTS.join(",")}`);
    if (records.some((r) => r.checkpoints.some((c, i) => i > 0 && !(c.draws > r.checkpoints[i - 1].draws)))) f.push("a search's random draws do not rise from checkpoint to checkpoint");
    if (records.some((r) => JSON.stringify(r.recipe) !== JSON.stringify(records[0].recipe))) f.push("the records are of more than one recipe");
    if (records.some((r) => JSON.stringify(r.start) !== JSON.stringify(records[0].start))) f.push("the records disagree about the START");
    if (records.some((r) => !Array.isArray(r.weights) || r.weights.length !== r.weightCount || r.weightCount !== weightCount || r.seed !== SEARCH_SEEDS[r.k])) f.push(`a record's weights are not the look-ahead net's ${weightCount}, or its seed is not its search's`);
    return f;
}
export const championWeights = (records, Pol = lookaheadPolicy()) => { const c = championOf(records); return c.record ? Float32Array.from(c.record.weights) : Pol.handWeights(); };

/** An arm's pilot. NEW also hands back the seats it made (station overrides, residual sizes), through `seats`. */
export function pilotOf(arm, { weights = null, seats = null, overrides = {} } = {}) {
    if (arm === "NEW") {
        if (!weights) throw new Error("lookaheadCircuit.pilotOf: NEW needs the champion's weights");
        const Pol = PC.createLookaheadPolicy(), w = Float32Array.from(weights), seatOf = PC.makePlannerSeat(Pol.stepper(w), { lookahead: true });
        return T.flyDecision((ctx) => { const s = seatOf(ctx); if (seats) seats.push(s); return s; });
    }
    if (arm === "SEAT-04") return SS.surveyPilot({ overrides });
    throw new Error(`lookaheadCircuit.pilotOf: unknown arm ${JSON.stringify(arm)} (${ARMS.join(", ")})`);
}
export function chunkRange(j, range = SEEDS) {
    const n = range[1] - range[0] + 1, per = Math.ceil(n / CHUNKS);
    if (!(Number.isInteger(j) && j >= 0 && j < CHUNKS)) throw new Error(`lookaheadCircuit.chunkRange: chunk ${j} is not 0..${CHUNKS - 1}`);
    return [range[0] + j * per, Math.min(range[1], range[0] + (j + 1) * per - 1)];
}
export const AUDIT_JOBS = Object.freeze(ARMS.flatMap((a) => COND_NAMES.flatMap((c) => Array.from({ length: CHUNKS }, (_, j) => [a, c, String(j)]))));
export function auditJob(arm, cond, chunk, { weights = null, range = SEEDS, seconds = null } = {}) {
    if (!COND_NAMES.includes(cond)) throw new Error(`lookaheadCircuit.auditJob: unknown condition ${JSON.stringify(cond)} (${COND_NAMES.join(", ")})`);
    const [a, b] = chunkRange(Number(chunk), range), seats = arm === "NEW" ? [] : null;
    const res = T.evaluate(pilotOf(arm, { weights, seats }), T.setOf([KIND], a, b), { gauge: cond === "REF" ? SOUND : BIASED, ...(seconds ? { seconds } : {}) });
    return seats ? { ...res, overrides: seats.map((s) => s.overrides) } : res;
}

export function verdictsOf(res) {
    const bad = Object.fromEntries(ARMS.map((a) => [a, { REF: badOf(res[a].REF), BIAS: badOf(res[a].BIAS) }]));
    const v1 = hullOk(bad.NEW.BIAS, bad["SEAT-04"].BIAS), v2 = hullOk(bad.NEW.REF, bad["SEAT-04"].REF);
    const refVsSeat = diffOf(res.NEW.REF, res["SEAT-04"].REF), biasVsSeat = diffOf(res.NEW.BIAS, res["SEAT-04"].BIAS);
    const v3ref = notHurts(refVsSeat), v3bias = notHurts(biasVsSeat), v4 = beats(refVsSeat) && beats(biasVsSeat);
    return { bad, v1, v2, v3ref, v3bias, v3: v3ref && v3bias, v4, refVsSeat, biasVsSeat };
}
/** The registered bottom line: the profile is replaced ONLY on V1 + V2 + V3 + V4 (beats the seat); a start champion is said so. */
export function bottomLine(res, { isStart = false } = {}) {
    const v = verdictsOf(res), tail = isStart ? " -- THE CHAMPION IS THE START: THE TRAINING BOUGHT NOTHING" : "";
    const miss = [!v.v1 && "V1 the hull under BIAS", !v.v2 && "V2 the hull at REF", !v.v3ref && "V3 the score at REF", !v.v3bias && "V3 the score under BIAS", !v.v4 && "V4 it does not beat the seat beyond 2 se at both gauges"].filter(Boolean);
    return miss.length ? `THE LOOK-AHEAD CIRCUIT DOES NOT BEAT THE SEAT (${miss.join("; ")}): NOTHING IS REPLACED${tail}` : "THE LOOK-AHEAD CIRCUIT BEATS THE SEAT: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE" + tail;
}

const gateSet = () => T.setOf([KIND], GATE_SEEDS[0], GATE_SEEDS[1]);
/** NEW'S START IS THE SHIPPED SEAT: the untrained look-ahead net against surveyPilot() on the gate's dives, both gauges, full length, fingerprint and command for command. */
export function startIsSeat({ set = gateSet(), weights = null } = {}) {
    const Pol = PC.createLookaheadPolicy(), w = weights || Pol.handWeights();
    for (const sc of set) for (const g of [SOUND, BIASED]) {
        const a = [], b = [];
        const fa = T.fly(Pol.pilotFor(w), sc, { gauge: g, onTick: (t, st, nd, cmd) => a.push(JSON.stringify(cmd)) });
        const fb = T.fly(SS.surveyPilot(), sc, { gauge: g, onTick: (t, st, nd, cmd) => b.push(JSON.stringify(cmd)) });
        if (fa.fingerprint !== fb.fingerprint || a.length === 0 || a.join("|") !== b.join("|")) return false;
    }
    return true;
}
/** THE GETTER IS PASSIVE: fresh flights of the shipped seat reproduce `count` SEAT-04 fingerprints Round 42's audit recorded before the getter existed. `recorded` is the job file's JSON. */
export function getterPassive(recorded, count = 2) {
    const runs = recorded.runs.slice(0, count), first = 56001;   // the job's chunk 0 starts at Round 42's first audit seed
    const now = T.evaluate(SS.surveyPilot(), T.setOf([KIND], first, first + count - 1), { gauge: SOUND }).runs;
    return runs.length === count && now.every((r, i) => r.fingerprint === runs[i].fingerprint);
}
/** SEAT-04 IS THE SHIPPED SEAT: the arm against surveyPilot() on the gate's dives (60 s, BIAS), fingerprint for fingerprint. */
export function shippedSame() {
    const o = { seconds: 60 }, g = { gauge: BIASED, seconds: 60 };
    const a = T.evaluate(pilotOf("SEAT-04", { overrides: o }), gateSet(), g).runs, b = T.evaluate(SS.surveyPilot({ overrides: o }), gateSet(), g).runs;
    return a.length === b.length && a.length > 0 && a.every((r, i) => r.fingerprint === b[i].fingerprint);
}

export function checksOf(res, records, { dives = DIVES, start = true, passive = true, shipped = true } = {}) {
    const rows = [], ref = res[ARMS[0]].REF.runs, sample = [SEEDS[0], SEEDS[0] + 150, SEEDS[1]], isStart = championOf(records).isStart;
    const gen = sample.every((s) => JSON.stringify(T.setOf([KIND], s, s)[0]) === JSON.stringify(T.scenario(s, KIND)));
    rows.push({ name: "GENERATOR", ok: gen, text: `the scenarios are needsTask.scenario's on ${sample.length} samples: ${gen}` });
    const sizes = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.length === dives));
    rows.push({ name: "SIZES", ok: sizes, text: `every arm has ${dives} dives in both conditions: ${sizes}` });
    const aligned = ARMS.every((a) => COND_NAMES.every((c) => res[a][c].runs.every((r, i) => r.kind === KIND && r.damage0 === ref[i].damage0)));
    rows.push({ name: "ALIGNED", ok: aligned, text: `both arms and conditions fly the same scenarios in the same order: ${aligned}` });
    const bite = ARMS.every((a) => res[a].BIAS.runs.some((r, i) => r.fingerprint !== res[a].REF.runs[i].fingerprint));
    rows.push({ name: "THE FAULT REACHES THE PILOT", ok: bite, text: `every arm's BIAS dives differ from its REF dives on at least one dive: ${bite}` });
    const differ = res.NEW.REF.runs.some((r, k) => r.fingerprint !== res["SEAT-04"].REF.runs[k].fingerprint), arms = isStart ? !differ : differ;
    rows.push({ name: "THE ARMS DIFFER", ok: arms, text: `NEW ${differ ? "differs from" : "EQUALS"} SEAT-04 (${isStart ? "the champion is the start, so it must equal it" : "it must differ"}): ${arms}` });
    const led = ledgerChecks(records);
    rows.push({ name: "THE LEDGER IS COMPLETE", ok: led.length === 0, text: led.length ? led.join("; ") : `${SEARCHES} searches of ${CHECKPOINTS.length} checkpoints, draws rising, one recipe, one start; ${records.reduce((a, r) => a + (r.resumes || 0), 0)} resume(s)` });
    rows.push({ name: "NEW'S START IS THE SHIPPED SEAT", ok: start, text: `the untrained look-ahead net against surveyPilot() on the gate's dives, both gauges, full length, fingerprint and command for command: ${start}` });
    rows.push({ name: "SEAT-04 IS THE SHIPPED SEAT", ok: shipped, text: `SEAT-04 against surveyPilot() on the gate's dives: ${shipped}` });
    rows.push({ name: "THE GETTER IS PASSIVE", ok: passive, text: `the shipped seat reproduces Round 42's recorded SEAT-04 dives, flown before plannerPerturbed's plan getter existed: ${passive}` });
    return rows;
}
const sgn = (x) => (x >= 0 ? "+" : "") + x.toFixed(4), fmt = (p) => `${sgn(p.mean)} (se ${p.se.toFixed(4)}) ${keepsOf(p)}`;
export function trainingLines(records) {
    const c = championOf(records), L = [`ROUND 43 TRAINING: ${records.length} searches of the look-ahead circuit (35 inputs) on TRAIN_SET (both gauges), checkpointed every ${EVERY} children, chosen on HELD_OUT_SET`];
    for (const r of [...records].sort((a, b) => a.k - b.k)) L.push(`  search ${r.k} (seed ${r.seed}): held-out by checkpoint ${r.checkpoints.map((x) => x.heldOut.toFixed(4)).join(" ")}; chose child ${r.chosenAt} (held-out ${r.heldOut.toFixed(4)}, start ${r.start.heldOut.toFixed(4)}); pool crushed ${r.poolCrashed} (start ${r.start.poolCrashed}) ${r.poolCrashed <= r.start.poolCrashed ? "ELIGIBLE" : "not eligible"}; ${r.resumes || 0} resume(s)`);
    L.push(c.none ? "CHAMPION: none eligible -- NEW is the start (the shipped seat)" : `CHAMPION: search ${c.record.k}, child ${c.record.chosenAt} (held-out ${c.record.heldOut.toFixed(4)})${c.isStart ? " -- THE START, i.e. THE SHIPPED SEAT: the training bought nothing measurable on held-out dives" : ""}, ${c.eligible} of ${c.searches} eligible`);
    return L;
}
export function report(res, records, opts = {}) {
    const L = [...trainingLines(records), `ROUND 43 AUDIT: ${ARMS.join(", ")} under REF and +0.10 BIAS; seeds ${SEEDS[0]}-${SEEDS[1]}, ${KIND}`];
    const checks = checksOf(res, records, opts), failed = checks.filter((c) => !c.ok);
    for (const c of checks) L.push(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}: ${c.text}`);
    if (failed.length) { L.push("A CHECK FAILED: the verdicts below are NOT WEIGHED and nothing is replaced.", "BOTTOM LINE: NOT WEIGHED (a check failed)"); return L; }
    const v = verdictsOf(res), isStart = championOf(records).isStart;
    for (const a of ARMS) L.push(`  ${a.padEnd(8)} REF ${res[a].REF.score.toFixed(4)} (${res[a].REF.crashed}/${res[a].REF.stranded})  BIAS ${res[a].BIAS.score.toFixed(4)} (${res[a].BIAS.crashed}/${res[a].BIAS.stranded})`);
    L.push(`  V1 NEW'S HULL IS ${v.v1 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S UNDER BIAS (${v.bad.NEW.BIAS} against ${v.bad["SEAT-04"].BIAS})`);
    L.push(`  V2 NEW'S HULL IS ${v.v2 ? "NO WORSE THAN" : "WORSE THAN"} THE SHIPPED SEAT'S AT REF (${v.bad.NEW.REF} against ${v.bad["SEAT-04"].REF})`);
    L.push(`  V3 THE SCORE LINE: NEW minus SEAT-04 at REF ${fmt(v.refVsSeat)} ${v.v3ref ? "clears" : "MISSES"}; under BIAS ${fmt(v.biasVsSeat)} ${v.v3bias ? "clears" : "MISSES"}`);
    L.push(`  V4 NEW ${v.v4 ? "BEATS" : "does not beat"} THE SEAT beyond 2 se at both gauges`);
    const ov = (c) => { const o = res.NEW[c].overrides || []; return `${o.filter((x) => x > 0).length} of ${o.length} dives, ${o.reduce((a, x) => a + x, 0)} ticks`; };
    L.push(`REPORTED, NOT WEIGHED: station overrides at REF ${ov("REF")}, under BIAS ${ov("BIAS")}`);
    L.push(`BOTTOM LINE: ${bottomLine(res, { isStart })}`);
    return L;
}
