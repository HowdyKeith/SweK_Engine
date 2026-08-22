// FILE: ui/listenerMenu.js
// VERSION: v1 - round 43o
//
// LCARS-styled "Listener" menu surfacing every KPopListener-style action
// we can trigger from the engine. Sits on the left edge as a minitab
// (LSTN), opens to a panel with:
//   - 8 Tama emotion triggers (matches Send-VoxelToast -Tama actions)
//   - Speak text input ("speak" action with custom text)
//   - Toast quick-test buttons (info/success/warn/error)
//   - Bridge connection status (live)
//   - Recent listener events log (last 6)
//   - Button to spawn a Face Avatar window (opens /face.html in a new tab)
//
// Everything routes through the WSBridge — bridge.emit("tama", {action})
// or bridge.emit("toast", {...}) — which broadcasts to ALL connected
// clients (this window, secondary face window, any other open tab).

export class ListenerMenu {

    constructor({ bridge, embedded } = {}) {
        this.bridge = bridge ?? null;
        this.embedded = !!embedded;   // v1117 — render into the KPop Listener settings tab instead of a floating panel
        this.events = [];     // recent broadcast events for the log
        this._build();
        this._wireBridge();
        this._statusTimer = setInterval(() => this._refreshStatus(), 1000);
    }

    _build() {
        // Left-edge minitab. Pink to distinguish from GFX (cyan, right).
        // v668 — renamed LSTN → LISTENER for clarity, moved up 50px so it
        // sits below the INSTALL dock tab and isn't crowded by NARRAT below.
        const tab = document.createElement("div");
        tab.className = "lcars-minitab edge-left color-pink";
        tab.style.top = "auto";
        tab.style.bottom = "280px";
        tab.textContent = "LISTENER";
        tab.title = "Listener menu";
        this._tab = tab;
        if (!this.embedded) document.body.appendChild(tab);   // v1117 — retired when embedded in settings

        const panel = document.createElement("div");
        panel.className = "lcars-panel";
        // v668 — anchor panel from TOP so its header is always visible below
        // the browser chrome + orange demo pill. max-height + scroll so a tall
        // events log doesn't push the panel off-screen.
        Object.assign(panel.style, {
            position: "fixed",
            left: "60px",
            top: "200px",
            bottom: "auto",
            width: "320px",
            maxHeight: "calc(100vh - 220px)",
            overflowY: "auto",
            zIndex: "9300",
            display: "none",
            pointerEvents: "auto",
        });

        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        const title = document.createElement("div");
        title.textContent = "Listener";
        header.appendChild(title);
        const close = document.createElement("div");
        close.className = "lcars-panel-header-id";
        close.textContent = "X";
        close.style.cursor = "pointer";
        close.addEventListener("click", () => panel.style.display = "none");
        header.appendChild(close);
        panel.appendChild(header);
        this._header = header;   // v1117 — hidden when embedded (settings tab has its own label)

        const body = document.createElement("div");
        body.className = "lcars-panel-body";
        const bar = document.createElement("div");
        bar.className = "lcars-panel-bar";
        body.appendChild(bar);

        const content = document.createElement("div");
        content.className = "lcars-panel-content";
        content.style.fontSize = "11px";
        content.style.color = "#fc9";

        // ---- Connection status -----------------------------------------
        const statusRow = document.createElement("div");
        Object.assign(statusRow.style, { marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" });
        const statusDot = document.createElement("span");
        Object.assign(statusDot.style, {
            display: "inline-block", width: "10px", height: "10px",
            borderRadius: "50%", background: "#444",
        });
        const statusText = document.createElement("span");
        statusText.textContent = "Bridge: --";
        statusRow.appendChild(statusDot);
        statusRow.appendChild(statusText);
        content.appendChild(statusRow);
        this._statusDot = statusDot;
        this._statusText = statusText;

        // ---- Listener control (v1086) ---------------------------------
        // Same core actions as the Settings "KPop Listener" minitab, surfaced
        // here on the LCARS console: launch/stop the listener process, toggle
        // toasts, and peek the clipboard queue. Results go to the events log.
        const ctlLbl = document.createElement("div");
        ctlLbl.textContent = "Listener control";
        Object.assign(ctlLbl.style, { color: "#5ec8ff", fontSize: "10px", marginBottom: "4px", letterSpacing: "1.5px" });
        content.appendChild(ctlLbl);
        const ctlRow = document.createElement("div");
        Object.assign(ctlRow.style, { display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px", alignItems: "center" });
        const mkCtl = (txt, fn, col) => { const b = document.createElement("button"); b.textContent = txt; Object.assign(b.style, { padding: "4px 8px", fontSize: "10px", background: "rgba(60,40,20,0.7)", border: "1px solid rgba(255,153,0,0.4)", color: col || "#fc9", cursor: "pointer", fontFamily: "monospace" }); b.addEventListener("click", fn); return b; };
        const ctlEng = document.createElement("select");
        Object.assign(ctlEng.style, { fontSize: "10px", background: "rgba(0,0,0,0.6)", color: "#fc9", border: "1px solid rgba(255,153,0,0.4)", fontFamily: "monospace" });
        [["powershell", "PS"], ["python", "Py"]].forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; ctlEng.appendChild(o); });
        const ctlLaunch = mkCtl("▶ Launch", async () => { this._logEvent("ctl", "launching " + ctlEng.value + "…"); try { const r = await (await fetch("/kpop/launch?engine=" + ctlEng.value, { method: "POST" })).json(); this._logEvent("ctl", r && (r.ok || r.pid) ? ("launched " + ctlEng.value + (r.pid ? (" pid " + r.pid) : "")) : (r && r.error || "launch failed")); } catch { this._logEvent("ctl", "launch failed"); } }, "#9fe88f");
        const ctlStop = mkCtl("■ Stop", async () => { try { await fetch("/kpop/stop", { method: "POST" }); this._logEvent("ctl", "stop sent"); } catch { this._logEvent("ctl", "stop failed"); } }, "#ffb4b4");
        const ctlToast = mkCtl("Toasts", () => { try { const on = !(window.kpop && window.kpop.isEnabled && window.kpop.isEnabled()); window.kpop && window.kpop.setEnabled(on); ctlToast.style.color = on ? "#9fe88f" : "#fc9"; this._logEvent("ctl", "toasts " + (on ? "on" : "off")); } catch {} });
        const ctlQueue = mkCtl("Queue", async () => { try { const j = await (await fetch("/kpop/queue", { cache: "no-store" })).json(); const n = (j && j.count) || 0; const latest = j && j.items && j.items[0] ? (" · latest " + (j.items[0].file || "?")) : ""; this._logEvent("ctl", "queue: " + n + " item" + (n !== 1 ? "s" : "") + latest); } catch { this._logEvent("ctl", "queue unreachable"); } });
        try { ctlToast.style.color = (window.kpop && window.kpop.isEnabled && window.kpop.isEnabled()) ? "#9fe88f" : "#fc9"; } catch {}
        ctlRow.append(ctlEng, ctlLaunch, ctlStop, ctlToast, ctlQueue);
        content.appendChild(ctlRow);

        // ---- Emotion section ------------------------------------------
        const lbl1 = document.createElement("div");
        lbl1.textContent = "Tama emotion";
        Object.assign(lbl1.style, { color: "#5ec8ff", fontSize: "10px", marginBottom: "4px", letterSpacing: "1.5px" });
        content.appendChild(lbl1);

        const emoGrid = document.createElement("div");
        Object.assign(emoGrid.style, {
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "4px",
            marginBottom: "10px",
        });
        const emotions = [
            ["happy",  "😊"],
            ["sad",    "😢"],
            ["alert",  "⚠"],
            ["wave",   "👋"],
            ["feed",   "🍔"],
            ["play",   "🎲"],
            ["sleep",  "💤"],
            ["speak",  "💬"],
        ];
        for (const [action, glyph] of emotions) {
            const b = document.createElement("button");
            b.textContent = `${glyph} ${action}`;
            Object.assign(b.style, {
                padding: "5px 4px", fontSize: "10px",
                background: "rgba(60, 40, 20, 0.7)",
                border: "1px solid rgba(255, 153, 0, 0.4)",
                color: "#fc9", cursor: "pointer", fontFamily: "monospace",
            });
            b.addEventListener("click", () => this._sendTama(action));
            emoGrid.appendChild(b);
        }
        content.appendChild(emoGrid);

        // ---- Speak with custom text -----------------------------------
        const speakRow = document.createElement("div");
        Object.assign(speakRow.style, { display: "flex", gap: "4px", marginBottom: "10px" });
        const speakInput = document.createElement("input");
        speakInput.type = "text";
        speakInput.placeholder = "Speak text...";
        Object.assign(speakInput.style, {
            flex: "1", padding: "4px 6px", fontSize: "11px",
            background: "rgba(0,0,0,0.6)", color: "#fc9",
            border: "1px solid rgba(255, 153, 0, 0.4)", fontFamily: "monospace",
        });
        const speakBtn = document.createElement("button");
        speakBtn.textContent = "Say";
        Object.assign(speakBtn.style, {
            padding: "4px 10px", fontSize: "10px",
            background: "rgba(255, 153, 0, 0.3)",
            border: "1px solid rgba(255, 153, 0, 0.6)",
            color: "#fff", cursor: "pointer", fontFamily: "monospace",
        });
        const doSpeak = () => {
            const text = speakInput.value.trim();
            if (!text) return;
            this._sendTama("speak", text);
            speakInput.value = "";
        };
        speakBtn.addEventListener("click", doSpeak);
        speakInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSpeak(); });
        speakRow.appendChild(speakInput);
        speakRow.appendChild(speakBtn);
        content.appendChild(speakRow);

        // ---- Quick toast -----------------------------------------------
        const lbl2 = document.createElement("div");
        lbl2.textContent = "Test toast";
        Object.assign(lbl2.style, { color: "#5ec8ff", fontSize: "10px", marginBottom: "4px", letterSpacing: "1.5px" });
        content.appendChild(lbl2);

        // Round 163 — mute toggle. When on, toasts are dropped at the
        // client (no HTTP roundtrip → no BurntToast notification → no
        // beep). Persisted in localStorage by KPopClient.setMuted().
        // Round 164 fix — KPopClient lives at window.kpop, not on this
        // menu; null-guard in case the menu mounts before kpop is up.
        const muteRow = document.createElement("label");
        Object.assign(muteRow.style, {
            display: "flex", alignItems: "center", gap: "6px",
            marginBottom: "8px", cursor: "pointer",
            fontSize: "10px", color: "#ccc",
        });
        const muteCb = document.createElement("input");
        muteCb.type = "checkbox";
        // Try the live client first; fall back to localStorage if it
        // isn't on window yet (early mount during page load).
        muteCb.checked = !!(window.kpop?.isMuted?.()) ||
                          (() => {
                              try {
                                  const v = localStorage.getItem("voxelengine.kpopMuted");
                                  return v === "1" || v === "true";
                              } catch { return false; }
                          })();
        muteCb.addEventListener("change", () => {
            // Update both the client (if alive) and localStorage so a
            // toggle made before kpop initialized still sticks.
            try { window.kpop?.setMuted?.(muteCb.checked); } catch {}
            try { localStorage.setItem("voxelengine.kpopMuted", muteCb.checked ? "1" : "0"); } catch {}
        });
        muteRow.appendChild(muteCb);
        const muteLbl = document.createElement("span");
        muteLbl.textContent = "🔇 mute (drop all toasts, no beep)";
        muteRow.appendChild(muteLbl);
        content.appendChild(muteRow);

        const toastRow = document.createElement("div");
        Object.assign(toastRow.style, { display: "flex", gap: "4px", marginBottom: "10px" });
        // Round 48 - added "system" so all 5 toaster types are testable
        // from the menu. info/success/warn/error/system.
        for (const t of ["info", "success", "warn", "error", "system"]) {
            const b = document.createElement("button");
            b.textContent = t.toUpperCase();
            Object.assign(b.style, {
                flex: "1", padding: "4px 4px", fontSize: "9px",
                background: "rgba(60, 40, 20, 0.7)",
                border: "1px solid rgba(255, 153, 0, 0.4)",
                color: "#fc9", cursor: "pointer", fontFamily: "monospace",
            });
            b.addEventListener("click", () => this._sendToast(t));
            toastRow.appendChild(b);
        }
        content.appendChild(toastRow);

        // ---- Open face window ------------------------------------------
        const faceBtn = document.createElement("button");
        faceBtn.textContent = "👁  Open Face Avatar Window";
        Object.assign(faceBtn.style, {
            width: "100%", padding: "6px",
            background: "rgba(255, 60, 200, 0.25)",
            border: "1px solid rgba(255, 60, 200, 0.6)",
            color: "#fff", cursor: "pointer", fontFamily: "monospace",
            fontSize: "10px", marginBottom: "4px",
        });
        faceBtn.title = "Opens /face.html in a new browser window — connects to the same listener bridge";
        faceBtn.addEventListener("click", () => {
            window.open("/face.html", "_blank", "width=520,height=620,menubar=no,toolbar=no");
        });
        content.appendChild(faceBtn);

        // Round 67 — Robot Avatar window. Same WS protocol, but renders
        // the rigged RobotExpressive GLB (or any rigged asset via
        // ?asset=name) with full skeletal animation. Emotion → clip
        // mapping inside /face/robotFaceAvatar.js.
        const robotBtn = document.createElement("button");
        robotBtn.textContent = "🤖  Open Robot Avatar Window";
        Object.assign(robotBtn.style, {
            width: "100%", padding: "6px",
            background: "rgba(60, 200, 255, 0.22)",
            border: "1px solid rgba(60, 200, 255, 0.55)",
            color: "#fff", cursor: "pointer", fontFamily: "monospace",
            fontSize: "10px", marginBottom: "10px",
        });
        robotBtn.title = "Opens /RobotExpressive.html — animated 3D RobotExpressive driven by listener events. Append ?asset=YourAssetName to use a different rigged GLB.";
        robotBtn.addEventListener("click", () => {
            window.open("/RobotExpressive.html", "_blank", "width=640,height=720,menubar=no,toolbar=no");
        });
        content.appendChild(robotBtn);

        // v361 — Robot avatar settings broadcast over the bridge to any
        // connected /RobotExpressive.html consumers. Face-lock keeps the robot's
        // gaze pinned to the listener camera (vs free idle look-around);
        // body dimensions broadcast width/height scale multipliers.
        const robotCfgLabel = document.createElement("div");
        robotCfgLabel.textContent = "Robot avatar config";
        Object.assign(robotCfgLabel.style, { color: "#5ec8ff", fontSize: "10px", marginBottom: "4px", letterSpacing: "1.5px" });
        content.appendChild(robotCfgLabel);

        const robotCfg = document.createElement("div");
        Object.assign(robotCfg.style, {
            background: "rgba(60, 200, 255, 0.06)",
            border: "1px solid rgba(60, 200, 255, 0.2)",
            padding: "6px 8px", marginBottom: "10px",
            fontSize: "10px",
        });
        // Read persisted state so toggles survive reloads
        const _readRobotCfg = () => {
            try {
                const raw = localStorage.getItem("voxelengine.robotCfg_v1");
                if (raw) return JSON.parse(raw);
            } catch {}
            return { faceLock: false, bodyWidth: 1.0, bodyHeight: 1.0 };
        };
        const _writeRobotCfg = (cfg) => {
            try { localStorage.setItem("voxelengine.robotCfg_v1", JSON.stringify(cfg)); } catch {}
        };
        const cfg = _readRobotCfg();

        // Face-lock toggle
        const lockRow = document.createElement("label");
        Object.assign(lockRow.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", cursor: "pointer", color: "#cef" });
        const lockCb = document.createElement("input");
        lockCb.type = "checkbox";
        lockCb.checked = !!cfg.faceLock;
        lockCb.addEventListener("change", () => {
            cfg.faceLock = lockCb.checked;
            _writeRobotCfg(cfg);
            this._sendRobot({ action: "faceLock", enabled: lockCb.checked });
        });
        const lockLbl = document.createElement("span");
        lockLbl.textContent = "🔒 face-lock (pin gaze to camera)";
        lockRow.appendChild(lockCb);
        lockRow.appendChild(lockLbl);
        robotCfg.appendChild(lockRow);

        // Body dimensions — width + height sliders that broadcast a
        // scale-multiplier pair
        const _makeSlider = (label, key, initial) => {
            const row = document.createElement("div");
            Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" });
            const lab = document.createElement("span");
            lab.textContent = label;
            Object.assign(lab.style, { minWidth: "70px", color: "#cef", fontFamily: "monospace" });
            const range = document.createElement("input");
            range.type = "range";
            range.min = "50";
            range.max = "200";
            range.value = String(Math.round((initial ?? 1) * 100));
            Object.assign(range.style, { flex: "1" });
            const val = document.createElement("span");
            val.textContent = (initial ?? 1).toFixed(2) + "×";
            Object.assign(val.style, { minWidth: "44px", color: "#cef", fontFamily: "monospace", fontSize: "9px" });
            range.addEventListener("input", () => {
                const v = (+range.value) / 100;
                val.textContent = v.toFixed(2) + "×";
                cfg[key] = v;
                _writeRobotCfg(cfg);
                this._sendRobot({ action: "bodyDim", width: cfg.bodyWidth, height: cfg.bodyHeight });
            });
            row.appendChild(lab);
            row.appendChild(range);
            row.appendChild(val);
            return row;
        };
        robotCfg.appendChild(_makeSlider("width",  "bodyWidth",  cfg.bodyWidth));
        robotCfg.appendChild(_makeSlider("height", "bodyHeight", cfg.bodyHeight));

        // Reset button
        const resetBtn = document.createElement("button");
        resetBtn.textContent = "↺ reset";
        Object.assign(resetBtn.style, {
            padding: "3px 8px", fontSize: "9px", marginTop: "4px",
            background: "rgba(60, 200, 255, 0.18)",
            border: "1px solid rgba(60, 200, 255, 0.45)",
            color: "#cef", cursor: "pointer", fontFamily: "monospace",
        });
        resetBtn.addEventListener("click", () => {
            cfg.faceLock = false;
            cfg.bodyWidth = 1.0;
            cfg.bodyHeight = 1.0;
            _writeRobotCfg(cfg);
            lockCb.checked = false;
            // Repopulate sliders to default
            robotCfg.querySelectorAll('input[type="range"]').forEach(r => { r.value = "100"; });
            robotCfg.querySelectorAll('input[type="range"] + span, span').forEach(s => {
                if (s.textContent && /×$/.test(s.textContent)) s.textContent = "1.00×";
            });
            this._sendRobot({ action: "faceLock", enabled: false });
            this._sendRobot({ action: "bodyDim", width: 1.0, height: 1.0 });
        });
        robotCfg.appendChild(resetBtn);

        content.appendChild(robotCfg);

        // Round 68 → v668 — the AI Brain button moved to the AI BRAIN panel
        // (where it conceptually belongs — it opens /aibrain.html which is
        // the AI controller window, not a listener concern). In its place,
        // a debug toggle that controls whether clients connecting to this
        // listener emit verbose logs.
        const debugRow = document.createElement("div");
        Object.assign(debugRow.style, {
            display: "flex", alignItems: "center", gap: "8px",
            padding: "6px", marginBottom: "10px",
            background: "rgba(80, 130, 80, 0.18)",
            border: "1px solid rgba(80, 130, 80, 0.55)",
            borderRadius: "3px",
        });
        const debugLabel = document.createElement("span");
        debugLabel.textContent = "🔍 client debug";
        Object.assign(debugLabel.style, { flex: "1", fontSize: "11px", color: "#cfa" });
        const debugBtn = document.createElement("button");
        const refreshDebugBtn = () => {
            const on = !!window._listenerDebug;
            debugBtn.textContent = on ? "ON" : "OFF";
            Object.assign(debugBtn.style, {
                padding: "3px 10px",
                background: on ? "rgba(80, 200, 80, 0.6)" : "rgba(80, 80, 80, 0.4)",
                border: on ? "1px solid #6f6" : "1px solid #666",
                color: "#fff", cursor: "pointer", fontFamily: "monospace",
                fontSize: "11px", fontWeight: "bold",
            });
        };
        refreshDebugBtn();
        debugBtn.addEventListener("click", () => {
            window._listenerDebug = !window._listenerDebug;
            refreshDebugBtn();
            // v668 — broadcast to connected clients via the existing event
            // channel so they can ramp up/down verbose logging. Clients that
            // care should check window._listenerDebug on each emit.
            try {
                window.dispatchEvent(new CustomEvent("listener:debug", {
                    detail: { enabled: window._listenerDebug },
                }));
            } catch {}
            console.log(`[listener] client debug ${window._listenerDebug ? "ON" : "OFF"}. window._listenerDebug = ${window._listenerDebug}`);
        });
        debugBtn.title = "Toggle verbose debug logging. Sets window._listenerDebug + fires a 'listener:debug' DOM event other modules can subscribe to.";
        debugRow.appendChild(debugLabel);
        debugRow.appendChild(debugBtn);
        content.appendChild(debugRow);

        // ---- Recent events log -----------------------------------------
        const lbl3 = document.createElement("div");
        lbl3.textContent = "Recent events";
        Object.assign(lbl3.style, { color: "#5ec8ff", fontSize: "10px", marginBottom: "4px", letterSpacing: "1.5px" });
        content.appendChild(lbl3);

        const log = document.createElement("div");
        Object.assign(log.style, {
            fontSize: "9px", color: "#aaa", lineHeight: "1.4",
            maxHeight: "90px", overflowY: "auto",
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255, 153, 0, 0.2)",
            padding: "4px 6px",
        });
        log.textContent = "(no events yet)";
        content.appendChild(log);
        this._log = log;

        body.appendChild(content);
        panel.appendChild(body);

        const footer = document.createElement("div");
        footer.className = "lcars-panel-footer";
        panel.appendChild(footer);

        if (!this.embedded) {
            document.body.appendChild(panel);
            tab.addEventListener("click", () => {
                panel.style.display = (panel.style.display === "none") ? "block" : "none";
            });
        }
        this._panel = panel;
    }

    // v1117 — adopt the (already-built, already-wired) panel content into a
    // settings-tab host instead of floating it. Idempotent: safe to call on
    // every settings re-render. Strips the fixed/LCARS-float chrome, hides the
    // header (the tab supplies its own label), and lets the content flow.
    adoptInto(host) {
        if (!host || !this._panel) return;
        const p = this._panel;
        Object.assign(p.style, {
            position: "static", left: "auto", top: "auto", bottom: "auto",
            width: "100%", maxHeight: "none", overflowY: "visible",
            zIndex: "auto", display: "block", pointerEvents: "auto",
        });
        if (this._header) this._header.style.display = "none";
        if (p.parentElement !== host) host.appendChild(p);
    }

    _wireBridge() {
        if (!this.bridge?.on) return;
        // Listen for tama + toast broadcasts (anything we'd care about)
        this.bridge.on("tama", (data) => this._logEvent("tama", `${data.action ?? "?"}${data.text ? ": " + data.text : ""}`));
        this.bridge.on("toast", (data) => this._logEvent("toast", `[${data.type ?? "?"}] ${data.title ?? ""} - ${data.msg ?? ""}`));
    }

    _sendTama(action, text) {
        if (!this.bridge) return;
        const payload = text ? { action, text } : { action };
        // emit goes via WS — relay broadcasts to all clients including
        // this window's TamagotchiView listener
        this.bridge.emit?.("tama", payload);
        // Also self-log immediately for snappy feedback
        this._logEvent("→tama", `${action}${text ? ": " + text : ""}`);
    }

    /**
     * v361 — Robot avatar config broadcast. Same WS channel pattern as
     * _sendTama. The /RobotExpressive.html consumer listens for {topic:"robot"}
     * and applies the action (faceLock, bodyDim, etc.) to its scene.
     */
    _sendRobot(payload) {
        if (!this.bridge) return;
        this.bridge.emit?.("robot", payload);
        const summary = payload.action +
            (payload.enabled !== undefined ? ` ${payload.enabled ? "on" : "off"}` : "") +
            (payload.width !== undefined ? ` w=${payload.width.toFixed(2)} h=${payload.height.toFixed(2)}` : "");
        this._logEvent("→robot", summary);
    }

    _sendToast(type) {
        // Round 48 - PRIMARY FIX. Before this, _sendToast only called
        // bridge.emit("toast", ...) which is a no-op when the WSBridge
        // isn't connected (Node relay offline). The Listener panel
        // toast-test buttons then did nothing locally, even though the
        // toaster is mounted and functional. Now we ALWAYS fire a local
        // toast via window._toaster directly. The bridge broadcast is
        // still attempted as a bonus — when connected, OTHER windows
        // (face.html, second Tama, etc.) also see it.
        const payload = {
            title: `Test toast (${type})`,
            msg:   `This is a ${type} message at ${new Date().toLocaleTimeString()}`,
            type,
            duration: 4500,
        };
        // Local-first - works with or without the bridge
        if (window._toaster?.show) {
            window._toaster.show(payload);
        }
        // Best-effort broadcast (no-op if bridge offline)
        if (this.bridge) {
            this.bridge.emit?.("toast", payload);
        }
        this._logEvent("→toast", `[${type}] test`);
    }

    _logEvent(kind, msg) {
        this.events.push({ kind, msg, t: Date.now() });
        if (this.events.length > 6) this.events.shift();
        if (!this._log) return;
        if (this.events.length === 0) {
            this._log.textContent = "(no events yet)";
            return;
        }
        this._log.innerHTML = this.events.map(e => {
            const ts = new Date(e.t).toLocaleTimeString();
            return `<div><span style="color:#5ec8ff">${ts}</span> ${e.kind}: <span style="color:#fc9">${this._esc(e.msg)}</span></div>`;
        }).reverse().join("");
    }

    _esc(s) { return String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }

    _refreshStatus() {
        if (!this.bridge) return;
        const ok = !!this.bridge.connected;
        this._statusDot.style.background = ok ? "#5eff8a" : "#ff4444";
        this._statusText.textContent = `Bridge: ${ok ? "connected" : "offline"} (${this.bridge.url ?? "?"})`;
    }
}
