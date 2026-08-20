// =============================================================================
// FILE: /engine/quadricDecimate.js
// ROUND: 197
// =============================================================================
//
// Garland-Heckbert style quadric-error-metric edge-collapse decimation.
//
// For each vertex v, we maintain a 4x4 symmetric quadric matrix Q whose value
// at homogeneous point p = [x,y,z,1] is the sum-of-squared distances from p
// to every plane through any triangle incident to v. Stored as 10 unique
// entries: (m00 m01 m02 m03 m11 m12 m13 m22 m23 m33).
//
// Cost of collapsing edge (v1, v2) to a single vertex v' is min over v' of
// v'^T (Q1 + Q2) v'. The minimizer is solved by setting the gradient to zero:
//     [m00 m01 m02] [x]   [-m03]
//     [m01 m11 m12] [y] = [-m13]
//     [m02 m12 m22] [z]   [-m23]
// Falls back to midpoint when the matrix is singular (degenerate cases —
// vertices on a perfectly flat patch have a singular quadric, midpoint is
// the obvious choice there).
//
// Compared to v191's vertex-cluster decimator:
//   - Preserves silhouettes much better at high reduction (60-80%) — sharp
//     features survive because they have high quadric error and are picked
//     last for collapse.
//   - Output is topologically correct (no degenerate triangles, faces
//     re-routed cleanly through collapse).
//   - More expensive: O(E log E) vs O(N). On a 5000-vert mesh, ~50ms
//     synchronous; split across idle ticks easily.
//
// Designed to be incremental: createQuadricDecimator() returns a runner
// with step(deadline) that yields between bounded chunks of work. The
// idle scheduler calls step() repeatedly until isDone() returns true.
// =============================================================================

// -----------------------------------------------------------------------------
// Min-heap by .cost  (priority queue)
// -----------------------------------------------------------------------------
function heapPush(h, item) {
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
        const p = (i - 1) >> 1;
        if (h[p].cost <= h[i].cost) break;
        const tmp = h[i]; h[i] = h[p]; h[p] = tmp;
        i = p;
    }
}

function heapPop(h) {
    if (h.length === 0) return null;
    const top = h[0];
    const last = h.pop();
    if (h.length > 0) {
        h[0] = last;
        let i = 0;
        const n = h.length;
        while (true) {
            const l = 2 * i + 1, r = 2 * i + 2;
            let s = i;
            if (l < n && h[l].cost < h[s].cost) s = l;
            if (r < n && h[r].cost < h[s].cost) s = r;
            if (s === i) break;
            const tmp = h[i]; h[i] = h[s]; h[s] = tmp;
            i = s;
        }
    }
    return top;
}

// -----------------------------------------------------------------------------
// Add plane Kp = (a,b,c,d) outer-product into vertex's quadric.
// Q stored as 10 floats per vertex (upper-triangular of 4x4 symmetric).
// -----------------------------------------------------------------------------
function _addPlaneToQ(Q, vIdx, a, b, c, d) {
    const o = vIdx * 10;
    Q[o]     += a * a;
    Q[o + 1] += a * b;
    Q[o + 2] += a * c;
    Q[o + 3] += a * d;
    Q[o + 4] += b * b;
    Q[o + 5] += b * c;
    Q[o + 6] += b * d;
    Q[o + 7] += c * c;
    Q[o + 8] += c * d;
    Q[o + 9] += d * d;
}

// -----------------------------------------------------------------------------
// Compute the optimal contraction point + cost for edge (v1, v2).
// Returns { cost, vx, vy, vz }.
// -----------------------------------------------------------------------------
function _computeEdgeCost(ctx, v1, v2) {
    const o1 = v1 * 10, o2 = v2 * 10;
    const q00 = ctx.Q[o1]     + ctx.Q[o2];
    const q01 = ctx.Q[o1 + 1] + ctx.Q[o2 + 1];
    const q02 = ctx.Q[o1 + 2] + ctx.Q[o2 + 2];
    const q03 = ctx.Q[o1 + 3] + ctx.Q[o2 + 3];
    const q11 = ctx.Q[o1 + 4] + ctx.Q[o2 + 4];
    const q12 = ctx.Q[o1 + 5] + ctx.Q[o2 + 5];
    const q13 = ctx.Q[o1 + 6] + ctx.Q[o2 + 6];
    const q22 = ctx.Q[o1 + 7] + ctx.Q[o2 + 7];
    const q23 = ctx.Q[o1 + 8] + ctx.Q[o2 + 8];
    const q33 = ctx.Q[o1 + 9] + ctx.Q[o2 + 9];

    // Cramer's rule on the 3x3 sub-system
    //   [q00 q01 q02] [x]   [-q03]
    //   [q01 q11 q12] [y] = [-q13]
    //   [q02 q12 q22] [z]   [-q23]
    const det = q00 * (q11 * q22 - q12 * q12)
              - q01 * (q01 * q22 - q12 * q02)
              + q02 * (q01 * q12 - q11 * q02);

    let vx, vy, vz;
    if (Math.abs(det) > 1e-12) {
        const b0 = -q03, b1 = -q13, b2 = -q23;
        const detX = b0  * (q11 * q22 - q12 * q12)
                   - q01 * (b1  * q22 - q12 * b2)
                   + q02 * (b1  * q12 - q11 * b2);
        const detY = q00 * (b1  * q22 - q12 * b2)
                   - b0  * (q01 * q22 - q12 * q02)
                   + q02 * (q01 * b2  - b1  * q02);
        const detZ = q00 * (q11 * b2  - b1  * q12)
                   - q01 * (q01 * b2  - b1  * q02)
                   + b0  * (q01 * q12 - q11 * q02);
        vx = detX / det;
        vy = detY / det;
        vz = detZ / det;
    } else {
        // Singular quadric — midpoint of edge endpoints
        vx = (ctx.pos[v1 * 3]     + ctx.pos[v2 * 3])     * 0.5;
        vy = (ctx.pos[v1 * 3 + 1] + ctx.pos[v2 * 3 + 1]) * 0.5;
        vz = (ctx.pos[v1 * 3 + 2] + ctx.pos[v2 * 3 + 2]) * 0.5;
    }

    // Evaluate v'^T Q v' with v' = (vx, vy, vz, 1)
    const cost = q00 * vx * vx + 2 * q01 * vx * vy + 2 * q02 * vx * vz + 2 * q03 * vx
               + q11 * vy * vy + 2 * q12 * vy * vz + 2 * q13 * vy
               + q22 * vz * vz + 2 * q23 * vz
               + q33;
    // Numerical safety — negative cost is theoretically impossible but
    // can drift slightly below zero from floating-point error. Clamp.
    return { cost: Math.max(0, cost), vx, vy, vz };
}

// -----------------------------------------------------------------------------
// Phase 1: walk every triangle, compute its plane, accumulate Kp at each
// of its three vertices. Chunked so we can yield to the idle frame.
// -----------------------------------------------------------------------------
function _stepInit(ctx, deadline) {
    while (ctx.cursor < ctx.T0 && deadline.timeRemaining() > 1.5) {
        const end = Math.min(ctx.cursor + 256, ctx.T0);
        for (let t = ctx.cursor; t < end; t++) {
            const a3 = ctx.idx[t * 3]     * 3;
            const b3 = ctx.idx[t * 3 + 1] * 3;
            const c3 = ctx.idx[t * 3 + 2] * 3;
            const ax = ctx.pos[a3],     ay = ctx.pos[a3 + 1], az = ctx.pos[a3 + 2];
            const bx = ctx.pos[b3],     by = ctx.pos[b3 + 1], bz = ctx.pos[b3 + 2];
            const cx = ctx.pos[c3],     cy = ctx.pos[c3 + 1], cz = ctx.pos[c3 + 2];
            const ex = bx - ax, ey = by - ay, ez = bz - az;
            const fx = cx - ax, fy = cy - ay, fz = cz - az;
            let nx = ey * fz - ez * fy;
            let ny = ez * fx - ex * fz;
            let nz = ex * fy - ey * fx;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
            if (len < 1e-12) continue;
            const inv = 1 / len;
            nx *= inv; ny *= inv; nz *= inv;
            const d = -(nx * ax + ny * ay + nz * az);
            _addPlaneToQ(ctx.Q, ctx.idx[t * 3],     nx, ny, nz, d);
            _addPlaneToQ(ctx.Q, ctx.idx[t * 3 + 1], nx, ny, nz, d);
            _addPlaneToQ(ctx.Q, ctx.idx[t * 3 + 2], nx, ny, nz, d);
        }
        ctx.cursor = end;
    }
    if (ctx.cursor >= ctx.T0) {
        // Build vertex-to-triangle adjacency (used to find neighbors after
        // collapse). Set per vertex; fast add/delete during collapse.
        ctx.vertTris = new Array(ctx.N0);
        for (let i = 0; i < ctx.N0; i++) ctx.vertTris[i] = new Set();
        for (let t = 0; t < ctx.T0; t++) {
            ctx.vertTris[ctx.idx[t * 3]    ].add(t);
            ctx.vertTris[ctx.idx[t * 3 + 1]].add(t);
            ctx.vertTris[ctx.idx[t * 3 + 2]].add(t);
        }
        ctx.phase = "edges";
        ctx.cursor = 0;
        ctx._seenEdges = new Set();
    }
}

// -----------------------------------------------------------------------------
// Phase 2: build initial edge list. Each undirected edge added once with
// initial cost, pushed into the min-heap.
// -----------------------------------------------------------------------------
function _stepEdges(ctx, deadline) {
    const edgeKey = (a, b) => (a < b ? a * 0x100000 + b : b * 0x100000 + a);
    while (ctx.cursor < ctx.T0 && deadline.timeRemaining() > 1.5) {
        const end = Math.min(ctx.cursor + 256, ctx.T0);
        for (let t = ctx.cursor; t < end; t++) {
            const a = ctx.idx[t * 3], b = ctx.idx[t * 3 + 1], c = ctx.idx[t * 3 + 2];
            const pairs = [[a, b], [b, c], [c, a]];
            for (let p = 0; p < 3; p++) {
                const u = pairs[p][0], v = pairs[p][1];
                const k = edgeKey(u, v);
                if (ctx._seenEdges.has(k)) continue;
                ctx._seenEdges.add(k);
                const e = _computeEdgeCost(ctx, u, v);
                heapPush(ctx.heap, { v1: u, v2: v, cost: e.cost, vx: e.vx, vy: e.vy, vz: e.vz });
            }
        }
        ctx.cursor = end;
    }
    if (ctx.cursor >= ctx.T0) {
        ctx._seenEdges = null;      // free memory; not needed after init
        ctx.phase = "collapse";
    }
}

// -----------------------------------------------------------------------------
// Phase 3: greedy edge-collapse. Pop min-cost, re-verify the cost is
// current (lazy invalidation; stale entries get re-pushed at their new
// cost rather than maintained in-place), commit the collapse, and push
// fresh edges for the merged vertex's neighbors.
// -----------------------------------------------------------------------------
function _stepCollapse(ctx, deadline) {
    let collapses = 0;
    while (collapses < ctx.maxCollapsesPerTick
           && ctx.aliveVerts > ctx.targetVerts
           && ctx.heap.length > 0) {
        if (deadline.timeRemaining() < 1) return false;
        const entry = heapPop(ctx.heap);
        const { v1, v2 } = entry;
        if (ctx.removed[v1] || ctx.removed[v2]) continue;

        // Lazy refresh — if our cached cost still matches the current
        // Q sum, commit the collapse. Otherwise re-push with fresh cost.
        const fresh = _computeEdgeCost(ctx, v1, v2);
        const tol = 1e-6 * (Math.abs(entry.cost) + 1);
        if (Math.abs(fresh.cost - entry.cost) > tol) {
            heapPush(ctx.heap, { v1, v2, cost: fresh.cost, vx: fresh.vx, vy: fresh.vy, vz: fresh.vz });
            continue;
        }

        // Commit: move v1 to optimum, merge Q[v2] into Q[v1]
        ctx.pos[v1 * 3]     = fresh.vx;
        ctx.pos[v1 * 3 + 1] = fresh.vy;
        ctx.pos[v1 * 3 + 2] = fresh.vz;
        const o1 = v1 * 10, o2 = v2 * 10;
        for (let i = 0; i < 10; i++) ctx.Q[o1 + i] += ctx.Q[o2 + i];

        // Walk every triangle incident to v2:
        //   - if also incident to v1 (an "edge triangle"): collapse it
        //   - else: re-route v2 → v1
        // Iterate over a snapshot since we mutate the Set during iteration.
        const v2tris = Array.from(ctx.vertTris[v2]);
        for (let i = 0; i < v2tris.length; i++) {
            const t = v2tris[i];
            if (!ctx.triAlive[t]) continue;
            const a = ctx.idx[t * 3], b = ctx.idx[t * 3 + 1], c = ctx.idx[t * 3 + 2];
            const usesV1 = (a === v1) || (b === v1) || (c === v1);
            if (usesV1) {
                ctx.triAlive[t] = 0;
                ctx.vertTris[a].delete(t);
                ctx.vertTris[b].delete(t);
                ctx.vertTris[c].delete(t);
            } else {
                if (a === v2) ctx.idx[t * 3]     = v1;
                if (b === v2) ctx.idx[t * 3 + 1] = v1;
                if (c === v2) ctx.idx[t * 3 + 2] = v1;
                ctx.vertTris[v1].add(t);
                ctx.vertTris[v2].delete(t);
            }
        }

        ctx.removed[v2] = 1;
        ctx.collapsedInto[v2] = v1;      // v3152 -- the link, recorded at the only place that knows it
        ctx.aliveVerts--;
        collapses++;

        // Refresh costs for every edge from v1 to its current neighbors.
        // Lazy: push new entries; old ones get rejected on pop via the
        // freshness check above.
        const neighbors = new Set();
        for (const t of ctx.vertTris[v1]) {
            if (!ctx.triAlive[t]) continue;
            const a = ctx.idx[t * 3], b = ctx.idx[t * 3 + 1], c = ctx.idx[t * 3 + 2];
            if (a !== v1) neighbors.add(a);
            if (b !== v1) neighbors.add(b);
            if (c !== v1) neighbors.add(c);
        }
        for (const n of neighbors) {
            if (ctx.removed[n]) continue;
            const e = _computeEdgeCost(ctx, v1, n);
            heapPush(ctx.heap, { v1, v2: n, cost: e.cost, vx: e.vx, vy: e.vy, vz: e.vz });
        }
    }
    // Done condition
    return ctx.aliveVerts <= ctx.targetVerts || ctx.heap.length === 0;
}

// -----------------------------------------------------------------------------
// Phase 4: compact surviving vertices and triangles into typed arrays.
// -----------------------------------------------------------------------------
function _finalize(ctx) {
    const remap = new Int32Array(ctx.N0).fill(-1);
    let outVerts = 0;
    for (let i = 0; i < ctx.N0; i++) {
        if (!ctx.removed[i] && ctx.vertTris[i].size > 0) {
            remap[i] = outVerts++;
        }
    }
    const outPos = new Float32Array(outVerts * 3);
    for (let i = 0; i < ctx.N0; i++) {
        if (remap[i] >= 0) {
            outPos[remap[i] * 3]     = ctx.pos[i * 3];
            outPos[remap[i] * 3 + 1] = ctx.pos[i * 3 + 1];
            outPos[remap[i] * 3 + 2] = ctx.pos[i * 3 + 2];
        }
    }
    let outTris = 0;
    for (let t = 0; t < ctx.T0; t++) if (ctx.triAlive[t]) outTris++;
    const outIdx = new Uint32Array(outTris * 3);
    let oi = 0;
    for (let t = 0; t < ctx.T0; t++) {
        if (!ctx.triAlive[t]) continue;
        outIdx[oi++] = remap[ctx.idx[t * 3]];
        outIdx[oi++] = remap[ctx.idx[t * 3 + 1]];
        outIdx[oi++] = remap[ctx.idx[t * 3 + 2]];
    }
    // v3152 -- A **TOTAL** FINE-TO-COARSE MAP, WHICH IS THE THING PROLONGATION NEEDS.
    //
    // `remap` above is PARTIAL: it names a coarse index for a surviving vertex and -1 for a collapsed one. That
    // is enough to rewrite the index buffer and useless for carrying data, because the vertices whose data you
    // most need to move ARE the removed ones. Following collapsedInto to a survivor makes it total: EVERY fine
    // vertex names exactly one coarse vertex.
    //
    // *** CHAINS, NOT PAIRS. *** v3 collapses into v2 and later v2 into v1, so a single lookup lands on a
    // vertex that is itself gone. The walk is bounded by N0 and THROWS if it exceeds that rather than looping
    // forever -- a cycle here would be a bug in the collapse bookkeeping, and a hang is the worst way to report
    // one. The bound is not a guess: each step moves to a strictly earlier-removed vertex, so a chain longer
    // than the vertex count is impossible unless the invariant is broken.
    const fineToCoarse = new Int32Array(ctx.N0);
    for (let i = 0; i < ctx.N0; i++) {
        let v = i, hops = 0;
        while (ctx.collapsedInto[v] >= 0) {
            v = ctx.collapsedInto[v];
            if (++hops > ctx.N0) throw new Error("quadricDecimate: collapse chain from vertex " + i + " exceeded " + ctx.N0 + " hops -- the bookkeeping has a cycle");
        }
        // The survivor must have a coarse index. If it does not, a vertex survived the collapse phase and was
        // then dropped by the compaction, which would silently lose data and is worth failing loudly for.
        const c = remap[v];
        if (c < 0) throw new Error("quadricDecimate: vertex " + i + " resolves to survivor " + v + " which has no coarse index");
        fineToCoarse[i] = c;
    }
    ctx.result = {
        positions:   outPos,
        indices:     outIdx,
        vertexCount: outVerts,
        indexCount:  outIdx.length,
        reductionPct: Math.round((1 - outVerts / ctx.N0) * 100),
        // TOTAL: length N0, every entry a valid index into the coarse vertices. This is what lets a caller move
        // a per-vertex signal down, and -- with a count per coarse vertex -- average it rather than let the
        // last writer win.
        fineToCoarse,
    };
}

// -----------------------------------------------------------------------------
// Public: create an incremental decimator. Call step(deadline) repeatedly
// (returns true while more work pending). Read .getResult() once done.
// -----------------------------------------------------------------------------
export function createQuadricDecimator(positions, indices, opts = {}) {
    const targetRatio = opts.targetRatio ?? 0.5;
    const N0 = positions.length / 3;
    const T0 = indices.length / 3;
    const targetVerts = Math.max(8, opts.targetVerts ?? Math.floor(N0 * targetRatio));
    const maxCollapsesPerTick = opts.collapsesPerTick ?? 32;

    const ctx = {
        N0, T0, targetVerts,
        pos:       new Float64Array(positions),
        idx:       new Int32Array(indices),
        Q:         new Float64Array(N0 * 10),
        removed:   new Uint8Array(N0),
        // v3152 -- WHICH VERTEX DID THIS ONE COLLAPSE INTO. `removed` is a FLAG and says only THAT a vertex is
        // gone, never WHERE ITS DATA WENT. Without this, decimating discards every per-vertex signal on the
        // fine mesh -- baked AO, vertex colours, UVs, weights -- silently, and the caller gets a coarse mesh
        // with no way to learn what it lost. -1 means "still alive".
        collapsedInto: new Int32Array(N0).fill(-1),
        triAlive:  new Uint8Array(T0).fill(1),
        vertTris:  null,
        heap:      [],
        aliveVerts: N0,
        phase:     "init",
        cursor:    0,
        maxCollapsesPerTick,
        result:    null,
    };

    return {
        ctx,
        step(deadline) {
            while (deadline.timeRemaining() > 1) {
                if      (ctx.phase === "init")     _stepInit(ctx, deadline);
                else if (ctx.phase === "edges")    _stepEdges(ctx, deadline);
                else if (ctx.phase === "collapse") {
                    const done = _stepCollapse(ctx, deadline);
                    if (done) ctx.phase = "finalize";
                }
                else if (ctx.phase === "finalize") {
                    _finalize(ctx);
                    ctx.phase = "done";
                    return false;
                }
                else if (ctx.phase === "done") return false;
            }
            return ctx.phase !== "done";
        },
        isDone()    { return ctx.phase === "done"; },
        getPhase()  { return ctx.phase; },
        getResult() { return ctx.result; },
    };
}

// -----------------------------------------------------------------------------
// Convenience: synchronous one-shot for tests and small meshes.
// -----------------------------------------------------------------------------
export function quadricDecimateSync(positions, indices, opts = {}) {
    const d = createQuadricDecimator(positions, indices, opts);
    const fake = { timeRemaining: () => 100, didTimeout: false };
    while (d.step(fake)) { /* spin */ }
    return d.getResult();
}
