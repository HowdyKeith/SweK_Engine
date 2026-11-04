// WebGLEngine/brain/surveySeat.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/takeSurvey.mjs; the gate is brain/surveySeat-selfcheck.mjs)
//
// THE SURVEY SEAT, the form the needs-and-limits series (brain/NEEDS_AND_LIMITS.md, Rounds 11-32) leaves the planner in: the twin planner of brain/plannerPerturbed.mjs with the Round 33 trip-point constants (the Round 8 constants
// of the tuned rule with its low trip point lowered by 0.06) and a named profile, ready to hand to brain/needsTask.mjs as a seat. WHAT IT DOES: on a survey task (stations to visit, a charge that thrust drains and only the surface refills, a hull that feels pressure) it
// plans the visiting order by rolling every order of the nearest open feasible stations out on a clone of the real simulator, seeded from the seat's own filtered charge, and visits the first station of the best
// order; the surfacing rule under it is the tuned rule. WHAT IT WAS MEASURED TO BE WORTH (this task, this boat, gauge noise sd 0.10 unless said): +0.0198 over the tuned rule on 2,000 fresh far-and-both dives (Round 22,
// se 0.0014, the blocks disagreeing a little); +0.015 to +0.033 in five conditions -- the shipped task, starting damage x1.6, gauge noise 0.20 and 0.30, five stations -- with no more crushed dives than the rule
// (Round 32, on the Round 8 constants); +0.012 to +0.033 on top of the lowered trip point in the same five conditions (Round 33, 300 dives each); +0.022 on the easy kinds (Round 20). IT NEEDS A MODEL OF THE BOAT WITHIN 10 PERCENT in every error at once (Round 13). THE TRIP POINT IS LOW -0.06 (Round 33): chosen as the shift with the best worst-condition gain among those whose crushed-plus-stranded count is not distinguishable from Round 8's at two se (Poisson test); on the
// confirmation the rule alone gains +0.014 to +0.024 over the Round 8 constants in four of five conditions (DMG +0.010, not distinguishable from zero) with no more crushed dives by that test. IT STILL PAYS IN HULL ON A DAMAGED BOAT
// (49 of 800 dives bad against 40 on selection) and lower shifts crush under a noisy gauge (Rounds 28-32): the tolerance is a decision, not a measurement. Rounds 28-32 are the series behind it.
// PROFILES, each a measured trade (cost = scheduled rollout seconds a dive against the standard profile): standard (replan every 120 s: the baseline); events (plan at the start and when the boat leaves the surface:
// the same gain at 75 percent of the cost, Round 17); wide (the five nearest stations instead of four: +0.004 at five stations for 2.65 times the cost, Round 24); ensemble (plan against start energy -5, 0, +5 percent:
// +0.002 to +0.006 for 3 times the cost, Rounds 23 and 27).
// Pure apart from the clone and the simulation the planner runs: no clock, no Math.random, no file.
"use strict";
import * as T from "./needsTask.mjs";
import * as Q from "./plannerPerturbed.mjs";

/** The tuned rule's constants, Round 8 (brain/rig-results/tune-report.json): the filter, the charge trip points, the depth ramp and the depth cap. Frozen. The baseline the shift below is measured from. */
export const SURVEY_R8 = Object.freeze({ alpha: 0.001, low: 0.3803560726214647, high: 0.68938489754682, ramp: 20, cap: 0.8861494767879255 });
/** The Round 33 shift of the low trip point (the winner L-0.06). */
export const SURVEY_LOW_SHIFT = -0.06;
/** What the seat flies: the Round 8 constants with low moved by the shift (low = 0.3203560726214647), nothing else. Frozen. */
export const SURVEY_CONSTANTS = Object.freeze({ ...SURVEY_R8, low: SURVEY_R8.low + SURVEY_LOW_SHIFT });
/** The planning options of each profile (see the header for what each was measured to be worth). Frozen. */
export const SURVEY_PROFILES = Object.freeze({
    standard: Object.freeze({}),
    events: Object.freeze({ replanS: Infinity, onDive: true }),
    wide: Object.freeze({ maxStations: 5 }),
    ensemble: Object.freeze({ ensemble: Object.freeze([-0.05, 0, 0.05]) }),
});
export const PROFILE_NAMES = Object.freeze(Object.keys(SURVEY_PROFILES));
/** The planning options of a profile, plus `overrides` (the gate and the command shorten the dive with { seconds }); an unknown profile is refused. */
export function planOf(profile = "standard", overrides = {}) {
    if (!Object.prototype.hasOwnProperty.call(SURVEY_PROFILES, profile)) throw new Error(`surveySeat.planOf: unknown profile ${JSON.stringify(profile)} (${PROFILE_NAMES.join(", ")})`);
    return { ...SURVEY_PROFILES[profile], ...overrides };
}
/** The seat factory (ctx) => seat for needsTask: the twin planner on the Round 33 constants (low -0.06) in the named profile. The seat carries `stats` { ticks, switches, plans, rolloutSeconds }. */
export function surveySeat({ profile = "standard", overrides = {} } = {}) { return Q.perturbedSeat(SURVEY_CONSTANTS, {}, planOf(profile, overrides)); }
/** The pilot factory for T.fly / T.evaluate: the survey seat behind needsTask's decision wrapper. */
export function surveyPilot(opts = {}) { return T.flyDecision(surveySeat(opts)); }
