// WebGLEngine/physics/mesh/triClip.mjs
//
// *** ROUND 3 OF THE BVH-CSG ARC. *** tools/ship/nextRounds.mjs's "bvh-csg-speed-vs-manifold-tradeoff" entry
// scoped a from-scratch BVH-CSG port into three pieces: (a) the dual-BVH pairwise-overlap broad phase --
// DONE, physics/mesh/bvhPairOverlap.mjs -- (b) triangle-triangle intersection -- DONE,
// physics/mesh/triTriIntersect.mjs -- and (c) triangle clipping / inside-outside classification, THIS FILE
// (clipping only; inside/outside classification per fragment is round 4, not yet built). This is the
// standard, robust CSG primitive: split ONE triangle into "front" and "back" sub-triangle fans against a
// cutting PLANE (conceptually the OTHER triangle's own plane, the same relationship
// physics/mesh/meshCSG.mjs's own BSP-based splitPolygon() has to its tree's cutting planes -- but this
// module clips a single triangle against a single plane, not a full polygon against a full BSP tree).
//
// THE ALGORITHM: classic "clip triangle against plane" -- reject early (status allFront/allBack) if all
// three vertices share one sign of signed distance; otherwise exactly one vertex sits alone on one side (the
// SAME "isolated vertex" identification triTriIntersect.mjs's own computeInterval() uses, since both problems
// reduce to "which single vertex differs in sign, and where do its two edges cross the plane" -- reused here
// as the same three-way d0*d1>0 / d0*d2>0 / else branching, NOT reused as shared code, since triTriIntersect's
// computeInterval() returns only the two crossing points for an interval-overlap test, while this needs the
// isolated vertex's own identity too, to build the sub-triangle fan). The isolated vertex's own small corner
// triangle is 1 sub-triangle; the remaining quadrilateral (the other two original vertices plus the two
// crossing points) is fanned into 2 more, for 3 sub-triangles total, split into "front" (positive side) and
// "back" (negative side) groups by the isolated vertex's own sign.
//
// A REAL BUG FOUND BY THIS ROUND'S OWN RANDOMIZED STRESS TEST, NOT BY REASONING -- STATED PLAINLY BECAUSE IT
// WOULD HAVE SHIPPED SILENTLY WRONG OTHERWISE: a first draft used ONE FIXED vertex order for the isolated
// vertex's own corner triangle and for the quadrilateral's fan, across all three "which vertex is isolated"
// branches. That happened to produce the CORRECT winding for the one hand-derived case this file's own gate
// uses (which exercises the middle branch, isolated vertex = p1) -- but a 200-case randomized stress test
// checking every sub-triangle's normal against the ORIGINAL triangle's own normal (not just area
// conservation, which the broken draft still passed) found every single "isolated vertex = p1" case with a
// COMPLETELY INVERTED normal (dot = -1.000 exactly, not a marginal numerical issue) once the fixed vertex
// order was corrected for the OTHER two branches first (an earlier, even-more-broken draft had all three
// branches wrong). The reason: whether the isolated vertex sits BETWEEN the other two vertices in the
// original triangle's own cyclic boundary order (p0->p1->p2->p0), true only when p1 is isolated, or ADJACENT
// to the wrap point (p0 or p2 isolated) changes which fan order keeps the boundary traversal consistent.
// Fixed by branching both the quadrilateral's fan order AND the isolated vertex's own corner-triangle order
// on this same isoMiddle distinction. Re-verified against 2000+ randomized cases (two independent seeds)
// checking area conservation, normal-direction consistency, AND an independent point-in-original-triangle
// barycentric oracle for every sub-triangle vertex -- see triClip-selfcheck.mjs.
//
// SCOPE: operates on an explicit triangle (from a caller-supplied buffer) and an explicit plane (either
// supplied directly as a normal + offset of ANY nonzero length, or derived from another triangle via
// clipTriangleByTriPlane()). Does not consult physics/mesh/bvhPairOverlap.mjs or physics/mesh/triTriIntersect.mjs
// directly (wiring their outputs into this function's inputs is integration, a future round's scope, not this
// one's). Does not classify the resulting sub-triangles as inside/outside a SECOND mesh (round 4). Inherits
// the same shared-coordinate-frame precondition as both earlier rounds: no relative transform is applied.
//
// A SECOND REAL GAP, FOUND BY AN ADVERSARIAL REVIEW OF THIS ROUND'S ORIGINAL DIFF AND FIXED: the original
// clipTriangleByPlane() required its own n parameter to already be unit length, stated only in a JSDoc
// comment, unenforced at runtime -- unlike trianglePlane()/clipTriangleByTriPlane(), which already normalized
// internally. The reviewer demonstrated this reproduces round 2's own previously-shipped HIGH-severity bug
// class (an un-normalized normal makes the EPS threshold below scale-dependent, silently misclassifying a
// vertex). Fixed by normalizing n (and rescaling d to match) defensively inside clipTriangleByPlane() itself,
// the same way trianglePlane() already did -- so there is no longer a caller contract to violate.
//
// A THIRD GAP, FOUND BY THE SAME REVIEW, NAMED HONESTLY RATHER THAN FIXED THIS ROUND: EPS=1e-9 is an absolute
// threshold on dot(n,p)+d (a true geometric distance now that n is always normalized). A vertex whose distance
// clears EPS by even a small margin (say 1.5e-9, or 1e-8) is treated as fully resolvable, but the isolated
// vertex's OWN distance appears in the interpolation fraction diso/(diso-do) -- when that distance is tiny
// relative to the triangle's own scale, the resulting crossing points land extremely close to the isolated
// vertex, producing a "clipped" result whose isoTri (and sometimes a quad fan triangle) is a near-zero-area
// sliver. This is NOT the same failure as the large-world-coordinate EPS-scaling caveat triTriIntersect.mjs's
// own gate already documents (that one is about vertex COORDINATE magnitude at extreme world scale; this one
// happens at completely ordinary, small-scale coordinates whenever a vertex merely sits close to the cutting
// plane). None of triClip-selfcheck.mjs's own oracles catch it -- area conservation, winding, and containment
// are all satisfied by a genuinely tiny but real triangle. A real fix would need either a relative (not
// absolute) degenerate threshold tied to the triangle's own edge lengths, or a minimum-output-area check with
// its own resolution strategy (merge the sliver into its neighbor? report it separately?) -- neither designed
// or attempted here. A future round or caller that assumes every "clipped" sub-triangle is well-conditioned
// mesh geometry should know this is not guaranteed.
"use strict";

const EPS = 1e-9;

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function readTri(tris, t) {
    const o = t * 9;
    return [
        [tris[o], tris[o + 1], tris[o + 2]],
        [tris[o + 3], tris[o + 4], tris[o + 5]],
        [tris[o + 6], tris[o + 7], tris[o + 8]],
    ];
}

/**
 * The unit-normal-form plane a triangle lies in: dot(n, p) + d is the signed distance from point p to the
 * plane, for a normal pointing in the triangle's own winding direction (cross(v1-v0, v2-v0), normalized).
 *
 * @param {Float64Array|Float32Array} tris  flat 9-floats-per-triangle buffer (mesh/meshBVH.mjs's own layout)
 * @param {number} tri  triangle index into tris
 * @returns {{n:number[], d:number}|null}  null if the triangle itself has ~zero area (no well-defined plane)
 */
export function trianglePlane(tris, tri) {
    const [v0, v1, v2] = readTri(tris, tri);
    const n = cross(sub(v1, v0), sub(v2, v0));
    const nlen = Math.hypot(n[0], n[1], n[2]);
    if (nlen < 1e-300) return null;
    const nu = scale(n, 1 / nlen);
    return { n: nu, d: -dot(nu, v0) };
}

/**
 * Split triangle `tri` (in `tris`) against the plane dot(n,p)+d. n does NOT need to already be unit length --
 * normalized defensively inside, on purpose: an adversarial review of this round found that an earlier draft
 * left this the CALLER's responsibility (documented in a JSDoc comment only, unenforced), which reproduces the
 * exact scale-dependence failure class triTriIntersect.mjs's own header names as a real, previously-shipped
 * HIGH-severity bug in round 2 of this arc (un-normalized normals make the EPS threshold below scale with
 * |n|, silently misclassifying a genuinely near-degenerate vertex as ordinary, or vice versa) -- except
 * triTriIntersect.mjs's own public entry point can never be handed a bad normal (it computes both planes'
 * normals internally), while this function's n parameter is caller-supplied and was NOT structurally
 * protected the same way. trianglePlane()/clipTriangleByTriPlane() already normalized internally before this
 * fix; this closes the gap for direct callers of clipTriangleByPlane() too, at the cost of one extra
 * Math.hypot() per call -- cheap relative to the interpolation work already being done.
 *
 * @param {Float64Array|Float32Array} tris
 * @param {number} tri
 * @param {number[]} n  plane normal, ANY nonzero length (normalized internally)
 * @param {number} d  plane offset (dot(nRaw,p)+d is the signed distance IN nRaw's OWN units before
 *   normalization -- d is rescaled together with n so dot(n,p)+d is a true geometric distance afterward)
 * @returns one of:
 *   { status: "allFront" }  -- the whole triangle is on the positive side (or exactly on the plane)
 *   { status: "allBack" }   -- the whole triangle is on the negative side
 *   { status: "degenerate" } -- a vertex sits exactly on the plane (within EPS), or n itself is ~zero length
 *                                (no well-defined plane); unresolved, same rationale as triTriIntersect.mjs's
 *                                own "degenerate" status
 *   { status: "clipped", front: [[p0,p1,p2],...], back: [[p0,p1,p2],...] }  -- 1-2 sub-triangles per side,
 *     each a fresh array of 3 fresh 3D points (not indices -- clipping creates new vertices on the cut plane)
 */
export function clipTriangleByPlane(tris, tri, nRaw, dRaw) {
    const nlen = Math.hypot(nRaw[0], nRaw[1], nRaw[2]);
    if (nlen < 1e-300) return { status: "degenerate" };   // no well-defined plane
    const n = scale(nRaw, 1 / nlen), d = dRaw / nlen;
    const [p0, p1, p2] = readTri(tris, tri);
    let d0 = dot(n, p0) + d, d1 = dot(n, p1) + d, d2 = dot(n, p2) + d;
    if (Math.abs(d0) < EPS) d0 = 0;
    if (Math.abs(d1) < EPS) d1 = 0;
    if (Math.abs(d2) < EPS) d2 = 0;
    if (d0 === 0 || d1 === 0 || d2 === 0) return { status: "degenerate" };

    const s0 = Math.sign(d0), s1 = Math.sign(d1), s2 = Math.sign(d2);
    if (s0 === s1 && s1 === s2) return { status: s0 > 0 ? "allFront" : "allBack" };

    // isoMiddle: true only when the isolated vertex is p1 -- the one case where it sits BETWEEN the other two
    // in the original triangle's own cyclic boundary order (p0->p1->p2->p0). p0 and p2 isolated both sit
    // ADJACENT to the wrap point instead. The winding-preserving fan order for the far-side quadrilateral (and
    // for the isolated vertex's own corner triangle) differs between these two shapes -- see this file's own
    // header for how a randomized stress test caught a first draft that used one fixed order for all three.
    let iso, o1, o2, diso, do1, do2, isoMiddle;
    if (d0 * d1 > 0) { iso = p2; o1 = p0; o2 = p1; diso = d2; do1 = d0; do2 = d1; isoMiddle = false; }
    else if (d0 * d2 > 0) { iso = p1; o1 = p0; o2 = p2; diso = d1; do1 = d0; do2 = d2; isoMiddle = true; }
    else { iso = p0; o1 = p1; o2 = p2; diso = d0; do1 = d1; do2 = d2; isoMiddle = false; }

    const Pa = add(iso, scale(sub(o1, iso), diso / (diso - do1)));
    const Pb = add(iso, scale(sub(o2, iso), diso / (diso - do2)));

    const isoFront = diso > 0;
    const isoTri = isoMiddle ? [iso, Pb, Pa] : [iso, Pa, Pb];
    const quadTris = isoMiddle ? [[o1, Pa, Pb], [o1, Pb, o2]] : [[o1, o2, Pb], [o1, Pb, Pa]];

    const front = isoFront ? [isoTri] : [];
    const back = isoFront ? [] : [isoTri];
    if (isoFront) back.push(...quadTris); else front.push(...quadTris);
    return { status: "clipped", front, back };
}

/**
 * Convenience: clip `tri` (in `tris`) against the plane the OTHER triangle `planeTri` (in `planeTris`) lies
 * in -- the CSG-relevant case (splitting one triangle along another triangle's own cutting plane).
 *
 * @returns clipTriangleByPlane()'s own result shape, or { status: "degenerate" } if planeTri itself has
 *   ~zero area (no well-defined plane), same convention triTriIntersect.mjs uses for a zero-area input.
 */
export function clipTriangleByTriPlane(tris, tri, planeTris, planeTri) {
    const plane = trianglePlane(planeTris, planeTri);
    if (plane === null) return { status: "degenerate" };
    return clipTriangleByPlane(tris, tri, plane.n, plane.d);
}
