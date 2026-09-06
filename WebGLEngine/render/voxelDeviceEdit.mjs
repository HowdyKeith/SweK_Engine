// WebGLEngine/render/voxelDeviceEdit.mjs -- v4518 (Sandbox on the device, round 2: dig and build)
//
// *** A VOXEL CHANGES, ONE CHUNK'S SLOT IS REWRITTEN, NOTHING ELSE MOVES. *** Round 1 (render/voxelDevice.mjs) packed the
// whole world as one mesh and one record, and said per-chunk updates were the next round. This is it. The world mesh is
// still ONE vertex buffer, but every chunk owns a SLOT in it: its vertex count rounded up with headroom (a multiple of 3, at
// least MIN_SLOT), the unused tail zeroed -- a zero triangle has no area and draws nothing -- so the draw's index count is
// the buffer's capacity and never changes. An edit re-meshes the touched chunk, and every neighbour chunk within one voxel
// of the edit (a face at the seam and the corner AO both read the neighbour's buffer), interleaves each in the layout
// gpuDriven packed (p3, colour4, n3: 40 bytes a vertex), writes the slot through the scene's own vertex buffer and clears
// the tail. A chunk that outgrows its slot is the one case that repacks the world, and it is reported, not hidden.
//
//   packSlots(world, opts)                the padded mesh plus the slot table and the interleaved vertexData the gate holds
//   affectedChunks(world, x, z)           the chunk keys an edit at (x, z) can change: its own, and neighbours within 1 voxel
//   interleave(m, out, offsetVerts)       a meshChunk result into the interleaved layout at a vertex offset (the pack's twin)
//   editVoxel(state, x, y, z, id)         setVoxel, re-mesh the affected chunks, write their slots; { chunks, rebuilt, ms }
//   pickVoxel(world, cam, px, py)         the voxel under a pixel: raycastVoxels along pixelRay
//   digAt / buildAt(state, hit, id)       the two edits the sandbox makes: the hit voxel to air; the voxel across the hit face
//   editScene(device, state, G, L)        the scene over the padded mesh; keeps the device buffer on the state for the writes
"use strict";
import { meshOneChunk, flatNormals, shadedColours, raycastVoxels, pixelRay, SUN, meshHash } from "./voxelDevice.mjs";

export const MIN_SLOT = 256;                // vertices, a multiple of 3 is applied after
export const SLOT_HEADROOM = 0.25;          // a quarter more than the chunk needs today
export const FLOATS = 10;                   // p3 + colour4 + n3, gpuDriven's LAYOUTS.lit interleaving
export const STRIDE = FLOATS * 4;

export const GROW_HEADROOM = 1.0;           // a chunk that overflowed its slot is being edited: give it double, not a quarter, so the next edit does not repack again
export function slotCap(count, { minSlot = MIN_SLOT, headroom = SLOT_HEADROOM } = {}) { const want = Math.max(minSlot, Math.ceil(count * (1 + headroom))); return Math.ceil(want / 3) * 3; }

/** a meshChunk result written into `out` (interleaved floats) from vertex `at`; returns the vertex count */
export function interleave(m, out, at, aoFloor) {
    const v = m.verts instanceof Float32Array ? m.verts : Float32Array.from(m.verts), n = flatNormals(v), c = shadedColours(m.cols, m.aos, aoFloor), count = v.length / 3;
    for (let i = 0; i < count; i++) { const o = (at + i) * FLOATS; out[o] = v[i * 3]; out[o + 1] = v[i * 3 + 1]; out[o + 2] = v[i * 3 + 2]; out[o + 3] = c[i * 4]; out[o + 4] = c[i * 4 + 1]; out[o + 5] = c[i * 4 + 2]; out[o + 6] = c[i * 4 + 3]; out[o + 7] = n[i * 3]; out[o + 8] = n[i * 3 + 1]; out[o + 9] = n[i * 3 + 2]; }
    return count;
}

/** every chunk meshed into its slot: { vertexData, capacity, slots, mesh } -- `mesh` is what gpuDriven packs (positions/colors/normals split back out) */
export function packSlots(world, opts = {}) {
    const meshes = new Map(); let capacity = 0; const slots = new Map();
    for (const chunk of world.chunks.values()) { const key = chunk._key || chunk.cx + "," + chunk.cz, m = meshOneChunk(world, chunk, opts), count = m.verts.length / 3, cap = slotCap(count, opts.grow === key ? { ...opts, headroom: GROW_HEADROOM } : opts); meshes.set(chunk._key || chunk.cx + "," + chunk.cz, m); slots.set(chunk._key || chunk.cx + "," + chunk.cz, { offset: capacity, cap, count }); capacity += cap; }
    const vertexData = new Float32Array(capacity * FLOATS);
    for (const [key, s] of slots) interleave(meshes.get(key), vertexData, s.offset, opts.aoFloor);
    return { vertexData, capacity, slots, mesh: splitMesh(vertexData, capacity), triangles: capacity / 3, used: [...slots.values()].reduce((a, s) => a + s.count, 0) };
}

/** the interleaved data back into the arrays gpuDriven's packMeshes reads (it re-interleaves them identically) */
export function splitMesh(vertexData, capacity) {
    const positions = new Float32Array(capacity * 3), colors = new Float32Array(capacity * 4), normals = new Float32Array(capacity * 3), indices = new Uint32Array(capacity);
    for (let i = 0; i < capacity; i++) { const o = i * FLOATS; positions[i * 3] = vertexData[o]; positions[i * 3 + 1] = vertexData[o + 1]; positions[i * 3 + 2] = vertexData[o + 2]; colors[i * 4] = vertexData[o + 3]; colors[i * 4 + 1] = vertexData[o + 4]; colors[i * 4 + 2] = vertexData[o + 5]; colors[i * 4 + 3] = vertexData[o + 6]; normals[i * 3] = vertexData[o + 7]; normals[i * 3 + 1] = vertexData[o + 8]; normals[i * 3 + 2] = vertexData[o + 9]; indices[i] = i; }
    return { positions, colors, normals, indices, color: [1, 1, 1, 1] };
}

/** the chunk keys an edit at world (x, z) can change */
export function affectedChunks(world, x, z) {
    const S = world.chunkSize, keys = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const cx = Math.floor((x + dx) / S), cz = Math.floor((z + dz) / S); if (world.chunks.has(cx + "," + cz)) keys.add(cx + "," + cz); }
    return [...keys];
}

/** the editable state: the world, its packed slots, and (once a scene exists) the device buffer */
export function editState(world, opts = {}) { const packed = packSlots(world, opts); return { world, opts, ...packed, vbuf: null, writes: 0, rebuilds: 0 }; }

export function editVoxel(state, x, y, z, id) {
    const t0 = Date.now(), { world } = state;
    if (y < 0 || y >= world.chunkHeight) return { chunks: [], rebuilt: false, ms: 0, refused: "outside the world's height" };
    if (world.voxelAt(x, y, z) === id) return { chunks: [], rebuilt: false, ms: 0, refused: "no change" };
    world.setVoxel(x, y, z, id);
    const keys = affectedChunks(world, x, z), written = [];
    for (const key of keys) {
        const chunk = world.chunks.get(key), slot = state.slots.get(key), m = meshOneChunk(world, chunk, state.opts), count = m.verts.length / 3;
        if (count > slot.cap) { const p = packSlots(world, { ...state.opts, grow: key }); Object.assign(state, p); state.rebuilds++; if (state.vbuf) state.vbuf.write(state.vertexData, 0); return { chunks: keys, rebuilt: true, overflow: key, ms: Date.now() - t0 }; }
        interleave(m, state.vertexData, slot.offset, state.opts.aoFloor);
        state.vertexData.fill(0, (slot.offset + count) * FLOATS, (slot.offset + slot.cap) * FLOATS);   // the tail: zero triangles draw nothing
        slot.count = count;
        if (state.vbuf) state.vbuf.write(state.vertexData.subarray(slot.offset * FLOATS, (slot.offset + slot.cap) * FLOATS), slot.offset * STRIDE);
        written.push(key); state.writes++;
    }
    state.used = [...state.slots.values()].reduce((a, s) => a + s.count, 0);
    return { chunks: written, rebuilt: false, ms: Date.now() - t0 };
}

export function pickVoxel(world, { W, H, fov, eye, target }, px, py, maxDist = 400) { return raycastVoxels(world, eye, pixelRay(W, H, fov, eye, target, px, py), maxDist); }
export function digAt(state, hit) { return hit ? editVoxel(state, hit.x, hit.y, hit.z, 0) : { chunks: [], rebuilt: false, ms: 0, refused: "no voxel under the pointer" }; }
export function buildAt(state, hit, id = 1) { return hit ? editVoxel(state, hit.x + hit.normal[0], hit.y + hit.normal[1], hit.z + hit.normal[2], id) : { chunks: [], rebuilt: false, ms: 0, refused: "no voxel under the pointer" }; }

/** the scene over the padded mesh; the fleet's vertex buffer is kept for the slot writes */
export function editScene(device, state, G, L, { light = SUN } = {}) {
    const extras = new Float32Array(G.EXTRA_FLOATS);
    const sc = G.makeGpuDrivenScene(device, { lods: [{ name: "only", mesh: state.mesh }], thresholds: [], records: Float32Array.from([0, 0, 0, 1]), layout: G.LAYOUTS.lit, pipeline: L.litPipelineDesc({ cull: "none" }), bind: L.litBind(light), headings: extras });
    if (sc.fleets[0].stride !== STRIDE) throw new Error(`voxelDeviceEdit: gpuDriven packed the lit layout at ${sc.fleets[0].stride} bytes a vertex, this module writes ${STRIDE}`);
    state.vbuf = sc.fleets[0].vbuf; state.scene = sc;
    return sc;
}
export { meshHash };
