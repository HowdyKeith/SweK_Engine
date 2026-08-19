// FILE: ui/CrewCallout.js
// Round 106 — POV-mode crew callouts.
//
// Speech-bubble overlay that fires when an OGRE crew station
// transitions to a worse state. Designed to be readable from
// inside POV (first-person OGRE controlled view) where the docked
// crew panel might be off the player's screen-edge attention. The
// callouts appear at TOP-CENTER of the viewport so they're always
// in the player's natural line of sight, slide in from the top,
// hold for ~3s, then fade out.
//
// MOUNTING
//   const callout = new CrewCallout({ parent: document.body });
//   ogreCrewPanel.onStateChange = (def, oldS, newS) =>
//       callout.fireTransition(def, oldS, newS);
//
// LINES PER TRANSITION
//   * → concerned   "STATION taking fire!"
//   * → hurt        "STATION CRITICAL!"
//   * → dead        "STATION OFFLINE!"
//   (Improvements / "dead → idle" are skipped — no callout spam on
//   respawn or healing edge cases.)
//
// VISUAL
//   Dark rounded box, station-colored left border + emblem icon,
//   large bold text in station color. Stacks vertically with FIFO
//   eviction: newest at top, max 3 visible at once.

const MAX_BUBBLES = 3;
const HOLD_MS     = 3000;     // visible duration
const FADE_MS     = 400;      // fade-out duration

// Severity rank — used to detect "getting worse" transitions
const RANK = { idle: 0, concerned: 1, hurt: 2, dead: 3 };

const LINES = {
    concerned: (label) => `${label} TAKING FIRE!`,
    hurt:      (label) => `${label} CRITICAL!`,
    dead:      (label) => `${label} OFFLINE!`,
};

export class CrewCallout {
    constructor({ parent } = {}) {
        this.root = document.createElement("div");
        this.root.id = "crew-callouts";
        Object.assign(this.root.style, {
            position: "fixed",
            top: "60px",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            zIndex: "26500",     // above crew panel + Pip
            pointerEvents: "none",
            // No background — bubbles provide their own
        });
        this._injectStyles();
        (parent ?? document.body).appendChild(this.root);
        this._bubbles = [];     // newest first
    }

    // Called by main.js after wiring ogreCrewPanel.onStateChange.
    // Only fires for "getting worse" transitions (severity increased).
    fireTransition(stationDef, oldState, newState) {
        if (RANK[newState] <= RANK[oldState]) return;   // improvement, skip
        const line = LINES[newState];
        if (!line) return;
        this._spawnBubble(stationDef, line(stationDef.label));
    }

    _spawnBubble(def, text) {
        const bubble = document.createElement("div");
        Object.assign(bubble.style, {
            background: "rgba(8, 10, 14, 0.92)",
            border: "1px solid " + def.color,
            borderLeft: "4px solid " + def.color,
            borderRadius: "6px",
            padding: "8px 16px 8px 12px",
            color: def.color,
            fontFamily: "ui-monospace, Consolas, monospace",
            fontSize: "14px",
            fontWeight: "bold",
            letterSpacing: "0.06em",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5), 0 0 12px " + def.color + "55",
            minWidth: "240px",
            // Slide-in animation
            opacity: "0",
            transform: "translateY(-12px)",
            transition: `opacity 280ms, transform 280ms`,
        });

        // Emblem (24×24 SVG)
        const emblem = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        emblem.setAttribute("viewBox", "-12 -12 24 24");
        emblem.setAttribute("width", "20");
        emblem.setAttribute("height", "20");
        emblem.style.color = def.color;
        emblem.style.flexShrink = "0";
        emblem.innerHTML = def.emblemSvg;
        bubble.appendChild(emblem);

        const txt = document.createElement("span");
        txt.textContent = text;
        bubble.appendChild(txt);

        // Insert at TOP (newest first)
        this.root.insertBefore(bubble, this.root.firstChild);
        this._bubbles.unshift({ el: bubble, fadeTimer: null });

        // FIFO eviction — drop oldest beyond MAX
        while (this._bubbles.length > MAX_BUBBLES) {
            const old = this._bubbles.pop();
            this._removeNow(old);
        }

        // Slide-in (next frame so transition kicks in)
        requestAnimationFrame(() => {
            bubble.style.opacity = "1";
            bubble.style.transform = "translateY(0)";
        });

        // Schedule fade-out + remove
        const entry = this._bubbles[0];
        entry.fadeTimer = setTimeout(() => {
            bubble.style.transition = `opacity ${FADE_MS}ms`;
            bubble.style.opacity = "0";
            setTimeout(() => {
                const idx = this._bubbles.indexOf(entry);
                if (idx >= 0) this._bubbles.splice(idx, 1);
                if (bubble.parentNode) bubble.parentNode.removeChild(bubble);
            }, FADE_MS + 20);
        }, HOLD_MS);
    }

    _removeNow(entry) {
        if (entry.fadeTimer) clearTimeout(entry.fadeTimer);
        if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    }

    clearAll() {
        for (const e of this._bubbles) this._removeNow(e);
        this._bubbles = [];
    }

    _injectStyles() {
        if (document.getElementById("crew-callout-styles")) return;
        const s = document.createElement("style");
        s.id = "crew-callout-styles";
        s.textContent = `
            #crew-callouts > div {
                animation: callout-pulse 1.4s infinite ease-in-out;
            }
            @keyframes callout-pulse {
                0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
                50%      { box-shadow: 0 4px 18px rgba(255,255,255,0.18), 0 0 24px currentColor; }
            }
        `;
        document.head.appendChild(s);
    }
}
