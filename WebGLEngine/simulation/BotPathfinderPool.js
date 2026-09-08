// =============================================================================
// FILE: /simulation/BotPathfinderPool.js
// ROUND: 216
// =============================================================================
//
// Worker pool for bot pathfinding. Each plan() request gets dispatched
// to the next available worker. The main thread captures a heightmap
// snapshot around the bot+goal region, sends it as a transferable
// Int16Array, and resolves with the resulting waypoint array.
//
// Workers run A* — same algorithm as the in-process PathPlanner but
// without function-pointer access to heightAt. The heightmap snapshot
// is sufficient because the search area is bounded.
//
// API:
//   const pool = new BotPathfinderPool({ world });
//   const path = await pool.plan(sx, sz, gx, gz);
//   pool.dispose();
// =============================================================================

const HM_PADDING = 24;          // voxels of padding around the start/goal bbox

export class BotPathfinderPool {
    constructor({ world, poolSize = null, gridSize = 4, waterLevel = null,
                  route = "navmesh", agentRadius = 1.5, jobTimeoutMs = 2000 } = {}) {
        this.world = world;
        this.gridSize = gridSize;
        this.waterLevel = waterLevel;
        // *** v4545 -- WHICH PLANNER THE WORKER USES, AND HOW WIDE THE THING BEING PLANNED FOR IS. ***
        // "navmesh" tries nav/navmesh.mjs first and falls back to this pool's original grid A* when it finds
        // no path; "grid" skips it. Measured on the snapshot shape this file builds -- a heightmap padded 24
        // around the start/goal bbox, with a wall and a gap -- the navmesh route is shorter (96.61 against
        // 99.88 at a separation of 80), further from the walls (clearance 2.000 against 0.850) and carries
        // five to twelve times fewer waypoints for BotManager to chase. It costs 1.4-3.0 ms against
        // 0.25-0.90, which is affordable on a worker thread for a bot that re-plans every few seconds and
        // would not be on the main thread or per frame.
        this.route = route;
        this.agentRadius = agentRadius;
        this.jobTimeoutMs = jobTimeoutMs;

        const hwc = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
        this.poolSize = poolSize ?? Math.max(2, Math.min(4, hwc - 2));
        this.workers = [];
        this._nextWorker = 0;
        this._jobs = 0;
        this._failures = 0;
        this._byRoute = {};        // how many jobs each planner actually answered
        this._timeouts = 0;        // jobs no worker ever answered -- see plan()
        this._totalMs = 0;

        this._workersReady = false;
        this._pendingJobs = new Map();   // id → { resolve, t0 }
        this._nextId = 1;
    }

    _spinup() {
        if (this._workersReady) return;
        if (typeof Worker === "undefined") {
            console.warn("[BotPathfinderPool] no Worker support");
            return;
        }
        for (let i = 0; i < this.poolSize; i++) {
            try {
                const w = new Worker(
                    new URL("../worker/botPathfinder.worker.js", import.meta.url),
                    { type: "module" }
                );
                w.addEventListener("message", (e) => this._onWorkerMessage(e));
                // Round 283 — track activity for the ECG HUD.
                try {
                    import("../ui/workerActivity.js").then(mod => mod.registerWorker?.(`botPath#${i}`, w));
                } catch {}
                this.workers.push(w);
            } catch (e) {
                console.warn("[BotPathfinderPool] worker spawn failed:", e?.message ?? e);
            }
        }
        this._workersReady = true;
        console.log(`[BotPathfinderPool] spun up ${this.workers.length} workers`);
    }

    _onWorkerMessage(e) {
        // *** `route` IS FORWARDED, AND IT WAS BEING SWALLOWED HERE. *** v4545 gave the worker two planners
        // and made it report which one answered; this destructure took four fields and dropped it, so a
        // caller could not tell a navmesh path from a grid one and the fallback was invisible from the
        // outside. Found by driving the real pool in a browser rather than the worker's onmessage in Node.
        const { id, path, found, expanded, route } = e.data;
        const job = this._pendingJobs.get(id);
        if (!job) return;
        this._pendingJobs.delete(id);
        if (job.timer) clearTimeout(job.timer);
        const dt = performance.now() - job.t0;
        this._totalMs += dt;
        this._jobs++;
        if (!found) this._failures++;
        if (route) this._byRoute[route] = (this._byRoute[route] || 0) + 1;
        job.resolve({ path, found, expanded, route, durationMs: dt });
    }

    // Build a heightmap snapshot covering the bounding box of [start, goal]
    // padded by HM_PADDING. Returns { hm, hmStride, hmOriginX, hmOriginZ }.
    _heightmapForJob(sx, sz, gx, gz) {
        const minX = Math.min(sx, gx) - HM_PADDING;
        const maxX = Math.max(sx, gx) + HM_PADDING;
        const minZ = Math.min(sz, gz) - HM_PADDING;
        const maxZ = Math.max(sz, gz) + HM_PADDING;
        const w = Math.ceil(maxX - minX) + 1;
        const d = Math.ceil(maxZ - minZ) + 1;
        const hm = new Int16Array(w * d);
        const hAt = this.world?._heightAt || ((x, z) => 5);
        for (let dz = 0; dz < d; dz++) {
            for (let dx = 0; dx < w; dx++) {
                const wx = Math.floor(minX) + dx;
                const wz = Math.floor(minZ) + dz;
                let y = 0;
                try { y = hAt(wx, wz) | 0; } catch {}
                hm[dz * w + dx] = y;
            }
        }
        return { hm, hmStride: w, hmOriginX: Math.floor(minX), hmOriginZ: Math.floor(minZ) };
    }

    async plan(sx, sz, gx, gz, opts = {}) {
        this._spinup();
        if (this.workers.length === 0) return { path: null, found: false, expanded: 0 };
        const id = this._nextId++;
        const widx = this._nextWorker++ % this.workers.length;
        const { hm, hmStride, hmOriginX, hmOriginZ } = this._heightmapForJob(sx, sz, gx, gz);

        // *** A JOB THAT NEVER COMES BACK USED TO STRAND ITS BOT FOR THE LIFE OF THE PAGE. ***
        // plan() had no reject and no timeout, and simulation/BotManager.js sets bot.pathRequestPending =
        // true before calling and clears it only in .then()/.catch() -- with new requests gated on
        // !pathRequestPending. So one unanswered job meant that bot NEVER ASKED FOR A PATH AGAIN, silently
        // degrading to direct steering with nothing to diagnose it by.
        //
        // Round 216 shipped it that way and nothing could reach it, because a worker either answered or was
        // never spawned. v4545 gave the worker a static import of ../nav/navmesh.mjs, and a module Worker
        // whose import fails to resolve CONSTRUCTS AND THEN DIES -- born alive enough to be posted to and
        // never able to reply. Measured by mistyping that import: the browser harness hung until its own
        // 60-second wait gave up, which is what a bot would do forever.
        //
        // The timeout resolves as not-found rather than rejecting, because that is the shape every caller
        // already handles -- BotManager falls back to direct steering on !found -- and it counts as a
        // failure so the pool's own numbers show it.
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (!this._pendingJobs.has(id)) return;
                this._pendingJobs.delete(id);
                this._failures++;
                this._timeouts++;
                resolve({ path: null, found: false, expanded: 0, route: "timeout", durationMs: this.jobTimeoutMs });
            }, this.jobTimeoutMs);
            this._pendingJobs.set(id, { resolve, t0: performance.now(), timer });
            this.workers[widx].postMessage({
                cmd: "plan",
                id,
                sx, sz, gx, gz,
                hm, hmStride, hmOriginX, hmOriginZ,
                gridSize: this.gridSize,
                waterLevel: this.waterLevel,
                maxStepUp:   opts.maxStepUp   ?? 3,
                maxStepDown: opts.maxStepDown ?? 6,
                maxSearch:   opts.maxSearch   ?? 800,    // smaller than PathPlanner — bot tasks
                slopePenalty: opts.slopePenalty ?? 0.5,
                route:       opts.route       ?? this.route,
                agentRadius: opts.agentRadius ?? this.agentRadius,
            }, [hm.buffer]);
        });
    }

    dispose() {
        for (const w of this.workers) {
            try { w.terminate(); } catch {}
        }
        this.workers = [];
        this._workersReady = false;
        for (const [_, job] of this._pendingJobs) {
            try { job.resolve({ path: null, found: false, expanded: 0 }); } catch {}
        }
        this._pendingJobs.clear();
    }

    getStats() {
        return {
            poolSize: this.workers.length,
            jobs: this._jobs,
            failures: this._failures,
            successRate: this._jobs > 0 ? ((this._jobs - this._failures) / this._jobs) : 0,
            avgMs: this._jobs > 0 ? this._totalMs / this._jobs : 0,
            pending: this._pendingJobs.size,
        };
    }
}
