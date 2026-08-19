// FILE: simulation/SpatialHash.js
// VERSION: v1 — round 321
//
// Broad-phase spatial hash for "find nearby" queries on 3D points.
// Bucketizes the world into uniform-size cubic cells; insert() places
// an item by position, getNearby() returns all items in cells within
// a radius. The caller is responsible for distance-filtering the
// returned candidates (narrow phase) — this is purely broad phase.
//
// Use cases:
//   • Entity-vs-entity proximity (find all kaiju within 30m of player)
//   • Projectile broad-phase (find candidate targets near a projectile path)
//   • AI "what's nearby" queries that don't need exact distances
//
// Not a replacement for a sweep-and-prune or k-d tree if you need
// strict-distance sorted nearest-N queries — this is O(items in radius)
// per query but with poor cache locality and string-key hashing.
// Good enough for game-scale broad phase (≤ a few thousand items).
//
// Cell size tuning:
//   • Too small → most items end up alone in their cell, getNearby
//     returns nothing relevant, query radius spans many cells.
//   • Too large → each cell holds many items, getNearby returns too
//     many candidates, the narrow phase does most of the work.
//   • Rule of thumb: cellSize ≈ typical interaction radius.
//
// Reuse the same hash for multiple frames by calling clear() at the
// start of each frame, then insert() everything once, then run all
// the queries before the next clear().
//
// Item type:
//   Items are stored by reference (any JS value), keyed by their
//   position at insert time. Moving items doesn't update the hash;
//   rebuild every frame.

export class SpatialHash {
    /**
     * @param {number} cellSize — edge length of each cubic cell, in world units.
     */
    constructor(cellSize = 4.0) {
        this.cellSize = cellSize;
        this.invCellSize = 1 / cellSize;
        // Map<string, Array<any>> — cell key → list of items in that cell.
        this.cells = new Map();
        this.itemCount = 0;
    }

    /**
     * Discard all stored items. O(cells).
     */
    clear() {
        this.cells.clear();
        this.itemCount = 0;
    }

    /**
     * Insert an item at a world position.
     * @param {any} item — opaque payload (id, entity ref, object).
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    insert(item, x, y, z) {
        const key = this._cellKey(x, y, z);
        let bucket = this.cells.get(key);
        if (!bucket) {
            bucket = [];
            this.cells.set(key, bucket);
        }
        bucket.push(item);
        this.itemCount++;
    }

    /**
     * Bulk-rebuild from an array of {x, y, z, ...} objects. Clears
     * first. Items are stored by reference, so callers can read back
     * the full object (not just position).
     * @param {Array<{x: number, y: number, z: number}>} items
     */
    rebuildFrom(items) {
        this.clear();
        for (const it of items) {
            if (it == null) continue;
            this.insert(it, it.x, it.y, it.z);
        }
    }

    /**
     * Return all items in cells overlapping a sphere of `radius`
     * around (x, y, z). Candidates are NOT distance-filtered — items
     * in corner cells may be outside the actual radius. Caller does
     * the narrow phase if needed.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} radius
     * @returns {Array<any>} candidate items (may include duplicates if
     *   inserted twice; doesn't deduplicate).
     */
    getNearby(x, y, z, radius) {
        const result = [];
        const rCells = Math.ceil(radius * this.invCellSize);
        const cx = Math.floor(x * this.invCellSize);
        const cy = Math.floor(y * this.invCellSize);
        const cz = Math.floor(z * this.invCellSize);

        for (let dz = -rCells; dz <= rCells; dz++) {
            for (let dy = -rCells; dy <= rCells; dy++) {
                for (let dx = -rCells; dx <= rCells; dx++) {
                    const key = `${cx + dx},${cy + dy},${cz + dz}`;
                    const bucket = this.cells.get(key);
                    if (bucket) {
                        for (let i = 0; i < bucket.length; i++) {
                            result.push(bucket[i]);
                        }
                    }
                }
            }
        }
        return result;
    }

    /**
     * Run a callback for each item within radius — distance-filtered
     * (narrow phase included). Use when items have {x,y,z} fields.
     * Avoids constructing the intermediate getNearby array.
     *
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} radius
     * @param {(item: any, distSquared: number) => void} fn
     */
    forEachWithin(x, y, z, radius, fn) {
        const r2 = radius * radius;
        const rCells = Math.ceil(radius * this.invCellSize);
        const cx = Math.floor(x * this.invCellSize);
        const cy = Math.floor(y * this.invCellSize);
        const cz = Math.floor(z * this.invCellSize);

        for (let dz = -rCells; dz <= rCells; dz++) {
            for (let dy = -rCells; dy <= rCells; dy++) {
                for (let dx = -rCells; dx <= rCells; dx++) {
                    const key = `${cx + dx},${cy + dy},${cz + dz}`;
                    const bucket = this.cells.get(key);
                    if (!bucket) continue;
                    for (let i = 0; i < bucket.length; i++) {
                        const it = bucket[i];
                        const ddx = it.x - x;
                        const ddy = it.y - y;
                        const ddz = it.z - z;
                        const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
                        if (d2 <= r2) fn(it, d2);
                    }
                }
            }
        }
    }

    // === diagnostics ===

    /** Return { items, cells, avgPerCell, maxPerCell } for tuning. */
    stats() {
        let maxPerCell = 0;
        for (const bucket of this.cells.values()) {
            if (bucket.length > maxPerCell) maxPerCell = bucket.length;
        }
        return {
            items: this.itemCount,
            cells: this.cells.size,
            avgPerCell: this.cells.size > 0 ? this.itemCount / this.cells.size : 0,
            maxPerCell,
            cellSize: this.cellSize,
        };
    }

    _cellKey(x, y, z) {
        // String key is allocation-heavy but readable. Faster
        // alternatives (Cantor pairing, bit-packed Int) sacrifice
        // simplicity for ~2× insert throughput; not worth it at
        // game-scale (~few thousand items per frame).
        const cx = Math.floor(x * this.invCellSize);
        const cy = Math.floor(y * this.invCellSize);
        const cz = Math.floor(z * this.invCellSize);
        return `${cx},${cy},${cz}`;
    }
}
