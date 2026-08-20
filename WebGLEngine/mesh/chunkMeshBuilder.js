// FILE: mesh/chunkMeshBuilder.js
// VERSION: v1 - CONVERT VOXELS → GREEDY QUADS

import { buildGreedyMesh } from "./greedyMesher.js";

export function buildChunkMesh(chunk, size, height) {

    const quads = buildGreedyMesh(chunk, size, height);

    const vertices = [];
    const indices = [];

    let idx = 0;

    for (const q of quads) {

        const x = q.x;
        const y = q.y;
        const z = q.z;

        const w = q.w;
        const h = q.h;

        // ============================================================
        // SIMPLE QUAD (2 TRIANGLES)
        // ============================================================

        vertices.push(
            x,     y, z,
            x + w, y, z,
            x + w, y, z + h,
            x,     y, z + h
        );

        indices.push(
            idx, idx + 1, idx + 2,
            idx, idx + 2, idx + 3
        );

        idx += 4;
    }

    return {
        vertices: new Float32Array(vertices),
        indices: new Uint16Array(indices)
    };
}