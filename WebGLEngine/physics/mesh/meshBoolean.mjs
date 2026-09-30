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
// [ROUND 12: FIXED -- the tiebreak named below was built; see the ROUND 12 paragraph. Kept as round 6 wrote it.]
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
//   [ROUND 12: FIXED -- an operand thinner than CONTACT_EPS on average is an empty solid; ROUND 12 paragraph.]
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
//   ungated alike [ROUND 11: fixed for uniform scale, see its paragraph below; not for offsets]; and at coordinates ~1e8 the gate can skip a pair whose overlap is ~4 ULP (5 of 60 far-offset
//   fuzz cases, <=9.1e-9 relative volume). (c) PRE-EXISTING GAPS the gate neither causes nor fixes: two unit
//   boxes with one face tilted 1e-10..3e-9 rad about an edge, intersected, return -0.12 against a true ~1e-10
//   (the touching-contact family above, but with genuinely overlapping faces); a blob minus the same blob
//   rotated by 1e-12..1e-6 returns up to -1.43 with non-closed output.
//
// *** ROUND 9: SEGMENT-BOUNDED CUTTING IS THE DEFAULT (opts.cutting, MESH_BOOLEAN_DEFAULT_CUTTING = "arrangement"). ***
// Each triangle with candidates goes to physics/mesh/triArrangement.mjs, which cuts it along the actual
// intersection segments (not their planes) into faces, and each FACE is classified once, at its largest
// triangle's centroid; every triangle of the face takes that label. A triangle the arrangement refuses (in
// practice a coplanar or degenerate contact) goes to the plane path above, unchanged -- per triangle, counted in
// stats.fallbackTris / stats.fallbackReasons. cutting:"plane" keeps the round-8 path whole, and every plane-path
// option (accOpts, the fragment cap, the gate, the index) applies only there; the arrangement has no cap.
// What it changes, measured (triArrangement.mjs's header has the table): one blast at subdiv 64 in 0.80 s against
// the plane path's 7.3 s and the BSP's 2.4 s; subdiv 128 in 3.9 s, uncapped and right (the plane path capped and
// came back wrong; the BSP 12.6 s and 5.6e-7 relative off the 1000x reference at its EPS of the time, 1e-5 --
// 8.5e-14 since round 10 set it to 1e-8); classifications per blob triangle flat at ~1.2; volumes equal to the plane path's to 5.0e-13 wherever the plane path is uncapped; and THE RAW
// OUTPUT IS WATERTIGHT -- A's and B's seam vertices are the same points, computed once by triTriIntersect, so gap
// (2) of round 6 ("A's and B's independently-clipped cut boundaries do NOT produce bit-coincident seam vertices")
// is closed on this path: 22 of 22 bit-identical on the primary fixture, 0 unmatched edges on every general-
// position run gated (meshBoolean-selfcheck section 15, meshBooleanBlast-selfcheck sections 5 and 8). It is NOT
// closed where a triangle falls back, and it does not touch the flush/touching-contact, zero-volume-operand,
// near-flush-tilt, rotated-copy or scale gaps named above: those triangles are refused and take the plane path.
// [ROUND 11 answered scale, ROUND 12 the rest except a band of rotated copies -- see those paragraphs.]
// *** THE CAVEAT PER-FACE CLASSIFICATION BRINGS: *** a face gets one label because no segment crosses it, and that
// holds only if every B-triangle that meets triA is in its candidate list. bvhPairOverlap.mjs's conservative-
// superset contract says it is; if it ever were not, the arrangement would mislabel a WHOLE FACE where the plane
// path mislabelled one fragment -- a larger error from the same missed pair. triArrangement-selfcheck.mjs gates
// no-segment-crosses-a-triangle on 200 random cases and audits per-face against per-triangle labels (1,120
// triangles, 0 disagree); neither can see a candidate the broad phase never produced.
//
// *** ROUND 11: SCALE. EVERY TOLERANCE IN THIS PIPELINE IS AN ABSOLUTE LENGTH, SO THE OPERANDS ARE BROUGHT TO THEM. ***
// triTriIntersect's, triArrangement's snap, triClip's EPS, triFragmentAccumulate's plane dedup, pointInMesh's
// ray/weld tolerances: all lengths, all tuned on fixtures whose joint extent is 1..16. Before this round, measured
// over 28 runs per scale (blob pairs, rotated boxes, a needle; each graded against its own scale-1 result): 1e-6 and
// 1e-5 up to 115% of volume wrong (1e-6: 303 fallbacks and 3,365 open edges; 1e-5: 632 ambiguous fragments kept),
// 1e-4 19% wrong with 5,448 ambiguous, 1e2..1e4 4.9e-13 but 12 open edges, 1e6 one fallback and 271 open edges.
// meshBoolean() now divides both operands by 2^k, the power of two that puts their joint extent in [1, 16)
// (MESH_BOOLEAN_SCALE_BAND), rebuilds the two BVHs, runs, and multiplies the output by 2^k -- both scalings exact.
// After: every scale 1e-6..1e6 matches its scale-1 result to 5.9e-15, with 0 fallbacks, 0 ambiguous and 0 open
// edges; 1e-100 and 1e100 to 1.5e-15. Inside the band k is 0 and nothing runs: every gate's output from rounds 1-10b
// (meshBoolean, triArrangement, meshBooleanBlast, meshPointClassify, meshCSG, triFragmentAccumulate) was compared
// line for line with round 10b's and is identical. opts.normalize:false runs the operands as given; the gates' 1000x
// reference runs use it, because a reference computed the same way as the thing it checks is no reference.
// A REAL BUG THE STEP EXPOSED, FIXED HERE: mesh/meshBVH.mjs's rayTriangle() rejected a hit as parallel when
// |det| < eps, and det is an AREA (|e1 x e2|-scaled), so any triangle much smaller than eps^(1/2) was invisible to
// rays at every angle. Normalising a 2000-unit wall with a 0.01-unit cutter put the cutter at 7.8e-5 units; the rays
// went straight through it, its cap read outside and was dropped, and the volume came back 6.5% off, 135 triangles
// instead of 174 -- for every cutter smaller than 1/2e5 of the wall, a cliff. pointInMesh now asks the dimensionless
// question (det^2 <= RAY_PARALLEL_REL^2 |e1|^2 |e2|^2, RAY_PARALLEL_REL = 1e-9, meshPointClassify.mjs); rayTriangle's
// other callers keep the old test (its detRel argument is optional). It helped the unnormalised path as well: the
// same 1e-6 blob pair with normalize:false is now 2.0e-5 off with 29 fallbacks (it was part of the 115%).
// NAMED, NOT FIXED: (1) OFFSETS -- the step scales, it does not translate. A unit-size pair at distance d from the
// origin: 9.1e-13 relative at 1e5, 2.0e-11 at 1e6, 1.1e-10 with 1 fallback and 10 open edges at 1e7, 6.2e-9 with 225
// fallbacks and 1,115 open edges at 1e8. Translating by a representable offset is not exact the way a power of two
// is, so it is a design question, not a one-liner. (2) MIXED SIZES -- the band is chosen for the JOINT extent, so a
// small feature on a big part is normalised to a small size. With the ray test fixed the error grows smoothly with
// the ratio instead of falling off a cliff: 1.4e-13 at 1:1e5, 9.9e-13 at 2e5, 2.3e-12 at 5e5, 3.2e-12 at 1e6,
// 1.9e-11 at 1e7. (3) meshCSG.mjs (the BSP, what the engine runs) keeps its absolute EPS and settle tolerances;
// this round does not touch it.
//
// *** ROUND 12: PIECES OF ONE SURFACE LYING ON THE OTHER. *** The four gaps the arc's notes listed -- flush faces, a
// face tilted near-flush (-0.12 against ~0), a zero-volume operand (the wrong sign), a blob minus its copy rotated
// slightly (up to -1.43) -- had one cause: a piece lying on the other surface was classified by rays cast from a
// point ON that surface, with no tiebreak. Measured first, against exact oracles (interval overlap for boxes, s/2
// for a wedge, the first-order swept volume for a rotation), with round 11's code:
//   1,350 flush-box runs (corners on a 1/4 grid; as built, rotated 0.7 rad about z, shifted 0.1; 3 ops): 656 wrong
//     or open, worst 0.43 -- the BSP right on all of them. Two of the three "flush" fixtures had NO candidate pair
//     at all: 0.8 - 0.5 is 5.55e-17 above 0.3 and the broad phase is exact.
//   B on the unit box with its bottom tilted by slope s about an edge: 0.33 off for s <= 3e-10, open edges at every
//     s <= 1e-4. An operand with itself: 7.5e-2 off (box), 0.29 (blob). The rotated copy: 0.15..0.2 at 1e-12..1e-9.
// WHAT WAS BUILT (contacts on by default; opts.contacts:false is round 11's pipeline, kept as every gate's control):
//   (1) the broad phase padded by MESH_BOOLEAN_NEAR (1e-8), so flush faces meet.
//   (2) physics/mesh/triContact.mjs resolves the pairs triTriIntersect refuses. COPLANAR (one triangle within
//       CONTACT_EPS = 1e-9 of the other's plane): the part of triA the other covers is labelled ON, +1 when the two
//       outward normals agree, -1 when they oppose. DEGENERATE (a vertex within 1e-9 of the other's plane): a segment,
//       distances snapped exactly as triTriIntersect snaps them. Canonical in the pair's order, so A's arrangement and
//       B's get the same points bit for bit (triContact-selfcheck: 9,461 refused pairs).
//   (3) ON fragments by orientation -- the BSP's coplanar-front/back rule: A's copy is kept for union and intersect
//       when same-facing, for subtract when opposite-facing; B's copy never (keepA/bKeepAndFlip).
//   (4) a face within MESH_BOOLEAN_NEAR of the other surface is sided locally (nearSide): the nearest triangle's
//       plane, or at an edge or vertex the angle-weighted pseudo-normal -- pointInMesh drops hits nearer than 1e-9 and
//       welds hits within 1e-9, so rays from there are not an answer.
//   (5) an operand thinner than CONTACT_EPS on average (2 x volume / area) is an empty solid, and the regularised
//       answer needs no classification (isEmptySolid; the result says which in `emptyOperand`).
//   (6) EDGE CONFORMITY: every triangle is arranged, then any triangle missing a split its neighbour made on their
//       shared edge is arranged again with the neighbour's point on that side. A B edge crossing A's face exactly on
//       the diagonal two A-triangles share gave one a segment ending there and the other only a point contact: a
//       T-junction, 23 of 450 grid runs (round 11 identical). Only MISSING splits are injected -- a second vertex a
//       few 1e-9 from an existing one only made a sliver on the twelve-blast chain.
//   (7) in triArrangement.mjs (its ROUND 12 paragraph): sub-snap cycles dropped, chain ends within 8 snap of the
//       boundary joined, a corner left with one edge contracted, dangling on-plane contacts pruned -- all counted.
// AFTER: all 1,350 flush-box runs exact to 3.6e-15 with no fallback, no ambiguous fragment, no crack (an edge whose
//   two directions disagree at the 1e-6 census key; an edge used twice each way is two solids meeting on a line,
//   non-manifold and correct, and is counted separately). The three KNOWN fixtures of round 6 and its zero-volume
//   sheet exact, the flush rod exact about any point and watertight (28 unmatched before), the tilt within
//   s/2 <= 5e-10 inside the contact band and 1e-12 beyond, 36 zero-volume runs exact, box and blob with themselves
//   exact and closed, rotated copies at 1e-12..3e-10 and 1e-7..1e-6 within 3e-9 of the oracle. General position is
//   untouched: meshBooleanBlast, triArrangement, meshCSG, triFragmentAccumulate, meshPointClassify and
//   bvhPairOverlap's gates print what they printed at round 11, line for line, the twelve-blast chain included.
//   It is not free there: the chain takes 503 ms against 441 with contacts:false (median of 7 paired runs, +14%) --
//   +28% until nearSide skipped, by box, the candidates farther than MESH_BOOLEAN_NEAR (no output changed).
// FOUND BY THIS ROUND'S OWN RUNS: the ON test must be INCLUSIVE -- a face's sample landed exactly on the other box's
//   diagonal (fuzz case 78: 4.7e-2 off, 5 cracks) and failed both of its triangles' strict tests. Answered first by
//   clipping the coplanar triangles' edges in, then at the root; the clipping was then measured redundant (no box
//   result changed over 1,350 runs, 33 fewer fallbacks on the rotated copies) and removed.
// KNOWN, MEASURED, NOT FIXED: A COPY ROTATED BY 1e-9..3e-8 RAD. Twin triangles 1e-9..1e-8 apart straddle the contact
//   tolerance. Snapping a near-parallel pair's distances to zero moves its crossing line by ~1e-9/theta -- a
//   triangle's width at theta = 1e-8 -- and a face sided one way on A while its twin is sided the other way on B
//   costs a CONE of volume (area x radius / 3), not a sliver: worst 2.8e-2 (round 11: 0.2), pinned in the gate. A
//   smaller distance snap (1e-10..1e-12), with or without a separate coplanar threshold (1e-9..1e-7), moved the band
//   or widened it and was not kept: per-pair tolerances cannot be made consistent for two copies of a surface a few
//   1e-9 apart. That needs snap rounding or exact predicates. Also not handled: a zero-thickness FIN on a real solid
//   (only a wholly empty operand is recognised), and meshCSG.mjs's BSP -- what the engine runs -- is unchanged.
"use strict";

import { pairOverlap } from "./bvhPairOverlap.mjs";
import { groupCandidatesByTriA, accumulateFragments } from "./triFragmentAccumulate.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";
import { arrangeTriangle } from "./triArrangement.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { closestOnTriangle, angleAt, CONTACT_EPS } from "./triContact.mjs";

/** Round 12: the broad phase's pad, and the distance under which a face is sided locally rather than by rays. */
export const MESH_BOOLEAN_NEAR = 1e-8;

// Round 12: which side of the other mesh a face sample lies on, when it lies within MESH_BOOLEAN_NEAR of it.
// pointInMesh() drops hits nearer than 1e-9 and welds hits within 1e-9 of each other, so a sample that close is
// not a question for rays. Every triangle within the pad is in `cands` (the broad phase was padded by it). The
// nearest one decides by the side of its plane -- but only when the nearest point is inside its face; at an edge
// or a vertex the plane of one triangle does not say which side, and the rays are asked after all.
export function nearSide(sample, trisOther, cands) {
    let best = null;
    const all = [];
    const N = MESH_BOOLEAN_NEAR, sx = sample[0], sy = sample[1], sz = sample[2];
    for (const tb of cands) {
        const o = tb * 9;
        // a candidate whose box is farther than N cannot hold the nearest point within N -- most of them, skipped
        // before the closest-point computation (without this, contacts cost the twelve-blast chain ~28%)
        const x0 = trisOther[o], x1 = trisOther[o + 3], x2 = trisOther[o + 6];
        if (sx < Math.min(x0, x1, x2) - N || sx > Math.max(x0, x1, x2) + N) continue;
        const y0 = trisOther[o + 1], y1 = trisOther[o + 4], y2 = trisOther[o + 7];
        if (sy < Math.min(y0, y1, y2) - N || sy > Math.max(y0, y1, y2) + N) continue;
        const z0 = trisOther[o + 2], z1 = trisOther[o + 5], z2 = trisOther[o + 8];
        if (sz < Math.min(z0, z1, z2) - N || sz > Math.max(z0, z1, z2) + N) continue;
        const T = [[trisOther[o], trisOther[o + 1], trisOther[o + 2]], [trisOther[o + 3], trisOther[o + 4], trisOther[o + 5]],
                   [trisOther[o + 6], trisOther[o + 7], trisOther[o + 8]]];
        const r = closestOnTriangle(sample, T[0], T[1], T[2]);
        r.T = T; all.push(r);
        if (!best || r.d2 < best.d2) best = r;
    }
    if (!best || best.d2 > MESH_BOOLEAN_NEAR * MESH_BOOLEAN_NEAR) return null;
    if (best.region === "face") return best.planeDist === 0 ? { edge: true } : { inside: best.planeDist < 0 };
    // at an edge or a vertex: the angle-weighted pseudo-normal of every triangle meeting at the closest point
    const tol = 1e-12, q = best.q, pn = [0, 0, 0];
    for (const r of all) {
        const dq = [r.q[0] - q[0], r.q[1] - q[1], r.q[2] - q[2]];
        if (dq[0] * dq[0] + dq[1] * dq[1] + dq[2] * dq[2] > tol * tol) continue;
        const w = angleAt(q, r.T[0], r.T[1], r.T[2], tol);
        pn[0] += w * r.n[0]; pn[1] += w * r.n[1]; pn[2] += w * r.n[2];
    }
    const side = (sample[0] - q[0]) * pn[0] + (sample[1] - q[1]) * pn[1] + (sample[2] - q[2]) * pn[2];
    return side === 0 ? { edge: true } : { inside: side < 0, pseudo: true };
}

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
 * @param {{cutting?:"arrangement"|"plane", accOpts?:object, pointInMeshOpts?:object, agreementThreshold?:number,
 *   contacts?:boolean}} [opts]
 *   contacts (round 12, default true): padded broad phase, contacts resolved, ON faces, local siding near the other
 *   surface, the edge-conformity pass -- see the header. false is round 11's classification exactly.
 *   cutting (round 9): "arrangement" (default, MESH_BOOLEAN_DEFAULT_CUTTING) or "plane"; anything else throws.
 *   accOpts defaults to {gateByIntersection:true, maxFragments:MESH_BOOLEAN_MAX_FRAGMENTS} since round 7 --
 *   NOT triFragmentAccumulate.mjs's own defaults; defined caller keys override, undefined/null ones do not.
 *   It governs the plane path only (all of it under cutting:"plane"; fallen-back triangles otherwise).
 * @returns {{fragments:{tri:number[][], inside:boolean, ambiguous:boolean, on?:number, src?:number}[], stats:{triCount:number,
 *   emptyCandidateShortcuts:number, accumulatedFragments:number, capped:boolean, unresolvedCount:number,
 *   gateSkipped:number, gateTested:number, examined:number, cutting:string, classifications:number,
 *   arrangedTris:number, arrangementFaces:number, untouchedTris:number, fallbackTris:number,
 *   fallbackReasons:Object<string,number>}}}
 *   classifications: pointInMesh() calls, on either path. arrangedTris / arrangementFaces: triangles the
 *   arrangement cut, and the faces it made of them. untouchedTris: triangles with candidates none of which
 *   crosses them (classified whole). fallbackTris / fallbackReasons: refused, and taken by the plane path.
 *   Round 12: a fragment's `on` is +1/-1 when it lies ON the other surface (same-/opposite-facing) and is kept by
 *   orientation, 0 otherwise; `src` is its source triangle. onFaces, nearSided (nearPseudo of them at an edge or
 *   vertex), nearEdge (sided by rays after all), rearranged / injected (the edge-conformity pass).
 */
export function classifyMeshAgainstOther(trisSelf, bvhSelf, trisOther, bvhOther, opts = {}) {
    const agreementThreshold = opts.agreementThreshold ?? 1;
    // Round 12: contacts on by default -- see the header. false is the round-11 pipeline, pair for pair.
    const contacts = opts.contacts !== false;
    const pairs = pairOverlap(bvhSelf, bvhOther, contacts ? MESH_BOOLEAN_NEAR : 0);
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
    const cutting = opts.cutting ?? MESH_BOOLEAN_DEFAULT_CUTTING;
    if (cutting !== "arrangement" && cutting !== "plane") {
        throw new Error('meshBoolean: unrecognized cutting "' + cutting + '" (expected "arrangement" or "plane")');
    }
    let classifications = 0, arrangedTris = 0, arrangementFaces = 0, untouchedTris = 0, fallbackTris = 0;
    let onFaces = 0, nearSided = 0, nearPseudo = 0, nearEdge = 0;
    const fallbackReasons = {};
    // a face or whole triangle's label: ON the other surface (round 12, from the arrangement), sided locally when
    // within MESH_BOOLEAN_NEAR of it, else by rays
    const classify = (s, cands, on) => {
        classifications++;
        if (on) { onFaces++; return { inside: false, ambiguous: false, on }; }
        if (contacts && cands) {
            const n = nearSide(s, trisOther, cands);
            if (n && !n.edge) { nearSided++; if (n.pseudo) nearPseudo++; return { inside: n.inside, ambiguous: false, on: 0 }; }
            if (n) nearEdge++;
        }
        const cls = pointInMesh(bvhOther, s[0], s[1], s[2], opts.pointInMeshOpts);
        return { inside: cls.inside, ambiguous: cls.agreement < agreementThreshold, on: 0 };
    };

    // Round 12: EDGE CONFORMITY. Every triangle is arranged first; then a triangle missing a point that the triangle
    // across one of its sides put on their shared edge is arranged again with that point (the neighbour's exact
    // coordinates) on its side. Two triangles sharing an edge then split it at the same points: no T-junction where
    // B's surface reaches an A-edge -- a B edge crossing A's face exactly on the diagonal two A-triangles share gives
    // one a segment ending there and the other only a point contact (flush-box fuzz: 3 unmatched edges on 23 of 450
    // runs before; round 11 identical).
    const arrs = new Array(triCount);
    let rearranged = 0, injected = 0;
    if (cutting === "arrangement" && contacts) {
        for (let t = 0; t < triCount; t++) {
            const cands = byTri.get(t);
            if (cands && cands.length) arrs[t] = arrangeTriangle(trisSelf, t, trisOther, cands, { contacts });
        }
        const vk = (o) => trisSelf[o] + "," + trisSelf[o + 1] + "," + trisSelf[o + 2];
        const edgeKey = (t, k) => { const a = vk(t * 9 + k * 3), b = vk(t * 9 + ((k + 1) % 3) * 3); return a < b ? a + "|" + b : b + "|" + a; };
        const byEdge = new Map();
        for (let t = 0; t < triCount; t++) {
            const arr = arrs[t];
            if (!arr || arr.status !== "ok") continue;
            for (let k = 0; k < 3; k++) if (arr.sideVerts[k].length) {
                const key = edgeKey(t, k);
                if (!byEdge.has(key)) byEdge.set(key, []);
                byEdge.get(key).push({ t, pts: arr.sideVerts[k] });
            }
        }
        // a neighbour's point counts as present when one of this triangle's own side vertices is within 8 x snap of it:
        // injecting a second vertex a few 1e-9 from an existing one only makes a sliver (measured on the twelve-blast
        // chain: 1e-6-census non-manifold edges 0 -> 2 and a fallback at shot 12). Only a MISSING split is injected.
        const SNAP2 = 64e-18;
        for (let t = 0; t < triCount; t++) {
            if (arrs[t] && arrs[t].status === "fallback") continue;
            const need = [];
            for (let k = 0; k < 3; k++) {
                const list = byEdge.get(edgeKey(t, k));
                if (!list) continue;
                const own = arrs[t] && arrs[t].status === "ok" ? arrs[t].sideVerts[k] : [];
                for (const { t: u, pts } of list) {
                    if (u === t) continue;
                    for (const p of pts) {
                        const have = own.some((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 <= SNAP2) ||
                                     need.some((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 <= SNAP2);
                        if (!have) need.push(p);
                    }
                }
            }
            if (!need.length) continue;
            arrs[t] = arrangeTriangle(trisSelf, t, trisOther, byTri.get(t) || [], { contacts, sidePoints: need });
            rearranged++; injected += need.length;
        }
    }

    for (let t = 0; t < triCount; t++) {
        const cands = byTri.get(t);
        if ((!cands || cands.length === 0) && !arrs[t]) {
            // See this file's own header: structurally guaranteed equivalent to running accumulateFragments()
            // on an empty candidate list, taken as an explicit early return for auditability.
            emptyCandidateShortcuts++;
            const tri = readTri(trisSelf, t);
            const c = centroid(tri);
            const cls = pointInMesh(bvhOther, c[0], c[1], c[2], opts.pointInMeshOpts);
            classifications++;
            fragments.push({ tri, inside: cls.inside, ambiguous: cls.agreement < agreementThreshold });
            continue;
        }
        if (cutting === "arrangement") {
            const arr = arrs[t] || arrangeTriangle(trisSelf, t, trisOther, cands, { contacts });
            if (arr.status === "untouched") {
                untouchedTris++;
                const tri = readTri(trisSelf, t);
                const c = centroid(tri);
                const cls = classify(c, cands, 0);
                fragments.push({ tri, inside: cls.inside, ambiguous: cls.ambiguous, on: 0, src: t });
                continue;
            }
            if (arr.status === "ok") {
                arrangedTris++;
                for (const face of arr.faces) {
                    arrangementFaces++;
                    const cls = classify(face.sample, cands, face.on);
                    for (const tri of face.tris) {
                        accumulatedFragments++;
                        fragments.push({ tri, inside: cls.inside, ambiguous: cls.ambiguous, on: cls.on, src: t });
                    }
                }
                continue;
            }
            fallbackTris++;
            fallbackReasons[arr.reason] = (fallbackReasons[arr.reason] || 0) + 1;
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
            classifications++;
            const ambiguous = !!frag.lowConfidence || cls.agreement < agreementThreshold;
            fragments.push({ tri: frag.tri, inside: cls.inside, ambiguous });
        }
    }
    return { fragments, stats: { triCount, emptyCandidateShortcuts, accumulatedFragments, capped, unresolvedCount,
                                 gateSkipped, gateTested, examined, cutting, classifications, arrangedTris,
                                 arrangementFaces, untouchedTris, fallbackTris, fallbackReasons, onFaces, nearSided,
                                 nearPseudo, nearEdge, rearranged, injected } };
}

// The keep-rule table -- see this file's own header for the boundary-of-the-result derivation and its
// cross-check against meshCSG.mjs's own subtract()/union()/intersect(). Never averaged or softened: exactly
// these six (op, bucket) combinations keep a fragment, and subtract's B_in bucket is the only one flipped.
// Round 12: a fragment ON the other surface (on = +1, the outward normals agree; -1, they oppose) is decided by
// orientation, not position -- the rule meshCSG.mjs's BSP applies to its COPLANAR-front/back buckets. The two
// copies of such a piece are one surface; A's copy is kept or dropped, B's is always dropped:
//   union:     same -> keep A's (one boundary, both interiors behind it);  opposite -> drop (interior both sides)
//   intersect: same -> keep A's;                                             opposite -> drop (empty both sides)
//   subtract:  same -> drop (A-B empty both sides);                          opposite -> keep A's (B is beyond it)
function keepA(op, inside, on = 0) {
    if (on) return on > 0 ? op !== "subtract" : op === "subtract";
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
/** Round 9: segment-bounded cutting (triArrangement.mjs) by default; "plane" is round 8's path. See the header. */
export const MESH_BOOLEAN_DEFAULT_CUTTING = "arrangement";
function bKeepAndFlip(op, inside, on = 0) {
    if (on) return null;
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
        if (!keepA(op, f.inside, f.on)) continue;
        outTris.push(f.tri);
        if (f.ambiguous) ambiguousTriIndices.push(outTris.length - 1);
    }
    for (const f of classifiedB.fragments) {
        const decision = bKeepAndFlip(op, f.inside, f.on);
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
 * @param {{cutting?:"arrangement"|"plane", accOpts?:object, pointInMeshOpts?:object, agreementThreshold?:number,
 *   normalize?:boolean, contacts?:boolean}} [opts]
 *   see classifyMeshAgainstOther(); cutting defaults to "arrangement" since round 9. normalize (round 11, default
 *   true): bring the operands into MESH_BOOLEAN_SCALE_BAND by an exact power of two first; false runs them at the
 *   scale given -- kept for the gates' 1000x reference runs, which exist to be computed a DIFFERENT way. When it
 *   rescales, bvhA and bvhB are not used (BVHs are rebuilt over the scaled operands). contacts (round 12, default
 *   true): resolve contacts and label ON fragments, see the header; false is round 11's pipeline, pair for pair.
 * @returns {{tris:Float64Array, triCount:number, ambiguousTriIndices:number[], capped:boolean,
 *   stats:{a:object,b:object}, scaleExponent:number}}
 *   scaleExponent: the k the operands were divided by 2^k with (0: in the band, or normalize:false).
 *   emptyOperand (round 12, only when set): "a", "b" or "both" -- that operand is an empty solid (thinner than
 *   CONTACT_EPS on average) and the result is the regularised one, with no classification run.
 *   tris: flat 9-floats-per-triangle buffer, the same layout mesh/meshBVH.mjs's MeshBVH constructor takes.
 *   capped: true if EITHER side hit the per-triangle fragment cap. Treat a capped result as unreliable: cuts
 *     may have been left unapplied (it is not CERTAINLY wrong -- the cap can also trip exactly as the last
 *     plane finishes). Surfaced at the top level since round 7, where it was found buried in stats.a.capped
 *     while the volume came back 0.74% off.
 */
export function meshBoolean(trisA, bvhA, trisB, bvhB, op, opts = {}) {
    // ROUND 11: every tolerance downstream is an absolute length, tuned where the extent is 1..16. Outside that band
    // the operands are brought into it by an EXACT power of two and the result is sent back by the inverse -- see
    // MESH_BOOLEAN_SCALE_BAND and scaleExponent() below. Inside it (every fixture before round 11) k is 0 and
    // nothing here runs: the result is bit for bit what it was.
    const k = opts.normalize === false ? 0 : scaleExponent(trisA, trisB);
    if (k !== 0) {
        const down = 2 ** -k, up = 2 ** k;
        const A = scaleTris(trisA, down), B = scaleTris(trisB, down);
        const r = meshBooleanCore(A, new MeshBVH(A), B, new MeshBVH(B), op, opts);
        r.tris = scaleTris(r.tris, up);
        r.scaleExponent = k;
        return r;
    }
    const r = meshBooleanCore(trisA, bvhA, trisB, bvhB, op, opts);
    r.scaleExponent = 0;
    return r;
}

/**
 * ROUND 11: the band of combined extents (the larger side of A's and B's joint bounding box) the absolute
 * tolerances in triTriIntersect, triArrangement, triClip, triFragmentAccumulate and meshPointClassify were measured
 * in: [2^0, 2^4). Every fixture of rounds 1-10 falls inside it (unit cubes span 2, meshCSG's wall 8).
 * WHERE IT SITS IS A CHOICE INSIDE A WINDOW, NOT A TUNED POINT -- measured by moving it: [-3, 1] and [-6, -2] pass
 * every gate (the sabotage that was meant to catch a wrong band went 0 red, which is how this was found); [-10, -6]
 * fails (a 1:2e5 cutter comes back 6.5e-4 off), [4, 8] fails (8.3e-14 on the scale sweep), [10, 14] and
 * [-20, -16] fail more. [0, 4] is where every earlier round's fixtures already were, so it changes none of them.
 */
export const MESH_BOOLEAN_SCALE_BAND = [0, 4];

/**
 * The power of two meshBoolean() divides both operands by: 0 when their joint extent is already in
 * [2^MESH_BOOLEAN_SCALE_BAND[0], 2^MESH_BOOLEAN_SCALE_BAND[1]); otherwise the smallest shift that brings it there.
 * A power of two because multiplying by one is EXACT in binary floating point: the operands the pipeline sees are
 * exactly the input's image at 2^-k, and the output handed back is exactly 2^k times what the pipeline returned on
 * them -- no rounding is added by the step itself. The pipeline's answer is the one it gives at band scale, which is
 * the point: its absolute tolerances mean what they were tuned to mean. (meshBoolean-selfcheck section 16 gates the
 * bit-for-bit identity against the in-band run.) The band's edges are as precise as Math.log2, so an extent within an
 * ULP of a power of two may land one step either side; both are in or at the band. Not exact through subnormals:
 * extents below ~1e-290 or above ~1e290 are not handled, named rather than guarded. NOT a translation: a small part
 * far from the origin keeps its large coordinates, and the tolerances then fight their ULP (this file's header).
 */
export function scaleExponent(trisA, trisB) {
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity, hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    for (const t of [trisA, trisB]) for (let i = 0; i < t.length; i += 3) {
        const x = t[i], y = t[i + 1], z = t[i + 2];
        if (x < lo0) lo0 = x; if (x > hi0) hi0 = x;
        if (y < lo1) lo1 = y; if (y > hi1) hi1 = y;
        if (z < lo2) lo2 = z; if (z > hi2) hi2 = z;
    }
    const span = Math.max(hi0 - lo0, hi1 - lo1, hi2 - lo2);
    if (!(span > 0) || !Number.isFinite(span)) return 0;
    const e = Math.floor(Math.log2(span));
    const [bLo, bHi] = MESH_BOOLEAN_SCALE_BAND;
    return e < bLo ? e - bLo : (e >= bHi ? e - (bHi - 1) : 0);
}
function scaleTris(tris, f) {
    const out = new Float64Array(tris.length);
    for (let i = 0; i < tris.length; i++) out[i] = tris[i] * f;
    return out;
}

// Round 12: an operand thinner than CONTACT_EPS on average (2 x volume / area) encloses nothing, and a boolean with
// an empty solid has a regularised answer that needs no classification: a zero-thickness sheet's two coincident,
// opposite faces lie on each other, and no orientation rule can keep one without the other. Measured before this:
// a flat rectangle on a box face came back 0.33 off, the section-13 one 0.17 with the wrong sign.
function volumeAndArea(tris) {
    let v = 0, a = 0;
    for (let i = 0; i < tris.length; i += 9) {
        const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
        const ux = tris[i + 3] - ax, uy = tris[i + 4] - ay, uz = tris[i + 5] - az;
        const wx = tris[i + 6] - ax, wy = tris[i + 7] - ay, wz = tris[i + 8] - az;
        const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
        v += ax * nx + ay * ny + az * nz;
        a += Math.hypot(nx, ny, nz);
    }
    return { volume: v / 6, area: a / 2 };
}
export function isEmptySolid(tris) {
    const { volume, area } = volumeAndArea(tris);
    return area === 0 || Math.abs(volume) <= CONTACT_EPS * area / 2;
}
function emptyStats(tris, empty) {
    return { triCount: tris.length / 9, emptyOperand: empty, emptyCandidateShortcuts: 0, accumulatedFragments: 0,
             capped: false, unresolvedCount: 0, gateSkipped: 0, gateTested: 0, examined: 0, cutting: "none",
             classifications: 0, arrangedTris: 0, arrangementFaces: 0, untouchedTris: 0, fallbackTris: 0,
             fallbackReasons: {}, onFaces: 0, nearSided: 0, nearPseudo: 0, nearEdge: 0, rearranged: 0, injected: 0 };
}

function meshBooleanCore(trisA, bvhA, trisB, bvhB, op, opts) {
    if (opts.contacts !== false) {
        const eA = isEmptySolid(trisA), eB = isEmptySolid(trisB);
        if (eA || eB) {
            // this path never reaches assembleBoolean(), whose guard round 6's review added: the same guard, here only
            // (a copy at the top of this function would make that one untestable -- the gate's sabotage F)
            if (!VALID_OPS.has(op)) throw new Error('meshBoolean: unrecognized op "' + op + '" (expected "union", "subtract", or "intersect")');
            // union: the other operand; A - B: A, unless A is the empty one; A & B: empty
            const keep = op === "union" ? (eA ? (eB ? null : trisB) : trisA) : op === "subtract" ? (eA ? null : trisA) : null;
            const tris = keep ? Float64Array.from(keep) : new Float64Array(0);
            return { tris, triCount: tris.length / 9, ambiguousTriIndices: [], capped: false,
                     stats: { a: emptyStats(trisA, eA), b: emptyStats(trisB, eB) }, emptyOperand: eA ? (eB ? "both" : "a") : "b" };
        }
    }
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
