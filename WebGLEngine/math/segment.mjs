// math/segment.mjs -- v4202
//
// DISTANCE FROM A POINT TO A LINE SEGMENT, in 2D and 3D. Inigo Quilez's sdSegment, which is one of the most
// reused primitives in all of signed-distance work, and the arithmetic is four lines.
//
// *** THIS TREE ALREADY HAD IT, IN 3D, PRIVATE, AND I REPORTED THAT IT DID NOT. ***
// Assessing positlabs/spark-liquefy I searched for `sdSegment` and `sdLine`, found nothing, and wrote down
// that the tree had "zero" of them. physics/soft/boneField.js has had `distToSegment` since it was written --
// unexported, 3D, and carrying the same comment about the clamp that the version below carries. The names
// were wrong, not the tree. A grep for the spelling I expected is not a search for the idea.
//
// So this exists to be the ONE copy before there are two: liquefy needs the 2D case, and writing a second
// implementation beside a working private one is exactly the shape v4165 removed for Ashima noise and v4199
// removed for stagger.
//
// *** THE CLAMP IS THE WHOLE THING. *** Without `t` clamped to [0,1] this measures distance to the INFINITE
// LINE through a and b, which is a completely different function that agrees with this one everywhere
// between the endpoints and disagrees everywhere else. boneField's own comment says what that costs there:
// "limbs that reach out of the room". A stroke stamped with the unclamped form paints an infinite streak
// across the whole field in the direction of the swipe.
"use strict";

/** Squared length below which a segment is treated as a point -- both endpoints coincide, so t is arbitrary. */
export const DEGENERATE = 1e-12;

/**
 * The parameter t along a->b of the closest point to p, clamped to the segment.
 *
 * Exposed separately because callers want it: a liquefy stroke fades along its length, and the fade needs to
 * know WHERE on the segment it landed, not just how far away.
 */
export function closestT2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (!(len2 > DEGENERATE)) return 0;
    const t = ((px - ax) * dx + (py - ay) * dy) / len2;
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Distance from (px,py) to the segment (ax,ay)->(bx,by). */
export function distToSegment2(px, py, ax, ay, bx, by) {
    const t = closestT2(px, py, ax, ay, bx, by);
    const ex = px - (ax + t * (bx - ax)), ey = py - (ay + t * (by - ay));
    return Math.sqrt(ex * ex + ey * ey);
}

/** The 3D case. Extracted verbatim from physics/soft/boneField.js, which now imports it. */
export function closestT3(px, py, pz, ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (!(len2 > DEGENERATE)) return 0;
    const t = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2;
    return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Distance from p to the segment a->b in 3D. */
export function distToSegment3(px, py, pz, ax, ay, az, bx, by, bz) {
    const t = closestT3(px, py, pz, ax, ay, az, bx, by, bz);
    const ex = px - (ax + t * (bx - ax)), ey = py - (ay + t * (by - ay)), ez = pz - (az + t * (bz - az));
    return Math.sqrt(ex * ex + ey * ey + ez * ez);
}

/**
 * Distance to the INFINITE LINE through a and b, in 2D.
 *
 * Not used by anything here, and present so the gate can show what the clamp buys: this and distToSegment2
 * agree exactly between the endpoints and diverge without bound beyond them. Naming the wrong function is the
 * cheapest way to make the right one checkable.
 */
export function distToLine2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    if (!(len2 > DEGENERATE)) return Math.hypot(px - ax, py - ay);
    const t = ((px - ax) * dx + (py - ay) * dy) / len2;      // deliberately NOT clamped
    const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
    return Math.sqrt(ex * ex + ey * ey);
}
