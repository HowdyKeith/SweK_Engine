// WebGLEngine/tools/ship/takeButtonUntried-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeButtonUntried-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE BUTTON'S UNTRIED FIGHTS, HELD. tools/ship/takeButtonUntried.mjs flies the button's pick and the car's gunner in fleets of four and without the cannon. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (721001- to 751001-), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: eight arms, each once; the gain pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 15 mutants of tools/ship/takeButtonUntried.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: 14 RED the first time, ONE 0-RED, A GAP, CLOSED -- a file
//   another policy's taken unchecked (the jobs row now refuses one) -> 1. No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeButtonUntried.mjs";
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

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeButtonUntried.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeButtonUntried-selfcheck -- the best-ship button where it was not flown\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! four fights, 300 pairs each, the duel's kinds 75 apiece, on 721001-, 731001-, 741001- and 751001-; none flown by another fly-wired study", G.FIGHTS.join() === "fleet4Cannon,fleet4NoCannon,fleet3NoCannon,oneEscortsNoCannon" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.fleet4Cannon[0].seed === 721001 && G.SETS.oneEscortsNoCannon[299].seed === 751075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0];
    ok("!! THE JOBS: four ships a side with the cannon on both sides and with none, three with none, one ship and four escorts a side with none (D.MAX_SHIPS is 4); the cannon-aware helm on side X; the car's gunner and the button's pick (seatFlyWired11 at its 45-degree file); side Y plain; and IN EVERY ONE OF THESE FIGHTS THE PAGE'S BY-SIZE HAND PICKS THE 45-DEGREE GUNNER", D.MAX_SHIPS === 4 && j("fleet4Cannon", "car").opts.ships === 4 && j("fleet4Cannon", "car").x.cannon && j("fleet4Cannon", "car").y.cannon && !j("fleet4NoCannon", "button").x.cannon && !j("fleet4NoCannon", "button").y.cannon && j("fleet3NoCannon", "car").opts.ships === 3 && j("oneEscortsNoCannon", "button").opts.ships === 1 && j("oneEscortsNoCannon", "button").opts.escorts === 4 && j("fleet4Cannon", "car").opts.escorts === undefined
        && j("fleet4Cannon", "car").x.network === b.car && j("fleet3NoCannon", "button").x.network === b.fly && G.FIGHTS.every((f) => j(f, "car").x.helmNet === b.helm && !j(f, "car").y.network) && G.FIGHTS.every((f) => C.HANDS.find((h) => h.id === "bysize").bySize.fleet === "flywired" && (G.SETUP[f].ships > 1 || G.SETUP[f].escorts > 0)) && C.FILES["seat-flywired"].path === "brain/seatFlyWired11WeightsDefault.json" && (() => { try { G.brainsOf((f) => (f === G.FILES.fly ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsDefault\.json/.test(e.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fleet4Cannon: [1, 1.2], fleet4NoCannon: [1, 1.1], fleet3NoCannon: [1, 1], oneEscortsNoCannon: [1, 0.9] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "button" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.fleet4Cannon.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! eight arms, each once; the gain is THE BUTTON'S LESS THE CAR'S pair by pair (0.2, 0.1, exactly 0, -0.1); the pick does not hold here (it trails one ship with escorts)", calls.length === 8 && new Set(calls).size === 8 && close(r.fleet4Cannon.reading.gain, 0.2) && close(r.oneEscortsNoCannon.reading.gain, -0.1) && r.fleet3NoCannon.reading.gain.mean === 0 && close(r.fleet4Cannon.reading.button, 1.2) && close(r.fleet4Cannon.reading.car, 1) && !r.verdict.ok && /in oneEscortsNoCannon the button's pick TRAILS/.test(r.verdict.reasons.join()));
    const q = (...z) => G.qualifies(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { gain: { z: z[i] } } }])));
    ok("!! WHAT IS DECIDED: the pick HOLDS if it trails nowhere -- no lead is needed (0 everywhere holds); a trail anywhere does not; -1.99 is not a trail", q(0, 0, 0, 0).ok && q(1.99, -1.99, 0, 5).ok && !q(5, 5, 5, -2).ok && !q(-2, 0, 0, 0).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "untried-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ car: k(f, "car"), button: k(f, "button") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- THE BUTTON'S PICK HOLDS: the button's less the car's is +0.269 (fleets of four, the cannon), +0.543 (four, none), +0.522 (three, none) -- all LEAD -- and -0.015 (CANNOT BE TOLD) one ship a side with four escorts and no cannon; it trails nowhere", near(R("fleet4Cannon").gain, 0.269) && near(R("fleet4NoCannon").gain, 0.543) && near(R("fleet3NoCannon").gain, 0.522) && near(R("oneEscortsNoCannon").gain, -0.015) && ["fleet4Cannon", "fleet4NoCannon", "fleet3NoCannon"].every((f) => rd[f].words.gain === "LEADS") && rd.oneEscortsNoCannon.words.gain === "CANNOT BE TOLD" && rd.verdict.ok
        && G.FIGHTS.every((f) => ["car", "button", "gain"].every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! the forecast was right in fleets (it said leads) and UNDER without the cannon (+0.5 against a forecast like one ship a side's +0.15), and wrong one ship a side with escorts (level); AND THE BY-SIZE NOTE NO LONGER SAYS IT WAS NOT FLOWN IN FLEETS OF FOUR", near(R("fleet4NoCannon").button, 1.035) && near(R("oneEscortsNoCannon").car, 1.622) && !/NOT flown in fleets of four or more/.test(C.HANDS.find((h) => h.id === "bysize").note));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
