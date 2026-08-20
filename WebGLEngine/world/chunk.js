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

    get(x, y, z) {
        return this.voxels[this.index(x, y, z)];
    }

    set(x, y, z, v) {
        const i = this.index(x, y, z);
        if (this.voxels[i] === v) return;   // no-op write — don't dirty
        this.voxels[i] = v;
        this.dirty = true;
    }

    isSolid(x, y, z) {
        return this.get(x, y, z) !== 0;
    }
}