// WebGLEngine/physics/mesh/meshPointClassify.mjs
//
// *** ROUND 4 OF THE BVH-CSG ARC. *** tools/ship/nextRounds.mjs's "bvh-csg-speed-vs-manifold-tradeoff" entry
// scoped a from-scratch BVH-CSG port into pieces: (a) dual-BVH pairwise-overlap broad phase -- DONE,
// physics/mesh/bvhPairOverlap.mjs -- (b) triangle-triangle intersection -- DONE, physics/mesh/triTriIntersect.mjs
// -- (c) triangle-vs-plane clipping -- DONE, physics/mesh/triClip.mjs -- and (d) inside/outside classification,
// THIS FILE. This is the classic CSG final step: given a point (typically a clipped fragment's own centroid),
// decide whether it sits inside or outside a SECOND, whole mesh -- the piece that turns "candidate pairs" and
// "clipped triangle fragments" into an actual keep/discard decision for a boolean operation.
//
// THE ALGORITHM: ray-crossing parity. Cast a ray from the query point in some direction and count how many
// times it crosses the mesh's surface; an odd count means inside, even means outside (the standard technique
// evanw/csg.js-style CSG and most textbook point-in-solid tests use, though this tree's OWN existing BSP path,
// physics/mesh/meshCSG.mjs, uses plane-sequence membership instead -- a different algorithm with different
// hazards, read in full before this round started specifically to confirm ray-crossing parity is the right
// contrasting technique to build here, not a redundant reimplementation of the same idea).
//
// THE PRIMITIVE THIS NEEDED, BUILT WITH ZERO CHANGES TO mesh/meshBVH.mjs (continuing every prior round's own
// convention, restated here because reaching into that file was genuinely tempting this time): none of
// MeshBVH's three existing queries can report every ray-mesh crossing. raycastFirst prunes to the nearest hit
// via best-t pruning; intersectsSegment is a bounded any-hit early-out; trianglesInBox isn't a ray query at
// all. rayAllHits() below reimplements a small ray/box slab test against MeshBVH's own PUBLIC bounds/meta/
// order/count arrays (mirroring _hitBox's math, but with no maxT cap and no pruning -- every leaf box the
// infinite forward ray's line could touch must be visited, since an all-hits query never gets to shrink a
// "nearest so far" bound), while reusing mesh/meshBVH.mjs's own EXPORTED rayTriangle kernel directly for the
// per-triangle test -- no duplicated Moller-Trumbore math, only the traversal shape is new, matching
// bvhPairOverlap.mjs's own precedent of a small reimplemented box test rather than a change to that file.
//
// A REAL BUG, FOUND BY THIS ROUND'S OWN SCRATCH-TESTING BEFORE THIS MODULE WAS WRITTEN, NOT BY REASONING:
// casting straight up from the exact center of a hand-built unit cube -- a point unambiguously INSIDE --
// through the cube's own top face lands EXACTLY on that face's shared diagonal (both of the top face's two
// triangles independently register a hit at the identical t). A NAIVE hit count is therefore 2 (even), which
// would misclassify the cube's own center as OUTSIDE -- silently wrong, not a crash. This is exactly the
// "double-count on a shared edge/vertex" hazard classic ray-triangle kernels are known for (production
// watertight ray/triangle tests assign deterministic edge ownership per-triangle to avoid it; this tree's own
// rayTriangle kernel does not have that refinement). FIXED here by merging hits whose t values fall within a
// weld tolerance of each other into ONE crossing event before taking parity -- turns the same scenario's raw
// count of 2 into a welded count of 1 (odd, correctly INSIDE). Demonstrated concretely, not just reasoned
// about -- see meshPointClassify-selfcheck.mjs's own "parity-flip demonstration" section, which reproduces
// this exact case and asserts the naive (unwelded) answer would have been wrong.
//
// A SECOND REAL BUG, FOUND BY AN ADVERSARIAL REVIEW OF THIS ROUND'S ORIGINAL DIFF (HIGH severity, verified by
// direct execution), AND ONLY PARTIALLY FIXED -- STATED PLAINLY: the weld-by-t-proximity merge above cannot
// distinguish "the SAME physical crossing registered twice by two triangles" (what it was built for) from "TWO
// GENUINELY DISTINCT crossings that merely happen to be close together along the ray" -- e.g. entering and
// exiting a locally thin mesh feature (a sharp wedge tip, a gear tooth, a crease), not a hypothetical: the
// reviewer built a hand-cube-topology "slab" mesh squished to a thickness under the original weldEps=1e-7
// default and showed pointInMesh() CONFIDENTLY misclassified a point just below it as inside, with the
// majority vote ALSO wrong (not merely low-agreement) since a thin feature is thin along multiple non-axis-
// aligned directions at once -- the original header's "defense in depth against whatever hazard welding does
// not happen to cover" claim was broader than what the round had actually demonstrated. NARROWED, not
// withdrawn: majority voting is real, demonstrated protection against a single direction's own numerical
// noise (see below), not against a hazard that affects most/all directions simultaneously the way mesh
// thinness does.
//   THE FIX, MEASURED BEFORE BEING CHOSEN, NOT GUESSED: the weld tolerance was an absolute 1e-7 on t with no
//   justification for that specific number. A 200-case sweep across random rotation, translation, and scale
//   (0.1x to 1000x) of the same watertight cube, measuring the ACTUAL gap between genuinely-duplicate hits'
//   independently-computed t values, found a worst case of 3.4e-13 absolute at t~761 (~4.5e-16 relative --
//   consistent with a few ULPs of float64 rounding through rayTriangle's own arithmetic, not a surprise).
//   weldEps is now Math.max(WELD_EPS_ABS, |t| * WELD_EPS_REL) with WELD_EPS_ABS = WELD_EPS_REL = 1e-9 -- a
//   relative-to-t tolerance (closing the same "absolute threshold at large magnitude" caveat this arc has
//   repeatedly landed on as the right fix, per round 2's own normalization fix) with an absolute floor for t
//   near zero, giving ~1e6x safety margin above the measured genuine-duplicate noise floor. Re-tested against
//   the reviewer's own exact repro: the previously-failing thickness-1e-8 and thickness-1e-9 slab cases now
//   correctly classify (see the gate's own "thin-feature, tightened tolerance" section) -- moving the residual
//   failure point from ~1e-7 down to ~1e-10, roughly a THOUSANDFOLD reduction in the danger zone, not a full
//   fix. A mesh feature whose true thickness along the cast ray is thinner than ~1e-9 world units (or the same
//   relative to distance) -- an even more extreme degenerate case than the reviewer's own original repro --
//   can still be silently merged away. Left honestly unresolved, reproduced in the gate rather than hidden: a
//   complete fix needs topological adjacency (recognizing a duplicate registration by shared EDGE/VERTEX
//   identity between two triangles, not merely numerical t-proximity) which this flat, non-indexed triangle
//   buffer format does not carry and this round does not add.
//
// A THIRD MITIGATION, EMPIRICALLY DEMONSTRATED RATHER THAN ASSUMED SUFFICIENT ON ITS OWN, WITH ITS OWN REAL
// LIMIT NOW STATED PRECISELY (narrowed per the finding above): pointInMesh() casts SEVERAL deliberately
// non-axis-aligned directions (DEFAULT_DIRS) and majority-votes rather than trusting any single ray. This is
// real, demonstrated protection against a SINGLE direction's own numerical noise (a rare degenerate
// configuration one particular ray happens to hit) -- verified: with welding deliberately disabled (weldEps
// overridden to 0) and one of five directions forced to be the known bad grazing direction above, the OTHER
// four (non-grazing) directions still out-vote it 4-to-1, with agreement:0.8 reported rather than silently
// hidden -- see the gate's own "majority-vote defense in depth" section. It is NOT protection against a hazard
// (like mesh thinness) that affects most or all directions AT ONCE, which is exactly what the finding above
// demonstrated.
//
// PRECONDITIONS AND SCOPE, NAMED PLAINLY RATHER THAN SILENTLY RISKED (matching every prior round's own
// practice of stating what is NOT attempted):
//   WATERTIGHT INPUT ASSUMED. Ray-crossing parity is only rigorous against a closed 2-manifold. A gap in the
//   mesh (this tree's own physics/mesh/meshCSG.mjs documents residual unwelded T-junction gaps in its own BSP
//   output as an unresolved, measured issue) can make a ray passing near/through the gap under- or over-count.
//   Not detected or guarded against here -- a caller handing this a non-watertight mesh gets an unreliable
//   answer with no warning beyond whatever the `agreement` field happens to show.
//   A QUERY POINT EXACTLY ON THE MESH SURFACE is not specially handled. `agreement` (the fraction of
//   directions that agreed) is the built-in signal for a low-confidence/near-degenerate classification --
//   a caller that sees agreement < 1 should treat the result as suspect -- but this is a diagnostic, not a
//   resolution the way triTriIntersect.mjs's own "degenerate" status is a resolution.
//   A LOCAL MESH FEATURE THINNER THAN ~1e-9 world units (or the same relative to query distance) ALONG THE
//   CAST RAY can still be silently welded away -- see the finding above. Not the same risk as, and additional
//   to, the already-known "large world coordinate" caveat triTriIntersect.mjs's and triClip.mjs's own gates
//   already name for their own EPS constants.
//   ONLY the point-in-mesh primitive itself is built this round. Multi-plane fragment accumulation (clipping
//   one triangle against EVERY overlapping candidate from bvhPairOverlap.mjs, not just one, to fully resolve a
//   general two-mesh overlap like box-minus-box) is explicitly NOT attempted -- confirmed by direct
//   investigation before this round started that even the simplest realistic two-box overlap needs it, so no
//   "easy" full boolean demo exists to substitute. What IS built and gated: the classification primitive
//   itself, plus an end-to-end wiring demonstration (pairOverlap -> triClip -> this module) for the one class
//   of scenario that genuinely needs only a SINGLE clip -- proving the four pieces' data actually compose, not
//   yet a general CSG boolean output.
"use strict";

import { rayTriangle } from "../../mesh/meshBVH.mjs";

const EPS = 1e-9;
// See this file's own header for how these were measured, not guessed: a relative-to-t weld tolerance with an
// absolute floor for t near zero, giving ~1e6x margin above the worst genuine-duplicate-hit noise a 200-case
// randomized rotation/translation/scale sweep found (3.4e-13 absolute at t~761).
const WELD_EPS_ABS = 1e-9;
const WELD_EPS_REL = 1e-9;

// Deliberately non-axis-aligned, mutually well-spread unit directions -- chosen to minimize the chance of
// coincidentally grazing an edge/vertex of typical (often axis-aligned) test geometry in this tree, the exact
// risk this round's own research named. FOUND, MEASURED, AND FIXED BY AN ADVERSARIAL REVIEW OF THIS ROUND'S
// ORIGINAL DIFF: the first-draft set (chosen by hand, not measured) had one pair only 24.4 degrees apart --
// worse than useless for majority voting's own purpose, since two near-parallel directions are prone to
// failing the SAME way together, not independently. These 5 were instead found via a projective-space
// repulsion simulation (points on a sphere, repelled from both each other AND each other's antipodes, since a
// ray and its exact reverse graze the SAME shared-edge/vertex features along the same line) -- the result's
// worst pairwise angular separation (treating a direction and its negation as equivalent) is ~59 degrees, close
// to the theoretical best achievable for 5 mutually well-spread lines. meshPointClassify-selfcheck.mjs's own
// "DEFAULT_DIRS spread" section asserts this stays true, so a future edit can't silently reintroduce the gap.
export const DEFAULT_DIRS = [
    [-0.7393500349414837, 0.585186198349221, -0.3330445001701918],
    [-0.3942323228869452, -0.9145593847210258, 0.0903438288421637],
    [0.5153362787959795, -0.5835223631197205, -0.6276385675656728],
    [-0.6645036738191873, -0.3406792391641524, -0.6651109106632799],
    [-0.3020418040289398, -0.3433713820180967, 0.8893069451150855],
].map(([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; });

// Ray/box slab test against a node's box, for the infinite FORWARD ray (t in [eps, +Infinity)) -- NOT
// MeshBVH's own private _hitBox: that one caps at a shrinking `maxT` and starts t0 at 0, both wrong for an
// all-hits query that never prunes on "nearer already found" and must not miss a box straddling the origin.
function hitBoxInfinite(bvh, node, ox, oy, oz, ix, iy, iz, dx, dy, dz, eps) {
    const b = node * 6;
    let t0 = -Infinity, t1 = Infinity;
    const o = [ox, oy, oz], inv = [ix, iy, iz], d = [dx, dy, dz];
    for (let a = 0; a < 3; a++) {
        const lo = bvh.bounds[b + a], hi = bvh.bounds[b + a + 3];
        if (d[a] === 0) { if (o[a] < lo || o[a] > hi) return false; continue; }
        let n0 = (lo - o[a]) * inv[a], n1 = (hi - o[a]) * inv[a];
        if (n0 > n1) { const t = n0; n0 = n1; n1 = t; }
        if (n0 > t0) t0 = n0;
        if (n1 < t1) t1 = n1;
        if (t0 > t1) return false;
    }
    return t1 >= eps;
}

/**
 * Every crossing of `bvh`'s surface along the infinite ray from (ox,oy,oz) in direction (dx,dy,dz), t>eps.
 * Unlike bvh.raycastFirst(), does NOT stop at the nearest hit -- visits every leaf the ray's line could touch.
 *
 * @returns {{t:number, tri:number}[]} sorted by t ascending. Empty for an empty mesh.
 */
export function rayAllHits(bvh, ox, oy, oz, dx, dy, dz, eps = EPS) {
    const hits = [];
    if (!bvh.count) return hits;
    const ix = dx === 0 ? Infinity : 1 / dx, iy = dy === 0 ? Infinity : 1 / dy, iz = dz === 0 ? Infinity : 1 / dz;
    const stack = [0];
    while (stack.length) {
        const node = stack.pop();
        if (!hitBoxInfinite(bvh, node, ox, oy, oz, ix, iy, iz, dx, dy, dz, eps)) continue;
        const left = bvh.meta[node * 3];
        if (left < 0) {
            const start = bvh.meta[node * 3 + 1], n = bvh.meta[node * 3 + 2];
            for (let s = start; s < start + n; s++) {
                const tri = bvh.order[s];
                const t = rayTriangle(ox, oy, oz, dx, dy, dz, bvh.tris, tri * 9, eps);
                if (t !== null) hits.push({ t, tri });
            }
            continue;
        }
        stack.push(left); stack.push(bvh.meta[node * 3 + 1]);
    }
    hits.sort((a, b) => a.t - b.t);
    return hits;
}

/**
 * Is (px,py,pz) inside `bvh`'s mesh? Ray-crossing parity, welded (see this file's own header for the real bug
 * this fixes, and the second, only-partially-fixed one an adversarial review found) and majority-voted across
 * several directions (real, but narrower than "defense in depth" -- see this file's own header).
 *
 * @param {{dirs?:number[][], eps?:number, weldEps?:number, weldEpsRel?:number}} [opts]
 *   weldEps overrides the ABSOLUTE floor (default WELD_EPS_ABS); weldEpsRel overrides the RELATIVE-TO-t
 *   component (default WELD_EPS_REL). The tolerance actually used per hit is Math.max(weldEps, |t| * weldEpsRel).
 * @returns {{inside:boolean, votes:{inside:number,outside:number}, agreement:number, perDirection:object[]}}
 *   agreement is votes-for-the-winning-side / total directions -- 1.0 means every direction agreed; anything
 *   less is a signal (not a resolution) that this query is near-degenerate. For an EMPTY mesh (nothing to be
 *   inside of): inside is false, votes.outside equals dirs.length, agreement is 1 (every direction correctly
 *   agrees there is nothing to be inside of).
 */
export function pointInMesh(bvh, px, py, pz, opts = {}) {
    const dirs = opts.dirs || DEFAULT_DIRS;
    const eps = opts.eps ?? EPS;
    const weldEpsAbs = opts.weldEps ?? WELD_EPS_ABS;
    const weldEpsRel = opts.weldEpsRel ?? WELD_EPS_REL;
    let insideVotes = 0, outsideVotes = 0;
    const perDirection = [];
    for (const [dx, dy, dz] of dirs) {
        const hits = rayAllHits(bvh, px, py, pz, dx, dy, dz, eps);
        let crossings = 0, i = 0;
        while (i < hits.length) {
            let j = i + 1;
            while (j < hits.length) {
                const tol = Math.max(weldEpsAbs, Math.abs(hits[i].t) * weldEpsRel);
                if (hits[j].t - hits[i].t < tol) j++; else break;
            }
            crossings++;
            i = j;
        }
        const inside = (crossings % 2) === 1;
        perDirection.push({ dir: [dx, dy, dz], rawHits: hits.length, crossings, inside });
        if (inside) insideVotes++; else outsideVotes++;
    }
    return {
        inside: insideVotes > outsideVotes,
        votes: { inside: insideVotes, outside: outsideVotes },
        agreement: dirs.length ? Math.max(insideVotes, outsideVotes) / dirs.length : 0,
        perDirection,
    };
}
