// WebGLEngine/tools/ship/takePresetsHard-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takePresetsHard-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE PRESETS' HARD FIGHTS, HELD. tools/ship/takePresetsHard.mjs flies the best-ship and best-fleet presets rationed and against the trained pilot. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (621001- rationed, 631001- pilot-flown escorts, 641001- the pilot's fighters), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; nothing decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 14 mutants of tools/ship/takePresetsHard.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 14 RED the first time
//   (the seeds moved, an attack short; the ration whole, the pilot on one side, the pilot in every fight, no pilot for the raiders, no helm against them, the two presets one gunner, no escorts; the gain's sign; a file unchecked;
//   the second read and a --write let through; one arm's leads for both). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takePresetsHard.mjs";
import * as BS from "./takeBySizeLoadout.mjs";
import * as HT from "./takeFlyWiredHelmTune.mjs";
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
const CMD = fileURLToPath(new URL("./takePresetsHard.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takePresetsHard-selfcheck -- the two presets where their notes say they were not tried\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs or attacks each, 75 of each kind: rationed on 621001-, pilot-flown escorts on 631001- (the duel's kinds), the pilot's fighters on 641001- (the fighter fight's); none flown by another fly-wired study", G.FIGHTS.join() === "rationed,pilotEscorts,pilotFighters" && G.FIGHTS.every((f) => G.SETS[f].length === 300) && G.SETS.rationed[0].seed === 621001 && G.SETS.pilotEscorts[0].seed === 631001 && G.SETS.pilotFighters[299].seed === 641075 && BF.KINDS.every((k) => G.SETS.pilotFighters.filter((p) => p.kind === k).length === 75) && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf();
    ok("!! THE BRAINS ARE THE PRESETS' SHIPPED FILES AND THE FROZEN PILOT: the cannon-aware helm, the car's gunner, seatFlyWired11 (the page's flywired hand), the pilot the pilot study flew; a file another policy's refused by name", b.helm.policy === "helmFlyWired3" && b.helm.weights.join() === "-2,-2,0.25,0.25" && b.car.policy === "gunnerPolicy" && b.fly.policy === "seatFlyWired11" && C.FILES["seat-flywired"].policy === "seatFlyWired11" && b.pilot.policy === "pilot6dofPolicy" && b.pilot.weights.length === P6.WEIGHT_COUNT && ["car-big", "bysize"].includes(C.presetOf("best").choice.hand) && ["flywired", "split"].includes(C.presetOf("best").choice.helm)   /* the split helm since 2026-11-21: tools/ship/takeSplitHelm.mjs */ && C.presetOf("best").choice.cannon === true   /* the car's gunner, or since 2026-11-20 the by-size hand that is the car's gunner one ship a side (tools/ship/takeBySizeLoadout.mjs) */ && ["{\"hand\":\"flywired\",\"helm\":\"flywired\",\"cannon\":true}", "{\"hand\":\"flywired\",\"helm\":\"split\",\"cannon\":true}"].includes(JSON.stringify(C.presetOf("fleet").choice))   /* the split helm since 2026-11-21: tools/ship/takeSplitHelmFleet.mjs */
        && (() => { try { G.brainsOf((f) => (f === G.FILES.fly ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsDefault\.json/.test(e.message); } })());
    const j = (f, arm, i) => G.jobsOf(f, arm, b, [G.SETS[f][i]])[0], r = j("rationed", "ship", 0), e = j("pilotEscorts", "fleet", 1), p = j("pilotFighters", "ship", 2);
    ok("!! THE JOBS: rationed, three ships a side with a quarter of every magazine and no pilot; pilot-flown escorts, three ships and six escorts a side, BOTH sides' escorts the pilot's, whole magazines; the pilot's fighters, a fighter job with the preset's gunner AND HELM and the pilot named; the cannon on both sides; side Y plain", r.x.network === b.car && r.x.helmNet === b.helm && r.opts.ammo === 0.25 && r.opts.escorts === undefined && r.x.pilotNet === undefined && e.x.network === b.fly && e.x.helmNet === b.helm && e.opts.escorts === 6 && e.opts.ammo === undefined && e.x.pilotNet === b.pilot && e.y.pilotNet === b.pilot && [r, e].every((q) => q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet && q.opts.ships === 3)
        && p.vsFighters.network === b.car && p.vsFighters.helm === b.helm && p.vsFighters.opts.pilotNet === b.pilot && p.vsFighters.seed === G.SETS.pilotFighters[2].seed);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { rationed: [1, 1.05], pilotEscorts: [1, 1.2], pilotFighters: [0.1, 0.05] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "fleet" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.rationed.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is THE FLEET PRESET LESS THE SHIP PRESET pair by pair (0.05, 0.2, -0.05); each preset read against the plain ship; nothing decided", calls.length === 6 && new Set(calls).size === 6 && close(r.rationed.reading.fleetOverShip, 0.05) && close(r.pilotEscorts.reading.fleetOverShip, 0.2) && close(r.pilotFighters.reading.fleetOverShip, -0.05) && close(r.pilotEscorts.reading.fleet, 1.2) && close(r.pilotEscorts.reading.ship, 1) && r.verdict === undefined);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "presetshard-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--write", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know (no --write: nothing ships) and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --write/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ ship: k(f, "ship"), fleet: k(f, "fleet") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- BOTH LEAD THE PLAIN SHIP IN ALL THREE HARD FIGHTS (the car's gunner +1.550 rationed, +1.889 with pilot-flown escorts, +0.116 against the pilot's fighters; the fly-wired gunner +1.782, +2.198, +0.247), AND THE FLY-WIRED GUNNER LEADS THE CAR'S IN EVERY ONE: +0.232, +0.309, +0.131", near(R("rationed").ship, 1.550) && near(R("pilotEscorts").ship, 1.889) && near(R("pilotFighters").ship, 0.116) && near(R("rationed").fleet, 1.782) && near(R("pilotEscorts").fleet, 2.198) && near(R("pilotFighters").fleet, 0.247) && near(R("rationed").fleetOverShip, 0.232) && near(R("pilotEscorts").fleetOverShip, 0.309) && near(R("pilotFighters").fleetOverShip, 0.131) && G.FIGHTS.every((f) => ["ship", "fleet", "fleetOverShip"].every((q) => rd[f].words[q] === "LEADS"))
        && G.FIGHTS.every((f) => ["ship", "fleet", "fleetOverShip"].every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! AND WHAT IT MEANS FOR THE BY-SIZE HAND, SAID: ONE SHIP AGAINST FIGHTERS it picks the car's gunner (one ship), which trails the fly-wired one there by 0.131 -- the size is not the whole of the rule; the forecast was right that both lead and UNDER against the pilot's fighters (it said about level)", near(R("pilotFighters").fleetOverShip, 0.131) && /against fighters/i.test(C.HANDS.find((h) => h.id === "bysize").note));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
