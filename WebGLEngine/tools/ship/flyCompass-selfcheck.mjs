// WebGLEngine/tools/ship/flyCompass-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyCompass-selfcheck.mjs      (about a minute; IT NEVER RUNS THE ROUND -- its training is tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE COMPASS ROUND (registered in brain/FLY_COMPASS_LEARNS_WIP.md before brain/compassRingTopology.mjs, brain/rl/compassEnv.mjs, brain/rl/compassFly.mjs, tools/ship/flyCompass.mjs and
// tools/ship/takeFlyCompass.mjs existed): does a fly whose ring-to-compass connections weaken with co-activity hold its course in the wind better than one that steers by its turns alone?
//   1  THE DATA AND THE TASK    the topology is the vendored file's, baked; the life by hand: the goals, the calm, the gusts, the reward, the ring neurons' activity
//   2  THE FLY                  the rule by hand, tick by tick; the angles; the start; a frozen fly has no plasticity; a life starts afresh
//   3  THE ROUND'S NUMBERS      the recipe, draws, arms, weights, audit; the shuffle; the floors; the registration says the same
//   4  ONE TRAINING             a record's weights are the trainer's from a policy made here by hand; its scores again
//   5  THE RECORDS              36 draws; P, P2, T1, H; USES
//   6  THE COMMAND              it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-17) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a
// process) run whole for each; every one red by name, NONE 0 red (the number is the rows red over the two):
//   THE TASK (brain/rl/compassEnv.mjs): E1 gusts in the calm 1 | E2 the goal every 40 ticks 2 | E3 the reward from the first tick 1 | E4 the ring neurons' tuning 2 1 | E5 the preferred azimuths from
//   seed 4243 1 | E6 the env does not hold the turn 1.  THE TOPOLOGY: B1 the bake keeps the EPGt 1 | B2 the module edited by hand 2
//   THE FLY (brain/rl/compassFly.mjs): K1 the weakening ignores the bump 1 | K2 recovery toward 1, not w0 1 | K3 a life does not start afresh 1 | K4 the left glomeruli not offset 1 | K5 a frozen fly
//   is plastic 3 | K6 the mean drive not taken away 1 | K7 phi does not move with the turn 1 | K8 the vision scale 1e-4 2
//   THE ROUND (tools/ship/flyCompass.mjs): F1 PSHUF is the real wiring 3 | F2 the shuffle repeats pairs 1 | F3 the draws are 2 to 13 4 | F4 the recipe is 40 iterations 3 | F5 P against the start 2 |
//   F6 P2 against PSHUF 1 | F7 H against vision off 1 | F8 USES needs 0.02 2 | F9 rates at 0 turns vision off too 1 | F10 the told floor is not told 1 | F11 PLASTIC's start is not checked 1 | F12 the
//   round writes round 11's file 1 | F13 alpha is 0.05 1 | F14 the hand fly has recovery 2
//   THE COMMAND: C1 the second training is of draw 2 1 | C2 exits 0 on a word it does not know 1 | C3 reads round 11's library 1.  THE NOTE: N1 its draws are 13 to 24 1 | N2 its rule recovers toward 1 1 |
//   N3 its P is against the start 1 | N4 its gusts from tick 0 1
//   THREE ROWS OF MINE WERE WRONG WHEN FIRST RUN, AND ONE WAS A FINDING ABOUT THE ROUND: the goal changes 30 times in a life, not 29 (the change at tick 1,500 counts); 0.00001 x 3 is 3.0000000000000004e-5
//   in doubles; and THE UNTRAINED PSHUF FLY IS NOT THE START -- with vision on, its map is the shuffle's -- so the records' check that every untrained fly scores the start's number would have failed
//   the run. The start the registration names is the real anatomy's; the check is now of FROZEN's and PLASTIC's untrained flies, and PSHUF's own start is recorded and printed.
//   One more row was added before the sabotages so that tools/ship/definitionGates-selfcheck.mjs sees every new export named: the module's other numbers.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import * as V from "./flyCompass.mjs";
import * as PF from "./paintingFly.mjs";
import * as CT from "../../brain/compassRingTopology.mjs";
import * as CE from "../../brain/rl/compassEnv.mjs";
import * as CF from "../../brain/rl/compassFly.mjs";
import { bake } from "../bakeCompassRingTopology.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail = "") { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), near = (a, b, e = 5e-5) => Math.abs(a - b) < e, TAU = 2 * Math.PI;
const TINY = Object.freeze({ iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, fresh: true, battery: 2 }), TINY_AUDIT = [880001, 880002];

console.log("flyCompass-selfcheck -- the compass round (ring-to-compass connections that weaken with co-activity): the data and the task, the fly, the numbers, one training, the records, the command\n");

console.log("1. THE DATA AND THE TASK (brain/compassRingTopology.mjs, brain/rl/compassEnv.mjs)");
section(() => {
    const bytes = fs.readFileSync(path.join(ENG, "vendor/male-cns/ring-compass-circuit.json"));
    ok("!! THE TOPOLOGY IS THE VENDORED FILE'S, BAKED: brain/compassRingTopology.mjs is what tools/bakeCompassRingTopology.mjs writes from vendor/male-cns/ring-compass-circuit.json today -- 282 ring neurons, 46 core compass neurons, 8,836 connections (the 11 onto the 4 EPGt left out and counted)",
        bake(bytes) === src("brain/compassRingTopology.mjs") && CT.RING_ORDER.length === 282 && CT.EPG_ORDER.length === 46 && CT.EDGES.length === 8836 && CT.SYNAPSES.length === 8836 && J(CT.DROPPED_ONTO_EPGT) === J({ connections: 11, synapses: 68 }) && CT.SYNAPSES.every((n) => n >= 5));
    const sorted = (a) => a.every((x, i) => i === 0 || a[i - 1] < x);
    ok("the module's other numbers are the file's and the registration's: CT.SOURCE_SHA256 the vendored file's sha256, CT.DATASET male-cns:v1.0, CT.MIN_SYNAPSES 5, CT.RING_ORDER and CT.EPG_ORDER in bodyId order, every CT.RING_TYPES a ring neuron's; CE.GOAL_EVERY 50, CE.GUST 0.4; CF.BUMP 3, CF.NE 46; V.SHUFFLE_SEED 7000",
        CT.SOURCE_SHA256 === createHash("sha256").update(bytes).digest("hex") && CT.DATASET === "male-cns:v1.0" && CT.MIN_SYNAPSES === 5 && sorted(CT.RING_ORDER) && sorted(CT.EPG_ORDER) && CT.RING_TYPES.length === 282 && CT.RING_TYPES.every((t) => /^ER\d/.test(t)) &&
        CE.GOAL_EVERY === 50 && CE.GUST === 0.4 && CF.BUMP === 3 && CF.NE === 46 && V.SHUFFLE_SEED === 7000);
    const env = new CE.CompassEnv(); let o = env.reset(900001); const goals = [], gusts = [], early = []; let prevG = env.goal, gustBefore = 0;
    for (let t = 0; t < CE.LIFE_STEPS; t++) { const before = env.th, r = env.step([0.05]); const moved = CE.wrap(env.th - before - 0.05); if (Math.abs(moved) > 1e-12) (t < CE.CALM ? (gustBefore++) : gusts.push(t)); if (env.goal !== prevG) { goals.push(t + 1); prevG = env.goal; } if (t < CE.SCORE_FROM) early.push(r.reward); o = r.obs; }
    ok("!! THE LIFE BY HAND: 1,500 ticks; the goal drawn anew every 50 ticks (30 times, the last at tick 1,500); NO GUST IN THE CALM 500 TICKS and gusts 40 to 79 ticks apart after; no reward before tick 500; the return the mean of cos(heading - goal) over the last 1,000",
        CE.LIFE_STEPS === 1500 && CE.CALM === 500 && CE.SCORE_FROM === 500 && goals.length === 30 && goals.every((t, i) => t === 50 * (i + 1)) && gustBefore === 0 && gusts.length >= 12 && gusts.slice(1).every((t, i) => t - gusts[i] >= 40 && t - gusts[i] <= 79) && early.every((x) => x === 0) && env.t === 1500,
        `${goals.length} goals, ${gusts.length} gusts`);
    const e2 = new CE.CompassEnv(); const o2 = e2.reset(900002); let byHand = true; for (let j = 0; j < CE.NR; j++) { let v = 0; for (const m of e2.marks) v += m.s * Math.exp(3 * (Math.cos(CE.wrap(m.az - e2.th) - CE.PREF[j]) - 1)); byHand = byHand && Math.abs(v - o2[j]) < 1e-12; }
    const pr = CE.stream(4242), pref = Array.from({ length: 282 }, () => pr() * TAU);
    ok("the ring neurons' activity by hand (the sum over two landmarks of strength x exp(3 (cos(azimuth - heading - preferred) - 1))), their preferred azimuths seed 4242's draws, the goal and the clock after them; the landmarks' strengths 0.5 to 1.5",
        byHand && J(pref) === J(CE.PREF) && o2[CE.GOAL] === 0 && o2[CE.CLOCK] === 0 && e2.marks.length === 2 && e2.marks.every((m) => m.s >= 0.5 && m.s < 1.5) && CE.KR === 3 && CE.PREF_SEED === 4242);
    const a = new CE.CompassEnv(), b = new CE.CompassEnv(); a.reset(915839); b.reset(915839); let same = true; for (let t = 0; t < 700; t++) { const x = a.step([0.1 * Math.sin(t)]), y = b.step([0.1 * Math.sin(t)]); same = same && J(Array.from(x.obs)) === J(Array.from(y.obs)) && x.reward === y.reward; }
    const c = new CE.CompassEnv(); c.reset(1); c.step([5]); const big = c.th; c.reset(1); c.step([NaN]);
    ok("a life is its seed's (two runs alike, tick by tick); a turn is held to 0.2 either way, and a number that is not finite is no turn", same && near(big, 0.2, 1e-12) && c.th === 0 && CE.MAX_TURN === 0.2);
});

console.log("\n2. THE FLY (brain/rl/compassFly.mjs)");
section(() => {
    const inst = CT.EPG_INSTANCES, at = (s) => CF.ANGLE[inst.indexOf(inst.find((x) => x.endsWith(s)))];
    ok("the compass neurons' angles: R n at (n - 1) x 45 degrees and L n at (n - 1) x 45 + 22.5 -- R1 0, R3 90, L1 22.5, L8 337.5 -- and every one of the 46 has a glomerulus", near(at("_R1"), 0, 1e-12) && near(at("_R3"), Math.PI / 2, 1e-12) && near(at("_L1"), Math.PI / 8, 1e-12) && near(at("_L8"), 7 * Math.PI / 4 + Math.PI / 8, 1e-12) && CF.ANGLE.length === 46);
    const fly = new CF.CompassFly().setParams([1.3, 0.7, 1.6]), env = new CE.CompassEnv(); let o = env.reset(900001);
    const mean = CF.REAL.reduce((s, e) => s + e[2], 0) / CF.REAL.length, w0 = new Float64Array(46 * 282); for (const [j, k, n] of CF.REAL) w0[k * 282 + j] = n / mean;
    let w = Float64Array.from(w0), phi = 0, agree = true, moved = 0;
    const A = 0.01 * Math.fround(1.3), B = 0.01 * Math.fround(0.7), C = 1e-5 * Math.fround(1.6);
    for (let t = 0; t < 520 && agree; t++) {
        const v = []; for (let k = 0; k < 46; k++) { let s = 0; for (let j = 0; j < 282; j++) s -= w[k * 282 + j] * o[j]; v.push(s); }
        const vm = v.reduce((x, y) => x + y, 0) / 46; let cx = Math.cos(phi), cy = Math.sin(phi); for (let k = 0; k < 46; k++) { cx += C * (v[k] - vm) * Math.cos(CF.ANGLE[k]); cy += C * (v[k] - vm) * Math.sin(CF.ANGLE[k]); }
        phi = Math.atan2(cy, cx);
        for (let k = 0; k < 46; k++) { const bk = Math.exp(3 * (Math.cos(CF.ANGLE[k] - phi) - 1)); for (let j = 0; j < 282; j++) { const q = k * 282 + j; if (w0[q] === 0) continue; w[q] = Math.max(0, w[q] - A * w[q] * o[j] * bk + B * (w0[q] - w[q])); } }
        const u = Math.max(-0.2, Math.min(0.2, -0.5 * Math.sin(phi - o[CE.GOAL]))); phi = CE.wrap(phi + u);
        const got = fly.act(o)[0]; agree = Math.abs(got - u) < 1e-12 && Math.abs(fly.phi - phi) < 1e-12 && w.every((x, q) => Math.abs(x - fly.w[q]) < 1e-12); if (Math.abs(u) > 0.1) moved++;
        o = env.step([got]).obs;
    }
    ok("!! *** THE RULE BY HAND, TICK BY TICK, OVER THE CALM AND INTO THE WIND *** (p 1.3, 0.7, 1.6 as the 32-bit weights hold them; 520 ticks): the visual nudge of phi, every connection's w - a w r B + b (w0 - w) held at 0, the steering and phi moving by it -- to 1e-12",
        agree && moved > 20, `${moved} big turns`);
    const s = new CF.CompassFly();
    ok("!! THE START IS VISION ON, THE ANATOMY'S MAP, NO PLASTICITY: a plastic fly's weights are (0, 0, 1) and a frozen one's (1); a = 0.01 max(0, p_a), b = 0.01 max(0, p_b), c = 0.00001 max(0, p_c); a frozen fly's a and b are 0 whatever its weight; negative weights are no rate",
        J(Array.from(s.getParams())) === J([0, 0, 1]) && J(Array.from(new CF.CompassFly({ plastic: false }).getParams())) === J([1]) && (({ a, b, c }) => a === 0.005 && b === 0.02 && near(c, 3e-5, 1e-18))(new CF.CompassFly().setParams([0.5, 2, 3]).rates()) && J(new CF.CompassFly({ plastic: false }).setParams([2]).rates()) === J({ a: 0, b: 0, c: 2e-5 }) &&
        J(new CF.CompassFly().setParams([-1, -1, -1]).rates()) === J({ a: 0, b: 0, c: 0 }) && CF.A_SCALE === 0.01 && CF.B_SCALE === 0.01 && CF.C_SCALE === 1e-5 && CF.STEER === 0.5 && throws(() => new CF.CompassFly().setParams([1]), /3 weights/) && throws(() => new CF.CompassFly({ edges: [[282, 0, 5]] }), /no connection/));
    const fz = new CF.CompassFly({ plastic: false }), e3 = new CE.CompassEnv(); let o3 = e3.reset(900001); const w00 = Float64Array.from(fz.w); for (let t = 0; t < 300; t++) o3 = e3.step(fz.act(o3)).obs;
    const pl = new CF.CompassFly().setParams([2, 0, 1]), e4 = new CE.CompassEnv(); let o4 = e4.reset(900001); for (let t = 0; t < 300; t++) o4 = e4.step(pl.act(o4)).obs; const changed = pl.w.some((x, q) => x !== pl.w0[q]);
    o4 = e4.reset(907920); pl.act(o4);
    ok("!! a FROZEN fly's connections never change (300 ticks, to the bit); a plastic one's do -- and at a life's start (the clock 0) every connection is w0 again and phi is 0 before the tick", fz.w.every((x, q) => x === w00[q]) && changed && pl.w.every((x, q) => (pl.w0[q] === 0 ? x === 0 : true)) && Math.abs(pl.phi) <= 0.2 + 1e-12 &&
        (() => { const f = new CF.CompassFly().setParams([2, 0, 1]); f.w.fill(0.3); f.phi = 2; const o5 = new CE.CompassEnv().reset(907920); f.act(o5); return Math.abs(CE.wrap(f.phi)) <= 0.2 + 1e-6 && f.w.some((x) => x !== 0.3); })());
    const note = src("brain/FLY_COMPASS_LEARNS_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same of the fly and the task: the nudge e^(i phi) + c sum_k (v_k - mean v) e^(i angle_k), the rule w <- w - a w r_j B_k + b (w0 - w), the steering, the rates' scales and the start; 1,500 ticks, goals every 50, gusts from 500, sd 0.4",
        /e\^\(i phi\) \+ c sum_k \(v_k - mean v\) e\^\(i angle_k\)/.test(note) && /w <- w - a w r_j B_k \+ b \(w0 - w\)/.test(note) && /u = -0\.5 sin\(phi - goal\)/.test(note) && /a = 0\.01 max\(0, p_a\), b = 0\.01 max\(0, p_b\), c = 0\.00001 max\(0, p_c\)/.test(note) && /the start is p = \(0, 0, 1\)/.test(note) &&
        /A life of \*\*1,500 ticks\*\*/.test(note) && /every 50 ticks/.test(note) && /\*\*From tick 500, gusts\*\*/.test(note) && /standard deviation 0\.4 radians/.test(note));
});

console.log("\n3. THE ROUND'S NUMBERS (tools/ship/flyCompass.mjs)");
section(() => {
    ok("!! the recipe (60 iterations, 16 flies tried, sigma 0.14, lr 0.05, 4 fresh lives, a battery of 16), draws 1 to 12, the arms FROZEN, PLASTIC, PSHUF with 1, 3, 3 weights, the lead PLASTIC, 200 audit lives 900001 + 7919 k, alpha 0.01, USES above 0.01, the hand fly (1, 0, 1)",
        J(V.RECIPE) === J({ iters: 60, pop: 16, sigma: 0.14, lr: 0.05, trainEps: 4, fresh: true, battery: 16 }) && J(V.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && J(V.ARMS) === J(["FROZEN", "PLASTIC", "PSHUF"]) && J(V.WEIGHTS) === J({ FROZEN: 1, PLASTIC: 3, PSHUF: 3 }) && V.LEAD === "PLASTIC" &&
        V.AUDIT.length === 200 && V.AUDIT[0] === 900001 && V.AUDIT[1] === 907920 && V.ALPHA === 0.01 && V.USES_BY === 0.01 && J(V.HAND) === J([1, 0, 1]) && V.RESULTS === "brain/flyCompassRound.jsonl" && V.policyOf("FROZEN", 3).paramCount() === 1 && V.policyOf("PSHUF", 3).paramCount() === 3);
    const sh = V.edgesOf("PSHUF", 5), sh2 = V.edgesOf("PSHUF", 6), pairs = new Set(sh.map((e) => e[0] * 46 + e[1])), syn = (E) => J(E.map((e) => e[2]));
    ok("!! THE SHUFFLE: as many connections (8,836), the same synapse counts in the same order, onto ring-compass pairs drawn without repeats, seed 7000 + draw (another draw, another shuffle); the real wiring for FROZEN and PLASTIC",
        sh.length === 8836 && syn(sh) === syn(CF.REAL) && pairs.size === 8836 && sh.every((e) => e[0] >= 0 && e[0] < 282 && e[1] >= 0 && e[1] < 46) && J(sh) === J(V.shuffled(CF.REAL, 7005)) && J(sh) !== J(sh2) && PF.hashEdges(V.edgesOf("PLASTIC", 5)) === PF.hashEdges(CF.REAL.map((e) => [...e])) && J(V.edgesOf("FROZEN", 2)) === J(V.edgesOf("PLASTIC", 9)) &&
        throws(() => V.edgesOf("HAB", 1), /no arm HAB/) && throws(() => V.edgesOf("PLASTIC", 0), /whole number from 1/));
    const few = V.AUDIT.slice(0, 2), fl = V.floors(few), env = new CE.CompassEnv();
    const told = (() => { const f = V.policyOf("FROZEN", 1).setParams([0]); let s = 0; for (const L of few) { let o = env.reset(L), d = false; while (!d) { f.phi = env.th; const r = env.step(f.act(o)); o = r.obs; d = r.done; } s += env.ret; } return s / 2; })();
    ok("the floors are the registered flies: vision off (c 0), the start (1), the rule by hand (1, 0, 1), told the true heading (phi set to it before each tick); the untrained FROZEN and PLASTIC flies are the start, and PSHUF's is not (vision on, the shuffle's map: a check that wanted it the start would have failed the run, and was found here before it)", fl.off === V.auditScore(new CF.CompassFly({ plastic: false }).setParams([0]), few) && fl.start === V.auditScore(new CF.CompassFly({ plastic: false }), few) && fl.hand === V.auditScore(new CF.CompassFly().setParams([1, 0, 1]), few) && fl.told === told && fl.untrained.FROZEN === fl.start && fl.untrained.PLASTIC === fl.start && fl.untrained.PSHUF !== fl.start && fl.untrained.PSHUF === V.auditScore(V.policyOf("PSHUF", 1), few) && fl.told > fl.off);
    const note = src("brain/FLY_COMPASS_LEARNS_WIP.md").replace(/\s+/g, " ");
    ok("the registration says the same of the round: draws 1 to 12, the arms and their weights, the recipe, the audit, P against path integration alone, P2 against FROZEN, T1 against PSHUF, H against the rule by hand, USES above 0.01",
        /\*\*draws 1 to 12\*\*/.test(note) && /\| \*\*FROZEN\*\* \|[^|]*\| 1 \|/.test(note) && /\| \*\*PLASTIC\*\* \|[^|]*\| 3 \|/.test(note) && /\| \*\*PSHUF\*\* \|[^|]*\| 3 \|/.test(note) && /60 iterations, 16 flies tried, sigma 0\.14, lr 0\.05, 4 fresh lives each/.test(note) && /200 lives, 900001 \+ 7919 k/.test(note) &&
        /\*\*P: PLASTIC against path integration alone\*\*/.test(note) && /\*\*P2: PLASTIC against FROZEN\*\*/.test(note) && /\*\*T1: PLASTIC against PSHUF\*\*/.test(note) && /\*\*H: PLASTIC against the plastic fly by hand\*\*/.test(note) && /above \*\*0\.01\*\*/.test(note));
});

console.log("\n4. ONE TRAINING (2 iterations, 4 flies tried, 1 life each, a battery of 2, on draw 901)");
section(() => {
    const r = V.trainOne("PLASTIC", 901, TINY, TINY_AUDIT);
    const byHand = trainDockES({ envFactory: () => new CE.CompassEnv(), obsDim: 284, actDim: 1, maxSteps: 1500, iters: 2, pop: 4, sigma: 0.14, lr: 0.05, trainEps: 1, seed: 901, freshEpisodes: true, batteryEps: 2, policyFactory: () => new CF.CompassFly() });
    ok("!! A PLASTIC RECORD'S WEIGHTS ARE THE TRAINER'S FROM A POLICY MADE HERE BY HAND (the fly on the real wiring; the compass life; fresh lives; the battery), to the hash; it carries its rates, its score with a and b at 0, and its wiring",
        PF.hashWeights(byHand.params) === r.weightsHash && r.weightCount === 3 && r.rates && Number.isFinite(r.rates.c) && Number.isFinite(r.ratesOff) && r.edges === 8836 && r.edgesHash === PF.hashEdges(CF.REAL.map((e) => [...e])) && J(r.recipe) === J(TINY));
    const w = PF.unpackWeights(r.weights), off = V.ratesOff("PLASTIC", 901, w);
    ok("the tiny training's weights give its score again; its score with a and b at 0 is that of the same weights with the first two set to 0 and the third kept; FROZEN has no rates-at-0 fly",
        V.auditScore(V.policyOf("PLASTIC", 901).setParams(w), TINY_AUDIT) === r.score && V.auditScore(off, TINY_AUDIT) === r.ratesOff && off.getParams()[0] === 0 && off.getParams()[1] === 0 && off.getParams()[2] === w[2] && throws(() => V.ratesOff("FROZEN", 901, w), /no rates/), `${r.score.toFixed(4)}, at 0 ${r.ratesOff.toFixed(4)}`);
});

console.log("\n5. THE RECORDS");
section(() => {
    const hist = Array.from({ length: 7 }, (_, k) => ({ it: [0, 10, 20, 30, 40, 50, 59][k], ret: 0.5 + k / 100 })), made = new Map();
    const stub = (arm, s) => { const k = arm + s; if (!made.has(k)) { const w = V.policyOf(arm, s).getParams(), e = V.edgesOf(arm, s); made.set(k, { edges: e.length, edgesHash: PF.hashEdges(e), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w) }); } return made.get(k); };
    const rec = (arm, s, score, off = 0.45) => ({ kind: "draw", arm, s, recipe: { ...V.RECIPE }, ...stub(arm, s), rates: arm === "FROZEN" ? { a: 0, b: 0, c: 3e-6 } : { a: 0.014, b: 0, c: 1.5e-5 }, ratesOff: arm === "FROZEN" ? null : off, score, history: hist });
    const flo = () => ({ kind: "floors", off: 0.5041, start: 0.443, hand: 0.6674, told: 0.9085, untrained: { FROZEN: 0.443, PLASTIC: 0.443, PSHUF: 0.443 } });
    const file = (f, first = 1) => { const out = []; for (const s of V.SEEDS) for (const arm of V.ARMS) out.push(f(arm, s)); out.push({ kind: "recheck", arm: "PLASTIC", s: first, weightsHash: out.find((r) => r.arm === "PLASTIC" && r.s === first).weightsHash }, flo()); return out; };
    const learnt = (arm, s) => rec(arm, s, arm === "FROZEN" ? 0.49 + s / 1e4 : arm === "PLASTIC" ? 0.68 + s / 1e4 : 0.7 + s / 1e4), good = file(learnt), R = V.reading(good), lines = V.readingLines(R).join("\n");
    ok("!! a file of 36 draws with PLASTIC draw 1 a second time passes every check and its first line says 36; a draw missing, a FROZEN draw with plasticity, a PLASTIC draw without a rates-at-0 score, PSHUF with the real wiring, and a second training of draw 2 each fail by name",
        V.checkRecords(good).length === 0 && good.length === 38 && /^the checks hold: 36 draws/.test(lines) && V.checkRecords(good.filter((r) => !(r.arm === "PSHUF" && r.s === 12))).some((x) => /PSHUF draw 12 is there 0 times/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "FROZEN" && r.s === 3 ? { ...r, rates: { a: 0.01, b: 0, c: 1e-5 } } : r))).some((x) => /FROZEN draw 3's rates are not its arm's/.test(x)) && V.checkRecords(good.map((r) => (r.arm === "PLASTIC" && r.s === 4 ? { ...r, ratesOff: null } : r))).some((x) => /PLASTIC draw 4 has no score with its rates at 0/.test(x)) &&
        V.checkRecords(good.map((r) => (r.arm === "PSHUF" && r.s === 5 ? { ...r, edgesHash: stub("PLASTIC", 5).edgesHash } : r))).some((x) => /PSHUF draw 5's wiring is not its arm's/.test(x)) && J(V.checkRecords(file(learnt, 2))) === J(["PLASTIC draw 1 trained a second time is not there once with the same weights"]));
    ok("!! P IS A SIGN TEST AGAINST VISION OFF, P2 A RANK SUM AGAINST FROZEN, T1 AGAINST PSHUF, H A SIGN TEST AGAINST THE RULE BY HAND: plastic flies at 0.68 -> P BETTER (12 above 0.5041), P2 BETTER (ranks 222), T1 WORSE (ranks 78, under the shuffle's 0.70), H BETTER (12 above 0.6674); USES 12 of 12",
        R.P.word === V.WORDS.P[0] && R.P.above === 12 && R.P.ref === 0.5041 && R.P2.word === V.WORDS.P2[0] && R.P2.sumA === 222 && R.T1.word === V.WORDS.T1[1] && R.T1.sumA === 78 && R.H.word === V.WORDS.H[0] && R.H.ref === 0.6674 && R.arms.PLASTIC.uses === 12 && R.arms.FROZEN.uses === 0 &&
        /P \(PLASTIC against path integration alone\): of 12, 12 above its 0\.5041/.test(lines) && /P2 \(PLASTIC against FROZEN\): PLASTIC's ranks sum to 222/.test(lines) && /USES 12 of 12/.test(lines));
    const lean = V.reading(file((arm, s) => (arm === "FROZEN" ? rec(arm, s, 0.49) : rec(arm, s, 0.68 + s / 1e4, 0.68 + s / 1e4 - 0.005))));
    ok("a fly whose score falls by 0.005 with a and b at 0 does not USE them; one whose falls by exactly 0.01 does not either (0.012 - 0.002 is 0.01 in doubles)", lean.arms.PLASTIC.uses === 0 && 0.012 - 0.002 === 0.01 && !V.uses({ score: 0.012, ratesOff: 0.002 }) && V.uses({ score: 0.7, ratesOff: 0.68 }) && !V.uses({ score: 0.7, ratesOff: null }));
    const offF = good.map((r) => (r.kind === "floors" ? { ...r, untrained: { ...r.untrained, PLASTIC: 0.45 } } : r)), shufOwn = good.map((r) => (r.kind === "floors" ? { ...r, untrained: { ...r.untrained, PSHUF: 0.6 } } : r)), noFl = V.reading(good.filter((r) => r.kind !== "floors"));
    ok("!! an untrained FROZEN or PLASTIC fly that is not the start is said by name and nothing is weighed (PSHUF's own start is its shuffle's and is not); with no floors no test is made", J(V.checkRecords(offF)) === J(["the untrained PLASTIC fly does not score the start's number: the start is not the registered one"]) && V.checkRecords(shufOwn).length === 0 && V.reading(offF).P === null && noFl.P === null && noFl.H === null && /^A CHECK FAILED/.test(V.readingLines(noFl)[0]));
    const flat = V.reading(file((arm, s) => rec(arm, s, 0.5041)));
    ok("plastic flies all at vision off's 0.5041 are 12 ties: P CANNOT BE TOLD APART", flat.P.ties === 12 && flat.P.word === V.WORDS.P[2]);
});

console.log("\n6. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "COACT", "1"], ["job", "PLASTIC", "x"], ["job", "PLASTIC", "0"], ["job", "PLASTIC", "13"], ["run", "--jobs", "0"], ["read", "extra"]];
    ok("the command's words: run, read, job ARM S for one of the three arms and draws 1 to 12 -- and nothing else", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "PSHUF", "12"])) === J({ cmd: "job", arm: "PSHUF", s: 12 }) && no.every((a) => V.parseArgs(a) === null));
    const csrc = src("tools/ship/takeFlyCompass.mjs");
    ok("!! the command is this round's -- its library and results file -- reads its words through parseArgs alone, refuses a run of no processes itself, trains only what the file does not hold, and trains THE LEAD ARM'S FIRST DRAW a second time (PLASTIC, draw 1)",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyCompass\.mjs"/.test(csrc) && !/Escape|Coact|Fibre|voxelHome/.test(csrc) && /if \(!done\.has\(arm \+ "\/" \+ s\)\) todo\.push\(\[arm, s\]\)/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyCompass\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc));
    const me = src("tools/ship/flyCompass-selfcheck.mjs"), calls = [...me.matchAll(/V\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its one training through the round's code is of 2 iterations with 4 flies tried on draw 901; it starts no process; the file's size and time are what they were",
        calls.length === 1 && /^"PLASTIC", 901, TINY, TINY_AUDIT$/.test(calls[0]) && TINY.iters === 2 && TINY.pop === 4 && !V.SEEDS.includes(901) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} training, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyCompass-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
