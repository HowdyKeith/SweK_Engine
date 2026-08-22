// =============================================================================
// FILE: /world/biomeDecorPool.js
// ROUND: 214
// =============================================================================
//
// Multi-worker pool that fans biome decoration planning out across CPU
// cores. Splits the world region into TILE_SIZE×TILE_SIZE tiles, sends
// each tile to a worker, gathers placement records, and applies them
// via router.exec(entity:spawnMesh) on the main thread.
//
// Why workers instead of idle scheduler?
//   • Idle scheduler ticks are single-threaded; 200×200 region scan
//     takes seconds at perTick=1
//   • Workers run in parallel — typical 8-core machine paints in
//     ~200ms instead of ~5s
//   • Main thread stays responsive while painting (no frame hitches)
//
// API:
//   const pool = new BiomeDecorPool({ router, world, biomeMap });
//   await pool.plan({ region: 200, center: {x:0,z:0}, density: 1.0 });
//   pool.dispose();   // terminate all workers
//
// Subscribes to world.onRegenerate so it auto-re-plans after demos.
// =============================================================================

const TILE_SIZE = 64;          // each worker handles a 64×64 tile

export class BiomeDecorPool {
    constructor({ router, world, biomeMap, seed = 1337, poolSize = null } = {}) {
        this.router = router;
        this.world = world;
        this.biomeMap = biomeMap;
        this.seed = seed;
        this.placedEntities = [];   // entity ids we've spawned (for clear/regen)

        // Worker pool size: cap at navigator.hardwareConcurrency or 4
        const hwc = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
        this.poolSize = poolSize ?? Math.max(2, Math.min(8, hwc - 1));
        this.workers = [];
        this._busy = new Array(this.poolSize).fill(false);
        this._nextWorkerIdx = 0;
        this._spawnedTotal = 0;
        this._jobsCompleted = 0;
        this._lastPlanMs = 0;

        // Spawn workers lazily on first plan() so a never-used pool
        // doesn't allocate them.
        this._workersReady = false;
    }

    _spinupWorkers() {
        if (this._workersReady) return;
        if (typeof Worker === "undefined") {
            console.warn("[BiomeDecorPool] no Worker support — pool disabled");
            return;
        }
        for (let i = 0; i < this.poolSize; i++) {
            try {
                const w = new Worker(
                    new URL("../worker/biomeDecorPlanner.worker.js", import.meta.url),
                    { type: "module" }
                );
                // Round 283 — track activity for the ECG HUD. Lazy-
                // imported so we don't break headless test runners
                // that don't have the UI module on disk.
                try {
                    import("../ui/workerActivity.js").then(mod => mod.registerWorker?.(`biomeDecor#${i}`, w));
                } catch {}
                this.workers.push(w);
            } catch (e) {
                console.warn(`[BiomeDecorPool] worker spawn failed (${i}):`, e?.message ?? e);
            }
        }
        this._workersReady = true;
        console.log(`[BiomeDecorPool] spun up ${this.workers.length} workers`);
    }

    // Build a heightmap snapshot for a tile (Int16Array, transferable)
    _heightmapFor(x0, z0, x1, z1) {
        const w = x1 - x0, d = z1 - z0;
        const hm = new Int16Array(w * d);
        for (let zi = 0; zi < d; zi++) {
            for (let xi = 0; xi < w; xi++) {
                const x = x0 + xi;
                const z = z0 + zi;
                // Prefer world's API; fall back to a top-down scan
                let y = 0;
                if (this.world?._heightAt) {
                    try { y = this.world._heightAt(x, z) | 0; } catch {}
                } else if (this.world?.voxelAt) {
                    for (let yy = 60; yy >= 0; yy--) {
                        if (this.world.voxelAt(x, yy, z)) { y = yy; break; }
                    }
                }
                hm[zi * w + xi] = y;
            }
        }
        return hm;
    }

    _planTileOnWorker(workerIdx, tile, density) {
        return new Promise((resolve) => {
            const w = this.workers[workerIdx];
            if (!w) { resolve({ placements: null, count: 0 }); return; }
            const handler = (e) => {
                if (e.data.id !== tile.id) return;
                w.removeEventListener("message", handler);
                resolve(e.data);
            };
            w.addEventListener("message", handler);
            w.postMessage({
                cmd: "plan",
                id: tile.id,
                x0: tile.x0, z0: tile.z0, x1: tile.x1, z1: tile.z1,
                heightmap: tile.hm,
                hmStride: tile.x1 - tile.x0,
                seed: this.seed,
                density,
            // follow the WORLD's flag rather than re-deriving it: decor and terrain must agree
            useWorley: !!(this.world && this.world.useWorleyBiomes),
        }, [tile.hm.buffer]);
        });
    }

    async plan(opts = {}) {
        if (this._disabled) return { placed: 0, disabled: true };   // v510 — kill switch
        // v623 — if the active demo hides terrain (isolation exclusive/clean),
        // skip the entire plan. Without this, switching to a non-terrain demo
        // could still kick off the worker pool from any caller (initial boot,
        // world.regenerate hook, console invocation). Workers don't render
        // anything but they tick CPU + spawn entities that filter doesn't catch
        // in "clean" mode. Bailing here is the cleanest single-point gate.
        try {
            if (typeof window !== "undefined" &&
                (window._demoIsolation === "exclusive" || window._demoIsolation === "clean")) {
                return { placed: 0, skipped: "terrain-hidden" };
            }
        } catch {}
        this._spinupWorkers();
        if (this.workers.length === 0) return { placed: 0, skipped: true };
        const region = opts.region ?? 200;
        const center = opts.center ?? { x: 0, z: 0 };
        const density = opts.density ?? 1.0;
        const clearFirst = opts.clearFirst !== false;     // default true

        if (clearFirst) this.clear();

        const t0 = (typeof performance !== "undefined") ? performance.now() : Date.now();
        const r = region >> 1;
        const x0 = center.x - r;
        const z0 = center.z - r;
        const x1 = center.x + r;
        const z1 = center.z + r;
        // Build tile list
        const tiles = [];
        let nextId = 1;
        for (let tz = z0; tz < z1; tz += TILE_SIZE) {
            for (let tx = x0; tx < x1; tx += TILE_SIZE) {
                const tx1 = Math.min(tx + TILE_SIZE, x1);
                const tz1 = Math.min(tz + TILE_SIZE, z1);
                tiles.push({
                    id: nextId++,
                    x0: tx, z0: tz, x1: tx1, z1: tz1,
                    hm: this._heightmapFor(tx, tz, tx1, tz1),
                });
            }
        }

        // Dispatch round-robin
        const results = [];
        let inflight = 0;
        let dispatched = 0;
        await new Promise((resolveAll) => {
            const trySchedule = () => {
                while (dispatched < tiles.length && inflight < this.workers.length) {
                    const tile = tiles[dispatched++];
                    const idx = this._nextWorkerIdx++ % this.workers.length;
                    inflight++;
                    this._planTileOnWorker(idx, tile, density).then((res) => {
                        results.push(res);
                        inflight--;
                        if (dispatched >= tiles.length && inflight === 0) resolveAll();
                        else trySchedule();
                    });
                }
            };
            if (tiles.length === 0) resolveAll();
            else trySchedule();
        });

        // Apply results on main thread
        let totalPlaced = 0;
        for (const r of results) {
            if (!r.placements || r.count <= 0) continue;
            const kinds = r.kinds || ["rock", "boulder", "tree_stump", "obelisk", "fauna_small"];
            for (let i = 0; i < r.count; i++) {
                const off = i * 8;
                const x = r.placements[off + 0];
                const z = r.placements[off + 1];
                const y = r.placements[off + 2];
                const scale   = r.placements[off + 3];
                const yaw     = r.placements[off + 4];
                const kindIdx = r.placements[off + 5] | 0;
                const kind    = kinds[kindIdx] || "rock";
                if (!this.router?.exec) continue;
                // Round 510 — the worker's heightmap Y (from world._heightAt, a
                // PREDICTION) diverges from the actual meshed terrain, which left
                // decor floating high in the air and "spawning a lot" up there.
                // Ignore the worker Y; re-probe the LIVE top solid voxel and seat
                // the decor on it. Skip if there's no real ground yet (terrain
                // still generating — it'll be placed on a later plan pass) or the
                // surface is water (no boulders bobbing on lakes).
                let spawnY = y;
                if (this.world?.voxelAt && this.world?.getChunk) {
                    const cx = x | 0, cz = z | 0;
                    const chunk = this.world.getChunk(cx, cz);
                    if (!chunk) continue;
                    const maxY = chunk.height ?? 64;
                    let topY = -1;
                    for (let yy = maxY - 1; yy >= 1; yy--) { if (this.world.voxelAt(cx, yy, cz) !== 0) { topY = yy; break; } }
                    if (topY < 1) continue;
                    const surfV = this.world.voxelAt(cx, topY, cz);
                    if (surfV === 10 || surfV === 11) continue;   // VOXEL.WATER/FLOWING_WATER
                    spawnY = topY + 1;
                }
                try {
                    const result = this.router.exec({
                        type: "entity:spawnMesh",
                        assetId: kind,
                        kind,
                        x, y: spawnY, z, scale, yaw,
                    });
                    if (result?.ok && result.id != null) {
                        this.placedEntities.push(result.id);
                        totalPlaced++;
                    }
                } catch (e) { /* swallow spawn errors */ }
            }
        }
        const t1 = (typeof performance !== "undefined") ? performance.now() : Date.now();
        this._lastPlanMs = t1 - t0;
        this._spawnedTotal += totalPlaced;
        this._jobsCompleted++;
        console.log(`[BiomeDecorPool] planned ${tiles.length} tiles, placed ${totalPlaced} entities in ${this._lastPlanMs.toFixed(0)}ms (pool=${this.workers.length})`);
        return { placed: totalPlaced, durationMs: this._lastPlanMs, tiles: tiles.length };
    }

    // Despawn everything this pool placed (for re-plan on regen)
    clear() {
        if (!this.router) return;
        for (const id of this.placedEntities) {
            try { this.router.exec({ type: "entity:despawn", id }); } catch {}
        }
        this.placedEntities = [];
    }

    dispose() {
        for (const w of this.workers) {
            try { w.terminate(); } catch {}
        }
        this.workers = [];
        this._workersReady = false;
    }

    getStats() {
        return {
            poolSize: this.workers.length,
            placedTotal: this._spawnedTotal,
            jobsCompleted: this._jobsCompleted,
            lastPlanMs: this._lastPlanMs,
            placedEntitiesAlive: this.placedEntities.length,
        };
    }
}
