// FILE: ui/QualityPresetPanel.js
// VERSION: v1 — round 359
//
// Compact draggable panel that selects between three render-quality
// presets. Some knobs apply immediately (bloom on/off — render-loop
// gate); others are read at engine startup (shadowMapSize, gridRadius)
// and require a reload to take full effect — the UI tells the user.
//
// Persistence: localStorage key "voxelengine.qualityPreset_v1"

import { makeDraggable } from "./draggable.js";

const STORAGE_KEY = "voxelengine.qualityPreset_v1";

export const PRESETS = {
    fast: {
        label: "FAST",
        color: "#4cd",
        bloom: false,
        shadowMapSize: 256,
        gridRadius: 5,
        description: "shadow 256 · bloom off · grid 5 (lighter terrain)",
    },
    balanced: {
        label: "BALANCED",
        color: "#9c4",
        bloom: true,
        shadowMapSize: 512,
        gridRadius: 7,
        description: "shadow 512 · bloom on · grid 7 (default)",
    },
    quality: {
        label: "QUALITY",
        color: "#fa6",
        bloom: true,
        shadowMapSize: 1024,
        gridRadius: 10,
        description: "shadow 1024 · bloom on · grid 10 (heaviest)",
    },
    // v643 — AUTO modulates between quality/balanced/fast based on a live
    // FPS target. Knobs are runtime-only (currently bloom on/off; future
    // versions can scale particle counts, fog density, mesh LOD). Saves the
    // target FPS to localStorage so it persists across reloads.
    auto: {
        label: "AUTO",
        color: "#c6f",
        bloom: true,                   // initial state; controller may flip
        shadowMapSize: 512,            // reload-only; auto can't change this
        gridRadius: 7,                 // reload-only
        description: "try slider FPS; ease down on dip, climb back up when easy",
    },
};

const TARGET_FPS_KEY  = "voxelengine.qualityAutoTargetFps";
const TARGET_FPS_MIN  = 30;
const TARGET_FPS_MAX  = 120;
const TARGET_FPS_DEFAULT = 60;
const TIER_ORDER = ["fast", "balanced", "quality"];   // ascending

export function getAutoTargetFps() {
    try {
        const v = parseInt(localStorage.getItem(TARGET_FPS_KEY) || "", 10);
        if (Number.isFinite(v) && v >= TARGET_FPS_MIN && v <= TARGET_FPS_MAX) return v;
    } catch {}
    return TARGET_FPS_DEFAULT;
}
export function setAutoTargetFps(n) {
    n = Math.max(TARGET_FPS_MIN, Math.min(TARGET_FPS_MAX, Math.round(n)));
    try { localStorage.setItem(TARGET_FPS_KEY, String(n)); } catch {}
    return n;
}

const RUNTIME_KEYS = ["bloom"];        // apply immediately
const RELOAD_KEYS  = ["shadowMapSize", "gridRadius"];  // require restart

/** Read the current preset name from localStorage, default "balanced". */
export function getCurrentPreset() {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        if (v && PRESETS[v]) return v;
    } catch {}
    return "balanced";
}

/** Get the resolved knob values for a preset name (or current). */
export function getPresetConfig(name = null) {
    return { ...PRESETS[name || getCurrentPreset()] };
}

/**
 * Apply a preset. Persists choice + applies runtime knobs immediately
 * via the supplied apply functions. Reload-only knobs are persisted
 * but not applied.
 *
 * @param {string} name     "fast" | "balanced" | "quality"
 * @param {Object} hooks    { setBloom?:(bool)=>void }
 * @returns {{requiresReload: boolean, applied: string[], pending: string[]}}
 */
export function setPreset(name, hooks = {}) {
    if (!PRESETS[name]) throw new Error(`unknown quality preset: ${name}`);
    const prev = getCurrentPreset();
    try { localStorage.setItem(STORAGE_KEY, name); } catch {}
    const cfg = PRESETS[name];

    const applied = [];
    const pending = [];

    // Runtime knobs
    if (typeof hooks.setBloom === "function") {
        try { hooks.setBloom(cfg.bloom); applied.push("bloom"); }
        catch (e) { console.warn("[quality] setBloom hook failed:", e?.message ?? e); }
    } else {
        pending.push("bloom (no hook registered)");
    }

    // Reload-only knobs — only "pending" if the preset actually changed
    // them vs current localStorage
    if (prev !== name) {
        for (const k of RELOAD_KEYS) pending.push(k);
    }
    const requiresReload = pending.some(p => !p.includes("no hook"));
    return { requiresReload, applied, pending };
}

/**
 * Mount the floating panel. Returns { element, dispose() }. The element
 * is automatically made draggable.
 *
 * @param {{ setBloom?: (bool)=>void }} hooks  runtime hooks
 */
export function mountQualityPanel(hooks = {}) {
    if (typeof document === "undefined") return null;
    const panel = document.createElement("div");
    Object.assign(panel.style, {
        position: "fixed",
        top: "260px",
        right: "20px",
        // v669 — hidden by default per user request. Was a permanent floating
        // panel covering screen space. Now toggle via window._qualityPanel
        // .show()/.hide() or the SETTINGS hub.
        display: "none",
        background: "rgba(8,14,20,0.94)",
        border: "1px solid #6ad",
        borderRadius: "8px",
        padding: "8px 12px 10px 12px",
        color: "#cfd",
        fontFamily: "monospace",
        fontSize: "11px",
        minWidth: "240px",
        zIndex: "8820",
        boxShadow: "0 0 18px rgba(80,180,255,0.18)",
    });

    const current = getCurrentPreset();
    const radios = Object.entries(PRESETS).map(([key, p]) => {
        const checked = key === current ? "checked" : "";
        return `
            <label style="display:block; cursor:pointer; padding:4px 6px; margin-bottom:3px; border-left:3px solid ${p.color}; background:#06060c;">
                <input type="radio" name="qp-preset" value="${key}" ${checked}/>
                <span style="color:${p.color}; font-weight:bold;">${p.label}</span>
                <div style="color:#9ab; font-size:10px; margin-left:18px;">${p.description}</div>
            </label>
        `;
    }).join("");

    panel.innerHTML = `
        <div style="color:#6cf; font-weight:bold; letter-spacing:1px; padding-bottom:6px; border-bottom:1px solid #233; margin-bottom:8px;">⚙ QUALITY</div>
        <div id="qp-radios">${radios}</div>
        <div id="qp-auto-row" style="display:${current === "auto" ? "block" : "none"}; margin-top:6px; padding:6px 8px; background:#0a0814; border-radius:6px; border:1px solid #443;">
            <div style="color:#c6f; font-size:10px; margin-bottom:4px;">target FPS: <span id="qp-auto-target">${getAutoTargetFps()}</span></div>
            <input type="range" id="qp-auto-slider" min="${TARGET_FPS_MIN}" max="${TARGET_FPS_MAX}" step="5" value="${getAutoTargetFps()}" style="width:100%; accent-color:#c6f;"/>
            <div id="qp-auto-state" style="color:#7a8; font-size:10px; margin-top:3px;">—</div>
        </div>
        <div id="qp-status" style="color:#9ab; font-size:10px; margin-top:6px;">choose a preset</div>
    `;
    document.body.appendChild(panel);

    const drag = makeDraggable(panel, { label: "QUALITY", storageKey: "qualityPanel" });
    drag.attach();

    const $ = sel => panel.querySelector(sel);

    // v643 — Auto FPS slider. Wire it up + show/hide based on preset.
    const autoSlider = $("#qp-auto-slider");
    const autoTargetSpan = $("#qp-auto-target");
    const autoStateDiv = $("#qp-auto-state");
    const autoRow = $("#qp-auto-row");
    if (autoSlider) {
        autoSlider.addEventListener("input", () => {
            const v = setAutoTargetFps(autoSlider.value);
            autoTargetSpan.textContent = v;
            if (hooks.onAutoTargetChange) try { hooks.onAutoTargetChange(v); } catch {}
        });
    }
    // Periodically refresh the AUTO state line (shows current tier + below/above counters).
    if (autoStateDiv && hooks.getAutoState) {
        setInterval(() => {
            if (autoRow.style.display === "none") return;
            try {
                const s = hooks.getAutoState();
                if (s) autoStateDiv.textContent = `tier: ${s.tier}${s.running ? "" : " (paused)"}`;
            } catch {}
        }, 1000);
    }

    panel.querySelectorAll('input[name="qp-preset"]').forEach(r => {
        r.addEventListener("change", () => {
            const result = setPreset(r.value, hooks);
            // Show/hide the AUTO row
            if (autoRow) autoRow.style.display = (r.value === "auto") ? "block" : "none";
            // Tell the controller to start/stop
            if (r.value === "auto") { if (hooks.startAuto) try { hooks.startAuto(); } catch {} }
            else                    { if (hooks.stopAuto)  try { hooks.stopAuto();  } catch {} }
            const msgs = [];
            if (result.applied.length > 0) msgs.push(`✓ applied: ${result.applied.join(", ")}`);
            if (result.requiresReload) msgs.push(`⟳ reload for: ${result.pending.filter(p => !p.includes("no hook")).join(", ")}`);
            $("#qp-status").innerHTML = msgs.join("<br>") || "preset unchanged";
        });
    });

    return {
        element: panel,
        // v669 — show/hide/toggle helpers since the panel now starts hidden
        show()   { panel.style.display = "block"; },
        hide()   { panel.style.display = "none"; },
        toggle() { panel.style.display = panel.style.display === "none" ? "block" : "none"; },
        dispose() {
            drag.detach();
            try { panel.remove(); } catch {}
        },
    };
}
