// WebGLEngine/physics/mechanics/rigidBody6dofBox3dScheme.mjs -- UNNUMBERED (2026-11-04)
//
// box3d's SCHEME FOR A LONE BODY, IN DOUBLE PRECISION, with rigidBody6dof.step()'s contract. It is "D" of the round registered as
// physics/mechanics/BOX3D_PD_JOUST_WIP.md, which asks whether box3d's scheme or its float32 costs the PD autopilot its mirror
// jousts. Nothing in the engine uses it unless asked.
//
// A port, as JavaScript numbers, of what box3d v0.1.0 does to one dynamic body with no contacts, no gravity and no damping, when
// physics/mechanics/rigidBody6dofBox3d.mjs's stepper drives it (box3d is MIT, Copyright (c) 2026 Erin Catto; v0.1.0 is the tag
// vendor/box3d/PROVENANCE.md pins, commit 8441b4a0, read in the clone the spinning-body rebuild left in the sandbox). Each tick:
//   1. THE STEPPER'S CALLS, in its order. The spin is set in the world frame, w = R w_body. The impulses are given as the stepper
//      gives them: the force and the torque turned into the world frame by the orientation at the tick's start, times dt.
//      src/body.c's b3Body_ApplyLinearImpulseToCenter does v += J / m, clamped to the 400 m/s cap. b3Body_ApplyAngularImpulse turns
//      J into body coordinates, multiplies by I^-1, and turns the result back: w += R I^-1 R^T J.
//   2. FOUR SUBSTEPS, h = dt / 4 (src/physics_world.c: h = timeStep / subStepCount, inv_dt = 1 / timeStep), each one:
//      - src/solver.c's b3IntegrateVelocitiesTask. No force, gravity or damping act here, so what is left is its gyroscopic step:
//        ONE Newton iteration on I (w2 - w1) + h w2 x I w2 = 0, in body coordinates at the substep's rotation, deltaRotation q0. Its
//        Jacobian is box3d's, entry for entry, and b3Solve3 is Cramer's rule, as box3d's is;
//      - b3IntegratePositionsTask: the speed caps (400 m/s, and B3_MAX_ROTATION = 0.25 pi rad per step, so 0.25 pi / dt rad/s);
//        the position by h v; the rotation by src/math_internal.h's b3IntegrateRotation, q2 = normalize(q1 + 0.5 (h w) q1), on
//        box3d's deltaRotation, which starts each step at the identity.
//   3. src/solver.c's b3FinalizeBodiesTask: q = normalize(deltaRotation q0), and the position plus its delta. The stepper reads
//      the spin back in the body frame of that new orientation.
// What is NOT ported, because a lone body never reaches it: contacts, joints, sleep, continuous collision, restitution.
"use strict";
import { rotateByQuat, worldToBody } from "./rigidBody6dof.mjs";

export const SUBSTEPS = 4;
export const MAX_LINEAR_SPEED = 400;          // box3d's b3DefaultWorldDef, maximumLinearSpeed = 400 * lengthUnits (src/types.c)
export const MAX_ROTATION = 0.25 * Math.PI;   // B3_MAX_ROTATION (include/box3d/constants.h), radians per step

// box3d's quaternion helpers (include/box3d/math_functions.h), on the engine's [w, x, y, z]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mulAdd = (a, s, b) => [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2]];
const mulSub = (a, s, b) => [a[0] - s * b[0], a[1] - s * b[1], a[2] - s * b[2]];
/** b3MulQuat: the Hamilton product. */
export function mulQuat(q1, q2) {
    const v1 = [q1[1], q1[2], q1[3]], v2 = [q2[1], q2[2], q2[3]];
    const t3 = mulAdd(mulAdd(cross(v1, v2), q1[0], v2), q2[0], v1);
    return [q1[0] * q2[0] - dot(v1, v2), t3[0], t3[1], t3[2]];
}
/** b3RotateVector: v + 2 cross(q.v, cross(q.v, v) + q.s v). */
export function rotate(q, v) { const qv = [q[1], q[2], q[3]]; return mulAdd(v, 2, cross(qv, mulAdd(cross(qv, v), q[0], v))); }
/** b3InvRotateVector: v + 2 cross(q.v, cross(q.v, v) - q.s v). */
export function invRotate(q, v) { const qv = [q[1], q[2], q[3]]; return mulAdd(v, 2, cross(qv, mulSub(cross(qv, v), q[0], v))); }
/** b3NormalizeQuat, its threshold 1000 FLT_MIN and its identity fallback included. */
export function normalizeQuat(q) {
    const l2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3];
    if (l2 > 1000 * 1.1754943508222875e-38) { const s = 1 / Math.sqrt(l2); return [s * q[0], s * q[1], s * q[2], s * q[3]]; }
    return [1, 0, 0, 0];
}
/** b3IntegrateRotation: q2 = normalize(q1 + 0.5 (deltaRotation, 0) q1). */
export function integrateRotation(q1, dr) {
    const qd = mulQuat([0, 0.5 * dr[0], 0.5 * dr[1], 0.5 * dr[2]], q1);
    return normalizeQuat([qd[0] + q1[0], q1[1] + qd[1], q1[2] + qd[2], q1[3] + qd[3]]);
}
/** b3Solve3: Cramer's rule on a column-major [cx, cy, cz], zero when the determinant is under 1000 FLT_MIN, as box3d returns. */
export function solve3([cx, cy, cz], a) {
    const det = dot(cx, cross(cy, cz));
    if (Math.abs(det) > 1000 * 1.1754943508222875e-38) { const inv = 1 / det; return [inv * dot(cross(cy, cz), a), inv * dot(cross(cz, cx), a), inv * dot(cross(cx, cy), a)]; }
    return [0, 0, 0];
}
/** b3IntegrateVelocitiesTask's gyroscopic step, its one Newton iteration, for a symmetric inertia (i00..i22) and local spin omega1. */
export function gyroNewton([i00, i01, i02, i11, i12, i22], omega1, h, iterations = 1) {
    let omega2 = [...omega1];
    for (let it = 0; it < iterations; ++it) {
        const [w1, w2, w3] = omega2;
        const Iw1 = i00 * w1 + i01 * w2 + i02 * w3, Iw2 = i01 * w1 + i11 * w2 + i12 * w3, Iw3 = i02 * w1 + i12 * w2 + i22 * w3;
        const dw = [omega2[0] - omega1[0], omega2[1] - omega1[1], omega2[2] - omega1[2]];
        const b = [i00 * dw[0] + i01 * dw[1] + i02 * dw[2] + h * (w2 * Iw3 - w3 * Iw2),
            i01 * dw[0] + i11 * dw[1] + i12 * dw[2] + h * (w3 * Iw1 - w1 * Iw3),
            i02 * dw[0] + i12 * dw[1] + i22 * dw[2] + h * (w1 * Iw2 - w2 * Iw1)];
        const J = [[i00 + h * (w2 * i02 - w3 * i01), i01 + h * (w3 * i00 - w1 * i02 - Iw3), i02 + h * (w1 * i01 - w2 * i00 + Iw2)],
            [i01 + h * (w2 * i12 - w3 * i11 + Iw3), i11 + h * (w3 * i01 - w1 * i12), i12 + h * (w1 * i11 - w2 * i01 - Iw1)],
            [i02 + h * (w2 * i22 - w3 * i12 - Iw2), i12 + h * (w3 * i02 - w1 * i22 + Iw1), i22 + h * (w1 * i12 - w2 * i02)]];
        const x = solve3(J, b);
        omega2 = [omega2[0] - x[0], omega2[1] - x[1], omega2[2] - x[2]];
    }
    return omega2;
}

/** One tick of box3d's scheme, in double: rigidBody6dof.step()'s contract. `opt.substeps` (default 4) is box3d's step argument. */
export function step(state, acc, dt, { substeps = SUBSTEPS } = {}) {
    const q0 = state.q, I = state.I, m = state.mass, inertia = [I[0], 0, 0, I[1], 0, I[2]];
    // 1. the stepper's calls: the spin set in the world frame, then the impulses, turned by the start orientation
    let v = [...state.vel], w = rotateByQuat(q0, state.w);
    const J = rotateByQuat(q0, acc.force).map((f) => f * dt), Ja = rotateByQuat(q0, acc.torque).map((t) => t * dt);
    v = mulAdd(v, 1 / m, J);
    if (dot(v, v) > MAX_LINEAR_SPEED * MAX_LINEAR_SPEED) { const l = Math.sqrt(dot(v, v)); v = [MAX_LINEAR_SPEED * v[0] / l, MAX_LINEAR_SPEED * v[1] / l, MAX_LINEAR_SPEED * v[2] / l]; }
    const local = invRotate(q0, Ja);
    w = mulAdd(w, 1, rotate(q0, [local[0] / I[0], local[1] / I[1], local[2] / I[2]]));
    // 2. the substeps
    const h = dt / substeps, maxW = MAX_ROTATION / dt;
    let dq = [1, 0, 0, 0], dpos = [0, 0, 0];
    for (let k = 0; k < substeps; ++k) {
        const qc = mulQuat(dq, q0);
        w = rotate(qc, gyroNewton(inertia, invRotate(qc, w), h));
        if (dot(v, v) > MAX_LINEAR_SPEED * MAX_LINEAR_SPEED) { const r = MAX_LINEAR_SPEED / Math.sqrt(dot(v, v)); v = [r * v[0], r * v[1], r * v[2]]; }
        if (dot(w, w) > maxW * maxW) { const r = maxW / Math.sqrt(dot(w, w)); w = [r * w[0], r * w[1], r * w[2]]; }
        dpos = mulAdd(dpos, h, v);
        dq = integrateRotation(dq, [h * w[0], h * w[1], h * w[2]]);
    }
    // 3. finalize, and the stepper's read-back
    const q = normalizeQuat(mulQuat(dq, q0));
    return { mass: m, I: [...I], pos: [state.pos[0] + dpos[0], state.pos[1] + dpos[1], state.pos[2] + dpos[2]], vel: v, q, w: worldToBody(q, w) };
}
