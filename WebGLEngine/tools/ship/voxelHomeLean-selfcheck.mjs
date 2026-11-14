// WebGLEngine/tools/ship/voxelHomeLean-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/voxelHomeLean-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 2 and 4 iterations on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE VOXEL HOME'S ROUND 4, BUILDERS STARTED AT THE LEAN (registered in brain/VOXEL_HOME_LEAN_WIP.md before brain/rl/leanStart.mjs and tools/ship/voxelHomeLean.mjs existed). The round is
// tools/ship/voxelHome.mjs's makeRound() with round 2's cfg and two keys more, so what the gates of rounds 1 to 3 hold of the shared code is held of this round too; this gate holds the start, the sign
// test and the two keys.
//   1  THE START             brain/rl/leanStart.mjs: the lean plus the network; the output layer at zero and nothing else touched; what the environment's hold to [-1, 1] makes of it
//   2  THE ROUND'S NUMBERS   round 2's cfg and recipe, `start: "lean"`, the history; every arm's untrained builder IS the lean, to the bit
//   3  ONE TRAINING          a record's weights are the trainer's from a wrapped policy made here by hand; they give its score again; training moves the output layer off zero
//   4  THE RECORDS           the sign test as arithmetic; the new check, failing by name; T0 and T3 against the lean and their words
//   5  THE COMMAND           its words as arithmetic; it is this round's; this gate starts no training of the round's and no process (the command as a process: tools/ship/voxelHome-selfcheck.mjs section 4)
//   6  THE VERDICT           the committed results, read from the file: the four tests, the arms and their homes beside the lean, the history, what the builders learned (looked at after), the expectations
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and the gates of rounds 1, 2 and 3 run whole for each; every one red by name
// (the number is the rows that went red over the four gates):
//   THE START: S1 the output layer not zeroed 5 | S2 the whole network zeroed 3 | S3 one weight of the output layer left 4 | S4 the action the network alone 4 | S5 the action the lean alone 2
//   S6 the lean to the finished columns 5 | S7 the lean minus the network 1 | S8 an output layer has no biases 7 | S24 the MLP's output layer counted over 8 units 3 | S25 a circuit's counted over 16 units 3
//   THE ROUND: S9 round 4's builders not wrapped 4 | S10 a started MLP trained unwrapped 1 | S11 the start-is-the-lean check gone 1 | S19 makeRound takes any start 1 | S20 no history 4
//   S21 1,000 iterations 4 | S22 writes round 2's results file 1 | S23 the command reads round 2's library 1 | S27 the command exits 0 on a word it does not know 1 (in tools/ship/voxelHome-selfcheck.mjs)
//   THE SIGN TEST: S12 one-sided 4 | S13 a tie counts as above 3 | S14 its tail starts one later 4 | S15 T0 reads the SHUF arm 1 | S16 T3 reads only the FLY arm 3 | S17 MORE and LESS each other's 3
//   S18 against a random builder 2 | S26 its lines not printed 1
//   THE VERDICT'S (section 6, 2026-11-14), this gate run whole for each, every one red by name: V1 a FLY score in the file lowered to 0.90 5 | V2 MLP draw 2's homes made 150 3 | V3 the lean in the file made 0.995 6
//   V4 the untrained FLY in the file made 0.60 6 | V5 the sign test's MORE and LESS swapped 6 | V6 the builders audited unwrapped 6 | V7 the note's T3 says CANNOT 1 | V8 the note's T1 says BETTER 1
//   V9 a block needs nothing to hold it (the look at what was learned) 3 | V10 T1 reads the fly against the MLP 2
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./voxelHomeLean.mjs";
import * as V2 from "./voxelHomeDrawn.mjs";
import * as V0 from "./voxelHome.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as B from "../../brain/rl/buildEnv.mjs";
import * as LS from "../../brain/rl/leanStart.mjs";
import { trainDockES, FlightPolicy } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a);
const TINY = Object.freeze({ maxSteps: 12, iters: 4, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2 }), TINY2 = Object.freeze({ ...TINY, iters: 2 }), TINY_AUDIT = [880001, 880002, 880003];
const LEAN = { act: (o) => Float32Array.from({ length: 36 }, (_, c) => (o[c] > 0 ? 1 : -1)) };
const obsOf = (seed, steps) => { const env = new B.BuildEnv({ choice: "drawn" }); let o = env.reset(seed); for (let i = 0; i < steps; i++) o = env.step(LEAN.act(o)).obs; return o; };
const OBS = [obsOf(11, 0), obsOf(11, 30), obsOf(12, 60)];

console.log("voxelHomeLean-selfcheck -- round 4 of the voxel home (builders started at the lean): the start, the numbers, one training, the records, the command (the round itself is never run here)\n");

console.log("1. THE START (brain/rl/leanStart.mjs)");
section(() => {
    ok("the lean is 1 for a column that still needs a block and -1 for one that needs none, and an output layer is actDim x the layer under it and actDim biases", J(arr(LS.leanOf([0.5, 0, 1, 0, 0.25], 4))) === J([1, -1, 1, -1]) && LS.tailOf(36, 34) === 36 * 34 + 36 && LS.tailOf(2, 16) === 34 && OBS.every((o) => J(arr(LS.leanOf(o, 36))) === J(arr(LEAN.act(o)))) && OBS[1].slice(0, 36).some((v) => v === 0) && OBS[1].slice(0, 36).some((v) => v > 0));
    const c = P.ARMS.FLY(5), mk = () => new P.CircuitPolicy({ obsDim: 40, actDim: 36, units: c.units, edges: c.edges, seed: 5 }), bare = mk(), inner = mk(), w = new LS.LeanStart(inner, { columns: 36, tail: LS.tailOf(36, c.units) });
    const p0 = arr(bare.getParams()), p1 = arr(w.getParams()), cut = p0.length - LS.tailOf(36, c.units);
    ok("!! A WRAPPED CIRCUIT STARTS AS THE LEAN, EXACTLY: its network answers 0 for every column on three observations, so the builder's action is the lean number for number",
        OBS.every((o) => arr(inner.act(o)).every((v) => v === 0) && J(arr(w.act(o))) === J(arr(LEAN.act(o)))) && OBS.some((o) => arr(bare.act(o)).some((v) => v !== 0)));
    ok("!! ONLY THE OUTPUT LAYER IS ZEROED: the last 36 x 34 + 36 weights are 0 and every weight before them is the unwrapped policy's of the same seed (the encoder's, which are not zero); the decoder it replaced was not zero; the weight count is unchanged",
        p1.length === p0.length && p1.length === 2967 && w.paramCount() === 2967 && J(p1.slice(0, cut)) === J(p0.slice(0, cut)) && p1.slice(cut).every((v) => v === 0) && p0.slice(cut, cut + 36 * c.units).every((v) => v !== 0) && p0.slice(0, 40 * c.units).every((v) => v !== 0));
    const m = () => new FlightPolicy({ hidden: [16, 16], obsDim: 40, actDim: 36, seed: 5 }), mb = m(), mi = m(), mw = new LS.LeanStart(mi, { columns: 36, tail: LS.tailOf(36, 16) }), q0 = arr(mb.getParams()), q1 = arr(mw.getParams()), mcut = q0.length - 36 * 16 - 36;
    ok("!! AND SO DOES A WRAPPED MLP: its last layer (36 x 16 weights and 36 biases) is 0, every weight before it the unwrapped MLP's, its network answers 0 and its action is the lean", q1.length === 1540 && J(q1.slice(0, mcut)) === J(q0.slice(0, mcut)) && q1.slice(mcut).every((v) => v === 0) && q0.slice(mcut, mcut + 576).some((v) => v !== 0) && OBS.every((o) => arr(mi.act(o)).every((v) => v === 0) && J(arr(mw.act(o))) === J(arr(LEAN.act(o)))));
    const moved = Float32Array.from(p0); w.setParams(moved); bare.setParams(moved); const sum = OBS.map((o) => { const n = arr(bare.act(o)), l = arr(LEAN.act(o)); return n.map((v, i) => l[i] + v); });
    ok("!! WITH OTHER WEIGHTS THE ACTION IS THE LEAN PLUS THE NETWORK'S OUTPUT, column by column: the wrapper given the unwrapped policy's own weights answers lean + that policy's answer, and hands those weights back", OBS.every((o, k) => J(arr(w.act(o))) === J(arr(Float32Array.from(sum[k])))) && J(arr(w.getParams())) === J(p0) && OBS.some((o) => J(arr(w.act(o))) !== J(arr(LEAN.act(o)))));
    const env = new B.BuildEnv({ choice: "drawn" }), o = OBS[1], lean = arr(LEAN.act(o)), up = env.chancesFor(lean.map((v) => v + 1)), flat = env.chancesFor(lean), down = env.chancesFor(lean.map((v) => v - 1)), need = lean.findIndex((v) => v === 1), fin = lean.findIndex((v) => v === -1);
    ok("!! WHAT THE ENVIRONMENT'S HOLD TO [-1, 1] MAKES OF IT: a network that adds 1 everywhere lifts the finished columns to 0 and cannot lift the unfinished past 1, so an unfinished column stays e^4 likelier than a finished one (the lean alone: e^8); one that takes 1 from everywhere leaves the finished at -1 and the unfinished at 0, e^4 again",
        Math.abs(flat[need] / flat[fin] - Math.exp(8)) < 1e-6 && Math.abs(up[need] / up[fin] - Math.exp(4)) < 1e-9 && Math.abs(down[need] / down[fin] - Math.exp(4)) < 1e-9 && need >= 0 && fin >= 0);
    ok("what is refused, by name: an inner policy that is not one; no columns; an output layer of 0 weights or of more than the policy has; a network that answers another number of columns than the wrapper has",
        throws(() => new LS.LeanStart({}, { columns: 36, tail: 1 }), /the inner policy has act, getParams and setParams/) && throws(() => new LS.LeanStart(mk(), { tail: 5 }), /columns is a whole number above 0/) && throws(() => new LS.LeanStart(mk(), { columns: 36, tail: 0 }), /the output layer is 1 to 2967 weights/) &&
        throws(() => new LS.LeanStart(mk(), { columns: 36, tail: 2968 }), /the output layer is 1 to 2967 weights/) && throws(() => new LS.LeanStart(mk(), { columns: 35, tail: 10 }).act(OBS[0]), /answers 36 numbers for 35 columns/));
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/VOXEL_HOME_LEAN_WIP.md");
    ok("!! THE ROUND IS ROUND 2'S WITH TWO KEYS MORE: `start: \"lean\"` and the trainer's history; its own results file; round 2's recipe, 150 iterations, to the number -- and rounds 1 to 3 have no start",
        J(V.ROUND4) === J({ ...V2.ROUND2, start: "lean", history: true, results: "brain/voxelHomeLeanRound.jsonl" }) && J(V.RECIPE) === J(V2.RECIPE) && V.RECIPE.iters === 150 && V.START === "lean" && V0.makeRound(V2.ROUND2).START === null && V0.makeRound(V0.ROUND1).START === null && V.RESULTS === "brain/voxelHomeLeanRound.jsonl" && note.includes("`" + V.RESULTS + "`"));
    ok("the arms, their weight counts, the draws, the audit plans, the random builders' seeds and alpha are round 2's; T1's and T2's words are round 2's; T0's and T3's are this round's, against the lean, and the registration carries them",
        J(V.ARMS) === J(V2.ARMS) && J(V.WEIGHTS) === J(V2.WEIGHTS) && V.PLAIN_UNITS === 38 && J(V.MLP_HIDDEN) === J([16, 16]) && J(V.SEEDS) === J(V2.SEEDS) && J(V.AUDIT) === J(V2.AUDIT) && J(V.RANDOM_SEEDS) === J(V2.RANDOM_SEEDS) && V.ALPHA === 0.01 && J(V.WORDS.T1) === J(V2.WORDS.T1) && J(V.WORDS.T2) === J(V2.WORDS.T2) &&
        J(V.WORDS.T0) === J(["A FLY-WIRED BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN", "A FLY-WIRED BUILDER STARTED AT THE LEAN BUILDS LESS THAN THE LEAN", "A FLY-WIRED BUILDER STARTED AT THE LEAN CANNOT BE TOLD APART FROM THE LEAN"]) &&
        J(V.WORDS.T3) === J(["A BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN", "A BUILDER STARTED AT THE LEAN BUILDS LESS THAN THE LEAN", "A BUILDER STARTED AT THE LEAN CANNOT BE TOLD APART FROM THE LEAN"]) && note.includes("`" + V.WORDS.T0[0] + "`") && note.includes("`" + V.WORDS.T3[0] + "`") && J(V2.WORDS.T0) !== J(V.WORDS.T0));
    const under = { FLY: 34, SHUF: 34, PLAIN: 38, FISH: V.circuitOf("FISH", 2).units, MLP: 16 };
    const starts = V.ARMS.map((a) => { const p = arr(V.policyOf(a, 2).getParams()), q = arr(V2.policyOf(a, 2).getParams()), cut = p.length - 36 * under[a] - 36; return [a, p.length === V.WEIGHTS[a] && J(p.slice(0, cut)) === J(q.slice(0, cut)) && p.slice(cut).every((v) => v === 0) && q.slice(cut).some((v) => v !== 0)]; });
    ok("!! A DRAW'S UNTRAINED BUILDER IS ROUND 2'S FOR THAT DRAW WITH ITS OUTPUT LAYER AT ZERO: draw 2 of every arm, every weight before the output layer round 2's, the output layer 0 (round 2's is not), the weight count the arm's", starts.every((x) => x[1]), starts.filter((x) => !x[1]).map((x) => x[0]).join(", "));
    const lean = V.auditScore(LEAN, TINY_AUDIT, 96), un = V.ARMS.map((a) => V.auditScore(V.policyOf(a, 3), TINY_AUDIT, 96)), fl = V.floors(TINY_AUDIT, 96, [1000]), r2 = V2.auditScore(V2.policyOf("FLY", 3), TINY_AUDIT, 96);
    ok("!! *** AT THE START EVERY BUILDER OF EVERY ARM IS THE LEAN, TO THE BIT *** -- on three plans the untrained draw 3 of each arm scores the lean's score and its homes; the floors say so (untrained = lean for all five); and round 2's untrained FLY does not",
        un.every((a) => a.score === lean.score && a.homes === lean.homes) && V.ARMS.every((a) => fl.untrained[a] === fl.lean) && fl.lean === lean.score && fl.leanHomes === lean.homes && r2.score !== lean.score && lean.score > 0.8, `${lean.score.toFixed(4)} against round 2's ${r2.score.toFixed(4)}`);
    ok("a start is \"lean\" with the drawn choice or nothing: makeRound refuses another start, and the lean with a named column", throws(() => V0.makeRound({ ...V2.ROUND2, start: "rule" }), /a cfg is/) && throws(() => V0.makeRound({ ...V0.ROUND1, start: "lean" }), /a cfg is/));
});

console.log("\n3. ONE TRAINING (4 iterations and 2, on draw 901)");
section(() => {
    const r = V.trainOne("FLY", 901, TINY, TINY_AUDIT), m = V.trainOne("MLP", 901, TINY2, TINY_AUDIT), short = V2.trainOne("FLY", 901, TINY, TINY_AUDIT), c = P.ARMS.FLY(901);
    const common = { envFactory: (o = {}) => new B.BuildEnv({ maxSteps: 12, choice: "drawn", ...o }), obsDim: 40, actDim: 36, maxSteps: 12, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901 };
    const direct = trainDockES({ ...common, iters: 4, policyFactory: ({ obsDim, actDim, seed }) => new LS.LeanStart(new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed }), { columns: 36, tail: 36 * c.units + 36 }) });
    const directM = trainDockES({ ...common, iters: 2, policyFactory: ({ obsDim, actDim, seed }) => new LS.LeanStart(new FlightPolicy({ hidden: [16, 16], obsDim, actDim, seed }), { columns: 36, tail: 36 * 16 + 36 }) });
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A WRAPPED POLICY MADE HERE BY HAND: the FLY arm's (the circuit, wrapped, its output layer of 36 x 34 + 36 at zero) and the MLP's (16-16, wrapped, 36 x 16 + 36), each to the hash, with the arm's weight count and the trainer's history",
        PF.hashWeights(direct.params) === r.weightsHash && r.weightCount === 2967 && PF.hashWeights(directM.params) === m.weightsHash && m.weightCount === 1540 && J(r.history) === J(direct.history.map((h) => ({ it: h.it, missing: h.avgDist }))) && J(r.history.map((h) => h.it)) === J([0, 1, 2, 3]) && J(m.history.map((h) => h.it)) === J([0, 1]));
    const again = [["FLY", r], ["MLP", m]].map(([arm, rec]) => { const p = V.policyOf(arm, 901); p.setParams(PF.unpackWeights(rec.weights)); const a = V.auditScore(p, TINY_AUDIT, 12); return a.score === rec.score && a.homes === rec.homes; });
    const w = arr(PF.unpackWeights(r.weights)), tail = w.slice(w.length - 36 * 34 - 36);
    ok("!! THE WEIGHTS GIVE THE SCORE AGAIN THROUGH THE WRAPPED BUILDER, and the training is not round 2's for the draw: the record's weights in this round's builder, audited on the same plans, give its score and homes to the bit; round 2's training of the same draw ends at other weights; and the output layer has left zero", again.every(Boolean) && short.weightsHash !== r.weightsHash && tail.some((v) => v !== 0) && !("history" in short));
});

console.log("\n4. THE RECORDS");
section(() => {
    const st = (above, below, n) => V0.signTest(Array.from({ length: n }, (_, i) => (i < above ? 1 : i < above + below ? -1 : 0)), 0);
    ok("!! THE SIGN TEST, AS ARITHMETIC: the exact two-sided binomial on the larger of the counts above and below, a tie on neither side -- of 16, 14 above is p 0.00418 and speaks, 13 is 0.0213 and does not, 16 is 2 / 65536; 13 above with 3 EQUAL is still 0.0213 (a tie counts against); of 80 the count that speaks is 52 (0.0097; 51 is 0.0183); it is the same read from below",
        Math.abs(st(14, 2, 16).p - 274 / 65536) < 1e-15 && Math.abs(st(13, 3, 16).p - 1394 / 65536) < 1e-15 && st(16, 0, 16).p === 2 / 65536 && st(13, 0, 16).p === st(13, 3, 16).p && st(13, 0, 16).ties === 3 && st(8, 8, 16).p === 1 && st(52, 28, 80).p <= 0.01 && st(51, 29, 80).p > 0.01 && Math.abs(st(52, 28, 80).p - 0.00968) < 1e-5 &&
        st(2, 14, 16).p === st(14, 2, 16).p && J([st(14, 2, 16).above, st(14, 2, 16).below, st(14, 2, 16).n]) === J([14, 2, 16]) && throws(() => V0.signTest([], 0), /finite values/) && throws(() => V0.signTest([1, NaN], 0), /finite values/) && throws(() => V0.signTest([1], Infinity), /finite reference/));
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, missing: 0.1 - k / 1000 - s / 100000 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "MLP" ? null : V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c ? c.units : null, edges: c ? c.edges.length : null, edgesHash: c ? PF.hashEdges(c.edges) : null, weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), trainerBest: null, score, homes: 0, history: hist(s) }; };
    const file = (scoreOf, lean = 0.92) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, { kind: "floors", random: V.RANDOM_SEEDS.map((_, k) => 0.55 + k / 1000), randomHomes: V.RANDOM_SEEDS.map(() => 0), untrained: { FLY: lean, SHUF: lean, PLAIN: lean, FISH: lean, MLP: lean }, lean, leanHomes: 120 }); return out; };
    const jit = (arm, s) => ((s * 7 + V.ARMS.indexOf(arm) * 3) % 16) / 10000, good = file((arm, s) => 0.93 + jit(arm, s)), clone = () => JSON.parse(J(good));
    ok("!! a file of 80 draws with their histories, the recheck and floors whose untrained builders score the lean's number passes every check", V.checkRecords(good).length === 0, V.checkRecords(good).slice(0, 2).join(" | "));
    const fl = (L) => L.find((r) => r.kind === "floors"), broken = [
        ["an untrained arm that is not the lean", (L) => { fl(L).untrained.FISH = 0.55; }, /the untrained FISH builder does not score the lean's number: the start is not the lean/],
        ["floors with no lean", (L) => { delete fl(L).lean; }, /the untrained FLY builder does not score the lean's number/],
        ["a draw with no history", (L) => { delete L.find((r) => r.arm === "MLP" && r.s === 6).history; }, /MLP draw 6 has no history from iteration 0 to 149/],
        ["round 3's recipe", (L) => { L.find((r) => r.arm === "PLAIN" && r.s === 2).recipe.iters = 1000; }, /PLAIN draw 2 was trained with another recipe/],
    ];
    const res = broken.map(([name, f, re]) => { const L = clone(); f(L); const bad = V.checkRecords(L); return [name, bad.some((b) => re.test(b)), bad[0]]; });
    ok(`!! EACH NEW CHECK FAILS BY NAME (${broken.length}: ${broken.map((b) => b[0]).join("; ")}), and with a failed check no test is made, T0 and T3 included`, res.every((r) => r[1]) && (() => { const L = clone(); fl(L).untrained.FLY = 0.5; const R = V.reading(L); return R.T0 === null && R.T3 === null && R.T1 === null && /A CHECK FAILED/.test(V.readingLines(R)[0]); })(), res.filter((r) => !r[1]).map((r) => `${r[0]}: ${r[2]}`).join(" | "));
    const up = V.reading(good), down = V.reading(file((arm, s) => 0.90 + jit(arm, s))), at = V.reading(file(() => 0.92)), part = V.reading(file((arm, s) => (s <= 13 ? 0.93 : 0.91) + jit(arm, s)));
    ok("!! T0 READS THE 16 FLY BUILDERS AGAINST THE LEAN'S OWN SCORE IN THE FILE: all above -> BUILDS MORE THAN THE LEAN (16 above, p 2 / 65536); all below -> LESS; all EQUAL to it -> CANNOT BE TOLD APART, 16 ties; 13 above and 3 below -> CANNOT (p 0.0213)",
        up.T0.word === V.WORDS.T0[0] && up.T0.above === 16 && up.T0.p === 2 / 65536 && up.T0.ref === 0.92 && up.T0.sign === true && down.T0.word === V.WORDS.T0[1] && down.T0.below === 16 && at.T0.word === V.WORDS.T0[2] && at.T0.ties === 16 && at.T3.ties === 80 && part.T0.word === V.WORDS.T0[2] && part.T0.above === 13 && part.T0.below === 3);
    const split = V.reading(file((arm, s) => (arm === "FLY" ? 0.90 : 0.93) + jit(arm, s))), other = V.reading(file((arm, s) => (arm === "FLY" ? 0.93 : arm === "SHUF" && s <= 8 ? 0.93 : 0.90) + jit(arm, s))), moved = V.reading(file((arm, s) => 0.93 + jit(arm, s), 0.94));
    ok("!! T3 READS ALL 80 AGAINST THE LEAN, AND T0 ONLY THE FLY: with the FLY builders below the lean and the other 64 above, T0 says LESS and T3 MORE (64 above, 16 below); with the FLY above and 56 of the others below, T0 says MORE and T3 LESS; and the same scores against a lean of 0.94 in the file are all below it",
        split.T0.word === V.WORDS.T0[1] && split.T3.word === V.WORDS.T3[0] && split.T3.above === 64 && split.T3.below === 16 && split.T3.n === 80 && other.T0.word === V.WORDS.T0[0] && other.T3.word === V.WORDS.T3[1] && other.T3.below === 56 && moved.T0.word === V.WORDS.T0[1] && moved.T3.word === V.WORDS.T3[1]);
    const lines = V.readingLines(up).join("\n");
    ok("T1 and T2 are round 2's rank-sums with round 2's words, and the reading's lines say the two sign tests in their own form, the lean, each arm's history, and no test against the random builders", up.T1.word === V.WORDS.T1[2] && Number.isInteger(up.T1.sumA) && !up.T1.sign && V.WORDS.T2.includes(up.T2.word) &&
        /T0 \(FLY against the lean\): of 16, 16 above the lean's 0\.9200, 0 below, 0 equal; exact two-sided p 3\.052e-5/.test(lines) && /T3 \(all the builders against the lean\): of 80, 80 above/.test(lines) && lines.includes(V.WORDS.T3[0]) && !/T0 \(FLY against 16 random builders\)/.test(lines) && /T1 \(FLY against SHUF\): the fly's ranks sum to/.test(lines) && /FLY +the trainer's own battery, share missing at iteration 0: /.test(lines) && up.arms.FLY.history.length === 7);
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "WORM", "1"], ["job", "FLY", "x"], ["job", "FLY", "17"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for a registered arm and draw; eight other shapes are not words)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FLY", "16"])) === J({ cmd: "job", arm: "FLY", s: 16 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeVoxelHomeLean.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone and refuses a run of no processes itself",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/voxelHomeLean\.mjs"/.test(csrc) && !/voxelHomeDrawn|voxelHomeLong|"\.\/voxelHome\.mjs"|voxelHomeRound/.test(csrc) && /usage: node tools\/ship\/takeVoxelHomeLean\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/voxelHomeLean-selfcheck.mjs"), calls = [...me.matchAll(/V2?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its three trainings are of 4 and 2 iterations on draw 901; this gate starts no process at all (the command is never run from here); and the file's size and time are what they were before this section",
        calls.length === 3 && calls.every((c) => /^"(FLY|MLP)", 901, TINY2?, TINY_AUDIT$/.test(c)) && TINY.iters === 4 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (round 4; the results were committed at 4636c841 before they were read, and are read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = V.reading(lines), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
    ok("!! the results file is the one the run wrote: 82 records, sha256 31c3fe9ee72e317c...", lines.length === 82 && createHash("sha256").update(bytes).digest("hex") === "31c3fe9ee72e317cd6c39d5cb22b48b155f28562af27770ecc25008ebae5ff2e");
    ok("!! THE CHECKS HOLD: 80 draws each once, round 2's recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the floors, a history in every record -- and THE START WAS THE LEAN: the untrained builder of every arm scores the lean's 0.9226, to the bit", R.checks.length === 0 && V.ARMS.every((a) => R.floors.untrained[a] === R.floors.lean) && near(R.floors.lean, 0.9226) && R.floors.leanHomes === 123, R.checks.slice(0, 2).join(" | "));
    ok("!! *** T3: A BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN *** -- all 80 trained builders score above the lean on the same 200 plans, none below, none equal (exact two-sided p 1.7e-24)", R.T3 && R.T3.word === V.WORDS.T3[0] && R.T3.above === 80 && R.T3.below === 0 && R.T3.ties === 0 && R.T3.n === 80 && R.T3.p < 2e-24 && near(R.T3.ref, 0.9226));
    ok("!! *** T0: A FLY-WIRED BUILDER STARTED AT THE LEAN BUILDS MORE THAN THE LEAN *** -- all 16 above (exact two-sided p 2 / 65536)", R.T0 && R.T0.word === V.WORDS.T0[0] && R.T0.above === 16 && R.T0.ties === 0 && R.T0.p === 2 / 65536);
    ok("!! *** T1 AND T2, THE WIRING: THE FLY'S CANNOT BE TOLD APART FROM A SHUFFLE OF IT (the ranks sum to 287, p 0.40) NOR FROM A PLAIN NET OF ITS SIZE (275, p 0.70) *** -- the fifth round to say the first", R.T1 && R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 287 && near(R.T1.p, 0.40164) && R.T2 && R.T2.word === V.WORDS.T2[2] && R.T2.sumA === 275 && near(R.T2.p, 0.69626));
    const A = R.arms, draws = lines.filter((r) => r.kind === "draw"), total = draws.reduce((n, r) => n + r.homes, 0);
    ok("!! the arms' mean share of a home built, 16 draws each (mean, sd): SHUF 0.9879 0.0068, FISH 0.9887 0.0041, PLAIN 0.9892 0.0038, FLY 0.9894 0.0046, MLP 0.9924 0.0046 -- every arm within half a hundredth of the others, the least builder 0.965 and the best 0.996, against the lean's 0.9226",
        near(A.SHUF.mean, 0.9879) && near(A.SHUF.sd, 0.0068) && near(A.FISH.mean, 0.9887) && near(A.FISH.sd, 0.0041) && near(A.PLAIN.mean, 0.9892) && near(A.PLAIN.sd, 0.0038) && near(A.FLY.mean, 0.9894) && near(A.FLY.sd, 0.0046) && near(A.MLP.mean, 0.9924) && near(A.MLP.sd, 0.0046) &&
        near(Math.min(...draws.map((r) => r.score)), 0.9647) && near(Math.max(...draws.map((r) => r.score)), 0.9961) && Math.max(...V.ARMS.map((a) => A[a].mean)) - Math.min(...V.ARMS.map((a) => A[a].mean)) < 0.005);
    ok("!! *** THEY FINISH HOUSES: 12,700 homes in 16,000 builds, where rounds 1 to 3 finished 2 in 48,000 *** -- an arm's builders finish 151 to 172 of the 200 plans on average (SHUF 2,420, FLY 2,491, FISH 2,495, PLAIN 2,546, MLP 2,748 of 3,200), the lean 123; 78 of the 80 builders finish more than the lean, the least 115 and the best 183 (MLP draw 2)",
        total === 12700 && A.SHUF.homes === 2420 && A.FLY.homes === 2491 && A.FISH.homes === 2495 && A.PLAIN.homes === 2546 && A.MLP.homes === 2748 && draws.filter((r) => r.homes > 123).length === 78 && Math.min(...draws.map((r) => r.homes)) === 115 && Math.max(...draws.map((r) => r.homes)) === 183 && draws.find((r) => r.homes === 183).arm === "MLP" && draws.find((r) => r.homes === 183).s === 2);
    const H = (a) => A[a].history.map((h) => h.missing);
    ok("!! THE LEARNING WAS QUICK AND WAS STILL GOING, SLOWLY: on the trainer's own battery every arm's share missing falls from 0.12 to 0.14 at iteration 0 to 0.02 to 0.04 by iteration 25, and to 0.009 to 0.014 by iteration 149 (FLY 0.1265, 0.0358, 0.0103)",
        V.ARMS.every((a) => H(a).length === 7 && H(a)[0] > 0.12 && H(a)[0] < 0.14 && H(a)[1] > 0.019 && H(a)[1] < 0.042 && H(a)[6] > 0.009 && H(a)[6] < 0.0141) && near(H("FLY")[0], 0.1265) && near(H("FLY")[1], 0.0358) && near(H("FLY")[6], 0.0103) && J(A.FLY.history.map((h) => h.it)) === J([0, 25, 50, 75, 100, 125, 149]));
    const again = V.ARMS.flatMap((arm) => [2, 9].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore(p); return [arm, s, a.score === r.score && a.homes === r.homes]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS HOMES AGAIN: draws 2 and 9 of every arm (the best builder among them), audited here on the 200 plans through the wrapped builder, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    // LOOKED AT AFTER THE READING, NOT REGISTERED: what the builders learned. On the first 50 audit plans, the lean and FLY draw 1 -- the picks refused because the block would hang, and the network's mean lift by what a column needs.
    const look = (policy) => { const env = new B.BuildEnv({ choice: "drawn" }); let hang = 0; const by = {}; for (const seed of V.AUDIT.slice(0, 50)) { let o = env.reset(seed), done = false; while (!done) { const a = policy.act(o); for (let c = 0; c < 36; c++) { const k = o[c].toFixed(2); by[k] = by[k] || [0, 0]; by[k][0] += Math.max(-1, Math.min(1, a[c])); by[k][1]++; } const r = env.step(a); if (!r.info.last.placed && r.info.last.why === "nothing to hold the block up") hang++; o = r.obs; done = r.done; } } return { hang: hang / 50, by: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v[0] / v[1]])) }; };
    const fly1 = V.policyOf("FLY", 1); fly1.setParams(PF.unpackWeights(draws.find((d) => d.arm === "FLY" && d.s === 1).weights)); const lk = look(LEAN), tk = look(fly1);
    ok("!! *** WHAT IT LEARNED (looked at after the reading, not registered): NOT TO ASK FOR A ROOF BLOCK THAT WOULD HANG *** -- on 50 plans the lean spends 23.8 picks a build on a block with nothing to hold it; FLY draw 1 spends 5.3. Its network holds back the columns that need a single block (the roof over the room: 0.30 where the lean says 1) and favours the columns part built (0.75 and 0.86 for those needing a half and three quarters; 0.46 for those needing everything)",
        near(lk.hang, 23.78, 5e-3) && near(tk.hang, 5.32, 5e-3) && near(tk.by["0.25"], 0.304, 5e-4) && near(tk.by["0.50"], 0.752, 5e-4) && near(tk.by["0.75"], 0.858, 5e-4) && near(tk.by["1.00"], 0.463, 5e-4) && lk.by["0.25"] === 1 && lk.by["1.00"] === 1 && tk.by["0.25"] < tk.by["1.00"] && tk.by["1.00"] < tk.by["0.50"], `${lk.hang} ${tk.hang}`);
    const note = src("brain/VOXEL_HOME_LEAN_WIP.md"), res = note.slice(note.indexOf("## 8. The result"));
    ok("the expectations, written before the tool, against what came: T3 MORE was given 40 percent and T0 MORE 25 -- both came; T1 CANNOT BE TOLD APART the 80 and T2 the 70 -- both came; the best arm above 0.95 was given 20 percent and every arm is above 0.98; some builder with more than 123 homes 45 percent, and 78 of 80 have",
        /T3: MORE about 40 percent/.test(note) && /T0: MORE about 25/.test(note) && /T1: CANNOT BE TOLD APART about 80/.test(note) && /T2: CANNOT about 70/.test(note) && /above 0\.95: about 20 percent/.test(note) && /more\s+than 123 homes of 200: about 45 percent/.test(note) && Math.min(...V.ARMS.map((a) => A[a].mean)) > 0.98);
    ok("the registration's RESULT SECTION (section 8, and not the list of possible words in section 2) carries the four readings' words", /## 8\. The result/.test(note) && [["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word], ["T3", R.T3.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)));
});

console.log(`\nvoxelHomeLean-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
