// WebGLEngine/tools/ship/flyEscapeCoact-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyEscapeCoact-selfcheck.mjs      (under a minute; IT NEVER RUNS THE ROUND -- its trainings are tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE ESCAPE ROUND 10 (registered in brain/FLY_ESCAPE_COACT_WIP.md before brain/rl/coactReflex.mjs, tools/ship/flyEscapeCoact.mjs and tools/ship/takeFlyEscapeCoact.mjs existed):
// does a fly whose escape runs through fibres whose inputs weaken with co-activity beat one whose cannot, in lives that are decoy or ordinary?
//   1  THE FLY                  brain/rl/coactReflex.mjs: at rates 0 it is round 9's FROZEN fly to the bit; the rule, by hand; it fires only above the line, the line taken before the change; what weakens
//   2  THE ROUND'S NUMBERS      the recipe, draws, arms, weights and audit; FROZEN is round 9's; USES and ACROSS as registered, and the floors that pass and fail them
//   3  ONE TRAINING             a record's weights are the trainer's from a policy made here by hand; its score with the rates at 0
//   4  THE RECORDS              36 draws; P, T1, H; USES and ACROSS counted
//   5  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-17) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a
// process) run whole for each; every one red by name (the number is the rows red over the two):
//   THE FLY (brain/rl/coactReflex.mjs): K1 the weakening needs no firing (activity alone, round 9's) 1 | K2 the line is not asked 2 | K3 a life does not start afresh 1 | K4 no recovery 2
//   K5 the output layer is not zeroed 2 | K6 every connection weakens 1 | K7 a negative weight is a rate 1 | K8 the weights are not restored 1 | K9 the weakening uses the target's activity 1
//   K10 the line is 0.3 3
//   THE ROUND (tools/ship/flyEscapeCoact.mjs): F1 COACT is the FROZEN fly 7 | F2 CSHUF is the real wiring 3 | F3 P against CSHUF and T1 against FROZEN 1 | F4 USES at 0.02 1 | F5 USES counts a fall
//   of exactly 0.01 1 | F6 ACROSS needs more than 0.1 1 | F7 the rates-at-0 fly keeps its rates 1 | F8 the draws are 1 to 12 3 | F9 the recipe is 100 iterations 3 | F10 the rank tests' BETTER and
//   WORSE swapped 2 | F11 a FROZEN record's rates-at-0 score is not checked 1 | F12 H against the reflex 1 | F13 the round writes round 9's file 1 | F14 tests made with a failed check 2 | F15 never fleeing is under 0.3 1 | F16 the floors' untrained flies
//   are round 9's arms 1 (F15 and F16 were run after a row naming the round's last unnamed exports was added for tools/ship/definitionGates-selfcheck.mjs)
//   THE COMMAND: C1 the second training is of draw 14 1 | C2 exits 0 on a word it does not know 1 | C3 reads round 9's library 1.  THE NOTE: N1 the note's line is 0.3 1 | N2 its draws are 1 to 12 1
//   THREE WENT 0 RED AT FIRST AND WERE FINDINGS: K8 (no row asked that acting leaves the weights as they were), F5 and F6 (no fixture sat exactly on the USES or the ACROSS line; 0.012 - 0.002 and
//   0.101 - 0.001 are the lines exactly in doubles). A row was added for each and they were run again: 1, 1 and 1.
//   Four rows of mine were wrong when written and were corrected: the connections onto the fibres are edges [to, from], so the count is of e[0] (I had read e[1] and counted 9, not 42); the rule by
//   hand used a = 0.15 exactly where the 32-bit weight 0.3 gives 0.15000000596; and two fixtures sat on their lines in doubles (0.7 - 0.69 is above 0.01, 0.6 - 0.5 is under 0.1).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as V from "./flyEscapeCoact.mjs";
import * as R9 from "./flyEscapeHabituate.mjs";
import * as V5 from "./flyEscapeVision.mjs";
import * as PF from "./paintingFly.mjs";
import * as L from "../../brain/rl/lifeEnv.mjs";
import * as CR from "../../brain/rl/coactReflex.mjs";
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
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: L.LIFE_STEPS, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, fresh: true, battery: 4 }), TINY_AUDIT = [880001, 880002, 880003, 880004];
const net = (edges, s) => new M.MaskedCircuitPolicy({ obsDim: 13, units: 42, inputs: V5.VISUAL_INPUTS.map((e) => [...e]), edges, outputs: [...T.GF], edgeStart: [...V5.EDGE_START], seed: s });
const REAL = () => T.EDGES.map((e) => [e[0], e[1]]);
const lifeActs = (fly, seed) => { const env = new L.LifeEnv(); let o = env.reset(seed), done = false; const acts = []; while (!done) { const a = fly.act(o); acts.push(a[0]); const r = env.step(a); o = r.obs; done = r.done; } return { acts, ret: env.ret }; };
const withRates = (fly, pa, pb) => { const w = fly.getParams(); w[0] = pa; w[1] = pb; return fly.setParams(w); };

console.log("flyEscapeCoact-selfcheck -- the escape round 10 (the escape through fibres whose inputs weaken with co-activity): the fly, the numbers, one training, the records, the command\n");

console.log("1. THE FLY (brain/rl/coactReflex.mjs)");
section(() => {
    let same = true, n = 0;
    for (const [s, edges] of [[13, REAL()], [14, P.shuffledEdges(42, T.EDGES.length, V5.SHUFFLE_SEED + 14)]]) {
        const c = new CR.CoactReflex(net(edges, s), { rule: E.RULES.reflex, tail: T.GF.length + 1 }), r = new RS.ReflexStart(net(edges, s), { rule: E.RULES.reflex, tail: T.GF.length + 1 });
        const w = PF.unpackWeights(PF.packWeights(Float32Array.from({ length: r.paramCount() }, (_, k) => Math.sin(k * 1.7 + s) * 0.3)));
        r.setParams(w); const cw = new Float32Array(w.length + 2); cw.set(w, 2); c.setParams(cw);
        for (const seed of [900001, 907920, 915839]) { const a = lifeActs(c, seed), b = lifeActs(r, seed); same = same && J(a.acts) === J(b.acts) && a.ret === b.ret; n += a.acts.length; }
    }
    ok("!! *** AT RATES 0 THE FLY IS ROUND 9'S FROZEN FLY, TO THE BIT *** -- the reflex wrapper round the same network, with weights that are not zero (its output layer too), on the real wiring and a shuffle: every action of three whole lives each, and their returns", same, `${n} actions`);
    const c = V.policyOf("COACT", 13), f = V.policyOf("FROZEN", 13);
    ok("the untrained COACT fly is the untrained FROZEN fly: its weights are FROZEN's with two zeros first, and its output layer is zero", c instanceof CR.CoactReflex && f instanceof RS.ReflexStart && J(Array.from(c.getParams().subarray(2))) === J(Array.from(f.getParams())) && c.getParams()[0] === 0 && c.getParams()[1] === 0 && c.inner.getParams().subarray(-3).every((v) => v === 0));
    const read = new Set(T.GF), onto = T.EDGES.filter((e) => read.has(e[0])).length, sh = V.policyOf("CSHUF", 13), shOnto = P.shuffledEdges(42, T.EDGES.length, V5.SHUFFLE_SEED + 13).filter((e) => read.has(e[0])).length;
    ok("WHAT WEAKENS: the connections onto the two Giant Fibers and no other -- 42 on the real wiring, and on a shuffle the ones the shuffle puts there", c.plastic.length === onto && onto === 42 && sh.plastic.length === shOnto && [...c.plastic].every((k) => read.has(c.inner.to[k])), `real ${onto}, CSHUF draw 13 ${shOnto}`);
    // the rule, written again here: the line before the change, fired, then g <- g - a g |h| [fired] + b (1 - g), clamped
    const fly = withRates(V.policyOf("COACT", 13), 0.3, 0.4), env = new L.LifeEnv(); let o = env.reset(900001), g = new Float64Array(fly.plastic.length).fill(1), agree = true, firedSome = 0, notSome = 0;
    for (let t = 0; t < 640 && agree; t++) {
        if (o[L.CLOCK] === 0) g.fill(1);
        const m = g.reduce((s, v) => s + v, 0) / g.length, a = fly.act(o), want = E.RULES.reflex(o)[0] > 0 && m > 0.5, h = fly.inner._h, from = fly.inner.from, A = 0.5 * Math.fround(0.3), B = 0.01 * Math.fround(0.4);
        if (want) firedSome++; else notSome++;
        g = g.map((v, i) => Math.min(1, Math.max(0, v - (want ? A * v * Math.abs(h[from[fly.plastic[i]]]) : 0) + B * (1 - v))));
        agree = fly.fired === want && g.every((v, i) => Math.abs(v - fly.g[i]) < 1e-12);
        const r = env.step(a); o = r.obs; if (r.done) break;
    }
    ok("!! *** THE RULE, BY HAND, TICK BY TICK *** (rates p 0.3 and 0.4 as the 32-bit weights hold them, so a 0.15 and b 0.004, a whole life): the fly fires exactly when the reflex says flee and the mean efficacy taken BEFORE the tick is above 0.5, and every efficacy is g - a g |h| [fired] + b (1 - g), held to 0..1, to 1e-12",
        agree && firedSome > 5 && notSome > 5, `fired ${firedSome}, not ${notSome}`);
    const kept = withRates(V.policyOf("COACT", 13), 0.3, 0.4), before = J(Array.from(kept.getParams())), env2 = new L.LifeEnv(); let o2 = env2.reset(900001), lowest = 1;
    for (let t = 0; t < 640; t++) { const r = env2.step(kept.act(o2)); lowest = Math.min(lowest, kept.mean()); o2 = r.obs; if (r.done) break; }
    ok("!! ACTING LEAVES THE WEIGHTS AS THEY WERE (sabotage K8 first went 0 red, and this row is its answer): a whole life with the efficacies falling to under 0.6, and the fly's weights after it are its weights before, to the bit", J(Array.from(kept.getParams())) === before && lowest < 0.6, `lowest mean efficacy ${lowest.toFixed(3)}`);
    const flee = new Float32Array(13); flee[0] = 1; flee[2] = 0.3; flee[9] = 1; flee[L.CLOCK] = 0.1;
    const z = withRates(V.policyOf("COACT", 13), 2, 0); z.g.fill(0.4); const below = z.act(flee)[0]; z.g.fill(0.6); const above = z.act(flee)[0];
    const y = withRates(V.policyOf("COACT", 13), 2, 0); y.g.fill(0.501); y.act(flee); const firedAt = y.fired, after = y.mean();
    ok("!! IT FIRES ONLY ABOVE THE LINE, AND THE LINE IS TAKEN BEFORE THE CHANGE: told to flee with every efficacy at 0.4 it does not fire (-0.5), at 0.6 it does (+0.5); at 0.501 with a strong rate it fires that tick though the tick takes it under 0.5",
        E.RULES.reflex(flee)[0] > 0 && below === -0.5 && above === 0.5 && firedAt && after < 0.5, `${below} ${above}, after ${after.toFixed(3)}`);
    const q = withRates(V.policyOf("COACT", 13), 2, 0); q.g.fill(0.7); const quiet = new Float32Array(13); quiet[L.CLOCK] = 0.1; q.act(quiet);
    const q2 = withRates(V.policyOf("COACT", 13), 2, 50); q2.g.fill(0.7); q2.act(quiet);
    ok("!! NOTHING WEAKENS WHILE THE FIBRE DOES NOT FIRE (co-activity, not activity): told nothing, with a strong depression rate and no recovery every efficacy stays 0.7; with recovery b 0.5 it goes halfway back to 1 (0.85)", !q.fired && q.g.every((v) => v === 0.7) && q2.g.every((v) => near(v, 0.85, 1e-12)));
    const s0 = withRates(V.policyOf("COACT", 13), 2, 0); s0.g.fill(0.2); const start = new Float32Array(13); start[0] = 1; start[2] = 0.3; start[9] = 1; start[L.CLOCK] = 0; s0.act(start);
    ok("a life starts afresh: at the clock's 0 every efficacy is 1 again before the line is taken, so the fly fires", s0.fired);
    ok("the rates: a = 0.5 max(0, p_a), b = 0.01 max(0, p_b) -- negative weights are no rate; a network that is not a MaskedCircuitPolicy, a missing rule, a clock outside the observation and a wrong weight count are refused",
        J(withRates(V.policyOf("COACT", 13), -1, -1).rates()) === J({ a: 0, b: 0 }) && J(withRates(V.policyOf("COACT", 13), 0.5, 0.25).rates()) === J({ a: 0.25, b: 0.0025 }) && CR.A_SCALE === 0.5 && CR.B_SCALE === 0.01 && CR.THETA === 0.5 && CR.GAIN === RS.GAIN &&
        throws(() => new CR.CoactReflex({}, { rule: E.RULES.reflex, tail: 3 }), /MaskedCircuitPolicy/) && throws(() => new CR.CoactReflex(net(REAL(), 1), { tail: 3 }), /rule/) && throws(() => new CR.CoactReflex(net(REAL(), 1), { rule: E.RULES.reflex, tail: 3, clock: 13 }), /clock/) && throws(() => V.policyOf("COACT", 13).setParams(new Float32Array(454)), /456 weights/));
    const note = src("brain/FLY_ESCAPE_COACT_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same of the fly: the line 0.5 on the mean efficacy taken BEFORE the tick's change, the co-activity rule g - a g |h| [fired] + b (1 - g), the rates' scales, and at rates 0 round 9's FROZEN fly to the bit",
        /m, the mean efficacy over those connections, is taken BEFORE the tick's change/.test(note) && /above \*\*0\.5\*\*/.test(note) && /g <- g - a g \|h\| \[fired\] \+ b \(1 - g\)/.test(note) && /a = 0\.5 max\(0, p_a\), b = 0\.01 max\(0, p_b\)/.test(note) && /With both rates at 0 the fly is round 9's FROZEN fly to the bit/.test(note));
});

console.log("\n2. THE ROUND'S NUMBERS (tools/ship/flyEscapeCoact.mjs)");
section(() => {
    ok("!! the recipe, the audit and the life are round 9's (150 iterations, 96 flies tried, sigma 0.14, lr 0.05, fresh lives, a battery of 200, 640 ticks; 200 lives 900001 + 7919 k); the draws 13 to 24, new; the arms FROZEN, COACT, CSHUF, the lead COACT",
        V.RECIPE === R9.RECIPE && J(V.RECIPE) === J({ ...R9.RECIPE }) && V.RECIPE.iters === 150 && V.RECIPE.pop === 96 && V.RECIPE.battery === 200 && V.RECIPE.maxSteps === 640 && V.AUDIT === R9.AUDIT && V.AUDIT.length === 200 && V.AUDIT[1] === 907920 &&
        J(V.SEEDS) === J([13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]) && V.SEEDS.every((s) => !R9.SEEDS.includes(s)) && J(V.ARMS) === J(["FROZEN", "COACT", "CSHUF"]) && V.LEAD === "COACT" && V.RESULTS === "brain/flyEscapeCoactRound.jsonl" && V.RESULTS !== R9.RESULTS);
    const f = V.policyOf("FROZEN", 17), g = R9.policyOf("FROZEN", 17);
    ok("!! FROZEN IS ROUND 9'S FROZEN FLY, its code unchanged (the same class, weights and wiring); the weights 454, 456, 456; CSHUF's wiring is round 5's free shuffle of the draw, COACT's the real",
        f.constructor === g.constructor && J(Array.from(f.getParams())) === J(Array.from(g.getParams())) && J(V.WEIGHTS) === J({ FROZEN: 454, COACT: 456, CSHUF: 456 }) && V.policyOf("COACT", 17).paramCount() === 456 && V.policyOf("CSHUF", 17).paramCount() === 456 &&
        PF.hashEdges(V.circuitOf("CSHUF", 17).edges) === PF.hashEdges(P.shuffledEdges(42, 369, 7017)) && PF.hashEdges(V.circuitOf("COACT", 17).edges) === PF.hashEdges(REAL()) && throws(() => V.circuitOf("HAB", 1), /no arm HAB/) && throws(() => V.policyOf("COACT", 0), /whole number from 1/));
    const few = V.AUDIT.slice(0, 6), fl6 = V.floors(few), fl9 = R9.floors(few);
    ok("the round's other numbers are round 9's: a fly never flees under an ordinary-life score of 0.35 (V.NEVER_FLEES), the tests are at alpha 0.01 (V.ALPHA), the fly's clock is the observation's number 10 (CR.CLOCK, lifeEnv's own) -- and V.floors is round 9's floors with this round's three untrained flies, each the reflex",
        V.NEVER_FLEES === 0.35 && V.NEVER_FLEES === R9.NEVER_FLEES && V.ALPHA === 0.01 && CR.CLOCK === 10 && CR.CLOCK === L.CLOCK && ["reflex", "freeze", "hand", "told"].every((k) => J(fl6[k]) === J(fl9[k])) && J(Object.keys(fl6.untrained)) === J(V.ARMS) && V.ARMS.every((a) => fl6.untrained[a] === fl6.reflex.score));
    const ep = (d) => ({ decoy: d, ordinary: [0.6, 0.6, 0.6, 0.6] });
    ok("!! USES AND ACROSS ARE THE REGISTRATION'S: USES is the score less the score with the rates at 0 ABOVE 0.01 (a FROZEN fly does not use what it has not got); ACROSS a decoy-life fourth episode at least 0.1 above the first -- a fall of exactly 0.01 is not USES and a rise of exactly 0.1 is ACROSS (sabotages F5 and F6 first went 0 red with no fixture on either line, and these are their answer)",
        V.USES_BY === 0.01 && V.ACROSS_BY === 0.1 && V.uses({ score: 0.7, ratesOff: 0.68 }) && !V.uses({ score: 0.7, ratesOff: 0.695 }) && !V.uses({ score: 0.7, ratesOff: null }) && 0.012 - 0.002 === 0.01 && !V.uses({ score: 0.012, ratesOff: 0.002 }) && 0.101 - 0.001 === 0.1 && V.across({ ep: ep([0.001, 0, 0, 0.101]) }) && V.across({ ep: ep([0.5, 0, 0, 0.61]) }) && !V.across({ ep: ep([0.5, 0, 0, 0.59]) }));
    const fl = { reflex: V.auditScore(() => E.RULES.reflex, V.AUDIT.slice(0, 60)), freeze: V.auditScore(() => E.RULES.freeze, V.AUDIT.slice(0, 60)), hand: V.auditScore(L.handFly, V.AUDIT.slice(0, 60)) };
    ok("!! ACROSS IS A COUNT THE PLAIN REFLEX FAILS (round 9's learn count was not): on the first 60 audit lives the reflex and never fleeing fail it, and the hand habituating reflex passes it", !V.across(fl.reflex) && !V.across(fl.freeze) && V.across(fl.hand) && R9.learns(fl.reflex),
        `the 4th episode less the 1st: reflex ${(fl.reflex.ep.decoy[3] - fl.reflex.ep.decoy[0]).toFixed(3)}, hand ${(fl.hand.ep.decoy[3] - fl.hand.ep.decoy[0]).toFixed(3)}`);
    const note = src("brain/FLY_ESCAPE_COACT_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same of the round: draws 13 to 24, the arms and their weights, round 9's recipe and audit, the three readings at alpha 0.01, and USES above 0.01, ACROSS at least 0.1",
        /\*\*draws 13 to 24\*\*/.test(note) && /\| \*\*FROZEN\*\* \| round 9's FROZEN, its code unchanged \| 454 \|/.test(note) && /\| \*\*COACT\*\* \|[^|]*\| 456 \|/.test(note) && /\| \*\*CSHUF\*\* \|[^|]*\| 456 \|/.test(note) && /The recipe and the audit are round 9's/.test(note) &&
        /\*\*P: COACT against FROZEN\*\*/.test(note) && /\*\*T1: COACT against CSHUF\*\*/.test(note) && /\*\*H: COACT against the hand habituating reflex\*\*/.test(note) && /is above \*\*0\.01\*\*/.test(note) && /is at least \*\*0\.1\*\*/.test(note));
});

console.log("\n3. ONE TRAINING (2 iterations, 4 flies tried, 2 lives each, a battery of 4, on draw 901)");
section(() => {
    const r = V.trainOne("COACT", 901, TINY, TINY_AUDIT), f = V.trainOne("FROZEN", 901, TINY, TINY_AUDIT);
    const byHand = trainDockES({ envFactory: () => new L.LifeEnv(), obsDim: 13, actDim: 1, maxSteps: 640, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 2, seed: 901, freshEpisodes: true, batteryEps: 4,
        policyFactory: () => new CR.CoactReflex(net(REAL(), 901), { rule: E.RULES.reflex, tail: 3 }) });
    ok("!! A COACT RECORD'S WEIGHTS ARE THE TRAINER'S FROM A POLICY MADE HERE BY HAND (the co-activity fly round the real network; lives; fresh lives; the recipe's battery), to the hash; it carries its rates, its score with them at 0 and its wiring; FROZEN's has neither",
        PF.hashWeights(byHand.params) === r.weightsHash && r.weightCount === 456 && f.weightCount === 454 && r.rates && Number.isFinite(r.rates.a) && Number.isFinite(r.ratesOff) && f.rates === null && f.ratesOff === null && r.edgesHash === PF.hashEdges(REAL()) && J(r.recipe) === J(TINY));
    const w = PF.unpackWeights(r.weights), p = V.policyOf("COACT", 901).setParams(w), a = V.auditScore(() => (o) => p.act(o), TINY_AUDIT), off = V.ratesOff("COACT", 901, w), b = V.auditScore(() => (o) => off.act(o), TINY_AUDIT);
    ok("the tiny training's weights give its score again, life by life; its score with the rates at 0 is that of the same weights with the first two set to 0 and nothing else changed",
        a.score === r.score && J(a.ep) === J(r.ep) && b.score === r.ratesOff && J(Array.from(off.getParams().subarray(2))) === J(Array.from(w.subarray(2))) && off.getParams()[0] === 0 && off.getParams()[1] === 0 && throws(() => V.ratesOff("FROZEN", 901, w), /no rates/), `${r.score.toFixed(4)}, rates at 0 ${r.ratesOff.toFixed(4)}`);
});

console.log("\n4. THE RECORDS");
section(() => {
    const hist = Array.from({ length: 7 }, (_, k) => ({ it: [0, 25, 50, 75, 100, 125, 149][k], ret: 0.6 + k / 100 })), made = new Map();
    const stub = (arm, s) => { const k = arm + s; if (!made.has(k)) { const w = V.policyOf(arm, s).getParams(), c = V.circuitOf(arm, s); made.set(k, { units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w) }); } return made.get(k); };
    const rec = (arm, s, decoy, ordinary, ep1 = decoy, ep4 = decoy, off = 0.6057) => ({ kind: "draw", arm, s, recipe: { ...V.RECIPE }, ...stub(arm, s), rates: arm === "FROZEN" ? null : { a: 0.2, b: 0 }, ratesOff: arm === "FROZEN" ? null : off, score: (decoy * 100 + ordinary * 100) / 200, decoy, ordinary, nDecoy: 100, ep: { decoy: [ep1, decoy, decoy, ep4], ordinary: [ordinary, ordinary, ordinary, ordinary] }, caught: 10, history: hist });
    const flo = () => { const x = (s) => ({ score: s, decoy: s, ordinary: s, nDecoy: 100, ep: { decoy: [s, s, s, s], ordinary: [s, s, s, s] }, caught: 0 }); return { kind: "floors", reflex: x(0.6057), freeze: x(0.6348), hand: x(0.7276), told: x(0.8137), untrained: { FROZEN: 0.6057, COACT: 0.6057, CSHUF: 0.6057 } }; };
    const file = (f, first = 13) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(f(arm, s)); out.push({ kind: "recheck", arm: "COACT", s: first, weightsHash: out.find((r) => r.arm === "COACT" && r.s === first).weightsHash }, flo()); return out; };
    const learnt = (arm, s) => (arm === "FROZEN" ? rec(arm, s, 1, 0.27 + s / 1e4) : rec(arm, s, 0.85 + s / 1e4, 0.52 + (arm === "COACT" ? 0.01 : 0), 0.58, 1)), good = file(learnt);
    ok("!! a file of 36 draws with COACT draw 13 a second time passes every check and its first line says 36; a draw missing, a FROZEN draw with a rates-at-0 score, a COACT draw without one, a COACT draw with CSHUF's wiring, a draw of round 9's, and a second training of draw 14 each fail by name",
        V.checkRecords(good).length === 0 && good.length === 38 && /^the checks hold: 36 draws/.test(V.readingLines(V.reading(good))[0]) &&
        V.checkRecords(good.filter((r) => !(r.arm === "CSHUF" && r.s === 24))).some((x) => /CSHUF draw 24 is there 0 times/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "FROZEN" && r.s === 15 ? { ...r, ratesOff: 0.6 } : r))).some((x) => /FROZEN draw 15 has no score with its rates at 0 \(or has one and is FROZEN\)/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "COACT" && r.s === 16 ? { ...r, ratesOff: null } : r))).some((x) => /COACT draw 16 has no score with its rates at 0/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "COACT" && r.s === 17 ? { ...r, edgesHash: stub("CSHUF", 17).edgesHash } : r))).some((x) => /COACT draw 17's wiring is not its arm's/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "COACT" && r.s === 18 ? { ...r, s: 1 } : r))).some((x) => /COACT draw 1 is not a registered draw/.test(x)) &&
        J(V.checkRecords(file(learnt, 14))) === J(["COACT draw 13 trained a second time is not there once with the same weights"]), V.checkRecords(good).slice(0, 2).join(" | "));
    const R = V.reading(good), lines = V.readingLines(R).join("\n");
    ok("!! P IS COACT AGAINST FROZEN, T1 COACT AGAINST CSHUF, H COACT AGAINST THE HAND FLOOR: COACT flies that learn (0.69 or so) above FROZEN flies that never flee (0.635) -> P BETTER (ranks 222); COACT a hair above CSHUF on every draw -> T1 BETTER; COACT all below the hand floor's 0.7276 -> H WORSE",
        R.P.word === V.WORDS.P[0] && R.P.sumA === 222 && R.T1.word === V.WORDS.T1[0] && R.H.word === V.WORDS.H[1] && R.H.below === 12 && R.H.ref === 0.7276 && /P \(COACT against FROZEN\): COACT's ranks sum to 222/.test(lines) && /H \(COACT against the habituating reflex\): of 12, 0 above its 0\.7276, 12 below/.test(lines));
    const split = V.reading(file((arm, s) => (arm === "FROZEN" ? rec(arm, s, 1, 0.27 + s / 1e4) : arm === "COACT" ? rec(arm, s, 0.85 + s / 1e4, 0.52, 0.58, 1) : rec(arm, s, 0.9 + s / 1e4, 0.56, 0.58, 1))));
    ok("!! P IS AGAINST FROZEN AND T1 AGAINST CSHUF, NOT THE OTHER WAY: COACT above every FROZEN fly and below every CSHUF fly -> P BETTER (ranks 222) and T1 WORSE (ranks 78)", split.P.sumA === 222 && split.P.word === V.WORDS.P[0] && split.T1.sumA === 78 && split.T1.word === V.WORDS.T1[1]);
    ok("!! USES, ACROSS AND NEVER FLEEING ARE COUNTED AS REGISTERED: COACT 12 of 12 USES (0.69 against 0.6057 with its rates at 0) and ACROSS (0.58 to 1.00), FROZEN 12 of 12 never flee and has no USES; the lines say so",
        R.arms.COACT.uses === 12 && R.arms.COACT.across === 12 && R.arms.FROZEN.neverFlee === 12 && R.arms.FROZEN.uses === 0 && R.arms.FROZEN.ratesOff === null && near(R.arms.COACT.ratesOff, 0.6057, 1e-9) && /USES 12 of 12, ACROSS 12 of 12/.test(lines) && /never flee 12 of 12\n/.test(lines + "\n"));
    const lean = V.reading(file((arm, s) => (arm === "FROZEN" ? rec(arm, s, 1, 0.27) : rec(arm, s, 0.85 + s / 1e4, 0.52, 0.58, 1, (0.85 + s / 1e4 + 0.52) / 2 - 0.005))));
    ok("a fly whose score falls by less than 0.01 with its rates at 0 does not USE them (0.005 under is not enough)", lean.arms.COACT.uses === 0 && lean.arms.COACT.across === 12);
    const off = good.map((r) => (r.kind === "floors" ? { ...r, untrained: { ...r.untrained, COACT: 0.61 } } : r));
    ok("!! AN UNTRAINED FLY THAT IS NOT THE REFLEX IS SAID BY NAME AND NOTHING IS WEIGHED: floors whose untrained COACT fly scores 0.61 against the reflex's 0.6057", J(V.checkRecords(off)) === J(["the untrained COACT fly does not score the reflex's number: the start is not the reflex"]) && V.reading(off).P === null);
    const tie = V.reading(file((arm, s) => rec(arm, s, 1, 0.27 + ((s * 7 + arm.length) % 12) / 1e4)));
    ok("arms that all never flee cannot be told apart: P and T1 CANNOT BE TOLD APART", tie.P.word === V.WORDS.P[2] && tie.T1.word === V.WORDS.T1[2] && tie.arms.COACT.neverFlee === 12);
    const R2 = V.reading(good.filter((r) => r.kind !== "floors"));
    ok("with a failed check no test is made: a file with no floors has P, T1 and H null and says a check failed first", R2.P === null && R2.T1 === null && R2.H === null && /^A CHECK FAILED/.test(V.readingLines(R2)[0]) && R2.checks.some((x) => /the floors are not there once/.test(x)));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "HAB", "13"], ["job", "COACT", "x"], ["job", "COACT", "12"], ["job", "COACT", "25"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for one of the three arms and draws 13 to 24 -- and nothing else", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "CSHUF", "24"])) === J({ cmd: "job", arm: "CSHUF", s: 24 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyEscapeCoact.mjs");
    ok("!! the command is this round's -- its library and results file, not round 9's -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, and trains THE LEAD ARM'S FIRST DRAW a second time (COACT, draw 13)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyEscapeCoact\.mjs"/.test(csrc) && !/Habituate|Fibres|Split|Degree|Vision|voxelHome/.test(csrc) && /if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s\]\)/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyEscapeCoact\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyEscapeCoact-selfcheck.mjs"), calls = [...me.matchAll(/V\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its two trainings through the round's code are of 2 iterations with 4 flies tried on draw 901; this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 2 && calls.every((c) => /^"(COACT|FROZEN)", 901, TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 4 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyEscapeCoact-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
