// WebGLEngine/tools/ship/takeBySizeLoadout-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeBySizeLoadout-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SIZE-PICKING LOADOUT'S STUDY, HELD. tools/ship/takeBySizeLoadout.mjs flies the best-ship button and the loadout that takes the fly-wired gunner in a fleet. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (531001- fleets of two, 541001- of three, 551001- with escorts), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what ships; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 15 mutants of tools/ship/takeBySizeLoadout.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: 14 RED the first time, ONE 0-RED, A GAP, CLOSED -- a file
//   another policy's taken unchecked (the brains row now refuses one) -> 1. No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeBySizeLoadout.mjs";
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
const CMD = fileURLToPath(new URL("./takeBySizeLoadout.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeBySizeLoadout-selfcheck -- a button that picks its gunner by the fight's size\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs each, the duel's kinds 75 apiece, on 531001-, 541001- and 551001-; none flown by another fly-wired study", G.FIGHTS.join() === "twoCannon,fleetCannon,escortsCannon" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.twoCannon[0].seed === 531001 && G.SETS.fleetCannon[0].seed === 541001 && G.SETS.escortsCannon[299].seed === 551075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf();
    ok("!! THE BRAINS ARE THE SHIPPED FILES (the cannon-aware helm, the car's gunner, the page's fly-wired gunner seatFlyWired11) and a file another policy's is refused by name; and THE RULE: the button's gunner is the car's at every size; by size the car's one ship a side and the fly-wired one from two ships up", b.helm.policy === "helmFlyWired3" && b.car.policy === "gunnerPolicy" && b.fly.policy === "seatFlyWired11" && G.gunnerOf("button", 1) === "car" && G.gunnerOf("button", 3) === "car" && G.gunnerOf("bySize", 1) === "car" && G.gunnerOf("bySize", 2) === "fly" && G.gunnerOf("bySize", 3) === "fly" && (() => { try { G.brainsOf((f) => (f === G.FILES.fly ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsDefault\.json/.test(e.message); } })());
    const j = (f, arm, i) => G.jobsOf(f, arm, b, [G.SETS[f][i]])[0], a = j("twoCannon", "bySize", 0), c = j("fleetCannon", "button", 1), d = j("escortsCannon", "bySize", 2);
    ok("!! THE JOBS: two ships a side, three, three with six escorts, the cannon on both sides; the helm on side X in every arm; the button's side the car's gunner, by size's the fly-wired one in these fleets; side Y plain", a.opts.ships === 2 && a.opts.escorts === undefined && c.opts.ships === 3 && c.opts.escorts === undefined && d.opts.ships === 3 && d.opts.escorts === 6 && a.x.network === b.fly && c.x.network === b.car && d.x.network === b.fly && [a, c, d].every((q) => q.x.helmNet === b.helm && q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet) && d.seed === G.SETS.escortsCannon[2].seed);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { twoCannon: [1, 1.05], fleetCannon: [1, 1.2], escortsCannon: [1, 0.9] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "bySize" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.twoCannon.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is BY SIZE LESS THE BUTTON pair by pair (0.05, 0.2, -0.1); it does not ship here (a fight trails)", calls.length === 6 && new Set(calls).size === 6 && close(r.twoCannon.reading.gain, 0.05) && close(r.fleetCannon.reading.gain, 0.2) && close(r.escortsCannon.reading.gain, -0.1) && close(r.fleetCannon.reading.bySize, 1.2) && close(r.fleetCannon.reading.button, 1) && !r.verdict.ok && /in escortsCannon the gain TRAILS/.test(r.verdict.reasons.join()));
    const q = (...z) => G.qualifies(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { gain: { z: z[i] } } }])));
    ok("!! WHAT SHIPS: a lead in any one fight is enough; (1.99 everywhere) no; a trail anywhere no; -1.99 is not a trail", [0, 1, 2].every((k) => q(...[0, 0, 0].map((_, i) => (i === k ? 2 : 0))).ok) && !q(1.99, 1.99, 1.99).ok && /leads in no fight/.test(q(1.99, 1.99, 1.99).reasons[0]) && !q(5, 5, -2).ok && !q(-2, 5, 5).ok && /in twoCannon the gain TRAILS/.test(q(-2, 5, 5).reasons[0]) && q(5, 5, -1.99).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bysize-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ button: k(f, "button"), bySize: k(f, "bySize") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IT SHIPS: by size less the button is +0.157 (z 5.3) in fleets of two, +0.241 (z 7.2) in fleets of three, +0.374 (z 9.8) with six escorts a side; every fight LEADS", near(R("twoCannon").gain, 0.157) && near(R("fleetCannon").gain, 0.241) && near(R("escortsCannon").gain, 0.374) && G.FIGHTS.every((f) => rd[f].words.gain === "LEADS") && rd.verdict.ok
        && G.FIGHTS.every((f) => ["button", "bySize", "gain"].every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! against the plain ship by size +1.796, +1.749, +2.126 and the button +1.638, +1.508, +1.752; the forecast was right with three ships and escorts and UNDER with two (it said about +0.05)", near(R("twoCannon").bySize, 1.796) && near(R("fleetCannon").bySize, 1.749) && near(R("escortsCannon").bySize, 2.126) && near(R("twoCannon").button, 1.638));
    ok("!! AND THE PAGE CARRIES IT: the best-ship preset is the `bysize` hand under the cannon-aware helm", JSON.stringify(C.presetOf("best").choice) === '{"hand":"bysize","helm":"flywired","cannon":true}' && ["car-big", "flywired-one"].includes(C.HANDS.find((h) => h.id === "bysize").bySize.one)   /* the car's gunner, or since 2026-11-20 the fly-wired one with no window (tools/ship/takeFlyWiredOneWindow.mjs) */ && C.HANDS.find((h) => h.id === "bysize").bySize.fleet === "flywired");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
