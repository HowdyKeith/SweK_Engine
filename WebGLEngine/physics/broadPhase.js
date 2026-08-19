// WebGLEngine/physics/broadPhase.js — v2637
//
// A broad-phase for many rigid bodies. One voxel body is a box3d rigid body (cover + mass properties + posing); a
// kaiju swarm or an asteroid field is hundreds of them, and checking every pair is O(N^2). This buckets each body's
// world AABB (from voxelPose.worldAABB) into a uniform grid and returns only the pairs that share a cell, so the
// narrow phase runs on a short list instead of all N^2.
//
// THE GUARANTEE that makes a broad-phase safe: it must never MISS a real overlap. And it cannot here, by
// construction -- if two AABBs overlap, the overlap region is non-empty, and any cell containing a point of that
// region is occupied by BOTH bodies (insertion marks every cell an AABB touches). So overlapping bodies always
// share a cell, and pairs() is a superset of the truly-overlapping pairs. A DROPPED PAIR IS A COLLISION THAT
// SILENTLY DOES NOT HAPPEN.
//
// It is deterministic (same inserts -> identical pair list, in sorted order) so it is safe under lockstep.

export class AabbGrid {
    constructor(cellSize = 1) {
        this.cell = cellSize > 0 ? cellSize : 1;
        this.bodies = [];                 // insertion order: { id, aabb }
        this.cells = new Map();           // "cx,cy,cz" -> array of body indices
    }
    clear() { this.bodies.length = 0; this.cells.clear(); }

    _range(aabb) {
        const c = this.cell;
        return [0, 1, 2].map((i) => [Math.floor(aabb.min[i] / c), Math.floor(aabb.max[i] / c)]);
    }
    _forCells(aabb, fn) {
        const [[x0, x1], [y0, y1], [z0, z1]] = this._range(aabb);
        for (let x = x0; x <= x1; x++)
            for (let y = y0; y <= y1; y++)
                for (let z = z0; z <= z1; z++) fn(x + "," + y + "," + z);
    }

    insert(id, aabb) {
        const idx = this.bodies.length;
        this.bodies.push({ id, aabb });
        this._forCells(aabb, (key) => {
            let arr = this.cells.get(key);
            if (!arr) this.cells.set(key, (arr = []));
            arr.push(idx);
        });
        return idx;
    }

    // ids of bodies sharing a cell with `aabb` (broad-phase candidates for that query box), sorted by insertion order
    queryAABB(aabb) {
        const hit = new Set();
        this._forCells(aabb, (key) => { const arr = this.cells.get(key); if (arr) for (const i of arr) hit.add(i); });
        return [...hit].sort((a, b) => a - b).map((i) => this.bodies[i].id);
    }

    // every candidate pair (bodies sharing >= 1 cell), deduped and deterministic. Returns [idA, idB] in insertion order.
    pairs() {
        const seen = new Set();
        const out = [];
        for (const arr of this.cells.values()) {
            for (let a = 0; a < arr.length; a++)
                for (let b = a + 1; b < arr.length; b++) {
                    const i = arr[a], j = arr[b];
                    const lo = i < j ? i : j, hi = i < j ? j : i;   // a pair can share several cells -> dedupe
                    const key = lo * 0x100000000 + hi;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push([lo, hi]);
                }
        }
        out.sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
        return out.map(([i, j]) => [this.bodies[i].id, this.bodies[j].id]);
    }
}

// exact AABB overlap test (the narrow phase confirms a candidate pair)
export function aabbOverlap(a, b) {
    return a.min[0] <= b.max[0] && b.min[0] <= a.max[0]
        && a.min[1] <= b.max[1] && b.min[1] <= a.max[1]
        && a.min[2] <= b.max[2] && b.min[2] <= a.max[2];
}
