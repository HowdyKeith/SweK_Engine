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
//
// WHAT THIS DOES NOT DO: build on physics/mesh/bvhPairOverlap.mjs at all (it operates on an EXPLICIT pair of
// triangle indices, one per caller-supplied buffer -- wiring pairOverlap()'s own candidate list into this
// function is integration, not this round's own scope); clip either triangle along the segment it finds;
// classify anything as inside or outside; or handle more than two triangles at once. It also inherits
// bvhPairOverlap.mjs's own precondition, unstated here until an adversarial review of this round asked
// whether the two functions' own assumptions actually line up for that future integration: trisA and trisB
// must already share ONE coordinate frame -- no relative transform is applied, exactly the same constraint
// bvhPairOverlap.mjs's own header names for the same reason.
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

// Which vertex sits alone on one side of the OTHER plane (classic Moller branching: the pairwise-product
// tests find the vertex whose sign differs from at least one of the others without needing a special case
// per vertex), and the two 3D points where ITS two edges cross that plane (linear interpolation to d=0).
function computeInterval(p0, p1, p2, d0, d1, d2, axis) {
    let iso, o1, o2, diso, do1, do2;
    if (d0 * d1 > 0) { iso = p2; o1 = p0; o2 = p1; diso = d2; do1 = d0; do2 = d1; }
    else if (d0 * d2 > 0) { iso = p1; o1 = p0; o2 = p2; diso = d1; do1 = d0; do2 = d2; }
    else { iso = p0; o1 = p1; o2 = p2; diso = d0; do1 = d1; do2 = d2; }
    const Pa = add(iso, scale(sub(o1, iso), diso / (diso - do1)));
    const Pb = add(iso, scale(sub(o2, iso), diso / (diso - do2)));
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
    n1 = scale(n1, 1 / n1len);
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
    n2 = scale(n2, 1 / n2len);
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
