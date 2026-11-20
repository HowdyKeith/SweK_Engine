// WebGLEngine/tools/ship/takeFlyWiredHelmControl-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredHelmControl-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE HELM'S WIRING CONTROL, HELD. tools/ship/takeFlyWiredHelmControl.mjs flies the cannon-aware helm over the fly's wiring, a sine comparator and a shuffled circuit. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (681001- one ship a side, 691001- fleets), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: six arms, each once; the gains pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 14 mutants of tools/ship/takeFlyWiredHelmControl.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 14 RED the first time
//   (the seeds moved, a pair short; the sine arm the fly's, another shuffle seed, the gunners swapped, one ship a side flown as a fleet, the cannon on one side; the gain's sign, a lead enough, a looser trail; a file unchecked;
//   the second read and an unknown option let through; one arm's leads for all). AND ONE ON tools/ship/pairPool.mjs: W2 helmFlyWired3 given no wirings 1. No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredHelmControl.mjs";
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
const CMD = fileURLToPath(new URL("./takeFlyWiredHelmControl.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeFlyWiredHelmControl-selfcheck -- does the fly's wiring still do anything in the helm\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! two fights, 300 pairs each, the duel's kinds 75 apiece, on 681001- and 691001-; none flown by another fly-wired study", G.FIGHTS.join() === "one,fleet" && G.FIGHTS.every((f) => G.SETS[f].length === 300 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 75)) && G.SETS.one[0].seed === 681001 && G.SETS.fleet[299].seed === 691075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0];
    ok("!! THE ARMS: the helm at its shipped weights over fly2~odd (no wiring named), sine~odd and shuffled2:4242~odd; one ship a side with the car's gunner and fleets of three with the fly-wired one (the button's by-size picks); the cannon on both sides; and THE POOL'S `wiring` FOR helmFlyWired3 seats the helm over that wiring", G.ARMS.join() === "fly,sine,shuffled" && b.helm.weights.join() === "-2,-2,0.25,0.25" && j("one", "fly").x.helmNet.wiring === undefined && j("one", "sine").x.helmNet.wiring === "sine~odd" && j("fleet", "shuffled").x.helmNet.wiring === "shuffled2:4242~odd" && j("one", "fly").x.network === b.car && j("fleet", "sine").x.network === b.fly && j("one", "sine").opts.ships === 1 && j("fleet", "fly").opts.ships === 3 && [j("one", "fly"), j("fleet", "shuffled")].every((q) => q.x.cannon && q.y.cannon && !q.y.network && !q.y.helmNet)
        && sideOf({ id: "x", helmNet: { policy: "helmFlyWired3", weights: b.helm.weights, wiring: "sine~odd" } }).helmNet.module === FS.thirdOver("sine~odd") && sideOf({ id: "x", helmNet: { policy: "helmFlyWired3", weights: b.helm.weights } }).helmNet.module === FS.third
        && (() => { try { G.brainsOf((f) => (f === G.FILES.fly ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsDefault\.json/.test(e.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { one: { fly: 1, sine: 1, shuffled: 0.2 }, fleet: { fly: 1.2, sine: 1.3, shuffled: 0.5 } }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm] * factor(i)); }, () => {}), mf = G.SETS.one.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; each gain is THE FLY LESS THE CONTROL pair by pair (against sine exactly 0 and -0.1, against the shuffle 0.8 and 0.7); credited here against the shuffle only", calls.length === 6 && new Set(calls).size === 6 && r.one.reading["flyOver:sine"].mean === 0 && close(r.fleet.reading["flyOver:sine"], -0.1) && close(r.one.reading["flyOver:shuffled"], 0.8) && close(r.fleet.reading.sine, 1.3) && r.verdict.credited.join() === "shuffled" && !r.verdict.beatsSine);
    const q = (z) => G.decide(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: Object.fromEntries(G.CONTROLS.map((c) => [`flyOver:${c}`, { z: (z[c] || [0, 0])[i] }])) }])));
    ok("!! WHAT IS DECIDED: credited against a control that it LEADS somewhere and TRAILS nowhere; against sine it beats the comparator", q({ sine: [2, 0] }).beatsSine && !q({ sine: [2, -2] }).beatsSine && q({ sine: [2, -1.99] }).beatsSine && !q({ sine: [1.99, 1.99] }).beatsSine && q({ shuffled: [0, 3] }).credited.join() === "shuffled" && q({}).credited.length === 0);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmctl-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));   /* everything the command could write goes to the scratch folder */
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
