// WebGLEngine/render/subAquariumCircuit.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is render/subAquariumCircuit-selfcheck.mjs; the weights are render/subAquariumCircuitWeights.mjs, generated)
//
// THE DECISION CIRCUIT AS A SURVEY PROFILE FOR THE SUB AQUARIUM (Keith, 2026-11-07, "the decision circuit as an aquarium profile"): the survey event of render/subAquariumSim.mjs lets a planner profile (standard, events, wide, ensemble) choose the order of the stations; this module adds two more profiles that are SEATS of the needs-and-limits series and not planners:
//   rule     the tuned rule at the survey seat's constants (brain/tunedRule.mjs tunedSeat on SURVEY_CONSTANTS, low -0.04 since Round 39 of 2026-11-19; until then the switchboard's `rule-low06`): nearest-first, surfacing, the depth cap, the pump and the repair by the rule. The circuit's own starting point and the control of the decision-circuit rounds.
//   circuit  SINCE ROUND 40 (2026-11-19): the same net RETRAINED with a +0.10-biased gauge among its training conditions, on the -0.04 base (CIRCUIT_CHAMPION: brain/rig-results/circuit-retrain/search-1.json, seed 97501, digest 0ec046a3). UNTIL THEN: the plain-net champion of the decision-circuit round (the file brain/decisionCircuitTraining.jsonl, family plain, search k 2, digest c916e7f5, `circuit-plain` of the audits), on low -0.06: the SAME seat (brain/circuitSeat.mjs makeSeat) over a 21 -> 84 -> 7 relu net whose readout started at zero, so it is the rule plus what the training moved.
// WHAT THIS IS AND IS NOT: a seat that can be WATCHED in the tank. It is not a measurement: the net was trained and audited in the needs task (brain/needsTask.mjs, the first-order orientation step), and the tank flies the sub on its own dynamics, so a survey here is a demonstration of the seat's decisions and not a score to compare with the audits. The audits found the circuit within noise of the rule (brain/DECISION_CIRCUIT_VS_TWIN_WIP.md section 11: THE CIRCUIT IS THE RULE);
// watching the two profiles side by side shows the same decisions most of the time and where they differ, which is the thing worth watching. Both profiles use the task's own survey length (600 s: the rule's last call is the task's): the tank refuses another length for them.
// Browser-light: only brain modules the tank already loads (plus brain/circuitSeat.mjs, brain/pilotNeedsCircuit.mjs and brain/tunedRule.mjs) and the generated weights; no node: import. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as U from "../brain/tunedRule.mjs";
import * as SS from "../brain/surveySeat.mjs";
import * as CS from "../brain/circuitSeat.mjs";
import * as PC from "../brain/plannerCircuitSeat.mjs";
import { PLAIN_CHAMPION, CIRCUIT_CHAMPION } from "./subAquariumCircuitWeights.mjs";

export const CIRCUIT_PROFILE_NAMES = Object.freeze(["rule", "circuit"]);
export { PLAIN_CHAMPION, CIRCUIT_CHAMPION };
/** Whether a survey profile name is one of this module's seats (the planner profiles are brain/surveySeat.mjs's). */
export const isCircuitProfile = (profile) => CIRCUIT_PROFILE_NAMES.includes(profile);
let policy = null;
/** The plain net the champion was trained in (built once). */
export const plainPolicy = () => policy || (policy = CS.createPlainPolicy(PLAIN_CHAMPION.hidden, "plain"));
/** The seat of a circuit profile: a function of the dive's context that returns the seat, the shape brain/surveySeat.mjs `surveySeat` gives. An unknown name is refused by name. `champion` is a seam for the gate (default the generated champion). */
/**
 * SINCE ROUND 42 (2026-11-21, brain/NEEDS_AND_LIMITS.md): the circuit profile is the PLANNER CIRCUIT -- brain/plannerCircuitSeat.mjs, a 24 -> 84 -> 7 net whose residuals
 * adjust the shipped seat's planner -- at its champion, which IS THE START: every one of the four searches (brain/rig-results/planner-circuit/) chose child 0, so the
 * readout is zero and THE PROFILE FLIES THE SHIPPED SEAT, decision for decision (the same dives as the planner profile `standard`). The training bought nothing; the
 * profile is kept a net so another champion can be dropped in. Its audit: hull no worse than the seat's (2 against 2 crushed under BIAS), score equal, and +0.027 / +0.037
 * over Round 40's circuit (which crushed 8). `champion` null means the planner start; Round 40's CIRCUIT_CHAMPION is kept, exported, as what the profile WAS.
 */
export const PLANNER_CHAMPION = Object.freeze({ family: "planner-plain", hidden: PC.HIDDEN, features: PC.FEATURES, isStart: true, source: "brain/rig-results/planner-circuit/search-0.json child 0 (all four searches chose the start)" });
export function circuitSeat(profile, champion = null) {
    // 2026-11-19, Round 39 (brain/NEEDS_AND_LIMITS.md, Keith's decision confirmed on fresh dives): the rule profile flies low -0.04, the shipped seat's SURVEY_CONSTANTS. It was SURVEY_ROUND33 (low -0.06),
    // which crushed 14 of 300 under a gauge reading +0.10 high in Round 38 and 7 in Round 39 (against -0.04's 1); no worse in any of Round 37's six conditions.
    if (profile === "rule") return U.tunedSeat(SS.SURVEY_CONSTANTS, U.WIDE_BOUNDS);
    if (profile === "circuit" && champion === null) {
        const Pol = PC.createPlannerPolicy();
        return PC.makePlannerSeat(Pol.stepper(Pol.handWeights()));   // (ctx) => seat: the planner reads the dive's model
    }
    if (profile === "circuit") {
        const Pol = plainPolicy(), w = Float32Array.from(champion.weights);
        if (w.length !== Pol.WEIGHT_COUNT) throw new Error(`subAquariumCircuit.circuitSeat: the champion has ${w.length} weights and its net takes ${Pol.WEIGHT_COUNT}`);
        // 2026-11-19, Round 40: the RETRAINED champion (CIRCUIT_CHAMPION) on the -0.04 base (the shipped seat's SURVEY_CONSTANTS). Until then PLAIN_CHAMPION on circuitSeat's
        // BASE_PARAMS (low -0.06), which crushed 88 of 300 under a gauge reading +0.10 high (Round 38) and 77 in Round 40's audit, where the retrained net lost 5 and the seat 2.
        return () => CS.makeSeat(Pol.stepper(w), { params: SS.SURVEY_CONSTANTS, bounds: U.WIDE_BOUNDS });
    }
    throw new Error(`subAquariumCircuit.circuitSeat: unknown circuit profile ${JSON.stringify(profile)} (${CIRCUIT_PROFILE_NAMES.join(", ")})`);
}
