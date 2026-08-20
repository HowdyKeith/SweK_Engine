// physics/xpbd/frictionKey-selfcheck.mjs
//
// v3461 -- COULOMB'S THRESHOLD AS AN ANSWER KEY. Fourth of fifteen ungraded modules under physics/xpbd.
//
// The exact key is the oldest result in the subject: a body on a slope stays put while tan(theta) <= mu and
// slides above it. The critical angle is atan(mu) EXACTLY -- independent of mass, gravity, timestep and
// iteration count, which is what makes it a key rather than a calibration.
//
//     mu     measured critical   atan(mu) exact
//     0.2    11.40281            11.30993
//     0.5    26.65797            26.56505
//     0.8    38.75277            38.65981
//     1.0    45.09300            45.00000
//
// *** THE ERROR IS A CONSTANT 0.093 DEGREES AT EVERY mu, NOT A PROPORTIONAL ONE, AND THAT IS THE WHOLE FINDING.
// *** A solver bias would scale with mu or with the angle. A constant offset points at the MEASUREMENT instead,
// and lengthening the run collapses it at SECOND order: 0.09292 -> 0.02298 -> 0.00573, ratios 4.04 and 4.01.
//
// So the solver's threshold CONVERGES ON atan(mu) and the residual is the detector's dead time -- a particle
// just past critical needs time to travel far enough to be called sliding. Reporting "matches to 2e-3" would
// have been true and would have hidden that the agreement is exact in the limit.

import { slidesAt, criticalAngle, coulombExact, thresholdSweep, offsetConvergence } from "./frictionKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE MEASUREMENT IS REAL BEFORE ANY VERDICT IS DRAWN FROM IT -----------------------------------------------
{
    ok("the travel measurements are finite",
        [10, 26, 40].every((d) => slidesAt(d, 0.5).finite),
        "asserted first: a NaN series produced a confident conservation verdict two rounds ago, and a NaN travel " +
        "would read as 'did not slide' here -- a stationary verdict from nothing");
}

// ---- 2. THE THRESHOLD IS SHARP AND SITS WHERE COULOMB SAYS ------------------------------------------------------------
{
    ok("!! a particle rests below atan(mu) and slides above it",
        slidesAt(26, 0.5).slides === false && slidesAt(27, 0.5).slides === true,
        `atan(0.5) = ${coulombExact(0.5).toFixed(4)} degrees, and the transition brackets it: travel ` +
        `${slidesAt(26, 0.5).travel.toFixed(6)} at 26 degrees against ${slidesAt(27, 0.5).travel.toFixed(6)} at 27. ` +
        "A sharp boundary, not a gradual onset");

    const s = thresholdSweep();
    ok("!! and the threshold tracks mu across the range",
        s.worstErrFrac < 5e-3,
        s.rows.map((r) => `mu=${r.mu}: ${r.measured.toFixed(3)} vs ${r.exact.toFixed(3)}`).join("  ") +
        `. Worst relative error ${s.worstErrFrac.toExponential(2)}. One angle matching could be a coincidence of ` +
        "calibration; four tracking atan cannot");
}

// ---- 3. THE RESIDUAL IS THE DETECTOR, AND THE SHAPE OF IT PROVES IT ----------------------------------------------------
{
    const s = thresholdSweep();
    ok("!! the offset is CONSTANT across mu, which is the signature of a measurement artefact",
        s.offsetIsConstant === true,
        `offsets ${s.offsets.map((o) => o.toFixed(5)).join(", ")} degrees -- the same number at every mu. A solver ` +
        "bias would scale with mu or with the angle. A constant offset can only come from something that does " +
        "not know about mu, which is the travel detector's dead time");

    const c = offsetConvergence();
    ok("!! and it falls at SECOND order as the run lengthens",
        c.converges === true && c.secondOrder === true,
        `${c.offsets.map((o) => o.toFixed(5)).join(" -> ")} degrees over 300, 600 and 1200 steps, ratios ` +
        `${c.ratios.map((r) => r.toFixed(2)).join(" and ")}. The threshold converges ON atan(mu) rather than ` +
        "sitting near it -- which is a stronger statement than any tolerance, and one that a single-run " +
        "comparison could not have made");
}

// ---- 4. WHAT THE KEY DOES NOT DEPEND ON -------------------------------------------------------------------------------
{
    const a = criticalAngle(0.5, { gravity: -10 });
    const b = criticalAngle(0.5, { gravity: -3 });
    ok("!! the critical angle is independent of gravity, as Coulomb requires",
        Math.abs(a - b) / a < 5e-3,
        `${a.toFixed(4)} at g = 10 and ${b.toFixed(4)} at g = 3. Both the driving force and the normal force ` +
        "scale with g, so the ratio that decides sliding does not. A threshold that moved with gravity would be " +
        "measuring something other than friction");
}

console.log();
if (fails) { console.log("frictionKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("frictionKey-selfcheck: all checks pass");
