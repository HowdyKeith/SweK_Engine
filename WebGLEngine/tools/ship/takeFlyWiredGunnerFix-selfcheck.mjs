// WebGLEngine/tools/ship/takeFlyWiredGunnerFix-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerFix-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE STICKY-GUNNER STUDY, HELD. tools/ship/takeFlyWiredGunnerFix.mjs flies the shipped fly-wired gunner and the same gunner behind a sticky sight in fleets of three and against fighters. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (141001-) and attacks (151001-), disjoint from every other study's; the two arms are the two policies at the same gains; the fleet jobs carry three ships and the cannon on both sides or neither; the gunner only, no helm
//   2  THE STUDY             against a stand-in: six arms, each once; sticky less shipped pair by pair; what ships (it must LEAD in both fleet fights and TRAIL in none); the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 9 mutants of tools/ship/takeFlyWiredGunnerFix.mjs, each a copy of the study with this gate (and the command rows) pointed at it: 9 red by name the first time -- the fleet pairs another study's, one ship a side, the sticky arm the shipped policy, the plain side keeping its cannon, the gain's sign, the rule with one fleet fight or with no trailing allowed, the blob for the shipped policy, a second read allowed. And 5 of brain/seatTurretGunner.mjs's stickySight and `sticky` option, run against this gate's neighbours (brain/flyTracking-selfcheck.mjs, brain/seatTurretGunner-selfcheck.mjs): 1 red the first time; FOUR GAPS, CLOSED with rows -- the sight asked twice with one target, a target that could not be shot kept, the option ignored or always on -- after which all 5 are red.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as N from "./takeFlyWiredNext.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerFix.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeFlyWiredGunnerFix-selfcheck -- the fly-wired gunner behind a sticky sight\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = [...G.FLEET_PAIRS, ...G.FIGHTER_ATTACKS].map((p) => p.seed), others = [...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...Object.values(HF.SETS).flat(), ...N.TOGETHER.pairs].map((p) => p.seed);
    ok("!! 300 fleet pairs (seeds 141001-141075 of each of the duel's kinds) and 300 attacks (151001-151075 of each of the fighter fight's kinds), none flown by another study; three fights, two arms, fleets of three", G.FLEET_PAIRS.length === 300 && G.FIGHTER_ATTACKS.length === 300 && G.FLEET_PAIRS[0].seed === 141001 && G.FIGHTER_ATTACKS[0].seed === 151001 && mine.every((s) => !others.includes(s)) && G.REGIMES.join() === "fleetNoCannon,fleetCannon,fighters" && G.ARMS.join() === "shipped,sticky" && G.FLEET_SHIPS === 3);
    const a = G.jobsOf("fleetNoCannon", "shipped", [G.FLEET_PAIRS[0]])[0], b = G.jobsOf("fleetCannon", "sticky", [G.FLEET_PAIRS[0]])[0], c = G.jobsOf("fighters", "sticky", [G.FIGHTER_ATTACKS[3]])[0];
    ok("!! THE TWO ARMS ARE THE TWO POLICIES AT THE SAME GAINS (-3): the shipped gunner (seatFlyWired) and the sticky one (seatFlyWired2); a fleet job is three ships a side, the gunner in side X's seats and NO helm network, the cannon on both sides or neither; a fighter job carries the gunner and the attack", a.x.network.policy === "seatFlyWired" && b.x.network.policy === "seatFlyWired2" && a.x.network.weights.join() === "-3,-3" && b.x.network.weights.join() === "-3,-3" && a.opts.ships === 3 && !a.x.helmNet && a.x.cannon === false && a.y.cannon === false && b.x.cannon === true && b.y.cannon === true && c.vsFighters.network.policy === "seatFlyWired2" && c.vsFighters.helm === null && c.vsFighters.seed === G.FIGHTER_ATTACKS[3].seed && D.PEER_POLICIES.seatFlyWired2.mod === FT.sticky);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fleetNoCannon: { shipped: -0.5, sticky: 0 }, fleetCannon: { shipped: -0.5, sticky: -0.1 }, fighters: { shipped: -0.15, sticky: -0.15 } }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return (g === "fighters" ? G.FIGHTER_ATTACKS : G.FLEET_PAIRS).map((_, i) => W[g][arm] * factor(i)); }, () => {}), mf = G.FLEET_PAIRS.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; in each fight the sticky and the shipped gunner against the plain side and STICKY LESS SHIPPED pair by pair (0.5, 0.4 and exactly 0 here); it ships when that LEADS in both fleet fights and trails nowhere", calls.length === 6 && new Set(calls).size === 6 && close(r.fleetNoCannon.reading.gain, 0.5) && close(r.fleetCannon.reading.gain, 0.4) && r.fighters.reading.gain.mean === 0 && close(r.fleetNoCannon.reading.shipped, -0.5) && r.verdict.ok);
    const fr = (gNo, gC, gF) => G.qualifies({ fleetNoCannon: { reading: { gain: { z: gNo } } }, fleetCannon: { reading: { gain: { z: gC } } }, fighters: { reading: { gain: { z: gF } } } });
    ok("!! WHAT SHIPS: (2, 2, 0) yes; (2, 1.99, 0) no -- the cannon fleet must LEAD too; (5, 5, -2) no -- it must TRAIL nowhere, fighters included; the reasons name the fight", fr(2, 2, 0).ok && !fr(2, 1.99, 0).ok && /in fleetCannon sticky less shipped reads CANNOT BE TOLD/.test(fr(2, 1.99, 0).reasons[0]) && !fr(5, 5, -2).ok && /in fighters sticky less shipped TRAILS/.test(fr(5, 5, -2).reasons[0]));
    const blob = G.blobOf(r), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID2, FT.sticky), blob);
    ok("!! the blob is a seatFlyWired2 brain of the gains -3 that battleshipDuel seats with the STICKY library, and its `by` says what the sight does, that one ship a side it is the shipped gunner, and every reading of the three fights", back.ok && Array.from(back.weights).join() === "-3,-3" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.sticky && /behind a STICKY SIGHT/.test(blob.by) && /one ship a side it is that gunner to the bit/.test(blob.by) && /FLEETS OF THREE, NO CANNON .*sticky less shipped \+0\.\d{3}/.test(blob.by) && /ONE SHIP AGAINST EIGHT FIGHTERS \(300 attacks, seeds 151001-\)/.test(blob.by) && /NOTHING INSIDE THE CIRCUIT IS LEARNED/.test(blob.by));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gunfix-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (g, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${g}_${arm}.json`), "utf8")).leads, near = (s, v) => Math.abs(s.mean - v) < 5e-4, R = (g) => rd[g].reading;
    const re = Object.fromEntries(G.REGIMES.map((g) => [g, G.fightReadings({ shipped: k(g, "shipped"), sticky: k(g, "sticky") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IN FLEETS THE STICKY SIGHT IS THE FIX: no cannon, sticky less shipped +0.660 (z 8.4), the sticky gunner then LEADING the plain fleet (+0.098) where the shipped one trails (-0.562); with the cannon +0.274 (z 5.6), though it still trails (-0.321)", near(R("fleetNoCannon").gain, 0.660) && rd.fleetNoCannon.words.gain === "LEADS" && near(R("fleetNoCannon").sticky, 0.098) && rd.fleetNoCannon.words.sticky === "LEADS" && near(R("fleetNoCannon").shipped, -0.562) && near(R("fleetCannon").gain, 0.274) && rd.fleetCannon.words.gain === "LEADS" && near(R("fleetCannon").sticky, -0.321) && rd.fleetCannon.words.sticky === "TRAILS" && G.REGIMES.every((g) => ["shipped", "sticky", "gain"].every((q) => Math.abs(re[g][q].mean - R(g)[q].mean) < 1e-12)) && fs.readdirSync(G.KEPT_DIR).length === 6);
    ok("!! AND AGAINST FIGHTERS IT IS A LITTLE WORSE (sticky less shipped -0.029, z -2.9: TRAILS), so BY THE RULE REGISTERED BEFORE THE PAIRS IT DOES NOT SHIP -- no file, and the page keeps the shipped gunner. The forecast was right for the fleets' direction, under for the no-cannon fleet, and wrong for the fighters", near(R("fighters").gain, -0.029) && rd.fighters.words.gain === "TRAILS" && near(R("fighters").sticky, -0.182) && !rd.verdict.ok && /in fighters sticky less shipped TRAILS/.test(rd.verdict.reasons.join()) && !fs.existsSync(G.DEFAULT_OUT));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
