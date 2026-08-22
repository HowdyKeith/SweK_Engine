// FILE: ui/ollamaPanel.js
// VERSION: v2 — round 159
//
// Side-edge LCARS minitab showing BOTH local AI services:
//
//   1. Ollama (LLM, default http://localhost:11434) — text/code models.
//      Used for narrative generation AND for OBJ (3D mesh) generation.
//      Each model row offers two assignment buttons so the user can pin
//      different models to each task: e.g. llama3.2 for narrative,
//      deepseek-coder or c3d for OBJ.

import { tierInfoForUtil } from "./activityTier.js";   // round 361
//
//   2. OllamaDiffuser (image, default http://localhost:8000) — image
//      diffusion models for textures + skyboxes. Each row offers a
//      single "Texture" assignment.
//
// Per-task choices persist in localStorage so they survive reloads:
//   voxelengine.ollamaModel        — narrative model (also default OBJ)
//   voxelengine.ollamaObjModel     — OBJ override (when distinct)
//   voxelengine.diffuserModel      — texture model
//
// Recommended-for-task badges: model names containing patterns like
// "code", "c3d", "cad" mark as "Recommended for OBJ". General-purpose
// chat patterns mark as "Recommended for narrative". The user is free
// to ignore them; recommendations are informational only.

const TASKS = {
    narrative: { label: "Narrative", color: "#6db9ff", title: "Use this model for narrative text" },
    obj:       { label: "OBJ",       color: "#ffd884", title: "Use this model for 3D mesh generation" },
    texture:   { label: "Texture",   color: "#ff8aff", title: "Use this image model for textures + skyboxes" },
};

export class OllamaPanel {
    constructor({ ollama, diffuser, installPanelRoot, embedded } = {}) {
        this.ollama = ollama;
        this.diffuser = diffuser ?? null;
        this._installPanelRoot = installPanelRoot ?? null;   // v682
        // v1531 — embedded mode: the standalone floating "AI MODELS" minitab+panel
        // is retired; this panel's _statusView is re-parented into Settings ->
        // AI Models ("Install Status" section). When embedded we still build all
        // the service sections + refresh logic, we just don't show the floating chrome.
        this._embedded = !!embedded;
        this._activeView = "status";                          // v682 — "status" | "install"

        // Per-service installed-model caches
        this._ollamaInstalled   = [];
        this._diffuserInstalled = [];
        this._ollamaState   = null;     // "offline" | "empty" | "models"
        this._diffuserState = null;
        // v334 — pipeline tools state ("offline" | "partial" | "online")
        this._pipelineState = null;
        this._lastPipelineStatus = null;

        this._probed = false;   // v1597 — panels stay idle until the user clicks Probe (no auto-probe on open)
        this._build();

        // v1531 — embedded: retire the floating chip. The panel element stays in
        // the DOM (hidden) but its _statusView gets re-parented into Settings.
        if (this._embedded) {
            try { if (this._tab) this._tab.style.display = "none"; } catch {}
            try { if (this._panel) this._panel.style.display = "none"; } catch {}
        }

        // v1597 — NO auto-refresh interval. Opening Settings -> AI Models (or the floating panel) now fires
        // zero probes; the user clicks "Probe services" (or a per-section ↻) to check status, detect the
        // GPU, and start live stats. This avoids CONNECTION_REFUSED spam + 2s GPU polling on every open.
        this._refreshInterval = null;
    }

    stop() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
            this._refreshInterval = null;
        }
    }

    _build() {
        const tab = document.createElement("div");
        this._tab = tab;   // v1531 — kept so embedded mode can hide the floating chip
        tab.className = "lcars-minitab edge-top color-yellow";
        // v670 — shifted right ~2 inches (was left: 720) per user spec.
        tab.style.top = "0";
        tab.style.left = "912px";
        tab.style.bottom = "auto";
        tab.textContent = "▼ AI MODELS";
        tab.title = "LLM + image model picker (per-task)";
        document.body.appendChild(tab);

        const panel = document.createElement("div");
        panel.className = "lcars-panel";
        Object.assign(panel.style, {
            position: "fixed",
            right: "60px",
            // v688 — was bottom:60. With INSTALL AI view attached the panel
            // grew tall and its top ran off the screen, hiding the AI STATUS
            // / INSTALL AI tab switcher. Anchor top instead with a viewport-
            // sized max-height + internal scroll so the switcher is always
            // visible at the top.
            top: "80px",
            maxHeight: "calc(100vh - 160px)",
            overflowY: "auto",
            overflowX: "hidden",
            width: "440px",
            zIndex: "9300",
            display: "none",
            pointerEvents: "auto",
        });

        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        header.textContent = "AI STATUS";   // v682 — was "AI MODELS — per-task picker"; reflects active view; flips to "INSTALL AI" when that view is selected
        panel.appendChild(header);
        this._header = header;

        // v682 — view switcher tabs are added later by attachInstallView()
        // since the InstallPanel doesn't exist when this constructor runs.

        // ---- AI STATUS view container (wraps everything that was here before)
        const statusView = document.createElement("div");
        this._statusView = statusView;
        panel.appendChild(statusView);

        // Round 159 — task legend so the colored buttons make sense
        const legend = document.createElement("div");
        legend.style.cssText = "padding:6px 10px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; gap:8px; font-size:9px; font-family:monospace;";
        for (const [taskKey, t] of Object.entries(TASKS)) {
            const chip = document.createElement("span");
            chip.style.cssText = `display:inline-block; padding:2px 6px; border-radius:8px;
                                  background:${t.color}33; color:${t.color}; border:1px solid ${t.color}88;`;
            chip.textContent = t.label;
            legend.appendChild(chip);
        }
        statusView.appendChild(legend);

        // v1597 — manual probe. Panels no longer auto-probe on open; the user clicks Probe to check
        // Ollama / diffuser / pipeline, detect the GPU (for the recommended pulls), and start live stats.
        const probeRow = document.createElement("div");
        probeRow.style.cssText = "padding:6px 10px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; gap:8px;";
        const probeBtn = document.createElement("button");
        probeBtn.textContent = "\u25b6 Probe services";
        probeBtn.style.cssText = "padding:3px 12px; background:#16261a; color:#9effb0; border:1px solid #2a6a3a; border-radius:4px; cursor:pointer; font-family:monospace; font-size:11px; font-weight:bold;";
        probeBtn.title = "Check Ollama / diffuser / pipeline, detect the GPU, and start live stats. Nothing probes until you click.";
        probeBtn.addEventListener("click", () => this._probeAll(probeBtn));
        this._probeBtn = probeBtn;
        probeRow.appendChild(probeBtn);
        const probeHint = document.createElement("span");
        probeHint.style.cssText = "font-family:monospace; font-size:9px; color:#7a8290;";
        probeHint.textContent = "idle until you probe \u2014 or use a section \u21bb";
        probeRow.appendChild(probeHint);
        statusView.appendChild(probeRow);

        // v920 — local LLM backend (dialect) toggle. Ollama native /api/* vs
        // LlamaStash / OpenAI-compatible /v1/*. Mirrors the SETTINGS hub control
        // (same persisted voxelengine.llmDialect via OllamaClient.setDialect).
        const dialectRow = document.createElement("div");
        dialectRow.style.cssText = "padding:6px 10px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; gap:6px; align-items:center; font-size:10px; font-family:monospace;";
        const dlabel = document.createElement("span");
        dlabel.textContent = "LLM backend:"; dlabel.style.cssText = "color:#9ab;";
        dialectRow.appendChild(dlabel);
        const mkDialectBtn = (key, text) => {
            const b = document.createElement("button");
            b.textContent = text;
            const isOn = () => ((this.ollama?.getDialect?.() ?? "ollama") === key);
            b._paint = () => { b.style.cssText = `padding:2px 8px; border-radius:6px; cursor:pointer; font-size:10px; border:1px solid ${isOn() ? "#6db9ff" : "#345"}; background:${isOn() ? "rgba(109,185,255,0.2)" : "#1a2230"}; color:${isOn() ? "#cde" : "#89a"};`; };
            b._paint();
            b.addEventListener("click", () => {
                this.ollama?.setDialect?.(key);
                dialectRow.querySelectorAll("button").forEach(x => x._paint && x._paint());
                this._refresh("ollama");
            });
            return b;
        };
        dialectRow.appendChild(mkDialectBtn("ollama", "Ollama"));
        dialectRow.appendChild(mkDialectBtn("openai", "LlamaStash"));
        this._repaintDialect = () => dialectRow.querySelectorAll("button").forEach(x => x._paint && x._paint());
        statusView.appendChild(dialectRow);

        // ---- Ollama section ----
        this._ollamaSection = this._buildServiceSection(statusView, {
            title:     "OLLAMA — text/code",
            baseUrl:   this.ollama?.baseUrl ?? "(no client)",
            services:  ["narrative", "obj"],
            onRefresh: () => this._refresh("ollama"),
        });
        // v1594 — one-click "pull the model your GPU/Mac can run" (VRAM/unified-memory gated).
        // v1597 — on build, render only the free-text pull box (no GPU probe); picks load on Probe.
        try { this._populateOllamaReco(false); } catch (e) {}

        // ---- Diffuser section ----
        this._diffuserSection = this._buildServiceSection(statusView, {
            title:     "OLLAMA-DIFFUSER — images",
            baseUrl:   this.diffuser?.baseUrl ?? "(no client)",
            services:  ["texture"],
            onRefresh: () => this._refresh("diffuser"),
        });

        // ---- v334: Pipeline tools section ----
        this._pipelineSection = this._buildPipelineToolsSection(statusView);

        // ---- Round 164: Live system stats ----
        this._statsSection = this._buildStatsSection(statusView);

        // ---- INSTALL AI view container is added later by attachInstallView() ----

        document.body.appendChild(panel);
        this._panel = panel;

        // Hover-open with 250ms close grace
        let closeTimer = null;
        const open = () => {
            if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
            this._panel.style.display = "block";
            this._repaintDialect && this._repaintDialect();
            // v1597 — don't auto-probe on open; only resume if the user already probed this session.
            if (this._probed) { this._refresh(); this._startStatsPoll(); }
        };
        const closeSoon = () => {
            if (closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                this._panel.style.display = "none";
                this._stopStatsPoll();
                closeTimer = null;
            }, 250);
        };
        tab.addEventListener("mouseenter", open);
        tab.addEventListener("mouseleave", closeSoon);
        panel.addEventListener("mouseenter", open);
        panel.addEventListener("mouseleave", closeSoon);
        tab.addEventListener("click", () => {
            if (this._panel.style.display === "block") {
                this._panel.style.display = "none";
                this._stopStatsPoll();
            } else open();
        });
    }

    // v682 — toggle between AI STATUS and INSTALL AI views.
    _setView(key) {
        this._activeView = key;
        if (this._statusView)  this._statusView.style.display  = (key === "status")  ? "block" : "none";
        if (this._installView) this._installView.style.display = (key === "install") ? "block" : "none";
        if (this._header) this._header.textContent = (key === "install") ? "INSTALL AI" : "AI STATUS";
        // v688 — LCARS-accent (#9cf on black) for the active tab so it visually
        // matches the lcars-panel-header band above it.
        const on  = { background: "#9cf", color: "#000" };
        const off = { background: "transparent", color: "#cde" };
        if (this._statusTab) {
            Object.assign(this._statusTab.style,  key === "status"  ? on : off);
            this._statusTab._isActive  = (key === "status");
        }
        if (this._installTab) {
            Object.assign(this._installTab.style, key === "install" ? on : off);
            this._installTab._isActive = (key === "install");
        }
    }

    // v682 — attach an InstallPanel root AFTER OllamaPanel has been built.
    // Builds the tab-bar (AI STATUS | INSTALL AI) and install-view container
    // on demand, since OllamaPanel mounts early in main.js before InstallPanel
    // exists. Idempotent: calling twice is a no-op.
    attachInstallView(installPanelRoot) {
        if (this._installView) return;          // already attached
        if (!installPanelRoot || !this._panel) return;
        this._installPanelRoot = installPanelRoot;

        // v688 — LCARS-themed tab bar. Matches the .lcars-panel-header
        // accent (#9cf) and the engine's Antonio uppercase typography so it
        // doesn't look like a generic dark-mode tab strip.
        const tabBar = document.createElement("div");
        Object.assign(tabBar.style, {
            display: "flex", gap: "0",
            borderBottom: "2px solid #9cf",
            background: "rgba(0,0,0,0.35)",
        });
        const mkViewTab = (key, label) => {
            const t = document.createElement("div");
            t.textContent = label;
            Object.assign(t.style, {
                flex: "1", textAlign: "center", padding: "6px 10px",
                cursor: "pointer", fontSize: "11px",
                fontFamily: '"Antonio","Helvetica Neue","Helvetica","Arial Narrow",sans-serif',
                fontWeight: "700",
                letterSpacing: "0.18em", textTransform: "uppercase",
                userSelect: "none",
                color: "#cde", background: "transparent",
                borderRight: "1px solid rgba(156,204,255,0.18)",
                transition: "background 0.12s ease, color 0.12s ease",
            });
            t.addEventListener("mouseenter", () => {
                if (!t._isActive) t.style.background = "rgba(156,204,255,0.10)";
            });
            t.addEventListener("mouseleave", () => {
                if (!t._isActive) t.style.background = "transparent";
            });
            t.addEventListener("click", () => this._setView(key));
            return t;
        };
        this._statusTab  = mkViewTab("status",  "AI STATUS");
        this._installTab = mkViewTab("install", "INSTALL AI");
        this._installTab.style.borderRight = "none";
        tabBar.appendChild(this._statusTab);
        tabBar.appendChild(this._installTab);

        // Insert the tab bar AFTER the header (which is the panel's first child).
        // statusView (added next in _build) is currently the second child.
        // After insertion: [header, tabBar, statusView].
        if (this._header && this._header.nextSibling) {
            this._panel.insertBefore(tabBar, this._header.nextSibling);
        } else {
            this._panel.appendChild(tabBar);
        }

        // Install-view container
        const installView = document.createElement("div");
        this._installView = installView;
        try {
            installPanelRoot.style.position = "static";
            installPanelRoot.style.right = "auto";
            installPanelRoot.style.bottom = "auto";
            installPanelRoot.style.left = "auto";
            installPanelRoot.style.top = "auto";
            installPanelRoot.style.width = "100%";
            installPanelRoot.style.display = "block";
        } catch {}
        installView.appendChild(installPanelRoot);
        this._panel.appendChild(installView);
        installView.style.display = "none";

        this._setView("status");
    }

    _buildStatsSection(parent) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "border-top:1px solid rgba(255,255,255,0.10); padding:8px 10px;";

        const head = document.createElement("div");
        head.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:6px;";
        const title = document.createElement("span");
        title.style.cssText = "font-family:monospace; font-size:11px; font-weight:bold; color:#fff; letter-spacing:0.05em;";
        title.textContent = "LIVE STATS";
        head.appendChild(title);
        // v361 — activity tier chip (replaces the EKG-style heartbeat
        // ticker that pulsed every 2s). Tier is computed from GPU util.
        // Three tiers: rocking (idle), walking (moderate), sprinting (heavy).
        const tierChip = document.createElement("span");
        tierChip.style.cssText = "padding:2px 8px; border-radius:8px; font-size:9px; font-family:monospace; letter-spacing:1px; background:rgba(50,50,50,0.35); color:#666;";
        tierChip.textContent = "—";
        tierChip.title = "GPU activity tier (replaces v360's polling ticker)";
        head.appendChild(tierChip);
        wrap.appendChild(head);

        const body = document.createElement("div");
        body.style.cssText = "font-family:monospace; font-size:10px; color:#aaa; line-height:1.5;";
        body.innerHTML = "(open the panel to start polling)";
        wrap.appendChild(body);

        parent.appendChild(wrap);
        return { wrap, body, tierChip };
    }

    _startStatsPoll() {
        if (this._statsTimer) return;
        const tick = async () => {
            try {
                const r = await fetch("/system/stats", { cache: "no-cache" });
                const j = await r.json();
                this._renderStats(j);
            } catch (e) {
                this._renderStats(null, e?.message);
            }
        };
        tick();
        this._statsTimer = setInterval(tick, 2000);
    }
    _stopStatsPoll() {
        if (this._statsTimer) { clearInterval(this._statsTimer); this._statsTimer = null; }
    }

    _renderStats(j, err) {
        if (!this._statsSection) return;
        const body = this._statsSection.body;
        const chip = this._statsSection.tierChip;
        body.innerHTML = "";

        if (err || !j) {
            body.innerHTML = `<span style='color:#ff8a8a;'>bridge unreachable: ${err || "no data"}</span>`;
            // v361 — chip shows "—" on bridge error
            if (chip) {
                const t = tierInfoForUtil(null);
                chip.textContent = t.glyph + " " + t.label;
                chip.style.color = t.color;
                chip.style.background = t.bg;
            }
            return;
        }

        // v361 — update activity tier chip from GPU util
        if (chip) {
            const utilPct = (j.gpu && Number.isFinite(j.gpu.utilPct)) ? j.gpu.utilPct : null;
            const t = tierInfoForUtil(utilPct);
            chip.textContent = `${t.glyph} ${t.label}`;
            chip.style.color = t.color;
            chip.style.background = t.bg;
            chip.title = utilPct === null
                ? "GPU activity tier — no signal (CPU only or nvidia-smi missing)"
                : `GPU activity tier — ${t.description} (util ${utilPct}%)`;
        }

        // GPU row
        const gpu = j.gpu;
        const gpuRow = document.createElement("div");
        if (gpu) {
            const memPct = Math.round((gpu.memUsedMB / Math.max(1, gpu.memTotalMB)) * 100);
            const utilColor = gpu.utilPct > 80 ? "#ff8a8a" : gpu.utilPct > 30 ? "#ffd884" : "#8aff9e";
            const tempColor = gpu.tempC > 80 ? "#ff8a8a" : gpu.tempC > 70 ? "#ffd884" : "#aaa";
            gpuRow.innerHTML = `
                <span style='color:#6db9ff;'>${gpu.name}</span> ·
                util <span style='color:${utilColor};font-weight:bold;'>${gpu.utilPct}%</span> ·
                vram <span style='color:#ddd;'>${gpu.memUsedMB}/${gpu.memTotalMB}MB</span>
                <span style='opacity:0.6;'>(${memPct}%)</span> ·
                <span style='color:${tempColor};'>${gpu.tempC}°C</span>
            `;
        } else {
            gpuRow.innerHTML = `<span style='color:#888;'>GPU: ${j.gpuError || "no nvidia-smi (CPU-only or non-NVIDIA)"}</span>`;
        }
        body.appendChild(gpuRow);

        // Ollama loaded models
        const models = j.ollamaModels;
        if (models && models.length > 0) {
            for (const m of models) {
                const row = document.createElement("div");
                const where = m.on_gpu
                    ? `<span style='color:#8aff9e;'>GPU (${(m.size_vram/1e9).toFixed(1)}GB)</span>`
                    : `<span style='color:#ffd884;'>CPU</span>`;
                row.innerHTML = `<span style='opacity:0.55;'>↳</span> ${m.name} → ${where}`;
                body.appendChild(row);
            }
        } else if (models) {
            const row = document.createElement("div");
            row.style.color = "#666";
            row.textContent = "↳ ollama: no models currently loaded";
            body.appendChild(row);
        } else {
            const row = document.createElement("div");
            row.style.color = "#666";
            row.textContent = "↳ ollama unreachable";
            body.appendChild(row);
        }

        // Diffuser (spawned-by-bridge state)
        const d = j.diffuser;
        if (d?.running) {
            const row = document.createElement("div");
            row.innerHTML = `<span style='opacity:0.55;'>↳</span> diffuser → <span style='color:#ff8aff;'>running</span> ${d.model ? `(${d.model}, pid ${d.pid})` : ""}`;
            body.appendChild(row);
        }

        // Round 170 — ComfyUI (Trellis 2 host for image-to-3D)
        const c = j.comfyui;
        if (c) {
            const row = document.createElement("div");
            if (c.reachable) {
                const ramTxt = (c.ram_free_gb != null && c.ram_total_gb != null)
                    ? `${c.ram_free_gb}/${c.ram_total_gb}GB RAM free` : "";
                const verTxt = c.comfyui_version ? `v${c.comfyui_version}` : "";
                row.innerHTML = `<span style='opacity:0.55;'>↳</span> comfyui → <span style='color:#8aff9e;'>online</span> ${verTxt} <span style='opacity:0.55;'>${ramTxt}</span>`;
            } else {
                row.innerHTML = `<span style='opacity:0.55;'>↳</span> comfyui → <span style='color:#888;'>offline</span> <span style='opacity:0.5;'>(start: python main.py --listen)</span>`;
            }
            body.appendChild(row);
        }
    }

    // Build a service section (Ollama or Diffuser). Returns refs to its
    // sub-elements so _refresh* can update them later.
    // v1597 — explicit probe: check all services, load the GPU-gated picks, start live stats. Called by
    // the "Probe services" button (and re-callable as "Re-probe"). Nothing here runs automatically on open.
    _probeAll(btn) {
        this._probed = true;
        if (btn) { btn.textContent = "\u25b6 probing\u2026"; setTimeout(() => { btn.textContent = "\u21bb Re-probe"; }, 1200); }
        this._refresh();
        try { this._populateOllamaReco(true); } catch (e) {}
        try { this._startStatsPoll(); } catch (e) {}
    }

    // v1594 — fetch the GPU/Mac advisor's VRAM-gated Ollama picks and render one-click pull buttons.
    // v1597 — only fetch /install/gpu when probe===true; the free-text pull box always shows.
    async _populateOllamaReco(probe = false) {
        const s = this._ollamaSection;
        if (!s || !s.recoEl) return;
        const el = s.recoEl;
        el.innerHTML = "";
        el.style.display = "block";
        // Recommended buttons (only on an explicit probe, and only if the advisor returns picks).
        if (probe) try {
            const g = await fetch("/install/gpu").then(r => r.json());
            const o = g && g.recommend && g.recommend.ollama;
            const tags = (o && o.tags) || [];
            if (o && tags.length) {
                const isApple = (g.vendor === "Apple");
                const where = g.gpu ? (g.gpu + (g.vramGb ? " \u00b7 " + g.vramGb + "GB" + (isApple ? " unified" : "") : "")) : "this machine";
                const lbl = document.createElement("div");
                lbl.style.cssText = "font-family:monospace; font-size:10px; color:#c8a6ff; padding:2px 0 5px;";
                lbl.textContent = "\u2b50 Fits " + where + " \u2014 " + (o.tier || "");
                el.appendChild(lbl);
                const btnRow = document.createElement("div");
                btnRow.style.cssText = "display:flex; flex-wrap:wrap; gap:6px;";
                tags.forEach((tag) => {
                    const b = document.createElement("button");
                    b.textContent = "\u2b07 " + tag;
                    b.style.cssText = "padding:3px 8px; background:#1a1030; color:#d8c4ff; border:1px solid #4a3a6a; border-radius:4px; cursor:pointer; font-family:monospace; font-size:10px;";
                    b.title = "ollama pull " + tag;
                    b.addEventListener("click", () => this._pullOllama(tag, b));
                    btnRow.appendChild(b);
                });
                el.appendChild(btnRow);
                const note = document.createElement("div");
                note.style.cssText = "font-family:monospace; font-size:9px; color:#7a8290; padding:5px 0 0;";
                note.textContent = (o.note || "") + " Already-installed tags finish instantly.";
                el.appendChild(note);
            }
        } catch (e) { /* advisor offline - still show the free-text box below */ }
        // v1596 — free-text "pull any tag" box (always shown, even with no advisor / offline GPU probe).
        const pullRow = document.createElement("div");
        pullRow.style.cssText = "display:flex; gap:6px; align-items:center; padding:7px 0 0;";
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "pull any tag, e.g. mistral-small:24b";
        input.style.cssText = "flex:1; min-width:0; padding:3px 6px; background:#0c0c14; color:#cde; border:1px solid #3a3a55; border-radius:4px; font-family:monospace; font-size:10px;";
        const pullBtn = document.createElement("button");
        pullBtn.textContent = "\u2b07 Pull";
        pullBtn.style.cssText = "flex:0 0 auto; padding:3px 10px; background:#16261a; color:#9effb0; border:1px solid #2a6a3a; border-radius:4px; cursor:pointer; font-family:monospace; font-size:10px;";
        const doPull = () => {
            const tag = (input.value || "").trim();
            if (!tag) { input.focus(); return; }
            this._pullOllama(tag, pullBtn, { reset: true });
        };
        pullBtn.addEventListener("click", doPull);
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doPull(); } });
        pullRow.appendChild(input);
        pullRow.appendChild(pullBtn);
        el.appendChild(pullRow);
    }

    // v1594 — stream Ollama /api/pull progress through the bridge and update the button live.
    // v1596 — opts.reset restores the button after completion (for the reusable free-text Pull button).
    async _pullOllama(tag, btn, opts = {}) {
        if (btn._pulling) return;
        btn._pulling = true; btn.disabled = true;
        const origText = btn.textContent, origCss = btn.style.cssText;
        btn.textContent = "pulling " + tag + "\u2026";
        try {
            const resp = await fetch("/ollama/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: tag }) });
            if (!resp.ok || !resp.body) {
                let err = "HTTP " + resp.status;
                try { const j = await resp.json(); if (j && j.error) err = j.error; } catch {}
                throw new Error(err);
            }
            const reader = resp.body.getReader();
            const dec = new TextDecoder();
            let buf = "", sawErr = "";
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n"); buf = lines.pop();
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const j = JSON.parse(line);
                        if (j.error) { sawErr = String(j.error); }
                        else if (j.status) {
                            let pct = "";
                            if (j.total && j.completed) pct = " " + Math.round(j.completed / j.total * 100) + "%";
                            btn.textContent = String(j.status).slice(0, 20) + pct;
                        }
                    } catch {}
                }
            }
            if (sawErr) throw new Error(sawErr);
            btn.textContent = "\u2713 " + tag;
            btn.style.background = "#0a2a14"; btn.style.borderColor = "#2a6a3a"; btn.style.color = "#9effb0";
            this._refresh("ollama");
            if (opts.reset) setTimeout(() => { btn.textContent = origText; btn.style.cssText = origCss; }, 3500);
        } catch (e) {
            btn.textContent = "\u2717 " + tag + " \u2014 see Ollama";
            btn.title = String(e && (e.message || e));
            btn.style.background = "#2a0a0a"; btn.style.borderColor = "#6a2a2a"; btn.style.color = "#ff9e9e";
            if (opts.reset) setTimeout(() => { btn.textContent = origText; btn.style.cssText = origCss; btn.title = ""; }, 5000);
        } finally {
            btn.disabled = false; btn._pulling = false;
        }
    }

    _buildServiceSection(parent, { title, baseUrl, services, onRefresh }) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "border-bottom:1px solid rgba(255,255,255,0.10);";

        const head = document.createElement("div");
        head.style.cssText = "display:flex; align-items:center; gap:8px; padding:8px 10px;";
        const titleEl = document.createElement("span");
        titleEl.style.cssText = "font-family:monospace; font-size:11px; font-weight:bold; color:#fff; letter-spacing:0.05em;";
        titleEl.textContent = title;
        head.appendChild(titleEl);
        const pill = document.createElement("span");
        pill.style.cssText = "display:inline-block; padding:2px 8px; border-radius:8px; font-size:10px; font-family:monospace; background:#444; color:#aaa;";
        pill.textContent = "idle \u2014 Probe";
        head.appendChild(pill);
        const url = document.createElement("span");
        url.style.cssText = "font-family:monospace; font-size:9px; opacity:0.5;";
        url.textContent = baseUrl;
        head.appendChild(url);
        const refreshBtn = document.createElement("button");
        refreshBtn.textContent = "↻";
        refreshBtn.style.cssText = "margin-left:auto; background:transparent; border:1px solid rgba(255,255,255,0.2); color:#ddd; border-radius:3px; padding:0 6px; cursor:pointer;";
        refreshBtn.addEventListener("click", onRefresh);
        head.appendChild(refreshBtn);
        wrap.appendChild(head);

        // v1594 — recommended-models slot (populated only for the Ollama section, via _populateOllamaReco).
        const recoEl = document.createElement("div");
        recoEl.style.cssText = "padding:2px 10px 6px;";
        recoEl.style.display = "none";
        wrap.appendChild(recoEl);

        const currentRow = document.createElement("div");
        currentRow.style.cssText = "padding:4px 10px 8px; font-size:11px; font-family:monospace;";
        wrap.appendChild(currentRow);

        const listEl = document.createElement("div");
        listEl.style.cssText = "max-height:200px; overflow-y:auto;";
        wrap.appendChild(listEl);

        parent.appendChild(wrap);
        return { wrap, pill, currentRow, listEl, recoEl, services };
    }

    async _refresh(only) {
        if (!only || only === "ollama")   await this._refreshOllama();
        if (!only || only === "diffuser") await this._refreshDiffuser();
        if (!only || only === "pipeline") await this._refreshPipelineTools();
    }

    async _refreshOllama() {
        const s = this._ollamaSection;
        if (!this.ollama) {
            this._setPill(s.pill, "no client", "#666", "#222");
            return;
        }
        this._setPill(s.pill, "probing…", "#ffd884", "#3a2a00");
        const models = await this.ollama.listModels();
        if (models === null) {
            this._ollamaInstalled = [];
            this._ollamaState = "offline";
            this._setPill(s.pill, "offline", "#ff8a8a", "#3a0000");
            this._renderOllamaOffline();
            return;
        }
        if (models.length === 0) {
            this._ollamaInstalled = [];
            this._ollamaState = "empty";
            this._setPill(s.pill, "0 models", "#ffd884", "#3a2a00");
            this._renderOllamaEmpty();
            return;
        }
        this._ollamaInstalled = models;
        this._ollamaState = "models";
        this._setPill(s.pill, `${models.length} model${models.length === 1 ? "" : "s"}`, "#8aff9e", "#003a14");
        this._renderOllamaModels();
    }

    async _refreshDiffuser() {
        const s = this._diffuserSection;
        if (!this.diffuser) {
            this._setPill(s.pill, "no client", "#666", "#222");
            return;
        }
        this._setPill(s.pill, "probing…", "#ffd884", "#3a2a00");
        // First confirm reachability — diffuser has /api/health
        const reachable = await this.diffuser.probe();
        if (!reachable) {
            this._diffuserInstalled = [];
            this._diffuserState = "offline";
            this._setPill(s.pill, "offline", "#ff8a8a", "#3a0000");
            this._renderDiffuserOffline();
            return;
        }
        const models = await this.diffuser.listModels();
        if (!models || models.length === 0) {
            // Reachable but no /api/models endpoint — diffuser is running
            // a default model that wasn't listed. Show that fact.
            this._diffuserInstalled = [];
            this._diffuserState = "models";    // "single default"
            this._setPill(s.pill, "ready", "#8aff9e", "#003a14");
            this._renderDiffuserSingleDefault();
            return;
        }
        this._diffuserInstalled = models;
        this._diffuserState = "models";
        this._setPill(s.pill, `${models.length} model${models.length === 1 ? "" : "s"}`, "#8aff9e", "#003a14");
        this._renderDiffuserModels();
    }

    // ---- Ollama renderers ----

    _renderOllamaOffline() {
        this._ollamaSection.currentRow.innerHTML = `
            <span style="color:#ff8a8a;">daemon not reachable.</span>
            <span style="opacity:0.6;">Start: <code style="color:#5eff8a;">OLLAMA_ORIGINS=* ollama serve</code></span>
        `;
        this._ollamaSection.listEl.innerHTML = "";
    }
    _renderOllamaEmpty() {
        this._ollamaSection.currentRow.innerHTML = `
            <span style="color:#ffd884;">daemon up — no models pulled.</span>
            <span style="opacity:0.6;">Try: <code style="color:#5eff8a;">ollama pull llama3.2</code></span>
        `;
        this._ollamaSection.listEl.innerHTML = "";
    }
    _renderOllamaModels() {
        const s = this._ollamaSection;
        const installedNames = this._ollamaInstalled.map(m => m.name);
        const narrCurrent = this.ollama.model;
        const objCurrent  = this.ollama.objModel || this.ollama.model;

        // Build "current assignments" header
        s.currentRow.innerHTML = "";
        const summary = document.createElement("div");
        summary.style.cssText = "display:flex; gap:14px; flex-wrap:wrap; font-size:10px;";
        summary.innerHTML = `
            <span><span style="color:${TASKS.narrative.color};">Narrative:</span> <b style="color:#fff;">${escapeHTML(narrCurrent)}</b></span>
            <span><span style="color:${TASKS.obj.color};">OBJ:</span> <b style="color:#fff;">${escapeHTML(objCurrent)}</b></span>
        `;
        s.currentRow.appendChild(summary);

        // Recommendations
        const recNarr = this.ollama.recommendModelFor?.("narrative", installedNames);
        const recObj  = this.ollama.recommendModelFor?.("obj",       installedNames);

        s.listEl.innerHTML = "";
        for (const m of this._ollamaInstalled) {
            const row = this._buildModelRow(m, {
                isAssigned: {
                    narrative: m.name === narrCurrent,
                    obj:       m.name === objCurrent,
                },
                isRecommended: {
                    narrative: m.name === recNarr,
                    obj:       m.name === recObj,
                },
                services: s.services,
                onAssign: (taskKey) => {
                    if (taskKey === "narrative") this.ollama.setModel(m.name);
                    if (taskKey === "obj")       this.ollama.setObjModel(m.name);
                    this._renderOllamaModels();
                    console.log(`[OllamaPanel] ${taskKey} → ${m.name}`);
                },
            });
            s.listEl.appendChild(row);
        }
    }

    // ---- Diffuser renderers ----

    _renderDiffuserOffline() {
        // Round 163 — offer a one-click launch button via the bridge.
        // The bridge's POST /diffuser/launch finds ollamadiffuser.exe in
        // common install paths (incl. the Python store path the user has)
        // and spawns it with `run <model>`.
        const s = this._diffuserSection;
        s.currentRow.innerHTML = "";
        const top = document.createElement("div");
        top.innerHTML = `<span style="color:#ff8a8a;">diffuser not reachable at ${this.diffuser?.baseUrl ?? '(no url)'}.</span>`;
        s.currentRow.appendChild(top);

        const row = document.createElement("div");
        row.style.cssText = "display:flex; gap:6px; align-items:center; margin-top:6px;";
        const modelSel = document.createElement("select");
        modelSel.style.cssText = "background:#111; color:#fff; border:1px solid #444; padding:2px 4px; font-family:monospace; font-size:10px;";
        // Discovered models go in here once we fetch /diffuser/config
        const defaultOptions = [
            "stable-diffusion-1.5",
            "flux.1-schnell",
            "flux.1-dev-gguf-q4ks",
        ];
        for (const m of defaultOptions) {
            const opt = document.createElement("option");
            opt.value = m; opt.textContent = m;
            modelSel.appendChild(opt);
        }
        row.appendChild(modelSel);

        const btn = document.createElement("button");
        btn.textContent = "Start diffuser";
        btn.style.cssText = "background:#003a14; color:#8aff9e; border:1px solid #8aff9e88; padding:3px 10px; border-radius:4px; cursor:pointer; font-family:monospace; font-size:10px;";
        btn.addEventListener("click", async () => {
            btn.disabled = true; btn.textContent = "starting…";
            try {
                const r = await fetch("/diffuser/launch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ model: modelSel.value }),
                });
                const j = await r.json();
                if (j.ok) {
                    btn.textContent = `started (pid ${j.pid})`;
                    // Round 165 — poll every 5s for up to 5 minutes.
                    // Flux models can take 60-120s to load weights;
                    // the old 3-shot schedule (5s/30s/60s) missed slow
                    // first-loads. Stops as soon as the diffuser
                    // becomes reachable.
                    this._beginDiffuserStartupPolling();
                } else {
                    btn.textContent = "failed: " + (j.error || "?");
                    btn.disabled = false;
                }
            } catch (e) {
                btn.textContent = "bridge unreachable";
                btn.disabled = false;
            }
        });
        row.appendChild(btn);
        s.currentRow.appendChild(row);

        const hint = document.createElement("div");
        hint.style.cssText = "margin-top:6px; opacity:0.55; font-size:9px;";
        hint.textContent = "Loading SD 1.5 weights takes ~30s on first run. Flux models can take 60-120s.";
        s.currentRow.appendChild(hint);

        s.listEl.innerHTML = "";

        // Populate model dropdown with what's actually installed
        this._populateInstalledDiffuserModels(modelSel);
    }
    async _populateInstalledDiffuserModels(selectEl) {
        try {
            const r = await fetch("/diffuser/config");
            const j = await r.json();
            if (j.ok && Array.isArray(j.models) && j.models.length > 0) {
                const prev = selectEl.value;
                selectEl.innerHTML = "";
                for (const m of j.models) {
                    const opt = document.createElement("option");
                    opt.value = m; opt.textContent = m;
                    selectEl.appendChild(opt);
                }
                // Pre-select the most recently used one if config reports it
                if (j.current && j.models.includes(j.current)) selectEl.value = j.current;
                else if (j.models.includes(prev)) selectEl.value = prev;
            }
        } catch {}
    }

    // Round 165 — after clicking Start, poll the diffuser every 5s for
    // up to 5 minutes waiting for /api/health to come up. Flux models
    // can spend 60-120s loading on first run; the old 3-shot schedule
    // missed late readiness, so the panel kept showing "offline" while
    // generation actually worked. Cancels itself when the diffuser
    // section's state becomes "models" (reachable).
    _beginDiffuserStartupPolling() {
        if (this._diffuserStartupTimer) return;
        const POLL_INTERVAL_MS = 5000;
        const MAX_WAIT_MS = 5 * 60 * 1000;
        const started = Date.now();
        const tick = async () => {
            await this._refreshDiffuser();
            const elapsed = Date.now() - started;
            // Stop once the diffuser is reachable OR we've waited too long.
            if (this._diffuserState === "models" || elapsed > MAX_WAIT_MS) {
                clearInterval(this._diffuserStartupTimer);
                this._diffuserStartupTimer = null;
            }
        };
        this._diffuserStartupTimer = setInterval(tick, POLL_INTERVAL_MS);
        // First poll immediately so user isn't waiting the full interval
        setTimeout(tick, 1000);
    }
    _renderDiffuserSingleDefault() {
        // Reachable but no model list — show that the diffuser is using
        // its server-side default, with a hint about how to expose more.
        this._diffuserSection.currentRow.innerHTML = `
            <span style="color:#8aff9e;">reachable</span>,
            <span style="opacity:0.7;">using server's default pipeline</span>
            <span style="opacity:0.55; display:block; margin-top:4px; font-size:10px;">
                The diffuser didn't expose a /api/models list, so the engine uses
                whatever is loaded server-side. If your build supports multiple
                models, expose them via /api/models or /api/tags.
            </span>
        `;
        this._diffuserSection.listEl.innerHTML = "";
    }
    _renderDiffuserModels() {
        const s = this._diffuserSection;
        const cur = this.diffuser.model;
        s.currentRow.innerHTML = "";
        const summary = document.createElement("div");
        summary.style.cssText = "font-size:10px;";
        summary.innerHTML = `<span style="color:${TASKS.texture.color};">Texture:</span> <b style="color:#fff;">${escapeHTML(cur || "(server default)")}</b>`;
        s.currentRow.appendChild(summary);

        s.listEl.innerHTML = "";
        for (const m of this._diffuserInstalled) {
            const row = this._buildModelRow(m, {
                isAssigned:     { texture: m.name === cur },
                isRecommended:  { texture: false },
                services:       s.services,
                onAssign: (taskKey) => {
                    if (taskKey === "texture") this.diffuser.setModel(m.name);
                    this._renderDiffuserModels();
                    console.log(`[OllamaPanel] texture → ${m.name}`);
                },
            });
            s.listEl.appendChild(row);
        }
    }

    // ---- shared row builder ----

    _buildModelRow(model, { isAssigned, isRecommended, services, onAssign }) {
        const row = document.createElement("div");
        row.style.cssText = `
            display:flex; align-items:center; gap:6px;
            padding:5px 10px;
            border-top:1px solid rgba(255,255,255,0.04);
            font-family:monospace; font-size:11px;
        `;
        // Name + size
        const nameWrap = document.createElement("div");
        nameWrap.style.cssText = "flex:1; min-width:0;";
        const name = document.createElement("div");
        name.style.cssText = "color:#ddd; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
        name.textContent = model.name;
        nameWrap.appendChild(name);
        if (model.size) {
            const sz = document.createElement("div");
            sz.style.cssText = "font-size:9px; opacity:0.5;";
            sz.textContent = this._fmtSize(model.size);
            nameWrap.appendChild(sz);
        }
        row.appendChild(nameWrap);

        // Per-task assignment buttons
        const btns = document.createElement("div");
        btns.style.cssText = "display:flex; gap:4px;";
        for (const taskKey of services) {
            const t = TASKS[taskKey];
            const assigned = isAssigned?.[taskKey];
            const recommended = isRecommended?.[taskKey];
            const btn = document.createElement("button");
            btn.textContent = t.label + (recommended ? " ★" : "");
            btn.title = (recommended ? "Recommended for this task. " : "") + t.title;
            const bg = assigned ? t.color : "transparent";
            const fg = assigned ? "#000" : t.color;
            const border = recommended ? `2px solid ${t.color}` : `1px solid ${t.color}88`;
            btn.style.cssText = `
                background:${bg}; color:${fg}; border:${border};
                padding:2px 8px; border-radius:10px;
                font-family:monospace; font-size:10px; font-weight:${assigned ? "bold" : "normal"};
                cursor:${assigned ? "default" : "pointer"};
            `;
            if (!assigned) {
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onAssign(taskKey);
                });
            }
            btns.appendChild(btn);
        }
        row.appendChild(btns);
        return row;
    }

    // ----- v334: Pipeline tools section --------------------------------------
    //
    // Surfaces server-side asset-pipeline tools (voxelizers, mesh
    // generators, refine) in one glanceable section. Each row shows:
    // tool name, version/path detail, and a colored status pill
    // (green ✓ online, red ✗ offline, gray ? unknown).
    //
    // Polls /asset-pipeline/status — response shape:
    //   {
    //     cuda_voxelizer: { found, path, version, reason },
    //     mesh_to_vox:    { found, path, version, reason },
    //     ultrashape:     { found, repoDir, python, reason },
    //     meshGenerators: { [name]: { found, repoDir, python, reason } },
    //     comfyUrl,
    //     voxOutDir,
    //   }
    //
    // Refresh fires on _refresh() / panel-open / 30s poll interval.

    _buildPipelineToolsSection(parent) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "border-top:1px solid rgba(255,255,255,0.10); padding:8px 10px;";

        // Header row: title + status pill + refresh button
        const head = document.createElement("div");
        head.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:6px;";
        const title = document.createElement("span");
        title.style.cssText = "font-family:monospace; font-size:11px; font-weight:bold; color:#fff; letter-spacing:0.05em; flex:1;";
        title.textContent = "PIPELINE TOOLS — server-side";
        head.appendChild(title);

        const pill = document.createElement("span");
        pill.style.cssText = "padding:1px 6px; font-family:monospace; font-size:9px; border-radius:8px; background:#222; color:#666;";
        pill.textContent = "unknown";
        head.appendChild(pill);

        const refreshBtn = document.createElement("button");
        refreshBtn.style.cssText = "padding:1px 6px; background:#1a1a1a; color:#aaa; border:1px solid #444; border-radius:3px; cursor:pointer; font-family:monospace; font-size:9px;";
        refreshBtn.textContent = "↻";
        refreshBtn.title = "Re-poll /asset-pipeline/status";
        refreshBtn.addEventListener("click", () => this._refresh("pipeline"));
        head.appendChild(refreshBtn);

        wrap.appendChild(head);

        // Body — populated by _refreshPipelineTools
        const body = document.createElement("div");
        body.style.cssText = "font-family:monospace; font-size:10px; color:#aaa; line-height:1.6;";
        body.innerHTML = "<span style='color:#666'>(refreshing…)</span>";
        wrap.appendChild(body);

        parent.appendChild(wrap);
        return { wrap, head, pill, body, refreshBtn };
    }

    async _refreshPipelineTools() {
        const s = this._pipelineSection;
        if (!s) return;
        this._setPill(s.pill, "probing…", "#ffd884", "#3a2a00");

        let j;
        try {
            const r = await fetch("/asset-pipeline/status", { cache: "no-store" });
            if (!r.ok) throw new Error("HTTP " + r.status);
            j = await r.json();
        } catch (e) {
            this._pipelineState = "offline";
            this._lastPipelineStatus = null;
            this._setPill(s.pill, "bridge offline", "#ff8a8a", "#3a0000");
            s.body.innerHTML =
                `<span style='color:#888'>` +
                `Asset-pipeline bridge unreachable. Start the bridge ` +
                `(<code>node server.js</code> in the asset-pipeline ` +
                `directory) and click ↻ to retry.` +
                `</span>`;
            return;
        }

        this._lastPipelineStatus = j;

        // Build rows. Order: voxelizers → mesh generators → refine → comfy.
        const rows = [];
        rows.push(this._pipelineRow("cuda_voxelizer", j.cuda_voxelizer, "v"));
        rows.push(this._pipelineRow("mesh_to_vox",    j.mesh_to_vox,    "v"));
        const gens = j.meshGenerators ?? {};
        for (const [name, g] of Object.entries(gens)) {
            rows.push(this._pipelineRow(name, g, "py"));
        }
        rows.push(this._pipelineRow("ultrashape", j.ultrashape, "py"));

        // ComfyUI is just a URL — no found/not-found, but we can ping
        // the URL to see if reachable. Lightweight: just show URL for now.
        if (j.comfyUrl) {
            const url = j.comfyUrl;
            rows.push(
                `<div style='display:flex; align-items:center; gap:6px;'>` +
                `<span style='color:#fff; min-width:110px;'>comfyUrl</span>` +
                `<span style='flex:1; color:#aaa; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'>${escapeHTML(url)}</span>` +
                `<span style='padding:0 4px; border-radius:6px; background:#222; color:#888; font-size:9px;'>set</span>` +
                `</div>`
            );
        }

        s.body.innerHTML = rows.join("");

        // Aggregate state
        const total = 2 + Object.keys(gens).length + 1;     // voxelizers + gens + ultrashape
        const ok = [j.cuda_voxelizer, j.mesh_to_vox, j.ultrashape, ...Object.values(gens)]
            .filter(t => t?.found).length;
        if (ok === 0) {
            this._pipelineState = "offline";
            this._setPill(s.pill, "0/" + total + " ready", "#ff8a8a", "#3a0000");
        } else if (ok < total) {
            this._pipelineState = "partial";
            this._setPill(s.pill, `${ok}/${total} ready`, "#ffd884", "#3a2a00");
        } else {
            this._pipelineState = "online";
            this._setPill(s.pill, "all ready", "#8aff9e", "#003a14");
        }
    }

    /** Render one tool row: name + version/path + status pill. */
    _pipelineRow(name, info, versionKey) {
        if (!info) {
            return (
                `<div style='display:flex; align-items:center; gap:6px;'>` +
                `<span style='color:#fff; min-width:110px;'>${escapeHTML(name)}</span>` +
                `<span style='flex:1; color:#666;'>—</span>` +
                `<span style='padding:0 4px; border-radius:6px; background:#222; color:#666; font-size:9px;'>missing</span>` +
                `</div>`
            );
        }
        const found = !!info.found;
        const detail = found
            ? (info.path ? this._shortenPath(info.path) :
               info.repoDir ? this._shortenPath(info.repoDir) : "")
            : (info.reason ?? "not detected");
        const versionStr = found && info.version ? ` v${info.version}` : "";
        const pillColor = found ? "#8aff9e" : "#ff8a8a";
        const pillBg    = found ? "#003a14" : "#3a0000";
        const pillText  = found ? "✓" : "✗";
        return (
            `<div style='display:flex; align-items:center; gap:6px;' title='${escapeHTML(detail)}${escapeHTML(versionStr)}'>` +
            `<span style='color:#fff; min-width:110px;'>${escapeHTML(name)}</span>` +
            `<span style='flex:1; color:${found ? "#aaa" : "#888"}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'>${escapeHTML(detail + versionStr)}</span>` +
            `<span style='padding:0 4px; border-radius:6px; background:${pillBg}; color:${pillColor}; font-size:9px;'>${pillText}</span>` +
            `</div>`
        );
    }

    /** Trim a long absolute path to fit in the row. Keeps the leaf
     *  and a hint of the parent folder. */
    _shortenPath(p) {
        if (!p) return "";
        if (p.length <= 50) return p;
        const parts = p.split(/[\\/]/);
        const last2 = parts.slice(-2).join("/");
        return ".../" + last2;
    }

    _setPill(pill, text, fg, bg) {
        if (!pill) return;
        pill.textContent = text;
        pill.style.color = fg;
        pill.style.background = bg;
    }

    _fmtSize(bytes) {
        if (!bytes) return "";
        const gb = bytes / 1e9;
        if (gb >= 1) return gb.toFixed(1) + "G";
        const mb = bytes / 1e6;
        return mb.toFixed(0) + "M";
    }
}

function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
}
