// WebGLEngine/physics/mesh/triArrangement-selfcheck.mjs
//
// Run: node physics/mesh/triArrangement-selfcheck.mjs
//
// GATES physics/mesh/triArrangement.mjs -- round 9 of the BVH-CSG arc, segment-bounded cutting: the planar
// arrangement of B's actual intersection segments inside one triangle of A, its faces, their triangulation.
//
// ORACLES, NONE OF THEM triArrangement.mjs's OWN CODE:
//   - Hand-derived face areas. A is the right triangle (0,0,0),(10,0,0),(0,10,0) (area 50) in the plane z=0; B is
//     built from vertical PRISMS over axis-aligned squares, z from -1 to 1, so B meets z=0 exactly along the
//     squares' outlines and every face area is a sum of rectangle areas computable with no code.
//   - Vertex provenance: every output vertex must be BIT-IDENTICAL to one of A's corners or to an endpoint
//     triTriIntersect() returns -- the module claims it never computes a vertex; this checks it.
//   - Orientation and partition, recomputed here in 3D: every output triangle's normal points with A's, and
//     the triangles' 3D areas sum to A's.
//   - Classification consistency: on real workloads, every output triangle's OWN centroid, classified by
//     pointInMesh() against B, must agree with its face's classification (one point per face, taken from the
//     face's largest triangle). A face that B crossed would split its triangles between the two answers.
//
// SABOTAGE LOG. *** NOT YET RE-RUN ON THE REBUILT MODULE. *** The first version of triArrangement.mjs was lost
// uncommitted (the container was reclaimed) and rebuilt against this gate; the entries below were measured on that
// first version and are kept, until the rebuild's own run replaces them, as the record of what this gate caught --
// not as a claim about the rebuild. Reds as THIS gate / meshBoolean-selfcheck / meshBooleanBlast-selfcheck, each
// applied to the real file, restored in a `finally`, the restore verified by md5sum:
//   A1  snap disabled for segment endpoints (corners only) -> 13 / 0 / 4
//   A2  hole given to the LARGEST containing face -> 2 / 0 / 0 (1c, the nested case built for it)
//   A3  face walk turns the wrong way -> 6 / 0 / 5
//   A4  crossing check removed -> 1 / 0 / 0 (2c)
//   A5  dangling check disabled -> 2 / 0 / 0 (2d, and section 4's 30-TOL crack)
//   A6  clockwise triangle emitted instead of refused -> 0 / 0 / 0. The first log said the check never fires; a
//       round-9 review measured it firing on rounding-noise slivers, and 0 red only because the next line dropped
//       them as slivers anyway. The sliver drop now runs first (see the module).
//   A7  meshBoolean reusing one face's classification for every face of a triangle -> 0 / 8 / 10
//   A8  coplanar/degenerate candidates ignored instead of refused -> 2 / 7 / 0
//   A9  segments along triA's boundary kept -> 0 / 0 / 0. The first log called the skip unreachable; a review reached
//       it within TOL with no degeneracy at all (1h is that fixture now).
//   A10 (control) grid minimum of two cells -> 0 / 0 / 0, as a correctness-neutral change must.
//   A11 the exception guard removed -> 1 / 0 / 0 (2g, added after a first run went 0 red).
"use strict";

import { arrangeTriangle, ARRANGE_TOL } from "./triArrangement.mjs";
import { triTriIntersect } from "./triTriIntersect.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { groupCandidatesByTriA } from "./triFragmentAccumulate.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import * as CSG from "./meshCSG.mjs";   // fixture shapes only (jaggedBlob, boxPolys, toTriangleBuffer)

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function mkBuf(tris) {
    const b = new Float64Array(tris.length * 9);
    tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) b[i * 9 + v * 3 + c] = t[v][c]; });
    return b;
}
const A_TRI = [[0, 0, 0], [10, 0, 0], [0, 10, 0]];
const A = mkBuf([A_TRI]);
const AREA_A = 50;

// A closed vertical prism over the axis-aligned square [x0,x1]x[y0,y1], z in [-1,1], outward-wound.
function prism(x0, y0, x1, y1) {
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], T = [];
    for (let i = 0; i < 4; i++) {
        const [ax, ay] = c[i], [bx, by] = c[(i + 1) % 4];
        T.push([[ax, ay, -1], [bx, by, -1], [bx, by, 1]], [[ax, ay, -1], [bx, by, 1], [ax, ay, 1]]);
    }
    T.push([[x0, y0, -1], [x1, y1, -1], [x1, y0, -1]], [[x0, y0, -1], [x0, y1, -1], [x1, y1, -1]]);
    T.push([[x0, y0, 1], [x1, y0, 1], [x1, y1, 1]], [[x0, y0, 1], [x1, y1, 1], [x0, y1, 1]]);
    return T;
}
const all = (tris) => tris.map((_, i) => i);
function arrange(bTris) { const B = mkBuf(bTris); return { B, r: arrangeTriangle(A, 0, B, all(bTris)) }; }
const faceAreas = (r) => r.faces.map((f) => f.area).sort((a, b) => a - b);
const triArea3 = (t) => { const u = [t[1][0]-t[0][0], t[1][1]-t[0][1], t[1][2]-t[0][2]], v = [t[2][0]-t[0][0], t[2][1]-t[0][1], t[2][2]-t[0][2]];
    return 0.5 * Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]); };
const normalZ = (t) => (t[1][0]-t[0][0]) * (t[2][1]-t[0][1]) - (t[1][1]-t[0][1]) * (t[2][0]-t[0][0]);
function provenanceOk(r, B, nB, trisA = A, triA = 0) {
    const allowed = [];
    const o = triA * 9;
    for (let v = 0; v < 3; v++) allowed.push([trisA[o + v * 3], trisA[o + v * 3 + 1], trisA[o + v * 3 + 2]]);
    for (let j = 0; j < nB; j++) { const s = triTriIntersect(trisA, triA, B, j); if (s.status === "intersect") allowed.push(s.p0, s.p1); }
    const same = (p, q) => p[0] === q[0] && p[1] === q[1] && p[2] === q[2];
    for (const f of r.faces) for (const t of f.tris) for (const p of t.tri) if (!allowed.some((q) => same(p, q))) return false;
    return true;
}

// =============================================================================================================
console.log("\n1. *** HAND-DERIVED FACES ***");
{
    // 1a. one closed curve inside A: a 1x1 hole. Faces: the square (1) and A minus the square (49).
    const { B, r } = arrange(prism(2, 2, 3, 3));
    ok("1a. a square hole inside A: two faces, areas 1 and 49 exactly",
        r.ok && r.faces.length === 2 && close(faceAreas(r)[0], 1) && close(faceAreas(r)[1], 49),
        r.ok ? "faces " + JSON.stringify(faceAreas(r)) + ", segments " + r.segments : "refused: " + r.reason);
    ok("1a. every output vertex is an A corner or a triTriIntersect endpoint, BIT FOR BIT -- no vertex computed",
        r.ok && provenanceOk(r, B, 12));
    // The prism's side quads are split along a diagonal, so each side crosses z=0 as TWO segments meeting at the
    // diagonal's midpoint -- a point computed separately by two B-triangles, which the snap must merge.
    // (A round-9 review found this label claiming 8 interior vertices while only the segment count was asserted.)
    const interior = new Set();
    if (r.ok) for (const f of r.faces) for (const t of f.tris) for (const p of t.tri)
        if (!A_TRI.some((q) => q[0] === p[0] && q[1] === p[1] && q[2] === p[2])) interior.add(p.join(","));
    ok("1a. ...and the shared midpoints were merged: 8 segments, 8 distinct interior vertices in the output",
        r.ok && r.segments === 8 && interior.size === 8, "segments " + (r.ok ? r.segments : "-") + ", interior vertices " + interior.size);

    // 1b. a curve that leaves A through its edge x=0: square [-1,1]x[4,5]; inside A only [0,1]x[4,5].
    const b = arrange(prism(-1, 4, 1, 5));
    ok("1b. a square crossing A's boundary: two faces, 1 and 49",
        b.r.ok && b.r.faces.length === 2 && close(faceAreas(b.r)[0], 1) && close(faceAreas(b.r)[1], 49),
        b.r.ok ? JSON.stringify(faceAreas(b.r)) : "refused: " + b.r.reason);

    // 1c. nested closed curves: [1,4]^2 (area 9) around [2,3]^2 (area 1). Faces: 1, the ring 8, and 50-9 = 41.
    // (The first draft used [1,6]^2, whose corner (6,6) lies outside A's hypotenuse x+y=10 -- the module's answer
    // [1,22,27] was right for that shape and the gate's hand-derivation was wrong.)
    const c = arrange([...prism(1, 1, 4, 4), ...prism(2, 2, 3, 3)]);
    ok("1c. nested holes go to their INNERMOST containing face: faces 1, 8, 41",
        c.r.ok && c.r.faces.length === 3 && close(faceAreas(c.r)[0], 1) && close(faceAreas(c.r)[1], 8) && close(faceAreas(c.r)[2], 41),
        c.r.ok ? JSON.stringify(faceAreas(c.r)) : "refused: " + c.r.reason);

    // 1d. two disjoint holes: [1,2]^2 and [4,5]x[1,2]. Faces 1, 1, 48.
    const d = arrange([...prism(1, 1, 2, 2), ...prism(4, 1, 5, 2)]);
    ok("1d. two disjoint holes in one face: faces 1, 1, 48",
        d.r.ok && d.r.faces.length === 3 && close(faceAreas(d.r)[0], 1) && close(faceAreas(d.r)[1], 1) && close(faceAreas(d.r)[2], 48),
        d.r.ok ? JSON.stringify(faceAreas(d.r)) : "refused: " + d.r.reason);

    // 1e. nothing crosses: a prism entirely outside A (its box still overlaps A's box).
    const e = arrange(prism(7, 7, 8, 8));
    ok("1e. a candidate that crosses nothing inside A: one face, A itself, untouched",
        e.r.ok && e.r.faces.length === 1 && e.r.faces[0].tris.length === 1 && close(e.r.faces[0].area, 50) &&
        JSON.stringify(e.r.faces[0].tris[0].tri) === JSON.stringify(A_TRI), e.r.ok ? "segments " + e.r.segments : e.r.reason);

    // 1g. TINY FACES ARE FACES. The first version dropped every triangle under 1e-14 of triA's area as a "sliver";
    // two round-9 reviews found that dropping REAL faces (a 2e-7 rod's end cap, a 3e-7 needle's two caps). A
    // square 2e-7 across (area 4e-14, under that cutoff) must keep its triangles, and so its area.
    const g1 = arrange(prism(2, 2, 2 + 2e-7, 2 + 2e-7));
    const small = g1.r.ok ? g1.r.faces.reduce((m, f) => (!m || f.area < m.area ? f : m), null) : null;
    const smallA3 = small ? small.tris.reduce((acc, t) => acc + triArea3(t.tri), 0) : 0;
    ok("1g. a square hole 2e-7 across keeps its face's triangles: output area 4e-14 to 1e-6 relative",
        g1.r.ok && g1.r.faces.length === 2 && small.tris.length > 0 && Math.abs(smallA3 - 4e-14) < 1e-6 * 4e-14,
        g1.r.ok ? "small face " + (small ? small.tris.length : 0) + " triangles, 3D area " + smallA3.toExponential(6) +
        " (first version: 0 triangles, a hole)" : "refused: " + g1.r.reason);
    // A square 2e-8 across: its cycles' areas (4e-16) are below what the plain shoelace -- products of coordinates
    // measured from triA's corner, ~2 units away -- can resolve. The first version read BOTH cycles as area 0,
    // treated both as holes, and returned ONE uncut face of area 50: the square was simply not there. A cycle's
    // area is now a fan from its own first vertex.
    const g2 = arrange(prism(2, 2, 2 + 2e-8, 2 + 2e-8));
    const small2 = g2.r.ok ? g2.r.faces.reduce((m, f) => (!m || f.area < m.area ? f : m), null) : null;
    const small2A3 = small2 ? small2.tris.reduce((acc, t) => acc + triArea3(t.tri), 0) : 0;
    ok("1g. ...and a square 2e-8 across is still told apart from A around it: two faces, 4e-16 to 1e-6 relative",
        g2.r.ok && g2.r.faces.length === 2 && small2.tris.length > 0 && Math.abs(small2A3 - 4e-16) < 1e-6 * 4e-16,
        g2.r.ok ? g2.r.faces.length + " faces, small face 3D area " + small2A3.toExponential(6) +
        " (first version: 1 face of area 50)" : "refused: " + g2.r.reason);

    // 1h. A SEGMENT WITHIN TOL OF triA's EDGE, WITHOUT ANY DEGENERACY. A round-9 review built it: a tetrahedron
    // whose bottom face crosses z=0 along y = 2.5e-10..7.5e-10 -- inside TOL of A's edge y=0 -- while its apex
    // (4.5, 2, 0.3) takes the rest of it into A's interior. triTriIntersect() calls that bottom crossing a plain
    // "intersect"; the arrangement must skip it as lying on the boundary (the curve is closed by A's own edge) and
    // cut the trapezoid out. Its area comes from the tetra's edge crossings, interpolated here by hand.
    const Pt = [[4, 0, -1], [5, 1e-9, -1], [4.5, 5e-10, 1], [4.5, 2, 0.3]];
    const Tt = [[Pt[0], Pt[1], Pt[2]], [Pt[0], Pt[3], Pt[1]], [Pt[1], Pt[3], Pt[2]], [Pt[2], Pt[3], Pt[0]]];
    const hcross = (p, q) => { const u = -p[2] / (q[2] - p[2]); return [p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])]; };
    const quad = [hcross(Pt[0], Pt[2]), hcross(Pt[1], Pt[2]), hcross(Pt[1], Pt[3]), hcross(Pt[0], Pt[3])];
    let q2 = 0;
    for (let i = 0; i < 4; i++) { const p = quad[i], q = quad[(i + 1) % 4]; q2 += p[0] * q[1] - q[0] * p[1]; }
    // AND IT LEAVES A SLIVER, BY DESIGN, MEASURED HERE RATHER THAN HIDDEN: the two crossing points it closes
    // against the edge lie 2.5e-10 and 7.5e-10 inside A, and the module never moves a vertex. So the output does
    // not cover the strip between A's edge and the path (0,0)->(4.25,2.5e-10)->(4.75,7.5e-10)->(10,0) -- a sub-TOL
    // sliver of 2.75e-9 by hand. The module checks its faces against the boundary it actually walked, and that
    // boundary against triA within TOL x perimeter (3.4e-8 here) -- the strip is the tolerance, not a lost face.
    // The first draft of this fixture expected a perfect partition and went red on exactly that amount.
    let sl2 = 0;
    const edgePath = [[0, 0], [10, 0], quad[1], quad[0]];
    for (let i = 0; i < 4; i++) { const p = edgePath[i], q = edgePath[(i + 1) % 4]; sl2 += p[0] * q[1] - q[0] * p[1]; }
    const sliver = sl2 / 2;
    const h = arrange(Tt);
    const hCover = h.r.ok ? h.r.faces.reduce((acc, f) => acc + f.tris.reduce((a2, t) => a2 + triArea3(t.tri), 0), 0) : 0;
    ok("1h. a crossing within TOL of A's edge closes against it: faces " + (q2 / 2).toFixed(4) + " (hand) and the rest, 3 segments kept",
        h.r.ok && h.r.faces.length === 2 && close(faceAreas(h.r)[0], q2 / 2, 1e-12) &&
        close(faceAreas(h.r)[1], 50 - q2 / 2 - sliver, 1e-12) && h.r.segments === 3 && provenanceOk(h.r, h.B, 4),
        h.r.ok ? "faces " + JSON.stringify(faceAreas(h.r)) + ", segments " + h.r.segments : "refused: " + h.r.reason);
    ok("1h. ...and the only area it leaves uncovered is that hand-computed sub-TOL strip along the edge",
        h.r.ok && Math.abs(sliver - 2.75e-9) < 1e-15 && close(hCover, 50 - sliver, 1e-12),
        "uncovered " + (50 - hCover).toExponential(4) + ", strip by hand " + sliver.toExponential(4));

    // Orientation and partition over every fixture above, recomputed in 3D.
    let orientOk = true, partOk = true;
    for (const x of [{ r }, b, c, d, e, g1, g2]) {
        if (!x.r.ok) { orientOk = partOk = false; continue; }
        let s = 0;
        for (const f of x.r.faces) for (const t of f.tris) { s += triArea3(t.tri); if (normalZ(t.tri) <= 0) orientOk = false; }
        if (!close(s, AREA_A, 1e-9)) partOk = false;
    }
    ok("1f. every output triangle is wound with A (normal +z), and their 3D areas sum to A's 50 (1a-1e, 1g; 1h has its own)", orientOk && partOk);
}

// =============================================================================================================
console.log("\n2. *** THE REFUSALS A FIXTURE CAN REACH, EACH ON THE CASE THAT CAUSES IT ***");
{
    const reason = (bTris, cands) => { const B = mkBuf(bTris); const r = arrangeTriangle(A, 0, B, cands || all(bTris)); return r.ok ? "ok" : r.reason; };
    ok("2a. a B-triangle lying in A's plane is refused as 'coplanar'",
        reason([[[1, 1, 0], [3, 1, 0], [1, 3, 0]]]) === "coplanar");
    ok("2b. a B-triangle with a vertex on A's plane is refused as 'degenerate'",
        reason([[[2, 2, 0], [4, 2, 1], [4, 2, -1]]]) === "degenerate");
    // Two overlapping closed prisms (a self-intersecting B): their outlines cross. (The first draft used [1,3]^2
    // and [2,4]^2, whose outlines cross exactly at a side's diagonal midpoint -- a segment ENDPOINT -- so the module
    // correctly refused it as a T-junction instead; the squares are offset so the crossing falls mid-segment.)
    ok("2c. crossing segments (a self-intersecting B) are refused as 'segments cross'",
        reason([...prism(1, 1, 3.2, 3.2), ...prism(2, 2, 4, 4)]) === "segments cross",
        reason([...prism(1, 1, 3.2, 3.2), ...prism(2, 2, 4, 4)]));
    // One open vertical triangle whose crossing stops inside A: a curve with an end.
    ok("2d. a curve that ends inside A (an open B) is refused as 'dangling'",
        reason([[[2, 2, -1], [4, 2, -1], [3, 2, 1]]]) === "dangling");
    // A segment ending exactly on another's interior.
    ok("2e. an endpoint on another segment's interior is refused as 'T-junction'",
        reason([[[1, 2, -1], [6, 2, -1], [3.5, 2, 1]], [[3, 2, -1], [3, 2, 1], [3, 5, 0.5]]]) === "T-junction");
    // 2g. the exception guard: a malformed candidate list (null) throws inside; the module must REFUSE, not throw,
    // because a refusal falls back to the plane-cut path and an exception aborts the boolean. Added after a
    // sabotage removing the guard went 0 red: nothing else in this gate ever threw.
    let threw = false, g = null;
    try { g = arrangeTriangle(A, 0, mkBuf(prism(2, 2, 3, 3)), null); } catch (e) { threw = true; }
    ok("2g. an input that throws inside is refused ('exception: ...'), never propagated",
        !threw && g && g.ok === false && g.reason.startsWith("exception"), threw ? "THREW" : (g && g.reason));
    ok("2f. a zero-area triA is refused as 'degenerate triA'",
        arrangeTriangle(mkBuf([[[0, 0, 0], [1, 0, 0], [2, 0, 0]]]), 0, mkBuf(prism(0, -1, 1, 1)), all(prism(0, 0, 1, 1))).reason === "degenerate triA");
    // 2h. NOT A REFUSAL ANY MORE, AND THAT IS THE POINT. The soundness review's construction: an arch standing on
    // A's edge y=0, plus a tetrahedron whose apex is 2e-9 above z=0 right beside the arch's foot. The tetra's
    // crossing is smaller than TOL and collapses to a point, but its ends were classified onto the edge -- vertices
    // that bound nothing. The first version kept them in the graph, splitting the boundary right beside the arch's
    // foot; the walk around them scrambled, and it was refused only at the outer-face count (the review found
    // 17,833 accepted scenes containing such vertices elsewhere, every scramble refused there or at the area sum).
    // The rebuild leaves a vertex no kept segment touches out of the graph entirely, so it cannot scramble
    // anything: the answer must be the arch's own, bit for bit, wherever the sub-TOL tetra sits beside its foot.
    const arch = [], ap = [[5 - 1.5e-3, -1e-3], [8 + 1.5e-3, -1e-3], [6.5, 1]];
    for (let i = 0; i < 3; i++) {
        const [ax, ay] = ap[i], [bx, by] = ap[(i + 1) % 3];
        arch.push([[ax, ay, -1], [bx, by, -1], [bx, by, 1]], [[ax, ay, -1], [bx, by, 1], [ax, ay, 1]]);
    }
    arch.push([[ap[0][0], ap[0][1], -1], [ap[2][0], ap[2][1], -1], [ap[1][0], ap[1][1], -1]], [[ap[0][0], ap[0][1], 1], [ap[1][0], ap[1][1], 1], [ap[2][0], ap[2][1], 1]]);
    const tet = (nx, ny) => {
        const apex = [nx, ny, 2e-9], bs = [0, 1, 2].map((k) => { const a = 0.5 + k * 2 * Math.PI / 3; return [nx + 0.05 * Math.cos(a), ny + 0.05 * Math.sin(a), -1]; });
        return [[bs[0], bs[2], bs[1]], [bs[0], bs[1], apex], [bs[1], bs[2], apex], [bs[2], bs[0], apex]];
    };
    const archAlone = arrange(arch).r;
    ok("2h. the arch alone arranges into faces 1.5 and 48.5",
        archAlone.ok && archAlone.faces.length === 2 && close(faceAreas(archAlone)[0], 1.5) && close(faceAreas(archAlone)[1], 48.5),
        archAlone.ok ? JSON.stringify(faceAreas(archAlone)) : "refused: " + archAlone.reason);
    const placements = [[1.1e-9, 0.9e-9], [1.2e-9, 0.95e-9], [0, 0], [3e-9, 0.5e-9], [0.5e-9, 0.2e-9]];
    const orphanRuns = placements.map(([dx, ny]) => arrange([...arch, ...tet(5 + dx, ny)]).r);
    ok("2h. ...and a sub-TOL tetra beside its foot leaves the answer bit-identical: its stray edge vertices bound nothing",
        archAlone.ok && orphanRuns.every((q) => q.ok && JSON.stringify(faceAreas(q)) === JSON.stringify(faceAreas(archAlone)) && q.segments === archAlone.segments),
        orphanRuns.map((q) => q.ok ? JSON.stringify(faceAreas(q)) : "refused " + q.reason).join(" ") + " (first version: (1.1e-9, 0.9e-9) refused as 'outer face')");
}

// =============================================================================================================
console.log("\n3. *** REAL WORKLOADS: NO FACE SPANS BOTH SIDES OF B ***");
{
    // For every triangle of A with candidates, arrange it, classify the face once (the module's contract), and
    // classify every output triangle's OWN centroid independently. Any disagreement is a face B crossed.
    const cen = (t) => [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3, (t[0][2] + t[1][2] + t[2][2]) / 3];
    function audit(X, Y) {
        const bY = new MeshBVH(Y);
        let arranged = 0, refused = 0, faces = 0, tris = 0, disagree = 0, nonUnanimous = 0, provFail = 0, orientFail = 0, partFail = 0;
        const reasons = {};
        for (const [t, c] of groupCandidatesByTriA(pairOverlap(new MeshBVH(X), bY))) {
            const r = arrangeTriangle(X, t, Y, c);
            if (!r.ok) { refused++; reasons[r.reason] = (reasons[r.reason] || 0) + 1; continue; }
            arranged++;
            const o = t * 9, tA = [[X[o], X[o+1], X[o+2]], [X[o+3], X[o+4], X[o+5]], [X[o+6], X[o+7], X[o+8]]];
            const nA = [(tA[1][1]-tA[0][1])*(tA[2][2]-tA[0][2])-(tA[1][2]-tA[0][2])*(tA[2][1]-tA[0][1]),
                        (tA[1][2]-tA[0][2])*(tA[2][0]-tA[0][0])-(tA[1][0]-tA[0][0])*(tA[2][2]-tA[0][2]),
                        (tA[1][0]-tA[0][0])*(tA[2][1]-tA[0][1])-(tA[1][1]-tA[0][1])*(tA[2][0]-tA[0][0])];
            let s = 0;
            for (const f of r.faces) {
                if (!f.tris.length) continue;
                faces++;
                let big = f.tris[0]; for (const ft of f.tris) if (ft.area > big.area) big = ft;
                const fc = pointInMesh(bY, ...cen(big.tri));
                for (const ft of f.tris) {
                    tris++;
                    // A centroid whose five rays do not agree sits within rounding of B's surface, where the
                    // answer can go either way -- a round-9 review found one such 2.5e-12 sliver on the twelve-blast
                    // chain (agreement 0.6). It says nothing about a face B crossed, so it is counted, not judged.
                    const tc = pointInMesh(bY, ...cen(ft.tri));
                    if (fc.agreement < 1 || tc.agreement < 1) nonUnanimous++;
                    else if (tc.inside !== fc.inside) disagree++;
                    const q = ft.tri, n = [(q[1][1]-q[0][1])*(q[2][2]-q[0][2])-(q[1][2]-q[0][2])*(q[2][1]-q[0][1]),
                        (q[1][2]-q[0][2])*(q[2][0]-q[0][0])-(q[1][0]-q[0][0])*(q[2][2]-q[0][2]),
                        (q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[1][1]-q[0][1])*(q[2][0]-q[0][0])];
                    if (n[0]*nA[0] + n[1]*nA[1] + n[2]*nA[2] <= 0) orientFail++;
                    s += triArea3(q);
                }
            }
            if (!close(s, triArea3(tA), 1e-9 * Math.max(1, triArea3(tA)))) partFail++;
            if (!provenanceOk(r, Y, Y.length / 9, X, t)) provFail++;
        }
        return { arranged, refused, reasons, faces, tris, disagree, nonUnanimous, provFail, orientFail, partFail };
    }
    const wall = CSG.toTriangleBuffer(CSG.boxPolys([0, 0, 0], [4, 3, 0.3]));
    const blob = CSG.toTriangleBuffer(CSG.jaggedBlob([0, 0, 0], 1.0, 12, 12345));
    const b1 = CSG.toTriangleBuffer(CSG.jaggedBlob([0, 0, 0], 1.0, 8, 7)), b2 = CSG.toTriangleBuffer(CSG.jaggedBlob([0.4, 0.2, 0.1], 0.9, 8, 99));
    for (const [name, X, Y] of [["wall vs blob", wall, blob], ["blob vs wall", blob, wall], ["blob vs blob", b1, b2], ["blob vs blob (reverse)", b2, b1]]) {
        const a = audit(X, Y);
        ok("3. " + name + ": every triangle's own classification agrees with its face's; wound with A; partitions A; no new vertices",
            a.arranged > 0 && a.disagree === 0 && a.nonUnanimous * 100 <= a.tris && a.orientFail === 0 && a.partFail === 0 &&
            a.provFail === 0 && a.refused === 0,
            a.arranged + " triangles arranged into " + a.faces + " faces / " + a.tris + " output triangles; disagreements " +
            a.disagree + " (non-unanimous, not judged: " + a.nonUnanimous + "), orientation " + a.orientFail + ", partition " +
            a.partFail + ", provenance " + a.provFail +
            ", refused " + a.refused + " " + JSON.stringify(a.reasons));
    }
}

// =============================================================================================================
console.log("\n4. *** THE SNAP TOLERANCE IS A REAL TOLERANCE, NOT A HOPE ***");
{
    // Crack B on purpose: move the prism corner (3,3,1) by `gap` in x in ONE triangle only, so the two B-triangles
    // that share it no longer agree -- the crossing points they compute on z=0 then differ by gap/2. Under TOL the
    // snap must merge them (a closed curve, two faces); well over TOL it must NOT, and the arrangement must refuse
    // (a curve with loose ends) rather than guess. (The first draft moved the vertex in EVERY triangle, which keeps
    // B closed and tested nothing -- it passed 30 TOL as readily as 0.3.)
    function cracked(gap) {
        const P = prism(2, 2, 3, 3);
        const k = P.findIndex((t) => t.some((v) => v[0] === 3 && v[1] === 3 && v[2] === 1));
        P[k] = P[k].map((v) => (v[0] === 3 && v[1] === 3 && v[2] === 1) ? [3 + gap, 3, 1] : v);
        return arrange(P).r;
    }
    const under = cracked(0.3 * ARRANGE_TOL), over = cracked(30 * ARRANGE_TOL);
    ok("4. a crack of 0.3 TOL in B (endpoints 0.15 TOL apart) is merged: still a closed curve, two faces",
        under.ok && under.faces.length === 2, under.ok ? "faces " + under.faces.length : "refused: " + under.reason);
    ok("   ...and a crack of 30 TOL is NOT merged -- the arrangement refuses rather than guessing",
        !over.ok, over.ok ? "accepted with " + over.faces.length + " faces" : "refused: " + over.reason);
}

console.log(`\ntriArrangement-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: robustness beyond the refusals -- any refusal sends the triangle to the " +
    "plane-cut path, so a refusal is safe but a WRONG acceptance is not, and sections 1-3 are the defence; Earcut's " +
    "own robustness on near-degenerate faces is trusted to the area checks, not proven; TOL is absolute (1e-9), so " +
    "very large or very small coordinates are exactly as limited here as in the rest of the pipeline. NO FIXTURE HERE " +
    "REACHES these refusals, which are backstops: 'endpoint outside triA' (triTriIntersect's segments lie in triA), " +
    "'overlap' (a collinear overlap from a shared vertex trips the T-junction test first), 'face walk', 'outer face', " +
    "'zero-area cycle', 'orphan hole', 'triangulation orientation' (only rounding-noise slivers ever measured clockwise, " +
    "and those are dropped first), 'triangulation area', 'face area sum' and 'boundary strip'. Section 2's title says " +
    "so; the first version of it said 'every refusal'.");
process.exit(fails ? 1 : 0);

