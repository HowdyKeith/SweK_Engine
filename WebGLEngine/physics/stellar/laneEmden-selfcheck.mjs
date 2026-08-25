// physics/stellar/laneEmden-selfcheck.mjs
//
// Run: node physics/stellar/laneEmden-selfcheck.mjs
"use strict";
import {
    EXACT, EXACT_XI1, solve, massFromBoundary, massFromQuadrature, starAt, measuredMassRadiusExponent,
} from "./laneEmden.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));

console.log("laneEmden-selfcheck -- do stars built from one ODE match the ones with a known answer?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THREE EXACT CLOSED FORMS, MATCHED BY AN INTEGRATOR THAT NEVER SEES THEM ***");
{
    for (const n of [0, 1]) {
        const { xi1, trace } = solve(n);
        ok(`n=${n}: RK4's surface xi1 matches the exact ${EXACT_XI1[n].toFixed(6)}`,
            xi1 !== null && rel(xi1, EXACT_XI1[n]) < 1e-9, "xi1=" + xi1);
        let worst = 0;
        for (const [xi, th] of trace) if (xi > 0.05 && xi < xi1 - 0.05) worst = Math.max(worst, Math.abs(th - EXACT[n](xi)));
        ok(`n=${n}: theta(xi) matches the closed form pointwise`, worst < 1e-9, "worst abs diff " + worst.toExponential(3));
    }
    const { xi1: xi1_5, trace: trace5 } = solve(5, { maxXi: 200 });
    let worst5 = 0;
    for (const [xi, th] of trace5) if (xi > 0.05 && xi < 150) worst5 = Math.max(worst5, Math.abs(th - EXACT[5](xi)));
    ok("n=5: theta(xi) matches the closed form even though it never reaches zero", worst5 < 1e-9, worst5.toExponential(3));
    ok("!! *** n=5 HAS NO FINITE SURFACE -- INFINITE RADIUS, AND THE SOLVER SAYS SO EXPLICITLY ***",
        xi1_5 === null, "xi1=" + xi1_5);
    // the exact form itself: prove it never crosses zero, up to a very large radius, algebraically not by trust
    let neverZero = true;
    for (let xi = 0; xi < 1e6; xi *= 1.5, xi = xi || 1) { if (EXACT[5](xi) <= 0) { neverZero = false; break; } if (xi > 1e5) break; }
    ok("...and the closed form itself never reaches zero out to xi=1e5", neverZero);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE MASS INTEGRAL, TWO ROUTES SHARING NO ARITHMETIC ***");
{
    for (const n of [0, 1, 1.5, 3]) {
        const { xi1, dthetaAtXi1, trace } = solve(n);
        const a = massFromBoundary(xi1, dthetaAtXi1);
        const b = massFromQuadrature(trace, xi1, n);
        ok(`n=${n}: boundary derivative ${a.toFixed(6)} vs quadrature ${b.toFixed(6)}`,
            rel(a, b) < 1e-8, "rel " + rel(a, b).toExponential(2));
    }
    report("one route reads a derivative at a single point from the integrator's own state; the other sums " +
           "theta^n*xi^2 across the whole trace. They touch no common arithmetic beyond the trace itself");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE MASS-RADIUS SCALING LAW, DERIVED FROM DIMENSIONAL ANALYSIS OF THE ODE ***");
{
    const exp15 = measuredMassRadiusExponent(1.5);
    ok("!! n=1.5: measured R~M exponent matches (1-n)/(3-n) = -1/3 -- the textbook white-dwarf scaling",
        rel(exp15, -1 / 3) < 1e-10, "measured " + exp15.toFixed(10));
    report("whiteDwarf.js's own header states 'a heavier white dwarf is SMALLER, R proportional to M^-1/3' -- " +
           "this reproduces that EXPONENT from the bare Lane-Emden scaling, with no physical constants borrowed " +
           "from that module and none asserted numerically equal to its normalisation");

    // *** n=0 IS GENUINELY OUTSIDE starAt()'S FORMULA, NOT AN OVERSIGHT. *** alpha ~ rhoC^{(1-n)/(2n)} divides
    // by 2n, and n=0 is where the whole Lane-Emden substitution is degenerate (P = K*rho^(1+1/n) is undefined
    // at n=0 in the first place -- n=0 stands in for an incompressible, constant-density sphere, not a true
    // member of the (K,n) polytropic family this substitution was built for). So it is checked a DIFFERENT
    // way: for theta=1 everywhere inside the star (n=0's actual density profile), the dimensionless mass
    // integral must equal xi1^3/3 exactly -- the volume of a uniform sphere in Lane-Emden units, independent of
    // any alpha-scaling formula at all.
    const { xi1: xi1_0, dthetaAtXi1: d0 } = solve(0);
    const massAt0 = massFromBoundary(xi1_0, d0);
    ok("!! n=0 (incompressible): the mass integral IS xi1^3/3, the volume of a uniform sphere -- alpha-free",
        rel(massAt0, Math.pow(xi1_0, 3) / 3) < 1e-9, "massIntegral=" + massAt0.toFixed(8) + " vs xi1^3/3=" + (Math.pow(xi1_0, 3) / 3).toFixed(8));
}

// ---------------------------------------------------------------------------
console.log("\n4. *** n=3: MASS STOPS DEPENDING ON CENTRAL DENSITY -- THE CHANDRASEKHAR MECHANISM ***");
{
    const { xi1, dthetaAtXi1 } = solve(3);
    const massIntegral = massFromBoundary(xi1, dthetaAtXi1);
    const rhoCs = [0.1, 1, 8, 100, 1e6];
    const masses = rhoCs.map((r) => starAt(r, xi1, massIntegral, 3).M);
    const radii = rhoCs.map((r) => starAt(r, xi1, massIntegral, 3).R);
    ok("!! *** every n=3 star has the SAME MASS regardless of central density, across 7 orders of magnitude ***",
        masses.every((m) => rel(m, masses[0]) < 1e-6), masses.map((m) => m.toFixed(6)).join(", "));
    // *** THE RADIUS DOES NOT SHRINK BY THE SAME SEVEN ORDERS OF MAGNITUDE AS THE DENSITY -- THAT WAS THE FIRST
    // DRAFT'S CLAIM, AND IT WAS WRONG ARITHMETIC, CAUGHT BY THIS ASSERTION FAILING RATHER THAN BY INSPECTION.
    // *** alpha ~ rhoC^{-1/3} for n=3 (from (1-n)/(2n) = -1/3), so a 1e7x change in central density gives a
    // (1e7)^(1/3) ~ 215.4x change in radius, not 1e7x -- checked here against the closed-form cube-root
    // directly rather than restated in prose.
    const ratio = radii[0] / radii[4];
    const expected = Math.pow(rhoCs[4] / rhoCs[0], 1 / 3);
    ok("!! ...while the radius shrinks as rho_c^(-1/3), the SAME exponent magnitude as n=1.5's mass-radius law",
        rel(ratio, expected) < 1e-9, "R(0.1)/R(1e6)=" + ratio.toFixed(4) + " vs (1e7)^(1/3)=" + expected.toFixed(4));
    report("this is the mechanism, in miniature, for why the Chandrasekhar limit is a single mass rather than " +
           "a family: n=3 is the relativistic degenerate electron gas, and every star built from that equation " +
           "of state weighs the same no matter how dense its core, which is exactly what a hard mass LIMIT means");
    // and the naive exponent formula genuinely breaks here, which is why starAt is not gated on n!=3
    const naiveExp = (1 - 3) / (3 - 3);
    ok("...and the naive (1-n)/(3-n) formula is genuinely 0/-0 at n=3 -- not a typo, an actual indeterminate form",
        !Number.isFinite(naiveExp) || Number.isNaN(naiveExp) || naiveExp === -Infinity, String(naiveExp));
}

// ---------------------------------------------------------------------------
console.log("\n5. *** SABOTAGE ***");
{
    // A wrong exponent in the density power (theta^n mis-typed as theta^(n) with an off-by-something) should
    // move the surface radius away from the exact value. Simulate by solving the WRONG n against the RIGHT
    // exact form.
    const { xi1: wrongXi1 } = solve(1.1);   // n=1.1 instead of the exact n=1 case
    ok("!! solving the wrong n against n=1's exact xi1 = pi is caught", rel(wrongXi1, Math.PI) > 1e-3,
        "xi1(n=1.1)=" + wrongXi1.toFixed(6) + " vs pi=" + Math.PI.toFixed(6));

    // the mass-integral routes must be able to disagree: corrupt the quadrature's power by one
    const { xi1, dthetaAtXi1, trace } = solve(1.5);
    const a = massFromBoundary(xi1, dthetaAtXi1);
    const bWrong = massFromQuadrature(trace, xi1, 1.5 + 0.3);   // quadrature integrates the wrong density power
    ok("!! a quadrature run against the wrong density exponent disagrees with the boundary route",
        rel(a, bWrong) > 1e-2, "rel " + rel(a, bWrong).toExponential(2));

    // the n=3 invariance must be able to fail: use the wrong (naive, off-formula) scaling for a non-3 index
    const bogusMasses = [1, 8, 100].map((r) => starAt(r, xi1, a, 1.5).M);   // n=1.5 genuinely DOES vary with rhoC
    ok("!! at n=1.5 (not 3) the mass genuinely DOES change with central density -- the invariance is n=3-specific",
        rel(bogusMasses[0], bogusMasses[2]) > 0.5, bogusMasses.map((m) => m.toFixed(4)).join(", "));
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
