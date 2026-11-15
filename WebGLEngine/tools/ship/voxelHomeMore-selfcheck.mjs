// WebGLEngine/tools/ship/voxelHomeMore-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/voxelHomeMore-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 1 to 4 iterations on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE VOXEL HOME'S ROUND 7 (registered in brain/VOXEL_HOME_MORE_WIP.md before tools/ship/voxelHomeMore.mjs existed): 384 builders tried an iteration against round 5's 96, and the quarter step
// for 600 iterations against round 2. Each setting is tools/ship/voxelHome.mjs's makeRound() with round 2's cfg and its keys; this gate holds the keys and the round's own shape, above all WHICH RECORDS
// each test is read against.
//   1  THE ROUND'S NUMBERS   two settings; two arms; where each setting's control is
//   2  ONE TRAINING          each setting's numbers reach the trainer
//   3  THE RECORDS           the checks, each failing by name; each test against its own control and no other
//   4  THE COMMAND           its words as arithmetic; it is this round's and reads both earlier files; no training of the round's, no process
// SABOTAGE LOG (2026-11-15) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and round 1's run whole for each; every one red by name (the number is the rows):
//   M1 HUGE 96 builders 2 | M2 SLOW 150 iterations 6 | M3 SLOW round 2's step 2 | M4 HUGE read against round 5's SMALL 5 | M5 HUGE read against round 2 5 | M6 a control takes any setting's draws 4
//   M7 every test reads HUGE's control 2 | M8 every test reads the FLY control 1 | M9 MORE and LESS each other's 3 | M10 the tests made with a check failed 1 | M11 the controls not checked 2
//   M12 the recipe not checked 1 | M13 every training HUGE's round 1 | M14 the recheck any cell's 1 | M15 the command hands every setting round 2's file 1
//   M16 the command exits 0 on a word it does not know 1 (round 1's gate) | M17 writes round 5's results file 1 | M18 a history may end anywhere 1
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./voxelHomeMore.mjs";
import * as V5 from "./voxelHomeSteps.mjs";
import * as V2 from "./voxelHomeDrawn.mjs";
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
const TINY = Object.freeze({ maxSteps: 12, iters: 1, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2 }), TINY_HUGE = Object.freeze({ ...TINY, pop: 16 }), TINY_SLOW = Object.freeze({ ...TINY, lr: 0.0125, iters: 4 }), TINY_AUDIT = [880001, 880002, 880003];

console.log("voxelHomeMore-selfcheck -- round 7 of the voxel home (384 builders tried; the quarter step for 600 iterations): the numbers, one training, the records, the command (the round itself is never run here)\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/VOXEL_HOME_MORE_WIP.md");
    ok("!! TWO SETTINGS, EACH ROUND 2'S RECIPE WITH ITS OWN KEYS AND NOTHING ELSE: HUGE is pop 384 (round 5's MANY: 96) at round 2's step and 150 iterations; SLOW is round 5's SMALL step, lr 0.0125, for 600 iterations where it had 150, with round 2's 24 builders -- and the registration says both",
        J(V.SETTINGS) === J(["HUGE", "SLOW"]) && J(V.RECIPES.HUGE) === J({ ...V2.RECIPE, pop: 384 }) && J(V.RECIPES.SLOW) === J({ ...V2.RECIPE, iters: 600, lr: 0.0125 }) && V5.RECIPES.MANY.pop === 96 && V5.RECIPES.SMALL.lr === 0.0125 && V5.RECIPES.SMALL.iters === 150 && V.RECIPES.HUGE.pop === 4 * V5.RECIPES.MANY.pop && V.RECIPES.SLOW.iters === 4 * V5.RECIPES.SMALL.iters &&
        /\*\*HUGE\*\* \| `pop 384`/.test(note) && /\*\*SLOW\*\* \| `lr 0\.0125, iters 600`/.test(note) && Math.abs(V.RECIPES.SLOW.lr * V.RECIPES.SLOW.iters - V2.RECIPE.lr * V2.RECIPE.iters) < 1e-12);
    ok("!! WHERE EACH SETTING'S CONTROL IS: HUGE is read against the MANY cell of round 5's file, SLOW against round 2's file (whose records carry no setting) -- the files are those rounds' own results files, and the registration names them", J(V.BEFORES) === J({ HUGE: { file: "brain/voxelHomeStepsRound.jsonl", setting: "MANY" }, SLOW: { file: "brain/voxelHomeDrawnRound.jsonl", setting: null } }) && V.BEFORES.HUGE.file === V5.RESULTS && V.BEFORES.SLOW.file === V2.RESULTS && note.includes("`" + V5.RESULTS + "`") && note.includes("`" + V2.RESULTS + "`") && V5.SETTINGS.includes("MANY"));
    ok("two arms, FLY and PLAIN, with round 2's weight counts; four cells; round 2's draws, audit plans and alpha; this round's results file; the builders are round 2's untrained ones, weight for weight; the words are the registration's",
        J(V.ARMS) === J(["FLY", "PLAIN"]) && J(V.CELLS) === J([["HUGE", "FLY"], ["HUGE", "PLAIN"], ["SLOW", "FLY"], ["SLOW", "PLAIN"]]) && J(V.WEIGHTS) === J({ FLY: 2967, PLAIN: 2962 }) && J(V.SEEDS) === J(V2.SEEDS) && J(V.AUDIT) === J(V2.AUDIT) && V.ALPHA === 0.01 && V.RESULTS === "brain/voxelHomeMoreRound.jsonl" && note.includes("`" + V.RESULTS + "`") &&
        V.ARMS.every((a) => J(arr(V.policyOf(a, 2).getParams())) === J(arr(V2.policyOf(a, 2).getParams()))) && J(V.auditScore(V.policyOf("FLY", 1), TINY_AUDIT, 12)) === J(V2.auditScore(V2.policyOf("FLY", 1), TINY_AUDIT, 12)) &&
        J(V.WORDS.HUGE) === J(["FOUR TIMES THE BUILDERS AGAIN BUILDS MORE OF A HOME", "FOUR TIMES THE BUILDERS AGAIN BUILDS LESS OF A HOME", "FOUR TIMES THE BUILDERS AGAIN CANNOT BE TOLD APART FROM 96"]) &&
        J(V.WORDS.SLOW) === J(["A SMALLER STEP FOR FOUR TIMES AS LONG BUILDS MORE OF A HOME", "A SMALLER STEP FOR FOUR TIMES AS LONG BUILDS LESS OF A HOME", "A SMALLER STEP FOR FOUR TIMES AS LONG CANNOT BE TOLD APART FROM ROUND 2'S"]) && [...V.WORDS.HUGE, ...V.WORDS.SLOW].every((w) => note.includes("`" + w + "`")));
});

console.log("\n2. ONE TRAINING (on draw 901)");
section(() => {
    const huge = V.trainOne("HUGE", "FLY", 901, TINY_HUGE, TINY_AUDIT), slow = V.trainOne("SLOW", "PLAIN", 901, TINY_SLOW, TINY_AUDIT), four = V2.trainOne("FLY", 901, TINY, TINY_AUDIT), c = P.ARMS.FLY(901);
    const common = { envFactory: (o = {}) => new B.BuildEnv({ maxSteps: 12, choice: "drawn", ...o }), obsDim: 40, actDim: 36, maxSteps: 12, sigma: 0.14, trainEps: 2, seed: 901 };
    const dH = trainDockES({ ...common, iters: 1, pop: 16, lr: 0.05, policyFactory: ({ obsDim, actDim, seed }) => new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed }) });
    const dS = trainDockES({ ...common, iters: 4, pop: 4, lr: 0.0125, policyFactory: ({ obsDim, actDim, seed }) => new P.CircuitPolicy({ obsDim, actDim, units: 38, edges: [], seed }) });
    ok("!! EACH SETTING'S NUMBERS REACH THE TRAINER: a HUGE record's weights are the trainer's called here by hand with 16 builders tried (and not what 4 gives); a SLOW record's are the trainer's with the quarter step for 4 iterations, with a history of 4 readings; each record carries its setting, its arm's weight count and wiring, and the recipe it was given",
        PF.hashWeights(dH.params) === huge.weightsHash && huge.weightsHash !== four.weightsHash && huge.setting === "HUGE" && huge.weightCount === 2967 && huge.edges === 313 && J(huge.recipe) === J(TINY_HUGE) && PF.hashWeights(dS.params) === slow.weightsHash && slow.setting === "SLOW" && slow.weightCount === 2962 && slow.edges === 0 && J(slow.recipe) === J(TINY_SLOW) && J(slow.history.map((h) => h.it)) === J([0, 1, 2, 3]));
    const lib = src("tools/ship/voxelHomeMore.mjs");
    ok("!! WITH NO RECIPE HANDED IN A TRAINING USES ITS SETTING'S REGISTERED ONE (read from the source: this gate never trains at it); its weights give its score again; and a setting or an arm that is not the round's is refused by name",
        /R\.trainOne\(arm, s, recipe === undefined \? R\.RECIPE : recipe, audit === undefined \? R\.AUDIT : audit\)/.test(lib) && /const R = ROUNDS\[setting\];/.test(lib) && /HUGE: makeRound\(\{ \.\.\.base, pop: 384 \}\), SLOW: makeRound\(\{ \.\.\.base, lr: 0\.0125, iters: 600 \}\)/.test(lib) &&
        (() => { const p = V.policyOf("PLAIN", 901); p.setParams(PF.unpackWeights(slow.weights)); const a = V.auditScore(p, TINY_AUDIT, 12); return a.score === slow.score && a.homes === slow.homes; })() && throws(() => V.trainOne("MANY", "FLY", 901, TINY, TINY_AUDIT), /no setting MANY/) && throws(() => V.trainOne("HUGE", "SHUF", 901, TINY, TINY_AUDIT), /no arm SHUF/));
});

console.log("\n3. THE RECORDS");
section(() => {
    const hist = (x, s) => (x === "SLOW" ? [0, 100, 200, 300, 400, 500, 599] : [0, 25, 50, 75, 100, 125, 149]).map((it, k) => ({ it, missing: 0.4 - k / 100 - s / 10000 }));
    const rec = (x, arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "PLAIN" ? { units: 38, edges: [] } : P.ARMS.FLY(s); return { kind: "draw", setting: x, arm, s, recipe: { ...V.RECIPES[x] }, units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), trainerBest: null, score, homes: 0, history: hist(x, s) }; };
    const file = (scoreOf) => { const out = []; for (const [x, a] of V.CELLS) for (const s of V.SEEDS) out.push(rec(x, a, s, scoreOf(x, a, s))); out.push({ kind: "recheck", setting: "SLOW", arm: "FLY", s: 1, weightsHash: out.find((r) => r.setting === "SLOW" && r.arm === "FLY" && r.s === 1).weightsHash }); return out; };
    // round 5's file: MANY at `many`, SMALL at 0.99 (which must move nothing); round 2's file: its arms at `r2`, and its SHUF at 0.99
    const steps = (many) => V.SEEDS.flatMap((s) => V.ARMS.flatMap((arm) => [{ kind: "draw", setting: "MANY", arm, s, score: many[arm] + s / 10000, homes: 0 }, { kind: "draw", setting: "SMALL", arm, s, score: 0.99, homes: 0 }]));
    const drawn = (r2) => V.SEEDS.flatMap((s) => [{ kind: "draw", arm: "FLY", s, score: r2.FLY + s / 10000, homes: 0 }, { kind: "draw", arm: "PLAIN", s, score: r2.PLAIN + s / 10000, homes: 0 }, { kind: "draw", arm: "SHUF", s, score: 0.99, homes: 0 }]).concat([{ kind: "floors", random: Array(16).fill(0.57), lean: 0.92, leanHomes: 123 }]);
    const BF = (many = { FLY: 0.71, PLAIN: 0.74 }, r2 = { FLY: 0.66, PLAIN: 0.69 }) => ({ HUGE: steps(many), SLOW: drawn(r2) });
    const jit = (x, a, s) => ((s * 7 + (x === "SLOW" ? 5 : 0) + (a === "PLAIN" ? 3 : 0)) % 16) / 100000, good = file((x, a, s) => 0.80 + jit(x, a, s)), before = BF(), clone = () => JSON.parse(J(good)), at = (L, x, a, s) => L.find((r) => r.setting === x && r.arm === a && r.s === s);
    ok("!! a file of 64 draws with their histories and the recheck, beside round 5's MANY cells and round 2's arms, passes every check", V.checkRecords(good, before).length === 0 && good.length === 65, V.checkRecords(good, before).slice(0, 2).join(" | "));
    const broken = [
        ["a draw missing", (L) => { L.splice(L.indexOf(at(L, "HUGE", "FLY", 9)), 1); }, before, /HUGE FLY draw 9 is there 0 times/],
        ["a HUGE draw trained with SLOW's recipe", (L) => { at(L, "HUGE", "FLY", 3).recipe = { ...V.RECIPES.SLOW }; }, before, /HUGE FLY draw 3 was trained with another recipe/],
        ["a SLOW draw trained for 150 iterations", (L) => { at(L, "SLOW", "PLAIN", 3).recipe.iters = 150; }, before, /SLOW PLAIN draw 3 was trained with another recipe/],
        ["a SLOW history that ends at iteration 149", (L) => { at(L, "SLOW", "FLY", 7).history = hist("HUGE", 7); }, before, /SLOW FLY draw 7 has no history from iteration 0 to 599/],
        ["an arm the round has not", (L) => { at(L, "SLOW", "FLY", 5).arm = "SHUF"; }, before, /SLOW SHUF draw 5 is not a registered draw/],
        ["weights that are not the record's hash", (L) => { at(L, "HUGE", "PLAIN", 2).weightsHash = "0000000000000000"; }, before, /HUGE PLAIN draw 2's weights are not 2962 finite numbers with its hash/],
        ["a recheck that says it is HUGE's", (L) => { L.find((r) => r.kind === "recheck").setting = "HUGE"; }, before, /SLOW FLY draw 1 trained a second time/],
        ["round 5's file without one MANY PLAIN draw", () => {}, { ...before, HUGE: before.HUGE.filter((r) => !(r.setting === "MANY" && r.arm === "PLAIN" && r.s === 9)) }, /HUGE's control \(brain\/voxelHomeStepsRound\.jsonl, its MANY cell\) does not hold its 16 PLAIN draws, each once/],
        ["round 5's file with only its SMALL cells", () => {}, { ...before, HUGE: before.HUGE.filter((r) => r.setting === "SMALL") }, /HUGE's control .* does not hold its 16 FLY draws/],
        ["round 2's file handed in as HUGE's control", () => {}, { HUGE: before.SLOW, SLOW: before.SLOW }, /HUGE's control .* does not hold its 16 FLY draws/],
        ["round 5's file handed in as SLOW's control", () => {}, { HUGE: before.HUGE, SLOW: before.HUGE }, /SLOW's control \(brain\/voxelHomeDrawnRound\.jsonl\) does not hold its 16 FLY draws/],
        ["no earlier files", () => {}, null, /does not hold its 16 FLY draws/],
    ];
    const res = broken.map(([name, f, bf, re]) => { const L = clone(); f(L); const bad = V.checkRecords(L, bf); return [name, bad.some((b) => re.test(b)), bad[0]]; });
    ok(`!! EACH CHECK FAILS BY NAME (${broken.length}: ${broken.map((b) => b[0]).join("; ")})`, res.every((r) => r[1]), res.filter((r) => !r[1]).map((r) => `${r[0]}: ${r[2]}`).join(" | "));
    const Rbad = V.reading(good, null), R0 = V.reading(good, before), words = (R) => Object.values(R.tests).map((t) => t.word);
    ok("!! WITH A FAILED CHECK THE READING IS NOT WEIGHED: no test of the four is made, and the first line says so", J(Object.keys(Rbad.tests)) === J(["H-FLY", "H-PLAIN", "L-FLY", "L-PLAIN"]) && Object.values(Rbad.tests).every((t) => t === null) && /A CHECK FAILED/.test(V.readingLines(Rbad)[0]) && Object.values(R0.tests).every((t) => t !== null));
    ok("!! all four cells at 0.80: above round 5's MANY (0.71, 0.74) and above round 2 (0.66, 0.69) -> each setting's MORE; round 5's SMALL cells and round 2's SHUF, both at 0.99 in the earlier files, move nothing", J(words(R0)) === J([V.WORDS.HUGE[0], V.WORDS.HUGE[0], V.WORDS.SLOW[0], V.WORDS.SLOW[0]]) && R0.tests["H-FLY"].sumA === 392);
    const mid = V.reading(file((x, a, s) => 0.70 + jit(x, a, s)), before);
    ok("!! *** EACH TEST IS AGAINST ITS OWN CONTROL: with all four cells at 0.70, HUGE is BELOW round 5's MANY (0.71 and 0.74) and SLOW is ABOVE round 2 (0.66 and 0.69) *** -- H-FLY and H-PLAIN say LESS, L-FLY and L-PLAIN say MORE; were HUGE read against round 2, or SLOW against round 5, the words would be the other way", J(words(mid)) === J([V.WORDS.HUGE[1], V.WORDS.HUGE[1], V.WORDS.SLOW[0], V.WORDS.SLOW[0]]));
    const arms = V.reading(file((x, a, s) => 0.70 + jit(x, a, s)), BF({ FLY: 0.60, PLAIN: 0.80 }, { FLY: 0.80, PLAIN: 0.60 }));
    ok("!! ...AND ITS OWN ARM: with every cell at 0.70, round 5's MANY at FLY 0.60 and PLAIN 0.80, and round 2 at FLY 0.80 and PLAIN 0.60 -> H-FLY MORE, H-PLAIN LESS, L-FLY LESS, L-PLAIN MORE; and cells among their controls cannot be told apart", J(words(arms)) === J([V.WORDS.HUGE[0], V.WORDS.HUGE[1], V.WORDS.SLOW[1], V.WORDS.SLOW[0]]) &&
        Object.values(V.reading(file((x, a, s) => 0.70 + ((s * 5) % 16) / 10000), BF({ FLY: 0.70, PLAIN: 0.70 }, { FLY: 0.70, PLAIN: 0.70 })).tests).every((t) => t.word === V.WORDS[t.setting][2]));
    const lines = V.readingLines(R0).join("\n");
    ok("the reading carries each cell's mean, homes and history, its control's mean beside it and round 2's floors, and its lines say all of it and the four tests by name with what each is against",
        Object.keys(R0.cells).length === 4 && R0.cells["SLOW FLY"].history.length === 7 && R0.cells["SLOW FLY"].history[6].it === 599 && Math.abs(R0.control["HUGE PLAIN"].mean - 0.74085) < 1e-9 && Math.abs(R0.control["SLOW FLY"].mean - 0.66085) < 1e-9 && R0.floors.lean === 0.92 &&
        /HUGE FLY +16 +0\.80.* 0\.710\d, 0/.test(lines) && /round 2's floors: 16 random builders 0\.5700; the lean, no network 0\.9200, homes 123 of 200/.test(lines) && /H-PLAIN \(HUGE's PLAIN against round 5's MANY PLAIN\): the ranks sum to 392/.test(lines) && /L-FLY \(SLOW's FLY against round 2's FLY\)/.test(lines) && /SLOW FLY +the trainer's own battery, share missing at iteration 0: .* 599: /.test(lines));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "FLY", "1"], ["job", "HUGE", "SHUF", "1"], ["job", "MANY", "FLY", "1"], ["job", "HUGE", "FLY", "x"], ["job", "HUGE", "FLY", "17"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("!! THE COMMAND'S WORDS, AS ARITHMETIC: run is four processes or --jobs of at least 1, read takes nothing, job takes one of this round's settings, one of its two arms and a draw 1 to 16 -- and ten other shapes are not words (round 5's settings among them)",
        J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "SLOW", "PLAIN", "16"])) === J({ cmd: "job", setting: "SLOW", arm: "PLAIN", s: 16 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeVoxelHomeMore.mjs");
    ok("!! the command is this round's -- its library, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, trains a job with its setting, trains SLOW FLY draw 1 a second time, and READS BOTH EARLIER FILES (the library's BEFORES) and hands each to the reading under its setting",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/voxelHomeMore\.mjs"/.test(csrc) && !/voxelHomeSteps|voxelHomeLong|voxelHomeLean|"\.\/voxelHomeDrawn\.mjs"|"\.\/voxelHome\.mjs"/.test(csrc) && /PF\.trainOne\(args\.setting, args\.arm, args\.s\)/.test(csrc) &&
        /jobOnce\("SLOW", "FLY", 1\)/.test(csrc) && /Object\.entries\(PF\.BEFORES\)\.map\(\(\[x, b\]\) => \{ const f = path\.join\(ENG, b\.file\);/.test(csrc) && /PF\.reading\(linesOf\(\), befores\)/.test(csrc) && /usage: node tools\/ship\/takeVoxelHomeMore\.mjs run \[--jobs N\] \| read \| job SETTING ARM S/.test(csrc));
    const me = src("tools/ship/voxelHomeMore-selfcheck.mjs"), calls = [...me.matchAll(/V2?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its trainings are of 1 to 4 iterations with 4 or 16 builders on draw 901 or refused before they start; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 5 && calls.every((c) => /901, TINY(_HUGE|_SLOW)?, TINY_AUDIT$/.test(c)) && TINY_HUGE.pop === 16 && TINY_SLOW.iters === 4 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nvoxelHomeMore-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
