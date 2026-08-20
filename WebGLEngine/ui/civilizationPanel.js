// FILE: ui/civilizationPanel.js
// VERSION: v1
//
// Lists active civilizations: name, position, stability, age. Click a
// row to snap the camera to that civ.
//
// Refresh strategy mirrors CameraPanel: update at 4Hz, but only do a
// full DOM rebuild when the civ id set changes (births/deaths). For
// stable populations, just update the numeric values per existing row.
// This keeps the panel cheap even when civs are continuously ticking.

import { PERSONALITY_DATA } from "../simulation/civPersonalities.js";
//
// The colored dot next to each name matches the in-world marker color
// (golden-angle hue from civ.id) so the panel and 3D scene read as
// the same set of entities.

const PANEL_WIDTH_PX = 240;

export class CivilizationPanel {
    constructor({ parent, civManager, camera }) {
        this.civManager = civManager;
        this.camera = camera;
        this._lastRefresh = 0;
        this._lastSig = "";
        this._build(parent ?? document.body);
        this._refresh();
    }

    update(tNowMs) {
        if (tNowMs - this._lastRefresh < 250) return;
        this._lastRefresh = tNowMs;
        this._refresh();
    }

    _build(parent) {
        const wrap = document.createElement("div");
        Object.assign(wrap.style, {
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "rgba(0, 0, 0, 0.82)",
            color: "#fff",
            padding: "8px 10px 10px",
            fontFamily: "monospace",
            fontSize: "11px",
            width: PANEL_WIDTH_PX + "px",
            border: "1px solid rgba(160, 200, 255, 0.25)",
            zIndex: 9100,
        });

        const header = document.createElement("div");
        header.textContent = "🏛️  Civilizations";
        Object.assign(header.style, {
            fontWeight: "bold",
            color: "#9cf",
            marginBottom: "6px",
            fontSize: "12px",
        });
        wrap.appendChild(header);

        this._listEl = document.createElement("div");
        wrap.appendChild(this._listEl);

        this._emptyEl = document.createElement("div");
        this._emptyEl.textContent = "(none active)";
        Object.assign(this._emptyEl.style, {
            opacity: "0.5",
            fontStyle: "italic",
            fontSize: "10px",
            padding: "4px 0",
        });
        wrap.appendChild(this._emptyEl);

        parent.appendChild(wrap);
        this.root = wrap;
    }

    _refresh() {
        const civs = this.civManager.getAll();
        // Signature based on id set — only rebuild rows when births/
        // deaths happen. Counts as a quick path for the steady state.
        const ids = civs.map(c => c.id).sort((a, b) => a - b).join(",");
        if (ids !== this._lastSig) {
            this._lastSig = ids;
            this._rebuildRows(civs);
        } else {
            this._updateValues(civs);
        }
    }

    _rebuildRows(civs) {
        this._listEl.innerHTML = "";
        this._emptyEl.style.display = civs.length === 0 ? "block" : "none";
        for (const civ of civs) {
            this._listEl.appendChild(this._civRow(civ));
        }
    }

    _civRow(civ) {
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "3px 4px",
            borderRadius: "2px",
            cursor: "pointer",
            marginBottom: "2px",
            background: "rgba(255, 255, 255, 0.04)",
        });
        row.addEventListener("mouseenter", () => {
            row.style.background = "rgba(160, 200, 255, 0.18)";
        });
        row.addEventListener("mouseleave", () => {
            row.style.background = "rgba(255, 255, 255, 0.04)";
        });
        row.addEventListener("click", () => this._snapTo(civ));

        // Color dot — matches the in-world marker hue
        const dot = document.createElement("div");
        const [r, g, b] = hslToRgbInt(((civ.id * 137.5) % 360) / 360, 0.7, 0.6);
        Object.assign(dot.style, {
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: `rgb(${r}, ${g}, ${b})`,
            flexShrink: "0",
        });
        row.appendChild(dot);

        // Left: name + style + position
        const left = document.createElement("div");
        left.style.flex = "1";
        const nameRow = document.createElement("div");
        nameRow.style.display = "flex";
        nameRow.style.gap = "4px";
        nameRow.style.alignItems = "baseline";
        const name = document.createElement("span");
        name.textContent = civ.name ?? `Civ ${civ.id}`;
        name.style.fontWeight = "bold";

        // Round 34 — personality icon (☮ ⚔ ✦ → ⚙) tinted by archetype color
        const personality = document.createElement("span");
        const pData = PERSONALITY_DATA[civ.personality];
        if (pData) {
            personality.textContent = pData.icon;
            personality.title = civ.personality;     // tooltip
            Object.assign(personality.style, {
                color: pData.color,
                fontSize: "12px",
                marginLeft: "2px",
            });
        }

        const style = document.createElement("span");
        style.textContent = civ.style ?? "";
        Object.assign(style.style, {
            fontSize: "9px",
            opacity: "0.45",
            fontStyle: "italic",
        });
        nameRow.appendChild(name);
        nameRow.appendChild(personality);
        nameRow.appendChild(style);
        const pos = document.createElement("div");
        pos.textContent = `(${civ.center.x | 0}, ${civ.center.z | 0})`;
        Object.assign(pos.style, { fontSize: "9px", opacity: "0.55" });

        // Round 13 — at-war indicator. Lists civs this one is currently
        // in conflict with. Hidden when peaceful.
        const warRow = document.createElement("div");
        Object.assign(warRow.style, {
            fontSize: "9px",
            color: "#f86",
            display: "none",
        });
        this._populateWarRow(warRow, civ);

        // Round 25 — megastructure status row
        const megaRow = document.createElement("div");
        Object.assign(megaRow.style, {
            fontSize: "9px",
            color: "#fc6",
            display: "none",
        });
        this._populateMegaRow(megaRow, civ);

        // Round 27 — tech tier status row
        const techRow = document.createElement("div");
        Object.assign(techRow.style, {
            fontSize: "9px",
            color: "#9cf",
            display: "none",
        });
        this._populateTechRow(techRow, civ);

        left.appendChild(nameRow);
        left.appendChild(pos);
        left.appendChild(warRow);
        left.appendChild(megaRow);
        left.appendChild(techRow);
        row.appendChild(left);

        // Right: stability percent + age
        const right = document.createElement("div");
        right.style.textAlign = "right";
        const stab = document.createElement("div");
        stab.textContent = `${(((civ.stability ?? 0) * 100) | 0)}%`;
        Object.assign(stab.style, { color: "#9cf", fontSize: "10px" });
        const age = document.createElement("div");
        age.textContent = `${(civ.age ?? 0) | 0}s`;
        Object.assign(age.style, { fontSize: "9px", opacity: "0.5" });
        right.appendChild(stab);
        right.appendChild(age);
        row.appendChild(right);

        // Stash refs for cheap value updates
        row._civId  = civ.id;
        row._stabEl = stab;
        row._ageEl  = age;
        row._posEl  = pos;
        row._warEl  = warRow;
        row._megaEl = megaRow;
        row._techEl = techRow;
        return row;
    }

    // Round 27 — tech tier display. ⚡ icon + tier name + research
    // progress percentage to next tier.
    _populateTechRow(el, civ) {
        const TIER_NAMES = ["", "Walls", "Watchtowers", "Defenders", "Counter-Strike"];
        const TIER_THRESHOLDS = [0, 30, 80, 150, 250];
        const tier = civ.tech ?? 0;
        if (tier === 0 && (civ.research ?? 0) < 5) {
            // Hide for very young civs that haven't started researching
            el.style.display = "none";
            return;
        }
        let text;
        if (tier >= TIER_NAMES.length - 1) {
            text = `⚡ ${TIER_NAMES[tier]}`;
        } else {
            const next = TIER_THRESHOLDS[tier + 1];
            const cur = TIER_THRESHOLDS[tier];
            const inTier = (civ.research - cur) / (next - cur);
            const pct = Math.max(0, Math.min(100, Math.floor(inTier * 100)));
            const name = tier === 0 ? "Researching" : TIER_NAMES[tier];
            text = `⚡ ${name} → ${TIER_NAMES[tier + 1]} (${pct}%)`;
        }
        el.textContent = text;
        el.style.display = "block";
    }

    // Round 25 — show megaproject build progress (⚒ during build,
    // ✦ on complete). civManager.megaprojects keyed by civ id.
    _populateMegaRow(el, civ) {
        const project = this.civManager.megaprojects?.get(civ.id);
        if (!project) {
            el.style.display = "none";
            el.textContent = "";
            return;
        }
        if (project.completed) {
            el.textContent = `✦ ${project.name}`;
            el.style.color = "#fc6";
        } else {
            const pct = Math.floor(project.progress() * 100);
            el.textContent = `⚒ ${project.name} (${pct}%)`;
            el.style.color = "#9c9";
        }
        el.style.display = "block";
    }

    // Update the war row's text + visibility based on active conflicts.
    // CivilizationManager.getConflictsFor returns ids of opponents.
    _populateWarRow(el, civ) {
        if (typeof this.civManager.getConflictsFor !== "function") {
            el.style.display = "none";
            el.textContent = "";
            return;
        }
        const opponents = this.civManager.getConflictsFor(civ.id);
        if (opponents.length === 0) {
            el.style.display = "none";
            el.textContent = "";
            return;
        }
        const all = this.civManager.getAll();
        const names = opponents
            .map(id => all.find(c => c.id === id)?.name ?? `Civ ${id}`)
            .join(", ");
        el.textContent = `⚔ ${names}`;
        el.style.display = "block";
    }

    _updateValues(civs) {
        const byId = new Map();
        for (const c of civs) byId.set(c.id, c);
        for (const row of this._listEl.children) {
            const civ = byId.get(row._civId);
            if (!civ) continue;
            row._stabEl.textContent = `${(((civ.stability ?? 0) * 100) | 0)}%`;
            row._ageEl.textContent  = `${(civ.age ?? 0) | 0}s`;
            row._posEl.textContent  = `(${civ.center.x | 0}, ${civ.center.z | 0})`;
            // Round 13: refresh war indicator (display toggles internally)
            if (row._warEl) this._populateWarRow(row._warEl, civ);
            // Round 25: refresh megaproject indicator
            if (row._megaEl) this._populateMegaRow(row._megaEl, civ);
            // Round 27: refresh tech tier indicator
            if (row._techEl) this._populateTechRow(row._techEl, civ);
        }
    }

    _snapTo(civ) {
        // Place camera at +X +Y +Z offset from the civ, looking back
        // at it. Standard 3/4 isometric snap. Pitch derived so the
        // camera actually looks at the civ rather than past it.
        const offX = 16, offY = 24, offZ = 16;
        const c = this.camera;
        c.position.x = civ.center.x + offX;
        c.position.y = civ.center.y + offY;
        c.position.z = civ.center.z + offZ;
        // yaw convention in this engine: yaw=0 looks toward -Z,
        // yaw=PI/2 toward +X. atan2(dx, -dz) where (dx, dz) is the
        // forward direction. Here forward = civ - camera = (-offX, _, -offZ).
        c.yaw = Math.atan2(-offX, offZ);
        const horiz = Math.sqrt(offX * offX + offZ * offZ);
        c.pitch = Math.atan2(-offY, horiz);
        console.log(`[civPanel] snapped camera to "${civ.name}" at (${civ.center.x | 0}, ${civ.center.y | 0}, ${civ.center.z | 0})`);
    }
}

// ---- helpers ----------------------------------------------------------

function hslToRgbInt(h, s, l) {
    if (s === 0) {
        const v = (l * 255) | 0;
        return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [
        (hue(p, q, h + 1 / 3) * 255) | 0,
        (hue(p, q, h) * 255) | 0,
        (hue(p, q, h - 1 / 3) * 255) | 0,
    ];
}
function hue(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}
