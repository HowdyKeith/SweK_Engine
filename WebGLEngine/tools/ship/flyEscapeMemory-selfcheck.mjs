// WebGLEngine/tools/ship/flyEscapeMemory-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeMemory-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations with 8 flies tried on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 4 (registered in brain/FLY_ESCAPE_MEMORY_WIP.md before brain/rl/carryCircuit.mjs and tools/ship/flyEscapeMemory.mjs existed): round 3's flies with memory between ticks.
// The round is tools/ship/flyEscape.mjs's makeEscapeRound() with round 3's cfg and one key; this gate holds the memory and the key.
//   1  THE MEMORY            brain/rl/carryCircuit.mjs: half a unit's last activity is its next input; an episode starts with nothing carried; in an arm with connections what is carried moves, in
//                            one without it stays; no weight is added
//   2  THE ROUND'S NUMBERS   round 3's cfg and `memory: true`; four arms, the MLP not among them; the start is still the reflex
//   3  ONE TRAINING          a record's weights are the trainer's from a remembering, wrapped policy made here by hand
//   4  THE RECORDS           64 draws; M3, each fly against its round 3 self; round 3's MLP is not asked for
//   6  THE VERDICT            the round's results, read from the committed file
//   5  THE COMMAND           it is this round's and reads round 3's file; no training of the round's, no process
// ONE LOOK BEFORE THE ROUND, SAID: to see that a remembering fly trains at all, one training of 2 iterations with 8 flies tried was run on draw 901 (which the round does not use); its two history
// readings were 0.537 and 0.505. Nothing else was trained before the round's own run.
// SABOTAGE LOG (2026-11-15) -- with round 3's, through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate, round 3's, rounds 1 and 2's,
// tools/ship/voxelHome-selfcheck.mjs and tools/ship/paintingFly-selfcheck.mjs run whole for each; every one red by name (the number is the rows red over the six gates):
//   THE MEMORY: Y16 nothing carried 4 | Y17 an episode starts with the last one's activity 2 | Y18 what is carried has no cap 1 | Y19 the whole of the last activity carried 2
//   Y20 what is carried is the activity before the three steps 1
//   THE ROUND: Y21 round 4's circuits forget 2 | Y22 round 4 has the MLP 4 | Y23 the clock taken to be the tenth number 3 | Y24 every round remembers 23 | Y28 writes round 3's results file 1
//   THE READING AND THE COMMAND: Y25 M3 pairs each fly with round 3's draw 1 1 | Y26 M3's BETTER and WORSE each other's 2 | Y27 round 3's MLP among the flies asked for 2
//   Y29 the command reads round 3's library 1 | Y30 the command exits 0 on a word it does not know 1
// THE VERDICT'S SABOTAGES (2026-11-16, section 6; the same runner, this gate and the other of rounds 3 and 4 run whole for each; the number is the rows red over the two; the library was not
// sabotaged again, round 5's run was importing it): V1 a round 3 fly's score raised by 0.05 in round 3's file 6 | V2 a round 4 fly's score raised by 0.05 in the file 6 | V3 a round 4 fly that fell below the reflex put above it 7 | V5 round 4's note says memory is worse 1
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as V from "./flyEscapeMemory.mjs";
import * as V3 from "./flyEscapeFresh.mjs";
import * as V1 from "./flyEscape.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as RS from "../../brain/rl/reflexStart.mjs";
import * as CC from "../../brain/rl/carryCircuit.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: 160, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 8, fresh: true, battery: 30 }), TINY_AUDIT = [880001, 880002, 880003, 880004, 880005, 880006];
const OBS = (() => { const env = new E.EscapeEnv(); let o = env.reset(900001), done = false; const out = []; while (!done) { out.push(o); const r = env.step(E.RULES.reflex(o)); o = r.obs; done = r.done; } return out; })();

console.log("flyEscapeMemory-selfcheck -- the escape round 4 (memory between ticks): the memory, the numbers, one training, the records, the command\n");

console.log("1. THE MEMORY (brain/rl/carryCircuit.mjs)");
section(() => {
    const c = P.ARMS.FLY(5), mk = (edges = c.edges, units = c.units) => new CC.CarryCircuitPolicy({ obsDim: 13, actDim: 1, units, edges, seed: 5, clock: 10 }), plainOf = (edges = c.edges, units = c.units) => new P.CircuitPolicy({ obsDim: 13, actDim: 1, units, edges, seed: 5 });
    const m = mk(), p = plainOf(), w = Float32Array.from(p.getParams(), (v, i) => v + Math.sin(i) * 0.05); m.setParams(w); p.setParams(w);
    ok("!! NO WEIGHT IS ADDED, AND AN EPISODE STARTS WITH NOTHING CARRIED: the remembering policy has CircuitPolicy's weights in CircuitPolicy's order (the same seed, the same list); at an episode's first tick (its clock reads 0) its activity and its answer are CircuitPolicy's, number for number; the half and the cap are 0.5 and 8",
        J(arr(mk().getParams())) === J(arr(plainOf().getParams())) && m.paramCount() === 824 && OBS[0][10] === 0 && J(arr(m.activity(OBS[0]))) === J(arr(p.activity(OBS[0]))) && J(arr(mk().setParams(w).act(OBS[0]))) === J(arr(p.act(OBS[0]))) && CC.CARRY === 0.5 && CC.CAP === 8);
    // the second tick by hand: the encoder's input plus half of what the first tick ended at, then the three steps
    const a = mk().setParams(w), h1 = arr(a.activity(OBS[0])), got = arr(a.activity(OBS[1])), W1 = w.subarray(0, 34 * 13), b1 = w.subarray(34 * 13, 34 * 13 + 34), Wr = w.subarray(34 * 13 + 34, 34 * 13 + 34 + 313);
    let h = new Float32Array(34); for (let u = 0; u < 34; u++) { let acc = b1[u] + 0.5 * Math.min(h1[u], 8); for (let i = 0; i < 13; i++) acc += W1[u * 13 + i] * OBS[1][i]; h[u] = acc > 0 ? acc : 0; }
    for (let s = 0; s < 3; s++) { const g = Float32Array.from(h); for (let k = 0; k < 313; k++) g[c.edges[k][0]] += Wr[k] * h[c.edges[k][1]]; for (let u = 0; u < 34; u++) if (!(g[u] > 0)) g[u] = 0; h = g; }
    ok("!! AT THE NEXT TICK A UNIT'S INPUT IS THE ENCODER'S PLUS HALF ITS OWN ACTIVITY AT THE END OF THE TICK BEFORE, then the same three steps along the connections -- computed here by hand for the second tick of an episode, unit for unit; and it is not what the forgetting policy answers there",
        J(got) === J(arr(h)) && J(got) !== J(arr(p.activity(OBS[1]))) && OBS[1][10] > 0 && J(arr(a.carried())) === J(got.map((v) => Math.min(v, 8))) && h1.some((v) => v > 0));
    const twice = mk().setParams(w), first = OBS.slice(0, 30).map((o) => twice.act(o)[0]), second = OBS.slice(0, 30).map((o) => twice.act(o)[0]), fresh = mk().setParams(w), third = OBS.slice(0, 30).map((o) => fresh.act(o)[0]);
    ok("!! A NEW EPISODE FORGETS THE LAST: one policy flown through the same 30 ticks twice answers the same both times (the clock's 0 clears what was carried), as a policy just made does; and within an episode the answers are not the forgetting policy's", J(first) === J(second) && J(first) === J(third) && J(first) !== J(OBS.slice(0, 30).map((o) => p.act(o)[0])));
    const big = mk(); big.setParams(Float32Array.from(big.getParams(), () => 3)); big.activity(OBS[0]); const capped = arr(big.carried());
    ok("what is carried is held to at most 8, so nothing can run away: with every weight 3 the units' activity is in the hundreds and each carries 8", capped.every((v) => v === 8) && arr(big.activity(OBS[1])).some((v) => v > 100));
    // where memory goes: poke one unit's carried activity and see who feels it at the next tick
    const felt = (edges, units, poke) => { const q = new CC.CarryCircuitPolicy({ obsDim: 13, actDim: 1, units, edges, seed: 5, clock: 10 }), ww = q.getParams(); for (let k = 0; k < edges.length; k++) ww[units * 13 + units + k] = 0.3; q.setParams(ww); q.activity(OBS[0]); const base = (() => { const r = new CC.CarryCircuitPolicy({ obsDim: 13, actDim: 1, units, edges, seed: 5, clock: 10 }); r.setParams(ww); r.activity(OBS[0]); return arr(r.activity(OBS[1])); })(); q._carry[poke] += 1; const now = arr(q.activity(OBS[1])); return now.map((v, u) => (v !== base[u] ? u : -1)).filter((u) => u >= 0); };
    const plainFelt = felt([], 55, 7), flyFelt = felt(c.edges, 34, 7), downstream = new Set([7]); for (let s = 0; s < 3; s++) for (const [to, from] of c.edges) if (downstream.has(from)) downstream.add(to);
    ok("!! *** IN AN ARM WITH CONNECTIONS WHAT IS CARRIED MOVES FROM CELL TO CELL; IN ONE WITHOUT, IT STAYS *** -- one unit's carried activity raised by 1: in the plain net only that unit differs at the next tick; in the fly's circuit the units that differ are that unit and cells its connections reach within the three steps, more than one and none outside them",
        J(plainFelt) === J([7]) && flyFelt.length > 1 && flyFelt.includes(7) && flyFelt.every((u) => downstream.has(u)), `plain ${J(plainFelt)}; fly ${flyFelt.length} of ${downstream.size} reachable`);
    ok("the policy must be told which input is the clock: none, or one that is not an input, is refused by name", throws(() => new CC.CarryCircuitPolicy({ obsDim: 13, actDim: 1, units: 4, edges: [], seed: 1 }), /clock is the index of the input that is the episode's clock, 0 to 12/) && throws(() => new CC.CarryCircuitPolicy({ obsDim: 13, actDim: 1, units: 4, edges: [], seed: 1, clock: 13 }), /clock is the index/));
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_MEMORY_WIP.md");
    ok("!! THE ROUND IS ROUND 3'S WITH ONE KEY: memory, and its own results file; round 3's recipe to the number (fresh episodes, a battery of 200); the reflex start and the report \"return\"; round 3's file is BEFORE; rounds 1 to 3 have no memory",
        J(V.ROUND4) === J({ ...V3.ROUND3, memory: true, results: "brain/flyEscapeMemoryRound.jsonl" }) && J(V.RECIPE) === J(V3.RECIPE) && V.MEMORY === true && V1.makeEscapeRound(V3.ROUND3).MEMORY === false && V1.makeEscapeRound(V1.ROUND1).MEMORY === false && V.START === "reflex" && V.REPORT === "return" && V.BEFORE === V3.RESULTS && note.includes("`" + V.RESULTS + "`"));
    ok("!! FOUR ARMS, THE MLP NOT AMONG THEM (it has nothing to carry), with the weight counts they had; the draws, the audit, alpha and the floors are round 3's; M3's words are this round's and the registration carries the first; a cfg whose `memory` is not true is refused",
        J(V.ARMS) === J(["FLY", "SHUF", "PLAIN", "FISH"]) && V.ARMS.every((a) => V.WEIGHTS[a] === V3.WEIGHTS[a] && V.policyOf(a, 2).getParams().length === V.WEIGHTS[a]) && throws(() => V.policyOf("MLP", 1), /no arm MLP/) && J(V.SEEDS) === J(V3.SEEDS) && J(V.AUDIT) === J(V3.AUDIT) && V.ALPHA === 0.01 && J(V.FLOORS) === J(V3.FLOORS) && V.PLAIN_UNITS === 55 &&
        J(V.WORDS.M3) === J(["MEMORY BETWEEN TICKS ESCAPES BETTER THAN NONE", "MEMORY BETWEEN TICKS ESCAPES WORSE THAN NONE", "MEMORY BETWEEN TICKS CANNOT BE TOLD APART FROM NONE"]) && note.includes("`" + V.WORDS.M3[0] + "`") && ["T0", "T1", "T2", "T3"].every((t) => J(V.WORDS[t]) === J(V3.WORDS[t])) && throws(() => V1.makeEscapeRound({ results: "x", memory: false }), /a cfg is/) && /4 arms x 16 draws = 64 trainings/.test(note));
    const A40 = V.AUDIT.slice(0, 40), ref = V.auditScore(E.RULES.reflex, A40), fl = V.floors(A40);
    ok("!! A DRAW'S UNTRAINED FLY IS ROUND 3'S WEIGHTS IN A REMEMBERING CIRCUIT, AND IS STILL THE REFLEX: draw 2 of every arm, weight for weight round 3's; the network inside the reflex wrapper is the remembering policy, told the clock is the eleventh number; and on 40 episodes every arm's untrained draw 3 has the reflex's score and counts to the bit, as the floors say",
        V.ARMS.every((a) => J(arr(V.policyOf(a, 2).getParams())) === J(arr(V3.policyOf(a, 2).getParams())) && V.policyOf(a, 2).inner instanceof CC.CarryCircuitPolicy && V.policyOf(a, 2).inner.clock === 10 && !(V3.policyOf(a, 2).inner instanceof CC.CarryCircuitPolicy)) && OBS[0][10] === 0 && OBS[5][10] === 5 / 160 &&
        V.ARMS.every((a) => { const p = V.policyOf(a, 3); return J(V.auditScore((o) => p.act(o), A40)) === J(ref); }) && V.ARMS.every((a) => fl.untrained[a] === fl.reflex.score) && J(Object.keys(fl.untrained)) === J(V.ARMS));
});

console.log("\n3. ONE TRAINING (2 iterations, 8 flies tried, 160 ticks, a battery of 30, on draw 901)");
section(() => {
    const r = V.trainOne("FLY", 901, TINY, TINY_AUDIT), three = V3.trainOne("FLY", 901, TINY, TINY_AUDIT), pl = V.trainOne("PLAIN", 901, TINY, TINY_AUDIT), c = P.ARMS.FLY(901);
    const direct = trainDockES({ envFactory: (o = {}) => new E.EscapeEnv({ maxSteps: 160, report: "return", ...o }), obsDim: 13, actDim: 1, maxSteps: 160, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 8, seed: 901, freshEpisodes: true, batteryEps: 30,
        policyFactory: ({ obsDim, actDim, seed }) => new RS.ReflexStart(new CC.CarryCircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed, clock: 10 }), { rule: E.RULES.reflex, tail: c.units + 1 }) });
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A REMEMBERING, WRAPPED POLICY MADE HERE BY HAND (the fly's circuit, the clock the eleventh number, the reflex wrapper, the environment that reports the return, fresh episodes, the recipe's battery), to the hash; round 3's code with the same numbers and no memory ends at other weights; the record carries its arm's weight count and wiring",
        PF.hashWeights(direct.params) === r.weightsHash && r.weightsHash !== three.weightsHash && r.weightCount === 824 && r.edges === 313 && pl.weightCount === 826 && pl.edges === 0 && J(r.recipe) === J(TINY) && J(r.history) === J(direct.history.map((h) => ({ it: h.it, ret: h.avgReturn, lived: h.dockRate }))));
    const again = [["FLY", r], ["PLAIN", pl]].map(([arm, rec]) => { const p = V.policyOf(arm, 901); p.setParams(PF.unpackWeights(rec.weights)); const a = V.auditScore((o) => p.act(o), TINY_AUDIT, 160), b = V.auditScore((o) => p.act(o), TINY_AUDIT, 160); return a.score === rec.score && a.alive === rec.alive && a.fledPass === rec.fledPass && J(a) === J(b); });
    ok("!! THE WEIGHTS GIVE THE SCORE AGAIN, AND AGAIN: a record's weights in its arm's remembering fly, audited on the same episodes, give its score and counts to the bit -- twice running through the one policy (each episode starts with nothing carried, so the order of episodes does not matter)", again.every(Boolean));
});

console.log("\n4. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, ret: 0.65 + (k === 0 ? 0 : 0.03) + s / 100000, lived: 0 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), score, alive: 170, fed: 0.5, strikes: 400, caught: 30, passes: 300, fledPass: 60, history: hist(s) }; };
    const flo = () => ({ kind: "floors", ...Object.fromEntries(Object.entries(V.FLOORS).map(([k, v]) => [k, { score: v, alive: 150, fed: 0.3, strikes: 400, caught: 40, passes: 300, fledPass: 80 }])), untrained: Object.fromEntries(V.ARMS.map((a) => [a, V.FLOORS.reflex])) });
    const file = (scoreOf) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, flo()); return out; };
    const spread = (arm, s) => 0.60 + s / 200 + V.ARMS.indexOf(arm) / 1000, beforeOf = (scoreOf = spread, withMlp = true) => V.SEEDS.flatMap((s) => [...V.ARMS, ...(withMlp ? ["MLP"] : [])].map((arm) => ({ kind: "draw", arm, s, score: arm === "MLP" ? 0.99 : scoreOf(arm, s), history: hist(s) })));
    const good = file((arm, s) => spread(arm, s) + 0.001), before = beforeOf();
    ok("!! a file of 64 draws (four arms) beside round 3's file passes every check, whether or not that file has its MLP draws; the reading's first line says 64; an MLP draw in THIS file is not a registered draw; round 3's file short of one of these arms' draws, or not handed in, fails by name and then no test is made",
        V.checkRecords(good, before).length === 0 && good.length === 66 && V.checkRecords(good, beforeOf(spread, false)).length === 0 && /^the checks hold: 64 draws, each once/.test(V.readingLines(V.reading(good, before))[0]) &&
        (() => { const L = JSON.parse(J(good)); L[0].arm = "MLP"; return V.checkRecords(L, before).some((b) => /MLP draw 1 is not a registered draw/.test(b)); })() && [before.filter((r) => !(r.arm === "FISH" && r.s === 4)), null].every((bf) => V.checkRecords(good, bf).some((b) => /round 3's file \(brain\/flyEscapeFreshRound\.jsonl\) does not hold the 64 draws of these arms, each once/.test(b))) &&
        (() => { const R = V.reading(good, null); return R.M3 === null && R.T1 === null && R.T3 === null && R.asked === null && /A CHECK FAILED/.test(V.readingLines(R)[0]); })(), V.checkRecords(good, before).slice(0, 2).join(" | "));
    const up = V.reading(good, before), down = V.reading(file((arm, s) => spread(arm, s) - 0.001), before), tie = V.reading(file(spread), before), part = V.reading(file((arm, s) => spread(arm, s) + (s <= 10 ? 0.001 : -0.001)), before);
    ok("!! M3 IS EACH FLY AGAINST ITS ROUND 3 SELF, PAIRED, OVER THE 64: each a thousandth above its own -> ESCAPES BETTER THAN NONE (64 of 64; round 3's MLP, at 0.99 in that file, is not among them and moves nothing); each below -> WORSE; each EQUAL -> CANNOT BE TOLD APART, 64 ties; 40 above and 24 below -> CANNOT (p 0.060)",
        up.M3.word === V.WORDS.M3[0] && up.M3.above === 64 && up.M3.n === 64 && down.M3.word === V.WORDS.M3[1] && down.M3.below === 64 && tie.M3.word === V.WORDS.M3[2] && tie.M3.ties === 64 && part.M3.word === V.WORDS.M3[2] && part.M3.above === 40 && part.M3.below === 24 && near(part.M3.p, 0.0599, 5e-4));
    const lines = V.readingLines(up).join("\n"), wire = V.reading(file((arm, s) => (arm === "FLY" ? 0.75 : arm === "SHUF" ? 0.70 : 0.80) + s / 100000), before);
    ok("the earlier four tests are made over the four arms (T3 of 64), T1 and T2 the rank-sums with the earlier words (FLY above SHUF and below PLAIN -> BETTER, WORSE; T1 then asked of flies that do the task); the reading carries round 3's means of these arms and each arm's gain on the battery and on the audit, and its lines say them and M3",
        up.T3.n === 64 && wire.T1.word === V.WORDS.T1[0] && wire.T2.word === V.WORDS.T2[1] && wire.asked === true && wire.T3.above === 64 && J(Object.keys(up.before)) === J(V.ARMS) && near(up.before.FLY, 0.6425, 1e-9) && V.ARMS.every((a) => near(up.gap[a].battery, 0.03, 1e-9)) &&
        /M3 \(every fly against its round 3 self\): of 64 pairs, 64 above, 0 below, 0 equal/.test(lines) && /round 3's arms \(the same flies with no memory\): FLY 0\.6425; SHUF/.test(lines) && !/MLP/.test(lines) && /T3 \(all the flies against the reflex\): of 64,/.test(lines) && lines.includes(V.WORDS.M3[0]));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "MLP", "1"], ["job", "FLY", "x"], ["job", "FLY", "17"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for one of this round's four arms and a draw; eight other shapes are not words, a job for the MLP among them)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FISH", "16"])) === J({ cmd: "job", arm: "FISH", s: 16 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeMemory.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, and READS ROUND 3'S FILE (the library's BEFORE) and hands its records to the reading",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeMemory\.mjs"/.test(csrc) && !/"\.\/flyEscape\.mjs"|"\.\/flyEscapeFresh\.mjs"|"\.\/flyEscapeReflex\.mjs"|flyEscapeFreshRound|voxelHome/.test(csrc) && /path\.join\(ENG, PF\.BEFORE\)/.test(csrc) && /PF\.reading\(linesOf\(\), before\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeMemory\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyEscapeMemory-selfcheck.mjs"), calls = [...me.matchAll(/V3?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its three trainings through the rounds' code are of 2 iterations with 8 flies tried on draw 901; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 3 && calls.every((c) => /^"(FLY|PLAIN)", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 8 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (round 4; the results were committed at 13b8fe4b before they were read, and are read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), old = fs.readFileSync(path.join(ENG, V.BEFORE), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const R = V.reading(lines, old), A = R.arms, draws = lines.filter((r) => r.kind === "draw"), ref = R.floors.reflex.score, was = (r) => old.find((x) => x.kind === "draw" && x.arm === r.arm && x.s === r.s).score;
    ok("!! the results file is the one the run wrote: 66 records, sha256 b67c9e111bce3683...", lines.length === 66 && createHash("sha256").update(bytes).digest("hex") === "b67c9e111bce368319a9d62f2d6b495a4ae40e5c795aaa83e13ec3d70e3e8124");
    ok("!! THE CHECKS HOLD, AND THE START WAS THE REFLEX: 64 draws each once, round 3's recipe, each arm's weight count and wiring, FLY draw 1 the same twice, a history in every record, the registered floors, round 3's file with these arms' 64 draws -- and the untrained remembering fly of every arm scores the reflex's 0.6465, to the bit", R.checks.length === 0 && V.ARMS.every((a) => R.floors.untrained[a] === ref) && near(ref, 0.6465), R.checks.slice(0, 2).join(" | "));
    ok("!! *** M3: MEMORY BETWEEN TICKS CANNOT BE TOLD APART FROM NONE -- AND IT LEANS WORSE *** -- of the 64 flies 22 score above their round 3 selves and 42 below (exact two-sided p 0.017; 0.01 was registered). The 64 average 0.7240 with memory against 0.7420 without",
        R.M3 && R.M3.word === V.WORDS.M3[2] && R.M3.above === 22 && R.M3.below === 42 && R.M3.ties === 0 && near(R.M3.p, 0.016858) && near(draws.reduce((n, r) => n + r.score, 0) / 64, 0.7240) && near(draws.reduce((n, r) => n + was(r), 0) / 64, 0.7420, 1e-4));
    ok("!! *** T1, WITH MEMORY TO ROUTE: THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT *** -- asked of flies that do the task (both means above the reflex's); the fly's ranks sum to 277, the middle is 264 (exact two-sided p 0.64). T2, memory that moves between cells against memory that stays in each: CANNOT BE TOLD APART FROM A PLAIN NET (316; p 0.051)",
        R.asked === true && R.T1 && R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 277 && near(R.T1.p, 0.64202) && R.T2 && R.T2.word === V.WORDS.T2[2] && R.T2.sumA === 316 && near(R.T2.p, 0.05134));
    ok("!! T3: A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX (59 of the 64 above, 4 below, 1 equal: p 9.0e-13); T0: the FLY arm CANNOT BE TOLD APART FROM THE REFLEX (13 above, 3 below; p 0.021 -- 14 speaks). The four below are FLY draws 7, 13 and 16 and SHUF draw 4 (0.5624, the least), and SHUF draw 11 ended at the reflex's own number",
        R.T3 && R.T3.word === V.WORDS.T3[0] && R.T3.above === 59 && R.T3.below === 4 && R.T3.ties === 1 && near(R.T3.p, 9.003e-13, 1e-15) && R.T0 && R.T0.word === V.WORDS.T0[2] && R.T0.above === 13 && R.T0.below === 3 && near(R.T0.p, 0.02127) &&
        J(draws.filter((r) => r.score < ref).map((r) => r.arm + r.s).sort()) === J(["FLY13", "FLY16", "FLY7", "SHUF4"]) && draws.find((r) => r.arm === "SHUF" && r.s === 11).score === ref && near(Math.min(...draws.map((r) => r.score)), 0.5624));
    const pair = (a) => { const v = draws.filter((r) => r.arm === a); return [v.filter((r) => r.score > was(r)).length, v.filter((r) => r.score < was(r)).length]; }, sc = (a) => draws.filter((r) => r.arm === a).sort((x, y) => x.s - y.s).map((r) => r.score);
    ok("!! the arms with memory beside themselves without (mean, sd; round 3's mean; flies above / below their own round 3 selves): FLY 0.7134 0.0533 (0.7432; 6 / 10), SHUF 0.7173 0.0477 (0.7392; 6 / 10), PLAIN 0.7157 0.0123 (0.7444; 0 / 16), FISH 0.7497 0.0096 (0.7410; 10 / 6) -- THE PLAIN NET IS WORSE WITH MEMORY IN ALL 16 DRAWS, the two fly-sized circuits spread out (three FLY draws fell below the reflex), the fish's is the only arm not lower",
        near(A.FLY.mean, 0.7134) && near(A.FLY.sd, 0.0533) && near(A.SHUF.mean, 0.7173) && near(A.SHUF.sd, 0.0477) && near(A.PLAIN.mean, 0.7157) && near(A.PLAIN.sd, 0.0123) && near(A.FISH.mean, 0.7497) && near(A.FISH.sd, 0.0096) && near(R.before.FLY, 0.7432) && near(R.before.SHUF, 0.7392) && near(R.before.PLAIN, 0.7444) && near(R.before.FISH, 0.7410) &&
        J(V.ARMS.map(pair)) === J([[6, 10], [6, 10], [0, 16], [10, 6]]));
    const fishV = (a) => PF.rankSum(sc("FISH"), sc(a));
    ok("!! SEEN AFTER THE READING, NOT REGISTERED, AND NOT A FINDING UNTIL A ROUND ASKS IT: the fish's circuit with memory ranks above each other arm with memory (against PLAIN the ranks sum to 388 of a possible 392, p 4.0e-8; against SHUF 348, p 0.0011; against FLY 328, p 0.015) -- three comparisons chosen after looking, of an arm whose own gain over its round 3 self is 10 of 16",
        fishV("PLAIN").sumA === 388 && fishV("PLAIN").p < 1e-7 && fishV("SHUF").sumA === 348 && near(fishV("SHUF").p, 0.00106, 1e-5) && fishV("FLY").sumA === 328 && near(fishV("FLY").p, 0.01518, 1e-5));
    const H = (a) => A[a].history.map((h) => h.ret);
    ok("!! WHAT THE TRAINER SAW: with memory every arm's battery reading FALLS at first -- at iteration 25 the four arms read 0.546 to 0.586, below the 0.60 to 0.64 they read at iteration 0 -- and climbs back; the plain net never gets past 0.621, the fish's circuit ends at 0.741. The gain on the battery and on the audit, by arm: FLY 0.073 and 0.067, SHUF 0.084 and 0.071, PLAIN 0.052 and 0.069, FISH 0.133 and 0.103",
        V.ARMS.every((a) => H(a)[1] > 0.545 && H(a)[1] < 0.587 && H(a)[0] > 0.60 && H(a)[0] < 0.64 && H(a)[1] < H(a)[0]) && Math.max(...H("PLAIN")) < 0.6215 && near(H("FISH")[6], 0.7411) &&
        near(R.gap.FLY.battery, 0.0732) && near(R.gap.FLY.audit, 0.0669) && near(R.gap.SHUF.battery, 0.0837) && near(R.gap.SHUF.audit, 0.0708) && near(R.gap.PLAIN.battery, 0.0520) && near(R.gap.PLAIN.audit, 0.0692) && near(R.gap.FISH.battery, 0.1325) && near(R.gap.FISH.audit, 0.1033));
    const again = V.ARMS.flatMap((arm) => [2, 4].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore((o) => p.act(o)); return [arm, s, a.score === r.score && a.alive === r.alive && a.fledPass === r.fledPass && a.caught === r.caught]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS COUNTS AGAIN: draws 2 and 4 of every arm (the best fly and the worst among them), audited here on the 200 episodes through the remembering, wrapped fly, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/FLY_ESCAPE_MEMORY_WIP.md"), res = note.slice(note.indexOf("## 8. The result"));
    ok("the expectations, written before the code, against what came: M3 CANNOT was the 45 percent guess and came (WORSE, which it leans to, was given 20); T1 CANNOT BE TOLD APART the 70, came; T2 CANNOT the 60, came; T3 BETTER the 70, came; some arm's mean above 0.70 was given 25 percent and all four are",
        /M3: BETTER about 35 percent, CANNOT about 45, WORSE about 20/.test(note) && /\*\*T1: CANNOT BE TOLD APART about 70 percent/.test(note) && /T2: CANNOT about 60/.test(note) && /T3: BETTER about 70/.test(note) && /above 0\.70: about 25 percent/.test(note) && V.ARMS.every((a) => A[a].mean > 0.70));
    ok("the registration's RESULT SECTION (section 8, and not the list of possible words in section 2) carries the five readings' words", /## 8\. The result/.test(note) && [["M3", R.M3.word], ["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word], ["T3", R.T3.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)));
});

console.log(`\nflyEscapeMemory-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
