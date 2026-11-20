// WebGLEngine/tools/ship/takeButtonLast-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeButtonLast-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE BY-THE-FIGHT HAND'S LAST FIGHTS, HELD. tools/ship/takeButtonLast.mjs flies its pick and the car's gunner against fighters and under the bow-on rule. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (841001- fighters, 851001- and 861001- the bow-on rule), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 14 mutants of tools/ship/takeButtonLast.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 14 RED the first time
//   (the seeds moved, a pair short; no helm against fighters, a helm under the bow-on rule, the wrong pick one ship a side and in a fleet, a fleet of one, the cannon on one side; the gain's sign, a trail at exactly -2 let by;
//   a file unchecked; the second read and an unknown option let through; one arm's leads for both). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeButtonLast.mjs";
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

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeButtonLast.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeButtonLast-selfcheck -- the by-the-fight hand in its last untried fights\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, LD, OH, HL, SW, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 attacks or pairs each, 75 of each kind: fighters on 841001- (the fighter fight's kinds), the bow-on rule on 851001- and 861001- (the duel's); none flown by another fly-wired study", G.FIGHTS.join() === "fighters,oneFace,fleetFace" && G.FIGHTS.every((f) => G.SETS[f].length === 300) && G.SETS.fighters[0].seed === 841001 && BF.KINDS.every((k) => G.SETS.fighters.filter((p) => p.kind === k).length === 75) && G.SETS.oneFace[0].seed === 851001 && G.SETS.fleetFace[299].seed === 861075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), j = (f, arm) => G.jobsOf(f, arm, b, [G.SETS[f][0]])[0], fa = j("fighters", "button"), fc = j("fighters", "car"), o = j("oneFace", "button"), t = j("fleetFace", "button");
    ok("!! THE JOBS ARE THE BY-SIZE HAND'S PICKS: against fighters (one ship, the cannon-aware helm) the 45-degree gunner, the fighter job carrying the helm; one ship a side under the bow-on rule the no-window gunner and NO helm network; fleets under the bow-on rule the 45-degree one; the car's gunner the other arm; the cannon on both sides", fa.vsFighters.network === b.fly && fa.vsFighters.helm === b.helm && fc.vsFighters.network === b.car && o.x.network === b.flyOne && b.flyOne.weights[4] === 0 && o.x.helmNet === null && o.opts.ships === 1 && t.x.network === b.fly && t.x.helmNet === null && t.opts.ships === 3 && [o, t].every((q) => q.x.cannon && q.y.cannon && !q.y.network)
        && (() => { try { G.brainsOf((f) => (f === G.FILES.flyOne ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e2) { return /seatFlyWired11WeightsOne\.json/.test(e2.message); } })());
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fighters: [0.05, 0.06], oneFace: [1, 1.1], fleetFace: [1, 0.9] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "button" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.oneFace.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is THE BUTTON'S LESS THE CAR'S pair by pair (0.01, 0.1, -0.1); the pick does not hold here", calls.length === 6 && new Set(calls).size === 6 && close(r.fighters.reading.gain, 0.01) && close(r.oneFace.reading.gain, 0.1) && close(r.fleetFace.reading.gain, -0.1) && close(r.oneFace.reading.button, 1.1) && !r.verdict.ok && /in fleetFace the button's pick TRAILS/.test(r.verdict.reasons.join()));
    const q = (...z) => G.qualifies(Object.fromEntries(G.FIGHTS.map((f, i) => [f, { reading: { gain: { z: z[i] } } }])));
    ok("!! WHAT IS DECIDED: the pick HOLDS if it trails in no fight (no lead needed); -1.99 is not a trail", q(0, 0, 0).ok && q(-1.99, 1, 0).ok && !q(5, 5, -2).ok && !q(-2, 5, 5).ok);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "btnlast-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
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
