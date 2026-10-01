// WebGLEngine/physics/mesh/exactArrangement-selfcheck.mjs
//
// Run: node physics/mesh/exactArrangement-selfcheck.mjs
//
// BVH-CSG ROUND 16f: the gate for physics/mesh/exactArrangement.mjs. An exact arrangement is wrong in one of four ways:
// the pair's intersection is not the intersection; the triangulation is not a triangulation of the triangle (a piece
// turned over, two overlapping, a vertex left inside an edge, a vertex lost); a segment is not made of edges; or two
// triangles that share an edge split it at different points. So:
//   1. exactPair against triTriIntersectExact on random pairs, and on degenerate pairs built by hand, each the answer it is;
//   2. the arrangement's own invariants, exactly, on random triangles cut by a closed blob: every triangle positive, no
//      vertex on an edge's interior, every segment a chain of constrained edges, and the count of triangles Euler's
//      2V - B - 2, which with positivity is a tiling of the triangle;
//   3. the round's three regressions: a vertex just beside a segment (the cavity method lost it), a coplanar pair's
//      crossing on a shared side (the flush grid's T-junction), and exactInside on points a rounding from a face;
//   4. a whole mesh: the output of meshBoolean with exactArrangement closed at the EXACT-BITS key -- every edge's twin
//      the same two doubles -- on general-position fixtures.
//
// SABOTAGE LOG (round 16f) -- implicitPoints.mjs, exactArrangement.mjs, meshBoolean.mjs and blastEngine.mjs, each on the real
// file, restored and md5 verified. 15 of 15 red. Rows red in implicitPoints-selfcheck / THIS / meshBoolean-selfcheck /
// blastEngine-selfcheck (- not run):
//   Y1  rounding without the sticky bit                                   2 / 0 / - / -
//   Y2  orient2d trusting the float sign                                  1 / 6 / 4 / -
//   Y3  cmpCoord calling rounded-equal implicit points equal              1 / 1 / - / -
//   Y4  a crossing with a negative W kept                                 5 / 1 / - / -
//   Y5  in-circle's BigInt rows unscaled                                  1 / 0 / - / -
//   Y6  coplanar pairs give no points                                     0 / 3 / 1 / -
//   Y7  strictly-between reversed again (segments)                        0 / 1 / 0 / -
//         first battery: this gate THREW (the split row read r.inspect of a refusal) -- red by exit, not by a row. The row
//         now fails by name on a refusal.
//   Y8  Delaunay off by default                                           0 / 1 / - / 1
//   Y9  crossing seams refused by default                                 0 / 1 / - / -
//   Y10 no exact classification (EXACT_NEAR 0)                            0 / 0 / 1 / -
//   Y11 an untouched triangle classified at its rounded centroid          - / - / 1 / -
//   Y12 the exact output welded                                           - / - / - / 1
//   Y13 exact pairs computed with the flag off                            - / - / 7 / -
//         first battery: 2 -- section 19 read seamConsensus.last.joined, which only a run through the consensus leaves,
//         threw, and the gate stopped before section 25's "off by default" row. Read robustly now.
//   Y14 a crossing taken against the wrong plane                          0 / 1 / - / -
//   Y15 the coplanar-line crossing with its numerator turned              1 / 1 / - / -
"use strict";

import { exactPair, arrangeTriangleExact, exactInside, degenerateTri } from "./exactArrangement.mjs";
import { triTriIntersectExact } from "./triTriIntersect.mjs";
import { explicitPoint, rationalPoint, same, cmpCoord, orient2d, orient3dImplicit, incircle } from "./implicitPoints.mjs";
import { meshBoolean } from "./meshBoolean.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import * as M from "./meshCSG.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("exactArrangement-selfcheck -- the per-triangle arrangement, decided exactly\n");
let s0 = 2718; const rnd = () => { s0 = (s0 * 1664525 + 1013904223) >>> 0; return s0 / 4294967296; };
const R3 = (k = 1) => [(rnd() * 2 - 1) * k, (rnd() * 2 - 1) * k, (rnd() * 2 - 1) * k];
const d3 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const isAt = (P, x) => P && P.r[0] === x[0] && P.r[1] === x[1] && P.r[2] === x[2];
const bitsOpen = (buf) => { const key = (o) => buf[o] + "," + buf[o + 1] + "," + buf[o + 2], E = new Map();
    for (let o = 0; o < buf.length; o += 9) { const k = [key(o), key(o + 3), key(o + 6)]; for (let i = 0; i < 3; i++) if (k[i] !== k[(i + 1) % 3]) { const e = k[i] + "|" + k[(i + 1) % 3]; E.set(e, (E.get(e) || 0) + 1); } }
    let c = 0; for (const [e, n] of E) { const [a, b] = e.split("|"); if ((E.get(b + "|" + a) || 0) !== n) c++; } return c; };

console.log("1. *** exactPair: THE INTERSECTION OF TWO TRIANGLES, EVERY CASE WHAT IT IS ***");
{
    let agree = 0, n = 0, far = 0;
    for (let i = 0; i < 20000; i++) {
        const A = [R3(), R3(), R3()], B = [R3(), R3(), R3()];
        const r = triTriIntersectExact(new Float64Array(A.flat()), 0, new Float64Array(B.flat()), 0), e = exactPair(A, B);
        n++;
        if ((r.status === "intersect" ? "segment" : r.status) !== e.kind) continue;
        agree++;
        if (e.kind === "segment") far = Math.max(far, Math.min(Math.max(d3(r.p0, e.P0.r), d3(r.p1, e.P1.r)), Math.max(d3(r.p0, e.P1.r), d3(r.p1, e.P0.r))));
    }
    ok("!! 20,000 random pairs: the same verdict as round 16b's exact pair test, every one; the segments' ends within 1e-14 of its float constructions",
        agree === n && far < 1e-14, agree + " of " + n + " agree; ends within " + far.toExponential(1));
    // degenerate pairs, built on dyadic coordinates so every answer is exact
    const A = [[0, 0, 0], [2, 0, 0], [0, 2, 0]];
    const v = exactPair(A, [[0.5, 0.5, 0], [1, 0.25, 1], [0.25, 1, 1]]);
    ok("a vertex of B on A's plane, inside A, B otherwise above: a point, that vertex", v.kind === "point" && isAt(v.P, [0.5, 0.5, 0]), v.kind);
    const e = exactPair(A, [[-1, 0.5, 0], [3, 0.5, 0], [1, 0.5, 1]]);
    const eEnds = e.kind === "segment" ? [e.P0.r, e.P1.r].sort((p, q) => p[0] - q[0]) : [];
    ok("an edge of B lying in A's plane, across A: a segment, the edge clipped to A -- (0, 0.5, 0) to (1.5, 0.5, 0)",
        e.kind === "segment" && eEnds[0].join() === "0,0.5,0" && eEnds[1].join() === "1.5,0.5,0", e.kind + " " + eEnds.map((p) => p.join(",")).join(" -> "));
    const c = exactPair(A, [[1, -0.5, 0], [1.5, 1, 0], [-0.5, 1, 0]]);
    ok("coplanar overlapping triangles: 'coplanar', with the points where their edges cross", c.kind === "coplanar" && c.pts.length >= 4, c.kind + ", " + (c.pts || []).length + " points");
    const t = exactPair(A, [[2, 0, 0], [3, 1, 1], [3, -1, 1]]);
    ok("touching at a shared vertex only: a point, that vertex", t.kind === "point" && isAt(t.P, [2, 0, 0]), t.kind);
    const z = exactPair(A, [[0.5, 0.5, -1], [0.5, 0.5, 0], [0.5, 0.5, 1]]);
    ok("a triangle of exactly zero area meets nothing", z.kind === "none" && degenerateTri([[0.5, 0.5, -1], [0.5, 0.5, 0], [0.5, 0.5, 1]]), z.kind);
    const x = exactPair(A, [[0.5, 0, -1], [1.5, 0, -1], [1, 0, 1]]);
    const xEnds = x.kind === "segment" ? [x.P0.r, x.P1.r].sort((p, q) => p[0] - q[0]) : [];
    ok("B standing in the plane y = 0, across A's edge y = 0: a segment ON that edge, (0.75, 0, 0) to (1.25, 0, 0)",
        x.kind === "segment" && xEnds[0].join() === "0.75,0,0" && xEnds[1].join() === "1.25,0,0", x.kind + " " + xEnds.map((p) => p.join(",")).join(" -> "));
    const cv = exactPair(A, [[1, 0, 0], [1.5, 1, 0], [1, -1, 0]]);
    ok("coplanar, a vertex of B on A's edge: among the pair's points (strictly between the edge's ends)", cv.kind === "coplanar" && cv.pts.some((P) => isAt(P, [1, 0, 0])), cv.kind + ", " + (cv.pts || []).map((P) => P.r.join(",")).join(" | "));
}

console.log("\n2. *** THE ARRANGEMENT'S INVARIANTS, EXACTLY ***");
{
    // a random triangle cut by a closed blob that crosses it
    let cases = 0, neg = 0, onEdge = 0, notFixed = 0, euler = 0, lost = 0, refused = 0, segments = 0, illegal = 0, interior = 0;
    for (let i = 0; i < 120; i++) {
        const T = [R3(), R3(), R3()], ctr = [(T[0][0] + T[1][0] + T[2][0]) / 3, (T[0][1] + T[1][1] + T[2][1]) / 3, (T[0][2] + T[1][2] + T[2][2]) / 3];
        const blob = M.jaggedBlob(ctr.map((x, k) => x + (rnd() - 0.5) * 0.4), 0.2 + rnd() * 0.5, 4 + Math.floor(rnd() * 8), 7 + i);
        const bufA = new Float64Array(T.flat()), bufB = M.toTriangleBuffer(blob);
        const cands = Array.from({ length: bufB.length / 9 }, (_, k) => k);
        const r = arrangeTriangleExact(bufA, 0, bufB, cands, { inspect: true });
        if (r.status === "untouched") continue;
        if (r.status !== "ok") { refused++; continue; }
        cases++;
        const { V, tris, fixed, segs, O, I, J } = r.inspect;
        segments += segs.length;
        const F = new Set(fixed.map(([a, b]) => (a < b ? a + "," + b : b + "," + a)));
        for (const [a, b, c] of tris) if (O(a, b, c) <= 0) neg++;
        const between = (u, v, w) => { for (let k = 0; k < 3; k++) { const s = cmpCoord(V[u], V[v], k); if (s) return cmpCoord(V[w], V[u], k) * s < 0 && cmpCoord(V[w], V[v], k) * s > 0; } return false; };
        const edges = new Set();
        for (const [a, b, c] of tris) for (const [p, q] of [[a, b], [b, c], [c, a]]) edges.add(p < q ? p + "," + q : q + "," + p);
        for (const ek of edges) { const [p, q] = ek.split(",").map(Number); for (let w = 0; w < V.length; w++) if (w !== p && w !== q && O(p, q, w) === 0 && between(p, q, w)) onEdge++; }
        for (const [u, v] of segs) {
            if (u === v) continue;
            const on = [u, v];
            for (let w = 0; w < V.length; w++) if (w !== u && w !== v && O(u, v, w) === 0 && between(u, v, w)) on.push(w);
            let k = 0; while (cmpCoord(V[u], V[v], k) === 0) k++;
            on.sort((a, b) => cmpCoord(V[a], V[b], k));
            for (let m = 0; m + 1 < on.length; m++) if (!F.has(Math.min(on[m], on[m + 1]) + "," + Math.max(on[m], on[m + 1]))) notFixed++;
        }
        const used = new Set(tris.flat());
        for (let w = 0; w < V.length; w++) if (!used.has(w)) lost++;
        // Euler for a triangulated polygon: T = 2V - B - 2, B the vertices on triA's boundary
        let Bn = 0;
        for (let w = 0; w < V.length; w++) if (w < 3 || [[0, 1], [1, 2], [2, 0]].some(([p, q]) => O(p, q, w) === 0 && between(p, q, w))) Bn++;
        if (tris.length !== 2 * V.length - Bn - 2) euler++;
        // Delaunay: no unconstrained interior edge has the far vertex strictly inside its triangle's circumcircle
        const raw = orient2d(V[0], V[1], V[2], I, J), opp = new Map();     // the frame's handedness: O is raw x this
        for (const [a, b, c] of tris) for (const [p, q, x] of [[a, b, c], [b, c, a], [c, a, b]]) opp.set(p + "," + q, x);
        for (const [a, b, c] of tris) for (const [p, q, x] of [[a, b, c], [b, c, a], [c, a, b]]) {
            if (F.has(Math.min(p, q) + "," + Math.max(p, q)) || !opp.has(q + "," + p)) continue;
            interior++;
            if (raw * incircle(V[p], V[q], V[x], V[opp.get(q + "," + p)], I, J) > 0) illegal++;
        }
    }
    ok("!! " + cases + " random triangles cut by a closed blob (" + segments + " segments): every triangle positive by exact orientation", neg === 0 && cases > 60, neg + " not positive; " + refused + " refused");
    ok("!! no vertex lies on the interior of an edge (the triangulation is conforming), and no vertex is left out of every triangle", onEdge === 0 && lost === 0, onEdge + " on an edge, " + lost + " lost");
    ok("!! every segment is a chain of constrained edges, split at every vertex exactly on it", notFixed === 0, notFixed + " pieces not an edge");
    ok("!! every case has Euler's count of triangles, 2V - B - 2: with every triangle positive, a tiling of the triangle", euler === 0, euler + " off");
    ok("!! and it is DELAUNAY: no unconstrained interior edge has the far vertex inside its circumcircle (exact in-circle)", illegal === 0 && interior > 1000, illegal + " illegal of " + interior + " edges");
}

{
    // a segment through a vertex exactly on it: B1 crosses A along y = 1 from (1,1,0) to (2,1,0); B2 touches A at (1.5,1,0)
    const A = new Float64Array([0, 0, 0, 4, 0, 0, 0, 4, 0]);
    const B = new Float64Array([0.5, 1, -1, 2.5, 1, -1, 1.5, 1, 1, 1.5, 1, 0, 1.25, 1.5, 1, 1.75, 1.5, 1]);
    const r = arrangeTriangleExact(A, 0, B, [0, 1], { inspect: true });
    // a refusal fails the row by name (with no inspect there is nothing to look at)
    const at = (x) => (r.inspect ? r.inspect.V.findIndex((P) => isAt(P, x)) : -1), F = new Set(r.inspect ? r.inspect.fixed.map(([a, b]) => Math.min(a, b) + "," + Math.max(a, b)) : []);
    const [p, m, q] = [at([1, 1, 0]), at([1.5, 1, 0]), at([2, 1, 0])];
    ok("!! a segment through a vertex lying exactly on it is split there: (1,1,0)-(1.5,1,0) and (1.5,1,0)-(2,1,0) are constrained edges, (1,1,0)-(2,1,0) is not",
        r.status === "ok" && F.has(Math.min(p, m) + "," + Math.max(p, m)) && F.has(Math.min(m, q) + "," + Math.max(m, q)) && !F.has(Math.min(p, q) + "," + Math.max(p, q)) && r.stats.splitsAt === 1,
        r.status + (r.reason ? " " + r.reason : "") + ", splits " + (r.stats && r.stats.splitsAt));
}

{
    // two seams CROSSING: the other mesh crossing itself (X1 in the plane y = 1, X2 in x = 2, through each other) -- each
    // cuts the triangle z = 0, and the cuts cross at (2, 1, 0), where the three planes meet
    const A = new Float64Array([0, 0, 0, 4, 0, 0, 0, 4, 0]);
    const B = new Float64Array([0.5, 1, -1, 3.5, 1, -1, 2, 1, 1, 2, 0, -1, 2, 2, -1, 2, 1, 1]);
    const r = arrangeTriangleExact(A, 0, B, [0, 1], { inspect: true }), r0 = arrangeTriangleExact(A, 0, B, [0, 1], { crossings: false });
    const at = (x) => r.inspect ? r.inspect.V.findIndex((P) => isAt(P, x)) : -1, F = r.inspect ? new Set(r.inspect.fixed.map(([a, b]) => Math.min(a, b) + "," + Math.max(a, b))) : new Set();
    const has = (x, y) => { const a = at(x), b = at(y); return a >= 0 && b >= 0 && F.has(Math.min(a, b) + "," + Math.max(a, b)); };
    ok("!! two seams crossing are split where the three planes meet, (2, 1, 0): four constrained edges meet there; the control (crossings:false) refuses",
        r.status === "ok" && r.stats.crossings === 1 && has([1.25, 1, 0], [2, 1, 0]) && has([2, 1, 0], [2.75, 1, 0]) && has([2, 0.5, 0], [2, 1, 0]) && has([2, 1, 0], [2, 1.5, 0]) && r0.status === "fallback" && r0.reason === "crossing segments",
        r.status + ", crossings " + (r.stats && r.stats.crossings) + "; control " + r0.status + " " + (r0.reason || ""));
}

console.log("\n3. *** THE ROUND'S REGRESSIONS ***");
{
    // (a) seed 33's blob against its copy rotated 3e-8 about (-2,1,1): B's triangle 352 has a vertex just beside a
    // segment, three of whose four spokes the segment crosses. Removing every crossed triangle left it inside the cavity.
    const rot = (P, w, th) => { const c = Math.cos(th), sn = Math.sin(th), C = 1 - c, [x, y, z] = w;
        const R = [[c + x * x * C, x * y * C - z * sn, x * z * C + y * sn], [y * x * C + z * sn, c + y * y * C, y * z * C - x * sn], [z * x * C - y * sn, z * y * C + x * sn, c + z * z * C]];
        return P.map((p) => { const vs = p.vs.map((v) => [0, 1, 2].map((r) => R[r][0] * v[0] + R[r][1] * v[1] + R[r][2] * v[2])); return { vs, pl: M.planeOf(vs) }; }); };
    const L = Math.hypot(-2, 1, 1), blob = M.jaggedBlob([0.2, -0.1, 0.05], 1, 10, 33), A = M.toTriangleBuffer(blob), B = M.toTriangleBuffer(rot(blob, [-2 / L, 1 / L, 1 / L], 3e-8));
    const by = []; for (const [a, b] of pairOverlap(new MeshBVH(A), new MeshBVH(B), 1e-6)) if (b === 352) by.push(a);
    const r = arrangeTriangleExact(B, 352, A, by, { inspect: true });
    const used = r.status === "ok" ? new Set(r.inspect.tris.flat()) : new Set();
    ok("!! the vertex beside a segment (seed 33's copy rotated 3e-8, B's triangle 352): arranged, every vertex in a triangle -- edge flipping never removes one",
        r.status === "ok" && used.size === r.inspect.V.length, r.status + (r.reason ? " " + r.reason : "") + (r.inspect ? ", " + used.size + " of " + r.inspect.V.length + " vertices used" : ""));
    // (b) the flush grid: B's face x = 0.75 lies on A's; B's diagonal crosses A's edge x = 0.75, z = -0.75 at y = -0.25.
    // A's side triangle there is coplanar with B's -- it must still get the point, or the bottom triangle across the edge,
    // which meets B's triangle out of the plane, splits the edge alone
    const PA = M.boxPolys([0, 0, 0.25], [0.75, 0.5, 1]), PB = M.boxPolys([1, -0.25, -0.75], [0.25, 0.75, 0.5]);
    const bA = M.toTriangleBuffer(PA), bB = M.toTriangleBuffer(PB);
    const out = meshBoolean(bA, new MeshBVH(bA), bB, new MeshBVH(bB), "subtract", { exactArrangement: true });
    let sidePt = 0;
    for (let o = 0; o < out.tris.length; o += 3) if (out.tris[o] === 0.75 && out.tris[o + 1] === -0.25 && out.tris[o + 2] === -0.75) sidePt++;
    ok("!! a coplanar pair's crossing on a shared side (the flush grid's case 1): both triangles split the edge at (0.75, -0.25, -0.75), and the result is closed bit for bit",
        sidePt > 0 && bitsOpen(out.tris) === 0, "uses of the point " + sidePt + ", open edges " + bitsOpen(out.tris));
    // (c) exactInside a rounding from a face: the box [-0.75, 0.75]^3, points 2^-60 inside and outside its faces, and the
    // same box rotated 0.7 about z (faces no longer on the grid), against the truth from the six face planes
    const box = M.toTriangleBuffer(M.boxPolys([0, 0, 0], [0.75, 0.75, 0.75])), bvh = new MeshBVH(box);
    let wrong = 0, undecided = 0, n = 0;
    for (const sgn of [-1, 1]) for (let i = 0; i < 40; i++) {
        const y = Math.round((rnd() * 2 - 1) * 64) / 128, z = Math.round((rnd() * 2 - 1) * 64) / 128;
        // x = 0.75 + sgn * 2^-60, exactly, as X*2^E/W: 0.75 = 3*2^-2
        const P = rationalPoint((3n << 58n) + BigInt(sgn), BigInt(Math.round(y * 128)) << 53n, BigInt(Math.round(z * 128)) << 53n, 1n, -60);
        const got = exactInside(P, box, bvh); n++;
        if (got === null) undecided++; else if (got !== (sgn < 0)) wrong++;
    }
    const rz = (p) => [p[0] * Math.cos(0.7) - p[1] * Math.sin(0.7), p[0] * Math.sin(0.7) + p[1] * Math.cos(0.7), p[2]];
    const rbox = M.toTriangleBuffer(M.boxPolys([0, 0, 0], [0.75, 0.75, 0.75]).map((p) => { const vs = p.vs.map(rz); return { vs, pl: M.planeOf(vs) }; })), rbvh = new MeshBVH(rbox);
    let rwrong = 0, rn = 0, onFace = 0;
    for (let i = 0; i < 200; i++) {
        // a point a rounding off a face: the face's centroid nudged by a few ulps along a random direction
        const t = Math.floor(rnd() * 12), o = t * 9, c = [0, 1, 2].map((k) => (rbox[o + k] + rbox[o + 3 + k] + rbox[o + 6 + k]) / 3);
        const p = c.map((x) => x + (rnd() - 0.5) * 4e-16), P = explicitPoint(p);
        // truth: the side of the face triangle the point sits on (Shewchuk's orient3d > 0: below a face CCW from outside).
        // Not "below all twelve planes": rotated, a face's two triangles fold by ~1e-17 -- as much as the nudge.
        const side = orient3dImplicit(explicitPoint([rbox[o], rbox[o + 1], rbox[o + 2]]), explicitPoint([rbox[o + 3], rbox[o + 4], rbox[o + 5]]), explicitPoint([rbox[o + 6], rbox[o + 7], rbox[o + 8]]), P);
        if (side === 0) { onFace++; continue; }       // ON the surface: neither side (exactInside's contract excludes it)
        const inside = side > 0, got = exactInside(P, rbox, rbvh); rn++;
        if (got !== inside) rwrong++;
    }
    ok("!! exactInside: 80 points 2^-60 either side of a face of the box, and " + rn + " points a few ulps off a face of the box rotated 0.7 -- each on its own side",
        wrong === 0 && undecided === 0 && rwrong === 0 && rn > 150, wrong + " + " + rwrong + " wrong, " + undecided + " undecided (of " + (n + rn) + "); " + onFace + " drawn exactly ON a face, skipped");
}

console.log("\n4. *** A WHOLE MESH, CLOSED BIT FOR BIT ***");
{
    // general-position fixtures: every edge's twin is the same two doubles -- no weld, no census key
    let open = 0, runs = 0, fb = 0;
    for (let k = 0; k < 4; k++) {
        const PA = M.jaggedBlob([0, 0, 0], 1, 8, 100 + k), PB = M.jaggedBlob([0.5 * k - 0.6, 0.2, 0.1], 0.9, 8, 500 + k);
        const A = M.toTriangleBuffer(PA), B = M.toTriangleBuffer(PB);
        for (const op of ["union", "subtract", "intersect"]) {
            const r = meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), op, { exactArrangement: true });
            open += bitsOpen(r.tris); runs++; fb += r.stats.a.fallbackTris + r.stats.b.fallbackTris;
        }
    }
    ok("!! " + runs + " blob-pair runs, exact arrangement: every edge's twin is the same two doubles (closed at the exact-bits key), no fallback", open === 0 && fb === 0, open + " open, " + fb + " fallbacks");
}

console.log(`\nexactArrangement-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: features finer than a rounding -- twin surfaces 1e-17..1e-25 apart, at a rotation's " +
    "axis -- cannot keep their exact topology once their coordinates are rounded to doubles: distinct points round alike and " +
    "a few edges go unpaired at the exact-bits key, all shorter than 1e-16 (closed at the page's 1e-9 census; snap rounding " +
    "of the output would be the fix); and two seams crossing (the other mesh crossing itself) are split where the three planes " +
    "meet in THIS triangle only -- the other mesh's own triangles are not arranged against each other, so the triangles " +
    "across the fold do not get that point (a T-junction, at a rounding's scale on the page's chains).");
process.exit(fails ? 1 : 0);
