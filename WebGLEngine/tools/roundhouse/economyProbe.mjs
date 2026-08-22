// WebGLEngine/tools/roundhouse/economyProbe.mjs -- v3041
//
// GRADES SOMEONE ELSE'S PLANNER. Kalcode/spaceprojectsim exposes exactly the four routes that turn a simulation
// into an instrument: POST /api/sim/pause, POST /api/admin/markets/{location}/supply, POST /api/sim/step, and
// GET /api/debug/agent/{id}/trace. Pause, perturb a known quantity, advance ONE tick, read what the agent
// actually decided. That is a counterfactual, not an inference -- the same thing a SweK gate gives escalateRoute
// and the thing frugon structurally cannot have.
//
// THE MEASUREMENT IS BLIND MOST OF THE TIME, AND THAT IS THE POINT OF THIS FILE.
//
// Their plan_goal is a PRIORITY WATERFALL, not a scorer: rest -> fuel -> sell cargo -> retrofit -> and only then
// an elective band that scores fulfill_delivery against trade_run via ln(profit) x (1 + prefer_goals). Every
// rung above the elective band is a HARD GATE that fires regardless of any margin. A planted price error can
// only change a decision for a ship standing in the elective band at that instant.
//
// Keith's own run says how rare that is. At tick 80: 213 of 282 ships idle. At tick 5920: 133-138 on rest_crew
// with 190 crew eating and morale floored at 32 avg / 0 min. In both regimes the band is a MINORITY STATE.
//
// So this reports BAND POPULATION beside every verdict, and refuses to conclude below a floor -- the same shape
// as routeTable reporting `judged` beside `calls`. A "the planner ignored the margin" result computed over four
// eligible ships is not a finding about the planner; it is a finding about the sample.
"use strict";

// The waterfall, in their order. A ship at any rung above ELECTIVE never reaches the scored comparison.
export const WATERFALL = ["rest_crew", "refuel", "sell_cargo", "seek_retrofit"];
// The two goals the elective band actually scores against each other.
export const ELECTIVE = ["fulfill_delivery", "trade_run"];
// Floor for a verdict. Deliberately NOT imported from routeTable: that floor counts gated LLM calls and this
// one counts eligible ships. Same lesson, different unit -- sharing the constant would imply a shared meaning.
export const MIN_BAND = 12;

/** Is this ship's goal one the margin can move? */
export function inBand(goal) { return ELECTIVE.indexOf(String(goal)) >= 0; }

/**
 * Read their publish histogram -- ships: {"trade_run": 94, "rest_crew": 138, ...} -- and report how much of the
 * fleet is actually measurable. Blocked counts the waterfall rungs by name so a NEW rung they add later shows up
 * as "other" rather than being silently counted as eligible.
 */
export function bandCensus(histogram) {
    const h = histogram || {};
    let band = 0, blocked = 0, other = 0, total = 0;
    for (const [goal, n] of Object.entries(h)) {
        const c = Number(n) || 0; total += c;
        if (inBand(goal)) band += c;
        else if (WATERFALL.indexOf(goal) >= 0) blocked += c;
        else other += c;
    }
    return {
        total, band, blocked, other,
        fraction: total ? band / total : 0,
        measurable: band >= MIN_BAND,
        why: total === 0 ? "empty histogram -- nothing was sampled"
            : band >= MIN_BAND ? band + " of " + total + " ships are in the elective band"
            : band + " of " + total + " ships in the band, floor is " + MIN_BAND +
              " -- a verdict here would describe the sample, not the planner",
    };
}

/**
 * The request sequence, as DATA rather than executed here. Returned so a gate can assert the ORDER without a
 * live sim, and so the bridge cannot quietly reorder it: perturbing before pausing means the tick loop moves
 * underneath the write and the "one tick" is not one tick.
 */
export function perturbationPlan({ location, commodity, delta, shipId, ticks = 1 }) {
    if (!location || !commodity) throw new Error("perturbationPlan needs a location and a commodity");
    if (typeof delta !== "number" || !Number.isFinite(delta)) throw new Error("delta must be a finite number -- an unspecified perturbation cannot be attributed");
    if (!shipId) throw new Error("perturbationPlan needs the ship whose decision is being observed");
    if (!(ticks >= 1)) throw new Error("stepping zero ticks observes nothing");
    return [
        { method: "POST", path: "/api/sim/pause", why: "freeze first -- a supply write against a running loop is not a controlled perturbation" },
        { method: "GET", path: "/api/debug/agent/" + shipId + "/trace", why: "BEFORE decision, captured while paused so the baseline cannot drift under the read" },
        { method: "POST", path: "/api/admin/markets/" + location + "/supply", body: { [commodity]: delta }, why: "the planted, known quantity" },
        { method: "POST", path: "/api/sim/step", body: { ticks }, why: "advance exactly " + ticks + " -- resume would make the delta unattributable" },
        { method: "GET", path: "/api/debug/agent/" + shipId + "/trace", why: "AFTER decision -- compared against the before trace, and the only tick between them is the one we stepped" },
    ];
}

/**
 * Did the planted margin move the decision?
 *
 * FOUR OUTCOMES, NOT TWO. "Changed" and "unchanged" are only meaningful when the ship was eligible to be moved
 * and the observation was clean; the other two are refusals, and they are the honest majority.
 */
export function verdict({ before, after, census }) {
    if (!census || !census.measurable) return { outcome: "INSUFFICIENT", changed: null, why: (census && census.why) || "no census supplied" };
    if (!before || !after) return { outcome: "NO-TRACE", changed: null, why: "an agent trace is missing -- the decision was not observed, which is not the same as a decision that did not change" };
    if (!inBand(before.goal)) return { outcome: "BLOCKED", changed: null, why: "this ship was at '" + before.goal + "', a waterfall rung above the elective band, so the margin could not reach it. Not evidence about the scorer." };
    const changed = String(before.goal) !== String(after.goal) || String(before.target || "") !== String(after.target || "");
    return {
        outcome: changed ? "MOVED" : "UNMOVED",
        changed,
        from: before.goal + (before.target ? " -> " + before.target : ""),
        to: after.goal + (after.target ? " -> " + after.target : ""),
        band: census.band,
        why: changed
            ? "the planted margin changed the choice, so the planner is reading the number it claims to use"
            : "the choice held under the perturbation -- either the delta was below the planner's sensitivity, or the score is not driving this decision. ONE trial cannot tell those apart; sweep the delta.",
    };
}

/**
 * Their score is ln(profit) x (1 + prefer_goals). Logarithmic compression means a proportional supply change
 * does NOT produce a proportional score change, so the detection floor is not linear and probably not monotone
 * -- the thermal-linear lesson, in someone else's units. Returned so a sweep can be planned rather than guessed.
 */
export function scoreShift(profitBefore, profitAfter) {
    if (!(profitBefore > 0) || !(profitAfter > 0)) return { shift: null, why: "ln is undefined at or below zero profit -- an unpriceable trial, not a zero-effect one" };
    return {
        shift: Math.log(profitAfter) - Math.log(profitBefore),
        ratio: profitAfter / profitBefore,
        why: "a " + (profitAfter / profitBefore).toFixed(2) + "x profit change is only a " +
             (Math.log(profitAfter) - Math.log(profitBefore)).toFixed(3) + " score shift -- whether that flips the choice depends entirely on the gap to the runner-up",
    };
}
