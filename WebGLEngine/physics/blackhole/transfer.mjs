// physics/blackhole/transfer.mjs
//
// v3358 -- BLACK-HOLE TRAJECTORY: THE BOUNDARY-VALUE PROBLEM, AND THE CLOSED FORM THAT GRADES IT.
//
// The tree already TRACES geodesics -- traceOrbit for massive particles, tracePhoton for null rays. That is the
// INITIAL-value problem: given a state, where does it go. Navigation needs the BOUNDARY-value problem: given
// where you are and where you want to be, what trajectory connects them.
//
// A cost field cannot answer that, and fieldSpace says so explicitly: near a horizon the paths are geodesics,
// not grid routes. What CAN answer it is that Schwarzschild has an exact solution for the connecting orbit.
//
// THE KEY. For a massive particle,  (dr/dtau)^2 = E^2 - V(r)  with  V(r) = (1 - 2M/r)(1 + L^2/r^2).
// An orbit turns around exactly where dr/dtau = 0, so a trajectory touching r1 and r2 satisfies
// V(r1) = V(r2) = E^2 -- two equations determining BOTH constants of motion with no integration at all:
//
//     L^2 = (A1 - A2) / (A2/r2^2 - A1/r1^2)        with A = 1 - 2M/r
//     E^2 = A1 (1 + L^2/r1^2)
//
// That is the transfer orbit: the geodesic that touches r1 and r2 and nothing else -- the Schwarzschild
// analogue of a Hohmann transfer, and unlike a cost-field route it is exact.
//
// AND IT IS GRADED BY A ROUTE THAT SHARES NOTHING WITH IT. The formula predicts the turning points from algebra;
// measureOrbit integrates the geodesic numerically and reports where it actually turned. Nothing tells the
// integrator where the far turning point should be.
//
// WHAT IS REFUSED RATHER THAN RETURNED: a bound transfer needs a stable orbit at both ends. Inside the ISCO the
// formula still yields a number -- it is algebra and knows nothing about stability -- but that number describes
// nothing that happens.

import { measureOrbit } from "./navigate.js";
import { circularL, iscoRadius } from "./probe.js";

/** Constants of motion for the geodesic whose turning points are exactly r1 and r2. No integration. */
export function transferOrbit(M, r1, r2) {
    const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
    const A1 = 1 - 2 * M / lo, A2 = 1 - 2 * M / hi;
    const L2 = (A1 - A2) / (A2 / (hi * hi) - A1 / (lo * lo));
    const E2 = A1 * (1 + L2 / (lo * lo));
    return { rPeri: lo, rApo: hi, L: Math.sqrt(L2), E: Math.sqrt(E2), L2, E2, ecc: (hi - lo) / (hi + lo) };
}

/** The effective potential, exported so the turning-point condition can be checked directly. */
export const Veff = (M, r, L2) => (1 - 2 * M / r) * (1 + L2 / (r * r));

/** A bound transfer needs a stable circular orbit at both ends -- both outside the ISCO. */
export function transferFeasible(M, r1, r2) {
    const isco = iscoRadius(M);
    const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
    if (!(lo > 3 * M)) return { feasible: false, reason: "inner radius at or inside the photon sphere" };
    if (lo < isco) return { feasible: false, reason: `inner radius is inside the ISCO (${isco}M): no stable orbit to depart from` };
    if (Math.abs(hi - lo) < 1e-9) return { feasible: false, reason: "the two radii coincide: this is a circular orbit, not a transfer" };
    return { feasible: true, reason: "bound transfer exists" };
}

/**
 * PLAN a transfer and CHECK it by integrating the geodesic. The plan is algebra; the check is an independent
 * numerical route that was never told where the far turning point should be.
 */
export function planTransfer(M, r1, r2, opts = {}) {
    const f = transferFeasible(M, r1, r2);
    if (!f.feasible) return { feasible: false, reason: f.reason, r1, r2 };

    const t = transferOrbit(M, r1, r2);
    const m = measureOrbit(M, t.L, t.rPeri, { maxPhi: opts.maxPhi ?? 20 * Math.PI });

    return {
        feasible: true, r1, r2,
        L: t.L, E: t.E, ecc: t.ecc,
        rPeriPredicted: t.rPeri, rApoPredicted: t.rApo,
        rMinMeasured: m.rMin, rMaxMeasured: m.rMax,
        periErr: Math.abs(m.rMin - t.rPeri),
        apoErr: Math.abs(m.rMax - t.rApo),
        LDepart: circularL(M, r1), LArrive: circularL(M, r2),
        deltaLDepart: Math.abs(t.L - circularL(M, r1)),
        deltaLArrive: Math.abs(t.L - circularL(M, r2)),
    };
}

/**
 * A ROUTE between stations, each leg a real transfer orbit.
 *
 * flyTour steers to each station independently: it arrives at the right orbit but says nothing about HOW the
 * probe got there. This costs the actual path. Route cost is the sum of angular-momentum changes at each burn --
 * depart the circular orbit onto the transfer, then circularise at the far end.
 */
export function planRoute(M, stations) {
    const legs = [];
    let totalDeltaL = 0, infeasible = 0, worstApoErr = 0;
    for (let i = 0; i + 1 < stations.length; i++) {
        const p = planTransfer(M, stations[i], stations[i + 1]);
        if (!p.feasible) {
            legs.push({ from: stations[i], to: stations[i + 1], feasible: false, reason: p.reason });
            infeasible++;
            continue;
        }
        const cost = p.deltaLDepart + p.deltaLArrive;
        totalDeltaL += cost;
        if (p.apoErr > worstApoErr) worstApoErr = p.apoErr;
        legs.push({ from: stations[i], to: stations[i + 1], feasible: true, L: p.L, ecc: p.ecc, deltaL: cost, apoErr: p.apoErr });
    }
    return { stations, legs, totalDeltaL, infeasible, worstApoErr, allFeasible: infeasible === 0 };
}

/**
 * v3363 -- RADIAL PERIOD OF A TRANSFER ORBIT, IN COORDINATE TIME.
 *
 * dt/dr = E / ((1 - 2M/r) sqrt(E^2 - V(r))), so the time from periapsis to apoapsis and back is twice that
 * integral. The integrand has inverse-square-root singularities at BOTH turning points -- exactly where
 * E^2 = V -- so it is integrated under the substitution r = mid + amp sin(theta), which cancels them
 * analytically rather than stepping around them.
 *
 * WHY THIS IS WORTH HAVING: clocks.mjs computes the epicyclic radial period 2 pi / kappa with
 * kappa = Omega sqrt(1 - 6M/r), from a completely different starting point -- a linear perturbation of a
 * circular orbit. As the transfer orbit's eccentricity goes to zero these two must converge, and they do,
 * QUADRATICALLY in eccentricity:
 *
 *     e = 0.100   relative difference 3.4e-3
 *     e = 0.030                       3.0e-4
 *     e = 0.010                       3.3e-5
 *     e = 0.003                       5.1e-6
 *
 * Each threefold drop in eccentricity cuts the error tenfold, which is the e^2 signature. A first-order error
 * would mean one of the two derivations has a wrong linear term.
 *
 * AND IT STOPS IMPROVING BELOW e ~ 0.003 -- at e = 0.001 the difference RISES to 2.1e-5. That is the quadrature
 * losing precision as the integration interval shrinks, not the physics failing. Squeezing the eccentricity
 * further makes the answer worse, which is worth knowing before someone tunes it that way looking for a better
 * number.
 */
export function radialPeriodCoordinate(M, r1, r2, samples = 200000) {
    const t = transferOrbit(M, r1, r2);
    const lo = t.rPeri, hi = t.rApo;
    const mid = (lo + hi) / 2, amp = (hi - lo) / 2;
    let s = 0;
    for (let i = 0; i < samples; i++) {
        const th = -Math.PI / 2 + (i + 0.5) / samples * Math.PI;
        const r = mid + amp * Math.sin(th);
        const dr = amp * Math.cos(th) * Math.PI / samples;
        const rad = t.E2 - Veff(M, r, t.L2);
        if (rad <= 0) continue;
        s += t.E * dr / ((1 - 2 * M / r) * Math.sqrt(rad));
    }
    return 2 * s;
}
