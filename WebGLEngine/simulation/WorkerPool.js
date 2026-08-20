// FILE: simulation/WorkerPool.js
// VERSION: v1 — round 331
//
// Generic Web Worker pool with promise-based submit/result. Built for
// mesh post-processing (weld → normals) but the API is task-agnostic
// — pass any { op, payload } and route by op inside the worker.
//
// Design:
//   • Constructor spins up N workers from a given URL
//   • submit(op, payload, transferList) returns a Promise<response>
//   • Pool routes responses back to the right promise via a job id
//   • Workers are picked round-robin; no priority queueing in v1
//   • dispose() terminates all workers and rejects pending jobs
//
// Worker contract:
//   • Worker module receives { id, op, payload } on message
//   • Worker module replies with { id, ok, ...response } via postMessage
//     (transferable buffers should be transferred, not cloned)
//   • If a worker reports { ok: false, error }, the promise rejects

// Priority bands — lower number = higher priority. Interactive loads (user
// spawned an asset) jump ahead of opportunistic re-processing and background
// batches when all workers are busy.
export const PRIORITY = { INTERACTIVE: 0, OPPORTUNISTIC: 1, BACKGROUND: 2 };

let _globalJobId = 1;

export class WorkerPool {
    /**
     * @param {Object} cfg
     * @param {string|URL} cfg.workerUrl  resolved URL passed to new Worker(...)
     * @param {number}     [cfg.size]     worker count (default: HW concurrency / 2, min 1, max 4)
     * @param {string}     [cfg.label]    optional name for ECG-HUD activity tracking
     */
    constructor({ workerUrl, size, label = "pool" } = {}) {
        if (!workerUrl) throw new Error("WorkerPool: workerUrl required");
        this.workerUrl = workerUrl;
        this.label = label;
        const hw = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
        this.size = Math.max(1, Math.min(4, size ?? Math.floor(hw / 2)));

        this.workers = [];
        this._idle = [];             // indices of currently-free workers
        this._queue = [];            // jobs waiting for a free worker (priority-ordered on drain)
        this._pending = new Map();   // jobId → { resolve, reject, t0, wi }
        this._disposed = false;

        // Stats — read via stats() for debugging / portfolio screenshots
        this._totalJobs = 0;
        this._totalMs = 0;
        this._failures = 0;

        this._spinup();
    }

    _spinup() {
        if (typeof Worker === "undefined") {
            console.warn(`[WorkerPool:${this.label}] no Worker support — pool disabled`);
            return;
        }
        for (let i = 0; i < this.size; i++) {
            try {
                const w = new Worker(this.workerUrl, { type: "module" });
                w.addEventListener("message", (e) => this._onMessage(e));
                w.addEventListener("error", (e) => this._onError(e));
                // Round 283 — register with the worker ECG HUD if available
                // for live activity visualization. Lazy import: pool works
                // without it.
                try {
                    import("../ui/workerActivity.js").then(mod =>
                        mod.registerWorker?.(`${this.label}#${i}`, w)
                    );
                } catch {}
                this.workers.push(w);
            } catch (e) {
                console.warn(`[WorkerPool:${this.label}] spawn failed:`, e?.message ?? e);
            }
        }
        this._idle = this.workers.map((_, i) => i);
        if (this.workers.length === 0) {
            console.warn(`[WorkerPool:${this.label}] no workers spun up`);
        } else {
            console.log(`[WorkerPool:${this.label}] spun up ${this.workers.length} workers`);
        }
    }

    /**
     * Submit a job. Returns a Promise that resolves with the worker's
     * response (minus the protocol fields).
     *
     * @param {string}        op           operation name (worker routes on this)
     * @param {Object}        payload      operation payload (must be cloneable)
     * @param {ArrayBuffer[]} [transfer]   transferable buffers (zero-copy)
     * @param {number}        [priority]   PRIORITY band (default OPPORTUNISTIC)
     */
    submit(op, payload, transfer = [], priority = PRIORITY.OPPORTUNISTIC) {
        if (this._disposed) return Promise.reject(new Error("WorkerPool disposed"));
        if (this.workers.length === 0) {
            return Promise.reject(new Error("WorkerPool has no workers"));
        }
        const id = _globalJobId++;
        return new Promise((resolve, reject) => {
            this._queue.push({ id, op, payload, transfer, priority, resolve, reject });
            this._drain();
        });
    }

    // Dispatch queued jobs to free workers, highest priority first (lowest
    // band number; FIFO within a band). Called on submit and whenever a
    // worker frees up in _onMessage.
    _drain() {
        while (this._idle.length > 0 && this._queue.length > 0) {
            let best = 0;
            for (let i = 1; i < this._queue.length; i++) {
                if (this._queue[i].priority < this._queue[best].priority) best = i;
            }
            const job = this._queue.splice(best, 1)[0];
            const wi = this._idle.pop();
            const w = this.workers[wi];
            const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
            this._pending.set(job.id, { resolve: job.resolve, reject: job.reject, t0: now, wi });
            try {
                w.postMessage({ id: job.id, op: job.op, payload: job.payload }, job.transfer || []);
            } catch (e) {
                this._pending.delete(job.id);
                this._idle.push(wi);          // hand the worker back
                job.reject(e);
            }
        }
    }

    _onMessage(e) {
        const data = e.data || {};
        const job = this._pending.get(data.id);
        if (!job) return;   // stale or unknown id
        this._pending.delete(data.id);
        if (job.wi != null) this._idle.push(job.wi);   // worker is free again
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        const dt = now - job.t0;
        this._totalMs += dt;
        this._totalJobs++;
        if (!data.ok) {
            this._failures++;
            job.reject(new Error(data.error || "worker failed"));
        } else {
            data.durationMs = dt;
            job.resolve(data);
        }
        this._drain();   // a worker freed up — pick up the next queued job
    }

    _onError(e) {
        // Worker-level error — can't tie to a specific job. Log loud.
        console.error(`[WorkerPool:${this.label}] worker error:`, e?.message ?? e);
    }

    /** Aggregate stats for telemetry / portfolio displays. */
    stats() {
        return {
            label: this.label,
            workers: this.workers.length,
            jobs: this._totalJobs,
            failures: this._failures,
            totalMs: this._totalMs,
            avgMs: this._totalJobs > 0 ? this._totalMs / this._totalJobs : 0,
            pending: this._pending.size,
            queued: this._queue.length,
            idle: this._idle.length,
        };
    }

    /** Terminate all workers and reject any pending jobs. */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        for (const w of this.workers) {
            try { w.terminate(); } catch {}
        }
        this.workers = [];
        for (const job of this._pending.values()) {
            job.reject(new Error("WorkerPool disposed"));
        }
        this._pending.clear();
        for (const job of this._queue) { try { job.reject(new Error("WorkerPool disposed")); } catch {} }
        this._queue = [];
    }
}

WorkerPool.PRIORITY = PRIORITY;
