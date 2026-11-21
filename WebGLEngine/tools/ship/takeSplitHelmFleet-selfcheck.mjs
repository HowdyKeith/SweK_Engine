// WebGLEngine/tools/ship/takeSplitHelmFleet-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeSplitHelmFleet-selfcheck.mjs      (seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE SPLIT HELM FOR THE FLEET BUTTON, HELD. tools/ship/takeSplitHelmFleet.mjs flies the split helm against the fly's helm in fleets of three with the cannon,
// under the fleet button's gunner, and decides the fleet button's helm. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1561001-1561300), disjoint from every other study of the fly-wired line; the jobs are takeFlyVsSine's fleet jobs (the
//                            45-degree gunner, the fleet button's), the split arm the sine with the cannon; the fleet button as it is
//   2  THE STUDY             against a stand-in: two arms, each once; the gain is the split less the fly; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights, and the page as decided
//
// @@READ@@
//
// SABOTAGE LOG: 8 mutants of tools/ship/takeSplitHelmFleet.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 8 RED the first time
//   (a seed moved, takeSplitHelm's pairs, the split always the fly, the gain's sign, a lead at exactly 2 let by, not trailing taken for leading, an unknown
//   option and a second read let through). No mutant flew into the real folders.
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
import * as G from "./takeSplitHelmFleet.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeSplitHelmFleet.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeSplitHelmFleet-selfcheck -- the split helm for the fleet button\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.SETS.fleetCannon, mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeSplitHelmFleet.mjs"])).flat();
    ok("!! one fight, fleets of three with the cannon, 1200 pairs (300 of each kind) on 1561001-1561300; none twice; none flown by another study of the line", G.FIGHTS.join() === "fleetCannon" && all.length === 1200 && D.KINDS.every((k) => all.filter((p) => p.kind === k).length === 300)
        && Math.min(...all.map((p) => p.seed)) === 1561001 && Math.max(...all.map((p) => p.seed)) === 1561300 && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 1200 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), L = [all[0]], j = (a) => JSON.stringify(G.jobsOf("fleetCannon", a, b, L));
    ok("!! THE JOBS ARE takeFlyVsSine's fleet jobs: three ships a side, the cannon on, the 45-degree fly-wired gunner (the fleet button's); the split arm is the sine twin", j("fly") === JSON.stringify(FV.jobsOf("fleetCannon", "fly", b, L)) && j("split") === JSON.stringify(FV.jobsOf("fleetCannon", "sine", b, L))
        && G.jobsOf("fleetCannon", "fly", b, L)[0].opts.ships === 3 && G.jobsOf("fleetCannon", "fly", b, L)[0].x.cannon && Math.abs(G.jobsOf("fleetCannon", "fly", b, L)[0].x.network.weights[4] - Math.PI / 4) < 1e-6 && G.jobsOf("fleetCannon", "split", b, L)[0].x.helmNet.wiring === "sine~odd");
    const fleet = C.presetOf("fleet");
    ok("!! THE BUTTON AS IT IS: the fleet button carries the fly-wired hand (the 45-degree gunner) under the fly's helm, or since this study's reading the split helm", fleet.choice.hand === "flywired" && ["flywired", "split"].includes(fleet.choice.helm) && fleet.choice.cannon === true);
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => (arm === "fly" ? 1 : 1.1) * factor(i)); }, () => {});
    const mf = G.SETS.fleetCannon.reduce((s, _, i) => s + factor(i), 0) / 1200;
    ok("!! two arms, each once; the gain is THE SPLIT LESS THE FLY pair by pair (+0.1); a lead takes the split", calls.join() === "fleetCannon/fly,fleetCannon/split" && Math.abs(r.fleetCannon.reading.gain.mean - 0.1 * mf) < 1e-9 && r.fleetCannon.reading.gain.n === 1200 && r.verdict.split && r.verdict.helm === "split");
    const d = (z) => G.decide({ fleetCannon: { reading: { gain: { z } } } });
    ok("!! WHAT IS DECIDED: the split if it LEADS (exactly 2 leads, 1.99 does not); a trail keeps the fly", d(2).split && !d(1.99).split && !d(-3).split && d(-3).helm === "flywired");
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "splitfleet-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
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
