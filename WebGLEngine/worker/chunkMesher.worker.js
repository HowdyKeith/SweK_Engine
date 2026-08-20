// FILE: worker/chunkMesher.worker.js
// VERSION: v1 - round 43q
//
// Web Worker that runs the greedy mesher off the main thread. Imports
// the pure mesher core via ES module worker syntax (Chrome 80+, Firefox
// 114+, Safari 15+). Spawned by VoxelRenderer with:
//   new Worker("./worker/chunkMesher.worker.js", { type: "module" })
//
// Protocol:
//   IN:  { cmd: "mesh", id, cx, cz, size, height, voxels, neighbors, skipWater }
//   OUT: { id, cx, cz, verts, cols, aos }   (typed arrays, transferred)

import { meshChunk, PALETTE } from "../world/chunkMesherCore.js";
import { meshChunkRLE } from "../voxel/rleChunkMesh.js";   // v2776 - feature-flagged RLE mesher

self.onmessage = (e) => {
    const msg = e.data;
    if (msg.cmd !== "mesh") return;
    const args = {
        voxels:    msg.voxels,
        neighbors: msg.neighbors,
        size:      msg.size,
        height:    msg.height,
        cx:        msg.cx,
        cz:        msg.cz,
        skipWater: msg.skipWater,
    };
    // useRLE flips the whole chunk onto the RLE surface->mesh->AO path (gated equivalent of meshChunk); the
    // default stays the proven greedy mesher so nothing changes unless the flag is set.
    const result = msg.useRLE ? meshChunkRLE({ ...args, palette: msg.palette || PALETTE }) : meshChunk(args);
    // Transfer the underlying ArrayBuffers (zero-copy back to main).
    self.postMessage({
        id: msg.id,
        cx: msg.cx,
        cz: msg.cz,
        verts: result.verts,
        cols:  result.cols,
        aos:   result.aos,
        // Round 54 - stair-step smoothing overlay mesh
        slopeVerts:   result.slopeVerts,
        slopeNormals: result.slopeNormals,
        slopeCols:    result.slopeCols,
    }, [
        result.verts.buffer, result.cols.buffer, result.aos.buffer,
        result.slopeVerts.buffer, result.slopeNormals.buffer, result.slopeCols.buffer,
    ]);
};
