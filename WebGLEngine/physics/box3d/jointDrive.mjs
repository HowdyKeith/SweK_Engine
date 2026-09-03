// WebGLEngine/physics/box3d/jointDrive.mjs -- v4385
//
// *** THE JOINT LIMIT HAS BEEN WRITE-ONLY SINCE v2515, AND THE TREE'S OWN GATE SAYS SO IN ITS FOOTER. ***
//
// physics/ragdollFromSkeleton.mjs (v4245) reads a bone name and DERIVES a limit: an elbow bends [0, 145]
// degrees, a knee [-145, 0], a shoulder inside a 90-degree cone, a hip inside 60. Those numbers are handed
// to box3d_shim.c's swk_joint_revolute and swk_joint_spherical at creation, and then nothing -- not one of
// the seven swk_joint_* entry points that existed before v4385 -- could ask what angle a joint was at.
// tools/ship/ragdollStep-selfcheck.mjs states the consequence about itself: "a rig that settles
// symmetrically can still have its knees bending the wrong way -- the limits are checked as VALUES by v4245
// and never as BEHAVIOUR".
//
// A value written and never read is not a setting, it is a hope. This file is the reading half.
//
// ---- WHAT MAKES THIS GRADEABLE RATHER THAN "THE RAGDOLL LOOKS BETTER" ------------------------------------------
//
// A motor holding a limb level against gravity is doing a statics problem with a closed form, and box3d
// solves it to float:
//
//     holdTorque = m * g * d * cos(theta)
//
// -- mass times gravity times the lever arm to the centre of mass, times the cosine of how far the limb has
// sagged. MEASURED natively against box3d v0.1.0 over five independent (mass, gravity, lever) triples:
// predicted 800.0001 / 784.8001 / 200.0000 / 1800.0002 / 1600.0001, measured 800.0000 / 784.8000 / 200.0000 /
// 1800.0001 / 1600.0000, worst relative error 7.8e-08, which is float32 and nothing else.
//
// *** AND THE CLOSED FORM IS ALSO THE THRESHOLD, WHICH IS THE PART THAT MAKES maxTorque MEAN SOMETHING. ***
// The same arm needs 800 N m to hold level. Give the motor a cap of 750 and it sags to 34.75 degrees; give it
// 800 and it holds within half a degree; give it 850 and it holds within 0.007. The number that separates
// "a limb that resists" from "a limb that hangs" is not a feel, it is m*g*d, and it can be computed before
// the simulation runs. A motor with an unbounded cap is not a muscle, it is a weld with extra steps.
//
// AND WHERE IT SETTLES OBEYS THE SAME FORM. With a cap of 700 the arm stops at 49.76 degrees and the motor
// then reports 516.80 -- which is 800 * cos(49.7583 deg) = 516.79, not the cap. Once the limb has stopped the
// motor only has to carry the instantaneous gravity torque, and that is smaller than the cap it slipped past
// on the way down. The gate checks the cosine form across the whole family rather than the level case alone,
// because the level case is the one where cos = 1 and a missing cosine would be invisible.
//
// ---- AND THE MEASUREMENT HAD TO BE THE EXTREME, NOT THE FINAL VALUE ---------------------------------------------
//
// *** THE FIRST PROBE READ THE ANGLE AFTER FIVE SECONDS AND NEARLY SHIPPED A COINCIDENCE. *** A free hinge
// read -30.331 degrees; the same hinge limited to [-30, 0] read -30.010. Two numbers a fifth of a degree
// apart, and the obvious reading -- "the limit made no difference" -- was wrong in both directions: the free
// hinge was still SWINGING and -30.331 was a snapshot of a pendulum passing through. Run to rest and the free
// hinge reaches -176.560 degrees while the limited one stops at -30.017.
//
// A limit does not say where a joint ENDS UP. It says where it never goes. So the observable is the extreme
// over the trajectory, and every check below reads a running minimum or maximum rather than a final state.
"use strict";

/** The row layouts the shim publishes. Named here, counted against the shim's own strides by the gate. */
export const STATE_FIELDS = Object.freeze(["kind", "angle", "twist", "motorTorque"]);
export const LIMIT_FIELDS = Object.freeze(["limitEnabled", "lower", "upper", "motorEnabled"]);

/**
 * *** THESE ARE THE SHIM'S NUMBERS, NOT box3d's b3JointType. ***
 * Upstream owns its own enum and may renumber it; this is a contract between box3d_shim.c and this file, and
 * the gate asserts the two agree rather than assuming a shared header keeps them in step.
 */
// v4398 -- WHEEL APPENDED AT 4. These numbers are a wire format between this file and box3d_shim.c's
// SWK_JOINT_* defines, so a new kind goes on the END: renumbering to keep any kind of order would
// reinterpret every joint index a caller already holds.
export const KIND = Object.freeze({ UNKNOWN: 0, REVOLUTE: 1, SPHERICAL: 2, WELD: 3, WHEEL: 4 });
export const KIND_NAME = Object.freeze(["unknown", "revolute", "spherical", "weld", "wheel"]);

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

/** Read one packed row by name. Refuses a stride narrower than the fields it is about to read. */
export function readRow(row, stride, fields, base = 0) {
    if (stride < fields.length) {
        throw new Error(`jointDrive: stride ${stride} cannot hold ${fields.length} fields -- ` +
                        "the shim and this file disagree about the row, and guessing would mis-name every value");
    }
    const out = {};
    for (let i = 0; i < fields.length; i++) out[fields[i]] = row[base + i];
    return out;
}

export const readState = (row, stride, base = 0) => readRow(row, stride, STATE_FIELDS, base);
export const readLimits = (row, stride, base = 0) => readRow(row, stride, LIMIT_FIELDS, base);

/**
 * Mass of a box as box3d computes it: the FULL extents times the density, and the shim takes HALF-extents.
 *
 * *** THE FACTOR OF EIGHT IS THE WHOLE FUNCTION AND IS EXACTLY THE KIND OF THING A GATE SHOULD NOT TYPE. ***
 * swk_body_box(type, x, y, z, hx, hy, hz, density) takes half-extents, so the volume is (2hx)(2hy)(2hz) and
 * not hx*hy*hz. Get it wrong and the predicted holding torque is out by 8x -- which would have been read as
 * "box3d's motors are weak" rather than as an arithmetic error, because it is off by a plausible-looking
 * constant rather than by a sign.
 */
export const boxMass = (hx, hy, hz, density) => 8 * hx * hy * hz * density;

/**
 * The statics: torque a motor must supply to hold a limb of mass `m` whose centre of mass is `d` from the
 * hinge, under gravity `g`, sagged `theta` radians from level.
 *
 * Level is theta = 0 and costs the most; a limb hanging straight down costs nothing, which is why a ragdoll
 * at rest needs no muscle and a ragdoll held out at arm's length needs all of it.
 */
export const holdTorque = (m, g, d, theta = 0) => m * g * d * Math.cos(theta);

/**
 * The cap below which a motor cannot hold a limb level -- the same closed form, read as a threshold.
 * Returns { needed, holds }, so a caller states the comparison rather than re-deriving it.
 */
export function canHold(cap, m, g, d) {
    const needed = holdTorque(m, g, d, 0);
    return { needed, holds: cap >= needed };
}

/**
 * Where a motor with a given cap can hold a limb: the angle at which gravity's torque falls to the cap.
 *
 * Returns 0 when the cap already exceeds what level costs, and null when no angle works (which cannot happen
 * for a positive cap, since the cost falls to zero at vertical -- stated so the null branch is a real answer
 * rather than a silent NaN).
 */
export function sagAngle(cap, m, g, d) {
    const level = holdTorque(m, g, d, 0);
    if (!(level > 0)) return null;
    if (cap >= level) return 0;
    return Math.acos(Math.max(-1, Math.min(1, cap / level)));
}

/**
 * *** A LIMIT IS A SOFT CONSTRAINT, AND ITS EXCURSION IS BOUNDED IN MAGNITUDE AND SIGNED IN DIRECTION. ***
 *
 * Measured on box3d v0.1.0 at 120 Hz with 4 substeps, a revolute stop is missed by roughly a hundredth of a
 * degree whatever the bound is -- but NOT ALWAYS IN THE SAME DIRECTION, and that is the part the first draft
 * of this comment got wrong. [-1, 0] reached -1.012, [-30, 0] reached -30.017 and [-10, 0] reached -10.016,
 * all three PAST their stop; [-145, 0] reached -144.985, which is fifteen thousandths of a degree SHORT of it.
 *
 * The knee is not a different mechanism. At -145 degrees the arm has swung past vertical and arrives at the
 * stop almost weightless, so it never presses hard enough to push through. How far a soft constraint yields
 * depends on how hard something leans on it, and at that bound nothing much does.
 *
 * A cone stop is looser and all of it one-sided here: 15 degrees reached 15.059, 60 reached 60.025, 90 reached
 * 90.056. The tolerance is therefore ABSOLUTE and two-sided -- a percentage would be far too tight at 1 degree
 * and far too slack at 145, and a one-sided check would pass the knee for the wrong reason.
 */
export const OVERSHOOT_DEG = Object.freeze({ revolute: 0.05, cone: 0.10 });

/** Did a trajectory respect its limit? `extreme` is the running min (or max) in degrees. */
export function withinLimit(extremeDeg, boundDeg, kind = "revolute") {
    const slack = OVERSHOOT_DEG[kind] ?? OVERSHOOT_DEG.revolute;
    return Math.abs(extremeDeg) <= Math.abs(boundDeg) + slack;
}

/**
 * The shim functions this round adds, named once so box3dNode.mjs's PENDING_REBUILD and the gate read the
 * same list rather than two hand-typed copies drifting apart.
 */
export const ADDED_AT_V4385 = Object.freeze([
    "swk_joint_state_stride", "swk_joint_limits_stride",
    "swk_joint_kind", "swk_joint_state", "swk_joint_limits", "swk_joint_motor",
]);
