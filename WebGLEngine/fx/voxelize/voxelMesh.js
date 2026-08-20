// fx/voxelize/voxelMesh.js -- the cap on SweK's voxelize path (the brain2mesh / ct2print / nii2mesh idea, in-house):
// turn a voxel volume into a watertight triangle mesh and export it as OBJ, so content -> voxels (the filter series) ->
// MESH -> a real 3D asset you can publish or 3D-print. Because SweK's voxels are blocky, this emits a voxel-surface
// mesh: every voxel face that borders empty space becomes two triangles, interior faces are culled, so the surface is
// closed (watertight) with no wasted geometry. Pure + verified; a smoothing/decimation pass (quadric error, like
// ct2print) is a clean future add.
"use strict";

// occ: flat occupancy array length nx*ny*nz, index (z*ny+y)*nx+x, truthy = solid. Returns { positions, indices, ... }.
function voxelsToMesh(occ, nx, ny, nz, cell = 1) {
    const positions = [], indices = []; let vi = 0;
    const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) ? 0 : (occ[(z * ny + y) * nx + x] ? 1 : 0);
    const FACES = [
        { n: [1, 0, 0], q: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
        { n: [-1, 0, 0], q: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
        { n: [0, 1, 0], q: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
        { n: [0, -1, 0], q: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
        { n: [0, 0, 1], q: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
        { n: [0, 0, -1], q: [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]] }
    ];
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        if (!at(x, y, z)) continue;
        for (const f of FACES) {
            if (at(x + f.n[0], y + f.n[1], z + f.n[2])) continue;   // interior face -> cull
            const b = vi; for (const c of f.q) { positions.push((x + c[0]) * cell, (y + c[1]) * cell, (z + c[2]) * cell); } vi += 4;
            indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
    }
    return { positions, indices, verts: vi, tris: indices.length / 3 };
}

// Build an occupancy volume from the filter-series page voxels (a 2D grid) by extruding each set cell to `depth` layers.
function occFromPageVoxels(voxels, nx, ny, depth = 3) {
    const nz = Math.max(1, depth | 0), occ = new Uint8Array(nx * ny * nz);
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { const v = voxels[y * nx + x]; if (v && (v.on == null ? v : v.on)) for (let z = 0; z < nz; z++) occ[(z * ny + y) * nx + x] = 1; }
    return { occ, nx, ny, nz };
}

function toOBJ(mesh, name = "swek_voxel_mesh") {
    let s = "# SweK Engine voxel mesh (" + mesh.verts + " verts, " + mesh.tris + " tris)\no " + name + "\n";
    for (let i = 0; i < mesh.positions.length; i += 3) s += "v " + mesh.positions[i] + " " + mesh.positions[i + 1] + " " + mesh.positions[i + 2] + "\n";
    for (let i = 0; i < mesh.indices.length; i += 3) s += "f " + (mesh.indices[i] + 1) + " " + (mesh.indices[i + 1] + 1) + " " + (mesh.indices[i + 2] + 1) + "\n";
    return s;
}
export { voxelsToMesh, occFromPageVoxels, toOBJ };
if (typeof module !== "undefined" && module.exports) module.exports = { voxelsToMesh, occFromPageVoxels, toOBJ };
