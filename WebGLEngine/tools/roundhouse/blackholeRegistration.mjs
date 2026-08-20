// WebGLEngine/tools/roundhouse/blackholeRegistration.mjs -- v3515
//
// *** THIS FILE IS WRITTEN AND COMMITTED **BEFORE** corroborateFully IS RUN ON blackhole. THAT ORDERING IS THE
// ONLY THING A PRE-REGISTRATION IS. *** v3514 made blackhole eligible for the four-criterion battery -- the
// first promotion since corroborationReach started counting -- and the honest window to write a seal is now,
// once, before the run. v3134 records what happens otherwise: "CHECK THE REGISTRATION BEFORE MOVING A REGISTER
// -- retrofitting is what a seal exists to prevent."
//
// WHAT IS ALREADY KNOWN AND IS THEREFORE **DISCLOSED, NOT PREDICTED** (lens's registration does the same and
// says so, which is what made it readable at v3134):
//
//   - c2, invariance under dtHalving: MEASURED at v3512 and v3514. escapeV is BIT-IDENTICAL at
//     0.537736013162 across dt = 0.02, 0.01, 0.005 with dt * escSteps held constant, and stays bit-identical
//     at escTol 1e-4, 1e-5 and 1e-6. Under v2906's rule that is reported SUSPECT rather than as a pass.
//   - c3, convergence under escTol: MEASURED at v3514. escapeV moves 0.532069109143, 0.532186557931,
//     0.532157195734, 0.532171876833 over escTol 1e-3 .. 3e-5, steps 1.17e-4, 2.94e-5, 1.47e-5 --
//     CONVERGING with two reversals, which is a bisection approaching from alternating sides.
//
// NEITHER IS OFFERED AS CRITERION-1 EVIDENCE. Both were measured before any claim was frozen.
//
// ================================================================================================
// *** WHAT FOLLOWS HAS NOT BEEN MEASURED. ***
// ================================================================================================
//
// THE CLAIM IS ABOUT CRITERION 4 -- stability under a one-ulp libm shift -- WHICH IS THE ONLY CRITERION NOBODY
// HAS ASKED OF THIS DEVICE. It is predicted to come back BIT-IDENTICAL, and the prediction is STRUCTURAL rather
// than hopeful:
//
//   escapeV is not a number the integrator returns. It is the output of a BISECTION ON A BOOLEAN -- did this
//   trajectory reach escRFar or not -- and a bisection converges to whichever side of the bracket the boolean
//   falls on. v3514 measured that HALVING THE TIMESTEP THREE TIMES does not move it by one bit, which means the
//   escape verdict for a given v0 is not close to flipping at these resolutions. A ONE-ULP PERTURBATION OF A
//   LIBM CALL IS A FAR SMALLER DISTURBANCE THAN HALVING dt. If dt cannot flip the verdict, an ulp cannot.
//
// *** THE FAILURE MODE IS NAMED IN ADVANCE, AND IT IS THE MORE INTERESTING OUTCOME. *** If escapeV DOES move
// under the libm shift, then some trajectory's escape verdict sits within one ulp of flipping -- which would
// mean the bisection is sampling a boundary rather than resolving one, and that the bit-identical c2 pass is
// luckier than it looks. That would be a finding about the DEVICE and not about the criterion.
//
// AND THE CONSEQUENCE IS PRE-DECLARED SO IT CANNOT BE CHOSEN AFTERWARDS: v3083 requires that a BIT-IDENTICAL c4
// result be accompanied by a declared CONTROL -- another mode on the same device, in the same process, that
// demonstrably DOES move -- because otherwise a quantity passes for the same reason a device that never read
// the perturbation would. The control is registered below and it is a SECOND prediction: blackhole's `orbit`
// mode returns precessionPerOrbit, which is accumulated from trigonometry over many steps, and it is predicted
// to MOVE. IF THE CONTROL DOES NOT MOVE, c4 IS UNVERIFIED RATHER THAN PASSED, and that is the correct verdict
// rather than a disappointment.
"use strict";
import { preRegister } from "./corroborate.mjs";

export const BLACKHOLE_REGISTRATION = preRegister({
    quantity: "blackhole escape/escapeV under a one-ulp libm shift",
    claim: { observable: "c4_libmStable", bitIdentical: true, controlMustMove: "orbit/precessionPerOrbit" },
    rationale:
        "escapeV is the output of a BISECTION ON A BOOLEAN -- did this trajectory reach escRFar -- rather than " +
        "a number the integrator returns. v3514 measured that halving the timestep three times does not move it " +
        "by one bit at escTol 1e-4, 1e-5 or 1e-6, so the escape verdict for a given v0 is nowhere near " +
        "flipping. A one-ulp libm perturbation is a far smaller disturbance than halving dt; if dt cannot flip " +
        "the verdict, an ulp cannot. PREDICTED BIT-IDENTICAL. *** THE FAILURE MODE IS THE MORE INTERESTING " +
        "OUTCOME AND IS NAMED IN ADVANCE: if escapeV DOES move, some trajectory's escape verdict sits within " +
        "one ulp of flipping, which would mean the bisection is sampling a boundary rather than resolving one " +
        "and that the bit-identical c2 pass is luckier than it looks -- a finding about the device, not the " +
        "criterion. *** AND THE CONTROL IS PART OF THE CLAIM, per v3083: a bit-identical c4 needs another mode " +
        "on the same device that demonstrably moves, or it passes for the same reason a device that never read " +
        "the perturbation would. orbit/precessionPerOrbit accumulates trigonometry over many steps and is " +
        "predicted to MOVE. IF THE CONTROL DOES NOT MOVE, c4 IS **UNVERIFIED** RATHER THAN PASSED. " +
        "DISCLOSED AND NOT PREDICTED: c2's bit-identical dtHalving result and c3's escTol convergence were both " +
        "measured at v3512/v3514, before this seal existed, and are offered as evidence for nothing.",
});
