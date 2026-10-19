// WebGLEngine/physics/mesh/triArrangement.mjs
//
// *** ROUND 9 OF THE BVH-CSG ARC: SEGMENT-BOUNDED CUTTING. ONE TRIANGLE OF A, CUT ALONG THE ACTUAL SEGMENTS
// *** WHERE B CROSSES IT -- NOT ALONG B's INFINITE PLANES -- INTO FACES THAT B DOES NOT CROSS.
//
// Rounds 5-8 (triFragmentAccumulate.mjs) split a triangle of A by every candidate B-triangle's PLANE, run across
// the whole fragment it splits. Round 8 measured what that costs: 37,458 fragments from 5,360 candidates at
// jaggedBlob subdiv 64, more than 65,536 on ONE wall triangle at 128 (capped, and wrong), and pointInMesh() --
// five full rays -- run on every fragment. Both scale with how many planes a cut drags across the triangle,
// not with how much of B actually meets it.
//
// THIS FILE: for one triangle of A, ask triTriIntersect() for the segment each candidate B-triangle actually
// shares with it; snap their endpoints together (TOL); check that the segments form a clean planar graph
// inside the triangle (no crossings, no T-junctions, no loose ends); walk its faces; give each closed curve
// floating inside a face to that face as a hole; triangulate each face with its holes (Earcut, through the
// vendored three.js). The caller classifies ONE point per face: no face has B crossing its interior, because
// every place B crosses this triangle is a segment, and every segment is a face boundary -- TO WITHIN TOL: a crossing
// shorter than TOL collapses to a point and is dropped, so B can cross a face by less than that (bounded by TOL x
// perimeter; a review measured -9.1e-11 on a cube whose top face held a 0.9e-9 needle before thin triangles were
// refused, 4.8e-12 after).
//
// IT NEVER COMPUTES A VERTEX. Every output vertex is one of triA's three corners or an endpoint triTriIntersect()
// returned, bit for bit (triArrangement-selfcheck.mjs checks it). Snapping MERGES two endpoints into one of them;
// it does not move either. A consequence, measured in the gate rather than hidden (1h): an endpoint within TOL of
// triA's edge is treated as ON the edge but stays where it is, so the output can leave a sub-TOL strip along the
// edge uncovered -- 2.75e-9 of 50 on that fixture -- bounded by TOL x perimeter and checked as such.
//
// IT REFUSES RATHER THAN GUESSES. A refusal sends the triangle back to the plane-cut path (meshBoolean.mjs), which
// was gated for every case refused here; a WRONG acceptance is the only real failure, and the gate's defence
// against it is hand-derived faces, bit-exact provenance, and per-triangle classification audits on real
// workloads. Refused: a degenerate triA, or one no higher than 4 TOL; any candidate triTriIntersect() calls "coplanar" or "degenerate" (flush
// faces, shared edges -- the contacts the plane-cut path's own gates exist for); an endpoint outside triA by more
// than TOL; two segments crossing; an endpoint within TOL of another segment it does not end on (T-junction);
// collinear overlap; an interior vertex of odd degree (a curve with a loose end -- B is not closed there); a face
// walk that does not close; a component with other than one outer cycle; a cycle of exactly zero area; a hole
// with no face to sit in; a triangulation that turns clockwise or loses area; faces that do not tile the boundary
// walked; a boundary further from triA than TOL allows (those last two are assertions no input reaches -- see where
// they are made). Any exception is a refusal too, never an abort.
//
// COST, MEASURED BY THE REVIEW AND NAMED RATHER THAN FIXED: one triangle holding a dense curve stays superlinear.
// 200 long slabs beside an 8000-gon took 15 s before the validation grid was changed and 2.8 s after (18.8 million
// tests where the curve packs ~400 segments into each of a few dozen cells); Earcut is superlinear on a face holding a
// big hole -- 4.5 s of 5.8 s for a 14000-gon -- and on thousands of holes (3,160 squares, 2.2 s). The blast workloads
// are far from this (n=128: 1.3 s for the whole boolean), but a mesh far denser than its partner can reach it.
//
// TOLERANCE: ARRANGE_TOL is ABSOLUTE (1e-9), like every other tolerance in this pipeline (triTriIntersect's EPS,
// triClip's, pointInMesh's). Snapping merges endpoints closer than TOL; "on an edge" means within TOL of it.
// Coordinates are taken in a 2D frame in triA's plane anchored at its first corner.
//
// THE ROUND-9 REVIEWS, AND WHAT THEY CHANGED (two adversarial reviewers, measured on this file's first version):
//   - A triangle was dropped as a "sliver" if its area was under 1e-14 of triA's. That dropped REAL faces: a box
//     intersected with a rod 2e-7 wide lost its whole end cap -- an open hole, so its volume depends on where it
//     is measured from: 22% short about the world origin, 17% about the rod's axis -- and a needle 3e-7 wide lost
//     both caps (-33%). Now a triangle is dropped only if it is negligible in area AND its three corners lie within
//     TOL of one line: the one kind of triangle that represents nothing this pipeline can resolve.
//   - The clockwise-triangle refusal was claimed never to fire. It fired: on collinear triangles of area ~ -3e-17
//     of triA's (rounding noise), in 5 of 6 twelve-blast chains and 3 times in meshBoolean-selfcheck's own random
//     sweep -- needless fallbacks. Those are slivers and are dropped before the sign test now.
//   - A cycle's signed area was a shoelace in coordinates measured from triA's corner, which loses the sign of
//     loops below ~n*eps*L^2: a 2e-8 loop in a size-10 triangle read 0 for both its cycles, both were treated as
//     holes, and the square simply vanished. The area is now a fan from the cycle's own first vertex, and a cycle
//     of exactly zero area is refused.
// THIS FILE WAS REBUILT after the first version was lost uncommitted (the container was reclaimed). The rebuild
// was written against the reconstructed gates, which carry every fixture the reviews added; the review numbers
// quoted above were measured on the first version, and the rebuild's own are in tools/ship/nextRounds.mjs.
"use strict";

import { triTriIntersect } from "./triTriIntersect.mjs";
import { ShapeUtils, Vector2 } from "../../vendor/three/three.core.js";

export const ARRANGE_TOL = 1e-9;
const TOL = ARRANGE_TOL;

const refuse = (reason) => ({ ok: false, reason });
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

// Signed area as a fan from the ring's OWN first vertex. A round-9 review found the plain shoelace -- products of
// coordinates measured from triA's corner -- losing the sign of loops below ~n*eps*L^2: a 2e-8 loop in a size-10
// triangle read area 0 for both of its cycles, and both were then treated as holes. Differences from a nearby
// vertex keep the precision the loop's own size allows.
function polyArea(pts) {
    const x0 = pts[0][0], y0 = pts[0][1];
    let a = 0;
    for (let i = 1; i + 1 < pts.length; i++) {
        a += (pts[i][0] - x0) * (pts[i + 1][1] - y0) - (pts[i + 1][0] - x0) * (pts[i][1] - y0);
    }
    return a / 2;
}

function pointSegDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { d: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)), t };
}

// Even-odd ray cast. Called only on a hole vertex against another component's face: every vertex is more than
// TOL from every segment it does not end on (the T-junction check), so the point is never on the polygon.
function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

/**
 * Arrange B's intersection segments inside triangle `triA` of `trisA` and triangulate the faces.
 *
 * @param {Float64Array|Float32Array} trisA   flat 9-floats-per-triangle buffer
 * @param {number} triA                       triangle index into trisA
 * @param {Float64Array|Float32Array} trisB
 * @param {Iterable<number>} candidateTriBs   B-triangle indices whose boxes overlap triA's (any superset is fine)
 * @returns {{ok:true, faces:{tris:{tri:number[][], area:number}[], area:number}[], segments:number, validationTests:number} |
 *           {ok:false, reason:string}}
 *   faces: a partition of triA. face.area is the face's net area (holes removed); each output triangle carries its
 *     own area, wound with triA, and its vertices are triA's corners or triTriIntersect() endpoints, bit for bit.
 *     A face can have no triangles only if every one was a TOL-sliver. segments: interior segments kept.
 *     validationTests: vertex-segment and segment-segment tests the validation grid made (its work, for gates).
 *   On refusal, reason names the check; the caller should fall back to the plane-cut path.
 */
export function arrangeTriangle(trisA, triA, trisB, candidateTriBs) {
    try { return arrangeUnguarded(trisA, triA, trisB, candidateTriBs); }
    catch (e) { return refuse("exception: " + (e && e.message ? e.message : String(e))); }
}

function arrangeUnguarded(trisA, triA, trisB, candidateTriBs) {
    const o = triA * 9;
    const C = [[trisA[o], trisA[o + 1], trisA[o + 2]], [trisA[o + 3], trisA[o + 4], trisA[o + 5]], [trisA[o + 6], trisA[o + 7], trisA[o + 8]]];
    const e1 = [C[1][0] - C[0][0], C[1][1] - C[0][1], C[1][2] - C[0][2]], e2 = [C[2][0] - C[0][0], C[2][1] - C[0][1], C[2][2] - C[0][2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nLen = Math.hypot(n[0], n[1], n[2]), e1Len = Math.hypot(e1[0], e1[1], e1[2]);
    const triArea = nLen / 2;
    if (!(triArea > 0) || !Number.isFinite(triArea) || !(e1Len > 0)) return refuse("degenerate triA");
    // A TRIANGLE NARROWER THAN A FEW TOL CANNOT HOLD A CROSSING THE SNAP CAN RESOLVE. Every point in it is within TOL of
    // two edges, so a crossing's ends are both classified onto edges and the crossing is skipped as boundary: a round-9
    // review built a triangle 1.5e-9 wide with B over a fifth of it and got ONE face and no segments, and a cube whose
    // top face held a 0.9e-9 needle came back 9.1e-11 short with 11 unmatched edges, where the plane-cut path was exact.
    {
        const l1 = Math.hypot(C[2][0] - C[1][0], C[2][1] - C[1][1], C[2][2] - C[1][2]);
        const l2 = Math.hypot(C[0][0] - C[2][0], C[0][1] - C[2][1], C[0][2] - C[2][2]);
        if (2 * triArea / Math.max(e1Len, l1, l2) <= 4 * TOL) return refuse("thin triA");
    }

    // 2D frame in triA's plane: u along edge 0, v = n x u, so triA is counter-clockwise (positive area).
    const u = [e1[0] / e1Len, e1[1] / e1Len, e1[2] / e1Len];
    const w = [(n[1] * u[2] - n[2] * u[1]) / nLen, (n[2] * u[0] - n[0] * u[2]) / nLen, (n[0] * u[1] - n[1] * u[0]) / nLen];
    const proj = (p) => {
        const dx = p[0] - C[0][0], dy = p[1] - C[0][1], dz = p[2] - C[0][2];
        return [dx * u[0] + dy * u[1] + dz * u[2], dx * w[0] + dy * w[1] + dz * w[2]];
    };
    const C2 = C.map(proj);
    // Edge k runs corner k -> corner k+1; its inward unit normal makes signedDist(p, k) positive inside triA.
    const E = [0, 1, 2].map((k) => {
        const a = C2[k], b = C2[(k + 1) % 3], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        return { a, dx: dx / len, dy: dy / len, len };
    });
    const signedDist = (p, k) => E[k].dx * (p[1] - E[k].a[1]) - E[k].dy * (p[0] - E[k].a[0]);

    // ---- vertices: the three corners first (ids 0..2), then snapped segment endpoints ----------------------------
    const V = [];
    const cell = TOL * 4, snapGrid = new Map();
    const snapKey = (i, j) => i + "," + j;
    function insertSnap(id) {
        const p = V[id].p2, k = snapKey(Math.floor(p[0] / cell), Math.floor(p[1] / cell));
        const l = snapGrid.get(k);
        if (l) l.push(id); else snapGrid.set(k, [id]);
    }
    for (let k = 0; k < 3; k++) { V.push({ p2: C2[k], p3: C[k], corner: k, edge: -1, t: 0 }); insertSnap(k); }
    function addPoint(p3) {
        const p2 = proj(p3);
        if (!Number.isFinite(p2[0]) || !Number.isFinite(p2[1])) return -1;
        const ci = Math.floor(p2[0] / cell), cj = Math.floor(p2[1] / cell);
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
            const l = snapGrid.get(snapKey(ci + di, cj + dj));
            if (l) for (const id of l) if (Math.hypot(V[id].p2[0] - p2[0], V[id].p2[1] - p2[1]) <= TOL) return id;
        }
        let edge = -1, best = Infinity;
        for (let k = 0; k < 3; k++) {
            const d = signedDist(p2, k);
            if (d < -TOL) return -1;                                   // outside triA by more than TOL
            if (Math.abs(d) <= TOL && Math.abs(d) < best) { best = Math.abs(d); edge = k; }
        }
        const t = edge >= 0 ? (p2[0] - E[edge].a[0]) * E[edge].dx + (p2[1] - E[edge].a[1]) * E[edge].dy : 0;
        V.push({ p2, p3, corner: -1, edge, t });
        insertSnap(V.length - 1);
        return V.length - 1;
    }
    // A corner lies on edges k-1 and k; an edge vertex on its own edge; an interior vertex on none.
    const edgesOfVertex = (v) => v.corner >= 0 ? [(v.corner + 2) % 3, v.corner] : v.edge >= 0 ? [v.edge] : [];

    // ---- segments ----------------------------------------------------------------------------------------------
    const segs = [], segKey = new Set();
    for (const j of candidateTriBs) {
        const r = triTriIntersect(trisA, triA, trisB, j);
        if (r.status === "none") continue;
        if (r.status !== "intersect") return refuse(r.status);       // "coplanar" | "degenerate": not ours to cut
        const a = addPoint(r.p0), b = addPoint(r.p1);
        if (a < 0 || b < 0) return refuse("endpoint outside triA");
        if (a === b) continue;                                        // shorter than TOL: collapses to a point
        // Both ends on one edge of triA: the segment lies within TOL of that edge, which already bounds the faces.
        // (Reached only within TOL: a segment exactly along the edge means B's triangle contains the edge, which
        // triTriIntersect() reports as degenerate before this runs.)
        const ea = edgesOfVertex(V[a]), eb = edgesOfVertex(V[b]);
        if (ea.some((e) => eb.includes(e))) continue;
        const k = a < b ? a + "," + b : b + "," + a;
        if (segKey.has(k)) continue;
        segKey.add(k);
        segs.push([a, b]);
    }
    if (segs.length === 0) {
        return { ok: true, faces: [{ tris: [{ tri: [C[0], C[1], C[2]], area: triArea }], area: triArea }], segments: 0, validationTests: 0, validationVisits: 0 };
    }

    // ---- the graph: vertices that carry a segment, plus the corners ---------------------------------------------
    // A vertex no kept segment touches (its segment collapsed to a point, or lay along an edge) is LEFT OUT: it
    // bounds nothing, and kept in -- splitting a boundary edge right beside another vertex -- it is how a scrambled
    // walk gets built (the first version refused such a case only at the outer-face count).
    const deg = new Int32Array(V.length);
    for (const [a, b] of segs) { deg[a]++; deg[b]++; }
    const live = [];
    for (let i = 0; i < V.length; i++) if (V[i].corner >= 0 || deg[i] > 0) live.push(i);

    // ---- validation: crossings, T-junctions, collinear overlap, on a uniform grid over triA ---------------------
    // Geometry before degree: a curve ending ON another one has a loose end too, and "T-junction" says why.
    const work = { tests: 0, visits: 0 };
    const bad = validate(V, live, segs, C2, work);
    if (bad) return refuse(bad);
    // An interior vertex of odd degree is a curve with a loose end: B is not closed there.
    for (let i = 0; i < V.length; i++) if (V[i].corner < 0 && V[i].edge < 0 && (deg[i] & 1)) return refuse("dangling");

    // ---- half-edges: every segment both ways, every boundary piece both ways ------------------------------------
    const edges = segs.slice();
    for (let k = 0; k < 3; k++) {
        const on = [];
        for (const i of live) if (V[i].corner < 0 && V[i].edge === k) on.push(i);
        on.sort((p, q) => V[p].t - V[q].t);
        const chain = [k, ...on, (k + 1) % 3];
        for (let i = 0; i + 1 < chain.length; i++) edges.push([chain[i], chain[i + 1]]);
    }
    const H = edges.length * 2;
    const from = new Int32Array(H), to = new Int32Array(H);
    edges.forEach(([a, b], i) => { from[2 * i] = a; to[2 * i] = b; from[2 * i + 1] = b; to[2 * i + 1] = a; });
    const twin = (h) => h ^ 1;
    const out = new Map();
    for (let h = 0; h < H; h++) { const l = out.get(from[h]); if (l) l.push(h); else out.set(from[h], [h]); }
    const ang = new Float64Array(H);
    for (let h = 0; h < H; h++) ang[h] = Math.atan2(V[to[h]].p2[1] - V[from[h]].p2[1], V[to[h]].p2[0] - V[from[h]].p2[0]);
    const slot = new Int32Array(H);
    for (const l of out.values()) { l.sort((p, q) => ang[p] - ang[q]); l.forEach((h, i) => { slot[h] = i; }); }

    // ---- union-find components --------------------------------------------------------------------------------
    const parent = new Map();
    const find = (x) => { let r = x; while (parent.get(r) !== r) r = parent.get(r); while (parent.get(x) !== r) { const nx = parent.get(x); parent.set(x, r); x = nx; } return r; };
    for (const i of live) parent.set(i, i);
    for (const [a, b] of edges) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }

    // ---- face walk: next = the edge just clockwise of the twin, so a face lies to the LEFT of its edges --------
    const seen = new Uint8Array(H);
    const cycles = [];
    for (let h0 = 0; h0 < H; h0++) {
        if (seen[h0]) continue;
        const vs = [];
        let h = h0, steps = 0;
        do {
            if (seen[h] || steps++ > H) return refuse("face walk");
            seen[h] = 1;
            vs.push(from[h]);
            const t = twin(h), l = out.get(to[h]);
            h = l[(slot[t] - 1 + l.length) % l.length];
        } while (h !== h0);
        const area = polyArea(vs.map((i) => V[i].p2));
        if (area === 0) return refuse("zero-area cycle");      // its side cannot be told: never guess which it is
        cycles.push({ vs, area, comp: find(vs[0]) });
    }
    const mainComp = find(0);
    const bounded = [], negByComp = new Map();
    for (const c of cycles) {
        if (c.area > 0) bounded.push(c);
        else negByComp.set(c.comp, (negByComp.get(c.comp) || []).concat([c]));
    }
    // Every connected component has exactly one outer (clockwise) cycle: for the one holding triA's boundary it is
    // the walk around triA itself; for a closed curve floating inside, it is that curve's outline -- a hole.
    for (const [comp, l] of negByComp) if (l.length !== 1) return refuse("outer face");
    if (!negByComp.has(mainComp)) return refuse("outer face");

    // ---- holes: each floating outline goes to the SMALLEST face of another component that contains it ---------
    for (const f of bounded) {
        f.holes = []; f.poly = f.vs.map((i) => V[i].p2);
        f.box = [Infinity, Infinity, -Infinity, -Infinity];
        for (const q of f.poly) { if (q[0] < f.box[0]) f.box[0] = q[0]; if (q[1] < f.box[1]) f.box[1] = q[1]; if (q[0] > f.box[2]) f.box[2] = q[0]; if (q[1] > f.box[3]) f.box[3] = q[1]; }
    }
    for (const [comp, [h]] of negByComp) {
        if (comp === mainComp) continue;
        const p = V[h.vs[0]].p2;
        let best = null;
        for (const f of bounded) {
            if (f.comp === h.comp) continue;
            if (p[0] < f.box[0] || p[0] > f.box[2] || p[1] < f.box[1] || p[1] > f.box[3]) continue;
            if ((!best || f.area < best.area) && pointInPoly(p, f.poly)) best = f;
        }
        if (!best) return refuse("orphan hole");
        best.holes.push(h);
    }

    // ---- triangulate each face with its holes ------------------------------------------------------------------
    const faces = [];
    let facesTotal = 0;
    for (const f of bounded) {
        const ids = f.vs.slice();
        const contour = f.vs.map((i) => new Vector2(V[i].p2[0], V[i].p2[1]));
        const holes = f.holes.map((h) => { ids.push(...h.vs); return h.vs.map((i) => new Vector2(V[i].p2[0], V[i].p2[1])); });
        let faceArea = f.area;
        for (const h of f.holes) faceArea += h.area;                 // a hole's outline is clockwise: negative
        facesTotal += faceArea;
        const ts = [];
        let sum = 0;
        for (const [ia, ib, ic] of ShapeUtils.triangulateShape(contour, holes)) {
            const a = ids[ia], b = ids[ib], c = ids[ic];
            const pa = V[a].p2, pb = V[b].p2, pc = V[c].p2;
            const ar = orient(pa, pb, pc) / 2;
            sum += ar;
            // A SLIVER IS DEGENERATE AT THIS FILE'S TOLERANCE, NOT MERELY SMALL. The first version dropped any
            // triangle under 1e-14 of triA's area, and two round-9 reviewers each found that drops REAL faces: a
            // box intersected with a rod 2e-7 wide lost its whole end cap -- an open hole, so its volume depends on
            // where it is measured from: 22% short about the world origin, 17% about the rod's axis -- and a 3e-7
            // needle through a box lost both caps (-33%). A triangle is now dropped only if it is negligible
            // in area AND its height over its longest edge is within TOL -- i.e. its three corners lie within TOL
            // of one line, the one kind of triangle that represents nothing this pipeline can resolve.
            const maxEdge = Math.max(Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), Math.hypot(pc[0] - pb[0], pc[1] - pb[1]),
                                     Math.hypot(pa[0] - pc[0], pa[1] - pc[1]));
            if (Math.abs(ar) <= 1e-14 * triArea && 2 * Math.abs(ar) <= TOL * maxEdge) continue;
            // Earcut (three's ShapeUtils) emits its triangles counter-clockwise. The first version REFUSED any
            // clockwise triangle and claimed the check never fired; the reviews measured it firing -- on collinear
            // triangles of area ~ -3e-17 of triA's, rounding noise, needlessly sending the triangle to the fallback
            // in 5 of 6 twelve-blast chains. Those are slivers and are dropped just above; a clockwise triangle
            // that is NOT a sliver is still refused, because guessing a fix is how a face ships inside out.
            if (ar < 0) return refuse("triangulation orientation");
            ts.push({ tri: [V[a].p3, V[b].p3, V[c].p3], area: ar });
        }
        if (!(Math.abs(sum - faceArea) <= 1e-9 * triArea)) return refuse("triangulation area");
        faces.push({ tris: ts, area: faceArea });
    }
    // TWO BACKSTOPS, AND WHAT THEY CAN AND CANNOT SEE -- corrected after a round-9 review measured them. The first
    // version compared the faces with triA itself, and refused 7 healthy triangles of the twelve-blast chain: an
    // endpoint within TOL of an edge counts as on it but is never moved, so the walked boundary can sit up to TOL
    // inside triA (strips of 1e-11..1e-10 on triangles of area 0.002-0.04). So the question was split in two -- and
    // the comment here then claimed the first half catches "a broken walk or a lost hole". IT CANNOT CATCH A BROKEN
    // WALK: every walk that pairs each edge with its twin gives cycles whose signed areas sum to zero per component, so
    // the faces equal the walked boundary for ANY such walk (measured: 4.3e-16 of triA over 300 random cases, 2.8e-16
    // with the walk reversed). What it does guard is the hole bookkeeping -- a hole assigned twice or silently dropped
    // breaks the sum -- and the code refuses an unassigned hole earlier ("orphan hole"), so no input reaches it. The
    // second half cannot fire either: addPoint refuses anything outside triA by more than TOL, which bounds the strip.
    // Both stay as assertions of those two facts; a broken walk is caught by "outer face" and "triangulation area".
    const outerArea = -negByComp.get(mainComp)[0].area, perimeter = E[0].len + E[1].len + E[2].len;
    if (!(Math.abs(facesTotal - outerArea) <= 1e-9 * triArea)) return refuse("face area sum");
    if (!(Math.abs(triArea - outerArea) <= TOL * perimeter + 1e-9 * triArea)) return refuse("boundary strip");
    return { ok: true, faces, segments: segs.length, validationTests: work.tests, validationVisits: work.visits };
}

// Crossings, T-junctions and collinear overlap among the kept segments, tested only between segments and vertices
// that share a cell of a uniform grid over triA. Returns a refusal reason, or null; work.tests counts the tests made.
//
// A segment is registered in the cells it PASSES THROUGH, column strip by column strip, padded by TOL -- not in every
// cell of its bounding box, and pairs are de-duplicated by a per-segment marker rather than a Set of pairs. A round-9
// review measured the first version on 200 long diagonal slabs beside an 8000-gon: each slab's box covered the whole
// grid, so every slab met every polygon segment in every cell -- 15 s for ONE triangle, 13 s of it here -- and at 400
// slabs and a 16000-gon the pair Set overflowed ("Set maximum size exceeded", refused, 47 s spent first). The grid is
// also finer (2 sqrt(n) a side rather than sqrt(n)), because a dense curve concentrates its segments in a few cells.
//
// Why a point within TOL of a segment is still found: it lies within TOL of some point q of the segment, so q's x is
// within TOL of the point's column and q's y lies between the segment's y at that column's edges widened by TOL; the
// registration covers exactly that range, widened by TOL again. Two segments that cross share the crossing point's cell.
function validate(V, live, segs, C2, work) {
    const x0 = Math.min(C2[0][0], C2[1][0], C2[2][0]) - 2 * TOL, x1 = Math.max(C2[0][0], C2[1][0], C2[2][0]) + 2 * TOL;
    const y0 = Math.min(C2[0][1], C2[1][1], C2[2][1]) - 2 * TOL, y1 = Math.max(C2[0][1], C2[1][1], C2[2][1]) + 2 * TOL;
    const G = Math.max(1, Math.min(1024, Math.ceil(2 * Math.sqrt(segs.length))));
    const cw = (x1 - x0) / G;
    const ix = (x) => { const k = Math.floor((x - x0) / (x1 - x0) * G); return k < 0 ? 0 : k >= G ? G - 1 : k; };
    const iy = (y) => { const k = Math.floor((y - y0) / (y1 - y0) * G); return k < 0 ? 0 : k >= G ? G - 1 : k; };
    const segCells = new Map(), vertCells = new Map(), cellsOf = new Array(segs.length);
    const push = (m, k, v) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); };
    segs.forEach(([a, b], s) => {
        const pa = V[a].p2, pb = V[b].p2, dx = pb[0] - pa[0], dy = pb[1] - pa[1];
        const lo = Math.min(pa[0], pb[0]) - TOL, hi = Math.max(pa[0], pb[0]) + TOL;
        const cells = [];
        for (let ci = ix(lo), c1 = ix(hi); ci <= c1; ci++) {
            // The clamped first and last columns reach past the grid, so they are unbounded on their outer side.
            const xa = Math.max(lo, ci === 0 ? -Infinity : x0 + ci * cw - TOL);
            const xb = Math.min(hi, ci === G - 1 ? Infinity : x0 + (ci + 1) * cw + TOL);
            let ya, yb;
            if (dx === 0) { ya = Math.min(pa[1], pb[1]); yb = Math.max(pa[1], pb[1]); }
            else {
                const ta = Math.min(1, Math.max(0, (xa - pa[0]) / dx)), tb = Math.min(1, Math.max(0, (xb - pa[0]) / dx));
                ya = pa[1] + ta * dy; yb = pa[1] + tb * dy;
                if (ya > yb) { const t = ya; ya = yb; yb = t; }
            }
            for (let cj = iy(ya - TOL), d1 = iy(yb + TOL); cj <= d1; cj++) { const k = ci * G + cj; push(segCells, k, s); cells.push(k); }
        }
        cellsOf[s] = cells;
    });
    for (const i of live) push(vertCells, ix(V[i].p2[0]) * G + iy(V[i].p2[1]), i);

    // Every vertex against every segment it does not end on: within TOL is a T-junction (or a near-miss the snap
    // did not merge -- the same thing to the walk).
    for (const [k, vl] of vertCells) {
        const sl = segCells.get(k);
        if (!sl) continue;
        for (const p of vl) for (const s of sl) {
            const [s0, s1] = segs[s];
            if (p === s0 || p === s1) continue;
            work.tests++;
            if (pointSegDist(V[p].p2, V[s0].p2, V[s1].p2).d <= TOL) return "T-junction";
        }
    }
    // Segment pairs: a proper crossing, or two segments leaving a shared vertex along one line. mark[t] === s says the
    // pair (s, t) was already tested from another cell the two share.
    const mark = new Int32Array(segs.length).fill(-1);
    for (let s = 0; s < segs.length; s++) {
        const [a, b] = segs[s];
        for (const k of cellsOf[s]) for (const t of segCells.get(k)) {
            work.visits++;
            if (t <= s || mark[t] === s) continue;
            mark[t] = s;
            work.tests++;
            const [c, d] = segs[t];
            const shared = a === c || a === d ? a : b === c || b === d ? b : -1;
            if (shared < 0) {
                const pa = V[a].p2, pb = V[b].p2, pc = V[c].p2, pd = V[d].p2;
                const o1 = orient(pa, pb, pc), o2 = orient(pa, pb, pd), o3 = orient(pc, pd, pa), o4 = orient(pc, pd, pb);
                if (o1 * o2 < 0 && o3 * o4 < 0) return "segments cross";
                continue;
            }
            const q = shared === a ? b : a, r = shared === c ? d : c, P = V[shared].p2;
            const ox = V[q].p2[0] - P[0], oy = V[q].p2[1] - P[1], qx = V[r].p2[0] - P[0], qy = V[r].p2[1] - P[1];
            if (Math.abs(ox * qy - oy * qx) <= TOL * Math.max(Math.hypot(ox, oy), Math.hypot(qx, qy)) &&
                ox * qx + oy * qy > 0) return "overlap";
        }
    }
    return null;
}

// ---- THE FRONT DOOR (round 9, on v4778's BVH-CSG pattern) -------------------------------------------------------
//
// v4778 gave the six BVH-CSG modules before this one a no-argument reportLines() that runs their own gate's
// hand-checkable fixtures, so instrument-bench.html can serve them (physics/instruments.mjs). This is the same
// split: the gate's own right triangle A = (0,0,0),(10,0,0),(0,10,0), area 50, against closed prisms over axis-aligned
// squares, whose face areas need no code. A REPORT, NOT A VERDICT -- triArrangement-selfcheck.mjs is what exits nonzero.
export function reportLines() {
    const buf = (tris) => new Float64Array(tris.flat(2));
    const prism = (x0, y0, x1, y1) => {
        const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], T = [];
        for (let i = 0; i < 4; i++) {
            const [ax, ay] = c[i], [bx, by] = c[(i + 1) % 4];
            T.push([[ax, ay, -1], [bx, by, -1], [bx, by, 1]], [[ax, ay, -1], [bx, by, 1], [ax, ay, 1]]);
        }
        T.push([[x0, y0, -1], [x1, y1, -1], [x1, y0, -1]], [[x0, y0, -1], [x0, y1, -1], [x1, y1, -1]]);
        T.push([[x0, y0, 1], [x1, y0, 1], [x1, y1, 1]], [[x0, y0, 1], [x1, y1, 1], [x0, y1, 1]]);
        return T;
    };
    const A = buf([[[0, 0, 0], [10, 0, 0], [0, 10, 0]]]);
    const fmt = (a) => a >= 1e-3 ? String(+a.toFixed(9)) : a.toExponential(3);
    const out = ["[triArrangement] one triangle of A cut along the segments where mesh B actually crosses it",
                 "  A = (0,0,0),(10,0,0),(0,10,0), area 50; B = closed prisms over squares, z from -1 to 1:"];
    for (const [label, T, hand] of [
        ["a 1x1 square hole, [2,3]^2", prism(2, 2, 3, 3), "1, 49"],
        ["nested squares, [1,4]^2 around [2,3]^2", [...prism(1, 1, 4, 4), ...prism(2, 2, 3, 3)], "1, 8, 41"],
        ["a square across A's edge x=0, [-1,1]x[4,5]", prism(-1, 4, 1, 5), "1, 49"],
        ["a square 2e-7 across, at (2,2)", prism(2, 2, 2 + 2e-7, 2 + 2e-7), "4e-14 and the rest"],
    ]) {
        const r = arrangeTriangle(A, 0, buf(T), T.map((_, i) => i));
        out.push("    " + label.padEnd(44) + (r.ok ? "faces " + r.faces.map((f) => f.area).sort((x, y) => x - y).map(fmt).join(", ") +
                 "   by hand " + hand + "   (" + r.segments + " segments)" : "REFUSED: " + r.reason));
    }
    const flat = arrangeTriangle(A, 0, buf([[[1, 1, 0], [3, 1, 0], [1, 3, 0]]]), [0]);
    out.push("    " + "a B-triangle lying in A's own plane".padEnd(44) + (flat.ok ? "ACCEPTED" : "refused: " + flat.reason));
    out.push("  It never computes a vertex, and a refusal sends the triangle back to meshBoolean.mjs's plane-cut path");
    return out;
}
