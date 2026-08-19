// FILE: rig/entityHud.js
// VERSION: v2 (v834 — adds persistence across sessions)
//
// Per-entity health bars + name tags. Each entity gets a small DOM block
// containing a styled bar + optional name label, anchored either to a
// rig bone (follows animation) or to the entity's world position.
//
// v834 — state persists to localStorage under "engine:entityHud:v1" so
// HUDs survive page reload. Attach/update/detach all trigger save.
// Restore happens on installEntityHudGlobal() automatically.
//
// API (window.entityHud after install):
//   .attach(entityId, opts) — opts: { pos?:[x,y,z], boneRef?:{layerId,idx},
//                                     name?, hpMax?, hp?, color? }
//   .update(entityId, opts) — patches HP / name / color
//   .detach(entityId)
//   .clear()
//   .list() — returns array of attached entityIds
//   .save() / .restore() / .clearStorage()
//
// The HUD uses WorldLabels for anchoring; each entity gets its own
// HTML container that WorldLabels positions per frame.

export class EntityHud {
    constructor() {
        this.entries = new Map();   // entityId → { labelId, hp, hpMax, name, color, _attachOpts }
        // v834 — debounce save calls so rapid HP updates don't hammer localStorage
        this._saveTimer = null;
    }

    attach(entityId, opts = {}) {
        if (!window.worldLabels) {
            return { error: "worldLabels not available — install RigSystem + worldLabels first" };
        }
        if (this.entries.has(entityId)) return this.update(entityId, opts);

        const hpMax = opts.hpMax || 100;
        const hp    = opts.hp != null ? opts.hp : hpMax;
        const name  = opts.name || entityId;
        const color = opts.color || "#7c9";

        const labelId = "_entityHud:" + entityId;
        const html = this._buildHtml(name, hp, hpMax, color);
        window.worldLabels.add(labelId, {
            html,
            pos: opts.pos,
            boneRef: opts.boneRef,
            offset: opts.offset || [0, -56],
            bg: "transparent",
            border: "0",
            padding: "0",
        });
        // v834 — save the attach opts so we can recreate after page reload
        this.entries.set(entityId, {
            labelId, hp, hpMax, name, color,
            _attachOpts: {
                pos: opts.pos, boneRef: opts.boneRef,
                offset: opts.offset,
            },
        });
        this._scheduleSave();
        return { ok: true };
    }

    update(entityId, opts = {}) {
        const e = this.entries.get(entityId);
        if (!e) return { error: `no HUD attached for ${entityId}` };
        if (opts.hp    != null) e.hp = opts.hp;
        if (opts.hpMax != null) e.hpMax = opts.hpMax;
        if (opts.name  != null) e.name = opts.name;
        if (opts.color != null) e.color = opts.color;
        const html = this._buildHtml(e.name, e.hp, e.hpMax, e.color);
        const labelOpts = { html };
        if (opts.pos)     { labelOpts.pos = opts.pos; e._attachOpts.pos = opts.pos; }
        if (opts.boneRef) { labelOpts.boneRef = opts.boneRef; e._attachOpts.boneRef = opts.boneRef; }
        window.worldLabels?.update(e.labelId, labelOpts);
        this._scheduleSave();
        return { ok: true };
    }

    detach(entityId) {
        const e = this.entries.get(entityId);
        if (!e) return { error: `no HUD for ${entityId}` };
        window.worldLabels?.remove(e.labelId);
        this.entries.delete(entityId);
        this._scheduleSave();
        return { ok: true };
    }

    clear() {
        for (const id of [...this.entries.keys()]) this.detach(id);
    }

    list() {
        return [...this.entries.keys()];
    }

    // v834 — persistence
    save() {
        try {
            const data = [];
            for (const [id, e] of this.entries.entries()) {
                data.push({
                    id, hp: e.hp, hpMax: e.hpMax, name: e.name, color: e.color,
                    pos: e._attachOpts.pos, boneRef: e._attachOpts.boneRef, offset: e._attachOpts.offset,
                });
            }
            localStorage.setItem("engine:entityHud:v1", JSON.stringify(data));
            return { ok: true, count: data.length };
        } catch (e) { return { error: e?.message }; }
    }
    restore() {
        try {
            const raw = localStorage.getItem("engine:entityHud:v1");
            if (!raw) return { ok: true, restored: 0 };
            const data = JSON.parse(raw);
            let restored = 0;
            for (const item of data) {
                // Skip if worldLabels is gone (the system reset mid-restore)
                if (!window.worldLabels) break;
                this.attach(item.id, {
                    hp: item.hp, hpMax: item.hpMax, name: item.name, color: item.color,
                    pos: item.pos, boneRef: item.boneRef, offset: item.offset,
                });
                restored++;
            }
            return { ok: true, restored };
        } catch (e) { return { error: e?.message }; }
    }
    clearStorage() {
        try { localStorage.removeItem("engine:entityHud:v1"); return { ok: true }; }
        catch (e) { return { error: e?.message }; }
    }

    _scheduleSave() {
        // Debounce — coalesce rapid updates into one save 250ms later
        if (this._saveTimer) return;
        this._saveTimer = setTimeout(() => {
            this._saveTimer = null;
            this.save();
        }, 250);
    }

    _buildHtml(name, hp, hpMax, color) {
        const pct = Math.max(0, Math.min(1, hp / (hpMax || 1)));
        // Dynamic color: green → yellow → red based on HP percentage
        const fill =
            pct > 0.5 ? color :
            pct > 0.25 ? "#dc7" :
                         "#d56";
        const widthPct = (pct * 100).toFixed(0);
        // Wrap escape on name (defensive — name might contain HTML chars)
        const escapedName = String(name).replace(/[<>&"]/g, c => (
            { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]
        ));
        return `
            <div style="display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none">
                <div style="color:#cfe;font-size:10px;font-family:monospace;text-shadow:0 0 2px #000,0 0 4px #000;white-space:nowrap">${escapedName}</div>
                <div style="width:60px;height:6px;background:rgba(0,0,0,0.7);border-radius:2px;border:1px solid rgba(140,200,255,0.3);overflow:hidden">
                    <div style="width:${widthPct}%;height:100%;background:${fill};transition:width 0.15s ease-out"></div>
                </div>
                <div style="color:#9ab;font-size:9px;font-family:monospace;text-shadow:0 0 2px #000">${Math.max(0, hp|0)} / ${hpMax|0}</div>
            </div>
        `;
    }
}

export function installEntityHudGlobal() {
    if (!window.entityHud) {
        window.entityHud = new EntityHud();
        // v834 — auto-restore from localStorage if data exists.
        // Deferred to next tick so worldLabels is ready first.
        if (typeof setTimeout !== "undefined") {
            setTimeout(() => {
                try { window.entityHud.restore(); } catch (e) {}
            }, 0);
        }
    }
    return window.entityHud;
}
