// physics/xpbd/attachKey.mjs
//
// v3465 -- GRADING WORLD ATTACHMENTS, AND THE KEY IS TWO REGIMES OF ONE FORMULA PLUS AN ORDER INVARIANCE.
//
// attach.js pins a particle to a world point (a hook, a curtain ring, a moving hand) with an XPBD point
// constraint C = |x - target|, rest 0. Its header states the physics in one sentence: "With compliance 0 the
// correction is exactly -(x - target), so the particle snaps onto the anchor in ONE step; with positive
// compliance it is a soft spring to the anchor." And: "Each attachment touches ONE particle, so attachments to
// distinct particles are independent and order-free." Three edges, none the tautology of grading the solve
// against the solve:
//
//   SNAP AT ZERO      compliance 0 -> aTilde 0 -> the single-step correction is exactly -(x - target), so the
//                     particle lands ON the anchor to the bit (snapErr exactly 0). Derived: dLambda = -C/w,
//                     s = -1/w, w*s = -1, so pred += -(x - target).
//   SOFT SPRING       compliance c > 0 keeps a KNOWN fraction of the offset after one step: the residual is
//                     aTilde/(w + aTilde) * |x - target|, aTilde = c/dt^2. Measured against that CLOSED FORM,
//                     not the solver re-run -- 1.7e-16, so it is nonzero real arithmetic, not an exact zero.
//   ORDER FREEDOM     each attachment touches a distinct particle and its own lambda slot, so scrambling the
//                     visit order changes nothing to the bit (orderErr exactly 0).
//
// *** THE PLANT IS THE HEADER'S TWO-REGIME CLAIM TURNED INTO A FAULT: ignore compliance (force aTilde = 0) and
// EVERYTHING snaps. It passes the snap key -- at compliance 0 the correct and planted solves are the SAME
// arithmetic -- and breaks the soft spring outright, since a spring that keeps aTilde/(w+aTilde) of its offset
// is read as keeping none. *** Honest exactly like the compliance and sampled keys: the two agree at the special
// point (compliance 0) and part everywhere else.
//
// An integer/dyadic mass set makes the snap and order identities exact by construction: w*(1/w) is exactly 1.

import { solveAttachments } from "./attach.js";

const DT = 0.016;
const INV_MASS = [1.0, 0.5, 0.25, 2.0];        // dyadic, so the snap is exact to the bit

// Four attachments, one per distinct particle, each pulling toward a world target.
function rig(compliance) {
    const pred = Float64Array.from([3, 1, -2, 0, 4, 1, -5, 2, 3, 1, -1, 6]);
    const att = [
        { p: 0, tx: 0, ty: 0, tz: 0, compliance },
        { p: 1, tx: 1, ty: 1, tz: 1, compliance },
        { p: 2, tx: -1, ty: 2, tz: 0, compliance },
        { p: 3, tx: 2, ty: 0, tz: 1, compliance },
    ];
    return { pred, att };
}
const offset = (pred, a) => Math.hypot(pred[3 * a.p] - a.tx, pred[3 * a.p + 1] - a.ty, pred[3 * a.p + 2] - a.tz);

/** Compliance 0 lands the particle exactly on the anchor in one solve. */
export function snapAtZero() {
    const { pred, att } = rig(0);
    solveAttachments(pred, INV_MASS, att, new Float64Array(att.length), DT);
    let snapErr = 0;
    for (const a of att) snapErr = Math.max(snapErr, offset(pred, a));
    return { snapErr };
}

/** A distinct particle per attachment means the result does not depend on visit order. */
export function orderFreedom() {
    const A = rig(0), B = rig(0);
    solveAttachments(A.pred, INV_MASS, A.att, new Float64Array(4), DT, [0, 1, 2, 3]);
    solveAttachments(B.pred, INV_MASS, B.att, new Float64Array(4), DT, [3, 2, 1, 0]);
    let orderErr = 0;
    for (let i = 0; i < A.pred.length; i++) orderErr = Math.max(orderErr, Math.abs(A.pred[i] - B.pred[i]));
    return { orderErr };
}

/** Positive compliance keeps exactly aTilde/(w+aTilde) of the offset after one step -- a soft spring. */
export function softSpring() {
    const comp = DT * DT;                          // aTilde = 1
    const { pred, att } = rig(comp);
    const before = att.map((a) => offset(pred, a));
    solveAttachments(pred, INV_MASS, att, new Float64Array(att.length), DT);
    let springErr = 0, sampleResidual = null;
    for (let k = 0; k < att.length; k++) {
        const a = att[k], w = INV_MASS[a.p], aT = comp / (DT * DT);
        const frac = offset(pred, a) / before[k], expected = aT / (w + aT);
        springErr = Math.max(springErr, Math.abs(frac - expected) / expected);
        if (k === 0) sampleResidual = frac;
    }
    return { springErr, sampleResidual };
}

/** The planted solve ignores compliance (aTilde forced to 0), so it snaps where a soft spring should hold. */
export function ignoreCompliancePlant() {
    const comp = DT * DT;
    const { pred, att } = rig(comp);
    const before = att.map((a) => offset(pred, a));
    for (let ai = 0; ai < att.length; ai++) {
        const a = att[ai], w = INV_MASS[a.p], o = 3 * a.p;
        const dx = pred[o] - a.tx, dy = pred[o + 1] - a.ty, dz = pred[o + 2] - a.tz, len = Math.hypot(dx, dy, dz);
        if (len < 1e-12) continue;
        const s = (-len / w) / len;                // aTilde omitted -- always snaps
        pred[o] += w * s * dx; pred[o + 1] += w * s * dy; pred[o + 2] += w * s * dz;
    }
    let plantSpringErr = 0;
    for (let k = 0; k < att.length; k++) {
        const a = att[k], w = INV_MASS[a.p], expected = 1 / (w + 1);
        plantSpringErr = Math.max(plantSpringErr, Math.abs(offset(pred, a) / before[k] - expected) / expected);
    }
    // the honest half: at compliance 0 the planted solve IS the correct one
    const z = rig(0);
    solveAttachments(z.pred, INV_MASS, z.att, new Float64Array(4), DT);
    let agreesAtZero = 0;
    for (const a of z.att) agreesAtZero = Math.max(agreesAtZero, offset(z.pred, a));
    return { plantSpringErr, agreesAtZero };
}

/** The graded keys in the shape the xpbd device mode reports. */
export function attachKeys() {
    const s = snapAtZero();
    const o = orderFreedom();
    const sp = softSpring();
    const p = ignoreCompliancePlant();
    return {
        snapErr: s.snapErr,
        orderErr: o.orderErr,
        springErr: sp.springErr,
        plantSpringErr: p.plantSpringErr,
        snapsAtZero: s.snapErr === 0,
        orderFree: o.orderErr === 0,
        softSpring: sp.sampleResidual > 0.05 && sp.sampleResidual < 0.95,
        plantSnapsWrongly: p.plantSpringErr > 0.5,
    };
}
