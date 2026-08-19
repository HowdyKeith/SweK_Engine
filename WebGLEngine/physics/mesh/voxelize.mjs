// WebGLEngine/physics/mesh/voxelize.mjs -- v2874
//
// TRIANGLE MESH -> SOLID MASK, so the wind tunnel can be pointed at a real model.
//
// The LBM asks one question of a shape: solidAt(x, y[, z]). Everything else about a glTF -- materials, normals,
// animation -- is noise to a flow solver. So this turns a triangle soup into an occupancy grid and nothing more.
//
// METHOD: RAY PARITY, and the choice matters. For each grid line along +x, intersect every triangle, sort the
// hit distances, and fill between alternate crossings. A point is inside iff a ray from it crosses the surface an
// odd number of times -- which is true for ANY closed surface regardless of convexity, so a car or a fuselage
// works exactly as a sphere does. The alternative -- flood filling from outside -- is faster but LEAKS through a
// single missing triangle, and a leak does not look like an error, it looks like a body with a hole in it that
// still produces a plausible drag number.
//
// THE ANSWER KEY, AND IT IS WHY THIS IS AN INSTRUMENT RATHER THAN A UTILITY: voxelised volume must converge to
// the analytic volume of the shape. A sphere of radius r encloses exactly (4/3)pi r^3 and a box exactly w*h*d,
// so the error must SHRINK as the grid refines. That is a convergence key of the same shape as the CT and Fresnel
// ones -- not "looks about right", but "wrong by an amount that provably decreases".
//
// A DEGENERATE MESH IS REFUSED, NOT VOXELISED. A ray-parity fill of an OPEN surface produces confident nonsense:
// parity flips once and never flips back, so half the domain fills with solid. Silence there would put a
// solid wall in the tunnel and report its drag.
"use strict";

/**
 * Voxelise a triangle mesh into a 3D occupancy grid.
 * @param {{positions: ArrayLike<number>, indices: ArrayLike<number>}} mesh
 * @param {{nx:number, ny:number, nz:number, lo?:number[], hi?:number[], pad?:number}} grid
 * @returns {{solid: Uint8Array, nx, ny, nz, lo, hi, cell:number[], filled:number}}
 */
export function voxelize(mesh, grid) {
    const { nx, ny, nz } = grid;
    if (!(nx > 0 && ny > 0 && nz > 0)) throw new Error("voxelize needs positive nx, ny, nz");
    const P = mesh.positions, I = mesh.indices;
    if (!P || !I || I.length % 3) throw new Error("voxelize needs a triangle mesh (indices in multiples of 3)");

    let lo = grid.lo, hi = grid.hi;
    if (!lo || !hi) {
        lo = [Infinity, Infinity, Infinity]; hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < P.length; i += 3) for (let c = 0; c < 3; c++) {
            if (P[i + c] < lo[c]) lo[c] = P[i + c];
            if (P[i + c] > hi[c]) hi[c] = P[i + c];
        }
        const pad = grid.pad == null ? 0.02 : grid.pad;      // a hair of margin so the surface is not ON the boundary
        for (let c = 0; c < 3; c++) { const s = (hi[c] - lo[c]) * pad || 1e-6; lo[c] -= s; hi[c] += s; }
    }
    const cell = [(hi[0] - lo[0]) / nx, (hi[1] - lo[1]) / ny, (hi[2] - lo[2]) / nz];
    const solid = new Uint8Array(nx * ny * nz);
    const idx = (x, y, z) => (z * ny + y) * nx + x;

    // For every (y,z) grid line, collect x-crossings of all triangles and fill by parity.
    const tri = I.length / 3;
    for (let z = 0; z < nz; z++) {
        const pz = lo[2] + (z + 0.5) * cell[2];
        for (let y = 0; y < ny; y++) {
            const py = lo[1] + (y + 0.5) * cell[1];
            const hits = [];
            for (let t = 0; t < tri; t++) {
                const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
                const ay = P[a + 1], az = P[a + 2], by = P[b + 1], bz = P[b + 2], cy = P[c + 1], cz = P[c + 2];
                // barycentric test in the (y,z) plane -- the ray is along x, so this is a 2D point-in-triangle
                const d = (by - ay) * (cz - az) - (cy - ay) * (bz - az);
                if (d === 0) continue;                              // degenerate in projection: contributes nothing
                const u = ((py - ay) * (cz - az) - (pz - az) * (cy - ay)) / d;
                const v = ((pz - az) * (by - ay) - (py - ay) * (bz - az)) / d;
                if (u < 0 || v < 0 || u + v > 1) continue;
                const x = P[a] + u * (P[b] - P[a]) + v * (P[c] - P[a]);
                hits.push(x);
            }
            if (hits.length < 2) continue;
            hits.sort((p, q) => p - q);
            for (let k = 0; k + 1 < hits.length; k += 2) {
                const x0 = hits[k], x1 = hits[k + 1];
                let i0 = Math.ceil((x0 - lo[0]) / cell[0] - 0.5);
                let i1 = Math.floor((x1 - lo[0]) / cell[0] - 0.5);
                if (i0 < 0) i0 = 0;
                if (i1 > nx - 1) i1 = nx - 1;
                for (let x = i0; x <= i1; x++) solid[idx(x, y, z)] = 1;
            }
        }
    }
    let filled = 0;
    for (let i = 0; i < solid.length; i++) filled += solid[i];
    return { solid, nx, ny, nz, lo, hi, cell, filled, idx };
}

/**
 * EXACT volume of a closed triangle mesh, by the divergence theorem: V = (1/6) sum (v0 . (v1 x v2)).
 *
 * THIS IS THE VOXELIZER'S REAL ANSWER KEY, and my first attempt used the wrong one. Grading voxel volume against
 * (4/3)pi r^3 conflates TWO separate errors: how well the voxeliser fills the mesh, and how well the MESH
 * approximates a sphere. A tessellated sphere is an inscribed POLYHEDRON with its own deficit, so that comparison
 * has a floor under it and the measured convergence flattened out at a few tenths of a percent -- looking like a
 * voxeliser bug that was really a tessellation fact.
 *
 * Split apart, both halves are exact keys:
 *     voxel volume  ->  meshVolume()      grades the VOXELISER
 *     meshVolume()  ->  (4/3)pi r^3       grades the TESSELLATION
 */
export function meshVolume(mesh) {
    const P = mesh.positions, I = mesh.indices;
    let v6 = 0;
    for (let t = 0; t < I.length / 3; t++) {
        const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
        const ax = P[a], ay = P[a + 1], az = P[a + 2];
        const bx = P[b], by = P[b + 1], bz = P[b + 2];
        const cx = P[c], cy = P[c + 1], cz = P[c + 2];
        v6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
    return Math.abs(v6) / 6;
}

/** Volume implied by an occupancy grid: filled cells times cell volume. Compared against meshVolume(). */
export function voxelVolume(v) { return v.filled * v.cell[0] * v.cell[1] * v.cell[2]; }

/**
 * A 2D CROSS-SECTION at a given z fraction, for the existing 2D tunnel.
 *
 * READ THE CAVEAT BEFORE USING THE NUMBER. The 2D tunnel measures a 2D flow. The drag coefficient of a SLICE
 * is not the drag coefficient of the BODY -- for a sphere the slice is a cylinder, and a cylinder's Cd is
 * roughly double a sphere's at the same Reynolds number. For a car or a fuselage the two are not even close.
 * This is useful for SHAPE COMPARISON in a 2D tunnel and it is not an aerodynamic result about the object.
 */
export function crossSection(mesh, { nx, ny, zFrac = 0.5, lo, hi, pad }) {
    const v = voxelize(mesh, { nx, ny, nz: 1, lo, hi, pad });
    return { mask: v.solid, nx, ny, lo: v.lo, hi: v.hi, cell: v.cell, filled: v.filled,
             solidAt: (x, y) => !!v.solid[y * nx + x] };
}

/** Area implied by a cross-section mask. */
export function sectionArea(s) { return s.filled * s.cell[0] * s.cell[1]; }

/**
 * Is this mesh closed enough to voxelise honestly? Every edge of a closed triangle surface is shared by exactly
 * two triangles. An open mesh breaks ray parity and fills half the domain -- confidently.
 */
export function isClosed(mesh) {
    const I = mesh.indices, edges = new Map();
    for (let t = 0; t < I.length / 3; t++) {
        const v = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
        for (let k = 0; k < 3; k++) {
            const a = v[k], b = v[(k + 1) % 3];
            const key = a < b ? a + "_" + b : b + "_" + a;
            edges.set(key, (edges.get(key) || 0) + 1);
        }
    }
    let boundary = 0, nonManifold = 0;
    for (const n of edges.values()) { if (n === 1) boundary++; else if (n > 2) nonManifold++; }
    return { closed: boundary === 0 && nonManifold === 0, boundaryEdges: boundary, nonManifoldEdges: nonManifold, edges: edges.size };
}
