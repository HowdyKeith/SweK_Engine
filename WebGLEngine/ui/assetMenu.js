// FILE: ui/assetMenu.js
// VERSION: v1
//
// Asset browser for the dock rail. Shows what GLBs / mesh assets
// the engine has loaded, what kaiju kinds + civ styles they're
// bound to, and lets the user override bindings via dropdown.
//
// Sections:
//   * KAIJU — 6 kinds. Each row: status, default name, override picker.
//   * CIVS — 5 styles. Same layout.
//   * MODELS — procedural creatures (read-only count + names).
//
// Refresh button at bottom re-fetches asset / model lists. Reads
// override state from gpu/assetOverrides.js and writes via the
// dropdown change handlers there.

import { getOverride, setOverride, onChange } from "../gpu/assetOverrides.js";

const KAIJU_KINDS = ["sky", "space", "cave", "underground", "water", "hell"];
const CIV_STYLES  = ["tower", "ring_wall", "plaza", "spire_field", "step_pyramid"];

export class AssetMenu {
    constructor({ parent, assetLoader, modLoader = null }) {
        this.assetLoader = assetLoader;
        this.modLoader = modLoader;
        this.assetNames = [];           // names from /assets/list
        this.modelNames = [];           // names from /models/list?dir=scene
        this._build(parent ?? document.body);
        this._refresh();
        // Subscribe to override changes so external writes update UI
        this._unsubOverride = onChange(() => this._renderRows());
        // Round 26 — refresh when mods finish loading
        if (this.modLoader?.onChange) {
            this._unsubMods = this.modLoader.onChange(() => this._renderRows());
        }
        // v788 — refresh when SplatScene state changes (load/clear via
        // any code path: button, drag-drop, console). Listener stays
        // bound for the menu's lifetime — no opt-out needed since the
        // menu is a long-lived singleton.
        this._onSplatChange = () => this._renderRows();
        try { window.addEventListener("splatscene-change", this._onSplatChange); } catch {}
    }

    _build(parent) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, {
            background: "rgba(0,0,0,0.85)",
            border: "1px solid #f96",
            borderRadius: "12px 12px 4px 4px",
            color: "#fc6",
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            fontSize: "11px",
            width: "300px",
            maxHeight: "75vh",
            overflowY: "auto",
            padding: "0",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
            background: "#f96",
            color: "#000",
            padding: "8px 12px",
            fontSize: "11px",
            fontWeight: "bold",
            letterSpacing: "1px",
        });
        header.textContent = "ASSETS";
        wrap.appendChild(header);

        // Container that gets rebuilt on each refresh — easier than
        // diffing rows when the asset list changes.
        this._body = document.createElement("div");
        this._body.style.padding = "8px 10px";
        wrap.appendChild(this._body);

        // Refresh button at bottom
        const footer = document.createElement("div");
        Object.assign(footer.style, {
            padding: "8px 10px",
            borderTop: "1px dashed #553",
        });
        const refreshBtn = document.createElement("button");
        refreshBtn.textContent = "Refresh";
        Object.assign(refreshBtn.style, {
            width: "100%",
            background: "#f96",
            color: "#000",
            border: "none",
            padding: "6px 10px",
            fontFamily: "'Helvetica Neue', Arial, sans-serif",
            fontWeight: "bold",
            fontSize: "10px",
            letterSpacing: "1px",
            cursor: "pointer",
            borderRadius: "4px",
        });
        refreshBtn.addEventListener("click", () => this._refresh());
        footer.appendChild(refreshBtn);
        wrap.appendChild(footer);

        parent.appendChild(wrap);
        this.root = wrap;
    }

    async _refresh() {
        try {
            const [aRes, mRes] = await Promise.all([
                fetch("/assets/list"),
                fetch("/models/list?dir=scene"),
            ]);
            const aJson = await aRes.json();
            const mJson = await mRes.json();
            this.assetNames = aJson.ok ? aJson.assets : [];
            this.modelNames = mJson.ok ? mJson.models : [];
        } catch {
            this.assetNames = [];
            this.modelNames = [];
        }
        this._renderRows();
    }

    _renderRows() {
        if (!this._body) return;
        this._body.innerHTML = "";

        this._renderSection("KAIJU", KAIJU_KINDS, "kaiju");
        this._renderSection("CIVS",  CIV_STYLES,  "civ");
        this._renderModels();
        this._renderSplats();   // v787 — splat cloud loader
        this._renderMods();
    }

    // v787 — Splat cloud section. Shows current loaded info + a file-picker
    // button to load a .ply/.splat. Wraps window.splatScene if present.
    // v789 — multi-layer support: lists all layers with per-layer
    // visibility toggle + remove button. Adds Restore from localStorage.
    _renderSplats() {
        if (typeof window === "undefined" || !window.splatScene) return;
        const heading = document.createElement("div");
        Object.assign(heading.style, {
            fontWeight: "bold",
            color: "#fc6",
            margin: "8px 0 4px",
            fontSize: "10px",
            letterSpacing: "1px",
        });
        const layers = window.splatScene.list?.() ?? [];
        const totalCount = layers.reduce((s, l) => s + (l.count || 0), 0);
        heading.textContent = layers.length === 0
            ? "SPLAT (none loaded)"
            : `SPLAT (${layers.length} layer${layers.length > 1 ? "s" : ""} · ${totalCount.toLocaleString()})`;
        this._body.appendChild(heading);

        // Per-layer rows
        for (const layer of layers) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                display: "flex", alignItems: "center", gap: "4px",
                fontSize: "9px", fontFamily: "monospace",
                color: layer.visible ? "#9c9" : "#666",
                padding: "1px 0",
            });
            // Visibility toggle
            const eye = document.createElement("button");
            eye.textContent = layer.visible ? "👁" : "—";
            eye.title = layer.visible ? "Hide layer" : "Show layer";
            Object.assign(eye.style, {
                background: "transparent", border: "1px solid #553",
                color: "#fc6", padding: "0 4px", cursor: "pointer",
                fontSize: "10px", width: "24px", lineHeight: "16px",
            });
            eye.addEventListener("click", () => {
                window.splatScene.setVisible(layer.id, !layer.visible);
            });
            row.appendChild(eye);

            // Name + count + format
            const label = document.createElement("span");
            label.style.flex = "1";
            label.style.overflow = "hidden";
            label.style.textOverflow = "ellipsis";
            const shortSource = (layer.sourceName || layer.id).slice(0, 16);
            label.textContent = `${layer.id} · ${layer.count.toLocaleString()} ${layer.transient ? "[file]" : ""}`;
            label.title = layer.sourceUrl || layer.sourceName || layer.id;
            row.appendChild(label);

            // Remove
            const rm = document.createElement("button");
            rm.textContent = "✕";
            rm.title = "Remove layer";
            Object.assign(rm.style, {
                background: "transparent", border: "1px solid #532",
                color: "#c66", padding: "0 4px", cursor: "pointer",
                fontSize: "10px", width: "20px", lineHeight: "16px",
            });
            rm.addEventListener("click", () => {
                if (confirm(`Remove splat layer '${layer.id}'?`)) {
                    window.splatScene.remove(layer.id);
                }
            });
            row.appendChild(rm);

            this._body.appendChild(row);
        }

        // Button row
        const btnRow = document.createElement("div");
        Object.assign(btnRow.style, { display: "flex", gap: "4px", margin: "4px 0 6px" });

        const addBtn = document.createElement("button");
        addBtn.textContent = layers.length === 0 ? "Load .ply/.splat…" : "Add layer…";
        Object.assign(addBtn.style, {
            flex: "1", background: "#f96", color: "#000", border: "none",
            padding: "4px 8px", fontSize: "9px", fontWeight: "bold",
            letterSpacing: "1px", cursor: "pointer", borderRadius: "3px",
        });
        addBtn.addEventListener("click", () => {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = ".ply,.splat";
            inp.style.display = "none";
            inp.addEventListener("change", async () => {
                const file = inp.files?.[0];
                if (!file) return;
                // Generate a unique layer id from filename
                const baseName = file.name.replace(/\.(ply|splat)$/i, "").slice(0, 24);
                let id = baseName || "splat";
                let i = 1;
                const existing = window.splatScene.list().map(l => l.id);
                while (existing.includes(id)) { id = `${baseName}_${i++}`; }
                try {
                    await window.splatScene.loadFile(file, id);
                    window.splatScene.setCurrent(id);
                } catch (e) {
                    console.warn("[assetMenu] splat load failed:", e?.message);
                    alert(`Splat load failed: ${e?.message ?? e}`);
                }
            });
            document.body.appendChild(inp);
            inp.click();
            setTimeout(() => inp.remove(), 5000);
        });
        btnRow.appendChild(addBtn);

        // Restore button — only if localStorage has something
        let canRestore = false;
        try { canRestore = !!window.localStorage?.getItem?.("splatScene.layers.v1"); } catch {}
        if (canRestore && layers.length === 0) {
            const restoreBtn = document.createElement("button");
            restoreBtn.textContent = "Restore";
            restoreBtn.title = "Restore saved layers from localStorage";
            Object.assign(restoreBtn.style, {
                background: "#352", color: "#9c9", border: "1px solid #5c5",
                padding: "4px 8px", fontSize: "9px", fontWeight: "bold",
                letterSpacing: "1px", cursor: "pointer", borderRadius: "3px",
            });
            restoreBtn.addEventListener("click", async () => {
                try { await window.splatScene.restoreState(); }
                catch (e) { console.warn("[assetMenu] splat restore failed:", e?.message); }
            });
            btnRow.appendChild(restoreBtn);
        }
        this._body.appendChild(btnRow);

        if (layers.length === 0) {
            const hint = document.createElement("div");
            Object.assign(hint.style, { fontSize: "8px", color: "#866", padding: "0 0 4px", fontStyle: "italic" });
            hint.textContent = "or drop a .ply/.splat onto the canvas";
            this._body.appendChild(hint);
        }
    }

    _renderSection(title, items, prefix) {
        const heading = document.createElement("div");
        Object.assign(heading.style, {
            fontWeight: "bold",
            color: "#fc6",
            margin: "6px 0 4px",
            fontSize: "10px",
            letterSpacing: "1px",
        });
        heading.textContent = title;
        this._body.appendChild(heading);

        for (const item of items) {
            const defaultId = `${prefix}_${item}`;
            this._body.appendChild(this._row(item, defaultId));
        }
    }

    _row(label, defaultId) {
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "3px 0",
            fontSize: "10px",
        });

        // Status indicator
        const override = getOverride(defaultId);
        const effectiveId = override || defaultId;
        const cached = this.assetLoader.cache?.get(effectiveId);
        const status = document.createElement("span");
        status.style.width = "14px";
        status.style.textAlign = "center";
        if (cached) {
            status.textContent = "✓";
            status.style.color = "#9c9";
        } else if (cached === null) {
            // negative cache — load was attempted and failed
            status.textContent = "✗";
            status.style.color = "#c66";
        } else {
            status.textContent = "·";
            status.style.color = "#666";
        }
        row.appendChild(status);

        // Label
        const lbl = document.createElement("span");
        lbl.textContent = label;
        Object.assign(lbl.style, { width: "90px", fontFamily: "monospace", color: "#fc6" });
        row.appendChild(lbl);

        // Override picker — dropdown showing all known assets + "(default)"
        const select = document.createElement("select");
        Object.assign(select.style, {
            flex: "1",
            background: "#220",
            color: "#fc6",
            border: "1px solid #553",
            padding: "1px 2px",
            fontSize: "9px",
            fontFamily: "monospace",
        });

        // Default option = use the convention
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = `${defaultId} (default)`;
        select.appendChild(defaultOpt);

        // Each loaded asset becomes an override choice
        for (const name of this.assetNames) {
            if (name === defaultId) continue;   // already represented by default
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        }

        select.value = override || "";
        select.addEventListener("change", () => {
            const v = select.value;
            setOverride(defaultId, v || null);
            // Pre-load the chosen asset so subsequent spawns find it cached
            if (v && this.assetLoader && !this.assetLoader.cache.has(v)) {
                this.assetLoader.loadAsset(v);
            }
            this._renderRows();
        });
        row.appendChild(select);

        return row;
    }

    _renderModels() {
        const heading = document.createElement("div");
        Object.assign(heading.style, {
            fontWeight: "bold",
            color: "#fc6",
            margin: "8px 0 4px",
            fontSize: "10px",
            letterSpacing: "1px",
        });
        heading.textContent = `MODELS (${this.modelNames.length})`;
        this._body.appendChild(heading);

        if (this.modelNames.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "(none yet — use Settings → Re-populate Models)";
            Object.assign(empty.style, { opacity: "0.5", fontSize: "9px", padding: "2px 0" });
            this._body.appendChild(empty);
            return;
        }
        for (const name of this.modelNames) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                fontSize: "10px",
                fontFamily: "monospace",
                color: "#9c9",
                padding: "1px 0",
            });
            row.textContent = `✓ ${name}`;
            this._body.appendChild(row);
        }
    }

    // Round 26 — list loaded mods. Each row shows status (✓/✗),
    // type, name, and any error message.
    _renderMods() {
        if (!this.modLoader) return;
        const mods = this.modLoader.snapshot();
        const heading = document.createElement("div");
        Object.assign(heading.style, {
            fontWeight: "bold",
            color: "#fc6",
            margin: "8px 0 4px",
            fontSize: "10px",
            letterSpacing: "1px",
        });
        heading.textContent = `MODS (${mods.length})`;
        this._body.appendChild(heading);

        if (mods.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "(drop a .json into mods/ to extend)";
            Object.assign(empty.style, { opacity: "0.5", fontSize: "9px", padding: "2px 0" });
            this._body.appendChild(empty);
            return;
        }
        for (const m of mods) {
            const row = document.createElement("div");
            Object.assign(row.style, {
                fontSize: "10px",
                fontFamily: "monospace",
                color: m.ok ? "#9c9" : "#c66",
                padding: "1px 0",
            });
            const icon = m.ok ? "✓" : "✗";
            const errSuffix = m.ok ? "" : ` — ${m.error}`;
            row.textContent = `${icon} [${m.type}] ${m.name}${errSuffix}`;
            row.title = m.fileName;
            this._body.appendChild(row);
        }
    }
}
