// FILE: ui/kaijuPanel.js
// VERSION: v1
//
// Docked panel listing live kaiju. Each row shows:
//   * Red marker dot (matches in-world color)
//   * Kaiju name + state (spawning / seeking / engaging / dying)
//   * Target civ name (or "—" if no target)
//   * Energy as a percentage
//   * Current world position
//
// Click → snap camera to the kaiju with a 3/4 isometric framing.
//
// Same two-tier refresh as CivilizationPanel: full DOM rebuild on
// id-set changes, per-row value updates at 4Hz otherwise.

const PANEL_WIDTH_PX = 240;

export class KaijuPanel {
    constructor({ parent, kaijuManager, civManager, camera }) {
        this.kaijuManager = kaijuManager;
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
            border: "1px solid rgba(255, 80, 80, 0.35)",
            zIndex: 9100,
        });

        const header = document.createElement("div");
        header.textContent = "🐉  Kaiju";
        Object.assign(header.style, {
            fontWeight: "bold",
            color: "#f88",
            marginBottom: "6px",
            fontSize: "12px",
        });
        wrap.appendChild(header);

        // Round 43 — summon controls. Pick a kind, click spawn. Kaiju
        // spawn at default position for that kind (descending from
        // sky / rising from ground / etc).
        const summonRow = document.createElement("div");
        Object.assign(summonRow.style, {
            display: "flex", gap: "4px", marginBottom: "6px",
            paddingBottom: "6px", borderBottom: "1px solid rgba(255,80,80,0.25)",
        });

        const kindSel = document.createElement("select");
        Object.assign(kindSel.style, {
            flex: "1",
            background: "#1a0a0a", color: "#fcc",
            border: "1px solid #844",
            fontFamily: "monospace", fontSize: "11px",
            padding: "2px",
        });
        const kinds = ["sky", "hell", "space", "water", "underground", "cave", "tech"];
        for (const k of kinds) {
            const opt = document.createElement("option");
            opt.value = k; opt.textContent = k;
            kindSel.appendChild(opt);
        }

        const spawnBtn = document.createElement("button");
        spawnBtn.textContent = "+ SUMMON";
        Object.assign(spawnBtn.style, {
            background: "#400", color: "#fcc",
            border: "1px solid #844", borderRadius: "2px",
            padding: "2px 8px", fontFamily: "monospace",
            fontSize: "11px", cursor: "pointer",
        });
        spawnBtn.addEventListener("mouseenter", () => spawnBtn.style.background = "#600");
        spawnBtn.addEventListener("mouseleave", () => spawnBtn.style.background = "#400");
        // v2152 -- a summon can legitimately return null (at MAX_KAIJU, or no camera to
        // fall back to). It used to only console.warn, so the button read as broken.
        // Say it on the panel, where the person clicking can actually see it.
        const summonMsg = document.createElement("div");
        Object.assign(summonMsg.style, { fontSize: "10px", marginTop: "3px", minHeight: "12px", color: "#f88" });
        spawnBtn.addEventListener("click", () => {
            let k = null, err = "";
            try { k = this.kaijuManager.summon({ kind: kindSel.value, camera: (window._camera && window._camera.position) || undefined }); }
            catch (e) { err = (e && e.message) || String(e); }
            if (k) {
                console.log(`[kaijuPanel] summoned ${k.name} (${kindSel.value})`);
                summonMsg.style.color = "#8f8";
                summonMsg.textContent = `summoned ${k.name}`;
            } else {
                const why = err || (this.kaijuManager.kaiju?.size >= (this.kaijuManager.MAX_KAIJU ?? Infinity)
                    ? "at the kaiju limit" : "no camera position to spawn at");
                console.warn(`[kaijuPanel] summon failed: ${why}`);
                summonMsg.style.color = "#f88";
                summonMsg.textContent = `summon failed: ${why}`;
            }
            setTimeout(() => { summonMsg.textContent = ""; }, 4000);
            this._lastSig = "";    // force rebuild on next refresh
        });

        summonRow.append(kindSel, spawnBtn);
        wrap.appendChild(summonRow);
        wrap.appendChild(summonMsg);

        this._listEl = document.createElement("div");
        wrap.appendChild(this._listEl);

        this._emptyEl = document.createElement("div");
        this._emptyEl.textContent = "(none active — summon above)";
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
        const kaiju = this.kaijuManager.getAll();
        const ids = kaiju.map(k => k.id).sort((a, b) => a - b).join(",");
        if (ids !== this._lastSig) {
            this._lastSig = ids;
            this._rebuildRows(kaiju);
        } else {
            this._updateValues(kaiju);
        }
    }

    _rebuildRows(kaiju) {
        this._listEl.innerHTML = "";
        this._emptyEl.style.display = kaiju.length === 0 ? "block" : "none";
        for (const k of kaiju) {
            this._listEl.appendChild(this._row(k));
        }
    }

    _row(k) {
        const row = document.createElement("div");
        Object.assign(row.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "3px 4px",
            borderRadius: "2px",
            cursor: "pointer",
            marginBottom: "2px",
            background: "rgba(255, 80, 80, 0.06)",
        });
        row.addEventListener("mouseenter", () => {
            row.style.background = "rgba(255, 100, 100, 0.22)";
        });
        row.addEventListener("mouseleave", () => {
            row.style.background = "rgba(255, 80, 80, 0.06)";
        });
        row.addEventListener("click", () => this._snapTo(k));

        // Red dot
        const dot = document.createElement("div");
        Object.assign(dot.style, {
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "rgb(220, 60, 60)",
            flexShrink: "0",
        });
        row.appendChild(dot);

        // Left: name + state + target
        const left = document.createElement("div");
        left.style.flex = "1";
        const nameRow = document.createElement("div");
        nameRow.style.display = "flex";
        nameRow.style.gap = "4px";
        nameRow.style.alignItems = "baseline";
        const name = document.createElement("span");
        name.textContent = k.name;
        name.style.fontWeight = "bold";
        const state = document.createElement("span");
        state.textContent = k.state;
        Object.assign(state.style, {
            fontSize: "9px",
            opacity: "0.45",
            fontStyle: "italic",
        });
        nameRow.appendChild(name);
        nameRow.appendChild(state);

        const targetRow = document.createElement("div");
        targetRow.textContent = `→ ${this._targetName(k)}`;
        Object.assign(targetRow.style, {
            fontSize: "9px",
            opacity: "0.55",
        });

        // Round 10 — allegiance indicator. Allied kaiju show a star
        // and the patron civ's name. Wild kaiju show nothing.
        const allegRow = document.createElement("div");
        if (k.allegiance != null) {
            const civs = this.civManager?.getAll?.() ?? [];
            const patron = civs.find(c => c.id === k.allegiance);
            allegRow.textContent = `★ ${patron?.name ?? `Civ ${k.allegiance}`}`;
            Object.assign(allegRow.style, {
                fontSize: "9px",
                color: "#fc6",
            });
        }

        left.appendChild(nameRow);
        left.appendChild(targetRow);
        if (k.allegiance != null) left.appendChild(allegRow);
        row.appendChild(left);

        // Right: energy %
        const right = document.createElement("div");
        right.style.textAlign = "right";
        const energy = document.createElement("div");
        energy.textContent = `${(k.energy * 100 | 0)}%`;
        Object.assign(energy.style, { color: "#f88", fontSize: "10px" });
        const age = document.createElement("div");
        age.textContent = `${k.age | 0}s`;
        Object.assign(age.style, { fontSize: "9px", opacity: "0.5" });
        right.appendChild(energy);
        right.appendChild(age);
        row.appendChild(right);

        row._kaijuId = k.id;
        row._stateEl = state;
        row._targetEl = targetRow;
        row._energyEl = energy;
        row._ageEl = age;
        return row;
    }

    _updateValues(kaiju) {
        const byId = new Map();
        for (const k of kaiju) byId.set(k.id, k);
        for (const row of this._listEl.children) {
            const k = byId.get(row._kaijuId);
            if (!k) continue;
            row._stateEl.textContent = k.state;
            row._targetEl.textContent = `→ ${this._targetName(k)}`;
            row._energyEl.textContent = `${(k.energy * 100 | 0)}%`;
            row._ageEl.textContent = `${k.age | 0}s`;
        }
    }

    _targetName(k) {
        if (k.targetCivId == null) return "—";
        const civs = this.civManager?.getAll?.() ?? [];
        const c = civs.find(c => c.id === k.targetCivId);
        return c?.name ?? `Civ ${k.targetCivId}`;
    }

    _snapTo(k) {
        const offX = 16, offY = 24, offZ = 16;
        const c = this.camera;
        c.position.x = k.position.x + offX;
        c.position.y = k.position.y + offY;
        c.position.z = k.position.z + offZ;
        c.yaw = Math.atan2(-offX, offZ);
        const horiz = Math.sqrt(offX * offX + offZ * offZ);
        c.pitch = Math.atan2(-offY, horiz);
        console.log(`[kaijuPanel] snapped camera to ${k.name} (${k.state})`);
    }
}
