// WebGLEngine/tools/ship/takeBestShipLoadout-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeBestShipLoadout-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE LOADOUT STUDY, HELD. tools/ship/takeBestShipLoadout.mjs flies the cannon-aware fly-wired helm over three gunners against the plain ship, to say what space-duel.html's `best ship` button carries. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (261001-, 271001-, 281001-), disjoint from every other fly-wired study's; the files the arms carry (each checked by its policy); the jobs' ships, cannon, gunner and helm
//   2  THE STUDY             against a stand-in: nine arms, each once; the gains pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights, and the preset as it stands
//
// SABOTAGE LOG: 17 mutants of tools/ship/takeBestShipLoadout.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 17 RED the first time
//   (the seeds moved, a pair short; one ship a side flown as a fleet, the fleet's cannon off, the cannon on one side; no helm, the helm on both sides; the car's file unchecked, the fly gunner's gains; the gain's sign, one arm's leads for all;
//   a lead enough without the no-trail rule, a looser trail, the smaller mean picked, the first picked; the second read and an unknown option let through).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeBestShipLoadout.mjs";
import * as GH from "./takeFlyWiredGunnerHold.mjs";
import * as GM from "./takeFlyWiredGunnerMixed.mjs";
import * as GS from "./takeFlyWiredGunnerShips.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as PI from "./takeFlyWiredPilot.mjs";
import * as NX from "./takeFlyWiredNext.mjs";
import * as GN from "./takeFlyWiredGunner.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as C from "../../render/spaceDuelCore.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeBestShipLoadout.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeBestShipLoadout-selfcheck -- what the best-ship button carries\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...seedsOf(HF.SETS).map((seed) => ({ seed })), ...seedsOf(GS.SETS).map((seed) => ({ seed })), ...seedsOf(GM.SETS).map((seed) => ({ seed })), ...seedsOf(GH.SETS).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(NX.SEEDS).map((seed) => ({ seed })), ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs each, the duel's kinds 75 apiece, on 261001-, 271001- and 281001-; none flown by another fly-wired study", G.FIGHTS.join() === "oneCannon,fleetCannon,fleetNoCannon" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.oneCannon[0].seed === 261001 && G.SETS.fleetCannon[0].seed === 271001 && G.SETS.fleetNoCannon[299].seed === 281075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), car = JSON.parse(fs.readFileSync(G.CAR_BIG_FILE, "utf8"));
    ok("!! THE ARMS' BRAINS: the helm is helmFlyWired3 at the shipped -2, -2, 0.25, 0.25 on every arm; carBig is gunnerPolicy with its file's 896 weights; ships is seatFlyWired3 at -3, -3; hand is no network; a file another policy's is refused by name", b.helm.policy === "helmFlyWired3" && b.helm.weights.join() === "-2,-2,0.25,0.25" && b.carBig.policy === "gunnerPolicy" && b.carBig.weights.length === 896 && b.carBig.weights.join() === Float32Array.from(car.weights).join() && b.ships.policy === "seatFlyWired3" && b.ships.weights.join() === "-3,-3" && b.hand === null
        && (() => { try { G.brainsOf((f) => (f === G.CAR_BIG_FILE ? JSON.parse(fs.readFileSync(G.HELM_FILE, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatTurretGunnerWeightsBig\.json/.test(e.message); } })());
    const one = G.jobsOf("oneCannon", "carBig", b, [G.SETS.oneCannon[0]])[0], fc = G.jobsOf("fleetCannon", "hand", b, [G.SETS.fleetCannon[1]])[0], fn = G.jobsOf("fleetNoCannon", "ships", b, [G.SETS.fleetNoCannon[2]])[0];
    ok("!! THE JOBS: one ship a side with the cannon on both sides; fleets of three with it and without it; the loadout's gunner and the helm on side X only; side Y the plain ship", one.opts.ships === 1 && one.x.cannon && one.y.cannon && fc.opts.ships === 3 && fc.x.cannon && fc.y.cannon && fn.opts.ships === 3 && !fn.x.cannon && !fn.y.cannon && one.x.network === b.carBig && fc.x.network === null && fn.x.network === b.ships && [one, fc, fn].every((j) => j.x.helmNet === b.helm && !j.y.network && !j.y.helmNet && j.opts.escorts === undefined) && fn.seed === G.SETS.fleetNoCannon[2].seed && fn.kind === G.SETS.fleetNoCannon[2].kind);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { oneCannon: { hand: 0.2, carBig: 0.6, ships: 0.1 }, fleetCannon: { hand: 0.1, carBig: 0.4, ships: -0.2 }, fleetNoCannon: { hand: 0, carBig: 0.1, ships: 0 } }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm] * factor(i)); }, () => {}), mf = G.SETS.oneCannon.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! nine arms, each once; each challenger's gain is it LESS THE HAND ARM pair by pair (carBig 0.4, 0.3, 0.1; ships -0.1, -0.3, 0); carBig is chosen here", calls.length === 9 && new Set(calls).size === 9 && close(r.oneCannon.reading.carBigOverHand, 0.4) && close(r.fleetCannon.reading.carBigOverHand, 0.3) && close(r.fleetNoCannon.reading.carBigOverHand, 0.1) && close(r.oneCannon.reading.shipsOverHand, -0.1) && close(r.fleetCannon.reading.shipsOverHand, -0.3) && r.fleetNoCannon.reading.shipsOverHand.mean === 0 && close(r.oneCannon.reading.hand, 0.2) && r.verdict.winner === "carBig" && r.verdict.qualified.join() === "carBig");
    const q = (c1, c2, c3, s1, s2, s3, m = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]) => G.decide(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { carBigOverHand: { z: [c1, c2, c3][i], mean: m[i] }, shipsOverHand: { z: [s1, s2, s3][i], mean: m[3 + i] } } }])));
    ok("!! WHAT IS DECIDED: a challenger takes the preset if it LEADS somewhere (z 2) and TRAILS nowhere (z -2 trails); none qualifying keeps the hand; of two qualifying, the larger mean of its three gains", q(2, 0, 0, 0, 0, 0).winner === "carBig" && q(1.99, 1.99, 1.99, 0, 0, 0).winner === "hand" && q(5, 5, -2, 0, 0, 0).winner === "hand" && q(5, 5, -1.99, 0, 0, 0).winner === "carBig" && q(0, 0, 0, 0, 3, 0).winner === "ships"
        && q(3, 3, 3, 3, 3, 3, [0.1, 0.1, 0.1, 0.2, 0.2, 0.2]).winner === "ships" && q(3, 3, 3, 3, 3, 3, [0.3, 0.3, 0.3, 0.2, 0.2, 0.2]).winner === "carBig" && q(3, 3, 3, 3, 3, 3).qualified.join() === "carBig,ships");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loadout-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings(Object.fromEntries(G.ARMS.map((arm) => [arm, k(f, arm)]))).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- THE PRESET TAKES THE CAR'S ALWAYS-FIRING GUNNER: under the cannon-aware fly-wired helm it leads the hand gunner by +0.856 (z 14.6) one ship a side with the cannon, +0.322 (z 9.0) in fleets with it, +0.547 (z 11.5) without; the ships-sticky fly-wired gunner leads it one ship a side (+0.252) and TRAILS it in both fleets (-0.193, -0.142), so only carBig qualifies", near(R("oneCannon").carBigOverHand, 0.856) && near(R("fleetCannon").carBigOverHand, 0.322) && near(R("fleetNoCannon").carBigOverHand, 0.547) && near(R("oneCannon").shipsOverHand, 0.252) && near(R("fleetCannon").shipsOverHand, -0.193) && near(R("fleetNoCannon").shipsOverHand, -0.142) && rd.fleetCannon.words.shipsOverHand === "TRAILS" && rd.fleetNoCannon.words.shipsOverHand === "TRAILS" && rd.verdict.winner === "carBig" && rd.verdict.qualified.join() === "carBig"
        && G.FIGHTS.every((f) => Object.keys(re[f]).every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! against the plain ship: the car's gunner +1.760, +1.556, +0.605; the hand gunner +0.905, +1.234, +0.057 (CANNOT BE TOLD with no cannon: the helm leads there only by a little); the forecast was right that carBig leads everywhere and UNDER in size (it said 0.5 and 0.3)", near(R("oneCannon").carBig, 1.760) && near(R("fleetCannon").carBig, 1.556) && near(R("fleetNoCannon").carBig, 0.605) && near(R("oneCannon").hand, 0.905) && near(R("fleetCannon").hand, 1.234) && near(R("fleetNoCannon").hand, 0.057) && rd.fleetNoCannon.words.hand === "CANNOT BE TOLD");
    ok("!! AND THE PAGE CARRIES IT: the `best` preset is the car's always-firing gunner under the cannon-aware fly-wired helm, the cannon on", ["car-big", "bysize"].includes(C.presetOf("best").choice.hand) && ["flywired", "split"].includes(C.presetOf("best").choice.helm)   /* since 2026-11-21 the split helm: tools/ship/takeSplitHelm.mjs */ && C.presetOf("best").choice.cannon === true   /* the car's gunner, or since 2026-11-20 the by-size hand that is the car's gunner one ship a side (tools/ship/takeBySizeLoadout.mjs) */);
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeBestShipLoadout.mjs held by its gate (it found these 2 unnamed at the ship):
{
    const EXPORTS = await import("./takeBestShipLoadout.mjs");
    const NAMED = ["CHALLENGERS", "SETUP"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
