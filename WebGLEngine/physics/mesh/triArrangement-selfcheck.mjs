// WebGLEngine/physics/mesh/triArrangement-selfcheck.mjs
//
// Run: node physics/mesh/triArrangement-selfcheck.mjs
//
// ROUND 9 OF THE BVH-CSG ARC: the gate for physics/mesh/triArrangement.mjs, the segment-bounded cutter. What
// it can be wrong about, and the section that would see it:
//   1. THE ARRANGEMENT BY HAND -- face counts, face areas, holes, and the refusals, on fixtures whose answer
//      needs no code: one T, a handful of B's, every number derived on paper first.
//   2. PARTITION PROPERTIES ON 200 RANDOM CASES -- faces tile T (areas), every triangle wound like T and on T's
//      plane, every segment end kept as a vertex, and NO SEGMENT CROSSES ANY OUTPUT TRIANGLE'S INTERIOR (the
//      property per-face classification rests on).
//   3. THE CLASSIFICATION AUDIT -- per-face classification (one pointInMesh per face) against each triangle's
//      own, on the blast workload. Triangles whose OWN classification, or whose face's, is not unanimous (some
//      ray direction disagreed) are skipped and COUNTED, not silently folded in.
//   4. THE SEAM IS BUILT ONCE -- triTriIntersect(a, b) and triTriIntersect(b, a) return bit-identical endpoint
//      sets, which is why A's and B's arrangements meet vertex for vertex; measured over every intersecting pair
//      of the blast workload.
//   5. THE REFUSAL CENSUS -- which refusal reasons a fixture in this file actually reaches, and which remain
//      defensive only, printed by name rather than implied covered.
//
// FIVE FIXTURES HERE, AND THE CENSUS, WERE WRONG BEFORE THE MODULE WAS: 1d's first B was never built (the draft left scratch code);
// 1i's first loop (a 1 x 1.5e-9 rectangle) lost its short sides as point contacts and was refused 'dangling';
// 1l's hand value ignored that 1+1e-4 is not representable, and its tolerance then ignored the input's own
// rounding; 1m's first squares overhung T's hypotenuse and crossed on diagonal midpoints; 1n's outer square
// touched the hypotenuse at (2,2). In each, the module's answer was right for the geometry actually built --
// found by computing the geometry by hand a second time, not by loosening the check. The census's first draft
// read only literal reasons and went red on 'coplanar'/'degenerate', which reach refuse() as r.status.
//
// SABOTAGE LOG -- each applied to the real file, all three round-9 gates run (THIS / meshBoolean-selfcheck /
// meshBooleanBlast-selfcheck), file restored in a `finally` and md5 verified. Reds counted on the final files:
//   A1  mirror by the dropped normal's sign alone (the round's bug (a))      -> 1 / 4 / 5   (1k)
//   A2  no ring simplification before Earcut (bug (c))                       -> 2 / 1 / 2   (1c, sliver height)
//   A3  absorbed runs never fanned back                                      -> 6 / 3 / 5
//   A4  degenerate cycle = |area| <= 1e-9 x area(T) (bug (d))                -> 1 / 0 / 2   (1l)
//   A5  area tolerances relative to area only (bug (e))                      -> 1 / 0 / 2   (1j)
//   A6  shoelace about T's corner, not the face's own vertex (bug (f))       -> 12 / 4 / 6
//   A7  a degree-1 vertex not refused                                        -> 2 / 0 / 0   (1g; the census,
//       incidentally -- its literal is gone)
//   A8  a hole given to the LARGEST containing face                          -> 1 / 0 / 0   (1n; added for it)
//   A9  coplanar/degenerate pairs skipped instead of refusing the triangle   -> 3 / 7 / 0
//   A11 vertex-on-edge splitting only on T's own sides                       -> 1 / 0 / 0   (1o -- which went 0/0/0
//       on its first run; 1o was added for it)
//   A10 a crossing registered on only one of its two edges                   -> 0 / 0 / 0
//   A10b ...on neither                                                       -> 0 / 0 / 0
//       NOT A MISSING CHECK, A REDUNDANCY, MEASURED: step 4 re-finds every crossing within snap of both edges
//       (1m's two crossings come out the same). The registration matters only when a crossing snaps onto an
//       existing vertex more than snap from one edge; no fixture builds that. Stated in the module at step 3.
//   M1  meshBoolean drops a refused triangle instead of taking the plane path -> 0 / 11 / 2
//   M2  MESH_BOOLEAN_DEFAULT_CUTTING back to "plane"                        -> 0 / 5 / 6
//   M3  every face classified at its triangle's centroid, not its own sample  -> 0 / 12 / 12
"use strict";

import { arrangeTriangle, SNAP_EPS } from "./triArrangement.mjs";
import { triTriIntersect } from "./triTriIntersect.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { groupCandidatesByTriA } from "./triFragmentAccumulate.mjs";
import { pointInMesh } from "./meshPointClassify.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import * as M from "./meshCSG.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const info = (s) => console.log("  ..... " + s);
const buf = (tris) => { const b = new Float64Array(tris.length * 9); tris.forEach((t, i) => t.forEach((v, j) => v.forEach((x, c) => { b[i * 9 + j * 3 + c] = x; }))); return b; };
const all = (b) => [...Array(b.length / 9).keys()];
const T = buf([[[0, 0, 0], [4, 0, 0], [0, 4, 0]]]);   // area 8, in z=0, counter-clockwise seen from +z
const reached = new Set();
const run = (B) => { const r = arrangeTriangle(T, 0, B, all(B)); if (r.status === "fallback") reached.add(r.reason); return r; };
const areas = (r) => r.faces.map((f) => f.area).sort((a, b) => a - b);
// a vertical prism over the 2D polygon `poly`, z in [z0, z1], closed, outward-wound, sides as two triangles each
function prism(poly, z0, z1) {
    const out = [], n = poly.length;
    for (let i = 0; i < n; i++) {
        const [a, b] = [poly[i], poly[(i + 1) % n]];
        const a0 = [a[0], a[1], z0], b0 = [b[0], b[1], z0], a1 = [a[0], a[1], z1], b1 = [b[0], b[1], z1];
        out.push([a0, b0, b1], [a0, b1, a1]);
    }
    for (let i = 1; i + 1 < n; i++) {
        out.push([[poly[0][0], poly[0][1], z1], [poly[i][0], poly[i][1], z1], [poly[i + 1][0], poly[i + 1][1], z1]]);
        out.push([[poly[0][0], poly[0][1], z0], [poly[i + 1][0], poly[i + 1][1], z0], [poly[i][0], poly[i][1], z0]]);
    }
    return buf(out);
}

// =============================================================================================================
console.log("1. *** THE ARRANGEMENT BY HAND ***");
{
    // 1a. nothing to cut: a B far away, and a B whose box meets T's but which misses it.
    const far = run(buf([[[10, 10, -1], [11, 10, -1], [10, 11, 1]]]));
    const near = run(buf([[[3, 3, -1], [4, 3, -1], [3.5, 3.5, 1]]]));   // above the hypotenuse x+y=4: misses T
    ok("1a. no candidate crosses T -> 'untouched' (the caller classifies T whole)",
        far.status === "untouched" && near.status === "untouched", far.status + " / " + near.status);

    // 1b. one straight cut: B is a big vertical triangle in the plane x=1; at z=0 it spans y in [-5,5], so the
    // segment is (1,0)-(1,3), both ends on T's sides. By hand: x<1 is int_0^1 (4-x) dx = 3.5, the rest 4.5.
    const b = run(buf([[[1, -10, -5], [1, 10, -5], [1, 0, 5]]]));
    const ab = b.status === "ok" ? areas(b) : [];
    ok("1b. one straight cut -> 2 faces of area 3.5 and 4.5 (by hand), no holes",
        b.status === "ok" && ab.length === 2 && Math.abs(ab[0] - 3.5) < 1e-14 && Math.abs(ab[1] - 4.5) < 1e-14 &&
        b.stats.holeCount === 0, b.status + " " + JSON.stringify(ab));

    // 1c. a closed loop inside T: a vertical triangular prism over (1,1),(2,1),(1,2), z in [-1,1]. Each side is
    // two triangles whose segments are COLLINEAR, meeting where the quad's diagonal crosses z=0 -- the vertex
    // Earcut would drop and triArrangement.mjs absorbs and puts back. By hand: inner 0.5, outer 7.5 with a hole.
    const c = run(prism([[1, 1], [2, 1], [1, 2]], -1, 1));
    const ac = c.status === "ok" ? areas(c) : [];
    const cHoles = c.status === "ok" ? c.faces.map((f) => f.holes).sort() : [];
    ok("1c. a loop strictly inside T -> 2 faces, 0.5 and 7.5 (by hand), the larger with ONE hole",
        c.status === "ok" && ac.length === 2 && Math.abs(ac[0] - 0.5) < 1e-14 && Math.abs(ac[1] - 7.5) < 1e-14 &&
        JSON.stringify(cHoles) === "[0,1]", c.status + " " + JSON.stringify(ac) + " holes " + JSON.stringify(cHoles));
    // the three diagonal crossings are on the loop, collinear with its corners: all six loop vertices must be
    // used by BOTH faces' triangles, or the two faces would meet with a T-junction
    if (c.status === "ok") {
        const key = (p) => p.join(",");
        const used = c.faces.map((f) => new Set(f.tris.flat().map(key)));
        const loop = [];
        for (let i = 0; i < c.faces.length; i++) if (c.faces[i].holes === 0) for (const t of c.faces[i].tris) for (const p of t) loop.push(key(p));
        const loopSet = new Set(loop);
        ok("1c. ...its 6 loop vertices (3 corners, 3 collinear diagonal crossings) appear in BOTH faces' triangles",
            loopSet.size === 6 && [...loopSet].every((k) => used[0].has(k) && used[1].has(k)) && c.stats.absorbed >= 3,
            "loop vertices " + loopSet.size + ", absorbed and put back " + c.stats.absorbed);
    }

    // 1d. a segment end 1e-10 INSIDE the hypotenuse (within snap): B in the plane x=1 spanning y in [-5, 3-e] at
    // z=0, e=1e-10. The end is kept where it is and split into the hypotenuse, so the two faces leave the thin
    // triangle (4,0),(0,4),(1,3-e) uncovered: by hand 0.5 * |(-4)(3-e) - 4(-3)| = 2e = 2e-10. Pinned, not
    // required to be zero -- it is within the module's own area tolerance (snap x perimeter), by design.
    {
        const e = 1e-10, yTop = 3 - e;
        // a triangle in x=1: edge (y=-5,z=-1)-(y=-5,z=1) crosses z=0 at y=-5; edge (y=-5,z=1)-(y=2yTop+5,z=-1)
        // crosses it at y = yTop. So its z=0 section is y in [-5, yTop]: from below T to 1e-10 short of T's side.
        const P = [[1, -5, -1], [1, -5, 1], [1, 2 * yTop + 5, -1]];
        const r = run(buf([P]));
        const seg = triTriIntersect(T, 0, buf([P]), 0);
        const yEnd = seg.status === "intersect" ? Math.max(seg.p0[1], seg.p1[1]) : NaN;
        const sum = r.status === "ok" ? r.faces.reduce((s, f) => s + f.area, 0) : NaN;
        const want = 8 - 2 * (3 - yEnd);   // the uncovered sliver is 2 x (distance along y below the hypotenuse)
        ok("1d. a segment end 1e-10 inside T's hypotenuse is accepted, and the faces fall short of 8 by exactly the sliver",
            r.status === "ok" && r.faces.length === 2 && Math.abs(3 - yEnd - e) < 1e-15 && Math.abs(sum - want) < 1e-14 && 8 - sum > 1e-10,
            "end at y=3-" + (3 - yEnd).toExponential(3) + ", faces sum " + sum + " = 8 - " + (8 - sum).toExponential(3) +
            " (by hand 2e = " + (2 * e).toExponential(1) + ")");
    }

    // 1j. THE SAME CONSTRUCTION AT 1/100 SIZE -- the chain-shot-6 regression. A tolerance relative to T's area
    // alone (the first draft's: 1e-9 x area) refused a triangle whose segment end lay 1e-10 off its side as
    // 'outer face'. Here T has sides 0.04 (area 8e-4, so that tolerance is 8e-13) and the sliver is s*e/2 = 2e-12;
    // the tolerance is snap x perimeter (1.4e-10) now, and the arrangement is accepted.
    {
        const s = 0.04, e = 1e-10, yTop = 0.03 - e;
        const Ts = buf([[[0, 0, 0], [s, 0, 0], [0, s, 0]]]);
        const P = [[0.01, -0.05, -0.01], [0.01, -0.05, 0.01], [0.01, 2 * yTop + 0.05, -0.01]];
        const r = arrangeTriangle(Ts, 0, buf([P]), [0]);
        if (r.status === "fallback") reached.add(r.reason);
        const sum = r.status === "ok" ? r.faces.reduce((a, f) => a + f.area, 0) : NaN;
        ok("1j. ...and at 1/100 size, where an area-relative tolerance refused it ('outer face', chain shot 6), it is accepted",
            r.status === "ok" && r.faces.length === 2 && Math.abs(s * s / 2 - sum - s * e / 2) < 1e-15,
            r.status + (r.reason ? " " + r.reason : "") + ", faces short of T by " + (s * s / 2 - sum).toExponential(3) +
            " (by hand s*e/2 = " + (s * e / 2).toExponential(1) + ")");
    }

    // 1k. 1b's cut in all six axis orientations of T (dominant normal +-x, +-y, +-z). The first draft mirrored the
    // 2D frame by the sign of the dropped normal component alone; with y dropped, (x,z) is a left-handed pair, so
    // every y-dominant triangle came out clockwise and was refused -- 28 of 224 blob triangles at subdiv 8.
    {
        const perm = [(p) => p, (p) => [p[1], p[2], p[0]], (p) => [p[2], p[0], p[1]]];   // z-, x-, y-dominant
        const flip = (t) => [t[0], t[2], t[1]];
        const res = [];
        for (const f of perm) for (const neg of [false, true]) {
            const t = [[0, 0, 0], [4, 0, 0], [0, 4, 0]].map(f), b = [[1, -10, -5], [1, 10, -5], [1, 0, 5]].map(f);
            const r = arrangeTriangle(buf([neg ? flip(t) : t]), 0, buf([b]), [0]);
            if (r.status === "fallback") reached.add(r.reason);
            res.push(r.status === "ok" ? JSON.stringify(areas(r)) : r.status + ":" + r.reason);
        }
        ok("1k. the same cut in all six orientations (+-x, +-y, +-z dominant) -> 3.5 / 4.5 every time",
            res.every((x) => x === "[3.5,4.5]"), res.join(" "));
    }
    // 1l. a GENUINE loop far smaller than T: a prism over a right triangle of legs 1e-4 inside T -- area 5e-9,
    // perimeter 3.4e-4, so 5e-9 >> snap x perimeter (3.4e-13). The first draft called a cycle degenerate below
    // 1e-9 x area(T) (8e-9 here) and refused it; at subdiv 64 two wall triangles fell back that way, over spike
    // tips grazing the wall face (loops of area 9.3e-10 and 2.0e-8).
    {
        const L = 1e-4;
        const r = run(prism([[1, 1], [1 + L, 1], [1, 1 + L]], -1, 1));
        const a = r.status === "ok" ? areas(r) : [];
        ok("1l. a genuine loop of area 5e-9 inside T -> accepted as its own face (not refused as degenerate)",
            // By hand ((1+L)-1)^2/2 (1+1e-4 is not representable). Bound 1e-19: the loop's corners are interpolated
            // points near (1,1), each ~1e-16 off, times its perimeter 3.4e-4. The first draft's shoelace ran about
            // T's corner and read 3.0e-17 short; about the face's own vertex it reads 1.1e-20 (triArrangement.mjs).
            r.status === "ok" && a.length === 2 && Math.abs(a[0] - ((1 + L) - 1) ** 2 / 2) < 1e-19,
            r.status + (r.reason ? " " + r.reason : "") + " " + JSON.stringify(a) + ", off by " +
            (a[0] - ((1 + L) - 1) ** 2 / 2).toExponential(2));
    }

    // 1m. STEP 3's CROSSINGS. A manifold B never makes two segments cross, so nothing else here reaches them: B
    // is two OVERLAPPING square prisms, (0.5,0.5)-(1.5,1.5) and (1.1,0.8)-(2.1,1.8), as one soup, both inside T.
    // Their outlines cross at (1.5,0.8) and (1.1,1.5) -- away from every quad diagonal's crossing (the sides'
    // midpoints), so those two vertices can only come from step 3. By hand: the overlap 0.4 x 0.7 = 0.28, each
    // square's own part 0.72, the rest of T 8 - 1.72 = 6.28 with ONE hole (the union's outline) -- 4 faces.
    // (The first draft of this fixture overhung T's hypotenuse and put its crossings on diagonal midpoints; the
    // module's answer, 0.125/0.125/0.25/0.75/6.75, was right for that geometry and the hand values were not.)
    {
        const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const P1 = prism(sq(0.5, 0.5, 1.5, 1.5), -1, 1), P2 = prism(sq(1.1, 0.8, 2.1, 1.8), -1, 1);
        const B = new Float64Array(P1.length + P2.length); B.set(P1); B.set(P2, P1.length);
        const r = run(B);
        const a = r.status === "ok" ? areas(r) : [];
        ok("1m. two crossing outlines -> 2 crossings, 4 faces of 0.28 / 0.72 / 0.72 / 6.28 (by hand), one hole",
            r.status === "ok" && r.stats.crossings === 2 && a.length === 4 && r.stats.holeCount === 1 &&
            [0.28, 0.72, 0.72, 6.28].every((x, i) => Math.abs(a[i] - x) < 1e-14),
            r.status + (r.reason ? " " + r.reason : "") + " crossings " + (r.stats ? r.stats.crossings : "-") + " " + JSON.stringify(a));
    }

    // 1n. NESTED LOOPS: square (0.8,0.8)-(1.8,1.8) around square (1.1,1.1)-(1.5,1.5), one soup. The inner
    // outline's hole must go to the ANNULUS (the smallest face containing it, of another component), not to T's
    // outer face, which contains it too. By hand: inner 0.16, annulus 0.84 with one hole, the rest 7 with one hole.
    // (The first draft used (1,1)-(2,2): its corner (2,2) is ON T's hypotenuse, the square joins T's boundary, and
    // there is no hole to assign -- the module said 7 with 0 holes, correctly.)
    {
        const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const P1 = prism(sq(0.8, 0.8, 1.8, 1.8), -1, 1), P2 = prism(sq(1.1, 1.1, 1.5, 1.5), -1, 1);
        const B = new Float64Array(P1.length + P2.length); B.set(P1); B.set(P2, P1.length);
        const r = run(B);
        const fs = r.status === "ok" ? r.faces.map((f) => [f.area, f.holes]).sort((p, q) => p[0] - q[0]) : [];
        ok("1n. nested loops -> 0.16 (no hole) / 0.84 (one hole) / 7 (one hole): each hole in the SMALLEST face around it",
            fs.length === 3 && [[0.16, 0], [0.84, 1], [7, 1]].every(([a, h], i) => Math.abs(fs[i][0] - a) < 1e-14 && fs[i][1] === h),
            r.status + (r.reason ? " " + r.reason : "") + " " + JSON.stringify(fs));
    }

    // 1o. STEP 4 ON SEGMENTS, NOT ONLY ON T's SIDES: a square prism (0.5,0.5)-(1.5,1.5) and a rectangle prism
    // (1.5,0.7)-(2.5,1.3) sharing the line x=1.5 for y in [0.7,1.3]. The rectangle's corners (1.5,0.7) and
    // (1.5,1.3) land INSIDE the square's segments (a T-junction a manifold B never makes), and the shared stretch
    // is two collinear copies of one edge. By hand: the square 1, the rectangle 0.6, the rest 8 - 1.6 = 6.4 with
    // ONE hole (their joint outline). Added after sabotage A11 (split only T's sides) went 0 red in every gate.
    {
        const sq = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        const P1 = prism(sq(0.5, 0.5, 1.5, 1.5), -1, 1), P2 = prism(sq(1.5, 0.7, 2.5, 1.3), -1, 1);
        const B = new Float64Array(P1.length + P2.length); B.set(P1); B.set(P2, P1.length);
        const r = run(B);
        const fs = r.status === "ok" ? r.faces.map((f) => [f.area, f.holes]).sort((p, q) => p[0] - q[0]) : [];
        ok("1o. segment ends inside other segments -> split there: faces 0.6 / 1 / 6.4 (one hole), by hand",
            fs.length === 3 && [[0.6, 0], [1, 0], [6.4, 1]].every(([a, h], i) => Math.abs(fs[i][0] - a) < 1e-14 && fs[i][1] === h),
            r.status + (r.reason ? " " + r.reason : "") + " " + JSON.stringify(fs));
    }

    // 1e..1h. the refusals a fixture can reach, each the plane path's to take instead.
    const cop = run(buf([[[1, 1, 0], [2, 1, 0], [1, 2, 0]]]));
    ok("1e. a B-triangle coplanar with T -> refused 'coplanar'", cop.status === "fallback" && cop.reason === "coplanar", cop.reason);
    const deg = run(buf([[[-1, -1, -5], [5, 5, -5], [2, 2, 5]]]));   // plane x=y passes through T's corner (0,0,0)
    ok("1f. a B plane through T's corner (a vertex on the other's plane) -> refused 'degenerate'",
        deg.status === "fallback" && deg.reason === "degenerate", deg.reason);
    const dang = run(buf([[[1, 1, -1], [3, 1, -1], [2, 1, 1]]]));   // open B: a segment y=1, x in [1.5,2.5], ends inside T
    ok("1g. an OPEN B whose segment ends inside T -> refused 'dangling' (the face it sits in could not be classified by one point)",
        dang.status === "fallback" && dang.reason === "dangling", dang.reason);
    // a loop thinner than snap: prism over (1,1),(2,1),(1.5,1+4e-10). Its apex is within snap of the base edge,
    // so it is split into it, the loop collapses onto a path, and the path's ends dangle.
    const thin = run(prism([[1, 1], [2, 1], [1.5, 1 + 4e-10]], -1, 1));
    ok("1h. a closed loop thinner than snap collapses to a path and is refused (never classified as a face)",
        thin.status === "fallback" && (thin.reason === "dangling" || thin.reason === "zero-area cycle"), thin.reason);
    // a loop whose every vertex is more than snap from every other edge (so nothing collapses) but whose area is
    // under snap x perimeter: a triangle, base 1, apex 3e-9 high -- area 1.5e-9 against 1e-9 x 2.0 = 2.0e-9. (A
    // 1 x 1.5e-9 RECTANGLE does not reach this: its 1.5e-9 sides are cut in two by the quads' diagonals, each half
    // is shorter than snap and dropped as a point contact, and the open loop is refused 'dangling' instead.)
    const sliver = run(prism([[1, 1], [2, 1], [1.5, 1 + 3e-9]], -1, 1));
    ok("1i. a closed loop of area 1.5e-9 and perimeter 2 (under snap x perimeter) -> refused 'zero-area cycle'",
        sliver.status === "fallback" && sliver.reason === "zero-area cycle", sliver.status + " " + sliver.reason);
    info("snap distance SNAP_EPS = " + SNAP_EPS + " (absolute, like every tolerance in this arc -- round 11 makes them relative)");
}

// =============================================================================================================
console.log("\n2. *** PARTITION PROPERTIES ON 200 RANDOM CASES (a random T against a random closed B) ***");
{
    let s = 12345;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    let okCases = 0, untouched = 0, refused = 0, faces = 0, holes = 0;
    let worstArea = 0, worstPlane = 0, badWinding = 0, lostEnds = 0, crossed = 0, triTotal = 0, minHeight = Infinity;
    for (let i = 0; i < 200; i++) {
        const P = [0, 1, 2].map(() => [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 1 - 0.5]);
        const TA = buf([P]);
        const Bp = i % 2 ? M.jaggedBlob([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], 0.6 + rnd(), 6, 1 + i)
                         : M.boxPolys([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5], [0.2 + rnd(), 0.2 + rnd(), 0.2 + rnd()]);
        const TB = M.toTriangleBuffer(Bp);
        const r = arrangeTriangle(TA, 0, TB, all(TB));
        if (r.status === "untouched") { untouched++; continue; }
        if (r.status !== "ok") { refused++; reached.add(r.reason); continue; }
        okCases++; faces += r.faces.length; holes += r.stats.holeCount;
        const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const nl = Math.hypot(...n), un = n.map((x) => x / nl), areaT = nl / 2;
        let sum = 0;
        const outTris = r.faces.flatMap((f) => f.tris);
        triTotal += outTris.length;
        for (const t of outTris) {
            const longest = Math.max(...[0, 1, 2].map((k) => Math.hypot(t[(k + 1) % 3][0] - t[k][0], t[(k + 1) % 3][1] - t[k][1], t[(k + 1) % 3][2] - t[k][2])));
            const f1 = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]], f2 = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
            const m = [f1[1] * f2[2] - f1[2] * f2[1], f1[2] * f2[0] - f1[0] * f2[2], f1[0] * f2[1] - f1[1] * f2[0]];
            const dotn = m[0] * un[0] + m[1] * un[1] + m[2] * un[2];
            if (!(dotn > 0)) badWinding++;
            minHeight = Math.min(minHeight, dotn / longest);
            sum += dotn / 2;
            for (const p of t) worstPlane = Math.max(worstPlane, Math.abs((p[0] - P[0][0]) * un[0] + (p[1] - P[0][1]) * un[1] + (p[2] - P[0][2]) * un[2]));
        }
        worstArea = Math.max(worstArea, Math.abs(sum - areaT) / areaT);
        // every segment end is an output vertex (within snap), and no segment crosses a triangle's interior
        const verts = outTris.flat();
        for (let b = 0; b < TB.length / 9; b++) {
            const g = triTriIntersect(TA, 0, TB, b);
            if (g.status !== "intersect") continue;
            for (const e of [g.p0, g.p1]) if (!verts.some((v) => Math.hypot(v[0] - e[0], v[1] - e[1], v[2] - e[2]) <= SNAP_EPS)) lostEnds++;
            for (const t of outTris) if (segmentCrossesInterior(g.p0, g.p1, t, un)) crossed++;
        }
    }
    ok("   non-vacuous: most random cases cut, and the population includes holes and many-face triangles",
        okCases > 80 && faces > 3 * okCases / 2 && holes > 0,
        okCases + " arranged, " + untouched + " untouched, " + refused + " refused; " + faces + " faces, " + holes + " holes, " + triTotal + " triangles");
    ok("!! the faces TILE T: triangle areas sum to T's within 1e-9 relative, every triangle wound like T",
        worstArea < 1e-9 && badWinding === 0, "worst relative area gap " + worstArea.toExponential(2) + ", mis-wound " + badWinding);
    // Earcut cuts ears between vertices that are collinear only to rounding (every segment end on T's sides) --
    // slivers of area 1e-17..1e-21 on the twelve-blast chain, which meshCSG's settle() then could not merge. Rings
    // are simplified before Earcut and the absorbed vertices fanned back in, so no triangle is thinner than snap.
    ok("!! no output triangle is a sliver: every triangle's height exceeds snap",
        minHeight > SNAP_EPS, "thinnest height " + minHeight.toExponential(2));
    ok("!! every output vertex lies on T's plane (to 1e-12), and every segment end is kept as a vertex",
        worstPlane < 1e-12 && lostEnds === 0, "worst off-plane " + worstPlane.toExponential(2) + ", segment ends lost " + lostEnds);
    ok("!! *** NO SEGMENT CROSSES THE INTERIOR OF ANY OUTPUT TRIANGLE *** (what one classification per face rests on)",
        crossed === 0, crossed + " crossings");
}
// Does segment p0-p1 (on T's plane) pass through the interior of triangle t by more than a snap-wide margin?
// Cyrus-Beck in t's plane: clip the segment to t's three edges pulled inward by 10 x snap; any remaining piece
// longer than snap is inside.
function segmentCrossesInterior(p0, p1, t, un) {
    let lo = 0, hi = 1;
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const inward = [un[1] * e[2] - un[2] * e[1], un[2] * e[0] - un[0] * e[2], un[0] * e[1] - un[1] * e[0]];
        const il = Math.hypot(...inward);
        const w = inward.map((x) => x / il);
        const f0 = (p0[0] - a[0]) * w[0] + (p0[1] - a[1]) * w[1] + (p0[2] - a[2]) * w[2] - 10 * SNAP_EPS;
        const fd = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
        if (Math.abs(fd) < 1e-300) { if (f0 <= 0) return false; continue; }
        const tt = -f0 / fd;
        if (fd > 0) lo = Math.max(lo, tt); else hi = Math.min(hi, tt);
        if (lo >= hi) return false;
    }
    return (hi - lo) * Math.hypot(...d) > SNAP_EPS;
}

// =============================================================================================================
console.log("\n3. *** THE CLASSIFICATION AUDIT: ONE CLASSIFICATION PER FACE AGAINST EACH TRIANGLE'S OWN ***");
{
    // meshCSG's wall against a subdiv-16 jagged blob, both directions: every arranged face's label (one ray
    // bundle from its largest triangle's centroid) against every one of its triangles' own centroid label.
    const W = M.toTriangleBuffer(M.boxPolys([0, 0, 0], [4, 3, 0.3])), Bl = M.toTriangleBuffer(M.jaggedBlob([0, 0, 0], 1.0, 16, 12345));
    const bW = new MeshBVH(W), bB = new MeshBVH(Bl);
    let facesChecked = 0, multi = 0, trisChecked = 0, disagree = 0, skippedFace = 0, skippedTri = 0;
    for (const [X, bX, Y, bY] of [[W, bW, Bl, bB], [Bl, bB, W, bW]]) {
        const g = groupCandidatesByTriA(pairOverlap(bX, bY));
        for (const [t, cands] of g) {
            const r = arrangeTriangle(X, t, Y, cands);
            if (r.status !== "ok") continue;
            for (const f of r.faces) {
                const fc = pointInMesh(bY, ...f.sample);
                if (fc.agreement < 1) { skippedFace++; continue; }
                facesChecked++; if (f.tris.length > 1) multi++;
                for (const tri of f.tris) {
                    const c = [0, 1, 2].map((k) => (tri[0][k] + tri[1][k] + tri[2][k]) / 3);
                    const tc = pointInMesh(bY, ...c);
                    if (tc.agreement < 1) { skippedTri++; continue; }
                    trisChecked++;
                    if (tc.inside !== fc.inside) disagree++;
                }
            }
        }
    }
    ok("!! every triangle's own classification agrees with its face's (unanimous ones; the rest counted, not folded in)",
        disagree === 0 && trisChecked > 500 && multi > 50,
        trisChecked + " triangles in " + facesChecked + " faces (" + multi + " with >1 triangle): " + disagree + " disagree; skipped as " +
        "non-unanimous: " + skippedFace + " faces, " + skippedTri + " triangles");
}

// =============================================================================================================
console.log("\n4. *** THE SEAM IS BUILT ONCE: triTriIntersect(a, b) AND (b, a) GIVE THE SAME POINTS, BIT FOR BIT ***");
{
    const W = M.toTriangleBuffer(M.boxPolys([0, 0, 0], [4, 3, 0.3])), Bl = M.toTriangleBuffer(M.jaggedBlob([0, 0, 0], 1.0, 16, 12345));
    const pairs = pairOverlap(new MeshBVH(W), new MeshBVH(Bl));
    let hits = 0, same = 0;
    const k = (p) => p[0] + "," + p[1] + "," + p[2];
    for (const [a, b] of pairs) {
        const x = triTriIntersect(W, a, Bl, b), y = triTriIntersect(Bl, b, W, a);
        if (x.status !== "intersect") continue;
        hits++;
        if (y.status === "intersect" && [k(x.p0), k(x.p1)].sort().join("|") === [k(y.p0), k(y.p1)].sort().join("|")) same++;
    }
    ok("!! every intersecting (wall, blob) pair gives bit-identical segment ends in both argument orders",
        hits > 100 && same === hits, same + " of " + hits + " pairs");
}

// =============================================================================================================
console.log("\n5. *** THE REFUSAL CENSUS ***");
{
    const KNOWN = ["coplanar", "degenerate", "degenerate triangle", "dangling", "face walk", "zero-area cycle", "outer face",
                   "hole unassigned", "face area sum", "thin face", "earcut", "lost edge", "dropped vertex"];
    const src = (await import("node:fs")).readFileSync(new URL("./triArrangement.mjs", import.meta.url), "utf8");
    // literal reasons, plus triTriIntersect's two unresolved statuses, which reach refuse() as r.status
    const inSource = [...src.matchAll(/refuse\("([^"]+)"/g)].map((m) => m[1]);
    if (/refuse\(r\.status/.test(src)) inSource.push("coplanar", "degenerate");
    ok("   this census names every refusal reason triArrangement.mjs can return (read from its source)",
        inSource.every((r) => KNOWN.includes(r)) && KNOWN.every((r) => inSource.includes(r)),
        "in source: " + [...new Set(inSource)].join(", "));
    info("REACHED by a fixture in this file: " + [...reached].sort().join(", "));
    info("NOT REACHED (defensive; each returns the plane path, never a wrong face): " +
         KNOWN.filter((r) => !reached.has(r)).join(", "));
}

console.log(`\ntriArrangement-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails ? 1 : 0);
