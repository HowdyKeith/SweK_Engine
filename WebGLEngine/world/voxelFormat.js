export const VOXEL = {
    AIR: 0,

    // solids
    STONE: 1,
    DIRT: 2,
    GRASS: 3,
    SAND: 4,

    // Round 29 biome materials
    SNOW: 5,
    ASH:  6,

    // Round 251 — destruction rubble (distinct from natural dirt)
    RUBBLE: 7,

    // fluids
    WATER: 10,
    FLOWING_WATER: 11,
    LAVA: 12,

    // Round 498 — frozen water (solid, walkable, pale blue)
    ICE: 13,

    // MEDIA MATERIALS
    SCREEN: 20,

    // CIVILIZATION / AI MARKERS
    // Memory cluster obelisks placed at AI memoryField seed positions
    // so the abstract memory data has physical landmarks in the world.
    MEMORY: 30
};