// WebGLEngine/physics/mesh/triContact.mjs
//
// *** ROUND 12 OF THE BVH-CSG ARC: THE CONTACTS triTriIntersect() REFUSES. *** Round 2's triTriIntersect() returns
// "coplanar" when two triangles' planes are within 1e-9 rad of parallel and "degenerate" when any vertex lies within
// 1e-9 of the other's plane; round 9's arrangement refused both and sent the triangle to the plane path, which has
// no answer for a piece of surface lying ON the other mesh's surface. meshBoolean.mjs's ROUND 12 paragraph has what
// that cost, measured. This file resolves both statuses, and is called only for them -- a pair triTriIntersect()
// resolves keeps its segment exactly as before.
//
//   contactPair(P, Q) -> {kind:"coplanar", orient} | {kind:"segment", p0, p1, onPlane} | {kind:"none"}
//     COPLANAR when every vertex of one triangle is within CONTACT_EPS of the other's plane (either way round, so
//     the relation is symmetric). orient is +1 when the two outward normals agree, -1 when they oppose. The caller
//     labels the part of its triangle this one covers "on"; the cut around that part comes from the neighbouring
//     triangles that leave the plane, whose contacts are segments (triArrangement.mjs, round 12).
//     SEGMENT otherwise: each triangle's piece in the other's plane, with distances under CONTACT_EPS snapped to 0
//     exactly as triTriIntersect() snaps them, and the overlap of the two pieces along their common line. onPlane
//     marks a piece that is a whole EDGE lying in the other plane: B TOUCHES A's plane there, or crosses it
//     through that edge, and one triangle alone cannot say which -- the caller may prune it if it dangles.
//   Computed on the pair in a CANONICAL order (the triangle whose sorted vertex list is lexicographically smaller
//   first), so contactPair(P, Q) and contactPair(Q, P) return the same points bit for bit: A's arrangement and
//   B's receive identical seam vertices, the property round 9 built its raw watertightness on.
//
//   closestOnTriangle(p, a, b, c) -> {d2, region, planeDist} -- Ericson's closest-point regions, for
//   meshBoolean's near-surface side test.
"use strict";

export const CONTACT_EPS = 1e-9;   // triTriIntersect.mjs's EPS: the two files must partition pairs the same way

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function cmpV(a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }
function cmpTri(P, Q) {
    const p = [...P].sort(cmpV), q = [...Q].sort(cmpV);
    for (let i = 0; i < 3; i++) { const c = cmpV(p[i], q[i]); if (c) return c; }
    return 0;
}
// the unit normal and the snapped signed distances of `other`'s vertices to `tri`'s plane, with triTriIntersect's
// own formula (dot(n, u) + (-dot(n, v0))), so a distance it snapped to zero is zero here too
function planeDists(tri, other) {
    let n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
    const L = Math.hypot(n[0], n[1], n[2]);
    if (!(L >= 1e-300)) return null;
    n = [n[0] / L, n[1] / L, n[2] / L];
    const c = -dot(n, tri[0]);
    const d = other.map((u) => { const x = dot(n, u) + c; return Math.abs(x) < CONTACT_EPS ? 0 : x; });
    return { n, d };
}
// where edge (a,b) crosses the plane, the edge taken in canonical order so both triangles sharing it get one point
export function edgeCross(a, b, da, db) {
    if (cmpV(a, b) > 0) { [a, b] = [b, a]; [da, db] = [db, da]; }
    const t = da / (da - db);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
// the piece of triangle `tri` lying in the other plane: [] (misses or touches at a point), or two points
function piece(tri, d) {
    const pts = [];
    let zeros = 0;
    for (let i = 0; i < 3; i++) if (d[i] === 0) { pts.push(tri[i]); zeros++; }
    for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        if ((d[i] > 0 && d[j] < 0) || (d[i] < 0 && d[j] > 0)) pts.push(edgeCross(tri[i], tri[j], d[i], d[j]));
    }
    return { pts: pts.length === 2 ? pts : [], edge: zeros === 2 };
}

export function contactPair(P0, Q0) {
    const swap = cmpTri(P0, Q0) > 0;
    const P = swap ? Q0 : P0, Q = swap ? P0 : Q0;
    const inP = planeDists(P, Q), inQ = planeDists(Q, P);
    if (!inP || !inQ) return { kind: "none", reason: "zero-area" };
    if (inP.d.every((x) => x === 0) || inQ.d.every((x) => x === 0)) {
        const c = dot(inP.n, inQ.n);
        return { kind: "coplanar", orient: c > 0 ? 1 : -1 };
    }
    // either triangle strictly to one side of the other's plane: no contact
    const side = (d) => (d.every((x) => x > 0) || d.every((x) => x < 0));
    if (side(inP.d) || side(inQ.d)) return { kind: "none" };
    const a = piece(Q, inP.d), b = piece(P, inQ.d);   // Q's piece in P's plane, P's piece in Q's plane
    if (!a.pts.length || !b.pts.length) return { kind: "none" };
    // order both along the longer piece's direction and overlap them
    const la = sub(a.pts[1], a.pts[0]), lb = sub(b.pts[1], b.pts[0]);
    const u = dot(la, la) >= dot(lb, lb) ? la : lb;
    const s = (p) => dot(p, u);
    const [a0, a1] = s(a.pts[0]) <= s(a.pts[1]) ? a.pts : [a.pts[1], a.pts[0]];
    const [b0, b1] = s(b.pts[0]) <= s(b.pts[1]) ? b.pts : [b.pts[1], b.pts[0]];
    const lo = s(b0) > s(a0) ? b0 : a0, hi = s(b1) < s(a1) ? b1 : a1;
    if (!(s(hi) > s(lo))) return { kind: "none" };
    return { kind: "segment", p0: lo, p1: hi, onPlane: a.edge || b.edge };
}

// Closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5), with which region it lies in
// and p's signed distance to the triangle's plane (positive on the side its winding's normal points to).
export function closestOnTriangle(p, a, b, c) {
    const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
    const nn = cross(ab, ac), L = Math.hypot(nn[0], nn[1], nn[2]);
    const planeDist = L > 0 ? dot(ap, nn) / L : 0;
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    let q, region;
    if (d1 <= 0 && d2 <= 0) { q = a; region = "vertex"; }
    else {
        const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
        if (d3 >= 0 && d4 <= d3) { q = b; region = "vertex"; }
        else if (d6 >= 0 && d5 <= d6) { q = c; region = "vertex"; }
        else if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; region = "edge"; }
        else if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; region = "edge"; }
        else if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
            const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; region = "edge";
        } else {
            const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
            q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]; region = "face";
        }
    }
    const dq = sub(p, q);
    return { d2: dot(dq, dq), region, planeDist, q, n: L > 0 ? [nn[0] / L, nn[1] / L, nn[2] / L] : [0, 0, 0] };
}

// The angle a triangle subtends at point q lying on it: pi on an edge's interior, the corner angle at a vertex.
// (Barentzen & Aanaes' angle-weighted pseudo-normal: the sum over the triangles meeting at q of angle x normal
// gives the side of a point whose closest surface point is q, for a closed manifold, at edges and vertices alike.)
export function angleAt(q, a, b, c, tol) {
    const tri = [a, b, c];
    for (let i = 0; i < 3; i++) {
        const v = tri[i], dv = sub(q, v);
        if (dot(dv, dv) <= tol * tol) {
            const e1 = sub(tri[(i + 1) % 3], v), e2 = sub(tri[(i + 2) % 3], v);
            const c1 = dot(e1, e2) / Math.sqrt(dot(e1, e1) * dot(e2, e2));
            return Math.acos(Math.max(-1, Math.min(1, c1)));
        }
    }
    return Math.PI;
}
