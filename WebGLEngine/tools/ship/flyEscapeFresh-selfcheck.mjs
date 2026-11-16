// WebGLEngine/tools/ship/flyEscapeFresh-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeFresh-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations with 8 flies tried on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 3 (registered in brain/FLY_ESCAPE_FRESH_WIP.md before the trainer's two options and tools/ship/flyEscapeFresh.mjs existed): round 2's flies, trained on fresh episodes each
// iteration and chosen on a battery of 200. The round is tools/ship/flyEscape.mjs's makeEscapeRound() with two keys; this gate holds the trainer's options and the keys.
//   1  THE TRAINER'S TWO OPTIONS   brain/rl/dockPolicy.js, WHICH EPISODES IT FLIES, counted: the fixed 8 and the battery of 24 without the options; each iteration's own 8 and a battery of 200 with them
//   2  THE ROUND'S NUMBERS         round 2's cfg and the two keys; the recipe carries them; the start is still the reflex
//   3  ONE TRAINING                a record's weights are the trainer's called here by hand with both options
//   4  THE RECORDS                 the new check; P3, each fly against its round 2 self; the gain on the battery beside the gain on the audit
//   5  THE COMMAND                 it is this round's and reads round 2's file; no training of the round's, no process
// SABOTAGE LOG (2026-11-15) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate, round 4's, rounds 1 and 2's, tools/ship/voxelHome-selfcheck.mjs and
// tools/ship/paintingFly-selfcheck.mjs (which pins the trainer) run whole for each; every one red by name (the number is the rows red over the six gates):
//   THE TRAINER: Y1 fresh episodes the fixed ones after all 4 | Y2 the same at every iteration 3 | Y3 the battery's size not taken 3 | Y4 fresh episodes on unless refused 7
//   Y5 the fresh episodes the battery's first ones shifted by one 3
//   THE ROUND: Y6 round 3 does not ask the trainer for fresh episodes 2 | Y7 does not hand it its battery 2 | Y8 its battery 24 1 | Y9 no fresh key 1 | Y15 writes round 2's results file 2
//   THE READING AND THE COMMAND: Y10 P3 pairs each fly with round 2's draw 1 1 | Y11 P3's BETTER and WORSE each other's 2 | Y12 round 2's file not checked 1 | Y13 the battery's gain the last reading's 1
//   Y14 the command reads no earlier file 1 | Y31 the command exits 0 on a word it does not know 1
// THREE OF THIS GATE'S OWN ROWS WERE WRONG WHEN WRITTEN, AND ARE CORRECTED: the count of episodes flown took an environment's own reset as it is made for one the trainer asked for; a test file's
// history did not have the gain the row named; and a mean was taken over a list with the recheck record in it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeFresh.mjs";
import * as V2 from "./flyEscapeReflex.mjs";
import * as V1 from "./flyEscape.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as RS from "../../brain/rl/reflexStart.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: 160, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 8, fresh: true, battery: 30 }), TINY2 = Object.freeze({ maxSteps: 160, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 8 }), TINY_AUDIT = [880001, 880002, 880003, 880004, 880005, 880006];

console.log("flyEscapeFresh-selfcheck -- the escape round 3 (fresh training episodes each iteration; a battery of 200): the trainer's options, the numbers, one training, the records, the command\n");

console.log("1. THE TRAINER'S TWO OPTIONS (brain/rl/dockPolicy.js): which episodes it flies, counted");
section(() => {
    /** A training of 2 iterations with 4 flies tried and 3 episodes a fly, on an environment that writes down every seed it is reset to; the seeds in order. */
    const seedsOf = (extra) => { const seen = []; class Spy extends E.EscapeEnv { reset(seed) { if (seed !== 1) seen.push(seed); return super.reset(seed); } }   // seed 1 is an environment's own reset as it is made, not an episode the trainer asked for
        const res = trainDockES({ envFactory: (o = {}) => { return new Spy({ maxSteps: 20, report: "return", ...o }); }, obsDim: 13, actDim: 1, maxSteps: 20, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 3, seed: 901, ...extra });
        return { seen: seen.slice(), hash: PF.hashWeights(res.params) }; };
    const count = (list) => { const m = new Map(); for (const s of list) m.set(s, (m.get(s) || 0) + 1); return m; }, bat = (n) => Array.from({ length: n }, (_, k) => 5000 + 17 * k), tr = (it) => [0, 1, 2].map((k) => 5000 + 17 * k + 104729 * (it + 1));
    const plain = seedsOf({}), fresh = seedsOf({ freshEpisodes: true }), big = seedsOf({ batteryEps: 60 }), both = seedsOf({ freshEpisodes: true, batteryEps: 60 }), cp = count(plain.seen), cf = count(fresh.seen), cb = count(both.seen);
    ok("!! *** WITHOUT THE OPTIONS, AS EVERY EARLIER ROUND WAS TRAINED: EVERY FLY TRIED, AT BOTH ITERATIONS, IS FLOWN ON THE SAME 3 EPISODES -- the first 3 of the battery's 24 (seeds 5000 + 17 k) *** -- 2 iterations x 4 flies x 3 episodes and 2 batteries of 24: 72 resets, on 24 different seeds; each of the first 3 seeds 10 times (8 flies and 2 batteries), the other 21 twice",
        plain.seen.length === 72 && cp.size === 24 && J([...cp.keys()].sort((a, b) => a - b)) === J(bat(24)) && [0, 1, 2].every((k) => cp.get(5000 + 17 * k) === 10) && bat(24).slice(3).every((s) => cp.get(s) === 2), `${plain.seen.length} resets on ${cp.size} seeds`);
    ok("!! WITH freshEpisodes EACH ITERATION'S FLIES ARE FLOWN ON THAT ITERATION'S OWN EPISODES: seeds 5000 + 17 k + 104729 (it + 1) -- the same 3 for all 4 flies of an iteration (4 times each), other 3 for the next iteration, and none of them a battery seed; the battery is the fixed 24, each twice, and is never trained on",
        fresh.seen.length === 72 && cf.size === 30 && [0, 1].every((it) => tr(it).every((s) => cf.get(s) === 4)) && bat(24).every((s) => cf.get(s) === 2) && tr(0).concat(tr(1)).every((s) => !bat(200).includes(s)) && J(tr(0)) !== J(tr(1)) && fresh.hash !== plain.hash);
    ok("!! WITH batteryEps THE BATTERY IS THAT MANY FIXED EPISODES (60 here: seeds 5000 + 17 k, k < 60, each once an iteration), and with both options none of the 60 is trained on; a larger battery alone changes which weights are kept or leaves them, and never the flies tried",
        big.seen.length === 2 * 12 + 2 * 60 && both.seen.length === 144 && cb.size === 66 && bat(60).every((s) => cb.get(s) === 2) && [0, 1].every((it) => tr(it).every((s) => cb.get(s) === 4)) && count(big.seen).size === 60 && [0, 1, 2].every((k) => count(big.seen).get(5000 + 17 * k) === 10));
    const lib = src("brain/rl/dockPolicy.js");
    ok("the options are off unless asked for: the seeds are `5000 + 17 k` unless a base is given, the base is given only when freshEpisodes is true, and the battery is 24 unless batteryEps is given (read from the source; tools/ship/paintingFly-selfcheck.mjs pins the trainer's answers without them)",
        /\(opts\.seedBase === undefined \? 5000 : opts\.seedBase\) \+ k \* 17/.test(lib) && /const trainBase = opts\.freshEpisodes === true \? 5000 \+ 104729 \* \(it \+ 1\) : undefined;/.test(lib) && /episodes: opts\.batteryEps \|\| 24/.test(lib) && seedsOf({ freshEpisodes: false }).hash === plain.hash && seedsOf({ batteryEps: 24 }).hash === plain.hash);
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_FRESH_WIP.md");
    ok("!! THE ROUND IS ROUND 2'S WITH TWO KEYS: fresh training episodes and a battery of 200, and its own results file; the recipe is round 2's with the two carried in it; the start is the reflex and the report the return; round 2's file is BEFORE -- and the registration says the seeds",
        J(V.ROUND3) === J({ ...V2.ROUND2, fresh: true, battery: 200, results: "brain/flyEscapeFreshRound.jsonl" }) && J(V.RECIPE) === J({ ...V2.RECIPE, fresh: true, battery: 200 }) && !("fresh" in V2.RECIPE) && !("battery" in V1.RECIPE) && V.START === "reflex" && V.REPORT === "return" && V.BEFORE === V2.RESULTS && V.RESULTS === "brain/flyEscapeFreshRound.jsonl" &&
        note.includes("`" + V.RESULTS + "`") && /seeds\s+`5000 \+ 17 k \+ 104729 \(it \+ 1\)`/.test(note) && /200 fixed episodes \(seeds `5000 \+ 17 k`, k < 200\)/.test(note) && !V.AUDIT.some((s) => Array.from({ length: 200 }, (_, k) => 5000 + 17 * k).includes(s)));
    ok("the arms, their weight counts, the draws, the audit, alpha and the floors are round 2's; round 2's four tests keep round 2's words; P3's are this round's and the registration carries the first; a cfg whose battery is under 24, or whose `fresh` is not true, is refused",
        J(V.ARMS) === J(V2.ARMS) && J(V.WEIGHTS) === J(V2.WEIGHTS) && V.PLAIN_UNITS === 55 && J(V.MLP_HIDDEN) === J([16, 16]) && J(V.SEEDS) === J(V2.SEEDS) && J(V.AUDIT) === J(V2.AUDIT) && V.ALPHA === 0.01 && J(V.FLOORS) === J(V2.FLOORS) && ["T0", "T1", "T2", "T3"].every((t) => J(V.WORDS[t]) === J(V2.WORDS[t])) &&
        J(V.WORDS.P3) === J(["FRESH EPISODES AND A LARGER BATTERY ESCAPE BETTER THAN ROUND 2'S TRAINER", "FRESH EPISODES AND A LARGER BATTERY ESCAPE WORSE THAN ROUND 2'S TRAINER", "FRESH EPISODES AND A LARGER BATTERY CANNOT BE TOLD APART FROM ROUND 2'S TRAINER"]) && note.includes("`" + V.WORDS.P3[0] + "`") &&
        throws(() => V1.makeEscapeRound({ results: "x", battery: 10 }), /a cfg is/) && throws(() => V1.makeEscapeRound({ results: "x", fresh: false }), /a cfg is/));
    const A40 = V.AUDIT.slice(0, 40), ref = V.auditScore(E.RULES.reflex, A40);
    ok("!! THE START IS STILL THE REFLEX AND A DRAW'S UNTRAINED FLY IS ROUND 2'S: draw 2 of every arm weight for weight, and on 40 episodes every arm's untrained draw 3 has the reflex's score and counts to the bit", V.ARMS.every((a) => J(Array.from(V.policyOf(a, 2).getParams())) === J(Array.from(V2.policyOf(a, 2).getParams()))) && V.ARMS.every((a) => { const p = V.policyOf(a, 3); return J(V.auditScore((o) => p.act(o), A40)) === J(ref); }));
});

console.log("\n3. ONE TRAINING (2 iterations, 8 flies tried, 160 ticks, a battery of 30, on draw 901)");
section(() => {
    const r = V.trainOne("FLY", 901, TINY, TINY_AUDIT), two = V2.trainOne("FLY", 901, TINY2, TINY_AUDIT), c = P.ARMS.FLY(901);
    const wrapped = ({ obsDim, actDim, seed }) => new RS.ReflexStart(new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed }), { rule: E.RULES.reflex, tail: c.units + 1 });
    const common = { envFactory: (o = {}) => new E.EscapeEnv({ maxSteps: 160, report: "return", ...o }), obsDim: 13, actDim: 1, maxSteps: 160, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 8, seed: 901, policyFactory: wrapped };
    const direct = trainDockES({ ...common, freshEpisodes: true, batteryEps: 30 }), onlyFresh = trainDockES({ ...common, freshEpisodes: true }), onlyBig = trainDockES({ ...common, batteryEps: 30 });
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S CALLED HERE BY HAND WITH BOTH OPTIONS (the wrapped circuit, the environment that reports the return, fresh episodes, the recipe's battery), to the hash; with fresh episodes alone the first iteration's flies are the same and the history's readings are of a battery of 24, not 30; round 2's code with the same numbers and neither option ends at other weights; the record carries the recipe with both keys",
        PF.hashWeights(direct.params) === r.weightsHash && J(r.recipe) === J(TINY) && r.weightCount === 824 && J(r.history) === J(direct.history.map((h) => ({ it: h.it, ret: h.avgReturn, lived: h.dockRate }))) && r.weightsHash !== two.weightsHash && J(onlyFresh.history.map((h) => h.avgReturn)) !== J(direct.history.map((h) => h.avgReturn)) && PF.hashWeights(onlyBig.params) !== r.weightsHash);
    const p = V.policyOf("FLY", 901); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore((o) => p.act(o), TINY_AUDIT, 160);
    ok("the weights give the score again through the wrapped fly, to the bit", a.score === r.score && a.alive === r.alive && a.fledPass === r.fledPass);
});

console.log("\n4. THE RECORDS");
section(() => {
    const hist = (s, top) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, ret: 0.65 + (k === 0 ? 0 : k === 3 ? top : top / 2) + s / 100000, lived: 0 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "MLP" ? null : V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c ? c.units : null, edges: c ? c.edges.length : null, edgesHash: c ? PF.hashEdges(c.edges) : null, weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), score, alive: 170, fed: 0.5, strikes: 400, caught: 30, passes: 300, fledPass: 60, history: hist(s, 0.04) }; };
    const flo = () => ({ kind: "floors", ...Object.fromEntries(Object.entries(V.FLOORS).map(([k, v]) => [k, { score: v, alive: 150, fed: 0.3, strikes: 400, caught: 40, passes: 300, fledPass: 80 }])), untrained: Object.fromEntries(V.ARMS.map((a) => [a, V.FLOORS.reflex])) });
    const file = (scoreOf) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, flo()); return out; };
    const spread = (arm, s) => 0.60 + s / 200 + V.ARMS.indexOf(arm) / 1000, beforeOf = (scoreOf = spread) => V.SEEDS.flatMap((s) => V.ARMS.map((arm) => ({ kind: "draw", arm, s, score: scoreOf(arm, s), history: hist(s, 0.10) })));
    const good = file((arm, s) => spread(arm, s) + 0.001), before = beforeOf();
    ok("!! a file of 80 draws beside round 2's 80 passes every check; round 2's file short of a draw, with one twice, or not handed in fails by name, and then no test is made -- round 2's four and T1's footing included; a record trained with round 2's recipe (neither key) fails as another recipe",
        V.checkRecords(good, before).length === 0 && [before.slice(1), before.concat([before[3]]), null].every((bf) => V.checkRecords(good, bf).some((b) => /round 2's file \(brain\/flyEscapeReflexRound\.jsonl\) does not hold its 80 draws, each once/.test(b))) &&
        (() => { const R = V.reading(good, null); return R.P3 === null && R.T0 === null && R.T3 === null && R.T1 === null && R.asked === null && /A CHECK FAILED/.test(V.readingLines(R)[0]); })() && (() => { const L = JSON.parse(J(good)); L[0].recipe = { ...V2.RECIPE }; return V.checkRecords(L, before).some((b) => /was trained with another recipe/.test(b)); })(), V.checkRecords(good, before).slice(0, 2).join(" | "));
    const up = V.reading(good, before), down = V.reading(file((arm, s) => spread(arm, s) - 0.001), before), tie = V.reading(file(spread), before), part = V.reading(file((arm, s) => spread(arm, s) + (s <= 10 ? 0.001 : -0.001)), before);
    ok("!! P3 IS EACH FLY AGAINST ITS ROUND 2 SELF, PAIRED: with round 2's flies spread from 0.60 to 0.68 by draw and each of this round's a thousandth above its own -> ESCAPE BETTER (80 of 80), though as two groups they overlap wholly; each a thousandth below -> WORSE; each EQUAL -> CANNOT BE TOLD APART, 80 ties; 50 above and 30 below -> CANNOT (52 speaks)",
        up.P3.word === V.WORDS.P3[0] && up.P3.above === 80 && up.P3.n === 80 && down.P3.word === V.WORDS.P3[1] && down.P3.below === 80 && tie.P3.word === V.WORDS.P3[2] && tie.P3.ties === 80 && part.P3.word === V.WORDS.P3[2] && part.P3.above === 50 && part.P3.below === 30);
    const lines = V.readingLines(up).join("\n");
    ok("!! THE GAP THIS ROUND IS FOR IS IN THE READING: for each arm the gain the trainer saw on its battery (the best reading of a training's history less its first) beside the gain on the audit (the score less the reflex's), for this round and for round 2 from round 2's own histories -- 0.04 and 0.10 on the battery here; round 2's four tests are still made, against the reflex in this round's floors",
        V.ARMS.every((a) => near(up.gap[a].battery, 0.04, 1e-9) && near(up.gapBefore[a].battery, 0.10, 1e-9) && near(up.gap[a].audit, good.filter((r) => r.kind === "draw" && r.arm === a).reduce((n, r) => n + r.score, 0) / 16 - V.FLOORS.reflex, 1e-9)) && near(up.before.FLY, 0.6425, 1e-9) && up.T3.word === V.WORDS.T3[2] && near(up.T3.ref, 0.6465) && typeof up.asked === "boolean" &&
        /the gain the trainer saw on its battery, and the gain on the audit: FLY 0\.0400 and /.test(lines) && /the same for round 2: FLY 0\.1000 and /.test(lines) && /P3 \(every fly against its round 2 self\): of 80 pairs, 80 above, 0 below, 0 equal/.test(lines) && /round 2's arms \(8 fixed training episodes, a battery of 24\): FLY 0\.6425/.test(lines) && lines.includes(V.WORDS.P3[0]));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "WORM", "1"], ["job", "FLY", "x"], ["job", "FLY", "17"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for a registered arm and draw; eight other shapes are not words)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FLY", "16"])) === J({ cmd: "job", arm: "FLY", s: 16 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeFresh.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, and READS ROUND 2'S FILE (the library's BEFORE) and hands its records to the reading",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeFresh\.mjs"/.test(csrc) && !/"\.\/flyEscape\.mjs"|"\.\/flyEscapeReflex\.mjs"|flyEscapeReflexRound|flyEscapeRound\b|voxelHome/.test(csrc) && /path\.join\(ENG, PF\.BEFORE\)/.test(csrc) && /PF\.reading\(linesOf\(\), before\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeFresh\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyEscapeFresh-selfcheck.mjs"), calls = [...me.matchAll(/V2?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its two trainings through the round's code are of 2 iterations with 8 flies tried on draw 901 (the others are the trainer called by hand, on that draw or on 20-tick episodes); this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 2 && calls.every((c) => /^"FLY", 901, TINY2?, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 8 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyEscapeFresh-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
