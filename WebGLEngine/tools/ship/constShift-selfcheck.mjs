// WebGLEngine/tools/ship/constShift-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/constShift-selfcheck.mjs      (about 15-25 s)
//
// THE GATE OF tools/ship/constShift.mjs (Round 7 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS       audits 421-432, 441-452, 461-472 (four kinds), validation 271-282, disjoint from every seed of Rounds 1-6; the grid 0.00-0.14; the arms.
//   2 CONSTANTS  a constant shift is the residual seat with a fixed shift: the weights give exactly that shift (and cut 0) on any features; 0 is the start; 0.15 and negatives are refused; a larger shift surfaces on more ticks.
//   3 ARMS       CONST-0.00 (tuned 0) equals RULE-GF dive for dive; ALONE is GUARDED-OBS; the champion arm needs its weights, the tuned arm its shift; unknown arms refused.
//   4 TUNING     picks the best validation mean, ties to the smaller shift, returns the whole curve.
//   5 VERDICTS   the three-way reading of the registration: READS SOMETHING iff RESIDUAL beats the constant on all three; TUNING EXPLAINS IT iff it beats it on none and the constant beats the rule on all three; else MIXED.
//   6 REPORT     (small ranges) checks first, a failed check says NOT WEIGHED, the bottom line is generated from the verdicts.
//   7 SOURCE     the audit seeds appear in one place; no clock, no random, no file.
// NOT CHECKED, said plainly: that a constant matches the residual (that is the experiment).
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { let v; try { v = typeof c === "function" ? c() : c; } catch (e) { v = false; d = "threw: " + e.message; } console.log((v ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!v) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "../../brain/needsTask.mjs";
import * as R from "../../brain/residualAdvisor.mjs";
import * as X from "./constShift.mjs";
console.log("constShift-selfcheck -- the Round 7 constant-shift arms\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i), seedsOf = (set) => [...new Set(set.map((s) => s.seed))];
const one = [T.scenario(241, "far"), T.scenario(241, "both")];

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 246), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(501, 508)]);
    const aud = [...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472)];
    ok("!! the audits are 421-432, 441-452, 461-472 in that order and share no seed with Rounds 1-6 (validation 271-282 excepted, which is not an audit)", J(X.AUDIT_RANGES) === J({ S1: [421, 432], S2: [441, 452], S3: [461, 472] }) && J(X.AUDIT_NAMES) === J(["S1", "S2", "S3"]) && aud.every((s) => !prior.has(s)));
    ok("!! validation is 271-282, four kinds, 48 dives", J(seedsOf(X.VALIDATION)) === J(rangeOf(271, 282)) && X.VALIDATION.length === 48);
    ok("!! the grid is 0.00 .. 0.14 in steps of 0.01 (15 values)", X.GRID.length === 15 && X.GRID[0] === 0 && Math.abs(X.GRID[14] - 0.14) < 1e-12 && X.GRID.every((g, i) => i === 0 || g > X.GRID[i - 1]));
    ok("!! the arms are pinned and the fixed constants are 0.05, 0.10, 0.14", J(X.ARMS) === J(["ALONE", "RULE-GF", "RESIDUAL", "CONST-0.05", "CONST-0.10", "CONST-0.14", "CONST-TUNED"]) && J(X.FIXED) === J({ "CONST-0.05": 0.05, "CONST-0.10": 0.1, "CONST-0.14": 0.14 }));
}
sec("2. CONSTANTS");
{
    const fs8 = [[0.5, 0.5, 0.2, 0, 0, 0.1, 0.5, 0.3], [1, 0, 1.5, 1, 1, 1, 1, 1.5], [0, 1, 0, 0, 0, 0, 0, 0]];
    ok("!! a constant's weights give exactly that shift and a cut of 0 on any features", [0.03, 0.1, 0.14].every((s) => fs8.every((f) => { const o = R.forward(X.constWeights(s), f); return Math.abs(o.shift - s) < 1e-12 && o.cut === 0; })));
    ok("!! a shift of 0 is the start weights themselves", J(Array.from(X.constWeights(0))) === J(Array.from(R.startWeights())));
    ok("!! 0.15, larger and negative shifts are refused", [0.15, 0.2, -0.01, NaN].every((s) => { try { X.constWeights(s); return false; } catch (e) { return /outside/.test(e.message); } }));
    const surf = (s) => { let n = 0; T.fly(T.flyDecision((c) => { const seat = R.residualSeat(X.constWeights(s))(c); return (st, obs) => { const d = seat(st, obs); if (d.surface) n++; return d; }; }), T.scenario(241, "both"), { gauge: T.GAUGE }); return n; };
    ok("!! a larger shift surfaces on more ticks than a smaller one", surf(0.14) > surf(0), surf(0.14) + " against " + surf(0));
}
sec("3. ARMS");
{
    const fp = (arm, o) => X.scoreOf(arm, o, one).runs.map((r) => r.fingerprint).join();
    const champ = Array.from(X.constWeights(0.1));
    ok("!! a tuned shift of 0 equals RULE-GF dive for dive; a tuned shift of 0.14 does not", fp("CONST-TUNED", { tuned: 0 }) === fp("RULE-GF", {}) && fp("CONST-TUNED", { tuned: 0.14 }) !== fp("RULE-GF", {}));
    ok("!! the fixed arms are their constants (CONST-0.10 equals a tuned 0.10 and differs from CONST-0.05)", fp("CONST-0.10", {}) === fp("CONST-TUNED", { tuned: 0.1 }) && fp("CONST-0.10", {}) !== fp("CONST-0.05", {}) && fp("CONST-0.14", {}) === fp("CONST-TUNED", { tuned: 0.14 }));
    ok("!! RESIDUAL with the weights of a 0.10 constant is that constant (the champion arm runs the weights it is given)", fp("RESIDUAL", { champion: champ }) === fp("CONST-0.10", {}));
    ok("!! ALONE is GUARDED-OBS", X.scoreOf("ALONE", {}, one).score === T.evaluate(T.GUARDED_OBS, one, { gauge: T.GAUGE }).score);
    const thr = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    ok("!! RESIDUAL needs the champion, CONST-TUNED needs a shift, unknown arms are refused", /champion/.test(thr(() => X.pilotOf("RESIDUAL"))) && /tuned shift/.test(thr(() => X.pilotOf("CONST-TUNED"))) && /unknown arm/.test(thr(() => X.pilotOf("NOPE"))));
}
sec("4. TUNING");
{
    const t = X.tune(one, [0, 0.05, 0.1, 0.14]);
    const best = t.curve.reduce((b, c) => (c.score > b.score ? c : b), t.curve[0]);
    ok("!! the tuned shift has the best validation mean on the grid it was given and the curve lists every grid point in order", t.shift === best.shift && t.curve.length === 4 && J(t.curve.map((c) => c.shift)) === J([0, 0.05, 0.1, 0.14]) && t.curve.every((c) => c.score === X.scoreOf("CONST-TUNED", { tuned: c.shift }, one).score));
    const flat = X.tune([T.scenario(241, "plain")], [0.02, 0.04, 0.06]);
    ok("!! ties go to the smaller shift", flat.curve.every((c) => c.score === flat.curve[0].score) ? flat.shift === 0.02 : flat.shift === flat.curve.reduce((b, c) => (c.score > b.score ? c : b)).shift);
}
sec("5. VERDICTS");
{
    const W = { wins: true }, N = { wins: false };
    ok("!! winsOf: all three wins is BEATS, none is NONE, otherwise MIXED", X.winsOf([W, W, W]) === "BEATS" && X.winsOf([N, N, N]) === "NONE" && X.winsOf([W, N, N]) === "MIXED" && X.winsOf([W, W, N]) === "MIXED");
    ok("!! READS SOMETHING iff the residual beats the constant on all three", X.lineOf("BEATS", "BEATS") === "RESIDUAL READS SOMETHING" && X.lineOf("TIES", "BEATS") === "RESIDUAL READS SOMETHING");
    ok("!! TUNING EXPLAINS IT iff the residual beats it on none AND the constant beats the rule on all three", X.lineOf("BEATS", "NONE") === "TUNING EXPLAINS IT" && X.lineOf("TIES", "NONE") === "MIXED" && X.lineOf("LOSES", "NONE") === "MIXED");
    ok("!! a residual that beats the constant on some audits only is MIXED", X.lineOf("BEATS", "MIXED") === "MIXED");
}
sec("6. REPORT (small audit ranges)");
{
    const small = { S1: [421, 421], S2: [441, 441], S3: [461, 461] }, tuning = { shift: 0.08, curve: X.GRID.map((g) => ({ shift: g, score: 0.5 + g })) };
    const au = X.audits({ champion: Array.from(X.constWeights(0.1)), tuned: 0.08 }, { ranges: small });
    ok("!! the audits fly every arm on the three ranges (4 dives each here)", J(Object.keys(au)) === J(["S1", "S2", "S3"]) && Object.values(au).every((a) => J(Object.keys(a)) === J(X.ARMS) && a.ALONE.runs.length === 4));
    const L = X.report(au, tuning, "champion = test");
    ok("!! the checks come before the means, the identity check passes, and the tuned curve is printed whole", L.findIndex((l) => /IDENTITY/.test(l)) < L.findIndex((l) => /^means/.test(l)) && L.some((l) => /PASS IDENTITY/.test(l)) && L.some((l) => /TUNING CURVE: 0\.00:0\.500 .*0\.14:0\.640/.test(l)));
    ok("!! the report says the shift was chosen BEFORE the audits and ends in a BOTTOM LINE generated from the verdicts", /tuned shift 0\.08 .*BEFORE the audits/.test(L[1]) && /^BOTTOM LINE: (RESIDUAL READS SOMETHING|TUNING EXPLAINS IT|MIXED|NOT WEIGHED)/.test(L[L.length - 1]) && ["CONST-TUNED against RULE-GF", "RESIDUAL against CONST-TUNED", "RESIDUAL against RULE-GF"].every((s) => L.some((l) => l.includes(s))));
    const bad = { ...au, S2: { ...au.S2, "RULE-GF": { ...au.S2["RULE-GF"], runs: au.S2["RULE-GF"].runs.map((r) => ({ ...r, score: 0 })) } } };
    const LB = X.report(bad, tuning);
    ok("!! a FAILED check (the rule not beating ALONE) prints FAIL, says NOT WEIGHED, and the bottom line says so", LB.some((l) => /FAIL RULE NOT TRIVIAL S2/.test(l)) && LB.some((l) => /NOT WEIGHED\./.test(l)) && /NOT WEIGHED/.test(LB[LB.length - 1]));
}
sec("6b. SYNTHETIC AUDITS");
{
    const mk = (f) => ({ runs: [0, 1, 2].flatMap(() => ["plain", "deep", "far", "both"].map((kind, i) => ({ kind, score: f(kind), fingerprint: "f" }))), score: 0, crashed: 0, stranded: 0 });
    const arms = (rule, constant, resid) => ({ ALONE: mk(() => 0.3), "RULE-GF": mk(rule), RESIDUAL: mk(resid), "CONST-0.05": mk(() => 0.5), "CONST-0.10": mk(() => 0.5), "CONST-0.14": mk(() => 0.5), "CONST-TUNED": mk(constant) });
    const A = (rule, constant, resid) => ({ S1: arms(rule, constant, resid), S2: arms(rule, constant, resid), S3: arms(rule, constant, resid) });
    const tuning = { shift: 0.08, curve: X.GRID.map((g) => ({ shift: g, score: 0.5 })) };
    const au = A(() => 0.5, () => 0.6, () => 0.7), L = X.report(au, tuning);
    ok("!! the verdict lines compare the right arms: CONST-TUNED against RULE-GF +0.100, RESIDUAL against CONST-TUNED +0.100, RESIDUAL against RULE-GF +0.200", L.some((l) => /^CONST-TUNED against RULE-GF: \+0\.100 WINS \| \+0\.100 WINS \| \+0\.100 WINS = BEATS/.test(l)) && L.some((l) => /^RESIDUAL against CONST-TUNED: \+0\.100 WINS/.test(l) && /wins on 3 of 3/.test(l)) && L.some((l) => /^RESIDUAL against RULE-GF.*\+0\.200 WINS/.test(l)) && /RESIDUAL READS SOMETHING/.test(L[L.length - 1]));
    const L2 = X.report(A(() => 0.5, () => 0.6, () => 0.6), tuning);
    ok("!! a residual no better than a constant that beats the rule reads TUNING EXPLAINS IT", /BOTTOM LINE: TUNING EXPLAINS IT/.test(L2[L2.length - 1]));
    const hard = (kind) => (kind === "both" ? 0.9 : 0.3), c1 = X.checksOf(A(hard, hard, hard), tuning), c2 = X.checksOf(A((k) => (k === "plain" ? 0.9 : 0.3), hard, hard), tuning);
    ok("!! the rule-not-trivial check reads far AND both: a rule that wins on both only passes, one that wins on plain only fails", c1.filter((c) => /RULE NOT TRIVIAL/.test(c.name)).every((c) => c.ok) && c2.filter((c) => /RULE NOT TRIVIAL/.test(c.name)).every((c) => !c.ok));
    ok("!! the identity check goes FAIL when a non-zero shift is run in its place", X.checksOf(au, tuning).find((c) => c.name === "IDENTITY").ok === true && X.checksOf(au, tuning, { identityShift: 0.08 }).find((c) => c.name === "IDENTITY").ok === false);
    ok("!! the tuning-curve check fails on a curve that is not the whole grid", X.checksOf(au, { shift: 0, curve: [{ shift: 0, score: 0.5 }] }).find((c) => c.name === "TUNING CURVE").ok === false && X.checksOf(au, tuning).find((c) => c.name === "TUNING CURVE").ok === true);
}
sec("7. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./constShift.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    ok("!! the audit seeds appear in ONE place and the tuning does not mention them", (code.match(/\b4[2-7][0-9]\b/g) || []).length === 6 && !/\b4[2-7][0-9]\b/.test(code.slice(code.indexOf("export function tune"), code.indexOf("export function audits"))));
    ok("!! the library reads no clock, no random number and no file", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
