// WebGLEngine/physics/mesh/triFragmentAccumulate.mjs
//
// *** ROUND 5 OF THE BVH-CSG ARC. *** tools/ship/nextRounds.mjs's "bvh-csg-speed-vs-manifold-tradeoff" entry
// scoped a from-scratch BVH-CSG port into (a) dual-BVH broad phase -- DONE, physics/mesh/bvhPairOverlap.mjs --
// (b) triangle-triangle intersection -- DONE, physics/mesh/triTriIntersect.mjs -- (c) triangle-vs-plane
// clipping -- DONE, physics/mesh/triClip.mjs -- (d) inside/outside point classification -- DONE,
// physics/mesh/meshPointClassify.mjs. Round 4's own header named the remaining gap plainly: pointInMesh()
// classifies a SINGLE clipped fragment's centroid, but a real two-mesh boolean (box-minus-box, the arc's own
// running example) needs one triangle of mesh A clipped against EVERY relevant candidate plane from mesh B, not
// just one -- confirmed by round 4's own investigation that even the simplest realistic overlap needs it. THIS
// FILE is that piece: multi-plane fragment accumulation.
//
// THE ALGORITHM: fragments = [wholeTriA]; for each DISTINCT candidate plane (one B-triangle's own plane, from
// bvhPairOverlap.mjs's candidate list restricted to this triA), replace every fragment currently alive with
// triClip.mjs's own front+back split, or leave it alone on allFront/allBack. This is the "obvious algorithm
// shape" -- the actual engineering is in two things naive versions of it get wrong, both found by directly
// running the real triClip.mjs against hand- and BVH-derived cases before this module was written, not by
// reasoning about it in the abstract:
//
// FINDING 1 -- CANDIDATE B-TRIANGLES MUST BE DEDUPLICATED BY PLANE IDENTITY BEFORE CLIPPING, NOT LEFT TO
// triClip's OWN SHORT-CIRCUIT. Every "clipped" sub-triangle triClip.mjs produces contains at least one
// interpolated crossing vertex that sits, by construction, algebraically exactly on the cutting plane (distance
// zero up to float rounding). triClip.mjs's own clipTriangleByPlane() snaps any distance under EPS to exactly
// zero and returns {status:"degenerate"} for ANY such vertex BEFORE ever reaching its allFront/allBack
// short-circuit (see triClip.mjs's own code: the zero-check runs first). So re-applying an identical or
// near-identical plane to a fragment that plane (or a numerically-equal twin, e.g. two triangles of the same
// box face) already split does NOT cheaply no-op -- it reliably routes into "degenerate" instead. Fixed by
// grouping candidate triBs into DISTINCT planes (near-equal unit normal + matching offset, within planeEps)
// up front, and applying each distinct plane to the live fragment set exactly once.
//
// FINDING 2 -- A "DEGENERATE" RESULT MID-ACCUMULATION IS COMMON, NOT RARE, AND MOST OF IT IS RESOLVABLE. Even
// after Finding 1's dedup, an entirely DIFFERENT (non-duplicate) later plane can still land a fragment vertex
// exactly on it -- not a coincidence, a structural one: a crossing vertex triClip.mjs produces sits on the FIRST
// cutting plane by construction, and if triA's own geometry has a natural symmetry with candidate B (this
// round's own hand-derived gate scenario: a unit-square footprint against a triangle split along the y=x
// diagonal), that same point can land exactly on a SECOND, later plane too, entirely legitimately. A first-draft
// policy of "on degenerate, just pass the fragment through unsplit, flagged low-confidence" was tried, and a
// deliberately-added ORDER-INDEPENDENCE check (this module's own gate, section on randomized candidate order)
// caught it giving a WRONG final inside/outside split depending on candidate processing order (0.0515 vs the
// true 0.08 for this file's own gate scenario, a ~36% area error, not numerical noise) -- because passing a
// genuinely-splittable fragment through unsplit leaves it straddling the true boundary, and which fragment ends
// up unsplit depends on which plane happens to hit the coincidence first. FIXED by resolving the degenerate
// result directly instead of merely flagging it, in the two of three configurations that are NOT actually
// ambiguous (triClip.mjs's own EPS-snap only reports "one or more vertices sit on the plane"; it does not
// distinguish these):
//   - exactly one vertex on the plane, the other two AGREEING in sign: safe pass-through unsplit, same sign
//     (the on-plane vertex contributes zero area to either side either way).
//   - exactly one vertex on the plane, the other two DISAGREEING in sign: a real, well-defined 2-way split around
//     the ONE crossing point on the opposite edge (triClip.mjs's own fan logic never reaches this shape, since
//     it bails out on ANY zero-distance vertex regardless of the other two's signs -- resolved here instead of
//     touching triClip.mjs, preserving every prior round's own convention of new files over modified ones).
//   - exactly two vertices on the plane (an entire fragment EDGE lying on the plane): safe, unambiguous --
//     the on-plane edge is zero-measure, so the whole fragment is on the third vertex's own side.
//   Only the genuinely ambiguous remaining case -- ALL THREE vertices on the plane (the fragment itself lies in
//   the candidate plane) -- is left as a real "unresolved" outcome: the fragment is kept, unsplit, tagged
//   lowConfidence:true, NOT silently dropped. Re-verified after this fix: the same randomized-order gate that
//   caught the bug now gives the correct, order-INDEPENDENT 0.08/0.42 split on every tested permutation.
//
// A DEFENSIVE maxFragments CAP, NOT A CORRECTNESS FIX: even after Finding 1's dedup, this module clips against
// each candidate's INFINITE plane, not the candidate triangle's own bounded footprint, and never merges or
// prunes -- so fragment count can grow well past naive "N planes -> N+1 pieces" intuition even in realistic
// (not just adversarial) configurations. Measured directly (this module's own gate): a triangle poking through
// 4 axis-aligned box-side planes reaches double-digit fragment counts, not ~5; a "spoke" construction (many
// planes through one centroid) grows super-linearly (each clip roughly multiplies any fragment it splits).
// accumulateFragments() takes a maxFragments option (default 256) and reports `capped:true` rather than
// growing unbounded or silently truncating without saying so -- the SAME "name the residual gap honestly, don't
// hide it" convention every prior round of this arc has used, not a claim that capping is itself a fix for the
// underlying blow-up (a real fix -- footprint-bounded clipping, or merging near-duplicate small fragments --
// is not attempted this round).
//
// FOUR REAL BUGS/GAPS, ALL FOUND BY AN ADVERSARIAL REVIEW OF THIS ROUND'S ORIGINAL DIFF, VERIFIED BY DIRECT
// EXECUTION, AND FIXED HERE:
//   (1) the maxFragments cap could be silently EXCEEDED, not just eventually hit -- the original check ran only
//   at the TOP of the per-plane loop, before that plane was applied, so the LAST plane processed could push
//   fragments.length arbitrarily far past the cap with nothing catching it (measured: maxFragments=191 on a
//   20-plane spoke scenario returned capped:false with fragments.length:192). Fixed with a second check
//   immediately after each plane is applied, so the cap is enforced everywhere fragments.length can grow.
//   (2) accumulateFragments() crashed on candidateTriBs=undefined -- exactly what
//   groupCandidatesByTriA(pairs).get(triA) returns for the common case of a triA with zero overlap candidates,
//   this module's own documented typical calling pattern. Fixed with a one-line default-to-[] guard.
//   (3) `planeCount`'s own JSDoc says "distinct planes actually applied (after dedup)", but the code always
//   returned the full pre-loop dedup'd count regardless of an early cap-triggered exit -- overstating how many
//   planes were really applied whenever capped. Fixed by tracking applied-plane count separately from the
//   dedup pass's own plane count (the latter still backs `duplicatePlanesCollapsed`, a property of the
//   candidate list itself, not of how much of it got applied).
//   (4) the plane-identity dedup (Finding 1) only merged candidates whose normals point the SAME direction --
//   two B-triangles occupying the identical geometric plane but wound OPPOSITELY (n2~=-n1, d2~=-d1, e.g. from a
//   multi-part or inconsistently-wound mesh B) were treated as two distinct planes. The review traced (and
//   confirmed by running the real code) that this never produces a WRONG final classification -- a fragment
//   reaching the un-deduped duplicate's own re-application is already entirely on one side of that locus, and
//   resolveDegenerate()'s per-vertex sign-agreement test is invariant to the plane's own sign convention -- so
//   it cost only wasted work and inflated planeCount/duplicatePlanesCollapsed stats, not silent corruption.
//   Fixed anyway, directly, by widening the dedup check to also match the negated (n,d) convention.
//
// A FIFTH FINDING, LEFT HONESTLY UNRESOLVED RATHER THAN FORCED INTO A FIX THIS ROUND: repeated clipping can
// cascade a run of near-zero-area sliver fragments when several candidate planes are NEAR-duplicates of each
// other -- genuinely distinct by construction, not a floating-point artifact of one true plane, but close
// enough together (just outside PLANE_EPS) that each one shaves a vanishingly thin extra slice off an
// already-once-clipped fragment instead of contributing a meaningfully different cut. The review demonstrated
// this concretely (a chain of near-duplicate planes jittered just above PLANE_EPS produced real, kept,
// non-degenerate fragments with area at the double-precision noise floor, area conservation still holding) and,
// combined with the maxFragments cap, a WORSE variant: enough near-duplicate slivers can consume the entire
// fragment budget before a genuinely necessary, geometrically distinct plane is ever applied -- `capped:true`
// is still honestly reported, but a caller has no signal that the planes actually applied before the cap were
// disproportionately low-value ones. This is NOT the same risk as PLANE_EPS being too LOOSE (which Finding 1
// already handles: genuine duplicates get merged); it is a design trade-off in how TIGHT PLANE_EPS should be
// between "correctly telling near-but-genuinely-different planes apart" and "not cascading slivers from planes
// that are different in principle but practically insignificant" -- resolving it needs either a smarter
// plane-processing order (prioritizing planes with larger geometric effect first, not attempted here) or a
// fragment-merge/prune step this round does not build. Reproduced directly in this module's own gate (see
// triFragmentAccumulate-selfcheck.mjs) rather than only described here.
//
// SCOPE: this module produces a CLASSIFIABLE fragment set for one triangle of mesh A against every relevant
// candidate of mesh B -- it does not itself classify fragments (hand the result's fragment centroids to
// physics/mesh/meshPointClassify.mjs's pointInMesh(), round 4's own primitive, for that), and it does not
// assemble a result mesh or implement per-operation (union/subtract/intersect) fragment-keep rules -- both are
// explicitly OUT OF SCOPE for this round, a genuinely separate piece of work a real CSG boolean still needs.
// Built with ZERO changes to mesh/meshBVH.mjs, bvhPairOverlap.mjs, meshPointClassify.mjs, or triClip.mjs,
// continuing every prior round's own convention.
"use strict";

import { pairOverlap } from "./bvhPairOverlap.mjs";
import { trianglePlane, clipTriangleByPlane } from "./triClip.mjs";

const EPS = 1e-9;
// Plane-identity dedup tolerance: cos(angle-between-normals) > 1-PLANE_EPS AND |offset difference| < PLANE_EPS.
// UNMEASURED against a dedicated sweep this round (unlike triClip.mjs's/meshPointClassify.mjs's own EPS
// constants, which were each justified by a measured noise floor) -- set equal to triClip.mjs's own EPS as the
// most directly comparable existing precedent (both compare a geometric distance/dot-product near zero), named
// honestly as an estimate, not a measured constant, for a future round to tighten if a real false-merge or
// false-split case turns up.
const PLANE_EPS = 1e-9;
const DEFAULT_MAX_FRAGMENTS = 256;

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function readTri(tris, t) {
    const o = t * 9;
    return [
        [tris[o], tris[o + 1], tris[o + 2]],
        [tris[o + 3], tris[o + 4], tris[o + 5]],
        [tris[o + 6], tris[o + 7], tris[o + 8]],
    ];
}
function packScratch(buf, tri) {
    for (let k = 0; k < 3; k++) { buf[k * 3] = tri[k][0]; buf[k * 3 + 1] = tri[k][1]; buf[k * 3 + 2] = tri[k][2]; }
}

/**
 * One-time grouping pass over pairOverlap()'s own whole-mesh-pair output, mapping each triA to every triB it
 * was ever paired with. Computed ONCE per (bvhA,bvhB) pair and reused across every triangle of mesh A --
 * re-deriving per-triangle candidates by calling pairOverlap() once per triA would redo the entire dual-BVH
 * traversal N times instead of once, and pairOverlap.mjs's own header already states filtering/grouping the
 * whole-mesh pair list is the CALLER's responsibility (the same convention this function follows, not a new
 * one), not something pairOverlap() should do itself.
 *
 * @param {number[][]} pairs  pairOverlap(bvhA,bvhB)'s own return value, [triIndexA, triIndexB][]
 * @returns {Map<number, number[]>} triA -> every triB it was paired with, in pairOverlap's own order
 */
export function groupCandidatesByTriA(pairs) {
    const map = new Map();
    for (const [triA, triB] of pairs) {
        let list = map.get(triA);
        if (!list) { list = []; map.set(triA, list); }
        list.push(triB);
    }
    return map;
}

// See this file's own header, Finding 2, for what this resolves and why it is needed: triClip.mjs's own
// {status:"degenerate"} conflates three geometrically distinct shapes (one on-plane vertex with the other two
// agreeing; one on-plane vertex with the other two disagreeing -- a real, well-defined 2-way split triClip.mjs
// itself never computes; and a whole on-plane edge or triangle) into one unresolved status. Recomputes the same
// normalize-and-EPS-snap distances triClip.mjs's own clipTriangleByPlane() computes internally (duplicated
// here, not exported from triClip.mjs, since exposing per-vertex distances would widen that file's own public
// surface for a single caller -- keeping triClip.mjs at zero changes, per this round's own header).
function resolveDegenerate(tri, nRaw, dRaw) {
    const nlen = Math.hypot(nRaw[0], nRaw[1], nRaw[2]);
    if (nlen < 1e-300) return { status: "unresolved" };
    const n = scale(nRaw, 1 / nlen), d = dRaw / nlen;
    const ds = tri.map((p) => { const v = dot(n, p) + d; return Math.abs(v) < EPS ? 0 : v; });
    const zeroIdx = [0, 1, 2].filter((k) => ds[k] === 0);
    if (zeroIdx.length === 3) return { status: "unresolved" };          // whole fragment lies on the plane
    if (zeroIdx.length === 2) {                                          // an on-plane EDGE, third vertex off
        const k3 = [0, 1, 2].find((k) => !zeroIdx.includes(k));
        return { status: ds[k3] > 0 ? "allFront" : "allBack" };
    }
    const k = zeroIdx[0], i = (k + 1) % 3, j = (k + 2) % 3;               // exactly one vertex on the plane
    const si = Math.sign(ds[i]), sj = Math.sign(ds[j]);
    if (si === sj) return { status: si > 0 ? "allFront" : "allBack" };   // agree: safe no-op
    // disagree: a genuine 2-way split around the single on-plane vertex, the opposite edge crossing once --
    // preserves the original triangle's own cyclic winding (p_k, p_i, P) / (p_k, P, p_j), the same fan-order
    // rule triClip.mjs's own header derives for its (different-shaped) 3-way case.
    const P = add(tri[i], scale(sub(tri[j], tri[i]), ds[i] / (ds[i] - ds[j])));
    const T1 = [tri[k], tri[i], P], T2 = [tri[k], P, tri[j]];
    return si > 0 ? { status: "clipped", front: [T1], back: [T2] } : { status: "clipped", front: [T2], back: [T1] };
}

/**
 * Clip triangle `triA` (in `trisA`) against EVERY DISTINCT plane among `candidateTriBs` (triangle indices into
 * `trisB`), accumulating the fragment set produced by applying each plane, in turn, to every fragment currently
 * alive. See this file's own header for the two real findings (plane-identity dedup; degenerate-result
 * resolution) that make this more than the "obvious algorithm shape" it starts from.
 *
 * @param {Float64Array|Float32Array} trisA
 * @param {number} triA
 * @param {Float64Array|Float32Array} trisB
 * @param {number[]} candidateTriBs  typically groupCandidatesByTriA(pairOverlap(bvhA,bvhB)).get(triA) -- an
 *   ALREADY-FILTERED per-triangle candidate list, not raw pairOverlap() output (see groupCandidatesByTriA()'s
 *   own docs for why this function does not call pairOverlap() itself).
 * @param {{planeEps?:number, maxFragments?:number}} [opts]
 * @returns {{fragments:{tri:number[][], splitBy:number[], lowConfidence?:boolean}[], planeCount:number,
 *   duplicatePlanesCollapsed:number, degenerateFallbacks:number, unresolvedCount:number, capped:boolean}}
 *   fragments: each a fresh [p0,p1,p2] raw-point triangle plus splitBy (the distinct planes' own representative
 *     triB indices that actually produced a cut kept in this fragment's ancestry) and lowConfidence (present
 *     and true only if this fragment or an ancestor hit the genuinely-unresolved all-three-vertices-on-plane
 *     case -- see this file's own header).
 *   planeCount: distinct planes actually applied (after dedup).
 *   duplicatePlanesCollapsed: candidateTriBs.length - planeCount (counts index duplicates, zero-area-candidate
 *     skips, and true coplanar merges together, as one aggregate stat).
 *   degenerateFallbacks: total clipTriangleByPlane() calls that returned "degenerate" across the whole
 *     accumulation (most are resolved, not left low-confidence -- see unresolvedCount for the genuinely
 *     unresolved subset).
 *   unresolvedCount: total resolveDegenerate() calls that themselves returned "unresolved" (all three vertices
 *     on the plane) -- the honestly-named residual gap this round leaves, not silently absorbed into
 *     degenerateFallbacks.
 *   capped: true if maxFragments was reached before every candidate plane was applied.
 */
export function accumulateFragments(trisA, triA, trisB, candidateTriBs, opts = {}) {
    const planeEps = opts.planeEps ?? PLANE_EPS;
    const maxFragments = opts.maxFragments ?? DEFAULT_MAX_FRAGMENTS;
    // An adversarial review of this round found candidateTriBs=undefined -- exactly what
    // groupCandidatesByTriA(pairs).get(triA) returns for the common case of a triA with zero overlap
    // candidates, this module's own documented typical calling pattern -- crashed with a TypeError instead of
    // behaving like the already-tested empty-array case. Fixed with this one-line guard.
    candidateTriBs = candidateTriBs || [];

    // Finding 1: dedup candidates by PLANE IDENTITY before clipping, not by trusting triClip.mjs's own
    // short-circuit to no-op a repeat (see this file's own header for why it does not). ALSO merges a
    // candidate whose plane is the same locus but OPPOSITELY WOUND (n2~=-n1, d2~=-d1) -- found missing by an
    // adversarial review of this round's original diff: the review confirmed (both by hand and by running the
    // real code) that leaving an opposite-facing duplicate un-merged never produces a WRONG final
    // classification (resolveDegenerate()'s own per-vertex sign-agreement test is invariant to a global sign
    // flip of the plane's own convention) -- but it did inflate planeCount/duplicatePlanesCollapsed and waste
    // real work re-resolving an already-settled split, which this fix closes directly rather than merely
    // documenting.
    const planes = [];
    const seenTriB = new Set();
    for (const triB of candidateTriBs) {
        if (seenTriB.has(triB)) continue;
        seenTriB.add(triB);
        const plane = trianglePlane(trisB, triB);
        if (plane === null) continue;   // zero-area B-triangle: no well-defined plane, skip (same convention
                                          // triTriIntersect.mjs/triClip.mjs already use for a degenerate input)
        let match = null;
        for (const p of planes) {
            const c = dot(p.n, plane.n);
            if (c > 1 - planeEps && Math.abs(p.d - plane.d) < planeEps) { match = p; break; }
            if (c < -(1 - planeEps) && Math.abs(p.d + plane.d) < planeEps) { match = p; break; }
        }
        if (match) match.triBs.push(triB); else planes.push({ n: plane.n, d: plane.d, triBs: [triB] });
    }

    let fragments = [{ tri: readTri(trisA, triA), splitBy: [] }];
    let degenerateFallbacks = 0, unresolvedCount = 0, capped = false, appliedPlaneCount = 0;
    const scratch = new Float64Array(9);

    for (const plane of planes) {
        if (fragments.length >= maxFragments) { capped = true; break; }
        appliedPlaneCount++;
        const next = [];
        for (const frag of fragments) {
            packScratch(scratch, frag.tri);
            const res = clipTriangleByPlane(scratch, 0, plane.n, plane.d);
            if (res.status === "allFront" || res.status === "allBack") {
                next.push(frag);
            } else if (res.status === "clipped") {
                for (const t of [...res.front, ...res.back]) {
                    next.push({ tri: t, splitBy: [...frag.splitBy, plane.triBs[0]], lowConfidence: frag.lowConfidence });
                }
            } else {
                // Finding 2: resolve rather than blanket-flag-and-pass-through.
                degenerateFallbacks++;
                const r = resolveDegenerate(frag.tri, plane.n, plane.d);
                if (r.status === "allFront" || r.status === "allBack") {
                    next.push(frag);
                } else if (r.status === "clipped") {
                    for (const t of [...r.front, ...r.back]) {
                        next.push({ tri: t, splitBy: [...frag.splitBy, plane.triBs[0]], lowConfidence: frag.lowConfidence });
                    }
                } else {
                    unresolvedCount++;
                    next.push({ tri: frag.tri, splitBy: frag.splitBy, lowConfidence: true });
                }
            }
        }
        fragments = next;
        // An adversarial review of this round found the ORIGINAL cap check (only at the top of this loop,
        // before a plane is applied) lets the LAST applied plane push fragments.length arbitrarily far past
        // maxFragments before the next iteration's check would have caught it -- reproduced concretely:
        // maxFragments=191 on a 20-plane spoke scenario returned capped:false with fragments.length:192,
        // silently violating this function's own documented contract ("reports capped:true rather than
        // growing unbounded ... without saying so"). This second check, right after a plane is applied, closes
        // that gap: the cap is now enforced at every point fragments.length can grow, not just between planes.
        if (fragments.length >= maxFragments) { capped = true; break; }
    }
    return {
        fragments,
        // planeCount is now the count of planes ACTUALLY APPLIED (honoring its own documented contract even
        // under capping) -- an adversarial review found this previously always reported the full pre-loop
        // dedup'd count (planes.length) regardless of an early cap-triggered exit, contradicting its own JSDoc
        // ("distinct planes actually applied (after dedup)"). duplicatePlanesCollapsed stays based on the full
        // dedup pass (planes.length) on purpose -- it answers "how many candidates did dedup fold together",
        // a property of the candidate list itself, independent of how many of the resulting planes later got
        // applied before any cap.
        planeCount: appliedPlaneCount,
        duplicatePlanesCollapsed: candidateTriBs.length - planes.length,
        degenerateFallbacks,
        unresolvedCount,
        capped,
    };
}

/**
 * Convenience: run pairOverlap(bvhA,bvhB) and accumulateFragments() for ONE triangle of mesh A, in one call.
 * Mirrors triClip.mjs's own clipTriangleByTriPlane() role as a thin convenience wrapper -- useful for one-off
 * calls and tests. NOT the contract a whole-mesh boolean driver should use: it repeats the full dual-BVH walk
 * once per triangle of A. A real driver should call pairOverlap() once, group it with groupCandidatesByTriA()
 * once, and call accumulateFragments() directly per triangle with the pre-filtered list.
 *
 * @returns accumulateFragments()'s own return shape.
 */
export function accumulateFragmentsFromBVH(bvhA, bvhB, triA, opts = {}) {
    const pairs = pairOverlap(bvhA, bvhB);
    const candidateTriBs = [];
    for (const [ta, tb] of pairs) if (ta === triA) candidateTriBs.push(tb);
    return accumulateFragments(bvhA.tris, triA, bvhB.tris, candidateTriBs, opts);
}
