// world/biomeTerrain.js
//
// Integration layer (v2780): turns a Worley biome (world/worleyBiomes.js) into the concrete VOXEL surface +
// subsurface materials the terrain generator paints. Kept as a PURE function (takes the column's height + slope,
// not the World) so it gates headlessly without constructing the whole World and its erosion/fluid systems.
//
// Precedence is elevation-first, then biome: snow caps and bare-rock peaks and water-line beaches win over the
// biome's default surface (so a jungle mountain still gets a rock peak), then steep cliffs expose dirt, then the
// biome's own material. This preserves the nice behaviours the old kind-based path had (beaches, cliff dirt,
// peak rock) while letting the 2-axis biome drive everything in between.

import { VOXEL } from "./voxelFormat.js";
import { biomeAt, BIOMES } from "./worleyBiomes.js";

// worleyBiomes uses string material tags; map them to this engine's VOXEL ids.
export const WORLEY_SURFACE_VOXEL = {
    snow:  VOXEL.SNOW,
    grass: VOXEL.GRASS,
    sand:  VOXEL.SAND,
    dirt:  VOXEL.DIRT,
    stone: VOXEL.STONE,
};

// Resolve the surface + subsurface voxel for a column. opts: { slope, waterLevel, peakStone, snowCap }.
export function biomeColumnMaterials(wx, wz, seed, height, opts = {}) {
    const waterLevel = opts.waterLevel ?? 8;
    const slope = opts.slope ?? 0;
    const peakStone = opts.peakStone ?? 36;
    const snowCap = opts.snowCap ?? 44;

    // v4149 -- opts.biome FORCES one biome for this column, bypassing the Worley noise. world/repoHeightfield.js
    // uses it to paint a source tree's language onto the ground: a directory of shaders is jungle because it is
    // shaders, not because the noise happened to put jungle there. An unknown name falls through to the noise
    // rather than throwing, so a stale legend degrades to ordinary terrain instead of a blank world.
    const forced = opts.biome && BIOMES[opts.biome] ? opts.biome : null;
    const b = forced ? { params: BIOMES[forced], primary: forced, secondary: forced, blend: 1 }
                     : biomeAt(wx, wz, seed);
    const surfaceTag = b.params.surface, subTag = b.params.sub;
    let surface = WORLEY_SURFACE_VOXEL[surfaceTag] ?? VOXEL.GRASS;
    let sub = WORLEY_SURFACE_VOXEL[subTag] ?? VOXEL.DIRT;
    const isSandy = surfaceTag === "sand";
    const isSnowy = surfaceTag === "snow";

    // elevation-first overrides
    if (height > snowCap) {
        surface = VOXEL.SNOW; sub = VOXEL.STONE;
    } else if (height > peakStone && !isSandy) {
        surface = VOXEL.STONE; sub = VOXEL.STONE;                 // bare rock peaks
    } else if (height <= waterLevel + 2 && !isSnowy) {
        surface = VOXEL.SAND; sub = VOXEL.SAND;                   // beaches at the water line
    } else if (slope >= 3 && !isSandy) {
        surface = VOXEL.DIRT;                                     // steep cliffs shed their topsoil
    }
    // else: the biome's own surface/sub stand

    return { surface, sub, biome: b.primary, secondary: b.secondary, blend: b.blend };
}

// Biome-driven terrain SHAPE (v2780b). Maps the Worley biome's blended baseH/amp into the height formula's
// units: a base elevation, an amplitude multiplier on the height noise, and a noise PROFILE ("kind") so the
// landform itself changes with biome -- flat deserts, rolling plains, craggy ridged highlands. Because biomeAt
// already lerps baseH/amp across cell borders, base and ampMul transition smoothly between biomes (no cliff
// seam at a biome edge). Pure -- gates without the World.
export function biomeHeightParams(wx, wz, seed, opts = {}) {
    const b = biomeAt(wx, wz, seed);
    const baseH = b.params.baseH;                                   // 5..11 (blended)
    const ampP = b.params.amp;                                      // 3..10 (blended)
    const base = (opts.baseFloor ?? 13) + baseH;                    // ~18..24 nominal
    const ampMul = Math.max(0.4, Math.min(1.6, ampP / (opts.ampDivisor ?? 6)));   // ~0.5..1.6
    // profile by amplitude: low -> flat desert, high -> ridged highland, else rolling plains
    const kind = ampP < 4 ? "desert" : ampP >= 8 ? "mountain" : "plains";
    return { base, ampMul, kind, biome: b.primary, blend: b.blend };
}
