// WebGLEngine/tools/ship/takeFlyWiredOneWindow-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredOneWindow-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE NO-WINDOW GUNNER'S STUDY, HELD. tools/ship/takeFlyWiredOneWindow.mjs flies the car's gunner and the fly-wired gunner with no hand window one ship a side. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (701001- with the cannon, 711001- without), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: four arms, each once; the gain pair by pair; what ships; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 14 mutants of tools/ship/takeFlyWiredOneWindow.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 14 RED the first time
//   (the seeds moved, a pair short; the window kept at 45, the cannon in both fights, a fleet, no helm, the cannon on one side; the gain's sign, one fight allowed to lead, a trail at exactly -2 let by; a file unchecked;
//   the second read and an unknown option let through; one arm's leads for both). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredOneWindow.mjs";
import * as HC from "./takeFlyWiredHelmControl.mjs";
import * as BY from "./takeBySightLoadout.mjs";
import * as FS from "../../brain/flySteering.mjs";
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
const CMD = fileURLToPath(new URL("./takeFlyWiredOneWindow.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeFlyWiredOneWindow-selfcheck -- one fly-wired gunner for every size of fight\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! two fights, 300 pairs each, the duel's kinds 75 apiece, on 701001- and 711001-; none flown by another fly-wired study", G.FIGHTS.join() === "oneCannon,oneNoCannon" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.oneCannon[0].seed === 701001 && G.SETS.oneNoCannon[299].seed === 711075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), page = JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")).weights, j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0];
    ok("!! THE ARMS: the car's gunner (its shipped file) and seatFlyWired11 at its SHIPPED weights with the fifth -- the hand's window -- set to 0; one ship a side, the cannon on both sides in oneCannon and neither in oneNoCannon; the cannon-aware helm on side X; side Y plain; a file another policy's refused", b.car.policy === "gunnerPolicy" && b.fly0.policy === "seatFlyWired11" && b.fly0.weights.slice(0, 4).every((v, i) => Math.abs(v - page[i]) < 1e-6) && b.fly0.weights[4] === 0 && Math.abs(page[4] - Math.PI / 4) < 1e-6 && j("oneCannon", "fly0").x.network === b.fly0 && j("oneNoCannon", "car").x.network === b.car && j("oneCannon", "car").x.cannon && j("oneCannon", "car").y.cannon && !j("oneNoCannon", "fly0").x.cannon && !j("oneNoCannon", "fly0").y.cannon && G.FIGHTS.every((f) => j(f, "car").opts.ships === 1 && j(f, "car").x.helmNet === b.helm && !j(f, "car").y.network)
        && (() => { try { G.brainsOf((f) => (f === G.FILES.fly ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsDefault\.json/.test(e.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { oneCannon: { car: 1, fly0: 1.1 }, oneNoCannon: { car: 1, fly0: 0.9 } }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm] * factor(i)); }, () => {}), mf = G.SETS.oneCannon.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! four arms, each once; the gain is NO WINDOW LESS THE CAR'S pair by pair (0.1, -0.1); it does not ship here (a fight trails)", calls.length === 4 && new Set(calls).size === 4 && close(r.oneCannon.reading.gain, 0.1) && close(r.oneNoCannon.reading.gain, -0.1) && close(r.oneCannon.reading.fly0, 1.1) && close(r.oneCannon.reading.car, 1) && !r.verdict.ok && /in oneNoCannon the gain TRAILS/.test(r.verdict.reasons.join()));
    const q = (...z) => G.qualifies(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { gain: { z: z[i] } } }])));
    ok("!! WHAT SHIPS: a lead in either fight is enough; (1.99, 1.99) no; a trail in either no; -1.99 is not a trail", q(2, 0).ok && q(0, 2).ok && !q(1.99, 1.99).ok && !q(5, -2).ok && !q(-2, 5).ok && q(5, -1.99).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "onewin-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading, blob = JSON.parse(fs.readFileSync(G.OUT, "utf8"));
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ car: k(f, "car"), fly0: k(f, "fly0") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IT SHIPS: one ship a side the fly-wired gunner with no hand window less the car's is +0.018 (CANNOT BE TOLD) with the cannon and +0.145 (z 3.9, LEADS) without; it trails nowhere", near(R("oneCannon").gain, 0.018) && rd.oneCannon.words.gain === "CANNOT BE TOLD" && near(R("oneNoCannon").gain, 0.145) && rd.oneNoCannon.words.gain === "LEADS" && rd.verdict.ok
        && G.FIGHTS.every((f) => ["car", "fly0", "gain"].every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! against the plain ship: the car's +1.785 and +1.216, no window +1.802 and +1.361; the forecast was right with the cannon and UNDER without (it said about the same); AND THE FILE AND THE PAGE: a seatFlyWired11 brain with the window 0, which the by-size hand takes one ship a side", near(R("oneCannon").car, 1.785) && near(R("oneNoCannon").fly0, 1.361) && blob.policy === "seatFlyWired11" && blob.weights[4] === 0 && C.FILES["seat-flywired-one"].path.endsWith("seatFlyWired11WeightsOne.json") && C.HANDS.find((h) => h.id === "bysize").bySize.one === "flywired-one");
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeFlyWiredOneWindow.mjs held by its gate (it found these 1 unnamed at the ship):
{
    const EXPORTS = await import("./takeFlyWiredOneWindow.mjs");
    const NAMED = ["WINDOW0"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
