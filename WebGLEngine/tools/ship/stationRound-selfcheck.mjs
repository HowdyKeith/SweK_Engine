// WebGLEngine/tools/ship/stationRound-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/stationRound-selfcheck.mjs      (about 30-45 s)
//
// THE GATE OF tools/ship/stationRound.mjs (Round 10 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS      train 241-252 and validation 271-294 of far and both; audits 641-664, 681-704, 721-744 of far and both (48 dives each) disjoint from every seed of Rounds 1-9; the recipe; the arms; the 25-point preference grid.
//   2 ARMS      STATION-ZERO is TUNED-R8 dive for dive; the others need what they need; unknown arms refused; the shuffled control permutes hidden units (keeps the multiset of weights, keeps the output layer, moves the bias with the row) and changes dives.
//   3 ORACLE    never below nearest-first on a dive; above it on a dive known to gain (far 271: 0.70 to 0.85); a set's oracle is the mean of its dives'.
//   4 SEARCH    deterministic; starts at the zero weights; the held score never falls (violent sigma); children from the CURRENT best (drift on a flat objective); checkpoints at the cadence.
//   5 CHAMPION  on VALIDATION; the start stands unless a checkpoint beats it; a tie does not displace it; a high train score does not win. The preference control: the best validation mean on the grid, ties to the earlier entry.
//   6 VERDICTS  the bottom line table; gapShare.
//   7 REPORT    synthetic audits: checks first (identity, oracle), a failed check says NOT WEIGHED, the verdict lines compare the right arms, the share of the gap, the switches line.
//   8 SOURCE    the audit seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: that any learned station choice scores better (that is the experiment).
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
import * as S from "../../brain/stationResidual.mjs";
import * as X from "./stationRound.mjs";
console.log("stationRound-selfcheck -- the Round 10 trainer\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i), seedsOf = (set) => [...new Set(set.map((s) => s.seed))];
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };
const gainDive = [T.scenario(271, "far")], flat = [T.scenario(241, "plain")];
const fp = (arm, o, set) => X.scoreOf(arm, { r8: R8, ...o }, set).runs.map((r) => r.fingerprint).join();

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612)]);
    const aud = [...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744)];
    ok("!! the hard kinds are far and both", J(X.HARD) === J(["far", "both"]) && X.TRAIN.every((s) => X.HARD.includes(s.kind)) && X.VALIDATION.every((s) => X.HARD.includes(s.kind)));
    ok("!! train is 241-252 (24 dives) and validation 271-294 (48 dives)", J(seedsOf(X.TRAIN)) === J(rangeOf(241, 252)) && X.TRAIN.length === 24 && J(seedsOf(X.VALIDATION)) === J(rangeOf(271, 294)) && X.VALIDATION.length === 48);
    ok("!! the audits are 641-664, 681-704, 721-744 in that order, 48 dives each of far and both, and share no seed with Rounds 1-9", J(X.AUDIT_RANGES) === J({ X1: [641, 664], X2: [681, 704], X3: [721, 744] }) && J(X.AUDIT_NAMES) === J(["X1", "X2", "X3"]) && aud.every((s) => !prior.has(s)) && Object.values(X.AUDIT_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 48));
    ok("!! the recipe is 3 searches x 300 iterations, sigma 0.3, 1-4 weights, a checkpoint every 30; the search base is 65000", J(X.RECIPE) === J({ runs: 3, iters: 300, sigma: 0.3, maxK: 4, checkpointEvery: 30 }) && X.SEARCH_BASE === 65000);
    ok("!! the arms are pinned and the preference grid is the 25 points of {-1, -0.5, 0, 0.5, 1}^2", J(X.ARMS) === J(["TUNED-R8", "STATION-RESIDUAL", "STATION-ZERO", "STATION-SHUFFLED", "CONST-LINEAR", "ORACLE-ORDER"]) && X.LIN_GRID.length === 25 && new Set(X.LIN_GRID.map((g) => g.a + "," + g.b)).size === 25 && X.LIN_GRID.every((g) => [-1, -0.5, 0, 0.5, 1].includes(g.a) && [-1, -0.5, 0, 0.5, 1].includes(g.b)));
}
sec("2. ARMS");
{
    const thr = (f) => { try { f(); return null; } catch (e) { return e.message; } }, w = S.startWeights(); for (let i = S.OUT_START; i < S.N_WEIGHTS; i++) w[i] = 0.9 * Math.sin(3 + i);
    const seed271 = [T.scenario(271, "far"), T.scenario(272, "far")];
    ok("!! STATION-ZERO is TUNED-R8 dive for dive; a champion with non-zero output weights is not", fp("STATION-ZERO", {}, seed271) === fp("TUNED-R8", {}, seed271) && fp("STATION-RESIDUAL", { weights: Array.from(w) }, seed271) !== fp("TUNED-R8", {}, seed271));
    ok("!! the arms say what they need and unknown arms (and the oracle) are refused", /parameters \(r8\)/.test(thr(() => X.pilotOf("TUNED-R8"))) && /champion weights/.test(thr(() => X.pilotOf("STATION-RESIDUAL", { r8: R8 }))) && /champion weights/.test(thr(() => X.pilotOf("STATION-SHUFFLED", { r8: R8 }))) && /preference/.test(thr(() => X.pilotOf("CONST-LINEAR", { r8: R8 }))) && /unknown arm/.test(thr(() => X.pilotOf("NOPE", { r8: R8 }))) && /oracleRuns/.test(thr(() => X.pilotOf("ORACLE-ORDER", { r8: R8 }))));
    const wb = Float64Array.from(w); for (let j = 0; j < S.N_HID; j++) wb[S.N_W1 + j] = 0.1 * (j + 1); const sh = X.shuffled(w), shb = X.shuffled(wb);
    ok("!! the shuffle keeps the multiset of weights and the whole output layer, moves hidden unit 0's row and bias to unit 1", J(Array.from(sh).sort()) === J(Array.from(w).sort()) && Array.from(sh.slice(S.OUT_START)).every((x, i) => x === w[S.OUT_START + i]) && Array.from({ length: S.N_IN }, (_, i) => sh[S.N_IN + i] === w[i]).every(Boolean) && sh[S.N_W1 + 1] === w[S.N_W1] && sh[S.N_W1] === w[S.N_W1 + 7] && shb[S.N_W1 + 1] === 0.1 && shb[S.N_W1] === 0.8 && shb[S.N_W1 + 2] === 0.2);
    ok("!! the shuffled net decides differently from the champion (on some dive of a few) and CONST-LINEAR runs its preference", [271, 272, 273, 274, 275, 276].some((sd) => fp("STATION-SHUFFLED", { weights: Array.from(w) }, [T.scenario(sd, "far")]) !== fp("STATION-RESIDUAL", { weights: Array.from(w) }, [T.scenario(sd, "far")])) && fp("CONST-LINEAR", { lin: { a: 1, b: -1 } }, [T.scenario(272, "far")]) !== fp("TUNED-R8", {}, [T.scenario(272, "far")]));
}
sec("3. ORACLE");
{
    const o = X.oracleRun(R8, T.scenario(271, "far")), n = X.scoreOf("TUNED-R8", { r8: R8 }, gainDive).score;
    ok("!! on a dive known to gain from another order the oracle is above nearest-first (far 271: 0.70 to 0.85)", n < 0.71 && o.score > 0.84 && o.kind === "far", n.toFixed(3) + " -> " + o.score.toFixed(3));
    const plain = T.scenario(241, "plain");
    ok("!! on a dive where nearest-first is already perfect the oracle is the same (never below nearest-first)", X.oracleRun(R8, plain).score >= X.scoreOf("TUNED-R8", { r8: R8 }, [plain]).score && X.oracleRun(R8, plain).score === 1 && X.oracleRun(R8, plain).fingerprint === X.scoreOf("TUNED-R8", { r8: R8 }, [plain]).runs[0].fingerprint);
    const set = [T.scenario(271, "far"), T.scenario(272, "far")], os = X.oracleRuns(R8, set);
    ok("!! oracleRuns is the per-dive oracle: runs in set order, the mean score, crushed and stranded counted", os.runs.length === 2 && Math.abs(os.score - (os.runs[0].score + os.runs[1].score) / 2) < 1e-12 && os.runs[0].score === o.score && os.crashed === 0 && os.stranded === 0 && os.runs.every((r) => r.fingerprint));
}
sec("4. SEARCH");
{
    const r = { ...X.RECIPE, iters: 4, checkpointEvery: 2 }, a = X.search(7, R8, r, gainDive), b = X.search(7, R8, r, gainDive);
    ok("!! a search is deterministic, checkpoint 0 is the zero weights, checkpoints every 2nd, trace has iters + 1 entries", J(Array.from(a.best)) === J(Array.from(b.best)) && J(a.trace) === J(b.trace) && J(a.checkpoints.map((x) => x.iter)) === J([0, 2, 4]) && J(Array.from(a.checkpoints[0].weights)) === J(Array.from(S.startWeights())) && a.trace.length === 5);
    const hard = X.search(11, R8, { ...X.RECIPE, sigma: 5, maxK: 20, iters: 6, checkpointEvery: 6 }, gainDive);
    ok("!! with a violent sigma the held score never falls", hard.trace.every((x, i) => i === 0 || x >= hard.trace[i - 1]) && hard.bestScore >= hard.trace[0] && hard.trace.length === 7);
    const mixed = [T.scenario(281, "far"), T.scenario(273, "both"), T.scenario(272, "far"), T.scenario(275, "both")], wild = X.search(15, R8, { ...X.RECIPE, sigma: 5, maxK: 20, iters: 8, checkpointEvery: 8 }, mixed);
    ok("!! on a set where changes help and hurt, the held score is the running maximum (never lower than an earlier one), equals the best weights' own score, and ends above the start", wild.trace.every((x, i) => x >= Math.max(...wild.trace.slice(0, i + 1)) - 1e-12) && Math.abs(T.evaluate(T.flyDecision(S.stationSeat(R8, { w: wild.best })), mixed, { gauge: T.GAUGE }).score - wild.trace[wild.trace.length - 1]) < 1e-12 && wild.trace[8] > wild.trace[0], wild.trace.map((x) => x.toFixed(3)).join(" "));
    const drift = X.search(12, R8, { ...X.RECIPE, iters: 24, checkpointEvery: 24 }, flat), moved = Array.from(drift.best).filter((x, i) => x !== S.startWeights()[i]).length;
    ok("!! children come from the CURRENT best: on a flat objective (every child accepted) more than maxK weights have moved after 24 iterations", moved > X.RECIPE.maxK, "moved " + moved);
}
sec("5. CHAMPION AND CONTROL");
{
    const val = [T.scenario(271, "far"), T.scenario(273, "both")], sc = (w) => T.evaluate(T.flyDecision(S.stationSeat(R8, { w })), val, { gauge: T.GAUGE }).score;
    const start = S.startWeights(), other = Float64Array.from(start); for (let i = S.OUT_START; i < S.N_WEIGHTS; i++) other[i] = 0.9 * Math.sin(3 + i);
    const ch = X.champion([{ seed: 1, checkpoints: [{ iter: 0, weights: start }, { iter: 30, weights: Array.from(other), trainScore: 9 }] }], R8, val);
    ok("!! the start stands unless a checkpoint beats it on VALIDATION, whatever its train score", sc(other) > sc(start) ? ch.iter === 30 && ch.validation === sc(other) : ch.from === "start" && ch.iter === 0, J([sc(start), sc(other)]));
    const tie = X.champion([{ seed: 1, checkpoints: [{ iter: 30, weights: Array.from(start), trainScore: 9 }] }], R8, val);
    ok("!! a checkpoint that only TIES the start does not displace it; the start's validation score is reported", tie.from === "start" && tie.iter === 0 && tie.startValidation === sc(start));
    const g281 = [T.scenario(281, "far")], tl = X.tuneLinear(R8, g281, [{ a: 0, b: 0 }, { a: 0, b: 1 }, { a: 1, b: 0 }, { a: -1, b: 0 }]);
    ok("!! the preference control picks the best entry (a = 1 and a = -1 both reach 0.85 on far 281, the others 0.70), ties to the EARLIER one, and a = 0 b = 0 is nearest-first (0.70)", tl.validation > 0.84 && J(tl.lin) === J({ a: 1, b: 0 }) && tl.curve[0].score < 0.71 && tl.curve[3].score > 0.84);
    const lt = X.tuneLinear(R8, val, [{ a: 0, b: 0 }, { a: 1, b: -1 }, { a: -1, b: 1 }]), scs = lt.curve.map((c) => c.score);
    ok("!! the preference control takes the best validation mean on the grid it was given (ties to the earlier entry) and lists the whole curve", lt.curve.length === 3 && lt.validation === Math.max(...scs) && J(lt.lin) === J({ a: lt.curve[scs.indexOf(Math.max(...scs))].a, b: lt.curve[scs.indexOf(Math.max(...scs))].b }) && lt.curve[0].score === sc(start));
}
sec("6. VERDICTS");
{
    ok("!! HURTS iff it loses to the tuned rule", X.bottomLine("LOSES", "BEATS", "BEATS") === "HURTS" && X.bottomLine("LOSES", "TIES", "TIES") === "HURTS");
    ok("!! IMPROVES needs BEATS on the start, the shuffled control AND the fixed preference", X.bottomLine("BEATS", "BEATS", "BEATS") === "A SITUATION-DEPENDENT RESIDUAL IMPROVES THE TUNED RULE" && X.bottomLine("BEATS", "TIES", "BEATS") === "NO GAIN OVER THE TUNED RULE" && X.bottomLine("BEATS", "LOSES", "BEATS") === "NO GAIN OVER THE TUNED RULE");
    ok("!! a SIMPLE PREFERENCE EXPLAINS IT when it beats the start but not the fixed preference", X.bottomLine("BEATS", "BEATS", "TIES") === "A SIMPLE PREFERENCE EXPLAINS IT" && X.bottomLine("BEATS", "TIES", "LOSES") === "A SIMPLE PREFERENCE EXPLAINS IT");
    ok("!! anything that does not beat the start is NO GAIN", X.bottomLine("TIES", "BEATS", "BEATS") === "NO GAIN OVER THE TUNED RULE" && X.bottomLine("TIES", "TIES", "TIES") === "NO GAIN OVER THE TUNED RULE");
    ok("!! gapShare is (a - base) / (oracle - base) and null when the oracle gains nothing", Math.abs(X.gapShare(0.85, 0.8, 0.9) - 0.5) < 1e-12 && X.gapShare(0.8, 0.8, 0.8) === null && X.gapShare(0.75, 0.8, 0.9) < 0);
}
sec("7. REPORT (synthetic audits)");
{
    const mk = (f, fpr = "f") => ({ runs: [0, 1, 2].flatMap(() => X.HARD.map((kind) => ({ kind, score: f, fingerprint: fpr }))), score: f, crashed: 0, stranded: 0 });
    const au1 = (s) => Object.fromEntries(X.ARMS.map((a) => [a, mk(s[a])])), aud = (s) => Object.fromEntries(X.AUDIT_NAMES.map((n) => [n, au1(s)]));
    const sc = { "TUNED-R8": 0.8, "STATION-RESIDUAL": 0.85, "STATION-ZERO": 0.78, "STATION-SHUFFLED": 0.82, "CONST-LINEAR": 0.81, "ORACLE-ORDER": 0.9 };
    const champ = { from: "search 65001", iter: 90, validation: 0.9, startValidation: 0.8 }, lin = { lin: { a: 0.5, b: -1 }, validation: 0.82 };
    const L = X.report(aud(sc), champ, lin, [{}, {}, {}], { switches: 1.25 });
    ok("!! the champion line names the validation scores, the constant preference and BEFORE the audits", /champion: search 65001 at iteration 90, validation 0\.9000 against the start's 0\.8000; 3 searches; constant preference a 0\.5, b -1 \(validation 0\.8200\); both chosen BEFORE the audits/.test(L[1]));
    ok("!! the verdict lines compare the right arms: RESIDUAL +0.050 against TUNED-R8, +0.030 against SHUFFLED, +0.040 against CONST-LINEAR, CONST-LINEAR +0.010 against TUNED-R8, the oracle +0.100 against TUNED-R8", L.some((l) => /^RESIDUAL against TUNED-R8: \+0\.050 WINS \| \+0\.050 WINS \| \+0\.050 WINS = BEATS/.test(l)) && L.some((l) => /^RESIDUAL against SHUFFLED.*\+0\.030 WINS.* = BEATS/.test(l)) && L.some((l) => /^RESIDUAL against CONST-LINEAR.*\+0\.040 WINS.* = BEATS/.test(l)) && L.some((l) => /^ORACLE-ORDER against TUNED-R8.*\+0\.100 WINS/.test(l)) && L.some((l) => /^CONST-LINEAR against TUNED-R8 \(reported\): \+0\.010 tie/.test(l)));
    ok("!! the share of the oracle gap closed (0.50 each audit), the switches line, and a generated BOTTOM LINE", L.some((l) => /^share of the oracle gap closed by RESIDUAL: 0\.50 \| 0\.50 \| 0\.50/.test(l)) && L.some((l) => /^station switches per dive \(champion\): 1\.25/.test(l)) && /^BOTTOM LINE: A SITUATION-DEPENDENT RESIDUAL IMPROVES THE TUNED RULE/.test(L[L.length - 1]));
    const L2 = X.report(aud({ ...sc, "CONST-LINEAR": 0.85 }), champ, lin, [], {});
    ok("!! a fixed preference as good as the residual reads A SIMPLE PREFERENCE EXPLAINS IT, and the switches line is absent when not given", /BOTTOM LINE: A SIMPLE PREFERENCE EXPLAINS IT/.test(L2[L2.length - 1]) && !L2.some((l) => /^station switches/.test(l)));
    const L3 = X.report(aud({ ...sc, "STATION-RESIDUAL": 0.7 }), champ, lin, [], {});
    ok("!! a residual worse than the tuned rule reads HURTS", /BOTTOM LINE: HURTS/.test(L3[L3.length - 1]));
    const badId = aud(sc); badId.X2["STATION-ZERO"] = mk(0.8, "other");
    const LB = X.report(badId, champ, lin, [], {});
    ok("!! a FAILED identity check prints FAIL, says NOT WEIGHED, and the bottom line says so", LB.some((l) => /FAIL IDENTITY X2/.test(l)) && LB.some((l) => /NOT WEIGHED\./.test(l)) && /BOTTOM LINE: NOT WEIGHED/.test(LB[LB.length - 1]));
    const badOr = aud(sc); badOr.X3["ORACLE-ORDER"] = mk(0.7);
    ok("!! an oracle below the tuned rule on a dive fails its check", X.checksOf(badOr).find((c) => c.name === "ORACLE X3").ok === false && X.checksOf(aud(sc)).every((c) => c.ok));
}
sec("8. THE SOURCE");
{
    const code = fs.readFileSync(new URL("./stationRound.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n"), re = /\b(?:64[1-9]|65[0-9]|66[0-4]|68[1-9]|69[0-9]|70[0-4]|72[1-9]|73[0-9]|74[0-4])\b/g;
    ok("!! the audit seeds appear in ONE place and the search, champion and control do not mention them", (code.match(re) || []).length === 6 && !re.test(code.slice(code.indexOf("export function search"), code.indexOf("export function audits"))));
    ok("!! the library reads no clock, no random number and no file", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
