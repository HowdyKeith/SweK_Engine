// =============================================================================
// FILE: /engine/IdleScheduler.js
// ROUND: 191
// =============================================================================
//
// Generic background task scheduler that runs registered work during browser
// idle frames. Uses requestIdleCallback when available, falls back to
// setTimeout(0) on browsers without it (Safari historically).
//
// Tasks are async-friendly cooperative — each registered task returns
// `true` from its tick if it has more work to do, or `false` if it's
// finished (the scheduler then unregisters it from active rotation).
// Tasks should respect the provided `deadline.timeRemaining()` budget
// per tick and yield early when it runs out.
//
// Why this exists:
//   - The GPU is busy with Ollama / Diffuser / ComfyUI / Trellis for
//     long stretches. The CPU has spare cycles. Idle-frame work uses
//     them productively without affecting rendering frame time.
//   - Each task is independent and can be enabled/disabled separately
//     so the user can tune what runs in the background.
//
// Public API:
//   register(name, tick, opts?)  — opts: { priority=0, label?, autostart=true }
//                                   tick: (deadline) => boolean
//   unregister(name)             — remove a task
//   pause(name) / resume(name)   — temporarily halt a task without removing it
//   start() / stop()             — control whole loop
//   stats(name?)                 — returns { tickCount, lastTickMs, lastRunAt,
//                                            running, paused, done }
//                                   if no name, returns Map of all tasks
// =============================================================================

export class IdleScheduler {
    constructor({ minIdleBudgetMs = 4 } = {}) {
        this._tasks = new Map();
        this._minIdleBudget = minIdleBudgetMs;
        this._running = false;
        this._scheduledHandle = null;
        // Listeners fire when a task's state changes (UI uses this).
        this._listeners = new Set();
    }

    register(name, tick, opts = {}) {
        if (typeof tick !== "function") {
            throw new Error(`IdleScheduler.register: tick for "${name}" must be a function`);
        }
        if (this._tasks.has(name)) {
            console.warn(`[IdleScheduler] re-registering "${name}" — replacing`);
        }
        this._tasks.set(name, {
            name,
            tick,
            label:     opts.label || name,
            priority:  opts.priority ?? 0,
            paused:    !(opts.autostart ?? true),
            done:      false,
            running:   false,
            tickCount: 0,
            totalMs:   0,
            lastTickMs: 0,
            lastRunAt: 0,
            lastError: null,
        });
        this._notify();
        if (this._running) this._schedule();
    }

    unregister(name) {
        this._tasks.delete(name);
        this._notify();
    }

    pause(name)  { const t = this._tasks.get(name); if (t) { t.paused = true;  this._notify(); } }
    resume(name) { const t = this._tasks.get(name); if (t) { t.paused = false; t.done = false; this._notify(); if (this._running) this._schedule(); } }

    addListener(fn)    { this._listeners.add(fn); }
    removeListener(fn) { this._listeners.delete(fn); }

    start() {
        if (this._running) return;
        this._running = true;
        this._schedule();
    }
    stop() {
        this._running = false;
        if (this._scheduledHandle != null) {
            if (typeof cancelIdleCallback === "function") cancelIdleCallback(this._scheduledHandle);
            else clearTimeout(this._scheduledHandle);
            this._scheduledHandle = null;
        }
    }

    stats(name) {
        if (name) {
            const t = this._tasks.get(name);
            return t ? this._snap(t) : null;
        }
        const out = new Map();
        for (const t of this._tasks.values()) out.set(t.name, this._snap(t));
        return out;
    }

    _snap(t) {
        return {
            name:       t.name,
            label:      t.label,
            paused:     t.paused,
            done:       t.done,
            running:    t.running,
            tickCount:  t.tickCount,
            totalMs:    t.totalMs,
            lastTickMs: t.lastTickMs,
            lastRunAt:  t.lastRunAt,
            lastError:  t.lastError,
        };
    }

    _notify() {
        for (const fn of this._listeners) {
            try { fn(this.stats()); } catch (e) { console.warn("[IdleScheduler] listener threw:", e); }
        }
    }

    _schedule() {
        if (!this._running) return;
        if (this._scheduledHandle != null) return;       // already queued

        const cb = (deadline) => {
            this._scheduledHandle = null;
            this._runOne(deadline);
            // Always re-schedule while there's at least one active task
            const hasActive = Array.from(this._tasks.values()).some(t => !t.paused && !t.done);
            if (this._running && hasActive) this._schedule();
        };

        if (typeof requestIdleCallback === "function") {
            // 50ms tells the browser "interrupt anytime within 50ms"
            this._scheduledHandle = requestIdleCallback(cb, { timeout: 250 });
        } else {
            // Fallback — synthesize a deadline object
            this._scheduledHandle = setTimeout(() => {
                const start = performance.now();
                cb({
                    didTimeout: false,
                    timeRemaining: () => Math.max(0, this._minIdleBudget - (performance.now() - start)),
                });
            }, 16);  // ~ next frame
        }
    }

    _runOne(deadline) {
        // Pick the next eligible task in priority order. Round-robin
        // within a priority so one task can't starve siblings.
        const eligible = Array.from(this._tasks.values())
            .filter(t => !t.paused && !t.done)
            .sort((a, b) => (b.priority - a.priority) || (a.lastRunAt - b.lastRunAt));
        if (eligible.length === 0) return;

        // Only run if there's at least minimum budget; otherwise yield
        // back to the browser. Avoids "ran for 0ms, did nothing useful"
        // churn.
        if (deadline.timeRemaining() < this._minIdleBudget) return;

        const t = eligible[0];
        t.running = true;
        const start = performance.now();
        try {
            const hasMore = t.tick(deadline);
            const ms = performance.now() - start;
            t.tickCount++;
            t.totalMs    += ms;
            t.lastTickMs  = ms;
            t.lastRunAt   = Date.now();
            if (hasMore === false) t.done = true;
        } catch (err) {
            t.lastError = err?.message || String(err);
            console.warn(`[IdleScheduler] task "${t.name}" threw:`, err);
            // Pause the task on error so we don't loop on a bad bug
            t.paused = true;
        } finally {
            t.running = false;
        }
        this._notify();
    }
}
