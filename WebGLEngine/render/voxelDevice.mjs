// WebGLEngine/render/voxelDevice.mjs -- v4517 (Sandbox on the device, round 1: the voxel world)
//
// *** THE MAIN SANDBOX'S WORLD, DRAWN THROUGH gfx/device.js. *** index.html + main.js draw world/world.js's VoxelWorld
// through three's WebGLRenderer and render/voxelrenderer.js; no WebGPU version of that page was ever started. This is
// the first function of the sandbox carried onto the device path the recent rounds built (gpuDriven, the lit pipeline):
// the SAME world class, the SAME greedy mesher (world/chunkMesherCore.js, the one the renderer's workers run), the SAME
// material colours (engine/MaterialRegistry.js over the mesher's PALETTE), and the same CityGen with its facades -- packed
// as ONE lit mesh with per-vertex colour and drawn as one record on both backends.
//
//   meshWorld(world, opts)   every chunk through meshChunk with its eight neighbours (so no face is drawn at a chunk seam
//                            and greedy runs are chunk-local, as the renderer does it), flat normals from each triangle's
//                            winding, the mesher's corner AO folded into the vertex colour (floor AO_FLOOR), concatenated
//                            into { positions, normals, colors, indices } plus per-chunk counts and a hash.
//   miniWorld(opts)          the smallest thing that satisfies the world contract the mesher and CityGen read -- chunkSize,
//                            chunkHeight, chunks Map of world/chunk.js Chunks keyed "cx,cz", setVoxel, voxelAt -- with chunks
//                            made on demand, for a gate's hand worlds and for a page with no terrain.
//   columnTop(world, x, z)   the topmost solid voxel's y and id in a column, the key a top-down frame is held to.
//   colourOf(id)             the registry's colour for a material id, else the mesher's PALETTE, else grey -- the
//                            renderer's own order (voxelrenderer.js line ~1227).
//   voxelScene(device, world, G, L, opts)   makeGpuDrivenScene over the packed world with litSphere's pipeline and the SUN.
//
// Not claimed: per-chunk updates (round 2, dig/build, re-meshes the touched chunk and rewrites its range); water as a
// separate pass (skipWater is off, so water is drawn as its solid colour); the sandbox's texture atlas and grain (the
// device path draws the registry colour flat, lit by one sun).
"use strict";
import { Chunk } from "../world/chunk.js";
import { meshChunk, PALETTE } from "../world/chunkMesherCore.js";
import { getMaterialRegistry } from "../engine/MaterialRegistry.js";

export const SUN = Object.freeze([600, 1400, 400, 0.38]);   // a point light far enough up to read as a sun; ambient 0.38
export const AO_FLOOR = 0.45;                               // the mesher's ao 0..1 darkens a vertex to at worst this
const NEIGHBOURS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export function colourOf(id) { return getMaterialRegistry().getColor(id) || PALETTE[id] || [0.5, 0.5, 0.5]; }

/** the world contract, minimal: chunks made on demand, nothing generated */
export function miniWorld({ chunkSize = 16, chunkHeight = 64 } = {}) {
    const chunks = new Map();
    const chunkOf = (x, z, make) => { const cx = Math.floor(x / chunkSize), cz = Math.floor(z / chunkSize), k = cx + "," + cz; let c = chunks.get(k); if (!c && make) { c = new Chunk(cx, cz, chunkSize, chunkHeight); chunks.set(k, c); } return c; };
    return {
        chunkSize, chunkHeight, chunks,
        setVoxel(x, y, z, v) { if (y < 0 || y >= chunkHeight) return; const c = chunkOf(x, z, true); c.set(x - c.cx * chunkSize, y, z - c.cz * chunkSize, v); },
        voxelAt(x, y, z) { if (y < 0 || y >= chunkHeight) return 0; const c = chunkOf(x, z, false); return c ? c.get(x - c.cx * chunkSize, y, z - c.cz * chunkSize) : 0; },
    };
}

export function columnTop(world, x, z) {
    for (let y = world.chunkHeight - 1; y >= 0; y--) { const id = world.voxelAt(x, y, z); if (id) return { y, id }; }
    return null;
}

/** one chunk through the mesher with its neighbours, the renderer's way */
export function meshOneChunk(world, chunk, { skipWater = false } = {}) {
    const neighbors = {};
    for (const [dx, dz] of NEIGHBOURS) { const adj = world.chunks.get((chunk.cx + dx) + "," + (chunk.cz + dz)); if (adj) neighbors[dx + "," + dz] = adj.voxels; }
    return meshChunk({ voxels: chunk.voxels, neighbors, size: world.chunkSize, height: world.chunkHeight, cx: chunk.cx, cz: chunk.cz, skipWater });
}

/** flat normals per triangle from the winding; every vertex of a triangle takes it */
export function flatNormals(verts) {
    const n = new Float32Array(verts.length);
    for (let t = 0; t + 8 < verts.length; t += 9) {
        const ax = verts[t], ay = verts[t + 1], az = verts[t + 2], bx = verts[t + 3] - ax, by = verts[t + 4] - ay, bz = verts[t + 5] - az, cx = verts[t + 6] - ax, cy = verts[t + 7] - ay, cz = verts[t + 8] - az;
        let nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        for (let k = 0; k < 9; k += 3) { n[t + k] = nx; n[t + k + 1] = ny; n[t + k + 2] = nz; }
    }
    return n;
}

/** the mesher's RGB per vertex darkened by its AO: colour * (AO_FLOOR + (1 - AO_FLOOR) * ao), alpha 1 */
export function shadedColours(cols, aos, floor = AO_FLOOR) {
    const n = cols.length / 3, out = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) { const a = aos && aos.length > v ? aos[v] : 1, s = floor + (1 - floor) * a; out[v * 4] = cols[v * 3] * s; out[v * 4 + 1] = cols[v * 3 + 1] * s; out[v * 4 + 2] = cols[v * 3 + 2] * s; out[v * 4 + 3] = 1; }
    return out;
}

/** FNV-1a over the packed floats, as a hex string */
export function meshHash(mesh) {
    const u = new Uint8Array(mesh.positions.buffer), c = new Uint8Array(mesh.colors.buffer); let h = 0x811c9dc5;
    for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); }
    for (let i = 0; i < c.length; i++) { h ^= c[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, "0");
}

/** every chunk meshed and concatenated into one lit mesh */
export function meshWorld(world, opts = {}) {
    const parts = [], perChunk = []; let nv = 0, minAo = 1;
    for (const chunk of world.chunks.values()) {
        const m = meshOneChunk(world, chunk, opts), count = m.verts.length / 3;
        if (count === 0) { perChunk.push({ key: chunk.cx + "," + chunk.cz, vertices: 0, triangles: 0 }); continue; }
        for (let i = 0; i < m.aos.length; i++) if (m.aos[i] < minAo) minAo = m.aos[i];
        parts.push(m); perChunk.push({ key: chunk.cx + "," + chunk.cz, vertices: count, triangles: count / 3 }); nv += count;
    }
    const positions = new Float32Array(nv * 3), colors = new Float32Array(nv * 4), normals = new Float32Array(nv * 3), indices = new Uint32Array(nv);
    let o = 0;
    for (const m of parts) {
        const count = m.verts.length / 3, v = m.verts instanceof Float32Array ? m.verts : Float32Array.from(m.verts);
        positions.set(v, o * 3); normals.set(flatNormals(v), o * 3); colors.set(shadedColours(m.cols, m.aos, opts.aoFloor), o * 4);
        o += count;
    }
    for (let i = 0; i < nv; i++) indices[i] = i;
    const mesh = { positions, normals, colors, indices, color: [1, 1, 1, 1] };
    return { mesh, chunks: perChunk.length, meshedChunks: parts.length, vertices: nv, triangles: nv / 3, minAo, hash: meshHash(mesh) };
}

/** the scene: one record at the origin, scale 1, litSphere's pipeline, the sun; G and L are gpuDriven and litSphere (imported by the caller, so a page picks its own paths) */
export function voxelScene(device, packed, G, L, { light = SUN } = {}) {
    const extras = new Float32Array(G.EXTRA_FLOATS);
    return G.makeGpuDrivenScene(device, { lods: [{ name: "only", mesh: packed.mesh }], thresholds: [], records: Float32Array.from([0, 0, 0, 1]), layout: G.LAYOUTS.lit, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(light), headings: extras });
}

/** Amanatides-Woo through the world's voxels: the first solid voxel along o + t d within maxDist, with the face normal it was entered through */
export function raycastVoxels(world, o, d, maxDist = 400) {
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const step = [Math.sign(d[0]) || 1, Math.sign(d[1]) || 1, Math.sign(d[2]) || 1];
    const tDelta = [Math.abs(1 / (d[0] || 1e-12)), Math.abs(1 / (d[1] || 1e-12)), Math.abs(1 / (d[2] || 1e-12))];
    const next = (c, oc, s, dd) => (dd === 0 ? Infinity : ((s > 0 ? c + 1 - oc : oc - c) / Math.abs(dd)));
    const tMax = [next(x, o[0], step[0], d[0]), next(y, o[1], step[1], d[1]), next(z, o[2], step[2], d[2])];
    let t = 0, normal = [0, 0, 0];
    for (let i = 0; i < 4 * maxDist && t <= maxDist; i++) {
        const id = world.voxelAt(x, y, z);
        if (id) return { id, x, y, z, t, normal };
        const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
        t = tMax[a]; tMax[a] += tDelta[a]; normal = [0, 0, 0]; normal[a] = -step[a];
        if (a === 0) x += step[0]; else if (a === 1) y += step[1]; else z += step[2];
        // leave only when the ray is heading AWAY from the world's slab: a ray that starts above it (a camera) walks down into it
        if ((y < 0 && step[1] < 0) || (y >= world.chunkHeight && step[1] > 0)) return null;
    }
    return null;
}

/** the ray through pixel (px, py) of a W x H frame drawn by gpuDriven's perspective(fov, W / H) x lookAt(eye, target) */
export function pixelRay(W, H, fov, eye, target, px, py) {
    const fwd = [target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]], fl = Math.hypot(...fwd); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
    const right = [-fwd[2], 0, fwd[0]], rl = Math.hypot(...right) || 1; right[0] /= rl; right[1] /= rl; right[2] /= rl;
    const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
    const t = Math.tan(fov / 2), sx = (px + 0.5 - W / 2) / (H / 2) * t, sy = -(py + 0.5 - H / 2) / (H / 2) * t;
    const d = [fwd[0] + right[0] * sx + up[0] * sy, fwd[1] + right[1] * sx + up[1] * sy, fwd[2] + right[2] * sx + up[2] * sy], dl = Math.hypot(...d);
    return [d[0] / dl, d[1] / dl, d[2] / dl];
}
