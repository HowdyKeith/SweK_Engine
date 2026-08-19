export class VoxelWorld {
    constructor() {
        this.size = 16;
        this.chunks = new Map();
    }

    getChunks() {
        return Array.from(this.chunks.values());
    }

    update(cx, cz) {
        const key = "0,0";

        if (!this.chunks.has(key)) {
            this.chunks.set(key, this.generateChunk(0, 0));
        }
    }

    generateChunk(x, z) {
        const size = this.size;
        const voxels = new Uint8Array(size * size * size);

        for (let y = 0; y < size; y++) {
            for (let z = 0; z < size; z++) {
                for (let x = 0; x < size; x++) {

                    const h = Math.floor(
                        (Math.sin(x * 0.3) + Math.cos(z * 0.3)) * 2 + 6
                    );

                    if (y < h) {
                        voxels[x + y * size + z * size * size] = 1;
                    }
                }
            }
        }

        return { x, z, voxels, mesh: null, dirty: true };
    }

    get(chunk, x, y, z) {
        const s = this.size;

        if (x < 0 || y < 0 || z < 0 ||
            x >= s || y >= s || z >= s) return 0;

        return chunk.voxels[x + y * s + z * s * s];
    }

    // Extremity bound checking (v2765). inBounds is the single boundary predicate; extremityBounds reports the
    // bounding box of the SOLID voxels and which of the six world faces that content actually touches -- i.e.
    // whether a structure has reached the edge of the world (clipped, or needs a bigger grid). A control that
    // silently lets content run off the extremity is how a kaiju walks through a wall that was never there.
    inBounds(x, y, z) {
        const s = this.size;
        return x >= 0 && y >= 0 && z >= 0 && x < s && y < s && z < s;
    }

    extremityBounds(chunk) {
        const s = this.size, v = chunk.voxels;
        let minX = s, minY = s, minZ = s, maxX = -1, maxY = -1, maxZ = -1, count = 0;
        for (let z = 0; z < s; z++) for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
            if (v[x + y * s + z * s * s]) {
                count++;
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
        }
        if (count === 0) return { empty: true, count: 0, touches: {}, any: false };
        const touches = {
            xMin: minX === 0, xMax: maxX === s - 1,
            yMin: minY === 0, yMax: maxY === s - 1,
            zMin: minZ === 0, zMax: maxZ === s - 1,
        };
        const any = touches.xMin || touches.xMax || touches.yMin || touches.yMax || touches.zMin || touches.zMax;
        return { empty: false, count, min: [minX, minY, minZ], max: [maxX, maxY, maxZ], touches, any };
    }

    buildMesh(chunk) {
        const s = this.size;
        const v = chunk.voxels;

        const verts = [];
        const inds = [];
        let i = 0;

        const get = (x,y,z) => {
            if (x<0||y<0||z<0||x>=s||y>=s||z>=s) return 0;
            return v[x + y*s + z*s*s];
        };

        const quad = (x,y,z) => {
            const b = verts.length / 3;

            verts.push(
                x,y,z,
                x+1,y,z,
                x+1,y+1,z,
                x,y+1,z
            );

            inds.push(b,b+1,b+2,b,b+2,b+3);
            i += 4;
        };

        for (let y=0;y<s;y++)
        for (let z=0;z<s;z++)
        for (let x=0;x<s;x++) {

            if (!get(x,y,z)) continue;

            if (!get(x+1,y,z)) quad(x+1,y,z);
            if (!get(x-1,y,z)) quad(x,y,z);
            if (!get(x,y+1,z)) quad(x,y+1,z);
            if (!get(x,y-1,z)) quad(x,y,z);
            if (!get(x,y,z+1)) quad(x,y,z+1);
            if (!get(x,y,z-1)) quad(x,y,z);
        }

        return {
            vertices: new Float32Array(verts),
            indices: new Uint32Array(inds)
        };
    }
}