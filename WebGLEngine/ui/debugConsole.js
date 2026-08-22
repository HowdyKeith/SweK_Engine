// FILE: ui/debugConsole.js
// Round 39 — in-engine debug console. Quake-style bottom overlay.
//
// - Toggle: backtick (`)
// - Intercepts console.log / console.warn / console.error and renders them
// - Public API: log(msg, level) — level = info|warn|error|net
// - Color-coded by level
// - Capped at MAX_LINES (oldest rolled off)
// - Auto-scrolls to bottom unless user is hovering (pause-while-reading)
// - Renders raw HTML messages safely (text-only — no script injection)

const MAX_LINES = 200;

const COLORS = {
    info:  "#90ee90",   // lime
    warn:  "#ffe066",   // yellow
    error: "#ff7777",   // red
    net:   "#88ddff",   // cyan — for bridge / VBA messages
    sys:   "#ddaaff",   // purple — for engine system notices
};

export class DebugConsole {

    constructor(opts = {}) {
        this.visible = false;
        this.lines = [];
        this.pinnedToBottom = true;
        this._installed = false;

        this._buildDOM();
        this._installListeners();
        this._installConsoleInterceptor();

        // Optional bridge wiring — caller can pass bridge here so
        // VBA-pushed { type: "log", msg, level } messages render live.
        if (opts.bridge?.on) {
            opts.bridge.on("log", (data) => {
                const level = data?.level ?? "net";
                const msg = data?.msg ?? data?.message ?? JSON.stringify(data);
                this.log(msg, level);
            });
        }

        this.log("[DebugConsole] ready — backtick (`) toggles visibility", "sys");
    }

    _buildDOM() {
        const el = document.createElement("div");
        el.style.position = "fixed";
        el.style.bottom = "0";
        el.style.left = "0";
        el.style.width = "100%";
        el.style.height = "240px";
        el.style.background = "rgba(0, 0, 0, 0.85)";
        el.style.color = "#cfd";
        el.style.fontFamily = "ui-monospace, Consolas, 'Courier New', monospace";
        el.style.fontSize = "12px";
        el.style.lineHeight = "1.35";
        el.style.padding = "6px 10px";
        el.style.boxSizing = "border-box";
        el.style.overflowY = "auto";
        el.style.borderTop = "2px solid #ffcc00";
        el.style.zIndex = "30000";
        el.style.display = "none";              // hidden by default
        el.style.pointerEvents = "auto";
        el.style.whiteSpace = "pre-wrap";
        el.style.wordBreak = "break-word";

        // Header bar
        const header = document.createElement("div");
        header.style.position = "sticky";
        header.style.top = "0";
        header.style.background = "rgba(0, 0, 0, 0.95)";
        header.style.color = "#ffcc00";
        header.style.padding = "2px 0 4px";
        header.style.borderBottom = "1px solid #444";
        header.style.fontSize = "11px";
        header.style.letterSpacing = "1.2px";
        header.textContent = "DEBUG CONSOLE — backtick to toggle";
        el.appendChild(header);

        // Inner stream container
        const stream = document.createElement("div");
        stream.style.padding = "4px 0 32px";        // bottom pad for input
        el.appendChild(stream);

        // Round 42 — command input. Sticks to bottom of console. Type
        // /help to list available commands. Most commands route to
        // window.* globals (e.g. /demo cycle → window.demo.cycle()).
        const inputRow = document.createElement("div");
        inputRow.style.position = "sticky";
        inputRow.style.bottom = "0";
        inputRow.style.background = "rgba(0, 0, 0, 0.95)";
        inputRow.style.padding = "4px 0";
        inputRow.style.borderTop = "1px solid #444";
        inputRow.style.display = "flex";
        inputRow.style.alignItems = "center";
        inputRow.style.gap = "4px";
        const prompt = document.createElement("span");
        prompt.textContent = ">";
        prompt.style.color = "#ffcc00";
        inputRow.appendChild(prompt);
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "/help · await ok · Shift+Enter expands to textarea";
        Object.assign(input.style, {
            flex: "1",
            background: "transparent",
            color: "#cfd",
            border: "none",
            outline: "none",
            fontFamily: "inherit",
            fontSize: "12px",
        });
        inputRow.appendChild(input);

        // Round 313 — multi-line textarea, shown when user hits Shift+Enter
        // in the single-line input. Pressing Enter (no shift) in the textarea
        // submits and collapses back to single-line.
        const textarea = document.createElement("textarea");
        textarea.placeholder = "// multi-line · Shift+Enter for newline · Enter submits";
        Object.assign(textarea.style, {
            flex: "1",
            background: "transparent",
            color: "#cfd",
            border: "1px solid #444",
            outline: "none",
            fontFamily: "inherit",
            fontSize: "12px",
            resize: "vertical",
            minHeight: "60px",
            display: "none",
        });
        inputRow.appendChild(textarea);

        el.appendChild(inputRow);
        this._input = input;
        this._textarea = textarea;

        // Single-line: Enter submits. Shift+Enter swaps to textarea.
        input.addEventListener("keydown", (e) => {
            if (e.code === "Backquote") e.stopPropagation();
            if (e.key === "Enter" && e.shiftKey) {
                e.preventDefault();
                textarea.value = input.value;
                input.value = "";
                input.style.display = "none";
                textarea.style.display = "";
                textarea.focus();
                return;
            }
            if (e.key === "Enter" && input.value.trim().length > 0) {
                const line = input.value.trim();
                input.value = "";
                this._runCommand(line);
            }
        });

        // Multi-line: Enter submits, Shift+Enter newline. ESC collapses.
        textarea.addEventListener("keydown", (e) => {
            if (e.code === "Backquote") e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const block = textarea.value.trim();
                if (block.length > 0) {
                    textarea.value = "";
                    textarea.style.display = "none";
                    input.style.display = "";
                    input.focus();
                    this._runCommand(block);
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                textarea.value = "";
                textarea.style.display = "none";
                input.style.display = "";
                input.focus();
            }
        });

        document.body.appendChild(el);
        this.el = el;
        this.stream = stream;

        // Hovering pauses auto-scroll so user can read
        el.addEventListener("mouseenter", () => { this.pinnedToBottom = false; });
        el.addEventListener("mouseleave", () => { this.pinnedToBottom = true;  this._scrollToBottom(); });
        el.addEventListener("scroll", () => {
            // If user manually scrolls to bottom, re-pin
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
            if (atBottom) this.pinnedToBottom = true;
        });
    }

    // Round 42 — slash-prefixed command dispatcher. /help lists all.
    // Round 313 — async eval (wraps in AsyncFunction so `await` works);
    // result is logged after the promise resolves so multi-second awaits
    // (like `await window._frameProf.start(5)`) work cleanly.
    _runCommand(line) {
        // v335 — multi-line script support. If the input contains newlines
        // OR the ";;" separator, split into individual commands and run
        // each in sequence. Otherwise run as a single command (existing
        // single-line behavior).
        //
        //   streamer.setEnabled(true);;meshPP.setEnabled(true);;dumpChunkGrid()
        //
        // …runs as three commands with three result lines, not one.
        // Useful for pasting setup scripts shared in chat.
        if (line.includes("\n") || line.includes(";;")) {
            const parts = line
                .split(/\r?\n|;;/)         // split on newline OR ";;"
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith("//"));
            if (parts.length > 1) {
                this.log(`> [script: ${parts.length} commands]`, "sys");
                // Run sequentially — await each so order is preserved and
                // results render in order. Don't bail on errors; log them
                // and continue so the rest of the script still executes.
                (async () => {
                    for (let i = 0; i < parts.length; i++) {
                        const cmd = parts[i];
                        this.log(`  [${i + 1}/${parts.length}] ${cmd}`, "sys");
                        await this._runOne(cmd);
                    }
                    this.log(`< script done (${parts.length} commands)`, "sys");
                })();
                return;
            }
            // Only one non-empty part — fall through to single-command path
            if (parts.length === 1) line = parts[0];
        }
        this._runOne(line);
    }

    /** Internal — run one command (slash-cmd or JS) and return a promise
     *  that resolves when the command's result has been logged. v335 — was
     *  inlined in _runCommand; extracted so the multi-line path can await
     *  each step. */
    async _runOne(line) {
        this.log("> " + line, "sys");
        if (!line.startsWith("/")) {
            // Try evaluating as JS. Wrap in AsyncFunction so the user
            // can `await` directly. For one-liners that don't await,
            // the return value is still captured and logged.
            try {
                const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                const fn = new AsyncFunction(`return (${line})`);
                try {
                    const result = await fn();
                    this.log(this._fmtResult(result), "info");
                } catch (err) {
                    this.log("ERR: " + (err?.message ?? err), "error");
                }
            } catch (err) {
                // Fall back to treating as a statement block (no implicit return)
                try {
                    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                    const fn = new AsyncFunction(line);
                    try { await fn(); this.log("(ok)", "info"); }
                    catch (e) { this.log("ERR: " + (e?.message ?? e), "error"); }
                } catch (err2) {
                    this.log("ERR: " + err2.message, "error");
                }
            }
            return;
        }
        const parts = line.slice(1).split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);
        const COMMANDS = this._buildCommands();
        if (!COMMANDS[cmd]) {
            this.log(`unknown command: /${cmd} — try /help`, "warn");
            return;
        }
        try {
            await COMMANDS[cmd].run(args);
        } catch (err) {
            this.log("ERR: " + err.message, "error");
        }
    }

    // Round 313 — pretty-print results. Stringify objects with formatting
    // so `entityPerf.snapshot()` doesn't show as "[object Object]".
    _fmtResult(v) {
        if (v === undefined) return "undefined";
        if (v === null) return "null";
        if (typeof v === "function") return `[function ${v.name || "anonymous"}]`;
        if (typeof v === "object") {
            try { return JSON.stringify(v, null, 2); }
            catch { return String(v); }
        }
        return String(v);
    }

    _buildCommands() {
        const w = (typeof window !== "undefined") ? window : {};
        const log = (m, l = "info") => this.log(m, l);
        return {
            help: {
                desc: "list available commands",
                run: () => {
                    const cmds = this._buildCommands();
                    log("─── DEBUG CONSOLE COMMANDS ───", "sys");
                    for (const [name, c] of Object.entries(cmds)) {
                        log(`  /${name.padEnd(12)} ${c.desc}`, "info");
                    }
                    log("", "info");
                    log("(or paste JS — e.g. window.world.size())", "sys");
                    log("KEYBOARD: ` toggles console  |  ? toggles demo help", "sys");
                },
            },
            clear: {
                desc: "clear the console stream",
                run: () => { this.stream.innerHTML = ""; },
            },
            copy: {
                desc: "copy console buffer to system clipboard (or pass N for last N lines)",
                run: async (a) => {
                    const n = a[0] ? parseInt(a[0], 10) : null;
                    const elems = (Number.isFinite(n) && n > 0)
                        ? this.lines.slice(-n)
                        : this.lines.slice();
                    // this.lines holds DOM elements — pull textContent
                    const text = elems.map(el => el.textContent ?? "").join("\n");
                    try {
                        await navigator.clipboard.writeText(text);
                        log(`copied ${elems.length} line(s) to clipboard (${text.length} chars)`, "sys");
                    } catch (e) {
                        log(`clipboard write failed: ${e?.message ?? e} — try /dump to log instead`, "warn");
                    }
                },
            },
            dump: {
                desc: "log full buffer back to itself with a header (useful when /copy denied)",
                run: () => {
                    // Snapshot first — calling log inside the loop appends
                    // new lines and would loop infinitely.
                    const snapshot = this.lines.slice().map(el => el.textContent ?? "");
                    log("──── BEGIN CONSOLE DUMP ────", "sys");
                    for (const text of snapshot) log(text, "info");
                    log("──── END CONSOLE DUMP ────", "sys");
                },
            },
            demo: {
                desc: "demo cycle | demo <id>  (kaiju/ogre/boids/life/lander/lorenz)",
                run: (a) => {
                    const d = w.demo;
                    if (!d) return log("no demo manager", "warn");
                    if (a[0] === "cycle" || !a[0]) { d.cycle(); return; }
                    // Set explicit demo by id
                    if (d.setById) d.setById(a[0]);
                    else log("setById not exposed", "warn");
                },
            },
            ogre: {
                desc: "ogre start | stop | status | sub | carrier | sea | moon | mars",
                run: (a) => {
                    const o = w.ogre;
                    if (!o) return log("no ogre namespace", "warn");
                    const sub = a[0] || "start";
                    if (typeof o[sub] === "function") o[sub]();
                    else log(`unknown ogre subcommand: ${sub}`, "warn");
                },
            },
            pov: {
                desc: "pov | povStop | povNext | povPrev | povFree | povControl",
                run: (a) => {
                    const o = w.ogre;
                    if (!o) return log("no ogre", "warn");
                    const sub = a[0] || "pov";
                    const fn = o[sub] || o["pov" + sub.charAt(0).toUpperCase() + sub.slice(1)];
                    if (typeof fn === "function") fn();
                    else log(`unknown pov subcommand: ${sub}`, "warn");
                },
            },
            audio: {
                desc: "audio on | off | volume <0-100>",
                run: (a) => {
                    const am = w.audioManager;
                    if (!am) return log("no audio", "warn");
                    if (a[0] === "on")  am.audio.masterGain && (am.audio.masterGain.gain.value = 0.92);
                    else if (a[0] === "off") am.audio.masterGain && (am.audio.masterGain.gain.value = 0);
                    else if (a[0] === "volume") {
                        const v = parseInt(a[1]) / 100;
                        if (am.audio.masterGain) am.audio.masterGain.gain.value = Math.max(0, Math.min(1, v));
                        log(`master volume: ${v}`, "info");
                    } else log("usage: /audio on|off|volume <0-100>", "warn");
                },
            },
            fps: {
                desc: "show current FPS",
                run: () => {
                    log(`fps: ${w._lastFps ?? "?"}`, "info");
                },
            },
            cam: {
                desc: "show camera position",
                run: () => {
                    const c = w._camera || w.camera;
                    if (!c?.position) return log("no camera", "warn");
                    log(`cam: x=${c.position.x.toFixed(1)} y=${c.position.y.toFixed(1)} z=${c.position.z.toFixed(1)}`, "info");
                },
            },
            tama: {
                desc: "show | hide  (the Pip tama window)",
                run: (a) => {
                    const t = w._tamagotchi;
                    if (!t) return log("no tamagotchi", "warn");
                    if (a[0] === "hide") t.root.style.display = "none";
                    else t.root.style.display = "block";
                },
            },
            reload: {
                desc: "reload the page",
                run: () => { location.reload(); },
            },
        };
    }

    _installListeners() {
        document.addEventListener("keydown", (e) => {
            if (e.code === "Backquote" && !e.repeat) {
                this.toggle();
                e.preventDefault();
                e.stopPropagation();
            }
        });
    }

    // Wrap console.log / warn / error so all engine logs flow through here
    // too. Original console behavior preserved (still hits browser DevTools).
    _installConsoleInterceptor() {
        if (this._installed) return;
        this._installed = true;
        const orig = {
            log:   console.log.bind(console),
            warn:  console.warn.bind(console),
            error: console.error.bind(console),
        };
        const stringify = (args) => args.map(a => {
            if (typeof a === "string") return a;
            try { return JSON.stringify(a); } catch (_) { return String(a); }
        }).join(" ");
        console.log = (...args) => {
            orig.log(...args);
            this.log(stringify(args), "info");
        };
        console.warn = (...args) => {
            orig.warn(...args);
            this.log(stringify(args), "warn");
        };
        console.error = (...args) => {
            orig.error(...args);
            this.log(stringify(args), "error");
        };
    }

    // ----- Public API -----

    show() {
        this.visible = true;
        this.el.style.display = "block";
        this._scrollToBottom();
        if (this._input) setTimeout(() => this._input.focus(), 30);
    }
    hide() { this.visible = false; this.el.style.display = "none";  }
    toggle() { this.visible ? this.hide() : this.show(); }

    log(msg, level = "info") {
        const color = COLORS[level] ?? COLORS.info;
        const time = new Date();
        const ts = `${String(time.getHours()).padStart(2,"0")}:${String(time.getMinutes()).padStart(2,"0")}:${String(time.getSeconds()).padStart(2,"0")}`;

        const line = document.createElement("div");
        line.style.color = color;
        // Plain text escape — never inject HTML from log args
        line.textContent = `[${ts}] ${typeof msg === "string" ? msg : String(msg)}`;
        this.stream.appendChild(line);
        this.lines.push(line);

        // Roll oldest if over cap
        while (this.lines.length > MAX_LINES) {
            const old = this.lines.shift();
            old.remove();
        }
        if (this.pinnedToBottom) this._scrollToBottom();
    }

    clear() {
        this.lines.forEach(l => l.remove());
        this.lines.length = 0;
    }

    _scrollToBottom() {
        this.el.scrollTop = this.el.scrollHeight;
    }
}
