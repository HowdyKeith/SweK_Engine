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
// is, so it is a design question, not a one-liner. [FIXED at round 17: an exact translation -- see ROUND 17 below.]
// (2) MIXED SIZES -- the band is chosen for the JOINT extent, so a
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
//
// *** ROUND 13: BEHIND A FLAG IN THE ENGINE. *** physics/mesh/blastEngine.mjs puts this file behind the one call
// that cuts a mesh in the engine (destructible.html's blast), in blast()'s contract: polygons with an exact plane and
// a SKIN/CUT tag. What this file gained for it:
//   (1) PROVENANCE: the result's `from` names, per output triangle, the input triangle it is a piece of (i >= 0 for
//       trisA's i, -(i + 1) for trisB's). Every fragment carries its source through the arrangement, the sliver
//       path, the plane path and the shortcuts. Checked geometrically (section 18 of the gate): on 9 op x fixture
//       runs every output vertex lies on the named triangle, worst 7.0e-16 x size, and faces its way.
//   (2) THE OUTSIDE-BOX SHORTCUT: a triangle with no candidate that lies wholly outside the other mesh's root box is
//       outside it -- exact, no rays. On the page's 20 five-shot chains it takes 70,986 of 75,420 wall triangles
//       (94%) and the chains 1,977 ms against 2,202 (median of 3).
//   (3) EDGE CONFORMITY, PER SIDE: the second pass now says which side of the triangle an injected point is on, and
//       a point counts as already present only when it is on THAT side. A sliver's two long sides lie within snap of
//       each other, and both mistakes -- the point put on the nearer side, the duplicate test run across sides --
//       left 4 cracks on the page gate's 30-shot chain (seed 107, a needle 1.7e-9 wide).
// The page's workload found two more arrangement defects (triArrangement.mjs's ROUND 13 paragraph). After all of it:
// on 20 five-shot chains and one of thirty, this file and the BSP cut the same solid to 6.7e-12 relative, with no
// fallback and no crack at the 1e-6 census (blastEngine-selfcheck).
//
// *** ROUND 15: WHAT A SHOT COSTS ON A BIG WALL. *** On the page's 30-shot chain a shot that cuts nothing cost 63-80 ms
// at the end, ~6 us per wall triangle -- 36% of the chain. The edge-conformity pass (round 12, below) was the largest
// part of it: it built two string keys for each edge of EVERY triangle to look up the few that received a split, ~18
// ms a shot on the final 13,448-triangle wall. It now visits only the triangles whose boxes touch a triangle that put
// points on its sides, found by the BVH (a triangle sharing an edge with one shares two vertices, so their boxes
// touch). opts.conformAll is the old scan: the gate holds the two equal bit for bit on 1,350 flush-box runs, and
// blastEngine-selfcheck on 80 page shots; stats.conformScanned counts what was visited. With MeshBVH's build made
// cheaper (same tree) and blastEngine's pieces built only for what it does not keep, every shot of 99 page chains is
// what round 14 made, bit for bit, and the fixed cost is 18% of the chain. NOT DONE, MEASURED: the output depends on
// the BVH's SHAPE (candidate order -> arrangement order): a differently shaped tree changed the bits of 53 of 62
// blasts, never the solid (same triangle count, volume within 1e-15). So reusing the last shot's tree -- half of the
// remaining fixed cost -- would trade away the bit-for-bit guarantee.
//
// *** ROUND 16: THE SEAM AGREED BEFORE CUTTING -- WHERE THE DISAGREEMENT WAS THE ARRANGEMENTS' ALONE. *** Measured first,
// on the page's 99 chains: round 14's finishing weld moved 12,376 vertices by an ULP, 100 by up to snap and 75 beyond it.
// Traced, event by event: the ULP moves were one seam crossing computed by two pairs that share an edge (now one point --
// triTriIntersect.mjs's ROUND 16 note: 12,376 -> 711); the sub-snap moves were EXACTLY the two ends of a seam segment
// no longer than snap, which every arrangement drops as a point contact and merges its own way. seamConsensus() (below)
// finds every pair's segment once, makes such ends ONE point for every arrangement on both meshes, and hands both
// arrangements the pair results it found so neither computes a pair again: on the 99 chains the weld's sub-snap moves go
// 100 -> 0, its ULP moves 711 -> 200, the shots needing any weld beyond an ULP 108 -> 47. Its cost, with the pair
// results shared: +5% on the 30-shot chain (interleaved medians, against round 15's). Also new: a ZERO-THICKNESS FIN --
// two faces of one operand on the same three vertices, wound opposite ways -- is cancelled before anything else
// (reverseTwins): it has no volume, and left in, every ray across it lost a hit (meshBoolean-selfcheck section 19: 5.3e-2
// -> exact). On the rotated-copy family the fallbacks go 87 -> 33 (triArrangement.mjs's ROUND 16 note, and this).
// TRIED, MEASURED, NOT KEPT: placing a near-parallel pair's seam by its raw, unsnapped distances (the band's worst 2.8e-2
// -> 1.7e-2, but outside it 1.4e-9 -> 1.1e-2); calling a near-parallel pair coplanar when its seam's uncertainty exceeds
// the triangles (K = 10 or 30 snaps: the band to 3.8e-2, and with K = 30 errors outside it); making seam ends within 8
// snaps that share a triangle one point (the weld's 65 moves beyond snap -> 28 on the page, but the rotated family's band
// 2.8e-2 -> 1e-1 and outside it 1.1e-4 -- twin surfaces are dense with genuinely distinct points that close).
// KNOWN, MEASURED, NOT FIXED: (1) the rotated-copy band -- worst still 2.8e-2 (a copy rotated 1e-9 about (1,2,3)). Its
// cracks all border plane-path fragments, from triangles the arrangement refuses: a corner left with one edge, Earcut,
// the face-area sum, and dangling seam chains 3e-8..8e-8 short of each other -- each a per-triangle decision with a
// tolerance, on twin triangles a few 1e-9 apart. Per-pair tolerances provably cannot be made consistent there (round 12,
// and the K experiment above); it needs the seam's TOPOLOGY decided exactly (orientation predicates on input
// coordinates) and its vertices rounded once, globally -- backlog bvh-csg-r16b-exact-seam-topology. (2) The weld's moves
// beyond snap: 65 on the 99 chains, ends of two different pairs' segments 1.2e-9..7e-9 apart, not traced. (3) A fin whose
// two faces are triangulated differently is not cancelled -- that needs the operand arranged against itself.
//
// *** ROUND 16b: EXACT SEAM TOPOLOGY -- BUILT, VERIFIED, AND MEASURED NOT TO BE ENOUGH ON ITS OWN. *** opts.exactSeam
// decides every pair with triTriIntersectExact (orient3d signs of the input points, exactPredicates.mjs) instead of
// the 1e-9 snapped distances; the segment ends are the same canonical crossings. In general position it is the float
// test's answer bit for bit (50,000 random pairs, triTriIntersect-selfcheck), and pairs sharing an edge agree by
// construction. MEASURED, against the default: on the rotated-copy family the fallbacks go 33 -> 6 -- the topology is
// consistent -- but the band's worst goes 2.8e-2 -> 4.7e-2, outside it 1.4e-9 -> 9e-3 (a copy rotated 1e-12: 0 -> 8.9e-3),
// and 3 of 900 flush-box runs go wrong (1.2e-2) against none. Without a tolerance, surfaces 1e-12..1e-8 apart (or
// 5.55e-17, the flush boxes' rounding) no longer meet "on" each other: every twin pair intersects exactly, along slivers
// the arrangement then snaps at 1e-9 triangle by triangle -- round 16's inconsistency, one level down. So exactSeam
// stays OFF (meshBoolean-selfcheck section 20 holds the default to the snapped path, bit for bit). What it needs is the
// arrangement snap-rounded GLOBALLY: seam vertices and nearby input vertices rounded once, to one grid, so surfaces a
// rounding apart become exactly coincident and the exact-zero contact path takes them -- backlog
// bvh-csg-r16c-global-snap-rounding.
//
// *** ROUND 16c: VERTEX ROUNDING -- THE INPUT-VERTEX PART OF GLOBAL SNAP ROUNDING. *** Measured first: every cone in the
// rotated band is a triangle the arrangement REFUSED (dangling, face area sum, Earcut) beside a twin it arranged. On a
// copy rotated 1e-9 about (1,2,3), 215 of A's 252 fragments are ON their twins and kept or dropped by orientation; one
// triangle of B fell back, rays called four of its five pieces inside, its twin was ON and dropped, and the hole is the
// 2.81e-2. Before anything is cut, vertexRound() now gives each vertex of B within VERTEX_ROUND (JOIN x snap, 8e-9 -- the
// arrangement's own largest move) of a vertex of A that vertex's coordinates, exactly: twin triangles become the same
// triangle, which the ON rule decides once. A never moves; the pairing is mutual-nearest, so no two vertices of B land on
// one point; a move that would collapse or turn over a triangle is refused; B stays closed. ON by default (opts.vertexRound
// false turns it off; opts.vertexRoundRadius sets it). MEASURED, against round 16: the rotated band's worst 2.8e-2 ->
// 5.6e-5; fallbacks 33 -> 15; every band angle but one within its own first-order volume (no worse than calling the copy
// identical); outside the band unchanged (1.39e-9); 1,350 flush-box runs still exact; on the page's chains no blob vertex is
// ever within the radius of a wall vertex, so nothing moves and the cost is the search (30-shot chain within noise). THE
// COST, AGREED: a vertex moved by up to the radius moves its faces by as much -- the near-flush tilt at slope 3e-9 (B's
// lifted corners rounded flat) is off by the whole wedge, 1.5e-9, where round 12 resolved it to 5.01e-10; the gate now
// bounds rounded slopes by their wedge and keeps round 12's bound under vertexRound:false. Radii were measured: 1e-9 keeps
// the tilt bound but not the band (2.8e-2); 2e-9 and 4e-9 leave 7.7e-3; 8e-9..2.5e-8 all leave 5.6e-5; 3e-8 clears the band
// but costs 4e-9 on a copy rotated 1e-7, against the gate's 3e-9. KNOWN, the 5.6e-5: about z by 3e-8, twins near the axis
// are rounded together and those beyond are 1e-8..4.5e-8 apart; three triangles there are refused (a seam chain stops 2.6e-8
// from a corner, past the 8e-9 join -- widening the join to a corner to 64 snaps changed nothing). exactSeam on top of the
// rounding is still worse (band 2.5e-2, 189 fallbacks): off. The rest -- seam points rerouted through hot pixels at every
// vertex, so a chain that stops near a corner ends AT it on both sides -- is backlog bvh-csg-r16d-hot-pixel-seams.
//
// *** ROUND 16d: THE TWIN JOIN (triArrangement.mjs's ROUND 16d note) -- THE BAND CLOSED. *** Measured first, the hot-pixel
// plan was wrong: of the three ends that stopped round 16c's chains only one was near a vertex; they stop where a twin's
// edge pierces the triangle, 1e-8..5e-8 inside a side. A triangle crossed by a near-parallel twin now joins such an end to
// its boundary within 64 snaps (nearest side past a corner's 8). The gate's rotated band: every angle within its own
// first-order volume (worst 1.79e-8; 5.6e-5 at round 16c), fallbacks 15 -> 6. A wider family -- 3 blobs x 4 axes x 7
// angles x 3 ops, 252 runs, beyond its first-order volume + 3e-9: 118 runs at round 16 (worst 1.2e-1), 24 at round 16c
// (4.7e-2), 12 now (4.7e-2), fallbacks 606 -> 75 -> 48. Page chains and flush boxes bit for bit unchanged. TRIED AND
// DROPPED: letting vertexRound reach past its radius along the surface (off every face by no more than the radius):
// reach 2x: 9 runs, worst 2.2e-2; 4x and 8x: 12 runs -- not monotone, not kept. KNOWN, the rest of the 12: a twin pair
// whose vertices sit within and beyond the 1e-9 snap of each other's plane (5e-10, 7e-10, 1.7e-9 on a blob rotated 1e-8
// about x) is taken by triContact as a touch along the plane where it crosses; the face is not split and both copies are
// kept whole (4.7e-2) -- backlog bvh-csg-r16e-straddling-twins.
//
// *** ROUND 16e: STRADDLING TWINS -- MEASURED, NOT FIXED; PER-PAIR FIXES ARE EXHAUSTED. *** Measured first: in each of the
// four cases left (12 of round 16d's 252-run family), 25..88 near-parallel pairs are 'degenerate' (a vertex within snap of
// the other's plane) where the exact signs say they CROSS by more than snap. Four fixes, each confined to such pairs and
// each measured on the gate's rotated band and the 252-run family (round 16d: 12 runs beyond first-order, worst 4.7e-2):
//   - decide them by the exact pair test (triTriIntersectExact): 108 runs, worst 2.5e-2, and the gate's outside rows
//     broken (6.4e-3 where 1.4e-9);
//   - the same, only for unshared near-copies (every corner within 3.2e-8 of a distinct twin corner): 99 runs, 2.2e-2;
//   - call them COPLANAR, decided by the ON rule, when every corner is within K snaps: K = 2, 13 runs, 3.2e-2; K = 8 and
//     32, the gate's band 7.7e-2 and 1.3e-1 (near-copies only, K = 8: 7.7e-2);
//   - label a face ON when its sample lies within snap of a twin the pair test called a touch, and inside it: 43 runs,
//     4.1e-2 (A's face goes ON, B's twin, split differently, does not).
// Every one moves the problem rather than removing it: the pair's verdict is consistent across both meshes already; what
// breaks is the arrangement's own 1e-9 decisions (vertex merging, side splitting, crossing detection) on slivers 1e-9..1e-8
// wide that an exact or a coplanar verdict creates. None was kept. The four cases are pinned in the gate (section 22);
// the next step is the arrangement itself made exact -- backlog bvh-csg-r16f-exact-arrangement.
//
// *** ROUND 17: FAR FROM THE ORIGIN -- THE OPERANDS MOVED TO IT, EXACTLY (translationFor). *** Measured first, with an
// oracle that is exactly the same geometry: operands built out at 2^e (x = fl(p + 2^e), exact doubles there) and moved
// back by 2^e (exact, Sterbenz). Before: a blob against its copy rotated 1e-6 -- exact at the origin -- 3.6e-7 off with 36
// fallbacks at 2^13 (8,192), 4.0e-5 at 2^20, 3.7e-3 at 2^23; general-position pairs 3.1e-11 at 2^20, a box against a
// rotated box 3.4e-1 off at 2^27 with fallbacks and cracks; three ten-shot page chains with the wall at 2^27: 1,622
// fallback triangles, 9,581 open edges at the page census. The pipeline's tolerances are absolute and a coordinate's ulp
// is 1.8e-12 at 2^13, 1.5e-8 at 2^27 -- past the 1e-9 snap. NOW: per axis, when every coordinate lies further from 0 than
// twice their spread, the operands are moved by t -- the middle of the spread -- which is exact for every one of them
// (Sterbenz: x and t within a factor of 2; each checked by TwoSum anyway), then scaled
// as round 11 does; the result is moved back by +t: input vertices bit for bit, a new seam point rounded once, to what a
// coordinate out there can hold. After: 0 fallbacks and 0 cracks the same geometry does not have at the origin, at every
// distance to 2^30; the error is the way back's rounding, within ulp(2^e) x area (worst 0.008 of it); the far result is
// the moved-in result moved out, bit for bit; the page chains at 2^27 closed with no fallback. Near the origin -- every
// fixture before, and the page -- no axis qualifies and nothing changes. opts.translate:false turns it off.
//
// *** ROUND 18: UNION AND INTERSECT AUDITED (meshBoolean-selfcheck section 24) -- NO DEFECT FOUND. *** Held to subtract's
// depth against a formal property list. Measured: on random blob pairs the algebra holds to 1e-14 (|A-B| + |AnB| = |A|,
// |AuB| + |AnB| = |A| + |B|, |A-B| + |B-A| + |AnB| = |AuB|, u and n commute) and all three ops agree with meshCSG's BSP
// to 1e-14; outputs fed back in obey absorption and associativity to 1e-14; containment, disjoint, and touching at a
// face, an edge or a corner are exact for every op; every output triangle faces out (rays 1e-6 off it); fifty ops on the
// page's wall that ADD, blast and trim agree with the same chains through the BSP to 3.5e-12 relative, closed at the
// arc's 1e-6 census, no fallback. The one finding is not about union or intersect: every op's RAW output can carry seam
// ends 1.4e-9..3.5e-9 apart (open at the page's 1e-9 census: 20 five-op chains each, union 0 edges, subtract 3,
// intersect 21), which the page's blasts close with round 14's finishing -- and only the subtract adapter has it. A
// second caller needs it for its op too: backlog bvh-csg-r18b-finish-any-op.
//
// *** ROUND 19b: TWO OF THE DEFAULT ENGINE'S OPENINGS, ROOT-CAUSED. *** Round 19's soak (1,200 page shots and a 100-shot
// session of the page's range) found the page's wall opened twice. (1) An Earcut refusal -- triArrangement.mjs's ROUND
// 19b note: 44 edges, now 0. (2) A seam FOLD (seed 8, shot 80): two pairs' segments meet at b, where a wall edge crosses
// the blob's plane 4e-10 from a blob edge, and the next pair's segment runs 1.5e-8 straight back along the first; the blob
// triangle split the first segment at the fold's far end c (within snap of it), the wall triangles kept it whole, and 3
// edges opened that the finishing weld could not close (b and c 1.5e-8 apart, past its 8e-9). seamConsensus now joins
// a fold's two ends -- a segment no longer than FOLD_SNAPS (16) x snap that shares an end with another and doubles back
// within snap of it -- as it already joined segments shorter than snap (opts.seamFolds:false is the control). Measured
// first and dropped: joining EVERY short segment up to 8, 16 or 32 snaps (seed 8: 13 open edges -> 18, 39, 58), and a
// wider finishing weld (16 or 32 snaps: 13 -> 10, only the fold). Fold lengths 16, 32 and 64 measure alike. The soak's
// 12 chains: fallbacks 7 -> 6 (the rest 'dangling', none opening), seed 8's open edges 13 -> 10; the gate's rotated
// band, flush boxes and every other gate unchanged. LEFT: seed 8's shot 84 -- a fan of wall slivers ~6e-6 wide along a
// seam 3e-3 inside the wall's back face, 10 edges -- backlog bvh-csg-r19c-sliver-fan-openings.
//
// *** ROUND 16f: THE EXACT ARRANGEMENT -- opts.exactArrangement (off by default until round 16g). *** Round 16e left the near-coincident
// family to the arrangement's own 1e-9 decisions. Measured first, in a copy with every tolerance made finer: exact pair
// verdicts with vertexRound off and a 1e-11 snap put three of section 22's four KNOWN cases within 2e-12 of their oracle
// (from 4.7e-2, 1.7e-2, 1.2e-3); the fourth, and a copy rotated 1e-12, stayed wrong at every snap -- the tolerance was the
// defect, not its size. With the flag, every pair is decided once by exactArrangement.mjs's exactPair (both meshes share
// the result) and every triangle arranged by arrangeTriangleExact on implicitPoints.mjs's exact seam points: no
// vertexRound, no seamConsensus, no conformity pass; a face sample within EXACT_NEAR (1e-11) of the other mesh -- an
// untouched triangle's centroid included -- is classified by exactInside, at its exact point (opts.exactNear: 0 is the
// control). MEASURED (exactArrangement.mjs has the mechanisms, each found by this round's own runs): round 16d's 252-run
// family 12 beyond first-order -> 0, fallbacks 51 -> 0, open at 1e-9 113 runs -> 0; section 22's four cases 4.7e-2..1.2e-3
// -> 5e-13..2e-12, a copy rotated 1e-12 1.3e-15; the 1,350 flush boxes exact to 2.7e-15, no crack; time on the family
// 1.4..1.9x. blastEngine.mjs finishes the flag's output by merging only. NOT the default: the decision -- the page's census
// (a 1e-9 key, which reads the exact arrangement's distinct close points as T-junctions), the gates that hold the snapped
// path's mechanisms, and the folds rounding still leaves -- is backlog bvh-csg-r16g-exact-default.
//
// *** ROUND 19c: SEED 8'S SHOT 84 -- ROOT-CAUSED; NOT FIXABLE WITH A TOLERANCE; CLOSED BY THE EXACT ARRANGEMENT. *** The
// last soak opening of the default engine (10 open edges from shot 84): the blob's triangle B58 crosses a fan of wall slivers
// 1.1e-9..3.7e-9 high and 0.11 long -- earlier shots' pieces, arranged by triArrangement.mjs's sliver path -- cutting their
// long sides at seven points 1.1e-9..3.5e-9 apart. The seam consensus agrees one chain (no segment of it is under snap); the
// slivers project each point onto their side (two slivers sharing a side get different bits for one point), B58 keeps the
// consensus' bits: 29 edges open raw, and the finishing weld, joining the chain by chained pairs (one point moved 2.2e-8,
// past its 8e-9 radius), leaves 10. MEASURED AND DROPPED: keeping a point's own bits when it lies on the sliver's side to
// rounding (1e-17 off it, against 1e-10 for a blob edge piercing the sliver) -- raw 29 -> 19, after the weld still 10, and
// the 12-chain soak identical shot for shot; merging vertices by 3D rather than projected distance -- no change. Sub-snap
// geometry is decided at the snap, by each arrangement for itself, and no choice of it agrees. The exact arrangement on the
// same input: closed bit for bit; seed 8's 100 shots exact: closed after every shot (blastEngine-selfcheck section 13). The
// same holds for round 18b's KNOWN intersect chain (6 'dangling' fallbacks at the big blobs' z = 0 equators): exact, no
// fallback, its remaining mismatches all under 1.2e-16 (rounding). Folded into bvh-csg-r16g-exact-default.
//
// *** ROUND 16g: THE EXACT ARRANGEMENT IS THE DEFAULT (MESH_BOOLEAN_EXACT_DEFAULT); opts.exactArrangement:false is the
// snapped path, kept and gated. *** What round 16f named against it, measured and settled:
//   - the page's census was a 1e-9 key, which reads distinct points closer than 1e-9 as T-junctions. It now counts at the
//     exact-bits key (destructible.html, blastEngine-selfcheck's pageCensus); the gates that pinned the snapped path's
//     own mechanisms run it by name (SNAPPED).
//   - rounding folds features finer than a rounding: blastEngine.mjs welds the exact output within EXACT_FINISH_WELD
//     (1e-14, a few ulps at the page's coordinates). Without it the wall kept edges 1.5e-17 long (texel spread 1.47 on
//     seed 1's 20 shots, against 3.75e-6) and seed 11's T-junction 3.5e-18 wide stayed open 26 shots (none with it).
//   - a PRECONDITION found by the page itself: a meshCSG BSP wall is not conforming (a long edge against two short ones
//     whose middle vertex lies near it -- written "only to rounding" here at 16g; round 16h measured up to 1.03e-9 off,
//     and near-miss vertices besides). The other mesh's plane crosses "the same" line at distinct points, the seam has a gap, and a region floods through it: a session switching engines every 25 shots lost 6.2 units
//     of the wall by shot 100. The exact path now runs only where both operands are conforming near the seam
//     (nonConformingNear, below), and otherwise declines to the snapped path, whose snap closes such gaps
//     (stats.exactDeclined; result.exact says which ran). Seed 3, 10 bvh / 10 bsp / 10 bvh shots: the default within
//     3.9e-12 of the snapped chain (8 of the last 10 declined); unchecked (opts.exactConforming:false) 6.9e-3 off.
// MEASURED on the final code, the page's 12 x 100-shot soak, default against snapped: fallbacks 0 / 6; shots ending open at
// the exact-bits key 0 / 42 (seed 8 open from shot 84, 10 edges at the end; seed 11 26 shots, up to 43); the same solid to
// 3.5e-11; 0 shots declined; op time 162 / 139 s summed (1.17x; 96 / 92 s wall clock, four chains to a process). In
// Chromium, 100 shots through the page's button: unmatched 0 at every 25 shots and after settle, 0 fallbacks; a session
// switching bvh / bsp every 25 shots ends at the single-engine volume (12.003929; 6.2 lost before the precondition), 55
// unmatched after settle (the BSP alone: 49).
//
// *** ROUND 16h: AN OPERAND THAT IS NOT CONFORMING NEAR THE SEAM IS MADE CONFORMING THERE, THEN THE EXACT PATH RUNS
// (conformNear). *** Measured first, on the switching chains (12 seeds, 10 bvh / 10 bsp / 10 bvh): every edge near the
// seam without a twin is a NEAR-MISS -- two vertices that should be one: a rounding apart (1.2e-14 at most, the BSP's split
// points computed per polygon), or a corner 1.6e-9 from its neighbour's -- or one side of a T-JUNCTION, the middle vertex up to
// 1.03e-9 off the long side (none of 2,077 exactly on it; 16g's "only to rounding" was wrong). No third kind. conformNear
// merges untwinned edges' ends within CONFORM_MERGE and splits untwinned edges at those ends within CONFORM_SPLIT (both
// meshCSG's EPS, 1e-8), `from` still naming the caller's triangles; what is still not conforming declines as at 16g (a
// crack 1.4e-6 wide does; so does a near-miss 2e-8 apart). MEASURED: the 120 shots after the BSP's 20 -- 120 exact, where 100
// declined before; 0 fallbacks; each chain within 8.0e-11 of the snapped one; no output edge open that the wall had not
// already opened along its own cracks, none on the blob's side. At a 1e-12 merge 27 of the 120 still declined (a split beside
// a corner 1.6e-9 off turned a triangle over). Its own first draft read an edge on the region's rim as open (the twin lay
// outside the box) and split it at a point its twin already had -- 5 edges doubled on seed 12's shot 28; the edge census
// now covers every twin. COST: those 120 shots 55 s against 30 s snapped (1.84x); a page that never cuts with the BSP
// never conforms (the default soak: 0 such shots). Chromium, switching bvh / bsp every 25 shots: the single-engine volume,
// 16,985 unmatched after the third quarter (115,963 at 16g, the conformed wall repaired around each cut); after the BSP's
// last quarter and settle, 70 (55 at 16g; the BSP alone 49) -- meshCSG's settle on a different wall, KNOWN.
//
// *** ROUND 20: IS THE OUTPUT TWO-MANIFOLD? (manifoldAudit.mjs) *** The question the arc's backlog item was opened for --
// three-bvh-csg says its BVH-CSG may not be. Audited at exact bits: on the page soak (12 chains x 100 shots, every 25) 48
// of 48 walls closed, edge- and vertex-manifold, no degenerate triangle, touch or coplanar overlap; crossings on 6 of them
// (2..9), every one at most 1.8e-16 deep and up to 2.2e-9 long -- two nearly coplanar slivers sharing a corner, exact,
// then rounded to doubles (bvh-csg-r20b-embedded-rounding). Union, subtract and intersect chains: clean. meshCSG's own
// twelve-blast stress case: this engine 1,098 ms and clean; the BSP localised 597 ms with 32,889 open edges.
//
// *** ROUND 20b: THE EXACT OUTPUT ROUNDED WITHOUT CROSSING ITSELF (embedRounded). *** Measured first: 9 of the soak's
// 1,200 shots made crossings, 29 pairs, every one with a triangle at most 1.4e-9 high (a sliver near the blobs' z = 0
// equators) and none with an edge shorter than 7.2e-13. Among the pairs where one triangle is new and one is a sliver
// (EMBED_SLIVER), each exact crossing is removed by collapsing the shortest edge that moves a point the arrangement made --
// never an operand's vertex -- by at most EMBED_SLIVER; refused where a triangle would turn over or the surface pinch (the
// link condition). Triangles with an edge a rounding long (EMBED_ROUNDING) are left to the finishing weld, which merges
// them: tested too, they cost meshCSG's twelve-blast case 1.6x (4,000-5,500 pairs a shot, every collapse 3e-16 at most).
// MEASURED, 12 chains x 100 shots audited every 25: 48 of 48 walls two-manifold (6 crossing before), 0 fallbacks, closed
// after every shot, the same solids to 7.1e-14, 1.036x the time; the twelve-blast case within noise (1.04..1.12x).
// opts.embed:false is the control.
"use strict";

import { pairOverlap } from "./bvhPairOverlap.mjs";
// BVH-CSG ROUND 23: CANDIDATE PAIRS IN ONE ORDER, WHATEVER TREE FOUND THEM -- ON THE EXACT PATH. pairOverlap reports pairs
// in its traversal order, so the tree's SHAPE reached the output: measured on seed 1's 100 shots, a wall tree with
// maxLeaf 4 or 16 in place of 8 gave 12 of 20 outputs with 26 of 6,224 triangles starting at another corner (the same
// triangles, vertex set and volume to the bit -- the exact arrangement is order-independent as geometry, not as bits).
// Sorted, 20 of 20 are bit for bit, which is what lets blastEngine hand meshBoolean a tree derived from the last shot's.
// NOT on the snapped or plane paths: there the order is GEOMETRY. Sorted everywhere, round 16c's snapped cone (5.6e-5)
// read 1.02e-9, the plane path's settled twelve-blast wall opened 3 edges, round 11's contacts:false control read 27
// unmatched for 28 and round 19's seed 8 shot 84 opened 3 edges for 29 -- order-dependent answers, kept as recorded. A
// derived tree is therefore rebuilt in full before either of those paths runs (freshTree, below).
const canonPairs = (p) => p.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
// a tree derived from another (meshBVH.deriveBVH) has its own shape; where shape is geometry, the full build's is used
const freshTree = (bvh, tris) => (bvh && bvh.derived ? new MeshBVH(tris) : bvh);
import { groupCandidatesByTriA, accumulateFragments } from "./triFragmentAccumulate.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";
import { arrangeTriangle, SNAP_EPS } from "./triArrangement.mjs";
import { exactPair, arrangeTriangleExact, exactInside, EXACT_NEAR, degenerateTri } from "./exactArrangement.mjs";
import { explicitPoint, centroidPoint, same as samePoint } from "./implicitPoints.mjs";
import { triTriIntersect, triTriIntersectExact } from "./triTriIntersect.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { closestOnTriangle, angleAt, CONTACT_EPS, contactPair } from "./triContact.mjs";

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
// bounds: a MeshBVH's node boxes, root first (lo x,y,z then hi x,y,z)
function outsideBox(tri, bounds) {
    for (let a = 0; a < 3; a++) {
        const lo = bounds[a], hi = bounds[a + 3];
        if (tri[0][a] < lo && tri[1][a] < lo && tri[2][a] < lo) return true;
        if (tri[0][a] > hi && tri[1][a] > hi && tri[2][a] > hi) return true;
    }
    return false;
}
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
    const pairs = opts.pairs || pairOverlap(bvhSelf, bvhOther, contacts ? MESH_BOOLEAN_NEAR : 0);
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
    let onFaces = 0, nearSided = 0, nearPseudo = 0, nearEdge = 0, outsideBoxShortcuts = 0;
    const fallbackReasons = {};
    // a face or whole triangle's label: ON the other surface (round 12, from the arrangement), sided locally when
    // within MESH_BOOLEAN_NEAR of it, else by rays
    let exactClassified = 0;
    const classify = (s, cands, on, exactSample) => {
        classifications++;
        if (on) { onFaces++; return { inside: false, ambiguous: false, on }; }
        // round 16f: a face of the exact arrangement whose sample lies within EXACT_NEAR of the other mesh is classified
        // at its EXACT centroid by an exact ray (exactArrangement.mjs's exactInside)
        if (exactSample && cands) {
            let d2 = Infinity;
            for (const tb of cands) { const o = tb * 9, r = closestOnTriangle(s, [trisOther[o], trisOther[o + 1], trisOther[o + 2]], [trisOther[o + 3], trisOther[o + 4], trisOther[o + 5]], [trisOther[o + 6], trisOther[o + 7], trisOther[o + 8]]); if (r.d2 < d2) d2 = r.d2; }
            const near = opts.exactNear ?? EXACT_NEAR;    // opts.exactNear: 0 is float classification throughout (the gate's control)
            if (d2 <= near * near && near > 0) {
                const inside = exactInside(exactSample(), trisOther, bvhOther);
                if (inside !== null) { exactClassified++; return { inside, ambiguous: false, on: 0 }; }
            }
        }
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
    // round 16: the pair results meshBooleanCore's seamConsensus already found, by this side's (t, other) order
    // round 16f: exactPair's results, computed once for both sides by meshBooleanCore
    const exactPairOf = (t) => (opts.exactPairs ? (o) => opts.exactPairs.get(opts.pairSide ? o * 4294967296 + t : t * 4294967296 + o) : null);
    const pairOf = (t) => (opts.pairResults ? (o) => opts.pairResults.get(opts.pairSide ? o * 4294967296 + t : t * 4294967296 + o) : null);
    const arrs = new Array(triCount);
    let rearranged = 0, injected = 0, conformScanned = 0;
    // round 16f: the exact arrangement needs no conformity pass -- a point on a side splits it whatever pair it came from
    if (cutting === "arrangement" && contacts && !opts.exactArrangement) {
        for (let t = 0; t < triCount; t++) {
            const cands = byTri.get(t);
            if (cands && cands.length) arrs[t] = arrangeTriangle(trisSelf, t, trisOther, cands, { canon: opts.seamCanon, pairOf: pairOf(t), exact: !!opts.exactSeam, joinTwin: opts.joinTwin, flatEars: opts.flatEars, contacts });
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
        // Round 15: only a triangle that SHARES AN EDGE with one that put points on its sides can be given any, and two
        // triangles sharing an edge share two vertices, so their boxes touch: the BVH finds every such triangle
        // (trianglesInBox is closed). Scanning all of them built two string keys per edge of every triangle in the mesh
        // on every shot -- 18 of the 33 ms a pin-prick blast spent classifying the page's 13,448-triangle wall.
        // opts.conformAll scans them all (the control; the gate holds the two bit for bit).
        let receivers;
        if (opts.conformAll) receivers = Array.from({ length: triCount }, (_, t) => t);
        else {
            const found = new Set();
            for (let u = 0; u < triCount; u++) {
                const arr = arrs[u];
                if (!arr || arr.status !== "ok" || !arr.sideVerts.some((l) => l.length)) continue;
                const o = u * 9, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
                for (let c = 0; c < 9; c++) { const v = trisSelf[o + c], a = c % 3; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
                for (const t of bvhSelf.trianglesInBox(lo, hi)) found.add(t);
            }
            receivers = [...found];   // in any order: each reads only its own first arrangement and byEdge
        }
        conformScanned += receivers.length;
        for (const t of receivers) {
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
                                     need.some(({ p: q, side }) => side === k && (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 <= SNAP2);
                        if (!have) need.push({ p, side: k });   // the side it belongs on: a sliver cannot tell by distance
                    }
                }
            }
            if (!need.length) continue;
            arrs[t] = arrangeTriangle(trisSelf, t, trisOther, byTri.get(t) || [], { canon: opts.seamCanon, pairOf: pairOf(t), exact: !!opts.exactSeam, joinTwin: opts.joinTwin, flatEars: opts.flatEars, contacts, sidePoints: need });
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
            // Round 13: a triangle wholly outside the other mesh's bounding box is outside that (closed) mesh -- no rays.
            // Exact, and most of a big wall under a small blast: the page's 30-shot chains classify ~12,000 wall
            // triangles per shot this way.
            if (contacts && bvhOther.count && outsideBox(tri, bvhOther.bounds)) {
                outsideBoxShortcuts++;
                fragments.push({ tri, inside: false, ambiguous: false, src: t });
                continue;
            }
            const c = centroid(tri);
            const cls = pointInMesh(bvhOther, c[0], c[1], c[2], opts.pointInMeshOpts);
            classifications++;
            fragments.push({ tri, inside: cls.inside, ambiguous: cls.agreement < agreementThreshold, src: t });
            continue;
        }
        if (cutting === "arrangement") {
            const arr = arrs[t] || (opts.exactArrangement && contacts
                ? arrangeTriangleExact(trisSelf, t, trisOther, cands, { pairOf: exactPairOf(t), delaunay: opts.delaunay, crossings: opts.crossings })
                : arrangeTriangle(trisSelf, t, trisOther, cands, { canon: opts.seamCanon, pairOf: pairOf(t), exact: !!opts.exactSeam, joinTwin: opts.joinTwin, flatEars: opts.flatEars, contacts }));
            if (arr.status === "untouched") {
                untouchedTris++;
                const tri = readTri(trisSelf, t);
                const c = centroid(tri);
                // round 16f: untouched EXACTLY can still lie a rounding from the other surface (a flush face rotated 0.7)
                const cls = classify(c, cands, 0, opts.exactArrangement ? () => centroidPoint(...tri.map(explicitPoint)) : null);
                fragments.push({ tri, inside: cls.inside, ambiguous: cls.ambiguous, on: 0, src: t });
                continue;
            }
            if (arr.status === "ok") {
                arrangedTris++;
                for (const face of arr.faces) {
                    arrangementFaces++;
                    const cls = classify(face.sample, cands, face.on, face.exactSample);
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
            fragments.push({ tri: frag.tri, inside: cls.inside, ambiguous, src: t });
        }
    }
    return { fragments, stats: { triCount, emptyCandidateShortcuts, accumulatedFragments, capped, unresolvedCount,
                                 gateSkipped, gateTested, examined, cutting, classifications, arrangedTris,
                                 arrangementFaces, untouchedTris, fallbackTris, fallbackReasons, onFaces, nearSided,
                                 nearPseudo, nearEdge, rearranged, injected, outsideBoxShortcuts, conformScanned, exactClassified } };
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
/**
 * Round 16g: the exact arrangement (round 16f, exactArrangement.mjs) is meshBoolean()'s default -- see this file's ROUND 16g
 * paragraph for the soak that decided it. opts.exactArrangement:false is the snapped path (triArrangement.mjs with
 * vertexRound, seamConsensus and the conformity pass), kept and gated. classifyMeshAgainstOther(), called directly, is
 * snapped unless asked: meshBoolean() resolves the option once and passes it down.
 */
export const MESH_BOOLEAN_EXACT_DEFAULT = true;
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
    const outTris = [], ambiguousTriIndices = [], from = [];
    for (const f of classifiedA.fragments) {
        if (!keepA(op, f.inside, f.on)) continue;
        outTris.push(f.tri); from.push(f.src ?? -0x7fffffff);
        if (f.ambiguous) ambiguousTriIndices.push(outTris.length - 1);
    }
    for (const f of classifiedB.fragments) {
        const decision = bKeepAndFlip(op, f.inside, f.on);
        if (!decision) continue;
        outTris.push(decision.flip ? flipWinding(f.tri) : f.tri); from.push(f.src === undefined ? -0x7fffffff : -(f.src + 1));
        if (f.ambiguous) ambiguousTriIndices.push(outTris.length - 1);
    }
    return { tris: outTris, ambiguousTriIndices, from };
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
 *   from (round 13): per output triangle, the input triangle it is a piece of -- i >= 0 for trisA's triangle i,
 *   -(i + 1) for trisB's (flipped under subtract). blastEngine.mjs carries SKIN/CUT tags and exact planes by it.
 *   tris: flat 9-floats-per-triangle buffer, the same layout mesh/meshBVH.mjs's MeshBVH constructor takes.
 *   capped: true if EITHER side hit the per-triangle fragment cap. Treat a capped result as unreliable: cuts
 *     may have been left unapplied (it is not CERTAINLY wrong -- the cap can also trip exactly as the last
 *     plane finishes). Surfaced at the top level since round 7, where it was found buried in stats.a.capped
 *     while the volume came back 0.74% off.
 */
export function meshBoolean(trisA, bvhA, trisB, bvhB, op, opts = {}) {
    // round 16g: the arrangement is exact unless asked otherwise -- resolved here, so every step below sees one answer
    opts = { ...opts, exactArrangement: opts.exactArrangement ?? MESH_BOOLEAN_EXACT_DEFAULT };
    // ROUND 11: every tolerance downstream is an absolute length, tuned where the extent is 1..16. Outside that band
    // the operands are brought into it by an EXACT power of two and the result is sent back by the inverse -- see
    // MESH_BOOLEAN_SCALE_BAND and scaleExponent() below. Inside it (every fixture before round 11) k is 0 and
    // nothing here runs: the result is bit for bit what it was.
    // ROUND 17: and an axis whose coordinates all sit far from 0 against their spread is first moved to it, EXACTLY --
    // see translationFor() below. Near the origin (every fixture before round 17, and the page) t is 0 and nothing runs.
    const t = opts.normalize === false || opts.translate === false ? null : translationFor(trisA, trisB);
    if (t) { trisA = translateTris(trisA, t, -1); trisB = translateTris(trisB, t, -1); bvhA = null; bvhB = null; }
    const k = opts.normalize === false ? 0 : scaleExponent(trisA, trisB);
    let r;
    if (k !== 0) {
        const down = 2 ** -k, up = 2 ** k;
        const A = scaleTris(trisA, down), B = scaleTris(trisB, down);
        r = meshBooleanCore(A, new MeshBVH(A), B, new MeshBVH(B), op, opts);
        r.tris = scaleTris(r.tris, up);
    } else r = meshBooleanCore(trisA, bvhA || new MeshBVH(trisA), trisB, bvhB || new MeshBVH(trisB), op, opts);
    r.scaleExponent = k;
    if (t) { r.tris = translateTris(r.tris, t, +1); r.translation = t; }
    return r;
}

/**
 * ROUND 17: the translation meshBoolean() moves the operands by before anything else, or null. Per axis: when every
 * coordinate on it (both operands) lies further from 0 than twice their spread -- max |x| > 2 x span -- the axis is
 * moved by t, the middle of the spread. Every x - t is then EXACT, by Sterbenz's lemma: x and t both lie in
 * [max |x| - span, max |x|], one sign, within a factor of 2 of each other. (Built first with t rounded to a multiple of
 * ulp(max |x|) as well -- redundant under that condition: the sabotage that dropped the rounding went 0 red, and was
 * measured to be right to.) Each subtraction is still checked, by the exact error of TwoSum, and an axis with any
 * inexact one is not moved: the condition guarantees it, the check keeps a change to the condition from making the move
 * silently inexact (the gate's sabotage of t far below the coordinates). So the pipeline sees the very same geometry,
 * near the origin, where its absolute tolerances keep their meaning; the result is moved back by +t, which returns
 * every input vertex bit for bit and rounds a new seam point once, to the precision its coordinates have out there.
 * An axis near the origin (max |x| <= 2 x span) is left alone.
 */
export function translationFor(trisA, trisB) {
    const t = [0, 0, 0];
    let any = false;
    for (let c = 0; c < 3; c++) {
        let lo = Infinity, hi = -Infinity, m = 0;
        for (const buf of [trisA, trisB]) for (let i = c; i < buf.length; i += 3) { const x = buf[i]; if (x < lo) lo = x; if (x > hi) hi = x; }
        if (!(hi >= lo)) continue;
        m = Math.max(Math.abs(lo), Math.abs(hi));
        if (!(m > 2 * (hi - lo)) || !Number.isFinite(m)) continue;
        const tc = lo / 2 + hi / 2;
        let exact = tc !== 0;
        for (const buf of [trisA, trisB]) for (let i = c; i < buf.length && exact; i += 3) exact = subtractsExactly(buf[i], tc);
        if (exact) { t[c] = tc; any = true; }
    }
    return any ? t : null;
}
function subtractsExactly(x, t) {   // TwoSum (Knuth): the rounding error of x - t, exactly
    const s = x - t, z = s - x;
    return (x - (s - z)) + (-t - z) === 0;
}
function translateTris(tris, t, sign) {
    const out = new Float64Array(tris.length);
    for (let i = 0; i < tris.length; i++) out[i] = sign > 0 ? tris[i] + t[i % 3] : tris[i] - t[i % 3];
    return out;
}

// round 16: the triangles of `tris` to keep once every pair that is one triangle twice, wound opposite ways, is
// cancelled -- or null when there is none. Found by a numeric hash of the three vertices' bits, sorted, then compared.
const _f64 = new Float64Array(9), _u32 = new Uint32Array(_f64.buffer);
export function reverseTwins(tris) {
    const n = tris.length / 9, byHash = new Map(), sorted = new Float64Array(n * 9), parity = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
        const o = t * 9;
        let i0 = 0, i1 = 1, i2 = 2, swaps = 0, x;
        const gt = (a, b) => { const d = tris[o + a * 3] - tris[o + b * 3] || tris[o + a * 3 + 1] - tris[o + b * 3 + 1] || tris[o + a * 3 + 2] - tris[o + b * 3 + 2]; return d > 0; };
        if (gt(i0, i1)) { x = i0; i0 = i1; i1 = x; swaps++; }
        if (gt(i1, i2)) { x = i1; i1 = i2; i2 = x; swaps++; }
        if (gt(i0, i1)) { x = i0; i0 = i1; i1 = x; swaps++; }
        parity[t] = swaps & 1;
        for (let c = 0; c < 3; c++) { _f64[c] = tris[o + i0 * 3 + c]; _f64[3 + c] = tris[o + i1 * 3 + c]; _f64[6 + c] = tris[o + i2 * 3 + c]; }
        sorted.set(_f64, o);
        let h = 0x811c9dc5;
        for (let i = 0; i < 18; i++) h = Math.imul(h ^ _u32[i], 16777619);
        const list = byHash.get(h);
        if (list) list.push(t); else byHash.set(h, [t]);
    }
    const dead = new Uint8Array(n);
    let any = false;
    for (const list of byHash.values()) {
        if (list.length < 2) continue;
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            if (dead[a]) continue;
            for (let j = i + 1; j < list.length; j++) {
                const b = list[j];
                if (dead[b] || parity[a] === parity[b]) continue;
                let same = true;
                for (let k = 0; k < 9 && same; k++) same = sorted[a * 9 + k] === sorted[b * 9 + k];
                if (same) { dead[a] = dead[b] = 1; any = true; break; }
            }
        }
    }
    if (!any) return null;
    const keep = [];
    for (let t = 0; t < n; t++) if (!dead[t]) keep.push(t);
    return Int32Array.from(keep);
}
function pick(tris, keep) {
    const out = new Float64Array(keep.length * 9);
    for (let i = 0; i < keep.length; i++) out.set(tris.subarray(keep[i] * 9, keep[i] * 9 + 9), i * 9);
    return out;
}

/**
 * BVH-CSG ROUND 16: SEAM CONSENSUS. Every arrangement merges the points it is given that lie within snap of each other,
 * each for itself -- so a seam segment shorter than snap became one point in triangle a's arrangement and stayed two in
 * the triangles across from it (round 14's 11 of 20 gaps; 100 of the weld's moves on the page's 99 chains). Here every
 * candidate pair's segment is found once (triTriIntersect, else triContact's contactPair, exactly as triArrangement
 * finds them), and the ends of each segment no longer than snap are made ONE point for everybody: a cluster's
 * representative is an input vertex if it holds one (never two -- such clusters are kept apart), else its
 * lexicographically smallest point. Returns { canon, results }: canon(p) -> p's representative (p itself if it is in no
 * cluster), or null when nothing was joined; and every pair's result, keyed a x 2^32 + b, which both meshes' arrangements
 * read instead of computing the pair again (triTriIntersect(a, b) and (b, a) give the same points -- triArrangement's gate).
 */
export function seamConsensus(trisA, bvhA, trisB, bvhB, snap = SNAP_EPS, exact = false, folds = true) {
    const pairs = pairOverlap(bvhA, bvhB, MESH_BOOLEAN_NEAR);
    const rd = (buf, t) => [[buf[t * 9], buf[t * 9 + 1], buf[t * 9 + 2]], [buf[t * 9 + 3], buf[t * 9 + 4], buf[t * 9 + 5]], [buf[t * 9 + 6], buf[t * 9 + 7], buf[t * 9 + 8]]];
    const results = new Map();          // only pairs that touch: an arrangement reads a missing pair as "none"
    const short = [];                   // the segments no longer than snap, with which of their ends are input vertices
    const all = [];
    for (const [a, b] of pairs) {       // (pairOverlap gives each pair once: a triangle is in one leaf)
        const pk = a * 4294967296 + b;
        const r = (exact ? triTriIntersectExact : triTriIntersect)(trisA, a, trisB, b);
        if (r.status === "none") continue;
        let p0, p1;
        if (r.status === "intersect") { p0 = r.p0; p1 = r.p1; results.set(pk, { r }); }
        else { const c = contactPair(rd(trisA, a), rd(trisB, b)); results.set(pk, { r, c }); if (c.kind !== "segment") continue; p0 = c.p0; p1 = c.p1; }
        const T = [...rd(trisA, a), ...rd(trisB, b)], isC = (p) => T.some((v) => v[0] === p[0] && v[1] === p[1] && v[2] === p[2]);
        if (folds) all.push({ p0, p1, c0: isC(p0), c1: isC(p1) });
        if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) > snap) continue;
        short.push({ p0, p1, c0: isC(p0), c1: isC(p1) });
    }
    // BVH-CSG round 19b: a FOLD -- a segment b-c no longer than FOLD_SNAPS x snap that shares its end b with a segment
    // a-b and doubles back along it (c within snap of a-b's interior) -- has its two ends made one point, as a segment
    // shorter than snap does. Measured on the page (soak seed 8, shot 80): two pairs' segments meet at b, where one
    // mesh's edge crosses the other's plane 4e-10 from the other mesh's edge, and the next pair runs 1.5e-8 straight
    // back; the triangle across splits a-b at c (within snap of it) while the triangles beyond keep a-b whole, and the
    // wall opened 3 edges that no weld closed (c is 1.5e-8 from b, past the finishing weld's 8e-9).
    let nFolds = 0;
    if (folds) {
        const key = (p) => p[0] + "," + p[1] + "," + p[2], at = new Map();
        for (const g of all) for (const e of [g.p0, g.p1]) { const k = key(e); if (!at.has(k)) at.set(k, []); at.get(k).push(g); }
        for (const g of all) {
            const L = Math.hypot(g.p1[0] - g.p0[0], g.p1[1] - g.p0[1], g.p1[2] - g.p0[2]);
            if (!(L > snap && L <= FOLD_SNAPS * snap)) continue;
            for (const [b, c, cb, cc] of [[g.p0, g.p1, g.c0, g.c1], [g.p1, g.p0, g.c1, g.c0]]) {
                const hit = (at.get(key(b)) || []).some((h) => {
                    if (h === g) return false;
                    const a = key(h.p0) === key(b) ? h.p1 : h.p0, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
                    if (!(L2 > 0)) return false;
                    const t = ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / L2;
                    const f = [c[0] - a[0] - t * ab[0], c[1] - a[1] - t * ab[1], c[2] - a[2] - t * ab[2]];
                    return t > 0 && t < 1 && Math.hypot(f[0], f[1], f[2]) <= snap;
                });
                if (hit) { short.push({ p0: b, p1: c, c0: cb, c1: cc }); nFolds++; break; }
            }
        }
    }
    const j = joinSeamEnds(short);
    seamConsensus.last = { ...j.stats, folds: nFolds };
    return { canon: j.canon, results, pairs };
}

/** Round 19b: the longest seam FOLD seamConsensus joins, in snaps (2 x JOIN; 16, 32 and 64 measured alike on the page). */
export const FOLD_SNAPS = 16;
/**
 * The clustering behind seamConsensus, on its own so it can be held to its rules by hand: the two ends of every short
 * segment {p0, p1, c0, c1} (c: that end is an input vertex) become one point. A cluster's representative is its input
 * vertex if it has one -- an input vertex never moves -- and two input vertices are never joined; otherwise the
 * cluster's lexicographically smallest point. Returns { canon (or null when nothing was joined), stats }.
 */
export function joinSeamEnds(short) {
    const key = (p) => p[0] + "," + p[1] + "," + p[2];
    const id = new Map(), P = [], corner = [], par = [], hasCorner = [];
    const node = (p, isCorner) => { const k = key(p); let i = id.get(k); if (i === undefined) { i = P.length; id.set(k, i); P.push(p); corner.push(false); par.push(i); } if (isCorner) corner[i] = true; return i; };
    const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    let joined = 0, refused = 0;
    for (const { p0, p1, c0, c1 } of short) {
        const x = find(node(p0, c0)), y = find(node(p1, c1));
        if (x === y) continue;
        const cx = hasCorner[x] ?? corner[x], cy = hasCorner[y] ?? corner[y];
        if (cx && cy) { refused++; continue; }                    // two input vertices: never one point
        par[Math.max(x, y)] = Math.min(x, y); hasCorner[Math.min(x, y)] = cx || cy; joined++;
    }
    if (!joined) return { canon: null, stats: { points: P.length, joined: 0, refused, moved: 0 } };
    const lex = (u, v) => u[0] - v[0] || u[1] - v[1] || u[2] - v[2];
    const rep = new Map();
    P.forEach((p, i) => { const r = find(i), c = rep.get(r); if (c === undefined || (corner[i] && !corner[c]) || (corner[i] === corner[c] && lex(p, P[c]) < 0)) rep.set(r, i); });
    const out = new Map();
    P.forEach((p, i) => { const r = P[rep.get(find(i))]; if (r !== p) out.set(key(p), r); });
    return { canon: out.size ? (p) => out.get(key(p)) || p : null, stats: { points: P.length, joined, refused, moved: out.size } };
}

/**
 * BVH-CSG ROUND 16c: VERTEX ROUNDING, the input-vertex part of global snap rounding. A vertex of B within `radius` of a
 * vertex of A is given A's coordinates exactly, so two surfaces a rounding apart share their vertices and a twin
 * triangle becomes the SAME triangle -- coplanar, decided once by the ON rule -- instead of a pair whose 1e-9 decisions
 * each arrangement takes for itself. A never moves (the wall's vertices are where earlier shots put them). The pairing
 * is one to one: b and a must each be the other's nearest within the radius, so no two vertices of B land on one point.
 * A vertex whose move would collapse or turn over any triangle using it is not moved (refused). Vertices are matched
 * by their bits, so every triangle using a vertex moves it alike and B stays closed. Returns { tris } -- a new buffer,
 * or null when nothing moved -- and stats { candidates, moved, refused, maxMove }.
 */
export function vertexRound(trisA, bvhA, trisB, radius = VERTEX_ROUND) {
    const nB = trisB.length / 9;
    const stats = { candidates: 0, moved: 0, refused: 0, maxMove: 0 };
    if (!nB || !(radius > 0) || !bvhA.count) return { tris: null, stats };
    // B's unique vertices, by bits, with the triangles using them
    const key = (x, y, z) => x + "," + y + "," + z;
    const vid = new Map(), BV = [], uses = [];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let t = 0; t < nB; t++) for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3, x = trisB[o], y = trisB[o + 1], z = trisB[o + 2], k = key(x, y, z);
        let i = vid.get(k);
        if (i === undefined) { i = BV.length; vid.set(k, i); BV.push([x, y, z]); uses.push([]); }
        uses[i].push(t * 3 + v);
        if (x < lo[0]) lo[0] = x; if (x > hi[0]) hi[0] = x;
        if (y < lo[1]) lo[1] = y; if (y > hi[1]) hi[1] = y;
        if (z < lo[2]) lo[2] = z; if (z > hi[2]) hi[2] = z;
    }
    // A's vertices near B's box, on a grid of cell `radius` (found through A's BVH: only the part of A near B)
    const cell = (x) => Math.floor(x / radius), gk = (i, j, k) => i + "," + j + "," + k;
    const grid = new Map(), AV = [], aid = new Map();
    for (const t of bvhA.trianglesInBox(lo.map((x) => x - radius), hi.map((x) => x + radius))) for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3, x = trisA[o], y = trisA[o + 1], z = trisA[o + 2], k = key(x, y, z);
        if (aid.has(k)) continue;
        aid.set(k, AV.length); AV.push([x, y, z]);
        const g = gk(cell(x), cell(y), cell(z));
        if (!grid.has(g)) grid.set(g, []);
        grid.get(g).push(AV.length - 1);
    }
    const nearest = (p, pts, index) => {
        let best = -1, bd = radius * radius;
        const i = cell(p[0]), j = cell(p[1]), k = cell(p[2]);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
            for (const q of index.get(gk(i + a, j + b, k + c)) || []) {
                const P = pts[q], d = (P[0] - p[0]) ** 2 + (P[1] - p[1]) ** 2 + (P[2] - p[2]) ** 2;
                // nearest; a tie goes to the lexicographically smaller point, so the choice does not depend on order
                if (d < bd || (d === bd && (best < 0 || (P[0] - pts[best][0] || P[1] - pts[best][1] || P[2] - pts[best][2]) < 0))) { bd = d; best = q; }
            }
        }
        return best;
    };
    const target = new Int32Array(BV.length).fill(-1);
    let gridB = null;
    for (let i = 0; i < BV.length; i++) {
        const a = nearest(BV[i], AV, grid);
        if (a < 0) continue;
        stats.candidates++;
        if (!gridB) {   // built once, the first time any B vertex has a partner
            gridB = new Map();
            BV.forEach((p, q) => { const g = gk(cell(p[0]), cell(p[1]), cell(p[2])); if (!gridB.has(g)) gridB.set(g, []); gridB.get(g).push(q); });
        }
        if (nearest(AV[a], BV, gridB) !== i) { stats.refused++; continue; }   // not mutual: another B vertex is nearer a
        const P = AV[a], Q = BV[i];
        if (P[0] === Q[0] && P[1] === Q[1] && P[2] === Q[2]) continue;      // already the same point
        target[i] = a;
    }
    // a move that collapses or turns over a triangle using the vertex is refused (the triangle as it would be with
    // every accepted move applied -- checked until nothing more is refused)
    const pos = (i) => (target[i] >= 0 ? AV[target[i]] : BV[i]);
    const vOf = (t, v) => { const o = t * 9 + v * 3; return vid.get(key(trisB[o], trisB[o + 1], trisB[o + 2])); };
    for (let changed = true; changed;) {
        changed = false;
        for (let i = 0; i < BV.length; i++) {
            if (target[i] < 0) continue;
            for (const u of uses[i]) {
                const t = (u / 3) | 0, ids = [vOf(t, 0), vOf(t, 1), vOf(t, 2)];
                const p = ids.map(pos), q = ids.map((j) => BV[j]);
                const n1 = cross3(sub3(p[1], p[0]), sub3(p[2], p[0])), n0 = cross3(sub3(q[1], q[0]), sub3(q[2], q[0]));
                if (!(n1[0] * n0[0] + n1[1] * n0[1] + n1[2] * n0[2] > 0)) { target[i] = -1; stats.refused++; changed = true; break; }
            }
        }
    }
    let any = false;
    const out = Float64Array.from(trisB);
    for (let i = 0; i < BV.length; i++) {
        if (target[i] < 0) continue;
        const P = AV[target[i]], Q = BV[i];
        stats.moved++; any = true; stats.maxMove = Math.max(stats.maxMove, Math.hypot(P[0] - Q[0], P[1] - Q[1], P[2] - Q[2]));
        for (const u of uses[i]) out.set(P, u * 3);
    }
    vertexRound.last = stats;
    return { tris: any ? out : null, stats };
}
/** Round 16c: vertexRound's radius -- JOIN x snap, the largest move the arrangement itself makes (triArrangement.mjs). */
export const VERTEX_ROUND = 8 * SNAP_EPS;
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

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
 * extents below ~1e-290 or above ~1e290 are not handled, named rather than guarded. NOT a translation -- that is round
 * 17's translationFor(), applied first: a part far from the origin is moved to it exactly, then scaled.
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

/**
 * Round 16g: the edges of side `side`'s pair triangles (pairs [a, b]: side 0 is a, 1 is b) that have no twin on the very
 * same two doubles, among the triangles around them -- 0 when the mesh is conforming where the operands meet. The twin of a
 * triangle's edge shares that edge, so its box meets the triangle's; the triangles in the pairs' box hold every twin.
 */
function nonConformingNear(tris, bvh, pairs, side) {
    const cand = new Set();
    for (const p of pairs) cand.add(p[side]);
    if (!cand.size) return 0;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const t of cand) for (let c = 0; c < 9; c++) { const v = tris[t * 9 + c], a = c % 3; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    // directed edges by a numeric hash of their six coordinates (the same doubles give the same hash), each match then
    // confirmed coordinate by coordinate -- string keys cost 9% of a late page shot
    const E = new Map(), h = (o, q) => tris[o] * 1.1 + tris[o + 1] * 2.3 + tris[o + 2] * 3.7 + tris[q] * 5.9 + tris[q + 1] * 7.3 + tris[q + 2] * 11.1;
    const same = (o, q) => tris[o] === tris[q] && tris[o + 1] === tris[q + 1] && tris[o + 2] === tris[q + 2];
    for (const t of bvh.trianglesInBox(lo, hi)) for (let i = 0; i < 3; i++) {
        const o = t * 9 + i * 3, q = t * 9 + ((i + 1) % 3) * 3;
        if (same(o, q)) continue;
        const k = h(o, q), l = E.get(k);
        if (l) l.push(o, q); else E.set(k, [o, q]);
    }
    let open = 0;
    for (const t of cand) for (let i = 0; i < 3; i++) {
        const o = t * 9 + i * 3, q = t * 9 + ((i + 1) % 3) * 3;
        if (same(o, q)) continue;
        const l = E.get(h(q, o));                                   // the twin runs q -> o
        let found = false;
        if (l) for (let m = 0; m < l.length && !found; m += 2) found = same(l[m], q) && same(l[m + 1], o);
        if (!found) open++;
    }
    return open;
}

/**
 * Round 16h: how far apart two ends of untwinned edges of one operand may be and still be taken as one point -- meshCSG's
 * EPS. Measured on the page's switching chains (12 seeds, 10 bvh / 10 bsp / 10 bvh): most such pairs are a rounding apart
 * (1.2e-14 at most: the BSP computes a split point per polygon), but a corner of one polygon can sit 1.6e-9 from its
 * neighbour's; at 1e-12 27 of the 120 shots after the BSP's still declined (a split beside such a corner turns a triangle
 * over), at 1e-8 none.
 */
export const CONFORM_MERGE = 1e-8;
/**
 * Round 16h: how far off a T-junction's long side its middle vertex may lie -- meshCSG's EPS, within which the BSP rounds a
 * vertex onto a plane (measured 1.03e-9 at most on the page's switching chains).
 */
export const CONFORM_SPLIT = 1e-8;

/**
 * Round 16h: make side `side` of the pairs conforming near the seam, where it is not (nonConformingNear): among the
 * triangles around the pair triangles, (1) vertices on an untwinned edge within CONFORM_MERGE of each other become one (the
 * lexicographically least; every triangle of the mesh on the moved bits follows), and (2) each untwinned edge is split
 * at the untwinned edges' vertices lying strictly inside it within CONFORM_SPLIT -- a T-junction's long side gets its
 * short sides' points. Returns { tris, src (new triangle -> old), stats } or null (nothing to do, or a split would turn a
 * triangle over: the caller declines).
 */
function conformNear(tris, bvh, pairs, side) {
    const cand = new Set();
    for (const p of pairs) cand.add(p[side]);
    if (!cand.size) return null;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const t of cand) for (let c = 0; c < 9; c++) { const v = tris[t * 9 + c], a = c % 3; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const R = 2 * Math.max(CONFORM_MERGE, CONFORM_SPLIT);                 // a box query stays valid after the merge's moves
    for (let a = 0; a < 3; a++) { lo[a] -= R; hi[a] += R; }
    // the region is every triangle the box touches; edges are indexed over every triangle touching THEIR box, so each
    // region triangle's twin is indexed (a twin overlaps its triangle's box) -- one on the rim of the first box may have its
    // twin outside it, which is not an open edge
    const out = Float64Array.from(tris), region = bvh.trianglesInBox(lo, hi), inRegion = new Uint8Array(tris.length / 9);
    const lo2 = [...lo], hi2 = [...hi];
    for (const t of region) { inRegion[t] = 1; for (let c = 0; c < 9; c++) { const v = tris[t * 9 + c], a = c % 3; if (v < lo2[a]) lo2[a] = v; if (v > hi2[a]) hi2[a] = v; } }
    for (let a = 0; a < 3; a++) { lo2[a] -= R; hi2[a] += R; }
    const touched = bvh.trianglesInBox(lo2, hi2);
    const same = (o, q) => out[o] === out[q] && out[o + 1] === out[q + 1] && out[o + 2] === out[q + 2];
    const hv = (o) => out[o] * 1.1 + out[o + 1] * 2.3 + out[o + 2] * 3.7;
    // the region's untwinned directed edges, [corner offset, next corner offset] (nonConformingNear's hash, every match exact)
    const openEdges = () => {
        const E = new Map();
        for (const t of touched) for (let i = 0; i < 3; i++) {
            const o = t * 9 + i * 3, q = t * 9 + ((i + 1) % 3) * 3, k = hv(o) * 5.9 + hv(q) * 7.3, l = E.get(k);
            if (l) l.push(o, q); else E.set(k, [o, q]);
        }
        const open = [];
        for (const t of region) for (let i = 0; i < 3; i++) {
            const o = t * 9 + i * 3, q = t * 9 + ((i + 1) % 3) * 3;
            if (same(o, q)) continue;
            const l = E.get(hv(q) * 5.9 + hv(o) * 7.3);
            let found = false;
            if (l) for (let m = 0; m < l.length && !found; m += 2) found = same(l[m], q) && same(l[m + 1], o);
            if (!found) open.push(o, q);
        }
        return open;
    };
    // the distinct points among the untwinned edges' ends, by bits
    const endsOf = (open) => {
        const H = new Map(), P = [];
        for (const o of open) {
            const h = hv(o), l = H.get(h);
            if (l && l.some((p) => same(p, o))) continue;
            if (l) l.push(o); else H.set(h, [o]);
            P.push(o);
        }
        return { H, P };
    };
    // (1) the near-misses: ends of untwinned edges within CONFORM_MERGE become one -- the least by x, y, z; every corner of
    // the mesh on the moved bits follows (a triangle outside the region shares a moved vertex only by its bits)
    let open = openEdges();
    if (!open.length) return null;
    let { P } = endsOf(open);
    const V = P.map((o) => [out[o], out[o + 1], out[o + 2]]).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const parent = V.map((_, i) => i), find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length && V[j][0] - V[i][0] <= CONFORM_MERGE; j++) {
        const a = V[i], b = V[j];
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= CONFORM_MERGE) { const ri = find(i), rj = find(j); if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj); }
    }
    let merged = 0;
    for (let i = 0; i < V.length; i++) {
        const r = find(i); if (r === i) continue;
        const from = V[i], to = V[r], e = CONFORM_MERGE;
        for (const t of bvh.trianglesInBox([from[0] - e, from[1] - e, from[2] - e], [from[0] + e, from[1] + e, from[2] + e]))
            for (let c = 0; c < 3; c++) { const o = t * 9 + c * 3; if (out[o] === from[0] && out[o + 1] === from[1] && out[o + 2] === from[2]) { out[o] = to[0]; out[o + 1] = to[1]; out[o + 2] = to[2]; merged++; } }
    }
    // (2) the T-junctions: an untwinned edge split at the untwinned edges' ends strictly inside it, within CONFORM_SPLIT
    open = openEdges();
    const ends = endsOf(open), isEnd = (o) => { const l = ends.H.get(hv(o)); return !!l && l.some((p) => same(p, o)); };
    const splits = new Map();
    for (let e = 0; e < open.length; e += 2) {
        const o = open[e], q = open[e + 1], t = (o / 9) | 0, i = ((o - t * 9) / 3) | 0;
        const a = [out[o], out[o + 1], out[o + 2]], d = [out[q] - a[0], out[q + 1] - a[1], out[q + 2] - a[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        const blo = [Math.min(a[0], out[q]) - R, Math.min(a[1], out[q + 1]) - R, Math.min(a[2], out[q + 2]) - R];
        const bhi = [Math.max(a[0], out[q]) + R, Math.max(a[1], out[q + 1]) + R, Math.max(a[2], out[q + 2]) + R];
        const on = [], seen = new Map();
        for (const u of bvh.trianglesInBox(blo, bhi)) {
            if (!inRegion[u]) continue;
            for (let c = 0; c < 3; c++) {
                const x = u * 9 + c * 3, hx = hv(x), sl = seen.get(hx);
                if ((sl && sl.some((y) => same(x, y))) || !isEnd(x)) continue;
                if (sl) sl.push(x); else seen.set(hx, [x]);
                const s = ((out[x] - a[0]) * d[0] + (out[x + 1] - a[1]) * d[1] + (out[x + 2] - a[2]) * d[2]) / L2;
                if (!(s > 0 && s < 1) || same(x, o) || same(x, q)) continue;
                if (Math.hypot(a[0] + s * d[0] - out[x], a[1] + s * d[1] - out[x + 1], a[2] + s * d[2] - out[x + 2]) <= CONFORM_SPLIT) on.push([s, [out[x], out[x + 1], out[x + 2]]]);
            }
        }
        if (on.length) { on.sort((u, v) => u[0] - v[0]); if (!splits.has(t)) splits.set(t, [[], [], []]); splits.get(t)[i] = on.map((u) => u[1]); }
    }
    if (!merged && !splits.size) return null;
    const nT = out.length / 9, res = new Float64Array(out.length * 3 + [...splits.values()].reduce((n, sp) => n + 9 * (sp[0].length + sp[1].length + sp[2].length + 3), 0)), src = [];
    let split = 0, collapsed = 0, w = 0;
    const emit = (f) => { for (const v of f) { res[w++] = v[0]; res[w++] = v[1]; res[w++] = v[2]; } };
    for (let t = 0; t < nT; t++) {
        const sp = splits.get(t);
        if (!sp) {
            const o = t * 9;
            if (same(o, o + 3) || same(o + 3, o + 6) || same(o + 6, o)) { collapsed++; continue; }    // two corners merged: an edge, not a face
            res.set(out.subarray(o, o + 9), w); w += 9; src.push(t); continue;
        }
        const C = [0, 1, 2].map((c) => [out[t * 9 + c * 3], out[t * 9 + c * 3 + 1], out[t * 9 + c * 3 + 2]]);
        const n = cross3(sub3(C[1], C[0]), sub3(C[2], C[0]));
        // one split side fans from its opposite corner; more, from the centroid
        const sides = sp.filter((x) => x.length).length, fans = [];
        if (sides === 1) {
            const i = sp.findIndex((x) => x.length), apex = C[(i + 2) % 3], chain = [C[i], ...sp[i], C[(i + 1) % 3]];
            for (let k = 0; k + 1 < chain.length; k++) fans.push([chain[k], chain[k + 1], apex]);
        } else {
            const ring = [];
            for (let i = 0; i < 3; i++) { ring.push(C[i]); for (const x of sp[i]) ring.push(x); }
            const g = [(C[0][0] + C[1][0] + C[2][0]) / 3, (C[0][1] + C[1][1] + C[2][1]) / 3, (C[0][2] + C[1][2] + C[2][2]) / 3];
            for (let k = 0; k < ring.length; k++) fans.push([ring[k], ring[(k + 1) % ring.length], g]);
        }
        for (const f of fans) {
            if (dot3(cross3(sub3(f[1], f[0]), sub3(f[2], f[0])), n) <= 0) return null;   // a split would turn it over: decline
            emit(f);
            src.push(t);
        }
        split++;
    }
    return { tris: res.slice(0, w), src: Int32Array.from(src), stats: { merged, split, collapsed, open: open.length / 2 } };
}

/**
 * Round 20b: the height under which an output triangle is a SLIVER -- the only triangles the exact output's rounding has
 * been measured to fold (round 20: every crossing on the page soak had one 1.4e-9 high or less) -- and the longest edge
 * embedRounded() collapses. meshCSG's EPS.
 */
export const EMBED_SLIVER = 1e-8;
/**
 * Round 20b: a triangle with an edge this short is left to the caller's rounding weld (blastEngine.mjs's EXACT_FINISH_WELD,
 * the same 1e-14): its two points are a few ulps apart and the weld makes them one. Measured on meshCSG's twelve-blast case:
 * 2..9 crossings a shot among such triangles, every collapse that removed one moving a point 3e-16 at most -- and 4,000-
 * 5,500 pairs tested a shot to find them (1.6x the shot); the finished wall had none (round 20). On the page soak every
 * crossing's shortest edge was 7.2e-13 or longer.
 */
export const EMBED_ROUNDING = 1e-14;
const shortestEdge = (b, t) => { const o = t * 9; return Math.min(Math.hypot(b[o + 3] - b[o], b[o + 4] - b[o + 1], b[o + 5] - b[o + 2]), Math.hypot(b[o + 6] - b[o + 3], b[o + 7] - b[o + 4], b[o + 8] - b[o + 5]), Math.hypot(b[o] - b[o + 6], b[o + 1] - b[o + 7], b[o + 2] - b[o + 8])); };

const triOf = (b, t) => [[b[t * 9], b[t * 9 + 1], b[t * 9 + 2]], [b[t * 9 + 3], b[t * 9 + 4], b[t * 9 + 5]], [b[t * 9 + 6], b[t * 9 + 7], b[t * 9 + 8]]];
const vkey = (b, o) => b[o] + "," + b[o + 1] + "," + b[o + 2];
function heightOf(b, t) {
    const o = t * 9, u = [b[o + 3] - b[o], b[o + 4] - b[o + 1], b[o + 5] - b[o + 2]], v = [b[o + 6] - b[o], b[o + 7] - b[o + 1], b[o + 8] - b[o + 2]];
    const w = [b[o + 6] - b[o + 3], b[o + 7] - b[o + 4], b[o + 8] - b[o + 5]];
    const L = Math.max(Math.hypot(u[0], u[1], u[2]), Math.hypot(v[0], v[1], v[2]), Math.hypot(w[0], w[1], w[2]));
    return L ? Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / L : 0;
}

/**
 * Round 20b: the exact output, rounded to doubles, made to cross itself nowhere. Rounding moves each seam point by up to
 * half an ulp, which turns two nearly coplanar slivers sharing a corner into a crossing (round 20: 29 on the page soak,
 * 1.8e-16 deep at most, up to 2.2e-9 long). Among the pairs where one triangle is NEW (not its source triangle, bit for
 * bit) and one of the two is a sliver (EMBED_SLIVER), each crossing -- exactPair, exactly -- is removed by collapsing the
 * shortest edge of its two triangles that moves a point the ARRANGEMENT made (never a vertex of either operand) by at most
 * EMBED_SLIVER, onto the edge's other end; a collapse that would turn a triangle over, or join two vertices that share a
 * neighbour other than the edge's own two (the link condition: the surface would pinch), is refused. Triangles the
 * collapse flattens go. Repeated until none is left or nothing collapses, at most ROUNDS times, and checked once more after
 * the last (stats.embed.left counts what stays). Exported for its gate's synthetic fixtures (meshBoolean-selfcheck 26).
 */
export function embedRounded(buf, from, trisA, bvhA, trisB, bvhB, amb = []) {
    const n0 = buf.length / 9, stats = { pairs: 0, crossings: 0, collapsed: 0, refused: 0, left: 0, rounds: 0, maxMove: 0 };
    // the operands' own vertices never move (a vertex's own box finds every triangle it is a corner of)
    const isInput = (b, o) => { const p = [b[o], b[o + 1], b[o + 2]];
        for (const [T, bv] of [[trisA, bvhA], [trisB, bvhB]]) for (const t of bv.trianglesInBox(p, p)) for (let c = 0; c < 3; c++) { const q = t * 9 + c * 3; if (T[q] === p[0] && T[q + 1] === p[1] && T[q + 2] === p[2]) return true; }
        return false; };
    let B = buf, F = from, alive = new Uint8Array(n0).fill(1);
    const same9 = (X, i, Y, j) => { for (let c = 0; c < 9; c++) if (X[i * 9 + c] !== Y[j * 9 + c]) return false; return true; };
    const isNew = new Uint8Array(n0);
    for (let i = 0; i < n0; i++) { const f = F[i]; isNew[i] = f >= 0 ? (same9(B, i, trisA, f) ? 0 : 1) : f !== -0x7fffffff && same9(B, i, trisB, -f - 1) ? 0 : 1; }
    const sub = (idx) => { const s = new Float64Array(idx.length * 9); idx.forEach((t, k) => s.set(B.subarray(t * 9, t * 9 + 9), k * 9)); return s; };
    const ROUNDS = 4;
    for (let round = 0; round <= ROUNDS; round++) {
        // the pairs to test: a new sliver against every triangle; a new triangle against every sliver. Heights are taken
        // for the new triangles and for the old ones in the new triangles' box only (the rest cannot meet them)
        const n = B.length / 9, NEW = [], NS = [], SL = [];
        const outA = new Int32Array(trisA.length / 9).fill(-1), outB = new Int32Array(trisB.length / 9).fill(-1);
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let t = 0; t < n; t++) {
            if (!alive[t]) continue;
            if (!isNew[t]) { const f = F[t]; if (f >= 0) outA[f] = t; else outB[-f - 1] = t; continue; }
            NEW.push(t);
            for (let c = 0; c < 9; c++) { const v = B[t * 9 + c], a = c % 3; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
            if (heightOf(B, t) < EMBED_SLIVER && shortestEdge(B, t) > EMBED_ROUNDING) { NS.push(t); SL.push(t); }
        }
        if (!NEW.length) break;
        for (const [bv, out] of [[bvhA, outA], [bvhB, outB]]) for (const j of bv.trianglesInBox(lo, hi)) { const t = out[j]; if (t >= 0 && heightOf(B, t) < EMBED_SLIVER && shortestEdge(B, t) > EMBED_ROUNDING) SL.push(t); }
        if (!NS.length && !SL.length) break;
        const pairs = [], seen = new Set(), add = (a, b) => { if (a === b || !alive[a] || !alive[b]) return; const k = Math.min(a, b) * 4294967296 + Math.max(a, b); if (!seen.has(k)) { seen.add(k); pairs.push([a, b]); } };
        const bvhNEW = NEW.length ? new MeshBVH(sub(NEW)) : null;
        if (NS.length) {
            const bvhNS = new MeshBVH(sub(NS));
            if (bvhNEW) for (const [i, j] of pairOverlap(bvhNS, bvhNEW, 0)) add(NS[i], NEW[j]);
            for (const [i, j] of pairOverlap(bvhNS, bvhA, 0)) if (outA[j] >= 0) add(NS[i], outA[j]);
            for (const [i, j] of pairOverlap(bvhNS, bvhB, 0)) if (outB[j] >= 0) add(NS[i], outB[j]);
        }
        const OS = SL.filter((t) => !isNew[t]);   // (the new slivers are paired with every new triangle above)
        if (bvhNEW && OS.length) for (const [i, j] of pairOverlap(bvhNEW, new MeshBVH(sub(OS)), 0)) add(NEW[i], OS[j]);
        const crossing = [];
        pairs.sort((x, y) => Math.min(x[0], x[1]) - Math.min(y[0], y[1]) || Math.max(x[0], x[1]) - Math.max(y[0], y[1]));   // round 23
        stats.pairs += pairs.length;
        for (const [a, b] of pairs) {
            const TA = triOf(B, a), TB = triOf(B, b);
            if (degenerateTri(TA) || degenerateTri(TB)) continue;
            const e = exactPair(TA, TB);
            if (e.kind !== "point" && e.kind !== "segment") continue;
            const sh = TA.filter((p) => TB.some((q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2])).map(explicitPoint), isSh = (P) => sh.some((Q) => samePoint(P, Q));
            if (e.kind === "point" ? !isSh(e.P) : !(sh.length === 2 && isSh(e.P0) && isSh(e.P1))) crossing.push([a, b]);
        }
        if (round === 0) stats.crossings = crossing.length;
        stats.left = crossing.length;                                // what the last detection found -- after the last collapse
        if (!crossing.length || round === ROUNDS) break;
        stats.rounds++;
        // incidence: vertex key -> triangles
        const inc = new Map();
        for (let t = 0; t < n; t++) if (alive[t]) for (let c = 0; c < 3; c++) { const k = vkey(B, t * 9 + c * 3); let l = inc.get(k); if (!l) inc.set(k, (l = [])); l.push(t); }
        const touched = new Set();
        let any = false;
        for (const [a, b] of crossing) {
            if (touched.has(a) || touched.has(b)) continue;
            const cands = [];
            for (const t of [a, b]) for (let i = 0; i < 3; i++) for (const [pi, qi] of [[i, (i + 1) % 3], [(i + 1) % 3, i]]) {
                const po = t * 9 + pi * 3, qo = t * 9 + qi * 3, kp = vkey(B, po);
                if (isInput(B, po)) continue;
                const d = Math.hypot(B[po] - B[qo], B[po + 1] - B[qo + 1], B[po + 2] - B[qo + 2]);
                if (d > 0 && d <= EMBED_SLIVER) cands.push([d, kp, [B[qo], B[qo + 1], B[qo + 2]]]);
            }
            cands.sort((x, y) => x[0] - y[0]);
            for (const [d, kp, q] of cands) {
                const kq = q[0] + "," + q[1] + "," + q[2], onP = inc.get(kp) || [], onQ = inc.get(kq) || [];
                if (onP.some((t) => touched.has(t)) || onQ.some((t) => touched.has(t))) continue;
                // link condition: the vertices next to both p and q are exactly the apexes of the triangles on edge pq
                const nb = (l, self) => { const s = new Set(); for (const t of l) for (let c = 0; c < 3; c++) { const k = vkey(B, t * 9 + c * 3); if (k !== self) s.add(k); } return s; };
                const NP = nb(onP, kp), NQ = nb(onQ, kq), apex = new Set();
                for (const t of onP) if (onQ.includes(t)) for (let c = 0; c < 3; c++) { const k = vkey(B, t * 9 + c * 3); if (k !== kp && k !== kq) apex.add(k); }
                let link = true;
                for (const k of NP) if (k !== kq && NQ.has(k) && !apex.has(k)) { link = false; break; }
                // no triangle on p turns over
                let flip = false;
                for (const t of onP) {
                    if (onQ.includes(t)) continue;                            // flattened by the collapse: it goes
                    const T = triOf(B, t), j = T.findIndex((v) => v[0] + "," + v[1] + "," + v[2] === kp), T2 = T.map((v, i) => (i === j ? q : v));
                    const n1 = cross3(sub3(T[1], T[0]), sub3(T[2], T[0])), n2 = cross3(sub3(T2[1], T2[0]), sub3(T2[2], T2[0]));
                    if (dot3(n1, n2) <= 0) { flip = true; break; }
                }
                if (!link || flip) { stats.refused++; continue; }
                for (const t of onP) {
                    if (onQ.includes(t)) { alive[t] = 0; continue; }
                    for (let c = 0; c < 3; c++) { const o = t * 9 + c * 3; if (vkey(B, o) === kp) { if (B === buf) B = Float64Array.from(buf); B[o] = q[0]; B[o + 1] = q[1]; B[o + 2] = q[2]; } }
                    isNew[t] = 1;
                }
                for (const t of onP) touched.add(t);
                for (const t of onQ) touched.add(t);
                stats.collapsed++; stats.maxMove = Math.max(stats.maxMove, d); any = true;
                break;
            }
        }
        if (!any) break;
    }
    if (B === buf && alive.every((x) => x)) return { tris: buf, from, amb, stats };
    const keep = [];
    for (let t = 0; t < alive.length; t++) if (alive[t]) keep.push(t);
    const renum = new Int32Array(alive.length).fill(-1);
    keep.forEach((t, i) => { renum[t] = i; });
    return { tris: sub(keep), from: keep.map((t) => F[t]), amb: amb.map((t) => renum[t]).filter((t) => t >= 0), stats };
}

function meshBooleanCore(trisA, bvhA, trisB, bvhB, op, opts) {
    // round 16: a ZERO-THICKNESS FIN -- two faces of one operand on the same three vertices, wound opposite ways -- has
    // no volume and is not in the regularised result; left in, it breaks every ray that crosses it (pointInMesh welds
    // the two coincident hits into one and the parity flips). Each such pair is cancelled before anything else, and
    // `from` still names the caller's triangles.
    if (opts.contacts !== false && opts.cancelFins !== false) {
        const ka = reverseTwins(trisA), kb = reverseTwins(trisB);
        if (ka || kb) {
            const A2 = ka ? pick(trisA, ka) : trisA, B2 = kb ? pick(trisB, kb) : trisB;
            const r = meshBooleanCore(A2, ka ? new MeshBVH(A2) : bvhA, B2, kb ? new MeshBVH(B2) : bvhB, op, { ...opts, cancelFins: false });
            for (let i = 0; i < r.from.length; i++) {
                const f = r.from[i];
                if (f >= 0) { if (ka) r.from[i] = ka[f]; }
                else if (f !== -0x7fffffff && kb) r.from[i] = -(kb[-f - 1] + 1);
            }
            r.stats.a.finsCancelled = ka ? trisA.length / 9 - ka.length : 0;
            r.stats.b.finsCancelled = kb ? trisB.length / 9 - kb.length : 0;
            return r;
        }
    }
    if (opts.contacts !== false) {
        const eA = isEmptySolid(trisA), eB = isEmptySolid(trisB);
        if (eA || eB) {
            // this path never reaches assembleBoolean(), whose guard round 6's review added: the same guard, here only
            // (a copy at the top of this function would make that one untestable -- the gate's sabotage F)
            if (!VALID_OPS.has(op)) throw new Error('meshBoolean: unrecognized op "' + op + '" (expected "union", "subtract", or "intersect")');
            // union: the other operand; A - B: A, unless A is the empty one; A & B: empty
            const keep = op === "union" ? (eA ? (eB ? null : trisB) : trisA) : op === "subtract" ? (eA ? null : trisA) : null;
            const tris = keep ? Float64Array.from(keep) : new Float64Array(0), n = tris.length / 9;
            const from = Int32Array.from({ length: n }, (_, i) => (keep === trisA ? i : -(i + 1)));
            return { tris, triCount: n, ambiguousTriIndices: [], capped: false, from,
                     stats: { a: emptyStats(trisA, eA), b: emptyStats(trisB, eB) }, emptyOperand: eA ? (eB ? "both" : "a") : "b" };
        }
    }
    // round 16c: B's vertices within VERTEX_ROUND of A's take A's coordinates (vertexRound, above)
    let rounded = null;
    let exactArr = !!opts.exactArrangement && opts.contacts !== false && (opts.cutting ?? MESH_BOOLEAN_DEFAULT_CUTTING) === "arrangement";
    // round 16g: the exact arrangement's PRECONDITION -- where the operands meet, every edge has its twin on the same two
    // doubles. A seam then closes by identity; with a T-junction (a meshCSG BSP wall: a long edge against two short ones
    // whose middle vertex lies up to 1.03e-9 off it, measured at 16h) the plane of the other mesh crosses "the same" line at
    // distinct points, the chain has a gap, and the region floods through it -- a blob triangle classified whole (page session,
    // engines switched every 25 shots: 6.2 units of the wall lost by shot 100). Where the precondition fails the operation
    // takes the snapped path, whose 1e-9 snap closes such gaps (stats.exactDeclined); opts.exactConforming:false skips the
    // check (the gate's control).
    let pairsX = null, declined = null;
    if (exactArr) {
        pairsX = canonPairs(pairOverlap(bvhA, bvhB, MESH_BOOLEAN_NEAR));
        if (opts.exactConforming !== false) {
            const a = nonConformingNear(trisA, bvhA, pairsX, 0), b = nonConformingNear(trisB, bvhB, pairsX, 1);
            // round 16h: first make the operands conforming there (conformNear) and run on those, `from` naming the
            // caller's triangles; only what that leaves non-conforming declines
            // round 23: conforming and the snapped path read the tree's traversal order -- a derived tree is built in full first
            if (a || b) { bvhA = freshTree(bvhA, trisA); bvhB = freshTree(bvhB, trisB); }
            if ((a || b) && opts.conform !== false) {
                const cA = a ? conformNear(trisA, bvhA, pairsX, 0) : null, cB = b ? conformNear(trisB, bvhB, pairsX, 1) : null;
                if (cA || cB) {
                    const A2 = cA ? cA.tris : trisA, B2 = cB ? cB.tris : trisB;
                    const r = meshBooleanCore(A2, cA ? new MeshBVH(A2) : bvhA, B2, cB ? new MeshBVH(B2) : bvhB, op, { ...opts, conform: false, cancelFins: false });
                    for (let i = 0; i < r.from.length; i++) {
                        const f = r.from[i];
                        if (f >= 0) { if (cA) r.from[i] = cA.src[f]; }
                        else if (f !== -0x7fffffff && cB) r.from[i] = -(cB.src[-f - 1] + 1);
                    }
                    r.stats.a.conformed = cA ? cA.stats : null; r.stats.b.conformed = cB ? cB.stats : null;
                    return r;
                }
            }
            if (a || b) { exactArr = false; declined = { a, b }; opts = { ...opts, exactArrangement: false }; }
        }
    }
    if (!exactArr) { bvhA = freshTree(bvhA, trisA); bvhB = freshTree(bvhB, trisB); }   // round 23: see canonPairs
    if (opts.contacts !== false && opts.vertexRound !== false && !exactArr) {
        rounded = vertexRound(trisA, bvhA, trisB, opts.vertexRoundRadius ?? VERTEX_ROUND);
        if (rounded.tris) { trisB = rounded.tris; bvhB = new MeshBVH(trisB); }
    }
    // round 16: one set of seam points for both meshes' arrangements (seamConsensus, below)
    let optsA = opts, optsB = opts;
    if (exactArr) {
        // round 16f: every pair decided once, exactly, for both meshes' arrangements (exactArrangement.mjs)
        const pairs = pairsX, res = new Map();
        for (const [a, b] of pairs) res.set(a * 4294967296 + b, exactPair(readTri(trisA, a), readTri(trisB, b)));
        optsA = { ...opts, exactPairs: res, pairSide: 0, pairs };
        optsB = { ...opts, exactPairs: res, pairSide: 1, pairs: pairs.map(([a, b]) => [b, a]) };
    } else if (opts.contacts !== false && (opts.cutting ?? MESH_BOOLEAN_DEFAULT_CUTTING) === "arrangement" && opts.seamConsensus !== false) {
        const sc = seamConsensus(trisA, bvhA, trisB, bvhB, SNAP_EPS, !!opts.exactSeam, opts.seamFolds !== false);
        optsA = { ...opts, seamCanon: sc.canon, pairResults: sc.results, pairSide: 0, pairs: sc.pairs };
        optsB = { ...opts, seamCanon: sc.canon, pairResults: sc.results, pairSide: 1, pairs: sc.pairs.map(([a, b]) => [b, a]) };
    }
    const classifiedA = classifyMeshAgainstOther(trisA, bvhA, trisB, bvhB, optsA);
    const classifiedB = classifyMeshAgainstOther(trisB, bvhB, trisA, bvhA, optsB);
    const { tris, ambiguousTriIndices, from } = assembleBoolean(classifiedA, classifiedB, op);
    const buf = new Float64Array(tris.length * 9);
    for (let i = 0; i < tris.length; i++) {
        for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) buf[i * 9 + v * 3 + c] = tris[i][v][c];
    }
    const capped = classifiedA.stats.capped || classifiedB.stats.capped;
    // round 20b: the exact output rounded without crossing itself
    let outTris = buf, outFrom = from, outAmb = ambiguousTriIndices;
    if (exactArr && opts.embed !== false) {
        const e = embedRounded(buf, from, trisA, bvhA, trisB, bvhB, ambiguousTriIndices);
        outTris = e.tris; outFrom = e.from; outAmb = e.amb; classifiedA.stats.embed = e.stats;
    }
    if (rounded) classifiedB.stats.vertexRound = rounded.stats;
    if (declined) { classifiedA.stats.exactDeclined = declined.a; classifiedB.stats.exactDeclined = declined.b; }
    return { tris: outTris, triCount: outTris.length / 9, ambiguousTriIndices: outAmb, capped, from: Int32Array.from(outFrom), exact: exactArr,
             stats: { a: classifiedA.stats, b: classifiedB.stats } };
}
