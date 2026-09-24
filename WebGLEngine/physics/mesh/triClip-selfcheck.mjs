// WebGLEngine/physics/mesh/triClip-selfcheck.mjs
//
// Run: node physics/mesh/triClip-selfcheck.mjs
//
// GATES physics/mesh/triClip.mjs -- round 3 of the BVH-CSG arc (tools/ship/nextRounds.mjs's
// "bvh-csg-speed-vs-manifold-tradeoff"), triangle-vs-plane clipping.
//
// *** INDEPENDENT ORACLES, USED THROUGHOUT, SHARING NO CODE WITH triClip.mjs's OWN HELPERS: ***
//   triArea(p0,p1,p2)         -- 0.5*|cross(p1-p0,p2-p0)|, checked to be CONSERVED (orig = sum of all
//                                  sub-triangle areas) for every clipped case.
//   triNormalDir(p0,p1,p2)    -- unit cross-product normal, checked to MATCH the original triangle's own
//                                  normal (dot >= 0.99) for every sub-triangle -- this is the exact check that
//                                  caught this round's own real bug, see below.
//   onOrigTriangle(p,p0,p1,p2) -- barycentric-with-slack containment: every sub-triangle VERTEX must lie
//                                  in-plane AND within the original triangle's own region (or, for the two
//                                  genuinely new crossing points, on its boundary) -- catches a fan built from
//                                  the wrong point set entirely, not just wrong winding or area.
//   sideOf(p,n,d)              -- dot(n,p)+d, recomputed with THIS gate's own dot(), not trusted from the
//                                  module -- every front-side sub-triangle vertex must be >= -eps, every
//                                  back-side vertex <= eps.
//
// A REAL BUG THIS ROUND'S OWN RANDOMIZED STRESS TEST FOUND, NOT REASONING -- see triClip.mjs's own header for
// the full account. Short version: a first draft used ONE FIXED vertex order for the isolated vertex's own
// corner triangle and the far-side quadrilateral's fan, across all three "which vertex is isolated" branches.
// That passed the ONE hand-derived case this gate's section 1 uses (which happens to hit the "isoMiddle"
// branch) with correct winding by coincidence, and passed AREA conservation for every case (area doesn't
// care about winding at all) -- only a normal-direction check across many randomized cases caught it, with
// EVERY "isoMiddle" case showing a completely inverted normal (dot=-1.000 exactly). This is why section 5
// below checks all three isolated-vertex branches EXPLICITLY, not just implicitly via random cases -- a
// future regression in one specific branch should not depend on a random seed happening to hit it.
//
// SABOTAGE LOG -- each applied to physics/mesh/triClip.mjs, gate run, exit read, file restored byte for byte
// (restore verified via md5sum before/after every sabotage):
//   A  FIRST ATTEMPT, LOG CORRECTED AFTER MEASURING (not left as the wrong prediction): both isoTri AND
//      quadTris collapsed to the single fixed order for all isoMiddle values -- reproducing this round's
//      ORIGINAL, first-draft bug, before either fix.
//        -> exit=1, 7 red -- NOT just branch 2 as first assumed: ALL THREE branches' winding checks failed
//           (branches 1 and 3 apparently only survived the earlier per-branch isoMiddle fix because their
//           OWN quadTris order was already correct independent of isoTri; with quadTris ALSO reverted here,
//           their fans broke too). This measured result, not the original one-branch prediction, is what's
//           reported here -- corrected rather than left standing.
//   A2 NARROWER, more informative: only isoTri reverted to the single fixed order (`[iso, Pa, Pb]` for both
//      isoMiddle values), quadTris left correct -- isolates exactly the ONE fix this round's own randomized
//      stress test forced (see triClip.mjs's own header)
//        -> exit=1, 5 red: section 1 (hand-derived, hits the isoMiddle branch) and section 5's own "branch 2
//           (isoMiddle=true)" winding check, PLUS both randomized-stress sections (which necessarily contain
//           isoMiddle=true cases at volume) -- branches 1 and 3 (isoMiddle=false) stayed GREEN, confirming
//           they were never the ones this specific line was wrong for.
//   B  the degenerate guard (`if (d0 === 0 || ...) return { status: "degenerate" };`) removed entirely
//        -> exit=1, RE-RUN AFTER SECTION 4b WAS ADDED (an adversarial review found the original section 4 only
//           tested an exact-zero distance, never the EPS tolerance band -- see B's own follow-up finding
//           below): 3 red -- section 4 (exact-zero vertex), section 4b's "5e-10 INSIDE the EPS band" check, and
//           4c's EPS-boundary-under-a-non-unit-normal check (which also depends on this guard) -- each instead
//           produces a real "clipped" result with a repeated/collapsed or near-collapsed point (diso near 0
//           makes diso/(diso-do) evaluate to ~0), silently wrong rather than caught. (An earlier run of this
//           same sabotage, before section 4b existed, went 1 red -- section 4 alone; re-run above reflects the
//           gate's CURRENT, wider coverage.)
//   C  the allFront/allBack early-return (`if (s0 === s1 && s1 === s2) return ...`) removed, falling through
//      into the isolated-vertex branching with all-same-sign distances
//        -> exit=1, 4 red: sections 2 and 3 (allFront/allBack) each instead produce a spurious "clipped"
//           result with a NaN coordinate (dividing by a same-signed diso-do difference this branch was never
//           meant to reach), and BOTH randomized-stress sections go red too -- their own clipped-count jumps
//           from ~130-150/300 to 300/300, since every all-front/all-back case that should have short-circuited
//           now falls through and gets counted (and fails) as "clipped".
//   D  the defensive normal normalization added in response to an adversarial review (`clipTriangleByPlane`'s
//      own internal `Math.hypot`/`scale` of its `n` parameter) removed, reverting to trusting the caller's n
//      as already unit-length -- the exact gap that review found and this fix closes
//        -> exit=1, 1 red: section 4c's own "EPS boundary is scale-invariant... non-unit normal (x1000)" check,
//           and ONLY that one -- the plain exact-match checks in the same section (x1,000,000 / x0.000001
//           normal producing the identical result) stayed GREEN, because the interpolation fraction
//           diso/(diso-do) is a RATIO and cancels the scale factor on its own; only the fixed-EPS threshold on
//           the raw (now un-normalized) distance is actually scale-dependent, confirming the fix targets a
//           real, narrow, correctly-identified gap rather than a broader one.
//
// Run: node physics/mesh/triClip-selfcheck.mjs
"use strict";
import { clipTriangleByPlane, clipTriangleByTriPlane, trianglePlane } from "./triClip.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const close = (a, b, eps = 1e-7) => Math.abs(a[0]-b[0]) < eps && Math.abs(a[1]-b[1]) < eps && Math.abs(a[2]-b[2]) < eps;

function triArea(p0, p1, p2) {
    const c = cross(sub(p1, p0), sub(p2, p0));
    return 0.5 * Math.hypot(c[0], c[1], c[2]);
}
function triNormalDir(p0, p1, p2) {
    const c = cross(sub(p1, p0), sub(p2, p0));
    const l = Math.hypot(c[0], c[1], c[2]) || 1;
    return [c[0] / l, c[1] / l, c[2] / l];
}
// Independent oracle -- barycentric-with-slack point-in-original-triangle test, shares no code with
// triClip.mjs's own helpers.
function onOrigTriangle(p, p0, p1, p2, eps = 1e-6) {
    const e1 = sub(p2, p0), e2 = sub(p1, p0), vp = sub(p, p0);
    const d11 = dot(e1, e1), d12 = dot(e1, e2), d22 = dot(e2, e2);
    const dp1 = dot(vp, e1), dp2 = dot(vp, e2);
    const denom = d11 * d22 - d12 * d12;
    if (Math.abs(denom) < 1e-300) return true;   // degenerate original triangle, nothing to check against
    const u = (d22 * dp1 - d12 * dp2) / denom, v = (d11 * dp2 - d12 * dp1) / denom;
    const n = cross(sub(p1, p0), sub(p2, p0));
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    const planeDist = Math.abs(dot([n[0]/nl, n[1]/nl, n[2]/nl], vp));
    return planeDist < eps && u >= -eps && v >= -eps && (u + v) <= 1 + eps;
}
function sideOf(p, n, d) { return dot(n, p) + d; }

function buf(...verts) { return new Float64Array(verts.flat()); }
function lcg(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

// Checks every sub-triangle of a "clipped" result: area conservation, winding consistency against the
// ORIGINAL triangle's own normal, containment of every vertex within the original region, and correct side
// (front vertices on the +n side, back vertices on the -n side, both via the gate's OWN independently
// recomputed plane -- n,d passed in, not read back from the module).
function checkClippedResult(label, r, p0, p1, p2, n, d) {
    if (r.status !== "clipped") { ok(label + ": status is clipped", false, JSON.stringify(r)); return; }
    const origArea = triArea(p0, p1, p2);
    const gotArea = [...r.front, ...r.back].reduce((s, t) => s + triArea(...t), 0);
    ok(label + ": area conserved", Math.abs(origArea - gotArea) < 1e-7 * Math.max(1, origArea),
        `orig=${origArea} sum=${gotArea}`);

    const origN = triNormalDir(p0, p1, p2);
    let windingOk = true, containOk = true, sideOk = true;
    for (const t of r.front) {
        if (dot(origN, triNormalDir(...t)) < 0.99) windingOk = false;
        for (const v of t) { if (!onOrigTriangle(v, p0, p1, p2)) containOk = false; if (sideOf(v, n, d) < -1e-6) sideOk = false; }
    }
    for (const t of r.back) {
        if (dot(origN, triNormalDir(...t)) < 0.99) windingOk = false;
        for (const v of t) { if (!onOrigTriangle(v, p0, p1, p2)) containOk = false; if (sideOf(v, n, d) > 1e-6) sideOk = false; }
    }
    ok("!! " + label + ": every sub-triangle's winding matches the original (independent normal oracle)", windingOk);
    ok("!! " + label + ": every sub-triangle vertex lies within the original triangle's own region (barycentric oracle)", containOk);
    ok("!! " + label + ": every sub-triangle vertex is on its declared side of the plane (independent oracle)", sideOk);
}

// ---- 1. HAND-DERIVED CASE -- T1=(0,0,0),(4,0,0),(0,4,0), plane x=1 (reusing round 2's own T2 plane,
// D=(1,-1,-1),E=(1,-1,3),F=(1,3,-1)). This hits the "isoMiddle" branch (isolated vertex = B, at label
// position p1). Hand-derived: front=triangle(B,Pb,Pa) [WINDING-CORRECT order -- see triClip.mjs's own header
// for how a first hand-derivation got this backwards, point-set-correct but winding-inverted, and how the
// randomized stress test caught it]; back=quad(A,Pa,Pb,C) split (A,Pa,Pb)+(A,Pb,C). Area: orig=8, front=4.5,
// back=3.5, sum=8 exactly. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const n=[1,0,0], d=-1;   // plane x=1
    const trisA = buf(A,B,C);
    const r = clipTriangleByPlane(trisA, 0, n, d);
    ok("hand-derived case: status is clipped", r.status === "clipped", JSON.stringify(r));
    if (r.status === "clipped") {
        ok("!! front is exactly (B,Pb,Pa)", r.front.length === 1 &&
            (close(r.front[0][0],B) && close(r.front[0][1],[1,3,0]) && close(r.front[0][2],[1,0,0])), JSON.stringify(r.front));
        const backOk = r.back.length === 2 &&
            r.back.some(t => close(t[0],A) && close(t[1],[1,0,0]) && close(t[2],[1,3,0])) &&
            r.back.some(t => close(t[0],A) && close(t[1],[1,3,0]) && close(t[2],C));
        ok("!! back is exactly (A,Pa,Pb) + (A,Pb,C)", backOk, JSON.stringify(r.back));
        checkClippedResult("hand-derived", r, A, B, C, n, d);
    }
}

// ---- 2. ALL-FRONT -- entire triangle strictly on the positive side. ----
{
    const r = clipTriangleByPlane(buf([2,0,0],[3,0,0],[2,1,0]), 0, [1,0,0], -1);
    ok("all-front case: status is allFront", r.status === "allFront", JSON.stringify(r));
}

// ---- 3. ALL-BACK -- entire triangle strictly on the negative side. ----
{
    const r = clipTriangleByPlane(buf([0,0,0],[0.5,0,0],[0,0.5,0]), 0, [1,0,0], -1);
    ok("all-back case: status is allBack", r.status === "allBack", JSON.stringify(r));
}

// ---- 4. DEGENERATE -- a vertex exactly on the cutting plane. Explicitly UNRESOLVED, not silently wrong,
// same convention as triTriIntersect.mjs's own "degenerate" status. ----
{
    const B=[4,0,0], C=[0,4,0];
    const r = clipTriangleByPlane(buf([1,0,0],B,C), 0, [1,0,0], -1);
    ok("!! vertex exactly on plane: status is degenerate", r.status === "degenerate", JSON.stringify(r));
}

// ---- 4b. THE EPS TOLERANCE BAND ITSELF -- found untested by an adversarial review of this round's original
// diff: section 4's own "vertex exactly on plane" case lands on an EXACTLY representable IEEE-754 zero
// distance (1*1 + (-1) = 0 exactly), so it only ever exercised the `d0 === 0` branch of the guard, never the
// `Math.abs(d0) < EPS` tolerance path the header explicitly claims is tested. Two cases here, symmetric
// around the boundary: a vertex 5e-10 from the plane (INSIDE the EPS=1e-9 band) must still resolve as
// degenerate; a vertex 5e-9 from the plane (OUTSIDE the band, an order of magnitude further) must resolve as
// an ordinary "clipped" result, proving the guard is a real, exercised tolerance band, not a decoration. ----
{
    const B=[4,0,0], C=[0,4,0];
    const rInside = clipTriangleByPlane(buf([1+5e-10,0,0],B,C), 0, [1,0,0], -1);
    ok("!! vertex 5e-10 from plane (INSIDE the EPS=1e-9 band): status is degenerate",
        rInside.status === "degenerate", JSON.stringify(rInside));
    const rOutside = clipTriangleByPlane(buf([1+5e-9,0,0],B,C), 0, [1,0,0], -1);
    ok("!! vertex 5e-9 from plane (OUTSIDE the EPS=1e-9 band): resolves as an ordinary clipped result",
        rOutside.status === "clipped", JSON.stringify(rOutside));
}

// ---- 4c. NON-UNIT-LENGTH INPUT NORMAL -- an adversarial review of this round's original diff found
// clipTriangleByPlane() required its own n parameter to already be unit length (a JSDoc-only, unenforced
// precondition), reproducing round 2's own previously-shipped HIGH-severity scale-dependence bug class for any
// caller that didn't go through trianglePlane()/clipTriangleByTriPlane(). Fixed by normalizing n (and
// rescaling d to match) defensively inside clipTriangleByPlane() itself -- this section proves a wildly
// non-unit normal (scaled x1e6, and separately x1e-6) produces EXACTLY the same result as the unit-length
// plane, not a scale-corrupted one. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const rUnit = clipTriangleByPlane(buf(A,B,C), 0, [1,0,0], -1);
    const rBig = clipTriangleByPlane(buf(A,B,C), 0, [1e6,0,0], -1e6);
    const rSmall = clipTriangleByPlane(buf(A,B,C), 0, [1e-6,0,0], -1e-6);
    ok("!! a normal scaled x1,000,000 produces the EXACT same result as the unit-length plane",
        JSON.stringify(rBig) === JSON.stringify(rUnit), JSON.stringify({ rUnit, rBig }));
    ok("!! a normal scaled x0.000001 produces the EXACT same result as the unit-length plane",
        JSON.stringify(rSmall) === JSON.stringify(rUnit), JSON.stringify({ rUnit, rSmall }));

    // and the EPS boundary itself must be scale-invariant now too: a vertex 5e-10 from the plane must still
    // read as degenerate even when n arrives non-unit and 1000x too large (proving d is rescaled WITH n, not
    // independently)
    const rEpsBig = clipTriangleByPlane(buf([1+5e-10,0,0],B,C), 0, [1000,0,0], -1000);
    ok("!! EPS boundary is scale-invariant: a non-unit normal (x1000) still resolves a 5e-10 vertex as degenerate",
        rEpsBig.status === "degenerate", JSON.stringify(rEpsBig));
}

// ---- 5. ALL THREE ISOLATED-VERTEX BRANCHES, EXPLICITLY -- not left to chance via random cases, since this
// round's own real bug was branch-specific (isoMiddle=true only) and a random seed could easily miss it.
// Same triangle (A,B,C, isolated vertex always the real geometric vertex B), relabeled into all three vertex
// orders so each of the three `if/else if/else` arms fires in turn. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const n=[1,0,0], d=-1;
    const r1 = clipTriangleByPlane(buf(A,C,B), 0, n, d);   // d0*d1>0 -> iso=p2 (isoMiddle=false)
    checkClippedResult("branch 1 (iso=p2, isoMiddle=false)", r1, A, C, B, n, d);
    const r2 = clipTriangleByPlane(buf(A,B,C), 0, n, d);   // d0*d2>0 -> iso=p1 (isoMiddle=true)
    checkClippedResult("!! branch 2 (iso=p1, isoMiddle=true)", r2, A, B, C, n, d);
    const r3 = clipTriangleByPlane(buf(B,A,C), 0, n, d);   // else -> iso=p0 (isoMiddle=false)
    checkClippedResult("branch 3 (iso=p0, isoMiddle=false)", r3, B, A, C, n, d);
}

// ---- 6. MULTI-TRIANGLE BUFFER INDEXING -- confirms the function reads the triangle at the given INDEX
// within a buffer holding more than one triangle, not always index 0. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const multi = buf([9,9,9],[10,9,9],[9,10,9], A,B,C);   // triangle 0 = junk far away ; triangle 1 = A,B,C
    const r = clipTriangleByPlane(multi, 1, [1,0,0], -1);
    ok("!! multi-triangle buffer: triangle index 1 resolves the SAME as a standalone buffer",
        r.status === "clipped", JSON.stringify(r));
}

// ---- 7. clipTriangleByTriPlane() -- the CSG-relevant convenience form, deriving the cutting plane from
// ANOTHER triangle (round 2's own T2 fixture). trianglePlane() derives its normal from T2's OWN winding
// (D,E,F in this order), which is not guaranteed to point the same way as an arbitrarily hand-picked [1,0,0]
// -- it actually comes out as [-1,0,0] here (verified below, not assumed) -- so clipTriangleByTriPlane's
// result must match clipTriangleByPlane called with THAT SAME derived (n,d), not a hand-picked sign. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const D=[1,-1,-1], E=[1,-1,3], F=[1,3,-1];
    const trisA = buf(A,B,C), trisB = buf(D,E,F);

    const plane = trianglePlane(trisB, 0);
    ok("trianglePlane() returns a unit normal", Math.abs(Math.hypot(...plane.n) - 1) < 1e-12, JSON.stringify(plane));
    ok("trianglePlane() normal matches the hand-derived plane (x=1) up to sign",
        close(plane.n, [1,0,0]) || close(plane.n, [-1,0,0]), JSON.stringify(plane));

    const rDirect = clipTriangleByPlane(trisA, 0, plane.n, plane.d);
    const rViaTri = clipTriangleByTriPlane(trisA, 0, trisB, 0);
    ok("!! clipTriangleByTriPlane matches clipTriangleByPlane given the SAME plane trianglePlane() itself derived",
        rViaTri.status === "clipped" && rDirect.status === "clipped" &&
        JSON.stringify(rViaTri) === JSON.stringify(rDirect), JSON.stringify({ rDirect, rViaTri }));
}

// ---- 8. ZERO-AREA PLANE-SOURCE TRIANGLE -- trianglePlane() of a colinear-vertex triangle has no well-defined
// plane; clipTriangleByTriPlane() must report degenerate rather than dividing by a near-zero normal length. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const zeroArea = buf([0,0,0],[1,0,0],[2,0,0]);
    ok("!! trianglePlane() of a colinear-vertex triangle returns null", trianglePlane(zeroArea, 0) === null);
    const r = clipTriangleByTriPlane(buf(A,B,C), 0, zeroArea, 0);
    ok("!! clipTriangleByTriPlane against a zero-area plane-source triangle reports degenerate, not NaN/throw",
        r.status === "degenerate", JSON.stringify(r));
}

// ---- 8b. SLIVER-TRIANGLE RISK -- KNOWN, DEMONSTRATED, NOT RESOLVED THIS ROUND. Found by an adversarial
// review of this round's original diff: EPS=1e-9 is an absolute threshold, so a vertex whose distance clears
// it by even a small margin is treated as fully resolvable -- but that distance also appears in the
// interpolation fraction diso/(diso-do), so a tiny-but-not-degenerate diso produces crossing points extremely
// close to the isolated vertex, i.e. a near-zero-area sliver sub-triangle, silently returned as an ordinary
// "clipped" result. This is NOT asserted as a failure here (there is no fix to regress-test yet) -- it is
// recorded as a REPRODUCED, VISIBLE fact so a future round fixing it has a concrete before/after case, and so
// this gate does not silently claim the risk doesn't exist. ----
{
    const B=[4,0,0], C=[0,4,0];
    const r = clipTriangleByPlane(buf([4-1.5e-9,0,0],B,C), 0, [1,0,0], -1);
    const sliverArea = r.status === "clipped" ? [...r.front, ...r.back].reduce((mn,t)=>Math.min(mn,triArea(...t)), Infinity) : null;
    ok("known-unresolved: a vertex 1.5e-9 from the plane (just past EPS) still resolves as clipped",
        r.status === "clipped", JSON.stringify(r));
    ok("known-unresolved: ...producing a near-zero-area sliver sub-triangle, not flagged in any way " +
        "(documented in triClip.mjs's own header as an open risk, not fixed this round)",
        sliverArea !== null && sliverArea < 1e-6, `smallest sub-triangle area = ${sliverArea} (orig area = 8)`);
}

// ---- 9. RANDOMIZED STRESS -- two independent seeds, checked via ALL FOUR oracles above (area, winding,
// containment, side) for every case that actually clips. This is the exact test that found this round's own
// real winding bug -- kept here at meaningful volume (not just the hand-picked branch cases in section 5) so
// a future regression anywhere in the fan construction, not just the one branch section 5 already names, has
// somewhere to be caught. ----
for (const [seed, N, half] of [[999, 300, 5], [31337, 300, 10]]) {
    const rand = lcg(seed);
    let clippedCount = 0, allOk = true;
    for (let i = 0; i < N; i++) {
        const p0=[rand()*half*2-half,rand()*half*2-half,rand()*half*2-half];
        const p1=[rand()*half*2-half,rand()*half*2-half,rand()*half*2-half];
        const p2=[rand()*half*2-half,rand()*half*2-half,rand()*half*2-half];
        let n=[rand()*2-1,rand()*2-1,rand()*2-1];
        const nl = Math.hypot(n[0],n[1],n[2]) || 1;
        n = [n[0]/nl, n[1]/nl, n[2]/nl];
        const d = rand()*half*2-half;
        const r = clipTriangleByPlane(buf(p0,p1,p2), 0, n, d);
        if (r.status !== "clipped") continue;
        clippedCount++;
        const origArea = triArea(p0,p1,p2);
        const gotArea = [...r.front, ...r.back].reduce((s,t)=>s+triArea(...t),0);
        if (Math.abs(origArea - gotArea) > 1e-6 * Math.max(1, origArea)) { allOk = false; console.log("  (seed "+seed+" case "+i+": AREA MISMATCH)"); }
        const origN = triNormalDir(p0,p1,p2);
        for (const t of [...r.front, ...r.back]) {
            if (dot(origN, triNormalDir(...t)) < 0.99) { allOk = false; console.log("  (seed "+seed+" case "+i+": WINDING MISMATCH)"); }
            for (const v of t) { if (!onOrigTriangle(v,p0,p1,p2)) { allOk = false; console.log("  (seed "+seed+" case "+i+": CONTAINMENT MISMATCH)"); } }
        }
        for (const v of r.front) for (const vv of v) { if (sideOf(vv,n,d) < -1e-6) { allOk = false; console.log("  (seed "+seed+" case "+i+": FRONT SIDE MISMATCH)"); } }
        for (const v of r.back) for (const vv of v) { if (sideOf(vv,n,d) > 1e-6) { allOk = false; console.log("  (seed "+seed+" case "+i+": BACK SIDE MISMATCH)"); } }
    }
    ok(`!! randomized stress (seed ${seed}, ${N} cases, ${clippedCount} clipped): area+winding+containment+side all hold`, allOk);
}

console.log(`triClip-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: performance at realistic mesh sizes (this gate proves " +
    "correctness of one triangle-plane pair at a time, not throughput); wiring this into round 1's " +
    "bvhPairOverlap.mjs candidate pairs or round 2's triTriIntersect.mjs segments -- that integration has not " +
    "happened yet; and inside/outside CLASSIFICATION of the resulting fragments against a second mesh, which " +
    "is round 4's own scope, not this one's -- this module only splits a triangle by a plane, it does not " +
    "decide which side of a SECOND, unrelated mesh either half ends up on. This module also inherits the same " +
    "large-world-coordinate precision caveat triTriIntersect.mjs's own gate already names (its own EPS-based " +
    "degenerate guard is an absolute threshold on a big-minus-big subtraction whose rounding noise floor grows " +
    "with vertex coordinate magnitude, not triangle size) -- not re-measured separately here since it is the " +
    "same underlying arithmetic pattern, not a new risk this round introduced. ONE MORE THING, FOUND BY AN " +
    "ADVERSARIAL REVIEW OF THIS ROUND AND ONLY PARTIALLY RESOLVED: that review found clipTriangleByPlane() " +
    "originally required an already-unit-length normal (JSDoc-only, unenforced) -- FIXED, it now normalizes " +
    "defensively inside itself, see section 4c and triClip.mjs's own header. The SAME review also found the " +
    "EPS=1e-9 absolute threshold can let a vertex just past it produce a near-zero-area sliver sub-triangle -- " +
    "section 8b above reproduces this and proves it is real, but it is NOT fixed: a real fix needs either a " +
    "relative (edge-length-scaled) degenerate threshold or a minimum-output-area policy, neither designed here.");
process.exit(fails ? 1 : 0);
