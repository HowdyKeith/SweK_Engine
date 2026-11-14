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
//   5  THE VERDICT           the committed results, read from the file: the four tests, the arms, the two homes, the levelled history, the expectations
// SABOTAGE LOG (2026-11-14) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and the gates of rounds 2 and 1 run whole for each; every one red by name
// (the three numbers are the rows that went red here, in tools/ship/voxelHomeDrawn-selfcheck.mjs and in tools/ship/voxelHome-selfcheck.mjs):
//   Z1 round 3 trains 150 iterations after all 5, 0, 0 | Z2 the cfg's iterations are ignored 5, 0, 0 | Z3 no record carries a history 2, 0, 0 | Z4 every round's records carry a history 1, 9, 8
//   Z5 the history is the trainer's return, not its share missing 1, 0, 0 | Z6 the history check gone 1, 0, 0 | Z7 a history may stop early 1, 0, 0 | Z8 the earlier round's file is not checked 2, 0, 0
//   Z9 T3 reads round 2's PLAIN 2, 0, 0 | Z11 T3's MORE and LESS are each other's 1, 0, 0 | Z12 round 3's before is its own file 2, 0, 0 | Z13 the command does not hand round 2's records to the reading 1, 0, 0
//   Z14 round 3 writes round 2's results file 1, 0, 0 | Z15 the arms' history is draw 1's, not the mean 1, 0, 0 | Z16 a failed check still gives T3 1, 0, 0 | Z17 round 2 is given a before 0, 9, 0
//   Z10' T3 reads this round's SHUF against round 2's FLY 1, 0, 0
//   THE VERDICT'S (section 5, 2026-11-14), this gate run whole for each, every one red by name: V1 a FLY score in the file lowered to 0.50 10 | V2 FLY draw 1's home gone from the file 3 | V3 FISH draw 13's home is three 3
//   V4 MORE and LESS swapped 6 | V5 T3 reads this round's SHUF for round 2's FLY 4 | V6 a round 2 FLY score in round 2's file raised to 0.75 3 | V7 the lean in the file made 0.60 2
//   V8 MLP draw 1's last history reading made 0.05 2 | V9 the note's T2 says WORSE 1 | V10 the note's T3 says CANNOT 1 | V11 alpha 0.005 3
//   ONE WENT 0 RED, AND IS A ROW NOW: Z10 -- every file made here had its FLY and its SHUF drawn alike, so which of them T3 read could not show; the row sets them apart. Z10' is Z10 again.
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
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

console.log("\n5. THE VERDICT (round 3; the results were committed at 257d2d8c before they were read, and are read here from the file)");
section(() => {
    const rd = (f) => fs.readFileSync(path.join(ENG, f)), parse = (b) => b.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const bytes = rd(V.RESULTS), lines = parse(bytes), earlier = parse(rd(V.BEFORE)), R = V.reading(lines, earlier), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
    ok("!! the results file is the one the run wrote: 82 records, sha256 e7b6f8b509fccef7...", lines.length === 82 && createHash("sha256").update(bytes).digest("hex") === "e7b6f8b509fccef7edd02d17b1e060ead6b81e9990a5672043bad58e84349c92");
    ok("!! THE CHECKS HOLD: 80 draws each once, the 1,000-iteration recipe, each arm's weight count and wiring, FLY draw 1 the same twice, the floors, a history to iteration 999 in every record, round 2's 16 FLY draws", R.checks.length === 0, R.checks.slice(0, 2).join(" | "));
    ok("!! *** T3: A LONGER TRAINING BUILDS MORE OF A HOME *** -- this round's 16 FLY builders against round 2's 16: the ranks sum to 333 (332 or more speaks), exact two-sided p 0.0085. It speaks, and only just", R.T3 && R.T3.word === V.WORDS.T3[0] && R.T3.sumA === 333 && R.T3.ties === 0 && near(R.T3.p, 0.008463, 5e-6) && R.T3.p <= V.ALPHA, R.T3 ? `p ${R.T3.p.toFixed(4)}` : "no test");
    ok("!! *** T0: A FLY-WIRED BUILDER BUILDS MORE OF A HOME THAN A RANDOM ONE *** -- all 16 above all 16 (the ranks sum to 392; p 3.3e-9), as in round 2", R.T0 && R.T0.word === V.WORDS.T0[0] && R.T0.sumA === 392 && R.T0.ties === 0 && R.T0.p < 4e-9);
    ok("!! *** T1, THE WIRING: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT *** -- the ranks sum to 272 (the middle is 264), exact two-sided p 0.78: the fourth round to say so", R.T1 && R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 272 && near(R.T1.p, 0.78044));
    ok("!! *** T2: THE FLY'S WIRING CANNOT BE TOLD APART FROM A PLAIN NET OF ITS SIZE *** -- the ranks sum to 220 (196 or less speaks), exact two-sided p 0.10. Round 2 said WORSE (p 0.00027); with the longer training the test no longer speaks, though the fly's mean is still the lower", R.T2 && R.T2.word === V.WORDS.T2[2] && R.T2.sumA === 220 && near(R.T2.p, 0.10164) && R.arms.FLY.mean < R.arms.PLAIN.mean);
    const A = R.arms, fl = R.floors, rMean = fl.random.reduce((a, b) => a + b, 0) / 16, rMax = Math.max(...fl.random), draws = lines.filter((r) => r.kind === "draw"), old = earlier.filter((r) => r.kind === "draw");
    ok("!! the arms' mean share of a home built, 16 draws each (mean, sd): SHUF 0.6848 0.0210, FLY 0.6869 0.0198, FISH 0.6888 0.0195, PLAIN 0.7010 0.0178, MLP 0.7037 0.0152 -- the three arms with recurrent synapses still below the two without; the 16 random builders 0.5722",
        near(A.FLY.mean, 0.6869) && near(A.FLY.sd, 0.0198) && near(A.SHUF.mean, 0.6848) && near(A.SHUF.sd, 0.0210) && near(A.FISH.mean, 0.6888) && near(A.FISH.sd, 0.0195) && near(A.PLAIN.mean, 0.7010) && near(A.PLAIN.sd, 0.0178) && near(A.MLP.mean, 0.7037) && near(A.MLP.sd, 0.0152) && near(rMean, 0.5722) &&
        Math.max(A.FLY.mean, A.SHUF.mean, A.FISH.mean) < Math.min(A.PLAIN.mean, A.MLP.mean));
    const m2 = (a) => old.filter((r) => r.arm === a).reduce((x, r) => x + r.score, 0) / 16, up = (a) => V.SEEDS.filter((s) => draws.find((r) => r.arm === a && r.s === s).score > old.find((r) => r.arm === a && r.s === s).score).length;
    ok("!! *** 6.7 TIMES THE TRAINING BOUGHT ONE TO TWO HUNDREDTHS OF A HOME *** -- each arm's mean beside its round 2 mean, from round 2's own file: FLY +0.021, SHUF +0.024, FISH +0.015, MLP +0.015, PLAIN +0.011; the draws that built more than their round 2 selves: FLY 13 of 16, SHUF 16, FISH 15, MLP 13, PLAIN 12",
        near(A.FLY.mean - m2("FLY"), 0.0206) && near(A.SHUF.mean - m2("SHUF"), 0.0235) && near(A.FISH.mean - m2("FISH"), 0.0147) && near(A.MLP.mean - m2("MLP"), 0.0145) && near(A.PLAIN.mean - m2("PLAIN"), 0.0105) && J(V.ARMS.map(up)) === J(V.ARMS.map((a) => ({ FLY: 13, SHUF: 16, PLAIN: 12, FISH: 15, MLP: 13 })[a])));
    const homes = draws.filter((r) => r.homes > 0).map((r) => `${r.arm} ${r.s} ${r.homes}`);
    ok("!! *** TWO HOMES IN 16,000 BUILDS, THE FIRST ANY TRAINED BUILDER HAS FINISHED *** -- FLY draw 1 and FISH draw 13, one home each of their 200 plans; no other draw has one (the lean with no network: 123 of 200)", J(homes) === J(["FLY 1 1", "FISH 13 1"]) && A.FLY.homes === 1 && A.FISH.homes === 1 && A.SHUF.homes + A.PLAIN.homes + A.MLP.homes === 0 && fl.leanHomes === 123, homes.join(", "));
    ok("!! every trained builder is above the best random one (the least 0.624, the best 0.734, against 0.577), and the best arm is 0.375 of the way from a random builder to the lean (0.572 -> 0.704 -> 0.923; round 2's best was a third)",
        draws.every((r) => r.score > rMax) && near(Math.min(...draws.map((r) => r.score)), 0.6240) && near(Math.max(...draws.map((r) => r.score)), 0.7335) && near(fl.lean, 0.9226) && near((A.MLP.mean - rMean) / (fl.lean - rMean), 0.3751, 5e-4));
    const H = (a) => A[a].history, at = (a, it) => H(a).find((h) => h.it === it).missing;
    ok("!! *** THE LEARNING HAD LEVELLED: most of what was learned was learned by iteration 166 *** -- on the trainer's own battery every arm's share missing falls 0.17 to 0.19 from iteration 0 to 166 and 0.016 to 0.033 more from 166 to 999 (FLY 0.4818, 0.2931, 0.2664; MLP 0.4435, 0.2724, 0.2440); and the best arm's last reading (MLP, 0.2440 at 999) is not below the one before it (0.2432 at 996)",
        V.ARMS.every((a) => H(a).length === 8 && at(a, 0) - at(a, 166) > 0.17 && at(a, 0) - at(a, 166) < 0.19 && at(a, 166) - at(a, 999) > 0.016 && at(a, 166) - at(a, 999) < 0.0335) && near(at("FLY", 0), 0.4818) && near(at("FLY", 166), 0.2931) && near(at("FLY", 999), 0.2664) && near(at("MLP", 0), 0.4435) && near(at("MLP", 166), 0.2724) && near(at("MLP", 996), 0.2432) && near(at("MLP", 999), 0.2440) && at("MLP", 999) > at("MLP", 996));
    const again = V.ARMS.flatMap((arm) => [1, 13].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore(p); return [arm, s, a.score === r.score && a.homes === r.homes]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS HOMES AGAIN: draws 1 and 13 of every arm (the two with a home among them), audited here on the 200 plans, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/VOXEL_HOME_LONG_WIP.md"), res = note.slice(note.indexOf("## 8. The result"));
    ok("the expectations, written before the tool, against what came: T3 MORE was the 80 percent guess, T0 MORE the 97, T1 CANNOT BE TOLD APART the 75 -- all three came; T2 came as the 35 (CANNOT), not the 55 (WORSE); the best arm above 0.80 was given 35 and is 0.70; any home 45 and a FLY home 30, and both came; the history still falling 60, and it is not",
        /T3: BUILDS MORE about 80 percent/.test(note) && /T0: MORE about 97/.test(note) && /BE TOLD APART about 75/.test(note) && /T2: FLY WORSE about 55, CANNOT BE TOLD APART about 35/.test(note) && /above 0\.80: about 35 percent/.test(note) && /ANY home among 80 x 200 builds: about 45 percent; a FLY home: about 30/.test(note) && Math.max(...V.ARMS.map((a) => A[a].mean)) < 0.80);
    ok("the registration's RESULT SECTION (section 8, and not the list of possible words in section 2) carries the four readings' words", /## 8\. The result/.test(note) && [["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word], ["T3", R.T3.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)));
});

console.log(`\nvoxelHomeLong-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
