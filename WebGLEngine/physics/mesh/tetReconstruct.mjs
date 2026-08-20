// physics/mesh/tetReconstruct.mjs
//
// THE SAME QUESTION IN THREE DIMENSIONS, WHERE v3640 SAID THE ANSWER WAS A GENUINE OPEN QUESTION.
//
// v3640 found that on a triangulated rectangle the RANK-DEFICIENT set -- cells whose gradient cannot be
// determined from cell averages at all -- is EXACTLY TWO, at every mesh size, while the boundary itself grows
// 30 / 62 / 126 / 254. That is a statement about a rank defect and not about resolution.
//
// *** IN 3D A GRADIENT HAS THREE UNKNOWNS AND EACH FACE NEIGHBOUR SUPPLIES ONE EQUATION, so a tetrahedron needs
// THREE non-coplanar neighbours where a triangle needed two non-collinear ones. A tet has FOUR faces, so the
// interior has margin -- but the constraint is harder to satisfy and there are more ways to fall short: a tet on
// a face of the box loses one, on an edge two, at a corner three. WHETHER THE DEFICIENT SET IS O(1) LIKE 2D OR
// GROWS WITH THE MESH IS NOT SOMETHING TO REASON OUT FROM THE 2D ANSWER -- this arc has been wrong three times
// predicting how a 2D result transfers, so it is measured. ***
//
// THE MESH: Freudenthal / Kuhn subdivision, six tetrahedra per cube, which tiles space with no slivers and gives
// a deterministic connectivity. `skew` shears the vertex lattice exactly as the 2D mesh does, so the two rounds
// are asking the same question of the same kind of mesh.
//
// A NOTE ON THE CELL AVERAGE, BECAUSE IT MATTERS FOR THE KEY: over a simplex the average of a LINEAR function is
// exactly its value at the CENTROID. So sampling the centroid is EXACT for the linear field the key uses, and
// second order for anything else. That is stated rather than hidden, because it is why the key is clean.
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

const KUHN = [                      // the six tets of the unit cube, by corner index (bit 0 = x, 1 = y, 2 = z)
    [0, 1, 3, 7], [0, 1, 5, 7], [0, 4, 5, 7], [0, 4, 6, 7], [0, 2, 6, 7], [0, 2, 3, 7],
];

export function makeTetMesh({ nx = 8, ny = 8, nz = 8, h = 1, skew = 0 } = {}) {
    const vx = [], vy = [], vz = [];
    const vid = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i;
    for (let k = 0; k <= nz; k++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const s = skew * h * Math.sin(2.1 * i / nx * Math.PI) * Math.cos(1.7 * j / ny * Math.PI) * Math.cos(1.3 * k / nz * Math.PI);
        vx.push(i * h + s); vy.push(j * h + 0.6 * s); vz.push(k * h - 0.4 * s);
    }
    const tet = [];
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const corner = (b) => vid(i + (b & 1), j + ((b >> 1) & 1), k + ((b >> 2) & 1));
        for (const t of KUHN) tet.push(t.map(corner));
    }
    const n = tet.length;
    const cx = new Float64Array(n), cy = new Float64Array(n), cz = new Float64Array(n), vol = new Float64Array(n);
    for (let t = 0; t < n; t++) {
        const [a, b, c, d] = tet[t];
        cx[t] = (vx[a] + vx[b] + vx[c] + vx[d]) / 4;
        cy[t] = (vy[a] + vy[b] + vy[c] + vy[d]) / 4;
        cz[t] = (vz[a] + vz[b] + vz[c] + vz[d]) / 4;
        const ux = vx[b] - vx[a], uy = vy[b] - vy[a], uz = vz[b] - vz[a];
        const wx = vx[c] - vx[a], wy = vy[c] - vy[a], wz = vz[c] - vz[a];
        const qx = vx[d] - vx[a], qy = vy[d] - vy[a], qz = vz[d] - vz[a];
        vol[t] = Math.abs(ux * (wy * qz - wz * qy) - uy * (wx * qz - wz * qx) + uz * (wx * qy - wy * qx)) / 6;
    }
    // face neighbours: two tets sharing THREE vertices
    const faceMap = new Map();
    const key = (a, b, c) => { const s = [a, b, c].sort((p, q) => p - q); return s[0] + ":" + s[1] + ":" + s[2]; };
    for (let t = 0; t < n; t++) {
        const [a, b, c, d] = tet[t];
        for (const f of [[a, b, c], [a, b, d], [a, c, d], [b, c, d]]) {
            const k2 = key(...f);
            if (!faceMap.has(k2)) faceMap.set(k2, []);
            faceMap.get(k2).push(t);
        }
    }
    const nbr = tet.map(() => []);
    for (const list of faceMap.values()) if (list.length === 2) { nbr[list[0]].push(list[1]); nbr[list[1]].push(list[0]); }
    return { vx, vy, vz, tet, cx, cy, cz, vol, nbr, nx, ny, nz, h, skew };
}

/** Cell averages. EXACT for a linear field (mean over a simplex = value at the centroid); second order otherwise. */
export function analyticCells3(f, m) {
    const out = new Float64Array(m.tet.length);
    for (let t = 0; t < m.tet.length; t++) out[t] = f(m.cx[t], m.cy[t], m.cz[t]);
    return out;
}

/**
 * Least-squares gradient over face neighbours, with the RANK returned beside it -- v3640's fix carried into 3D
 * rather than re-learned. A 3x3 normal matrix; the singularity test is SCALE-FREE (compare against the trace
 * cubed) so it means the same thing on a fine mesh as a coarse one.
 */
export function gradientLS3(u, m) {
    const gx = new Float64Array(u.length), gy = new Float64Array(u.length), gz = new Float64Array(u.length);
    const rank = new Int8Array(u.length);
    for (let t = 0; t < u.length; t++) {
        let A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
        for (const q of m.nbr[t]) {
            const d = [m.cx[q] - m.cx[t], m.cy[q] - m.cy[t], m.cz[q] - m.cz[t]];
            const w = 1 / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), du = u[q] - u[t];
            for (let a = 0; a < 3; a++) { for (let b = 0; b < 3; b++) A[a][b] += w * d[a] * d[b]; r[a] += w * d[a] * du; }
        }
        const tr = A[0][0] + A[1][1] + A[2][2];
        const det = A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1])
            - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0])
            + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
        if (m.nbr[t].length === 0) { rank[t] = 0; continue; }
        if (Math.abs(det) <= 1e-10 * Math.max(tr * tr * tr, 1e-300)) { rank[t] = Math.min(m.nbr[t].length, 2); continue; }
        const sol = solve3(A, r);
        if (!sol) { rank[t] = 2; continue; }
        rank[t] = 3; gx[t] = sol[0]; gy[t] = sol[1]; gz[t] = sol[2];
    }
    return { gx, gy, gz, rank };
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

/** Cells with fewer than four face neighbours -- the 3D boundary set. */
export function boundaryCells3(m) {
    const out = new Uint8Array(m.tet.length);
    for (let t = 0; t < m.tet.length; t++) if (m.nbr[t].length < 4) out[t] = 1;
    return out;
}

export function rankCensus3(u, m) {
    const g = gradientLS3(u, m);
    const byNbr = new Map(), byRank = new Map();
    for (let t = 0; t < m.tet.length; t++) {
        byNbr.set(m.nbr[t].length, (byNbr.get(m.nbr[t].length) || 0) + 1);
        byRank.set(g.rank[t], (byRank.get(g.rank[t]) || 0) + 1);
    }
    return { byNbr: Object.fromEntries([...byNbr].sort()), byRank: Object.fromEntries([...byRank].sort()), total: m.tet.length };
}

/** THE EXACT KEY, unchanged in three dimensions: a linear field must come back exactly. */
export function linearityError3(m, { a = 0.3, b = 0.7, c = -0.4, d = 0.55 } = {}) {
    const u = analyticCells3((x, y, z) => a + b * x + c * y + d * z, m);
    const g = gradientLS3(u, m);
    const norm = Math.hypot(b, c, d);
    const worst = {};
    for (let t = 0; t < u.length; t++) {
        const e = Math.hypot(g.gx[t] - b, g.gy[t] - c, g.gz[t] - d) / norm;
        worst[g.rank[t]] = Math.max(worst[g.rank[t]] || 0, e);
    }
    return worst;
}
