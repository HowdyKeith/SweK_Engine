// FILE: world/biomeMap.js
// VERSION: v1
//
// Round 29 — procedural biome assignment. 2-octave value noise over
// (x, z) maps each world column to one of five biomes:
//
//   tundra   — pale, sparse, no trees
//   plains   — current default look (grass, scattered oak/palm)
//   jungle   — dense oak forest, slightly darker grass
//   mountains— stone peaks rising 5-20 voxels above base terrain,
//              snow caps above y≥30
//   volcano  — ash + scattered lava patches
//
// The assignment is deterministic: same (x, z) always returns the
// same biome, so painters and tree spawners agree without sharing
// state.

export const BIOMES = ["tundra", "plains", "jungle", "mountains", "volcano"];

// Hash-based 2D value noise. Cheap, deterministic, no Perlin needed.
function _hash2d(x, z, seed) {
    let h = (x * 374761393) ^ (z * 668265263) ^ (seed * 982451653);
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
}

function _valueNoise2d(x, z, seed) {
    const x0 = Math.floor(x), x1 = x0 + 1;
    const z0 = Math.floor(z), z1 = z0 + 1;
    const fx = x - x0, fz = z - z0;
    const h00 = _hash2d(x0, z0, seed);
    const h01 = _hash2d(x0, z1, seed);
    const h10 = _hash2d(x1, z0, seed);
    const h11 = _hash2d(x1, z1, seed);
    const u = fx * fx * (3 - 2 * fx);
    const v = fz * fz * (3 - 2 * fz);
    return h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) +
           h01 * (1 - u) * v       + h11 * u * v;
}

export class BiomeMap {
    constructor(opts = {}) {
        this.seed = opts.seed ?? 1337;
        this._cache = new Map();    // "x,z" → biome string
    }

    getBiomeAt(x, z) {
        const key = `${x | 0},${z | 0}`;
        if (this._cache.has(key)) return this._cache.get(key);

        // Slow continental noise + fine variation
        const macro = _valueNoise2d(x * 0.005,  z * 0.005,  this.seed);
        const micro = _valueNoise2d(x * 0.03 + 100, z * 0.03 + 100, this.seed);
        // Composite stays tight around 0.5 (~[0.3,0.7]); stretch by 3×
        // around center so all 5 biome bands actually trigger.
        let t = 0.7 * macro + 0.3 * micro;
        t = Math.max(0, Math.min(1, (t - 0.5) * 3 + 0.5));

        let biome;
        if (t < 0.18)      biome = "tundra";
        else if (t < 0.42) biome = "plains";
        else if (t < 0.62) biome = "jungle";
        else if (t < 0.85) biome = "mountains";
        else                biome = "volcano";

        this._cache.set(key, biome);
        return biome;
    }

    // Mountain peak height noise — used by BiomePainter to vary
    // mountain heights. Returns 0..1; painter scales to peak height.
    getMountainPeak(x, z) {
        return _valueNoise2d(x * 0.04 + 500, z * 0.04 + 500, this.seed);
    }

    // For volcano lava placement — sparse pattern (~5% of surfaces)
    getVolcanoLavaChance(x, z) {
        return _valueNoise2d(x * 0.15 + 1000, z * 0.15 + 1000, this.seed);
    }

    // Round 280 — wetness overlay channel. Independent of the biome
    // bucket so we can paint swamp/lake patches on top of plains/
    // jungle without disrupting existing world generation. Returns
    // 0..1; consumers threshold it (e.g. >0.85 = lake, 0.65-0.85 =
    // swamp).
    getWetness(x, z) {
        // Coarser scale than mountain noise — wet zones are larger
        // and softer-edged than rocky peaks. Add an offset to the
        // seed so it doesn't correlate with the biome buckets.
        return _valueNoise2d(x * 0.02 + 2500, z * 0.02 + 2500, this.seed ^ 0x5a5a5a5a);
    }
}
