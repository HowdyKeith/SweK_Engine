// WebGLEngine/physics/spatial/agreement.mjs -- v2879
//
// FIVE ANSWERS TO THE SAME QUESTION, MADE TO MEET.
//
// This tree contains five independent spatial structures -- physics/broadPhase.js (AabbGrid), core/ecs/aabbTree.js
// (a BVH), physics/spatial/kdtree.js, physics/md/neighborGrid.js and physics/sph/spatialGrid.js. Each is gated,
// and every one of those gates checks it against ITS OWN brute force in isolation. Not one references another.
//
// KEITH'S QUESTION WAS WHY THEY NEVER MET, AND THE ANSWER IS NOT NEGLECT. They answer TWO DIFFERENT QUESTIONS
// wearing similar names:
//
//     POINT-AND-RADIUS  kdtree.withinRadius, neighborPairs(cutoff), SpatialGrid(h)   -- an L2 SPHERE test
//     BOX OVERLAP       AabbGrid, AABBTree                                           -- an L-infinity BOX test
//
// So a naive "they should all agree" would have been WRONG, and would have produced a gate that fails forever on
// correct code. The families genuinely disagree, and they disagree by a known amount.
//
// THE EXACT RELATION THAT LETS THEM MEET ANYWAY. Give every point an axis-aligned box of half-extent r/2. Two
// such boxes overlap exactly when the CHEBYSHEV distance is <= r, while the sphere test fires when the EUCLIDEAN
// distance is <= r. And since |d|_2 <= r implies |d|_inf <= r, always:
//
//     SPHERE PAIRS  is a SUBSET of  BOX PAIRS
//
// That is exact geometry, not a tolerance. It gives three tiers of key:
//   WITHIN the point family   all three must agree EXACTLY -- same question, same answer, no slack.
//   WITHIN the box family     both must agree EXACTLY on true overlaps.
//   ACROSS the families       box must be a strict SUPERSET, and in a random scene STRICTLY larger -- if the two
//                             ever came out equal, one of them would be computing the other's metric.
//
// That last line is the load-bearing negative. "They agree" is the failure here, not the success.
"use strict";
import { AabbGrid, aabbOverlap } from "../broadPhase.js";
import { build as kdBuild, withinRadius } from "./kdtree.js";
import { neighborPairs } from "../md/neighborGrid.js";
import { SpatialGrid } from "../sph/spatialGrid.js";
import AABBTree from "../../core/ecs/aabbTree.js";

/** Deterministic point cloud. A gate must pin an answer, not a distribution. */
export function scene(n, { seed = 12345, span = 10 } = {}) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([rnd() * span, rnd() * span, rnd() * span]);
    return pts;
}

const key = (i, j) => (i < j ? i + "|" + j : j + "|" + i);

// ---- the ground truth, both metrics ----------------------------------------------------------------------------
/** EUCLIDEAN: every pair within r. O(n^2), and it IS the answer by definition. */
export function bruteSphere(pts, r) {
    const out = new Set(), r2 = r * r;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1], dz = pts[i][2] - pts[j][2];
        if (dx * dx + dy * dy + dz * dz <= r2) out.add(key(i, j));
    }
    return out;
}

/** CHEBYSHEV: every pair whose boxes of half-extent r/2 overlap. Also O(n^2), also exact. */
export function bruteBox(pts, r) {
    const out = new Set(), h = r / 2;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        if (Math.abs(pts[i][0] - pts[j][0]) <= 2 * h &&
            Math.abs(pts[i][1] - pts[j][1]) <= 2 * h &&
            Math.abs(pts[i][2] - pts[j][2]) <= 2 * h) out.add(key(i, j));
    }
    return out;
}

// ---- the five, each asked the same question in its own dialect ----------------------------------------------------
export function viaKdTree(pts, r) {
    // ARRAYS, not objects: build() reads points[0].length to get the dimension, so a {x,y,z} object gives dim 0
    // and a degenerate tree that returns everything. My first adapter did exactly that and reported 1372 pairs
    // where the truth is 113 -- the tree was fine, the translation was not.
    const tree = kdBuild(pts.map((p) => [p[0], p[1], p[2]]), { leafSize: 8 });
    const out = new Set();
    pts.forEach((p, i) => {
        for (const hit of withinRadius(tree, [p[0], p[1], p[2]], r)) {
            if (hit.index !== i) out.add(key(i, hit.index));   // {index, point, dist2}, not {i}
        }
    });
    return out;
}

export function viaNeighborGrid(pts, r) {
    const flat = new Float64Array(pts.length * 3);
    pts.forEach((p, i) => { flat[i * 3] = p[0]; flat[i * 3 + 1] = p[1]; flat[i * 3 + 2] = p[2]; });
    const out = new Set();
    for (const [i, j] of neighborPairs(flat, pts.length, r)) out.add(key(i, j));
    return out;
}

export function viaSphGrid(pts, r) {
    // near() yields INDICES into the array handed to rebuild(), not the particle objects -- rebuild pushes i.
    // My first adapter read .x off a number, got NaN, and reported ZERO pairs. A structure that returns nothing
    // looks like a broken structure and was a broken caller.
    const parts = pts.map((p) => ({ x: p[0], y: p[1], z: p[2] }));
    const g = new SpatialGrid(r);
    g.rebuild(parts);
    const out = new Set(), r2 = r * r;
    pts.forEach((p, i) => {
        for (const j of g.near(p[0], p[1], p[2])) {
            if (j === i) continue;
            const q = pts[j];
            const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
            if (dx * dx + dy * dy + dz * dz <= r2) out.add(key(i, j));
        }
    });
    return out;
}

// FIVE STRUCTURES, FIVE CONVENTIONS -- and this line is where that bites. AabbGrid wants {min:[x,y,z],
// max:[x,y,z]} while AABBTree.insert takes two bare arrays. Neither is wrong; they simply grew up apart, which
// is exactly why nothing ever asked them the same question. Translating is the whole job of this file.
const boxOf = (p, h) => ({ min: [p[0] - h, p[1] - h, p[2] - h], max: [p[0] + h, p[1] + h, p[2] + h] });

export function viaAabbGrid(pts, r) {
    const h = r / 2, g = new AabbGrid(Math.max(r, 1e-6));
    pts.forEach((p, i) => g.insert(i, boxOf(p, h)));
    const out = new Set();
    for (const [a, b] of g.pairs()) {
        // pairs() is a BROAD phase: it returns candidates. Narrow it with the exact box test, so what comes out
        // is the true Chebyshev set rather than the structure's guess at it.
        if (aabbOverlap(boxOf(pts[a], h), boxOf(pts[b], h))) out.add(key(a, b));
    }
    return out;
}

export function viaAabbTree(pts, r) {
    const h = r / 2, t = new AABBTree();
    pts.forEach((p, i) => t.insert(i, [p[0] - h, p[1] - h, p[2] - h], [p[0] + h, p[1] + h, p[2] + h]));
    const out = new Set();
    t.pairs((a, b) => { if (aabbOverlap(boxOf(pts[a], h), boxOf(pts[b], h))) out.add(key(a, b)); });
    return out;
}

// ---- set helpers, so a disagreement can be NAMED rather than merely counted ----------------------------------------
export const missing = (expected, got) => [...expected].filter((k) => !got.has(k));
export const extra = (expected, got) => [...got].filter((k) => !expected.has(k));
export const isSubset = (a, b) => [...a].every((k) => b.has(k));
export function sameSet(a, b) { return a.size === b.size && isSubset(a, b); }

/** Run all five plus both brute forces on one scene. */
export function compareAll(pts, r) {
    return {
        n: pts.length, r,
        bruteSphere: bruteSphere(pts, r), bruteBox: bruteBox(pts, r),
        kdtree: viaKdTree(pts, r), neighborGrid: viaNeighborGrid(pts, r), sphGrid: viaSphGrid(pts, r),
        aabbGrid: viaAabbGrid(pts, r), aabbTree: viaAabbTree(pts, r),
    };
}

export const POINT_FAMILY = ["kdtree", "neighborGrid", "sphGrid"];
export const BOX_FAMILY = ["aabbGrid", "aabbTree"];
