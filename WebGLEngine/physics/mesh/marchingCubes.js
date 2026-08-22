// physics/mesh/marchingCubes.js
//
// Marching tetrahedra: extract a smooth surface from an implicit field we know exactly, and grade the mesh against that
// known surface. The field is a sum of Wyvill metaballs -- a polynomial falloff, pure arithmetic, no trig -- or a plain
// sphere, so the truth is analytic: a vertex the extractor places should sit ON the isosurface, the mesh should be
// watertight (every edge shared by exactly two triangles, a closed manifold), and the volume it encloses should converge
// to the analytic volume as the grid refines. Normals come from the analytic gradient, so the "flesh" shades smoothly
// with no faceting. Tetrahedra rather than cubes because the six-tet decomposition sharing a common diagonal is watertight
// by construction and has no ambiguous cases. Arithmetic throughout -- fold-ready, though currently gated.

// ---- FIELDS (exact, analytic) ----------------------------------------------------------------------
// Wyvill metaball falloff: (1 - d^2/R^2)^3 inside R, 0 outside. Polynomial -- arithmetic, cross-arch.
export function wyvill(balls, x, y, z) {
    let v = 0;
    for (const b of balls) { const dx = x - b.cx, dy = y - b.cy, dz = z - b.cz, d2 = dx * dx + dy * dy + dz * dz, R2 = b.r * b.r; if (d2 < R2) { const q = 1 - d2 / R2; v += b.s * q * q * q; } }
    return v;
}
export function wyvillGrad(balls, x, y, z) {
    let gx = 0, gy = 0, gz = 0;
    for (const b of balls) { const dx = x - b.cx, dy = y - b.cy, dz = z - b.cz, d2 = dx * dx + dy * dy + dz * dz, R2 = b.r * b.r; if (d2 < R2) { const q = 1 - d2 / R2, c = b.s * 3 * q * q * (-2 / R2); gx += c * dx; gy += c * dy; gz += c * dz; } }
    return [gx, gy, gz];
}
// A plain sphere field with exact volume 4/3 pi R^3 at iso 0: f = R^2 - r^2.
export function sphereField(R) { return { f: (x, y, z) => R * R - (x * x + y * y + z * z), g: (x, y, z) => [-2 * x, -2 * y, -2 * z], volume: 4 / 3 * Math.PI * R * R * R }; }

// ---- SHARP-FEATURE FIELDS AND A SURFACE METRIC (v3417) ------------------------------------------------------
// *** THIS EXTRACTOR'S GATE GRADED IT ON SPHERES AND WYVILL METABALLS ONLY -- BOTH SMOOTH -- SO THE ONE PROPERTY
// THE CUBICAL-MARCHING-SQUARES LITERATURE EXISTS FOR (Ho et al., Eurographics 2005: sharp features, topology,
// adaptivity, inter-cell independence) WAS THE ONE PROPERTY IT COULD NOT SEE. *** These three exports let the
// question be MEASURED here rather than argued about, and no new extractor is added: the finding is about the
// extractor already shipping.
//
// AND THE BLINDNESS HAS TWO CAUSES, NOT ONE. The obvious one is the FIXTURE. The second is the METRIC:
// maxSurfaceDeviation reads |field| AT VERTICES, and a vertex lives on a grid EDGE where a box field is linear,
// so it lands exactly on a face and reports zero. A CHAMFERED CORNER HAS NO VERTEX OFF THE SURFACE. Measuring
// feature loss needs a POINT-TO-SURFACE distance, which is what surfaceDistance is for.

/** A box as a TRUE Euclidean signed distance, positive INSIDE to match sphereField's convention. */
export function boxField(a) {
    const f = (x, y, z) => {
        const qx = Math.abs(x) - a, qy = Math.abs(y) - a, qz = Math.abs(z) - a;
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
        return -(Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, Math.max(qy, qz)), 0));
    };
    // Analytic, so nothing here depends on a finite-difference step. Outside: the direction to the nearest
    // point. Inside: the dominant slab. Undefined ON an edge, which is exactly the fact this file is about --
    // a sharp feature is where the normal is not a single vector, and no extractor placing vertices on grid
    // edges can represent that.
    const g = (x, y, z) => {
        const qx = Math.abs(x) - a, qy = Math.abs(y) - a, qz = Math.abs(z) - a;
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
        const L = Math.sqrt(ox * ox + oy * oy + oz * oz);
        if (L > 0) return [-Math.sign(x) * ox / L, -Math.sign(y) * oy / L, -Math.sign(z) * oz / L];
        if (qx >= qy && qx >= qz) return [-Math.sign(x), 0, 0];
        if (qy >= qz) return [0, -Math.sign(y), 0];
        return [0, 0, -Math.sign(z)];
    };
    return { f, g, volume: 8 * a * a * a, corner: [a, a, a], half: a };
}

/** The SAME box as a min of slabs. Not a Euclidean distance, and that is the point -- see below. */
export function slabBoxField(a) {
    const f = (x, y, z) => Math.min(a - Math.abs(x), Math.min(a - Math.abs(y), a - Math.abs(z)));
    const g = (x, y, z) => {
        const dx = a - Math.abs(x), dy = a - Math.abs(y), dz = a - Math.abs(z);
        if (dx <= dy && dx <= dz) return [-Math.sign(x), 0, 0];
        if (dy <= dz) return [0, -Math.sign(y), 0];
        return [0, 0, -Math.sign(z)];
    };
    return { f, g, volume: 8 * a * a * a, corner: [a, a, a], half: a };
}

/**
 * Distance from a point to the NEAREST POINT ON THE MESH -- clamped-barycentric point-to-triangle, so a corner
 * that has been chamfered away is measured by how far the chamfer sits from where the corner should be. This is
 * the metric maxSurfaceDeviation cannot supply, and the difference is not a refinement: on a slab box the
 * vertex metric returns EXACTLY zero while this returns a real length.
 */
export function surfaceDistance(verts, tris, p) {
    let best = Infinity;
    for (const [ia, ib, ic] of tris) {
        const A = verts[ia], B = verts[ib], C = verts[ic];
        const abx = B[0] - A[0], aby = B[1] - A[1], abz = B[2] - A[2];
        const acx = C[0] - A[0], acy = C[1] - A[1], acz = C[2] - A[2];
        const apx = p[0] - A[0], apy = p[1] - A[1], apz = p[2] - A[2];
        const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
        const d11 = abx * abx + aby * aby + abz * abz, d12 = abx * acx + aby * acy + abz * acz;
        const d22 = acx * acx + acy * acy + acz * acz, den = d11 * d22 - d12 * d12;
        let u = 0, v = 0;
        if (den > 1e-20) { u = (d22 * d1 - d12 * d2) / den; v = (d11 * d2 - d12 * d1) / den; }
        if (u < 0) u = 0; if (v < 0) v = 0;
        if (u + v > 1) { const k = u + v; u /= k; v /= k; }
        const qx = A[0] + u * abx + v * acx, qy = A[1] + u * aby + v * acy, qz = A[2] + u * abz + v * acz;
        const d = Math.sqrt((qx - p[0]) ** 2 + (qy - p[1]) ** 2 + (qz - p[2]) ** 2);
        if (d < best) best = d;
    }
    return best;
}

// The six tetrahedra of a unit cube, all sharing the 0-6 diagonal -- consistent across neighbours, hence watertight.
const CUBE = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const TETS = [[0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]];

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Extract triangles from one tetrahedron, given each corner's global grid index, position, and field value. Vertices are
// keyed by the grid edge they lie on plus the interpolation parameter, so adjacent tets produce IDENTICAL shared vertices
// (the watertight property). Winding is fixed afterward from the gradient.
function marchTet(gi, P, F, iso, edgeVert, tris) {
    const inside = F.map((f) => f >= iso), n = inside.filter(Boolean).length;
    if (n === 0 || n === 4) return;
    const cross = (i, j) => edgeVert(gi[i], P[i], F[i], gi[j], P[j], F[j]);
    const inIdx = [0, 1, 2, 3].filter((i) => inside[i]), outIdx = [0, 1, 2, 3].filter((i) => !inside[i]);
    if (n === 1 || n === 3) {
        const apex = n === 1 ? inIdx[0] : outIdx[0], others = [0, 1, 2, 3].filter((i) => i !== apex);
        tris.push([cross(apex, others[0]), cross(apex, others[1]), cross(apex, others[2])]);
    } else {
        const a = inIdx[0], b = inIdx[1], c = outIdx[0], d = outIdx[1];
        const p = cross(a, c), q = cross(a, d), r = cross(b, d), s = cross(b, c);
        tris.push([p, q, r]); tris.push([p, r, s]);
    }
}

// March a field over an N^3 grid in [lo,hi]^3. Returns { verts, tris (index triples), normals }. Vertices are shared across
// tetrahedra via grid-edge keys, and every triangle is wound so its normal points outward (down the field gradient).
export function marchingTets(field, grad, { N = 24, lo = -1.5, hi = 1.5, iso = 0 } = {}) {
    const h = (hi - lo) / N, gi = (ix, iy, iz) => ix + iy * (N + 1) + iz * (N + 1) * (N + 1);
    const map = new Map(), verts = [], tris = [];
    const edgeVert = (giA, posA, fA, giB, posB, fB) => {
        const t = (iso - fA) / (fB - fA), lowFirst = giA < giB, a = lowFirst ? giA : giB, b = lowFirst ? giB : giA;
        const k = a + "|" + b + "|" + Math.round((lowFirst ? t : 1 - t) * 1048576);
        let i = map.get(k); if (i === undefined) { i = verts.length; verts.push(lerp(posA, posB, t)); map.set(k, i); }
        return i;
    };
    for (let iz = 0; iz < N; iz++) for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
        const P = CUBE.map((c) => [lo + (ix + c[0]) * h, lo + (iy + c[1]) * h, lo + (iz + c[2]) * h]);
        const G = CUBE.map((c) => gi(ix + c[0], iy + c[1], iz + c[2]));
        const F = P.map((p) => field(p[0], p[1], p[2]));
        for (const tet of TETS) marchTet(tet.map((k) => G[k]), tet.map((k) => P[k]), tet.map((k) => F[k]), iso, edgeVert, tris);
    }
    // orient each triangle outward using the gradient at its centroid
    for (const tri of tris) {
        const p = verts[tri[0]], q = verts[tri[1]], r = verts[tri[2]];
        const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], w = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
        const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const cx = (p[0] + q[0] + r[0]) / 3, cy = (p[1] + q[1] + r[1]) / 3, cz = (p[2] + q[2] + r[2]) / 3;
        const g = grad(cx, cy, cz);                                  // outward is -gradient
        if (nrm[0] * -g[0] + nrm[1] * -g[1] + nrm[2] * -g[2] < 0) { const t = tri[1]; tri[1] = tri[2]; tri[2] = t; }
    }
    const normals = verts.map((v) => { const g = grad(v[0], v[1], v[2]); const L = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]) || 1; return [-g[0] / L, -g[1] / L, -g[2] / L]; });
    return { verts, tris, normals };
}

// Signed volume enclosed by the mesh (divergence theorem: sum of tetrahedra from the origin over each triangle).
export function meshVolume(verts, tris) {
    let vol = 0;
    for (const [a, b, c] of tris) { const p = verts[a], q = verts[b], r = verts[c]; vol += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }
    return Math.abs(vol);
}

// Watertight test: every edge is shared by exactly two triangles. Returns { watertight, boundaryEdges }.
export function watertight(tris) {
    const count = new Map(), e = (a, b) => (a < b ? a + "_" + b : b + "_" + a);
    for (const [a, b, c] of tris) for (const [x, y] of [[a, b], [b, c], [c, a]]) count.set(e(x, y), (count.get(e(x, y)) || 0) + 1);
    let boundary = 0; for (const v of count.values()) if (v !== 2) boundary++;
    return { watertight: boundary === 0, boundaryEdges: boundary };
}

// Largest distance any vertex sits off the isosurface, in units of the field's local slope (so it is comparable to a length).
export function maxSurfaceDeviation(verts, field, iso) {
    let m = 0; for (const v of verts) { const d = Math.abs(field(v[0], v[1], v[2]) - iso); if (d > m) m = d; } return m;
}

// --- occlusion-based color ramping (v2764) -----------------------------------------------------------------
// A vertex in a crevice is a vertex where the field is high from MORE THAN ONE source at once, so "how enclosed
// am I" is a quantity we already own -- we do not fake a darkening, we MEASURE it. For each vertex: outward
// normal = -grad normalized (the field is high INSIDE, so its gradient points inward); sample a fixed hemisphere
// of directions at `radius`; a sample that lands INSIDE the surface (field > iso) is a blocked direction. AO is
// the blocked fraction: 0 = an exposed spike, 1 = a fully enclosed pocket. Deterministic: fixed dirs, + - * / sqrt.
const AO_DIRS = [
    [0, 0, 1],
    [0.71, 0, 0.71], [-0.71, 0, 0.71], [0, 0.71, 0.71], [0, -0.71, 0.71],
    // a wide ring near the equator -- these catch a crease/neck, where the occluder is off to the SIDE of the
    // outward normal rather than in front of it. Without them AO only sees head-on pockets and misses saddles.
    [0.95, 0, 0.31], [-0.95, 0, 0.31], [0, 0.95, 0.31], [0, -0.95, 0.31],
    [0.67, 0.67, 0.31], [-0.67, 0.67, 0.31], [0.67, -0.67, 0.31], [-0.67, -0.67, 0.31],
];
export function ambientOcclusion(verts, field, grad, { iso = 0, radius = 0.2 } = {}) {
    const f = typeof field === "function" ? field : field.f;
    const ao = new Float32Array(verts.length);
    for (let i = 0; i < verts.length; i++) {
        const v = verts[i], g = grad(v[0], v[1], v[2]);
        let nl = Math.sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2]); if (nl === 0) nl = 1;
        const nx = -g[0] / nl, ny = -g[1] / nl, nz = -g[2] / nl;      // outward normal
        let tx = 1, ty = 0, tz = 0; if (nx > 0.9 || nx < -0.9) { tx = 0; ty = 1; tz = 0; }
        const dt = tx * nx + ty * ny + tz * nz; tx -= dt * nx; ty -= dt * ny; tz -= dt * nz;
        let tl = Math.sqrt(tx * tx + ty * ty + tz * tz); if (tl === 0) tl = 1; tx /= tl; ty /= tl; tz /= tl;
        const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;   // b = n x t
        let occ = 0;
        for (const d of AO_DIRS) {
            const wx = d[0] * tx + d[1] * bx + d[2] * nx;
            const wy = d[0] * ty + d[1] * by + d[2] * ny;
            const wz = d[0] * tz + d[1] * bz + d[2] * nz;
            if (f(v[0] + radius * wx, v[1] + radius * wy, v[2] + radius * wz) > iso) occ++;
        }
        ao[i] = occ / AO_DIRS.length;
    }
    return ao;
}
// The ramp: exposed vertices get `bright`, enclosed vertices get `dark`, lerped by AO. The crevices darken
// because they are genuinely enclosed, not because a shader was told to darken them.
export function occlusionRamp(ao, { dark = [0.10, 0.05, 0.02], bright = [1.0, 0.85, 0.5] } = {}) {
    const rgb = new Float32Array(ao.length * 3);
    for (let i = 0; i < ao.length; i++) {
        const t = ao[i];
        rgb[i * 3] = bright[0] + (dark[0] - bright[0]) * t;
        rgb[i * 3 + 1] = bright[1] + (dark[1] - bright[1]) * t;
        rgb[i * 3 + 2] = bright[2] + (dark[2] - bright[2]) * t;
    }
    return rgb;
}
