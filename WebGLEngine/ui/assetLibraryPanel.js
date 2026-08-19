// FILE: ui/assetLibraryPanel.js
// VERSION: v1 (v799 — Universal Asset Library)
//
// Floating panel that lists assets stored in the bridge library and
// gives the user CRUD: pull asset detail, rename, set forward
// orientation, remove. Two view modes:
//   - Grid: thumbnail + label per asset, all visible at once
//   - Tinder: one asset at a time, fast triage UX
//
// Toggleable from window.assetLibraryPanel.show() / hide() / toggle().
//
// Source tabs filter the list (All / Gemini / Kaggle / Local / Captured).

// v1521 — canonical role tags. Roles are UNIFIED onto the library's tag system:
// an asset "appears in" a role iff it carries the role's tag. The Roles matrix
// (below) writes these; engine consumers read them (wired incrementally).
export const ROLE_TAGS = [
    { tag: "favorite",  label: "Avatar",     icon: "\u2605" },   // primary / avatar-cycle favorite (already pins in the library)
    { tag: "head",      label: "Head/Torso", icon: "\u25C9" },   // demo-chrome head presentation tier (THeads)
    { tag: "duo",       label: "Duo",        icon: "\u21C4" },   // second / partner avatar (walk-in transition)
    { tag: "plane",     label: "Plane",      icon: "\u2708" },   // airplane picker (surfaces tagged first)
    { tag: "accessory", label: "Worn/Held",  icon: "\uD83C\uDFA9" },  // v1529 worn/held-GLB: tag a hat/racket/ball, attach it to a head/hand/foot bone (Avatar Settings -> Accessories)
    // NOTE: costume stays OUT -- costumes are multiplicative color-tint palettes (avatarCostumes.js),
    // not GLB assets, so a library GLB cannot be a tint. accessory IS now a real role (worn/held GLB
    // attached to a bone), distinct from the older procedural hat/cape geometry.
];

export class AssetLibraryPanel {
    constructor(opts = {}) {
        this.bridgeUrl = opts.bridgeUrl || "http://localhost:8765";
        this._filter = { source: null, type: null, tag: null };
        this._searchTerm = "";        // v800 — name substring filter
        this._assets = [];
        this._mode = "grid";          // "grid" | "tinder"
        this._tinderIdx = 0;
        this._selectMode = false;     // v802 — multi-select for batch ops
        this._selected = new Set();   // v802 — selected asset ids
        this._build();
        this.refresh();
        this._openEventStream();      // v801 — real-time updates from bridge
    }

    /**
     * v801 — open Server-Sent Events stream so the panel auto-refreshes
     * when ANY client (this one, phone, PC) mutates the library. Reconnect
     * on close. Debounced refresh so batch operations don't thrash.
     */
    _openEventStream() {
        if (typeof EventSource === "undefined") return;
        const url = `${this.bridgeUrl}/assets/events`;
        try {
            this._es = new EventSource(url);
        } catch (e) {
            console.warn("[AssetLibraryPanel] EventSource open failed:", e?.message);
            return;
        }
        let refreshTimer = null;
        const scheduleRefresh = () => {
            if (refreshTimer) clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => { refreshTimer = null; if (this.root?.style.display !== "none") this.refresh(); }, 200);
        };
        this._es.onmessage = (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.event === "hello") return;       // ignore greet
                // v814 — per-asset progress during regen: show a strip, don't refresh
                if (data.event === "geom-regen-progress") {
                    this._showRegenProgress(data);
                    return;
                }
                // v813 — full regen invalidates cached thumbs (server cleared
                // its thumbBase64 for affected assets; client must drop its
                // local cache too).
                if (data.event === "geom-regen") {
                    if (this._thumbCache) this._thumbCache.clear();
                    if (this._thumbFingerprints) this._thumbFingerprints.clear();
                    this._hideRegenProgress();
                }
                // v816 — if stats dashboard is open, repaint it with fresh data
                if (typeof this._statsRepaint === "function") {
                    this._statsRepaint();
                }
                scheduleRefresh();
            } catch {}
        };
        this._esFails = 0;
        this._es.onerror = () => {
            // v968 — the asset server (:8765) is often not running; EventSource
            // auto-reconnects forever and floods the console. Log once, then
            // after a few failures stop the stream entirely (re-open on demand
            // via refresh()/show()) instead of spamming on every retry.
            this._esFails++;
            if (this._esFails === 1) {
                console.warn("[AssetLibraryPanel] asset event stream unavailable (" + this.bridgeUrl + "/assets/events) — is the asset server running? Will stop retrying after a few attempts.");
            }
            try { if (window.serviceStatus) window.serviceStatus.set("assetServer", { label: "Asset server", ok: false, reason: "offline (" + this.bridgeUrl + ")", hint: "start the asset server" }); } catch (e) {}
            if (this._esFails >= 4) {
                try { this._es?.close(); } catch {}
                this._es = null;
                console.warn("[AssetLibraryPanel] gave up on the event stream (silenced). Call assetLibraryPanel.show()/refresh() to retry.");
            }
        };
    }

    dispose() {
        try { this._es?.close(); } catch {}
        this._es = null;
        try { this.root?.remove(); } catch {}
    }

    /**
     * v814 — show a floating progress strip during a regen pass. Updates
     * in place as geom-regen-progress events stream in.
     */
    _showRegenProgress(data) {
        if (!this._regenStrip) {
            const strip = document.createElement("div");
            Object.assign(strip.style, {
                position: "absolute", bottom: "32px", left: "12px", right: "12px",
                background: "rgba(20,30,45,0.97)",
                border: "1px solid rgba(120,180,255,0.5)",
                borderRadius: "6px", padding: "8px 10px",
                fontSize: "11px", color: "#cde",
                zIndex: "10", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            });
            const label = document.createElement("div");
            label.id = "_regenLabel";
            Object.assign(label.style, { marginBottom: "5px" });
            const barOuter = document.createElement("div");
            Object.assign(barOuter.style, {
                width: "100%", height: "6px", background: "rgba(40,55,75,0.7)",
                borderRadius: "3px", overflow: "hidden",
            });
            const barInner = document.createElement("div");
            barInner.id = "_regenBar";
            Object.assign(barInner.style, {
                height: "100%", background: "linear-gradient(90deg, #4af, #7af)",
                width: "0%", transition: "width 0.15s",
            });
            barOuter.appendChild(barInner);
            strip.appendChild(label);
            strip.appendChild(barOuter);
            this.root.appendChild(strip);
            this._regenStrip = strip;
            this._regenLabel = label;
            this._regenBar = barInner;
        }
        const pct = data.total > 0 ? (data.current / data.total) * 100 : 0;
        this._regenLabel.textContent = `Regenerating ${data.current}/${data.total} — ${data.name || data.id || ""}`;
        this._regenBar.style.width = pct.toFixed(1) + "%";
    }

    _hideRegenProgress() {
        if (this._regenStrip) {
            try { this._regenStrip.remove(); } catch {}
            this._regenStrip = null;
            this._regenLabel = null;
            this._regenBar = null;
        }
    }

    _build() {
        const root = document.createElement("div");
        root.id = "asset-library-panel";
        Object.assign(root.style, {
            position: "fixed",
            top: "70px",
            right: "70px",
            width: "440px",
            maxHeight: "calc(100vh - 140px)",
            background: "rgba(15, 20, 28, 0.97)",
            border: "1px solid rgba(90, 200, 255, 0.4)",
            borderRadius: "8px",
            zIndex: "1500",
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontSize: "13px",
            color: "#dde",
            display: "none",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
        });
        // Title bar
        const title = document.createElement("div");
        Object.assign(title.style, {
            padding: "10px 12px",
            background: "linear-gradient(90deg, rgba(60,140,200,0.25), rgba(60,140,200,0.05))",
            borderBottom: "1px solid rgba(90,200,255,0.3)",
            fontWeight: "600",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
        });
        const titleText = document.createElement("span");
        titleText.textContent = "🗂  Asset Library";
        title.appendChild(titleText);
        const closeBtn = document.createElement("span");
        closeBtn.textContent = "✕";
        Object.assign(closeBtn.style, { cursor: "pointer", padding: "2px 8px", color: "#9aa" });
        closeBtn.addEventListener("click", () => this.hide());
        title.appendChild(closeBtn);
        root.appendChild(title);

        // Mode toggle + refresh row
        const modeRow = document.createElement("div");
        Object.assign(modeRow.style, {
            padding: "8px 12px",
            display: "flex",
            gap: "8px",
            alignItems: "center",
            borderBottom: "1px solid rgba(90,200,255,0.15)",
            fontSize: "12px",
        });
        const _btn = (label, onClick) => {
            const b = document.createElement("button");
            b.textContent = label;
            Object.assign(b.style, {
                background: "#234", color: "#cde", border: "1px solid #456",
                borderRadius: "4px", padding: "4px 10px", cursor: "pointer", fontSize: "11px",
            });
            b.addEventListener("click", onClick);
            return b;
        };
        this._gridBtn = _btn("Grid", () => this._setMode("grid"));
        this._listBtn = _btn("List", () => this._setMode("list"));     // v806
        this._tinderBtn = _btn("Tinder", () => this._setMode("tinder"));
        this._rolesBtn = _btn("Roles", () => this._setMode("roles"));   // v1521 — asset x role-tag checkbox matrix
        const refreshBtn = _btn("↻ Refresh", () => this.refresh());
        // v802 — select mode toggle + scan-kaggle action
        this._selectBtn = _btn("☐ Select", () => this._toggleSelectMode());
        const scanKaggleBtn = _btn("Scan Kaggle", async () => {
            scanKaggleBtn.disabled = true;
            const orig = scanKaggleBtn.textContent;
            scanKaggleBtn.textContent = "...";
            try {
                const r = await window.assetLibrary?.scanKaggle?.();
                if (r?.error) alert("Scan failed: " + r.error);
                else alert(`Scanned ${r.scanned} files. Ingested ${r.ingested} new, skipped ${r.skipped} existing.`);
                await this.refresh();
            } catch (e) { alert(e?.message); }
            scanKaggleBtn.disabled = false;
            scanKaggleBtn.textContent = orig;
        });
        // v807 — Import from URL. Prompts for URL, calls importFromUrl.
        const importUrlBtn = _btn("+ URL", async () => {
            const url = prompt("Paste a URL to import as a library asset.\n(.glb / .gltf / .obj → mesh, .ply → splat, .png/.jpg → image, .json with voxels → voxel)");
            if (!url || !url.trim()) return;
            importUrlBtn.disabled = true;
            const orig = importUrlBtn.textContent;
            importUrlBtn.textContent = "...";
            try {
                const r = await window.assetLibrary.importFromUrl(url.trim());
                if (r?.error) alert("Import failed: " + r.error);
                else { alert(`✓ Imported as ${r.meta?.name} (${r.meta?.type}, ${(r.meta?.bytes / 1024).toFixed(1)} KB)`); await this.refresh(); }
            } catch (e) { alert("Import failed: " + e?.message); }
            importUrlBtn.disabled = false;
            importUrlBtn.textContent = orig;
        });
        // v813 — Regenerate geomSample for mesh/splat assets (one-time migration
        // after sampler improvements). Clears cached thumbs as a side effect.
        const regenBtn = _btn("Regen Thumbs", async () => {
            if (!confirm("Re-extract geometry samples + clear cached thumbnails for all mesh/splat assets?\n\nThis re-reads every mesh/splat data file from disk and runs the current sampler. Existing voxel/image thumbs are unaffected.")) return;
            regenBtn.disabled = true;
            const orig = regenBtn.textContent;
            regenBtn.textContent = "...";
            try {
                const r = await window.assetLibrary.regenerateGeom();
                if (r?.error) alert("Regen failed: " + r.error);
                else {
                    let msg = `Processed ${r.processed} assets.\n✓ Updated ${r.updated}\n⊘ Skipped ${r.skipped}\n✗ Failed ${r.failed}`;
                    if (r.errors?.length) msg += "\n\nErrors:\n" + r.errors.join("\n");
                    alert(msg);
                }
            } catch (e) { alert("Regen failed: " + e?.message); }
            regenBtn.disabled = false;
            regenBtn.textContent = orig;
        });
        // v814 — Statistics dashboard. Modal with breakdowns + top tags + largest assets.
        const statsBtn = _btn("📊 Stats", async () => {
            try {
                const s = await window.assetLibrary.status();
                if (s?.error) { alert("Stats failed: " + s.error); return; }
                this._showStatsDialog(s);
            } catch (e) { alert("Stats failed: " + e?.message); }
        });
        modeRow.appendChild(this._gridBtn);
        modeRow.appendChild(this._listBtn);
        modeRow.appendChild(this._tinderBtn);
        modeRow.appendChild(this._rolesBtn);   // v1521
        modeRow.appendChild(refreshBtn);
        modeRow.appendChild(this._selectBtn);
        modeRow.appendChild(scanKaggleBtn);
        modeRow.appendChild(importUrlBtn);
        modeRow.appendChild(regenBtn);
        modeRow.appendChild(statsBtn);
        this._statusSpan = document.createElement("span");
        Object.assign(this._statusSpan.style, { marginLeft: "auto", fontSize: "11px", color: "#9aa" });
        modeRow.appendChild(this._statusSpan);
        root.appendChild(modeRow);

        // v1457 — Import asset kits + editable folder rules (moved here from Settings).
        const ingestWrap = document.createElement("div");
        ingestWrap.style.cssText = "border-bottom:1px solid rgba(90,200,255,0.15);";
        const ingHdr = document.createElement("div");
        ingHdr.style.cssText = "padding:7px 12px;font-size:12px;color:#9fd;cursor:pointer;display:flex;justify-content:space-between;user-select:none;";
        const ingChev = document.createElement("span"); ingChev.textContent = "\u25be";
        const ingTitle = document.createElement("span"); ingTitle.textContent = "\uD83D\uDCE5 Import kits & folder rules";
        ingHdr.append(ingTitle, ingChev);
        const ingBody = document.createElement("div");
        ingBody.style.cssText = "padding:0 12px 10px;display:none;flex-direction:column;gap:8px;";
        const hint = document.createElement("div"); hint.style.cssText = "font-size:11px;color:#8b97a8;line-height:1.45;";
        hint.innerHTML = "Asset packs you download as <b>.zip</b> (KayKit / Kenney dungeon, city\u2026) aren't picked up by the Downloads watcher \u2014 that only sorts loose, unzipped models. <b>Import kits</b> extracts each zip and sorts its models into the right <code>GPU_Assets</code> folder by name. Originals stay in Downloads \u2014 safe to delete once the report shows they imported. A zip imported before (even on a prior install) is skipped \u2014 use <b>Re-import all</b> to force it into the current assets folder.";
        const mkBtn = (txt, primary) => { const b = document.createElement("button"); b.textContent = txt; b.style.cssText = "padding:6px 12px;border-radius:6px;cursor:pointer;font-size:11px;" + (primary ? "border:1px solid #3a5d6d;background:#2a3d4d;color:#cfe;" : "border:1px solid #2a3340;background:#16202c;color:#cde;"); return b; };
        const btnRow = document.createElement("div"); btnRow.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;";
        const bImport = mkBtn("\uD83D\uDCE5 Import kits (.zip)", true), bLoose = mkBtn("Sort loose models"), bForce = mkBtn("Re-import all");
        btnRow.append(bImport, bLoose, bForce);
        const out = document.createElement("div"); out.style.cssText = "font-size:11px;color:#9fb3cc;white-space:pre-wrap;max-height:160px;overflow:auto;";
        const self = this;
        const runImport = async (force) => { for (const b of [bImport, bLoose, bForce]) b.disabled = true; out.style.color = "#9fb3cc"; out.textContent = "Extracting kits\u2026"; try { const r = await fetch("/assets/ingest/import-zips" + (force ? "?force=1" : ""), { method: "POST" }).then(x => x.json()); if (!r || (!r.ok && !r.zips)) { out.style.color = "#f88"; out.textContent = "Error: " + ((r && r.error) || "failed"); } else { const L = []; for (const z of (r.zips || [])) L.push("\u2713 " + z.zip + "  \u2192  " + (z.models || 0) + " model(s) \u2192 " + (z.target || "GPU_Assets") + "/"); if (r.skipped) L.push("\u00b7 " + r.skipped + " already imported (skipped" + (force ? "" : "; Re-import all to force") + ")"); for (const e of (r.errors || [])) L.push("\u2717 " + e); if (!(r.zips || []).length && !r.skipped) L.push("No .zip kits found in Downloads."); else if ((r.zips || []).length) L.push("", "Originals safe to delete now."); out.style.color = (r.errors && r.errors.length) ? "#ffcf8f" : "#9fe0b3"; out.textContent = L.join("\n"); try { self.refresh && self.refresh(); } catch {} } } catch (e) { out.style.color = "#f88"; out.textContent = "Error: " + e.message; } for (const b of [bImport, bLoose, bForce]) b.disabled = false; };
        bImport.onclick = () => runImport(false); bForce.onclick = () => runImport(true);
        bLoose.onclick = async () => { bLoose.disabled = true; out.style.color = "#9fb3cc"; out.textContent = "Sorting loose models\u2026"; try { const r = await fetch("/assets/ingest/import", { method: "POST" }).then(x => x.json()); const m = (r && r.moved ? r.moved.length : 0) + (r && r.copied ? r.copied.length : 0); out.style.color = "#9fe0b3"; out.textContent = "\u2713 imported " + m + " loose model(s)" + (r && r.unknown && r.unknown.length ? " \u00b7 " + r.unknown.length + " unknown left in root" : ""); try { self.refresh && self.refresh(); } catch {} } catch (e) { out.style.color = "#f88"; out.textContent = "Error: " + e.message; } bLoose.disabled = false; };
        const rulesHdr = document.createElement("div"); rulesHdr.style.cssText = "font-size:11px;color:#9bb0c8;margin-top:4px;"; rulesHdr.textContent = "Folder rules \u2014 a model/kit whose name matches goes to that folder (first match wins). \u201c*\u201d = any text.";
        const rulesBox = document.createElement("div"); rulesBox.style.cssText = "display:flex;flex-direction:column;gap:3px;max-height:160px;overflow:auto;";
        let _rules = [];
        const fInput = (w) => { const i = document.createElement("input"); i.style.cssText = "padding:3px 6px;background:#0c0f14;color:#e8eef8;border:1px solid #2a3340;border-radius:4px;font:11px ui-monospace,monospace;" + (w ? "width:" + w + ";" : "flex:1;"); return i; };
        const renderRules = () => { rulesBox.innerHTML = ""; _rules.forEach((rule, i) => { const row = document.createElement("div"); row.style.cssText = "display:flex;gap:4px;align-items:center;"; const m = fInput(); m.value = rule.match; m.onchange = () => { _rules[i].match = m.value; }; const ar = document.createElement("span"); ar.textContent = "\u2192"; ar.style.color = "#677"; const f = fInput("90px"); f.value = rule.folder; f.onchange = () => { _rules[i].folder = f.value; }; const del = document.createElement("button"); del.textContent = "\u00d7"; del.style.cssText = "padding:2px 7px;background:#3a2330;color:#fbb;border:1px solid #5a3340;border-radius:4px;cursor:pointer;"; del.onclick = () => { _rules.splice(i, 1); renderRules(); }; row.append(m, ar, f, del); rulesBox.appendChild(row); }); };
        const loadRules = async () => { try { const r = await fetch("/assets/ingest/config").then(x => x.json()); _rules = (r && r.config && Array.isArray(r.config.templates)) ? r.config.templates.map(t => ({ match: t.match, folder: t.folder })) : []; renderRules(); } catch {} };
        const addRow = document.createElement("div"); addRow.style.cssText = "display:flex;gap:4px;align-items:center;";
        const nm = fInput(); nm.placeholder = "*dungeon*"; const sp = document.createElement("span"); sp.textContent = "\u2192"; sp.style.color = "#677"; const nf = fInput("90px"); nf.placeholder = "Dungeon";
        const add = mkBtn("+ Add"); add.onclick = () => { const mm = nm.value.trim(), ff = nf.value.trim(); if (!mm || !ff) return; _rules.unshift({ match: mm, folder: ff }); nm.value = ""; nf.value = ""; renderRules(); };
        addRow.append(nm, sp, nf, add);
        const saveRow = document.createElement("div"); saveRow.style.cssText = "display:flex;gap:6px;align-items:center;";
        const save = mkBtn("\uD83D\uDCBE Save rules", true); const rmsg = document.createElement("span"); rmsg.style.cssText = "font-size:11px;color:#8b97a8;";
        save.onclick = async () => { try { await fetch("/assets/ingest/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templates: _rules }) }); rmsg.style.color = "#9fe0b3"; rmsg.textContent = "\u2713 saved \u2014 applies to the next import"; } catch (e) { rmsg.style.color = "#f88"; rmsg.textContent = "error"; } };
        saveRow.append(save, rmsg);
        ingBody.append(hint, btnRow, out, rulesHdr, rulesBox, addRow, saveRow);
        ingHdr.onclick = () => { const open = ingBody.style.display === "none"; ingBody.style.display = open ? "flex" : "none"; ingChev.textContent = open ? "\u25b4" : "\u25be"; if (open && !_rules.length) loadRules(); };
        ingestWrap.append(ingHdr, ingBody);
        root.appendChild(ingestWrap);

        // Source filter tabs
        const tabRow = document.createElement("div");
        Object.assign(tabRow.style, {
            display: "flex",
            padding: "6px 12px 8px",
            gap: "4px",
            borderBottom: "1px solid rgba(90,200,255,0.15)",
            flexWrap: "wrap",
        });
        const sources = [
            { label: "All",      val: null },
            { label: "Gemini",   val: "gemini" },
            { label: "Kaggle",   val: "kaggle" },
            { label: "Local",    val: "local" },
            { label: "Captured", val: "captured" },
        ];
        this._tabBtns = {};
        for (const s of sources) {
            const tb = document.createElement("button");
            tb.textContent = s.label;
            Object.assign(tb.style, {
                background: "transparent", color: "#9ab",
                border: "1px solid rgba(90,200,255,0.2)",
                borderRadius: "12px", padding: "3px 10px",
                cursor: "pointer", fontSize: "11px",
            });
            tb.addEventListener("click", () => {
                this._filter.source = s.val;
                this._highlightTab(s.val);
                this.refresh();
            });
            tabRow.appendChild(tb);
            this._tabBtns[String(s.val)] = tb;
        }
        root.appendChild(tabRow);
        this._highlightTab(null);

        // v800 — name search input
        const searchRow = document.createElement("div");
        Object.assign(searchRow.style, {
            padding: "6px 12px 8px",
            borderBottom: "1px solid rgba(90,200,255,0.15)",
        });
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.placeholder = "🔍 Search name, notes, or tags...";
        Object.assign(searchInput.style, {
            width: "100%", padding: "5px 10px",
            background: "#1a2530", color: "#cde",
            border: "1px solid rgba(90,200,255,0.25)",
            borderRadius: "4px", fontSize: "12px",
            fontFamily: "inherit", boxSizing: "border-box",
        });
        searchInput.addEventListener("input", (e) => {
            this._searchTerm = e.target.value.toLowerCase();
            this._render();    // local filter — no refetch
        });
        searchRow.appendChild(searchInput);

        // v803 — tag filter chips. Populated from refresh() with the union
        // of tags across currently-loaded assets. Click a chip to filter.
        this._tagChipRow = document.createElement("div");
        Object.assign(this._tagChipRow.style, {
            display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px",
            maxHeight: "60px", overflowY: "auto",
        });
        searchRow.appendChild(this._tagChipRow);

        root.appendChild(searchRow);
        this._searchInput = searchInput;

        // Body — switches between grid and tinder views
        const body = document.createElement("div");
        Object.assign(body.style, {
            flex: "1", overflowY: "auto", padding: "10px 12px",
            minHeight: "200px",
        });
        this._body = body;
        root.appendChild(body);

        // v800 — drag-drop file ingest. Visual feedback via dashed border
        // on drag-over. Accepts JSON (voxel), PLY (splat), OBJ (mesh),
        // PNG (image), TXT (other). For JSON voxel data, auto-detects
        // orientation before storage.
        let dragDepth = 0;
        const onDragEnter = (e) => {
            e.preventDefault();
            dragDepth++;
            body.style.outline = "2px dashed rgba(120,220,255,0.8)";
            body.style.outlineOffset = "-6px";
            body.style.background = "rgba(60,140,200,0.08)";
        };
        const onDragLeave = () => {
            dragDepth--;
            if (dragDepth <= 0) {
                dragDepth = 0;
                body.style.outline = ""; body.style.background = "";
            }
        };
        const onDragOver = (e) => { e.preventDefault(); };
        const onDrop = async (e) => {
            e.preventDefault();
            dragDepth = 0;
            body.style.outline = ""; body.style.background = "";
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length === 0) return;
            for (const f of files) {
                try { await this._ingestFile(f); } catch (err) { console.warn("[AssetLibrary] ingest failed:", f.name, err?.message); }
            }
            await this.refresh();
        };
        body.addEventListener("dragenter", onDragEnter);
        body.addEventListener("dragleave", onDragLeave);
        body.addEventListener("dragover", onDragOver);
        body.addEventListener("drop", onDrop);

        // Footer — quick add-from-clipboard or refresh
        const footer = document.createElement("div");
        Object.assign(footer.style, {
            padding: "8px 12px",
            borderTop: "1px solid rgba(90,200,255,0.15)",
            fontSize: "11px",
            color: "#9aa",
            background: "rgba(0,0,0,0.2)",
        });
        footer.textContent = "All clients (phone, PC, Shield) sharing this bridge see the same library. Drag files (.json .ply .obj .png) onto this panel to ingest.";
        root.appendChild(footer);

        document.body.appendChild(root);
        this.root = root;
        // v806 — paint the initial mode-button active state (Grid is default)
        this._setMode("grid");
    }

    _highlightTab(val) {
        const key = String(val);
        for (const [k, btn] of Object.entries(this._tabBtns)) {
            if (k === key) {
                btn.style.background = "rgba(90,200,255,0.25)";
                btn.style.color = "#cdf";
                btn.style.borderColor = "rgba(90,200,255,0.5)";
            } else {
                btn.style.background = "transparent";
                btn.style.color = "#9ab";
                btn.style.borderColor = "rgba(90,200,255,0.2)";
            }
        }
    }

    _setMode(mode) {
        this._mode = mode;
        const all = [
            ["grid",   this._gridBtn],
            ["list",   this._listBtn],
            ["tinder", this._tinderBtn],
            ["roles",  this._rolesBtn],
        ];
        for (const [m, btn] of all) {
            if (!btn) continue;
            const active = (m === mode);
            btn.style.background   = active ? "rgba(90,200,255,0.25)" : "#234";
            btn.style.borderColor  = active ? "rgba(90,200,255,0.5)"  : "#456";
        }
        this._render();
    }

    /**
     * v802 — multi-select mode. When ON: cards in grid show checkboxes,
     * a floating action bar appears for bulk delete / orient / tag.
     */
    _toggleSelectMode() {
        this._selectMode = !this._selectMode;
        this._selectBtn.textContent = this._selectMode ? "☑ Selecting" : "☐ Select";
        if (this._selectMode) {
            this._selectBtn.style.background = "rgba(90,200,255,0.25)";
            this._selectBtn.style.borderColor = "rgba(90,200,255,0.5)";
        } else {
            this._selectBtn.style.background = "#234";
            this._selectBtn.style.borderColor = "#456";
            this._selected.clear();
        }
        this._render();
        this._refreshBatchBar();
    }

    _refreshBatchBar() {
        if (this._batchBar) {
            try { this._batchBar.remove(); } catch {}
            this._batchBar = null;
        }
        if (!this._selectMode || this._selected.size === 0) return;
        const bar = document.createElement("div");
        Object.assign(bar.style, {
            position: "absolute", bottom: "32px", left: "12px", right: "12px",
            background: "rgba(20,30,45,0.97)",
            border: "1px solid rgba(90,200,255,0.5)",
            borderRadius: "6px", padding: "8px",
            display: "flex", gap: "6px", alignItems: "center",
            zIndex: "10", boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        });
        const count = document.createElement("span");
        count.textContent = `${this._selected.size} selected`;
        Object.assign(count.style, { fontSize: "12px", color: "#cde", flex: "1" });
        bar.appendChild(count);
        const _bact = (label, color, onClick) => {
            const b = document.createElement("button");
            b.textContent = label;
            Object.assign(b.style, {
                background: color, color: "#fff", border: "none",
                borderRadius: "4px", padding: "6px 12px",
                cursor: "pointer", fontSize: "11px", fontWeight: "600",
            });
            b.addEventListener("click", onClick);
            return b;
        };
        const deleteBtn = _bact(`Delete (${this._selected.size})`, "#a44", async () => {
            if (!confirm(`Delete ${this._selected.size} assets? This cannot be undone.`)) return;
            const ids = [...this._selected];
            for (const id of ids) {
                try { await window.assetLibrary.remove(id); } catch {}
            }
            this._selected.clear();
            await this.refresh();
            this._refreshBatchBar();
        });
        const orientBtn = _bact(`Auto-orient (${this._selected.size})`, "#465", async () => {
            const { autoDetectOrientation } = await import("../data/assetOrientation.js");
            const ids = [...this._selected];
            let done = 0;
            for (const id of ids) {
                try {
                    const resp = await window.assetLibrary.get(id);
                    if (resp?.data?.voxels) {
                        const o = autoDetectOrientation(resp.data.voxels);
                        if (o) {
                            await window.assetLibrary.orient(id, { forward: o.forward, up: o.up });
                            done++;
                        }
                    }
                } catch (e) { console.warn("[batch orient] " + id + ":", e?.message); }
            }
            alert(`Auto-oriented ${done} of ${ids.length} (skipped non-voxel assets)`);
            await this.refresh();
        });
        // v804 — Tag batch op. Prompts for a tag name, applies to all selected.
        const tagBtn = _bact(`Tag (${this._selected.size})`, "#546", async () => {
            const tagName = prompt(`Add a tag to ${this._selected.size} selected assets.\n(Common tags: "favorite", "needs-review", "wip", "kaiju", "ground", "creature")`);
            if (!tagName || !tagName.trim()) return;
            const cleaned = tagName.trim();
            const ids = [...this._selected];
            let done = 0;
            for (const id of ids) {
                try {
                    const r = await window.assetLibrary.tag(id, cleaned, "add");
                    if (r?.ok) done++;
                } catch (e) { console.warn("[batch tag] " + id + ":", e?.message); }
            }
            alert(`Tagged ${done} of ${ids.length} with "${cleaned}"`);
            await this.refresh();
        });
        // v810 — Export batch op. Bridge builds ZIP, browser downloads.
        const exportBtn = _bact(`💾 Export (${this._selected.size})`, "#546", async () => {
            const ids = [...this._selected];
            exportBtn.disabled = true;
            const orig = exportBtn.textContent;
            exportBtn.textContent = "Packaging...";
            try {
                const r = await window.assetLibrary.exportZip(ids);
                if (r?.error) { alert("Export failed: " + r.error); }
                else if (r?.blob) {
                    const url = URL.createObjectURL(r.blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `asset-library-export-${Date.now()}.zip`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(() => URL.revokeObjectURL(url), 1500);
                    exportBtn.textContent = `✓ Exported ${r.count}`;
                    setTimeout(() => { exportBtn.textContent = orig; exportBtn.disabled = false; }, 1500);
                    return;
                }
            } catch (e) { alert("Export failed: " + e?.message); }
            exportBtn.disabled = false;
            exportBtn.textContent = orig;
        });
        const clearBtn = _bact("Clear selection", "#345", () => {
            this._selected.clear();
            this._render();
            this._refreshBatchBar();
        });
        bar.appendChild(deleteBtn);
        bar.appendChild(orientBtn);
        bar.appendChild(tagBtn);
        bar.appendChild(exportBtn);
        bar.appendChild(clearBtn);
        this.root.appendChild(bar);
        this._batchBar = bar;
    }

    async refresh() {
        try {
            const r = await window.assetLibrary?.list?.(this._filter);
            if (r?.error) {
                this._statusSpan.textContent = "✗ " + r.error;
                this._statusSpan.style.color = "#e88";
                this._assets = [];
            } else {
                // v801 — invalidate thumbnail cache entries whose orientation
                // changed since we last rendered. Match on id + orientation
                // fingerprint.
                const incoming = r?.assets || [];
                if (this._thumbCache && this._thumbFingerprints) {
                    for (const a of incoming) {
                        const fp = a.orientation ? a.orientation.forward + "/" + (a.orientation.up || "+y") : "";
                        if (this._thumbFingerprints.get(a.id) !== fp) {
                            this._thumbCache.delete(a.id);
                            this._thumbFingerprints.set(a.id, fp);
                        }
                    }
                    // Drop cache entries for removed assets
                    const liveIds = new Set(incoming.map(a => a.id));
                    for (const id of [...this._thumbCache.keys()]) {
                        if (!liveIds.has(id)) {
                            this._thumbCache.delete(id);
                            this._thumbFingerprints.delete(id);
                        }
                    }
                } else {
                    this._thumbFingerprints = new Map(incoming.map(a => [a.id,
                        a.orientation ? a.orientation.forward + "/" + (a.orientation.up || "+y") : ""]));
                }
                this._assets = incoming;
                this._statusSpan.textContent = `${this._assets.length} asset${this._assets.length !== 1 ? "s" : ""}`;
                this._statusSpan.style.color = "#9aa";
            }
        } catch (e) {
            this._statusSpan.textContent = "✗ bridge unreachable";
            this._statusSpan.style.color = "#e88";
            this._assets = [];
        }
        this._tinderIdx = Math.min(this._tinderIdx, Math.max(0, this._assets.length - 1));
        this._renderTagChips();    // v803 — refresh chip row from current asset tags
        this._render();
    }

    /**
     * v803 — recompute tag chip row. Shows top N tags from the currently-
     * loaded assets, click to toggle filter.
     */
    _renderTagChips() {
        if (!this._tagChipRow) return;
        this._tagChipRow.innerHTML = "";
        // Count tag occurrences across all assets (use the full set, not the
        // filtered view, so the chips don't disappear when you select one)
        const tagCounts = new Map();
        for (const a of this._assets) {
            if (Array.isArray(a.tags)) {
                for (const t of a.tags) {
                    if (!t) continue;
                    tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
                }
            }
        }
        // Take top 15 tags by frequency
        const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
        if (sorted.length === 0) return;
        for (const [tag, count] of sorted) {
            const chip = document.createElement("span");
            chip.textContent = `${tag} ${count}`;
            const active = this._filter.tag === tag;
            Object.assign(chip.style, {
                background: active ? "rgba(90,200,255,0.35)" : "rgba(40,55,75,0.6)",
                color: active ? "#cdf" : "#9ab",
                border: "1px solid " + (active ? "rgba(120,220,255,0.6)" : "rgba(90,200,255,0.2)"),
                borderRadius: "10px", padding: "2px 8px",
                fontSize: "10.5px", cursor: "pointer",
                whiteSpace: "nowrap",
            });
            chip.addEventListener("click", () => {
                // Toggle: clicking the active one clears the filter
                this._filter.tag = (this._filter.tag === tag) ? null : tag;
                this.refresh();
            });
            this._tagChipRow.appendChild(chip);
        }
    }

    _render() {
        this._body.innerHTML = "";
        // v800 — apply local search filter on already-fetched assets
        const visible = this._searchTerm
            ? this._assets.filter(a => {
                const t = this._searchTerm;
                return (a.name || "").toLowerCase().includes(t)
                    || (a.notes || "").toLowerCase().includes(t)              // v808 — search notes
                    || (Array.isArray(a.tags) && a.tags.some(tag => (tag || "").toLowerCase().includes(t)));   // v808 — and tags
            })
            : this._assets.slice();
        // v809 — pin favorites to the top in Grid + Tinder (List view does its own sorting).
        // Stable sort: assets with the "favorite" tag come first, others retain order.
        if (this._mode !== "list") {
            visible.sort((a, b) => {
                const af = (a.tags || []).includes("favorite") ? 1 : 0;
                const bf = (b.tags || []).includes("favorite") ? 1 : 0;
                return bf - af;     // favorites first
            });
        }
        this._visible = visible;
        if (visible.length === 0) {
            const empty = document.createElement("div");
            if (this._assets.length === 0) {
                empty.textContent = "No assets yet. Generate with Gemini / Kaggle, or drop a file here to ingest. " +
                                    "Gemini voxel generations auto-add to the library starting in v800.";
            } else {
                empty.textContent = `No matches for "${this._searchTerm}".`;
            }
            Object.assign(empty.style, { color: "#9aa", padding: "40px 8px", textAlign: "center", lineHeight: "1.6" });
            this._body.appendChild(empty);
            return;
        }
        if (this._mode === "grid") this._renderGrid(visible);
        else if (this._mode === "list") this._renderList(visible);
        else if (this._mode === "roles") this._renderRoles(visible);   // v1521
        else                       this._renderTinder(visible);
    }

    // v1521 — Roles matrix: rows = assets, columns = canonical role tags, a
    // checkbox per cell. Ticking writes the role TAG via assetLibrary.tag, so
    // roles are unified onto the library's tag system (no separate stores).
    _renderRoles(visible) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, { overflow: "auto", maxHeight: "100%", width: "100%" });
        const note = document.createElement("div");
        Object.assign(note.style, { color: "#8fb0c8", fontSize: "10px", padding: "2px 4px 8px", lineHeight: "1.5" });
        note.textContent = "Tick a box to tag an asset into a role \u2014 roles are stored as library tags. "
            + "Avatar = the \"favorite\" tag (pins in the library today); head / duo / plane / accessory "
            + "consumers read their tag as each gets wired.";
        wrap.appendChild(note);
        const table = document.createElement("table");
        Object.assign(table.style, { borderCollapse: "collapse", width: "100%", fontSize: "11px" });
        const thead = document.createElement("thead");
        const hr = document.createElement("tr");
        const th0 = document.createElement("th");
        th0.textContent = "Asset";
        Object.assign(th0.style, { position: "sticky", top: "0", left: "0", zIndex: "2", background: "#16202c", color: "#cde", textAlign: "left", padding: "6px 8px", borderBottom: "1px solid #2a3340" });
        hr.appendChild(th0);
        for (const r of ROLE_TAGS) {
            const th = document.createElement("th");
            th.textContent = r.icon + " " + r.label;
            th.title = 'tag: "' + r.tag + '"';
            Object.assign(th.style, { position: "sticky", top: "0", zIndex: "1", background: "#16202c", color: "#cde", padding: "6px 6px", borderBottom: "1px solid #2a3340", whiteSpace: "nowrap", fontWeight: "600" });
            hr.appendChild(th);
        }
        thead.appendChild(hr); table.appendChild(thead);
        const tbody = document.createElement("tbody");
        const typeIcons = { voxel: "\uD83E\uDDCA", image: "\uD83D\uDDBC", mesh: "\uD83D\uDCE6", audio: "\uD83D\uDD0A" };
        for (const a of visible) {
            const tr = document.createElement("tr");
            const nameTd = document.createElement("td");
            nameTd.textContent = (typeIcons[a.type] || "\uD83D\uDCE6") + " " + (a.name || a.id || "(unnamed)");
            nameTd.title = a.id || "";
            Object.assign(nameTd.style, { position: "sticky", left: "0", background: "#101820", color: "#bcd", padding: "5px 8px", borderBottom: "1px solid #1d2630", whiteSpace: "nowrap", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" });
            tr.appendChild(nameTd);
            for (const r of ROLE_TAGS) {
                const td = document.createElement("td");
                Object.assign(td.style, { textAlign: "center", padding: "4px 6px", borderBottom: "1px solid #1d2630" });
                const cb = document.createElement("input");
                cb.type = "checkbox";
                cb.checked = Array.isArray(a.tags) && a.tags.includes(r.tag);
                cb.style.cursor = "pointer";
                cb.title = r.label + ' / tag "' + r.tag + '"';
                cb.addEventListener("change", async () => {
                    const on = cb.checked;
                    cb.disabled = true;
                    try {
                        const res = await window.assetLibrary?.tag?.(a.id, r.tag, on ? "add" : "remove");
                        if (!res || !res.ok) throw new Error((res && res.error) || "tag write failed");
                        a.tags = Array.isArray(a.tags) ? a.tags.slice() : [];
                        if (on) { if (!a.tags.includes(r.tag)) a.tags.push(r.tag); }
                        else    { a.tags = a.tags.filter(t => t !== r.tag); }
                        if (r.tag === "favorite") { try { window.syncAvatarFavorites && window.syncAvatarFavorites(); } catch {} }   // v1524 — flow the favorite tag into the avatar cycle now
                    } catch (e) {
                        cb.checked = !on;   // revert on failure
                        console.warn("[roles] " + a.id + " " + r.tag + ":", e && e.message);
                        alert('Could not update role "' + r.tag + '": ' + ((e && e.message) || "error"));
                    } finally { cb.disabled = false; }
                });
                td.appendChild(cb);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
        this._body.appendChild(wrap);
    }

    _renderGrid(visible) {
        const grid = document.createElement("div");
        Object.assign(grid.style, {
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "10px",
        });
        for (const a of visible) grid.appendChild(this._buildCard(a));
        this._body.appendChild(grid);
    }

    /**
     * v806 — compact List view. Each row: small thumb + name + meta + tags
     * + quick-action buttons. ~3 lines per row, much denser than grid.
     * Sortable by clicking column header (name / source / size / date).
     */
    _renderList(visible) {
        const header = document.createElement("div");
        Object.assign(header.style, {
            display: "grid",
            // v807 — 5 cols now (added Date)
            gridTemplateColumns: "44px 1fr 66px 50px 48px",
            gap: "6px", padding: "4px 6px",
            fontSize: "10px", color: "#9aa", textTransform: "uppercase",
            letterSpacing: "0.04em", borderBottom: "1px solid rgba(90,200,255,0.15)",
            marginBottom: "4px",
        });
        if (!this._listSort) this._listSort = { key: "name", dir: 1 };       // 1=asc, -1=desc
        const headerCols = [
            { key: null,         label: "" },                  // thumb col, not sortable
            { key: "name",       label: "Name" },
            { key: "source",     label: "Source" },
            { key: "bytes",      label: "Size" },
            { key: "capturedAt", label: "Date" },              // v807
        ];
        for (const col of headerCols) {
            const cell = document.createElement("div");
            const active = this._listSort.key === col.key;
            cell.textContent = col.label + (active ? (this._listSort.dir === 1 ? " ↑" : " ↓") : "");
            if (col.key) {
                Object.assign(cell.style, { cursor: "pointer", userSelect: "none",
                    color: active ? "#7af" : "#9aa" });
                cell.addEventListener("click", () => {
                    if (this._listSort.key === col.key) this._listSort.dir *= -1;
                    else this._listSort = { key: col.key, dir: 1 };
                    this._render();
                });
            }
            header.appendChild(cell);
        }
        this._body.appendChild(header);

        // Sort visible per current sort key
        const dir = this._listSort.dir;
        const sortKey = this._listSort.key;
        const sorted = visible.slice().sort((a, b) => {
            const av = a?.[sortKey], bv = b?.[sortKey];
            if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
            return String(av || "").localeCompare(String(bv || "")) * dir;
        });

        const list = document.createElement("div");
        Object.assign(list.style, { display: "flex", flexDirection: "column", gap: "3px" });
        for (const a of sorted) list.appendChild(this._buildListRow(a));
        this._body.appendChild(list);
    }

    // v914 — audio mime from extension (for data-URL playback).
    _audioMime(ext) {
        switch (String(ext || "").toLowerCase()) {
            case "mp3": return "audio/mpeg";
            case "ogg": return "audio/ogg";
            case "flac": return "audio/flac";
            case "m4a": case "aac": return "audio/mp4";
            default: return "audio/wav";
        }
    }

    // v914 — fetch an audio asset's bytes and play it (or set as ambient
    // loop) through the engine audio bus. Builds a data-URL from the
    // base64 the bridge returns, so it works regardless of file location.
    async _playAudioAsset(asset, ambient) {
        try {
            const rec = await window.assetLibrary.get(asset.id);
            if (!rec || rec.error || !rec.data) { this._statusSpan.textContent = "audio data unavailable"; return; }
            const ext = rec.meta?.dataExt || asset.ext || "wav";
            const url = `data:${this._audioMime(ext)};base64,${rec.data}`;
            const api = (window.audio && typeof window.audio.then === "function") ? await window.audio : window.audio;
            if (!api) return;
            if (ambient) { if (api.setAmbientClip) await api.setAmbientClip(url); }
            else { if (api.playClip) await api.playClip(url); }
        } catch (e) { console.warn("[assetLibrary] audio play failed:", e); }
    }

    // v914 — ▶ Play / 🔁 Ambient buttons for an audio asset. Clicks
    // stopPropagation so they don't trigger the row/card detail view.
    _audioControls(asset) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, { display: "flex", gap: "4px", marginTop: "3px" });
        const mk = (txt, title, fn) => {
            const b = document.createElement("button");
            b.textContent = txt; b.title = title;
            Object.assign(b.style, {
                padding: "1px 7px", fontSize: "11px", cursor: "pointer",
                background: "rgba(80,160,120,0.4)", color: "#dfe",
                border: "1px solid rgba(120,220,160,0.45)", borderRadius: "4px",
            });
            b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
            return b;
        };
        wrap.appendChild(mk("▶", "Play", () => this._playAudioAsset(asset, false)));
        wrap.appendChild(mk("🔁", "Set as ambient loop", () => this._playAudioAsset(asset, true)));
        return wrap;
    }

    // v916 — ▶ Watch button for a video asset (opens a dismissable overlay).
    _videoControls(asset) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, { display: "flex", gap: "4px", marginTop: "3px" });
        const b = document.createElement("button");
        b.textContent = "▶ Watch"; b.title = "Play video";
        Object.assign(b.style, {
            padding: "1px 7px", fontSize: "11px", cursor: "pointer",
            background: "rgba(150,90,200,0.4)", color: "#edf",
            border: "1px solid rgba(200,150,240,0.45)", borderRadius: "4px",
        });
        b.addEventListener("click", (e) => { e.stopPropagation(); this._watchVideoAsset(asset); });
        wrap.appendChild(b);
        return wrap;
    }

    async _watchVideoAsset(asset) {
        try {
            const rec = await window.assetLibrary.get(asset.id);
            if (!rec || rec.error || !rec.data) { this._statusSpan.textContent = "video data unavailable"; return; }
            const ext = (rec.meta?.dataExt || asset.ext || "mp4").toLowerCase();
            const mime = ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4";
            const url = `data:${mime};base64,${rec.data}`;
            const back = document.createElement("div");
            Object.assign(back.style, { position: "fixed", inset: "0", background: "rgba(0,0,0,0.85)", zIndex: "999999",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" });
            const v = document.createElement("video");
            v.src = url; v.controls = true; v.autoplay = true; v.loop = true;
            Object.assign(v.style, { maxWidth: "92vw", maxHeight: "92vh", borderRadius: "8px" });
            v.addEventListener("click", (e) => e.stopPropagation());
            back.addEventListener("click", () => { try { v.pause(); } catch {} back.remove(); });
            back.appendChild(v); document.body.appendChild(back);
        } catch (e) { console.warn("[assetLibrary] video play failed:", e); }
    }

    // v921 — ⛶ View button for a splat asset → opens the Aholo splat viewer.
    // v922 — 🦴 Animate button for a mesh asset → opens the rigged-GLB viewer
    // (plays RigAnything's skeleton + skinning, or any animated/static GLB).
    _glbControls(asset) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, { display: "flex", gap: "4px", marginTop: "3px" });
        const b = document.createElement("button");
        b.textContent = "🦴 Animate"; b.title = "Open in the rigged-GLB viewer (skeletal + morph playback)";
        Object.assign(b.style, {
            padding: "1px 7px", fontSize: "11px", cursor: "pointer",
            background: "rgba(120,180,220,0.4)", color: "#cdf",
            border: "1px solid rgba(150,200,240,0.45)", borderRadius: "4px",
        });
        b.addEventListener("click", (e) => { e.stopPropagation(); window.open("/glb_viewer.html?asset=" + encodeURIComponent(asset.id), "_blank"); });
        wrap.appendChild(b);
        return wrap;
    }

    _splatControls(asset) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, { display: "flex", gap: "4px", marginTop: "3px" });
        const b = document.createElement("button");
        b.textContent = "⛶ View"; b.title = "Open in the Aholo splat viewer";
        Object.assign(b.style, {
            padding: "1px 7px", fontSize: "11px", cursor: "pointer",
            background: "rgba(150,120,220,0.4)", color: "#dcf",
            border: "1px solid rgba(180,150,240,0.45)", borderRadius: "4px",
        });
        b.addEventListener("click", (e) => { e.stopPropagation(); window.open("/splat_viewer.html?asset=" + encodeURIComponent(asset.id), "_blank"); });
        wrap.appendChild(b);
        return wrap;
    }

    _buildListRow(asset) {
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "grid",
            gridTemplateColumns: "44px 1fr 66px 50px 48px",        // v807 — matches header
            gap: "6px",
            alignItems: "center",
            background: "rgba(30, 40, 55, 0.4)",
            border: "1px solid rgba(90,200,255,0.12)",
            borderRadius: "4px",
            padding: "4px 6px",
            cursor: "pointer",
            transition: "background 0.12s",
            position: "relative",
        });
        row.addEventListener("mouseenter", () => row.style.background = "rgba(50, 70, 95, 0.6)");
        row.addEventListener("mouseleave", () => {
            const sel = this._selectMode && this._selected.has(asset.id);
            row.style.background = sel ? "rgba(60, 120, 180, 0.4)" : "rgba(30, 40, 55, 0.4)";
        });
        if (this._selectMode && this._selected.has(asset.id)) {
            row.style.background = "rgba(60, 120, 180, 0.4)";
            row.style.borderColor = "rgba(120,200,255,0.7)";
        }

        // Thumbnail
        const thumb = document.createElement("div");
        Object.assign(thumb.style, {
            width: "40px", height: "40px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(10, 15, 22, 0.5)", borderRadius: "3px",
            overflow: "hidden", fontSize: "18px", color: "#456",
        });
        const typeIcons = { voxel: "🧊", mesh: "🗿", splat: "💫", image: "🖼", audio: "🔊", video: "🎬", other: "📦" };
        thumb.textContent = typeIcons[asset.type] || "📦";
        row.appendChild(thumb);
        if (asset.type === "voxel")      this._loadVoxelThumb(asset, thumb);
        else if (asset.type === "image") this._loadImageThumb(asset, thumb);
        else if (asset.type === "mesh")  this._loadMeshThumb(asset, thumb);
        else if (asset.type === "splat") this._loadSplatThumb(asset, thumb);

        // Name + tags
        const nameBlock = document.createElement("div");
        Object.assign(nameBlock.style, { overflow: "hidden", minWidth: "0" });
        const name = document.createElement("div");
        name.textContent = asset.name;
        Object.assign(name.style, {
            fontWeight: "600", fontSize: "12px", color: "#cde",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        });
        nameBlock.appendChild(name);
        if (Array.isArray(asset.tags) && asset.tags.length > 0) {
            const tags = document.createElement("div");
            tags.textContent = asset.tags.slice(0, 3).join(", ") + (asset.tags.length > 3 ? `, +${asset.tags.length - 3}` : "");
            Object.assign(tags.style, {
                fontSize: "10px", color: "#778",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                marginTop: "1px",
            });
            nameBlock.appendChild(tags);
        }
        if (asset.type === "audio") nameBlock.appendChild(this._audioControls(asset));
        if (asset.type === "video") nameBlock.appendChild(this._videoControls(asset));
        if (asset.type === "splat") nameBlock.appendChild(this._splatControls(asset));
        if (asset.type === "mesh")  nameBlock.appendChild(this._glbControls(asset));
        row.appendChild(nameBlock);

        // Source / type
        const src = document.createElement("div");
        src.textContent = `${asset.source}\n${asset.type}`;
        Object.assign(src.style, {
            fontSize: "10px", color: "#9aa", whiteSpace: "pre-line", lineHeight: "1.2",
        });
        row.appendChild(src);

        // Size
        const size = document.createElement("div");
        size.textContent = `${(asset.bytes / 1024).toFixed(1)} KB`;
        Object.assign(size.style, { fontSize: "10px", color: "#789", textAlign: "right" });
        row.appendChild(size);

        // v807 — Date column (relative format: "2h", "3d", "1w")
        const date = document.createElement("div");
        date.textContent = _relativeTime(asset.capturedAt);
        Object.assign(date.style, { fontSize: "10px", color: "#789", textAlign: "right" });
        row.appendChild(date);

        // Click: same select-mode-vs-detail dispatch as cards
        row.addEventListener("click", () => {
            if (this._selectMode) {
                if (this._selected.has(asset.id)) this._selected.delete(asset.id);
                else                                this._selected.add(asset.id);
                this._render();
                this._refreshBatchBar();
            } else {
                this._showDetail(asset);
            }
        });

        return row;
    }

    _buildCard(asset) {
        const card = document.createElement("div");
        Object.assign(card.style, {
            background: "rgba(30, 40, 55, 0.6)",
            border: "1px solid rgba(90,200,255,0.2)",
            borderRadius: "5px",
            padding: "8px",
            cursor: "pointer",
            transition: "background 0.15s",
            position: "relative",
        });
        card.addEventListener("mouseenter", () => card.style.background = "rgba(50, 70, 95, 0.7)");
        card.addEventListener("mouseleave", () => card.style.background = "rgba(30, 40, 55, 0.6)");

        // v802 — select-mode checkbox overlay
        if (this._selectMode) {
            const checked = this._selected.has(asset.id);
            const checkbox = document.createElement("div");
            checkbox.textContent = checked ? "☑" : "☐";
            Object.assign(checkbox.style, {
                position: "absolute", top: "4px", right: "4px",
                fontSize: "20px", color: checked ? "#7af" : "#9ab",
                zIndex: "2", lineHeight: "1",
                background: "rgba(0,0,0,0.5)", borderRadius: "3px",
                padding: "2px 4px",
            });
            card.appendChild(checkbox);
            if (checked) {
                card.style.background = "rgba(60, 120, 180, 0.4)";
                card.style.borderColor = "rgba(120,200,255,0.7)";
            }
        }
        // v809 — favorite-asset star indicator
        if (Array.isArray(asset.tags) && asset.tags.includes("favorite")) {
            const star = document.createElement("div");
            star.textContent = "★";
            star.title = "Favorite";
            Object.assign(star.style, {
                position: "absolute", top: "4px", left: "4px",
                fontSize: "15px", color: "#ffd34a", zIndex: "2",
                lineHeight: "1", textShadow: "0 1px 3px rgba(0,0,0,0.6)",
            });
            card.appendChild(star);
        }

        // v801 — thumbnail slot. For voxel assets, lazy-fetch + render an
        // isometric preview. For other types, show a type-specific icon.
        const thumbWrap = document.createElement("div");
        Object.assign(thumbWrap.style, {
            width: "100%", aspectRatio: "1", marginBottom: "6px",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(10, 15, 22, 0.5)", borderRadius: "3px",
            overflow: "hidden", fontSize: "32px", color: "#456",
        });
        // Type icon as initial fallback
        const typeIcons = { voxel: "🧊", mesh: "🗿", splat: "💫", image: "🖼", audio: "🔊", video: "🎬", other: "📦" };
        thumbWrap.textContent = typeIcons[asset.type] || "📦";
        card.appendChild(thumbWrap);
        if (asset.type === "audio") card.appendChild(this._audioControls(asset));
        if (asset.type === "video") card.appendChild(this._videoControls(asset));
        if (asset.type === "splat") card.appendChild(this._splatControls(asset));
        if (asset.type === "mesh")  card.appendChild(this._glbControls(asset));

        // For voxel assets, lazy-fetch + render the iso preview
        if (asset.type === "voxel") {
            this._loadVoxelThumb(asset, thumbWrap);
        }
        // v803 — image asset thumbnails: decode base64 → set as img src
        else if (asset.type === "image") {
            this._loadImageThumb(asset, thumbWrap);
        }
        // v809 — mesh + splat thumbnails (bbox wireframe / scatter cloud)
        else if (asset.type === "mesh") {
            this._loadMeshThumb(asset, thumbWrap);
        }
        else if (asset.type === "splat") {
            this._loadSplatThumb(asset, thumbWrap);
        }

        const name = document.createElement("div");
        name.textContent = asset.name;
        Object.assign(name.style, {
            fontWeight: "600", fontSize: "13px", color: "#cde",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        });
        const meta = document.createElement("div");
        // v808 — include stats summary if available (verts, splats, voxels)
        const statsStr = _formatStats(asset);
        meta.textContent = `${asset.source} • ${asset.type}` +
            (statsStr ? " • " + statsStr : "") +
            (asset.orientation ? " • fwd: " + asset.orientation.forward : "");
        Object.assign(meta.style, { fontSize: "11px", color: "#9aa", marginTop: "3px" });
        const size = document.createElement("div");
        size.textContent = `${(asset.bytes / 1024).toFixed(1)} KB`;
        Object.assign(size.style, { fontSize: "10px", color: "#789", marginTop: "2px" });

        card.appendChild(name);
        card.appendChild(meta);
        card.appendChild(size);

        // v802 — click behavior depends on select mode
        card.addEventListener("click", () => {
            if (this._selectMode) {
                if (this._selected.has(asset.id)) this._selected.delete(asset.id);
                else                                this._selected.add(asset.id);
                this._render();
                this._refreshBatchBar();
            } else {
                this._showDetail(asset);
            }
        });

        return card;
    }

    /**
     * v801 — async voxel thumbnail loader. Fetches the asset data, renders
     * an isometric preview, caches the data URL on this panel instance.
     * v808 — first checks asset.thumbBase64 from manifest. If absent, renders
     * + POSTs back to bridge so subsequent loads skip the per-card data fetch.
     */
    async _loadVoxelThumb(asset, thumbWrap) {
        if (!this._thumbCache) this._thumbCache = new Map();
        // v808 — manifest-cached thumb wins
        if (asset.thumbBase64) {
            this._thumbCache.set(asset.id, asset.thumbBase64);
            this._setThumbImg(thumbWrap, asset.thumbBase64);
            return;
        }
        // Local cache hit?
        if (this._thumbCache.has(asset.id)) {
            const cached = this._thumbCache.get(asset.id);
            if (cached) this._setThumbImg(thumbWrap, cached);
            return;
        }
        try {
            const resp = await window.assetLibrary.get(asset.id);
            if (resp?.error || !resp?.data?.voxels) {
                this._thumbCache.set(asset.id, null);   // cache the miss too
                return;
            }
            const { voxelToDataUrl, previewYawForOrientation } = await import("../data/voxelThumbnail.js");
            const yawDeg = previewYawForOrientation(asset.orientation);
            const url = voxelToDataUrl(resp.data.voxels, { size: 96, rotateYawDeg: yawDeg });
            this._thumbCache.set(asset.id, url);
            if (url) {
                this._setThumbImg(thumbWrap, url);
                // v808 — POST back to manifest so future panel loads skip the fetch.
                // Fire-and-forget; failure just means the cache miss is paid again.
                try { window.assetLibrary?.setThumb?.(asset.id, url); } catch {}
            }
        } catch (e) {
            console.warn(`[AssetLibrary] thumbnail failed for ${asset.id}:`, e?.message);
            this._thumbCache.set(asset.id, null);
        }
    }

    /**
     * v803 — image asset thumbnail. Decodes base64 + constructs a data URL.
     * v808 — also uses manifest cache when available.
     */
    async _loadImageThumb(asset, thumbWrap) {
        if (!this._thumbCache) this._thumbCache = new Map();
        if (asset.thumbBase64) {
            this._thumbCache.set(asset.id, asset.thumbBase64);
            this._setThumbImg(thumbWrap, asset.thumbBase64);
            return;
        }
        if (this._thumbCache.has(asset.id)) {
            const cached = this._thumbCache.get(asset.id);
            if (cached) this._setThumbImg(thumbWrap, cached);
            return;
        }
        try {
            const resp = await window.assetLibrary.get(asset.id);
            if (resp?.error || typeof resp?.data !== "string") {
                this._thumbCache.set(asset.id, null);
                return;
            }
            const ext = asset.dataExt || "png";
            const mime = ext === "jpg" ? "jpeg" : ext;
            const url = `data:image/${mime};base64,${resp.data}`;
            this._thumbCache.set(asset.id, url);
            this._setThumbImg(thumbWrap, url);
            // Don't POST image data URLs back — they're already in the asset data,
            // would just double-store. Local cache is enough.
        } catch (e) {
            console.warn(`[AssetLibrary] image thumbnail failed for ${asset.id}:`, e?.message);
            this._thumbCache.set(asset.id, null);
        }
    }

    /**
     * v809 — mesh thumbnail. Renders the bounding box wireframe via
     * Canvas2D iso projection if asset.stats.bbox is present. Manifest-
     * cached like voxel thumbnails. No data fetch needed — bbox is in
     * the list response.
     * v811 — when asset has hasGeomSample, fetch sampled positions and
     * render actual geometry as projected points (richer than bbox).
     */
    async _loadMeshThumb(asset, thumbWrap) {
        if (!this._thumbCache) this._thumbCache = new Map();
        // Server-cached thumb wins
        if (asset.thumbBase64) {
            this._thumbCache.set(asset.id, asset.thumbBase64);
            this._setThumbImg(thumbWrap, asset.thumbBase64);
            return;
        }
        if (this._thumbCache.has(asset.id)) {
            const cached = this._thumbCache.get(asset.id);
            if (cached) this._setThumbImg(thumbWrap, cached);
            return;
        }
        try {
            const { meshBboxToDataUrl, meshGeomToDataUrl } = await import("../data/meshThumbnail.js");
            let url = null;
            // v811 — actual geometry render preferred
            if (asset.stats?.hasGeomSample) {
                const geomResp = await window.assetLibrary.getGeom?.(asset.id);
                if (geomResp?.geomSample) {
                    url = meshGeomToDataUrl(geomResp.geomSample, { size: 96 });
                }
            }
            // Fallback: bbox wireframe (always available if bbox in stats)
            if (!url && asset.stats?.bbox) {
                url = meshBboxToDataUrl(asset.stats.bbox, { size: 96 });
            }
            this._thumbCache.set(asset.id, url);
            if (url) {
                this._setThumbImg(thumbWrap, url);
                try { window.assetLibrary?.setThumb?.(asset.id, url); } catch {}
            }
        } catch (e) {
            console.warn(`[AssetLibrary] mesh thumbnail failed for ${asset.id}:`, e?.message);
            this._thumbCache.set(asset.id, null);
        }
    }

    /**
     * v809 — splat thumbnail. Renders a deterministic stylized scatter
     * cloud whose density + hue scale with vertex count.
     * v811 — when asset has hasGeomSample, render actual sampled positions
     * (more authentic per-asset shape).
     */
    async _loadSplatThumb(asset, thumbWrap) {
        if (!this._thumbCache) this._thumbCache = new Map();
        if (asset.thumbBase64) {
            this._thumbCache.set(asset.id, asset.thumbBase64);
            this._setThumbImg(thumbWrap, asset.thumbBase64);
            return;
        }
        if (this._thumbCache.has(asset.id)) {
            const cached = this._thumbCache.get(asset.id);
            if (cached) this._setThumbImg(thumbWrap, cached);
            return;
        }
        try {
            const { splatCloudToDataUrl, splatGeomToDataUrl } = await import("../data/meshThumbnail.js");
            let url = null;
            // v811 — actual sampled positions preferred
            if (asset.stats?.hasGeomSample) {
                const geomResp = await window.assetLibrary.getGeom?.(asset.id);
                if (geomResp?.geomSample) {
                    url = splatGeomToDataUrl(geomResp.geomSample, asset.stats?.vertexCount || 1000, { size: 96 });
                }
            }
            // Fallback: stylized scatter cloud (deterministic by id)
            if (!url) {
                url = splatCloudToDataUrl(asset.id, asset.stats?.vertexCount || 1000, { size: 96 });
            }
            this._thumbCache.set(asset.id, url);
            if (url) {
                this._setThumbImg(thumbWrap, url);
                try { window.assetLibrary?.setThumb?.(asset.id, url); } catch {}
            }
        } catch (e) {
            console.warn(`[AssetLibrary] splat thumbnail failed for ${asset.id}:`, e?.message);
            this._thumbCache.set(asset.id, null);
        }
    }

    _setThumbImg(slot, url) {
        slot.innerHTML = "";
        const img = document.createElement("img");
        img.src = url;
        Object.assign(img.style, {
            width: "100%", height: "100%", objectFit: "contain",
            imageRendering: "pixelated",
        });
        slot.appendChild(img);
    }

    _renderTinder(visible) {
        if (visible.length === 0) return;
        // Keep tinderIdx in bounds of the filtered view
        this._tinderIdx = Math.min(this._tinderIdx, visible.length - 1);
        const a = visible[this._tinderIdx];
        if (!a) return;

        const wrap = document.createElement("div");
        Object.assign(wrap.style, {
            display: "flex", flexDirection: "column", alignItems: "stretch",
            gap: "14px", padding: "20px 8px",
        });

        const counter = document.createElement("div");
        counter.textContent = `${this._tinderIdx + 1} / ${visible.length}`;
        Object.assign(counter.style, { textAlign: "center", color: "#789", fontSize: "11px" });
        wrap.appendChild(counter);

        // Big card
        const big = document.createElement("div");
        Object.assign(big.style, {
            background: "rgba(30, 40, 55, 0.8)",
            border: "1px solid rgba(90,200,255,0.4)",
            borderRadius: "8px",
            padding: "30px",
            textAlign: "center",
        });
        const name = document.createElement("div");
        name.textContent = a.name;
        Object.assign(name.style, { fontSize: "22px", fontWeight: "600", color: "#cdf", marginBottom: "10px" });
        const meta = document.createElement("div");
        meta.textContent = `${a.source} • ${a.type} • ${(a.bytes / 1024).toFixed(1)} KB`;
        Object.assign(meta.style, { fontSize: "13px", color: "#9aa", marginBottom: "16px" });
        const orient = document.createElement("div");
        orient.textContent = "Forward: " + (a.orientation?.forward || "(unset)");
        Object.assign(orient.style, { fontSize: "12px", color: "#abc" });
        big.appendChild(name);
        big.appendChild(meta);
        big.appendChild(orient);
        wrap.appendChild(big);

        // Tinder action row
        const actions = document.createElement("div");
        Object.assign(actions.style, {
            display: "flex", gap: "10px", justifyContent: "center",
        });
        const _act = (label, color, onClick) => {
            const b = document.createElement("button");
            b.textContent = label;
            Object.assign(b.style, {
                background: color, color: "#fff", border: "none",
                borderRadius: "8px", padding: "12px 18px",
                cursor: "pointer", fontSize: "14px", fontWeight: "600",
                minWidth: "80px",
            });
            b.addEventListener("click", onClick);
            return b;
        };
        const reject = _act("← Delete", "#a44", async () => {
            if (!confirm(`Delete '${a.name}'? This cannot be undone.`)) return;
            await window.assetLibrary.remove(a.id);
            await this.refresh();
        });
        const skip = _act("Skip", "#456", () => this._tinderAdvance(1));
        const renameBtn = _act("Rename", "#465", async () => {
            const n = prompt("New name:", a.name);
            if (n && n !== a.name) {
                await window.assetLibrary.rename(a.id, n);
                await this.refresh();
            }
        });
        const orientBtn = _act("Orient", "#564", () => this._showOrientDialog(a));
        const keep = _act("Keep →", "#484", () => this._tinderAdvance(1));
        actions.appendChild(reject);
        actions.appendChild(skip);
        actions.appendChild(renameBtn);
        actions.appendChild(orientBtn);
        actions.appendChild(keep);
        wrap.appendChild(actions);

        // Arrow nav row
        const nav = document.createElement("div");
        Object.assign(nav.style, { display: "flex", gap: "8px", justifyContent: "space-between", marginTop: "4px" });
        const prevBtn = _act("◀ Prev", "#345", () => this._tinderAdvance(-1));
        const nextBtn = _act("Next ▶", "#345", () => this._tinderAdvance(1));
        prevBtn.style.fontSize = "12px"; nextBtn.style.fontSize = "12px";
        prevBtn.style.minWidth = "60px"; nextBtn.style.minWidth = "60px";
        prevBtn.style.padding = "8px 12px"; nextBtn.style.padding = "8px 12px";
        nav.appendChild(prevBtn);
        nav.appendChild(nextBtn);
        wrap.appendChild(nav);

        this._body.appendChild(wrap);
    }

    _tinderAdvance(delta) {
        const len = (this._visible?.length || this._assets.length) || 1;
        this._tinderIdx = (this._tinderIdx + delta + len) % len;
        this._render();
    }

    _showDetail(asset) {
        // Reuse the tinder UI on this single asset by index
        const idx = this._assets.findIndex(a => a.id === asset.id);
        if (idx >= 0) {
            this._tinderIdx = idx;
            this._setMode("tinder");
        }
    }

    /**
     * v814 — Statistics dashboard modal. Shows totals, source/type
     * breakdowns, top tags, largest assets, and date range.
     * v816 — auto-refreshes on SSE events while open (any add/remove/
     * tag/orient triggers a refetch + repaint).
     */
    _showStatsDialog(s) {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", inset: "0", background: "rgba(0,0,0,0.6)",
            zIndex: "2000", display: "flex", alignItems: "center", justifyContent: "center",
        });
        const dlg = document.createElement("div");
        Object.assign(dlg.style, {
            background: "rgba(20,28,38,0.97)", border: "1px solid rgba(90,200,255,0.5)",
            borderRadius: "8px", padding: "20px", color: "#cde",
            fontSize: "13px", width: "380px", maxHeight: "80vh", overflowY: "auto",
        });
        // Title + subtitle (static — don't repaint)
        const title = document.createElement("div");
        title.textContent = "📊 Asset Library Statistics";
        Object.assign(title.style, { fontWeight: "600", fontSize: "15px", marginBottom: "4px" });
        dlg.appendChild(title);
        const subtitle = document.createElement("div");
        Object.assign(subtitle.style, { fontSize: "10px", color: "#789", marginBottom: "8px", fontFamily: "monospace", wordBreak: "break-all" });
        dlg.appendChild(subtitle);
        // Live indicator (pulsing dot when subscribed to events)
        const liveDot = document.createElement("div");
        Object.assign(liveDot.style, {
            display: "inline-block", width: "6px", height: "6px", borderRadius: "50%",
            background: "#4f9", marginRight: "6px", animation: "stats-pulse 1.6s ease-in-out infinite",
            verticalAlign: "middle",
        });
        const liveLabel = document.createElement("span");
        liveLabel.textContent = "live";
        Object.assign(liveLabel.style, { fontSize: "10px", color: "#7af", verticalAlign: "middle" });
        // Style block for the pulse animation (idempotent — only added once)
        if (!document.getElementById("_statsDlgStyle")) {
            const st = document.createElement("style");
            st.id = "_statsDlgStyle";
            st.textContent = "@keyframes stats-pulse { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }";
            document.head.appendChild(st);
        }
        const liveWrap = document.createElement("div");
        Object.assign(liveWrap.style, { marginBottom: "6px" });
        liveWrap.appendChild(liveDot);
        liveWrap.appendChild(liveLabel);
        dlg.appendChild(liveWrap);

        // Container for the repaintable content
        const body = document.createElement("div");
        dlg.appendChild(body);

        // Close button (static)
        const close = document.createElement("button");
        close.textContent = "Close";
        Object.assign(close.style, {
            background: "#345", color: "#9ab", border: "1px solid #567",
            borderRadius: "4px", padding: "6px 16px", cursor: "pointer",
            width: "100%", fontSize: "12px", marginTop: "16px",
        });
        const _doClose = () => {
            this._statsDlg = null;
            this._statsRepaint = null;
            try { document.body.removeChild(overlay); } catch {}
        };
        close.addEventListener("click", _doClose);
        dlg.appendChild(close);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) _doClose(); });

        // Build the body content from a status snapshot
        const _fmtSize = (n) => {
            if (n == null) return "?";
            if (n >= 1024 * 1024 * 1024) return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
            if (n >= 1024 * 1024)        return (n / (1024 * 1024)).toFixed(2) + " MB";
            if (n >= 1024)               return (n / 1024).toFixed(1) + " KB";
            return n + " B";
        };
        const _fmtDate = (ts) => ts ? new Date(ts).toLocaleString() : "—";
        const _section = (parent, t) => {
            const h = document.createElement("div");
            h.textContent = t;
            Object.assign(h.style, {
                fontSize: "11px", color: "#7af", textTransform: "uppercase",
                letterSpacing: "0.05em", marginTop: "14px", marginBottom: "6px",
                paddingBottom: "3px", borderBottom: "1px solid rgba(90,200,255,0.2)",
            });
            parent.appendChild(h);
        };
        const _row = (parent, label, value, color = "#cde") => {
            const r = document.createElement("div");
            Object.assign(r.style, { display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: "12px" });
            const l = document.createElement("span"); l.textContent = label; l.style.color = "#9ab";
            const v = document.createElement("span"); v.textContent = value; v.style.color = color; v.style.fontFamily = "monospace";
            r.appendChild(l); r.appendChild(v);
            parent.appendChild(r);
        };
        const _fill = (snap) => {
            body.innerHTML = "";
            subtitle.textContent = snap.libDir || "";
            _section(body, "Totals");
            _row(body, "Assets", String(snap.total), "#cdf");
            _row(body, "Storage", _fmtSize(snap.totalBytes), "#cdf");
            if (snap.favoriteCount > 0)       _row(body, "★ Favorites", String(snap.favoriteCount), "#ffd34a");
            if (snap.hasThumbCount > 0)       _row(body, "Cached thumbnails", String(snap.hasThumbCount));
            if (snap.hasGeomSampleCount > 0)  _row(body, "With geomSample", String(snap.hasGeomSampleCount));
            if (snap.withNotesCount > 0)      _row(body, "With notes", String(snap.withNotesCount));
            if (snap.bySource && Object.keys(snap.bySource).length > 0) {
                _section(body, "By source");
                for (const [k, v] of Object.entries(snap.bySource).sort((a, b) => b[1] - a[1])) _row(body, k, String(v));
            }
            if (snap.byType && Object.keys(snap.byType).length > 0) {
                _section(body, "By type");
                for (const [k, v] of Object.entries(snap.byType).sort((a, b) => b[1] - a[1])) _row(body, k, String(v));
            }
            if (snap.byOrientation && Object.keys(snap.byOrientation).length > 0) {
                _section(body, "By orientation");
                for (const [k, v] of Object.entries(snap.byOrientation).sort((a, b) => b[1] - a[1])) _row(body, "forward " + k, String(v));
            }
            if (Array.isArray(snap.topTags) && snap.topTags.length > 0) {
                _section(body, "Top tags");
                for (const { tag, count } of snap.topTags) _row(body, tag, String(count));
            }
            if (Array.isArray(snap.largestAssets) && snap.largestAssets.length > 0) {
                _section(body, "Largest assets");
                for (const a of snap.largestAssets) _row(body, a.name + " (" + a.type + ")", _fmtSize(a.bytes));
            }
            _section(body, "Captured");
            _row(body, "Oldest", _fmtDate(snap.oldestAt));
            _row(body, "Newest", _fmtDate(snap.newestAt));
        };
        _fill(s);

        // v816 — register the repaint function so SSE can call it
        this._statsDlg = overlay;
        this._statsRepaint = async () => {
            try {
                const fresh = await window.assetLibrary.status();
                if (this._statsDlg === overlay) _fill(fresh);
            } catch {}
        };

        overlay.appendChild(dlg);
        document.body.appendChild(overlay);
    }

    _showOrientDialog(asset) {
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", inset: "0", background: "rgba(0,0,0,0.6)",
            zIndex: "2000", display: "flex", alignItems: "center", justifyContent: "center",
        });
        const dlg = document.createElement("div");
        Object.assign(dlg.style, {
            background: "rgba(20,28,38,0.97)", border: "1px solid rgba(90,200,255,0.5)",
            borderRadius: "8px", padding: "20px", color: "#cde",
            fontSize: "13px", width: "360px",
        });

        // v805 — inline-editable name header. Click pencil to edit, Enter or
        // blur commits, Escape cancels. Title row also shows meta line.
        // v809 — Plus a ★ favorite toggle.
        const titleRow = document.createElement("div");
        Object.assign(titleRow.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" });

        // v809 — favorite toggle. Stores via "favorite" tag.
        const isFavorite = Array.isArray(asset.tags) && asset.tags.includes("favorite");
        const favBtn = document.createElement("button");
        favBtn.textContent = isFavorite ? "★" : "☆";
        favBtn.title = isFavorite ? "Unfavorite" : "Mark as favorite";
        Object.assign(favBtn.style, {
            background: "transparent",
            color: isFavorite ? "#ffd34a" : "#9ab",
            border: "1px solid " + (isFavorite ? "rgba(255,210,90,0.5)" : "#456"),
            borderRadius: "3px", padding: "2px 7px", cursor: "pointer",
            fontSize: "14px", lineHeight: "1",
        });
        favBtn.addEventListener("click", async () => {
            const nowFav = !(Array.isArray(asset.tags) && asset.tags.includes("favorite"));
            try {
                const r = await window.assetLibrary.tag(asset.id, "favorite", nowFav ? "add" : "remove");
                if (r?.ok) {
                    if (!Array.isArray(asset.tags)) asset.tags = [];
                    if (nowFav) { if (!asset.tags.includes("favorite")) asset.tags.push("favorite"); }
                    else        { asset.tags = asset.tags.filter(t => t !== "favorite"); }
                    favBtn.textContent = nowFav ? "★" : "☆";
                    favBtn.style.color = nowFav ? "#ffd34a" : "#9ab";
                    favBtn.style.borderColor = nowFav ? "rgba(255,210,90,0.5)" : "#456";
                    await this.refresh();
                } else { alert("Favorite failed: " + r?.error); }
            } catch (e) { alert("Favorite failed: " + e?.message); }
        });
        titleRow.appendChild(favBtn);

        const nameSpan = document.createElement("span");
        nameSpan.textContent = asset.name;
        Object.assign(nameSpan.style, { fontWeight: "600", fontSize: "15px", flex: "1", color: "#cde" });
        titleRow.appendChild(nameSpan);
        const editBtn = document.createElement("button");
        editBtn.textContent = "✎";
        editBtn.title = "Rename";
        Object.assign(editBtn.style, {
            background: "transparent", color: "#9ab", border: "1px solid #456",
            borderRadius: "3px", padding: "1px 6px", cursor: "pointer", fontSize: "12px",
        });
        editBtn.addEventListener("click", () => {
            const input = document.createElement("input");
            input.type = "text";
            input.value = asset.name;
            Object.assign(input.style, {
                flex: "1", fontWeight: "600", fontSize: "15px",
                background: "#1a2530", color: "#cde",
                border: "1px solid rgba(90,200,255,0.5)",
                borderRadius: "3px", padding: "3px 6px",
                fontFamily: "inherit",
            });
            const commit = async () => {
                const newName = input.value.trim();
                if (!newName || newName === asset.name) {
                    // revert UI without API call
                    titleRow.replaceChild(nameSpan, input);
                    return;
                }
                try {
                    const r = await window.assetLibrary.rename(asset.id, newName);
                    if (r?.ok) {
                        asset.name = newName;
                        nameSpan.textContent = newName;
                        await this.refresh();
                    } else {
                        alert("Rename failed: " + (r?.error || "unknown"));
                    }
                } catch (e) { alert("Rename failed: " + e?.message); }
                titleRow.replaceChild(nameSpan, input);
            };
            let cancelled = false;
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") { input.blur(); }
                else if (e.key === "Escape") { cancelled = true; input.blur(); }
            });
            input.addEventListener("blur", () => {
                if (cancelled) titleRow.replaceChild(nameSpan, input);
                else commit();
            });
            titleRow.replaceChild(input, nameSpan);
            input.focus();
            input.select();
        });
        titleRow.appendChild(editBtn);
        dlg.appendChild(titleRow);

        const metaLine = document.createElement("div");
        metaLine.textContent = `${asset.source} • ${asset.type} • ${(asset.bytes / 1024).toFixed(1)} KB`;
        Object.assign(metaLine.style, { fontSize: "11px", color: "#789", marginBottom: "14px" });
        dlg.appendChild(metaLine);

        // v803 — Spawn button. Voxel + splat (v804) + mesh (v805) get a
        // working spawn; image stays disabled (no spawn semantics for images).
        const spawnBtn = document.createElement("button");
        const canSpawn = (asset.type === "voxel" || asset.type === "splat" || asset.type === "mesh");
        const spawnHint = canSpawn
            ? "🚀 Spawn into scene"
            : `🚀 Spawn (not yet supported for ${asset.type} type)`;
        spawnBtn.textContent = spawnHint;
        Object.assign(spawnBtn.style, {
            background: canSpawn ? "rgba(70, 180, 90, 0.35)" : "#345",
            color: canSpawn ? "#cfd" : "#789",
            border: "1px solid " + (canSpawn ? "rgba(120, 220, 140, 0.5)" : "#567"),
            borderRadius: "4px", padding: "10px 12px", cursor: canSpawn ? "pointer" : "not-allowed",
            width: "100%", fontSize: "13px", fontWeight: "600", marginBottom: "12px",
        });
        if (canSpawn) {
            spawnBtn.addEventListener("click", async () => {
                spawnBtn.disabled = true;
                spawnBtn.textContent = "Spawning...";
                try {
                    const r = await window.assetLibrary.spawn(asset.id);
                    if (r?.ok) {
                        spawnBtn.textContent = `✓ Spawned (id ${r.id})`;
                        setTimeout(() => { try { document.body.removeChild(overlay); } catch {} }, 700);
                    } else {
                        spawnBtn.textContent = "✗ " + (r?.error || "spawn failed");
                        spawnBtn.style.background = "#a44";
                    }
                } catch (e) {
                    spawnBtn.textContent = "✗ " + e?.message;
                    spawnBtn.style.background = "#a44";
                }
            });
        }
        dlg.appendChild(spawnBtn);

        // v817 — Edit Rig button (rig assets only)
        if (asset.type === "rig") {
            const editBtn = document.createElement("button");
            editBtn.textContent = "🦴 Edit Rig (bones, parents, positions)";
            Object.assign(editBtn.style, {
                background: "rgba(180, 150, 60, 0.3)", color: "#fed",
                border: "1px solid rgba(220, 190, 100, 0.5)",
                borderRadius: "4px", padding: "8px 12px", cursor: "pointer",
                width: "100%", fontSize: "12px", marginBottom: "12px",
            });
            editBtn.addEventListener("click", async () => {
                try {
                    const { openRigEditor } = await import("./rigEditorDialog.js");
                    openRigEditor(asset, async (newMeta) => {
                        try { document.body.removeChild(overlay); } catch {}
                        await this.refresh();
                    });
                } catch (e) { alert("Editor failed to load: " + e?.message); }
            });
            dlg.appendChild(editBtn);
        }

        // v818 — Edit Clip button (clip assets only) — JSON-textarea editor + timeline scrubber
        if (asset.type === "clip") {
            const editBtn = document.createElement("button");
            editBtn.textContent = "🎬 Edit Clip (keyframes, duration)";
            Object.assign(editBtn.style, {
                background: "rgba(140, 100, 200, 0.3)", color: "#dcf",
                border: "1px solid rgba(180, 140, 240, 0.5)",
                borderRadius: "4px", padding: "8px 12px", cursor: "pointer",
                width: "100%", fontSize: "12px", marginBottom: "12px",
            });
            editBtn.addEventListener("click", async () => {
                try {
                    const { openClipEditor } = await import("./clipEditorDialog.js");
                    openClipEditor(asset, async (newMeta) => {
                        try { document.body.removeChild(overlay); } catch {}
                        await this.refresh();
                    });
                } catch (e) { alert("Editor failed to load: " + e?.message); }
            });
            dlg.appendChild(editBtn);
        }

        if (asset.type === "splat") {
            const rigRow = document.createElement("div");
            Object.assign(rigRow.style, {
                background: "rgba(60,90,120,0.3)", border: "1px solid rgba(100,160,200,0.4)",
                borderRadius: "4px", padding: "8px 10px", marginBottom: "12px",
                display: "flex", alignItems: "center", gap: "8px",
            });
            const rigLabel = document.createElement("div");
            Object.assign(rigLabel.style, { fontSize: "11px", color: "#9bc", flex: "1" });
            const rigBtn = document.createElement("button");
            Object.assign(rigBtn.style, {
                background: "#345", color: "#cdf", border: "1px solid #567",
                borderRadius: "3px", padding: "4px 10px", cursor: "pointer", fontSize: "11px",
            });

            const _refreshRigDisplay = async () => {
                if (asset.rigId) {
                    // Look up the rig name from current list (cheap; list is in-memory)
                    let rigName = asset.rigId;
                    try {
                        const all = await window.assetLibrary.list({});
                        const r = all?.assets?.find(a => a.id === asset.rigId);
                        if (r) rigName = `${r.name} (${r.stats?.boneCount || "?"} bones)`;
                    } catch {}
                    rigLabel.textContent = "🦴 Rig: " + rigName;
                    rigBtn.textContent = "Unbind";
                } else {
                    rigLabel.textContent = "🦴 No rig bound";
                    rigBtn.textContent = "Bind...";
                }
            };
            _refreshRigDisplay();

            rigBtn.addEventListener("click", async () => {
                if (asset.rigId) {
                    if (!confirm("Unbind the current rig from this splat?")) return;
                    rigBtn.disabled = true;
                    try {
                        const r = await window.assetLibrary.bindRig(asset.id, null);
                        if (r?.error) alert("Unbind failed: " + r.error);
                        else { asset.rigId = null; await _refreshRigDisplay(); }
                    } catch (e) { alert("Unbind failed: " + e?.message); }
                    rigBtn.disabled = false;
                    return;
                }
                // Pick a rig from the library
                let rigs = [];
                try {
                    const all = await window.assetLibrary.list({ type: "rig" });
                    rigs = all?.assets || [];
                } catch (e) {}
                if (rigs.length === 0) {
                    alert("No rig assets in library. To create one, add an asset of type 'rig' with JSON body: { bones: [{ id, position: [x,y,z], parent: -1 }, ...] }");
                    return;
                }
                const choices = rigs.map((r, i) => `${i + 1}. ${r.name} (${r.stats?.boneCount || "?"} bones)`).join("\n");
                const sel = prompt(`Choose a rig to bind:\n\n${choices}\n\nEnter number (1–${rigs.length}):`);
                if (!sel) return;
                const idx = parseInt(sel, 10) - 1;
                if (!Number.isFinite(idx) || idx < 0 || idx >= rigs.length) { alert("Invalid selection"); return; }
                rigBtn.disabled = true;
                try {
                    const r = await window.assetLibrary.bindRig(asset.id, rigs[idx].id);
                    if (r?.error) alert("Bind failed: " + r.error);
                    else { asset.rigId = rigs[idx].id; await _refreshRigDisplay(); }
                } catch (e) { alert("Bind failed: " + e?.message); }
                rigBtn.disabled = false;
            });

            rigRow.appendChild(rigLabel);
            rigRow.appendChild(rigBtn);
            dlg.appendChild(rigRow);

            // v818 — Bind Clip (splat only, makes sense only once rig is bound).
            const clipRow = document.createElement("div");
            Object.assign(clipRow.style, {
                background: "rgba(80, 60, 120, 0.3)", border: "1px solid rgba(140,100,200,0.4)",
                borderRadius: "4px", padding: "8px 10px", marginBottom: "12px",
                display: "flex", alignItems: "center", gap: "8px",
            });
            const clipLabel = document.createElement("div");
            Object.assign(clipLabel.style, { fontSize: "11px", color: "#cab", flex: "1" });
            const clipBtn = document.createElement("button");
            Object.assign(clipBtn.style, {
                background: "#345", color: "#cdf", border: "1px solid #567",
                borderRadius: "3px", padding: "4px 10px", cursor: "pointer", fontSize: "11px",
            });

            const _refreshClipDisplay = async () => {
                if (asset.clipId) {
                    let clipName = asset.clipId;
                    try {
                        const all = await window.assetLibrary.list({});
                        const c = all?.assets?.find(a => a.id === asset.clipId);
                        if (c) clipName = `${c.name} (${c.stats?.duration?.toFixed(2) || "?"}s)`;
                    } catch {}
                    clipLabel.textContent = "🎬 Clip: " + clipName;
                    clipBtn.textContent = "Unbind";
                } else if (!asset.rigId) {
                    clipLabel.textContent = "🎬 (bind a rig first to add a clip)";
                    clipBtn.textContent = "—";
                    clipBtn.disabled = true;
                    clipBtn.style.opacity = "0.4";
                } else {
                    clipLabel.textContent = "🎬 No clip bound";
                    clipBtn.textContent = "Bind...";
                    clipBtn.disabled = false;
                    clipBtn.style.opacity = "1";
                }
            };
            _refreshClipDisplay();

            clipBtn.addEventListener("click", async () => {
                if (asset.clipId) {
                    if (!confirm("Unbind the current clip?")) return;
                    clipBtn.disabled = true;
                    try {
                        const r = await window.assetLibrary.bindClip(asset.id, null);
                        if (r?.error) alert("Unbind failed: " + r.error);
                        else { asset.clipId = null; await _refreshClipDisplay(); }
                    } catch (e) { alert("Unbind failed: " + e?.message); }
                    return;
                }
                if (!asset.rigId) return;
                let clips = [];
                try {
                    const all = await window.assetLibrary.list({ type: "clip" });
                    clips = all?.assets || [];
                } catch (e) {}
                if (clips.length === 0) {
                    alert("No clip assets in library. To create one, add an asset of type 'clip' with JSON body:\n\n{ duration: 2.0, bones: [{ id: 'spine', frames: [{ t: 0, position: [0,1,0] }, { t: 1, position: [2,1,0] }] }] }");
                    return;
                }
                const choices = clips.map((c, i) => `${i + 1}. ${c.name} (${c.stats?.duration?.toFixed(2) || "?"}s, ${c.stats?.boneCount || "?"} tracks)`).join("\n");
                const sel = prompt(`Choose a clip:\n\n${choices}\n\nEnter number (1–${clips.length}):`);
                if (!sel) return;
                const idx = parseInt(sel, 10) - 1;
                if (!Number.isFinite(idx) || idx < 0 || idx >= clips.length) { alert("Invalid selection"); return; }
                clipBtn.disabled = true;
                try {
                    const r = await window.assetLibrary.bindClip(asset.id, clips[idx].id);
                    if (r?.error) alert("Bind failed: " + r.error);
                    else { asset.clipId = clips[idx].id; await _refreshClipDisplay(); }
                } catch (e) { alert("Bind failed: " + e?.message); }
            });
            clipRow.appendChild(clipLabel);
            clipRow.appendChild(clipBtn);
            dlg.appendChild(clipRow);
        }

        // v804 — Download / export button. Fetches the stored data, builds
        // a Blob, triggers a browser download with original filename.
        const downloadBtn = document.createElement("button");
        downloadBtn.textContent = "💾 Download to disk";
        Object.assign(downloadBtn.style, {
            background: "rgba(120, 90, 180, 0.3)", color: "#cdf",
            border: "1px solid rgba(160,120,220,0.5)",
            borderRadius: "4px", padding: "8px 12px", cursor: "pointer",
            width: "100%", fontSize: "12px", marginBottom: "12px",
        });
        downloadBtn.addEventListener("click", async () => {
            downloadBtn.disabled = true;
            const orig = downloadBtn.textContent;
            downloadBtn.textContent = "Preparing...";
            try {
                const resp = await window.assetLibrary.get(asset.id);
                if (resp?.error) throw new Error(resp.error);
                let blob, ext;
                if (typeof resp.data === "object" && resp.data !== null) {
                    // JSON data (voxel)
                    ext = "json";
                    blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: "application/json" });
                } else if (typeof resp.data === "string" && resp.encoding === "base64") {
                    // Binary
                    ext = asset.dataExt || "bin";
                    const bin = atob(resp.data);
                    const bytes = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    blob = new Blob([bytes]);
                } else if (typeof resp.data === "string") {
                    // Text data
                    ext = asset.dataExt || "txt";
                    blob = new Blob([resp.data], { type: "text/plain" });
                } else {
                    throw new Error("unknown data format");
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${asset.name}.${ext}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                downloadBtn.textContent = "✓ Downloaded";
                setTimeout(() => downloadBtn.textContent = orig, 1500);
            } catch (e) {
                downloadBtn.textContent = "✗ " + e?.message;
                downloadBtn.style.background = "#a44";
                setTimeout(() => { downloadBtn.textContent = orig; downloadBtn.style.background = "rgba(120, 90, 180, 0.3)"; }, 2000);
            }
            downloadBtn.disabled = false;
        });
        dlg.appendChild(downloadBtn);

        const orientLabel = document.createElement("div");
        orientLabel.textContent = "Forward direction";
        Object.assign(orientLabel.style, { fontSize: "12px", color: "#9ab", marginBottom: "6px", fontWeight: "600" });
        dlg.appendChild(orientLabel);

        const opts = ["+x", "-x", "+y", "-y", "+z", "-z"];
        const grid = document.createElement("div");
        Object.assign(grid.style, { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", marginBottom: "10px" });
        for (const opt of opts) {
            const b = document.createElement("button");
            b.textContent = opt;
            const isCurrent = asset.orientation?.forward === opt;
            Object.assign(b.style, {
                background: isCurrent ? "rgba(90,200,255,0.4)" : "#234",
                color: "#cde", border: "1px solid " + (isCurrent ? "#7af" : "#456"),
                borderRadius: "4px", padding: "8px 0", cursor: "pointer",
                fontSize: "13px", fontFamily: "monospace",
            });
            b.addEventListener("click", async () => {
                await window.assetLibrary.orient(asset.id, { forward: opt, up: asset.orientation?.up || "+y" });
                document.body.removeChild(overlay);
                await this.refresh();
            });
            grid.appendChild(b);
        }
        dlg.appendChild(grid);

        // v805 — Tag management: show current tags as chips with X to remove,
        // input field to add new tags. Refreshes from server after each change.
        const tagSection = document.createElement("div");
        Object.assign(tagSection.style, { marginBottom: "10px" });
        const tagLabel = document.createElement("div");
        tagLabel.textContent = "Tags";
        Object.assign(tagLabel.style, { fontSize: "12px", color: "#9ab", marginBottom: "6px", fontWeight: "600" });
        tagSection.appendChild(tagLabel);
        const tagChipBox = document.createElement("div");
        Object.assign(tagChipBox.style, {
            display: "flex", flexWrap: "wrap", gap: "4px",
            padding: "6px", minHeight: "30px",
            background: "rgba(15,22,30,0.55)", borderRadius: "4px",
            border: "1px solid rgba(90,200,255,0.15)",
        });
        const renderTagChips = () => {
            tagChipBox.innerHTML = "";
            const tags = Array.isArray(asset.tags) ? asset.tags : [];
            if (tags.length === 0) {
                const empty = document.createElement("span");
                empty.textContent = "(no tags)";
                Object.assign(empty.style, { color: "#566", fontSize: "11px", fontStyle: "italic" });
                tagChipBox.appendChild(empty);
                return;
            }
            for (const t of tags) {
                const chip = document.createElement("span");
                Object.assign(chip.style, {
                    display: "inline-flex", alignItems: "center", gap: "3px",
                    background: "rgba(50,80,110,0.5)", color: "#cde",
                    border: "1px solid rgba(90,200,255,0.25)",
                    borderRadius: "10px", padding: "1px 4px 1px 8px", fontSize: "10.5px",
                });
                const txt = document.createElement("span");
                txt.textContent = t;
                chip.appendChild(txt);
                const x = document.createElement("button");
                x.textContent = "✕";
                Object.assign(x.style, {
                    background: "transparent", color: "#789", border: "none",
                    cursor: "pointer", fontSize: "10px", padding: "0 3px",
                });
                x.addEventListener("click", async () => {
                    try {
                        const r = await window.assetLibrary.tag(asset.id, t, "remove");
                        if (r?.ok) {
                            asset.tags = (asset.tags || []).filter(x => x !== t);
                            renderTagChips();
                            await this.refresh();
                        } else { alert("Remove failed: " + r?.error); }
                    } catch (e) { alert("Remove failed: " + e?.message); }
                });
                chip.appendChild(x);
                tagChipBox.appendChild(chip);
            }
        };
        renderTagChips();
        tagSection.appendChild(tagChipBox);

        const addTagRow = document.createElement("div");
        Object.assign(addTagRow.style, { display: "flex", gap: "4px", marginTop: "6px" });
        const addInput = document.createElement("input");
        addInput.type = "text";
        addInput.placeholder = "Add a tag (Enter to commit)";
        // v809 — autocomplete from all existing tags in the library
        const datalistId = `tag-suggest-${asset.id}`;
        addInput.setAttribute("list", datalistId);
        const datalist = document.createElement("datalist");
        datalist.id = datalistId;
        const allTags = new Set();
        for (const a of this._assets) {
            if (Array.isArray(a.tags)) for (const t of a.tags) if (t) allTags.add(t);
        }
        // Don't suggest tags this asset already has
        const currentTags = new Set(asset.tags || []);
        for (const t of [...allTags].sort()) {
            if (currentTags.has(t)) continue;
            const opt = document.createElement("option");
            opt.value = t;
            datalist.appendChild(opt);
        }
        addTagRow.appendChild(datalist);
        Object.assign(addInput.style, {
            flex: "1", padding: "4px 8px",
            background: "#1a2530", color: "#cde",
            border: "1px solid rgba(90,200,255,0.25)",
            borderRadius: "3px", fontSize: "11px",
            fontFamily: "inherit", boxSizing: "border-box",
        });
        const addBtn = document.createElement("button");
        addBtn.textContent = "+";
        Object.assign(addBtn.style, {
            background: "rgba(60,140,200,0.25)", color: "#cdf",
            border: "1px solid rgba(90,200,255,0.45)",
            borderRadius: "3px", padding: "0 12px", cursor: "pointer",
            fontSize: "13px",
        });
        const addTag = async () => {
            const t = addInput.value.trim();
            if (!t) return;
            try {
                const r = await window.assetLibrary.tag(asset.id, t, "add");
                if (r?.ok) {
                    if (!Array.isArray(asset.tags)) asset.tags = [];
                    if (!asset.tags.includes(t)) asset.tags.push(t);
                    addInput.value = "";
                    renderTagChips();
                    await this.refresh();
                } else { alert("Add failed: " + r?.error); }
            } catch (e) { alert("Add failed: " + e?.message); }
        };
        addBtn.addEventListener("click", addTag);
        addInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addTag(); });
        addTagRow.appendChild(addInput);
        addTagRow.appendChild(addBtn);
        tagSection.appendChild(addTagRow);
        dlg.appendChild(tagSection);

        // v807 — Notes / description (free text). Blurs to commit.
        const notesSection = document.createElement("div");
        Object.assign(notesSection.style, { marginBottom: "10px" });
        const notesLabel = document.createElement("div");
        notesLabel.textContent = "Notes";
        Object.assign(notesLabel.style, { fontSize: "12px", color: "#9ab", marginBottom: "6px", fontWeight: "600" });
        notesSection.appendChild(notesLabel);
        const notesArea = document.createElement("textarea");
        notesArea.value = asset.notes || "";
        notesArea.placeholder = "Description, source attribution, ideas, etc. — saves on blur.";
        Object.assign(notesArea.style, {
            width: "100%", minHeight: "50px", maxHeight: "120px",
            background: "#1a2530", color: "#cde",
            border: "1px solid rgba(90,200,255,0.25)",
            borderRadius: "4px", padding: "6px 8px",
            fontSize: "11.5px", fontFamily: "inherit", resize: "vertical",
            boxSizing: "border-box",
        });
        notesArea.addEventListener("blur", async () => {
            const newNotes = notesArea.value;
            if (newNotes === (asset.notes || "")) return;
            try {
                const r = await window.assetLibrary.note(asset.id, newNotes);
                if (r?.ok) { asset.notes = newNotes; }
                else { alert("Notes save failed: " + r?.error); }
            } catch (e) { alert("Notes save failed: " + e?.message); }
        });
        notesSection.appendChild(notesArea);
        dlg.appendChild(notesSection);

        // v807 — Duplicate button (clones asset with new id + " (copy)" name)
        const dupBtn = document.createElement("button");
        dupBtn.textContent = "⧉ Duplicate";
        Object.assign(dupBtn.style, {
            background: "rgba(80, 130, 90, 0.3)", color: "#cdf",
            border: "1px solid rgba(120,180,140,0.5)",
            borderRadius: "4px", padding: "8px 12px", cursor: "pointer",
            width: "100%", fontSize: "12px", marginBottom: "8px",
        });
        dupBtn.addEventListener("click", async () => {
            dupBtn.disabled = true;
            const orig = dupBtn.textContent;
            dupBtn.textContent = "Cloning...";
            try {
                const r = await window.assetLibrary.duplicate(asset.id);
                if (r?.meta) {
                    dupBtn.textContent = `✓ Cloned as ${r.meta.name}`;
                    await this.refresh();
                    setTimeout(() => { dupBtn.textContent = orig; dupBtn.disabled = false; }, 1500);
                } else {
                    dupBtn.textContent = "✗ " + (r?.error || "failed");
                    setTimeout(() => { dupBtn.textContent = orig; dupBtn.disabled = false; }, 1500);
                }
            } catch (e) {
                dupBtn.textContent = "✗ " + e?.message;
                setTimeout(() => { dupBtn.textContent = orig; dupBtn.disabled = false; }, 1500);
            }
        });
        dlg.appendChild(dupBtn);

        // v800 — retroactive auto-detect button. Reads the asset's data,
        // runs the heuristic, applies the suggested orientation.
        const autoBtn = document.createElement("button");
        autoBtn.textContent = "↻ Auto-detect from voxel data";
        Object.assign(autoBtn.style, {
            background: "rgba(60,140,200,0.25)", color: "#cdf",
            border: "1px solid rgba(90,200,255,0.45)",
            borderRadius: "4px", padding: "8px 12px", cursor: "pointer",
            width: "100%", fontSize: "12px", marginBottom: "8px",
        });
        autoBtn.addEventListener("click", async () => {
            autoBtn.disabled = true; autoBtn.textContent = "...";
            try {
                const resp = await window.assetLibrary.get(asset.id);
                if (resp?.error) { alert(resp.error); return; }
                if (!resp?.data?.voxels) { alert("Auto-detect only works for voxel assets (need .voxels in data)."); return; }
                const { autoDetectOrientation } = await import("../data/assetOrientation.js");
                const o = autoDetectOrientation(resp.data.voxels);
                if (!o) { alert("Too few voxels (<4) to analyze."); return; }
                await window.assetLibrary.orient(asset.id, { forward: o.forward, up: o.up });
                alert(`Set to ${o.forward} (${o.reasoning})`);
                document.body.removeChild(overlay);
                await this.refresh();
            } catch (e) { alert("Failed: " + e?.message); }
            autoBtn.disabled = false; autoBtn.textContent = "↻ Auto-detect from voxel data";
        });
        dlg.appendChild(autoBtn);

        const cancel = document.createElement("button");
        cancel.textContent = "Close";
        Object.assign(cancel.style, {
            background: "#345", color: "#9ab", border: "1px solid #567",
            borderRadius: "4px", padding: "6px 16px", cursor: "pointer",
            width: "100%", fontSize: "12px",
        });
        cancel.addEventListener("click", () => document.body.removeChild(overlay));
        dlg.appendChild(cancel);
        overlay.appendChild(dlg);
        overlay.addEventListener("click", (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
        document.body.appendChild(overlay);
    }

    /**
     * v800 — read a dropped File and add it to the library. Type
     * inferred from extension; orientation auto-detected for voxel JSON.
     */
    async _ingestFile(file) {
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        const name = file.name.replace(/\.[^.]+$/, "");
        let input;
        try {
            if (ext === "json") {
                const text = await file.text();
                const parsed = JSON.parse(text);
                let orientation = null;
                try {
                    const { autoDetectOrientation } = await import("../data/assetOrientation.js");
                    const voxels = parsed.voxels || parsed;
                    const o = autoDetectOrientation(voxels);
                    if (o) orientation = { forward: o.forward, up: o.up };
                } catch {}
                input = {
                    name, type: "voxel", source: "local",
                    data: parsed,
                    orientation,
                    tags: ["dropped", ext],
                };
            } else if (ext === "ply") {
                const buf = await file.arrayBuffer();
                const b64 = _bufToBase64(buf);
                input = { name, type: "splat", source: "local", dataBase64: b64, dataExt: "ply", tags: ["dropped"] };
            } else if (ext === "obj") {
                const text = await file.text();
                input = { name, type: "mesh", source: "local", data: text, dataExt: "obj", tags: ["dropped"] };
            } else if (["png", "jpg", "jpeg", "webp"].includes(ext)) {
                const buf = await file.arrayBuffer();
                const b64 = _bufToBase64(buf);
                input = { name, type: "image", source: "local", dataBase64: b64, dataExt: ext, tags: ["dropped"] };
            } else if (ext === "txt") {
                const text = await file.text();
                input = { name, type: "other", source: "local", data: text, dataExt: "txt", tags: ["dropped"] };
            } else {
                // Unknown extension — fall back to raw binary
                const buf = await file.arrayBuffer();
                const b64 = _bufToBase64(buf);
                input = { name, type: "other", source: "local", dataBase64: b64, dataExt: ext || "bin", tags: ["dropped"] };
            }
        } catch (e) {
            console.warn(`[AssetLibrary] couldn't parse ${file.name}:`, e?.message);
            throw e;
        }
        const r = await window.assetLibrary.add(input);
        if (r?.meta) {
            console.log(`[AssetLibrary] ingested '${r.meta.name}' as ${r.meta.id}` +
                (input.orientation ? ` (orient: ${input.orientation.forward})` : ""));
        }
        return r;
    }

    show() { this.root.style.display = "flex"; this.refresh(); }
    hide() { this.root.style.display = "none"; }
    toggle() { if (this.root.style.display === "none") this.show(); else this.hide(); }
}

export function installAssetLibraryPanelGlobal(opts) {
    if (typeof window === "undefined") return null;
    const panel = new AssetLibraryPanel(opts);
    window.assetLibraryPanel = panel;
    console.log("[AssetLibraryPanel] ready — window.assetLibraryPanel.show() / hide() / toggle()");
    return panel;
}

// v800 — browser-safe base64 encode for arbitrary ArrayBuffer.
// (Buffer doesn't exist in browser; can't use btoa directly on bytes.)
function _bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    const chunkSize = 0x8000;       // process in chunks so the call stack doesn't blow up on large files
    for (let i = 0; i < bytes.length; i += chunkSize) {
        bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(bin);
}

// v803 — minimal HTML escape for safe interpolation into innerHTML
function _escapeHtml(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// v807 — short relative-time format for list view's Date column.
function _relativeTime(ts) {
    if (!ts || typeof ts !== "number") return "—";
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60)              return Math.round(s) + "s";
    if (s < 3600)            return Math.round(s / 60) + "m";
    if (s < 86400)           return Math.round(s / 3600) + "h";
    if (s < 86400 * 7)       return Math.round(s / 86400) + "d";
    if (s < 86400 * 30)      return Math.round(s / (86400 * 7)) + "w";
    if (s < 86400 * 365)     return Math.round(s / (86400 * 30)) + "mo";
    return Math.round(s / (86400 * 365)) + "y";
}

// v808 — format type-specific stats for display ("12.4k verts", "240k splats")
function _formatNum(n) {
    if (n == null) return "?";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + "k";
    return String(n);
}
function _formatStats(asset) {
    const s = asset?.stats;
    if (!s) return null;
    if (asset.type === "voxel" && s.voxelCount != null) return `${_formatNum(s.voxelCount)} voxels`;
    if (asset.type === "mesh"  && s.vertexCount != null) {
        const verts = `${_formatNum(s.vertexCount)} verts`;
        return s.triCount ? `${verts}, ${_formatNum(s.triCount)} tris` : verts;
    }
    if (asset.type === "splat" && s.vertexCount != null) return `${_formatNum(s.vertexCount)} splats`;
    if (asset.type === "rig"   && s.boneCount   != null) {
        const roots = s.rootCount > 1 ? `, ${s.rootCount} roots` : "";
        return `${s.boneCount} bones${roots}`;
    }
    if (asset.type === "clip"  && s.duration    != null) {
        return `${s.duration.toFixed(2)}s, ${s.totalFrames || "?"} frames, ${s.boneCount} tracks`;
    }
    return null;
}
