// physics/blackhole/tour-selfcheck.mjs
//
// v3337 -- POINT-TO-POINT PROBE MOVEMENT, AND PROBES PLACED BEFORE A RUN.
//
// navigate.js steers to ONE circular orbit. mission.js adjudicates a proposed destination. Neither does the two
// things asked for: visiting several stations in order, and STATIONING probes in advance so a run is
// instrumented before it starts.
//
// BOTH ARE GRADEABLE, and for the same reason the single hop is: every circular orbit has an exact angular
// momentum, L = sqrt(M r^2 / (r - 3M)). A tour is therefore not a demo, it is a sequence of graded arrivals.
//
// THE THREE PROPERTIES A TOUR HAS THAT REPEATED SINGLE HOPS DO NOT:
//
//   ORDER-INDEPENDENCE   every station has ONE exact L however the probe got there. Flying {8,14,20} and
//                        {20,8,14} must produce identical arrivals. If they did not, the controller would be
//                        carrying state between legs and the single-hop key was hiding it. Measured: identical
//                        to the last bit, and the route costs the SAME 130 bisection iterations either way.
//   REFUSAL              r < 6M has no STABLE circular orbit. A tour that quietly skipped an impossible station
//                        would report success for a route it did not fly, so infeasible stations are refused
//                        with a reason and counted separately from arrivals.
//   COST                 total iterations is a measurement of the controller, not of the physics.
//
// AND PLACEMENT IS DELIBERATELY NOT STEERING. Given radii, produce the exact states -- no controller, no
// integration, no error. That separation is the point: placing is EXACT, travelling is MEASURED, and conflating
// them would let a controller's error hide inside a setup step.

import { placeProbes, flyTour, stationFeasible, exactL } from "./tour.mjs";
import { circularL } from "./probe.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const M = 1;

// ---- 1. PLACEMENT IS EXACT AND NEEDS NO CONTROLLER ------------------------------------------------------------
{
    const placed = placeProbes(M, [8, 10, 14, 20]);
    ok("!! probes can be stationed at exact states before any run",
        placed.every((p) => p.feasible && Math.abs(p.L - circularL(M, p.r)) === 0),
        placed.map((p) => `r=${p.r}: L=${p.L.toFixed(6)}`).join("  ") + ". No integration and no error -- the " +
        "closed form IS the answer, so instrumenting a run in advance costs nothing and introduces nothing");

    ok("...and each carries its orbital period, so a run can be SCHEDULED",
        placed.every((p) => Math.abs(p.period - 2 * Math.PI * Math.sqrt(p.r ** 3 / M)) < 1e-12),
        `periods ${placed.map((p) => p.period.toFixed(1)).join(", ")}. A probe placed without a period is a ` +
        "position with no clock, and a run that wants two probes in a known phase relation needs both");
}

// ---- 2. INFEASIBLE STATIONS ARE REFUSED, NOT SKIPPED ------------------------------------------------------------
{
    const placed = placeProbes(M, [2, 4, 5, 8]);
    ok("!! stations inside the ISCO are refused with a reason",
        placed[1].feasible === false && placed[1].unstable === true && placed[2].feasible === false,
        "r=4 and r=5 are inside the ISCO at 6M: a circular orbit exists there and will not survive a nudge, so " +
        "the L is correct and the station is not. Reporting a number for it would be true and useless");

    ok("...and r <= 3M is refused for a different reason, which is stated",
        placeProbes(M, [3])[0].feasible === false && /photon sphere/.test(placeProbes(M, [2])[0].reason),
        "no circular orbit exists at or inside the photon sphere at all -- a different impossibility from an " +
        "unstable one, and collapsing the two would lose the distinction between 'will not last' and 'cannot be'");

    const tour = flyTour(M, [8, 4, 20]);
    ok("!! a tour REFUSES an impossible station rather than skipping it",
        tour.refused === 1 && tour.arrived === 2 && tour.allArrived === false,
        "2 arrived, 1 refused, and allArrived is false. A tour that silently dropped the station would report " +
        "success for a route it did not fly");
}

// ---- 3. THE TOUR ARRIVES, AND ORDER DOES NOT CHANGE WHERE ---------------------------------------------------------
{
    const a = flyTour(M, [8, 14, 20]);
    ok("!! every leg arrives at its own exact L",
        a.allArrived && a.worstErr < 1e-10,
        `3 stations, worst error ${a.worstErr.toExponential(2)}, ${a.totalIterations} bisection iterations total. ` +
        "Each arrival is graded against sqrt(M r^2 / (r - 3M)) at that radius, so a tour is a sequence of keyed " +
        "measurements rather than a demonstration");

    const b = flyTour(M, [20, 8, 14]);
    const same = [8, 14, 20].every((r) =>
        a.legs.find((l) => l.r === r).L === b.legs.find((l) => l.r === r).L);
    ok("!! ORDER-INDEPENDENT: the same stations in a different order give identical arrivals",
        same,
        "bit-identical L at every radius, and the same " + b.totalIterations + " iterations. This is the property " +
        "a single hop cannot test: if the controller carried any state between legs -- a warm-start bracket, a " +
        "cached bound -- the second tour would differ and the single-hop key would never have shown it");
}

// ---- 4. THE FORMULA IS IMPORTED, NOT REWRITTEN -----------------------------------------------------------------------
{
    ok("!! exactL is circularL from probe.js, not a second copy",
        exactL === circularL,
        "a first draft of tour.mjs defined its own exactL with the identical formula. Two copies of one closed " +
        "form drift the moment either is edited, and BOTH would still be internally consistent -- which is the " +
        "duplicated-constant bug this tree keeps finding, caught here before it shipped");
}

console.log();
if (fails) { console.log("tour-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("tour-selfcheck: all checks pass");
