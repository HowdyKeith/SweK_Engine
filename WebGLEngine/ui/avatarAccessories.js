// FILE: ui/avatarAccessories.js
// VERSION: v864 — Per-avatar accessory equipment (Phase 2 costuming)
//
// 3 slots: hat / eyewear / cape. Each slot has variants. "none" is
// the default (slot is empty). Per-avatar persistence in localStorage:
//   voxelEngine.avatarAccessories = {
//     [avatarUrl]: { hat: "tophat", eyewear: null, cape: "cape" },
//     ...
//   }
//
// Variants are defined in face/accessoryGeometry.js's ACCESSORY_CATALOG.
// This module is the storage / picker layer; geometry is generated on
// demand by robotFaceAvatar when it sees a slot change.

const STORAGE_KEY = "voxelEngine.avatarAccessories";

// v866 — Per-accessory color palette. Applied as a vertex-color
// override at VAO build time in robotFaceAvatar. Each color is the
// final RGB the fragment shader sees (after v862 costume tint
// multiplication, but this is the BASE color before tinting).
export const ACCESSORY_COLORS = [
    { key: "default", label: "Default",  emoji: "⚪", rgb: null },   // use variant's hardcoded color
    { key: "black",   label: "Black",    emoji: "⚫", rgb: [0.10, 0.10, 0.12] },
    { key: "white",   label: "White",    emoji: "⚪", rgb: [0.92, 0.92, 0.95] },
    { key: "red",     label: "Red",      emoji: "🔴", rgb: [0.75, 0.18, 0.20] },
    { key: "blue",    label: "Blue",     emoji: "🔵", rgb: [0.20, 0.40, 0.85] },
    { key: "gold",    label: "Gold",     emoji: "🟡", rgb: [0.92, 0.72, 0.20] },
    { key: "emerald", label: "Emerald",  emoji: "🟢", rgb: [0.20, 0.65, 0.35] },
    { key: "violet",  label: "Violet",   emoji: "🟣", rgb: [0.55, 0.25, 0.75] },
    { key: "pink",    label: "Pink",     emoji: "🌸", rgb: [0.90, 0.45, 0.60] },
];

export function getColorByKey(key) {
    return ACCESSORY_COLORS.find(c => c.key === key) || ACCESSORY_COLORS[0];
}

// Mirror the catalog structure here for picker UI lookup. Keep in
// sync with accessoryGeometry.ACCESSORY_CATALOG keys.
export const ACCESSORY_SLOTS = [
    {
        key: "hat",
        label: "Hat",
        emoji: "👒",
        variants: [
            { key: "none",   label: "None",       emoji: "❌" },
            { key: "tophat", label: "Top Hat",    emoji: "🎩" },
            { key: "wizard", label: "Wizard Hat", emoji: "🧙" },
            { key: "crown",  label: "Crown",      emoji: "👑" },
        ],
    },
    {
        key: "eyewear",
        label: "Eyewear",
        emoji: "🕶️",
        variants: [
            { key: "none",       label: "None",        emoji: "❌" },
            { key: "round",      label: "Round Glasses", emoji: "👓" },
            { key: "sunglasses", label: "Sunglasses",  emoji: "🕶️" },
        ],
    },
    {
        key: "cape",
        label: "Cape",
        emoji: "🦸",
        variants: [
            { key: "none",   label: "None",          emoji: "❌" },
            { key: "cape",   label: "Cape",          emoji: "🦸" },
            { key: "carpet", label: "Magic Carpet",  emoji: "🪄" },
        ],
    },
    {
        // v871 — Streamer slot: cloth-sim ribbon/banner trailing
        // from the avatar's right side. Separate from cape so you
        // can wear both at once.
        key: "streamer",
        label: "Streamer",
        emoji: "🎀",
        variants: [
            { key: "none",   label: "None",   emoji: "❌" },
            { key: "ribbon", label: "Ribbon", emoji: "🎀" },
            { key: "banner", label: "Banner", emoji: "🏳️" },
        ],
    },
];

export function getSlotByKey(slotKey) {
    return ACCESSORY_SLOTS.find(s => s.key === slotKey);
}

export function getVariantByKey(slotKey, variantKey) {
    const slot = getSlotByKey(slotKey);
    if (!slot) return null;
    return slot.variants.find(v => v.key === variantKey) || slot.variants[0];
}

class AvatarAccessoryStore {
    constructor() {
        this._data = {};        // { [avatarUrl]: { hat, eyewear, cape } }
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

    // Get full equipment for an avatar. Returns { hat, eyewear, cape }
    // with "none" for unset slots.
    get(avatarUrl) {
        const stored = this._data[String(avatarUrl)] || {};
        return {
            hat:      stored.hat      || "none",
            eyewear:  stored.eyewear  || "none",
            cape:     stored.cape     || "none",
            streamer: stored.streamer || "none",   // v871
        };
    }

    // Get value of a single slot
    getSlot(avatarUrl, slotKey) {
        return this.get(avatarUrl)[slotKey] || "none";
    }

    // Set a single slot. "none" clears it (saves space).
    setSlot(avatarUrl, slotKey, variantKey) {
        avatarUrl = String(avatarUrl);
        if (!getSlotByKey(slotKey)) return false;
        if (!this._data[avatarUrl]) this._data[avatarUrl] = {};
        const prev = this._data[avatarUrl][slotKey] || "none";
        if (variantKey === "none") {
            delete this._data[avatarUrl][slotKey];
            if (Object.keys(this._data[avatarUrl]).length === 0) {
                delete this._data[avatarUrl];
            }
        } else {
            this._data[avatarUrl][slotKey] = variantKey;
        }
        this._save();
        this._notify({ kind: "setSlot", avatarUrl, slotKey, variantKey, prev });
        return true;
    }

    // Cycle to next variant in a slot. Returns the new variant object.
    cycleSlot(avatarUrl, slotKey) {
        const slot = getSlotByKey(slotKey);
        if (!slot) return null;
        const cur = this.getSlot(avatarUrl, slotKey);
        const i = slot.variants.findIndex(v => v.key === cur);
        const next = slot.variants[(i + 1) % slot.variants.length];
        this.setSlot(avatarUrl, slotKey, next.key);
        return next;
    }

    // ─── v866: per-slot color override ────────────────────────────
    // Color storage shares the same per-avatar object but uses keys
    // like "hatColor", "eyewearColor", "capeColor". Returns "default"
    // when unset (use variant's hardcoded color).
    getColor(avatarUrl, slotKey) {
        const stored = this._data[String(avatarUrl)] || {};
        return stored[slotKey + "Color"] || "default";
    }
    setColor(avatarUrl, slotKey, colorKey) {
        avatarUrl = String(avatarUrl);
        if (!getSlotByKey(slotKey)) return false;
        if (!this._data[avatarUrl]) this._data[avatarUrl] = {};
        const prev = this._data[avatarUrl][slotKey + "Color"] || "default";
        if (colorKey === "default") {
            delete this._data[avatarUrl][slotKey + "Color"];
            if (Object.keys(this._data[avatarUrl]).length === 0) {
                delete this._data[avatarUrl];
            }
        } else {
            this._data[avatarUrl][slotKey + "Color"] = colorKey;
        }
        this._save();
        this._notify({ kind: "setColor", avatarUrl, slotKey, colorKey, prev });
        return true;
    }
    cycleColor(avatarUrl, slotKey) {
        const cur = this.getColor(avatarUrl, slotKey);
        const i = ACCESSORY_COLORS.findIndex(c => c.key === cur);
        const next = ACCESSORY_COLORS[(i + 1) % ACCESSORY_COLORS.length];
        this.setColor(avatarUrl, slotKey, next.key);
        return next;
    }

    // Clear all accessories for an avatar
    clear(avatarUrl) {
        avatarUrl = String(avatarUrl);
        if (this._data[avatarUrl]) {
            delete this._data[avatarUrl];
            this._save();
            this._notify({ kind: "clear", avatarUrl });
            return true;
        }
        return false;
    }

    onChange(fn) {
        if (typeof fn !== "function") return () => {};
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }
}

let _singleton = null;
export function getAccessories() {
    if (!_singleton) _singleton = new AvatarAccessoryStore();
    return _singleton;
}

if (typeof window !== "undefined") {
    try {
        window.avatarAccessories = getAccessories();
        window.ACCESSORY_SLOTS   = ACCESSORY_SLOTS;
        window.ACCESSORY_COLORS  = ACCESSORY_COLORS;
    } catch {}
}
