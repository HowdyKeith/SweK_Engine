// FILE: world/ChunkStreamer.js
// VERSION: v1 — round 332
//
// Camera-following chunk streaming. The default VoxelWorld loads
// chunks in a fixed grid around world origin (0,0). That's fine for
// short demos but breaks down when the player flies far enough to
// leave the grid: terrain just ends, the player sees the boundary
// wall, and `dumpChunkGrid()` shows asymmetric loaded chunks.
//
// This streamer adds the missing logic: chunks load as the camera
// enters new area, and (optionally) unload as the camera moves away.
// It's OPT-IN — by default, the existing origin-anchored behavior
// stays untouched. Flip on via console:
//
//   streamer.setEnabled(true)
//
// Design notes:
//
//   • Triggers a load pass only when the camera enters a NEW chunk.
//     Mid-chunk motion does nothing — cheap when player is mostly
//     stationary or moving slowly.
//   • Load queue is sorted by distance² from the camera, so closest
//     missing chunks generate first. Visible "filling in" radiates
//     outward instead of marching in arbitrary order.
//   • Frame budget (default 2 chunks/frame) caps generation cost so
//     a sudden teleport doesn't stall the main thread.
//   • Unloading is conservative: chunks beyond unloadRadius (default
//     gridRadius + 3 — three-chunk hysteresis) get removed. The
//     hysteresis prevents thrashing when the camera oscillates near
//     a boundary.
//   • The streamer does NOT touch boundary walls or coordinate with
//     `growGrid` directly. When streaming is on, gridRadius defines
//     the camera-centered radius rather than the origin-centered one.

export class ChunkStreamer {
    /**
     * @param {Object} cfg
     * @param {Object} cfg.world             VoxelWorld instance
     * @param {Object} cfg.camera            camera with .position.{x,z}
     * @param {number} [cfg.frameChunkBudget=2] max chunks to generate per tick
     * @param {number} [cfg.unloadMargin=3]  unload when chunk is this many
     *                                       cells beyond gridRadius from camera
     * @param {boolean} [cfg.unloadEnabled=false] enable chunk eviction
     */
    constructor({ world, camera,
                  frameChunkBudget = 2,
                  unloadMargin = 3,
                  unloadEnabled = false } = {}) {
        if (!world) throw new Error("ChunkStreamer: world required");
        if (!camera) throw new Error("ChunkStreamer: camera required");
        this.world = world;
        this.camera = camera;
        this.frameChunkBudget = frameChunkBudget;
        this.unloadMargin = unloadMargin;
        this.unloadEnabled = unloadEnabled;

        this._enabled = false;
        this._lastCameraChunkKey = null;
        this._loadQueue = [];

        this._stats = {
            loads: 0,
            unloads: 0,
            chunkChanges: 0,
            totalLoadMs: 0,
            lastTickLoadCount: 0,
        };
    }

    setEnabled(on) {
        const was = this._enabled;
        this._enabled = !!on;
        if (this._enabled && !was) {
            // Force a re-evaluation on next tick so chunks fill in
            // immediately after opt-in.
            this._lastCameraChunkKey = null;
        }
        return this._enabled;
    }

    isEnabled() { return this._enabled; }

    /** Per-frame tick. Cheap no-op when disabled (early return). */
    tick() {
        if (!this._enabled) return;
        const cs = this.world.chunkSize;
        const cx = Math.floor(this.camera.position.x / cs);
        const cz = Math.floor(this.camera.position.z / cs);
        const key = `${cx},${cz}`;

        // Detect chunk change — rebuild load queue centered on new pos
        if (key !== this._lastCameraChunkKey) {
            this._lastCameraChunkKey = key;
            this._stats.chunkChanges++;
            this._enqueueMissingAround(cx, cz);
            if (this.unloadEnabled) {
                this._unloadFar(cx, cz);
            }
        }

        // Process queue up to budget
        let processed = 0;
        while (processed < this.frameChunkBudget && this._loadQueue.length > 0) {
            const next = this._loadQueue.shift();
            // It's possible the chunk got created between enqueue and now
            // (e.g. via direct setVoxel touching a not-yet-created chunk).
            // Skip if so.
            const nkey = `${next.cx},${next.cz}`;
            if (this.world.chunks.has(nkey)) continue;
            this._loadOne(next.cx, next.cz);
            processed++;
        }
        this._stats.lastTickLoadCount = processed;
    }

    /** Build sorted list of missing chunks within gridRadius of (cx,cz). */
    _enqueueMissingAround(cx, cz) {
        const r = this.world.gridRadius;
        const candidates = [];
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const tcx = cx + dx;
                const tcz = cz + dz;
                if (this.world.chunks.has(`${tcx},${tcz}`)) continue;
                candidates.push({
                    cx: tcx, cz: tcz,
                    d2: dx * dx + dz * dz,
                });
            }
        }
        // Closest first — visible filling radiates outward
        candidates.sort((a, b) => a.d2 - b.d2);
        this._loadQueue = candidates;
    }

    _loadOne(cx, cz) {
        const t0 = (typeof performance !== "undefined") ? performance.now() : 0;
        try {
            const chunk = this.world.generateChunk(cx, cz);
            chunk.dirty = true;
            this.world.chunks.set(`${cx},${cz}`, chunk);
            this._stats.loads++;
            const t1 = (typeof performance !== "undefined") ? performance.now() : 0;
            this._stats.totalLoadMs += (t1 - t0);
        } catch (e) {
            console.warn(`[ChunkStreamer] generateChunk(${cx},${cz}) failed:`,
                         e?.message ?? e);
        }
    }

    _unloadFar(cx, cz) {
        const r = this.world.gridRadius + this.unloadMargin;
        const r2 = r * r;
        const toRemove = [];
        for (const key of this.world.chunks.keys()) {
            const [kx, kz] = key.split(",").map(Number);
            const dx = kx - cx, dz = kz - cz;
            if (dx * dx + dz * dz > r2) toRemove.push(key);
        }
        for (const key of toRemove) {
            this.world.chunks.delete(key);
            this._stats.unloads++;
            // PATCH-VR4 -- notify the renderer so it frees the chunk's GPU
            // mesh immediately (main.js wires this to removeChunkMesh; the
            // renderer's periodic orphan sweep is the safety net if unwired).
            try { this.onChunkUnloaded?.(key); } catch {}
        }
        // If the renderer caches visible-chunk lists, invalidate
        if (this.world._invalidateVisibleCache) {
            try { this.world._invalidateVisibleCache(); } catch {}
        }
    }

    stats() {
        return {
            enabled: this._enabled,
            chunkCount: this.world.chunks.size,
            queueLength: this._loadQueue.length,
            ...this._stats,
            avgLoadMs: this._stats.loads > 0
                ? this._stats.totalLoadMs / this._stats.loads
                : 0,
        };
    }

    /** Tunables can be adjusted from console without rebuilding. */
    setFrameChunkBudget(n) { this.frameChunkBudget = Math.max(1, n | 0); }
    setUnloadEnabled(on)   { this.unloadEnabled = !!on; }
    setUnloadMargin(n)     { this.unloadMargin = Math.max(0, n | 0); }
}
