// WebGLEngine/tools/ship/flyEscapeReflex-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeReflex-selfcheck.mjs      (a few seconds; IT NEVER RUNS THE ROUND -- its trainings are of 2 iterations with 8 flies tried on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 2 (registered in brain/FLY_ESCAPE_REFLEX_WIP.md before brain/rl/reflexStart.mjs and tools/ship/flyEscapeReflex.mjs existed): round 1's flies started at the reflex, trained
// by a trainer that keeps the best return. The round is tools/ship/flyEscape.mjs's makeEscapeRound() with two keys, so what round 1's gate holds of the shared code is held here; this gate holds the
// start, the report and the two keys.
//   1  THE START AND THE REPORT   brain/rl/reflexStart.mjs: half the reflex plus the network, the output layer at zero; what a network must say to overrule it; brain/rl/escapeEnv.mjs's report "return"
//   2  THE ROUND'S NUMBERS        round 1's recipe and arms; every arm's untrained fly IS the reflex, to the bit
//   3  ONE TRAINING               a record's weights are the trainer's from a wrapped policy made here by hand; the trainer is told nothing lived
//   4  THE RECORDS                the new check, failing by name; T3 and T0 against the reflex; whether T1 is asked of flies that do the task
//   5  THE COMMAND                it is this round's; no training of the round's, no process (the command as a process: tools/ship/voxelHome-selfcheck.mjs section 4)
//   6  THE VERDICT                the committed results, read from the file: the four tests, T1's footing, the arms beside the reflex, how much of the trainer's gain was its own battery's, the expectations
// SAID BEFORE THE ROUND: this gate's own training was first at 40 ticks with 4 flies tried, and DID NOT MOVE -- no perturbed fly got over the half reflex to change a decision, so every return was
// the same and the trainer had nothing to climb. At the round's episode length with 8 flies tried it moves (every weight). The registered half was kept; the row in section 3 holds that a training moves.
// SABOTAGE LOG (2026-11-15) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate, round 1's, the environment's and tools/ship/voxelHome-selfcheck.mjs run whole
// for each; every one red by name (the number is the rows red over the four gates):
//   THE START: X1 the output layer not zeroed 3 | X2 the reflex at full weight 3 | X3 the action the network alone 3 | X4 the action the reflex alone 2 | X5 the reflex's answer turned 3
//   X10 round 2's flies not wrapped 3 | X12 they start at fleeing from everything 3 | X13 the output layer counted without its bias 2 | X18 every round starts at the reflex 17 | X23 the floors carry no untrained flies 1
//   THE REPORT: X6 "return" still says who lived 3 | X7 still says who was caught 2 | X8 turns dist 1 | X9 any report taken 1 | X11 round 2 trains on the environment that reports who lived 2 | X19 no report key 3
//   THE READING AND THE COMMAND: X14 the start-is-the-reflex check gone 1 | X15 T3 against fleeAll 3 | X16 T1's footing asks only the FLY arm 1 | X17 T1's footing against fleeAll 1 | X24 the footing not said 1
//   X20 writes round 1's results file 1 | X21 the command reads round 1's library 1 | X22 the command exits 0 on a word it does not know 1
//   THE VERDICT'S (section 6, 2026-11-15), this gate run whole for each, every one red by name: V1 FLY draw 6's score in the file lowered to 0.60 7 | V2 a SHUF score in the file lowered to 0.50 5
//   V3 the untrained FLY in the file made 0.60 6 | V4 the sign tests' BETTER and WORSE swapped 4 | V5 T3 against fleeAll 4 | V6 the flies audited unwrapped 4 | V7 the note's T3 says CANNOT 1
//   V8 the note's T1 says BETTER 1 | V9 T1's footing always yes 1
"use strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeReflex.mjs";
import * as V1 from "./flyEscape.mjs";
import * as PF from "./paintingFly.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as RS from "../../brain/rl/reflexStart.mjs";
import { trainDockES, FlightPolicy } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: 160, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 8 });   // full-length episodes and 8 flies tried: at 40 ticks and 4 flies no perturbed fly changed a decision and the trainer did not move at all (the half reflex is a margin to get over)
const TINY_AUDIT = [880001, 880002, 880003, 880004, 880005, 880006];
/** Observations met by the reflex fly over one episode, with what the reflex answered. */
const OBS = (() => { const env = new E.EscapeEnv(); let o = env.reset(900001), done = false; const out = []; while (!done) { out.push(o); const r = env.step(E.RULES.reflex(o)); o = r.obs; done = r.done; } return out; })();

console.log("flyEscapeReflex-selfcheck -- the escape round 2 (flies started at the reflex; the trainer keeps the best return): the start and the report, the numbers, one training, the records, the command\n");

console.log("1. THE START AND THE REPORT");
section(() => {
    const c = P.ARMS.FLY(5), mk = () => new P.CircuitPolicy({ obsDim: 13, actDim: 1, units: c.units, edges: c.edges, seed: 5 }), bare = mk(), inner = mk(), w = new RS.ReflexStart(inner, { rule: E.RULES.reflex, tail: c.units + 1 });
    const p0 = arr(bare.getParams()), p1 = arr(w.getParams()), cut = p0.length - c.units - 1, homes = OBS.filter((o) => E.RULES.reflex(o)[0] > 0).length;
    ok("!! A WRAPPED FLY STARTS AS THE REFLEX, EXACTLY: over an episode's 160 observations its network answers 0 and its action is half the reflex's answer (0.5 for home, -0.5 for food), so it goes home when the reflex does and only then -- the episode has both",
        RS.GAIN === 0.5 && OBS.length === 160 && homes > 5 && homes < 150 && OBS.every((o) => inner.act(o)[0] === 0 && w.act(o).length === 1 && w.act(o)[0] === 0.5 * E.RULES.reflex(o)[0] && (w.act(o)[0] > 0) === (E.RULES.reflex(o)[0] > 0)) && OBS.some((o) => bare.act(o)[0] !== 0), `${homes} of 160 are home`);
    ok("!! ONLY THE OUTPUT LAYER IS ZEROED: the last 34 weights and the bias are 0 and every weight before them is the unwrapped policy's of the same seed; the weight count is unchanged; an MLP's last 16 weights and bias likewise",
        p1.length === 824 && w.paramCount() === 824 && J(p1.slice(0, cut)) === J(p0.slice(0, cut)) && p1.slice(cut).every((v) => v === 0) && p0.slice(cut, cut + c.units).every((v) => v !== 0) &&
        (() => { const m = () => new FlightPolicy({ hidden: [16, 16], obsDim: 13, actDim: 1, seed: 5 }), a = arr(m().getParams()), b = arr(new RS.ReflexStart(m(), { rule: E.RULES.reflex, tail: 17 }).getParams()); return b.length === 513 && J(b.slice(0, 496)) === J(a.slice(0, 496)) && b.slice(496).every((v) => v === 0) && a.slice(496, 512).some((v) => v !== 0); })());
    const fixed = (v) => ({ act: () => [v], getParams: () => new Float32Array(3), setParams() {} }), say = (v, o) => new RS.ReflexStart(fixed(v), { rule: E.RULES.reflex, tail: 1 }).act(o)[0] > 0, home = OBS.find((o) => E.RULES.reflex(o)[0] > 0), food = OBS.find((o) => E.RULES.reflex(o)[0] < 0);
    ok("!! WHAT A NETWORK MUST SAY TO OVERRULE THE REFLEX: where the reflex says home, a network saying -0.4 leaves it home and one saying -0.6 turns it to food; where the reflex says food, 0.4 leaves it and 0.6 turns it to home -- the action is half the reflex plus the network, and at full weight no output in (-1, 1) could turn it",
        say(-0.4, home) === true && say(-0.6, home) === false && say(0.4, food) === false && say(0.6, food) === true && say(0, home) === true && say(0, food) === false && near(new RS.ReflexStart(fixed(0.25), { rule: E.RULES.reflex, tail: 1 }).act(home)[0], 0.75, 1e-12) && 1 + (-0.999) > 0);
    ok("what is refused, by name: an inner policy that is not one; no rule; an output layer of 0 weights or of more than the policy has; a network that answers more than one number",
        throws(() => new RS.ReflexStart({}, { rule: E.RULES.reflex, tail: 1 }), /the inner policy has act, getParams and setParams/) && throws(() => new RS.ReflexStart(mk(), { tail: 5 }), /the rule is a function/) && throws(() => new RS.ReflexStart(mk(), { rule: E.RULES.reflex, tail: 0 }), /the output layer is 1 to 824 weights/) &&
        throws(() => new RS.ReflexStart(mk(), { rule: E.RULES.reflex, tail: 825 }), /the output layer is 1 to 824 weights/) && throws(() => new RS.ReflexStart({ act: () => [0, 0], getParams: () => new Float32Array(3), setParams() {} }, { rule: E.RULES.reflex, tail: 1 }).act(OBS[0]), /answers 2 numbers/));
    const run = (report, act) => { const env = new E.EscapeEnv(report ? { report } : {}); let o = env.reset(900001), done = false, ret = 0, info = null; const rewards = []; while (!done) { const r = env.step(act(o)); rewards.push(r.reward); ret += r.reward; o = r.obs; done = r.done; info = r.info; } return { ret, info, rewards, caught: env.caught }; };
    const lf = run(null, E.RULES.freeze), rf = run("return", E.RULES.freeze), lh = run("lived", E.RULES.hide), rh = run("return", E.RULES.hide);
    ok("!! *** THE REPORT \"return\" TELLS THE TRAINER NOTHING LIVED AND NOTHING WAS CAUGHT, AND CHANGES NOTHING ELSE *** -- the same episode under both reports has the same rewards, tick for tick, and the same dist (1 - the return); under \"lived\" (the default) a fly that lived is docked and a caught one crashed; under \"return\" neither is either -- so the trainer's rule for which weights to keep, dockRate x 1000 - avgDist - crashes x 200, is the return alone",
        J(lf.rewards) === J(rf.rewards) && J(lh.rewards) === J(rh.rewards) && lf.caught && lf.info.crashed === true && lf.info.docked === false && rf.info.crashed === false && rf.info.docked === false && lh.info.docked === true && rh.info.docked === false && rh.info.crashed === false && near(rf.info.dist, 1 - rf.ret, 1e-12) && rf.info.dist === lf.info.dist && rh.info.dist === 0.5 &&
        new E.EscapeEnv().report === "lived" && throws(() => new E.EscapeEnv({ report: "fed" }), /report is "lived" or "return"/) && /const score = ev\.dockRate \* 1000 - ev\.avgDist - \(ev\.avgCrashes \|\| 0\) \* 200;/.test(src("brain/rl/dockPolicy.js")));
});

console.log("\n2. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_REFLEX_WIP.md");
    ok("!! THE ROUND IS ROUND 1'S WITH TWO KEYS: start \"reflex\" and report \"return\", and its own results file; the recipe, the arms, their weight counts, the draws, the audit, alpha and the registered floors are round 1's -- and round 1 has neither key",
        J(V.ROUND2) === J({ results: "brain/flyEscapeReflexRound.jsonl", start: "reflex", report: "return" }) && V.START === "reflex" && V.REPORT === "return" && J(V.RECIPE) === J(V1.RECIPE) && J(V.ARMS) === J(V1.ARMS) && J(V.WEIGHTS) === J(V1.WEIGHTS) && V.PLAIN_UNITS === 55 && J(V.MLP_HIDDEN) === J([16, 16]) && J(V.SEEDS) === J(V1.SEEDS) && J(V.AUDIT) === J(V1.AUDIT) && V.ALPHA === 0.01 && J(V.FLOORS) === J(V1.FLOORS) &&
        J(V1.ROUND1) === J({ results: "brain/flyEscapeRound.jsonl" }) && V.RESULTS !== V1.RESULTS && note.includes("`" + V.RESULTS + "`") && J(V.circuitOf("SHUF", 5)) === J(V1.circuitOf("SHUF", 5)));
    ok("T1's and T2's words are round 1's; T0's and T3's are this round's, both against the reflex, and the registration carries them; a cfg with another start or another report is refused",
        J(V.WORDS.T1) === J(V1.WORDS.T1) && J(V.WORDS.T2) === J(V1.WORDS.T2) && J(V.WORDS.T3) === J(["A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX", "A FLY STARTED AT THE REFLEX ESCAPES WORSE THAN THE REFLEX", "A FLY STARTED AT THE REFLEX CANNOT BE TOLD APART FROM THE REFLEX"]) &&
        J(V.WORDS.T0) === J(V.WORDS.T3.map((w) => w.replace("A FLY STARTED", "A FLY-WIRED FLY STARTED"))) && note.includes("`A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX`") && note.replace(/\s+/g, " ").includes("`A FLY-WIRED FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX`") &&
        throws(() => V1.makeEscapeRound({ results: "x", start: "hide" }), /a cfg is/) && throws(() => V1.makeEscapeRound({ results: "x", report: "fed" }), /a cfg is/) && throws(() => V1.makeEscapeRound({}), /a cfg is/));
    const under = { FLY: 34, SHUF: 34, PLAIN: 55, FISH: 34, MLP: 16 };
    const starts = V.ARMS.map((a) => { const p = arr(V.policyOf(a, 2).getParams()), q = arr(V1.policyOf(a, 2).getParams()), cut = p.length - under[a] - 1; return [a, p.length === V.WEIGHTS[a] && J(p.slice(0, cut)) === J(q.slice(0, cut)) && p.slice(cut).every((v) => v === 0) && q.slice(cut).some((v) => v !== 0)]; });
    ok("!! A DRAW'S UNTRAINED FLY IS ROUND 1'S FOR THAT DRAW WITH ITS OUTPUT LAYER AT ZERO: draw 2 of every arm, every weight before the output layer round 1's, the output layer (the last hidden layer's width and a bias) 0, the weight count the arm's", starts.every((x) => x[1]), starts.filter((x) => !x[1]).map((x) => x[0]).join(", "));
    const A40 = V.AUDIT.slice(0, 40), ref = V.auditScore(E.RULES.reflex, A40), un = V.ARMS.map((a) => { const p = V.policyOf(a, 3); return V.auditScore((o) => p.act(o), A40); }), r1 = (() => { const p = V1.policyOf("FLY", 3); return V1.auditScore((o) => p.act(o), A40); })(), fl = V.floors(A40);
    ok("!! *** AT THE START EVERY FLY OF EVERY ARM IS THE REFLEX, TO THE BIT *** -- on 40 episodes the untrained draw 3 of each arm has the reflex's score, lives, time fed and counts; the floors carry every arm's untrained fly and each is the reflex's score; round 1's untrained FLY is not; and round 1's floors carry no untrained flies",
        un.every((a) => J(a) === J(ref)) && V.ARMS.every((a) => fl.untrained[a] === fl.reflex.score) && fl.reflex.score === ref.score && r1.score !== ref.score && ref.score > 0.55 && !("untrained" in V1.floors(A40.slice(0, 2))), `${ref.score.toFixed(4)} against round 1's ${r1.score.toFixed(4)}`);
});

console.log("\n3. ONE TRAINING (2 iterations, 8 flies tried, 160 ticks, on draw 901)");
section(() => {
    const r = V.trainOne("FLY", 901, TINY, TINY_AUDIT), m = V.trainOne("MLP", 901, TINY, TINY_AUDIT), one = V1.trainOne("FLY", 901, TINY, TINY_AUDIT), c = P.ARMS.FLY(901);
    const common = { obsDim: 13, actDim: 1, maxSteps: 160, iters: 2, pop: 8, sigma: 0.14, lr: 0.05, trainEps: 8, seed: 901 }, envOf = (report) => (o = {}) => new E.EscapeEnv({ maxSteps: 160, report, ...o });
    const wrapped = ({ obsDim, actDim, seed }) => new RS.ReflexStart(new P.CircuitPolicy({ obsDim, actDim, units: c.units, edges: c.edges, seed }), { rule: E.RULES.reflex, tail: c.units + 1 });
    const direct = trainDockES({ ...common, envFactory: envOf("return"), policyFactory: wrapped }), directM = trainDockES({ ...common, envFactory: envOf("return"), policyFactory: ({ obsDim, actDim, seed }) => new RS.ReflexStart(new FlightPolicy({ hidden: [16, 16], obsDim, actDim, seed }), { rule: E.RULES.reflex, tail: 17 }) });
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A WRAPPED POLICY MADE HERE BY HAND ON THE ENVIRONMENT THAT REPORTS THE RETURN: the FLY arm's (the circuit, wrapped, its output layer of 34 + 1 at zero) and the MLP's (16-16, wrapped, 16 + 1), each to the hash, with the arm's weight count and the trainer's history",
        PF.hashWeights(direct.params) === r.weightsHash && r.weightCount === 824 && PF.hashWeights(directM.params) === m.weightsHash && m.weightCount === 513 && J(r.history) === J(direct.history.map((h) => ({ it: h.it, ret: h.avgReturn, lived: h.dockRate }))) && r.weightsHash !== one.weightsHash);
    ok("!! THE TRAINER IS TOLD NOTHING LIVED: every reading of this round's history has `lived` 0 (the report), where round 1's training of the same draw has flies that lived; and what it kept is its best battery RETURN -- the kept weights' own reading is the largest return of its history", r.history.every((h) => h.lived === 0) && one.history.some((h) => h.lived > 0) && near(direct.best.avgReturn, Math.max(...direct.history.map((h) => h.avgReturn)), 1e-12) && direct.best.dockRate === 0);
    const again = [["FLY", r], ["MLP", m]].map(([arm, rec]) => { const p = V.policyOf(arm, 901); p.setParams(PF.unpackWeights(rec.weights)); const a = V.auditScore((o) => p.act(o), TINY_AUDIT, 160); return a.score === rec.score && a.alive === rec.alive && a.fledPass === rec.fledPass; });
    const w = arr(PF.unpackWeights(r.weights)), u = arr(V.policyOf("FLY", 901).getParams());
    ok("!! the weights give the score again through the wrapped fly, to the bit; AND THE TRAINING MOVED: every weight differs from the draw's start and the output layer has left zero (some perturbed fly got over the half and changed a decision, or there would be nothing to climb)", again.every(Boolean) && w.every((v, i) => v !== u[i]) && w.slice(w.length - 35).every((v) => v !== 0));
});

console.log("\n4. THE RECORDS");
section(() => {
    const hist = (s) => [0, 25, 50, 75, 100, 125, 149].map((it, k) => ({ it, ret: 0.6 + k / 100 + s / 10000, lived: 0 }));
    const rec = (arm, s, score) => { const p = V.policyOf(arm, s), w = p.getParams(), c = arm === "MLP" ? null : V.circuitOf(arm, s); return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c ? c.units : null, edges: c ? c.edges.length : null, edgesHash: c ? PF.hashEdges(c.edges) : null, weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w), score, alive: 170, fed: 0.5, strikes: 400, caught: 30, passes: 300, fledPass: 60, history: hist(s) }; };
    const flo = () => ({ kind: "floors", ...Object.fromEntries(Object.entries(V.FLOORS).map(([k, v]) => [k, { score: v, alive: 150, fed: 0.3, strikes: 400, caught: 40, passes: 300, fledPass: 80 }])), untrained: Object.fromEntries(V.ARMS.map((a) => [a, V.FLOORS.reflex])) });
    const file = (scoreOf) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(rec(arm, s, scoreOf(arm, s))); out.push({ kind: "recheck", arm: "FLY", s: 1, weightsHash: out.find((r) => r.arm === "FLY" && r.s === 1).weightsHash }, flo()); return out; };
    const jit = (arm, s) => ((s * 7 + V.ARMS.indexOf(arm) * 3) % 16) / 10000, good = file((arm, s) => 0.70 + jit(arm, s)), clone = () => JSON.parse(J(good)), fl = (L) => L.find((r) => r.kind === "floors");
    ok("!! a file of 80 draws, the recheck and floors whose untrained flies score the reflex's number passes every check", V.checkRecords(good).length === 0, V.checkRecords(good).slice(0, 2).join(" | "));
    const broken = [
        ["an untrained arm that is not the reflex", (L) => { fl(L).untrained.FISH = 0.5; }, /the untrained FISH fly does not score the reflex's number: the start is not the reflex/],
        ["floors with no untrained flies", (L) => { delete fl(L).untrained; }, /the untrained FLY fly does not score the reflex's number/],
        ["round 1's floors (no reflex among them)", (L) => { delete fl(L).reflex; }, /the floors are not there once with the registration's five numbers/],
        ["another recipe", (L) => { L.find((r) => r.arm === "PLAIN" && r.s === 2).recipe.pop = 24; }, /PLAIN draw 2 was trained with another recipe/],
    ];
    const res = broken.map(([name, f, re]) => { const L = clone(); f(L); const bad = V.checkRecords(L); return [name, bad.some((b) => re.test(b)), bad[0]]; });
    ok(`!! EACH NEW CHECK FAILS BY NAME (${broken.length}: ${broken.map((b) => b[0]).join("; ")}), and with a failed check no test is made and nothing is said of T1's footing`, res.every((r) => r[1]) && (() => { const L = clone(); fl(L).untrained.FLY = 0.5; const R = V.reading(L); return R.T0 === null && R.T3 === null && R.T1 === null && R.asked === null && /A CHECK FAILED/.test(V.readingLines(R)[0]) && !/T1 IS/.test(V.readingLines(R).join("\n")); })(), res.filter((r) => !r[1]).map((r) => `${r[0]}: ${r[2]}`).join(" | "));
    const hi = V.reading(good), lo = V.reading(file((arm, s) => 0.60 + jit(arm, s))), at = V.reading(file(() => V.FLOORS.reflex));
    ok("!! T3 AND T0 ARE BOTH AGAINST THE REFLEX'S SCORE IN THE FILE (0.6465), NOT AGAINST fleeAll: all 80 at 0.70 -> both BETTER (80 above, 16 above); all at 0.60 -- above fleeAll's 0.5395 and below the reflex -> both WORSE; all EQUAL to the reflex -> both CANNOT BE TOLD APART, with 80 and 16 ties",
        hi.T3.word === V.WORDS.T3[0] && hi.T3.above === 80 && near(hi.T3.ref, 0.6465) && hi.T0.word === V.WORDS.T0[0] && hi.T0.above === 16 && near(hi.T0.ref, 0.6465) && lo.T3.word === V.WORDS.T3[1] && lo.T3.below === 80 && lo.T0.word === V.WORDS.T0[1] && at.T3.word === V.WORDS.T3[2] && at.T3.ties === 80 && at.T0.ties === 16);
    const flyOnly = V.reading(file((arm, s) => (arm === "FLY" ? 0.70 : 0.60) + jit(arm, s))), shufLow = V.reading(file((arm, s) => (arm === "SHUF" ? 0.64 : 0.70) + jit(arm, s)));
    ok("!! WHETHER T1 IS ASKED OF FLIES THAT DO THE TASK, AS REGISTERED: it is when the FLY arm's mean and the SHUF arm's are both at or above the reflex's -- all at 0.70: yes; the FLY flies at 0.70 and the rest at 0.60: no (SHUF is below), though T0 says BETTER and T3 WORSE; SHUF alone at 0.64: no; all at 0.60: no -- and the lines say which",
        hi.asked === true && flyOnly.asked === false && flyOnly.T0.word === V.WORDS.T0[0] && flyOnly.T3.word === V.WORDS.T3[1] && shufLow.asked === false && lo.asked === false && /T1 IS ASKED OF FLIES THAT DO THE TASK/.test(V.readingLines(hi).join("\n")) && /T1 IS NOT ASKED OF FLIES THAT DO THE TASK/.test(V.readingLines(flyOnly).join("\n")) && V1.reading(clone().map((r) => r)).asked === undefined);
    const lines = V.readingLines(hi).join("\n"), wire = V.reading(file((arm, s) => (arm === "FLY" ? 0.75 : arm === "SHUF" ? 0.70 : 0.80) + jit(arm, s)));
    ok("T1 and T2 are round 1's rank-sums with round 1's words (FLY above SHUF and below PLAIN -> BETTER, WORSE); the lines name T3 as against the reflex, and carry the floors and each arm's history", wire.T1.word === V.WORDS.T1[0] && wire.T2.word === V.WORDS.T2[1] && /T3 \(all the flies against the reflex\): of 80, 80 above its 0\.6465/.test(lines) && !/against fleeAll/.test(lines) && /T0 \(FLY against the reflex\): of 16, 16 above its 0\.6465/.test(lines) && /reflex +0\.6465/.test(lines) && /FLY +the trainer's own battery, mean return at iteration 0: /.test(lines));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "WORM", "1"], ["job", "FLY", "x"], ["job", "FLY", "17"], ["run", "--jobs", "0"], ["run", "4"], ["read", "extra"]];
    ok("the command's words are the shared parseArgs' (run, read, job ARM S for a registered arm and draw; eight other shapes are not words)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FLY", "16"])) === J({ cmd: "job", arm: "FLY", s: 16 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeReflex.mjs");
    ok("!! the command is this round's -- its library and results file, not round 1's -- reads its words through parseArgs alone, refuses a run of no processes itself, trains FLY draw 1 a second time and writes the floors",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeReflex\.mjs"/.test(csrc) && !/"\.\/flyEscape\.mjs"|flyEscapeRound|voxelHome/.test(csrc) && /jobOnce\("FLY", 1\)/.test(csrc) && /JSON\.stringify\(PF\.floors\(\)\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeReflex\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyEscapeReflex-selfcheck.mjs"), calls = [...me.matchAll(/V1?\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its three trainings are of 2 iterations with 8 flies tried on draw 901; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 3 && calls.every((c) => /^"(FLY|MLP)", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 8 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n6. THE VERDICT (round 2; the results were committed at 8193559f before they were read, and are read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = V.reading(lines), A = R.arms, draws = lines.filter((r) => r.kind === "draw"), ref = R.floors.reflex.score;
    ok("!! the results file is the one the run wrote: 82 records, sha256 bb51901e00fb9278...", lines.length === 82 && createHash("sha256").update(bytes).digest("hex") === "bb51901e00fb927844b13700dd383f3b9d79d76bf592807c4b428f1cc1965139");
    ok("!! THE CHECKS HOLD, AND THE START WAS THE REFLEX: 80 draws each once, round 1's recipe, each arm's weight count and wiring, FLY draw 1 the same twice, a history in every record, the registered floors -- and the untrained fly of every arm scores the reflex's 0.6465, to the bit", R.checks.length === 0 && V.ARMS.every((a) => R.floors.untrained[a] === ref) && near(ref, 0.6465), R.checks.slice(0, 2).join(" | "));
    ok("!! *** T3: A FLY STARTED AT THE REFLEX ESCAPES BETTER THAN THE REFLEX *** -- 59 of the 80 trained flies score above the reflex on the same 200 episodes and 21 below (exact two-sided p 2.5e-5)", R.T3 && R.T3.word === V.WORDS.T3[0] && R.T3.above === 59 && R.T3.below === 21 && R.T3.ties === 0 && near(R.T3.p, 2.529e-5, 5e-8));
    ok("!! *** T0: A FLY-WIRED FLY STARTED AT THE REFLEX CANNOT BE TOLD APART FROM THE REFLEX *** -- 10 of the 16 above and 6 below (p 0.45; 14 speaks)", R.T0 && R.T0.word === V.WORDS.T0[2] && R.T0.above === 10 && R.T0.below === 6 && near(R.T0.p, 0.45450));
    ok("!! *** T1 IS, FOR THE FIRST TIME, ASKED OF FLIES THAT DO THE TASK -- AND THE FLY'S WIRING CANNOT BE TOLD APART FROM A SHUFFLE OF IT *** -- the FLY arm's mean (0.6636) and the SHUF arm's (0.6617) are both above the reflex's, as registered; the fly's ranks sum to 272 (the middle is 264), exact two-sided p 0.78. T2: nor from a plain net of its size (279; p 0.59)",
        R.asked === true && A.FLY.mean >= ref && A.SHUF.mean >= ref && R.T1 && R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 272 && near(R.T1.p, 0.78044) && R.T2 && R.T2.word === V.WORDS.T2[2] && R.T2.sumA === 279 && near(R.T2.p, 0.58958));
    const all = draws.reduce((n, r) => n + r.score, 0) / 80, above = (a) => draws.filter((r) => r.arm === a && r.score > ref).length;
    ok("!! the arms' mean scores, 16 draws each (mean, sd): FISH 0.6583 0.0310, PLAIN 0.6595 0.0243, SHUF 0.6617 0.0291, MLP 0.6623 0.0412, FLY 0.6636 0.0420 -- the five within six thousandths; the 80 average 0.6611 against the reflex's 0.6465, A GAIN OF A HUNDREDTH AND A HALF; the flies above the reflex by arm: FLY 10, SHUF 14, PLAIN 11, FISH 11, MLP 13; the least fly 0.536 and the best 0.727 (FLY draw 6), the fly told the kind 0.835",
        near(A.FISH.mean, 0.6583) && near(A.FISH.sd, 0.0310) && near(A.PLAIN.mean, 0.6595) && near(A.PLAIN.sd, 0.0243) && near(A.SHUF.mean, 0.6617) && near(A.SHUF.sd, 0.0291) && near(A.MLP.mean, 0.6623) && near(A.MLP.sd, 0.0412) && near(A.FLY.mean, 0.6636) && near(A.FLY.sd, 0.0420) && near(all, 0.6611) &&
        J(V.ARMS.map(above)) === J([10, 14, 11, 11, 13]) && near(Math.min(...draws.map((r) => r.score)), 0.5358) && near(Math.max(...draws.map((r) => r.score)), 0.7273) && draws.find((r) => near(r.score, 0.7273)).arm === "FLY" && draws.find((r) => near(r.score, 0.7273)).s === 6);
    ok("!! WHAT THE TRAINED FLIES DO IS VERY NEARLY WHAT THE REFLEX DOES: by arm they live in 157 to 160 of 200 episodes (the reflex 156), feed 0.52 to 0.53 of the time (0.51), leave their food for 0.26 to 0.28 of passes (0.25) and are caught by 0.10 to 0.11 of strikes (0.11)",
        V.ARMS.every((a) => A[a].alive > 157 && A[a].alive < 160.2 && A[a].fed > 0.52 && A[a].fed < 0.535 && A[a].fledPass > 0.255 && A[a].fledPass < 0.28 && A[a].caught > 0.097 && A[a].caught < 0.111) && R.floors.reflex.alive === 156);
    const H = (a) => A[a].history.map((h) => h.ret), bestOf = (a) => draws.filter((r) => r.arm === a).reduce((n, r) => n + Math.max(...r.history.map((h) => h.ret)), 0) / 16;
    ok("!! *** MOST OF WHAT THE TRAINER GAINED WAS ITS OWN 24 EPISODES' *** -- on the trainer's battery every arm starts at the reflex's 0.6991 there and the best reading of a training averages 0.78 to 0.80 by arm, a gain of 0.08 to 0.10; on the 200 audit episodes, which it never saw, the same weights gain 0.012 to 0.017. The battery is the same 24 episodes every iteration, and the weights kept are the best on it",
        V.ARMS.every((a) => near(H(a)[0], 0.6991) && bestOf(a) > 0.78 && bestOf(a) < 0.80 && A[a].mean - ref > 0.011 && A[a].mean - ref < 0.018 && Math.max(...H(a)) > 0.75) && V.ARMS.every((a) => H(a).length === 7));
    const again = V.ARMS.flatMap((arm) => [6, 12].map((s) => { const r = draws.find((d) => d.arm === arm && d.s === s), p = V.policyOf(arm, s); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore((o) => p.act(o)); return [arm, s, a.score === r.score && a.alive === r.alive && a.fledPass === r.fledPass && a.caught === r.caught]; }));
    ok("!! THE WEIGHTS IN A RECORD GIVE ITS SCORE AND ITS COUNTS AGAIN: draws 6 and 12 of every arm (the best fly among them), audited here on the 200 episodes through the wrapped fly, to the bit", again.every((x) => x[2]), again.filter((x) => !x[2]).map((x) => x[0] + " " + x[1]).join(", "));
    const note = src("brain/FLY_ESCAPE_REFLEX_WIP.md"), res = note.slice(note.indexOf("## 8. The result"));
    ok("the expectations, written before the code, against what came: T3 BETTER was the 60 percent guess and T0 CANNOT the 45 -- both came; T1 asked of flies that do the task the 65, and it is; T1 CANNOT BE TOLD APART the 75 and T2 the 70 -- both came; the best arm above 0.75 was given 30 percent and is 0.66",
        /T3: BETTER about 60 percent/.test(note) && /T0: BETTER about 40, CANNOT about 45/.test(note) && /both means at or above the reflex\): about 65 percent/.test(note) && /\*\*T1: CANNOT BE TOLD APART about 75 percent/.test(note) && /T2: CANNOT about 70/.test(note) && /above 0\.75: about 30 percent/.test(note) && Math.max(...V.ARMS.map((a) => A[a].mean)) < 0.67);
    ok("the registration's RESULT SECTION (section 8, and not the list of possible words in section 2) carries the four readings' words", /## 8\. The result/.test(note) && [["T0", R.T0.word], ["T1", R.T1.word], ["T2", R.T2.word], ["T3", R.T3.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)));
});

console.log(`\nflyEscapeReflex-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
