// FILE: ui/OgreBuyPanel.js
// VERSION: v1 — round 3 of OGRE arc
//
// Pops up when a player clicks an empty turret slot. Shows three
// buttons (machinegun / missile / railgun) with cost + stats.
// Disabled buttons indicate insufficient energy.

import { TURRET_TYPES } from "../simulation/OgreScenario.js";

export class OgreBuyPanel {

    constructor({ scenario }) {
        this.scenario = scenario;
        this._build();
        this._lastPending = false;
    }

    _build() {
        const root = document.createElement("div");
        Object.assign(root.style, {
            position: "fixed",
            top: "115px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(8, 12, 24, 0.92)",
            border: "1px solid rgba(80, 200, 255, 0.4)",
            borderRadius: "6px",
            padding: "10px 12px",
            fontFamily: "monospace",
            color: "#e8f0ff",
            zIndex: "21",
            display: "none",
        });

        const title = document.createElement("div");
        title.textContent = "▶  BUY TURRET";
        Object.assign(title.style, {
            fontSize: "13px",
            fontWeight: "bold",
            color: "#5ec8ff",
            marginBottom: "8px",
            letterSpacing: "1.5px",
            textAlign: "center",
        });
        root.appendChild(title);

        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            gap: "8px",
            justifyContent: "center",
        });

        this._buttons = {};
        for (const key of ["machinegun", "missile", "railgun", "napalm", "minelayer", "landmine", "subturret"]) {
            const tt = TURRET_TYPES[key];
            const btn = document.createElement("button");
            Object.assign(btn.style, {
                padding: "6px 10px",
                background: "rgba(20, 40, 80, 0.7)",
                border: "1px solid rgba(80, 200, 255, 0.4)",
                color: "#e8f0ff",
                fontFamily: "monospace",
                fontSize: "11px",
                cursor: "pointer",
                minWidth: "120px",
                textAlign: "left",
            });
            btn.dataset.key = key;

            const head = document.createElement("div");
            head.style.cssText = "font-weight: bold; font-size: 12px; color: #ffd884;";
            head.textContent = tt.name;
            btn.appendChild(head);

            const cost = document.createElement("div");
            cost.style.cssText = "font-size: 11px; color: #5eff8a; margin-top: 2px;";
            cost.textContent = `cost: ${tt.cost}`;
            btn.appendChild(cost);

            const stats = document.createElement("div");
            stats.style.cssText = "font-size: 9px; color: rgba(180,200,220,0.8); margin-top: 3px; line-height: 1.4;";
            stats.innerHTML = `dmg: ${tt.damage}<br>cd: ${tt.fireInterval.toFixed(1)}s<br>range: ${tt.range}m${tt.aoe > 0 ? "<br>aoe: " + tt.aoe + "m" : ""}`;
            btn.appendChild(stats);

            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                this._onBuy(key);
            });
            row.appendChild(btn);
            this._buttons[key] = { btn, head, cost, stats };
        }
        root.appendChild(row);

        // Close hint
        const hint = document.createElement("div");
        Object.assign(hint.style, {
            fontSize: "9px",
            color: "rgba(180, 200, 220, 0.65)",
            marginTop: "8px",
            textAlign: "center",
        });
        hint.textContent = "right-click to cancel";
        root.appendChild(hint);

        document.body.appendChild(root);
        this._root = root;
    }

    _onBuy(key) {
        const slot = this.scenario.getPendingBuySlot?.();
        if (!slot) return;
        const ok = this.scenario.buyTurretAtSlot?.(slot, key);
        if (ok) {
            // Panel closes automatically because pendingBuySlot is now null
            this._root.style.display = "none";
        }
    }

    update() {
        const s = this.scenario.getStatus?.();
        if (!s || s.state !== "playing") {
            this._root.style.display = "none";
            this._lastPending = false;
            return;
        }
        const pending = !!s.pendingBuy;
        if (pending) {
            this._root.style.display = "block";
            // Update affordability per button
            for (const key of Object.keys(this._buttons)) {
                const tt = TURRET_TYPES[key];
                const e = this._buttons[key];
                const affordable = (s.energy ?? 0) >= tt.cost;
                e.btn.style.opacity = affordable ? "1.0" : "0.45";
                e.btn.style.cursor = affordable ? "pointer" : "not-allowed";
                e.btn.disabled = !affordable;
                e.cost.style.color = affordable ? "#5eff8a" : "#ff8484";
            }
        } else {
            this._root.style.display = "none";
        }
        this._lastPending = pending;
    }
}
