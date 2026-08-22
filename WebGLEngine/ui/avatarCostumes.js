// FILE: ui/avatarCostumes.js
// VERSION: v862 — Avatar costume system (Phase 1: color tint palettes)
//
// Lets the user pick a visual costume (color palette tint) for each
// rigged glb avatar. Phase 1 is purely color — multiplies the final
// fragment color by a costume-specific RGB tint. The native model
// materials/textures remain; the tint shifts them toward the chosen
// palette. Default ("native") preserves the model's original look.
//
// Phase 2 (future) could add accessory meshes (hats, capes, glasses)
// attached to skeleton bones. Phase 1 ships the tint system + per-
// avatar persistence so the architecture is in place.
//
// Per-avatar persistence: localStorage as voxelEngine.avatarCostumes =
//   { [avatarUrl]: costumeKey, ... }
// So RobotExpressive can be blue while RobotWoman stays gold, etc.
//
// Costume shape: { key, label, tint: [r,g,b], emoji }
//   tint: multiplicative color overlay (1,1,1 = unchanged). Values
//   below 1 darken / desaturate; above 1 boost. Most costumes use
//   values in [0.5, 1.4] to keep things readable.
//   emoji: small glyph for UI picker (1-char icon).

const STORAGE_KEY = "voxelEngine.avatarCostumes";

export const COSTUMES = [
    { key: "native",   label: "Native (no tint)", tint: [1.00, 1.00, 1.00], emoji: "⚪" },
    { key: "blue",     label: "Cool Blue",        tint: [0.70, 0.90, 1.25], emoji: "🔵" },
    { key: "red",      label: "Warm Red",         tint: [1.30, 0.75, 0.65], emoji: "🔴" },
    { key: "gold",     label: "Gold",             tint: [1.25, 1.10, 0.55], emoji: "🟡" },
    { key: "emerald",  label: "Emerald",          tint: [0.65, 1.20, 0.75], emoji: "🟢" },
    { key: "violet",   label: "Violet",           tint: [1.10, 0.75, 1.25], emoji: "🟣" },
    { key: "pastel",   label: "Pastel",           tint: [1.05, 1.05, 1.15], emoji: "🌸" },
    { key: "dark",     label: "Dark Mode",        tint: [0.45, 0.50, 0.60], emoji: "⚫" },
    { key: "neon",     label: "Neon",             tint: [0.80, 1.40, 0.55], emoji: "🟩" },
    { key: "sunset",   label: "Sunset",           tint: [1.35, 0.95, 0.65], emoji: "🌅" },
];

export function getCostumeByKey(key) {
    return COSTUMES.find(c => c.key === key) || COSTUMES[0];
}

class AvatarCostumeStore {
    constructor() {
        this._data = {};        // { [avatarUrl]: costumeKey }
        this._listeners = new Set();
        this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") this._data = parsed;
            }
        } catch {}
    }
    _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data)); } catch {}
    }
    _notify(change) {
        for (const fn of this._listeners) { try { fn(change); } catch {} }
    }

    // Get costume key for an avatar URL/asset name. Returns "native" if unset.
    getKey(avatarUrl) {
        return this._data[String(avatarUrl)] || "native";
    }

    // Get full costume object for avatar
    get(avatarUrl) {
        return getCostumeByKey(this.getKey(avatarUrl));
    }

    // Set costume for an avatar; "native" can be passed to clear
    set(avatarUrl, costumeKey) {
        avatarUrl = String(avatarUrl);
        const prev = this._data[avatarUrl];
        if (costumeKey === "native") {
            delete this._data[avatarUrl];
        } else {
            this._data[avatarUrl] = costumeKey;
        }
        this._save();
        this._notify({ kind: "set", avatarUrl, costumeKey, prev });
        return getCostumeByKey(costumeKey);
    }

    // Cycle to next costume in the list. Returns the new costume.
    cycle(avatarUrl) {
        const cur = this.getKey(avatarUrl);
        const i = COSTUMES.findIndex(c => c.key === cur);
        const next = COSTUMES[(i + 1) % COSTUMES.length];
        return this.set(avatarUrl, next.key);
    }

    list() { return COSTUMES.slice(); }

    onChange(fn) {
        if (typeof fn !== "function") return () => {};
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }
}

let _singleton = null;
export function getCostumes() {
    if (!_singleton) _singleton = new AvatarCostumeStore();
    return _singleton;
}

// Auto-install on window for non-module consumers
if (typeof window !== "undefined") {
    try {
        window.avatarCostumes = getCostumes();
        window.AVATAR_COSTUMES = COSTUMES;
    } catch {}
}
