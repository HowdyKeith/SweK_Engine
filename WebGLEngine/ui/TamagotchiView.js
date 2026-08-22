// FILE: ui/TamagotchiView.js
// Round 47 — floating tamagotchi character driven by KPopListener +
// engine events.
//
// Architecture:
//   - Draggable HTML container (CSS, position absolute)
//   - SVG character with expression + body parts that animate
//   - Subscribes to bridge "tama" messages — protocol:
//        { type: "tama", action: "feed" | "play" | "sleep" | "alert"
//                       | "happy" | "sad" | "speak", text?: string }
//   - Stats persisted to localStorage:
//        hunger     0..100 (high = hungry)
//        happiness  0..100 (high = happy)
//        energy     0..100 (high = rested)
//   - Idle animation: subtle bob, occasional blink, hunger drift over time
//   - Click character to interact (cycles through emotions)

const STORE_KEY = "voxelengine.tama.v1";
const TICK_MS   = 1000;     // 1Hz stat decay

// Stat decay rates per second
const HUNGER_RATE     = 0.05;   // slow; reaches max in ~33min
const HAPPINESS_RATE  = 0.03;
const ENERGY_RATE     = -0.02;  // negative = recovers (rest is default)

export class TamagotchiView {

    constructor(opts = {}) {
        this.bridge = opts.bridge ?? null;
        this.toaster = opts.toaster ?? null;
        this.name = opts.name ?? "Pip";
        // v412 — headless mode. The old "PIP the Listener" tamagotchi window
        // was retired in favor of the KPop LISTENER (PipAvatar) panel, but
        // its stat-decay sim + tama message handling are still used. When
        // headless, build the DOM nodes in memory (so every element-touching
        // method keeps working on detached nodes) but never attach them to
        // the document — so the panel can't flash on startup.
        this.headless = opts.headless ?? false;

        // Load persistent stats
        this.stats = this._loadStats();

        // Visual state — recomputed from stats every tick
        this.expression = "neutral";   // neutral / happy / sad / hungry / sleepy
        this.bobOffset = 0;
        this.bobPhase = 0;
        this.lastBlink = 0;
        this.blinkOpen = true;

        this._buildDOM();
        this._wire();
        this._tickLoop();

        // Subscribe to bridge "tama" messages
        if (this.bridge?.on) {
            this.bridge.on("tama", (data) => this._handleMessage(data));
        }
    }

    _loadStats() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (raw) return JSON.parse(raw);
        } catch {}
        return { hunger: 30, happiness: 70, energy: 80, lastTick: Date.now() };
    }

    _saveStats() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(this.stats)); }
        catch {}
    }

    _buildDOM() {
        const root = document.createElement("div");
        root.id = "tama-window";
        Object.assign(root.style, {
            position: "fixed",
            // v739 — unlock from bottom edge. Was bottom:14px which made the
            // panel feel glued to the bottom. Now using top so drag can move
            // it freely vertically. transformOrigin moved from "bottom right"
            // to "top right" so the 0.6 scale doesn't visually anchor to the
            // bottom-right corner.
            left: "auto",
            right: "14px",
            top: "calc(100vh - 280px)",   // initial: near bottom but not glued
            bottom: "auto",
            width: "230px",
            background: "linear-gradient(180deg, #0f1822 0%, #060a10 100%)",
            border: "2px solid #4af",
            borderRadius: "12px",
            boxShadow: "0 0 20px rgba(60,160,255,0.35), inset 0 0 30px rgba(60,160,255,0.08)",
            color: "#cfd",
            fontFamily: "ui-monospace, Consolas, monospace",
            zIndex: "26000",
            userSelect: "none",
            overflow: "hidden",
            // Round 87 — show Pip by default. Round 42 hid him behind
            // a tiny reopen-tab that gets buried under crowded right-
            // edge dock minitabs. Restoring his visibility on first
            // sight; user can still hide via the × button if needed.
            display: "block",
            // Round 105 — 60% scale. transform-origin anchored to the
            // bottom-right corner so the panel shrinks IN PLACE toward
            // the corner it's docked at. The docked avatars use
            // getBoundingClientRect() which reflects the post-transform
            // visual rect, so their positioning auto-adjusts to the
            // new smaller Pip footprint without any extra plumbing.
            transform: "scale(0.6)",
            transformOrigin: "top right",   // v739 — was "bottom right"
        });

        // Round 42 — reopen tab styled to match LCARS theme. Shown when
        // Pip is hidden (default state). Click to bring Pip back.
        const reopenTab = document.createElement("div");
        reopenTab.id = "tama-reopen-tab";
        reopenTab.className = "lcars-minitab edge-right color-pink";
        reopenTab.textContent = `▼ ${this.name}`;
        // Right-edge dock stack (Cameras / Civs / Kaiju / Assets) starts
        // at top:56 with 86px slots, so 4 slots occupy through ~400px.
        // Pip's reopen tab lives at slot 5.
        // Round 87 — reopen tab starts hidden since Pip is visible
        // by default. It shows when user × dismisses Pip.
        reopenTab.style.display = "none";
        reopenTab.style.top = "420px";
        reopenTab.title = "Show " + this.name;
        reopenTab.addEventListener("click", () => {
            root.style.display = "block";
            reopenTab.style.display = "none";
        });
        if (!this.headless) document.body.appendChild(reopenTab);
        this._reopenTab = reopenTab;

        // Header bar (drag handle)
        const header = document.createElement("div");
        Object.assign(header.style, {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(40,80,120,0.5)",
            padding: "5px 9px",
            cursor: "move",
            fontSize: "10px",
            letterSpacing: "1.5px",
            borderBottom: "1px solid rgba(60,160,255,0.4)",
        });
        const title = document.createElement("span");
        title.textContent = `${this.name.toUpperCase()}`;
        title.style.color = "#9cf";
        this._titleEl = title;        // Round 105 — exposed for setName()
        const close = document.createElement("span");
        close.textContent = "−";
        close.style.cursor = "pointer";
        close.style.padding = "0 5px";
        close.title = "Minimize to tab";
        close.addEventListener("click", () => {
            root.style.display = "none";
            // Round 42 — bring back the reopen tab
            if (this._reopenTab) this._reopenTab.style.display = "block";
        });
        header.append(title, close);
        root.appendChild(header);

        // Character canvas — uses SVG for crisp scaling
        const charBox = document.createElement("div");
        Object.assign(charBox.style, {
            width: "100%",
            height: "150px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "radial-gradient(ellipse at 50% 60%, rgba(60,160,255,0.15) 0%, transparent 70%)",
            position: "relative",            // Round 88 — for absolute overlays
        });

        // Round 88 — ringer icon. Appears + shakes when bridge sends a
        // "tama" message (Listener activity). Auto-hides after 2.5s.
        const ringer = document.createElement("div");
        ringer.id = "tama-ringer";
        ringer.textContent = "📞";
        Object.assign(ringer.style, {
            position: "absolute",
            top: "6px",
            left: "8px",
            fontSize: "22px",
            opacity: "0",
            pointerEvents: "none",
            transition: "opacity 200ms",
            transformOrigin: "50% 50%",
            zIndex: "5",
            // Round 89.1 — title hint on hover so the icon's meaning is clear
            title: "Listener status",
        });
        ringer.title = "Listener status";
        charBox.appendChild(ringer);
        // Inject @keyframes once per page (idempotent)
        if (!document.getElementById("tama-ringer-keyframes")) {
            const s = document.createElement("style");
            s.id = "tama-ringer-keyframes";
            s.textContent = `
                @keyframes tama-ringer-shake {
                    0%,100% { transform: rotate(0deg) scale(1.0); }
                    15%     { transform: rotate(-22deg) scale(1.15); }
                    30%     { transform: rotate( 22deg) scale(1.15); }
                    45%     { transform: rotate(-18deg) scale(1.1); }
                    60%     { transform: rotate( 18deg) scale(1.1); }
                    75%     { transform: rotate(-10deg) scale(1.05); }
                    90%     { transform: rotate( 10deg) scale(1.05); }
                }
                /* Round 89.1 — gentle dim pulse for the offline indicator
                   so it reads as "passive status" rather than "alarming." */
                @keyframes tama-ringer-offline {
                    0%,100% { opacity: 0.55; }
                    50%     { opacity: 0.30; }
                }
            `;
            document.head.appendChild(s);
        }
        this._ringerEl = ringer;
        // Round 89.1 — start a poll that flips the icon based on
        // bridge.connected. Three states:
        //   offline (bridge disconnected): persistent 📵 with dim pulse
        //   online + no recent message    : hidden
        //   online + new message arrived  : 📞 shake (handled in _ringRinger)
        this._listenerState = "unknown";
        this._refreshListenerIcon();           // initial
        this._listenerPoll = setInterval(() => this._refreshListenerIcon(), 1500);

        // Round 88 — character toggle. Switches between the SVG round-
        // blob (default) and a boxy robot face. Button shows the OTHER
        // character so the click reads as "switch to that."
        const charToggle = document.createElement("div");
        charToggle.textContent = "🤖";
        charToggle.title = "Switch character";
        Object.assign(charToggle.style, {
            position: "absolute",
            top: "6px",
            right: "8px",
            fontSize: "16px",
            cursor: "pointer",
            opacity: "0.55",
            userSelect: "none",
            zIndex: "5",
            transition: "opacity 120ms",
        });
        charToggle.addEventListener("mouseenter", () => charToggle.style.opacity = "1");
        charToggle.addEventListener("mouseleave", () => charToggle.style.opacity = "0.55");
        charBox.appendChild(charToggle);
        this._charToggle = charToggle;
        this._currentChar = "blob";              // "blob" | "robot"

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 100 110");
        svg.setAttribute("width", "120");
        svg.setAttribute("height", "130");
        svg.style.cursor = "pointer";
        svg.style.transition = "transform 0.15s";
        // Body — round blob with cute eyes
        svg.innerHTML = `
            <defs>
                <radialGradient id="bodyGrad" cx="40%" cy="35%" r="70%">
                    <stop offset="0%" stop-color="#9cf"/>
                    <stop offset="100%" stop-color="#258"/>
                </radialGradient>
            </defs>
            <ellipse id="tama-body" cx="50" cy="65" rx="32" ry="32" fill="url(#bodyGrad)" stroke="#4af" stroke-width="1.5"/>
            <ellipse id="tama-eyeL" cx="40" cy="58" rx="4" ry="6" fill="#fff"/>
            <ellipse id="tama-eyeR" cx="60" cy="58" rx="4" ry="6" fill="#fff"/>
            <circle id="tama-pupilL" cx="40" cy="59" r="2" fill="#000"/>
            <circle id="tama-pupilR" cx="60" cy="59" r="2" fill="#000"/>
            <path id="tama-mouth" d="M 42 78 Q 50 82 58 78" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/>
            <ellipse id="tama-blushL" cx="33" cy="73" rx="4" ry="2.5" fill="#f88" opacity="0.7"/>
            <ellipse id="tama-blushR" cx="67" cy="73" rx="4" ry="2.5" fill="#f88" opacity="0.7"/>
            <path id="tama-zzz" d="M 70 30 L 78 30 L 70 38 L 78 38" stroke="#9cf" stroke-width="1.5" fill="none" opacity="0"/>
        `;
        charBox.appendChild(svg);

        // Round 88 — boxy "robot expression" alternative character.
        // Same viewBox so animations sync up; visibility toggles via
        // the 🤖/⚪ button.
        const robotSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        robotSvg.setAttribute("viewBox", "0 0 100 110");
        robotSvg.setAttribute("width", "120");
        robotSvg.setAttribute("height", "130");
        robotSvg.style.cursor = "pointer";
        robotSvg.style.transition = "transform 0.15s";
        robotSvg.style.display = "none";    // hidden by default
        robotSvg.style.position = "absolute";
        robotSvg.innerHTML = `
            <defs>
                <linearGradient id="robotGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="#bcd"/>
                    <stop offset="100%" stop-color="#456"/>
                </linearGradient>
                <linearGradient id="robotEar" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#789"/>
                    <stop offset="100%" stop-color="#345"/>
                </linearGradient>
            </defs>
            <!-- antenna -->
            <line x1="50" y1="22" x2="50" y2="30" stroke="#aaa" stroke-width="1.5"/>
            <circle cx="50" cy="20" r="3" fill="#f55"/>
            <!-- head box -->
            <rect id="robot-head" x="22" y="30" width="56" height="48" rx="6" ry="6"
                  fill="url(#robotGrad)" stroke="#234" stroke-width="1.5"/>
            <!-- ear bolts -->
            <rect x="16" y="46" width="6" height="14" rx="2" fill="url(#robotEar)"/>
            <rect x="78" y="46" width="6" height="14" rx="2" fill="url(#robotEar)"/>
            <!-- eye sockets -->
            <rect x="32" y="44" width="14" height="10" rx="2" fill="#102030"/>
            <rect x="54" y="44" width="14" height="10" rx="2" fill="#102030"/>
            <!-- LED pupils -->
            <circle id="robot-pupilL" cx="39" cy="49" r="2.6" fill="#4ff" />
            <circle id="robot-pupilR" cx="61" cy="49" r="2.6" fill="#4ff" />
            <!-- mouth: speaker grille -->
            <rect id="robot-mouth" x="36" y="64" width="28" height="8" rx="1" fill="#234"/>
            <line x1="38" y1="66" x2="62" y2="66" stroke="#4ff" stroke-width="0.8"/>
            <line x1="38" y1="68" x2="62" y2="68" stroke="#4ff" stroke-width="0.8"/>
            <line x1="38" y1="70" x2="62" y2="70" stroke="#4ff" stroke-width="0.8"/>
            <!-- chin bolts -->
            <circle cx="32" cy="74" r="1.5" fill="#234"/>
            <circle cx="68" cy="74" r="1.5" fill="#234"/>
        `;
        charBox.appendChild(robotSvg);
        this._robotSvg = robotSvg;

        // Toggle wires up here — flips visibility + button glyph
        charToggle.addEventListener("click", () => {
            if (this._currentChar === "blob") {
                this._currentChar = "robot";
                svg.style.display = "none";
                robotSvg.style.display = "block";
                charToggle.textContent = "⚪";       // shows other option
            } else {
                this._currentChar = "blob";
                svg.style.display = "block";
                robotSvg.style.display = "none";
                charToggle.textContent = "🤖";
            }
        });

        // Round 88 — both SVGs route clicks to the same emotion-cycle
        // handler so the robot face is interactive too.
        robotSvg.addEventListener("click", () => {
            this._handleMessage({ action: "happy" });
        });
        root.appendChild(charBox);

        // Stat bars
        const statsBox = document.createElement("div");
        statsBox.style.padding = "8px 12px";
        const makeBar = (label, color) => {
            const row = document.createElement("div");
            row.style.display = "flex";
            row.style.alignItems = "center";
            row.style.gap = "6px";
            row.style.margin = "4px 0";
            row.style.fontSize = "10px";
            const lbl = document.createElement("span");
            lbl.textContent = label;
            lbl.style.color = "#fc8";
            lbl.style.width = "55px";
            lbl.style.letterSpacing = "1px";
            const track = document.createElement("div");
            Object.assign(track.style, {
                flex: "1", height: "8px", background: "#000",
                border: "1px solid #444", borderRadius: "2px", overflow: "hidden",
            });
            const fill = document.createElement("div");
            Object.assign(fill.style, {
                height: "100%", width: "50%", background: color,
                transition: "width 0.4s ease-out",
            });
            track.appendChild(fill);
            row.append(lbl, track);
            statsBox.appendChild(row);
            return fill;
        };
        this._hungerBar    = makeBar("HUNGER",    "linear-gradient(90deg,#5d8,#fa3,#f44)");
        this._happinessBar = makeBar("HAPPY",     "linear-gradient(90deg,#666,#fd5,#5d8)");
        this._energyBar    = makeBar("ENERGY",    "linear-gradient(90deg,#666,#a6f,#5af)");
        root.appendChild(statsBox);

        // v740 — solar chip. Small row showing live solar production +
        // optional battery level from Home Assistant. Polls /ha/solar
        // every 30s. Dims to "🌑 ha offline" if HA isn't reachable so
        // the chip is always visible (no layout shifts when HA recovers).
        const solarChip = document.createElement("div");
        Object.assign(solarChip.style, {
            margin: "0 10px 6px",
            padding: "4px 8px",
            background: "rgba(20,40,60,0.45)",
            border: "1px solid rgba(120,200,255,0.18)",
            borderRadius: "5px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "10px",
            color: "#aef",
            fontFamily: "ui-monospace, monospace",
            letterSpacing: "0.5px",
            cursor: "default",
        });
        const solarLeft = document.createElement("span");
        solarLeft.textContent = "🌑 solar offline";
        const solarRight = document.createElement("span");
        solarRight.style.color = "#7cf";
        solarRight.textContent = "";
        solarChip.appendChild(solarLeft);
        solarChip.appendChild(solarRight);
        solarChip.title = "Live solar from Home Assistant — set HA_URL + HA_TOKEN + HA_SOLAR_ENTITIES in the bridge env to enable";
        root.appendChild(solarChip);
        this._solarChip = { row: solarChip, left: solarLeft, right: solarRight };

        const pollSolar = async () => {
            try {
                const r = await fetch("/ha/solar");
                if (!r.ok) return;
                const j = await r.json();
                if (!j.available) {
                    solarLeft.textContent = "🌑 solar offline";
                    solarRight.textContent = j.stale ? "stale" : "";
                    return;
                }
                // Look for the brightest entity by name match — power kw,
                // power w, then battery %.
                let solarW = null, batteryPct = null;
                for (const [eid, v] of Object.entries(j.values || {})) {
                    if (!v) continue;
                    const name = (v.name || eid).toLowerCase();
                    const num = parseFloat(v.state);
                    if (Number.isNaN(num)) continue;
                    if (solarW === null && /solar.*power|pv.*power|inverter.*power/.test(name)) {
                        // unit might be W or kW — normalize to W
                        solarW = (v.unit && v.unit.toLowerCase().includes("kw")) ? num * 1000 : num;
                    }
                    if (batteryPct === null && /battery.*level|battery.*soc/.test(name)) {
                        batteryPct = num;
                    }
                }
                if (solarW !== null) {
                    const kw = (solarW / 1000).toFixed(2);
                    solarLeft.textContent = `☀ ${kw} kW`;
                } else {
                    solarLeft.textContent = "☀ —";
                }
                solarRight.textContent = (batteryPct !== null) ? `🔋 ${batteryPct.toFixed(0)}%` : "";
            } catch (e) { /* network blip — ignore */ }
        };
        pollSolar();
        this._solarPoll = setInterval(pollSolar, 30000);

        // Action buttons
        const actions = document.createElement("div");
        Object.assign(actions.style, {
            display: "flex",
            gap: "5px",
            padding: "6px 10px 10px",
        });
        const makeBtn = (label, fn) => {
            const b = document.createElement("button");
            b.textContent = label;
            Object.assign(b.style, {
                flex: "1",
                background: "#1a3a4a", color: "#cfd",
                border: "1px solid #4af",
                borderRadius: "3px",
                fontFamily: "inherit",
                fontSize: "10px",
                letterSpacing: "1px",
                padding: "5px 0",
                cursor: "pointer",
            });
            b.addEventListener("mouseenter", () => b.style.background = "#2a4a5a");
            b.addEventListener("mouseleave", () => b.style.background = "#1a3a4a");
            b.addEventListener("click", fn);
            return b;
        };
        actions.append(
            makeBtn("FEED",  () => this._action("feed")),
            makeBtn("PLAY",  () => this._action("play")),
            makeBtn("SLEEP", () => this._action("sleep")),
        );
        root.appendChild(actions);

        // Speech bubble (hidden by default)
        const bubble = document.createElement("div");
        Object.assign(bubble.style, {
            position: "absolute",
            top: "30px",
            left: "20px",
            background: "rgba(40,40,60,0.95)",
            border: "1px solid #4af",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "10px",
            color: "#cfd",
            maxWidth: "150px",
            opacity: "0",
            transform: "scale(0.6)",
            transition: "opacity 0.2s, transform 0.2s",
            pointerEvents: "none",
            zIndex: "10",
        });
        root.appendChild(bubble);
        this._bubble = bubble;

        // Click character → quick happy bounce
        svg.addEventListener("click", () => {
            this._action("pet");
        });

        if (!this.headless) document.body.appendChild(root);
        this._root = root;
        this._svg  = svg;
        this._headerEl = header;
    }

    _wire() {
        // Drag the window via header — supports both mouse and touch.
        // v739 — touch support added so it actually moves on touchscreen
        // monitors / tablets.
        let dragging = false;
        let startX = 0, startY = 0, origLeft = 0, origTop = 0;
        const onDown = (cx, cy, ev) => {
            dragging = true;
            startX = cx; startY = cy;
            const rect = this._root.getBoundingClientRect();
            origLeft = rect.left; origTop = rect.top;
            this._root.style.right = "auto";
            this._root.style.bottom = "auto";
            this._root.style.left = origLeft + "px";
            this._root.style.top = origTop + "px";
            if (ev) ev.preventDefault();
        };
        const onMove = (cx, cy) => {
            if (!dragging) return;
            this._root.style.left = (origLeft + (cx - startX)) + "px";
            this._root.style.top  = (origTop  + (cy - startY)) + "px";
        };
        const onUp = () => { dragging = false; };
        this._headerEl.addEventListener("mousedown", (e) => onDown(e.clientX, e.clientY, e));
        window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
        window.addEventListener("mouseup", onUp);
        this._headerEl.addEventListener("touchstart", (e) => {
            const t = e.touches[0]; if (t) onDown(t.clientX, t.clientY, e);
        }, { passive: false });
        window.addEventListener("touchmove", (e) => {
            const t = e.touches[0]; if (t && dragging) { onMove(t.clientX, t.clientY); e.preventDefault(); }
        }, { passive: false });
        window.addEventListener("touchend", onUp);
    }

    show()   { this._root.style.display = "block"; }
    hide()   { this._root.style.display = "none"; }
    toggle() { this._root.style.display = this._root.style.display === "none" ? "block" : "none"; }

    // Round 105 — public name setter. Used by the OGRE visibility
    // coordinator to flip "PIP the Listener" → "PIP the OGRE" when
    // a scenario is active. Updates the header title and the reopen
    // tab text (so a hidden-by-× Pip shows the right label when the
    // user re-opens it).
    setName(newName) {
        this.name = newName;
        if (this._titleEl) this._titleEl.textContent = newName.toUpperCase();
        if (this._reopenTab) this._reopenTab.textContent = `▼ ${newName}`;
    }

    // ----- external message handler -----

    // Round 89.1 — poll bridge.connected and update the icon. Three
    // states managed here:
    //   "offline" - bridge is closed/disconnected → show 📵 dim+pulse
    //   "online"  - bridge connected, no recent ring → hide icon
    //   "ringing" - briefly set by _ringRinger; this method respects it
    //               and won't overwrite during the hold window.
    _refreshListenerIcon() {
        if (!this._ringerEl) return;
        const r = this._ringerEl;
        const connected = !!this.bridge?.connected;
        // If we're mid-ring, don't disturb the shake animation
        if (this._ringerHoldUntil && Date.now() < this._ringerHoldUntil) return;
        const next = connected ? "online" : "offline";
        if (next === this._listenerState) return;
        this._listenerState = next;
        if (next === "offline") {
            // Broken-listener indicator: 📵 (no phone symbol) with a
            // gentle dim pulse. Stays visible until bridge reconnects.
            r.textContent = "📵";
            r.title = "Listener offline — PowerShell relay not reachable";
            r.style.opacity = "0.55";
            r.style.animation = "tama-ringer-offline 2.4s ease-in-out infinite";
        } else {
            // Online and idle — icon hides until a message comes in.
            r.textContent = "📞";
            r.title = "Listener online";
            r.style.opacity = "0";
            r.style.animation = "none";
        }
    }

    // Round 88 — flash + shake the phone icon to indicate a Listener
    // (bridge) message has arrived. Animation duration = single shake
    // cycle; the icon stays at opacity 1 for the full hold window
    // (3s) so the user can see something arrived even if they look up
    // a second after the message landed.
    // Round 89.1 — sets _ringerHoldUntil so the listener-state poller
    // doesn't trample the shake animation. After the hold, the poller
    // resumes; if bridge is connected the icon hides, if disconnected
    // it shows the offline indicator.
    _ringRinger() {
        if (!this._ringerEl) return;
        const r = this._ringerEl;
        // Force the phone glyph (in case offline state had set 📵)
        r.textContent = "📞";
        r.title = "Listener message";
        r.style.opacity = "1";
        // Restart animation cleanly — strip + reassign
        r.style.animation = "none";
        // Force reflow so removal registers before re-add
        void r.offsetWidth;
        r.style.animation = "tama-ringer-shake 0.75s ease-in-out 2";
        this._ringerHoldUntil = Date.now() + 3000;
        clearTimeout(this._ringerTimer);
        this._ringerTimer = setTimeout(() => {
            r.style.opacity = "0";
            r.style.animation = "none";
            this._ringerHoldUntil = 0;
            // Re-evaluate listener state in case bridge dropped during ring
            this._listenerState = "unknown";
            this._refreshListenerIcon();
        }, 3000);
    }

    _handleMessage(data) {
        // Round 88 — flash + shake the 📞 icon for every Listener
        // message so the user gets a visible "you have new info" cue.
        this._ringRinger();
        const action = data?.action;
        if (action === "feed")  this._action("feed");
        else if (action === "play")  this._action("play");
        else if (action === "sleep") this._action("sleep");
        else if (action === "happy") this._setExpression("happy", 2000);
        else if (action === "sad")   this._setExpression("sad", 2000);
        else if (action === "alert" || action === "wave") {
            this._setExpression("alert", 1800);
            this._wave();
        }
        else if (action === "speak" && data.text) {
            this._speak(data.text);
        }
    }

    // Player or external triggers an action
    _action(kind) {
        switch (kind) {
            case "feed":
                this.stats.hunger = Math.max(0, this.stats.hunger - 35);
                this.stats.happiness = Math.min(100, this.stats.happiness + 8);
                this._setExpression("happy", 1500);
                this._speak("yum!");
                break;
            case "play":
                this.stats.happiness = Math.min(100, this.stats.happiness + 25);
                this.stats.energy = Math.max(0, this.stats.energy - 15);
                this.stats.hunger = Math.min(100, this.stats.hunger + 8);
                this._setExpression("happy", 2000);
                this._speak("wheee!");
                this._wave();
                break;
            case "sleep":
                this.stats.energy = Math.min(100, this.stats.energy + 50);
                this._setExpression("sleepy", 3000);
                this._speak("zzz...");
                break;
            case "pet":
                this.stats.happiness = Math.min(100, this.stats.happiness + 5);
                this._setExpression("happy", 1200);
                break;
        }
        this._saveStats();
        this._updateBars();
    }

    _setExpression(expr, durationMs = 1500) {
        this.expression = expr;
        this._renderExpression();
        if (this._exprResetTimer) clearTimeout(this._exprResetTimer);
        this._exprResetTimer = setTimeout(() => {
            this.expression = "neutral";
            this._renderExpression();
        }, durationMs);
    }

    _renderExpression() {
        const mouth = this._svg.querySelector("#tama-mouth");
        const blushL = this._svg.querySelector("#tama-blushL");
        const blushR = this._svg.querySelector("#tama-blushR");
        const zzz   = this._svg.querySelector("#tama-zzz");
        zzz.style.opacity = "0";
        switch (this.expression) {
            case "happy":
                mouth.setAttribute("d", "M 38 76 Q 50 88 62 76");
                mouth.setAttribute("stroke", "#000");
                blushL.style.opacity = "1"; blushR.style.opacity = "1";
                break;
            case "sad":
                mouth.setAttribute("d", "M 42 82 Q 50 76 58 82");
                blushL.style.opacity = "0.3"; blushR.style.opacity = "0.3";
                break;
            case "hungry":
                mouth.setAttribute("d", "M 44 80 L 50 82 L 56 80");
                blushL.style.opacity = "0.4"; blushR.style.opacity = "0.4";
                break;
            case "sleepy":
                mouth.setAttribute("d", "M 44 80 L 56 80");
                zzz.style.opacity = "1";
                break;
            case "alert":
                mouth.setAttribute("d", "M 44 78 L 56 78");
                mouth.setAttribute("stroke", "#fa3");
                break;
            default:
                mouth.setAttribute("d", "M 42 78 Q 50 82 58 78");
                mouth.setAttribute("stroke", "#000");
                blushL.style.opacity = "0.7"; blushR.style.opacity = "0.7";
                break;
        }
    }

    _wave() {
        const body = this._svg.querySelector("#tama-body");
        const orig = body.getAttribute("ry");
        // Quick squash + jump
        let frames = 0;
        const interval = setInterval(() => {
            frames++;
            const t = frames * 0.3;
            const yOff = Math.abs(Math.sin(t * Math.PI)) * 8;
            this._svg.style.transform = `translateY(${-yOff}px)`;
            if (frames > 10) {
                clearInterval(interval);
                this._svg.style.transform = "";
            }
        }, 40);
    }

    _speak(text) {
        this._bubble.textContent = text;
        this._bubble.style.opacity = "1";
        this._bubble.style.transform = "scale(1)";
        if (this._speakTimer) clearTimeout(this._speakTimer);
        this._speakTimer = setTimeout(() => {
            this._bubble.style.opacity = "0";
            this._bubble.style.transform = "scale(0.6)";
        }, 1800);
    }

    // ----- per-second stat decay + visual update -----

    _tickLoop() {
        const tick = () => {
            const now = Date.now();
            const dt = Math.min(60, (now - (this.stats.lastTick ?? now)) / 1000);
            this.stats.lastTick = now;

            // Decay
            this.stats.hunger    = Math.max(0, Math.min(100, this.stats.hunger    + HUNGER_RATE * dt));
            this.stats.happiness = Math.max(0, Math.min(100, this.stats.happiness - HAPPINESS_RATE * dt));
            this.stats.energy    = Math.max(0, Math.min(100, this.stats.energy    - ENERGY_RATE * dt));

            // Auto-expression based on stats — only override if neutral
            if (this.expression === "neutral") {
                if (this.stats.hunger > 75) this._renderExpressionNamed("hungry");
                else if (this.stats.happiness < 30) this._renderExpressionNamed("sad");
                else if (this.stats.energy < 25) this._renderExpressionNamed("sleepy");
                else this._renderExpressionNamed("neutral");
            }

            this._updateBars();
            this._idleAnim();
            this._saveStats();
        };
        tick();
        setInterval(tick, TICK_MS);

        // Idle animation runs at 30fps
        const idleStep = () => {
            this.bobPhase += 0.07;
            this._idleAnim();
            requestAnimationFrame(idleStep);
        };
        requestAnimationFrame(idleStep);
    }

    _idleAnim() {
        const bob = Math.sin(this.bobPhase) * 1.5;
        const body = this._svg.querySelector("#tama-body");
        if (body) body.setAttribute("cy", (65 + bob).toFixed(1));
        // Eyes follow body
        const eyL = this._svg.querySelector("#tama-eyeL");
        const eyR = this._svg.querySelector("#tama-eyeR");
        const puL = this._svg.querySelector("#tama-pupilL");
        const puR = this._svg.querySelector("#tama-pupilR");
        if (eyL) eyL.setAttribute("cy", (58 + bob).toFixed(1));
        if (eyR) eyR.setAttribute("cy", (58 + bob).toFixed(1));
        if (puL) puL.setAttribute("cy", (59 + bob).toFixed(1));
        if (puR) puR.setAttribute("cy", (59 + bob).toFixed(1));
        // Random blink
        const t = performance.now();
        if (t - this.lastBlink > (this.blinkOpen ? 3000 + Math.random() * 4000 : 150)) {
            this.lastBlink = t;
            this.blinkOpen = !this.blinkOpen;
            const eyeRy = this.blinkOpen ? "6" : "0.5";
            if (eyL) eyL.setAttribute("ry", eyeRy);
            if (eyR) eyR.setAttribute("ry", eyeRy);
        }
    }

    _renderExpressionNamed(name) {
        if (this.expression === name) return;
        this.expression = name;
        this._renderExpression();
    }

    _updateBars() {
        if (this._hungerBar)    this._hungerBar.style.width    = this.stats.hunger.toFixed(0) + "%";
        if (this._happinessBar) this._happinessBar.style.width = this.stats.happiness.toFixed(0) + "%";
        if (this._energyBar)    this._energyBar.style.width    = this.stats.energy.toFixed(0) + "%";
    }
}
