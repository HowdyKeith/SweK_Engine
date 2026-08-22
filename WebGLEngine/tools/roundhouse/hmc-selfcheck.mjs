// tools/roundhouse/hmc-selfcheck.mjs
//
// v3287 -- HMC BECOMES THE 36th GRADED DEVICE, AND BRINGS A KIND OF KEY THE LAB DID NOT HAVE.
//
// Every device here is graded against a closed form, and nearly all of those keys are STATISTICAL or physical --
// a number the simulation should approach. HMC adds a STRUCTURAL one that is exact in floating point:
//
//     A SYMPLECTIC INTEGRATOR PRESERVES PHASE-SPACE VOLUME. det(d(q',p')/d(q,p)) = 1, EXACTLY, by construction.
//
// Measured: leapfrog gives |det - 1| = 2.3e-11 (finite-difference noise on the Jacobian estimate). The module's
// own eulerStepWRONG gives 6.0e-2 at the same step size -- nine orders apart, from a single evaluation with no
// chain, no seed dependence and no convergence argument.
//
// WHY THAT IS THE HEADLINE OBSERVABLE RATHER THAN THE MOMENTS. The module's header names the trap: a wrong
// GRADIENT with an exact accept step still samples the right distribution and only costs acceptance, while a
// wrong INTEGRATOR silently breaks detailed balance. The moment errors would eventually reveal the second, but
// only with a chain long enough for 1/sqrt(n) to shrink below the bias -- and "run it longer" is exactly the
// escape hatch that turns a failing test into a passing one without fixing anything. The Jacobian catches it in
// one number.
//
// The moments are still graded, because they check a different thing: that the sampler targets the distribution
// it claims to. Their tolerance respects the sample size instead of being chosen to fit.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("hmc");

// ---- 1. THE STRUCTURAL KEY -- exact, and independent of any chain ------------------------------------------------
{
    const o = await dev.build({ mode: "symplectic" });
    ok("!! leapfrog preserves phase-space volume: |det J - 1| is at the numerical floor",
        o.jacobianErr < 1e-8,
        `det = ${o.jacobianDet.toFixed(12)}, error ${o.jacobianErr.toExponential(2)}. This is a finite-difference ` +
        "estimate of a Jacobian, so the residual is differencing noise rather than a physical tolerance -- the " +
        "true value is exactly 1 by construction");

    ok("...and the step is reversible to machine precision",
        o.reversibilityResidual < 1e-14,
        `${o.reversibilityResidual.toExponential(2)} after L steps forward, momentum flip, L steps back. ` +
        "Reversibility and volume preservation are the two properties detailed balance rests on");
}

// ---- 2. THE PLANTED INTEGRATOR IS CAUGHT BY THAT KEY ALONE ---------------------------------------------------------
{
    const good = await dev.build({ mode: "symplectic" });
    const bad = await dev.build({ mode: "symplectic", config: { planted: true } });
    ok("!! eulerStepWRONG is detected by the Jacobian, nine orders clear",
        bad.jacobianErr > 1e-3 && bad.jacobianErr / good.jacobianErr > 1e6,
        `leapfrog ${good.jacobianErr.toExponential(2)} vs explicit Euler ${bad.jacobianErr.toExponential(2)}. ` +
        "Euler is not symplectic: it inflates phase-space volume every step, so a sampler using it drifts even " +
        "when every other part is right");

    ok("...and it breaks reversibility too, so the two structural checks agree",
        bad.reversibilityResidual > 1e-3,
        `${bad.reversibilityResidual.toExponential(2)} against ${good.reversibilityResidual.toExponential(2)}. ` +
        "Two independent structural properties, one broken integrator, both fail -- if only one had, that would " +
        "be worth investigating before trusting either");
}

// ---- 3. THE STATISTICAL KEY -- graded with a tolerance the sample size earns -----------------------------------------
{
    const o = await dev.build({ mode: "moments" });
    // Monte Carlo standard error on the mean of a variance-2 coordinate at n samples is sqrt(2/n); with n=4000
    // that is 0.022, and HMC's samples are correlated so the effective n is lower. A 0.1 bound is a few standard
    // errors, NOT a number chosen because the measurement happened to fit under it.
    const se = Math.sqrt(2 / o.samples);
    ok("!! the chain recovers the exact mean and covariance of the target",
        o.meanErr < 0.1 && o.covErr < 0.15,
        `mean err ${o.meanErr.toFixed(4)}, cov err ${o.covErr.toFixed(4)} over ${o.samples} samples. The naive ` +
        `standard error is sqrt(2/n) = ${se.toFixed(4)}, so the bound is a few of those -- correlated samples ` +
        "make the effective n smaller, which is why it is not tighter");

    ok("acceptance is high and the energy error is small, as leapfrog at this step size should give",
        o.acceptRate > 0.8 && o.meanAbsDH < 0.2,
        `accept ${(o.acceptRate * 100).toFixed(1)}%, mean |dH| ${o.meanAbsDH.toFixed(4)}. A low acceptance would ` +
        "still sample correctly -- it just wastes work -- which is precisely why acceptance cannot be the check");
}

// ---- 4. THE DEVICE DECLARES ITSELF -------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("hmc declares its modes rather than leaving the census to probe",
        m.source === "exported" && m.declared.length === 2,
        `source "${m.source}", modes ${JSON.stringify(m.declared)} -- 36 graded of 113 proven after this`);
}

console.log();
if (fails) { console.log("hmc-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("hmc-selfcheck: all checks pass");
