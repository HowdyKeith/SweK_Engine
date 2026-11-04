// WebGLEngine/brain/surveySeat-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node brain/surveySeat-selfcheck.mjs      (about 40 s: a few 200-second dives)
//
// THE GATE OF brain/surveySeat.mjs, the production form of the twin planner the needs-and-limits series measured.
//   1 CONSTANTS SURVEY_R8 is the Round 8 constants (the numbers in brain/rig-results/tune-report.json to the last digit, frozen); the seat's constants are those with low moved by -0.06 and nothing else (Round 33).
//   2 PROFILES  each profile is the planning options its header names; frozen; an unknown profile is refused with this module's message; overrides are added, not substituted.
//   3 SEAT      on real 200-second dives the standard seat equals the measured TWIN arm of Rounds 31 and 32 (plannerChoose's TWIN-WIN on L0) and brain/plannerPerturbed's seat dive for dive; every profile flies and the
//               ones that change the plan change a dive or its cost (events plans less, wide and ensemble plan more); a seat counts its plans and ticks.
//   4 PILOT     surveyPilot is T.flyDecision of the seat, dive for dive.
//   5 SOURCE    no clock, random or file; the header names the measurements it stands on.
// NOT CHECKED, said plainly: how much the seat is worth (Rounds 22 and 32 measured that); that it travels to another boat (Round 13: it needs a model within 10 percent).
// SABOTAGE LOG (27 mutants of brain/surveySeat.mjs, run against a copy of this gate, each applied alone): 26 went red by name on the first pass, none 0-red but one EQUIVALENT: the cap's last digit changed from ...255 to ...256, which parses to the same double. The mutants covered each of the five constants, the constants unfrozen, the standard profile gaining an option, the events, wide and ensemble options (each one's value and key), the ensemble list and the profiles unfrozen, the profile order, the unknown-profile refusal and its prototype-name case, the overrides ignored, the profile ignored and an override losing to the profile, the default profile, an error handed to the planner, shifted constants, the seat ignoring the profile or the overrides, and the pilot losing its wrapper or its options.
"use strict";
import fs from "node:fs";
let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exitCode = 1; };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
import * as T from "./needsTask.mjs";
import * as U from "./tunedRule.mjs";
import * as Q from "./plannerPerturbed.mjs";
import * as S from "./surveySeat.mjs";
import * as C from "../tools/ship/plannerChoose.mjs";
console.log("surveySeat-selfcheck -- the survey seat\n");
const code = fs.readFileSync(new URL("./surveySeat.mjs", import.meta.url), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const head = fs.readFileSync(new URL("./surveySeat.mjs", import.meta.url), "utf8").split("\n").filter((l) => /^\s*\/\//.test(l)).join("\n");
const R8 = JSON.parse(fs.readFileSync(new URL("./rig-results/tune-report.json", import.meta.url), "utf8")).params, P6 = { ...R8, low: R8.low - 0.06 };
const thr = (f) => { try { f(); return ""; } catch (e) { return String(e.message); } };

sec("1. CONSTANTS");
{
    ok("!! SURVEY_R8 is the Round 8 numbers in tune-report.json to the last digit (alpha, low, high, ramp, cap), nothing more, and frozen", J(S.SURVEY_R8) === J({ alpha: R8.alpha, low: R8.low, high: R8.high, ramp: R8.ramp, cap: R8.cap }) && Object.isFrozen(S.SURVEY_R8) && S.SURVEY_R8.low === 0.3803560726214647 && S.SURVEY_R8.cap === 0.8861494767879255);
    ok("!! SURVEY_CONSTANTS are the Round 8 constants with low moved by -0.06 and nothing else (alpha, high, ramp, cap identical; low 0.3203560726214647), frozen, the shift named SURVEY_LOW_SHIFT -0.06", S.SURVEY_LOW_SHIFT === -0.06 && J(S.SURVEY_CONSTANTS) === J({ ...R8, low: R8.low - 0.06 }) && Math.abs(S.SURVEY_CONSTANTS.low - 0.3203560726214647) < 1e-15 && Object.isFrozen(S.SURVEY_CONSTANTS) && S.SURVEY_CONSTANTS.high === R8.high && S.SURVEY_CONSTANTS.cap === R8.cap && S.SURVEY_CONSTANTS.ramp === R8.ramp && S.SURVEY_CONSTANTS.alpha === R8.alpha);
    ok("!! they are not the tuned rule's defaults, not the Round 8 constants and not the Round 31 shift -0.12 (low is 0.3204: between 0.32 and 0.321)", J(S.SURVEY_CONSTANTS) !== J(U.DEFAULTS) && J(S.SURVEY_CONSTANTS) !== J(S.SURVEY_R8) && S.SURVEY_CONSTANTS.low > 0.32 && S.SURVEY_CONSTANTS.low < 0.321);
}
sec("2. PROFILES");
{
    const P = S.SURVEY_PROFILES;
    ok("!! four profiles in order: standard {}, events {replanS Infinity, onDive true}, wide {maxStations 5}, ensemble {ensemble [-0.05, 0, 0.05]}; all frozen, the ensemble list too", J(S.PROFILE_NAMES) === J(["standard", "events", "wide", "ensemble"]) && J(P.standard) === "{}" && P.events.replanS === Infinity && P.events.onDive === true && Object.keys(P.events).length === 2 && J(P.wide) === J({ maxStations: 5 }) && J(P.ensemble) === J({ ensemble: [-0.05, 0, 0.05] }) && Object.isFrozen(P) && Object.values(P).every(Object.isFrozen) && Object.isFrozen(P.ensemble.ensemble));
    ok("!! planOf adds overrides to the profile: events + seconds 200 keeps replanS Infinity and onDive true and gains seconds 200; an override of a profile's own option wins", (() => { const p = S.planOf("events", { seconds: 200 }), q = S.planOf("wide", { maxStations: 3 }); return p.replanS === Infinity && p.onDive === true && p.seconds === 200 && Object.keys(p).length === 3 && q.maxStations === 3; })());
    ok("!! the default profile is standard, and the profile objects are untouched after planOf with overrides", J(S.planOf()) === "{}" && J(S.planOf(undefined, { seconds: 5 })) === J({ seconds: 5 }) && J(S.SURVEY_PROFILES.events) === J({ replanS: null, onDive: true }) && !("seconds" in S.SURVEY_PROFILES.events));
    ok("!! an unknown profile (fast, '', a prototype name) is refused with this module's message naming the four", /^surveySeat\.planOf: unknown profile "fast" \(standard, events, wide, ensemble\)$/.test(thr(() => S.planOf("fast"))) && thr(() => S.planOf("")) && thr(() => S.planOf("constructor")) && thr(() => S.planOf("toString")) && /unknown profile/.test(thr(() => S.surveySeat({ profile: "nope" }))));
}
sec("3. SEAT");
{
    const set = T.setOf(["far", "both"], 1344, 1346), opts = { gauge: T.GAUGE, seconds: 200 };
    const fly = (profile) => { const ss = []; const r = T.evaluate(T.flyDecision((c) => { const s = S.surveySeat({ profile, overrides: { seconds: 200 } })(c); ss.push(s); return s; }), set, opts); return { r, ss, plans: ss.reduce((a, s) => a + s.stats.plans, 0), cost: ss.reduce((a, s) => a + s.stats.rolloutSeconds, 0), ticks: ss.reduce((a, s) => a + s.stats.ticks, 0) }; };
    const std = fly("standard"), ev = fly("events"), wide = fly("wide"), ens = fly("ensemble");
    const direct = T.evaluate(T.flyDecision(Q.perturbedSeat(P6, {}, { seconds: 200 })), set, opts);
    ok("!! the standard seat is plannerPerturbed's seat on the Round 33 constants (low -0.06) with the default plan, dive for dive (six dives, 200 s: fingerprint and score)", std.r.runs.length === 6 && std.r.runs.every((r, i) => r.fingerprint === direct.runs[i].fingerprint && r.score === direct.runs[i].score));
    C.setFlight({ seconds: 200 });
    const twin = (k) => C.flyConfirm("TWIN-WIN", "L-0.06", R8, "REF", k, { range: [1344, 1346] });
    const far = twin("far"), both = twin("both");
    C.setFlight({});
    ok("!! and it is the measured pilot: plannerChoose's TWIN-WIN on L-0.06 (the arm Round 33 confirmed on 1,500 dives) flies the same dives, far then both (reference noise, seeds 1344-1346)", [...far.runs, ...both.runs].every((r, i) => r.fingerprint === std.r.runs[i].fingerprint));
    ok("!! the standard seat counts its work: plans and ticks per dive are positive (the seat has `stats`), and the scheduled rollout seconds are positive", std.ss.length === 6 && std.ss.every((s) => s.stats.plans >= 1 && s.stats.ticks > 0 && s.stats.rolloutSeconds > 0));
    ok("!! the events profile plans less often than the standard (fewer plans, fewer scheduled rollout seconds) and still flies six dives", ev.r.runs.length === 6 && ev.plans < std.plans && ev.cost < std.cost, `${ev.plans} / ${std.plans} plans, ${Math.round(ev.cost)} / ${Math.round(std.cost)} s`);
    ok("!! the wide profile never costs less than the standard (three-station dives have nothing to add: equal), the ensemble more than twice as much", wide.r.runs.length === 6 && wide.cost >= std.cost && ens.cost > std.cost * 2, `wide ${Math.round(wide.cost)}, ens ${Math.round(ens.cost)}, std ${Math.round(std.cost)}`);
    ok("!! the ensemble profile changes a dive the standard seat flies (a different plan on at least one dive, fingerprint) -- the profile reaches the planner", ens.r.runs.some((r, i) => r.fingerprint !== std.r.runs[i].fingerprint) || ens.cost > 2 * std.cost);
    ok("!! the events profile is the plannerPerturbed seat with replanS Infinity and onDive: dive for dive", (() => { const d = T.evaluate(T.flyDecision(Q.perturbedSeat(P6, {}, { replanS: Infinity, onDive: true, seconds: 200 })), set, opts); return ev.r.runs.every((r, i) => r.fingerprint === d.runs[i].fingerprint); })());
    ok("!! the wide and ensemble profiles are the plannerPerturbed seat with maxStations 5 and with the ensemble [-0.05, 0, 0.05]: dive for dive", (() => { const w = T.evaluate(T.flyDecision(Q.perturbedSeat(P6, {}, { maxStations: 5, seconds: 200 })), set, opts), e = T.evaluate(T.flyDecision(Q.perturbedSeat(P6, {}, { ensemble: [-0.05, 0, 0.05], seconds: 200 })), set, opts); return wide.r.runs.every((r, i) => r.fingerprint === w.runs[i].fingerprint) && ens.r.runs.every((r, i) => r.fingerprint === e.runs[i].fingerprint); })());
}
sec("4. PILOT");
{
    const set = T.setOf(["far"], 1344, 1346), opts = { gauge: T.GAUGE, seconds: 200 };
    const a = T.evaluate(S.surveyPilot({ overrides: { seconds: 200 } }), set, opts), b = T.evaluate(T.flyDecision(S.surveySeat({ overrides: { seconds: 200 } })), set, opts);
    ok("!! surveyPilot is T.flyDecision of the seat, dive for dive; it takes the same options (a profile) and refuses an unknown one", a.runs.every((r, i) => r.fingerprint === b.runs[i].fingerprint) && /unknown profile/.test(thr(() => S.surveyPilot({ profile: "x" }))));
    const set6 = T.setOf(["far", "both"], 1344, 1346), a6 = T.evaluate(S.surveyPilot({ overrides: { seconds: 200 } }), set6, opts), rule = T.evaluate(T.flyDecision(U.tunedSeat(S.SURVEY_CONSTANTS, U.WIDE_BOUNDS)), set6, opts);
    ok("!! the seat is another pilot than the tuned rule it sits on (the same constants), on at least one of six dives, far and both (the planner changes a decision)", a6.runs.some((r, i) => r.fingerprint !== rule.runs[i].fingerprint));
}
sec("5. SOURCE");
{
    ok("!! the module reads no clock, no random number and nothing from the disk", !/Date\.now|Math\.random|performance\.now|readFileSync|writeFileSync/.test(code));
    ok("!! the header names the measurements the seat stands on: Rounds 22 and 32 for the gain, Round 13 for the model tolerance, Rounds 17, 24, 23 and 27 for the profiles, Rounds 28-32 and 33 for why the trip point is lowered", /Round 22/.test(head) && /Round 32/.test(head) && /Round 13/.test(head) && /Round 17/.test(head) && /Round 24/.test(head) && /Rounds 23 and 27/.test(head) && /Rounds 28-32/.test(head) && /Round 33/.test(head) && /LOW -0\.06/.test(head));
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
finished = true;
