// WebGLEngine/physics/sph/spatialGrid.js — v2536
//
// THE O(N^2) IS THE WHOLE PROBLEM.
//
// sph.js walks every particle against every other particle, twice per step (computeDensity and accelerations),
// and then throws away every pair further apart than h. Measured on this box, JIT warmed: 200 particles 0.27ms,
// 400 -> 1.14ms, 800 -> 4.55ms. Almost exactly 4x per doubling, which is the definition of the problem. 4,000
// particles would be ~114ms/step -- seven frames, for one step.
//
// A particle can only influence another within h. So bucket into cells of side h: a query then touches 27 cells
// instead of N particles, and the work becomes O(N * k) where k is the neighbours actually in range -- a constant
// set by the packing, not by the population.
//
// WHY THIS IS A SEPARATE FILE AND NOT AN EDIT TO sph.js. sph.js WORKS. It is 154 lines, it is gated, and other
// things use it. An accelerator that is also a rewrite is two changes wearing one hat, and if the result is wrong
// you cannot tell which half did it. This is a drop-in that must PROVE it agrees with the brute force it replaces
// -- see spatialGrid-selfcheck.mjs, which asserts exactly that, not "the grid looks plausible".
//
// AND ON GPUs, WHICH IS THE REAL POINT: a GPU kernel over an O(N^2) walk is still O(N^2). It buys brute force to
// paper over an algorithm, which is how the GPU brain lost to CPU Dijkstra by 50x. Fix the shape first. Once the
// grid exists, SPH is genuinely the right shape for a kernel -- every particle does identical work with no
// sequential dependency, which is exactly what Dijkstra was not.
"use strict";

export class SpatialGrid {
    /** @param {number} h  the SPH smoothing length. Cell side == h: a query is then exactly the 27 cells around
     *                     the point, and nothing in range can hide outside them. */
    constructor(h) {
        this.h = h;
        this.cell = h;
        this.map = new Map();   // key -> array of particle indices  (the HASH fallback, see rebuild)
        this._seen = new Int32Array(27);   // scratch for the collision dedupe in forEachNear
        this.built = 0;

        // v4121 -- *** THE DIRECT-INDEX PATH, WHICH IS WHY THE CROSSOVER MOVED. *** sph.js's own note measured
        // this grid LOSING below ~1000 particles and named the reason exactly: "27 Map lookups and a closure
        // per neighbour cost more than the pairs they save". That measurement was right about the
        // IMPLEMENTATION, not about grids. A Map.get() per cell, a JS array per bucket that grows by push, and
        // a hash whose collisions must then be deduped, are all avoidable: with a bounding box the cell index
        // is arithmetic, buckets become one Int32Array linked list with zero allocation per step, and distinct
        // cells cannot collide so the dedupe disappears with them.
        this._head = null;      // Int32Array, one slot per cell, -1 when empty
        this._next = null;      // Int32Array, one slot per particle: the next particle in the same cell
        this._dim = [0, 0, 0];
        this._min = [0, 0, 0];
        this._direct = false;   // false = fall back to the hash Map (see MAX_CELLS in rebuild)
    }

    /** Rebuild from scratch. Called once per step: particles move every step, and an incrementally-maintained
     *  grid is a cache, and a cache is a second source of truth. */
    rebuild(particles) {
        const n = particles.length, c = this.cell;
        this.built = n;
        if (n === 0) { this.map.clear(); this._direct = false; return; }

        // The bounding box is what buys direct indexing. It is recomputed every step for the same reason the
        // grid is: particles move, and a cached extent is a second source of truth.
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < n; i++) {
            const p = particles[i];
            if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
            if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
            if (p.z < z0) z0 = p.z; if (p.z > z1) z1 = p.z;
        }
        // *** THE CAP IS WHY THE HASH PATH SURVIVES. *** Two particles a kilometre apart with h in millimetres
        // would ask for more cells than there is memory. A hash has no bounded domain, which was the stated
        // reason it was chosen; that reason is still true for the pathological case, so the fallback stays and
        // the oracle gate exercises BOTH.
        const MAX_CELLS = 1 << 22;   // 4.2M cells, ~17 MB of Int32 -- generous for any real fluid
        const nx = Math.floor((x1 - x0) / c) + 3, ny = Math.floor((y1 - y0) / c) + 3, nz = Math.floor((z1 - z0) / c) + 3;
        const cells = nx * ny * nz;
        if (!Number.isFinite(cells) || cells <= 0 || cells > MAX_CELLS) {
            this._direct = false;
            this.map.clear();
            for (let i = 0; i < n; i++) {
                const p = particles[i];
                const k = this._key(Math.floor(p.x / c), Math.floor(p.y / c), Math.floor(p.z / c));
                const b = this.map.get(k);
                if (b) b.push(i); else this.map.set(k, [i]);
            }
            return;
        }

        this._direct = true;
        this._min[0] = x0 - c; this._min[1] = y0 - c; this._min[2] = z0 - c;   // one cell of margin
        this._dim[0] = nx; this._dim[1] = ny; this._dim[2] = nz;
        if (!this._head || this._head.length < cells) this._head = new Int32Array(cells);
        if (!this._next || this._next.length < n) this._next = new Int32Array(n);
        const head = this._head, next = this._next;
        head.fill(-1, 0, cells);
        // Walked BACKWARDS so each cell's list comes out in ASCENDING index order. Not cosmetic: the neighbour
        // order sets the summation order, and a stable ascending walk keeps a run reproducible between hosts
        // instead of depending on which particle happened to be inserted first.
        for (let i = n - 1; i >= 0; i--) {
            const p = particles[i];
            const ix = ((p.x - this._min[0]) / c) | 0, iy = ((p.y - this._min[1]) / c) | 0, iz = ((p.z - this._min[2]) / c) | 0;
            const k = (iz * ny + iy) * nx + ix;
            next[i] = head[k];
            head[k] = i;
        }
    }

    // The standard spatial hash (Teschner et al. 2003): three large primes, XORed, giving a NUMBER key.
    //
    // This started as a string key, `ix + "," + iy + "," + iz`, and the comment beside it claimed -- with the word
    // "Measured" -- that it was not the bottleneck. It had not been measured. When it was, the string grid ran at
    // 0.6x: SLOWER than the O(N^2) walk it replaced. 600 particles x 27 cells is 16,200 string builds and 16,200
    // string hashes per density pass, and that swamped every pair it saved.
    //
    // A number key needs no bounded domain, which was the stated reason for the string.
    //
    // COLLISIONS ARE NOT HARMLESS, WHICH I ALSO CLAIMED AND WAS ALSO WRONG ABOUT. If two of the 27 cells in a
    // query hash to the same bucket, forEachNear walks that bucket TWICE and the caller applies the same pair
    // force twice. The j>i guard cannot catch it: j is still greater than i on both visits. That showed up as
    // forces disagreeing by 1.36e-3 -- small enough to look like float noise, which is what makes it dangerous.
    // forEachNear dedupes the keys.
    _key(ix, iy, iz) { return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) | 0; }

    /**
     * Call fn(index) for every particle within h of (x,y,z) -- plus some that are merely in the 27 cells and
     * further away than h. THE CALLER STILL CHECKS THE DISTANCE. This returns a superset on purpose: filtering
     * here would mean computing r twice, once to filter and once to use.
     */
    forEachNear(x, y, z, fn) {
        const c = this.cell;
        if (this._direct) {
            // No Map, no hash, and therefore NO DEDUPE: 27 distinct cell indices cannot collide with each
            // other, so the collision problem the hash created does not exist to be solved here.
            const nx = this._dim[0], ny = this._dim[1], nz = this._dim[2];
            const head = this._head, next = this._next;
            const cx = Math.floor((x - this._min[0]) / c), cy = Math.floor((y - this._min[1]) / c),
                  cz = Math.floor((z - this._min[2]) / c);
            // The RANGE is clamped, not the centre: a query just outside the box still reaches the cells that
            // are inside it, and one far outside intersects nothing and correctly yields no neighbours.
            const ax = cx - 1 < 0 ? 0 : cx - 1, bx = cx + 1 >= nx ? nx - 1 : cx + 1;
            const ay = cy - 1 < 0 ? 0 : cy - 1, by = cy + 1 >= ny ? ny - 1 : cy + 1;
            const az = cz - 1 < 0 ? 0 : cz - 1, bz = cz + 1 >= nz ? nz - 1 : cz + 1;
            for (let iz = az; iz <= bz; iz++)
                for (let iy = ay; iy <= by; iy++) {
                    const row = (iz * ny + iy) * nx;
                    for (let ix = ax; ix <= bx; ix++)
                        for (let m = head[row + ix]; m >= 0; m = next[m]) fn(m);
                }
            return;
        }
        const cx = Math.floor(x / c), cy = Math.floor(y / c), cz = Math.floor(z / c);
        // Dedupe the 27 keys. Two of them CAN collide under the hash, and walking a bucket twice means applying
        // the same pair force twice -- a wrong simulation that looks like float noise. 27 entries is small enough
        // that a linear scan beats a Set, allocation and all.
        const seen = this._seen;
        let n = 0;
        for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const k = this._key(cx + dx, cy + dy, cz + dz);
                    let dup = false;
                    for (let q = 0; q < n; q++) if (seen[q] === k) { dup = true; break; }
                    if (dup) continue;
                    seen[n++] = k;
                    const b = this.map.get(k);
                    if (!b) continue;
                    for (let m = 0; m < b.length; m++) fn(b[m]);
                }
            }
        }
    }

    /** Collect indices near a point. Allocates -- use forEachNear in a hot loop. */
    near(x, y, z) {
        const out = [];
        this.forEachNear(x, y, z, (i) => out.push(i));
        return out;
    }

    /** How full are the cells? A grid whose cells hold one particle each is a grid that costs more than it saves,
     *  and one holding hundreds is a grid that is not doing anything. Both are worth being able to see. */
    stats() {
        let max = 0, total = 0, cells = 0;
        if (this._direct) {
            const n = this._dim[0] * this._dim[1] * this._dim[2], head = this._head, next = this._next;
            for (let k = 0; k < n; k++) {
                let len = 0;
                for (let m = head[k]; m >= 0; m = next[m]) len++;
                if (len) { cells++; total += len; if (len > max) max = len; }
            }
        } else {
            for (const b of this.map.values()) { max = Math.max(max, b.length); total += b.length; }
            cells = this.map.size;
        }
        return { cells, mean: cells ? total / cells : 0, max, direct: this._direct };
    }

    /**
     * *** HOW MANY OCCUPIED CELLS ONE QUERY ACTUALLY TOUCHES -- AN INSTRUMENT ON THE GRID, NOT A GUESS FROM
     * OUTSIDE IT. ***
     *
     * v4170. neighbourBakeoff-selfcheck measured this by reaching into `grid.map` and counting keys, which was
     * correct until v4122 gave this class a dense path. `map` is not dead -- it is still the hash FALLBACK for
     * a domain too large to allocate -- but on the dense path it is simply EMPTY, so the gate's
     * `grid.map.has(k)` was false every time and the count read 0 for three straight configs.
     *
     * *** AND THE EMPTINESS IS WHY IT WAS SILENT. *** Had v4122 deleted the field, `grid.map.has` would have
     * thrown and the gate would have gone red on the round that caused it. Instead a real, plausible, wrong
     * number -- zero -- was pinned against an answer key and reported as a mismatch nobody could interpret.
     * A VESTIGIAL FIELD IS WORSE THAN A MISSING ONE, because the reader gets an answer instead of an error.
     *
     * It counts what forEachNear WALKS, on whichever path is live: on the dense path the CLAMPED 3x3x3 range
     * (a query at the boundary genuinely visits fewer cells), on the hash path the deduped 27 keys. Occupied
     * only -- an empty cell is visited but costs nothing, and the number exists to explain candidate counts.
     */
    cellsTouched(x, y, z) {
        const c = this.cell;
        let touched = 0;
        if (this._direct) {
            const nx = this._dim[0], ny = this._dim[1], nz = this._dim[2], head = this._head;
            const cx = Math.floor((x - this._min[0]) / c), cy = Math.floor((y - this._min[1]) / c),
                  cz = Math.floor((z - this._min[2]) / c);
            const ax = cx - 1 < 0 ? 0 : cx - 1, bx = cx + 1 >= nx ? nx - 1 : cx + 1;
            const ay = cy - 1 < 0 ? 0 : cy - 1, by = cy + 1 >= ny ? ny - 1 : cy + 1;
            const az = cz - 1 < 0 ? 0 : cz - 1, bz = cz + 1 >= nz ? nz - 1 : cz + 1;
            for (let iz = az; iz <= bz; iz++)
                for (let iy = ay; iy <= by; iy++) {
                    const row = (iz * ny + iy) * nx;
                    for (let ix = ax; ix <= bx; ix++) if (head[row + ix] >= 0) touched++;
                }
            return touched;
        }
        // the hash path dedupes because two of the 27 keys CAN collide -- same reason forEachNear does
        const cx = Math.floor(x / c), cy = Math.floor(y / c), cz = Math.floor(z / c);
        const seen = this._seen;
        let n = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const k = this._key(cx + dx, cy + dy, cz + dz);
            let dup = false;
            for (let q = 0; q < n; q++) if (seen[q] === k) { dup = true; break; }
            if (dup) continue;
            seen[n++] = k;
            if (this.map.has(k)) touched++;
        }
        return touched;
    }
}
