// WebGLEngine/tools/ship/takePlacesControl-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takePlacesControl-selfcheck.mjs      (a few seconds; the study here is flown by a stand-in; section 3 reads the kept flights once they exist)
//
// THE PLACES CONTROL'S STUDY, HELD. tools/ship/takePlacesControl.mjs sets the fly-wired gunner with each cell at ITS place against the same circuit with the cells' places scrambled (three scrambles) and against the circuit with no places. Three things hold it:
//
//   1  WHAT WAS REGISTERED   the pair sets (61001-, 62001-, 63001-), disjoint from each other and from every other study's and search's; six wirings (two orientations, three scrambles, flat), three gains, all laying toward the target; the jobs, the choosing and the kept names are the gunner study's own
//   2  THE STUDY             against a stand-in: 18 train arms, each wiring's own gain after; THE SCRAMBLED lead of a pair is the MEAN of the three scrambles' leads on it; P1 and P2 are each orientation less it, P3 is it less flat; nothing ships
//   3  WHAT WAS FOUND        once flown: the kept reading, re-derived from the kept flights
//
// SABOTAGE LOG: @@LOG@@
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as P from "./takePlacesControl.mjs";
import * as G from "./takeFlyWiredGunner.mjs";
import * as FH from "./takeFlyWiredHelm.mjs";
import * as HT from "./trainHelmSteer.mjs";
import * as TT from "./trainTrackSeat.mjs";
import * as FT from "../../brain/flyTracking.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const CMD = fileURLToPath(new URL("./takePlacesControl.mjs", import.meta.url)), factor = (i) => 0.5 + (i % 11) / 10;
// THE STAND-IN: the two orientations are worth 0.80 and 0.76 at their best gain (-3), the three scrambles 0.72, 0.66 and 0.60 (best at -3, -3 and -1), flat 0.60 (-1); a gain off its best costs (gain - best)^2 / 50.
const BEST = { "fly:medial": [0.8, -3], "fly:lateral": [0.76, -3], "scrambled:4242": [0.72, -3], "scrambled:1": [0.66, -3], "scrambled:2": [0.6, -1], flat: [0.6, -1] };
const standIn = (calls) => async (w, g, set) => { calls.push({ w, g, set }); return P.SETS[set].map((_, i) => (BEST[w][0] - (g - BEST[w][1]) ** 2 / 50) * factor(i)); };

console.log("takePlacesControl-selfcheck -- the control that scrambles the cells' places\n");

console.log("1. WHAT WAS REGISTERED");
await section(() => {
    const mine = Object.values(P.SETS).flat().map((p) => p.seed), others = [...G.TRAIN_PAIRS, ...G.HELD_OUT_PAIRS, ...G.AUDIT_PAIRS, ...Object.values(FH.STUDIES).flatMap((s) => Object.values(s.sets).flat()), ...Object.values(HT.CIRCUITS).flatMap((c) => [...c.train, ...c.heldOut, ...c.audit]), ...TT.TRAIN_PAIRS, ...TT.HELD_OUT_PAIRS, ...TT.AUDIT_PAIRS].map((p) => p.seed);
    ok("!! 300 train pairs (seeds 61001-61075 of each kind), 300 held-out (62001-62075), 600 audit (63001-63150): no seed in two sets and none a seed the gunner study, the helm studies or any search flew", P.SETS.train.length === 300 && P.SETS.heldOut.length === 300 && P.SETS.audit.length === 600 && P.SETS.train[0].seed === 61001 && P.SETS.heldOut[0].seed === 62001 && P.SETS.audit[0].seed === 63001 && new Set(mine).size === 300 && Math.max(...mine) === 63150 && others.every((s) => !mine.includes(s)));
    ok("six wirings -- the two orientations, THREE scrambles (seeds 4242, 1, 2) and flat -- at three gains, all laying toward the target; every wiring is one brain/flyTracking.mjs knows; the jobs, the choosing and the kept names are the gunner study's own functions", P.WIRINGS.join() === "fly:medial,fly:lateral,scrambled:4242,scrambled:1,scrambled:2,flat" && P.SCRAMBLES.join() === "scrambled:4242,scrambled:1,scrambled:2" && P.GAINS.join() === "-8,-3,-1" && P.WIRINGS.every((w) => typeof FT.wiringOf(w).gunnerFactory === "function") && P.jobsOf === G.jobsOf && P.choose === G.choose && P.keptName === G.keptName && P.keptName("scrambled:1", -3, "audit") === "scrambled-1_g-3_audit.json");
});

console.log("2. THE STUDY (flown by a stand-in)");
await section(async () => {
    const calls = [], res = await P.study(standIn(calls), () => {}), tr = calls.filter((c) => c.set === "train"), ho = calls.filter((c) => c.set === "heldOut"), au = calls.filter((c) => c.set === "audit"), mf = P.SETS.audit.reduce((a, _, i) => a + factor(i), 0) / 600, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! each wiring gets ITS best gain from all three on the train pairs (18 arms, each once), and only that gain is flown on the held-out and the audit pairs (six arms each), train before held-out before audit", ["fly:medial", "fly:lateral", "scrambled:4242", "scrambled:1"].every((w) => res.chosen[w].gain === -3) && res.chosen["scrambled:2"].gain === -1 && res.chosen.flat.gain === -1 && tr.length === 18 && P.WIRINGS.every((w) => P.GAINS.every((g) => tr.filter((c) => c.w === w && c.g === g).length === 1)) && ho.length === 6 && au.length === 6 && [ho, au].every((l) => l.every((c) => c.g === res.chosen[c.w].gain)) && calls.findIndex((c) => c.set === "heldOut") === 18 && calls.findIndex((c) => c.set === "audit") === 24);
    ok("!! THE SCRAMBLED LEAD IS THE MEAN OF THE THREE SCRAMBLES' (0.72, 0.66, 0.60: 0.66), pair by pair; P1 is medial less it (0.80 - 0.66), P2 lateral less it (0.76 - 0.66), P3 it less flat (0.66 - 0.60); each wiring's own lead is beside them", close(res.reading.scrambled, 0.66) && close(res.reading.P1, 0.14) && close(res.reading.P2, 0.10) && close(res.reading.P3, 0.06) && close(res.reading["scrambled:2"], 0.6) && close(res.reading.flat, 0.6) && close(res.reading["fly:medial"], 0.8) && res.reading.P1.n === 600 && res.words.P1 === "LEADS" && res.words.P3 === "LEADS" && !("verdict" in res));
    const sc = P.scrambledOf([[1, 2, 3], [3, 2, 1], [2, 5, -1]]), r = P.readings({ "fly:medial": [3, 3, 3], "fly:lateral": [2, 3, 1], "scrambled:4242": [1, 2, 3], "scrambled:1": [3, 2, 1], "scrambled:2": [2, 5, -1], flat: [0, 0, 0] });
    ok("scrambledOf() and readings() alone: the mean over the scrambles pair by pair ([2, 3, 1]), P1 = [1, 0, 2] (mean 1), P2 = [0, 0, 0] (CANNOT BE TOLD), P3 = [2, 3, 1] (mean 2)", sc.join() === "2,3,1" && r.reading.P1.mean === 1 && r.reading.P2.mean === 0 && r.words.P2 === "CANNOT BE TOLD" && r.reading.P3.mean === 2);
    const run = (...x) => spawnSync("node", [CMD, ...x], { encoding: "utf8", timeout: 180000 }), tmp = fs.mkdtempSync(path.join(os.tmpdir(), "places-")), out = path.join(tmp, "r.json"); fs.writeFileSync(out, "{}");
    const bad = run("--write"), again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND SHIPS NOTHING (it has no --write: the option is refused as unknown) and refuses A SECOND READ OF THE AUDIT before it flies anything", bad.status === 2 && /unknown option --write/.test(bad.stderr) && again.status === 1 && /THE AUDIT HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(P.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    /*@@FOUND@@*/
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
