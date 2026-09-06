// WebGLEngine/physics/splat/splatMesh.mjs -- v4511
//
// *** A COLLIDER OUT OF A SPLAT CLOUD: DENSITY INTO A SPARSE VOXEL VOLUME, NAIVE SURFACE NETS OUT (task 58). *** The idea is
// isaac-mason/splatmesh (MIT, (c) 2026 Isaac Mason; world/reachedLicences.mjs), READ AND HAND-WRITTEN, nothing copied: its
// rasterise.ts stamps each splat's opacity into the voxel its centre falls in ("centers") or into every voxel within its
// footprint radius ("coverage"), MAX-accumulated so density stays in [0, 1] whatever the crowding; its mesh.ts extracts the
// iso-surface by naive surface nets -- one vertex per cell whose eight corners straddle the iso, placed at the mean of the
// cell's edge crossings, and a quad across every grid edge whose two ends straddle it, wound so the front faces
// solid-to-empty. That is the whole method, and it is deterministic: the same volume has one mesh, so the gate holds this
// mesher vertex for vertex and triangle for triangle against a second one written the other way round.
//
// WHY HERE. physics/splat/gaussianSplat.js grades the EWA projection against closed forms and says "Spark stays a viewer";
// nothing in gpu/SplatLoader.js, gpu/SplatScene.js, render/SplatRenderer.js or render/splatSort.mjs gives a splat scene a
// collision surface (grep: no collision, voxel or mesh word inside that stack). This module does, and hands back the shape
// mesh/meshBVH.mjs's trianglesFrom(positions, indices) takes, so a splat scene can be raycast and walked. The tree's loader
// stores three scales per splat (exp of the file's log scales) and a sigmoid opacity; the footprint radius here is the
// LARGEST of the three, where splatmesh's cloud carries one scalar.
//
// NOT TAKEN: splatmesh's 16-cubed chunking (the volume here is a sparse map keyed by voxel coordinate, exact and slower on a
// million-splat scene -- said plainly; chunk when a scene needs it), its per-voxel edit flags and its editor, the heightfield
// and greedy meshers, and the glb export.
"use strict";

export const DEFAULT_RASTER = Object.freeze({ mode: "coverage", minOpacity: 0.2, splatRadius: 1, maxRadius: 0.5, maxSplatScale: 0 });
export const ISO = 0.5;

/** a sparse density volume: cellSize world units a voxel, origin at voxel (0, 0, 0)'s min corner */
export function createVolume({ cellSize = 0.1, origin = [0, 0, 0] } = {}) { return { cellSize, origin: origin.slice(), cells: new Map() }; }
const key = (x, y, z) => x + "," + y + "," + z;
export function getDensity(vol, x, y, z) { return vol.cells.get(key(x, y, z)) || 0; }
export function setDensity(vol, x, y, z, d) { vol.cells.set(key(x, y, z), d); }
/** max-accumulate: density stays in [0, 1] whatever the crowding */
export function maxDensity(vol, x, y, z, d) { const k = key(x, y, z), cur = vol.cells.get(k) || 0; if (d > cur) vol.cells.set(k, d); }
export function voxelOf(vol, wx, wy, wz) { return [Math.floor((wx - vol.origin[0]) / vol.cellSize), Math.floor((wy - vol.origin[1]) / vol.cellSize), Math.floor((wz - vol.origin[2]) / vol.cellSize)]; }
/** the inclusive voxel bounds of every allocated cell, or null */
export function voxelBounds(vol) {
    if (!vol.cells.size) return null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const k of vol.cells.keys()) { const [x, y, z] = k.split(",").map(Number); min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z); max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z); }
    return { min, max };
}

/**
 * Rasterise a cloud { positions: xyz triples, scales: xyz triples (world units), opacities: 0..1, count } into the volume.
 * centers: the voxel under each centre takes the opacity; coverage: every voxel whose centre-offset lies within the footprint
 * radius r = min(maxRadius, maxScale * splatRadius) does. Splats fainter than minOpacity are skipped; so are splats whose
 * largest scale exceeds maxSplatScale when that is set (sky and background blobs).
 */
export function rasterise(vol, cloud, params = DEFAULT_RASTER) {
    const p = { ...DEFAULT_RASTER, ...params }, { cellSize } = vol; let stamped = 0, skipped = 0;
    for (let i = 0; i < cloud.count; i++) {
        const a = cloud.opacities[i]; if (a < p.minOpacity) { skipped++; continue; }
        const s = Math.max(cloud.scales[i * 3], cloud.scales[i * 3 + 1], cloud.scales[i * 3 + 2]);
        if (p.maxSplatScale > 0 && s > p.maxSplatScale) { skipped++; continue; }
        const [cx, cy, cz] = voxelOf(vol, cloud.positions[i * 3], cloud.positions[i * 3 + 1], cloud.positions[i * 3 + 2]);
        stamped++;
        if (p.mode === "centers") { maxDensity(vol, cx, cy, cz, a); continue; }
        const r = Math.min(p.maxRadius, s * p.splatRadius), rv = Math.max(0, Math.floor(r / cellSize));
        if (rv === 0) { maxDensity(vol, cx, cy, cz, a); continue; }
        const r2 = r * r;
        for (let oz = -rv; oz <= rv; oz++) for (let oy = -rv; oy <= rv; oy++) for (let ox = -rv; ox <= rv; ox++) {
            const wx = ox * cellSize, wy = oy * cellSize, wz = oz * cellSize; if (wx * wx + wy * wy + wz * wz > r2) continue;
            maxDensity(vol, cx + ox, cy + oy, cz + oz, a);
        }
    }
    return { stamped, skipped };
}

/** the 12 edges of a cell as corner-index pairs; corner c is (c & 1, c >> 1 & 1, c >> 2 & 1) */
export const EDGES = Object.freeze([[0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]]);

/**
 * Naive surface nets at `iso`: a voxel is solid when its density >= iso, unallocated reads 0. One vertex per straddling cell at
 * the mean of its edge crossings (linear along each straddling edge); a quad across every grid edge whose two voxels differ,
 * over the four cells sharing that edge, wound so the front faces solid-to-empty. World space. Returns { positions, indices }.
 */
export function surfaceNets(vol, iso = ISO) {
    const b = voxelBounds(vol); if (!b) return { positions: new Float32Array(0), indices: new Uint32Array(0) };
    const { cellSize, origin } = vol, positions = [], indices = [], cellVertex = new Map(), d = new Float64Array(8);
    const x0 = b.min[0] - 1, y0 = b.min[1] - 1, z0 = b.min[2] - 1, x1 = b.max[0], y1 = b.max[1], z1 = b.max[2];
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) { d[c] = getDensity(vol, x + (c & 1), y + ((c >> 1) & 1), z + ((c >> 2) & 1)); if (d[c] >= iso) mask |= 1 << c; }
        if (mask === 0 || mask === 0xff) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, c] of EDGES) { if (((mask >> a) & 1) === ((mask >> c) & 1)) continue; const t = (iso - d[a]) / (d[c] - d[a]);
            sx += (a & 1) + t * ((c & 1) - (a & 1)); sy += ((a >> 1) & 1) + t * (((c >> 1) & 1) - ((a >> 1) & 1)); sz += ((a >> 2) & 1) + t * (((c >> 2) & 1) - ((a >> 2) & 1)); n++; }
        cellVertex.set(key(x, y, z), positions.length / 3);
        positions.push(origin[0] + (x + sx / n) * cellSize, origin[1] + (y + sy / n) * cellSize, origin[2] + (z + sz / n) * cellSize);
    }
    const AXES = [[0, [0, 1, 0], [0, 0, 1]], [1, [0, 0, 1], [1, 0, 0]], [2, [1, 0, 0], [0, 1, 0]]];
    // pass 2 starts at the apron voxel (min - 1) too: a first draft started at min and never stitched the sign change from the empty
    // apron into a solid bound voxel, and the reference mesher carried the same off-by-one, so the twin agreed while the watertight
    // hold reported 122 boundary edges on a rasterised shell -- a twin written the same way round proves nothing about that step
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const inside0 = getDensity(vol, x, y, z) >= iso;
        for (const [i, u, v] of AXES) {
            const insideI = getDensity(vol, x + (i === 0 ? 1 : 0), y + (i === 1 ? 1 : 0), z + (i === 2 ? 1 : 0)) >= iso;
            if (inside0 === insideI) continue;
            const c0 = cellVertex.get(key(x, y, z)), cu = cellVertex.get(key(x - u[0], y - u[1], z - u[2])), cv = cellVertex.get(key(x - v[0], y - v[1], z - v[2])), cuv = cellVertex.get(key(x - u[0] - v[0], y - u[1] - v[1], z - u[2] - v[2]));
            if (c0 === undefined || cu === undefined || cv === undefined || cuv === undefined) continue;
            if (inside0) indices.push(c0, cu, cuv, c0, cuv, cv); else indices.push(c0, cv, cuv, c0, cuv, cu);
        }
    }
    return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

/** the shape mesh/meshBVH.mjs's trianglesFrom takes: positions as [x, y, z] triples and indices as [i, j, k] triples */
export function meshTriples(mesh) {
    const positions = [], indices = [];
    for (let i = 0; i < mesh.positions.length; i += 3) positions.push([mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
    for (let t = 0; t < mesh.indices.length; t += 3) indices.push([mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]]);
    return { positions, indices };
}

/** mesh statistics for a gate: vertices, triangles, directed-edge consistency, boundary and non-manifold edges, Euler characteristic */
export function meshStats(mesh) {
    const V = mesh.positions.length / 3, F = mesh.indices.length / 3, dir = new Map(), und = new Map();
    for (let t = 0; t < F; t++) { const i = mesh.indices; const tri = [i[t * 3], i[t * 3 + 1], i[t * 3 + 2]];
        for (let e = 0; e < 3; e++) { const a = tri[e], b = tri[(e + 1) % 3]; dir.set(a + ">" + b, (dir.get(a + ">" + b) || 0) + 1); const k = a < b ? a + "-" + b : b + "-" + a; und.set(k, (und.get(k) || 0) + 1); } }
    let boundary = 0, nonManifold = 0, inconsistent = 0;
    for (const [k, n] of und) { if (n === 1) boundary++; else if (n > 2) nonManifold++; }
    for (const [k, n] of dir) { if (n !== 1) inconsistent++; const [a, b] = k.split(">"); if (!dir.has(b + ">" + a)) inconsistent++; }
    return { vertices: V, triangles: F, edges: und.size, boundary, nonManifold, inconsistent, euler: V - und.size + F };
}

/** a hash of a mesh's bytes, for "one volume, one mesh" */
export function meshHash(mesh) {
    let h = 0x811c9dc5; const mix = (v) => { const s = String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } };
    for (let i = 0; i < mesh.positions.length; i++) mix(mesh.positions[i].toFixed(6)); for (let i = 0; i < mesh.indices.length; i++) mix(mesh.indices[i]);
    return h >>> 0;
}

/** a deterministic cloud on a sphere's surface (fibonacci points), for gates and the lab: n splats of one scale and opacity */
export function sphereCloud({ n = 2000, radius = 1, centre = [0, 0, 0], scale = 0.08, opacity = 0.9 } = {}) {
    const positions = new Float32Array(n * 3), scales = new Float32Array(n * 3), opacities = new Float32Array(n), golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) * 2 / n, r = Math.sqrt(1 - y * y), th = golden * i;
        positions[i * 3] = centre[0] + radius * r * Math.cos(th); positions[i * 3 + 1] = centre[1] + radius * y; positions[i * 3 + 2] = centre[2] + radius * r * Math.sin(th);
        scales[i * 3] = scales[i * 3 + 1] = scales[i * 3 + 2] = scale; opacities[i] = opacity; }
    return { positions, scales, opacities, count: n };
}

/** an analytic solid ball as a density volume: 1 inside, linear ramp to 0 across one cell, for a mesher with a known answer */
export function ballVolume({ radius = 1, cellSize = 0.1, pad = 2 } = {}) {
    const vol = createVolume({ cellSize }), R = Math.ceil(radius / cellSize) + pad;
    for (let z = -R; z <= R; z++) for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        const dist = Math.hypot((x + 0.5) * cellSize, (y + 0.5) * cellSize, (z + 0.5) * cellSize), d = Math.max(0, Math.min(1, 1 - (dist - radius) / cellSize));
        if (d > 0) setDensity(vol, x, y, z, d);
    }
    return vol;
}
