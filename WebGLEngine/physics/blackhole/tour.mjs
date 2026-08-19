// physics/blackhole/tour.mjs
//
// v3337 -- MOVING A PROBE FROM POINT TO POINT, AND PLACING PROBES BEFORE A RUN.
//
// navigate.js steers to ONE circular orbit and grades the result against an exact key. mission.js is the layer
// above -- something proposes a destination, the measurement adjudicates. What neither does is the thing Keith
// asked for: a probe that visits several stations in order, and probes STATIONED IN ADVANCE so a run can be
// instrumented before it starts.
//
// BOTH ARE GRADEABLE FOR THE SAME REASON THE SINGLE HOP IS. For a Schwarzschild circular orbit the angular
// momentum is exact:
//
//     L(r) = sqrt(M r^2 / (r - 3M))
//
// so every waypoint on a tour carries its own answer key, and a tour is not a demo -- it is a sequence of graded
// arrivals. Measured on the existing controller: err 6.2e-13 at r=8, 9.7e-13 at r=10, 6.9e-13 at r=14, 1.1e-12
// at r=20.
//
// WHAT A TOUR ADDS THAT REPEATED SINGLE HOPS DO NOT, and this is the part worth building rather than looping:
//
//   1. THE COST OF THE ROUTE IS A MEASUREMENT. Each leg costs bisection iterations, and the total depends on the
//      ORDER of the stations. A tour that revisits the same radii in a different order should cost differently,
//      and whether it does is a fact about the controller rather than about the physics.
//
//   2. ORDER MUST NOT CHANGE THE ARRIVALS. Every station has one exact L regardless of how the probe got there,
//      so visiting {8, 14, 20} and {20, 8, 14} must produce IDENTICAL L values. If they do not, the controller
//      is carrying state between legs and the single-hop key was hiding it.
//
//   3. A STATION CAN BE IMPOSSIBLE. r < 6M has no stable circular orbit, and the honest answer is a refusal
//      rather than a number. A tour that quietly skipped an impossible station would report success for a route
//      it did not fly.
//
// PLACEMENT IS THE SAME MACHINERY WITHOUT THE TRAVEL: given a list of radii, produce the exact states, so a run
// can be instrumented in advance rather than steered to during it. That is cheap and needs no controller at all,
// which is precisely why it is worth separating -- placing is exact, travelling is measured.

import { steerToCircular, stabilityOf } from "./navigate.js";
import { circularL, iscoRadius } from "./probe.js";

// The exact angular momentum of a circular orbit is circularL(M, r) from probe.js -- sqrt(M r^2 / (r - 3M)).
// It is IMPORTED rather than rewritten: a first draft of this file defined its own exactL with the identical
// formula, which is the duplicated-constant bug this tree keeps finding. Two copies of one closed form drift the
// moment either is edited, and nothing would notice because both would still be internally consistent.
export const exactL = circularL;

/** Is a circular orbit at r even possible, and is it stable? ISCO = 6M for Schwarzschild. */
export function stationFeasible(M, r) {
    if (!(r > 3 * M)) return { feasible: false, reason: "r <= 3M: no circular orbit exists at or inside the photon sphere" };
    if (r < iscoRadius(M)) return { feasible: false, unstable: true, reason: `r < ISCO (${iscoRadius(M)}M): circular orbit exists but is unstable` };
    return { feasible: true, reason: "stable circular orbit" };
}

/**
 * PLACE probes at a list of radii without steering to them -- exact, instant, no controller.
 * This is the "instrument the run before it starts" case.
 */
export function placeProbes(M, radii) {
    return radii.map((r) => {
        const f = stationFeasible(M, r);
        return {
            r, feasible: f.feasible, unstable: !!f.unstable, reason: f.reason,
            L: f.feasible ? exactL(M, r) : null,
            // orbital period at r, for scheduling a run: T = 2 pi sqrt(r^3 / M)
            period: f.feasible ? 2 * Math.PI * Math.sqrt(r * r * r / M) : null,
        };
    });
}

/**
 * FLY a tour: steer to each station in order, grading every arrival against its own exact L.
 * Returns per-leg results and the route cost. Infeasible stations are REFUSED, not skipped.
 */
export function flyTour(M, stations, opts = {}) {
    const legs = [];
    let totalIterations = 0, worstErr = 0, refused = 0;
    for (const r of stations) {
        const f = stationFeasible(M, r);
        if (!f.feasible) {
            legs.push({ r, flown: false, refused: true, reason: f.reason, L: null, exact: null, err: null });
            refused++;
            continue;
        }
        const s = steerToCircular(M, r, opts);
        const exact = exactL(M, r);
        const err = Math.abs(s.L - exact);
        totalIterations += s.iterations || 0;
        if (err > worstErr) worstErr = err;
        legs.push({
            r, flown: true, refused: false, verdict: s.verdict,
            L: s.L, exact, err, iterations: s.iterations, ecc: s.ecc, stable: s.stable,
        });
    }
    return {
        M, stations, legs,
        arrived: legs.filter((l) => l.flown).length,
        refused, totalIterations, worstErr,
        allArrived: refused === 0 && legs.every((l) => l.flown && l.verdict === "circularised"),
    };
}
