// WebGLEngine/tools/ship/plannerCap-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/plannerCap-selfcheck.mjs      (about 10 s: hand fixtures and a few 100-second five-station dives)
//
// THE GATE OF tools/ship/plannerCap.mjs (Round 24 of brain/NEEDS_AND_LIMITS.md, registered first) AND, WITH brain/plannerPerturbed-selfcheck.mjs, OF THE `maxStations` OPTION IT ADDED TO brain/plannerPerturbed.mjs.
//   1 SETS      3901-3996 and 4001-4096 of far and both on five stations (192 dives a set, 384 an arm), disjoint from every seed of Rounds 1-23; six arms in the registered order.
//   2 OPTIONS   every arm name is the planning options the registration says (CAP-n = maxStations n, TWIN-FULL = none); an unknown name is refused.
//   3 VERDICTS  KEEPS / LOSES / HURTS against TUNED-R8, BETTER / SAME / WORSE against CAP-4 (the shipped cap).
//   4 LINES     the two bottom lines in all their cases.
//   5 CHECKS    CAP-4 equals the default planner, the default planner real; a failed check says NOT WEIGHED.
//   6 REPORT    the lines.
//   7 FLIGHT    real five-station 100-second dives: CAP-4 equals TWIN-FULL dive for dive, CAP-5 changes a dive and costs about three times as much, CAP-2 about an eighth as much; the tuned rule is T.evaluate's.
//   8 SOURCE    the seeds appear in one place; no clock, random or file.
// NOT CHECKED, said plainly: whether the cap costs gain at five stations (that is the experiment).
// SABOTAGE LOG (30 mutants of tools/ship/plannerCap.mjs, run against a copy of this gate, each applied alone): 22 went red by name on the first pass; 6 went 0 red and got rows -- the reference of the BETTER/WORSE reading (the fixture had the default planner equal to CAP-4, so reading against it was invisible: a fixture where it is better), the 2 se threshold on both sides (the old rows sat at 0.7 se and 5 se: now 1.5 and 2.5 se), line 2 naming CAP-5 (a worse CAP-5 must leave line 2 alone), the twin's line pooled over one set only, and assemble keeping the first set's results for every set (the row checked M1 only); all 6 then red. 2 more (the plan dropped from the seat, the flight's seconds ignored) make every dive a full 600 seconds and the gate does not finish inside the harness's 200 s: counted as caught by the gate not finishing, not as a row. The maxStations option itself (brain/plannerPerturbed.mjs) is covered by its own gate, brain/plannerPerturbed-selfcheck.mjs, whose log carries its mutants.
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
import * as X from "./plannerCap.mjs";
console.log("plannerCap-selfcheck -- the Round 24 station cap\n");
const code = fs.readFileSync(new URL("./plannerCap.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const rangeOf = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const R8 = { alpha: 0.001, low: 0.38036, high: 0.68938, ramp: 20, cap: 0.88615 };

sec("1. SETS");
{
    const prior = new Set([...rangeOf(1, 1100), ...rangeOf(1101, 1208), ...rangeOf(1221, 1328), ...rangeOf(1341, 1448), ...rangeOf(1461, 1568), ...rangeOf(1601, 1768), ...rangeOf(1801, 2100), ...rangeOf(2201, 2308), ...rangeOf(2401, 3400), ...rangeOf(3501, 3850)]);
    const seeds = [...rangeOf(3901, 3996), ...rangeOf(4001, 4096)];
    ok("!! the sets are M1 3901-3996 and M2 4001-4096, 96 seeds of each kind (192 dives a set, 384 an arm), on five stations, and share no seed with Rounds 1-23", J(X.SET_RANGES) === J({ M1: [3901, 3996], M2: [4001, 4096] }) && J(X.SET_NAMES) === J(["M1", "M2"]) && X.STATIONS === 5 && seeds.every((s) => !prior.has(s)) && seeds.length === 192);
    ok("!! four cap arms CAP-2, CAP-3, CAP-4, CAP-5 (the smaller ones CAP-2 and CAP-3); six arms: TUNED-R8, TWIN-FULL, then the four", J(X.CAP_ARMS) === J(["CAP-2", "CAP-3", "CAP-4", "CAP-5"]) && J(X.SMALLER) === J(["CAP-2", "CAP-3"]) && J(X.ARMS) === J(["TUNED-R8", "TWIN-FULL", "CAP-2", "CAP-3", "CAP-4", "CAP-5"]));
}
sec("2. OPTIONS");
{
    const p = X.planOf, thr = (a) => { try { p(a); return false; } catch { return true; } };
    ok("!! TWIN-FULL has no options; CAP-n has maxStations n for n = 2, 3, 4, 5", J(p("TWIN-FULL")) === "{}" && J(p("CAP-2")) === J({ maxStations: 2 }) && J(p("CAP-3")) === J({ maxStations: 3 }) && J(p("CAP-4")) === J({ maxStations: 4 }) && J(p("CAP-5")) === J({ maxStations: 5 }));
    ok("!! an unknown name, an unregistered cap, the tuned rule and the Object prototype's names are refused", thr("CAP-6") && thr("CAP-1") && thr("TUNED-R8") && thr("toString") && thr("constructor"));
    let msg = ""; try { p("CAP-9"); } catch (e) { msg = String(e.message); }
    ok("!! the refusal names this library", /^plannerCap\.planOf: unknown arm "CAP-9"/.test(msg));
}
const BASE = [0.5, 0.6, 0.7, 0.5, 0.6, 0.7, 0.5, 0.6];
const runs = (d) => ({ runs: BASE.map((b, i) => ({ kind: i % 2 ? "both" : "far", score: b + d[i % d.length], fingerprint: "f" + i })), score: 0, crashed: 0, stranded: 0 });
const KEEP = [0.1, 0.1, 0.1, 0.12, 0.1, 0.1, 0.08, 0.1], LOSE = [0.05, -0.05, 0.05, -0.05, 0.04, -0.04, 0.05, -0.05], HURT = KEEP.map((x) => -x), MORE = KEEP.map((x) => x + 0.05);
const synth = (spec = {}) => {
    const au = {};
    for (const [k, n] of X.SET_NAMES.entries()) {
        au[n] = { "TUNED-R8": runs([0]), "TWIN-FULL": { ...runs(KEEP), cost: 1000 + k * 100, plans: 6 } };
        for (const a of X.CAP_ARMS) { const s = spec[a] || {}; au[n][a] = { ...runs(s.d || KEEP), cost: (s.cost === undefined ? 1000 : s.cost) * (1 + k * 0.1), plans: 6 }; }
    }
    return au;
};
sec("3. VERDICTS");
{
    const au = synth({ "CAP-5": { d: MORE }, "CAP-3": { d: LOSE }, "CAP-2": { d: HURT } }), v = (a) => X.verdictOf(au, a);
    ok("!! against the tuned rule: a steady gain KEEPS, a wobble LOSES, a steady loss HURTS", v("CAP-5").verdict === "KEEPS" && v("CAP-3").verdict === "LOSES" && v("CAP-2").verdict === "HURTS");
    ok("!! against CAP-4 (the shipped cap): +0.05 over it is BETTER, the wobble and the loss are WORSE, the same gain is SAME", v("CAP-5").rel === "BETTER" && v("CAP-3").rel === "WORSE" && v("CAP-2").rel === "WORSE" && v("CAP-4").rel === "SAME");
    const w = (d) => X.verdictOf(synth({ "CAP-5": { d } }), "CAP-5").rel, wob = (c) => KEEP.map((x, i) => x + (i % 2 ? 0.03 : -0.03) + c);
    ok("!! a deficit inside 2 se is SAME (mean -0.005, se about 0.0075), one past 2 se is WORSE; an excess inside 2 se is SAME too", w(wob(-0.005)) === "SAME" && w(KEEP.map((x) => x - 0.05)) === "WORSE" && w(wob(0.005)) === "SAME");
    {   // the threshold is 2 se on both sides, and the reference is CAP-4, not the default planner
        const amp = 0.03, c15 = 0.3873 * amp, c25 = 0.6455 * amp, w2 = (c) => X.verdictOf(synth({ "CAP-5": { d: KEEP.map((x, i) => x + (i % 2 ? amp : -amp) + c) } }), "CAP-5");
        const hi = w2(c15), up = w2(c25), lo = w2(-c15), dn = w2(-c25);
        ok("!! 1.5 se above CAP-4 (and 1.5 se below it) is SAME, 2.5 se above is BETTER, 2.5 se below is WORSE -- both sides at 2 se", Math.abs(hi.vsFull.mean / hi.vsFull.se - 1.5) < 0.05 && hi.rel === "SAME" && lo.rel === "SAME" && up.rel === "BETTER" && dn.rel === "WORSE", `${(hi.vsFull.mean / hi.vsFull.se).toFixed(2)} ${(up.vsFull.mean / up.vsFull.se).toFixed(2)}`);
        const au2 = synth({ "CAP-5": { d: KEEP } }); for (const n of X.SET_NAMES) au2[n]["TWIN-FULL"] = { ...runs(MORE), cost: 1000, plans: 6 };
        ok("!! the reference is CAP-4: with the default planner better than CAP-4 in the fixture, CAP-5 (equal to CAP-4) is still SAME against CAP-4", X.verdictOf(au2, "CAP-5").rel === "SAME" && X.verdictOf(au2, "CAP-4").vsFull.mean === 0);
    }
    ok("!! the pooled n is 16 (two sets of eight), the counts are the arm's against TUNED-R8, the cost is the mean over both sets (1000 and 1100: 1050; the twin 1050)", v("CAP-5").n === 16 && v("CAP-5").better === 16 && Math.abs(v("CAP-5").cost - 1050) < 1e-9 && Math.abs(X.costOf(au, "TWIN-FULL") - 1050) < 1e-9 && X.costOf(au, "TUNED-R8") === null);
}
sec("4. LINES");
{
    const L = (spec) => X.bottomLines(synth(spec));
    ok("!! all equal: the cap COSTS NOTHING and a smaller cap KEEPS THE GAIN", J(L({})) === J(["THE FOUR-STATION CAP COSTS NOTHING MEASURABLE AT FIVE STATIONS", "A SMALLER CAP KEEPS THE GAIN"]));
    ok("!! a better CAP-5 makes line 1 name a larger cap; a worse CAP-2 or CAP-3 is named in line 2 (both in order); a better SMALLER arm does not change line 2, a worse CAP-5 does not change line 1", L({ "CAP-5": { d: MORE } })[0] === "A LARGER CAP BEATS THE FOUR-STATION CAP" && L({ "CAP-2": { d: HURT }, "CAP-3": { d: HURT } })[1] === "A SMALLER CAP LOSES GAIN (CAP-2, CAP-3)" && L({ "CAP-3": { d: HURT } })[1] === "A SMALLER CAP LOSES GAIN (CAP-3)" && L({ "CAP-2": { d: MORE } })[1] === "A SMALLER CAP KEEPS THE GAIN" && L({ "CAP-5": { d: HURT } })[0] === "THE FOUR-STATION CAP COSTS NOTHING MEASURABLE AT FIVE STATIONS" && L({ "CAP-5": { d: HURT } })[1] === "A SMALLER CAP KEEPS THE GAIN");
}
sec("5. CHECKS");
{
    const rows = (au) => X.checksOf(au), names = (au) => rows(au).filter((c) => !c.ok).map((c) => c.name);
    ok("!! three check rows on a clean audit: IDENTITY M1, IDENTITY M2, FULL IS REAL; all pass", J(rows(synth()).map((c) => c.name)) === J(["IDENTITY M1", "IDENTITY M2", "FULL IS REAL"]) && names(synth()).length === 0);
    const bad = synth(); bad.M2["CAP-4"].runs[3].fingerprint = "x";
    ok("!! a CAP-4 dive that differs from the default planner breaks IDENTITY M2 only", J(names(bad)) === J(["IDENTITY M2"]));
    const ng = synth(); for (const n of X.SET_NAMES) ng[n]["TWIN-FULL"] = { ...runs(LOSE), cost: 1000, plans: 6 };
    ok("!! a default planner with no real gain breaks FULL IS REAL only", J(names(ng)) === J(["FULL IS REAL"]));
    const idt = synth(); idt.M1["TUNED-R8"].runs[2].fingerprint = "z";
    ok("!! the identity compares CAP-4 with the default planner (a differing tuned-rule dive does not break it)", names(idt).length === 0);
}
sec("6. REPORT");
{
    const L = X.report(synth({ "CAP-5": { d: MORE }, "CAP-2": { d: HURT } })), txt = L.join("\n");
    ok("!! the head names both sets and five stations; the three checks pass first; the twin's line carries its gain and cost (1050)", /^ROUND 24/.test(L[0]) && L[0].includes("M1 3901-3996") && L[0].includes("M2 4001-4096") && L[0].includes("5 stations") && L.slice(1, 4).every((l) => /^  PASS /.test(l)) && /TWIN-FULL minus TUNED-R8: \+0\.10.*cost 1050 rollout seconds per dive/.test(txt));
    { const a2 = synth({}); a2.M1["TWIN-FULL"] = { ...runs([0]), cost: 1000, plans: 6 }; a2.M2["TWIN-FULL"] = { ...runs(KEEP.map((x) => x * 2)), cost: 1100, plans: 6 }; const t2 = X.report(a2).join("\n");
      ok("!! the twin's line pools BOTH sets: no gain on M1 and +0.2 on M2 is +0.1 pooled (not the first set's +0.0000)", /TWIN-FULL minus TUNED-R8: \+0\.10[0-9]{2} /.test(t2)); }
    ok("!! one row per cap arm with its verdict, its relation to CAP-4 (value and se) and its cost: CAP-5 KEEPS BETTER at +0.0500, CAP-2 HURTS WORSE", /CAP-5 .*KEEPS +BETTER +vs CAP-4 \+0\.0500 \(se 0\.0[0-9]+\)/.test(txt) && /CAP-2 .*HURTS +WORSE/.test(txt) && /CAP-4 .*KEEPS +SAME +vs CAP-4 [+-]0\.0000/.test(txt));
    const lower = X.report(synth({ "CAP-5": { d: KEEP.map((x) => x / 2) } })).join("\n");
    ok("!! an arm that keeps a gain over the tuned rule but is BELOW CAP-4 prints the negative difference (-0.0500), not a plus sign from its own gain", /CAP-5 .*KEEPS +WORSE +vs CAP-4 -0\.0500/.test(lower) && !/vs CAP-4 \+-/.test(lower));
    ok("!! the two bottom lines come last", L[L.length - 2] === "BOTTOM LINE: A LARGER CAP BEATS THE FOUR-STATION CAP" && L[L.length - 1] === "BOTTOM LINE: A SMALLER CAP LOSES GAIN (CAP-2)");
    const bad = synth(); bad.M1["CAP-4"].runs[0].fingerprint = "x"; const Lb = X.report(bad);
    ok("!! a failed check puts FAIL on its row, says the verdicts are NOT WEIGHED and puts that on a single bottom line", Lb.some((l) => /^  FAIL IDENTITY M1/.test(l)) && Lb.includes("A CHECK FAILED: the verdicts below are NOT WEIGHED.") && Lb[Lb.length - 1] === "BOTTOM LINE: NOT WEIGHED (a check failed)" && Lb.filter((l) => l.startsWith("BOTTOM LINE")).length === 1);
}
sec("7. FLIGHT");
{
    X.setFlight({ seconds: 100 });
    const ranges = { M1: [1344, 1345], M2: [1349, 1350] }, fl = (a) => X.flySets(a, R8, { ranges });
    const full = fl("TWIN-FULL"), c4 = fl("CAP-4"), c2 = fl("CAP-2"), c5 = fl("CAP-5"), tuned = fl("TUNED-R8");
    ok("!! flySets returns M1 and M2, four dives each (far, far, both, both) on five stations", J(Object.keys(full)) === J(["M1", "M2"]) && full.M1.runs.length === 4 && J(full.M1.runs.map((r) => r.kind)) === J(["far", "far", "both", "both"]) && full.M1.runs.every((r) => r.score >= 0));
    ok("!! CAP-4 equals the default planner dive for dive on real five-station 100-second dives (the option's default is the shipped cap)", ["M1", "M2"].every((n) => full[n].runs.every((r, i) => r.fingerprint === c4[n].runs[i].fingerprint)) && full.M1.cost === c4.M1.cost);
    ok("!! CAP-5 changes a dive the cap omits (far 1345: 0.190 against 0.280 with the four nearest), and CAP-2 changes the dives it limits too (far 1344 and both 1345 differ in fingerprint from CAP-4, far 1345 does not)", c5.M1.runs[1].fingerprint !== c4.M1.runs[1].fingerprint && Math.abs(c5.M1.runs[1].score - 0.19) < 1e-9 && Math.abs(c4.M1.runs[1].score - 0.28) < 1e-9 && c2.M1.runs[0].fingerprint !== c4.M1.runs[0].fingerprint && c2.M1.runs[3].fingerprint !== c4.M1.runs[3].fingerprint && c2.M1.runs[1].fingerprint === c4.M1.runs[1].fingerprint);
    ok("!! cost pinned (mean scheduled rollout seconds per dive on M1 = seeds 1344-1345 far and both, 100 s): the default 3070.633, CAP-2 424.15, CAP-5 10039.383 -- the cap sets the work per plan, 3, 25 or 121 values", Math.abs(full.M1.cost - 3070.633333333333) < 1e-6 && Math.abs(c2.M1.cost - 424.15) < 1e-6 && Math.abs(c5.M1.cost - 10039.383333333333) < 1e-6 && tuned.M1.cost === undefined);
    const direct = T.evaluate(T.flyDecision(U.tunedSeat(R8, U.WIDE_BOUNDS)), tuned.M1 && X.flySets("TUNED-R8", R8, { ranges }) && require_set(1344, 1345), { gauge: T.GAUGE, seconds: 100 });
    ok("!! the tuned rule is T.evaluate's tuned dive on the five-station set with the noisy gauge, dive for dive", tuned.M1.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint));
    X.setFlight({});
    const msg = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };
    ok("!! an unknown arm is refused with this library's message before flying", /plannerCap\.planOf: unknown arm "CAP-9"/.test(msg(() => X.flyArm("CAP-9", R8, []))));
    ok("!! assemble keys sets then arms", J(Object.keys(X.assemble({ A: full, B: tuned }).M2)) === J(["A", "B"]) && X.assemble({ A: full }).M1.A === full.M1 && X.assemble({ A: full }).M2.A === full.M2);
}
import { setN } from "./plannerStations.mjs";
function require_set(a, b) { return setN(X.HARD, a, b, X.STATIONS); }
sec("8. SOURCE");
{
    ok("!! the seeds 3901, 3996, 4001 and 4096 appear once each, in SET_RANGES", ["3901", "3996", "4001", "4096"].every((s) => code.split(s).length === 2));
    ok("!! the file reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
