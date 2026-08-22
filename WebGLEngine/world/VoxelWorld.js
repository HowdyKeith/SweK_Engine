import { greedyMesh } from "../voxel/greedyMesh.js";

/**
 * The bounding box of a flat [x,y,z] block list, plus which faces of that box are non-degenerate --
 * i.e. the box actually has extent on that axis rather than being a single-voxel-thick slab. A PURE
 * function of the block list so it can be fixture-tested on synthetic input before being driven against
 * whatever generate() actually produced. Unlike the old voxel/voxelworld.js stub, THIS WORLD HAS NO
 * DECLARED SIZE -- generate() places blocks wherever it likes -- so "touches the edge of the world" has
 * no meaning here; what is checkable is the box's own extent and count.
 */
export function computeBounds(blocks) {
    if (!blocks || blocks.length === 0) return { empty: true, count: 0 };
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const [x, y, z] of blocks) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return {
        empty: false, count: blocks.length,
        min: [minX, minY, minZ], max: [maxX, maxY, maxZ],
        extent: [maxX - minX, maxY - minY, maxZ - minZ],
    };
}

export class VoxelWorld {
    constructor() {
        this.blocks = this.generateBlocks();
        const blocks = this.blocks;
        this.chunks = [greedyMesh({ blocks })];
    }

    generateBlocks() {
        const blocks = [];
        for (let x = -5; x <= 5; x++) {
            for (let z = -5; z <= 5; z++) {
                blocks.push([x, 0, z]);
            }
        }
        return blocks;
    }

    /** The bounding box of the content this instance actually generated. */
    bounds() {
        return computeBounds(this.blocks);
    }

    getChunks() {
        return this.chunks;
    }
}