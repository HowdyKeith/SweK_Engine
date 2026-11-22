// WebGLEngine/tools/ship/takeFlyWiredGunnerHold-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerHold-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE HOLDING MIXED GUNNER'S STUDY, HELD. tools/ship/takeFlyWiredGunnerHold.mjs flies the ships-sticky fly-wired gunner and the mixed one that holds (the hand gunner on fighters, the network's hold with no target) in two escort fleets and against fighters. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (241001- for both escort fleets, 251001- for the fighters), disjoint from every other fly-wired study's; the arms the two policies at the same gains; the jobs' ships, escorts and cannon
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what ships (it must LEAD in one escort fleet and TRAIL nowhere); the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeFlyWiredGunnerHold.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 18 RED the first time
//   (the seeds moved, the escort fleets on separate lists, an attack short; the cannon everywhere, on one side only; four escorts; a fighter job with no gunner; the gain's sign, the arms one policy, the leads one arm's; one escort fleet asked,
//   the fighters counted as a lead, the fighters let trail, a trail at exactly -2 let by; the file's policy and score; the second read and an unknown option let through).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerHold.mjs";
import * as GS from "./takeFlyWiredGunnerShips.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as PI from "./takeFlyWiredPilot.mjs";
import * as NX from "./takeFlyWiredNext.mjs";
import * as GN from "./takeFlyWiredGunner.mjs";
import * as GM from "./takeFlyWiredGunnerMixed.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerHold.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeFlyWiredGunnerHold-selfcheck -- the fly circuit on ships, the hand on fighters, holding\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...seedsOf(HF.SETS).map((seed) => ({ seed })), ...seedsOf(GS.SETS).map((seed) => ({ seed })), ...seedsOf(GM.SETS).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(NX.SEEDS).map((seed) => ({ seed })), ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs or attacks each, 75 of each kind: the two escort fleets on the SAME pairs (241001-, the duel's kinds), the fighters on 251001- (the fighter fight's kinds); none flown by another fly-wired study", G.REGIMES.join() === "escorts,escortsCannon,fighters" && G.REGIMES.every((g) => G.SETS[g].length === 300) && G.SETS.escorts === G.SETS.escortsCannon && G.SETS.escorts[0].seed === 241001 && G.SETS.fighters[0].seed === 251001 && G.SETS.fighters[299].seed === 251075 && D.KINDS.every((k) => G.SETS.escorts.filter((p) => p.kind === k).length === 75) && BF.KINDS.every((k) => G.SETS.fighters.filter((p) => p.kind === k).length === 75) && others.length > 1000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const a = G.jobsOf("escorts", "hold", [G.SETS.escorts[0]])[0], b = G.jobsOf("escortsCannon", "ships", [G.SETS.escortsCannon[1]])[0], c = G.jobsOf("fighters", "hold", [G.SETS.fighters[2]])[0];
    ok("!! THE ARMS ARE THE SHIPS-STICKY GUNNER (seatFlyWired3) AND THE MIXED ONE THAT HOLDS (seatFlyWired6) AT THE SAME GAINS -3; an escort fleet is three ships and SIX escorts a side, the cannon on both sides in escortsCannon only, side Y plain; a fighter job carries the gunner alone", G.POLICY.ships === "seatFlyWired3" && G.POLICY.hold === "seatFlyWired6" && a.x.network.policy === "seatFlyWired6" && a.x.network.weights.join() === "-3,-3" && b.x.network.policy === "seatFlyWired3" && a.opts.ships === 3 && a.opts.escorts === 6 && !a.x.cannon && !a.y.cannon && b.x.cannon && b.y.cannon && b.opts.escorts === 6 && !a.y.network
        && c.vsFighters.network.policy === "seatFlyWired6" && c.vsFighters.helm === null && c.vsFighters.seed === G.SETS.fighters[2].seed && c.vsFighters.kind === G.SETS.fighters[2].kind && JSON.stringify(c.vsFighters.opts) === "{}");
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { escorts: [0.1, 0.25], escortsCannon: [-0.3, -0.2], fighters: [-0.15, -0.15] }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return G.SETS[g].map((_, i) => W[g][arm === "hold" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.escorts.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is the holding LESS the ships-sticky, pair by pair (0.15, 0.1, exactly 0); it ships here", calls.length === 6 && new Set(calls).size === 6 && close(r.escorts.reading.gain, 0.15) && close(r.escortsCannon.reading.gain, 0.1) && close(r.escorts.reading.hold, 0.25) && close(r.escorts.reading.ships, 0.1) && r.fighters.reading.gain.mean === 0 && r.verdict.ok);
    const q = (a, b, c) => G.qualifies({ escorts: { reading: { gain: { z: a } } }, escortsCannon: { reading: { gain: { z: b } } }, fighters: { reading: { gain: { z: c } } } });
    ok("!! WHAT SHIPS: (2, 0, 0) and (0, 2, 0) yes -- one escort fleet leading is enough; (1.99, 1.99, 5) no -- the fighters alone are not; (5, -2, 0) and (-2, 5, 0) no; (5, 5, -2) no -- nor may the fighters trail", q(2, 0, 0).ok && q(0, 2, 0).ok && !q(1.99, 1.99, 5).ok && /leads in neither escort fleet/.test(q(1.99, 1.99, 5).reasons[0]) && !q(5, -2, 0).ok && /in escortsCannon the gain TRAILS/.test(q(5, -2, 0).reasons[0]) && !q(-2, 5, 0).ok && /in escorts the gain TRAILS/.test(q(-2, 5, 0).reasons[0]) && !q(5, 5, -2).ok && /in fighters the gain TRAILS/.test(q(5, 5, -2).reasons[0]) && q(5, 5, -1.99).ok);
    const blob = G.blobOf(r), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID6, FT.mixedHold), blob);
    ok("!! the blob is a seatFlyWired6 brain of the gains -3, seated with the holding library, and its `by` says what the seat does on a fighter and with no target, what it is to the bit, and all three fights' readings", back.ok && Array.from(back.weights).join() === "-3,-3" && blob.policy === "seatFlyWired6" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.mixedHold && /LAYING THE GUN ITSELF ONLY ON A SHIP/.test(blob.by) && /with no target it HOLDS its gun/.test(blob.by) && /ships-sticky gunner to the bit/.test(blob.by) && /NO CANNON: it .*THE CANNON ON: it .*EIGHT FIGHTERS: it /.test(blob.by) && blob.score === Number(r.escortsCannon.reading.hold.mean.toFixed(3)), blob.by.slice(0, 80));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gunhold-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (g, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${g}_${arm}.json`), "utf8")).leads, near = (s, v) => Math.abs(s.mean - v) < 5e-4, R = (g) => rd[g].reading, blob = JSON.parse(fs.readFileSync(G.DEFAULT_OUT, "utf8"));
    const re = Object.fromEntries(G.REGIMES.map((g) => [g, G.fightReadings({ ships: k(g, "ships"), hold: k(g, "hold") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IT SHIPS: the holding less the ships-sticky is +0.350 (z 7.2) in escort fleets without the cannon, +0.368 (z 8.3) with it, +0.156 (z 18.7) against eight fighters; every fight LEADS", near(R("escorts").gain, 0.350) && near(R("escortsCannon").gain, 0.368) && near(R("fighters").gain, 0.156) && G.REGIMES.every((g) => rd[g].words.gain === "LEADS") && rd.verdict.ok
        && G.REGIMES.every((g) => ["hold", "ships", "gain"].every((q) => Math.abs(re[g][q].mean - R(g)[q].mean) < 1e-12 && re[g][q].n === 300)), `${R("escorts").gain.mean.toFixed(3)} ${R("escortsCannon").gain.mean.toFixed(3)} ${R("fighters").gain.mean.toFixed(3)}`);
    ok("!! against the plain side: the holding gunner +0.333 (LEADS) and the ships-sticky -0.017 in escort fleets without the cannon; +0.121 (LEADS) and -0.246 (TRAILS) with it; +0.001 (CANNOT BE TOLD) and -0.154 (TRAILS) against fighters. The forecast was right in direction everywhere and UNDER in both escort fleets (it said 0.15 and a small lead; the gain is twice that)", near(R("escorts").hold, 0.333) && rd.escorts.words.hold === "LEADS" && near(R("escorts").ships, -0.017) && near(R("escortsCannon").hold, 0.121) && rd.escortsCannon.words.hold === "LEADS" && near(R("escortsCannon").ships, -0.246) && near(R("fighters").hold, 0.001) && rd.fighters.words.hold === "CANNOT BE TOLD" && near(R("fighters").ships, -0.154));
    ok("!! and the file: a seatFlyWired6 brain of the gains -3, seated with the holding library", PB.importBrain(PB.describePolicy(FT.POLICY_ID6, FT.mixedHold), blob).ok && Array.from(blob.weights).join() === "-3,-3" && blob.policy === "seatFlyWired6" && /with no target it HOLDS its gun/.test(blob.by));
});

// v4933 -- THE EXPORT LIST, named here so tools/ship/definitionGates-selfcheck.mjs sees each export of takeFlyWiredGunnerHold.mjs held by its gate (it found these 2 unnamed at the ship):
{
    const EXPORTS = await import("./takeFlyWiredGunnerHold.mjs");
    const NAMED = ["ESCORTS", "FLEET_SHIPS"];
    ok(`the export list: ${NAMED.join(", ")} -- each exported and defined`, NAMED.every((n) => n in EXPORTS && EXPORTS[n] !== undefined), NAMED.filter((n) => !(n in EXPORTS) || EXPORTS[n] === undefined).join(", ") || "");
}
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
