// FILE: ui/OgreLauncher.js
// VERSION: v2 — round 8 of OGRE arc

import { OGRE_DIFFICULTIES } from "../simulation/OgreScenario.js";

export class OgreLauncher {

    constructor({ scenario }) {
        this.scenario = scenario;
        this._build();
    }

    _build() {
        const root = document.createElement("div");
        Object.assign(root.style, {
            position: "fixed",
            top: "12px",
            right: "12px",
            zIndex: "21",
            fontFamily: "monospace",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "5px",
        });

        const btn = document.createElement("button");
        Object.assign(btn.style, {
            // Round 43c — hidden. Demo dropdown handles start/stop now.
            display: "none",
            padding: "8px 14px",
            background: "linear-gradient(180deg, rgba(255, 90, 30, 0.85), rgba(180, 40, 10, 0.85))",
            border: "1px solid rgba(255, 200, 120, 0.5)",
            borderRadius: "5px",
            color: "#fff8e8",
            fontFamily: "monospace",
            fontSize: "12px",
            fontWeight: "bold",
            letterSpacing: "1.5px",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.4)",
            minWidth: "150px",
        });
        btn.textContent = "▶  START OGRE";
        btn.addEventListener("click", () => {
            const s = this.scenario.getStatus?.();
            if (!s || s.state === "idle") {
                this.scenario.start?.({ difficulty: this._difficulty });
            } else {
                if (confirm("Stop OGRE scenario?")) this.scenario.stop?.();
            }
        });
        root.appendChild(btn);

        const diffRow = document.createElement("div");
        Object.assign(diffRow.style, {
            display: "flex",
            gap: "3px",
            background: "rgba(0, 0, 0, 0.7)",
            padding: "4px 6px",
            borderRadius: "4px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
        });

        this._difficulty = "normal";
        this._diffButtons = {};
        for (const key of Object.keys(OGRE_DIFFICULTIES)) {
            const cfg = OGRE_DIFFICULTIES[key];
            const dBtn = document.createElement("button");
            dBtn.textContent = cfg.name;
            Object.assign(dBtn.style, {
                padding: "3px 7px",
                background: "rgba(30, 30, 40, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                color: "#cfd8e8",
                fontFamily: "monospace",
                fontSize: "10px",
                cursor: "pointer",
                borderRadius: "3px",
            });
            dBtn.addEventListener("click", () => {
                this._difficulty = key;
                this.scenario.setDifficulty?.(key);
                this._refreshDiffButtons();
            });
            diffRow.appendChild(dBtn);
            this._diffButtons[key] = { btn: dBtn, cfg };
        }
        root.appendChild(diffRow);

        const best = document.createElement("div");
        Object.assign(best.style, {
            fontSize: "10px",
            color: "rgba(180, 200, 220, 0.85)",
            background: "rgba(0, 0, 0, 0.65)",
            padding: "3px 7px",
            borderRadius: "3px",
            fontFamily: "monospace",
        });
        root.appendChild(best);
        this._best = best;

        document.body.appendChild(root);
        this._root = root;
        this._btn = btn;
        this._refreshDiffButtons();
    }

    _refreshDiffButtons() {
        for (const key of Object.keys(this._diffButtons)) {
            const e = this._diffButtons[key];
            const selected = key === this._difficulty;
            e.btn.style.background = selected
                ? `${e.cfg.color}30`
                : "rgba(30, 30, 40, 0.5)";
            e.btn.style.borderColor = selected ? e.cfg.color : "rgba(255, 255, 255, 0.2)";
            e.btn.style.color = selected ? e.cfg.color : "#cfd8e8";
            e.btn.style.fontWeight = selected ? "bold" : "normal";
        }
    }

    update() {
        const s = this.scenario.getStatus?.();
        // Round 43c — entire launcher only visible while OGRE is running.
        // When idle, demo dropdown is the only way to start; chrome stays
        // out of the way.
        if (!s || s.state === "idle") {
            this._root.style.display = "none";
            return;
        }
        this._root.style.display = "flex";

        this._btn.style.display = "block";
        this._btn.textContent = "■  STOP";
        this._btn.style.background = "linear-gradient(180deg, rgba(70, 70, 80, 0.85), rgba(40, 40, 50, 0.85))";
        const cfg = OGRE_DIFFICULTIES[s.difficulty || this._difficulty];
        if (s.bestScore || s.bestWave) {
            this._best.textContent = `best (${cfg.name}):  wave ${s.bestWave}  ·  ${s.bestScore}`;
        } else {
            this._best.textContent = `best (${cfg.name}): —`;
        }
        for (const key of Object.keys(this._diffButtons)) {
            this._diffButtons[key].btn.disabled = true;
            this._diffButtons[key].btn.style.opacity = "0.55";
        }
    }
}
