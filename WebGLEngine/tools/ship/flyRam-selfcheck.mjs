// WebGLEngine/tools/ship/flyRam-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/flyRam-selfcheck.mjs      (some seconds; IT NEVER RUNS THE ROUND -- its one training is tiny, on a draw the round does not use, and it starts no process)
//
// THE GATE OF THE 6-DOF COLLISION REFLEX ROUND (registered in brain/FLY_RAM_REFLEX_WIP.md before brain/rl/ramEnv.mjs and tools/ship/flyRam.mjs existed): the fly's escape circuit says WHEN a
// break-away written by hand fires, over the Close pilot, against the PD autopilot in joust starts with collisions on.
//   1  THE REFLEX'S EYE AND THE BREAK   brain/rl/ramEnv.mjs: the two numbers, the manoeuvre, the craft, the three hand rules, the price of a ram
//   2  THE ROUND'S NUMBERS              round 5's three arms as they are; the start is the pilot to the bit; the seeds meet nowhere
//   3  ONE TRAINING                     a record's weights are the trainer's from a policy made here by hand
//   4  THE RECORDS                      36 draws; P, H, T1, T2; the craft that never break
//   5  THE COMMAND                      it is this round's; no training of the round's, no process
// SABOTAGE LOG (2026-11-16) -- through a byte-safe runner (one at a time, every file restored and its sha256 checked), this gate and tools/ship/voxelHome-selfcheck.mjs (which probes the command as a
// process) run whole for each; every one red by name (the number is the rows red over the two):
//   THE EYE AND THE BREAK (brain/rl/ramEnv.mjs): R1 the looming rate's sign flipped 2 | R2 the size not scaled 1 | R3 the size and the rate change places 2 | R4 the break flees TOWARD the foe's line 2
//   R5 the break fires 3 | R6 the break never thrusts 1 | R7 the craft breaks at 0 too 3 | R8 the pilot always flies 3 | R9 the hand rule at 2 s 2 | R10 always is the hand rule 3
//   R11 a ram priced at 0.1 2 | R12 no collisions 3 | R13 the standoff start 4 | R14 the reward does not price a ram 1 | R15 the env's dist is plus the reward 1 | R16 the output layer not zeroed 4
//   R17 every weight zeroed 3 | R18 the env flies seed 1 whatever it was reset to 1 | R19 the closing speed ignores the craft's own velocity 2 | R20 the foe is the hand pilot 2
//   THE ROUND (tools/ship/flyRam.mjs): F1 FREE is the cells with no connections 2 | F2 GSHUF is the real wiring 2 | F3 the last output weight not zeroed 3 | F4 every draw's fly from seed 1 2
//   F5 150 iterations 3 | F6 sixteen draws 9 | F7 the audit is the scoping seeds 2 | F8 the episodes not fresh 1 | F9 the battery's size not handed on 1 | F10 the trainer's seed 3 for every draw 1
//   F13 wins and losses change places 1 | F14 P against the hand reflex 5 | F15 the sign tests' BETTER and WORSE swapped 3 | F16 the rank tests' swapped 3 | F17 T1 against FREE and T2 against GSHUF 1
//   F18 alpha 0.05 2 | F19 the tests made with a failed check 1 | F20 the pilot's floor not held to the registration's 1 | F21 the untrained craft need not be the pilot 1
//   F22 the second training of any draw 1 | F23 a craft that breaks a little counts as never breaking 2 | F24 the round writes round 6's file 1 | F25 a reward need not be its fight less its rams 1
//   F26 the pilot under the reflex is the Default 1
//   TWO WENT 0 RED AT FIRST AND WERE FINDINGS: F11 the audit is of the start, not the trained weights (the tiny training's craft never broke, so its audit WAS the start's: the training now takes a
//   wide step on draw 902 and its craft breaks) and F12 a game with one ram is not counted (the hand reflex had no ramming game on the six seeds: the pilot alone's are now counted too). Run again: 1 and 1.
//   THE COMMAND: C1 the second training is of draw 2 1 | C2 exits 0 on a word it does not know 1 | C3 reads round 6's library 1
//   Four rows of mine were wrong when written and were corrected to what the code gives: the hull's radius (1.8815, not 1.884), the looming rate against the size a tick later (two parts in a hundred),
//   a fixture's "other weights" that were the same weights (GF and GSHUF start alike for a draw), and a second-training fixture that the hash caught before the draw was looked at.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as V from "./flyRam.mjs";
import * as V5 from "./flyEscapeVision.mjs";
import * as PF from "./paintingFly.mjs";
import * as E from "../../brain/rl/ramEnv.mjs";
import * as X from "../../brain/rl/escapeEnv.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as AP from "../../brain/autopilot6dof.mjs";
import * as RB from "../../physics/mechanics/rigidBody6dof.mjs";
import * as T from "../../brain/gfVisualTopology.mjs";
import { MaskedCircuitPolicy } from "../../brain/rl/maskedCircuitPolicy.mjs";
import { trainDockES } from "../../brain/rl/dockPolicy.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function section(fn) { try { fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n").slice(1, 3).join(" | ")); } }
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const J = JSON.stringify, src = (f) => fs.readFileSync(path.join(ENG, f), "utf8"), arr = (a) => Array.from(a), near = (a, b, e = 5e-5) => Math.abs(a - b) < e;
const TINY = Object.freeze({ maxSteps: 1, iters: 2, pop: 4, sigma: 1.5, lr: 1, trainEps: 2, fresh: true, battery: 30 }), TINY_AUDIT = [880001, 880002, 880003];
const SIX = V.SCOPING.slice(0, 6), I = RB.boxInertia({ m: P6.SHIP_MASS, hx: P6.HALF[0], hy: P6.HALF[1], hz: P6.HALF[2] });
const body = (pos, vel = [0, 0, 0], q = [1, 0, 0, 0]) => RB.createBody({ mass: P6.SHIP_MASS, I, pos, vel, q, w: [0, 0, 0] });
const fwd = (b) => RB.rotateByQuat(b.q, AP.FORWARD_BODY), OPTS = { weaponSpeed: 900, ...P6.PAGE_AUTOPILOT };

console.log("1. THE REFLEX'S EYE AND THE BREAK (brain/rl/ramEnv.mjs)");
section(() => {
    ok("the numbers are the registration's and the escape rounds': three numbers to the reflex and one back, the size at index 1 and the looming rate at index 2 (where round 5's cells read them), x 2 and x 20, a tick a thirtieth of a second, the hand rule at 3 s; the hull's bounding radius is the half-extents' length, 1.8815 m",
        E.OBS_DIM === 3 && E.ACT_DIM === 1 && E.SIZE === 1 && E.LOOM === 2 && E.SIZE === V5.SIZE && E.LOOM === V5.LOOM && E.SIZE_GAIN === 2 && E.LOOM_GAIN === 20 && E.TICK === 1 / 30 && E.HAND_SECONDS === 3 && near(E.HULL_RADIUS, Math.sqrt(1.6 * 1.6 + 0.7 * 0.7 + 0.7 * 0.7), 1e-12) && near(E.HULL_RADIUS, 1.8815, 1e-4) &&
        /its angular size \(2 atan\(radius \/ distance\), x 2\) \| ITS LOOMING RATE \(the size's change a tick, x 20\)/.test(src("brain/rl/escapeEnv.mjs")) && X.OBS_DIM === 13);
    ok("!! THE PRICE OF A RAM IS THE FIGHT'S OWN PRICE OF A HIT POINT: what a hit earns over the hit points a shot takes, 1 / 6 -- and the duel is the joust start with collisions on and that price, nothing else",
        E.RAM_PRICE === P6.REWARD.hit / P6.SHOT_DAMAGE && E.RAM_PRICE === 1 / 6 && J(E.DUEL) === J({ collisions: true, scenario: "joust", ramPenalty: 1 / 6 }) && Object.isFrozen(E.DUEL));
    const me = body([0, 0, 0], [2, 0, 0]), foe = { pos: [20, 0, 0], vel: [-6, 0, 0] }, s = E.looming(me, foe), size = 2 * Math.atan(E.HULL_RADIUS / 20);
    const later = E.looming(body([2 / 30, 0, 0], [2, 0, 0]), { pos: [20 - 6 / 30, 0, 0], vel: [-6, 0, 0] });
    ok("!! looming(): a foe 20 m ahead, the gap closing at 8 m/s -> range 20, closing 8, 2.5 s to contact, size 2 atan(R / 20) x 2; and THE LOOMING RATE IS THE SIZE'S CHANGE A TICK (x 20): it agrees with the size one tick later to two parts in a hundred (the rate grows within the tick)",
        s.range === 20 && near(s.closing, 8, 1e-12) && near(s.seconds, 2.5, 1e-12) && s.obs.length === 3 && s.obs[0] === 1 && near(s.obs[1], size * 2, 1e-12) && Math.abs(s.obs[2] / 20 - (later.obs[1] - s.obs[1]) / 2) < 0.02 * s.obs[2] / 20 && s.obs[2] > 0, `rate ${(s.obs[2] / 20).toFixed(5)} a tick, the difference ${((later.obs[1] - s.obs[1]) / 2).toFixed(5)}`);
    const away = E.looming(me, { pos: [20, 0, 0], vel: [9, 0, 0] }), side = E.looming(body([0, 0, 0]), { pos: [0, 30, 0], vel: [5, 0, 0] }), still = E.looming(body([0, 0, 0]), { pos: [0, 0, 7] });
    ok("a foe drawing away has a negative looming rate and no time to contact (Infinity); one crossing at right angles has none either and a rate of 0; a foe with no velocity given is at rest", away.closing === -7 && away.obs[2] < 0 && away.seconds === Infinity && side.closing === 0 && side.obs[2] === 0 && side.seconds === Infinity && still.range === 7 && still.closing === 0);
    // the break: the foe comes down the x axis, offset +3 in y -> flee is -y
    const b0 = body([0, 0, 0]), f1 = { pos: [30, 3, 0], vel: [-10, 0, 0] }, d = E.breakAway(b0, f1, OPTS), ref = AP.decide(b0, { pos: [0, -1000, 0], vel: [0, 0, 0] }, { thrustForce: 16, standoff: 0 });
    ok("!! breakAway(): a foe coming down a line that passes 3 m to the craft's +y side is fled STRAIGHT AWAY FROM THAT LINE, to -y: the torque is the PD autopilot's own toward a point 1,000 m that way, no thrust while the nose is 90 degrees off, and no fire",
        J(d.torqueBody) === J(ref.torqueBody) && d.torqueBody.some((t) => t !== 0) && d.thrust === 0 && d.firing === false && J(E.breakAway(b0, { pos: [30, -3, 0], vel: [-10, 0, 0] }, OPTS).torqueBody) === J(AP.decide(b0, { pos: [0, 1000, 0], vel: [0, 0, 0] }, { thrustForce: 16, standoff: 0 }).torqueBody));
    const qy = [Math.SQRT1_2, 0, 0, -Math.SQRT1_2], facing = body([0, 0, 0], [0, 0, 0], qy), fd = E.breakAway(facing, f1, OPTS);
    ok("a craft whose nose already points down the flight line thrusts at the page's 16 N (and still does not fire); a foe DEAD ON is fled to world +y; and the break is the same whatever the foe's distance along its line", near(fwd(facing)[1], -1, 1e-9) && fd.thrust === 16 && fd.firing === false &&
        J(E.breakAway(b0, { pos: [30, 0, 0], vel: [-10, 0, 0] }, OPTS).torqueBody) === J(AP.decide(b0, { pos: [0, 1000, 0], vel: [0, 0, 0] }, { thrustForce: 16, standoff: 0 }).torqueBody) && J(E.breakAway(b0, { pos: [12, 3, 0], vel: [-10, 0, 0] }, OPTS).torqueBody) === J(d.torqueBody));
    const underCalls = [], under = (b, t, o) => { underCalls.push(1); return { torqueBody: [7, 7, 7], thrust: 5, firing: true, range: 1, facingCos: 1 }; }, count = { ticks: 0, breaks: 0 };
    const yes = E.craft(under, { act: () => [0.2] }, count)(b0, f1, OPTS), no = E.craft(under, { act: () => [0] }, count)(b0, f1, OPTS), neg = E.craft(under, { act: () => [-1] })(b0, f1, OPTS);
    let seen = null; E.craft(under, { act: (o, see) => { seen = [o, see]; return [-1]; } })(b0, f1, OPTS);
    ok("!! craft(): ABOVE 0 THE CRAFT BREAKS AND ITS PILOT IS NOT ASKED; AT 0 OR BELOW THE PILOT FLIES, UNTOUCHED -- the ticks and the breaks are counted when a counter is given, and the fly is handed the three numbers and looming()'s answer",
        J(yes.torqueBody) === J(d.torqueBody) && yes.firing === false && J(no) === J({ torqueBody: [7, 7, 7], thrust: 5, firing: true, range: 1, facingCos: 1 }) && J(neg) === J(no) && underCalls.length === 3 && count.ticks === 2 && count.breaks === 1 && seen && J(seen[0]) === J(E.looming(b0, f1).obs) && seen[1].range === E.looming(b0, f1).range &&
        throws(() => E.craft(null, { act() {} }), /a pilot function and a fly/) && throws(() => E.craft(under, {}), /a pilot function and a fly/));
    const R = (k, see) => E.RULES[k].act(null, see)[0];
    ok("the three reflexes written by hand: never (the pilot alone); hand (break when under 3 s to contact: 2.9 yes, 3 no, not closing no); always (break whenever the gap is closing)",
        J(Object.keys(E.RULES)) === J(["never", "hand", "always"]) && R("never", { seconds: 0.1, closing: 9 }) === -1 && R("hand", { seconds: 2.9, closing: 1 }) === 1 && R("hand", { seconds: 3, closing: 1 }) === -1 && R("hand", { seconds: Infinity, closing: -1 }) === -1 && R("always", { seconds: 50, closing: 0.01 }) === 1 && R("always", { seconds: Infinity, closing: 0 }) === -1);
    const seed = SIX[0], plain = P6.duel(V.under(), "autopilot", { seed, collisions: true, scenario: "joust" }), f = E.fight(V.under(), E.RULES.never, seed), h = E.fight(V.under(), E.RULES.hand, seed), al = E.fight(V.under(), E.RULES.always, seed);
    ok("!! fight(): WITH A REFLEX THAT NEVER FIRES THE FIGHT IS THE CLOSE PILOT'S OWN DUEL, TO THE BIT (the same fingerprint, score, rams) -- the reward is that score less a sixth a hit point lost to a ram, `fight` the score with no ram priced; the hand reflex flies a different fight and breaks in it; breaking always breaks more",
        f.fingerprint === plain.fingerprint && f.fight === plain.score + 0 * 1 && near(f.reward, plain.score - plain.ramHp / 6, 1e-9) && f.ramHp === plain.ramHp && f.rams === plain.rams && f.win === plain.win && f.loss === plain.winB && f.ticks === plain.ticks && f.breaks === 0 &&
        h.fingerprint !== f.fingerprint && h.breaks > 0 && al.breaks > h.breaks && near(h.fight - h.reward, h.ramHp / 6, 1e-9), `seed ${seed}: the pilot ${f.reward.toFixed(2)} (rams ${f.rams}), hand ${h.reward.toFixed(2)} (breaks ${h.breaks}), always ${al.reward.toFixed(2)} (breaks ${al.breaks})`);
    const env = new E.RamEnv({ under: V.under() }), o = env.reset(seed), st = env.step(E.RULES.hand);
    ok("!! RamEnv: AN EPISODE IS ONE STEP -- reset(seed) keeps the seed, step(the fly) flies that seed's whole duel and is done, its reward the fight's; nothing is docked or crashed and `dist` is minus the reward, so the trainer keeps its best battery reward",
        env.obsDim === 3 && env.actDim === 1 && env.maxSteps === 1 && o.length === 3 && st.done === true && st.reward === h.reward && st.info.dist === -h.reward && st.info.docked === false && st.info.crashed === false && st.info.fingerprint === h.fingerprint && env.last.reward === h.reward && throws(() => new E.RamEnv({}), /`under` is the pilot/));
    const inner = V5.ARMS_OF.GF.make(1)({ obsDim: 3, seed: 5 }), before = arr(inner.getParams()), wf = new E.WholeFly(inner, { tail: 3 }), after = arr(wf.getParams());
    ok("!! WholeFly: its weights are the network's own, its act() answers THE NETWORK ITSELF, and the last `tail` weights -- the output layer -- start at zero and nothing else is touched; an output layer of no weights or more than there are is refused",
        wf.paramCount() === 454 && wf.act() === inner && after.slice(-3).every((v) => v === 0) && before.slice(-3, -1).every((v) => v !== 0) && J(after.slice(0, -3)) === J(before.slice(0, -3)) && wf.setParams(Float32Array.from(before)) === wf && J(arr(inner.getParams())) === J(before) &&
        throws(() => new E.WholeFly(inner, { tail: 0 }), /output layer is 1 to 454/) && throws(() => new E.WholeFly(inner, { tail: 455 }), /output layer/) && throws(() => new E.WholeFly({}, { tail: 1 }), /the network has act/));
});

console.log("\n2. THE ROUND'S NUMBERS (tools/ship/flyRam.mjs)");
section(() => {
    ok("the recipe, the draws, the audit and the names are the registration's: one step an episode, 60 iterations, 32 craft tried, sigma 0.14, lr 0.05, 12 fresh fights each, a battery of 100; draws 1 to 12; 200 audit seeds 900001 + 7919 k; alpha 0.01; brain/flyRamRound.jsonl; the pilot alone 16.5092",
        J(V.RECIPE) === J({ maxSteps: 1, iters: 60, pop: 32, sigma: 0.14, lr: 0.05, trainEps: 12, fresh: true, battery: 100 }) && Object.isFrozen(V.RECIPE) && J(V.SEEDS) === J([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) && V.AUDIT.length === 200 && V.AUDIT[0] === 900001 && V.AUDIT[199] === 900001 + 7919 * 199 &&
        V.ALPHA === 0.01 && V.RESULTS === "brain/flyRamRound.jsonl" && V.PILOT_FLOOR === 16.5092 && V.LEAD === "GF");
    ok("!! THE ARMS ARE ROUND 5'S OWN OBJECTS, NOT COPIES: the real Giant Fiber visual circuit (42 cells, 369 connections, 454 weights), its free shuffle, the free net of 113 units (453 weights) -- and no fourth",
        J(V.ARMS) === J(["GF", "GSHUF", "FREE"]) && V.ARMS_OF.GF === V5.ARMS_OF.GF && V.ARMS_OF.GSHUF === V5.ARMS_OF.GSHUF && V.ARMS_OF.FREE === V5.ARMS_OF.FREE && J(V.WEIGHTS) === J({ GF: 454, GSHUF: 454, FREE: 453 }) &&
        J(V.circuitOf("GF", 3).edges) === J(T.EDGES.map((e) => [e[0], e[1]])) && V.circuitOf("GF", 3).units === 42 && J(V.circuitOf("GSHUF", 3).edges) !== J(V.circuitOf("GSHUF", 4).edges) && V.circuitOf("GSHUF", 3).edges.length === 369 && V.circuitOf("FREE", 1).units === 113 && V.circuitOf("FREE", 1).edges.length === 0 && throws(() => V.circuitOf("GNONE", 1), /no arm GNONE/) && throws(() => V.policyOf("GDEG", 1), /no arm GDEG/));
    const train = new Set(); for (let it = 0; it <= V.RECIPE.iters; it++) for (let k = 0; k < Math.max(V.RECIPE.trainEps, V.RECIPE.battery); k++) train.add(5000 + 17 * k + (it ? 104729 * it : 0));
    ok("!! THE SEEDS MEET NOWHERE: the 200 audit seeds, the 60 scoping seeds flown before the registration (1000001 + 37 k) and every seed the trainer can draw (the battery's 5000 + 17 k; an iteration's + 104729 (it + 1)) share none",
        V.SCOPING.length === 60 && V.SCOPING[0] === 1000001 && V.SCOPING[59] === 1000001 + 37 * 59 && !V.AUDIT.some((s) => train.has(s) || V.SCOPING.includes(s)) && !V.SCOPING.some((s) => train.has(s)) && new Set(V.AUDIT).size === 200);
    ok("the pilot under the reflex is the fruit fly's close-quarters pilot, from its file as committed (sha256 e5fa882b...; 930 weights), made once", V.UNDER_FILE === "brain/pilot6dofWeightsClose.json" && createHash("sha256").update(fs.readFileSync(path.join(ENG, V.UNDER_FILE))).digest("hex") === "e5fa882bef1700efa3fa574ef75d511fa49db9c8579d43198e6c36024a6165a2" && V.under() === V.under() && typeof V.under() === "function");
    const flies = V.ARMS.map((a) => V.policyOf(a, 2)), tails = { GF: 3, GSHUF: 3, FREE: 114 };
    const sameAsPilot = V.ARMS.every((a, k) => SIX.slice(0, 3).every((seed) => E.fight(V.under(), flies[k], seed).fingerprint === P6.duel(V.under(), "autopilot", { seed, collisions: true, scenario: "joust" }).fingerprint));
    ok("!! *** THE START IS THE PILOT ALONE, TO THE BIT ***: each arm's untrained fly has its output layer at zero (GF and GSHUF: two weights and a bias; FREE: 113 and a bias) and everything before it as round 5 made it for the draw; it answers 0 to anything, and its craft flies the Close pilot's own duel fingerprints on three seeds",
        V.ARMS.every((a, k) => { const w = arr(flies[k].getParams()), raw = arr(V5.ARMS_OF[a].make(2)({ obsDim: 3, seed: 2 }).getParams()), t = tails[a]; return w.length === V.WEIGHTS[a] && w.slice(-t).every((v) => v === 0) && J(w.slice(0, -t)) === J(raw.slice(0, -t)) && raw.slice(-t, -1).every((v) => v !== 0) && flies[k].act([1, 0.7, 0.4])[0] === 0; }) && sameAsPilot &&
        arr(V.policyOf("GF", 2).getParams()).some((v, i) => v !== arr(V.policyOf("GF", 3).getParams())[i]));
    const an = V.auditScore(E.RULES.never, SIX), eachN = SIX.map((s) => E.fight(V.under(), E.RULES.never, s));
    const a = V.auditScore(E.RULES.hand, SIX), each = SIX.map((s) => E.fight(V.under(), E.RULES.hand, s)), m = (k) => each.reduce((n, r) => n + r[k], 0) / 6;
    ok("auditScore(): the means of the fights' reward, fight score, hit points lost to rams, ticks breaking and ticks, and the counts of games with a ram, won and lost -- of the hand reflex on six scoping seeds, against fight() called here; and the pilot alone's games with a ram (a game with ONE ram is one)",
        near(a.score, m("reward"), 1e-12) && near(a.fight, m("fight"), 1e-12) && near(a.ramHp, m("ramHp"), 1e-12) && near(a.breaks, m("breaks"), 1e-12) && near(a.ticks, m("ticks"), 1e-12) && a.ramGames === each.filter((r) => r.rams > 0).length && a.wins === each.filter((r) => r.win).length && a.losses === each.filter((r) => r.loss).length && a.breaks > 0 && an.ramGames === eachN.filter((r) => r.rams > 0).length && eachN.some((r) => r.rams === 1) && an.ramGames > 0 && an.wins === eachN.filter((r) => r.win).length,
        `the hand reflex: reward ${a.score.toFixed(3)}, ${a.ramGames} of 6 with a ram, W${a.wins} / L${a.losses}; the pilot alone: ${an.ramGames} of 6 with a ram`);
    const fl = V.floors(SIX.slice(0, 2));
    ok("floors(): the pilot alone, the hand reflex, breaking always, and each arm's untrained craft -- which scores the pilot's number exactly", fl.kind === "floors" && J(fl.pilot) === J(V.auditScore(E.RULES.never, SIX.slice(0, 2))) && J(fl.hand) === J(V.auditScore(E.RULES.hand, SIX.slice(0, 2))) && J(fl.always) === J(V.auditScore(E.RULES.always, SIX.slice(0, 2))) && J(Object.keys(fl.untrained)) === J(V.ARMS) && V.ARMS.every((x) => fl.untrained[x] === fl.pilot.score) && fl.always.breaks > fl.hand.breaks);
    ok("the words: each reading has BETTER, WORSE and CANNOT BE TOLD APART, in that order, and names what is set against what", ["P", "H", "T1", "T2"].every((k) => V.WORDS[k].length === 3 && / BETTER THAN /.test(V.WORDS[k][0]) && / WORSE THAN /.test(V.WORDS[k][1]) && / CANNOT BE TOLD APART FROM /.test(V.WORDS[k][2]) && !/FLIES CANNOT|TRAINS CANNOT/.test(V.WORDS[k][2])) &&
        /ITS PILOT ALONE$/.test(V.WORDS.P[0]) && /THE REFLEX WRITTEN BY HAND$/.test(V.WORDS.H[0]) && /A SHUFFLE OF IT$/.test(V.WORDS.T1[0]) && /A FREE NET ON THE SAME TWO NUMBERS$/.test(V.WORDS.T2[0]));
});

console.log("\n3. ONE TRAINING (2 iterations, 4 craft tried, a wide step, on draw 902, which the round does not use)");
section(() => {
    const rec = V.trainOne("GF", 902, TINY, TINY_AUDIT);
    const byHand = trainDockES({ envFactory: () => new E.RamEnv({ under: V.under() }), obsDim: 3, actDim: 1, maxSteps: 1, iters: 2, pop: 4, sigma: 1.5, lr: 1, trainEps: 2, seed: 902, freshEpisodes: true, batteryEps: 30,
        policyFactory: ({ obsDim, seed }) => new E.WholeFly(new MaskedCircuitPolicy({ obsDim, units: 42, inputs: V5.VISUAL_INPUTS.map((p) => [...p]), edges: T.EDGES.map((e) => [e[0], e[1]]), outputs: [...T.GF], edgeStart: [...V5.EDGE_START], seed: seed ?? 1234 }), { tail: 3 }) });
    const fly = V.policyOf("GF", 902); fly.setParams(byHand.params); const a = V.auditScore(fly, TINY_AUDIT), start = V.auditScore(V.policyOf("GF", 902), TINY_AUDIT);
    ok("!! A RECORD'S WEIGHTS ARE THE TRAINER'S FROM A POLICY MADE HERE BY HAND (round 5's real circuit in a WholeFly with its three last weights zeroed, on a RamEnv over the Close pilot, fresh episodes, a battery of 30): the same weights to the bit, and the record's audit is those weights' on the audit handed in -- AND NOT THE START'S: this trained craft breaks, and the untrained one never does",
        rec.kind === "draw" && rec.arm === "GF" && rec.s === 902 && J(rec.recipe) === J(TINY) && rec.weightCount === 454 && rec.weightsHash === PF.hashWeights(byHand.params) && J(arr(PF.unpackWeights(rec.weights))) === J(arr(byHand.params)) && rec.units === 42 && rec.edges === 369 && rec.edgesHash === PF.hashEdges(T.EDGES.map((e) => [e[0], e[1]])) &&
        rec.score === a.score && rec.fight === a.fight && rec.ramHp === a.ramHp && rec.ramGames === a.ramGames && rec.wins === a.wins && rec.losses === a.losses && rec.breaks === a.breaks && rec.ticks === a.ticks && J(rec.history) === J(byHand.history.map((h) => ({ it: h.it, ret: h.avgReturn }))) && rec.history[0].it === 0 && rec.history[rec.history.length - 1].it === 1 && rec.breaks > 0 && start.breaks === 0 && rec.score !== start.score, `the trained craft ${rec.score.toFixed(3)} (${rec.breaks.toFixed(1)} ticks breaking a game), the start ${start.score.toFixed(3)}`);
    ok("the trained weights are not the start's (the trainer moved them), and a draw that is not a whole number from 1 is refused", arr(PF.unpackWeights(rec.weights)).some((v, i) => v !== arr(V.policyOf("GF", 902).getParams())[i]) && throws(() => V.trainOne("GF", 0, TINY, TINY_AUDIT), /a draw is a whole number from 1/));
});

console.log("\n4. THE RECORDS (made here: 36 draws with each arm's own start weights and scores written by hand)");
section(() => {
    const draw = (arm, s, score, more = {}) => { const w = V.policyOf(arm, s).getParams(), c = V.circuitOf(arm, s), ramHp = more.ramHp ?? 6; return { kind: "draw", arm, s, recipe: { ...V.RECIPE }, units: c.units, edges: c.edges.length, edgesHash: PF.hashEdges(c.edges), weightCount: w.length, weights: PF.packWeights(w), weightsHash: PF.hashWeights(w),
        score, fight: score + ramHp / 6, ramHp, ramGames: 80, wins: 150, losses: 20, breaks: more.breaks ?? 10, ticks: 480, history: [{ it: 0, ret: 15 }, { it: 59, ret: 16 }] }; };
    const fl = (pilot = 16.5092, hand = 13) => ({ kind: "floors", pilot: { score: pilot, fight: 18, ramHp: 9, ramGames: 100, wins: 150, losses: 21, breaks: 0, ticks: 488 }, hand: { score: hand, fight: 13.5, ramHp: 3, ramGames: 60, wins: 140, losses: 20, breaks: 80, ticks: 500 }, always: { score: 4, fight: 4.5, ramHp: 3, ramGames: 60, wins: 30, losses: 90, breaks: 230, ticks: 600 }, untrained: { GF: pilot, GSHUF: pilot, FREE: pilot } });
    const file = (sc, floors = fl()) => { const d = V.ARMS.flatMap((arm) => V.SEEDS.map((s) => draw(arm, s, sc(arm, s)))); return [...d, { kind: "recheck", arm: "GF", s: 1, weightsHash: d[0].weightsHash }, floors]; };
    const good = file((arm, s) => (arm === "GF" ? 17 : arm === "GSHUF" ? 15 : 16) + s / 100), R = V.reading(good);
    ok("a whole file holds: no check fails; P -- all 12 GF craft above the pilot's 16.5092, exact two-sided p 2 / 4096 -> BETTER; H the same against the hand reflex's 13; T1 -- every GF above every GSHUF, ranks 222 of a middle 150 -> BETTER; T2 the same against FREE",
        R.checks.length === 0 && R.P.above === 12 && R.P.below === 0 && R.P.p === 2 / 4096 && R.P.ref === 16.5092 && R.P.word === V.WORDS.P[0] && R.H.ref === 13 && R.H.word === V.WORDS.H[0] && R.T1.sumA === 222 && R.T1.word === V.WORDS.T1[0] && R.T2.sumA === 222 && R.T2.word === V.WORDS.T2[0] && near(R.arms.GF.mean, 17.065, 1e-9) && R.arms.GF.n === 12, R.checks[0]);
    const low = V.reading(file((arm, s) => (arm === "GF" ? 15 : 17) + s / 100));
    ok("!! BETTER AND WORSE ARE NOT EACH OTHER'S: 12 GF craft all below the pilot -> P WORSE; all above the hand reflex -> H BETTER; every GF below every GSHUF (ranks 78, the least) -> T1 WORSE, and T2 WORSE", low.P.word === V.WORDS.P[1] && low.P.below === 12 && low.H.word === V.WORDS.H[0] && low.T1.sumA === 78 && low.T1.word === V.WORDS.T1[1] && low.T2.word === V.WORDS.T2[1]);
    const tie = V.reading(file((arm, s) => (arm === "GF" ? (s <= 2 ? 16.5092 : 17) : 16.8 + (arm === "FREE" ? 0.01 : 0) + (s % 2) * 0.4)));
    ok("!! A CRAFT THAT SCORES THE PILOT'S NUMBER COUNTS AGAINST: 10 above and 2 equal is p 158 / 4096 = 0.039 and CANNOT BE TOLD APART, where 10 of 10 would have spoken; and arms that overlap cannot be told apart (T1 p above 0.01)", tie.P.above === 10 && tie.P.ties === 2 && tie.P.below === 0 && tie.P.p === 158 / 4096 && tie.P.word === V.WORDS.P[2] && tie.T1.p > 0.01 && tie.T1.word === V.WORDS.T1[2]);
    const edge = V.reading(file((arm, s) => (arm === "GF" ? (s === 1 ? 16 : 17) : 16.9)));
    ok("the line is alpha 0.01, on the exact p: 11 above and 1 below is 26 / 4096 = 0.0063 -> BETTER", edge.P.above === 11 && edge.P.below === 1 && edge.P.p === 26 / 4096 && edge.P.word === V.WORDS.P[0]);
    const mid = V.reading(file((arm, s) => (arm === "GF" ? 16.6 + s / 100 : arm === "GSHUF" ? 16 : 17)));
    ok("!! T1 IS AGAINST THE SHUFFLE AND T2 AGAINST THE FREE NET, NOT THE OTHER WAY: GF above every GSHUF and below every FREE -> T1 BETTER (ranks 222) and T2 WORSE (ranks 78)", mid.T1.sumA === 222 && mid.T1.word === V.WORDS.T1[0] && mid.T2.sumA === 78 && mid.T2.word === V.WORDS.T2[1]);
    const sil = good.map((r) => (r.kind === "draw" && r.arm === "FREE" && r.s <= 5 ? { ...r, breaks: 0 } : r)), RS = V.reading(sil);
    ok("the craft that never break on the audit are counted an arm (five FREE records with no tick breaking -> FREE 5, GF 0), and an arm's row is its 12 craft's means", J(RS.silent) === J({ GF: 0, GSHUF: 0, FREE: 5 }) && J(R.silent) === J({ GF: 0, GSHUF: 0, FREE: 0 }) && near(RS.arms.FREE.breaks, 70 / 12, 1e-9) && R.arms.GF.ramHp === 6 && R.arms.GF.wins === 150 && R.arms.GF.history.length === 2 && R.arms.GF.history[1].ret === 16);
    const bad = (name, lines, re) => { const c = V.checkRecords(lines), r = V.reading(lines); return [name, c.length >= 1 && c.some((x) => re.test(x)) && r.P === null && r.H === null && r.T1 === null && r.T2 === null, c[0]]; };
    const mut = (pred, f) => good.map((r) => (pred(r) ? f(r) : r)), g1 = (r) => r.kind === "draw" && r.arm === "GF" && r.s === 1, otherW = V.policyOf("GF", 2).getParams();
    const cases = [
        bad("a draw missing", good.filter((r) => !(r.kind === "draw" && r.arm === "FREE" && r.s === 12)), /FREE draw 12 is there 0 times/),
        bad("a draw twice", [...good, good[0]], /GF draw 1 is there 2 times/),
        bad("a draw of an arm that is not the round's", [...good, { ...good[0], arm: "GNONE" }], /36|not a registered draw/),
        bad("another recipe", mut(g1, (r) => ({ ...r, recipe: { ...r.recipe, iters: 61 } })), /another recipe/),
        bad("weights that are not the hash's", mut(g1, (r) => ({ ...r, weights: PF.packWeights(otherW) })), /weights are not 454 finite numbers with its hash/),
        bad("a reward that is not the fight less the rams' price", mut(g1, (r) => ({ ...r, fight: r.fight + 0.5 })), /fight less the price of its rams/),
        bad("more ticks breaking than ticks", mut(g1, (r) => ({ ...r, breaks: 481 })), /fight less the price of its rams/),
        bad("more games won and lost than were flown", mut(g1, (r) => ({ ...r, wins: 190 })), /counts of the 200 audit games/),
        bad("a history that does not end at iteration 59", mut(g1, (r) => ({ ...r, history: [{ it: 0, ret: 1 }, { it: 58, ret: 1 }] })), /history from iteration 0 to 59/),
        bad("a wiring that is not the arm's", mut((r) => r.kind === "draw" && r.arm === "GSHUF" && r.s === 2, (r) => ({ ...r, edgesHash: good[0].edgesHash })), /GSHUF draw 2's wiring is not its arm's/),
        bad("no second training", good.filter((r) => r.kind !== "recheck"), /trained a second time/),
        bad("the second training of another draw", mut((r) => r.kind === "recheck", (r) => ({ ...r, s: 2 })), /trained a second time/),
        bad("the second training gave other weights", mut((r) => r.kind === "recheck", (r) => ({ ...r, weightsHash: "0".repeat(16) })), /trained a second time/),
        bad("no floors", good.filter((r) => r.kind !== "floors"), /floors are not there once/),
        bad("a pilot floor that is not the registration's", file(() => 17, fl(16.6)), /registration's number for the pilot alone \(16\.5092\)/),
        bad("an untrained craft that is not the pilot", file(() => 17, { ...fl(), untrained: { GF: 16.5092, GSHUF: 16.4, FREE: 16.5092 } }), /untrained GSHUF craft does not score the pilot's number/),
        bad("no hand reflex in the floors", file(() => 17, { ...fl(), hand: null }), /floors are not there once/),
    ];
    ok("!! A FILE THAT IS NOT THE REGISTERED ROUND'S IS SAID SO BY NAME AND NOTHING IS WEIGHED: " + cases.map((c) => c[0]).join("; "), cases.every((c) => c[1]), cases.filter((c) => !c[1]).map((c) => `${c[0]} -> ${c[2]}`).join(" | "));
    const L = V.readingLines(R).join("\n"), LB = V.readingLines(V.reading(good.filter((r) => r.kind !== "floors"))).join("\n");
    ok("the reading's lines carry the checks, an arm a row, the floors, each arm's share of the pilot's ram damage beside the careful bar of 50 (6 of 9 hit points: 66.7 percent), the trainer's history, the four tests with their words -- and with a failed check its first line says so and no test is printed",
        /^the checks hold: 36 draws/.test(L) && /GF +17\.0650 +fight 18\.0650/.test(L) && /the pilot alone +16\.5092/.test(L) && /GF +keeps 66\.7 percent of the pilot's ram damage \(the careful profile's bar is 50\)/.test(L) && /mean reward at iteration 0: 15\.0000, 59: 16\.0000/.test(L) && /P \(GF against the pilot alone\): of 12, 12 above its 16\.5092, 0 below, 0 equal; exact two-sided p 4\.883e-4/.test(L) &&
        [R.P.word, R.H.word, R.T1.word, R.T2.word].every((w) => L.includes("\n  " + w)) && /T1 \(GF against GSHUF\): GF's ranks sum to 222 \(the middle is 150\)/.test(L) && /never break: 0 of 12/.test(L) && /^A CHECK FAILED, AND THE READING IS NOT WEIGHED:/.test(LB) && !/exact two-sided p/.test(LB));
});

console.log("\n5. THE COMMAND");
section(() => {
    const file = path.join(ENG, V.RESULTS), stateOf = () => (fs.existsSync(file) ? `${fs.statSync(file).size}/${fs.statSync(file).mtimeMs}` : "absent"), before = stateOf();
    const no = [[], ["bogus"], ["job", "GDEG", "1"], ["job", "GF", "x"], ["job", "GF", "13"], ["job", "GF", "0"], ["run", "--jobs", "0"], ["read", "extra"], ["run", "--jobs"]];
    ok("parseArgs(): run (four processes unless --jobs N), read, job ARM S for one of the three arms and draws 1 to 12 -- and nothing else (an arm of another round's, draw 13, no processes, a word too many)", J(V.parseArgs(["run"])) === J({ cmd: "run", jobs: 4 }) && J(V.parseArgs(["run", "--jobs", "2"])) === J({ cmd: "run", jobs: 2 }) && J(V.parseArgs(["read"])) === J({ cmd: "read" }) && J(V.parseArgs(["job", "FREE", "12"])) === J({ cmd: "job", arm: "FREE", s: 12 }) && no.every((a) => V.parseArgs(a) === null) && V.parseArgs("run") === null);
    const csrc = src("tools/ship/takeFlyRam.mjs");
    ok("!! the command is this round's -- its library and results file, not another round's -- reads its words through parseArgs alone, refuses a run of no processes itself, and trains THE LEAD ARM'S FIRST DRAW a second time",
        (csrc.match(/process\.argv/g) || []).length === 1 && /const args = PF\.parseArgs\(process\.argv\.slice\(2\)\);/.test(csrc) && /!\(args\.jobs >= 1\)/.test(csrc) && /from "\.\/flyRam\.mjs"/.test(csrc) && !/Escape|Vision|Degree|voxelHome/.test(csrc) &&
        /await jobOnce\(PF\.LEAD, PF\.SEEDS\[0\]\)/.test(csrc) && /kind: "recheck", arm: PF\.LEAD, s: PF\.SEEDS\[0\]/.test(csrc) && /path\.join\(ENG, PF\.RESULTS\)/.test(csrc) && /usage: node tools\/ship\/takeFlyRam\.mjs run \[--jobs N\] \| read \| job ARM S/.test(csrc) && V.SEEDS[0] === 1);
    const me = src("tools/ship/flyRam-selfcheck.mjs"), calls = [...me.matchAll(/V\.trainOne\(([^)]*)\)/g)].map((m) => m[1]);
    ok("!! THIS GATE STARTS NO TRAINING OF THE ROUND'S AND LEAVES ITS RESULTS FILE AS IT WAS: its trainings through the round's code are of 2 iterations with 4 craft tried on draw 902 (or refused before they start); this gate starts no process at all; and the file's size and time are what they were before this section",
        calls.length === 2 && calls.every((c) => /^"GF", (902|0), TINY, TINY_AUDIT$/.test(c)) && TINY.iters === 2 && TINY.pop === 4 && !V.SEEDS.includes(902) && !/Sync\(/.test(me.replace(/readFileSync\(|statSync\(|existsSync\(/g, "")) && stateOf() === before, `${calls.length} trainings, no process, the file ${before === "absent" ? "absent" : "unchanged"}`);
});

console.log(`\nflyRam-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exitCode = fails === 0 ? 0 : 1;
