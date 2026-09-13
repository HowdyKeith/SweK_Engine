// FILE: world/chunk.js
// VERSION: v4 - MATERIAL-AWARE CHUNK

export class Chunk {

    constructor(cx, cz, size, height) {

        this.cx = cx;
        this.cz = cz;

        this.size = size;
        this.height = height;

        // MATERIAL ID STORAGE (0 = air)
        this.voxels = new Uint8Array(size * height * size);

        this.dirty = true;

        // Round 43p - precompute hot-path values used every frame:
        //   _key:    map key used by renderer.meshes (no string alloc per frame)
        //   _cwx/cwz: world-space chunk center for distance + frustum tests
        //   _aabb:   axis-aligned bounding box for frustum culling
        this._key = cx + "," + cz;
        this._cwx = cx * size + size * 0.5;
        this._cwz = cz * size + size * 0.5;
        this._aabb = {
            minX: cx * size,
            maxX: cx * size + size,
            minY: 0,
            maxY: height,
            minZ: cz * size,
            maxZ: cz * size + size,
        };
    }

    index(x, y, z) {
        return x + this.size * (z + this.size * y);
    }

    // *** THE INDEX IS UNBOUNDED AND EVERY CONSUMER READ THE RESULT AS ROCK. ***
    // index() is `x + size * (z + size * y)` over a flat array of size * height * size, with no range
    // check. The layout puts x fastest and y slowest, so an out-of-range x or z ALIASES into a neighbouring
    // voxel while an out-of-range y leaves the array entirely -- and a typed array answers `undefined` for a
    // read past its end and SILENTLY DISCARDS a write. Measured in a nine-second boot of index.html: 36,754
    // of 100,982 reads (36.4%) were out of range, every one of them on Y and every one of them off the end
    // of the array -- x and z were in range on all 100,982, so the aliasing case is real in the arithmetic
    // and does not arise in this engine.
    //
    // `undefined` then met two different comparisons and only one of them was safe:
    //   world._proximityScan asks `v === VOXEL.WATER`, which undefined fails, so the sample is ignored.
    //   world.getCaveFactor asks `v !== VOXEL.AIR`, which undefined PASSES, so the sample counts as SOLID.
    // That second one drives reverb. In an open-sky column whose highest solid voxel is at y=24, caveFactor
    // read 0 at y=54, 0.286 at y=59, 0.571 at y=62 and 0.857 at y=64 -- a listener standing in clear air
    // being told it is in a cave, on a ramp that is exactly the fraction of its 9x9x9 sample box that has
    // crossed the ceiling. And world.isAir, which is `voxelAt(...) === VOXEL.AIR`, answered FALSE above the
    // world: solid rock all the way up, which is why RainSystem's drops "landed" the instant they spawned.
    inBounds(x, y, z) {
        return x >= 0 && x < this.size && y >= 0 && y < this.height && z >= 0 && z < this.size;
    }

    /** Outside the chunk is empty space, not rock. Reads past the array used to answer `undefined`. */
    get(x, y, z) {
        if (!this.inBounds(x, y, z)) return 0;   // 0 = air, per this file's own storage convention
        return this.voxels[this.index(x, y, z)];
    }

    /**
     * A write outside the chunk is dropped -- as it always was, since a typed array discards it -- but it
     * no longer marks the chunk dirty on the way out. NOT CLAIMED: that this saves a re-mesh. All 1,891 such
     * writes in the measured boot landed on a chunk that was ALREADY dirty, so zero rebuilds were added by
     * them and none are removed by this.
     */
    set(x, y, z, v) {
        if (!this.inBounds(x, y, z)) return;
        const i = this.index(x, y, z);
        if (this.voxels[i] === v) return;   // no-op write — don't dirty
        this.voxels[i] = v;
        this.dirty = true;
    }

    isSolid(x, y, z) {
        return this.get(x, y, z) !== 0;
    }
}