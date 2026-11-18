// WebGLEngine/tools/ship/flyMushroomMany-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyMushroomMany-selfcheck.mjs      (about a minute and a half; IT NEVER RUNS THE ROUND -- its one training is of 2 iterations on draw 901, its audits are of 2 lives
// but for the verdict's three on the round's 200 (two hand rules and one committed fly, after the reading), and it starts no process)
//
// THE GATE OF THE MUSHROOM MANY-ODOUR ROUND (registered in brain/FLY_MUSHROOM_MANY_WIP.md before brain/rl/manyPnOdorEnv.mjs, tools/ship/flyMushroomMany.mjs and
// tools/ship/takeFlyMushroomMany.mjs existed): does the teachers' pairing matter when eight odours must be kept apart?
//   1  THE TASK                 a life by hand from its seed: eight odours over the glomeruli, half of them bad, each trial's odour, its noise and its Kenyon cells, the score; the odour
//                               round's task and the fly not edited
//   2  THE ROUND'S NUMBERS      the draws, arms, recipe, audit (no life of an earlier round's); the committed files and the wiring by their hashes; each arm's teachers; the floors; the
//                               registration says the same
//   3  ONE TRAINING             a record's weights are the trainer's from the task and fly made here by hand; its scores again
//   4  THE RECORDS              24 draws; T2, H, USES
//   5  THE COMMAND              it is this round's; no training of the round's, no process
//   6  THE VERDICT              the results file as committed unread at b5aaccb2, read from the file: the checks, T2, H, USES, the arms, the description after the reading, the hand
//                               rule on the permuted flies (measured after the reading), a re-audit, the expectations, the note's result
// SABOTAGE LOG (2026-11-18) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked); this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the
// command as a process) for all 34; every one red by name (the number is the rows red):
//   THE TASK (brain/rl/manyPnOdorEnv.mjs): E1 14 trials an odour 2 | E2 three bad of eight 2 | E3 the eight odours one odour 2 | E4 no noise 1 | E5 the reward over all the trials 1 | E6 the
//   last odour never presented 1 | E7 the odour round's task edited (a comment in brain/rl/pnOdorEnv.mjs) 1
//   THE ROUND: F1 PFAM taught by the real teachers 3 | F2 four odours 5 | F3 the audit the odour round's 1 | F4 T2 PFAM against PLASTIC 2 | F5 the rank sum's BETTER and WORSE swapped 2 |
//   F6 H against the start 1 | F7 USES counts every fly 1 | F8 the score with p_a at 0 keeps the rate 1 | F9 the odour file's own checks skipped 1 | F10 the mushroom file's own checks
//   skipped 1 | F11 the wiring not checked 1 | F12 the teachers not checked 1 | F13 the recipe 40 iterations 4 | F14 the round writes the odour round's file 1 | F15 the overlap of a life's
//   first two odours only 1 | F16 the floors' hand rule on PFAM's teachers 1 | F17 the recheck looked for on PFAM 3 | F18 not fresh lives 1
//   THE COMMAND: C1 the second training is PFAM's 1 | C2 exits 0 on a word it does not know 1 | C3 the job trains with a recipe of its own 1 | C4 the file's draws not counted as done 1 |
//   C5 reads without the odour round's file 1.   THE NOTE: N1 its 16 trials an odour 1 | N2 its audit from 11000001 1 | N3 its T2 a sign test 1 | N4 it drops why the answer may be no 1
//   FOUND BEFORE THE SABOTAGES: tools/ship/definitionGates-selfcheck.mjs found the library's overlapOf named by no gate (the floors row now calls it); two rows of section 1 as first
//   written tested nothing they named (a loop condition that was always true, and a staying-away row of conditions unrelated to it), and were rewritten to fly every trial by hand.
// THE VERDICT'S SABOTAGES (2026-11-18, after the reading, the same runner, this gate alone): V1 a record's score (PFAM draw 7) changed in a digit the double holds 1 (the file's hash alone: the
//   draw is no arm's least or most and the change is under the arms row's 5e-5) | V2 T2 PFAM against PLASTIC 3 | V3 H against the start 1 (section 4's made records alone: on the real file
//   every fly is above the start as it is above the hand rule, 12 of 12 either way, and only the record where PLASTIC lies between them tells the two apart) | V4 USES needs 0.9 3 | V5 the
//   floors' hand rule changed in a digit the double holds 1 (the file's hash: nothing in the verdict recomputes that floor to the bit) | V6 the note's T2 says BETTER 1 | V7 the note's
//   expectation of H is 90 percent 1 | V8 the note names another commit 1 | V9 the note's 8 of 12 permutations above the real pairing is 7 1 | V10 the note's relabelled hand rule 0.6574 1 |
//   V11 the note's unregistered sign test p 0.015 1 | V12 the note's PFAM least 0.8475 1 | V13 the note's draws PLASTIC wins 4, 9 and 11 1. None went 0 red.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as Y from "./flyMushroomMany.mjs";
import * as O from "./flyMushroomOdours.mjs";
import * as M from "./flyMushroom.mjs";
import * as PF from "./paintingFly.mjs";
import * as OE from "../../brain/rl/odorEnv.mjs";
import * as PE from "../../brain/rl/pnOdorEnv.mjs";
import * as ME from "../../brain/rl/manyPnOdorEnv.mjs";
import { signTest } from "./voxelHome.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, sha = (f) => createHash("sha256").update(fs.readFileSync(path.join(ENG, f))).digest("hex");
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TWO = [880031, 880032];
const F = Object.fromEntries(Object.entries(Y.FILES).map(([k, f]) => [k, Y.fileOf(fs.readFileSync(path.join(ENG, f)))])), W = O.WIRING;

console.log("flyMushroomMany-selfcheck -- the mushroom many-odour round (eight odours a life through the projection neurons, the real teachers against permuted ones): the task, the numbers, one training, the records, the command\n");

console.log("1. THE TASK (brain/rl/manyPnOdorEnv.mjs, a life by hand)");
section(() => {
    const env = Y.envOf(), seed = 4242, o0 = env.reset(seed), r = OE.stream(seed), draw = () => (r() < PE.P_GLOM ? 0.5 + 0.5 * r() : 0);
    const odors = Array.from({ length: 8 }, () => Array.from({ length: W.ng }, draw)), q = [...Array(8).keys()]; for (let i = 7; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    const bad = new Set(q.slice(0, 4)), ref = new PE.PnOdorEnv({ task: "ONE", nk: W.nk, ng: W.ng, pnGlom: W.pnGlom, wiring: W.real }), gs = (rr) => Math.sqrt(-2 * Math.log(rr() + 1e-12)) * Math.cos(2 * Math.PI * rr());
    ok("!! EIGHT ODOURS A LIFE, EACH DRAWN AS THE ODOUR ROUND DREW ODOUR A (each glomerulus active with p 0.3 at a strength from 0.5 to 1), EACH INDEPENDENTLY; HALF OF THEM, AT RANDOM, BAD -- the life's own stream, by hand",
        J(env.odors) === J(odors) && J([...env.badSet].sort()) === J([...bad].sort()) && bad.size === 4 && ME.N_ODOURS === 8 && ME.PER_ODOUR === 15 && env.trials === 120 && env.maxSteps === 120 && PE.P_GLOM === 0.3 && PE.NOISE === 0.2);
    // every trial by hand from the life's own stream: one of the eight at random, each active glomerulus at its strength times (1 + 0.2 x a normal draw), held at 0 and above, its Kenyon
    // cells the odour round's rule (ref.kcsOf); approaching always, the reward +1/60 or -1/60 by the odour's meaning; done after trial 120
    let okAll = true, ret = 0, o = o0, picks = new Set();
    for (let t = 0; t < 120; t++) {
        const pick = Math.floor(r() * 8), g = odors[pick].map((v) => (v > 0 ? Math.max(0, v * (1 + 0.2 * gs(r))) : 0)); picks.add(pick);
        okAll = okAll && env.o === pick && o.t === t && J(o.x) === J(ref.kcsOf(g)) && o.x.length === Math.round(0.05 * W.nk);
        const res = env.step([1]), rw = (bad.has(pick) ? -1 : 1) / 60; ret += rw;
        okAll = okAll && res.reward === rw && res.done === (t === 119) && res.info.dist === 1 - env.ret && res.info.docked === false && res.info.crashed === false && env.us === (bad.has(pick) ? -1 : 1); o = res.obs;
    }
    ok("!! EACH TRIAL ONE OF THE EIGHT AT RANDOM, WITH THE ODOUR ROUND'S NOISE AND ITS KENYON-CELL RULE (the 5 percent with the most input: 203 cells); approaching scores +1/60 a good odour and -1/60 a bad one, the outcome told next; 120 trials, then done -- every trial by hand",
        okAll && env.ret === ret && o.x.length === 0 && picks.size === 8, `return approaching always ${env.ret.toFixed(4)}`);
    const e2 = Y.envOf(); e2.reset(4242); let stay = 0, last = null; const us = []; for (let k = 0; k < 120; k++) { last = e2.step([-1]); stay += last.reward; us.push(e2.us); }
    ok("staying away scores 0 and tells no outcome (info: not docked, not crashed, dist 1); an odd number of odours, or fewer than 2, is refused", stay === 0 && us.every((u) => u === 0) && last.done && J(last.info) === J({ docked: false, crashed: false, dist: 1 }) &&
        throws(() => new ME.ManyPnOdorEnv({ nk: W.nk, ng: W.ng, pnGlom: W.pnGlom, wiring: W.real, n: 3 }), /even number of odours/) && throws(() => new ME.ManyPnOdorEnv({ nk: W.nk, ng: W.ng, pnGlom: W.pnGlom, wiring: W.real, n: 0 }), /even number of odours/));
    ok("!! THE ODOUR ROUND'S TASK AND THE FLY ARE NOT EDITED: brain/rl/pnOdorEnv.mjs, brain/rl/odorEnv.mjs and brain/rl/mushroomFly.mjs are the bytes the odour round committed (aaef7be2)",
        sha("brain/rl/pnOdorEnv.mjs") === "8b969860bddce473a1a28df18008d2529b2963b27a60e4dea85bcd8fb77e1681" && sha("brain/rl/odorEnv.mjs") === "321506d5a9ec909fa3cbde56ab2a3acbd01db21baec0a5ba2ce5b7db7bcd8c4d" && sha("brain/rl/mushroomFly.mjs") === "41f511af84f7ebbd9f35dc065cfd0419cfaf0c68ab2a5c8fcec8d04c4119220e");
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    ok("!! THE MUSHROOM ROUND'S RECIPE AND DRAWS 1 TO 12; the arms PLASTIC and PFAM, the lead PLASTIC; alpha 0.01, the USES line 0.01; eight odours; this round's own results file",
        Y.RECIPE === M.RECIPE && J(Y.RECIPE) === J({ iters: 60, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 4, fresh: true, battery: 16 }) && Y.SEEDS === M.SEEDS && J(Y.ARMS) === J(["PLASTIC", "PFAM"]) && Y.LEAD === "PLASTIC" && Y.ALPHA === 0.01 && Y.USES_BY === 0.01 && Y.N === 8 && Y.RESULTS === "brain/flyMushroomManyRound.jsonl" &&
        throws(() => Y.flyOf("PSHUF", 1), /no arm PSHUF/) && throws(() => Y.trainOne("PLASTIC", 0), /whole number from 1/));
    const lives = new Map(), add = (x) => lives.set(x, (lives.get(x) || 0) + 1);
    Y.AUDIT.forEach(add); M.AUDIT.forEach(add); O.AUDIT.forEach(add); for (let k = 0; k < 200; k++) { add(3000001 + 7919 * k); add(6000001 + 7919 * k); } for (let it = 0; it < 60; it++) for (let k = 0; k < 4; k++) add(5000 + 104729 * (it + 1) + 17 * k); for (let k = 0; k < 16; k++) add(5000 + 17 * k);
    ok("!! THE AUDIT: 200 lives, seeds 14000001 + 7919 k -- no life of the mushroom or odour rounds' audits, of the mushroom rounds' scoping lives, or of the recipe's training and battery lives",
        Y.AUDIT.length === 200 && Y.AUDIT[0] === 14000001 && Y.AUDIT[199] === 14000001 + 7919 * 199 && [...lives.values()].every((c) => c === 1) && lives.size === 200 * 5 + 240 + 16);
    ok("!! THE COMMITTED FILES AND THE WIRING BY THEIR HASHES -- the mushroom round's, the odour round's and the vendored projection neurons -- and the tree has them today, each file passing its own checks",
        J(Y.FILES) === J({ mushroom: "brain/flyMushroomRound.jsonl", odours: "brain/flyMushroomOdoursRound.jsonl" }) && Y.MUSHROOM === M.RESULTS && Y.ODOURS === O.RESULTS && Y.MUSHROOM_SHA256 === "b4d8db8d8139598765767921a7e43d97ec3e183889a929f4df60653f75e9cc31" &&
        Y.ODOURS_SHA256 === "d45d35df2f7ccbbf36b6a081bbc34a1353c1abf637dd14ca0651e5403bbdbbfd" && F.mushroom.sha256 === Y.MUSHROOM_SHA256 && F.odours.sha256 === Y.ODOURS_SHA256 && W.sha256 === O.PNKC_SHA256 && M.checkRecords(F.mushroom.lines).length === 0 && O.checkRecords(F.odours.lines, F.mushroom).length === 0);
    ok("!! EACH ARM'S FLY: the mushroom round's fly with 93 weights, PLASTIC's teachers the real ones and PFAM's the mushroom round's PFAM of the draw (a permutation of the real ones among the output neurons)",
        Y.ARMS.every((a) => Y.SEEDS.every((s) => J(Y.flyOf(a, s).teach) === J(M.teachFor(a, s)) && Y.flyOf(a, s).paramCount() === 93)) && J(Y.flyOf("PLASTIC", 3).teach) === J(M.teachOf(M.CIRCUIT.dm)) && J(Y.flyOf("PFAM", 3).teach) !== J(Y.flyOf("PLASTIC", 3).teach) &&
        J([...Y.flyOf("PFAM", 3).teach].map((t) => J(t)).sort()) === J([...Y.flyOf("PLASTIC", 3).teach].map((t) => J(t)).sort()));
    const fl = Y.floors(TWO), byHand = (fly) => { const env = Y.envOf(); let sum = 0; for (const s of TWO) { let o = env.reset(s), done = false; while (!done) { const r = env.step(fly.act(o)); o = r.obs; done = r.done; } sum += env.ret; } return sum / 2; };
    const ov = (() => { const env = Y.envOf(); let sum = 0, n = 0; for (const s of TWO) { env.reset(s); const ks = env.odors.map((g) => env.kcsOf(g)); for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (i !== j) { const b = new Set(ks[j]); sum += ks[i].filter((k) => b.has(k)).length / ks[i].length; n++; } } return sum / n; })();
    ok("!! THE FLOORS ARE FLOWN BY THE ROUND'S OWN TASK: the untrained fly and the mushroom round's hand rule over the lives given, flown here by hand, and the odours' Kenyon-cell overlap over the 56 ordered pairs of each life",
        J(Object.keys(fl)) === J(["kind", "start", "hand", "overlap"]) && fl.start === byHand(M.policyOf("PLASTIC", 1)) && fl.hand === byHand(M.policyOf("PLASTIC", 1).setParams(M.HAND)) && near(fl.overlap, ov, 1e-12) && fl.overlap === Y.overlapOf(TWO) && Y.auditScore(M.policyOf("PLASTIC", 1), TWO) === fl.start, `overlap ${fl.overlap.toFixed(4)}`);
    const note = src("brain/FLY_MUSHROOM_MANY_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same: eight odours drawn independently, half bad, 15 trials an odour; the arms; draws 1 to 12; the audit from 14000001; T2 a rank sum and H a sign test; USES; PLASTIC draw 1 again; why the answer may be no",
        /\*\*Eight odours a life\*\*/.test(note) && /\*\*each odour independently\*\*/.test(note) && /\*\*Half of them, at random, are bad\.\*\*/.test(note) && /\*\*15 trials an odour: 120 trials a life\.\*\*/.test(note) && /\*\*draws 1 to 12\*\*/.test(note) &&
        /\*\*The audit: 200 lives, seeds 14000001 \+ 7919 k\*\*/.test(note) && /\*\*T2: PLASTIC against PFAM\*\* \(rank sum\)/.test(note) && /\*\*H: PLASTIC against the hand rule\*\* \(sign test\)/.test(note) && /\*\*PLASTIC draw 1 is trained a second time\.\*\*/.test(note) &&
        /\*\*Said first: why the answer may well be no, and what the round still tests\.\*\*/.test(note) && /\*\*which Kenyon-cell inputs each teacher's neurons sample\*\*/.test(note));
});

console.log("\n3. ONE TRAINING (2 iterations, 4 flies tried, 1 life each, a battery of 2, on draw 901)");
section(() => {
    const r = Y.trainOne("PFAM", 901, TINY, TWO);
    const res = trainDockES({ envFactory: () => new ME.ManyPnOdorEnv({ nk: W.nk, ng: W.ng, pnGlom: W.pnGlom, wiring: W.real }), obsDim: 1, actDim: 1, maxSteps: 120, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 901, freshEpisodes: true, batteryEps: 2,
        policyFactory: () => M.policyOf("PFAM", 901) });
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM THE TASK AND FLY MADE HERE BY HAND (eight odours, the PFAM fly of the draw, fresh lives, the battery), to the hash; the record names its teachers",
        PF.hashWeights(res.params) === r.weightsHash && r.weightCount === 93 && J(r.recipe) === J(TINY) && r.kind === "draw" && r.arm === "PFAM" && r.s === 901 && r.teachHash === M.teachHash(M.teachFor("PFAM", 901)) && r.history.length === 2);
    const w = PF.unpackWeights(r.weights);
    ok("the tiny training's weights give its score again, and its score with p_a at 0 is the same weights' with the rate at 0", Y.auditScore(M.policyOf("PFAM", 901).setParams(w), TWO) === r.score && Y.auditScore(M.ratesOff("PFAM", 901, w), TWO) === r.ratesOff && r.rate === M.policyOf("PFAM", 901).setParams(w).rate(), `${r.score.toFixed(4)}, at 0 ${r.ratesOff.toFixed(4)}`);
});

console.log("\n4. THE RECORDS (made here)");
section(() => {
    const wts = (a, s) => Float32Array.from([...Array(91).fill(a === "PFAM" ? 0.02 : 0.01), 0.1 + s / 100, 1]), hist = [0, 10, 20, 30, 40, 50, 59].map((it, k) => ({ it, ret: 0.3 + k / 100 }));
    const rec = (a, s, score, off) => ({ kind: "draw", arm: a, s, recipe: { ...Y.RECIPE }, teachHash: M.teachHash(M.teachFor(a, s)), weightCount: 93, weights: PF.packWeights(wts(a, s)), weightsHash: PF.hashWeights(wts(a, s)), rate: 0.5, ratesOff: off, score, history: hist });
    const file = (f, recheck = 1) => { const out = []; for (const a of Y.ARMS) for (const s of Y.SEEDS) { const [sc, off] = f(a, s); out.push(rec(a, s, sc, off)); } out.push({ kind: "recheck", arm: "PLASTIC", s: recheck, weightsHash: out.find((r) => r.arm === "PLASTIC" && r.s === recheck).weightsHash }, { kind: "floors", start: 0.01, hand: 0.64, overlap: 0.17 }); return out; };
    // PLASTIC above every PFAM fly and the hand rule; on PFAM draws 3, 6, 9, 12 the rate is not used
    const sc = (a, s) => (a === "PLASTIC" ? [0.9 + s / 1e4, 0.01] : [0.85 + s / 1e4, s % 3 === 0 ? 0.85 + s / 1e4 : 0.01]);
    const good = file(sc), R = Y.reading(good, F), lines = Y.readingLines(R).join("\n"), bad = (recs, re, FF = F, ws) => Y.checkRecords(recs, FF, ws).some((x) => re.test(x));
    ok("!! a file of 24 draws with PLASTIC draw 1 a second time and the floors passes every check; a draw missing, another recipe, another draw's teachers, a fly of 92 weights, weights not their hash, no score with p_a at 0, and no history each fail by name",
        Y.checkRecords(good, F).length === 0 && good.length === 26 && /^the checks hold/.test(lines) && bad(good.filter((r) => !(r.arm === "PFAM" && r.s === 12)), /PFAM draw 12 is there 0 times/) &&
        bad(good.map((r) => (r.arm === "PLASTIC" && r.s === 3 ? { ...r, recipe: { ...r.recipe, iters: 59 } } : r)), /PLASTIC draw 3 was trained with another recipe/) && bad(good.map((r) => (r.arm === "PFAM" && r.s === 4 ? { ...r, teachHash: M.teachHash(M.teachFor("PFAM", 5)) } : r)), /PFAM draw 4's teachers are not the mushroom round's PFAM draw 4's/) &&
        bad(good.map((r) => (r.arm === "PFAM" && r.s === 5 ? { ...r, weightCount: 92 } : r)), /PFAM draw 5 has 92 weights/) && bad(good.map((r) => (r.arm === "PLASTIC" && r.s === 6 ? { ...r, weightsHash: "0".repeat(16) } : r)), /PLASTIC draw 6's weights are not 93 finite numbers with its hash/) &&
        bad(good.map((r) => (r.arm === "PLASTIC" && r.s === 7 ? { ...r, ratesOff: null } : r)), /PLASTIC draw 7 has no score with its rate at 0/) && bad(good.map((r) => (r.arm === "PFAM" && r.s === 8 ? { ...r, history: [] } : r)), /PFAM draw 8 has no history from iteration 0 to 59/));
    ok("!! the second training of draw 2, no floors, a wiring that is not the vendored file, a committed file that is not the one committed, or one that fails its own checks, each fail by name and no record is weighed",
        J(Y.checkRecords(file(sc, 2), F)) === J(["PLASTIC draw 1 trained a second time is not there once with the same weights"]) && J(Y.checkRecords(good.filter((r) => r.kind !== "floors"), F)) === J(["the floors are not there once"]) &&
        J(Y.checkRecords(good, F, "0".repeat(64))[0]) === J("the vendored projection-neuron wiring is not the file committed (sha256 b885db58c7284b20...)") && J(Y.checkRecords(good, { ...F, mushroom: { ...F.mushroom, sha256: "1".repeat(64) } })[0]) === J("the mushroom round's file is not the one committed (sha256 b4d8db8d81395987...)") &&
        J(Y.checkRecords(good, { ...F, odours: { ...F.odours, sha256: "2".repeat(64) } })) === J(["the odour round's file is not the one committed (sha256 d45d35df2f7ccbbf...)"]) &&
        J(Y.checkRecords(good, { ...F, odours: { ...F.odours, lines: F.odours.lines.filter((r) => !(r.arm === "SHUFPN" && r.s === 2 && r.kind === "draw")) } })) === J(["the odour round's file fails its own checks: SHUFPN draw 2 is there 0 times (once is registered)"]) &&
        J(Y.checkRecords(good, { ...F, mushroom: { ...F.mushroom, lines: F.mushroom.lines.filter((r) => !(r.arm === "PSHUF" && r.task === "REV" && r.s === 2)) } })[0]).startsWith("\"the mushroom round's file fails its own checks:"));
    ok("!! T2 IS PLASTIC AGAINST PFAM (an exact rank sum), H PLASTIC AGAINST THE FLOORS' HAND RULE (a sign test): PLASTIC above every PFAM fly is T2 BETTER (ranks 222), above 0.64 is H BETTER (12 above); USES 12 of 12 in PLASTIC and 8 of 12 in PFAM",
        R.T2.word === Y.WORDS.T2[0] && R.T2.sumA === 222 && R.T2.b === "PFAM" && R.H.word === Y.WORDS.H[0] && R.H.above === 12 && R.H.ref === 0.64 && R.arms.PLASTIC.uses === 12 && R.arms.PFAM.uses === 8 &&
        /T2 \(PLASTIC against PFAM\): PLASTIC's ranks sum to 222 \(the middle is 150\)/.test(lines) && /THE FLY TAUGHT BY ITS REAL TEACHERS LEARNS EIGHT ODOURS BETTER THAN ONE WHOSE TEACHERS ARE PERMUTED/.test(lines) && /USES 8 of 12/.test(lines));
    const worse = Y.reading(file((a, s) => (a === "PLASTIC" ? [0.5 + s / 1e4, 0.01] : sc(a, s))), F), noFl = Y.reading(good.filter((r) => r.kind !== "floors"), F);
    ok("PLASTIC under every PFAM fly and under the hand rule is T2 WORSE (78) and H WORSE (0 above); with a failed check no reading is weighed and the first line says so",
        worse.T2.word === Y.WORDS.T2[1] && worse.T2.sumA === 78 && worse.H.word === Y.WORDS.H[1] && worse.H.above === 0 && noFl.T2 === null && noFl.H === null && /^A CHECK FAILED/.test(Y.readingLines(noFl)[0]));
    const tied2 = Y.reading(file((a, s) => [0.88 + s / 1e4, 0.01]), F);
    ok("ties count against the claim: PLASTIC and PFAM equal fly for fly is CANNOT with p 1", tied2.T2.word === Y.WORDS.T2[2] && tied2.T2.p === 1 && tied2.T2.ties > 0);
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, Y.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "PSHUF", "1"], ["job", "PLASTIC", "x"], ["job", "PLASTIC", "0"], ["job", "PFAM", "13"], ["job", "ONE", "PLASTIC", "1"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for PLASTIC or PFAM and draws 1 to 12 -- and nothing else", J(Y.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(Y.parseArgs(["read"])) === J({ cmd: "read" }) && J(Y.parseArgs(["job", "PFAM", "12"])) === J({ cmd: "job", arm: "PFAM", s: 12 }) && no.every((a) => Y.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyMushroomMany.mjs");
    ok("!! the command is this round's -- its library and results file, the committed files read through fileOf -- reads its words through parseArgs alone, refuses a run of no processes itself, trains with the registered defaults, trains only what the file does not hold, and trains PLASTIC draw 1 a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyMushroomMany\.mjs"/.test(csrc) && /JSON\.stringify\(PF\.trainOne\(args\.arm, args\.s\)\)/.test(csrc) &&
        /Object\.entries\(PF\.FILES\)\.map\(\(\[k, f\]\) => \[k, PF\.fileOf\(fs\.readFileSync\(path\.join\(ENG, f\)\)\)\]\)/.test(csrc) && /PF\.reading\(linesOf\(\), committedFiles\(\)\)/.test(csrc) && /done = new Set\(have\.filter\(\(r\) => r\.kind === "draw"\)\.map\(\(r\) => r\.arm \+ "\/" \+ r\.s\)\)/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\], weightsHash: r\.weightsHash/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyMushroomMany\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyMushroomMany-selfcheck.mjs"), calls = [...me.matchAll(/Y\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one training through the round's code is of 2 iterations on draw 901 (and one refused); its audits are of 2 lives not the round's; it starts no process; the file's size and time are what they were",
        J(calls) === J(['"PLASTIC", 0', '"PFAM", 901, TINY, TWO']) && !Y.SEEDS.includes(901) && !TWO.some((x) => Y.AUDIT.includes(x)) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && !/import[^;]*child_process/.test(me) && stateOf() === before,
        `the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (the whole results file was committed at b5aaccb2 before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, Y.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = Y.reading(lines, F), Fl = R.floors, A = R.arms;
    const of = (a) => lines.filter((r) => r.kind === "draw" && r.arm === a).sort((x, y) => x.s - y.s), P = of("PLASTIC"), Q = of("PFAM"), all = [...P, ...Q];
    ok("!! the results file is the one the run wrote: 26 records, sha256 c4b98dd773e749ef... (one start, 73.5 minutes on four processes)", lines.length === 26 && createHash("sha256").update(bytes).digest("hex") === "c4b98dd773e749ef81adea78073640d672d6d63d3fd11a19bf0a4c1e36e8dec8");
    ok("!! THE CHECKS HOLD: the wiring and both committed files as committed and passing their own checks, 24 draws each once with the mushroom round's teachers, PLASTIC draw 1 the same twice; the floors -- the start 0.0118, the hand rule 0.6566, the odours' Kenyon-cell overlap 0.1530",
        R.checks.length === 0 && near(Fl.start, 0.0118) && near(Fl.hand, 0.6566) && near(Fl.overlap, 0.1530) && lines.filter((r) => r.kind === "recheck").length === 1 && lines.find((r) => r.kind === "recheck").weightsHash === P[0].weightsHash);
    ok("!! *** T2 -- THE FLY TAUGHT BY ITS REAL TEACHERS CANNOT BE TOLD APART FROM ONE WHOSE TEACHERS ARE PERMUTED AT LEARNING EIGHT ODOURS (PLASTIC's ranks 135, the middle 150, no ties, p 0.41); H -- IT LEARNS THEM BETTER THAN THE RULE SET BY HAND (12 of 12 above 0.6566, p 2/4096) *** -- USES 12 of 12 in each arm",
        R.T2.word === Y.WORDS.T2[2] && R.T2.sumA === 135 && R.T2.ties === 0 && near(R.T2.p, 0.4095) && R.H.word === Y.WORDS.H[0] && R.H.above === 12 && R.H.below === 0 && R.H.p === 2 / 4096 && R.H.ref === Fl.hand && A.PLASTIC.uses === 12 && A.PFAM.uses === 12);
    ok("!! the arms (mean, sd, least, most; with p_a at 0; a): PLASTIC 0.8908 0.0084 0.8750 0.9055, 0.0122, 1.0878 | PFAM 0.8923 0.0185 0.84275 0.9181, 0.0122, 1.0111; the trainer's battery at iteration 59 0.8445 and 0.8415",
        near(A.PLASTIC.mean, 0.8908) && near(A.PLASTIC.sd, 0.0084) && near(A.PLASTIC.min, 0.8750) && near(A.PLASTIC.max, 0.9055) && near(A.PLASTIC.ratesOff, 0.0122) && near(A.PLASTIC.rate, 1.0878) &&
        near(A.PFAM.mean, 0.8923) && near(A.PFAM.sd, 0.0185) && near(A.PFAM.min, 0.84275) && near(A.PFAM.max, 0.9181) && near(A.PFAM.ratesOff, 0.0122) && near(A.PFAM.rate, 1.0111) && near(A.PLASTIC.history[6].ret, 0.8445) && near(A.PFAM.history[6].ret, 0.8415));
    const st = signTest(P.map((r, i) => r.score - Q[i].score), 0), offs = all.map((r) => r.ratesOff), rates = (v) => v.map((r) => r.rate);
    ok("!! DESCRIBED AFTER THE READING, NOT REGISTERED: draw for draw PLASTIC above PFAM on 3 of 12 (draws 4, 10 and 11) and below on 9 -- as a sign test, not registered, p 598/4096; PFAM holds the round's best fly (draw 3) and its worst (draw 10); with the rate at 0 every fly scores 0.0098 to 0.0148; a from 0.8514 to 1.4883 in PLASTIC, 0.7904 to 1.2118 in PFAM",
        P.every((r, i) => r.s === Q[i].s) && st.above === 3 && st.below === 9 && st.p === 598 / 4096 && J(P.filter((r, i) => r.score > Q[i].score).map((r) => r.s)) === J([4, 10, 11]) &&
        Q.find((r) => r.score === Math.max(...all.map((x) => x.score))).s === 3 && Q.find((r) => r.score === Math.min(...all.map((x) => x.score))).s === 10 && near(Math.min(...offs), 0.0098) && near(Math.max(...offs), 0.0148) &&
        near(Math.min(...rates(P)), 0.8514) && near(Math.max(...rates(P)), 1.4883) && near(Math.min(...rates(Q)), 0.7904) && near(Math.max(...rates(Q)), 1.2118));
    // the hand rule written for a fly's own teachers: M.HAND's formula (v +1/88 for each neuron its teachers make PPL1-taught, -1/88 for each PAM-taught one, bias 0.1, p_a 2)
    const handFor = (T) => { const sg = T.map(([p, f]) => (p > f ? 1 : f > p ? -1 : 0)), n = sg.filter((x) => x !== 0).length, w = new Float32Array(M.CIRCUIT.nm + 2); sg.forEach((x, m) => (w[m] = x / n)); w[M.CIRCUIT.nm] = 0.1; w[M.CIRCUIT.nm + 1] = 2; return Array.from(w); };
    const real2 = Y.auditScore(M.policyOf("PFAM", 2).setParams(M.HAND)), own5 = Y.auditScore(M.policyOf("PFAM", 5).setParams(handFor(M.teachFor("PFAM", 5))));
    ok("!! MEASURED AFTER THE READING, NOT REGISTERED (two of the 24 audits recomputed here): the hand rule written for the real teachers, flown on PFAM draw 2's fly, scores -0.3119; written for PFAM draw 5's own teachers, 0.8185, above the real pairing's 0.6566; written for the real teachers it is M.HAND itself",
        near(real2, -0.3119) && near(own5, 0.8185) && own5 > Fl.hand && J(handFor(M.teachFor("PLASTIC", 1))) === J(Array.from(M.HAND)), `${real2.toFixed(4)}, ${own5.toFixed(4)}`);
    const d10 = Q.find((r) => r.s === 10);
    ok("!! RE-AUDITED AFTER THE READING: PFAM's draw 10 (the round's least) gives its score again to the bit", d10.score === A.PFAM.min && Y.auditScore(M.policyOf("PFAM", 10).setParams(PF.unpackWeights(d10.weights))) === d10.score);
    const note = src("brain/FLY_MUSHROOM_MANY_WIP.md"), flat = note.replace(/\s+/g, " "), res = flat.slice(flat.indexOf("## 10. The result"));
    ok("the expectations, written before the code, against what came -- every one: T2 CANNOT (55), H BETTER (97), USES 12 of 12 in each arm (90)",
        /T2: CANNOT about 55, WORSE 35, BETTER 10\. H: \*\*BETTER about 97 percent\*\*\. USES 12 of 12 in each arm, about 90\./.test(flat) && R.T2.word === Y.WORDS.T2[2] && R.H.word === Y.WORDS.H[0] && A.PLASTIC.uses === 12 && A.PFAM.uses === 12);
    ok("the registration's RESULT SECTION (section 10) carries both readings' words, USES, the commit the file was read at, that every expectation came, what section 5 said such a reading would say, the description and the measurement after the reading said as such with the gate's numbers, and what it does not mean",
        /## 10\. The result/.test(note) && res.includes(`**T2: ${R.T2.word}**`) && res.includes(`**H: ${R.H.word}**`) && /\*\*USES: 12 of 12 in each arm\.\*\*/.test(res) && /b5aaccb2/.test(res) && /\*\*Every expectation came\*\*/.test(res) &&
        /\*\*with eight meanings to keep apart, the real pairing still does no better than a permuted one\*\*/.test(res) && /\| PLASTIC \| 0\.8908 \(0\.8750, 0\.9055\) \| 0\.0084 \| 0\.0122 \| 1\.0878 \|/.test(res) && /\| PFAM \| 0\.8923 \(0\.8428, 0\.9181\) \| 0\.0185 \| 0\.0122 \| 1\.0111 \|/.test(res) &&
        /\*\*Described after the reading, not registered \(the gate recomputes it from the records\):\*\*/.test(res) && /3 of 12 \(draws 4, 10 and 11\)/.test(res) && /p 0\.15/.test(res) &&
        /\*\*Measured after the reading, not registered \(the gate recomputes two of the 24 audits\):\*\*/.test(res) && /\*\*Written for the real teachers and flown on each PFAM draw's fly, it scores 0\.1090\*\*/.test(res) && /\*\*Written again for each draw's own permuted teachers, it scores 0\.6474\*\*/.test(res) &&
        /\*\*8 of the 12 permutations score above the real pairing's 0\.6566\.\*\*/.test(res) &&
        /-0\.3119/.test(res) && /0\.8185/.test(res) && /Spearman -0\.03/.test(res) && /\*\*What it does not mean\.\*\*/.test(res));
});

console.log(`\nflyMushroomMany-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
