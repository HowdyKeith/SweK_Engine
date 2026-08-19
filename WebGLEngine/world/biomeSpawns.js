// world/biomeSpawns.js
//
// Per-biome tree + decor spawn tables (v2788), keyed to the Worley biomes (world/worleyBiomes.js). The old
// treeSpawner.js / biomeDecorPlanner drove placement off the single-axis biomeMap; this gives each of the 8
// Worley biomes its own ecology -- dense jungle/forest, near-bare tundra, sparse desert palms -- as a pure,
// deterministic function a planner (main thread or worker) can call per column. Asset kind names match the
// existing spawn pipeline (tree_oak/tree_pine/tree_palm; rock/boulder/tree_stump/obelisk/fauna_small).
//
// Browser/worker-safe: imports only the (pure) biome classifier.

import { biomeAt, BIOMES } from "./worleyBiomes.js";

// density = probability a given column spawns that category. kinds = weighted list [[name, weight], ...].
export const BIOME_SPAWNS = {
    tundra:    { treeDensity: 0.004, treeKinds: [["tree_pine", 1]],                 decorDensity: 0.030, decorKinds: [["rock", 3], ["boulder", 2]] },
    taiga:     { treeDensity: 0.070, treeKinds: [["tree_pine", 4], ["tree_oak", 1]], decorDensity: 0.040, decorKinds: [["rock", 2], ["boulder", 1], ["tree_stump", 2]] },
    shrubland: { treeDensity: 0.010, treeKinds: [["tree_oak", 1]],                  decorDensity: 0.050, decorKinds: [["rock", 3], ["boulder", 2], ["fauna_small", 1]] },
    plains:    { treeDensity: 0.020, treeKinds: [["tree_oak", 1]],                  decorDensity: 0.030, decorKinds: [["rock", 2], ["fauna_small", 2]] },
    forest:    { treeDensity: 0.130, treeKinds: [["tree_oak", 3], ["tree_pine", 2]], decorDensity: 0.050, decorKinds: [["tree_stump", 3], ["boulder", 1], ["fauna_small", 2]] },
    desert:    { treeDensity: 0.006, treeKinds: [["tree_palm", 1]],                 decorDensity: 0.035, decorKinds: [["rock", 3], ["boulder", 2], ["obelisk", 1]] },
    savanna:   { treeDensity: 0.018, treeKinds: [["tree_oak", 1], ["tree_palm", 1]], decorDensity: 0.040, decorKinds: [["rock", 2], ["fauna_small", 3]] },
    jungle:    { treeDensity: 0.160, treeKinds: [["tree_oak", 2], ["tree_palm", 3]], decorDensity: 0.060, decorKinds: [["tree_stump", 3], ["fauna_small", 3]] },
};

// deterministic 0..1 hash for a (column, salt) pair -- independent channels via salt so tree vs decor vs kind
// rolls don't correlate.
function _roll(wx, wz, seed, salt) {
    let h = (Math.imul(wx, 374761393) ^ Math.imul(wz, 668265263) ^ Math.imul(seed, 982451653) ^ Math.imul(salt, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
}

function _pickWeighted(kinds, r) {
    let total = 0; for (const [, w] of kinds) total += w;
    let acc = 0; const target = r * total;
    for (const [name, w] of kinds) { acc += w; if (target < acc) return name; }
    return kinds[kinds.length - 1][0];
}

// The core: given a KNOWN biome, decide what (if anything) spawns at this column. Trees take precedence over
// decor (one thing per column). Returns { category, kind } or null.
export function spawnAt(biome, wx, wz, seed) {
    const t = BIOME_SPAWNS[biome];
    if (!t) return null;
    if (_roll(wx, wz, seed, 1) < t.treeDensity) return { category: "tree", kind: _pickWeighted(t.treeKinds, _roll(wx, wz, seed, 2)) };
    if (_roll(wx, wz, seed, 3) < t.decorDensity) return { category: "decor", kind: _pickWeighted(t.decorKinds, _roll(wx, wz, seed, 4)) };
    return null;
}

// Full plan for a column: classify the Worley biome, then spawn. { category, kind, biome } or null.
export function biomeSpawnPlan(wx, wz, seed) {
    const biome = biomeAt(wx, wz, seed).primary;
    const s = spawnAt(biome, wx, wz, seed);
    return s ? { ...s, biome } : null;
}

// Every biome the classifier can emit must have a spawn table (guards against a missing entry).
export function spawnCoverageComplete() {
    return Object.keys(BIOMES).every((b) => !!BIOME_SPAWNS[b]);
}
