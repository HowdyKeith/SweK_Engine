// WebGLEngine/tools/ship/takeButtonOneHard-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeButtonOneHard-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE BUTTON'S ONE-SHIP HARD FIGHTS, HELD. tools/ship/takeButtonOneHard.mjs flies the button's one-ship picks and the car's gunner rationed and against the trained pilot's escorts. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (781001- rationed, 791001- pilot-flown escorts), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: four arms, each once; the gain pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 15 mutants of tools/ship/takeButtonOneHard.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 15 RED the first time
//   (the seeds moved, a pair short; the ration whole, the rationed pick the 45-degree gunner, the escorts' pick the no-window one, the pilot on one side, no pilot, no escorts, no helm; the gain's sign, a trail at exactly -2 let by;
//   a file unchecked; the second read and an unknown option let through; one arm's leads for both). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeButtonOneHard.mjs";
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

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeButtonOneHard.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeButtonOneHard-selfcheck -- the best-ship button one ship a side in the hard fights\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! two fights, 300 pairs each, the duel's kinds 75 apiece, on 781001- and 791001-; none flown by another fly-wired study", G.FIGHTS.join() === "oneRationed,onePilotEscorts" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.oneRationed[0].seed === 781001 && G.SETS.onePilotEscorts[299].seed === 791075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], r = j("oneRationed", "button"), e = j("onePilotEscorts", "button"), c = j("oneRationed", "car");
    ok("!! THE JOBS ARE THE BUTTON'S PICKS: rationed (one ship, nothing else, a quarter of every magazine) the NO-WINDOW gunner, as the page's by-size hand seats there; with four pilot-flown escorts a side the 45-degree one; the car's gunner the other arm; the cannon on both sides; the cannon-aware helm on side X; side Y plain, its escorts the pilot's too", r.x.network === b.flyOne && b.flyOne.weights[4] === 0 && e.x.network === b.fly && c.x.network === b.car && r.opts.ships === 1 && r.opts.ammo === 0.25 && r.opts.escorts === undefined && r.x.pilotNet === undefined && e.opts.escorts === 4 && e.opts.ammo === undefined && e.x.pilotNet === b.pilot && e.y.pilotNet === b.pilot && [r, e, c].every((q) => q.x.cannon && q.y.cannon && q.x.helmNet === b.helm && !q.y.network)
        && C.HANDS.find((h) => h.id === "bysize").bySize.one === "flywired-one" && C.HANDS.find((h) => h.id === "bysize").bySize.fleet === "flywired" && b.pilot.policy === "pilot6dofPolicy"
        && (() => { try { G.brainsOf((f) => (f === G.FILES.flyOne ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatFlyWired11WeightsOne\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { oneRationed: [1, 1.1], onePilotEscorts: [1, 0.9] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "button" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.oneRationed.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! four arms, each once; the gain is THE BUTTON'S LESS THE CAR'S pair by pair (0.1, -0.1); the pick does not hold here", calls.length === 4 && new Set(calls).size === 4 && close(r.oneRationed.reading.gain, 0.1) && close(r.onePilotEscorts.reading.gain, -0.1) && close(r.oneRationed.reading.button, 1.1) && !r.verdict.ok && /in onePilotEscorts the button's pick TRAILS/.test(r.verdict.reasons.join()));
    const q = (...z) => G.qualifies(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { gain: { z: z[i] } } }])));
    ok("!! WHAT IS DECIDED: the pick HOLDS if it trails in neither fight (no lead needed); -1.99 is not a trail", q(0, 0).ok && q(-1.99, 1).ok && !q(5, -2).ok && !q(-2, 5).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "onehard-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ car: k(f, "car"), button: k(f, "button") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- THE BUTTON'S PICK HOLDS ONE SHIP A SIDE: the button's less the car's is +0.008 rationed to a quarter and +0.055 with four pilot-flown escorts a side, both CANNOT BE TOLD; it trails in neither; the forecast was right", near(R("oneRationed").gain, 0.008) && near(R("onePilotEscorts").gain, 0.055) && G.FIGHTS.every((f) => rd[f].words.gain === "CANNOT BE TOLD") && rd.verdict.ok && near(R("oneRationed").button, 1.721) && near(R("onePilotEscorts").car, 2.004)
        && G.FIGHTS.every((f) => ["car", "button", "gain"].every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! AND THE BY-SIZE NOTE NO LONGER SAYS IT WAS NOT FLOWN THERE", !/NOT flown rationed one ship a side/.test(C.HANDS.find((h) => h.id === "bysize").note) && /rationed one ship a side/.test(C.HANDS.find((h) => h.id === "bysize").note));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
