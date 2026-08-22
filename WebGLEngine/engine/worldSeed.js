// FILE: engine/worldSeed.js
// VERSION: v1 — round 359
//
// Single source of truth for procedural world generation seed. Until
// v359 each generator (CaveCarver, BiomeDecorPool, future modules) had
// its own hard-coded fallback seed (4242, 1337, etc.) which meant the
// same reload could produce different cave layouts vs different decor
// placement. This unifies them and persists across reloads.
//
// Determinism guarantee: as long as the same world seed is in
// localStorage AND the generators don't pull from Math.random outside
// the seeded path, two reloads produce identical worlds.
//
// API:
//   getWorldSeed()        → current seed (always returns a value)
//   setWorldSeed(n)        → set explicit seed, persist, return new value
//   regenerateSeed()       → pick a fresh random seed, persist, return
//   ensureSeeded()         → like get() but logs once if newly-generated
//
// Persistence:
//   localStorage key "voxelengine.worldSeed_v1"

const STORAGE_KEY = "voxelengine.worldSeed_v1";
const FALLBACK_DEFAULT = 4242;   // matches CaveCarver's historical default

let _cached = null;

function _readStorage() {
    try {
        if (typeof localStorage === "undefined") return null;
        const v = localStorage.getItem(STORAGE_KEY);
        if (v === null || v === "") return null;
        const n = parseInt(v, 10);
        return Number.isFinite(n) ? n : null;
    } catch {
        return null;
    }
}

function _writeStorage(n) {
    try {
        if (typeof localStorage === "undefined") return;
        localStorage.setItem(STORAGE_KEY, String(n));
    } catch {}
}

/** Pick a fresh random seed in the safe-integer range (deterministic-friendly). */
function _newRandomSeed() {
    // 31-bit range so multiplications stay within JS's safe integer range
    return (Math.random() * 0x7fffffff) | 0 || FALLBACK_DEFAULT;
}

/**
 * Return the current world seed. On first call, either reads from
 * localStorage or generates a fresh random seed and persists it.
 */
export function getWorldSeed() {
    if (_cached !== null) return _cached;
    const stored = _readStorage();
    if (stored !== null) {
        _cached = stored;
        return _cached;
    }
    // No prior seed — generate, persist, return
    _cached = _newRandomSeed();
    _writeStorage(_cached);
    return _cached;
}

/** Set an explicit seed value. Returns the new seed. */
export function setWorldSeed(n) {
    const seed = (n | 0) || FALLBACK_DEFAULT;
    _cached = seed;
    _writeStorage(seed);
    console.log(`[worldSeed] set to ${seed}; reload to regenerate procedural content`);
    return seed;
}

/** Generate a fresh random seed and persist it. Returns the new seed. */
export function regenerateSeed() {
    const seed = _newRandomSeed();
    _cached = seed;
    _writeStorage(seed);
    console.log(`[worldSeed] regenerated → ${seed}; reload to apply`);
    return seed;
}

/**
 * Like getWorldSeed() but emits a one-time console line when we're
 * generating fresh — useful for diagnosing "why does my world look
 * different every reload?" before localStorage gets primed.
 */
export function ensureSeeded() {
    const had = _readStorage() !== null;
    const seed = getWorldSeed();
    if (!had) console.log(`[worldSeed] no prior seed; generated and persisted ${seed}`);
    return seed;
}

/** Test-only: reset the in-memory cache so getWorldSeed re-reads storage. */
export function _resetCache() { _cached = null; }
