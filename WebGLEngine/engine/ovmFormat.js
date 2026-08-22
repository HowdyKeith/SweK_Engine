// FILE: engine/ovmFormat.js
// VERSION: v1 — round 345
//
// .ovm = "O-Voxel Matrix". The binary format for sparse voxel assets
// emitted by a TRELLIS-2 Sparse-Compression VAE interceptor, or by
// any other generator that produces { coords, shape_offsets, PBR }
// triplets.
//
// Why this format exists: TRELLIS-2's internal latent grid is sparse
// (~1-5% of cells are active). Storing it as a dense int8 lattice
// wastes 95%+ of the bytes. A sparse coord list with interleaved
// attributes packs perfectly into one gl.bufferData() upload — no
// CPU-side rearrangement on load.
//
// Binary layout:
//
//   Offset  Type     Field
//   ------  -------  -----------------------------------
//   0-3     uint32   Magic = 0x214D564F ("OVM!" LE)
//   4-7     uint32   Active node count (N)
//   8+      N × 22 bytes:
//             0-5    int16 × 3   Sparse coords (X, Y, Z) — signed for negative-origin grids
//             6-17   f32   × 3   Dual-grid shape offset (Δx, Δy, Δz) in [-0.5, 0.5]
//             18-21  u8    × 4   PBR material: R, G, B, A
//
// Total per-node = 22 bytes. A typical 32K-voxel asset = 720 KB raw,
// no extra compression needed for transport.

export const OVM_MAGIC = 0x214D564F;   // "OVM!" little-endian
export const OVM_HEADER_BYTES = 8;
export const OVM_NODE_BYTES = 22;       // 6 + 12 + 4

/**
 * Encode a sparse voxel asset into the .ovm binary format.
 *
 * @param {object} asset
 *   { count, coords: Int16Array(N*3), offsets: Float32Array(N*3), materials: Uint8Array(N*4) }
 * @returns {ArrayBuffer}
 */
export function encodeOVM(asset) {
    const { count, coords, offsets, materials } = asset;
    if (!Number.isInteger(count) || count < 0) throw new Error("encodeOVM: bad count");
    if (!(coords instanceof Int16Array))     throw new Error("encodeOVM: coords must be Int16Array");
    if (!(offsets instanceof Float32Array))  throw new Error("encodeOVM: offsets must be Float32Array");
    if (!(materials instanceof Uint8Array))  throw new Error("encodeOVM: materials must be Uint8Array");
    if (coords.length    !== count * 3) throw new Error(`encodeOVM: coords length ${coords.length} != ${count * 3}`);
    if (offsets.length   !== count * 3) throw new Error(`encodeOVM: offsets length ${offsets.length} != ${count * 3}`);
    if (materials.length !== count * 4) throw new Error(`encodeOVM: materials length ${materials.length} != ${count * 4}`);
    if (count > 0xFFFFFFFF) throw new Error("encodeOVM: count exceeds uint32");

    const totalBytes = OVM_HEADER_BYTES + count * OVM_NODE_BYTES;
    const buf = new ArrayBuffer(totalBytes);
    const dv  = new DataView(buf);

    // Header
    dv.setUint32(0, OVM_MAGIC, true);
    dv.setUint32(4, count,     true);

    // Interleaved node payload
    let off = OVM_HEADER_BYTES;
    for (let i = 0; i < count; i++) {
        dv.setInt16(off + 0,  coords[i * 3 + 0], true);
        dv.setInt16(off + 2,  coords[i * 3 + 1], true);
        dv.setInt16(off + 4,  coords[i * 3 + 2], true);
        dv.setFloat32(off + 6,  offsets[i * 3 + 0], true);
        dv.setFloat32(off + 10, offsets[i * 3 + 1], true);
        dv.setFloat32(off + 14, offsets[i * 3 + 2], true);
        dv.setUint8(off + 18, materials[i * 4 + 0]);
        dv.setUint8(off + 19, materials[i * 4 + 1]);
        dv.setUint8(off + 20, materials[i * 4 + 2]);
        dv.setUint8(off + 21, materials[i * 4 + 3]);
        off += OVM_NODE_BYTES;
    }
    return buf;
}

/**
 * Decode a .ovm ArrayBuffer back into typed arrays.
 *
 * @param {ArrayBuffer} buf
 * @returns {{ count, coords: Int16Array, offsets: Float32Array, materials: Uint8Array }}
 */
export function decodeOVM(buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < OVM_HEADER_BYTES) {
        throw new Error("decodeOVM: buffer too small for header");
    }
    const dv = new DataView(buf);
    const magic = dv.getUint32(0, true);
    if (magic !== OVM_MAGIC) {
        throw new Error(`decodeOVM: magic mismatch (got 0x${magic.toString(16)}, expected 0x${OVM_MAGIC.toString(16)} = "OVM!")`);
    }
    const count = dv.getUint32(4, true);
    const expected = OVM_HEADER_BYTES + count * OVM_NODE_BYTES;
    if (buf.byteLength < expected) {
        throw new Error(`decodeOVM: payload truncated (have ${buf.byteLength}B, expected ${expected}B for ${count} nodes)`);
    }

    const coords    = new Int16Array(count * 3);
    const offsets   = new Float32Array(count * 3);
    const materials = new Uint8Array(count * 4);

    let off = OVM_HEADER_BYTES;
    for (let i = 0; i < count; i++) {
        coords[i * 3 + 0] = dv.getInt16(off + 0,  true);
        coords[i * 3 + 1] = dv.getInt16(off + 2,  true);
        coords[i * 3 + 2] = dv.getInt16(off + 4,  true);
        offsets[i * 3 + 0] = dv.getFloat32(off + 6,  true);
        offsets[i * 3 + 1] = dv.getFloat32(off + 10, true);
        offsets[i * 3 + 2] = dv.getFloat32(off + 14, true);
        materials[i * 4 + 0] = dv.getUint8(off + 18);
        materials[i * 4 + 1] = dv.getUint8(off + 19);
        materials[i * 4 + 2] = dv.getUint8(off + 20);
        materials[i * 4 + 3] = dv.getUint8(off + 21);
        off += OVM_NODE_BYTES;
    }
    return { count, coords, offsets, materials };
}

/**
 * Compute axis-aligned bounding box over the decoded coords.
 * Used by the demo to center the camera on imported assets.
 */
export function ovmBBox(asset) {
    const { count, coords } = asset;
    if (count === 0) return { min: [0,0,0], max: [0,0,0], center: [0,0,0], size: [0,0,0] };
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
        const x = coords[i * 3 + 0], y = coords[i * 3 + 1], z = coords[i * 3 + 2];
        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    return {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
        size:   [maxX - minX, maxY - minY, maxZ - minZ],
    };
}
