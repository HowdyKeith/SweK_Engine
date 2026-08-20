// FILE: world/terrainWorkerClient.js
// VERSION: v1 (v2798) — main-thread client for the terrain gen worker
//
// Manages a speculative READY-CHUNK CACHE: the worker pre-bakes chunks
// around the camera (fed by world.prewarmTerrain each frame), and
// world.generateChunk consumes them for free — zero main-thread gen cost
// for the common streamed-chunk case. Anything not pre-baked falls back
// to synchronous main-thread wasm, then JS, exactly as before.
//
// DESIGN RULES (same spirit as terrainWasm.js):
// 1. NEVER required. No Worker support / spawn failure / runtime error →
//    permanent demotion, callers see nulls, sync paths take over.
// 2. Worker output is bit-identical to main-thread wasm (same binary),
//    so consuming a worker chunk uses the SAME tile-ownership rule as a
//    sync wasm chunk. world.js owns that rule; this module just caches.
// 3. Bounded: outstanding requests and the ready cache are capped so a
//    teleport spam can't balloon memory or flood the worker.

const MAX_OUTSTANDING = 4;      // gen requests in flight
const MAX_READY = 256;          // cached chunks (16KB each → ≤4MB)

let _worker = null;
let _ready = false;
let _failed = false;
let _initPromise = null;

const _readyChunks = new Map();  // "cx,cz" → Uint8Array
const _pending = new Set();      // "cx,cz" requested, not yet returned
const _readyOrder = [];          // FIFO for cache eviction

/**
 * Spawn + init the worker. Call only after main-thread wasm init succeeded
 * (the worker statically imports the same pkg). Resolves true if usable.
 */
export function initTerrainWorker({ seed = 1337, useWorley = false, chunkSize = 16, chunkHeight = 64 } = {}) {
    if (_initPromise) return _initPromise;
    _initPromise = new Promise((resolve) => {
        try {
            if (typeof Worker === "undefined") throw new Error("no Worker support");
            _worker = new Worker(new URL("./terrainGenWorker.js", import.meta.url), { type: "module" });
        } catch (err) {
            _failed = true;
            console.warn("[terrainWorker] unavailable — staying on sync wasm.", err?.message ?? err);
            resolve(false);
            return;
        }

        const initTimeout = setTimeout(() => {
            if (!_ready) _demote("init timeout (10s)");
            resolve(false);
        }, 10000);

        _worker.onerror = (e) => {
            _demote(e?.message ?? "worker error");
            clearTimeout(initTimeout);
            resolve(false);
        };

        _worker.onmessage = (ev) => {
            const msg = ev.data;
            if (msg.type === "ready") {
                _ready = true;
                clearTimeout(initTimeout);
                console.log("[terrainWorker] active — chunks pre-bake off the main thread");
                resolve(true);
            } else if (msg.type === "chunk") {
                _pending.delete(msg.key);
                if (_readyChunks.size >= MAX_READY) {
                    const oldest = _readyOrder.shift();
                    if (oldest !== undefined) _readyChunks.delete(oldest);
                }
                _readyChunks.set(msg.key, new Uint8Array(msg.buf));
                _readyOrder.push(msg.key);
            } else if (msg.type === "tile") {
                // informational; ownership was claimed on request
            } else if (msg.type === "init-error" || msg.type === "error") {
                _demote(msg.message);
                clearTimeout(initTimeout);
                resolve(false);
            }
        };

        _worker.postMessage({ type: "init", seed, useWorley, chunkSize, chunkHeight });
    });
    return _initPromise;
}

function _demote(why) {
    if (_failed) return;
    _failed = true;
    _ready = false;
    console.warn(`[terrainWorker] demoted — sync wasm path continues. (${why})`);
    try { _worker?.terminate(); } catch {}
    _worker = null;
    _pending.clear();
    // Keep _readyChunks: already-baked chunks are still valid output.
}

export function workerReady() { return _ready; }

/** Number of further gen requests accepted right now. */
export function workerCapacity() {
    return _ready ? Math.max(0, MAX_OUTSTANDING - _pending.size) : 0;
}

/** True if the chunk is baked or in flight (don't re-request). */
export function workerHasOrPending(key) {
    return _readyChunks.has(key) || _pending.has(key);
}

/** Request a chunk pre-bake. Returns false if at capacity / demoted. */
export function workerRequestChunk(cx, cz) {
    if (!_ready) return false;
    const key = `${cx},${cz}`;
    if (workerHasOrPending(key)) return true;
    if (_pending.size >= MAX_OUTSTANDING) return false;
    _pending.add(key);
    _worker.postMessage({ type: "gen", key, cx, cz });
    return true;
}

/** Consume a baked chunk (removes it from the cache) or null. */
export function workerTakeChunk(key) {
    const vox = _readyChunks.get(key);
    if (!vox) return null;
    _readyChunks.delete(key);
    const i = _readyOrder.indexOf(key);
    if (i >= 0) _readyOrder.splice(i, 1);
    return vox;
}

/** v2800 — trim the worker's erosion tile cache (fire-and-forget). */
export function workerTrimTiles(centerTx, centerTz, keepRadius) {
    if (!_ready) return false;
    _worker.postMessage({ type: "trim", tx: centerTx, tz: centerTz, r: keepRadius });
    return true;
}

/** Warm one erosion tile in the worker's cache. */
export function workerWarmTile(tx, tz) {
    if (!_ready) return false;
    _worker.postMessage({ type: "warmTile", tx, tz });
    return true;
}

export function workerStats() {
    return {
        ready: _ready,
        failed: _failed,
        baked: _readyChunks.size,
        inFlight: _pending.size,
    };
}
