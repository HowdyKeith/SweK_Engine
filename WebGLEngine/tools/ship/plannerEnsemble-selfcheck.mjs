// WebGLEngine/tools/ship/plannerEnsemble-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerEnsemble-selfcheck.mjs      (about 20 s: four full-length dives with the ensemble and a few 100-second ones)
//
// THE GATE OF tools/ship/plannerEnsemble.mjs (Round 23 of brain/NEEDS_AND_LIMITS.md, registered first) AND OF THE `ensemble` OPTION IT ADDED TO brain/plannerPerturbed.mjs.
//   1 SETS      3501-3650 and 3701-3850 of far and both (300 dives a set, 600 an arm), disjoint from every seed of Rounds 1-22; six arms in the registered order.
//   2 OPTIONS   every arm name is the planning options the registration says; an unknown name is refused.
//   3 VERDICTS  KEEPS / LOSES / HURTS against TUNED-R8, BETTER / SAME / WORSE against the point-estimate twin.
//   4 LINES     the two bottom lines in all their cases.
//   5 CHECKS    identity with the Round 11 twin, the point-estimate twin real; a failed check says NOT WEIGHED.
//   6 REPORT    the lines.
//   7 FLIGHT    the option on real dives: the default ensemble [0] is the old behaviour, an ensemble triples the scheduled rollout seconds on a fixed dive and changes far 3506 from 0.70 to 0.85.
//   8 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: whether planning under uncertainty helps (that is the experiment).
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
import * as Q from "../../brain/plannerPerturbed.mjs";
import * as N from "../../physics/mechanics/subNeeds.mjs";
import { startOf } from "./plannerRound.mjs";
import * as X from "./plannerEnsemble.mjs";
console.log("plannerEnsemble-selfcheck -- the Round 23 risk-aware twin\n");
const code = fs.readFileSync(new URL("./plannerEnsemble.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208), ...rangeOf(1221, 1268), ...rangeOf(1281, 1328), ...rangeOf(1341, 1388), ...rangeOf(1401, 1448), ...rangeOf(1461, 1508), ...rangeOf(1521, 1568), ...rangeOf(1601, 1648), ...rangeOf(1661, 1708), ...rangeOf(1721, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2248), ...rangeOf(2261, 2308), ...rangeOf(2401, 3400)]);
    const seeds = [...rangeOf(3501, 3650), ...rangeOf(3701, 3850)];
    ok("!! the sets are E1 3501-3650 and E2 3701-3850, 300 dives each of far and both (600 an arm), and share no seed with Rounds 1-22", J(X.SET_RANGES) === J({ E1: [3501, 3650], E2: [3701, 3850] }) && J(X.SET_NAMES) === J(["E1", "E2"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 300) && J(X.HARD) === J(["far", "both"]));
    ok("!! three ensemble arms ENS-0.05, ENS-0.10, ENS-0.20; six arms: TUNED-R8, TWIN-ROUND11, TWIN-FULL, then the three", J(X.ENS_ARMS) === J(["ENS-0.05", "ENS-0.10", "ENS-0.20"]) && J(X.ARMS) === J(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL", "ENS-0.05", "ENS-0.10", "ENS-0.20"]));
}
sec("2. OPTIONS");
{
    const p = X.planOf, thr = (a) => { try { p(a); return false; } catch { return true; } };
    ok("!! TWIN-FULL has no options; ENS-d has the ensemble [-d, 0, +d] for d = 0.05, 0.1, 0.2", J(p("TWIN-FULL")) === "{}" && J(p("ENS-0.05")) === J({ ensemble: [-0.05, 0, 0.05] }) && J(p("ENS-0.10")) === J({ ensemble: [-0.1, 0, 0.1] }) && J(p("ENS-0.20")) === J({ ensemble: [-0.2, 0, 0.2] }));
    ok("!! an unknown name, an unregistered offset, the non-twin arms and the Object prototype's names are refused", thr("ENS-0.15") && thr("ENS-0.1") && thr("TUNED-R8") && thr("TWIN-ROUND11") && thr("toString") && thr("constructor"));
}
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6];
const runs = (d) => ({ runs: BASE.map((b, i) => ({ kind: i % 2 ? "both" : "far", score: b + d[i % d.length], fingerprint: "f" + i })), score: 0, crashed: 0, stranded: 0 });
const KEEP = [0.1, 0.1, 0.1, 0.12, 0.1, 0.1, 0.08, 0.1], LOSE = [0.05, -0.05, 0.05, -0.05, 0.04, -0.04, 0.05, -0.05], HURT = KEEP.map((x) => -x), MORE = KEEP.map((x) => x + 0.05);
const synth = (spec = {}) => {
    const au = {};
    for (const [k, n] of X.SET_NAMES.entries()) {
        au[n] = { "TUNED-R8": runs([0]), "TWIN-ROUND11": runs(KEEP), "TWIN-FULL": { ...runs(KEEP), cost: 1000 + k * 100, plans: 6 } };
        for (const a of X.ENS_ARMS) { const s = spec[a] || {}; au[n][a] = { ...runs(s.d || KEEP), cost: (s.cost === undefined ? 3000 : s.cost) * (1 + k * 0.1), plans: 6 }; }
    }
    return au;
};
sec("3. VERDICTS");
{
    const au = synth({ "ENS-0.05": { d: MORE }, "ENS-0.10": { d: LOSE }, "ENS-0.20": { d: HURT } }), v = (a) => X.verdictOf(au, a);
    ok("!! against the tuned rule: a steady gain KEEPS, a wobble LOSES, a steady loss HURTS", v("ENS-0.05").verdict === "KEEPS" && v("ENS-0.10").verdict === "LOSES" && v("ENS-0.20").verdict === "HURTS");
    ok("!! against the point-estimate twin: +0.05 over it is BETTER, a wobble around it is WORSE only if it is below by more than 2 se (the wobble LOSE against KEEP is far below: WORSE), the same gain is SAME", v("ENS-0.05").rel === "BETTER" && v("ENS-0.10").rel === "WORSE" && v("ENS-0.20").rel === "WORSE" && X.verdictOf(synth(), "ENS-0.05").rel === "SAME");
    const wob = KEEP.map((x, i) => x + (i % 2 ? 0.03 : -0.03) - 0.005);
    ok("!! a deficit inside 2 se is SAME (mean -0.005, se about 0.0075), one past 2 se is WORSE; an excess inside 2 se is SAME too", X.verdictOf(synth({ "ENS-0.05": { d: wob } }), "ENS-0.05").rel === "SAME" && X.verdictOf(synth({ "ENS-0.05": { d: KEEP.map((x, i) => x + (i % 2 ? 0.03 : -0.03) + 0.005) } }), "ENS-0.05").rel === "SAME");
    ok("!! the pooled n is 16 (two sets of eight) and the counts are the arm's against TUNED-R8; the cost is the mean over both sets (3000 and 3300: 3150; the twin 1050)", v("ENS-0.05").n === 16 && v("ENS-0.05").better === 16 && Math.abs(v("ENS-0.05").cost - 3150) < 1e-9 && Math.abs(X.costOf(au, "TWIN-FULL") - 1050) < 1e-9 && X.costOf(au, "TUNED-R8") === null);
}
sec("4. LINES");
{
    const L = (spec) => X.bottomLines(synth(spec));
    ok("!! equal to the twin: DOES NOT BEAT and DOES NOT HURT", J(L({})) === J(["RISK-AWARE PLANNING DOES NOT BEAT THE POINT-ESTIMATE TWIN", "RISK-AWARE PLANNING DOES NOT HURT"]));
    ok("!! a better arm is named (several in order); a worse arm is named in the second line; both can hold", L({ "ENS-0.05": { d: MORE } })[0] === "RISK-AWARE PLANNING BEATS THE POINT-ESTIMATE TWIN (ENS-0.05)" && L({ "ENS-0.05": { d: MORE }, "ENS-0.20": { d: MORE } })[0] === "RISK-AWARE PLANNING BEATS THE POINT-ESTIMATE TWIN (ENS-0.05, ENS-0.20)" && L({ "ENS-0.20": { d: HURT } })[1] === "RISK-AWARE PLANNING HURTS (ENS-0.20)" && J(L({ "ENS-0.05": { d: MORE }, "ENS-0.10": { d: HURT } })) === J(["RISK-AWARE PLANNING BEATS THE POINT-ESTIMATE TWIN (ENS-0.05)", "RISK-AWARE PLANNING HURTS (ENS-0.10)"]) && L({ "ENS-0.10": { d: HURT }, "ENS-0.20": { d: HURT } })[1] === "RISK-AWARE PLANNING HURTS (ENS-0.10, ENS-0.20)");
}
sec("5. CHECKS");
{
    const rows = (au) => X.checksOf(au);
    ok("!! three check rows on a clean audit: IDENTITY E1, IDENTITY E2, FULL IS REAL; all pass", J(rows(synth()).map((c) => c.name)) === J(["IDENTITY E1", "IDENTITY E2", "FULL IS REAL"]) && rows(synth()).every((c) => c.ok));
    const bad = synth(); bad.E2["TWIN-ROUND11"].runs[3].fingerprint = "x";
    ok("!! a Round 11 dive that differs from the point-estimate twin breaks IDENTITY E2 only", J(rows(bad).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY E2"]));
    const ng = synth(); for (const n of X.SET_NAMES) ng[n]["TWIN-FULL"] = { ...runs(LOSE), cost: 1000, plans: 6 };
    ok("!! a point-estimate twin with no real gain breaks FULL IS REAL only", J(rows(ng).filter((c) => !c.ok).map((c) => c.name)) === J(["FULL IS REAL"]));
    const idt = synth(); idt.E1["TUNED-R8"].runs[2].fingerprint = "z";
    ok("!! the identity compares the point-estimate twin with the Round 11 twin (a differing tuned-rule dive does not break it)", rows(idt).every((c) => c.ok));
}
sec("6. REPORT");
{
    const L = X.report(synth({ "ENS-0.05": { d: MORE }, "ENS-0.20": { d: HURT } })), txt = L.join("\n");
    ok("!! the head names both sets; the three checks pass first; the twin's line carries its gain and cost (1050)", /^ROUND 23/.test(L[0]) && L[0].includes("E1 3501-3650") && L[0].includes("E2 3701-3850") && L.slice(1, 4).every((l) => /^  PASS /.test(l)) && /TWIN-FULL minus TUNED-R8: \+0\.10.*cost 1050 rollout seconds per dive/.test(txt));
    ok("!! one row per ensemble arm with its verdict, its relation to the twin (value and se) and its cost: ENS-0.05 KEEPS BETTER at +0.05 over the twin, ENS-0.20 HURTS WORSE", /ENS-0\.05 .*KEEPS +BETTER +vs the twin \+0\.0500 \(se 0\.0[0-9]+\) +cost 3150/.test(txt) && /ENS-0\.10 .*KEEPS +SAME +vs the twin [+-]0\.0000/.test(txt) && /ENS-0\.20 .*HURTS +WORSE +vs the twin -0\.2/.test(txt));
    const lower = X.report(synth({ "ENS-0.05": { d: KEEP.map((x) => x / 2) } })).join("\n");
    ok("!! an arm that keeps a gain over the tuned rule but is BELOW the twin prints the negative difference from the twin (-0.0500), not a plus sign from its own gain", /ENS-0\.05 .*KEEPS +WORSE +vs the twin -0\.0500/.test(lower) && !/vs the twin \+-/.test(lower));
    ok("!! the two bottom lines come last", L[L.length - 2] === "BOTTOM LINE: RISK-AWARE PLANNING BEATS THE POINT-ESTIMATE TWIN (ENS-0.05)" && L[L.length - 1] === "BOTTOM LINE: RISK-AWARE PLANNING HURTS (ENS-0.20)");
    const bad = synth(); bad.E1["TWIN-ROUND11"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY E1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("7. FLIGHT");
{
    const seat = (plan, sc) => { let sx = null; T.fly((ctx) => T.flyDecision((c) => (sx = Q.perturbedSeat(R8, {}, plan)(c)))(ctx), sc, { gauge: T.GAUGE }); return sx.stats; };
    const fly = (plan, sc) => T.evaluate(T.flyDecision(Q.perturbedSeat(R8, {}, plan)), [sc], { gauge: T.GAUGE }).runs[0].score;
    const sc0 = T.scenario(3501, "far"), dflt = seat({}, sc0), zero = seat({ ensemble: [0] }, sc0), ens = seat({ ensemble: [-0.1, 0, 0.1] }, sc0);
    ok("!! the default ensemble is [0]: no option and ensemble [0] schedule the same rollout seconds (8635 on far 3501) and plan the same number of times", dflt.rolloutSeconds === zero.rolloutSeconds && dflt.plans === zero.plans && Math.round(dflt.rolloutSeconds) === 8635);
    ok("!! a three-offset ensemble schedules about three times the rollout seconds per plan: 34649 on far 3501 against 8635 (it makes 5 plans against 4 here, so the ratio is a little over 3: pinned, not derived)", Math.round(ens.rolloutSeconds) === 34649 && ens.plans >= dflt.plans && ens.rolloutSeconds / ens.plans > 2.5 * (dflt.rolloutSeconds / dflt.plans), `${Math.round(ens.rolloutSeconds)} / ${ens.plans} plans against ${Math.round(dflt.rolloutSeconds)} / ${dflt.plans}`);
    const sc6 = T.scenario(3506, "far");
    ok("!! the ensemble changes a dive: far 3506 scores 0.70 with the point estimate and 0.85 with the offsets -0.1, 0, +0.1", Math.abs(fly({}, sc6) - 0.7) < 1e-9 && Math.abs(fly({ ensemble: [-0.1, 0, 0.1] }, sc6) - 0.85) < 1e-9);
    ok("!! an ensemble of one offset [x] is the START error x: the offset [-0.1] equals the Round 13 error start -0.1 (the seat's own error option) dive for dive", (() => { const a = T.evaluate(T.flyDecision(Q.perturbedSeat(R8, {}, { ensemble: [-0.1], seconds: 100 })), [T.scenario(3501, "far"), T.scenario(3506, "far")], { gauge: T.GAUGE, seconds: 100 }), b = T.evaluate(T.flyDecision(Q.perturbedSeat(R8, { start: -0.1 }, { seconds: 100 })), [T.scenario(3501, "far"), T.scenario(3506, "far")], { gauge: T.GAUGE, seconds: 100 }); return a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint); })());
    X.setFlight({ seconds: 100 });
    const ranges = { E1: [1344, 1345], E2: [1349, 1350] }, fl = (a) => X.flySets(a, R8, { ranges });
    const full = fl("TWIN-FULL"), r11 = fl("TWIN-ROUND11"), tuned = fl("TUNED-R8"), e1 = fl("ENS-0.10");
    ok("!! flySets returns E1 and E2, four dives each; a twin arm carries cost and plans, the tuned rule neither; the ensemble costs more than the twin", J(Object.keys(full)) === J(["E1", "E2"]) && full.E1.runs.length === 4 && tuned.E1.cost === undefined && e1.E1.cost > full.E1.cost * 2);
    ok("!! the point-estimate twin equals the Round 11 twin dive for dive on 100-second dives; the tuned rule is T.evaluate's with the noisy gauge", ["E1", "E2"].every((n) => full[n].runs.every((r, i) => r.fingerprint === r11[n].runs[i].fingerprint)) && tuned.E1.runs.every((r, i) => r.fingerprint === T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), T.setOf(X.HARD, 1344, 1345), { gauge: T.GAUGE, seconds: 100 }).runs[i].fingerprint));
    const one = X.flyArm("TWIN-FULL", R8, T.setOf(["far"], 1344, 1344)), two = X.flyArm("TWIN-FULL", R8, T.setOf(["far"], 1345, 1345)), pair = X.flyArm("TWIN-FULL", R8, T.setOf(["far"], 1344, 1345));
    ok("!! a set's cost and plan count are the MEAN over its dives, exactly: far 1344 and far 1345 over 100 s schedule 782 and 726.5 rollout seconds (2 plans each), so the pair is 754.25 and 2", one.cost === 782 && two.cost === 726.5 && pair.cost === 754.25 && one.plans === 2 && pair.plans === 2);
    X.setFlight({});
    ok("!! assemble keys sets then arms", J(Object.keys(X.assemble({ A: full, B: tuned }).E2)) === J(["A", "B"]) && X.assemble({ A: full }).E1.A === full.E1 && X.assemble({ A: full }).E2.A === full.E2);
}
sec("7b. THE ENSEMBLE'S ARITHMETIC");
{
    const sc = T.scenario(3501, "both"), x = startOf(sc), stations = sc.stations.map((q) => ({ x: q.x, y: q.y, depth: q.depth, visited: false })), obs = { t: 0, stations, r: N.readings(x.model, x.nd, x.st) };
    const q = U.normalise(R8, U.WIDE_BOUNDS), cap = N.CLASSES[T.CLASS].capacityJ, ema = sc.frac0, clamp01 = (v) => Math.max(0, Math.min(1, v));
    const nd = (o) => ({ ...N.initialNeeds(T.CLASS, { crushDepth: T.CRUSH }), energy: clamp01(ema * (1 + o)) * cap, damage: obs.r.damage, flood: obs.r.flood || 0 });
    const roll = (o, order) => Q.rollout(x.model, x.st, nd(o), stations, 0, order, q, Q.errOf({}), 600);
    const plan = (ens) => Q.twinPlan(x.model, x.st, obs, ema, q, Q.errOf({}), -1, 600, ens);
    const single = plan([0]), triple = plan([-0.5, 0, 0.5]), same3 = plan([0, 0, 0]), same2 = plan([0, 0]);
    ok("!! an ensemble is the MEAN of the rollouts, not the sum and not a fixed divisor: [0, 0] and [0, 0, 0] give exactly the single plan's values, and the single plan's nearest value is the manual rollout plus the 1e-6 tie bonus (both 3501, 600 s: 0.775 at the point estimate)", Object.keys(single.values).every((k) => Math.abs(same2.values[k] - single.values[k]) < 1e-12 && Math.abs(same3.values[k] - single.values[k]) < 1e-12) && Object.keys(same3.values).length === Object.keys(single.values).length && Math.abs(single.values.nearest - (roll(0, null) + 1e-6)) < 1e-12);
    const manual = (order) => ([-0.5, 0, 0.5].reduce((a, o) => a + roll(o, order), 0) / 3);
    ok("!! with the offsets -0.5, 0, +0.5 the value of nearest-first is the mean of THREE rollouts (each at its own starting energy, the first not standing in for the others) and so is every order's (two open stations here: 1>0 and 0>1 besides nearest-first)", Math.abs(triple.values.nearest - (manual(null) + 1e-6)) < 1e-12 && Object.keys(triple.values).filter((k) => k !== "nearest").every((k) => Math.abs(triple.values[k] - manual(k.split(">").map(Number))) < 1e-12) && Object.keys(triple.values).length === 3);
    ok("!! the offsets matter: the three rollouts of nearest-first differ (the starting energies -0.5, 0, +0.5 give different scores), so the mean is not the first one's (both 3501: 0.550, 0.775 and 1.000; the mean 0.775)", new Set([-0.5, 0, 0.5].map((o) => roll(o, null))).size >= 2 && Math.abs(manual(null) - roll(-0.5, null)) > 1e-6);
}
sec("8. SOURCE");
{
    ok("!! the seeds 3501, 3650, 3701 and 3850 appear once each, in SET_RANGES", ["3501", "3650", "3701", "3850"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
