// WebGLEngine/tools/ship/flyEscape-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscape-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations with 4 flies tried on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND (registered in brain/FLY_ESCAPE_WIP.md before tools/ship/flyEscape.mjs existed). The environment has its own gate (tools/ship/escapeEnv-selfcheck.mjs), the exact rank-sum
// its own (tools/ship/paintingFly-selfcheck.mjs section 3) and the sign test its own (tools/ship/voxelHomeLean-selfcheck.mjs section 4); this one holds the round.
//   1  THE ROUND'S NUMBERS   the library holds what the registration says: the recipe, the five arms and their weight counts, the audit, the floors, the words
//   2  ONE TRAINING          a record is its arm's and its draw's; its weights are the trainer's called here by hand and give its score again
//   3  THE RECORDS           the registration's checks, each failing by name; the two sign tests and the two rank-sums and their words
//   4  THE COMMAND           its words as arithmetic; it is this round's; this gate starts no training of the round's and no process (the command as a process: tools/ship/voxelHome-selfcheck.mjs section 4)
//   5  THE VERDICT           the committed results, read from the file: the four tests, the arms beside the flies written by hand, what the trained flies do, the trainer's part in it, the expectations
// ONE LOOK BEFORE THE ROUND, SAID: to state the cost, one training of 2 iterations with 8 flies tried was timed on draw 901 (which the round does not use); its two history readings were both 0.5 (an
// untrained fly of that draw hides). Nothing else was trained before the round's own run.
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and tools/ship/voxelHome-selfcheck.mjs run whole for each; the number is the rows red:
//   F1 24 flies tried an iteration 3 | F2 PLAIN 54 units 4 | F3 SHUF the fly's own wiring 5 | F5 every training seeded as draw 1 1 | F6 the audit of the untrained fly 1 | F7 the score the sum 2
//   F8 lived counts the caught 2 | F9 every pass counts as left-for 1 | F10 T0 against fleeAll 3 | F11 T3 against the reflex 2 | F12 T3 reads only the FLY flies 3 | F13 T1 reads the plain net 1
//   F14 the sign tests' BETTER and WORSE each other's 3 | F15 the rank-sums' 1 | F16 the tests made with a check failed 1 | F17 the floors not checked 1 | F18 the recipe not checked 2 | F19 the wiring not checked 1
//   F20 the fly told the kind told only that something is there 1 | F21 the command reads a voxel-home library 1 | F22 the command exits 0 on a word it does not know 1 (voxelHome-selfcheck) | F23 the MLP 8-8 4
//   F25 the history's return is the share that lived 1 | F26 another 200 audit episodes 1 | F27 the registered reflex floor 0.70 3 | F4' a training's wiring is draw 1's 1
//   TWO WENT 0 RED. F4 IS A ROW NOW: a SHUF record's wiring was read from its draw and its training was not -- the row trains SHUF draw 901 by hand on its own shuffle. F4' is F4 again.
//   F24 IS EQUIVALENT (a training's environments made without the recipe's length): the trainer hands the length to the factory itself (dockPolicy.js evaluate: mk({ maxSteps })), as logged for the voxel home.
//   THE VERDICT'S (section 5, 2026-11-14), this gate run whole for each, every one red by name: V1 MLP draw 9's score in the file lowered to 0.50 4 | V2 a FLY score in the file raised to 0.70 6
//   V3 the sign tests' BETTER and WORSE swapped 6 | V4 T1 reads the fly against the MLP 2 | V5 the note's T3 says BETTER 1 | V6 the note's T1 says BETTER 1
//   V7 the environment reports docked for a fly that fed most (the row on the trainer's part) 1 | V8 a pass counts as left-for only if the fly reached home 2
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscape.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as GFC from "../../brain/gfcTopology.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: 40, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2 }), TINY_AUDIT = [880001, 880002, 880003, 880004, 880005, 880006];

console.log("flyEscape-selfcheck -- the escape round: the numbers, one training, the records, the command (the round itself is never run here)\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_WIP.md");
    ok("!! THE RECIPE IS THE REGISTRATION'S: 160 ticks, 150 iterations, 96 flies tried an iteration, sigma 0.14, lr 0.05, 8 episodes a fly; 16 draws; alpha 0.01; the results file", J(V.RECIPE) === J({ maxSteps: 160, iters: 150, pop: 96, sigma: 0.14, lr: 0.05, trainEps: 8 }) && /`maxSteps 160, iters 150, pop 96, sigma 0\.14, lr 0\.05, trainEps 8`/.test(note) && J(V.SEEDS) === J(Array.from({ length: 16 }, (_, k) => k + 1)) && V.ALPHA === 0.01 && V.RESULTS === "brain/flyEscapeRound.jsonl" && note.includes("`" + V.RESULTS + "`") && V.RECIPE.maxSteps === E.MAX_STEPS);
    const counts = V.ARMS.map((a) => [a, V.policyOf(a, 2).getParams().length]);
    ok("!! THE FIVE ARMS AND THEIR WEIGHT COUNTS ARE THE REGISTRATION'S, with 13 inputs and 1 output: FLY 824 and SHUF 824, PLAIN 826 (55 units), FISH 664, MLP 513 -- each the count of the policy this file builds", J(V.ARMS) === J(["FLY", "SHUF", "PLAIN", "FISH", "MLP"]) && J(Object.fromEntries(counts)) === J(V.WEIGHTS) && J(V.WEIGHTS) === J({ FLY: 824, SHUF: 824, PLAIN: 826, FISH: 664, MLP: 513 }) && V.PLAIN_UNITS === 55 && J(V.MLP_HIDDEN) === J([16, 16]) &&
        ["| FLY | 34 units, the Giant Fiber Circuit's 313 connections | 824 |", "| PLAIN | 55 units", "| 826 |", "| 664 |", "| 513 |"].every((t) => note.includes(t)) && P.weightCountOf(13, 1, 34, 313) === 824 && Math.abs(P.weightCountOf(13, 1, 55, 0) - 824) < Math.abs(P.weightCountOf(13, 1, 54, 0) - 824));
    const fly = V.circuitOf("FLY", 3), sh3 = V.circuitOf("SHUF", 3), sh4 = V.circuitOf("SHUF", 4), fish = V.circuitOf("FISH", 3), plain = V.circuitOf("PLAIN", 3);
    ok("!! THE WIRING IS EACH ARM'S: FLY's 313 connections are the Giant Fiber Circuit's own list among its 34 cells, whatever the draw; a SHUF draw's are 313 other places, its draw's and no other's (shuffledEdges(34, 313, 7000 + s)); FISH 153 among 34; PLAIN none among 55; the MLP has no circuit",
        J(fly.edges) === J(GFC.EDGES.map((e) => [e[0], e[1]])) && fly.units === 34 && fly.edges.length === 313 && J(V.circuitOf("FLY", 9).edges) === J(fly.edges) && sh3.edges.length === 313 && J(sh3.edges) === J(P.shuffledEdges(34, 313, 7003)) && J(sh3.edges) !== J(sh4.edges) && PF.hashEdges(sh3.edges) !== PF.hashEdges(fly.edges) && fish.edges.length === 153 && fish.units === 34 && plain.units === 55 && plain.edges.length === 0 && throws(() => V.circuitOf("MLP", 1), /no circuit arm MLP/) && throws(() => V.policyOf("WORM", 1), /no arm WORM/));
    const start = new P.CircuitPolicy({ obsDim: 13, actDim: 1, units: 34, edges: fly.edges, seed: 2 });
    ok("a draw's untrained fly is paintCircuitPolicy's for its seed (FLY draw 2, weight for weight), and two draws start apart", J(arr(V.policyOf("FLY", 2).getParams())) === J(arr(start.getParams())) && J(arr(V.policyOf("FLY", 2).getParams())) !== J(arr(V.policyOf("FLY", 3).getParams())));
    const fl = V.floors();
    ok("!! THE AUDIT IS THE FLOORS' 200 EPISODES AND THE FLOORS ARE THE REGISTRATION'S FIVE NUMBERS, computed here: freeze 0.2840, hide 0.5000, fleeAll 0.5395, reflex 0.6465, a fly told each mover's kind 0.8351 -- and they are the numbers in the note",
        J(V.AUDIT) === J(Array.from({ length: 200 }, (_, k) => 900001 + 7919 * k)) && J(V.FLOORS) === J({ freeze: 0.2840, hide: 0.5000, fleeAll: 0.5395, reflex: 0.6465, told: 0.8351 }) && Object.keys(V.FLOORS).every((k) => near(fl[k].score, V.FLOORS[k])) && fl.kind === "floors" && fl.fleeAll.alive === 198 && fl.reflex.alive === 156 && fl.told.alive === 198 &&
        /freeze 0\.2840, hide 0\.5000, \*\*fleeAll\s+0\.5395\*\*/.test(note) && /\*\*reflex 0\.6465\*\*/.test(note) && /which no observation carries: 0\.8351/.test(note));
    ok("the words are the registration's, three a test", Object.values(V.WORDS).every((w) => w.length === 3) && Object.values(V.WORDS).flat().every((w) => note.replace(/\s+/g, " ").includes(w) || note.replace(/\s+/g, " ").includes(w.replace(/^(A FLY-WIRED FLY|A TRAINED FLY|THE FLY'S WIRING) /, "... "))) && V.WORDS.T1[2] === "THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT" && note.includes("`A TRAINED FLY ESCAPES BETTER THAN FLEEING FROM EVERYTHING`") && note.includes("`A FLY-WIRED FLY ESCAPES BETTER THAN THE REFLEX WRITTEN BY HAND`"));
});

console.log("\n2. ONE TRAINING (2 iterations, 4 flies tried, 40 ticks, on draw 901)");
section(() => {
    const r = V.trainOne("FLY", 901, TINY, TINY_AUDIT), m = V.trainOne("MLP", 901, TINY, TINY_AUDIT), sh = V.trainOne("SHUF", 901, TINY, TINY_AUDIT), c = P.ARMS.FLY(901);
    const common = { envFactory: (o = {}) => new E.EscapeEnv({ maxSteps: 40, ...o }), obsDim: 13, actDim: 1, maxSteps: 40, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901 };
    const direct = trainDockES({ ...common, policyFactory: ({ obsDim, actDim, seed }) => new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed }) }), directM = trainDockES({ ...common, hidden: [16, 16] });
    ok("!! A RECORD IS ITS ARM'S AND ITS DRAW'S: FLY's weights are the trainer's called here by hand on the escape environment with the fly's circuit, to the hash; the MLP's are the trainer's own default 16-16 net's for that seed; each carries its arm's weight count, its wiring, the recipe it was given and the trainer's history",
        PF.hashWeights(direct.params) === r.weightsHash && r.weightCount === 824 && r.units === 34 && r.edges === 313 && r.edgesHash === PF.hashEdges(c.edges) && J(r.recipe) === J(TINY) && PF.hashWeights(directM.params) === m.weightsHash && m.weightCount === 513 && m.units === null && m.edgesHash === null &&
        J(r.history) === J(direct.history.map((h) => ({ it: h.it, ret: h.avgReturn, lived: h.dockRate }))) && J(r.history.map((h) => h.it)) === J([0, 1]) && r.history.every((h) => h.ret >= 0 && h.ret <= 1 && h.lived >= 0 && h.lived <= 1) && sh.edgesHash === PF.hashEdges(P.shuffledEdges(34, 313, 7901)) && sh.edgesHash !== r.edgesHash && sh.weightsHash !== r.weightsHash);
    const directS = trainDockES({ ...common, policyFactory: ({ obsDim, actDim, seed }) => new P.CircuitPolicy({ obsDim, actDim, units: 34, edges: P.shuffledEdges(34, 313, 7901), seed }) });
    ok("!! A SHUFFLED FLY IS TRAINED ON ITS OWN DRAW'S SHUFFLE, not another's: SHUF draw 901's weights are the trainer's called here by hand with the 313 places of shuffledEdges(34, 313, 7901), to the hash", PF.hashWeights(directS.params) === sh.weightsHash && J(P.shuffledEdges(34, 313, 7901)) !== J(P.shuffledEdges(34, 313, 7001)));
    const again = [["FLY", r], ["MLP", m]].map(([arm, rec]) => { const p = V.policyOf(arm, 901); p.setParams(PF.unpackWeights(rec.weights)); const a = V.auditScore((o) => p.act(o), TINY_AUDIT, 40); return J(a) === J({ score: rec.score, alive: rec.alive, fed: rec.fed, strikes: rec.strikes, caught: rec.caught, passes: rec.passes, fledPass: rec.fledPass }); });
    ok("!! THE WEIGHTS GIVE THE SCORE AGAIN: a record's weights in its arm's fly, audited on the same episodes, give its score, the episodes it lived, the time it fed and its counts of strikes, catches, passes and passes fled, to the bit", again.every(Boolean));
    const hide = V.auditScore(E.RULES.hide, TINY_AUDIT, 160), told = V.auditScore((o, env) => [env.mover && env.mover.kind === "strike" ? 1 : -1], TINY_AUDIT, 160), freeze = V.auditScore(E.RULES.freeze, TINY_AUDIT, 160);
    ok("!! THE AUDIT COUNTS WHAT HAPPENED (six episodes of 160 ticks): the fly that hides scores 0.5 exactly, lives every episode, feeds nothing, is caught by no strike and has left its food for every pass; the fly that freezes leaves for none and is caught by every strike it meets; the fly told the kind is away from its food during 1 pass of 12 (a pass counts as left-for when the fly was off its food at any tick of it, and this one came while the fly was walking back from a strike)", hide.score === 0.5 && hide.alive === 6 && hide.fed === 0 && hide.caught === 0 && hide.fledPass === hide.passes && freeze.fledPass === 0 && freeze.caught === freeze.strikes && freeze.alive === 6 - freeze.caught && told.fledPass === 1 && told.passes === 12 && hide.passes > 3 && hide.strikes > 3);
    ok("a draw that is not a whole number from 1 is refused", throws(() => V.trainOne("FLY", 0, TINY, TINY_AUDIT), /a draw is a whole number from 1/) && throws(() => V.trainOne("FLY", 1.5, TINY, TINY_AUDIT), /a draw is a whole number from 1/));
});

console.log("\n3. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, ret: 0.5 + k / 100 + s / 10000, lived: 1 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "MLP" ? null : V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c ? c.units : null, edges: c ? c.edges.length : null, edgesHash: c ? PF.hashEdges(c.edges) : null, weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), score, alive: 190, fed: 0.4, strikes: 400, caught: 10, passes: 300, fledPass: 60, history: hist(s) }; };
    const flo = () => ({ kind: "floors", ...Object.fromEntries(Object.entries(V.FLOORS).map(([k, v]) => [k, { score: v, alive: 150, fed: 0.3, strikes: 400, caught: 40, passes: 300, fledPass: 80 }])) });
    const file = (scoreOf) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, flo()); return out; };
    const jit = (arm, s) => ((s * 7 + V.ARMS.indexOf(arm) * 3) % 16) / 10000, good = file((arm, s) => 0.70 + jit(arm, s)), clone = () => JSON.parse(J(good)), at = (L, arm, s) => L.find((r) => r.arm === arm && r.s === s), fl = (L) => L.find((r) => r.kind === "floors");
    ok("!! a file of 80 draws, the recheck and the registration's floors passes every check", V.checkRecords(good).length === 0 && good.length === 82, V.checkRecords(good).slice(0, 2).join(" | "));
    const broken = [
        ["a draw missing", (L) => { L.splice(L.indexOf(at(L, "FISH", 9)), 1); }, /FISH draw 9 is there 0 times/],
        ["a draw twice", (L) => { L.push(JSON.parse(J(at(L, "PLAIN", 4)))); }, /PLAIN draw 4 is there 2 times/],
        ["another recipe", (L) => { at(L, "FLY", 3).recipe.pop = 24; }, /FLY draw 3 was trained with another recipe/],
        ["an arm that is not one", (L) => { at(L, "MLP", 5).arm = "WORM"; }, /WORM draw 5 is not a registered draw/],
        ["a weight count that is not the arm's", (L) => { at(L, "PLAIN", 2).weightCount = 824; }, /PLAIN draw 2 has 824 weights \(its arm has 826\)/],
        ["weights that are not the record's hash", (L) => { at(L, "FLY", 2).weightsHash = "0000000000000000"; }, /FLY draw 2's weights are not 824 finite numbers with its hash/],
        ["a SHUF draw with the fly's wiring", (L) => { const r = at(L, "SHUF", 6), f = at(L, "FLY", 6); r.edgesHash = f.edgesHash; }, /SHUF draw 6's wiring is not its arm's/],
        ["a SHUF draw with another draw's shuffle", (L) => { at(L, "SHUF", 6).edgesHash = at(L, "SHUF", 7).edgesHash; }, /SHUF draw 6's wiring is not its arm's/],
        ["a score above 1", (L) => { at(L, "FISH", 8).score = 1.2; }, /FISH draw 8 has no score that is a share/],
        ["no count of episodes lived", (L) => { delete at(L, "MLP", 8).alive; }, /MLP draw 8 has no count of episodes lived/],
        ["no history", (L) => { delete at(L, "FLY", 7).history; }, /FLY draw 7 has no history from iteration 0 to 149/],
        ["a history that stops early", (L) => { at(L, "SHUF", 7).history.pop(); }, /SHUF draw 7 has no history from iteration 0 to 149/],
        ["no recheck", (L) => { L.splice(L.findIndex((r) => r.kind === "recheck"), 1); }, /FLY draw 1 trained a second time is not there once/],
        ["a recheck with other weights", (L) => { L.find((r) => r.kind === "recheck").weightsHash = "ffff"; }, /FLY draw 1 trained a second time/],
        ["no floors", (L) => { L.splice(L.indexOf(fl(L)), 1); }, /the floors are not there once with the registration's five numbers/],
        ["a reflex floor that is not the registration's", (L) => { fl(L).reflex.score = 0.60; }, /the floors are not there once with the registration's five numbers/],
        ["floors without the fly told the kind", (L) => { delete fl(L).told; }, /the floors are not there once/],
    ];
    const res = broken.map(([name, f, re]) => { const L = clone(); f(L); const bad = V.checkRecords(L); return [name, bad.some((b) => re.test(b)), bad[0]]; });
    ok(`!! EACH CHECK FAILS BY NAME (${broken.length}: ${broken.map((b) => b[0]).join("; ")})`, res.every((r) => r[1]), res.filter((r) => !r[1]).map((r) => `${r[0]}: ${r[2]}`).join(" | "));
    const Rbad = (() => { const L = clone(); at(L, "FLY", 3).recipe.pop = 24; return V.reading(L); })();
    ok("!! WITH A FAILED CHECK THE READING IS NOT WEIGHED: none of the four tests is made, and the first line says so", Rbad.T0 === null && Rbad.T1 === null && Rbad.T2 === null && Rbad.T3 === null && /A CHECK FAILED/.test(V.readingLines(Rbad)[0]));
    const hi = V.reading(good), lo = V.reading(file((arm, s) => 0.52 + jit(arm, s))), mid = V.reading(file((arm, s) => 0.60 + jit(arm, s)));
    ok("!! T3 READS ALL 80 TRAINED FLIES AGAINST fleeAll'S SCORE IN THE FILE (0.5395) AND T0 THE 16 FLY FLIES AGAINST THE REFLEX'S (0.6465): all at 0.70 -> both BETTER (80 above, 16 above); all at 0.52 -> both WORSE; all at 0.60 -> T3 BETTER and T0 WORSE (between the two floors)",
        hi.T3.word === V.WORDS.T3[0] && hi.T3.above === 80 && near(hi.T3.ref, 0.5395) && hi.T0.word === V.WORDS.T0[0] && hi.T0.above === 16 && near(hi.T0.ref, 0.6465) && lo.T3.word === V.WORDS.T3[1] && lo.T0.word === V.WORDS.T0[1] && mid.T3.word === V.WORDS.T3[0] && mid.T0.word === V.WORDS.T0[1] && hi.T0.sign === true);
    const flyOnly = V.reading(file((arm, s) => (arm === "FLY" ? 0.70 : 0.50) + jit(arm, s))), few = V.reading(file((arm, s) => (s <= 13 ? 0.70 : 0.60) + jit(arm, s)));
    ok("!! ...EACH ITS OWN FLIES: with the FLY flies at 0.70 and the other 64 at 0.50, T0 says BETTER and T3 WORSE (16 above, 64 below); with 13 of each arm's 16 above the reflex and 3 below it, T0 CANNOT BE TOLD APART (14 speaks)", flyOnly.T0.word === V.WORDS.T0[0] && flyOnly.T3.word === V.WORDS.T3[1] && flyOnly.T3.above === 16 && flyOnly.T3.below === 64 && few.T0.word === V.WORDS.T0[2] && few.T0.above === 13 && few.T0.below === 3);
    const wire = (fly, shuf, plain) => V.reading(file((arm, s) => (arm === "FLY" ? fly : arm === "SHUF" ? shuf : arm === "PLAIN" ? plain : 0.7) + jit(arm, s)));
    const a = wire(0.75, 0.70, 0.80), b = wire(0.70, 0.75, 0.65), c0 = V.reading(file((arm, s) => 0.70 + ((s * 5 + V.ARMS.indexOf(arm) * 7) % 16) / 10000));
    ok("!! T1 IS FLY AGAINST SHUF AND T2 FLY AGAINST PLAIN, EXACT RANK-SUMS: FLY above SHUF and below PLAIN -> T1 BETTER (the ranks sum to 392), T2 WORSE (136); the other way round -> T1 WORSE, T2 BETTER; among each other -> both CANNOT BE TOLD APART; and the fish's and the MLP's scores move neither",
        a.T1.word === V.WORDS.T1[0] && a.T1.sumA === 392 && a.T2.word === V.WORDS.T2[1] && a.T2.sumA === 136 && b.T1.word === V.WORDS.T1[1] && b.T2.word === V.WORDS.T2[0] && c0.T1.word === V.WORDS.T1[2] && c0.T2.word === V.WORDS.T2[2] && !a.T1.sign);
    const lines = V.readingLines(hi).join("\n");
    ok("the reading carries each arm's mean, the episodes its flies live, the time they feed, the share of passes they leave for and of strikes that catch them, and its history; its lines say them, the five floors beside them, and the four tests in their own form",
        near(hi.arms.FLY.alive, 190) && near(hi.arms.FLY.fed, 0.4) && near(hi.arms.FLY.fledPass, 0.2) && near(hi.arms.FLY.caught, 0.025) && hi.arms.FLY.history.length === 7 && /FLY +16 +0\.70/.test(lines) && /reflex +0\.6465 +lives 150/.test(lines) && /told the kind +0\.8351/.test(lines) && /FLY +the trainer's own battery, mean return at iteration 0: /.test(lines) &&
        /T3 \(all the trained flies against fleeAll\): of 80, 80 above its 0\.5395, 0 below, 0 equal/.test(lines) && /T0 \(FLY against the reflex\): of 16, 16 above its 0\.6465/.test(lines) && /T1 \(FLY against SHUF\): the fly's ranks sum to/.test(lines) && lines.includes(V.WORDS.T3[0]));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "WORM", "1"], ["job", "FLY", "x"], ["job", "FLY", "0"], ["job", "FLY", "17"], ["job", "FLY"], ["run", "--jobs", "0"], ["run", "--jobs"], ["run", "4"], ["read", "extra"]];
    ok("!! THE COMMAND'S WORDS, AS ARITHMETIC (parseArgs, never the command): run is four processes or --jobs of at least 1, read takes nothing, job takes a registered arm and a draw 1 to 16 -- and eleven other shapes are not words",
        J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FISH", "16"])) === J({ cmd: "job", arm: "FISH", s: 16 }) && no.every((a) => V.parseArgs(a) === null) && V.parseArgs("run") === null);
    const csrc = src("tools/ship/takeFlyEscape.mjs");
    ok("!! the command is this round's -- its library and no voxel-home round's -- reads its words through parseArgs alone, refuses a run of no processes itself, trains FLY draw 1 a second time and writes the floors",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscape\.mjs"/.test(csrc) && !/voxelHome/.test(csrc) && /jobOnce\("FLY", 1\)/.test(csrc) && /JSON\.stringify\(PF\.floors\(\)\)/.test(csrc) && /PF\.trainOne\(args\.arm, args\.s\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscape\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyEscape-selfcheck.mjs"), calls = [...me.matchAll(/V\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its trainings are of 2 iterations with 4 flies tried on draw 901, or refused before they start; this gate starts no process at all (the command is never run from here); and the file's size and time are what they were before this section",
        calls.length === 5 && calls.every((c) => /^"[A-Z]+", (901|0|1\.5), TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 4 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (the results were committed at 2af0cdf3 before they were read, and are read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = V.reading(lines), A = R.arms, draws = lines.filter((r) => r.kind === "draw");
    ok("!! the results file is the one the run wrote: 82 records, sha256 4c5a48c4100f5fc1...", lines.length === 82 && createHash("sha256").update(bytes).digest("hex") === "4c5a48c4100f5fc1db61f0b499b1b3e3828f11c832d21403b7a1e3604f1d2569");
    ok("!! THE CHECKS HOLD: 80 draws each once, the registered recipe, each arm's weight count and wiring, FLY draw 1 the same twice, a history in every record, the registration's five floors", R.checks.length === 0, R.checks.slice(0, 2).join(" | "));
    ok("!! *** T3: A TRAINED FLY ESCAPES WORSE THAN FLEEING FROM EVERYTHING *** -- of the 80 trained flies 79 score below the fly that goes home for everything (0.5395) and 1 above (MLP draw 9, 0.5453); exact two-sided p 1.3e-22. TRAINING DID NOT LEARN TO TELL A STRIKE FROM A PASS",
        R.T3 && R.T3.word === V.WORDS.T3[1] && R.T3.above === 1 && R.T3.below === 79 && R.T3.ties === 0 && R.T3.p < 2e-22 && near(R.T3.ref, 0.5395) && J(draws.filter((r) => r.score > R.T3.ref).map((r) => [r.arm, r.s])) === J([["MLP", 9]]) && near(Math.max(...draws.map((r) => r.score)), 0.5453));
    ok("!! *** T0: A FLY-WIRED FLY ESCAPES WORSE THAN THE REFLEX WRITTEN BY HAND *** -- all 16 below the reflex's 0.6465 (exact two-sided p 2 / 65536)", R.T0 && R.T0.word === V.WORDS.T0[1] && R.T0.below === 16 && R.T0.above === 0 && R.T0.p === 2 / 65536 && near(R.T0.ref, 0.6465));
    ok("!! *** T1 AND T2, THE WIRING: THE FLY'S CANNOT BE TOLD APART FROM A SHUFFLE OF IT (the ranks sum to 284, p 0.47) NOR FROM A PLAIN NET OF ITS SIZE (297, p 0.22) *** -- on the task its circuit is for; the sixth round to say the first. And it is a comparison among flies none of which learned the task", R.T1 && R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 284 && near(R.T1.p, 0.46767) && R.T2 && R.T2.word === V.WORDS.T2[2] && R.T2.sumA === 297 && near(R.T2.p, 0.22401));
    ok("!! the arms' mean scores, 16 draws each (mean, sd): PLAIN 0.5173 0.0083, SHUF 0.5176 0.0104, FISH 0.5178 0.0077, MLP 0.5189 0.0116, FLY 0.5208 0.0084 -- all five within four thousandths, between the fly that hides (0.5000) and the fly that goes home for everything (0.5395); the least trained fly 0.494, 79 of 80 above 0.5",
        near(A.PLAIN.mean, 0.5173) && near(A.PLAIN.sd, 0.0083) && near(A.SHUF.mean, 0.5176) && near(A.SHUF.sd, 0.0104) && near(A.FISH.mean, 0.5178) && near(A.FISH.sd, 0.0077) && near(A.MLP.mean, 0.5189) && near(A.MLP.sd, 0.0116) && near(A.FLY.mean, 0.5208) && near(A.FLY.sd, 0.0084) &&
        Math.max(...V.ARMS.map((a) => A[a].mean)) - Math.min(...V.ARMS.map((a) => A[a].mean)) < 0.004 && near(Math.min(...draws.map((r) => r.score)), 0.4940) && draws.filter((r) => r.score > 0.5).length === 79);
    const fled = draws.reduce((n, r) => n + r.fledPass, 0), passes = draws.reduce((n, r) => n + r.passes, 0), caught = draws.reduce((n, r) => n + r.caught, 0), strikes = draws.reduce((n, r) => n + r.strikes, 0);
    ok("!! *** WHAT THE TRAINED FLIES DO: THEY GO HOME FOR EVERYTHING, AND FEED A LITTLE LESS THAN THE FLY WRITTEN TO *** -- they are off their food for 32,963 of the 33,009 passes they meet (the reflex: a quarter of its); they feed 0.07 to 0.09 of the time by arm (fleeAll 0.089, the reflex 0.51); 605 of 43,504 strikes catch one (1.4 percent; fleeAll 0.4); they live in 190 to 193 of 200 episodes by arm",
        fled === 32963 && passes === 33009 && caught === 605 && strikes === 43504 && V.ARMS.every((a) => A[a].fed > 0.068 && A[a].fed < 0.092 && A[a].alive >= 190 && A[a].alive < 193.4 && A[a].fledPass > 0.995) && near(R.floors.fleeAll.fed, 0.089, 5e-4) && near(R.floors.reflex.fed, 0.513, 5e-4) && near(R.floors.reflex.fledPass / R.floors.reflex.passes, 0.247, 5e-4));
    const H = (a) => A[a].history.map((h) => h.ret);
    ok("!! THE HISTORY: THE TRAINER'S OWN BATTERY NEVER LEAVES THE FLY THAT HIDES -- every arm's mean return is 0.44 to 0.48 at iteration 0, 0.47 to 0.49 at iteration 149 (to two places), and at no reading of any arm above 0.52 (hiding all day is 0.5)",
        V.ARMS.every((a) => H(a).length === 7 && H(a)[0] > 0.43 && H(a)[0] < 0.485 && H(a)[6] > 0.465 && H(a)[6] < 0.491 && H(a).every((v) => v < 0.52)) && near(H("FLY")[0], 0.4358) && near(H("FLY")[6], 0.4805));
    const lib = src("brain/rl/dockPolicy.js"), env = src("brain/rl/escapeEnv.mjs");
    ok("!! *** SAID AFTER THE READING, AND IT IS MINE: THE TRAINER KEEPS THE WEIGHTS THAT LIVED MOST, NOT THE WEIGHTS THAT RETURNED MOST *** -- trainDockES hands back the iteration that scored best by `dockRate x 1000 - avgDist`, and the escape environment reports `docked` as LIVED (its default report, and this round's; round 2 has the option `return`): so of 150 iterations it keeps the one whose flies survived most on its 24 episodes, which is the one that hid most. The registration did not see this. It is not the whole of the result -- the history above is the trainer's own running weights, and they do not learn either -- but it is a thumb on the scale toward hiding",
        /const score = ev\.dockRate \* 1000 - ev\.avgDist - \(ev\.avgCrashes \|\| 0\) \* 200;/.test(lib) && /if \(score > best\.score\) best = \{ params: theta\.slice\(\), score, ev \};/.test(lib) && /return \{ params: best\.params, history, best: best\.ev \};/.test(lib) && /docked: this\.report === "lived" && done && !this\.caught, crashed: this\.report === "lived" && this\.caught/.test(env) && /this\.report = opts\.report \|\| "lived";/.test(env) && V.makeEscapeRound(V.ROUND1).REPORT === "lived" && V.makeEscapeRound(V.ROUND1).START === null);
    const again = V.ARMS.flatMap((arm) => [5, 9].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore((o) => p.act(o)); return [arm, s, a.score === r.score && a.alive === r.alive && a.fledPass === r.fledPass && a.caught === r.caught]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS COUNTS AGAIN: draws 5 and 9 of every arm (the one fly above fleeAll among them), audited here on the 200 episodes, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/FLY_ESCAPE_WIP.md"), res = note.slice(note.indexOf("## 11. The result"));
    ok("the expectations, written before the tool, against what came: T3 BETTER was given 85 percent and came WORSE -- the guess most wrong of any round; T0 came as the 15 (WORSE), not the 55 (BETTER); T1 CANNOT BE TOLD APART the 70 and T2 the 60, and both came; the best arm above 0.75 was given 35 and is 0.52",
        /T3: BETTER about 85 percent/.test(note) && /T0: BETTER about 55, CANNOT about 30, WORSE about 15/.test(note) && /T1: CANNOT BE TOLD APART about 70 percent/.test(note) && /T2: CANNOT about 60/.test(note) && /above 0\.75: about 35 percent/.test(note) && Math.max(...V.ARMS.map((a) => A[a].mean)) < 0.53);
    ok("the registration's RESULT SECTION (section 11, and not the list of possible words in section 5) carries the four readings' words", /## 11\. The result/.test(note) && [["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word], ["T3", R.T3.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)));
});

console.log(`\nflyEscape-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
