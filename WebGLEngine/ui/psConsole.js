// FILE: ui/psConsole.js
// VERSION: v2 — round 119
//
// LCARS-styled PowerShell debug console with two tabs:
//
//   LISTENER tab  → live stdout/stderr from the spawned KPopListener.ps1.
//                   Read-only: the listener loop doesn't read stdin, so
//                   sending text there is almost always inert. Useful
//                   for watching toast pipeline events, tray init,
//                   BurntToast warnings, etc.
//
//   REPL tab      → interactive PowerShell session spawned via
//                   /kpop/repl-start (separate from the listener).
//                   Type any cmdlet, get its output back. This is the
//                   "send debugs through" path the user asked for.
//                   Toggle "Start REPL" / "Stop REPL" up top.
//
// Both tabs share the underlying ps_log WS event stream. Each line
// carries source: "listener" | "repl" — the UI filters by active tab.

const MAX_LINES = 400;

export class PSConsole {

    constructor({ bridge } = {}) {
        this.bridge = bridge ?? null;
        this.linesByTab = {
            listener: [],
            repl:     [],
        };
        this.activeTab = "listener";
        this.replRunning = false;
        this.replPid = null;
        this.open = false;
        this._build();
        this._wireBridge();
        this._fetchHistory();
        this._refreshReplState();
        setInterval(() => this._refreshReplState(), 3000);
    }

    _build() {
        // v688 — bottom-edge position. STATUS sits at left:140, PERFORMANCE
        // (new this round) will sit at left:340. PS LOG goes between them at
        // left:240 with a true bottom:0 anchor (was bottom:20 in v684 which
        // floated it above the screen edge — user-flagged as "floating").
        const tab = document.createElement("div");
        tab.className = "lcars-minitab edge-bottom color-cyan";
        tab.style.bottom = "0";
        tab.style.top = "auto";
        tab.style.left = "240px";
        tab.style.right = "auto";
        tab.textContent = "PS LOG";
        tab.title = "PowerShell debug console — listener log + interactive REPL";
        tab.addEventListener("click", () => this.toggle());
        document.body.appendChild(tab);
        this._tab = tab;

        // Panel
        const panel = document.createElement("div");
        panel.className = "lcars-panel";
        Object.assign(panel.style, {
            position: "fixed",
            left: "60px",
            bottom: "20px",
            width: "min(720px, 60vw)",
            height: "min(560px, 75vh)",
            display: "none",
            flexDirection: "column",
            padding: "12px",
            background: "rgba(10, 8, 20, 0.92)",
            border: "1px solid rgba(0, 220, 255, 0.35)",
            borderRadius: "6px",
            zIndex: "9000",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
        });

        // Tab row at the top
        const tabRow = document.createElement("div");
        Object.assign(tabRow.style, {
            display: "flex", gap: "2px", marginBottom: "8px",
            fontFamily: "monospace", fontSize: "11px",
        });
        const mkTabBtn = (id, label) => {
            const b = document.createElement("button");
            b.dataset.tab = id;
            b.textContent = label;
            Object.assign(b.style, {
                flex: "1", padding: "6px 10px",
                fontFamily: "monospace", fontSize: "11px",
                background: "rgba(0, 220, 255, 0.05)", color: "#aef",
                border: "1px solid rgba(0, 220, 255, 0.25)",
                borderBottom: "none",
                borderRadius: "3px 3px 0 0",
                cursor: "pointer", letterSpacing: "0.1em",
                textTransform: "uppercase",
            });
            b.addEventListener("click", () => this._setTab(id));
            return b;
        };
        this._tabBtns = {
            listener: mkTabBtn("listener", "LISTENER"),
            repl:     mkTabBtn("repl",     "REPL"),
        };
        tabRow.appendChild(this._tabBtns.listener);
        tabRow.appendChild(this._tabBtns.repl);
        panel.appendChild(tabRow);

        // Header row — varies by tab. We swap content in _setTab.
        const header = document.createElement("div");
        Object.assign(header.style, {
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "6px", fontFamily: "monospace", color: "#0cf",
            letterSpacing: "0.1em", fontSize: "10px", minHeight: "24px",
        });
        panel.appendChild(header);
        this._header = header;

        // Log area
        const logBox = document.createElement("div");
        Object.assign(logBox.style, {
            flex: "1",
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: "11px",
            lineHeight: "1.4",
            padding: "6px 8px",
            background: "rgba(0, 0, 0, 0.6)",
            border: "1px solid rgba(0, 220, 255, 0.15)",
            borderRadius: "3px",
            color: "#aef",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
        });
        panel.appendChild(logBox);
        this._logBox = logBox;

        // Input row + send button
        // Round 119/120 — textarea (not input) so Shift+Enter adds a
        // newline for multi-line PowerShell statements (function blocks,
        // if/else, try/catch). Bare Enter submits the whole accumulated
        // text as a single stdin write — PowerShell parses it as one
        // statement, which matches how the interactive console behaves
        // when you paste a block. The textarea auto-grows up to ~5 lines.
        const inputRow = document.createElement("div");
        Object.assign(inputRow.style, {
            display: "flex", gap: "6px", marginTop: "8px",
            alignItems: "flex-end",
        });
        const input = document.createElement("textarea");
        input.rows = 1;
        input.placeholder = "type a command (Enter to send · Shift+Enter for newline)…";
        Object.assign(input.style, {
            flex: "1", padding: "6px 8px", fontFamily: "monospace",
            fontSize: "11px", background: "rgba(0, 0, 0, 0.7)",
            color: "#0cf", border: "1px solid rgba(0, 220, 255, 0.3)",
            borderRadius: "3px", outline: "none",
            resize: "none", minHeight: "26px", maxHeight: "120px",
            lineHeight: "1.4", overflowY: "auto",
        });
        // Auto-grow up to maxHeight as lines are added
        const autosize = () => {
            input.style.height = "auto";
            input.style.height = Math.min(120, input.scrollHeight) + "px";
        };
        input.addEventListener("input", autosize);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this._send(input.value);
            } else if (e.key === "Escape") {
                this.toggle();
            }
            // Shift+Enter: fall through, browser inserts newline naturally
        });
        inputRow.appendChild(input);
        const sendBtn = document.createElement("button");
        sendBtn.textContent = "SEND";
        Object.assign(sendBtn.style, {
            padding: "6px 12px", fontFamily: "monospace", fontSize: "11px",
            background: "rgba(0, 220, 255, 0.15)", color: "#0cf",
            border: "1px solid rgba(0, 220, 255, 0.5)", borderRadius: "3px",
            cursor: "pointer", letterSpacing: "0.1em",
        });
        sendBtn.addEventListener("click", () => this._send(input.value));
        inputRow.appendChild(sendBtn);

        const clearBtn = document.createElement("button");
        clearBtn.textContent = "CLEAR";
        Object.assign(clearBtn.style, {
            padding: "6px 12px", fontFamily: "monospace", fontSize: "11px",
            background: "rgba(60, 60, 60, 0.4)", color: "#888",
            border: "1px solid rgba(120, 120, 120, 0.4)", borderRadius: "3px",
            cursor: "pointer", letterSpacing: "0.1em",
        });
        clearBtn.addEventListener("click", () => {
            this.linesByTab[this.activeTab] = [];
            this._render();
        });
        inputRow.appendChild(clearBtn);

        panel.appendChild(inputRow);
        this._input = input;
        document.body.appendChild(panel);
        this._panel = panel;

        this._setTab("listener");
    }

    _setTab(id) {
        this.activeTab = id;
        // Tab button styles
        for (const [tabId, btn] of Object.entries(this._tabBtns)) {
            const active = tabId === id;
            btn.style.background = active ? "rgba(0, 220, 255, 0.25)" : "rgba(0, 220, 255, 0.05)";
            btn.style.color      = active ? "#0cf" : "#aef";
            btn.style.borderColor= active ? "rgba(0, 220, 255, 0.5)" : "rgba(0, 220, 255, 0.25)";
            btn.style.fontWeight = active ? "bold" : "normal";
        }
        // Header per tab
        if (id === "listener") {
            this._header.innerHTML = `<span style="opacity:0.7;">live tail of KPopListener.ps1 stdout/stderr</span><span style="font-size:10px; opacity:0.6;">read-only</span>`;
            this._input.placeholder = "(listener is read-only; commands rarely do anything here)";
        } else {
            // REPL header has Start/Stop toggle
            this._header.innerHTML = "";
            const left = document.createElement("span");
            left.style.opacity = "0.7";
            left.textContent = "interactive PowerShell — Shift+Enter for newline";
            this._header.appendChild(left);
            const right = document.createElement("span");
            right.style.display = "flex";
            right.style.gap = "8px";
            right.style.alignItems = "center";
            this._replStatusEl = document.createElement("span");
            this._replStatusEl.style.fontSize = "10px";
            this._replStatusEl.style.opacity = "0.7";
            right.appendChild(this._replStatusEl);
            const toggleBtn = document.createElement("button");
            toggleBtn.textContent = "…";
            Object.assign(toggleBtn.style, {
                padding: "3px 8px", fontFamily: "monospace", fontSize: "10px",
                background: "rgba(255, 153, 0, 0.15)", color: "#fc3",
                border: "1px solid rgba(255, 153, 0, 0.4)", borderRadius: "3px",
                cursor: "pointer", letterSpacing: "0.1em",
            });
            toggleBtn.addEventListener("click", () => this._toggleRepl());
            this._replToggleBtn = toggleBtn;
            right.appendChild(toggleBtn);
            this._header.appendChild(right);
            this._input.placeholder = this.replRunning
                ? "type a cmdlet · Enter to send · Shift+Enter for multi-line block"
                : "click START REPL above first";
        }
        this._renderReplStatus();
        this._render();
    }

    _renderReplStatus() {
        if (this.activeTab !== "repl") return;
        if (this._replStatusEl) {
            this._replStatusEl.textContent = this.replRunning
                ? `running · pid ${this.replPid}`
                : "stopped";
            this._replStatusEl.style.color = this.replRunning ? "#5eff8a" : "#aaa";
        }
        if (this._replToggleBtn) {
            this._replToggleBtn.textContent = this.replRunning ? "STOP REPL" : "START REPL";
        }
    }

    _wireBridge() {
        if (this.bridge?.on) {
            this.bridge.on("ps_log", (msg) => this._appendLine(msg));
        }
    }

    async _fetchHistory() {
        try {
            const r = await fetch("/kpop/log-history");
            const j = await r.json();
            if (j?.lines) {
                for (const line of j.lines) this._appendLine(line, false);
                this._render();
            }
        } catch {
            // Relay may be offline
        }
    }

    async _refreshReplState() {
        if (typeof window !== "undefined" && window.__swekPollsPaused) return;   // v1870 — hold while Settings is open
        try {
            const r = await fetch("/kpop/repl-state");
            const j = await r.json();
            this.replRunning = !!j?.running;
            this.replPid     = j?.pid ?? null;
        } catch {
            this.replRunning = false;
            this.replPid = null;
        }
        this._renderReplStatus();
    }

    async _toggleRepl() {
        const url = this.replRunning ? "/kpop/repl-stop" : "/kpop/repl-start";
        try {
            await fetch(url, { method: "POST" });
        } catch (e) {
            this._appendLine({ stream: "system", text: `[REPL toggle error: ${e.message || e}]`, source: "repl" });
        }
        // State refresh shortly after — give the OS a beat to spawn/kill
        setTimeout(() => this._refreshReplState(), 400);
    }

    _appendLine(msg, render = true) {
        if (!msg || typeof msg.text !== "string") return;
        const source = msg.source || "listener";
        const bucket = this.linesByTab[source];
        if (!bucket) return;
        bucket.push({
            stream: msg.stream || "stdout",
            text:   msg.text,
            ts:     msg.ts || Date.now(),
        });
        if (bucket.length > MAX_LINES) bucket.shift();
        if (render && this.open && source === this.activeTab) this._render();
    }

    _render() {
        if (!this._logBox) return;
        const lines = this.linesByTab[this.activeTab] || [];
        const wasAtBottom = (this._logBox.scrollHeight - this._logBox.scrollTop - this._logBox.clientHeight) < 40;
        const html = lines.map((l) => {
            const color = l.stream === "stderr" ? "#ff7070"
                        : l.stream === "system" ? "#fc3"
                        : "#aef";
            const tag = l.stream === "stderr" ? "ERR "
                      : l.stream === "system" ? "SYS "
                      : "    ";
            const safe = this._esc(l.text);
            return `<span style="color:${color};"><span style="opacity:0.5;">${tag}</span>${safe}</span>`;
        }).join("\n");
        this._logBox.innerHTML = html || `<span style="opacity:0.4;">— no output yet —</span>`;
        if (wasAtBottom) this._logBox.scrollTop = this._logBox.scrollHeight;
    }

    _esc(s) {
        return String(s).replace(/[<>&]/g, c => ({ "<":"&lt;",">":"&gt;","&":"&amp;" }[c]));
    }

    async _send(text) {
        text = text.trim();
        if (!text) return;
        // Route to the appropriate endpoint based on active tab
        const url = (this.activeTab === "repl") ? "/kpop/repl-stdin" : "/kpop/stdin";
        try {
            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
            });
            if (!r.ok) {
                const j = await r.json().catch(() => ({}));
                this._appendLine({
                    stream: "system",
                    text: `[send failed: ${j.error || r.status}]`,
                    source: this.activeTab,
                });
            } else {
                this._input.value = "";
                // Round 120 — collapse textarea back to single-line
                // after a successful send so the next prompt starts
                // compact regardless of how tall the last entry was.
                this._input.style.height = "auto";
            }
        } catch (e) {
            this._appendLine({
                stream: "system",
                text: `[send error: ${e.message || e}]`,
                source: this.activeTab,
            });
        }
    }

    toggle() {
        this.open = !this.open;
        this._panel.style.display = this.open ? "flex" : "none";
        if (this.open) {
            this._render();
            this._input.focus();
        }
    }
}
