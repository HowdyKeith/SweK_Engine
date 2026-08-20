// =============================================================================
// FILE: /ui/memoryHUD.js
// ROUND: 199
// =============================================================================
//
// Compact memory dashboard. Sits bottom-left above the idle workers HUD,
// shows real memory usage across the four processes that matter for this
// project: browser JS heap, Node bridge, ComfyUI VRAM, Ollama loaded models.
//
// Click the badge to expand a per-asset breakdown of our WebGL allocations
// (top 10 by byte cost) — answers "which kaiju is hoarding GPU buffers?".
//
// Polling: every 2.5 seconds. Pauses when collapsed and the document is
// hidden (saves bridge load if the user backgrounds the tab).
//
// Data sources:
//   • performance.memory (Chrome-only; gracefully absent elsewhere)
//   • /system/stats (bridge endpoint extended in v199 with .bridge field)
//   • window.assetLoader.getAllocationStats() (v199 byte tracking)
// =============================================================================

const POLL_MS = 2500;
const Z_INDEX = 8650;             // above idleWorkersHUD (8600), below livePipelineHUD (9000)

// Pretty-print bytes with reasonable units
function fmt(bytes) {
    if (bytes == null || isNaN(bytes)) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

// Color a number by usage ratio (0..1). Green low, yellow ~70%, red ~90%+
function ratioColor(ratio) {
    if (ratio == null || isNaN(ratio)) return "#aac8e8";
    if (ratio < 0.6)  return "#5eff8a";
    if (ratio < 0.85) return "#ffd884";
    return "#ff6a6a";
}

export function createMemoryHUD(opts = {}) {
    const bridgeBaseUrl = opts.bridgeBaseUrl || "";

    // ----- Badge (always visible) -----
    const badge = document.createElement("div");
    badge.id = "memoryHUD-badge";
    badge.style.cssText =
        "position:fixed; bottom:48px; left:16px; z-index:" + Z_INDEX + ";" +
        " font-family:monospace; font-size:11px; color:#fc9;" +
        " background:rgba(20,14,6,0.85); border:1px solid #553825;" +
        " padding:6px 10px; border-radius:6px; cursor:pointer;" +
        " user-select:none; min-width:200px;";
    badge.title = "Click for memory details";
    badge.textContent = "💾 Memory: —";
    document.body.appendChild(badge);

    // ----- Detail panel (toggle on click) -----
    const panel = document.createElement("div");
    panel.id = "memoryHUD-panel";
    panel.style.cssText =
        "display:none; position:fixed; bottom:82px; left:16px;" +
        " z-index:" + Z_INDEX + "; min-width:340px; max-width:400px;" +
        " background:rgba(20,14,6,0.94); border:1px solid #7a4f30;" +
        " border-radius:6px; padding:12px 14px;" +
        " font-family:monospace; font-size:11px; color:#fc9;" +
        " box-shadow:0 4px 18px rgba(0,0,0,0.6);";
    document.body.appendChild(panel);

    let expanded = false;
    badge.addEventListener("click", () => {
        expanded = !expanded;
        panel.style.display = expanded ? "block" : "none";
        if (expanded) refresh();   // immediate refresh on expand
    });

    // ----- Polling loop -----
    let lastStats = null;
    async function fetchBridge() {
        try {
            const res = await fetch(`${bridgeBaseUrl}/system/stats`, { cache: "no-store" });
            if (!res.ok) return null;
            return await res.json();
        } catch { return null; }
    }

    function jsHeap() {
        if (typeof performance === "undefined" || !performance.memory) return null;
        return {
            used:  performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit,
        };
    }

    function webglAlloc() {
        const al = window.assetLoader;
        if (!al || typeof al.getAllocationStats !== "function") return null;
        try { return al.getAllocationStats(); } catch { return null; }
    }

    async function refresh() {
        const stats = await fetchBridge();
        lastStats = stats;
        const heap = jsHeap();
        const gl   = webglAlloc();

        // ----- Badge: one compact line -----
        const parts = [];
        if (heap)        parts.push(`🧠 ${fmt(heap.used)}`);
        if (stats?.gpu)  parts.push(`🎨 ${fmt(stats.gpu.memUsedMB * 1024 * 1024)} / ${fmt(stats.gpu.memTotalMB * 1024 * 1024)}`);
        if (stats?.bridge) parts.push(`🌐 ${fmt(stats.bridge.rss)}`);
        badge.textContent = parts.length ? "💾 " + parts.join("  ·  ") : "💾 Memory: (no stats)";

        if (!expanded) return;

        // ----- Detail panel -----
        const rows = [];
        rows.push(`<div style="font-weight:bold; color:#ffd884; margin-bottom:6px;">Memory Usage</div>`);

        // Browser JS heap
        if (heap) {
            const useRatio = heap.used / heap.limit;
            rows.push(
                `<div><span style="color:#aac8e8;">🧠 Browser JS</span> ` +
                `<span style="color:${ratioColor(useRatio)};">${fmt(heap.used)}</span> ` +
                `<span style="color:#888;">/ ${fmt(heap.total)} alloc · ${fmt(heap.limit)} limit</span></div>`
            );
        } else {
            rows.push(`<div><span style="color:#888;">🧠 Browser JS — performance.memory not available (non-Chrome)</span></div>`);
        }

        // Bridge process
        if (stats?.bridge) {
            const b = stats.bridge;
            rows.push(
                `<div style="margin-top:4px;"><span style="color:#aac8e8;">🌐 Node bridge</span> ` +
                `<span style="color:#5eff8a;">${fmt(b.rss)}</span> ` +
                `<span style="color:#888;">rss · ${fmt(b.heapUsed)} V8 heap · ${fmt(b.external)} ext</span></div>`
            );
        }

        // GPU (from nvidia-smi)
        if (stats?.gpu) {
            const g = stats.gpu;
            const used  = g.memUsedMB * 1024 * 1024;
            const total = g.memTotalMB * 1024 * 1024;
            const ratio = used / total;
            rows.push(
                `<div style="margin-top:4px;"><span style="color:#aac8e8;">🎨 GPU VRAM</span> ` +
                `<span style="color:${ratioColor(ratio)};">${fmt(used)}</span> ` +
                `<span style="color:#888;">/ ${fmt(total)} · ${g.utilPct ?? 0}% util · ${g.tempC ?? "?"}°C</span></div>`
            );
            if (g.name) {
                rows.push(`<div style="color:#888; margin-left:18px;">${g.name}</div>`);
            }
        }

        // Ollama models loaded (each one is occupying RAM or VRAM)
        if (stats?.ollamaModels && stats.ollamaModels.length > 0) {
            const total = stats.ollamaModels.reduce((s, m) => s + (m.size || 0), 0);
            rows.push(
                `<div style="margin-top:4px;"><span style="color:#aac8e8;">🤖 Ollama</span> ` +
                `<span style="color:#5eff8a;">${stats.ollamaModels.length}</span> ` +
                `<span style="color:#888;">model${stats.ollamaModels.length === 1 ? "" : "s"} resident · ${fmt(total)}</span></div>`
            );
            for (const m of stats.ollamaModels) {
                const onGpu = m.size_vram > 0;
                rows.push(
                    `<div style="margin-left:18px; color:#aac8e8;">${m.name} ` +
                    `<span style="color:${onGpu ? "#5eff8a" : "#ffd884"};">${onGpu ? "GPU" : "CPU"}</span> ` +
                    `<span style="color:#888;">· ${fmt(m.size)}</span></div>`
                );
            }
        } else if (stats?.ollamaModels && stats.ollamaModels.length === 0) {
            rows.push(`<div style="margin-top:4px; color:#888;">🤖 Ollama — no models resident</div>`);
        }

        // ComfyUI
        if (stats?.comfyui) {
            if (stats.comfyui.reachable === false) {
                rows.push(`<div style="margin-top:4px; color:#888;">🖌️ ComfyUI — not reachable</div>`);
            } else if (stats.comfyui.vramFree != null && stats.comfyui.vramTotal != null) {
                const used = stats.comfyui.vramTotal - stats.comfyui.vramFree;
                rows.push(
                    `<div style="margin-top:4px;"><span style="color:#aac8e8;">🖌️ ComfyUI</span> ` +
                    `<span style="color:${ratioColor(used / stats.comfyui.vramTotal)};">${fmt(used)}</span> ` +
                    `<span style="color:#888;">/ ${fmt(stats.comfyui.vramTotal)} VRAM</span></div>`
                );
            }
        }

        // Our WebGL allocations (per-asset breakdown)
        if (gl) {
            rows.push(
                `<div style="margin-top:8px; padding-top:8px; border-top:1px solid #553825;">` +
                `<span style="color:#aac8e8;">📦 Our WebGL buffers</span> ` +
                `<span style="color:#5eff8a;">${fmt(gl.totalBytes)}</span> ` +
                `<span style="color:#888;">across ${gl.assetCount} asset${gl.assetCount === 1 ? "" : "s"}</span></div>`
            );
            if (gl.top.length > 0) {
                rows.push(`<div style="margin-top:4px; color:#888;">top by byte cost:</div>`);
                for (const a of gl.top) {
                    rows.push(
                        `<div style="margin-left:18px; color:#aac8e8;">${a.name} ` +
                        `<span style="color:#fc9;">${fmt(a.bytes)}</span></div>`
                    );
                }
            }
        }

        // Round 202 — Trellis pre-warm row + button
        rows.push(buildTrellisRow());

        // Round 203 — Hold-for-birth status: pending births waiting for
        // mesh arrival + active reveal animations. Surfaces the otherwise-
        // invisible work happening between request() and the cinematic
        // entrance.
        rows.push(buildBirthRow());

        rows.push(`<div style="margin-top:8px; color:#666; font-size:10px;">poll every ${POLL_MS}ms</div>`);
        panel.innerHTML = rows.join("");

        // Round 202 — attach click handler to the pre-warm button (innerHTML
        // replaces nodes so we need to re-bind every refresh)
        const btn = panel.querySelector("#memoryHUD-prewarm-btn");
        if (btn) btn.addEventListener("click", triggerPrewarm);

        // Round 207 — wire test-reveals button to window.testBirthAll
        const testBtn = panel.querySelector("#memoryHUD-test-births-btn");
        if (testBtn) {
            testBtn.addEventListener("click", () => {
                if (typeof window.testBirthAll === "function") {
                    window.testBirthAll();
                } else {
                    console.warn("[memoryHUD] window.testBirthAll not available");
                }
            });
        }
    }

    // Round 202 — render the prewarm section. Shows last warmup time/age
    // and a button to trigger a new warmup. The button changes state during
    // an in-flight run.
    function buildTrellisRow() {
        const last = readLastWarmup();
        const inFlight = window._trellisPrewarmInFlight;
        let lastLine = "";
        if (last) {
            const ageMin = Math.round((Date.now() - last.timestamp) / 60000);
            const tookMin = (last.elapsedMs / 60000).toFixed(1);
            const status = last.ok ? "✓" : "✗";
            const ageStr = ageMin < 1 ? "just now" : ageMin === 1 ? "1 min ago" : `${ageMin} min ago`;
            lastLine = `<div style="color:#888; margin-top:2px;">last warmup ${status} ${tookMin} min · ${ageStr} · res=${last.resolution} steps=${last.steps}</div>`;
        }
        const btnLabel = inFlight ? "⏳ warming up…" : "🔥 Pre-warm Trellis";
        const btnStyle = "background:#553825; color:#fc9; border:1px solid #7a4f30; padding:4px 8px; border-radius:4px; cursor:pointer; font-family:monospace; font-size:10px;" +
                         (inFlight ? " opacity:0.6; cursor:wait;" : "");
        return (
            `<div style="margin-top:8px; padding-top:8px; border-top:1px solid #553825;">` +
            `<span style="color:#aac8e8;">🔥 Trellis pre-warm</span>` +
            `<button id="memoryHUD-prewarm-btn" ${inFlight ? "disabled" : ""} style="${btnStyle}; margin-left:8px;">${btnLabel}</button>` +
            `${lastLine}` +
            `</div>`
        );
    }

    function readLastWarmup() {
        try {
            const raw = localStorage.getItem("voxelengine.lastTrellisWarmup");
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }

    // Round 203 — Hold-for-birth status row. Pulls from
    // window.birthSpawner.snapshot() which gives pending + active +
    // running totals. Nothing renders if the birth system never had a
    // request (clean default for users who don't use BirthSpawner).
    function buildBirthRow() {
        const bs = window.birthSpawner;
        if (!bs || typeof bs.snapshot !== "function") return "";
        const snap = bs.snapshot();
        const noActivity = snap.pending.length === 0 && snap.active.length === 0 && snap.stats.requested === 0;

        // Round 207 — test button is always present (lets the user trigger
        // the 7 reveal modes for visual inspection without waiting for an
        // AI pipeline run). Activity rows still gated by noActivity.
        const testBtnStyle = "background:#553825; color:#fc9; border:1px solid #7a4f30; padding:3px 7px; border-radius:4px; cursor:pointer; font-family:monospace; font-size:10px;";
        const testBtn = `<button id="memoryHUD-test-births-btn" style="${testBtnStyle}; margin-left:8px;">🧪 Test all 7 modes</button>`;

        const pendLines = snap.pending.length === 0 ? "" :
            snap.pending.map(p => {
                const waitedSec = (p.waitedMs / 1000).toFixed(0);
                return `<div style="margin-left:18px; color:#aac8e8;">${p.assetId} <span style="color:#888;">waiting ${waitedSec}s</span></div>`;
            }).join("");
        const activeLines = snap.active.length === 0 ? "" :
            snap.active.map(a => {
                const pct = Math.round(a.progress * 100);
                const modeTag = a.mode ? ` <span style="color:#fc9;">${a.mode}</span>` : "";
                return `<div style="margin-left:18px; color:#ffe066;">entity #${a.entityId}${modeTag} <span style="color:#888;">revealing ${pct}%</span></div>`;
            }).join("");
        const statLine = noActivity ? "" :
            `<div style="color:#888; margin-top:2px;">requested ${snap.stats.requested} · born ${snap.stats.born} · revealed ${snap.stats.revealed}</div>`;
        return (
            `<div style="margin-top:8px; padding-top:8px; border-top:1px solid #553825;">` +
            `<span style="color:#aac8e8;">🥚 Hold for birth</span>` +
            (snap.pending.length > 0 ? ` <span style="color:#ffd884;">${snap.pending.length} pending</span>` : "") +
            (snap.active.length > 0  ? ` <span style="color:#ffe066;">${snap.active.length} revealing</span>` : "") +
            testBtn +
            statLine +
            pendLines +
            activeLines +
            `</div>`
        );
    }

    async function triggerPrewarm() {
        if (window._trellisPrewarmInFlight) return;
        window._trellisPrewarmInFlight = true;
        refresh();   // immediately update button state
        try {
            const { primeTrellis } = await import("../ai/ColdStartPrimer.js");
            console.log("[memoryHUD] starting Trellis pre-warm (res=256, steps=4) — expect 5-10 min on Pascal");
            const r = await primeTrellis({
                onProgress: (info) => {
                    if (info.elapsedMs % 30000 < 1500) {
                        console.log(`[trellis-prewarm] still running… ${(info.elapsedMs / 1000).toFixed(0)}s elapsed`);
                    }
                },
            });
            const min = (r.elapsedMs / 60000).toFixed(1);
            if (r.ok) {
                console.log(`[trellis-prewarm] ✓ done in ${min} min — models cached in VRAM, next real run should skip ~60-90s of model loading`);
            } else {
                console.warn(`[trellis-prewarm] ✗ failed after ${min} min: ${r.error}`);
            }
        } catch (e) {
            console.warn("[trellis-prewarm] error:", e?.message || e);
        } finally {
            window._trellisPrewarmInFlight = false;
            refresh();   // update button state + show new "last warmup" line
        }
    }

    // Poll loop — pause when tab hidden + collapsed to be polite
    function shouldPoll() {
        if (typeof document !== "undefined" && document.visibilityState === "hidden" && !expanded) return false;
        return true;
    }
    setInterval(() => { if (shouldPoll()) refresh(); }, POLL_MS);
    refresh();   // immediate first paint

    return {
        badge, panel,
        getLastStats: () => lastStats,
        setExpanded(v) { expanded = v; panel.style.display = v ? "block" : "none"; if (v) refresh(); },
    };
}
