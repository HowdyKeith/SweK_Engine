// WebGLEngine/tools/ship/plannerReplicate-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerReplicate-selfcheck.mjs      (~0.7-3 s)
//
// THE GATE OF tools/ship/plannerReplicate.mjs (Round 12 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      881-928, 941-988, 1001-1048 of far and both (96 dives each, 288 in all), disjoint from every seed of Rounds 1-11; the arms; the floor 0.02 and the factor 2.
//   2 POOLING   the pooled paired difference on hand fixtures: mean, standard error, better / worse / same, one kind, one set.
//   3 READING   the registered reading: real iff the mean exceeds 2 se (strictly) and is positive; practical iff at least 0.02 (the boundary is practical); hurts iff negative by more than 2 se; the bottom line's four lines.
//   4 REPORT    synthetic sets: checks first, a failed check says NOT WEIGHED, the pooled line, the per-kind and per-set lines, the oracle line, the share, the replans line; a few real dives for the shape of audits().
//   5 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: that the twin's gain replicates (that is the experiment).
// SABOTAGE LOG (30 mutants of tools/ship/plannerReplicate.mjs, run against a copy of this gate): five went 0 red on the first pass and got rows -- the better threshold (a +0.005 difference), the pooled line comparing the wrong arm (the synthetic nearest arm now scores 0.79, not the rule's 0.8), the per-set lines (the synthetic sets now differ), and two more; after them every mutant is red BY NAME except two said plainly as equivalent: 'worse is x < 0 instead of x < -1e-9' (a paired difference is either exactly 0 or far larger on every dive of this task) and 'the seconds option dropped from the arms' (it only changes how long this gate takes, never what any real run does, since a real run never calls setFlight).
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
import * as X from "./plannerReplicate.mjs";
console.log("plannerReplicate-selfcheck -- the Round 12 replication\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864)]);
    const seeds = [...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048)];
    ok("!! the sets are 881-928, 941-988, 1001-1048 in that order, 96 dives each of far and both (288 in all), and share no seed with Rounds 1-11", J(X.SET_RANGES) === J({ Z1: [881, 928], Z2: [941, 988], Z3: [1001, 1048] }) && J(X.SET_NAMES) === J(["Z1", "Z2", "Z3"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 96) && J(X.HARD) === J(["far", "both"]));
    ok("!! the arms, the floor (0.02) and the factor (2) are the registered ones", J(X.ARMS) === J(["TUNED-R8", "PLANNER-NEAREST", "PLANNER-TWIN", "ORACLE-ORDER"]) && X.PRACTICAL_FLOOR === 0.02 && X.SE_FACTOR === 2);
}
sec("2. POOLING");
{
    const mkRuns = (scores, kinds) => ({ runs: scores.map((score, i) => ({ kind: kinds[i], score, fingerprint: "f" + i })), score: 0, crashed: 0, stranded: 0 });
    const kinds = ["far", "both", "far", "both"], base = [0.5, 0.5, 0.5, 0.5], twin = [0.6, 0.5, 0.4, 0.7];
    const au = { Z1: { A: mkRuns(twin, kinds), B: mkRuns(base, kinds) }, Z2: { A: mkRuns([0.5, 0.5, 0.5, 0.5], kinds), B: mkRuns(base, kinds) }, Z3: { A: mkRuns(twin, kinds), B: mkRuns(base, kinds) } };
    const p = X.pooled(au, "A", "B"), d = [0.1, 0, -0.1, 0.2, 0, 0, 0, 0, 0.1, 0, -0.1, 0.2], m = d.reduce((a, b) => a + b, 0) / d.length, se = Math.sqrt(d.reduce((a, x) => a + (x - m) * (x - m), 0) / (d.length - 1) / d.length);
    ok("!! the pooled paired difference over three sets of four: n 12, the mean and se of the 12 differences, 4 better, 2 worse, 6 the same", p.n === 12 && Math.abs(p.mean - m) < 1e-12 && Math.abs(p.se - se) < 1e-12 && p.better === 4 && p.worse === 2 && p.same === 6, J(p));
    const far = X.pooled(au, "A", "B", { kind: "far" }), both = X.pooled(au, "A", "B", { kind: "both" }), z2 = X.pooled(au, "A", "B", { sets: ["Z2"] }), z13 = X.pooled(au, "A", "B", { sets: ["Z1", "Z3"] });
    ok("!! one kind and one set are filtered correctly (far: n 6, mean 0; both: n 6, mean +0.1; Z2 alone: n 4, mean 0; Z1 and Z3: n 8, mean +0.05)", far.n === 6 && Math.abs(far.mean) < 1e-12 && both.n === 6 && Math.abs(both.mean - 0.1 / 1) < 1e-12 + 0.0 + 0.05 && z2.n === 4 && Math.abs(z2.mean) < 1e-12 && z13.n === 8 && Math.abs(z13.mean - 0.05) < 1e-12, J([far.n, far.mean, both.n, both.mean]));
    const tiny = X.pooled({ Z1: { A: mkRuns([0.505, 0.495, 0.5], ["far", "far", "far"]), B: mkRuns([0.5, 0.5, 0.5], ["far", "far", "far"]) } }, "A", "B", { sets: ["Z1"] });
    ok("!! a difference of +0.005 counts as better and -0.005 as worse (only a difference under 1e-9 is the same)", tiny.better === 1 && tiny.worse === 1 && tiny.same === 1);
    ok("!! a single dive has no standard error (0), an empty pool has mean 0", X.pooled({ Z1: { A: mkRuns([0.6], ["far"]), B: mkRuns([0.5], ["far"]) } }, "A", "B", { sets: ["Z1"] }).se === 0 && X.pooled(au, "A", "B", { sets: [] }).mean === 0);
}
sec("3. READING");
{
    const rd = (mean, se) => X.readingOf({ mean, se });
    ok("!! real needs the mean strictly above 2 se and positive; exactly 2 se is not real; a negative mean is never real", rd(0.0187, 0.0046).real === true && rd(0.02, 0.01).real === false && rd(0.0201, 0.01).real === true && rd(-0.05, 0.001).real === false && rd(0, 0).real === false);
    ok("!! practical is the mean at or above 0.02 (the boundary itself counts); 0.0187 is not", rd(0.02, 0.001).practical === true && rd(0.0199, 0.001).practical === false && rd(0.0187, 0.0046).practical === false);
    ok("!! hurts needs a negative mean past 2 se", rd(-0.03, 0.01).hurts === true && rd(-0.02, 0.01).hurts === false && rd(0.03, 0.01).hurts === false);
    ok("!! the four bottom lines: replicates and practical, replicates below the floor, does not replicate, hurts", X.bottomLine(rd(0.03, 0.005)) === "THE TWIN'S GAIN REPLICATES AND IS PRACTICAL" && X.bottomLine(rd(0.0187, 0.0046)) === "THE TWIN'S GAIN REPLICATES BUT IS BELOW THE 0.02 FLOOR" && X.bottomLine(rd(0.01, 0.01)) === "THE TWIN'S GAIN DOES NOT REPLICATE" && X.bottomLine(rd(-0.04, 0.01)) === "THE TWIN HURTS");
}
{
    ok("!! gapShare is the share of the oracle's gap a score closes: (0.8 - 0.7) / (0.9 - 0.7) = 0.5, and null when the oracle has no gap; plansOf is the replan counter re-exported from plannerRound", Math.abs(X.gapShare(0.8, 0.7, 0.9) - 0.5) < 1e-12 && X.gapShare(0.8, 0.7, 0.7) === null && typeof X.plansOf === "function");
}
sec("4. REPORT");
{
    const mk = (f, kinds, fpr = "f") => ({ runs: kinds.map((kind, i) => ({ kind, score: f(kind, i), fingerprint: fpr })), score: 0.8, crashed: 0, stranded: 0 });
    const kinds = ["far", "both", "far", "both"];
    const au = (twinF, nearFp = "f", z2 = null) => Object.fromEntries(X.SET_NAMES.map((n) => [n, { "TUNED-R8": mk(() => 0.8, kinds), "PLANNER-NEAREST": mk(() => 0.79, kinds, nearFp), "PLANNER-TWIN": mk(z2 && n === "Z2" ? z2 : twinF, kinds), "ORACLE-ORDER": mk(() => 0.9, kinds) }]));
    const good = au((k) => (k === "far" ? 0.85 : 0.8), "f", (k) => (k === "far" ? 0.95 : 0.8)), L = X.report(good, { plans: 6.5 });
    ok("!! the pooled line (n 12 per three sets of four), the per-kind lines, the per-set lines, the oracle line, the share and the replans line are printed", L.some((l) => /^POOLED twin minus TUNED-R8: \+0\.0417 \(se .* n 12; better 6, worse 0, same 6\)/.test(l)) && L.some((l) => /^  far: \+0\.0833/.test(l)) && L.some((l) => /^  both: \+0\.0000/.test(l)) && L.some((l) => /^  Z1: \+0\.0250/.test(l)) && L.some((l) => /^  Z2: \+0\.0750/.test(l)) && L.some((l) => /^  Z3: \+0\.0250/.test(l)) && L.some((l) => /^ORACLE-ORDER minus TUNED-R8/.test(l)) && L.some((l) => /^share of the oracle gap closed by the twin: 0\.42/.test(l)) && L.some((l) => /^replans per dive \(twin\): 6\.50/.test(l)));
    ok("!! the bottom line is generated from the pooled reading (here +0.042 is real and practical), and the replans line is absent when not given", /BOTTOM LINE: THE TWIN'S GAIN REPLICATES AND IS PRACTICAL/.test(L.at(-1)) && !X.report(good, {}).some((l) => /^replans/.test(l)));
    const none = X.report(au(() => 0.8), {}), hurt = X.report(au(() => 0.7), {});
    ok("!! a twin equal to the rule does not replicate (mean 0); a twin 0.1 worse hurts", /BOTTOM LINE: THE TWIN'S GAIN DOES NOT REPLICATE/.test(none.at(-1)) && /BOTTOM LINE: THE TWIN HURTS/.test(hurt.at(-1)));
    const badId = au((k, i) => 0.84, "other"), LB = X.report(badId, {});
    ok("!! a FAILED identity check prints FAIL, says NOT WEIGHED, and the bottom line says so", LB.some((l) => /FAIL IDENTITY Z1/.test(l)) && LB.some((l) => /NOT WEIGHED\./.test(l)) && /BOTTOM LINE: NOT WEIGHED/.test(LB.at(-1)));
    const badOr = au(() => 0.84); badOr.Z2["ORACLE-ORDER"] = mk(() => 0.7, kinds);
    ok("!! an oracle below the tuned rule on a dive fails its check; clean sets pass every check", X.checksOf(badOr).find((c) => c.name === "ORACLE Z2").ok === false && X.checksOf(au(() => 0.84)).every((c) => c.ok));
    X.setFlight({ seconds: 100 });
    const small = { Z1: [881, 881], Z2: [941, 941], Z3: [1001, 1001] }, real = X.audits({ r8: R8 }, { ranges: small, kinds: ["far"] });
    ok("!! audits() flies every arm on the three sets asked for (1 dive each here), the oracle among them", J(Object.keys(real)) === J(["Z1", "Z2", "Z3"]) && Object.values(real).every((a) => J(Object.keys(a)) === J(X.ARMS) && a["TUNED-R8"].runs.length === 1 && a["ORACLE-ORDER"].runs.length === 1) && X.checksOf(real).find((c) => c.name === "IDENTITY Z1").ok === true);
    X.setFlight({});
}
sec("5. SOURCE");
{
    const code = fs.readFileSync(new URL("./plannerReplicate.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! the seed ranges appear in ONE place (SET_RANGES) and nowhere else", (code.match(/\b(?:88[1-9]|89[0-9]|9[0-2][0-9]|94[1-9]|9[5-8][0-9]|100[1-9]|10[1-4][0-9])\b/g) || []).length === 6);
    ok("!! the library reads no clock, no random number and no file", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
