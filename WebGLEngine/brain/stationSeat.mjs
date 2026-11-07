// WebGLEngine/brain/stationSeat.mjs -- UNNUMBERED (the version is chosen at ship time) (the registration is brain/STATION_AND_PRICE_WIP.md, written BEFORE this file; the gate is brain/stationSeat-selfcheck.mjs; the trainer tools/ship/trainStation.mjs; the audit tools/ship/takeStationRound.mjs)
//
// TWO SMALL PIECES OF THE STATION-AND-PRICE ROUND, both built on brain/circuitSeat.mjs (imported, not edited):
//   THE STATION-ONLY POLICY  the plain relu net of brain/circuitSeat.mjs (21 features -> H -> 7 outputs, readout starting at ZERO) whose outputs o0, o4, o5 and o6 are forced to ZERO in the seat, so that surfacing, the depth cap, the pump and the repair are EXACTLY the tuned rule's (brain/tunedRule.mjs at the survey seat's constants) and only o1 .. o3, the residuals on the scores of the first three stations, can
//   change the decision: a learned STATION CHOICE and nothing else. Untrained (every readout at zero) it IS brain/tunedRule.mjs tunedSeat(SURVEY_CONSTANTS, WIDE_BOUNDS), the switchboard's `rule-low06`, decision for decision (the gate holds it). The readout rows of the four masked outputs are inert: a mutation that lands on one is a neutral move.
//   THE PRICE  a TRAINING OBJECTIVE, not a change of the survey score (every number of the series was measured with the score as it is, and a crushed boat already scores 0): a dive's PRICED score is its score minus  lambda x clamp((maxStrain - free) / (1 - free), 0, 1)  with free = 0.92 (the tuned rule's own largest hull strain on the training sets is 0.918) and lambda = 0.5, so a dive pays nothing up to a strain of 0.92, 0.5 at a strain of 1 (the crush), and a
//   dive whose strain is not a number pays the whole 0.5. `pricedPolicy(Pol)` is a policy whose `evaluate` (the seam tools/ship/trainNeedsCircuit.mjs search() reads) returns the usual evaluation with `score` replaced by the priced mean and `rawScore` the unpriced one.
// Pure: no I/O, no clock, no Math.random.
"use strict";
import * as T from "./needsTask.mjs";
import * as CS from "./circuitSeat.mjs";
import { STATE_INIT } from "./pilotSubCircuitState.mjs";

export const MASKED = Object.freeze([0, 4, 5, 6]), STATION_OUTPUTS = Object.freeze([1, 2, 3]);
export const PRICE = Object.freeze({ free: 0.92, lambda: 0.5 });
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A stepper whose outputs o0, o4, o5, o6 read zero whatever the net says (a new array each step; the argument's is left alone). */
export const maskedStepper = (sp) => ({ step(x) { const y = Float64Array.from(sp.step(x)); for (const i of MASKED) y[i] = 0; return y; } });

/** The station-only pilot family over a plain net of `hidden` units (default 84, the width matched to the reservoir's weight count): the policy of createPlainPolicy with the seat's masked stepper. opts: withheld (default false). */
export function createStationPolicy(hidden = 84, name = "station", opts = {}, init = STATE_INIT) {
    const base = CS.createPlainPolicy(hidden, name, opts, init), withheld = !!opts.withheld;
    const seatFor = (w) => (ctx) => CS.makeSeat(maskedStepper(base.stepper(w)), { withheld });
    return { ...base, kind: "station", masked: MASKED, seatFor, pilotFor: (w) => T.flyDecision(seatFor(w)) };
}

/** The priced score of one dive result ({ score, maxStrain }): score - lambda x clamp((maxStrain - free) / (1 - free), 0, 1); a maxStrain that is not a number pays the whole lambda. */
export const pricedScore = (run) => run.score - PRICE.lambda * (Number.isFinite(run.maxStrain) ? clamp((run.maxStrain - PRICE.free) / (1 - PRICE.free), 0, 1) : 1);

/** A policy that is `Pol` with the PRICED mean as its fitness: evaluate(pilot, set, opts) = T.evaluate's result with score = the mean priced score and rawScore = the unpriced mean. Everything else of the policy is kept. */
export function pricedPolicy(Pol) {
    return { ...Pol, kind: Pol.kind + "-priced", priced: PRICE, evaluate(pilot, set, opts) {
        const e = T.evaluate(pilot, set, opts), n = e.runs.length;
        return { ...e, rawScore: e.score, score: n ? e.runs.reduce((s, r) => s + pricedScore(r), 0) / n : 0 };
    } };
}
/** How many dives of a result have a hull strain above each threshold: { 0.92: n, 0.95: m } for thresholds [0.92, 0.95]. */
export const strainCounts = (runs, thresholds = [0.92, 0.95]) => Object.fromEntries(thresholds.map((t) => [t, runs.filter((r) => r.maxStrain > t).length]));
