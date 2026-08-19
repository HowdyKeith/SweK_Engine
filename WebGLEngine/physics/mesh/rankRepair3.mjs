// physics/mesh/rankRepair3.mjs
//
// THE SAME THREE REPAIRS IN THREE DIMENSIONS. v3642 said the VERDICTS should carry, because the key is
// dimension-free, but THE TRADE SHOULD NOT -- 6n deficient cells against a widened stencil on every cell is a
// different sum from two cells against the same widening. That is the thing this round is for: a verdict that
// transfers and an arithmetic that does not.
//
// The three, unchanged in kind:
//   VERTEX STENCIL   tets sharing a VERTEX rather than a FACE. Pure geometry, no boundary data.
//   DIRICHLET        the boundary supplies the field value on the face. One extra equation.
//   NEUMANN          the boundary supplies the normal derivative, usually asserted as zero.
//
// *** AND THE 3D VERTEX NEIGHBOURHOOD IS NOT THE 2D ONE WITH A DIMENSION ADDED. In 2D a triangle has three
// vertices and each is shared by a handful of triangles. In 3D a tet has FOUR vertices and each is shared by
// many more tets, so the widening multiplies by a much larger factor -- and it multiplies on EVERY cell, not
// only the deficient ones. The number is measured rather than reasoned about, because this arc has been wrong
// four times guessing how a 2D result carries. ***
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/** Tets sharing at least one VERTEX. */
export function vertexNeighbours3(m) {
    const byVert = new Map();
    for (let t = 0; t < m.tet.length; t++) for (const v of m.tet[t]) {
        if (!byVert.has(v)) byVert.set(v, []);
        byVert.get(v).push(t);
    }
    return m.tet.map((verts, t) => {
        const s = new Set();
        for (const v of verts) for (const q of byVert.get(v)) if (q !== t) s.add(q);
        return [...s];
    });
}

/** Boundary faces (belonging to exactly one tet), with outward unit normals and centroids. */
export function boundaryFaces3(m) {
    const key = (a, b, c) => [a, b, c].sort((p, q) => p - q).join(":");
    const count = new Map();
    for (const [a, b, c, d] of m.tet) for (const f of [[a, b, c], [a, b, d], [a, c, d], [b, c, d]]) {
        const k = key(...f); count.set(k, (count.get(k) || 0) + 1);
    }
    return m.tet.map((tet, t) => {
        const [a, b, c, d] = tet, out = [];
        for (const f of [[a, b, c], [a, b, d], [a, c, d], [b, c, d]]) {
            if (count.get(key(...f)) !== 1) continue;
            const [p, q, r] = f;
            const mx = (m.vx[p] + m.vx[q] + m.vx[r]) / 3, my = (m.vy[p] + m.vy[q] + m.vy[r]) / 3, mz = (m.vz[p] + m.vz[q] + m.vz[r]) / 3;
            const ux = m.vx[q] - m.vx[p], uy = m.vy[q] - m.vy[p], uz = m.vz[q] - m.vz[p];
            const wx = m.vx[r] - m.vx[p], wy = m.vy[r] - m.vy[p], wz = m.vz[r] - m.vz[p];
            let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
            const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
            if (nx * (mx - m.cx[t]) + ny * (my - m.cy[t]) + nz * (mz - m.cz[t]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
            out.push({ mx, my, mz, nx, ny, nz });
        }
        return out;
    });
}

function solve3(A, b) {
    const M = [[...A[0], b[0]], [...A[1], b[1]], [...A[2], b[2]]];
    for (let i = 0; i < 3; i++) {
        let p = i;
        for (let q = i + 1; q < 3; q++) if (Math.abs(M[q][i]) > Math.abs(M[p][i])) p = q;
        if (Math.abs(M[p][i]) < 1e-300) return null;
        [M[i], M[p]] = [M[p], M[i]];
        for (let q = 0; q < 3; q++) {
            if (q === i) continue;
            const f = M[q][i] / M[i][i];
            for (let c = i; c < 4; c++) M[q][c] -= f * M[i][c];
        }
    }
    return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

function solveRows3(rows) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
    for (const [d0, d1, d2, du, w] of rows) {
        const d = [d0, d1, d2];
        for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) A[a][b] += w * d[a] * d[b]; r[a] += w * d[a] * du; }
    }
    const tr = A[0][0] + A[1][1] + A[2][2];
    const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
        - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
        + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
    if (!(Math.abs(det) > 1e-10 * Math.max(tr * tr * tr, 1e-300))) return { gx: 0, gy: 0, gz: 0, rank: Math.min(rows.length, 2) };
    const s = solve3(A, r);
    return s ? { gx: s[0], gy: s[1], gz: s[2], rank: 3 } : { gx: 0, gy: 0, gz: 0, rank: 2 };
}

export function gradientRepaired3(u, m, {
    mode = "none", field = null, normalDeriv = 0, vnbr = null, bfaces = null,
    onlyWhereDeficient = null, trueGrad = null,
} = {}) {
    const VN = mode === "vertex" ? (vnbr || vertexNeighbours3(m)) : null;
    const BF = (mode === "dirichlet" || mode === "neumann") ? (bfaces || boundaryFaces3(m)) : null;
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length), gz = new Float64Array(u.length);
    const rank = new Int8Array(u.length), stencil = new Int32Array(u.length);
    for (let t = 0; t < u.length; t++) {
        const rows = [];
        for (const q of (mode === "vertex" ? VN[t] : m.nbr[t])) {
            const dx = m.cx[q] - m.cx[t], dy = m.cy[q] - m.cy[t], dz = m.cz[q] - m.cz[t];
            rows.push([dx, dy, dz, u[q] - u[t], 1 / (dx * dx + dy * dy + dz * dz)]);
        }
        if (BF && (!onlyWhereDeficient || onlyWhereDeficient[t])) for (const f of BF[t]) {
            if (mode === "dirichlet") {
                if (!field) continue;
                const dx = f.mx - m.cx[t], dy = f.my - m.cy[t], dz = f.mz - m.cz[t];
                rows.push([dx, dy, dz, field(f.mx, f.my, f.mz) - u[t], 1 / (dx * dx + dy * dy + dz * dz)]);
            } else {
                const nd = trueGrad ? (trueGrad[0] * f.nx + trueGrad[1] * f.ny + trueGrad[2] * f.nz) : normalDeriv;
                rows.push([f.nx, f.ny, f.nz, nd, 1]);
            }
        }
        stencil[t] = rows.length;
        const s = solveRows3(rows);
        gx[t] = s.gx; gy[t] = s.gy; gz[t] = s.gz; rank[t] = s.rank;
    }
    return { gx, gy, gz, rank, stencil };
}

/** Worst relative error against a KNOWN linear gradient, split by whether the cell was deficient to begin with. */
export function repairError3(m, deficientMask, opts, { a = 0.3, b = 0.7, c = -0.4, d = 0.55 } = {}) {
    if (opts && opts.honestNeumann) opts = { ...opts, trueGrad: [b, c, d] };
    const field = (x, y, z) => a + b * x + c * y + d * z;
    const u = new Float64Array(m.tet.length);
    for (let t = 0; t < u.length; t++) u[t] = field(m.cx[t], m.cy[t], m.cz[t]);   // exact: linear mean = centroid value
    const g = gradientRepaired3(u, m, { ...opts, field });
    const norm = Math.hypot(b, c, d);
    let deficient = 0, healthy = 0, stillLow = 0, maxStencil = 0, sumStencil = 0;
    for (let t = 0; t < u.length; t++) {
        const e = Math.hypot(g.gx[t] - b, g.gy[t] - c, g.gz[t] - d) / norm;
        if (deficientMask[t]) { deficient = Math.max(deficient, e); if (g.rank[t] < 3) stillLow++; }
        else healthy = Math.max(healthy, e);
        maxStencil = Math.max(maxStencil, g.stencil[t]); sumStencil += g.stencil[t];
    }
    return { deficient, healthy, stillLow, maxStencil, meanStencil: sumStencil / u.length };
}
