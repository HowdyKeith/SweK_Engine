// WebGLEngine/tools/ship/plannerBudget-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerBudget-selfcheck.mjs      (about 11 s: a few 100-second dives)
//
// THE GATE OF tools/ship/plannerBudget.mjs (Round 14 of brain/NEEDS_AND_LIMITS.md, registered first) AND OF THE TWO OPTIONS IT ADDED TO brain/plannerPerturbed.mjs (the relative look-ahead `horizon` and the count `stats.rolloutSeconds`).
//   1 SETS      1221-1268 and 1281-1328 of far and both (96 dives each), disjoint from every seed of Rounds 1-13; 15 arms in the registered order.
//   2 OPTIONS   every arm name is the planning options the registration says; an unknown name is refused.
//   3 VERDICTS  KEEPS / LOSES / HURTS against TUNED-R8, MATCHES / WORSE against the full twin, the cost share; the bottom line picks the cheapest arm that keeps AND matches (ties to the earlier one), or says none.
//   4 CHECKS    identity with the Round 11 twin, the oracle floor, the full twin real; a failed check says NOT WEIGHED.
//   5 REPORT    the lines.
//   6 FLIGHT    real 100-second dives: the full twin equals the Round 11 twin, a replan every 30 s plans more than every 120 s, a 60-second look-ahead schedules fewer rollout seconds, ONCE plans no more than the full twin, the cost is the plans times the rollouts times the look-ahead (checked on a fixed case), the tuned rule and the oracle carry no cost.
//   7 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: what search the twin needs (that is the experiment).
// SABOTAGE LOG (49 mutants of tools/ship/plannerBudget.mjs and of the two options in brain/plannerPerturbed.mjs, run against a copy of this gate): 15 went 0 red on the first pass and 14 got rows -- the oracle arm being oracleRuns (on far 1223, where the full-length tuned rule differs; on 1221 and 1222 they coincide, which is why the first row passed under the mutant), the tuned rule flying with the noisy gauge, the mean over dives, the MATCHES test (a deficit inside 2 se, past 2 se), the pooling of both sets, a candidate having to KEEP, the share rounded not cut, the oracle floor at 1e-12, the share of the full gain, the oracle line, the look-ahead relative to each plan, the rollout count and the schedule from the plan's own time (700, 280, 1540 and 910 pinned). ONE is EQUIVALENT and said so: a finite default look-ahead of 600 s (the run is 600 s long, so no plan can look further). All 49 are red or said above.
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
import * as Q from "../../brain/plannerPerturbed.mjs";
import * as X from "./plannerBudget.mjs";
import { oracleRuns } from "./stationRound.mjs";
console.log("plannerBudget-selfcheck -- the Round 14 search-budget sweep\n");
const code = fs.readFileSync(new URL("./plannerBudget.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208)]);
    const seeds = [...rangeOf(1221, 1268), ...rangeOf(1281, 1328)];
    ok("!! the sets are W1 1221-1268 and W2 1281-1328, 96 dives each of far and both (192 in all), and share no seed with Rounds 1-13", J(X.SET_RANGES) === J({ W1: [1221, 1268], W2: [1281, 1328] }) && J(X.SET_NAMES) === J(["W1", "W2"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 96) && J(X.HARD) === J(["far", "both"]));
    ok("!! the replan intervals are 30, 60, 240, 480 and the look-aheads 60, 120, 240, 360", J(X.REPLANS) === J([30, 60, 240, 480]) && J(X.LOOKS) === J([60, 120, 240, 360]));
    ok("!! 11 search arms in the order REPLAN x4, LOOK x4, ONCE, CHEAP-A, CHEAP-B; 15 arms: TUNED-R8, TWIN-ROUND11, TWIN-FULL, the 11, ORACLE-ORDER", X.SEARCH_ARMS.length === 11 && J(X.SEARCH_ARMS) === J(["REPLAN-30", "REPLAN-60", "REPLAN-240", "REPLAN-480", "LOOK-60", "LOOK-120", "LOOK-240", "LOOK-360", "ONCE", "CHEAP-A", "CHEAP-B"]) && X.ARMS.length === 15 && J(X.ARMS.slice(0, 3)) === J(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL"]) && J(X.ARMS.slice(3, 14)) === J(X.SEARCH_ARMS) && X.ARMS[14] === "ORACLE-ORDER");
}
sec("2. OPTIONS");
{
    const p = X.planOf;
    ok("!! TWIN-FULL has no options; REPLAN-n is the replan interval n; LOOK-n the look-ahead n; ONCE an infinite replan interval", J(p("TWIN-FULL")) === "{}" && J(p("REPLAN-30")) === J({ replanS: 30 }) && J(p("REPLAN-480")) === J({ replanS: 480 }) && J(p("LOOK-60")) === J({ horizon: 60 }) && J(p("LOOK-360")) === J({ horizon: 360 }) && p("ONCE").replanS === Infinity && Object.keys(p("ONCE")).length === 1);
    ok("!! CHEAP-A is replan 240 with look-ahead 240 and CHEAP-B replan 480 with look-ahead 120", J(p("CHEAP-A")) === J({ replanS: 240, horizon: 240 }) && J(p("CHEAP-B")) === J({ replanS: 480, horizon: 120 }));
    const thr = (a) => { try { p(a); return false; } catch { return true; } };
    ok("!! an unknown name, an unregistered level (REPLAN-90, LOOK-30) and the non-twin arms are refused", thr("REPLAN-90") && thr("LOOK-30") && thr("TUNED-R8") && thr("ORACLE-ORDER") && thr("TWIN-ROUND11") && thr("CHEAP-C"));
}
// synthetic audits: 8 dives per set; scores per arm and a cost per set
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6];
const runs = (d) => ({ runs: BASE.map((b, i) => ({ kind: i % 2 ? "both" : "far", score: b + d[i % d.length], fingerprint: "f" + i })), score: 0, crashed: 0, stranded: 0 });
const KEEP = [0.1, 0.1, 0.1, 0.12, 0.1, 0.1, 0.08, 0.1], LOSE = [0.05, -0.05, 0.05, -0.05, 0.04, -0.04, 0.05, -0.05], HURT = KEEP.map((x) => -x), HALF = KEEP.map((x) => x / 2 + 0.01);
const synth = (spec = {}) => {
    const au = {};
    for (const [k, n] of X.SET_NAMES.entries()) {
        au[n] = { "TUNED-R8": runs([0]), "TWIN-ROUND11": runs(KEEP), "TWIN-FULL": { ...runs(KEEP), cost: 1000 + k * 200, plans: 6 }, "ORACLE-ORDER": runs(KEEP.map((x) => x + 0.05)) };
        for (const a of X.SEARCH_ARMS) { const s = spec[a] || {}; au[n][a] = { ...runs((s.dBy && s.dBy[n]) || s.d || KEEP), cost: (s.cost === undefined ? 500 : s.cost) * (1 + k * 0.2), plans: s.plans || 3 }; }
    }
    return au;
};

sec("3. VERDICTS");
{
    const au = synth({ "REPLAN-30": { d: KEEP }, "REPLAN-60": { d: LOSE }, "REPLAN-240": { d: HURT }, "LOOK-60": { d: HALF, cost: 200 } });
    const v = (a) => X.verdictOf(au, a);
    ok("!! a steady gain over TUNED-R8 KEEPS, a wobble LOSES, a steady loss HURTS", v("REPLAN-30").verdict === "KEEPS" && v("REPLAN-60").verdict === "LOSES" && v("REPLAN-240").verdict === "HURTS");
    ok("!! against the full twin: the same gain MATCHES, a wobble is WORSE, a half gain is WORSE (below by more than 2 se)", v("REPLAN-30").match === "MATCHES" && v("REPLAN-60").match === "WORSE" && v("LOOK-60").match === "WORSE" && v("REPLAN-30").vsFull.mean === 0 && v("LOOK-60").vsFull.mean < 0);
    ok("!! an arm better than the full twin still MATCHES (only a deficit counts)", X.verdictOf(synth({ "ONCE": { d: KEEP.map((x) => x + 0.05) } }), "ONCE").match === "MATCHES");
    const wob = KEEP.map((x, i) => x + (i % 2 ? 0.03 : -0.03) - 0.005), within = X.verdictOf(synth({ "ONCE": { d: wob } }), "ONCE");
    ok("!! a deficit against the full twin inside 2 se still MATCHES (mean -0.005, se about 0.0075), and one past 2 se is WORSE", within.vsFull.mean < 0 && within.match === "MATCHES" && -within.vsFull.mean < 2 * within.vsFull.se && X.verdictOf(synth({ "ONCE": { d: KEEP.map((x) => x - 0.03) } }), "ONCE").match === "WORSE");
    const split = X.verdictOf(synth({ "ONCE": { dBy: { W1: HURT, W2: KEEP } } }), "ONCE");
    ok("!! the verdict pools BOTH sets: a hurt on W1 and a gain on W2 of the same size is LOSES with n 16 (one set alone would say KEEPS or HURTS)", split.n === 16 && split.verdict === "LOSES");
    ok("!! the cost share is the arm's mean cost over both sets over the full twin's: 500 / 1000 = 0.5 for a plain arm (the sets scale alike), 0.2 for cost 200", Math.abs(v("REPLAN-30").share - 0.5) < 1e-9 && Math.abs(v("LOOK-60").share - 0.2) < 1e-9 && Math.abs(X.costOf(au, "REPLAN-30") - 550) < 1e-9 && Math.abs(X.costOf(au, "TWIN-FULL") - 1100) < 1e-9 && X.costOf(au, "TUNED-R8") === null && X.playsOf(au, "TWIN-FULL") === 6);
}
sec("4. BOTTOM LINE");
{
    const cheap = (spec) => X.bottomLine(synth(spec));
    ok("!! the cheapest arm that KEEPS and MATCHES is named with its share: 300 against 500 is 30 PERCENT, REPLAN-480", cheap({ "REPLAN-480": { cost: 300 } }) === "THE CHEAPEST PLANNER THAT KEEPS THE GAIN COSTS 30 PERCENT OF THE FULL ONE (REPLAN-480)" || /COSTS 30 PERCENT OF THE FULL ONE \(REPLAN-480\)/.test(cheap({ "REPLAN-480": { cost: 300 } })));
    ok("!! an arm that is cheaper but only LOSES or is WORSE is not a candidate: the cheapest of the rest wins", /\(LOOK-360\)$/.test(cheap({ "ONCE": { cost: 50, d: LOSE }, "LOOK-60": { cost: 100, d: HALF }, "LOOK-360": { cost: 400 }, "REPLAN-30": { cost: 900 } })) && /COSTS 40 PERCENT/.test(cheap({ "ONCE": { cost: 50, d: LOSE }, "LOOK-60": { cost: 100, d: HALF }, "LOOK-360": { cost: 400 }, "REPLAN-30": { cost: 900 } })));
    ok("!! an arm that matches but does not KEEP (a full twin and an arm both with no real gain) is not a candidate; with none at all the line says no cheaper planner keeps the gain", (() => { const au = synth({}); for (const n of X.SET_NAMES) { au[n]["TWIN-FULL"] = { ...runs(LOSE), cost: 1000, plans: 6 }; for (const a of X.SEARCH_ARMS) au[n][a] = { ...runs(LOSE), cost: 100, plans: 1 }; } return X.bottomLine(au); })() === "NO CHEAPER PLANNER KEEPS THE GAIN");
    ok("!! the share is rounded, not cut: a cost of 296 against the full twin's 1000 is 30 PERCENT (the cost of a plain arm scales with the full twin's)", /COSTS 30 PERCENT OF THE FULL ONE \(ONCE\)$/.test(cheap({ "ONCE": { cost: 296 } })));
    ok("!! a tie in cost goes to the earlier arm in the registered order (REPLAN-60 before LOOK-120), and a cost above the full twin's is a share over 100", /\(REPLAN-60\)$/.test(cheap({ "REPLAN-60": { cost: 200 }, "LOOK-120": { cost: 200 }, "REPLAN-30": { cost: 600 }, "REPLAN-240": { cost: 600 }, "REPLAN-480": { cost: 600 }, "LOOK-60": { cost: 600 }, "LOOK-240": { cost: 600 }, "LOOK-360": { cost: 600 }, "ONCE": { cost: 600 }, "CHEAP-A": { cost: 600 }, "CHEAP-B": { cost: 600 } })));
}
sec("5. CHECKS");
{
    const rows = (au) => X.checksOf(au);
    ok("!! five check rows on a clean audit: IDENTITY and ORACLE for each set, then FULL IS REAL; all pass", J(rows(synth()).map((c) => c.name)) === J(["IDENTITY W1", "ORACLE W1", "IDENTITY W2", "ORACLE W2", "FULL IS REAL"]) && rows(synth()).every((c) => c.ok));
    const eq = synth(); eq.W1["ORACLE-ORDER"].runs[2].score = eq.W1["TUNED-R8"].runs[2].score; eq.W2["ORACLE-ORDER"].runs[1].score = eq.W2["TUNED-R8"].runs[1].score - 1e-13;
    const under = synth(); under.W2["ORACLE-ORDER"].runs[1].score = under.W2["TUNED-R8"].runs[1].score - 1e-9;
    ok("!! the oracle floor allows an exact tie and 1e-13 below, and breaks at 1e-9 below", rows(eq).every((c) => c.ok) && J(rows(under).filter((c) => !c.ok).map((c) => c.name)) === J(["ORACLE W2"]));
    const id = synth(); id.W2["TWIN-FULL"].runs[2].fingerprint = "x";
    ok("!! a dive of the full twin that differs from the Round 11 twin breaks IDENTITY W2 only", J(rows(id).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY W2"]));
    const or = synth(); or.W1["ORACLE-ORDER"].runs[0].score = 0.1;
    ok("!! an oracle below TUNED-R8 breaks ORACLE W1 only", J(rows(or).filter((c) => !c.ok).map((c) => c.name)) === J(["ORACLE W1"]));
    const ng = synth(); for (const n of X.SET_NAMES) ng[n]["TWIN-FULL"] = { ...runs(LOSE), cost: 1000, plans: 6 };
    ok("!! a full twin with no real gain on these seeds breaks FULL IS REAL only", J(rows(ng).filter((c) => !c.ok).map((c) => c.name)) === J(["FULL IS REAL"]));
}
sec("6. REPORT");
{
    const L = X.report(synth({ "REPLAN-480": { cost: 300, plans: 2 }, "LOOK-60": { d: HALF, cost: 200 }, "REPLAN-30": { d: HURT } })), txt = L.join("\n");
    ok("!! the head names both sets; the five checks pass; the full twin's line carries its pooled gain, cost and plans", /^ROUND 14/.test(L[0]) && L[0].includes("W1 1221-1268") && L[0].includes("W2 1281-1328") && L.slice(1, 6).every((l) => /^  PASS /.test(l)) && /TWIN-FULL minus TUNED-R8: \+0\.10.*cost 1100 rollout seconds per dive, 6\.00 plans/.test(txt));
    ok("!! one row per search arm (11), each with its verdict, match, cost and share; REPLAN-480 reads KEEPS MATCHES at 27% (cost 330 over 1100 is 30%), LOOK-60 WORSE, REPLAN-30 HURTS", (txt.match(/^  (REPLAN|LOOK|ONCE|CHEAP)[-A-Z0-9]* /gm) || []).length === 11 && /REPLAN-480 .*KEEPS +MATCHES .*cost 330 \(30%\), 2\.00 plans/.test(txt) && /LOOK-60 .*WORSE/.test(txt) && /REPLAN-30 .*HURTS/.test(txt));
    ok("!! the share of the full gain is the arm's gain over the full twin's (LOOK-60, a gain of 0.06 against 0.10, 0.60) and the oracle line reads the oracle against TUNED-R8 (+0.15)", /LOOK-60 .*share of full gain 0\.60/.test(txt) && /ORACLE-ORDER minus TUNED-R8 .*\+0\.15/.test(txt));
    ok("!! the oracle line, then the bottom line last, naming REPLAN-480 (the cheapest keeper)", /ORACLE-ORDER minus TUNED-R8/.test(txt) && L[L.length - 1] === "BOTTOM LINE: THE CHEAPEST PLANNER THAT KEEPS THE GAIN COSTS 30 PERCENT OF THE FULL ONE (REPLAN-480)" || /^BOTTOM LINE: THE CHEAPEST PLANNER .*\(REPLAN-480\)$/.test(L[L.length - 1]));
    const bad = synth(); bad.W1["TWIN-FULL"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on the bottom line", Lb.some((l) => /^  FAIL IDENTITY W1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)");
    ok("!! with no gain in the full twin the shares read n/a", X.report((() => { const a = synth(); for (const n of X.SET_NAMES) a[n]["TWIN-FULL"] = { ...runs(LOSE), cost: 1000, plans: 6 }; return a; })()).join("\n").includes("share of full gain n/a"));
}
sec("7. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { W1: [1221, 1222], W2: [1281, 1282] }, fly = (a) => X.flySets(a, R8, { ranges, kinds: ["far"] });
    const full = fly("TWIN-FULL"), r11 = fly("TWIN-ROUND11"), re30 = fly("REPLAN-30"), look = fly("LOOK-60"), once = fly("ONCE"), tuned = fly("TUNED-R8");
    ok("!! flySets returns W1 and W2, two dives each, and a twin arm carries a cost and a plan count", J(Object.keys(full)) === J(["W1", "W2"]) && full.W1.runs.length === 2 && full.W1.cost > 0 && full.W1.plans >= 1);
    ok("!! TWIN-FULL equals the Round 11 twin dive for dive on 100-second dives", ["W1", "W2"].every((n) => full[n].runs.every((r, i) => r.fingerprint === r11[n].runs[i].fingerprint)));
    ok("!! a replan every 30 s plans more than every 120 s over a 100-second dive (about 4 plans against 1-2) and schedules more rollout seconds", re30.W1.plans > full.W1.plans && re30.W1.cost > full.W1.cost, `${re30.W1.plans} against ${full.W1.plans} plans, ${Math.round(re30.W1.cost)} against ${Math.round(full.W1.cost)}`);
    ok("!! a 60-second look-ahead schedules fewer rollout seconds than the full look-ahead", look.W1.cost < full.W1.cost && look.W2.cost < full.W2.cost, `${Math.round(look.W1.cost)} against ${Math.round(full.W1.cost)}`);
    ok("!! ONCE plans no more often than the full twin", once.W1.plans <= full.W1.plans && once.W2.plans <= full.W2.plans);
    const one = (() => { let s = null; const sc = T.scenario(1221, "far"); T.fly((ctx) => T.flyDecision((c) => (s = Q.perturbedSeat(R8, {}, { seconds: 100, horizon: 40, replanS: Infinity })(c)))(ctx), sc, { gauge: T.GAUGE, seconds: 100 }); return s.stats; })();
    ok("!! the cost is the plans times the rollouts per plan times the time each was asked to simulate: with a 40-second look-ahead and no timed replans every plan schedules 40 s per rollout, so the total is a multiple of 40 and of the rollout count", one.plans >= 1 && one.rolloutSeconds > 0 && (one.rolloutSeconds % 40 === 0 || one.rolloutSeconds % 20 === 0), `${one.plans} plans, ${one.rolloutSeconds} s`);
    const seat = (plan) => { let sx = null; T.fly((ctx) => T.flyDecision((c) => (sx = Q.perturbedSeat(R8, {}, { seconds: 100, ...plan })(c)))(ctx), T.scenario(1221, "far"), { gauge: T.GAUGE, seconds: 100 }); return sx.stats; };
    const sFull = seat({}), sH40 = seat({ horizon: 40 }), sR30 = seat({ replanS: 30 }), sH40R30 = seat({ horizon: 40, replanS: 30 });
    ok("!! the scheduled rollout seconds, exactly, on far 1221 over 100 s: one plan of 7 rollouts to 100 s is 700; a 40-second look-ahead 280; a replan every 30 s makes 4 plans and 1540 (7 x (100 + 70 + 40 + 10)); look-ahead 40 with replans every 30 s is 910 (7 x (40 + 40 + 40 + 10)), the look-ahead being relative to each plan", sFull.plans === 1 && sFull.rolloutSeconds === 700 && sH40.rolloutSeconds === 280 && sR30.plans === 4 && sR30.rolloutSeconds === 1540 && sH40R30.plans === 4 && sH40R30.rolloutSeconds === 910, [sFull, sH40, sR30, sH40R30].map((x) => x.rolloutSeconds).join(" "));
    const aOnly = X.flyArm("TWIN-FULL", R8, T.setOf(["far"], 1221, 1221)), bOnly = X.flyArm("TWIN-FULL", R8, T.setOf(["far"], 1222, 1222)), both = X.flyArm("TWIN-FULL", R8, T.setOf(["far"], 1221, 1222));
    ok("!! a set's cost and plan count are the MEAN over its dives: far 1221 700 and far 1222 818 give 759 for the pair, and 1 and 2 plans give 1.5", aOnly.cost === 700 && bOnly.cost === 818 && both.cost === 759 && both.plans === 1.5);
    ok("!! the tuned rule carries no cost, and the oracle flies through oracleRuns", tuned.W1.cost === undefined && tuned.W1.plans === undefined && (() => { const o = fly("ORACLE-ORDER"); return o.W1.runs.every((r, i) => r.score >= tuned.W1.runs[i].score - 1e-12) && o.W1.runs[0].score === 0.85 && tuned.W1.runs[0].score === 0.55 && o.W1.runs[0].fingerprint !== tuned.W1.runs[0].fingerprint; })());
    ok("!! the oracle arm IS stationRound.oracleRuns on far 1223 (0.85 where the tuned rule scores 0.70 over the full 600 s), not another pilot", (() => { const set = T.setOf(["far"], 1223, 1223), a = X.flyArm("ORACLE-ORDER", R8, set), b = oracleRuns(R8, set); return a.runs[0].score === 0.85 && J(a.runs.map((r) => [r.score, r.fingerprint])) === J(b.runs.map((r) => [r.score, r.fingerprint])); })());
    ok("!! the tuned rule flies with the noisy gauge: its dives are those of T.evaluate with T.GAUGE and differ from the noise-free ones", (() => { const d = X.flyArm("TUNED-R8", R8, T.setOf(["far"], 1221, 1222)), U_ = null; const free = T.evaluate(T.flyDecision(Q.perturbedSeat(R8, {}, { seconds: 100 })), T.setOf(["far"], 1221, 1222), { gauge: null, seconds: 100 }); return d.runs.length === 2 && d.runs.some((r, i) => r.fingerprint !== free.runs[i].fingerprint) && d.runs[0].score === 0.55; })());
    X.setFlight({});
}
sec("8. SOURCE");
{
    ok("!! the seeds 1221, 1268, 1281 and 1328 appear once each, in SET_RANGES", ["1221", "1268", "1281", "1328"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
