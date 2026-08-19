// demos_code/kaiju_roster.js — Generate a whole themed roster of kaiju
// through the full AI pipeline (narrative → OBJ → texture → Trellis).
//
// Round 176 introduced this. Round 179 made the run loop headless:
// closing the demo no longer cancels the run — the singleton runner
// in ai/RosterRunner.js keeps going, keeps writing to materialSets
// (which the engine's parallax shader picks up automatically) and
// keeps calling assetLoader.swapMesh on Trellis successes. The demo
// is now a viewer over the runner's state; rosterHud (ui/rosterHud.js)
// shows progress when the demo is closed.

import { failedOBJStore } from "../ai/FailedOBJStore.js";
import { THEMES }         from "../ai/KaijuThemes.js";
import { rosterRunner }   from "../ai/RosterRunner.js";

let overlay = null;
let runnerListener = null;
let rafId = null;

function _btnStyle(color) {
    return `background:transparent; color:${color}; border:1px solid ${color}aa; padding:5px 12px; border-radius:4px; cursor:pointer; font-family:monospace; font-size:11px;`;
}
function _pill(text, color) {
    return `<span style="font-size:9px; padding:1px 6px; border-radius:8px; background:${color}22; color:${color}; border:1px solid ${color}66;">${text}</span>`;
}
function _stagePill(stage, retried) {
    let color, text;
    switch (stage) {
        case "ok":   color = "#8aff9e"; text = retried ? "✓ ↻" : "✓"; break;
        case "fail": color = "#ff8a8a"; text = retried ? "✗ ↻" : "✗"; break;
        case "run":  color = "#ffd884"; text = "…"; break;
        case "skip": color = "#666";    text = "—"; break;
        default:     color = "#555";    text = "·"; break;
    }
    return _pill(text, color);
}

function _renderTrellisStatus() {
    const el = overlay?.querySelector("#roster_trellis_status");
    if (!el) return;
    if (!rosterRunner.isActive() && rosterRunner.trellisAvailable === false) {
        el.textContent = "Trellis 2 status: not probed yet (will probe at run start)";
        el.style.color = "#888";
    } else {
        el.textContent = rosterRunner.trellisAvailable
            ? "Trellis 2 detected — meshes will be generated"
            : "Trellis 2 not available — meshes will be skipped";
        el.style.color = rosterRunner.trellisAvailable ? "#8aff9e" : "#888";
    }
}

function _renderSummary() {
    if (!overlay) return;
    const theme  = rosterRunner.getTheme();
    const states = rosterRunner.getStates();
    if (!theme) return;
    const counts = { narrative: 0, obj: 0, texture: 0, trellis: 0, trellisRelevant: 0 };
    const total = theme.entries.length;
    for (const st of states) {
        if (st.stages.narrative === "ok") counts.narrative++;
        if (st.stages.obj === "ok")       counts.obj++;
        if (st.stages.texture === "ok")   counts.texture++;
        if (st.stages.trellis !== "skip" && st.stages.trellis !== "idle") counts.trellisRelevant++;
        if (st.stages.trellis === "ok")   counts.trellis++;
    }
    const fmt = (n, kind) => {
        const denom = (kind === "trellis") ? counts.trellisRelevant : total;
        if (kind === "trellis" && counts.trellisRelevant === 0) return "—";
        return `${n}/${denom}`;
    };
    overlay.querySelector("#sum_narrative").textContent = fmt(counts.narrative);
    overlay.querySelector("#sum_obj").textContent       = fmt(counts.obj);
    overlay.querySelector("#sum_texture").textContent   = fmt(counts.texture);
    overlay.querySelector("#sum_trellis").textContent   = fmt(counts.trellis, "trellis");
    const { acquired } = rosterRunner.counts();
    const acquiredEl = overlay.querySelector("#sum_acquired");
    if (acquiredEl) {
        acquiredEl.textContent = `${acquired} of ${total} targets acquired`;
        acquiredEl.style.color = acquired === total && total > 0 ? "#8aff9e"
                              : acquired === 0 ? "#888"
                              : "#ffd884";
    }
    const totEl = overlay.querySelector("#roster_total");
    if (totEl) {
        if (rosterRunner.isActive()) {
            totEl.textContent = `${rosterRunner.elapsedSec().toFixed(1)}s`;
            totEl.style.color = "#ffd884";
        } else if (rosterRunner.runStart > 0) {
            const last = (performance.now() - rosterRunner.runStart) / 1000;
            totEl.textContent = `${last.toFixed(0)}s (last run)`;
            totEl.style.color = "#666";
        } else {
            totEl.textContent = "";
        }
    }
    const failedCount = failedOBJStore.size();
    const fdl = overlay.querySelector("#roster_failed_count");
    if (fdl) fdl.textContent = failedCount > 0 ? `(${failedCount} captured)` : "";
    const runBtn = overlay.querySelector("#roster_run");
    const canBtn = overlay.querySelector("#roster_cancel");
    if (runBtn) { runBtn.disabled = rosterRunner.isActive(); runBtn.style.opacity = rosterRunner.isActive() ? "0.5" : "1"; }
    if (canBtn) { canBtn.disabled = !rosterRunner.isActive(); canBtn.style.opacity = rosterRunner.isActive() ? "1" : "0.5"; }
}

function _renderEntryCard(idx) {
    const card = overlay?.querySelector(`#entry_${idx}`);
    const theme = rosterRunner.getTheme();
    if (!card || !theme) return;
    const entry = theme.entries[idx];
    const st = rosterRunner.getStates()[idx];
    if (!entry || !st) return;
    const stagesHtml = ["narrative", "obj", "texture", "trellis"]
        .map(k => `<span style="color:#888;font-size:9px;">${k.slice(0, 3)}</span>${_stagePill(st.stages[k], st.retried[k])}`)
        .join("&nbsp;&nbsp;");
    const tint = st.status === "ok"   ? "#8aff9e"
               : st.status === "fail" ? "#ff8a8a"
               : st.status === "run"  ? "#ffd884" : "#3a3a3a";
    card.style.borderColor = tint + "55";
    card.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
            <div style="font-weight:bold; color:#ddd; font-size:11px; flex:1;">${entry.displayName}</div>
            <div style="font-size:9px; color:#666;">${entry.entityKind}</div>
        </div>
        <div style="margin-top:6px;">${stagesHtml}</div>
        <div style="margin-top:6px; display:flex; gap:6px;">
            <button class="entry-retry" style="${_btnStyle("#ffd884")}">↻ Run / retry</button>
            ${st.results?.texture?.albedo?.dataUrl
                ? `<img src="${st.results.texture.albedo.dataUrl}" style="width:32px; height:32px; border:1px solid #444; border-radius:3px;">`
                : ""}
        </div>
    `;
    card.querySelector(".entry-retry").addEventListener("click", () => {
        if (rosterRunner.isActive()) return;
        rosterRunner.retryEntry(idx);
    });
}

function _renderEntriesGrid() {
    const grid = overlay?.querySelector("#entries_grid");
    const theme = rosterRunner.getTheme();
    if (!grid || !theme) return;
    grid.innerHTML = "";
    if (theme.entries.length === 0) {
        grid.innerHTML = `<div style="color:#888; font-style:italic; padding:20px; text-align:center;">
            This theme is a template — no entries yet.<br>
            Edit <code>ai/KaijuThemes.js</code> and add prompts to the entries array.
        </div>`;
        return;
    }
    for (let i = 0; i < theme.entries.length; i++) {
        const card = document.createElement("div");
        card.id = `entry_${i}`;
        card.style.cssText = "border:1px solid #3a3a3a; border-radius:5px; padding:10px; background:rgba(255,255,255,0.02);";
        grid.appendChild(card);
        _renderEntryCard(i);
    }
}

function _tickTotal() {
    if (!overlay) return;
    _renderSummary();
    rafId = requestAnimationFrame(_tickTotal);
}

export default {
    id:    "kaiju_roster",
    label: "KAIJU ROSTER GENERATOR",
    hint:  "Run the AI pipeline against a whole themed roster of kaiju",

    async start(ctx) {
        overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed; inset:8% 8%; background:rgba(15,15,15,0.96); color:#ddd; border:1px solid #444; border-radius:8px; padding:18px; font-family:monospace; font-size:12px; z-index:10000; overflow-y:auto;";
        overlay.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
                <div style="font-size:14px; color:#8aff9e; font-weight:bold;">KAIJU ROSTER GENERATOR</div>
                <div style="color:#888;">— headless run survives demo close</div>
                <div style="flex:1;"></div>
                <button id="roster_close" style="${_btnStyle("#ff8a8a")}">close</button>
            </div>
            <div style="display:flex; gap:10px; align-items:center; margin-bottom:14px;">
                <span style="color:#aaa;">Theme:</span>
                <select id="roster_theme" style="background:#1a1a1a; color:#ccc; border:1px solid #555; border-radius:3px; padding:4px 6px; font-family:monospace; font-size:11px; min-width:240px;"></select>
                <button id="roster_run" style="${_btnStyle("#8aff9e")}">▶ Generate roster</button>
                <button id="roster_cancel" style="${_btnStyle("#ff8a8a")}">cancel</button>
                <div style="flex:1;"></div>
                <span id="roster_total" style="color:#ffd884; font-weight:bold;"></span>
            </div>
            <div id="roster_trellis_status" style="font-style:italic; color:#888; margin-bottom:10px;">Trellis status: probing…</div>
            <div style="background:rgba(255,255,255,0.03); border:1px solid #2a2a2a; border-radius:6px; padding:10px; margin-bottom:14px; display:flex; gap:18px; align-items:center; flex-wrap:wrap;">
                <div id="sum_acquired" style="font-size:13px; font-weight:bold; color:#888;">— of — targets acquired</div>
                <div style="color:#666;">|</div>
                <div><span style="color:#6db9ff;">narrative</span> <span id="sum_narrative" style="color:#ddd;">—</span></div>
                <div><span style="color:#ffd884;">obj</span> <span id="sum_obj" style="color:#ddd;">—</span></div>
                <div><span style="color:#ff8aff;">texture</span> <span id="sum_texture" style="color:#ddd;">—</span></div>
                <div><span style="color:#8aff9e;">trellis</span> <span id="sum_trellis" style="color:#ddd;">—</span></div>
            </div>
            <div id="entries_grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:10px; margin-bottom:14px;"></div>
            <div style="display:flex; gap:10px; align-items:center; padding:10px; border-top:1px solid #2a2a2a;">
                <button id="roster_download_failed" style="${_btnStyle("#ff8a8a")}">⬇ Download failed OBJs (.jsonl)</button>
                <span id="roster_failed_count" style="color:#888; font-size:10px;"></span>
                <div style="flex:1;"></div>
                <button id="roster_open_preview" style="${_btnStyle("#9eaaff")}">Open parallax preview</button>
            </div>
        `;
        document.body.appendChild(overlay);

        const themeSel = overlay.querySelector("#roster_theme");
        for (const t of THEMES) {
            const opt = document.createElement("option");
            opt.value = t.id;
            opt.textContent = `${t.displayName} (${t.entries.length} entries)`;
            opt.disabled = t.entries.length === 0;
            themeSel.appendChild(opt);
        }
        themeSel.value = rosterRunner.getTheme()?.id ?? "kaiju_classic_foes";
        themeSel.addEventListener("change", () => {
            rosterRunner.setTheme(themeSel.value);
            _renderEntriesGrid();
            _renderSummary();
        });

        overlay.querySelector("#roster_close").addEventListener("click", () => {
            ctx?.setDemo?.(null);
        });
        overlay.querySelector("#roster_run").addEventListener("click", () => rosterRunner.runAll());
        overlay.querySelector("#roster_cancel").addEventListener("click", () => rosterRunner.cancel());
        overlay.querySelector("#roster_download_failed").addEventListener("click", () => {
            const ok = failedOBJStore.downloadJSONL();
            if (!ok) alert("No failed OBJ captures yet. Run the roster (or play the engine) and come back.");
        });
        overlay.querySelector("#roster_open_preview").addEventListener("click", () => {
            window.parallaxPreview?.open();
        });

        runnerListener = (event) => {
            if (event.type === "theme-changed") _renderEntriesGrid();
            else if (event.type === "entry-update") _renderEntryCard(event.index);
            else if (event.type === "trellis-probed") _renderTrellisStatus();
            _renderSummary();
        };
        rosterRunner.addListener(runnerListener);

        _renderEntriesGrid();
        _renderTrellisStatus();
        _renderSummary();
        rafId = requestAnimationFrame(_tickTotal);

        console.log("[kaiju_roster] viewer attached" + (rosterRunner.isActive() ? " (run already in progress)" : ""));
    },

    stop(ctx) {
        // Round 179 — closing the demo does NOT cancel the run. We
        // simply detach our viewer; the runner keeps running, and the
        // HUD takes over the progress display.
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        if (runnerListener) { rosterRunner.removeListener(runnerListener); runnerListener = null; }
        if (overlay?.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
        console.log("[kaiju_roster] viewer detached"
            + (rosterRunner.isActive() ? " — run continues headlessly" : ""));
    },
};
