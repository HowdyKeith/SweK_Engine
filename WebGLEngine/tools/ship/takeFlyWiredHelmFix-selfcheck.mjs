// WebGLEngine/tools/ship/takeFlyWiredHelmFix-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFlyWiredHelmFix-selfcheck.mjs      (a few seconds; the study is flown here by a stand-in, one real pair; section 3 reads the kept flights once they exist)
//
// THE NO-CANNON GAIN STUDY, HELD. tools/ship/takeFlyWiredHelmFix.mjs chooses the third fly-wired helm's gains for a ship with no cannon. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pair sets (101001-, 102001-, 103001-), disjoint from every other study's; the two wirings; nine gains WITH 0 (the rule) among them; a job is NO CANNON on either side, the helm on side X only
//   2  THE STUDY             the gain 0 is never flown and reads exactly 0; each wiring's best gain; the shipped gain flown beside the chosen one on the audit pairs (once, if they are the same); R1-R3 and S1; what ships and the file it writes
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: 12 mutants of tools/ship/takeFlyWiredHelmFix.mjs, each a copy of the study with this gate (and the command rows) pointed at it: 12 red by name the first time -- the train pairs another study's, the cannon left on either side, no gain 0 among the gains, the gain 0 flown, the shipped gain not flown, R3's sign, either half of the verdict, the blob's gains in the wrong order or for the second helm's policy, a second read allowed.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as H from "./takeFlyWiredHelmFix.mjs";
import * as N from "./takeFlyWiredNext.mjs";
import * as G from "./takeFlyWiredGunner.mjs";
import * as PC from "./takePlacesControl.mjs";
import * as FH from "./takeFlyWiredHelm.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import { leadOf } from "./pairPool.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFlyWiredHelmFix.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeFlyWiredHelmFix-selfcheck -- the fly-wired helm's gains without the cannon\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = Object.values(H.SETS).flat().map((p) => p.seed), others = [N.TOGETHER.pairs, N.SEEDS.train, N.SEEDS.audit, G.TRAIN_PAIRS, G.HELD_OUT_PAIRS, G.AUDIT_PAIRS, ...Object.values(PC.STUDIES).flatMap((s) => Object.values(s.sets)), ...Object.values(FH.STUDIES).flatMap((s) => Object.values(s.sets))].flat().map((p) => p.seed);
    ok("!! 300 train pairs (seeds 101001-101075 of each kind), 300 held-out (102001-), 600 audit (103001-103150): no seed in two sets and none any other study flew", H.SETS.train.length === 300 && H.SETS.heldOut.length === 300 && H.SETS.audit.length === 600 && H.SETS.train[0].seed === 101001 && H.SETS.heldOut[0].seed === 102001 && H.SETS.audit[0].seed === 103001 && new Set(mine).size === 300 && mine.every((s) => !others.includes(s)));
    ok("two wirings (the fly's circuit read the odd way, the sine), nine gains of both signs WITH 0 AMONG THEM (so the helm can be turned off), the shipped gain -2, and the choosing is the helm study's own", H.WIRINGS.join() === "fly2~odd,sine" && H.GAINS.join() === "-2,-1,-0.5,-0.25,0,0.25,0.5,1,2" && H.SHIPPED_GAIN === -2 && H.choose === FH.choose);
    const j = H.jobsOf("fly2~odd", 0.5, [H.SETS.train[0], H.SETS.train[80]]);
    ok("!! a job: NO CANNON ON EITHER SIDE, side X the helmFlyWired helm over the named wiring at THE SAME GAIN ON BOTH AXES, side Y the rule with no helm network, the pair's kind and seed", j.every((x) => x.x.cannon === false && x.y.cannon === false && x.x.helmNet.policy === "helmFlyWired" && x.x.helmNet.wiring === "fly2~odd" && x.x.helmNet.weights.join() === "0.5,0.5" && !x.y.helmNet && x.y.id === "rule") && j[1].kind === H.SETS.train[80].kind && j[1].seed === H.SETS.train[80].seed);
});

console.log("2. THE STUDY (flown by a stand-in)");
let res = null;
await section(async () => {
    const worth = (w, g) => (w === "sine" ? -0.3 * Math.abs(g) : g === 0.25 ? 0.15 : -0.35 * Math.abs(g)), calls = []; res = await H.study(async (w, g, set) => { calls.push({ w, g, set }); return H.SETS[set].map((_, i) => worth(w, g) * factor(i)); }, () => {});
    const mf = H.SETS.audit.reduce((a, _, i) => a + factor(i), 0) / 600, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! THE GAIN 0 IS NEVER FLOWN AND READS EXACTLY 0: 16 train arms (eight a wiring), every one once; where every other gain trails the sine CHOOSES 0, flies nothing more and reads S1 exactly 0", calls.filter((c) => c.set === "train").length === 16 && !calls.some((c) => c.g === 0) && res.chosen.sine.gain === 0 && res.reading.S1.mean === 0 && res.chosen.sine.rows.find((r) => r.gain === 0).stat.mean === 0 && calls.filter((c) => c.w === "sine" && c.set !== "train").length === 0);
    ok("!! the fly's chosen gain (+0.25 here) is flown on the held-out and the audit pairs and THE SHIPPED GAIN (-2) BESIDE IT on the audit pairs; R1 the chosen against the rule (0.15), R2 the shipped (-0.70), R3 R1 less R2 (0.85)", res.chosen["fly2~odd"].gain === 0.25 && calls.filter((c) => c.w === "fly2~odd" && c.set === "audit").map((c) => c.g).sort().join() === "-2,0.25" && close(res.reading.R1, 0.15) && close(res.reading.R2, -0.7) && close(res.reading.R3, 0.85) && res.words.R2 === "TRAILS" && res.words.R3 === "LEADS" && res.reading.R1.n === 600);
    const same = []; await H.study(async (w, g, set) => { same.push({ w, g, set }); return H.SETS[set].map((_, i) => (w === "fly2~odd" && g === -2 ? 0.2 : -0.1) * factor(i)); }, () => {});
    ok("where the chosen gain IS the shipped one the audit pairs are flown once for both, and R3 is exactly 0", same.filter((c) => c.w === "fly2~odd" && c.set === "audit").length === 1);
    const q = (r1, r3) => H.qualifies({ R1: { z: r1 }, R3: { z: r3 } });
    ok("!! WHAT SHIPS: R3 must LEAD (z >= 2) and R1 must not TRAIL (z > -2) -- so a helm turned off (R1 exactly 0, z 0) ships if the shipped gain trailed", q(0, 5).ok && q(-1.99, 2).ok && !q(-2, 5).ok && !q(1, 1.99).ok && /TRAILS/.test(q(-3, 5).reasons[0]) && res.verdict.ok);
    const blob = H.blobOf(res), back = PB.importBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), blob), seat = D.sideFromBrains("s", [blob]);
    ok("!! the blob is a helmFlyWired3 brain of [-2, -2, g, g] that battleshipDuel seats at the helm, and its `by` says nothing inside is learned, that with a cannon it IS the second helm, the gain chosen without one and every reading", back.ok && Array.from(back.weights).join() === "-2,-2,0.25,0.25" && seat.side.helmNet.module === FS.third && /NOTHING INSIDE IT IS LEARNED/.test(blob.by) && /WITH ONE its gains are the second helm's shipped -2 \(it is that helm to the bit/.test(blob.by) && /WITHOUT ONE 0\.25, the best of 9/.test(blob.by) && /THE CHOSEN GAIN LESS THE SHIPPED ONE \+0\.\d{3}/.test(blob.by) && /seeds 103001-103150 of each kind/.test(blob.by));
    const real = leadOf(H.jobsOf("fly2~odd", -2, [{ kind: "crossing", seed: 90007 }])[0]);
    ok("a real job flies (one scratch pair, crossing seed 90007, in no registered set)", Number.isFinite(real) && real !== 0, `lead ${real.toFixed(3)}`);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmfix-")), out = path.join(tmp, "w.json"); fs.writeFileSync(out.replace(/\.json$/, ".reading.json"), "{}");
    const bad = run("--speed", "1", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ OF THE AUDIT before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /THE AUDIT HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(H.DEFAULT_OUT.replace(/\.json$/, ".reading.json"))) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(H.DEFAULT_OUT.replace(/\.json$/, ".reading.json"), "utf8")), k = (w, g, set) => JSON.parse(fs.readFileSync(path.join(H.KEPT_DIR, H.keptName(w, g, set)), "utf8")).leads, re = H.readings({ fly: k("fly2~odd", 0.25, "audit"), shipped: k("fly2~odd", -2, "audit"), sine: k("sine", 0.25, "audit") }).reading, near = (s, v) => Math.abs(s.mean - v) < 5e-4, blob = JSON.parse(fs.readFileSync(H.DEFAULT_OUT, "utf8"));
    ok("!! AS KEPT AND RE-DERIVED: WITHOUT THE CANNON THE BEST GAIN IS SMALL AND POSITIVE -- +0.25 for the fly's circuit and for the sine alike (every negative gain trails, and so does +0.5 or more for the fly) -- and at it the fly's helm LEADS the rule by 0.146 (R1, z 3.7) where the shipped gain TRAILS by 0.655 (R2, the together study's -0.692 again): the chosen gain is worth 0.801 (R3, z 13.8). The sine does a little better (+0.244)", rd.chosen["fly2~odd"].gain === 0.25 && rd.chosen.sine.gain === 0.25 && rd.chosen["fly2~odd"].rows.filter((r) => r.gain < 0 || r.gain >= 0.5).every((r) => r.stat.mean < -0.2) && near(rd.reading.R1, 0.146) && rd.words.R1 === "LEADS" && near(rd.reading.R2, -0.655) && rd.words.R2 === "TRAILS" && near(rd.reading.R3, 0.801) && rd.words.R3 === "LEADS" && near(rd.reading.S1, 0.244) && rd.verdict.ok && ["R1", "R2", "R3", "S1"].every((q) => Math.abs(re[q].mean - rd.reading[q].mean) < 1e-12));
    ok("!! and it shipped: brain/helmFlyWired3WeightsDefault.json is a helmFlyWired3 brain of [-2, -2, 0.25, 0.25] -- the second helm with a cannon, a weak turn the OTHER way without one", PB.importBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), blob).ok && Array.from(blob.weights).join() === "-2,-2,0.25,0.25" && /WITHOUT ONE 0\.25, the best of 9/.test(blob.by));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
