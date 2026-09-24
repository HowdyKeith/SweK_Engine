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
// *** THE REAL, MEASURED, NOT-FIXED-THIS-ROUND GAP, REPRODUCED DIRECTLY (NOT JUST DESCRIBED): *** of the 8
// degenerate-contact fixtures, 3 involve a cutter face sitting FLUSH against a wall face with otherwise ZERO
// interior overlap. Section 8 below runs all 8 through meshBoolean() and asserts the 5 that match the oracle
// to float64 noise, then SEPARATELY reports (not asserted as a pass) the exact measured volume error on the
// 3 flush-contact cases -- see meshBoolean.mjs's own header for the root-cause investigation. This is a
// genuinely new finding this round's own research surfaced (2 of the 3 cases) and this round's own
// scratch-verification independently confirmed AND EXTENDED (found a third failing case the research's own
// probe did not report), not previously known to any prior round of this arc.
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
"use strict";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { groupCandidatesByTriA, accumulateFragments } from "./triFragmentAccumulate.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";
import { classifyMeshAgainstOther, assembleBoolean, meshBoolean } from "./meshBoolean.mjs";
import * as M from "./meshCSG.mjs";

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

    const classifiedA = classifyMeshAgainstOther(bufA, bvhA, bufB, bvhB);
    const classifiedB = classifyMeshAgainstOther(bufB, bvhB, bufA, bvhA);
    ok("!! this fixture genuinely produces ambiguous fragments (a vacuous toggle test would prove nothing)",
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
console.log("\n7. *** FLUSH-FACE UNION: EXACT VOLUME AND WATERTIGHTNESS MEASURED (NOT ASSERTED ZERO-CRACK) ***");
{
    const { bufA, bvhA, bufB, bvhB, oracle } = FLUSH;
    const r = meshBoolean(bufA, bvhA, bufB, bvhB, "union");
    const got = M.volume(wrapAsPolys(r.tris));
    ok("!! meshBoolean() union matches the oracle exactly despite a high ambiguous-fragment count",
        close(got, oracle, 1e-9), "got " + got + ", ambiguous=" + r.ambiguousTriIndices.length + "/" + r.triCount);
    const wt = M.watertight(wrapAsPolys(r.tris));
    console.log("  ..... watertight (raw, no snap/weld -- see meshBoolean.mjs's own header): ok=" + wt.ok +
        " unmatched=" + wt.unmatched + "/" + wt.edges + " -- MEASURED baseline, not asserted zero, out of scope this round");
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
    const A = M.boxPolys(WC, WH), VA = M.volume(A);
    const { buf: bufA, bvh: bvhA } = buildBVH(A);
    let exactCount = 0, expectExact = 0, knownGapUnresolvedSeen = 0;
    for (const [name, c, h, mode] of cases) {
        const B = M.boxPolys(c, h), exp = overlapVol(WC, WH, c, h);
        const expVol = VA - exp;
        const { buf: bufB, bvh: bvhB } = buildBVH(B);
        const r = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract");
        const got = M.volume(wrapAsPolys(r.tris));
        const abs = Math.abs(got - expVol);
        if (mode === true) {
            expectExact++;
            ok("!! " + name, abs < 1e-9, "expected " + expVol.toFixed(6) + " got " + got.toFixed(6) + " err " + abs.toExponential(3));
            if (abs < 1e-9) exactCount++;
        } else {
            // KNOWN, MEASURED, UNRESOLVED GAP -- reported, not asserted as a pass. See meshBoolean.mjs's own
            // header for the root-cause investigation (traced precisely during this round's own follow-up fix
            // pass: every triangle here takes the EMPTY-CANDIDATE SHORTCUT, since a sub-ULP floating-point gap
            // in boxPolys's own c-h subtraction means pairOverlap finds zero true AABB-overlapping candidates
            // between the "flush" faces -- the resulting whole, face-sized, unsplit triangles get correctly
            // flagged ambiguous by pointInMesh's own agreement<1 signal, but "keep ambiguous" has no size
            // awareness, so a kept whole face-sized triangle distorts volume far more than a kept sliver
            // would). Bound (not asserted zero) so a future regression that makes this MUCH worse is caught.
            const rel = Math.abs(expVol) > 1e-9 ? abs / Math.abs(expVol) : abs;
            const bound = mode * 2.5;
            console.log("  KNOWN  " + name + "   expected " + expVol.toFixed(6) + " got " + got.toFixed(6) +
                " absErr " + abs.toExponential(3) + " relErr " + (rel*100).toFixed(2) + "% (baseline " + (mode*100).toFixed(2) +
                "%) -- touching/zero-volume-contact gap, not fixed this round -- emptyCandidateShortcuts a/b=" +
                r.stats.a.emptyCandidateShortcuts + "/" + r.stats.a.triCount + " " + r.stats.b.emptyCandidateShortcuts + "/" + r.stats.b.triCount +
                " ambiguous=" + r.ambiguousTriIndices.length);
            ok("!! " + name + " (known gap) error stays within 2.5x its own measured baseline -- a regression alarm, not a correctness claim",
                rel < bound, "relErr=" + (rel*100).toFixed(3) + "% bound=" + (bound*100).toFixed(3) + "%");
            ok("!! " + name + " (known gap) confirms the traced root cause: every triangle of both meshes takes the empty-candidate shortcut, and at least one output fragment is flagged ambiguous",
                r.stats.a.emptyCandidateShortcuts === r.stats.a.triCount && r.stats.b.emptyCandidateShortcuts === r.stats.b.triCount && r.ambiguousTriIndices.length > 0,
                "a=" + r.stats.a.emptyCandidateShortcuts + "/" + r.stats.a.triCount + " b=" + r.stats.b.emptyCandidateShortcuts + "/" + r.stats.b.triCount + " ambiguous=" + r.ambiguousTriIndices.length);
        }
    }
    ok("!! " + expectExact + " of " + expectExact + " non-flush degenerate-contact fixtures match the oracle exactly",
        exactCount === expectExact, exactCount + "/" + expectExact);
    // An adversarial review of this round's own gate found stats.capped propagation (classifyMeshAgainstOther's
    // `if (acc.capped) capped = true`) was exercised ONLY on the always-false path (sections 2 and 9), never on
    // genuinely true input -- a regression that broke the accumulation (e.g. `capped = acc.capped`, losing an
    // earlier triangle's true value, instead of OR-accumulating) would pass silently. Force it true directly
    // via a deliberately tiny maxFragments on the primary fixture and confirm meshBoolean() surfaces it.
    {
        const { bufA, bvhA, bufB, bvhB } = PRIMARY;
        const rCapped = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract", { accOpts: { maxFragments: 3 } });
        ok("!! stats.capped correctly reports true when accOpts.maxFragments is forced tiny (exercises the true/nonzero propagation path, not just false)",
            rCapped.stats.a.capped === true || rCapped.stats.b.capped === true,
            "statsA.capped=" + rCapped.stats.a.capped + " statsB.capped=" + rCapped.stats.b.capped);
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
console.log("\n11. *** THE A-VS-B SEAM DOES NOT COINCIDE, MEASURED AS A NAMED, NON-REGRESSION BASELINE ***");
{
    // meshBoolean.mjs's own header names this: A's and B's independently-clipped cut-boundary vertices do
    // NOT land on top of each other, even on a clean fixture. Measured directly here (not merely asserted)
    // and gated as a NON-REGRESSION baseline -- an increase far beyond the measured baseline would signal a
    // real regression; the baseline itself is not claimed to be good.
    const { Apolys, Bpolys, bufA, bvhA, bufB, bvhB } = PRIMARY;
    const classifiedA = classifyMeshAgainstOther(bufA, bvhA, bufB, bvhB);
    const classifiedB = classifyMeshAgainstOther(bufB, bvhB, bufA, bvhA);
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
    const matchRate = aCutVerts.length ? matched / aCutVerts.length : 1;
    console.log("  ..... A cut verts=" + aCutVerts.length + " B cut verts=" + bCutVerts.length +
        " matched-within-1e-6=" + matched + " (" + (matchRate*100).toFixed(1) + "%) -- measured baseline, not a correctness claim");
    const r = meshBoolean(PRIMARY.bufA, PRIMARY.bvhA, PRIMARY.bufB, PRIMARY.bvhB, "subtract");
    const wt = M.watertight(wrapAsPolys(r.tris));
    ok("!! watertight() unmatched-edge count on the primary fixture stays within the measured baseline (non-regression, not zero-crack)",
        wt.unmatched <= 45, "unmatched=" + wt.unmatched + "/" + wt.edges + " (baseline measured at 37/189 during scratch-verification)");
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
console.log("\n13. *** A DEGENERATE (ZERO-VOLUME) OPERAND -- A NEW, MEASURED, NOT-FIXED-THIS-ROUND GAP ***");
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
    for (const op of ["union", "subtract", "intersect"]) {
        const r = meshBoolean(bufA, bvhA, bufB, bvhB, op);
        const got = M.volume(wrapAsPolys(r.tris));
        console.log("  KNOWN  degenerate-operand " + op + "   expected " + expected[op] + " got " + got +
            " (baseline " + measuredBaseline[op] + ") -- zero-volume-operand gap, not fixed this round");
        // Bound to the exact measured baseline (float64-exact reproduction expected, since this is a fully
        // deterministic fixture) rather than a percentage -- this is a regression trip-wire on THIS EXACT
        // number, not a claim that the number itself is acceptable.
        ok("!! degenerate-operand " + op + " matches the exact measured baseline (regression trip-wire, NOT a correctness claim -- see meshBoolean.mjs's own header)",
            close(got, measuredBaseline[op], 1e-9), "got " + got + " baseline " + measuredBaseline[op]);
    }
    ok("!! ...and confirms the wrong-SIGN symptom specifically: subtract of a zero-volume operand yields a NEGATIVE volume (mathematically impossible for a real subtract result)",
        (() => { const r = meshBoolean(bufA, bvhA, bufB, bvhB, "subtract"); return M.volume(wrapAsPolys(r.tris)) < 0; })(),
        "confirms the review's own headline finding, not merely a magnitude error");
}

console.log(`\nmeshBoolean-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: only `subtract` is required to pass this gate on axis-aligned " +
    "box fixtures (per this round's own scope decision, see meshBoolean.mjs's own header) -- `union` and " +
    "`intersect` are exercised in sections 4, 7, and 12 but not with the same fixture-count depth as subtract's " +
    "own sections 1/2/8/9. A SECOND adversarial review (run after the first fix pass) found and this file's " +
    "own fixes address: (a) an unrecognized `op` silently returned an empty mesh with no error -- FIXED, gated " +
    "in section 12; (b) a DEGENERATE (zero-volume) operand embedded in the other mesh's interior yields a " +
    "wrong-SIGN volume error -- a NEW manifestation of the same root cause as the touching-contact gap below, " +
    "NOT fixed, reproduced with exact numbers in section 13 as a regression trip-wire (not a correctness " +
    "claim); (c) the original sabotage log's entry A wrongly claimed section 3 catches that sabotage -- " +
    "CORRECTED after re-measuring (section 3 hand-derives its own flip independent of bKeepAndFlip and provides " +
    "no regression coverage for the real flip decision, an honest gap named in the corrected log rather than " +
    "silently left standing); (d) section 8's shared 2%-relative known-gap bound gave uneven regression " +
    "headroom across its 3 cases -- FIXED, each case now bounded at 2.5x its own measured baseline; (e) " +
    "stats.capped propagation was only exercised on the always-false path -- FIXED, section 8 now forces it " +
    "true via a deliberately tiny maxFragments and asserts it surfaces correctly. The TOUCHING/ZERO-VOLUME-" +
    "CONTACT gap (section 8's 3 KNOWN cases) is measured and bounded, not fixed -- root-cause TRACED precisely " +
    "during this round's own follow-up fix pass (an earlier version of this header guessed wrong and was " +
    "corrected after actually instrumenting it): every triangle of both meshes takes the empty-candidate " +
    "shortcut because a sub-ULP floating-point gap in boxPolys's own c-h subtraction makes pairOverlap() find " +
    "zero true AABB-overlapping candidates between the \"flush\" faces, so whole, unsplit, face-sized " +
    "triangles get classified directly -- correctly flagged ambiguous by pointInMesh, but the keep-ambiguous " +
    "policy has no size awareness, so a kept whole face-sized triangle distorts volume proportional to its " +
    "own area. The A-vs-B SEAM NON-COINCIDENCE gap " +
    "(section 11) is inherited from triFragmentAccumulate.mjs's own independent-representative-plane design, " +
    "not introduced here, and is gated as a non-regression baseline, not a correctness claim -- true edge-exact " +
    "watertightness needs either a meshCSG.mjs-style snap/merge/weld subsystem or a redesign computing each " +
    "tri-tri boundary once (round 2's triTriIntersect.mjs) and sharing it symmetrically into both meshes' own " +
    "fragment sets, neither attempted this round. Every ROUND 4/5 residual risk this file's own header " +
    "inherits (meshPointClassify's ~1e-9 thin-feature weld risk; triFragmentAccumulate's near-duplicate-plane " +
    "sliver cascade and maxFragments starvation) applies unchanged here and is not re-gated in this file -- see " +
    "those files' own gates. Non-box, non-axis-aligned fixtures are not covered. Performance at realistic " +
    "mesh sizes (many triangles per mesh, not two 12-triangle boxes) is not measured here. A formal CSG " +
    "property-list audit comparable to meshCSG-selfcheck.mjs's own is tools/ship/nextRounds.mjs backlog item " +
    "#25, for the EXISTING BSP path, and has not happened yet either -- this round does not attempt an " +
    "equivalent audit for the new path.");
process.exit(fails ? 1 : 0);
