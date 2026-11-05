// WebGLEngine/tools/ship/tankPairedReplicate-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/tankPairedReplicate-selfcheck.mjs      (about 14 s)
//
// THE GATE OF tools/ship/tankPairedReplicate.mjs: the replication of the paired memory test (brain/TANK_PILOTS_WIP.md, FOLLOW-UP 2), pooled. The flights are the bench's and are held by tools/tankFlyCxBench-selfcheck.mjs; here they are replaced by a stand-in that returns differences chosen by hand, so that every number below is worked out by hand.
//   1 THE EXACT POOLED P   [0.1] gives 1; [0.1, 0.1] 0.5; [0.1, -0.1] 1; [0.3, 0.1, 0.1] 0.25 (only the two all-one-sign assignments reach 0.5); [0.4, 0.1, 0.1, 0.1] 0.125; [1, 2, 3] x 1e-5 0.25 and [1, 2, -3] x 1e-5 1; ten equal negatives 2/1024; 48 equal-size differences with 36 of one sign
//                          201,893,464,614 / 2^48 = 0.000717270 (the binomial tail, counted by hand); equal to the bench's own enumeration on twelve random lists of 3 to 16 differences to the last digit; a difference under half the quantum counts as 0; 0 or 53 differences refused, a non-finite one gives NaN.
//   2 THE TEST             [-0.2, -0.1, -0.3, 0.05]: mean -0.1375, sd 0.149304, se 0.074652, three below 0, p 0.25 (the assignments of sum 65000 and 55000, either sign, of 16), does not hold; ten of -0.1: p 0.001953, holds; a positive mean never holds.
//   3 THE VERDICT          three lists of equal negatives hold all three: MEMORY HELPS MORE IN THE DARK; P3 symmetrical: NOT DARK-SPECIFIC; none: NO MEASURABLE EFFECT; P1 only: MIXED; the lists pooled end to end (the first set, then the new).
//   4 THE CHECK            means of exactly -0.0553, -0.1368, -0.1037 are the first result; a mean that prints one unit of the fourth place off is a MISMATCH and names the test; -0.05534 prints as -0.0553 and passes.
//   5 THE BOTTOM LINE      pooled P3 holds: HELPS MORE IN THE DARK (48 IDS); does not hold and mean - 2 se above -0.1037: SMALLER THAN THE FIRST ESTIMATE; otherwise (also exactly at the edge) STILL UNSETTLED; the ids needed: sd 0.28 gives 121, sd 0.05 gives 4.
//   6 THE RUN              the stand-in is called for the new ids first (prefix rep-) and for the first set second (mem-) with the sizes asked; registered iff 24 ids of 240 s; the pooled lists are the first set's then the new set's.
//   7 THE REPORT           a registered run prints the header, the check lines, the pooled table, the two sets alone and the bottom line; a failed check stops after its lines; a smoke run says so and makes no verdict.
//   8 THE COMMAND          exit 1 for a usage error (an unknown flag, no value, ids outside 2 to 26, seconds outside 40 to 600, not whole numbers), 0 for a read run, 2 for a registered run whose check failed; the flights get the sizes; the output ends in a newline.
//   9 THE SOURCE           pure but for the bench it calls; the imports.
// NOT CHECKED, said plainly: the flights (the bench's gate holds them) and the numbers a real run prints (the registered run is made once, after this gate).
// SABOTAGE (2026-11-05, 241 mutants of tankPairedReplicate.mjs: 173 mechanical single-site and 68 hand-written; the gate was run against each): 197 red by name, 27 the gate threw on (a guard refusing the changed input), 1 CRASH (the main guard reading argv[2]), 2 NOPASS (the main guard running the command on import, which ends the gate before it prints), 1 TIMEOUT (a loop that does not end), 13 survivors, all argued equivalent below.
//   First run: 15 survivors. Two were real: the bottom line's two-se interval (mean - 2 se) read with one se (H34, P0090) -- closed by the row on a mean of -0.05 with se 0.03 (-0.11 at two se is unsettled, -0.08 at one would be called smaller), both red afterwards.
//   Equivalent, 13: H23 (the verdict's first two arguments swapped: pairedVerdict is symmetric in them); H53 (the lists pooled in the other order: the test is a sum and a mean, order-free); P0030 (the signed sum with a minus: its absolute value is the same); P0037, P0042, P0043, P0044, P0045, P0046 (an array one or more cells larger, or a start reach of 1: the walk is centred on `total` and cells beyond the reach are zero, so the extra cells are never read as a count); P0072 (mean <= 0 for 'holds': a mean of exactly 0 has p 1); P0073 (p <= ALPHA: no count over 2^n is exactly the double 0.05); P0098 (the printed form switches at 0.0001: a count over 2^n is never exactly 1e-4); P0179 (argv[2] for argv[1] in the main guard: differs only when the command is given NO argument, which is the registered run itself -- 24 ids of 240 s, four flights each -- and the gate does not fly it).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as R from "./tankPairedReplicate.mjs";
import * as B from "../tankFlyCxBench.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message || e); } };
const J = JSON.stringify, near = (a, b, tol) => Math.abs(a - b) <= tol, P = R.exactPooledP;
const HERE = path.dirname(fileURLToPath(import.meta.url));
console.log("tankPairedReplicate-selfcheck -- the paired memory test, replicated and pooled\n");

sec("1. THE EXACT POOLED P");
{
    ok("!! by hand: [0.1] 1; [0.1, 0.1] 0.5; [0.1, -0.1] 1; [0.3, 0.1, 0.1] 0.25; [0.4, 0.1, 0.1, 0.1] 0.125", P([0.1]) === 1 && P([0.1, 0.1]) === 0.5 && P([0.1, -0.1]) === 1 && P([0.3, 0.1, 0.1]) === 0.25 && P([0.4, 0.1, 0.1, 0.1]) === 0.125);
    ok("!! at the quantum: [1, 2, 3] x 1e-5 is 0.25 and [1, 2, -3] x 1e-5 is 1 (the sum is 0); a sign does not matter ([-0.3, -0.1, -0.1] is 0.25)", P([1e-5, 2e-5, 3e-5]) === 0.25 && P([1e-5, 2e-5, -3e-5]) === 1 && P([-0.3, -0.1, -0.1]) === 0.25);
    ok("!! ten equal negatives: 2 of 1024 assignments reach the observed sum, p 0.001953125; ten of one sign and none of the other give the same by symmetry", P(Array(10).fill(-0.1)) === 2 / 1024 && P(Array(10).fill(0.1)) === 2 / 1024);
    const d48 = [...Array(36).fill(0.01), ...Array(12).fill(-0.01)];
    ok("!! 48 equal-size differences, 36 of one sign: the binomial tail 2 x sum over j >= 36 of C(48, j) / 2^48 = 201,893,464,614 / 2^48 = 0.000717270 (counted by hand)", near(P(d48), 201893464614 / 2 ** 48, 1e-15) && near(P(d48), 0.00071727, 1e-8), String(P(d48)));
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; let worst = 0;
    for (let t = 0; t < 12; t++) { const n = 3 + Math.floor(rnd() * 14), d = Array.from({ length: n }, () => Math.round((rnd() - 0.6) * 0.5 / 1e-5) * 1e-5); worst = Math.max(worst, Math.abs(P(d) - B.exactSignFlipP(d))); }
    ok("!! equal to the bench's own Gray-code enumeration on twelve random lists of 3 to 16 differences (rounded to the quantum), to the last digit", worst === 0, "worst " + worst);
    ok("!! a difference under half the quantum counts as 0 ([4e-6, 0.1] is [0, 0.1]: p 1); a quantum of 1e-3 rounds 0.0004 to 0 and 0.0006 to 1 (so [0.0006, 0.0006] has p 0.5 and [0.0004, 0.0004] p 1)", P([4e-6, 0.1]) === P([0, 0.1]) && P([0.0006, 0.0006], 1e-3) === 0.5 && P([0.0004, 0.0004], 1e-3) === 1 && R.QUANTUM === 1e-5);
    ok("!! no differences and 53 are refused by their count; a non-finite one gives NaN; 52 is taken", /needs 1 to 52 differences, got 0/.test(throws(() => P([])) || "") && /got 53/.test(throws(() => P(Array(53).fill(0.001))) || "") && Number.isNaN(P([0.1, NaN])) && Number.isNaN(P([Infinity])) && P(Array(52).fill(0)) === 1);
}

sec("2. THE TEST");
{
    const t = R.testOf([-0.2, -0.1, -0.3, 0.05]);
    ok("!! [-0.2, -0.1, -0.3, 0.05]: n 4, mean -0.1375, sd 0.149304, se 0.074652, three below 0, p 0.25, does not hold", t.n === 4 && near(t.mean, -0.1375, 1e-12) && near(t.sd, 0.14930394, 1e-7) && near(t.se, 0.07465197, 1e-7) && t.better === 3 && t.p === 0.25 && t.holds === false);
    ok("!! a difference of exactly 0 is not 'better' ([0, -1, -1]: two better of three), and it makes the count of a sign flip unaffected ([0, 0.1, 0.1] has p 0.5, the zero adding a factor 2 to the assignments and to the count)", R.testOf([0, -1, -1]).better === 2 && R.testOf([0, 0.1, 0.1]).p === 0.5 && R.testOf([0, 0]).p === 1 && R.testOf([0, 0]).holds === false);
    const h = R.testOf(Array(10).fill(-0.1));
    ok("!! ten of -0.1: p 0.001953, holds, ten better; ten of +0.1 has the same p and a positive mean and does NOT hold; the alpha is 0.05", near(h.p, 0.001953125, 1e-12) && h.holds === true && h.better === 10 && R.testOf(Array(10).fill(0.1)).holds === false && R.ALPHA === 0.05 && R.testOf(Array(10).fill(0.1)).better === 0);
    ok("!! a p just above 0.05 does not hold (seven of one sign and one of the other, equal size: (1 + 8 + 8 + 1) / 256 = 0.0703125), one just below does (eight of one sign: 2/256 = 0.0078); six and two is 74/256 = 0.2891", R.testOf([-1, -1, -1, -1, -1, -1, -1, 1]).p === 0.0703125 && R.testOf([-1, -1, -1, -1, -1, -1, -1, 1]).holds === false && R.testOf(Array(8).fill(-1)).holds === true && R.testOf(Array(8).fill(-1)).p === 2 / 256 && R.testOf([-1, -1, -1, -1, -1, -1, 1, 1]).p === 74 / 256);
}

sec("3. THE VERDICT");
{
    const eq = (v) => Array(12).fill(v), sym = Array.from({ length: 12 }, (_, i) => (i % 2 ? 0.1 : -0.1));
    ok("!! three lists of -0.1 hold all three tests: MEMORY HELPS MORE IN THE DARK", R.testsOf({ p1: eq(-0.1), p2: eq(-0.1), p3: eq(-0.1) }).verdict === "MEMORY HELPS MORE IN THE DARK");
    ok("!! P1 and P2 hold and P3 is symmetrical: MEMORY HELPS, NOT DARK-SPECIFIC", R.testsOf({ p1: eq(-0.1), p2: eq(-0.1), p3: sym }).verdict === "MEMORY HELPS, NOT DARK-SPECIFIC");
    ok("!! none holds: NO MEASURABLE EFFECT OF MEMORY; P1 alone: MIXED; P2 alone: MIXED", R.testsOf({ p1: sym, p2: sym, p3: sym }).verdict === "NO MEASURABLE EFFECT OF MEMORY" && R.testsOf({ p1: eq(-0.1), p2: sym, p3: sym }).verdict === "MIXED" && R.testsOf({ p1: sym, p2: eq(-0.1), p3: sym }).verdict === "MIXED");
    ok("!! the tests are named p1, p2, p3 and each is testOf of its own list", (() => { const x = R.testsOf({ p1: [-1, -2, -3], p2: [0.5, 0.5], p3: [-0.1] }).tests; return x.p1.n === 3 && x.p2.n === 2 && x.p3.n === 1 && near(x.p1.mean, -2, 1e-12) && near(x.p2.mean, 0.5, 1e-12); })());
    const pl = R.pool({ p1: [1, 2], p2: [3], p3: [5, 6] }, { p1: [10], p2: [20, 30], p3: [] });
    ok("!! the lists end to end, the first set then the new: p1 [1, 2, 10], p2 [3, 20, 30], p3 [5, 6]", J(pl) === J({ p1: [1, 2, 10], p2: [3, 20, 30], p3: [5, 6] }));
}

sec("4. THE CHECK");
{
    const ck = (a, b, c) => R.checkFirst({ p1: [a], p2: [b], p3: [c] });
    ok("!! means of exactly -0.0553, -0.1368, -0.1037 are the first result; the registered values are those", ck(-0.0553, -0.1368, -0.1037).ok === true && J(R.FIRST_RESULT) === J({ p1: -0.0553, p2: -0.1368, p3: -0.1037 }) && Object.isFrozen(R.FIRST_RESULT));
    const bad = ck(-0.0553, -0.1369, -0.1037);
    ok("!! one unit of the fourth place off in P2 is a MISMATCH on that line only", bad.ok === false && /p2: re-flown -0.1369, first result -0.1368   MISMATCH/.test(bad.lines[1]) && !/MISMATCH/.test(bad.lines[0]) && !/MISMATCH/.test(bad.lines[2]));
    ok("!! each test is read from its own list: a P1 and a P3 mismatch are named; a mean that rounds to the printed value (-0.05534) passes; the lines read 're-flown X, first result Y'", ck(-0.0554, -0.1368, -0.1037).ok === false && /p1: re-flown -0.0554, first result -0.0553   MISMATCH/.test(ck(-0.0554, -0.1368, -0.1037).lines[0]) && ck(-0.0553, -0.1368, -0.1036).ok === false && ck(-0.05534, -0.1368, -0.1037).ok === true && /^  p3: re-flown -0.1037, first result -0.1037$/.test(ck(-0.0553, -0.1368, -0.1037).lines[2]));
    ok("!! the mean of a list is checked, not its first element ([-0.0553 x 3, a mean of -0.0553] passes; [0, -0.1106] has mean -0.0553 and passes)", R.checkFirst({ p1: [0, -0.1106], p2: [-0.1368], p3: [-0.1037] }).ok === true);
}

sec("5. THE BOTTOM LINE");
{
    const bl = (o) => R.bottomLine(o);
    ok("!! pooled P3 holds: THE MEMORY HELPS MORE IN THE DARK (48 IDS) -- whatever its mean and se", bl({ holds: true, mean: -0.01, se: 1 }) === "THE MEMORY HELPS MORE IN THE DARK (48 IDS)");
    ok("!! it does not hold and mean - 2 se is above -0.1037 (-0.05 - 0.04 = -0.09): THE DARK EFFECT OF THE MEMORY IS SMALLER THAN THE FIRST ESTIMATE", bl({ holds: false, mean: -0.05, se: 0.02 }) === "THE DARK EFFECT OF THE MEMORY IS SMALLER THAN THE FIRST ESTIMATE");
    ok("!! it does not hold and the interval reaches -0.1037 (-0.08 - 0.06 = -0.14): P3 IS STILL UNSETTLED; a mean of -0.05 with se 0.03 reaches -0.11 at two se (unsettled) though only -0.08 at one; exactly at the edge (mean - 2 se = -0.1037) it is unsettled too", bl({ holds: false, mean: -0.08, se: 0.03 }) === "P3 IS STILL UNSETTLED" && bl({ holds: false, mean: -0.05, se: 0.03 }) === "P3 IS STILL UNSETTLED" && bl({ holds: false, mean: -0.1037, se: 0 }) === "P3 IS STILL UNSETTLED" && bl({ holds: false, mean: -0.1036, se: 0 }) === "THE DARK EFFECT OF THE MEMORY IS SMALLER THAN THE FIRST ESTIMATE" && bl({ holds: false, mean: -0.0636, se: 0.02 }) === "THE DARK EFFECT OF THE MEMORY IS SMALLER THAN THE FIRST ESTIMATE");
    ok("!! the ids needed: sd 0.28 gives (1.96 x 0.28 / 0.05)^2 = 120.47 -> 121; sd 0.05 gives 3.8416 -> 4; sd 0.1 gives 15.37 -> 16", R.idsNeeded(0.28) === 121 && R.idsNeeded(0.05) === 4 && R.idsNeeded(0.1) === 16);
}

// a stand-in for the bench: differences chosen by hand per prefix; records its calls
function standIn(table) {
    const calls = [];
    const f = (opts) => { calls.push({ ...opts }); const d = table[opts.prefix]; return { ids: Array.from({ length: opts.ids }, (_, i) => opts.prefix + i), seconds: opts.seconds, diffs: d }; };
    f.calls = calls; return f;
}
const eq = (n, v) => Array(n).fill(v);
const FIRST = { p1: eq(24, -0.0553), p2: eq(24, -0.1368), p3: eq(24, -0.1037) };
const REP = { p1: eq(24, -0.0647), p2: eq(24, -0.0632), p3: eq(24, -0.0763) };   // pooled with FIRST: means -0.06, -0.1, -0.09 (small magnitudes keep the exact count fast)

sec("6. THE RUN");
{
    const si = standIn({ "rep-": REP, "mem-": FIRST });
    const res = R.run({}, si);
    ok("!! the stand-in is called twice, the new ids first (prefix rep-) then the first set (mem-), with 24 ids of 240 s; the run is registered and the check passes", si.calls.length === 2 && si.calls[0].prefix === "rep-" && si.calls[1].prefix === "mem-" && si.calls.every((c) => c.ids === 24 && c.seconds === 240) && res.registered === true && res.check.ok === true && R.NEW_PREFIX === "rep-" && R.OLD_PREFIX === "mem-");
    ok("!! the pooled lists are the first set's then the new set's: 48 differences, the first 24 of -0.0553 and the last 24 of -0.0647 in P1 (mean -0.06)", res.sets.pooled.tests.p1.n === 48 && near(res.sets.pooled.tests.p1.mean, -0.06, 1e-12) && near(res.sets.pooled.tests.p2.mean, -0.1, 1e-12) && near(res.sets.pooled.tests.p3.mean, -0.09, 1e-12) && res.sets.fresh.tests.p1.n === 24 && near(res.sets.fresh.tests.p1.mean, -0.0647, 1e-12) && near(res.sets.first.tests.p1.mean, -0.0553, 1e-12));
    const s2 = standIn({ "rep-": { p1: eq(5, -0.2), p2: eq(5, -0.3), p3: eq(5, -0.4) }, "mem-": { p1: eq(5, -0.05), p2: eq(5, -0.1), p3: eq(5, -0.1) } }), small = R.run({ ids: 5, seconds: 60 }, s2);
    ok("!! any other size is a smoke run: not registered, the sizes handed to the flights (5 ids of 60 s), pooled over 10 differences", small.registered === false && s2.calls.every((c) => c.ids === 5 && c.seconds === 60) && small.sets.pooled.tests.p1.n === 10 && R.REGISTERED.ids === 24 && R.REGISTERED.seconds === 240 && Object.isFrozen(R.REGISTERED));
    ok("!! 24 ids at another number of seconds, or 23 at 240, are smoke runs too", R.run({ ids: 24, seconds: 100 }, standIn({ "rep-": FIRST, "mem-": FIRST })).registered === false && R.run({ ids: 23, seconds: 240 }, standIn({ "rep-": { p1: eq(23, -1), p2: eq(23, -1), p3: eq(23, -1) }, "mem-": { p1: eq(23, -1), p2: eq(23, -1), p3: eq(23, -1) } })).registered === false);
    const mism = R.run({}, standIn({ "rep-": FIRST, "mem-": { ...FIRST, p2: eq(24, -0.14) } }));
    ok("!! the check reads the FIRST set (mem-), not the new one: a first set that prints -0.14 for P2 fails it even if the new set matches", mism.check.ok === false && R.run({}, standIn({ "rep-": { ...FIRST, p2: eq(24, -0.14) }, "mem-": FIRST })).check.ok === true);
}

sec("7. THE REPORT");
{
    const reg = R.run({}, standIn({ "rep-": REP, "mem-": FIRST })), L = R.reportLines(reg), text = L.join("\n");
    ok("!! a registered run: the header (24 ids of 240 s, 'negative = the memory helps', the rounding 1e-5), the CHECK block with three lines, then the pooled table (48 ids, the registered reading), the new ids alone, the first ids alone, the bottom line and the ids figure", /^paired test of the memory, replication: stateful minus stateless, 24 ids of 240 s in each set \(negative = the memory helps\); exact two-sided sign-flip over 2\^n assignments, counted over the differences rounded to 1e-5$/.test(L[0]) && L[1].startsWith("CHECK: the first set, re-flown, against the first result") && L.slice(2, 5).every((l) => /^  p[123]: re-flown -0\.\d{4}, first result -0\.\d{4}$/.test(l)) && /POOLED, 48 ids \(THE REGISTERED READING\)/.test(text) && /the rep- ids alone \(reported\)/.test(text) && /the mem- ids alone \(reported\)/.test(text) && (text.match(/^VERDICT: /gm) || []).length === 3 && /\nBOTTOM LINE ON P3: THE MEMORY HELPS MORE IN THE DARK \(48 IDS\)\n\(figure, not a test: a mean of -0\.05 with this sd, 0\.0\d{3}, reaches p 0\.05 at about \d+ ids\)$/.test(text));
    ok("!! the table lines: the mean to four places, 'ids better' as k/n, the exact p (2/2^48 = 7.1e-15 for 48 of one sign), HOLDS on a test that holds; the pooled means are -0.0600, -0.1000, -0.0900 and the figure of ids is printed from the pooled P3 sd (0.0138: about 1 id)", /\nP1  settled error, compass lit, no event \| +-0\.0600 \| [0-9.]+ \| [0-9.]+ \| +48\/48 \| 7\.1e-15   HOLDS/.test(text) && /\nP2  settled error, DARK windows {8}\| +-0\.1000 \|/.test(text) && /\nP3  dark beyond lit \(difference of differences\) \| +-0\.0900 \|/.test(text) && /this sd, 0\.0138, reaches p 0\.05 at about 1 ids\)$/.test(text) && /\| +24\/24 \| 1\.2e-7   HOLDS/.test(text));
    const iP = L.indexOf("POOLED, 48 ids (THE REGISTERED READING)");
    ok("!! the pooled block line for line: a blank line, the title, the column heads, then P1, P2 and P3 with the mean to 10 places wide, the sd, the se, 'k/n' to 10, the exact p (7.1e-15 = 2 / 2^48) and HOLDS; the label overruns its 38 columns on P3 and the columns follow", iP === 6 && L[5] === "" && L[iP + 1] === "test                                   |  mean diff | sd     | se     | ids better | exact p" && L[iP + 2] === "P1  settled error, compass lit, no event |    -0.0600 | 0.0047 | 0.0007 |      48/48 | 7.1e-15   HOLDS" && L[iP + 3] === "P2  settled error, DARK windows        |    -0.1000 | 0.0372 | 0.0054 |      48/48 | 7.1e-15   HOLDS" && L[iP + 4] === "P3  dark beyond lit (difference of differences) |    -0.0900 | 0.0138 | 0.0020 |      48/48 | 7.1e-15   HOLDS" && L[iP + 5] === "VERDICT: MEMORY HELPS MORE IN THE DARK");
    const mid = R.reportLines(R.run({ ids: 5, seconds: 60 }, standIn({ "rep-": { p1: [0.1, 0.1, 0.1, 0.1, -0.1], p2: [0.1, 0.1, 0.1, 0.1, -0.1], p3: [-0.1, 0.1, 0.1, 0.1, 0.1] }, "mem-": FIRST })));
    ok("!! a p that is not tiny prints to four places and a test that does not hold has no marker: five differences of four plus and one minus (|sum| 0.3 of 32 assignments, 12 reach it): p 0.3750, mean 0.0600, sd 0.0894, se 0.0400, one better of five, no HOLDS", mid.includes("P1  settled error, compass lit, no event |     0.0600 | 0.0894 | 0.0400 |        1/5 | 0.3750") && mid.includes("P3  dark beyond lit (difference of differences) |     0.0600 | 0.0894 | 0.0400 |        1/5 | 0.3750") && !mid.some((l) => /HOLDS/.test(l)));
    const failed = R.reportLines(R.run({}, standIn({ "rep-": FIRST, "mem-": { ...FIRST, p1: eq(24, -0.2) } })));
    ok("!! a failed check stops after its lines with the MISMATCH marked and 'the pooled reading is NOT made': no table, no bottom line", /MISMATCH/.test(failed.join("\n")) && failed[failed.length - 1] === "THE CHECK FAILED: the code or the tank has changed since the first result; the pooled reading is NOT made" && !failed.some((l) => /^VERDICT|BOTTOM LINE|POOLED/.test(l)));
    const sm = R.reportLines(R.run({ ids: 5, seconds: 60 }, standIn({ "rep-": { p1: eq(5, -0.2), p2: eq(5, -0.3), p3: eq(5, -0.4) }, "mem-": FIRST })));
    ok("!! a smoke run says so ('SMOKE RUN: 5 ids of 60 s is not the registered 24 of 240; no check and no verdict are made'), prints only the new ids' table, no check and no bottom line", sm.some((l) => l === "SMOKE RUN: 5 ids of 60 s is not the registered 24 of 240; no check and no verdict are made") && !sm.some((l) => /CHECK|BOTTOM LINE|POOLED/.test(l)) && sm.some((l) => /the rep- ids alone/.test(l)));
}

sec("8. THE COMMAND");
{
    const go = (argv, bench) => { const out = [], errs = []; const code = R.main(argv, { print: (t) => out.push(t), err: (t) => errs.push(t), bench }); return { code, out, errs }; };
    const bad = go(["--bogus", "1"]);
    ok("!! an unknown flag is exit 1 with the usage line and the flag named, nothing flown", bad.code === 1 && bad.errs[0] === "usage: node tools/ship/tankPairedReplicate.mjs [--ids 24] [--seconds 240]   (not understood: --bogus)" && bad.out.length === 0);
    const never = () => { throw new Error("flown"); };
    ok("!! ids must be a whole number from 2 to 26 (1, 27, 3.5, abc, none are refused; 2 and 26 are taken) and seconds from 40 to 600 (39 and 601 refused; 40 and 600 taken)", ["1", "27", "3.5", "abc", undefined].every((v) => go(["--ids", ...(v === undefined ? [] : [v])], never).code === 1) && ["39", "601", "x"].every((v) => go(["--seconds", v], never).code === 1) && go(["--ids", "27"], never).errs[0] === "usage: node tools/ship/tankPairedReplicate.mjs [--ids 24] [--seconds 240]   (--ids is a whole number from 2 to 26, got 27)" && go(["--seconds", "39"], never).errs[0] === "usage: node tools/ship/tankPairedReplicate.mjs [--ids 24] [--seconds 240]   (--seconds is a whole number from 40 to 600, got 39)" && go(["--ids"], never).errs[0] === "usage: node tools/ship/tankPairedReplicate.mjs [--ids 24] [--seconds 240]   (--ids is a whole number from 2 to 26, got undefined)" && go(["--ids", "2", "--seconds", "40"], standIn({ "rep-": { p1: eq(2, -1), p2: eq(2, -1), p3: eq(2, -1) }, "mem-": { p1: eq(2, -1), p2: eq(2, -1), p3: eq(2, -1) } })).code === 0 && go(["--ids", "26", "--seconds", "600"], standIn({ "rep-": { p1: eq(26, -1), p2: eq(26, -1), p3: eq(26, -1) }, "mem-": { p1: eq(26, -1), p2: eq(26, -1), p3: eq(26, -1) } })).code === 0);
    const si = standIn({ "rep-": REP, "mem-": FIRST }), ok1 = go([], si);
    ok("!! no flags: the registered run, 24 ids of 240 s, exit 0, the report printed once and ending in a newline", ok1.code === 0 && si.calls.length === 2 && si.calls[0].ids === 24 && si.calls[0].seconds === 240 && ok1.out.length === 1 && ok1.out[0].endsWith("\n") && /BOTTOM LINE ON P3/.test(ok1.out[0]));
    const fail2 = go([], standIn({ "rep-": FIRST, "mem-": { ...FIRST, p3: eq(24, -0.2) } }));
    ok("!! a registered run whose check fails is exit 2 (and still prints its lines); a smoke run whose 'check' would fail is exit 0", fail2.code === 2 && /THE CHECK FAILED/.test(fail2.out[0]) && go(["--ids", "5", "--seconds", "60"], standIn({ "rep-": { p1: eq(5, -1), p2: eq(5, -1), p3: eq(5, -1) }, "mem-": { p1: eq(5, -1), p2: eq(5, -1), p3: eq(5, -1) } })).code === 0);
    const sm = standIn({ "rep-": { p1: eq(7, -1), p2: eq(7, -1), p3: eq(7, -1) }, "mem-": { p1: eq(7, -1), p2: eq(7, -1), p3: eq(7, -1) } });
    go(["--seconds", "90", "--ids", "7"], sm);
    ok("!! the flags reach the flights in either order (7 ids of 90 s)", sm.calls.length === 2 && sm.calls.every((c) => c.ids === 7 && c.seconds === 90));
}

sec("8b. AS A PROGRAM");
{
    const file = path.join(HERE, "tankPairedReplicate.mjs"), spawn = (args, extra = []) => spawnSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", ...extra, file, ...args], { encoding: "utf8", timeout: 120000 });
    const c1 = spawn(["--bogus", "1"]), c2 = spawn(["--ids", "2", "--seconds", "40"]);
    const c3 = spawnSync(process.execPath, ["--preserve-symlinks", "--preserve-symlinks-main", "--input-type=module", "-e", `import("${new URL("./tankPairedReplicate.mjs", import.meta.url).href}").then((m) => console.log(typeof m.main))`], { encoding: "utf8", timeout: 120000 });
    ok("!! as a program: a bad flag is exit 1 with the usage line on stderr and nothing on stdout; a smoke run (2 ids of 40 s, real flights) is exit 0 and prints 'SMOKE RUN: 2 ids of 40 s is not the registered 24 of 240'; imported by `node -e` it does nothing by itself (prints function)", c1.status === 1 && c1.stderr === "usage: node tools/ship/tankPairedReplicate.mjs [--ids 24] [--seconds 240]   (not understood: --bogus)\n" && c1.stdout === "" && c2.status === 0 && /SMOKE RUN: 2 ids of 40 s is not the registered 24 of 240; no check and no verdict are made/.test(c2.stdout) && c3.status === 0 && c3.stdout.trim() === "function", `${c1.status} ${c2.status} ${c3.status} ${c2.stderr.slice(0, 100)}`);
}

sec("9. THE SOURCE");
{
    const raw = fs.readFileSync(path.join(HERE, "tankPairedReplicate.mjs"), "utf8"), code = raw.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/**")).join("\n");
    ok("!! no Math.random, no clock, no DOM, no file, no network", !/Math\.random|Date\.now|new Date|performance\.now|document\.|window\.|\bfs\b|node:fs|fetch\(/.test(code));
    ok("!! the imports: path, url and the bench, and nothing else", J([...code.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1]).sort()) === J(["../tankFlyCxBench.mjs", "node:path", "node:url"]));
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
process.exitCode = fails ? 1 : 0;
