// FILE: ui/SystemPerfMonitor.js
// VERSION: v1 — Round 263
//
// Approximate system load monitor. Browsers DO NOT expose actual CPU,
// GPU usage, or temperature for privacy/security reasons. This file
// surfaces the closest browser-accessible proxies:
//
//   • cpuLoad01:   frame-time / target-time ratio capped at 1.0
//                  (1.0 = severely framerate-bound, likely CPU saturated)
//   • gpuLoad01:   when EXT_disjoint_timer_query_webgl2 is available,
//                  uses actual GPU draw time. Otherwise null.
//   • memoryMB:    performance.memory.usedJSHeapSize / 1048576
//                  (Chrome/Edge only — Firefox/Safari return null)
//   • errorRate:   recent console.warn/error count / window seconds
//                  (powers the KPop HAPPY gauge)
//
// Long-task observer fires when a task >50ms blocks the main thread,
// which is a stronger signal of CPU pressure than raw frame time.
// `taskStress01` tracks ratio of long-task-blocked time to wall time.
//
// NOTE on temperature: there is no Web API for hardware temperatures.
// The Battery API was deprecated and was never going to expose temps.
// Sites that claim to read CPU temp in-browser are fabricating values.
// If thermals matter, run an external probe and pipe over the bridge.

export class SystemPerfMonitor {
    constructor({ frameTargetMs = 16.67, window: avgWindowMs = 2000 } = {}) {
        this.frameTargetMs = frameTargetMs;
        this.avgWindowMs = avgWindowMs;
        this._frameSamples = [];          // {t, dt} entries within window
        this._lastFrameMs = performance.now();
        this._gpuTimeMs = 0;              // EWMA of GPU draw time
        this._gpuExt = null;
        this._gpuQueryInFlight = null;
        this._memUsedMB = null;
        this._memTotalMB = null;

        // Console error/warn aggregator. Wraps the original methods
        // once; safe to instantiate this class multiple times in dev.
        this._errEvents = [];
        if (!window._sysPerfWrapped) {
            window._sysPerfWrapped = true;
            const origErr = console.error.bind(console);
            const origWarn = console.warn.bind(console);
            const events = [];
            window._sysPerfErrEvents = events;
            // v969 — don't count benign "optional service down" noise as errors.
            const _benign = (args) => { try { return window._benignError && window._benignError(args.join(" ")); } catch { return false; } };
            console.error = function(...args) { if (!_benign(args)) events.push({ t: performance.now(), kind: "error" }); origErr(...args); };
            console.warn  = function(...args) { if (!_benign(args)) events.push({ t: performance.now(), kind: "warn"  }); origWarn(...args);  };
        }

        // PerformanceObserver longtask gives a strong CPU-pressure signal
        // (any main-thread task >50ms). Aggregate blocked time over the
        // window for `taskStress01`.
        this._longTaskTotalMs = 0;
        this._longTaskWindowStart = performance.now();
        try {
            if (typeof PerformanceObserver !== "undefined") {
                const obs = new PerformanceObserver((list) => {
                    for (const e of list.getEntries()) {
                        this._longTaskTotalMs += e.duration;
                    }
                });
                obs.observe({ type: "longtask", buffered: true });
                this._longTaskObs = obs;
            }
        } catch (e) {
            // Safari + some embedded views don't support longtask type
            this._longTaskObs = null;
        }
    }

    // Attach a WebGL2 context to enable GPU draw-time queries via
    // EXT_disjoint_timer_query_webgl2. Safe to call once; subsequent
    // calls are no-ops. Returns true on success.
    attachGL(gl) {
        if (this._gpuExt || !gl) return !!this._gpuExt;
        try {
            this._gpuExt = gl.getExtension("EXT_disjoint_timer_query_webgl2");
            this._gl = gl;
            return !!this._gpuExt;
        } catch { return false; }
    }

    // Begin a GPU timer query for the current draw block. Must be paired
    // with endGPUFrame(). Caller decides what "frame" means.
    beginGPUFrame() {
        if (!this._gpuExt || this._gpuQueryInFlight) return;
        const gl = this._gl;
        const q = gl.createQuery();
        gl.beginQuery(this._gpuExt.TIME_ELAPSED_EXT, q);
        this._gpuQueryInFlight = q;
    }

    endGPUFrame() {
        if (!this._gpuExt || !this._gpuQueryInFlight) return;
        const gl = this._gl;
        gl.endQuery(this._gpuExt.TIME_ELAPSED_EXT);
        const q = this._gpuQueryInFlight;
        this._gpuQueryInFlight = null;
        // Poll the previous query non-blocking on the next tick
        this._pendingGpuQuery = q;
    }

    _pollGpuQuery() {
        if (!this._gpuExt || !this._pendingGpuQuery) return;
        const gl = this._gl;
        const q = this._pendingGpuQuery;
        const ready = gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE);
        const disjoint = gl.getParameter(this._gpuExt.GPU_DISJOINT_EXT);
        if (ready && !disjoint) {
            const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
            const ms = ns / 1e6;
            // EWMA smoothing — α=0.25 is responsive but not jittery
            this._gpuTimeMs = this._gpuTimeMs === 0 ? ms : (this._gpuTimeMs * 0.75 + ms * 0.25);
            gl.deleteQuery(q);
            this._pendingGpuQuery = null;
        }
    }

    // Call once per frame from the main loop. Accumulates frame-time
    // samples and prunes old ones outside the averaging window.
    tick(nowMs = performance.now()) {
        const dt = nowMs - this._lastFrameMs;
        this._lastFrameMs = nowMs;
        this._frameSamples.push({ t: nowMs, dt });
        // Trim samples older than window
        const cutoff = nowMs - this.avgWindowMs;
        while (this._frameSamples.length > 0 && this._frameSamples[0].t < cutoff) {
            this._frameSamples.shift();
        }
        // Roll long-task window
        if (nowMs - this._longTaskWindowStart > this.avgWindowMs) {
            this._longTaskTotalMs *= 0.5;       // half-life every window
            this._longTaskWindowStart = nowMs;
        }
        // Memory snapshot — cheap, no allocations
        const m = performance.memory;
        if (m) {
            this._memUsedMB = m.usedJSHeapSize  / 1048576;
            this._memTotalMB = m.totalJSHeapSize / 1048576;
        }
        // GPU poll
        this._pollGpuQuery();
    }

    // Returns a snapshot object with all readouts. Designed to be
    // called at ~5-10Hz (not per frame) since some readouts are
    // averages over a window.
    snapshot() {
        const samples = this._frameSamples;
        let avgFrameMs = 0;
        if (samples.length > 0) {
            let sum = 0;
            for (const s of samples) sum += s.dt;
            avgFrameMs = sum / samples.length;
        }
        const cpuLoad01 = Math.max(0, Math.min(1, (avgFrameMs - this.frameTargetMs) / this.frameTargetMs));

        const gpuLoad01 = (this._gpuExt && this._gpuTimeMs > 0)
            ? Math.max(0, Math.min(1, this._gpuTimeMs / this.frameTargetMs))
            : null;

        const taskStress01 = Math.max(0, Math.min(1, this._longTaskTotalMs / this.avgWindowMs));

        // Error rate — events within window, per second
        const errEvents = window._sysPerfErrEvents || [];
        const cutoff = performance.now() - this.avgWindowMs;
        let errors = 0, warns = 0;
        for (let i = errEvents.length - 1; i >= 0; i--) {
            if (errEvents[i].t < cutoff) break;
            if (errEvents[i].kind === "error") errors++; else warns++;
        }
        const errorsPerSec = (errors + warns * 0.5) / (this.avgWindowMs / 1000);

        return {
            avgFrameMs,
            fps:           samples.length > 0 ? 1000 / avgFrameMs : 0,
            cpuLoad01,
            gpuLoad01,                      // null if no extension
            gpuFrameMs:    this._gpuExt ? this._gpuTimeMs : null,
            memUsedMB:     this._memUsedMB,  // null on non-Chromium
            memTotalMB:    this._memTotalMB,
            taskStress01,
            errorsRecent:  errors,
            warnsRecent:   warns,
            errorsPerSec,
        };
    }
}

// Singleton — anything that wants perf can import + use. Attach GL later
// when renderer is ready.
let _singleton = null;
export function getSystemPerf() {
    if (!_singleton) _singleton = new SystemPerfMonitor();
    return _singleton;
}
