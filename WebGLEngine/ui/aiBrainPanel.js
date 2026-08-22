// FILE: ui/aiBrainPanel.js
// VERSION: v1 - round 51
//
// Mini "AI Brain" dashboard for the VBA <-> Node <-> WebGL bridge.
//
// What it does:
//   - Subscribes to bridge:state WS messages (every tick from VBA)
//   - Shows: tick count, age (ms since last tick), player pos/yaw,
//     enemy list with positions
//   - Buttons: send a directive via POST /bridge/directive
//     (move / rotate / fire / damage — the 4 commands modAICommands
//     knows how to execute on the VBA side)
//   - Status pill: green when bridge has fresh data, yellow when stale
//     (>2s old), red when no data
//
// Layout: right-edge LCARS minitab "BRAIN", cyan-ish. Sits at
// bottom: 320 so it doesn't fight with ToastTest (180) or LSTN
// (left-edge anyway).
//
// This is meant as a debugging/demonstration tool. A real AI brain
// would be in a separate browser window running its own logic +
// posting directives autonomously.

const BRIDGE_URL = "/bridge/directive";

export class AIBrainPanel {
    constructor({ bridge } = {}) {
        this.bridge = bridge ?? null;
        this.lastState = null;
        this.lastStateMs = 0;
        this._build();
        this._wireBridge();
        this._refreshTimer = setInterval(() => this._refresh(), 250);
    }

    _build() {
        // v1572 — moved to the LEFT-edge vertical rail (was top-edge at left:792) per user request.
        const tab = document.createElement("div");
        tab.className = "lcars-minitab edge-left color-pink";
        tab.style.top = "auto";
        tab.style.left = "auto";
        tab.style.bottom = "auto";
        tab.textContent = "◀ AI Brain";
        tab.title = "VBA bridge state + directive sender";
        document.body.appendChild(tab);

        const panel = document.createElement("div");
        panel.className = "lcars-panel";
        // v668 — anchor from TOP so the panel sits just below the orange
        // demo pill, instead of growing up from bottom and clipping behind
        // browser chrome at the top. ~110px = below the demo pill area.
        Object.assign(panel.style, {
            position: "fixed",
            right: "60px",
            top: "110px",
            bottom: "auto",
            width: "320px",
            maxHeight: "calc(100vh - 130px)",
            overflowY: "auto",
            zIndex: "9300",
            display: "none",
            pointerEvents: "auto",
        });

        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        const title = document.createElement("div");
        title.textContent = "AI Brain";
        header.appendChild(title);
        const close = document.createElement("div");
        close.className = "lcars-panel-header-id";
        close.textContent = "X";
        close.style.cursor = "pointer";
        close.addEventListener("click", () => panel.style.display = "none");
        header.appendChild(close);
        panel.appendChild(header);

        const body = document.createElement("div");
        body.className = "lcars-panel-body";
        const bar = document.createElement("div");
        bar.className = "lcars-panel-bar";
        body.appendChild(bar);

        const content = document.createElement("div");
        content.className = "lcars-panel-content";
        content.style.fontSize = "11px";
        content.style.color = "#fc9";

        // v668 — "Open AI Brain Window" relocated here from the LISTENER
        // panel. /aibrain.html is the AI controller window for the VBA-side
        // OpenGL FPS — it belongs in the AI BRAIN panel, not the listener.
        const brainBtn = document.createElement("button");
        brainBtn.textContent = "🧠  Open AI Brain Window";
        Object.assign(brainBtn.style, {
            width: "100%", padding: "6px",
            background: "rgba(150, 100, 255, 0.22)",
            border: "1px solid rgba(150, 100, 255, 0.55)",
            color: "#fff", cursor: "pointer", fontFamily: "monospace",
            fontSize: "10px", marginBottom: "10px",
        });
        brainBtn.title = "Opens /aibrain.html — visualizes /bridge/state from the VBA OpenGL FPS and posts AI directives back. Per-enemy state machine (idle/seek/attack) with threat-line viz.";
        brainBtn.addEventListener("click", () => {
            window.open("/aibrain.html", "_blank", "width=1200,height=720,menubar=no,toolbar=no");
        });
        content.appendChild(brainBtn);

        // ---- Status pill -----------------------------------------------
        const statusRow = document.createElement("div");
        Object.assign(statusRow.style, {
            marginBottom: "8px",
            display: "flex", alignItems: "center", gap: "8px",
        });
        const statusDot = document.createElement("span");
        Object.assign(statusDot.style, {
            display: "inline-block", width: "10px", height: "10px",
            borderRadius: "50%", background: "#444",
        });
        const statusText = document.createElement("span");
        statusText.textContent = "Bridge: no data";
        statusRow.appendChild(statusDot);
        statusRow.appendChild(statusText);
        content.appendChild(statusRow);
        this._statusDot = statusDot;
        this._statusText = statusText;

        // ---- State readout ---------------------------------------------
        const stateLbl = document.createElement("div");
        stateLbl.textContent = "VBA game state";
        Object.assign(stateLbl.style, {
            color: "#5ec8ff", fontSize: "10px",
            marginBottom: "4px", letterSpacing: "1.5px",
        });
        content.appendChild(stateLbl);
        const stateBox = document.createElement("div");
        Object.assign(stateBox.style, {
            fontSize: "10px", color: "#aaa", lineHeight: "1.5",
            fontFamily: "monospace",
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255, 153, 0, 0.2)",
            padding: "6px 8px",
            marginBottom: "10px",
            minHeight: "80px",
        });
        stateBox.textContent = "(waiting for first tick…)";
        content.appendChild(stateBox);
        this._stateBox = stateBox;

        // ---- Directive buttons -----------------------------------------
        const dirLbl = document.createElement("div");
        dirLbl.textContent = "Send directive";
        Object.assign(dirLbl.style, {
            color: "#5ec8ff", fontSize: "10px",
            marginBottom: "4px", letterSpacing: "1.5px",
        });
        content.appendChild(dirLbl);

        const dirRow = document.createElement("div");
        Object.assign(dirRow.style, {
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "4px",
            marginBottom: "10px",
        });
        const dirs = [
            { cmd: "move",    label: "MOVE",    extra: {} },
            { cmd: "rotate",  label: "ROTATE",  extra: { yaw: 0.3 } },
            { cmd: "fire",    label: "FIRE",    extra: {} },
            { cmd: "damage",  label: "DAMAGE",  extra: { amount: 10 } },
        ];
        for (const d of dirs) {
            const b = document.createElement("button");
            b.textContent = d.label;
            Object.assign(b.style, {
                padding: "6px 4px", fontSize: "10px",
                fontFamily: "monospace", fontWeight: "700",
                background: "rgba(60, 40, 20, 0.7)",
                border: "1px solid rgba(255, 153, 0, 0.4)",
                color: "#fc9", cursor: "pointer",
            });
            b.addEventListener("click", () => this._sendDirective({ cmd: d.cmd, ...d.extra }));
            dirRow.appendChild(b);
        }
        content.appendChild(dirRow);

        // ---- Custom directive textarea ---------------------------------
        const customLbl = document.createElement("div");
        customLbl.textContent = "Custom JSON";
        Object.assign(customLbl.style, {
            color: "#5ec8ff", fontSize: "10px",
            marginBottom: "4px", letterSpacing: "1.5px",
        });
        content.appendChild(customLbl);
        const customArea = document.createElement("textarea");
        customArea.placeholder = '{"cmd":"move","x":5,"z":2}';
        Object.assign(customArea.style, {
            width: "100%", height: "44px",
            fontSize: "10px", fontFamily: "monospace",
            background: "rgba(0,0,0,0.6)", color: "#fc9",
            border: "1px solid rgba(255, 153, 0, 0.4)",
            padding: "4px 6px",
            marginBottom: "4px",
            resize: "vertical",
            boxSizing: "border-box",
        });
        content.appendChild(customArea);
        const sendBtn = document.createElement("button");
        sendBtn.textContent = "SEND →";
        Object.assign(sendBtn.style, {
            width: "100%", padding: "5px",
            fontSize: "11px", fontFamily: "monospace", fontWeight: "700",
            background: "rgba(255, 153, 0, 0.3)",
            border: "1px solid rgba(255, 153, 0, 0.6)",
            color: "#fff", cursor: "pointer",
            marginBottom: "10px",
        });
        sendBtn.addEventListener("click", () => {
            const text = customArea.value.trim();
            if (!text) return;
            try {
                const dir = JSON.parse(text);
                this._sendDirective(dir);
                customArea.value = "";
            } catch (e) {
                this._setStatus("error", "bad JSON: " + e.message);
            }
        });
        content.appendChild(sendBtn);

        // ---- Log -------------------------------------------------------
        const logLbl = document.createElement("div");
        logLbl.textContent = "Recent activity";
        Object.assign(logLbl.style, {
            color: "#5ec8ff", fontSize: "10px",
            marginBottom: "4px", letterSpacing: "1.5px",
        });
        content.appendChild(logLbl);
        const log = document.createElement("div");
        Object.assign(log.style, {
            fontSize: "9px", color: "#aaa", lineHeight: "1.4",
            maxHeight: "80px", overflowY: "auto",
            background: "rgba(0,0,0,0.4)",
            border: "1px solid rgba(255, 153, 0, 0.2)",
            padding: "4px 6px",
            fontFamily: "monospace",
        });
        log.textContent = "(no activity yet)";
        content.appendChild(log);
        this._log = log;
        this._events = [];

        body.appendChild(content);
        panel.appendChild(body);

        const footer = document.createElement("div");
        footer.className = "lcars-panel-footer";
        panel.appendChild(footer);

        document.body.appendChild(panel);
        tab.addEventListener("click", () => {
            panel.style.display = (panel.style.display === "none") ? "block" : "none";
        });
        this._panel = panel;
    }

    _wireBridge() {
        if (!this.bridge?.on) return;
        // Round 51 - subscribe to the new bridge:state broadcast emitted
        // by the relay on every VBA tick.
        this.bridge.on("bridge:state", (data) => {
            this.lastState = data?.state ?? null;
            this.lastStateMs = Date.now();
            this._logEvent("← state", `tick=${this.lastState?.tick ?? "?"}`);
        });
        // Also log directives so we can see when other clients push.
        this.bridge.on("bridge:directive", (data) => {
            this._logEvent("← dir", JSON.stringify(data?.directive ?? {}));
        });
    }

    _sendDirective(directive) {
        // POST to /bridge/directive on the relay. Local-first: we
        // optimistically log it; the server's broadcast will echo back
        // and confirm via the bridge:directive subscription above.
        fetch(BRIDGE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(directive),
        }).then(r => r.json()).then(j => {
            if (j?.ok) {
                this._logEvent("→ dir", `${directive.cmd} (q=${j.queued})`);
                this._setStatus("ok", `queued: ${j.queued}`);
            } else {
                this._setStatus("error", j?.error || "send failed");
            }
        }).catch(e => {
            this._setStatus("error", e.message);
        });
    }

    _refresh() {
        if (!this.lastStateMs) {
            this._setStatus("none", "no data");
            return;
        }
        const age = Date.now() - this.lastStateMs;
        if (age < 2000)      this._setStatus("ok",    `tick ${this.lastState?.tick}, ${age}ms ago`);
        else if (age < 8000) this._setStatus("stale", `${(age/1000).toFixed(1)}s stale`);
        else                 this._setStatus("dead",  `${(age/1000).toFixed(0)}s dead`);
        // Refresh state box
        if (this.lastState) {
            const s = this.lastState;
            const p = s.player ?? {};
            const pos = p.pos ?? [0, 0, 0];
            const enemies = s.enemies ?? [];
            let txt = `tick:    ${s.tick ?? "?"}\n`;
            txt += `player:  (${(+pos[0]).toFixed(1)}, ${(+pos[1]).toFixed(1)}, ${(+pos[2]).toFixed(1)})\n`;
            if (p.yaw != null)   txt += `yaw:     ${(+p.yaw).toFixed(2)} rad\n`;
            if (p.pitch != null) txt += `pitch:   ${(+p.pitch).toFixed(2)} rad\n`;
            txt += `enemies: ${enemies.length}\n`;
            for (let i = 0; i < Math.min(enemies.length, 5); i++) {
                const e = enemies[i];
                const ep = e.pos ?? [0, 0, 0];
                txt += `  ${e.id}: (${(+ep[0]).toFixed(1)}, ${(+ep[1]).toFixed(1)}, ${(+ep[2]).toFixed(1)})\n`;
            }
            if (enemies.length > 5) txt += `  ... ${enemies.length - 5} more\n`;
            this._stateBox.textContent = txt;
        }
    }

    _setStatus(level, msg) {
        const colors = { ok: "#5eff8a", stale: "#ffd884", dead: "#ff4444", none: "#888", error: "#ff4444" };
        this._statusDot.style.background = colors[level] || "#888";
        this._statusText.textContent = `Bridge: ${msg}`;
    }

    _logEvent(kind, msg) {
        this._events.push({ kind, msg, t: Date.now() });
        if (this._events.length > 8) this._events.shift();
        if (!this._log) return;
        this._log.innerHTML = this._events.map(e => {
            const ts = new Date(e.t).toLocaleTimeString();
            const k = String(e.kind).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
            const m = String(e.msg).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
            return `<div><span style="color:#5ec8ff">${ts}</span> ${k}: ${m}</div>`;
        }).reverse().join("");
    }
}
