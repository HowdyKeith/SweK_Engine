// WebGLEngine/tools/ship/takeRighting-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/takeRighting-selfcheck.mjs      (about 15 s: the 26 pilots are rebuilt from their records, two are re-flown on their first audits, and DEV runs are pinned line by line)
//
// THE GATE OF tools/ship/takeRighting.mjs (the registration is brain/FISH_RIGHTING_WIP.md, with Amendments A, B and C; the library is brain/subRighting.mjs, gated by its own):
//   1 CONSTANTS   the sets, the signs, the 8 + 16 record names, the files; the first-order orientation step is the default once the command is imported
//   2 THE ARMS    loadArms: 26 in the registered order, the families, a fresh pilot a call, and the refusals (a fish file of the wrong size or with a bad weight, a missing record, a record whose weights do not fit the rebuilt pilot)
//   3 REBUILD     rebuildCheck: nothing to rebuild for the autopilot and FISH803; two real pilots (a circuit and a plain net) reproduce their recorded first-audit scores (under the first-order step: to 1e-6); the tolerance is honoured
//   4 THE FLIGHTS runArms: arm-major, dive, sign +1 then -1; every field; fresh pilots, so the same arm twice gives the same rows; one autopilot kick pinned to the digit
//   5 THE READINGS readingsOf on synthetic rows: by family, in order, the lost count, the gains, the versus, the bottom line; reportLines to the character
//   6 THE COMMAND arguments and refusals; a DEV run on two dives, every line pinned; a stubbed registered run (the checks, --write and its rows, a failing rebuild shown as NOT WEIGHED); the command run as a program, with and without arguments
//   7 THE SOURCE  no clock, no random number; the first import is the first-order step; the headers
// NOT CHECKED, said plainly: that the 24 trained pilots' records are right (the registration says they were fitted on other sets), and the registered result (that is the experiment).
//
// SABOTAGES (2026-11-07; isolated trees, sha256 of the four files checked before and after every chain, identical):
//   PASS 1, the gate as first written: 151 line mutants of tools/ship/takeRighting.mjs and 15 hand mutants (the autopilot arm made the fish pilot, the rebuild check reading the second audit's score or flying the second audit, the circuits rebuilt with the plain-net policy, the kicked flight flown with no kick, the base
//     flight by another pilot, REAL reading the plain pilots, the versus families swapped, the lost count of the autopilot only, the registered set made the DEV set, the dives of the recovery kind, the first-order import removed, the plain nets from one cell, a rebuild miss ignored, the written rows carrying the wrong set):
//     111 red and 26 crashes and 14 alive of the line mutants; the hand mutants 14 red and 1 crash (the circuits rebuilt with the plain-net policy: the wrong weight count throws).
//   WHAT THE SURVIVORS SHOWED (each is a row now): a later record of the same spec with no weights must not replace the one that has them; a fish file that is `{}` or `null` must be refused with the NAMED message (not by a TypeError); the rebuild check's difference is ABSOLUTE (a pilot that scores BELOW its record
//     must miss) and its tolerance inclusive; a gain or a difference of exactly zero prints with a plus sign; and the runner-against-subTask.fly check was inline and could not be made to fail, so it is now `sameFlight` and `runnerFailures` (the first CHECK_DIVES = 4 dives, no others, any one of score, fingerprint and status).
//   PASS 2: the 7 survivors of those kinds and the 9 mutants of the lines that were changed: 15 red, 1 crash, none alive; the 15 hand mutants again: 14 red, 1 crash.
//   EQUIVALENT, argued (2): the "26" of the JSDoc above loadArms, up and down by one (a number in a comment).
"use strict";
import fs from "node:fs";
import * as X from "./takeRighting.mjs";
import * as O from "../../physics/mechanics/rigidBody6dof.mjs";
import * as S from "../../physics/mechanics/subModel6dof.mjs";
import * as T from "../../brain/subTask.mjs";
import * as AS from "../../brain/autopilotSub.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const J = JSON.stringify;
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
const slash = (f) => String(f).replace(/\\/g, "/");

console.log("1. CONSTANTS");
{
    ok("!! the sets: DEV is nominal dives 1 to 4, the registered set 190001 to 190048 (48); the signs +1 then -1; all frozen", J(X.SETS) === '{"dev":{"first":1,"count":4},"registered":{"first":190001,"count":48}}' && J(X.SIGNS) === "[1,-1]" && Object.isFrozen(X.SETS) && Object.isFrozen(X.SETS.dev) && Object.isFrozen(X.SETS.registered) && Object.isFrozen(X.SIGNS));
    ok("!! the records: 8 REAL circuits (P/B and P/whole, qns 0 to 3) and 16 plain nets (P/B and P/whole, mn 0 to 7), in that order, frozen", J(X.REAL_SPECS) === '["P/B/qns:0","P/B/qns:1","P/B/qns:2","P/B/qns:3","P/whole/qns:0","P/whole/qns:1","P/whole/qns:2","P/whole/qns:3"]' && J(X.PLAIN_SPECS) === J(["B", "whole"].flatMap((a) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `P/${a}/mn:${i}`))) && X.PLAIN_SPECS.length === 16 && Object.isFrozen(X.REAL_SPECS) && Object.isFrozen(X.PLAIN_SPECS));
    ok("the files: the records are in brain/rig-results, the fish champion is brain/pilotSubWeightsFishWip.json, the output is brain/subRightingRegistered.jsonl", slash(X.RIG_DIR).endsWith("brain/rig-results") && slash(X.FISH_FILE).endsWith("brain/pilotSubWeightsFishWip.json") && X.OUT_FILE === "brain/subRightingRegistered.jsonl");
    ok("!! importing the command sets the 6-DOF orientation step to the first-order one the records were measured under (Amendment C), for this process and the ones it starts", O.orientationDefault() === "euler" && process.env.SWEK_6DOF_ORIENTATION === "euler");
}

console.log("\n2. THE ARMS");
const arms = X.loadArms();
{
    ok("!! 26 arms in the registered order: the autopilot, FISH803, the 8 REAL circuits, the 16 plain nets; the families auto, fish, real, plain", arms.length === 26 && arms[0].id === "autopilot" && arms[0].family === "auto" && arms[1].id === "fish803" && arms[1].family === "fish" && J(arms.slice(2, 10).map((a) => a.id)) === J(X.REAL_SPECS) && J(arms.slice(10).map((a) => a.id)) === J(X.PLAIN_SPECS) && arms.slice(2, 10).every((a) => a.family === "real") && arms.slice(10).every((a) => a.family === "plain"));
    ok("!! the first two have nothing to rebuild; the other 24 carry a rebuild (policy, weights, a first-audit set, the recorded score)", arms[0].rebuild === null && arms[1].rebuild === null && arms.slice(2).every((a) => a.rebuild && a.rebuild.policy && a.rebuild.weights.length > 500 && typeof a.rebuild.set === "function" && Number.isFinite(a.rebuild.recorded)));
    const sc = T.scenario(1, "nominal"), model = S.createSubModel(), st = S.createState({ ...sc.start, model });
    ok("!! a call to build() is a FRESH pilot (two calls are not the same function) and each is a pilot: it takes (state, target, current) and returns four finite controls clamped to [-1, 1] -- the autopilot, FISH803, a circuit and a plain net", arms[1].build() !== arms[1].build() && [arms[0], arms[1], arms[2], arms[10]].every((a) => { const r = a.build()(st, sc.target, [0, 0, 0]); return ["pitch", "yaw", "thrust", "ballast"].every((k) => Number.isFinite(r[k]) && Math.abs(r[k]) <= 1); }));
    const real = (f) => fs.readFileSync(f, "utf8"), fishFile = JSON.parse(fs.readFileSync(X.FISH_FILE, "utf8"));
    const withFish = (txt) => (f) => (f === X.FISH_FILE ? txt : real(f));
    ok("!! a fish file of the wrong size, one with a weight that is not a number, and one that is not a champion at all are refused, naming the file and the size", /pilotSubWeightsFishWip/.test(thr(() => X.loadArms({ readFile: withFish(J({ ...fishFile, weights: fishFile.weights.slice(1) })) }))) && /803 finite weights/.test(thr(() => X.loadArms({ readFile: withFish(J({ ...fishFile, weights: fishFile.weights.slice(1) })) }))) && thr(() => X.loadArms({ readFile: withFish(J({ ...fishFile, weights: fishFile.weights.map((w, i) => (i === 5 ? null : w)) })) })) !== "" && /not a fish champion of 803 finite weights/.test(thr(() => X.loadArms({ readFile: withFish("{}") }))) && /not a fish champion of 803 finite weights/.test(thr(() => X.loadArms({ readFile: withFish("null") }))));
    const strip = (spec) => (f) => (slash(f).endsWith("plainNetStudy.jsonl") ? real(f).trim().split("\n").filter((l) => JSON.parse(l).spec !== spec).join("\n") : real(f));
    const shorten = (spec) => (f) => (slash(f).endsWith("plainNetStudy.jsonl") ? real(f).trim().split("\n").map((l) => { const r = JSON.parse(l); if (r.spec === spec && r.weights) r.weights = r.weights.slice(1); return J(r); }).join("\n") : real(f));
    const dup = (f) => (slash(f).endsWith("plainNetStudy.jsonl") ? real(f).trim() + "\n" + J({ spec: "P/B/mn:0", task: "P", family: "mn" }) + "\n" + J({ spec: "P/B/mn:1", weights: null }) : real(f));
    ok("!! a later line with the same spec but NO weights (a pilot with no champion) does not replace the record that has them: the arms load and P/B/mn:0 keeps its weights", (() => { const a = X.loadArms({ readFile: dup }).find((x) => x.id === "P/B/mn:0"); return a && a.rebuild.weights.length === 589; })());
    ok("!! a record that is missing is refused naming it (P/whole/mn:3); a record whose weights do not fit the rebuilt pilot is refused naming it and both counts", /P\/whole\/mn:3 is not in the records/.test(thr(() => X.loadArms({ readFile: strip("P/whole/mn:3") }))) && /P\/B\/mn:0 has 588 weights in its record and 589 in the rebuilt pilot/.test(thr(() => X.loadArms({ readFile: shorten("P/B/mn:0") }))));
}

console.log("\n3. REBUILD");
{
    const at = (id) => arms.find((a) => a.id === id), c1 = X.rebuildCheck(at("P/B/qns:0")), c2 = X.rebuildCheck(at("P/whole/mn:7"));
    ok("!! nothing to rebuild for the autopilot and FISH803 (null); a circuit and a plain net rebuilt from their records fly their own first audit to the recorded score, within 1e-6 under the first-order step (the registered tolerance is 1e-4)", X.rebuildCheck(arms[0]) === null && X.rebuildCheck(arms[1]) === null && c1.ok === true && c1.id === "P/B/qns:0" && c1.diff < 1e-6 && c2.ok === true && c2.id === "P/whole/mn:7" && c2.diff < 1e-6, J([c1.diff, c2.diff]));
    const stubArm = (now, recorded) => ({ id: "s", rebuild: { policy: { evaluate: () => ({ score: now }) }, weights: [], set: () => [], recorded } });
    ok("!! the difference is ABSOLUTE and the tolerance inclusive: a rebuilt pilot that scores 0.2 BELOW its record misses by 0.2 (not -0.2), one that scores 0.2 above misses by 0.2, one exactly on the record passes a tolerance of 0, one a hair off does not", (() => { const lo = X.rebuildCheck(stubArm(-0.7, -0.5)), hi = X.rebuildCheck(stubArm(-0.3, -0.5)); return near(lo.diff, 0.2, 1e-12) && lo.ok === false && near(hi.diff, 0.2, 1e-12) && hi.ok === false && X.rebuildCheck(stubArm(-0.5, -0.5), 0).ok === true && X.rebuildCheck(stubArm(-0.5000001, -0.5), 0).ok === false && X.rebuildCheck(stubArm(-0.5002, -0.5), 1e-4).ok === false && X.rebuildCheck(stubArm(-0.50005, -0.5), 1e-4).ok === true; })());
    ok("the tolerance is honoured: a tolerance below the difference fails the check, a generous one passes it, and the difference is the same", X.rebuildCheck(at("P/B/qns:0"), -1).ok === false && X.rebuildCheck(at("P/B/qns:0"), 1).ok === true && X.rebuildCheck(at("P/B/qns:0"), -1).diff === c1.diff);
}

console.log("\n4. THE FLIGHTS");
{
    const stub = (id, family) => ({ id, family, build: () => AS.pilot() }), scs = [T.scenario(1, "nominal"), T.scenario(2, "nominal")];
    const rows = X.runArms([stub("a", "auto"), stub("b", "fish"), stub("c", "real")], scs);
    ok("!! 3 arms x 2 dives x 2 signs = 12 rows, arm-major then dive then sign (+1 first), every field present (arm, family, seed, sign, area, peak, tail, settle, lost)", rows.length === 12 && J(rows.map((r) => r.arm + r.seed + (r.sign > 0 ? "+" : "-"))) === J(["a1+", "a1-", "a2+", "a2-", "b1+", "b1-", "b2+", "b2-", "c1+", "c1-", "c2+", "c2-"]) && rows.every((r) => J(Object.keys(r)) === '["arm","family","seed","sign","area","peak","tail","settle","lost"]' && r.lost === false && Number.isFinite(r.area) && Number.isFinite(r.peak) && Number.isFinite(r.tail) && Number.isFinite(r.settle)) && rows[4].family === "fish" && rows[8].family === "real");
    ok("!! a FRESH pilot flies each flight: the same pilot in three arms gives the same rows to the digit, and the two signs give different areas", J(rows.slice(0, 4).map((r) => r.area)) === J(rows.slice(4, 8).map((r) => r.area)) && J(rows.slice(0, 4).map((r) => r.area)) === J(rows.slice(8).map((r) => r.area)) && rows[0].area !== rows[1].area);
    ok("!! the autopilot's kick on nominal dive 1, pinned to the digit: nose down (+1) area 0.46103341 peak 0.18208034 tail 1.52083232 settle 19 s; nose up (-1) area 0.39856612 settle 16.6333 s", near(rows[0].area, 0.46103341467187225, 1e-12) && near(rows[0].peak, 0.18208034233616838, 1e-12) && near(rows[0].tail, 1.5208323175410374, 1e-12) && near(rows[0].settle, 19, 1e-9) && near(rows[1].area, 0.39856611929499663, 1e-12) && near(rows[1].settle, 16.633333333333333, 1e-9));
    const flight = { score: -0.5, fingerprint: "abc", status: "submerged" };
    ok("!! sameFlight needs all three: a flight differing in the score alone, the fingerprint alone or the status alone is not the same one", X.sameFlight(flight, { ...flight }) && !X.sameFlight(flight, { ...flight, score: -0.6 }) && !X.sameFlight(flight, { ...flight, fingerprint: "abd" }) && !X.sameFlight(flight, { ...flight, status: "grounded" }));
    ok("!! runnerFailures checks the FIRST FOUR dives (CHECK_DIVES) and no others: the real runner against subTask.fly gives none; a runner that differs on the first, the fourth gives one failure naming the dive; one that differs on the fifth gives none; and the message names the seed", X.CHECK_DIVES === 4 && X.runnerFailures(scs).length === 0 && (() => { const five = [1, 2, 3, 4, 5].map((s) => T.scenario(s, "nominal")), bad = (seed) => (p, sc) => ({ ...T.fly(p, sc), score: sc.seed === seed ? 99 : T.fly(p, sc).score }); return J(X.runnerFailures(five, bad(1))) === '["the runner without a kick is not subTask.fly on dive 1"]' && X.runnerFailures(five, bad(4)).length === 1 && X.runnerFailures(five, bad(5)).length === 0 && X.runnerFailures(five, bad(2)).length === 1 && X.runnerFailures(five, bad(3)).length === 1; })());
    ok("the signs option: only +1 gives one row a dive", X.runArms([stub("a", "auto")], scs, { signs: [1] }).length === 2);
}

console.log("\n5. THE READINGS");
{
    const mk = (arm, family, areas, lostAt = -1) => areas.map((a, i) => ({ arm, family, seed: 1 + Math.floor(i / 2), sign: i % 2 ? -1 : 1, area: a, peak: 0.2, tail: 1, settle: 10, lost: i === lostAt }));
    const rows = [...mk("autopilot", "auto", [1, 1, 1, 1]), ...mk("fish803", "fish", [0.5, 0.5, 0.5, 0.5]), ...mk("r0", "real", [0.8, 0.8, 0.8, 0.8]), ...mk("r1", "real", [0.9, 0.9, 0.9, 0.9]), ...mk("p0", "plain", [0.5, 0.5, 0.5, 0.5]), ...mk("p1", "plain", [0.6, 0.6, 0.6, 0.6])];
    const rd = X.readingsOf(rows);
    ok("!! by family and in order: the autopilot, FISH803, 2 REAL pilots, 2 plain pilots with their areas; the reference is the autopilot's mean; nothing lost", rd.auto.id === "autopilot" && rd.fish.id === "fish803" && J(rd.real.map((p) => p.id)) === '["r0","r1"]' && J(rd.plain.map((p) => p.id)) === '["p0","p1"]' && rd.reference === 1 && rd.lost === 0 && rd.real[0].areas.length === 4);
    ok("!! the gains: FISH803 +0.5 (FASTER, n 1), REAL +0.15 (FASTER, n 2, se 0.05), PLAIN +0.45 (FASTER, se 0.05); REAL against PLAIN: PLAIN minus REAL -0.3, B FASTER (the plain nets by more); the bottom line follows", near(rd.fishReading.gain, 0.5) && rd.fishReading.reading === "FASTER" && rd.fishReading.n === 1 && near(rd.realReading.gain, 0.15) && near(rd.realReading.se, 0.05, 1e-12) && rd.realReading.reading === "FASTER" && near(rd.plainReading.gain, 0.45) && rd.plainReading.reading === "FASTER" && near(rd.versus.diff, -0.3) && rd.versus.reading === "B FASTER" && rd.bottom === "BOTH FAMILIES RIGHT FASTER, AND THE PLAIN NETS BY MORE");
    const lost = X.readingsOf([...mk("autopilot", "auto", [1, 1, 1, 1]), ...mk("fish803", "fish", [0.5, 0.5, 0.5, 0.5]), ...mk("r0", "real", [0.8, 0.8, 0.8, 0.8], 2), ...mk("r1", "real", [0.9, 0.9, 0.9, 0.9]), ...mk("p0", "plain", [0.5, 0.5, 0.5, 0.5]), ...mk("p1", "plain", [0.6, 0.6, 0.6, 0.6])]);
    ok("!! one lost kick anywhere makes the bottom line the lost-flight sentence and the count 1", lost.lost === 1 && /^A FLIGHT WAS LOST/.test(lost.bottom));
    const flat = X.readingsOf([...mk("autopilot", "auto", [1, 1, 1, 1]), ...mk("fish803", "fish", [1, 1, 1, 1]), ...mk("r0", "real", [1, 1, 1, 1]), ...mk("r1", "real", [1, 1, 1, 1]), ...mk("p0", "plain", [1, 1, 1, 1]), ...mk("p1", "plain", [1, 1, 1, 1])]);
    ok("!! a gain of exactly zero prints with a plus sign (+0.0000, 0.0 percent), as does a difference of zero between the families: all pilots equal to the autopilot read TIES everywhere and NEITHER FAMILY RIGHTS FASTER", X.reportLines(flat).slice(4).join("\n") === ["  FISH803 against the autopilot: TIES (gain +0.0000 rad s = 0.0 percent of the autopilot's 1.0000, se 0.0000, n 1)", "  REAL against the autopilot: TIES (gain +0.0000 rad s = 0.0 percent of the autopilot's 1.0000, se 0.0000, n 2)", "  PLAIN against the autopilot: TIES (gain +0.0000 rad s = 0.0 percent of the autopilot's 1.0000, se 0.0000, n 2)", "  REAL against PLAIN: TIES (PLAIN minus REAL +0.0000 rad s, se 0.0000)", "BOTTOM LINE: NEITHER FAMILY RIGHTS FASTER THAN THE AUTOPILOT"].join("\n"));
    const lines = X.reportLines(rd);
    ok("!! the report lines to the character for those rows: four family lines (area, peak, tail, settle, lost, pilots and the range of the pilot means), four readings with the gain in rad s and as a percent of the autopilot's area, the versus, the bottom line", J(lines) === J(["  autopilot  area 1.0000 rad s, peak 0.200 rad, tail 1.000 rad s, settle 10.0 s, lost 0 of 4 (1 pilot; pilot means 1.0000 to 1.0000)", "  fish803    area 0.5000 rad s, peak 0.200 rad, tail 1.000 rad s, settle 10.0 s, lost 0 of 4 (1 pilot; pilot means 0.5000 to 0.5000)", "  REAL       area 0.8500 rad s, peak 0.200 rad, tail 1.000 rad s, settle 10.0 s, lost 0 of 8 (2 pilots; pilot means 0.8000 to 0.9000)", "  PLAIN      area 0.5500 rad s, peak 0.200 rad, tail 1.000 rad s, settle 10.0 s, lost 0 of 8 (2 pilots; pilot means 0.5000 to 0.6000)", "  FISH803 against the autopilot: FASTER (gain +0.5000 rad s = 50.0 percent of the autopilot's 1.0000, se 0.0000, n 1)", "  REAL against the autopilot: FASTER (gain +0.1500 rad s = 15.0 percent of the autopilot's 1.0000, se 0.0500, n 2)", "  PLAIN against the autopilot: FASTER (gain +0.4500 rad s = 45.0 percent of the autopilot's 1.0000, se 0.0500, n 2)", "  REAL against PLAIN: B FASTER (PLAIN minus REAL -0.3000 rad s, se 0.0707)", "BOTTOM LINE: BOTH FAMILIES RIGHT FASTER, AND THE PLAIN NETS BY MORE"]), lines.join("\n"));
}

console.log("\n6. THE COMMAND");
{
    const runCmd = (argv, io = {}) => { const out = [], err = []; const code = X.command(argv, { out: (m) => out.push(m), err: (m) => err.push(m), ...io }); return { code, out: out.join("\n"), err: err.join("\n") }; };
    const bad = (argv, re) => { const r = runCmd(argv, { arms: [] }); return r.code === 2 && re.test(r.err) && r.out === ""; };
    ok("!! refusals, each exit 2 with nothing flown: an unknown set; --seeds 0, 1.5, abc; an unknown argument; --write with the DEV set; --write with --seeds; --rebuild-check with the registered set", bad(["--set", "held9"], /--set needs one of dev, registered/) && bad(["--seeds", "0"], /--seeds needs a positive whole number/) && bad(["--seeds", "1.5"], /--seeds needs a positive whole number/) && bad(["--seeds", "abc"], /--seeds needs a positive whole number/) && bad(["--frob"], /unknown argument "--frob"/) && bad(["--write"], /--write goes with --set registered only/) && bad(["--set", "registered", "--write", "--seeds", "2"], /--write needs the whole set/) && bad(["--set", "registered", "--rebuild-check"], /--rebuild-check goes with --set dev only/));
    const PIN_DEV2 = [
        "[takeRighting] 26 pilots, 2 nominal dives (1 to 2), a kick of 0.3 rad/s at 20 s, both signs, 4 kicks a pilot (a sanity run of the code, not a result); first-order orientation step",
        "checks: the runner without a kick is subTask.fly (the rebuild check is not run in DEV)",
        "  autopilot  area 0.4709 rad s, peak 0.184 rad, tail 1.437 rad s, settle 18.2 s, lost 0 of 4 (1 pilot; pilot means 0.4709 to 0.4709)",
        "  fish803    area 0.5394 rad s, peak 0.181 rad, tail 1.101 rad s, settle 14.1 s, lost 0 of 4 (1 pilot; pilot means 0.5394 to 0.5394)",
        "  REAL       area 0.5189 rad s, peak 0.185 rad, tail 1.108 rad s, settle 13.8 s, lost 0 of 32 (8 pilots; pilot means 0.4406 to 0.6304)",
        "  PLAIN      area 0.4743 rad s, peak 0.179 rad, tail 0.964 rad s, settle 13.3 s, lost 0 of 64 (16 pilots; pilot means 0.4250 to 0.6625)",
        "  FISH803 against the autopilot: SLOWER (gain -0.0685 rad s = -14.6 percent of the autopilot's 0.4709, se 0.0251, n 1)",
        "  REAL against the autopilot: SLOWER (gain -0.0480 rad s = -10.2 percent of the autopilot's 0.4709, se 0.0232, n 8)",
        "  PLAIN against the autopilot: TIES (gain -0.0034 rad s = -0.7 percent of the autopilot's 0.4709, se 0.0145, n 16)",
        "  REAL against PLAIN: TIES (PLAIN minus REAL -0.0446 rad s, se 0.0274)",
        "BOTTOM LINE: NEITHER FAMILY RIGHTS FASTER THAN THE AUTOPILOT",
    ];
    const r = runCmd(["--seeds", "2"], { arms });
    ok("!! a DEV run on two dives with the real 26 pilots, EVERY line to the character (the header, the check, four families, four readings, the bottom line): pinned", r.code === 0 && r.out === PIN_DEV2.join("\n"), r.out.split("\n").filter((l, k) => l !== PIN_DEV2[k]).slice(0, 1).join().slice(0, 200));
    const okArm = (id, family) => ({ id, family, build: () => AS.pilot(), rebuild: { policy: { evaluate: () => ({ score: -0.5 }) }, weights: [], set: () => [], recorded: -0.5 } }), badArm = { id: "zz", family: "plain", build: () => AS.pilot(), rebuild: { policy: { evaluate: () => ({ score: -0.4 }) }, weights: [], set: () => [], recorded: -0.5 } };
    const stubArms = (extra = []) => [{ id: "autopilot", family: "auto", build: () => AS.pilot(), rebuild: null }, { id: "fish803", family: "fish", build: () => AS.pilot(), rebuild: null }, okArm("r0", "real"), okArm("p0", "plain"), ...extra];
    const tiny = { dev: { first: 1, count: 4 }, registered: { first: 1, count: 1 } }, files = [];
    const g = runCmd(["--set", "registered", "--write"], { sets: tiny, arms: stubArms(), writeFile: (f, t) => files.push([f, t]) });
    ok("!! a stubbed registered run (dive 1 only, four stub pilots): titled the registered read, the check line says the rebuild was done, --write puts one JSON row a kick (4 pilots x 1 dive x 2 signs = 8) in brain/subRightingRegistered.jsonl with the set named, and says where; a DEV run without --write writes nothing and is titled a sanity run", g.code === 0 && g.out.includes("(the registered read)") && g.out.includes("every pilot rebuilt from its record reproduces the recorded score") && files.length === 1 && slash(files[0][0]).endsWith("brain/subRightingRegistered.jsonl") && files[0][1].trim().split("\n").length === 8 && JSON.parse(files[0][1].split("\n")[0]).set === "registered" && JSON.parse(files[0][1].split("\n")[0]).arm === "autopilot" && g.out.includes("wrote 8 kicks to brain/subRightingRegistered.jsonl") && (() => { const f2 = []; const d = runCmd(["--seeds", "1"], { sets: tiny, arms: stubArms(), writeFile: (f) => f2.push(f) }); return f2.length === 0 && d.out.includes("a sanity run of the code, not a result") && d.out.includes("the rebuild check is not run in DEV"); })(), g.err);
    const fx = runCmd(["--set", "registered"], { sets: tiny, arms: stubArms([badArm]) });
    ok("!! a pilot whose rebuild misses its record is printed FIRST as a failed check, marked NOT WEIGHED, naming the pilot and the miss (1.00e-1), with no `checks:` line, and the readings still follow; the DEV run with --rebuild-check does the same, the DEV run without it does not look", fx.code === 0 && fx.out.split("\n")[1] === "CHECK FAILED -- the readings below are NOT WEIGHED: zz rebuilt from its record misses the recorded score by 1.00e-1" && !fx.out.includes("checks:") && fx.out.includes("BOTTOM LINE") && runCmd(["--seeds", "1", "--rebuild-check"], { sets: tiny, arms: stubArms([badArm]) }).out.includes("CHECK FAILED") && !runCmd(["--seeds", "1"], { sets: tiny, arms: stubArms([badArm]) }).out.includes("CHECK FAILED"));
    {
        const { spawnSync } = await import("node:child_process"), prog = (await import("node:url")).fileURLToPath(new URL("./takeRighting.mjs", import.meta.url)), flags = ["--preserve-symlinks", "--preserve-symlinks-main", prog];
        const a = spawnSync(process.execPath, [...flags, "--bogus"], { encoding: "utf8", timeout: 60000 }), b = spawnSync(process.execPath, flags, { encoding: "utf8", timeout: 240000 });
        ok("!! run as a program: an unknown argument exits 2 naming it; with NO argument it flies the DEV set (exit 0, 26 pilots, dives 1 to 4, the bottom line printed)", a.status === 2 && /unknown argument "--bogus"/.test(a.stderr) && a.stdout === "" && b.status === 0 && b.stdout.startsWith("[takeRighting] 26 pilots, 4 nominal dives (1 to 4)") && b.stdout.includes("BOTTOM LINE: "), String(b.status));
        const e = spawnSync(process.execPath, ["--preserve-symlinks", "--input-type=module", "-e", `import(${J(prog)})`], { encoding: "utf8", timeout: 60000 });
        ok("!! imported from `node -e` (no script path in argv) the command runs nothing, prints nothing and does not throw", e.status === 0 && e.stdout === "" && e.stderr === "", String(e.status) + " " + e.stderr.slice(0, 120));
    }
    ok("importing the command runs nothing and sets no exit code", process.exitCode === undefined);
}

console.log("\n7. THE SOURCE");
{
    const cmd = fs.readFileSync(new URL("./takeRighting.mjs", import.meta.url), "utf8"), me = fs.readFileSync(new URL(import.meta.url), "utf8");
    const code = cmd.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*")).join("\n");
    ok("!! no clock and no random number in the command; its first import is rigidBody6dofEuler (Amendment C)", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && /^import "\.\.\/\.\.\/physics\/mechanics\/rigidBody6dofEuler\.mjs";/.test(cmd.split("\n").find((l) => l.startsWith("import "))));
    ok("the header names the registration, the library and the gate, and the files are ASCII", /FISH_RIGHTING_WIP\.md/.test(cmd) && /subRighting\.mjs/.test(cmd) && /takeRighting-selfcheck\.mjs/.test(cmd) && [cmd, me].every((t) => !/[^\x00-\x7F]/.test(t)));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
