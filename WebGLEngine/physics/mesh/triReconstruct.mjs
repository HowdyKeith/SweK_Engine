// physics/mesh/triReconstruct.mjs
//
// LINEAR RECONSTRUCTION ON TRIANGLES -- the case v3635 and v3636 both named as still open, twice, in as many
// words: "on TRIANGLES the vertex offsets are not 1/2 and the argument does not run".
//
// v3635 proved per-axis minmod monotone on a Cartesian cell because A CORNER TAKES HALF OF EACH SLOPE, and the
// mean of two numbers never exceeds their max. v3636 showed that survives non-uniform spacing. Both arguments
// rest on ONE geometric fact: on a Cartesian cell the offset from the centre to the furthest evaluation point is
// EXACTLY HALF the spacing to the neighbour whose difference bounds the slope. THAT NUMBER IS A PROPERTY OF THE
// SQUARE, NOT OF THE LIMITER.
//
// *** SO THE THING TO MEASURE FIRST IS THE NUMBER ITSELF: for each cell, the distance from the centroid to its
// furthest VERTEX, divided by the distance from that centroid to the neighbouring centroid whose difference the
// gradient was built from. On a Cartesian cell that ratio is exactly 0.5. If it exceeds 1 on triangles then the
// escape the previous two rounds went looking for is not merely possible, it is FORCED for any gradient large
// enough to be useful -- and the reason is geometry rather than anything about the limiter. ***
//
// CONSERVATION ON A TRIANGLE IS ALSO A GEOMETRIC FACT, AND A DIFFERENT ONE FROM THE CARTESIAN CASE. There the
// subcell offsets were symmetric about the centre and the slope term cancelled. Here it is the CENTROID property:
// the integral of (x - x_centroid) over the triangle is exactly zero, so a linear reconstruction ABOUT THE
// CENTROID preserves the cell average for any gradient whatsoever. *** RECONSTRUCT ABOUT ANY OTHER "CENTRE" AND
// CONSERVATION IS GONE -- and "centre" is a word a triangle answers four ways (centroid, circumcentre, incentre,
// bounding-box middle). TWO THINGS WEARING ONE LABEL, in the geometry rather than in the code. ***
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/**
 * A structured triangulation of a rectangle: each cell of an nx-by-ny grid split into two triangles, with an
 * optional `skew` that shears the vertex lattice so the triangles are NOT all congruent. skew = 0 gives the
 * regular right-triangle mesh; skew > 0 gives a genuinely irregular one whose ratios vary cell to cell.
 */
export function makeTriMesh({ nx = 20, ny = 20, h = 1, skew = 0 } = {}) {
    const vx = [], vy = [];
    const vid = (i, j) => j * (nx + 1) + i;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        // a smooth, deterministic shear -- no randomness, so the mesh is the same on every machine
        const s = skew * h * Math.sin(2.1 * i / nx * Math.PI) * Math.cos(1.7 * j / ny * Math.PI);
        vx.push(i * h + s); vy.push(j * h + 0.6 * s);
    }
    const tri = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        tri.push([vid(i, j), vid(i + 1, j), vid(i + 1, j + 1)]);
        tri.push([vid(i, j), vid(i + 1, j + 1), vid(i, j + 1)]);
    }
    const n = tri.length;
    const cx = new Float64Array(n), cy = new Float64Array(n), area = new Float64Array(n);
    for (let t = 0; t < n; t++) {
        const [a, b, c] = tri[t];
        cx[t] = (vx[a] + vx[b] + vx[c]) / 3; cy[t] = (vy[a] + vy[b] + vy[c]) / 3;
        area[t] = 0.5 * Math.abs((vx[b] - vx[a]) * (vy[c] - vy[a]) - (vx[c] - vx[a]) * (vy[b] - vy[a]));
    }
    // edge neighbours: two triangles sharing two vertices
    const key = (p, q) => (p < q ? p + ":" + q : q + ":" + p);
    const edgeMap = new Map();
    for (let t = 0; t < n; t++) {
        const [a, b, c] = tri[t];
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
            const k = key(p, q);
            if (!edgeMap.has(k)) edgeMap.set(k, []);
            edgeMap.get(k).push(t);
        }
    }
    const nbr = tri.map(() => []);
    for (const list of edgeMap.values()) if (list.length === 2) { nbr[list[0]].push(list[1]); nbr[list[1]].push(list[0]); }
    return { vx, vy, tri, cx, cy, area, nbr, nx, ny, h, skew };
}

/** Exact cell averages of a quadratic (and second-order for anything smoother): the edge-midpoint rule. */
export function analyticCells(f, m) {
    const out = new Float64Array(m.tri.length);
    for (let t = 0; t < m.tri.length; t++) {
        const [a, b, c] = m.tri[t];
        const mx = [(m.vx[a] + m.vx[b]) / 2, (m.vx[b] + m.vx[c]) / 2, (m.vx[c] + m.vx[a]) / 2];
        const my = [(m.vy[a] + m.vy[b]) / 2, (m.vy[b] + m.vy[c]) / 2, (m.vy[c] + m.vy[a]) / 2];
        out[t] = (f(mx[0], my[0]) + f(mx[1], my[1]) + f(mx[2], my[2])) / 3;
    }
    return out;
}

/**
 * *** THE GEOMETRIC RATIO THE WHOLE ARGUMENT RESTED ON. For each cell: the distance from the centroid to its
 * furthest VERTEX (where a linear reconstruction attains its extremes over a triangle), divided by the distance
 * to the NEAREST neighbouring centroid (the shortest lever any difference-based gradient is built on). On a
 * Cartesian cell the same construction gives exactly 0.5. ***
 */
export function offsetRatios(m) {
    const out = new Float64Array(m.tri.length);
    let worst = 0, mean = 0, counted = 0;
    for (let t = 0; t < m.tri.length; t++) {
        if (m.nbr[t].length === 0) continue;
        let far = 0;
        for (const v of m.tri[t]) far = Math.max(far, Math.hypot(m.vx[v] - m.cx[t], m.vy[v] - m.cy[t]));
        let near = Infinity;
        for (const q of m.nbr[t]) near = Math.min(near, Math.hypot(m.cx[q] - m.cx[t], m.cy[q] - m.cy[t]));
        out[t] = far / near;
        worst = Math.max(worst, out[t]); mean += out[t]; counted++;
    }
    return { per: out, worst, mean: mean / Math.max(counted, 1), cartesian: 0.5 };
}

/**
 * Least-squares gradient over the edge neighbours -- the standard unstructured choice.
 *
 * *** IT ALSO RETURNS A RANK, AND THAT IS THE POINT OF v3640. A gradient in 2D has TWO unknowns and each
 * neighbour supplies ONE equation, so a cell with a single neighbour cannot determine it -- not inaccurately,
 * NOT AT ALL. The first version of this function detected the singular system and quietly wrote zero, which is a
 * REFUSAL WEARING THE COSTUME OF AN ANSWER and reads as a 100% error with no way for a caller to tell it apart
 * from a genuinely flat field. Unknown is not the default (v3103; v3628 found the same shape in
 * stabilityMeter.verdict). `rank` is now returned beside the numbers, and `along` carries the ONE component that
 * IS determined -- the projection onto the single available direction, which is exact even in the rank-1 case. ***
 */
export function gradientLS(u, m) {
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length);
    const rank = new Int8Array(u.length), along = new Float64Array(u.length);
    const dirx = new Float64Array(u.length), diry = new Float64Array(u.length);
    for (let t = 0; t < u.length; t++) {
        let sxx = 0, sxy = 0, syy = 0, sxu = 0, syu = 0;
        for (const q of m.nbr[t]) {
            const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t], du = u[q] - u[t];
            const w = 1 / (dx * dx + dy * dy);                  // inverse-distance weighting, the usual choice
            sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy;
            sxu += w * dx * du; syu += w * dy * du;
        }
        const det = sxx * syy - sxy * sxy, tr = sxx + syy;
        if (m.nbr[t].length === 0) { rank[t] = 0; continue; }
        // A scale-free singularity test: compare the determinant against the trace squared, so it means the same
        // thing for a fine mesh as for a coarse one. An absolute threshold would call every fine mesh singular.
        if (Math.abs(det) <= 1e-10 * Math.max(tr * tr, 1e-300)) {
            rank[t] = 1;
            // the one determined component: the directional derivative along the single available lever
            const q = m.nbr[t][0];
            const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t], L = Math.hypot(dx, dy);
            if (L > 0) { dirx[t] = dx / L; diry[t] = dy / L; along[t] = (u[q] - u[t]) / L; }
            continue;                                            // gx, gy stay zero AND rank says why
        }
        rank[t] = 2;
        gx[t] = (syy * sxu - sxy * syu) / det; gy[t] = (sxx * syu - sxy * sxu) / det;
        along[t] = Math.hypot(gx[t], gy[t]);
    }
    return { gx, gy, rank, along, dirx, diry };
}

/** Cells with at least one boundary FACE -- a different set again from boundaryTouching's boundary-NODE cells. */
export function boundaryCells(m) {
    const out = new Uint8Array(m.tri.length);
    for (let t = 0; t < m.tri.length; t++) if (m.nbr[t].length < 3) out[t] = 1;
    return out;
}

/**
 * THE RANK CENSUS: how many cells can determine a gradient at all, split by how many neighbours they have.
 * A count, not a verdict -- the numbers are a property of the triangulation and the gate reports them.
 */
export function rankCensus(u, m) {
    const g = gradientLS(u, m);
    const byNbr = new Map(), byRank = new Map();
    for (let t = 0; t < m.tri.length; t++) {
        const n = m.nbr[t].length;
        byNbr.set(n, (byNbr.get(n) || 0) + 1);
        byRank.set(g.rank[t], (byRank.get(g.rank[t]) || 0) + 1);
    }
    return { byNbr: Object.fromEntries([...byNbr].sort()), byRank: Object.fromEntries([...byRank].sort()), total: m.tri.length };
}

/**
 * *** GREEN-GAUSS, THE OTHER STANDARD GRADIENT, AND THE POINT IS THAT IT IS NOT THE SAME ONE.
 *     grad u = (1/A) SUM_faces  u_face * n_face * L_face
 * The whole question is what u_face is. The textbook default is the SIMPLE AVERAGE of the two adjacent cell
 * values -- which silently assumes THE FACE MIDPOINT LIES HALFWAY BETWEEN THE TWO CENTROIDS. On a uniform
 * Cartesian grid it does. On a triangle it does not, and on a skewed triangle it is not close.
 *
 * `weighting`:
 *   "simple"   u_face = (u_own + u_nbr)/2, the default everywhere
 *   "distance" u_face interpolated at the face midpoint's true position along the centroid-to-centroid line
 * A boundary face has no neighbour and takes the cell's own value, which is a first-order statement and is why
 * boundary cells are excluded from every measurement here BY NAME. ***
 */
export function gradientGG(u, m, { weighting = "simple" } = {}) {
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length);
    for (let t = 0; t < u.length; t++) {
        const [a, b, c] = m.tri[t];
        const edges = [[a, b], [b, c], [c, a]];
        let sx = 0, sy = 0;
        for (const [p, q] of edges) {
            // outward normal of the edge, length-weighted: rotate the edge vector and fix the sign against the centroid
            const ex = m.vx[q] - m.vx[p], ey = m.vy[q] - m.vy[p];
            let nx = ey, ny = -ex;                                  // |n| = edge length already
            const mx = 0.5 * (m.vx[p] + m.vx[q]), my = 0.5 * (m.vy[p] + m.vy[q]);
            if (nx * (mx - m.cx[t]) + ny * (my - m.cy[t]) < 0) { nx = -nx; ny = -ny; }
            // which neighbour shares this edge
            let nb = -1;
            for (const cand of m.nbr[t]) {
                const s2 = m.tri[cand];
                if (s2.includes(p) && s2.includes(q)) { nb = cand; break; }
            }
            let uf;
            if (nb < 0) uf = u[t];
            else if (weighting === "simple") uf = 0.5 * (u[t] + u[nb]);
            else {
                // where along the centroid-to-centroid line does the face midpoint actually project?
                const dx = m.cx[nb] - m.cx[t], dy = m.cy[nb] - m.cy[t];
                const d2 = dx * dx + dy * dy;
                const s = d2 > 0 ? ((mx - m.cx[t]) * dx + (my - m.cy[t]) * dy) / d2 : 0.5;
                uf = u[t] + s * (u[nb] - u[t]);
            }
            sx += uf * nx; sy += uf * ny;
        }
        // (1/A) * SUM u_f * n_f, where n_f already carries the edge LENGTH because it is the rotated edge vector.
        // MY FIRST VERSION DIVIDED BY 2A AND READ A RELATIVE ERROR OF EXACTLY 0.5000 ON EVERY MESH INCLUDING THE
        // REGULAR ONE -- a factor of two wearing the costume of a physics result. AN ERROR THAT IS EXACTLY ONE HALF
        // AT ZERO SKEW IS A NORMALISATION, NOT A FINDING: the skew-free mesh is the control, and a control that
        // fails means the instrument is wrong before the question is even asked.
        gx[t] = sx / m.area[t];
        gy[t] = sy / m.area[t];
    }
    return { gx, gy };
}

/**
 * *** THE THIRD DECLARATION. v3638 compared least-squares against CELL-BASED Green-Gauss and found the latter is
 * consistent but never exact on a skewed mesh. The standard answer in the literature is NODE-BASED Green-Gauss:
 * take the face value from its two ENDPOINT NODES instead of from the two adjacent cell centres, because the
 * nodes lie ON the face and the centroids do not.
 *
 * BUT A NODE OF A CELL-AVERAGE FIELD HAS NO VALUE UNTIL SOMEBODY INVENTS ONE, and that choice is a FOURTH
 * declaration nobody names. Two ways are standard:
 *   "idw"  inverse-distance weighting of the surrounding cell values. Cheap, ubiquitous, and NOT exact for a
 *          linear field unless the surrounding cells happen to be symmetric about the node.
 *   "ls"   fit a plane to the surrounding cell values by least squares and evaluate it AT the node. Exact for a
 *          linear field by construction.
 * SO "NODE-BASED GREEN-GAUSS IS LINEARITY-PRESERVING" IS A CLAIM ABOUT THE NODE INTERPOLATION AND NOT ABOUT
 * GREEN-GAUSS, and the gate measures both spellings rather than repeating the sentence. ***
 */
export function nodeValues(u, m, { mode = "ls" } = {}) {
    const nV = m.vx.length;
    const cells = Array.from({ length: nV }, () => []);
    for (let t = 0; t < m.tri.length; t++) for (const v of m.tri[t]) cells[v].push(t);
    const out = new Float64Array(nV);
    for (let v = 0; v < nV; v++) {
        const list = cells[v];
        if (list.length === 0) continue;
        if (mode === "idw") {
            let sw = 0, su = 0;
            for (const t of list) {
                const w = 1 / Math.max(Math.hypot(m.cx[t] - m.vx[v], m.cy[t] - m.vy[v]), 1e-300);
                sw += w; su += w * u[t];
            }
            out[v] = su / sw;
            continue;
        }
        // least-squares plane through the surrounding cell values, evaluated at the node itself
        let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, su = 0, sux = 0, suy = 0;
        for (const t of list) {
            const dx = m.cx[t] - m.vx[v], dy = m.cy[t] - m.vy[v], w = 1;
            sw += w; sx += w * dx; sy += w * dy;
            sxx += w * dx * dx; sxy += w * dx * dy; syy += w * dy * dy;
            su += w * u[t]; sux += w * u[t] * dx; suy += w * u[t] * dy;
        }
        // solve the 3x3 normal equations for (a, bx, by) with the node at the origin; a IS the node value
        const A = [[sw, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], rhs = [su, sux, suy];
        const sol = solve3(A, rhs);
        out[v] = sol ? sol[0] : su / sw;      // a degenerate stencil falls back to the mean, and says so by shape
    }
    return out;
}

function solve3(A, b) {
    const M = [[...A[0], b[0]], [...A[1], b[1]], [...A[2], b[2]]];
    for (let i = 0; i < 3; i++) {
        let p = i;
        for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
        if (Math.abs(M[p][i]) < 1e-13) return null;
        [M[i], M[p]] = [M[p], M[i]];
        for (let r = 0; r < 3; r++) {
            if (r === i) continue;
            const f = M[r][i] / M[i][i];
            for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
        }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/** NODE-BASED Green-Gauss: the face value is the mean of its two endpoint node values. */
export function gradientGGNode(u, m, { nodeMode = "ls" } = {}) {
    const nv = nodeValues(u, m, { mode: nodeMode });
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length);
    for (let t = 0; t < u.length; t++) {
        const [a, b, c] = m.tri[t];
        let sx = 0, sy = 0;
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
            const ex = m.vx[q] - m.vx[p], ey = m.vy[q] - m.vy[p];
            let nx = ey, ny = -ex;
            const mx = 0.5 * (m.vx[p] + m.vx[q]), my = 0.5 * (m.vy[p] + m.vy[q]);
            if (nx * (mx - m.cx[t]) + ny * (my - m.cy[t]) < 0) { nx = -nx; ny = -ny; }
            const uf = 0.5 * (nv[p] + nv[q]);
            sx += uf * nx; sy += uf * ny;
        }
        gx[t] = sx / m.area[t];
        gy[t] = sy / m.area[t];
    }
    return { gx, gy };
}

/** Barth-Jespersen: ONE scale per cell so no VERTEX value leaves the neighbourhood range. */
export function limitBJ(u, m, g) {
    const gx = Float64Array.from(g.gx), gy = Float64Array.from(g.gy), alpha = new Float64Array(u.length);
    for (let t = 0; t < u.length; t++) {
        let lo = u[t], hi = u[t];
        for (const q of m.nbr[t]) { lo = Math.min(lo, u[q]); hi = Math.max(hi, u[q]); }
        let a = 1;
        for (const v of m.tri[t]) {
            const d = gx[t] * (m.vx[v] - m.cx[t]) + gy[t] * (m.vy[v] - m.cy[t]);
            if (d > 0 && u[t] + d > hi) a = Math.min(a, (hi - u[t]) / d);
            else if (d < 0 && u[t] + d < lo) a = Math.min(a, (lo - u[t]) / d);
        }
        alpha[t] = a; gx[t] *= a; gy[t] *= a;
    }
    return { gx, gy, alpha };
}

/** Values outside the cell's own neighbourhood range, evaluated at the VERTICES where a plane attains its bounds. */
export function vertexEscapes(u, m, g) {
    let count = 0, worst = 0, span = 0;
    for (let t = 0; t < u.length; t++) {
        if (m.nbr[t].length === 0) continue;
        let lo = u[t], hi = u[t];
        for (const q of m.nbr[t]) { lo = Math.min(lo, u[q]); hi = Math.max(hi, u[q]); }
        span = Math.max(span, hi - lo);
        for (const v of m.tri[t]) {
            const val = u[t] + g.gx[t] * (m.vx[v] - m.cx[t]) + g.gy[t] * (m.vy[v] - m.cy[t]);
            if (val > hi) { count++; worst = Math.max(worst, val - hi); }
            else if (val < lo) { count++; worst = Math.max(worst, lo - val); }
        }
    }
    return { count, worst, span, relative: worst / Math.max(span, 1e-300) };
}

/**
 * Conservation: the integral of the reconstruction over each cell must equal u[t] * area[t]. Sampled by the same
 * edge-midpoint rule, which is EXACT for a linear function. `about` picks the expansion point, and that is the
 * point of the test: "centroid" conserves, anything else does not.
 */
export function conservationDrift(u, m, g, about = "centroid") {
    let worst = 0;
    for (let t = 0; t < u.length; t++) {
        let px = m.cx[t], py = m.cy[t];
        if (about === "bbox") {
            let xlo = Infinity, xhi = -Infinity, ylo = Infinity, yhi = -Infinity;
            for (const v of m.tri[t]) { xlo = Math.min(xlo, m.vx[v]); xhi = Math.max(xhi, m.vx[v]); ylo = Math.min(ylo, m.vy[v]); yhi = Math.max(yhi, m.vy[v]); }
            px = 0.5 * (xlo + xhi); py = 0.5 * (ylo + yhi);
        } else if (about === "vertex") { px = m.vx[m.tri[t][0]]; py = m.vy[m.tri[t][0]]; }
        let s = 0;
        const [a, b, c] = m.tri[t];
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
            const mx = 0.5 * (m.vx[p] + m.vx[q]), my = 0.5 * (m.vy[p] + m.vy[q]);
            s += u[t] + g.gx[t] * (mx - px) + g.gy[t] * (my - py);
        }
        worst = Math.max(worst, Math.abs(s / 3 - u[t]));
    }
    return worst;
}

/**
 * *** THE EXACT KEY, AND IT NEEDS NO TOLERANCE: ANY GRADIENT WORTH THE NAME REPRODUCES A LINEAR FIELD EXACTLY.
 * Feed u = a + b*x + c*y and the answer is (b, c), on every mesh, at every skew, with nothing to converge. A
 * scheme that misses here is not inaccurate, it is INCONSISTENT -- it cannot represent the one field every
 * finite-volume method is built to get right. ***
 */
export function linearityError(m, { a = 0.3, b = 0.7, c = -0.4, grad, strictInterior = true } = {}) {
    const u = analyticCells((x, y) => a + b * x + c * y, m);
    const g = grad(u, m);
    const skip = strictInterior ? boundaryTouching(m) : null;
    let worst = 0, counted = 0;
    for (let t = 0; t < u.length; t++) {
        if (m.nbr[t].length < 3) continue;                 // a cell with a boundary FACE has no neighbour there
        if (skip && skip[t]) continue;                     // ...and a cell can have three faces and still touch a
        counted++;                                          //    boundary NODE, which is a different exclusion
        worst = Math.max(worst, Math.hypot(g.gx[t] - b, g.gy[t] - c));
    }
    return counted ? worst / Math.hypot(b, c) : NaN;
}

/**
 * *** CELLS TOUCHING A BOUNDARY NODE, WHICH IS NOT THE SAME SET AS CELLS WITH A BOUNDARY FACE, AND CONFLATING
 * THEM COST ME A ROUND'S HEADLINE. My first interior filter used the neighbour COUNT -- three faces, three
 * neighbours, "interior" -- and a node-based scheme reads its values from the NODES, so a cell with three
 * interior faces can still be fed a value invented at a boundary vertex with a one-sided stencil. The cell-based
 * schemes never notice, because they never look at a node. THE RIGHT INTERIOR DEPENDS ON WHAT THE SCHEME READS,
 * NOT ON WHAT THE CELL HAS. ***
 */
export function boundaryTouching(m) {
    const nV = m.vx.length;
    const deg = new Int32Array(nV), faceCount = new Map();
    const key = (p, q) => (p < q ? p + ":" + q : q + ":" + p);
    for (const [a, b, c] of m.tri) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const k = key(p, q); faceCount.set(k, (faceCount.get(k) || 0) + 1);
    }
    const onBoundary = new Uint8Array(nV);
    for (const [k, n] of faceCount) if (n === 1) { const [p, q] = k.split(":").map(Number); onBoundary[p] = 1; onBoundary[q] = 1; }
    const out = new Uint8Array(m.tri.length);
    for (let t = 0; t < m.tri.length; t++) if (m.tri[t].some((v) => onBoundary[v])) out[t] = 1;
    void deg;
    return out;
}

/** Worst relative error of the reconstruction at the vertices, against an analytic field. */
export function accuracy(f, m, u, g) {
    let worst = 0, peak = 0;
    for (let t = 0; t < u.length; t++) {
        if (m.nbr[t].length < 3) continue;                     // interior cells only; boundary is its own problem
        for (const v of m.tri[t]) {
            const truth = f(m.vx[v], m.vy[v]);
            peak = Math.max(peak, Math.abs(truth));
            worst = Math.max(worst, Math.abs(u[t] + g.gx[t] * (m.vx[v] - m.cx[t]) + g.gy[t] * (m.vy[v] - m.cy[t]) - truth));
        }
    }
    return worst / Math.max(peak, 1e-300);
}
