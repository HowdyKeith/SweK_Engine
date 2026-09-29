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
// *** ROUND 7: THE "FOOTPRINT-BOUNDED CLIPPING" THE CAP PARAGRAPH ABOVE DEFERRED, AS AN OPT-IN GATE. ***
// opts.gateByIntersection (default FALSE, so every round-5 caller and this module's own round-5 gate see
// byte-identical behaviour) applies a candidate plane to a live fragment ONLY IF that fragment actually meets
// at least one of the B-triangles grouped under that plane -- round 2's own triTriIntersect() returning
// anything other than "none" ("intersect", "coplanar" and "degenerate" all still split, so every uncertain
// answer falls on the conservative side). WHY THIS IS NOT MERELY FASTER BUT STILL CORRECT: the only property
// the classifier downstream needs is that no final fragment has B's SURFACE crossing its interior (then its
// centroid speaks for all of it). Take any final fragment f and any B-triangle T. f descends from exactly one
// ancestor that was offered T's plane. If that ancestor met T, it was split by T's plane, so f lies on one
// side of it and T can at most touch f's boundary. If it did not meet T, f is a subset of it and cannot meet T
// either. Either way T does not cross f's interior -- for every T, so B's whole surface does not. The
// ungated path splits by T's plane EVERYWHERE it crosses the triangle, including kilometres from T itself,
// and on a realistic workload that is the difference between right and wrong: physics/mesh/meshCSG.mjs's own
// wall-minus-jagged-blob fixture (12-triangle wall, 224-triangle blob) produced 18,129 output triangles
// uncapped, and at the default maxFragments=256 hit the cap and came back 0.20 units of volume wrong (0.74%)
// -- gated, 473 triangles, exact volume, cap never reached. Measured and gated in
// physics/mesh/meshBooleanBlast-selfcheck.mjs, not asserted here.
//
// *** THE ARGUMENT ABOVE HAD A HOLE, AND IT WAS ROUND 5's, FOUND BY ROUND 7's ADVERSARIAL REVIEW. *** "split by
// T's plane" was not true: Finding 1's dedup merged candidates whose normals were within cos>1-1e-9 (up to
// 4.47e-5 rad) and whose offsets matched within 1e-9 -- which any fold whose line passes near the origin
// satisfies -- and then clipped the whole group by the REPRESENTATIVE's plane. A roof prism with a 2e-5-rad
// ridge through the origin, subtracted from a box, came back 0.048 units of volume wrong on the gated,
// ungated and round-6 paths identically (meshCSG.mjs's BSP: exact). FIXED at the merge: a candidate now joins
// a group only if every one of its own vertices lies within planeEps of the representative's plane, which is
// the property the clip needs. The argument holds with that test, to within planeEps: a merged T lies in a
// planeEps slab about the plane that did the cut. Gated in triFragmentAccumulate-selfcheck.mjs 14h and
// meshBoolean-selfcheck.mjs section 14 (the roof itself, exact on every slope).
//
// TWO MORE ROUND-7 REVIEW CHANGES: the gate first filters each plane group ONCE against the whole triA (every
// fragment is a subset of triA, so a member that misses triA misses every fragment) -- a large flat group that
// crossed triA's plane without touching it had cost fragments x members triTriIntersect calls, 7.9M and 2.1 s
// on one triangle, 0.22 s after. And it is NOT a fix for scaling: every plane is still tested against every
// live fragment of its triangle, with no spatial index of the fragments, so cost grows roughly quadratically
// with how finely B is tessellated where it crosses one A-triangle. Measured by the review (wall minus
// jaggedBlob subdiv n, one blast): n=8 71 ms, 16 103 ms, 32 898 ms, 64 14.6 s (7x the BSP), 96 121 s, and at
// n=128 (65,024 blob triangles) 7.1 minutes ending capped. A per-triangle fragment index is the fix; it is not
// built. (Round 7's words. Round 8 built it and measured that it is HALF the fix -- see the next paragraph.)
//
// *** ROUND 8: A SPATIAL INDEX -- AND THE REVIEW'S CORRECTION OF WHAT IT IS WORTH, WHICH REPLACES THE FIRST DRAFT'S
// CLAIM RATHER THAN SITTING BESIDE IT. *** Profiled first, on wall minus jaggedBlob subdiv 48 (one wall triangle: ~1,560
// planes, ~6,271 fragments): every plane scanned every live fragment. Two changes answer that, and the first draft
// of this paragraph credited the wrong one. (1) THE PREDICATE GAINED A CONDITION: boxes must meet (padded 1e-9)
// before triTriIntersect() is asked. triTriIntersect() answers "degenerate" -- before its interval test -- for any
// member with a vertex within EPS of the fragment's plane however far away it lies, so round 7's gate cut
// fragments edge to edge for members metres away; and a box test is far cheaper than a tri-tri test. Sound on its
// own (disjoint boxes share no point). It changed round 7's fragments on 9 of the 1,378 triangles in
// triFragmentAccumulate-selfcheck 15a's battery (all flush-contact box cases) and not one number in
// meshBoolean-selfcheck or meshBooleanBlast-selfcheck. (2) accumulateIndexed(): a uniform grid over triA's plane
// (the two axes left after dropping its dominant normal axis; G = ceil(sqrt(planes)), measured best of
// 0.25x..4x), fragments registered per cell, a plane asking only fragments in cells its members' boxes touch,
// order kept by a linked list. Both paths share one predicate (fragmentMeetsAny) and one cut (cutFragment), so
// the index changes who is asked and nothing else: output byte-identical to the plain loop (15a: 1,378
// triangles, index forced on every one, uncapped and at three caps; meshBooleanBlast section 7 end to end).
// *** WHAT EACH IS WORTH, SAME MACHINE, PAIRED RUNS, IDENTICAL OUTPUT HASHES (meshBoolean, one blast): *** subdiv 32
// round 7 0.87 s / precondition only 0.66 s / + index 0.66 s; subdiv 48 3.29 / 2.53 / 2.35 s; subdiv 64 10.7 /
// 7.85 / 7.08 s; subdiv 96 (the review's run) 87 / 56 / 42 s. THE PRECONDITION IS ~75-80% OF THE GAIN; THE INDEX
// ADDS 1.0-1.1x end to end up to subdiv 64 and 1.34x at 96 (1.8x on accumulation alone at 64). The first draft
// said "14.6 s -> 6.6 s, 2-3x" and credited the index: 14.6 s and 121 s were round 7's REVIEW figures on a
// busier machine; paired, the whole round is 1.3-1.5x at 32-64 and 2.1x at 96. The BSP: 0.38, 0.87, 1.7, 4.6 s.
// THREE REVIEW FINDINGS ON THE INDEX ITSELF, ALL FIXED: (a) it was 30% SLOWER on accumulation (11% end to end) on
// small inputs, 1-4 planes per triangle -- it is now used only above INDEX_MIN_PLANES = 16 planes; (b) on nested
// slivers (members in parallel diagonal planes cutting triA into strips whose every box contains every later
// member's box) it handed over every live fragment through many cells, P^2 work where the plain loop does P --
// 6x slower, 2x the heap. A plane now prices its query in cell entries first and walks the list when that is
// dearer (listScans counts it), so its work is bounded by the plain loop's, and cut fragments are released
// rather than kept to the end; (c) an extent overflowing to Infinity made the cell map NaN and left triA uncut
// -- such a triangle now goes to the plain loop. Gated: 15c-15f.
// SO THE INDEX IS NOT THE SCALING FIX, and the profile says why -- two costs neither change touches: (1) FRAGMENT
// COUNT. A cut runs the member's PLANE across the whole fragment it splits, not just the member's own segment,
// so early cuts leave long slivers that later members cut again: 37,458 fragments from 5,360 candidates at
// subdiv 64, more than 65,536 on ONE wall triangle at 128, which still caps (129.5 s, wrong; the BSP 14.4 s).
// (2) CLASSIFICATION: pointInMesh() fires five full rays per fragment -- about 5.8 s of 6.9 s at 64. Both scale
// with fragment count, so the next piece is SEGMENT-BOUNDED CUTTING -- a planar arrangement of the actual
// intersection segments inside triA, one classification per face -- not a better index.
// TRIED AND REJECTED, WITH NUMBERS: an adaptive quadtree over triA (cut by axis-aligned mid-planes until each
// cell holds few members, then cut members per cell, so lines stop at cell borders). jaggedBlob's spikes make
// member boxes ~0.4 units wide with ~25 covering a common point at subdiv 32, so no cell size separates them:
// with a plain member-count stop it recursed to depth 12, made ~93,000 cells, capped and came back 0.1-0.4 units
// of volume WRONG; with a stop-when-the-split-does-not-separate rule it was exact but refined only one level,
// 4.8 s against the index's 6.6 s at n=64 in that session -- and its output differs from the unrefined path.
// Not kept.
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
import { triTriIntersect } from "./triTriIntersect.mjs";

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
 * @param {{planeEps?:number, maxFragments?:number, gateByIntersection?:boolean, spatialIndex?:boolean,
 *   indexMinPlanes?:number}} [opts]
 *   gateByIntersection: see this file's own ROUND 7 header paragraph. Default false (round-5 behaviour).
 *   spatialIndex: ROUND 8. With the gate on, triangles with more than indexMinPlanes (default 16) distinct planes
 *     go through accumulateIndexed() unless this is false. Changes which fragments are ASKED, never the result:
 *     the output equals spatialIndex:false's byte for byte (see the ROUND 8 header paragraph). Ignored when the
 *     gate is off.
 *   indexMinPlanes: the plane count above which the index is used (default INDEX_MIN_PLANES = 16; 0 forces it).
 * @returns {{fragments:{tri:number[][], splitBy:number[], lowConfidence?:boolean}[], planeCount:number,
 *   duplicatePlanesCollapsed:number, degenerateFallbacks:number, unresolvedCount:number, capped:boolean,
 *   gateSkipped:number, gateTested:number, groupsSkipped:number, examined:number, listScans?:number}}
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
 *   gateSkipped / gateTested: (fragment, plane) offers the intersection gate declined / passed on to the clip.
 *     Both 0 when gateByIntersection is off.
 *   groupsSkipped: plane groups the gate dropped WHOLESALE because no member meets triA at all (round 7).
 *   examined: (fragment, plane) pairs whose gate predicate was actually evaluated -- every live fragment per
 *     plane on the plain loop, the index's candidates on the indexed path (round 8; 0 with the gate off). The
 *     honest measure of the index's saving; gateSkipped also counts wholesale-dropped groups and overstates it.
 *   listScans: indexed path only -- planes whose query was dearer than walking every live fragment, so it did.
 */
export function accumulateFragments(trisA, triA, trisB, candidateTriBs, opts = {}) {
    const planeEps = opts.planeEps ?? PLANE_EPS;
    const maxFragments = opts.maxFragments ?? DEFAULT_MAX_FRAGMENTS;
    const gate = opts.gateByIntersection === true;
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
        // ROUND 7 FIX (found by that round's adversarial review, reproduced before it was changed): the merge
        // test used to be "normals within cos>1-planeEps AND offsets within planeEps". cos>1-1e-9 admits normals
        // up to 4.47e-5 rad apart, and the offset test passes whenever the fold line between the two planes
        // runs near the origin -- a roof ridge on y=0, a corrugated sheet centred on the origin. The group is
        // then clipped by its REPRESENTATIVE's plane only, so a merged triangle whose own plane is 2e-5 rad off
        // still crosses the kept fragments: a roof prism 0.2 units tall over 100 units, subtracted from a box,
        // came back 0.048 units of volume wrong (and 0.024, 0.0024 at shallower slopes), identically on the
        // gated, ungated and round-6 paths, where meshCSG.mjs's BSP was exact. The test is now the property the
        // clip actually needs: every vertex of the candidate lies within planeEps of the representative's
        // plane (distance is sign-free, so an oppositely-wound duplicate still merges -- round 5's fix (4)).
        const tv = readTri(trisB, triB);
        let match = null;
        for (const p of planes) {
            if (tv.every((v) => Math.abs(dot(p.n, v) + p.d) < planeEps)) { match = p; break; }
        }
        if (match) match.triBs.push(triB); else planes.push({ n: plane.n, d: plane.d, triBs: [triB] });
    }

    // Round 8: with the gate on, the spatially indexed path is the default (opts.spatialIndex:false selects the
    // plain loop below, which applies the SAME per-(fragment, member) predicate to every live fragment and is
    // kept as the readable reference the index is gated against, byte for byte).
    if (gate && opts.spatialIndex !== false && planes.length > (opts.indexMinPlanes ?? INDEX_MIN_PLANES)) {
        const r = accumulateIndexed(trisA, triA, trisB, planes, candidateTriBs.length, maxFragments);
        if (r) return r;   // null: triA's extent is not finite, which the grid cannot map -- use the plain loop
    }

    let fragments = [{ tri: readTri(trisA, triA), splitBy: [] }];
    let capped = false, appliedPlaneCount = 0;
    let gateSkipped = 0, gateTested = 0, groupsSkipped = 0, examined = 0;
    const st = { degenerateFallbacks: 0, unresolvedCount: 0 };
    const scratch = new Float64Array(9);
    const boxOf = memberBoxCache(trisB);

    for (const plane of planes) {
        if (fragments.length >= maxFragments) { capped = true; break; }
        appliedPlaneCount++;
        // Round 7, found by that round's adversarial review: the gate below scans every member of a coplanar
        // group for every live fragment, so a large group that crosses triA's plane but never touches triA (a
        // finely tessellated flat sheet) cost fragments x members triTriIntersect calls -- 7.9M calls, 1.8 s,
        // on one triangle when the group happened to come last. Every fragment is a subset of triA, so a
        // member that misses the WHOLE of triA cannot meet any fragment: filter the group once, here.
        let members = plane.triBs;
        if (gate) {
            members = plane.triBs.filter((triB) => triTriIntersect(trisA, triA, trisB, triB).status !== "none");
            if (members.length === 0) { gateSkipped += fragments.length; groupsSkipped++; continue; }
        }
        const next = [];
        if (gate) examined += fragments.length;
        for (const frag of fragments) {
            packScratch(scratch, frag.tri);
            if (gate) {
                if (!fragmentMeetsAny(frag.tri, scratch, trisB, members, boxOf)) { gateSkipped++; next.push(frag); continue; }
                gateTested++;
            }
            for (const piece of cutFragment(frag, scratch, plane, st)) next.push(piece);
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
        degenerateFallbacks: st.degenerateFallbacks,
        unresolvedCount: st.unresolvedCount,
        capped,
        gateSkipped,
        gateTested,
        groupsSkipped,
        examined,
    };
}

// ---- ROUND 8: THE PREDICATE, THE CUT, AND THE INDEX -----------------------------------------------------------

// Bounding-box padding for the gate's precondition below: the same 1e-9 absolute tolerance triTriIntersect.mjs
// and triClip.mjs use, so a pair touching within that tolerance is still offered to the exact test.
const BOX_PAD = 1e-9;
// The index is used only for triangles with more distinct planes than this: below it, building the grid costs
// more than it saves (a review measured the indexed path +30% on accumulation, +11% end to end, on box-vs-box
// fixtures with 1-4 planes per triangle; with this threshold at 16 the regression was gone and n=64 unchanged).
const INDEX_MIN_PLANES = 16;
function fragBox(tri) {
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const v of tri) for (let c = 0; c < 3; c++) { if (v[c] < b[c]) b[c] = v[c]; if (v[c] > b[3 + c]) b[3 + c] = v[c]; }
    return b;
}
function boxesMeet(a, b) {
    return a[0] <= b[3] + BOX_PAD && b[0] <= a[3] + BOX_PAD && a[1] <= b[4] + BOX_PAD && b[1] <= a[4] + BOX_PAD &&
           a[2] <= b[5] + BOX_PAD && b[2] <= a[5] + BOX_PAD;
}
function memberBoxCache(trisB) {
    const m = new Map();
    return (triB) => { let b = m.get(triB); if (!b) { b = fragBox(readTri(trisB, triB)); m.set(triB, b); } return b; };
}

/**
 * THE GATE'S PREDICATE, ONE DEFINITION FOR BOTH PATHS: does this fragment meet any of these B-triangles?
 * Round 7 used triTriIntersect() alone. Round 8 adds a (padded) bounding-box precondition, because
 * triTriIntersect() answers "degenerate" -- before its interval test -- for ANY pair where one triangle has a
 * vertex within EPS of the other's plane, however far apart the two lie within that plane. A spatial index
 * can only ever find pairs that are near each other, so without the precondition no index could reproduce
 * the gate. It is SOUND on its own: two triangles whose bounding boxes are disjoint share no point, so the
 * member cannot cross the fragment and skipping it keeps the no-straddle property. Measured before adoption:
 * it changed round 7's fragments on 7 of 1,722 triangles over flush-contact box fixtures and changed no
 * number in meshBoolean-selfcheck.mjs or meshBooleanBlast-selfcheck.mjs.
 */
function fragmentMeetsAny(fragTri, scratch, trisB, members, boxOf, fb = fragBox(fragTri)) {
    for (const triB of members) {
        if (!boxesMeet(fb, boxOf(triB))) continue;
        if (triTriIntersect(scratch, 0, trisB, triB).status !== "none") return true;
    }
    return false;
}

/**
 * Cut one fragment (already packed into `scratch`) by `plane`: returns [frag] when it is left whole, else its
 * pieces in order (front pieces, then back). Counts degenerate fallbacks and unresolved cases into `st`.
 * Shared by the plain loop and the indexed path, so the two cannot drift apart in what a cut does.
 */
function cutFragment(frag, scratch, plane, st) {
    const res = clipTriangleByPlane(scratch, 0, plane.n, plane.d);
    if (res.status === "allFront" || res.status === "allBack") return [frag];
    if (res.status === "clipped") {
        return [...res.front, ...res.back].map((t) => ({ tri: t, splitBy: [...frag.splitBy, plane.triBs[0]], lowConfidence: frag.lowConfidence }));
    }
    // Finding 2: resolve rather than blanket-flag-and-pass-through.
    st.degenerateFallbacks++;
    const r = resolveDegenerate(frag.tri, plane.n, plane.d);
    if (r.status === "allFront" || r.status === "allBack") return [frag];
    if (r.status === "clipped") {
        return [...r.front, ...r.back].map((t) => ({ tri: t, splitBy: [...frag.splitBy, plane.triBs[0]], lowConfidence: frag.lowConfidence }));
    }
    st.unresolvedCount++;
    return [{ tri: frag.tri, splitBy: frag.splitBy, lowConfidence: true }];
}

/**
 * THE INDEXED PATH. Same planes, same order, same prefilter, same predicate, same cuts as the plain loop -- the
 * only difference is WHICH fragments are asked. A uniform G x G grid over triA's bounding box, in the two axes
 * that remain after dropping triA's dominant normal axis (so a fragment's footprint is never degenerate), with
 * G = ceil(sqrt(distinct planes)) (measured best of 0.25x..4x that, at subdiv 48 and 64). Every live fragment
 * is registered in each cell its padded box overlaps; a plane asks only fragments registered in cells a
 * member's padded box overlaps, then applies the exact predicate. A fragment that meets a member shares a
 * point with it, so its box and the member's overlap in those two axes and they share a cell: the index never
 * misses a fragment the plain loop would cut. Order is kept by a doubly linked list -- a cut replaces the
 * fragment in place by its pieces -- so the output is the plain loop's output, byte for byte, and
 * gateSkipped keeps its meaning (live fragments this plane did not cut = live before - tested).
 */
function accumulateIndexed(trisA, triA, trisB, planes, candCount, maxFragments) {
    const t0 = readTri(trisA, triA);
    const e1 = sub(t0[1], t0[0]), e2 = sub(t0[2], t0[0]);
    const an = [Math.abs(e1[1] * e2[2] - e1[2] * e2[1]), Math.abs(e1[2] * e2[0] - e1[0] * e2[2]), Math.abs(e1[0] * e2[1] - e1[1] * e2[0])];
    const drop = an[0] >= an[1] && an[0] >= an[2] ? 0 : (an[1] >= an[2] ? 1 : 2);
    const ax = drop === 0 ? 1 : 0, bx = drop === 2 ? 1 : 2;
    const root = fragBox(t0);
    const lo0 = root[ax] - BOX_PAD, lo1 = root[bx] - BOX_PAD;
    const span0 = (root[3 + ax] - root[ax]) + 2 * BOX_PAD, span1 = (root[3 + bx] - root[bx]) + 2 * BOX_PAD;
    // An adversarial review found an extent that overflows (|coordinates| near 1e308, or Infinity from a
    // Float32Array) makes (x - lo) / span NaN, the root is registered in no cell, and triA comes back uncut
    // where the plain loop cuts it. The grid cannot map such a triangle; the caller falls back to the plain loop.
    if (!Number.isFinite(span0) || !Number.isFinite(span1) || !Number.isFinite(lo0) || !Number.isFinite(lo1)) return null;
    const G = Math.max(1, Math.min(256, Math.ceil(Math.sqrt(planes.length))));
    const cells = [];
    for (let c = 0; c < G * G; c++) cells.push([]);
    const cellOf = (x, lo, span) => {
        const k = span > 0 ? Math.floor((x - lo) / span * G) : 0;
        return k < 0 ? 0 : (k >= G ? G - 1 : k);
    };
    const F = [], box = [], alive = [], nxt = [], prv = [], stamp = [];
    let head = -1, live = 0, qstamp = 0;
    function insertAfter(frag, after) {
        const id = F.length, b = fragBox(frag.tri);
        F.push(frag); box.push(b); alive.push(true); stamp.push(0);
        if (after < 0) { nxt.push(head); prv.push(-1); if (head >= 0) prv[head] = id; head = id; }
        else { nxt.push(nxt[after]); prv.push(after); if (nxt[after] >= 0) prv[nxt[after]] = id; nxt[after] = id; }
        live++;
        const i0 = cellOf(b[ax] - BOX_PAD, lo0, span0), i1 = cellOf(b[3 + ax] + BOX_PAD, lo0, span0);
        const j0 = cellOf(b[bx] - BOX_PAD, lo1, span1), j1 = cellOf(b[3 + bx] + BOX_PAD, lo1, span1);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) cells[i * G + j].push(id);
        return id;
    }
    function unlink(id) {
        alive[id] = false; live--;
        F[id] = null; box[id] = null;   // let a cut fragment go (a review measured ~2x the plain loop's heap without this)
        if (prv[id] >= 0) nxt[prv[id]] = nxt[id]; else head = nxt[id];
        if (nxt[id] >= 0) prv[nxt[id]] = prv[id];
    }
    insertAfter({ tri: t0, splitBy: [] }, -1);

    let capped = false, appliedPlaneCount = 0, gateSkipped = 0, gateTested = 0, groupsSkipped = 0, examined = 0;
    let listScans = 0;
    const st = { degenerateFallbacks: 0, unresolvedCount: 0 };
    const scratch = new Float64Array(9);
    const boxOf = memberBoxCache(trisB);
    for (const plane of planes) {
        if (live >= maxFragments) { capped = true; break; }
        appliedPlaneCount++;
        const members = plane.triBs.filter((triB) => triTriIntersect(trisA, triA, trisB, triB).status !== "none");
        if (members.length === 0) { gateSkipped += live; groupsSkipped++; continue; }
        // Snapshot the candidates BEFORE cutting anything: pieces inserted by this plane must not be asked again.
        qstamp++;
        const cand = [];
        // ADAPTIVE FALLBACK (adversarial review): when fragment boxes are large -- nested slivers whose boxes all
        // contain every later member's box -- the cells under a plane's members hold nearly every live fragment,
        // many times over, and the index did P^2 work where the plain loop did P (measured 6x slower, 2x heap).
        // So price the query first by the cell entries it would read; if that is more than the live fragment
        // count, just take every live fragment from the list. Either way the exact predicate decides, so the
        // output cannot change; only the cost is bounded by the plain loop's.
        let price = 0;
        const ranges = [];
        for (const triB of members) {
            const mb = boxOf(triB);
            const r = [cellOf(mb[ax] - BOX_PAD, lo0, span0), cellOf(mb[3 + ax] + BOX_PAD, lo0, span0),
                       cellOf(mb[bx] - BOX_PAD, lo1, span1), cellOf(mb[3 + bx] + BOX_PAD, lo1, span1)];
            ranges.push(r);
            for (let i = r[0]; i <= r[1]; i++) for (let j = r[2]; j <= r[3]; j++) price += cells[i * G + j].length;
        }
        if (price > live) {
            listScans++;
            for (let id = head; id >= 0; id = nxt[id]) cand.push(id);
        } else for (const [i0, i1, j0, j1] of ranges) {
            for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
                const cell = cells[i * G + j];
                let w = 0;
                for (let r = 0; r < cell.length; r++) {
                    const id = cell[r];
                    if (!alive[id]) continue;          // lazy compaction: dead ids fall out as cells are read
                    cell[w++] = id;
                    if (stamp[id] !== qstamp) { stamp[id] = qstamp; cand.push(id); }
                }
                cell.length = w;
            }
        }
        examined += cand.length;
        const liveBefore = live;
        let tested = 0;
        for (const id of cand) {
            const frag = F[id];
            packScratch(scratch, frag.tri);
            if (!fragmentMeetsAny(frag.tri, scratch, trisB, members, boxOf, box[id])) continue;
            tested++;
            const pieces = cutFragment(frag, scratch, plane, st);
            if (pieces.length === 1 && pieces[0] === frag) continue;
            let after = prv[id];
            unlink(id);
            for (const piece of pieces) after = insertAfter(piece, after);
        }
        gateTested += tested;
        gateSkipped += liveBefore - tested;
        if (live >= maxFragments) { capped = true; break; }
    }
    const fragments = [];
    for (let id = head; id >= 0; id = nxt[id]) fragments.push(F[id]);
    return {
        fragments,
        planeCount: appliedPlaneCount,
        duplicatePlanesCollapsed: candCount - planes.length,
        degenerateFallbacks: st.degenerateFallbacks,
        unresolvedCount: st.unresolvedCount,
        capped,
        gateSkipped,
        gateTested,
        groupsSkipped,
        examined,
        listScans,
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
