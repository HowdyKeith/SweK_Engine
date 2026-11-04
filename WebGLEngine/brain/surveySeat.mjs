// WebGLEngine/brain/surveySeat.mjs -- UNNUMBERED (the version is chosen at ship time) (the command is tools/ship/takeSurvey.mjs; the gate is brain/surveySeat-selfcheck.mjs)
//
// THE SURVEY SEAT, the form the needs-and-limits series (brain/NEEDS_AND_LIMITS.md, Rounds 11-32) leaves the planner in: the twin planner of brain/plannerPerturbed.mjs with the Round 8 trip-point constants of the tuned
// rule and a named profile, ready to hand to brain/needsTask.mjs as a seat. WHAT IT DOES: on a survey task (stations to visit, a charge that thrust drains and only the surface refills, a hull that feels pressure) it
// plans the visiting order by rolling every order of the nearest open feasible stations out on a clone of the real simulator, seeded from the seat's own filtered charge, and visits the first station of the best
// order; the surfacing rule under it is the tuned rule. WHAT IT WAS MEASURED TO BE WORTH (this task, this boat, gauge noise sd 0.10 unless said): +0.0198 over the tuned rule on 2,000 fresh far-and-both dives (Round 22,
// se 0.0014, the blocks disagreeing a little); +0.015 to +0.033 in five conditions -- the shipped task, starting damage x1.6, gauge noise 0.20 and 0.30, five stations -- with no more crushed dives than the rule
// (Round 32); +0.022 on the easy kinds (Round 20). IT NEEDS A MODEL OF THE BOAT WITHIN 10 PERCENT in every error at once (Round 13). The constants are the Round 8 ones on purpose: a lower trip point gains more on the
// reference task and crushes dives under a noisy gauge or a damaged hull (Rounds 28-32), a trade that is a hull-tolerance decision, not a measurement.
// PROFILES, each a measured trade (cost = scheduled rollout seconds a dive against the standard profile): standard (replan every 120 s: the baseline); events (plan at the start and when the boat leaves the surface:
// the same gain at 75 percent of the cost, Round 17); wide (the five nearest stations instead of four: +0.004 at five stations for 2.65 times the cost, Round 24); ensemble (plan against start energy -5, 0, +5 percent:
// +0.002 to +0.006 for 3 times the cost, Rounds 23 and 27).
// Pure apart from the clone and the simulation the planner runs: no clock, no Math.random, no file.
"use strict";
import * as T from "./needsTask.mjs";
import * as Q from "./plannerPerturbed.mjs";

/** The tuned rule's constants, Round 8 (brain/rig-results/tune-report.json): the filter, the charge trip points, the depth ramp and the depth cap. Frozen. */
export const SURVEY_CONSTANTS = Object.freeze({ alpha: 0.001, low: 0.3803560726214647, high: 0.68938489754682, ramp: 20, cap: 0.8861494767879255 });
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
/** The seat factory (ctx) => seat for needsTask: the twin planner on the Round 8 constants in the named profile. The seat carries `stats` { ticks, switches, plans, rolloutSeconds }. */
export function surveySeat({ profile = "standard", overrides = {} } = {}) { return Q.perturbedSeat(SURVEY_CONSTANTS, {}, planOf(profile, overrides)); }
/** The pilot factory for T.fly / T.evaluate: the survey seat behind needsTask's decision wrapper. */
export function surveyPilot(opts = {}) { return T.flyDecision(surveySeat(opts)); }
