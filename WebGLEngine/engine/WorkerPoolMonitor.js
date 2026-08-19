// =============================================================================
// FILE: /engine/WorkerPoolMonitor.js (renamed from PerfDashboard.js in v383)
// ROUND: 228
// =============================================================================
//
// Unified perf monitor for the engine's three concurrency surfaces:
//
//   • BiomeDecorPool   — Web Workers fanning biome decoration planning
//                        across cores (v214)
//   • BotPathfinderPool — Web Workers running A* for bot navigation
//                        (v216)
//   • IdleScheduler    — cooperative main-thread tasks that run during
//                        browser idle time (densifier, automata, mesh
//                        post-processor, biome ambience, etc.)
//
// Each surface gets a tile showing: worker count or task count, jobs
// total, throughput as jobs/sec computed from a 30-sample ring buffer,
// average duration in ms, and queue depth where applicable.
//
// The dashboard is HIDDEN by default. Toggle with:
//   • `perf.show()` / `perf.hide()` / `perf.toggle()` from console
//   • Ctrl+Shift+P keyboard shortcut
//
// Costs nothing when hidden — tick() returns early.
//
// API:
//   const dash = new PerfDashboard({ biomeDecorPool, botPathfinderPool, scheduler });
//   dash.tick(dt);   // called from main render loop
//   dash.show() / .hide() / .toggle()
// =============================================================================

const POLL_HZ = 4;               // refresh display 4× per second
const HISTORY_LEN = 30;          // ring buffer length for jobs/sec sparkline

export class PerfDashboard {
    constructor({ biomeDecorPool = null, botPathfinderPool = null, scheduler = null, chunkRebuildDispatcher = null } = {}) {
        this.biomeDecorPool = biomeDecorPool;
        this.botPathfinderPool = botPathfinderPool;
        this.scheduler = scheduler;
        this.chunkRebuildDispatcher = chunkRebuildDispatcher;   // round 250

        this._visible = false;
        this._el = null;
        this._sinceLastPollMs = 0;

        // Job-count history for jobs/sec rate calc + sparkline
        this._history = {
            biomeDecor:   new Array(HISTORY_LEN).fill(0),
            botPath:      new Array(HISTORY_LEN).fill(0),
            idleTotal:    new Array(HISTORY_LEN).fill(0),
            chunkRebuild: new Array(HISTORY_LEN).fill(0),   // round 250
        };
        this._historyIdx = 0;
        this._lastSampled = {
            biomeDecorJobs: 0,
            botPathJobs:    0,
            idleTotalTicks: 0,
            chunkRebuilt:   0,    // round 250
        };

        // Keyboard toggle
        this._keyHandler = (e) => {
            if (e.ctrlKey && e.shiftKey && e.code === "KeyP") {
                e.preventDefault();
                this.toggle();
            }
        };
        if (typeof document !== "undefined") {
            document.addEventListener("keydown", this._keyHandler);
        }
    }

    show() {
        if (this._visible) return;
        this._visible = true;
        this._build();
    }

    hide() {
        this._visible = false;
        if (this._el?.parentNode) this._el.parentNode.removeChild(this._el);
        this._el = null;
    }

    toggle() { return this._visible ? this.hide() : this.show(); }
    isVisible() { return this._visible; }

    tick(dt) {
        if (!this._visible) return;
        this._sinceLastPollMs += dt * 1000;
        const pollInterval = 1000 / POLL_HZ;
        if (this._sinceLastPollMs >= pollInterval) {
            this._sinceLastPollMs = 0;
            this._sample();
            this._render();
        }
    }

    dispose() {
        if (typeof document !== "undefined" && this._keyHandler) {
            document.removeEventListener("keydown", this._keyHandler);
        }
        this.hide();
    }

    // ----- Internal -------------------------------------------------

    _sample() {
        // BiomeDecorPool: jobsCompleted total
        let bdJobs = 0;
        if (this.biomeDecorPool?.getStats) {
            const s = this.biomeDecorPool.getStats();
            bdJobs = s.jobsCompleted ?? 0;
        }
        // BotPathfinderPool: jobs total
        let bpJobs = 0;
        if (this.botPathfinderPool?.getStats) {
            const s = this.botPathfinderPool.getStats();
            bpJobs = s.jobs ?? 0;
        }
        // IdleScheduler: sum of all tickCounts
        let idleTicks = 0;
        if (this.scheduler?.stats) {
            const all = this.scheduler.stats();
            if (all && typeof all.forEach === "function") {
                all.forEach((snap) => { idleTicks += snap.tickCount || 0; });
            }
        }
        // Round 250 — ChunkRebuildDispatcher: chunks rebuilt total
        let chunksBuilt = 0;
        if (this.chunkRebuildDispatcher?.getStats) {
            const s = this.chunkRebuildDispatcher.getStats();
            chunksBuilt = s.rebuilt ?? 0;
        }

        // Compute deltas — jobs done since previous poll
        const dBd = bdJobs - this._lastSampled.biomeDecorJobs;
        const dBp = bpJobs - this._lastSampled.botPathJobs;
        const dIdle = idleTicks - this._lastSampled.idleTotalTicks;
        const dChunk = chunksBuilt - this._lastSampled.chunkRebuilt;

        this._history.biomeDecor[this._historyIdx]   = Math.max(0, dBd);
        this._history.botPath[this._historyIdx]      = Math.max(0, dBp);
        this._history.idleTotal[this._historyIdx]    = Math.max(0, dIdle);
        this._history.chunkRebuild[this._historyIdx] = Math.max(0, dChunk);
        this._historyIdx = (this._historyIdx + 1) % HISTORY_LEN;

        this._lastSampled.biomeDecorJobs = bdJobs;
        this._lastSampled.botPathJobs    = bpJobs;
        this._lastSampled.idleTotalTicks = idleTicks;
        this._lastSampled.chunkRebuilt   = chunksBuilt;
    }

    _rate(history) {
        // jobs per second = sum of last second's worth of samples
        // (POLL_HZ samples per second)
        let sum = 0;
        for (let i = 0; i < POLL_HZ && i < history.length; i++) {
            const idx = (this._historyIdx - 1 - i + HISTORY_LEN) % HISTORY_LEN;
            sum += history[idx];
        }
        return sum;
    }

    _sparkline(history) {
        // 30-char unicode block sparkline normalised to the history's max
        const blocks = "▁▂▃▄▅▆▇█";
        let max = 1;
        for (const v of history) if (v > max) max = v;
        let s = "";
        for (let i = 0; i < HISTORY_LEN; i++) {
            const idx = (this._historyIdx + i) % HISTORY_LEN;
            const v = history[idx];
            const b = Math.min(blocks.length - 1, Math.floor((v / max) * blocks.length));
            s += blocks[b];
        }
        return s;
    }

    _build() {
        if (typeof document === "undefined") return;
        const el = document.createElement("div");
        el.id = "perf-dashboard";
        Object.assign(el.style, {
            position: "fixed",
            right: "12px", bottom: "12px",
            minWidth: "340px",
            background: "rgba(8,12,20,0.92)",
            border: "1px solid #468",
            borderRadius: "6px",
            padding: "10px 12px",
            color: "#cfd",
            fontFamily: "monospace",
            fontSize: "11px",
            lineHeight: "1.5",
            zIndex: "8500",
            pointerEvents: "auto",
            boxShadow: "0 0 16px rgba(80,160,200,0.20)",
        });
        document.body.appendChild(el);
        this._el = el;
        this._render();
    }

    _render() {
        if (!this._el) return;
        const stats = this._collect();
        const rows = [];
        rows.push(`<div style="color:#4cf; font-size:12px; letter-spacing:1.2px; border-bottom:1px solid #234; padding-bottom:4px; margin-bottom:6px;">⚙ PERF · POOLS &amp; SCHEDULER</div>`);
        rows.push(this._tileHTML("BIOME DECOR",  stats.biomeDecor, "#fc9",  this._sparkline(this._history.biomeDecor)));
        rows.push(this._tileHTML("BOT PATHFIND", stats.botPath,    "#9cf",  this._sparkline(this._history.botPath)));
        rows.push(this._tileHTML("CHUNK REBUILD", stats.chunkRebuild, "#cf6", this._sparkline(this._history.chunkRebuild)));
        rows.push(this._tileHTML("IDLE TASKS",   stats.idle,       "#cfc",  this._sparkline(this._history.idleTotal)));
        rows.push(`<div style="color:#789; font-size:9px; margin-top:6px;">Ctrl+Shift+P toggles · console: perf.toggle()</div>`);
        this._el.innerHTML = rows.join("");
    }

    _tileHTML(label, t, color, sparkline) {
        const lines = [];
        lines.push(
            `<div style="color:${color}; margin-bottom:2px;"><b>${label}</b> ` +
            `<span style="color:#789; font-size:9px;">${t.subtitle || ""}</span></div>`
        );
        for (const line of t.lines) {
            lines.push(`<div style="color:#aab; padding-left:8px;">${line}</div>`);
        }
        if (sparkline) {
            lines.push(`<div style="color:${color}; padding-left:8px; letter-spacing:-1px; font-size:13px;">${sparkline}</div>`);
        }
        return `<div style="margin-bottom:6px;">${lines.join("")}</div>`;
    }

    _collect() {
        const out = {};

        // BiomeDecorPool tile
        const bd = this.biomeDecorPool?.getStats?.() ?? null;
        if (bd) {
            out.biomeDecor = {
                subtitle: `${bd.poolSize} workers`,
                lines: [
                    `jobs: <b>${bd.jobsCompleted}</b>  ·  ${this._rate(this._history.biomeDecor)}/s`,
                    `placed: ${bd.placedTotal}  ·  alive ${bd.placedEntitiesAlive}`,
                    `last plan: ${(bd.lastPlanMs|0)}ms`,
                ],
            };
        } else {
            out.biomeDecor = { subtitle: "—", lines: ["not mounted"] };
        }

        // BotPathfinderPool tile
        const bp = this.botPathfinderPool?.getStats?.() ?? null;
        if (bp) {
            out.botPath = {
                subtitle: `${bp.poolSize} workers`,
                lines: [
                    `jobs: <b>${bp.jobs}</b>  ·  ${this._rate(this._history.botPath)}/s  ·  pending ${bp.pending}`,
                    `success: ${(bp.successRate * 100).toFixed(0)}%  ·  avg ${bp.avgMs.toFixed(1)}ms`,
                ],
            };
        } else {
            out.botPath = { subtitle: "—", lines: ["not mounted"] };
        }

        // IdleScheduler tile
        const tasks = this.scheduler?.stats?.();
        if (tasks && tasks.size != null) {
            const taskList = [];
            tasks.forEach((s) => {
                const status = s.paused ? "‖" : s.done ? "✓" : s.running ? "▶" : "·";
                taskList.push(`${status} ${(s.label || s.name).slice(0, 22)}  <span style="color:#789;">${s.tickCount}t / ${(s.totalMs|0)}ms</span>`);
            });
            out.idle = {
                subtitle: `${tasks.size} tasks`,
                lines: taskList.slice(0, 6),
            };
            if (taskList.length > 6) {
                out.idle.lines.push(`<span style="color:#789;">+ ${taskList.length - 6} more</span>`);
            }
            out.idle.lines.push(`total ticks: ${this._rate(this._history.idleTotal)}/s`);
        } else {
            out.idle = { subtitle: "—", lines: ["not mounted"] };
        }

        // Round 250 — ChunkRebuildDispatcher tile
        const crd = this.chunkRebuildDispatcher?.getStats?.() ?? null;
        if (crd) {
            const depthColor = crd.queueDepth > 50 ? "#f88" : crd.queueDepth > 10 ? "#fc6" : "#9cf";
            out.chunkRebuild = {
                subtitle: `${crd.maxPerFrame}/frame cap`,
                lines: [
                    `queue: <b style="color:${depthColor};">${crd.queueDepth}</b>  ·  ${this._rate(this._history.chunkRebuild)}/s rebuilt`,
                    `marked: ${crd.marked}  ·  built ${crd.rebuilt}`,
                ],
            };
        } else {
            out.chunkRebuild = { subtitle: "—", lines: ["not mounted"] };
        }

        return out;
    }
}

// v383 — Alias export for clarity. The class name keeps the historical
// "PerfDashboard" identifier (round 228) for back-compat with saved
// code; new code can import WorkerPoolMonitor instead.
export { PerfDashboard as WorkerPoolMonitor };
