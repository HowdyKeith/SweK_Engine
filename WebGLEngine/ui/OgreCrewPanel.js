// FILE: ui/OgreCrewPanel.js
// Round 104 — multi-avatar OGRE component view.
//
// Displays three stacked crew "avatars" while an OGRE is active in the
// battlefield. Each station tracks one (or more) OGRE hardpoints and
// shifts its visual state as damage accumulates:
//
//   idle      (≥ 70% HP) → calm/working face
//   concerned (30-70%)   → brow furrowed, eyes wide
//   hurt      (< 30%)    → grimacing, sweat drops
//   dead      (destroyed) → X over eyes, slumped
//
// STATION → COMPONENT MAPPING
//   Weapons  → main_weapon hardpoint
//   Engine   → engine hardpoint + OGRE chassis HP (whichever is lower)
//   Scanners → sensor + tech_module hardpoints (worst of the two)
//
// VISIBILITY
//   Panel is shown whenever `ogreScenario.ogre` exists and is alive.
//   When the OGRE dies or the scenario ends, the panel auto-hides and
//   the HeartbeatAvatar / PalChatAvatar regain their dock slots. The
//   visibility coordination is done by main.js's polling loop — this
//   widget just exposes setVisible() and update() and trusts the
//   caller to drive both.
//
// DOCKING
//   Right-edge anchored, docks to the top of Pip (the Tamagotchi
//   window) so the panel sits in the same screen real estate the
//   normal avatars use.

const STATIONS = [
    {
        id:       "weapons",
        label:    "WEAPONS",
        color:    "#ff8a3a",
        emblemSvg: `<path d="M -8,-2 L 8,-2 L 8,2 L -8,2 Z" fill="currentColor"/><path d="M -10,-6 L 10,6 M -10,6 L 10,-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
        // Round 106 — also tracks the new underside_weapon hardpoint
        // so the gunnery officer reacts when ANY weapon system goes
        // down (top turret OR belly turret).
        sources:  ["main_weapon", "underside_weapon"],
    },
    {
        id:       "engine",
        label:    "ENGINE",
        color:    "#ffb14a",
        emblemSvg: `<circle cx="0" cy="0" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M -8,-3 L -3,-8 L 0,-5 L 5,-10 L 10,-5 L 5,0 L 10,5 L 5,10 L 0,5 L -3,8 L -8,3 Z" fill="currentColor" opacity="0.85"/>`,
        // Engine reflects engine hardpoint AND chassis HP — engineer is
        // responsible for overall vehicle health.
        sources:  ["engine", "_chassis"],
    },
    {
        id:       "scanners",
        label:    "SCANNERS",
        color:    "#66e8d8",
        emblemSvg: `<circle cx="0" cy="0" r="3" fill="currentColor"/><circle cx="0" cy="0" r="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/><circle cx="0" cy="0" r="9" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/><path d="M 0,0 L 8,-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        // Combined sensor + tech_module — both are observation/comm gear.
        sources:  ["sensor", "tech_module"],
    },
];

export class OgreCrewPanel {
    constructor({ parent, ogreScenario, onStateChange = null } = {}) {
        this.ogreScenario = ogreScenario ?? null;
        this.stations = new Map();  // id -> { row, faceG, hpBar, hpText, state }
        this._visible = false;
        // Round 106 — state-transition callback. Called once per
        // station per transition with (stationDef, oldState, newState).
        // CrewCallout uses this to fire speech bubbles on "getting
        // worse" transitions.
        this.onStateChange = onStateChange;

        this.root = document.createElement("div");
        this.root.id = "ogre-crew-panel";
        Object.assign(this.root.style, {
            position: "fixed",
            right: "14px",
            bottom: "240px",      // updated by docking loop
            // Round 105 — match Pip's post-scale visual width (230 * 0.6 = 138)
            width: "138px",
            background: "rgba(8, 10, 14, 0.78)",
            border: "1px solid rgba(255, 153, 0, 0.55)",
            borderRadius: "10px",
            padding: "6px 7px",
            fontFamily: "ui-monospace, Consolas, monospace",
            color: "#dde",
            fontSize: "9px",
            zIndex: "25600",
            pointerEvents: "none",
            display: "none",
            boxShadow: "0 0 14px rgba(255, 153, 0, 0.22)",
            backdropFilter: "blur(2px)",
        });

        this._injectStyles();

        // Panel header
        const header = document.createElement("div");
        Object.assign(header.style, {
            color: "#ff9933",
            fontSize: "10px",
            fontWeight: "bold",
            letterSpacing: "0.15em",
            textAlign: "center",
            paddingBottom: "5px",
            borderBottom: "1px solid rgba(255, 153, 0, 0.3)",
            marginBottom: "6px",
        });
        header.textContent = "▼ OGRE CREW ▼";
        this.root.appendChild(header);

        // Build a row per station
        for (const def of STATIONS) {
            const row = this._buildRow(def);
            this.root.appendChild(row.el);
            this.stations.set(def.id, row);
        }

        (parent ?? document.body).appendChild(this.root);

        this._startDocking("tama-window", 6);
    }

    // ------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------

    setVisible(on) {
        if (this._visible === !!on) return;
        this._visible = !!on;
        this.root.style.display = this._visible ? "block" : "none";
    }

    isVisible() { return this._visible; }

    // Called by main.js each tick (or every ~250ms). Reads current
    // hardpoint HP from this.ogreScenario and updates each station's
    // state + HP bar.
    update() {
        if (!this._visible) return;
        const scen = this.ogreScenario;
        if (!scen) return;
        const hardpoints = scen.hardpoints ?? {};

        for (const def of STATIONS) {
            const station = this.stations.get(def.id);
            if (!station) continue;

            // Aggregate HP across all sources. Take WORST source so the
            // station reflects the most-damaged component it owns. This
            // matches the user-experience expectation: the engineer
            // freaks out as soon as ANY of their systems is compromised.
            let worstFrac = 1.0;
            let anyDestroyed = false;
            let anyExists = false;

            for (const src of def.sources) {
                if (src === "_chassis") {
                    // OGRE main entity HP
                    if (scen.ogre && scen.ogre.hp != null && scen.ogre.maxHp != null) {
                        anyExists = true;
                        const frac = scen.ogre.hp / Math.max(1, scen.ogre.maxHp);
                        if (frac < worstFrac) worstFrac = frac;
                    }
                } else {
                    const hp = hardpoints[src];
                    if (hp) {
                        anyExists = true;
                        if (hp.destroyed) anyDestroyed = true;
                        const frac = hp.destroyed ? 0 : (hp.hp / Math.max(1, hp.maxHp));
                        if (frac < worstFrac) worstFrac = frac;
                    }
                }
            }

            // Pick state from worst HP fraction
            let newState;
            if (!anyExists) {
                newState = "idle";       // no data yet — assume healthy
                worstFrac = 1.0;
            } else if (anyDestroyed) {
                newState = "dead";
            } else if (worstFrac < 0.30) {
                newState = "hurt";
            } else if (worstFrac < 0.70) {
                newState = "concerned";
            } else {
                newState = "idle";
            }

            if (station.state !== newState) {
                const oldState = station.state;
                this._setStationState(station, def, newState);
                // Round 106 — notify callout listener
                if (this.onStateChange) {
                    try { this.onStateChange(def, oldState, newState); } catch {}
                }
            }
            // Always update HP bar (smooth visual feedback)
            const pct = Math.round(Math.max(0, Math.min(1, worstFrac)) * 100);
            station.hpBar.style.width = pct + "%";
            station.hpText.textContent = pct + "%";
            // Bar color follows state
            if (newState === "dead")          station.hpBar.style.background = "#444";
            else if (newState === "hurt")     station.hpBar.style.background = "#e84035";
            else if (newState === "concerned") station.hpBar.style.background = "#e8a035";
            else                              station.hpBar.style.background = def.color;
        }
    }

    destroy() {
        if (this._dockTimer) clearInterval(this._dockTimer);
        if (this.root?.parentNode) this.root.parentNode.removeChild(this.root);
    }

    // ------------------------------------------------------------
    // Internal: build a single station row
    // ------------------------------------------------------------

    _buildRow(def) {
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            alignItems: "center",
            padding: "3px 0",
            borderBottom: "1px dashed rgba(255, 153, 0, 0.15)",
        });

        // Avatar SVG container (36×36 — round 105: was 48, shrunk for narrow panel)
        const svgWrap = document.createElement("div");
        Object.assign(svgWrap.style, {
            width: "36px",
            height: "36px",
            flexShrink: "0",
            position: "relative",
        });
        const svg = this._buildFaceSvg(def);
        svg.setAttribute("width", "36");
        svg.setAttribute("height", "36");
        svgWrap.appendChild(svg);
        row.appendChild(svgWrap);

        // Right side: label + HP bar
        const right = document.createElement("div");
        Object.assign(right.style, {
            flex: "1",
            marginLeft: "6px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            minWidth: "0",      // allow text-overflow ellipsis in narrow layout
        });

        const labelLine = document.createElement("div");
        Object.assign(labelLine.style, {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
        });
        const label = document.createElement("span");
        label.textContent = def.label;
        label.style.color = def.color;
        label.style.fontWeight = "bold";
        label.style.fontSize = "9px";
        label.style.letterSpacing = "0.06em";
        const hpText = document.createElement("span");
        hpText.textContent = "100%";
        Object.assign(hpText.style, {
            color: "#aab",
            fontSize: "8px",
        });
        labelLine.appendChild(label);
        labelLine.appendChild(hpText);
        right.appendChild(labelLine);

        // HP bar
        const barTrack = document.createElement("div");
        Object.assign(barTrack.style, {
            height: "4px",
            background: "rgba(0, 0, 0, 0.6)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "2px",
            overflow: "hidden",
        });
        const hpBar = document.createElement("div");
        Object.assign(hpBar.style, {
            height: "100%",
            width: "100%",
            background: def.color,
            transition: "width 300ms, background 200ms",
        });
        barTrack.appendChild(hpBar);
        right.appendChild(barTrack);

        row.appendChild(right);

        return {
            el: row,
            faceG: svg.querySelector(".crew-face"),
            eyesG: svg.querySelector(".crew-eyes"),
            mouthG: svg.querySelector(".crew-mouth"),
            sweatG: svg.querySelector(".crew-sweat"),
            hpBar,
            hpText,
            state: "idle",
        };
    }

    // Build the crew member SVG. Sticks to a head+shoulders silhouette
    // with swappable eye + mouth + sweat groups. Station emblem in the
    // corner indicates role at a glance.
    _buildFaceSvg(def) {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("viewBox", "0 0 48 48");
        svg.setAttribute("width", "48");
        svg.setAttribute("height", "48");

        // Station-colored corner emblem
        const emblem = document.createElementNS(svgNS, "g");
        emblem.setAttribute("transform", "translate(38, 10)");
        emblem.setAttribute("color", def.color);
        emblem.innerHTML = def.emblemSvg;
        // scale down for corner placement
        emblem.style.transformOrigin = "center";
        const innerWrap = document.createElementNS(svgNS, "g");
        innerWrap.setAttribute("transform", "scale(0.5)");
        innerWrap.innerHTML = def.emblemSvg;
        emblem.innerHTML = "";
        emblem.appendChild(innerWrap);
        svg.appendChild(emblem);

        // Helmet/cap (rounded shape on top of head)
        const helmet = document.createElementNS(svgNS, "path");
        helmet.setAttribute("d", "M 12,20 Q 12,8 24,8 Q 36,8 36,20 L 36,22 L 12,22 Z");
        helmet.setAttribute("fill", "#2a3540");
        helmet.setAttribute("stroke", "#1a2530");
        helmet.setAttribute("stroke-width", "1");
        svg.appendChild(helmet);

        // Helmet trim — station-colored band
        const trim = document.createElementNS(svgNS, "rect");
        trim.setAttribute("x", "12");
        trim.setAttribute("y", "21");
        trim.setAttribute("width", "24");
        trim.setAttribute("height", "2");
        trim.setAttribute("fill", def.color);
        svg.appendChild(trim);

        // Face oval (head)
        const face = document.createElementNS(svgNS, "g");
        face.setAttribute("class", "crew-face");
        const skin = document.createElementNS(svgNS, "ellipse");
        skin.setAttribute("cx", "24");
        skin.setAttribute("cy", "28");
        skin.setAttribute("rx", "10");
        skin.setAttribute("ry", "11");
        skin.setAttribute("fill", "#d4a878");
        face.appendChild(skin);
        // Shoulders
        const shoulders = document.createElementNS(svgNS, "path");
        shoulders.setAttribute("d", "M 8,46 Q 8,38 14,36 L 34,36 Q 40,38 40,46 Z");
        shoulders.setAttribute("fill", "#2a3540");
        shoulders.setAttribute("stroke", "#1a2530");
        shoulders.setAttribute("stroke-width", "1");
        svg.appendChild(shoulders);
        svg.appendChild(face);

        // Eyes (default idle — two black dots)
        const eyes = document.createElementNS(svgNS, "g");
        eyes.setAttribute("class", "crew-eyes");
        this._setEyes(eyes, "idle");
        svg.appendChild(eyes);

        // Mouth (default idle — small horizontal line)
        const mouth = document.createElementNS(svgNS, "g");
        mouth.setAttribute("class", "crew-mouth");
        this._setMouth(mouth, "idle");
        svg.appendChild(mouth);

        // Sweat drops (hidden by default)
        const sweat = document.createElementNS(svgNS, "g");
        sweat.setAttribute("class", "crew-sweat");
        sweat.style.display = "none";
        const drop = document.createElementNS(svgNS, "path");
        drop.setAttribute("d", "M 36,28 Q 33,33 36,34 Q 39,33 36,28 Z");
        drop.setAttribute("fill", "#7fc8ff");
        drop.setAttribute("opacity", "0.85");
        sweat.appendChild(drop);
        svg.appendChild(sweat);

        return svg;
    }

    // ------------------------------------------------------------
    // State application
    // ------------------------------------------------------------

    _setStationState(station, def, newState) {
        station.state = newState;
        this._setEyes(station.eyesG, newState);
        this._setMouth(station.mouthG, newState);
        // Sweat visible on hurt
        station.sweatG.style.display = (newState === "hurt") ? "block" : "none";
        // Skin pallor on dead
        const skin = station.faceG.querySelector("ellipse");
        if (skin) {
            skin.setAttribute("fill", newState === "dead" ? "#7a8895" : "#d4a878");
        }
        // Slumped on dead — translate face down 2px
        if (newState === "dead") {
            station.faceG.setAttribute("transform", "translate(0, 3)");
        } else {
            station.faceG.removeAttribute("transform");
        }
    }

    _setEyes(eyesG, state) {
        // Clear existing
        while (eyesG.firstChild) eyesG.removeChild(eyesG.firstChild);
        const svgNS = "http://www.w3.org/2000/svg";

        if (state === "dead") {
            // X eyes
            const make = (cx) => {
                const x1 = document.createElementNS(svgNS, "line");
                x1.setAttribute("x1", cx - 2); x1.setAttribute("y1", 25);
                x1.setAttribute("x2", cx + 2); x1.setAttribute("y2", 29);
                x1.setAttribute("stroke", "#222"); x1.setAttribute("stroke-width", "1.6"); x1.setAttribute("stroke-linecap", "round");
                eyesG.appendChild(x1);
                const x2 = document.createElementNS(svgNS, "line");
                x2.setAttribute("x1", cx + 2); x2.setAttribute("y1", 25);
                x2.setAttribute("x2", cx - 2); x2.setAttribute("y2", 29);
                x2.setAttribute("stroke", "#222"); x2.setAttribute("stroke-width", "1.6"); x2.setAttribute("stroke-linecap", "round");
                eyesG.appendChild(x2);
            };
            make(20); make(28);
        } else if (state === "hurt") {
            // Squinted, anxious — short slanted lines
            const make = (cx, dir) => {
                const e = document.createElementNS(svgNS, "line");
                e.setAttribute("x1", cx - 1.8); e.setAttribute("y1", 27 + dir);
                e.setAttribute("x2", cx + 1.8); e.setAttribute("y2", 27 - dir);
                e.setAttribute("stroke", "#222"); e.setAttribute("stroke-width", "1.4"); e.setAttribute("stroke-linecap", "round");
                eyesG.appendChild(e);
            };
            make(20, -1.0); make(28, 1.0);
        } else if (state === "concerned") {
            // Wide eyes — bigger circles
            const make = (cx) => {
                const e = document.createElementNS(svgNS, "circle");
                e.setAttribute("cx", cx); e.setAttribute("cy", 27); e.setAttribute("r", "1.8");
                e.setAttribute("fill", "#222");
                eyesG.appendChild(e);
            };
            make(20); make(28);
        } else {
            // idle — neutral small dots
            const make = (cx) => {
                const e = document.createElementNS(svgNS, "circle");
                e.setAttribute("cx", cx); e.setAttribute("cy", 27); e.setAttribute("r", "1.1");
                e.setAttribute("fill", "#222");
                eyesG.appendChild(e);
            };
            make(20); make(28);
        }
    }

    _setMouth(mouthG, state) {
        while (mouthG.firstChild) mouthG.removeChild(mouthG.firstChild);
        const svgNS = "http://www.w3.org/2000/svg";

        if (state === "dead") {
            // Slack — small open oval
            const m = document.createElementNS(svgNS, "ellipse");
            m.setAttribute("cx", 24); m.setAttribute("cy", 33);
            m.setAttribute("rx", 2.5); m.setAttribute("ry", 1.4);
            m.setAttribute("fill", "#222");
            mouthG.appendChild(m);
        } else if (state === "hurt") {
            // Grimace — open jagged
            const m = document.createElementNS(svgNS, "path");
            m.setAttribute("d", "M 20,33 L 22,31 L 24,33 L 26,31 L 28,33");
            m.setAttribute("stroke", "#222"); m.setAttribute("stroke-width", "1.4");
            m.setAttribute("fill", "none"); m.setAttribute("stroke-linecap", "round");
            mouthG.appendChild(m);
        } else if (state === "concerned") {
            // Small frown
            const m = document.createElementNS(svgNS, "path");
            m.setAttribute("d", "M 20,34 Q 24,32 28,34");
            m.setAttribute("stroke", "#222"); m.setAttribute("stroke-width", "1.4");
            m.setAttribute("fill", "none"); m.setAttribute("stroke-linecap", "round");
            mouthG.appendChild(m);
        } else {
            // idle — slight smile
            const m = document.createElementNS(svgNS, "path");
            m.setAttribute("d", "M 20,33 Q 24,35 28,33");
            m.setAttribute("stroke", "#222"); m.setAttribute("stroke-width", "1.4");
            m.setAttribute("fill", "none"); m.setAttribute("stroke-linecap", "round");
            mouthG.appendChild(m);
        }
    }

    // ------------------------------------------------------------
    // Docking + styles
    // ------------------------------------------------------------

    _startDocking(targetId, gap = 6) {
        const sync = () => {
            const target = document.getElementById(targetId);
            if (!target) return;
            const rect = target.getBoundingClientRect();
            if (rect.width === 0) return;
            const newBottom = Math.round(window.innerHeight - rect.top + gap);
            const newRight  = Math.round(window.innerWidth  - rect.right);
            if (this._lastDockBottom !== newBottom) {
                this.root.style.bottom = newBottom + "px";
                this._lastDockBottom = newBottom;
            }
            if (this._lastDockRight !== newRight) {
                this.root.style.right = newRight + "px";
                this._lastDockRight = newRight;
            }
        };
        sync();
        this._dockTimer = setInterval(sync, 500);
    }

    _injectStyles() {
        if (document.getElementById("ogre-crew-styles")) return;
        const s = document.createElement("style");
        s.id = "ogre-crew-styles";
        s.textContent = `
            @keyframes crew-sweat-drop {
                0%   { transform: translateY(-2px); opacity: 0.0; }
                30%  { opacity: 0.9; }
                100% { transform: translateY(5px); opacity: 0.0; }
            }
            #ogre-crew-panel .crew-sweat path {
                animation: crew-sweat-drop 1.5s infinite ease-in;
                transform-origin: center;
            }
        `;
        document.head.appendChild(s);
    }
}
