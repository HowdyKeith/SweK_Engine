// WebGLEngine/tools/ship/takeFlyWiredGunnerShips-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerShips-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SHIPS-STICKY GUNNER'S STUDY, HELD. tools/ship/takeFlyWiredGunnerShips.mjs flies the shipped fly-wired gunner and the one whose sight sticks to ships only, in four fights. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (161001- for both fleets without escorts, 171001- with escorts, 181001- against fighters), disjoint from every other study's; the arms the two policies at the same gains; the jobs' ships, escorts and cannon
//   2  THE STUDY             against a stand-in: eight arms, each once; the gain pair by pair; what ships (it must LEAD in both fleets without escorts and TRAIL nowhere); the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: @@LOG@@
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerShips.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerShips.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeFlyWiredGunnerShips-selfcheck -- the fly-wired gunner whose sight sticks to ships\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = [...new Set(Object.values(G.SETS).flat().map((p) => p.seed))], others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...Object.values(HF.SETS).flat()].map((p) => p.seed);
    ok("!! four fights, 300 pairs or attacks each: the two fleets without escorts on the SAME pairs (161001-, the duel's kinds), the fleets with escorts on 171001-, the fighters on 181001- (the fighter fight's kinds); none flown by another study", G.REGIMES.join() === "fleetNoCannon,fleetCannon,fleetEscorts,fighters" && G.REGIMES.every((g) => G.SETS[g].length === 300) && G.SETS.fleetNoCannon === G.SETS.fleetCannon && G.SETS.fleetNoCannon[0].seed === 161001 && G.SETS.fleetEscorts[0].seed === 171001 && G.SETS.fighters[0].seed === 181001 && G.SETS.fighters[0].kind === "bow" && mine.every((s) => !others.includes(s)));
    const a = G.jobsOf("fleetEscorts", "ships", [G.SETS.fleetEscorts[0]])[0], b = G.jobsOf("fleetCannon", "shipped", [G.SETS.fleetCannon[0]])[0], c = G.jobsOf("fighters", "ships", [G.SETS.fighters[2]])[0];
    ok("!! THE ARMS ARE THE SHIPPED GUNNER (seatFlyWired) AND THE SHIPS-STICKY ONE (seatFlyWired3) AT THE SAME GAINS; the escort fleet is three ships and SIX escorts a side with no cannon; the cannon fleet three ships, the cannon on both sides; a fighter job carries the gunner alone", G.POLICY.shipped === "seatFlyWired" && G.POLICY.ships === "seatFlyWired3" && a.x.network.policy === "seatFlyWired3" && a.x.network.weights.join() === "-3,-3" && a.opts.ships === 3 && a.opts.escorts === 6 && a.x.cannon === false && a.y.cannon === false && !a.x.helmNet && b.opts.ships === 3 && !("escorts" in b.opts) && b.x.cannon === true && b.y.cannon === true && b.x.network.policy === "seatFlyWired" && c.vsFighters.network.policy === "seatFlyWired3" && c.vsFighters.helm === null && D.PEER_POLICIES.seatFlyWired3.mod === FT.stickyShips);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fleetNoCannon: [-0.5, 0.1], fleetCannon: [-0.6, -0.3], fleetEscorts: [-0.4, -0.2], fighters: [-0.15, -0.15] }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return G.SETS[g].map((_, i) => W[g][arm === "ships" ? 1 : 0] * factor(i)); }, () => {}), mf = 300 ? G.SETS.fleetNoCannon.reduce((s, _, i) => s + factor(i), 0) / 300 : 0, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! eight arms, each once; the gain pair by pair (0.6, 0.3, 0.2, exactly 0); it ships here", calls.length === 8 && new Set(calls).size === 8 && close(r.fleetNoCannon.reading.gain, 0.6) && close(r.fleetCannon.reading.gain, 0.3) && close(r.fleetEscorts.reading.gain, 0.2) && r.fighters.reading.gain.mean === 0 && r.verdict.ok);
    const q = (a, b, c, d) => G.qualifies({ fleetNoCannon: { reading: { gain: { z: a } } }, fleetCannon: { reading: { gain: { z: b } } }, fleetEscorts: { reading: { gain: { z: c } } }, fighters: { reading: { gain: { z: d } } } });
    ok("!! WHAT SHIPS: (2, 2, 0, 0) yes; (1.99, 5, 5, 0) no -- both fleets without escorts must LEAD; (5, 5, -2, 0) no -- the escort fleet must not trail; (5, 5, 0, -2) no -- nor the fighters", q(2, 2, 0, 0).ok && !q(1.99, 5, 5, 0).ok && !q(5, 5, -2, 0).ok && /in fleetEscorts the gain TRAILS/.test(q(5, 5, -2, 0).reasons[0]) && !q(5, 5, 0, -2).ok && /in fighters the gain TRAILS/.test(q(5, 5, 0, -2).reasons[0]));
    const blob = G.blobOf(r), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID3, FT.stickyShips), blob);
    ok("!! the blob is a seatFlyWired3 brain of the gains -3, seated with the ships-sticky library, and its `by` says what the sight does, what it is to the bit where, and all four fights' readings", back.ok && Array.from(back.weights).join() === "-3,-3" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.stickyShips && /STICKS TO CAPITAL SHIPS ONLY/.test(blob.by) && /one ship a side and against fighters alone it is the shipped gunner to the bit/.test(blob.by) && /FLEETS OF THREE WITH 6 ESCORTS A SIDE, NO CANNON: it /.test(blob.by) && /ONE SHIP AGAINST EIGHT FIGHTERS: it /.test(blob.by) && /NOTHING INSIDE THE CIRCUIT IS LEARNED/.test(blob.by));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gunships-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    /*@@FOUND@@*/
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
