// WebGLEngine/tools/ship/takeBestShipLoadout3-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeBestShipLoadout3-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE THIRD LOADOUT STUDY, HELD. tools/ship/takeBestShipLoadout3.mjs flies two helms over two gunners against the plain ship, to say what the best-ship button carries. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (501001- one ship a side, 511001- fleets, 521001- escorts), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: twelve arms, each once; the gains pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 16 mutants of tools/ship/takeBestShipLoadout3.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 16 RED the first time
//   (the seeds moved, a pair short; one ship a side flown as a fleet, no escorts, the cannon on one side; the helm on every arm, the fly arm the car's gunner, the page's old fly file, a file unchecked; the gains against another arm;
//   a lead enough without the no-trail rule, a looser trail, the first picked; the second read and an unknown option let through; one arm's leads for all). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeBestShipLoadout3.mjs";
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
const CMD = fileURLToPath(new URL("./takeBestShipLoadout3.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeBestShipLoadout3-selfcheck -- the best-ship button's helm and gunner together\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs each, the duel's kinds 75 apiece, on 501001-, 511001- and 521001-; none flown by another fly-wired study", G.FIGHTS.join() === "oneCannon,fleetCannon,escortsCannon" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.oneCannon[0].seed === 501001 && G.SETS.fleetCannon[0].seed === 511001 && G.SETS.escortsCannon[299].seed === 521075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf();
    ok("!! THE BRAINS ARE THE SHIPPED FILES: the cannon-aware helm at -2, -2, 0.25, 0.25; the car's gunner its 896 weights; the page's fly gunner seatFlyWired11 (the file the page's flywired hand loads); a file another policy's refused by name", b.helm.policy === "helmFlyWired3" && b.helm.weights.join() === "-2,-2,0.25,0.25" && b.car.policy === "gunnerPolicy" && b.car.weights.length === 896 && b.fly.policy === "seatFlyWired11" && C.FILES["seat-flywired"].policy === "seatFlyWired11" && C.FILES["seat-flywired"].path.endsWith("seatFlyWired11WeightsDefault.json")
        && (() => { try { G.brainsOf((f) => (f === G.FILES.fly ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsDefault\.json/.test(e.message); } })());
    const j = (f, arm, i) => G.jobsOf(f, arm, b, [G.SETS[f][i]])[0], a = j("oneCannon", "helmCar", 0), c = j("fleetCannon", "helmFly", 1), d = j("escortsCannon", "faceCar", 2), e = j("oneCannon", "faceFly", 3);
    ok("!! THE ARMS: the button now (the cannon-aware helm over the car's gunner) and three challengers -- the helm over the fly gunner, the bow-on rule over each; the cannon on both sides in every fight; one ship a side, three, three with six escorts; side Y plain", G.INCUMBENT === "helmCar" && G.CHALLENGERS.join() === "helmFly,faceCar,faceFly" && a.x.network === b.car && a.x.helmNet === b.helm && c.x.network === b.fly && c.x.helmNet === b.helm && d.x.network === b.car && d.x.helmNet === null && e.x.network === b.fly && e.x.helmNet === null && [a, c, d, e].every((q) => q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet) && a.opts.ships === 1 && c.opts.ships === 3 && c.opts.escorts === undefined && d.opts.escorts === 6 && e.seed === G.SETS.oneCannon[3].seed);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { oneCannon: { helmCar: 1, helmFly: 1.2, faceCar: 0.5, faceFly: 1.1 }, fleetCannon: { helmCar: 1, helmFly: 1.1, faceCar: 1.1, faceFly: 1.3 }, escortsCannon: { helmCar: 1, helmFly: 1, faceCar: 1.2, faceFly: 0.9 } };
    const calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm] * factor(i)); }, () => {}), mf = G.SETS.oneCannon.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! twelve arms, each once; each challenger's gain is it LESS THE BUTTON pair by pair (helmFly 0.2, 0.1, exactly 0; faceCar -0.5, 0.1, 0.2; faceFly 0.1, 0.3, -0.1); helmFly is chosen here (faceCar and faceFly trail somewhere)", calls.length === 12 && new Set(calls).size === 12 && close(r.oneCannon.reading.helmFlyOverButton, 0.2) && r.escortsCannon.reading.helmFlyOverButton.mean === 0 && close(r.oneCannon.reading.faceCarOverButton, -0.5) && close(r.escortsCannon.reading.faceFlyOverButton, -0.1) && close(r.fleetCannon.reading.faceFly, 1.3) && r.verdict.winner === "helmFly" && r.verdict.qualified.join() === "helmFly");
    const q = (z, m) => G.decide(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: Object.fromEntries(G.CHALLENGERS.map((c) => [`${c}OverButton`, { z: (z[c] || [0, 0, 0])[i], mean: (m && m[c]) || 0.1 }])) }])));
    ok("!! WHAT IS DECIDED: a challenger takes the button if it LEADS it somewhere (z 2) and TRAILS it nowhere (z -2 trails); none qualifying keeps the button's loadout; of several, the largest mean gain", q({ faceCar: [2, 0, 0] }).winner === "faceCar" && q({ faceCar: [1.99, 1.99, 1.99] }).winner === "helmCar" && q({ faceCar: [5, 5, -2] }).winner === "helmCar" && q({ faceCar: [5, 5, -1.99] }).winner === "faceCar" && q({ faceCar: [3, 0, 0], faceFly: [3, 0, 0] }, { faceCar: 0.1, faceFly: 0.3 }).winner === "faceFly" && q({ faceCar: [3, 0, 0], faceFly: [3, 0, 0] }, { faceCar: 0.4, faceFly: 0.3 }).winner === "faceCar" && q({}).winner === "helmCar");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "loadout3-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings(Object.fromEntries(G.ARMS.map((arm) => [arm, k(f, arm)]))).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- THE BUTTON STAYS, BY ONE FIGHT: the cannon-aware helm over the fly gunner LEADS the button in fleets (+0.183) and with escorts (+0.344) but TRAILS it ONE SHIP A SIDE (-0.097, z -2.9), the page's default fight; the bow-on arms trail it everywhere (-0.47 to -1.22)", near(R("oneCannon").helmFlyOverButton, -0.097) && rd.oneCannon.words.helmFlyOverButton === "TRAILS" && near(R("fleetCannon").helmFlyOverButton, 0.183) && near(R("escortsCannon").helmFlyOverButton, 0.344) && G.FIGHTS.every((f) => rd[f].words.faceCarOverButton === "TRAILS" && rd[f].words.faceFlyOverButton === "TRAILS") && rd.verdict.winner === "helmCar" && rd.verdict.qualified.length === 0
        && G.FIGHTS.every((f) => Object.keys(re[f]).every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! against the plain ship: the button +1.725, +1.529, +1.819; the cannon-aware helm over the fly gunner +1.627, +1.711, +2.163; the bow-on rule over the car's gunner +0.953, +0.308, +1.350 and over the fly gunner +0.745, +0.607, +1.679 -- THE HELM IS WORTH MORE THAN THE GUNNER. The forecast was right that the bow-on arms trail, and wrong one ship a side (it said the fly gunner would lead there)", near(R("oneCannon").helmCar, 1.725) && near(R("fleetCannon").helmFly, 1.711) && near(R("escortsCannon").helmFly, 2.163) && near(R("oneCannon").faceCar, 0.953) && near(R("fleetCannon").faceCar, 0.308) && near(R("oneCannon").faceFly, 0.745));
    ok("!! AND THE PAGE STILL CARRIES THE CAR'S GUNNER UNDER THE CANNON-AWARE HELM", JSON.stringify(C.presetOf("best").choice) === '{"hand":"car-big","helm":"flywired","cannon":true}');
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
