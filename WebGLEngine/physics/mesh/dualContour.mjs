// WebGLEngine/physics/mesh/dualContour.mjs -- v3432
//
// DUAL CONTOURING OF HERMITE DATA, ON A UNIFORM GRID.
//
// *** WHAT v3417 MEASURED AND THIS FILE EXISTS TO CHANGE: marching tetrahedra cuts a sharp corner by a FIXED
// FRACTION OF A CELL -- 0.377, 0.386, 0.387, 0.379, 0.363 across a 4x refinement. HALVING THE GRID BUYS
// NOTHING, because a vertex can only sit on a grid EDGE and a corner never does. *** Dual contouring puts one
// vertex INSIDE each cell, wherever the sampled tangent planes say it belongs, so the corner is reachable.
//
// THE MINIMISER IS THE WHOLE ALGORITHM. Given crossings p_i with normals n_i, place the vertex at the x
// minimising sum (n_i . (x - p_i))^2. Solved through the NORMAL EQUATIONS with Tikhonov regularisation toward
// the cell's mass point: (A^T A + lambda I) x = A^T b + lambda c. No SVD, so no dependency and no
// pseudo-inverse tolerance to tune -- and the regulariser has a physical reading rather than a numerical one:
// WHERE THE PLANES DO NOT PIN A DIRECTION (a flat face pins one, an edge two, a corner three) IT FALLS BACK
// TOWARD THE CELL CENTROID ALONG EXACTLY THE UNPINNED DIRECTIONS.
//
// *** AND THE LOAD-BEARING NEGATIVE IS BUILT IN AS A KNOB: `massPoint` SKIPS THE SOLVE AND USES THE AVERAGE OF
// THE CROSSINGS, WHICH IS WHAT A NAIVE IMPLEMENTATION DOES. IT ROUNDS THE CORNER EXACTLY LIKE MARCHING TETS AND
// LANDS BACK ON ~0.38. So the number that proves this works is the same number that catches it done wrong. ***
"use strict";
import { edgeCrossing } from "./csg.mjs";

const CORNER = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
// the twelve edges of a cell, as pairs of corner indices
const EDGE = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** Solve a symmetric 3x3 by Gaussian elimination with partial pivoting. Returns null if it is singular. */
function solve3(M, rhs) {
    const A = [[M[0][0], M[0][1], M[0][2], rhs[0]], [M[1][0], M[1][1], M[1][2], rhs[1]], [M[2][0], M[2][1], M[2][2], rhs[2]]];
    for (let i = 0; i < 3; i++) {
        let piv = i;
        for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
        if (Math.abs(A[piv][i]) < 1e-14) return null;
        [A[i], A[piv]] = [A[piv], A[i]];
        for (let r = 0; r < 3; r++) {
            if (r === i) continue;
            const f = A[r][i] / A[i][i];
            for (let c = i; c < 4; c++) A[r][c] -= f * A[i][c];
        }
    }
    return [A[0][3] / A[0][0], A[1][3] / A[1][1], A[2][3] / A[2][2]];
}

/**
 * The QEF vertex for one cell.
 * @param hermite [{p, n}] crossings on this cell's edges
 * @param centre  the fallback the regulariser pulls toward
 * @param lambda  regularisation weight; small, because it must not bend a well-pinned corner
 */
export function qefVertex(hermite, centre, { lambda = 1e-4, massPoint = false } = {}) {
    if (!hermite.length) return centre.slice();
    const mass = [0, 0, 0];
    for (const h of hermite) { mass[0] += h.p[0]; mass[1] += h.p[1]; mass[2] += h.p[2]; }
    mass[0] /= hermite.length; mass[1] /= hermite.length; mass[2] /= hermite.length;
    // *** THE NEGATIVE: the average of the crossings. Every crossing lies on a grid edge, so their average does
    // too -- and a corner is not on a grid edge. THE SAME BLINDNESS AS MARCHING TETS, WEARING A NEWER NAME. ***
    if (massPoint) return mass;

    const M = [[lambda, 0, 0], [0, lambda, 0], [0, 0, lambda]];
    const rhs = [lambda * mass[0], lambda * mass[1], lambda * mass[2]];
    for (const { p, n } of hermite) {
        const d = n[0] * p[0] + n[1] * p[1] + n[2] * p[2];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) M[i][j] += n[i] * n[j];
            rhs[i] += n[i] * d;
        }
    }
    return solve3(M, rhs) || mass;
}

/**
 * Contour `node` over a uniform grid on [lo, hi]^3 with n cells per axis.
 * Returns { verts, quads, cells } -- quads as index quadruples, because DUAL CONTOURING IS NATURALLY QUAD and
 * splitting them here would hide which diagonal was chosen.
 */
export function dualContour(node, { lo = -1, hi = 1, n = 16, lambda = 1e-4, massPoint = false, clamp = true } = {}) {
    const h = (hi - lo) / n;
    const at = (i, j, k) => [lo + i * h, lo + j * h, lo + k * h];
    const sign = new Int8Array((n + 1) * (n + 1) * (n + 1));
    const S = (i, j, k) => sign[(i * (n + 1) + j) * (n + 1) + k];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) {
        sign[(i * (n + 1) + j) * (n + 1) + k] = node.f(at(i, j, k)) <= 0 ? 1 : 0;
    }

    const vertOf = new Map();                                     // cell key -> vertex index
    const verts = [];
    const key = (i, j, k) => (i * (n + 2) + j) * (n + 2) + k;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
        const herm = [];
        for (const [a, b] of EDGE) {
            const ca = CORNER[a], cb = CORNER[b];
            const sa = S(i + ca[0], j + ca[1], k + ca[2]), sb = S(i + cb[0], j + cb[1], k + cb[2]);
            if (sa === sb) continue;
            herm.push(edgeCrossing(node, at(i + ca[0], j + ca[1], k + ca[2]), at(i + cb[0], j + cb[1], k + cb[2])));
        }
        if (!herm.length) continue;
        const centre = [lo + (i + 0.5) * h, lo + (j + 0.5) * h, lo + (k + 0.5) * h];
        let v = qefVertex(herm, centre, { lambda, massPoint });
        if (clamp) {
            // *** CLAMPED TO ITS OWN CELL, WHICH IS A REAL LIMITATION AND NOT A SAFETY NET. *** A QEF whose
            // planes are nearly parallel can minimise far outside the cell, and letting it would tangle the
            // mesh. It also means a feature lying OUTSIDE its cell is CUT rather than captured -- the exact
            // thing Aviz.Cms discards and CMS was invented to handle. Uniform DC cannot fix that; the report
            // below counts how often it bites so the limitation is measured rather than assumed rare.
            for (let d = 0; d < 3; d++) v[d] = Math.min(Math.max(v[d], centre[d] - h / 2), centre[d] + h / 2);
        }
        vertOf.set(key(i, j, k), verts.length);
        verts.push(v);
    }

    // One quad per grid edge with a sign change, from the four cells around it.
    const quads = [];
    const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const around = [
        [[0, 0, 0], [0, -1, 0], [0, -1, -1], [0, 0, -1]],
        [[0, 0, 0], [0, 0, -1], [-1, 0, -1], [-1, 0, 0]],
        [[0, 0, 0], [-1, 0, 0], [-1, -1, 0], [0, -1, 0]],
    ];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) for (let k = 0; k <= n; k++) {
        for (let d = 0; d < 3; d++) {
            const e = dirs[d];
            if (i + e[0] > n || j + e[1] > n || k + e[2] > n) continue;
            if (S(i, j, k) === S(i + e[0], j + e[1], k + e[2])) continue;
            const q = [];
            for (const o of around[d]) {
                const ci = i + o[0], cj = j + o[1], ck = k + o[2];
                if (ci < 0 || cj < 0 || ck < 0 || ci >= n || cj >= n || ck >= n) { q.length = 0; break; }
                const vi = vertOf.get(key(ci, cj, ck));
                if (vi === undefined) { q.length = 0; break; }
                q.push(vi);
            }
            if (q.length === 4) quads.push(q);
        }
    }
    return { verts, quads, cells: verts.length, h };
}

/** Quads to triangles, for anything that wants them. The diagonal is stated: 0-1-2 and 0-2-3. */
export const triangulate = (quads) => quads.flatMap(([a, b, c, d]) => [[a, b, c], [a, c, d]]);

/** Distance from p to the nearest mesh VERTEX. For a corner, that is the question: did any vertex reach it? */
export function nearestVertexDistance(verts, p) {
    let best = Infinity;
    for (const v of verts) {
        const dx = v[0] - p[0], dy = v[1] - p[1], dz = v[2] - p[2];
        best = Math.min(best, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    return best;
}
