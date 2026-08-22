// FILE: world/terrainWasm.js
// VERSION: v1 — WASM terrain generation loader (Rust crate: wasm-terrain/)
//
// Thin, failure-tolerant wrapper around the wasm-pack output expected at
// world/wasm/terrain_wasm.js + world/wasm/terrain_wasm_bg.wasm (see
// wasm-terrain/build_wasm.bat, which builds and copies it there).
//
// DESIGN RULES
// ------------
// 1. NEVER required. If the pkg is missing, fails to fetch, fails to
//    instantiate, or throws at runtime, every export degrades to a null
//    return and the caller (world.js) uses the original JS path. Shipping
//    the engine without ever running the Rust build must keep working.
// 2. Dynamic import only — a static `import ... from "./wasm/..."` would
//    hard-fail module resolution for everyone without the build.
// 3. ONE generator instance per world config (seed / worley flag / chunk
//    dims). world.js calls initTerrainWasm() once from its constructor.
// 4. TILE OWNERSHIP lives in world.js, not here. Rust sin/cos and V8
//    sin/cos may differ by 1 ulp; hydraulic erosion amplifies that within
//    a 128x128 tile, so a tile must be generated wholly by one path.
//    world.js tracks which tiles are wasm-owned and routes _heightAt
//    accordingly; this module just executes.

let _mod = null;        // wasm-bindgen JS module
let _gen = null;        // TerrainGen instance
let _ready = false;
let _failed = false;
let _initPromise = null;

/**
 * Kick off (or join) wasm init. Safe to call multiple times.
 * Resolves true if the wasm path is usable, false otherwise.
 */
export function initTerrainWasm({ seed = 1337, useWorley = false, chunkSize = 16, chunkHeight = 64 } = {}) {
    if (_initPromise) return _initPromise;
    _initPromise = (async () => {
        try {
            // Missing build → this import rejects → JS fallback.
            _mod = await import("./wasm/terrain_wasm.js");
            // wasm-pack web target: default export fetches *_bg.wasm
            // relative to the module URL.
            await _mod.default();
            _gen = new _mod.TerrainGen(seed | 0, !!useWorley, chunkSize, chunkHeight);
            _ready = true;
            console.log(`[terrainWasm] active (seed=${seed | 0}, worley=${!!useWorley})`);
        } catch (err) {
            _failed = true;
            console.warn("[terrainWasm] not available — using JS terrain path.",
                (err && err.message) ? err.message : err);
        }
        return _ready;
    })();
    return _initPromise;
}

export function wasmTerrainReady() { return _ready; }
export function wasmTerrainFailed() { return _failed; }

// Any runtime throw permanently demotes to the JS path — a generator that
// throws once (OOM, detached memory after a worker transfer, etc.) is not
// something to retry per-chunk in the render loop.
function _demote(where, err) {
    _ready = false;
    _failed = true;
    console.warn(`[terrainWasm] ${where} failed — demoting to JS path.`, err);
    return null;
}

/** Full chunk voxel array (Uint8Array, size*height*size) or null. */
export function wasmGenerateChunk(cx, cz) {
    if (!_ready) return null;
    try {
        return _gen.generate_chunk(cx | 0, cz | 0);
    } catch (err) {
        return _demote("generate_chunk", err);
    }
}

/** Eroded, clamped column height (same semantics as world._heightAt) or null. */
export function wasmHeightAt(wx, wz) {
    if (!_ready) return null;
    try {
        return _gen.height_at(wx | 0, wz | 0);
    } catch (err) {
        return _demote("height_at", err);
    }
}

/** Generate + cache one erosion tile ahead of the camera. */
export function wasmPrewarmTile(tx, tz) {
    if (!_ready) return false;
    try {
        _gen.prewarm_tile(tx | 0, tz | 0);
        return true;
    } catch (err) {
        _demote("prewarm_tile", err);
        return false;
    }
}

/** v2800 — drop cached erosion tiles beyond keep_radius of a tile center.
 *  Safe (deterministic regen); bounds long-session memory. */
export function wasmTrimTiles(centerTx, centerTz, keepRadius) {
    if (!_ready) return 0;
    try { return _gen.trim_tiles(centerTx | 0, centerTz | 0, keepRadius | 0); }
    catch (err) { _demote("trim_tiles", err); return 0; }
}

export function wasmTileCached(tx, tz) {
    if (!_ready) return false;
    try { return _gen.tile_cached(tx | 0, tz | 0); } catch { return false; }
}

/** Console debugging: window.world.wasmGenStats() */
export function wasmStats() {
    return {
        ready: _ready,
        failed: _failed,
        tilesCached: _ready ? _gen.tiles_cached() : 0,
    };
}
