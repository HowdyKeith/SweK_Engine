// WebGLEngine/physics/mechanics/implicitGyro.mjs -- UNNUMBERED (the version is chosen at ship time)
// ---------------------------------------------------------------------------------------------------------------
// THE IMPLICIT GYROSCOPIC STEP, box3d's, for a physics wrapper that cannot reach inside its engine's integrator.
//
// box3d v0.1.0's solver.c (b3IntegrateVelocitiesTask) takes the gyroscopic torque implicitly: in BODY coordinates it
// solves backward Euler on Euler's equations,
//     I (w2 - w1) + h w2 x (I w2) = 0,
// for w2 by ONE Newton-Raphson step from w1, with the Jacobian
//     J = I + h (skew(w) I - skew(I w)),
// once a substep, after damping, and does not renormalise. This file is that step, term for term, in double precision.
// physics/jolt/joltLoader.js takes it before every Jolt step, in place of Jolt's own explicit force (mApplyGyroscopicForce).
//
// WHY IMPLICIT: physics/mechanics/SPINNING_BODY_WIP.md measured Jolt's explicit force growing a STABLE spin's wobble by
// sqrt(1 + (Omega h)^2) a step until, at 10 rad/s and above, the spin was lost within the half-minute. Backward Euler shrinks
// that wobble by 1 / sqrt(1 + (Omega h)^2) a step instead -- it damps a wobble real physics keeps, which is its price -- and
// runs the intermediate axis's unstable wobble at sigma (1 + sigma h / 2), still Euler's rate to within about 1% at 1/60 s.
// The same note's third round measures what this file does in the engine.
//
// Quaternions are [w, x, y, z] (the engine's own convention, physics/mechanics/rigidBody6dof.mjs); inertia is a symmetric
// 3 x 3, row-major. Nothing here allocates more than a few small arrays, and nothing reads an engine.
"use strict";

/** Rotate v by the unit quaternion q = [w, x, y, z] (body frame to world frame): v + 2 w (u x v) + 2 u x (u x v). */
export function rotate(q, v) {
    const [w, x, y, z] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
/** Rotate v by q's conjugate (world frame to body frame). */
export const rotateInv = (q, v) => rotate([q[0], -q[1], -q[2], -q[3]], v);

/** True when the inertia is a multiple of the identity (to `tol` of its size): its gyroscopic torque is then exactly zero. */
export function isIsotropic(I, tol = 1e-6) {
    const s = Math.max(Math.abs(I[0]), Math.abs(I[4]), Math.abs(I[8]));
    return Math.abs(I[0] - I[4]) <= tol * s && Math.abs(I[4] - I[8]) <= tol * s && Math.abs(I[1]) <= tol * s && Math.abs(I[2]) <= tol * s && Math.abs(I[5]) <= tol * s;
}

/** The residual's Jacobian at the body-frame angular velocity w: box3d's nine entries, written here row by row (box3d stores columns). */
export function jacobian(I, w, h) {
    const i00 = I[0], i01 = I[1], i02 = I[2], i11 = I[4], i12 = I[5], i22 = I[8], [w1, w2, w3] = w;
    const Iw1 = i00 * w1 + i01 * w2 + i02 * w3, Iw2 = i01 * w1 + i11 * w2 + i12 * w3, Iw3 = i02 * w1 + i12 * w2 + i22 * w3;
    return [
        i00 + h * (w2 * i02 - w3 * i01), i01 + h * (w2 * i12 - w3 * i11 + Iw3), i02 + h * (w2 * i22 - w3 * i12 - Iw2),
        i01 + h * (w3 * i00 - w1 * i02 - Iw3), i11 + h * (w3 * i01 - w1 * i12), i12 + h * (w3 * i02 - w1 * i22 + Iw1),
        i02 + h * (w1 * i01 - w2 * i00 + Iw2), i12 + h * (w1 * i11 - w2 * i01 - Iw1), i22 + h * (w1 * i12 - w2 * i02),
    ];
}

/** Solve A x = b for a row-major 3 x 3 A, by Cramer's rule; null when A is singular. */
export function solve3(A, b) {
    const [a, bb, c, d, e, f, g, hh, i] = A;
    const det = a * (e * i - f * hh) - bb * (d * i - f * g) + c * (d * hh - e * g);
    if (!(Math.abs(det) > 0)) return null;
    const x = (b[0] * (e * i - f * hh) - bb * (b[1] * i - f * b[2]) + c * (b[1] * hh - e * b[2])) / det;
    const y = (a * (b[1] * i - f * b[2]) - b[0] * (d * i - f * g) + c * (d * b[2] - b[1] * g)) / det;
    const z = (a * (e * b[2] - b[1] * hh) - bb * (d * b[2] - b[1] * g) + b[0] * (d * hh - e * g)) / det;
    return [x, y, z];
}

/** THE STEP, in body coordinates: one Newton step on I (w2 - w1) + h w2 x (I w2) = 0 from w2 = w1, so the residual starts at h w1 x (I w1). */
export function stepBody(I, w1, h) {
    const i00 = I[0], i01 = I[1], i02 = I[2], i11 = I[4], i12 = I[5], i22 = I[8], [a, b, c] = w1;
    const Iw1 = i00 * a + i01 * b + i02 * c, Iw2 = i01 * a + i11 * b + i12 * c, Iw3 = i02 * a + i12 * b + i22 * c;
    const r = [h * (b * Iw3 - c * Iw2), h * (c * Iw1 - a * Iw3), h * (a * Iw2 - b * Iw1)];
    const d = solve3(jacobian(I, w1, h), r);
    return d ? [a - d[0], b - d[1], c - d[2]] : [a, b, c];
}

/** THE STEP, in world coordinates: a body's world-frame angular velocity and orientation -> its new world-frame angular velocity. */
export function implicitGyroStep(I, q, wWorld, h) { return rotate(q, stepBody(I, rotateInv(q, wWorld), h)); }
