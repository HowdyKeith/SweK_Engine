// WebGLEngine/physics/mesh/uvLscm.mjs -- v4537
// ---------------------------------------------------------------------------------------------------------------
// THE CURVED HALF. physics/mesh/uvUnwrap.mjs closed two of the three callers blocked on missing UVs, and said
// in as many words why it could not close the third: "a planar unwrapper is a complete answer for meshCSG and
// a wall, and not for a robot." This is the robot.
//
// tools/export/reskin.js names it exactly: GPU_Assets/RobotExpressive.glb, "7,214 vertices ... and NO TEXCOORD_0
// AND NO TEXTURE AT ALL", so "the simple path is not wrong, it is unavailable ON THIS ASSET". Its vertex-colour
// route exists because of that sentence.
//
// ---- WHAT MEASURING THE ASSET FOUND, BEFORE ANY OF THIS WAS WRITTEN ---------------------------------------------
//
// *** THREE QUARTERS OF THAT VERTEX BUFFER IS DUPLICATION, AND THE MESH IS NOT ONE SURFACE. *** 7,214 vertices
// carry only 3,237 triangles -- an average valence of 1.35, which is not a triangle mesh, it is a pile of
// loose corners. The file has NINETEEN primitives and every one carries its own copy of the vertices along its
// seams. Welded on position: 7,214 -> 1,758 vertices, 76% duplicates, valence 5.52, which IS a triangle mesh.
//
// LSCM IS A STATEMENT ABOUT NEIGHBOURS, SO WITHOUT THE WELD IT HAS NOTHING TO SAY. Run on the raw buffer every
// triangle is its own island, each flattens perfectly on its own, and the result is a conformal map with a
// seam down every single edge -- a number that looks perfect and means nothing. The weld is not a tidy-up
// step; it is the step that makes the problem exist.
//
// And the welded mesh is 60 disconnected components, none larger than 138 vertices:
//     37 are DISKS      (chi = 1, boundary present)     678 triangles     21%
//     22 are CLOSED     (no boundary at all)          2,312 triangles     71%
//      1 is non-manifold
// *** SO "UNWRAP THE DISKS AND REPORT THE REST" WOULD LEAVE 71% OF THE ROBOT UNTEXTURED. *** A closed surface
// has no boundary to flatten to and Gauss forbids flattening it without stretching, so the closed components
// are the whole job rather than an edge case, and they are why this file segments rather than merely solves.
//
// ---- THE THREE PIECES, AND WHY EACH IS THE SHAPE IT IS -----------------------------------------------------------
//
//   weld()      position-quantised merge, because connectivity is the input LSCM actually needs.
//   charts()    greedy growth by NORMAL DEVIATION with a DISK GUARD. Two jobs at once and they are not
//               separable: bounding the normal spread bounds the distortion, and refusing any triangle that
//               would close a loop keeps every chart a disk, which is the topology LSCM requires. A closed
//               component becomes several charts and the seams between them are the cut -- no separate cutting
//               pass, because the segmentation already has to make one.
//   lscm()      Levy et al. 2002, least-squares conformal maps. One complex equation per triangle asserting
//               Cauchy-Riemann in the triangle's own isometric frame; two pinned vertices to kill the
//               translation, rotation and scale the energy cannot see; solved in least squares.
//
// THE SOLVER IS MATRIX-FREE CONJUGATE GRADIENT ON THE NORMAL EQUATIONS, and it is written here rather than
// imported because THE TREE HAS NO GENERAL ONE: the CG in fluid/multigrid*.mjs is a grid Poisson solver whose
// operator is a stencil, and physics/mesh/rankRepair and triReconstruct solve 2x2 and 3x3 systems per cell.
// Neither takes an apply-A. A^T A is never formed -- only A and A^T are applied, six entries per row -- so the
// cost is in the triangles rather than in the square of the vertices.
"use strict";
import { shelfPack } from "./uvUnwrap.mjs";      // one owner: the packer is the planar file's and stays there

const sub = (P, i, j) => [P[3*i] - P[3*j], P[3*i+1] - P[3*j+1], P[3*i+2] - P[3*j+2]];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/**
 * Merge vertices that share a position, and drop triangles that degenerate as a result.
 *
 * The quantum is a LENGTH and the mesh is scaled to its own bounding box first, so one number works on a
 * 0.06-unit robot and a 100-unit building alike -- a fixed absolute epsilon silently welds nothing on the
 * first and everything on the second.
 */
export function weld(positions, indices, { relTol = 1e-6 } = {}) {
    const nv = positions.length / 3;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) {
        const v = positions[3*i+k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v;
    }
    const diag = Math.hypot(hi[0]-lo[0], hi[1]-lo[1], hi[2]-lo[2]) || 1;
    const q = diag * relTol;
    const map = new Map(), remap = new Int32Array(nv), keep = [];
    for (let i = 0; i < nv; i++) {
        const k = Math.round(positions[3*i]/q) + "," + Math.round(positions[3*i+1]/q) + "," + Math.round(positions[3*i+2]/q);
        let id = map.get(k);
        if (id === undefined) { id = keep.length; map.set(k, id); keep.push(i); }
        remap[i] = id;
    }
    const P = new Float64Array(keep.length * 3);
    for (let n = 0; n < keep.length; n++) for (let k = 0; k < 3; k++) P[3*n+k] = positions[3*keep[n]+k];
    const tris = [];
    let degenerate = 0, duplicate = 0;
    // *** AND THE SAME-WINDING DUPLICATE FACE, WHICH IS NOT THE SAME THING AS A DOUBLE-SIDED ONE. ***
    // RobotExpressive carries 64 triangles that are another triangle written again with its vertices rotated:
    // [1056,1057,1058] and [1057,1058,1056], identical normal. They cost atlas twice over -- one chart of three
    // triangles came out filling 150% of its own bounding box, which is the arithmetic telling you a face is
    // drawn twice -- and they are invisible to a per-triangle metric because each one alone is fine.
    // OPPOSITE winding is deliberate double-sided geometry and is KEPT; the check is the winding, not the
    // vertex set, and measured on this asset all 64 are same-winding and none is opposite.
    const seenFace = new Map();
    const canon = (a, b, c) => {                    // rotation-invariant, reflection-SENSITIVE
        if (a <= b && a <= c) return a + "_" + b + "_" + c;
        if (b <= a && b <= c) return b + "_" + c + "_" + a;
        return c + "_" + a + "_" + b;
    };
    for (let t = 0; t < indices.length; t += 3) {
        const a = remap[indices[t]], b = remap[indices[t+1]], c = remap[indices[t+2]];
        if (a === b || b === c || a === c) { degenerate++; continue; }
        const k = canon(a, b, c);
        if (seenFace.has(k)) { duplicate++; continue; }
        seenFace.set(k, true);
        tris.push([a, b, c]);
    }
    return { positions: P, tris, vertsBefore: nv, vertsAfter: keep.length, degenerate, duplicate };
}

/** Unit normal of a triangle, and twice its area. */
export function triNormal(P, T) {
    const n = cross(sub(P, T[1], T[0]), sub(P, T[2], T[0]));
    const L = len(n);
    return { n: L > 0 ? [n[0]/L, n[1]/L, n[2]/L] : [0, 0, 0], area2: L };
}

const edgeKey = (a, b) => (a < b ? a + "_" + b : b + "_" + a);

/**
 * Segment triangles into charts by normal deviation, refusing any triangle that would stop the chart being a
 * disk.
 *
 * *** THE DISK GUARD IS THE HALF THAT IS EASY TO LEAVE OUT, AND LEAVING IT OUT IS SILENT. *** Growing purely
 * on normals will happily wrap a chart around a cylinder until its two ends meet; the chart is then an annulus,
 * LSCM still returns an answer, and the answer is folded over itself. The test is Euler's: a triangle joins
 * only if it does not raise the chart's edge count without raising its vertex count to match -- i.e. it shares
 * exactly one edge with the chart, or shares two while bringing no new vertex is refused. Checked as
 * chi = V - E + F, which must stay 1.
 */
export function charts(P, tris, { maxNormalDeg = 40 } = {}) {
    const nt = tris.length;
    if (!nt) return [];
    const norms = tris.map((T) => triNormal(P, T).n);
    const cosLimit = Math.cos(maxNormalDeg * Math.PI / 180);
    // edge -> the (at most two) triangles on it
    const eTris = new Map();
    tris.forEach((T, i) => { for (const [a, b] of [[T[0],T[1]],[T[1],T[2]],[T[2],T[0]]]) {
        const k = edgeKey(a, b); if (!eTris.has(k)) eTris.set(k, []); eTris.get(k).push(i);
    } });
    const neighbours = (i) => {
        const out = [];
        for (const [a, b] of [[tris[i][0],tris[i][1]],[tris[i][1],tris[i][2]],[tris[i][2],tris[i][0]]])
            for (const j of eTris.get(edgeKey(a, b))) if (j !== i) out.push(j);
        return out;
    };
    const chartOf = new Int32Array(nt).fill(-1);
    const out = [];
    for (let seed = 0; seed < nt; seed++) {
        if (chartOf[seed] >= 0) continue;
        const members = [seed];
        chartOf[seed] = out.length;
        const V = new Set(tris[seed]), E = new Set();
        for (const [a, b] of [[tris[seed][0],tris[seed][1]],[tris[seed][1],tris[seed][2]],[tris[seed][2],tris[seed][0]]]) E.add(edgeKey(a, b));
        let axis = norms[seed].slice();
        const queue = neighbours(seed).slice();
        while (queue.length) {
            const j = queue.shift();
            if (chartOf[j] >= 0) continue;
            if (dot(norms[j], axis) < cosLimit) continue;
            // Euler test on the candidate, done on copies so a refusal costs nothing.
            const nv0 = V.size, ne0 = E.size, nf0 = members.length;
            const addV = tris[j].filter((v) => !V.has(v));
            const addE = [[tris[j][0],tris[j][1]],[tris[j][1],tris[j][2]],[tris[j][2],tris[j][0]]]
                .map(([a, b]) => edgeKey(a, b)).filter((k) => !E.has(k));
            const chi = (nv0 + new Set(addV).size) - (ne0 + new Set(addE).size) + (nf0 + 1);
            if (chi !== 1) continue;                       // would add a handle or close a loop: refuse
            for (const v of addV) V.add(v);
            for (const k of addE) E.add(k);
            members.push(j);
            chartOf[j] = out.length;
            // the axis follows the chart, normalised, so a gently curving surface stays one chart
            const w = members.length;
            axis = [axis[0] + (norms[j][0] - axis[0]) / w, axis[1] + (norms[j][1] - axis[1]) / w, axis[2] + (norms[j][2] - axis[2]) / w];
            const L = len(axis) || 1; axis = [axis[0]/L, axis[1]/L, axis[2]/L];
            for (const k of neighbours(j)) if (chartOf[k] < 0) queue.push(k);
        }
        out.push(members);
    }
    return out;
}

/**
 * The isometric 2D frame of one triangle: p0 at the origin, p1 on the +x axis, p2 above it. Distances and
 * angles inside the triangle are exact here -- it is a rigid motion, not a projection -- which is what makes
 * the conformal energy a statement about the MAP and not about this frame.
 */
export function localFrame(P, T) {
    const e1 = sub(P, T[1], T[0]), e2 = sub(P, T[2], T[0]);
    const x2 = len(e1);
    if (x2 === 0) return null;
    const u = [e1[0]/x2, e1[1]/x2, e1[2]/x2];
    const x3 = dot(e2, u);
    const y3 = len(cross(e1, e2)) / x2;
    if (!(y3 > 0)) return null;
    return [[0, 0], [x2, 0], [x3, y3]];
}

/**
 * Matrix-free CG on the normal equations of the sparse rows in `rows`, solving min |A x - b|.
 *
 * *** THE ITERATION BUDGET SCALES WITH THE SYSTEM, AND THE FIRST DRAFT'S DID NOT -- WHICH IS A SILENTLY WRONG
 * ANSWER RATHER THAN A SLOW ONE. *** Measured on a cylinder strip at a fixed 400 iterations, the conformal
 * error GREW with refinement: 7.0e-7 at 96 triangles, 1.7e-6 at 384, 3.4e-6 at 1,536, and at 6,144 it reached
 * 5.3e+1 -- an unwrap folded beyond recognition, returned with no error and no warning. CG needs iterations in
 * proportion to the square root of the condition number and the normal equations SQUARE that condition number,
 * so a budget that does not grow with n is a budget that quietly stops solving.
 *
 * AND THE BUDGET ALONE IS NOT THE FIX, BECAUSE ANY BUDGET CAN BE EXCEEDED. The relative residual is returned
 * with the answer, so a caller that got a non-converged map can SEE that it did. Run to convergence on the
 * same developable strip the conformal error is 4.7e-14 -- machine precision -- which is what says the error
 * above was the solver stopping and never the mathematics.
 */
function solveLsqCG(rows, n, b, { iters = null, tol = 1e-18 } = {}) {
    iters = iters ?? Math.max(400, 30 * n);
    const applyA = (x) => rows.map((r) => { let s = 0; for (let k = 0; k < r.idx.length; k++) s += r.val[k] * x[r.idx[k]]; return s; });
    const applyAt = (y) => { const out = new Float64Array(n);
        for (let i = 0; i < rows.length; i++) { const r = rows[i], yi = y[i];
            for (let k = 0; k < r.idx.length; k++) out[r.idx[k]] += r.val[k] * yi; } return out; };
    const x = new Float64Array(n);
    let r = applyAt(b.map((v, i) => v - 0));            // x0 = 0, so residual of normal eqs is A^T b
    let p = Float64Array.from(r);
    let rs = r.reduce((s, v) => s + v * v, 0);
    const rs0 = rs;
    for (let it = 0; it < iters && rs > tol * (rs0 || 1); it++) {
        const Ap = applyA(p), AtAp = applyAt(Ap);
        let pAp = 0; for (let i = 0; i < n; i++) pAp += p[i] * AtAp[i];
        if (!(pAp > 0)) break;
        const alpha = rs / pAp;
        for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * AtAp[i]; }
        const rs1 = r.reduce((s, v) => s + v * v, 0);
        const beta = rs1 / rs;
        for (let i = 0; i < n; i++) p[i] = r[i] + beta * p[i];
        rs = rs1;
    }
    return { x, residual: Math.sqrt(rs / (rs0 || 1)), iters };
}

/**
 * Least-squares conformal map of one chart.
 *
 * One complex equation per triangle -- sum_j W_j U_j = 0 with W from the isometric frame -- is the discrete
 * Cauchy-Riemann condition, and its real and imaginary parts are two real rows. The energy is invariant under
 * translation, rotation and scale of the whole chart, so the system is rank-deficient by four until two
 * vertices are PINNED.
 *
 * *** WHICH TWO MATTERS ONLY ON A CURVED CHART, AND MEASURING IT ON A FLAT ONE SAYS IT NEVER MATTERS. ***
 * The pins are usually described as a gauge fix, and if they were only that the choice would be free. They are
 * not: pinning two vertices fixes THE DISTANCE BETWEEN THEM as well as the similarity, and where no exactly
 * conformal map exists the true minimiser generally wants some other distance. So the pins are a constraint
 * the solution has to absorb, and the further apart they are the more of the chart there is to absorb it.
 *
 * That is invisible on a developable surface, because there the conformal map IS exact and the constraint
 * costs nothing. Measured on a 1,536-triangle cylinder, taking the first pair beat searching for the furthest
 * (5.5e-10 against 8.6e-9) and the obvious conclusion -- that the search is waste -- IS WRONG, drawn from the
 * one surface class that cannot refute it. On a 741-triangle sphere cap, where no exact map exists:
 *
 *     longest edge        O(tris)    conformal 1.4249    area ratio 8.7674
 *     two-pass farthest   O(n)       conformal 1.1839    area ratio 5.7311
 *     furthest pair       O(n^2)     conformal 1.1673    area ratio 4.6126
 *
 * The two-pass farthest-point heuristic is used: pick any vertex, take the one furthest from it, then the one
 * furthest from THAT. It lands within 2% of the exhaustive search on conformal distortion and is linear, so a
 * single large chart cannot make the pinning cost quadratic in a mesh's vertices. On the robot all three agree
 * to four figures (1.1838 / 1.1840 / 1.1840) because its charts average 4.4 triangles -- which is why the
 * sphere cap is the fixture that decides this and the asset is not.
 */
export function lscm(P, chartTris) {
    const verts = [...new Set(chartTris.flat())];
    const idx = new Map(verts.map((v, i) => [v, i]));
    const n = verts.length;
    if (n < 3) return null;
    let pa = 0, pb = 1, best = -1, seed = 0;
    for (let pass = 0; pass < 2; pass++) {
        best = -1;
        for (let i = 0; i < n; i++) {
            const d = len(sub(P, verts[i], verts[seed]));
            if (d > best) { best = d; pa = seed; pb = i; }
        }
        seed = pb;
    }
    if (!(best > 0) || pa === pb) return null;
    // unknown layout: u_0..u_{n-1}, v_0..v_{n-1}, with the two pins moved to the right-hand side
    const free = [], slot = new Int32Array(2 * n).fill(-1);
    for (let i = 0; i < n; i++) { if (i === pa || i === pb) continue; slot[i] = free.length; free.push(i); slot[n+i] = free.length; free.push(n + i); }
    const pinned = new Float64Array(2 * n);
    pinned[pa] = 0; pinned[n + pa] = 0; pinned[pb] = best; pinned[n + pb] = 0;
    const rows = [], rhs = [];
    for (const T of chartTris) {
        const f = localFrame(P, T);
        if (!f) continue;
        const [[x1, y1], [x2, y2], [x3, y3]] = f;
        const d = Math.sqrt(Math.abs((x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1))) || 1;
        const W = [[(x3 - x2) / d, (y3 - y2) / d], [(x1 - x3) / d, (y1 - y3) / d], [(x2 - x1) / d, (y2 - y1) / d]];
        for (const part of [0, 1]) {
            const r = { idx: [], val: [] }; let bb = 0;
            for (let j = 0; j < 3; j++) {
                const vi = idx.get(T[j]), [a, b2] = W[j];
                // real: a*u - b*v ; imag: b*u + a*v
                const cu = part === 0 ? a : b2, cv = part === 0 ? -b2 : a;
                for (const [col, coef] of [[vi, cu], [n + vi, cv]]) {
                    if (slot[col] >= 0) { r.idx.push(slot[col]); r.val.push(coef); }
                    else bb -= coef * pinned[col];
                }
            }
            rows.push(r); rhs.push(bb);
        }
    }
    if (!rows.length) return null;
    const { x, residual } = solveLsqCG(rows, free.length, rhs);
    const uv = new Map();
    for (let i = 0; i < n; i++) {
        const u = slot[i] >= 0 ? x[slot[i]] : pinned[i];
        const v = slot[n + i] >= 0 ? x[slot[n + i]] : pinned[n + i];
        uv.set(verts[i], [u, v]);
    }
    uv.residual = residual;          // rides with the answer: a map nobody could check is a map nobody should trust
    return uv;
}

/**
 * The grading measurement, and it is the one that says what LSCM does and does not promise.
 *
 * Per triangle, the map from its isometric 3D frame to its UVs is affine with a 2x2 Jacobian J. Its singular
 * values s1 >= s2 are the stretch along the two principal directions, and everything worth knowing is in them:
 *   CONFORMAL (angle) distortion   s1/s2   -- 1 exactly when angles are preserved. This is what LSCM minimises.
 *   AREA distortion                s1*s2   -- what LSCM does NOT control, and cannot: Gauss's Theorema
 *                                             Egregium says a sphere has no isometric plane map at all.
 * A NEGATIVE determinant is a FLIPPED triangle: the map folded, and no amount of small distortion excuses it.
 */
export function distortion(P, chartTris, uv) {
    const conf = [], area = [];
    let flipped = 0, skipped = 0;
    for (const T of chartTris) {
        const f = localFrame(P, T);
        const a = uv.get(T[0]), b = uv.get(T[1]), c = uv.get(T[2]);
        if (!f || !a || !b || !c) { skipped++; continue; }
        const [[x1, y1], [x2, y2], [x3, y3]] = f;
        const det3 = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
        if (det3 === 0) { skipped++; continue; }
        // J maps the 3D-frame basis to the UV basis
        const du = [b[0] - a[0], c[0] - a[0]], dv = [b[1] - a[1], c[1] - a[1]];
        const e = [[x2 - x1, x3 - x1], [y2 - y1, y3 - y1]];
        const inv = [[e[1][1] / det3, -e[0][1] / det3], [-e[1][0] / det3, e[0][0] / det3]];
        const J = [[du[0]*inv[0][0] + du[1]*inv[1][0], du[0]*inv[0][1] + du[1]*inv[1][1]],
                   [dv[0]*inv[0][0] + dv[1]*inv[1][0], dv[0]*inv[0][1] + dv[1]*inv[1][1]]];
        const detJ = J[0][0]*J[1][1] - J[0][1]*J[1][0];
        if (detJ < 0) flipped++;
        const E = J[0][0]**2 + J[1][0]**2, G = J[0][1]**2 + J[1][1]**2, F = J[0][0]*J[0][1] + J[1][0]*J[1][1];
        const disc = Math.sqrt(Math.max(0, (E - G) ** 2 + 4 * F * F));
        const s1 = Math.sqrt(Math.max(0, (E + G + disc) / 2)), s2 = Math.sqrt(Math.max(0, (E + G - disc) / 2));
        if (s2 > 0) conf.push(s1 / s2);
        area.push(Math.abs(detJ));
    }
    const stat = (xs) => xs.length ? { min: Math.min(...xs), max: Math.max(...xs),
        mean: xs.reduce((s, v) => s + v, 0) / xs.length } : { min: 0, max: 0, mean: 0 };
    return { conformal: stat(conf), area: stat(area), flipped, skipped, n: conf.length };
}

/**
 * *** PACK THE CHART, NOT ITS BOX. ***
 *
 * Measured on RobotExpressive with shelf-packed bounding boxes, the atlas divides into three parts: 40.7%
 * triangles, 28.1% inside the boxes but not covered by any triangle, and 31.3% between the boxes. The second
 * number is the one a box packer cannot touch no matter how well it packs -- a chart is a ragged polygon and
 * its axis-aligned box is a rectangle, and the median chart fills only 79% of its own box.
 *
 * So each chart is RASTERISED to a small occupancy bitmap and placed against a skyline of the atlas so far.
 * For a candidate column the chart drops until its own BOTTOM PROFILE meets the skyline's TOP PROFILE, so a
 * chart with a notch in its underside settles over a bump in what is already placed. That is the whole of the
 * gain: two ragged shapes interlock where two rectangles cannot.
 *
 * Resolution is a real parameter and not a detail. Too coarse and a small chart is one cell and cannot
 * interlock with anything; too fine and the scan costs more than the atlas is worth. It is expressed as cells
 * across the whole atlas, so it scales with the mesh rather than with any one chart.
 */
/**
 * Mark every grid cell a triangle TOUCHES, by separating-axis against the cell rectangle.
 *
 * The three triangle edge normals plus the two rectangle axes are a complete set for convex-convex overlap in
 * 2D, so this is exact rather than a finer sampling of the same mistake -- a point sample at any density still
 * misses a sliver thinner than the sample spacing, and a UV chart is full of slivers.
 */
function conservativeMask(tri, lo, W, H, mw, mh, cellSize) {
    const out = new Uint8Array(mw * mh);
    // *** THE MASK CELL IS THE ATLAS CELL, NOT THE CHART'S WIDTH DIVIDED BY ITS COLUMN COUNT. *** Deriving it
    // as W/mw makes a chart's rows slightly SHORTER than the cells the skyline reserves, so its last row
    // under-covers and the next chart is nested a hair too close: 3 colliding triangle pairs survived the
    // conservative rasterisation for exactly this reason. The two grids have to be the same grid.
    const cw = cellSize || (W / mw), ch = cellSize || (H / mh);
    for (const [a, b, c] of tri) {
        const xs = [a[0], b[0], c[0]], ys = [a[1], b[1], c[1]];
        const x0 = Math.max(0, Math.floor((Math.min(...xs) - lo[0]) / cw));
        const x1 = Math.min(mw - 1, Math.floor((Math.max(...xs) - lo[0]) / cw));
        const y0 = Math.max(0, Math.floor((Math.min(...ys) - lo[1]) / ch));
        const y1 = Math.min(mh - 1, Math.floor((Math.max(...ys) - lo[1]) / ch));
        for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
            if (out[cy * mw + cx]) continue;
            const rx0 = lo[0] + cx * cw, rx1 = rx0 + cw, ry0 = lo[1] + cy * ch, ry1 = ry0 + ch;
            let sep = false;
            for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                const nx = -(q[1] - p[1]), ny = q[0] - p[0];
                const d0 = nx * p[0] + ny * p[1];
                const third = (p === a && q === b) ? c : (p === b && q === c) ? a : b;
                const side = Math.sign(nx * third[0] + ny * third[1] - d0) || 1;
                let allOut = true;
                for (const [rx, ry] of [[rx0, ry0], [rx1, ry0], [rx0, ry1], [rx1, ry1]])
                    if (Math.sign(nx * rx + ny * ry - d0) === side || nx * rx + ny * ry === d0) { allOut = false; break; }
                if (allOut) { sep = true; break; }
            }
            if (!sep) out[cy * mw + cx] = 1;
        }
    }
    return out;
}

export function rasterPack(shapes, { cells = 256, padCells = 1, aspect = null } = {}) {
    // shapes: [{ w, h, covered(u01, v01) -> bool }] in their own units; returns placements in the same units
    const span0 = Math.max(...shapes.map((s) => Math.max(s.w, s.h)), 1e-12);
    const total = shapes.reduce((a, s) => a + s.w * s.h, 0);
    // *** THE WIDTH IS SEARCHED, AND WRITING A FRESH HEURISTIC HERE REINTRODUCED A DEFECT ALREADY FIXED ONCE. ***
    // v4536 found the shelf packer producing a taller-than-wide strip on every input, so a fifth of the square
    // the UVs address was empty, and repaired it by SEARCHING the strip width for the smallest square. This
    // function opened with `side = max(span0, sqrt(total) * 1.25)` -- a fresh guess -- and produced 1.0328 wide
    // by 0.7415 tall: a 28% wasted band, identical at 256 cells and at 2048, which is why nesting appeared to
    // do nothing at any resolution. THE SAME SHAPE, IN A SECOND PACKER, WRITTEN BY THE SAME HAND A DAY LATER.
    // The width is a free parameter; anything that fixes it by formula is guessing.
    if (aspect === null) {
        // *** THE WIDTH IS DRIVEN TOWARD BALANCE, NOT CHOSEN FROM A LIST. ***
        // Two earlier attempts at this number are worth recording because both looked reasonable and both
        // silently capped the result. A FORMULA (`sqrt(total) * 1.25`) gave 1.0328 wide by 0.7415 tall -- a 28%
        // wasted band, identical at 256 cells and at 2048, which is what made nesting look useless at every
        // resolution. A SEARCH OVER EIGHT FIXED MULTIPLIERS then picked the best of eight wrong answers: at 512
        // cells it still returned 0.0823 by 0.0645, so the finer grid's better packing (height 0.0701 -> 0.0645)
        // was thrown away by a width nothing had adjusted.
        //
        // The objective is a SQUARE, so the fixed point is width == height, and that is solved for rather than
        // guessed: pack, then scale the width by the aspect it came out with, and repeat. It converges in a
        // few passes because packed height falls roughly as the width rises. This is the third time in two days
        // that a hard-coded atlas width has cost a fifth of a texture -- v4536 in the shelf packer, and twice
        // here -- so the rule is written down: A PACKER'S WIDTH IS A FREE PARAMETER AND ANY CONSTANT IS A GUESS.
        // AND THE ITERATION RUNS AT THE RESOLUTION IT WILL SHIP AT, which is the third time this number has
        // been got wrong. Balancing on a cheap 96-cell probe converged in two steps and then failed: a finer
        // grid nests tighter, so the height it reaches is lower and the width that balanced the coarse pack
        // letterboxes the fine one (0.0849 x 0.0610 at 512 cells, a 28% band, coverage stuck at 42.0% for
        // every resolution). The balance point is a property of the packing, so it moves with the packing.
        // It converges in two or three passes, so the cost is a small multiple rather than a search.
        let side = Math.max(span0, Math.sqrt(total));
        for (let it = 0; it < 5; it++) {
            const t = rasterPack(shapes, { cells, padCells, aspect: side });
            if (!(t.height > 0)) break;
            const ratio = t.height / t.width;
            if (Math.abs(ratio - 1) < 0.02) return t;
            side = Math.max(span0, side * Math.sqrt(ratio));
        }
        return rasterPack(shapes, { cells, padCells, aspect: side });
    }
    const side = aspect;
    const cell = side / cells;
    const order = shapes.map((_, i) => i).sort((a, b) => (shapes[b].w * shapes[b].h) - (shapes[a].w * shapes[a].h));
    const gridW = cells;
    const skyline = new Int32Array(gridW);
    const place = new Array(shapes.length);
    let usedH = 0;
    for (const si of order) {
        const S = shapes[si];
        const mw = Math.max(1, Math.ceil(S.w / cell)), mh = Math.max(1, Math.ceil(S.h / cell));
        // bottom and top profile of the chart's own occupancy, in cells
        // *** CONSERVATIVE, NOT POINT-SAMPLED, AND THE DIFFERENCE IS 78 COLLIDING TRIANGLE PAIRS. ***
        // The first version marked a cell occupied when its CENTRE was covered. A sliver that crosses a cell
        // without reaching its middle then reads as empty, another chart is nested into that cell, and their
        // texels land on top of each other -- measured at 78 cross-chart overlapping pairs on the robot, where
        // the shelf packer had 0. A packer that interlocks shapes has to know where the shapes ARE, so a cell
        // is occupied if any triangle touches it at all: separating-axis against the cell rectangle, exact.
        const bottom = new Int32Array(mw).fill(-1), top = new Int32Array(mw).fill(-1);
        const touch = S.cells(mw, mh, cell);
        for (let cx = 0; cx < mw; cx++) for (let cy = 0; cy < mh; cy++) {
            if (!touch[cy * mw + cx]) continue;
            if (bottom[cx] < 0) bottom[cx] = cy;
            top[cx] = cy;
        }
        for (let cx = 0; cx < mw; cx++) if (bottom[cx] < 0) { bottom[cx] = 0; top[cx] = -1; }   // empty column
        const padW = mw + 2 * padCells;
        let bestX = 0, bestY = Infinity;
        for (let x0 = 0; x0 + padW <= gridW; x0++) {
            let y = 0;
            for (let i = 0; i < mw; i++) {
                if (top[i] < 0) continue;
                const need = skyline[x0 + padCells + i] - bottom[i] + padCells;
                if (need > y) y = need;
            }
            if (y < bestY) { bestY = y; bestX = x0; }
        }
        if (!isFinite(bestY)) { bestY = 0; bestX = 0; }
        // *** THE PAD HAS TO KEEP CHARTS APART SIDEWAYS TOO, AND FOR THREE ROUNDS IT ONLY DID SO UPWARDS. ***
        // padCells was an OFFSET -- it shifted a chart right by a cell and added a cell above it -- and never a
        // SEPARATION. Two charts landing in adjacent columns therefore got no gap at all: measured across 3,287
        // side-by-side pairs on the robot, the smallest horizontal gap was 0.00 cells against 0.67 vertically.
        // That is what the verify loop was paying for when it escalated to pad 3 at 256 and 384 cells: it was
        // widening BOTH directions to buy a margin that was missing in ONE, and the coverage it cost showed up
        // as 256-cell packs coming out worse than the shelf packer they were meant to beat.
        // The skyline is raised across the chart's own columns AND the padCells columns either side of them,
        // taking the height of the nearest column that has content.
        for (let d = -padCells; d < mw + padCells; d++) {
            const src = Math.max(0, Math.min(mw - 1, d));
            let h = -1;
            for (let k = Math.max(0, d - padCells); k <= Math.min(mw - 1, d + padCells); k++)
                if (top[k] >= 0 && top[k] > h) h = top[k];
            if (h < 0) continue;
            const col = bestX + padCells + d;
            if (col >= 0 && col < gridW) skyline[col] = Math.max(skyline[col], bestY + h + 1 + padCells);
        }
        place[si] = { x: (bestX + padCells) * cell, y: bestY * cell, w: S.w, h: S.h };
        usedH = Math.max(usedH, bestY * cell + S.h);
    }
    return { placements: place, width: gridW * cell, height: usedH, cell };
}

/**
 * Rotate a chart's UVs so its bounding box is as small as possible, and return the rotated copy.
 *
 * *** A CHART IS PACKED BY ITS BOX AND SOLVED WITHOUT ONE. *** LSCM fixes the map up to a rotation and has no
 * reason to prefer any particular one, so a long thin chart arrives at whatever diagonal angle the pins left
 * it at -- and a diagonal strip's axis-aligned box is mostly empty. The rotation costs nothing that matters:
 * a conformal map composed with a rotation is still conformal and still the same distortion, so this changes
 * where the chart sits and nothing about how good it is.
 *
 * The minimum-area box of a convex hull always has a side flush with a hull edge (Freeman-Shapira), so the
 * hull's edge directions are the only angles worth trying -- exact, and far fewer than sampling. Fewer than
 * three hull points means the chart is a sliver or a point and any angle is as good as another.
 */
export function orientChart(uv) {
    const pts = [...uv.values()];
    if (pts.length < 3) return { uv, angle: 0 };
    // convex hull, monotone chain
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (src) => { const h = [];
        for (const p of src) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); }
        return h; };
    const hull = half(P).slice(0, -1).concat(half(P.slice().reverse()).slice(0, -1));
    if (hull.length < 3) return { uv, angle: 0 };
    let bestA = 0, bestArea = Infinity;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i], b = hull[(i + 1) % hull.length];
        const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const c = Math.cos(-th), s2 = Math.sin(-th);
        let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
        for (const [x, y] of hull) {
            const rx = x * c - y * s2, ry = x * s2 + y * c;
            if (rx < lo[0]) lo[0] = rx; if (rx > hi[0]) hi[0] = rx;
            if (ry < lo[1]) lo[1] = ry; if (ry > hi[1]) hi[1] = ry;
        }
        const area = (hi[0] - lo[0]) * (hi[1] - lo[1]);
        if (area < bestArea) { bestArea = area; bestA = th; }
    }
    const c = Math.cos(-bestA), s2 = Math.sin(-bestA);
    const out = new Map();
    for (const [k, [x, y]] of uv) out.set(k, [x * c - y * s2, x * s2 + y * c]);
    out.residual = uv.residual;
    return { uv: out, angle: bestA };
}

/**
 * Split any chart that overlaps itself, until none does.
 *
 * *** DETECTION WITHOUT REPAIR IS HALF AN ANSWER, AND THE OVERLAPS ARE NOT THE MERGER'S FAULT. *** Two charts
 * of RobotExpressive's ORIGINAL 735 already overlapped -- 20-triangle strips, conformal 1.0008, zero flips,
 * residual 6.4e-13, so locally flawless and fully converged, with two triangles three hops apart in the chart
 * landing on each other in the plane. They were there before any merging and nothing could see them. Rejecting
 * merges is not enough when the input already contains the fault.
 *
 * A chart that overlaps is bisected by breadth-first order from its first triangle -- the halves are connected
 * by construction, which a random split would not be -- and each half is re-checked. A chart that will not
 * come clean is reduced to single triangles, which cannot overlap themselves; that is a worse atlas and it is
 * a correct one, and the count of splits is returned so the cost is visible rather than absorbed.
 */
export function splitOverlapping(P, tris, chartList, { maxDepth = 8 } = {}) {
    const out = [];
    const stats = { split: 0, singles: 0 };
    const clean = (members, depth) => {
        if (members.length < 2) { out.push(members); return; }
        const T = members.map((i) => tris[i]);
        const uv = lscm(P, T);
        if (uv && selfOverlaps(T, uv).pairs === 0) { out.push(members); return; }
        if (depth >= maxDepth) { stats.singles += members.length; for (const m of members) out.push([m]); return; }
        stats.split++;
        // BFS from the first triangle so both halves stay connected
        const set = new Set(members), order = [], seen = new Set([members[0]]);
        const q = [members[0]];
        const eT = new Map();
        for (const t of members) for (const [a, b] of [[tris[t][0], tris[t][1]], [tris[t][1], tris[t][2]], [tris[t][2], tris[t][0]]]) {
            const k = a < b ? a + "_" + b : b + "_" + a; if (!eT.has(k)) eT.set(k, []); eT.get(k).push(t);
        }
        while (q.length) {
            const t = q.shift(); order.push(t);
            for (const [a, b] of [[tris[t][0], tris[t][1]], [tris[t][1], tris[t][2]], [tris[t][2], tris[t][0]]]) {
                const k = a < b ? a + "_" + b : b + "_" + a;
                for (const u of eT.get(k)) if (set.has(u) && !seen.has(u)) { seen.add(u); q.push(u); }
            }
        }
        for (const m of members) if (!seen.has(m)) order.push(m);
        const half = Math.max(1, Math.floor(order.length / 2));
        clean(order.slice(0, half), depth + 1);
        clean(order.slice(half), depth + 1);
    };
    for (const m of chartList) clean(m, 0);
    return { charts: out, stats };
}

/**
 * *** MERGE CHARTS UNTIL THE MEASUREMENT SAYS STOP, RATHER THAN UNTIL AN ANGLE SAYS STOP. ***
 *
 * charts() grows regions on a fixed normal-deviation limit, and a fixed angle is a PROXY for distortion: it
 * refuses merges that would have been fine and permits ones that are not. On RobotExpressive it produced 735
 * charts for 3,234 triangles -- 4.4 triangles each, with 42.2% of the mesh's shared edges cut. Every one of
 * those cuts is a seam a texture artist has to hide.
 *
 * This merges adjacent charts and asks the ACTUAL QUESTION of each candidate: flatten the union and look at
 * it. A merge is accepted only if the union is still a disk, LSCM converges on it, its conformal distortion
 * stays under the bound, NO triangle flips, and -- the check that only exists as of this round -- the chart
 * does not overlap itself. That last one is why merging could not honestly be done before: an aggressive merge
 * curls a chart until its far end lands on its near end, with every triangle still correctly oriented and
 * every per-triangle metric still perfect.
 *
 * Pairs are tried longest-shared-boundary first, because that is the merge that removes the most seam per
 * accepted solve. A rejected pair is never retried against the same partner, but both sides stay live for
 * other partners -- so one bad neighbour does not freeze a chart.
 */
export function mergeCharts(P, tris, chartList, { maxConformal = 2.0, maxRounds = 12 } = {}) {
    let cur = chartList.map((m) => m.slice());
    const stats = { tried: 0, accepted: 0, rejectedDisk: 0, rejectedDistortion: 0, rejectedOverlap: 0, rounds: 0 };
    const key = (a, b) => (a < b ? a + "_" + b : b + "_" + a);
    for (let round = 0; round < maxRounds; round++) {
        stats.rounds++;
        const owner = new Map();
        cur.forEach((m, ci) => m.forEach((t) => owner.set(t, ci)));
        // shared boundary length between chart pairs, in 3D
        const shared = new Map();
        const eTris = new Map();
        for (const t of owner.keys()) for (const [a, b] of [[tris[t][0], tris[t][1]], [tris[t][1], tris[t][2]], [tris[t][2], tris[t][0]]]) {
            const k = key(a, b); if (!eTris.has(k)) eTris.set(k, []); eTris.get(k).push(t);
        }
        for (const [ek, ts] of eTris) {
            if (ts.length !== 2) continue;
            const ca = owner.get(ts[0]), cb = owner.get(ts[1]);
            if (ca === cb) continue;
            const [a, b] = ek.split("_").map(Number);
            const L = len(sub(P, a, b));
            const pk = key(ca, cb);
            shared.set(pk, (shared.get(pk) || 0) + L);
        }
        const order = [...shared.entries()].sort((x, y) => y[1] - x[1]);
        const dead = new Set();
        let acceptedThisRound = 0;
        for (const [pk] of order) {
            const [ca, cb] = pk.split("_").map(Number);
            if (dead.has(ca) || dead.has(cb)) continue;
            stats.tried++;
            const union = cur[ca].concat(cur[cb]);
            const T = union.map((i) => tris[i]);
            // Euler: the union must still be a disk
            const V = new Set(), E = new Set();
            for (const t of T) { for (const v of t) V.add(v);
                for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) E.add(key(a, b)); }
            if (V.size - E.size + T.length !== 1) { stats.rejectedDisk++; continue; }
            const uv = lscm(P, T);
            if (!uv) { stats.rejectedDistortion++; continue; }
            const d = distortion(P, T, uv);
            if (d.flipped > 0 || d.conformal.max > maxConformal) { stats.rejectedDistortion++; continue; }
            if (selfOverlaps(T, uv).pairs > 0) { stats.rejectedOverlap++; continue; }
            cur[ca] = union; cur[cb] = [];
            dead.add(ca); dead.add(cb);          // both settle for this round; they merge again in the next
            stats.accepted++; acceptedThisRound++;
        }
        cur = cur.filter((m) => m.length);
        if (!acceptedThisRound) break;
    }
    return { charts: cur, stats };
}

/**
 * *** DOES THIS CHART OVERLAP ITSELF? -- the question the flip count cannot answer. ***
 *
 * distortion() reports `flipped`, the number of triangles whose Jacobian determinant went negative. That is a
 * LOCAL test and self-overlap is a GLOBAL property: a chart can wrap around and land on top of itself with
 * every triangle correctly oriented, and every per-triangle metric will call it perfect. v4537 said exactly
 * that in its own "not claimed" and left it open. This closes it.
 *
 * Two UV triangles overlap if an edge of one crosses an edge of the other, OR if one contains a vertex of the
 * other -- the second case is what catches containment, which no edge crossing shows. Triangles sharing a mesh
 * vertex are skipped: they are adjacent in the chart and touch by construction.
 *
 * A uniform grid over the chart's UV bounds keeps this near-linear instead of quadratic; the cell is the mean
 * triangle extent, so similar triangles give a few candidates per cell and one giant triangle degrades to the
 * honest quadratic rather than to missed pairs.
 */
export function selfOverlaps(chartTris, uv, { maxPairs = 4e6 } = {}) {
    const n = chartTris.length;
    if (n < 2) return { pairs: 0, checked: 0, truncated: false };
    const box = chartTris.map((T) => {
        const a = uv.get(T[0]), b = uv.get(T[1]), c = uv.get(T[2]);
        if (!a || !b || !c) return null;
        return { lo: [Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1])],
                 hi: [Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1])], a, b, c };
    });
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], ext = 0, live = 0;
    for (const B of box) { if (!B) continue; live++;
        lo[0] = Math.min(lo[0], B.lo[0]); lo[1] = Math.min(lo[1], B.lo[1]);
        hi[0] = Math.max(hi[0], B.hi[0]); hi[1] = Math.max(hi[1], B.hi[1]); 
        ext += Math.max(B.hi[0] - B.lo[0], B.hi[1] - B.lo[1]); }
    if (live < 2) return { pairs: 0, checked: 0, truncated: false };
    const cell = Math.max((ext / live) || 0, 1e-12);
    const nx = Math.max(1, Math.min(512, Math.ceil((hi[0] - lo[0]) / cell)));
    const ny = Math.max(1, Math.min(512, Math.ceil((hi[1] - lo[1]) / cell)));
    const grid = new Map();
    const cx = (x) => Math.max(0, Math.min(nx - 1, Math.floor((x - lo[0]) / ((hi[0] - lo[0]) || 1) * nx)));
    const cy = (y) => Math.max(0, Math.min(ny - 1, Math.floor((y - lo[1]) / ((hi[1] - lo[1]) || 1) * ny)));
    for (let i = 0; i < n; i++) { const B = box[i]; if (!B) continue;
        for (let gx = cx(B.lo[0]); gx <= cx(B.hi[0]); gx++) for (let gy = cy(B.lo[1]); gy <= cy(B.hi[1]); gy++) {
            const k = gx * ny + gy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
        } }
    const seen = new Set();
    let pairs = 0, checked = 0, truncated = false;
    const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
    const segCross = (p1, p2, p3, p4) => {
        const d1 = cr(p3, p4, p1), d2 = cr(p3, p4, p2), d3 = cr(p1, p2, p3), d4 = cr(p1, p2, p4);
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    };
    const inside = (p, A) => {
        const s = cr(A.a, A.b, p), t = cr(A.b, A.c, p), u = cr(A.c, A.a, p);
        return (s > 0 && t > 0 && u > 0) || (s < 0 && t < 0 && u < 0);
    };
    outer:
    for (const bucket of grid.values()) {
        for (let x = 0; x < bucket.length; x++) for (let y = x + 1; y < bucket.length; y++) {
            const i = bucket[x], j = bucket[y], key = i * n + j;
            if (seen.has(key)) continue;
            seen.add(key);
            if (++checked > maxPairs) { truncated = true; break outer; }
            const Ti = chartTris[i], Tj = chartTris[j];
            // *** SHARING AN EDGE IS NOT THE SAME AS TOUCHING BY CONSTRUCTION. *** The first version skipped
            // every pair with a vertex in common, which is right for a proper fan and WRONG for a fold: two
            // triangles hinged on a shared edge can lie on the SAME side of it, one on top of the other, and
            // that is exactly what a duplicated or folded-back face looks like. So an edge-sharing pair is
            // tested for which side its free vertices fall on, and a vertex-sharing pair goes through the
            // ordinary crossing test -- the strict inequalities there already ignore a shared corner.
            const shared = Ti.filter((v) => Tj.includes(v));
            if (shared.length >= 3) { pairs++; continue; }              // the same face twice
            if (shared.length === 2) {
                const p = uv.get(shared[0]), q = uv.get(shared[1]);
                const fi = Ti.find((v) => !shared.includes(v)), fj = Tj.find((v) => !shared.includes(v));
                const a2 = uv.get(fi), b2 = uv.get(fj);
                if (!p || !q || !a2 || !b2) continue;
                const s1 = cr(p, q, a2), s2 = cr(p, q, b2);
                if (s1 * s2 > 0) pairs++;                               // same side of the hinge: a fold
                continue;
            }
            const A = box[i], B = box[j];
            if (!A || !B) continue;
            if (A.hi[0] < B.lo[0] || B.hi[0] < A.lo[0] || A.hi[1] < B.lo[1] || B.hi[1] < A.lo[1]) continue;
            const ea = [[A.a, A.b], [A.b, A.c], [A.c, A.a]], eb = [[B.a, B.b], [B.b, B.c], [B.c, B.a]];
            let hit = false;
            for (const [p1, p2] of ea) { for (const [p3, p4] of eb) if (segCross(p1, p2, p3, p4)) { hit = true; break; } if (hit) break; }
            if (!hit) hit = inside(A.a, B) || inside(B.a, A);
            if (hit) pairs++;
        }
    }
    return { pairs, checked, truncated };
}

/**
 * Weld, segment, flatten each chart, pack them into [0,1]. The whole pipeline, on one mesh.
 *
 * *** PADDING IS IN TEXELS, AND THE FIRST VERSION'S ABSOLUTE 0.02 COST 96% OF THE TEXTURE. *** Charts come out
 * of LSCM in world units, so their UV extents depend on how big the mesh is; RobotExpressive is 0.066 units
 * across and its median chart spans 1.2e-2, SO A PADDING OF 0.02 WAS 1.6 TIMES THE ENTIRE MEDIAN CHART. Every
 * chart was placed in a box mostly made of gap. Measured, triangle coverage of the texture against padding:
 *
 *     0.02 -> 1.2%     0.005 -> 9.1%     0.001 -> 25.9%     0.0002 -> 29.4%     0 -> 31.2%
 *
 * It is the same defect weld() avoids two functions up by scaling its tolerance to the bounding diagonal: a
 * constant with a unit, in a space whose scale is the caller's. And the honest unit here is neither world
 * units nor a fraction -- padding exists to stop one chart's texels bleeding into another's when the atlas is
 * sampled, so it is a TEXEL COUNT at a stated texture size. Two texels at 1024 is 0.00195 of the atlas,
 * whatever the mesh measures. The span is solved for in two passes because it depends on the padding that
 * depends on it.
 */
export function unwrapCurved(positions, indices,
        { maxNormalDeg = 40, paddingTexels = 2, textureSize = 1024, relTol = 1e-6,
          merge = true, maxConformal = 2.0, orient = true, nest = true, nestCells = 384 } = {}) {
    const w = weld(positions, indices, { relTol });
    let cs = charts(w.positions, w.tris, { maxNormalDeg });
    const grown = cs.length;
    let mergeStats = null, splitStats = null;
    if (merge) {
        const m = mergeCharts(w.positions, w.tris, cs, { maxConformal });
        const sp = splitOverlapping(w.positions, w.tris, m.charts);
        cs = sp.charts; mergeStats = m.stats; splitStats = sp.stats;
    }
    const laid = [];
    let worstResidual = 0, nestFellBack = 0;
    for (const members of cs) {
        const T = members.map((i) => w.tris[i]);
        let uv = lscm(w.positions, T);
        if (!uv) continue;
        worstResidual = Math.max(worstResidual, uv.residual || 0);
        if (orient) uv = orientChart(uv).uv;
        let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
        for (const [u, v] of uv.values()) {
            if (u < lo[0]) lo[0] = u; if (u > hi[0]) hi[0] = u;
            if (v < lo[1]) lo[1] = v; if (v > hi[1]) hi[1] = v;
        }
        laid.push({ tris: T, uv, w: hi[0] - lo[0], h: hi[1] - lo[1], lo });
    }
    if (nest) {
        // occupancy of a chart at a normalised (u,v) inside its own box: is any triangle over that point?
        const shapes = laid.map((c) => {
            const tri = c.tris.map((T) => [c.uv.get(T[0]), c.uv.get(T[1]), c.uv.get(T[2])])
                              .filter((t) => t[0] && t[1] && t[2]);
            const W2 = c.w || 1e-12, H2 = c.h || 1e-12;
            return { w: W2, h: H2, cells: (mw, mh) => conservativeMask(tri, c.lo, W2, H2, mw, mh) };
        });
        const first = rasterPack(shapes, { cells: nestCells, padCells: 0 });
        const span0 = Math.max(first.width, first.height) || 1;
        const pad0 = Math.max(1, Math.round(paddingTexels / Math.max(1, textureSize) * nestCells * (span0 / first.width)));
        // *** THE PACKER CHECKS ITS OWN INVARIANT RATHER THAN RESTING ON MY ARITHMETIC BEING COMPLETE. ***
        // Charts that interlock MUST NOT have triangles landing on each other -- two charts' texels in one
        // texel is a corrupt atlas, and it is invisible in every coverage number. Conservative rasterisation
        // took it from 78 pairs to 3 and matching the mask grid to the atlas grid cleared 192-cell packs
        // entirely, but 3 survived at 256 and 384, and a fourth geometric argument is not worth more than a
        // measurement. So the pack is VERIFIED, the pad widened if it fails, and the shelf packer -- which is
        // disjoint by construction -- is the fallback. An atlas that might be corrupt is worth less than a
        // sparser one that is not.
        const buildUVs = (packed) => {
            const sp = Math.max(packed.width, packed.height) || 1, sc = 1 / sp;
            return laid.map((c, i) => {
                const q = packed.placements[i], m = new Map();
                for (const [v, [u, vv]] of c.uv) m.set(v, [(q.x + u - c.lo[0]) * sc, (q.y + vv - c.lo[1]) * sc]);
                return m;
            });
        };
        const crossOverlaps = (uvs) => {
            const all = new Map(), tt = [];
            let k = 0;
            for (let i = 0; i < laid.length; i++) {
                const rm = new Map();
                for (const [v, pt] of uvs[i]) { const id = k++; rm.set(v, id); all.set(id, pt); }
                for (const T of laid[i].tris) tt.push(T.map((v) => rm.get(v)));
            }
            return selfOverlaps(tt, all, { maxPairs: 2e7 }).pairs;
        };
        let nested = null, uvs2 = null, padUsed = pad0, verified = 0;
        for (let attempt = 0; attempt < 3; attempt++) {
            padUsed = pad0 + attempt;
            nested = rasterPack(shapes, { cells: nestCells, padCells: padUsed });
            uvs2 = buildUVs(nested);
            verified = crossOverlaps(uvs2);
            if (verified === 0) break;
        }
        if (verified === 0) {
            const span2 = Math.max(nested.width, nested.height) || 1;
            return { weld: w, charts: laid.map((c, i) => ({ tris: c.tris, uv: uvs2[i] })),
                     atlas: { w: nested.width, h: nested.height, span: span2 }, chartCount: laid.length,
                     worstResidual, grown, mergeStats, splitStats, packer: "nest", padCells: padUsed };
        }
        // fall through to the shelf packer, and SAY SO in the result rather than silently degrading
        nestFellBack = verified;
    }
    // pass 1: pack with no padding to learn the atlas span, which is what a texel is a fraction OF
    const packOnce = (pad) => {
        const w = Math.max(...laid.map((c) => c.w + pad),
                           Math.sqrt(laid.reduce((s, c) => s + (c.w + pad) * (c.h + pad), 0)));
        const p = shelfPack(laid.map((c) => ({ w: c.w, h: c.h })), { width: w, padding: pad });
        return { p, span: Math.max(...laid.map((c, i) => p.placements[i].x + c.w), p.height) || 1 };
    };
    const first = packOnce(0);
    const padding = (paddingTexels / Math.max(1, textureSize)) * first.span;
    const { p: packed, span } = packOnce(padding);
    const out = [];
    for (let i = 0; i < laid.length; i++) {
        const c = laid[i], p = packed.placements[i], m = new Map();
        for (const [v, [u, vv]] of c.uv) m.set(v, [(p.x + u - c.lo[0]) / span, (p.y + vv - c.lo[1]) / span]);
        out.push({ tris: c.tris, uv: m });
    }
    return { weld: w, charts: out, atlas: { span }, chartCount: out.length, worstResidual,
             grown, mergeStats, splitStats, packer: nestFellBack ? "shelf (nest fell back)" : "shelf",
             nestFellBack };
}

export function reportLines(mesh = null) {
    const out = ["[uvLscm] curved unwrap: weld, segment, conformal-flatten, pack"];
    if (!mesh) { out.push("  (no mesh given -- pass { positions, indices })"); return out; }
    const r = unwrapCurved(mesh.positions, mesh.indices);
    out.push(`  weld            ${r.weld.vertsBefore} -> ${r.weld.vertsAfter} vertices (${(100 * (1 - r.weld.vertsAfter / r.weld.vertsBefore)).toFixed(1)}% duplicates)`);
    out.push(`  charts          ${r.grown} grown -> ${r.chartCount} after merging on measured distortion`);
    let worstC = 0, flips = 0, tris = 0;
    for (const c of r.charts) { const d = distortion(r.weld.positions, c.tris, c.uv);
        worstC = Math.max(worstC, d.conformal.max); flips += d.flipped; tris += c.tris.length; }
    out.push(`  triangles       ${tris}`);
    out.push(`  conformal worst ${worstC.toFixed(4)}  (1 = angles preserved exactly)`);
    out.push(`  flipped         ${flips}`);
    out.push(`  solver residual ${r.worstResidual.toExponential(2)}  (relative, worst chart)`);
    let ov = 0, tri = 0;
    for (const c of r.charts) {
        ov += selfOverlaps(c.tris, c.uv).pairs;
        for (const T of c.tris) {
            const a = c.uv.get(T[0]), b = c.uv.get(T[1]), d = c.uv.get(T[2]);
            tri += Math.abs((b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])) / 2;
        }
    }
    out.push(`  self-overlaps   ${ov}   (the fold a per-triangle flip count cannot see)`);
    out.push(`  atlas coverage  ${(100 * tri).toFixed(1)}%  of the texture holds surface`);
    return out;
}
