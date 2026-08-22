// tools/roundhouse/lensRegistration.mjs
//
// v3082 -- THE PRE-REGISTRATION, WRITTEN AND FROZEN BEFORE THE BATTERY WAS RUN.
//
// This file exists as a separate module for one reason: criterion 1 is the only one of the four that cannot be
// measured, only POSSESSED. A claim written after the numbers are in is not a prediction, it is a description,
// and nothing in the output can tell the two apart afterwards. So this is written first, imported by both the
// runner and the gate, and never edited to match a result.
//
// WHAT IS ALREADY KNOWN, DISCLOSED RATHER THAN PREDICTED. v3081 measured criterion 2 (joint M/b scaling, spread
// 2.13e-14, not bit-identical) and criterion 3 (dphi CONVERGING, final relative step 4.00e-11) for this exact
// quantity. Presenting either as a prediction here would be retrofitting, which is the move the four criteria
// exist to prevent -- the same disclosure v2906 made about its exploratory ising spread. They are EXPECTED to
// pass and that expectation is worth nothing.
//
// THE UNTESTED CRITERION IS 4, AND IT HAS NEVER BEEN ASKED OF THIS DEVICE.
//
// THE PREDICTION, AND WHY. libmSensitivity perturbs 22 Math functions by one ulp: sin, cos, tan, asin, acos,
// atan, atan2, exp, log, log2, log10, log1p, expm1, pow, hypot, cbrt and the six hyperbolics. Math.sqrt is
// deliberately NOT among them, because sqrt is correctly rounded by IEEE-754 and is not implementation-defined.
//
// Read the deflect path and NONE of the perturbed functions appear in it:
//   tracePhoton   accel(u) = 3*M*u*u - u, an RK4 step, and a linear zero-crossing interpolation. Arithmetic only.
//   deflection    tracePhoton, then phiCross - Math.PI. A constant, not a call.
//   weakDeflection 4*M/b. Arithmetic.
//   criticalImpact 3*Math.sqrt(3)*M. sqrt, which is exact and unperturbed.
//
// So the claim is that deflectionMeasured is BIT-IDENTICAL under the one-ulp shift -- relMove exactly 0, not
// merely small.
//
// AND THE CLAIM IS TWO-SIDED, BECAUSE BIT-IDENTICAL IS THE ANSWER A DEAD TEST ALSO GIVES. corroborateFully-
// selfcheck already carries the cautionary case: optics rayleighFactor is bit-identical under the same shift and
// that is a FAILURE, not a pass, because the quantity is quantised and would have been unmoved by anything. A
// third possibility is worse still -- the perturbation never armed, or never reached this device, in which case
// every observable is bit-identical and the criterion is measuring nothing at all.
//
// The positive control settles it IN THE SAME PROCESS: lens.shadow computes shadowAngle via Math.asin and
// Math.acos, both perturbed. If deflect is unmoved AND shadow moves, the perturbation was armed, reached this
// device, and the deflect path genuinely does not depend on an implementation-defined function. If BOTH are
// unmoved, the instrument is dead and the deflect result is vacuous -- and that outcome must be reported as a
// failure of the test rather than as a pass for the physics.
//
// THE FAILURE MODE WORTH NAMING IN ADVANCE: if deflectionMeasured DOES move, my reading of the code path is
// wrong -- there is a perturbed call somewhere I did not find -- and that is the more interesting result of the
// two. It would mean the corroboration census's "lens.deflect makes zero unspecified libm calls" is wrong, and
// that finding outranks the standing.

import { preRegister } from "./corroborate.mjs";

export const LENS_DEFLECT_REGISTRATION = preRegister({
    quantity: "lens.deflect deflectionMeasured under a one-ulp libm shift",
    claim: {
        observable: "relMove",
        max: 0,                       // bit-identical: exactly zero, not merely small
        positiveControl: {
            quantity: "lens.shadow shadowAngleRad under the same shift",
            observable: "relMove",
            min: Number.MIN_VALUE,    // must move by SOMETHING, in the same process
        },
    },
    rationale:
        "The deflect path calls no function libmSensitivity perturbs. tracePhoton is arithmetic and an RK4 " +
        "step; deflection subtracts Math.PI, a constant; weakDeflection is 4M/b; criticalImpact uses Math.sqrt, " +
        "which is IEEE-exact and deliberately excluded from the perturbation set. So deflectionMeasured should " +
        "be bit-identical, and bit-identical for a STATED STRUCTURAL REASON rather than because the quantity is " +
        "quantised -- which is why optics rayleighFactor's bit-identical result is scored as a failure. The " +
        "positive control is load-bearing: lens.shadow reaches Math.asin and Math.acos, so if it is ALSO " +
        "unmoved the perturbation never reached this device and the primary result proves nothing. Criteria 2 " +
        "and 3 were measured at v3081 and are DISCLOSED, not predicted.",
});
