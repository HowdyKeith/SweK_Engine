#!/usr/bin/env node
// WebGLEngine/tools/ship/lookaheadCircuit-selfcheck.mjs -- Round 43 of brain/NEEDS_AND_LIMITS.md (the look-ahead circuit)
//
// Run: node tools/ship/lookaheadCircuit-selfcheck.mjs   (about 30 s: the start check flies eight full planner dives on 57901-57902)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- found by name, not by a list).
//
// Holds: the registration as code (seeds, recipe, the 35 -> 84 -> 7 net and its zero readout); THE GETTER IS PASSIVE (the shipped seat still flies the SEAT-04 dives Round 42's
// committed audit recorded before plannerPerturbed gained its `plan` getter); the eleven look-ahead features on plans whose answer is known, and read live off the planner;
// NEW'S START IS THE SHIPPED SEAT on the gate's dives; the resume, through Round 42's code, with this round's seed; the ledger checks; the two-arm checks; and the bottom line,
// which replaces the profile ONLY on V4. No search seed, audit seed or training set is flown here.
//
// ---- SABOTAGE LOG ----------------------------------------------------------------------------------------------
// 19 mutants (each in a backed-up copy, restored byte-identical and checked), all red by name in the end; FIVE were not, first, and each is fixed:
//   red at once: the getter handing back the planner's live values (the copy row); L3 summed (2); the margin to the third value; the age uncapped; the
//   look-ahead flag ignored (the live row); replacing without V4 (2); V4 at REF only; Round 42's seeds (3); the weight count unchecked; getterPassive
//   blinded (red only once its tampered-record control was added, before the pass); startIsSeat blinded; the command's job refusal and ledger check.
//   *** NOT AT FIRST: (1) a getter returning an object before the first plan CRASHED the gate inside the probe dive -- no verdict; the probe now catches
//   and fails its row (3 red). (2) Round 42's CUR arm put back went red on one row and then CRASHED section 6; the section now catches (2 red).
//   (3) the planner replanning half as often went 0 RED, and that is MEASURED, not a gate defect: a 240 s replan changes none of 16 recorded dives (the
//   planner moves a decision on 0-4% of ticks). It was replaced by a decision-moving mutant, the planner's pump threshold: 2 red (passive, start).
//   (4) "features read before the planner" was MY no-op (an unused variable); the real one -- features a step stale -- went red only once a row asked
//   that the FIRST net step already carries the plan made that tick (1 red). (5) a getter with a side effect (resetting the planner's filter when read)
//   went 0 RED: the look-ahead seat flies the planner's station only, so no decision on the gate's dives moved. A row now flies one dive twice, the
//   getter read every tick in one flight, and requires the same plans value for value and the same dive (1 red). ***

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./lookaheadCircuit.mjs";
import * as R42 from "./plannerCircuit.mjs";
import * as PC from "../../brain/plannerCircuitSeat.mjs";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const sec = (t) => console.log("\n" + t);

sec("1. THE REGISTRATION, AS CODE");
{
    const note = fs.readFileSync(path.join(ENG, "brain", "NEEDS_AND_LIMITS.md"), "utf8"), r43 = note.slice(note.indexOf("# Round 43"));
    ok("!! the seeds are Round 43's: searches 97800-97803, audit 57001-57300, gate 57901-57902 -- none of Round 42's",
        JSON.stringify(X.SEARCH_SEEDS) === "[97800,97801,97802,97803]" && JSON.stringify(X.SEEDS) === "[57001,57300]" && JSON.stringify(X.GATE_SEEDS) === "[57901,57902]" &&
        !X.SEARCH_SEEDS.some((s) => R42.SEARCH_SEEDS.includes(s)) && X.SEEDS[0] > R42.SEEDS[1] && /search seeds 97800-97803/.test(r43) && /57001-57300/.test(r43) && /57901-57902/.test(r43));
    ok("!! the recipe is Round 42's and the arms are NEW and SEAT-04 only (the aquarium's circuit profile IS the seat since Round 42)",
        X.RECIPE === R42.RECIPE && X.EVERY === 50 && X.CHECKPOINTS.join() === "0,50,100,150,200,250,300" && JSON.stringify(X.ARMS) === '["NEW","SEAT-04"]' && X.AUDIT_JOBS.length === 16);
    const Pol = X.lookaheadPolicy(), w = Pol.handWeights(), o = Pol.offsets;
    ok("!! the net is 35 -> 84 -> 7 (3,619 weights: 24 of Round 42 plus 11 look-ahead) and its readout starts at ZERO",
        PC.LOOKAHEAD === 11 && PC.FEATURES_LA === 35 && Pol.features === 35 && Pol.hidden === 84 && Pol.WEIGHT_COUNT === 3619 && w.subarray(o.W2).every((v) => v === 0) && w.subarray(0, o.W2).some((v) => v !== 0));
    ok("Round 42's policy is untouched by the option: still 24 inputs and 2,695 weights", PC.createPlannerPolicy().features === 24 && PC.createPlannerPolicy().WEIGHT_COUNT === 2695);
}

sec("2. THE GETTER IS PASSIVE, AND IT CARRIES THE PLAN");
{
    const rec = JSON.parse(fs.readFileSync(path.join(ENG, X.R42_SEAT_JOB), "utf8"));
    const tampered = { ...rec, runs: rec.runs.map((r, i) => (i === 1 ? { ...r, fingerprint: "00000000" } : r)) };
    ok("!! the shipped seat still flies the SEAT-04 dives Round 42's committed audit recorded BEFORE plannerPerturbed gained its plan getter (56001, 56002) -- and a tampered record fails it",
        X.getterPassive(rec, 2) && !X.getterPassive(tampered, 2));
    const sc = T.scenario(X.GATE_SEEDS[0], X.KIND), seatOf = SS.surveySeat();
    let seen = null, before = undefined, copyOk = false, crashed = null;
    try { T.fly(T.flyDecision((ctx) => { const s = seatOf(ctx); const wrap = (st, obs) => { if (before === undefined) before = s.plan; const d = s(st, obs); if (!seen && s.plan) { seen = s.plan; const again = s.plan; again.values.nearest = -1; copyOk = s.plan.values.nearest !== -1; } return d; }; return wrap; }), sc, { gauge: X.SOUND, seconds: 30 }); } catch (e) { crashed = e.message; }
    ok("!! the getter is null before the first plan, then carries the plan's values (nearest-first included), its order and its time -- as a COPY (writing to it does not reach the planner)",
        crashed === null && before === null && seen && typeof seen.values.nearest === "number" && Object.keys(seen.values).length >= 1 && typeof seen.t === "number" && copyOk, crashed ? "the probe dive THREW: " + crashed : "");
}

{
    // READING THE GETTER CHANGES NOTHING: one dive flown twice, the getter read on every tick of one flight and never in the other. The plans the planner
    // made, and the dive, must be identical. (A getter that touched the planner's filter changed no decision on the gate's dives -- the look-ahead seat flies
    // the planner's station only -- so the start check could not see it; the plans can.)
    const sc = T.scenario(X.GATE_SEEDS[1], X.KIND), plansOf = (read) => {
        const seatOf = SS.surveySeat(), plans = []; let last = null;
        const fp = T.fly(T.flyDecision((ctx) => { const s = seatOf(ctx); return (st, obs) => { if (read) void s.plan; const d = s(st, obs); const p = s.stats.plans; if (p !== last) { last = p; plans.push(JSON.stringify(s.plan)); } return d; }; }), sc, { gauge: X.BIASED, seconds: 300 }).fingerprint;
        return { fp, plans };
    };
    const quiet = plansOf(false), loud = plansOf(true);
    ok("!! READING THE GETTER CHANGES NOTHING: a dive whose planner is read on every tick makes the same plans, value for value, and flies the same dive as one never read",
        quiet.plans.length > 1 && JSON.stringify(quiet.plans) === JSON.stringify(loud.plans) && quiet.fp === loud.fp, `${quiet.plans.length} plans compared`);
}

sec("3. THE ELEVEN FEATURES, ON PLANS WHOSE ANSWER IS KNOWN");
{
    const out = new Float64Array(11), F = (plan, t = 60) => Array.from(PC.lookaheadFeatures(plan, { t }, out, 0)).map((v) => +v.toFixed(6));
    const plan = { values: { nearest: 0.7, "1>0>2": 0.9, "0>1>2": 0.6, "0>2>1": 0.65, "2>0>1": 0.8 }, order: [1, 0, 2], t: 0 };
    ok("!! L1 best 0.9, L2 nearest 0.7, L3 gain 0.2; per-station best 0.65 / 0.9 / 0.8 with masks 1 1 1; L10 margin 0.1; L11 age 60/120 = 0.5",
        JSON.stringify(F(plan)) === JSON.stringify([0.9, 0.7, 0.2, 0.65, 0.9, 0.8, 1, 1, 1, 0.1, 0.5]), JSON.stringify(F(plan)));
    ok("!! no plan, or a plan of nearest-first only: zeros where nothing is known (no permutation starts anywhere, a margin of 0), the age capped at 1",
        F(null).every((v) => v === 0) && JSON.stringify(F({ values: { nearest: 0.5 }, t: 0 }, 500)) === JSON.stringify([0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 1]));
    ok("a station no permutation starts at keeps 0 and mask 0 (station 2 here)", (() => { const f = F({ values: { nearest: 0.4, "0>1": 0.5, "1>0": 0.3 }, t: 60 }); return f[5] === 0 && f[8] === 0 && f[3] === 0.5 && f[4] === 0.3; })());
    const xs = [], sp = { step: (x) => { xs.push(Array.from(x)); return new Float64Array(7); } };
    T.fly(T.flyDecision(PC.makePlannerSeat(sp, { lookahead: true })), T.scenario(X.GATE_SEEDS[1], X.KIND), { gauge: X.SOUND, seconds: 120 });
    ok("!! live: the look-ahead seat steps the net on 35 features, the last 11 read off the planner's plan (L1 is a rollout value in [0, 1] and is not all zero)",
        xs.length > 1 && xs.every((x) => x.length === 35) && xs.some((x) => x[24] > 0) && xs.every((x) => x[24] >= 0 && x[24] <= 1 && x[34] >= 0 && x[34] <= 1));
    ok("!! the features are read AFTER the planner decides that tick: the very first net step (t = 0, the planner's first plan) already carries a plan value, with age 0",
        xs.length > 0 && xs[0][24] > 0 && xs[0][34] === 0, `first step L1 ${xs.length ? xs[0][24].toFixed(4) : "-"}, L11 ${xs.length ? xs[0][34] : "-"}`);
}

sec("4. NEW'S START IS THE SHIPPED SEAT (57901-57902, both gauges, full length)");
{
    const t0 = Date.now();
    ok("!! the untrained look-ahead net flies surveyPilot()'s dives fingerprint for fingerprint and command for command", X.startIsSeat(), `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const P = PC.createLookaheadPolicy(), w = P.handWeights(); w[P.offsets.B2 + 0] = 1;   // y0 = 1 on the surface residual (Round 42's probe; a weight reading a hidden unit that never fires moved nothing)
    ok("...and a non-zero readout DOES move it, and startIsSeat says so (the check can fail)", X.startIsSeat({ set: [T.scenario(X.GATE_SEEDS[0], X.KIND)], weights: w }) === false);
    ok("SEAT-04 IS THE SHIPPED SEAT on the gate's dives", X.shippedSame());
}

sec("5. THE SEARCH, THE RECORD AND THE LEDGER (a stub fitness)");
{
    const real = PC.createLookaheadPolicy(), target = Float32Array.from({ length: real.WEIGHT_COUNT }, (_, i) => Math.cos(i));
    const Pol = { ...real, pilotFor: (w) => w, evaluate: (w) => { let s = 0; for (let i = 0; i < w.length; i += 7) s -= (w[i] - target[i]) ** 2; return { score: s, sound: s, biased: s, crashed: w[0] > 0 ? 1 : 0, stranded: 0 }; } };
    const recipe = { ...X.RECIPE, iters: 100 }, every = 20, sets = { train: null, heldOut: null, pool: null };
    const lines = []; const rec = X.searchJob(2, { policy: Pol, sets, recipe, every, onLine: (l) => { lines.push(l); return l; } });
    const a = X.searchJob(2, { policy: Pol, sets, recipe, every, stopAfter: 33 });
    const half = []; X.searchJob(2, { policy: Pol, sets, recipe, every, stopAfter: 33, onLine: (l) => { half.push(l); return l; } });
    const rest = X.searchJob(2, { policy: Pol, sets, recipe, every, ledger: half, resumes: 1 });
    ok("!! a search runs this round's seed through Round 42's resumable loop: stopped and resumed, it ends where an unbroken one does",
        a === null && rec && rest && rec.seed === 97802 && rest.seed === 97802 && JSON.stringify(rest.checkpoints) === JSON.stringify(rec.checkpoints) && JSON.stringify(rest.weights) === JSON.stringify(rec.weights) && rest.resumes === 1,
        `chose child ${rec && rec.chosenAt}; ${lines.length} lines`);
    const mk = (k, o = {}) => ({ k, seed: X.SEARCH_SEEDS[k], recipe: X.RECIPE, weightCount: 3619, weights: Array(3619).fill(0), checkpoints: X.CHECKPOINTS.map((at, i) => ({ at, heldOut: 0.9, draws: i + 1 })), chosen: 0, chosenAt: 0, heldOut: 0.9, poolCrashed: 0, start: { train: 0.8, heldOut: 0.9, poolCrashed: 0 }, ...o });
    const recs = [0, 1, 2, 3].map((k) => mk(k));
    ok("!! the ledger checks pass a complete ledger and name Round 42's 2,695-weight net and Round 42's seeds as wrong",
        X.ledgerChecks(recs).length === 0 && X.ledgerChecks([...recs.slice(0, 3), mk(3, { weightCount: 2695, weights: Array(2695).fill(0) })]).length > 0 && X.ledgerChecks([...recs.slice(0, 3), mk(3, { seed: 97703 })]).length > 0);
    ok("championWeights falls back to the start (the look-ahead net's hand weights) when nothing is eligible", JSON.stringify(Array.from(X.championWeights([]))) === JSON.stringify(Array.from(PC.createLookaheadPolicy().handWeights())));
    // 2026-11-27 (the publish merge; definitionGates named recordOf, trainingLines, SEARCHES and the rest below as unmentioned by any gate).
    const again = X.recordOf(2, lines, { Pol, sets, recipe, every });
    ok("!! recordOf, given the search's own scored lines, is the record searchJob returned, field for field (the seed is search 2's, 97802)",
        JSON.stringify(again) === JSON.stringify(rec) && again.seed === 97802 && again.weightCount === real.WEIGHT_COUNT, `chose child ${again.chosenAt}`);
    const TL = X.trainingLines(recs);
    ok("trainingLines heads with the round and its 35-input net, gives one line per search in search order, and ends on the champion",
        X.SEARCHES === 4 && X.SEARCHES === X.SEARCH_SEEDS.length && X.SEARCH_SEEDS.join() === "97800,97801,97802,97803" && TL.length === X.SEARCHES + 2 &&
        /^ROUND 43 TRAINING: 4 searches of the look-ahead circuit \(35 inputs\)/.test(TL[0]) && [0, 1, 2, 3].every((k) => TL[k + 1].startsWith(`  search ${k} (seed ${X.SEARCH_SEEDS[k]}): `)) && /^CHAMPION: /.test(TL.at(-1)),
        TL.at(-1));
}

sec("6. THE TWO-ARM CHECKS AND THE BOTTOM LINE (V4 OR NOTHING)");
try {
    const runs = (scores, fp) => scores.map((score, i) => ({ score, kind: X.KIND, damage0: i, fingerprint: fp + i }));
    const n = 300, base = Array.from({ length: n }, (_, i) => 0.8 + 0.1 * Math.sin(i)), shift = (d) => base.map((x, i) => x + d + 0.002 * Math.cos(3 * i));
    const arm = (r, b, fp, cb = 0) => ({ REF: { score: 0, runs: runs(r, fp + "r"), crashed: 0, stranded: 0 }, BIAS: { score: 0, runs: runs(b, fp + "b"), crashed: cb, stranded: 0 } });
    const res = (nr, nb, o = {}) => ({ NEW: arm(nr, nb, "n", o.cb || 0), "SEAT-04": arm(base, base, "s", 1) });
    const same = res(shift(0), shift(0)), beat = res(shift(0.02), shift(0.02)), beatOne = res(shift(0.02), shift(0)), hurt = res(shift(-0.02), shift(0));
    ok("!! a net that only EQUALS the seat replaces NOTHING (unlike Round 42): the line names V4", /DOES NOT BEAT THE SEAT \(V4 /.test(X.bottomLine(same)) && /NOTHING IS REPLACED/.test(X.bottomLine(same)));
    ok("!! beating the seat at BOTH gauges replaces the profile; at one gauge it does not", X.bottomLine(beat) === "THE LOOK-AHEAD CIRCUIT BEATS THE SEAT: IT REPLACES THE AQUARIUM'S CIRCUIT PROFILE" && /NOTHING IS REPLACED/.test(X.bottomLine(beatOne)));
    const vs = X.verdictsOf(same), vb = X.verdictsOf(beat), vo = X.verdictsOf(beatOne), vh = X.verdictsOf(hurt), vc = X.verdictsOf(res(shift(0.02), shift(0.02), { cb: 12 }));
    ok("!! verdictsOf: equal to the seat clears V1-V3 and not V4; beating it at both gauges clears V4, at one gauge it does not; a hurt score fails V3 at REF; a worse hull under BIAS fails V1",
        vs.v1 && vs.v2 && vs.v3 && !vs.v4 && vb.v1 && vb.v2 && vb.v3 && vb.v4 && !vo.v4 && !vh.v3ref && vh.v3bias && !vh.v3 && !vc.v1 && vc.v2 && vc.bad.NEW.BIAS === 12 && vc.bad["SEAT-04"].BIAS === 1 &&
        X.COND_NAMES.join() === "REF,BIAS" && Object.keys(vs.bad.NEW).join() === "REF,BIAS");
    ok("!! a hurt score or a worse hull is named; a start champion is said so", /V3 the score at REF/.test(X.bottomLine(hurt)) && /V1 the hull under BIAS/.test(X.bottomLine(res(shift(0.02), shift(0.02), { cb: 12 }))) && /THE TRAINING BOUGHT NOTHING$/.test(X.bottomLine(same, { isStart: true })));
    const recsStart = [0, 1, 2, 3].map((k) => ({ k, seed: X.SEARCH_SEEDS[k], recipe: X.RECIPE, weightCount: 3619, weights: Array(3619).fill(0), checkpoints: X.CHECKPOINTS.map((at, i) => ({ at, heldOut: 0.9, draws: i + 1 })), chosen: 0, chosenAt: 0, heldOut: 0.9, poolCrashed: 0, start: { train: 0.8, heldOut: 0.9, poolCrashed: 0 } }));
    const eq = { NEW: same["SEAT-04"], "SEAT-04": same["SEAT-04"] }, row = (r) => X.checksOf(r, recsStart, { dives: n }).find((c) => c.name === "THE ARMS DIFFER");
    ok("!! THE ARMS DIFFER in its isStart form: NEW must EQUAL SEAT-04 when the champion is the start", row(eq).ok && !row(same).ok);
    const rep = X.report({ NEW: arm([], [], "x"), "SEAT-04": arm([], [], "y") }, [], { dives: 300 });
    ok("!! a failed check prints NOT WEIGHED and no verdict; the checks include THE GETTER IS PASSIVE", rep.at(-1) === "BOTTOM LINE: NOT WEIGHED (a check failed)" && rep.some((l) => /THE GETTER IS PASSIVE/.test(l)) && !rep.some((l) => /^  V1/.test(l)));
} catch (e) { ok("!! section 6 ran to its end (the verdict code did not throw on two arms)", false, e.message); }

sec("7. THE AUDIT AND THE COMMAND");
{
    const r = X.auditJob("SEAT-04", "REF", 0, { range: [X.GATE_SEEDS[0], X.GATE_SEEDS[0]], seconds: 30 });
    ok("an audit job flies its arm on the chunk it names, and an unknown arm or condition is refused", r.runs.length === 1 && (() => { try { X.auditJob("CUR", "REF", 0); return false; } catch { } try { X.auditJob("NEW", "DROP", 0); return false; } catch { return true; } })());
    const ch = [0, 1, 2, 3].map((j) => X.chunkRange(j)), throws = (f) => { try { f(); return false; } catch { return true; } };
    ok("!! the audit is the registration's: 300 dives, seeds 57001-57300, in 4 chunks that tile them with no gap or overlap; a chunk outside 0-3 is refused; the job list is every arm, condition and chunk",
        X.DIVES === 300 && X.SEEDS[1] - X.SEEDS[0] + 1 === X.DIVES && X.CHUNKS === 4 && ch[0][0] === 57001 && ch[3][1] === 57300 && ch.every((c, j) => j === 0 || c[0] === ch[j - 1][1] + 1) &&
        ch.reduce((a, c) => a + c[1] - c[0] + 1, 0) === 300 && throws(() => X.chunkRange(4)) && throws(() => X.chunkRange(-1)) && X.chunkRange(0, [10, 12]).join() === "10,10" &&
        X.AUDIT_JOBS.length === X.ARMS.length * X.COND_NAMES.length * X.CHUNKS, ch.map((c) => c.join("-")).join(", "));
    ok("pilotOf: NEW needs the champion's weights and is built from them; SEAT-04 is the shipped seat's pilot; any other arm is refused",
        throws(() => X.pilotOf("NEW")) && !!X.pilotOf("NEW", { weights: PC.createLookaheadPolicy().handWeights() }) && !!X.pilotOf("SEAT-04") && throws(() => X.pilotOf("CUR")));
    const CMD = path.join(HERE, "lookaheadCircuitCmd.mjs"), src = fs.readFileSync(CMD, "utf8"), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lookahead-circuit-"));
    try {
        fs.mkdirSync(path.join(tmp, "lookahead-circuit"));
        fs.writeFileSync(path.join(tmp, "lookahead-circuit", "NEW__REF__0.json"), "SENTINEL");
        const again = spawnSync(process.execPath, [CMD, "job", "NEW", "REF", "0", "--out", tmp], { encoding: "utf8", timeout: 60000 });
        ok("!! an audit job already written is never flown again (exit 2, the file untouched)", again.status === 2 && /REFUSED/.test(again.stderr) && fs.readFileSync(path.join(tmp, "lookahead-circuit", "NEW__REF__0.json"), "utf8") === "SENTINEL");
        const audit = spawnSync(process.execPath, [CMD, "audit", "--out", tmp], { encoding: "utf8", timeout: 60000 });
        ok("!! no audit without a complete training ledger (exit 2)", audit.status === 2 && /not complete/.test(audit.stderr));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    ok("the command is export-free, the library's caller, and resumes through resumeFromText; it reads Round 42's recorded seat job for the passive-getter check",
        !/^\s*export\b/m.test(src) && /from "\.\/lookaheadCircuit\.mjs"/.test(src) && /X\.resumeFromText\(/.test(src) && /X\.getterPassive\(/.test(src) && /X\.R42_SEAT_JOB/.test(src));
}

console.log();
if (fails) { console.log("lookaheadCircuit-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("lookaheadCircuit-selfcheck: all checks pass");
