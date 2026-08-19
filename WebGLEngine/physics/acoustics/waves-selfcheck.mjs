// physics/acoustics/waves-selfcheck.mjs
//
// v3385 -- ACOUSTICS AS WAVES, AND THE PROBLEM WITH GRADING A TEXTBOOK EQUATION.
//
// The wave equation is the most-solved equation in physics, which makes it easy to build a device that compares
// a simulation against itself and calls the agreement a result. Two of these four keys are therefore about the
// SCHEME rather than the physics -- which is the honest thing to grade when the physics is a one-liner.
//
//   D'ALEMBERT       f(x - ct) is an exact solution: a pulse travels unchanged forever. The reference is a
//                    FUNCTION, not another run.
//
//   *** THE MAGIC TIME STEP, AND IT INVERTS THE USUAL INTUITION *** at Courant number exactly 1 the explicit
//   FDTD scheme reproduces d'Alembert EXACTLY -- error 5.3e-21 after 100 steps. At C = 0.9 it is 1.6e-3 and at
//   C = 0.5 it is 3.6e-3. Running "safely" well inside the stability limit is FIFTEEN ORDERS OF MAGNITUDE worse
//   than running at it, because the scheme's dispersion relation collapses onto the true one at exactly one point.
//
//   CFL IS A CLIFF   after 300 steps the amplitude is 1.0 at C = 1.00 and 1.6e19 at C = 1.01. One percent past
//                    the threshold is not slightly worse, it is divergent.
//
//   DOPPLER ASYMMETRY  a moving SOURCE and a moving OBSERVER at the same speed give different shifts -- 2.000
//                      against 1.500 at v = 0.5c. Sound has a medium with a rest frame, unlike light, and an
//                      implementation using one formula for both is wrong in a way that only appears at speed.

import {
    gaussianPulse, propagationError, peakAmplitude, courant, fdtd,
    dopplerMovingSource, dopplerMovingObserver, dopplerAsymmetry,
    modeOpenOpen, modeOpenClosed, phaseVelocity, groupVelocity, omegaOf,
} from "./waves.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const shape = gaussianPulse(80, 12);

// ---- 1. THE MAGIC TIME STEP -------------------------------------------------------------------------------------
{
    const e1 = propagationError(shape, 400, 1.0, 100);
    const e09 = propagationError(shape, 400, 0.9, 100);
    const e05 = propagationError(shape, 400, 0.5, 100);
    ok("!! at Courant number exactly 1 the scheme is EXACT, not merely accurate",
        e1 < 1e-15,
        `error ${e1.toExponential(2)} after 100 steps, against the analytic travelling pulse. Not a small ` +
        "residual -- the scheme's dispersion relation coincides with the true one at C = 1, so the numerical " +
        "solution IS d'Alembert");

    ok("!! and running further inside the stability limit is WORSE, by fifteen orders",
        e09 > e1 * 1e10 && e05 > e09,
        `C = 1.0 gives ${e1.toExponential(1)}, C = 0.9 gives ${e09.toExponential(1)}, C = 0.5 gives ` +
        `${e05.toExponential(1)}. The intuition that a smaller time step is safer is exactly backwards here, and ` +
        "a device that only checked stability would never notice");
}

// ---- 2. CFL IS A CLIFF, NOT A SLOPE ---------------------------------------------------------------------------------
{
    const at = peakAmplitude(shape, 200, 1.00, 300);
    const over = peakAmplitude(shape, 200, 1.01, 300);
    ok("!! one percent past the CFL limit diverges by nineteen orders of magnitude",
        at < 10 && over > 1e10,
        `peak amplitude ${at.toExponential(2)} at C = 1.00 and ${over.toExponential(2)} at C = 1.01, from the ` +
        "same unit-amplitude pulse. The threshold is exact and the failure past it is catastrophic rather than " +
        "gradual -- which is why C is the one number to check before trusting any explicit wave run");

    // CORRECTION: this asserted === 1 at both parameter sets. The second is 343 * 1e-5 / 3.43e-3, which is
    // 0.9999999999999999 in floating point -- the decimal values are not exactly representable, so the quotient
    // misses by one ULP. Demanding bit equality of a computed ratio is the wrong bar; the first case uses
    // powers of two and IS exact, and the pair together says the definition is right without pretending float
    // division is.
    ok("...and the Courant number is what it claims to be",
        courant(2, 0.25, 0.5) === 1 && Math.abs(courant(343, 1e-5, 3.43e-3) - 1) < 1e-12,
        `c dt / dx, checked at two unrelated parameter sets. The first uses powers of two and lands on exactly 1; ` +
        `the second gives ${courant(343, 1e-5, 3.43e-3)} because 3.43e-3 is not representable in binary. A ` +
        "definition, so this catches a transposition rather than proving physics");
}

// ---- 3. THE MEDIUM BREAKS THE DOPPLER SYMMETRY -------------------------------------------------------------------------
{
    const speeds = [0.1, 0.3, 0.5];
    const asym = speeds.map((v) => dopplerAsymmetry(v, 1));
    ok("!! a moving source and a moving observer are NOT equivalent",
        asym.every((a) => a > 0) && asym[2] > 0.3,
        speeds.map((v, i) => `v=${v}c: ${(asym[i] * 100).toFixed(2)}%`).join("  ") + ". Source-moving gives " +
        `${dopplerMovingSource(1, 0.5, 1).toFixed(3)} and observer-moving ${dopplerMovingObserver(1, 0.5, 1).toFixed(3)} ` +
        "at half the sound speed. Sound has a medium with a rest frame; relativity's Doppler has none, and " +
        "borrowing that formula here would be wrong by a third");

    ok("...and the two agree only in the limit of zero speed",
        Math.abs(dopplerAsymmetry(1e-6, 1)) < 1e-11 && asym[0] > 1e-3,
        `${(dopplerAsymmetry(1e-6, 1)).toExponential(1)} at v = 1e-6 c. The asymmetry is FIRST ORDER in v/c, ` +
        "so it vanishes smoothly rather than being switched off -- which is why a low-speed test would pass a " +
        "wrong implementation");

    ok("!! and a receding source lowers the pitch, which fixes the sign",
        dopplerMovingSource(1, -0.3, 1) < 1 && dopplerMovingSource(1, 0.3, 1) > 1,
        "approaching raises and receding lowers. A magnitude-only check would accept a sign error that reverses " +
        "every siren in the engine");
}

// ---- 4. STANDING WAVES AND NON-DISPERSION -----------------------------------------------------------------------------
{
    const c = 343, L = 1;
    ok("!! an open-closed pipe sounds only ODD harmonics",
        [1, 2, 3, 4].every((n) => Math.abs(modeOpenClosed(n, c, L) / modeOpenClosed(1, c, L) - (2 * n - 1)) < 1e-12),
        `${[1, 2, 3].map((n) => modeOpenClosed(n, c, L).toFixed(2)).join(", ")} Hz -- ratios 1, 3, 5. That missing ` +
        "even series is why a clarinet sounds hollow and a flute does not, and it comes from the boundary " +
        "condition rather than from anything about the instrument");

    ok("...while an open-open pipe sounds all of them",
        [1, 2, 3, 4].every((n) => Math.abs(modeOpenOpen(n, c, L) / modeOpenOpen(1, c, L) - n) < 1e-12),
        `${[1, 2, 3].map((n) => modeOpenOpen(n, c, L).toFixed(2)).join(", ")} Hz -- ratios 1, 2, 3. Two boundary ` +
        "conditions, two harmonic series, one wave equation");

    ok("!! sound is NON-DISPERSIVE: phase and group velocity agree at every wavenumber",
        [0.1, 1, 10, 1000].every((k) => Math.abs(phaseVelocity(omegaOf(c, k), k) - groupVelocity(c)) < 1e-9),
        "omega = ck exactly, so a chord arrives as a chord. If sound were dispersive, distant thunder would " +
        "reach you sorted by pitch -- and the FDTD scheme above IS dispersive away from C = 1, which is the " +
        "difference between the physics and the discretisation of it");
}

console.log();
if (fails) { console.log("waves-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("waves-selfcheck: all checks pass");
