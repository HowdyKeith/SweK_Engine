// WebGLEngine/tools/ship/paintingFly-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/paintingFly-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are at a recipe of its own, on seeds the round does not use)
//
// THE GATE OF THE PAINTING FLY (backlog `painting-fly`, brain/BACKLOG_2026-11-12_BRAIN_PROJECTS.md; round 1 registered in brain/PAINTING_FLY_WIP.md before any of this existed):
//   1  THE PAINTER          brain/rl/paintCircuitPolicy.mjs: the arms' weight counts; the network is the form the tree flies (the same numbers through render/brainTsl.mjs's layers); a painter starts
//                           as a plain net (the three steps are the identity at the start); a synapse's weight reaches the outputs and nothing else is a recurrent weight; the shuffle
//   2  THE TRAINER'S HOOK   brain/rl/dockPolicy.js's policyFactory: without it the trainer answers what it did before the hook (pinned from the commit before), with the tree's own MLP handed in
//                           through it the same again, and with a circuit it trains that circuit
//   3  THE ROUND'S NUMBERS  tools/ship/paintingFly.mjs holds what the registration says, and the exact rank-sum test is exact
//   4  THE RECORDS          the registration's checks, each failing by name on a results file that breaks it; the reading's words
//   5  THE COMMAND          tools/ship/takePaintingFly.mjs refuses what it does not know, and this gate starts no training of the round's
//   6  THE VERDICT          round 1, run 2026-11-13 and committed unread at 0abaffea: the file's bytes, the checks, the two readings, the arms beside the floors, the expectations against what came
// SABOTAGE LOG (2026-11-13) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), the gate run whole; every one red by name (the number is the rows that went red):
//   brain/rl/paintCircuitPolicy.mjs: A1 two steps where the tree takes three 1 | A2 no relu in the step 1 | A3 the synapses start at 0.01 1 | A4 a synapse runs backwards 1 | A5 PLAIN has 47 units 6 | A6 a unit onto itself is let in 1
//     A7 the shuffle ignores its seed 2 | A8 SHUF is the fly's own wiring 6 | A9 no tanh on the outputs 1 | A10 a step reads what it has just written 1 | A11 the start ignores its seed 1 | A12 an edge twice is let in 1
//     A13 the decoder starts as wide as the encoder 1 | A14 the shuffle may put a unit onto itself 3
//   brain/rl/dockPolicy.js: B1 the factory is not handed on to the evaluations 2 | B2 evaluate() ignores the factory 2 | B3 the trainer's start ignores the factory 3 | B4 the factory is not told the seed 1 | B5 the trainer's default sigma moved 1
//   tools/ship/paintingFly.mjs: C1 151 iterations 2 | C2 the audit's pictures start elsewhere 1 | C3 alpha 0.05 2 | C4 a tie counts FOR the claim 2 | C5 the one-sided p given as the two-sided 3 | C6 BETTER and WORSE swapped 3
//     C7 T2 reads the FISH 1 | C8 the reading is weighed with a check failed 1 | C9 a training ignores the recipe's iterations 1 | C10 a record's score is the fraction 1 | C11 the recipe check gone 1 | C12 the weights' hash check gone 1
//     C13 the MLP arm has one layer 6 | C14 a draw's painter is given draw 1's wiring 1 | C15 a training's wiring is draw 1's 1 | C16 the rank sum counts 15 of 32 2 | C17 T1 reads the fly against itself 2 | C18 the recheck check gone 1
//     C19 a duplicate draw passes 1 | C21 the SHUF wiring check gone 1 | C20' the audit plays one step fewer 1
//   the command (tools/ship/takePaintingFly.mjs and paintingFly.mjs's parseArgs): D1' the usage exits 0 1 | D2' job takes any arm 3 | D3' run takes 0 jobs (the parser) 1 | D4' the command's own guard on a run of no processes gone 1
//     D5' job takes a draw the round does not have 1 | D6' read takes a word too many 3 | D7' the command reads its words itself 2 | C22 the reading's lines drop the tests' words 1
//     A15 PLAIN's 46 written as a number where the constant was: 0 RED, AND EQUIVALENT (the same number twice; no row can tell them apart, and none should)
//   *** A SABOTAGE THAT RAN PART OF THE ROUND, AND WHAT CHANGED. *** The first D3 let `run --jobs 0` through, and this gate then gave the command exactly those words: it went red by name (1), and
//   THE COMMAND, WITH NO TRAINING TO DO, WENT ON TO ITS LAST TWO STEPS -- FLY draw 1 trained a second time, the floors computed -- and wrote both to brain/paintingFlyRound.jsonl. The file was deleted
//   unread (two records: a weights hash and the floors; no arm's score). The gate gave the command a word that only its parsing stood behind. Now the words are arithmetic (parseArgs, gated without a
//   process), the command refuses a run of no processes itself, the gate never gives it the word `run` or a job it could do, and a row holds the results file to what it was. D1 to D3 are D1' to D7'.
//   THREE FINDINGS ON THE WAY, each a row now. C20 (the audit plays one step fewer) went 0 RED: nothing counted the audit's steps; the row that asks the painter 15 times and plays the score by hand is the fix, and
//   C20' is C20 again. Before the first run two more were seen by reading: a training that ignored its recipe would have carried the recipe in its record all the same (the row that calls the trainer itself with
//   the record's recipe), and a record's score was checked through the library's own painter, which would have hidden a wrong wiring (the row builds the painter from the wiring's own factory).
//   THE VERDICT'S (section 6, 2026-11-13), the same runner, each red by name: V1 a FLY score in the file made 0.0760 7 | V2 alpha one in ten thousand 4 | V3 T1 reads the PLAIN 3 | V4 the audit scores one picture fewer 2
//     V5 the note's T2 word is CANNOT BE TOLD APART 1 | V6 the verdict's T2 pin reads BETTER 1 | V7 a tie counts for the claim 2 | V8 BETTER and WORSE swapped 5
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mlpLayerCpu } from "../../render/brainTsl.mjs";
import * as GFC from "../../brain/gfcTopology.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import { trainDockES, evaluate, FlightPolicy } from "../../brain/rl/dockPolicy.js";
import { PaintEnv, OBS_DIM, ACT_DIM } from "../../brain/rl/paintEnv.js";
import * as PF from "./paintingFly.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const TINY = Object.freeze({ maxSteps: 5, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2 }), TINY_AUDIT = [880001, 880002, 880003];
const rnd = P.mulberry32(77), randomWeights = (n, scale = 0.4) => Float32Array.from({ length: n }, () => (rnd() * 2 - 1) * scale);
const obsOf = (k) => Float32Array.from({ length: OBS_DIM }, (_, i) => Math.sin(k * 1.7 + i * 0.9));
const mk = (o = {}) => new PaintEnv({ maxSteps: 6, ...o });

console.log("paintingFly-selfcheck -- the fly-wired painter, the trainer's hook, and round 1's arithmetic (the round itself is never run here)\n");

console.log("1. THE PAINTER");
section(() => {
    const make = (arm, s = 1) => P.painterFactory(arm, s)({ obsDim: OBS_DIM, actDim: ACT_DIM, seed: s });
    ok("!! the arms' weight counts: FLY 20 x 34 + 34 + 313 + 34 x 5 + 5 = 1,202, SHUF 1,202, PLAIN (46 units, no edge) 1,201, FISH (153 edges) 1,042 -- one weight a synapse and none elsewhere",
        J(["FLY", "SHUF", "PLAIN", "FISH"].map((a) => make(a).paramCount())) === J([1202, 1202, 1201, 1042]) && P.ARMS.FLY().edges.length === GFC.EDGES.length && J(P.ARMS.FLY().edges) === J(GFC.EDGES.map((e) => [e[0], e[1]])) && P.weightCountOf(20, 5, 34, 313) === 1202);
    // the form the tree flies: an encoder (relu), three steps of relu((I + W) h), a linear decoder, tanh -- through render/brainTsl.mjs's layers
    const p = make("FLY"), w = randomWeights(1202); p.setParams(w);
    const H = 34; let o = 0; const W1 = w.subarray(o, o += OBS_DIM * H), b1 = w.subarray(o, o += H), Wrec = w.subarray(o, o += 313), W2 = w.subarray(o, o += H * ACT_DIM), b2 = w.subarray(o, o += ACT_DIM);
    const Wm = new Float32Array(H * H); for (let i = 0; i < H; i++) Wm[i * H + i] = 1; GFC.EDGES.forEach(([to, from], k) => { Wm[to * H + from] += Wrec[k]; });
    const rec = { nIn: H, nOut: H, W: Wm, b: new Float32Array(H), act: "relu" }, layers = [{ nIn: OBS_DIM, nOut: H, W: W1, b: b1, act: "relu" }, ...Array(P.REC_STEPS).fill(rec), { nIn: H, nOut: ACT_DIM, W: W2, b: b2, act: "none" }];
    let worst = 0, moved = 0;
    for (let k = 0; k < 40; k++) { let h = obsOf(k); for (const L of layers) h = mlpLayerCpu(L, h, 1); const a = p.act(obsOf(k)); for (let i = 0; i < ACT_DIM; i++) { worst = Math.max(worst, Math.abs(a[i] - Math.tanh(h[i]))); moved += Math.abs(a[i]); } }
    ok("!! THE NETWORK IS THE FORM THE TREE FLIES: on 40 observations and random weights (the synapses' too) its five outputs are those of the same weights through render/brainTsl.mjs's layers -- encoder, three steps of relu((I + W) h), decoder, tanh -- to 1e-5", worst < 1e-5 && moved > 1 && P.REC_STEPS === 3 && layers.length === 5, `worst ${worst.toExponential(2)}`);
    // the start
    const fresh = make("FLY", 5), fw = fresh.getParams(), recAt = OBS_DIM * H + H;
    const enc = (q, x) => Array.from({ length: q.units }, (_, u) => { let acc = q.b1[u]; for (let i = 0; i < OBS_DIM; i++) acc += q.W1[u * OBS_DIM + i] * x[i]; return Math.fround(Math.max(acc, 0)); });
    ok("!! A PAINTER STARTS AS A PLAIN NET: every recurrent weight and every bias 0, the encoder within +-sqrt(1/20) and the decoder within +-sqrt(1/34), and with the synapses at 0 the three steps change nothing (the activity is the encoder's)",
        fw.subarray(recAt, recAt + 313).every((v) => v === 0) && fresh.b1.every((v) => v === 0) && fresh.b2.every((v) => v === 0) && fresh.W1.every((v) => Math.abs(v) <= Math.sqrt(1 / 20)) && fresh.W2.every((v) => Math.abs(v) <= Math.sqrt(1 / 34)) && fresh.W1.some((v) => v !== 0) &&
        J(Array.from(fresh.activity(obsOf(3)))) === J(enc(fresh, obsOf(3))));
    const again = make("FLY", 5), other = make("FLY", 6);
    ok("the start is the seed's: the same seed the same weights, another seed others", J(Array.from(again.getParams())) === J(Array.from(fw)) && J(Array.from(other.getParams())) !== J(Array.from(fw)));
    // a synapse's weight reaches the outputs
    const base = p.act(obsOf(2)).slice(), w2 = w.slice(); w2[recAt + 100] += 0.5; p.setParams(w2); const after = p.act(obsOf(2)).slice(); p.setParams(w);
    ok("!! a synapse's weight reaches the outputs (one changed, the five outputs move), and the weights go in and come out as they were", base.some((v, i) => v !== after[i]) && J(Array.from(p.getParams())) === J(Array.from(w)) && J(Array.from(p.act(obsOf(2)))) === J(Array.from(base)));
    const plain = make("PLAIN"); plain.setParams(randomWeights(1201));
    ok("PLAIN has no step to take: 46 units whose activity is the encoder's", plain.units === 46 && P.PLAIN_UNITS === 46 && plain.Wrec.length === 0 && J(Array.from(plain.activity(obsOf(4)))) === J(enc(plain, obsOf(4))));
    ok("a wrong wiring is refused by name: a unit onto itself, an edge twice, a unit that is not there, and weights of the wrong count",
        throws(() => new P.CircuitPolicy({ obsDim: 20, actDim: 5, units: 4, edges: [[1, 1]] }), /to itself/) && throws(() => new P.CircuitPolicy({ obsDim: 20, actDim: 5, units: 4, edges: [[1, 2], [1, 2]] }), /twice/) &&
        throws(() => new P.CircuitPolicy({ obsDim: 20, actDim: 5, units: 4, edges: [[1, 4]] }), /each a unit 0\.\.3/) && throws(() => make("FLY").setParams(new Float32Array(1201)), /1202 weights/) && throws(() => P.painterFactory("WORM", 1), /no arm WORM/));
    // the shuffle
    const s1 = P.shuffledEdges(34, 313, 7001), s1b = P.shuffledEdges(34, 313, 7001), s2 = P.shuffledEdges(34, 313, 7002), key = (e) => e[0] * 34 + e[1], gfc = new Set(GFC.EDGES.map(key));
    const shared = s1.filter((e) => gfc.has(key(e))).length;
    ok("!! THE SHUFFLE: 313 distinct pairs, none a unit onto itself, the seed's (the same twice, another seed another), and not the fly's wiring -- it shares about 313 x 313 / 1,122 = 87 synapses with it by chance",
        s1.length === 313 && new Set(s1.map(key)).size === 313 && s1.every((e) => e[0] !== e[1]) && J(s1) === J(s1b) && J(s1) !== J(s2) && shared > 50 && shared < 130 && J(P.ARMS.SHUF(1).edges) === J(s1), `${shared} shared`);
    ok("a shuffle that does not fit is refused", throws(() => P.shuffledEdges(4, 13, 1), /do not fit/));
});

console.log("\n2. THE TRAINER'S HOOK");
section(() => {
    const paintOpts = { envFactory: mk, obsDim: OBS_DIM, actDim: ACT_DIM, hidden: [16, 16], maxSteps: 6, iters: 3, pop: 8, sigma: 0.14, lr: 0.05, seed: 3, trainEps: 4 };
    const a = trainDockES({ iters: 3, pop: 8, seed: 5 }), b = trainDockES(paintOpts);
    const ev = evaluate(new FlightPolicy({ hidden: [8], obsDim: OBS_DIM, actDim: ACT_DIM, seed: 9 }).getParams(), { envFactory: mk, hidden: [8], maxSteps: 6, episodes: 5 });
    ok("!! WITHOUT A FACTORY THE TRAINER ANSWERS WHAT IT DID BEFORE THE HOOK (pinned at 2908a3f, the commit before): the dock training's weights 0c1f011b82c73f14, the painter's 0cb7778f99255dce, and evaluate()'s numbers",
        PF.hashWeights(a.params) === "0c1f011b82c73f14" && PF.hashWeights(b.params) === "0cb7778f99255dce" && ev.avgReturn === 0.5052188283933667 && ev.avgDist === 0.1783523603652102 && b.best.avgDist === 0.15311290555841625,
        `${PF.hashWeights(a.params)} ${PF.hashWeights(b.params)} ${ev.avgReturn}`);
    let calls = 0; const c = trainDockES({ ...paintOpts, policyFactory: ({ obsDim, actDim, seed }) => { calls++; return new FlightPolicy({ hidden: [16, 16], obsDim, actDim, ...(seed === undefined ? {} : { seed }) }); } });
    ok("!! the tree's own MLP handed in THROUGH the factory trains to the same weights, so the factory is the only thing the hook changes (and the trainer did ask it: once for the start, once an evaluation)", PF.hashWeights(c.params) === "0cb7778f99255dce" && calls === 1 + 3 * (8 + 1), `${calls} calls`);
    const fo = { ...paintOpts, policyFactory: P.painterFactory("FLY", 3) }; delete fo.hidden;
    const d = trainDockES(fo), d2 = trainDockES(fo), start = P.painterFactory("FLY", 3)({ obsDim: OBS_DIM, actDim: ACT_DIM, seed: 3 }).getParams(), recAt = OBS_DIM * 34 + 34;
    ok("!! WITH A CIRCUIT IT TRAINS THAT CIRCUIT: 1,202 weights that are not the start's, the synapses' moved off 0, the same twice", d.params.length === 1202 && PF.hashWeights(d.params) === PF.hashWeights(d2.params) && PF.hashWeights(d.params) !== PF.hashWeights(start) && d.params.subarray(recAt, recAt + 313).some((v) => v !== 0));
    const src2 = src("brain/rl/dockPolicy.js");
    ok("the factory is asked in evaluate() and in trainDockES(), and handed on to every evaluation", (src2.match(/opts\.policyFactory \? opts\.policyFactory\(/g) || []).length === 2 && /policyFactory: opts\.policyFactory \};/.test(src2));
});

console.log("\n3. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/PAINTING_FLY_WIP.md");
    ok("!! tools/ship/paintingFly.mjs holds what the registration says: the recipe, draws 1 to 16, the five arms and their weight counts, the 200 audit pictures 700001 + 7919 k, alpha 0.01",
        J(PF.RECIPE) === J({ maxSteps: 20, iters: 150, pop: 24, sigma: 0.14, lr: 0.05, trainEps: 8 }) && /`iters 150, pop 24, sigma 0\.14, lr 0\.05, trainEps 8, seed s`/.test(note) && /maxSteps: 20/.test(note) &&
        J(PF.SEEDS) === J(Array.from({ length: 16 }, (_, k) => k + 1)) && /s = 1 to 16/.test(note) && J(PF.ARMS) === J(["FLY", "SHUF", "PLAIN", "FISH", "MLP"]) && J(PF.WEIGHTS) === J({ FLY: 1202, SHUF: 1202, PLAIN: 1201, FISH: 1042, MLP: 693 }) &&
        PF.AUDIT.length === 200 && PF.AUDIT[0] === 700001 && PF.AUDIT[199] === 700001 + 7919 * 199 && /700001 \+ 7919 k/.test(note) && PF.ALPHA === 0.01 && /p <= 0\.01/.test(note) && P.SHUFFLE_SEED === 7000 && /mulberry32\(7000 \+ s\)/.test(note));
    ok("an arm's untrained painter has its registered weight count, the MLP's the tree's 20-16-16-5", PF.ARMS.every((arm) => PF.policyOf(arm, 1).paramCount() === PF.WEIGHTS[arm]) && J(PF.MLP_HIDDEN) === J([16, 16]) && PF.RESULTS === "brain/paintingFlyRound.jsonl" && note.includes("`" + PF.RESULTS + "`"));
    ok("the audit's pictures are none of the trainer's (5000 + 17 k) and none of primitiveFit-selfcheck's (900000 + 2237 k)", PF.AUDIT.every((s) => !(s >= 5000 && s <= 5000 + 17 * 23) && !((s - 900000) % 2237 === 0 && s >= 900000 && s <= 900000 + 2237 * 23)));
    // the exact rank-sum test
    const counts = PF.rankSumCounts(16, 32), total = counts.reduce((x, y) => x + y, 0n), tail = (v) => { let c = 0n; for (let i = 0; i <= v; i++) c += counts[i]; return 2 * Number(c) / Number(total); };
    ok("!! THE TEST IS EXACT: the 16-of-32 rank sums number C(32, 16) = 601,080,390, symmetric about 264, and the two-sided p is 0.00955 at a sum of 196 and above 0.01 at 197 -- the registration's 196", total === 601080390n && counts[136] === 1n && counts[135] === 0n && counts.every((c, v) => c === (counts[528 - v] ?? 0n)) && Math.abs(tail(196) - 0.00955053) < 1e-7 && tail(197) > 0.01, `p(196) ${tail(196).toFixed(6)}, p(197) ${tail(197).toFixed(6)}`);
    // a list of 16 values whose ranks among 32 sum to a wanted number: the 16 lowest, then the top ones raised
    const withSum = (want) => { const r = Array.from({ length: 16 }, (_, i) => i + 1); let need = want - 136; for (let i = 15; i >= 0 && need > 0; i--) { const up = Math.min(16, need); r[i] += up; need -= up; } const set = new Set(r); return { A: r, B: Array.from({ length: 32 }, (_, i) => i + 1).filter((v) => !set.has(v)) }; };
    const at = (want) => { const { A, B } = withSum(want); return PF.rankSum(A, B); }, t196 = at(196), t197 = at(197), hi = (() => { const { A, B } = withSum(196); return PF.rankSum(B, A); })();
    ok("!! ...and rankSum() says so on lists: ranks summing to 196 give p 0.00955 and the word WORSE, to 197 a p above 0.01 and CANNOT BE TOLD APART, and the mirror (the other arm's 196) the word BETTER",
        t196.sumA === 196 && Math.abs(t196.p - 0.00955053) < 1e-7 && PF.wordOf(t196, "A SHUFFLE OF IT") === "THE FLY'S WIRING PAINTS WORSE THAN A SHUFFLE OF IT" && t197.sumA === 197 && t197.p > 0.01 && PF.wordOf(t197, "A SHUFFLE OF IT") === "THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT" &&
        hi.sumA === 528 - 196 && Math.abs(hi.p - t196.p) < 1e-12 && PF.wordOf(hi, "A PLAIN NET OF ITS SIZE") === "THE FLY'S WIRING PAINTS BETTER THAN A PLAIN NET OF ITS SIZE");
    const small = PF.rankSum([1, 2, 3], [4, 5, 6]), tied = PF.rankSum([1, 2, 3], [1, 2, 3]);
    ok("three against three, apart: p 2/20; and the same three numbers in both arms: three ties, each counted against both claims, p 1", small.p === 0.1 && small.pLower === 0.05 && tied.ties === 3 && tied.sumALow === 9 && tied.sumAHigh === 12 && tied.p === 1);
    // A TIE IS COUNTED AGAINST THE CLAIM: the 196 list with one of the fly's values set equal to one of the other arm's that it was below
    const { A, B } = withSum(196); const A2 = A.slice(); A2[0] = B[0]; const tt = PF.rankSum(A2, B);   // A's lowest (rank 1) made equal to B's lowest
    ok("!! A TIE BETWEEN THE ARMS IS COUNTED AGAINST THE CLAIM BEING TESTED: one of the lower arm's values made equal to one of the other's raises its sum for the WORSE claim (p above 0.01 where it was 0.00955)", tt.ties === 1 && tt.sumAHigh > 196 && tt.sumALow <= 196 && tt.p > 0.01, `sum ${tt.sumALow} to ${tt.sumAHigh}, p ${tt.p.toFixed(5)}`);
    ok("the test refuses an empty arm and a number that is not finite", throws(() => PF.rankSum([], [1]), /non-empty/) && throws(() => PF.rankSum([1, NaN], [1]), /finite/));
    // the audit and one training, at this gate's own recipe
    const pol = PF.policyOf("FLY", 901), s1 = PF.auditScore(pol, TINY_AUDIT, 5), s2 = PF.auditScore(pol, TINY_AUDIT, 5), still = PF.auditScore({ act: () => [0, 0, -1, -1, 0] }, TINY_AUDIT, 5);
    ok("the audit is the pictures': the same painter the same score twice, a score that is the distance closed (never negative: a shape that worsens the picture is not drawn)", s1.score === s2.score && s1.score >= 0 && still.score >= 0 && s1.frac >= 0 && s1.frac <= 1);
    let asked = 0; const counted = { act: (o) => { asked++; return pol.act(o); } }, sc = PF.auditScore(counted, TINY_AUDIT, 5);
    let byHand = 0; for (const seed of TINY_AUDIT) { const e = new PaintEnv({ maxSteps: 5 }); let o = e.reset(seed); for (let t = 0; t < 5; t++) o = e.step(pol.act(o)).obs; byHand += e.startDistance - e.distance(); }
    ok("!! THE AUDIT PLAYS EVERY STEP OF EVERY PICTURE: the painter is asked 3 pictures x 5 steps = 15 times, and the score is the mean distance closed, played here by hand", asked === 15 && sc.score === byHand / 3 && sc.score === s1.score, `${asked} asked`);
    const r = PF.trainOne("SHUF", 901, TINY, TINY_AUDIT), r2 = PF.trainOne("SHUF", 901, TINY, TINY_AUDIT), r3 = PF.trainOne("SHUF", 902, TINY, TINY_AUDIT), w = PF.unpackWeights(r.weights), q = P.painterFactory("SHUF", 901)({ obsDim: OBS_DIM, actDim: ACT_DIM }); q.setParams(w);
    const direct = trainDockES({ envFactory: (o = {}) => new PaintEnv({ maxSteps: 5, ...o }), obsDim: OBS_DIM, actDim: ACT_DIM, maxSteps: 5, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901, policyFactory: P.painterFactory("SHUF", 901) });
    ok("!! ONE TRAINING IS ITS ARM'S AND ITS DRAW'S: the same record twice, the weights those of the trainer called with the recipe the record carries, the wiring the draw's own shuffle, another draw another wiring and other weights, and the weights in the record are its hash's and give its score again through that wiring",
        J(r) === J(r2) && PF.hashWeights(direct.params) === r.weightsHash && r.edgesHash === PF.hashEdges(P.shuffledEdges(34, 313, 7901)) && r.edgesHash !== r3.edgesHash && r.weightsHash !== r3.weightsHash && r.kind === "draw" && r.weightCount === 1202 && w.length === 1202 && PF.hashWeights(w) === r.weightsHash && PF.auditScore(q, TINY_AUDIT, 5).score === r.score && J(r.recipe) === J(TINY));
    const m = PF.trainOne("MLP", 901, TINY, TINY_AUDIT);
    ok("the MLP arm is the tree's painter: 693 weights, no wiring in its record", m.weightCount === 693 && m.edges === null && m.edgesHash === null && throws(() => PF.trainOne("FLY", 0, TINY, TINY_AUDIT), /whole number from 1/) && throws(() => PF.policyOf("WORM", 1), /no arm WORM/));
});

console.log("\n4. THE RECORDS");
section(() => {
    // 80 records with each arm's untrained weights and scores made up here: what the checks read is the record, not a training
    const rec = (arm, s, score) => { const p = PF.policyOf(arm, s), w = p.getParams(), c = arm === "MLP" ? null : P.ARMS[arm](s); return { kind: "draw", arm, s, recipe: { ...PF.RECIPE }, units: c ? c.units : null, edges: c ? c.edges.length : null, edgesHash: c ? PF.hashEdges(c.edges) : null, weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), trainerBest: null, score, scoreFrac: score }; };
    const file = (scoreOf) => { const out = []; for (const s of PF.SEEDS) for (const arm of PF.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, { kind: "floors", random: [0.01, 0.02, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02], search: 0.09, searchPictures: 24, untrained: { FLY: 0, SHUF: 0, PLAIN: 0, FISH: 0, MLP: 0 } }); return out; };
    const even = (arm, s) => 0.05 + ((s * 7 + PF.ARMS.indexOf(arm) * 3) % 16) / 1000, good = file(even), clone = () => JSON.parse(J(good)), idx = (L, arm, s) => L.findIndex((r) => r.arm === arm && r.s === s);
    ok("!! a file of 80 draws, each once, with the recheck and the floors passes every check", PF.checkRecords(good).length === 0, PF.checkRecords(good).slice(0, 2).join(" | "));
    const broken = [
        ["a draw missing", (L) => L.splice(idx(L, "FISH", 7), 1), /FISH draw 7 is there 0 times/],
        ["a draw twice", (L) => L.push(JSON.parse(J(L[idx(L, "PLAIN", 2)]))), /PLAIN draw 2 is there 2 times/],
        ["another recipe", (L) => { L[idx(L, "FLY", 4)].recipe.iters = 151; }, /FLY draw 4 was trained with another recipe/],
        ["an arm's weight count", (L) => { L[idx(L, "PLAIN", 3)].weightCount = 1202; }, /PLAIN draw 3 has 1202 weights \(its arm has 1201\)/],
        ["weights that are not the hash's", (L) => { const r = L[idx(L, "MLP", 5)], w = PF.unpackWeights(r.weights); w[10] += 1; r.weights = PF.packWeights(w); }, /MLP draw 5's weights are not 693 finite numbers with its hash/],
        ["a SHUF draw with the fly's wiring", (L) => { L[idx(L, "SHUF", 6)].edgesHash = PF.hashEdges(P.ARMS.FLY().edges); }, /SHUF draw 6's wiring is not its arm's/],
        ["a draw with no score", (L) => { L[idx(L, "FLY", 9)].score = null; }, /FLY draw 9 has no score/],
        ["the recheck with other weights", (L) => { L.find((r) => r.kind === "recheck").weightsHash = "0000000000000000"; }, /FLY draw 1 trained a second time/],
        ["the recheck missing", (L) => L.splice(L.findIndex((r) => r.kind === "recheck"), 1), /FLY draw 1 trained a second time/],
        ["the floors missing", (L) => L.splice(L.findIndex((r) => r.kind === "floors"), 1), /the floors are not there once/],
        ["a draw the round does not have", (L) => { L[idx(L, "FLY", 16)].s = 17; }, /FLY draw 17 is not a registered draw/],
    ];
    const res = broken.map(([name, f, re]) => { const L = clone(); f(L); const bad = PF.checkRecords(L); return [name, bad.some((b) => re.test(b)), bad[0]]; });
    ok(`!! EACH CHECK FAILS BY NAME on a file that breaks it (${broken.length}: ${broken.map((b) => b[0]).join("; ")})`, res.every((r) => r[1]), res.filter((r) => !r[1]).map((r) => `${r[0]}: ${r[2]}`).join(" | "));
    const R0 = PF.reading(good), Lbad = clone(); Lbad.splice(idx(Lbad, "FLY", 1), 1); const Rbad = PF.reading(Lbad);
    ok("!! WITH A FAILED CHECK THE READING IS NOT WEIGHED: no test is made, and the report's first line says so", Rbad.T1 === null && Rbad.T2 === null && Rbad.checks.length > 0 && /A CHECK FAILED, AND THE READING IS NOT WEIGHED/.test(PF.readingLines(Rbad)[0]) && R0.T1 !== null);
    const up = PF.reading(file((arm, s) => (arm === "FLY" ? 0.2 : 0.05) + s / 10000)), down = PF.reading(file((arm, s) => (arm === "FLY" ? 0.01 : 0.05) + s / 10000)), mixed = PF.reading(file((arm, s) => (arm === "SHUF" ? 0.01 : arm === "PLAIN" ? 0.3 : 0.05) + s / 10000));
    ok("!! THE WORDS: the fly above both -> BETTER twice; below both -> WORSE twice; above the shuffle and below the plain net -> one of each; arms drawn alike -> CANNOT BE TOLD APART twice",
        up.T1.word === "THE FLY'S WIRING PAINTS BETTER THAN A SHUFFLE OF IT" && up.T2.word === "THE FLY'S WIRING PAINTS BETTER THAN A PLAIN NET OF ITS SIZE" && down.T1.word === "THE FLY'S WIRING PAINTS WORSE THAN A SHUFFLE OF IT" && down.T2.word === "THE FLY'S WIRING PAINTS WORSE THAN A PLAIN NET OF ITS SIZE" &&
        mixed.T1.word === "THE FLY'S WIRING PAINTS BETTER THAN A SHUFFLE OF IT" && mixed.T2.word === "THE FLY'S WIRING PAINTS WORSE THAN A PLAIN NET OF ITS SIZE" && R0.T1.word === "THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT" && R0.T2.word === "THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE");
    ok("the reading describes every arm (16 draws, a mean between its least and most) and the tests read the FLY's scores against the SHUF's and the PLAIN's, not the FISH's or the MLP's", PF.ARMS.every((a) => R0.arms[a].n === 16 && R0.arms[a].min <= R0.arms[a].mean && R0.arms[a].mean <= R0.arms[a].max) &&
        PF.reading(file((arm, s) => (arm === "FISH" || arm === "MLP" ? 0.9 : 0.05) + ((s * 7) % 16) / 1000)).T1.p === PF.reading(file((arm, s) => 0.05 + ((s * 7) % 16) / 1000)).T1.p);
    const lines = PF.readingLines(up).join("\n");
    ok("the report says the checks, a row an arm, the floors and both tests with their words", /the checks hold/.test(lines) && PF.ARMS.every((a) => new RegExp(`^${a} `, "m").test(lines)) && /eight random painters/.test(lines) && /T1 \(FLY against SHUF\)/.test(lines) && /T2 \(FLY against PLAIN\)/.test(lines) && /PAINTS BETTER THAN A SHUFFLE OF IT/.test(lines));
    const fl = PF.floors(TINY_AUDIT, 5, 2);
    ok("the floors: eight random painters, the random search on the first pictures, an untrained draw an arm -- the same twice", fl.random.length === 8 && fl.searchPictures === 2 && Number.isFinite(fl.search) && J(Object.keys(fl.untrained)) === J(PF.ARMS) && J(fl) === J(PF.floors(TINY_AUDIT, 5, 2)));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, PF.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "WORM", "1"], ["job", "FLY", "x"], ["job", "FLY", "0"], ["job", "FLY", "17"], ["job", "FLY"], ["run", "--jobs", "0"], ["run", "--jobs"], ["run", "--jobs", "2", "x"], ["run", "4"], ["read", "extra"]];
    ok("!! THE COMMAND'S WORDS, AS ARITHMETIC (parseArgs, never the command): run is four processes or --jobs of at least 1, read takes nothing, job takes a registered arm and a draw 1 to 16 -- and twelve other shapes are not words (no processes at all among them)",
        J(PF.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(PF.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(PF.parseArgs(["read"])) === J({ cmd: "read" }) && J(PF.parseArgs(["job", "FISH", "16"])) === J({ cmd: "job", arm: "FISH", s: 16 }) &&
        no.every((a) => PF.parseArgs(a) === null) && PF.parseArgs("run") === null, no.filter((a) => PF.parseArgs(a) !== null).map((a) => a.join(" ")).join(" | "));
    // THE COMMAND ITSELF IS GIVEN ONLY WORDS THAT CAN TRAIN NOTHING HOWEVER IT READS THEM: no `run` at all (a sabotage that let `run --jobs 0` through once made this gate train FLY draw 1 and write the floors)
    const cmd = path.join(ENG, "tools", "ship", "takePaintingFly.mjs"), probe = (...a) => spawnSync(process.execPath, [cmd, ...a], { encoding: "utf8" });
    const bad = [probe(), probe("bogus"), probe("job", "WORM", "1"), probe("job", "FLY", "x"), probe("read", "extra")];
    ok("!! the command refuses what it does not know with its usage and exit 2: no word, another word, an arm that is not one, a draw that is not a number, a word too many", bad.every((r) => r.status === 2 && /^usage: /.test(r.stderr) && r.stdout === ""), bad.map((r) => r.status).join(" "));
    const csrc = src("tools/ship/takePaintingFly.mjs");
    ok("the command's words are parseArgs' and nothing else's: it reads process.argv once, into parseArgs, and a run of no processes is refused there too", (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc));
    const me = src("tools/ship/paintingFly-selfcheck.mjs"), calls = [...me.matchAll(/PF\.trainOne\(([^)]*)\)/g)].map((m) => m[1]), probes = [...me.matchAll(/probe\(("[^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: every training here is at its own recipe (5 steps, 2 iterations) on draws 901 and 902 or refused before it starts; the command is never given the word run, nor a job it could do; and the file's size and time are what they were before this section",
        calls.length >= 5 && calls.every((c) => /, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && !PF.SEEDS.includes(901) && probes.length === 4 && probes.every((p) => !/"run"/.test(p) && PF.parseArgs(JSON.parse(`[${p}]`)) === null) && stateOf() === before, `${calls.length} trainings, ${probes.length + 1} probes, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (round 1; the results were committed at 0abaffea before they were read, and are read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, PF.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = PF.reading(lines), near = (a, b, e = 5e-6) => Math.abs(a - b) < e;
    ok("!! the results file is the one the run wrote: 82 records, sha256 e870553804e4535b...", lines.length === 82 && createHash("sha256").update(bytes).digest("hex") === "e870553804e4535b2e9711ce0e6e82c5e3edf6848d1852c5da9942a8e4676b4b");
    ok("!! THE CHECKS HOLD: 80 draws each once, the registered recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the floors", R.checks.length === 0, R.checks.slice(0, 2).join(" | "));
    ok("!! *** T1, THE WIRING: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT *** -- the fly's ranks sum to 280 (the middle is 264), no tie, exact two-sided p 0.5641", R.T1 && R.T1.word === "THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT" && R.T1.sumA === 280 && R.T1.ties === 0 && near(R.T1.p, 0.564102), R.T1 ? `p ${R.T1.p.toFixed(5)}` : "no test");
    ok("!! *** T2, THE RECURRENCE AT THIS SIZE: THE FLY'S WIRING PAINTS WORSE THAN A PLAIN NET OF ITS SIZE *** -- the fly's ranks sum to 182 (196 or less speaks), no tie, exact two-sided p 0.00144", R.T2 && R.T2.word === "THE FLY'S WIRING PAINTS WORSE THAN A PLAIN NET OF ITS SIZE" && R.T2.sumA === 182 && R.T2.sumA <= 196 && R.T2.ties === 0 && near(R.T2.p, 0.001443), R.T2 ? `p ${R.T2.p.toFixed(5)}` : "no test");
    const A = R.arms, fl = R.floors, rMean = fl.random.reduce((a, b) => a + b, 0) / 8, draws = lines.filter((r) => r.kind === "draw");
    ok("!! the arms, 16 draws each (mean, sd): FLY 0.06919 0.00200, SHUF 0.06893 0.00168, PLAIN 0.07107 0.00059, FISH 0.06974 0.00125, MLP 0.07097 0.00078 -- the two arms with no synapses lead and vary a third as much",
        near(A.FLY.mean, 0.06919) && near(A.FLY.sd, 0.00200) && near(A.SHUF.mean, 0.06893) && near(A.SHUF.sd, 0.00168) && near(A.PLAIN.mean, 0.07107) && near(A.PLAIN.sd, 0.00059) && near(A.FISH.mean, 0.06974) && near(A.FISH.sd, 0.00125) && near(A.MLP.mean, 0.07097) && near(A.MLP.sd, 0.00078) &&
        Math.min(A.PLAIN.mean, A.MLP.mean) > Math.max(A.FLY.mean, A.SHUF.mean, A.FISH.mean) && Math.max(A.PLAIN.sd, A.MLP.sd) < 0.5 * Math.min(A.FLY.sd, A.SHUF.sd));
    ok("!! BESIDE THE FLOORS, SAID PLAINLY: eight random painters close 0.06512 and the best arm's mean is 9 percent above that; 79 of the 80 trained draws are above the random painters' mean (FLY draw 5, 0.06370, is below it); and the random search at 90 evaluations a shape closes 0.13944, about twice the best draw (0.07222)",
        near(rMean, 0.06512) && near(A.PLAIN.mean / rMean, 1.0914, 1e-3) && draws.filter((r) => r.score > rMean).length === 79 && draws.find((r) => r.score <= rMean).arm === "FLY" && draws.find((r) => r.score <= rMean).s === 5 && near(fl.search, 0.13944) && near(Math.max(...draws.map((r) => r.score)), 0.07222) && fl.search > 1.9 * Math.max(...draws.map((r) => r.score)));
    ok("an untrained painter closes almost nothing (draw 1: 0.0047 to 0.0054 an arm), so the training is where the 0.07 comes from", Object.values(fl.untrained).every((v) => v > 0.004 && v < 0.006));
    // two records an arm, their weights audited again here (400 pictures an arm: not a training)
    const again = PF.ARMS.flatMap((arm) => [3, 11].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = arm === "MLP" ? PF.policyOf(arm, s) : P.painterFactory(arm, s)({ obsDim: OBS_DIM, actDim: ACT_DIM }); p.setParams(PF.unpackWeights(r.weights)); return [arm, s, PF.auditScore(p).score === r.score]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AGAIN: draws 3 and 11 of every arm, audited here on the 200 pictures through the wiring's own factory, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/PAINTING_FLY_WIP.md");
    ok("the expectations, written before any code, against what came: T1 CANNOT BE TOLD APART was the 75 percent guess; T2 WORSE was the 30 percent one (CANNOT BE TOLD APART had 55); every arm's mean is above the random painters (85); no arm reaches the random search (90); the FISH's mean lies between the PLAIN's and the FLY's (40)",
        /T1: CANNOT BE TOLD APART about 75 percent/.test(note) && /T2: CANNOT BE TOLD APART about 55 percent, FLY WORSE about 30/.test(note) && PF.ARMS.every((a) => A[a].mean > rMean) && PF.ARMS.every((a) => A[a].max < fl.search) && A.FISH.mean > A.FLY.mean && A.FISH.mean < A.PLAIN.mean);
    ok("the registration carries the result (section 10) with both readings' words", /## 10\. The result/.test(note) && note.includes(R.T1.word) && note.includes(R.T2.word));
});

console.log(`\npaintingFly-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
