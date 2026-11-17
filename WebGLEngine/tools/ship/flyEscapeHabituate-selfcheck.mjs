// WebGLEngine/tools/ship/flyEscapeHabituate-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeHabituate-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 9 (registered in brain/FLY_ESCAPE_HABITUATE_WIP.md before brain/rl/lifeEnv.mjs, brain/rl/habituatingCircuit.mjs and tools/ship/flyEscapeHabituate.mjs existed):
// does a fly whose connections onto the Giant Fibers habituate beat one whose cannot, in lives that are decoy or ordinary?
//   1  THE LIFE                 brain/rl/lifeEnv.mjs: an ordinary episode is the escape task's to the bit; a decoy is a strike that cannot catch; a life's clock, kind, seeds and return; the floors
//   2  THE HABITUATING CIRCUIT  brain/rl/habituatingCircuit.mjs: at rates 0 it is its network to the bit; the rule, by hand; what habituates; a life starts afresh
//   3  THE ROUND'S NUMBERS      the recipe, draws, arms and weights; FROZEN is round 5's fly; the registration's hand floor
//   4  ONE TRAINING             a record's weights are the trainer's from a policy made here by hand
//   5  THE RECORDS              36 draws; P, T1, H; the flies that learn and never flee
//   6  THE COMMAND              it is this round's; no training of the round's, no process
//   7  THE VERDICT              the round's results, read from the committed file
// SABOTAGE LOG (2026-11-17) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a
// process) run whole for each; every one red by name (the number is the rows red over the two):
//   THE LIFE (brain/rl/lifeEnv.mjs): L1 a decoy catches 2 | L2 the decoy's kind draw is skipped 1 | L3 an ordinary episode is a decoy one 3 | L4 every life is ordinary 2 | L5 three episodes a life 4
//   L6 the clock is the episode's 1 | L7 being caught ends the life 1 | L8 a life's return is the sum of its episodes' 1 | L9 the hand floor's theta is 0.3 1 | L10 the hand floor never starts afresh 1
//   L11 the told fly flees in decoy lives 2 | L12 the episodes' seeds are the life's 1
//   THE CIRCUIT (brain/rl/habituatingCircuit.mjs): H1 the rule does not depress 1 | H2 the rule does not recover 1 | H3 g is not reset at a life's start 1 | H4 every connection habituates 1
//   H5 the rates come last 3 | H6 the weights are not restored 1 | H7 negative rates are habituation 1 | H8 the depression uses the target's activity 1
//   THE ROUND (tools/ship/flyEscapeHabituate.mjs): F1 HAB does not habituate 5 | F2 HSHUF is the real wiring 3 | F4 H against the reflex 1 | F5 the life's maxSteps is an episode's 1
//   F6 the learn count asks nothing of ordinary lives 1 | F7 never fleeing at 0.5 1 | F8 the rank tests' BETTER and WORSE swapped 1 | F9 tests made with a failed check 1 | F10 the round writes
//   round 8's file 1 | F12 the draws are 13 to 24 3
//   TWO WENT 0 RED AT FIRST AND WERE FINDINGS: F3 P is against HSHUF (the fixture had both other arms below HAB, so which one P was against made no difference) and F11 the floors' untrained
//   fly is not checked against the reflex (no fixture had an untrained fly that was not the reflex). A row was added for each and they were run again: 1 and 1.
//   THE COMMAND: C1 the second training is of draw 2 1 | C2 exits 0 on a word it does not know 1 | C3 reads round 8's library 1
//   THE VERDICT (section 7; the results file and the note sabotaged, this gate run whole for each): V1 HAB draw 3's score set to never fleeing's 4 | V2 HSHUF draw 2's depression rate
//   set to 0.1 3 | V3 the second training's record names other weights 4 | V4 the note's P says BETTER 1 | V5 the note names another commit 1 | V6 the rates-at-0 measure called registered 1
//   V7 the note says the learn expectation came 1 | V8 the learn expectation lowered after the fact 1 | V9 the note drops that the learn count does not measure learning 1 | V10 the note says
//   eight HAB flies never flee 1. A row of mine in section 7 asked a field that is not there (the floors' own floors) and so asked nothing; it was taken out before the sabotages.
//   Three rows of mine were wrong when written and were corrected: the hand floor stops fleeing at the seventh mover, not before (0.9 to the 6th is 0.53, above the line); a fixture's learning flies
//   scored 0.74, not under the 0.74 I gave its hand floor; and the registration's cost of a training was 8 to 9 minutes where two iterations measure 12.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeHabituate.mjs";
import * as V6 from "./flyEscapeDegree.mjs";
import * as V5 from "./flyEscapeVision.mjs";
import * as V3 from "./flyEscapeFresh.mjs";
import * as PF from "./paintingFly.mjs";
import * as L from "../../brain/rl/lifeEnv.mjs";
import * as HC from "../../brain/rl/habituatingCircuit.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as RS from "../../brain/rl/reflexStart.mjs";
import * as M from "../../brain/rl/maskedCircuitPolicy.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: L.LIFE_STEPS, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, fresh: true, battery: 4 }), TINY_AUDIT = [880001, 880002, 880003, 880004];
const life = (make, seed, env = new L.LifeEnv()) => { const act = make(); let o = env.reset(seed), done = false, info = null; const obs = [], acts = []; while (!done) { obs.push(o[L.CLOCK]); const a = act(o, env); acts.push(a[0]); const r = env.step(a); o = r.obs; done = r.done; info = r.info; } return { env, info, ret: env.ret, clocks: obs, acts }; };

console.log("flyEscapeHabituate-selfcheck -- the escape round 9 (does a fly that habituates beat one that cannot?): the life, the circuit, the numbers, one training, the records, the command\n");

console.log("1. THE LIFE (brain/rl/lifeEnv.mjs)");
section(() => {
    const a = new E.EscapeEnv({ report: "return" }), b = new L.DecoyEnv({ report: "return" }); let same = true;
    for (const s of [11, 12, 13, 14, 15, 16]) { let oa = a.reset(s), ob = b.reset(s), d = false; while (!d) { const x = a.step(E.RULES.reflex(oa)), y = b.step(E.RULES.reflex(ob)); same = same && x.reward === y.reward && x.done === y.done && J(arr(x.obs)) === J(arr(y.obs)); d = x.done; oa = x.obs; ob = y.obs; } same = same && J(a.log) === J(b.log) && a.caught === b.caught; }
    ok("!! *** AN ORDINARY EPISODE IS THE ESCAPE TASK'S OWN, TO THE BIT *** -- six episodes with the reflex: the same rewards, observations, end, movers and catches as brain/rl/escapeEnv.mjs's EscapeEnv", same);
    const d = new L.DecoyEnv({ report: "return", decoy: true }), o = new L.DecoyEnv({ report: "return" }), fz = () => [-1]; let kinds = [], reached = 0, caught = 0, firstDraws = true;
    for (const s of [21, 22, 23, 24, 25, 26, 27, 28]) { d.reset(s); o.reset(s); let done = false; while (!done) { const r = d.step(fz()); done = r.done; } kinds.push(...d.log.map((m) => m.kind)); reached += d.log.filter((m) => m.decoy).length; caught += d.caught ? 1 : 0; }
    const fo = new L.DecoyEnv({ report: "return" }), fd = new L.DecoyEnv({ report: "return", decoy: true }); fo.reset(31); fd.reset(31); for (let t = 0; t < 40 && !fo.mover; t++) { fo.step([-1]); fd.step([-1]); } firstDraws = !!fo.mover && !!fd.mover && fo.mover.speed === fd.mover.speed && fo.mover.life >= 1 && fd.mover.kind === "strike";
    ok("!! *** A DECOY IS A STRIKE THAT CANNOT CATCH ***: in decoy episodes every mover is a strike, a fly that never flees is reached by decoys and NEVER caught, and lives every episode out; the kind's draw is still made, so the first mover comes at the same tick at the same speed as in the ordinary episode of that seed",
        kinds.length > 10 && kinds.every((k) => k === "strike") && reached > 5 && caught === 0 && firstDraws, `${kinds.length} movers, ${reached} reached the fly`);
    const env = new L.LifeEnv(), A = V.AUDIT, kinds2 = A.map(L.kindOf), r = life(() => (ob) => E.RULES.reflex(ob), 900001, env), z = life(() => E.RULES.freeze, 900001);
    ok("!! A LIFE: four episodes of 160 ticks (640), its kind from its seed -- the round's 200 audit lives are 100 decoy and 100 ordinary; its episodes the seeds life x 16 + 0..3; the clock reads 0 at the life's first tick and only there; being caught ends an episode and not the life; a life's return is the mean of its episodes'",
        L.EPISODES === 4 && L.LIFE_STEPS === 640 && kinds2.filter((k) => k === "decoy").length === 100 && L.episodeSeed(900001, 3) === 14400019 && r.clocks[0] === 0 && r.clocks.slice(1).every((c) => c > 0 && c < 1) && z.info.rets.length === 4 && z.env.kind === "ordinary" && z.info.caught >= 1 && near(z.ret, z.info.rets.reduce((s, v) => s + v, 0) / 4, 1e-12) && near(r.ret, r.info.rets.reduce((s, v) => s + v, 0) / 4, 1e-12) && throws(() => env.reset(0), /a whole number from 1/),
        `rets ${r.info.rets.map((v) => v.toFixed(3)).join(" ")}`);
    const ep0 = new E.EscapeEnv({ report: "return" }); let o0 = ep0.reset(L.episodeSeed(900001, 0)), d0 = false, ret0 = 0; while (!d0) { const s = ep0.step(E.RULES.reflex(o0)); ret0 += s.reward; d0 = s.done; o0 = s.obs; }
    ok("an ordinary life's first episode is the escape task's on its seed, its return to the bit", ret0 === r.info.rets[0], `${ret0}`);
    const h = L.handFly(), seq = []; const obsOf = (mover, loom, clock) => { const x = new Float32Array(13); x[0] = mover; x[2] = loom; x[3] = 0; x[9] = 1; x[L.CLOCK] = clock; return x; };
    seq.push(h(obsOf(1, 0.3, 0))[0]); for (let i = 0; i < 9; i++) { h(obsOf(0, 0, 0.1)); seq.push(h(obsOf(1, 0.3, 0.1))[0]); for (let t = 0; t < 3; t++) h(obsOf(1, 0.3, 0.1)); }
    const fresh = h(obsOf(1, 0.3, 0))[0];
    ok("!! THE HAND FLOOR IS THE REGISTRATION'S (alpha 0.1, beta 0.002, theta 0.5), AND IT HABITUATES: shown a collision-course mover again and again, it flees for the first six and stops at the seventh (g falls by a tenth a mover: 0.9 to the 7th is under the 0.5 line); a new life (the clock at 0) flees again; told the kind, a fly never flees in a decoy life and is the reflex in an ordinary one",
        J(L.HAND) === J({ alpha: 0.1, beta: 0.002, theta: 0.5 }) && seq[0] === 1 && seq.indexOf(-1) === 6 && seq.slice(6).every((v) => v === -1) && fresh === 1 && L.told(obsOf(1, 0.3, 0.1), { kind: "decoy" })[0] === -1 && L.told(obsOf(1, 0.3, 0.1), { kind: "ordinary" })[0] === 1, J(seq));
    const note = src("brain/FLY_ESCAPE_HABITUATE_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same of the life and the floor: four episodes, 640 ticks, seeds life x 16 + 0..3, a decoy cannot catch, the clock of the life, and the habituating reflex (alpha 0.1, beta 0.002, theta 0.5) fixed before any training",
        /A life\*\* is four episodes of the escape task/.test(note) && /640 ticks/.test(note) && /`life x 16 \+ 0\.\.3`/.test(note) && /cannot catch it/.test(note) && /habituating reflex \(alpha 0\.1, beta 0\.002, theta 0\.5\)/.test(note) && /fixed now as this round's hand floor/.test(note));
});

console.log("\n2. THE HABITUATING CIRCUIT (brain/rl/habituatingCircuit.mjs)");
section(() => {
    const inner = () => new M.MaskedCircuitPolicy({ obsDim: 13, units: 42, inputs: V5.VISUAL_INPUTS.map((e) => [...e]), edges: T.EDGES.map((e) => [e[0], e[1]]), outputs: [...T.GF], edgeStart: [...V5.EDGE_START], seed: 5 });
    const plain = inner(), hab = new HC.HabituatingCircuit(inner()), w = plain.getParams(); for (let i = 0; i < w.length; i++) w[i] += 0.3 * Math.sin(i * 1.7); plain.setParams(w); const hw = new Float32Array(w.length + 2); hw.set(w, 2); hab.setParams(hw);
    const r1 = life(() => (o) => plain.act(o), 900001), r2 = life(() => (o) => hab.act(o), 900001);
    ok("!! *** AT RATES 0 THE HABITUATING CIRCUIT IS ITS NETWORK, TO THE BIT ***: the same weights, one life, every answer the same; its weights are the network's with the two rates FIRST; the rates start at 0",
        J(r1.acts) === J(r2.acts) && hab.paramCount() === plain.paramCount() + 2 && J(arr(hab.getParams()).slice(2)) === J(arr(plain.getParams())) && new HC.HabituatingCircuit(inner()).pa === 0 && new HC.HabituatingCircuit(inner()).pb === 0 && J(new HC.HabituatingCircuit(inner()).rates()) === J({ a: 0, b: 0 }));
    ok("!! WHAT HABITUATES IS THE CONNECTIONS ONTO THE CELLS READ: for the real circuit the 42 onto the two Giant Fibers (40 from the visual cells, the two between the fibres); for a shuffle, the ones it puts there",
        hab.plastic.length === 42 && arr(hab.plastic).every((k) => T.GF.includes(T.EDGES[k][0])) && T.EDGES.filter((e) => T.GF.includes(e[0])).length === 42 && V.policyOf("HSHUF", 3).inner.plastic.length === P.shuffledEdges(42, 369, 7003).filter((e) => T.GF.includes(e[0])).length);
    // the rule, by hand: three cells, one input into cell 0, one connection 0 -> 2, read from cell 2
    const small = () => { const p = new M.MaskedCircuitPolicy({ obsDim: 13, units: 3, inputs: [[0, 1]], edges: [[2, 0]], outputs: [2], seed: 1 }); p.setParams(Float32Array.from([1, 0, 0, 0, 0.8, 1, 0])); return p; };
    const hp = new HC.HabituatingCircuit(small()), ref = small(), obs = (x, c) => { const o = new Float32Array(13); o[1] = x; o[L.CLOCK] = c; return o; }; hp.setParams(Float32Array.from([1, 2, 1, 0, 0, 0, 0.8, 1, 0]));
    const { a, b } = hp.rates(); let g = 1, okRule = true; const seen = [];
    for (const [x, c] of [[0.5, 0], [0.5, 0.1], [0.9, 0.2], [0, 0.3], [0.4, 0.4], [0.5, 0]]) { if (c === 0) g = 1; const wp = ref.getParams(); wp[4] = Math.fround(0.8 * g); ref.setParams(wp); const want = ref.act(obs(x, c))[0], got = hp.act(obs(x, c))[0]; okRule = okRule && want === got; const h0 = ref._h[0]; g = Math.min(1, Math.max(0, g - a * g * h0 + b * (1 - g))); seen.push(g); okRule = okRule && Math.abs(hp.g[0] - g) < 1e-12; }
    ok("!! *** THE RULE, BY HAND *** on a three-cell circuit (input into cell 0, one connection 0 -> 2 of weight 0.8, read from cell 2), rates a = 0.5 and b = 0.02: tick by tick the circuit answers as the plain network does with that connection's weight times g, and g goes as g - a g h + b (1 - g) held to 0..1, h the source cell's activity -- and the clock at 0 sets g back to 1",
        okRule && a === 0.5 && b === 0.02 && HC.A_SCALE === 0.5 && HC.B_SCALE === 0.01 && seen[0] < 1 && seen[2] < seen[1] && seen[5] < 1 && seen[5] === seen[0], seen.map((v) => v.toFixed(4)).join(" "));
    const wrapped = V.policyOf("HAB", 4), p = wrapped.getParams();
    ok("!! THE REFLEX WRAPPER ZEROES THE NETWORK'S OUTPUT LAYER AND NOT THE RATES: an untrained HAB fly's rates are 0 and its last 3 weights 0; it acts as the reflex; and negative rate weights are no habituation (a and b are never below 0)",
        p[0] === 0 && p[1] === 0 && arr(p.slice(-3)).every((v) => v === 0) && wrapped instanceof RS.ReflexStart && wrapped.inner instanceof HC.HabituatingCircuit && (() => { const q = V.policyOf("HAB", 4); const x = q.getParams(); x[0] = -3; x[1] = -3; q.setParams(x); return J(q.inner.rates()) === J({ a: 0, b: 0 }); })());
    ok("what is not a masked circuit, or a clock that is not an observation, is refused by name", throws(() => new HC.HabituatingCircuit({ act() {} }), /the network is a MaskedCircuitPolicy/) && throws(() => new HC.HabituatingCircuit(small(), { clock: 13 }), /the clock is an observation's index/) && throws(() => new HC.HabituatingCircuit(small()).setParams(new Float32Array(3)), /9 weights \(got 3\)/));
});

console.log("\n3. THE ROUND'S NUMBERS");
section(() => {
    const note = src("brain/FLY_ESCAPE_HABITUATE_WIP.md"), flat = note.replace(/\s+/g, " ");
    ok("!! THE RECIPE IS ROUND 3'S, A TRAINER'S EPISODE BEING A LIFE (640 ticks); the draws are 1 to 12; three arms, the lead HAB; 454, 456 and 456 weights; the audit is 200 lives on the escape rounds' audit seeds; alpha 0.01; its own results file",
        J({ ...V.RECIPE, maxSteps: V3.RECIPE.maxSteps }) === J(V3.RECIPE) && V.RECIPE.maxSteps === 640 && J(V.SEEDS) === J(Array.from({ length: 12 }, (_, k) => k + 1)) && J(V.ARMS) === J(["FROZEN", "HAB", "HSHUF"]) && V.LEAD === "HAB" && J(V.WEIGHTS) === J({ FROZEN: 454, HAB: 456, HSHUF: 456 }) &&
        J(V.AUDIT) === J(V5.AUDIT) && V.ALPHA === 0.01 && V.RESULTS === "brain/flyEscapeHabituateRound.jsonl" && note.includes("`" + V.RESULTS + "`") && /12 draws each, draws 1 to 12/.test(flat) && /\*\*The recipe is round 3's\*\*/.test(flat) && /\*\*Audit: 200 lives\*\*/.test(flat));
    ok("!! FROZEN IS ROUND 5'S REAL GIANT FIBER CIRCUIT FLY, WEIGHT FOR WEIGHT (as round 6 built it, draws 3 and 9); HAB is the same network with two rates in front; HSHUF's wiring is round 5's free shuffle of the draw",
        [3, 9].every((s) => J(arr(V.policyOf("FROZEN", s).getParams())) === J(arr(V6.policyOf("GF", s).getParams())) && J(arr(V.policyOf("HAB", s).getParams()).slice(2)) === J(arr(V6.policyOf("GF", s).getParams()))) && J(V.circuitOf("HSHUF", 7).edges) === J(P.shuffledEdges(42, 369, 7007)) && J(V.circuitOf("HAB", 7).edges) === J(T.EDGES.map((e) => [e[0], e[1]])) && throws(() => V.circuitOf("GF", 1), /no arm GF/));
    ok("!! THE WORDS: P is HAB against FROZEN, T1 HAB against HSHUF, H HAB against the hand habituating reflex; each BETTER, WORSE and CANNOT BE TOLD APART in that order, and the registration names the three tests", ["P", "T1", "H"].every((k) => V.WORDS[k].length === 3 && /BETTER/.test(V.WORDS[k][0]) && /WORSE/.test(V.WORDS[k][1]) && /CANNOT BE TOLD APART/.test(V.WORDS[k][2])) && /ONE WHOSE CANNOT$/.test(V.WORDS.P[0]) && /A SHUFFLE OF IT$/.test(V.WORDS.T1[0]) && /HABITUATING REFLEX WRITTEN BY HAND$/.test(V.WORDS.H[0]) &&
        /\*\*P: HAB against FROZEN\*\*/.test(flat) && /\*\*T1: HAB against HSHUF\*\*/.test(flat) && /\*\*H: HAB against the hand-written habituating reflex\*\*/.test(flat));
    const A20 = V.AUDIT.slice(0, 20), fl = V.floors(A20);
    ok("!! EVERY ARM'S UNTRAINED FLY IS THE REFLEX: on 20 audit lives each arm's untrained draw 1 scores the reflex's number to the bit, as the floors say; the hand floor is above the reflex and below the fly told the kind", V.ARMS.every((a) => fl.untrained[a] === fl.reflex.score) && fl.hand.score > fl.reflex.score && fl.told.score > fl.hand.score && J(Object.keys(fl.untrained)) === J(V.ARMS), `reflex ${fl.reflex.score.toFixed(4)} hand ${fl.hand.score.toFixed(4)} told ${fl.told.score.toFixed(4)}`);
});

console.log("\n4. ONE TRAINING (2 iterations, 4 flies tried, 2 lives each, a battery of 4, on draw 901)");
section(() => {
    const r = V.trainOne("HAB", 901, TINY, TINY_AUDIT), f = V.trainOne("FROZEN", 901, TINY, TINY_AUDIT);
    const byHand = trainDockES({ envFactory: () => new L.LifeEnv(), obsDim: 13, actDim: 1, maxSteps: 640, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901, freshEpisodes: true, batteryEps: 4,
        policyFactory: () => new RS.ReflexStart(new HC.HabituatingCircuit(new M.MaskedCircuitPolicy({ obsDim: 13, units: 42, inputs: V5.VISUAL_INPUTS.map((e) => [...e]), edges: T.EDGES.map((e) => [e[0], e[1]]), outputs: [40, 41], edgeStart: T.SYNAPSES.map((n) => n * 0.01), seed: 901 })), { rule: E.RULES.reflex, tail: 3 }) });
    ok("!! A HAB RECORD'S WEIGHTS ARE THE TRAINER'S FROM A POLICY MADE HERE BY HAND (the real circuit, habituating, inside the reflex wrapper; lives; fresh episodes; the recipe's battery), to the hash; it carries its rates and its wiring; FROZEN's training is another, with no rates",
        PF.hashWeights(byHand.params) === r.weightsHash && r.weightCount === 456 && f.weightCount === 454 && r.rates && Number.isFinite(r.rates.a) && f.rates === null && r.edgesHash === PF.hashEdges(T.EDGES.map((e) => [e[0], e[1]])) && J(r.recipe) === J(TINY));
    const p = V.policyOf("HAB", 901); p.setParams(PF.unpackWeights(r.weights)); const a = V.auditScore(() => (o) => p.act(o), TINY_AUDIT);
    ok("the tiny training's weights give its score again, life by life: in the HAB fly of that draw, audited on the same lives, to the bit -- and its score is its decoy and ordinary lives'", a.score === r.score && a.decoy === r.decoy && a.ordinary === r.ordinary && J(a.ep) === J(r.ep) && near(r.score, (r.decoy * r.nDecoy + r.ordinary * (TINY_AUDIT.length - r.nDecoy)) / TINY_AUDIT.length, 1e-12), `${r.score.toFixed(4)}`);
});

console.log("\n5. THE RECORDS");
section(() => {
    const hist = Array.from({ length: 7 }, (_, k) => ({ it: [0, 25, 50, 75, 100, 125, 149][k], ret: 0.6 + k / 100 })), made = new Map();
    const stub = (arm, s) => { const k = arm + s; if (!made.has(k)) { const w = V.policyOf(arm, s).getParams(), c = V.circuitOf(arm, s); made.set(k, { units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w) }); } return made.get(k); };
    const rec = (arm, s, decoy, ordinary, ep1 = decoy, ep4 = decoy) => ({ kind: "draw", arm, s, recipe: { ...V.RECIPE }, ...stub(arm, s), rates: arm === "FROZEN" ? null : { a: 0.1, b: 0.002 }, score: (decoy * 100 + ordinary * 100) / 200, decoy, ordinary, nDecoy: 100, ep: { decoy: [ep1, decoy, decoy, ep4], ordinary: [ordinary, ordinary, ordinary, ordinary] }, caught: 10, history: hist });
    const flo = (hand = 0.76) => { const x = (s) => ({ score: s, decoy: s, ordinary: s, nDecoy: 100, ep: { decoy: [s, s, s, s], ordinary: [s, s, s, s] }, caught: 0 }); return { kind: "floors", reflex: x(0.62), freeze: x(0.64), hand: x(hand), told: x(0.83), untrained: { FROZEN: 0.62, HAB: 0.62, HSHUF: 0.62 } }; };
    const file = (f, first = 1) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(f(arm, s)); out.push({ kind: "recheck", arm: "HAB", s: first, weightsHash: out.find((r) => r.arm === "HAB" && r.s === first).weightsHash }, flo()); return out; };
    const learnt = (arm, s) => (arm === "FROZEN" ? rec(arm, s, 1, 0.29 + s / 1e4) : rec(arm, s, 0.85 + s / 1e4, 0.62 + (arm === "HAB" ? 0.01 : 0), 0.7, 0.95)), good = file(learnt);
    ok("!! a file of 36 draws with HAB draw 1 a second time passes every check and its first line says 36; a draw missing, a FROZEN draw with rates, a HAB draw with HSHUF's wiring, a score that is not its lives', and a second training of draw 2 each fail by name",
        V.checkRecords(good).length === 0 && good.length === 38 && /^the checks hold: 36 draws/.test(V.readingLines(V.reading(good))[0]) &&
        V.checkRecords(good.filter((r) => !(r.arm === "HSHUF" && r.s === 12))).some((x) => /HSHUF draw 12 is there 0 times/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "FROZEN" && r.s === 3 ? { ...r, rates: { a: 0, b: 0 } } : r))).some((x) => /FROZEN draw 3's habituation rates are not its arm's/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "HAB" && r.s === 5 ? { ...r, edgesHash: stub("HSHUF", 5).edgesHash } : r))).some((x) => /HAB draw 5's wiring is not its arm's/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "HAB" && r.s === 6 ? { ...r, score: r.score + 0.01 } : r))).some((x) => /HAB draw 6 has no score that is its decoy and ordinary lives'/.test(x)) &&
        J(V.checkRecords(file(learnt, 2))) === J(["HAB draw 1 trained a second time is not there once with the same weights"]), V.checkRecords(good).slice(0, 2).join(" | "));
    const R = V.reading(good), lines = V.readingLines(R).join("\n");
    ok("!! P IS HAB AGAINST FROZEN, T1 HAB AGAINST HSHUF, H HAB AGAINST THE HAND FLOOR: HAB flies that learn (0.735 or so) above FROZEN flies that never flee (0.645) -> P BETTER; HAB a hair above HSHUF on every draw -> T1 BETTER; HAB all below the hand floor's 0.76 -> H WORSE",
        R.P.word === V.WORDS.P[0] && R.P.sumA === 222 && R.T1.word === V.WORDS.T1[0] && R.H.word === V.WORDS.H[1] && R.H.below === 12 && R.H.ref === 0.76 && /P \(HAB against FROZEN\): HAB's ranks sum to 222/.test(lines) && /H \(HAB against the habituating reflex\): of 12, 0 above its 0\.7600, 12 below/.test(lines));
    ok("!! THE FLIES THAT LEARN AND THE FLIES THAT NEVER FLEE ARE COUNTED AS REGISTERED: FROZEN never flees 12 of 12 (an ordinary-life score under 0.35) and learns 0; HAB learns 12 of 12 (an ordinary-life score above 0.5 and a decoy-life fourth episode above its first) with its signature, 0.25, in the lines",
        R.arms.FROZEN.neverFlee === 12 && R.arms.FROZEN.learn === 0 && R.arms.HAB.learn === 12 && R.arms.HAB.neverFlee === 0 && near(R.arms.HAB.signature, 0.25, 1e-9) && R.arms.FROZEN.a === null && near(R.arms.HAB.a, 0.1, 1e-12) && /never flee 12 of 12, learn 0 of 12/.test(lines) && /the 4th episode less the 1st 0\.2500/.test(lines) && V.NEVER_FLEES === 0.35 &&
        V.learns({ ordinary: 0.51, ep: { decoy: [0.5, 0, 0, 0.6] } }) && !V.learns({ ordinary: 0.49, ep: { decoy: [0.5, 0, 0, 0.6] } }) && !V.learns({ ordinary: 0.6, ep: { decoy: [0.6, 0, 0, 0.6] } }));
    const split = V.reading(file((arm, s) => (arm === "FROZEN" ? rec(arm, s, 1, 0.29 + s / 1e4) : arm === "HAB" ? rec(arm, s, 0.85 + s / 1e4, 0.62, 0.7, 0.95) : rec(arm, s, 0.9 + s / 1e4, 0.66, 0.7, 0.97))));
    ok("!! P IS AGAINST FROZEN AND T1 AGAINST HSHUF, NOT THE OTHER WAY (sabotage F3 first went 0 red, and this row is its answer): HAB above every FROZEN fly and below every HSHUF fly -> P BETTER (ranks 222) and T1 WORSE (ranks 78)",
        split.P.sumA === 222 && split.P.word === V.WORDS.P[0] && split.T1.sumA === 78 && split.T1.word === V.WORDS.T1[1]);
    const off = good.map((r) => (r.kind === "floors" ? { ...r, untrained: { ...r.untrained, HAB: 0.61 } } : r));
    ok("!! AN UNTRAINED FLY THAT IS NOT THE REFLEX IS SAID BY NAME AND NOTHING IS WEIGHED (sabotage F11 first went 0 red, and this row is its answer): floors whose untrained HAB fly scores 0.61 against the reflex's 0.62", J(V.checkRecords(off)) === J(["the untrained HAB fly does not score the reflex's number: the start is not the reflex"]) && V.reading(off).P === null);
    const tie = V.reading(file((arm, s) => rec(arm, s, 1, 0.29 + ((s * 7 + arm.length) % 12) / 1e4)));
    ok("arms that all never flee cannot be told apart: P and T1 CANNOT BE TOLD APART", tie.P.word === V.WORDS.P[2] && tie.T1.word === V.WORDS.T1[2] && tie.arms.HAB.neverFlee === 12);
    const R2 = V.reading(good.filter((r) => r.kind !== "floors"));
    ok("with a failed check no test is made: a file with no floors has P, T1 and H null and says a check failed first", R2.P === null && R2.T1 === null && R2.H === null && /^A CHECK FAILED/.test(V.readingLines(R2)[0]) && R2.checks.some((x) => /the floors are not there once/.test(x)));
});

console.log("\n6. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "GF", "1"], ["job", "HAB", "x"], ["job", "HAB", "13"], ["job", "HAB", "0"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for one of the three arms and draws 1 to 12 -- and nothing else", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "HSHUF", "12"])) === J({ cmd: "job", arm: "HSHUF", s: 12 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeHabituate.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, and trains THE LEAD ARM'S FIRST DRAW a second time (HAB, draw 1)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeHabituate\.mjs"/.test(csrc) && !/Fibres|Split|Degree|Vision|"\.\/flyEscape\.mjs"|voxelHome/.test(csrc) && /if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s\]\)/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeHabituate\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyEscapeHabituate-selfcheck.mjs"), calls = [...me.matchAll(/V\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its two trainings through the round's code are of 2 iterations with 4 flies tried on draw 901; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 2 && calls.every((c) => /^"(HAB|FROZEN)", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 4 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before && typeof createHash === "function", `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log("\n7. THE VERDICT (the whole results file was committed at 515cb21a before it was read, and is read here from the file)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, V.RESULTS)), lines = bytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)), R = V.reading(lines), A = R.arms, F = R.floors, draws = lines.filter((r) => r.kind === "draw");
    const sc = (a) => draws.filter((r) => r.arm === a).sort((x, y) => x.s - y.s).map((r) => r.score), never = F.freeze.score, rec = (a, s) => draws.find((r) => r.arm === a && r.s === s);
    ok("!! the results file is the one the run wrote: 38 records, sha256 e01bfbd4f9c08afd... (one start, 99.6 minutes, no restart)", lines.length === 38 && createHash("sha256").update(bytes).digest("hex") === "e01bfbd4f9c08afdb65f64ce65d53af6c8c1b4d06abe66e6c0bbc41b46659a36");
    ok("!! THE CHECKS HOLD, AND THE START WAS THE REFLEX: 36 draws each once, the registered recipe, each arm's weights and wiring, HAB draw 1 the same twice, the floors -- and the untrained fly of all three arms scores the reflex's 0.6057, to the bit",
        R.checks.length === 0 && draws.length === 36 && near(F.reflex.score, 0.6057) && V.ARMS.every((a) => F.untrained[a] === F.reflex.score));
    ok("!! *** P: A FLY WHOSE CONNECTIONS ONTO THE GIANT FIBERS HABITUATE CANNOT BE TOLD APART FROM ONE WHOSE CANNOT *** -- HAB's ranks 168 on a middle of 150, 108 of the 144 pairs tied, exact two-sided p 1.0",
        R.P && R.P.word === V.WORDS.P[2] && R.P.sumA === 168 && R.P.ties === 108 && R.P.p === 1);
    ok("!! T1: THE REAL WIRING HABITUATING CANNOT BE TOLD APART FROM A SHUFFLE OF IT (ranks 125.5, 27 ties, p 0.55). H: IT DOES WORSE THAN THE HAND HABITUATING REFLEX -- 1 of 12 above its 0.7276, 11 below, p 0.0063",
        R.T1.word === V.WORDS.T1[2] && R.T1.sumA === 125.5 && R.T1.ties === 27 && near(R.T1.p, 0.5512, 1e-4) && R.H.word === V.WORDS.H[1] && R.H.above === 1 && R.H.below === 11 && near(R.H.ref, 0.7276) && near(R.H.p, 0.006348, 1e-6));
    ok("!! *** EVERY FROZEN FLY IS THE FLY THAT NEVER FLEES, TO THE BIT, AND SO ARE 9 OF THE 12 HAB FLIES *** (0.6348, the never-flees floor's own number); the three that are not are HAB draws 2, 3 and 12 (0.7187, 0.8203, 0.6728)",
        sc("FROZEN").every((v) => v === never) && A.FROZEN.neverFlee === 12 && sc("HAB").filter((v) => v === never).length === 9 && A.HAB.neverFlee === 9 && J(draws.filter((r) => r.arm === "HAB" && r.score !== never).map((r) => r.s).sort((x, y) => x - y)) === J([2, 3, 12]) && near(rec("HAB", 3).score, 0.8203) && near(rec("HAB", 2).score, 0.7187) && near(rec("HAB", 12).score, 0.6728));
    ok("!! the arms (mean, sd, decoy lives, ordinary lives): FROZEN 0.6348 0 1.0000 0.2695 | HAB 0.6604 0.0540 0.9467 0.3741 | HSHUF 0.6590 0.0150 0.7008 0.6172; the floors: the habituating reflex 0.7276, told the kind 0.8137",
        near(A.FROZEN.mean, 0.6348) && A.FROZEN.sd < 1e-12 && near(A.HAB.mean, 0.6604) && near(A.HAB.sd, 0.0540) && near(A.HAB.decoy, 0.9467) && near(A.HAB.ordinary, 0.3741) && near(A.HSHUF.mean, 0.6590) && near(A.HSHUF.sd, 0.0150) && near(A.HSHUF.decoy, 0.7008) && near(A.HSHUF.ordinary, 0.6172) && near(F.hand.score, 0.7276) && near(F.told.score, 0.8137));
    const zero = (arm, s) => { const r = rec(arm, s), w = PF.unpackWeights(r.weights), p = V.policyOf(arm, s); p.setParams(w); const a = V.auditScore(() => (o) => p.act(o)); const z = Float64Array.from(w); z[0] = 0; z[1] = 0; const q = V.policyOf(arm, s); q.setParams(z); return [a.score === r.score, V.auditScore(() => (o) => q.act(o)).score]; };
    const h3 = zero("HAB", 3), h2 = zero("HAB", 2), s2 = zero("HSHUF", 2);
    ok("!! *** THE THREE HAB FLIES THAT ARE NOT NEVER-FLEEING LEAN ON THE PLASTICITY *** (measured after the reading, not registered): re-audited on the 200 lives, each record's weights give its score to the bit; with its two rates set to 0, HAB draw 3 falls from 0.8203 to the never-flees 0.6348 and HAB draw 2 from 0.7187 to 0.5000 -- while HSHUF draw 2, whose depression rate is 0, gives its 0.6818 again with them at 0",
        h3[0] && h2[0] && s2[0] && h3[1] === never && near(h2[1], 0.5, 1e-9) && s2[1] === rec("HSHUF", 2).score && rec("HSHUF", 2).rates.a === 0, `HAB 3 -> ${h3[1].toFixed(4)}, HAB 2 -> ${h2[1].toFixed(4)}, HSHUF 2 -> ${s2[1].toFixed(4)}`);
    ok("!! HAB draw 3, the best fly of the round and the only one above the hand floor, never pays a decoy from its life's first episode (1.00 in all four): what it does is within an episode, not the slow habituation across episodes the signature looks for",
        J(rec("HAB", 3).ep.decoy.map((v) => v.toFixed(4))) === J(["1.0000", "1.0000", "1.0000", "1.0000"]) && rec("HAB", 3).score > F.hand.score && sc("HAB").filter((v) => v > F.hand.score).length === 1);
    ok("!! *** THE REGISTERED LEARN COUNT DOES NOT MEASURE LEARNING *** -- the reflex floor itself passes it (ordinary 0.6275 over 0.5; decoy 4th episode 0.5894 over its 1st 0.5776), and all 9 of HSHUF's \"learners\" have the depression rate at 0, so their connections cannot change; HAB's 2 are draws 2 and 12",
        V.learns(F.reflex) && A.HSHUF.learn === 9 && draws.filter((r) => r.arm === "HSHUF" && V.learns(r)).every((r) => r.rates.a === 0) && A.HAB.learn === 2 && J(draws.filter((r) => r.arm === "HAB" && V.learns(r)).map((r) => r.s).sort((x, y) => x - y)) === J([2, 12]));
    ok("!! WHAT THE TRAINER SAW: on its own lives HAB starts at 0.578 and HSHUF at 0.621, FROZEN at 0.649 -- the real wiring's drive onto the Giant Fibers starts far below the reflex, as in rounds 7 and 8 -- and FROZEN stops at 0.661 by iteration 25",
        near(A.HAB.history[0].ret, 0.5783) && near(A.HSHUF.history[0].ret, 0.6206) && near(A.FROZEN.history[0].ret, 0.6490) && A.FROZEN.history.slice(1).every((h) => near(h.ret, 0.6613)));
    const note = src("brain/FLY_ESCAPE_HABITUATE_WIP.md"), res = note.slice(note.indexOf("## 10. The result")).replace(/\s+/g, " ");
    ok("the expectations, written before the code, against what came: P CANNOT (55) came; FROZEN at least 10 of 12 never flee (85) came, with 12; HAB at least 3 of 12 learn (45) did NOT, with 2; T1 CANNOT (75) and H WORSE (65) came",
        /P: \*\*CANNOT BE TOLD APART about 55 percent, BETTER about 40, WORSE about 5\.\*\*/.test(note) && /least 10 of 12 never flee, about\s+85/.test(note) && /HAB: at least 3 of 12 learn/.test(note) && /T1: CANNOT about 75\. H: WORSE about 65\./.test(note) && A.HAB.learn < 3 && A.FROZEN.neverFlee >= 10);
    ok("the registration's RESULT SECTION (section 10, not the possible words of section 5) carries the three readings' words, the commit the file was read at, that 9 of 12 HAB flies never flee, the rates-at-0 measure said as unregistered, that the learn count does not measure learning, and that the HAB learn expectation did not come",
        /## 10\. The result/.test(note) && [["P", R.P.word], ["T1", R.T1.word], ["H", R.H.word]].every(([t, w]) => res.includes(`**${t}: ${w}**`)) && /515cb21a/.test(res) && /Nine of the twelve HAB flies did the same/.test(res) && /NOT registered/.test(res) && /does not measure learning/.test(res) && /\(45\) did not come, with 2/.test(res));
});

console.log(`\nflyEscapeHabituate-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
