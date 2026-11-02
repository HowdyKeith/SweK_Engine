// WebGLEngine/tools/ship/plannerEvents-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerEvents-selfcheck.mjs      (about 14 s: two full-length dives and a few 100-second ones)
//
// THE GATE OF tools/ship/plannerEvents.mjs (Round 17 of brain/NEEDS_AND_LIMITS.md, registered first) AND OF THE `onDive` OPTION IT ADDED TO brain/plannerPerturbed.mjs.
//   1 SETS      1601-1648, 1661-1708 and 1721-1768 of far and both (96 dives each, 288 in all), disjoint from every seed of Rounds 1-16; 8 arms in the registered order.
//   2 OPTIONS   every arm name is the planning options the registration says; an unknown name is refused.
//   3 VERDICTS  KEEPS / LOSES / HURTS against TUNED-R8, MATCHES / WORSE against the full twin, the cost share; the better event arm (the first on a tie).
//   4 LINES     the two bottom lines in all four combinations.
//   5 CHECKS    identity with the Round 11 twin on every set, the full twin real; a failed check says NOT WEIGHED.
//   6 REPORT    the lines.
//   7 FLIGHT    the option on real dives: on far 1344 over the full 600 s a plan made once plans 3 times (5966 scheduled rollout seconds) and with onDive 4 times (6873); the option is off by default; the tuned rule and the full twin fly the same dives as before.
//   8 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: whether events help (that is the experiment).
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
import * as X from "./plannerEvents.mjs";
console.log("plannerEvents-selfcheck -- the Round 17 event-replanning sweep\n");
const code = fs.readFileSync(new URL("./plannerEvents.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208), ...rangeOf(1221, 1268), ...rangeOf(1281, 1328), ...rangeOf(1341, 1388), ...rangeOf(1401, 1448), ...rangeOf(1461, 1508), ...rangeOf(1521, 1568)]);
    const seeds = [...rangeOf(1601, 1648), ...rangeOf(1661, 1708), ...rangeOf(1721, 1768)];
    ok("!! the sets are S1 1601-1648, S2 1661-1708 and S3 1721-1768, 96 dives each of far and both (288 in all), and share no seed with Rounds 1-16", J(X.SET_RANGES) === J({ S1: [1601, 1648], S2: [1661, 1708], S3: [1721, 1768] }) && J(X.SET_NAMES) === J(["S1", "S2", "S3"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => T.setOf(X.HARD, a, b).length === 96) && J(X.HARD) === J(["far", "both"]));
    ok("!! 5 search arms in the order REPLAN-30, REPLAN-60, ONCE, EVENT, EVENT-240; 8 arms: TUNED-R8, TWIN-ROUND11, TWIN-FULL, then the five", J(X.SEARCH_ARMS) === J(["REPLAN-30", "REPLAN-60", "ONCE", "EVENT", "EVENT-240"]) && X.ARMS.length === 8 && J(X.ARMS.slice(0, 3)) === J(["TUNED-R8", "TWIN-ROUND11", "TWIN-FULL"]) && J(X.ARMS.slice(3)) === J(X.SEARCH_ARMS));
}
sec("2. OPTIONS");
{
    const p = X.planOf;
    ok("!! TWIN-FULL has no options; REPLAN-n is the replan interval n; ONCE an infinite one; EVENT an infinite one with onDive; EVENT-240 a 240 s one with onDive", J(p("TWIN-FULL")) === "{}" && J(p("REPLAN-30")) === J({ replanS: 30 }) && J(p("REPLAN-60")) === J({ replanS: 60 }) && p("ONCE").replanS === Infinity && Object.keys(p("ONCE")).length === 1 && p("EVENT").replanS === Infinity && p("EVENT").onDive === true && Object.keys(p("EVENT")).length === 2 && J(p("EVENT-240")) === J({ replanS: 240, onDive: true }));
    const thr = (a) => { try { p(a); return false; } catch { return true; } };
    ok("!! an unknown name, an unregistered interval (REPLAN-90), the non-twin arms and the Object prototype's names are refused", thr("REPLAN-90") && thr("TUNED-R8") && thr("TWIN-ROUND11") && thr("EVENT-120") && thr("toString") && thr("constructor"));
}
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6];
const runs = (d) => ({ runs: BASE.map((b, i) => ({ kind: i % 2 ? "both" : "far", score: b + d[i % d.length], fingerprint: "f" + i })), score: 0, crashed: 0, stranded: 0 });
const KEEP = [0.1, 0.1, 0.1, 0.12, 0.1, 0.1, 0.08, 0.1], LOSE = [0.05, -0.05, 0.05, -0.05, 0.04, -0.04, 0.05, -0.05], HURT = KEEP.map((x) => -x), HALF = KEEP.map((x) => x / 2 + 0.01), MORE = KEEP.map((x) => x + 0.05);
const synth = (spec = {}) => {
    const au = {};
    for (const [k, n] of X.SET_NAMES.entries()) {
        au[n] = { "TUNED-R8": runs([0]), "TWIN-ROUND11": runs(KEEP), "TWIN-FULL": { ...runs(KEEP), cost: 1000 + k * 100, plans: 6 } };
        for (const a of X.SEARCH_ARMS) { const s = spec[a] || {}; au[n][a] = { ...runs(s.d || KEEP), cost: (s.cost === undefined ? 500 : s.cost) * (1 + k * 0.1), plans: s.plans || 3 }; }
    }
    return au;
};
sec("3. VERDICTS");
{
    const au = synth({ "REPLAN-30": { d: LOSE }, "REPLAN-60": { d: HURT }, "ONCE": { d: HALF, cost: 200 } }), v = (a) => X.verdictOf(au, a);
    ok("!! a steady gain KEEPS, a wobble LOSES, a steady loss HURTS", v("EVENT").verdict === "KEEPS" && v("REPLAN-30").verdict === "LOSES" && v("REPLAN-60").verdict === "HURTS");
    ok("!! against the full twin: the same gain MATCHES, a wobble WORSE, a half gain WORSE; the pooled counts are over 24 dives (three sets of eight)", v("EVENT").match === "MATCHES" && v("REPLAN-30").match === "WORSE" && v("ONCE").match === "WORSE" && v("EVENT").n === 24 && v("EVENT").better === 24 && v("EVENT").vsFull.mean === 0);
    const wob = KEEP.map((x, i) => x + (i % 2 ? 0.03 : -0.03) - 0.005), within = X.verdictOf(synth({ "EVENT": { d: wob } }), "EVENT");
    ok("!! a deficit inside 2 se still MATCHES and one past 2 se is WORSE; an arm better than the full twin MATCHES", within.vsFull.mean < 0 && within.match === "MATCHES" && -within.vsFull.mean < 2 * within.vsFull.se && X.verdictOf(synth({ "EVENT": { d: KEEP.map((x) => x - 0.03) } }), "EVENT").match === "WORSE" && X.verdictOf(synth({ "EVENT": { d: MORE } }), "EVENT").match === "MATCHES");
    const split = (() => { const a = synth(); a.S1.EVENT = runs(HURT); a.S2.EVENT = runs(KEEP); a.S3.EVENT = runs(LOSE); return X.verdictOf(a, "EVENT"); })();
    ok("!! the verdict pools ALL THREE sets (n 24): a hurt on S1, a gain on S2 and a wobble on S3 is not the verdict of any one set", split.n === 24 && split.verdict === "LOSES");
    ok("!! the cost share is the arm's mean cost over the three sets over the full twin's: 500 / 1000 = 0.5, 200 / 1000 = 0.2; costOf is null for the tuned rule; playsOf the mean plans", Math.abs(v("EVENT").share - 0.5) < 1e-9 && Math.abs(v("ONCE").share - 0.2) < 1e-9 && Math.abs(X.costOf(au, "EVENT") - 550) < 1e-9 && Math.abs(X.costOf(au, "TWIN-FULL") - 1100) < 1e-9 && X.costOf(au, "TUNED-R8") === null && X.playsOf(au, "TWIN-FULL") === 6 && X.playsOf(au, "TUNED-R8") === null);
    ok("!! the better event arm is the one with the higher pooled gain over TUNED-R8, the first (EVENT) on a tie", X.betterEvent(synth({ "EVENT": { d: HALF }, "EVENT-240": { d: KEEP } })).arm === "EVENT-240" && X.betterEvent(synth({ "EVENT": { d: KEEP }, "EVENT-240": { d: HALF } })).arm === "EVENT" && X.betterEvent(synth()).arm === "EVENT");
}
sec("4. LINES");
{
    const L = (spec) => X.bottomLines(synth(spec));
    ok("!! EVENT better than ONCE (real pooled difference) says ADD, EVENT equal to ONCE says DO NOT ADD", L({ "ONCE": { d: HALF } })[0] === "EVENTS ADD TO A PLAN MADE ONCE" && L({})[0] === "EVENTS DO NOT ADD TO A PLAN MADE ONCE" && L({ "ONCE": { d: LOSE } })[0] === "EVENTS ADD TO A PLAN MADE ONCE");
    ok("!! the clock line: an event arm that keeps, matches and costs 50 percent says MATCH AT 50 PERCENT with its name; EVENT-240 named when it is the better", L({})[1] === "EVENTS MATCH THE CLOCK AT 50 PERCENT OF ITS COST (EVENT)" && L({ "EVENT": { d: HALF }, "EVENT-240": { cost: 700 } })[1] === "EVENTS MATCH THE CLOCK AT 70 PERCENT OF ITS COST (EVENT-240)");
    ok("!! no match when the better event arm LOSES, is WORSE than the full twin, or costs the full twin's cost or more", L({ "EVENT": { d: LOSE }, "EVENT-240": { d: LOSE } })[1] === "EVENTS DO NOT MATCH THE CLOCK" && L({ "EVENT": { d: HALF }, "EVENT-240": { d: HALF } })[1] === "EVENTS DO NOT MATCH THE CLOCK" && L({ "EVENT": { cost: 1000 }, "EVENT-240": { cost: 1200 } })[1] === "EVENTS DO NOT MATCH THE CLOCK" && L({ "EVENT": { cost: 999 } })[1].includes("100 PERCENT"));
    ok("!! the share is rounded, not cut: a cost of 296 against 1000 says 30 PERCENT", /AT 30 PERCENT OF ITS COST \(EVENT\)$/.test(L({ "EVENT": { cost: 296 } })[1]));
}
sec("5. CHECKS");
{
    const rows = (au) => X.checksOf(au);
    ok("!! four check rows on a clean audit: IDENTITY for each of the three sets, then FULL IS REAL; all pass", J(rows(synth()).map((c) => c.name)) === J(["IDENTITY S1", "IDENTITY S2", "IDENTITY S3", "FULL IS REAL"]) && rows(synth()).every((c) => c.ok));
    const bad = synth(); bad.S3["TWIN-FULL"].runs[2].fingerprint = "x";
    ok("!! a full-twin dive that differs from the Round 11 twin breaks IDENTITY S3 only", J(rows(bad).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY S3"]));
    const ng = synth(); for (const n of X.SET_NAMES) ng[n]["TWIN-FULL"] = { ...runs(LOSE), cost: 1000, plans: 6 };
    ok("!! a full twin with no real gain on these seeds breaks FULL IS REAL only", J(rows(ng).filter((c) => !c.ok).map((c) => c.name)) === J(["FULL IS REAL"]));
}
sec("6. REPORT");
{
    const L = X.report(synth({ "ONCE": { d: HALF, cost: 200, plans: 2 }, "EVENT-240": { cost: 330, plans: 5 } })), txt = L.join("\n");
    ok("!! the head names the three sets; the four checks pass first; the full twin's line carries its gain, cost and plans", /^ROUND 17/.test(L[0]) && L[0].includes("S1 1601-1648") && L[0].includes("S3 1721-1768") && L.slice(1, 5).every((l) => /^  PASS /.test(l)) && /TWIN-FULL minus TUNED-R8: \+0\.10.*cost 1100 rollout seconds per dive, 6\.00 plans/.test(txt));
    ok("!! one row per search arm (five) with verdict, match, cost and share: ONCE KEEPS WORSE at 20%, EVENT-240 KEEPS MATCHES at 33% with 5.00 plans", (txt.match(/^  (REPLAN|ONCE|EVENT)[-A-Z0-9]* /gm) || []).length === 5 && /ONCE +.*KEEPS +WORSE .*cost 220 \(20%\), 2\.00 plans/.test(txt) && /EVENT-240 .*KEEPS +MATCHES .*\(33%\), 5\.00 plans/.test(txt));
    ok("!! the two difference lines, then the two bottom lines last", /EVENT minus ONCE: /.test(txt) && /EVENT-240 minus REPLAN-60: /.test(txt) && L[L.length - 2].startsWith("BOTTOM LINE: EVENTS ") && L[L.length - 1].startsWith("BOTTOM LINE: EVENTS "));
    ok("!! the difference lines read the right arms: EVENT minus ONCE is +0.0 something (a half gain against a full one, about +0.04) and EVENT-240 minus REPLAN-60 is 0", /EVENT minus ONCE: \+0\.04/.test(txt) && /EVENT-240 minus REPLAN-60: [+-]0\.0000/.test(txt));
    const bad = synth(); bad.S1["TWIN-FULL"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY S1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
    ok("!! with no gain in the full twin the shares read n/a", X.report((() => { const a = synth(); for (const n of X.SET_NAMES) a[n]["TWIN-FULL"] = { ...runs(LOSE), cost: 1000, plans: 6 }; return a; })()).join("\n").includes("share of full gain n/a"));
}
sec("7. FLIGHT");
{
    const seat = (plan, sc, seconds) => { let sx = null; T.fly((ctx) => T.flyDecision((c) => (sx = Q.perturbedSeat(R8, {}, plan)(c)))(ctx), sc, { gauge: T.GAUGE, ...(seconds ? { seconds } : {}) }); return sx.stats; };
    const sc = T.scenario(1344, "far"), once = seat({ replanS: Infinity }, sc), ev = seat({ replanS: Infinity, onDive: true }, sc);
    ok("!! on far 1344 over the full 600 s, a plan made once plans 3 times (5966 scheduled rollout seconds) and with onDive 4 times (6873): the event is one extra plan, at the moment the boat leaves the surface", once.plans === 3 && Math.round(once.rolloutSeconds) === 5966 && ev.plans === 4 && Math.round(ev.rolloutSeconds) === 6873, `${once.plans}/${Math.round(once.rolloutSeconds)} and ${ev.plans}/${Math.round(ev.rolloutSeconds)}`);
    const off = seat({ replanS: Infinity, onDive: false }, sc), dflt = seat({ replanS: Infinity }, sc);
    ok("!! the option is off by default: onDive false and unspecified plan exactly alike", off.plans === dflt.plans && off.rolloutSeconds === dflt.rolloutSeconds && dflt.plans === once.plans);
    X.setFlight({ seconds: 100 });
    const ranges = { S1: [1344, 1345], S2: [1349, 1350], S3: [1351, 1352] }, fly = (a) => X.flySets(a, R8, { ranges });
    const full = fly("TWIN-FULL"), r11 = fly("TWIN-ROUND11"), tuned = fly("TUNED-R8"), evA = fly("EVENT");
    ok("!! flySets returns S1, S2 and S3, four dives each; a twin arm carries cost and plans, the tuned rule neither", J(Object.keys(full)) === J(["S1", "S2", "S3"]) && full.S1.runs.length === 4 && full.S1.cost > 0 && full.S1.plans >= 1 && tuned.S1.cost === undefined && tuned.S1.plans === undefined && evA.S2.cost > 0);
    ok("!! the full twin equals the Round 11 twin dive for dive on 100-second dives", ["S1", "S2", "S3"].every((n) => full[n].runs.every((r, i) => r.fingerprint === r11[n].runs[i].fingerprint)));
    const direct = T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), T.setOf(X.HARD, 1344, 1345), { gauge: T.GAUGE, seconds: 100 });
    ok("!! the tuned rule is T.evaluate's tuned dive with the noisy gauge, and the twin is another pilot on far 1344", tuned.S1.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint) && full.S1.runs[0].fingerprint !== tuned.S1.runs[0].fingerprint);
    X.setFlight({});
    ok("!! assemble keys sets then arms", J(Object.keys(X.assemble({ A: full, B: tuned }).S3)) === J(["A", "B"]) && X.assemble({ A: full }).S2.A === full.S2);
}
sec("8. SOURCE");
{
    ok("!! the seeds 1601, 1648, 1661, 1708, 1721 and 1768 appear once each, in SET_RANGES", ["1601", "1648", "1661", "1708", "1721", "1768"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
