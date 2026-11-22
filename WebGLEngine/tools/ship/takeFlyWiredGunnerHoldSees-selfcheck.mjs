// WebGLEngine/tools/ship/takeFlyWiredGunnerHoldSees-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerHoldSees-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SEEING HOLDING GUNNER'S STUDY, HELD. tools/ship/takeFlyWiredGunnerHoldSees.mjs flies the holding mixed gunner (seatFlyWired6) and the one that also sees its target move (seatFlyWired8) in four fleet fights. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (321001- for both escort fleets, 331001- for both fleets without escorts), disjoint from every other fly-wired study's; the arms the two policies at the same gains; the jobs' ships, escorts and cannon
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what ships (it must LEAD in one fight and TRAIL nowhere); the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeFlyWiredGunnerHoldSees.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 18 RED the first time
//   (the seeds moved, a pair short, the escort fleets on separate lists; the cannon in the escort fleets only, on one side only; escorts everywhere, four escorts; tau 0, the arms one policy; the gain's sign, the leads one arm's;
//   only the first fight allowed to lead, a trail at exactly -2 let by, the last fight let trail; the file's policy and score; the second read and an unknown option let through).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerHoldSees.mjs";
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
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerHoldSees.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeFlyWiredGunnerHoldSees-selfcheck -- the holding gunner that sees its target move\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...seedsOf(HF.SETS).map((seed) => ({ seed })), ...seedsOf(GS.SETS).map((seed) => ({ seed })), ...seedsOf(GM.SETS).map((seed) => ({ seed })), ...seedsOf(GH.SETS).map((seed) => ({ seed })), ...seedsOf(BL.SETS).map((seed) => ({ seed })), ...seedsOf(SE.SETS).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(NX.SEEDS).map((seed) => ({ seed })), ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! four fights, 300 pairs each, the duel's kinds 75 apiece: both escort fleets on the SAME pairs (321001-), both fleets without escorts on the SAME pairs (331001-); none flown by another fly-wired study", G.REGIMES.join() === "escorts,escortsCannon,fleetCannon,fleetNoCannon" && G.REGIMES.every((g) => G.SETS[g].length === 300 && D.KINDS.every((k) => G.SETS[g].filter((p) => p.kind === k).length === 75)) && G.SETS.escorts === G.SETS.escortsCannon && G.SETS.fleetCannon === G.SETS.fleetNoCannon && G.SETS.escorts[0].seed === 321001 && G.SETS.fleetCannon[299].seed === 331075 && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const j = (g, arm, i) => G.jobsOf(g, arm, [G.SETS[g][i]])[0], a = j("escorts", "both", 0), b = j("escortsCannon", "hold", 1), c = j("fleetCannon", "both", 2), d = j("fleetNoCannon", "hold", 3);
    ok("!! THE ARMS ARE THE HOLDING GUNNER (seatFlyWired6 at -3, -3) AND THE HOLDING GUNNER THAT SEES (seatFlyWired8 at -3, -3, 0.1); an escort fleet is three ships and SIX escorts a side, a plain fleet three ships and none; the cannon on both sides exactly in escortsCannon and fleetCannon; side Y plain", G.POLICY.hold === "seatFlyWired6" && G.POLICY.both === "seatFlyWired8" && a.x.network.policy === "seatFlyWired8" && a.x.network.weights.join() === "-3,-3,0.1" && b.x.network.policy === "seatFlyWired6" && b.x.network.weights.join() === "-3,-3"
        && a.opts.escorts === 6 && b.opts.escorts === 6 && c.opts.escorts === undefined && d.opts.escorts === undefined && [a, b, c, d].every((q) => q.opts.ships === 3 && !q.y.network && q.x.cannon === q.y.cannon) && !a.x.cannon && b.x.cannon && c.x.cannon && !d.x.cannon && d.seed === G.SETS.fleetNoCannon[3].seed && d.kind === G.SETS.fleetNoCannon[3].kind);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { escorts: [0.1, 0.25], escortsCannon: [-0.3, -0.2], fleetCannon: [0.05, 0.05], fleetNoCannon: [0.2, 0.1] }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return G.SETS[g].map((_, i) => W[g][arm === "both" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.escorts.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! eight arms, each once; the gain is the seeing holding gunner LESS the holding one, pair by pair (0.15, 0.1, exactly 0, -0.1); it does not ship here (a fight trails)", calls.length === 8 && new Set(calls).size === 8 && close(r.escorts.reading.gain, 0.15) && close(r.escortsCannon.reading.gain, 0.1) && r.fleetCannon.reading.gain.mean === 0 && close(r.fleetNoCannon.reading.gain, -0.1) && close(r.escorts.reading.both, 0.25) && close(r.escorts.reading.hold, 0.1) && !r.verdict.ok && /in fleetNoCannon the gain TRAILS/.test(r.verdict.reasons.join()));
    const q = (a, b, c, d) => G.qualifies(Object.fromEntries(G.REGIMES.map((g, i) => [g, { reading: { gain: { z: [a, b, c, d][i] } } }])));
    ok("!! WHAT SHIPS: a lead in any one fight is enough ((2,0,0,0) ... (0,0,0,2)); (1.99 everywhere) no; a trail anywhere no ((5,5,5,-2), (-2,5,5,5)); -1.99 is not a trail", [0, 1, 2, 3].every((k) => q(...[0, 0, 0, 0].map((_, i) => (i === k ? 2 : 0))).ok) && !q(1.99, 1.99, 1.99, 1.99).ok && /leads in no fight/.test(q(1.99, 1.99, 1.99, 1.99).reasons[0]) && !q(5, 5, 5, -2).ok && /in fleetNoCannon the gain TRAILS/.test(q(5, 5, 5, -2).reasons[0]) && !q(-2, 5, 5, 5).ok && /in escorts the gain TRAILS/.test(q(-2, 5, 5, 5).reasons[0]) && q(5, 5, 5, -1.99).ok);
    const W2 = { escorts: [0.1, 0.25], escortsCannon: [-0.3, -0.2], fleetCannon: [0.05, 0.05], fleetNoCannon: [0.1, 0.2] }, r2 = await G.study(async (g, arm) => G.SETS[g].map((_, i) => W2[g][arm === "both" ? 1 : 0] * factor(i)), () => {}), blob = G.blobOf(r2), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID8, FT.holdSees), blob);
    ok("!! the blob is a seatFlyWired8 brain of the weights -3, -3, 0.1, seated with the seeing holding library, and its `by` says what the seat does on a ship, on a fighter and with no target, what it is to the bit, and all four fights' readings", r2.verdict.ok && back.ok && Array.from(back.weights).map((v) => +v.toFixed(6)).join() === "-3,-3,0.1" && blob.policy === "seatFlyWired8" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.holdSees && /THE TARGET'S OWN BEARING RATE/.test(blob.by) && /ON A FIGHTER the seat is the hand gunner/.test(blob.by) && /HOLDS its gun/.test(blob.by) && /seatFlyWired6 to the bit/.test(blob.by) && /NO CANNON: it .*THE CANNON ON: it .*NO ESCORTS, THE CANNON ON: it .*NO ESCORTS, NO CANNON: it /.test(blob.by) && blob.score === Number(r2.escorts.reading.both.mean.toFixed(3)), blob.by.slice(0, 80));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gunholdsees-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (g, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${g}_${arm}.json`), "utf8")).leads, near = (x, v) => Math.abs(x.mean - v) < 5e-4, R = (g) => rd[g].reading, blob = JSON.parse(fs.readFileSync(G.DEFAULT_OUT, "utf8"));
    const re = Object.fromEntries(G.REGIMES.map((g) => [g, G.fightReadings({ hold: k(g, "hold"), both: k(g, "both") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IT SHIPS: the seeing holding gunner less the holding one is +0.053 (z 1.5) and +0.055 (z 1.7) in escort fleets without and with the cannon (CANNOT BE TOLD), +0.053 (z 2.5) and +0.116 (z 4.2) in fleets without escorts with and without it (LEADS); it trails nowhere", near(R("escorts").gain, 0.053) && near(R("escortsCannon").gain, 0.055) && near(R("fleetCannon").gain, 0.053) && near(R("fleetNoCannon").gain, 0.116) && rd.escorts.words.gain === "CANNOT BE TOLD" && rd.escortsCannon.words.gain === "CANNOT BE TOLD" && rd.fleetCannon.words.gain === "LEADS" && rd.fleetNoCannon.words.gain === "LEADS" && rd.verdict.ok
        && G.REGIMES.every((g) => ["both", "hold", "gain"].every((q) => Math.abs(re[g][q].mean - R(g)[q].mean) < 1e-12 && re[g][q].n === 300)), G.REGIMES.map((g) => R(g).gain.mean.toFixed(3)).join(" "));
    ok("!! against the plain side: +0.397 and +0.241 with escorts (both LEAD), -0.252 (still TRAILS) and +0.230 (LEADS) without; the holding gunner +0.344, +0.185, -0.305, +0.114. The forecast was right in direction everywhere and right in size without escorts (+0.05 and +0.12 against about +0.10 and +0.11), and about half the size with them", near(R("escorts").both, 0.397) && near(R("escortsCannon").both, 0.241) && near(R("fleetCannon").both, -0.252) && rd.fleetCannon.words.both === "TRAILS" && near(R("fleetNoCannon").both, 0.230) && near(R("escorts").hold, 0.344) && near(R("escortsCannon").hold, 0.185) && near(R("fleetCannon").hold, -0.305) && near(R("fleetNoCannon").hold, 0.114));
    ok("!! and the file: a seatFlyWired8 brain of the weights -3, -3, 0.1, the page's `flywired` hand", PB.importBrain(PB.describePolicy(FT.POLICY_ID8, FT.holdSees), blob).ok && Array.from(blob.weights).map((v) => +v.toFixed(6)).join() === "-3,-3,0.1" && blob.policy === "seatFlyWired8");
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeFlyWiredGunnerHoldSees.mjs held by its gate (it found these 4 unnamed at the ship):
{
    const EXPORTS = await import("./takeFlyWiredGunnerHoldSees.mjs");
    const NAMED = ["FLEET_SHIPS", "GAINS", "TAU", "WEIGHTS"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
