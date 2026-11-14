// WebGLEngine/tools/ship/voxelHomeDrawn-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/voxelHomeDrawn-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are at a recipe of its own, on draws the round does not use, and the command is never given the word `run`)
//
// THE GATE OF THE VOXEL HOME'S ROUND 2, THE DRAWN CHOICE (registered in brain/VOXEL_HOME_DRAWN_WIP.md before tools/ship/voxelHomeDrawn.mjs existed). The round is tools/ship/voxelHome.mjs's makeRound() with
// another cfg, so what that file's gate holds of the shared code (tools/ship/voxelHome-selfcheck.mjs, 40 sabotages) is held of this round too; this gate holds what differs and what must not. The environment has its own gate
// (tools/ship/buildEnv-selfcheck.mjs) and the exact rank-sum test its own (tools/ship/paintingFly-selfcheck.mjs section 3); this one holds the round.
//   1  THE ROUND'S NUMBERS   the library holds what the registration says; the arms with 36 outputs; the audit is of the drawn environment; the random builders are round 1's; one code, two rounds
//   2  ONE TRAINING          a record is its arm's and its draw's, and its weights give its score again
//   3  THE RECORDS           the registration's checks, each failing by name; the three tests' words
//   4  THE COMMAND           its words as arithmetic; this gate starts no training of the round's and leaves its results file as it was
//   5  THE VERDICT           round 2, run 2026-11-14 and committed unread at 1f5e0ec3: the file's bytes, the checks, the three readings, the arms beside the random builders, the lean and round 1
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), THIS gate and round 1's run whole for each; every one red by name
// (the two numbers are the rows that went red here, then in tools/ship/voxelHome-selfcheck.mjs):
//   X1 round 2 names its column after all 9, 0 | X2 the random builders are flown on the round's own environment 1, 0 | X3 the lean is left out of the drawn round's floors 1, 0 | X4 round 1's floors carry a lean too 1, 0
//   X5 round 2's PLAIN has 39 units 6, 0 | X6 round 2 writes round 1's results file 2, 0 | X7 a training's environments are named whatever the round 1, 0 | X8 the audit's environment is named whatever the round 2, 0
//   X9 round 2's command reads round 1's library 1, 0 | X10 makeRound takes any choice 1, 0 | X11 the lean is to the finished columns 1, 0 | X12 round 2's FLY has 2,966 weights 6, 0 | X13 round 1 draws its column 2, 8
//   AND SEVEN OF ROUND 1'S, AGAIN, after its library became makeRound(): H6'' a half-built house counted a home 1, 2 | H8'' the score is the share missing 1, 3 | H12'' T0 reads the SHUF arm 2, 4
//     H13'' T1 reads the PLAIN arm 1, 3 | H15'' MORE and LESS swapped 3, 6 | H17'' the reading is weighed with a check failed 1, 1 | H10'' a training's wiring is draw 1's 1, 1
//   THE VERDICT'S (section 5, 2026-11-14), this gate run whole for each: Y1 a FLY score in the file lowered to 0.50 7 | Y2 MORE and LESS swapped 7 | Y3 the audit is of the named environment 3 | Y5 the lean in the file made 0.60 2
//     Y6 T2 reads the fly against the fish 3 | Y7 round 1's file's first FLY score raised (the comparison row) 1 | Y4' round 2's result says the fly cannot be told from random 1 | Y8 round 2's result says the wiring is BETTER than a shuffle 1
//   *** Y4 WENT 0 RED, AND THE HOLE WAS IN THREE GATES. *** The row asked whether the NOTE carries the reading's words, and section 4 of every registration lists all the words a test could say: a result
//   rewritten to another word was still "carried". The row now reads the result section alone and asks for the test's own line. The same row was in tools/ship/voxelHome-selfcheck.mjs and
//   tools/ship/paintingFly-selfcheck.mjs (their own V5 and W5 had gone red only because of which words section 4 happened to abbreviate) and is corrected there: Y9 (round 1's result says BETTER) 1 and
//   Y10 (the painting result says BETTER) 1, each red in its own gate.
//   SEEN BEFORE THE RUN, said so: writing this gate printed the floors of three of its own plans once (880001 to 880003, 12 steps): untrained draws of this round build about as much as a random builder there.
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as V from "./voxelHomeDrawn.mjs";
import * as V1 from "./voxelHome.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as B from "../../brain/rl/buildEnv.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const TINY = Object.freeze({ maxSteps: 12, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2 }), TINY_AUDIT = [880001, 880002, 880003];
// two builders with no network: the same number for every column (a random builder), and a lean to the columns the observation says are unfinished
const LEVEL = { act: () => new Float32Array(36) }, LEAN = { act: (o) => Float32Array.from({ length: 36 }, (_, c) => (o[c] > 0 ? 1 : -1)) };

console.log("voxelHomeDrawn-selfcheck -- round 2 of the voxel home (the drawn choice): the numbers, one training, the records, the command (the round itself is never run here)\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/VOXEL_HOME_DRAWN_WIP.md");
    ok("!! tools/ship/voxelHome.mjs holds what the registration says: the recipe (96 steps), draws 1 to 16, the five arms and their weight counts, the 200 audit plans 700001 + 7919 k, the 16 random builders 1000 + 7919 k, alpha 0.01, the results file",
        J(V.RECIPE) === J({ maxSteps: 96, iters: 150, pop: 24, sigma: 0.14, lr: 0.05, trainEps: 8 }) && /`iters 150, pop 24, sigma 0\.14, lr 0\.05, trainEps 8, seed s`/.test(note) && /maxSteps: 96, choice: "drawn"/.test(note) && J(V.SEEDS) === J(PF.SEEDS) && /s = 1 to 16/.test(note) &&
        J(V.ARMS) === J(["FLY", "SHUF", "PLAIN", "FISH", "MLP"]) && J(V.WEIGHTS) === J({ FLY: 2967, SHUF: 2967, PLAIN: 2962, FISH: 2807, MLP: 1540 }) && ["2,967", "2,962", "2,807", "1,540"].every((n) => note.includes(n)) &&
        V.AUDIT.length === 200 && V.AUDIT[0] === 700001 && V.AUDIT[199] === 700001 + 7919 * 199 && /700001 \+ 7919 k/.test(note) && V.RANDOM_SEEDS.length === 16 && V.RANDOM_SEEDS[15] === 1000 + 7919 * 15 && /1000 \+ 7919 k/.test(note) && V.ALPHA === 0.01 && V.RESULTS === "brain/voxelHomeDrawnRound.jsonl" && note.includes("`" + V.RESULTS + "`"));
    ok("!! THE ARMS: FLY the Giant Fiber Circuit's 313 synapses on 34 units, SHUF the draw's own shuffle of them (shuffledEdges(34, 313, 7000 + s)), PLAIN 38 units and no edge, FISH the Fish1 core's 153, MLP the tree's 40-16-16-36 -- each untrained builder with its registered weight count",
        V.ARMS.every((a) => V.policyOf(a, 1).paramCount() === V.WEIGHTS[a]) && J(V.circuitOf("FLY", 3)) === J(P.ARMS.FLY()) && J(V.circuitOf("SHUF", 3).edges) === J(P.shuffledEdges(34, 313, 7003)) && J(V.circuitOf("SHUF", 3).edges) !== J(V.circuitOf("SHUF", 4).edges) &&
        J(V.circuitOf("PLAIN", 3)) === J({ units: 38, edges: [] }) && V.PLAIN_UNITS === 38 && V.policyOf("FLY", 1).outDim === 36 && V.circuitOf("FISH", 1).edges.length === 153 && J(V.MLP_HIDDEN) === J([16, 16]) && throws(() => V.circuitOf("MLP", 1), /no circuit arm MLP/) && throws(() => V.policyOf("WORM", 1), /no arm WORM/));
    ok("a draw's start is its seed's, with every recurrent weight 0", J(Array.from(V.policyOf("FLY", 5).getParams())) === J(Array.from(V.policyOf("FLY", 5).getParams())) && J(Array.from(V.policyOf("FLY", 5).getParams())) !== J(Array.from(V.policyOf("FLY", 6).getParams())) && V.policyOf("FLY", 5).Wrec.every((w) => w === 0));
    const lean = V.auditScore(LEAN, V.AUDIT.slice(0, 40)), level = V.auditScore(LEVEL, V.AUDIT.slice(0, 40));
    ok("!! THE AUDIT IS OF THE DRAWN ENVIRONMENT AND COUNTS SHARES AND HOMES: on the first 40 audit plans a builder that says the same of every column builds 0.562 and no home, and one that leans to the columns the observation says are unfinished builds 0.887 and 19 homes -- some, not all and not none",
        Math.abs(level.score - 0.5621) < 5e-4 && level.homes === 0 && Math.abs(lean.score - 0.8868) < 5e-4 && lean.homes === 19, J([level, lean]));
    let asked = 0, width = 0; V.auditScore({ act: (o) => { asked++; width = o.length; return new Float32Array(36); } }, TINY_AUDIT, 7);
    ok("the audit plays every step of every plan (3 plans x 7 steps asked) with the 40 observations, and its plans are round 1's audit plans", asked === 21 && width === 40 && J(V.AUDIT) === J(V1.AUDIT));
    const fl = V.floors(TINY_AUDIT, 12, [1000, 8919]), fl1 = V1.floors(TINY_AUDIT, 12, [1000, 8919]), leanTiny = V.auditScore(LEAN, TINY_AUDIT, 12);
    ok("!! THE RANDOM BUILDERS ARE ROUND 1'S OWN, flown on the named environment (the same scores as round 1's library gives for the same seeds and plans); the untrained draws are THIS round's builders (draw 1, 36 outputs, audited here); and the floors carry the lean to the unfinished columns, which round 1's do not",
        J(fl.random) === J(fl1.random) && J(fl.randomHomes) === J(fl1.randomHomes) && V.ARMS.every((a) => fl.untrained[a] === V.auditScore(V.policyOf(a, 1), TINY_AUDIT, 12).score) && fl.untrained.FLY !== fl1.untrained.FLY && fl.lean === leanTiny.score && fl.leanHomes === leanTiny.homes && !("lean" in fl1) && J(fl) === J(V.floors(TINY_AUDIT, 12, [1000, 8919])));
    ok("!! ONE CODE, TWO ROUNDS: this round is tools/ship/voxelHome.mjs's makeRound() with ROUND2 -- the drawn choice, 38 plain units, its own weight counts and results file -- and the recipe, the draws, the random builders' seeds, alpha and the three tests' words are round 1's, to the letter",
        J(V.ROUND2) === J({ choice: "drawn", plainUnits: 38, weights: { FLY: 2967, SHUF: 2967, PLAIN: 2962, FISH: 2807, MLP: 1540 }, results: "brain/voxelHomeDrawnRound.jsonl" }) && J(V1.ROUND1.choice) === J("named") && J(V.RECIPE) === J(V1.RECIPE) && J(V.SEEDS) === J(V1.SEEDS) && J(V.RANDOM_SEEDS) === J(V1.RANDOM_SEEDS) && V.ALPHA === V1.ALPHA && J(V.WORDS) === J(V1.WORDS) && V.RESULTS !== V1.RESULTS &&
        typeof V1.makeRound === "function" && J(V1.makeRound(V.ROUND2).WEIGHTS) === J(V.WEIGHTS) && (() => { try { V1.makeRound({ choice: "guessed", plainUnits: 3, weights: {}, results: "x" }); return false; } catch (e) { return /a cfg is/.test(e.message); } })());
});

console.log("\n2. ONE TRAINING (at this gate's own recipe: 12 steps, 2 iterations, draws 901 and 902)");
section(() => {
    const r = V.trainOne("SHUF", 901, TINY, TINY_AUDIT), r2 = V.trainOne("SHUF", 901, TINY, TINY_AUDIT), r3 = V.trainOne("SHUF", 902, TINY, TINY_AUDIT), w = PF.unpackWeights(r.weights);
    const c = { units: 34, edges: P.shuffledEdges(34, 313, 7901) }, fac = ({ obsDim, actDim, seed } = {}) => new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed: seed ?? 1234 }), q = fac({ obsDim: 40, actDim: 36 }); q.setParams(w);
    const direct = trainDockES({ envFactory: (o = {}) => new B.BuildEnv({ maxSteps: 12, choice: "drawn", ...o }), obsDim: 40, actDim: 36, maxSteps: 12, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901, policyFactory: fac });
    ok("!! ONE TRAINING IS ITS ARM'S AND ITS DRAW'S: the same record twice, the weights those of the trainer called here with the record's recipe, the draw's own shuffle and a DRAWN environment of 36 actions, another draw another wiring and other weights, and the weights in the record are its hash's and give its score and its homes again through that wiring",
        J(r) === J(r2) && PF.hashWeights(direct.params) === r.weightsHash && r.edgesHash === PF.hashEdges(c.edges) && r.edgesHash !== r3.edgesHash && r.weightsHash !== r3.weightsHash && r.kind === "draw" && r.weightCount === 2967 && PF.hashWeights(w) === r.weightsHash && J(V.auditScore(q, TINY_AUDIT, 12)) === J({ score: r.score, homes: r.homes }) && J(r.recipe) === J(TINY));
    let given = null; const told = V.trainOne("FLY", 902, TINY, TINY_AUDIT, (pol, seeds, steps) => { given = [typeof pol.act, seeds, steps]; return { score: 0.625, homes: 7 }; });
    ok("!! A RECORD CARRIES WHAT THE AUDIT SAID, BOTH NUMBERS: handed an audit that answers a share of 0.625 and 7 homes (no builder this small builds one), the record says 0.625 and 7, and the audit was given the trained builder, the plans and the recipe's steps", told.score === 0.625 && told.homes === 7 && J(given) === J(["function", TINY_AUDIT, 12]));
    const m = V.trainOne("MLP", 901, TINY, TINY_AUDIT), pl = V.trainOne("PLAIN", 901, TINY, TINY_AUDIT);
    ok("the MLP arm is the tree's (1,540 weights, no wiring in its record), the PLAIN arm 38 units with none (2,962), and a draw below 1 is refused", m.weightCount === 1540 && m.edges === null && pl.weightCount === 2962 && pl.edges === 0 && pl.units === 38 && throws(() => V.trainOne("FLY", 0, TINY, TINY_AUDIT), /whole number from 1/));
});

console.log("\n3. THE RECORDS");
section(() => {
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "MLP" ? null : V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c ? c.units : null, edges: c ? c.edges.length : null, edgesHash: c ? PF.hashEdges(c.edges) : null, weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), trainerBest: null, score, homes: s % 3 }; };
    const file = (scoreOf, randomOf = (k) => 0.55 + k / 1000) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, { kind: "floors", random: V.RANDOM_SEEDS.map((_, k) => randomOf(k)), randomHomes: V.RANDOM_SEEDS.map(() => 0), untrained: { FLY: 0.1, SHUF: 0.1, PLAIN: 0.1, FISH: 0.1, MLP: 0.1 } }); return out; };
    const even = (arm, s) => 0.7 + ((s * 7 + V.ARMS.indexOf(arm) * 3) % 16) / 1000, good = file(even), clone = () => JSON.parse(J(good)), idx = (L, arm, s) => L.findIndex((r) => r.arm === arm && r.s === s);
    ok("!! a file of 80 draws, each once, with the recheck and the floors passes every check", V.checkRecords(good).length === 0, V.checkRecords(good).slice(0, 2).join(" | "));
    const broken = [
        ["a draw missing", (L) => L.splice(idx(L, "FISH", 7), 1), /FISH draw 7 is there 0 times/],
        ["a draw twice", (L) => L.push(JSON.parse(J(L[idx(L, "PLAIN", 2)]))), /PLAIN draw 2 is there 2 times/],
        ["another recipe", (L) => { L[idx(L, "FLY", 4)].recipe.maxSteps = 97; }, /FLY draw 4 was trained with another recipe/],
        ["an arm's weight count", (L) => { L[idx(L, "PLAIN", 3)].weightCount = 2967; }, /PLAIN draw 3 has 2967 weights \(its arm has 2962\)/],
        ["weights that are not the hash's", (L) => { const r = L[idx(L, "MLP", 5)], w = PF.unpackWeights(r.weights); w[10] += 1; r.weights = PF.packWeights(w); }, /MLP draw 5's weights are not 1540 finite numbers with its hash/],
        ["a SHUF draw with the fly's wiring", (L) => { L[idx(L, "SHUF", 6)].edgesHash = PF.hashEdges(P.ARMS.FLY().edges); }, /SHUF draw 6's wiring is not its arm's/],
        ["a score that is not a share", (L) => { L[idx(L, "FLY", 9)].score = 1.2; }, /FLY draw 9 has no score that is a share/],
        ["no count of homes", (L) => { delete L[idx(L, "FISH", 2)].homes; }, /FISH draw 2 has no count of homes/],
        ["the recheck with other weights", (L) => { L.find((r) => r.kind === "recheck").weightsHash = "0000000000000000"; }, /FLY draw 1 trained a second time/],
        ["15 random builders", (L) => { L.find((r) => r.kind === "floors").random.pop(); }, /the 16 random builders and the untrained draws are not there once/],
        ["the floors missing", (L) => L.splice(L.findIndex((r) => r.kind === "floors"), 1), /the 16 random builders and the untrained draws are not there once/],
        ["a draw the round does not have", (L) => { L[idx(L, "FLY", 16)].s = 17; }, /FLY draw 17 is not a registered draw/],
    ];
    const res = broken.map(([name, f, re]) => { const L = clone(); f(L); const bad = V.checkRecords(L); return [name, bad.some((b) => re.test(b)), bad[0]]; });
    ok(`!! EACH CHECK FAILS BY NAME on a file that breaks it (${broken.length}: ${broken.map((b) => b[0]).join("; ")})`, res.every((r) => r[1]), res.filter((r) => !r[1]).map((r) => `${r[0]}: ${r[2]}`).join(" | "));
    const R0 = V.reading(good), Lbad = clone(); Lbad.splice(idx(Lbad, "FLY", 1), 1); const Rbad = V.reading(Lbad);
    ok("!! WITH A FAILED CHECK THE READING IS NOT WEIGHED: no test is made, and the report's first line says so", Rbad.T0 === null && Rbad.T1 === null && Rbad.T2 === null && /A CHECK FAILED, AND THE READING IS NOT WEIGHED/.test(V.readingLines(Rbad)[0]) && R0.T0 !== null);
    const up = V.reading(file((arm, s) => (arm === "FLY" ? 0.9 : 0.7) + s / 10000)), down = V.reading(file((arm, s) => (arm === "FLY" ? 0.3 : 0.7) + s / 10000)), level = V.reading(file(even, (k) => 0.7 + ((k * 5) % 16) / 1000));
    ok("!! THE WORDS, EACH TEST AGAINST ITS OWN OTHER ARM: the fly above everything -> MORE than a random builder, BETTER than a shuffle and than a plain net; below everything -> LESS, WORSE, WORSE; arms and random builders drawn alike -> CANNOT BE TOLD APART three times; and trained arms alike but well above the random builders -> MORE, with the other two unable to tell",
        J([up.T0.word, up.T1.word, up.T2.word]) === J([V.WORDS.T0[0], V.WORDS.T1[0], V.WORDS.T2[0]]) && J([down.T0.word, down.T1.word, down.T2.word]) === J([V.WORDS.T0[1], V.WORDS.T1[1], V.WORDS.T2[1]]) && J([level.T0.word, level.T1.word, level.T2.word]) === J([V.WORDS.T0[2], V.WORDS.T1[2], V.WORDS.T2[2]]) &&
        J([R0.T0.word, R0.T1.word, R0.T2.word]) === J([V.WORDS.T0[0], V.WORDS.T1[2], V.WORDS.T2[2]]) && /BUILDS MORE OF A HOME THAN A RANDOM ONE/.test(V.WORDS.T0[0]) && /A SHUFFLE OF IT/.test(V.WORDS.T1[2]) && /A PLAIN NET OF ITS SIZE/.test(V.WORDS.T2[1]));
    const onlyShuf = V.reading(file((arm, s) => (arm === "SHUF" ? 0.3 : 0.7) + s / 10000, (k) => 0.7 + k / 10000 + 0.00005)), onlyPlain = V.reading(file((arm, s) => (arm === "PLAIN" ? 0.95 : 0.7) + s / 10000, (k) => 0.7 + k / 10000 + 0.00005));
    ok("each test reads its own arm: the SHUF arm alone lowered moves T1 only (BETTER), the PLAIN arm alone raised moves T2 only (WORSE), and neither moves T0", onlyShuf.T1.word === V.WORDS.T1[0] && onlyShuf.T2.word === V.WORDS.T2[2] && onlyShuf.T0.word === V.WORDS.T0[2] && onlyPlain.T2.word === V.WORDS.T2[1] && onlyPlain.T1.word === V.WORDS.T1[2] && onlyPlain.T0.word === V.WORDS.T0[2]);
    ok("the reading describes every arm (16 draws, the homes of its draws summed and its best draw's) and its lines say the checks, a row an arm, the random builders and the rule, and the three tests", V.ARMS.every((a) => R0.arms[a].n === 16 && R0.arms[a].homes === V.SEEDS.reduce((x, s) => x + s % 3, 0) && R0.arms[a].bestHomes === 2) &&
        (() => { const t = V.readingLines(up).join("\n"); return /the checks hold/.test(t) && V.ARMS.every((a) => new RegExp(`^${a} `, "m").test(t)) && /16 random builders/.test(t) && /the rule: 1\.0000/.test(t) && /T0 \(FLY against 16 random builders\)/.test(t) && /T1 \(FLY against SHUF\)/.test(t) && /T2 \(FLY against PLAIN\)/.test(t) && t.includes(V.WORDS.T0[0]); })());
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "WORM", "1"], ["job", "FLY", "x"], ["job", "FLY", "0"], ["job", "FLY", "17"], ["job", "FLY"], ["run", "--jobs", "0"], ["run", "--jobs"], ["run", "--jobs", "2", "x"], ["run", "4"], ["read", "extra"]];
    ok("!! THE COMMAND'S WORDS, AS ARITHMETIC (parseArgs, never the command): run is four processes or --jobs of at least 1, read takes nothing, job takes a registered arm and a draw 1 to 16 -- and twelve other shapes are not words",
        J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FISH", "16"])) === J({ cmd: "job", arm: "FISH", s: 16 }) && no.every((a) => V.parseArgs(a) === null) && V.parseArgs("run") === null);
    const cmd = path.join(ENG, "tools", "ship", "takeVoxelHomeDrawn.mjs"), probe = (...a) => spawnSync(process.execPath, [cmd, ...a], { encoding: "utf8" });
    const bad = [probe(), probe("bogus"), probe("job", "WORM", "1"), probe("job", "FLY", "x"), probe("read", "extra")];
    ok("!! the command refuses what it does not know with its usage and exit 2: no word, another word, an arm that is not one, a draw that is not a number, a word too many", bad.every((r) => r.status === 2 && /^usage: node tools\/ship\/takeVoxelHomeDrawn\.mjs/.test(r.stderr) && r.stdout === ""), bad.map((r) => r.status).join(" "));
    const csrc = src("tools/ship/takeVoxelHomeDrawn.mjs");
    ok("the command's words are parseArgs' and nothing else's, it refuses a run of no processes itself, and it is this round's: the drawn round's library and results file, not round 1's and not the painting round's", (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/voxelHomeDrawn\.mjs"/.test(csrc) && !/paintingFly|PAINTING_FLY|voxelHomeRound|"\.\/voxelHome\.mjs"/.test(csrc));
    const me = src("tools/ship/voxelHomeDrawn-selfcheck.mjs"), calls = [...me.matchAll(/V\.trainOne\(([^)]*)\)/g)].map((m) => m[1]), probes = [...me.matchAll(/probe\(("[^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: every training here is at its own recipe (12 steps, 2 iterations) on draws 901 and 902 or refused before it starts; the command is never given the word run, nor a job it could do; and the file's size and time are what they were before this section",
        calls.length >= 6 && calls.every((c) => /^"[A-Z]+", (901|902|0), TINY, TINY_AUDIT(, |$)/.test(c)) && TINY.iters === 2 && !V.SEEDS.includes(901) && probes.length === 4 && probes.every((p) => !/"run"/.test(p) && V.parseArgs(JSON.parse(`[${p}]`)) === null) && stateOf() === before, `${calls.length} trainings, ${probes.length + 1} probes, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (round 2; the results were committed at 1f5e0ec3 before they were read, and are read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = V.reading(lines), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
    ok("!! the results file is the one the run wrote: 82 records, sha256 5e339d1b8a1ea30a...", lines.length === 82 && createHash("sha256").update(bytes).digest("hex") === "5e339d1b8a1ea30aa7f09622282c496d1da6acdb6cdf465ddbc67b1660ad36a8");
    ok("!! THE CHECKS HOLD: 80 draws each once, the registered recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the 16 random builders and the untrained draws", R.checks.length === 0, R.checks.slice(0, 2).join(" | "));
    ok("!! *** T0: A FLY-WIRED BUILDER BUILDS MORE OF A HOME THAN A RANDOM ONE *** -- with the choice drawn, every one of the 16 trained FLY builders is above every one of the 16 random builders (the fly's ranks sum to 392, the most there is; exact two-sided p 3.3e-9): round 1's reading, turned over", R.T0 && R.T0.word === V.WORDS.T0[0] && R.T0.sumA === 392 && R.T0.ties === 0 && R.T0.p < 4e-9, R.T0 ? `p ${R.T0.p.toExponential(2)}` : "no test");
    ok("!! *** T1, THE WIRING: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT *** -- the fly's ranks sum to 284 (the middle is 264), exact two-sided p 0.47", R.T1 && R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 284 && near(R.T1.p, 0.46769), R.T1 ? `p ${R.T1.p.toFixed(4)}` : "no test");
    ok("!! *** T2: THE FLY'S WIRING BUILDS WORSE THAN A PLAIN NET OF ITS SIZE *** -- the fly's ranks sum to 172 (196 or less speaks), exact two-sided p 0.00027", R.T2 && R.T2.word === V.WORDS.T2[1] && R.T2.sumA === 172 && near(R.T2.p, 0.000275, 5e-6), R.T2 ? `p ${R.T2.p.toExponential(2)}` : "no test");
    const A = R.arms, fl = R.floors, rMean = fl.random.reduce((a, b) => a + b, 0) / 16, rMax = Math.max(...fl.random), draws = lines.filter((r) => r.kind === "draw");
    ok("!! the arms' mean share of a home built, 16 draws each (mean, sd): SHUF 0.6612 0.0213, FLY 0.6664 0.0174, FISH 0.6741 0.0206, MLP 0.6892 0.0139, PLAIN 0.6905 0.0143 -- the arms with recurrent synapses below the two without, as in round 1 and the painting round; the 16 random builders 0.5722",
        near(A.FLY.mean, 0.6664) && near(A.FLY.sd, 0.0174) && near(A.SHUF.mean, 0.6612) && near(A.SHUF.sd, 0.0213) && near(A.FISH.mean, 0.6741) && near(A.FISH.sd, 0.0206) && near(A.PLAIN.mean, 0.6905) && near(A.PLAIN.sd, 0.0143) && near(A.MLP.mean, 0.6892) && near(A.MLP.sd, 0.0139) && near(rMean, 0.5722) &&
        Math.max(A.FLY.mean, A.SHUF.mean, A.FISH.mean) < Math.min(A.PLAIN.mean, A.MLP.mean));
    ok("!! *** EVERY TRAINED BUILDER BEATS EVERY RANDOM ONE, AND NONE BUILDS A HOME *** -- all 80 are above the best random builder (the least trained draw 0.607, the best 0.715, against 0.577); and among their 80 x 200 audit builds there is not one home",
        draws.every((r) => r.score > rMax) && near(Math.min(...draws.map((r) => r.score)), 0.6069) && near(Math.max(...draws.map((r) => r.score)), 0.7153) && near(rMax, 0.5774) && V.ARMS.every((a) => A[a].homes === 0 && A[a].bestHomes === 0));
    ok("!! *** AND THE LEAN THAT NEEDS NO NETWORK IS FAR ABOVE THEM ALL: leaning to the columns the observation says are unfinished builds 0.9226 of a home and 123 homes of the same 200 plans *** -- the trained builders closed about a third of the way from a random builder to it (0.572 -> 0.69 -> 0.92)",
        near(fl.lean, 0.9226) && fl.leanHomes === 123 && fl.lean > Math.max(...draws.map((r) => r.score)) + 0.2 && (A.PLAIN.mean - rMean) / (fl.lean - rMean) > 0.3 && (A.PLAIN.mean - rMean) / (fl.lean - rMean) < 0.37);
    ok("the untrained draws start just under a random builder (0.548 to 0.578: 36 numbers that are not level lean somewhere, and nowhere useful), so the training is what lifted them", V.ARMS.every((a) => fl.untrained[a] > 0.54 && fl.untrained[a] < 0.58 && A[a].min > fl.untrained[a]));
    const again = V.ARMS.flatMap((arm) => [3, 11].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore(p); return [arm, s, a.score === r.score && a.homes === r.homes]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS HOMES AGAIN: draws 3 and 11 of every arm, audited here on the 200 plans with the drawn choice, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    // round 1, from its own file: the same arms, the choice named
    const r1 = V1.reading(fs.readFileSync(path.join(ENG, V1.RESULTS), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)));
    ok("!! BESIDE ROUND 1, FROM ITS OWN FILE: with the column named every arm's mean was under a random builder's (FLY 0.43, PLAIN 0.55); with it drawn every arm's is over (FLY 0.67, PLAIN 0.69) -- each arm built more, the fly-wired one the most more (0.24), and the order of the arms did not change at the ends", r1.checks.length === 0 && V.ARMS.every((a) => r1.arms[a].mean < rMean && A[a].mean > rMean && A[a].mean > r1.arms[a].mean) && near(A.FLY.mean - r1.arms.FLY.mean, 0.2369, 5e-4) && r1.T0.word === V.WORDS.T0[1]);
    const note = src("brain/VOXEL_HOME_DRAWN_WIP.md");
    ok("the expectations, written before the tool, against what came: T0 BUILDS MORE was the 65 percent guess; T1 CANNOT BE TOLD APART the 75; T2 WORSE the 55; the best arm's mean above 0.75 was given 40 percent and is 0.69; any home 50 percent, a FLY home 30, and there is none",
        /T0: BUILDS MORE about 65 percent/.test(note) && /T1: CANNOT BE TOLD APART about\s+75 percent/.test(note) && /T2: FLY WORSE about 55 percent/.test(note) && /above 0\.75: about 40 percent/.test(note) && Math.max(...V.ARMS.map((a) => A[a].mean)) < 0.75);
    ok("the registration's RESULT SECTION (section 10, and not the list of possible words in section 4) carries the three readings' words", /## 10\. The result/.test(note) && [["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word]].every(([t, w]) => note.slice(note.indexOf("## 10. The result")).includes(`**${t}: ${w}**`)));
});

console.log(`\nvoxelHomeDrawn-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
