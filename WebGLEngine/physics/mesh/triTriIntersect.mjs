// WebGLEngine/physics/mesh/triTriIntersect.mjs
//
// *** ROUND 2 OF THE BVH-CSG ARC. *** tools/ship/nextRounds.mjs's "bvh-csg-speed-vs-manifold-tradeoff" entry
// scoped a from-scratch BVH-CSG port into three pieces: (a) the dual-BVH pairwise-overlap broad phase --
// DONE, physics/mesh/bvhPairOverlap.mjs -- (b) triangle-triangle intersection, THIS FILE, and (c) triangle
// clipping/inside-outside classification, not yet built. This module takes the candidate triangle PAIRS
// bvhPairOverlap.mjs's own pairOverlap() already finds (pairs whose AABBs merely overlap) and answers the
// actual geometric question: do these two specific triangles intersect, and if so, along what segment.
//
// THE ALGORITHM: Moller's 1997 triangle-triangle intersection test ("A Fast Triangle-Triangle Intersection
// Test") -- taken as STRUCTURE, not transcribed from any implementation: reject early if either triangle
// lies entirely on one side of the other's plane; otherwise the two triangles' planes intersect along a
// line L, and each triangle's own boundary crosses L in exactly two points (found by linearly interpolating
// along the two edges of whichever vertex sits alone on one side of the OTHER plane); project those four
// points onto L (via the coordinate axis L points most along, for numerical stability -- the standard trick,
// also used by mesh/meshBVH.mjs's own binned-SAH build for choosing a split axis) and check whether the two
// resulting 1D intervals overlap. They do exactly when the triangles intersect, and the overlapping
// sub-interval's own endpoints ARE two of the four already-computed 3D points (no further interpolation
// needed, since all four points already lie exactly on L by construction).
//
// SCOPE, STATED PLAINLY -- TWO CASES ARE DETECTED AND REPORTED status:'coplanar'/'degenerate' RATHER THAN
// RESOLVED, on purpose, not attempted in this round:
//   COPLANAR -- both triangles lying in (near enough) the same plane. Moller's own paper treats this as a
//   separate case needing a 2D polygon-overlap test, not an extension of the 3D algorithm; deferred to
//   whichever round needs it (likely round 3, triangle clipping, which needs 2D machinery anyway).
//   DEGENERATE -- any single vertex of either triangle lying (near-)exactly on the OTHER triangle's plane.
//   Found by this round's OWN scratch-testing before this file was written, not merely reasoned about: a
//   shared edge (two full vertices in common) and a single vertex touching the other plane both broke the
//   naive "isolated vertex" branch selection -- one silently returned "no intersection" for a real one, the
//   other produced a NaN endpoint from a near-zero-divided-by-near-zero interpolation. Rather than chase a
//   fully general, always-robust formulation in this round (the SAME numerical-precision territory the
//   entry's own header names as the reason a robust triangle-triangle intersection is genuinely hard, not
//   incidental), any vertex within EPS of the other plane makes this function report the pair unresolved.
//   This means CSG operands that share exact geometry along a cut boundary -- a repeated cut through the
//   same wall, a mesh authored with coincident seams -- will not get a resolved segment from THIS function
//   for that specific triangle pair; a future round needs to handle it (perturbation, exact predicates, or a
//   dedicated coincident-boundary path), named here rather than silently risking a wrong answer today.
//   [BVH-CSG ROUND 12: that path is physics/mesh/triContact.mjs, which triArrangement.mjs asks about exactly the
//   pairs this function reports coplanar or degenerate. This function is unchanged.]
//
// WHAT THIS DOES NOT DO: build on physics/mesh/bvhPairOverlap.mjs at all (it operates on an EXPLICIT pair of
// triangle indices, one per caller-supplied buffer -- wiring pairOverlap()'s own candidate list into this
// function is integration, not this round's own scope); clip either triangle along the segment it finds;
// classify anything as inside or outside; or handle more than two triangles at once. It also inherits
// bvhPairOverlap.mjs's own precondition, unstated here until an adversarial review of this round asked
// whether the two functions' own assumptions actually line up for that future integration: trisA and trisB
// must already share ONE coordinate frame -- no relative transform is applied, exactly the same constraint
// bvhPairOverlap.mjs's own header names for the same reason.
//
// *** BVH-CSG ROUND 16: A SEAM CROSSING IS A FUNCTION OF (EDGE, PLANE) ALONE. *** Where the seam crosses an edge two
// triangles share, both pairs compute the crossing. It was interpolated from whichever end of the edge sat alone on its
// side of the other plane, and the normals were scaled by a reciprocal where triContact.mjs divides -- so two pairs, or
// this file and triContact, put one crossing in two places: measured with round 15's file, 691 of 1,838 random shared-edge
// configurations disagreed (this file's gate, ROUND 16 section), and round 14's finishing weld moved 12,376 vertices by
// an ULP on the page's 99 chains. The crossing is now triContact's edgeCross, the edge in canonical order, with the
// normals divided: 1,838 of 1,838 identical, and the weld's ULP moves 12,376 -> 711.
"use strict";

import { edgeCross } from "./triContact.mjs";

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

// Which vertex sits alone on one side of the OTHER plane (classic Moller branching: the pairwise-product
// tests find the vertex whose sign differs from at least one of the others without needing a special case
// per vertex), and the two 3D points where ITS two edges cross that plane (linear interpolation to d=0).
function computeInterval(p0, p1, p2, d0, d1, d2, axis) {
    let iso, o1, o2, diso, do1, do2;
    if (d0 * d1 > 0) { iso = p2; o1 = p0; o2 = p1; diso = d2; do1 = d0; do2 = d1; }
    else if (d0 * d2 > 0) { iso = p1; o1 = p0; o2 = p2; diso = d1; do1 = d0; do2 = d2; }
    else { iso = p0; o1 = p1; o2 = p2; diso = d0; do1 = d1; do2 = d2; }
    // BVH-CSG ROUND 16: the crossing of an edge with the other plane is triContact.mjs's edgeCross -- the edge taken in
    // canonical order -- so it is a function of (edge, plane) alone: every pair that shares the edge, through either
    // file, gets the same point bit for bit (it was interpolated from whichever end sat alone, an ULP apart)
    const Pa = edgeCross(iso, o1, diso, do1);
    const Pb = edgeCross(iso, o2, diso, do2);
    return { Pa, Pb, ta: Pa[axis], tb: Pb[axis] };
}

/**
 * Does triangle triA (in trisA) intersect triangle triB (in trisB), and if so, along what segment.
 *
 * @param {Float64Array|Float32Array} trisA  flat 9-floats-per-triangle buffer (mesh/meshBVH.mjs's own layout)
 * @param {number} triA  triangle index into trisA
 * @param {Float64Array|Float32Array} trisB
 * @param {number} triB  triangle index into trisB
 * @returns one of:
 *   { status: "intersect", p0: [x,y,z], p1: [x,y,z] }  -- the intersection segment's two endpoints
 *   { status: "none" }                                  -- the triangles do not intersect
 *   { status: "coplanar" }                               -- planes parallel (possibly the same plane); UNRESOLVED
 *   { status: "degenerate" }                             -- a vertex sits on/near the other plane; UNRESOLVED
 */
export function triTriIntersect(trisA, triA, trisB, triB) {
    const [v0, v1, v2] = readTri(trisA, triA);
    const [u0, u1, u2] = readTri(trisB, triB);

    // NORMALIZED to unit length before use, on purpose -- an adversarial review of this round's own first
    // draft found (and verified by direct execution, not just reasoning) that raw, un-normalized cross-
    // product normals make every threshold below SCALE-DEPENDENT: |n1|/|n2| scale as (edge length)^2, so
    // du/dv (dot(n, vertex)) scale the same way, and cross(n1,n2) scales as (edge length)^4 -- a fixed
    // absolute cutoff on that quantity corresponds to a dihedral-angle sensitivity that swings by many
    // orders of magnitude with triangle size. Measured concretely: the SAME shape and SAME 30-degree
    // dihedral angle resolved correctly as "intersect" at 4cm-edge scale and misreported "coplanar" at
    // 4mm-edge scale (10x smaller) -- and this tree's own physics/mesh/meshCSG.mjs already documents
    // millimeter-scale meshes as a real, expected regime, not a hypothetical one. Normalizing makes du/dv
    // true GEOMETRIC distances (world units, independent of triangle size) and turns cross(n1,n2) directly
    // into sin(dihedral angle) times an axis -- a properly scale-invariant test.
    const e1 = sub(v1, v0), e2 = sub(v2, v0);
    let n1 = cross(e1, e2);
    const n1len = Math.hypot(n1[0], n1[1], n1[2]);
    if (n1len < 1e-300) return { status: "degenerate" };   // triangle A itself has ~zero area
    n1 = [n1[0] / n1len, n1[1] / n1len, n1[2] / n1len];   // round 16: as triContact.mjs's planeDists divides
    const d1c = -dot(n1, v0);
    let du0 = dot(n1, u0) + d1c, du1 = dot(n1, u1) + d1c, du2 = dot(n1, u2) + d1c;
    if (Math.abs(du0) < EPS) du0 = 0;
    if (Math.abs(du1) < EPS) du1 = 0;
    if (Math.abs(du2) < EPS) du2 = 0;
    if (du0 !== 0 && du1 !== 0 && du2 !== 0 && Math.sign(du0) === Math.sign(du1) && Math.sign(du1) === Math.sign(du2))
        return { status: "none" };

    const f1 = sub(u1, u0), f2 = sub(u2, u0);
    let n2 = cross(f1, f2);
    const n2len = Math.hypot(n2[0], n2[1], n2[2]);
    if (n2len < 1e-300) return { status: "degenerate" };   // triangle B itself has ~zero area
    n2 = [n2[0] / n2len, n2[1] / n2len, n2[2] / n2len];
    const d2c = -dot(n2, u0);
    let dv0 = dot(n2, v0) + d2c, dv1 = dot(n2, v1) + d2c, dv2 = dot(n2, v2) + d2c;
    if (Math.abs(dv0) < EPS) dv0 = 0;
    if (Math.abs(dv1) < EPS) dv1 = 0;
    if (Math.abs(dv2) < EPS) dv2 = 0;
    if (dv0 !== 0 && dv1 !== 0 && dv2 !== 0 && Math.sign(dv0) === Math.sign(dv1) && Math.sign(dv1) === Math.sign(dv2))
        return { status: "none" };

    // n1,n2 both unit length now, so |D| = sin(dihedral angle) exactly -- the 1e-9 threshold below is a
    // genuine, scale-invariant angular tolerance (~1e-9 radians from parallel), not a length-scaled one.
    const D = cross(n1, n2);
    if (dot(D, D) < 1e-18) return { status: "coplanar" };

    if (du0 === 0 || du1 === 0 || du2 === 0 || dv0 === 0 || dv1 === 0 || dv2 === 0)
        return { status: "degenerate" };

    let axis = 0, maxc = Math.abs(D[0]);
    if (Math.abs(D[1]) > maxc) { axis = 1; maxc = Math.abs(D[1]); }
    if (Math.abs(D[2]) > maxc) { axis = 2; maxc = Math.abs(D[2]); }

    const i1 = computeInterval(v0, v1, v2, dv0, dv1, dv2, axis);
    const i2 = computeInterval(u0, u1, u2, du0, du1, du2, axis);

    const [t1min, t1max, P1min, P1max] = i1.ta <= i1.tb ? [i1.ta, i1.tb, i1.Pa, i1.Pb] : [i1.tb, i1.ta, i1.Pb, i1.Pa];
    const [t2min, t2max, P2min, P2max] = i2.ta <= i2.tb ? [i2.ta, i2.tb, i2.Pa, i2.Pb] : [i2.tb, i2.ta, i2.Pb, i2.Pa];

    if (t1max < t2min || t2max < t1min) return { status: "none" };

    const lo = t1min >= t2min ? { t: t1min, P: P1min } : { t: t2min, P: P2min };
    const hi = t1max <= t2max ? { t: t1max, P: P1max } : { t: t2max, P: P2max };
    return { status: "intersect", p0: lo.P, p1: hi.P };
}

// ---- BVH-CSG ROUND 16b: THE SAME QUESTION, DECIDED EXACTLY --------------------------------------------------------
// Guigue & Devillers ("Fast and Robust Triangle-Triangle Overlap Test Using Orientation Predicates", 2003): every
// decision -- does either triangle lie wholly to one side of the other's plane, which vertex is alone, do the two
// intervals on the planes' common line overlap, and which crossings bound the segment -- is the sign of orient3d of
// four INPUT points, computed exactly (exactPredicates.mjs). So two pairs that share an edge cannot decide it two ways.
// No EPS anywhere: a pair is "coplanar" only when every vertex lies exactly on the other's plane. The segment's ends are
// still constructed in floating point, as triContact's canonical edgeCross of the edge with the other plane, from the
// raw (unsnapped) distances -- a function of (edge, plane) alone, the same bits in every pair that asks.
import { orient3d } from "./exactPredicates.mjs";

function rawDist(T, p) {
    const n = cross(sub(T[1], T[0]), sub(T[2], T[0])), L = Math.hypot(n[0], n[1], n[2]);
    const m = [n[0] / L, n[1] / L, n[2] / L];
    return dot(m, p) + -dot(m, T[0]);
}
// the crossing of edge (a, b) with the plane of triangle T
function crossing(a, b, T) {
    const da = rawDist(T, a), db = rawDist(T, b);
    if (da === db) return cmpPt(a, b) <= 0 ? a.slice() : b.slice();   // both on the plane to rounding: an end
    const p = edgeCross(a, b, da, db);
    return p;
}
const cmpPt = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// p1 is alone on its side of triangle 2's plane, and triangle 2 is ordered so the tests below read one way. T1 and T2
// are the triangles in their STORED vertex order: a crossing's plane is computed from them, never from a permutation,
// so it is the same plane -- to the bit -- in every pair
function construct(p1, q1, r1, p2, q2, r2, T1, T2) {
    if (orient3d(q1, r2, p2, p1) > 0) {
        if (orient3d(r1, r2, p2, p1) <= 0) {
            if (orient3d(r1, q2, p2, p1) > 0) return { status: "intersect", p0: crossing(p1, r1, T2), p1: crossing(p2, r2, T1) };
            return { status: "intersect", p0: crossing(p2, q2, T1), p1: crossing(p2, r2, T1) };
        }
        return { status: "none" };
    }
    if (orient3d(q1, q2, p2, p1) < 0) return { status: "none" };
    if (orient3d(r1, q2, p2, p1) >= 0) return { status: "intersect", p0: crossing(p1, q1, T2), p1: crossing(p1, r1, T2) };
    return { status: "intersect", p0: crossing(p1, q1, T2), p1: crossing(p2, q2, T1) };
}
function inter(p1, q1, r1, p2, q2, r2, dp2, dq2, dr2, T1, T2) {
    if (dp2 > 0) {
        if (dq2 > 0) return construct(p1, r1, q1, r2, p2, q2, T1, T2);
        if (dr2 > 0) return construct(p1, r1, q1, q2, r2, p2, T1, T2);
        return construct(p1, q1, r1, p2, q2, r2, T1, T2);
    }
    if (dp2 < 0) {
        if (dq2 < 0) return construct(p1, q1, r1, r2, p2, q2, T1, T2);
        if (dr2 < 0) return construct(p1, q1, r1, q2, r2, p2, T1, T2);
        return construct(p1, r1, q1, p2, q2, r2, T1, T2);
    }
    if (dq2 < 0) return dr2 >= 0 ? construct(p1, r1, q1, q2, r2, p2, T1, T2) : construct(p1, q1, r1, p2, q2, r2, T1, T2);
    if (dq2 > 0) return dr2 > 0 ? construct(p1, r1, q1, p2, q2, r2, T1, T2) : construct(p1, q1, r1, q2, r2, p2, T1, T2);
    if (dr2 > 0) return construct(p1, q1, r1, r2, p2, q2, T1, T2);
    if (dr2 < 0) return construct(p1, r1, q1, r2, p2, q2, T1, T2);
    return { status: "coplanar" };
}

/** triTriIntersect's contract, decided by exact orientation predicates: "intersect" | "none" | "coplanar". */
export function triTriIntersectExact(trisA, triA, trisB, triB) {
    const T1 = readTri(trisA, triA), T2 = readTri(trisB, triB);
    const [p1, q1, r1] = T1, [p2, q2, r2] = T2;
    // the side of each vertex as Guigue & Devillers read it, dot(v - r2, N2): positive where the normal points -- the
    // opposite of Shewchuk's orient3d convention, hence the minus
    const dp1 = -orient3d(p2, q2, r2, p1), dq1 = -orient3d(p2, q2, r2, q1), dr1 = -orient3d(p2, q2, r2, r1);
    if (dp1 * dq1 > 0 && dp1 * dr1 > 0) return { status: "none" };
    const dp2 = -orient3d(p1, q1, r1, p2), dq2 = -orient3d(p1, q1, r1, q2), dr2 = -orient3d(p1, q1, r1, r2);
    if (dp2 * dq2 > 0 && dp2 * dr2 > 0) return { status: "none" };
    if (dp1 > 0) {
        if (dq1 > 0) return inter(r1, p1, q1, p2, r2, q2, dp2, dr2, dq2, T1, T2);
        if (dr1 > 0) return inter(q1, r1, p1, p2, r2, q2, dp2, dr2, dq2, T1, T2);
        return inter(p1, q1, r1, p2, q2, r2, dp2, dq2, dr2, T1, T2);
    }
    if (dp1 < 0) {
        if (dq1 < 0) return inter(r1, p1, q1, p2, q2, r2, dp2, dq2, dr2, T1, T2);
        if (dr1 < 0) return inter(q1, r1, p1, p2, q2, r2, dp2, dq2, dr2, T1, T2);
        return inter(p1, q1, r1, p2, r2, q2, dp2, dr2, dq2, T1, T2);
    }
    if (dq1 < 0) return dr1 >= 0 ? inter(q1, r1, p1, p2, r2, q2, dp2, dr2, dq2, T1, T2) : inter(p1, q1, r1, p2, q2, r2, dp2, dq2, dr2, T1, T2);
    if (dq1 > 0) return dr1 > 0 ? inter(p1, q1, r1, p2, r2, q2, dp2, dr2, dq2, T1, T2) : inter(q1, r1, p1, p2, q2, r2, dp2, dq2, dr2, T1, T2);
    if (dr1 > 0) return inter(r1, p1, q1, p2, q2, r2, dp2, dq2, dr2, T1, T2);
    if (dr1 < 0) return inter(r1, p1, q1, p2, r2, q2, dp2, dr2, dq2, T1, T2);
    return { status: "coplanar" };
}
