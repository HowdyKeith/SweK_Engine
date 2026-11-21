// WebGLEngine/tools/ship/takeSplitHelmSizes-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSplitHelmSizes-selfcheck.mjs      (seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SPLIT HELM IN FLEETS OF TWO AND FOUR, HELD. tools/ship/takeSplitHelmSizes.mjs flies the split helm against the fly's helm in fleets of two and four with the
// cannon and decides whether both buttons keep it. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1621001-, 1631001-), disjoint from every other study of the fly-wired line; the jobs are takeFlyVsSine's fleet jobs at two
//                            and four ships; both buttons as they are
//   2  THE STUDY             against a stand-in: four arms, each once; the gain is the split less the fly; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights, and the page as decided
//
// READ 2026-11-21 (brain/splitHelmSizes.reading.json; the kept arms in brain/rig-results/splitHelmSizes/): BOTH BUTTONS KEEP THE SPLIT HELM. The split less the
//   fly's helm: fleets of two -0.008 (z -0.45, cannot be told), fleets of four -0.008 (z -0.80, cannot be told). It trails at neither size. The forecast's small
//   lead did not come: at two and four a side the split and the fly's helm cannot be told apart (both +1.68 to +1.79 over the plain ship); the lead it showed
//   in fleets of three (+0.031, z 3.68) is not one that grows or holds across sizes.
//
// SABOTAGE LOG: 8 mutants of tools/ship/takeSplitHelmSizes.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 8 RED the first time
//   (a seed moved, fleets of three for two, the split always the fly, the gain's sign, a trail at exactly -2 let by, a lead demanded; an unknown option and a
//   second read let through). No mutant flew into the real folders.
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
import * as G from "./takeSplitHelmSizes.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeSplitHelmSizes.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeSplitHelmSizes-selfcheck -- the split helm in fleets of two and four\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeSplitHelmSizes.mjs"])).flat();
    ok("!! two fights, fleets of two and four, 600 pairs each (150 of each kind) on 1621001-1621150 and 1631001-1631150; none twice; none flown by another study of the line", G.FIGHTS.join() === "fleet2,fleet4" && G.SHIPS.fleet2 === 2 && G.SHIPS.fleet4 === 4
        && G.FIGHTS.every((f, i) => G.SETS[f].length === 600 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 150) && Math.min(...G.SETS[f].map((p) => p.seed)) === 1621001 + 10000 * i && Math.max(...G.SETS[f].map((p) => p.seed)) === 1621150 + 10000 * i)
        && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 1200 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), L = [G.SETS.fleet2[0]], strip = (j) => JSON.stringify({ ...j, opts: { ...j.opts, ships: 0 } });
    ok("!! THE JOBS are takeFlyVsSine's fleet jobs (the cannon on, the 45-degree gunner) with only the fleet size changed: two and four ships; the split arm the sine twin", G.FIGHTS.every((f) => G.ARMS.every((a) => strip(G.jobsOf(f, a, b, L)[0]) === strip(FV.jobsOf("fleetCannon", a === "split" ? "sine" : "fly", b, L)[0])))
        && G.jobsOf("fleet2", "fly", b, L)[0].opts.ships === 2 && G.jobsOf("fleet4", "split", b, L)[0].opts.ships === 4 && G.jobsOf("fleet4", "split", b, L)[0].x.helmNet.wiring === "sine~odd" && G.jobsOf("fleet2", "fly", b, L)[0].x.cannon && Math.abs(G.jobsOf("fleet2", "fly", b, L)[0].x.network.weights[4] - Math.PI / 4) < 1e-6);
    ok("!! THE BUTTONS AS THEY ARE: both carry the split helm (or, after this study, the fly's again)", ["split", "flywired"].includes(C.presetOf("best").choice.helm) && ["split", "flywired"].includes(C.presetOf("fleet").choice.helm) && C.presetOf("best").choice.helm === C.presetOf("fleet").choice.helm);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fleet2: [1, 1.1], fleet4: [1, 0.9] }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => W[f][arm === "fly" ? 0 : 1] * factor(i)); }, () => {});
    const mf = G.SETS.fleet2.reduce((s, _, i) => s + factor(i), 0) / 600, close = (f, v) => Math.abs(r[f].reading.gain.mean - v * mf) < 1e-9;
    ok("!! four arms, each once; the gain is THE SPLIT LESS THE FLY pair by pair (+0.1, -0.1); a trail at one size sends both buttons back to the fly", calls.length === 4 && new Set(calls).size === 4 && close("fleet2", 0.1) && close("fleet4", -0.1) && !r.verdict.keep && r.verdict.helm === "flywired" && r.verdict.trails.join() === "fleet4");
    const d = (a, b) => G.decide({ fleet2: { reading: { gain: { z: a } } }, fleet4: { reading: { gain: { z: b } } } });
    ok("!! WHAT IS DECIDED: keep unless it TRAILS at either size (exactly -2 trails, -1.99 does not); no lead is needed", d(0, 0).keep && d(-1.99, -1.99).keep && !d(-2, 5).keep && !d(5, -2).keep && d(9, 9).helm === "split");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "splitsizes-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const r = JSON.parse(fs.readFileSync(G.READING, "utf8"));
    const near = (a, b) => Math.abs(a - b) < 5e-4;
    ok("!! THE KEPT READING IS THE ONE PINNED: the split less the fly's helm -0.008 (z -0.45) in fleets of two and -0.008 (z -0.80) in fleets of four, neither told; both arms lead the plain ship", near(r.fleet2.reading.gain.mean, -0.00805) && near(r.fleet2.reading.gain.z, -0.4466) && near(r.fleet4.reading.gain.mean, -0.00776) && near(r.fleet4.reading.gain.z, -0.8042) && ["fleet2", "fleet4"].every((f) => r[f].reading.fly.z > 2 && r[f].reading.split.z > 2));
    ok("!! ...and what it decided is what the page does: the split is kept, trailing nowhere, and both the best-ship and fleet presets carry helm \"split\"", r.verdict.keep === true && r.verdict.trails.length === 0 && C.PRESETS.find((p) => p.id === "best").choice.helm === "split" && C.PRESETS.find((p) => p.id === "fleet").choice.helm === "split");
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
