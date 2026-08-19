// FILE: ui/WorkerEcgHud.js
// VERSION: v1 — round 283
//
// Tiny floating HUD widget — one ECG-style waveform per registered
// worker source. Renders to a small canvas in the lower-right, ~180px
// wide × ~14px per row tall. Reads from ui/workerActivity.js.
//
// Visual language:
//   - Each row is a single-channel ECG: flat baseline + a tall
//     spike for each recent activity blip.
//   - "send" blips spike upward (cyan); "recv" blips spike downward
//     (lime). So you can see request vs response visually.
//   - The waveform scrolls left at ~32 px/sec; recent activity is on
//     the right edge, older fades off the left.
//   - Source name label on the left of each row.
//   - Self-hides when no source has been registered yet, so when
//     workers aren't in use the HUD doesn't clutter.
//
// API:
//   createWorkerEcgHud() → { element, dispose() }
//
// The widget polls every animation frame; the per-source render is
// near-free (~16 blips × cheap canvas ops × O(sources)).

import { getActivity } from "./workerActivity.js";

const WINDOW_MS  = 4000;        // 4-second waveform window
const ROW_HEIGHT = 16;
const LABEL_W    = 70;
const PIXELS_PER_MS = 0.04;     // 40 ms = 1.6 px
const SPIKE_HEIGHT  = 6;        // half-height in px

function _now() {
    return (typeof performance !== "undefined") ? performance.now() : Date.now();
}

export function createWorkerEcgHud(opts = {}) {
    const root = document.createElement("div");
    root.className = "worker-ecg-hud";
    root.style.cssText = [
        "position:fixed",
        "right:16px",
        "bottom:60px",
        "z-index:8500",
        "background:rgba(8, 12, 20, 0.85)",
        "border:1px solid #335",
        "border-radius:5px",
        "padding:5px 8px",
        "font:10px monospace",
        "color:#9ef",
        "display:none",       // hidden until something registers
        "box-shadow:0 2px 8px rgba(0,0,0,0.5)",
    ].join(";");

    // Round 306 — minimize state persisted in localStorage so the user's
    // preference survives page reload. v445 — default is now MINIMIZED so a
    // fresh load isn't cluttered by the open ECG panel; the user's saved
    // choice still wins once they've toggled it.
    const STORAGE_KEY = "workerEcgHud.minimized";
    let minimized = (() => {
        try { const v = localStorage.getItem(STORAGE_KEY); return v === null ? true : v === "1"; }
        catch { return true; }
    })();

    // Title row with embedded minimize button
    const titleRow = document.createElement("div");
    titleRow.style.cssText = "display:flex; align-items:center; gap:6px; margin-bottom:3px;";

    const title = document.createElement("div");
    title.style.cssText = "color:#789; font-size:9px; flex:1; text-align:center;";
    title.textContent = "WORKERS · 4s window";
    titleRow.appendChild(title);

    const minBtn = document.createElement("button");
    minBtn.title = "Minimize / restore worker HUD";
    minBtn.style.cssText = [
        "background:transparent",
        "border:1px solid #345",
        "color:#9ef",
        "width:18px",
        "height:14px",
        "line-height:10px",
        "padding:0",
        "font:11px monospace",
        "cursor:pointer",
        "border-radius:2px",
    ].join(";");
    minBtn.textContent = minimized ? "+" : "−";
    titleRow.appendChild(minBtn);

    root.appendChild(titleRow);

    const canvas = document.createElement("canvas");
    canvas.width  = LABEL_W + Math.round(WINDOW_MS * PIXELS_PER_MS);   // ~70 + 160 = 230
    canvas.height = 64;
    // Round 306 — explicit inline width/height in style. The CSS rule
    // `canvas { width: 100vw; ... }` that previously stretched this to
    // full screen was scoped to #glCanvas in round 305, but a future
    // stylesheet could re-introduce the same trap. Inline style wins
    // against any non-`!important` rule from a stylesheet.
    canvas.style.cssText =
        `display:block; width:${canvas.width}px; height:${canvas.height}px;`;
    if (minimized) canvas.style.display = "none";
    root.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    minBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        minimized = !minimized;
        canvas.style.display = minimized ? "none" : "block";
        minBtn.textContent = minimized ? "+" : "−";
        try { localStorage.setItem(STORAGE_KEY, minimized ? "1" : "0"); } catch {}
    });

    document.body.appendChild(root);

    let rafId = 0;
    let alive = true;
    let lastSourceCount = 0;

    function render() {
        if (!alive) return;
        const activity = getActivity();
        const sources = Object.values(activity);
        // Auto-show when sources exist, auto-hide when none.
        if (sources.length === 0) {
            root.style.display = "none";
            rafId = requestAnimationFrame(render);
            return;
        }
        if (sources.length !== lastSourceCount) {
            lastSourceCount = sources.length;
            // Resize the canvas to fit all rows
            canvas.height = Math.max(20, sources.length * ROW_HEIGHT + 4);
            // Round 306 — keep inline style height in sync with the
            // attribute height; otherwise the canvas would render at
            // the original 64px tall while drawing into a taller buffer.
            canvas.style.height = canvas.height + "px";
            root.style.display = "block";
        }
        // Round 306 — when minimized, skip the canvas draw work entirely.
        // The title bar + minimize button still show so the user can restore.
        if (minimized) {
            rafId = requestAnimationFrame(render);
            return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const now = _now();
        const winStart = now - WINDOW_MS;
        const waveAreaX = LABEL_W;
        const waveAreaW = canvas.width - LABEL_W;
        for (let i = 0; i < sources.length; i++) {
            const rec = sources[i];
            const rowY = i * ROW_HEIGHT + 2;
            const midY = rowY + ROW_HEIGHT / 2;
            // Label
            ctx.fillStyle = "#aaa";
            ctx.font = "10px monospace";
            ctx.textBaseline = "middle";
            ctx.fillText(rec.name.slice(0, 10), 2, midY);
            // Baseline
            ctx.strokeStyle = "#234";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(waveAreaX, midY);
            ctx.lineTo(waveAreaX + waveAreaW, midY);
            ctx.stroke();
            // Blips
            for (const blip of rec.blips) {
                if (blip.t < winStart) continue;
                const ageMs = now - blip.t;
                const x = waveAreaX + waveAreaW - ageMs * PIXELS_PER_MS;
                if (x < waveAreaX) continue;
                // Fade by age: newer = brighter
                const ageFrac = 1 - (ageMs / WINDOW_MS);
                if (blip.kind === "send") {
                    ctx.strokeStyle = `rgba(110, 220, 255, ${0.3 + ageFrac * 0.7})`;
                    ctx.beginPath();
                    ctx.moveTo(x, midY);
                    ctx.lineTo(x, midY - SPIKE_HEIGHT);
                    ctx.stroke();
                } else {
                    ctx.strokeStyle = `rgba(140, 255, 110, ${0.3 + ageFrac * 0.7})`;
                    ctx.beginPath();
                    ctx.moveTo(x, midY);
                    ctx.lineTo(x, midY + SPIKE_HEIGHT);
                    ctx.stroke();
                }
            }
            // Right-edge counts: "↑42 ↓41"  small + dim
            ctx.fillStyle = "#557";
            ctx.font = "9px monospace";
            const counts = `↑${rec.sendCount}↓${rec.recvCount}`;
            ctx.textBaseline = "middle";
            ctx.fillText(counts, waveAreaX + waveAreaW - 50, midY + ROW_HEIGHT / 2 - 5);
        }
        rafId = requestAnimationFrame(render);
    }

    rafId = requestAnimationFrame(render);

    return {
        element: root,
        dispose() {
            alive = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (root.parentNode) root.parentNode.removeChild(root);
        },
    };
}
