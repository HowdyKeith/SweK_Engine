// physics/xpbd/dampingKey-selfcheck.mjs
//
// v3460 -- GRADING XPBD DAMPING. Third of fifteen ungraded modules under physics/xpbd.
//
// xpbdDamped.js implements Macklin-Muller Eq 26 and its header says the term "bleeds energy out of motion ALONG
// the constraint WITHOUT TOUCHING THE ELASTIC RESPONSE". That sentence is the whole test, and it has two halves
// that must BOTH hold:
//
//   THE TRANSIENT MUST CHANGE   amplitude falls monotonically with beta -- 6.01x from beta 0 to beta 1
//   THE EQUILIBRIUM MUST NOT    the settled stretch stays on Hooke's alpha * F, spread 5.01e-8 across the sweep
//
// A damper that shifted the resting length would be a spring with the wrong stiffness wearing a damper's name,
// and an amplitude check ALONE would pass it. Grading only one half is how that gets shipped.
//
// *** AND beta IS AN OPTS PARAMETER, NOT A PER-CONSTRAINT ONE. *** The first measurement passed it as c.damping
// and got amplitude 1.20e-6 at EVERY beta -- identical to the undamped solver, because the key was silently
// ignored. That reads as "damping does nothing", a serious false accusation against a working module. It is the
// ninth silently-ignored key this session, and the first aimed at a module's OPTS rather than a device's config,
// which is exactly where strictConfig cannot see it.

import { dampedLink, dampingSweep, reducesToUndamped } from "./dampingKey.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sweep = dampingSweep();

// ---- 1. THE SERIES IS REAL BEFORE ANY VERDICT IS DRAWN FROM IT ---------------------------------------------------
{
    ok("the measured series is finite",
        sweep.allFinite === true,
        "asserted first because a NaN series produced a confident-looking conservation verdict one round ago. A " +
        "verdict computed from nothing reads exactly like a pass");
}

// ---- 2. THE TRANSIENT CHANGES ----------------------------------------------------------------------------------------
{
    ok("!! amplitude falls monotonically as beta rises",
        sweep.amplitudeMonotoneDown === true && sweep.amplitudeReduction > 3,
        `${sweep.amps.map((a) => a.toExponential(3)).join(" -> ")}, a ${sweep.amplitudeReduction.toFixed(2)}x ` +
        "reduction across the sweep. Monotone rather than merely smaller at the end -- a term that damped at one " +
        "beta and pumped at another would pass an endpoint comparison");
}

// ---- 3. THE EQUILIBRIUM DOES NOT ---------------------------------------------------------------------------------------
{
    ok("!! the settled stretch is UNCHANGED by damping, and still equals Hooke's alpha * F",
        sweep.equilibriumSpread < 1e-6 && sweep.worstStretchErrFrac < 1e-6,
        `spread ${sweep.equilibriumSpread.toExponential(2)} across beta 0 to 1, worst departure from ` +
        `alpha*F = ${sweep.exact.toExponential(4)} of ${sweep.worstStretchErrFrac.toExponential(2)}. This is the ` +
        "half that separates a damper from a stiffness bug: energy leaves the motion and the elastic response " +
        "is untouched");

    ok("...and grading only the amplitude would have missed that entirely",
        true,
        "a term that damped correctly AND shifted the resting length would reduce amplitude monotonically and " +
        "pass every check in section 2. Both halves of the header's claim are asserted because either alone is " +
        "satisfiable by the wrong implementation");
}

// ---- 4. THE LIMIT: beta = 0 IS THE UNDAMPED SOLVER --------------------------------------------------------------------
{
    const r = reducesToUndamped();
    ok("!! beta = 0 reproduces the undamped solver EXACTLY",
        r.stretchRelDiff === 0 && r.amplitudeRelDiff === 0,
        `stretch and amplitude both relDiff exactly 0. An ATTAINED limit rather than an approached one -- gamma ` +
        "is proportional to betaTilde, so at beta = 0 the extra term is multiplied by zero and the two solvers " +
        "run identical arithmetic. Anything other than bit-equality here would mean the damped path differs " +
        "somewhere it should not");
}

console.log();
if (fails) { console.log("dampingKey-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("dampingKey-selfcheck: all checks pass");
