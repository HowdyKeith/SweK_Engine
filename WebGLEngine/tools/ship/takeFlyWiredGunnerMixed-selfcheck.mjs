// WebGLEngine/tools/ship/takeFlyWiredGunnerMixed-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredGunnerMixed-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE MIXED GUNNER'S STUDY, HELD. tools/ship/takeFlyWiredGunnerMixed.mjs flies the ships-sticky fly-wired gunner and the mixed one (the hand gunner on fighters) in three fleet fights. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (221001- for both escort fleets, 231001- for the fleet without escorts), disjoint from every other fly-wired study's; the arms the two policies at the same gains; the jobs' ships, escorts and cannon
//   2  THE STUDY             against a stand-in: six arms, each once; the gain pair by pair; what ships (it must LEAD in one escort fleet and TRAIL nowhere); the file; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 18 mutants of tools/ship/takeFlyWiredGunnerMixed.mjs, each a copy of the study with this gate (and the command rows) pointed at it, before the study was registered: ALL 18 RED the first time
//   (the seeds moved, the escort fleets on separate pair lists, a pair short; the cannon in every fight, on one side only; escorts in the plain fleet, four escorts; the gain's sign, the two arms one policy, the leads one arm's;
//   one escort fleet asked to lead, both asked; the fleet without escorts let trail, a trail at exactly -2 let by; the file's policy and score; the second read and an unknown option let through).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as G from "./takeFlyWiredGunnerMixed.mjs";
import * as GS from "./takeFlyWiredGunnerShips.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as PI from "./takeFlyWiredPilot.mjs";
import * as NX from "./takeFlyWiredNext.mjs";
import * as GN from "./takeFlyWiredGunner.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredGunnerMixed.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
const seedsOf = (M) => Object.values(M).flat().filter((p) => p && typeof p.seed === "number").map((p) => p.seed);

console.log("takeFlyWiredGunnerMixed-selfcheck -- the fly circuit on ships, the hand on fighters\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = new Set(seedsOf(G.SETS)), others = [...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS, ...seedsOf(HF.SETS).map((seed) => ({ seed })), ...seedsOf(GS.SETS).map((seed) => ({ seed })), ...PI.ATTACKS, ...NX.TOGETHER.pairs, ...seedsOf(NX.SEEDS).map((seed) => ({ seed })), ...seedsOf(GN.SETS).map((seed) => ({ seed }))].map((p) => p.seed);
    ok("!! three fights, 300 pairs each, the duel's kinds 75 apiece: the two escort fleets on the SAME pairs (221001-), the fleet without escorts on 231001-; none flown by another fly-wired study", G.REGIMES.join() === "escorts,escortsCannon,fleet" && G.REGIMES.every((g) => G.SETS[g].length === 300) && G.SETS.escorts === G.SETS.escortsCannon && G.SETS.escorts[0].seed === 221001 && G.SETS.fleet[0].seed === 231001 && G.SETS.fleet[299].seed === 231075 && D.KINDS.every((k) => G.SETS.fleet.filter((p) => p.kind === k).length === 75) && others.length > 1000 && others.every((s) => !mine.has(s)), `${others.length} others`);
    const a = G.jobsOf("escorts", "mixed", [G.SETS.escorts[0]])[0], b = G.jobsOf("escortsCannon", "ships", [G.SETS.escortsCannon[1]])[0], c = G.jobsOf("fleet", "mixed", [G.SETS.fleet[2]])[0];
    ok("!! THE ARMS ARE THE SHIPS-STICKY GUNNER (seatFlyWired3) AND THE MIXED ONE (seatFlyWired4) AT THE SAME GAINS -3; an escort fleet is three ships and SIX escorts a side, the cannon on both sides in escortsCannon only; the plain fleet three ships, no escorts, no cannon; side Y plain", G.POLICY.ships === "seatFlyWired3" && G.POLICY.mixed === "seatFlyWired4" && a.x.network.policy === "seatFlyWired4" && a.x.network.weights.join() === "-3,-3" && b.x.network.policy === "seatFlyWired3" && a.opts.ships === 3 && a.opts.escorts === 6 && !a.x.cannon && !a.y.cannon && b.x.cannon && b.y.cannon && b.opts.escorts === 6 && c.opts.ships === 3 && c.opts.escorts === undefined && !c.x.cannon && !c.y.network && c.seed === G.SETS.fleet[2].seed && c.kind === G.SETS.fleet[2].kind);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { escorts: [0.1, 0.25], escortsCannon: [-0.3, -0.2], fleet: [0.05, 0.05] }, calls = [], r = await G.study(async (g, arm) => { calls.push(g + "/" + arm); return G.SETS[g].map((_, i) => W[g][arm === "mixed" ? 1 : 0] * factor(i)); }, () => {}), mf = G.SETS.escorts.reduce((s, _, i) => s + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the gain is the mixed LESS the ships-sticky, pair by pair (0.15, 0.1, exactly 0); it ships here", calls.length === 6 && new Set(calls).size === 6 && close(r.escorts.reading.gain, 0.15) && close(r.escortsCannon.reading.gain, 0.1) && close(r.escorts.reading.mixed, 0.25) && close(r.escorts.reading.ships, 0.1) && r.fleet.reading.gain.mean === 0 && r.verdict.ok);
    const q = (a, b, c) => G.qualifies({ escorts: { reading: { gain: { z: a } } }, escortsCannon: { reading: { gain: { z: b } } }, fleet: { reading: { gain: { z: c } } } });
    ok("!! WHAT SHIPS: (2, 0, 0) and (0, 2, 0) yes -- one escort fleet leading is enough; (1.99, 1.99, 0) no; (5, -2, 0) and (-2, 5, 0) no -- the other escort fleet must not trail; (5, 5, -2) no -- nor the fleet without escorts", q(2, 0, 0).ok && q(0, 2, 0).ok && !q(1.99, 1.99, 0).ok && /leads in neither escort fleet/.test(q(1.99, 1.99, 0).reasons[0]) && !q(5, -2, 0).ok && /in escortsCannon the gain TRAILS/.test(q(5, -2, 0).reasons[0]) && !q(-2, 5, 0).ok && /in escorts the gain TRAILS/.test(q(-2, 5, 0).reasons[0]) && !q(5, 5, -2).ok && /in fleet the gain TRAILS/.test(q(5, 5, -2).reasons[0]) && q(5, 5, -1.99).ok);
    const blob = G.blobOf(r), back = PB.importBrain(PB.describePolicy(FT.POLICY_ID4, FT.mixed), blob);
    ok("!! the blob is a seatFlyWired4 brain of the gains -3, seated with the mixed library, and its `by` says what the seat does on a fighter, what it is to the bit, and all three fights' readings", back.ok && Array.from(back.weights).join() === "-3,-3" && blob.policy === "seatFlyWired4" && D.sideFromBrains("s", [blob]).side.seatNetworks["main-a"].module === FT.mixed && /LAYING THE GUN ITSELF ONLY ON A SHIP/.test(blob.by) && /plain ship to the bit/.test(blob.by) && /NO CANNON: it .*THE CANNON ON: it .*NO ESCORTS, NO CANNON: it /.test(blob.by) && blob.score === Number(r.escorts.reading.mixed.mean.toFixed(3)), blob.by.slice(0, 80));
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gunmixed-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(G.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (g, arm) => JSON.parse(fs.readFileSync(path.join(G.KEPT_DIR, `${g}_${arm}.json`), "utf8")).leads, near = (s, v) => Math.abs(s.mean - v) < 5e-4, R = (g) => rd[g].reading;
    const re = Object.fromEntries(G.REGIMES.map((g) => [g, G.fightReadings({ ships: k(g, "ships"), mixed: k(g, "mixed") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- IT DOES NOT SHIP: the mixed less the ships-sticky is -0.094 (z -1.9, CANNOT BE TOLD) in escort fleets without the cannon, +0.154 (z 3.6, LEADS) with it, and -0.269 (z -7.3, TRAILS) in fleets with no escorts -- where the only difference is that a seat with no target lets its gun go back to rest; no file was written", near(R("escorts").gain, -0.094) && near(R("escortsCannon").gain, 0.154) && near(R("fleet").gain, -0.269) && rd.escorts.words.gain === "CANNOT BE TOLD" && rd.escortsCannon.words.gain === "LEADS" && rd.fleet.words.gain === "TRAILS" && !rd.verdict.ok && rd.verdict.reasons.join() === "in fleet the gain TRAILS" && !fs.existsSync(G.DEFAULT_OUT)
        && G.REGIMES.every((g) => ["mixed", "ships", "gain"].every((q) => Math.abs(re[g][q].mean - R(g)[q].mean) < 1e-12 && re[g][q].n === 300)), `${R("escorts").gain.mean.toFixed(3)} ${R("escortsCannon").gain.mean.toFixed(3)} ${R("fleet").gain.mean.toFixed(3)}`);
    ok("against the plain side: the ships-sticky +0.118 (LEADS) and the mixed +0.024 in escort fleets without the cannon; -0.101 and +0.053 with it; +0.012 and -0.257 (TRAILS) with no escorts. The forecast was wrong in two of three: it said a lead without the cannon too, and CANNOT BE TOLD with no escorts", near(R("escorts").ships, 0.118) && near(R("escorts").mixed, 0.024) && near(R("escortsCannon").ships, -0.101) && near(R("escortsCannon").mixed, 0.053) && near(R("fleet").ships, 0.012) && near(R("fleet").mixed, -0.257) && rd.fleet.words.mixed === "TRAILS");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
