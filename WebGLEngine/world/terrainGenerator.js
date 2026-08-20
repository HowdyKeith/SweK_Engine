import { createNoise3D, createNoise2D } from "simplex-noise";

const noise3D = createNoise3D();
const noise2D = createNoise2D();

export class TerrainGenerator {

    constructor(seed = 1337) {
        this.seed = seed;
    }

    // TRUE 3D voxel field (not heightmap)
    getVoxel(x, y, z) {

        // large terrain shape
        const surface = noise2D(x * 0.01, z * 0.01) * 40 + 60;

        // cave system
        const cave = noise3D(x * 0.05, y * 0.05, z * 0.05);

        const isBelowSurface = y < surface;

        const isCave = cave > 0.55;

        // solid ground with caves carved out
        if (isBelowSurface && !isCave) return 1;

        return 0;
    }
}