// =============================================================================
// FILE: /ui/idleWorkersHUD.js
// ROUND: 191
// =============================================================================
//
// Tiny status overlay for the IdleScheduler. Shows:
//   - A compact badge bottom-left of the viewport with the count of
//     active background tasks
//   - On click, expands to a panel listing each task with its label,
//     tick count, total CPU ms consumed, and a pause/resume toggle
//   - Hosts the voxel-automata task's preview canvas inline so the
//     user can see live evidence of background CPU work
//
// API: createIdleWorkersHUD(scheduler, { automataCanvas? }) → { element }
// =============================================================================

export function createIdleWorkersHUD(scheduler, opts = {}) {
    const automataCanvas = opts.automataCanvas || null;

    const root = document.createElement("div");
    root.className = "idle-workers-hud";
    root.style.cssText =
        "position:fixed; bottom:16px; left:16px; z-index:8600; " +
        "font-family:monospace; font-size:11px; color:#ccc;";

    // ---- Badge (always visible)
    const badge = document.createElement("button");
    badge.title = "Background workers — click to expand";
    badge.style.cssText =
        "padding:6px 12px; background:rgba(20,10,30,0.85); color:#c8a8ff; " +
        "border:1px solid #553080; border-radius:4px; cursor:pointer; " +
        "font-family:monospace; font-size:12px;";
    badge.textContent = "🧠 Workers: —";
    root.appendChild(badge);

    // ---- Expanded panel (hidden by default)
    const panel = document.createElement("div");
    panel.style.cssText =
        "display:none; position:absolute; bottom:42px; left:0; " +
        "min-width:340px; background:rgba(15,10,25,0.92); " +
        "backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); " +
        "border:1px solid #553080; border-radius:6px; padding:10px; " +
        "box-shadow:0 4px 20px rgba(0,0,0,0.6);";
    root.appendChild(panel);

    const header = document.createElement("div");
    header.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:8px;";
    header.innerHTML = `
        <span style="color:#c8a8ff; font-weight:bold;">BACKGROUND WORKERS</span>
        <span style="flex:1;"></span>
        <span style="font-size:9px; color:#888; font-style:italic;">runs during idle frames</span>
    `;
    panel.appendChild(header);

    // Worker rows host
    const list = document.createElement("div");
    list.style.cssText = "display:flex; flex-direction:column; gap:6px;";
    panel.appendChild(list);

    // Optional automata canvas mounted below the list
    if (automataCanvas) {
        const sep = document.createElement("div");
        sep.style.cssText = "margin-top:10px; padding-top:8px; border-top:1px solid #333; display:flex; gap:8px; align-items:flex-start;";
        const cWrap = document.createElement("div");
        cWrap.style.cssText = "border:1px solid #444; border-radius:4px; padding:2px; background:#000;";
        // Scale up the 96x96 source to ~144 visible px without blurring
        automataCanvas.style.width  = "144px";
        automataCanvas.style.height = "144px";
        cWrap.appendChild(automataCanvas);
        const cLabel = document.createElement("div");
        cLabel.style.cssText = "font-size:9px; color:#888; line-height:1.5;";
        cLabel.innerHTML = `<b style="color:#80dcff;">live evidence</b><br>` +
                           `a Conway-variant<br>` +
                           `cellular automaton<br>` +
                           `runs each idle frame,<br>` +
                           `repainting this 96×96<br>` +
                           `canvas. pure CPU.`;
        sep.appendChild(cWrap);
        sep.appendChild(cLabel);
        panel.appendChild(sep);
    }

    // ---- Toggle
    let expanded = false;
    badge.addEventListener("click", () => {
        expanded = !expanded;
        panel.style.display = expanded ? "block" : "none";
    });

    // ---- Update render
    function refresh(stats) {
        const arr = stats instanceof Map ? Array.from(stats.values()) : Object.values(stats || {});
        // Badge text: count of NON-DONE, NON-PAUSED tasks
        const active = arr.filter(t => !t.paused && !t.done).length;
        const total  = arr.length;
        badge.textContent = `🧠 Workers: ${active}/${total}`;

        // Rebuild list — short enough that re-rendering each tick is fine
        list.innerHTML = "";
        for (const t of arr) {
            const row = document.createElement("div");
            row.style.cssText = "display:grid; grid-template-columns:1fr 70px 60px 50px; gap:6px; align-items:center; padding:4px 6px; background:rgba(255,255,255,0.03); border-radius:3px;";

            // Label + status dot
            const label = document.createElement("div");
            const dotColor =
                t.paused  ? "#666" :
                t.done    ? "#8aff9e" :
                t.running ? "#ffd884" :
                "#6db9ff";
            label.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${dotColor}; margin-right:6px; vertical-align:baseline;"></span>${t.label || t.name}`;
            label.style.cssText = "color:#ccc;";
            row.appendChild(label);

            // Tick count
            const ticks = document.createElement("div");
            ticks.style.cssText = "color:#888; text-align:right; font-variant-numeric:tabular-nums;";
            ticks.textContent = t.tickCount.toString() + " ticks";
            row.appendChild(ticks);

            // Total CPU ms used
            const ms = document.createElement("div");
            ms.style.cssText = "color:#888; text-align:right; font-variant-numeric:tabular-nums;";
            const totalSec = t.totalMs / 1000;
            ms.textContent = totalSec < 1
                ? `${Math.round(t.totalMs)}ms`
                : `${totalSec.toFixed(1)}s`;
            row.appendChild(ms);

            // Pause/resume button
            const btn = document.createElement("button");
            btn.style.cssText = "background:transparent; color:#888; border:1px solid #555; border-radius:3px; padding:2px 6px; cursor:pointer; font-size:10px; font-family:monospace;";
            if (t.done) {
                btn.textContent = "done";
                btn.disabled = true;
                btn.style.opacity = "0.5";
            } else if (t.paused) {
                btn.textContent = "▶";
                btn.title = "Resume";
                btn.addEventListener("click", (e) => { e.stopPropagation(); scheduler.resume(t.name); });
            } else {
                btn.textContent = "⏸";
                btn.title = "Pause";
                btn.addEventListener("click", (e) => { e.stopPropagation(); scheduler.pause(t.name); });
            }
            row.appendChild(btn);

            list.appendChild(row);
        }
    }

    // Live-update from scheduler events
    scheduler.addListener(refresh);
    refresh(scheduler.stats());

    return { element: root };
}
