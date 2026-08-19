// ai/demoAssetRegistry.js — v643
//
// Per-demo asset preferences: declares which library categories each demo
// wants to draw from (lego figures, flora variety, aquarium fish, etc).
// Demos opt IN by querying this registry rather than us patching 42+ demo
// files. Two phases:
//
//   1. THIS TURN: registry + two proof-of-concept hooks (aquarium uses
//      aquaria.list(); treeSpawner mixes in flora.list() entries when
//      placing trees).
//   2. NEXT TURNS: each demo can call `demoAssets.preferred("aquarium")`
//      to pull from the saved library at start, replacing or augmenting
//      its hardcoded asset names.
//
// The registry maps demoId -> { lego?, flora?, aquaria?, ... } where each
// value is `true` (include all saved) or a number cap.

const PREFERENCES = {
    // Aquarium demo wants saved fish from aquaria.list() as additional
    // school members alongside its 6 procedural shapes.
    aquarium: { aquaria: true },

    // Terrain demos with lots of trees benefit from flora variety so they
    // stop looking like boxes-of-the-same-thing. Mix in saved flora.
    kaiju:          { flora: true },
    sandbox:        { flora: true },
    blank_sandbox:  { flora: true },
    asset_pipeline: { flora: 5 },
    ai_pipeline_bench: { lego: true, flora: true },

    // Multiplayer / shooter / arena demos benefit from lego people pool
    // once we have a population. Future deathmatch will draw heavily.
    wad_arena:        { lego: true },
    multiplayer_ogre: { lego: 8 },
    rigged_showcase:  { lego: true, aquaria: true, flora: true },
};

/** Return the asset preferences for a demo id (or undefined). */
export function getPreferences(demoId) {
    return PREFERENCES[demoId];
}

/** All demos that opt into a given library category. */
export function demosFor(category) {
    return Object.entries(PREFERENCES).filter(([, p]) => p[category]).map(([id]) => id);
}

/**
 * For a given demo + category, return up to N saved entries from that library.
 * Returns [] if the library doesn't exist or has nothing saved.
 *   demoAssets.pull("aquarium", "aquaria")  → [{name, prompt, ts, ...}, ...]
 */
export function pull(demoId, category, opts = {}) {
    const pref = PREFERENCES[demoId];
    if (!pref || !pref[category]) return [];
    const limit = (typeof pref[category] === "number") ? pref[category] : (opts.limit ?? 50);
    if (typeof window === "undefined") return [];
    const lib = window[category];   // window.lego / window.flora / window.aquaria
    if (!lib || typeof lib.list !== "function") return [];
    try {
        return lib.list().slice(0, limit);
    } catch { return []; }
}

/** All preferences as a plain map (read-only-ish) — for diagnostics. */
export function snapshot() { return JSON.parse(JSON.stringify(PREFERENCES)); }
