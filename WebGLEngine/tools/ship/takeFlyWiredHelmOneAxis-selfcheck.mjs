// WebGLEngine/tools/ship/takeFlyWiredHelmOneAxis-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredHelmOneAxis-selfcheck.mjs      (about a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// A HELM THAT TURNS ABOUT ONE AXIS WITH A CANNON, HELD. Three things hold tools/ship/takeFlyWiredHelmOneAxis.mjs:
//
//   1  WHAT WAS REGISTERED   the pairs, disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: each arm once; the gains pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// @@READ@@
//
// @@SABOTAGE@@
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

import * as G from "./takeFlyWiredHelmOneAxis.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as CTE from "./takeCarTodayEscorts.mjs";
import * as SH from "./takeSineHelmNoCannon.mjs";
import * as TF from "./trainTurretSeatFleet.mjs";
import * as BNC from "./takeButtonNoCannon.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredHelmOneAxis.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeFlyWiredHelmOneAxis-selfcheck\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed })), ...[BLAST, SC, NC, AX, CTD, CTE, BNC].flatMap((M) => seedsOf(M.SETS)).map((seed) => ({ seed })), ...TT.SETS.train, ...TT.SETS.held, ...TT.SETS.audit].map((p) => p.seed);
    const ext = [...SH.SETS.train.one, ...SH.SETS.train.fleet, ...SH.SETS.held.one, ...SH.SETS.held.fleet, ...SH.SETS.audit.one, ...SH.SETS.audit.fleet, ...TF.SETS.train, ...TF.SETS.held, ...TF.SETS.audit].map((p) => p.seed);
    ok("!! two fights, 300 pairs each, 75 of each kind, on 1271001- and 1281001-; none flown by another fly-wired study", G.FIGHTS.join() === "one,fleet" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.one[0].seed === 1271001 && G.SETS.fleet[299].seed === 1281075 && others.length > 4000 && [...others, ...ext].every((x) => !mine.has(x)), `${others.length + ext.length} others`);
    const b = G.brainsOf(), ax = JSON.parse(fs.readFileSync(path.join(path.dirname(G.READING), "helmFlyWired3WeightsAxes.reading.json"), "utf8")).scores, firstZero = Object.keys(ax).filter((g) => g.split(",")[0] === "0").sort((x, y) => ax[y] - ax[x]);
    ok("!! THE CANDIDATE (0, -4) IS THE BEST OF takeFlyWiredHelmAxes's TRAIN SCORES WITH THE FIRST GAIN AT 0; its weights are it with a cannon and the page's -0.25, -0.25 without; the page's arm is the page's file", G.CANDIDATE.join() === "0,-4" && firstZero[0] === "0,-4" && G.weightsOf("oneAxis", b.helm.weights).join() === "0,-4,-0.25,-0.25" && G.weightsOf("page", b.helm.weights).join() === "-2,-2,-0.25,-0.25" && C.FILES["helm-flywired"].path.endsWith(path.basename(G.FILES.helm)));
    const j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], oo = j("one", "oneAxis"), fp = j("fleet", "page");
    ok("!! THE JOBS: THE CANNON ON both sides; the by-size hand's gunner aboard (no window one a side, 45 degrees in fleets of three); the cannon-aware helm at the arm's weights; the plain ship opposite", oo.x.network === b.flyOne && b.flyOne.weights[4] === 0 && fp.x.network === b.fly && oo.opts.ships === 1 && fp.opts.ships === 3 && [oo, fp].every((q) => q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet && q.x.helmNet.policy === FS.POLICY_ID3) && oo.x.helmNet.weights.join() === "0,-4,-0.25,-0.25" && fp.x.helmNet.weights.join() === "-2,-2,-0.25,-0.25"
        && (() => { try { G.brainsOf((f) => (f === G.FILES.helm ? JSON.parse(fs.readFileSync(G.FILES.fly, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /helmFlyWired3WeightsNoCannon\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { one: { oneAxis: 1.1, page: 1 }, fleet: { oneAxis: 0.9, page: 1 } }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm] * factor(i)); }, () => {}), mf = G.SETS.one.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! four arms, each once; the gain is THE ONE-AXIS HELM LESS THE PAGE'S pair by pair (0.1, -0.1); a trail stops both verdicts", calls.length === 4 && new Set(calls).size === 4 && close(r.one.reading.gain, 0.1) && close(r.fleet.reading.gain, -0.1) && !r.verdict.asWell && !r.verdict.replaces);
    const q = (a, b2) => G.decide({ one: { reading: { gain: { z: a } } }, fleet: { reading: { gain: { z: b2 } } } });
    ok("!! WHAT IS DECIDED: AS WELL if it trails in neither (exactly -2 trails); REPLACES if it also leads in one (exactly 2 leads)", q(0, 0).asWell && !q(0, 0).replaces && q(-1.99, 1.99).asWell && !q(-2, 5).asWell && !q(-2, 5).replaces && q(2, 0).replaces && q(0, 2).replaces && q(2, 0).ok && !q(0, 0).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "takeflywiredhelmoneaxis-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
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
