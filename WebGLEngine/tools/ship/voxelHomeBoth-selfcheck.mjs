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
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and round 1's run whole for each; every one red by name (the number is the rows):
//   B1 round 6 tries 24 builders after all 1 | B2 not started at the lean 5 | B3 writes round 4's results file 1 | B4 round 4's file not checked 1 | B5 P3 against the round 4 builder of draw 1 1
//   B6 P3's MORE and LESS each other's 3 | B7 P0 reads every arm 2 | B8 P0's MORE and LESS each other's 2 | B9 the tests made with a check failed 1 | B10 round 4's tests kept with a check failed 1
//   B11 a builder with as many homes counts as more 1 | B12 the command reads no earlier file 1 | B13 the command reads round 4's library 1 | B14 the command exits 0 on a word it does not know 1 (round 1's gate)
//   B15 P3's lines not printed 1 | B16 P3 a sign test against the lean, not round 4 3
"use strict";
import fs from "node:fs";
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

console.log(`\nvoxelHomeBoth-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
