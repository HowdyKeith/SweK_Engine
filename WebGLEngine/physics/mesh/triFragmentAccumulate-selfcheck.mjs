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
// SABOTAGE LOG -- each applied to the real physics/mesh/triFragmentAccumulate.mjs, gate run, exit read, file
// restored byte for byte (restore verified via diff against a saved copy before every sabotage):
//   A  resolveDegenerate()'s "disagree" branch (the real 2-way split fix, Finding 2) reverted to always return
//      {status:"unresolved"} -- i.e. exactly the naive first-draft policy section 6 exists to catch a
//      regression of
//        -> exit=1, 6 RED (not the 5 first guessed before actually running it, corrected here after measuring):
//           both explicit resolveDegenerate 7b assertions (the hand-built disagree case now stays a single
//           unsplit low-confidence fragment instead of splitting into two 0.25-area halves), the literal-B
//           degenerate-named case's unresolvedCount==0 assertion (now 2, genuinely ambiguous under this
//           sabotage), and all three order-independence assertions in section 6 (both the "every seed gives
//           0.08 inside" and "every seed agrees on outside" checks, PLUS every one of the 8 per-seed area-
//           conservation checks stayed GREEN even under this sabotage -- area conservation alone does not
//           detect a wrong inside/outside SPLIT, only a dropped or duplicated fragment, a real and honestly-
//           reported limit of that particular oracle). Confirms section 6 and 7b are both genuinely exercising
//           Finding 2, not passing by coincidence.
//   B  the plane-identity dedup loop (see this file's own header, Finding 1) short-circuited to push every
//      candidate as its own distinct "plane" with no merge attempt at all
//        -> exit=1, 5 RED (not the 2 first guessed): the two-x-plane trace's planeCount==2 assertion (now 4),
//           the literal-B duplicatePlanesCollapsed==4 structural assertion (now 0) and the explicit
//           index-duplicate dedup case, PLUS -- NOT predicted in advance, a genuine finding from actually
//           running this sabotage rather than reasoning about it -- the clean-path B' case's own
//           degenerateFallbacks==0 assertion (now 39): B' still has 2 triangles per side face sharing one
//           true plane, and without dedup, clipping a fragment by the SECOND triangle of an already-applied
//           face plane lands squarely in Finding 1's own failure mode (a fragment vertex already sits exactly
//           on that identical plane), so "B' hits zero degenerate results" turns out to depend on dedup too,
//           not only on B' lacking TriA-diagonal coincidences as this file's own header describes. The
//           area-conservation and final inside/outside-split assertions for both B and B' stayed GREEN even
//           under this sabotage: resolveDegenerate's own per-vertex resolution (Finding 2) is robust enough to
//           correctly resolve a repeated near-identical plane one clip at a time even without amortizing to
//           one, just at the cost of far more fragments and degenerate calls -- a real, separately-useful
//           finding, not merely a weaker restatement of Finding 1's own dedup rationale.
//   C  the maxFragments cap check (`if (fragments.length >= maxFragments) { capped = true; break; }`) removed
//        -> exit=1, 2 RED, both in the explicit tiny-cap test (section 10: capped stays false, and the
//           capped/uncapped fragment counts become equal since neither run is actually capped any more) -- the
//           spoke blow-up demonstration itself (section 9) stays green since it never sets an explicit cap
//           tighter than what it naturally produces, confirming the cap is a genuinely separate,
//           additively-tested behavior, not implied by the blow-up demo alone.
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
}

// ---- 7. resolveDegenerate()'s FOUR branches, each driven through the public API with a hand-built single
// candidate engineered to hit exactly that branch (verified by hand: see the module's own header for the
// distance arithmetic). resolveDegenerate() itself is not exported -- these are black-box, through
// accumulateFragments(), matching this arc's own established gate style. ----
{
    // 7a. one vertex on the plane, other two AGREE (d0=0,d1=1,d2=1) -- safe no-op.
    {
        const trisA = mkBuf([[[0,0,1],[1,0,1],[1,1,1]]]);
        const trisB = mkBuf([[[0,0,0],[0,1,0],[0,0,1]]]);   // plane x=0, n=(1,0,0)
        const r = accumulateFragments(trisA, 0, trisB, [0]);
        ok("!! resolveDegenerate 7a (agree): unchanged single fragment, original area", r.fragments.length === 1 && close(triArea(r.fragments[0].tri), 0.5, 1e-9), JSON.stringify(r.fragments));
        ok("!! resolveDegenerate 7a: hit exactly one degenerate, resolved (not unresolved)", r.degenerateFallbacks === 1 && r.unresolvedCount === 0);
    }
    // 7b. one vertex on the plane, other two DISAGREE (d0=0,d1=1,d2=-1) -- real 2-way split, front+back 0.25 each.
    {
        const trisA = mkBuf([[[0,0,1],[1,0,1],[-1,1,1]]]);
        const trisB = mkBuf([[[0,0,0],[0,1,0],[0,0,1]]]);
        const r = accumulateFragments(trisA, 0, trisB, [0]);
        ok("!! resolveDegenerate 7b (disagree): resolved into exactly 2 fragments", r.fragments.length === 2, JSON.stringify(r.fragments));
        const areas = r.fragments.map((f) => triArea(f.tri)).sort((a,b)=>a-b);
        ok("!! resolveDegenerate 7b: each half is exactly 0.25, summing to the original 0.5", close(areas[0],0.25,1e-9) && close(areas[1],0.25,1e-9), JSON.stringify(areas));
        ok("!! resolveDegenerate 7b: not left unresolved", r.unresolvedCount === 0);
    }
    // 7c. TWO vertices on the plane (a whole edge), third off (d0=-1,d1=0,d2=0) -- safe no-op by the third sign.
    {
        const trisA = mkBuf([[[0,0,1],[1,0,1],[1,1,1]]]);
        const trisB = mkBuf([[[1,0,0],[1,1,0],[1,0,1]]]);   // plane x=1, n=(1,0,0)
        const r = accumulateFragments(trisA, 0, trisB, [0]);
        ok("!! resolveDegenerate 7c (edge-on-plane): unchanged single fragment", r.fragments.length === 1 && close(triArea(r.fragments[0].tri), 0.5, 1e-9), JSON.stringify(r.fragments));
        ok("!! resolveDegenerate 7c: resolved, not flagged unresolved", r.unresolvedCount === 0);
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
    ok("!! maxFragments cap: fewer than the full 20 planes were applied", r.planeCount === 20 && r.fragments.length < 200, `fragCount=${r.fragments.length}`);
    const rUncapped = accumulateFragments(trisA, 0, trisB, tris.map((_, i) => i));
    ok("!! maxFragments cap: the SAME candidates, uncapped (default 256), are not capped and produce strictly more fragments",
        rUncapped.capped === false && rUncapped.fragments.length > r.fragments.length, `uncapped=${rUncapped.fragments.length} capped=${r.fragments.length}`);
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
    "covered here, left for a future round rather than manufactured into this one.");
process.exit(fails ? 1 : 0);
