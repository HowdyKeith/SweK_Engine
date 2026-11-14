// WebGLEngine/tools/ship/voxelHomeSteps-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/voxelHomeSteps-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 1 and 2 iterations on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE VOXEL HOME'S ROUND 5, THE TRAINER'S STEP AND ITS SAMPLES (registered in brain/VOXEL_HOME_STEPS_WIP.md before tools/ship/voxelHomeSteps.mjs existed). Each setting is
// tools/ship/voxelHome.mjs's makeRound() with round 2's cfg and one key, so what the gates of rounds 1 to 4 hold of the shared code is held here; this gate holds the two keys and the round's own shape.
//   1  THE ROUND'S NUMBERS   two settings, each one number from round 2's recipe; two arms; round 2's file as the control; the no-signal move the registration states, as arithmetic
//   2  ONE TRAINING          the setting's number reaches the trainer: a quarter of the step is a quarter of the first move, to the float; more builders tried is another training
//   3  THE RECORDS           the registration's checks, each failing by name; the four rank-sums against round 2's own arm and their words
//   4  THE COMMAND           its words as arithmetic; it is this round's; this gate starts no training of the round's and no process (the command as a process: tools/ship/voxelHome-selfcheck.mjs section 4)
//   5  THE VERDICT           the committed results, read from the file: the four tests, the cells beside round 2's and round 3's, the history, the expectations
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and round 1's run whole for each; the number is the rows that went red:
//   Q1 a cfg's step ignored 3 | Q2 a cfg's count of builders ignored 3 | Q3 SMALL half the step, not a quarter 3 | Q4 MANY 48 builders 3 | Q5 SMALL changes the count of builders too 3
//   Q6 every training is MANY's round 1 | Q7 a record carries no setting 1 | Q8 every test reads round 2's FLY 1 | Q9 MORE and LESS each other's 3 | Q10 the tests made with a check failed 1
//   Q11 the recipe check gone 1 | Q12 round 2's file not checked 2 | Q13 MANY's tests read SMALL's cells 1 | Q14 writes round 2's results file 1 | Q15 a third arm 7 | Q16 the command trains every job as SMALL 1
//   Q17 the command exits 0 on a word it does not know 1 (in tools/ship/voxelHome-selfcheck.mjs) | Q18 makeRound takes an odd count of builders 1 | Q19 the history check gone 1
//   Q20 the trainer's move ignores the step (brain/rl/dockPolicy.js) 1 | Q22 the command reads no control 1 | Q23 the wiring check gone 1 | Q21' the recheck may be any cell's 1
//   ONE WENT 0 RED, AND IS A ROW NOW: Q21 -- no broken file here had a recheck that named another cell; the row "a recheck that says it is MANY's" is that file. Q21' is Q21 again.
//   THE VERDICT'S (section 5, 2026-11-14), this gate run whole for each, every one red by name: V1 a MANY FLY score in the file lowered to 0.60 4 | V2 a SMALL PLAIN builder given a home in the file 2
//   V3 a round 2 PLAIN score in round 2's file raised to 0.80 3 | V4 MORE and LESS each other's 5 | V5 SMALL's tests read MANY's cells 3 | V6 the note's M-FLY says CANNOT 1 | V7 the note's S-PLAIN says LESS 1
//   V8 the audit is of the named environment 2
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./voxelHomeSteps.mjs";
import * as V2 from "./voxelHomeDrawn.mjs";
import * as V0 from "./voxelHome.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as B from "../../brain/rl/buildEnv.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a);
const TINY = Object.freeze({ maxSteps: 12, iters: 1, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2 }), TINY_SMALL = Object.freeze({ ...TINY, lr: 0.0125 }), TINY_MANY = Object.freeze({ ...TINY, iters: 2, pop: 8 }), TINY_TWO = Object.freeze({ ...TINY, iters: 2 }), TINY_AUDIT = [880001, 880002, 880003];

console.log("voxelHomeSteps-selfcheck -- round 5 of the voxel home (the trainer's step and its samples): the numbers, one training, the records, the command (the round itself is never run here)\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/VOXEL_HOME_STEPS_WIP.md");
    ok("!! TWO SETTINGS, EACH ONE NUMBER FROM ROUND 2'S RECIPE: SMALL is lr 0.0125 for 0.05 and nothing else; MANY is pop 96 for 24 and nothing else; the control is round 2's recipe; 150 iterations all three -- and the registration says both",
        J(V.SETTINGS) === J(["SMALL", "MANY"]) && J(V.RECIPES.SMALL) === J({ ...V2.RECIPE, lr: 0.0125 }) && J(V.RECIPES.MANY) === J({ ...V2.RECIPE, pop: 96 }) && J(V.RECIPES.control) === J(V2.RECIPE) && V2.RECIPE.lr === 0.05 && V2.RECIPE.pop === 24 && V2.RECIPE.iters === 150 && /\*\*SMALL\*\* \| `lr 0\.0125`/.test(note) && /\*\*MANY\*\* \| `pop 96`/.test(note));
    ok("two arms, FLY and PLAIN, with round 2's weight counts; four cells; round 2's draws, audit plans and alpha; this round's results file and round 2's as the control; the builders are round 2's untrained ones, weight for weight",
        J(V.ARMS) === J(["FLY", "PLAIN"]) && J(V.CELLS) === J([["SMALL", "FLY"], ["SMALL", "PLAIN"], ["MANY", "FLY"], ["MANY", "PLAIN"]]) && J(V.WEIGHTS) === J({ FLY: 2967, PLAIN: 2962 }) && J(V.SEEDS) === J(V2.SEEDS) && J(V.AUDIT) === J(V2.AUDIT) && V.ALPHA === 0.01 && V.RESULTS === "brain/voxelHomeStepsRound.jsonl" && V.BEFORE === V2.RESULTS &&
        note.includes("`" + V.RESULTS + "`") && note.includes("`" + V.BEFORE + "`") && V.ARMS.every((a) => J(arr(V.policyOf(a, 2).getParams())) === J(arr(V2.policyOf(a, 2).getParams()))) && J(V.auditScore(V.policyOf("FLY", 1), TINY_AUDIT, 12)) === J(V2.auditScore(V2.policyOf("FLY", 1), TINY_AUDIT, 12)));
    ok("the words are the registration's: a setting's three, the same for both its arms", J(V.WORDS.SMALL) === J(["A SMALLER STEP BUILDS MORE OF A HOME", "A SMALLER STEP BUILDS LESS OF A HOME", "A SMALLER STEP CANNOT BE TOLD APART FROM ROUND 2'S"]) && J(V.WORDS.MANY) === J(["MORE BUILDERS TRIED BUILDS MORE OF A HOME", "MORE BUILDERS TRIED BUILDS LESS OF A HOME", "MORE BUILDERS TRIED CANNOT BE TOLD APART FROM ROUND 2'S"]) && [...V.WORDS.SMALL, ...V.WORDS.MANY].every((w) => note.includes("`" + w + "`")));
    const move = (r) => r.lr / (r.sigma * Math.sqrt(r.pop));
    ok("!! THE NO-SIGNAL MOVE THE REGISTRATION STATES IS THE RECIPES' ARITHMETIC, lr / (sigma x sqrt(pop)): round 2's about 0.073 a weight an iteration, SMALL's a quarter of it (0.018), MANY's a half (0.036) -- and the note says a smaller sigma would make it LARGER",
        Math.abs(move(V.RECIPES.control) - 0.0729) < 1e-4 && Math.abs(move(V.RECIPES.SMALL) / move(V.RECIPES.control) - 0.25) < 1e-12 && Math.abs(move(V.RECIPES.MANY) / move(V.RECIPES.control) - 0.5) < 1e-12 && /about 0\.073/.test(note) && /about 0\.018 \(a quarter\)/.test(note) && /about 0\.036 \(a half\)/.test(note) && /a smaller `sigma` makes the steps LARGER/.test(note));
    ok("makeRound takes a step that is a number above 0 and a count of builders that is even and at least 2, or neither: it refuses lr 0, a lr that is not a number, pop 7 and pop 0", [{ lr: 0 }, { lr: "small" }, { pop: 7 }, { pop: 0 }].every((k) => throws(() => V0.makeRound({ ...V2.ROUND2, ...k }), /a cfg is/)) && V0.makeRound({ ...V2.ROUND2, lr: 0.1, pop: 2 }).RECIPE.lr === 0.1);
});

console.log("\n2. ONE TRAINING (1 and 2 iterations, on draw 901)");
section(() => {
    const small = V.trainOne("SMALL", "FLY", 901, TINY_SMALL, TINY_AUDIT), ctrl = V2.trainOne("FLY", 901, TINY, TINY_AUDIT), many = V.trainOne("MANY", "PLAIN", 901, TINY_MANY, TINY_AUDIT), two = V2.trainOne("PLAIN", 901, TINY_TWO, TINY_AUDIT);
    const w0 = arr(V2.policyOf("FLY", 901).getParams()), ws = arr(PF.unpackWeights(small.weights)), wc = arr(PF.unpackWeights(ctrl.weights));
    let worst = 0, moved = 0; for (let i = 0; i < w0.length; i++) { const a = (ws[i] - w0[i]) * 4, b = wc[i] - w0[i]; worst = Math.max(worst, Math.abs(a - b)); if (b !== 0) moved++; }
    ok("!! *** THE SETTING'S NUMBER REACHES THE TRAINER: A QUARTER OF THE STEP IS A QUARTER OF THE FIRST MOVE *** -- one iteration from the same start with the same noise: every weight's move at lr 0.0125, times 4, is its move at lr 0.05 (to a float's rounding), and every weight moved", worst < 2e-6 && moved === w0.length && small.weightsHash !== ctrl.weightsHash, `worst difference ${worst.toExponential(1)}, ${moved} of ${w0.length} moved`);
    const c = P.ARMS.FLY(901), direct = trainDockES({ envFactory: (o = {}) => new B.BuildEnv({ maxSteps: 12, choice: "drawn", ...o }), obsDim: 40, actDim: 36, maxSteps: 12, iters: 1, pop: 4, sigma: 0.14, lr: 0.0125, trainEps: 2, seed: 901, policyFactory: ({ obsDim, actDim, seed }) => new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed }) });
    ok("!! A RECORD IS ITS SETTING'S, ITS ARM'S AND ITS DRAW'S: it carries the setting and the recipe it was trained with, its weights are the trainer's called here by hand with that recipe, with the arm's weight count, its wiring and the trainer's history",
        small.setting === "SMALL" && small.arm === "FLY" && small.s === 901 && J(small.recipe) === J(TINY_SMALL) && PF.hashWeights(direct.params) === small.weightsHash && small.weightCount === 2967 && small.edges === 313 && J(small.history.map((h) => h.it)) === J([0]) && many.setting === "MANY" && many.arm === "PLAIN" && many.weightCount === 2962 && many.edges === 0 && J(many.recipe) === J(TINY_MANY));
    ok("!! MORE BUILDERS TRIED IS ANOTHER TRAINING: PLAIN draw 901 with 8 builders an iteration ends at other weights than with 4 (the same start, 2 iterations), and its weights give its score again", many.weightsHash !== two.weightsHash && (() => { const p = V.policyOf("PLAIN", 901); p.setParams(PF.unpackWeights(many.weights)); const a = V.auditScore(p, TINY_AUDIT, 12); return a.score === many.score && a.homes === many.homes; })());
    const lib = src("tools/ship/voxelHomeSteps.mjs");
    ok("!! WITH NO RECIPE HANDED IN A TRAINING USES ITS SETTING'S REGISTERED ONE (read from the source: this gate never trains at it), and a setting or an arm that is not the round's is refused by name",
        /R\.trainOne\(arm, s, recipe === undefined \? R\.RECIPE : recipe, audit === undefined \? R\.AUDIT : audit\)/.test(lib) && /const R = ROUNDS\[setting\];/.test(lib) && /SMALL: makeRound\(\{ \.\.\.base, lr: 0\.0125 \}\), MANY: makeRound\(\{ \.\.\.base, pop: 96 \}\)/.test(lib) && throws(() => V.trainOne("HUGE", "FLY", 901, TINY, TINY_AUDIT), /no setting HUGE/) && throws(() => V.trainOne("SMALL", "SHUF", 901, TINY, TINY_AUDIT), /no arm SHUF/));
});

console.log("\n3. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, missing: 0.4 - k / 100 - s / 10000 }));
    const rec = (x, arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "PLAIN" ? { units: 38, edges: [] } : P.ARMS.FLY(s); return { kind: "draw", setting: x, arm, s, recipe: { ...V.RECIPES[x] }, units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), trainerBest: null, score, homes: 0, history: hist(s) }; };
    const file = (scoreOf) => { const out = []; for (const [x, a] of V.CELLS) for (const s of V.SEEDS) out.push(rec(x, a, s, scoreOf(x, a, s))); out.push({ kind: "recheck", setting: "SMALL", arm: "FLY", s: 1, weightsHash: out.find((r) => r.setting === "SMALL" && r.arm === "FLY" && r.s === 1).weightsHash }); return out; };
    const beforeOf = (fly, plain) => V.SEEDS.flatMap((s) => [{ kind: "draw", arm: "FLY", s, score: fly + s / 10000, homes: 0 }, { kind: "draw", arm: "PLAIN", s, score: plain + s / 10000, homes: 0 }, { kind: "draw", arm: "SHUF", s, score: 0.99, homes: 0 }]).concat([{ kind: "floors", random: Array(16).fill(0.57), lean: 0.92, leanHomes: 123 }]);
    const jit = (x, a, s) => ((s * 7 + (x === "MANY" ? 5 : 0) + (a === "PLAIN" ? 3 : 0)) % 16) / 100000, good = file((x, a, s) => 0.72 + jit(x, a, s)), before = beforeOf(0.66, 0.69), clone = () => JSON.parse(J(good)), at = (L, x, a, s) => L.find((r) => r.setting === x && r.arm === a && r.s === s);
    ok("!! a file of 64 draws with their histories and the recheck, beside round 2's 16 FLY and 16 PLAIN draws, passes every check", V.checkRecords(good, before).length === 0 && good.length === 65, V.checkRecords(good, before).slice(0, 2).join(" | "));
    const broken = [
        ["a draw missing", (L) => { L.splice(L.indexOf(at(L, "MANY", "FLY", 9)), 1); }, before, /MANY FLY draw 9 is there 0 times/],
        ["a draw twice", (L) => { L.push(JSON.parse(J(at(L, "SMALL", "PLAIN", 4)))); }, before, /SMALL PLAIN draw 4 is there 2 times/],
        ["a SMALL draw trained with MANY's recipe", (L) => { at(L, "SMALL", "FLY", 3).recipe = { ...V.RECIPES.MANY }; }, before, /SMALL FLY draw 3 was trained with another recipe/],
        ["a MANY draw trained with round 2's recipe", (L) => { at(L, "MANY", "PLAIN", 3).recipe = { ...V.RECIPES.control }; }, before, /MANY PLAIN draw 3 was trained with another recipe/],
        ["an arm the round has not", (L) => { at(L, "SMALL", "FLY", 5).arm = "SHUF"; }, before, /SMALL SHUF draw 5 is not a registered draw/],
        ["weights that are not the record's hash", (L) => { at(L, "MANY", "FLY", 2).weightsHash = "0000000000000000"; }, before, /MANY FLY draw 2's weights are not 2967 finite numbers with its hash/],
        ["a PLAIN draw with the fly's wiring", (L) => { const r = at(L, "SMALL", "PLAIN", 6), f = at(L, "SMALL", "FLY", 6); r.edges = f.edges; r.edgesHash = f.edgesHash; }, before, /SMALL PLAIN draw 6's wiring is not its arm's/],
        ["a score above 1", (L) => { at(L, "MANY", "PLAIN", 8).score = 1.2; }, before, /MANY PLAIN draw 8 has no score that is a share/],
        ["no history", (L) => { delete at(L, "SMALL", "FLY", 7).history; }, before, /SMALL FLY draw 7 has no history from iteration 0 to 149/],
        ["no recheck", (L) => { L.splice(L.findIndex((r) => r.kind === "recheck"), 1); }, before, /SMALL FLY draw 1 trained a second time is not there once/],
        ["a recheck with other weights", (L) => { L.find((r) => r.kind === "recheck").weightsHash = "ffff"; }, before, /SMALL FLY draw 1 trained a second time/],
        ["a recheck that says it is MANY's", (L) => { L.find((r) => r.kind === "recheck").setting = "MANY"; }, before, /SMALL FLY draw 1 trained a second time/],
        ["round 2's file without one PLAIN draw", () => {}, before.filter((r) => !(r.arm === "PLAIN" && r.s === 9)), /round 2's file \(brain\/voxelHomeDrawnRound\.jsonl\) does not hold its 16 PLAIN draws, each once/],
        ["round 2's file not handed in", () => {}, null, /does not hold its 16 FLY draws/],
    ];
    const res = broken.map(([name, f, bf, re]) => { const L = clone(); f(L); const bad = V.checkRecords(L, bf); return [name, bad.some((b) => re.test(b)), bad[0]]; });
    ok(`!! EACH CHECK FAILS BY NAME (${broken.length}: ${broken.map((b) => b[0]).join("; ")})`, res.every((r) => r[1]), res.filter((r) => !r[1]).map((r) => `${r[0]}: ${r[2]}`).join(" | "));
    const Rbad = V.reading(good, null), R0 = V.reading(good, before);
    ok("!! WITH A FAILED CHECK THE READING IS NOT WEIGHED: no test of the four is made, and the first line says so", J(Object.keys(Rbad.tests)) === J(["S-FLY", "S-PLAIN", "M-FLY", "M-PLAIN"]) && Object.values(Rbad.tests).every((t) => t === null) && /A CHECK FAILED/.test(V.readingLines(Rbad)[0]) && Object.values(R0.tests).every((t) => t !== null));
    ok("!! A TEST IS A SETTING'S ARM AGAINST ROUND 2'S OWN ARM: all four cells above round 2's -> each setting's MORE; all below -> LESS; among them -> CANNOT BE TOLD APART; and round 2's other arms (its SHUF, at 0.99 here) move nothing",
        J(Object.values(R0.tests).map((t) => t.word)) === J([V.WORDS.SMALL[0], V.WORDS.SMALL[0], V.WORDS.MANY[0], V.WORDS.MANY[0]]) && R0.tests["S-FLY"].sumA === 392 && J(Object.values(V.reading(good, beforeOf(0.8, 0.8)).tests).map((t) => t.word)) === J([V.WORDS.SMALL[1], V.WORDS.SMALL[1], V.WORDS.MANY[1], V.WORDS.MANY[1]]) &&
        Object.values(V.reading(file((x, a, s) => 0.66 + ((s * 5) % 16) / 10000), beforeOf(0.66, 0.66)).tests).every((t) => t.word === V.WORDS[t.setting][2]));
    const one = V.reading(file((x, a, s) => (x === "MANY" && a === "PLAIN" ? 0.75 : 0.60) + jit(x, a, s)), beforeOf(0.66, 0.69)), cross = V.reading(file((x, a, s) => (a === "FLY" ? 0.68 : 0.67) + jit(x, a, s)), beforeOf(0.66, 0.69));
    ok("!! EACH TEST READS ITS OWN CELL AND ITS OWN CONTROL: with only MANY's PLAIN above round 2's and the other three cells below, M-PLAIN alone says MORE; and with every FLY cell at 0.68 and every PLAIN cell at 0.67, the FLY tests say MORE (round 2's FLY is 0.66) and the PLAIN tests LESS (round 2's PLAIN is 0.69)",
        J(Object.values(one.tests).map((t) => t.word)) === J([V.WORDS.SMALL[1], V.WORDS.SMALL[1], V.WORDS.MANY[1], V.WORDS.MANY[0]]) && J(Object.values(cross.tests).map((t) => t.word)) === J([V.WORDS.SMALL[0], V.WORDS.SMALL[1], V.WORDS.MANY[0], V.WORDS.MANY[1]]));
    const lines = V.readingLines(R0).join("\n"), h = R0.cells["SMALL FLY"].history, mean0 = V.SEEDS.reduce((a, s) => a + (0.4 - s / 10000), 0) / 16;
    ok("the reading carries each cell's mean, homes and history (the mean over its 16 draws at each point), round 2's two arms beside them and round 2's floors, and its lines say all of it and the four tests by name", Object.keys(R0.cells).length === 4 && Math.abs(R0.cells["MANY PLAIN"].mean - 0.72) < 1e-3 && h.length === 7 && Math.abs(h[0].missing - mean0) < 1e-12 && Math.abs(R0.control.FLY.mean - (0.66 + 8.5 / 10000)) < 1e-12 && R0.floors.lean === 0.92 &&
        /SMALL FLY +16 +0\.72/.test(lines) && /round 2 FLY +16 +0\.6609/.test(lines) && /round 2's floors: 16 random builders 0\.5700; the lean, no network 0\.9200, homes 123 of 200/.test(lines) && /SMALL FLY +the trainer's own battery, share missing at iteration 0: /.test(lines) && /M-PLAIN \(MANY's PLAIN against round 2's PLAIN\): the ranks sum to 392/.test(lines) && lines.includes(V.WORDS.MANY[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "FLY", "1"], ["job", "SMALL", "SHUF", "1"], ["job", "HUGE", "FLY", "1"], ["job", "SMALL", "FLY", "x"], ["job", "SMALL", "FLY", "17"], ["job", "SMALL", "FLY", "1", "2"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("!! THE COMMAND'S WORDS, AS ARITHMETIC (parseArgs, never the command): run is four processes or --jobs of at least 1, read takes nothing, job takes a setting, one of the round's two arms and a draw 1 to 16 -- and eleven other shapes are not words",
        J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "MANY", "PLAIN", "16"])) === J({ cmd: "job", setting: "MANY", arm: "PLAIN", s: 16 }) && no.every((a) => V.parseArgs(a) === null) && V.parseArgs("run") === null);
    const csrc = src("tools/ship/takeVoxelHomeSteps.mjs");
    ok("!! the command is this round's -- its library, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, trains a job with its setting, runs the four cells' draws, and reads round 2's file (the library's BEFORE) for the control",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/voxelHomeSteps\.mjs"/.test(csrc) && !/voxelHomeLong|voxelHomeLean|"\.\/voxelHomeDrawn\.mjs"|"\.\/voxelHome\.mjs"/.test(csrc) && /PF\.trainOne\(args\.setting, args\.arm, args\.s\)/.test(csrc) &&
        /for \(const \[setting, arm\] of PF\.CELLS\) for \(const s of PF\.SEEDS\)/.test(csrc) && /path\.join\(ENG, PF\.BEFORE\)/.test(csrc) && /PF\.reading\(linesOf\(\), before\)/.test(csrc) && /usage: node tools\/ship\/takeVoxelHomeSteps\.mjs run \[--jobs N\] \| read \| job SETTING ARM S/.test(csrc));
    const me = src("tools/ship/voxelHomeSteps-selfcheck.mjs"), calls = [...me.matchAll(/V2?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its trainings are of 1 and 2 iterations with 4 or 8 builders on draw 901 or refused before they start; this gate starts no process at all (the command is never run from here); and the file's size and time are what they were before this section",
        calls.length === 6 && calls.every((c) => /901, TINY(_SMALL|_MANY|_TWO)?, TINY_AUDIT$/.test(c)) && TINY.iters === 1 && TINY_MANY.iters === 2 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (round 5; the results were committed at 8e362d0e before they were read, and are read here from the file)");
section(() => {
    const parse = (f) => src(f).split("\n").filter(Boolean).map((l) => JSON.parse(l)), bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = parse(V.RESULTS), before = parse(V.BEFORE), R = V.reading(lines, before), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, T = R.tests, C = R.cells;
    ok("!! the results file is the one the run wrote: 65 records, sha256 910dd28fa016fe2c...", lines.length === 65 && createHash("sha256").update(bytes).digest("hex") === "910dd28fa016fe2c5b09b8a0b2aa07622ae95c5fa7a5da17add9feb628807ff8");
    ok("!! THE CHECKS HOLD: 64 draws each once, each setting's recipe, each arm's weight count and wiring, SMALL FLY draw 1 the same twice, a history in every record, round 2's 16 FLY and 16 PLAIN draws", R.checks.length === 0, R.checks.slice(0, 2).join(" | "));
    ok("!! *** M-FLY AND M-PLAIN: MORE BUILDERS TRIED BUILDS MORE OF A HOME *** -- with 96 builders tried an iteration for 24, every one of the 16 builders of each arm is above every one of round 2's 16 of that arm (the ranks sum to 392, the most there is; exact two-sided p 3.3e-9, twice)",
        T["M-FLY"].word === V.WORDS.MANY[0] && T["M-PLAIN"].word === V.WORDS.MANY[0] && T["M-FLY"].sumA === 392 && T["M-PLAIN"].sumA === 392 && T["M-FLY"].ties === 0 && T["M-PLAIN"].ties === 0 && T["M-FLY"].p < 4e-9);
    ok("!! *** S-FLY AND S-PLAIN: A SMALLER STEP CANNOT BE TOLD APART FROM ROUND 2'S *** -- a quarter of the step: FLY's ranks sum to 269 (the middle is 264; p 0.87), PLAIN's to 219 (p 0.094, its mean a hundredth lower)", T["S-FLY"].word === V.WORDS.SMALL[2] && T["S-PLAIN"].word === V.WORDS.SMALL[2] && T["S-FLY"].sumA === 269 && near(T["S-FLY"].p, 0.86718) && T["S-PLAIN"].sumA === 219 && near(T["S-PLAIN"].p, 0.09381) && C["SMALL PLAIN"].mean < R.control.PLAIN.mean);
    const rm = R.floors.random.reduce((a, b) => a + b, 0) / 16, way = (m) => (m - rm) / (R.floors.lean - rm);
    ok("!! the cells' mean share of a home built, 16 draws each (mean, sd), beside round 2's own arm: SMALL FLY 0.6677 0.0130 and MANY FLY 0.7140 0.0146 against 0.6664; SMALL PLAIN 0.6794 0.0177 and MANY PLAIN 0.7452 0.0137 against 0.6905 -- MANY adds 0.048 and 0.055; and MANY's PLAIN stands 0.49 of the way from a random builder (0.572) to the lean (0.923), where round 2's stood a third",
        near(C["SMALL FLY"].mean, 0.6677) && near(C["SMALL FLY"].sd, 0.0130) && near(C["MANY FLY"].mean, 0.7140) && near(C["MANY FLY"].sd, 0.0146) && near(C["SMALL PLAIN"].mean, 0.6794) && near(C["SMALL PLAIN"].sd, 0.0177) && near(C["MANY PLAIN"].mean, 0.7452) && near(C["MANY PLAIN"].sd, 0.0137) && near(R.control.FLY.mean, 0.6664) && near(R.control.PLAIN.mean, 0.6905) &&
        near(C["MANY FLY"].mean - R.control.FLY.mean, 0.0476, 5e-4) && near(C["MANY PLAIN"].mean - R.control.PLAIN.mean, 0.0547, 5e-4) && near(way(C["MANY PLAIN"].mean), 0.4935, 5e-4) && near(way(R.control.PLAIN.mean), 0.3375, 5e-4));
    const r3 = parse("brain/voxelHomeLongRound.jsonl").filter((r) => r.kind === "draw"), m3 = (a) => r3.filter((r) => r.arm === a).reduce((n, r) => n + r.score, 0) / 16;
    ok("!! *** FOUR TIMES THE BUILDERS FOR 150 ITERATIONS BUILDS MORE THAN 1,000 ITERATIONS OF ROUND 2'S TRAINER DID *** -- from round 3's own file: FLY 0.7140 here against 0.6869 there, PLAIN 0.7452 against 0.7010, at 0.6 of round 3's cost (96 x 150 builders tried against 24 x 1,000)",
        near(m3("FLY"), 0.6869) && near(m3("PLAIN"), 0.7010) && C["MANY FLY"].mean > m3("FLY") + 0.025 && C["MANY PLAIN"].mean > m3("PLAIN") + 0.04 && V.RECIPES.MANY.pop * V.RECIPES.MANY.iters / (24 * 1000) === 0.6);
    const draws = lines.filter((r) => r.kind === "draw"), homes = draws.filter((r) => r.homes > 0).map((r) => `${r.setting} ${r.arm} ${r.s} ${r.homes}`);
    ok("one home in 12,800 builds (a MANY PLAIN builder's, one of its 200 plans), and the lean alone finishes 123 of 200: neither setting comes near what a start at the lean did in round 4", homes.length === 1 && /^MANY PLAIN \d+ 1$/.test(homes[0]) && C["MANY PLAIN"].homes === 1 && C["SMALL FLY"].homes + C["SMALL PLAIN"].homes + C["MANY FLY"].homes === 0 && R.floors.leanHomes === 123, homes.join(", "));
    const H = (c) => C[c].history.map((h) => h.missing);
    ok("!! THE HISTORY: NEITHER SETTING HAD LEVELLED AT 150 -- on the trainer's own battery the share missing is still falling in every cell (the last reading below the one before it): SMALL FLY 0.4358 to 0.2927, SMALL PLAIN 0.4443 to 0.2791, MANY FLY 0.4114 to 0.2383, MANY PLAIN 0.4145 to 0.2042; SMALL is where round 2's trainer was, by a slower road, and MANY is below where 1,000 iterations left round 3 (FLY 0.2664, PLAIN 0.2548)",
        Object.keys(C).every((c) => H(c).length === 7 && H(c)[6] < H(c)[5] && H(c)[5] < H(c)[4]) && near(H("SMALL FLY")[0], 0.4358) && near(H("SMALL FLY")[6], 0.2927) && near(H("SMALL PLAIN")[0], 0.4443) && near(H("SMALL PLAIN")[6], 0.2791) && near(H("MANY FLY")[0], 0.4114) && near(H("MANY FLY")[6], 0.2383) && near(H("MANY PLAIN")[0], 0.4145) && near(H("MANY PLAIN")[6], 0.2042) && H("MANY FLY")[6] < 0.2664 && H("MANY PLAIN")[6] < 0.2548);
    const again = V.CELLS.flatMap(([x, a]) => [4, 12].map((s) => { const r = draws.find((d) => d.setting === x && d.arm === a && d.s === s), p = V.policyOf(a, s); p.setParams(PF.unpackWeights(r.weights)); const au = V.auditScore(p); return [x, a, s, au.score === r.score && au.homes === r.homes]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS HOMES AGAIN: draws 4 and 12 of every cell, audited here on the 200 plans, to the bit", again.every((x) => x[3]), again.filter((x) => !x[3]).map((x) => x.slice(0, 3).join(" ")).join(", "));
    const note = src("brain/VOXEL_HOME_STEPS_WIP.md"), res = note.slice(note.indexOf("## 9. The result"));
    ok("the expectations, written before the tool, against what came: MANY builds more in either arm was given 70 percent and in both 55 -- both came; SMALL was MORE 35, LESS 30, cannot tell 35 -- cannot tell came; the best cell above 0.75 was given 35 and is 0.745; any home 30, and there is one; neither setting building more 20, and it did not come",
        /MANY builds more than round 2 \(either arm\): about 70 percent; both arms: about 55/.test(note) && /SMALL builds more: about 35 percent, LESS about\s+30/.test(note) && /above 0\.75: about 35 percent/.test(note) && /Any home: about 30 percent/.test(note) && Math.max(...Object.values(C).map((c) => c.mean)) < 0.75);
    ok("the registration's RESULT SECTION (section 9, and not the list of possible words in section 3) carries the four readings' words", /## 9\. The result/.test(note) && Object.entries(T).every(([name, t]) => res.includes(`**${name}: ${t.word}**`)));
});

console.log(`\nvoxelHomeSteps-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
