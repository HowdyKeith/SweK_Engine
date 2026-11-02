// WebGLEngine/tools/ship/plannerMeta-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerMeta-selfcheck.mjs      (about 0.3 s: pure arithmetic on hand fixtures)
//
// THE GATE OF tools/ship/plannerMeta.mjs (Round 19 of brain/NEEDS_AND_LIMITS.md, registered first, part of its data already read and said so).
//   1 CONSTANTS  the 12 blocks (Round 12 as one, ten sets of 96 dives from the arm files of Rounds 13-17, and Round 17's third), where each is read from, Round 12's reported numbers.
//   2 CHI-SQUARE ln Gamma and the upper-tail probability against known values: the 5 percent critical values on 1, 2, 3 and 11 degrees of freedom, the closed form on 2 (exp(-x/2)), erfc on 1, 0 at x = 0.
//   3 BLOCKS     a block's mean and standard error from per-dive scores; mismatched dives are refused; one kind.
//   4 META       Q, df, p, I-squared, tau-squared, the random-effects mean and se, the inflation factor and the leave-one-out range on two hand-worked fixtures; the refusals.
//   5 LINES      the three bottom lines in all their cases.
//   6 CHECKS     the count, the sizes, the standard errors.
//   7 REPORT     the lines.
//   8 SOURCE     no clock, random or file.
// NOT CHECKED, said plainly: whether the twin's gain varies between seed blocks (that is the analysis).
// SABOTAGE LOG (63 mutants of tools/ship/plannerMeta.mjs, run against a copy of this gate): 7 went 0 red on the first pass; 3 got rows -- a length mismatch refused with its own message, the fixed-effect se using the fixed weights when tau is not 0, and a far or both list of one block being skipped (a one-block analysis is refused). FOUR are EQUIVALENT and said so: `x <= 0` against `x < 0` in the incomplete gamma (at x = 0 the series branch also returns 1), the switch between the series and the continued fraction at a against a + 1 (the two agree where they overlap), `m.p <= P_LEVEL` against `<` and `inflation >= 1.2` against `>` (float boundaries that no data reaches exactly; the rows pin the cases either side). All 63 are red or said above.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as X from "./plannerMeta.mjs";
console.log("plannerMeta-selfcheck -- the Round 19 meta-analysis\n");
const code = fs.readFileSync(new URL("./plannerMeta.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

sec("1. CONSTANTS");
{
    ok("!! twelve blocks: Round 12 as one, two sets each of Rounds 13-16 and three of Round 17", X.BLOCK_COUNT === 12 && J(X.SOURCES.map((s) => s.round)) === J(["R13", "R14", "R15", "R16", "R17"]) && J(X.SOURCES.map((s) => s.sets.length)) === J([2, 2, 2, 2, 3]));
    ok("!! each source's directory and arm names are the ones the rounds wrote", J(X.SOURCES.map((s) => [s.dir, s.twin, s.tuned])) === J([["tolerance-arms", "TWIN-EXACT", "TUNED-R8"], ["budget-arms", "TWIN-FULL", "TUNED-R8"], ["noise-arms", "TWIN-FULL@0.1", "TUNED-R8@0.1"], ["stations-arms", "TWIN-FULL@3", "TUNED-R8@3"], ["events-arms", "TWIN-FULL", "TUNED-R8"]]) && J(X.SOURCES.map((s) => s.sets)) === J([["V1", "V2"], ["W1", "W2"], ["U1", "U2"], ["T1", "T2"], ["S1", "S2", "S3"]]));
    ok("!! Round 12's block is its report: 288 dives, +0.0214, se 0.0040; far +0.0312 (se 0.0068) and both +0.0115 (se 0.0040)", X.ROUND12.n === 288 && X.ROUND12.mean === 0.0214 && X.ROUND12.se === 0.004 && X.ROUND12.far.mean === 0.0312 && X.ROUND12.far.se === 0.0068 && X.ROUND12.both.mean === 0.0115 && X.ROUND12.both.se === 0.004 && X.ROUND12.name === "R12:Z1-Z3");
    ok("!! the levels are the registered ones: 2 se, p 0.05, the inflation limit 1.2", X.SE_FACTOR === 2 && X.P_LEVEL === 0.05 && X.INFLATION_LIMIT === 1.2);
}
sec("2. CHI-SQUARE");
{
    const q = X.chi2Upper;
    ok("!! the 5 percent critical values: 3.841 on 1 df, 5.991 on 2, 7.815 on 3 and 19.675 on 11 each give 0.050", [[3.841, 1], [5.991, 2], [7.815, 3], [19.675, 11]].every(([x, d]) => near(q(x, d), 0.05, 1e-4)));
    ok("!! on 2 df the tail is exp(-x/2) exactly, over a range of x", [0.5, 1, 2, 5, 10, 25].every((x) => near(q(x, 2), Math.exp(-x / 2), 1e-12)));
    ok("!! on 1 df, x = 8 gives erfc(2) = 0.004678; on 3 df, x = 10.1 gives 0.0177", near(q(8, 1), 0.00467773, 1e-7) && near(q(10.1, 3), 0.0177, 1e-4));
    ok("!! x = 0 is probability 1; the tail falls as x grows (strictly), rises with df, and stays inside [0, 1]", q(0, 4) === 1 && q(-3, 4) === 1 && q(1, 5) > q(2, 5) && q(2, 5) > q(30, 5) && q(10, 3) < q(10, 8) && q(500, 5) >= 0 && q(500, 5) < 1e-50);
    ok("!! ln Gamma: Gamma(5) = 24, Gamma(0.5) = sqrt(pi), Gamma(1) = Gamma(2) = 1", near(Math.exp(X.lnGamma(5)), 24, 1e-8) && near(Math.exp(X.lnGamma(0.5)), Math.sqrt(Math.PI), 1e-8) && near(X.lnGamma(1), 0, 1e-8) && near(X.lnGamma(2), 0, 1e-8));
    ok("!! both branches of the incomplete gamma agree around their switch (x = a + 1): the tail is continuous there", near(X.gammaQ(3, 3.999), X.gammaQ(3, 4.001), 5e-3) && X.gammaQ(3, 3.999) > X.gammaQ(3, 4.001));
}
sec("3. BLOCKS");
{
    const mk = (scores, kinds) => scores.map((score, i) => ({ score, kind: kinds[i] }));
    const kinds = ["far", "both", "far", "both"], tuned = mk([0.5, 0.5, 0.5, 0.5], kinds), twin = mk([0.6, 0.5, 0.7, 0.4], kinds);
    const b = X.blockOf(twin, tuned), d = [0.1, 0, 0.2, -0.1], m = 0.05, se = Math.sqrt(d.reduce((a, x) => a + (x - m) ** 2, 0) / 3 / 4);
    ok("!! a block is n, the mean of twin minus tuned and the standard error of that paired mean (n - 1 in the variance)", b.n === 4 && near(b.mean, 0.05) && near(b.se, se));
    ok("!! one kind: far is dives 0 and 2 (mean +0.15, n 2), both dives 1 and 3 (mean -0.05)", X.blockOf(twin, tuned, "far").n === 2 && near(X.blockOf(twin, tuned, "far").mean, 0.15) && near(X.blockOf(twin, tuned, "both").mean, -0.05));
    const thr = (f) => { try { f(); return false; } catch { return true; } }, msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! a length mismatch is refused with its own message (4 twin dives against 3 tuned dives), a kind mismatch with its own (dive 1 is both for the twin and far for the tuned rule)", /4 twin dives against 3 tuned dives/.test(msg(() => X.blockOf(twin, tuned.slice(0, 3)))) && /dive 1 is both for the twin and far for the tuned rule/.test(msg(() => X.blockOf(twin, mk([0.5, 0.5, 0.5, 0.5], ["far", "far", "far", "far"])))));
    ok("!! twin and tuned runs of different length, or in a different kind order, are refused", thr(() => X.blockOf(twin, tuned.slice(1))) && thr(() => X.blockOf(twin, mk([0.5, 0.5, 0.5, 0.5], ["far", "far", "far", "far"]))));
    ok("!! a single dive has a standard error of 0 (and meta then refuses it)", X.blockOf(mk([0.6], ["far"]), mk([0.5], ["far"])).se === 0);
}
sec("4. META");
{
    const m3 = X.meta([{ name: "a", mean: 0.01, se: 0.01 }, { name: "b", mean: 0.03, se: 0.01 }, { name: "c", mean: 0.02, se: 0.01 }]);
    ok("!! three equal-weight blocks 0.01, 0.03, 0.02: xbar 0.02, Q = 2 on 2 df, p = exp(-1), I-squared 0, tau 0", near(m3.xbar, 0.02) && near(m3.Q, 2, 1e-9) && m3.df === 2 && near(m3.p, Math.exp(-1), 1e-9) && m3.i2 === 0 && m3.tau2 === 0 && m3.k === 3);
    ok("!! with no between-block variance the random-effects mean is the fixed-effect mean and the se is 0.01/sqrt(3); the inflation factor is 1 (Q = df, never below 1)", near(m3.re, 0.02) && near(m3.reSe, 0.01 / Math.sqrt(3)) && m3.inflation === 1 && near(m3.fixedSe, 0.01 / Math.sqrt(3)));
    const m2 = X.meta([{ name: "a", mean: 0, se: 0.01 }, { name: "b", mean: 0.04, se: 0.01 }]);
    ok("!! two blocks 0 and 0.04 (se 0.01): Q = 8 on 1 df, p = erfc(2) = 0.004678, I-squared 0.875, tau-squared 0.0007", near(m2.Q, 8, 1e-9) && m2.df === 1 && near(m2.p, 0.00467773, 1e-7) && near(m2.i2, 0.875) && near(m2.tau2, 7e-4, 1e-12));
    ok("!! and the random-effects mean 0.02 with se sqrt(1/2500) = 0.02, the inflation factor sqrt(8) = 2.828", near(m2.re, 0.02) && near(m2.reSe, 0.02) && near(m2.inflation, Math.sqrt(8)));
    const un = X.meta([{ name: "a", mean: 0, se: 0.01 }, { name: "b", mean: 0.04, se: 0.02 }]);
    ok("!! the fixed-effect se uses the fixed weights even when tau is not 0: two blocks 0 and 0.04 give sqrt(1 / 20000) = 0.00707 against the random-effects 0.02", near(m2.fixedSe, Math.sqrt(1 / 20000)) && m2.reSe > m2.fixedSe * 2);
    ok("!! unequal weights: the fixed-effect mean sits nearer the more precise block (w 10000 and 2500: xbar 0.008) and the random-effects mean is pulled toward the middle (nearer 0.02)", near(un.xbar, 0.008) && un.re > un.xbar && un.re < 0.02);
    ok("!! leave-one-out: each entry is the random-effects mean of the others; with two blocks it is the other block's mean; the range is the min and max", near(m2.loo[0], 0.04) && near(m2.loo[1], 0) && m2.looMin === 0 && m2.looMax === 0.04 && m3.loo.length === 3);
    const thr = (f) => { try { f(); return false; } catch { return true; } };
    ok("!! one block, a zero standard error and a missing mean are refused", thr(() => X.meta([{ name: "a", mean: 0.1, se: 0.1 }])) && thr(() => X.meta([{ name: "a", mean: 0.1, se: 0 }, { name: "b", mean: 0.1, se: 0.1 }])) && thr(() => X.meta([{ name: "a", mean: NaN, se: 0.1 }, { name: "b", mean: 0.1, se: 0.1 }])));
    const known = X.meta([{ name: "1", mean: 0.0214, se: 0.004 }, { name: "2", mean: 0.023, se: 0.0048 }, { name: "3", mean: 0.0078, se: 0.0036 }, { name: "4", mean: 0.0211, se: 0.0046 }]);
    ok("!! the four estimates read before the registration: Q = 10.1 on 3 df, p = 0.018, random-effects mean about 0.018", near(known.Q, 10.1, 0.05) && known.df === 3 && near(known.p, 0.0178, 5e-4) && near(known.re, 0.018, 5e-4));
}
sec("5. LINES");
{
    const L = (blocks) => X.bottomLines(X.meta(blocks));
    const flat = [{ name: "a", mean: 0.02, se: 0.01 }, { name: "b", mean: 0.021, se: 0.01 }, { name: "c", mean: 0.019, se: 0.01 }];
    ok("!! consistent blocks: CONSISTENT, the estimate with its se and block count and IT IS REAL when above 2 se (0.02 against 0.0058: 3.5), the factor ABOUT RIGHT", L(flat)[0] === "THE TWIN'S GAIN IS CONSISTENT ACROSS SEED BLOCKS" && L(flat)[1] === "THE BEST ESTIMATE OF THE GAIN IS +0.0200 (se 0.0058; 3 BLOCKS), IT IS REAL" && L(flat)[2] === "THE STATED STANDARD ERRORS ARE ABOUT RIGHT");
    const wide = [{ name: "a", mean: 0, se: 0.01 }, { name: "b", mean: 0.04, se: 0.01 }];
    ok("!! blocks that disagree (Q = 8, p = 0.005): VARIES BEYOND CHANCE, and the factor line gives 2.83; the estimate 0.0200 with se 0.0200 is NOT DISTINGUISHABLE FROM ZERO", L(wide)[0] === "THE TWIN'S GAIN VARIES BETWEEN SEED BLOCKS BEYOND CHANCE" && L(wide)[1] === "THE BEST ESTIMATE OF THE GAIN IS +0.0200 (se 0.0200; 2 BLOCKS), IT IS NOT DISTINGUISHABLE FROM ZERO" && L(wide)[2] === "THE STATED STANDARD ERRORS ARE TOO SMALL BY A FACTOR OF 2.83");
    ok("!! a negative estimate is printed with its minus and is not REAL", /IS -0\.0[0-9]{3} /.test(L([{ name: "a", mean: -0.02, se: 0.005 }, { name: "b", mean: -0.021, se: 0.005 }])[1]) && /NOT DISTINGUISHABLE/.test(L([{ name: "a", mean: -0.02, se: 0.005 }, { name: "b", mean: -0.021, se: 0.005 }])[1]));
    const mild = [{ name: "a", mean: 0.016, se: 0.01 }, { name: "b", mean: 0.024, se: 0.01 }];
    ok("!! p exactly at the level is not 'beyond chance' (the test is p below 0.05) and a factor of 1.2 or under is ABOUT RIGHT: Q = 0.32 here, p 0.57, factor 1", L(mild)[0] === "THE TWIN'S GAIN IS CONSISTENT ACROSS SEED BLOCKS" && L(mild)[2] === "THE STATED STANDARD ERRORS ARE ABOUT RIGHT");
    const at = (Q) => { const d = Math.sqrt(Q / 5000); return X.bottomLines(X.meta([{ name: "a", mean: 0, se: 0.01 }, { name: "b", mean: d, se: 0.01 }]))[2]; };
    ok("!! the factor line: Q = 1.3225 on 1 df (factor 1.15) is ABOUT RIGHT, Q = 1.5625 (factor 1.25) is TOO SMALL BY A FACTOR OF 1.25, Q = 4.26 names its factor", at(1.3225) === "THE STATED STANDARD ERRORS ARE ABOUT RIGHT" && at(1.5625) === "THE STATED STANDARD ERRORS ARE TOO SMALL BY A FACTOR OF 1.25" && /OF 2\.06$/.test(at(4.2436)));
}
sec("6. CHECKS");
{
    const good = [{ name: X.ROUND12.name, n: 288, mean: 0.02, se: 0.004 }, ...Array.from({ length: 11 }, (_, i) => ({ name: "b" + i, n: 96, mean: 0.02, se: 0.005 }))];
    ok("!! three check rows on a clean set of twelve blocks: BLOCK COUNT, BLOCK SIZE, STANDARD ERRORS, all passing", J(X.checksOf(good).map((c) => c.name)) === J(["BLOCK COUNT", "BLOCK SIZE", "STANDARD ERRORS"]) && X.checksOf(good).every((c) => c.ok));
    ok("!! eleven blocks break BLOCK COUNT only; a block of 95 dives breaks BLOCK SIZE only (Round 12's 288 is exempt by name); a zero standard error breaks STANDARD ERRORS only", J(X.checksOf(good.slice(1)).filter((c) => !c.ok).map((c) => c.name)) === J(["BLOCK COUNT"]) && J(X.checksOf(good.map((b, i) => (i === 3 ? { ...b, n: 95 } : b))).filter((c) => !c.ok).map((c) => c.name)) === J(["BLOCK SIZE"]) && J(X.checksOf(good.map((b, i) => (i === 2 ? { ...b, se: 0 } : b))).filter((c) => !c.ok).map((c) => c.name)) === J(["STANDARD ERRORS"]));
}
sec("7. REPORT");
{
    const blocks = [{ name: X.ROUND12.name, n: 288, mean: 0.0214, se: 0.004 }, ...Array.from({ length: 11 }, (_, i) => ({ name: "b" + i, n: 96, mean: [0.023, 0.007, 0.021, 0.02, 0.018, 0.02, 0.019, 0.022, 0.017, 0.021, 0.02][i], se: 0.005 }))];
    const L = X.report(blocks, { far: blocks.slice(0, 4), both: blocks.slice(0, 5) }), txt = L.join("\n");
    ok("!! the head says twelve blocks and NO NEW DIVE; the three checks pass first", /^ROUND 19: .* 12 blocks .*NO NEW DIVE/.test(L[0]) && L.slice(1, 4).every((l) => /^  PASS /.test(l)));
    ok("!! one row per block with its dives, estimate, se and its share of the weight (the shares sum to 100)", (txt.match(/^  (R12:Z1-Z3|b[0-9]+) +n +[0-9]+  [+-]0\.[0-9]{4} \(se 0\.[0-9]{4}\)  weight [0-9.]+%$/gm) || []).length === 12 && Math.abs((txt.match(/weight ([0-9.]+)%/g) || []).map((x) => parseFloat(x.slice(7))).reduce((a, b) => a + b, 0) - 100) < 0.6);
    ok("!! the fixed-effect line, the Q line with p, I-squared and tau, the random-effects line with the leave-one-out range and the inflation factor", /fixed-effect mean \+0\.0[0-9]+ \(se 0\.00[0-9]+\)/.test(txt) && /Q [0-9.]+ on 11 df, p [0-9.]+; I-squared [0-9]+%; tau [0-9.]+/.test(txt) && /random-effects mean \+0\.0[0-9]+ \(se [0-9.]+\); leave-one-block-out range \+0\.0[0-9]+ to \+0\.0[0-9]+; inflation factor [0-9.]+/.test(txt));
    ok("!! the far and both lines, each with its block count and its own statistic (four blocks, five blocks)", /far alone \(4 blocks\): random-effects \+0\.0[0-9]+ \(se [0-9.]+\); Q [0-9.]+ on 3 df/.test(txt) && /both alone \(5 blocks\): random-effects \+0\.0[0-9]+ \(se [0-9.]+\); Q [0-9.]+ on 4 df/.test(txt));
    ok("!! the three bottom lines come last, each prefixed BOTTOM LINE:", L.slice(-3).every((l) => l.startsWith("BOTTOM LINE: ")) && /^BOTTOM LINE: THE TWIN'S GAIN/.test(L[L.length - 3]) && /BEST ESTIMATE/.test(L[L.length - 2]) && /STANDARD ERRORS/.test(L[L.length - 1]));
    const bad = X.report(blocks.slice(1));
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", /^  FAIL BLOCK COUNT/m.test(bad.join("\n")) && bad.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && bad[bad.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && bad.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
    ok("!! a far or both list with ONE block is skipped, not analysed (a meta-analysis of one block is refused, so the report must not try)", !/alone/.test(X.report(blocks, { far: blocks.slice(0, 1), both: blocks.slice(0, 1) }).join("\n")));
    ok("!! with no far or both blocks handed in the two lines are absent", !/alone/.test(X.report(blocks).join("\n")));
}
sec("8. SOURCE");
{
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
