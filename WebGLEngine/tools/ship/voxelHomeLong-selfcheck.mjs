// WebGLEngine/tools/ship/voxelHomeLong-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/voxelHomeLong-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 2 and 4 iterations on draws the round does not use, and the command is never given the word `run`)
//
// THE GATE OF THE VOXEL HOME'S ROUND 3, THE LONGER TRAINING (registered in brain/VOXEL_HOME_LONG_WIP.md before tools/ship/voxelHomeLong.mjs existed). The round is tools/ship/voxelHome.mjs's makeRound()
// with round 2's cfg and three keys more, so what the gates of rounds 1 and 2 hold of the shared code is held of this round too; this gate holds the three keys.
//   1  THE ROUND'S NUMBERS   round 2's cfg, 1,000 iterations, the history, round 2's file as `before`
//   2  ONE TRAINING          a record carries the trainer's own history, and a longer training starts as the shorter one did
//   3  THE RECORDS           the two new checks, each failing by name; T3 and its words; the arms' histories
//   4  THE COMMAND           its words as arithmetic; it reads round 2's file for T3; this gate starts no training of the round's
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and the gates of rounds 2 and 1 run whole for each; every one red by name
// (the three numbers are the rows that went red here, in tools/ship/voxelHomeDrawn-selfcheck.mjs and in tools/ship/voxelHome-selfcheck.mjs):
//   Z1 round 3 trains 150 iterations after all 5, 0, 0 | Z2 the cfg's iterations are ignored 5, 0, 0 | Z3 no record carries a history 2, 0, 0 | Z4 every round's records carry a history 1, 9, 8
//   Z5 the history is the trainer's return, not its share missing 1, 0, 0 | Z6 the history check gone 1, 0, 0 | Z7 a history may stop early 1, 0, 0 | Z8 the earlier round's file is not checked 2, 0, 0
//   Z9 T3 reads round 2's PLAIN 2, 0, 0 | Z11 T3's MORE and LESS are each other's 1, 0, 0 | Z12 round 3's before is its own file 2, 0, 0 | Z13 the command does not hand round 2's records to the reading 1, 0, 0
//   Z14 round 3 writes round 2's results file 1, 0, 0 | Z15 the arms' history is draw 1's, not the mean 1, 0, 0 | Z16 a failed check still gives T3 1, 0, 0 | Z17 round 2 is given a before 0, 9, 0
//   Z10' T3 reads this round's SHUF against round 2's FLY 1, 0, 0
//   ONE WENT 0 RED, AND IS A ROW NOW: Z10 -- every file made here had its FLY and its SHUF drawn alike, so which of them T3 read could not show; the row sets them apart. Z10' is Z10 again.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as V from "./voxelHomeLong.mjs";
import * as V2 from "./voxelHomeDrawn.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as B from "../../brain/rl/buildEnv.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8");
const TINY = Object.freeze({ maxSteps: 12, iters: 4, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2 }), TINY2 = Object.freeze({ ...TINY, iters: 2 }), TINY_AUDIT = [880001, 880002, 880003];

console.log("voxelHomeLong-selfcheck -- round 3 of the voxel home (1,000 iterations for 150): the numbers, one training, the records, the command (the round itself is never run here)\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/VOXEL_HOME_LONG_WIP.md");
    ok("!! THE ROUND IS ROUND 2'S WITH THREE KEYS MORE: 1,000 iterations where round 2 has 150 and every other number of the recipe the same; the trainer's history in each record; round 2's results file as `before`; its own results file -- and the registration says so",
        J(V.ROUND3) === J({ ...V2.ROUND2, iters: 1000, history: true, before: "brain/voxelHomeDrawnRound.jsonl", results: "brain/voxelHomeLongRound.jsonl" }) && J(V.RECIPE) === J({ ...V2.RECIPE, iters: 1000 }) && V2.RECIPE.iters === 150 && /\*\*Changed: `iters 1000`\*\* \(round 2: `iters 150`\)/.test(note) &&
        V.BEFORE === V2.RESULTS && V.RESULTS === "brain/voxelHomeLongRound.jsonl" && note.includes("`" + V.RESULTS + "`") && note.includes("`" + V.BEFORE + "`"));
    ok("the arms, the draws, the audit plans, the random builders' seeds, alpha and round 2's three tests' words are round 2's; T3's words are this round's", J(V.ARMS) === J(V2.ARMS) && J(V.WEIGHTS) === J(V2.WEIGHTS) && V.PLAIN_UNITS === 38 && J(V.MLP_HIDDEN) === J([16, 16]) && J(V.SEEDS) === J(V2.SEEDS) && J(V.AUDIT) === J(V2.AUDIT) && J(V.RANDOM_SEEDS) === J(V2.RANDOM_SEEDS) && V.ALPHA === 0.01 &&
        ["T0", "T1", "T2"].every((t) => J(V.WORDS[t]) === J(V2.WORDS[t])) && J(V.WORDS.T3) === J(["A LONGER TRAINING BUILDS MORE OF A HOME", "A LONGER TRAINING BUILDS LESS OF A HOME", "A LONGER TRAINING CANNOT BE TOLD APART FROM THE SHORTER"]) && V.WORDS.T3.every((w) => note.includes(w.slice(0, 30))));
    ok("a draw's untrained builder is round 2's, weight for weight, and its circuit the same; the audit and the floors are round 2's functions (the same answers)", V.ARMS.every((a) => J(Array.from(V.policyOf(a, 2).getParams())) === J(Array.from(V2.policyOf(a, 2).getParams()))) && J(V.circuitOf("SHUF", 5)) === J(V2.circuitOf("SHUF", 5)) &&
        J(V.auditScore(V.policyOf("FLY", 1), TINY_AUDIT, 12)) === J(V2.auditScore(V2.policyOf("FLY", 1), TINY_AUDIT, 12)) && J(V.floors(TINY_AUDIT, 12, [1000])) === J(V2.floors(TINY_AUDIT, 12, [1000])));
});

console.log("\n2. ONE TRAINING (4 iterations and 2, on draw 901)");
section(() => {
    const r = V.trainOne("FLY", 901, TINY, TINY_AUDIT), r2 = V.trainOne("FLY", 901, TINY2, TINY_AUDIT), short = V2.trainOne("FLY", 901, TINY2, TINY_AUDIT);
    const direct = trainDockES({ envFactory: (o = {}) => new B.BuildEnv({ maxSteps: 12, choice: "drawn", ...o }), obsDim: 40, actDim: 36, maxSteps: 12, iters: 4, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901, policyFactory: P.painterFactory("FLY", 901) });
    ok("!! A RECORD CARRIES THE TRAINER'S OWN HISTORY: the iterations it read its battery at and the share missing there, from iteration 0 to the last (0, 1, 2, 3 of 4), the numbers those of the trainer called here; and the weights are that call's",
        J(r.history) === J(direct.history.map((h) => ({ it: h.it, missing: h.avgDist }))) && J(r.history.map((h) => h.it)) === J([0, 1, 2, 3]) && r.history.every((h) => h.missing > 0 && h.missing <= 1) && PF.hashWeights(direct.params) === r.weightsHash && r.weightCount === 2967);
    ok("!! A LONGER TRAINING STARTS AS THE SHORTER ONE DID: the 4-iteration training's first two readings are the 2-iteration training's two, to the bit (the same start, the same noise) -- so this round's draws are round 2's, gone on with; and round 2's own records carry no history",
        J(r.history.slice(0, 2)) === J(r2.history) && r2.history.length === 2 && short.weightsHash === r2.weightsHash && !("history" in short) && short.score === r2.score);
});

console.log("\n3. THE RECORDS");
section(() => {
    const hist = (s) => [0, 166, 332, 498, 664, 830, 996, 999].map((it, k) => ({ it, missing: 0.5 - k / 100 - s / 10000 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "MLP" ? null : V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c ? c.units : null, edges: c ? c.edges.length : null, edgesHash: c ? PF.hashEdges(c.edges) : null, weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), trainerBest: null, score, homes: 0, history: hist(s) }; };
    const file = (scoreOf) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, { kind: "floors", random: V.RANDOM_SEEDS.map((_, k) => 0.55 + k / 1000), randomHomes: V.RANDOM_SEEDS.map(() => 0), untrained: { FLY: 0.5, SHUF: 0.5, PLAIN: 0.5, FISH: 0.5, MLP: 0.5 }, lean: 0.92, leanHomes: 120 }); return out; };
    const beforeOf = (scoreOf) => V.SEEDS.map((s) => ({ kind: "draw", arm: "FLY", s, score: scoreOf(s) })).concat(V.SEEDS.map((s) => ({ kind: "draw", arm: "PLAIN", s, score: 0.99 })));
    const even = (arm, s) => 0.7 + ((s * 7 + V.ARMS.indexOf(arm) * 3) % 16) / 1000, good = file(even), before = beforeOf((s) => 0.66 + s / 10000), clone = () => JSON.parse(J(good)), idx = (L, arm, s) => L.findIndex((r) => r.arm === arm && r.s === s);
    ok("!! a file of 80 draws with their histories, the recheck and the floors, beside round 2's 16 FLY draws, passes every check", V.checkRecords(good, before).length === 0, V.checkRecords(good, before).slice(0, 2).join(" | "));
    const broken = [
        ["a draw with no history", (L) => { delete L[idx(L, "FISH", 7)].history; }, before, /FISH draw 7 has no history from iteration 0 to 999/],
        ["a history that stops early", (L) => { L[idx(L, "FLY", 4)].history.pop(); }, before, /FLY draw 4 has no history from iteration 0 to 999/],
        ["round 2's recipe", (L) => { L[idx(L, "PLAIN", 2)].recipe.iters = 150; }, before, /PLAIN draw 2 was trained with another recipe/],
        ["round 2's file without one FLY draw", () => {}, before.filter((r) => !(r.arm === "FLY" && r.s === 9)), /the earlier round's file \(brain\/voxelHomeDrawnRound\.jsonl\) does not hold its 16 FLY draws, each once/],
        ["round 2's file not handed in", () => {}, null, /the earlier round's file .* does not hold its 16 FLY draws/],
        ["a FLY draw of round 2 twice", () => {}, before.concat([{ kind: "draw", arm: "FLY", s: 3, score: 0.6 }]), /does not hold its 16 FLY draws, each once/],
    ];
    const res = broken.map(([name, f, bf, re]) => { const L = clone(); f(L); const bad = V.checkRecords(L, bf); return [name, bad.some((b) => re.test(b)), bad[0]]; });
    ok(`!! EACH NEW CHECK FAILS BY NAME (${broken.length}: ${broken.map((b) => b[0]).join("; ")})`, res.every((r) => r[1]), res.filter((r) => !r[1]).map((r) => `${r[0]}: ${r[2]}`).join(" | "));
    const R0 = V.reading(good, before), Rbad = V.reading(good, null);
    ok("!! WITH A FAILED CHECK THE READING IS NOT WEIGHED, T3 included: without round 2's records no test is made", Rbad.T0 === null && Rbad.T3 === null && /A CHECK FAILED/.test(V.readingLines(Rbad)[0]) && R0.T3 !== null);
    const lower = V.reading(good, beforeOf((s) => 0.5 + s / 10000)), higher = V.reading(good, beforeOf((s) => 0.9 + s / 10000)), alike = V.reading(good, beforeOf((s) => 0.7 + ((s * 5) % 16) / 1000));
    ok("!! T3 READS THIS ROUND'S FLY AGAINST ROUND 2'S FLY, AND ONLY THAT: round 2's FLY lower -> A LONGER TRAINING BUILDS MORE OF A HOME; higher -> LESS; alike -> CANNOT BE TOLD APART FROM THE SHORTER; and round 2's other arms (its PLAIN, at 0.99 here) move nothing, nor does T3 move the other three tests",
        lower.T3.word === V.WORDS.T3[0] && higher.T3.word === V.WORDS.T3[1] && alike.T3.word === V.WORDS.T3[2] && R0.T3.word === V.WORDS.T3[0] && J([lower.T0.word, lower.T1.word, lower.T2.word]) === J([higher.T0.word, higher.T1.word, higher.T2.word]) && lower.T0.word === V.WORDS.T0[0]);
    const split = V.reading(file((arm, s) => (arm === "FLY" ? 0.9 : arm === "SHUF" ? 0.3 : 0.7) + s / 10000), beforeOf((s) => 0.6 + s / 10000));
    ok("!! ...and it is THIS round's FLY that T3 reads, not another arm of it: with this round's FLY above round 2's and this round's SHUF below it, T3 says MORE", split.T3.word === V.WORDS.T3[0] && split.T1.word === V.WORDS.T1[0]);
    const h = R0.arms.FLY.history, mean0 = V.SEEDS.reduce((a, s) => a + (0.5 - s / 10000), 0) / 16, lines = V.readingLines(R0).join("\n");
    ok("the reading carries each arm's history as the mean over its 16 draws at each point (8 points, 0 to 999), and its lines say it and T3", h.length === 8 && h[0].it === 0 && h[7].it === 999 && Math.abs(h[0].missing - mean0) < 1e-12 && Math.abs(h[7].missing - (mean0 - 0.07)) < 1e-12 && /FLY +the trainer's own battery, share missing at iteration 0: /.test(lines) && /T3 \(this round's FLY against the earlier round's FLY\)/.test(lines) && lines.includes(V.WORDS.T3[0]) && /the lean to the unfinished columns/.test(lines));
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "WORM", "1"], ["job", "FLY", "x"], ["job", "FLY", "17"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for a registered arm and draw; eight other shapes are not words)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FLY", "16"])) === J({ cmd: "job", arm: "FLY", s: 16 }) && no.every((a) => V.parseArgs(a) === null));
    const cmd = path.join(ENG, "tools", "ship", "takeVoxelHomeLong.mjs"), probe = (...a) => spawnSync(process.execPath, [cmd, ...a], { encoding: "utf8" });
    const bad = [probe(), probe("bogus"), probe("job", "WORM", "1"), probe("job", "FLY", "x"), probe("read", "extra")];
    ok("!! the command refuses what it does not know with its usage and exit 2", bad.every((r) => r.status === 2 && /^usage: node tools\/ship\/takeVoxelHomeLong\.mjs/.test(r.stderr) && r.stdout === ""), bad.map((r) => r.status).join(" "));
    const csrc = src("tools/ship/takeVoxelHomeLong.mjs");
    ok("!! the command is this round's -- its library and results file, not round 2's -- reads its words through parseArgs alone, refuses a run of no processes itself, and READS ROUND 2'S FILE FOR T3 (the library's BEFORE) and hands its records to the reading",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/voxelHomeLong\.mjs"/.test(csrc) && !/voxelHomeDrawnRound|"\.\/voxelHomeDrawn\.mjs"|"\.\/voxelHome\.mjs"/.test(csrc) && /path\.join\(ENG, PF\.BEFORE\)/.test(csrc) && /PF\.reading\(linesOf\(\), before\)/.test(csrc));
    const me = src("tools/ship/voxelHomeLong-selfcheck.mjs"), calls = [...me.matchAll(/V2?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]), probes = [...me.matchAll(/probe\(("[^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its three trainings are of 4 and 2 iterations on draw 901; the command is never given the word run, nor a job it could do; and the file's size and time are what they were before this section",
        calls.length === 3 && calls.every((c) => /^"FLY", 901, TINY2?, TINY_AUDIT$/.test(c)) && TINY.iters === 4 && !V.SEEDS.includes(901) && probes.length === 4 && probes.every((p) => !/"run"/.test(p) && V.parseArgs(JSON.parse(`[${p}]`)) === null) && stateOf() === before, `${calls.length} trainings, ${probes.length + 1} probes, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nvoxelHomeLong-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
