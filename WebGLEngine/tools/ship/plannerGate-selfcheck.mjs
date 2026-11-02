// WebGLEngine/tools/ship/plannerGate-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerGate-selfcheck.mjs      (about 0.5 s: arithmetic on hand fixtures)
//
// THE GATE OF tools/ship/plannerGate.mjs (Round 21 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 CONSTANTS  the training sources (Rounds 13-17: 1,056 dives), the test source (Round 20: 192), the features, the deciles, the 2 se factor and the 70 percent keep share.
//   2 FEATURES   a scenario's nine features on a hand fixture (distances from the origin) and on a real scenario; a row's gain; the kind check.
//   3 CUTS       the decile cut points: ties collapsed, ascending; a constant feature has one cut.
//   4 CANDIDATES the order: always, never, then each feature's cuts with ">=" before "<"; the count.
//   5 THE FIT    the best rule on a fixture with a known answer (plan iff frac0 < 0.6), its mean and plan count; ties go to the earlier candidate.
//   6 THE JUDGEMENT  gated minus always-twin, gated minus tuned, always-twin minus tuned, the plan share, on hand numbers; REAL boundary; the correlation.
//   7 LINES      the two bottom lines in all their cases.
//   8 CHECKS     the counts and finiteness; a failed check says NOT WEIGHED.
//   9 REPORT     the lines.
//  10 SOURCE     no clock, random or file.
// NOT CHECKED, said plainly: whether any rule on the scenario predicts the gain (that is the analysis).
// SABOTAGE LOG (57 mutants of tools/ship/plannerGate.mjs, run against a copy of this gate): 9 went 0 red on the first pass; 8 got rows -- the decile index (floor, on eleven values), a single row's standard error, the keep rule needing a positive always-twin gain, and four about WHICH dives each step reads (the fit on the training dives, the judgement on the test dives, the optimistic bound fitted on the test dives, the correlations on the training dives: pinned with a training set whose gain is at low charge and a test set whose gain is at high spread). TWO are EQUIVALENT and said so: the spread loop starting a pair at i instead of i + 1 (the pair (i, i) has distance 0 and cannot raise a maximum) and the keep rule's >= against > at exactly 70 percent (a float boundary). All 57 are red or said above.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify, near = (a, b, t = 1e-9) => Math.abs(a - b) < t;
import * as T from "../../brain/needsTask.mjs";
import * as X from "./plannerGate.mjs";
console.log("plannerGate-selfcheck -- the Round 21 gate on the scenario\n");
const code = fs.readFileSync(new URL("./plannerGate.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");

sec("1. CONSTANTS");
{
    const dives = (s) => Object.values(s.sets).reduce((a, [x, y]) => a + 2 * (y - x + 1), 0);
    ok("!! the training sources are Rounds 13-17 in order with their directories, arm names and sets, 11 sets of 96 dives: 1,056", J(X.TRAIN.map((s) => s.round)) === J(["R13", "R14", "R15", "R16", "R17"]) && J(X.TRAIN.map((s) => [s.dir, s.twin, s.tuned])) === J([["tolerance-arms", "TWIN-EXACT", "TUNED-R8"], ["budget-arms", "TWIN-FULL", "TUNED-R8"], ["noise-arms", "TWIN-FULL@0.1", "TUNED-R8@0.1"], ["stations-arms", "TWIN-FULL@3", "TUNED-R8@3"], ["events-arms", "TWIN-FULL", "TUNED-R8"]]) && X.TRAIN.reduce((a, s) => a + dives(s), 0) === 1056 && X.TRAIN_COUNT === 1056 && J(X.TRAIN.map((s) => Object.keys(s.sets))) === J([["V1", "V2"], ["W1", "W2"], ["U1", "U2"], ["T1", "T2"], ["S1", "S2", "S3"]]));
    ok("!! the training seed ranges are the rounds' own", J(X.TRAIN.map((s) => Object.values(s.sets))) === J([[[1101, 1148], [1161, 1208]], [[1221, 1268], [1281, 1328]], [[1341, 1388], [1401, 1448]], [[1461, 1508], [1521, 1568]], [[1601, 1648], [1661, 1708], [1721, 1768]]]));
    ok("!! the test source is Round 20: R1 2201-2248, R2 2261-2308, all four kinds read kind-major, only far and both used: 192", X.TEST.round === "R20" && X.TEST.dir === "easy-arms" && J(X.TEST.sets) === J({ R1: [2201, 2248], R2: [2261, 2308] }) && J(X.TEST.kinds) === J(["plain", "deep", "far", "both"]) && J(X.TEST.use) === J(["far", "both"]) && X.TEST_COUNT === 192 && 2 * 2 * 48 === X.TEST_COUNT);
    ok("!! nine features in the registered order, nine deciles, the 2 se factor and the 0.7 share", J(X.FEATURES) === J(["frac0", "damage0", "depth0", "kindIsBoth", "nearest", "farthest", "spread", "deepest", "unreachable"]) && J(X.DECILES) === J([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) && X.SE_FACTOR === 2 && X.KEEP_SHARE === 0.7);
}
sec("2. FEATURES");
{
    const sc = { seed: 1, kind: "both", frac0: 0.5, damage0: 0.2, depth0: 12, stations: [{ x: 3, y: 4, depth: 10, unreachable: false }, { x: 6, y: 8, depth: 30, unreachable: true }, { x: -6, y: -8, depth: 20, unreachable: false }] };
    const f = X.featuresOf(sc);
    ok("!! on a hand fixture: frac0 0.5, damage0 0.2, depth0 12, kindIsBoth 1, nearest 5, farthest 10, spread 20 (between (6,8) and (-6,-8)), deepest 30, unreachable 1", f.frac0 === 0.5 && f.damage0 === 0.2 && f.depth0 === 12 && f.kindIsBoth === 1 && near(f.nearest, 5) && near(f.farthest, 10) && near(f.spread, 20) && f.deepest === 30 && f.unreachable === 1);
    ok("!! a far scenario has kindIsBoth 0; a scenario with one station has spread 0", X.featuresOf({ ...sc, kind: "far" }).kindIsBoth === 0 && X.featuresOf({ ...sc, stations: [sc.stations[0]] }).spread === 0);
    const real = X.featuresOf(T.scenario(1101, "far"));
    ok("!! on the real scenario far 1101: nearest 161.16, farthest 197.49, spread 338.99, deepest 15.18, no damage, none unreachable (the printed values)", near(real.nearest, 161.16308, 1e-4) && near(real.farthest, 197.49211, 1e-4) && near(real.spread, 338.99349, 1e-4) && near(real.deepest, 15.18269, 1e-4) && real.damage0 === 0 && real.unreachable === 0 && real.kindIsBoth === 0);
    const r = X.rowOf(sc, { kind: "both", score: 0.9 }, { kind: "both", score: 0.7 });
    ok("!! a row is the features, the twin's score, the tuned rule's and the gain twin minus tuned (+0.2)", near(r.gain, 0.2) && r.twin === 0.9 && r.tuned === 0.7 && r.f.nearest === f.nearest);
    const thr = (g) => { try { g(); return false; } catch { return true; } };
    ok("!! runs of the wrong kind are refused (twin or tuned)", thr(() => X.rowOf(sc, { kind: "far", score: 1 }, { kind: "both", score: 1 })) && thr(() => X.rowOf(sc, { kind: "both", score: 1 }, { kind: "far", score: 1 })));
}
// fixture A: ten rows, only frac0 varies; frac0 < 0.6 rows gain +0.1, the others -0.05; tuned 0.5 everywhere
const base = { damage0: 0, depth0: 15, kindIsBoth: 0, nearest: 100, farthest: 150, spread: 200, deepest: 20, unreachable: 0 };
const A = Array.from({ length: 10 }, (_, i) => { const frac0 = (i + 1) / 10, g = i < 5 ? 0.1 : -0.05; return { f: { ...base, frac0 }, tuned: 0.5, twin: 0.5 + g, gain: g }; });
sec("3. CUTS");
{
    const rows = Array.from({ length: 10 }, (_, i) => ({ f: { ...base, frac0: i + 1 } }));
    ok("!! ten values 1..10: the deciles at floor(q * 10) are 2..10", J(X.cutsOf(rows, "frac0")) === J([2, 3, 4, 5, 6, 7, 8, 9, 10]));
    const eleven = Array.from({ length: 11 }, (_, i) => ({ f: { ...base, frac0: i + 1 } }));
    ok("!! eleven values 1..11: the deciles are at floor(q * 11) = 1, 2, 3, 4, 5, 6, 7, 8, 9 so the cuts are 2..10 (a ceiling would give 3..11)", J(X.cutsOf(eleven, "frac0")) === J([2, 3, 4, 5, 6, 7, 8, 9, 10]));
    ok("!! a constant feature has one cut (ties collapsed); unsorted input is sorted first", J(X.cutsOf(A, "nearest")) === J([100]) && J(X.cutsOf([...rows].reverse(), "frac0")) === J([2, 3, 4, 5, 6, 7, 8, 9, 10]));
    ok("!! repeated values collapse: 1,1,1,1,1,1,1,1,1,2 gives the cuts 1 and 2", J(X.cutsOf([...Array(9)].map(() => ({ f: { ...base, frac0: 1 } })).concat([{ f: { ...base, frac0: 2 } }]), "frac0")) === J([1, 2]));
}
sec("4. CANDIDATES");
{
    const cs = X.candidates(A);
    ok("!! the order is always, never, then the features in order: frac0 first with its cuts ascending and >= before <", cs[0].name === "always" && cs[1].name === "never" && cs[2].name === "frac0 >= 0.2" && cs[3].name === "frac0 < 0.2" && cs[4].name === "frac0 >= 0.3" && cs[19].name === "frac0 < 1");
    ok("!! 36 candidates on the fixture: 2 trivial, 18 for frac0 (nine cuts), and one cut each for the other eight features (16)", cs.length === 36 && cs.filter((c) => c.feature === "frac0").length === 18 && cs.filter((c) => c.feature === "damage0").length === 2);
    ok("!! a candidate plans by its own feature and direction; always plans on everything, never on nothing", cs[2].plans({ f: { frac0: 0.2 } }) === true && cs[2].plans({ f: { frac0: 0.19 } }) === false && cs[3].plans({ f: { frac0: 0.19 } }) === true && cs[3].plans({ f: { frac0: 0.2 } }) === false && cs[0].plans({}) === true && cs[1].plans({}) === false);
}
sec("5. THE FIT");
{
    const ranked = X.fit(A), best = ranked[0];
    ok("!! the best rule on the fixture is 'frac0 < 0.6': mean 0.55 (five rows at +0.1 over a 0.5 base), planning on 5", best.rule.name === "frac0 < 0.6" && near(best.mean, 0.55) && best.plans === 5);
    const always = ranked.find((c) => c.rule.name === "always"), never = ranked.find((c) => c.rule.name === "never");
    ok("!! always planning scores 0.525 and never planning 0.5, and both rank below the best", near(always.mean, 0.525) && near(never.mean, 0.5) && ranked.indexOf(always) > 0 && ranked.indexOf(never) > ranked.indexOf(always));
    const tie = X.fit(A.map((r) => ({ ...r, twin: r.tuned, gain: 0 })));
    ok("!! with no gain anywhere every rule scores 0.5 and the tie goes to the earlier candidate: always first, then never", tie[0].rule.name === "always" && tie[1].rule.name === "never" && tie.every((c) => near(c.mean, 0.5)));
    ok("!! the ranking is by mean, descending, and the order is stable for equal means (candidates that plan on exactly the same rows keep their registered order)", ranked.every((c, i) => i === 0 || c.mean <= ranked[i - 1].mean + 1e-12) && ranked.filter((c) => near(c.mean, 0.525)).every((c, i, a) => i === 0 || c.order > a[i - 1].order));
}
sec("6. THE JUDGEMENT");
{
    const rule = X.candidates(A).find((c) => c.name === "frac0 < 0.6"), j = X.judge(rule, A);
    const manual = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return { m, se: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1) / a.length) }; };
    const va = manual(A.map((r, i) => (i < 5 ? 0 : r.tuned - r.twin))), vt = manual(A.map((r, i) => (i < 5 ? r.twin - r.tuned : 0))), at = manual(A.map((r) => r.twin - r.tuned));
    ok("!! gated minus always-twin is 0 where the rule plans and tuned minus twin where it does not (mean +0.025), gated minus tuned is the gain where it plans (+0.05), always minus tuned +0.025; standard errors with n - 1", j.n === 10 && near(j.vsAlways.mean, va.m) && near(j.vsAlways.se, va.se) && near(j.vsAlways.mean, 0.025) && near(j.vsTuned.mean, vt.m) && near(j.vsTuned.se, vt.se) && near(j.vsTuned.mean, 0.05) && near(j.alwaysVsTuned.mean, at.m) && near(j.alwaysVsTuned.se, at.se) && near(j.alwaysVsTuned.mean, 0.025));
    ok("!! the plan share is 0.5 for the rule, 1 for always and 0 for never; an empty row list has share 0", near(j.planShare, 0.5) && X.judge(X.candidates(A)[0], A).planShare === 1 && X.judge(X.candidates(A)[1], A).planShare === 0 && X.judge(rule, []).planShare === 0);
    const solo = X.judge(X.candidates(A)[0], [A[0]]);
    ok("!! a single row has a standard error of 0 and finite means, not NaN", solo.n === 1 && solo.vsAlways.se === 0 && solo.vsTuned.se === 0 && Number.isFinite(solo.vsTuned.mean) && near(solo.vsTuned.mean, 0.1));
    ok("!! never planning is the tuned rule: gated minus tuned 0, gated minus always-twin is minus the always gain (-0.025)", near(X.judge(X.candidates(A)[1], A).vsTuned.mean, 0) && near(X.judge(X.candidates(A)[1], A).vsAlways.mean, -0.025) && near(X.judge(X.candidates(A)[0], A).vsAlways.mean, 0));
    ok("!! REAL needs a positive mean past 2 se: (0.03, 0.01) is real, (0.02, 0.01) exactly 2 se is not, a negative mean never is", X.isReal({ mean: 0.03, se: 0.01 }) && !X.isReal({ mean: 0.02, se: 0.01 }) && !X.isReal({ mean: -0.5, se: 0.001 }) && !X.isReal({ mean: 0, se: 0 }));
    const lin = Array.from({ length: 10 }, (_, i) => ({ f: { ...base, frac0: i / 10 }, gain: 2 * (i / 10) }));
    ok("!! the correlation of a feature with the gain: +1 for a gain that is twice the feature, -1 for the negative, 0 for a constant feature or a constant gain", near(X.correlation(lin, "frac0"), 1) && near(X.correlation(lin.map((r) => ({ ...r, gain: -r.gain })), "frac0"), -1) && X.correlation(lin, "nearest") === 0 && X.correlation(lin.map((r) => ({ ...r, gain: 3 })), "frac0") === 0);
    ok("!! on the fixture the correlation of frac0 with the gain is negative (the gain is at low charge) and of the constant features 0", X.correlation(A, "frac0") < -0.8 && X.correlation(A, "spread") === 0);
}
sec("7. LINES");
{
    const rule = X.candidates(A).find((c) => c.name === "frac0 < 0.6"), never = X.candidates(A)[1], always = X.candidates(A)[0];
    const big = Array.from({ length: 40 }, (_, i) => ({ f: { ...base, frac0: (i + 1) / 40 }, tuned: 0.5, twin: i < 20 ? 0.6 + (i % 2) * 0.01 : 0.45 + (i % 2) * 0.01, gain: 0 }));
    const rb = X.candidates(big).find((c) => c.feature === "frac0" && c.dir === "<" && near(c.cut, 0.525));
    ok("!! a rule that is REAL against always planning says IMPROVES; one that is not says NO RULE", X.bottomLines(rb, big)[0] === "A RULE ON THE SCENARIO IMPROVES ON ALWAYS PLANNING" && X.bottomLines(always, big)[0] === "NO RULE ON THE SCENARIO IMPROVES ON ALWAYS PLANNING" && X.bottomLines(never, big)[0] === "NO RULE ON THE SCENARIO IMPROVES ON ALWAYS PLANNING");
    ok("!! the second line: KEEPS when gated minus tuned is at least 70 percent of always minus tuned (and that is positive), LOSES otherwise, with the plan share", /^THE FITTED RULE KEEPS THE TWIN'S GAIN \(it plans on 50% of the test dives\)$/.test(X.bottomLines(rb, big)[1]) && /^THE FITTED RULE LOSES THE TWIN'S GAIN \(it plans on 0% of the test dives\)$/.test(X.bottomLines(never, big)[1]));
    const neg = A.map((r) => ({ ...r, twin: r.tuned - 0.05, gain: -0.05 }));
    ok("!! when the twin does not gain at all the rule cannot KEEP its gain (always minus tuned is not positive): LOSES even for always planning", /LOSES/.test(X.bottomLines(always, neg)[1]));
    ok("!! never planning when the twin LOSES to the tuned rule (always minus tuned is -0.05) is still 'LOSES the twin's gain': there is no gain to keep, even though gated minus tuned (0) is above 70 percent of a negative number", /LOSES/.test(X.bottomLines(never, neg)[1]));
    const exact = A.map((r, i) => ({ ...r, twin: i < 5 ? r.tuned + 0.1 : r.tuned, gain: i < 5 ? 0.1 : 0 }));
    const sev = X.candidates(exact).find((c) => c.name === "frac0 < 0.3");
    ok("!! the 70 percent line is at least: a rule that keeps 40 percent of the gain LOSES, one that keeps all of it KEEPS", /LOSES/.test(X.bottomLines(sev, exact)[1]) && /KEEPS/.test(X.bottomLines(X.candidates(exact).find((c) => c.name === "frac0 < 0.6"), exact)[1]));
    void rule;
}
sec("8. CHECKS");
{
    const mkRows = (n) => Array.from({ length: n }, () => ({ f: { ...base, frac0: 0.5 }, gain: 0.01, twin: 0.5, tuned: 0.49 }));
    ok("!! three rows: TRAIN COUNT, TEST COUNT, FEATURES FINITE, all passing on 1056 and 192 rows", J(X.checksOf(mkRows(1056), mkRows(192)).map((c) => c.name)) === J(["TRAIN COUNT", "TEST COUNT", "FEATURES FINITE"]) && X.checksOf(mkRows(1056), mkRows(192)).every((c) => c.ok));
    ok("!! 1055 training rows break TRAIN COUNT only; 191 test rows TEST COUNT only; a NaN feature (or gain) FEATURES FINITE only", J(X.checksOf(mkRows(1055), mkRows(192)).filter((c) => !c.ok).map((c) => c.name)) === J(["TRAIN COUNT"]) && J(X.checksOf(mkRows(1056), mkRows(191)).filter((c) => !c.ok).map((c) => c.name)) === J(["TEST COUNT"]) && J(X.checksOf(mkRows(1056).map((r, i) => (i === 3 ? { ...r, f: { ...r.f, spread: NaN } } : r)), mkRows(192)).filter((c) => !c.ok).map((c) => c.name)) === J(["FEATURES FINITE"]) && J(X.checksOf(mkRows(1056), mkRows(192).map((r, i) => (i === 7 ? { ...r, gain: NaN } : r))).filter((c) => !c.ok).map((c) => c.name)) === J(["FEATURES FINITE"]));
}
sec("9. REPORT");
{
    const mk = (n) => Array.from({ length: n }, (_, i) => { const frac0 = ((i * 37) % 100) / 100, g = frac0 < 0.5 ? 0.08 : -0.03 + (i % 3) * 0.01; return { f: { ...base, frac0, spread: 100 + (i % 7) }, tuned: 0.6, twin: 0.6 + g, gain: g }; });
    const L = X.report(mk(1056), mk(192)), txt = L.join("\n");
    ok("!! the head says the counts and NO NEW DIVE; the three checks pass first", /^ROUND 21: .* 1056 dives of Rounds 13-17, judged once on 192 .*NO NEW DIVE/.test(L[0]) && L.slice(1, 4).every((l) => /^  PASS /.test(l)));
    ok("!! the training line, the best five candidates (each with its gain over always planning and its plan count) and the correlations of all nine features", /training: always planning \+0\.0[0-9]+ \(se 0\.00[0-9]+\) over the tuned rule/.test(txt) && (txt.match(/^  (frac0|spread|damage0|always|never)[^\n]* plans on [0-9]+ of 1056$/gm) || []).length === 5 && FEATS_ALL(txt));
    ok("!! the fitted rule, the test judgement with all three differences and the plan share, and the optimistic bound fitted on the test dives", /^FITTED RULE: frac0 < /m.test(txt) && /test: gated minus always-twin [+-]0\.0[0-9]+ \(se [0-9.]+\); gated minus tuned \+0\.0[0-9]+ \(se [0-9.]+\); always-twin minus tuned \+0\.0[0-9]+ \(se [0-9.]+\); plans on [0-9]+% of the test dives/.test(txt) && /optimistic bound \(the same fit made ON the test dives\): .*, gated minus always-twin [+-]0\.0[0-9]+/.test(txt));
    ok("!! the two bottom lines come last", L[L.length - 2].startsWith("BOTTOM LINE: ") && L[L.length - 1].startsWith("BOTTOM LINE: THE FITTED RULE"));
    const mkT = (n) => Array.from({ length: n }, (_, i) => { const spread = 100 + ((i * 13) % 50), g = spread >= 125 ? 0.09 : -0.04; return { f: { ...base, frac0: 0.9 + (i % 10) / 1000, spread }, tuned: 0.6, twin: 0.6 + g, gain: g }; });
    const X2 = X.report(mk(1056), mkT(192)).join("\n");
    ok("!! the rule is FITTED ON THE TRAINING DIVES and judged on the test dives: with a training gain at low frac0 and a test gain at high spread the fitted rule is a frac0 rule, it plans on 0% of the test dives (their frac0 is all above its cut), and the optimistic bound (fitted on the test dives) names spread; the correlations are the training ones", /^FITTED RULE: frac0 </m.test(X2) && /^test: gated minus always-twin .*plans on 0% of the test dives$/m.test(X2) && /optimistic bound \(the same fit made ON the test dives\): spread /.test(X2) && /frac0 -0\.[5-9][0-9]{2}/.test(X2) && /spread 0\.0[0-9]{2}|spread -0\.0[0-9]{2}/.test(X2));
    ok("!! the best five are the TOP FIVE of the ranking (the first of them is the fitted rule)", (() => { const lines = X.report(mk(1056), mk(192)); const i = lines.findIndex((l) => l.startsWith("training: always")); const fitted = lines.find((l) => l.startsWith("FITTED RULE: ")).slice(13); return lines[i + 1].trim().startsWith(fitted) && lines.slice(i + 1, i + 6).every((l) => /plans on [0-9]+ of 1056$/.test(l)) && !/plans on/.test(lines[i + 6]); })());
    const bad = X.report(mk(1055), mk(192));
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", /^  FAIL TRAIN COUNT/m.test(bad.join("\n")) && bad.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && bad[bad.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && bad.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
function FEATS_ALL(txt) { return X.FEATURES.every((f) => new RegExp(f + " -?[0-9]\\.[0-9]{3}").test(txt)); }
sec("10. SOURCE");
{
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
