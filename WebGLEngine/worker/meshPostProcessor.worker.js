// FILE: worker/meshPostProcessor.worker.js
// VERSION: v1 — round 331
//
// CPU worker kernel for opportunistic mesh post-processing. Runs in a
// Web Worker context but ALSO works as a regular ES module so Node can
// import the pure functions for testing.
//
// Operations:
//
//   weld(positions, indices, indexType, epsilon)
//     Deduplicate vertices whose positions hash to the same epsilon-
//     quantized bucket. Returns a new positions array (subset of old)
//     and a remapped index array. Useful for cleaning up exported
//     meshes that split shared corners (e.g. OBJ files where each
//     face declares its own 3 vertices).
//
//   recomputeNormals(positions, indices)
//     Smooth-shade normals via face-normal accumulation. For each
//     triangle, compute the face normal (cross of two edges) and add
//     it to each of the three corner vertices' running normal sum.
//     Normalize each vertex's accumulated normal at the end. The
//     accumulation is area-weighted automatically because the cross
//     product magnitude is proportional to the triangle's area.
//
//   weldAndNormals(positions, indices, indexType, epsilon)
//     Convenience: weld first (so smooth normals share across faces
//     that meet at a corner), then recompute normals on the welded
//     mesh.
//
// Index format: indices may be Uint16 or Uint32. Returned indices
// match the input type. If welding reduces vertex count below 65536
// and the original was Uint32, we keep Uint32 (caller may want type
// stability); we don't downcast.

// ---------- Pure functions (exported for unit testing) ---------------------

export function weld(positions, indices, epsilon = 1e-4) {
    const vCount = positions.length / 3;
    if (vCount === 0) {
        return {
            positions: new Float32Array(0),
            indices: new (indices.constructor)(0),
            originalCount: 0,
            weldedCount: 0,
        };
    }
    // Quantize each vertex to an epsilon-spaced lattice and bucket by
    // the quantized triple. The first vertex landing in each bucket
    // wins the slot; subsequent duplicates remap to that slot.
    const inv = 1 / epsilon;
    const map = new Map();
    const remap = new Int32Array(vCount);
    // Pre-allocate to vCount * 3 floats; we'll truncate after.
    const newPositionsBuf = new Float32Array(vCount * 3);
    let unique = 0;
    for (let i = 0; i < vCount; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        // Math.round gives [-eps/2, eps/2] tolerance in each direction
        const qx = Math.round(x * inv);
        const qy = Math.round(y * inv);
        const qz = Math.round(z * inv);
        // String key is the simplest hash that works correctly for
        // negative coordinates (XOR-based hash needs care with signs).
        // Performance-wise this is acceptable — V8 interns short strings.
        const key = qx + "," + qy + "," + qz;
        const existing = map.get(key);
        if (existing !== undefined) {
            remap[i] = existing;
        } else {
            remap[i] = unique;
            map.set(key, unique);
            newPositionsBuf[unique * 3]     = x;
            newPositionsBuf[unique * 3 + 1] = y;
            newPositionsBuf[unique * 3 + 2] = z;
            unique++;
        }
    }
    // Truncate the positions array to actual unique count
    const newPositions = newPositionsBuf.subarray(0, unique * 3).slice();
    // Remap indices through the lookup table
    const IndexCtor = indices.constructor;
    const newIndices = new IndexCtor(indices.length);
    for (let i = 0; i < indices.length; i++) {
        newIndices[i] = remap[indices[i]];
    }
    return {
        positions: newPositions,
        indices: newIndices,
        // v364 — expose remap so callers can apply the same vertex
        // mapping to companion per-vertex streams (normals, texCoords,
        // colors, joints, weights). Without this the streams would
        // misalign with the welded position array.
        remap,
        originalCount: vCount,
        weldedCount: unique,
    };
}

export function recomputeNormals(positions, indices) {
    const vCount = positions.length / 3;
    const normals = new Float32Array(vCount * 3);
    // Accumulate face normals onto each incident vertex. The cross
    // product is NOT pre-normalized — its magnitude equals twice the
    // triangle's area, which naturally weights bigger faces more
    // heavily. This is the standard smooth-normal algorithm.
    const tCount = (indices.length / 3) | 0;
    for (let t = 0; t < tCount; t++) {
        const i0 = indices[t * 3]     | 0;
        const i1 = indices[t * 3 + 1] | 0;
        const i2 = indices[t * 3 + 2] | 0;
        const ax = positions[i0 * 3];
        const ay = positions[i0 * 3 + 1];
        const az = positions[i0 * 3 + 2];
        const bx = positions[i1 * 3];
        const by = positions[i1 * 3 + 1];
        const bz = positions[i1 * 3 + 2];
        const cx = positions[i2 * 3];
        const cy = positions[i2 * 3 + 1];
        const cz = positions[i2 * 3 + 2];
        // Two edge vectors from vertex 0
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        // Cross product = face normal (un-normalized, magnitude = 2*area)
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        // Accumulate onto each vertex
        normals[i0 * 3]     += nx;
        normals[i0 * 3 + 1] += ny;
        normals[i0 * 3 + 2] += nz;
        normals[i1 * 3]     += nx;
        normals[i1 * 3 + 1] += ny;
        normals[i1 * 3 + 2] += nz;
        normals[i2 * 3]     += nx;
        normals[i2 * 3 + 1] += ny;
        normals[i2 * 3 + 2] += nz;
    }
    // Normalize per-vertex. Vertices touching no triangle stay at (0,0,0)
    // which is a sentinel "no normal" — caller decides what to do.
    for (let i = 0; i < vCount; i++) {
        const x = normals[i * 3];
        const y = normals[i * 3 + 1];
        const z = normals[i * 3 + 2];
        const len = Math.sqrt(x * x + y * y + z * z);
        if (len > 0) {
            const inv = 1 / len;
            normals[i * 3]     = x * inv;
            normals[i * 3 + 1] = y * inv;
            normals[i * 3 + 2] = z * inv;
        }
    }
    return normals;
}

export function weldAndNormals(positions, indices, epsilon = 1e-4) {
    const welded = weld(positions, indices, epsilon);
    const normals = recomputeNormals(welded.positions, welded.indices);
    return {
        positions: welded.positions,
        indices: welded.indices,
        normals,
        originalCount: welded.originalCount,
        weldedCount: welded.weldedCount,
    };
}

/**
 * v357 — Mesh quality control analysis. Pure function, runs in worker.
 *
 * Returns:
 *   triCount:       number of triangles (indices.length / 3)
 *   vertCount:      number of unique vertices
 *   bboxSize:       [w, h, d] axis-aligned bounding box dimensions
 *   surfaceArea:    sum of triangle areas (units²)
 *   avgEdgeLength:  mean edge length across all triangles
 *   watertight:     true iff every edge is shared by exactly 2 triangles
 *   nonManifoldEdges:  count of edges touched by != 2 triangles
 *   smoothness:     average dot product of adjacent face normals (1.0 =
 *                   perfectly smooth, -1.0 = razor-sharp opposing fold).
 *                   Computed over edges that ARE shared by exactly 2
 *                   triangles, so non-manifold edges don't skew the score.
 *   degenerates:    triangle indices with zero area (within epsilon)
 */
export function meshQc(positions, indices) {
    const triCount = (indices.length / 3) | 0;
    const vertCount = (positions.length / 3) | 0;

    // Bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < vertCount; i++) {
        const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    const bboxSize = vertCount === 0
        ? [0, 0, 0]
        : [maxX - minX, maxY - minY, maxZ - minZ];

    // Per-triangle: surface area + face normal + edge collection
    let surfaceArea = 0;
    let edgeLengthSum = 0;
    let edgeCount = 0;
    let degenerates = 0;
    const faceNormals = new Float32Array(triCount * 3);

    // edges Map: "minVidx,maxVidx" → { faces: [triIdx1, triIdx2] }
    const edges = new Map();
    const _addEdge = (va, vb, tri) => {
        const a = Math.min(va, vb), b = Math.max(va, vb);
        const key = a * 0x100000000 + b;   // safe for vertCount < 2^21
        let entry = edges.get(key);
        if (!entry) { entry = { count: 0, faces: [-1, -1] }; edges.set(key, entry); }
        if (entry.count < 2) entry.faces[entry.count] = tri;
        entry.count++;
    };

    for (let t = 0; t < triCount; t++) {
        const i0 = indices[t * 3]     | 0;
        const i1 = indices[t * 3 + 1] | 0;
        const i2 = indices[t * 3 + 2] | 0;
        const ax = positions[i0*3], ay = positions[i0*3+1], az = positions[i0*3+2];
        const bx = positions[i1*3], by = positions[i1*3+1], bz = positions[i1*3+2];
        const cx = positions[i2*3], cy = positions[i2*3+1], cz = positions[i2*3+2];
        // Edge vectors
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
        const e3x = cx - bx, e3y = cy - by, e3z = cz - bz;
        // Cross e1 × e2 → 2× face normal (magnitude = 2× area)
        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;
        const nLen = Math.hypot(nx, ny, nz);
        const area = nLen / 2;
        surfaceArea += area;
        if (area < 1e-12) degenerates++;
        // Normalize face normal (zero-length → leave as zero)
        if (nLen > 1e-20) {
            faceNormals[t * 3]     = nx / nLen;
            faceNormals[t * 3 + 1] = ny / nLen;
            faceNormals[t * 3 + 2] = nz / nLen;
        }
        // Edges
        edgeLengthSum += Math.hypot(e1x, e1y, e1z);
        edgeLengthSum += Math.hypot(e2x, e2y, e2z);
        edgeLengthSum += Math.hypot(e3x, e3y, e3z);
        edgeCount += 3;
        _addEdge(i0, i1, t);
        _addEdge(i1, i2, t);
        _addEdge(i2, i0, t);
    }
    const avgEdgeLength = edgeCount === 0 ? 0 : edgeLengthSum / edgeCount;

    // Watertight + smoothness over manifold edges
    let nonManifoldEdges = 0;
    let smoothSum = 0;
    let smoothPairs = 0;
    for (const entry of edges.values()) {
        if (entry.count !== 2) {
            nonManifoldEdges++;
            continue;
        }
        const f1 = entry.faces[0], f2 = entry.faces[1];
        const dot = faceNormals[f1*3]   * faceNormals[f2*3]
                  + faceNormals[f1*3+1] * faceNormals[f2*3+1]
                  + faceNormals[f1*3+2] * faceNormals[f2*3+2];
        smoothSum += dot;
        smoothPairs++;
    }
    const smoothness = smoothPairs === 0 ? 0 : smoothSum / smoothPairs;
    const watertight = (triCount > 0) && (nonManifoldEdges === 0);

    return {
        triCount,
        vertCount,
        bboxSize,
        surfaceArea,
        avgEdgeLength,
        watertight,
        nonManifoldEdges,
        smoothness,
        degenerates,
    };
}

// ---------- Worker bootstrap (runs only inside a Worker context) -----------
//
// `self` exists in both Worker and DedicatedWorkerGlobalScope. We detect
// Worker context by the absence of `window` and the presence of
// `self.postMessage`. Node imports this file without entering this branch.

if (typeof self !== "undefined" &&
    typeof self.postMessage === "function" &&
    typeof window === "undefined") {

    self.addEventListener("message", (e) => {
        const { id, op, payload } = e.data || {};
        try {
            let result;
            // Reconstruct typed arrays from transferred ArrayBuffers
            const positions = new Float32Array(payload.positionsBuf);
            const IndexCtor = payload.indexType === "uint32" ? Uint32Array : Uint16Array;
            const indices = new IndexCtor(payload.indicesBuf);
            const epsilon = payload.epsilon ?? 1e-4;

            if (op === "weld") {
                result = weld(positions, indices, epsilon);
            } else if (op === "recomputeNormals") {
                const normals = recomputeNormals(positions, indices);
                result = { normals };
            } else if (op === "weldAndNormals") {
                result = weldAndNormals(positions, indices, epsilon);
            } else if (op === "mesh_qc") {
                // v357 — pure analytical result, nothing to transfer back
                const qc = meshQc(positions, indices);
                self.postMessage({ id, ok: true, qc });
                return;
            } else {
                throw new Error(`unknown op: ${op}`);
            }

            // Build transferable response. The new typed arrays' .buffer
            // properties are transferred to avoid copies.
            const response = {
                id,
                ok: true,
                originalCount: result.originalCount ?? positions.length / 3,
                weldedCount: result.weldedCount ?? positions.length / 3,
            };
            const transfer = [];
            if (result.positions) {
                response.positionsBuf = result.positions.buffer;
                response.positionsByteLength = result.positions.byteLength;
                transfer.push(result.positions.buffer);
            }
            if (result.indices) {
                response.indicesBuf = result.indices.buffer;
                response.indicesByteLength = result.indices.byteLength;
                response.indexType = result.indices instanceof Uint32Array ? "uint32" : "uint16";
                transfer.push(result.indices.buffer);
            }
            if (result.normals) {
                response.normalsBuf = result.normals.buffer;
                response.normalsByteLength = result.normals.byteLength;
                transfer.push(result.normals.buffer);
            }
            self.postMessage(response, transfer);
        } catch (err) {
            self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
        }
    });
}
