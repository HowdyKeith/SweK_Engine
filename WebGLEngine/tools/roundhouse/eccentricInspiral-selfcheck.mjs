// tools/roundhouse/eccentricInspiral-selfcheck.mjs
//
// v2975 -- STAGE THREE, AND THE BEST ANSWER KEY THIS LAB HAS FOUND.
//
// v2937 built a Newtonian binary, v2938 added circular radiation reaction graded against Peters' merger time.
// Here both a and e evolve, and the key is not either rate equation:
//
//     DIVIDING da/dt BY de/dt ELIMINATES TIME, AND THE RESULT INTEGRATES TO AN EXACT CURVE.
//
//         a(e) = c0 * e^(12/19) / (1-e^2) * [1 + (121/304)e^2]^(870/2299)
//
// The pair must stay on that curve for the whole inspiral whatever timestep or integrator is used, because the
// curve contains no time. That tests the COUPLING between the two equations -- precisely where a sign error, a
// transcribed exponent, or a mismatched (1-e^2) power would hide, every one of which would still produce a
// plausible decaying orbit that a merger-time check would wave through.
//
// This gate therefore does what the circular scene could not: it plants errors in the COEFFICIENTS and shows the
// invariant catches each one, while the orbit still looks perfectly reasonable.

import { getDevice } from "./devices.mjs";
import { dadt, dedt, gOfE, massTerm, integrateEccentric } from "../../physics/orbits/eccentricInspiral.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("eccentric");

// ---- 1. THE INVARIANT HOLDS THROUGH A FULL INSPIRAL --------------------------------------------------------------------
{
    const o = await dev.build({ mode: "invariant" });
    ok("!! (a, e) stays on the time-free Peters curve from e=0.7 down to e=0.01",
        o.worstInvariantDev < 1e-7,
        "worst departure " + o.worstInvariantDev.toExponential(2) + " at e=" + o.worstAtE.toFixed(4) + ". The curve " +
        "has no time in it, so this is independent of the timestep -- it checks that the two rate equations agree " +
        "with each other, which neither one can check alone");
}

// ---- 2. PLANTED COEFFICIENT ERRORS ARE CAUGHT -- AND WOULD NOT BE OTHERWISE -----------------------------------------------
{
    // reproduce the integration with deliberately wrong coefficients, and measure the invariant departure
    const run = (badA, badE) => {
        const Mc = massTerm(3, 1);
        const A = (a, e) => badA ? -(64 / 5) * Mc / (a ** 3) * (1 + 73 * e * e / 24 + 37 * e ** 4 / 96) * badA / Math.pow(1 - e * e, 3.5)
                                 : dadt(a, e, Mc);
        const E = (a, e) => badE ? -(304 / 15) * e * Mc / (a ** 4) * (1 + 121 * e * e / 304) * badE / Math.pow(1 - e * e, 2.5)
                                 : dedt(a, e, Mc);
        let a = 10, e = 0.7; const c0 = a / gOfE(e); let worst = 0, fell = true;
        for (let i = 0; i < 200000 && e > 0.05 && a > 0; i++) {
            const dt = 1e-4 * a / Math.abs(A(a, e));
            const am = a + 0.5 * dt * A(a, e), em = e + 0.5 * dt * E(a, e);
            if (!(am > 0) || !(em > 0)) break;
            const eBefore = e;
            a += dt * A(am, em); e += dt * E(am, em);
            if (e > eBefore) fell = false;
            if (a > 0 && e > 0 && e < 1) worst = Math.max(worst, Math.abs(a / gOfE(e) - c0) / c0);
        }
        return { worst, fell, e, a };
    };

    const clean = run(0, 0);
    const wrongA = run(1.10, 0);          // da/dt 10% too fast
    const wrongE = run(0, 1.10);          // de/dt 10% too fast

    ok("!! a 10% error in da/dt ALONE is caught by the invariant",
        wrongA.worst > 0.01 && clean.worst < 1e-7,
        "clean " + clean.worst.toExponential(2) + " vs perturbed " + wrongA.worst.toExponential(2) + ". The orbit " +
        "still decays and still circularises -- it looks entirely reasonable. Only the a-versus-e relationship " +
        "reveals it");

    ok("!! a 10% error in de/dt alone is caught too",
        wrongE.worst > 0.01,
        "departure " + wrongE.worst.toExponential(2) + ". Either equation being wrong breaks the pairing, which " +
        "is why coupling is the thing worth grading");

    ok("...and the perturbed runs still produce a plausible-looking inspiral",
        wrongA.a > 0 && wrongA.e < 0.7 && wrongE.a > 0 && wrongE.e < 0.7,
        "both still shrink and still circularise. A merger-time check would pass them; this is the case the " +
        "invariant exists for");
}

// ---- 3. CIRCULARISATION IS A REAL PREDICTION, NOT AN ARTEFACT ---------------------------------------------------------------
{
    const o = await dev.build({ mode: "circularise" });
    ok("!! eccentricity falls monotonically and never rises",
        o.circularised === true && o.eccentricityEverRose === false,
        "e goes " + o.e0 + " -> " + o.eFinal.toFixed(4) + " without a single increase. de/dt carries an explicit " +
        "factor of e and is negative across (0,1), so e=0 is an attractor -- which is why binaries seen near " +
        "merger are nearly circular");

    // and the sign is structural, not incidental to these masses
    const Mc = massTerm(5, 2);
    ok("de/dt is negative for every eccentricity, at other masses too",
        [0.05, 0.3, 0.6, 0.9].every((e) => dedt(8, e, Mc) < 0),
        "checked at e = 0.05, 0.3, 0.6, 0.9 with m1=5, m2=2 -- circularisation is a property of the equation, not " +
        "of one configuration");
}

// ---- 4. THE CROSS-CHECK BACK TO STAGE TWO ----------------------------------------------------------------------------------
{
    const o = await dev.build({ mode: "limit" });
    ok("!! at e=0 the eccentric rate reduces EXACTLY to the circular Peters rate v2938 grades",
        o.circularLimitErrFrac === 0,
        "error " + o.circularLimitErrFrac + " -- bit-identical, not merely close. The eccentricity factors " +
        "(1 + 73e^2/24 + 37e^4/96)/(1-e^2)^(7/2) both go to 1 at e=0, so the two scenes must agree there. If they " +
        "did not, one of stage two or stage three would be wrong and this would say so");
}

// ---- 5. THE INVARIANT IS INDEPENDENT OF THE TIMESTEP -------------------------------------------------------------------------
{
    const coarse = integrateEccentric({ safety: 1e-3 });
    const fine = integrateEccentric({ safety: 1e-5 });
    ok("!! a 100x change in step size leaves the invariant satisfied",
        coarse.worstInvariantDev < 1e-5 && fine.worstInvariantDev < 1e-9,
        "coarse " + coarse.worstInvariantDev.toExponential(2) + ", fine " + fine.worstInvariantDev.toExponential(2) +
        " -- both tiny, and the finer one better. The curve has no time in it, so a correct integration lands on " +
        "it at any resolution; only the residual discretisation error changes");
}

console.log();
if (fails) { console.log("eccentricInspiral-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("eccentricInspiral-selfcheck: all checks pass");
