// WebGLEngine/tools/ship/voxelHomeBoth-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/voxelHomeBoth-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE VOXEL HOME'S ROUND 6, THE TWO TOGETHER (registered in brain/VOXEL_HOME_BOTH_WIP.md before tools/ship/voxelHomeBoth.mjs existed): round 4's lean start with round 5's 96 builders tried an
// iteration. The round is tools/ship/voxelHome.mjs's makeRound() with round 4's cfg and one key, so what the gates of rounds 1 to 5 hold of the shared code is held here; this gate holds the key and the
// two tests against round 4's own records.
//   1  THE ROUND'S NUMBERS   round 4's cfg with pop 96 and nothing else; round 4's file as BEFORE; the words
//   2  ONE TRAINING          the count of builders reaches the trainer under the lean start; the start is still the lean
//   3  THE RECORDS           the new check, failing by name; P3 (each builder against its round 4 self) and P0 (FLY against round 4's FLY) and their words; round 4's four tests are still made
//   4  THE COMMAND           its words as arithmetic; it is this round's and reads round 4's file; this gate starts no training of the round's and no process
//   5  THE VERDICT           the committed results, read from the file: P3 and P0 against round 4's own records, round 4's four tests, the homes, the history, the expectations
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and round 1's run whole for each; every one red by name (the number is the rows):
//   B1 round 6 tries 24 builders after all 1 | B2 not started at the lean 5 | B3 writes round 4's results file 1 | B4 round 4's file not checked 1 | B5 P3 against the round 4 builder of draw 1 1
//   B6 P3's MORE and LESS each other's 3 | B7 P0 reads every arm 2 | B8 P0's MORE and LESS each other's 2 | B9 the tests made with a check failed 1 | B10 round 4's tests kept with a check failed 1
//   B11 a builder with as many homes counts as more 1 | B12 the command reads no earlier file 1 | B13 the command reads round 4's library 1 | B14 the command exits 0 on a word it does not know 1 (round 1's gate)
//   B15 P3's lines not printed 1 | B16 P3 a sign test against the lean, not round 4 3
//   THE VERDICT'S (section 5, 2026-11-15), this gate run whole for each, every one red by name: V1 a FLY score in the file lowered to 0.98 5 | V2 MLP draw 4's homes made 200 4
//   V3 a round 4 FLY score in round 4's file raised to 0.999 2 | V4 P3's MORE and LESS swapped 5 | V5 P3 pairs each builder with round 4's draw 1 3 | V6 the note's P3 says CANNOT 1
//   V7 the note's T1 says BETTER 1 | V8 P0 reads every arm 3
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./voxelHomeBoth.mjs";
import * as V4 from "./voxelHomeLean.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as B from "../../brain/rl/buildEnv.mjs";
import * as LS from "../../brain/rl/leanStart.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a);
const TINY = Object.freeze({ maxSteps: 12, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 2 }), TINY4 = Object.freeze({ ...TINY, pop: 4 }), TINY_AUDIT = [880001, 880002, 880003];
const LEAN = { act: (o) => Float32Array.from({ length: 36 }, (_, c) => (o[c] > 0 ? 1 : -1)) };

console.log("voxelHomeBoth-selfcheck -- round 6 of the voxel home (started at the lean, 96 builders tried an iteration): the numbers, one training, the records, the command (the round itself is never run here)\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/VOXEL_HOME_BOTH_WIP.md");
    ok("!! THE ROUND IS ROUND 4'S WITH ONE NUMBER CHANGED: pop 96 for 24, and its own results file; the lean start, the history, 150 iterations, the step and every other number are round 4's -- and the registration says so",
        J(V.ROUND6) === J({ ...V4.ROUND4, pop: 96, results: "brain/voxelHomeBothRound.jsonl" }) && J(V.RECIPE) === J({ ...V4.RECIPE, pop: 96 }) && V4.RECIPE.pop === 24 && V.START === "lean" && V.RESULTS === "brain/voxelHomeBothRound.jsonl" && V.BEFORE === V4.RESULTS && /\*\*Changed: `pop 96`\*\* \(round 4: `pop 24`\)/.test(note) && note.includes("`" + V.RESULTS + "`"));
    ok("the arms, their weight counts, the draws, the audit plans and alpha are round 4's; round 4's four tests keep round 4's words; P3's and P0's are this round's and the registration carries them",
        J(V.ARMS) === J(V4.ARMS) && J(V.WEIGHTS) === J(V4.WEIGHTS) && V.PLAIN_UNITS === 38 && J(V.MLP_HIDDEN) === J([16, 16]) && J(V.SEEDS) === J(V4.SEEDS) && J(V.AUDIT) === J(V4.AUDIT) && J(V.RANDOM_SEEDS) === J(V4.RANDOM_SEEDS) && V.ALPHA === 0.01 && ["T0", "T1", "T2", "T3"].every((t) => J(V.WORDS[t]) === J(V4.WORDS[t])) &&
        J(V.WORDS.P3) === J(["FROM THE LEAN, MORE BUILDERS TRIED BUILDS MORE OF A HOME", "FROM THE LEAN, MORE BUILDERS TRIED BUILDS LESS OF A HOME", "FROM THE LEAN, MORE BUILDERS TRIED CANNOT BE TOLD APART FROM ROUND 4'S"]) && J(V.WORDS.P0) === J(V.WORDS.P3.map((w) => "A FLY-WIRED BUILDER, " + w)) && V.WORDS.P3.every((w) => note.includes("`" + w + "`")));
    const lean = V.auditScore(LEAN, TINY_AUDIT, 96), fl = V.floors(TINY_AUDIT, 96, [1000]);
    ok("!! THE START IS STILL THE LEAN, AND A DRAW'S UNTRAINED BUILDER IS ROUND 4'S: draw 2 of every arm weight for weight, the circuit the same, and on three plans every arm's untrained builder scores the lean's score to the bit",
        V.ARMS.every((a) => J(arr(V.policyOf(a, 2).getParams())) === J(arr(V4.policyOf(a, 2).getParams()))) && J(V.circuitOf("SHUF", 5)) === J(V4.circuitOf("SHUF", 5)) && V.ARMS.every((a) => fl.untrained[a] === fl.lean) && fl.lean === lean.score && lean.score > 0.8);
});

console.log("\n2. ONE TRAINING (2 iterations, 8 builders an iteration and 4, on draw 901)");
section(() => {
    const r = V.trainOne("FLY", 901, TINY, TINY_AUDIT), four = V4.trainOne("FLY", 901, TINY4, TINY_AUDIT), same = V4.trainOne("FLY", 901, TINY, TINY_AUDIT), c = P.ARMS.FLY(901);
    const direct = trainDockES({ envFactory: (o = {}) => new B.BuildEnv({ maxSteps: 12, choice: "drawn", ...o }), obsDim: 40, actDim: 36, maxSteps: 12, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901,
        policyFactory: ({ obsDim, actDim, seed }) => new LS.LeanStart(new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed }), { columns: 36, tail: 36 * c.units + 36 }) });
    ok("!! THE COUNT OF BUILDERS REACHES THE TRAINER UNDER THE LEAN START: the record's weights are the trainer's called here by hand with a wrapped circuit and 8 builders an iteration, to the hash; round 4's code at 4 builders ends at other weights and at 8 at the same ones (one code, the recipe the difference); the record carries its recipe and the history",
        PF.hashWeights(direct.params) === r.weightsHash && r.weightsHash !== four.weightsHash && r.weightsHash === same.weightsHash && J(r.recipe) === J(TINY) && r.weightCount === 2967 && J(r.history.map((h) => h.it)) === J([0, 1]));
    const p = V.policyOf("FLY", 901); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore(p, TINY_AUDIT, 12);
    ok("the weights give the score again through the wrapped builder, to the bit", a.score === r.score && a.homes === r.homes);
});

console.log("\n3. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, missing: 0.1 - k / 1000 - s / 100000 }));
    const rec = (arm, s, score, homes) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "MLP" ? null : V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c ? c.units : null, edges: c ? c.edges.length : null, edgesHash: c ? PF.hashEdges(c.edges) : null, weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), trainerBest: null, score, homes, history: hist(s) }; };
    const file = (scoreOf, homesOf = () => 160) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s), homesOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, { kind: "floors", random: V.RANDOM_SEEDS.map((_, k) => 0.55 + k / 1000), randomHomes: V.RANDOM_SEEDS.map(() => 0), untrained: { FLY: 0.92, SHUF: 0.92, PLAIN: 0.92, FISH: 0.92, MLP: 0.92 }, lean: 0.92, leanHomes: 120 }); return out; };
    const jit = (arm, s) => ((s * 7 + V.ARMS.indexOf(arm) * 3) % 16) / 100000, r4 = (arm, s) => 0.985 + jit(arm, s);
    const beforeOf = (scoreOf = r4, homesOf = () => 150) => V.SEEDS.flatMap((s) => V.ARMS.map((arm) => ({ kind: "draw", arm, s, score: scoreOf(arm, s), homes: homesOf(arm, s) })));
    const good = file((arm, s) => r4(arm, s) + 0.005), before = beforeOf();
    ok("!! a file of 80 draws beside round 4's 80 passes every check; round 4's file short of a draw, with one twice, or not handed in fails by name, and then no test is made -- round 4's four included",
        V.checkRecords(good, before).length === 0 && [before.slice(1), before.concat([before[3]]), null].every((bf) => V.checkRecords(good, bf).some((b) => /round 4's file \(brain\/voxelHomeLeanRound\.jsonl\) does not hold its 80 draws, each once/.test(b))) &&
        (() => { const R = V.reading(good, null); return R.P0 === null && R.P3 === null && R.T0 === null && R.T3 === null && R.T1 === null && R.moreHomes === null && /A CHECK FAILED/.test(V.readingLines(R)[0]); })(), V.checkRecords(good, before).slice(0, 2).join(" | "));
    const up = V.reading(good, before), down = V.reading(file((arm, s) => r4(arm, s) - 0.005), before), tie = V.reading(file(r4), before), part = V.reading(file((arm, s) => r4(arm, s) + (s <= 10 ? 0.005 : -0.005)), before);
    ok("!! P3 IS EACH BUILDER AGAINST ITS ROUND 4 SELF, the same arm and the same draw: every one a little above its own -> BUILDS MORE (80 above, p 1.7e-24); every one below -> LESS; every one EQUAL -> CANNOT BE TOLD APART, 80 ties; 50 above and 30 below -> CANNOT (52 speaks)",
        up.P3.word === V.WORDS.P3[0] && up.P3.above === 80 && up.P3.n === 80 && up.P3.p < 2e-24 && down.P3.word === V.WORDS.P3[1] && down.P3.below === 80 && tie.P3.word === V.WORDS.P3[2] && tie.P3.ties === 80 && part.P3.word === V.WORDS.P3[2] && part.P3.above === 50 && part.P3.below === 30);
    const big = (arm, s) => 0.90 + s / 200 + V.ARMS.indexOf(arm) / 1000, paired = V.reading(file((arm, s) => big(arm, s) + 0.0001), beforeOf(big));
    ok("!! ...AND IT IS PAIRED, NOT POOLED: with round 4's builders spread from 0.90 to 0.98 by draw and each of this round's a ten-thousandth above its own, P3 says MORE (80 of 80) while the 16 FLY against round 4's 16 FLY, read as two groups, cannot be told apart (P0)", paired.P3.word === V.WORDS.P3[0] && paired.P3.above === 80 && paired.P0.word === V.WORDS.P0[2]);
    const flyOnly = V.reading(file((arm, s) => r4(arm, s) + (arm === "FLY" ? 0.005 : -0.005)), before);
    ok("!! P0 READS THE FLY BUILDERS AGAINST ROUND 4'S FLY BUILDERS, AND ONLY THOSE: with this round's FLY above round 4's and the other 64 below their own, P0 says A FLY-WIRED BUILDER ... BUILDS MORE (the ranks sum to 392) and P3 says LESS (16 above, 64 below)",
        flyOnly.P0.word === V.WORDS.P0[0] && flyOnly.P0.sumA === 392 && flyOnly.P3.word === V.WORDS.P3[1] && flyOnly.P3.above === 16 && flyOnly.P3.below === 64 && up.P0.word === V.WORDS.P0[0] && down.P0.word === V.WORDS.P0[1]);
    const homes = V.reading(file((arm, s) => r4(arm, s) + 0.005, (arm, s) => (s <= 12 ? 170 : 150)), before), lines = V.readingLines(homes).join("\n");
    ok("round 4's four tests are still made, against the lean in this round's own floors, with round 4's words; the reading says how many builders finish more plans than their round 4 selves (60 of 80 here: equal is not more) and round 4's arms' means and homes; and its lines say all of it",
        up.T3.word === V.WORDS.T3[0] && up.T3.above === 80 && up.T0.word === V.WORDS.T0[0] && V.WORDS.T1.includes(up.T1.word) && V.WORDS.T2.includes(up.T2.word) && homes.moreHomes === 60 && Math.abs(homes.before.FLY.mean - 0.98507) < 1e-4 && homes.before.MLP.homes === 2400 &&
        /builders that finish more of the 200 plans than their round 4 selves: 60 of 80/.test(lines) && /round 4's arms \(24 builders tried an iteration\): FLY 0\.9851, homes 2400/.test(lines) && /P3 \(every builder against its round 4 self\): of 80 pairs, 80 above, 0 below, 0 equal/.test(lines) && /P0 \(this round's FLY against round 4's FLY\): the ranks sum to 392/.test(lines) && /T3 \(all the builders against the lean\): of 80, 80 above/.test(lines) && lines.includes(V.WORDS.P0[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "WORM", "1"], ["job", "FLY", "x"], ["job", "FLY", "17"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for a registered arm and draw; eight other shapes are not words)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FLY", "16"])) === J({ cmd: "job", arm: "FLY", s: 16 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeVoxelHomeBoth.mjs");
    ok("!! the command is this round's -- its library, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, and READS ROUND 4'S FILE (the library's BEFORE) and hands its records to the reading",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/voxelHomeBoth\.mjs"/.test(csrc) && !/voxelHomeLong|voxelHomeLean|voxelHomeDrawn|voxelHomeSteps|"\.\/voxelHome\.mjs"/.test(csrc) && /path\.join\(ENG, PF\.BEFORE\)/.test(csrc) && /PF\.reading\(linesOf\(\), before\)/.test(csrc) && /usage: node tools\/ship\/takeVoxelHomeBoth\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/voxelHomeBoth-selfcheck.mjs"), calls = [...me.matchAll(/V4?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its three trainings are of 2 iterations with 8 or 4 builders on draw 901; this gate starts no process at all (the command is never run from here); and the file's size and time are what they were before this section",
        calls.length === 3 && calls.every((c) => /^"FLY", 901, TINY4?, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 8 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (round 6; the results were committed at 248bae41 before they were read, and are read here from the file)");
section(() => {
    const parse = (f) => src(f).split("\n").filter(Boolean).map((l) => JSON.parse(l)), bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = parse(V.RESULTS), before = parse(V.BEFORE), R = V.reading(lines, before), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, A = R.arms, draws = lines.filter((r) => r.kind === "draw"), old = before.filter((r) => r.kind === "draw");
    ok("!! the results file is the one the run wrote: 82 records, sha256 e79a779d3369c50c...", lines.length === 82 && createHash("sha256").update(bytes).digest("hex") === "e79a779d3369c50ccdabac18f1ddda3414807a7ad1b69315b30644dad833f069");
    ok("!! THE CHECKS HOLD: 80 draws each once, round 4's recipe with 96 builders tried, each arm's weight count and wiring, FLY draw 1 the same twice, the floors, a history in every record, the start the lean to the bit, and round 4's 80 draws", R.checks.length === 0 && V.ARMS.every((a) => R.floors.untrained[a] === R.floors.lean), R.checks.slice(0, 2).join(" | "));
    ok("!! *** P3: FROM THE LEAN, MORE BUILDERS TRIED BUILDS MORE OF A HOME *** -- 79 of the 80 builders score above their round 4 selves (the same arm, the same draw) and 1 below (SHUF draw 4, 0.9953 for 0.9961); exact two-sided p 1.3e-22",
        R.P3 && R.P3.word === V.WORDS.P3[0] && R.P3.above === 79 && R.P3.below === 1 && R.P3.ties === 0 && R.P3.p < 2e-22 && J(draws.filter((r) => r.score < old.find((o) => o.arm === r.arm && o.s === r.s).score).map((r) => [r.arm, r.s])) === J([["SHUF", 4]]));
    ok("!! *** P0: A FLY-WIRED BUILDER, FROM THE LEAN, MORE BUILDERS TRIED BUILDS MORE OF A HOME *** -- every one of the 16 FLY builders above every one of round 4's 16 (the ranks sum to 392; exact two-sided p 3.3e-9)", R.P0 && R.P0.word === V.WORDS.P0[0] && R.P0.sumA === 392 && R.P0.ties === 0 && R.P0.p < 4e-9);
    ok("!! round 4's four tests, made again: T0 and T3 -- every builder above the lean (16 of 16, 80 of 80); T1 and T2, THE WIRING -- THE FLY'S CANNOT BE TOLD APART FROM A SHUFFLE OF IT (the ranks sum to 287 with 2 ties; p 0.42) NOR FROM A PLAIN NET OF ITS SIZE (274.5 with 1 tie; p 0.72): the seventh round to say the first",
        R.T0.word === V.WORDS.T0[0] && R.T0.above === 16 && R.T3.word === V.WORDS.T3[0] && R.T3.above === 80 && R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 287 && R.T1.ties === 2 && near(R.T1.p, 0.42302) && R.T2.word === V.WORDS.T2[2] && R.T2.sumA === 274.5 && R.T2.ties === 1 && near(R.T2.p, 0.72398));
    ok("!! the arms' mean share of a home built, 16 draws each (mean, sd): SHUF 0.9971 0.0006, FLY 0.9973 0.0003, PLAIN 0.9973 0.0004, FISH 0.9973 0.0004, MLP 0.9973 0.0004 -- the five within two ten-thousandths of each other, every builder between 0.9953 and 0.9980; round 4's arms were 0.9879 to 0.9924",
        near(A.SHUF.mean, 0.9971) && near(A.SHUF.sd, 0.0006) && near(A.FLY.mean, 0.9973) && near(A.FLY.sd, 0.0003) && near(A.PLAIN.mean, 0.9973) && near(A.PLAIN.sd, 0.0004) && near(A.FISH.mean, 0.9973) && near(A.FISH.sd, 0.0004) && near(A.MLP.mean, 0.9973) && near(A.MLP.sd, 0.0004) &&
        near(Math.min(...draws.map((r) => r.score)), 0.9953) && near(Math.max(...draws.map((r) => r.score)), 0.9980) && near(R.before.SHUF.mean, 0.9879) && near(R.before.MLP.mean, 0.9924));
    const total = draws.reduce((n, r) => n + r.homes, 0), oldTotal = old.reduce((n, r) => n + r.homes, 0);
    ok("!! *** THE HOMES: 15,023 IN 16,000 BUILDS (round 4: 12,700) *** -- a builder finishes 188 of the 200 plans on average where round 4's finished 159 and the lean alone 123; the least finishes 179 and the best 192 (MLP draw 4); 79 of the 80 finish more than their round 4 selves (SHUF draw 4: 179 for 181); no builder finishes all 200, as the rule does",
        total === 15023 && oldTotal === 12700 && A.FLY.homes === 3009 && A.SHUF.homes === 2991 && A.PLAIN.homes === 3010 && A.FISH.homes === 3006 && A.MLP.homes === 3007 && Math.min(...draws.map((r) => r.homes)) === 179 && Math.max(...draws.map((r) => r.homes)) === 192 && draws.find((r) => r.homes === 192).arm === "MLP" && draws.find((r) => r.homes === 192).s === 4 && R.moreHomes === 79 && R.floors.leanHomes === 123);
    const H = (a) => A[a].history.map((h) => h.missing);
    ok("!! THE HISTORY: ALMOST ALL OF IT IN THE FIRST 25 ITERATIONS, THEN LEVEL -- every arm's share missing on the trainer's own battery is 0.12 to 0.14 at iteration 0, under 0.005 by iteration 25, and 0.0015 to 0.0033 at iteration 149 (round 4 was at 0.02 to 0.04 by iteration 25 and 0.009 to 0.014 at the end)",
        V.ARMS.every((a) => H(a).length === 7 && H(a)[0] > 0.12 && H(a)[0] < 0.14 && H(a)[1] < 0.005 && H(a)[6] > 0.0014 && H(a)[6] < 0.0034) && near(H("FLY")[1], 0.0039) && near(H("FLY")[6], 0.0023) && near(H("PLAIN")[6], 0.0015));
    const again = V.ARMS.flatMap((arm) => [4, 11].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore(p); return [arm, s, a.score === r.score && a.homes === r.homes]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS HOMES AGAIN: draws 4 and 11 of every arm (the best builder and the one below its round 4 self among them), audited here on the 200 plans through the wrapped builder, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/VOXEL_HOME_BOTH_WIP.md"), res = note.slice(note.indexOf("## 8. The result"));
    ok("the expectations, written before the tool, against what came: P3 MORE was given 65 percent and P0 MORE 45 -- both came; T0 and T3 MORE the 97, T1 and T2 CANNOT the 80 -- all came; the mean homes a builder finishes above 170 was given 50 and above 185 only 12, and it is 188; a builder that finishes all 200 was given 5, and there is none",
        /P3: MORE about 65 percent/.test(note) && /P0: MORE about 45/.test(note) && /above 170 of 200\s+\(round 4: 159\): about 50 percent; above 185: about 12/.test(note) && /A builder that finishes all 200: about 5/.test(note) && total / 80 > 185 && Math.max(...draws.map((r) => r.homes)) < 200);
    ok("the registration's RESULT SECTION (section 8, and not the list of possible words in section 2) carries the six readings' words", /## 8\. The result/.test(note) && [["P3", R.P3.word], ["P0", R.P0.word], ["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word], ["T3", R.T3.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)));
});

console.log(`\nvoxelHomeBoth-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
