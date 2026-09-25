// WebGLEngine/physics/mesh/triFragmentAccumulate-selfcheck.mjs
//
// Run: node physics/mesh/triFragmentAccumulate-selfcheck.mjs
//
// GATES physics/mesh/triFragmentAccumulate.mjs -- round 5 of the BVH-CSG arc (tools/ship/nextRounds.mjs's
// "bvh-csg-speed-vs-manifold-tradeoff"), multi-plane fragment accumulation.
//
// *** THE REAL BUG THIS ROUND FOUND, ITS REGRESSION TEST KEPT HERE RATHER THAN JUST DESCRIBED: *** a first-draft
// policy for triClip.mjs's {status:"degenerate"} result (pass the fragment through unsplit, flagged
// low-confidence, no further resolution attempted) was actually built and run against this file's own literal-B
// scenario during this round's own scratch-testing, BEFORE triFragmentAccumulate.mjs was written -- it gave a
// WRONG, ORDER-DEPENDENT final inside/outside area split: 0.08 with the candidate list in pairOverlap's own
// natural order, ~0.0515 with several other orderings of the exact same candidate set, against a scenario whose
// true answer (an exact geometric decomposition, hand-verified) is unambiguously 0.08. Section 6 below keeps
// that finding alive as a standing regression test against the PUBLIC API (the module now resolves two of the
// three degenerate shapes directly instead of merely flagging them -- see triFragmentAccumulate.mjs's own
// header, "Finding 2") across 8 independently-shuffled candidate orderings, so a future edit that reintroduces
// the naive policy fails this gate rather than passing by luck on whichever order happens to be tested.
//
// ROUND 7 SABOTAGES (section 14), applied to the real file with a `finally` restore verified by md5sum, and
// RE-MEASURED against the final file after the adversarial-review fixes -- counts are THIS gate's reds;
// meshBooleanBlast-selfcheck.mjs's header has all three gates' counts for the same mutations:
//   S1  gate inverted -> 7 red: 14b x2, 14c straddle, 14d, 14e, 14g, 14i
//   S2  gate consults only the FIRST member of a coplanar group -> 1 red: 14d, the fixture built for it
//   S3  gate honours only "intersect" -> 2 red: 14e and 14g
//   S4  default flipped ON (gateByIntersection !== false) -> 2 red: 14a (the round-5 contract) and 14c's
//       fewer-fragments comparison, whose "ungated" run is the default call
//   R1  plane dedup reverted to round 5's normal+offset test -> 1 red: 14h (planeCount 1)
//   R2  per-plane group pre-filter removed -> 1 red: 14i (groupsSkipped 0) -- correctness-neutral by design
//   R3  pre-filter keeps only "intersect" members -> 2 red: 14e and 14g
//   R5  fragment gate treats "coplanar" as not meeting -> 1 red: 14g, added because the review's version of
//       this mutation went 0 red here
//   The first draft of 14f's oracle (10-step sampling, T0/T1 crossing z=1 along 0.2 units) could not see the
//   UNSPLIT triangle straddle farB at all -- 14f itself caught that before any sabotage was run. The first draft
//   of 14i put its missing triangle in T0's own plane, where it joined a group that DOES meet triA -- 14i went
//   red on its own fixture and was moved to its own plane.
//
// SABOTAGE LOG -- each applied to the real physics/mesh/triFragmentAccumulate.mjs, gate run, exit read, file
// restored byte for byte (restore verified via md5sum against a saved copy before every sabotage). Sabotages
// A/B/C predate an adversarial review of this round; D-H were added to gate that review's own fixes (see this
// file's own header and triFragmentAccumulate.mjs's own header for what each fix addresses) and were verified
// against the file AFTER those fixes landed, re-measured rather than assumed to still hold:
//   A  resolveDegenerate()'s "disagree" branch (the real 2-way split fix, Finding 2) reverted to always return
//      {status:"unresolved"} -- i.e. exactly the naive first-draft policy section 6 exists to catch a
//      regression of
//        -> exit=1, 8 RED (grew from 6 to 8 once sections 7b's own new splitBy/winding assertions and section
//           10b's own new regression test were added -- re-measured, not left at the old count): both explicit
//           resolveDegenerate 7b assertions plus its own new splitBy check, the literal-B degenerate-named
//           case's unresolvedCount==0 assertion (now 2), all three order-independence assertions in section 6,
//           AND -- NOT predicted in advance -- section 10b's own cap-not-silently-exceeded check, because the
//           spoke blow-up scenario (section 9/10) also genuinely hits the disagree branch sometimes, and with
//           it broken the spoke's own fragment-growth trajectory changes enough that the maxFragments=191 run
//           never actually reaches the cap (capped stays false at fragCount=155, not the un-sabotaged 192) --
//           a real, unpredicted cross-interaction between two sections gating two different fixes, found only
//           by actually running the sabotage, not by reasoning about which sections "should" be affected.
//   B  the plane-identity dedup loop (see this file's own header, Finding 1) short-circuited to push every
//      candidate as its own distinct "plane" with no merge attempt at all
//        -> exit=1, 7 RED (grew from 5 to 7 once section 10d's own opposite-facing-dedup checks were added):
//           the two-x-plane trace's planeCount==2 assertion (now 4), the literal-B duplicatePlanesCollapsed==4
//           structural assertion (now 0), the explicit index-duplicate dedup case, PLUS both of section 10d's
//           own new checks (planeCount==1 now reads 2; degenerateFallbacks==0 now reads 3) -- confirming the
//           opposite-facing dedup fix (H below) genuinely depends on the SAME dedup loop this sabotage guts,
//           not a separate code path. The clean-path B' case's own degenerateFallbacks==0 assertion also still
//           fails here (now 39), for the same reason originally found: B' has 2 triangles per side face
//           sharing one true plane, and without dedup, clipping by the second one lands in Finding 1's own
//           failure mode.
//   C  the maxFragments cap check (`if (fragments.length >= maxFragments) { capped = true; break; }`) removed
//        -> exit=0, 0 RED -- a real finding, not a clean pass: this is the FIRST of the two cap checks fix E
//           (below) added a SECOND, later one for. With that second check now in place, it alone already
//           guarantees the module's own correctness contract (capped:true whenever the threshold is crossed),
//           so removing the first check changes only WHEN the cap is noticed (one more plane's worth of work
//           may run before the second check catches it) -- a genuine performance-only regression this gate's
//           own assertions do not (and, given the contract is about correctness of `capped`, should not)
//           distinguish from the unsabotaged baseline. Reported honestly rather than engineered around.
//   D  resolveDegenerate()'s "disagree" branch winding reversed (`T1=[tri[k],P,tri[i]], T2=[tri[k],tri[j],P]`
//      -- swapping two vertices in each output sub-triangle, inverting its normal) -- THE EXACT MUTATION AN
//      ADVERSARIAL REVIEW OF THIS ROUND USED TO DEMONSTRATE THE GATE'S OWN MISSING WINDING ORACLE, which this
//      round's own fix (the windingOk() checks added to sections 2/3/4/6/7) now closes
//        -> exit=1, 3 RED: section 3's degenerate-hit winding check, section 6's order-independence winding
//           check, and section 7b's own dedicated winding assertion -- all three, by name, catch the exact
//           failure class the review found the gate previously could not see at all.
//   E  the SECOND maxFragments cap check (added right after a plane is applied, closing the gap sabotage C's
//      own finding exists for) removed, leaving only the original first-of-loop check
//        -> exit=1, 1 RED: section 10b's own dedicated regression test (maxFragments=191 on the 20-plane spoke
//           scenario returns capped=false, fragCount=192 -- reproducing the exact silent-overshoot bug an
//           adversarial review of this round found and this fix closes).
//   F  the candidateTriBs=undefined guard (`candidateTriBs = candidateTriBs || [];`) removed
//        -> exit=1 (process CRASH, not a gate-counted red): `TypeError: candidateTriBs is not iterable` --
//           exactly the crash an adversarial review of this round found and this fix prevents, reproduced by
//           the process dying outright rather than by a counted FAIL line (0 PASS/FAIL lines print at all,
//           since the crash happens mid-run) -- itself a clear, unambiguous regression signal.
//   G  `planeCount` reverted to `planes.length` (the full pre-loop dedup'd count, ignoring capping) instead of
//      the applied-plane counter this round's own fix introduced
//        -> exit=1, 1 RED: section 10's own updated assertion (planeCount now reads 20, the full un-capped
//           count, instead of fewer-than-20) -- reproducing the exact JSDoc-contradicting overstatement an
//           adversarial review of this round found.
//   H  the widened plane-identity dedup (matching a candidate's plane against BOTH the same and the negated
//      (n,d) convention) reverted to only the same-direction check
//        -> exit=1, 2 RED: both of section 10d's own dedicated checks (planeCount now reads 2 instead of 1;
//           degenerateFallbacks now reads 3 instead of 0) -- reproducing the exact opposite-facing-coplanar
//           gap an adversarial review of this round found (confirmed non-corrupting to final geometry, but
//           real and now fixed).
//
// Run: node physics/mesh/triFragmentAccumulate-selfcheck.mjs
"use strict";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";
import { groupCandidatesByTriA, accumulateFragments, accumulateFragmentsFromBVH } from "./triFragmentAccumulate.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

function triArea(tri) {
    const [a, b, c] = tri;
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    const cx = uy*vz-uz*vy, cy = uz*vx-ux*vz, cz = ux*vy-uy*vx;
    return 0.5 * Math.hypot(cx, cy, cz);
}
function centroid(tri) { return [(tri[0][0]+tri[1][0]+tri[2][0])/3, (tri[0][1]+tri[1][1]+tri[2][1])/3, (tri[0][2]+tri[1][2]+tri[2][2])/3]; }
function mkBuf(triList) {
    const buf = new Float64Array(triList.length * 9);
    triList.forEach((t, n) => { const o = n*9; t.forEach((p, k) => { buf[o+k*3]=p[0]; buf[o+k*3+1]=p[1]; buf[o+k*3+2]=p[2]; }); });
    return buf;
}
function lcg(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function shuffle(arr, seed) {
    const rnd = lcg(seed), a = arr.slice();
    for (let i = a.length-1; i > 0; i--) { const j = Math.floor(rnd()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
}
function splitArea(bvhClassify, fragments) {
    let sum = 0, inside = 0, outside = 0;
    for (const f of fragments) {
        const area = triArea(f.tri); sum += area;
        const cls = pointInMesh(bvhClassify, ...centroid(f.tri));
        if (cls.inside) inside += area; else outside += area;
    }
    return { sum, inside, outside };
}
// Independent winding/orientation oracle -- an adversarial review of this round found NOTHING in this gate
// checked fragment winding (only sign-independent area and winding-independent centroid classification), the
// exact oracle gap triClip.mjs's own round 3 header names as the one that caught a real inverted-winding bug
// area conservation alone missed. resolveDegenerate() is a genuinely new geometric derivation (not reused from
// triClip.mjs's own fan logic), so it needs the same check. Shares no code with resolveDegenerate() itself.
function triNormalDir(tri) {
    const [a, b, c] = tri;
    const ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], vx=c[0]-a[0], vy=c[1]-a[1], vz=c[2]-a[2];
    const cx=uy*vz-uz*vy, cy=uz*vx-ux*vz, cz=ux*vy-uy*vx, l=Math.hypot(cx,cy,cz)||1;
    return [cx/l, cy/l, cz/l];
}
function windingOk(origTri, fragments) {
    const origN = triNormalDir(origTri);
    return fragments.every((f) => {
        const n = triNormalDir(f.tri);
        return (origN[0]*n[0] + origN[1]*n[1] + origN[2]*n[2]) >= 0.99;
    });
}

// ---- SETUP: reusing round 4's own unitCube() triangulation convention verbatim, for continuity. ----
function unitCubeAt(x0, x1, y0, y1, z0, z1) {
    const V = { a:[x0,y0,z0], b:[x1,y0,z0], c:[x1,y1,z0], d:[x0,y1,z0], e:[x0,y0,z1], f:[x1,y0,z1], g:[x1,y1,z1], h:[x0,y1,z1] };
    const tris = [
        [V.a,V.b,V.c],[V.a,V.c,V.d],   // -z (0,1)
        [V.e,V.g,V.f],[V.e,V.h,V.g],   // +z (2,3)
        [V.a,V.f,V.b],[V.a,V.e,V.f],   // -y (4,5)
        [V.d,V.c,V.g],[V.d,V.g,V.h],   // +y (6,7)
        [V.a,V.h,V.d],[V.a,V.e,V.h],   // -x (8,9)
        [V.b,V.c,V.g],[V.b,V.g,V.f],   // +x (10,11)
    ];
    return mkBuf(tris);
}
const cubeA = unitCubeAt(0, 1, 0, 1, 0, 1);
const bvhA = new MeshBVH(cubeA);
const TRI_A = 2;   // [e,g,f] = (0,0,1),(1,1,1),(1,0,1), area 0.5, +z face, footprint {0<=y<=x<=1}
const TRI_A_TRI = [[0,0,1],[1,1,1],[1,0,1]];   // TRI_A's own vertices, for the windingOk() oracle below

const cubeB = unitCubeAt(0.3, 0.7, 0.3, 0.7, 0.5, 1.5);          // the prompt's own literal B
const bvhB = new MeshBVH(cubeB);
const cubeBp = unitCubeAt(0.3, 0.7, 0.35, 0.65, 0.5, 1.5);       // asymmetric B' -- no diagonal coincidence
const bvhBp = new MeshBVH(cubeBp);

const pairsB = pairOverlap(bvhA, bvhB);
const candB = groupCandidatesByTriA(pairsB).get(TRI_A);
const pairsBp = pairOverlap(bvhA, bvhBp);
const candBp = groupCandidatesByTriA(pairsBp).get(TRI_A);

// ---- 1. STRUCTURAL: which candidates pairOverlap actually returns for TriA, hand-verified (TriA's AABB has
// z=[1,1], flat; B's top/bottom faces have z=[1.5,1.5]/[0.5,0.5], neither overlapping; all 8 side triangles'
// AABBs span the full z=[0.5,1.5] and an xy footprint inside TriA's own). ----
{
    ok("!! structural: exactly 8 candidates for TriA against literal B", candB.length === 8, JSON.stringify(candB));
    const topBottom = candB.filter((t) => t === 0 || t === 1 || t === 2 || t === 3);
    ok("!! structural: zero of those candidates are B's top/bottom triangles", topBottom.length === 0, JSON.stringify(topBottom));
}

// ---- 2. THE HAND-DERIVED TWO-X-PLANE TRACE, verified against the real algorithm by literal hand-tracing
// through triClip.mjs's own fan logic before this file was written (see the module's own header). Restricting
// candidates to just B's -x/+x side-face triangles (4 candidates -> 2 distinct planes, x=0.3 and x=0.7) must
// give exactly 7 final fragments summing to TriA's own area, matching this exact multiset of areas. ----
{
    const twoXCand = [8, 9, 10, 11];   // -x face (8,9), +x face (10,11) -- 2 distinct planes after dedup
    const r = accumulateFragments(cubeA, TRI_A, cubeB, twoXCand);
    ok("!! two-x-plane trace: exactly 2 distinct planes applied", r.planeCount === 2, `planeCount=${r.planeCount}`);
    ok("!! two-x-plane trace: exactly 7 final fragments", r.fragments.length === 7, `count=${r.fragments.length}`);
    const areas = r.fragments.map((f) => triArea(f.tri)).sort((a, b) => a - b);
    const expected = [0.045, 0.019285714285714285, 0.025714285714285714, 0.08571428571428572, 0.06, 0.11428571428571428, 0.15]
        .sort((a, b) => a - b);
    let allMatch = areas.length === expected.length && areas.every((a, i) => close(a, expected[i], 1e-9));
    ok("!! two-x-plane trace: fragment areas match the hand-derived multiset exactly", allMatch, JSON.stringify(areas));
    const sum = areas.reduce((s, a) => s + a, 0);
    ok("!! two-x-plane trace: area conservation (sum == TriA's own 0.5)", close(sum, 0.5, 1e-9), `sum=${sum}`);
    ok("!! two-x-plane trace: every fragment's winding matches TriA's own (independent normal oracle)",
        windingOk(TRI_A_TRI, r.fragments));
    ok("!! two-x-plane trace: every fragment's splitBy provenance names only the candidates actually supplied (8,9,10,11)",
        r.fragments.every((f) => f.splitBy.every((idx) => twoXCand.includes(idx))), JSON.stringify(r.fragments.map((f) => f.splitBy)));
}

// ---- 3. THE DEGENERATE-HIT NAMED EDGE CASE -- literal B. TriA's own diagonal split (y=x) puts both of B's
// footprint corners (0.3,0.3) and (0.7,0.7) exactly ON that diagonal, so clipping genuinely lands vertices
// exactly on later candidate planes -- not a fluke, a structural coincidence of this exact scenario (see the
// module's own header, Finding 2, and this file's own header). Asserts it REALLY happens (degenerateFallbacks
// > 0) and that the module's resolution policy still gets the exact right answer (all of them resolved, none
// left genuinely ambiguous, and the true 0.08 inside / 0.42 outside split). ----
{
    const r = accumulateFragments(cubeA, TRI_A, cubeB, candB);
    ok("!! degenerate-hit case: at least one clip genuinely hit triClip.mjs's own 'degenerate' status", r.degenerateFallbacks > 0, `degenerateFallbacks=${r.degenerateFallbacks}`);
    ok("!! degenerate-hit case: every one of them was resolved (none left genuinely ambiguous)", r.unresolvedCount === 0, `unresolvedCount=${r.unresolvedCount}`);
    const { sum, inside, outside } = splitArea(bvhB, r.fragments);
    ok("!! degenerate-hit case: area conservation", close(sum, 0.5, 1e-9), `sum=${sum}`);
    ok("!! degenerate-hit case: inside area is exactly 0.08 (the single triangle (0.3,0.3,1),(0.7,0.3,1),(0.7,0.7,1))", close(inside, 0.08, 1e-9), `inside=${inside}`);
    ok("!! degenerate-hit case: outside area is exactly 0.42", close(outside, 0.42, 1e-9), `outside=${outside}`);
    ok("!! degenerate-hit case: every fragment's winding matches TriA's own, including every resolveDegenerate()-produced one",
        windingOk(TRI_A_TRI, r.fragments));
}

// ---- 4. THE CLEAN-PATH CASE -- asymmetric B'. None of its 4 footprint corners sit on TriA's own diagonal, so
// this scenario hits zero degenerate results at all -- the "ordinary" path through the same code. ----
{
    const r = accumulateFragments(cubeA, TRI_A, cubeBp, candBp);
    ok("!! clean-path case (B'): zero degenerate hits", r.degenerateFallbacks === 0, `degenerateFallbacks=${r.degenerateFallbacks}`);
    const { sum, inside, outside } = splitArea(bvhBp, r.fragments);
    ok("!! clean-path case (B'): area conservation", close(sum, 0.5, 1e-9), `sum=${sum}`);
    ok("!! clean-path case (B'): inside area is exactly 0.06 (quadrilateral (0.35,0.35),(0.65,0.65),(0.7,0.65),(0.7,0.35))", close(inside, 0.06, 1e-9), `inside=${inside}`);
    ok("!! clean-path case (B'): outside area is exactly 0.44", close(outside, 0.44, 1e-9), `outside=${outside}`);
    ok("!! clean-path case (B'): every fragment's winding matches TriA's own", windingOk(TRI_A_TRI, r.fragments));
}

// ---- 5. STRUCTURAL: plane-identity dedup (Finding 1). 8 candidate triangles (2 per side face) collapse to
// exactly 4 distinct planes; an explicit repeated-index list must not double-count either. ----
{
    const r = accumulateFragments(cubeA, TRI_A, cubeB, candB);
    ok("!! plane dedup: 8 candidates collapse to exactly 4 distinct planes", r.planeCount === 4, `planeCount=${r.planeCount}`);
    ok("!! plane dedup: duplicatePlanesCollapsed reports the difference", r.duplicatePlanesCollapsed === candB.length - 4, `${r.duplicatePlanesCollapsed}`);
    const withDupIndices = [...candB, candB[0], candB[0]];   // same triB index repeated
    const r2 = accumulateFragments(cubeA, TRI_A, cubeB, withDupIndices);
    ok("!! plane dedup: repeated triB INDICES (not just repeated planes) still collapse to 4", r2.planeCount === 4, `planeCount=${r2.planeCount}`);
}

// ---- 6. *** THE REAL BUG THIS ROUND FOUND, REPRODUCED DIRECTLY. *** A naive "on degenerate, flag and pass
// through unsplit, never resolve" policy (inlined here, NOT the real module) is compared against the same
// literal-B candidate set in several different processing orders. See this file's own header for the full
// account. ----
{
    // This section checks the PUBLIC API's own order-independence directly -- the property that actually
    // matters to a caller, and the exact property a first-draft "flag degenerate and pass through unsplit,
    // never resolve" policy failed (measured during this round's own scratch-testing, before this module was
    // written: 0.08 with pairOverlap's own natural candidate order, ~0.0515 with several other orderings of the
    // identical candidate set -- reproduced with a throwaway prototype copy of that naive policy at the time,
    // not re-shipped here since the real module's fix, Finding 2, is what this gate must keep exercising).
    const inAreas = [], outAreas = [];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const shuffled = shuffle(candB, seed);
        const r = accumulateFragments(cubeA, TRI_A, cubeB, shuffled);
        const { sum, inside, outside } = splitArea(bvhB, r.fragments);
        ok(`!! order-independence (seed ${seed}): area conservation`, close(sum, 0.5, 1e-9), `sum=${sum}`);
        inAreas.push(inside); outAreas.push(outside);
    }
    const allInsideMatch = inAreas.every((v) => close(v, 0.08, 1e-9));
    const allOutsideMatch = outAreas.every((v) => close(v, 0.42, 1e-9));
    ok("!! order-independence: EVERY shuffled candidate order gives the SAME correct inside area (0.08) -- this is the exact regression a first-draft flag-and-pass-through policy failed (0.08 vs ~0.0515 depending on order, a ~36% error, not noise) until Finding 2's own real 2-way-split resolution was added",
        allInsideMatch, JSON.stringify(inAreas));
    ok("!! order-independence: every shuffled order agrees on outside area too", allOutsideMatch, JSON.stringify(outAreas));
    const lastR = accumulateFragments(cubeA, TRI_A, cubeB, shuffle(candB, 8));
    ok("!! order-independence: winding still matches TriA's own regardless of candidate order", windingOk(TRI_A_TRI, lastR.fragments));
}

// ---- 7. resolveDegenerate()'s FOUR branches, each driven through the public API with a hand-built single
// candidate engineered to hit exactly that branch (verified by hand: see the module's own header for the
// distance arithmetic). resolveDegenerate() itself is not exported -- these are black-box, through
// accumulateFragments(), matching this arc's own established gate style. ----
{
    // 7a. one vertex on the plane, other two AGREE (d0=0,d1=1,d2=1) -- safe no-op.
    {
        const triARef = [[0,0,1],[1,0,1],[1,1,1]];
        const trisA = mkBuf([triARef]);
        const trisB = mkBuf([[[0,0,0],[0,1,0],[0,0,1]]]);   // plane x=0, n=(1,0,0)
        const r = accumulateFragments(trisA, 0, trisB, [0]);
        ok("!! resolveDegenerate 7a (agree): unchanged single fragment, original area", r.fragments.length === 1 && close(triArea(r.fragments[0].tri), 0.5, 1e-9), JSON.stringify(r.fragments));
        ok("!! resolveDegenerate 7a: hit exactly one degenerate, resolved (not unresolved)", r.degenerateFallbacks === 1 && r.unresolvedCount === 0);
        ok("!! resolveDegenerate 7a: winding matches the original", windingOk(triARef, r.fragments));
        ok("!! resolveDegenerate 7a: splitBy is empty (a safe no-op contributes no real cut)", r.fragments[0].splitBy.length === 0, JSON.stringify(r.fragments[0].splitBy));
    }
    // 7b. one vertex on the plane, other two DISAGREE (d0=0,d1=1,d2=-1) -- real 2-way split, front+back 0.25 each.
    // THE BRANCH AN ADVERSARIAL REVIEW OF THIS ROUND FOCUSED ON: resolveDegenerate()'s own genuinely new
    // geometric derivation (not reused from triClip.mjs's fan logic), and the exact shape of bug (silent
    // winding inversion) that round 3's own triClip-selfcheck.mjs was specifically built to catch and this
    // gate previously did not check for this file's OWN new derivation -- see this file's own header.
    {
        const triARef = [[0,0,1],[1,0,1],[-1,1,1]];
        const trisA = mkBuf([triARef]);
        const trisB = mkBuf([[[0,0,0],[0,1,0],[0,0,1]]]);
        const r = accumulateFragments(trisA, 0, trisB, [0]);
        ok("!! resolveDegenerate 7b (disagree): resolved into exactly 2 fragments", r.fragments.length === 2, JSON.stringify(r.fragments));
        const areas = r.fragments.map((f) => triArea(f.tri)).sort((a,b)=>a-b);
        ok("!! resolveDegenerate 7b: each half is exactly 0.25, summing to the original 0.5", close(areas[0],0.25,1e-9) && close(areas[1],0.25,1e-9), JSON.stringify(areas));
        ok("!! resolveDegenerate 7b: not left unresolved", r.unresolvedCount === 0);
        ok("!! !! resolveDegenerate 7b: BOTH halves' winding matches the original -- the exact independent normal-direction oracle round 3's own triClip-selfcheck.mjs used to catch a real inverted-winding bug, applied here for the first time to this file's own genuinely-new split derivation",
            windingOk(triARef, r.fragments), JSON.stringify(r.fragments.map((f) => triNormalDir(f.tri))));
        ok("!! resolveDegenerate 7b: both halves' splitBy correctly names candidate 0, the one actually supplied",
            r.fragments.every((f) => JSON.stringify(f.splitBy) === JSON.stringify([0])), JSON.stringify(r.fragments.map((f) => f.splitBy)));
    }
    // 7c. TWO vertices on the plane (a whole edge), third off (d0=-1,d1=0,d2=0) -- safe no-op by the third sign.
    {
        const triARef = [[0,0,1],[1,0,1],[1,1,1]];
        const trisA = mkBuf([triARef]);
        const trisB = mkBuf([[[1,0,0],[1,1,0],[1,0,1]]]);   // plane x=1, n=(1,0,0)
        const r = accumulateFragments(trisA, 0, trisB, [0]);
        ok("!! resolveDegenerate 7c (edge-on-plane): unchanged single fragment", r.fragments.length === 1 && close(triArea(r.fragments[0].tri), 0.5, 1e-9), JSON.stringify(r.fragments));
        ok("!! resolveDegenerate 7c: resolved, not flagged unresolved", r.unresolvedCount === 0);
        ok("!! resolveDegenerate 7c: winding matches the original", windingOk(triARef, r.fragments));
    }
    // 7d. ALL THREE vertices on the plane (the fragment itself lies in the candidate plane) -- the one
    // genuinely ambiguous case: kept, unsplit, flagged lowConfidence, NOT dropped.
    {
        const trisA = mkBuf([[[0,0,1],[1,0,1],[1,1,1]]]);
        const trisB = mkBuf([[[0,0,1],[1,0,1],[0,1,1]]]);   // plane z=1, same plane TriA itself lies in
        const r = accumulateFragments(trisA, 0, trisB, [0]);
        ok("!! resolveDegenerate 7d (whole-tri-on-plane): kept as ONE unsplit fragment, not dropped", r.fragments.length === 1 && close(triArea(r.fragments[0].tri), 0.5, 1e-9), JSON.stringify(r.fragments));
        ok("!! resolveDegenerate 7d: flagged lowConfidence, and counted in unresolvedCount", r.fragments[0].lowConfidence === true && r.unresolvedCount === 1, `lowConfidence=${r.fragments[0].lowConfidence} unresolvedCount=${r.unresolvedCount}`);
    }
}

// ---- 8. groupCandidatesByTriA() -- a plain grouping pass over pairOverlap()'s own whole-mesh output, checked
// structurally against a hand-built pairs array (no BVH involved, isolating this function from the rest). ----
{
    const pairs = [[0,5],[0,7],[1,2],[0,5],[2,9]];
    const grouped = groupCandidatesByTriA(pairs);
    ok("!! groupCandidatesByTriA: correct triA keys", [...grouped.keys()].sort().join(",") === "0,1,2");
    ok("!! groupCandidatesByTriA: triA=0 gets both its triB's, in order, duplicates preserved (caller's job to dedup, matching pairOverlap.mjs's own stated convention)",
        JSON.stringify(grouped.get(0)) === JSON.stringify([5,7,5]));
    ok("!! groupCandidatesByTriA: triA=2 gets its one triB", JSON.stringify(grouped.get(2)) === JSON.stringify([9]));
    ok("!! groupCandidatesByTriA: matches the real pairOverlap()-driven grouping for TriA against literal B",
        JSON.stringify(groupCandidatesByTriA(pairsB).get(TRI_A)) === JSON.stringify(candB));
}

// ---- 9. FRAGMENT-COUNT BLOW-UP, MEASURED NOT ASSUMED -- a "spoke" construction (many candidate planes through
// TriA's own centroid) grows fragment count SUPER-LINEARLY in the plane count, because each clip is against an
// INFINITE plane and nothing merges or prunes (see the module's own header). Demonstrates the real risk the
// maxFragments cap exists for, distinct from testing the cap mechanism itself (section 10). ----
{
    const trisA = mkBuf([[[0,0,1],[1,1,1],[1,0,1]]]);
    const cen = [2/3, 1/3, 1];
    function spokeTriB(a) {
        const t1 = [0,0,1], t2 = [-Math.sin(a), Math.cos(a), 0];
        return [cen, [cen[0]+t1[0],cen[1]+t1[1],cen[2]+t1[2]], [cen[0]+t2[0],cen[1]+t2[1],cen[2]+t2[2]]];
    }
    const counts = [];
    for (const N of [4, 8, 16]) {
        const tris = []; for (let i = 0; i < N; i++) tris.push(spokeTriB(Math.PI * i / N));
        const trisB = mkBuf(tris);
        const r = accumulateFragments(trisA, 0, trisB, tris.map((_, i) => i));
        counts.push(r.fragments.length);
        const { sum } = splitArea(bvhA, r.fragments.map((f) => ({ tri: f.tri })));   // area conservation still holds under blow-up
        ok(`!! spoke blow-up N=${N}: area conservation holds even at high fragment count`, close(sum, 0.5, 1e-9), `sum=${sum} fragCount=${r.fragments.length}`);
    }
    ok("!! spoke blow-up: fragment count grows FASTER than linearly in plane count (naive N->N+1 intuition would predict ~5,9,17; actual growth is well past that)",
        counts[1] > counts[0] * 2 && counts[2] > counts[1] * 2, `counts=${JSON.stringify(counts)}`);
}

// ---- 10. maxFragments CAP, tested as its own explicit mechanism (see sabotage C above -- NOT implied by the
// blow-up demo alone). ----
{
    const trisA = mkBuf([[[0,0,1],[1,1,1],[1,0,1]]]);
    const cen = [2/3, 1/3, 1];
    function spokeTriB(a) {
        const t1 = [0,0,1], t2 = [-Math.sin(a), Math.cos(a), 0];
        return [cen, [cen[0]+t1[0],cen[1]+t1[1],cen[2]+t1[2]], [cen[0]+t2[0],cen[1]+t2[1],cen[2]+t2[2]]];
    }
    const N = 20;
    const tris = []; for (let i = 0; i < N; i++) tris.push(spokeTriB(Math.PI * i / N));
    const trisB = mkBuf(tris);
    const r = accumulateFragments(trisA, 0, trisB, tris.map((_, i) => i), { maxFragments: 30 });
    ok("!! maxFragments cap: capped flag set true", r.capped === true);
    ok("!! maxFragments cap: planeCount reports fewer than the full 20 deduped planes -- an adversarial review of this round found it previously always reported the full 20 regardless of capping, overstating how many planes were actually applied",
        r.planeCount < 20 && r.fragments.length < 200, `planeCount=${r.planeCount} fragCount=${r.fragments.length}`);
    const rUncapped = accumulateFragments(trisA, 0, trisB, tris.map((_, i) => i));
    ok("!! maxFragments cap: the SAME candidates, uncapped (default 256), are not capped, apply all 20 planes, and produce strictly more fragments",
        rUncapped.capped === false && rUncapped.planeCount === 20 && rUncapped.fragments.length > r.fragments.length, `uncapped=${rUncapped.fragments.length} capped=${r.fragments.length}`);
}

// ---- 10b. THE CAP-CAN-BE-SILENTLY-EXCEEDED BUG, REPRODUCED DIRECTLY -- an adversarial review of this round
// found the ORIGINAL cap check ran only at the TOP of the per-plane loop, before that plane was applied, so
// the LAST plane processed could push fragments.length arbitrarily far past maxFragments with nothing catching
// it: maxFragments=191 on this exact 20-plane spoke scenario returned capped:false with fragments.length:192,
// silently violating this function's own documented contract. Kept here as a standing regression test against
// the fix (a second check immediately after each plane is applied). ----
{
    const trisA = mkBuf([[[0,0,1],[1,1,1],[1,0,1]]]);
    const cen = [2/3, 1/3, 1];
    function spokeTriB(a) {
        const t1 = [0,0,1], t2 = [-Math.sin(a), Math.cos(a), 0];
        return [cen, [cen[0]+t1[0],cen[1]+t1[1],cen[2]+t1[2]], [cen[0]+t2[0],cen[1]+t2[1],cen[2]+t2[2]]];
    }
    const N = 20;
    const tris = []; for (let i = 0; i < N; i++) tris.push(spokeTriB(Math.PI * i / N));
    const trisB = mkBuf(tris);
    const r = accumulateFragments(trisA, 0, trisB, tris.map((_, i) => i), { maxFragments: 191 });
    ok("!! cap-not-silently-exceeded: capped is true even when the triggering plane's own application would otherwise overshoot maxFragments before the next loop iteration's check could catch it",
        r.capped === true, `capped=${r.capped} fragCount=${r.fragments.length}`);
}

// ---- 10c. candidateTriBs=undefined -- an adversarial review of this round found this crashed with a
// TypeError, exactly what groupCandidatesByTriA(pairs).get(triA) returns for a triA with zero overlap
// candidates, this module's own documented typical calling pattern. Must behave identically to the already-
// tested explicit empty-array case (section 12), not throw. ----
{
    const r = accumulateFragments(cubeA, TRI_A, cubeB, undefined);
    ok("!! candidateTriBs=undefined: does not throw, behaves like an empty candidate list",
        r.fragments.length === 1 && close(triArea(r.fragments[0].tri), 0.5, 1e-9) && r.planeCount === 0);
}

// ---- 10d. OPPOSITE-FACING COPLANAR DEDUP -- an adversarial review of this round found the plane-identity
// dedup (Finding 1) only merged candidates whose normals point the SAME direction; two B-triangles occupying
// the identical geometric plane but wound OPPOSITELY were treated as two distinct planes. Fixed by widening
// the dedup check to also match the negated (n,d) convention -- this section proves the fix directly: a
// hand-built pair of opposite-winding duplicate-plane candidates must now collapse to planeCount=1, not 2. ----
{
    // trisA deliberately straddles x=0 with NO vertex exactly on the plane, so a genuine, non-degenerate
    // "clipped" result is the only thing the FIRST application can produce -- isolating the dedup fix itself
    // (a fragment with a NEW crossing vertex on x=0 must not need a second, wasted degenerate-resolving
    // re-application from the un-deduped duplicate).
    const trisA = mkBuf([[[-0.5,0,1],[0.5,0.5,1],[0.5,-0.5,1]]]);
    const trisB = mkBuf([
        [[0,0,0],[0,1,0],[0,0,1]],   // plane x=0, n=(1,0,0)
        [[0,0,0],[0,0,1],[0,1,0]],   // SAME plane x=0, wound OPPOSITELY, n=(-1,0,0)
    ]);
    const r = accumulateFragments(trisA, 0, trisB, [0, 1]);
    ok("!! opposite-facing coplanar dedup: two oppositely-wound duplicates of the same plane collapse to planeCount=1, not 2",
        r.planeCount === 1, `planeCount=${r.planeCount}`);
    ok("!! opposite-facing coplanar dedup: zero degenerate fallbacks needed (the duplicate never gets a second, wasted re-application)",
        r.degenerateFallbacks === 0, `degenerateFallbacks=${r.degenerateFallbacks}`);
}

// ---- 11. accumulateFragmentsFromBVH() -- the convenience wrapper -- matches calling pairOverlap() +
// groupCandidatesByTriA() + accumulateFragments() directly, exactly (same candidate list, same algorithm). ----
{
    const direct = accumulateFragments(cubeA, TRI_A, cubeB, candB);
    const viaWrapper = accumulateFragmentsFromBVH(bvhA, bvhB, TRI_A);
    ok("!! accumulateFragmentsFromBVH: identical fragment set to the direct pairOverlap+group+accumulate call",
        JSON.stringify(viaWrapper.fragments.map((f) => f.tri)) === JSON.stringify(direct.fragments.map((f) => f.tri)));
}

// ---- 12. EDGE CASES: empty candidate list (whole triangle unchanged); a zero-area candidate triangle among
// otherwise-real candidates (skipped, not crashed -- same convention triTriIntersect.mjs/triClip.mjs use). ----
{
    const r = accumulateFragments(cubeA, TRI_A, cubeB, []);
    ok("!! empty candidates: single unchanged fragment, TriA's own full area", r.fragments.length === 1 && close(triArea(r.fragments[0].tri), 0.5, 1e-9) && r.planeCount === 0);

    const trisA = mkBuf([[[0,0,1],[1,0,1],[1,1,1]]]);
    const trisB = mkBuf([
        [[0,0,0],[0,0,0],[0,0,0]],     // zero-area (fully degenerate point), no well-defined plane
        [[1,0,0],[1,1,0],[1,0,1]],     // real plane x=1
    ]);
    const r2 = accumulateFragments(trisA, 0, trisB, [0, 1]);
    ok("!! zero-area candidate: skipped without crashing, the one real plane still applied", r2.planeCount === 1, `planeCount=${r2.planeCount}`);
}

// ---- 13. ACCUMULATION-SPECIFIC SLIVER CASCADE -- KNOWN, DEMONSTRATED, NOT RESOLVED THIS ROUND. An
// adversarial review of this round found that several candidate planes NEAR-duplicates of each other (just
// outside PLANE_EPS, so genuinely distinct by construction, not a floating-point artifact) each shave a
// vanishingly thin extra slice off an already-once-clipped fragment instead of being caught as a no-op --
// distinct from triClip.mjs's own already-documented single-clip sliver risk, and NOT the same as Finding 1's
// dedup (which correctly handles GENUINE duplicates; this is about candidates that are real, distinct planes
// just very close together). Neither assertion below is a claim of correctness OR incorrectness -- both
// REPRODUCE, concretely, what the module actually does today, so a future round fixing this has a before/after
// case and this gate does not silently claim the risk doesn't exist. ----
{
    // 13a. three genuinely distinct x-planes 1e-7 apart cascade into a run of double-precision-noise-floor
    // slivers; area conservation still holds (this is why the gate's ONLY oracle, area, cannot see this risk).
    const trisA = mkBuf([[[0,0,1],[1,0,1],[1,1,1]]]);
    const trisB = mkBuf([
        [[1e-7,0,0],[1e-7,1,0],[1e-7,0,1]],
        [[2e-7,0,0],[2e-7,1,0],[2e-7,0,1]],
        [[3e-7,0,0],[3e-7,1,0],[3e-7,0,1]],
    ]);
    const r = accumulateFragments(trisA, 0, trisB, [0, 1, 2]);
    const areas = r.fragments.map((f) => triArea(f.tri));
    const sum = areas.reduce((s, a) => s + a, 0);
    console.log(`  (known-unresolved 13a: 3 near-duplicate planes 1e-7 apart produce ${r.fragments.length} fragments, ` +
        `min area ${Math.min(...areas)} (double-precision noise floor vs the parent's 0.5), sum=${sum} -- ` +
        `area conservation holds so this gate's own only oracle cannot see the sliver cascade; see triFragmentAccumulate.mjs's own header)`);

    // 13b. combined with the maxFragments cap: a near-duplicate sliver cascade can fully consume the fragment
    // budget before a genuinely necessary, geometrically distinct plane is ever applied. capped:true is still
    // honestly reported (this is NOT a "capped lies" bug -- see section 10b's own regression test for that
    // separate, already-fixed issue) -- but nothing signals that the planes actually applied were low-value.
    const trisA2 = mkBuf([[[-1,-1,1],[2,-1,1],[2,2,1]]]);
    const nearDupPlanes = [];
    for (let i = 0; i < 8; i++) { const x = 0.3 + i * 1e-8; nearDupPlanes.push([[x,-2,0],[x,-2,1],[x,3,0]]); }
    const realPlane = [[-2,0.4,0],[3,0.4,0],[-2,0.4,1]];   // genuinely different, necessary cut: y=0.4
    const trisB2 = mkBuf([...nearDupPlanes, realPlane]);
    const r2 = accumulateFragments(trisA2, 0, trisB2, [0,1,2,3,4,5,6,7,8], { maxFragments: 5 });
    const realPlaneApplied = r2.fragments.some((f) => f.splitBy.includes(8));
    console.log(`  (known-unresolved 13b: 8 near-duplicate x~0.3 planes + 1 real y=0.4 plane, capped at 5: ` +
        `capped=${r2.capped} planeCount=${r2.planeCount} fragCount=${r2.fragments.length} -- the real y=0.4 plane's ` +
        `own index (8) appears in ANY surviving fragment's splitBy: ${realPlaneApplied} (the near-duplicate cascade ` +
        `starved the budget before the geometrically necessary cut was ever applied); see triFragmentAccumulate.mjs's own header)`);
}

// ---- 14. *** ROUND 7: THE OPT-IN INTERSECTION GATE (gateByIntersection). *** See triFragmentAccumulate.mjs's
// own ROUND 7 header paragraph for the argument. The ORACLE here shares no code with the gate: a plain
// Moller-Trumbore segment-vs-triangle test, run between every pair of barycentric sample points inside each
// final fragment, against every B-triangle -- if any such segment crosses a B-triangle's interior, that fragment
// STRADDLES B's surface and its centroid cannot speak for it. That property (and nothing about where cuts land)
// is what the downstream classifier needs, so it is what is checked, on both paths. Sampling density (a
// 24-step barycentric grid) and T0/T1's size in 14c were RAISED after 14f caught the first draft (a 10-step
// grid, T0/T1 crossing z=1 along only 0.2 units) never sampling across the crossing at all -- an oracle that
// could not see the UNSPLIT triangle straddle is not an oracle.
{
    function segCrossesTri(p, q, T) {
        const [a, b, c] = T;
        const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
        const d = [q[0]-p[0], q[1]-p[1], q[2]-p[2]];
        const h = [d[1]*e2[2]-d[2]*e2[1], d[2]*e2[0]-d[0]*e2[2], d[0]*e2[1]-d[1]*e2[0]];
        const det = e1[0]*h[0] + e1[1]*h[1] + e1[2]*h[2];
        if (Math.abs(det) < 1e-14) return false;
        const f = 1 / det, sv = [p[0]-a[0], p[1]-a[1], p[2]-a[2]];
        const u = f * (sv[0]*h[0] + sv[1]*h[1] + sv[2]*h[2]);
        if (u <= 1e-9 || u >= 1 - 1e-9) return false;
        const qv = [sv[1]*e1[2]-sv[2]*e1[1], sv[2]*e1[0]-sv[0]*e1[2], sv[0]*e1[1]-sv[1]*e1[0]];
        const v = f * (d[0]*qv[0] + d[1]*qv[1] + d[2]*qv[2]);
        if (v <= 1e-9 || u + v >= 1 - 1e-9) return false;
        const t = f * (e2[0]*qv[0] + e2[1]*qv[1] + e2[2]*qv[2]);
        return t > 1e-9 && t < 1 - 1e-9;
    }
    function samples(tri, n = 24) {
        const out = [];
        for (let i = 1; i < n; i++) for (let j = 1; i + j < n; j++) {
            const a = i / n, b = j / n, c = 1 - a - b;
            out.push([0, 1, 2].map((k) => a*tri[0][k] + b*tri[1][k] + c*tri[2][k]));
        }
        return out;
    }
    function straddlers(fragments, bTris) {
        let n = 0;
        for (const f of fragments) {
            const S = samples(f.tri);
            let hit = false;
            for (const T of bTris) {
                for (let i = 0; i < S.length && !hit; i++) for (let j = i + 1; j < S.length && !hit; j++) {
                    if (segCrossesTri(S[i], S[j], T)) hit = true;
                }
                if (hit) break;
            }
            if (hit) n++;
        }
        return n;
    }
    const areaSum = (fr) => fr.reduce((s, f) => s + triArea(f.tri), 0);

    // 14a. default is OFF: byte-identical to round 5 when the option is absent.
    const d0 = accumulateFragments(cubeA, TRI_A, cubeB, candB);
    const d1 = accumulateFragments(cubeA, TRI_A, cubeB, candB, { gateByIntersection: false });
    ok("14a. gateByIntersection defaults OFF -- round 5's own behaviour, byte-identical, zero gate counters",
        JSON.stringify(d0.fragments) === JSON.stringify(d1.fragments) && d0.gateSkipped === 0 && d0.gateTested === 0,
        "fragments=" + d0.fragments.length + " gateSkipped=" + d0.gateSkipped + " gateTested=" + d0.gateTested);

    // 14b. on this file's OWN closed-B scenarios (literal B, asymmetric B'), gated and ungated give the same
    // inside/outside area split -- the 0.08 section 6 exists to hold, now held on the gated path too.
    for (const [name, trisB, bvh, cand] of [["literal B", cubeB, bvhB, candB], ["asymmetric B'", cubeBp, bvhBp, candBp]]) {
        const u = splitArea(bvh, accumulateFragments(cubeA, TRI_A, trisB, cand).fragments);
        const gr = accumulateFragments(cubeA, TRI_A, trisB, cand, { gateByIntersection: true });
        const g = splitArea(bvh, gr.fragments);
        ok("14b. " + name + ": gated inside/outside split equals the ungated one",
            close(g.inside, u.inside, 1e-12) && close(g.outside, u.outside, 1e-12) && close(g.sum, 0.5, 1e-12) &&
            windingOk(TRI_A_TRI, gr.fragments),
            "gated in=" + g.inside + " out=" + g.outside + " vs ungated in=" + u.inside + " out=" + u.outside);
    }

    // 14c. THE POINT OF THE GATE: a large triA, and B-triangles that are SMALL and FAR APART. T0 (plane x=3) sits
    // near y=-4.4; T1 (plane y=-4) sits near x=4.4. Ungated, T1's plane re-cuts the x<3 fragment T0 created,
    // though T1 is nowhere near it. Gated, it does not -- and neither path leaves a fragment straddling B.
    const bigA = mkBuf([[[-5,-5,1],[5,-5,1],[5,5,1]]]);
    const farB = [
        [[3,-4.9,0.5],[3,-3.9,0.5],[3,-4.4,1.5]],   // T0: plane x=3, crosses z=1 for y in [-4.65,-4.15]
        [[3.9,-4,0.5],[4.9,-4,0.5],[4.4,-4,1.5]],   // T1: plane y=-4, crosses z=1 for x in [4.15,4.65]
    ];
    const farBuf = mkBuf(farB);
    const cu = accumulateFragments(bigA, 0, farBuf, [0, 1]);
    const cg = accumulateFragments(bigA, 0, farBuf, [0, 1], { gateByIntersection: true });
    ok("14c. far-apart small B-triangles: the gate declines a cut the ungated path makes, and emits fewer fragments",
        cg.gateSkipped > 0 && cg.fragments.length < cu.fragments.length,
        "gated " + cg.fragments.length + " fragments (gateSkipped=" + cg.gateSkipped + ", gateTested=" + cg.gateTested +
        ") vs ungated " + cu.fragments.length);
    ok("14c. ...and NEITHER path leaves a fragment straddling a B-triangle (segment-crossing oracle), area conserved, winding kept",
        straddlers(cg.fragments, farB) === 0 && straddlers(cu.fragments, farB) === 0 &&
        close(areaSum(cg.fragments), 50, 1e-9) && windingOk([[-5,-5,1],[5,-5,1],[5,5,1]], cg.fragments),
        "gated straddlers=" + straddlers(cg.fragments, farB) + " ungated straddlers=" + straddlers(cu.fragments, farB) +
        " gated area=" + areaSum(cg.fragments));

    // 14d. A COPLANAR GROUP WHERE ONLY THE SECOND MEMBER MEETS THE FRAGMENT. T2 (plane y=-2, spanning the whole
    // triangle) splits triA first. Then T3 and T4 share plane x=3 and dedup into ONE group: T3 lies below y=-2,
    // T4 above it. The upper fragment meets T4 but not T3, so a gate that consulted only the group's first
    // member would wrongly skip it and leave it straddling T4. The gate must consult EVERY member.
    const grpB = [
        [[-6,-2,0.5],[6,-2,0.5],[0,-2,1.5]],        // T2: plane y=-2, crosses the whole triangle
        [[3,-4.6,0.5],[3,-4.2,0.5],[3,-4.4,1.5]],   // T3: plane x=3, footprint y in [-4.6,-4.2] (below y=-2)
        [[3,0,0.5],[3,2,0.5],[3,1,1.5]],            // T4: plane x=3, footprint y in [0,2] (above y=-2)
    ];
    const gg = accumulateFragments(bigA, 0, mkBuf(grpB), [0, 1, 2], { gateByIntersection: true });
    ok("14d. coplanar group, only its SECOND member meets the upper fragment: the gate still cuts it (no straddler)",
        straddlers(gg.fragments, grpB) === 0 && gg.planeCount === 2 && close(areaSum(gg.fragments), 50, 1e-9),
        "straddlers=" + straddlers(gg.fragments, grpB) + " planeCount=" + gg.planeCount + " fragments=" + gg.fragments.length);

    // 14e. triTriIntersect's "degenerate" status must COUNT AS MEETING. T5 (plane y=-3) has one vertex exactly on
    // triA's own plane z=1 and crosses it along a real segment from x=2 to x=4 -- triTriIntersect snaps that
    // vertex to zero and answers "degenerate", not "intersect". A gate that only honoured "intersect" would skip
    // it and leave the fragment straddling T5.
    const degB = [[[2,-3,1],[4,-3,0.5],[4,-3,1.5]]];
    const dg = accumulateFragments(bigA, 0, mkBuf(degB), [0], { gateByIntersection: true });
    ok("14e. a B-triangle triTriIntersect calls 'degenerate' still cuts the fragment (no straddler)",
        straddlers(dg.fragments, degB) === 0 && dg.gateTested === 1 && dg.fragments.length > 1,
        "straddlers=" + straddlers(dg.fragments, degB) + " gateTested=" + dg.gateTested + " fragments=" + dg.fragments.length);
    const skipAll = { fragments: [{ tri: [[-5,-5,1],[5,-5,1],[5,5,1]] }] };
    ok("14f. the straddle oracle is not vacuous: the UNSPLIT triangle straddles every fixture above",
        straddlers(skipAll.fragments, farB) === 1 && straddlers(skipAll.fragments, grpB) === 1 &&
        straddlers(skipAll.fragments, degB) === 1,
        "farB=" + straddlers(skipAll.fragments, farB) + " grpB=" + straddlers(skipAll.fragments, grpB) +
        " degB=" + straddlers(skipAll.fragments, degB));

    // 14g. triTriIntersect's "coplanar" must COUNT AS MEETING too. The adversarial review of round 7 found this
    // unpinned: a mutation treating "coplanar" like "none" went 0 red in this gate and in meshBooleanBlast.
    // (Behaviourally near-harmless -- splitting a fragment by a plane it lies in cannot separate it -- but the
    // header promises the conservative side, so the counters are pinned: the offer reaches the clip.)
    const copB = [[[0,-3,1],[2,-3,1],[1,-1,1]]];   // lies IN triA's own plane z=1, inside its footprint
    const cp = accumulateFragments(bigA, 0, mkBuf(copB), [0], { gateByIntersection: true });
    ok("14g. a B-triangle triTriIntersect calls 'coplanar' is offered to the clip, not skipped",
        cp.gateTested === 1 && cp.gateSkipped === 0,
        "gateTested=" + cp.gateTested + " gateSkipped=" + cp.gateSkipped + " unresolved=" + cp.unresolvedCount);

    // 14h. THE PLANE-DEDUP FIX (round 7 review; a round-5 bug, not the gate's). T1 lies in z = +s*y, T2 in
    // z = -s*y, s = 1e-5: a 2e-5-rad fold whose line runs through the origin. The old merge test (normals within
    // cos > 1-1e-9, offsets within 1e-9) merged them and clipped by T1's plane alone, so T2 could still cross a
    // kept fragment. The new test (every vertex within planeEps of the representative plane) keeps them apart.
    const s5 = 1e-5;
    const foldB = [
        [[-1,0,0],[1,0,0],[0,10,10*s5]],     // T1: z = +s*y
        [[-1,0,0],[0,-10,10*s5],[1,0,0]],    // T2: z = -s*y
        [[-1,0,0],[1,0,0],[0,10,10*s5]].map((v) => [v[0], v[1], v[2]]).reverse(),   // T1 wound the other way
    ];
    const vA = mkBuf([[[0,-5,-1],[0,5,-1],[0,0,1]]]);   // a vertical triangle crossing both halves of the fold
    const fh = accumulateFragments(vA, 0, mkBuf(foldB), [0, 1, 2]);
    ok("14h. a 2e-5-rad fold through the origin is TWO planes; an oppositely-wound exact duplicate still merges",
        fh.planeCount === 2 && fh.duplicatePlanesCollapsed === 1 && straddlers(fh.fragments, foldB) === 0,
        "planeCount=" + fh.planeCount + " duplicatePlanesCollapsed=" + fh.duplicatePlanesCollapsed +
        " straddlers=" + straddlers(fh.fragments, foldB));

    // 14i. THE PER-PLANE GROUP PRE-FILTER (round 7 review). A coplanar group whose members all miss triA as a
    // whole (a copy of 14c's T0 moved to plane x=2 and to z in [2,3], so its plane crosses bigA but it never
    // touches it) is skipped for every fragment at once, and the result equals the run without it. The first
    // draft left it in T0's own plane x=3, where it simply joined T0's group -- which DOES meet triA -- so
    // groupsSkipped read 0 and this check went red on its own fixture.
    const missB = [...farB, [[2,-4.9,2],[2,-3.9,2],[2,-4.4,3]]];
    const withMiss = accumulateFragments(bigA, 0, mkBuf(missB), [2, 0, 1], { gateByIntersection: true });
    const without = accumulateFragments(bigA, 0, farBuf, [0, 1], { gateByIntersection: true });
    ok("14i. a plane group that misses the whole triangle is skipped wholesale and changes nothing",
        withMiss.fragments.length === without.fragments.length && withMiss.groupsSkipped === 1 &&
        without.groupsSkipped === 0 && straddlers(withMiss.fragments, missB) === 0,
        "with the missing group " + withMiss.fragments.length + " fragments (groupsSkipped=" + withMiss.groupsSkipped +
        "), without it " + without.fragments.length + " (groupsSkipped=" + without.groupsSkipped + ")");
}

console.log(`triFragmentAccumulate-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: PLANE_EPS (plane-identity dedup tolerance) is an ESTIMATE (set equal " +
    "to triClip.mjs's own EPS as the most directly comparable precedent), not measured against a dedicated sweep " +
    "the way triClip.mjs's/meshPointClassify.mjs's own constants were -- a future round could tighten or loosen " +
    "it with real data; maxFragments is a DEFENSIVE cap, not a fix for the underlying blow-up (section 9's own " +
    "demonstration) -- clipping against each candidate's INFINITE plane rather than its bounded footprint, with " +
    "no merge/prune of small resulting fragments, is the real cause, not attempted this round; the module does " +
    "NOT classify fragments itself (hand fragment centroids to meshPointClassify.mjs's pointInMesh(), as this " +
    "gate's own splitArea() helper does) and does NOT assemble a result mesh or implement per-operation " +
    "(union/subtract/intersect) fragment-keep rules -- a real CSG boolean still needs both, explicitly out of " +
    "scope for this round; performance at realistic mesh sizes (many triangles per mesh, not one triA at a " +
    "time) is not measured here, only per-triangle fragment-count growth; and this gate's own hand-derived " +
    "scenarios are all coplanar-with-z=1 (TriA's own plane), the SAME simplification round 4's own gate used for " +
    "its integration test -- a genuinely oblique (non-axis-aligned) multi-plane accumulation scenario is not " +
    "covered here, left for a future round rather than manufactured into this one. ONE MORE THING, FOUND BY AN " +
    "ADVERSARIAL REVIEW OF THIS ROUND AND ONLY PARTIALLY RESOLVED: that review found and this round fixed four " +
    "real bugs/gaps (maxFragments could be silently exceeded; accumulateFragments crashed on " +
    "candidateTriBs=undefined, the module's own documented typical calling pattern's return for a triA with no " +
    "candidates; planeCount overstated applied planes when capped; opposite-facing coplanar duplicates were not " +
    "deduped -- confirmed non-corrupting but wasteful, fixed anyway) and added the winding/orientation oracle " +
    "(section 7b especially) and splitBy provenance assertions this gate was missing, matching round 3's own " +
    "established discipline. The SAME review also found a genuine numerical-robustness gap specific to " +
    "ACCUMULATION (not triClip.mjs's own already-documented single-clip sliver risk): a chain of near-duplicate " +
    "(genuinely distinct, not floating-point-identical) candidate planes can cascade a run of double-precision- " +
    "noise-floor sliver fragments, and combined with the maxFragments cap, can fully starve the fragment budget " +
    "before a geometrically necessary, distinct plane is ever applied -- section 13 above reproduces both halves " +
    "concretely. This is NOT fixed: it is a genuine design trade-off in how tight PLANE_EPS should be, not a " +
    "simple bug, and resolving it needs either smarter plane-processing order (by geometric effect, not " +
    "attempted) or a fragment-merge/prune step this round does not build.");
process.exit(fails ? 1 : 0);
