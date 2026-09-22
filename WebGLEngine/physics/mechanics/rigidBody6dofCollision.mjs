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
// FRICTION (added this round): a CLAMPED-COULOMB, SEQUENTIAL-IMPULSE tangential impulse (Box2D's own ordering --
// resolve the normal impulse first, THEN friction against what's left), reusing the SAME effective-inverse-mass
// construction the normal impulse uses, just projected onto a TANGENT direction `t` instead of the contact
// normal `n`: with vAfterN = contact-point relative velocity right after the normal impulse, vTangent = the
// component of vAfterN perpendicular to n (the actual sliding, not the part already resolved by j), t =
// unit(vTangent), and Kt the same effectiveInverseMass() construction along t:
//   jtRaw = -|vTangent| / Kt                          (same form as j with e=0 -- drives sliding fully to zero)
//   jt = max(jtRaw, -mu*j)                             (Coulomb clamp: |jt| <= mu * the normal impulse magnitude)
// jtRaw <= 0 and mu*j >= 0 always (mu, j both non-negative under this file's own sign conventions), so the clamp
// is a simple max(). A caller who never opts into `opts.friction` still gets it (default mu=0.5, matching this
// file's own default-restitution convention of a sensible, overridable middle value) -- mu=0 reproduces the OLD
// normal-only behavior EXACTLY (proven in the gate: identical vel/w to the pre-friction formula, not merely
// "close"), so this is additive, not a silent behavior change for anyone who explicitly wanted mu=0.
//
// PROVEN IN A STANDALONE SCRATCH SCRIPT BEFORE BEING WRITTEN HERE (the same discipline the normal impulse itself
// was held to, re-run in this file's own gate): mu=0 reproduces the pre-friction formula exactly; a grazing,
// mostly-tangential impact is measurably slowed in the tangential direction while the NORMAL response is
// completely unaffected; a very large mu drives contact-point tangential slip to (near) exactly zero (the
// static-friction limit); a small mu leaves most of the slip (the Coulomb clamp actually binds, not merely
// exists); momentum AND angular momentum stay conserved to float precision across 200 random trials with
// friction active (friction is an equal-and-opposite impulse pair, same as the normal one); friction alone NEVER
// increases kinetic energy on top of what the normal impulse already did (it may only dissipate); and a mirrored
// tangential-velocity scenario produces an exactly mirrored PHYSICAL outcome (the raw scalar jt is NOT the
// quantity that mirrors, since it is defined relative to a tangent direction `t` that itself flips between the
// two mirrored cases -- the gate checks the actual post-impact relative velocity instead, the mistake a first
// draft of this exact check made and corrected before it ever reached the gate).
//
// THE MANIFOLD GAP NAMED ABOVE IS NOW CLOSED (this round): physics/obbManifold.js (a sibling of obbOverlap.js,
// never imported here in the other direction) turns one obbContact() {normal, depth} result into up to 4 actual
// contact points via SAT-axis-categorized face clipping or edge-edge closest-point math -- see that file's own
// header for the algorithm. resolveManifold() (below) is the thin bridge: it does NOT change resolveCollision()
// or positionalCorrection() at all (both remain byte-identical to before this round, still single-point, still
// the ONLY functions that actually touch velocity/position) -- it sequences resolveCollision() once per manifold
// point, deepest-first, summing the impulse magnitudes a caller may want for e.g. damage. This keeps the already-
// proven single-contact formula as the one source of truth for the physics; a manifold is a SCHEDULE of calls
// into it, not a new formula.
//
// WHY SEQUENTIAL (Gauss-Seidel), NOT SIMULTANEOUS: each resolveCollision() call already reads the CURRENT
// vel/w of both bodies, so a second point's impulse naturally accounts for the velocity change the first point's
// impulse just made -- the standard, simplest multi-contact scheme (a single pass, no warm-starting, no extra
// velocity iterations), matching this file's own existing "one accumulated response per tick" philosophy rather
// than introducing a new one. Named limitation, not silently implied to be a full iterative solver.
//
// WHY DEEPEST-FIRST: no physical requirement forces an order (conservation holds per-call regardless, see below),
// but resolving the most-penetrating point first gives it first claim on separating the pair before a shallower
// point's own impulse can partially undo it -- the standard convention (Box2D orders manifold points by depth for
// the same reason). The sort uses an EXPLICIT index tie-break (`y.depth - x.depth || x.i - y.i`), not bare
// Array.sort stability, so ordering is deterministic by construction rather than by an engine-version accident.
//
// CONSERVATION: resolveCollision() already conserves momentum/angular-momentum exactly and never increases energy
// for ANY {point, normal} input (existing gate section 3's own state-independent proof -- it does not depend on
// WHICH point was passed). N sequential calls therefore sum N exactly-conserving/non-increasing deltas, so the
// composite is exactly conserving/non-increasing too -- an algebraic consequence of the existing proof, not a new
// physical claim, but still directly asserted (not merely inferred) in this file's own gate.
//
// POSITIONAL CORRECTION is called ONCE per pair per tick by the CALLER, at the manifold's own deepest point,
// through the existing unmodified positionalCorrection(a,b,{normal,depth},opts) -- resolveManifold() itself never
// calls it. positionalCorrection() is a single 1-DOF translation along one normal with no per-point capability;
// calling it once per manifold point would apply the SAME direction up to 4 times with only depth differing --
// genuine overcorrection (a body pushed apart up to 4x too far for a flush 4-point hit), not a refinement, which
// is why no positionalCorrectionManifold() wrapper exists.
//
// mass:0 / NaN CONTAINMENT: resolveCollision()'s own existing guard (the `!(slideSpeed >= 1e-9)` fix, this file's
// own gate sabotage-H) holds per call for ANY input state; by induction it stays contained across a sequential
// resolveManifold() loop exactly as it does for one call -- asserted directly in the gate on an actual multi-
// point manifold, not merely argued from the single-call proof.
"use strict";
import { obbFromPosed, obbContact } from "../obbOverlap.js";
import { rotateByQuat, worldToBody, toPoseQuat, boxInertia, createBody } from "./rigidBody6dof.mjs";

export { worldToBody };   // re-exported: this file's own gate (and any other consumer already importing this
                            // module for bodyOBB/resolveCollision) can get the shared primitive from one place

const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (v) => Math.hypot(v[0], v[1], v[2]);
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

/** Effective inverse mass along an arbitrary unit direction `d` -- the SAME (I^-1(r x d)) x r construction the
 * normal impulse always used, generalized so the friction impulse below (along a TANGENT direction instead of
 * the contact normal) can reuse it exactly rather than duplicating the angular term by hand. */
function effectiveInverseMass(a, b, rA, rB, d) {
    const dBodyA = worldToBody(a.q, d), dBodyB = worldToBody(b.q, d);
    const rBodyA = worldToBody(a.q, rA), rBodyB = worldToBody(b.q, rB);
    const angTerm = (I, rBody, dBody) => {
        const rxd = cross3(rBody, dBody);
        return cross3([rxd[0] / I[0], rxd[1] / I[1], rxd[2] / I[2]], rBody);   // (I^-1 (r x d)) x r, BODY frame
    };
    const angAworld = rotateByQuat(a.q, angTerm(a.I, rBodyA, dBodyA));
    const angBworld = rotateByQuat(b.q, angTerm(b.I, rBodyB, dBodyB));
    return 1 / a.mass + 1 / b.mass + dot3(d, angAworld) + dot3(d, angBworld);
}

/** Apply impulse vector `J` (at world contact point via rA=p-a.pos, rB=p-b.pos) to both bodies: A -= J/mA,
 * B += J/mB linearly, and the matching angular change via I^-1(r x J) in each body's own frame. Shared by both
 * the normal impulse and the friction impulse below -- same application, different direction/magnitude. */
function applyImpulse(a, b, rA, rB, J) {
    const velA2 = sub3(a.vel, scale3(J, 1 / a.mass)), velB2 = add3(b.vel, scale3(J, 1 / b.mass));
    const JbodyA = worldToBody(a.q, scale3(J, -1)), JbodyB = worldToBody(b.q, J);
    const rBodyA = worldToBody(a.q, rA), rBodyB = worldToBody(b.q, rB);
    const dwBody = (I, rBody, Jbody) => { const t = cross3(rBody, Jbody); return [t[0] / I[0], t[1] / I[1], t[2] / I[2]]; };
    const wA2 = add3(a.w, dwBody(a.I, rBodyA, JbodyA)), wB2 = add3(b.w, dwBody(b.I, rBodyB, JbodyB));
    return { a: { ...a, vel: velA2, w: wA2 }, b: { ...b, vel: velB2, w: wB2 } };
}

/** Contact-point relative velocity, B relative to A (world frame): vpB - vpA, each point velocity being
 * vel + w_world x r. Positive along `n` (A->B) means separating; negative means approaching. */
function contactPointVelocity(a, b, rA, rB) {
    const wAworld = rotateByQuat(a.q, a.w), wBworld = rotateByQuat(b.q, b.w);
    const vpA = add3(a.vel, cross3(wAworld, rA)), vpB = add3(b.vel, cross3(wBworld, rB));
    return sub3(vpB, vpA);
}

/**
 * Resolve one contact between two rigidBody6dof bodies. `contact` = {point, normal} (normal points A->B).
 * Returns {j, jt, a, b} -- j is the NORMAL impulse magnitude actually applied (0 if the pair was already
 * separating along the normal), jt is the TANGENTIAL (friction) impulse magnitude actually applied (0 if there
 * was no sliding at the contact point, or `opts.friction` is <= 0 -- see this file's header on the Coulomb model);
 * a/b are NEW body states (mass/I/pos/q unchanged, vel/w updated). Does not mutate its inputs. ASSUMES mass > 0
 * for both bodies (1/mass appears directly in K below) -- an explicit mass:0 divides by zero and poisons that
 * body's velocity with NaN, same as it would in F=ma itself; not guarded here, matching how rigidBody6dof.mjs's
 * own createBody()/boxInertia() never validate a non-physical mass either. WHEN EXACTLY ONE BODY HAS mass:0 (the
 * only shape any caller in this tree actually constructs, and the only one this file's own gate exercises), THE
 * NAN STAYS CONTAINED TO THAT ONE DEGENERATE BODY, not spread to its otherwise-healthy partner -- an adversarial
 * review found the friction code below originally DID spread it (NaN fails every ordinary `< eps` comparison, so
 * a naive slideSpeed<eps guard let a NaN-poisoned slideSpeed fall through into the friction math and poison the
 * healthy body too, ON BY DEFAULT since mu defaults nonzero); fixed with a guard that catches both "too small"
 * and NaN, see below. THE SAME SINGLE-DEGENERATE-BODY CONTAINMENT HOLDS ACROSS A SEQUENTIAL resolveManifold()
 * LOOP TOO (added this round, see its own gate section 9d) -- a SECOND call on a pair where one body's velocity
 * is already NaN from a PRIOR call would, without the `!(vn <= 0)` guard below, compute a NaN normal impulse `j`
 * (not the usual finite-or-zero value) and spread it to the otherwise-healthy body via the shared impulse vector,
 * the exact same class of widened blast radius the friction guard above already closes for a single call, but
 * across multiple ones. IF BOTH BODIES PASSED IN HAVE mass:0, BOTH GET POISONED, even on a single call -- a
 * SEPARATE adversarial review found this by hand-tracing the arithmetic: K = 1/0 + 1/0 + finite = Infinity, so
 * j = -(1+e)*vn/Infinity = 0 EXACTLY and J = n*0 = [0,0,0] (a genuinely zero impulse vector) -- but applyImpulse()
 * below then computes `scale3(J, 1/a.mass)` = `scale3([0,0,0], Infinity)`, and 0*Infinity is NaN in IEEE-754 for
 * every component, on BOTH sides at once. This does not contradict the single-degenerate-body claim above (that
 * case's J is also [0,0,0], but only ONE side's 1/mass is Infinity); it is a genuinely different, doubly-
 * degenerate input this file has never supported or guarded, not newly introduced or newly widened by this
 * round's `!(vn <= 0)` fix (which only prevents an ALREADY-poisoned body from poisoning a partner across
 * multiple calls, and does nothing for two bodies poisoning each other on their very first shared call). Flagged
 * here rather than fixed because no caller in this tree ever constructs a mass:0-vs-mass:0 pair.
 */
export function resolveCollision(a, b, contact, opts = {}) {
    const e = opts.restitution != null ? opts.restitution : 0.4;
    const mu = opts.friction != null ? opts.friction : 0.5;
    const { point: p, normal: n } = contact;
    const rA = sub3(p, a.pos), rB = sub3(p, b.pos);
    const vn = dot3(contactPointVelocity(a, b, rA, rB), n);
    // `!(vn <= 0)`, NOT `vn > 0` -- these are NOT equivalent when vn is NaN (a mass:0 body's velocity already
    // poisoned by a PRIOR call, the exact scenario resolveManifold()'s own sequential loop creates): `NaN > 0` is
    // FALSE, so the naive form falls through and computes K, j = -(1+e)*vn/K = NaN (not the usual finite-or-zero
    // value 1/mass=Infinity alone would have produced), and that NaN THEN SPREADS TO THE OTHERWISE-HEALTHY OTHER
    // BODY via the shared impulse vector J=n*j in applyImpulse() below -- found by resolveManifold()'s own gate
    // section 9d, the SAME class of widened blast radius the friction NaN-safe guard above already closes for a
    // single call (see this file's own JSDoc on resolveCollision()), but here across MULTIPLE sequential calls on
    // the same pair. `!(x <= 0)` is true for both "already separating" and NaN, so a body already poisoned by an
    // earlier manifold point makes every LATER point on that pair a genuine no-op (not a fresh source of NaN),
    // containing the damage to a single already-degenerate body across the WHOLE manifold, not just one call.
    if (!(vn <= 0)) return { j: 0, jt: 0, a, b };

    const K = effectiveInverseMass(a, b, rA, rB, n);
    const j = -(1 + e) * vn / K;
    const { a: a1, b: b1 } = applyImpulse(a, b, rA, rB, scale3(n, j));
    if (mu <= 0) return { j, jt: 0, a: a1, b: b1 };

    // FRICTION (Coulomb, sequential impulse -- see this file's header): recompute the contact-point relative
    // velocity AFTER the normal impulse, project OUT the (now non-positive) normal component to isolate
    // whatever tangential sliding remains, and apply an impulse that opposes it -- clamped to |jt| <= mu*j, the
    // Coulomb friction limit, so a low mu only PARTIALLY arrests sliding rather than always fully stopping it.
    const vAfterN = contactPointVelocity(a1, b1, rA, rB);
    const vTangent = sub3(vAfterN, scale3(n, dot3(vAfterN, n)));
    const slideSpeed = norm3(vTangent);
    // `!(slideSpeed >= 1e-9)`, NOT `slideSpeed < 1e-9` -- these are NOT equivalent when slideSpeed is NaN (an
    // already-unsupported mass:0 input poisoning a1/b1's velocity with NaN upstream): `NaN < 1e-9` is FALSE, so
    // the naive form falls through into the friction math below and, an adversarial review found, spreads that
    // NaN from the one degenerate body to the OTHERWISE-HEALTHY other body too (applyImpulse() splits any
    // impulse across both bodies) -- a real widening of this file's own already-documented, already-unguarded
    // mass:0 blast radius (previously contained to the one degenerate body; friction, on by default, undid
    // that). `!(x >= eps)` is true for both "too small" and NaN, closing it without adding a validation this
    // file has never done for mass:0 elsewhere.
    if (!(slideSpeed >= 1e-9)) return { j, jt: 0, a: a1, b: b1 };   // no sliding at the contact point -- nothing to oppose
    const t = scale3(vTangent, 1 / slideSpeed);
    const Kt = effectiveInverseMass(a1, b1, rA, rB, t);
    const jtRaw = -slideSpeed / Kt;              // <=0: same form as the normal impulse with e=0, driving slip to zero
    const jt = Math.max(jtRaw, -mu * j);          // Coulomb clamp: |jt| <= mu*j (both j and mu*j are >= 0 here)
    const { a: a2, b: b2 } = applyImpulse(a1, b1, rA, rB, scale3(t, jt));

    return { j, jt, a: a2, b: b2 };
}

/**
 * Resolve a FULL CONTACT MANIFOLD (up to 4 points, typically from physics/obbManifold.js's own obbManifold())
 * between two bodies -- a thin sequential-impulse wrapper around the unmodified resolveCollision() (see this
 * file's own header for why sequential/deepest-first, and why conservation still holds exactly). `points` is
 * Array<{point, normal, depth}> (obbManifold()'s own point shape -- the extra `depth` field is simply ignored by
 * resolveCollision(), which only reads `point`/`normal`); `opts` is passed through to EVERY resolveCollision()
 * call unchanged (same restitution/friction for the whole manifold, not per-point). Returns {totalImpulse,
 * totalTangentImpulse, a, b} -- the two impulse magnitudes summed across every point actually resolved (0 for a
 * point that was already separating, same as a single resolveCollision() call), and the FINAL body states after
 * every point in the manifold has been applied in sequence. `points.length === 0` returns the inputs unchanged
 * (0 impulse) rather than throwing -- defensive, since obbManifold() itself is documented to never return an
 * empty array for a hit:true contact, but this function does not assume its caller always passes that through.
 */
export function resolveManifold(a, b, points, opts = {}) {
    if (points.length === 0) return { totalImpulse: 0, totalTangentImpulse: 0, a, b };
    const ordered = points
        .map((p, i) => ({ p, i }))
        .sort((x, y) => y.p.depth - x.p.depth || x.i - y.i)
        .map((x) => x.p);
    let curA = a, curB = b, totalImpulse = 0, totalTangentImpulse = 0;
    for (const pt of ordered) {
        const { j, jt, a: a2, b: b2 } = resolveCollision(curA, curB, pt, opts);
        totalImpulse += j;
        totalTangentImpulse += jt;
        curA = a2;
        curB = b2;
    }
    return { totalImpulse, totalTangentImpulse, a: curA, b: curB };
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
    // a small +Y "sliding" component on `a` (on top of the head-on -X closing velocity) so this demo actually
    // exercises friction -- a purely head-on pair (the old demo) has zero tangential contact-point velocity, and
    // jt would silently read 0 even with friction wired in, which is a demo, not a proof, but still worth
    // showing something nonzero here rather than a coincidentally-degenerate case.
    const a = createBody({ mass: 8, I, pos: [-0.8, 0, 0], vel: [3, 1.5, 0] });
    const b = createBody({ mass: 8, I, pos: [0.8, 0.3, 0], vel: [-2, 0, 0] });
    const c = checkContact(a, half, b, half);
    if (!c.hit) return ["[rigidBody6dofCollision] the two demo boxes do not touch at these positions/half-extents"];
    const cp = contactPoint(bodyOBB(a, half), bodyOBB(b, half), c.normal);
    const { j, jt, a: a2, b: b2 } = resolveCollision(a, b, { point: cp, normal: c.normal }, { restitution: 0.5, friction: 0.5 });
    const { a: a3, b: b3 } = positionalCorrection(a2, b2, c);
    const depthAfter = checkContact(a3, half, b3, half);
    return [
        "[rigidBody6dofCollision] obbOverlap.js's OBB contact test + a hand-derived impulse response (normal +",
        "                         Coulomb friction), both proven against closed-form and conservation-law checks",
        "                         in this file's own gate.",
        `  contact: normal ${c.normal.map((v) => v.toFixed(3))}  depth ${c.depth.toFixed(3)}  impulse j=${j.toFixed(3)}  friction jt=${jt.toFixed(3)}`,
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
