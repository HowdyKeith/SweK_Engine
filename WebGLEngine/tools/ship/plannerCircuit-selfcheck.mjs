#!/usr/bin/env node
// WebGLEngine/tools/ship/plannerCircuit-selfcheck.mjs -- Round 42 of brain/NEEDS_AND_LIMITS.md (the planner circuit)
//
// Run: node tools/ship/plannerCircuit-selfcheck.mjs   (about 30 s: the start check flies eight full planner dives on 56901-56902)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- found by name, not by a list).
//
// Holds: the registration as code (seeds, recipe, sets, the net's shape and zero readout); NEW'S START IS THE SHIPPED SEAT on the gate's dives (both gauges,
// full length, fingerprint and command for command); THE RESUME IS EXACT (a search killed twice and resumed equals one run unbroken, line for line, and both
// equal Round 41's esWithCheckpoints move for move -- on a stub fitness, so it is fast); a torn ledger line is dropped, never half-read; the record, the
// ledger checks, the champion, V1-V4 and the bottom line on synthetic results; the audit flies the condition it names; the command refuses a second
// audit flight and is export-free. No search seed, audit seed or training set is flown here.
//
// ---- SABOTAGE LOG ----------------------------------------------------------------------------------------------
// 20 mutants, all red by name, after FOUR findings before the pass and ONE during it:
//   red at once: the resume ignoring its draws, repeating a child, or resetting its counts (the resume row); neutral moves dropped (the Round 41
//   equality); a readout starting non-zero (the shape row); the override threshold at 0 instead of -1 (the override row); the one-hot off by one (the
//   one-hot row); the filter frozen (the start row); a torn line half-read (the torn-line row); the draws check dropped (the ledger row); the isStart
//   words dropped (the bottom line); V4 at REF only (V4); the audit's gauge inverted (the audit row); the merge dropping the overrides (the merge row);
//   the command's job refusal and its ledger check each disabled (the command rows); startIsSeat made blind (the negative control); the record's start
//   taken from the chosen checkpoint (the record row); THE ARMS DIFFER ignoring isStart; Round 41's search seeds (2: the seeds and the ledger rows).
//   *** BEFORE THE PASS, BY READING: an untrained readout is all zeros, so the start check could not see a wrong override threshold, a misplaced one-hot,
//   a recordOf never called, or a startIsSeat that always says true -- each got its row (a base planner the gate chooses, a stub record, a negative
//   control); and V4 had no one-gauge fixture. *** DURING IT: the merge mutant CRASHED the gate (a TypeError on .length), which is no verdict; the row
//   now reads a missing array as empty and goes red by name. THE WORKER WAS RESTARTED MID-PASS and left the ledger-check mutant in the command; it was
//   found by checking every mutant's text against the files, restored, and the last seven mutants re-run.
//   NOT GRADED HERE: the full recipe's cost on the rig, and a resume through the command's own file path (the library's resumeFromText is graded; the
//   command's open-append-fsync is not).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as X from "./plannerCircuit.mjs";
import * as PC from "../../brain/plannerCircuitSeat.mjs";
import * as T from "../../brain/needsTask.mjs";
import * as SS from "../../brain/surveySeat.mjs";
import { esWithCheckpoints, SEARCH_SEEDS as SEEDS41, SEEDS as AUDIT41 } from "./circuitRetrain2.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const sec = (t) => console.log("\n" + t);

sec("1. THE REGISTRATION, AS CODE");
{
    const note = fs.readFileSync(path.join(ENG, "brain", "NEEDS_AND_LIMITS.md"), "utf8"), r42 = note.slice(note.indexOf("# Round 42"));
    ok("!! the seeds are Round 42's: searches 97700-97703, audit 56001-56300 (300 dives), gate 56901-56902 -- none of Round 41's",
        JSON.stringify(X.SEARCH_SEEDS) === "[97700,97701,97702,97703]" && JSON.stringify(X.SEEDS) === "[56001,56300]" && JSON.stringify(X.GATE_SEEDS) === "[56901,56902]" && X.DIVES === 300 &&
        !X.SEARCH_SEEDS.some((s) => SEEDS41.includes(s)) && X.SEEDS[0] > AUDIT41[1] && /search seeds 97700-97703/.test(r42) && /56001-56300/.test(r42) && /56901-56902/.test(r42));
    ok("!! the recipe is Round 41's, unchanged: 4 searches x 300 children, sigma 0.3, 1-4 weights a child, checkpoints every 50 (seven, the start included)",
        X.RECIPE.runs === 4 && X.RECIPE.iters === 300 && X.RECIPE.sigma === 0.3 && X.RECIPE.maxK === 4 && X.EVERY === 50 && X.CHECKPOINTS.join() === "0,50,100,150,200,250,300");
    const s = X.setsOf41();
    ok("the fitness, checkpoint and eligibility sets are TRAIN_SET, HELD_OUT_SET and POOL_SET", s.train === T.TRAIN_SET && s.heldOut === T.HELD_OUT_SET && s.pool === T.POOL_SET);
    const Pol = X.plannerPolicy(), w = Pol.handWeights(), o = Pol.offsets;
    ok("!! the net is 24 -> 84 -> 7 (2,695 weights) and its readout starts at ZERO, so the untrained pilot is the planner seat",
        Pol.features === 24 && Pol.hidden === 84 && Pol.WEIGHT_COUNT === 2695 && w.length === 2695 && w.subarray(o.W2).every((v) => v === 0) && w.subarray(0, o.W2).some((v) => v !== 0),
        `W1/b1 drawn, W2/b2 all zero (${w.length - o.W2} weights)`);
    ok("the base is BASE_04 by value, equal to the shipped seat's constants today", JSON.stringify(PC.BASE_04) === JSON.stringify(SS.SURVEY_CONSTANTS) && Object.isFrozen(PC.BASE_04));
}

sec("2. NEW'S START IS THE SHIPPED SEAT (56901-56902, both gauges, full length)");
{
    const t0 = Date.now(), same = X.startIsSeat();
    ok("!! the untrained planner circuit flies surveyPilot()'s dives fingerprint for fingerprint and command for command, every tick", same, `8 full dives in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    // a non-zero readout must be able to move it, or the check above could not fail
    const Pol = PC.createPlannerPolicy(), w = Pol.handWeights(); w[Pol.offsets.B2 + 0] = 1;   // y0 = 1 on the surface residual: surfaces earlier
    const sc = T.setOf([X.KIND], X.GATE_SEEDS[0], X.GATE_SEEDS[0])[0];
    const a = T.fly(Pol.pilotFor(w), sc, { gauge: X.SOUND }), b = T.fly(SS.surveyPilot(), sc, { gauge: X.SOUND });   // full length: the readout's effect was measured to show on the full dive
    ok("...and a non-zero readout DOES move it, and startIsSeat says so (the check can fail)", a.fingerprint !== b.fingerprint && X.startIsSeat({ set: [sc], weights: w }) === false);
}

sec("2b. THE OVERRIDE AND THE ONE-HOT, WITH A PLANNER WHOSE STATION THE GATE CHOOSES");
{
    // a fake base that always names the station at position 2 (while it is open), and a stub net whose outputs the gate sets; 60 s of a gate dive
    const sc = T.setOf([X.KIND], X.GATE_SEEDS[1], X.GATE_SEEDS[1])[0];
    const fly = (y) => {
        const xs = [], seats = [];
        const sp = { step: (x) => { xs.push(Array.from(x)); return Float64Array.from(y); } };
        const base = () => (st, obs) => ({ surface: false, station: obs.stations[2] && !obs.stations[2].visited ? obs.stations[2] : null, cap: 0.9, pump: false, repair: false });
        const seatOf = PC.makePlannerSeat(sp, { base });
        T.fly(T.flyDecision((ctx) => { const s = seatOf(ctx); seats.push(s); return s; }), sc, { gauge: X.SOUND, seconds: 60 });
        return { xs, overrides: seats[0].overrides };
    };
    const keep = fly([0, 0.5, 0, 0, 0, 0, 0]), swing = fly([0, 1, -1, -1, 0, 0, 0]);
    ok("!! the planner's station holds unless another's residual beats it by MORE THAN 1: +0.5 on station 0 overrides nothing, a swing of 2 overrides",
        sc.stations.length >= 3 && keep.overrides === 0 && swing.overrides > 0, `0.5 -> ${keep.overrides} override ticks; 1 vs -1 -> ${swing.overrides}`);
    ok("!! the 24 features end in the one-hot of the planner's position in obs.stations: [0, 0, 1] while it names station 2",
        keep.xs.length > 1 && keep.xs.every((x) => x.length === 24) && JSON.stringify(keep.xs[0].slice(21)) === "[0,0,1]");
}

sec("3. THE RESUME IS EXACT (a stub fitness, so it is fast)");
{
    const real = PC.createPlannerPolicy(), target = Float32Array.from({ length: real.WEIGHT_COUNT }, (_, i) => Math.sin(i));
    // a stub whose score depends on every weight: accepts and rejects both happen
    const Pol = { ...real, pilotFor: (w) => w, evaluate: (w) => { let s = 0; for (let i = 0; i < w.length; i += 7) s -= (w[i] - target[i]) ** 2; return { score: s, sound: s, biased: s, crashed: 0, stranded: 0 }; } };
    const recipe = { ...X.RECIPE, iters: 120 }, every = 20, seed = 4242;
    const whole = X.esResumable(Pol, seed, recipe, null, { every }).lines;
    const a = X.esResumable(Pol, seed, recipe, null, { every, stopAfter: 37 });
    const b = X.esResumable(Pol, seed, recipe, null, { every, ledger: a.lines, stopAfter: 41 });
    const c = X.esResumable(Pol, seed, recipe, null, { every, ledger: b.lines });
    ok("!! a search killed twice (after 37, then 41 more children) and resumed from its ledger equals one run unbroken, line for line",
        a.stopped && b.stopped && !c.stopped && JSON.stringify(c.lines) === JSON.stringify(whole) && whole.length === 7,
        `${whole.length} lines; draws ${whole.map((l) => l.draws).join(",")}; improved ${whole.at(-1).improved}, neutral ${whole.at(-1).neutral}`);
    const r41 = esWithCheckpoints(Pol, seed, recipe, null, every);
    ok("!! ...and both equal Round 41's esWithCheckpoints move for move (same weights and training score at every checkpoint)",
        r41.checkpoints.length === whole.length && r41.checkpoints.every((cp, i) => cp.at === whole[i].at && cp.trainScore === whole[i].trainScore && JSON.stringify(Array.from(cp.weights)) === JSON.stringify(whole[i].weights)) &&
        r41.improved === whole.at(-1).improved && r41.neutral === whole.at(-1).neutral);
    ok("the search moves at all on the stub (or the equality above proves nothing)", whole.at(-1).improved > 0 && whole.at(-1).trainScore > whole[0].trainScore);
    const text = whole.slice(0, 3).map((l) => JSON.stringify(l) + "\n").join("") + JSON.stringify(whole[3]).slice(0, 40);
    const rr = X.resumeFromText(text);
    ok("!! a ledger line cut short by a kill is DROPPED, never half-read, and the file is rewritten clean",
        rr.ledger.length === 3 && rr.clean === whole.slice(0, 3).map((l) => JSON.stringify(l) + "\n").join("") && X.readLedger("").length === 0,
        "3 whole lines kept, the torn fourth dropped");
    const sets = { train: null, heldOut: null, pool: null };
    const PolP = { ...Pol, evaluate: (w) => { const s = Pol.evaluate(w); return { ...s, crashed: w[0] > 0 ? 1 : 0 }; } };
    const rec = X.searchJob(1, { policy: PolP, sets, recipe, every });
    const best = whole.reduce((b, l, i) => (l.trainScore > whole[b].trainScore + 1e-12 ? i : b), 0);
    ok("!! the record of a finished search: its chosen checkpoint is the best held-out, ties to the earlier; its weights are that checkpoint's at six decimals; its start is checkpoint 0",
        rec && rec.checkpoints.length === 7 && rec.chosen === rec.checkpoints.reduce((b, c, i) => (c.heldOut > rec.checkpoints[b].heldOut + 1e-12 ? i : b), 0) &&
        rec.start.heldOut === rec.checkpoints[0].heldOut && rec.weights.length === real.WEIGHT_COUNT && rec.weights.every((v) => Math.abs(v * 1e6 - Math.round(v * 1e6)) < 1e-3 || Math.fround(Math.round(v * 1e6) / 1e6) === v) &&
        rec.seed === X.SEARCH_SEEDS[1] && rec.chosenAt > 0 && typeof rec.poolCrashed === "number" && typeof rec.start.poolCrashed === "number", `chose child ${rec && rec.chosenAt} of ${rec && rec.checkpoints.length}; best on train at line ${best}`);
    ok("a resume counts itself, and a fresh start counts none", X.resumeFromText("").resumes === 0 && rr.resumes === 1 && X.resumeFromText(JSON.stringify({ ...whole[0], resumes: 2 }) + "\n").resumes === 3);
}

sec("4. THE RECORD, THE LEDGER CHECKS AND THE CHAMPION, ON SYNTHETIC SEARCHES");
{
    const mk = (k, held, { pool = 0, startPool = 0, draws = null } = {}) => ({ k, seed: X.SEARCH_SEEDS[k], recipe: X.RECIPE, every: 50, weightCount: 2695, weights: Array(2695).fill(0),
        checkpoints: X.CHECKPOINTS.map((at, i) => ({ at, heldOut: held[i], draws: draws ? draws[i] : 10 * i + 1 })), chosen: held.indexOf(Math.max(...held)), chosenAt: X.CHECKPOINTS[held.indexOf(Math.max(...held))],
        heldOut: Math.max(...held), poolCrashed: pool, start: { train: 0.8, heldOut: held[0], poolCrashed: startPool } });
    const flat = [0.9, 0.89, 0.88, 0.88, 0.87, 0.86, 0.85], up = [0.9, 0.9, 0.91, 0.905, 0.9, 0.9, 0.9];
    const recs = [mk(0, flat), mk(1, flat), mk(2, up), mk(3, flat)];
    ok("!! a complete ledger passes; draws that do not rise, a search's wrong seed and a missing search are each named",
        X.ledgerChecks(recs).length === 0 && X.ledgerChecks([...recs.slice(0, 3), mk(3, flat, { draws: [1, 5, 5, 9, 10, 11, 12] })]).some((f) => /draws/.test(f)) &&
        X.ledgerChecks([...recs.slice(0, 3), { ...mk(3, flat), seed: 97603 }]).some((f) => /seed/.test(f)) && X.ledgerChecks(recs.slice(0, 3)).some((f) => /searches/.test(f)));
    const c = X.championOf(recs), cStart = X.championOf([mk(0, flat), mk(1, flat), mk(2, up, { pool: 1 }), mk(3, flat)]);
    ok("!! the champion is the best held-out of the eligible; an ineligible improver leaves the START, and the line says so",
        c.record.k === 2 && c.record.chosenAt === 100 && !c.isStart && cStart.isStart && cStart.record.chosenAt === 0,
        `search 2 child 100 -> champion; ineligible (pool crushed 1 > 0) -> the start`);
    ok("the training lines name the start as THE SHIPPED SEAT when the champion is the start", X.trainingLines([mk(0, flat), mk(1, flat), mk(2, up, { pool: 1 }), mk(3, flat)]).at(-1).includes("THE SHIPPED SEAT"));
}

sec("5. V1-V4 AND THE BOTTOM LINE, ON SYNTHETIC AUDITS");
{
    const runs = (scores, fp = "a") => scores.map((score, i) => ({ score, kind: X.KIND, damage0: i, fingerprint: fp + i }));
    const arm = (ref, bias, { cr = 0, cb = 0, fp = "a" } = {}) => ({ REF: { score: 0, runs: runs(ref, fp + "r"), crashed: cr, stranded: 0 }, BIAS: { score: 0, runs: runs(bias, fp + "b"), crashed: cb, stranded: 0 } });
    const n = 300, base = Array.from({ length: n }, (_, i) => 0.8 + 0.1 * Math.sin(i));
    const shift = (d) => base.map((x, i) => x + d + 0.002 * Math.cos(3 * i));
    const res = (newRef, newBias, o = {}) => ({ NEW: arm(newRef, newBias, { ...o, fp: "n" }), "SEAT-04": arm(base, base, { cb: 1, fp: "s" }), CUR: arm(shift(-0.01), shift(-0.01), { fp: "c" }) });
    const same = res(shift(0), shift(0)), hurt = res(shift(-0.02), shift(0)), beat = res(shift(0.02), shift(0.02)), hull = res(shift(0), shift(0), { cb: 12 });
    ok("!! V3 clears at the seat's level and MISSES beyond -2 se at either gauge; the line names which", X.bottomLine(same).startsWith("THE PLANNER CIRCUIT HOLDS") && /V3 the score at REF/.test(X.bottomLine(hurt)) && !/BIAS/.test(X.bottomLine(hurt)));
    ok("!! V1 is Round 33's hull test: 12 crushed against 1 under BIAS fails it", !X.verdictsOf(hull).v1 && /V1 the hull under BIAS/.test(X.bottomLine(hull)) && X.verdictsOf(same).v1);
    const beatRef = res(shift(0.02), shift(0));
    ok("!! V4 is weighed only for the claim: KEEPS at BOTH gauges adds AND IT BEATS THE SEAT; at one gauge, or none, no claim",
        X.verdictsOf(beat).v4 && /AND IT BEATS THE SEAT$/.test(X.bottomLine(beat)) && !/BEATS/.test(X.bottomLine(same)) && !X.verdictsOf(beatRef).v4 && !/BEATS/.test(X.bottomLine(beatRef)));
    ok("!! when the champion is the start, a clearing line must say THE TRAINING BOUGHT NOTHING", /IT IS THE SHIPPED SEAT: THE TRAINING BOUGHT NOTHING/.test(X.bottomLine(same, { isStart: true })) && !/BOUGHT NOTHING/.test(X.bottomLine(same)));
    const recsStart = X.CHECKPOINTS && [0, 1, 2, 3].map((k) => ({ k, seed: X.SEARCH_SEEDS[k], recipe: X.RECIPE, weightCount: 1, weights: [0], checkpoints: X.CHECKPOINTS.map((at, i) => ({ at, heldOut: 0.9 - i * 0.01, draws: i + 1 })), chosen: 0, chosenAt: 0, heldOut: 0.9, poolCrashed: 0, start: { train: 0.8, heldOut: 0.9, poolCrashed: 0 } }));
    const equalNew = { ...same, NEW: { REF: { ...same["SEAT-04"].REF }, BIAS: { ...same["SEAT-04"].BIAS } } };
    const row = (r, recs) => X.checksOf(r, recs, { dives: n }).find((x) => x.name === "THE ARMS DIFFER");
    ok("!! THE ARMS DIFFER: NEW must EQUAL SEAT-04 when the champion is the start, and must differ otherwise",
        row(equalNew, recsStart).ok && !row(same, recsStart).ok);
}

sec("6. THE AUDIT AND THE COMMAND");
{
    // FULL LENGTH: on 56901 the +0.10 bias changes nothing in the first 60, 120 or 240 s (measured), so a shortened dive could not tell the gauges apart
    const r = X.auditJob("SEAT-04", "REF", 0, { range: [X.GATE_SEEDS[0], X.GATE_SEEDS[0]] });
    const ref = T.evaluate(SS.surveyPilot(), T.setOf([X.KIND], X.GATE_SEEDS[0], X.GATE_SEEDS[0]), { gauge: X.SOUND });
    const bias = X.auditJob("SEAT-04", "BIAS", 0, { range: [X.GATE_SEEDS[0], X.GATE_SEEDS[0]] });
    ok("!! an audit job flies the condition it names: REF is the sound gauge, BIAS the biased one", r.runs[0].fingerprint === ref.runs[0].fingerprint && bias.runs[0].fingerprint !== r.runs[0].fingerprint);
    const nw = X.auditJob("NEW", "BIAS", 0, { range: [X.GATE_SEEDS[0], X.GATE_SEEDS[0]], seconds: 30, weights: PC.createPlannerPolicy().handWeights() });
    ok("NEW's jobs carry the station overrides a dive, and the merge keeps them", Array.isArray(nw.overrides) && nw.overrides.length === 1 && nw.overrides[0] === 0 && (X.mergeAudit([nw, nw]).overrides || []).length === 2);
    ok("!! the audit is 24 jobs: 3 arms x 2 conditions x 4 chunks, and the chunks tile 56001-56300 with no gap or overlap",
        X.AUDIT_JOBS.length === 24 && X.CHUNKS === 4 && JSON.stringify(X.COND_NAMES) === '["REF","BIAS"]' && JSON.stringify(X.ARMS) === '["NEW","SEAT-04","CUR"]' &&
        [0, 1, 2, 3].map((j) => X.chunkRange(j)).every(([a, b], j, all) => (j === 0 ? a === 56001 : a === all[j - 1][1] + 1) && (j === 3 ? b === 56300 : true)),
        [0, 1, 2, 3].map((j) => X.chunkRange(j).join("-")).join(", "));
    let threw = 0; try { X.pilotOf("SEAT-05"); } catch { threw++; } try { X.pilotOf("NEW"); } catch { threw++; } try { X.chunkRange(4); } catch { threw++; }
    ok("an unknown arm, NEW without weights, and a fifth chunk are refused", threw === 3);
    ok("championWeights falls back to the START (the hand weights) when no search is eligible; round6 is six decimals in float32",
        JSON.stringify(Array.from(X.championWeights([]))) === JSON.stringify(Array.from(PC.createPlannerPolicy().handWeights())) && X.round6([0.12345678])[0] === Math.fround(0.123457));
    const cr = X.countingRng(7), d0 = [cr(), cr(), cr()], cr2 = X.countingRng(7, 2);
    ok("countingRng counts its draws, and a skip of n continues the same stream", cr.draws === 3 && cr2.draws === 2 && cr2() === d0[2]);
    ok("notHurts is not-HURTS (a mean below -2 se is the only miss)", X.notHurts({ mean: -0.01, se: 0.01 }) && !X.notHurts({ mean: -0.03, se: 0.01 }) && X.notHurts({ mean: 0.03, se: 0.01 }));
    const sl = X.scoredLine({ pilotFor: (w) => w, evaluate: (w) => ({ score: w[0], sound: 1, biased: 2 }) }, null)({ at: 0, weights: [0.1234567] });
    ok("scoredLine scores a checkpoint on held-out at its SIX-DECIMAL weights, as the champion will fly them", sl.heldOut === Math.fround(0.123457) && sl.heldOutSound === 1 && sl.heldOutBiased === 2);
    // RESTATED 2026-11-21, Round 42's replacement made: the audit's check (CUR IS THE AQUARIUM'S CIRCUIT PROFILE) was PASS when flown -- the committed report says so -- and
    // the profile has flown the planner circuit's champion (the start, i.e. the shipped seat) since. CUR stays Round 40's net, reachable as circuitSeat("circuit", CIRCUIT_CHAMPION).
    const AQ = await import("../../render/subAquariumCircuit.mjs"), t1 = Date.now();
    const was = X.profileSame((p) => AQ.circuitSeat(p, AQ.CIRCUIT_CHAMPION)), now = X.profileSame(AQ.circuitSeat), ship = X.shippedSame();
    const rep42 = fs.readFileSync(path.join(ENG, "brain", "rig-results", "planner-circuit-report.json"), "utf8");
    ok("!! CUR WAS THE AQUARIUM'S CIRCUIT PROFILE (Round 40's net, still reachable; PASS in the committed report) and is not since Round 42's replacement; SEAT-04 IS THE SHIPPED SEAT",
        was && !now && ship && JSON.parse(rep42).report.some((l) => l.trim().startsWith("PASS CUR IS THE AQUARIUM'S CIRCUIT PROFILE:") && l.trim().endsWith(": true")), `${((Date.now() - t1) / 1000).toFixed(1)} s`);
    const nw0 = { REF: { score: 0, runs: [], crashed: 0, stranded: 0 }, BIAS: { score: 0, runs: [], crashed: 0, stranded: 0 } };
    const rep = X.report({ NEW: nw0, "SEAT-04": nw0, CUR: nw0 }, [], { dives: 300 });
    ok("!! the report with a failed check says NOT WEIGHED and prints no verdict", rep.at(-1) === "BOTTOM LINE: NOT WEIGHED (a check failed)" && !rep.some((l) => /V1|V3/.test(l)) && rep.some((l) => /FAIL SIZES/.test(l)));
    const CMD = path.join(HERE, "plannerCircuitCmd.mjs"), src = fs.readFileSync(CMD, "utf8"), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "planner-circuit-"));
    try {
        fs.mkdirSync(path.join(tmp, "planner-circuit"));
        fs.writeFileSync(path.join(tmp, "planner-circuit", "NEW__REF__0.json"), "SENTINEL");
        const again = spawnSync(process.execPath, [CMD, "job", "NEW", "REF", "0", "--out", tmp], { encoding: "utf8", timeout: 60000 });
        ok("!! an audit job already written is never flown again (exit 2, the file untouched)", again.status === 2 && /REFUSED/.test(again.stderr) && fs.readFileSync(path.join(tmp, "planner-circuit", "NEW__REF__0.json"), "utf8") === "SENTINEL");
        const audit = spawnSync(process.execPath, [CMD, "audit", "--out", tmp], { encoding: "utf8", timeout: 60000 });
        ok("!! no audit without a complete training ledger (exit 2)", audit.status === 2 && /not complete/.test(audit.stderr));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    ok("the command is export-free, the library's caller, and resumes through the library's resumeFromText", !/^\s*export\b/m.test(src) && /from "\.\/plannerCircuit\.mjs"/.test(src) && /X\.resumeFromText\(/.test(src));
}

console.log();
if (fails) { console.log("plannerCircuit-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("plannerCircuit-selfcheck: all checks pass");
