// WebGLEngine/tools/ship/plannerNoise-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerNoise-selfcheck.mjs      (about 8 s: a few 100-second dives)
//
// THE GATE OF tools/ship/plannerNoise.mjs (Round 15 of brain/NEEDS_AND_LIMITS.md, registered first, one amendment before any seed was flown).
//   1 SETS       1341-1388 and 1401-1448 of far and both (96 dives each), disjoint from every seed of Rounds 1-14; the five noise levels; 11 arms in the registered order.
//   2 ARMS       every arm name is a pilot kind and a noise level; an unknown name or level is refused.
//   3 READINGS   the planner's gain at a level (KEEPS / LOSES / HURTS) and the tuned rule's difference from the reference level, on synthetic dives.
//   4 RANGE      the amended chain: from the reference sd outward, both ways, to the first level that does not keep the gain.
//   5 LINES      the two bottom lines, the no-limit tail, graceful and bad degradation.
//   6 CHECKS     identity with the Round 11 twin at the reference sd, the reference gain real; a failed check says NOT WEIGHED.
//   7 REPORT     the lines.
//   8 FLIGHT     real 100-second dives: the gauge noise reaches the dive (sd 0 and sd 0.30 differ, the reference level equals T.evaluate with T.GAUGE), the full twin at the reference equals the Round 11 twin.
//   9 SOURCE     the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: how the stack degrades with noise (that is the experiment).
// SABOTAGE LOG (43 mutants of tools/ship/plannerNoise.mjs, run against a copy of this gate): 8 went 0 red on the first pass and 7 got rows -- the pilot kind of each arm (tuned and twin swapped: the flight seeds were replaced by far 1344 and far 1350, where the twin's dive differs from the tuned rule's; on the first seeds they coincide), the default kinds, the assembly over both sets, the identity check reading the full twin (synthetic fingerprints are now arm-specific), the means row (tuned first, twin second), the crushed counts (tuned over twin) and the gain block having a row for every level. ONE is EQUIVALENT and said so: `loss <= 0.05` for `loss < 0.05` (a float boundary at exactly 0.05; the rows pin 0.049 graceful and 0.051 bad). All 43 are red or said above.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "../../brain/needsTask.mjs";
import * as U from "../../brain/tunedRule.mjs";
import * as X from "./plannerNoise.mjs";
console.log("plannerNoise-selfcheck -- the Round 15 gauge-noise sweep\n");
const code = fs.readFileSync(new URL("./plannerNoise.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208), ...rangeOf(1221, 1268), ...rangeOf(1281, 1328)]);
    const seeds = [...rangeOf(1341, 1388), ...rangeOf(1401, 1448)];
    ok("!! the sets are U1 1341-1388 and U2 1401-1448, 96 dives each of far and both (192 in all), and share no seed with Rounds 1-14", J(X.SET_RANGES) === J({ U1: [1341, 1388], U2: [1401, 1448] }) && J(X.SET_NAMES) === J(["U1", "U2"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 96) && J(X.HARD) === J(["far", "both"]));
    ok("!! the noise levels are 0, 0.05, 0.10, 0.20, 0.30 and the reference is 0.10", J(X.SDS) === J([0, 0.05, 0.1, 0.2, 0.3]) && X.REFERENCE_SD === 0.1);
    ok("!! 11 arms: the tuned rule and the full twin at each level in that order, then TWIN-ROUND11", X.ARMS.length === 11 && J(X.ARMS.slice(0, 4)) === J(["TUNED-R8@0", "TWIN-FULL@0", "TUNED-R8@0.05", "TWIN-FULL@0.05"]) && X.ARMS[8] === "TUNED-R8@0.3" && X.ARMS[9] === "TWIN-FULL@0.3" && X.ARMS[10] === "TWIN-ROUND11");
}
sec("2. ARMS");
{
    ok("!! TUNED-R8@0.05 is the tuned rule at sd 0.05; TWIN-FULL@0.3 the full twin at sd 0.3; TWIN-ROUND11 the Round 11 twin at the reference sd", J(X.parseArm("TUNED-R8@0.05")) === J({ kind: "TUNED-R8", sd: 0.05 }) && J(X.parseArm("TWIN-FULL@0.3")) === J({ kind: "TWIN-FULL", sd: 0.3 }) && J(X.parseArm("TWIN-FULL@0")) === J({ kind: "TWIN-FULL", sd: 0 }) && J(X.parseArm("TWIN-ROUND11")) === J({ kind: "TWIN-ROUND11", sd: 0.1 }));
    const thr = (a) => { try { X.parseArm(a); return false; } catch { return true; } };
    ok("!! an unknown kind, a level that was not registered (0.15) and a bare name are refused", thr("TWIN@0.1") && thr("TUNED-R8@0.15") && thr("TUNED-R8") && thr("TWIN-FULL@") && thr("ORACLE-ORDER@0.1"));
}
// synthetic: 8 dives per set; tuned base scores per level; twin = tuned + a gain per level
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6];
const KEEP = [0.1, 0.1, 0.1, 0.12, 0.1, 0.1, 0.08, 0.1], LOSE = [0.05, -0.05, 0.05, -0.05, 0.04, -0.04, 0.05, -0.05], HURT = KEEP.map((x) => -x), ZERO = [0];
const JIT = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.01];
const mk = (scores, tag = "", crashed = 0) => ({ runs: scores.map((score, i) => ({ kind: i % 2 ? "both" : "far", score, fingerprint: tag + "f" + i })), score: scores.reduce((a, b) => a + b, 0) / scores.length, crashed, stranded: 0 });
// spec: { tunedShift: { sd: shift }, gain: { sd: d } }
const synth = ({ tunedShift = {}, gain = {}, crashed = {} } = {}) => {
    const au = {};
    for (const n of X.SET_NAMES) {
        au[n] = {};
        for (const sd of X.SDS) {
            const shift = tunedShift[sd] || 0, g = gain[sd] || KEEP;
            const tuned = BASE.map((b, i) => b + shift + JIT[i] * (X.SDS.indexOf(sd) - 2));
            au[n][`TUNED-R8@${sd}`] = mk(tuned, "T" + sd, (crashed.tuned || {})[sd] || 0); au[n][`TWIN-FULL@${sd}`] = mk(tuned.map((t, i) => t + g[i % g.length]), "W", (crashed.twin || {})[sd] || 0);
        }
        au[n]["TWIN-ROUND11"] = mk(au[n]["TWIN-FULL@0.1"].runs.map((r) => r.score), "W");
    }
    return au;
};

sec("3. READINGS");
{
    const au = synth({ gain: { 0.2: LOSE, 0.3: HURT } }), g = (sd) => X.gainAt(au, sd);
    ok("!! a steady gain KEEPS, a wobble LOSES, a steady loss HURTS, each at its own level", g(0.1).verdict === "KEEPS" && g(0.2).verdict === "LOSES" && g(0.3).verdict === "HURTS" && g(0).verdict === "KEEPS");
    ok("!! the gain carries sd, n 16 (two sets of eight), the pooled mean and the counts", g(0.1).sd === 0.1 && g(0.1).n === 16 && Math.abs(g(0.1).mean - 0.1) < 0.01 && g(0.1).better === 16 && g(0.3).worse === 16);
    ok("!! the gain is the twin of THAT level minus the tuned rule of THAT level (a level with the twin's gain only at another level reads LOSES)", (() => { const a = synth({ gain: { 0.05: ZERO } }); return X.gainAt(a, 0.05).verdict === "LOSES" && X.gainAt(a, 0.1).verdict === "KEEPS"; })());
    const tl = synth({ tunedShift: { 0: 0.04, 0.05: 0.02, 0.2: -0.03, 0.3: -0.09 } }), d = (sd) => X.tunedLossAt(tl, sd);
    ok("!! the tuned rule's difference from sd 0.10: +0.04 at sd 0, +0.02 at 0.05, 0 at the reference itself, -0.03 at 0.20, -0.09 at 0.30", Math.abs(d(0).mean - 0.04) < 1e-3 && Math.abs(d(0.05).mean - 0.02) < 1e-3 && Math.abs(d(0.1).mean) < 1e-9 && Math.abs(d(0.2).mean + 0.03) < 1e-3 && Math.abs(d(0.3).mean + 0.09) < 1e-3);
    ok("!! HURTS BY NOISE only for a level clearly below the reference (negative by more than 2 se): -0.03 and -0.09 do, +0.04 and 0 do not", d(0.2).hurtsByNoise === true && d(0.3).hurtsByNoise === true && d(0).hurtsByNoise === false && d(0.1).hurtsByNoise === false);
}
sec("4. RANGE");
{
    const r = (gain) => J(X.keepRange(synth({ gain })));
    ok("!! every level keeping gives 0 to 0.3", r({}) === J({ low: 0, high: 0.3 }));
    ok("!! a break at 0.30 stops the high end at 0.20; a break at 0.20 stops it at 0.10 even though 0.30 keeps (the chain is outward from the reference)", r({ 0.3: LOSE }) === J({ low: 0, high: 0.2 }) && r({ 0.2: LOSE }) === J({ low: 0, high: 0.1 }));
    ok("!! a break at 0.05 stops the low end at 0.10 even though sd 0 keeps; a break at sd 0 stops it at 0.05", r({ 0.05: LOSE }) === J({ low: 0.1, high: 0.3 }) && r({ 0: LOSE }) === J({ low: 0.05, high: 0.3 }));
    ok("!! breaks on both sides give the narrow range, and a HURTS level breaks the chain like a LOSES one", r({ 0.2: LOSE, 0.05: HURT }) === J({ low: 0.1, high: 0.1 }));
}
sec("5. LINES");
{
    const lines = (spec) => X.bottomLines(synth(spec));
    ok("!! all levels keep: the range line says FROM SD 0 TO SD 0.3 with the no-limit tail", lines({})[0] === "THE GAIN KEEPS FROM SD 0 TO SD 0.3 (NO LIMIT TESTED: EVERY LEVEL KEEPS IT)");
    ok("!! a narrower range has no tail: FROM SD 0.05 TO SD 0.2", lines({ gain: { 0: LOSE, 0.3: LOSE } })[0] === "THE GAIN KEEPS FROM SD 0.05 TO SD 0.2");
    ok("!! a tail needs both ends: a break at sd 0 alone has none", !/NO LIMIT/.test(lines({ gain: { 0: LOSE } })[0]) && !/NO LIMIT/.test(lines({ gain: { 0.3: LOSE } })[0]));
    ok("!! the tuned rule's line: a loss of 0.04 from sd 0 to sd 0.30 is GRACEFUL, 0.12 is BAD; the loss is the tuned score at sd 0 minus at 0.30", lines({ tunedShift: { 0: 0.02, 0.3: -0.02 } })[1] === "THE TUNED RULE LOSES 0.040 FROM SD 0 TO SD 0.30 (DEGRADES GRACEFULLY)" && lines({ tunedShift: { 0: 0.05, 0.3: -0.07 } })[1] === "THE TUNED RULE LOSES 0.120 FROM SD 0 TO SD 0.30 (DEGRADES BADLY)");
    ok("!! the boundary is 0.05: a loss of 0.049 is GRACEFUL and 0.051 is BAD; a tuned rule that does BETTER at sd 0.30 reports a negative loss", /GRACEFULLY/.test(lines({ tunedShift: { 0: 0.0245, 0.3: -0.0245 } })[1]) && /BADLY/.test(lines({ tunedShift: { 0: 0.0255, 0.3: -0.0255 } })[1]) && /LOSES -0\.040 FROM/.test(lines({ tunedShift: { 0: -0.02, 0.3: 0.02 } })[1]));
}
sec("6. CHECKS");
{
    const rows = (au) => X.checksOf(au);
    ok("!! three check rows on a clean audit: IDENTITY for each set and REFERENCE GAIN IS REAL, all passing", J(rows(synth()).map((c) => c.name)) === J(["IDENTITY U1", "IDENTITY U2", "REFERENCE GAIN IS REAL"]) && rows(synth()).every((c) => c.ok));
    const bad = synth(); bad.U2["TWIN-ROUND11"].runs[3].fingerprint = "x";
    ok("!! a dive of the Round 11 twin that differs from the full twin at the reference breaks IDENTITY U2 only", J(rows(bad).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY U2"]));
    ok("!! no real gain at the reference breaks REFERENCE GAIN IS REAL only (a gain at another level does not stand in)", J(rows(synth({ gain: { 0.1: LOSE } })).filter((c) => !c.ok).map((c) => c.name)) === J(["REFERENCE GAIN IS REAL"]));
}
sec("7. REPORT");
{
    const L = X.report(synth({ gain: { 0.3: LOSE }, tunedShift: { 0: 0.03, 0.3: -0.04 } })), txt = L.join("\n");
    ok("!! the head names both sets; the three checks pass first", /^ROUND 15/.test(L[0]) && L[0].includes("U1 1341-1388") && L[0].includes("U2 1401-1448") && L.slice(1, 4).every((l) => /^  PASS /.test(l)));
    ok("!! one means row per level (five), one gain row per level with its verdict (KEEPS at 0.1, LOSES at 0.3), one tuned-rule row per level (five)", (txt.match(/^  sd [0-9.]+ +0\.[0-9]{3} \| 0\.[0-9]{3} /gm) || []).length === 5 && /sd 0\.3 +\+0\.[0-9]+.*LOSES/.test(txt) && /sd 0\.1 +\+0\.[0-9]+.*KEEPS/.test(txt) && (txt.match(/^  sd [0-9.]+ +[+-]0\.[0-9]{4} \(se [0-9.]+; better \d+, worse \d+, same \d+\)(  HURTS BY NOISE)?$/gm) || []).length === 5);
    ok("!! the means row of sd 0 reads the tuned rule first (0.587) and the twin second (0.687; the last digit is float noise), and the crushed counts read tuned/twin summed over both sets", /sd 0 +0\.58[78] \| 0\.68[78] /.test(X.report(synth()).join("\n")) && /sd 0\.2 +0\.5[0-9]+ \| 0\.[0-9]+ +crushed 2\/6 /.test(X.report(synth({ crashed: { tuned: { 0.2: 1 }, twin: { 0.2: 3 } } })).join("\n")));
    const gi = L.findIndex((l) => l.startsWith("planner gain")), ti = L.findIndex((l) => l.startsWith("tuned rule against"));
    ok("!! the planner-gain block has one row per level (five, from sd 0) between its heading and the tuned rule's", ti - gi === 6 && /^  sd 0 +\+0\.[0-9]+/.test(L[gi + 1]) && /^  sd 0\.3 /.test(L[gi + 5]) && L.length - 3 - ti === 5);
    ok("!! the tuned rule's rows carry HURTS BY NOISE at sd 0.30 only (the -0.04 shift), and the gain rows do not", /sd 0\.3 +-0\.0[0-9]+ .*HURTS BY NOISE/.test(txt) && (txt.match(/HURTS BY NOISE/g) || []).length === 1);
    ok("!! the two bottom lines come last, each prefixed BOTTOM LINE:", L[L.length - 2].startsWith("BOTTOM LINE: THE GAIN KEEPS FROM SD 0 TO SD 0.2") && L[L.length - 1].startsWith("BOTTOM LINE: THE TUNED RULE LOSES 0.070 FROM SD 0 TO SD 0.30 (DEGRADES BADLY)"));
    const bad = synth(); bad.U1["TWIN-ROUND11"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY U1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("8. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { U1: [1344, 1345], U2: [1349, 1350] }, fly = (a) => X.flySets(a, R8, { ranges, kinds: ["far", "both"] });
    const t0 = fly("TUNED-R8@0"), t3 = fly("TUNED-R8@0.3"), t1 = fly("TUNED-R8@0.1"), w1 = fly("TWIN-FULL@0.1"), r11 = fly("TWIN-ROUND11");
    ok("!! flySets returns U1 and U2, four dives each (two seeds of far and both)", J(Object.keys(t0)) === J(["U1", "U2"]) && t0.U1.runs.length === 4 && t0.U2.runs.length === 4);
    ok("!! the gauge noise reaches the dive: sd 0 and sd 0.30 give different tuned dives on at least one of eight", ["U1", "U2"].some((n) => t0[n].runs.some((r, i) => r.fingerprint !== t3[n].runs[i].fingerprint)));
    const direct = T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), T.setOf(["far", "both"], 1344, 1345), { gauge: T.GAUGE, seconds: 100 });
    ok("!! the reference level is T.GAUGE itself: the tuned rule at sd 0.10 is T.evaluate with T.GAUGE, dive for dive", t1.U1.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint));
    ok("!! the full twin at the reference equals the Round 11 twin dive for dive", ["U1", "U2"].every((n) => w1[n].runs.every((r, i) => r.fingerprint === r11[n].runs[i].fingerprint)));
    ok("!! the twin and the tuned rule are different pilots: on far 1344 and far 1350 the twin's dive differs from the tuned rule's at the reference, and the tuned rule's dives are T.evaluate's tuned dives, not the twin's", w1.U1.runs[0].fingerprint !== t1.U1.runs[0].fingerprint && w1.U2.runs[1].fingerprint !== t1.U2.runs[1].fingerprint && t1.U1.runs[0].fingerprint === direct.runs[0].fingerprint);
    const dflt = X.flySets("TUNED-R8@0.1", R8, { ranges });
    ok("!! flySets with the default kinds flies far and both (four dives for two seeds, in the order far, far... per seed: far then both), and assemble keys sets then arms", J(dflt.U1.runs.map((r) => r.kind)) === J(["far", "far", "both", "both"]) && J(Object.keys(X.assemble({ A: t0, B: t1 }).U2)) === J(["A", "B"]) && X.assemble({ A: t0 }).U2.A === t0.U2 && X.assemble({ A: t0 }).U1.A === t0.U1);
    X.setFlight({});
    const thr = (a) => { try { X.flyArm(a, R8, T.setOf(["far"], 1, 1)); return false; } catch { return true; } };
    ok("!! flyArm refuses an unknown arm before flying", thr("TWIN-FULL@0.15"));
}
sec("9. SOURCE");
{
    ok("!! the seeds 1341, 1388, 1401 and 1448 appear once each, in SET_RANGES", ["1341", "1388", "1401", "1448"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
