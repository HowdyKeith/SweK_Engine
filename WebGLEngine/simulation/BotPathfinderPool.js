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
                  route = "navmesh", agentRadius = 1.5, jobTimeoutMs = 2000,
                  padSchedule = [HM_PADDING, 60, 144] } = {}) {
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
        // Three rungs: the original window, and two widenings. 60 and 144 are 2.5x steps, so the third rung
        // reaches a detour six times the first's and costs about 13x its cells -- paid only when the two
        // cheaper ones have already failed.
        this.padSchedule = padSchedule;

        const hwc = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
        this.poolSize = poolSize ?? Math.max(2, Math.min(4, hwc - 2));
        this.workers = [];
        this._nextWorker = 0;
        this._jobs = 0;
        this._failures = 0;
        this._byRoute = {};        // how many jobs each planner actually answered
        this._timeouts = 0;        // jobs no worker ever answered -- see plan()
        this._widened = 0;         // snapshots built at a wider pad than the first rung
        this._widenedInVain = 0;   // whole ladders climbed and still no path -- the walled-off case
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
    _heightmapForJob(sx, sz, gx, gz, pad = HM_PADDING) {
        const minX = Math.min(sx, gx) - pad;
        const maxX = Math.max(sx, gx) + pad;
        const minZ = Math.min(sz, gz) - pad;
        const maxZ = Math.max(sz, gz) + pad;
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

    /**
     * *** THE WINDOW IS A RANGE LIMIT ON DETOURS, AND WHEN IT IS TOO NARROW THE BOT DOES NOT GET A LONG PATH,
     * IT GETS NO PATH. *** _heightmapForJob samples ONLY the start/goal bounding box padded by HM_PADDING,
     * so a route whose detour is wider than that is not in the data either planner receives. Measured at
     * v4547 by walking a wall's gap outward: found at 0, 8, 16, 22, 24 and 26 units off the straight line;
     * LOST at 32 and beyond, with BOTH planners correctly returning found:false. BotManager then falls back
     * to direct steering, which walks the bot straight at the thing in its way.
     *
     * Widening the window for every query is the obvious fix and the wrong one: the snapshot is built by
     * calling world._heightAt once per cell AND TRANSFERRED per query, and its area grows quadratically --
     * at a separation of 90, pad 24 is 6,811 cells, pad 64 is 28,251 (4.2x) and pad 128 is 89,179 (13.1x).
     *
     * So the window ESCALATES ON FAILURE, which pays the cost exactly when the narrow one did not work and
     * nothing when it did. The ladder is bounded: a goal that is genuinely walled off fails at every rung and
     * would otherwise pay the whole ladder on every request forever, which is why there are three rungs and
     * not a loop.
     */
    async plan(sx, sz, gx, gz, opts = {}) {
        const pads = opts.pads ?? this.padSchedule;
        let last = null;
        for (let i = 0; i < pads.length; i++) {
            last = await this._planOnce(sx, sz, gx, gz, opts, pads[i]);
            if (last.found) return { ...last, pad: pads[i], attempts: i + 1 };
        }
        if (pads.length > 1) this._widenedInVain++;
        return { ...last, pad: pads[pads.length - 1], attempts: pads.length };
    }

    async _planOnce(sx, sz, gx, gz, opts, pad) {
        this._spinup();
        if (this.workers.length === 0) return { path: null, found: false, expanded: 0 };
        const id = this._nextId++;
        const widx = this._nextWorker++ % this.workers.length;
        const { hm, hmStride, hmOriginX, hmOriginZ } = this._heightmapForJob(sx, sz, gx, gz, pad);
        if (pad !== this.padSchedule[0]) this._widened++;

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
