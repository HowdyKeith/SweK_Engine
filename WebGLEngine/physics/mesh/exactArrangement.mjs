// WebGLEngine/physics/mesh/exactArrangement.mjs
//
// *** BVH-CSG ROUND 16f: THE PER-TRIANGLE ARRANGEMENT, DECIDED EXACTLY (behind meshBoolean's opts.exactArrangement). ***
// triArrangement.mjs arranges a triangle with a 1e-9 snap: vertices within it merge, a vertex within it of a side splits
// the side, a chain that stops within 8 (or 64) snaps of the boundary is joined to it, thin cycles are dropped and the
// face areas are checked to snap x perimeter. Round 16e measured that those decisions, not the pair verdicts, are what
// break the near-coincident family: on slivers 1e-9..1e-8 wide, two arrangements decide them differently. Here none of
// them is taken with a tolerance. Every seam point is an implicit point (implicitPoints.mjs) -- an input vertex, or an
// edge of one mesh crossing a triangle's plane -- and every decision is an exact sign:
//
//   exactPair(TA, TB)    the intersection of two triangles: none, a point, a segment, or "coplanar" -- by exact orient3d
//                        signs of the input vertices; the section of each triangle by the other's plane is its vertices on
//                        that plane and its edges' crossings of it, and the two sections are overlapped along the planes'
//                        common line by exact coordinate comparison. Every degenerate case (a vertex on the plane, an edge
//                        in it, a touch at a point) comes out as what it is. A triangle of exactly zero area meets nothing.
//   arrangeTriangleExact a CONSTRAINED TRIANGULATION of the triangle, not a face walk: every pair's points are inserted
//                        (one on a side splits it, one inside splits its triangle in three; equal points are one vertex),
//                        then every segment is forced in as a chain of edges (split at any vertex exactly on it; the
//                        edges it crosses flipped away, Sloan's method), and the rest made DELAUNAY (Lawson's flips, exact
//                        in-circle). The faces are the regions that flood across edges no segment made. So a chain that
//                        stops inside the triangle -- a touch, or B's surface turning back -- needs no repair: it simply
//                        separates nothing.
//   exactInside(P, ...)  inside the other mesh or not, for a face sample a rounding from it: a ray from P's EXACT point,
//                        every crossing an exact orientation, a degenerate one retried along another direction.
//
// No snap, join, prune, thin-cycle or area check exists here. A point lying on this triangle's side splits it, whatever
// pair it came from -- a point contact included, and a COPLANAR pair's edge crossings and vertices on the other's edges
// (coplanarPoints) -- and the triangle across that side gets the same point from its own pairs, so no conformity pass is
// needed. Two seams CROSSING (the other mesh crossing itself) are split where the three planes meet. Coordinates are
// rounded once per point (implicitPoints.mjs's rounded(): the same bits for the same point in every arrangement); a
// triangle is positive by exact orientation BEFORE rounding, and one thinner than a rounding may come out flat or turned
// after it -- kept, so every edge is still paired. A face is ON a coplanar triangle of the other mesh when its sample
// triangle's EXACT centroid lies in or on it (round 12's inclusive rule, now exact); its label is that triangle's facing.
//
// WHAT THE ROUND'S OWN RUNS FOUND, EACH FIXED AND GATED (exactArrangement-selfcheck, meshBoolean-selfcheck section 25,
// blastEngine-selfcheck section 12):
//   (a) a coplanar pair gave no points: a B face's diagonal crossing an A edge that bounds a face lying ON B split the
//       triangle across that edge (which meets B out of the plane) and not this one -- 3..15 open edges a flush-box run;
//   (b) faces flush only to rounding (boxes rotated 0.7, 1e-17 apart) CROSS exactly, and were classified at a rounded
//       sample, or by a float plane distance, on the wrong side -- 3.1e-1 off; now exactInside, within EXACT_NEAR;
//   (c) the strictly-between test had its signs reversed, so no segment was split at a vertex lying on it and no coplanar
//       vertex on an edge was found -- caught by the gate's Euler count (107 of 119 cases off), not by any measured family;
//   (d) forcing a segment in by removing every triangle it crossed lost a vertex beside it, three of whose four spokes it
//       crossed ('segment lost', seed 33's copy rotated 3e-8): edge flipping never removes a vertex;
//   (e) on the page's chains, without Delaunay, edges beside a seam chain that bends only by a rounding left needles 1e-16
//       high; rounded, they turned over and the wall crossed itself (3e-2 long) -- 'crossing segments' later;
//   (f) a fold finer than a rounding still happens (a blob's equator vertices at z ~ 1e-16 against z = 0); a later shot
//       meeting it sees two seams cross, which (e)'s refusal sent to the plane path; split at the three planes' point.
// MEASURED, against the default arrangement: round 16d's 252-run near-coincident family 12 runs beyond first-order -> 0,
// fallbacks 51 -> 0, runs open at the page's 1e-9 census 113 (24,771 edges) -> 0; 1,350 flush-box runs exact to 2.7e-15,
// no crack; general-position meshes closed bit for bit; the page's 12 x 100-shot chains (merge-only finishing): 0 fallbacks
// against 7, every chain closed bit for bit at the end, the same solid to 3.5e-11, 1.03x the time.
// KNOWN: rounding the output can still fold features finer than a rounding -- the two meshes' triangles are arranged against
// each other, never a mesh against itself, so a fold leaves a T-junction a rounding wide (seed 11: 3 edges, 3.5e-18, open
// at the exact-bits key for 26 shots). Snap rounding of the output, or resolving the mesh's own crossings, would close it.
"use strict";

import { orient3d } from "./exactPredicates.mjs";
import { explicitPoint, lpiPoint, lliPoint, tpiPoint, same, cmpCoord, orient2d, orient3dImplicit, incircle, centroidPoint, exactCoords } from "./implicitPoints.mjs";

function readTri(tris, t) {
    const o = t * 9;
    return [[tris[o], tris[o + 1], tris[o + 2]], [tris[o + 3], tris[o + 4], tris[o + 5]], [tris[o + 6], tris[o + 7], tris[o + 8]]];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Exactly zero area: the three vertices collinear (every coordinate projection flat). */
export function degenerateTri(T) {
    const P = T.map(explicitPoint);
    return orient2d(P[0], P[1], P[2], 0, 1) === 0 && orient2d(P[0], P[1], P[2], 1, 2) === 0 && orient2d(P[0], P[1], P[2], 2, 0) === 0;
}

// T's section by the plane of `other`: its vertices on that plane and its edges' crossings of it (s: exact sides)
function section(T, s, other) {
    const pts = [];
    for (let i = 0; i < 3; i++) if (s[i] === 0) pts.push(explicitPoint(T[i]));
    for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; if (s[i] * s[j] < 0) pts.push(lpiPoint(T[i], T[j], other)); }
    return pts;
}
// an axis along which the two planes' common line is not flat: d = nA x nB, its largest component -- exactly nonzero.
// The float d's error is below 1e-14 of |nA||nB|; a component above 1e-9 of it is nonzero for certain. Otherwise exact.
function lineAxis(TA, TB) {
    const nA = cross(sub(TA[1], TA[0]), sub(TA[2], TA[0])), nB = cross(sub(TB[1], TB[0]), sub(TB[2], TB[0]));
    const d = cross(nA, nB), ad = d.map(Math.abs), k = ad[0] >= ad[1] && ad[0] >= ad[2] ? 0 : ad[1] >= ad[2] ? 1 : 2;
    if (ad[k] > 1e-9 * Math.hypot(...nA) * Math.hypot(...nB)) return k;
    // exact: the normals from the input coordinates, in BigInt
    const ex = (T) => { const P = T.map((p) => { const x = exactCoords(explicitPoint(p)); return { x, E: x.E }; });
        let E = Math.min(...P.map((q) => q.E)); const I = P.map((q) => { const s = BigInt(q.E - E); return [q.x.X << s, q.x.Y << s, q.x.Z << s]; });
        const u = [I[1][0] - I[0][0], I[1][1] - I[0][1], I[1][2] - I[0][2]], v = [I[2][0] - I[0][0], I[2][1] - I[0][1], I[2][2] - I[0][2]];
        return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; };
    const a = ex(TA), b = ex(TB), D = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    for (let c = 0; c < 3; c++) if (D[c] !== 0n) return c;
    return -1;
}

/**
 * The intersection of triangles TA and TB (arrays of three [x,y,z]), exactly:
 *   {kind:"none"} | {kind:"coplanar"} | {kind:"point", P} | {kind:"segment", P0, P1}   (P: implicitPoints.mjs points)
 */
export function exactPair(TA, TB) {
    const sA = TA.map((v) => orient3d(TB[0], TB[1], TB[2], v));
    if ((sA[0] > 0 && sA[1] > 0 && sA[2] > 0) || (sA[0] < 0 && sA[1] < 0 && sA[2] < 0)) return { kind: "none" };
    const sB = TB.map((v) => orient3d(TA[0], TA[1], TA[2], v));
    if ((sB[0] > 0 && sB[1] > 0 && sB[2] > 0) || (sB[0] < 0 && sB[1] < 0 && sB[2] < 0)) return { kind: "none" };
    if ((!sA[0] && !sA[1] && !sA[2]) || (!sB[0] && !sB[1] && !sB[2])) {
        // all of one triangle on the other's plane: the same plane -- unless either has no plane at all (zero area)
        if (degenerateTri(TA) || degenerateTri(TB)) return { kind: "none" };
        return { kind: "coplanar", pts: coplanarPoints(TA, TB) };
    }
    const SA = section(TA, sA, TB), SB = section(TB, sB, TA);
    if (!SA.length || !SB.length) return { kind: "none" };
    const k = lineAxis(TA, TB);
    if (k < 0) return { kind: "none" };                  // parallel planes cannot both be crossed; not reached
    const ends = (S) => (S.length === 1 || cmpCoord(S[0], S[1], k) <= 0 ? [S[0], S[S.length - 1]] : [S[1], S[0]]);
    const [loA, hiA] = ends(SA), [loB, hiB] = ends(SB);
    const lo = cmpCoord(loA, loB, k) >= 0 ? loA : loB, hi = cmpCoord(hiA, hiB, k) <= 0 ? hiA : hiB;
    const c = cmpCoord(lo, hi, k);
    if (c > 0) return { kind: "none" };
    if (c === 0) return { kind: "point", P: lo };
    return { kind: "segment", P0: lo, P1: hi };
}

// Two triangles in one plane: the points either one's arrangement must have ON ITS SIDES -- where their edges cross, and
// each one's vertices lying on the other's edges. Neither cuts the other (a face ON a coplanar triangle is labelled by
// the inclusive test below, and the rim of the other mesh's coplanar region is cut by its next triangle, which leaves the
// plane); but the triangle ACROSS a side meets the other triangle out of the plane, and its segment along that side ends
// at those points. Without them the two disagree along the side (round 16f, measured: the flush boxes' grid variant, a
// B face's diagonal crossing an A edge that bounds a face lying on B -- 3..15 open edges a run).
function coplanarPoints(TA, TB) {
    const n = cross(sub(TA[1], TA[0]), sub(TA[2], TA[0])), an = n.map(Math.abs);
    const A = TA.map(explicitPoint), B = TB.map(explicitPoint);
    // a projection in which the plane is not flat, exactly
    let I = -1, J = -1;
    const order = an[0] >= an[1] && an[0] >= an[2] ? [0, 1, 2] : an[1] >= an[2] ? [1, 2, 0] : [2, 0, 1];
    for (const drop of order) { const [i, j] = drop === 0 ? [1, 2] : drop === 1 ? [2, 0] : [0, 1]; if (orient2d(A[0], A[1], A[2], i, j)) { I = i; J = j; break; } }
    if (I < 0) return [];
    const pts = [];
    const onEdge = (P, Q, R) => {        // R strictly inside segment PQ (collinear checked by the caller)
        for (let k = 0; k < 3; k++) { const c = cmpCoord(P, Q, k); if (c) { const a = cmpCoord(R, P, k), b = cmpCoord(R, Q, k); return a * c < 0 && b * c > 0; } }
        return false;
    };
    for (let e = 0; e < 3; e++) {
        const p = A[e], q = A[(e + 1) % 3];
        for (let f = 0; f < 3; f++) {
            const r = B[f], t = B[(f + 1) % 3];
            const o1 = orient2d(p, q, r, I, J), o2 = orient2d(p, q, t, I, J), o3 = orient2d(r, t, p, I, J), o4 = orient2d(r, t, q, I, J);
            if (o1 * o2 < 0 && o3 * o4 < 0) pts.push(lliPoint(TA[e], TA[(e + 1) % 3], TB[f], TB[(f + 1) % 3], I, J));
            if (o1 === 0 && onEdge(p, q, r)) pts.push(r);
            if (o3 === 0 && onEdge(r, t, p)) pts.push(p);
        }
    }
    return pts;
}

// A sample within EXACT_NEAR of the other mesh is classified by an exact ray (exactInside), not by float sides or rays:
// faces flush only to rounding (round 12's rotated flush boxes, 1e-17 apart) cross EXACTLY along real seams, and a sample
// rounded to doubles, or sided by a float plane distance, lands on the wrong side of a surface that near (3.1e-1 off).
export const EXACT_NEAR = 1e-11;
const RAY_DIRS = [[0.5257311121191336, 0.8506508083520399, 0.0123], [-0.6180339887498949, 0.3819660112501051, 0.7071067811865476],
                  [0.2672612419124244, -0.5345224838248488, 0.8017837257372732], [-0.4472135954999579, -0.8944271909999159, 0.0331]];
/**
 * Is the point P (an implicitPoints.mjs point) inside the closed mesh trisOther? Parity of the crossings of a segment from P
 * to a point F far outside the mesh, every crossing decided by exact orientation; a segment through an edge, a vertex or
 * along a plane is not counted on -- the next direction is taken. Returns null if every direction is degenerate. P must
 * not lie ON the surface (inside and outside are then undefined): a face of the arrangement lying on the other mesh is
 * labelled ON by the coplanar rule before it is ever classified, and any other face's sample is strictly off it.
 */
export function exactInside(P, trisOther, bvhOther) {
    const b = bvhOther.bounds, diag = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) + 1;
    const far = 4 * (diag + Math.hypot(P.r[0] - (b[0] + b[3]) / 2, P.r[1] - (b[1] + b[4]) / 2, P.r[2] - (b[2] + b[5]) / 2));
    for (const d of RAY_DIRS) {
        const Fr = [P.r[0] + d[0] * far, P.r[1] + d[1] * far, P.r[2] + d[2] * far], F = explicitPoint(Fr);
        const lo = [Math.min(P.r[0], Fr[0]), Math.min(P.r[1], Fr[1]), Math.min(P.r[2], Fr[2])], hi = [Math.max(P.r[0], Fr[0]), Math.max(P.r[1], Fr[1]), Math.max(P.r[2], Fr[2])];
        let count = 0, degenerate = false;
        for (const t of bvhOther.trianglesInBox(lo, hi)) {
            const T = readTri(trisOther, t).map(explicitPoint);
            const sF = orient3dImplicit(T[0], T[1], T[2], F);
            if (sF === 0) { degenerate = true; break; }
            const sP = orient3dImplicit(T[0], T[1], T[2], P);
            if (sP === sF || sP === 0) continue;        // same side; or P on the plane, outside the triangle (a face ON it is labelled)
            const o1 = orient3dImplicit(P, F, T[0], T[1]), o2 = orient3dImplicit(P, F, T[1], T[2]), o3 = orient3dImplicit(P, F, T[2], T[0]);
            if (o1 === 0 || o2 === 0 || o3 === 0) { if ((o1 >= 0 && o2 >= 0 && o3 >= 0) || (o1 <= 0 && o2 <= 0 && o3 <= 0)) { degenerate = true; break; } continue; }
            if (o1 === o2 && o2 === o3) count++;
        }
        if (!degenerate) return count % 2 === 1;
    }
    return null;
}

const refuse = (reason, extra = {}) => ({ status: "fallback", reason, ...extra });

/**
 * The exact arrangement of triangle triA (in trisA) cut by the intersections with candidateTriBs (indices into trisB).
 * Same result contract as triArrangement.mjs's arrangeTriangle(): "untouched" | "ok" with faces | "fallback".
 * @param {{pairOf?:(triB:number)=>object}} [opts]  pairOf: exactPair's result for (triA, triB), computed once by the caller
 */
export function arrangeTriangleExact(trisA, triA, trisB, candidateTriBs, opts = {}) {
    const T = readTri(trisA, triA);
    const pts = [], segs = [], coplanar = [], srcOf = [];
    const seen = new Set();
    for (const tb of candidateTriBs || []) {
        if (seen.has(tb)) continue;
        seen.add(tb);
        const r = opts.pairOf ? opts.pairOf(tb) : exactPair(T, readTri(trisB, tb));
        if (!r || r.kind === "none") continue;
        if (r.kind === "coplanar") { coplanar.push(readTri(trisB, tb)); if (r.pts) pts.push(...r.pts); continue; }
        if (r.kind === "point") { pts.push(r.P); continue; }
        pts.push(r.P0, r.P1); segs.push([r.P0, r.P1]); srcOf.push(tb);
    }
    if (!pts.length && !coplanar.length) return { status: "untouched" };

    // ---- the frame: drop the normal's dominant axis; orientation normalised so triA itself is positive -----------------
    const n = cross(sub(T[1], T[0]), sub(T[2], T[0])), an = n.map(Math.abs);
    const drop = an[0] >= an[1] && an[0] >= an[2] ? 0 : an[1] >= an[2] ? 1 : 2;
    const [I, J] = drop === 0 ? [1, 2] : drop === 1 ? [2, 0] : [0, 1];
    const V = T.map(explicitPoint);
    const s0 = orient2d(V[0], V[1], V[2], I, J);
    if (s0 === 0) return refuse("degenerate triangle");
    const O = (a, b, c) => s0 * orient2d(V[a], V[b], V[c], I, J);
    const addVertex = (P) => { for (let v = 0; v < V.length; v++) if (same(V[v], P)) return v; V.push(P); return V.length - 1; };

    // ---- the triangulation: triangles CCW under O, a directed-edge map, the constrained edges ---------------------------
    const tri = [], alive = [], edgeOf = new Map();
    const K = (a, b) => a * 1048576 + b;
    const addTri = (a, b, c) => { const t = tri.length; tri.push([a, b, c]); alive.push(true); edgeOf.set(K(a, b), t); edgeOf.set(K(b, c), t); edgeOf.set(K(c, a), t); return t; };
    const killTri = (t) => { alive[t] = false; const [a, b, c] = tri[t]; for (const [p, q] of [[a, b], [b, c], [c, a]]) if (edgeOf.get(K(p, q)) === t) edgeOf.delete(K(p, q)); };
    const fixed = new Set();
    const U = (a, b) => (a < b ? K(a, b) : K(b, a));
    addTri(0, 1, 2);
    let pointsOnEdge = 0, pointsInside = 0, splitsAt = 0, forced = 0, flips = 0, crossings = 0;

    // 1. the points. insertPoint() returns the vertex, or a refusal: a point on an edge splits it (and the triangle across),
    // one inside a triangle splits it in three; a split constrained edge stays constrained, by the same triangle of the
    // other mesh (fixedSrc: which one made it -- a crossing needs both planes)
    const fixedSrc = new Map();
    const insertPoint = (P) => {
        const before = V.length, v = addVertex(P);
        if (v < before) return v;                             // already a vertex
        let hit = -1, zero = -1;
        for (let t = 0; t < tri.length && hit < 0; t++) {
            if (!alive[t]) continue;
            const [a, b, c] = tri[t], o = [O(a, b, v), O(b, c, v), O(c, a, v)];
            if (o[0] < 0 || o[1] < 0 || o[2] < 0) continue;
            const zs = o.reduce((s, x, i) => (x === 0 ? s.concat(i) : s), []);
            if (zs.length > 1) return "vertex duplicate";       // on two edges' lines: a vertex, yet not equal -- not reachable
            hit = t; zero = zs.length ? zs[0] : -1;
        }
        if (hit < 0) return "point outside";                    // every pair's point lies in triA, exactly -- not reachable
        const [a, b, c] = tri[hit];
        if (zero < 0) { killTri(hit); addTri(a, b, v); addTri(b, c, v); addTri(c, a, v); pointsInside++; return v; }
        const e = [[a, b, c], [b, c, a], [c, a, b]][zero], [p, q, r] = e;   // v on edge p->q, opposite r
        const nb = edgeOf.get(K(q, p));
        killTri(hit); addTri(p, v, r); addTri(v, q, r);
        if (nb !== undefined) { const s = tri[nb].find((x) => x !== p && x !== q); killTri(nb); addTri(q, v, s); addTri(v, p, s); }
        if (fixed.has(U(p, q))) {
            const src = fixedSrc.get(U(p, q));
            fixed.delete(U(p, q)); fixed.add(U(p, v)); fixed.add(U(v, q)); fixedSrc.set(U(p, v), src); fixedSrc.set(U(v, q), src);
        }
        pointsOnEdge++;
        return v;
    };
    for (const P of pts) { const v = insertPoint(P); if (typeof v === "string") return refuse(v); }

    // 2. the segments, each forced in as a chain of edges
    const between = (u, v, w) => {         // w strictly between u and v on their (common) line
        for (let k = 0; k < 3; k++) { const c = cmpCoord(V[u], V[v], k); if (c) { const a = cmpCoord(V[w], V[u], k), b = cmpCoord(V[w], V[v], k); return a * c < 0 && b * c > 0; } }
        return false;
    };
    // a segment is forced in by FLIPPING the edges it crosses (Sloan 1993): an edge whose two triangles form a strictly
    // convex quadrilateral is flipped; one that still crosses goes back on the list, one that does not is done. Some
    // crossing edge is always flippable while no vertex lies on the open segment (split at them first), so it ends with
    // the segment an edge. (Built first by removing every crossed triangle and ear-clipping the two pockets: a vertex just
    // beside the segment, three of whose four spokes it crosses, ended up INSIDE the cavity and was lost -- seed 33's copy
    // rotated 3e-8 about (-2,1,1), 'segment lost'. Flipping never removes a vertex.)
    const crosses = (u, v, p, q) => {
        if (p === u || p === v || q === u || q === v) return false;
        return O(u, v, p) * O(u, v, q) < 0 && O(p, q, u) * O(p, q, v) < 0;
    };
    const third = (t, p, q) => tri[t].find((x) => x !== p && x !== q);
    const force = (u, v, src) => {
        if (edgeOf.has(K(u, v)) || edgeOf.has(K(v, u))) { fixed.add(U(u, v)); fixedSrc.set(U(u, v), src); return null; }
        const queue = [], seenE = new Set();
        for (let t = 0; t < tri.length; t++) {
            if (!alive[t]) continue;
            const tv = tri[t];
            for (let m = 0; m < 3; m++) {
                const p = tv[m], q = tv[(m + 1) % 3];
                if (seenE.has(U(p, q)) || !crosses(u, v, p, q)) continue;
                if (fixed.has(U(p, q))) {
                    // two seams crossing: the other mesh crosses itself here (by a rounding, on a chain of this engine's
                    // own shots -- see crossings below). The point is where the three planes meet; both seams split there
                    if (opts.crossings === false || src === undefined || fixedSrc.get(U(p, q)) === undefined) {
                        if (opts.debug) opts.debug.crossing = { u, v, p, q, V, segs, srcOf };
                        return "crossing segments";
                    }
                    let X;
                    try { X = tpiPoint(T, readTri(trisB, src), readTri(trisB, fixedSrc.get(U(p, q)))); } catch { return "crossing segments"; }
                    const x = insertPoint(X);
                    if (typeof x === "string") return x;
                    crossings++;
                    return force(u, x, src) || force(x, v, src);
                }
                seenE.add(U(p, q)); queue.push([p, q]);
            }
        }
        if (!queue.length) return "segment lost";
        let guard = 0;
        while (queue.length) {
            if (++guard > 64 * (tri.length + 16)) return "flip limit";
            const [p, q] = queue.shift();
            const t1 = edgeOf.get(K(p, q)), t2 = edgeOf.get(K(q, p));
            if (t1 === undefined || t2 === undefined) return "segment lost";
            const r = third(t1, p, q), s = third(t2, q, p);
            if (!(O(r, s, p) * O(r, s, q) < 0)) { queue.push([p, q]); continue; }    // not strictly convex: later
            killTri(t1); killTri(t2); addTri(r, p, s); addTri(s, q, r); flips++;
            if (crosses(u, v, r, s)) queue.push([r, s]);
        }
        if (!edgeOf.has(K(u, v)) && !edgeOf.has(K(v, u))) return "segment lost";
        fixed.add(U(u, v)); fixedSrc.set(U(u, v), src); forced++;
        return null;
    };
    for (let si = 0; si < segs.length; si++) {
        const [P0, P1] = segs[si], src = srcOf[si];
        const u = addVertex(P0), v = addVertex(P1);
        if (u === v) continue;
        const on = [];
        for (let w = 0; w < V.length; w++) if (w !== u && w !== v && O(u, v, w) === 0 && between(u, v, w)) on.push(w);
        if (on.length) {
            let k = 0; while (cmpCoord(V[u], V[v], k) === 0) k++;
            const dir = cmpCoord(V[u], V[v], k);
            on.sort((a, b) => dir * -cmpCoord(V[a], V[b], k));
            splitsAt += on.length;
        }
        const chain = [u, ...on, v];
        for (let m = 0; m + 1 < chain.length; m++) { const why = force(chain[m], chain[m + 1], src); if (why) return refuse(why); }
    }

    // 2b. DELAUNAY (Lawson's flips, constrained edges kept; exact in-circle on the implicit points). Without it the
    // triangulation kept whatever insertion left, and an edge could run straight beside a seam chain that bends only by
    // a rounding -- a wall face's seam crossing pieces of one plane, each rounded on its own -- leaving needles 1e-16
    // high between them. Exact, they are positive; rounded to doubles they turned over, and the output crossed itself
    // (page seed 1, shot 17: a blob piece through two wall pieces along 3e-2; 'crossing segments' at shot 39 when the
    // next shot met it). A Delaunay triangle beside a chain takes its apex off the chain.
    let delaunayFlips = 0;
    if (opts.delaunay !== false) {
        const inside = (a, b, c, d) => s0 * incircle(V[a], V[b], V[c], V[d], I, J);
        const stack = [];
        for (let t = 0; t < tri.length; t++) if (alive[t]) { const [a, b, c] = tri[t]; for (const [p, q] of [[a, b], [b, c], [c, a]]) if (p < q) stack.push([p, q]); }
        let guard = 0;
        while (stack.length) {
            if (++guard > 1000 * (tri.length + 16)) return refuse("delaunay limit");
            const [p, q] = stack.pop();
            if (fixed.has(U(p, q))) continue;
            const t1 = edgeOf.get(K(p, q)), t2 = edgeOf.get(K(q, p));
            if (t1 === undefined || t2 === undefined) continue;
            const r = third(t1, p, q), sv = third(t2, q, p);
            if (inside(p, q, r, sv) <= 0) continue;                       // legal (or cocircular: left as is)
            if (!(O(r, sv, p) * O(r, sv, q) < 0)) continue;              // an illegal edge's quadrilateral is convex; checked
            killTri(t1); killTri(t2); addTri(r, p, sv); addTri(sv, q, r); delaunayFlips++;
            stack.push([p, sv], [sv, q], [q, r], [r, p]);
        }
    }

    // 3. the faces: regions flooded across edges no segment made
    const region = new Int32Array(tri.length).fill(-1);
    let regions = 0;
    for (let t0 = 0; t0 < tri.length; t0++) {
        if (!alive[t0] || region[t0] >= 0) continue;
        const stack = [t0]; region[t0] = regions;
        while (stack.length) {
            const t = stack.pop(), [a, b, c] = tri[t];
            for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                if (fixed.has(U(p, q))) continue;
                const w = edgeOf.get(K(q, p));
                if (w !== undefined && region[w] < 0) { region[w] = regions; stack.push(w); }
            }
        }
        regions++;
    }
    const faces = [];
    let onConflicts = 0;
    for (let g = 0; g < regions; g++) {
        const ts = [];
        for (let t = 0; t < tri.length; t++) if (alive[t] && region[t] === g) ts.push(t);
        let best = ts[0], bestA = -1;
        const tris = ts.map((t) => {
            const [a, b, c] = tri[t], A = V[a].r, B = V[b].r, C = V[c].r, m = cross(sub(B, A), sub(C, A)), ar = Math.hypot(m[0], m[1], m[2]);
            if (ar > bestA) { bestA = ar; best = t; }
            return [A, B, C];
        });
        const [a, b, c] = tri[best], A = V[a].r, B = V[b].r, C = V[c].r;
        const sample = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
        let on = 0;
        if (coplanar.length) {
            const q = centroidPoint(V[a], V[b], V[c]);
            for (const Ub of coplanar) {
                const W = Ub.map(explicitPoint), sb = orient2d(W[0], W[1], W[2], I, J);
                if (sb === 0) continue;
                const o0 = orient2d(W[0], W[1], q, I, J), o1 = orient2d(W[1], W[2], q, I, J), o2 = orient2d(W[2], W[0], q, I, J);
                if ((o0 >= 0 && o1 >= 0 && o2 >= 0) || (o0 <= 0 && o1 <= 0 && o2 <= 0)) {
                    const face = sb * s0 > 0 ? 1 : -1;
                    if (on && on !== face) onConflicts++;
                    on = on || face;
                }
            }
        }
        const Va = V[a], Vb = V[b], Vc = V[c];
        faces.push({ tris, sample, exactSample: () => centroidPoint(Va, Vb, Vc), area: bestA, holes: 0, on });
    }
    const inspect = opts.inspect ? { V, tris: tri.filter((_, t) => alive[t]), fixed: [...fixed].map((k) => [Math.floor(k / 1048576), k % 1048576]),
        segs: segs.map(([P0, P1]) => [addVertex(P0), addVertex(P1)]), O, I, J } : undefined;
    return { status: "ok", faces, sideVerts: [[], [], []], inspect,
             stats: { segments: segs.length, vertices: V.length, faceCount: faces.length, coplanar: coplanar.length, triangles: tri.filter((_, t) => alive[t]).length,
                      pointsOnEdge, pointsInside, splitsAt, forced, flips, delaunayFlips, crossings, onConflicts } };
}
