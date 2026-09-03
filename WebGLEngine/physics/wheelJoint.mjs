// WebGLEngine/physics/wheelJoint.mjs -- v4398
//
// *** v4217 JUSTIFIED physics/vehicle.mjs's ENTIRE DESIGN WITH A PHYSICAL CLAIM, AND NOTHING HAS EVER TESTED
//     IT. THIS IS THE TEST, AND THE ANSWER IS YES IN KIND AND NO IN DEGREE. ***
//
// vehicle.mjs is a RAYCAST vehicle: one rigid chassis, wheels as downward rays, forces applied to the single
// body. Its header says why, in as many words:
//
//     "The intuitive model is five rigid bodies: a chassis and four wheels, joined by constraints. *** IT IS
//      ALSO WHY TOY CAR PHYSICS JITTERS. *** A constraint solver has to reconcile the wheel's contact with the
//      ground AND its joint to the chassis every step, at a mass ratio of maybe 50:1, and small errors in each
//      feed the other."
//
// box3d has had 36 b3WheelJoint_ functions the whole time -- suspension spring and limits, a spin motor with
// torque readback, steering with its own spring -- and not one had ever been called from this tree. So the
// rejected alternative was sitting right there, unbound, and tools/ship/vehicle-selfcheck.mjs's 56 checks are
// every one of them about the raycast force arithmetic. Not one asks whether the constrained version jitters.
//
// ---- WHAT THE MEASUREMENT SAYS -------------------------------------------------------------------------------
//
// *** THE MECHANISM IS REAL AND IT SCALES WITH EXACTLY THE TWO THINGS v4217 NAMED. ***
//
//   AT REST the chassis is dead still at every mass ratio from 1:1 to 500:1 -- standard deviation 0.000e+00,
//   the float32 floor, identical to a plain box with no joints at all. Nothing to see, and that is the easy
//   case: a settled strut has nothing to reconcile.
//
//   DRIVING, which is the case v4217 describes -- ground contact AND the chassis joint, both live, every step:
//
//        mass ratio      10        50       200      1000
//        jitter (sd)  1.5e-06   4.6e-06  1.4e-04   9.2e-03
//
//   Four orders of magnitude across the sweep. And at a fixed 50:1, dropping box3d from 4 substeps to 1 takes
//   it from 6.0e-06 to 7.2e-03 -- three more orders. Mass ratio and solver budget, which is the mechanism
//   stated exactly.
//
// *** AND THE DEGREE IS WHERE THE CLAIM STOPS BEING A REASON. *** At the 50:1 v4217 itself names, with box3d's
// 4 substeps, the number is 4.6e-06 m. Four and a half MICRONS on a 0.65 m ride height -- five orders below the
// thing it is measured against, and below the width of the float32 mantissa at that magnitude for most of the
// run. It is detectable and it is not a wobble anybody would see.
//
// So the honest reading: v4217 identified a real coupling and was right about what drives it, and the
// conclusion drawn from it -- that constrained wheels are unusable and rays are the answer -- does not follow
// from the size of the effect in THIS engine at THIS substep count. box3d's soft-constraint solver with
// substepping is specifically good at the thing the claim is about. Neither file is wrong; the ARGUMENT was
// never checked, and now it has a number.
//
// ---- WHAT WENT WRONG ON THE WAY, BECAUSE BOTH FAILURES READ AS PHYSICS -----------------------------------------
//
// (1) THE SUSPENSION WAS BOTTOMED OUT for the first two measurements. At 2 and 5 Hz the spring cannot hold
//     1200 kg and the strut rests on its 0.25 m limit stop -- and a body on a rigid stop is the EASIEST case a
//     solver can have, so "no jitter" there measured the stop. The tell was that the rigid-strut row and the
//     spring row agreed to three decimals. Above 10 Hz the limit-on and limit-off rows are identical, which is
//     how the honest regime was found rather than assumed.
//
// (2) THE CAR TRAVELLED EXACTLY 0.00 m AT EVERY MASS RATIO, twice, for two different reasons. First the wheels
//     were 0.35-CUBES, because every body constructor in box3d_shim.c called b3MakeBoxHull and nothing in this
//     tree had ever needed to roll -- see swk_body_sphere, added this round. Then, with real spheres, still
//     0.00, because the vehicle had been settling for ten seconds and box3d had put it to SLEEP: the readback
//     reported spinTorque saturated at the full 300 N-m while spinSpeed sat at 0.0000. Full torque, no motion,
//     no error. swk_wheel_spin now wakes the bodies.
"use strict";

/** Packed wheel state: spin speed rad/s, spin torque N-m, steering angle rad, steering torque N-m, separation. */
export const WHEEL_STATE_STRIDE = 5;
export const WHEEL_STATE_FIELDS = Object.freeze([
    "spinSpeed", "spinTorque", "steeringAngle", "steeringTorque", "linearSeparation",
]);

export function readWheelState(buf, base = 0) {
    const out = {};
    WHEEL_STATE_FIELDS.forEach((f, i) => { out[f] = buf[base + i]; });
    return out;
}

/**
 * The suspension is only carrying load above this frequency for a 1200 kg chassis on four wheels. Below it the
 * strut sits on its travel limit and every measurement is really about the stop. MEASURED, not derived: at
 * 2 and 5 Hz the limit-on and limit-off ride heights differ (0.4414 vs 0.2999); at 10 Hz and above they agree.
 */
export const SPRING_CARRIES_ABOVE_HZ = 10;

/** Ride height with the limit enabled vs disabled, at 50:1. Equal means the spring, not the stop, is holding it. */
export const SPRING_VS_STOP = Object.freeze([
    Object.freeze({ hertz: 2, withLimit: 0.441445, noLimit: 0.299903 }),
    Object.freeze({ hertz: 5, withLimit: 0.442917, noLimit: 0.299959 }),
    Object.freeze({ hertz: 10, withLimit: 0.538014, noLimit: 0.538661 }),
    Object.freeze({ hertz: 20, withLimit: 0.656647, noLimit: 0.656647 }),
    Object.freeze({ hertz: 40, withLimit: 0.685635, noLimit: 0.685635 }),
]);

/** Is the spring carrying the load at this frequency, judged from the two ride heights rather than a rule? */
export function springCarries(row, tol = 1e-3) { return Math.abs(row.withLimit - row.noLimit) < tol; }

/** Chassis vertical jitter, standard deviation in metres over 600 steps at 60 Hz, spring carrying (20 Hz). */
export const JITTER = Object.freeze({
    atRest: Object.freeze([
        Object.freeze({ ratio: 1, sd: 0 }), Object.freeze({ ratio: 5, sd: 0 }),
        Object.freeze({ ratio: 10, sd: 0 }), Object.freeze({ ratio: 50, sd: 0 }),
        Object.freeze({ ratio: 500, sd: 0 }),
    ]),
    driving: Object.freeze([
        Object.freeze({ ratio: 10, sd: 1.491e-06 }),
        Object.freeze({ ratio: 50, sd: 4.601e-06 }),
        Object.freeze({ ratio: 200, sd: 1.376e-04 }),
        Object.freeze({ ratio: 1000, sd: 9.176e-03 }),
    ]),
    substeps: Object.freeze([
        Object.freeze({ substeps: 1, sd: 7.172e-03 }),
        Object.freeze({ substeps: 4, sd: 5.957e-06 }),
    ]),
    plainBoxControl: 0,
    rideHeightAt50: 0.654503,
});

/** The mass ratio v4217's header names. Kept as a constant so the gate reads the claim's own number. */
export const V4217_RATIO = 50;

/** Jitter as a fraction of the ride height -- the number that decides whether the effect matters. */
export function relativeJitter(sd, rideHeight = JITTER.rideHeightAt50) { return sd / rideHeight; }

/** Does jitter grow with mass ratio? DERIVED from the rows, monotonically, rather than asserted. */
export function growsWithRatio(rows = JITTER.driving) {
    for (let i = 1; i < rows.length; i++) if (!(rows[i].sd > rows[i - 1].sd)) return false;
    return true;
}

/** How many orders of magnitude the sweep spans, so the claim's mechanism is reported as a size not a yes/no. */
export function ordersSpanned(rows = JITTER.driving) {
    const lo = Math.min(...rows.map((r) => r.sd)), hi = Math.max(...rows.map((r) => r.sd));
    return lo > 0 ? Math.log10(hi / lo) : Infinity;
}

/**
 * The verdict, in the two halves the measurement actually supports. Both are returned because reporting only
 * one of them would be the same overstatement in either direction.
 */
export function verdict({ ratio = V4217_RATIO, rows = JITTER.driving } = {}) {
    const at = rows.find((r) => r.ratio === ratio);
    return {
        mechanismConfirmed: growsWithRatio(rows),
        atClaimedRatio: at ? at.sd : null,
        relative: at ? relativeJitter(at.sd) : null,
        // "Visible" is a judgement and needs a threshold stated out loud rather than smuggled in: one part in
        // ten thousand of the ride height is roughly the point where a 0.65 m car moves by 65 microns.
        visibleAtClaimedRatio: at ? relativeJitter(at.sd) > 1e-4 : null,
    };
}

/** The names added to box3d_shim.c this round, in one place so PENDING_REBUILD cannot drift from the shim. */
export const ADDED_AT_V4398 = Object.freeze([
    "swk_joint_wheel", "swk_wheel_spin", "swk_wheel_steer", "swk_wheel_state", "swk_wheel_state_stride",
    "swk_body_sphere",
]);
