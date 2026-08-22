// FILE: ui/narrativeBox.js
// Round 42 — story / event narrative panel. Bottom-left LCARS panel
// that scrolls in narrative lines from the engine's event stream (kaiju
// arrivals, civ events, OGRE waves, etc). Draggable + resizable +
// minimizable to a left-edge LCARS minitab.
//
// Public API:
//   push(text, opts)  — append a line. opts.color="cyan|orange|red|green"
//   clear()           — clear lines
//   show() / hide() / toggle()
//   subscribe(eventBus) — auto-listen to engine events

const STORE_KEY    = "voxelengine.narrative.v1";
const MAX_LINES    = 80;

export class NarrativeBox {

    constructor(opts = {}) {
        this.lines = [];                  // {text,color,ts}
        this.maxLines = opts.maxLines ?? MAX_LINES;
        this._buildDOM();
        // Restore saved bounds + minimized state
        this._restoreState();
        // Optional auto-subscribe to event bus
        if (opts.eventBus) this.subscribe(opts.eventBus);
    }

    _buildDOM() {
        // Main panel (LCARS-themed, draggable, resizable)
        const root = document.createElement("div");
        root.className = "lcars-panel";
        Object.assign(root.style, {
            position: "fixed",
            // v1574 — default placement per user spec: 1 inch from the LEFT and 1 inch from the TOP
            // (CSS in = 96px). Top-anchored so it clears the demo banner instead of riding to the top.
            left: "1in",
            top: "1in",
            // Round 48 - default width doubled from 320 -> 640 so the
            // narrative is readable without manual resize. maxWidth
            // raised 60vw -> 80vw for ultrawides. resize: both still on,
            // so persisted custom widths still apply after restore.
            width: "640px",
            height: "240px",
            minWidth: "280px",
            minHeight: "120px",
            maxWidth: "80vw",
            maxHeight: "70vh",
            zIndex: "9100",
            resize: "both",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
        });

        const header = document.createElement("div");
        header.className = "lcars-panel-header";
        header.style.cursor = "move";
        const title = document.createElement("div");
        title.textContent = "Narrative";
        header.appendChild(title);
        const headerRight = document.createElement("div");
        headerRight.style.display = "flex";
        headerRight.style.gap = "6px";
        headerRight.style.alignItems = "center";
        const headerId = document.createElement("div");
        headerId.className = "lcars-panel-header-id";
        headerId.textContent = "N-09";
        headerRight.appendChild(headerId);
        const minBtn = document.createElement("div");
        minBtn.textContent = "−";
        Object.assign(minBtn.style, {
            cursor: "pointer",
            color: "#000",
            background: "rgba(0,0,0,0.18)",
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            textAlign: "center",
            lineHeight: "16px",
            fontWeight: "700",
            fontSize: "14px",
        });
        minBtn.title = "Minimize";
        headerRight.appendChild(minBtn);
        header.appendChild(headerRight);
        root.appendChild(header);

        const body = document.createElement("div");
        body.className = "lcars-panel-body";
        body.style.flex = "1";
        body.style.minHeight = "0";
        const bar = document.createElement("div");
        bar.className = "lcars-panel-bar";
        body.appendChild(bar);
        const stream = document.createElement("div");
        stream.className = "lcars-panel-content";
        Object.assign(stream.style, {
            flex: "1",
            minHeight: "0",
            overflowY: "auto",
            fontSize: "11px",
            lineHeight: "1.45",
            color: "#fc9",
            fontFamily: "Antonio, 'Helvetica Neue', sans-serif",
            letterSpacing: "0.02em",
        });
        body.appendChild(stream);
        root.appendChild(body);

        const footer = document.createElement("div");
        footer.className = "lcars-panel-footer";
        root.appendChild(footer);

        // Minitab (when hidden) — bottom-left edge
        const minitab = document.createElement("div");
        minitab.className = "lcars-minitab edge-bottom color-green";
        minitab.style.bottom = "0";
        minitab.style.top = "auto";           // v1572 — moved to the bottom-left rail after PERFORMANCE per user request
        minitab.style.left = "auto";
        minitab.style.display = "none";
        minitab.title = "Show Narrative";
        minitab.textContent = "▲ Narrative";

        // Wire min/restore
        minBtn.addEventListener("click", (e) => { e.stopPropagation(); this.hide(); });
        minitab.addEventListener("click", () => this.show());

        // Drag handler on header
        let dragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;
        header.addEventListener("mousedown", (e) => {
            if (e.target === minBtn) return;
            dragging = true;
            const rect = root.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            e.preventDefault();
        });
        window.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dragOffsetX));
            const y = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffsetY));
            root.style.left = x + "px";
            root.style.top  = y + "px";
            root.style.bottom = "auto";
            root.style.right  = "auto";
        });
        window.addEventListener("mouseup", () => {
            if (!dragging) return;
            dragging = false;
            this._saveState();
        });

        // Persist size when resized via the CSS resize handle
        const ro = new ResizeObserver(() => this._saveState());
        ro.observe(root);

        document.body.appendChild(root);
        document.body.appendChild(minitab);
        this.root = root;
        this.stream = stream;
        this.minitab = minitab;

        // v683 — start MINIMIZED by default. User feedback: in demos like
        // blank_sandbox that never emit narrative events, an auto-shown
        // empty panel was intrusive. Now the panel only appears when the
        // user clicks the right-edge "▲ Narrative" minitab, or when the
        // user previously opened it (localStorage state below wins).
        this.root.style.display = "none";
        this.minitab.style.display = "block";

        // Initial seed line
        this.push("Engine ready. Awaiting events.", { color: "cyan" });
    }

    _saveState() {
        try {
            const r = this.root.getBoundingClientRect();
            localStorage.setItem(STORE_KEY, JSON.stringify({
                left: r.left, top: r.top,
                width: r.width, height: r.height,
                hidden: (this.root.style.display === "none"),
            }));
        } catch {}
    }

    _restoreState() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) return;
            const s = JSON.parse(raw);
            if (typeof s.left === "number")   this.root.style.left   = s.left + "px";
            if (typeof s.top === "number")    { this.root.style.top = s.top + "px"; this.root.style.bottom = "auto"; }
            if (typeof s.width === "number")  this.root.style.width  = s.width  + "px";
            if (typeof s.height === "number") this.root.style.height = s.height + "px";
            if (s.hidden) { this.root.style.display = "none"; this.minitab.style.display = "block"; }
            else          { this.root.style.display = "flex"; this.minitab.style.display = "none"; }
        } catch {}
    }

    show() {
        this.root.style.display = "flex";
        this.minitab.style.display = "none";
        this._saveState();
    }
    hide() {
        this.root.style.display = "none";
        this.minitab.style.display = "block";
        this._saveState();
    }
    toggle() {
        if (this.root.style.display === "none") this.show();
        else this.hide();
    }

    clear() { this.stream.innerHTML = ""; this.lines.length = 0; }

    push(text, opts = {}) {
        if (!text) return;
        const colorMap = {
            cyan:   "#94efff",
            orange: "#ffb733",
            red:    "#ff8a8a",
            green:  "#bcef9a",
            pink:   "#ffadc4",
            white:  "#fff",
        };
        const color = colorMap[opts.color] ?? "#fc9";
        const ts = new Date();
        const tsStr = `${String(ts.getHours()).padStart(2,"0")}:${String(ts.getMinutes()).padStart(2,"0")}`;

        this.lines.push({ text, color, ts: tsStr });
        if (this.lines.length > this.maxLines) {
            this.lines.splice(0, this.lines.length - this.maxLines);
        }

        const line = document.createElement("div");
        line.style.color = color;
        line.style.marginBottom = "3px";
        line.innerHTML =
            `<span style="opacity:0.45;font-size:9px;letter-spacing:0.12em;">${tsStr}</span>  ` +
            this._escape(text);
        this.stream.appendChild(line);

        // Cap DOM children too
        while (this.stream.childElementCount > this.maxLines) {
            this.stream.removeChild(this.stream.firstChild);
        }
        // Auto-scroll
        this.stream.scrollTop = this.stream.scrollHeight;
    }

    _escape(s) {
        const d = document.createElement("div");
        d.textContent = String(s);
        return d.innerHTML;
    }

    // Round 43g - tail console.log so the narrative box mirrors what
    // the in-game (~) console sees, filtered to "interesting" lines
    // (events, demo switches, errors). The tilde console keeps the
    // full firehose; this view distills the story-grade subset.
    hookConsole() {
        if (this._consoleHooked) return;
        this._consoleHooked = true;
        const orig = console.log;
        const self = this;
        // Patterns we want to surface in narrative. Each entry: [regex, color]
        const interesting = [
            [/^\[demo\]\s/i,            "orange"],
            [/^\[DEMO\]\s/,             "orange"],
            [/^\[CivManager\]\s/,       "cyan"],
            [/^\[KaijuManager\]\s/,     "red"],
            [/^\[OGRE\]\s/,             "orange"],
            [/^\[OgreArena\]\s/,        "orange"],
            [/^\[LANDER\]\s/,           "orange"],
            [/^\[Weather\]\s/,          "white"],
            [/^\[EventScriptBinder\]\s/,"cyan"],
            [/^\[megastructure\]\s/,    "cyan"],
            [/^\[World\]\s/,            "white"],
            [/^\[main\]\s/,             "white"],
        ];
        console.log = function (...args) {
            try {
                const text = args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ");
                // v623 — in exclusive isolation (blank_sandbox / rigged_showcase
                // / sandbox / centipede / snake / tron / etc.) the panel is a
                // quiet room. Only explicit subscribe() events push narrative
                // text; engine chatter from console.log is suppressed even if
                // the user expanded the panel via the minitab.
                const _iso = (typeof window !== "undefined") ? window._demoIsolation : null;
                if (_iso === "exclusive") {
                    // Still allow errors / warnings to surface via the console
                    // (we don't intercept those here anyway).
                } else for (const [re, color] of interesting) {
                    if (re.test(text)) {
                        // Strip the [Tag] prefix for cleaner narrative reading
                        self.push(text.replace(/^\[[^\]]+\]\s*/, ""), { color });
                        break;
                    }
                }
            } catch {}
            orig.apply(console, args);
        };
    }

    // Auto-bind to engine event bus - picks up known story events.
    subscribe(bus) {
        if (!bus?.subscribe) return;
        bus.subscribe?.((evt) => {
            if (!evt || !evt.type) return;
            switch (evt.type) {
                case "civ:birth":      this.push(`A civilization is born: ${evt.name ?? "?"}.`, { color: "cyan" });  break;
                case "civ:victory":    this.push(`${evt.name ?? "A civ"} achieves conquest.`,    { color: "green" }); break;
                case "civ:fallen":     this.push(`Civilization fallen: ${evt.name ?? "?"}.`,     { color: "red" });   break;
                case "civ:tech":       this.push(`${evt.civ ?? "A civ"} unlocks ${evt.tech ?? "new tech"}.`, { color: "cyan" }); break;
                case "kaiju:spawn":    this.push(`Kaiju arrives: ${evt.name ?? "?"} (${evt.kind ?? "?"}).`,  { color: "red" });  break;
                case "kaiju:death":    this.push(`${evt.name ?? "Kaiju"} has fallen.`,           { color: "green" }); break;
                case "kaiju:engage":   this.push(`${evt.name ?? "Kaiju"} engages.`,              { color: "orange" });break;
                case "ogre:start":     this.push(`OGRE scenario online.`,                       { color: "orange" });break;
                case "ogre:wave":      this.push(`Wave ${evt.wave ?? "?"}: ${evt.variant ?? "?"}.`, { color: "orange" });break;
                case "ogre:cleared":   this.push(`Wave cleared. Score ${evt.score ?? "?"}.`,    { color: "green" }); break;
                case "ogre:breach":    this.push(`Hull breach: ${evt.where ?? "?"}.`,           { color: "red" });   break;
                case "weather:change": this.push(`Weather: ${evt.from ?? "?"} → ${evt.to ?? "?"}.`, { color: "white" }); break;
            }
        });
    }
}
