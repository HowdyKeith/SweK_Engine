// =============================================================================
// FILE: /engine/meshPostProcess.js
// ROUND: 196
// =============================================================================
//
// Pure-JS mesh post-processing passes. Three operations, each independently
// usable, each cheap enough to run on the idle CPU scheduler. Designed for
// cleaning up Trellis-generated meshes (and any other generated geometry)
// without GPU or external dependencies.
//
//   laplacianSmooth(positions, indices, opts)
//     Move each vertex toward the centroid of its 1-ring neighbors. Smooths
//     out voxel-step artifacts and high-frequency noise from generative
//     models. Repeatable; default 3 iterations at lambda=0.5. Boundary
//     vertices stay anchored unless opts.smoothBoundary is true.
//
//   recomputeNormals(positions, indices)
//     Vertex normals as area-weighted averages of incident face normals.
//     Crucial after Laplacian smoothing, which moves geometry but doesn't
//     touch normals — un-recomputed meshes look like a smooth surface
//     with faceted lighting otherwise.
//
//   fillSingleTriangleHoles(positions, indices)
//     Detects single-triangle holes (3 boundary edges sharing 3 vertices
//     in a cycle) and adds a triangle to close each. Won't try to fix
//     larger gaps — those need real ear-clipping which is a separate
//     project. Returns the new index buffer; positions unchanged.
//
// All three are deterministic, idempotent in a sensible way (running
// recomputeNormals twice gives the same result; running laplacianSmooth
// twice doubles the smoothing — that's expected), and don't allocate
// surprise garbage in the hot loop.
//
// Inputs:
//   positions: Float32Array of length 3N (xyz per vertex)
//   indices:   Uint16Array | Uint32Array of length 3T (3 indices per tri)
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Laplacian smoothing — uniform 1-ring averaging
// -----------------------------------------------------------------------------
//
// For each vertex v, new_v = v + lambda * (centroid_of_neighbors(v) - v).
// Repeat for `iterations` passes. Conservative defaults (lambda=0.5, 3
// iters) won't over-smooth; sharp features survive reasonably well. For
// stronger smoothing, increase iterations rather than lambda — lambda > 0.7
// can flip facets on noisy input.
//
// Boundary detection: a vertex is on the boundary if any of its incident
// edges is used by only one triangle. Boundary vertices stay fixed by
// default — this preserves the silhouette of open meshes (Trellis output
// is technically watertight, but the same code works for both).
//
export function laplacianSmooth(positions, indices, opts = {}) {
    const iterations     = opts.iterations     ?? 3;
    const lambda         = opts.lambda         ?? 0.5;
    const smoothBoundary = opts.smoothBoundary ?? false;
    const N = positions.length / 3;

    // Adjacency: vertex → Set of neighbor vertex indices. Use plain arrays
    // of typed arrays to avoid per-vertex Map allocation.
    const adjStart = new Uint32Array(N + 1);
    const tempAdj  = new Array(N);
    for (let i = 0; i < N; i++) tempAdj[i] = new Set();

    // Edge-count tracker for boundary detection: undirected edge → triangle count
    const edgeKey = (a, b) => (a < b ? a * 0x100000 + b : b * 0x100000 + a);
    const edgeCount = new Map();
    const incEdge = (a, b) => {
        const k = edgeKey(a, b);
        edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
    };
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i], b = indices[i + 1], c = indices[i + 2];
        tempAdj[a].add(b); tempAdj[a].add(c);
        tempAdj[b].add(a); tempAdj[b].add(c);
        tempAdj[c].add(a); tempAdj[c].add(b);
        incEdge(a, b); incEdge(b, c); incEdge(c, a);
    }

    // Flatten adjacency to a CSR-style typed buffer for cache-friendly access
    let total = 0;
    for (let i = 0; i < N; i++) {
        adjStart[i] = total;
        total += tempAdj[i].size;
    }
    adjStart[N] = total;
    const adjList = new Uint32Array(total);
    let cursor = 0;
    for (let i = 0; i < N; i++) {
        for (const n of tempAdj[i]) adjList[cursor++] = n;
    }

    // Boundary vertex mask
    const isBoundary = new Uint8Array(N);
    if (!smoothBoundary) {
        for (const [k, count] of edgeCount) {
            if (count === 1) {
                const a = Math.floor(k / 0x100000);
                const b = k % 0x100000;
                isBoundary[a] = 1;
                isBoundary[b] = 1;
            }
        }
    }

    // Two buffers, ping-pong between iterations
    let pos  = new Float32Array(positions);
    const tmp = new Float32Array(positions.length);

    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < N; i++) {
            const o3 = i * 3;
            if (isBoundary[i]) {
                tmp[o3]     = pos[o3];
                tmp[o3 + 1] = pos[o3 + 1];
                tmp[o3 + 2] = pos[o3 + 2];
                continue;
            }
            const start = adjStart[i];
            const end   = adjStart[i + 1];
            const k = end - start;
            if (k === 0) {
                tmp[o3]     = pos[o3];
                tmp[o3 + 1] = pos[o3 + 1];
                tmp[o3 + 2] = pos[o3 + 2];
                continue;
            }
            let sx = 0, sy = 0, sz = 0;
            for (let j = start; j < end; j++) {
                const n3 = adjList[j] * 3;
                sx += pos[n3]; sy += pos[n3 + 1]; sz += pos[n3 + 2];
            }
            const inv = 1 / k;
            const ax = sx * inv, ay = sy * inv, az = sz * inv;
            tmp[o3]     = pos[o3]     + lambda * (ax - pos[o3]);
            tmp[o3 + 1] = pos[o3 + 1] + lambda * (ay - pos[o3 + 1]);
            tmp[o3 + 2] = pos[o3 + 2] + lambda * (az - pos[o3 + 2]);
        }
        pos.set(tmp);
    }
    return pos;
}

// -----------------------------------------------------------------------------
// 2. Recompute vertex normals (area-weighted face normals → vertex average)
// -----------------------------------------------------------------------------
//
// Standard algorithm. Each triangle has a face normal whose magnitude
// equals twice the triangle's area (cross product of two edges). Summing
// these per vertex and normalizing produces area-weighted vertex normals,
// which give the best visual smoothness for most meshes. Hard-edge
// preservation (split normals at sharp creases) is intentionally NOT
// done here — it'd require splitting the vertex buffer, and Trellis
// outputs are mostly smooth surfaces where this isn't needed.
//
export function recomputeNormals(positions, indices) {
    const N = positions.length / 3;
    const normals = new Float32Array(N * 3);

    for (let i = 0; i < indices.length; i += 3) {
        const ai = indices[i] * 3, bi = indices[i + 1] * 3, ci = indices[i + 2] * 3;
        const ax = positions[ai],     ay = positions[ai + 1], az = positions[ai + 2];
        const bx = positions[bi],     by = positions[bi + 1], bz = positions[bi + 2];
        const cx = positions[ci],     cy = positions[ci + 1], cz = positions[ci + 2];
        // Two edges out of vertex a
        const ex = bx - ax, ey = by - ay, ez = bz - az;
        const fx = cx - ax, fy = cy - ay, fz = cz - az;
        // Cross product = face normal × 2*area
        const nx = ey * fz - ez * fy;
        const ny = ez * fx - ex * fz;
        const nz = ex * fy - ey * fx;
        normals[ai]     += nx; normals[ai + 1] += ny; normals[ai + 2] += nz;
        normals[bi]     += nx; normals[bi + 1] += ny; normals[bi + 2] += nz;
        normals[ci]     += nx; normals[ci + 1] += ny; normals[ci + 2] += nz;
    }

    // Normalize
    for (let i = 0; i < N; i++) {
        const o = i * 3;
        const x = normals[o], y = normals[o + 1], z = normals[o + 2];
        const len = Math.sqrt(x * x + y * y + z * z);
        if (len > 1e-9) {
            const inv = 1 / len;
            normals[o]     = x * inv;
            normals[o + 1] = y * inv;
            normals[o + 2] = z * inv;
        }
    }
    return normals;
}

// -----------------------------------------------------------------------------
// 3. Fill single-triangle holes
// -----------------------------------------------------------------------------
//
// Detects holes that are exactly 3 vertices in a cycle (i.e., one missing
// triangle) and adds a triangle to close each. Algorithm:
//
//   1. Count undirected edges. Boundary edges have count == 1.
//   2. For each vertex incident to boundary edges, list its boundary
//      neighbors. A vertex on a single-triangle hole has exactly 2
//      boundary neighbors.
//   3. For a candidate triangle (a, b, c), verify all three pairwise
//      edges are boundary edges and that triangle isn't already in the
//      index buffer.
//   4. Add the new triangle. Winding picked to match adjacent faces by
//      flipping if needed (heuristic: opposite of the existing face's
//      orientation on the shared edge).
//
// Larger holes are reported via the returned `unfilled` count but not
// filled — that needs real ear-clipping over an arbitrary closed loop,
// which is a separate concern. For Trellis output, the dominant hole
// type after hole-fill is single-triangle (the sparse-structure decoder
// occasionally drops a single tri).
//
// Returns: { indices, addedTriangles, unfilledHoles }
//
export function fillSingleTriangleHoles(positions, indices) {
    // Edge-count + per-edge sample triangle for winding lookup
    // edgeKey -> { count, sampleTriOff, sampleEdgeAB:[a,b] in tri order }
    const edgeMap = new Map();
    const edgeKey = (a, b) => (a < b ? a * 0x100000 + b : b * 0x100000 + a);

    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        const tri = [[a, b], [b, c], [c, a]];
        for (const [u, v] of tri) {
            const k = edgeKey(u, v);
            const entry = edgeMap.get(k);
            if (entry) {
                entry.count++;
            } else {
                edgeMap.set(k, { count: 1, triOff: t, dirA: u, dirB: v });
            }
        }
    }

    // Per-vertex list of boundary neighbors
    const vertBoundaryNeighbors = new Map();
    const addNeighbor = (a, b) => {
        if (!vertBoundaryNeighbors.has(a)) vertBoundaryNeighbors.set(a, []);
        vertBoundaryNeighbors.get(a).push(b);
    };
    for (const [k, e] of edgeMap) {
        if (e.count !== 1) continue;
        const a = Math.floor(k / 0x100000);
        const b = k % 0x100000;
        addNeighbor(a, b);
        addNeighbor(b, a);
    }

    // Find single-triangle holes: a vertex with exactly 2 boundary
    // neighbors whose neighbors are themselves connected via a third
    // boundary edge — forms a 3-cycle.
    const existingTri = new Set();
    for (let t = 0; t < indices.length; t += 3) {
        const sorted = [indices[t], indices[t + 1], indices[t + 2]].sort((a, b) => a - b);
        existingTri.add(`${sorted[0]},${sorted[1]},${sorted[2]}`);
    }

    const newTris = [];
    const addedTriKey = new Set();
    let unfilled = 0;

    for (const [a, neighbors] of vertBoundaryNeighbors) {
        if (neighbors.length !== 2) {
            // Vertex sits on a larger loop or a non-manifold edge;
            // count it once toward unfilled and move on
            if (neighbors.length > 2) unfilled++;
            continue;
        }
        const b = neighbors[0], c = neighbors[1];
        // Check that b–c is also a boundary edge
        const bcEntry = edgeMap.get(edgeKey(b, c));
        if (!bcEntry || bcEntry.count !== 1) continue;

        // Dedup so we don't add the same triangle from each vertex's perspective
        const sorted = [a, b, c].sort((x, y) => x - y);
        const sig = `${sorted[0]},${sorted[1]},${sorted[2]}`;
        if (existingTri.has(sig) || addedTriKey.has(sig)) continue;
        addedTriKey.add(sig);

        // Winding: find the existing triangle on edge (a, b) and flip
        // ours opposite. The shared edge in the existing tri goes a→b
        // (dirA→dirB); ours should go b→a to be consistent.
        const abEntry = edgeMap.get(edgeKey(a, b));
        let ia, ib, ic;
        if (abEntry.dirA === a && abEntry.dirB === b) {
            // Existing has a→b; we want b→a in our new triangle
            ia = b; ib = a; ic = c;
        } else {
            ia = a; ib = b; ic = c;
        }
        newTris.push(ia, ib, ic);
    }

    // Build new index buffer (only if we added something)
    if (newTris.length === 0) {
        return { indices, addedTriangles: 0, unfilledHoles: unfilled };
    }
    const TyArr = indices.constructor;       // preserve Uint16/Uint32 type
    const out = new TyArr(indices.length + newTris.length);
    out.set(indices, 0);
    for (let i = 0; i < newTris.length; i++) out[indices.length + i] = newTris[i];
    return { indices: out, addedTriangles: newTris.length / 3, unfilledHoles: unfilled };
}

// -----------------------------------------------------------------------------
// Convenience: full post-process pipeline in one call (used by tests / one-shot)
// -----------------------------------------------------------------------------
//
// Order matters: hole-fill first (so new tris are reflected in adjacency
// for smoothing), then smooth (geometry change), then normals (must follow
// any geometry change). The idle-scheduler task runs these same three
// passes incrementally; this helper just does it eagerly for tests.
//
export function postProcessMesh(positions, indices, opts = {}) {
    const holeFill = opts.holeFill !== false;
    const smooth   = opts.smooth   !== false;
    const normals  = opts.normals  !== false;

    let outIdx = indices;
    let addedTris = 0, unfilled = 0;
    if (holeFill) {
        const r = fillSingleTriangleHoles(positions, indices);
        outIdx = r.indices;
        addedTris = r.addedTriangles;
        unfilled  = r.unfilledHoles;
    }

    let outPos = positions;
    if (smooth) {
        outPos = laplacianSmooth(positions, outIdx, opts.smoothOpts || {});
    }

    let outNormals = null;
    if (normals) {
        outNormals = recomputeNormals(outPos, outIdx);
    }
    return {
        positions: outPos,
        indices:   outIdx,
        normals:   outNormals,
        addedTriangles: addedTris,
        unfilledHoles:  unfilled,
    };
}
