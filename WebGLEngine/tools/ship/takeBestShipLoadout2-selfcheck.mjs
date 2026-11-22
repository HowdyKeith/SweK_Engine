// WebGLEngine/tools/ship/takeBestShipLoadout2-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeBestShipLoadout2-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SECOND LOADOUT STUDY, HELD. tools/ship/takeBestShipLoadout2.mjs flies the cannon-aware fly-wired helm over the car's always-firing gunner (the button now), the hand gunner and the page's fly-wired gunner, with escorts and with rationed magazines. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (341001- for both escort fleets, 351001- rationed), disjoint from every other fly-wired study's; the files the arms carry (each checked by its policy); the jobs' ships, cannon, gunner and helm
//   2  THE STUDY             against a stand-in: nine arms, each once; the gains pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights, and the preset as it stands
//
// SABOTAGE LOG: 17 mutants of tools/ship/takeBestShipLoadout2.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 17 RED the first time
//   (the seeds moved, the escort fleets on separate lists, a pair short; the ration whole, the ration and the escorts not passed, the escort fleet's cannon off, the cannon on one side; no helm, the page's old fly gunner;
//   the gains against the hand, the hand the incumbent; a lead enough without the no-trail rule, the first picked; the car's file unchecked; the second read and an unknown option let through).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeBestShipLoadout2.mjs";
import * as BL from "./takeBestShipLoadout.mjs";
import * as SE from "./takeFlyWiredGunnerSees.mjs";
import * as HS from "./takeFlyWiredGunnerHoldSees.mjs";
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
const CMD = fileURLToPath(new URL("./takeBestShipLoadout2.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeBestShipLoadout2-selfcheck -- what the best-ship button carries, asked again\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, SE, HS, NX].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs each, the duel's kinds 75 apiece: both escort fleets on the SAME pairs (341001-), the rationed fleets on 351001-; none flown by another fly-wired study", G.FIGHTS.join() === "escorts,escortsCannon,rationed" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.escorts === G.SETS.escortsCannon && G.SETS.escorts[0].seed === 341001 && G.SETS.rationed[299].seed === 351075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), car = JSON.parse(fs.readFileSync(G.CAR_BIG_FILE, "utf8"));
    ok("!! THE ARMS' BRAINS: the helm helmFlyWired3 at the shipped -2, -2, 0.25, 0.25 on every arm; carBig gunnerPolicy with its file's 896 weights (THE INCUMBENT); fly seatFlyWired8 at -3, -3, 0.1 (the page's flywired hand); hand no network; a file another policy's refused by name", G.INCUMBENT === "carBig" && G.CHALLENGERS.join() === "hand,fly" && b.helm.policy === "helmFlyWired3" && b.helm.weights.join() === "-2,-2,0.25,0.25" && b.carBig.policy === "gunnerPolicy" && b.carBig.weights.join() === Float32Array.from(car.weights).join() && b.fly.policy === "seatFlyWired8" && b.fly.weights.join() === "-3,-3,0.1" && b.hand === null && ["seatFlyWired8", "seatFlyWired9", "seatFlyWired10", "seatFlyWired11"].includes(C.FILES["seat-flywired"].policy)   /* the page's flywired hand when registered (8), and since (9) */
        && (() => { try { G.brainsOf((f) => (f === G.CAR_BIG_FILE ? JSON.parse(fs.readFileSync(G.HELM_FILE, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatTurretGunnerWeightsBig\.json/.test(e.message); } })());
    const e = G.jobsOf("escorts", "fly", b, [G.SETS.escorts[0]])[0], ec = G.jobsOf("escortsCannon", "carBig", b, [G.SETS.escortsCannon[1]])[0], r = G.jobsOf("rationed", "hand", b, [G.SETS.rationed[2]])[0];
    ok("!! THE JOBS: escort fleets of three ships and six escorts a side, whole magazines, no cannon and the cannon on both sides; the rationed fleets three ships, no escorts, the cannon on both sides and A QUARTER OF EVERY MAGAZINE; the gunner and the helm on side X only", e.opts.ships === 3 && e.opts.escorts === 6 && e.opts.ammo === undefined && !e.x.cannon && !e.y.cannon && ec.opts.escorts === 6 && ec.x.cannon && ec.y.cannon && r.opts.ships === 3 && r.opts.escorts === undefined && r.opts.ammo === 0.25 && r.x.cannon && r.y.cannon && e.x.network === b.fly && ec.x.network === b.carBig && r.x.network === null && [e, ec, r].every((j) => j.x.helmNet === b.helm && !j.y.network && !j.y.helmNet) && r.seed === G.SETS.rationed[2].seed && r.kind === G.SETS.rationed[2].kind);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { escorts: { carBig: 0.2, hand: 0.6, fly: 0.1 }, escortsCannon: { carBig: 0.1, hand: 0.4, fly: -0.2 }, rationed: { carBig: 0, hand: 0.1, fly: 0 } }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm] * factor(i)); }, () => {}), mf = G.SETS.escorts.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! nine arms, each once; each challenger's gain is it LESS THE CAR'S GUNNER pair by pair (hand 0.4, 0.3, 0.1; fly -0.1, -0.3, 0); the hand is chosen here", calls.length === 9 && new Set(calls).size === 9 && close(r.escorts.reading.handOverCar, 0.4) && close(r.escortsCannon.reading.handOverCar, 0.3) && close(r.rationed.reading.handOverCar, 0.1) && close(r.escorts.reading.flyOverCar, -0.1) && close(r.escortsCannon.reading.flyOverCar, -0.3) && r.rationed.reading.flyOverCar.mean === 0 && close(r.escorts.reading.carBig, 0.2) && r.verdict.winner === "hand" && r.verdict.qualified.join() === "hand");
    const q = (h1, h2, h3, f1, f2, f3, m = [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]) => G.decide(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { handOverCar: { z: [h1, h2, h3][i], mean: m[i] }, flyOverCar: { z: [f1, f2, f3][i], mean: m[3 + i] } } }])));
    ok("!! WHAT IS DECIDED: a challenger takes the preset if it LEADS the car's gunner somewhere (z 2) and TRAILS it nowhere (z -2 trails); none qualifying keeps the CAR'S GUNNER; of two qualifying, the larger mean of its three gains", q(2, 0, 0, 0, 0, 0).winner === "hand" && q(1.99, 1.99, 1.99, 0, 0, 0).winner === "carBig" && q(5, 5, -2, 0, 0, 0).winner === "carBig" && q(5, 5, -1.99, 0, 0, 0).winner === "hand" && q(0, 0, 0, 0, 3, 0).winner === "fly"
        && q(3, 3, 3, 3, 3, 3, [0.1, 0.1, 0.1, 0.2, 0.2, 0.2]).winner === "fly" && q(3, 3, 3, 3, 3, 3, [0.3, 0.3, 0.3, 0.2, 0.2, 0.2]).winner === "hand" && q(3, 3, 3, 3, 3, 3).qualified.join() === "hand,fly");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loadout2-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings(Object.fromEntries(G.ARMS.map((arm) => [arm, k(f, arm)]))).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- THE PRESET STAYS: under the cannon-aware helm the car's always-firing gunner leads both challengers in every fight -- the hand gunner by 1.283, 0.905 and 0.189 (with escorts, without and with the cannon; rationed), the fly-wired gunner by 0.851, 0.796 and 0.381; every gain TRAILS", near(R("escorts").handOverCar, -1.283) && near(R("escortsCannon").handOverCar, -0.905) && near(R("rationed").handOverCar, -0.189) && near(R("escorts").flyOverCar, -0.851) && near(R("escortsCannon").flyOverCar, -0.796) && near(R("rationed").flyOverCar, -0.381) && G.FIGHTS.every((f) => rd[f].words.handOverCar === "TRAILS" && rd[f].words.flyOverCar === "TRAILS") && rd.verdict.winner === "carBig" && rd.verdict.qualified.length === 0
        && G.FIGHTS.every((f) => Object.keys(re[f]).every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! against the plain ship the car's gunner +0.987, +1.716, +1.549; the hand gunner -0.296 (TRAILS: with escorts and no cannon the cannon-aware helm over the hand gunner loses), +0.812, +1.359; the fly-wired gunner +0.136, +0.920, +1.167. The forecast was right with escorts and WRONG rationed: the car's gunner did not run dry enough to lose", near(R("escorts").carBig, 0.987) && near(R("escortsCannon").carBig, 1.716) && near(R("rationed").carBig, 1.549) && near(R("escorts").hand, -0.296) && rd.escorts.words.hand === "TRAILS" && near(R("escortsCannon").hand, 0.812) && near(R("rationed").hand, 1.359) && near(R("escorts").fly, 0.136) && near(R("escortsCannon").fly, 0.920) && near(R("rationed").fly, 1.167));
    ok("!! AND THE PAGE STILL CARRIES THE CAR'S GUNNER, its note no longer saying the rationed and escort fights were not tried", ["car-big", "bysize"].includes(C.presetOf("best").choice.hand) && ["flywired", "split"].includes(C.presetOf("best").choice.helm)   /* since 2026-11-21 the split helm: tools/ship/takeSplitHelm.mjs */ && C.presetOf("best").choice.cannon === true   /* the car's gunner, or since 2026-11-20 the by-size hand that is the car's gunner one ship a side (tools/ship/takeBySizeLoadout.mjs) */ && !/NOT tried with rationed magazines/.test(C.presetOf("best").note) && /a quarter of every magazine/.test(C.presetOf("best").note));
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeBestShipLoadout2.mjs held by its gate (it found these 3 unnamed at the ship):
{
    const EXPORTS = await import("./takeBestShipLoadout2.mjs");
    const NAMED = ["ESCORTS", "RATION", "SETUP"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
