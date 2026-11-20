// WebGLEngine/tools/ship/takeBySightLoadout-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeBySightLoadout-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE BY-SIGHT RULE'S STUDY, HELD. tools/ship/takeBySightLoadout.mjs flies the by-size rule and the rule that also sees escorts and fighters where the two differ. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (651001- two escorts, 661001- six, 671001- fighters), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what ships; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 16 mutants of tools/ship/takeBySightLoadout.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: 15 RED the first time, ONE 0-RED, A GAP, CLOSED -- a fleet of two
//   taken as one ship's (the rules row now asks two ships) -> 1. No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeBySightLoadout.mjs";
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
const CMD = fileURLToPath(new URL("./takeBySightLoadout.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeBySightLoadout-selfcheck -- the by-size hand that also sees fighters\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs or attacks each, 75 of each kind: two escorts on 651001-, six on 661001- (the duel's kinds), fighters on 671001- (the fighter fight's); none flown by another fly-wired study", G.FIGHTS.join() === "oneEscorts2,oneEscorts6,fighters" && G.FIGHTS.every((f) => G.SETS[f].length === 300) && G.SETS.oneEscorts2[0].seed === 651001 && G.SETS.oneEscorts6[0].seed === 661001 && G.SETS.fighters[299].seed === 671075 && BF.KINDS.every((k) => G.SETS.fighters.filter((p) => p.kind === k).length === 75) && D.KINDS.every((k) => G.SETS.oneEscorts6.filter((p) => p.kind === k).length === 75) && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf();
    ok("!! THE RULES: by size the car's gunner whenever there is one ship, by sight only when there is one ship AND nothing else; both the fly-wired gunner in a fleet; so they differ in exactly these three fights and agree one ship a side with nothing else; the brains the shipped files (a file another policy's refused)", G.gunnerOf("bySize", 1, 0) === "car" && G.gunnerOf("bySight", 1, 0) === "car" && G.gunnerOf("bySize", 1, 2) === "car" && G.gunnerOf("bySight", 1, 2) === "fly" && G.gunnerOf("bySight", 1, 8) === "fly" && G.gunnerOf("bySize", 3, 0) === "fly" && G.gunnerOf("bySize", 2, 0) === "fly" && G.gunnerOf("bySight", 2, 0) === "fly" && G.gunnerOf("bySight", 3, 6) === "fly" && b.car.policy === "gunnerPolicy" && b.fly.policy === "seatFlyWired11" && b.helm.policy === "helmFlyWired3"
        && (() => { try { G.brainsOf((f) => (f === G.FILES.fly ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsDefault\.json/.test(e.message); } })());
    const j = (f, arm, i) => G.jobsOf(f, arm, b, [G.SETS[f][i]])[0], a = j("oneEscorts2", "bySize", 0), c = j("oneEscorts6", "bySight", 1), e = j("fighters", "bySight", 2), e0 = j("fighters", "bySize", 2);
    ok("!! THE JOBS: one ship a side with two escorts and with six, the cannon on both sides, the helm on side X, side Y plain; a fighter job carries the helm and the rule's gunner; by size's gunner the car's, by sight's the fly-wired one", a.opts.ships === 1 && a.opts.escorts === 2 && c.opts.escorts === 6 && a.x.network === b.car && c.x.network === b.fly && [a, c].every((q) => q.x.helmNet === b.helm && q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet) && e.vsFighters.network === b.fly && e0.vsFighters.network === b.car && e.vsFighters.helm === b.helm && JSON.stringify(e.vsFighters.opts) === "{}" && e.vsFighters.seed === G.SETS.fighters[2].seed);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { oneEscorts2: [1, 1.05], oneEscorts6: [1, 1.2], fighters: [0.1, 0.05] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "bySight" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.oneEscorts2.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is BY SIGHT LESS BY SIZE pair by pair (0.05, 0.2, -0.05); it does not ship here (a fight trails)", calls.length === 6 && new Set(calls).size === 6 && close(r.oneEscorts2.reading.gain, 0.05) && close(r.oneEscorts6.reading.gain, 0.2) && close(r.fighters.reading.gain, -0.05) && close(r.oneEscorts6.reading.bySight, 1.2) && close(r.oneEscorts6.reading.bySize, 1) && !r.verdict.ok && /in fighters the gain TRAILS/.test(r.verdict.reasons.join()));
    const q = (...z) => G.qualifies(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { gain: { z: z[i] } } }])));
    ok("!! WHAT SHIPS: a lead in any one fight is enough; (1.99 everywhere) no; a trail anywhere no; -1.99 is not a trail", [0, 1, 2].every((k) => q(...[0, 0, 0].map((_, i) => (i === k ? 2 : 0))).ok) && !q(1.99, 1.99, 1.99).ok && !q(5, 5, -2).ok && /in fighters the gain TRAILS/.test(q(5, 5, -2).reasons[0]) && q(5, 5, -1.99).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bysight-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.READING, "utf8")), k = (f, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${f}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (f) => rd[f].reading;
    const re = Object.fromEntries(G.FIGHTS.map((f) => [f, G.fightReadings({ bySize: k(f, "bySize"), bySight: k(f, "bySight") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IT SHIPS, BY THE FIGHTERS ALONE: by sight less by size is -0.032 (CANNOT BE TOLD) with two escorts, +0.053 (CANNOT BE TOLD) with six, and +0.010 (z 4.5, LEADS) against eight PD fighters; it trails nowhere. In the duel page's own fights (one ship a side with escorts) the two rules cannot be told", near(R("oneEscorts2").gain, -0.032) && near(R("oneEscorts6").gain, 0.053) && near(R("fighters").gain, 0.010) && rd.oneEscorts2.words.gain === "CANNOT BE TOLD" && rd.oneEscorts6.words.gain === "CANNOT BE TOLD" && rd.fighters.words.gain === "LEADS" && rd.verdict.ok
        && G.FIGHTS.every((f) => ["bySize", "bySight", "gain"].every((q) => Math.abs(re[f][q].mean - R(f)[q].mean) < 1e-12 && re[f][q].n === 300)));
    ok("!! the forecast was WRONG with escorts (it said a lead of about 0.3) and right in direction against fighters (smaller than the pilot's +0.13, as forecast); AND THE PAGE CARRIES IT: the by-size hand takes the fly-wired gunner one ship a side with escorts", near(R("oneEscorts6").bySize, 1.872) && near(R("fighters").bySight, 0.052) && /with escorts/.test(C.HANDS.find((h) => h.id === "bysize").label) && /WITH ESCORTS/.test(C.HANDS.find((h) => h.id === "bysize").note) && C.presetOf("best").choice.hand === "bysize");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
