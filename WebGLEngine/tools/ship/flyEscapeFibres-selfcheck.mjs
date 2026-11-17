// WebGLEngine/tools/ship/flyEscapeFibres-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeFibres-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 8 (registered in brain/FLY_ESCAPE_FIBRES_WIP.md before tools/ship/flyEscapeFibres.mjs existed): are the Giant Fibers' own inputs enough? Round 7's K3 again -- a shuffle
// that keeps only the 42 real connections onto the two fibres against a free shuffle -- on 128 new draws an arm, the number fixed before the run.
//   1  THE ROUND'S NUMBERS   round 7's task, trainer and two arms; draws 81 to 208; the registration's power table, computed here
//   2  ONE TRAINING          a record's weights are round 7's code's
//   3  THE RECORDS           256 draws; F1; the share of pairs; the failures
//   4  THE COMMAND           it is this round's; no training of the round's, no process
//   5  THE VERDICT           the round's results, read from the committed file
// SABOTAGE LOG (2026-11-16) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a
// process) run whole for each; every one red by name, none 0 red (the number is the rows red over the two):
//   THE ROUND (tools/ship/flyEscapeFibres.mjs): B1 GGF is round 7's count-in shuffle 3 | B2 GSHUF is round 7's count-out shuffle 2 | B3 the draws are round 7's 5 | B4 32 draws an arm 6
//   B5 the lead is the free shuffle 3 | B6 F1's words are round 7's R0's 1 | B7 the share is half what it is 1 | B8 a share is given with a failed check 1 | B9 the failing line is 0.70 3
//   B10 the round writes round 7's results file 1 | B11 a failure is any score under 0.76 2 | B12 F1 is made with a failed check 1
//   THE COMMAND: C1 the second training is of the second draw 1 | C2 exits 0 on a word it does not know 1 | C3 reads round 7's library 1 | C4 a second start trains everything again 1
//   THE VERDICT (section 5; the results file and the note sabotaged, this gate run whole for each): V1 a failed free shuffle (draw 82) given a passing score 8 | V2 a failed free shuffle (draw
//   151) lifted just over the line 5 | V3 a GGF fly's score lowered to 0.70 5 | V4 a free shuffle's score raised to 0.80 4 | V5 the second training's record gone 6 | V6 the note's F1 says CANNOT 1
//   V7 the note names another commit 1 | V8 the note says the share expectation came 1 | V9 the note no longer says GGF was not set against GDEG 1 | V10 the note says the difference is a
//   hundredth 1 | V11 the expectation for F1 raised after the fact 1
//   Two rows of mine were wrong when written and were corrected: a fixture's "failing" fly sat exactly on the line (0.7199 plus its draw's millionths is 0.72), and a file of free shuffles at 0.70
//   has 127 failures, not 128, once one is taken out.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeFibres.mjs";
import * as V7 from "./flyEscapeSplit.mjs";
import * as V6 from "./flyEscapeDegree.mjs";
import * as V5 from "./flyEscapeVision.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as RS from "../../brain/rl/reflexStart.mjs";
import * as SS from "../../brain/rl/splitShuffle.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: 160, iters: 3, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 8, fresh: true, battery: 30 }), TINY_AUDIT = [880001, 880002, 880003, 880004, 880005, 880006];
const REAL = T.EDGES.map((e) => [e[0], e[1]]);

console.log("flyEscapeFibres-selfcheck -- the escape round 8 (are the Giant Fibers' own inputs enough?): the numbers, one training, the records, the command\n");

console.log("1. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_FIBRES_WIP.md"), flat = note.replace(/\s+/g, " ");
    ok("!! THE ROUND IS ROUND 7'S TASK AND TRAINER ON NEW DRAWS: its recipe to the number, the reflex start, the report \"return\", no memory, its audit, floors, failing line (0.72) and alpha; THE DRAWS ARE 81 TO 208 (128 an arm, none of rounds 5, 6 or 7's); two arms, the lead GGF against GSHUF; its own results file",
        J(V.RECIPE) === J(V7.RECIPE) && V.START === "reflex" && V.REPORT === "return" && V.MEMORY === false && J(V.AUDIT) === J(V7.AUDIT) && J(V.FLOORS) === J(V7.FLOORS) && V.ALPHA === 0.01 && V.FAIL_BELOW === 0.72 && J(V.SEEDS) === J(Array.from({ length: 128 }, (_, k) => 81 + k)) && J(V.SEEDS) === J(V.DRAWS) &&
        !V.SEEDS.some((s) => V5.SEEDS.includes(s) || V6.SEEDS.includes(s) || V7.SEEDS.includes(s)) && J(V.ARMS) === J(["GGF", "GSHUF"]) && V.LEAD === "GGF" && J(V.VERSUS) === J(["GSHUF"]) && V.RESULTS === "brain/flyEscapeFibresRound.jsonl" && ![V5.RESULTS, V6.RESULTS, V7.RESULTS].includes(V.RESULTS) && note.includes("`" + V.RESULTS + "`") &&
        V.ROUND8.arms === V.ARMS_OF && /New draws: 81 to 208/.test(note) && /128 draws an arm, 256 trainings, fixed before the run/.test(note) && /no look at the scores before all 256 are in, and no draws added after/.test(flat));
    ok("!! THE TWO ARMS ARE ROUND 7'S OWN OBJECTS, AND F1'S WORDS ARE ROUND 7'S K3'S TO THE LETTER: a draw's GGF fly is keepOnto(real, 42, the two fibres, 13000 + s) and its GSHUF fly shuffledEdges(42, 369, 7000 + s), each round 7's fly of that draw weight for weight, 454 weights, inside the reflex wrapper; T0 is of a fly whose Giant Fibers keep their real inputs",
        V.ARMS_OF.GGF === V7.ARMS_OF.GGF && V.ARMS_OF.GSHUF === V7.ARMS_OF.GSHUF && J(V.WORDS.F1) === J(V7.WORDS.K3) && J(V.WORDS.T3) === J(V7.WORDS.T3) && V.WORDS.T0.length === 3 && /GIANT FIBERS KEEP THEIR REAL INPUTS.*BETTER/.test(V.WORDS.T0[0]) && /WORSE/.test(V.WORDS.T0[1]) && /CANNOT BE TOLD APART/.test(V.WORDS.T0[2]) && J(V.WEIGHTS) === J({ GGF: 454, GSHUF: 454 }) &&
        J(V.circuitOf("GGF", 100).edges) === J(SS.keepOnto(REAL, 42, [40, 41], 13100)) && J(V.circuitOf("GSHUF", 100).edges) === J(P.shuffledEdges(42, 369, 7100)) && V.ARMS.every((a) => V.policyOf(a, 100) instanceof RS.ReflexStart && J(arr(V.policyOf(a, 100).getParams())) === J(arr(V7.policyOf(a, 100).getParams()))) && J(V.circuitOf("GGF", 100).edges) !== J(V.circuitOf("GGF", 101).edges));
    const onto = (e) => e.filter((x) => x[0] >= 40).length, syn = (e) => { let n = 0; e.forEach((x, k) => { if (x[0] >= 40) n += T.SYNAPSES[k]; }); return n; }, realOnto = (e) => e.filter((x, k) => x[0] >= 40 && J(x) === J(REAL[k])).length, over = (a, f) => V.SEEDS.map((s) => f(V.circuitOf(a, s).edges));
    const G = { n: over("GGF", onto), syn: over("GGF", syn), real: over("GGF", realOnto) }, S = { n: over("GSHUF", onto), syn: over("GSHUF", syn) }, lo = (v) => Math.min(...v), hi = (v) => Math.max(...v);
    ok("!! *** WHAT EACH ARM GIVES THE TWO GIANT FIBERS, COUNTED OVER THE ROUND'S 128 DRAWS ***: every GGF draw the 42 real connections themselves, 2,357 synapses; a GSHUF draw between 8 and 29 connections carrying under 500 synapses -- never as many as a quarter of the real drive",
        lo(G.n) === 42 && hi(G.n) === 42 && lo(G.syn) === 2357 && hi(G.syn) === 2357 && lo(G.real) === 42 && lo(S.n) >= 8 && hi(S.n) <= 29 && hi(S.syn) < 500 && hi(S.syn) < 2357 / 4, `GSHUF: ${lo(S.n)} to ${hi(S.n)} connections, ${lo(S.syn)} to ${hi(S.syn)} synapses`);
    const erf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }, Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
    const power = (n, p) => Math.round(100 * Phi((p - 0.5) / Math.sqrt((2 * n + 1) / (12 * n * n)) - 2.576));
    ok("!! THE REGISTRATION'S REASON FOR 128, COMPUTED HERE (the normal approximation to the rank sum, alpha 0.01 two-sided): a true share of 68 pairs in 100 speaks 46 times in 100 at 32 an arm and 99 at 128; 65 in 100 speaks 30 and 94; 60 in 100 speaks 11 and 58 -- the table in the note; and round 7's K3 was 68 in 100 (ranks 1225.5 of a middle 1040)",
        J([0.68, 0.65, 0.60].map((p) => [power(32, p), power(128, p)])) === J([[46, 99], [30, 94], [11, 58]]) && /\| 68 in 100 \| about 46 times in 100 \| about 99 \|/.test(note) && /\| 65 in 100 \| about 30 \| about 94 \|/.test(note) && /\| 60 in 100 \| about 11 \| about 58 \|/.test(note) && near((1225.5 - 32 * 33 / 2) / (32 * 32), 0.681, 5e-4));
    const A40 = V.AUDIT.slice(0, 40), ref = V.auditScore(E.RULES.reflex, A40), fl = V.floors(A40);
    ok("!! EVERY ARM'S UNTRAINED FLY IS THE REFLEX: on 40 episodes each arm's untrained draw 90 has the reflex's score and counts to the bit, as the floors say", V.ARMS.every((a) => { const p = V.policyOf(a, 90); return J(V.auditScore((o) => p.act(o), A40)) === J(ref); }) && V.ARMS.every((a) => fl.untrained[a] === fl.reflex.score) && J(Object.keys(fl.untrained)) === J(V.ARMS));
});

console.log("\n2. ONE TRAINING (3 iterations, 16 flies tried, 160 ticks, a battery of 30, on draw 901)");
section(() => {
    const g = V.trainOne("GGF", 901, TINY, TINY_AUDIT), g7 = V7.trainOne("GGF", 901, TINY, TINY_AUDIT), s = V.trainOne("GSHUF", 901, TINY, TINY_AUDIT), s7 = V7.trainOne("GSHUF", 901, TINY, TINY_AUDIT);
    ok("!! THIS ROUND'S TRAININGS ARE ROUND 7'S CODE'S, TO THE HASH (round 7's gate holds that code to a wrapped policy made by hand): a tiny GGF training and a tiny GSHUF training here and there give the same weights and the same wiring; the two arms' are not each other's; each record carries its wiring and the recipe it was given",
        g.weightsHash === g7.weightsHash && g.edgesHash === g7.edgesHash && s.weightsHash === s7.weightsHash && s.edgesHash === s7.edgesHash && g.weightsHash !== s.weightsHash && g.edgesHash !== s.edgesHash && g.edgesHash === PF.hashEdges(SS.keepOnto(REAL, 42, [40, 41], 13901)) && s.edgesHash === PF.hashEdges(P.shuffledEdges(42, 369, 7901)) && g.weightCount === 454 && J(g.recipe) === J(TINY));
    const start = arr(V.policyOf("GGF", 901).getParams()), end = arr(PF.unpackWeights(g.weights)), p = V.policyOf("GGF", 901); p.setParams(PF.unpackWeights(g.weights)); const a = V.auditScore((o) => p.act(o), TINY_AUDIT, 160);
    ok("the tiny training is a training (its weights moved), and its weights give its score again: in the GGF fly of that draw, audited on the same episodes, to the bit", start.some((v, i) => v !== end[i]) && a.score === g.score && a.alive === g.alive && a.fledPass === g.fledPass, `${start.filter((v, i) => v !== end[i]).length} of 454 weights moved`);
});

console.log("\n3. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, ret: 0.65 + (k === 0 ? 0 : 0.03) + s / 100000, lived: 0 }));
    const made = new Map(), stub = (arm, s) => { const k = arm + s; if (!made.has(k)) { const p = V.policyOf(arm, s), w = p.getParams(), c = V.circuitOf(arm, s); made.set(k, { units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w) }); } return made.get(k); };
    const rec = (arm, s, score) => ({ kind: "draw", arm, s, recipe: { ...V.RECIPE }, ...stub(arm, s), score, alive: 170, fed: 0.5, strikes: 400, caught: 30, passes: 300, fledPass: 60, history: hist(s) });
    const flo = () => ({ kind: "floors", ...Object.fromEntries(Object.entries(V.FLOORS).map(([k, v]) => [k, { score: v, alive: 150, fed: 0.3, strikes: 400, caught: 40, passes: 300, fledPass: 80 }])), untrained: Object.fromEntries(V.ARMS.map((a) => [a, V.FLOORS.reflex])) });
    const file = (scoreOf, first = 81) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "GGF", s: first, weightsHash: out.find((r) => r.arm === "GGF" && r.s === first).weightsHash }, flo()); return out; };
    const lvl = (g, sh) => (arm, s) => (arm === "GGF" ? g : sh) + s / 100000, good = file(lvl(0.75, 0.70)), copy = () => JSON.parse(J(good));
    ok("!! a file of 256 draws (two arms, draws 81 to 208) with GGF DRAW 81 a second time passes every check and its first line says 256 and draw 81; a draw of round 7's (draw 60), a GGF draw recorded with the free shuffle's wiring or another draw's, a second training of draw 82 in draw 81's place, and a second-training record that says draw 82 each fail by name",
        V.checkRecords(good).length === 0 && good.length === 258 && /^the checks hold: 256 draws, each once.*GGF draw 81 the same twice/.test(V.readingLines(V.reading(good))[0]) &&
        (() => { const L = copy(); L[0].s = 60; return V.checkRecords(L).some((b) => /GGF draw 60 is not a registered draw/.test(b)); })() &&
        [PF.hashEdges(V.circuitOf("GSHUF", 100).edges), PF.hashEdges(V.circuitOf("GGF", 101).edges)].every((h) => { const L = copy(), g = L.find((r) => r.arm === "GGF" && r.s === 100); g.edgesHash = h; return J(V.checkRecords(L)) === J(["GGF draw 100's wiring is not its arm's"]); }) &&
        J(V.checkRecords(file(lvl(0.75, 0.70), 82))) === J(["GGF draw 81 trained a second time is not there once with the same weights"]) && (() => { const L = copy(); L.find((r) => r.kind === "recheck").s = 82; return J(V.checkRecords(L)) === J(["GGF draw 81 trained a second time is not there once with the same weights"]); })(), V.checkRecords(good).slice(0, 2).join(" | "));
    const up = V.reading(good), down = V.reading(file(lvl(0.70, 0.75))), level = V.reading(file((arm, s) => 0.75 + ((s * 37 + (arm === "GGF" ? 11 : 0)) % 101) / 100000));
    ok("!! F1 IS GGF AGAINST GSHUF, a rank sum of 128 against 128 with round 7's K3's words: every GGF fly above every GSHUF fly -> BETTER, ranks 24,640 (the most there can be) and a share of 100 pairs in 100; every one below -> WORSE, ranks 8,256, a share of 0; two arms drawn from one spread -> CANNOT BE TOLD APART, a share near 50 -- and F1 is the reading's T1 itself",
        up.F1 === up.T1 && up.F1.word === V.WORDS.F1[0] && up.F1.n === 128 && up.F1.m === 128 && up.F1.sumA === 24640 && up.share === 1 && down.F1.word === V.WORDS.F1[1] && down.F1.sumA === 8256 && down.share === 0 && level.F1.word === V.WORDS.F1[2] && level.F1.p > 0.01 && Math.abs(level.share - 0.5) < 0.08 && near(level.share, (level.F1.sumA - 8256) / 16384, 1e-12),
        `level: ranks ${level.F1.sumA} of a middle 16448, p ${level.F1.p.toFixed(3)}, share ${level.share.toFixed(3)}`);
    const mixed = V.reading(file((arm, s) => (arm === "GSHUF" && s % 16 === 0 ? 0.68 : arm === "GGF" && s === 100 ? 0.7198 : arm === "GGF" ? 0.76 : 0.75) + s / 1000000)), lines = V.readingLines(mixed).join("\n");
    ok("!! THE FAILURES ARE COUNTED AS REGISTERED, A SCORE BELOW 0.72: a GSHUF arm with every sixteenth draw at 0.68 has 8 of 128, a GGF arm with one draw just under the line has 1; T0 is the 128 GGF flies against the reflex and T3 all 256; the lines say the share of pairs, the failures, and that F1 is the reading's T1, with its word",
        J(mixed.failed) === J({ GGF: 1, GSHUF: 8 }) && mixed.T0.n === 128 && mixed.T0.above === 128 && mixed.T3.n === 256 && mixed.T3.above === 256 && /a GGF fly has the higher score in \d+\.\d of 100 pairs with a GSHUF fly \(a tie counts a half; 50 is no difference\)/.test(lines) &&
        /trainings that FAILED \(a score below 0\.72\), of 128 an arm: GGF 1; GSHUF 8/.test(lines) && /T1 \(GGF against GSHUF\)/.test(lines) && /the registration's F1 is T1 above, GGF against GSHUF/.test(lines) && lines.includes("\n  " + mixed.F1.word) && lines.includes(`${(mixed.share * 100).toFixed(1)} of 100 pairs`));
    ok("with a failed check no test is made: a file short of a draw has F1 and the share null, still counts the failures (the 127 free shuffles left, all at 0.70), and says a check failed first", (() => { const R = V.reading(good.filter((r) => !(r.arm === "GSHUF" && r.s === 150))); return R.F1 === null && R.share === null && J(R.failed) === J({ GGF: 0, GSHUF: 127 }) && /A CHECK FAILED/.test(V.readingLines(R)[0]) && R.checks.some((x) => /GSHUF draw 150 is there 0 times/.test(x)) && !V.readingLines(R).some((l) => /of 100 pairs/.test(l)); })());
});

console.log("\n4. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "GDEG", "81"], ["job", "GGF", "x"], ["job", "GGF", "80"], ["job", "GGF", "209"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for one of this round's two arms and one of ITS draws: draw 80 and draw 209 are not, nor is an arm of round 7's alone)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "GSHUF", "208"])) === J({ cmd: "job", arm: "GSHUF", s: 208 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeFibres.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold (so it can be started again after a stop), and trains THE LEAD ARM'S FIRST DRAW a second time (by the library's names for them: GGF, draw 81)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeFibres\.mjs"/.test(csrc) && !/Split|Degree|Vision|"\.\/flyEscape\.mjs"|"\.\/flyEscapeFresh\.mjs"|voxelHome/.test(csrc) && /if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s\]\)/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeFibres\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && V.SEEDS[0] === 81);
    const me = src("tools/ship/flyEscapeFibres-selfcheck.mjs"), calls = [...me.matchAll(/V7?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its four trainings through the rounds' code are of 3 iterations with 16 flies tried on draw 901; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 4 && calls.every((c) => /^"(GGF|GSHUF)", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 3 && TINY.pop === 16 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before && typeof createHash === "function", `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n5. THE VERDICT (the whole results file was committed at aeb1cb6d before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = V.reading(lines), A = R.arms, draws = lines.filter((r) => r.kind === "draw"), ref = R.floors.reflex.score;
    const sc = (a) => draws.filter((r) => r.arm === a).sort((x, y) => x.s - y.s).map((r) => r.score), med = (a) => { const v = sc(a).sort((x, y) => x - y); return (v[63] + v[64]) / 2; }, under = (a, line) => draws.filter((r) => r.arm === a && r.score < line).map((r) => r.s).sort((x, y) => x - y);
    ok("!! the results file is the one the run wrote: 258 records, sha256 4cfa11bab7c3407b... (the run was stopped twice by the container and started again; each start trained only what the file did not hold)", lines.length === 258 && createHash("sha256").update(bytes).digest("hex") === "4cfa11bab7c3407b3373666d05a32a244c1ce09edf392c5ac1c4e874dd49a106");
    ok("!! THE CHECKS HOLD, AND THE START WAS THE REFLEX: 256 draws each once, the registered recipe, each arm's weight count and its own shuffle of the draw, GGF draw 81 the same twice, a history in every record, the registered floors -- and the untrained fly of both arms scores the reflex's 0.6465, to the bit",
        R.checks.length === 0 && draws.length === 256 && near(ref, 0.6465) && V.ARMS.every((a) => R.floors.untrained[a] === ref));
    ok("!! *** F1: KEEPING ONLY WHAT THE TWO GIANT FIBERS RECEIVE ESCAPES BETTER THAN A FREE SHUFFLE *** on 128 new draws an arm: GGF's ranks sum to 20128.5, the middle is 16448; exact two-sided p 2.2e-10 against the registered 0.01. ROUND 7'S NEAR MISS WAS TOO FEW DRAWS: a fly whose Giant Fibers keep their 42 real inputs has the higher score in 72.5 of 100 pairs",
        R.F1 && R.F1 === R.T1 && R.F1.word === V.WORDS.F1[0] && R.F1.sumA === 20128.5 && R.F1.ties === 13 && R.F1.p < 1e-9 && near(R.F1.p, 2.24e-10, 1e-12) && R.F1.pHigher < R.F1.pLower && near(R.share, 0.7246, 1e-4));
    ok("!! *** HOW BIG, SAID WITH IT: SMALL, AND SURE *** -- the medians are 0.7492 and 0.7479, a thousandth and a third; the means 0.7495 and 0.7441. Most of the mean's gap is the free shuffle's tail: 51 of its 128 flies end below 0.7474 against 10 of GGF's, and the best free shuffle (0.7546) is above 123 of the 128 GGF flies",
        near(med("GGF"), 0.7492, 1e-4) && near(med("GSHUF"), 0.7479, 1e-4) && near(A.GGF.mean, 0.7495) && near(A.GSHUF.mean, 0.7441) && under("GSHUF", 0.7474).length === 51 && under("GGF", 0.7474).length === 10 && near(Math.max(...sc("GSHUF")), 0.7546) && sc("GGF").filter((v) => v < Math.max(...sc("GSHUF"))).length === 123);
    ok("!! THE FAILURES (a score below the registered 0.72): GGF 0 of 128 (its worst is 0.7234), GSHUF 5 -- draws 82, 97, 99, 105 and 151; 82 and 97 are the reflex's score to the bit, the two ties of T3",
        J(R.failed) === J({ GGF: 0, GSHUF: 5 }) && J(under("GSHUF", V.FAIL_BELOW)) === J([82, 97, 99, 105, 151]) && [82, 97].every((s) => draws.find((r) => r.arm === "GSHUF" && r.s === s).score === ref) && near(Math.min(...sc("GGF")), 0.7234));
    ok("!! T0: all 128 GGF flies beat the reflex (p 5.9e-39) -> BETTER. T3: 254 of the 256 above the reflex, none below, 2 equal and counted against (p 5.7e-73) -> BETTER",
        R.T0 && R.T0.word === V.WORDS.T0[0] && R.T0.above === 128 && R.T0.below === 0 && R.T0.p < 1e-38 && R.T3 && R.T3.word === V.WORDS.T3[0] && R.T3.above === 254 && R.T3.ties === 2 && R.T3.below === 0 && R.T3.p < 1e-72);
    ok("!! the arms (mean, sd; lives of 200; feeds; caught by a strike): GGF 0.7495 0.0039, 193.6, 0.531, 0.014 | GSHUF 0.7441 0.0162, 192.4, 0.526, 0.017. The best fly of the round is a GGF (0.7729)",
        near(A.GGF.sd, 0.0039) && near(A.GSHUF.sd, 0.0162) && near(A.GGF.alive, 193.57, 0.01) && near(A.GSHUF.alive, 192.37, 0.01) && near(A.GGF.fed, 0.531, 5e-4) && near(A.GSHUF.fed, 0.526, 5e-4) && near(A.GGF.caught, 0.0143, 5e-4) && near(A.GSHUF.caught, 0.0169, 5e-4) && near(Math.max(...draws.map((r) => r.score)), 0.7729) && near(Math.max(...sc("GGF")), 0.7729));
    const H = (a) => A[a].history.map((h) => h.ret);
    ok("!! WHAT THE TRAINER SAW, AS IN ROUND 7: GGF starts far below the reflex on the trainer's own episodes (0.544) and ends at 0.744; the free shuffle starts at 0.669 and ends at 0.742 -- the fibres' heavy real drive is the bad start and the better end",
        near(H("GGF")[0], 0.5438) && near(H("GSHUF")[0], 0.6687) && near(H("GGF")[6], 0.7439) && near(H("GSHUF")[6], 0.7416));
    const again = V.ARMS.flatMap((arm) => [82, 99].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore((o) => p.act(o)); return [arm, s, a.score === r.score && a.alive === r.alive && a.fledPass === r.fledPass && a.caught === r.caught]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS COUNTS AGAIN: draws 82 and 99 of both arms (two of the free shuffle's failures among them), audited here on the 200 episodes through the wrapped fly, to the bit", again.length === 4 && again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/FLY_ESCAPE_FIBRES_WIP.md"), res = note.slice(note.indexOf("## 10. The result")).replace(/\s+/g, " ");
    ok("the expectations, written before the code, against what came: F1 BETTER was the 60 percent guess and came; the share between 58 and 68 in 100 (60) DID NOT -- it was 72.5, above round 7's 68, where the note had said a near miss's number is likely an overestimate; GGF 0 to 2 failures (75) came; GSHUF between 2 and 10 (70) came, with 5; T0 and T3 (95 each) came",
        /F1: \*\*BETTER about 60 percent\*\*, CANNOT about 40/.test(note) && /between 58 and 68 in\s+100 \(about 60 percent\)/.test(note) && /GGF 0 to 2 of 128 \(about 75\); GSHUF between 2 and 10 \(about 70\)/.test(note) && R.share > 0.68 && R.failed.GSHUF === 5);
    ok("the registration's RESULT SECTION (section 10, and not the possible words in section 5) carries the three readings' words, the commit the file was read at, the share of pairs, that the difference is small, that the share expectation missed, and what F1 does NOT say (GGF was not set against GDEG)",
        /## 10\. The result/.test(note) && [["F1", R.F1.word], ["T0", R.T0.word], ["T3", R.T3.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)) && /aeb1cb6d/.test(res) && /72\.5 of 100 pairs/.test(res) && /a thousandth and a third/.test(res) && /did not come/.test(res) && /not set against GDEG/.test(res));
});

console.log(`\nflyEscapeFibres-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
