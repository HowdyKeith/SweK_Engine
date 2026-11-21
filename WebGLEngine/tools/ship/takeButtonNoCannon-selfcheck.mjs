// WebGLEngine/tools/ship/takeButtonNoCannon-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeButtonNoCannon-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE BY-THE-FIGHT BUTTON'S PICKS WITHOUT A CANNON, HELD. Three things hold tools/ship/takeButtonNoCannon.mjs:
//
//   1  WHAT WAS REGISTERED   the pairs, disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: each arm once; the gains pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// @@READ@@
//
// SABOTAGE LOG: 16 mutants of tools/ship/takeButtonNoCannon.mjs, before any pair was flown: ALL 16 RED the first time (a seed moved, a pair short; the cannon on either side, no helm, the old helm file, the no-window pick in fleets, a fleet of one,
//   car-big's file car-today's; the gain's sign, a lead at 1.9, the smaller of two leads taken; a file unchecked; the second read and an unknown option let through; one arm's leads for all).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as OH from "./takeButtonOneHard.mjs";
import * as HL from "./takeHelmLadder.mjs";
import * as SW from "./takeSineTwins.mjs";
import * as UT from "./takeButtonUntried.mjs";
import * as LD from "./takeLadder.mjs";
import * as BY from "./takeBySightLoadout.mjs";
import * as HC from "./takeFlyWiredHelmControl.mjs";
import * as OW from "./takeFlyWiredOneWindow.mjs";
import * as BS from "./takeBySizeLoadout.mjs";
import * as HT from "./takeFlyWiredHelmTune.mjs";
import * as PH from "./takePresetsHard.mjs";
import * as BL3 from "./takeBestShipLoadout3.mjs";
import * as TR from "./takeFlyWiredGunnerTrigger.mjs";
import * as CT from "./takeFlyWiredGunnerControl.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as VP from "./takeFlyWiredGunnerVsPilot.mjs";
import * as TU from "./takeFlyWiredGunnerTune.mjs";
import * as PI from "./takeFlyWiredPilot.mjs";
import * as BL from "./takeBestShipLoadout.mjs";
import * as BL2 from "./takeBestShipLoadout2.mjs";
import * as GS from "./takeFlyWiredGunnerShips.mjs";
import * as GM from "./takeFlyWiredGunnerMixed.mjs";
import * as GH from "./takeFlyWiredGunnerHold.mjs";
import * as SE from "./takeFlyWiredGunnerSees.mjs";
import * as HSS from "./takeFlyWiredGunnerHoldSees.mjs";
import * as NE from "./takeFlyWiredGunnerNear.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as NX from "./takeFlyWiredNext.mjs";
import * as GN from "./takeFlyWiredGunner.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import { sideOf } from "./pairPool.mjs";
import * as CTD from "./takeCarToday.mjs";
import * as BLAST from "./takeButtonLast.mjs";
import * as SC from "./takeSteerCannon.mjs";
import * as NC from "./takeFlyWiredHelmNoCannon.mjs";
import * as AX from "./takeFlyWiredHelmAxes.mjs";
import * as TT from "./trainTurretSeatToday.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as TA from "./takeTurretAudit.mjs";

import * as G from "./takeButtonNoCannon.mjs";
import * as CTE from "./takeCarTodayEscorts.mjs";
import * as SH from "./takeSineHelmNoCannon.mjs";
import * as TF from "./trainTurretSeatFleet.mjs";
import * as OA from "./takeFlyWiredHelmOneAxis.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeButtonNoCannon.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeButtonNoCannon-selfcheck\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed })), ...[BLAST, SC, NC, AX, CTD, CTE, OA].flatMap((M) => seedsOf(M.SETS)).map((seed) => ({ seed })), ...TT.SETS.train, ...TT.SETS.held, ...TT.SETS.audit].map((p) => p.seed);
    const ext = [...SH.SETS.train.one, ...SH.SETS.train.fleet, ...SH.SETS.held.one, ...SH.SETS.held.fleet, ...SH.SETS.audit.one, ...SH.SETS.audit.fleet, ...TF.SETS.train, ...TF.SETS.held, ...TF.SETS.audit].map((p) => p.seed);
    ok("!! two fights, 300 pairs each, 75 of each kind, on 1251001- and 1261001-; none flown by another fly-wired study", G.FIGHTS.join() === "one,fleet" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.one[0].seed === 1251001 && G.SETS.fleet[299].seed === 1261075 && others.length > 4000 && [...others, ...ext].every((x) => !mine.has(x)), `${others.length + ext.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], ob = j("one", "button"), fb = j("fleet", "button"), og = j("one", "big"), ft = j("fleet", "today");
    ok("!! THE JOBS: NO CANNON on either side; the page's cannon-aware helm (-0.25 without a cannon) on side X; the button's pick the no-window gunner one ship a side, the 45-degree one in fleets of three; car-big and car-today the other arms; the plain ship opposite", ob.x.network === b.flyOne && b.flyOne.weights[4] === 0 && fb.x.network === b.fly && og.x.network === b.big && ft.x.network === b.today && ob.opts.ships === 1 && fb.opts.ships === 3 && [ob, fb, og, ft].every((q) => q.x.cannon === false && q.y.cannon === false && q.x.helmNet === b.helm && !q.y.network && !q.y.helmNet)
        && b.helm.weights.join() === "-2,-2,-0.25,-0.25" && C.FILES["helm-flywired"].path.endsWith(path.basename(G.FILES.helm)) && C.FILES["car-big"].path.endsWith(path.basename(G.FILES.big)) && C.FILES["car-today"].path.endsWith(path.basename(G.FILES.today)));
    ok("!! a file of another policy is refused by name", (() => { try { G.brainsOf((f) => (f === G.FILES.big ? JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatTurretGunnerWeightsBig\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { one: { button: 1, big: 1.1, today: 1.2 }, fleet: { button: 1, big: 0.9, today: 1 } }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm] * factor(i)); }, () => {}), mf = G.SETS.one.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gains are EACH CAR GUNNER LESS THE PICK pair by pair (0.1, 0.2; -0.1, 0)", calls.length === 6 && new Set(calls).size === 6 && close(r.one.reading.bigGain, 0.1) && close(r.one.reading.todayGain, 0.2) && close(r.fleet.reading.bigGain, -0.1) && close(r.fleet.reading.todayGain, 0) && close(r.one.reading.button, 1));
    ok("!! here one ship a side takes car-today (the larger of two leads), fleets keep the pick", r.verdict.takes.one === "today" && r.verdict.takes.fleet === "button" && r.verdict.ok);
    const q = (bo, to, bf, tf, mb = 0.1, mt = 0.2) => G.decide({ one: { reading: { bigGain: { z: bo, mean: mb }, todayGain: { z: to, mean: mt } } }, fleet: { reading: { bigGain: { z: bf, mean: mb }, todayGain: { z: tf, mean: mt } } } }).takes;
    ok("!! WHAT IS DECIDED, each fight apart: the pick holds unless a car gunner LEADS (z >= 2); of two that lead, the larger lead", q(0, 0, 0, 0).one === "button" && q(1.99, 1.99, 0, 0).one === "button" && q(2, 0, 0, 0).one === "big" && q(2, 2, 0, 0).one === "today" && q(2, 2, 0, 0, 0.3, 0.2).one === "big" && q(0, 0, 0, 2).fleet === "today" && q(0, 0, 0, 2).one === "button" && !G.decide({ one: { reading: { bigGain: { z: 0, mean: 0 }, todayGain: { z: 0, mean: 0 } } }, fleet: { reading: { bigGain: { z: 0, mean: 0 }, todayGain: { z: 0, mean: 0 } } } }).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "takebuttonnocannon-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    // @@FOUND@@
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
