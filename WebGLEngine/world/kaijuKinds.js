// FILE: world/kaijuKinds.js
// VERSION: v1
//
// Per-kind kaiju configuration. Six kinds, each with its own spawn
// physics, visual style, and stat profile. Adding a new kind is a
// matter of dropping another config block here — no Kaiju.js changes.
//
// `spawnFallSpeed` is signed: positive = falling (sky / space),
// negative = rising (cave / underground / water / hell). The kaiju
// state-machine handles both directions via a single y -= speed*dt
// integration with direction-aware "landed" check.
//
// `debrisVoxel` is the material id used for the spawn debris burst.
// VoxelDebrisSystem looks up its color from PALETTE so the burst
// reads as origin-themed (lava for hell, water for water, etc.).

// World altitude landmarks (mirroring world/world.js):
//   y = 1..49  terrain
//   y = 8      water level
//   y > 49     sky

export const KAIJU_KINDS = {

    sky: {
        origin:           "sky",
        moveSpeed:        4.0,
        scale:            3.0,
        color:            [1.00, 0.15, 0.15],   // red — original MVK
        bobAmpl:          0.35,
        spawnFallSpeed:  +18,                    // descending
        spawnLandY:       20,
        damageMul:        1.0,
        maxLifetime:      90,
        debrisVoxel:      1,                     // stone-grey debris
        eruptRing:        false,
        pickSpawnPos(target) {
            return { x: target.center.x, y: 80, z: target.center.z };
        },
    },

    space: {
        origin:           "space",
        moveSpeed:        4.0,
        scale:            4.0,                    // largest
        color:            [0.65, 0.50, 1.00],    // pale violet
        bobAmpl:          0.50,
        spawnFallSpeed:  +35,                     // very fast descent
        spawnLandY:       22,
        damageMul:        1.4,
        maxLifetime:      75,
        debrisVoxel:      30,                     // memory (cyan)
        eruptRing:        false,
        pickSpawnPos(target) {
            return { x: target.center.x, y: 200, z: target.center.z };
        },
    },

    cave: {
        origin:           "cave",
        moveSpeed:        3.0,
        scale:            2.5,
        color:            [0.45, 0.30, 0.18],    // earthy brown
        bobAmpl:          0.20,
        spawnFallSpeed:  -10,                     // rising slowly
        spawnLandY:       22,
        damageMul:        0.9,
        maxLifetime:      100,                    // longest-lived
        debrisVoxel:      2,                      // dirt
        eruptRing:        false,
        pickSpawnPos(target) {
            // Emerge near target but with a small offset so it doesn't
            // clip on top of the civ marker
            return {
                x: target.center.x + 5,
                y:  6,    // start in cave depth
                z: target.center.z + 5,
            };
        },
    },

    underground: {
        origin:           "underground",
        moveSpeed:        3.0,
        scale:            3.5,                    // bulky
        color:            [0.55, 0.38, 0.18],    // ochre
        bobAmpl:          0.15,
        spawnFallSpeed:  -8,
        spawnLandY:       24,
        damageMul:        1.2,
        maxLifetime:      95,
        debrisVoxel:      1,                      // stone debris
        eruptRing:        false,
        pickSpawnPos(target) {
            return {
                x: target.center.x - 6,
                y:  2,    // deep
                z: target.center.z,
            };
        },
    },

    water: {
        origin:           "water",
        moveSpeed:        5.0,                    // amphibious — fastest
        scale:            2.8,
        color:            [0.20, 0.55, 0.85],    // ocean blue
        bobAmpl:          0.40,                   // strong bob — sea-borne
        spawnFallSpeed:  -6,                      // rising through water
        spawnLandY:       14,
        damageMul:        1.0,
        maxLifetime:      85,
        debrisVoxel:     10,                      // water splash
        eruptRing:        false,
        pickSpawnPos(target) {
            return {
                x: target.center.x + 8,
                y:  3,    // below water level (8)
                z: target.center.z,
            };
        },
    },

    hell: {
        origin:           "hell",
        moveSpeed:        4.5,
        scale:            3.5,
        color:            [1.00, 0.40, 0.05],    // lava orange
        bobAmpl:          0.60,                   // dramatic
        spawnFallSpeed:  -12,                     // rises fast
        spawnLandY:       25,
        damageMul:        1.6,                    // strongest
        maxLifetime:      60,                     // burns out fastest
        debrisVoxel:     12,                      // lava
        eruptRing:        true,                   // signature lava ring
        pickSpawnPos(target) {
            return {
                x: target.center.x,
                y:  0,    // emerges from below
                z: target.center.z,
            };
        },
    },

    // Round 37 — tech alien race. Mechanical visitors with metallic
    // silver-blue aesthetic, fast move speed, MEMORY debris (they leak
    // data when damaged), drop "metal trees" (vertical MEMORY pillars)
    // periodically as they roam. Ion lance attack — narrow blue beam,
    // faster cadence than lightning. Visually distinct from organic
    // kaiju kinds — the player should immediately read them as "alien
    // technology" not "monster."
    tech: {
        origin:           "tech",
        moveSpeed:        5.5,                    // fastest — advanced propulsion
        scale:            3.2,
        color:            [0.70, 0.85, 1.00],    // silver-blue metallic
        bobAmpl:          0.15,                   // mechanical — minimal bob
        spawnFallSpeed:  +20,                     // descends like a craft
        spawnLandY:       22,
        damageMul:        1.2,
        maxLifetime:      100,                    // long-lived — durable tech
        debrisVoxel:      30,                     // MEMORY (cyan glow)
        eruptRing:        false,
        pickSpawnPos(target) {
            return { x: target.center.x, y: 90, z: target.center.z };
        },
    },

};

// Round 26 — mod-able registry. Replace static KIND_NAMES (which
// would freeze the kind set at module load) with a dynamic
// enumerator that reads from the live KAIJU_KINDS object. Mods can
// call registerKaijuKind() to add new kinds at any time after load.

export function pickKindConfig(kindName) {
    return KAIJU_KINDS[kindName] || KAIJU_KINDS.sky;
}

// Round 29+ — per-biome spawn weighting. Each biome favors a signature
// kaiju kind, but a baseline +1 on every kind keeps the full menagerie
// possible everywhere. volcano->hell, mountains->cave/underground,
// tundra->space, jungle->water/sky, plains->sky.
export const BIOME_KIND_AFFINITY = {
    volcano:   { hell: 6, tech: 2, cave: 1 },
    mountains: { cave: 4, underground: 4, tech: 2 },
    tundra:    { space: 5, sky: 2 },
    jungle:    { water: 4, sky: 3, cave: 1 },
    plains:    { sky: 4, space: 1 },
};
const AUTO_SPAWN_KINDS = ["sky", "space", "cave", "underground", "water", "hell", "tech"];

// Weighted-random kaiju kind for a biome. Unknown/empty biome → uniform
// (the legacy behavior). rng injectable for testing.
export function biomeWeightedKind(biome, rng = Math.random) {
    const kinds = AUTO_SPAWN_KINDS;
    const aff = BIOME_KIND_AFFINITY[biome];
    if (!aff) return kinds[(rng() * kinds.length) | 0];
    const weights = kinds.map(k => 1 + (aff[k] || 0));
    let total = 0; for (const w of weights) total += w;
    let r = rng() * total;
    for (let i = 0; i < kinds.length; i++) { r -= weights[i]; if (r <= 0) return kinds[i]; }
    return kinds[0];
}

export function randomKindName() {
    const names = Object.keys(KAIJU_KINDS);
    return names[(Math.random() * names.length) | 0];
}

export function allKindNames() {
    return Object.keys(KAIJU_KINDS);
}

// Default spawn position picker for modded kinds that don't provide
// their own. Spawns above the target civ at a fixed altitude.
function _defaultPickSpawnPos(target) {
    return { x: target.center.x, y: 80, z: target.center.z };
}

// Register a new kaiju kind from a mod. Mod data is JSON-only so it
// can't contain functions — we synthesize pickSpawnPos from a small
// schema (or fall back to default). Returns true on success.
export function registerKaijuKind(name, config) {
    if (!name || typeof name !== "string") {
        console.warn("[kaijuKinds] registerKaijuKind: invalid name");
        return false;
    }
    if (!config || typeof config !== "object") {
        console.warn("[kaijuKinds] registerKaijuKind: invalid config");
        return false;
    }
    // Apply sane defaults for fields modders might forget
    const final = {
        origin:           config.origin           ?? name,
        moveSpeed:        config.moveSpeed        ?? 4.0,
        scale:            config.scale            ?? 3.0,
        color:            config.color            ?? [1.0, 0.8, 0.4],
        bobAmpl:          config.bobAmpl          ?? 0.3,
        spawnFallSpeed:   config.spawnFallSpeed   ?? 18,
        spawnLandY:       config.spawnLandY       ?? 22,
        damageMul:        config.damageMul        ?? 1.0,
        maxLifetime:      config.maxLifetime      ?? 90,
        debrisVoxel:      config.debrisVoxel      ?? 1,
        eruptRing:        config.eruptRing        ?? false,
        pickSpawnPos:     _defaultPickSpawnPos,
    };
    KAIJU_KINDS[name] = final;
    console.log(`[kaijuKinds] registered modded kind "${name}"`);
    return true;
}
