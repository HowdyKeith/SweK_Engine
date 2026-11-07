// WebGLEngine/render/subAquariumCircuit.mjs -- UNNUMBERED (the version is chosen at ship time) (the gate is render/subAquariumCircuit-selfcheck.mjs; the weights are render/subAquariumCircuitWeights.mjs, generated)
//
// THE DECISION CIRCUIT AS A SURVEY PROFILE FOR THE SUB AQUARIUM (Keith, 2026-11-07, "the decision circuit as an aquarium profile"): the survey event of render/subAquariumSim.mjs lets a planner profile (standard, events, wide, ensemble) choose the order of the stations; this module adds two more profiles that are SEATS of the needs-and-limits series and not planners:
//   rule     the tuned rule at the survey seat's constants (brain/tunedRule.mjs tunedSeat, the switchboard's `rule-low06`): nearest-first, surfacing, the depth cap, the pump and the repair by the rule. The circuit's own starting point and the control of the decision-circuit rounds.
//   circuit  the plain-net champion of the decision-circuit round (the file brain/decisionCircuitTraining.jsonl, family plain, search k 2, digest c916e7f5, `circuit-plain` of the audits): the SAME seat (brain/circuitSeat.mjs makeSeat) over a 21 -> 84 -> 7 relu net whose readout started at zero, so it is the rule plus what the training moved.
// WHAT THIS IS AND IS NOT: a seat that can be WATCHED in the tank. It is not a measurement: the net was trained and audited in the needs task (brain/needsTask.mjs, the first-order orientation step), and the tank flies the sub on its own dynamics, so a survey here is a demonstration of the seat's decisions and not a score to compare with the audits. The audits found the circuit within noise of the rule (brain/DECISION_CIRCUIT_VS_TWIN_WIP.md section 11: THE CIRCUIT IS THE RULE);
// watching the two profiles side by side shows the same decisions most of the time and where they differ, which is the thing worth watching. Both profiles use the task's own survey length (600 s: the rule's last call is the task's): the tank refuses another length for them.
// Browser-light: only brain modules the tank already loads (plus brain/circuitSeat.mjs, brain/pilotNeedsCircuit.mjs and brain/tunedRule.mjs) and the generated weights; no node: import. Pure: no I/O, no clock, no Math.random.
"use strict";
import * as U from "../brain/tunedRule.mjs";
import * as SS from "../brain/surveySeat.mjs";
import * as CS from "../brain/circuitSeat.mjs";
import { PLAIN_CHAMPION } from "./subAquariumCircuitWeights.mjs";

export const CIRCUIT_PROFILE_NAMES = Object.freeze(["rule", "circuit"]);
export { PLAIN_CHAMPION };
/** Whether a survey profile name is one of this module's seats (the planner profiles are brain/surveySeat.mjs's). */
export const isCircuitProfile = (profile) => CIRCUIT_PROFILE_NAMES.includes(profile);
let policy = null;
/** The plain net the champion was trained in (built once). */
export const plainPolicy = () => policy || (policy = CS.createPlainPolicy(PLAIN_CHAMPION.hidden, "plain"));
/** The seat of a circuit profile: a function of the dive's context that returns the seat, the shape brain/surveySeat.mjs `surveySeat` gives. An unknown name is refused by name. */
export function circuitSeat(profile) {
    if (profile === "rule") return U.tunedSeat(SS.SURVEY_CONSTANTS, U.WIDE_BOUNDS);
    if (profile === "circuit") {
        const Pol = plainPolicy(), w = Float32Array.from(PLAIN_CHAMPION.weights);
        if (w.length !== Pol.WEIGHT_COUNT) throw new Error(`subAquariumCircuit.circuitSeat: the champion has ${w.length} weights and its net takes ${Pol.WEIGHT_COUNT}`);
        return Pol.seatFor(w);
    }
    throw new Error(`subAquariumCircuit.circuitSeat: unknown circuit profile ${JSON.stringify(profile)} (${CIRCUIT_PROFILE_NAMES.join(", ")})`);
}
