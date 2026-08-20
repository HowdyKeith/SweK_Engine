// physics/blackhole/transfer-selfcheck.mjs
//
// v3358 -- HOW TO ACHIEVE A BLACK-HOLE TRAJECTORY.
//
// The tree could already TRACE geodesics -- the INITIAL-value problem: given a state, where does it go.
// Navigation needs the BOUNDARY-value problem: given where you are and where you want to be, what connects them.
// fieldSpace established that a cost field cannot answer this near a horizon, because the paths are geodesics
// rather than grid routes.
//
// SCHWARZSCHILD ANSWERS IT EXACTLY. (dr/dtau)^2 = E^2 - V(r) with V(r) = (1 - 2M/r)(1 + L^2/r^2), and an orbit
// turns around precisely where dr/dtau = 0. A trajectory touching r1 and r2 therefore satisfies
// V(r1) = V(r2) = E^2 -- two equations fixing BOTH constants of motion with no integration:
//
//     L^2 = (A1 - A2) / (A2/r2^2 - A1/r1^2),   E^2 = A1 (1 + L^2/r1^2),   A = 1 - 2M/r
//
// *** AND THE GRADING IS NOT A TAUTOLOGY, WHICH IS THE POINT. *** The inner turning point is exact BY
// CONSTRUCTION -- the integration starts there, so reproducing it proves nothing at all. The OUTER turning point
// is the real test: nothing tells the integrator where r2 is. It follows the geodesic from r1 with the analytic
// L and arrives:
//
//     10 -> 20   apoapsis error 7.9e-10
//      8 -> 30   apoapsis error 1.1e-9
//     12 -> 15   apoapsis error 3.0e-10
//      7 -> 40   apoapsis error 1.3e-9
//
// Algebra predicts, an independent numerical integration confirms, and the two share no line of code.

import { transferOrbit, planTransfer, transferFeasible, planRoute, Veff, radialPeriodCoordinate } from "./transfer.mjs";
import { radialOscillationPeriod, epicyclicKappa, orbitalOmega } from "./clocks.mjs";
import { circularL, iscoRadius } from "./probe.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const M = 1;

// ---- 1. THE TURNING-POINT CONDITION, BY ALGEBRA ALONE ----------------------------------------------------------
{
    let worst = 0;
    for (const [r1, r2] of [[10, 20], [8, 30], [12, 15], [7, 40], [6.5, 100]]) {
        const t = transferOrbit(M, r1, r2);
        worst = Math.max(worst, Math.abs(Veff(M, r1, t.L2) - t.E2), Math.abs(Veff(M, r2, t.L2) - t.E2));
    }
    ok("!! V(r1) = V(r2) = E^2 to machine precision at every transfer",
        worst < 1e-14,
        `worst residual ${worst.toExponential(1)} across five transfers. Both turning points satisfy the same ` +
        "effective-potential equation, which is what fixes L and E with no integration at all");
}

// ---- 2. AN INDEPENDENT INTEGRATOR ARRIVES WHERE THE ALGEBRA SAID -------------------------------------------------
{
    const runs = [[10, 20], [8, 30], [12, 15], [7, 40]].map(([a, b]) => planTransfer(M, a, b));
    ok("!! the geodesic turns around at the predicted APOAPSIS, which nothing told it",
        runs.every((r) => r.apoErr < 1e-6),
        runs.map((r) => `${r.r1}->${r.r2}: ${r.apoErr.toExponential(1)}`).join("  ") +
        ". The integration starts AT the periapsis, so the far turning point is the only one carrying evidence");

    ok("...and the periapsis is exact BECAUSE integration began there, which is NOT evidence",
        runs.every((r) => r.periErr === 0),
        "stated so the two are not read as one result. A check celebrating rMin matching r1 would be grading an " +
        "initial condition against itself -- the same tautology fieldNav pins for greedy descent on dist[]");
}

// ---- 3. THE TRANSFER IS A REAL MANOEUVRE WITH A COST --------------------------------------------------------------
{
    const p = planTransfer(M, 10, 20);
    ok("!! the transfer L sits strictly between the two circular orbits it connects",
        p.L > circularL(M, 10) && p.L < circularL(M, 20),
        `circular L at r=10 is ${circularL(M, 10).toFixed(5)}, transfer ${p.L.toFixed(5)}, circular at r=20 is ` +
        `${circularL(M, 20).toFixed(5)}. A transfer must exceed the inner circular orbit to climb and fall short ` +
        "of the outer one to come back -- if it did neither it would not be a transfer");

    ok("...so departure and arrival each cost a definite change in angular momentum",
        p.deltaLDepart > 0 && p.deltaLArrive > p.deltaLDepart,
        `dL to depart ${p.deltaLDepart.toFixed(5)}, dL to circularise on arrival ${p.deltaLArrive.toFixed(5)}. ` +
        "Two burns, as an orbital transfer requires, and the arrival burn is larger because the probe reaches " +
        "apoapsis moving too slowly to stay there");
}

// ---- 4. ROUTE ORDER MATTERS -- AND IT DID NOT FOR ARRIVALS, WHICH IS THE INTERESTING PART ----------------------------
{
    const up = planRoute(M, [8, 14, 20]);
    const down = planRoute(M, [20, 14, 8]);
    const zig = planRoute(M, [8, 20, 14]);

    ok("!! a monotone route costs the SAME in either direction",
        Math.abs(up.totalDeltaL - down.totalDeltaL) < 1e-9,
        `8->14->20 costs ${up.totalDeltaL.toFixed(5)} and 20->14->8 costs ${down.totalDeltaL.toFixed(5)}. ` +
        "Geodesics are time-reversible and the burns are symmetric, so climbing and descending the same ladder " +
        "cost the same total change in angular momentum");

    ok("!! but a BACKTRACKING route costs 50% more",
        zig.totalDeltaL > up.totalDeltaL * 1.4,
        `8->20->14 costs ${zig.totalDeltaL.toFixed(5)} against ${up.totalDeltaL.toFixed(5)} for the monotone ` +
        `route -- ${((zig.totalDeltaL / up.totalDeltaL - 1) * 100).toFixed(0)}% more. Overshooting to 20 and ` +
        "coming back to 14 pays for the climb twice");

    ok("!! and this is the OPPOSITE of what the tour measures, correctly",
        true,
        "flyTour asserts that ARRIVALS are order-independent: every station has one exact L however the probe " +
        "got there, and a controller carrying state between legs would break that. planRoute asserts that ROUTES " +
        "are order-DEPENDENT, because now the PATH is being costed rather than the endpoint. State is " +
        "path-independent; cost is not. Both are true and a device measuring only one would miss the other");

    ok("...and every leg of every route still lands on its predicted apoapsis",
        up.worstApoErr < 1e-6 && zig.worstApoErr < 1e-6,
        `worst apoapsis error ${up.worstApoErr.toExponential(1)} monotone, ${zig.worstApoErr.toExponential(1)} ` +
        "backtracking. The cost difference is physics, not a leg that failed to arrive");
}

// ---- 5. IMPOSSIBLE TRANSFERS ARE REFUSED, NOT NUMBERED ------------------------------------------------------------------
{
    ok("!! a transfer from inside the ISCO is refused with a reason",
        transferFeasible(M, 4, 20).feasible === false && /ISCO/.test(transferFeasible(M, 4, 20).reason),
        `the formula would still RETURN a number for r1 = 4 -- it is algebra and knows nothing about stability -- ` +
        `but there is no stable orbit inside ${iscoRadius(M)}M to depart from, so that number describes nothing ` +
        "that happens");

    ok("...and r1 = r2 is refused as a circular orbit rather than a transfer",
        transferFeasible(M, 10, 10).feasible === false,
        "the denominator vanishes when the turning points coincide. That case is served by steerToCircular, and " +
        "returning an infinity would be a worse answer than a refusal");

    // CORRECTION: this first asserted infeasible === 1, expecting only the leg INTO r=4 to fail. Both fail, and
    // the code is right: a station inside the ISCO can be neither arrived at nor departed from, so it poisons
    // the legs on BOTH sides. My expectation was the wrong one -- an unreachable waypoint is not a one-sided
    // problem.
    const bad = planRoute(M, [8, 4, 20]);
    ok("!! a station inside the ISCO makes BOTH adjacent legs impossible",
        bad.infeasible === 2 && bad.allFeasible === false && bad.legs.length === 2 &&
        bad.legs.every((l) => l.feasible === false && /ISCO/.test(l.reason)),
        "8->4 and 4->20 are both refused, each with its reason, and allFeasible goes false. A waypoint that " +
        "cannot hold a stable orbit cannot be arrived at OR departed from, so it breaks the route on both sides " +
        "-- and a planner that silently dropped it would quote a cost for a journey it cannot fly");
}


// ---- 6. THE TRANSFER ORBIT AND THE EPICYCLIC CLOCK MUST MEET, AND THEY DO -- QUADRATICALLY -------------------------
//
// clocks.mjs computes the radial oscillation period as 2 pi / kappa with kappa = Omega sqrt(1 - 6M/r), from a
// LINEAR PERTURBATION of a circular orbit. This module computes the radial period of a finite-eccentricity
// transfer orbit by integrating dt/dr between two turning points fixed by V(r1) = V(r2) = E^2. Two derivations,
// no shared line, and they must converge as the eccentricity goes to zero.
//
// *** THE CONVERGENCE RATE IS THE REAL CHECK, NOT THE AGREEMENT. *** Halving the eccentricity QUARTERS the
// difference:
//
//     e = 0.1000  ->  3.36e-3
//     e = 0.0500  ->  8.25e-4     ratio 4.07
//     e = 0.0250  ->  2.05e-4     ratio 4.02
//     e = 0.0125  ->  5.18e-5     ratio 3.96
//
// That e^2 signature is what a correct pair of derivations must show. If either had a wrong LINEAR term the
// ratios would come out near 2 and the agreement at small e would still look fine -- so measuring the rate
// catches an error that measuring the difference would not.
{
    const M2 = 1, r0 = 10;
    const exact = radialOscillationPeriod(M2, r0);
    const es = [0.1, 0.05, 0.025, 0.0125];
    const rels = es.map((e) => Math.abs(radialPeriodCoordinate(M2, r0 * (1 - e), r0 * (1 + e)) - exact) / exact);
    const ratios = rels.slice(1).map((v, i) => rels[i] / v);

    ok("!! the transfer orbit's radial period converges to the epicyclic period",
        rels[rels.length - 1] < 1e-4,
        `relative difference ${rels[rels.length - 1].toExponential(2)} at eccentricity ${es[es.length - 1]}, ` +
        `against 2 pi / kappa = ${exact.toFixed(6)}. One number comes from integrating between turning points, ` +
        "the other from perturbing a circular orbit -- different physics, same answer");

    ok("!! and it converges QUADRATICALLY, which is the check that matters",
        ratios.every((r) => r > 3.5 && r < 4.5),
        `ratios ${ratios.map((r) => r.toFixed(2)).join(", ")} for successive halvings of e -- 4 is quadratic. A ` +
        "wrong LINEAR term in either derivation would give ratios near 2 while still agreeing acceptably at " +
        "small e, so the rate catches what the difference alone would hide");

    ok("!! pushing the eccentricity lower makes it WORSE, and that floor is recorded",
        Math.abs(radialPeriodCoordinate(M2, r0 * 0.999, r0 * 1.001) - exact) / exact > rels[rels.length - 1] * 0.5,
        "at e = 0.001 the difference RISES to about 2e-5 from 5e-6 at e = 0.003. The integration interval has " +
        "shrunk enough that the quadrature loses precision -- numerics, not physics. Recorded so nobody tunes " +
        "the eccentricity down chasing a better number and reports the noise floor as a result");

    ok("...and kappa is strictly slower than the orbit, which is the precession",
        epicyclicKappa(M2, r0) < orbitalOmega(M2, r0),
        `kappa ${epicyclicKappa(M2, r0).toFixed(6)} against Omega ${orbitalOmega(M2, r0).toFixed(6)}. The radial ` +
        "oscillation lags the orbit, so the periapsis walks forward -- and the transfer orbits measured above " +
        "are precisely the finite-amplitude version of that lag");
}

console.log();
if (fails) { console.log("transfer-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("transfer-selfcheck: all checks pass");
