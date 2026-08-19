// FILE: ui/PerfHud.js
// VERSION: v1 — round 376
//
// Live visual perf HUD. Polls the existing frameProfiler at a
// fixed cadence, computes per-second deltas, and renders:
//
//   - Big-number FPS readout (current + p95 over the last 10 seconds)
//   - Scrolling frame-time graph (last 10 seconds, ~30 samples)
//   - Top-N section bar chart (which sub-systems are eating time)
//   - Reset button
//
// Companion to debug/frameProfiler.js. Sampling is done in live mode
// (enableLive/clearAccumulator pattern); the dashboard reads totals,
// computes deltas, then clears so totals stay bounded.
//
// Sampling cadence: 333ms (≈3 Hz). Higher cadences make the bars
// jittery; lower cadences feel laggy. 3 Hz hits the sweet spot.
//
// Memory: the dashboard keeps two ring buffers — one for frame-time
// samples (30 entries) and one for per-section averages (also 30).
// Both are tiny (~10 KB total).

import { makeDraggable } from "./draggable.js";

const SAMPLE_INTERVAL_MS = 333;
const HISTORY_SAMPLES    = 30;     // ≈10 seconds at 3 Hz
const TOP_SECTIONS_N     = 8;

const STYLE_FONT = "monospace";
const COLOR_BG     = "rgba(8,14,20,0.96)";
const COLOR_BORDER = "#6ad";
const COLOR_TEXT   = "#cfd";
const COLOR_GOOD   = "#4c4";
const COLOR_WARN   = "#fa6";
const COLOR_BAD    = "#f88";
const COLOR_BAR    = "#48c";
const COLOR_AXIS   = "#345";
const COLOR_GRID   = "#1a2030";

// Frame-time thresholds in ms (60fps = 16.7, 30fps = 33.3, 20fps = 50)
const THRESH_GOOD = 16.7;
const THRESH_WARN = 33.3;

function colorForFrameMs(ms) {
    if (ms < THRESH_GOOD)  return COLOR_GOOD;
    if (ms < THRESH_WARN)  return COLOR_WARN;
    return COLOR_BAD;
}

function percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.slice().sort((a, b) => a - b);
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Mount the perf dashboard. Returns a handle with show/hide/dispose.
 *
 * @param {Object} [opts]
 * @param {Object} [opts.profiler]  override frame profiler (for tests).
 *                                    Defaults to window._frameProf.
 */
export function mountPerfDashboard(opts = {}) {
    if (typeof document === "undefined") return null;
    const profiler = opts.profiler ?? (typeof window !== "undefined" ? window._frameProf : null);
    if (!profiler) {
        console.warn("[PerfDashboard] no profiler — cannot mount");
        return null;
    }

    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        bottom: "20px",
        left: "20px",
        background: COLOR_BG,
        border: "1px solid " + COLOR_BORDER,
        borderRadius: "8px",
        padding: "8px 12px 10px 12px",
        color: COLOR_TEXT,
        fontFamily: STYLE_FONT,
        fontSize: "11px",
        minWidth: "320px",
        zIndex: "8860",
        boxShadow: "0 0 18px rgba(80,180,255,0.18)",
    });
    panel.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; padding-bottom:6px; border-bottom:1px solid #233; margin-bottom:6px;">
            <span style="color:${COLOR_BORDER}; letter-spacing:1.5px; font-weight:bold;">📊 PERF</span>
            <span id="pd-fps" style="font-size:18px; font-weight:bold; color:${COLOR_GOOD}; padding-left:6px;">— fps</span>
            <span style="flex:1;"></span>
            <button id="pd-reset" style="background:#a44; border:none; color:#fff; padding:2px 6px; border-radius:3px; cursor:pointer; font-family:monospace; font-size:9px;">reset</button>
            <button id="pd-pause" style="background:#48c; border:none; color:#fff; padding:2px 6px; border-radius:3px; cursor:pointer; font-family:monospace; font-size:9px;">pause</button>
        </div>
        <div id="pd-stats" style="display:flex; gap:14px; font-size:10px; color:#9ab; margin-bottom:6px;">
            <span>p50: <span id="pd-p50" style="color:${COLOR_TEXT};">—</span></span>
            <span>p95: <span id="pd-p95" style="color:${COLOR_TEXT};">—</span></span>
            <span>max: <span id="pd-max" style="color:${COLOR_TEXT};">—</span></span>
        </div>
        <canvas id="pd-graph" width="320" height="60" style="background:#040608; border:1px solid #233; display:block; margin-bottom:8px;"></canvas>
        <div id="pd-section-label" style="color:#9ab; font-size:9px; margin-bottom:3px; letter-spacing:1px;">TOP SECTIONS (ms/frame)</div>
        <div id="pd-sections" style="display:flex; flex-direction:column; gap:2px;"></div>
        <div id="pd-extra" style="margin-top:7px; padding-top:6px; border-top:1px solid #233; color:#8fb6d8; font-size:10px; display:flex; flex-direction:column; gap:2px;"></div>
    `;
    document.body.appendChild(panel);

    const drag = makeDraggable(panel, { label: "PERF", storageKey: "perfDashboard" });
    drag.attach();

    const $ = sel => panel.querySelector(sel);
    const graph = $("#pd-graph");
    const gctx = graph.getContext("2d");

    // Ring buffers
    const frameMsHistory   = [];       // last 30 frame-time averages
    const sectionHistory   = new Map(); // name → { avgMs[] }

    let paused = false;
    let prevSnapshot = null;
    let timerId = null;

    // Start the live profiler if it's not already on
    if (!profiler.isActive?.()) {
        profiler.enableLive?.();
    }

    function _sample() {
        if (paused) return;
        const snap = profiler.snapshot?.();
        if (!snap) return;

        // Frame-time delta — frames per second over the window
        const dtMs = snap.nowT - snap.windowStartT;
        const fps = dtMs > 0 ? snap.frames / (dtMs / 1000) : 0;
        const avgFrameMs = snap.frames > 0 ? dtMs / snap.frames : 0;

        // Push to ring buffer
        if (snap.frames > 0) {
            frameMsHistory.push(avgFrameMs);
            if (frameMsHistory.length > HISTORY_SAMPLES) frameMsHistory.shift();
        }

        // Update section rolling averages — per-frame ms
        for (const [name, rec] of Object.entries(snap.sections)) {
            const perFrameMs = snap.frames > 0 ? rec.totalMs / snap.frames : 0;
            let hist = sectionHistory.get(name);
            if (!hist) {
                hist = { avgMs: [] };
                sectionHistory.set(name, hist);
            }
            hist.avgMs.push(perFrameMs);
            if (hist.avgMs.length > HISTORY_SAMPLES) hist.avgMs.shift();
        }
        // Also age out sections that didn't appear this snapshot — push 0
        for (const [name, hist] of sectionHistory) {
            if (!(name in snap.sections)) {
                hist.avgMs.push(0);
                if (hist.avgMs.length > HISTORY_SAMPLES) hist.avgMs.shift();
            }
        }

        // Clear profiler accumulator so next sample window is fresh
        profiler.clearAccumulator?.();

        _renderHud(fps, avgFrameMs);
        _renderGraph();
        _renderSections();
        // v1290 — optional system/chunk metrics line, supplied by the engine via
        // window._perfExtra() (returns an HTML string). Decoupled: HUD shows it if present.
        try { const el = $("#pd-extra"); if (el) { const ex = (typeof window !== "undefined" && window._perfExtra) ? window._perfExtra() : ""; el.innerHTML = ex || ""; el.style.display = ex ? "flex" : "none"; } } catch (e) {}

        prevSnapshot = snap;
    }

    function _renderHud(fps, avgFrameMs) {
        $("#pd-fps").textContent = `${fps.toFixed(0)} fps · ${avgFrameMs.toFixed(1)}ms`;
        $("#pd-fps").style.color = colorForFrameMs(avgFrameMs);
        if (frameMsHistory.length > 0) {
            $("#pd-p50").textContent = percentile(frameMsHistory, 0.5).toFixed(1) + "ms";
            $("#pd-p95").textContent = percentile(frameMsHistory, 0.95).toFixed(1) + "ms";
            $("#pd-max").textContent = Math.max(...frameMsHistory).toFixed(1) + "ms";
        }
    }

    function _renderGraph() {
        const w = graph.width, h = graph.height;
        gctx.fillStyle = "#040608";
        gctx.fillRect(0, 0, w, h);

        // Threshold lines: 16ms (60fps), 33ms (30fps)
        const maxMs = Math.max(50, Math.max(...frameMsHistory, 16.7) * 1.1);
        const yFor = (ms) => h - (ms / maxMs) * h;

        // Grid lines + labels
        gctx.strokeStyle = COLOR_GRID;
        gctx.lineWidth = 1;
        gctx.beginPath();
        gctx.moveTo(0, yFor(16.7)); gctx.lineTo(w, yFor(16.7));
        gctx.moveTo(0, yFor(33.3)); gctx.lineTo(w, yFor(33.3));
        gctx.stroke();
        gctx.fillStyle = "#345";
        gctx.font = "8px monospace";
        gctx.fillText("16ms", 2, Math.max(8, yFor(16.7) - 2));
        gctx.fillText("33ms", 2, Math.max(8, yFor(33.3) - 2));

        // Bars
        if (frameMsHistory.length === 0) return;
        const barW = w / HISTORY_SAMPLES;
        for (let i = 0; i < frameMsHistory.length; i++) {
            const ms = frameMsHistory[i];
            const x = i * barW;
            const barH = (ms / maxMs) * h;
            gctx.fillStyle = colorForFrameMs(ms);
            gctx.fillRect(x + 1, h - barH, barW - 1, barH);
        }
    }

    function _renderSections() {
        // Compute current-window-avg per section, pick top N
        const rows = [];
        for (const [name, hist] of sectionHistory) {
            if (hist.avgMs.length === 0) continue;
            // Use median of last few samples as the displayed value —
            // smoother than instantaneous, more accurate than mean
            const last = hist.avgMs.slice(-5);
            const median = percentile(last, 0.5);
            rows.push({ name, median });
        }
        rows.sort((a, b) => b.median - a.median);
        const top = rows.slice(0, TOP_SECTIONS_N);
        const maxMs = top.length > 0 ? Math.max(...top.map(r => r.median), 1) : 1;

        const container = $("#pd-sections");
        container.innerHTML = "";
        for (const r of top) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex", alignItems: "center", gap: "6px", fontSize: "10px",
            });
            const nameEl = document.createElement("span");
            nameEl.style.cssText = "flex:0 0 110px; color:#cef; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
            nameEl.textContent = r.name;
            nameEl.title = r.name;
            const barWrap = document.createElement("div");
            barWrap.style.cssText = "flex:1; height:10px; background:#06060c; border-radius:2px; overflow:hidden;";
            const bar = document.createElement("div");
            const pct = Math.min(100, (r.median / maxMs) * 100);
            bar.style.cssText = `width:${pct}%; height:100%; background:${colorForFrameMs(r.median)};`;
            barWrap.appendChild(bar);
            const val = document.createElement("span");
            val.style.cssText = "flex:0 0 48px; text-align:right; color:#cfd; font-family:monospace;";
            val.textContent = r.median.toFixed(2) + "ms";
            row.appendChild(nameEl);
            row.appendChild(barWrap);
            row.appendChild(val);
            container.appendChild(row);
        }
        if (top.length === 0) {
            container.innerHTML = '<div style="color:#456; font-size:10px;">(no sections sampled yet)</div>';
        }
    }

    $("#pd-reset").addEventListener("click", () => {
        frameMsHistory.length = 0;
        sectionHistory.clear();
        profiler.clearAccumulator?.();
        _renderHud(0, 0);
        _renderGraph();
        _renderSections();
    });

    $("#pd-pause").addEventListener("click", () => {
        paused = !paused;
        $("#pd-pause").textContent = paused ? "resume" : "pause";
        $("#pd-pause").style.background = paused ? "#666" : "#48c";
    });

    // Start the polling timer
    timerId = setInterval(_sample, SAMPLE_INTERVAL_MS);

    // Initial empty render so the panel doesn't look broken before
    // the first sample lands.
    _renderHud(0, 0);
    _renderGraph();
    _renderSections();

    return {
        element: panel,
        show()   { panel.style.display = "block"; },
        hide()   { panel.style.display = "none"; },
        toggle() { panel.style.display = panel.style.display === "none" ? "block" : "none"; },
        dispose() {
            clearInterval(timerId);
            timerId = null;
            drag.detach();
            try { panel.remove(); } catch {}
        },
        // Test surface
        _sample,
        _history: () => ({ frameMsHistory: [...frameMsHistory], sectionHistory: new Map(sectionHistory) }),
    };
}
