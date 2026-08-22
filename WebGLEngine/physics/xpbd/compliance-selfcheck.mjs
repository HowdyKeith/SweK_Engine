// physics/xpbd/compliance-selfcheck.mjs
//
// v3458 -- GRADING THE CLAIM xpbd.js MAKES IN ITS OWN HEADER.
//
// "a compliance parameter that makes stiffness independent of iteration count", with a warning that dropping the
// -aTilde*lambda term from Eq (18) puts you "back to iteration-dependent" behaviour. A falsifiable statement
// about the solver, never checked -- xpbd.js was one of fifteen ungraded modules under physics/xpbd.
//
// THE RIG: one fixed particle, one hanging under gravity on a single compliant distance constraint. At
// equilibrium the constraint force balances weight, so the stretch is Hooke's law with compliance as inverse
// stiffness -- dL = alpha * F, exact and independent of everything numerical.
//
//     iterations   XPBD        PBD (lambda term dropped)
//     1            1.0000e-2   1.0000e-2      <- identical, as they must be
//     2            1.0000e-2   4.9383e-3
//     4            1.0000e-2   2.4082e-3
//     8            1.0000e-2   1.1447e-3
//     16           1.0000e-2   5.1599e-4
//
// *** TWO MEASUREMENT ERRORS WERE MADE GETTING THERE AND BOTH ARE KEPT. ***
//
//   SAMPLING A PHASE. Reading the length at a fixed final time gave an apparent drift away from Hooke as
//   substeps rose -- 1.000e-2, 1.000e-2, 9.999e-3, 9.942e-3, 9.405e-3. There is no damping in the rig, so the
//   mass oscillates about equilibrium forever and a single sample reads a PHASE, not a stiffness. The agreement
//   at low substep counts was coincidence. The mean over the settled tail is what the claim is about.
//
//   SWEEPING THE WRONG AXIS. The planting was first tested across SUBSTEPS at one iteration each, and PBD came
//   back IDENTICAL to XPBD -- spread 9.53e-4 for both. That is a correct planting aimed at the wrong variable:
//   lambda accumulates ACROSS ITERATIONS WITHIN a substep, so at iterations = 1 the -aTilde*lambda term
//   multiplies a lambda still equal to zero. At one iteration the two solvers ARE the same algorithm.

import { hangingLink, iterationIndependence, stiffnessIndependence, hookeStretch } from "./compliance.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE EXACT KEY: HOOKE'S LAW -------------------------------------------------------------------------------
{
    const r = hangingLink({ compliance: 1e-3, gravity: -10 });
    ok("!! the settled stretch is alpha * F, the closed form",
        Math.abs(r.stretch - r.exact) / r.exact < 1e-4,
        `${r.stretch.toExponential(4)} against an exact ${r.exact.toExponential(4)}. Compliance IS inverse ` +
        "stiffness, so the equilibrium stretch is Hooke's law and owes nothing to the integrator");

    ok("...and it scales linearly with compliance",
        [[1e-4, 1e-3], [1e-3, 1e-2]].every(([a, b]) => {
            const ra = hangingLink({ compliance: a }), rb = hangingLink({ compliance: b });
            return Math.abs(rb.stretch / ra.stretch - 10) < 0.5;
        }),
        "a tenfold softer constraint stretches ten times further. The single-point check above could be matched " +
        "by a wrong formula with a lucky constant; the slope could not");
}

// ---- 2. THE CENTRAL CLAIM, ON THE AXIS IT IS ACTUALLY ABOUT ----------------------------------------------------------
{
    const x = iterationIndependence();
    ok("!! XPBD's stiffness is INDEPENDENT of iteration count",
        x.spread === 0 && x.worstErrFrac < 1e-4,
        `spread ${x.spread.toExponential(2)} across 1, 2, 4, 8 and 16 iterations, worst departure from Hooke ` +
        `${x.worstErrFrac.toExponential(2)}. Not merely close -- the stretch is the SAME NUMBER at every count, ` +
        "which is the property compliance was introduced to provide");

    const p = iterationIndependence([1, 2, 4, 8, 16], { plantPBD: true });
    ok("!! and dropping the -aTilde*lambda term destroys it, exactly as the header warns",
        p.halvesWithIterations === true && p.spread > 0.5,
        `PBD spread ${p.spread.toExponential(2)} against XPBD's ${x.spread.toExponential(2)}. The stretch HALVES ` +
        "with each doubling of iterations, so effective stiffness is a function of how many times the constraint " +
        "was solved -- the defect compliance exists to remove");

    ok("!! the two agree at ONE iteration, which is the check that the planting is honest",
        Math.abs(x.stretches[0] - p.stretches[0]) / x.stretches[0] < 1e-6,
        "lambda accumulates across iterations within a substep, so at one iteration -aTilde*lambda multiplies " +
        "zero and the two solvers ARE the same algorithm. A planting that differed here would be changing " +
        "something other than the term it claims to");
}

// ---- 3. THE FIRST PLANTING LOOKED LIKE A PASS, WHICH IS THE WORST KIND OF WRONG -----------------------------------------
{
    const sub = stiffnessIndependence();
    const subP = stiffnessIndependence([400, 800, 1600, 3200], { plantPBD: true });
    ok("!! a SUBSTEP sweep cannot separate XPBD from PBD, and says so",
        Math.abs(sub.spread - subP.spread) / sub.spread < 0.2,
        `XPBD spread ${sub.spread.toExponential(2)}, PBD ${subP.spread.toExponential(2)} -- indistinguishable. ` +
        "This was the first experiment and it would have been read as 'the planting is undetected', when the " +
        "truth is that the axis carries no information about the claim");

    ok("...and an earlier attempt planted RIGIDITY by mistake, which made the claim look PERFECT",
        hangingLink({ compliance: 0 }).stretch < 1e-9,
        "setting compliance to 0 gives a rigid constraint and a stretch of exactly zero at every count -- " +
        "flawless apparent substep-independence. A planted error that makes the claim look BETTER is worse than " +
        "none at all, because it reads as a pass");
}

// ---- 4. WHAT VARIES AND IS SUPPOSED TO -------------------------------------------------------------------------------
{
    const s = stiffnessIndependence();
    ok("!! the oscillation amplitude grows as dt shrinks, and that is not stiffness drift",
        s.amplitudeGrows === true,
        `amplitude runs ${s.rows[0].amplitude.toExponential(2)} to ${s.rows[s.rows.length - 1].amplitude.toExponential(2)} ` +
        "across the substep sweep. Position-based projection supplies numerical damping proportional to dt, so a " +
        "finer step damps less. Reporting it alongside the mean stops the integrator's dissipation being " +
        "mistaken for a defect in the stiffness");
}

console.log();
if (fails) { console.log("compliance-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("compliance-selfcheck: all checks pass");
