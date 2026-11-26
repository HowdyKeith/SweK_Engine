// WebGLEngine/tools/ship/takeCarToday-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeCarToday-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE CAR'S GUNNER TRAINED IN TODAY'S FIGHT, WHERE THE BUTTON IS USED, HELD. tools/ship/takeCarToday.mjs flies car-today and the by-the-fight button's pick in six fights. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1081001- to 1131075), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: twelve arms, each once; the gain pair by pair; what is decided, the button's two picks apart; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// READ 2026-11-21 (brain/carToday.reading.json; the kept arms in brain/rig-results/carToday/): BOTH PICKS HOLD. Car-today less the button's pick, under the cannon-aware helm: one ship a side +0.032 (z 1.67, CANNOT BE TOLD -- the training's +0.051
//   did not come back on fresh pairs against the plain side); fleets of three -0.177 (z -5.40, TRAILS); one ship with two escorts +0.112 (z 2.47, LEADS); against eight PD fighters -0.013 (z -5.88, TRAILS). Under the bow-on rule: one ship a side +0.030
//   (CANNOT BE TOLD), fleets -0.335 (z -7.49, TRAILS). `one` keeps the no-window gunner, `fleet` the 45-degree one (it trails in a fleet and against fighters, though it leads with escorts). The forecast had one ship a side a lead and escorts a trail: both wrong.
//
// SABOTAGE LOG: 19 mutants of tools/ship/takeCarToday.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before any pair was flown: ALL 19 RED the first time
//   (a seed moved, a pair short; a fleet of one, no escorts, a helm under the bow-on rule, none against fighters; the no-window pick with escorts and against fighters, car-today's arm the 45-degree gunner, the cannon off on the plain side;
//   the gain's sign, `one` at z 1.9, a trail at exactly -2 let by, `fleet` needing a lead in all three, the bow-on rule deciding; a file unchecked; the second read and an unknown option let through; one arm's leads for both). No mutant flew into the real folders.
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
import * as G from "./takeCarToday.mjs";
import * as BLAST from "./takeButtonLast.mjs";
import * as SC from "./takeSteerCannon.mjs";
import * as NC from "./takeFlyWiredHelmNoCannon.mjs";
import * as AX from "./takeFlyWiredHelmAxes.mjs";
import * as TT from "./trainTurretSeatToday.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as TA from "./takeTurretAudit.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeCarToday.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeCarToday-selfcheck -- the car's gunner trained in today's fight, where the button is used\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed })), ...[BLAST, SC, NC, AX].flatMap((M) => seedsOf(M.SETS)).map((seed) => ({ seed })), ...TT.SETS.train, ...TT.SETS.held, ...TT.SETS.audit].map((p) => p.seed);
    ok("!! six fights, 300 pairs or attacks each, 75 of each kind, on 1081001-, 1091001-, 1101001-, 1111001- (the fighter fight's kinds), 1121001-, 1131001-; none flown by another fly-wired study", G.FIGHTS.join() === "one,fleet,escorts,fighters,oneFace,fleetFace" && G.FIGHTS.every((f) => G.SETS[f].length === 300) && G.FIGHTS.map((f) => G.SETS[f][0].seed).join() === "1081001,1091001,1101001,1111001,1121001,1131001" && G.FIGHTS.every((f) => (f === "fighters" ? BF.KINDS : D.KINDS).every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.fleetFace[299].seed === 1131075 && others.length > 4000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], o = j("one", "button"), ot = j("one", "today"), fl = j("fleet", "button"), es = j("escorts", "button"), fa = j("fighters", "button"), ft = j("fighters", "today"), of = j("oneFace", "button"), ff = j("fleetFace", "today");
    ok("!! THE JOBS: the button's pick one ship a side with nothing else the no-window gunner, in a fleet, with escorts and against fighters the 45-degree one; car-today the other arm; the cannon-aware helm in the first four, NO helm network under the bow-on rule; a fleet of three, two escorts, the cannon on both sides", o.x.network === b.flyOne && b.flyOne.weights[4] === 0 && ot.x.network === b.today && fl.x.network === b.fly && es.x.network === b.fly && fa.vsFighters.network === b.fly && ft.vsFighters.network === b.today && fa.vsFighters.helm === b.helm && of.x.network === b.flyOne && ff.x.network === b.today
        && [o, ot, fl, es].every((q) => q.x.helmNet === b.helm) && [of, ff].every((q) => q.x.helmNet === null) && o.opts.ships === 1 && o.opts.escorts === undefined && fl.opts.ships === 3 && es.opts.ships === 1 && es.opts.escorts === 2 && ff.opts.ships === 3 && [o, ot, fl, es, of, ff].every((q) => q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet));
    ok("!! THE BRAINS: car-today is the file trainTurretSeatToday wrote, checked as the car's gunner; a file of another policy is refused by name", b.today.policy === ST.POLICY_ID && b.today.weights.length === ST.WEIGHT_COUNT && G.FILES.today === TT.DEFAULT_OUT
        && (() => { try { G.brainsOf((f) => (f === G.FILES.today ? JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatTurretGunnerWeightsToday\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { one: [1.1, 1], fleet: [0.9, 1], escorts: [1, 1], fighters: [0.06, 0.05], oneFace: [1, 1], fleetFace: [1, 1] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "today" ? 0 : 1] * factor(i)); }, () => {}), mf = G.SETS.one.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! twelve arms, each once; the gain is CAR-TODAY LESS THE PICK pair by pair (0.1, -0.1, 0.01)", calls.length === 12 && new Set(calls).size === 12 && close(r.one.reading.gain, 0.1) && close(r.fleet.reading.gain, -0.1) && close(r.fighters.reading.gain, 0.01) && close(r.one.reading.today, 1.1) && close(r.one.reading.button, 1));
    ok("!! here `one` takes car-today and `fleet` keeps its pick (it trails in a fleet although it leads against fighters)", r.verdict.takes.one && !r.verdict.takes.fleet && r.verdict.ok && /one: TAKES car-today/.test(r.verdict.reasons.join()) && /fleet: keeps its pick/.test(r.verdict.reasons.join()));
    const q = (...z) => G.qualifies(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { gain: { z: z[i] ?? 0 } } }]))).takes;
    ok("!! WHAT IS DECIDED: `one` on `one` alone at z >= 2; `fleet` on a lead in one of fleet, escorts, fighters and a trail in none (-1.99 is not a trail); the bow-on rule decides nothing", q(2).one && !q(1.99).one && !q(0, 0, 0, 0, 9, 9).one && !q(0, 0, 0, 0, 9, 9).fleet && q(0, 0, 0, 2).fleet && q(0, 2, -1.99, 0).fleet && !q(0, 5, 0, -2).fleet && !q(9, 0, 0, 0).fleet && q(0, 0, 2, 0, -9, -9).fleet);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cartoday-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ today: k(f, "today"), button: k(f, "button") }).reading])), want = { one: [0.032, "CANNOT BE TOLD"], fleet: [-0.177, "TRAILS"], escorts: [0.112, "LEADS"], fighters: [-0.013, "TRAILS"], oneFace: [0.030, "CANNOT BE TOLD"], fleetFace: [-0.335, "TRAILS"] };
    ok("!! AS KEPT AND RE-DERIVED -- BOTH PICKS HOLD: car-today less the pick +0.032 one ship a side (CANNOT BE TOLD), -0.177 in fleets (TRAILS), +0.112 with escorts (LEADS), -0.013 against fighters (TRAILS); +0.030 and -0.335 under the bow-on rule", G.FIGHTS.every((f) => near(R(f).gain, want[f][0]) && rd[f].words.gain === want[f][1] && ["today", "button", "gain"].every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300))
        && !rd.verdict.ok && !rd.verdict.takes.one && !rd.verdict.takes.fleet && near(R("one").today, 1.801) && near(R("one").button, 1.769));
    const h = C.HANDS.find((x) => x.id === "bysize"), t = C.HANDS.find((x) => x.id === "car-today");
    ok("!! AND THE PAGE: the button keeps both picks (the no-window gunner one ship a side, the 45-degree one in a fleet); car-today's note says where it was flown and no longer that it was not", h.bySize.one === "flywired-one" && h.bySize.fleet === "flywired" && /takeCarToday/.test(t.note) && !/NOT flown where the by-the-fight button is used/.test(t.note) && /-0\.177/.test(t.note));
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeCarToday.mjs held by its gate (it found these 4 unnamed at the ship):
{
    const EXPORTS = await import("./takeCarToday.mjs");
    const NAMED = ["ARMS", "DECIDES", "SETUP", "gunnerOf"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
