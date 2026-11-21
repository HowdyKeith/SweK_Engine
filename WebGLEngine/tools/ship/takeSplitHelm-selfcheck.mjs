// WebGLEngine/tools/ship/takeSplitHelm-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSplitHelm-selfcheck.mjs      (seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// A HELM CHOSEN BY THE CANNON, HELD. tools/ship/takeSplitHelm.mjs flies the split helm (the sine twin with the cannon, the fly's helm without) against
// the fly's helm in the cannon fights and decides the best-ship button's helm. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1541001-, 1551001-), disjoint from every other study of the fly-wired line, takeFlyVsSine's and takeSineHelmBest's
//                            included; the jobs are takeFlyVsSine's; WITHOUT the cannon the two arms are the same jobs, which is why no such fight is flown
//   2  THE STUDY             against a stand-in: four arms, each once; the gain is the split less the fly; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights, and the page as decided
//
// @@READ@@
//
// SABOTAGE LOG: 13 mutants of tools/ship/takeSplitHelm.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 13 RED the first time
//   (a seed moved, old pairs, a quarter of the pairs short; the split always the sine, always the fly; the gain's sign; a lead at exactly 2 let by, a trail
//   in fleets ignored, a lead in fleets demanded; the jobs on takeFlyVsSine's pairs, one arm's helm for both; an unknown option and a second read let
//   through). No mutant flew into the real folders.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as PT from "./pairsTaken.mjs";
import * as FV from "./takeFlyVsSine.mjs";
import * as SB from "./takeSineHelmBest.mjs";
import * as G from "./takeSplitHelm.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeSplitHelm.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeSplitHelm-selfcheck -- a helm chosen by the cannon, against the fly's helm\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeSplitHelm.mjs"])).flat();
    ok("!! two fights with the cannon: one ship a side 1200 pairs (300 of each kind) on 1541001-1541300, fleets of three 600 (150 of each) on 1551001-1551150; none twice; none flown by another study of the line, takeFlyVsSine's and takeSineHelmBest's included",
        G.FIGHTS.join() === "oneCannon,fleetCannon" && G.SETS.oneCannon.length === 1200 && G.SETS.fleetCannon.length === 600 && D.KINDS.every((k) => G.SETS.oneCannon.filter((p) => p.kind === k).length === 300 && G.SETS.fleetCannon.filter((p) => p.kind === k).length === 150)
        && Math.min(...G.SETS.oneCannon.map((p) => p.seed)) === 1541001 && Math.max(...G.SETS.oneCannon.map((p) => p.seed)) === 1541300 && Math.min(...G.SETS.fleetCannon.map((p) => p.seed)) === 1551001 && Math.max(...G.SETS.fleetCannon.map((p) => p.seed)) === 1551150
        && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 1800 && others.length > 30000 && others.every((x) => !mine.has(x)) && [...FV.FIGHTS.flatMap((f) => FV.SETS[f]), ...SB.FIGHTS.flatMap((f) => SB.SETS[f])].every((p) => !mine.has(p.seed)), `${others.length} others`);
    const b = G.brainsOf(), L = (f) => [G.SETS[f][0]], j = (f, a) => JSON.stringify(G.jobsOf(f, a, b, L(f)));
    ok("!! THE JOBS ARE takeFlyVsSine's: the fly arm its fly arm, the split arm with the cannon its SINE arm; the cannon on in both fights", G.FIGHTS.every((f) => j(f, "fly") === JSON.stringify(FV.jobsOf(f, "fly", b, L(f))) && j(f, "split") === JSON.stringify(FV.jobsOf(f, "sine", b, L(f))))
        && G.FIGHTS.every((f) => FV.SETUP[f].cannon) && G.jobsOf("oneCannon", "split", b)[0].x.helmNet.wiring === "sine~odd" && G.jobsOf("oneCannon", "fly", b)[0].x.helmNet.wiring === undefined && G.jobsOf("fleetCannon", "fly", b)[0].opts.ships === 3);
    const p = FV.SETS.oneNone[0];
    ok("!! WITHOUT THE CANNON THE SPLIT HELM IS THE FLY'S HELM: the same jobs, so their difference is zero by construction and nothing is flown for it", G.splitArmOf("oneNone") === "fly" && G.splitArmOf("fleetNone") === "fly" && G.splitArmOf("oneCannon") === "sine"
        && JSON.stringify(G.jobsOf("oneNone", "split", b, [p])) === JSON.stringify(G.jobsOf("oneNone", "fly", b, [p])) && JSON.stringify(G.jobsOf("fleetNone", "split", b, [FV.SETS.fleetNone[0]])) === JSON.stringify(G.jobsOf("fleetNone", "fly", b, [FV.SETS.fleetNone[0]])));
    const best = C.PRESETS.find((x) => x.id === "best");
    ok("!! THE BUTTON AS IT IS: the best ship carries the fly's cannon-aware helm", best.choice.helm === "flywired" || best.choice.helm === "split");
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { oneCannon: [1, 1.1], fleetCannon: [1, 0.9] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "fly" ? 0 : 1] * factor(i)); }, () => {});
    const mf = (f) => G.SETS[f].reduce((s, _, i) => s + factor(i), 0) / G.SETS[f].length, close = (f, v) => Math.abs(r[f].reading.gain.mean - v * mf(f)) < 1e-9;
    ok("!! four arms, each once; the gain is THE SPLIT LESS THE FLY pair by pair (+0.1, -0.1); a trail in fleets keeps the fly", calls.length === 4 && new Set(calls).size === 4 && close("oneCannon", 0.1) && close("fleetCannon", -0.1) && r.oneCannon.reading.gain.n === 1200 && !r.verdict.split && r.verdict.helm === "flywired");
    const d = (one, fleet) => G.decide({ oneCannon: { reading: { gain: { z: one } } }, fleetCannon: { reading: { gain: { z: fleet } } } });
    ok("!! WHAT IS DECIDED: the split if it LEADS one ship a side (exactly 2 leads, 1.99 does not) and does not TRAIL in fleets (exactly -2 trails, -1.99 does not)", d(2, 0).split && d(2, 0).helm === "split" && !d(1.99, 5).split && !d(5, -2).split && d(5, -1.99).split);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "splithelm-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    // @@FOUND@@
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
