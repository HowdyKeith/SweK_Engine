// FILE: tools/wadMaterialPresets.js
// VERSION: v1 — round 378
//
// Default mapping from common Doom texture names to engine voxel
// material IDs. Lets `wad.voxelize(map, { wallTextureMap: WAD_DEFAULT_WALLS })`
// produce a varied-material level without hand-curated mapping.
//
// The mappings are heuristic — texture names like "BIGDOOR1" become
// STONE, "BROWN1" becomes DIRT, "SP_HOT1" becomes ASH, etc. Real
// fidelity would need the actual texture pixel data driving an atlas,
// but for "Doom in voxels" portfolio shots this gets you 80% there
// with the existing palette.

import { VOXEL } from "../world/voxelFormat.js";

// Pattern → material. First match wins. Patterns use case-folded
// substrings since Doom texture names are already uppercase.
const WALL_RULES = [
    // Browns / wood / dirt-flavored
    [/^BROWN/,    VOXEL.DIRT],
    [/^BROWNGRN/, VOXEL.DIRT],
    [/^WOOD/,     VOXEL.DIRT],
    [/^WOODMET/,  VOXEL.DIRT],

    // Tans / sand
    [/^STARTAN/,  VOXEL.SAND],
    [/^TANROCK/,  VOXEL.SAND],
    [/^GRAYTALL/, VOXEL.SAND],

    // Stones / grays / metal — all STONE
    [/^STONE/,    VOXEL.STONE],
    [/^GRAY/,     VOXEL.STONE],
    [/^SILVER/,   VOXEL.STONE],
    [/^METAL/,    VOXEL.STONE],
    [/^TEKWALL/,  VOXEL.STONE],
    [/^COMP/,     VOXEL.STONE],     // computer panels
    [/^BIGDOOR/,  VOXEL.STONE],

    // Volcanic / hot / hell — ASH
    [/^SP_HOT/,   VOXEL.ASH],
    [/^FIREBLU/,  VOXEL.ASH],
    [/^FIRELAVA/, VOXEL.ASH],
    [/^REDWALL/,  VOXEL.ASH],
    [/^FIRE/,     VOXEL.ASH],

    // Snow / ice / blue — SNOW
    [/^ICE/,      VOXEL.SNOW],
    [/^SNOW/,     VOXEL.SNOW],
    [/^BLUE/,     VOXEL.SNOW],
];

const FLOOR_RULES = [
    [/^MFLR/,     VOXEL.DIRT],    // Doom 2 floors
    [/^FLAT5/,    VOXEL.DIRT],
    [/^FLOOR0/,   VOXEL.DIRT],
    [/^FLOOR1/,   VOXEL.STONE],
    [/^FLOOR4/,   VOXEL.SAND],
    [/^FLOOR5/,   VOXEL.STONE],
    [/^FLOOR7/,   VOXEL.STONE],
    [/^STEP/,     VOXEL.STONE],
    [/^CEIL/,     VOXEL.STONE],
    [/^TLITE/,    VOXEL.ASH],     // lit panels
    [/^LAVA/,     VOXEL.LAVA],
    [/^NUKAGE/,   VOXEL.WATER],   // toxic slime → water for visual
    [/^FWATER/,   VOXEL.WATER],
    [/^BLOOD/,    VOXEL.LAVA],
    [/^SLIME/,    VOXEL.WATER],
];

/**
 * Returns a function suitable for opts.wallTextureMap.
 * Texture names already arrive upper-case from the WAD parser.
 */
export function defaultWallMaterial(texName) {
    if (!texName || texName === "-") return undefined;
    const upper = texName.toUpperCase();
    for (const [rx, mat] of WALL_RULES) {
        if (rx.test(upper)) return mat;
    }
    return undefined;   // caller's wallMaterial default will apply
}

/** Returns a function suitable for opts.floorTextureMap. */
export function defaultFloorMaterial(texName) {
    if (!texName || texName === "-") return undefined;
    const upper = texName.toUpperCase();
    for (const [rx, mat] of FLOOR_RULES) {
        if (rx.test(upper)) return mat;
    }
    return undefined;
}

/**
 * Convenience: opts object you can spread into wad.voxelize:
 *   wad.voxelize(parsedMap, WAD_DEFAULT_MATERIALS)
 *   wad.voxelize(parsedMap, { ...WAD_DEFAULT_MATERIALS, unitsPerVoxel: 8 })
 */
export const WAD_DEFAULT_MATERIALS = {
    wallTextureMap:  defaultWallMaterial,
    floorTextureMap: defaultFloorMaterial,
};
