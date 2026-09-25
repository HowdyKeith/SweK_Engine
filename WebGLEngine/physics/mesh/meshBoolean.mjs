// WebGLEngine/physics/mesh/meshBoolean.mjs
//
// *** ROUND 6 OF THE BVH-CSG ARC. *** tools/ship/nextRounds.mjs's "bvh-csg-speed-vs-manifold-tradeoff" entry
// scoped a from-scratch BVH-CSG port into: (a) dual-BVH broad phase -- DONE, bvhPairOverlap.mjs -- (b)
// triangle-triangle intersection -- DONE, triTriIntersect.mjs -- (c) triangle-vs-plane clipping -- DONE,
// triClip.mjs -- (d) inside/outside point classification -- DONE, meshPointClassify.mjs -- (e) multi-plane
// fragment accumulation -- DONE, triFragmentAccumulate.mjs. That file's own header named the remaining gap
// plainly: it produces a classifiable fragment set for ONE triangle of mesh A against mesh B, but does not
// assemble a result mesh and does not implement per-operation (union/subtract/intersect) fragment-keep rules.
// THIS FILE is that piece: a whole-mesh driver that classifies every triangle of BOTH meshes against the
// other, applies a keep-rule table, and concatenates the survivors into one output triangle soup.
//
// THE ALGORITHM, DERIVED FROM FIRST PRINCIPLES AND CROSS-CHECKED AGAINST physics/mesh/meshCSG.mjs's OWN
// TRUSTED BSP subtract()/union()/intersect() (read in full before this round started, not assumed
// equivalent): classify every fragment of A against B as A_out (pointInMesh(bvhB,...).inside===false) or
// A_in (true), and symmetrically every fragment of B against A as B_out/B_in. triClip.mjs's clipping (and
// triFragmentAccumulate.mjs's resolveDegenerate()) both preserve the original triangle's own cyclic winding
// by construction, so a fragment of A still carries A's own outward-facing winding unless deliberately
// flipped, and likewise for B.
//
// boundary(A union B) = A_out union B_out, both UNFLIPPED -- near an A_out fragment, B is not locally
//   present, so A's own outward normal still points away from the union's interior there (symmetric for B).
// boundary(A intersect B) = A_in union B_in, both UNFLIPPED -- near an A_in fragment, deep inside B, the
//   intersection's interior locally coincides with A's own interior, so A's own outward normal is still
//   correct (symmetric for B).
// A - B == A intersect (not B), where (not B) is B with its outward normal reversed. boundary(A-B) = A_out
//   (unflipped, same argument as union) union (B_in, FLIPPED) -- at a B_in fragment, one side is B's own
//   interior (removed) and the other is B's exterior-but-still-inside-A (kept); B's own outward normal points
//   toward the KEPT side (the wrong direction for a boundary normal of the result, which must point toward
//   the REMOVED side -- the carved-out cavity), so it is reversed.
//
// Cross-checked against meshCSG.mjs's own subtract() doc comment ("fragments of A's original surface that
// survived clipping... and polygons of B turned inside out to cap the hole") -- same semantics, independently
// re-derived rather than copied, and confirmed numerically (see this file's own gate): a clean box-minus-box
// case matches meshCSG's BSP-computed volume to float64 noise, as does a hand-derived unit-cube-minus-corner
// case (exact 7.875) and an intersect volume cross-check (exact 0.96 for the same fixture).
//
// | op        | A_out (A outside B) | A_in (A inside B) | B_out (B outside A) | B_in (B inside A) |
// |-----------|----------------------|--------------------|----------------------|---------------------|
// | union     | keep, unflipped      | drop               | keep, unflipped      | drop                |
// | subtract  | keep, unflipped      | drop               | drop                 | keep, FLIPPED       |
// | intersect | drop                 | keep, unflipped    | drop                 | keep, unflipped     |
//
// Winding-flip correctness was verified directly, not merely derived: for every B_in fragment under subtract
// on the gate's own box-minus-box fixture, B's own pre-flip outward normal was confirmed to point AWAY from
// B's own center (the correct convention for B's own solid), and the post-flip normal was confirmed to point
// TOWARD B's own center -- i.e. into the carved cavity, the correct outward normal for the result A-B at
// that point. 14/14 fragments checked both ways, on a real (non-trivial-position) box-minus-box fixture.
//
// THE EMPTY-CANDIDATE-LIST SHORTCUT: a triangle of A with zero pairOverlap() candidates against B skips
// accumulateFragments() entirely and classifies its own centroid directly via pointInMesh(). This is not
// merely an optimization -- it is STRUCTURALLY GUARANTEED correct by accumulateFragments()'s own existing
// code (candidateTriBs=[] makes its per-plane loop never run, falling through to the whole original triangle
// as one unsplit fragment -- exactly what the shortcut computes directly), given bvhPairOverlap.mjs's own
// documented conservative-superset contract (a real triangle-triangle intersection implies AABB overlap, so
// zero candidates means no B-triangle can intersect triA at all) and meshPointClassify.mjs's own watertight-
// input precondition (already named by round 4, not a new assumption this round adds): triA touches no point
// of B's surface, so every point of triA -- not just the centroid -- is on the same side of B. Implemented as
// an explicit early return for auditability (the reasoning is visible at the call site), not relied on as a
// meaningful performance win (the actual compute saved is a Map.get() plus a trivial array alloc).
//
// THE ambiguous-FRAGMENT POLICY: a fragment is flagged `ambiguous:true` if it carries triFragmentAccumulate's
// own lowConfidence flag (the all-three-vertices-on-a-candidate-plane case, genuinely unresolved by that
// module) OR if pointInMesh()'s own `agreement` is below 1.0 (ANY direction disagreement, not just a low
// fraction -- round 4's own header explains why: DEFAULT_DIRS were specifically spread ~59 degrees apart so
// that disagreement is itself already a strong signal, not noise). AMBIGUOUS FRAGMENTS ARE NEVER DROPPED,
// only flagged and propagated into the output's own ambiguousTriIndices. This was measured, not merely
// asserted by analogy to meshCSG.mjs's own history of dropped-sliver holes: on this file's own flush-face
// union fixture (two boxes glued face-to-face, the worst case for ambiguity -- see below), KEEPING ambiguous
// fragments gives the exact oracle volume (16, diff 0); a gate-only toggle that DROPS them instead collapses
// the output from 22 triangles to 4 and the volume from 16 to 5.33 -- a 10.67-unit error, not a rounding
// difference. "Keep" is not merely the safer-sounding default here, it is the only one that isn't badly wrong.
//
// A REAL, MEASURED, UNRESOLVED GAP THIS ROUND FOUND AND DID NOT FIX: TOUCHING / ZERO-VOLUME CONTACTS.
// meshCSG-selfcheck.mjs's own section 9 ("the degenerate contacts") has 8 hand-oracled WALL-vs-cutter
// fixtures with an independent axis-interval-overlap volume oracle. Run through this file's own subtract()
// path (see the gate's own "degenerate contacts" section, which reproduces this directly): 5 of 8 match the
// oracle to float64 noise (<=1.1e-14 absolute), INCLUDING two of the BSP's own hardest cases (a cutter
// IDENTICAL to the wall, and a through-cut with both faces flush) -- ray-crossing parity and multi-plane
// clipping handle full-coincidence cases the BSP's own COPLANAR bucket was built for, cleanly. But THREE
// fixtures that involve a face of the cutter sitting FLUSH against a face of the wall with otherwise ZERO
// interior overlap ("a face flush against a face", "...flush and hanging off the side", "a corner on a face
// interior") come back with a real, non-noise volume error: +0.4 (1.4% relative), +0.2 (0.69%), and +0.1
// (0.35%) respectively -- all three OVER-counting volume, not under. This was found by this round's own
// research phase (which flagged the first and third case) and INDEPENDENTLY CONFIRMED, and EXTENDED to a
// third failing case, by this round's own scratch-verification before this file was written.
//   ROOT CAUSE, TRACED PRECISELY DURING THIS ROUND'S FOLLOW-UP ADVERSARIAL-REVIEW FIX PASS (an earlier draft
//   of this header guessed the mechanism wrong -- corrected here after actually instrumenting it, not left
//   standing): on all 3 failing fixtures, EVERY triangle of both meshes takes the empty-candidate shortcut --
//   pairOverlap() finds literally ZERO AABB-overlapping candidate pairs between the two "flush" faces, even
//   though they are geometrically meant to touch exactly. Why: boxPolys() computes a face position as
//   `c[i] - h[i]` / `c[i] + h[i]`, and two independently-computed expressions that are mathematically equal
//   (e.g. the wall's own literal 0.3 vs. a cutter's own 0.8-0.5) are not always bit-identical in float64 --
//   measured directly: 0.8-0.5 === 0.30000000000000004, not 0.3, a 5.55e-17 gap. That sub-ULP gap is enough
//   for the AABB-overlap test (an exact, non-fuzzy predicate by design, see bvhPairOverlap.mjs's own header)
//   to correctly report NO overlap between the two faces' triangles. So neither mesh ever gets clipped by the
//   other at all here -- the classification is decided purely by the empty-candidate shortcut, classifying
//   each WHOLE, UNSPLIT face triangle's centroid via pointInMesh() against the other mesh directly. That
//   centroid sits ~5.55e-17 away from the other mesh's own surface -- close enough that pointInMesh()'s
//   `agreement` DOES correctly read below 1.0 and the fragment IS correctly flagged ambiguous (confirmed:
//   the face-flush and corner-on-face-interior fixtures both report exactly 2 ambiguous output triangles,
//   the flush-and-hanging-off fixture reports 1). The "keep ambiguous, never drop" policy then keeps these
//   flagged fragments as designed -- but because they are WHOLE, FACE-SIZED triangles (not small clipped
//   slivers, since nothing ever clipped them), one kept-but-wrong whole triangle distorts the volume by an
//   amount proportional to its own area, not by a vanishing sliver's worth. The policy's own justification
//   (measured on the flush-face UNION fixture, where the full kept-ambiguous SET together still forms a
//   valid closed cap) implicitly assumed ambiguous fragments are small enough, or numerous and self-
//   cancelling enough, not to matter much individually -- an assumption this fixture family breaks.
// NOT FIXED THIS ROUND: a proper fix needs either a deterministic structural tiebreak (comparing the
// fragment's own source-triangle plane against the touching candidate plane's orientation, analogous to
// meshCSG.mjs's own splitPolygon() COPLANAR-front/COPLANAR-back split) or a size/significance-aware ambiguous
// policy that treats a face-sized whole triangle differently from a genuine sliver; both are concrete, named
// follow-up work, not attempted here. Reproduced directly in this file's own gate (not hidden) with the exact
// measured errors above, matching every prior round's own "name the residual gap honestly" convention.
//
// A SECOND, LARGER, ALREADY-DISCLOSED-ELSEWHERE GAP THIS ROUND INHERITS RATHER THAN INTRODUCES: A's and B's
// independently-clipped cut boundaries do NOT produce bit-coincident seam vertices, even on a clean
// (non-degenerate) box-minus-box case -- each side derives its own cutting-plane parameters from an
// arbitrary representative candidate triangle on the OTHER mesh and interpolates through a different,
// generally different-length chain of clips. Measured directly on this file's own primary gate fixture: of A's
// own 104 cut-boundary vertices, only 18 land within 1e-6 of some B cut-boundary vertex. This is the exact
// same class of gap meshCSG.mjs's own header already measured and only partially closed with a dedicated
// snap/merge/weld subsystem (~250 lines) this round does not have or attempt to build -- meshCSG.mjs's own
// settle() pipeline is explicitly OUT OF SCOPE here. Consequently, watertight() on this file's own raw output
// (no snap/weld) is NOT asserted true -- only MEASURED as a non-regression baseline (37 of 189 directed edges
// unmatched on the gate's own primary box-minus-box fixture). A caller wanting a rendering-safe, gap-free
// mesh from this file's output must run it through a separate weld/merge pass (e.g. adapting meshCSG.mjs's
// own snapVertices/weldTJunctions, or a symmetric tri-tri-intersection-sharing redesign using round 2's
// triTriIntersect.mjs) -- neither is built this round.
//
// SCOPE: `subtract` is the only operation this round's own gate requires to pass, on axis-aligned box-minus-
// box fixtures (plus the reused meshCSG-selfcheck.mjs degenerate-contact fixtures, 5 of 8 passing, 3 named
// above as a known gap). `union` and `intersect` share the identical keep-rule-table code path (it costs
// nothing extra to write all three branches of one small function) and were spot-verified against meshCSG's
// own oracle during scratch-verification (union: exact on the flush-face fixture; intersect: exact 0.96 on
// the primary fixture) but are NOT the fixtures this round's own gate asserts pass/fail on -- named here
// honestly as "present but not yet gated", matching how round 5 itself scoped down to what it could actually
// measure. Explicitly OUT of scope, not attempted: edge-exact watertightness as a guarantee; a dedicated
// COPLANAR-front/COPLANAR-back structural tiebreak for the touching-contact gap above; any snap/weld/merge
// cleanup pass on this file's own output; non-box, non-axis-aligned fixtures; a formal CSG property-list
// audit comparable to meshCSG-selfcheck.mjs's own (that is tools/ship/nextRounds.mjs backlog item #25, for
// the EXISTING BSP path, and has not happened yet either).
//
// TWO REAL BUGS FOUND BY AN ADVERSARIAL REVIEW OF THIS ROUND'S ORIGINAL DIFF, ONE FIXED HERE, ONE LEFT
// HONESTLY UNRESOLVED:
//   (1) FIXED -- SILENT EMPTY OUTPUT ON AN UNRECOGNIZED `op`. keepA()/bKeepAndFlip() were written as a chain
//   of `op === "union"/"subtract"/"intersect"` checks with no default branch: any other string (a typo, wrong
//   case, or a plausible-sounding alias like "difference") made keepA() return false and bKeepAndFlip() return
//   null for EVERY fragment of both meshes, so assembleBoolean() silently kept nothing -- a 0-triangle result
//   with no thrown error and no signal anywhere in the return shape that `op` wasn't understood. Measured
//   directly: meshBoolean(..., "Subtract") (wrong case) on the gate's own primary fixture returned triCount:0
//   instead of the correct ~20-triangle result. This is a materially worse failure mode than the touching-
//   contact gap below (a measurably-wrong but plausible-looking volume) -- an empty mesh can read as
//   "correctly nothing to do" rather than "the op string was wrong". Fixed with an explicit validation guard
//   at the top of assembleBoolean() that throws on any op outside the three recognized literals.
//   (2) LEFT UNRESOLVED, A NEW MANIFESTATION OF THE SAME ROOT CAUSE AS THE TOUCHING-CONTACT GAP ABOVE -- A
//   DEGENERATE (ZERO-VOLUME) OPERAND EMBEDDED IN THE OTHER MESH'S INTERIOR YIELDS A WRONG-SIGN, NON-NOISE
//   VOLUME ERROR. Probed with A = a zero-volume flat rectangle (M.boxPolys([0,0,0],[0,1,1]), one half-extent
//   forced to 0) sitting strictly inside B = a normal unit box (M.boxPolys([0,0,0],[1,1,1])), touching no
//   boundary of B at all. Mathematically, since V(A)=0: union(A,B) should equal B exactly (volume 8),
//   subtract(A,B) should be empty (volume 0), intersect(A,B) should be empty (volume 0). MEASURED instead:
//   union volume 7.833333333333333 (2.08% relative error), subtract volume -0.16666666666666666 (a NEGATIVE
//   "volume" from a single surviving triangle -- wrong SIGN, not just wrong magnitude), intersect volume
//   0.16666666666666666 (should be exactly 0). Root cause, as far as this round investigated: of B's 28
//   fragments classified against A, exactly ONE lands its centroid on A's own zero-measure flat surface and
//   is correctly flagged ambiguous:true (pointInMesh's agreement<1). The shipped "never drop an ambiguous
//   fragment" policy (justified above purely by the flush-face-UNION fixture, where the full kept-ambiguous
//   SET together still forms a valid closed cap and the volume comes out exact) then keeps this single,
//   isolated fragment -- but because A itself is degenerate (a 2D surface with no interior, not a solid),
//   this lone kept fragment is never balanced by a matching partner the way it is in the flush-face case, so
//   it injects a spurious, non-cancelling term into the divergence-theorem volume integral. Confirmed
//   axis-specific: flattening a DIFFERENT half-extent (Y or Z instead of X) gives the exact correct answer
//   every time; this is not a general degenerate-input failure, it is specific to this exact geometric
//   configuration. NOT FIXED THIS ROUND: meshBoolean.mjs, like meshPointClassify.mjs before it, now
//   explicitly assumes NON-DEGENERATE (strictly positive-volume) operand meshes as a stated precondition, not
//   merely watertight ones -- a proper fix needs detecting a near-zero-volume operand and either special-
//   casing it (contributing nothing beyond epsilon to inside/outside decisions) or flagging the whole result
//   low-confidence, neither attempted here. Reproduced directly in this file's own gate (not hidden).
//
// Built with ZERO changes to mesh/meshBVH.mjs, bvhPairOverlap.mjs, triClip.mjs, meshPointClassify.mjs, or
// triFragmentAccumulate.mjs, continuing every prior round's own convention. (Round 6's statement. Round 7 DID
// change triFragmentAccumulate.mjs -- one opt-in option, default off, see below -- rather than copy its
// private resolveDegenerate() into a new file to avoid touching it.)
//
// *** ROUND 7: THIS FILE WAS WRONG ON THE WORKLOAD THE ARC EXISTS FOR, AND NOTHING IN ITS OWN GATE COULD SEE IT.
// *** Every round-6 fixture was two 12-triangle boxes. Run on physics/mesh/meshCSG.mjs's own wall-minus-jagged-
// blob fixture (a 12-triangle wall, a 224-triangle blob), round 6 returned a volume 0.2012 units wrong (0.74%),
// the wrong answer carried only by a `capped:true` inside stats.a. Cause: triFragmentAccumulate.mjs split each
// live fragment by every candidate B-plane as an INFINITE plane, so each of the blob's facets sliced the wall's
// big face triangles edge to edge; the full arrangement is 18,129 triangles for one blast, and the default
// 256-fragment cap cut it off with real cuts still unapplied. TWO CHANGES, BOTH DEFAULTS OF THIS FILE:
//   (1) accOpts.gateByIntersection defaults TRUE -- triFragmentAccumulate.mjs's ROUND 7 option, which offers a
//       plane to a fragment only if the fragment actually meets one of that plane's B-triangles (the argument
//       that this still leaves no fragment straddling B's surface is in that file's header). Same blast: 473
//       triangles, volume within 3.6e-15 of the BSP, cap never approached.
//   (2) accOpts.maxFragments defaults to MESH_BOOLEAN_MAX_FRAGMENTS (65536), not 256 -- because the GATED
//       demand is real carving, not waste, and meshCSG-selfcheck.mjs's twelve-blast wall measured up to 269
//       fragments for one wall triangle on shot 2. At 256 that chain capped and came back 5.6e-5 wrong. And
//       the result now carries a top-level `capped` (true = cuts may have been skipped; treat as unreliable).
// Round 6's behaviour stays reachable (accOpts:{gateByIntersection:false, maxFragments:256}) and is reproduced
// in physics/mesh/meshBooleanBlast-selfcheck.mjs section 1 so the before/after lives in a gate. That file is
// the head-to-head against meshCSG.mjs on its own one-blast and twelve-blast fixtures: see it for the numbers,
// including where the two disagree and which one a 1000x-scale run says is right.
//
// WHAT ROUND 7's ADVERSARIAL REVIEW CHANGED OR NAMED HERE (three reviewers: soundness, claims, integration):
//   FIXED -- accOpts keys present but undefined/null used to override the two defaults above ({maxFragments:
//   undefined} fell through to 256 and reproduced the 5.62e-5 twelve-blast error; {gateByIntersection:
//   undefined} turned the gate off). Only defined keys override now. The round-5 plane-dedup hole and the
//   coplanar-group cost are fixed in triFragmentAccumulate.mjs (see its header).
//   NAMED, NOT FIXED -- (a) SCALING: cost grows roughly quadratically with how finely B is tessellated across
//   one A-triangle; 7x slower than meshCSG's BSP at a 16,128-triangle blob, 7.1 minutes and capped at 65,024
//   (triFragmentAccumulate.mjs has the table). Faster than the BSP only on small-to-moderate inputs like the
//   ones the head-to-head gate runs. ROUND 8 attacked the plane-vs-every-fragment scan: a box precondition in the
//   gate's predicate (most of the gain) and a spatial index (byte-identical output) -- 1.3-1.5x at subdiv 32-64
//   and 2.1x at 96, same-machine paired runs (subdiv 64: 10.7 s -> 7.1 s; the BSP 1.7 s). Fragment count from
//   full-plane cuts, and the per-fragment classification it drives, remain; triFragmentAccumulate.mjs's ROUND 8
//   paragraph has the profile and the corrected attribution. (b) SCALE: absolute tolerances (1e-9 plane dedup, triClip's EPS,
//   pointInMesh's) make results wrong below ~1e-4 scale -- up to 34% of volume at 1e-6..7e-5 -- gated and
//   ungated alike; and at coordinates ~1e8 the gate can skip a pair whose overlap is ~4 ULP (5 of 60 far-offset
//   fuzz cases, <=9.1e-9 relative volume). (c) PRE-EXISTING GAPS the gate neither causes nor fixes: two unit
//   boxes with one face tilted 1e-10..3e-9 rad about an edge, intersected, return -0.12 against a true ~1e-10
//   (the touching-contact family above, but with genuinely overlapping faces); a blob minus the same blob
//   rotated by 1e-12..1e-6 returns up to -1.43 with non-closed output.
"use strict";

import { pairOverlap } from "./bvhPairOverlap.mjs";
import { groupCandidatesByTriA, accumulateFragments } from "./triFragmentAccumulate.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";

function readTri(tris, t) {
    const o = t * 9;
    return [
        [tris[o], tris[o + 1], tris[o + 2]],
        [tris[o + 3], tris[o + 4], tris[o + 5]],
        [tris[o + 6], tris[o + 7], tris[o + 8]],
    ];
}
function centroid(tri) {
    return [
        (tri[0][0] + tri[1][0] + tri[2][0]) / 3,
        (tri[0][1] + tri[1][1] + tri[2][1]) / 3,
        (tri[0][2] + tri[1][2] + tri[2][2]) / 3,
    ];
}
// Swap two vertices: negates the winding/normal. Matches meshCSG.mjs's own `p.vs.reverse()` convention for a
// 3-vertex ring (reversing [a,b,c] gives [c,b,a], the same cyclic orientation flip as this swap).
function flipWinding(tri) { return [tri[0], tri[2], tri[1]]; }

/**
 * Classify every triangle/fragment of `trisSelf` against `trisOther`'s whole mesh: for each triangle of self,
 * accumulate its fragments against every relevant candidate plane of other (or take the empty-candidate
 * shortcut -- see this file's own header), then classify each fragment's centroid via pointInMesh().
 *
 * @param {Float64Array|Float32Array} trisSelf
 * @param {import("../../mesh/meshBVH.mjs").MeshBVH} bvhSelf  built over trisSelf
 * @param {Float64Array|Float32Array} trisOther
 * @param {import("../../mesh/meshBVH.mjs").MeshBVH} bvhOther  built over trisOther
 * @param {{accOpts?:object, pointInMeshOpts?:object, agreementThreshold?:number}} [opts]
 *   accOpts defaults to {gateByIntersection:true, maxFragments:MESH_BOOLEAN_MAX_FRAGMENTS} since round 7 --
 *   NOT triFragmentAccumulate.mjs's own defaults; defined caller keys override, undefined/null ones do not.
 * @returns {{fragments:{tri:number[][], inside:boolean, ambiguous:boolean}[], stats:{triCount:number,
 *   emptyCandidateShortcuts:number, accumulatedFragments:number, capped:boolean, unresolvedCount:number,
 *   gateSkipped:number, gateTested:number, examined:number}}}
 */
export function classifyMeshAgainstOther(trisSelf, bvhSelf, trisOther, bvhOther, opts = {}) {
    const agreementThreshold = opts.agreementThreshold ?? 1;
    const pairs = pairOverlap(bvhSelf, bvhOther);
    const byTri = groupCandidatesByTriA(pairs);
    const triCount = trisSelf.length / 9;
    const fragments = [];
    let emptyCandidateShortcuts = 0, accumulatedFragments = 0, capped = false, unresolvedCount = 0;
    let gateSkipped = 0, gateTested = 0, examined = 0;
    // Round 7: the intersection gate is ON by default here, and the per-triangle fragment cap is raised from
    // triFragmentAccumulate.mjs's own 256 to MESH_BOOLEAN_MAX_FRAGMENTS -- see this file's own header for both.
    // A caller can still pass accOpts:{gateByIntersection:false, maxFragments:256} to get round 6's behaviour.
    // Only DEFINED caller keys override: an adversarial review found {maxFragments: undefined} (or null) spread
    // over the defaults, then fell through triFragmentAccumulate.mjs's own `??` to its 256 cap -- the exact
    // twelve-blast failure above (5.62e-5 wrong) -- and {gateByIntersection: undefined} silently turned the gate
    // off. A value that is present but not a real override is now ignored rather than obeyed.
    const accOpts = { gateByIntersection: true, maxFragments: MESH_BOOLEAN_MAX_FRAGMENTS };
    for (const [k, v] of Object.entries(opts.accOpts || {})) if (v !== undefined && v !== null) accOpts[k] = v;

    for (let t = 0; t < triCount; t++) {
        const cands = byTri.get(t);
        if (!cands || cands.length === 0) {
            // See this file's own header: structurally guaranteed equivalent to running accumulateFragments()
            // on an empty candidate list, taken as an explicit early return for auditability.
            emptyCandidateShortcuts++;
            const tri = readTri(trisSelf, t);
            const c = centroid(tri);
            const cls = pointInMesh(bvhOther, c[0], c[1], c[2], opts.pointInMeshOpts);
            fragments.push({ tri, inside: cls.inside, ambiguous: cls.agreement < agreementThreshold });
            continue;
        }
        const acc = accumulateFragments(trisSelf, t, trisOther, cands, accOpts);
        if (acc.capped) capped = true;
        unresolvedCount += acc.unresolvedCount;
        gateSkipped += acc.gateSkipped;
        gateTested += acc.gateTested;
        examined += acc.examined;
        for (const frag of acc.fragments) {
            accumulatedFragments++;
            const c = centroid(frag.tri);
            const cls = pointInMesh(bvhOther, c[0], c[1], c[2], opts.pointInMeshOpts);
            const ambiguous = !!frag.lowConfidence || cls.agreement < agreementThreshold;
            fragments.push({ tri: frag.tri, inside: cls.inside, ambiguous });
        }
    }
    return { fragments, stats: { triCount, emptyCandidateShortcuts, accumulatedFragments, capped, unresolvedCount,
                                 gateSkipped, gateTested, examined } };
}

// The keep-rule table -- see this file's own header for the boundary-of-the-result derivation and its
// cross-check against meshCSG.mjs's own subtract()/union()/intersect(). Never averaged or softened: exactly
// these six (op, bucket) combinations keep a fragment, and subtract's B_in bucket is the only one flipped.
function keepA(op, inside) {
    return (op === "union" && !inside) || (op === "subtract" && !inside) || (op === "intersect" && inside);
}
const VALID_OPS = new Set(["union", "subtract", "intersect"]);
/**
 * Per-triangle fragment cap meshBoolean() hands triFragmentAccumulate.mjs by default (its own default is 256).
 * Measured at round 7: with the intersection gate on, meshCSG-selfcheck.mjs's twelve-blast wall needs up to 269
 * fragments for ONE wall triangle (shot 2 -- a face triangle carved round a 224-facet blob, real cuts, not
 * waste), so 256 silently left cuts unapplied and the chain came back 5.6e-5 units of volume wrong. Raised
 * with ~240x headroom over that measurement; hitting it is reported as the top-level `capped` in meshBoolean()'s
 * return and means the result MAY BE WRONG, not approximate: cuts may have been left unapplied. (Not
 * certainly wrong -- triFragmentAccumulate.mjs also reports capped when the LAST plane lands exactly on the
 * cap with every cut applied; an adversarial review measured that false alarm on a 9-fragment fixture.)
 */
export const MESH_BOOLEAN_MAX_FRAGMENTS = 65536;
function bKeepAndFlip(op, inside) {
    if (op === "union") return inside ? null : { flip: false };
    if (op === "subtract") return inside ? { flip: true } : null;
    if (op === "intersect") return inside ? { flip: false } : null;
    return null;
}

/**
 * Assemble classified fragments of A (vs B) and B (vs A) into one output triangle soup, per the keep-rule
 * table. Never drops an `ambiguous` fragment -- see this file's own header for why (measured, not assumed).
 *
 * @param {{fragments:object[]}} classifiedA  classifyMeshAgainstOther(trisA, bvhA, trisB, bvhB, ...)'s result
 * @param {{fragments:object[]}} classifiedB  classifyMeshAgainstOther(trisB, bvhB, trisA, bvhA, ...)'s result
 * @param {"union"|"subtract"|"intersect"} op
 * @returns {{tris:number[][][], ambiguousTriIndices:number[]}}
 */
export function assembleBoolean(classifiedA, classifiedB, op) {
    // An adversarial review of this round found that an unrecognized `op` (a typo, wrong case, or a
    // plausible-sounding alias like "difference") fell through keepA()/bKeepAndFlip()'s own if-chains with no
    // else branch, silently keeping nothing and returning an empty mesh with no error and no signal anywhere
    // in the return shape -- a materially worse failure mode than a wrong-but-nonempty result, since an empty
    // mesh can look like "correctly nothing to do" rather than "the op string was wrong". Fixed by validating
    // up front.
    if (!VALID_OPS.has(op)) {
        throw new Error('meshBoolean: unrecognized op "' + op + '" (expected "union", "subtract", or "intersect")');
    }
    const outTris = [], ambiguousTriIndices = [];
    for (const f of classifiedA.fragments) {
        if (!keepA(op, f.inside)) continue;
        outTris.push(f.tri);
        if (f.ambiguous) ambiguousTriIndices.push(outTris.length - 1);
    }
    for (const f of classifiedB.fragments) {
        const decision = bKeepAndFlip(op, f.inside);
        if (!decision) continue;
        outTris.push(decision.flip ? flipWinding(f.tri) : f.tri);
        if (f.ambiguous) ambiguousTriIndices.push(outTris.length - 1);
    }
    return { tris: outTris, ambiguousTriIndices };
}

/**
 * The whole-mesh boolean driver: classify A against B and B against A (each a single pairOverlap() +
 * groupCandidatesByTriA() pass, per round 5's own one-time-broad-phase convention), then assemble per the
 * keep-rule table. See this file's own header for the algorithm derivation, the empty-candidate shortcut, the
 * ambiguous-fragment policy, and the two named residual gaps (touching/zero-volume contacts; non-coincident
 * A/B seams).
 *
 * @param {Float64Array|Float32Array} trisA
 * @param {import("../../mesh/meshBVH.mjs").MeshBVH} bvhA
 * @param {Float64Array|Float32Array} trisB
 * @param {import("../../mesh/meshBVH.mjs").MeshBVH} bvhB
 * @param {"union"|"subtract"|"intersect"} op
 * @param {{accOpts?:object, pointInMeshOpts?:object, agreementThreshold?:number}} [opts]
 * @returns {{tris:Float64Array, triCount:number, ambiguousTriIndices:number[], capped:boolean,
 *   stats:{a:object,b:object}}}
 *   tris: flat 9-floats-per-triangle buffer, the same layout mesh/meshBVH.mjs's MeshBVH constructor takes.
 *   capped: true if EITHER side hit the per-triangle fragment cap. Treat a capped result as unreliable: cuts
 *     may have been left unapplied (it is not CERTAINLY wrong -- the cap can also trip exactly as the last
 *     plane finishes). Surfaced at the top level since round 7, where it was found buried in stats.a.capped
 *     while the volume came back 0.74% off.
 */
export function meshBoolean(trisA, bvhA, trisB, bvhB, op, opts = {}) {
    const classifiedA = classifyMeshAgainstOther(trisA, bvhA, trisB, bvhB, opts);
    const classifiedB = classifyMeshAgainstOther(trisB, bvhB, trisA, bvhA, opts);
    const { tris, ambiguousTriIndices } = assembleBoolean(classifiedA, classifiedB, op);
    const buf = new Float64Array(tris.length * 9);
    for (let i = 0; i < tris.length; i++) {
        for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) buf[i * 9 + v * 3 + c] = tris[i][v][c];
    }
    const capped = classifiedA.stats.capped || classifiedB.stats.capped;
    return { tris: buf, triCount: tris.length, ambiguousTriIndices, capped,
             stats: { a: classifiedA.stats, b: classifiedB.stats } };
}
