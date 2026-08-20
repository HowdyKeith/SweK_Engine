// FILE: ui/avatarColor.js
// VERSION: v888 — color-as-indicator system (Demo-Chrome arc R3).
//
// Lets the avatar's color signal STATE. A live "override" washes the avatar
// (and its demo-chrome mini stamp) toward a status color — e.g. red when CPU
// is pegged, amber on a pending job, green when idle. When no override is
// active the avatar rests at its per-favorite default color (stored in the
// favorites store), or no wash at all.
//
// Resolution priority for a given avatar url:
//   1. manual override   (avatarColor.setOverride — top priority)
//   2. provider override (winning registered provider callback)
//   3. per-favorite default color (kpopFavorites.getColor(url))
//   4. none (amt 0 → no wash)
//
// API (window.avatarColor):
//   setOverride(r,g,b, amt=0.55)   // force an indicator wash (0..1 rgb + strength)
//   clearOverride()                // drop the manual override
//   registerProvider(fn, priority=0)  // fn() -> [r,g,b] | {rgb,amt} | null ; returns unsub
//   getEffective(url) -> { rgb:[r,g,b], amt }   // what the renderer should apply
//   onChange(cb)                   // fired when override/providers change
//   setFavoriteDefault(url, rgb)   // sugar → kpopFavorites.setColor
//   getFavoriteDefault(url)        // sugar → kpopFavorites.getColor
//
// Providers are polled ~1 Hz. The highest-priority provider returning a
// non-null color wins the provider override; if all return null the provider
// override clears (manual override + favorite default still apply).

import { getFavorites } from "./kpopFavorites.js";

const RESTING_AMT = 0.32;   // wash strength for a per-favorite default color
const POLL_MS = 1000;

function clamp01(v) { return Math.max(0, Math.min(1, +v || 0)); }
function rgbOf(c) {
    if (!c) return null;
    if (Array.isArray(c)) return [clamp01(c[0]), clamp01(c[1]), clamp01(c[2])];
    if (Array.isArray(c.rgb)) return [clamp01(c.rgb[0]), clamp01(c.rgb[1]), clamp01(c.rgb[2])];
    return null;
}

class AvatarColorManager {
    constructor() {
        this._manual = null;       // { rgb:[r,g,b], amt }
        this._provider = null;     // { rgb:[r,g,b], amt } — winning provider result
        this._providers = [];      // { fn, priority }
        this._listeners = new Set();
        this._favs = null;
        try { this._favs = getFavorites(); } catch { this._favs = null; }
        this._poll = this._poll.bind(this);
        this._timer = null;
        this._startPollingWhenNeeded();
    }

    _notify() { for (const fn of this._listeners) { try { fn(); } catch {} } }

    setOverride(r, g, b, amt = 0.55, ttlMs = 0) {
        this._manual = { rgb: [clamp01(r), clamp01(g), clamp01(b)], amt: clamp01(amt) };
        clearTimeout(this._overrideTimer);
        // v925 — transient indicators auto-revert to the resting color (original
        // unless a favorite hue is set). ttlMs=0 keeps it sticky (manual hold).
        if (ttlMs > 0) this._overrideTimer = setTimeout(() => { try { this.clearOverride(); } catch {} }, ttlMs);
        this._notify();
    }
    clearOverride() { this._manual = null; clearTimeout(this._overrideTimer); this._notify(); }

    // v925 — one-shot indicator wash that fades back to the model's default look.
    flash(r, g, b, ms = 1800, amt = 0.7) { this.setOverride(r, g, b, amt, ms); }
    // Named indicators: alarm/error=red, warn/alert=amber, message/info=blue, ok=green.
    indicate(kind, ms) {
        const K = {
            message: [0.25, 0.55, 1.0], info: [0.25, 0.55, 1.0],
            alarm:   [1.0, 0.15, 0.15], error: [1.0, 0.15, 0.15],
            warn:    [1.0, 0.78, 0.1],  alert: [1.0, 0.78, 0.1],
            ok:      [0.2, 0.9, 0.4],   success: [0.2, 0.9, 0.4],
        };
        const c = K[String(kind || "").toLowerCase()] || K.info;
        this.flash(c[0], c[1], c[2], ms || 1800, 0.7);
    }

    setFavoriteDefault(url, rgb) { try { return this._favs && this._favs.setColor(url, rgb); } catch { return false; } }
    getFavoriteDefault(url) { try { return this._favs && this._favs.getColor(url); } catch { return null; } }

    registerProvider(fn, priority = 0) {
        if (typeof fn !== "function") return () => {};
        const entry = { fn, priority };
        this._providers.push(entry);
        this._providers.sort((a, b) => b.priority - a.priority);
        this._startPollingWhenNeeded();
        return () => {
            this._providers = this._providers.filter(e => e !== entry);
            if (!this._providers.length && this._timer) { clearInterval(this._timer); this._timer = null; }
        };
    }

    _startPollingWhenNeeded() {
        if (this._timer || !this._providers.length || typeof setInterval === "undefined") return;
        this._timer = setInterval(this._poll, POLL_MS);
    }

    _poll() {
        let winner = null;
        for (const p of this._providers) {        // already sorted high→low priority
            let out;
            try { out = p.fn(); } catch { out = null; }
            const rgb = rgbOf(out);
            if (rgb) { winner = { rgb, amt: (out && typeof out.amt === "number") ? clamp01(out.amt) : 0.55 }; break; }
        }
        const changed = JSON.stringify(winner) !== JSON.stringify(this._provider);
        this._provider = winner;
        if (changed) this._notify();
    }

    // What the renderer applies for this avatar this frame.
    getEffective(url) {
        if (this._manual) return this._manual;
        if (this._provider) return this._provider;
        const def = this.getFavoriteDefault(url);
        if (def) return { rgb: def, amt: RESTING_AMT };
        return { rgb: [0, 0, 0], amt: 0 };
    }

    onChange(fn) {
        if (typeof fn !== "function") return () => {};
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }
}

let _singleton = null;
export function getAvatarColor() {
    if (!_singleton) _singleton = new AvatarColorManager();
    return _singleton;
}

const store = getAvatarColor();
if (typeof window !== "undefined") { window.avatarColor = store; }

export default store;
