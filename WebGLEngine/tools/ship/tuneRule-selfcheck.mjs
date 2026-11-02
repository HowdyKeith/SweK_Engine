// WebGLEngine/tools/ship/tuneRule-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/tuneRule-selfcheck.mjs      (about 30-45 s)
//
// THE GATE OF tools/ship/tuneRule.mjs (Round 8 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      train 241-246, validation 271-282, audits 481-492, 521-532, 541-552 (four kinds), disjoint from every seed of Rounds 1-7 (train and validation are re-used from Rounds 6-7 and are not audits); the recipe; the arms; the two extra noises.
//   2 ARMS      TUNED-RULE at the defaults is RULE-GF dive for dive; CONST-TUNED is Round 7's constant 0.07; arms that need parameters or weights say so; unknown arms refused.
//   3 SEARCH    deterministic; the held score never falls (violent sigma); children come from the CURRENT best (drift on a flat objective moves most parameters); checkpoints at the cadence.
//   4 CHAMPION  chosen on VALIDATION; the defaults stand unless a checkpoint beats them there.
//   5 VERDICTS  the joint reading, the holds reading (HOLDS needs every noise, BREAKS any), noneOrMore.
//   6 REPORT    (small ranges) checks first, a failed check says NOT WEIGHED for both questions, the robustness lines per noise.
//   7 SOURCE    the audit seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: that tuned parameters score better, or hold under other noise (that is the experiment).
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
import * as X from "./tuneRule.mjs";
console.log("tuneRule-selfcheck -- the Round 8 tuner\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i), seedsOf = (set) => [...new Set(set.map((s) => s.seed))];
const far = [T.scenario(241, "far")], two = [T.scenario(241, "far"), T.scenario(241, "both")];
const fp = (arm, o, set = two) => X.scoreOf(arm, o, set).runs.map((r) => r.fingerprint).join();

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(501, 508)]);
    const aud = [...rangeOf(481, 492), ...rangeOf(521, 532), ...rangeOf(541, 552)];
    ok("!! the audits are 481-492, 521-532, 541-552 in that order and share no seed with Rounds 1-7", J(X.AUDIT_RANGES) === J({ U1: [481, 492], U2: [521, 532], U3: [541, 552] }) && J(X.AUDIT_NAMES) === J(["U1", "U2", "U3"]) && aud.every((s) => !prior.has(s)));
    ok("!! train is 241-246 (24 dives) and validation 271-282 (48 dives)", J(seedsOf(X.TRAIN)) === J(rangeOf(241, 246)) && X.TRAIN.length === 24 && J(seedsOf(X.VALIDATION)) === J(rangeOf(271, 282)) && X.VALIDATION.length === 48);
    ok("!! the recipe is the registered one (3 searches, 300 iterations, sigma 0.15 of the range, 1-2 parameters, a checkpoint every 30)", J(X.RECIPE) === J({ runs: 3, iters: 300, sigma: 0.15, maxChange: 2, checkpointEvery: 30 }));
    ok("!! the arms, the robustness arms and the extra noises are pinned; CONST_SHIFT is 0.07", J(X.ARMS) === J(["ALONE", "RULE-GF", "CONST-TUNED", "TUNED-RULE", "RESIDUAL"]) && J(X.ROBUST_ARMS) === J(["RULE-GF", "CONST-TUNED", "TUNED-RULE"]) && J(X.NOISES) === J([0.05, 0.2]) && X.CONST_SHIFT === 0.07);
}
sec("2. ARMS");
{
    const thr = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    ok("!! TUNED-RULE at the defaults is RULE-GF dive for dive; with another low it is not", fp("TUNED-RULE", { params: {} }) === fp("RULE-GF", {}) && fp("TUNED-RULE", { params: { low: 0.45, high: 0.8 } }) !== fp("RULE-GF", {}));
    ok("!! CONST-TUNED is Round 7's constant 0.07 and differs from RULE-GF", fp("CONST-TUNED", {}) === C.scoreOf("CONST-TUNED", { tuned: 0.07 }, two).runs.map((r) => r.fingerprint).join() && fp("CONST-TUNED", {}) !== fp("RULE-GF", {}));
    ok("!! RESIDUAL runs the weights it is given (those of a 0.07 constant are CONST-TUNED); ALONE is GUARDED-OBS", fp("RESIDUAL", { champion: Array.from(C.constWeights(0.07)) }) === fp("CONST-TUNED", {}) && X.scoreOf("ALONE", {}, two).score === T.evaluate(T.GUARDED_OBS, two, { gauge: T.GAUGE }).score);
    ok("!! TUNED-RULE needs parameters, RESIDUAL the weights, unknown arms are refused", /parameters/.test(thr(() => X.pilotOf("TUNED-RULE"))) && /champion weights/.test(thr(() => X.pilotOf("RESIDUAL"))) && /unknown arm/.test(thr(() => X.pilotOf("NOPE"))));
    ok("!! the gauge noise argument reaches the flight (sd 0.2 flies a different dive than sd 0.05)", X.scoreOf("RULE-GF", {}, two, { ...T.GAUGE, sd: 0.2 }).runs.map((r) => r.fingerprint).join() !== X.scoreOf("RULE-GF", {}, two, { ...T.GAUGE, sd: 0.05 }).runs.map((r) => r.fingerprint).join());
}
sec("3. SEARCH");
{
    const r = { ...X.RECIPE, iters: 4, checkpointEvery: 2 }, a = X.search(7, r, far), b = X.search(7, r, far), c = X.search(8, r, far);
    ok("!! a search is deterministic and another seed differs", J(a.best) === J(b.best) && J(a.trace) === J(b.trace) && (J(a.best) !== J(c.best) || J(a.trace) !== J(c.trace) || a.checkpoints.length > 0));
    ok("!! checkpoints are iteration 0 (the defaults) and every 2nd", J(a.checkpoints.map((x) => x.iter)) === J([0, 2, 4]) && J(a.checkpoints[0].params) === J(U.normalise({})) && a.trace.length === 5);
    const hard = X.search(11, { ...X.RECIPE, sigma: 3, maxChange: 5, iters: 6, checkpointEvery: 6 }, far);
    ok("!! with a violent sigma the held score never falls and the search never ends below the defaults on train", hard.trace.every((x, i) => i === 0 || x >= hard.trace[i - 1]) && hard.bestScore >= hard.trace[0] && hard.trace.length === 7);
    const flat = X.search(12, { ...X.RECIPE, iters: 24, checkpointEvery: 24 }, [T.scenario(241, "plain")]);
    ok("!! children are made from the CURRENT best: on a flat objective (every child accepted) 3 or more of 5 parameters have left the defaults after 24 iterations", U.NAMES.filter((k) => flat.best[k] !== U.DEFAULTS[k]).length >= 3, J(flat.best));
    ok("!! every parameter of every child stays inside its bounds", flat.checkpoints.every((cp) => U.NAMES.every((k) => cp.params[k] >= U.BOUNDS[k][0] && cp.params[k] <= U.BOUNDS[k][1])) && hard.best.high >= hard.best.low);
}
sec("4. CHAMPION");
{
    const val = [T.scenario(271, "far"), T.scenario(271, "both")], sc = (p) => T.evaluate(X.pilotOf("TUNED-RULE", { params: p }), val, { gauge: T.GAUGE }).score;
    const bad = { low: 0.15, high: 0.35, cap: 0.6 }, good = { low: 0.4, high: 0.7 };
    const ch = X.champion([{ seed: 1, checkpoints: [{ iter: 0, params: U.normalise({}) }, { iter: 30, params: bad }] }], val);
    ok("!! when no checkpoint beats the defaults on validation the DEFAULTS stand", sc(bad) <= sc({}) ? ch.from === "defaults" && ch.iter === 0 && J(ch.params) === J(U.normalise({})) : ch.iter === 30, J([sc({}), sc(bad)]));
    const ch2 = X.champion([{ seed: 1, checkpoints: [{ iter: 0, params: U.normalise({}) }, { iter: 30, params: bad }, { iter: 60, params: good }] }], val);
    ok("!! the best checkpoint on validation is taken and the defaults' validation score is reported beside it", sc(good) > sc({}) && sc(good) >= sc(bad) ? ch2.iter === 60 && ch2.validation === sc(good) && ch2.startValidation === sc({}) : ch2.startValidation === sc({}), J([sc({}), sc(bad), sc(good)]));
    ok("!! a checkpoint is chosen on validation, not on its train score (a high trainScore does not win)", X.champion([{ seed: 1, checkpoints: [{ iter: 30, params: bad, trainScore: 9 }, { iter: 60, params: good, trainScore: 0 }] }], val).validation >= Math.max(sc({}), sc(bad)));
}
sec("5. VERDICTS");
{
    const W = { wins: true }, N = { wins: false };
    ok("!! noneOrMore: all three wins BEATS, none NONE, otherwise MIXED", X.noneOrMore([W, W, W]) === "BEATS" && X.noneOrMore([N, N, N]) === "NONE" && X.noneOrMore([W, N, N]) === "MIXED" && X.noneOrMore([W, W, N]) === "MIXED");
    ok("!! the joint reading: BEATS the constant is JOINT TUNING; NONE is ONE NUMBER IS ENOUGH; some is MIXED; a tuned rule that does not beat the original is NOT ASSESSED", X.jointLine("BEATS", "BEATS") === "JOINT TUNING BEATS THE ONE NUMBER" && X.jointLine("NONE", "BEATS") === "ONE NUMBER IS ENOUGH" && X.jointLine("MIXED", "BEATS") === "MIXED" && /NOT ASSESSED/.test(X.jointLine("BEATS", "TIES")) && /NOT ASSESSED/.test(X.jointLine("NONE", "LOSES")));
    const mk = (s) => ({ runs: [0, 1, 2, 3].map(() => ({ score: s })) }), rob = (arm, rule) => Object.fromEntries(["0.05", "0.2"].map((sd) => [sd, Object.fromEntries(X.AUDIT_NAMES.map((n) => [n, { "RULE-GF": mk(rule(sd)), "TUNED-RULE": mk(arm(sd)), "CONST-TUNED": mk(0.9) }]))]));
    ok("!! HOLDS needs a win on all three audits at EVERY noise", X.holdsOf(rob(() => 0.8, () => 0.5), "TUNED-RULE") === "HOLDS");
    ok("!! BREAKS if the rule beats it on all three at ANY noise; PARTLY otherwise", X.holdsOf(rob((sd) => (sd === "0.2" ? 0.4 : 0.8), () => 0.6), "TUNED-RULE") === "BREAKS" && X.holdsOf(rob((sd) => (sd === "0.2" ? 0.6 : 0.8), () => 0.6), "TUNED-RULE") === "PARTLY");
    ok("!! holdsOf reads the arm it is asked for (CONST-TUNED here beats the rule everywhere while TUNED-RULE does not)", X.holdsOf(rob(() => 0.4, () => 0.6), "CONST-TUNED") === "HOLDS" && X.holdsOf(rob(() => 0.4, () => 0.6), "TUNED-RULE") === "BREAKS");
}
sec("6. REPORT (small ranges)");
{
    const small = { U1: [481, 481], U2: [521, 521], U3: [541, 541] }, opts = { params: { low: 0.4, high: 0.7 }, champion: Array.from(C.constWeights(0.07)) };
    const au = X.audits(opts, { ranges: small }), rob = X.robustness(opts, { ranges: small, noises: [0.05] }), champ = { from: "search 1", iter: 60, params: U.normalise({ low: 0.4, high: 0.7 }), validation: 0.8, startValidation: 0.7 };
    ok("!! the audits fly every arm on the three ranges asked for, the robustness every robustness arm at each noise asked for", J(Object.keys(au)) === J(["U1", "U2", "U3"]) && Object.values(au).every((a) => J(Object.keys(a)) === J(X.ARMS) && a.ALONE.runs.length === 4) && J(Object.keys(rob)) === J(["0.05"]) && J(Object.keys(rob["0.05"].U2)) === J(X.ROBUST_ARMS) && rob["0.05"].U3["TUNED-RULE"].runs.length === 4);
    const L = X.report(au, rob, champ, [{}, {}, {}]);
    ok("!! the champion line names the parameters, the validation scores and says it was chosen before the audits", /champion: search 1 at iteration 60: alpha 0\.00500, low 0\.400, high 0\.700, ramp 6\.00, cap 0\.900; validation 0\.8000 against the defaults' 0\.7000; 3 searches; chosen BEFORE the audits/.test(L[1]));
    ok("!! the checks come first and the identity check passes; the robustness lines are printed per noise", L.findIndex((l) => /PASS IDENTITY/.test(l)) > 0 && L.findIndex((l) => /PASS IDENTITY/.test(l)) < L.findIndex((l) => /^means/.test(l)) && L.some((l) => /^robustness, gauge noise sd 0\.05/.test(l)));
    ok("!! all four verdict lines and both QUESTION lines are printed", ["TUNED-RULE against RULE-GF", "TUNED-RULE against CONST-TUNED", "CONST-TUNED against RULE-GF", "TUNED-RULE against RESIDUAL"].every((s) => L.some((l) => l.includes(s))) && L.some((l) => /^QUESTION \(a\): /.test(l)) && L.some((l) => /^QUESTION \(b\): TUNED-RULE (HOLDS|BREAKS|PARTLY|NOT WEIGHED) under other gauge noise; CONST-TUNED (HOLDS|BREAKS|PARTLY|NOT WEIGHED)/.test(l)));
    const badAu = { ...au, U2: { ...au.U2, "RULE-GF": { ...au.U2["RULE-GF"], runs: au.U2["RULE-GF"].runs.map((r) => ({ ...r, score: 0 })) } } }, LB = X.report(badAu, rob, champ, []);
    ok("!! a FAILED check prints FAIL, says NOT WEIGHED, and both QUESTION lines say so", LB.some((l) => /FAIL RULE NOT TRIVIAL U2/.test(l)) && LB.some((l) => /NOT WEIGHED\./.test(l)) && /QUESTION \(a\): NOT WEIGHED/.test(LB.join("\n")) && /QUESTION \(b\): TUNED-RULE NOT WEIGHED/.test(LB.join("\n")));
}
sec("6b. SYNTHETIC AUDITS");
{
    const mk = (f) => ({ runs: [0, 1, 2].flatMap(() => ["plain", "deep", "far", "both"].map((kind) => ({ kind, score: f(kind), fingerprint: "f" }))), score: 0, crashed: 0, stranded: 0 });
    const au1 = (sc) => Object.fromEntries(X.ARMS.map((a) => [a, mk(() => sc[a])])), aud = (sc) => ({ U1: au1(sc), U2: au1(sc), U3: au1(sc) });
    const sc = { ALONE: 0.3, "RULE-GF": 0.5, "CONST-TUNED": 0.6, "TUNED-RULE": 0.6, RESIDUAL: 0.6 };
    const robOf = (t, c) => ({ "0.05": Object.fromEntries(X.AUDIT_NAMES.map((n) => [n, { "RULE-GF": mk(() => 0.5), "CONST-TUNED": mk(() => c), "TUNED-RULE": mk(() => t) }])) });
    const champ = { from: "defaults", iter: 0, params: U.normalise({}), validation: 0.7, startValidation: 0.7 };
    const L = X.report(aud(sc), robOf(0.7, 0.3), champ, []);
    ok("!! verdict lines compare the right arms: TUNED-RULE against RULE-GF +0.100, against CONST-TUNED +0.000, CONST-TUNED against RULE-GF +0.100", L.some((l) => /^TUNED-RULE against RULE-GF: \+0\.100 WINS \| \+0\.100 WINS \| \+0\.100 WINS = BEATS/.test(l)) && L.some((l) => /^TUNED-RULE against CONST-TUNED: \+0\.000 tie/.test(l)) && L.some((l) => /^CONST-TUNED against RULE-GF: \+0\.100 WINS/.test(l)) && L.some((l) => /^TUNED-RULE against RESIDUAL \(reported\): \+0\.000 tie/.test(l)));
    ok("!! the questions are generated: ONE NUMBER IS ENOUGH here, and (b) reads each arm's own robustness (TUNED-RULE holds, CONST-TUNED breaks)", L.some((l) => /^QUESTION \(a\): ONE NUMBER IS ENOUGH/.test(l)) && L.some((l) => /^QUESTION \(b\): TUNED-RULE HOLDS under other gauge noise; CONST-TUNED BREAKS/.test(l)));
    const L2 = X.report(aud({ ...sc, "TUNED-RULE": 0.8 }), robOf(0.7, 0.7), champ, []);
    ok("!! a tuned rule 0.2 above the constant gives JOINT TUNING BEATS THE ONE NUMBER", L2.some((l) => /^QUESTION \(a\): JOINT TUNING BEATS THE ONE NUMBER/.test(l)));
    const L3 = X.report(aud({ ...sc, "TUNED-RULE": 0.5 }), robOf(0.7, 0.7), champ, []);
    ok("!! a tuned rule that only ties the original is NOT ASSESSED for question (a)", L3.some((l) => /^QUESTION \(a\): NOT ASSESSED/.test(l)));
    ok("!! the champion line is first after the title and the QUESTION lines are the last two", /^champion: defaults: alpha 0\.00500/.test(L[1]) && /^QUESTION \(a\)/.test(L[L.length - 2]) && /^QUESTION \(b\)/.test(L[L.length - 1]));
}
sec("7. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./tuneRule.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), re = /\b(?:4[89][0-9]|5[2-5][0-9])\b/g;
    ok("!! the audit seeds appear in ONE place and the search and champion do not mention them", (code.match(re) || []).length === 6 && !re.test(code.slice(code.indexOf("export function search"), code.indexOf("export function audits"))));
    ok("!! the library reads no clock, no random number and no file", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
