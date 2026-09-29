// WebGLEngine/physics/mesh/triTriIntersect-selfcheck.mjs
//
// Run: node physics/mesh/triTriIntersect-selfcheck.mjs
//
// GATES physics/mesh/triTriIntersect.mjs -- round 2 of the BVH-CSG arc (tools/ship/nextRounds.mjs's
// "bvh-csg-speed-vs-manifold-tradeoff"), the triangle-triangle intersection test that consumes round 1's
// candidate pairs (physics/mesh/bvhPairOverlap.mjs).
//
// *** THE PRIMARY INDEPENDENT ORACLE, USED THROUGHOUT: *** onSurface(p, v0,v1,v2) below is a from-scratch,
// textually separate re-implementation of "is point p on triangle (v0,v1,v2)'s surface" (in-plane AND inside
// the 2D region, via barycentric coordinates) -- it shares NO code with triTriIntersect.mjs's own dot/cross/
// computeInterval helpers. For ANY segment the module claims is a genuine intersection, both endpoints MUST
// lie on BOTH input triangles' surfaces according to this independent check -- a strong, exact (not sampling-
// approximate) soundness proof that needs no hand-derived expected coordinates, so it scales to many
// generated test cases rather than just the one case worth deriving by hand.
//
// SABOTAGE LOG -- each applied to physics/mesh/triTriIntersect.mjs, gate run, exit read, file restored byte
// for byte:
//   A  the degenerate guard (`if (du0 === 0 || ...) return { status: "degenerate" };`) removed entirely
//        -> exit=1, 2 red, BOTH of section 4's checks, each failing in the EXACT way this guard exists to
//           prevent, and the two ways are DIFFERENT from each other -- the shared-edge case (two zero-
//           distance vertices) produced `{"status":"intersect","p0":[0,0,0],"p1":[null,null,null]}`, a `NaN`
//           coordinate from a near-zero-divided-by-near-zero interpolation; the single-touching-vertex case
//           (one zero-distance vertex) produced `{"status":"none"}` instead -- numerically clean but WRONG
//           (the true answer is a real segment, confirmed by section 1's own sibling non-degenerate case),
//           not a NaN this time. Both are real, silently-wrong-without-this-guard failures, not the same bug
//           twice.
//   B  the interval-overlap rejection `if (t1max < t2min || t2max < t1min) return { status: "none" };`
//      removed
//        -> FIRST RUN, AGAINST SECTIONS 1-8 BEFORE SECTION 2b EXISTED: exit=0, ZERO RED -- a genuine gate gap,
//           not a pass. Section 2's own "far apart" case is rejected by the EARLIER plane-separation checks
//           (T1 lies entirely on one side of T2's own x~100 plane) and never reaches the sabotaged line at
//           all, so removing it changed nothing this gate could see. Section 2b was added specifically to
//           reach this code: a T2 shifted +10 along Y from the hand-derived case (section 1) so it STILL
//           genuinely straddles both planes (neither early rejection fires -- confirmed by re-deriving the
//           same z=0 crossing math section 1's own header comment uses) but its own crossing segment now
//           lies entirely outside T1's valid region, so the interval-overlap check is the ONLY thing that
//           can say "none" here. Re-run against section 2b: exit=1, 1 red, section 2b by name, with a real
//           fabricated segment ({"status":"intersect","p0":[1,9,0],"p1":[1,3,0]}) nowhere near a genuine
//           intersection -- confirming the added section actually closes the gap the first run exposed.
//   C  the plane-normal normalization (`n1 = scale(n1, 1 / n1len);` and its n2 sibling) removed, reverting
//      to raw, UN-NORMALIZED cross-product normals -- the exact scale-dependence bug an adversarial review
//      of this round's original diff found and verified by direct execution: at millimeter triangle scale,
//      the SAME 30-degree-dihedral configuration that resolves correctly at centimeter scale gets
//      misclassified as coplanar, because a fixed absolute threshold on the un-normalized cross(n1,n2)
//      corresponds to a dihedral-angle sensitivity that swings with (edge length)^4
//        -> exit=1, 1 red, section 5b's own millimeter-scale check by name, reproducing the EXACT original
//           bug report ({"status":"coplanar"} where the correct answer is "intersect") -- confirming section
//           5b actually catches a regression of the fix it exists to gate, not merely a hypothetical one.
//
// Run: node physics/mesh/triTriIntersect-selfcheck.mjs
"use strict";
import { triTriIntersect } from "./triTriIntersect.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const close = (a, b, eps = 1e-7) => Math.abs(a[0]-b[0]) < eps && Math.abs(a[1]-b[1]) < eps && Math.abs(a[2]-b[2]) < eps;

// Independent oracle -- barycentric point-on-triangle test, shares no code with the module under test.
function onSurface(p, v0, v1, v2, eps = 1e-6) {
    const e1 = sub(v1, v0), e2 = sub(v2, v0);
    const n = cross(e1, e2);
    const nlen = Math.hypot(n[0], n[1], n[2]) || 1;
    const dist = Math.abs(dot(sub(p, v0), n)) / nlen;
    if (dist > eps) return false;   // not in-plane
    // barycentric via Cramer's rule
    const vp = sub(p, v0);
    const d11 = dot(e1, e1), d12 = dot(e1, e2), d22 = dot(e2, e2);
    const dp1 = dot(vp, e1), dp2 = dot(vp, e2);
    const denom = d11 * d22 - d12 * d12;
    if (Math.abs(denom) < 1e-18) return false;
    const v = (d22 * dp1 - d12 * dp2) / denom, w = (d11 * dp2 - d12 * dp1) / denom, u = 1 - v - w;
    const t = 1e-6;
    return u >= -t && v >= -t && w >= -t;
}

function buf(...verts) { return new Float64Array(verts.flat()); }

// Deterministic LCG -- same convention as bvhPairOverlap-selfcheck.mjs's own randomTriBuffer.
function lcg(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

// ---- 1. HAND-DERIVED CASE -- see this file's own scratch-verification: T1=(0,0,0),(4,0,0),(0,4,0) in the
// z=0 plane; T2=(1,-1,-1),(1,-1,3),(1,3,-1) in the x=1 plane. Ground truth (1,0,0)-(1,2,0) hand-derived by
// intersecting T2's own boundary with z=0 (edges D-E and E-F cross at (1,-1,0) and (1,2,0)), then clipping
// that segment against T1's own region (y>=0), giving (1,0,0)-(1,2,0). Also checked for SYMMETRY (same
// result with arguments reversed) and against the independent onSurface() oracle. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const D=[1,-1,-1], E=[1,-1,3], F=[1,3,-1];
    const trisA = buf(A,B,C), trisB = buf(D,E,F);
    const r = triTriIntersect(trisA, 0, trisB, 0);
    ok("hand-derived case: status is intersect", r.status === "intersect", JSON.stringify(r));
    if (r.status === "intersect") {
        const matches = (close(r.p0,[1,0,0]) && close(r.p1,[1,2,0])) || (close(r.p1,[1,0,0]) && close(r.p0,[1,2,0]));
        ok("!! matches the hand-derived segment (1,0,0)-(1,2,0) exactly", matches, JSON.stringify(r));
        ok("!! both endpoints independently verified on BOTH triangle surfaces (onSurface oracle)",
            onSurface(r.p0,A,B,C) && onSurface(r.p0,D,E,F) && onSurface(r.p1,A,B,C) && onSurface(r.p1,D,E,F));
    }
    const rSwap = triTriIntersect(trisB, 0, trisA, 0);
    const swapMatches = rSwap.status === "intersect" &&
        ((close(rSwap.p0,[1,0,0]) && close(rSwap.p1,[1,2,0])) || (close(rSwap.p1,[1,0,0]) && close(rSwap.p0,[1,2,0])));
    ok("!! symmetric: triTriIntersect(B,A) gives the same segment as (A,B)", swapMatches);
}

// ---- 2. NO INTERSECTION -- triangles far apart. Rejected by the EARLY plane-separation checks (T1 lies
// entirely on one side of T2's own plane, x~100), never reaching the interval-overlap logic at all -- a
// separate, deeper "none" path (section 2b, below) is needed to actually exercise that code. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const D2=[100,-1,-1], E2=[100,-1,3], F2=[100,3,-1];
    const r = triTriIntersect(buf(A,B,C), 0, buf(D2,E2,F2), 0);
    ok("far apart: status is none", r.status === "none", JSON.stringify(r));
}

// ---- 2b. DEEP NO-INTERSECTION -- found missing by this round's OWN sabotage-testing before this section
// existed: removing the interval-overlap rejection (`if (t1max < t2min || ...) return {status:"none"}`)
// produced ZERO red checks against section 2 alone, because section 2's own case is rejected by the EARLIER
// plane-separation checks and never reaches the sabotaged line. This section is the SAME shape as the hand-
// derived case (section 1) -- T2 genuinely straddles T1's plane (z=0) and T1 genuinely straddles T2's plane
// (x=1), so NEITHER early rejection fires -- but T2 is shifted +10 along Y, so its own crossing segment with
// z=0 (hand-derived: (1,9,0)-(1,12,0), by the identical reasoning section 1's own header comment uses) lies
// entirely OUTSIDE T1's own valid region (y<=3 at x=1). The true answer is genuinely "none", reached only by
// the interval-overlap check the earlier plane tests cannot substitute for. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const Dshift=[1,9,-1], Eshift=[1,9,3], Fshift=[1,13,-1];
    const r = triTriIntersect(buf(A,B,C), 0, buf(Dshift,Eshift,Fshift), 0);
    ok("!! deep no-intersection (both planes genuinely straddled, intervals genuinely disjoint): status is none",
        r.status === "none", JSON.stringify(r));
}

// ---- 3. COPLANAR -- both triangles in the z=0 plane. Explicitly UNRESOLVED, not silently wrong. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const G=[1,1,0], H=[3,1,0], I=[1,3,0];
    const r = triTriIntersect(buf(A,B,C), 0, buf(G,H,I), 0);
    ok("coplanar triangles: status is coplanar (unresolved, not silently wrong)", r.status === "coplanar", JSON.stringify(r));
}

// ---- 4. DEGENERATE -- two variants, both found by this round's own scratch-testing before the module was
// written: a shared edge (two full vertices in common), and a single vertex touching the other plane. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const T3v=[2,0,-3];
    const rShared = triTriIntersect(buf(A,B,C), 0, buf(A,B,T3v), 0);
    ok("!! shared edge (A,B in common): status is degenerate", rShared.status === "degenerate", JSON.stringify(rShared));

    const D3=[1,-1,0], E=[1,-1,3], F=[1,3,-1];   // D3 sits exactly on T1's z=0 plane
    const rTouch = triTriIntersect(buf(A,B,C), 0, buf(D3,E,F), 0);
    ok("!! single vertex exactly on the other plane: status is degenerate", rTouch.status === "degenerate", JSON.stringify(rTouch));
}

// ---- 5. NEAR-DEGENERATE, NOT FALSELY FLAGGED -- a vertex at z=0.01 (not exactly 0) must still resolve
// normally, close to the hand-derived case, proving the EPS guard is tight and not over-triggering. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const D9=[1,-1,0.01], E=[1,-1,3], F=[1,3,-1];
    const r = triTriIntersect(buf(A,B,C), 0, buf(D9,E,F), 0);
    ok("!! near-degenerate (z=0.01, not exactly 0) resolves normally, not flagged degenerate",
        r.status === "intersect", JSON.stringify(r));
    if (r.status === "intersect") {
        ok("!! and its own endpoints are close to the exact hand-derived segment",
            (close(r.p0,[1,0,0],0.02) && close(r.p1,[1,2,0],0.02)) || (close(r.p1,[1,0,0],0.02) && close(r.p0,[1,2,0],0.02)));
    }
}

// ---- 5b. SCALE INVARIANCE -- an adversarial review of this round's original diff found (and verified by
// direct execution, not just reasoning) that the coplanar-detection threshold was comparing an UN-NORMALIZED
// cross(n1,n2) against a fixed absolute cutoff -- since raw plane normals scale as (edge length)^2, that
// cutoff's real angular sensitivity swung by many orders of magnitude with triangle size, and the SAME
// shape at the SAME genuine 30-degree dihedral angle misreported "coplanar" at millimeter scale while
// correctly resolving "intersect" at centimeter scale -- exactly the scale this tree's own
// physics/mesh/meshCSG.mjs already documents as a real, expected regime ("a millimetre-scale model"), not a
// hypothetical one. Fixed by normalizing both plane normals to unit length before any threshold comparison,
// making cross(n1,n2) directly equal to sin(dihedral angle) -- genuinely scale-invariant. This section
// reproduces the reviewer's own exact failing case at millimeter scale, plus the SAME shape at centimeter
// scale for direct comparison (the two must now agree, up to the pure scale factor). ----
{
    const T1cm = buf([0,0,0],[0.04,0,0],[0,0.04,0]);
    const T2cm = buf([0.005,0.015669872981077807,-0.0025],[0.015,0.015669872981077807,-0.0025],[0.01,0.024330127018922194,0.0025]);
    const rCm = triTriIntersect(T1cm, 0, T2cm, 0);
    ok("scale invariance: centimeter scale (30deg dihedral) resolves as intersect", rCm.status === "intersect", JSON.stringify(rCm));

    const T1mm = buf([0,0,0],[0.004,0,0],[0,0.004,0]);
    const T2mm = buf([0.0005,0.0015669872981077808,-0.00024999999999999995],[0.0015,0.0015669872981077808,-0.00024999999999999995],[0.001,0.0024330127018922193,0.00024999999999999995]);
    const rMm = triTriIntersect(T1mm, 0, T2mm, 0);
    ok("!! scale invariance: the SAME shape, SAME 30deg dihedral, at millimeter scale (10x smaller) ALSO " +
        "resolves as intersect -- previously misreported coplanar", rMm.status === "intersect", JSON.stringify(rMm));
    if (rCm.status === "intersect" && rMm.status === "intersect") {
        // the millimeter case is the centimeter case scaled by exactly 0.1 -- its own segment must scale the same way
        const scaledCm = [rCm.p0.map(x => x * 0.1), rCm.p1.map(x => x * 0.1)];
        const matches = (close(rMm.p0, scaledCm[0], 1e-9) && close(rMm.p1, scaledCm[1], 1e-9)) ||
                         (close(rMm.p1, scaledCm[0], 1e-9) && close(rMm.p0, scaledCm[1], 1e-9));
        ok("!! and the millimeter segment is exactly the centimeter segment scaled by 0.1", matches);
    }
}

// ---- 6. ALL THREE "ISOLATED VERTEX" BRANCHES -- rotating which vertex is labeled first/second/third must
// not change the GEOMETRIC result, since the triangle itself is unchanged. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const D=[1,-1,-1], E=[1,-1,3], F=[1,3,-1];
    const expect = (r) => r.status === "intersect" &&
        ((close(r.p0,[1,0,0]) && close(r.p1,[1,2,0])) || (close(r.p1,[1,0,0]) && close(r.p0,[1,2,0])));
    const r1 = triTriIntersect(buf(A,B,C), 0, buf(D,E,F), 0);
    const r2 = triTriIntersect(buf(A,B,C), 0, buf(E,F,D), 0);   // rotated labeling of the same triangle
    const r3 = triTriIntersect(buf(A,B,C), 0, buf(F,D,E), 0);   // rotated again
    ok("rotated vertex labeling (branch 1): same geometric result", expect(r1));
    ok("rotated vertex labeling (branch 2): same geometric result", expect(r2));
    ok("rotated vertex labeling (branch 3): same geometric result", expect(r3));
}

// ---- 7. MULTI-TRIANGLE BUFFER INDEXING -- confirms the function reads the triangle at the given INDEX
// within a buffer holding more than one triangle, not always index 0. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const D=[1,-1,-1], E=[1,-1,3], F=[1,3,-1];
    const multi = buf(A,B,C, D,E,F);   // triangle 0 = A,B,C ; triangle 1 = D,E,F
    const r = triTriIntersect(multi, 0, multi, 1);
    ok("!! multi-triangle buffer: triangle indices 0 and 1 within ONE buffer resolve correctly",
        r.status === "intersect" && ((close(r.p0,[1,0,0]) && close(r.p1,[1,2,0])) || (close(r.p1,[1,0,0]) && close(r.p0,[1,2,0]))),
        JSON.stringify(r));
}

// ---- 8. GENERATED GUARANTEED-CROSSING PAIRS -- deterministic LCG-driven variations on the hand-derived
// shape (random translation + random non-degenerate scale on T2's straddle depth), each verified via the
// SAME independent onSurface() oracle rather than a second round of hand-derivation per case. Guarantees
// genuine crossing by construction (T2 always straddles T1's plane through a point inside T1's own region),
// rather than relying on pure random placement (which would mostly produce "none" and rarely exercise the
// "intersect" path at all). ----
{
    const rand = lcg(555);
    let intersectCount = 0;
    for (let i = 0; i < 12; i++) {
        const ox = rand() * 2, oy = rand() * 2;   // where T2 straddles, kept inside T1's own region
        const depth = 0.5 + rand() * 3;            // how far T2 extends above/below the z=0 plane
        const A=[0,0,0], B=[4,0,0], C=[0,4,0];
        const D=[ox+1, oy-1, -depth], E=[ox+1, oy-1, depth], F=[ox+1, oy+1.5, -depth];
        const trisA = buf(A,B,C), trisB = buf(D,E,F);
        const r = triTriIntersect(trisA, 0, trisB, 0);
        if (r.status === "intersect") {
            intersectCount++;
            const sound = onSurface(r.p0,A,B,C) && onSurface(r.p0,D,E,F) && onSurface(r.p1,A,B,C) && onSurface(r.p1,D,E,F);
            ok(`generated case ${i} (ox=${ox.toFixed(2)} oy=${oy.toFixed(2)} depth=${depth.toFixed(2)}): both endpoints on both real surfaces`,
                sound, JSON.stringify(r));
        } else {
            ok(`generated case ${i}: not flagged intersect (status=${r.status}) -- acceptable if outside T1's own region`, true);
        }
    }
    ok("!! at least half of the 12 generated cases actually resolved as genuine intersections", intersectCount >= 6, `${intersectCount}/12`);
}

// ---- 9. GENUINELY OBLIQUE ORIENTATIONS -- found missing by an adversarial review of this round's original
// diff: EVERY prior case (sections 1-8) has T1 fixed at z=0 and T2 always sharing one x-coordinate across
// all its vertices, so cross(n1,n2) always lands with its Y component dominant and axis 0 (X) / axis 2 (Z)
// are NEVER selected anywhere in this file -- a bug specific to either of those two branches of the max-
// component axis selection (physics/mesh/triTriIntersect.mjs's own axis-selection logic) would have gone
// undetected across the entire prior suite. Fixed by RIGIDLY ROTATING the hand-derived case (section 1) by
// two different fixed 3D rotations (verified, independently, to land on axis=0 and axis=2 respectively, by
// recomputing cross(n1,n2) fresh in THIS gate -- not trusted from how the fixture was generated) -- a rigid
// rotation preserves the intersect/none status and all metric relationships by construction, so both cases
// are guaranteed to genuinely intersect without needing a fresh hand-derivation, verified instead via the
// same independent onSurface() oracle every generated case in section 8 already uses. ----
{
    const cases = [
        { label: "axis=2", expectAxis: 2,
          A:[0,0,0], B:[3.802255143688253,0.38149802302717856,-1.1820808266453582], C:[0.9515397439048374,1.5521809209556585,3.5616437924630753],
          D:[0.5130811392147224,0.624021482826568,-1.5321047397462921], E:[1.3114719821392484,-3.0427473464081842,-0.14741039986955723], F:[1.46462088311956,2.1762024037822263,2.029539052716783] },
        { label: "axis=0", expectAxis: 0,
          A:[0,0,0], B:[0.2815352411979044,0.028247746106089967,-3.989979946416218], C:[3.931853899872831,0.6788707412722524,0.2822400161197344],
          D:[-1.0823704951813147,0.8228116714425198,-1.0730587423337654], E:[-0.4032071731309826,-3.1190580094937213,-1.0530437355346562], F:[2.849483404691516,1.5016824127147723,-0.7908187262140309] },
    ];
    for (const c of cases) {
        // independently recompute which axis THIS gate expects to dominate, using the gate's own sub/cross
        // helpers -- not trusted from the fixture-generation script that produced these coordinates.
        const n1 = cross(sub(c.B, c.A), sub(c.C, c.A));
        const n2 = cross(sub(c.E, c.D), sub(c.F, c.D));
        const Dv = cross(n1, n2).map(Math.abs);
        const actualAxis = Dv[0] >= Dv[1] && Dv[0] >= Dv[2] ? 0 : (Dv[1] >= Dv[2] ? 1 : 2);
        ok(`oblique fixture (${c.label}): independently confirmed to dominate on the intended axis`,
            actualAxis === c.expectAxis, `expected ${c.expectAxis}, got ${actualAxis}, |D|=${JSON.stringify(Dv)}`);

        const r = triTriIntersect(buf(c.A,c.B,c.C), 0, buf(c.D,c.E,c.F), 0);
        ok(`!! oblique fixture (${c.label}): resolves as intersect`, r.status === "intersect", JSON.stringify(r));
        if (r.status === "intersect") {
            ok(`!! oblique fixture (${c.label}): both endpoints on both real surfaces (onSurface oracle)`,
                onSurface(r.p0,c.A,c.B,c.C) && onSurface(r.p0,c.D,c.E,c.F) && onSurface(r.p1,c.A,c.B,c.C) && onSurface(r.p1,c.D,c.E,c.F));
        }
    }
}

// ---- 10. ZERO-AREA INPUT TRIANGLE -- a degenerate INPUT (not a degenerate CONFIGURATION between two valid
// triangles, which sections 4/5 already cover), added alongside the scale-invariance fix: normalizing a
// plane normal requires dividing by its own length, so a triangle whose three vertices are exactly colinear
// (zero cross-product, zero area) must be caught BEFORE that division, not after. ----
{
    const A=[0,0,0], B=[4,0,0], C=[0,4,0];
    const zeroArea = buf([0,0,0],[1,0,0],[2,0,0]);   // three colinear points, zero area
    const r = triTriIntersect(buf(A,B,C), 0, zeroArea, 0);
    ok("!! a zero-area (colinear-vertex) input triangle is reported degenerate, not NaN/throw",
        r.status === "degenerate", JSON.stringify(r));
}

console.log(`triTriIntersect-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: coplanar and degenerate (vertex-on-plane) triangle pairs are " +
    "DETECTED but not RESOLVED -- this module's own header states that scope boundary and why. Also " +
    "unchecked: performance at realistic mesh sizes (this gate proves correctness of one pair at a time, not " +
    "throughput); wiring this into physics/mesh/bvhPairOverlap.mjs's own candidate list (round 1's broad " +
    "phase) -- that integration has not happened yet, this module is exercised here only with hand-picked " +
    "and generated triangle pairs, never through the actual pairOverlap() candidate pipeline; and clipping " +
    "or classification of anything this function finds -- it only reports a segment, never acts on it. " +
    "ONE MORE THING, FOUND BY THE SAME REVIEW AND ONLY PARTIALLY FIXED: normalizing the plane normals " +
    "(section 5b above) fixed the scale-dependence that came from triangle EDGE LENGTH, but du/dv are still " +
    "computed as dot(n, vertex) + planeOffset -- a 'big minus big' subtraction whose floating-point rounding " +
    "noise grows with the VERTEX COORDINATE magnitude, not the triangle's own size. The reviewer measured " +
    "this flipping a genuine, non-trivial intersection to a false 'degenerate' verdict only at world " +
    "coordinates around 1e13 and above (not reproduced below roughly 1e9-1e10) -- an extreme regime this " +
    "gate does not test and this module does not guard against. Left unresolved rather than papered over: a " +
    "real fix needs a coordinate-magnitude-relative epsilon or a floating-origin scheme upstream, neither " +
    "attempted here.");
process.exit(fails ? 1 : 0);
