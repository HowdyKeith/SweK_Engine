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
        this.map = new Map();   // key -> array of particle indices
        this._seen = new Int32Array(27);   // scratch for the collision dedupe in forEachNear
        this.built = 0;
    }

    /** Rebuild from scratch. Called once per step: particles move every step, and an incrementally-maintained
     *  grid is a cache, and a cache is a second source of truth. */
    rebuild(particles) {
        this.map.clear();
        const c = this.cell;
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const k = this._key(Math.floor(p.x / c), Math.floor(p.y / c), Math.floor(p.z / c));
            const b = this.map.get(k);
            if (b) b.push(i); else this.map.set(k, [i]);
        }
        this.built = particles.length;
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
        let max = 0, total = 0;
        for (const b of this.map.values()) { max = Math.max(max, b.length); total += b.length; }
        const cells = this.map.size;
        return { cells, mean: cells ? total / cells : 0, max };
    }
}
