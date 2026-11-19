// WebGLEngine/tools/ship/takeFlyWiredGunnerSees-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerSees-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SEEING GUNNER'S STUDY, HELD. tools/ship/takeFlyWiredGunnerSees.mjs flies the ships-sticky fly-wired gunner and the one that sees its target move (seatFlyWired7) against fighters and in fleets with and without the cannon. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (291001- fighters, 301001- fleets with the cannon, 311001- without), disjoint from every other fly-wired study's; the arms the two policies at the same gains; the jobs' ships, escorts and cannon
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what ships (it must LEAD in one fight and TRAIL nowhere); the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 16 mutants of tools/ship/takeFlyWiredGunnerSees.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 16 RED the first time
//   (the seeds moved, a pair short; the cannon everywhere, on one side only, escorts in the fleets; tau 0, tau on the ships-sticky arm, the arms one policy; the gain's sign, the leads one arm's; only the fighters allowed to lead,
//   a trail at exactly -2 let by; the file's policy and score; the second read and an unknown option let through).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerSees.mjs";
import * as GS from "./takeFlyWiredGunnerShips.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as PI from "./takeFlyWiredPilot.mjs";
import * as NX from "./takeFlyWiredNext.mjs";
import * as GN from "./takeFlyWiredGunner.mjs";
import * as GM from "./takeFlyWiredGunnerMixed.mjs";
import * as GH from "./takeFlyWiredGunnerHold.mjs";
import * as BL from "./takeBestShipLoadout.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerSees.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeFlyWiredGunnerSees-selfcheck -- the fly circuit seeing its target move\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...seedsOf(HF.SETS).map((seed) => ({ seed })), ...seedsOf(GS.SETS).map((seed) => ({ seed })), ...seedsOf(GM.SETS).map((seed) => ({ seed })), ...seedsOf(GH.SETS).map((seed) => ({ seed })), ...seedsOf(BL.SETS).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(NX.SEEDS).map((seed) => ({ seed })), ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs or attacks each, 75 of each kind: the fighters on 291001- (the fighter fight's kinds), the fleets with the cannon on 301001- and without on 311001- (the duel's kinds); none flown by another fly-wired study", G.REGIMES.join() === "fighters,fleetCannon,fleetNoCannon" && G.REGIMES.every((g) => G.SETS[g].length === 300) && G.SETS.fighters[0].seed === 291001 && G.SETS.fleetCannon[0].seed === 301001 && G.SETS.fleetNoCannon[299].seed === 311075 && BF.KINDS.every((k) => G.SETS.fighters.filter((p) => p.kind === k).length === 75) && D.KINDS.every((k) => G.SETS.fleetCannon.filter((p) => p.kind === k).length === 75 && G.SETS.fleetNoCannon.filter((p) => p.kind === k).length === 75) && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const a = G.jobsOf("fleetCannon", "sees", [G.SETS.fleetCannon[0]])[0], b = G.jobsOf("fleetNoCannon", "ships", [G.SETS.fleetNoCannon[1]])[0], c = G.jobsOf("fighters", "sees", [G.SETS.fighters[2]])[0];
    ok("!! THE ARMS ARE THE SHIPS-STICKY GUNNER (seatFlyWired3 at -3, -3) AND THE ONE THAT SEES ITS TARGET MOVE (seatFlyWired7 at -3, -3, 0.1); a fleet is three ships a side, no escorts, the cannon on both sides in fleetCannon only, side Y plain; a fighter job carries the gunner alone", G.POLICY.ships === "seatFlyWired3" && G.POLICY.sees === "seatFlyWired7" && a.x.network.policy === "seatFlyWired7" && a.x.network.weights.join() === "-3,-3,0.1" && b.x.network.weights.join() === "-3,-3" && b.x.network.policy === "seatFlyWired3" && a.opts.ships === 3 && a.opts.escorts === undefined && a.x.cannon && a.y.cannon && !b.x.cannon && !b.y.cannon && !a.y.network
        && c.vsFighters.network.policy === "seatFlyWired7" && c.vsFighters.network.weights.join() === "-3,-3,0.1" && c.vsFighters.helm === null && c.vsFighters.seed === G.SETS.fighters[2].seed && c.vsFighters.kind === G.SETS.fighters[2].kind && JSON.stringify(c.vsFighters.opts) === "{}");
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fighters: [-0.15, -0.1], fleetCannon: [-0.3, -0.2], fleetNoCannon: [0.05, 0.05] }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return G.SETS[g].map((_, i) => W[g][arm === "sees" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.fighters.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is the seeing LESS the ships-sticky, pair by pair (0.05, 0.1, exactly 0); it ships here", calls.length === 6 && new Set(calls).size === 6 && close(r.fighters.reading.gain, 0.05) && close(r.fleetCannon.reading.gain, 0.1) && close(r.fighters.reading.sees, -0.1) && close(r.fighters.reading.ships, -0.15) && r.fleetNoCannon.reading.gain.mean === 0 && r.verdict.ok);
    const q = (a, b, c) => G.qualifies({ fighters: { reading: { gain: { z: a } } }, fleetCannon: { reading: { gain: { z: b } } }, fleetNoCannon: { reading: { gain: { z: c } } } });
    ok("!! WHAT SHIPS: (2, 0, 0), (0, 2, 0) and (0, 0, 2) yes -- one fight leading is enough; (1.99, 1.99, 1.99) no; (5, -2, 0), (5, 0, -2) and (-2, 5, 5) no -- no fight may trail", q(2, 0, 0).ok && q(0, 2, 0).ok && q(0, 0, 2).ok && !q(1.99, 1.99, 1.99).ok && /leads in no fight/.test(q(1.99, 1.99, 1.99).reasons[0]) && !q(5, -2, 0).ok && /in fleetCannon the gain TRAILS/.test(q(5, -2, 0).reasons[0]) && !q(5, 0, -2).ok && /in fleetNoCannon the gain TRAILS/.test(q(5, 0, -2).reasons[0]) && !q(-2, 5, 5).ok && /in fighters the gain TRAILS/.test(q(-2, 5, 5).reasons[0]) && q(5, 5, -1.99).ok);
    const blob = G.blobOf(r), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID7, FT.movingTarget), blob);
    ok("!! the blob is a seatFlyWired7 brain of the weights -3, -3, 0.1, seated with the seeing library, and its `by` says what drives the cells, what it is to the bit, and all three fights' readings", back.ok && Array.from(back.weights).map((v) => +v.toFixed(6)).join() === "-3,-3,0.1" && blob.policy === "seatFlyWired7" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.movingTarget && /THE TARGET'S OWN BEARING RATE/.test(blob.by) && /ships-sticky gunner to the bit/.test(blob.by) && /EIGHT FIGHTERS: it .*THE CANNON ON: it .*NO CANNON: it /.test(blob.by) && blob.score === Number(r.fighters.reading.sees.mean.toFixed(3)), blob.by.slice(0, 80));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gunsees-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    // @@FOUND@@
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
