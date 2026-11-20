// WebGLEngine/tools/ship/takeFlyWiredGunnerNear-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerNear-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE NEAR-HAND GUNNER'S STUDY, HELD. tools/ship/takeFlyWiredGunnerNear.mjs flies the page's fly-wired gunner (seatFlyWired8) and the one whose hand lays the last degrees (seatFlyWired9) in four fleet fights. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (361001- for both escort fleets, 371001- for both fleets without escorts), disjoint from every other fly-wired study's; the arms the two policies at the same gains; the jobs' ships, escorts and cannon
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what ships (it must LEAD in one fight and TRAIL nowhere); the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeFlyWiredGunnerNear.mjs (the seeing holding gunner study's set, carried over), each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: 17 RED the first
//   time, ONE 0-RED, A GAP, CLOSED -- the file's score read off the other arm (the stand-in gave both arms the same lead in that fight; it now does not) -> 1. Three of the carried-over mutants first came out as no-ops in the carrying and were rewritten.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerNear.mjs";
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
import * as SE from "./takeFlyWiredGunnerSees.mjs";
import * as HSS from "./takeFlyWiredGunnerHoldSees.mjs";
import * as BL2 from "./takeBestShipLoadout2.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerNear.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeFlyWiredGunnerNear-selfcheck -- the hand for the last degrees\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...seedsOf(HF.SETS).map((seed) => ({ seed })), ...seedsOf(GS.SETS).map((seed) => ({ seed })), ...seedsOf(GM.SETS).map((seed) => ({ seed })), ...seedsOf(GH.SETS).map((seed) => ({ seed })), ...seedsOf(BL.SETS).map((seed) => ({ seed })), ...seedsOf(SE.SETS).map((seed) => ({ seed })), ...seedsOf(HSS.SETS).map((seed) => ({ seed })), ...seedsOf(BL2.SETS).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(NX.SEEDS).map((seed) => ({ seed })), ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! four fights, 300 pairs each, the duel's kinds 75 apiece: both escort fleets on the SAME pairs (361001-), both fleets without escorts on the SAME pairs (371001-); none flown by another fly-wired study", G.REGIMES.join() === "escorts,escortsCannon,fleetCannon,fleetNoCannon" && G.REGIMES.every((g) => G.SETS[g].length === 300 && D.KINDS.every((k) => G.SETS[g].filter((p) => p.kind === k).length === 75)) && G.SETS.escorts === G.SETS.escortsCannon && G.SETS.fleetCannon === G.SETS.fleetNoCannon && G.SETS.escorts[0].seed === 361001 && G.SETS.fleetCannon[299].seed === 371075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const j = (g, arm, i) => G.jobsOf(g, arm, [G.SETS[g][i]])[0], a = j("escorts", "near", 0), b = j("escortsCannon", "sees", 1), c = j("fleetCannon", "near", 2), d = j("fleetNoCannon", "sees", 3);
    ok("!! THE ARMS ARE THE PAGE'S GUNNER (seatFlyWired8) AND THE NEAR-HAND ONE (seatFlyWired9), BOTH AT -3, -3, 0.1; an escort fleet is three ships and SIX escorts a side, a plain fleet three ships and none; the cannon on both sides exactly in escortsCannon and fleetCannon; side Y plain", G.POLICY.sees === "seatFlyWired8" && G.POLICY.near === "seatFlyWired9" && a.x.network.policy === "seatFlyWired9" && a.x.network.weights.join() === "-3,-3,0.1" && b.x.network.policy === "seatFlyWired8" && b.x.network.weights.join() === "-3,-3,0.1"
        && a.opts.escorts === 6 && b.opts.escorts === 6 && c.opts.escorts === undefined && d.opts.escorts === undefined && [a, b, c, d].every((q) => q.opts.ships === 3 && !q.y.network && q.x.cannon === q.y.cannon) && !a.x.cannon && b.x.cannon && c.x.cannon && !d.x.cannon && d.seed === G.SETS.fleetNoCannon[3].seed && d.kind === G.SETS.fleetNoCannon[3].kind);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { escorts: [0.1, 0.25], escortsCannon: [-0.3, -0.2], fleetCannon: [0.05, 0.05], fleetNoCannon: [0.2, 0.1] }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return G.SETS[g].map((_, i) => W[g][arm === "near" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.escorts.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! eight arms, each once; the gain is the near-hand gunner LESS the page's, pair by pair (0.15, 0.1, exactly 0, -0.1); it does not ship here (a fight trails)", calls.length === 8 && new Set(calls).size === 8 && close(r.escorts.reading.gain, 0.15) && close(r.escortsCannon.reading.gain, 0.1) && r.fleetCannon.reading.gain.mean === 0 && close(r.fleetNoCannon.reading.gain, -0.1) && close(r.escorts.reading.near, 0.25) && close(r.escorts.reading.sees, 0.1) && !r.verdict.ok && /in fleetNoCannon the gain TRAILS/.test(r.verdict.reasons.join()));
    const q = (a, b, c, d) => G.qualifies(Object.fromEntries(G.REGIMES.map((g, i) => [g, { reading: { gain: { z: [a, b, c, d][i] } } }])));
    ok("!! WHAT SHIPS: a lead in any one fight is enough ((2,0,0,0) ... (0,0,0,2)); (1.99 everywhere) no; a trail anywhere no ((5,5,5,-2), (-2,5,5,5)); -1.99 is not a trail", [0, 1, 2, 3].every((k) => q(...[0, 0, 0, 0].map((_, i) => (i === k ? 2 : 0))).ok) && !q(1.99, 1.99, 1.99, 1.99).ok && /leads in no fight/.test(q(1.99, 1.99, 1.99, 1.99).reasons[0]) && !q(5, 5, 5, -2).ok && /in fleetNoCannon the gain TRAILS/.test(q(5, 5, 5, -2).reasons[0]) && !q(-2, 5, 5, 5).ok && /in escorts the gain TRAILS/.test(q(-2, 5, 5, 5).reasons[0]) && q(5, 5, 5, -1.99).ok);
    const W2 = { escorts: [0.1, 0.25], escortsCannon: [-0.3, -0.2], fleetCannon: [0.05, 0.08], fleetNoCannon: [0.1, 0.2] }, r2 = await G.study(async (g, arm) => G.SETS[g].map((_, i) => W2[g][arm === "near" ? 1 : 0] * factor(i)), () => {}), blob = G.blobOf(r2), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID9, FT.holdNear), blob);
    ok("!! the blob is a seatFlyWired9 brain of the weights -3, -3, 0.1, seated with the near-hand library, and its `by` says where the hand lays the gun, what it is to the bit, and all four fights' readings", r2.verdict.ok && back.ok && Array.from(back.weights).map((v) => +v.toFixed(6)).join() === "-3,-3,0.1" && blob.policy === "seatFlyWired9" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.holdNear && /THE TARGET'S OWN BEARING RATE/.test(blob.by) && /ON A FIGHTER the seat is the hand gunner/.test(blob.by) && /HOLDS its gun/.test(blob.by) && /WITHIN 20 DEGREES OF THE SIGHT'S SOLUTION, WHERE THE HAND LAYS IT/.test(blob.by) && /seatFlyWired8 to the bit/.test(blob.by) && /NO CANNON: it .*THE CANNON ON: it .*NO ESCORTS, THE CANNON ON: it .*NO ESCORTS, NO CANNON: it /.test(blob.by) && blob.score === Number(r2.fleetCannon.reading.near.mean.toFixed(3)), blob.by.slice(0, 80));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gunnear-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (g, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${g}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (g) => rd[g].reading, blob = JSON.parse(fs.readFileSync(G.DEFAULT_OUT, "utf8"));
    const re = Object.fromEntries(G.REGIMES.map((g) => [g, G.fightReadings({ sees: k(g, "sees"), near: k(g, "near") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IT SHIPS: the near-hand gunner less the page's is +0.224 (z 4.7) and +0.308 (z 6.4) with escorts, without and with the cannon, +0.363 (z 8.0) and +0.177 (z 4.1) without escorts, with and without it; every fight LEADS", near(R("escorts").gain, 0.224) && near(R("escortsCannon").gain, 0.308) && near(R("fleetCannon").gain, 0.363) && near(R("fleetNoCannon").gain, 0.177) && G.REGIMES.every((g) => rd[g].words.gain === "LEADS") && rd.verdict.ok
        && G.REGIMES.every((g) => ["near", "sees", "gain"].every((q) => Math.abs(re[g][q].mean - R(g)[q].mean) < 1e-12 && re[g][q].n === 300)), G.REGIMES.map((g) => R(g).gain.mean.toFixed(3)).join(" "));
    ok("!! AND IT NOW LEADS THE PLAIN SIDE IN EVERY FIGHT: +0.650, +0.573, +0.141 (the fight the fly-wired gunner had always lost, the cannon on and no escorts: the page's -0.222 there) and +0.344. The forecast was right in direction everywhere, UNDER with escorts (it said a smaller lead; the gain is larger) and about right without", G.REGIMES.every((g) => rd[g].words.near === "LEADS") && near(R("escorts").near, 0.650) && near(R("escortsCannon").near, 0.573) && near(R("fleetCannon").near, 0.141) && near(R("fleetCannon").sees, -0.222) && rd.fleetCannon.words.sees === "TRAILS" && near(R("fleetNoCannon").near, 0.344));
    ok("!! and the file: a seatFlyWired9 brain of the weights -3, -3, 0.1, the page's `flywired` hand", PB.importBrain(PB.describePolicy(FT.POLICY_ID9, FT.holdNear), blob).ok && Array.from(blob.weights).map((v) => +v.toFixed(6)).join() === "-3,-3,0.1" && blob.policy === "seatFlyWired9");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
