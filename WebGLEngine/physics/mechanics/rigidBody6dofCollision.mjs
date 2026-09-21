// WebGLEngine/physics/mechanics/rigidBody6dofCollision.mjs
//
// COLLISION for rigidBody6dof.mjs bodies: detection reuses physics/obbOverlap.js's already-gated, cross-arch-
// deterministic SAT (obbFromPosed/obbContact) rather than reinventing box-vs-box math -- obbOverlap.js already
// takes an arbitrary quaternion per box (see rigidBody6dof.mjs's toPoseQuat(), the bridge this file goes through
// to hand it a rigidBody6dof state's orientation in the convention it expects). RESPONSE is new: an impulse-based
// solver that turns a contact (point, normal) into a linear+angular velocity change for both bodies, derived by
// hand below and checked against textbook closed forms and conservation laws in this file's own gate, not fitted
// to the implementation.
//
// THE FORMULA. At a shared contact point p (SAME point for both bodies -- see CONTACT POINT note below for why
// that single fact is what makes angular-momentum conservation automatic rather than assumed), with rA = p-posA,
// rB = p-posB, unit normal n pointing A->B, restitution e, and K the effective inverse mass along n:
//   K = 1/mA + 1/mB + n . ( RA(IA^-1 (rA_body x n_body_A)) x rA )  +  n . ( RB(IB^-1 (rB_body x n_body_B)) x rB )
//   j = -(1+e) vn / K                              (vn = relative contact-point velocity along n, BEFORE impulse)
//   J = j n; velA -= J/mA, velB += J/mB; wA_body -= IA^-1(rA_body x J_body), wB_body += IB^-1(rB_body x J_body)
// where RX() is body-to-world rotation and the angular term is computed in BODY frame (where I is diagonal, per
// freeRotation.mjs's own convention) then rotated back, using the identity R(a x b) = R(a) x R(b) for a proper
// rotation R -- which only holds when q is exactly unit, the same requirement rigidBody6dof.mjs's own quaternion
// renormalisation already maintains every step. j <= 0 always (an approaching pair only ever pushed apart, never
// pulled together); vn > 0 (already separating) skips entirely -- j=0, no state change.
//
// THIS IS THE STANDARD RIGID-BODY COLLISION IMPULSE (Baraff's "Physically Based Modeling" course notes section
// 2.4; Millington's "Game Physics Engine Development"), NOT invented here -- but it was derived independently by
// hand and checked numerically (billiard-ball head-on swap, the unequal-mass 1D formula, 100 random-orientation
// trials' momentum/angular-momentum/energy conservation, e=0 driving contact-point relative velocity to exactly
// zero) in a standalone scratch script BEFORE being written into this file, the same discipline
// rigidBody6dof.mjs's own position formula was held to.
//
// CONTACT POINT: obbOverlap.js's obbContact() returns {normal, depth}, not a point -- SAT proves separation, it
// does not localise contact (a full manifold needs polygon clipping, out of scope for this first slice). This
// file approximates ONE contact point as the midpoint of each box's own support vertex along the contact normal
// (contactPoint(), below) -- an approximation for WHERE the hit looks like it lands, not for the conservation
// laws: because rA and rB are both measured from that SAME point p (rA - rB = posB - posA, algebraically, for
// ANY p), momentum and angular-momentum conservation hold EXACTLY regardless of which point is chosen -- proven
// directly in the gate with the approximate contactPoint() AND with a random, physically-arbitrary point, not
// merely asserted for the "nice" case.
//
// POSITIONAL CORRECTION (positionalCorrection(), below) is a SEPARATE, POSITION-ONLY nudge, not folded into
// resolveCollision() itself -- the standard split (Box2D's own "correction is not part of the impulse" design):
// an impulse alone only fixes VELOCITY, and two bodies that end up interpenetrating (a multi-body pile-up that
// doesn't fully separate in one tick, or a coarse dt letting a pair sink in before the next contact test) stay
// interpenetrating forever without it -- measured directly, not hypothetically: es-box3d-6dof.html's own first
// dogfight run found two same-team ships stuck re-colliding for 171 straight ticks (5.7s) before this function
// existed. It moves positions ALONE, split by inverse mass exactly like the impulse's own linear response, by a
// FRACTION of the penetration depth (never all of it in one step -- a full correction on a single tick is what
// makes a resting stack of bodies visibly jitter) minus a small SLOP allowance (a little standing overlap is
// left alone on purpose, so the correction does not fight the collision detector's own hit threshold every tick).
//
// WHAT THIS DELIBERATELY DOES NOT DO (first slice, matching rigidBody6dof.mjs's own scoping): no friction
// (tangential impulse), no persistent contact manifold across multiple simultaneous contact points -- one
// impulse (and one positional correction) per call, matching how physics/mechanics/rigidBody6dof.mjs's own
// step() takes one accumulated force/torque per tick rather than a multi-contact solver.
"use strict";
import { obbFromPosed, obbContact } from "../obbOverlap.js";
import { rotateByQuat, worldToBody, toPoseQuat, boxInertia, createBody } from "./rigidBody6dof.mjs";

export { worldToBody };   // re-exported: this file's own gate (and any other consumer already importing this
                            // module for bodyOBB/resolveCollision) can get the shared primitive from one place

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const sub3 = (a, b) => add3(a, b, -1);

/** A rigidBody6dof body posed as an OBB (obbOverlap.js's shape) for a given box half-extent. */
export function bodyOBB(body, half) { return obbFromPosed({ center: body.pos, half, quat: toPoseQuat(body.q) }); }

/** obbOverlap.js's contact test, through the bridge -- {hit:false} or {hit:true, normal (A->B), depth}. */
export function checkContact(bodyA, halfA, bodyB, halfB) { return obbContact(bodyOBB(bodyA, halfA), bodyOBB(bodyB, halfB)); }

/**
 * Approximate single contact point: each box's centre pushed toward the other along the contact normal by its
 * own PROJECTED HALF-WIDTH in that direction -- the same support-function projection obbOverlap.js's own
 * obbContact() already uses internally to test each SAT axis (Sigma |n . axis_i| * half_i), reused here rather
 * than reinvented. Averaging the two pushed points leaves the TANGENTIAL (off-normal) components exactly at the
 * midpoint of the two box centres -- so a flush face-to-face hit lands on the shared face's own centre, not on
 * an arbitrary corner (an earlier, vertex-support version of this function did that; caught by this file's own
 * gate section 7, which is why it is written this way). See this file's header for why the impulse response's
 * conservation laws hold regardless of how good this approximation is.
 */
export function contactPoint(obbA, obbB, normal) {
    const projectedHalfWidth = (obb, dir) => Math.abs(dot3(dir, obb.axes[0])) * obb.half[0] + Math.abs(dot3(dir, obb.axes[1])) * obb.half[1] + Math.abs(dot3(dir, obb.axes[2])) * obb.half[2];
    const pA = add3(obbA.center, normal, projectedHalfWidth(obbA, normal));
    const pB = add3(obbB.center, normal, -projectedHalfWidth(obbB, normal));
    return scale3(add3(pA, pB), 0.5);
}

/**
 * Resolve one contact between two rigidBody6dof bodies. `contact` = {point, normal} (normal points A->B).
 * Returns {j, a, b} -- j is the scalar impulse magnitude actually applied (0 if the pair was already
 * separating along the normal); a/b are NEW body states (mass/I/pos/q unchanged, vel/w updated). Does not
 * mutate its inputs. ASSUMES mass > 0 for both bodies (1/mass appears directly in K below) -- an explicit
 * mass:0 divides by zero and poisons that body's velocity with NaN, same as it would in F=ma itself; not
 * guarded here, matching how rigidBody6dof.mjs's own createBody()/boxInertia() never validate a non-physical
 * mass either.
 */
export function resolveCollision(a, b, contact, opts = {}) {
    const e = opts.restitution != null ? opts.restitution : 0.4;
    const { point: p, normal: n } = contact;
    const rA = sub3(p, a.pos), rB = sub3(p, b.pos);
    const wAworld = rotateByQuat(a.q, a.w), wBworld = rotateByQuat(b.q, b.w);
    const vpA = add3(a.vel, cross3(wAworld, rA)), vpB = add3(b.vel, cross3(wBworld, rB));
    const vn = dot3(sub3(vpB, vpA), n);
    if (vn > 0) return { j: 0, a, b };   // already separating -- no impulse

    const nBodyA = worldToBody(a.q, n), nBodyB = worldToBody(b.q, n);
    const rBodyA = worldToBody(a.q, rA), rBodyB = worldToBody(b.q, rB);
    const angTerm = (I, rBody, nBody) => {
        const rxn = cross3(rBody, nBody);
        return cross3([rxn[0] / I[0], rxn[1] / I[1], rxn[2] / I[2]], rBody);   // (I^-1 (r x n)) x r, BODY frame
    };
    const angAworld = rotateByQuat(a.q, angTerm(a.I, rBodyA, nBodyA));
    const angBworld = rotateByQuat(b.q, angTerm(b.I, rBodyB, nBodyB));
    const K = 1 / a.mass + 1 / b.mass + dot3(n, angAworld) + dot3(n, angBworld);
    const j = -(1 + e) * vn / K;
    const J = scale3(n, j);

    const velA2 = sub3(a.vel, scale3(J, 1 / a.mass)), velB2 = add3(b.vel, scale3(J, 1 / b.mass));
    const JbodyA = worldToBody(a.q, scale3(J, -1)), JbodyB = worldToBody(b.q, J);
    const dwBody = (I, rBody, Jbody) => { const t = cross3(rBody, Jbody); return [t[0] / I[0], t[1] / I[1], t[2] / I[2]]; };
    const wA2 = add3(a.w, dwBody(a.I, rBodyA, JbodyA)), wB2 = add3(b.w, dwBody(b.I, rBodyB, JbodyB));

    return { j, a: { ...a, vel: velA2, w: wA2 }, b: { ...b, vel: velB2, w: wB2 } };
}

/**
 * Push `a` and `b` apart along `contact.normal` by a FRACTION of the penetration depth, split by inverse mass
 * (a heavier body moves less) -- position only, no velocity/orientation change. `opts.percent` (default 0.2)
 * is how much of the overlap to remove THIS call (a partial, repeated-every-tick correction, never a full
 * one-shot snap -- the standard choice, see this file's header); `opts.slop` (default 0.01) is a small
 * standing overlap left alone so the correction never fights the contact test's own hit threshold. Returns
 * {a, b} -- new states with `pos` updated, everything else unchanged; does not mutate its inputs.
 */
export function positionalCorrection(a, b, contact, opts = {}) {
    const percent = opts.percent != null ? opts.percent : 0.2, slop = opts.slop != null ? opts.slop : 0.01;
    const penetration = Math.max(contact.depth - slop, 0);
    if (penetration <= 0) return { a, b };
    const mag = (penetration / (1 / a.mass + 1 / b.mass)) * percent;
    const correction = scale3(contact.normal, mag);
    return {
        a: { ...a, pos: sub3(a.pos, scale3(correction, 1 / a.mass)) },
        b: { ...b, pos: add3(b.pos, scale3(correction, 1 / b.mass)) },
    };
}

// ---- FRONT DOOR -------------------------------------------------------------------------------------------------
export function reportLines() {
    const I = boxInertia({ m: 8, hx: 1, hy: 0.8, hz: 2 });
    const half = [1, 0.8, 2];
    const a = createBody({ mass: 8, I, pos: [-0.8, 0, 0], vel: [3, 0, 0] });
    const b = createBody({ mass: 8, I, pos: [0.8, 0.3, 0], vel: [-2, 0, 0] });
    const c = checkContact(a, half, b, half);
    if (!c.hit) return ["[rigidBody6dofCollision] the two demo boxes do not touch at these positions/half-extents"];
    const cp = contactPoint(bodyOBB(a, half), bodyOBB(b, half), c.normal);
    const { j, a: a2, b: b2 } = resolveCollision(a, b, { point: cp, normal: c.normal }, { restitution: 0.5 });
    const { a: a3, b: b3 } = positionalCorrection(a2, b2, c);
    const depthAfter = checkContact(a3, half, b3, half);
    return [
        "[rigidBody6dofCollision] obbOverlap.js's OBB contact test + a hand-derived impulse response, both proven",
        "                         against closed-form and conservation-law checks in this file's own gate.",
        `  contact: normal ${c.normal.map((v) => v.toFixed(3))}  depth ${c.depth.toFixed(3)}  impulse j=${j.toFixed(3)}`,
        `  a.vel ${a2.vel.map((v) => v.toFixed(3))}  a.w ${a2.w.map((v) => v.toFixed(4))}`,
        `  b.vel ${b2.vel.map((v) => v.toFixed(3))}  b.w ${b2.w.map((v) => v.toFixed(4))}`,
        `  positional correction: depth ${c.depth.toFixed(3)} -> ${depthAfter.hit ? depthAfter.depth.toFixed(3) : 0} after one call`,
    ];
}
// GUARDED (this tree's established idiom -- see physics/stabilityMeter.mjs's own v3900/v3951 notes and
// tools/ship/browserSafety-selfcheck.mjs, the gate that exists because of exactly this bug): this module is
// loaded by a PAGE as well as run as a CLI, and `process` at module top level is a ReferenceError in a
// browser -- not a caught failure, an EVALUATION failure, so the whole module fails to load and every page
// that imports it dies with it. The node:url import itself must be INSIDE the guard too, dynamically -- a
// bare top-level `import ... from "node:url"` is resolved before this line ever runs, so an unguarded import
// crashes the browser before the guard below would even get a chance to skip it.
if (typeof process !== "undefined" && Array.isArray(process.argv)) {
    const { pathToFileURL } = await import("node:url");
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
        for (const l of reportLines()) console.log(l);
        process.exit(0);
    }
}
