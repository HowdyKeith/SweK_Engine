// WebGLEngine/physics/mesh/meshBoolean-selfcheck.mjs
//
// Run: node physics/mesh/meshBoolean-selfcheck.mjs
//
// GATES physics/mesh/meshBoolean.mjs -- round 6 of the BVH-CSG arc (tools/ship/nextRounds.mjs's
// "bvh-csg-speed-vs-manifold-tradeoff"), whole-mesh fragment assembly and the union/subtract/intersect
// keep-rule table. See meshBoolean.mjs's own header for the full algorithm derivation and its cross-check
// against physics/mesh/meshCSG.mjs's own trusted BSP subtract()/union()/intersect().
//
// ORACLES USED, ALL INDEPENDENT OF meshBoolean.mjs's OWN CODE:
//   - meshCSG.mjs's volume() -- an exact, triangulation-independent divergence-theorem computation, run on
//     the SAME two input meshes through meshCSG's own, structurally different (BSP, not ray-parity + planar
//     multi-clip) subtract()/union()/intersect(). Feasible with zero new conversion code: meshCSG.mjs already
//     exports toTriangleBuffer() (poly -> the flat buffer this file's own pipeline consumes) and planeOf()
//     (buffer -> poly, for handing this file's own output back to volume()/watertight()).
//   - A hand-derived axis-interval-overlap volume (independent of meshCSG.mjs's own code) for every
//     axis-aligned box-vs-box fixture -- both operands are boxes, so the overlap volume is exactly the
//     product of three clamped per-axis interval lengths, computable by hand with no code shared with either
//     meshCSG.mjs or meshBoolean.mjs.
//   - meshCSG-selfcheck.mjs's own section-9 "degenerate contacts" fixtures (the WALL box vs. 8 named cutter
//     boxes) are reused VERBATIM here -- the same geometry, the same interval-overlap oracle -- rather than
//     re-derived, since they are already hand-verified in that file and are exactly the class of fixture (a
//     BSP's own hardest cases) this round's own research recommended reusing.
//
// *** A SECOND ADVERSARIAL REVIEW, RUN AFTER THE FIRST FIX PASS, FOUND TWO MORE REAL ISSUES: *** (1) an
// unrecognized `op` string silently produced a 0-triangle result with no error -- FIXED, see meshBoolean.mjs's
// own header and section 12 below. (2) a degenerate (zero-volume) operand embedded in the other mesh's
// interior produces a wrong-SIGN, non-noise volume error -- a new manifestation of the exact same root cause
// as the touching-contact gap below (an isolated, non-cancelling ambiguous fragment), NOT fixed, reproduced
// directly in section 13 below with the review's own exact measured numbers, independently re-confirmed
// (union 7.833333333333333 vs expected 8; subtract -0.16666666666666666 vs expected 0, note the wrong SIGN;
// intersect 0.16666666666666666 vs expected 0) before being written into this gate.
//
// [ROUND 12: both gaps below are FIXED -- sections 8, 13 and 17, and the ROUND 12 paragraph further down.]
// *** THE REAL, MEASURED, NOT-FIXED-THIS-ROUND GAP, REPRODUCED DIRECTLY (NOT JUST DESCRIBED): *** of the 8
// degenerate-contact fixtures, 3 involve a cutter face sitting FLUSH against a wall face with otherwise ZERO
// interior overlap. Section 8 below runs all 8 through meshBoolean() and asserts the 5 that match the oracle
// to float64 noise, then SEPARATELY reports (not asserted as a pass) the exact measured volume error on the
// 3 flush-contact cases -- see meshBoolean.mjs's own header for the root-cause investigation. This is a
// genuinely new finding this round's own research surfaced (2 of the 3 cases) and this round's own
// scratch-verification independently confirmed AND EXTENDED (found a third failing case the research's own
// probe did not report), not previously known to any prior round of this arc.
//
// ROUND 7 (intersection gate on by default, cap raised, top-level `capped`, and the adversarial review's
// fixes): section 11 was RE-BASELINED -- 29/117 unmatched gated (ceiling tightened 45 -> 35) with round 6's
// 37/189 kept as its own ungated reproduction -- section 8 gained two top-level-capped checks, and section 14
// the plane-dedup roof and the accOpts merge. Sabotages on the real files, `finally`-restored, md5 verified,
// RE-MEASURED against the final files; counts are THIS gate's reds (meshBooleanBlast-selfcheck.mjs's header
// has all three gates'):
//   S1 gate inverted -> 16.  S2 first-group-member only -> 1.  S3 only "intersect" meets -> 8.
//   S4 accumulate default flipped ON -> 0 (not this file's contract; triFragmentAccumulate-selfcheck 14a).
//   S5 meshBoolean default gate OFF -> 3: section 11 both, section 14's merge check.
//   S6 default cap back to 256 -> 0 here (no box fixture needs 257 fragments); meshBooleanBlast catches it.
//   S7 top-level capped = stats.a.capped only -> 0 red on the FIRST run, across all three gates -- a real gap.
//      Section 8's B-only fixture (the blob as A, meshCSG's wall as B, round 6's ungated 256-cap path) was
//      added for it; re-run: 1 red, that check.
//   R1 plane dedup reverted -> 1 (section 14's roof, 0.048).  R2 pre-filter removed -> 0 (perf-only; pinned in
//   triFragmentAccumulate-selfcheck 14i).  R3 pre-filter keeps only "intersect" -> 6.  R4 accOpts plain spread
//   -> 1 (section 14).  R5 "coplanar" treated as not meeting -> 1, incidental (section 5's drop demo).
//
// ROUND 9 (segment-bounded cutting, physics/mesh/triArrangement.mjs, now meshBoolean's default): every check that
// tests the PLANE path's own machinery -- the fragment cap and top-level `capped` (section 8), round 6's ungated
// baseline and the gated seam baseline (section 11), the roof on both plane paths and the accOpts merge (section
// 14) -- now asks for cutting:"plane" by name; under the arrangement those options do not apply and those checks
// went red for testing nothing. So THE ROUND-7 COUNTS ABOVE ARE HISTORICAL: measured with the plane path as the
// default, not re-measured; a plane-path sabotage now reaches this gate only through checks that name it and
// through triangles the arrangement refuses. Section 11 gained the arrangement's claim (22 of 22 A-side seam
// vertices bit-identical to B-side ones, raw output watertight; the plane path 16 of 33 within 1e-6), section 14
// holds the arrangement to the roof as well, and section 15 is new: 48 rotated-box runs against the plane path
// and the BSP, 9 blob-pair runs against their own 1000x reference, zero fallbacks and zero unmatched edges on all
// 57, a needle exact by hand at the origin and 1000 units out, and the flush rod pinned as a known gap.
// Sabotage counts for the round-9 files are in triArrangement-selfcheck.mjs's header (A1-A11, M1-M3).
//
// ROUND 12 (contacts: triContact.mjs, and meshBoolean.mjs's ROUND 12 paragraph): sections 8 and 13 turned from KNOWN
// rows pinned at their wrong numbers into exact asserts, each keeping contacts:false as a control that must still
// give round 11's number; section 5 measures the ambiguous-fragment policy on contacts:false, the path that still
// has ambiguity, and shows the default resolves the same fixture with none; section 7 asserts the flush union
// watertight (round 11: 8 of 62 open); section 15's flush rod is exact and closed; section 16's raw-path control no
// longer falls back (1.5e-5 off, 0 fallbacks -- at 1e-6 scale every pair is inside the contact tolerance); section
// 17 is new: 1,350 flush-box runs, 12 tilts, 36 zero-volume runs, two operands with themselves, 18 rotated copies,
// and the rotated band pinned as KNOWN. Sabotages on the real files, restored in `finally`, md5 verified, against
// triContact-selfcheck / THIS / triArrangement-selfcheck / meshBooleanBlast-selfcheck:
//   T1 contacts off by default 0/14/0/0.  T2 ON rule same/opposite swapped 0/13/0/0.  T3 B's ON copy kept 0/12/0/0.
//   T4 broad phase unpadded 0/5/0/0.  T5 coplanar orientation always +1 2/8/0/0.  T6 contactPair's canonical order
//   removed 1/0/0/0 -- 0 red everywhere on the first battery; triContact-selfcheck's bit-for-bit symmetry section
//   was written for it.  T8 ON test strict again 0/1/0/0 (fuzz case 78).  T9 ON test off 0/8/0/0.  T10 near-side
//   test off (rays) 2/1/0/0.  T11 pseudo-normal replaced by the nearest plane 1/0/0/0 -- 0 red on the first
//   battery; the knife-edge section was written for it.  T12 thin cycles refused again 0/4/0/0.  T13 corner
//   contraction off 0/3/0/0.  T14 join off 0/1/0/0 -- 0 red on the first battery; section 17's fallback ceiling
//   (87 against 357) was added for it.  T15 on-plane prune off 0/2/0/0.  T16 edge-conformity pass off 0/4/0/0.
//   T17 conformity injects near-duplicates 0/1/0/1.  T18 empty-solid rule off 0/4/0/0.  T19 empty-solid threshold
//   x1e6 0/2/0/0 (the needle and the small cutter, both real solids, read as empty).  T20 contact snap 1e-12 0/1/0/0.
//   19 of 19 red. The first battery also had coplanar-edge clipping disabled at 0 red: it was measured redundant
//   once the ON test was inclusive and removed (triArrangement.mjs's ROUND 12 paragraph).
// Round 6's A-F below, re-measured on the final files: A 19 red, B 28, C 1, D 2, E 18, F 5 -- all red. Their
// per-section lists are round 6's and name rows that sections 8 and 13 no longer have; the counts here are current.
// F kept its meaning only because the new empty-operand path carries its own copy of the op guard, not one at the
// top of meshBooleanCore (which made F green until moved).
//
// SABOTAGE LOG -- each applied to the real physics/mesh/meshBoolean.mjs, gate run, exit read, file restored
// byte for byte (restore verified via md5sum against a saved copy before every sabotage). Sabotages A-E were
// first measured before sections 12/13 existed (an earlier version of this log recorded those smaller counts
// -- overwritten here since the counts below are re-measured against the CURRENT, final gate, not left stale):
//   A  the subtract row of the keep-rule table (`bKeepAndFlip`'s subtract branch) changed from
//      `inside ? { flip: true } : null` to `inside ? { flip: false } : null` -- B's own cap kept but NOT
//      flipped (the exact bug the derivation in meshBoolean.mjs's own header exists to prevent)
//        -> exit=1, 10 RED: section 1's hand-derived case, section 2's primary-fixture subtract assertion,
//           section 4's subtract-vs-oracle and partition-identity assertions, section 8's "through-cut, BOTH
//           faces flush" and "a cutter that IS the wall" fixtures plus its own 5-of-5-exact-match count, and
//           the randomized sweep in section 9. NOTE section 3's own winding-flip oracle does NOT catch this
//           (an earlier draft of this log wrongly claimed it does, corrected after re-measuring): section 3
//           calls classifyMeshAgainstOther() directly and hand-derives its OWN flip independent of
//           bKeepAndFlip, so it provides zero regression coverage for the real flip decision -- a correct,
//           independently-useful geometric check of what a flip SHOULD look like, but not a test of whether
//           meshBoolean() itself actually applies one. Named here rather than silently left inconsistent.
//   B  keepA's subtract condition changed from `!inside` to `inside` -- A's OWN kept bucket inverted (keeping
//      A_in instead of A_out)
//        -> exit=1, 14 RED: section 1's hand-derived case, section 2's primary-fixture subtract assertion,
//           section 4's subtract-vs-oracle and partition-identity assertions, 4 of section 8's degenerate-
//           contact fixtures (corner-on-edge, edge-along-edge, through-cut-both-flush, swallows-the-wall)
//           plus 2 of its own known-gap bounded assertions plus its own 5-of-5-exact-match count, section 9's
//           randomized sweep, and section 10's disjoint-boxes case -- A's own kept skin is now entirely the
//           wrong side of itself, corrupting nearly every volume-based assertion in the file.
//   C  the ambiguous-flag propagation (`if (f.ambiguous) ambiguousTriIndices.push(...)`) removed from
//      assembleBoolean() for BOTH the A and B loops
//        -> exit=1, 4 RED: section 5's own dedicated ambiguousTriIndices-non-empty assertion on the flush-
//           face union fixture, PLUS (added after section 8's own root-cause-confirmation assertions were
//           written) all 3 of section 8's "confirms the traced root cause ... flagged ambiguous" checks,
//           since assembleBoolean() is the ONLY place ambiguousTriIndices is populated and section 8 reads it
//           through meshBoolean()'s own return value, not classifyMeshAgainstOther() directly -- volume stays
//           exact throughout, since the flag is metadata, not a keep/drop decision.
//   D  the empty-candidate shortcut's early return removed (candidateTriBs=[] or undefined now falls through
//      to calling accumulateFragments() unconditionally instead of skipping it)
//        -> exit=1, 4 RED: section 10's own `emptyCandidateShortcuts === 12` stat assertion (the counter is
//           only incremented inside the now-dead early-return branch, so it stays 0 regardless of how many
//           triangles actually had zero candidates), PLUS all 3 of section 8's "confirms the traced root
//           cause" checks (which also assert `emptyCandidateShortcuts === triCount` on the 3 known-gap
//           fixtures). The CLASSIFICATION itself is unaffected by this sabotage -- section 10's own volume
//           assertion still passes, section 8's own volume-bound assertions still pass, and section 6's own
//           structural-equivalence check (which recomputes both paths independently of meshBoolean.mjs's own
//           shortcut) is untouched -- confirming meshBoolean.mjs's own header claim that the shortcut is a
//           pure auditability/bookkeeping optimization, not a correctness-critical one, while also showing
//           the gate is not blind to removing it: the stats it reports are real, checked values.
//   E  bKeepAndFlip's union branch changed from `inside ? null : { flip: false }` to `inside ? null : { flip:
//      true }` -- B's own kept (B_out) bucket flipped under union when it should not be
//        -> exit=1, 4 RED, BY NAME: section 4's own union-vs-oracle assertion, section 5's own KEEP-ambiguous
//           volume assertion, section 7's own flush-face union volume assertion (all three run union on a
//           fixture with a genuine B_out bucket, so all three independently catch the same wrongly-flipped
//           cap), AND section 13's own degenerate-operand-union baseline assertion (got -7.833333333333333
//           instead of the baseline 7.833333333333333 -- B_out is flipped there too, on a DIFFERENT fixture
//           than sections 4/5/7, giving a 4th, genuinely independent catch of the same sabotage rather than a
//           duplicate).
//   F  the op-validation guard added to assembleBoolean() (`if (!VALID_OPS.has(op)) { throw ... }`) removed
//      entirely -- reverting to the original silent-empty-mesh-on-bad-op bug an adversarial review of this
//      round found
//        -> exit=1, 5 RED: all 5 of section 12's own "throws instead of silently returning an empty mesh"
//           assertions (op="Subtract", "difference", "xor", undefined, "") -- exactly the regression this
//           fix and its gate section exist to catch.
//
// Run: node physics/mesh/meshBoolean-selfcheck.mjs
// SABOTAGE LOG (BVH-CSG round 16) -- triTriIntersect.mjs, triArrangement.mjs, meshBoolean.mjs; five gates (triTriIntersect /
// triArrangement / THIS / meshBooleanBlast / blastEngine), each on the real file, restored in a `finally`, md5 verified.
// 11 of 11 red on the final files:
//   H1  a crossing interpolated from the lone end again          -> 1 / 0 / 0 / 0 / 3
//   H2  normals scaled by the reciprocal again                   -> 0 / 1 / 2 / 0 / 0
//   H3  the seam consensus off by default                        -> 0 / 0 / 1 / 0 / 1
//   H4  the arrangement ignores canon                            -> 0 / 0 / 1 / 0 / 1
//   H5  the consensus joins two input vertices                   -> 0 / 0 / 1 / 0 / 0   (0 on the first battery;
//   H6  the representative ignores input vertices                -> 0 / 0 / 1 / 0 / 0    section 19's by-hand rows)
//   H7  the B side reads the pair results in A's order           -> 0 / 0 / 21 / 13 / 10
//   H8  near-parallel pruning off                                -> 0 / 0 / 1 / 0 / 0
//   H9  fins not cancelled by default                            -> 0 / 0 / 1 / 0 / 0
//   H10 a same-winding duplicate cancelled as a fin              -> 0 / 0 / 1 / 0 / 0   (0 first; by-hand row added)
//   H11 `from` not remapped after cancelling (B side)            -> 0 / 0 / 1 / 0 / 0   (0 first: the fin was LAST in
//       its operand, so cancelling it renumbered nothing; the fixture now puts it first and checks every `from`)
"use strict";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { groupCandidatesByTriA, accumulateFragments } from "./triFragmentAccumulate.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";
import { classifyMeshAgainstOther, assembleBoolean, meshBoolean, seamConsensus, joinSeamEnds, reverseTwins, MESH_BOOLEAN_MAX_FRAGMENTS } from "./meshBoolean.mjs";
import * as M from "./meshCSG.mjs";
import { closestOnTriangle } from "./triContact.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function wrapAsPolys(buf) {
    const n = buf.length / 9, out = [];
    for (let i = 0; i < n; i++) {
        const o = i * 9;
        const vs = [[buf[o], buf[o+1], buf[o+2]], [buf[o+3], buf[o+4], buf[o+5]], [buf[o+6], buf[o+7], buf[o+8]]];
        out.push({ vs, pl: M.planeOf(vs) });
    }
    return out;
}
function buildBVH(polys) {
    const buf = M.toTriangleBuffer(polys);
    return { buf, bvh: new MeshBVH(buf) };
}
// Independent axis-interval-overlap oracle -- both operands are axis-aligned boxes, so their overlap volume
// is exactly the product of three clamped per-axis interval lengths. Shares no code with meshCSG.mjs or
// meshBoolean.mjs.
function overlapVol(c1, h1, c2, h2) {
    let v = 1;
    for (let i = 0; i < 3; i++) {
        const lo = Math.max(c1[i] - h1[i], c2[i] - h2[i]), hi = Math.min(c1[i] + h1[i], c2[i] + h2[i]);
        v *= Math.max(0, hi - lo);
    }
    return v;
}
function lcg(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

// =============================================================================================================
console.log("1. *** HAND-DERIVED: UNIT CUBE MINUS A CORNER-OVERLAPPING BOX, VOLUME COMPUTABLE WITH NO CODE ***");
{
    // A = [-1,1]^3 (volume 8), B = [0.5,1.5]^3 (a box centered at (1,1,1), half-extent 0.5), overlap is
    // exactly [0.5,1]^3, volume 0.5^3 = 0.125. Expected result: 8 - 0.125 = 7.875, by hand, no code.
    const Apolys = M.boxPolys([0,0,0],[1,1,1]), Bpolys = M.boxPolys([1,1,1],[0.5,0.5,0.5]);
    const { buf: bufA, bvh: bvhA } = buildBVH(Apolys), { buf: bufB, bvh: bvhB } = buildBVH(Bpolys);
    const r = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract");
    const got = M.volume(wrapAsPolys(r.tris));
    ok("!! unit-cube-minus-corner-box subtract volume is exactly 7.875", close(got, 7.875, 1e-9),
        "got " + got + ", err " + Math.abs(got - 7.875).toExponential(3));
}

// =============================================================================================================
console.log("\n2. *** PRIMARY FIXTURE: GENERAL-POSITION BOX-MINUS-BOX, CROSS-CHECKED AGAINST meshCSG.mjs's OWN BSP ***");
let PRIMARY;
{
    const Ac = [0,0,0], Ah = [1,1,1], Bc = [1,0.3,0.2], Bh = [0.8,0.6,0.5];
    const Apolys = M.boxPolys(Ac, Ah), Bpolys = M.boxPolys(Bc, Bh);
    const { buf: bufA, bvh: bvhA } = buildBVH(Apolys), { buf: bufB, bvh: bvhB } = buildBVH(Bpolys);
    const oracle = M.volume(M.subtract(Apolys, Bpolys));
    const expByHand = M.volume(Apolys) - overlapVol(Ac, Ah, Bc, Bh);
    ok("!! meshCSG's own BSP oracle agrees with the independent interval-overlap hand computation",
        close(oracle, expByHand, 1e-9), "oracle " + oracle + " vs hand " + expByHand);
    const r = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract");
    const got = M.volume(wrapAsPolys(r.tris));
    ok("!! meshBoolean() subtract matches meshCSG's BSP oracle to float64 noise",
        close(got, oracle, 1e-9), "oracle " + oracle + ", got " + got + ", diff " + Math.abs(got - oracle).toExponential(3));
    ok("!! no fragment budget was capped on this fixture", !r.stats.a.capped && !r.stats.b.capped,
        "statsA.capped=" + r.stats.a.capped + " statsB.capped=" + r.stats.b.capped);
    ok("!! no unresolved (all-3-vertices-on-plane) fragments on this clean, non-degenerate fixture",
        r.stats.a.unresolvedCount === 0 && r.stats.b.unresolvedCount === 0,
        "a=" + r.stats.a.unresolvedCount + " b=" + r.stats.b.unresolvedCount);
    ok("!! no ambiguous fragments on this clean, non-degenerate fixture",
        r.ambiguousTriIndices.length === 0, "ambiguousTriIndices.length=" + r.ambiguousTriIndices.length);
    PRIMARY = { Apolys, Bpolys, bufA, bvhA, bufB, bvhB, r, oracle };
}

// =============================================================================================================
console.log("\n3. *** WINDING-FLIP CORRECTNESS, CHECKED GEOMETRICALLY, NOT ASSUMED FROM THE DERIVATION ALONE ***");
{
    // For every B_in fragment (kept, flipped under subtract): B's own PRE-flip outward normal must point
    // AWAY from B's own center (the standard convention for B's own solid); the POST-flip normal must point
    // TOWARD B's own center (the correct outward normal for the carved cavity of A-B at that point). A single
    // arbitrary "outside point" is NOT a valid oracle here (it is not outward-facing for every face of a
    // box), which is why this uses B's own center specifically -- verified as the right reference during this
    // round's own scratch-verification, which caught a flawed first-attempt oracle using an arbitrary distant
    // point before this file was written.
    function outwardNormal(tri) {
        const e1 = [tri[1][0]-tri[0][0], tri[1][1]-tri[0][1], tri[1][2]-tri[0][2]];
        const e2 = [tri[2][0]-tri[0][0], tri[2][1]-tri[0][1], tri[2][2]-tri[0][2]];
        return [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]];
    }
    function centroid(tri) { return [(tri[0][0]+tri[1][0]+tri[2][0])/3, (tri[0][1]+tri[1][1]+tri[2][1])/3, (tri[0][2]+tri[1][2]+tri[2][2])/3]; }
    const Bcenter = [1, 0.3, 0.2];
    const classifiedB = classifyMeshAgainstOther(PRIMARY.bufB, PRIMARY.bvhB, PRIMARY.bufA, PRIMARY.bvhA);
    let checked = 0, preOutward = 0, postInward = 0;
    for (const f of classifiedB.fragments) {
        if (!f.inside) continue; // B_in bucket, the one subtract flips
        checked++;
        const c = centroid(f.tri);
        const toB = [Bcenter[0]-c[0], Bcenter[1]-c[1], Bcenter[2]-c[2]];
        const nPre = outwardNormal(f.tri);
        if (nPre[0]*toB[0] + nPre[1]*toB[1] + nPre[2]*toB[2] < 0) preOutward++;
        const flipped = [f.tri[0], f.tri[2], f.tri[1]];
        const nPost = outwardNormal(flipped);
        if (nPost[0]*toB[0] + nPost[1]*toB[1] + nPost[2]*toB[2] > 0) postInward++;
    }
    ok("!! at least one B_in fragment exists on this fixture (a vacuous check would prove nothing)", checked > 0, "checked=" + checked);
    ok("!! every B_in fragment's PRE-flip normal points away from B's own center (B's own correct outward convention)",
        preOutward === checked, preOutward + "/" + checked);
    ok("!! every B_in fragment's POST-flip normal points toward B's own center (the correct A-B cavity outward normal)",
        postInward === checked, postInward + "/" + checked);
}

// =============================================================================================================
console.log("\n4. *** THE KEEP-RULE TABLE, EVERY (op, bucket) COMBINATION EXPLICITLY EXERCISED ***");
{
    const Ac = [0,0,0], Ah = [1,1,1], Bc = [1,0.3,0.2], Bh = [0.8,0.6,0.5];
    const Apolys = M.boxPolys(Ac, Ah), Bpolys = M.boxPolys(Bc, Bh);
    const { buf: bufA, bvh: bvhA } = buildBVH(Apolys), { buf: bufB, bvh: bvhB } = buildBVH(Bpolys);
    for (const op of ["union", "subtract", "intersect"]) {
        const oracle = M.volume(op === "union" ? M.union(Apolys, Bpolys) : op === "subtract" ? M.subtract(Apolys, Bpolys) : M.intersect(Apolys, Bpolys));
        const r = meshBoolean(bufA, bvhA, bufB, bvhB, op);
        const got = M.volume(wrapAsPolys(r.tris));
        ok("!! " + op + " matches meshCSG's BSP oracle to float64 noise", close(got, oracle, 1e-9),
            "oracle " + oracle + ", got " + got + ", diff " + Math.abs(got - oracle).toExponential(3));
    }
    // Partition identity: V(A-B) + V(A intersect B) == V(A), a self-consistency invariant independent of
    // either oracle's own volume() call, mirroring meshCSG-selfcheck.mjs's own use of the same identity.
    const rSub = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract");
    const rInt = meshBoolean(bufA, bvhA, bufB, bvhB, "intersect");
    const vSub = M.volume(wrapAsPolys(rSub.tris)), vInt = M.volume(wrapAsPolys(rInt.tris));
    const vA = M.volume(Apolys);
    ok("!! partition identity: V(A-B) + V(A intersect B) == V(A)", close(vSub + vInt, vA, 1e-9),
        "V(A-B)=" + vSub + " V(A^B)=" + vInt + " sum=" + (vSub+vInt) + " V(A)=" + vA);
}

// =============================================================================================================
console.log("\n5. *** AMBIGUOUS-FRAGMENT POLICY: KEEP-AND-FLAG, MEASURED AGAINST A DROP TOGGLE, NOT ASSUMED SAFER ***");
let FLUSH;
{
    // Two boxes glued face-to-face (A's +x face exactly coincides with B's -x face) -- meshBoolean.mjs's own
    // header names this the worst case for ambiguity: every triangle of the shared face is coplanar with a
    // candidate plane of the other mesh.
    const Apolys = M.boxPolys([-1,0,0],[1,1,1]), Bpolys = M.boxPolys([1,0,0],[1,1,1]);
    const { buf: bufA, bvh: bvhA } = buildBVH(Apolys), { buf: bufB, bvh: bvhB } = buildBVH(Bpolys);
    const oracle = M.volume(M.union(Apolys, Bpolys));
    ok("!! oracle sanity: two unit-half-extent boxes glued face-to-face union to volume 16", close(oracle, 16, 1e-9), "oracle=" + oracle);

    // ROUND 12: the default no longer produces an ambiguous fragment here -- the glued faces are ON each other and are
    // decided by orientation (section 17) -- so the policy is measured where it still applies: the round-11 pipeline,
    // contacts:false, which is also what a triangle falling back to the plane path gets.
    const classifiedA = classifyMeshAgainstOther(bufA, bvhA, bufB, bvhB, { contacts: false });
    const classifiedB = classifyMeshAgainstOther(bufB, bvhB, bufA, bvhA, { contacts: false });
    {
        const dA = classifyMeshAgainstOther(bufA, bvhA, bufB, bvhB), dB = classifyMeshAgainstOther(bufB, bvhB, bufA, bvhA);
        const amb = dA.fragments.filter((f) => f.ambiguous).length + dB.fragments.filter((f) => f.ambiguous).length;
        ok("!! ROUND 12: by default the same glued faces classify with NO ambiguous fragment -- every shared-face fragment is ON the other, opposite-facing",
            amb === 0 && dA.stats.onFaces > 0 && dB.stats.onFaces > 0 && [...dA.fragments, ...dB.fragments].every((f) => f.on !== 1),
            "ambiguous " + amb + ", on-faces A/B " + dA.stats.onFaces + "/" + dB.stats.onFaces);
    }
    ok("!! with contacts:false this fixture genuinely produces ambiguous fragments (a vacuous toggle test would prove nothing)",
        classifiedA.fragments.some(f => f.ambiguous) || classifiedB.fragments.some(f => f.ambiguous),
        "A ambiguous=" + classifiedA.fragments.filter(f=>f.ambiguous).length + " B ambiguous=" + classifiedB.fragments.filter(f=>f.ambiguous).length);

    const kept = assembleBoolean(classifiedA, classifiedB, "union");
    ok("!! ambiguousTriIndices is propagated (non-empty) on this fixture", kept.ambiguousTriIndices.length > 0,
        "count=" + kept.ambiguousTriIndices.length);
    // assembleBoolean() returns raw [p0,p1,p2] triangles (not the flat buffer meshBoolean() itself packs) --
    // wrap directly rather than through wrapAsPolys(), which expects that flat buffer shape.
    const keptVol = M.volume(kept.tris.map(t => ({ vs: t, pl: M.planeOf(t) })));
    ok("!! KEEPING ambiguous fragments (the shipped default) gives the exact oracle volume",
        close(keptVol, oracle, 1e-9), "got " + keptVol + ", diff " + Math.abs(keptVol - oracle).toExponential(3));

    // Gate-only toggle: what if ambiguous fragments were DROPPED instead? Never the shipped default -- see
    // meshBoolean.mjs's own header for why "keep" was chosen, measured here rather than merely asserted.
    function assembleDropAmbiguous(cA, cB, op) {
        const outTris = [];
        for (const f of cA.fragments) {
            if (f.ambiguous) continue;
            const keepA = (op === "union" && !f.inside) || (op === "subtract" && !f.inside) || (op === "intersect" && f.inside);
            if (keepA) outTris.push(f.tri);
        }
        for (const f of cB.fragments) {
            if (f.ambiguous) continue;
            if (op === "union" && !f.inside) outTris.push(f.tri);
            else if (op === "intersect" && f.inside) outTris.push(f.tri);
            else if (op === "subtract" && f.inside) outTris.push([f.tri[0], f.tri[2], f.tri[1]]);
        }
        return outTris;
    }
    const dropped = assembleDropAmbiguous(classifiedA, classifiedB, "union");
    const droppedVol = M.volume(dropped.map(t => ({ vs: t, pl: M.planeOf(t) })));
    ok("!! DROPPING ambiguous fragments (never shipped) measurably corrupts the volume -- demonstrating keep is the safer default, not merely asserted",
        Math.abs(droppedVol - oracle) > 1, "dropped-volume=" + droppedVol + " vs oracle=" + oracle +
        " (err=" + Math.abs(droppedVol - oracle).toFixed(3) + ", kept-err=" + Math.abs(keptVol - oracle).toExponential(3) + ")");
    FLUSH = { Apolys, Bpolys, bufA, bvhA, bufB, bvhB, oracle };
}

// =============================================================================================================
console.log("\n6. *** THE EMPTY-CANDIDATE SHORTCUT IS STRUCTURALLY EQUIVALENT TO NOT SKIPPING IT, CHECKED DIRECTLY ***");
{
    // meshBoolean.mjs's own header claims the shortcut is structurally guaranteed equivalent to calling
    // accumulateFragments() unconditionally (candidateTriBs=[] already falls through to one whole-triangle
    // fragment). Verify this directly rather than trusting the derivation: for every triangle of A with zero
    // pairOverlap candidates against B, classify via BOTH paths and require an identical inside/outside
    // result.
    const { bufA, bvhA, bufB, bvhB } = PRIMARY;
    const pairs = pairOverlap(bvhA, bvhB);
    const byTri = groupCandidatesByTriA(pairs);
    const triCount = bufA.length / 9;
    let emptyCount = 0, mismatches = 0;
    function centroid(tri) { return [(tri[0][0]+tri[1][0]+tri[2][0])/3, (tri[0][1]+tri[1][1]+tri[2][1])/3, (tri[0][2]+tri[1][2]+tri[2][2])/3]; }
    function readTri(tris, t) { const o = t*9; return [[tris[o],tris[o+1],tris[o+2]],[tris[o+3],tris[o+4],tris[o+5]],[tris[o+6],tris[o+7],tris[o+8]]]; }
    for (let t = 0; t < triCount; t++) {
        const cands = byTri.get(t);
        if (cands && cands.length > 0) continue;
        emptyCount++;
        const tri = readTri(bufA, t);
        const cShortcut = pointInMesh(bvhB, ...centroid(tri));
        const acc = accumulateFragments(bufA, t, bufB, cands); // undefined -> guarded to [] inside
        let allAgree = true;
        for (const frag of acc.fragments) {
            const cFull = pointInMesh(bvhB, ...centroid(frag.tri));
            if (cFull.inside !== cShortcut.inside) allAgree = false;
        }
        if (!allAgree) mismatches++;
    }
    ok("!! this fixture has at least one zero-candidate triangle (a vacuous check would prove nothing)", emptyCount > 0, "emptyCount=" + emptyCount);
    ok("!! the shortcut's classification matches the full accumulateFragments()-then-classify path for every zero-candidate triangle",
        mismatches === 0, mismatches + "/" + emptyCount + " mismatched");
}

// =============================================================================================================
console.log("\n7. *** FLUSH-FACE UNION: EXACT, AND SINCE ROUND 12 WATERTIGHT ***");
{
    const { bufA, bvhA, bufB, bvhB, oracle } = FLUSH;
    const r0 = meshBoolean(bufA, bvhA, bufB, bvhB, "union", { contacts: false });
    ok("!! round 11's path (contacts:false) matches the oracle exactly despite a high ambiguous-fragment count",
        close(M.volume(wrapAsPolys(r0.tris)), oracle, 1e-9), "got " + M.volume(wrapAsPolys(r0.tris)) + ", ambiguous=" + r0.ambiguousTriIndices.length + "/" + r0.triCount);
    const wt0 = M.watertight(wrapAsPolys(r0.tris));
    // ROUND 12: the glued faces are dropped from both sides by orientation, and the result is closed
    const r = meshBoolean(bufA, bvhA, bufB, bvhB, "union"), wt = M.watertight(wrapAsPolys(r.tris));
    ok("!! ROUND 12: by default the union is exact, has no ambiguous fragment, and is WATERTIGHT raw (round 11: 8 of 62 edges open)",
        close(M.volume(wrapAsPolys(r.tris)), oracle, 1e-9) && r.ambiguousTriIndices.length === 0 && wt.unmatched === 0 && wt0.unmatched === 8,
        "volume " + M.volume(wrapAsPolys(r.tris)) + ", ambiguous " + r.ambiguousTriIndices.length + ", unmatched " + wt.unmatched + "/" + wt.edges +
        " (contacts:false: " + wt0.unmatched + "/" + wt0.edges + ")");
}

// =============================================================================================================
console.log("\n8. *** REUSING meshCSG-selfcheck.mjs's OWN 8 DEGENERATE-CONTACT FIXTURES (SECTION 9 THERE) ***");
{
    const WC = [0, 0, 0], WH = [4, 3, 0.3];
    // The 4th field is `true` for a case expected to match exactly, or the MEASURED baseline relative error
    // (a fraction) for a known-gap case. An adversarial review of this round's own gate found the original
    // version shared one flat 2% bound across all 3 known-gap cases despite their measured baselines spanning
    // 0.35%-1.39% -- giving wildly uneven regression-detection headroom (1.4x on the worst case, 5.7x on the
    // best). Fixed by bounding each case at 2.5x its OWN measured baseline instead of one shared ceiling.
    const cases = [
        ["a corner exactly on an edge",       [4.5, 0, 0.8],  [0.5, 0.4, 0.5], true],
        ["an edge lying along an edge",       [4.5, 0, 0.8],  [0.5, 4.0, 0.5], true],
        ["a face flush against a face",       [0, 0, 0.8],    [1.0, 1.0, 0.5], 0.0139],
        ["...flush and hanging off the side", [4, 0, 0.8],    [1.0, 1.0, 0.5], 0.00694],
        ["a through-cut, BOTH faces flush",   [0, 0, 0],      [1.0, 1.0, 0.3], true],
        ["a cutter that swallows the wall",   [0, 0, 0],      [9.0, 9.0, 9.0], true],
        ["a cutter that IS the wall",         [0, 0, 0],      [4.0, 3.0, 0.3], true],
        ["a corner on a face interior",       [0, 0, 0.8],    [0.5, 0.5, 0.5], 0.00347],
    ];
    // ROUND 12: the three flush cases were KNOWN (their 4th field held round 6's measured relative error). The root
    // cause traced then -- a 5.55e-17 gap left the flush faces with NO candidate pair, so whole face-sized triangles
    // were classified by rays at a point on the other surface -- is what round 12 answers: a padded broad phase, the
    // pair resolved as coplanar (triContact.mjs), the overlap cut and decided by orientation. All eight are exact now,
    // for all three operations; contacts:false still reproduces round 11's numbers, as the control.
    const A = M.boxPolys(WC, WH), VA = M.volume(A);
    const { buf: bufA, bvh: bvhA } = buildBVH(A);
    let exactCount = 0, runs = 0, ambSeen = 0, fbSeen = 0, openSeen = 0;
    const control = [];
    for (const [name, c, h, mode] of cases) {
        const B = M.boxPolys(c, h), ov = overlapVol(WC, WH, c, h), VB = M.volume(B);
        const { buf: bufB, bvh: bvhB } = buildBVH(B);
        const want = { union: VA + VB - ov, subtract: VA - ov, intersect: ov };
        let worst = 0;
        for (const op of ["union", "subtract", "intersect"]) {
            const r = meshBoolean(bufA, bvhA, bufB, bvhB, op);
            worst = Math.max(worst, Math.abs(M.volume(wrapAsPolys(r.tris)) - want[op]));
            ambSeen += r.ambiguousTriIndices.length; fbSeen += r.stats.a.fallbackTris + r.stats.b.fallbackTris;
            if (op === "subtract") openSeen += M.watertight(wrapAsPolys(r.tris)).unmatched;
            runs++;
        }
        ok("!! " + name + (mode === true ? "" : " (round 11: KNOWN, " + (mode * 100).toFixed(2) + "% off)") + ": union, subtract and intersect exact",
            worst < 1e-9, "worst |err| " + worst.toExponential(3));
        if (worst < 1e-9) exactCount++;
        if (mode !== true) {
            const r0 = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { contacts: false });
            const rel0 = Math.abs(M.volume(wrapAsPolys(r0.tris)) - want.subtract) / want.subtract;
            control.push([name, rel0, mode, r0.stats.a.emptyCandidateShortcuts === r0.stats.a.triCount && r0.stats.b.emptyCandidateShortcuts === r0.stats.b.triCount]);
        }
    }
    ok("!! all 8 degenerate-contact fixtures exact for all 3 operations, with no ambiguous fragment, no fallback, and every subtract WATERTIGHT raw",
        exactCount === 8 && ambSeen === 0 && fbSeen === 0 && openSeen === 0,
        exactCount + "/8 exact over " + runs + " runs, ambiguous " + ambSeen + ", fallback triangles " + fbSeen + ", unmatched (subtract) " + openSeen);
    ok("   control: contacts:false (round 11's pipeline) reproduces each former KNOWN error to 1e-4 of its own baseline, every triangle taking the empty-candidate shortcut",
        control.every(([, rel0, base, shortcut]) => Math.abs(rel0 - base) < 1e-4 && shortcut),
        control.map(([n, r0, b, sc]) => n + " " + (r0 * 100).toFixed(2) + "% (baseline " + (b * 100).toFixed(2) + "%, all-shortcut " + sc + ")").join("; "));
    // An adversarial review of this round's own gate found stats.capped propagation (classifyMeshAgainstOther's
    // `if (acc.capped) capped = true`) was exercised ONLY on the always-false path (sections 2 and 9), never on
    // genuinely true input -- a regression that broke the accumulation (e.g. `capped = acc.capped`, losing an
    // earlier triangle's true value, instead of OR-accumulating) would pass silently. Force it true directly
    // via a deliberately tiny maxFragments on the primary fixture and confirm meshBoolean() surfaces it.
    {
        const { bufA, bvhA, bufB, bvhB } = PRIMARY;
        // Round 9: the fragment cap is the PLANE path's (the arrangement has none -- see triArrangement.mjs), so
        // these three checks now ask for that path by name.
        const rCapped = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { cutting: "plane", accOpts: { maxFragments: 3 } });
        ok("!! stats.capped correctly reports true when accOpts.maxFragments is forced tiny (exercises the true/nonzero propagation path, not just false)",
            rCapped.stats.a.capped === true || rCapped.stats.b.capped === true,
            "statsA.capped=" + rCapped.stats.a.capped + " statsB.capped=" + rCapped.stats.b.capped);
        // Round 7: a capped result is WRONG, not approximate (meshBooleanBlast-selfcheck.mjs section 1 measures
        // 0.74% on meshCSG's own blast fixture), so meshBoolean() now surfaces it at the TOP LEVEL rather than
        // leaving it in stats.a/stats.b where round 6 left it. Both directions checked: true when forced, false
        // on the same fixture at the default cap.
        const rDefault = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { cutting: "plane" });
        ok("!! round 7: the top-level `capped` is true when either side capped, and false at the default cap",
            rCapped.capped === true && rDefault.capped === false &&
            rCapped.capped === (rCapped.stats.a.capped || rCapped.stats.b.capped),
            "forced-tiny capped=" + rCapped.capped + ", default capped=" + rDefault.capped +
            " (default cap MESH_BOOLEAN_MAX_FRAGMENTS=" + MESH_BOOLEAN_MAX_FRAGMENTS + ")");
        // ...and when ONLY side B caps. The first draft of this check used only the forced-tiny fixture above,
        // where side A caps, so a sabotage reporting `capped = stats.a.capped` alone went 0 red. Here the blob
        // is A (few candidates per triangle, never caps) and meshCSG's wall is B (its big face triangles cap at
        // 256 on round 6's ungated path): stats.a false, stats.b true, and the top level must still say true.
        const blobBuf = M.toTriangleBuffer(M.jaggedBlob([0, 0, 0], 1.0, 8, 12345));
        const wallBuf = M.toTriangleBuffer(M.boxPolys([0, 0, 0], [4, 3, 0.3]));
        const rB = meshBoolean(blobBuf, new MeshBVH(blobBuf), wallBuf, new MeshBVH(wallBuf), "union",
            { cutting: "plane", accOpts: { gateByIntersection: false, maxFragments: 256 } });
        ok("!! round 7: the top-level `capped` is true when ONLY side B capped",
            rB.stats.a.capped === false && rB.stats.b.capped === true && rB.capped === true,
            "stats.a.capped=" + rB.stats.a.capped + " stats.b.capped=" + rB.stats.b.capped + " capped=" + rB.capped);
    }
}

// =============================================================================================================
console.log("\n9. *** RANDOMIZED SWEEP: GENERAL-POSITION BOX-MINUS-BOX AGAINST THE meshCSG ORACLE ***");
{
    const rnd = lcg(777);
    let worst = 0, n = 30, cappedAny = false;
    for (let i = 0; i < n; i++) {
        const Ac = [0,0,0], Ah = [1,1,1];
        const Bc = [(rnd()-0.5)*3, (rnd()-0.5)*3, (rnd()-0.5)*3];
        const Bh = [0.3+rnd()*1.2, 0.3+rnd()*1.2, 0.3+rnd()*1.2];
        const Apolys = M.boxPolys(Ac, Ah), Bpolys = M.boxPolys(Bc, Bh);
        const { buf: bufA, bvh: bvhA } = buildBVH(Apolys), { buf: bufB, bvh: bvhB } = buildBVH(Bpolys);
        const oracle = M.volume(M.subtract(Apolys, Bpolys));
        const r = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract");
        const got = M.volume(wrapAsPolys(r.tris));
        const diff = Math.abs(got - oracle);
        if (diff > worst) worst = diff;
        if (r.stats.a.capped || r.stats.b.capped) cappedAny = true;
    }
    ok("!! " + n + " random general-position box-minus-box cases all match the meshCSG oracle to float64 noise",
        worst < 1e-6, "worst diff " + worst.toExponential(3));
    ok("!! none of the " + n + " random cases hit the maxFragments cap", !cappedAny, "cappedAny=" + cappedAny);
}

// =============================================================================================================
console.log("\n10. *** DISJOINT BOXES: THE 'NOTHING TO CUT' EDGE CASE ***");
{
    const Apolys = M.boxPolys([0,0,0],[1,1,1]), Bpolys = M.boxPolys([10,10,10],[1,1,1]);
    const { buf: bufA, bvh: bvhA } = buildBVH(Apolys), { buf: bufB, bvh: bvhB } = buildBVH(Bpolys);
    const r = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract");
    const got = M.volume(wrapAsPolys(r.tris));
    ok("!! disjoint A-B subtract volume equals V(A) unchanged", close(got, M.volume(Apolys), 1e-9), "got " + got);
    ok("!! every triangle of A took the empty-candidate shortcut (no B candidates at all)",
        r.stats.a.emptyCandidateShortcuts === 12 && r.stats.a.accumulatedFragments === 0,
        "emptyCandidateShortcuts=" + r.stats.a.emptyCandidateShortcuts + " accumulatedFragments=" + r.stats.a.accumulatedFragments);
}

// =============================================================================================================
console.log("\n11. *** THE A-VS-B SEAM: COINCIDENT UNDER THE ARRANGEMENT (ROUND 9), A MEASURED BASELINE UNDER THE PLANE PATH ***");
{
    // meshBoolean.mjs's own header names this: A's and B's independently-clipped cut-boundary vertices do
    // NOT land on top of each other, even on a clean fixture. Measured directly here (not merely asserted)
    // and gated as a NON-REGRESSION baseline -- an increase far beyond the measured baseline would signal a
    // real regression; the baseline itself is not claimed to be good.
    // ROUND 9: the default path now builds each seam vertex ONCE -- triTriIntersect(a, b) and triTriIntersect(b, a)
    // compute the same point by the same formula, and both meshes' arrangements keep that point as given -- so
    // the seam coincides and the raw output is watertight. Both paths are measured below, each by name.
    const { Apolys, Bpolys, bufA, bvhA, bufB, bvhB } = PRIMARY;
    function seam(cutting) {
    const classifiedA = classifyMeshAgainstOther(bufA, bvhA, bufB, bvhB, { cutting });
    const classifiedB = classifyMeshAgainstOther(bufB, bvhB, bufA, bvhA, { cutting });
    function origCorners(polys) {
        const s = new Set();
        for (const p of polys) for (const v of p.vs) s.add(v.map(x => x.toFixed(6)).join(","));
        return s;
    }
    const aCorners = origCorners(Apolys);
    const aCutVerts = [];
    for (const f of classifiedA.fragments) if (!f.inside) for (const v of f.tri) {
        const k = v.map(x => x.toFixed(6)).join(",");
        if (!aCorners.has(k)) aCutVerts.push(v);
    }
    const bCorners = origCorners(Bpolys);
    const bCutVerts = [];
    for (const f of classifiedB.fragments) if (f.inside) for (const v of f.tri) {
        const k = v.map(x => x.toFixed(6)).join(",");
        if (!bCorners.has(k)) bCutVerts.push(v);
    }
    let matched = 0;
    for (const av of aCutVerts) {
        let best = Infinity;
        for (const bv of bCutVerts) { const d = Math.hypot(av[0]-bv[0], av[1]-bv[1], av[2]-bv[2]); if (d < best) best = d; }
        if (best < 1e-6) matched++;
    }
    let exact = 0;
    for (const av of aCutVerts) if (bCutVerts.some((bv) => bv[0] === av[0] && bv[1] === av[1] && bv[2] === av[2])) exact++;
    const matchRate = aCutVerts.length ? matched / aCutVerts.length : 1;
    console.log("  ..... " + cutting + ": A cut verts=" + aCutVerts.length + " B cut verts=" + bCutVerts.length +
        " matched-within-1e-6=" + matched + " (" + (matchRate*100).toFixed(1) + "%), bit-identical=" + exact);
    return { aCut: aCutVerts.length, matched, exact };
    }
    const sa = seam("arrangement"), sp = seam("plane");
    const ra = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract");
    const wta = M.watertight(wrapAsPolys(ra.tris));
    ok("!! *** ROUND 9: every A-side seam vertex is BIT-IDENTICAL to a B-side one, and the raw output is watertight ***",
        sa.aCut > 10 && sa.exact === sa.aCut && wta.ok && ra.stats.a.fallbackTris + ra.stats.b.fallbackTris === 0,
        sa.exact + "/" + sa.aCut + " bit-identical; unmatched " + wta.unmatched + "/" + wta.edges +
        " (the plane path: " + sp.matched + "/" + sp.aCut + " within 1e-6)");
    const r = meshBoolean(PRIMARY.bufA, PRIMARY.bvhA, PRIMARY.bufB, PRIMARY.bvhB, "subtract", { cutting: "plane" });
    const wt = M.watertight(wrapAsPolys(r.tris));
    // ROUND 7 RE-BASELINE, NOT A LOOSENING: meshBoolean() now gates accumulation by actual intersection by
    // default (see triFragmentAccumulate.mjs's own ROUND 7 paragraph). The same fixture measured 37/189
    // unmatched with 104 A-side cut vertices (17.3% coinciding with a B-side one) under round 6's ungated path;
    // gated it measured 32/120 with 36 A-side cut vertices (47.2%), and 29/117 with 33 (48.5%) once round 7's
    // review added the per-plane group pre-filter (a group missing the whole triangle no longer splits it). The
    // ceiling is TIGHTENED from 45 to 35 for the default path, and round 6's ungated number is kept as its own
    // reproduction so the comparison stays in the gate rather than only in this comment. (An adversarial review
    // noted the gated unmatched RATIO is worse -- 29/117 is 25% against 37/189's 20% -- the count and the mesh
    // are smaller, the fraction of seam edges is not; stated here rather than letting "improved" stand alone.)
    ok("!! watertight() unmatched-edge count on the primary fixture stays within the measured baseline (non-regression, not zero-crack)",
        wt.unmatched <= 35, "unmatched=" + wt.unmatched + "/" + wt.edges + " (gated default, measured 29/117 at round 7)");
    const r6 = meshBoolean(PRIMARY.bufA, PRIMARY.bvhA, PRIMARY.bufB, PRIMARY.bvhB, "subtract",
        { cutting: "plane", accOpts: { gateByIntersection: false } });
    const wt6 = M.watertight(wrapAsPolys(r6.tris));
    ok("   ...and round 6's ungated path, kept reachable by option, still measures its own round-6 baseline",
        wt6.unmatched <= 45 && wt6.edges > wt.edges && r6.triCount > r.triCount,
        "ungated unmatched=" + wt6.unmatched + "/" + wt6.edges + " tris=" + r6.triCount + " vs gated tris=" + r.triCount +
        " (round 6 measured 37/189)");
}

// =============================================================================================================
console.log("\n12. *** AN UNRECOGNIZED op THROWS RATHER THAN SILENTLY RETURNING AN EMPTY MESH ***");
{
    // An adversarial review of this round's own diff found keepA()/bKeepAndFlip() originally had no default
    // branch: any op outside {union, subtract, intersect} (a typo, wrong case, an alias like "difference")
    // silently kept nothing, returning a 0-triangle mesh with no error and no signal in the return shape --
    // measurably worse than a wrong-but-nonempty result, since an empty mesh reads as "nothing to do" rather
    // than "the op string was wrong". Fixed with a validation guard; gated here so a regression is caught.
    const Apolys = M.boxPolys([0,0,0],[1,1,1]), Bpolys = M.boxPolys([1,0.3,0.2],[0.8,0.6,0.5]);
    const { buf: bufA, bvh: bvhA } = buildBVH(Apolys), { buf: bufB, bvh: bvhB } = buildBVH(Bpolys);
    for (const badOp of ["Subtract", "difference", "xor", undefined, ""]) {
        let threw = false, msg = "";
        try { meshBoolean(bufA, bvhA, bufB, bvhB, badOp); } catch (e) { threw = true; msg = e.message; }
        ok("!! op=" + JSON.stringify(badOp) + " throws instead of silently returning an empty mesh", threw, msg);
    }
    // The three RECOGNIZED ops must still work after adding the guard (a regression here would mean the
    // validation itself is broken, not merely too strict).
    for (const goodOp of ["union", "subtract", "intersect"]) {
        let threw = false;
        try { meshBoolean(bufA, bvhA, bufB, bvhB, goodOp); } catch (e) { threw = true; }
        ok("!! op=" + JSON.stringify(goodOp) + " does NOT throw", !threw);
    }
}

// =============================================================================================================
console.log("\n13. *** A DEGENERATE (ZERO-VOLUME) OPERAND -- FOUND AT ROUND 6, FIXED AT ROUND 12 ***");
{
    // An adversarial review of this round's own diff found this by direct numerical probing, not by reading
    // the code: a zero-volume operand (a box with one half-extent forced to 0, a flat rectangle) embedded
    // strictly inside a normal box's interior produces a wrong-SIGN, non-noise volume error -- a new
    // manifestation of the SAME root cause as section 8's touching-contact gap (an isolated, non-cancelling
    // ambiguous fragment), not previously covered by any fixture in this gate. See meshBoolean.mjs's own
    // header for the root-cause investigation. Reproduced here with the review's own exact numbers,
    // independently re-confirmed before being written into this permanent gate.
    const Apolys = M.boxPolys([0,0,0],[0,1,1]);   // zero-volume flat rectangle (X half-extent forced to 0)
    const Bpolys = M.boxPolys([0,0,0],[1,1,1]);   // normal box; A sits strictly inside B's interior
    ok("!! sanity: A is genuinely zero-volume", close(M.volume(Apolys), 0, 1e-12), "V(A)=" + M.volume(Apolys));
    const { buf: bufA, bvh: bvhA } = buildBVH(Apolys), { buf: bufB, bvh: bvhB } = buildBVH(Bpolys);
    const expected = { union: 8, subtract: 0, intersect: 0 };
    const measuredBaseline = { union: 7.833333333333333, subtract: -0.16666666666666666, intersect: 0.16666666666666666 };
    // ROUND 12: FIXED. An operand whose mean thickness (2 x volume / area) is under CONTACT_EPS encloses nothing, and
    // the regularised answer needs no classification: union is the other operand, subtract A - (empty) is A, anything
    // minus or intersected with it is empty. contacts:false keeps round 11's numbers, as the control.
    for (const op of ["union", "subtract", "intersect"]) {
        const r = meshBoolean(bufA, bvhA, bufB, bvhB, op), got = M.volume(wrapAsPolys(r.tris));
        const r0 = meshBoolean(bufA, bvhA, bufB, bvhB, op, { contacts: false }), got0 = M.volume(wrapAsPolys(r0.tris));
        ok("!! ROUND 12: degenerate-operand " + op + " is exact (" + expected[op] + "), the operand recognised as empty",
            close(got, expected[op], 1e-12) && r.emptyOperand === "a" && M.watertight(wrapAsPolys(r.tris)).unmatched === 0,
            "got " + got + ", emptyOperand " + r.emptyOperand + " -- control contacts:false: " + got0 + " (round 11 baseline " + measuredBaseline[op] + ")");
        ok("   control: contacts:false still gives round 11's number", close(got0, measuredBaseline[op], 1e-9), "got " + got0);
    }
    // the empty-operand path returns before assembleBoolean(), so it carries section 12's guard itself
    let threwEmpty = 0;
    for (const bad of ["Subtract", "difference", undefined]) { try { meshBoolean(bufA, bvhA, bufB, bvhB, bad); } catch { threwEmpty++; } }
    ok("   ...and an unrecognized op still throws when an operand is empty (that path skips assembleBoolean)", threwEmpty === 3, threwEmpty + " of 3 threw");
}

// =============================================================================================================
console.log("\n14. *** ROUND 7 REVIEW FIXES: THE PLANE-DEDUP ROOF, AND accOpts THAT ARE PRESENT BUT UNDEFINED ***");
{
    // An adversarial review of round 7 found round 5's plane dedup merging B-triangles whose normals differ by
    // up to 4.47e-5 rad (cos > 1-1e-9) whenever their fold line ran near the origin, then clipping the whole
    // group by ONE representative plane. B here is a closed roof prism, ridge on y=0 through the origin, roof
    // z = z0 - s|y| over |y| <= 100; A is a 2 x 120 x 1 box whose top face cuts the roof. Exact A - B volume
    // is 2*(60 + s*3600) by hand (the roof's wedge over |y|<=60, x in [-1,1]). Measured BEFORE the fix, on
    // gated, ungated and round-6 paths alike: s=2e-5 -> -0.048, 1e-5 -> -0.024, 1e-6 -> -0.0024. meshCSG's
    // BSP was exact. Checked on BOTH centrings the review used (ridge through the origin, and 5 units above).
    const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];
    function roofPrism(s, z0) {
        const W = 100, X = 10, Z = z0 - 1;
        const pts = (x) => [[x, -W, Z], [x, W, Z], [x, W, z0 - s * W], [x, 0, z0], [x, -W, z0 - s * W]];
        const L = pts(-X), R = pts(X), T = [];
        for (let i = 1; i < 4; i++) { T.push([R[0], R[i], R[i + 1]]); T.push([L[0], L[i + 1], L[i]]); }
        for (let k = 0; k < 5; k++) { const k1 = (k + 1) % 5; T.push(...quad(L[k], L[k1], R[k1], R[k])); }
        const buf = new Float64Array(T.length * 9);
        T.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) buf[i * 9 + v * 3 + c] = t[v][c]; });
        return buf;
    }
    let worst = 0, worstUngated = 0, worstArr = 0, detail = [];
    for (const z0 of [0, 5]) for (const s of [2e-5, 1e-5, 1e-6]) {
        const bufB = roofPrism(s, z0);
        const bufA = M.toTriangleBuffer(M.boxPolys([0, 0, z0], [1, 60, 0.5]));
        const bA = new MeshBVH(bufA), bB = new MeshBVH(bufB);
        const exact = 2 * (60 + s * 3600);
        const g = M.volume(wrapAsPolys(meshBoolean(bufA, bA, bufB, bB, "subtract", { cutting: "plane" }).tris)) - exact;
        const u = M.volume(wrapAsPolys(meshBoolean(bufA, bA, bufB, bB, "subtract",
            { cutting: "plane", accOpts: { gateByIntersection: false, maxFragments: 256 } }).tris)) - exact;
        const ar = M.volume(wrapAsPolys(meshBoolean(bufA, bA, bufB, bB, "subtract").tris)) - exact;
        worst = Math.max(worst, Math.abs(g)); worstUngated = Math.max(worstUngated, Math.abs(u));
        worstArr = Math.max(worstArr, Math.abs(ar));
        detail.push("z0=" + z0 + ",s=" + s + ":" + g.toExponential(1));
    }
    ok("!! shallow roof ridge (dihedral 4e-6..4e-5 rad) subtracted from a box: exact on every slope and centring",
        worst < 1e-9 && worstUngated < 1e-9 && worstArr < 1e-9,
        "worst |err| arrangement " + worstArr.toExponential(2) + ", plane gated " + worst.toExponential(2) +
        ", round-6 path " + worstUngated.toExponential(2) +
        " (before the fix: 0.048 / 0.024 / 0.0024 on both) -- " + detail.join(" "));

    // {maxFragments: undefined} used to spread over the default and fall through to triFragmentAccumulate's own
    // 256; {gateByIntersection: undefined} used to turn the gate off. Both must now leave the defaults alone.
    const { bufA, bvhA, bufB, bvhB } = PRIMARY;
    const d0 = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { cutting: "plane" });
    const dU = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { cutting: "plane", accOpts: { gateByIntersection: undefined, maxFragments: null } });
    ok("!! accOpts keys that are present but undefined/null do NOT override meshBoolean's defaults",
        dU.triCount === d0.triCount && dU.stats.a.gateTested === d0.stats.a.gateTested && dU.stats.a.gateTested > 0,
        "default tris=" + d0.triCount + " gateTested=" + d0.stats.a.gateTested + "; with undefined/null keys tris=" +
        dU.triCount + " gateTested=" + dU.stats.a.gateTested);
}

// =============================================================================================================
console.log("\n15. *** ROUND 9: SEGMENT-BOUNDED CUTTING (triArrangement.mjs) AGAINST THE PLANE PATH, THE BSP, AND BY HAND ***");
{
    // Volumes here are taken about a LOCAL origin (the fixture's own centre). About (0,0,0), a needle cut 1000
    // units out reads 4.3e-8 wrong on the arrangement and 7.9e-8 on the plane path -- rounding in the volume
    // integral, not in either mesh: about its own centre the same outputs read 6.2e-15 and 3.9e-14.
    const volAbout = (buf, o) => {
        let v = 0;
        for (let i = 0; i < buf.length; i += 9) {
            const a = [buf[i] - o[0], buf[i + 1] - o[1], buf[i + 2] - o[2]], b = [buf[i + 3] - o[0], buf[i + 4] - o[1], buf[i + 5] - o[2]];
            const c = [buf[i + 6] - o[0], buf[i + 7] - o[1], buf[i + 8] - o[2]];
            v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
        }
        return v / 6;
    };
    const fb = (r) => r.stats.a.fallbackTris + r.stats.b.fallbackTris;
    const rot = (P, ax, ay, az, c) => {
        const [cx, sx, cy, sy, cz, sz] = [Math.cos(ax), Math.sin(ax), Math.cos(ay), Math.sin(ay), Math.cos(az), Math.sin(az)];
        return P.map((p) => {
            const vs = p.vs.map((v) => {
                let [x, y, z] = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
                [y, z] = [y * cx - z * sx, y * sx + z * cx]; [x, z] = [x * cy + z * sy, -x * sy + z * cy]; [x, y] = [x * cz - y * sz, x * sz + y * cz];
                return [x + c[0], y + c[1], z + c[2]];
            });
            return { vs, pl: M.planeOf(vs) };
        });
    };

    // (a) general position: 16 randomly rotated boxes in a unit cube, 3 jagged blob pairs; all three ops. Boxes are
    // held to the plane path and the BSP. Blobs are held to their OWN run at 1000x scale, where every absolute
    // tolerance is a million times smaller relatively (meshBooleanBlast-selfcheck.mjs section 3's reference), and
    // that reference is licensed by the plane path agreeing with it there: on blob pair 1 BOTH paths at 1x sit
    // ~1e-12 from it, on opposite sides (arrangement -1.0e-12, plane +8.2e-13), and the BSP 2.5e-7 -- absolute
    // tolerances all three share at 1x (round 11's subject), so comparing the paths to each other at 1e-12 was
    // the wrong test. Measured before this section was written.
    const scaleP = (P, k) => P.map((p) => { const vs = p.vs.map((v) => [v[0] * k, v[1] * k, v[2] * k]); return { vs, pl: M.planeOf(vs) }; });
    const cases = [];
    const r = lcg(42);
    for (let i = 0; i < 16; i++) {
        const c = [r() - 0.5, r() - 0.5, r() - 0.5];
        cases.push(["rot" + i, M.boxPolys([0, 0, 0], [1, 1, 1]), rot(M.boxPolys(c, [0.3 + r() * 0.7, 0.3 + r() * 0.7, 0.3 + r() * 0.7]), r() * 6, r() * 6, r() * 6, c)]);
    }
    for (let k = 0; k < 3; k++) cases.push(["blob" + k, M.jaggedBlob([0, 0, 0], 1, 8, 100 + k), M.jaggedBlob([0.5 * k - 0.5, 0.2, 0.1], 0.9, 8, 500 + k)]);
    let worstPlane = 0, worstBsp = 0, worstRef = 0, worstRefAgree = 0, refK = 0, open = 0, falls = 0, runs = 0;
    let clsArr = 0, clsPlane = 0, trisArr = 0, trisPlane = 0;
    for (const [name, PA, PB] of cases) {
        const bufA = M.toTriangleBuffer(PA), bufB = M.toTriangleBuffer(PB), bA = new MeshBVH(bufA), bB = new MeshBVH(bufB);
        const blob = name.startsWith("blob");
        let bufA3, bufB3, bA3, bB3;
        if (blob) {
            bufA3 = M.toTriangleBuffer(scaleP(PA, 1000)); bufB3 = M.toTriangleBuffer(scaleP(PB, 1000));
            bA3 = new MeshBVH(bufA3); bB3 = new MeshBVH(bufB3);
        }
        for (const op of ["union", "subtract", "intersect"]) {
            const ra = meshBoolean(bufA, bA, bufB, bB, op), rp = meshBoolean(bufA, bA, bufB, bB, op, { cutting: "plane" });
            const va = volAbout(ra.tris, [0, 0, 0]), vp = volAbout(rp.tris, [0, 0, 0]);
            if (blob) {
                // normalize:false -- round 11 made meshBoolean() scale-invariant, and a 1000x run is a reference only
                // with its absolute tolerances left a million times smaller (meshBooleanBlast-selfcheck section 3)
                const r3 = meshBoolean(bufA3, bA3, bufB3, bB3, op, { normalize: false });
                const r3P = meshBoolean(bufA3, bA3, bufB3, bB3, op, { cutting: "plane", normalize: false });
                const ref = volAbout(r3.tris, [0, 0, 0]) / 1e9, refP = volAbout(r3P.tris, [0, 0, 0]) / 1e9;
                refK = Math.max(refK, Math.abs(r3.scaleExponent), Math.abs(r3P.scaleExponent));
                worstRef = Math.max(worstRef, Math.abs(va - ref));
                worstRefAgree = Math.max(worstRefAgree, Math.abs(ref - refP));
            } else {
                worstPlane = Math.max(worstPlane, Math.abs(va - vp));
                worstBsp = Math.max(worstBsp, Math.abs(va - M.volume(M[op](PA, PB))));
            }
            open += M.watertight(wrapAsPolys(ra.tris)).unmatched; falls += fb(ra); runs++;
            clsArr += ra.stats.a.classifications + ra.stats.b.classifications;
            clsPlane += rp.stats.a.classifications + rp.stats.b.classifications;
            trisArr += ra.triCount; trisPlane += rp.triCount;
        }
    }
    ok("!! 48 rotated-box runs (16 boxes x 3 ops): the arrangement matches the plane path to 1e-13 and meshCSG's BSP to 1e-12",
        worstPlane < 1e-13 && worstBsp < 1e-12, "worst |diff| plane " + worstPlane.toExponential(2) + ", BSP " + worstBsp.toExponential(2));
    ok("!! 9 blob-pair runs: at 1000x the arrangement and the plane path agree to 1e-13 -- that value is the reference",
        worstRefAgree < 1e-13 && refK === 0, "worst |diff| at 1000x " + worstRefAgree.toExponential(2) +
        ", reference scale exponent " + refK + " (0: really run at 1000x; round 11's step would make it 8)");
    ok("!! ...and the arrangement at 1x is within 3e-12 of it (both paths share ~1e-12 of absolute-tolerance error at 1x)",
        worstRef < 3e-12, "worst |diff| " + worstRef.toExponential(2) + " (measured 1.0e-12, blob pair 1)");
    ok("!! all " + runs + " runs: no fallback to the plane path, and every raw output WATERTIGHT (zero unmatched edges, no weld)",
        falls === 0 && open === 0, "fallback triangles " + falls + ", unmatched edges summed over all runs " + open);
    ok("   ...classifying well under half as often, and emitting fewer triangles, than the plane path",
        clsArr * 2 < clsPlane && trisArr < trisPlane,
        "pointInMesh calls " + clsArr + " vs " + clsPlane + "; triangles " + trisArr + " vs " + trisPlane);

    // (b) a needle 2e-3 across through the unit cube, upright and tilted 0.3 rad, at the origin and 1000 units
    // out. Exact by hand (Cavalieri): 8 - (2w)^2 * 2 / cos(theta).
    let worstNeedle = 0, needleOpen = 0, needleFb = 0;
    for (const C of [[0, 0, 0], [1000, -2000, 500]]) for (const th of [0, 0.3]) {
        const w = 1e-3;
        const needle = rot(M.boxPolys([C[0] + 0.2, C[1] + 0.1, C[2]], [w, w, 3]), th, 0, 0, C);
        const bufA = M.toTriangleBuffer(M.boxPolys(C, [1, 1, 1])), bufB = M.toTriangleBuffer(needle);
        const rn = meshBoolean(bufA, new MeshBVH(bufA), bufB, new MeshBVH(bufB), "subtract");
        worstNeedle = Math.max(worstNeedle, Math.abs(volAbout(rn.tris, C) - (8 - (2 * w) * (2 * w) * 2 / Math.cos(th))));
        needleOpen += M.watertight(wrapAsPolys(rn.tris)).unmatched; needleFb += fb(rn);
    }
    ok("!! a 2e-3 needle through the cube, upright and tilted, at the origin and 1000 units out: exact by hand to 1e-13",
        worstNeedle < 1e-13 && needleOpen === 0 && needleFb === 0,
        "worst |err| " + worstNeedle.toExponential(2) + " (measured 6.2e-15), unmatched " + needleOpen + ", fallbacks " + needleFb);

    // (c) a rod whose end is FLUSH with the cube's top face. Round 11: its flush triangles were coplanar with the
    // cube's, the arrangement refused them, and the plane path left the result open (28 unmatched), its z=1 cap
    // missing, its volume depending on where it was measured from (7.9467 about the origin). ROUND 12: FIXED -- the
    // pairs resolve as contacts, the cap is the cube's own face cut along the rod's rim, and it is decided ON.
    {
        const bufA = M.toTriangleBuffer(M.boxPolys([0, 0, 0], [1, 1, 1])), bufB = M.toTriangleBuffer(M.boxPolys([0.2, 0.1, 0.5], [0.1, 0.1, 0.5]));
        const bA = new MeshBVH(bufA), bB = new MeshBVH(bufB);
        const ra = meshBoolean(bufA, bA, bufB, bB, "subtract"), wa = M.watertight(wrapAsPolys(ra.tris));
        const r0 = meshBoolean(bufA, bA, bufB, bB, "subtract", { contacts: false }), w0 = M.watertight(wrapAsPolys(r0.tris));
        const vO = volAbout(ra.tris, [0, 0, 0]), vC = volAbout(ra.tris, [0.2, 0.1, 1]);
        ok("!! ROUND 12: the flush rod is exact about the origin AND about the cap (7.96), watertight raw, with no fallback",
            Math.abs(vO - 7.96) < 1e-12 && Math.abs(vC - 7.96) < 1e-12 && wa.unmatched === 0 && fb(ra) === 0,
            "about origin " + vO.toFixed(15) + ", about cap " + vC.toFixed(15) + ", unmatched " + wa.unmatched + "/" + wa.edges + ", fallbacks " + fb(ra) +
            " -- contacts:false: " + volAbout(r0.tris, [0, 0, 0]).toFixed(6) + ", " + w0.unmatched + " unmatched, " + fb(r0) + " fallbacks");
        ok("   control: contacts:false is round 11's result (28 unmatched, fallbacks)", w0.unmatched === 28 && fb(r0) > 0, w0.unmatched + " unmatched");
    }

    // (d) a cutting mode that is not one of the two throws, as an unknown op does (section 12).
    let threw = false;
    try { meshBoolean(PRIMARY.bufA, PRIMARY.bvhA, PRIMARY.bufB, PRIMARY.bvhB, "subtract", { cutting: "segments" }); } catch { threw = true; }
    ok("   an unrecognized `cutting` throws rather than silently choosing a path", threw);
}

// =============================================================================================================
console.log("\n16. *** ROUND 11: SCALE -- EVERY TOLERANCE IS A LENGTH, SO THE OPERANDS ARE BROUGHT TO THE TOLERANCES ***");
{
    // meshBoolean() divides both operands by the power of two that puts their joint extent in [1, 16)
    // (MESH_BOOLEAN_SCALE_BAND), runs, and multiplies back -- exact both ways. Before round 11, measured over 28
    // runs per scale: 1e-6 and 1e-5 up to 115% of volume wrong with 303 fallbacks and 3,365 open edges, 1e-4 19%
    // wrong, 1e6 271 open edges; after, every scale 1e-6..1e6 matched its own scale-1 result to 5.9e-15, no fallback,
    // no open edge. Every fixture in sections 1-15 lies in the band, so its exponent is 0 and nothing there changed
    // (their full output compared line for line against round 10b's: identical).
    const volAt = (buf, o = [0, 0, 0]) => {
        let v = 0;
        for (let i = 0; i < buf.length; i += 9) {
            const a = [buf[i] - o[0], buf[i + 1] - o[1], buf[i + 2] - o[2]], b = [buf[i + 3] - o[0], buf[i + 4] - o[1], buf[i + 5] - o[2]];
            const c = [buf[i + 6] - o[0], buf[i + 7] - o[1], buf[i + 8] - o[2]];
            v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
        }
        return v / 6;
    };
    const tf = (P, k, o = [0, 0, 0]) => P.map((p) => { const vs = p.vs.map((v) => [v[0] * k + o[0], v[1] * k + o[1], v[2] * k + o[2]]); return { vs, pl: M.planeOf(vs) }; });
    const run = (PA, PB, op, opts) => { const A = M.toTriangleBuffer(PA), B = M.toTriangleBuffer(PB); return meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), op, opts); };
    const blobA = M.jaggedBlob([0, 0, 0], 1, 8, 101), blobB = M.jaggedBlob([0, 0.2, 0.1], 0.9, 8, 501);
    const boxA = M.boxPolys([0, 0, 0], [1, 1, 1]), boxB = M.boxPolys([0.3, -0.2, 0.1], [0.6, 0.7, 0.5]).map((p) => {
        const c = Math.cos(0.7), sn = Math.sin(0.7), vs = p.vs.map((v) => [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c, v[2]]);
        return { vs, pl: M.planeOf(vs) };
    });
    const pairs = [["blob pair", blobA, blobB], ["rotated box", boxA, boxB]];
    let worst = 0, fb = 0, open = 0;
    for (const [, PA, PB] of pairs) {
        const v1 = volAt(run(PA, PB, "subtract").tris);
        for (const k of [1e-6, 1e-3, 1e3, 1e6]) {
            const r = run(tf(PA, k), tf(PB, k), "subtract");
            worst = Math.max(worst, Math.abs(volAt(r.tris) / k ** 3 - v1) / v1);
            fb += r.stats.a.fallbackTris + r.stats.b.fallbackTris;
            open += M.watertight(wrapAsPolys(r.tris), 1e-6 * k).unmatched;
        }
    }
    ok("!! *** A BLOB PAIR AND A ROTATED BOX AT 1e-6, 1e-3, 1e3 AND 1e6: THE SCALE-1 VOLUME TO 1e-13, NO FALLBACK, NO OPEN EDGE ***",
        worst < 1e-13 && fb === 0 && open === 0, "worst relative " + worst.toExponential(2) + ", fallbacks " + fb + ", unmatched edges (census scaled) " + open);
    // control: the same 1e-6 run with the step switched off is still wrong. Not by the pre-round 115% -- that figure
    // included the ray-test bug fixed below, which hurt the raw path too -- but measured at 2.0e-5 with 29 fallbacks
    // at round 11, 1.5e-5 with none since round 12 (at 1e-6 scale every pair is inside the 1e-9 contact tolerance,
    // and round 12 resolves those instead of refusing them), 2.1e-5 since round 13 (at that scale most triangles are
    // narrower than 8e-9 and take the sliver path): still ten orders of magnitude above the normalized run.
    const raw = run(tf(blobA, 1e-6), tf(blobB, 1e-6), "subtract", { normalize: false }), v1b = volAt(run(blobA, blobB, "subtract").tris);
    const rawErr = Math.abs(volAt(raw.tris) / 1e-18 - v1b) / v1b, rawFb = raw.stats.a.fallbackTris + raw.stats.b.fallbackTris;
    ok("   ...and with normalize:false the same 1e-6 blob pair is still wrong -- the step, not luck, is what fixed it",
        rawErr > 1e-9 && raw.scaleExponent === 0, "relative " + rawErr.toExponential(2) + " off, " + rawFb + " fallbacks, exponent " + raw.scaleExponent);

    // EXACT: the output at 2^-20 IS the output of the in-band run it was mapped to, times 2^k, bit for bit. The blob
    // pair spans ~2, so 2^-20 maps by k = -19 to scale 1/2, not 1: the guarantee is against the scale-1/2 run. That
    // it ALSO equals the scale-1 output x 2^-20 is a fact about this fixture (no tolerance fires between 1/2 and 1),
    // not a property of the step, so it is printed, not gated.
    const f = 2 ** -20, e = run(tf(blobA, f), tf(blobB, f), "subtract"), g = f * 2 ** -e.scaleExponent;
    const same = (u, m) => u.tris.length === e.tris.length && u.tris.every((x, i) => e.tris[i] === x * m);
    const inBand = run(tf(blobA, g), tf(blobB, g), "subtract"), unit = run(blobA, blobB, "subtract");
    ok("!! at scale 2^-20 the output is the in-band run's output x 2^k, bit for bit (a power of two scales every operation exactly)",
        e.scaleExponent !== 0 && inBand.scaleExponent === 0 && same(inBand, 2 ** e.scaleExponent),
        "exponent " + e.scaleExponent + " (ran at scale " + g + "), identical: " + same(inBand, 2 ** e.scaleExponent) +
        "; also identical to scale 1 x 2^-20 on this fixture: " + same(unit, f));
    const ext = [1e-100, 1e100].map((k) => { const r = run(tf(blobA, k), tf(blobB, k), "subtract"); const b = new Float64Array(r.tris.length); for (let i = 0; i < b.length; i++) b[i] = r.tris[i] / k; return Math.abs(volAt(b) - v1b) / v1b; });
    ok("   ...and at 1e-100 and 1e100 the same to 1e-13 (measured in scale-1 units; subnormals, below ~1e-290, are not claimed)",
        ext.every((x) => x < 1e-13), ext.map((x) => x.toExponential(2)).join(", "));

    // WHAT THE STEP EXPOSED, AND ROUND 11 FIXED: a small cutter on a big wall. Normalising to the JOINT extent put a
    // 0.01-unit cutter on a 2000-unit wall at 7.8e-5 units, and pointInMesh's rays passed straight through its
    // triangles: mesh/meshBVH.mjs's rayTriangle() called a ray parallel when |det| < eps, and det is an area. The cut
    // face read outside, its cap was dropped, and the volume came back 6.5% off -- for every cutter smaller than
    // 1/2e5 of the wall, a cliff, not a slope. The classifier's test is dimensionless now (meshPointClassify.mjs's
    // RAY_PARALLEL_REL); what is left grows smoothly: 1.4e-13 at 1:1e5, 3.2e-12 at 1:1e6, 1.9e-11 at 1:1e7.
    const unitBlob = M.jaggedBlob([0, 0, 0], 1, 8, 777);
    const eU = volAt(run(unitBlob, M.boxPolys([0, 0, -5.123], [10, 10, 5]), "intersect").tris);
    const cliff = [2e5, 1e6].map((ratio) => {
        const W = 1000, c = 2 * W / ratio, top = W / 10, C = [0, 0, top + 0.123 * c];
        const r = run(M.boxPolys([0, 0, 0], [W, W, top]), tf(unitBlob, c, C), "intersect");
        return { ratio, err: Math.abs(volAt(r.tris, C) - eU * c ** 3) / (eU * c ** 3), tris: r.triCount };
    });
    ok("!! a cutter 1/200,000 and 1/1,000,000 the size of the wall it cuts: the cap is kept and the volume right to 1e-10",
        cliff.every((x) => x.err < 1e-10), cliff.map((x) => "1:" + x.ratio.toExponential(0) + " " + x.err.toExponential(2) + " (" + x.tris + " triangles)").join(", ") +
        " -- 6.5% off and 135 triangles each before the ray test became dimensionless");
}

// =============================================================================================================
console.log("\n17. *** ROUND 12: PIECES OF ONE SURFACE LYING ON THE OTHER -- FLUSH, NEAR-FLUSH, EMPTY, IDENTICAL, ROTATED ***");
{
    // Round 12's families, each against an exact oracle, each with contacts:false (round 11's pipeline) as control.
    // A CRACK is an edge whose forward and backward counts differ (at the 1e-6 census key); an edge used twice each way
    // is two solids meeting along a line -- non-manifold, and correct -- and is reported, not failed.
    const cracks = (buf) => {
        const key = (o) => Math.round(buf[o] / 1e-6) + "," + Math.round(buf[o + 1] / 1e-6) + "," + Math.round(buf[o + 2] / 1e-6);
        const E = new Map();
        for (let o = 0; o < buf.length; o += 9) {
            const k = [key(o), key(o + 3), key(o + 6)];
            for (let i = 0; i < 3; i++) if (k[i] !== k[(i + 1) % 3]) { const e = k[i] + "|" + k[(i + 1) % 3]; E.set(e, (E.get(e) || 0) + 1); }
        }
        let crack = 0, nm = 0;
        for (const [e, n] of E) { const [a, b] = e.split("|"), back = E.get(b + "|" + a) || 0; if (n !== back) crack++; else if (n > 1) nm++; }
        return { crack, nm };
    };
    const run = (PA, PB, op, opts) => { const A = M.toTriangleBuffer(PA), B = M.toTriangleBuffer(PB); return meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), op, opts); };
    const vol = (r) => {
        const t = r.tris; let v = 0;
        for (let o = 0; o < t.length; o += 9) v += t[o] * (t[o + 4] * t[o + 8] - t[o + 5] * t[o + 7]) - t[o + 1] * (t[o + 3] * t[o + 8] - t[o + 5] * t[o + 6]) + t[o + 2] * (t[o + 3] * t[o + 7] - t[o + 4] * t[o + 6]);
        return v / 6;
    };
    const fbk = (r) => r.stats.a.fallbackTris + r.stats.b.fallbackTris;
    const OPS = ["union", "subtract", "intersect"];
    const boxTruth = (c1, h1, c2, h2) => { const i = overlapVol(c1, h1, c2, h2), a = 8 * h1[0] * h1[1] * h1[2], b = 8 * h2[0] * h2[1] * h2[2]; return { union: a + b - i, subtract: a - i, intersect: i }; };
    const stat = (r, k) => (r.stats.a[k] || 0) + (r.stats.b[k] || 0);

    // (a) FLUSH-BOX FUZZ: corners on a 1/4 grid, so faces are flush, edges collinear and corners coincident at random;
    // as built, rotated 0.7 rad about z (flush only to rounding), and shifted 0.1 (grid values no longer exact)
    {
        let runs = 0, worst = 0, fbs = 0, amb = 0, crack = 0, nm = 0, rearr = 0, bad0 = 0, conformDiff = 0, scanned = 0, scannedAll = 0;
        for (const variant of ["grid", "rot0.7", "shift0.1"]) {
            let st = 4242 >>> 0; const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
            const q = () => Math.round((rnd() * 2 - 1) * 4) / 4, hq = () => (1 + Math.floor(rnd() * 4)) / 4;
            const rz = (P) => P.map((p) => { const vs = p.vs.map((v) => [v[0] * Math.cos(0.7) - v[1] * Math.sin(0.7), v[0] * Math.sin(0.7) + v[1] * Math.cos(0.7), v[2]]); return { vs, pl: M.planeOf(vs) }; });
            for (let k = 0; k < 150; k++) {   // 150, not 40: case 78 puts a face's sample exactly on the other box's diagonal (the inclusive ON test, triArrangement.mjs)
                const c1 = [q(), q(), q()], h1 = [hq(), hq(), hq()], c2 = [q(), q(), q()], h2 = [hq(), hq(), hq()];
                const sh = variant === "shift0.1" ? 0.1 : 0;
                let A = M.boxPolys(c1.map((x) => x + sh), h1), B = M.boxPolys(c2.map((x) => x + sh), h2);
                if (variant === "rot0.7") { A = rz(A); B = rz(B); }
                const T = boxTruth(c1, h1, c2, h2);
                for (const op of OPS) {
                    const r = run(A, B, op), c = cracks(r.tris), e = Math.abs(vol(r) - T[op]);
                    runs++; worst = Math.max(worst, e); fbs += fbk(r); amb += r.ambiguousTriIndices.length; crack += c.crack; nm += c.nm; rearr += stat(r, "rearranged");
                    const r0 = run(A, B, op, { contacts: false });
                    if (Math.abs(vol(r0) - T[op]) > 1e-9 || cracks(r0.tris).crack) bad0++;
                    // round 15: the conformity pass scans only the triangles the BVH says touch a split one; conformAll
                    // scans every triangle, as rounds 12-14 did -- the very same bits, or the restriction lost a split
                    const rAll = run(A, B, op, { conformAll: true });
                    if (rAll.tris.length !== r.tris.length || rAll.tris.some((x, i) => x !== r.tris[i]) || rAll.from.some((x, i) => x !== r.from[i])) conformDiff++;
                    scanned += stat(r, "conformScanned"); scannedAll += stat(rAll, "conformScanned");
                }
            }
        }
        ok("!! *** " + runs + " FLUSH-BOX RUNS (grid, rotated, shifted; 3 ops): EXACT TO 1e-13, NO FALLBACK, NO AMBIGUOUS FRAGMENT, NO CRACK ***",
            worst < 1e-13 && fbs === 0 && amb === 0 && crack === 0,
            "worst |err| " + worst.toExponential(2) + ", fallback triangles " + fbs + ", ambiguous " + amb + ", cracks " + crack +
            ", non-manifold edges (solids meeting on a line) " + nm + ", triangles re-arranged for edge conformity " + rearr);
        ok("   control: contacts:false is wrong or cracked on a large share of the same runs", bad0 > runs / 4, bad0 + " of " + runs);
        ok("   the edge-conformity pass ran (a triangle got its neighbour's split point) -- the T-junction it closes is in this set", rearr > 0, rearr + " re-arrangements");
        ok("!! round 15: the conformity pass over only the triangles touching a split one gives the SAME BITS as over all of them, on every run (where conformity was born)",
            conformDiff === 0 && scanned < scannedAll, conformDiff + " of " + runs + " runs differing; triangles scanned " + scanned + " against " + scannedAll);
    }

    // (b) NEAR-FLUSH TILT: B sits on the unit box A=[0,1]^3 with its bottom face tilted by slope s about the x=0 edge,
    // z = 1 - s x: s > 0 dips into A (overlap s/2), s < 0 lifts off. Round 11: 0.33 off for |s| <= 3e-10.
    {
        const tilt = (sl) => {
            const Ap = M.boxPolys([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]), P = [];
            for (let i = 0; i < 8; i++) P.push([i & 1 ? 1 : 0, i & 2 ? 1 : 0, i & 4 ? 2 : 1 - sl * (i & 1 ? 1 : 0)]);
            const Bp = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]].map((ix) => { const vs = ix.map((i) => P[i].slice()); return { vs, pl: M.planeOf(vs) }; });
            return { Ap, Bp };
        };
        let worstIn = 0, worstOut = 0, fbs = 0, crack = 0, near = 0;
        const slopes = [1e-12, 1e-10, 3e-10, 1e-9, 3e-9, 1e-8, 1e-7, 1e-6, 1e-4, -1e-10, -1e-9, -1e-8];
        for (const sl of slopes) {
            const { Ap, Bp } = tilt(sl), VB = 1 + sl / 2, i = sl > 0 ? sl / 2 : 0, T = { union: 1 + VB - i, subtract: 1 - i, intersect: i };
            for (const op of OPS) {
                const r = run(Ap, Bp, op), e = Math.abs(vol(r) - T[op]);
                if (Math.abs(sl) <= 3e-9) worstIn = Math.max(worstIn, e); else worstOut = Math.max(worstOut, e);
                fbs += fbk(r); crack += cracks(r.tris).crack; near += stat(r, "nearSided");
            }
        }
        const { Ap, Bp } = tilt(1e-10), r0 = run(Ap, Bp, "intersect", { contacts: false });
        ok("!! *** NEAR-FLUSH TILT, 12 slopes 1e-12..1e-4 and lifted: within 5.01e-10 where |s| <= 3e-9 (s/2 of wedge is the most a contact can hide), 1e-12 beyond; no fallback, no crack ***",
            worstIn < 5.01e-10 && worstOut < 1e-12 && fbs === 0 && crack === 0 && near > 0,
            "worst |err| " + worstIn.toExponential(2) + " / " + worstOut.toExponential(2) + ", fallbacks " + fbs + ", cracks " + crack + ", faces sided locally (within 1e-8) " + near +
            " -- control contacts:false, s=1e-10 intersect: " + vol(r0).toExponential(3) + " (true 5e-11)");
    }

    // (c) ZERO-VOLUME OPERANDS: a flat rectangle, flattened along each axis, inside the box or lying on its face, as A or B
    {
        const box = M.boxPolys([0, 0, 0], [1, 1, 1]);
        let n = 0, worst = 0, crack = 0, flagged = 0, bad0 = 0;
        for (const ax of [0, 1, 2]) for (const onFace of [false, true]) for (const asA of [true, false]) {
            const h = [0.5, 0.5, 0.5]; h[ax] = 0; const c = [0, 0, 0]; if (onFace) c[ax] = 1;
            const flat = M.boxPolys(c, h), [PA, PB] = asA ? [flat, box] : [box, flat];
            const T = asA ? { union: 8, subtract: 0, intersect: 0 } : { union: 8, subtract: 8, intersect: 0 };
            for (const op of OPS) {
                const r = run(PA, PB, op); n++;
                worst = Math.max(worst, Math.abs(vol(r) - T[op])); crack += cracks(r.tris).crack; if (r.emptyOperand) flagged++;
                const r0 = run(PA, PB, op, { contacts: false }); if (Math.abs(vol(r0) - T[op]) > 1e-9 || cracks(r0.tris).crack) bad0++;
            }
        }
        // Round 11 happened to be right on these 36 by volume (only section 13's full-span sheet was wrong); what the
        // empty-solid rule rescues is round 12's own ON rule, which alone read a sheet lying on a face as one kept
        // face -- 0.33 off on 9 of these runs (subtract and intersect with the sheet as A, union with it as B, each axis), measured before the rule was added.
        ok("!! zero-volume operands (" + n + " runs: 3 axes, inside or on a face, as A or as B): exact, recognised as empty, no crack",
            worst < 1e-12 && crack === 0 && flagged === n, "worst |err| " + worst.toExponential(2) + ", flagged empty " + flagged + "/" + n + ", cracks " + crack +
            " (contacts:false wrong or cracked on " + bad0 + " of " + n + ")");
    }

    // (d) AN OPERAND WITH ITSELF: every face ON its twin, same-facing
    {
        let worst = 0, crack = 0, fbs = 0; const ctrl = [];
        for (const P of [M.boxPolys([0.1, 0, 0], [1, 0.7, 0.4]), M.jaggedBlob([0, 0, 0], 1, 8, 7)]) {
            const V = M.volume(P), T = { union: V, subtract: 0, intersect: V };
            for (const op of OPS) {
                const r = run(P, P, op); worst = Math.max(worst, Math.abs(vol(r) - T[op])); crack += cracks(r.tris).crack; fbs += fbk(r);
                ctrl.push(Math.abs(vol(run(P, P, op, { contacts: false })) - T[op]));
            }
        }
        ok("!! a box and a jagged blob, each with ITSELF, all 3 ops: exact to 1e-13, no crack, no fallback",
            worst < 1e-13 && crack === 0 && fbs === 0, "worst |err| " + worst.toExponential(2) + ", cracks " + crack + ", fallbacks " + fbs +
            " -- control contacts:false worst " + Math.max(...ctrl).toExponential(2));
    }

    // (e) A BLOB AGAINST ITS OWN COPY ROTATED BY theta (first-order oracle: theta/2 x the integral of |(w x p).n| over
    // the surface). Outside a band the result is right; INSIDE it, KNOWN -- see meshBoolean.mjs's ROUND 12 paragraph.
    {
        const blob = M.jaggedBlob([0.1, 0.05, 0], 1, 8, 101), Vb = M.volume(blob);
        const rot = (P, w, th) => {
            const c = Math.cos(th), sn = Math.sin(th), C = 1 - c, [x, y, z] = w;
            const R = [[c + x * x * C, x * y * C - z * sn, x * z * C + y * sn], [y * x * C + z * sn, c + y * y * C, y * z * C - x * sn], [z * x * C - y * sn, z * y * C + x * sn, c + z * z * C]];
            return P.map((p) => { const vs = p.vs.map((v) => [0, 1, 2].map((r) => R[r][0] * v[0] + R[r][1] * v[1] + R[r][2] * v[2])); return { vs, pl: M.planeOf(vs) }; });
        };
        // first-order symmetric difference for rotation about unit axis w through the origin: (theta/2) sum |(w x p).n| dA
        const bufB = M.toTriangleBuffer(blob);
        const firstOrder = (w) => {
            let S = 0;
            for (let o = 0; o < bufB.length; o += 9) {
                const a = [bufB[o], bufB[o + 1], bufB[o + 2]], e1 = [bufB[o + 3] - a[0], bufB[o + 4] - a[1], bufB[o + 5] - a[2]], e2 = [bufB[o + 6] - a[0], bufB[o + 7] - a[1], bufB[o + 8] - a[2]];
                const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], A2 = Math.hypot(...nn);
                const K = 24; let acc = 0, cnt = 0;
                for (let i = 0; i < K; i++) for (let j = 0; j < K - i; j++) for (const [du, dv] of j < K - i - 1 ? [[1 / 3, 1 / 3], [2 / 3, 2 / 3]] : [[1 / 3, 1 / 3]]) {
                    const u = (i + du) / K, v = (j + dv) / K, p = [a[0] + u * e1[0] + v * e2[0], a[1] + u * e1[1] + v * e2[1], a[2] + u * e1[2] + v * e2[2]];
                    const wp = [w[1] * p[2] - w[2] * p[1], w[2] * p[0] - w[0] * p[2], w[0] * p[1] - w[1] * p[0]];
                    acc += Math.abs((wp[0] * nn[0] + wp[1] * nn[1] + wp[2] * nn[2]) / A2); cnt++;
                }
                S += acc / cnt * A2 / 2;
            }
            return S;
        };
        const outside = [], inside = [];
        for (const w0 of [[0, 0, 1], [1, 2, 3]]) {
            const L = Math.hypot(...w0), w = w0.map((x) => x / L), S = firstOrder(w);
            for (const th of [1e-12, 1e-10, 3e-10, 1e-9, 3e-9, 1e-8, 3e-8, 1e-7, 1e-6]) {
                const fo = th * S / 2, T = { union: Vb + fo, subtract: fo, intersect: Vb - fo };
                let wst = 0, f = 0;
                for (const op of OPS) { const r = run(blob, rot(blob, w, th), op); wst = Math.max(wst, Math.abs(vol(r) - T[op])); f += fbk(r); }
                (th >= 1e-9 && th <= 3e-8 ? inside : outside).push([th, wst, f, w0.join("")]);
            }
        }
        ok("!! rotated by 1e-12, 1e-10, 3e-10, 1e-7 or 1e-6 rad, about z and about (1,2,3): all 3 ops within 3e-9 of the first-order oracle (round 11: up to 0.2)",
            outside.every(([, w]) => w < 3e-9), outside.map(([t, w, f, ax]) => ax + " " + t.toExponential(0) + ": " + w.toExponential(1) + " (" + f + " fb)").join(", "));
        console.log("  ..... fallback triangles by angle, inside the band: " + inside.map(([t, , f, ax]) => ax + " " + t.toExponential(0) + ": " + f).join(", "));
        const fbAll = [...outside, ...inside].reduce((n, [, , f]) => n + f, 0);
        // round 16: 87 -> 33, by a dangling chain of seam segments from a NEAR-PARALLEL pair being pruned instead of refusing
        // the triangle (triArrangement's ROUND 16 note: 84 -> 39), and the seam consensus (39 -> 33)
        ok("   the rotated family's plane-path fallbacks stay at or under the 33 measured -- 87 at round 12, 357 without triArrangement's join of chain ends stopping short of the boundary",
            fbAll <= 33, fbAll + " fallback triangles over 54 runs");
        const bandWorst = Math.max(...inside.map(([, w]) => w));
        console.log("  KNOWN  rotated by 1e-9..3e-8 rad, about z and about (1,2,3): " + inside.map(([t, w, , ax]) => ax + " " + t.toExponential(0) + ": " + w.toExponential(1)).join(", ") +
            " -- twin triangles 1e-9..1e-8 apart, straddling the 1e-9 contact tolerance: a face sided one way on A and its twin the other way on B costs a cone of volume, not a sliver. meshBoolean.mjs's ROUND 12 paragraph.");
        ok("   (KNOWN, pinned) the band's worst stays within 2.5x its measured 2.8e-2 -- a regression alarm, not a correctness claim",
            bandWorst < 2.5 * 2.8e-2, "worst " + bandWorst.toExponential(2));
    }
}

console.log("\n18. *** ROUND 13: PROVENANCE -- EVERY OUTPUT TRIANGLE NAMES THE INPUT TRIANGLE IT IS A PIECE OF ***");
{
    // blastEngine.mjs gives a piece of the wall its source polygon's plane and tag, and a piece of the blob the blob
    // polygon's plane turned round, by `from` alone -- so `from` is checked here geometrically, not by the adapter's
    // results: every vertex of an output triangle lies on the triangle `from` names (within 1e-9 of the operands'
    // size), and it faces that triangle's way (turned round for B under subtract). Jagged blobs, whose neighbouring
    // triangles are rarely coplanar, so an index off by one lands on a triangle the piece does not lie on.
    const tri = (buf, i) => [[buf[i * 9], buf[i * 9 + 1], buf[i * 9 + 2]], [buf[i * 9 + 3], buf[i * 9 + 4], buf[i * 9 + 5]], [buf[i * 9 + 6], buf[i * 9 + 7], buf[i * 9 + 8]]];
    const nrm = (t) => { const u = [0, 1, 2].map((c) => t[1][c] - t[0][c]), w = [0, 1, 2].map((c) => t[2][c] - t[0][c]); return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; };
    const cases = [
        ["blob - blob", M.jaggedBlob([0, 0, 0], 1, 8, 101), M.jaggedBlob([0.4, 0.2, 0.1], 0.9, 8, 501), 1],
        ["box - blob (flush-free)", M.boxPolys([0, 0, 0], [1.2, 0.9, 0.35]), M.jaggedBlob([0.3, -0.2, 0], 0.7, 10, 7), 1],
        ["blob - blob at scale 1e3 (normalised)", M.jaggedBlob([0, 0, 0], 1e3, 8, 102), M.jaggedBlob([300, 200, 100], 900, 8, 502), 1e3],
    ];
    for (const [name, PA, PB, s] of cases) for (const op of ["union", "subtract", "intersect"]) {
        const A = M.toTriangleBuffer(PA), B = M.toTriangleBuffer(PB);
        const r = meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), op);
        let unknown = 0, off = 0, facing = 0, worst = 0, fromA = 0, fromB = 0;
        const nA = A.length / 9, nB = B.length / 9;
        for (let i = 0; i < r.triCount; i++) {
            const f = r.from[i];
            if (!(f >= 0 && f < nA) && !(f < 0 && -f - 1 < nB)) { unknown++; continue; }
            const S = f >= 0 ? tri(A, f) : tri(B, -f - 1), T = tri(r.tris, i);
            if (f >= 0) fromA++; else fromB++;
            let d = 0;
            for (const v of T) d = Math.max(d, Math.sqrt(closestOnTriangle(v, S[0], S[1], S[2]).d2));
            worst = Math.max(worst, d / s);
            if (d > 1e-9 * s) off++;
            const nT = nrm(T), nS = nrm(S), c = nT[0] * nS[0] + nT[1] * nS[1] + nT[2] * nS[2];
            const want = f < 0 && op === "subtract" ? -1 : 1;
            if (Math.hypot(...nT) > 1e-12 * s * s && c * want <= 0) facing++;
        }
        ok("!! " + name + ", " + op + ": every triangle's `from` names a triangle it lies on and faces with",
            r.from.length === r.triCount && unknown === 0 && off === 0 && facing === 0 && fromA > 0 && fromB > 0,
            r.triCount + " triangles (" + fromA + " from A, " + fromB + " from B), " + unknown + " without, " + off + " off their source, " +
            facing + " facing wrong; worst distance " + worst.toExponential(1) + " x size");
    }
}

console.log("\n19. *** ROUND 16: A ZERO-THICKNESS FIN, AND THE SEAM AGREED BEFORE CUTTING ***");
{
    const OPS = ["union", "subtract", "intersect"];
    const run = (PA, PB, op, opts) => { const A = M.toTriangleBuffer(PA), B = M.toTriangleBuffer(PB); return meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), op, opts); };
    const vol = (r) => { const t = r.tris; let v = 0; for (let o = 0; o < t.length; o += 9) v += t[o] * (t[o + 4] * t[o + 8] - t[o + 5] * t[o + 7]) - t[o + 1] * (t[o + 3] * t[o + 8] - t[o + 5] * t[o + 6]) + t[o + 2] * (t[o + 3] * t[o + 7] - t[o + 4] * t[o + 6]); return v / 6; };
    // (a) A ZERO-THICKNESS FIN: the box [-1,1]^3 with a sheet standing on its top face (x = 0.2, z 1..1.8, |y| <= 0.6)
    // -- two faces on the same vertices, wound opposite ways -- the top face split along its base so every edge is used
    // equally both ways. It has no volume, so every op must give exactly what the plain box (split the same way) gives.
    // Measured before round 16: 5.2e-2 off with B through the fin, 1.8e-2 with B BESIDE it, not touching (rays crossing
    // the sheet hit its two faces at one point, which pointInMesh welds into one hit, and the parity flips).
    const P = (vs) => ({ vs, pl: M.planeOf(vs) }), x0 = 0.2;
    const finBox = (fin, exact = true) => {
        const box = M.boxPolys([0, 0, 0], [1, 1, 1]).filter((p) => !(p.pl.n[2] > 0.5)).map((p) => {
            if (Math.abs(p.pl.n[1]) < 0.5) return p;
            const vs = []; for (let i = 0; i < p.vs.length; i++) { const u = p.vs[i], v = p.vs[(i + 1) % p.vs.length]; vs.push(u); if (u[2] === 1 && v[2] === 1) vs.push([x0, u[1], 1]); }
            return { vs, pl: p.pl };
        });
        const top = [P([[-1, -1, 1], [x0, -1, 1], [x0, -0.6, 1], [x0, 0.6, 1], [x0, 1, 1], [-1, 1, 1]]), P([[x0, -1, 1], [1, -1, 1], [1, 1, 1], [x0, 1, 1], [x0, 0.6, 1], [x0, -0.6, 1]])];
        if (!fin) return [...box, ...top];
        const a = [x0, -0.6, 1], b = [x0, 0.6, 1], c = [x0, 0.6, 1.8], d = [x0, -0.6, 1.8];
        // the fin FIRST: cancelling it renumbers every triangle after it, so `from` must be remapped to be right
        return [P([a, b, c, d]), exact ? P([a, d, c, b]) : P([d, c, b, a]), ...box, ...top];   // exact: the same two triangles, reversed
    };
    const Bs = [M.boxPolys([0.2, 0, 1.3], [0.5, 0.3, 0.4]), M.boxPolys([0.6, 0, 0.5], [0.3, 0.3, 0.8]), M.boxPolys([3, 0, 0], [0.5, 0.5, 0.5])];
    let worst = 0, worst0 = 0, worstOther = 0, runs = 0, cancelled = 0, offSource = 0;
    for (const B of Bs) for (const op of OPS) for (const finIsA of [true, false]) {
        const pair = (F) => (finIsA ? [F, B] : [B, F]);
        const truth = vol(run(...pair(finBox(false)), op));
        const r = run(...pair(finBox(true)), op);
        worst = Math.max(worst, Math.abs(vol(r) - truth)); cancelled += (r.stats.a.finsCancelled || 0) + (r.stats.b.finsCancelled || 0);
        // `from` names the CALLER's triangles after a cancel: every output triangle lies on the one it names
        const [PA, PB] = pair(finBox(true)), TA = M.toTriangleBuffer(PA), TB = M.toTriangleBuffer(PB);
        for (let i = 0; i < r.triCount; i++) {
            const f = r.from[i], src = f >= 0 ? TA : TB, k = f >= 0 ? f : -f - 1;
            if (k * 9 >= src.length) { offSource++; continue; }
            const S = [0, 1, 2].map((c) => [src[k * 9 + c * 3], src[k * 9 + c * 3 + 1], src[k * 9 + c * 3 + 2]]);
            for (let c = 0; c < 3; c++) if (closestOnTriangle([r.tris[i * 9 + c * 3], r.tris[i * 9 + c * 3 + 1], r.tris[i * 9 + c * 3 + 2]], S[0], S[1], S[2]).d2 > 1e-24) { offSource++; break; }
        }
        worst0 = Math.max(worst0, Math.abs(vol(run(...pair(finBox(true)), op, { cancelFins: false })) - truth));
        worstOther = Math.max(worstOther, Math.abs(vol(run(...pair(finBox(true, false)), op)) - truth));
        runs++;
    }
    ok("!! a zero-thickness fin (its two faces the same triangles reversed): " + runs + " runs (3 B's, 3 ops, fin as A and as B) exactly what the plain box gives",
        worst < 1e-12 && cancelled === 4 * runs && offSource === 0, "worst |err| " + worst.toExponential(2) + ", fin triangles cancelled " + cancelled + " (two quads: 2 reversed pairs a run), output triangles off the source `from` names " + offSource);
    ok("   control: cancelFins:false leaves the fin in and is wrong (pointInMesh's welded hits)", worst0 > 1e-2, "worst |err| " + worst0.toExponential(2));
    console.log("  KNOWN  a fin whose two faces are triangulated DIFFERENTLY (each quad fanned from a different corner) is not cancelled -- that needs the operand arranged against itself: worst |err| " + worstOther.toExponential(2));
    // (b) THE PAIR CACHE IS TRANSPARENT: where the seam consensus joins nothing, the arrangements reading meshBoolean's
    // pair results give the very bits they gave computing every pair themselves
    let same = true, joinedNone = true;
    for (const [PA, PB] of [[M.boxPolys([0, 0, 0], [1, 1, 1]), M.boxPolys([0.31, 0.27, 0.19], [0.7, 0.8, 0.9])], [M.jaggedBlob([0, 0, 0], 1, 8, 101), M.jaggedBlob([0.4, 0.2, 0.1], 0.9, 8, 501)]]) for (const op of OPS) {
        const r = run(PA, PB, op), r0 = run(PA, PB, op, { seamConsensus: false });
        joinedNone = joinedNone && seamConsensus.last.joined === 0;
        same = same && r.tris.length === r0.tris.length && r.tris.every((x, i) => x === r0.tris[i]);
    }
    ok("   the pair results meshBoolean shares with both arrangements change nothing where the consensus joins nothing (a box pair, a blob pair, 3 ops: bit for bit)",
        same && joinedNone, "identical " + same + ", consensus joined nothing on all " + joinedNone);
    // (c) BY HAND -- no workload here puts an input vertex in a seam cluster or a same-winding duplicate in an operand,
    // so the rules are held directly. joinSeamEnds: an input vertex never moves, two are never one point, a chain of
    // short segments is one point (its smallest, when no input vertex is in it).
    const v = [1, 1, 1], q = [1 - 5e-10, 1, 1], w = [1 + 5e-10, 1, 1];
    const j1 = joinSeamEnds([{ p0: v, p1: q, c0: true, c1: false }]);
    const j2 = joinSeamEnds([{ p0: v, p1: w, c0: true, c1: true }]);
    const j3 = joinSeamEnds([{ p0: w, p1: v, c0: false, c1: false }, { p0: v, p1: q, c0: false, c1: false }]);
    ok("   by hand: a short seam segment from an input vertex joins ONTO it (though the other end is smaller); two input vertices are never joined; a chain is one point",
        j1.canon && j1.canon(q) === v && j1.canon(v) === v && j2.canon === null && j2.stats.refused === 1 && j3.canon && j3.canon(w) === q && j3.canon(v) === q,
        "onto the vertex " + (j1.canon && j1.canon(q) === v) + ", vertices kept apart " + (j2.canon === null) + ", chain to its smallest " + (j3.canon && j3.canon(w) === q));
    // reverseTwins: the same triangle twice wound opposite ways (from any starting corner) cancels; twice the SAME way
    // is a doubled face, not a fin, and stays
    const T = [0, 0, 0, 1, 0, 0, 0, 1, 0], Tr = [1, 0, 0, 0, 0, 0, 0, 1, 0], Tr2 = [0, 1, 0, 1, 0, 0, 0, 0, 0], Tsame = [1, 0, 0, 0, 1, 0, 0, 0, 0];
    const k1 = reverseTwins(Float64Array.from([...T, ...Tr])), k2 = reverseTwins(Float64Array.from([...T, ...Tr2])), k3 = reverseTwins(Float64Array.from([...T, ...Tsame]));
    ok("   by hand: a triangle and itself reversed cancel, from either starting corner; the same triangle twice with the same winding does not",
        k1 && k1.length === 0 && k2 && k2.length === 0 && k3 === null, "reversed " + (k1 && k1.length) + " kept, rotated-reversed " + (k2 && k2.length) + " kept, same winding " + (k3 === null ? "untouched" : "cancelled"));
}

console.log("\n20. *** ROUND 16b: EXACT SEAM TOPOLOGY, AN OPTION -- MEASURED NOT TO BE ENOUGH ON ITS OWN ***");
{
    const OPS = ["union", "subtract", "intersect"];
    const run = (PA, PB, op, opts) => { const A = M.toTriangleBuffer(PA), B = M.toTriangleBuffer(PB); return meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), op, opts); };
    const vol = (r) => { const t = r.tris; let v = 0; for (let o = 0; o < t.length; o += 9) v += t[o] * (t[o + 4] * t[o + 8] - t[o + 5] * t[o + 7]) - t[o + 1] * (t[o + 3] * t[o + 8] - t[o + 5] * t[o + 6]) + t[o + 2] * (t[o + 3] * t[o + 7] - t[o + 4] * t[o + 6]); return v / 6; };
    // opts.exactSeam: every pair decided by triTriIntersectExact (orient3d signs of input points) instead of the 1e-9
    // snapped distances. In general position it is the same answer: a box against a box offset off every grid.
    const A = M.boxPolys([0, 0, 0], [1, 1, 1]), B = M.boxPolys([0.31, 0.27, 0.19], [0.7, 0.8, 0.9]);
    const I = [0, 1, 2].reduce((p, k) => p * (Math.min(1, [0.31, 0.27, 0.19][k] + [0.7, 0.8, 0.9][k]) - Math.max(-1, [0.31, 0.27, 0.19][k] - [0.7, 0.8, 0.9][k])), 1);
    const T = { union: 8 + 8 * 0.7 * 0.8 * 0.9 - I, subtract: 8 - I, intersect: I };
    let worst = 0;
    for (const op of OPS) worst = Math.max(worst, Math.abs(vol(run(A, B, op, { exactSeam: true })) - T[op]));
    ok("   asked for, exactSeam on a box pair in general position comes out exact (the path is kept working)",
        worst < 1e-12, "worst |err| " + worst.toExponential(2));
    // KNOWN: near-coincidence. A blob against its copy rotated 1e-12: every twin pair now INTERSECTS exactly, along a
    // sliver the arrangement then snaps at 1e-9 triangle by triangle -- the inconsistency moved one level down. Round 16b
    // measured, exactSeam against the default: rotated family fallbacks 6 against 33, but the band's worst 4.7e-2 against
    // 2.8e-2 and outside it 9e-3 against 1.4e-9; flush boxes 3 of 900 wrong (1.2e-2) against 0. It needs the arrangement
    // snap-rounded GLOBALLY (near-coincident surfaces made exactly coincident, then the exact-zero contact path) --
    // backlog bvh-csg-r16c-global-snap-rounding.
    const blob = M.jaggedBlob([0.1, 0.05, 0], 1, 8, 101), c = Math.cos(1e-12), sn = Math.sin(1e-12);
    const rotB = blob.map((p) => { const vs = p.vs.map((v) => [c * v[0] - sn * v[1], sn * v[0] + c * v[1], v[2]]); return { vs, pl: M.planeOf(vs) }; });
    let wDef = 0, wEx = 0;
    const Vb = M.volume(blob);
    for (const op of ["union", "intersect"]) {
        wDef = Math.max(wDef, Math.abs(vol(run(blob, rotB, op)) - Vb));
        wEx = Math.max(wEx, Math.abs(vol(run(blob, rotB, op, { exactSeam: true })) - Vb));
    }
    // and it is OFF unless asked for: where the two paths differ, the default is the snapped path, bit for bit
    const rDef = run(blob, rotB, "union"), rOff = run(blob, rotB, "union", { exactSeam: false }), rOn = run(blob, rotB, "union", { exactSeam: true });
    const same = (x, y) => x.tris.length === y.tris.length && x.tris.every((v, i) => v === y.tris[i]);
    ok("!! exactSeam is OFF unless asked for: on the rotated copy the default output is the snapped path's, bit for bit, and not the exact path's",
        same(rDef, rOff) && !same(rDef, rOn), "default = exactSeam:false " + same(rDef, rOff) + ", default = exactSeam:true " + same(rDef, rOn));
    console.log("  KNOWN  a blob against its copy rotated 1e-12 (union, intersect): default |err| " + wDef.toExponential(1) + ", exactSeam " + wEx.toExponential(1) + " -- exact topology without global snap rounding");
}

console.log(`\nmeshBoolean-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: only `subtract` is required to pass this gate on axis-aligned " +
    "box fixtures (per this round's own scope decision, see meshBoolean.mjs's own header) -- `union` and " +
    "`intersect` are exercised in sections 4, 7, and 12 but not with the same fixture-count depth as subtract's " +
    "own sections 1/2/8/9. A SECOND adversarial review (run after the first fix pass) found and this file's " +
    "own fixes address: (a) an unrecognized `op` silently returned an empty mesh with no error -- FIXED, gated " +
    "in section 12; (b) a DEGENERATE (zero-volume) operand embedded in the other mesh's interior yields a " +
    "wrong-SIGN volume error -- a NEW manifestation of the same root cause as the touching-contact gap below; " +
    "FIXED at round 12 (an empty solid, regularised answer), section 13, with round 11's numbers kept as its control; (c) the original sabotage log's entry A wrongly claimed section 3 catches that sabotage -- " +
    "CORRECTED after re-measuring (section 3 hand-derives its own flip independent of bKeepAndFlip and provides " +
    "no regression coverage for the real flip decision, an honest gap named in the corrected log rather than " +
    "silently left standing); (d) section 8's shared 2%-relative known-gap bound gave uneven regression " +
    "headroom across its 3 cases -- FIXED, each case now bounded at 2.5x its own measured baseline; (e) " +
    "stats.capped propagation was only exercised on the always-false path -- FIXED, section 8 now forces it " +
    "true via a deliberately tiny maxFragments and asserts it surfaces correctly. The TOUCHING/ZERO-VOLUME-" +
    "CONTACT gap (section 8's 3 former KNOWN cases) is FIXED at round 12 -- the tiebreak it named, by orientation, " +
    "on a padded broad phase; section 17 extends it to 1,350 flush-box runs. Its root cause, as round 6 TRACED it " +
    "during this round's own follow-up fix pass (an earlier version of this header guessed wrong and was " +
    "corrected after actually instrumenting it): every triangle of both meshes takes the empty-candidate " +
    "shortcut because a sub-ULP floating-point gap in boxPolys's own c-h subtraction makes pairOverlap() find " +
    "zero true AABB-overlapping candidates between the \"flush\" faces, so whole, unsplit, face-sized " +
    "triangles get classified directly -- correctly flagged ambiguous by pointInMesh, but the keep-ambiguous " +
    "policy has no size awareness, so a kept whole face-sized triangle distorts volume proportional to its " +
    "own area. Round 12's own KNOWN: a copy rotated by 1e-9..3e-8 rad (section 17, up to 2.8e-2, pinned). The A-vs-B SEAM NON-COINCIDENCE gap " +
    "(section 11) was the plane path's, from triFragmentAccumulate.mjs's independent-representative-plane design; " +
    "ROUND 9 built the redesign this sentence used to ask for -- each tri-tri boundary computed once by round 2's " +
    "triTriIntersect.mjs and kept as given by both meshes' arrangements (triArrangement.mjs) -- and on that path, " +
    "the default, the seam is bit-identical and the raw output watertight (sections 11 and 15). It is NOT closed " +
    "where a triangle falls back to the plane path (since round 12 no box fixture here does; the rotated-copy band " +
    "still does), and cutting:\"plane\" keeps the old baseline, still gated. Every ROUND 4/5 residual risk this file's own header " +
    "inherits (meshPointClassify's ~1e-9 thin-feature weld risk; triFragmentAccumulate's near-duplicate-plane " +
    "sliver cascade and maxFragments starvation) applies unchanged here and is not re-gated in this file -- see " +
    "those files' own gates. Non-box fixtures are covered only by section 15 (rotated boxes, jagged blob pairs, " +
    "a needle); performance at realistic mesh sizes is meshBooleanBlast-selfcheck.mjs's, not this file's. A formal CSG " +
    "property-list audit comparable to meshCSG-selfcheck.mjs's own is tools/ship/nextRounds.mjs backlog item " +
    "#25, for the EXISTING BSP path, and has not happened yet either -- this round does not attempt an " +
    "equivalent audit for the new path.");
process.exit(fails ? 1 : 0);
