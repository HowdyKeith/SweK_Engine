// WebGLEngine/tools/ship/takeCarTodayEscorts-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeCarTodayEscorts-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// CAR-TODAY WITH ESCORTS, HELD. tools/ship/takeCarTodayEscorts.mjs flies car-today and the button's pick with two and six escorts a side. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1141001-, 1151001-), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: four arms, each once; the gain pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// @@READ@@
//
// SABOTAGE LOG: 16 mutants of tools/ship/takeCarTodayEscorts.mjs, before any pair was flown: ALL 16 RED the first time (a seed moved, a pair short; six escorts as two, a fleet, no helm, the old helm file, car-today on both arms,
//   the cannon off on the plain side; the gain's sign, a lead at 1.9, a trail at exactly -2 let by, a lead needed in both; a file unchecked; the second read and an unknown option let through; one arm's leads for both).
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
import * as G from "./takeCarTodayEscorts.mjs";
import * as CTD from "./takeCarToday.mjs";
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
const CMD = fileURLToPath(new URL("./takeCarTodayEscorts.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeCarTodayEscorts-selfcheck -- car-today with escorts, on fresh pairs\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed })), ...[BLAST, SC, NC, AX, CTD].flatMap((M) => seedsOf(M.SETS)).map((seed) => ({ seed })), ...TT.SETS.train, ...TT.SETS.held, ...TT.SETS.audit].map((p) => p.seed);
    ok("!! two fights, 300 pairs each, 75 of each kind, on 1141001- and 1151001-; none flown by another fly-wired study", G.FIGHTS.join() === "escorts2,escorts6" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.escorts2[0].seed === 1141001 && G.SETS.escorts6[299].seed === 1151075 && others.length > 4000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], t2 = j("escorts2", "today"), b2 = j("escorts2", "button"), b6 = j("escorts6", "button");
    ok("!! THE JOBS: car-today against the 45-degree gunner, one ship a side with two and with six escorts a side, under the page's cannon-aware helm (the shipped gains with a cannon); the cannon on both sides; the plain side opposite", t2.x.network === b.today && b2.x.network === b.fly && b6.x.network === b.fly && Math.abs(b.fly.weights[4] - Math.PI / 4) < 1e-6 && [t2, b2, b6].every((q) => q.x.helmNet === b.helm && q.opts.ships === 1 && q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet) && t2.opts.escorts === 2 && b6.opts.escorts === 6
        && b.helm.weights.slice(0, 2).join() === "-2,-2" && C.FILES["helm-flywired"].path.endsWith(path.basename(G.FILES.helm)) && G.FILES.today === TT.DEFAULT_OUT);
    ok("!! a file of another policy is refused by name", (() => { try { G.brainsOf((f) => (f === G.FILES.today ? JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatTurretGunnerWeightsToday\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { escorts2: [1.1, 1], escorts6: [0.9, 1] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "today" ? 0 : 1] * factor(i)); }, () => {}), mf = G.SETS.escorts2.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! four arms, each once; the gain is CAR-TODAY LESS THE PICK pair by pair (0.1, -0.1); a trail in one fight stops it", calls.length === 4 && new Set(calls).size === 4 && close(r.escorts2.reading.gain, 0.1) && close(r.escorts6.reading.gain, -0.1) && close(r.escorts2.reading.today, 1.1) && !r.verdict.ok);
    const q = (a, b2) => G.qualifies({ escorts2: { reading: { gain: { z: a } } }, escorts6: { reading: { gain: { z: b2 } } } }).ok;
    ok("!! WHAT IS DECIDED: a lead in one fight and a trail in neither (exactly 2 leads, exactly -2 trails, -1.99 does not)", q(2, 0) && q(0, 2) && q(2, -1.99) && !q(1.99, 1.99) && !q(5, -2) && !q(-2, 5));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cartodayesc-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
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
