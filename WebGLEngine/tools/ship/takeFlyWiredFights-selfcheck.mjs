// WebGLEngine/tools/ship/takeFlyWiredFights-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredFights-selfcheck.mjs      (about half a minute: a few real fights; the study is flown here by a stand-in; section 4 reads the kept flights once they exist)
//
// THE FLEETS-AND-FIGHTERS STUDY, HELD. tools/ship/takeFlyWiredFights.mjs flies the two shipped fly-wired brains in fleets of three and against fighters. Four things hold it:
//
//   1  THE FIGHTER JOB       tools/ship/pairPool.mjs's fighterScore and fighterLead: the score is the share of fighters destroyed less the share of hit points lost; the plain ship against itself leads by exactly 0; a brain that is not a seat or a helm policy is refused; the pool flies a fighter job as leadOf does
//   2  WHAT WAS REGISTERED   the pairs (111001-, the duel's kinds) and the attacks (121001-, the fighter fight's kinds), disjoint from every other study's; the brains are the two SHIPPED files; the jobs carry the arm's parts, three ships a side, the cannon on both sides or neither
//   3  THE STUDY             against a stand-in: three regimes, three arms each, each once; both less the better alone; the command's refusals
//   4  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 17 mutants: 11 of tools/ship/takeFlyWiredFights.mjs and 6 of tools/ship/pairPool.mjs's fighter job, each a copy with this gate (and the command rows) pointed at it. 16 red the first time; ONE 0-RED, A GAP, CLOSED: a shipped file taken unchecked (a row now puts the gunner's file where the helm's should be). After it: 17 of 17. Red by name: either seed set another's, the fighters flown in the duel's kinds, one ship a side, the plain side keeping its cannon, `both` without the gunner, `helm` without the helm, the fighters' helm dropped, the better always the gunner, both-less-better's sign, a second read; the score without the damage or over the wrong number of ships, the plain ship given the brains, a helm policy taken in a seat, the lead's sign, leadOf ignoring a fighter job.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as F from "./takeFlyWiredFights.mjs";
import * as HF from "./takeFlyWiredHelmFix.mjs";
import * as N from "./takeFlyWiredNext.mjs";
import * as G from "./takeFlyWiredGunner.mjs";
import * as PC from "./takePlacesControl.mjs";
import * as FH from "./takeFlyWiredHelm.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import { fighterScore, fighterLead, leadOf, createPool } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredFights.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeFlyWiredFights-selfcheck -- the fly-wired brains in fleets and against fighters\n");

console.log("1. THE FIGHTER JOB");
await section(async () => {
    const t = BF.fight(99001, "beam", {});
    ok("!! fighterScore is the share of the eight fighters destroyed less the share of the ship side's hit points lost (a fight in which the ship downs all eight and takes 90 scores 1 - 0.06)", Math.abs(fighterScore(t) - (t.killed / 8 - t.damageOnShips / 1500)) < 1e-12 && t.killed === 8 && t.damageOnShips === 90 && Math.abs(fighterScore({ killed: 4, damageOnShips: 1500, ships: [1, 2] }) - (0.5 - 0.5)) < 1e-12);
    const B = F.shipped(), plain = fighterLead({ network: null, helm: null, seed: 99001, kind: "stern" }), withG = fighterLead({ network: B.gunner, helm: null, seed: 99001, kind: "stern" }), byHand = fighterScore(BF.fight(99001, "stern", { network: { module: D.PEER_POLICIES.seatFlyWired.mod, weights: Float32Array.from(B.gunner.weights) } })) - fighterScore(BF.fight(99001, "stern", {}));
    ok("!! fighterLead flies the SAME attack twice and differences the scores: the plain ship against itself leads by exactly 0; with the fly-wired gunner it is battleshipFight's own two fights, differenced by hand, to the bit; a policy that is not a seat or a helm one is refused", plain === 0 && withG === byHand && withG !== 0 && throwsWith(() => fighterLead({ network: { policy: "helmFlyWired3", weights: [1, 1, 1, 1] }, seed: 1, kind: "bow" }), /"helmFlyWired3" is not a seat policy/) && throwsWith(() => fighterLead({ helm: { policy: "seatFlyWired", weights: [1, 1] }, seed: 1, kind: "bow" }), /"seatFlyWired" is not a helm policy/), `lead ${withG.toFixed(3)}`);
    const job = { vsFighters: { network: B.gunner, helm: null, seed: 99001, kind: "stern", opts: {} } }, pool = createPool({ workers: 1 }), [viaPool] = await pool.leads([job]); await pool.close();
    ok("leadOf takes a fighter job as fighterLead does, and so does the pool's worker", leadOf(job) === withG && viaPool === withG);
});

console.log("2. WHAT WAS REGISTERED");
await section(() => {
    const mine = [...F.FLEET_PAIRS, ...F.FIGHTER_ATTACKS].map((p) => p.seed), others = [Object.values(HF.SETS), [N.TOGETHER.pairs, N.SEEDS.train, N.SEEDS.audit], [G.TRAIN_PAIRS, G.HELD_OUT_PAIRS, G.AUDIT_PAIRS], ...Object.values(PC.STUDIES).map((s) => Object.values(s.sets)), ...Object.values(FH.STUDIES).map((s) => Object.values(s.sets))].flat(2).map((p) => p.seed);
    ok("!! 300 fleet pairs (seeds 111001-111075 of each of the duel's four kinds) and 300 attacks (121001-121075 of each of the fighter fight's four: bow, beam, stern, swarm); none a seed any other study flew; three regimes, three arms, fleets of three", F.FLEET_PAIRS.length === 300 && F.FIGHTER_ATTACKS.length === 300 && F.FLEET_PAIRS[0].seed === 111001 && F.FIGHTER_ATTACKS[0].seed === 121001 && [...new Set(F.FLEET_PAIRS.map((p) => p.kind))].join() === D.KINDS.join() && [...new Set(F.FIGHTER_ATTACKS.map((p) => p.kind))].join() === "bow,beam,stern,swarm" && mine.every((s) => !others.includes(s)) && F.REGIMES.join() === "fleetCannon,fleetNoCannon,fighters" && F.ARMS.join() === "helm,gunner,both" && F.FLEET_SHIPS === 3);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flyfights-shipped-")), BR = fileURLToPath(new URL("../../brain/", import.meta.url)); fs.copyFileSync(path.join(BR, "seatFlyWiredWeightsDefault.json"), path.join(tmp, "seatFlyWiredWeightsDefault.json")); fs.copyFileSync(path.join(BR, "seatFlyWiredWeightsDefault.json"), path.join(tmp, "helmFlyWired3WeightsDefault.json"));
    ok("a shipped file that is not a brain for its policy is REFUSED by name (the gunner's file where the helm's should be)", throwsWith(() => F.shipped(tmp), /helmFlyWired3WeightsDefault\.json is refused: /)); fs.rmSync(tmp, { recursive: true, force: true });
    const B = F.shipped(), fc = F.jobsOf("fleetCannon", "helm", B, [F.FLEET_PAIRS[0]])[0], fn = F.jobsOf("fleetNoCannon", "both", B, [F.FLEET_PAIRS[0]])[0], fg = F.jobsOf("fighters", "gunner", B, [F.FIGHTER_ATTACKS[5]])[0], fb = F.jobsOf("fighters", "both", B, [F.FIGHTER_ATTACKS[0]])[0];
    ok("!! THE BRAINS ARE THE SHIPPED FILES (the helm's [-2, -2, 0.25, 0.25], the gunner's [-3, -3]); a fleet job is three ships a side, side X with the arm's parts only, side Y plain, the cannon on both sides or neither; a fighter job carries the arm's parts and the attack's seed and kind", B.helm.policy === "helmFlyWired3" && B.helm.weights.join() === "-2,-2,0.25,0.25" && B.gunner.policy === "seatFlyWired" && B.gunner.weights.join() === "-3,-3" && fc.opts.ships === 3 && fc.x.helmNet === B.helm && !fc.x.network && fc.x.cannon === true && fc.y.cannon === true && !fc.y.helmNet && fn.x.network === B.gunner && fn.x.helmNet === B.helm && fn.x.cannon === false && fn.y.cannon === false && fg.vsFighters.network === B.gunner && fg.vsFighters.helm === null && fg.vsFighters.seed === F.FIGHTER_ATTACKS[5].seed && fb.vsFighters.helm === B.helm && fb.vsFighters.network === B.gunner);
});

console.log("3. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fleetCannon: { helm: 0.9, gunner: 0.1, both: 1.05 }, fleetNoCannon: { helm: 0.1, gunner: 0.7, both: 0.75 }, fighters: { helm: 0, gunner: -0.3, both: -0.35 } }, calls = [], r = await F.study(async (g, arm) => { calls.push(g + "/" + arm); return (g === "fighters" ? F.FIGHTER_ATTACKS : F.FLEET_PAIRS).map((_, i) => W[g][arm] * factor(i)); }, () => {}), mf = F.FLEET_PAIRS.reduce((a, _, i) => a + factor(i), 0) / 300, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! each of the nine arms is flown once; each regime is read apart: with the cannon the better alone is the helm (both less it 0.15), without it the gunner (0.05), against fighters the helm (both less it -0.35)", calls.length === 9 && new Set(calls).size === 9 && r.fleetCannon.better === "helm" && close(r.fleetCannon.reading.overBetter, 0.15) && r.fleetNoCannon.better === "gunner" && close(r.fleetNoCannon.reading.overBetter, 0.05) && r.fighters.better === "helm" && close(r.fighters.reading.overBetter, -0.35) && close(r.fighters.reading.gunner, -0.3) && r.fighters.reading.helm.mean === 0);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flyfights-")), out = path.join(tmp, "r.json"); fs.writeFileSync(out, "{}");
    const bad = run("--write"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND SHIPS NOTHING (--write is refused as unknown) and refuses A SECOND READ before it flies anything", bad.status === 2 && /unknown option --write/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("4. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(F.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(F.READING, "utf8")), k = (g, arm) => JSON.parse(fs.readFileSync(path.join(F.KEPT_DIR, `${g}_${arm}.json`), "utf8")).leads, near = (s, v) => Math.abs(s.mean - v) < 5e-4, R = (g) => rd[g].reading;
    const re = Object.fromEntries(F.REGIMES.map((g) => [g, F.regimeReadings({ helm: k(g, "helm"), gunner: k(g, "gunner"), both: k(g, "both") }).reading]));
    ok("!! AS KEPT AND RE-DERIVED -- THE HELM HOLDS IN A FLEET: three ships a side WITH the cannon, the cannon-aware helm leads the plain fleet by 1.220 (z 21: more than one ship a side); WITHOUT the cannon +0.061 (cannot be told; one a side it led by 0.15); against eight fighters +0.027 (z 7: a little)", near(R("fleetCannon").helm, 1.220) && rd.fleetCannon.words.helm === "LEADS" && near(R("fleetNoCannon").helm, 0.061) && rd.fleetNoCannon.words.helm === "CANNOT BE TOLD" && near(R("fighters").helm, 0.027) && rd.fighters.words.helm === "LEADS" && F.REGIMES.every((g) => ["helm", "gunner", "both", "overBetter"].every((q) => Math.abs(re[g][q].mean - R(g)[q].mean) < 1e-12)) && fs.readdirSync(F.KEPT_DIR).length === 9);
    ok("!! THE GUNNER DOES NOT: the fly-wired gunner that led the hand gunner by 0.75 one ship a side TRAILS the plain fleet by 0.504 with the cannon and 0.500 without, and the plain ship by 0.154 against fighters -- and wherever it is, both together trail the helm alone (by 0.646, 0.506 and 0.072). The forecast was right for the fighters and WRONG for the fleets", near(R("fleetCannon").gunner, -0.504) && near(R("fleetNoCannon").gunner, -0.500) && near(R("fighters").gunner, -0.154) && F.REGIMES.every((g) => rd[g].words.gunner === "TRAILS" && rd[g].better === "helm" && rd[g].words.overBetter === "TRAILS") && near(R("fleetCannon").overBetter, -0.646) && near(R("fleetNoCannon").overBetter, -0.506) && near(R("fighters").overBetter, -0.072) && near(R("fleetCannon").both, 0.574) && near(R("fleetNoCannon").both, -0.445));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
