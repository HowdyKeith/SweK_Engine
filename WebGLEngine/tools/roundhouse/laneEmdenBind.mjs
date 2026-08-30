// tools/roundhouse/laneEmdenBind.mjs
//
// v3991 -- THE STELLAR STRUCTURE DEVICE. physics/stellar/laneEmden.mjs shipped at v3987 with its own gate;
// this hands it to the roundhouse so polytropic stars are swept and adjudicated beside the other devices.
//
// MODES:
//   "profile"   solve at a given index: the surface radius xi1, against the closed forms where one exists.
//   "mass"      the two mass routes -- a boundary derivative read off the ODE, and direct quadrature of the
//               density profile -- which share no arithmetic beyond the trace.
//   "scaling"   the mass-radius exponent (1-n)/(3-n) and, at n=3, the Chandrasekhar invariance: mass stops
//               depending on central density altogether.
//
// ================================================================================================================
// *** THE PLANTED ERROR IS A DIMENSIONALITY SLIP, AND THE PLANTED PHYSICS IS ENTIRELY CORRECT ***
// ================================================================================================================
//
// The plant solves the equation in CYLINDRICAL rather than spherical geometry -- (d-1)/xi with d = 2 instead of
// d = 3. That is not a corrupted equation. It is the Lane-Emden equation for a different number of dimensions,
// and every solution it produces is a genuine solution of a genuine problem:
//
//   n = 0   xi1 = 2 EXACTLY, its own closed form theta = 1 - xi^2/4.
//   n = 1   xi1 = 2.4048255577 -- THE FIRST ZERO OF THE BESSEL FUNCTION J0, because the cylindrical n=1 case
//           IS Bessel's equation. Correct to ten digits against a series-plus-Newton computation.
//
// So the planted device produces density profiles that start at 1, fall smoothly, and terminate at a surface --
// stars, in every visible respect, at every index anybody normally looks at. A check that asks "did we get a
// sensible stellar profile" passes it without hesitation.
//
// *** AND IT DESTROYS THE ONE FAMOUS LIMITING RESULT. *** The n = 5 polytrope has INFINITE RADIUS in spherical
// geometry -- theta = (1 + xi^2/3)^(-1/2) approaches zero and never reaches it, which is why Chandrasekhar used
// n = 5 as the boundary of physical polytropes. In cylindrical geometry that is simply not true: the planted
// solver finds a surface at xi1 = 5.427575. The plant gives an infinite star a finite edge.
//
// EVERY MODE REPORTS `xi1` AND `massIntegral`, deliberately rather than decoratively. plantedCoverage RUNS each
// device nominal against planted in every declared mode and counts a mode only if a FINITE NUMERIC observable
// moves; those two are the quantities the geometry always shifts.
"use strict";
import {
    EXACT_XI1, solve, massFromBoundary, massFromQuadrature, starAt, measuredMassRadiusExponent,
} from "../../physics/stellar/laneEmden.mjs";

export const LANE_EMDEN_OBSERVABLES = [
    "xi1", "hasSurface", "massIntegral", "surfaceVsExact",
    "massBoundary", "massQuadrature", "massRouteSpread",
    "scalingExponent", "scalingExpected", "scalingErr",
    // v4000 -- scalingErr is null at a degenerate index rather than 0, and scalingProbeErr grades the scaling
    // algebra at an index where it can actually fail. See the block in the "scaling" mode below.
    "scalingDegenerate", "scalingProbeIndex", "scalingProbeErr",
    "massAtLowDensity", "massAtHighDensity", "massInvariance",
    "radiusAtLowDensity", "radiusAtHighDensity", "radiusRatio",
    "planted",
];

// d = 2 rather than 3: cylindrical instead of spherical. Real physics, wrong geometry.
const PLANT_DIM = 2;
// n = 1 by default rather than 3, so EVERY mode has something meaningful at the defaults: n=1 has a closed-form
// surface (xi1 = pi) for the profile mode AND a finite scaling exponent ((1-1)/(3-1) = 0, the real result that
// an n=1 polytrope's radius does not depend on its mass at all). At n=3 the exponent is a genuine indeterminate
// form, so it would report -Infinity and tell a sweep nothing. The Chandrasekhar invariance keeps its own index.
//
// *** dxi IS NOT ADVERTISED AS A KNOB, AND THAT IS v3436's LESSON APPLIED RATHER THAN REDISCOVERED. *** It was
// in this table first. Driven across every mode it MOVED NOTHING: RK4 is fourth order here, so 2e-5 against
// 1e-4 shifts xi1 from 3.141592653624 to 3.141592653809 -- a relative change of 6e-11, which is float-level
// noise rather than a response. An advertised knob the observables cannot reflect is exactly the defect
// nuclearBind's comment records (A and Z declared and ignored until the sensitivity matrix found them), so it
// is a fixed constant below instead.
const SOLVE_DXI = 2e-5;
const DEF = { n: 1, rhoLo: 1, rhoHi: 8, invarianceIndex: 3 };

function buildLaneEmden({ mode = "profile", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const dim = config.planted ? PLANT_DIM : 3;
    const solveOpts = { dxi: SOLVE_DXI, maxXi: 60, dim };

    const { xi1, dthetaAtXi1, trace } = solve(c.n, solveOpts);
    const massIntegral = xi1 === null ? null : massFromBoundary(xi1, dthetaAtXi1);

    const blank = {
        xi1: null, hasSurface: null, massIntegral: null, surfaceVsExact: null,
        massBoundary: null, massQuadrature: null, massRouteSpread: null,
        scalingExponent: null, scalingExpected: null, scalingErr: null,
        scalingDegenerate: null, scalingProbeIndex: null, scalingProbeErr: null,
        massAtLowDensity: null, massAtHighDensity: null, massInvariance: null,
        radiusAtLowDensity: null, radiusAtHighDensity: null, radiusRatio: null,
        planted: !!config.planted,
    };

    if (mode === "mass") {
        // *** THE TWO MASS ROUTES ARE BOTH SPHERICAL, AND THAT IS WHY THEY CATCH THE PLANT. ***
        // massFromBoundary uses the identity -xi1^2 theta'(xi1) and massFromQuadrature integrates theta^n xi^2 --
        // both derived for d = 3. Under the planted geometry the SOLVER is cylindrical while these remain
        // spherical, so the two stop agreeing (spread 1.7e-11 nominal, 0.69 planted). That is not the quadrature
        // being wrong: it is a consistency check between the profile and the mass formulas doing exactly the job
        // a two-route check exists for, and it is the sharpest single detector of the geometry slip in the device.
        const b = xi1 === null ? null : massFromQuadrature(trace, xi1, c.n);
        return {
            ...blank,
            xi1, hasSurface: xi1 !== null, massIntegral,
            massBoundary: massIntegral, massQuadrature: b,
            massRouteSpread: (massIntegral == null || b == null) ? null
                : Math.abs(massIntegral - b) / Math.max(1e-300, Math.abs(massIntegral)),
        };
    }

    if (mode === "scaling") {
        const nInv = c.invarianceIndex;
        const inv = solve(nInv, solveOpts);
        const invMass = inv.xi1 === null ? null : massFromBoundary(inv.xi1, inv.dthetaAtXi1);
        const starLo = invMass == null ? null : starAt(c.rhoLo, inv.xi1, invMass, nInv);
        const starHi = invMass == null ? null : starAt(c.rhoHi, inv.xi1, invMass, nInv);
        const lo = starLo && starLo.M, hi = starHi && starHi.M;
        // *** THE RADIUS IS REPORTED BECAUSE IT IS THE ONLY THING rhoLo AND rhoHi CAN MOVE, AND THAT IS THE
        // PHYSICS RATHER THAN A CONVENIENCE. *** At the invariance index the MASS is fixed by construction
        // (Chandrasekhar), and the scaling EXPONENT is a power law and therefore scale-invariant -- so a device
        // reporting only those two advertises two knobs that provably cannot move anything. The radius is what
        // actually responds (R ~ rhoC^(-1/3) at n=3), and reporting it is also the more interesting half of the
        // picture: a fixed mass squeezed into a shrinking radius is exactly what a hard mass limit looks like.
        // NOTE the exponent is a property of the SCALING ALGEBRA, not of the solved profile, so the plant does
        // not move it -- which is why xi1 and massIntegral ride along in this mode too.
        const exponent = measuredMassRadiusExponent(c.n, { rhoLo: c.rhoLo, rhoHi: c.rhoHi, solveOpts });
        const expected = (1 - c.n) / (3 - c.n);
        // *** v4000 -- scalingErr WAS EXACTLY 0 AT THIS DEVICE'S DEFAULT INDEX, AND MEASUREMENT SHOWED IT WAS
        // NOT MERELY EXACT -- IT WAS BLIND. *** census-selfcheck flagged it as a new unexplained exact zero and
        // the honest answer turned out to be worse than "exact by construction". Three separate typos were
        // planted in starAt -- the alpha exponent (1-n)/(2n), the mass power alpha^3, and a constant on R --
        // and at n=1 scalingErr stayed 0.000e+0 THROUGH ALL THREE. At n=1.5 and n=2 the first two are caught
        // (3.3e-3, 1.96e-2), so the check is live; it is the DEFAULT INDEX that is degenerate.
        //
        // WHY n=1 KILLS IT: alpha = rhoC^((1-n)/(2n)) becomes rhoC^0 = 1, so the radius stops depending on
        // central density at all -- a real and well-known property of the n=1 polytrope, not a bug. Both the
        // measured exponent and the closed form then collapse to zero for the SAME reason, and their difference
        // is zero no matter what either of them is computing. A zero that cannot be anything else is not a pass.
        //
        // So the degenerate case REPORTS ITSELF instead of reporting a zero, and a probe at a non-degenerate
        // index rides along so the scaling algebra is graded on EVERY run rather than only on the runs somebody
        // happened to configure away from the default.
        const degenerate = !Number.isFinite(expected) || !Number.isFinite(exponent) || c.n === 1;
        // The probe index is NOT the configured one and NOT 1 or 3: those are the two indices where this
        // comparison loses its content (n=1 kills the radius dependence, n=3 kills the mass dependence and
        // sends both sides to -Infinity). 1.5 is the other classical polytrope and is degenerate in neither.
        const PROBE_N = 1.5;
        const probeExp = measuredMassRadiusExponent(PROBE_N, { rhoLo: c.rhoLo, rhoHi: c.rhoHi, solveOpts });
        return {
            ...blank,
            xi1, hasSurface: xi1 !== null, massIntegral,
            scalingExponent: exponent,
            scalingExpected: Number.isFinite(expected) ? expected : null,
            scalingErr: degenerate ? null : Math.abs(exponent - expected),
            scalingDegenerate: degenerate ? 1 : 0,
            scalingProbeIndex: PROBE_N,
            scalingProbeErr: Math.abs(probeExp - (1 - PROBE_N) / (3 - PROBE_N)),
            massAtLowDensity: lo, massAtHighDensity: hi,
            massInvariance: (lo == null || hi == null) ? null
                : Math.abs(hi - lo) / Math.max(1e-300, Math.abs(lo)),
            radiusAtLowDensity: starLo && starLo.R, radiusAtHighDensity: starHi && starHi.R,
            radiusRatio: (starLo && starHi) ? starLo.R / starHi.R : null,
        };
    }

    // "profile" -- the surface, against a closed form where one exists
    const exact = EXACT_XI1[c.n];
    return {
        ...blank,
        xi1, hasSurface: xi1 !== null, massIntegral,
        // null when the index has no closed form, or when the star has no surface at all (n=5 spherical)
        surfaceVsExact: (exact == null || xi1 == null) ? null
            : Math.abs(xi1 - exact) / Math.max(1e-300, Math.abs(exact)),
    };
}


// v4000 -- *** ONE DECLARATION SITE FOR THE MODES, SO defaults() CAN REFUSE WHAT THE DEVICE DOES NOT OFFER. ***
// deviceModes-selfcheck's ratchet caught this device newly accepting ANY mode string: `mode: mode || "profile"`
// echoes back whatever it is handed, and checkMode reads that echo as "the device offers this". A mode selects
// WHICH PHYSICS RUNS, so a device that accepts a name it does not declare runs something else and says nothing.
//
// The gate declined to fix it -- "making one validate means knowing WHICH modes it means to offer, and guessing
// that would declare an interface on somebody else's behalf" -- and that caution was right in general and
// unnecessary here: THE DEVICE ALREADY SAID. The list below was sitting inline in the device object all along,
// so nothing is being guessed; the two halves are simply being made to read from the same place.
export const LANE_EMDEN_MODES = ["profile", "mass", "scaling"];

export const laneEmdenDevice = {
    // KNOB PLANT: the perturbation replaces the GEOMETRY upstream of every observable, so the whole path from a
    // wrong number of dimensions to the reported numbers is graded.
    plantKind: "knob",
    // v4108 -- NAMED, THE SAME COMPLETION v3851/v4088-v4107 gave the rest of this family. MEASURED, profile
    // mode (default n=1) both arms: xi1 pi -> 2.4048 (the Bessel J0 zero, cylindrical geometry's own correct
    // answer), surfaceVsExact 1.09e-11 -> 0.235.
    planted: { knob: "planted", observable: "surfaceVsExact",
               note: "the equation is solved in cylindrical rather than spherical geometry -- (d-1)/xi with d=2 instead of d=3. Every solution is a genuine solution of a genuine problem (n=1 lands exactly on Bessel J0's first zero), which is why it survives every 'is this a sensible stellar profile' check and only a comparison against the SPHERICAL closed form catches it" },
    modes: LANE_EMDEN_MODES,
    name: "lane-emden-polytrope", observables: LANE_EMDEN_OBSERVABLES, build: buildLaneEmden,
    defaults: ({ mode } = {}) => ({ mode: LANE_EMDEN_MODES.includes(mode) ? mode : "profile", config: { ...DEF } }),
};
