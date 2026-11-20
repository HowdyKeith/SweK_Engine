// WebGLEngine/tools/ship/takeLadder-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeLadder-selfcheck.mjs      (under a minute; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE LADDER, HELD. tools/ship/takeLadder.mjs flies five of the page's loadouts each against each. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (761001- one a side, 771001- fleets), disjoint from every other fly-wired study's; the brains (each checked by its policy); the jobs
//   2  THE STUDY             against a stand-in: every match once; the scores and the order; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 16 mutants of tools/ship/takeLadder.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 16 RED the first time
//   (the seeds moved, a pair short; best's gunner the wrong one at either size, the bow-on entrant helmed, oldBest the fly gunner, no cannon; a match of two equal sides kept, the seats swapped; the score's sign, a sum for a mean,
//   the order upside down; a fleet of two; a file unchecked; the second read and an unknown option let through). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeLadder.mjs";
import * as UT from "./takeButtonUntried.mjs";
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
const CMD = fileURLToPath(new URL("./takeLadder.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };

console.log("takeLadder-selfcheck -- the duel page's loadouts, each against each\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...[HF, GS, GM, GH, BL, BL2, BL3, BS, BY, HC, OW, UT, PH, SE, HSS, NE, VP, NX, CT, TR].flatMap((M) => seedsOf(M.SETS ?? {})).map((seed) => ({ seed })), ...[TU.SETS.train, TU.SETS.held, ...Object.values(TU.SETS.audit)].flat(), ...["train", "held", "audit"].flatMap((st) => Object.values(HT.SETS[st]).flat()), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! two fights, 160 pairs each, the duel's kinds 40 apiece, on 761001- and 771001-; none flown by another fly-wired study", G.FIGHTS.join() === "one,fleet3" && G.FIGHTS.every((f) => G.SETS[f].length === 160 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 40)) && G.SETS.one[0].seed === 761001 && G.SETS.fleet3[159].seed === 771040 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), S = (e, f) => G.sideOf(e, f, b, "x");
    ok("!! THE ENTRANTS ARE THE PAGE'S: best is the best-ship preset (the helm over the no-window gunner one ship a side, the 45-degree one in a fleet -- what the core's by-size hand seats), fleet the best-fleet preset, oldBest the helm over the car's gunner, faceFly the bow-on rule over the 45-degree gunner, plain no network; all with the cannon; files the page's; a file another policy's refused", G.ENTRANTS.join() === "best,fleet,oldBest,faceFly,plain" && S("best", "one").network === b.flyOne && S("best", "fleet3").network === b.fly && S("best", "one").helmNet === b.helm && S("fleet", "one").network === b.fly && S("oldBest", "one").network === b.car && S("faceFly", "one").helmNet === null && S("faceFly", "one").network === b.fly && S("plain", "one").network === null && S("plain", "one").helmNet === null && G.ENTRANTS.every((e) => S(e, "one").cannon)
        && b.flyOne.weights[4] === 0 && JSON.stringify(C.presetOf("best").choice) === '{"hand":"bysize","helm":"flywired","cannon":true}' && C.HANDS.find((h) => h.id === "bysize").bySize.one === "flywired-one" && C.FILES["seat-flywired-one"].path.endsWith("seatFlyWired11WeightsOne.json") && JSON.stringify(C.presetOf("fleet").choice) === '{"hand":"flywired","helm":"flywired","cannon":true}'
        && (() => { try { G.brainsOf((f) => (f === G.FILES.flyOne ? JSON.parse(fs.readFileSync(G.FILES.car, "utf8")) : JSON.parse(fs.readFileSync(f, "utf8")))); return false; } catch (e) { return /seatFlyWired11WeightsOne\.json/.test(e.message); } })());
    const m1 = G.matchesOf("one", b).map((m) => m.join("~")), m3 = G.matchesOf("fleet3", b).map((m) => m.join("~")), j = G.jobsOf("fleet3", ["oldBest", "plain"], b, [G.SETS.fleet3[2]])[0];
    ok("!! THE MATCHES: all ten one ship a side; nine in fleets, best~fleet left out there (the same side: a lead of exactly 0); a match's job puts the first-named on side X, three ships a side in a fleet", m1.length === 10 && m3.length === 9 && !m3.includes("best~fleet") && m1.includes("best~fleet") && m3.includes("faceFly~plain") && j.x.network === b.car && j.y.network === null && j.opts.ships === 3 && j.seed === G.SETS.fleet3[2].seed);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const b = G.brainsOf(), V = { best: 2, fleet: 1.8, oldBest: 1.5, faceFly: 0.5, plain: 0 }, calls = [], r = await G.study(async (f, [a, c]) => { calls.push(`${f}/${a}~${c}`); return G.SETS[f].map((_, i) => (V[a] - V[c]) * factor(i)); }, b, () => {}), mf = G.SETS.one.reduce((s, _, i) => s + factor(i), 0) / 160, close = (x, v) => Math.abs(x - v * mf) < 1e-9;
    ok("!! every match once (19); a match's lead the first-named less the second; an entrant's score the mean of its leads over the other four (a match not flown -- best~fleet in a fleet -- counting 0); the order by score", calls.length === 19 && new Set(calls).size === 19 && close(r.one.matches["best~plain"].mean, 2) && close(r.one.score.best, (0.2 + 0.5 + 1.5 + 2) / 4) && close(r.one.score.plain, -(2 + 1.8 + 1.5 + 0.5) / 4) && close(r.fleet3.score.best, (0 + 0.5 + 1.5 + 2) / 4) && r.one.order.join() === "best,fleet,oldBest,faceFly,plain");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ladder-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
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
