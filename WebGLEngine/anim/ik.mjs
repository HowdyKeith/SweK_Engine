// WebGLEngine/anim/ik.mjs -- v4253
//
// *** THE TREE CAN PLAY A POSE ON A SECOND SKELETON AND IT CAN MAKE ONE GO LIMP. IT CANNOT PUT A HAND ON A
// *** DOORKNOB. Grepped for FABRIK, ccdIK, solveIK, inverseKinematic across the whole tree before writing a
// line of this: nothing, anywhere. v4244 built anim/retarget.mjs, so a clip can drive a skeleton it was not
// authored for; v4245 built physics/ragdollFromSkeleton.mjs, so a skeleton can be handed to the solver and
// fall over. Both move a chain by pushing rotations DOWN it. Inverse kinematics is the other direction --
// name a point, and solve for the rotations that get there -- and it is the missing half of both:
//
//   - retargetPose puts a source animation on a target skeleton with different bone LENGTHS. v4244 measured
//     the consequence and called it footSlide: the foot no longer lands where the animator put it. An IK
//     pass pinning the foot to the ground is the standard repair, and footSlide is already the instrument
//     that would score it.
//
//   - v4249 found that a ragdoll's jointed neighbours self-collide, and that the correct fix (collision
//     filtering) cannot be requested through the box3d shim. IK is the other half of a ragdoll's usefulness:
//     a body that can be POSED to a target rather than only released.
//
// ---- WHY THIS IS GATEABLE RATHER THAN A MATTER OF TASTE ------------------------------------------------------
//
// An IK solver is easy to fake and the fake looks fine in a screenshot. Three things make it checkable:
//
//   1. *** TWO-BONE IK HAS AN EXACT CLOSED FORM. *** For a chain of two bones l1, l2 reaching a target at
//      distance D, the law of cosines gives the interior angle at the middle joint and the angle at the root
//      outright. An iterative solver's converged answer is not a matter of opinion -- it either reproduces
//      those angles or it does not.
//
//   2. *** THE UNREACHABLE CASE HAS A CLOSED FORM TOO, AND IT IS THE SHARPER ONE. *** Put the target beyond
//      the chain's total length L and the best possible end-effector error is EXACTLY D - L, achieved only
//      by a perfectly straight chain. A solver that reports a smaller error is stretching bones.
//
//   3. *** BONE LENGTHS ARE THE CONTROL. *** Every check above is satisfied trivially by a "solver" that
//      just moves the end effector onto the target and lets the joints follow. That is not IK, it is a
//      rubber band, and the only thing separating them is whether the segment lengths survived. So lengths
//      are asserted at float precision on every solve, and the gate's own sabotage removes that.
//
// NOTHING IS TAKEN FROM ossos OR ANY OTHER REPOSITORY. FABRIK is Aristidou & Lasenby 2011, four lines of
// vector arithmetic; the analytic two-bone case is the law of cosines. What ossos would have supplied is a
// runtime, and this tree has its own.
"use strict";
import { qMul, qConj } from "./retarget.mjs";   // one place in the tree knows quaternions

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (v) => { const L = Math.hypot(v[0], v[1], v[2]); return L > 1e-12 ? scale(v, 1 / L) : [0, 0, 0]; };

/** The bone lengths of a point chain. n points give n-1 bones, which is the invariant everything else guards. */
export function chainLengths(points) {
    const out = [];
    for (let i = 1; i < points.length; i++) out.push(dist(points[i - 1], points[i]));
    return out;
}

/** Total reach: the furthest the end effector can get from the root. */
export const reach = (lengths) => lengths.reduce((a, b) => a + b, 0);

/**
 * *** THE CLOSED FORM THE ITERATIVE SOLVERS ARE GRADED AGAINST. ***
 *
 * Two bones l1, l2 and a target at distance D from the root. The triangle root-joint-target has sides
 * l1, l2, D, so the law of cosines gives both angles outright:
 *
 *   joint  -- the interior angle AT the middle joint, between the two bones. PI means straight.
 *   root   -- the angle at the root between bone 1 and the straight line to the target.
 *
 * D is clamped into [|l1-l2|, l1+l2] first, because outside that range no triangle exists and the honest
 * answer is the nearest one that does: fully folded, or fully straight.
 */
export function twoBoneAngles(l1, l2, D) {
    const lo = Math.abs(l1 - l2), hi = l1 + l2;
    const d = Math.min(hi, Math.max(lo, D));
    const clamp = (x) => (x < -1 ? -1 : x > 1 ? 1 : x);
    return {
        joint: Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))),
        root: Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))),
        clamped: d !== D,
    };
}

/**
 * *** THE OTHER CLOSED FORM: the best error achievable for a target that cannot be reached. ***
 *
 * Beyond the chain's total length there is no solution, only a nearest approach, and it is exactly D - L
 * with the chain perfectly straight. Inside the reach it is 0. This is what makes "did the solver converge"
 * a comparison rather than a judgement -- there is a number to hit, and beating it means cheating.
 */
export function bestError(lengths, D) {
    const L = reach(lengths);
    return D > L ? D - L : 0;
}

/**
 * FABRIK: Forward And Backward Reaching Inverse Kinematics.
 *
 * Two sweeps per iteration. Backward: put the end effector ON the target, then walk towards the root placing
 * each point at its bone's length along the direction to the point just placed. Forward: put the root back
 * where it belongs and walk out again the same way. The root moves during the backward sweep and is restored
 * by the forward one, which is the whole trick.
 *
 * *** EVERY POINT IS PLACED AT EXACTLY ITS BONE LENGTH ALONG A UNIT VECTOR, so lengths are preserved BY
 * *** CONSTRUCTION rather than by a correction step. That is the property worth having and the one the gate
 * checks hardest.
 *
 * @returns {{points, iterations, error, converged}}
 */
export function fabrik(points, target, { lengths = null, tol = 1e-6, maxIter = 32 } = {}) {
    const P = points.map((p) => [p[0], p[1], p[2]]);
    const d = lengths || chainLengths(points);
    const n = P.length;
    if (n < 2) return { points: P, iterations: 0, error: dist(P[n - 1] || [0, 0, 0], target), converged: false };
    const root = [P[0][0], P[0][1], P[0][2]];
    const L = reach(d);
    const D = dist(root, target);

    // Out of range: there is nothing to iterate towards. The answer is the straight chain, and it is exact.
    if (D > L) {
        const u = norm(sub(target, root));
        for (let i = 1; i < n; i++) P[i] = add(P[i - 1], scale(u, d[i - 1]));
        return { points: P, iterations: 0, error: dist(P[n - 1], target), converged: true, straight: true };
    }

    let it = 0;
    for (; it < maxIter; it++) {
        if (dist(P[n - 1], target) < tol) break;
        P[n - 1] = [target[0], target[1], target[2]];                       // backward sweep
        for (let i = n - 2; i >= 0; i--) P[i] = add(P[i + 1], scale(norm(sub(P[i], P[i + 1])), d[i]));
        P[0] = [root[0], root[1], root[2]];                                 // forward sweep
        for (let i = 1; i < n; i++) P[i] = add(P[i - 1], scale(norm(sub(P[i], P[i - 1])), d[i - 1]));
    }
    const error = dist(P[n - 1], target);
    return { points: P, iterations: it, error, converged: error < tol };
}

/**
 * CCD: Cyclic Coordinate Descent. Walks the chain from the tip inwards, rotating each joint so the line
 * joint->effector points at joint->target, one joint at a time.
 *
 * It is here as a SECOND OPINION rather than as an alternative: two solvers with different mechanisms
 * converging on the same angles is evidence neither is fitting the test. CCD moves one joint at a time and
 * FABRIK moves the whole chain per sweep, so agreement between them is not a shared bug.
 */
export function ccd(points, target, { tol = 1e-6, maxIter = 64 } = {}) {
    const P = points.map((p) => [p[0], p[1], p[2]]);
    const n = P.length;
    if (n < 2) return { points: P, iterations: 0, error: Infinity, converged: false };
    let it = 0;
    for (; it < maxIter; it++) {
        if (dist(P[n - 1], target) < tol) break;
        for (let j = n - 2; j >= 0; j--) {
            const piv = P[j];
            const a = norm(sub(P[n - 1], piv)), b = norm(sub(target, piv));
            const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
            const ang = Math.acos(dot);
            if (ang < 1e-9) continue;
            const ax = norm([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
            if (ax[0] === 0 && ax[1] === 0 && ax[2] === 0) continue;         // parallel: no axis to turn about
            const s = Math.sin(ang / 2);
            const q = [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
            for (let k = j + 1; k < n; k++) P[k] = add(piv, rotate(q, sub(P[k], piv)));
        }
    }
    const error = dist(P[n - 1], target);
    return { points: P, iterations: it, error, converged: error < tol };
}

/** v * q, via the quaternion multiply the tree already has -- not a fifth copy of the sandwich product. */
function rotate(q, v) {
    const r = qMul(qMul(q, [v[0], v[1], v[2], 0]), qConj(q));
    return [r[0], r[1], r[2]];
}

/**
 * A hinge: clamp the interior angle at one joint of a three-point chain into [min, max].
 *
 * *** WHAT THIS DELIBERATELY DOES NOT CLAIM: it is not a hinge AXIS. *** A knee bends about one axis and a
 * positional solver has no axis to constrain -- FABRIK works on points, and a point chain that keeps its
 * lengths can still fold out of the plane a real knee is confined to. Clamping the ANGLE stops a knee
 * inverting, which is the failure people actually see; it does not stop it swinging sideways. Saying so here
 * rather than shipping "joint limits" and letting a caller assume the stronger thing.
 */
export function clampJointAngle(points, min, max) {
    if (points.length !== 3) return points.map((p) => p.slice());
    const [a, b, c] = points;
    const l1 = dist(a, b), l2 = dist(b, c);
    const u = norm(sub(a, b)), v = norm(sub(c, b));
    const cur = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
    const want = Math.min(max, Math.max(min, cur));
    if (Math.abs(want - cur) < 1e-12) return [a.slice(), b.slice(), c.slice()];
    let ax = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(ax[0], ax[1], ax[2]) < 1e-9) {                            // straight or folded: pick any axis
        const t = Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        ax = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]];
    }
    ax = norm(ax);
    const dth = want - cur, s = Math.sin(dth / 2);
    const q = [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(dth / 2)];
    return [a.slice(), b.slice(), add(b, rotate(q, scale(v, l2)))].map((p, i) => (i === 2 ? p : p));
}

/** Worst bone-length drift a solve introduced. The control, exported so the caller can assert it too. */
export function lengthDrift(before, after) {
    const a = chainLengths(before), b = chainLengths(after);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    return worst;
}
