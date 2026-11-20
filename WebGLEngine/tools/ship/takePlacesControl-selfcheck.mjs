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
// SABOTAGE LOG: 12 mutants of tools/ship/takePlacesControl.mjs, each a copy of the study with this gate (and the command rows) pointed at it: 12 red by name the first time -- the train pairs the gunner study's, the audit pairs the held-out ones, one scramble taken for the three, the scrambles summed and not averaged, P1 read against flat, P2 the medial's, P3's sign, every wiring flown at one gain, the gain chosen on the audit pairs, a second read allowed, --write taken, the gain that lays away flown again.
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
    const bad = run("--write", "--out", path.join(tmp, "bad.json"), "--kept", path.join(tmp, "kept-bad"))   /* everything the command could write goes to the scratch folder: a mutant that lets the option by must not fly into the real kept flights (2026-11-20) */, again = run("--out", out, "--kept", path.join(tmp, "kept"));
    ok("!! THE COMMAND SHIPS NOTHING (it has no --write: the option is refused as unknown) and refuses A SECOND READ OF THE AUDIT before it flies anything", bad.status === 2 && /unknown option --write/.test(bad.stderr) && again.status === 1 && /THE AUDIT HAS BEEN READ ONCE/.test(again.stderr) && !fs.existsSync(path.join(tmp, "kept")) && !fs.existsSync(path.join(tmp, "kept-bad")));
    fs.rmSync(tmp, { recursive: true, force: true });
});

console.log("2b. THE RIG'S STUDY (--study rig: four times the pairs and one more control)");
await section(async () => {
    const R = P.STUDIES.rig, mine = Object.values(R.sets).flat().map((p) => p.seed), first = Object.values(P.SETS).flat().map((p) => p.seed), gun = [...G.TRAIN_PAIRS, ...G.HELD_OUT_PAIRS, ...G.AUDIT_PAIRS].map((p) => p.seed);
    ok("!! two studies: `1` is the first registration unchanged; `rig` has 300 train pairs (71001-), 300 held-out (72001-) and 2,500 AUDIT pairs (seeds 73001-73625 of each kind) -- none flown by study 1 or by the gunner study -- nine wirings (the two orientations, the three scrambles, THREE unneighboured circuits, flat), the gains -3 and -1, a reading file and a kept directory of its own", Object.keys(P.STUDIES).join() === "1,rig" && P.STUDIES[1].sets === P.SETS && P.STUDIES[1].wirings === P.WIRINGS && P.STUDIES[1].unneighboured.length === 0 && R.sets.train.length === 300 && R.sets.heldOut.length === 300 && R.sets.audit.length === 2500 && R.sets.train[0].seed === 71001 && R.sets.heldOut[0].seed === 72001 && R.sets.audit[0].seed === 73001 && Math.max(...mine) === 73625 && mine.every((x) => !first.includes(x) && !gun.includes(x)) && R.wirings.join() === "fly:medial,fly:lateral,scrambled:4242,scrambled:1,scrambled:2,unneighboured:4242,unneighboured:1,unneighboured:2,flat" && R.gains.join() === "-3,-1" && R.wirings.every((w) => typeof FT.wiringOf(w).gunnerFactory === "function") && /flyTrackingPlacesControlRig\.reading\.json$/.test(R.reading) && /placesControlRig$/.test(R.kept) && R.reading !== P.READING);
    const worth = { "fly:medial": 0.8, "fly:lateral": 0.78, "scrambled:4242": 0.72, "scrambled:1": 0.7, "scrambled:2": 0.68, "unneighboured:4242": 0.79, "unneighboured:1": 0.77, "unneighboured:2": 0.75, flat: 0.66 }, calls = [];
    const res = await P.study(async (w, g, set) => { calls.push({ w, g, set }); return R.sets[set].map((_, i) => (worth[w] - (g + 3) ** 2 / 50) * factor(i)); }, () => {}, R), mf = R.sets.audit.reduce((a, _, i) => a + factor(i), 0) / 2500, close = (s, v) => Math.abs(s.mean - v * mf) < 1e-9;
    ok("!! flown as the rig's study: ITS wirings at ITS gains (18 train arms), 2,500 audit leads an arm; P1-P3 as before and TWO MORE -- N1 fly:medial less the UNNEIGHBOURED mean (0.80 - 0.77) and N2 the unneighboured mean less the scrambled mean (0.77 - 0.70); the result names its study", res.study === "rig" && calls.filter((c) => c.set === "train").length === 18 && calls.filter((c) => c.set === "audit").length === 9 && calls.every((c) => R.wirings.includes(c.w) && R.gains.includes(c.g)) && res.reading.P1.n === 2500 && close(res.reading.P1, 0.10) && close(res.reading.P3, 0.04) && close(res.reading.N1, 0.03) && close(res.reading.N2, 0.07) && close(res.reading.unneighboured, 0.77) && close(res.reading.scrambled, 0.70) && res.words.N1 === "LEADS");
    const one = await P.study(standIn([]), () => {});
    ok("and study 1 has no N1 or N2 (it flew no unneighboured circuit) and names itself", one.study === "1" && !("N1" in one.reading) && !("N2" in one.reading) && !("unneighboured" in one.reading));
    const bad = spawnSync("node", [CMD, "--study", "big"], { encoding: "utf8", timeout: 180000 });
    ok("the command refuses a study it does not have, by name", bad.status === 2 && /--study is 1 or rig \(got big\)/.test(bad.stderr));
});

console.log("3. WHAT WAS FOUND");
await section(() => {
    if (!fs.existsSync(P.READING)) { console.log("  ----  the study has not been flown here yet: no kept reading to pin"); return; }
    const rd = JSON.parse(fs.readFileSync(P.READING, "utf8")), kept = (w) => JSON.parse(fs.readFileSync(path.join(P.KEPT_DIR, P.keptName(w, rd.chosen[w].gain, "audit")), "utf8")).leads, a = Object.fromEntries(P.WIRINGS.map((w) => [w, kept(w)])), re = P.readings(a).reading, near = (s, v) => Math.abs(s.mean - v) < 5e-4, diff = (x, y) => { const d = x.map((v, i) => v - y[i]), m = d.reduce((p, q) => p + q, 0) / d.length, se = Math.sqrt(d.reduce((p, q) => p + (q - m) ** 2, 0) / (d.length - 1) / d.length); return { mean: m, z: m / se }; };
    ok("!! AS KEPT AND RE-DERIVED FROM THE KEPT FLIGHTS -- NEITHER PART CAN BE TOLD: the fly's own places less the scrambled ones read +0.051 (medial, z 1.7) and +0.043 (lateral, z 1.4); the scrambled less no places at all reads +0.027 (z 0.9). All six wirings lead the hand gunner by 0.74 to 0.82", near(rd.reading.P1, 0.051) && near(rd.reading.P2, 0.043) && near(rd.reading.P3, 0.027) && ["P1", "P2", "P3"].every((k) => rd.words[k] === "CANNOT BE TOLD" && rd.reading[k].mean > 0 && rd.reading[k].z < 2) && P.WIRINGS.every((w) => rd.reading[w].mean > 0.73 && rd.reading[w].mean < 0.83 && rd.words[w] === "LEADS") && ["P1", "P2", "P3", "scrambled", ...P.WIRINGS].every((k) => Math.abs(re[k].mean - rd.reading[k].mean) < 1e-12) && fs.readdirSync(P.KEPT_DIR).length === 30);
    const mf = diff(a["fly:medial"], a.flat), lf = diff(a["fly:lateral"], a.flat), ml = diff(a["fly:medial"], a["fly:lateral"]);
    ok("!! NOT REGISTERED, DERIVED FROM THE SAME KEPT FLIGHTS, SAID AS SUCH: the earlier study's `places are worth +0.101` shows again here as medial less flat +0.078 (z 2.1) and lateral less flat +0.070 (z 1.95) -- a second set of pairs agreeing on its size -- and the two orientations are again the same (+0.008). So about 0.08 separates the fly's places from none, and 600 pairs cannot say how much of it is the fly's OWN places (about 0.05) and how much is having places at all (about 0.03): each half is under two standard errors", Math.abs(mf.mean - 0.078) < 5e-4 && mf.z > 2 && mf.z < 2.3 && Math.abs(lf.mean - 0.070) < 5e-4 && lf.z > 1.8 && lf.z < 2 && Math.abs(ml.mean - 0.008) < 5e-4 && Math.abs(ml.z) < 1 && Math.abs(rd.reading.P1.mean + rd.reading.P3.mean - mf.mean) < 1e-9);
    ok("the scrambles differ among themselves no more than they differ from the fly's (+0.746 to +0.793 against the hand gunner), and two of the three, like flat, do best at the WEAKEST gain where the fly's two do best at the middle one", rd.reading["scrambled:1"].mean < rd.reading["scrambled:2"].mean && rd.chosen["scrambled:4242"].gain === -1 && rd.chosen["scrambled:2"].gain === -1 && rd.chosen["scrambled:1"].gain === -3 && rd.chosen.flat.gain === -1 && rd.chosen["fly:medial"].gain === -3 && rd.chosen["fly:lateral"].gain === -3);
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
