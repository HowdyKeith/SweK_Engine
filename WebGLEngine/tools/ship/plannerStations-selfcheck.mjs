// WebGLEngine/tools/ship/plannerStations-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerStations-selfcheck.mjs      (about 14 s: a few 100-second dives)
//
// THE GATE OF tools/ship/plannerStations.mjs (Round 16 of brain/NEEDS_AND_LIMITS.md, registered first).
//   1 SETS       1461-1508 and 1521-1568 of far and both (96 dives each per count), disjoint from every seed of Rounds 1-15; the counts 3, 4, 5, 6; 9 arms in the registered order.
//   2 SCENARIOS  the generator at 3 stations IS needsTask.scenario; with more stations the first three are the same stations and the starting depth is drawn after them; the count is validated; setN orders like setOf.
//   3 ARMS       every arm name is a pilot kind and a station count; an unknown name or count is refused.
//   4 READINGS   the twin's gain at a count (KEEPS / LOSES / HURTS) and the growth from 3 to 6 with the standard error of two independent means (GROWS / FLAT / SHRINKS).
//   5 LINES      the two bottom lines.
//   6 CHECKS     the generator, the identity with the Round 11 twin, the reference gain real; a failed check says NOT WEIGHED.
//   7 REPORT     the lines.
//   8 FLIGHT     real 100-second dives: the five-station task is a different dive from the three-station one and flies without throwing, the full twin at 3 stations equals the Round 11 twin.
//   9 SOURCE     the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: whether the gain grows (that is the experiment).
// SABOTAGE LOG (50 mutants of tools/ship/plannerStations.mjs, run against a copy of this gate): 8 went 0 red on the first pass and all 8 got rows -- the first station's reach clip in the generator (three deep scenarios, 3, 6 and 13, where it binds, now in the equality row), the pilot kind (tuned and twin swapped) and the noisy gauge on a real flight (seeds 1344-1350 where the twin's dive differs from the tuned rule's), the assembly over both sets, the gain being read against the tuned rule OF THE SAME COUNT (a tuned-rule shift of 0.2 at 5 stations), the growth rule (1.5 se is FLAT; a tiny negative growth is FLAT), and the GENERATOR check reading the generator it is given (checksOf takes an injectable generator). None is equivalent. All 50 are red.
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
import * as X from "./plannerStations.mjs";
console.log("plannerStations-selfcheck -- the Round 16 station-count sweep\n");
const code = fs.readFileSync(new URL("./plannerStations.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 20), ...rangeOf(21, 32), ...rangeOf(51, 62), ...rangeOf(71, 82), ...rangeOf(91, 102), ...rangeOf(111, 162), ...rangeOf(171, 222), ...rangeOf(241, 252), ...rangeOf(271, 294), ...rangeOf(301, 312), ...rangeOf(321, 332), ...rangeOf(341, 352), ...rangeOf(421, 432), ...rangeOf(441, 452), ...rangeOf(461, 472), ...rangeOf(481, 492), ...rangeOf(501, 508), ...rangeOf(521, 532), ...rangeOf(541, 552), ...rangeOf(561, 572), ...rangeOf(581, 592), ...rangeOf(601, 612), ...rangeOf(641, 664), ...rangeOf(681, 704), ...rangeOf(721, 744), ...rangeOf(761, 784), ...rangeOf(801, 824), ...rangeOf(841, 864), ...rangeOf(881, 928), ...rangeOf(941, 988), ...rangeOf(1001, 1048), ...rangeOf(1101, 1148), ...rangeOf(1161, 1208), ...rangeOf(1221, 1268), ...rangeOf(1281, 1328), ...rangeOf(1341, 1388), ...rangeOf(1401, 1448)]);
    const seeds = [...rangeOf(1461, 1508), ...rangeOf(1521, 1568)];
    ok("!! the sets are T1 1461-1508 and T2 1521-1568, 96 dives each of far and both per count, and share no seed with Rounds 1-15", J(X.SET_RANGES) === J({ T1: [1461, 1508], T2: [1521, 1568] }) && J(X.SET_NAMES) === J(["T1", "T2"]) && seeds.every((s) => !prior.has(s)) && Object.values(X.SET_RANGES).every(([a, b]) => X.setN(X.HARD, a, b, 4).length === 96) && J(X.HARD) === J(["far", "both"]));
    ok("!! the counts are 3, 4, 5, 6, the reference is 3 and the top is 6", J(X.COUNTS) === J([3, 4, 5, 6]) && X.REFERENCE_N === 3 && X.TOP_N === 6);
    ok("!! 9 arms: the tuned rule and the full twin at each count in that order, then TWIN-ROUND11", X.ARMS.length === 9 && J(X.ARMS.slice(0, 4)) === J(["TUNED-R8@3", "TWIN-FULL@3", "TUNED-R8@4", "TWIN-FULL@4"]) && X.ARMS[6] === "TUNED-R8@6" && X.ARMS[7] === "TWIN-FULL@6" && X.ARMS[8] === "TWIN-ROUND11");
}
sec("2. SCENARIOS");
{
    const same = [[1, "far"], [2, "both"], [7, "plain"], [9, "deep"], [1461, "far"], [1530, "both"], [271, "far"], [3, "deep"], [6, "deep"], [13, "deep"]].every(([s, k]) => J(X.scenarioN(s, k, 3)) === J(T.scenario(s, k)));
    ok("!! at 3 stations the generator equals needsTask.scenario, field for field, on ten scenarios of all four kinds (three of them deep ones where the first station's reach clip binds)", same);
    const a = X.scenarioN(1461, "far", 3), b = X.scenarioN(1461, "far", 6);
    ok("!! with 6 stations the first three are the 3-station ones exactly, there are six, and the rest are other stations", b.stations.length === 6 && J(b.stations.slice(0, 3)) === J(a.stations) && J(b.stations[3]) !== J(b.stations[0]) && b.seed === 1461 && b.kind === "far");
    ok("!! the fields drawn BEFORE the stations (damage, charge) do not depend on the count, and the starting depth, drawn after, does", b.damage0 === a.damage0 && b.frac0 === a.frac0 && b.depth0 !== a.depth0);
    ok("!! the stations are deterministic and frozen: the same call twice is equal, and the scenario cannot be changed", J(X.scenarioN(1461, "far", 5)) === J(X.scenarioN(1461, "far", 5)) && Object.isFrozen(b) && Object.isFrozen(b.stations));
    const thr = (f) => { try { f(); return false; } catch { return true; } };
    ok("!! an unknown kind, a count of 0, 2.5 and a string are refused", thr(() => X.scenarioN(1, "wide", 3)) && thr(() => X.scenarioN(1, "far", 0)) && thr(() => X.scenarioN(1, "far", 2.5)) && thr(() => X.scenarioN(1, "far", "3")));
    const set = X.setN(["far", "both"], 5, 6, 4);
    ok("!! setN lists the kinds in order and the seeds within each: far 5, far 6, both 5, both 6, each with the count's stations", J(set.map((s) => [s.kind, s.seed])) === J([["far", 5], ["far", 6], ["both", 5], ["both", 6]]) && set.every((s) => s.stations.length === 4) && J(set.map((s) => s.seed + s.kind)) === J(T.setOf(["far", "both"], 5, 6).map((s) => s.seed + s.kind)));
}
sec("3. ARMS");
{
    ok("!! TUNED-R8@4 is the tuned rule at 4 stations; TWIN-FULL@6 the full twin at 6; TWIN-ROUND11 the Round 11 twin at the reference count", J(X.parseArm("TUNED-R8@4")) === J({ kind: "TUNED-R8", n: 4 }) && J(X.parseArm("TWIN-FULL@6")) === J({ kind: "TWIN-FULL", n: 6 }) && J(X.parseArm("TWIN-ROUND11")) === J({ kind: "TWIN-ROUND11", n: 3 }));
    const thr = (a) => { try { X.parseArm(a); return false; } catch { return true; } };
    ok("!! an unknown kind, an unregistered count (2, 7) and a bare name are refused", thr("TWIN@3") && thr("TUNED-R8@2") && thr("TWIN-FULL@7") && thr("TUNED-R8") && thr("TWIN-FULL@"));
}
// synthetic: 8 dives per set; tuned scores per count; twin = tuned + a gain per count
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6], JIT = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.01];
const KEEP = [0.1, 0.1, 0.1, 0.12, 0.1, 0.1, 0.08, 0.1], BIG = KEEP.map((x, i) => x * 3 + JIT[i] * 2), LOSE = [0.05, -0.05, 0.05, -0.05, 0.04, -0.04, 0.05, -0.05], HURT = KEEP.map((x) => -x);
const mk = (scores, tag = "", crashed = 0) => ({ runs: scores.map((score, i) => ({ kind: i % 2 ? "both" : "far", score, fingerprint: tag + "f" + i })), score: scores.reduce((a, b) => a + b, 0) / scores.length, crashed, stranded: 0 });
const synth = ({ gain = {}, shift = {}, crashed = {} } = {}) => {
    const au = {};
    for (const s of X.SET_NAMES) {
        au[s] = {};
        for (const n of X.COUNTS) {
            const tuned = BASE.map((b, i) => b + (shift[n] || 0) + JIT[i] * (n - 3)), g = gain[n] || KEEP;
            au[s][`TUNED-R8@${n}`] = mk(tuned, "T" + n, (crashed.tuned || {})[n] || 0); au[s][`TWIN-FULL@${n}`] = mk(tuned.map((t, i) => t + g[i % g.length]), "W", (crashed.twin || {})[n] || 0);
        }
        au[s]["TWIN-ROUND11"] = mk(au[s]["TWIN-FULL@3"].runs.map((r) => r.score), "W");
    }
    return au;
};

sec("4. READINGS");
{
    const au = synth({ gain: { 4: LOSE, 5: HURT, 6: BIG } }), g = (n) => X.gainAt(au, n);
    ok("!! a steady gain KEEPS, a wobble LOSES, a steady loss HURTS, each at its own count", g(3).verdict === "KEEPS" && g(4).verdict === "LOSES" && g(5).verdict === "HURTS" && g(6).verdict === "KEEPS");
    ok("!! the gain carries count, n = 16 dives (two sets of eight), the pooled mean and the counts", g(3).count === 3 && g(3).n === 16 && g(3).better === 16 && Math.abs(g(3).mean - 0.1) < 0.01 && g(5).worse === 16 && Math.abs(g(6).mean - 0.3) < 0.02);
    ok("!! the gain at a count is the twin of THAT count minus the tuned rule of THAT count (a count with no twin gain reads LOSES while the others keep)", (() => { const a = synth({ gain: { 5: [0] } }); return X.gainAt(a, 5).verdict === "LOSES" && X.gainAt(a, 4).verdict === "KEEPS"; })());
    const gr = X.growth(au);
    ok("!! growth is the gain at 6 minus the gain at 3 (about +0.2) with the standard error of two independent means (sqrt(se6^2 + se3^2)), and reads GROWS", Math.abs(gr.mean - (g(6).mean - g(3).mean)) < 1e-12 && Math.abs(gr.se - Math.sqrt(g(6).se ** 2 + g(3).se ** 2)) < 1e-12 && gr.verdict === "GROWS");
    ok("!! FLAT when the two gains are alike and SHRINKS when the gain at 6 is lower by more than 2 se", X.growth(synth()).verdict === "FLAT" && X.growth(synth({ gain: { 3: BIG } })).verdict === "SHRINKS");
    const tsh = synth({ shift: { 5: 0.2 } });
    ok("!! the gain at 5 stations is the twin minus the tuned rule OF 5 STATIONS: a tuned rule 0.2 better at 5 stations leaves the gain at +0.1 (against the tuned rule of 3 stations it would read about -0.1)", Math.abs(X.gainAt(tsh, 5).mean - 0.1) < 0.01 && X.gainAt(tsh, 5).verdict === "KEEPS");
    const mid = X.growth(synth({ gain: { 6: KEEP.map((x) => x + 0.0065) } })), dn = X.growth(synth({ gain: { 6: KEEP.map((x) => x - 0.0002) } }));
    ok("!! a growth of 1.5 se is FLAT (the factor is 2, not 1) and a tiny negative growth is FLAT (not SHRINKS)", mid.mean > 1 * mid.se && mid.mean < 2 * mid.se && mid.verdict === "FLAT" && dn.mean < 0 && dn.mean > -2 * dn.se && dn.verdict === "FLAT");
    const edge = (() => { const a = synth({ gain: { 6: KEEP.map((x, i) => x + 0.0002) } }); return X.growth(a); })();
    ok("!! a growth under 2 se is FLAT (+0.0002 against an se of about 0.004)", edge.verdict === "FLAT" && edge.mean > 0 && edge.mean < 2 * edge.se);
}
sec("5. LINES");
{
    const lines = (spec) => X.bottomLines(synth(spec));
    ok("!! growing gain: the first line says GROWS; steady: IS FLAT IN; falling: SHRINKS", lines({ gain: { 6: BIG } })[0] === "THE GAIN GROWS WITH THE NUMBER OF STATIONS" && lines({})[0] === "THE GAIN IS FLAT IN THE NUMBER OF STATIONS" && lines({ gain: { 3: BIG } })[0] === "THE GAIN SHRINKS WITH THE NUMBER OF STATIONS");
    ok("!! the second line lists the counts that KEEP in order: all four, or 3 and 6 when 4 and 5 lose, or NONE", lines({})[1] === "THE GAIN KEEPS AT N = 3, 4, 5, 6" && lines({ gain: { 4: LOSE, 5: HURT } })[1] === "THE GAIN KEEPS AT N = 3, 6" && lines({ gain: { 3: LOSE, 4: LOSE, 5: LOSE, 6: HURT } })[1] === "THE GAIN KEEPS AT N = NONE");
}
sec("6. CHECKS");
{
    const rows = (au) => X.checksOf(au);
    ok("!! four check rows on a clean audit: GENERATOR, IDENTITY for each set, REFERENCE GAIN IS REAL, all passing", J(rows(synth()).map((c) => c.name)) === J(["GENERATOR", "IDENTITY T1", "IDENTITY T2", "REFERENCE GAIN IS REAL"]) && rows(synth()).every((c) => c.ok));
    const bad = synth(); bad.T2["TWIN-ROUND11"].runs[3].fingerprint = "x";
    ok("!! a Round 11 dive that differs from the full twin at 3 stations breaks IDENTITY T2 only", J(rows(bad).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY T2"]));
    const sw = synth(); for (const s of X.SET_NAMES) sw[s]["TWIN-FULL@3"].runs[0].fingerprint = "z";
    ok("!! the identity compares the FULL twin (a differing tuned-rule dive does not break it)", (() => { const t = synth(); t.T1["TUNED-R8@3"].runs[0].fingerprint = "q"; return rows(t).every((c) => c.ok); })() && J(rows(sw).filter((c) => !c.ok).map((c) => c.name)) === J(["IDENTITY T1", "IDENTITY T2"]));
    ok("!! the generator check reads the generator it is given: one that drops the first station's clip, or adds a station, breaks GENERATOR only", J(X.checksOf(synth(), { gen: (s, k, c) => ({ ...X.scenarioN(s, k, c), depth0: 0 }) }).filter((c) => !c.ok).map((c) => c.name)) === J(["GENERATOR"]) && X.checksOf(synth(), { gen: X.scenarioN }).every((c) => c.ok));
    ok("!! no real gain at 3 stations breaks REFERENCE GAIN IS REAL only (a gain at another count does not stand in)", J(rows(synth({ gain: { 3: LOSE } })).filter((c) => !c.ok).map((c) => c.name)) === J(["REFERENCE GAIN IS REAL"]));
}
sec("7. REPORT");
{
    const L = X.report(synth({ gain: { 4: LOSE, 6: BIG }, crashed: { tuned: { 5: 1 }, twin: { 5: 3 } } })), txt = L.join("\n");
    ok("!! the head names both sets; the four checks pass first", /^ROUND 16/.test(L[0]) && L[0].includes("T1 1461-1508") && L[0].includes("T2 1521-1568") && L.slice(1, 5).every((l) => /^  PASS /.test(l)));
    ok("!! one means row per count (four) with the tuned mean first and the twin second, and the crushed counts summed over both sets (n 5: 2/6)", (txt.match(/^  n [3-6]  0\.[0-9]{3} \| 0\.[0-9]{3} /gm) || []).length === 4 && /n 3  0\.58[78] \| 0\.68[78] /.test(txt) && /n 5  0\.[0-9]+ \| 0\.[0-9]+ +crushed 2\/6 /.test(txt));
    ok("!! the gain block has one row per count with its verdict (KEEPS at 3, LOSES at 4), then the growth line with its verdict", /n 3  \+0\.[0-9]+ .*KEEPS/.test(txt) && /n 4  [+-]0\.[0-9]+ .*LOSES/.test(txt) && /n 6  \+0\.[0-9]+ .*KEEPS/.test(txt) && /growth of the gain from n = 3 to n = 6: \+0\.[0-9]{4} \(se of two independent means 0\.[0-9]{4}\) GROWS/.test(txt));
    ok("!! the two bottom lines come last, each prefixed BOTTOM LINE:", L[L.length - 2] === "BOTTOM LINE: THE GAIN GROWS WITH THE NUMBER OF STATIONS" && L[L.length - 1] === "BOTTOM LINE: THE GAIN KEEPS AT N = 3, 5, 6" );
    const bad = synth(); bad.T1["TWIN-ROUND11"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY T1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("8. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { T1: [1344, 1345], T2: [1349, 1350] }, fly = (a) => X.flySets(a, R8, { ranges });
    const directTuned = T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), X.setN(X.HARD, 1344, 1345, 3), { gauge: T.GAUGE, seconds: 100 }), free3 = T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), X.setN(X.HARD, 1344, 1345, 3), { gauge: null, seconds: 100 });
    const t3 = fly("TUNED-R8@3"), t5 = fly("TUNED-R8@5"), w3 = fly("TWIN-FULL@3"), r11 = fly("TWIN-ROUND11");
    ok("!! flySets returns T1 and T2, four dives each (two seeds of far and both)", J(Object.keys(t3)) === J(["T1", "T2"]) && t3.T1.runs.length === 4 && t3.T2.runs.length === 4);
    ok("!! the full twin at 3 stations equals the Round 11 twin dive for dive", ["T1", "T2"].every((s) => w3[s].runs.every((r, i) => r.fingerprint === r11[s].runs[i].fingerprint)));
    ok("!! the tuned rule at 3 stations is T.evaluate with T.GAUGE, dive for dive, and not the noise-free dive; the twin is a different pilot on far 1344", t3.T1.runs.every((r, i) => r.fingerprint === directTuned.runs[i].fingerprint) && t3.T1.runs.some((r, i) => r.fingerprint !== free3.runs[i].fingerprint) && w3.T1.runs[0].fingerprint !== t3.T1.runs[0].fingerprint);
    ok("!! assemble keys sets then arms: assemble({A: {T1, T2}}) is {T1: {A}, T2: {A}}", J(Object.keys(X.assemble({ A: t3, B: w3 }).T2)) === J(["A", "B"]) && X.assemble({ A: t3 }).T1.A === t3.T1 && X.assemble({ A: t3 }).T2.A === t3.T2);
    ok("!! five stations is a different task: at least one tuned dive differs from the three-station one", ["T1", "T2"].some((s) => t5[s].runs.some((r, i) => r.fingerprint !== t3[s].runs[i].fingerprint)));
    const w5 = fly("TWIN-FULL@5");
    ok("!! the twin flies five stations (four-nearest cap) without throwing, scores in [0, 1], and is a different pilot from the tuned rule on at least one dive", ["T1", "T2"].every((s) => w5[s].runs.every((r) => r.score >= 0 && r.score <= 1)) && ["T1", "T2"].some((s) => w5[s].runs.some((r, i) => r.fingerprint !== t5[s].runs[i].fingerprint)));
    X.setFlight({});
    const thr = (a) => { try { X.flySets(a, R8, { ranges: { T1: [1, 1], T2: [2, 2] } }); return false; } catch { return true; } };
    ok("!! flySets refuses an unknown arm before flying", thr("TWIN-FULL@7"));
}
sec("9. SOURCE");
{
    ok("!! the seeds 1461, 1508, 1521 and 1568 appear once each, in SET_RANGES", ["1461", "1508", "1521", "1568"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
