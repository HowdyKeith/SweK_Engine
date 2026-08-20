// FILE: gpu/assetOverrides.js
// VERSION: v1
//
// Singleton store for asset binding overrides. Lets the user say
// "use my custom mesh for hell kaiju" via the asset menu, even if
// the file isn't named kaiju_hell.glb.
//
// Map shape: { "kaiju_sky": "fire_dragon", "civ_tower": "spire_v2" }
// Keys are default asset ids the manager would compute; values are
// asset names that exist in assetLoader.cache.
//
// Persistence via localStorage. Listeners pattern lets the asset
// menu update its own UI when overrides change (e.g. via debug
// commands or future remote edits).

const STORAGE_KEY = "voxelengine.assetOverrides.v1";

let _overrides = _load();
const _listeners = new Set();

function _load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === "object") ? parsed : {};
    } catch {
        return {};
    }
}

function _save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(_overrides));
    } catch (e) {
        console.warn("[assetOverrides] save failed:", e.message);
    }
}

// Get the asset name to use for a default id. Returns the override
// if set, otherwise null (caller falls back to its own default name).
export function getOverride(defaultId) {
    return _overrides[defaultId] || null;
}

// Set or clear an override. Pass null/empty to remove. Notifies listeners.
export function setOverride(defaultId, assetName) {
    if (assetName) {
        _overrides[defaultId] = assetName;
    } else {
        delete _overrides[defaultId];
    }
    _save();
    for (const fn of _listeners) {
        try { fn(); } catch (e) { console.warn("[assetOverrides] listener threw:", e.message); }
    }
}

export function getAllOverrides() {
    return { ..._overrides };
}

export function onChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}
