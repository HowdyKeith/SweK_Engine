// WebGLEngine/tools/ship/voxelHome-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/voxelHome-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are at a recipe of its own, on draws the round does not use, and the command is never given the word `run`)
//
// THE GATE OF THE VOXEL HOME'S ROUND 1 (backlog `voxel-home`, stage V2; registered in brain/VOXEL_HOME_WIP.md before tools/ship/voxelHome.mjs existed). The environment has its own gate
// (tools/ship/buildEnv-selfcheck.mjs) and the exact rank-sum test its own (tools/ship/paintingFly-selfcheck.mjs section 3); this one holds the round.
//   1  THE ROUND'S NUMBERS   the library holds what the registration says; the arms; the audit counts shares and homes
//   2  ONE TRAINING          a record is its arm's and its draw's, and its weights give its score again
//   3  THE RECORDS           the registration's checks, each failing by name; the three tests' words
//   4  THE COMMAND           its words as arithmetic; this gate starts no training of the round's and leaves its results file as it was
//   5  THE VERDICT           round 1, run 2026-11-13 and committed unread at 108df706: the file's bytes, the checks, the three readings, the arms beside the random builders and the rule, the expectations against what came
// SABOTAGE LOG (2026-11-13) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), the gate run whole; every one red by name (the number is the rows that went red):
//   H1 97 steps in the recipe 2 | H2 PLAIN has 42 units 5 | H3 SHUF is the fly's wiring 6 | H4 the audit's plans start elsewhere 1 | H5 15 random builders 1 | H7 the audit stops a step early 1 | H8 the score is the share missing 1
//   H10 a training's wiring is draw 1's 1 | H11 a draw's builder is given draw 1's wiring 1 | H12 T0 reads the SHUF arm 2 | H13 T1 reads the PLAIN arm 1 | H14 T2 reads the FISH arm 1 | H15 MORE and LESS swapped 3 | H16 alpha 0.5 1
//   H17 the reading is weighed with a check failed 1 | H18 the recipe check gone 1 | H19 the homes check gone 1 | H20 the random builders' count is not checked 1 | H22 the arm's homes are its draws' largest, not their sum 1
//   H23 run takes 0 jobs (the parser) 1 | H24 the command's own guard gone 1 | H25 the command reads the painting round's library 1 | H26 job takes a draw the round does not have 1 | H27 the MLP arm has one layer 6
//   H6' the audit counts a half-built house a home without looking 1 | H21' a record's homes are 0 whatever the audit said 1 | H28' the untrained draws are draw 2's 1
//   THREE WENT 0 RED, AND EACH IS A ROW NOW. H6: the only builders audited here built everything or almost nothing, so "over half built" and "a home" agreed; the row audits a random builder (over half, no home).
//   H21: no builder trained for two iterations builds a home, so a record that always said 0 homes was right by accident; trainOne takes the audit as an argument and the row hands it one whose answer it knows.
//   H28: nothing audited the untrained draws here. H6', H21' and H28' are those again.
//   H29 a training audits with the library's audit whatever it is handed 1
//   H9 (the trainer's environments made with 96 steps whatever the recipe says): 0 RED, AND EQUIVALENT -- brain/rl/dockPolicy.js's evaluate() hands every environment it makes the steps it was given, over
//   whatever the factory would have used, so the factory's own number is never the one flown.
//   THE VERDICT'S (section 5, 2026-11-13), the same runner, each red by name: W1 a FLY score in the file raised to 0.62 6 | W2 T0 reads the fly against the plain net 3 | W3 MORE and LESS swapped 6
//     W4 the audit counts a half-built house a home 2 | W5 the note says the fly builds more 1 | W6 the verdict's T0 pin reads MORE 1 | W7 alpha one in a billion 7 | W8 a random builder's score in the file lowered to 0.40 4
//   2026-11-14, THE THREE COMMANDS PROBED HERE (section 4), this gate and the gates of rounds 2 and 3 run whole for each, every one red by name in one row: K1 round 2's command takes any word (exit 0) | K2 round 3's command
//   prints round 2's usage | K3 this gate probes only its own command | K4 round 3's gate starts a process | K5 round 2's gate starts a process | K6 round 3's command prints its usage to stdout
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as V from "./voxelHome.mjs";
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
// a builder that reads only the observation: the first column of the site with a share still missing (in the site's order that block is always held: buildEnv-selfcheck's E23)
const RULE = { act: (o) => { let c = 0; while (c < 36 && !(o[c] > 0)) c++; return [((c % 6) + 0.5) / 6 * 2 - 1, (Math.floor(c / 6) + 0.5) / 6 * 2 - 1]; } };

console.log("voxelHome-selfcheck -- round 1 of the voxel home: the numbers, one training, the records, the command (the round itself is never run here)\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/VOXEL_HOME_WIP.md");
    ok("!! tools/ship/voxelHome.mjs holds what the registration says: the recipe (96 steps), draws 1 to 16, the five arms and their weight counts, the 200 audit plans 700001 + 7919 k, the 16 random builders 1000 + 7919 k, alpha 0.01, the results file",
        J(V.RECIPE) === J({ maxSteps: 96, iters: 150, pop: 24, sigma: 0.14, lr: 0.05, trainEps: 8 }) && /`iters 150, pop 24, sigma 0\.14, lr 0\.05, trainEps 8, seed s`/.test(note) && /maxSteps: 96/.test(note) && J(V.SEEDS) === J(PF.SEEDS) && /s = 1 to 16/.test(note) &&
        J(V.ARMS) === J(["FLY", "SHUF", "PLAIN", "FISH", "MLP"]) && J(V.WEIGHTS) === J({ FLY: 1777, SHUF: 1777, PLAIN: 1765, FISH: 1617, MLP: 962 }) && ["1,777", "1,765", "1,617", "962"].every((n) => note.includes(n)) &&
        V.AUDIT.length === 200 && V.AUDIT[0] === 700001 && V.AUDIT[199] === 700001 + 7919 * 199 && /700001 \+ 7919 k/.test(note) && V.RANDOM_SEEDS.length === 16 && V.RANDOM_SEEDS[15] === 1000 + 7919 * 15 && /1000 \+ 7919 k/.test(note) && V.ALPHA === 0.01 && V.RESULTS === "brain/voxelHomeRound.jsonl" && note.includes("`" + V.RESULTS + "`"));
    ok("!! THE ARMS: FLY the Giant Fiber Circuit's 313 synapses on 34 units, SHUF the draw's own shuffle of them (shuffledEdges(34, 313, 7000 + s)), PLAIN 41 units and no edge, FISH the Fish1 core's 153, MLP the tree's 40-16-16-2 -- each untrained builder with its registered weight count",
        V.ARMS.every((a) => V.policyOf(a, 1).paramCount() === V.WEIGHTS[a]) && J(V.circuitOf("FLY", 3)) === J(P.ARMS.FLY()) && J(V.circuitOf("SHUF", 3).edges) === J(P.shuffledEdges(34, 313, 7003)) && J(V.circuitOf("SHUF", 3).edges) !== J(V.circuitOf("SHUF", 4).edges) &&
        J(V.circuitOf("PLAIN", 3)) === J({ units: 41, edges: [] }) && V.PLAIN_UNITS === 41 && V.circuitOf("FISH", 1).edges.length === 153 && J(V.MLP_HIDDEN) === J([16, 16]) && throws(() => V.circuitOf("MLP", 1), /no circuit arm MLP/) && throws(() => V.policyOf("WORM", 1), /no arm WORM/));
    const again = V.makeRound(V.ROUND1);
    ok("!! ROUND 1 IS makeRound(ROUND1) (2026-11-14, when round 2 became the same function with another cfg): the named choice, 41 plain units, these weight counts and this results file -- and made again from that cfg it has the same recipe, plans, words and builders", J(V.ROUND1) === J({ choice: "named", plainUnits: 41, weights: { FLY: 1777, SHUF: 1777, PLAIN: 1765, FISH: 1617, MLP: 962 }, results: "brain/voxelHomeRound.jsonl" }) &&
        J(again.RECIPE) === J(V.RECIPE) && J(again.AUDIT) === J(V.AUDIT) && J(again.WORDS) === J(V.WORDS) && again.RESULTS === V.RESULTS && J(Array.from(again.policyOf("FLY", 2).getParams())) === J(Array.from(V.policyOf("FLY", 2).getParams())) && V.policyOf("FLY", 1).outDim === 2 && throws(() => V.makeRound({ choice: "named" }), /a cfg is/));
    ok("a draw's start is its seed's, with every recurrent weight 0", J(Array.from(V.policyOf("FLY", 5).getParams())) === J(Array.from(V.policyOf("FLY", 5).getParams())) && J(Array.from(V.policyOf("FLY", 5).getParams())) !== J(Array.from(V.policyOf("FLY", 6).getParams())) && V.policyOf("FLY", 5).Wrec.every((w) => w === 0));
    const rule = V.auditScore(RULE, V.AUDIT.slice(0, 40)), still = V.auditScore({ act: () => [-1, -1] }, TINY_AUDIT), env = new B.BuildEnv(); let hand = 0; for (const s of TINY_AUDIT) { env.reset(s); for (let t = 0; t < 96; t++) env.step([-1, -1]); hand += 1 - env.missing(); }
    ok("!! THE AUDIT COUNTS SHARES AND HOMES: a builder that takes the first unfinished column builds every one of 40 audit plans whole (score 1, 40 homes); a builder that only ever chooses one corner builds its 4 blocks and no home, the score the share played here by hand",
        rule.score === 1 && rule.homes === 40 && still.homes === 0 && still.score === hand / 3 && still.score > 0 && still.score < 0.1, `${rule.homes} homes; the corner builder ${still.score.toFixed(4)}`);
    const lcg = (x) => () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }, rr = lcg(4242), rand = V.auditScore({ act: () => [rr() * 2 - 1, rr() * 2 - 1] }, V.AUDIT.slice(0, 20));
    ok("!! A HOME IS LOOKED FOR, NOT ASSUMED: a builder choosing columns at random builds more than half of the 20 plans' blocks on average and not one home", rand.score > 0.5 && rand.score < 0.7 && rand.homes === 0, `${rand.score.toFixed(3)}, ${rand.homes} homes`);
    let asked = 0; const counted = { act: () => { asked++; return [1, 1]; } }; V.auditScore(counted, TINY_AUDIT, 7);
    ok("the audit plays every step of every plan (3 plans x 7 steps asked of a builder that places nothing) and none of its plans is the trainer's (5000 + 17 k) or the environment's gate's (1 to 200)", asked === 21 && V.AUDIT.every((s) => s > 5000 + 17 * 23));
    const fl = V.floors(TINY_AUDIT, 12, [1000, 8919]);
    ok("the floors: a score and a count of homes for each random builder, an arm's untrained DRAW 1 (its score audited here, and not draw 2's), the same twice", fl.kind === "floors" && fl.random.length === 2 && fl.randomHomes.length === 2 && fl.random[0] !== fl.random[1] && J(Object.keys(fl.untrained)) === J(V.ARMS) && J(fl) === J(V.floors(TINY_AUDIT, 12, [1000, 8919])) && V.ARMS.every((a) => fl.untrained[a] === V.auditScore(V.policyOf(a, 1), TINY_AUDIT, 12).score) && fl.untrained.FLY !== V.auditScore(V.policyOf("FLY", 2), TINY_AUDIT, 12).score);
});

console.log("\n2. ONE TRAINING (at this gate's own recipe: 12 steps, 2 iterations, draws 901 and 902)");
section(() => {
    const r = V.trainOne("SHUF", 901, TINY, TINY_AUDIT), r2 = V.trainOne("SHUF", 901, TINY, TINY_AUDIT), r3 = V.trainOne("SHUF", 902, TINY, TINY_AUDIT), w = PF.unpackWeights(r.weights);
    const c = { units: 34, edges: P.shuffledEdges(34, 313, 7901) }, fac = ({ obsDim, actDim, seed } = {}) => new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed: seed ?? 1234 }), q = fac({ obsDim: 40, actDim: 2 }); q.setParams(w);
    const direct = trainDockES({ envFactory: (o = {}) => new B.BuildEnv({ maxSteps: 12, ...o }), obsDim: 40, actDim: 2, maxSteps: 12, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901, policyFactory: fac });
    ok("!! ONE TRAINING IS ITS ARM'S AND ITS DRAW'S: the same record twice, the weights those of the trainer called here with the record's recipe and the draw's own shuffle, another draw another wiring and other weights, and the weights in the record are its hash's and give its score and its homes again through that wiring",
        J(r) === J(r2) && PF.hashWeights(direct.params) === r.weightsHash && r.edgesHash === PF.hashEdges(c.edges) && r.edgesHash !== r3.edgesHash && r.weightsHash !== r3.weightsHash && r.kind === "draw" && r.weightCount === 1777 && PF.hashWeights(w) === r.weightsHash && J(V.auditScore(q, TINY_AUDIT, 12)) === J({ score: r.score, homes: r.homes }) && J(r.recipe) === J(TINY));
    let given = null; const told = V.trainOne("FLY", 902, TINY, TINY_AUDIT, (pol, seeds, steps) => { given = [typeof pol.act, seeds, steps]; return { score: 0.625, homes: 7 }; });
    ok("!! A RECORD CARRIES WHAT THE AUDIT SAID, BOTH NUMBERS: handed an audit that answers a share of 0.625 and 7 homes (no builder this small builds one), the record says 0.625 and 7, and the audit was given the trained builder, the plans and the recipe's steps", told.score === 0.625 && told.homes === 7 && J(given) === J(["function", TINY_AUDIT, 12]));
    const m = V.trainOne("MLP", 901, TINY, TINY_AUDIT), pl = V.trainOne("PLAIN", 901, TINY, TINY_AUDIT);
    ok("the MLP arm is the tree's (962 weights, no wiring in its record), the PLAIN arm 41 units with none (1,765), and a draw below 1 is refused", m.weightCount === 962 && m.edges === null && pl.weightCount === 1765 && pl.edges === 0 && pl.units === 41 && throws(() => V.trainOne("FLY", 0, TINY, TINY_AUDIT), /whole number from 1/));
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
        ["an arm's weight count", (L) => { L[idx(L, "PLAIN", 3)].weightCount = 1777; }, /PLAIN draw 3 has 1777 weights \(its arm has 1765\)/],
        ["weights that are not the hash's", (L) => { const r = L[idx(L, "MLP", 5)], w = PF.unpackWeights(r.weights); w[10] += 1; r.weights = PF.packWeights(w); }, /MLP draw 5's weights are not 962 finite numbers with its hash/],
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
    // 2026-11-14 -- THE THREE ROUNDS' COMMANDS ARE PROBED HERE, AS PROCESSES, AND NOT IN THE GATES OF ROUNDS 2 AND 3: the three commands are one shape, and tools/ship/gateAxioms-selfcheck.mjs bounds how many gates start a
    // process (this branch's own gates had taken the count from 77 to 81 against a bound of 80, and the answer is fewer gates that spawn, not a wider bound). The other two gates keep their rows that read the command's source.
    const CMDS = ["takeVoxelHome.mjs", "takeVoxelHomeDrawn.mjs", "takeVoxelHomeLong.mjs"], others = ["brain/voxelHomeDrawnRound.jsonl", "brain/voxelHomeLongRound.jsonl"].map((f) => path.join(ENG, f)), othersOf = () => others.map((f) => `${fs.statSync(f).size}/${fs.statSync(f).mtimeMs}`).join(" "), othersBefore = othersOf();
    const bad = CMDS.map((c) => { const probe = (...a) => spawnSync(process.execPath, [path.join(ENG, "tools", "ship", c), ...a], { encoding: "utf8" }); return [c, [probe(), probe("bogus"), probe("job", "WORM", "1"), probe("job", "FLY", "x"), probe("read", "extra")]]; });
    ok("!! EACH OF THE THREE ROUNDS' COMMANDS refuses what it does not know with ITS OWN usage and exit 2: no word, another word, an arm that is not one, a draw that is not a number, a word too many -- and the results files of rounds 2 and 3 are as they were",
        bad.length === 3 && bad.every(([c, rs]) => rs.length === 5 && rs.every((r) => r.status === 2 && r.stderr.startsWith(`usage: node tools/ship/${c} run [--jobs N] | read | job ARM S`) && r.stdout === "")) && othersOf() === othersBefore, bad.map(([c, rs]) => rs.map((r) => r.status).join("")).join(" "));
    const csrc = src("tools/ship/takeVoxelHome.mjs");
    ok("the command's words are parseArgs' and nothing else's, it refuses a run of no processes itself, and it is the voxel home's: this round's library and results file, not the painting round's", (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/voxelHome\.mjs"/.test(csrc) && !/paintingFly|PAINTING_FLY/.test(csrc));
    const me = src("tools/ship/voxelHome-selfcheck.mjs"), calls = [...me.matchAll(/V\.trainOne\(([^)]*)\)/g)].map((m) => m[1]), probes = [...me.matchAll(/probe\(("[^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: every training here is at its own recipe (12 steps, 2 iterations) on draws 901 and 902 or refused before it starts; the command is never given the word run, nor a job it could do; and the file's size and time are what they were before this section",
        calls.length >= 6 && calls.every((c) => /^"[A-Z]+", (901|902|0), TINY, TINY_AUDIT(, |$)/.test(c)) && TINY.iters === 2 && !V.SEEDS.includes(901) && probes.length === 4 && probes.every((p) => !/"run"/.test(p) && V.parseArgs(JSON.parse(`[${p}]`)) === null) && stateOf() === before, `${calls.length} trainings, ${probes.length + 1} probes, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (round 1; the results were committed at 108df706 before they were read, and are read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = V.reading(lines), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
    ok("!! the results file is the one the run wrote: 82 records, sha256 a6b5ce253d2ae87a...", lines.length === 82 && createHash("sha256").update(bytes).digest("hex") === "a6b5ce253d2ae87a88515cdd3102ddec6f1d570078d2c477d2f598cc781c655a");
    ok("!! THE CHECKS HOLD: 80 draws each once, the registered recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the 16 random builders and the untrained draws", R.checks.length === 0, R.checks.slice(0, 2).join(" | "));
    ok("!! *** T0: A FLY-WIRED BUILDER BUILDS LESS OF A HOME THAN A RANDOM ONE *** -- every one of the 16 trained FLY builders is below every one of the 16 random builders (the fly's ranks sum to 136, the least there is; exact two-sided p 3.3e-9)", R.T0 && R.T0.word === V.WORDS.T0[1] && R.T0.sumA === 136 && R.T0.ties === 0 && R.T0.p < 4e-9 && R.T0.p > 3e-9, R.T0 ? `p ${R.T0.p.toExponential(2)}` : "no test");
    ok("!! *** T1, THE WIRING: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT *** -- the fly's ranks sum to 256 (the middle is 264), exact two-sided p 0.78", R.T1 && R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 256 && R.T1.ties === 0 && near(R.T1.p, 0.78044), R.T1 ? `p ${R.T1.p.toFixed(4)}` : "no test");
    ok("!! *** T2: THE FLY'S WIRING BUILDS WORSE THAN A PLAIN NET OF ITS SIZE *** -- the fly's ranks sum to 141 (196 or less speaks), exact two-sided p 6.3e-8", R.T2 && R.T2.word === V.WORDS.T2[1] && R.T2.sumA === 141 && R.T2.ties === 0 && R.T2.p < 7e-8 && R.T2.p > 6e-8, R.T2 ? `p ${R.T2.p.toExponential(2)}` : "no test");
    const A = R.arms, fl = R.floors, rMean = fl.random.reduce((a, b) => a + b, 0) / 16, rMax = Math.max(...fl.random), rMin = Math.min(...fl.random), draws = lines.filter((r) => r.kind === "draw"), over = (arm) => draws.filter((r) => r.arm === arm && r.score > rMax).length, under = (arm) => draws.filter((r) => r.arm === arm && r.score < rMin).length;
    ok("!! the arms' mean share of a home built, 16 draws each (mean, sd): FLY 0.4295 0.0386, SHUF 0.4339 0.0362, FISH 0.4965 0.0507, PLAIN 0.5536 0.0408, MLP 0.5624 0.0335 -- the more recurrent synapses, the less built; and the 16 random builders 0.5722 +- 0.0028",
        near(A.FLY.mean, 0.4295) && near(A.FLY.sd, 0.0386) && near(A.SHUF.mean, 0.4339) && near(A.SHUF.sd, 0.0362) && near(A.FISH.mean, 0.4965) && near(A.FISH.sd, 0.0507) && near(A.PLAIN.mean, 0.5536) && near(A.PLAIN.sd, 0.0408) && near(A.MLP.mean, 0.5624) && near(A.MLP.sd, 0.0335) && near(rMean, 0.5722) &&
        A.FLY.mean < A.FISH.mean && A.SHUF.mean < A.FISH.mean && A.FISH.mean < A.PLAIN.mean && A.PLAIN.mean < A.MLP.mean);
    ok("!! *** NO ARM'S MEAN REACHES A RANDOM BUILDER'S, AND NO BUILDER BUILT A HOME *** -- every arm's mean is under 0.5722; of the 80 trained builders 9 are above every random builder (5 MLP, 3 PLAIN, 1 FISH, the best 0.618) and 66 below every one (all 16 FLY, all 16 SHUF); and among 80 x 200 audit builds and the random builders' 16 x 200 there is not one home, where the rule builds 200 of 200",
        V.ARMS.every((a) => A[a].mean < rMean) && J(V.ARMS.map(over)) === J([0, 0, 3, 1, 5]) && J(V.ARMS.map(under)) === J([16, 16, 11, 14, 9]) && near(Math.max(...draws.map((r) => r.score)), 0.6181) && V.ARMS.every((a) => A[a].homes === 0 && A[a].bestHomes === 0) && fl.randomHomes.every((h) => h === 0));
    ok("!! THE TRAINING DID MOVE THEM, FROM ALMOST NOTHING: an untrained draw 1 builds 0.011 of a home in every circuit arm and 0.065 in the MLP (a net that is not trained names nearly the same column at every step), so each arm learned to spread its choices -- toward what choosing at random does, and not past it", ["FLY", "SHUF", "PLAIN", "FISH"].every((a) => fl.untrained[a] > 0.010 && fl.untrained[a] < 0.012) && near(fl.untrained.MLP, 0.0655) && V.ARMS.every((a) => A[a].min > 5 * fl.untrained[a]));
    const again = V.ARMS.flatMap((arm) => [3, 11].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore(p); return [arm, s, a.score === r.score && a.homes === r.homes]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS HOMES AGAIN: draws 3 and 11 of every arm, audited here on the 200 plans, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/VOXEL_HOME_WIP.md");
    ok("the expectations, written before the tool, against what came: T0 BUILDS MORE was the 85 percent guess AND WAS WRONG (it builds less); T1 CANNOT BE TOLD APART was the 80 percent guess; T2 WORSE the 50 percent one; the best arm's mean was guessed between 0.65 and 0.85 (60 percent) and is 0.56; a home at all was given 35 percent and there is none",
        /T0: BUILDS MORE about 85 percent/.test(note) && /T1: CANNOT BE TOLD APART about\s+80 percent/.test(note) && /T2: FLY WORSE about 50 percent/.test(note) && /between 0\.65 and 0\.85: about 60 percent/.test(note) && Math.max(...V.ARMS.map((a) => A[a].mean)) < 0.65);
    ok("the registration's RESULT SECTION (section 10, and not the list of possible words in section 4) carries the three readings' words", /## 10\. The result/.test(note) && [["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word]].every(([t, w]) => note.slice(note.indexOf("## 10. The result")).includes(`**${t}: ${w}**`)));
});

console.log(`\nvoxelHome-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
