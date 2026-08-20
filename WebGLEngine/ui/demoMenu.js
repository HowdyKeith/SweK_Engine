// FILE: ui/demoMenu.js
// VERSION: v1
//
// Reads the contents of the engine's demos/ folder via the relay
// server's /demos/list endpoint, then renders a click-to-load menu
// of every .json demo file present. Click ↻ to re-scan the folder
// without reloading the page — drop a new demo in and refresh.
//
// Demo file format (minimal — see demos/README.md for full spec):
//   {
//       "name": "Mountain View",
//       "description": "Optional",
//       "camera": { "x": 0, "y": 80, "z": 100, "yaw": 0, "pitch": -0.5 }
//   }
//
// Optional fields the supplied applyDemo callback may also handle:
//   "voxels":   [{ x, y, z, v }, ...]
//   "entities": [{ assetId, x, y, z, scale, kind }, ...]
//
// All actual application logic lives in applyDemo() — this module
// only handles UI + fetch.

export class DemoMenu {
    constructor({ parent, applyDemo, generator = null, saveDemo = null, listUrl = "/demos/list",
                  alwaysOpen = false, hideTitle = false }) {
        this.applyDemo = applyDemo;
        this.generator = generator;     // optional DemoGenerator
        this.saveDemo = saveDemo;       // optional async (filename, spec) => boolean
        this.listUrl = listUrl;
        // Round 89 — options to remove the collapsible "🎬 Demos ▼" header
        // and keep the body permanently expanded. Used when the panel
        // lives in the Dock (which handles open/close already).
        this.alwaysOpen = alwaysOpen;
        this.hideTitle = hideTitle;
        this._build(parent ?? document.body);
        this._refresh();
    }

    // ---- private -----------------------------------------------------

    _build(parent) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, {
            // v1968 — fixed (was absolute) so it lives in the ROOT stacking context alongside the docked
            // gauges (also position:fixed); combined with the raised z-index below, its dropdown + Stop
            // button paint ABOVE the top-center gauges/avatar instead of being covered by them.
            position: "fixed",
            top: "12px",
            left: "12px",
            background: "rgba(0, 0, 0, 0.6)",
            border: "1px solid rgba(255, 180, 80, 0.3)",
            borderRadius: "4px",
            padding: "8px 10px",
            color: "#ddd",
            fontFamily: "monospace",
            fontSize: "11px",
            minWidth: "200px",
            maxHeight: "60vh",
            overflowY: "auto",
            pointerEvents: "auto",
            userSelect: "none",
            // v1968 — sit ABOVE the top-center docked gauges/avatar (z 9086-9087), which were overlapping the
            // DEMO pill's dropdown at the top of the screen and blocking clicks (e.g. Stop). 9100 wasn't
            // enough because the docked gauges are position:fixed and could win the paint; 9600 clears them.
            zIndex: "9600",
        });

        // Header row — title + refresh
        const headerRow = document.createElement("div");
        Object.assign(headerRow.style, {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "6px",
        });
        // Round 89 — header row optional. When `hideTitle` is set, the
        // collapsible "🎬 Demos ▼" line is skipped entirely. Refresh ↻
        // moves into the body area so it's still accessible.
        if (!this.hideTitle) {
            const title = document.createElement("div");
            // Round 57 - caret indicator so users know it's expandable
            title.innerHTML = `🎬 Demos <span id="demosCaret" style="opacity:0.6; margin-left:4px;">▼</span>`;
            Object.assign(title.style, {
                fontWeight: "bold",
                color: "#fb6",
            });
            headerRow.appendChild(title);

            const reload = document.createElement("div");
            reload.textContent = "↻";
            reload.title = "Re-scan demos/ folder";
            Object.assign(reload.style, {
                fontSize: "13px",
                cursor: "pointer",
                opacity: "0.7",
                padding: "0 4px",
            });
            reload.addEventListener("click", (ev) => {
                ev.stopPropagation();   // don't toggle expansion when clicking refresh
                this._refresh();
            });
            headerRow.appendChild(reload);

            wrap.appendChild(headerRow);
        }

        // Round 57 - body wrapper. Collapsed by default; opens on hover.
        // Wraps the generator + list so both fade in/out together.
        // Round 89 - or always-open when configured.
        const body = document.createElement("div");
        body.style.display = this.alwaysOpen ? "block" : "none";
        wrap.appendChild(body);
        this._body = body;
        this._caret = this.hideTitle ? null : headerRow.querySelector("#demosCaret");

        // Round 89 — when title is hidden, put refresh ↻ at the top of
        // the body so it remains reachable.
        if (this.hideTitle) {
            const refreshRow = document.createElement("div");
            Object.assign(refreshRow.style, {
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "4px",
            });
            const reload = document.createElement("div");
            reload.textContent = "↻ refresh demos/";
            reload.title = "Re-scan demos/ folder for JSON snapshots";
            Object.assign(reload.style, {
                fontSize: "10px",
                cursor: "pointer",
                opacity: "0.6",
                padding: "0 4px",
            });
            reload.addEventListener("click", (ev) => {
                ev.stopPropagation();
                this._refresh();
            });
            refreshRow.appendChild(reload);
            body.appendChild(refreshRow);
        }

        // Generator block (only if a generator was supplied)
        if (this.generator && this.saveDemo) {
            this._buildGeneratorBlock(body);
        }

        this._listEl = document.createElement("div");
        body.appendChild(this._listEl);

        // Hover-to-open with a small close delay so the cursor can travel
        // between header and list without the menu collapsing under it.
        let closeTimer = null;
        const open = () => {
            if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
            this._body.style.display = "block";
            if (this._caret) this._caret.textContent = "▲";
        };
        const closeSoon = () => {
            if (closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                this._body.style.display = "none";
                if (this._caret) this._caret.textContent = "▼";
                closeTimer = null;
            }, 250);
        };
        // Round 89 — only wire hover-to-open when collapse is in play.
        // alwaysOpen mode keeps body visible so no hover handlers needed.
        if (!this.alwaysOpen) {
            wrap.addEventListener("mouseenter", open);
            wrap.addEventListener("mouseleave", closeSoon);
            // Also support click-to-pin on the header (toggles persistent open)
            if (headerRow.children.length > 0) {
                headerRow.addEventListener("click", () => {
                    if (this._body.style.display === "block") {
                        this._body.style.display = "none";
                        if (this._caret) this._caret.textContent = "▼";
                    } else {
                        open();
                    }
                });
            }
        }

        parent.appendChild(wrap);
        this.root = wrap;
    }

    _buildGeneratorBlock(parent) {
        const block = document.createElement("div");
        Object.assign(block.style, {
            marginBottom: "10px",
            paddingBottom: "8px",
            borderBottom: "1px solid rgba(255, 180, 80, 0.2)",
        });

        const lbl = document.createElement("div");
        lbl.textContent = "✨ generate from prompt";
        Object.assign(lbl.style, {
            fontSize: "10px",
            opacity: "0.7",
            marginBottom: "4px",
        });
        block.appendChild(lbl);

        const ta = document.createElement("textarea");
        ta.placeholder = "e.g. 'fly low across a desert at sunset'";
        Object.assign(ta.style, {
            width: "100%",
            height: "44px",
            background: "rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(255, 180, 80, 0.3)",
            color: "#ddd",
            fontFamily: "monospace",
            fontSize: "10px",
            padding: "4px",
            boxSizing: "border-box",
            resize: "vertical",
        });
        block.appendChild(ta);

        const btnRow = document.createElement("div");
        Object.assign(btnRow.style, {
            display: "flex",
            gap: "4px",
            marginTop: "4px",
        });

        const mkBtn = (label, mode) => {
            const b = document.createElement("div");
            b.textContent = label;
            Object.assign(b.style, {
                flex: "1",
                padding: "3px 4px",
                border: "1px solid rgba(255, 180, 80, 0.45)",
                borderRadius: "2px",
                cursor: "pointer",
                textAlign: "center",
                fontSize: "10px",
                background: "rgba(255, 180, 80, 0.08)",
            });
            b.addEventListener("click", () => this._runGeneration(ta.value.trim(), mode));
            return b;
        };
        btnRow.appendChild(mkBtn("→ single",    "single"));
        btnRow.appendChild(mkBtn("→ sequence",  "sequence"));
        btnRow.appendChild(mkBtn("→ structure", "structure"));
        block.appendChild(btnRow);

        // Status line
        this._statusEl = document.createElement("div");
        Object.assign(this._statusEl.style, {
            fontSize: "9px",
            opacity: "0.6",
            marginTop: "4px",
            minHeight: "11px",
        });
        block.appendChild(this._statusEl);

        parent.appendChild(block);
    }

    async _runGeneration(prompt, mode) {
        if (!prompt) {
            this._setStatus("(prompt is empty)", "warn");
            return;
        }
        this._setStatus(`generating ${mode}…`, "info");
        try {
            let spec = null;
            if      (mode === "single")    spec = await this.generator.generateSingle(prompt);
            else if (mode === "sequence")  spec = await this.generator.generateSequence(prompt);
            else if (mode === "structure") spec = await this.generator.generateStructure(prompt);
            else {
                this._setStatus(`unknown mode: ${mode}`, "warn");
                return;
            }
            if (!spec) {
                this._setStatus("generation failed (Ollama down or invalid response — see console)", "warn");
                return;
            }
            // Synthesize a stable filename from name + timestamp
            const slug = String(spec.name || "demo")
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "")
                .slice(0, 32);
            const ts = Date.now().toString(36);
            const filename = `gen_${slug || "demo"}_${ts}.json`;
            const ok = await this.saveDemo(filename, spec);
            if (!ok) {
                this._setStatus("save failed (see console)", "warn");
                return;
            }
            this._setStatus(`✓ saved ${filename}`, "ok");
            // Refresh the list so the new demo appears
            this._refresh();
        } catch (e) {
            console.warn("[DemoMenu] generation error:", e);
            this._setStatus(`error: ${e.message}`, "warn");
        }
    }

    _setStatus(text, kind) {
        if (!this._statusEl) return;
        this._statusEl.textContent = text;
        this._statusEl.style.color =
            kind === "warn" ? "#f88" :
            kind === "ok"   ? "#9f8" :
                              "#fb6";
    }

    async _refresh() {
        this._listEl.innerHTML = "<i style='opacity:0.5'>loading…</i>";
        try {
            const r = await fetch(this.listUrl, { cache: "no-cache" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const list = await r.json();
            this._renderList(list);
        } catch (e) {
            this._renderError(e.message);
        }
    }

    _renderList(list) {
        this._listEl.innerHTML = "";
        if (!Array.isArray(list) || list.length === 0) {
            const empty = document.createElement("div");
            empty.textContent = "(no demos in demos/)";
            Object.assign(empty.style, {
                opacity: "0.5",
                fontSize: "10px",
                fontStyle: "italic",
            });
            this._listEl.appendChild(empty);
            return;
        }
        for (const item of list) {
            const btn = document.createElement("div");
            btn.textContent = item.name || item.path;
            if (item.description) btn.title = item.description;
            Object.assign(btn.style, {
                padding: "4px 8px",
                border: "1px solid rgba(255, 180, 80, 0.3)",
                borderRadius: "2px",
                marginBottom: "3px",
                cursor: "pointer",
                background: "rgba(255, 180, 80, 0.04)",
            });
            btn.addEventListener("mouseenter", () => {
                btn.style.background = "rgba(255, 180, 80, 0.18)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.background = "rgba(255, 180, 80, 0.04)";
            });
            btn.addEventListener("click", () => this._loadAndApply(item));
            this._listEl.appendChild(btn);
        }
    }

    _renderError(msg) {
        this._listEl.innerHTML = "";
        const err = document.createElement("div");
        err.textContent = `error: ${msg}`;
        Object.assign(err.style, {
            color: "#f88",
            fontSize: "10px",
            opacity: "0.8",
        });
        this._listEl.appendChild(err);
        const hint = document.createElement("div");
        hint.textContent = "(is the AI bridge server running?)";
        Object.assign(hint.style, {
            fontSize: "9px",
            opacity: "0.5",
            marginTop: "4px",
        });
        this._listEl.appendChild(hint);
    }

    async _loadAndApply(item) {
        try {
            const r = await fetch(item.path, { cache: "no-cache" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const spec = await r.json();
            this.applyDemo(spec);
        } catch (e) {
            console.warn(`[DemoMenu] failed to load ${item.path}:`, e);
        }
    }
}
