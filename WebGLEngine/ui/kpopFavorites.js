// FILE: ui/kpopFavorites.js
// VERSION: v857 — KPop avatar favorites store
//
// A small persistent favorites list for rigged glb avatars. Lets the
// user mark specific glb files (locally generated, Kaggle-generated,
// externally downloaded) as favorites, and the phone+PC avatar cycle
// pick them up alongside the built-in roster + the contents of
// /GPU_Assets/Your_Avatars/.
//
// LocalStorage shape: array of { url, label, addedAt }
//   url   — the actual glb URL or asset name (e.g. "RobotExpressive",
//           "/GPU_Assets/Your_Avatars/foo.glb", or a custom URL)
//   label — human-readable name for the cycle tooltip
//   addedAt — ISO timestamp (for sorting / display)
//
// API (window.kpopFavorites):
//   add(url, label?)      → adds; idempotent on URL
//   remove(url)           → removes; returns true if was present
//   has(url)              → true if URL is in list
//   list()                → array of {url, label, addedAt}
//   clear()               → wipes all
//   toggle(url, label?)   → adds if absent, removes if present
//   onChange(fn)          → subscribe; returns unsub. Fired on add/remove/clear.
//
// Persistence is best-effort — private browsing modes throw on
// localStorage; calls become in-memory only.

const STORAGE_KEY = "voxelEngine.kpopFavorites";

class KPopFavoritesStore {
    constructor() {
        this._items = [];
        this._listeners = new Set();
        this._load();
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    this._items = parsed.filter(x =>
                        x && typeof x.url === "string" && x.url.length > 0);
                }
            }
        } catch {}
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._items));
        } catch {}
    }

    _notify(change) {
        for (const fn of this._listeners) {
            try { fn(change); } catch {}
        }
    }

    add(url, label) {
        url = String(url || "").trim();
        if (!url) return false;
        if (this.has(url)) return false;
        this._items.push({
            url,
            label: String(label || this._deriveLabel(url)),
            addedAt: new Date().toISOString(),
        });
        this._save();
        this._notify({ kind: "add", url });
        return true;
    }

    remove(url) {
        url = String(url || "").trim();
        const before = this._items.length;
        this._items = this._items.filter(x => x.url !== url);
        if (this._items.length === before) return false;
        this._save();
        this._notify({ kind: "remove", url });
        return true;
    }

    has(url) {
        url = String(url || "").trim();
        return this._items.some(x => x.url === url);
    }

    toggle(url, label) {
        if (this.has(url)) {
            this.remove(url);
            return false;
        }
        this.add(url, label);
        return true;
    }

    list() {
        return this._items.slice();
    }

    clear() {
        this._items = [];
        this._save();
        this._notify({ kind: "clear" });
    }

    onChange(fn) {
        if (typeof fn !== "function") return () => {};
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    // v888 — per-favorite default indicator color (color-as-indicator system).
    // Stored on the favorite record as `color: [r,g,b]` (0..1). This is the
    // avatar's resting color wash when no live override is active. Returns
    // null if the url isn't favorited or has no color set.
    getColor(url) {
        url = String(url || "").trim();
        const f = this._items.find(x => x.url === url);
        return (f && Array.isArray(f.color) && f.color.length === 3) ? f.color.slice() : null;
    }
    // Setting a color implies the avatar is worth keeping, so it auto-adds the
    // favorite if missing. Pass null/undefined to clear the color.
    setColor(url, rgb) {
        url = String(url || "").trim();
        if (!url) return false;
        let f = this._items.find(x => x.url === url);
        if (!f) { this.add(url); f = this._items.find(x => x.url === url); }
        if (!f) return false;
        if (rgb && Array.isArray(rgb) && rgb.length === 3) {
            f.color = [
                Math.max(0, Math.min(1, +rgb[0] || 0)),
                Math.max(0, Math.min(1, +rgb[1] || 0)),
                Math.max(0, Math.min(1, +rgb[2] || 0)),
            ];
        } else {
            delete f.color;
        }
        this._save();
        this._notify({ kind: "color", url });
        return true;
    }

    // Best-effort label derivation. Strips .glb/.gltf extension and
    // path prefix; e.g. "/GPU_Assets/Your_Avatars/fox-knight.glb" →
    // "fox-knight". For asset names without slashes, returns as-is.
    _deriveLabel(url) {
        if (!url) return "Avatar";
        const last = url.split("/").filter(Boolean).pop() || url;
        return last.replace(/\.(glb|gltf)$/i, "");
    }
}

// Singleton — same store across all consumers in this window.
let _singleton = null;
export function getFavorites() {
    if (!_singleton) _singleton = new KPopFavoritesStore();
    return _singleton;
}

// Auto-install on window so non-module consumers (RobotExpressive.html
// inline script, phone.html cycle) can use it without importing.
if (typeof window !== "undefined") {
    try { window.kpopFavorites = getFavorites(); } catch {}
}
