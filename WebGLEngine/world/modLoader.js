// FILE: world/modLoader.js
// VERSION: v1
//
// Round 26 — runtime mod loading. Drop a .json file into the engine's
// mods/ folder; on boot the ModLoader fetches the list, loads each,
// and applies it to the appropriate registry based on its `type`
// field. No restart needed beyond a page reload.
//
// Supported mod types:
//
//   {
//     "type": "kaiju_kind",
//     "name": "frost",
//     "config": { ... fields from world/kaijuKinds.js ... }
//   }
//
//   {
//     "type": "megastructure",
//     "civStyle": "tower",                // existing style to override
//     "name": "Crystal Spire",
//     "voxels": [{"dx":0,"dy":0,"dz":0,"mat":1}, ...]
//   }
//
//   {
//     "type": "asset_override",
//     "default": "kaiju_hell",
//     "asset":   "fire_dragon"             // pre-set the override map
//   }
//
//   {
//     "type": "tree_kind",
//     "name": "tree_birch",                // new tree spawnable type
//     "color": [0.8, 0.85, 0.7],           // fallback cube color
//     "surface": "grass"                    // grass | sand
//   }
//
// All fields default to sane values when omitted. Bad mods log a
// warning and are skipped — engine still boots.

import { registerKaijuKind } from "./kaijuKinds.js";
import { registerMegastructure } from "../simulation/megastructurePatterns.js";
import { setOverride } from "../gpu/assetOverrides.js";
import { registerAttack, bindKindAttack } from "./kaijuAttacks.js";

export class ModLoader {
    constructor(opts = {}) {
        this.basePath = opts.basePath ?? "/mods/";
        this.entityVisuals = opts.entityVisuals ?? null;   // for tree_kind color injection
        this.loaded = [];   // { fileName, type, name, ok, error }
        this._listeners = new Set();
    }

    // Load every mod from the server's /mods/ folder. Returns when
    // all are loaded (sequential — count is small).
    async loadAll() {
        let modList;
        try {
            const res = await fetch("/mods/list");
            if (!res.ok) {
                console.warn(`[ModLoader] /mods/list returned ${res.status}`);
                return;
            }
            const data = await res.json();
            if (!data.ok) {
                console.warn("[ModLoader] /mods/list returned error:", data.error);
                return;
            }
            modList = data.mods ?? [];
        } catch (e) {
            console.warn("[ModLoader] could not fetch mod list:", e.message);
            return;
        }

        if (modList.length === 0) {
            console.log("[ModLoader] no mods found in mods/");
            return;
        }

        for (const fileName of modList) {
            await this._loadOne(fileName);
        }
        console.log(`[ModLoader] loaded ${this.loaded.filter(m => m.ok).length}/${modList.length} mods`);
        this._notify();
    }

    async _loadOne(fileName) {
        let modData;
        try {
            const res = await fetch(`/mods/load?name=${encodeURIComponent(fileName)}`);
            if (!res.ok) {
                this.loaded.push({ fileName, type: "?", name: "?", ok: false, error: `HTTP ${res.status}` });
                return;
            }
            const data = await res.json();
            if (!data.ok) {
                this.loaded.push({ fileName, type: "?", name: "?", ok: false, error: data.error });
                return;
            }
            modData = data.mod;
        } catch (e) {
            this.loaded.push({ fileName, type: "?", name: "?", ok: false, error: e.message });
            return;
        }

        const result = this._applyMod(modData, fileName);
        this.loaded.push(result);
    }

    _applyMod(mod, fileName) {
        if (!mod || !mod.type) {
            return { fileName, type: "?", name: "?", ok: false, error: "missing type field" };
        }

        try {
            switch (mod.type) {
                case "kaiju_kind": {
                    const ok = registerKaijuKind(mod.name, mod.config ?? {});
                    return { fileName, type: mod.type, name: mod.name ?? "?", ok };
                }
                case "megastructure": {
                    const ok = registerMegastructure(mod.civStyle, {
                        type: mod.megaType ?? mod.civStyle,
                        name: mod.name,
                        voxels: mod.voxels,
                    });
                    return { fileName, type: mod.type, name: mod.name ?? "?", ok };
                }
                case "asset_override": {
                    if (!mod.default || !mod.asset) {
                        return { fileName, type: mod.type, name: "?", ok: false, error: "need default + asset" };
                    }
                    setOverride(mod.default, mod.asset);
                    return { fileName, type: mod.type, name: `${mod.default} → ${mod.asset}`, ok: true };
                }
                case "tree_kind": {
                    if (!mod.name || !mod.color) {
                        return { fileName, type: mod.type, name: mod.name ?? "?", ok: false, error: "need name + color" };
                    }
                    if (this.entityVisuals?.registerTreeColor) {
                        this.entityVisuals.registerTreeColor(mod.name, mod.color);
                    }
                    return { fileName, type: mod.type, name: mod.name, ok: true };
                }
                case "kaiju_attack": {
                    // Two flavors: (a) register a new attack spec, (b)
                    // bind an existing attack name to a kaiju kind.
                    // (a) provides {name, spec}; (b) provides {kind, attackName}.
                    if (mod.name && mod.spec) {
                        registerAttack(mod.name, mod.spec);
                    }
                    if (mod.kind && mod.attackName) {
                        bindKindAttack(mod.kind, mod.attackName);
                    }
                    if (!mod.name && !mod.kind) {
                        return { fileName, type: mod.type, name: "?", ok: false, error: "need {name+spec} or {kind+attackName}" };
                    }
                    return { fileName, type: mod.type, name: mod.name ?? `${mod.kind}→${mod.attackName}`, ok: true };
                }
                default:
                    return { fileName, type: mod.type, name: mod.name ?? "?", ok: false, error: `unknown type "${mod.type}"` };
            }
        } catch (e) {
            return { fileName, type: mod.type, name: mod.name ?? "?", ok: false, error: e.message };
        }
    }

    snapshot() {
        return this.loaded.slice();
    }

    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _notify() {
        for (const fn of this._listeners) {
            try { fn(); } catch (e) { /* swallow */ }
        }
    }
}
