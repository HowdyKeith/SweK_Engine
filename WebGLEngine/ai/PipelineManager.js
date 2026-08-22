// =============================================================================
// FILE: /ai/PipelineManager.js
// ROUND: 188
// =============================================================================
//
// Pipeline-parallel multi-asset generation. Lets N kaiju assets cook through
// the narrative → OBJ → texture → trellis pipeline concurrently, with each
// stage gated by its own semaphore so the GPU/Ollama isn't oversubscribed.
//
// The model:
//   - Each asset is a "job" with a unique id and a prompt
//   - The pipeline has named stages, each with a per-stage concurrency limit
//   - Jobs flow through stages serially (must finish stage K before stage K+1)
//   - Multiple jobs can sit on different stages at the same time (pipeline
//     parallelism); multiple jobs can sit on the SAME stage if the stage
//     concurrency limit allows it (rare — most stages here are 1)
//
// Why this layout:
//   With Trellis at ~5-10 min/asset and concurrency=1 on every stage,
//   running 5 jobs serially = 25-50 min. Pipelined, total wall-clock drops
//   to ~max(NarrativeTime) + max(OBJTime) + max(TextureTime) + 5*TrellisTime
//   ≈ 5*max(stages) ≈ same as one sequential pass. So 5 assets in roughly
//   the time of 1 sequential run.
//
// Design choices:
//   - Stage functions are user-supplied async (job) => result. The manager
//     awaits them under the semaphore lock and stamps the result onto the
//     job before advancing to the next stage.
//   - Per-job error handling: a job that fails one stage halts THAT job
//     (no further stages run for it) but does NOT halt other jobs. The
//     failure is recorded on the job state.
//   - The manager fires onJobUpdate(job) on every state change so the
//     UI can render progress live without polling.
//   - No retries built in — caller can re-submit a failed job manually.
//     Future: per-stage retry policy.
//
// Public API:
//   new PipelineManager({ stages, onJobUpdate? })
//     stages   = [{ name, concurrency, run: async (job) => result }, ...]
//     onJobUpdate optional — called as (job) on every state transition
//
//   submit(jobInput)   — { id, prompt, ...whatever }; returns the tracked job
//   run()              — kicks scheduling; resolves when all submitted jobs
//                        have settled (succeeded or failed)
//   jobs               — Map<id, job> for the UI to read
//   busy(stageName)    — count of jobs currently in that stage (for UI)
//   queued(stageName)  — count of jobs waiting to enter that stage
//
// Per-job state shape (mutated in place):
//   {
//     id,                    // copied from input
//     input,                 // the original submitted object
//     stage: "narrative"|... // current stage name, or "done" / "failed"
//     status: "queued"|"running"|"done"|"failed"
//     results: { narrative, obj, texture, trellis },  // per-stage outputs
//     errors:  { narrative?, obj?, ... },              // first failure cause
//     timings: { narrative: {start, end, ms}, ... }
//     startedAt, finishedAt
//   }
// =============================================================================

// Tiny semaphore. acquire() returns a release function. Strict FIFO via
// a queue of pending acquirers — important so jobs progress in submit
// order instead of getting starved.
function _makeSemaphore(limit) {
    let inUse = 0;
    const waiters = [];
    return {
        async acquire() {
            if (inUse < limit) {
                inUse++;
                return () => {
                    inUse--;
                    const next = waiters.shift();
                    if (next) {
                        inUse++;
                        next();
                    }
                };
            }
            return new Promise(resolve => {
                waiters.push(() => {
                    resolve(() => {
                        inUse--;
                        const next = waiters.shift();
                        if (next) {
                            inUse++;
                            next();
                        }
                    });
                });
            });
        },
        get inUse()   { return inUse; },
        get waiting() { return waiters.length; },
    };
}

export class PipelineManager {
    constructor({ stages, onJobUpdate } = {}) {
        if (!Array.isArray(stages) || stages.length === 0) {
            throw new Error("PipelineManager: `stages` must be a non-empty array");
        }
        for (const s of stages) {
            if (!s.name || typeof s.run !== "function") {
                throw new Error("PipelineManager: each stage needs { name, run }");
            }
        }
        this.stages = stages;
        this.onJobUpdate = typeof onJobUpdate === "function" ? onJobUpdate : null;
        this.jobs = new Map();
        // v1989 — settled-job eviction. The Map previously grew forever, a slow leak on
        // long-running sessions with auto-acquisition. Oldest settled jobs are evicted
        // once the cap is exceeded; running/queued jobs are never evicted.
        this.maxSettledJobs = 300;
        this._sem = new Map();
        for (const s of stages) {
            this._sem.set(s.name, _makeSemaphore(s.concurrency ?? 1));
        }
        this._jobPromises = [];   // collected for run() to await
    }

    submit(input) {
        if (!input || !input.id) {
            throw new Error("PipelineManager.submit: input needs an `id`");
        }
        if (this.jobs.has(input.id)) {
            throw new Error(`PipelineManager: duplicate job id "${input.id}"`);
        }
        const job = {
            id: input.id,
            input,
            stage:  "queued",
            status: "queued",
            results: {},
            errors:  {},
            timings: {},
            startedAt:  null,
            finishedAt: null,
        };
        this.jobs.set(input.id, job);
        this._notify(job);
        // Each submitted job is its own async pipeline. We collect the
        // promise so run() can await all of them. Errors are caught
        // internally — they don't reject the promise, they're stamped
        // onto the job's state instead. This is critical for
        // "one job failing doesn't take down the batch."
        this._jobPromises.push(this._runJob(job));
        return job;
    }

    async run() {
        // v1989 — the old comment claimed submissions DURING run() were awaited, but the
        // slice() snapshot was taken once at call time, so late submissions weren't. Now we
        // loop until the promise list stops growing, which makes the comment true.
        let awaited = 0;
        while (awaited < this._jobPromises.length) {
            const batch = this._jobPromises.slice(awaited);
            awaited = this._jobPromises.length;
            await Promise.all(batch);
        }
        return Array.from(this.jobs.values());
    }

    // v1989 — cancel a job: pending stages won't start, the current stage's AbortSignal
    // fires, and remaining retry attempts are skipped. Settles the job as "cancelled".
    cancel(jobId) {
        const job = this.jobs.get(jobId);
        if (!job || job.status === "done" || job.status === "failed" || job.status === "cancelled") return false;
        job._cancelRequested = true;
        try { job._abortCtl && job._abortCtl.abort(); } catch {}
        return true;
    }

    _evictSettled() {
        if (this.jobs.size <= this.maxSettledJobs) return;
        for (const [id, j] of this.jobs) {
            if (this.jobs.size <= this.maxSettledJobs) break;
            if (j.status === "done" || j.status === "failed" || j.status === "cancelled") this.jobs.delete(id);
        }
    }

    busy(stageName) {
        const s = this._sem.get(stageName);
        return s ? s.inUse : 0;
    }
    queued(stageName) {
        const s = this._sem.get(stageName);
        return s ? s.waiting : 0;
    }

    async _runJob(job) {
        job.startedAt = performance.now();
        job.attempts = job.attempts || {};
        job.skipped  = job.skipped  || [];
        for (const stage of this.stages) {
            if (job._cancelRequested) {   // v1989 — cancelled while queued for the next stage
                job.status = "cancelled"; job.stage = "cancelled"; job.finishedAt = performance.now();
                this._notify(job); this._evictSettled();
                return;
            }
            // Try to acquire the stage's semaphore. While waiting, the
            // job is conceptually "queued for stage X" — surface that
            // to the UI so the user sees it's pending, not idle.
            job.stage  = stage.name;
            job.status = "queued";    // queued for this stage
            this._notify(job);

            const release = await this._sem.get(stage.name).acquire();
            job.status = "running";
            const t0 = performance.now();
            job.timings[stage.name] = { start: t0, end: null, ms: null };
            this._notify(job);

            // v467 — per-stage retry + optional support. v1989 — three additions:
            //   backoff:   retries now wait retryDelayMs * 2^(attempt-1) + jitter instead of
            //              hammering a struggling service back-to-back;
            //   abort:     each attempt gets an AbortSignal (stage.run(job, attempt, signal));
            //              stage.timeoutMs aborts + fails the attempt, so a hung ComfyUI job
            //              can no longer hold a concurrency-1 semaphore for 20 minutes and
            //              starve every job behind it;
            //   cancel:    a cancel() between attempts/stages settles the job as "cancelled".
            const maxAttempts = 1 + (stage.retries || 0);
            const baseDelay = stage.retryDelayMs ?? 1500;
            let lastErr = null, ok = false;
            try {
                for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                    if (job._cancelRequested) { lastErr = new Error("cancelled"); break; }
                    job.attempts[stage.name] = attempt;
                    const ctl = new AbortController();
                    job._abortCtl = ctl;
                    let timeoutTimer = null;
                    try {
                        const runP = Promise.resolve(stage.run(job, attempt, ctl.signal));
                        const raceP = stage.timeoutMs
                            ? Promise.race([runP, new Promise((_, rej) => { timeoutTimer = setTimeout(() => { try { ctl.abort(); } catch {} rej(new Error(`stage timed out after ${Math.round(stage.timeoutMs / 1000)}s`)); }, stage.timeoutMs); })])
                            : runP;
                        const result = await raceP;
                        job.results[stage.name] = result;
                        ok = true;
                        break;
                    } catch (err) {
                        lastErr = err;
                        if (job._cancelRequested) break;
                        if (attempt < maxAttempts) {
                            const delay = Math.round(baseDelay * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5));
                            console.warn(`[PipelineManager] ${job.id}/${stage.name} attempt ${attempt} failed: ${err?.message || err} — retrying in ${delay}ms`);
                            this._notify(job);
                            await new Promise(r => setTimeout(r, delay));
                        }
                    } finally {
                        if (timeoutTimer) clearTimeout(timeoutTimer);
                        job._abortCtl = null;
                    }
                }
            } finally {
                release();
            }

            const t1 = performance.now();
            job.timings[stage.name].end = t1;
            job.timings[stage.name].ms  = Math.round(t1 - t0);

            if (!ok) {
                if (job._cancelRequested) {
                    job.status = "cancelled"; job.stage = "cancelled"; job.finishedAt = t1;
                    this._notify(job); this._evictSettled();
                    return;
                }
                job.errors[stage.name] = lastErr?.message || String(lastErr);
                if (stage.optional) {
                    job.skipped.push(stage.name);
                    console.warn(`[PipelineManager] ${job.id}/${stage.name} failed but is optional — continuing with earlier results`);
                    this._notify(job);
                    continue;   // degrade gracefully to the next stage / completion
                }
                job.status = "failed";
                job.stage = "failed";
                job.finishedAt = t1;
                this._notify(job);
                this._evictSettled();
                return;        // required stage failed — halt this job
            }
            this._notify(job);
        }
        job.stage   = "done";
        job.status  = "done";
        job.finishedAt = performance.now();
        this._notify(job);
        this._evictSettled();
    }

    _notify(job) {
        if (this.onJobUpdate) {
            try { this.onJobUpdate(job); }
            catch (e) { console.warn("[PipelineManager] onJobUpdate threw:", e); }
        }
    }
}

// Convenience: total wall-clock from first job start to last job finish.
// Useful for the "batch completed in X" summary line.
export function pipelineWallclockMs(jobs) {
    let earliest = Infinity, latest = 0;
    for (const j of jobs) {
        if (j.startedAt && j.startedAt < earliest) earliest = j.startedAt;
        if (j.finishedAt && j.finishedAt > latest) latest = j.finishedAt;
    }
    if (!Number.isFinite(earliest) || latest === 0) return 0;
    return Math.round(latest - earliest);
}
