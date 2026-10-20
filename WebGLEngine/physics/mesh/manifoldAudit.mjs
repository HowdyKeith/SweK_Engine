// WebGLEngine/physics/mesh/manifoldAudit.mjs -- BVH-CSG round 20
//
// IS A TRIANGLE MESH TWO-MANIFOLD? The property three-bvh-csg's README says, in bold, it cannot always keep ("due to
// numerical precision and corner cases resulting geometry may not be correctly completely two-manifold"), and the one
// backlog item bvh-csg-speed-vs-manifold-tradeoff was opened to weigh. Every count is taken at the EXACT BITS of the
// coordinates and with exact predicates (implicitPoints.mjs, exactArrangement.mjs, exactPredicates.mjs):
//
//   degenerate        a triangle with zero area (two corners the same point, or all three on one line, exactly)
//   open              a directed edge whose reverse is not used as many times (the census of the page, per triangle)
//   nonManifoldEdges  an undirected edge on other than exactly two triangles
//   pinchedVertices   a vertex whose triangles do not make ONE fan: in triangle (v, a, b) the edge a-b is a link edge,
//                     and a manifold vertex's link edges join into one piece (two solids touching at a corner do not)
//   crossings         two triangles that meet where they share nothing to meet by: a segment that is not the edge
//                     they share, or a point that is not a vertex they share while they share one
//   touches           two triangles sharing nothing that meet at one point
//   coplanarOverlaps  two triangles in one plane whose interiors overlap (or, sharing an edge, lie on its same side)
//
// and, for each crossing and touch with `detail`, its DEPTH: how far the two reach past each other's planes on the
// side they should not -- the smaller of the two reaches, from the exact determinant over the float normal's length.
// A crossing can be long and shallow: two slivers nearly coplanar, rounded, cross along a length of depth / angle.
//
// MEASURED (round 20), on the page's default engine: 12 chains x 100 shots audited every 25 -- 48 walls closed,
// edge- and vertex-manifold and with no degenerate triangle; 6 of them with 2..9 crossings, every one at most 1.8e-16
// deep (below an ulp at the wall's coordinates) and up to 2.2e-9 long: the exact arrangement's slivers near the page
// blobs' z = 0 equators, rounded to doubles; since round 20b none (meshBoolean's embedRounded). meshCSG's BSP on the same
// 20 shots: tens of thousands of open edges raw, real crossings up to 6.8e-3 deep; after settle thousands at its triangles
// until round 20c (meshCSG's fan dropped the points settle welded), its polygon census since. See blastEngine-selfcheck 16.
"use strict";

import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { exactPair, degenerateTri } from "./exactArrangement.mjs";
import { explicitPoint, same, orient2d } from "./implicitPoints.mjs";
import { decompose } from "./exactPredicates.mjs";

const tri = (buf, t) => [0, 1, 2].map((c) => [buf[t * 9 + c * 3], buf[t * 9 + c * 3 + 1], buf[t * 9 + c * 3 + 2]]);

// (b - a) x (c - a) . (p - a), exactly, returned as the nearest double: every coordinate an integer times 2^E
function detExact(a, b, c, p) {
    const all = [a, b, c, p].flat().map(decompose), nz = all.filter((x) => x[0] !== 0n);
    if (!nz.length) return 0;
    const E = Math.min(...nz.map((x) => x[1]));
    const I = all.map(([m, e]) => (m === 0n ? 0n : m << BigInt(e - E))), V = (k) => [I[k * 3], I[k * 3 + 1], I[k * 3 + 2]];
    const A = V(0), u = V(1).map((x, i) => x - A[i]), v = V(2).map((x, i) => x - A[i]), w = V(3).map((x, i) => x - A[i]);
    const det = (u[1] * v[2] - u[2] * v[1]) * w[0] + (u[2] * v[0] - u[0] * v[2]) * w[1] + (u[0] * v[1] - u[1] * v[0]) * w[2];
    return Number(det) * 2 ** (3 * E);
}
// how far T's corners reach past S's plane on their smaller side
function reach(T, S) {
    const u = [S[1][0] - S[0][0], S[1][1] - S[0][1], S[1][2] - S[0][2]], v = [S[2][0] - S[0][0], S[2][1] - S[0][1], S[2][2] - S[0][2]];
    const nn = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    const d = T.map((p) => detExact(S[0], S[1], S[2], p) / nn);
    return Math.min(Math.max(0, ...d), Math.max(0, ...d.map((x) => -x)));
}
/** The depth of a crossing of triangles TA and TB (arrays of three [x,y,z]): the smaller of their two reaches. */
export function crossingDepth(TA, TB) { return Math.min(reach(TA, TB), reach(TB, TA)); }

/**
 * Audit triangle buffer `buf` (9 floats a triangle). Returns the counts above; with `detail` (an array) each crossing
 * and touch is pushed to it as { a, b, kind, shared, depth, length }. `selfIntersection: false` skips the pairwise part.
 */
export function manifoldAudit(buf, { selfIntersection = true, detail = null } = {}) {
    const n = buf.length / 9, key = (o) => buf[o] + "," + buf[o + 1] + "," + buf[o + 2];
    const ids = new Map(), tv = new Int32Array(n * 3);
    for (let t = 0; t < n; t++) for (let c = 0; c < 3; c++) {
        const k = key(t * 9 + c * 3);
        let id = ids.get(k);
        if (id === undefined) { id = ids.size; ids.set(k, id); }
        tv[t * 3 + c] = id;
    }
    const NV = ids.size;
    const R = { triangles: n, vertices: NV, degenerate: 0, open: 0, nonManifoldEdges: 0, pinchedVertices: 0, crossings: 0, touches: 0, coplanarOverlaps: 0 };
    const deg = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
        const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2];
        if (a === b || b === c || c === a || degenerateTri(tri(buf, t))) { deg[t] = 1; R.degenerate++; }
    }
    // edges: directed counts (closedness) and undirected face counts (edge-manifoldness)
    const D = new Map(), U = new Map();
    for (let t = 0; t < n; t++) for (let i = 0; i < 3; i++) {
        const a = tv[t * 3 + i], b = tv[t * 3 + (i + 1) % 3];
        if (a === b) continue;
        D.set(a * NV + b, (D.get(a * NV + b) || 0) + 1);
        const u = Math.min(a, b) * NV + Math.max(a, b);
        U.set(u, (U.get(u) || 0) + 1);
    }
    for (const [d, k] of D) { const a = Math.floor(d / NV), b = d % NV; if ((D.get(b * NV + a) || 0) !== k) R.open++; }
    for (const [, k] of U) if (k !== 2) R.nonManifoldEdges++;
    // vertex links: one piece each
    const link = new Map();
    for (let t = 0; t < n; t++) {
        if (deg[t]) continue;
        for (let i = 0; i < 3; i++) {
            const v = tv[t * 3 + i];
            let l = link.get(v);
            if (!l) link.set(v, (l = []));
            l.push(tv[t * 3 + (i + 1) % 3], tv[t * 3 + (i + 2) % 3]);
        }
    }
    for (const [, l] of link) {
        const p = new Map(), find = (x) => { while (p.get(x) !== x) { p.set(x, p.get(p.get(x))); x = p.get(x); } return x; };
        for (const x of l) if (!p.has(x)) p.set(x, x);
        for (let i = 0; i < l.length; i += 2) { const ra = find(l[i]), rb = find(l[i + 1]); if (ra !== rb) p.set(ra, rb); }
        if (new Set([...p.keys()].map(find)).size > 1) R.pinchedVertices++;
    }
    if (!selfIntersection) return R;
    // distinct triangles meet only along what they share
    const bvh = new MeshBVH(buf);
    for (const [a, b] of pairOverlap(bvh, bvh, 0)) {
        if (a >= b || deg[a] || deg[b]) continue;
        const sa = [tv[a * 3], tv[a * 3 + 1], tv[a * 3 + 2]], sb = [tv[b * 3], tv[b * 3 + 1], tv[b * 3 + 2]], sh = sa.filter((x) => sb.includes(x));
        const TA = tri(buf, a), TB = tri(buf, b), e = exactPair(TA, TB);
        if (e.kind === "none") continue;
        const shP = sh.map((id) => explicitPoint(TA[sa.indexOf(id)])), isShared = (P) => shP.some((Q) => same(P, Q));
        const note = (kind, len) => { if (detail) detail.push({ a, b, kind, shared: sh.length, depth: crossingDepth(TA, TB), length: len }); };
        if (e.kind === "point") {
            if (!isShared(e.P)) { if (sh.length) R.crossings++; else R.touches++; note(sh.length ? "crossing" : "touch", 0); }
            continue;
        }
        if (e.kind === "segment") {
            if (!(sh.length === 2 && isShared(e.P0) && isShared(e.P1))) {
                R.crossings++;
                note("crossing", Math.hypot(e.P0.r[0] - e.P1.r[0], e.P0.r[1] - e.P1.r[1], e.P0.r[2] - e.P1.r[2]));
            }
            continue;
        }
        // coplanar: in a projection where the plane is not flat
        const P = TA.map(explicitPoint), Q = TB.map(explicitPoint);
        const [i, j] = [[0, 1], [1, 2], [2, 0]].find(([x, y]) => orient2d(P[0], P[1], P[2], x, y) !== 0);
        const sgnA = orient2d(P[0], P[1], P[2], i, j), sgnB = orient2d(Q[0], Q[1], Q[2], i, j);
        if (sh.length === 2) {
            // a hinge: the other corners on opposite sides of the shared edge, the two wound alike
            const [u, w] = sh, oa = sa.find((x) => !sh.includes(x)), ob = sb.find((x) => !sh.includes(x));
            const pu = P[sa.indexOf(u)], pw = P[sa.indexOf(w)];
            if (orient2d(pu, pw, P[sa.indexOf(oa)], i, j) * orient2d(pu, pw, Q[sb.indexOf(ob)], i, j) >= 0 || sgnA !== sgnB) R.coplanarOverlaps++;
            continue;
        }
        const inside = (X, S, s) => [0, 1, 2].every((k) => orient2d(S[k], S[(k + 1) % 3], X, i, j) * s > 0);
        if (e.pts.some((X) => !isShared(X)) || P.some((X) => inside(X, Q, sgnB)) || Q.some((X) => inside(X, P, sgnA))) R.coplanarOverlaps++;
    }
    return R;
}
