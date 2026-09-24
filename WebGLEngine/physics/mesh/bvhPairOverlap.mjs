// WebGLEngine/physics/mesh/bvhPairOverlap.mjs
//
// *** THE FIRST PIECE OF A BVH-ACCELERATED CSG PATH, BUILT ON mesh/meshBVH.mjs's EXISTING STRUCTURE. ***
// tools/ship/nextRounds.mjs's own "bvh-csg-speed-vs-manifold-tradeoff" entry names physics/mesh/meshCSG.mjs's
// measured weakness (a BSP recursive split-and-classify boolean, superlinear on repeated cuts -- shot 1 costs
// 12.7ms, shot 12 costs 318.8ms on one wall) and gkjohnson/three-bvh-csg as the candidate answer: two BVHs
// (one per operand mesh) walked together to find the much smaller set of triangle pairs that can possibly
// intersect, rather than recursively splitting one mesh's whole polygon list against the other's half-spaces.
//
// This file is that broad phase, and ONLY that broad phase. mesh/meshBVH.mjs's own header states its design
// rule plainly: "a single 'raycast' would have been the wrong unification: one KERNEL, several QUERIES" --
// raycastFirst, intersectsSegment and trianglesInBox are three queries over ONE tree. This is a FOURTH query,
// but over TWO trees at once, which is why it lives in its own file rather than as a fourth method on
// MeshBVH: every existing query takes `this` plus a point/box/segment, and a dual-tree traversal genuinely
// needs two full BVH instances as peers, not a tree plus a primitive. Kept OUT of mesh/meshBVH.mjs itself so
// that file -- raycast-relied-on by wadLevelHost.js, krbnCompare.js, capsuleCollide.mjs, terrainWalk.mjs's
// mesh ground oracle, colliderFromGLB.mjs and more -- carries zero new surface area from this round; this
// module only READS a MeshBVH instance's already-public shape (bounds/meta/tris/order/count), the same
// "take the structure, not the code" rule physics/character/capsuleCollide.mjs's own header states it
// followed for a different port (hh-hang/three-player-controller) built on this exact same file.
//
// THE ALGORITHM: a standard dual-tree traversal (Bullet's/PhysX's broadphase and gkjohnson's own bvhcast use
// the same shape). Starting at both roots, prune any node PAIR whose boxes don't overlap -- conservative, the
// same rule trianglesInBox already states for its own single-tree box query ("a false positive costs a
// wasted split, a false negative silently leaves solid geometry where a hole should be"). When one side is a
// leaf and the other is not, split the interior side. When BOTH are leaves, do the actual triangle-AABB-vs-
// triangle-AABB narrow test on every pair in the two (small, maxLeaf-bounded) leaves and emit the ones that
// truly overlap. When both are interior, split whichever node has the LARGER box surface area -- the
// standard heuristic for balancing a dual-tree walk (splitting the smaller side first tends to re-test the
// same large box against many small ones before it shrinks).
//
// WHAT THIS DOES NOT DO, NAMED PLAINLY: it does not compute the triangle-triangle INTERSECTION segment (only
// whether their AABBs overlap -- a conservative superset, the same relationship trianglesInBox has to actual
// triangle-vs-box intersection), it does not clip/split any triangle, and it does not classify anything as
// inside or outside the other solid. Those are the next two pieces a BVH-CSG boolean needs, and are NOT
// attempted here -- this round is scoped to the broad phase alone, gated to the same rigor the rest of this
// tree's BVH queries carry, before either of the harder, more failure-prone pieces (robust triangle-triangle
// clipping is a classic source of near-coplanar/near-degenerate numerical edge cases) is attempted on top of
// it. It also assumes both BVHs' triangle buffers already share ONE coordinate frame -- no relative transform
// is applied here, unlike physics/character/capsuleCollide.mjs's own convention of transforming a query
// into the collider's local space; a caller with two meshes in different local frames must pre-transform one
// mesh's triangle buffer into the other's frame before building its MeshBVH.
"use strict";

function triBounds(tris, t, out) {
    const o = t * 9;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let c = 0; c < 3; c++) {
        const x = tris[o + c * 3], y = tris[o + c * 3 + 1], z = tris[o + c * 3 + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    out[0] = x0; out[1] = y0; out[2] = z0; out[3] = x1; out[4] = y1; out[5] = z1;
}

function boxesOverlap(a, b) {
    return !(a[3] < b[0] || a[0] > b[3] || a[4] < b[1] || a[1] > b[4] || a[5] < b[2] || a[2] > b[5]);
}

function nodeBoxesOverlap(bvhA, na, bvhB, nb) {
    const oa = na * 6, ob = nb * 6;
    return !(bvhA.bounds[oa + 3] < bvhB.bounds[ob] || bvhA.bounds[oa] > bvhB.bounds[ob + 3] ||
              bvhA.bounds[oa + 4] < bvhB.bounds[ob + 1] || bvhA.bounds[oa + 1] > bvhB.bounds[ob + 4] ||
              bvhA.bounds[oa + 5] < bvhB.bounds[ob + 2] || bvhA.bounds[oa + 2] > bvhB.bounds[ob + 5]);
}

function boxArea(bvh, n) {
    const o = n * 6;
    const dx = bvh.bounds[o + 3] - bvh.bounds[o], dy = bvh.bounds[o + 4] - bvh.bounds[o + 1], dz = bvh.bounds[o + 5] - bvh.bounds[o + 2];
    return 2 * (dx * dy + dy * dz + dz * dx);
}

/**
 * Every pair of triangle INDICES (one from each tree) whose axis-aligned bounding boxes overlap.
 * Conservative on purpose, same rule as MeshBVH#trianglesInBox: can return a pair whose triangles do not
 * actually intersect, can never miss a pair that does. Returns [] immediately if either tree is empty.
 *
 * SELF-COMPARISON (bvhA === bvhB, or two instances over the same triangle data) is NOT a distinct case this
 * function special-cases -- it is not an infinite loop or a crash (MeshBVH's own node indices are assigned
 * strictly increasing before recursion, so na/nb always descend toward leaves regardless of which tree they
 * came from), but the result is NOISY for that use: every triangle is paired with itself ([t, t]), and every
 * genuine overlap between two DIFFERENT triangles of the one mesh is reported twice, as both [a, b] and
 * [b, a]. A future self-intersection caller wanting a clean answer needs to filter triA !== triB and dedupe
 * the two orderings itself; this function does not do either.
 *
 * @param {import("../../mesh/meshBVH.mjs").MeshBVH} bvhA
 * @param {import("../../mesh/meshBVH.mjs").MeshBVH} bvhB
 * @returns {number[][]} array of [triIndexA, triIndexB]
 */
export function pairOverlap(bvhA, bvhB) {
    const pairs = [];
    if (!bvhA.count || !bvhB.count) return pairs;
    const boxA = new Float64Array(6), boxB = new Float64Array(6);
    const stack = [0, 0];   // flat [na, nb, na, nb, ...] -- avoids one array alloc per push, matching
                             // MeshBVH#raycastFirst's own plain-number stack convention in the same file
    while (stack.length) {
        const nb = stack.pop(), na = stack.pop();
        if (!nodeBoxesOverlap(bvhA, na, bvhB, nb)) continue;
        const leftA = bvhA.meta[na * 3], leftB = bvhB.meta[nb * 3];
        const aLeaf = leftA < 0, bLeaf = leftB < 0;
        if (aLeaf && bLeaf) {
            const sa = bvhA.meta[na * 3 + 1], ca = bvhA.meta[na * 3 + 2];
            const sb = bvhB.meta[nb * 3 + 1], cb = bvhB.meta[nb * 3 + 2];
            for (let i = sa; i < sa + ca; i++) {
                const triA = bvhA.order[i];
                triBounds(bvhA.tris, triA, boxA);
                for (let j = sb; j < sb + cb; j++) {
                    const triB = bvhB.order[j];
                    triBounds(bvhB.tris, triB, boxB);
                    if (boxesOverlap(boxA, boxB)) pairs.push([triA, triB]);
                }
            }
        } else if (aLeaf) {
            stack.push(na, leftB, na, bvhB.meta[nb * 3 + 1]);
        } else if (bLeaf) {
            stack.push(leftA, nb, bvhA.meta[na * 3 + 1], nb);
        } else if (boxArea(bvhA, na) >= boxArea(bvhB, nb)) {
            stack.push(leftA, nb, bvhA.meta[na * 3 + 1], nb);
        } else {
            stack.push(na, leftB, na, bvhB.meta[nb * 3 + 1]);
        }
    }
    return pairs;
}
