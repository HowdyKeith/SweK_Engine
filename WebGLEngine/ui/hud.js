// FILE: ui/hud.js
// VERSION: v4 - existing rows preserved + audio volume sub-component (round 38)

// v1561 — map open-meteo WMO weather codes to a STATUS-line label/icon/color.
function wmoCondition(code) {
    if (code == null || isNaN(code)) return { word: "\u2014", icon: "?", color: "#ccc" };
    code = +code;
    if (code === 0) return { word: "CLEAR", icon: "\u2600", color: "#ff9" };
    if (code <= 2) return { word: "PARTLY CLOUDY", icon: "\u26C5", color: "#dd9" };
    if (code === 3) return { word: "CLOUDY", icon: "\u2601", color: "#ccc" };
    if (code <= 48) return { word: "FOG", icon: "\uD83C\uDF2B", color: "#bbb" };
    if (code <= 57) return { word: "DRIZZLE", icon: "\uD83C\uDF26", color: "#7af" };
    if (code <= 67) return { word: "RAIN", icon: "\u2614", color: "#7af" };
    if (code <= 77) return { word: "SNOW", icon: "\u2744", color: "#fff" };
    if (code <= 82) return { word: "SHOWERS", icon: "\uD83C\uDF27", color: "#7af" };
    if (code <= 86) return { word: "SNOW", icon: "\u2744", color: "#fff" };
    return { word: "STORM", icon: "\u26A1", color: "#f9f" };
}

export class HUD {

    constructor() {
        // Round 43f — single Status panel at top-left holds everything:
        // FPS, CHUNKS + tiny chunk-grid heatmap, mode/weather/combat
        // rows. The top-center is fully reserved for the OGRE HUD.

        // No top-center bar in this round.
        this._statusBar = null;

        const cells = {};
        this._statusCells = cells;

        // === Detail panel (mode/weather/combat) — LCARS themed ===
        // Round 43f - bottom-left, won't cover demo button. Contains
        // FPS + CHUNKS cells + chunk-grid heatmap + mode/weather/combat.
        // Top-center remains reserved for OGRE HUD when active.
        //
        // Round 263 — moved ~1.5" right (left: 60 → 200) per user
        // feedback; previously overlapped with adjacent UI. Now also
        // minimizable via a tab on the bottom edge.
        const detail = document.createElement("div");
        detail.className = "lcars-panel";
        Object.assign(detail.style, {
            top: "auto",
            bottom: "68px",
            left: "104px",
            minWidth: "260px",
            maxWidth: "360px",
            zIndex: "9090",
            pointerEvents: "auto",   // need clicks for minimize button
        });
        const detailHeader = document.createElement("div");
        detailHeader.className = "lcars-panel-header";
        const detailTitle = document.createElement("div");
        detailTitle.textContent = "Status";
        detailHeader.appendChild(detailTitle);
        const detailHeaderId = document.createElement("div");
        detailHeaderId.className = "lcars-panel-header-id";
        // v335 — show engine version instead of static H-01 so testers
        // can confirm at a glance which zip they're running. Falls back
        // to "H-01" if main.js hasn't set window.ENGINE_VERSION yet.
        detailHeaderId.textContent = (typeof window !== "undefined" && window.ENGINE_VERSION)
            ? window.ENGINE_VERSION
            : "H-01";
        detailHeader.appendChild(detailHeaderId);
        // Round 265 — minimize button. Click hides the body + footer +
        // shows a small bottom-edge restore tab. Persists state to
        // localStorage so reloads remember the user's choice.
        const minBtn = document.createElement("div");
        minBtn.textContent = "—";
        minBtn.title = "Minimize STATUS";
        Object.assign(minBtn.style, {
            marginLeft: "8px",
            cursor: "pointer",
            opacity: "0.75",
            padding: "0 6px",
            fontWeight: "bold",
            fontSize: "14px",
            userSelect: "none",
        });
        minBtn.addEventListener("mouseenter", () => minBtn.style.opacity = "1");
        minBtn.addEventListener("mouseleave", () => minBtn.style.opacity = "0.75");
        detailHeader.appendChild(minBtn);
        detail.appendChild(detailHeader);
        this.headerEl = detailHeader;   // v1559 — exposed so the peer radar can dock into the STATUS title bar

        const detailBody = document.createElement("div");
        detailBody.className = "lcars-panel-body";
        const detailBar = document.createElement("div");
        detailBar.className = "lcars-panel-bar";
        detailBody.appendChild(detailBar);
        const detailContent = document.createElement("div");
        detailContent.className = "lcars-panel-content";
        detailContent.style.fontSize = "11px";
        detailContent.style.lineHeight = "1.45";

        // FPS + CHUNKS row + chunk-grid heatmap, inline at top of the
        // panel content. Updates each frame from update().
        const perfRow = document.createElement("div");
        Object.assign(perfRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "6px",
            paddingBottom: "6px",
            borderBottom: "1px solid rgba(255, 153, 0, 0.25)",
        });
        const fpsBlock = document.createElement("div");
        fpsBlock.innerHTML = `<span style="opacity:0.55;font-size:9px;letter-spacing:0.1em">FPS</span> <span style="color:#fc9;font-weight:700" id="hud-fps-val">--</span>`;
        const chunkBlock = document.createElement("div");
        chunkBlock.innerHTML = `<span style="opacity:0.55;font-size:9px;letter-spacing:0.1em">CHUNKS</span> <span style="color:#fc9;font-weight:700" id="hud-chunks-val">--</span>`;
        const chunkCanvas = document.createElement("canvas");
        chunkCanvas.width = 24;
        chunkCanvas.height = 24;
        Object.assign(chunkCanvas.style, {
            display: "inline-block",
            verticalAlign: "middle",
            imageRendering: "pixelated",
            background: "#0a0a0a",
            border: "1px solid rgba(255, 153, 0, 0.3)",
            borderRadius: "2px",
            width: "24px",
            height: "24px",
            marginLeft: "auto",
        });
        chunkCanvas.title = "Loaded chunks heatmap - center cell = camera position";
        perfRow.appendChild(fpsBlock);
        perfRow.appendChild(chunkBlock);
        perfRow.appendChild(chunkCanvas);
        // v1561 — 2-column STATUS body: a LEFT column holds the FPS/CHUNKS, CPU/GPU/MEM and util
        // rows (so they no longer stretch the full panel width), and the peer radar fills a RIGHT
        // column ~4 rows tall. The full-width title bar sits above both.
        const hudLeftCol = document.createElement("div");
        Object.assign(hudLeftCol.style, { flex: "1 1 auto", minWidth: "0", display: "flex", flexDirection: "column" });
        const radarSlot = document.createElement("div");
        Object.assign(radarSlot.style, { flex: "0 0 auto", display: "flex", alignItems: "flex-start" });
        this.radarSlot = radarSlot;
        const topGrid = document.createElement("div");
        Object.assign(topGrid.style, { display: "flex", alignItems: "flex-start", gap: "8px" });
        topGrid.appendChild(hudLeftCol); topGrid.appendChild(radarSlot);
        perfRow.style.flex = ""; perfRow.style.minWidth = "0";
        hudLeftCol.appendChild(perfRow);
        detailContent.appendChild(topGrid);
        this._hudLeftCol = hudLeftCol;
        this._chunkCanvas = chunkCanvas;
        this._chunkCtx = chunkCanvas.getContext("2d");
        this._fpsValEl    = fpsBlock.querySelector("#hud-fps-val");
        this._chunksValEl = chunkBlock.querySelector("#hud-chunks-val");

        // Round 263c — CPU / GPU / MEM row, sourced from window.systemPerf.
        // CPU = avg frame time vs 16.67ms target, capped 0-1
        // GPU = EXT_disjoint_timer_query (Chromium+supporting GPU only); else "—"
        // MEM = JS heap (Chromium only) + Ollama/ComfyUI bridge totals when available
        const sysRow = document.createElement("div");
        Object.assign(sysRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "6px",
            paddingBottom: "6px",
            borderBottom: "1px solid rgba(255, 153, 0, 0.20)",
            fontSize: "10px",
        });
        const labelStyle = `opacity:0.55;font-size:9px;letter-spacing:0.1em`;
        const valStyle   = `color:#fc9;font-weight:700`;
        sysRow.innerHTML =
            `<div><span style="${labelStyle}">CPU</span> <span style="${valStyle}" id="hud-cpu-val">--</span></div>` +
            `<div><span style="${labelStyle}">GPU</span> <span style="${valStyle}" id="hud-gpu-val">--</span></div>` +
            `<div><span style="${labelStyle}">MEM</span> <span style="${valStyle};display:inline-block;min-width:48px" id="hud-mem-val">--</span></div>`;
        this._hudLeftCol.appendChild(sysRow);
        this._cpuValEl = sysRow.querySelector("#hud-cpu-val");
        this._gpuValEl = sysRow.querySelector("#hud-gpu-val");
        this._memValEl = sysRow.querySelector("#hud-mem-val");

        // v1572 — LINKED row: peer/sync status moved here from the floating bottom-right badge.
        const linkRow = document.createElement("div");
        Object.assign(linkRow.style, { fontSize: "10px", marginBottom: "6px", paddingBottom: "6px", borderBottom: "1px solid rgba(255,153,0,0.20)" });
        linkRow.innerHTML = `<span style="${labelStyle}">LINKED</span> <span style="${valStyle}" id="hud-linked-val">\u2014</span>`;
        this._hudLeftCol.appendChild(linkRow);
        this._linkedValEl = linkRow.querySelector("#hud-linked-val");
        this.setLinked = (text, color) => { if (!this._linkedValEl) return; this._linkedValEl.textContent = text || "\u2014"; if (color) this._linkedValEl.style.color = color; };

        // v1579 - PIPELINE row (moved here from the floating top-center "pipeline idle" pill).
        // Click toggles the Live Pipeline panel. Fed by setPipeline() from the observer poll.
        const pipeRow = document.createElement("div");
        Object.assign(pipeRow.style, { fontSize: "10px", marginBottom: "6px", paddingBottom: "6px", borderBottom: "1px solid rgba(255,153,0,0.20)", cursor: "pointer" });
        pipeRow.title = "Live AI pipeline state \u2014 click to show / hide the Live Pipeline panel";
        pipeRow.innerHTML = `<span style="${labelStyle}">PIPELINE</span> <span style="${valStyle}" id="hud-pipe-val">\u2014</span>`;
        this._hudLeftCol.appendChild(pipeRow);
        this._pipeValEl = pipeRow.querySelector("#hud-pipe-val");
        this.setPipeline = (html, color) => { if (!this._pipeValEl) return; this._pipeValEl.innerHTML = html || "\u2014"; if (color) this._pipeValEl.style.color = color; };
        pipeRow.addEventListener("click", () => { try { const h = window.livePipeline && window.livePipeline.hud; if (!h || !h.element) return; const vis = (h.element.style.opacity === "1"); if (vis) h.hide(); else { h.show(); if (h.setExpanded) h.setExpanded(true); } } catch {} });

        // Round 263c — VOICE / WORKERS / BRIDGE row. Consolidates the
        // three free-floating bottom-left badges into the STATUS panel
        // per user feedback ("this will go into the STATUS panel").
        // The existing free-floating badges are hidden in main.js after
        // construction — their click-to-expand detail panels still work
        // when triggered by these rows.
        const utilRow = document.createElement("div");
        Object.assign(utilRow.style, {
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "6px",
            paddingBottom: "6px",
            borderBottom: "1px solid rgba(255, 153, 0, 0.20)",
            fontSize: "10px",
            cursor: "default",
        });
        utilRow.innerHTML =
            `<div><span style="${labelStyle}">🎤</span> <span style="${valStyle}" id="hud-voice-val">off</span></div>` +
            `<div><span style="${labelStyle}">🧠</span> <span style="${valStyle}" id="hud-workers-val">--</span></div>` +
            `<div><span style="${labelStyle}">📡</span> <span style="${valStyle}" id="hud-bridge-val">--</span></div>`;
        this._hudLeftCol.appendChild(utilRow);
        this._voiceValEl   = utilRow.querySelector("#hud-voice-val");
        this._workersValEl = utilRow.querySelector("#hud-workers-val");
        this._bridgeValEl  = utilRow.querySelector("#hud-bridge-val");

        // Content area for mode/weather/combat rows — written to via
        // this.el.innerHTML further down.
        const detailContentRest = document.createElement("div");
        this._hudLeftCol.appendChild(detailContentRest);   // v1574 — weather/combat rows now in the LEFT column so the radar spans down to the weather line

        detailBody.appendChild(detailContent);
        detail.appendChild(detailBody);

        const detailFooter = document.createElement("div");
        detailFooter.className = "lcars-panel-footer";
        detail.appendChild(detailFooter);

        document.body.appendChild(detail);
        try { this.root = detail; } catch {}   // v1972 — expose so clean-boot can collapse the STATUS panel
        this._detailContent = detailContent;
        // Back-compat: code elsewhere writes this.el.innerHTML; route it
        // to the inner section below the perf row.
        this.el = detailContentRest;
        // v1644 — delegate clicks on the weather "set location" affordance (the row rebuilds its innerHTML each
        // frame, so a fresh child handler won't survive; delegate from the stable content element instead).
        try {
            this.el.addEventListener("click", (e) => {
                const t = (e.target && e.target.closest) ? e.target.closest(".swekWxSet") : null;
                if (t) { try { e.preventDefault(); e.stopPropagation(); } catch {} this._promptSetLocation(); }
            });
        } catch {}

        // v1561 — live weather (open-meteo) for the STATUS weather line. Reads units + lat/lon from
        // localStorage (set in Settings -> Weather). Falls back to the sim weather if unconfigured.
        this._liveWx = null;
        this._fetchLiveWx = () => {
            try {
                const lat = parseFloat(localStorage.getItem("voxelengine.wxLat") || "");
                const lon = parseFloat(localStorage.getItem("voxelengine.wxLon") || "");
                if (!isFinite(lat) || !isFinite(lon)) { this._liveWx = null; return; }
                const unit = (localStorage.getItem("voxelengine.wxUnit") || "f").toLowerCase() === "c" ? "celsius" : "fahrenheit";
                const u = "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
                    "&current=temperature_2m,relative_humidity_2m,weather_code&temperature_unit=" + unit;
                fetch(u).then(r => r.json()).then(j => {
                    const c = j && j.current; if (!c) return;
                    this._liveWx = { code: c.weather_code, temp: Math.round(c.temperature_2m),
                        unit: unit === "celsius" ? "C" : "F", humidity: Math.round(c.relative_humidity_2m), ts: Date.now() };
                }).catch(() => {});
            } catch {}
        };
        try { this._fetchLiveWx(); } catch {}
        try { this._wxTimer = setInterval(() => { try { this._fetchLiveWx(); } catch {} }, 10 * 60 * 1000); } catch {}

        // v1734 - publish our weather location to peers, or adopt one from a peer if we have none (Round C #9). Manual
        // entry always wins - this only fills in a blank. Lazy dynamic import keeps it off the hud's critical path.
        try {
            import("./peerLocation.js").then((m) => m.syncLocationWithPeers({
                getLocal: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
                setLocal: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
                fetchJson: (u) => fetch(u, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
                postJson: (u, b) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => null),
                onAdopt: () => { try { this._fetchLiveWx(); } catch {} },
            })).catch(() => {});
        } catch {}

        // Round 265 — minimize wiring. Build a bottom-edge LCARS tab
        // that restores the panel. State persists in localStorage. The
        // tab is colored "yellow" (the same as the STATUS panel's
        // borrow-from-orange palette) and lives at left:140px so it
        // doesn't collide with the Toast Test tab at left:20px.
        const STATUS_MIN_KEY = "voxelengine.statusMinimized";
        const restoreTab = document.createElement("div");
        restoreTab.className = "lcars-minitab edge-bottom color-yellow";
        restoreTab.style.bottom = "0";
        restoreTab.style.left = "140px";
        restoreTab.style.top = "auto";
        restoreTab.textContent = "▲ STATUS";
        restoreTab.title = "Restore STATUS panel";
        restoreTab.style.display = "none";
        document.body.appendChild(restoreTab);

        const applyMinimized = (collapsed) => {
            if (collapsed) {
                // v444 — hide the ENTIRE panel (header included), not just its
                // body, so minimizing leaves a single "▲ STATUS" tab instead
                // of a collapsed header bar AND a restore tab (two chips).
                detail.style.display = "none";
                restoreTab.style.display = "block";
            } else {
                detail.style.display = "";
                detailBody.style.display = "";
                detailFooter.style.display = "";
                minBtn.style.display = "";
                restoreTab.style.display = "none";
            }
        };
        const setMinimized = (val) => {
            try { localStorage.setItem(STATUS_MIN_KEY, val ? "1" : "0"); } catch {}
            applyMinimized(val);
        };
        minBtn.addEventListener("click", (e) => { e.stopPropagation(); setMinimized(true); });
        restoreTab.addEventListener("click", () => setMinimized(false));
        // Initial state from localStorage
        try {
            const stored = localStorage.getItem(STATUS_MIN_KEY);
            if (stored === "1") applyMinimized(true);
        } catch {}

        // Round 38 — separate volume panel below HUD. Pointer events on
        // this child only, so the rest of HUD remains click-through.
        this._buildVolumePanel();
    }

    _buildVolumePanel() {
        // Round 42 — full LCARS theme. Two elements: a separate minitab
        // (on the left edge) shown when collapsed, and the proper panel
        // when expanded. Header pill block + side-bar + content matches
        // dockSystem's chrome so all UI feels uniform.

        const panel = document.createElement("div");
        panel.className = "lcars-panel";
        Object.assign(panel.style, {
            top: "120px",
            left: "12px",
            width: "240px",
            zIndex: "9100",
        });

        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        header.style.cursor = "pointer";
        const title = document.createElement("div");
        title.textContent = "Audio";
        header.appendChild(title);
        const headerId = document.createElement("div");
        headerId.className = "lcars-panel-header-id";
        headerId.textContent = "A-04";
        header.appendChild(headerId);
        panel.appendChild(header);

        const bodyWrap = document.createElement("div");
        bodyWrap.className = "lcars-panel-body";
        const bar = document.createElement("div");
        bar.className = "lcars-panel-bar";
        bodyWrap.appendChild(bar);
        const body = document.createElement("div");
        body.className = "lcars-panel-content";
        bodyWrap.appendChild(body);
        panel.appendChild(bodyWrap);

        const footer = document.createElement("div");
        footer.className = "lcars-panel-footer";
        panel.appendChild(footer);

        // The minitab — shown only when panel is collapsed.
        // v683 — moved from top:120 (hidden behind dock tabs HOME/KAGGLE/SHIELD)
        // to bottom edge BELOW LISTENER (which is at bottom:280). AUDIO at
        // bottom:220 sits one slot lower than LISTENER.
        const minitab = document.createElement("div");
        minitab.className = "lcars-minitab edge-left";
        minitab.textContent = "▲ Audio";
        minitab.style.top = "auto";
        minitab.style.bottom = "220px";

        const STORE_KEY = "voxelengine.audioPanelCollapsed";
        const stored = localStorage.getItem(STORE_KEY);
        let collapsed = (stored === null) ? true : (stored === "1");
        const apply = () => {
            panel.style.display = collapsed ? "none" : "block";
            minitab.style.display = collapsed ? "block" : "none";
            try { localStorage.setItem(STORE_KEY, collapsed ? "1" : "0"); } catch {}
        };
        header.addEventListener("click", () => {
            collapsed = true; apply();
        });
        minitab.addEventListener("click", () => {
            collapsed = false; apply();
        });

        const addSlider = (label, defaultVal, setterName) => {
            const row = document.createElement("div");
            row.className = "lcars-row";

            const lbl = document.createElement("span");
            lbl.className = "lcars-label";
            lbl.textContent = label;

            const slider = document.createElement("input");
            slider.type = "range";
            slider.className = "lcars-slider";
            slider.min = "0";
            slider.max = "100";
            slider.value = String(defaultVal);

            const val = document.createElement("span");
            val.className = "lcars-value";
            val.textContent = String(defaultVal);

            slider.addEventListener("input", () => {
                val.textContent = slider.value;
                const am = window.audioManager;
                if (am && typeof am[setterName] === "function") {
                    am[setterName](parseInt(slider.value, 10) / 100);
                }
            });
            row.append(lbl, slider, val);
            body.appendChild(row);
        };

        addSlider("MASTER",  92, "setMasterVolume");
        addSlider("SFX",     85, "setSFXVolume");
        addSlider("AMBIENT", 45, "setAmbientVolume");

        apply();

        document.body.appendChild(panel);
        document.body.appendChild(minitab);
        this._volumePanel = panel;
        this._volumeMinitab = minitab;
        try { minitab.style.display = "none"; } catch (e) {}   // v1974 — AUDIO moved to the bottom-left icon rail; the 🔊 icon owns this panel now
    }

    update(data) {

        // HARD GUARD (prevents crashes if data is missing fields)
        const fps = data?.fps ?? 0;
        const chunks = data?.chunks ?? 0;
        const pos = data?.pos ?? { x: 0, y: 0, z: 0 };
        const mode = data?.mode ?? "observer";
        const weather = data?.weather ?? "clear";
        const timeOfDay = data?.timeOfDay ?? "—";

        // Round 43f - perf row inside Status panel
        if (this._fpsValEl)    this._fpsValEl.textContent    = String(fps);
        if (this._chunksValEl) this._chunksValEl.textContent = String(chunks);
        try { this.fps = +fps || 0; this.chunks = +chunks || 0; } catch {}   // v1967 — expose for the FPS/CHUNKS gauges

        // Round 263c — system perf rows. Throttle to ~5Hz; snapshot()
        // does some array work so don't call every frame.
        if (typeof window !== "undefined") {
            const now = performance.now();
            if (now - (this._lastSysUpdate || 0) > 200) {
                this._lastSysUpdate = now;
                const sp = window.systemPerf?.snapshot?.();
                if (sp) {
                    const cpuPct = Math.round(sp.cpuLoad01 * 100);
                    const gpuPct = (sp.gpuLoad01 != null) ? Math.round(sp.gpuLoad01 * 100) : null;
                    const memMB  = (sp.memUsedMB != null) ? Math.round(sp.memUsedMB) : null;
                    if (this._cpuValEl) this._cpuValEl.textContent = `${cpuPct}%`;
                    if (this._gpuValEl) this._gpuValEl.textContent = (gpuPct != null) ? `${gpuPct}%` : "—";
                    if (this._memValEl) {
                        // Stretch goal: include Ollama VRAM if reachable. For
                        // now show JS heap only; matches what most browsers
                        // can return without external probes.
                        this._memValEl.textContent = (memMB != null) ? `${memMB}MB` : "—";
                    }
                }

                // Voice indicator — mirror the voice-commander state
                if (this._voiceValEl) {
                    const v = window.voice;
                    if (v?.active) {
                        this._voiceValEl.textContent = "ON";
                        this._voiceValEl.style.color = "#5eff8a";
                    } else {
                        this._voiceValEl.textContent = "off";
                        this._voiceValEl.style.color = "";   // back to default #fc9
                    }
                }

                // Workers — read from scheduler if exposed
                if (this._workersValEl) {
                    const sch = window.scheduler;
                    if (sch?.tasks?.length != null) {
                        const total = sch.tasks.length;
                        const active = sch.tasks.filter(t => t.enabled !== false).length;
                        this._workersValEl.textContent = `${active}/${total}`;
                    } else {
                        this._workersValEl.textContent = "—";
                    }
                }

                // Bridge — Node bridge connection state
                if (this._bridgeValEl) {
                    const bs = window._bridgeState || (window.bridge?._lastState);
                    if (bs === "open" || window.bridge?.connected) {
                        this._bridgeValEl.textContent = "LIVE";
                        this._bridgeValEl.style.color = "#5eff8a";
                    } else if (bs === "close" || bs === "error") {
                        this._bridgeValEl.textContent = "DOWN";
                        this._bridgeValEl.style.color = "#f88";
                    } else {
                        this._bridgeValEl.textContent = "—";
                        this._bridgeValEl.style.color = "";
                    }
                }
            }
        }

        // Round 43d — paint chunk grid heatmap
        if (this._chunkCtx && data?.chunksGrid) {
            this._drawChunkGrid(data.chunksGrid);
        }

        // Round 28 — mode indicator + control hints
        let modeRow;
        if (mode === "fp") {
            modeRow = `<span style="color:#9cf">MODE: FIRST-PERSON</span>  <span style="opacity:0.6">[1-8=weapon  Q/click=fire  B=mode  E=ally  X=eject  Shift=sprint  Space=jump  \`=console]</span>`;
        } else if (mode === "missile_cam") {
            // Round 46 — missile cam, mouse steers heading
            const ms = window._missileSystem?.snapshot?.();
            const ttlTxt = ms ? `${ms.ttl.toFixed(1)}s` : "?";
            modeRow = `<span style="color:#4af;font-weight:bold;text-shadow:0 0 6px #4af">▶ MISSILE CAM ◀</span>  <span style="opacity:0.7">mouse=steer  TTL ${ttlTxt}</span>`;
        } else {
            modeRow = `<span style="color:#fc9">MODE: OBSERVER</span>  <span style="opacity:0.6">[F=walk on ground  \`=console]</span>`;
        }

        // Round 261 — combatRow (UNALLIED / BOUNTY) RETIRED. User found
        // it noisy when not in active combat. The _playerCombat data is
        // still tracked; just not surfaced in the HUD.
        let combatRow = "";

        // Round 32 — weather row, color-coded by state
        const weatherIcon = {
            clear: "☀", cloudy: "☁", rain: "☔", snow: "❄", storm: "⚡",
        }[weather] ?? "?";
        const weatherColor = {
            clear: "#ff9", cloudy: "#ccc", rain: "#7af", snow: "#fff", storm: "#f9f",
        }[weather] ?? "#fff";
        // v1561 — prefer LIVE meteo weather (temp + humidity) from open-meteo; fall back to the
        // engine's simulated weather when no location is configured or the fetch hasn't landed.
        let weatherRow;
        const lw = this._liveWx;
        if (lw && (Date.now() - lw.ts) < 40 * 60 * 1000) {
            const wc = wmoCondition(lw.code);
            weatherRow = `<span style="color:${wc.color}">${wc.icon} ${wc.word}</span>  ` +
                `<span style="opacity:0.9">${lw.temp}\u00b0${lw.unit}</span>  ` +
                `<span style="opacity:0.6">${lw.humidity}% RH</span>`;
        } else {
            // v1644 — location not configured (or the fetch hasn't landed): show the sim weather, and when no
            // location is set at all, make the row a click target to set one (geocoded city or lat,lon).
            const inner = `<span style="color:${weatherColor}">${weatherIcon} ${weather.toUpperCase()}</span>  <span style="opacity:0.6">(${timeOfDay})</span>`;
            weatherRow = this._wxLocSet() ? inner
                : `<span class="swekWxSet" style="cursor:pointer" title="Click to set your weather location">${inner}  <span style="opacity:0.55;text-decoration:underline dotted">\uD83D\uDCCD set location</span></span>`;
        }

        // Round 41/261 — out-of-bounds warning. Suppressed when the
        // camera is auto-driven (cruise mode, FPS autopilot, demo
        // sequences) — the player isn't piloting so they can't act on
        // an OOB warning, and the demos commonly drift outside loaded
        // chunks intentionally.
        const worldEdge = data?.worldEdge ?? 112;
        const oob = Math.abs(pos.x) > worldEdge || Math.abs(pos.z) > worldEdge;
        const autoCam = (typeof window !== "undefined") && (
            window.cruise?.active?.() === true ||
            window._cruiseActive === true ||
            window._cameraAutoControlled === true ||
            window.fpsAutopilot?.active === true
        );
        const oobRow = (oob && !autoCam)
            ? `<span style="color:#f33;font-weight:bold;text-shadow:0 0 6px #f00">⚠ OUT OF BOUNDS — return to playable area</span>`
            : "";

        // v1561 — MODE line removed from the STATUS panel per request; weather (live) leads now.
        this.el.innerHTML = `${weatherRow}${combatRow ? "<br>" + combatRow : ""}${oobRow ? "<br>" + oobRow : ""}`;
    }

    // v1644 — weather location setter (used by the STATUS weather "set location" click).
    _wxLocSet() {
        try {
            return isFinite(parseFloat(localStorage.getItem("voxelengine.wxLat") || "")) &&
                   isFinite(parseFloat(localStorage.getItem("voxelengine.wxLon") || ""));
        } catch { return false; }
    }
    _promptSetLocation() {
        let inp = null;
        try { inp = window.prompt("Set your weather location \u2014 a city (e.g. \"Warwick, RI\") or \"lat,lon\":", ""); } catch {}
        if (!inp) return;
        const s = String(inp).trim(); if (!s) return;
        const m = s.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
        if (m) {
            const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
            if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
                this._saveWxLoc(lat, lon, lat.toFixed(3) + "," + lon.toFixed(3)); return;
            }
        }
        // Geocode the city name via open-meteo (no key, non-commercial). https://geocoding-api.open-meteo.com/v1/search
        fetch("https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=" + encodeURIComponent(s))
            .then(r => r.json()).then(j => {
                const g = j && j.results && j.results[0];
                if (!g || !isFinite(g.latitude) || !isFinite(g.longitude)) {
                    try { window.alert("Couldn't find \"" + s + "\". Try \"City, State\" or enter lat,lon directly."); } catch {} return;
                }
                const label = [g.name, g.admin1, g.country_code].filter(Boolean).join(", ");
                this._saveWxLoc(g.latitude, g.longitude, label);
            }).catch(() => { try { window.alert("Location lookup failed (offline?). You can enter lat,lon directly."); } catch {} });
    }
    _saveWxLoc(lat, lon, label) {
        try {
            localStorage.setItem("voxelengine.wxLat", String(lat));
            localStorage.setItem("voxelengine.wxLon", String(lon));
            if (!localStorage.getItem("voxelengine.wxUnit")) localStorage.setItem("voxelengine.wxUnit", "f");
            if (label) localStorage.setItem("voxelengine.wxPlace", label);
        } catch {}
        try { this._liveWx = null; this._fetchLiveWx(); } catch {}
        try { console.log("[hud] weather location set \u2192 " + (label || (lat + "," + lon))); } catch {}
    }

    // Round 43d — paint a tiny 15x15 heatmap of which chunks are loaded.
    //   dim:      not loaded
    //   orange:   loaded + visible
    //   white:    camera chunk (center marker)
    // Canvas is 24x24 with (2*radius+1)x(2*radius+1) cells.
    _drawChunkGrid({ radius, camCx, camCz, visibleSet, loadedSet }) {
        const ctx = this._chunkCtx;
        if (!ctx) return;
        const W = this._chunkCanvas.width;
        const cells = radius * 2 + 1;             // 15 for radius=7
        const cell = Math.floor(W / cells);       // 1px per cell at radius 7
        const pad = Math.floor((W - cell * cells) / 2);
        ctx.clearRect(0, 0, W, W);
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, W, W);
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                // World-space chunk coords for this grid cell (relative to camera)
                const cx = camCx + dx;
                const cz = camCz + dz;
                const key = `${cx},${cz}`;
                const isCam = dx === 0 && dz === 0;
                const isVisible = visibleSet?.has(key);
                const isLoaded  = loadedSet?.has(key);
                let color;
                if (isCam) {
                    color = "#fff";
                } else if (isVisible) {
                    color = "#ffb733";
                } else if (isLoaded) {
                    color = "#7a4a10";              // dim loaded-not-visible
                } else {
                    color = "#221a10";              // dim unloaded
                }
                ctx.fillStyle = color;
                // x increases right, z increases "south" (down on screen)
                const px = pad + (dx + radius) * cell;
                const py = pad + (dz + radius) * cell;
                ctx.fillRect(px, py, cell, cell);
            }
        }
    }
}