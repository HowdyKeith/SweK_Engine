// WebGLEngine/tools/ship/takeFlyWiredPilot-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredPilot-selfcheck.mjs      (about a quarter of a minute: a few real fights; section 3 reads the kept flights once they exist)
//
// THE TRAINED-PILOT STUDY, HELD. tools/ship/takeFlyWiredPilot.mjs flies the shipped fly-wired helm, gunner and both against eight fighters flown by the trained 6DOF pilot. Three things hold it:
//
//   1  THE PILOT BY NAME     tools/ship/pairPool.mjs's fighter job with `pilotNet` is battleshipFight's own fight with that pilot (its gate's pinned stern attack: the ship wins at 24.1 s with 492 hit points), the same pilot on both sides of a lead; a brain that is not a pilot is refused
//   2  WHAT WAS REGISTERED   the attacks (191001-), disjoint from every other study's; the brains the SHIPPED files and the pilot the frozen -d18 one; the jobs; the readings against a stand-in; the plain ship's fate; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 12 mutants: 9 of tools/ship/takeFlyWiredPilot.mjs and 3 of tools/ship/pairPool.mjs's named pilot, each a copy with this gate (and the command rows) pointed at it. 10 red the first time; TWO 0-RED, GAPS, CLOSED -- the plain ship's fate flown without the pilot (the row now pins the one attack's fate exactly, and that it differs against PD fighters) and a shipped file taken unchecked (a row puts the gunner's file where the pilot's should be). After them: 12 of 12. Red by name: the seeds another study's, the pilot another file or none, `both` without the gunner, `helm` without the helm, both-less-better's sign, a second read; the named pilot ignored, a policy that is not a pilot taken, the pilot given to one side of a lead only.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as P from "./takeFlyWiredPilot.mjs";
import * as GS from "./takeFlyWiredGunnerShips.mjs";
import * as GF from "./takeFlyWiredGunnerFix.mjs";
import * as FF from "./takeFlyWiredFights.mjs";
import * as P6 from "../../brain/pilot6dofPolicy.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as DUEL from "../../brain/battleshipDuel.mjs";
import { fighterLead, fighterScore } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const throwsWith = (f, re) => { try { f(); return false; } catch (e) { return re.test(e.message); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredPilot.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeFlyWiredPilot-selfcheck -- the shipped fly-wired brains against the trained fighter pilot\n");

console.log("1. THE PILOT BY NAME");
await section(() => {
    const b = P.shipped(), pilot = P6.pilotFor(Float32Array.from(b.pilot.weights)), t = BF.fight(4, "stern", { pilot });
    ok("!! the frozen pilot reproduces battleshipFight's pinned stern attack (seed 4): the ship wins at 24.1 s with 492 of 1,500 hit points", t.winner === "ship" && Math.abs(t.t - 24.1) < 0.05 && t.ship.hpLeft === 492);
    const lead = fighterLead({ network: b.gunner, helm: null, seed: 4, kind: "stern", opts: { pilotNet: b.pilot } }), D = DUEL.PEER_POLICIES, byHand = fighterScore(BF.fight(4, "stern", { pilot, network: { module: D.seatFlyWired3.mod, weights: Float32Array.from(b.gunner.weights) } })) - fighterScore(t);
    ok("!! a fighter job that names the pilot is battleshipFight's two fights with that pilot, differenced, to the bit; the plain ship against itself is exactly 0; a brain that is not a pilot is refused by name", lead === byHand && fighterLead({ seed: 4, kind: "stern", opts: { pilotNet: b.pilot } }) === 0 && throwsWith(() => fighterLead({ seed: 4, kind: "stern", opts: { pilotNet: b.gunner } }), /"seatFlyWired3" is not a pilot policy/), `lead ${lead.toFixed(3)}`);
});

console.log("2. WHAT WAS REGISTERED");
await section(async () => {
    const mine = P.ATTACKS.map((p) => p.seed), others = [...Object.values(GS.SETS).flat(), ...GF.FLEET_PAIRS, ...GF.FIGHTER_ATTACKS, ...FF.FLEET_PAIRS, ...FF.FIGHTER_ATTACKS].map((p) => p.seed);
    ok("!! 300 attacks, seeds 191001-191075 of each of the four kinds, none flown by another study; three arms", P.ATTACKS.length === 300 && P.ATTACKS[0].seed === 191001 && [...new Set(P.ATTACKS.map((p) => p.kind))].join() === BF.KINDS.join() && mine.every((s) => !others.includes(s)) && P.ARMS.join() === "helm,gunner,both");
    const b = P.shipped(), j = P.jobsOf("helm", b, [P.ATTACKS[0]])[0].vsFighters, k = P.jobsOf("both", b, [P.ATTACKS[7]])[0].vsFighters;
    ok("!! THE BRAINS ARE THE SHIPPED FILES -- the cannon-aware helm [-2, -2, 0.25, 0.25], the ships-sticky gunner [-3, -3] -- AND THE PILOT THE FROZEN -d18 ONE (930 weights); a job carries the arm's parts and the pilot by name", b.helm.policy === "helmFlyWired3" && b.helm.weights.join() === "-2,-2,0.25,0.25" && b.gunner.policy === "seatFlyWired3" && b.gunner.weights.join() === "-3,-3" && b.pilot.policy === "pilot6dofPolicy" && b.pilot.weights.length === 930 && P.PILOT_FILE === "pilot6dofWeightsDefault-d18.json" && j.helm === b.helm && j.network === null && j.opts.pilotNet === b.pilot && k.helm === b.helm && k.network === b.gunner && k.seed === P.ATTACKS[7].seed);
    const calls = [], r = await P.study(async (arm) => { calls.push(arm); return P.ATTACKS.map((_, i) => ({ helm: 0.05, gunner: -0.3, both: -0.2 }[arm]) * factor(i)); }), mf = P.ATTACKS.reduce((s, _, i) => s + factor(i), 0) / 300;
    ok("each arm flown once; both less the better alone (the helm here) pair by pair (-0.25)", calls.join() === "helm,gunner,both" && r.better === "helm" && Math.abs(r.reading.overBetter.mean + 0.25 * mf) < 1e-9 && r.fate === null);
    const f = P.plainFate(b, [{ kind: "stern", seed: 4 }]), pd = BF.fight(4, "stern", {});
    ok("!! the plain ship's fate is battleshipFight's own fight WITH THE TRAINED PILOT: the stern attack of seed 4, won with 492 left (against PD fighters the same attack leaves it " + pd.ship.hpLeft + ")", f.attacks === 1 && f.won === 1 && f.lost === 0 && f.hpLeft === 492 && pd.ship.hpLeft !== 492);
    const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-shipped-")), BR = fileURLToPath(new URL("../../brain/", import.meta.url)); for (const f2 of ["helmFlyWired3WeightsDefault.json", "seatFlyWired3WeightsDefault.json"]) fs.copyFileSync(path.join(BR, f2), path.join(tmp2, f2)); fs.copyFileSync(path.join(BR, "seatFlyWired3WeightsDefault.json"), path.join(tmp2, P.PILOT_FILE));
    ok("a shipped file that is not a brain for its policy is REFUSED by name (the gunner's file where the pilot's should be)", throwsWith(() => P.shipped(tmp2), /pilot6dofWeightsDefault-d18\.json is refused: /)); fs.rmSync(tmp2, { recursive: true, force: true });
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-")), out = path.join(tmp, "r.json"); fs.writeFileSync(out, "{}");
    const bad = run("--write"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND SHIPS NOTHING (--write is refused) and refuses A SECOND READ before it flies anything", bad.status === 2 && /unknown option --write/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(P.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(P.READING, "utf8")), k = (arm) => JSON.parse(fs.readFileSync(path.join(P.KEPT_DIR, `${arm}.json`), "utf8")).leads, re = P.readings({ helm: k("helm"), gunner: k("gunner"), both: k("both") }).reading, near = (s, v) => Math.abs(s.mean - v) < 5e-4, R = rd.reading;
    ok("!! AS KEPT AND RE-DERIVED: AGAINST THE TRAINED PILOT THE FLY-WIRED HELM HELPS (+0.081, z 3.8) AND THE FLY-WIRED GUNNER HURTS (-0.308, z -17: twice what it costs against PD fighters, -0.148); both together -0.146, so the gunner takes away more than the helm adds (both less the helm -0.227). The plain ship itself wins 233 and is lost in 64 of the 300, with 173 hit points left on average", near(R.helm, 0.081) && rd.words.helm === "LEADS" && near(R.gunner, -0.308) && rd.words.gunner === "TRAILS" && near(R.both, -0.146) && rd.words.both === "TRAILS" && rd.better === "helm" && near(R.overBetter, -0.227) && rd.fate.won === 233 && rd.fate.lost === 64 && Math.abs(rd.fate.hpLeft - 173) < 1 && ["helm", "gunner", "both", "overBetter"].every((q) => Math.abs(re[q].mean - R[q].mean) < 1e-12) && fs.readdirSync(P.KEPT_DIR).length === 3);
    ok("the forecast: right for all three words; the helm led by more than it did against PD fighters (+0.081 against +0.027)", R.helm.mean > 0.027);
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
