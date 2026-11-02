// WebGLEngine/tools/ship/tuneWide-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/tuneWide-selfcheck.mjs      (about 30-40 s)
//
// THE GATE OF tools/ship/tuneWide.mjs (Round 9 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS     audits 561-572, 581-592, 601-612 (four kinds) disjoint from every seed of Rounds 1-8; seeds, arms and the alpha sigma pinned; train and validation are Round 8's.
//   2 ARMS     TUNED-R8 under the wide bounds equals the Round 8 seat; the arms that need parameters say so; unknown arms refused; noise reaches the flight.
//   3 SEARCH   deterministic; starts at the Round 8 champion; the held score never falls; alpha moves MULTIPLICATIVELY (it can go below the old 0.001, never below 0.0001, and a child's alpha is a positive multiple of its parent's before clipping); children come from the current best; parameters stay inside the wide bounds.
//   4 CHAMPION chosen on validation; the Round 8 champion stands unless a checkpoint beats it; a tie does not displace it.
//   5 READINGS wallsLine (MATTERED all three wins; WORSE all three losses; DID NOT MATTER no wins no losses; else MIXED); onBounds names the parameters on a bound.
//   6 REPORT   synthetic audits: the verdict lines compare the right arms, per-audit robustness verdicts are printed for each noise, the bottom line is generated, a failed check says NOT WEIGHED; the checks (identity, rule not trivial on far AND both) are held with fixtures.
//   7 SOURCE   the audit seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: that a wider search finds a better rule (that is the experiment).
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
import * as U from "../../brain/tunedRule.mjs";
import * as C from "./constShift.mjs";
import * as N from "./tuneRule.mjs";
import * as X from "./tuneWide.mjs";
console.log("tuneWide-selfcheck -- the Round 9 wide search\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38, high: 0.689, ramp: 20, cap: 0.886 }, far = [T.scenario(241, "far")], two = [T.scenario(241, "far"), T.scenario(241, "both")];
const fp = (arm, o, set = two) => X.scoreOf(arm, o, set).runs.map((r) => r.fingerprint).join();

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552)]);
    ok("!! the audits are 561-572, 581-592, 601-612 in that order and share no seed with Rounds 1-8", J(X.AUDIT_RANGES) === J({ W1: [561, 572], W2: [581, 592], W3: [601, 612] }) && J(X.AUDIT_NAMES) === J(["W1", "W2", "W3"]) && [...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612)].every((s) => !prior.has(s)));
    ok("!! train, validation, recipe and noises are Round 8's; the search seed base is 64000 and the alpha sigma 0.5", X.TRAIN === N.TRAIN && X.VALIDATION === N.VALIDATION && X.RECIPE === N.RECIPE && J(X.NOISES) === J([0.05, 0.2]) && X.SEARCH_BASE === 64000 && X.ALPHA_SIGMA === 0.5);
    ok("!! the arms and the robustness arms are pinned", J(X.ARMS) === J(["ALONE", "RULE-GF", "CONST-TUNED", "TUNED-R8", "TUNED-WIDE"]) && J(X.ROBUST_ARMS) === J(["RULE-GF", "TUNED-R8", "TUNED-WIDE"]));
}
sec("2. ARMS");
{
    const thr = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    ok("!! TUNED-R8 under the wide bounds equals the Round 8 seat dive for dive (the Round 8 champion's values lie inside both bounds)", fp("TUNED-R8", { r8: R8 }) === N.scoreOf("TUNED-RULE", { params: R8 }, two).runs.map((r) => r.fingerprint).join());
    ok("!! TUNED-WIDE runs the parameters it is given under the WIDE bounds (alpha 0.0003 differs from alpha 0.001) and CONST-TUNED is Round 7's constant", fp("TUNED-WIDE", { wide: { ...R8, alpha: 0.0003 } }) !== fp("TUNED-WIDE", { wide: R8 }) && fp("CONST-TUNED", {}) === C.scoreOf("CONST-TUNED", { tuned: 0.07 }, two).runs.map((r) => r.fingerprint).join());
    ok("!! ALONE is GUARDED-OBS; the parametrised arms say what they need; unknown arms are refused", X.scoreOf("ALONE", {}, two).score === T.evaluate(T.GUARDED_OBS, two, { gauge: T.GAUGE }).score && /Round 8 parameters/.test(thr(() => X.pilotOf("TUNED-R8"))) && /needs the parameters/.test(thr(() => X.pilotOf("TUNED-WIDE"))) && /unknown arm/.test(thr(() => X.pilotOf("NOPE"))));
    ok("!! the gauge noise argument reaches the flight", X.scoreOf("RULE-GF", {}, two, { ...T.GAUGE, sd: 0.2 }).runs.map((r) => r.fingerprint).join() !== X.scoreOf("RULE-GF", {}, two, { ...T.GAUGE, sd: 0.05 }).runs.map((r) => r.fingerprint).join());
}
sec("3. SEARCH");
{
    const r = { ...X.RECIPE, iters: 4, checkpointEvery: 2 }, a = X.search(7, R8, r, far), b = X.search(7, R8, r, far);
    ok("!! a search is deterministic, starts at the Round 8 champion (iteration 0 = its params) and checkpoints every 2nd", J(a.best) === J(b.best) && J(a.trace) === J(b.trace) && J(a.checkpoints[0].params) === J(U.normalise(R8, U.WIDE_BOUNDS)) && J(a.checkpoints.map((x) => x.iter)) === J([0, 2, 4]) && a.trace.length === 5);
    const hard = X.search(11, R8, { ...X.RECIPE, sigma: 3, maxChange: 5, iters: 6, checkpointEvery: 6 }, far);
    ok("!! with a violent sigma the held score never falls", hard.trace.every((x, i) => i === 0 || x >= hard.trace[i - 1]) && hard.bestScore >= hard.trace[0] && hard.trace.length === 7);
    const flat = X.search(12, R8, { ...X.RECIPE, iters: 24, checkpointEvery: 24 }, [T.scenario(241, "plain")]);
    ok("!! children come from the CURRENT best: on a flat objective 3 or more of 5 parameters have left the start after 24 iterations", U.NAMES.filter((k) => flat.best[k] !== U.normalise(R8, U.WIDE_BOUNDS)[k]).length >= 3, J(flat.best));
    ok("!! every parameter stays inside the WIDE bounds (not the narrow ones: alpha may be below 0.001 or ramp above 20)", flat.checkpoints.every((cp) => U.NAMES.every((k) => cp.params[k] >= U.WIDE_BOUNDS[k][0] && cp.params[k] <= U.WIDE_BOUNDS[k][1])) && hard.best.high >= hard.best.low);
    const many = X.search(13, { ...R8, alpha: 0.0005 }, { ...X.RECIPE, iters: 30, maxChange: 5, checkpointEvery: 30 }, [T.scenario(241, "plain")]);
    ok("!! alpha moves multiplicatively: on a flat objective it leaves the start by a factor (not by the linear 0.15 x 0.02 = 0.003 of the old step) and stays within 0.0001-0.02", many.best.alpha !== 0.0005 && many.best.alpha >= 0.0001 && many.best.alpha <= 0.02 && many.trace.length === 31, "alpha " + many.best.alpha);
    const steps = [13, 14, 15].map((sd) => X.search(sd, { ...R8, alpha: 0.0005 }, { ...X.RECIPE, iters: 30, maxChange: 1, checkpointEvery: 1 }, [T.scenario(241, "plain")]).checkpoints.map((c) => c.params.alpha));
    ok("!! alpha steps are small FACTORS: over 30 single-parameter steps from 0.0005 it never passes 0.003 (a linear step of 0.15 of the range would reach 0.005-0.01)", steps.every((al) => Math.max(...al) < 0.003), steps.map((al) => Math.max(...al).toFixed(5)).join(" "));
    ok("!! a search that starts BELOW the old alpha floor keeps it (the start 0.0005 is not clipped to 0.001)", many.checkpoints[0].params.alpha === 0.0005);
}
sec("4. CHAMPION");
{
    const val = [T.scenario(271, "far"), T.scenario(271, "both")], sc = (p) => T.evaluate(X.pilotOf("TUNED-WIDE", { wide: p }), val, { gauge: T.GAUGE }).score, bad = { ...R8, low: 0.15, high: 0.35, cap: 0.6 }, good = { ...R8, alpha: 0.0003, low: 0.5, high: 0.8 };
    const ch = X.champion([{ seed: 1, checkpoints: [{ iter: 0, params: R8 }, { iter: 30, params: bad }] }], R8, val);
    ok("!! when no checkpoint beats the Round 8 champion on validation it STANDS", sc(bad) <= sc(R8) ? ch.from === "Round 8 champion" && ch.iter === 0 : ch.iter === 30, J([sc(R8), sc(bad)]));
    const ch2 = X.champion([{ seed: 1, checkpoints: [{ iter: 30, params: bad }, { iter: 60, params: good }] }], R8, val);
    ok("!! the best checkpoint on validation is taken and the Round 8 champion's validation score is reported beside it", ch2.startValidation === sc(R8) && (sc(good) > sc(R8) && sc(good) >= sc(bad) ? ch2.iter === 60 && ch2.validation === sc(good) : true), J([sc(R8), sc(bad), sc(good)]));
    const tie = X.champion([{ seed: 1, checkpoints: [{ iter: 30, params: { ...R8 }, trainScore: 9 }] }], R8, val);
    ok("!! a checkpoint that only TIES the Round 8 champion on validation does not displace it, and a high train score does not win", tie.from === "Round 8 champion" && tie.iter === 0);
}
sec("5. READINGS");
{
    const W = { wins: true, loses: false }, L = { wins: false, loses: true }, N0 = { wins: false, loses: false };
    ok("!! wallsLine: all three wins MATTERED, all three losses WORSE, no wins and no losses DID NOT MATTER, anything else MIXED", X.wallsLine([W, W, W]) === "THE WALLS MATTERED" && X.wallsLine([L, L, L]) === "WORSE" && X.wallsLine([N0, N0, N0]) === "THE WALLS DID NOT MATTER" && X.wallsLine([W, W, N0]) === "MIXED" && X.wallsLine([W, L, N0]) === "MIXED" && X.wallsLine([L, N0, N0]) === "MIXED");
    ok("!! onBounds names the parameters on a wide bound (alpha at 0.0001, ramp at 60) and nothing for interior values", J(X.onBounds({ alpha: 0.0001, low: 0.3, high: 0.6, ramp: 60, cap: 0.9 })) === J(["alpha at its lower bound 0.0001", "ramp at its upper bound 60", "cap at its upper bound 0.9"]) && X.onBounds({ alpha: 0.001, low: 0.3, high: 0.6, ramp: 20, cap: 0.886 }).length === 0);
}
sec("6. REPORT (synthetic audits)");
{
    const mk = (f) => ({ runs: [0, 1, 2].flatMap(() => ["plain", "deep", "far", "both"].map((kind) => ({ kind, score: f(kind), fingerprint: "f" }))), score: 0, crashed: 0, stranded: 0 });
    const set = (sc) => Object.fromEntries(X.ARMS.map((a) => [a, mk(() => sc[a])])), aud = (sc) => Object.fromEntries(X.AUDIT_NAMES.map((n) => [n, set(sc)]));
    const rob = (w, r8) => Object.fromEntries(["0.05", "0.2"].map((sd) => [sd, Object.fromEntries(X.AUDIT_NAMES.map((n) => [n, { "RULE-GF": mk(() => 0.5), "TUNED-R8": mk(() => r8), "TUNED-WIDE": mk(() => w) }]))]));
    const sc = { ALONE: 0.3, "RULE-GF": 0.5, "CONST-TUNED": 0.6, "TUNED-R8": 0.7, "TUNED-WIDE": 0.8 }, champ = { from: "search 64000", iter: 90, params: { alpha: 0.0001, low: 0.38, high: 0.689, ramp: 40, cap: 0.886 }, validation: 0.9, startValidation: 0.85 };
    const L = X.report(aud(sc), rob(0.8, 0.7), champ, [{}, {}, {}], { r8: R8 });
    ok("!! the champion line names the parameters, the validation scores and BEFORE the audits; the bounds hit are listed", /champion: search 64000 at iteration 90: alpha 0\.000100, low 0\.380, high 0\.689, ramp 40\.0, cap 0\.886; validation 0\.9000 against the Round 8 champion's 0\.8500; 3 searches; chosen BEFORE the audits/.test(L[1]) && /^on a bound: alpha at its lower bound 0\.0001/.test(L[2]));
    ok("!! the verdict lines compare the right arms: WIDE against R8 +0.100, against RULE-GF +0.300 = BEATS", L.some((l) => /^TUNED-WIDE against TUNED-R8: \+0\.100 WINS \| \+0\.100 WINS \| \+0\.100 WINS/.test(l)) && L.some((l) => /^TUNED-WIDE against RULE-GF: \+0\.300 WINS.* = BEATS/.test(l)) && /^BOTTOM LINE: THE WALLS MATTERED/.test(L[L.length - 1]));
    ok("!! the robustness section prints, for EACH noise, both comparisons per audit", ["0.05", "0.2"].every((sd) => L.some((l) => l.startsWith("robustness, gauge noise sd " + sd))) && L.filter((l) => /^  TUNED-WIDE against TUNED-R8: \+0\.100 WINS/.test(l)).length === 2 && L.filter((l) => /^  TUNED-WIDE against RULE-GF: \+0\.300 WINS/.test(l)).length === 2);
    const L2 = X.report(aud({ ...sc, "TUNED-WIDE": 0.7 }), rob(0.7, 0.7), champ, [], { r8: R8 });
    ok("!! a wide champion no better than the Round 8 one reads THE WALLS DID NOT MATTER", /BOTTOM LINE: THE WALLS DID NOT MATTER/.test(L2[L2.length - 1]));
    const L3 = X.report(aud({ ...sc, "TUNED-WIDE": 0.6 }), rob(0.6, 0.7), champ, [], { r8: R8 });
    ok("!! a wide champion worse than the Round 8 one reads WORSE", /BOTTOM LINE: WORSE/.test(L3[L3.length - 1]));
    const hard = (k) => (k === "both" ? 0.9 : 0.3), setR = (rule) => Object.fromEntries(X.AUDIT_NAMES.map((n) => [n, { ALONE: mk(() => 0.3), "RULE-GF": mk(rule) }]));
    const c1 = X.checksOf(setR(hard), { r8: R8 }), c2 = X.checksOf(setR((k) => (k === "plain" ? 0.9 : 0.3)), { r8: R8 });
    ok("!! the rule-not-trivial check reads far AND both (wins on both only passes; wins on plain only fails) and the identity check passes on the real seat", c1.filter((c) => /RULE NOT TRIVIAL/.test(c.name)).every((c) => c.ok) && c2.filter((c) => /RULE NOT TRIVIAL/.test(c.name)).every((c) => !c.ok) && c1.find((c) => c.name === "IDENTITY").ok === true);
    ok("!! the identity check goes FAIL when other parameters are run in its place", X.checksOf(setR(hard), { r8: R8, identityParams: { ...R8, low: 0.5, high: 0.9 } }).find((c) => c.name === "IDENTITY").ok === false);
    const bad = aud(sc); bad.W2["RULE-GF"] = mk(() => 0.2); const LB = X.report(bad, rob(0.8, 0.7), champ, [], { r8: R8 });
    ok("!! a FAILED check prints FAIL, says NOT WEIGHED, and the bottom line says so", LB.some((l) => /FAIL RULE NOT TRIVIAL W2/.test(l)) && LB.some((l) => /NOT WEIGHED\./.test(l)) && /BOTTOM LINE: NOT WEIGHED/.test(LB[LB.length - 1]));
}
sec("6b. ROBUSTNESS NOISE");
{
    const small = { W1: [561, 561], W2: [581, 581], W3: [601, 601] }, opts = { r8: R8, wide: R8 };
    const at = X.audits(opts, { ranges: small }), rb = X.robustness(opts, { ranges: small, noises: [0.05] }), rb2 = X.robustness(opts, { ranges: small, noises: [0.2] });
    const f = (res) => res.runs.map((r) => r.fingerprint).join();
    ok("!! the robustness runs fly at THEIR noise: the same arm on the same set differs from the audit's and between the two noises", f(rb["0.05"].W1["RULE-GF"]) !== f(at.W1["RULE-GF"]) && f(rb["0.05"].W1["RULE-GF"]) !== f(rb2["0.2"].W1["RULE-GF"]));
}
sec("7. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./tuneWide.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), re = /\b(?:56[1-9]|57[0-2]|58[1-9]|59[0-2]|60[1-9]|61[0-2])\b/g;
    ok("!! the audit seeds appear in ONE place and the search and champion do not mention them", (code.match(re) || []).length === 6 && !re.test(code.slice(code.indexOf("export function search"), code.indexOf("export function audits"))));
    ok("!! the library reads no clock, no random number and no file", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
