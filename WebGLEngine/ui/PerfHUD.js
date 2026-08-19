// FILE: ui/PerfHUD.js
// VERSION: v1 — round 413
//
// An F1-toggle performance overlay. Reads the per-frame stats the main
// loop already publishes to window._perfStats (fps, frameMs, build,
// entCount, chunksDrawn, chunksCulled) plus a few live globals
// (gpuParticles, kaijuManager, civManager, world.chunks), and draws a
// compact panel with a rolling frame-time sparkline.
//
// Self-contained: runs its own requestAnimationFrame to sample + redraw,
// so the engine's render loop needs only to construct it and the F1 key
// binding. Hidden by default; F1 (or window.perfHUD.toggle()) shows it.
// No render-path changes — pure read-only overlay.

const HISTORY = 120;          // frame-time samples in the sparkline
const TEXT_HZ = 6;            // text refresh rate (sparkline updates every frame)
const GOOD_MS = 16.7;         // 60fps budget
const WARN_MS = 33.3;         // 30fps

export class PerfHUD {
    constructor(opts = {}) {
        this.getStats = opts.getStats ?? (() => (typeof window !== "undefined" ? window._perfStats : null));
        this.extraSources = opts.extraSources ?? {};
        this.visible = false;
        this._hist = new Float32Array(HISTORY);
        this._histN = 0;
        this._lastText = 0;
        this._raf = 0;
        this._build();
    }

    _build() {
        const root = document.createElement("div");
        Object.assign(root.style, {
            // v708 — moved down 60px + in 60px so the panel doesn't sit on
            // top of the top-row PROMPT/ASSISTANT/HOME or right-edge
            // CAMERAS/SPAWN/RIG LAB minitabs.
            position: "fixed", top: "60px", right: "60px", zIndex: 99999,
            display: "none", width: "240px",
            background: "rgba(8,12,20,0.82)", backdropFilter: "blur(6px)",
            border: "1px solid #1d3350", borderRadius: "10px",
            padding: "9px 11px", color: "#cfe6f7",
            font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)", pointerEvents: "none",
            userSelect: "none",
        });

        // v1572 — header row: title + a minimize button (panel is a pointer-events:none overlay,
        // so the button re-enables pointer events on itself).
        const titleRow = document.createElement("div");
        Object.assign(titleRow.style, { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" });
        const title = document.createElement("div");
        title.textContent = "PERF  ·  `";
        Object.assign(title.style, { fontWeight: "700", letterSpacing: "0.08em", color: "#9fb6d4", fontSize: "10px" });
        const minBtn = document.createElement("div");
        minBtn.textContent = "\u2014";
        minBtn.title = "Minimize (also F1 / the bottom PERFORMANCE tab)";
        Object.assign(minBtn.style, { cursor: "pointer", color: "#9fb6d4", fontSize: "13px", lineHeight: "1", padding: "0 4px", pointerEvents: "auto", userSelect: "none" });
        minBtn.addEventListener("click", (e) => { e.stopPropagation(); try { this.toggle(); } catch {} });
        titleRow.append(title, minBtn);
        root.appendChild(titleRow);

        // Sparkline canvas
        const cv = document.createElement("canvas");
        cv.width = 190; cv.height = 38;
        Object.assign(cv.style, { width: "190px", height: "38px", display: "block",
            marginBottom: "7px", borderRadius: "4px", background: "rgba(0,0,0,0.35)" });
        root.appendChild(cv);
        this._cv = cv; this._ctx = cv.getContext("2d");

        // Big FPS readout
        const fpsBig = document.createElement("div");
        Object.assign(fpsBig.style, { fontSize: "22px", fontWeight: "700",
            fontVariantNumeric: "tabular-nums", lineHeight: "1.1", marginBottom: "4px" });
        root.appendChild(fpsBig);
        this._fpsBig = fpsBig;

        // Stat rows
        const rows = document.createElement("div");
        root.appendChild(rows);
        this._rows = rows;

        // v708 — Worker ECG dock slot. main.js used to mount WorkerEcgHud
        // as a separate draggable panel on the right edge; v708 has it
        // dock here instead. Element gets injected into this slot via
        // perfHUD.dockWorkerEcg(el). Empty until docked.
        const ecgSlot = document.createElement("div");
        ecgSlot.id = "perfhud-ecg-slot";
        Object.assign(ecgSlot.style, {
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px solid #1d3350",
        });
        root.appendChild(ecgSlot);
        this._ecgSlot = ecgSlot;

        if (typeof document !== "undefined") document.body.appendChild(root);
        this._root = root;

        // v688 — also provide a "▲ PERFORMANCE" minitab at the bottom edge
        // so the perf panel can be opened by click, not only F1. Sits after
        // STATUS (left:140) and PS LOG (left:240) in the bottom row.
        const tab = document.createElement("div");
        tab.className = "lcars-minitab edge-bottom color-cyan";
        tab.style.bottom = "0";
        tab.style.left = "340px";
        tab.style.top = "auto";
        tab.style.right = "auto";
        tab.textContent = "▲ PERFORMANCE";
        tab.title = "Show/hide the performance overlay (also F1)";
        tab.addEventListener("click", () => this.toggle());
        if (typeof document !== "undefined") document.body.appendChild(tab);
        this._tab = tab;
    }

    _row(label, value, color) {
        return `<div style="display:flex;justify-content:space-between">
            <span style="color:#6f86a6">${label}</span>
            <b style="color:${color ?? "#eafff2"};font-variant-numeric:tabular-nums">${value}</b></div>`;
    }

    _color(ms) {
        const m = parseFloat(ms);
        if (!Number.isFinite(m)) return "#cfe6f7";
        if (m <= GOOD_MS) return "#22dd77";
        if (m <= WARN_MS) return "#e8c14a";
        return "#ff7676";
    }

    // v708 — accept the WorkerEcgHud element and dock it inside the perf
    // panel instead of as a floating right-edge panel. Removes its
    // standalone position styling so it lays out in flow.
    dockWorkerEcg(el) {
        if (!el || !this._ecgSlot) return false;
        // Strip the absolute / fixed positioning that the draggable
        // wrapper or the hud itself set when it was free-floating.
        try {
            el.style.position = "static";
            el.style.left = el.style.top = el.style.right = el.style.bottom = "";
            el.style.transform = "";
            el.style.boxShadow = "none";
            el.style.width = "100%";
            el.style.maxWidth = "none";
            // Slim down the worker ecg's own padding so it fits
            el.style.padding = "0";
            el.style.margin = "0";
            el.style.background = "transparent";
            el.style.border = "0";
        } catch {}
        this._ecgSlot.appendChild(el);
        return true;
    }

    _drawSparkline() {
        const ctx = this._ctx, w = this._cv.width, h = this._cv.height;
        ctx.clearRect(0, 0, w, h);
        // budget lines (60fps green, 30fps amber)
        const yFor = (ms) => h - Math.min(h, (ms / 50) * h);   // 0..50ms maps to full height
        ctx.strokeStyle = "rgba(34,221,119,0.25)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, yFor(GOOD_MS)); ctx.lineTo(w, yFor(GOOD_MS)); ctx.stroke();
        ctx.strokeStyle = "rgba(232,193,74,0.22)";
        ctx.beginPath(); ctx.moveTo(0, yFor(WARN_MS)); ctx.lineTo(w, yFor(WARN_MS)); ctx.stroke();
        // frame-time line
        if (this._histN > 1) {
            ctx.beginPath();
            for (let i = 0; i < this._histN; i++) {
                const x = (i / (HISTORY - 1)) * w;
                const y = yFor(this._hist[i]);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            const last = this._hist[this._histN - 1];
            ctx.strokeStyle = this._color(last); ctx.lineWidth = 1.5; ctx.stroke();
        }
    }

    _push(ms) {
        if (this._histN < HISTORY) { this._hist[this._histN++] = ms; }
        else { this._hist.copyWithin(0, 1); this._hist[HISTORY - 1] = ms; }
    }

    _sample() {
        const ps = this.getStats() || {};
        const frameMs = parseFloat(ps.frameMs);
        if (Number.isFinite(frameMs)) this._push(frameMs);
        this._drawSparkline();

        const now = performance.now();
        if (now - this._lastText < 1000 / TEXT_HZ) return;
        this._lastText = now;

        const gp   = this.extraSources.gpuParticles?.() ?? (typeof window !== "undefined" ? window.gpuParticles : null);
        const kCount = this.extraSources.kaijuCount?.() ?? null;
        const cCount = this.extraSources.civCount?.() ?? null;
        const chunks = this.extraSources.chunkCount?.() ?? null;
        const particleCount = gp?.aliveCount ?? null;

        this._fpsBig.textContent = `${ps.fps ?? "–"} fps`;
        this._fpsBig.style.color = this._color(ps.frameMs);

        let html = "";
        html += this._row("frame", `${ps.frameMs ?? "–"} ms`, this._color(ps.frameMs));
        html += this._row("build", `${ps.build ?? "–"} ms`);
        if (chunks != null)        html += this._row("chunks", `${ps.chunksDrawn ?? "?"}/${chunks}`);
        else                        html += this._row("chunks drawn", `${ps.chunksDrawn ?? "?"}`);
        if (ps.chunksCulled != null) html += this._row("culled", `${ps.chunksCulled}`);
        html += this._row("entities", `${ps.entCount ?? "?"}`);
        if (particleCount != null) html += this._row("particles", `${particleCount}`);
        if (kCount != null)        html += this._row("kaiju", `${kCount}`);
        if (cCount != null)        html += this._row("civs", `${cCount}`);
        this._rows.innerHTML = html;
    }

    _loop() {
        if (!this.visible) return;
        this._sample();
        this._raf = requestAnimationFrame(() => this._loop());
    }

    show() {
        if (this.visible) return;
        this.visible = true;
        this._root.style.display = "block";
        if (this._tab) this._tab.style.display = "none";   // v688 — hide minitab while panel open
        this._loop();
    }
    hide() {
        this.visible = false;
        this._root.style.display = "none";
        if (this._tab) this._tab.style.display = "block";  // v688 — restore minitab on close
        cancelAnimationFrame(this._raf);
    }
    toggle() { this.visible ? this.hide() : this.show(); }
}
