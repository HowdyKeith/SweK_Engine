// =============================================================================
// FILE: /ui/livePipelineHUD.js
// ROUND: 189
// =============================================================================
//
// Heads-up display overlaid on the engine canvas, showing a PipelineManager's
// jobs in real time. Designed to be glanceable while the engine keeps
// playing below — semi-transparent, draggable, minimizable to a thin strip.
//
// The HUD does NOT own the pipeline. It subscribes to one. Caller pattern:
//
//   const hud  = createLivePipelineHUD({ title: "🌊 LIVE PIPELINE" });
//   const pm   = new PipelineManager({
//       stages,
//       onJobUpdate: (job) => hud.updateJob(job),
//   });
//   hud.attachManager(pm);   // so we know what stages exist for the grid
//   document.body.appendChild(hud.element);
//   hud.show();              // start visible (minimized by default)
//   ... user kicks off jobs via pm.submit() ...
//   ... HUD renders progress live ...
//   ... eventually fade out or call hud.hide() ...
//
// Visual states:
//   - Minimized (default): single 28-32px tall strip top-right of the canvas.
//                          Shows logo + N/M progress + per-job dots + elapsed.
//   - Expanded: the strip plus a grid panel below (rows = jobs, cols = stages).
//                Toggle via the ▲/▼ chevron.
//   - Hidden: opacity 0, pointer-events none. show() / hide() animate.
//
// Drag behavior: header bar is the drag handle. Constrains to viewport.
// =============================================================================

const Z_INDEX = 9000;

function _btnInlineStyle(color) {
    return `padding:2px 6px; background:#1a1a1a; color:${color}; border:1px solid #444; border-radius:3px; cursor:pointer; font-family:monospace; font-size:10px; user-select:none;`;
}

export function createLivePipelineHUD({ title = "🌊 LIVE PIPELINE" } = {}) {
    const root = document.createElement("div");
    root.className = "live-pipeline-hud";
    // Round 263c — moved left so its right edge sits ~1 inch (96px) left
    // of the WAD-map compass's left edge. Compass: right:2, width:60,
    // so compass left edge sits at right:62 from screen-right. Pipeline
    // right = 62 + 96 = 158px.
    root.style.cssText =
        `position:fixed; top:16px; right:350px; z-index:${Z_INDEX}; ` +
        "min-width:280px; background:rgba(10,10,10,0.78); " +
        // Round 307 — backdrop-filter is the single biggest perf hit
        // available in CSS. Even at opacity:0, many GPU paths still run
        // the blur every frame on whatever sits behind. We DEFER applying
        // it until show() (and remove it on hide()), so the hidden state
        // is genuinely free.
        "border:1px solid #333; border-radius:6px; box-shadow:0 4px 16px rgba(0,0,0,0.6); " +
        "color:#ddd; font-family:monospace; font-size:11px; " +
        "opacity:0; pointer-events:none; transition:opacity 200ms ease-out;";

    // -------- HEADER STRIP (always visible when HUD is shown) --------
    const header = document.createElement("div");
    header.style.cssText =
        "display:flex; align-items:center; gap:8px; padding:6px 10px; " +
        "cursor:move; user-select:none; border-bottom:1px solid transparent; " +
        "transition:border-color 150ms ease-out;";

    const logo = document.createElement("span");
    logo.style.cssText = "color:#6db9ff; font-weight:bold; letter-spacing:0.5px;";
    logo.textContent = title;
    header.appendChild(logo);

    const counts = document.createElement("span");
    counts.style.cssText = "color:#aaa; min-width:44px;";
    counts.textContent = "0/0";
    header.appendChild(counts);

    // Dots row — one dot per job. Filled when done, hollow if queued,
    // pulsing if running. Compact visual summary.
    const dots = document.createElement("div");
    dots.style.cssText = "display:flex; gap:3px; flex:1;";
    header.appendChild(dots);

    const elapsed = document.createElement("span");
    elapsed.style.cssText = "color:#888; min-width:54px; text-align:right; font-variant-numeric:tabular-nums;";
    elapsed.textContent = "";
    header.appendChild(elapsed);

    const expandBtn = document.createElement("button");
    expandBtn.style.cssText = _btnInlineStyle("#aaa") + "min-width:24px;";
    expandBtn.textContent = "▼";
    expandBtn.title = "Expand";
    header.appendChild(expandBtn);

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = _btnInlineStyle("#888") + "min-width:22px;";
    closeBtn.textContent = "×";
    closeBtn.title = "Hide";
    header.appendChild(closeBtn);

    root.appendChild(header);

    // -------- EXPANDED GRID (revealed by expand button) --------
    const expanded = document.createElement("div");
    expanded.style.cssText =
        "display:none; padding:8px 10px 10px 10px; max-height:60vh; overflow:auto; " +
        "border-top:1px solid #2a2a2a;";
    root.appendChild(expanded);

    const gridHeader = document.createElement("div");
    gridHeader.style.cssText = "display:none; color:#666; font-size:9px; padding-bottom:4px; border-bottom:1px solid #2a2a2a; margin-bottom:6px;";
    expanded.appendChild(gridHeader);

    const rowsWrap = document.createElement("div");
    rowsWrap.style.cssText = "display:flex; flex-direction:column; gap:4px;";
    expanded.appendChild(rowsWrap);

    // -------- STATE --------
    let stageNames = [];
    let manager    = null;
    let jobOrder   = [];                // ids in submit order, for stable grid rows
    let elapsedTimer = null;
    let startedAt = 0;
    let isExpanded = false;
    let visible = false;
    let userTouched = false;            // user dragged; suppress auto-center on show()

    // -------- DRAG --------
    let dragOff = null;
    header.addEventListener("mousedown", (ev) => {
        if (ev.target === expandBtn || ev.target === closeBtn) return;
        const rect = root.getBoundingClientRect();
        dragOff = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        header.style.borderBottomColor = "#444";
        userTouched = true;
        ev.preventDefault();
    });
    window.addEventListener("mousemove", (ev) => {
        if (!dragOff) return;
        const x = Math.max(0, Math.min(window.innerWidth  - root.offsetWidth,  ev.clientX - dragOff.x));
        const y = Math.max(0, Math.min(window.innerHeight - root.offsetHeight, ev.clientY - dragOff.y));
        root.style.left  = x + "px";
        root.style.top   = y + "px";
        root.style.right = "auto";   // override the initial right:16px
    });
    window.addEventListener("mouseup", () => {
        if (dragOff) header.style.borderBottomColor = "transparent";
        dragOff = null;
    });

    // -------- EXPAND TOGGLE --------
    function setExpanded(open) {
        isExpanded = open;
        expanded.style.display = open ? "block" : "none";
        expandBtn.textContent  = open ? "▲" : "▼";
        expandBtn.title        = open ? "Minimize" : "Expand";
    }
    expandBtn.addEventListener("click", () => setExpanded(!isExpanded));
    // Clicking dots-area also expands — discoverable
    dots.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (!isExpanded) setExpanded(true);
    });

    closeBtn.addEventListener("click", () => api.hide());

    // -------- API: PIPELINE WIRE-UP --------
    function attachManager(pm) {
        manager = pm;
        stageNames = (pm.stages || []).map(s => s.name);
        // Build grid header
        gridHeader.style.display = "grid";
        gridHeader.style.gridTemplateColumns = `26px 1fr ${stageNames.map(() => "92px").join(" ")} 60px`;
        gridHeader.style.gap = "6px";
        gridHeader.innerHTML =
            `<div>#</div><div>prompt</div>` +
            stageNames.map(n => `<div style="text-align:center;">${n}</div>`).join("") +
            `<div style="text-align:right;">total</div>`;
        rowsWrap.innerHTML = "";
        jobOrder = [];
    }

    function _ensureRow(job) {
        let row = rowsWrap.querySelector(`[data-hud-job="${job.id}"]`);
        if (row) return row;
        row = document.createElement("div");
        row.dataset.hudJob = job.id;
        row.style.cssText =
            `display:grid; grid-template-columns: 26px 1fr ${stageNames.map(() => "92px").join(" ")} 60px; ` +
            "gap:6px; align-items:center; padding:3px 0; font-size:10px;";
        const idx = document.createElement("div");
        idx.style.color = "#666";
        idx.textContent = String(jobOrder.length + 1);
        row.appendChild(idx);

        const prompt = document.createElement("div");
        prompt.style.cssText = "color:#bbb; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
        prompt.title = job.input.prompt || "";
        // Show kind tag if the orchestrator stamped one, else snippet of prompt
        const kindTag = job.input.kind ? `[${job.input.kind}] ` : "";
        prompt.textContent = kindTag + (job.input.prompt || "").slice(0, 60);
        row.appendChild(prompt);

        for (const stage of stageNames) {
            const cell = document.createElement("div");
            cell.dataset.stage = stage;
            cell.style.textAlign = "center";
            cell.innerHTML = `<span style="padding:1px 6px; background:#222; color:#555; border-radius:3px;">—</span>`;
            row.appendChild(cell);
        }
        const total = document.createElement("div");
        total.dataset.field = "total";
        total.style.cssText = "text-align:right; color:#666;";
        total.textContent = "—";
        row.appendChild(total);

        rowsWrap.appendChild(row);
        jobOrder.push(job.id);
        return row;
    }

    function _stagePillStyle(state) {
        // Returns {bg, fg, text} for a given stage state.
        if (state.failed)  return { bg: "#3a0000", fg: "#ff8a8a", text: "fail" };
        if (state.done)    return { bg: "#003a14", fg: "#8aff9e", text: "✓ " + (state.ms || "") };
        if (state.running) return { bg: "#3a2a00", fg: "#ffd884", text: "▶ run" };
        if (state.queued)  return { bg: "#0a1a3a", fg: "#6db9ff", text: "⌛" };
        return { bg: "#1a1a1a", fg: "#444", text: "—" };
    }

    function _fmt(ms) {
        if (ms == null) return "";
        const s = ms / 1000;
        if (s < 60) return s.toFixed(1) + "s";
        const m = Math.floor(s / 60);
        const rem = Math.round(s - m * 60);
        return `${m}m${String(rem).padStart(2, "0")}s`;
    }

    function updateJob(job) {
        const row = _ensureRow(job);
        for (const stage of stageNames) {
            const cell = row.querySelector(`[data-stage="${stage}"]`);
            const pill = cell.firstElementChild;
            const t = job.timings[stage];
            const state = {
                failed:  !!job.errors[stage],
                done:    !!job.results[stage],
                running: job.stage === stage && job.status === "running",
                queued:  job.stage === stage && job.status === "queued",
                ms:      t && t.ms != null ? _fmt(t.ms) : "",
            };
            const style = _stagePillStyle(state);
            pill.style.background = style.bg;
            pill.style.color      = style.fg;
            pill.textContent      = style.text;
            // Round 166 (v661) — hover tooltip on failed cells so the user can
            // see WHY a stage failed without opening the console. The error
            // message is already stored in job.errors[stage] by PipelineManager
            // (line 216); we just never surfaced it. Critical for the kaggle
            // column where "fail" alone doesn't say if it's "no albedo from
            // texture stage" vs "bridge unreachable" vs "Kaggle disabled".
            // Done cells get a duration tooltip; running cells get a hint.
            if (state.failed) {
                pill.title = `${stage} failed: ${job.errors[stage]}`;
                pill.style.cursor = "help";
            } else if (state.done) {
                pill.title = `${stage} ok · ${state.ms}`;
                pill.style.cursor = "default";
            } else if (state.running) {
                pill.title = `${stage} running…`;
                pill.style.cursor = "default";
            } else {
                pill.title = stage;
                pill.style.cursor = "default";
            }
            // Pulse running cells subtly
            pill.style.animation = state.running ? "livePipePulse 1.2s ease-in-out infinite" : "";
        }
        const total = row.querySelector('[data-field="total"]');
        if (job.startedAt && job.finishedAt) {
            const ms = Math.round(job.finishedAt - job.startedAt);
            total.textContent = _fmt(ms);
            total.style.color = job.status === "done" ? "#8aff9e" : "#ff8a8a";
        } else if (job.startedAt) {
            total.textContent = "…";
            total.style.color = "#ffd884";
        }

        _refreshHeader();

        // Round 265 — if this job just finished and nothing else is
        // running/queued, schedule the panel to auto-hide. New jobs
        // starting up will cancel the timer (in show()).
        if (manager && (job.status === "done" || job.status === "failed")) {
            const anyActive = Array.from(manager.jobs.values())
                .some(j => j.status === "running" || j.status === "queued");
            if (!anyActive) _scheduleAutoHide();
        } else if (job.status === "running" || job.status === "queued") {
            // A new active job — make sure we're visible
            if (!visible) show();
        }
    }

    function _refreshHeader() {
        if (!manager) return;
        const jobs = Array.from(manager.jobs.values());
        const ok   = jobs.filter(j => j.status === "done").length;
        const total = jobs.length;
        counts.textContent = `${ok}/${total}`;

        // Rebuild dots row to reflect each job's status
        dots.innerHTML = "";
        for (const j of jobs) {
            const dot = document.createElement("span");
            dot.style.cssText = "width:8px; height:8px; border-radius:50%; display:inline-block;";
            if (j.status === "done")          dot.style.background = "#8aff9e";
            else if (j.status === "failed")   dot.style.background = "#ff8a8a";
            else if (j.status === "running") {
                dot.style.background = "#ffd884";
                dot.style.animation = "livePipePulse 1.2s ease-in-out infinite";
            }
            else if (j.status === "queued") {
                dot.style.background = "transparent";
                dot.style.border = "1px solid #555";
                dot.style.width  = "6px";
                dot.style.height = "6px";
            }
            else dot.style.background = "#444";
            dot.title = `${j.id} · ${j.stage} · ${j.status}`;
            dots.appendChild(dot);
        }
    }

    // -------- VISIBILITY --------
    // Round 265 — show: slide-down from 8px above + fade in. hide:
    // fade out + slide back. Auto-hide kicks in 2.5s after the last
    // running job ends, so users don't have to manually dismiss.
    let autoHideTimer = null;
    function show() {
        clearTimeout(autoHideTimer); autoHideTimer = null;
        root.style.transform = "translateY(-8px)";
        root.style.opacity = "0";
        root.style.pointerEvents = "none";
        // Round 307 — apply backdrop-filter only when shown. While hidden,
        // the blur is removed so the GPU doesn't process it every frame.
        root.style.backdropFilter = "blur(6px)";
        root.style.webkitBackdropFilter = "blur(6px)";
        // Force layout, then animate in
        // eslint-disable-next-line no-unused-expressions
        root.offsetHeight;
        root.style.transition = "opacity 220ms ease-out, transform 260ms cubic-bezier(0.2,0.7,0.3,1.1)";
        root.style.opacity = "1";
        root.style.transform = "translateY(0)";
        root.style.pointerEvents = "auto";
        visible = true;
        if (!startedAt) startedAt = performance.now();
        if (!elapsedTimer) {
            elapsedTimer = setInterval(() => {
                if (!visible) return;
                const ms = performance.now() - startedAt;
                elapsed.textContent = _fmt(ms);
            }, 1000);
        }
    }
    function hide() {
        clearTimeout(autoHideTimer); autoHideTimer = null;
        root.style.transition = "opacity 280ms ease-in, transform 320ms ease-in";
        root.style.opacity = "0";
        root.style.transform = "translateY(-8px)";
        root.style.pointerEvents = "none";
        visible = false;
        if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
        // Round 307 — drop the blur once the fade-out animation completes
        // so the hidden state is truly free of backdrop-filter work.
        setTimeout(() => {
            if (!visible) {
                root.style.backdropFilter = "";
                root.style.webkitBackdropFilter = "";
            }
        }, 300);
    }
    function _scheduleAutoHide() {
        clearTimeout(autoHideTimer);
        autoHideTimer = setTimeout(() => {
            if (!manager) { hide(); return; }
            const anyActive = Array.from(manager.jobs.values())
                .some(j => j.status === "running" || j.status === "queued");
            if (!anyActive) hide();
        }, 2500);
    }
    function reset() {
        rowsWrap.innerHTML = "";
        jobOrder = [];
        startedAt = 0;
        elapsed.textContent = "";
        counts.textContent = "0/0";
        dots.innerHTML = "";
    }

    // -------- KEYFRAMES (one-shot global injection) --------
    if (!document.getElementById("live-pipe-keyframes")) {
        const style = document.createElement("style");
        style.id = "live-pipe-keyframes";
        style.textContent = `
            @keyframes livePipePulse {
                0%, 100% { opacity: 1; }
                50%      { opacity: 0.35; }
            }
        `;
        document.head.appendChild(style);
    }

    const api = {
        element: root,
        attachManager,
        updateJob,
        show, hide, reset,
        setExpanded,
        get expanded() { return isExpanded; },
        get visible()  { return visible; },
    };
    return api;
}
