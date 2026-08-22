// voxel/rleWorldBridge.js
//
// Wire-up (v2773): feed a live VoxelWorld chunk through the RLE surface->mesh stack. Two mismatches had to be
// reconciled, and ONE of them is a trap:
//
//   1. DIMENSIONS -- VoxelWorld chunks are cube-ish and small (voxel/voxelworld.js uses size 16); the RLE stack
//      was hardcoded 32x256x32. Fixed by carrying dims on the rle object (encodeRLE stamps them), so the stack is
//      now dimension-agnostic and 32x256x32 stays the default.
//   2. INDEX ORDER (the trap) -- a VoxelWorld chunk stores voxels X-FASTEST: idx = x + y*S + z*S*S. The RLE stack
//      needs Y-FASTEST: (x*sz+z)*sy+y -- that ordering IS the compression premise (tall columns = long runs). So
//      we TRANSCODE the buffer's index order before encoding. A naive "change 32 to 16" would have read the wrong
//      voxels and produced garbage that still looked plausible; the gate pins this by feeding the un-transcoded
//      buffer and showing the surface area diverges.
//
// This does NOT touch the live greedy mesher yet -- it produces a mesh from a VoxelWorld chunk, reconciled and
// gated, so the dispatcher swap (greedyMesh -> rleMesh for RLE-backed chunks) is a verified one-liner, not a
// blind one. Browser-safe: imports only sibling voxel modules.

import { encodeRLE, rleIndex, SOLID_NONZERO } from "./voxelRLE.js";
import { rleMesh } from "./rleMesh.js";

// Transcode a VoxelWorld chunk's X-fastest voxel buffer into a Y-fastest RLE chunk of the same size.
// worldVoxels is length size^3 in x + y*size + z*size*size order. Returns an rle with dims stamped.
export function worldChunkToRLE(worldVoxels, size) {
    const dims = { sx: size, sy: size, sz: size };
    const flat = new Uint8Array(size * size * size);
    for (let x = 0; x < size; x++)
        for (let y = 0; y < size; y++)
            for (let z = 0; z < size; z++)
                flat[rleIndex(x, y, z, dims)] = worldVoxels[x + y * size + z * size * size];
    return encodeRLE(flat, dims);
}

// One call from a VoxelWorld chunk to a drawable mesh {positions, normals, indices}. isSolid(type)->bool
// (default: non-zero is solid). Internal faces only, exactly like the rest of the stack.
export function meshWorldChunk(worldVoxels, size, isSolid = SOLID_NONZERO) {
    const rle = worldChunkToRLE(worldVoxels, size);
    return rleMesh(rle, isSolid);
}

// --- General source-order bridge (v2774) -----------------------------------------------------------
// A world's chunk buffer can be in ANY index order, and the engine uses several. Give the source-order function
// and dims; we transcode into the RLE stack's Y-fastest order. srcIndex(x,y,z,dims) -> flat index in the SOURCE.
export function chunkToRLE(worldVoxels, dims, srcIndex) {
    const flat = new Uint8Array(dims.sx * dims.sy * dims.sz);
    for (let x = 0; x < dims.sx; x++)
        for (let y = 0; y < dims.sy; y++)
            for (let z = 0; z < dims.sz; z++)
                flat[rleIndex(x, y, z, dims)] = worldVoxels[srcIndex(x, y, z, dims)];
    return encodeRLE(flat, dims);
}

// The THREE index orders in the tree (this is the trap #3 hides):
//   world/chunk.js (the REAL engine world): idx = x + sx*z + sx*sz*y   (X, then Z, then Y); sx=sz=chunkSize(16),
//                                                                        sy=chunkHeight(64)
//   voxel/voxelworld.js (a demo):           idx = x + y*sx + z*sx*sy   (X, then Y, then Z)
//   RLE stack (this module):                idx = (x*sz+z)*sy + y      (Y fastest)
export const chunkIndexReal = (x, y, z, d) => x + d.sx * z + d.sx * d.sz * y;
export const chunkIndexVoxelWorld = (x, y, z, d) => x + y * d.sx + z * d.sx * d.sy;

// Mesh a REAL engine chunk (world/chunk.js order, 16x64x16 by default).
export function meshRealChunk(chunkVoxels, sx, sy, sz, isSolid = SOLID_NONZERO) {
    return rleMesh(chunkToRLE(chunkVoxels, { sx, sy, sz }, chunkIndexReal), isSolid);
}
