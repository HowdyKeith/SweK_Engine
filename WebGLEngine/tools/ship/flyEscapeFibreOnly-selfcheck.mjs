// WebGLEngine/tools/ship/flyEscapeFibreOnly-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeFibreOnly-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its training is tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 11 (registered in brain/FLY_ESCAPE_FIBRE_ONLY_WIP.md before brain/rl/fibreOnlyReflex.mjs, tools/ship/flyEscapeFibreOnly.mjs and tools/ship/takeFlyEscapeFibreOnly.mjs existed):
// does a fly whose network cannot overrule its habituating fibres beat never fleeing, in lives that are decoy or ordinary?
//   1  THE FLY                  brain/rl/fibreOnlyReflex.mjs: round 10's fly, tick by tick, with its action the firing alone; the veto is gone; at rates 0 the reflex whatever its weights
//   2  THE ROUND'S NUMBERS      the recipe, draws, arms, weights and audit; round 10's numbers; the floors; ACROSS on its line
//   3  ONE TRAINING             a record's weights are the trainer's from a policy made here by hand; its score with the rates at 0 is the reflex's
//   4  THE RECORDS              24 draws; the rates-at-0 check; P, T1, H; ACROSS and never fleeing counted
//   5  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-17) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a
// process) run whole for each; every one red by name (the number is the rows red over the two):
//   THE FLY (brain/rl/fibreOnlyReflex.mjs): K1 the network's output is added again 4 | K2 firing turns the fly to food 5 | K3 the action is the reflex, not the firing 1
//   THE ROUND (tools/ship/flyEscapeFibreOnly.mjs): F1 FIBRE is round 10's COACT fly 4 | F2 FSHUF is the real wiring 2 | F3 the draws are 13 to 24 3 | F4 P against the reflex 2 | F5 the rates-at-0 check is
//   not made 1 | F6 ACROSS needs 0.11 2 | F7 the round writes round 10's file 1 | F8 T1's BETTER and WORSE swapped 2 | F9 rates at 0 keeps the recovery rate 1 | F10 the recipe is 100 iterations 4
//   THE COMMAND: C1 the second training is of draw 26 1 | C2 exits 0 on a word it does not know 1 | C3 reads round 10's library 1.  THE NOTE: N1 the note weighs P against the reflex 1 | N2 its draws are 13 to 24 1
//   K3 WENT 0 RED AT FIRST AND WAS A FINDING: in the lives the rows used the efficacies never fell under the line, so the fibres' firing was the reflex and no row could tell them apart. A row with the
//   efficacies set under and over the line, and a life with a strong rate, was added, and K3 was run again: 1.
//   One row of mine was wrong when written: its never-fleeing fixture scored 0.63475, not 0.6348, so its flies were not ties; it now sits on 0.6348 exactly (decoy 1, ordinary 0.2696).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeFibreOnly.mjs";
import * as R10 from "./flyEscapeCoact.mjs";
import * as R9 from "./flyEscapeHabituate.mjs";
import * as V5 from "./flyEscapeVision.mjs";
import * as PF from "./paintingFly.mjs";
import * as L from "../../brain/rl/lifeEnv.mjs";
import * as CR from "../../brain/rl/coactReflex.mjs";
import * as FO from "../../brain/rl/fibreOnlyReflex.mjs";
import * as E from "../../brain/rl/escapeEnv.mjs";
import * as M from "../../brain/rl/maskedCircuitPolicy.mjs";
import * as P from "../../brain/rl/paintCircuitPolicy.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: L.LIFE_STEPS, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, fresh: true, battery: 4 }), TINY_AUDIT = [880001, 880002, 880003, 880004];
const net = (edges, s) => new M.MaskedCircuitPolicy({ obsDim: 13, units: 42, inputs: V5.VISUAL_INPUTS.map((e) => [...e]), edges, outputs: [...T.GF], edgeStart: [...V5.EDGE_START], seed: s });
const REAL = () => T.EDGES.map((e) => [e[0], e[1]]);
const withRates = (fly, pa, pb) => { const w = fly.getParams(); w[0] = pa; w[1] = pb; return fly.setParams(w); };
// a weight list that is not zero anywhere, its output layer (the last three) held at -5, so round 10's fly is vetoed on every tick
const vetoing = (n, pa, pb, s) => { const w = PF.unpackWeights(PF.packWeights(Float32Array.from({ length: n }, (_, k) => Math.sin(k * 1.7 + s) * 0.3))); w.fill(-5, n - 3); w[0] = pa; w[1] = pb; return w; };

console.log("flyEscapeFibreOnly-selfcheck -- the escape round 11 (a fly whose network cannot overrule its habituating fibres): the fly, the numbers, one training, the records, the command\n");

console.log("1. THE FLY (brain/rl/fibreOnlyReflex.mjs)");
section(() => {
    let same = true, acts = true, n = 0, firedN = 0;
    for (const [s, edges] of [[25, REAL()], [26, P.shuffledEdges(42, T.EDGES.length, V5.SHUFFLE_SEED + 26)]]) {
        const w = vetoing(456, 0.3, 0.4, s), c = new CR.CoactReflex(net(edges, s), { rule: E.RULES.reflex, tail: 3 }).setParams(w), f = new FO.FibreOnlyReflex(net(edges, s), { rule: E.RULES.reflex, tail: 3 }).setParams(w);
        for (const seed of [900001, 907920]) { const env = new L.LifeEnv(); let o = env.reset(seed), done = false; while (!done) { c.act(o); const a = f.act(o)[0]; same = same && c.fired === f.fired && J(Array.from(c.g)) === J(Array.from(f.g)); acts = acts && a === (f.fired ? 0.5 : -0.5); firedN += f.fired ? 1 : 0; n++; const r = env.step([a]); o = r.obs; done = r.done; } }
    }
    ok("!! *** THE FLY IS ROUND 10'S FLY TICK BY TICK -- THE SAME FIRING AND THE SAME EFFICACIES -- AND ITS ACTION IS THE FIRING ALONE, +0.5 OR -0.5 *** (weights not zero anywhere, rates 0.3 and 0.4, on the real wiring and a shuffle, two whole lives each)",
        same && acts && firedN > 10 && FO.FibreOnlyReflex.prototype instanceof CR.CoactReflex, `${n} ticks, ${firedN} fired`);
    let vetoed = 0, through = 0;
    const w = vetoing(456, 0, 0, 25), c = new CR.CoactReflex(net(REAL(), 25), { rule: E.RULES.reflex, tail: 3 }).setParams(w), f = new FO.FibreOnlyReflex(net(REAL(), 25), { rule: E.RULES.reflex, tail: 3 }).setParams(w);
    { const env = new L.LifeEnv(); let o = env.reset(900001), done = false; while (!done) { const a = c.act(o)[0], b = f.act(o)[0]; if (f.fired && a <= 0) vetoed++; if (f.fired && b > 0) through++; const r = env.step([b]); o = r.obs; done = r.done; } }
    ok("!! *** THE VETO IS GONE ***: with an output layer held at -5 (what three of round 10's flies found), round 10's fly does not flee on any of the ticks its fibres fire, and this round's flees on every one",
        vetoed > 10 && vetoed === through, `fired ${through}, round 10's fly vetoed ${vetoed}`);
    let reflex = true, m = 0;
    for (const s of [25, 26]) { const p = V.policyOf(s === 25 ? "FIBRE" : "FSHUF", s).setParams(vetoing(456, 0, 0, s)); for (const seed of [900001, 915839]) { const env = new L.LifeEnv(); let o = env.reset(seed), done = false; while (!done) { const a = p.act(o)[0]; reflex = reflex && a === (E.RULES.reflex(o)[0] > 0 ? 0.5 : -0.5); m++; const r = env.step([a]); o = r.obs; done = r.done; } } }
    ok("!! AT RATES 0 THE FLY IS THE REFLEX WHATEVER ITS OTHER WEIGHTS: every action of two lives each, on both arms, with weights that are not zero and an output layer at -5", reflex, `${m} actions`);
    const flee = new Float32Array(13); flee[0] = 1; flee[2] = 0.3; flee[9] = 1; flee[L.CLOCK] = 0.1;
    const z = withRates(V.policyOf("FIBRE", 25), 2, 0); z.g.fill(0.4); const below = z.act(flee)[0]; z.g.fill(0.6); const above = z.act(flee)[0];
    const strong = withRates(V.policyOf("FIBRE", 25), 2, 0); let held = 0; { const env = new L.LifeEnv(); let o = env.reset(900001), done = false; while (!done) { const a = strong.act(o)[0]; if (E.RULES.reflex(o)[0] > 0 && a < 0) held++; const r = env.step([a]); o = r.obs; done = r.done; } }
    ok("!! *** IT ACTS ON THE FIBRES' FIRING, NOT ON THE REFLEX *** (sabotage K3 first went 0 red -- in the lives above the efficacies never fell under the line, so the firing was the reflex -- and this row is its answer): told to flee with every efficacy at 0.4 it heads for food (-0.5), at 0.6 it flees (+0.5); with a strong rate, a whole life has ticks where the reflex says flee and the fly does not",
        E.RULES.reflex(flee)[0] > 0 && below === -0.5 && above === 0.5 && held > 10, `${below} ${above}; held ${held} ticks`);
    const kept = withRates(V.policyOf("FIBRE", 25), 0.3, 0.4), before = J(Array.from(kept.getParams())), env2 = new L.LifeEnv(); let o2 = env2.reset(900001), lowest = 1;
    for (let t = 0; t < 640; t++) { const r = env2.step(kept.act(o2)); lowest = Math.min(lowest, kept.mean()); o2 = r.obs; if (r.done) break; }
    ok("acting leaves the weights as they were: a whole life with the efficacies falling under 0.6, and the weights after are the weights before, to the bit", J(Array.from(kept.getParams())) === before && lowest < 0.6, `lowest ${lowest.toFixed(3)}`);
    const note = src("brain/FLY_ESCAPE_FIBRE_ONLY_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same of the fly: round 10's fly used as it is, with its action `0.5 x (+1 if it fires, else -1)` and nothing added, and at rates 0 the reflex to the bit whatever its other weights",
        /Round 10's fly \(`brain\/rl\/coactReflex\.mjs`, used as it is/.test(note) && /with its action `0\.5 x \(\+1 if it fires, else -1\)` and nothing added\./.test(note) && /With both rates at 0 the fly is the reflex to the bit\*\* \(0\.6057\), whatever its other weights/.test(note));
});

console.log("\n2. THE ROUND'S NUMBERS (tools/ship/flyEscapeFibreOnly.mjs)");
section(() => {
    ok("!! the recipe, the audit, alpha, the never-flee line and ACROSS are round 10's (and so round 9's); the draws 25 to 36, new to both; the arms FIBRE and FSHUF, the lead FIBRE, 456 weights each; the results file its own",
        V.RECIPE === R10.RECIPE && V.RECIPE === R9.RECIPE && V.AUDIT === R10.AUDIT && V.ALPHA === 0.01 && V.NEVER_FLEES === 0.35 && V.ACROSS_BY === 0.1 && J(V.SEEDS) === J([25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]) && V.SEEDS.every((s) => !R10.SEEDS.includes(s) && !R9.SEEDS.includes(s)) &&
        J(V.ARMS) === J(["FIBRE", "FSHUF"]) && V.LEAD === "FIBRE" && J(V.WEIGHTS) === J({ FIBRE: 456, FSHUF: 456 }) && V.policyOf("FSHUF", 27).paramCount() === 456 && V.RESULTS === "brain/flyEscapeFibreOnlyRound.jsonl" && ![R9.RESULTS, R10.RESULTS].includes(V.RESULTS));
    ok("FSHUF's wiring is round 5's free shuffle of the draw, FIBRE's the real; another arm and draw 0 are refused; the fly is this round's class",
        PF.hashEdges(V.circuitOf("FSHUF", 27).edges) === PF.hashEdges(P.shuffledEdges(42, 369, 7027)) && PF.hashEdges(V.circuitOf("FIBRE", 27).edges) === PF.hashEdges(REAL()) && throws(() => V.circuitOf("COACT", 1), /no arm COACT/) && throws(() => V.policyOf("FIBRE", 0), /whole number from 1/) && V.policyOf("FIBRE", 27) instanceof FO.FibreOnlyReflex);
    const few = V.AUDIT.slice(0, 6), fl = V.floors(few), fl10 = R10.floors(few);
    ok("V.floors is round 10's floors with this round's two untrained flies, each the reflex", ["reflex", "freeze", "hand", "told"].every((k) => J(fl[k]) === J(fl10[k])) && J(Object.keys(fl.untrained)) === J(V.ARMS) && V.ARMS.every((a) => fl.untrained[a] === fl.reflex.score));
    const ep = (d) => ({ decoy: d, ordinary: [0.6, 0.6, 0.6, 0.6] });
    ok("!! ACROSS is a rise of at least 0.1 -- exactly 0.1 counts (0.101 - 0.001 is 0.1 in doubles), 0.09 does not", 0.101 - 0.001 === 0.1 && V.across({ ep: ep([0.001, 0, 0, 0.101]) }) && V.across({ ep: ep([0.5, 0, 0, 0.61]) }) && !V.across({ ep: ep([0.5, 0, 0, 0.59]) }));
    const note = src("brain/FLY_ESCAPE_FIBRE_ONLY_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same of the round: draws 25 to 36, the two arms and 456 weights, no frozen arm, round 9's recipe and audit, P against never fleeing (0.6348), T1 against FSHUF, H against the hand reflex, and ACROSS at least 0.1",
        /\*\*draws 25 to 36\*\*/.test(note) && /\| \*\*FIBRE\*\* \|[^|]*\| 456 \|/.test(note) && /\| \*\*FSHUF\*\* \|[^|]*\| 456 \|/.test(note) && /There is no frozen arm/.test(note) && /The recipe and the audit are round 9's/.test(note) &&
        /\*\*P: FIBRE against never fleeing\*\*, a sign test of the 12 against its audit score \(0\.6348\)/.test(note) && /\*\*T1: FIBRE against FSHUF\*\*, a rank sum/.test(note) && /\*\*H: FIBRE against the hand habituating reflex\*\*/.test(note) && /least \*\*0\.1\*\*/.test(note));
});

console.log("\n3. ONE TRAINING (2 iterations, 4 flies tried, 2 lives each, a battery of 4, on draw 901)");
section(() => {
    const r = V.trainOne("FIBRE", 901, TINY, TINY_AUDIT);
    const byHand = trainDockES({ envFactory: () => new L.LifeEnv(), obsDim: 13, actDim: 1, maxSteps: 640, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901, freshEpisodes: true, batteryEps: 4,
        policyFactory: () => new FO.FibreOnlyReflex(net(REAL(), 901), { rule: E.RULES.reflex, tail: 3 }) });
    ok("!! A FIBRE RECORD'S WEIGHTS ARE THE TRAINER'S FROM A POLICY MADE HERE BY HAND (this round's fly round the real network; lives; fresh lives; the recipe's battery), to the hash; it carries its rates and its wiring",
        PF.hashWeights(byHand.params) === r.weightsHash && r.weightCount === 456 && r.rates && Number.isFinite(r.rates.a) && r.edgesHash === PF.hashEdges(REAL()) && J(r.recipe) === J(TINY));
    const w = PF.unpackWeights(r.weights), p = V.policyOf("FIBRE", 901).setParams(w), a = V.auditScore(() => (o) => p.act(o), TINY_AUDIT), off = V.ratesOff("FIBRE", 901, w);
    ok("the tiny training's weights give its score again, life by life; its score with the rates at 0 is the reflex's on the same lives, and that fly is its weights with the first two set to 0 and nothing else changed",
        a.score === r.score && J(a.ep) === J(r.ep) && r.ratesOff === V.auditScore(() => E.RULES.reflex, TINY_AUDIT).score && J(Array.from(off.getParams().subarray(2))) === J(Array.from(w.subarray(2))) && off.getParams()[0] === 0 && off.getParams()[1] === 0, `${r.score.toFixed(4)}, rates at 0 ${r.ratesOff.toFixed(4)}`);
});

console.log("\n4. THE RECORDS");
section(() => {
    const hist = Array.from({ length: 7 }, (_, k) => ({ it: [0, 25, 50, 75, 100, 125, 149][k], ret: 0.6 + k / 100 })), made = new Map(), REFLEX = 0.6057;
    const stub = (arm, s) => { const k = arm + s; if (!made.has(k)) { const w = V.policyOf(arm, s).getParams(), c = V.circuitOf(arm, s); made.set(k, { units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w) }); } return made.get(k); };
    const rec = (arm, s, decoy, ordinary, ep1 = decoy, ep4 = decoy) => ({ kind: "draw", arm, s, recipe: { ...V.RECIPE }, ...stub(arm, s), rates: { a: 0.1, b: 0 }, ratesOff: REFLEX, score: (decoy * 100 + ordinary * 100) / 200, decoy, ordinary, nDecoy: 100, ep: { decoy: [ep1, decoy, decoy, ep4], ordinary: [ordinary, ordinary, ordinary, ordinary] }, caught: 10, history: hist });
    const flo = () => { const x = (s) => ({ score: s, decoy: s, ordinary: s, nDecoy: 100, ep: { decoy: [s, s, s, s], ordinary: [s, s, s, s] }, caught: 0 }); return { kind: "floors", reflex: x(REFLEX), freeze: x(0.6348), hand: x(0.7276), told: x(0.8137), untrained: { FIBRE: REFLEX, FSHUF: REFLEX } }; };
    const file = (f, first = 25) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(f(arm, s)); out.push({ kind: "recheck", arm: "FIBRE", s: first, weightsHash: out.find((r) => r.arm === "FIBRE" && r.s === first).weightsHash }, flo()); return out; };
    const learnt = (arm, s) => rec(arm, s, 0.85 + s / 1e4, 0.52 + (arm === "FIBRE" ? 0.01 : 0), 0.58, 1), good = file(learnt);
    ok("!! a file of 24 draws with FIBRE draw 25 a second time passes every check and its first line says 24; a draw missing, a draw of round 10's, other wiring, and a second training of draw 26 each fail by name",
        V.checkRecords(good).length === 0 && good.length === 26 && /^the checks hold: 24 draws/.test(V.readingLines(V.reading(good))[0]) &&
        V.checkRecords(good.filter((r) => !(r.arm === "FSHUF" && r.s === 36))).some((x) => /FSHUF draw 36 is there 0 times/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "FIBRE" && r.s === 28 ? { ...r, s: 13 } : r))).some((x) => /FIBRE draw 13 is not a registered draw/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "FIBRE" && r.s === 29 ? { ...r, edgesHash: stub("FSHUF", 29).edgesHash } : r))).some((x) => /FIBRE draw 29's wiring is not its arm's/.test(x)) &&
        J(V.checkRecords(file(learnt, 26))) === J(["FIBRE draw 25 trained a second time is not there once with the same weights"]), V.checkRecords(good).slice(0, 2).join(" | "));
    const veto = good.map((r) => (r.arm === "FSHUF" && r.s === 30 ? { ...r, ratesOff: 0.6348 } : r)), noRates = good.map((r) => (r.arm === "FIBRE" && r.s === 31 ? { ...r, rates: null } : r));
    ok("!! *** A FLY WHOSE SCORE WITH ITS RATES AT 0 IS NOT THE REFLEX'S IS A FAILED CHECK, BY NAME, AND NOTHING IS WEIGHED *** (one at never fleeing's 0.6348 -- a veto); and a draw with no rates fails by name",
        J(V.checkRecords(veto)) === J(["FSHUF draw 30's score with its rates at 0 is not the reflex's: the network overrules the fibres"]) && V.reading(veto).P === null && V.checkRecords(noRates).some((x) => /FIBRE draw 31's rates are not two numbers from 0/.test(x)));
    const R = V.reading(good), lines = V.readingLines(R).join("\n");
    ok("!! P IS A SIGN TEST AGAINST NEVER FLEEING (0.6348), T1 A RANK SUM AGAINST FSHUF, H A SIGN TEST AGAINST THE HAND FLOOR: flies that learn (0.69 or so) -> P BETTER, 12 above, p 2^-11; FIBRE a hair above FSHUF on every draw -> T1 BETTER (ranks 222); all below 0.7276 -> H WORSE",
        R.P.word === V.WORDS.P[0] && R.P.above === 12 && R.P.ref === 0.6348 && R.P.p === 2 ** -11 && R.T1.word === V.WORDS.T1[0] && R.T1.sumA === 222 && R.H.word === V.WORDS.H[1] && R.H.below === 12 && R.H.ref === 0.7276 &&
        /P \(FIBRE against never fleeing\): of 12, 12 above its 0\.6348/.test(lines) && /T1 \(FIBRE against FSHUF\): FIBRE's ranks sum to 222/.test(lines) && /H \(FIBRE against the habituating reflex\): of 12, 0 above its 0\.7276, 12 below/.test(lines));
    const flat = V.reading(file((arm, s) => (arm === "FIBRE" ? rec(arm, s, 1, 0.2696) : learnt(arm, s))));
    ok("!! FIBRE flies that all score never fleeing's 0.6348 exactly (decoy 1, ordinary 0.2696) are 12 ties: P CANNOT BE TOLD APART; and below FSHUF on every draw, T1 WORSE (ranks 78); they never flee 12 of 12 and ACROSS 0",
        near(flat.arms.FIBRE.mean, 0.6348, 1e-12) && (100 + 0.2696 * 100) / 200 === 0.6348 && flat.P.ties === 12 && flat.P.word === V.WORDS.P[2] && flat.T1.sumA === 78 && flat.T1.word === V.WORDS.T1[1] && flat.arms.FIBRE.neverFlee === 12 && flat.arms.FIBRE.across === 0);
    ok("ACROSS and never fleeing are counted: the learning file 12 of 12 ACROSS and 0 never flee in each arm", R.arms.FIBRE.across === 12 && R.arms.FSHUF.across === 12 && R.arms.FIBRE.neverFlee === 0 && /ACROSS 12 of 12/.test(lines));
    const R2 = V.reading(good.filter((r) => r.kind !== "floors"));
    ok("with no floors no test is made, and every draw's rates-at-0 check fails with it", R2.P === null && R2.T1 === null && R2.H === null && /^A CHECK FAILED/.test(V.readingLines(R2)[0]) && R2.checks.some((x) => /the floors are not there once/.test(x)) && R2.checks.filter((x) => /is not the reflex's/.test(x)).length === 24);
    const off = good.map((r) => (r.kind === "floors" ? { ...r, untrained: { ...r.untrained, FSHUF: 0.61 } } : r));
    ok("an untrained fly that is not the reflex is said by name and nothing is weighed", J(V.checkRecords(off)) === J(["the untrained FSHUF fly does not score the reflex's number: the start is not the reflex"]) && V.reading(off).P === null);
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "COACT", "25"], ["job", "FIBRE", "x"], ["job", "FIBRE", "24"], ["job", "FIBRE", "37"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for one of the two arms and draws 25 to 36 -- and nothing else", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FSHUF", "36"])) === J({ cmd: "job", arm: "FSHUF", s: 36 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeFibreOnly.mjs");
    ok("!! the command is this round's -- its library and results file, not round 10's -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, and trains THE LEAD ARM'S FIRST DRAW a second time (FIBRE, draw 25)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeFibreOnly\.mjs"/.test(csrc) && !/Coact|Habituate|Vision|voxelHome/.test(csrc) && /if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s\]\)/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeFibreOnly\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyEscapeFibreOnly-selfcheck.mjs"), calls = [...me.matchAll(/V\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one training through the round's code is of 2 iterations with 4 flies tried on draw 901; it starts no process; the file's size and time are what they were before this section",
        calls.length === 1 && calls.every((c) => /^"FIBRE", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 4 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} training, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyEscapeFibreOnly-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
