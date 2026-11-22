// WebGLEngine/tools/ship/takeFleetHandSizes-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeFleetHandSizes-selfcheck.mjs      (seconds; the study is flown here by a stand-in; section 3 reads the kept flights once they exist)
//
// THE FLEET BUTTON'S GUNNER IN FLEETS OF TWO AND FOUR, HELD. tools/ship/takeFleetHandSizes.mjs flies the fly-wired gunner against car-today and its sine twin in fleets of
// two and four with the cannon and decides whether the fleet hand stays. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pairs (1661001-, 1671001-), disjoint from every other study of the fly-wired line; the jobs are takeFlyVsSine's fleet jobs under the
//                            split helm at two and four ships, only the gunner changing; the buttons as they are
//   2  THE STUDY             against a stand-in: six arms, each once; the differences pair by pair; what is decided; the command's refusals
//   3  WHAT WAS FOUND        once flown: the kept reading, and the page as decided
//
// READ 2026-11-22 (brain/fleetHandSizes.reading.json; the kept arms in brain/rig-results/fleetHandSizes/): THE FLEET HAND STAYS. The fly-wired gunner less car-today: fleets of
//   two +0.078 (z 3.55, LEADS), fleets of four +0.152 (z 9.53, LEADS) -- as forecast, and the lead GROWS with the fleet; against its own sine twin +0.002 (z 1.38) and +0.001
//   (z 1.97), cannot be told, as in fleets of three: what the button's gunner needs from the circuit is that it swings the gun the right way. The fleet note says so.
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as C from "../../render/spaceDuelCore.mjs";
import * as PT from "./pairsTaken.mjs";
import * as FV from "./takeFlyVsSine.mjs";
import * as G from "./takeFleetHandSizes.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takeFleetHandSizes.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;

console.log("takeFleetHandSizes-selfcheck -- the fleet button's gunner in fleets of two and four\n");

console.log("1. WHAT WAS REGISTERED");
await section(async () => {
    const all = G.FIGHTS.flatMap((f) => G.SETS[f]), mine = new Set(all.map((p) => p.seed)), others = Object.values(await PT.taken(["takeFleetHandSizes.mjs"])).flat();
    ok("!! two fights, fleets of two and four, 600 pairs each (150 of each kind) on 1661001-1661150 and 1671001-1671150; none twice; none flown by another study of the line", G.FIGHTS.join() === "fleet2,fleet4" && G.SHIPS.fleet2 === 2 && G.SHIPS.fleet4 === 4
        && G.FIGHTS.every((f, i) => G.SETS[f].length === 600 && D.KINDS.every((k) => G.SETS[f].filter((p) => p.kind === k).length === 150) && Math.min(...G.SETS[f].map((p) => p.seed)) === 1661001 + 10000 * i && Math.max(...G.SETS[f].map((p) => p.seed)) === 1661150 + 10000 * i)
        && new Set(all.map((p) => `${p.kind}:${p.seed}`)).size === 1200 && others.length > 30000 && others.every((x) => !mine.has(x)), `${others.length} others`);
    const b = G.brainsOf(), L = [G.SETS.fleet2[0]], strip = (j) => JSON.stringify({ ...j, x: { ...j.x, network: null }, opts: { ...j.opts, ships: 0 } }), base = strip(FV.jobsOf("fleetCannon", "sine", b, L)[0]);
    ok("!! THE JOBS are takeFlyVsSine's fleet jobs under the split helm (the sine twin with the cannon) with only the fleet size and the gunner changed: the button's 45-degree file, car-today, the same file over a sine", G.FIGHTS.every((f) => G.ARMS.every((a) => strip(G.jobsOf(f, a, b, L)[0]) === base))
        && G.jobsOf("fleet2", "fly", b, L)[0].opts.ships === 2 && G.jobsOf("fleet4", "fly", b, L)[0].opts.ships === 4 && G.jobsOf("fleet2", "fly", b, L)[0].x.helmNet.wiring === "sine~odd" && G.jobsOf("fleet2", "fly", b, L)[0].x.cannon
        && Math.abs(G.jobsOf("fleet2", "fly", b, L)[0].x.network.weights[4] - Math.PI / 4) < 1e-6 && G.jobsOf("fleet2", "fly", b, L)[0].x.network.wiring === undefined && G.jobsOf("fleet2", "sine", b, L)[0].x.network.wiring === "sine" && G.jobsOf("fleet2", "today", b, L)[0].x.network.policy === "gunnerPolicy");
    let threw = false; try { G.jobsOf("fleet2", "hand", b, L); } catch { threw = true; }
    ok("!! an arm that is not registered is refused", threw);
    ok("!! THE BUTTONS AS THEY ARE: the fleet button carries the fly-wired hand and the by-size hand's fleet pick is the fly-wired gunner (or, after this study, both car-today)", (C.presetOf("fleet").choice.hand === "flywired" && C.HANDS.find((h) => h.id === "bysize").bySize.fleet === "flywired") || (C.presetOf("fleet").choice.hand === "bysize" && C.HANDS.find((h) => h.id === "bysize").bySize.fleet === "car-today"));
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const W = { fly: 1, today: 1.1, sine: 1 }, calls = [], r = await G.study(async (f, arm) => { calls.push(f + "/" + arm); return G.SETS[f].map((_, i) => (f === "fleet4" && arm === "today" ? 0.9 : W[arm]) * factor(i)); }, () => {});
    const mf = G.SETS.fleet2.reduce((s, _, i) => s + factor(i), 0) / 600, close = (f, k, v) => Math.abs(r[f].reading[k].mean - v * mf) < 1e-9;
    ok("!! six arms, each once; the differences are pair by pair: the fly less car-today -0.1 in fleets of two, +0.1 in fours; less its sine twin 0", calls.length === 6 && new Set(calls).size === 6 && close("fleet2", "overToday", -0.1) && close("fleet4", "overToday", 0.1) && close("fleet2", "overSine", 0));
    ok("!! ...and a lead at one size with a TRAIL at the other changes nothing", !r.verdict.change && r.verdict.fleetHand === "flywired");
    const d = (a, b) => G.decide({ fleet2: { reading: { overToday: { z: a } } }, fleet4: { reading: { overToday: { z: b } } } });
    ok("!! WHAT IS DECIDED: car-today takes the fleet only if it LEADS at a size (exactly -2 leads, -1.99 does not) and trails at neither (exactly 2 is a trail)", d(-2, 0).change && d(-2, 0).fleetHand === "car-today" && d(0, -5).change && !d(-1.99, -1.99).change && !d(-3, 2).change && d(-3, 1.99).change && !d(5, 5).change);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fleethand-")), rf = path.join(tmp, "r.reading.json"); fs.writeFileSync(rf, "{}");
    const bad = run("--speed", "1", "--reading", path.join(tmp, "bad.reading.json"), "--kept", path.join(tmp, "kept-bad")), again = run("--reading", rf, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND REFUSES an option it does not know and A SECOND READ before it flies anything", bad.status === 2 && /unknown option --speed/.test(bad.stderr) && again.status === 1 && /HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(G.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const r = JSON.parse(fs.readFileSync(G.READING, "utf8")), near = (a, b) => Math.abs(a - b) < 5e-4, R = (f, k) => r[f].reading[k];
    ok("!! THE KEPT READING IS THE ONE PINNED: the fly-wired gunner leads car-today by +0.078 (z 3.55) in fleets of two and +0.152 (z 9.53) in fours, and cannot be told from its sine twin (+0.002, +0.001)", near(R("fleet2", "overToday").mean, 0.07779) && near(R("fleet2", "overToday").z, 3.5467) && near(R("fleet4", "overToday").mean, 0.1519) && near(R("fleet4", "overToday").z, 9.5345) && Math.abs(R("fleet2", "overSine").z) < 2 && Math.abs(R("fleet4", "overSine").z) < 2);
    ok("!! ...and what it decided is what the page does: no change -- the fleet button carries the fly-wired hand and the by-size hand's fleet pick is the fly-wired gunner; the fleet note gives both sizes", r.verdict.change === false && r.verdict.fleetHand === "flywired" && C.presetOf("fleet").choice.hand === "flywired" && C.HANDS.find((h) => h.id === "bysize").bySize.fleet === "flywired" && /takeFleetHandSizes/.test(C.presetOf("fleet").note));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 10 mutants of tools/ship/takeFleetHandSizes.mjs, each in a hard-linked copy of the tree, before any pair was flown: ALL 10 RED the first time (a seed
// moved, fleets of three for four, car-today flown as the fly-wired gunner, the sine twin unwired, the fly's helm for the split, the difference's sign, a lead at exactly
// -2 missed, a trail at the other size ignored, an unknown option and a second read let through). No mutant flew into the real folders.
