// FILE: ui/OgreHUD.js
// VERSION: v1
//
// Top-center banner for the OGRE scenario. Shows distance to HQ,
// OGRE HP bar, defenders alive, and a start/stop button. End state
// flashes a WIN or LOSS card.

export class OgreHUD {

    constructor({ scenario }) {
        this.scenario = scenario;
        this._build();
        this._lastState = "idle";
    }

    _build() {
        const root = document.createElement("div");
        Object.assign(root.style, {
            position: "fixed",
            top: "12px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0, 0, 0, 0.78)",
            border: "1px solid rgba(255, 90, 30, 0.5)",
            borderRadius: "6px",
            padding: "8px 14px",
            fontFamily: "monospace",
            color: "#eee",
            zIndex: "20",
            minWidth: "320px",
            display: "none",
        });

        const title = document.createElement("div");
        title.textContent = "▶  OGRE";
        Object.assign(title.style, {
            fontSize: "14px",
            fontWeight: "bold",
            color: "#ff8a3c",
            marginBottom: "6px",
            letterSpacing: "2px",
        });
        root.appendChild(title);
        this._title = title;

        // Round 10 — boss banner (hidden unless isBossWave)
        const bossBanner = document.createElement("div");
        Object.assign(bossBanner.style, {
            display: "none",
            background: "linear-gradient(90deg, rgba(140, 20, 0, 0.85), rgba(255, 50, 30, 0.95), rgba(140, 20, 0, 0.85))",
            color: "#fff8e0",
            fontWeight: "bold",
            letterSpacing: "3px",
            fontSize: "11px",
            padding: "3px 0",
            textAlign: "center",
            borderRadius: "3px",
            marginBottom: "4px",
            border: "1px solid rgba(255, 220, 130, 0.5)",
        });
        bossBanner.textContent = "★ ★ ★  BOSS WAVE  ★ ★ ★";
        root.appendChild(bossBanner);
        this._bossBanner = bossBanner;

        // HP bar
        const hpRow = document.createElement("div");
        Object.assign(hpRow.style, { display: "flex", alignItems: "center", gap: "8px", margin: "4px 0" });
        const hpLabel = document.createElement("div");
        hpLabel.style.cssText = "width: 30px; font-size: 11px;";
        hpLabel.textContent = "HP";
        hpRow.appendChild(hpLabel);

        const hpBar = document.createElement("div");
        Object.assign(hpBar.style, {
            flex: "1",
            height: "10px",
            background: "rgba(80, 0, 0, 0.6)",
            border: "1px solid rgba(255, 100, 50, 0.4)",
            position: "relative",
            overflow: "hidden",
        });
        const hpFill = document.createElement("div");
        Object.assign(hpFill.style, {
            position: "absolute",
            top: "0", left: "0",
            height: "100%", width: "100%",
            background: "linear-gradient(90deg, rgba(255,90,40,1), rgba(255,180,80,1))",
            transition: "width 0.15s",
        });
        hpBar.appendChild(hpFill);
        hpRow.appendChild(hpBar);

        const hpText = document.createElement("div");
        hpText.style.cssText = "width: 65px; font-size: 11px; text-align: right;";
        hpRow.appendChild(hpText);
        root.appendChild(hpRow);

        // Round 131 — shared HP row. Hidden in solo (or when not
        // connected to multiplayer). When two or more players are
        // contributing to the same OGRE, this displays the canonical
        // shared HP from the server pool. Visual distinction:
        // narrower bar with a cyan→teal gradient (vs the red/orange
        // local HP). Caption indicates contributor split.
        const sharedRow = document.createElement("div");
        Object.assign(sharedRow.style, {
            display: "none",
            alignItems: "center",
            gap: "8px",
            margin: "2px 0",
        });
        const sharedLabel = document.createElement("div");
        sharedLabel.style.cssText = "width: 30px; font-size: 10px; color: #8ee;";
        sharedLabel.textContent = "▼TEAM";
        sharedRow.appendChild(sharedLabel);
        const sharedBar = document.createElement("div");
        Object.assign(sharedBar.style, {
            flex: "1",
            height: "6px",
            background: "rgba(0, 30, 40, 0.6)",
            border: "1px solid rgba(80, 200, 220, 0.4)",
            position: "relative",
            overflow: "hidden",
        });
        const sharedFill = document.createElement("div");
        Object.assign(sharedFill.style, {
            position: "absolute",
            top: "0", left: "0",
            height: "100%", width: "100%",
            background: "linear-gradient(90deg, rgba(60, 200, 220, 1), rgba(120, 240, 200, 1))",
            transition: "width 0.15s",
        });
        sharedBar.appendChild(sharedFill);
        sharedRow.appendChild(sharedBar);
        const sharedText = document.createElement("div");
        sharedText.style.cssText = "width: 65px; font-size: 10px; text-align: right; color: #8ee;";
        sharedRow.appendChild(sharedText);
        root.appendChild(sharedRow);
        this._sharedRow  = sharedRow;
        this._sharedFill = sharedFill;
        this._sharedText = sharedText;

        // Distance + defenders rows
        const stats = document.createElement("div");
        stats.style.cssText = "display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px;";
        const distLabel = document.createElement("div");
        const defLabel  = document.createElement("div");
        const timeLabel = document.createElement("div");
        stats.appendChild(distLabel);
        stats.appendChild(defLabel);
        stats.appendChild(timeLabel);
        root.appendChild(stats);

        // Round 3/57 — energy gauge. Round 57 replaces the text-only
        // readout with an SVG semicircle (F→E arc with a red reserve
        // zone) + a formatted numeric value beside it. The text said
        // "118.2342345364356345345435" as a raw float; now it's
        // rounded + visually anchored.
        const econ = document.createElement("div");
        econ.style.cssText = "display: flex; align-items: center; gap: 8px; font-size: 11px; margin-top: 3px; color: #ffd884;";
        const energyLabel = document.createElement("div");
        energyLabel.style.cssText = "display: flex; align-items: center; gap: 6px; flex: 0 0 auto;";
        // SVG gauge: 80x44 viewbox, semicircle from F (left) to E (right).
        // Healthy band yellow→green; reserve (last 12.5%) red. Needle
        // pivots from center-bottom to indicate current position.
        energyLabel.innerHTML = `
            <svg width="60" height="34" viewBox="0 0 80 44" style="flex: 0 0 auto;" aria-label="energy gauge">
                <!-- Reserve zone (red, last 12.5%) drawn first so the
                     healthy band overlays it where applicable. -->
                <path d="M 70 38 A 30 30 0 0 0 65.4 22.5" stroke="#cc3333" stroke-width="5" fill="none" stroke-linecap="butt"/>
                <!-- Healthy band background (dim) -->
                <path d="M 10 38 A 30 30 0 0 1 65.4 22.5" stroke="#3a3a3a" stroke-width="5" fill="none" stroke-linecap="butt"/>
                <!-- Filled portion — width set per frame via stroke-dasharray.
                     Path length is ~94; we'll mask via dashoffset. -->
                <path id="energyGaugeFill" d="M 10 38 A 30 30 0 0 1 70 38" stroke="#5eff8a" stroke-width="5" fill="none" stroke-linecap="butt" stroke-dasharray="94 94" stroke-dashoffset="94"/>
                <!-- Labels -->
                <text x="6" y="44" font-size="8" fill="#ffd884" font-family="monospace">F</text>
                <text x="70" y="44" font-size="8" fill="#ff8a5e" font-family="monospace">E</text>
                <!-- Needle (rotates around 40,38) -->
                <g id="energyNeedleGroup" transform="rotate(-90 40 38)">
                    <line x1="40" y1="38" x2="40" y2="14" stroke="#ffd884" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="40" cy="38" r="2" fill="#ffd884"/>
                </g>
            </svg>
            <span id="energyValueText" style="font-family: monospace; min-width: 60px;">⚡ 0</span>
        `;
        const selLabel    = document.createElement("div");
        econ.appendChild(energyLabel);
        econ.appendChild(selLabel);
        root.appendChild(econ);
        this._energyLabel = energyLabel;
        this._energyGaugeFill   = energyLabel.querySelector("#energyGaugeFill");
        this._energyNeedleGroup = energyLabel.querySelector("#energyNeedleGroup");
        this._energyValueText   = energyLabel.querySelector("#energyValueText");
        this._selLabel    = selLabel;

        // Round 9 — hard point pip row
        const hpRow2 = document.createElement("div");
        Object.assign(hpRow2.style, {
            display: "flex",
            gap: "4px",
            marginTop: "5px",
            justifyContent: "center",
        });
        root.appendChild(hpRow2);
        this._hpRow = hpRow2;
        this._hpPips = {};
        for (const key of ["main_weapon", "engine", "tech_module", "sensor"]) {
            const pip = document.createElement("div");
            const labels = { main_weapon: "WPN", engine: "ENG", tech_module: "TEC", sensor: "SEN" };
            Object.assign(pip.style, {
                padding: "2px 6px",
                fontSize: "9px",
                fontFamily: "monospace",
                background: "rgba(40, 50, 60, 0.7)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: "3px",
                color: "#aabbcc",
                letterSpacing: "0.5px",
            });
            pip.textContent = labels[key];
            hpRow2.appendChild(pip);
            this._hpPips[key] = pip;
        }

        // Round 9 — air drop button
        const dropBtn = document.createElement("button");
        Object.assign(dropBtn.style, {
            marginTop: "5px",
            padding: "4px 8px",
            background: "linear-gradient(180deg, rgba(40, 100, 180, 0.85), rgba(20, 60, 120, 0.85))",
            border: "1px solid rgba(120, 180, 240, 0.6)",
            borderRadius: "3px",
            color: "#dceeff",
            fontFamily: "monospace",
            fontSize: "10px",
            fontWeight: "bold",
            letterSpacing: "1px",
            cursor: "pointer",
            width: "100%",
        });
        dropBtn.textContent = "📦  AIR DROP (200 score)";
        dropBtn.addEventListener("click", () => {
            const ok = this.scenario.callAirDrop?.();
            if (!ok) console.log("[OGRE] air drop failed — not enough score?");
        });
        root.appendChild(dropBtn);
        this._dropBtn = dropBtn;

        // Round 43f - pause button compact + at top-right of OGRE panel.
        // root has position:absolute already; this gets pinned to its
        // top-right corner so it doesn't take up a full row.
        const pauseBtn = document.createElement("button");
        Object.assign(pauseBtn.style, {
            position: "absolute",
            top: "6px",
            right: "6px",
            padding: "2px 7px",
            background: "rgba(50, 50, 60, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: "3px",
            color: "#cfd8e8",
            fontFamily: "monospace",
            fontSize: "10px",
            cursor: "pointer",
            zIndex: "10",
        });
        pauseBtn.textContent = "II PAUSE";
        pauseBtn.title = "Pause (or press Space)";
        pauseBtn.addEventListener("click", () => this.scenario.togglePause?.());
        root.appendChild(pauseBtn);
        this._pauseBtn = pauseBtn;

        // Round 2 — command hint row
        const hint = document.createElement("div");
        Object.assign(hint.style, {
            fontSize: "10px",
            color: "rgba(180, 220, 255, 0.85)",
            marginTop: "5px",
            paddingTop: "5px",
            borderTop: "1px solid rgba(255, 255, 255, 0.15)",
            textAlign: "center",
        });
        root.appendChild(hint);
        this._hint = hint;

        // ---- Round 49 — Sell / Repair action row ------------------
        // Mirrors the [ and ] hotkeys. Visible whenever a defender is
        // selected; greyed when not. Shows live cost / refund based on
        // the selected defender's type + missing HP + current energy.
        const actionRow = document.createElement("div");
        Object.assign(actionRow.style, {
            display: "flex",
            gap: "6px",
            marginTop: "6px",
            paddingTop: "6px",
            borderTop: "1px solid rgba(255, 255, 255, 0.15)",
        });

        const mkBtn = (label, hot, color) => {
            const btn = document.createElement("button");
            btn.innerHTML = `<span style="opacity:0.9">${label}</span><span style="opacity:0.55;font-size:10px;margin-left:6px">[${hot}]</span><div style="font-size:9px;opacity:0.75;margin-top:2px" class="cost"></div>`;
            Object.assign(btn.style, {
                flex: "1",
                padding: "6px 8px",
                fontFamily: "monospace",
                fontSize: "12px",
                fontWeight: "bold",
                color: "#fff",
                background: `rgba(${color}, 0.30)`,
                border: `1px solid rgba(${color}, 0.65)`,
                borderRadius: "4px",
                cursor: "pointer",
                transition: "background 0.12s, opacity 0.15s",
                opacity: "0.45",          // disabled-look default
                pointerEvents: "none",
                textAlign: "center",
            });
            btn.addEventListener("mouseenter", () => {
                if (btn.style.pointerEvents !== "none") btn.style.background = `rgba(${color}, 0.55)`;
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.background = `rgba(${color}, 0.30)`;
            });
            return btn;
        };

        const sellBtn = mkBtn("SELL", "[", "255, 110, 110");
        const repairBtn = mkBtn("REPAIR", "]", "110, 255, 170");
        sellBtn.addEventListener("click", () => {
            const def = this.scenario.selectedDefender;
            if (!def) return;
            const slot = this.scenario.slots?.find(s =>
                s.filled &&
                Math.abs(s.x - def.x) < 0.5 &&
                Math.abs(s.z - def.z) < 0.5
            );
            if (slot) this.scenario.sellTurretAtSlot(slot);
            else      def._sold = true;            // pre-placed: just mark sold
        });
        repairBtn.addEventListener("click", () => {
            this.scenario.repairDefender();
        });
        actionRow.appendChild(sellBtn);
        actionRow.appendChild(repairBtn);
        root.appendChild(actionRow);
        this._sellBtn = sellBtn;
        this._repairBtn = repairBtn;

        // End-game card (overlaid on top of root, hidden by default)
        const endCard = document.createElement("div");
        Object.assign(endCard.style, {
            position: "fixed",
            top: "40%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            padding: "20px 40px",
            fontFamily: "monospace",
            fontSize: "32px",
            fontWeight: "bold",
            border: "2px solid rgba(255,255,255,0.35)",
            borderRadius: "8px",
            zIndex: "30",
            display: "none",
            textAlign: "center",
        });
        document.body.appendChild(endCard);

        document.body.appendChild(root);
        this._root = root;
        this._hpFill = hpFill;
        this._hpText = hpText;
        this._distLabel = distLabel;
        this._defLabel  = defLabel;
        this._timeLabel = timeLabel;
        this._endCard = endCard;
    }

    update() {
        const s = this.scenario.getStatus?.();
        if (!s) {
            this._root.style.display = "none";
            this._endCard.style.display = "none";
            return;
        }

        // State transitions
        if (s.state !== this._lastState) {
            this._lastState = s.state;
            if (s.state === "won" || s.state === "lost") {
                this._showEndCard(s);
            }
        }

        if (s.state === "playing") {
            this._root.style.display = "block";
            this._endCard.style.display = "none";
            // Round 10 — boss banner + pause toggle
            this._bossBanner.style.display = s.isBossWave ? "block" : "none";
            this._pauseBtn.textContent = s.paused ? "> RESUME" : "II PAUSE";
            this._pauseBtn.style.background = s.paused ? "rgba(80, 60, 30, 0.85)" : "rgba(50, 50, 60, 0.7)";
            // Round 5 — wave + variant in title
            const phaseLabel = s.phase === 3 ? " — DEATH RATTLE"
                            : s.phase === 2 ? " — ENRAGED"
                            : "";
            const phaseColor = s.phase === 3 ? "#ff3c3c"
                            : s.phase === 2 ? "#ffae3c"
                            : "#ff8a3c";
            const envBadge = s.envName ? `[${s.envName.toUpperCase()}]` : "";
            const waveLabel = s.wave ? `round ${s.wave}: ${s.variantName} ${envBadge}` : "OGRE";
            this._title.textContent = `▶  ${waveLabel}${phaseLabel}`;
            this._title.style.color = phaseColor;
            const hpPct = (s.ogreHpFrac ?? 0) * 100;
            this._hpFill.style.width = hpPct.toFixed(0) + "%";
            this._hpText.textContent = `${Math.round(s.ogreHp ?? 0)} / ${s.ogreMaxHp ?? 0}`;
            // Round 131 — shared HP row visibility. Show only when
            // multiplayer is engaged: shared pool active AND at least
            // 2 contributors. Solo single-contributor sessions hide
            // the row to keep the HUD tidy (it'd just mirror local HP).
            const sharedState = this.scenario.sharedOgreState;
            const contribs = sharedState?.contributors || [];
            if (sharedState?.active && contribs.length >= 2) {
                this._sharedRow.style.display = "flex";
                const sharedPct = sharedState.ogreMaxHp > 0
                    ? (sharedState.ogreHp / sharedState.ogreMaxHp) * 100
                    : 0;
                this._sharedFill.style.width = sharedPct.toFixed(0) + "%";
                this._sharedText.textContent = `${Math.round(sharedState.ogreHp)} / ${sharedState.ogreMaxHp}`;
                // Update team-mate count tag
                const others = contribs.length;
                this._sharedRow.title = `Shared pool — ${others} contributors`;
            } else {
                this._sharedRow.style.display = "none";
            }
            this._distLabel.textContent = `dist: ${(s.ogreDistance ?? 0).toFixed(0)}m`;
            this._defLabel.textContent  = `defenders: ${s.defendersAlive}/${s.defendersTotal}`;
            this._timeLabel.textContent = `t: ${(s.elapsedSec ?? 0).toFixed(0)}s`;
            this._updateEnergyGauge(s);
            // Round 5 — score, minion count, HQ HP
            const scoreParts = [`score: ${s.score ?? 0}`];
            if ((s.minionCount ?? 0) > 0) scoreParts.push(`mn: ${s.minionCount}`);
            if ((s.droneCount ?? 0) > 0)  scoreParts.push(`dr: ${s.droneCount}`);
            if ((s.shardCount ?? 0) > 0)  scoreParts.push(`sh: ${s.shardCount}`);
            if ((s.shieldHp ?? 0) > 0) {
                const sPct = ((s.shieldHp / s.shieldMaxHp) * 100).toFixed(0);
                scoreParts.push(`◊ shield ${sPct}%`);
            }
            if (s.hqHp != null && s.hqHp < s.hqMaxHp) {
                scoreParts.push(`HQ ${Math.max(0, s.hqHp).toFixed(0)}/${s.hqMaxHp}`);
            }
            this._selLabel.textContent = scoreParts.join("  ·  ");

            // Round 9 — refresh hard point pips
            const hpMap = {};
            for (const h of (s.hardpoints ?? [])) hpMap[h.key] = h;
            for (const key of Object.keys(this._hpPips)) {
                const pip = this._hpPips[key];
                const h = hpMap[key];
                if (!h) {
                    pip.style.display = "none";
                    continue;
                }
                pip.style.display = "inline-block";
                if (h.destroyed) {
                    pip.style.background = "rgba(80, 0, 0, 0.7)";
                    pip.style.color = "#ff5e5e";
                    pip.style.borderColor = "rgba(255, 80, 80, 0.4)";
                    pip.style.textDecoration = "line-through";
                } else {
                    const frac = h.hp / h.maxHp;
                    pip.style.textDecoration = "none";
                    if (frac > 0.7) {
                        pip.style.background = "rgba(40, 80, 60, 0.7)";
                        pip.style.color = "#aaffcc";
                        pip.style.borderColor = "rgba(150, 255, 200, 0.4)";
                    } else if (frac > 0.3) {
                        pip.style.background = "rgba(80, 70, 30, 0.7)";
                        pip.style.color = "#ffd884";
                        pip.style.borderColor = "rgba(255, 220, 130, 0.4)";
                    } else {
                        pip.style.background = "rgba(80, 30, 30, 0.7)";
                        pip.style.color = "#ff8888";
                        pip.style.borderColor = "rgba(255, 130, 130, 0.5)";
                    }
                }
            }
            // Round 9 — air drop button affordability
            if (s.canAffordAirDrop) {
                this._dropBtn.disabled = false;
                this._dropBtn.style.opacity = "1";
                this._dropBtn.style.cursor = "pointer";
            } else {
                this._dropBtn.disabled = true;
                this._dropBtn.style.opacity = "0.55";
                this._dropBtn.style.cursor = "not-allowed";
            }
            this._dropBtn.style.display = "block";

            // Round 48 - sell/repair button live state. Buttons created
            // disabled (opacity 0.45, pointerEvents none); flip when a
            // defender is selected. Cost previews come from getStatus().
            const sellCost = this._sellBtn.querySelector(".cost");
            const repairCost = this._repairBtn.querySelector(".cost");
            if (s.hasSelection && s.canSell) {
                this._sellBtn.style.opacity = "1";
                this._sellBtn.style.pointerEvents = "auto";
                this._sellBtn.style.cursor = "pointer";
                if (sellCost) sellCost.textContent = `+${s.selectedRefund ?? 0}e refund`;
            } else {
                this._sellBtn.style.opacity = "0.45";
                this._sellBtn.style.pointerEvents = "none";
                this._sellBtn.style.cursor = "default";
                if (sellCost) sellCost.textContent = s.hasSelection ? "—" : "(select defender)";
            }
            if (s.hasSelection && s.canRepair) {
                this._repairBtn.style.opacity = "1";
                this._repairBtn.style.pointerEvents = "auto";
                this._repairBtn.style.cursor = "pointer";
                // Show partial-repair indicator if affordable < full needed
                if (repairCost) {
                    const partial = (s.selectedRepairCost ?? 0) < (s.selectedRepairFullCost ?? 0);
                    repairCost.textContent = partial
                        ? `−${s.selectedRepairCost}e (+${s.selectedRepairHp}hp, partial)`
                        : `−${s.selectedRepairCost}e (+${s.selectedRepairHp}hp)`;
                }
            } else {
                this._repairBtn.style.opacity = "0.45";
                this._repairBtn.style.pointerEvents = "none";
                this._repairBtn.style.cursor = "default";
                if (repairCost) {
                    if (!s.hasSelection)              repairCost.textContent = "(select defender)";
                    else if (!s.selectedNeedsRepair)  repairCost.textContent = "(at full HP)";
                    else                              repairCost.textContent = "(not enough energy)";
                }
            }

            if (s.pendingBuy) {
                this._hint.textContent = "→  pick a turret type above (right-click to cancel)";
            } else if (s.hasSelection) {
                this._hint.textContent = "→  click ground to move (right-click to deselect)";
            } else if (s.variantSpecial === "carrier") {
                this._hint.textContent = "⚠  CARRIER — minions will reach HQ; shoot them down";
            } else if (s.variantSpecial === "drones") {
                this._hint.textContent = "⚠  DRONE BAY — flying drones strafe defenders";
            } else if (s.variantSpecial === "aegis" && (s.shieldHp ?? 0) > 0) {
                this._hint.textContent = "◊  AEGIS — break the shield first";
            } else if (s.variantSpecial === "phantom") {
                this._hint.textContent = s.cloaked
                    ? "◌  CLOAKED — hits pass through"
                    : "👁  PHANTOM — will cloak below 50% HP";
            } else if (s.variantSpecial === "magnetic") {
                this._hint.textContent = s.magneticActive
                    ? "✜  MAGNETIC PULSE — projectiles deflected!"
                    : "✜  MAGNETIC — pulses every 6s";
            } else if (s.variantSpecial === "splitter") {
                this._hint.textContent = s.didSplit
                    ? `⚠  SHARDS DEPLOYED — ${s.shardCount} active`
                    : "⚠  SPLITTER — splits at 50% HP";
            } else {
                this._hint.textContent = s.variantDesc || "→  click defender (cyan) | empty slot (yellow ghost) to buy";
            }
        } else if (s.state === "intermission") {
            this._root.style.display = "block";
            this._endCard.style.display = "none";
            this._title.textContent = `WAVE ${s.wave} CLEARED — score: ${s.score}`;
            this._title.style.color = "#5eff8a";
            const remain = (s.intermissionRemaining ?? 0).toFixed(1);
            this._hint.textContent = `next wave in ${remain}s …  (+${30} energy bonus)`;
            this._hpFill.style.width = "0%";
            this._hpText.textContent = "—";
            this._distLabel.textContent = "";
            this._defLabel.textContent  = `defenders: ${s.defendersAlive}/${s.defendersTotal}`;
            this._timeLabel.textContent = "";
            this._updateEnergyGauge(s);
            this._selLabel.textContent = `score: ${s.score ?? 0}`;
            // Hide round 9 elements during intermission
            for (const pip of Object.values(this._hpPips)) pip.style.display = "none";
            this._dropBtn.style.display = "none";
        } else if (s.state === "idle") {
            this._root.style.display = "none";
            this._endCard.style.display = "none";
        } else {
            // Won / lost — keep banner visible, end card already shown
            this._root.style.display = "block";
        }
    }

    _showEndCard(s) {
        const card = this._endCard;
        if (s.state === "won") {
            card.innerHTML = `DEFENDERS WIN<br><span style="font-size:18px; color:#a8ffc6">wave ${s.wave} cleared</span><br><span style="font-size:18px; color:#a8ffc6">score: ${s.score ?? 0}</span>`;
            card.style.color = "#5eff8a";
            card.style.background = "rgba(0, 30, 10, 0.9)";
        } else if (s.state === "lost") {
            card.innerHTML = `OGRE BREACHED HQ<br><span style="font-size:18px; color:#ffb0b0">survived ${s.wave - 1} waves</span><br><span style="font-size:18px; color:#ffb0b0">score: ${s.score ?? 0}</span>`;
            card.style.color = "#ff5e5e";
            card.style.background = "rgba(40, 0, 0, 0.9)";
        }
        card.style.display = "block";
        // End card stays visible until scenario.stop() / restart
    }

    // Round 57 - update the SVG semicircle energy gauge. Maps current
    // energy / max to a needle angle (-90° at F → +90° at E) and to a
    // stroke-dashoffset on the filled arc. Numeric readout rounded.
    _updateEnergyGauge(s) {
        const cur = +(s.energy ?? 0);
        const max = +(s.energyMax ?? 200);
        const reserve = +(s.energyReserve ?? 25);
        const t = Math.max(0, Math.min(1, cur / max));     // 0..1 of max
        // Needle: -90° at full (left, F), +90° at empty (right, E).
        // So angle = -90 + (1 - t) * 180.
        const angle = -90 + (1 - t) * 180;
        if (this._energyNeedleGroup) {
            this._energyNeedleGroup.setAttribute("transform", `rotate(${angle.toFixed(1)} 40 38)`);
        }
        if (this._energyGaugeFill) {
            // Filled arc length is ~94. Reveal (1 - t) of it from the
            // F side — when t=1 (full) offset=0 (full visible from F).
            // When t=0 (empty) offset=94 (nothing visible).
            const dashLen = 94;
            const visible = dashLen * t;
            this._energyGaugeFill.setAttribute("stroke-dasharray", `${visible.toFixed(1)} ${dashLen}`);
            this._energyGaugeFill.setAttribute("stroke-dashoffset", "0");
            // Color: green when healthy, yellow when low, red in reserve
            let color = "#5eff8a";
            if (cur < reserve)        color = "#ff5e5e";
            else if (cur < max * 0.4) color = "#ffd884";
            this._energyGaugeFill.setAttribute("stroke", color);
        }
        if (this._energyValueText) {
            // Round to integer. Show "⚡ 118" not "⚡ 118.2342345...".
            this._energyValueText.textContent = `⚡ ${Math.round(cur)}`;
            // Pulse red when in reserve zone
            this._energyValueText.style.color = (cur < reserve) ? "#ff8a8a" : "#ffd884";
        }
    }
}
