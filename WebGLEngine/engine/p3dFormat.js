// FILE: engine/p3dFormat.js
// VERSION: v1 — round 347
//
// .p3d = "Pixal3D" pixel-aligned 3D mesh. Output of the low-VRAM
// Pixal3D Python pipeline described in lastai_finally.txt — explicitly
// tuned for 8GB Pascal cards (GTX 1070 / 1080). Pipeline:
//
//   1. 2D image → pixel back-projection → sparse 3D feature volume
//   2. DiT denoising of sparse voxel latents (float16, CPU offload)
//   3. Marching cubes SDF extraction (forced to CPU to avoid VRAM cascades)
//   4. Output: vertex list + uint16 face indices = .p3d
//
// Format is DIFFERENT from .ovm — instead of sparse voxels with PBR
// material, .p3d is a regular indexed mesh (vertices + triangle indices).
// It's what the Pixal3D pipeline emits AFTER converting voxels to a mesh.
//
// Binary layout:
//
//   Offset  Type     Field
//   ------  -------  -----------------------------------
//   0-3     uint32   Magic = 0x21443350 ("P3D!" LE)
//   4-7     uint32   Vertex count (V)
//   8-11    uint32   Face count (F)
//   12+     V × 12 bytes:  float32 × 3  (X, Y, Z)
//   12+V*12: F × 6 bytes:  uint16 × 3   (i0, i1, i2)
//
// Why uint16 indices: tight on file size and matches Pascal GPU's
// preference for u16 index buffers. Mesh capacity = 65,535 unique
// verts per submesh — enough for most Pixal3D outputs.

export const P3D_MAGIC = 0x21443350;   // "P3D!" little-endian
export const P3D_HEADER_BYTES = 12;

/**
 * Encode a mesh into the .p3d binary format.
 *
 * @param {{ vertices: Float32Array, indices: Uint16Array }} mesh
 *   vertices.length must be a multiple of 3 (XYZ).
 *   indices.length must be a multiple of 3 (triangles).
 * @returns {ArrayBuffer}
 */
export function encodeP3D(mesh) {
    const { vertices, indices } = mesh;
    if (!(vertices instanceof Float32Array)) throw new Error("encodeP3D: vertices must be Float32Array");
    if (!(indices  instanceof Uint16Array))  throw new Error("encodeP3D: indices must be Uint16Array");
    if (vertices.length % 3 !== 0)            throw new Error(`encodeP3D: vertices.length ${vertices.length} not multiple of 3`);
    if (indices.length  % 3 !== 0)            throw new Error(`encodeP3D: indices.length ${indices.length} not multiple of 3`);

    const numVerts = vertices.length / 3;
    const numFaces = indices.length / 3;
    if (numVerts > 0xFFFF) throw new Error(`encodeP3D: ${numVerts} verts exceeds uint16 index range (65535)`);

    const vertBytes = vertices.length * 4;
    const idxBytes  = indices.length * 2;
    const total = P3D_HEADER_BYTES + vertBytes + idxBytes;
    const buf = new ArrayBuffer(total);
    const dv  = new DataView(buf);

    dv.setUint32(0, P3D_MAGIC, true);
    dv.setUint32(4, numVerts,   true);
    dv.setUint32(8, numFaces,   true);

    // Copy raw float32/uint16 buffers in one shot — typed-array byte order
    // is platform-native, but on every system we care about (x86, ARM, M1)
    // that's little-endian, matching the format spec.
    new Float32Array(buf, P3D_HEADER_BYTES, vertices.length).set(vertices);
    new Uint16Array(buf,  P3D_HEADER_BYTES + vertBytes, indices.length).set(indices);

    return buf;
}

/**
 * Decode a .p3d ArrayBuffer back into a mesh struct.
 * Returns {vertices, indices, numVerts, numFaces} where vertices is a
 * COPY (safe to mutate) and indices is a fresh Uint16Array.
 */
export function decodeP3D(buf) {
    if (!(buf instanceof ArrayBuffer) || buf.byteLength < P3D_HEADER_BYTES) {
        throw new Error("decodeP3D: buffer too small for header");
    }
    const dv = new DataView(buf);
    const magic = dv.getUint32(0, true);
    if (magic !== P3D_MAGIC) {
        throw new Error(`decodeP3D: magic mismatch (got 0x${magic.toString(16)}, expected 0x${P3D_MAGIC.toString(16)} = "P3D!")`);
    }
    const numVerts = dv.getUint32(4, true);
    const numFaces = dv.getUint32(8, true);
    const expectedLen = P3D_HEADER_BYTES + numVerts * 12 + numFaces * 6;
    if (buf.byteLength < expectedLen) {
        throw new Error(`decodeP3D: payload truncated (have ${buf.byteLength}B, expected ${expectedLen}B for ${numVerts}v/${numFaces}f)`);
    }

    // Copy out (don't keep a typed-array view that holds the original
    // buffer reference — the caller may free it)
    const vertices = new Float32Array(numVerts * 3);
    vertices.set(new Float32Array(buf, P3D_HEADER_BYTES, numVerts * 3));
    const indices = new Uint16Array(numFaces * 3);
    indices.set(new Uint16Array(buf, P3D_HEADER_BYTES + numVerts * 12, numFaces * 3));

    return { vertices, indices, numVerts, numFaces };
}

/** Bounding box of a mesh. Returns { min, max, center, size } as 3-tuples. */
export function p3dBBox(mesh) {
    const v = mesh.vertices;
    if (v.length === 0) return { min: [0,0,0], max: [0,0,0], center: [0,0,0], size: [0,0,0] };
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < v.length; i += 3) {
        if (v[i]   < minX) minX = v[i];
        if (v[i+1] < minY) minY = v[i+1];
        if (v[i+2] < minZ) minZ = v[i+2];
        if (v[i]   > maxX) maxX = v[i];
        if (v[i+1] > maxY) maxY = v[i+1];
        if (v[i+2] > maxZ) maxZ = v[i+2];
    }
    return {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
        size:   [maxX - minX, maxY - minY, maxZ - minZ],
    };
}

/**
 * Compute smoothed per-vertex normals from triangle areas. Used when a
 * .p3d mesh arrives without normals (the format intentionally omits them
 * to stay tiny). Each vert's normal is the area-weighted average of its
 * adjacent triangle face normals.
 */
export function computeMeshNormals(vertices, indices) {
    const numVerts = vertices.length / 3;
    const normals = new Float32Array(vertices.length);
    for (let f = 0; f < indices.length; f += 3) {
        const i0 = indices[f] * 3, i1 = indices[f+1] * 3, i2 = indices[f+2] * 3;
        const ax = vertices[i1]   - vertices[i0];
        const ay = vertices[i1+1] - vertices[i0+1];
        const az = vertices[i1+2] - vertices[i0+2];
        const bx = vertices[i2]   - vertices[i0];
        const by = vertices[i2+1] - vertices[i0+1];
        const bz = vertices[i2+2] - vertices[i0+2];
        // Cross product = face normal × 2*triangle area
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        // Accumulate weighted by triangle area (built into the unnormalized cross)
        for (const i of [i0, i1, i2]) {
            normals[i]   += nx;
            normals[i+1] += ny;
            normals[i+2] += nz;
        }
    }
    // Normalize each vertex normal
    for (let i = 0; i < numVerts; i++) {
        const nx = normals[i*3], ny = normals[i*3+1], nz = normals[i*3+2];
        const len = Math.hypot(nx, ny, nz) || 1;
        normals[i*3]   = nx / len;
        normals[i*3+1] = ny / len;
        normals[i*3+2] = nz / len;
    }
    return normals;
}
