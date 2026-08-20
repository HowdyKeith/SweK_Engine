// ============================================================================
// ai/MaterialSetRegistry.js
//
// Round 174 — central registry of parallax-ready material sets, keyed by
// the engine's entity-kind names ("kaiju_water", "civ_tower",
// "kaiju_hell", etc.). The bench texture step (or any future generator)
// produces a material set and registers it here; renderers and the
// upcoming live parallax preview read from here when deciding whether
// to use the parallax shader path for a given entity.
//
// Persistence — material sets are heavy (3 × 512px PNGs ~= 1-2MB each).
// localStorage caps at 5-10MB depending on browser, so we store only
// dataURLs and limit the count via an LRU cap. IndexedDB would be the
// "right" answer for serious persistence but adds complexity we don't
// need yet; localStorage works fine for portfolio-demo scale.
//
// API:
//   register(kind, matSet)    — attach a material set to a kind
//   get(kind)                  — retrieve, or null
//   has(kind)                  — boolean
//   list()                     — array of {kind, registeredAt, width, height}
//   remove(kind)               — drop a registration
//   clear()                    — drop everything
//   addListener(fn)            — notify on changes (for live preview)
//   removeListener(fn)
//
// Note: this module exports a singleton instance, not the class. Demos
// and renderers should import that singleton so everyone sees the same
// registry. Tests can construct their own with `new MaterialSetRegistry()`.
// ============================================================================

const LS_KEY        = "voxelengine.materialSets";
const MAX_ENTRIES   = 16;       // LRU cap; older entries dropped on overflow

class MaterialSetRegistry {
    constructor() {
        // Map(kind → { albedo:{dataUrl}, height:{dataUrl}, normal:{dataUrl},
        //              width, height_px, registeredAt })
        this._sets = new Map();
        this._listeners = new Set();
        this._restore();
    }

    register(kind, matSet) {
        if (!kind || typeof kind !== "string") {
            console.warn("[MaterialSetRegistry] register: kind must be a non-empty string");
            return false;
        }
        if (!matSet || !matSet.albedo?.dataUrl) {
            console.warn(`[MaterialSetRegistry] register(${kind}): matSet missing albedo.dataUrl`);
            return false;
        }
        // Serialize to a minimal form — we don't store canvas refs across
        // sessions, only the dataURLs. Re-derivation from albedo is fast.
        const entry = {
            albedo:       { dataUrl: matSet.albedo.dataUrl },
            height:       { dataUrl: matSet.height?.dataUrl ?? null },
            normal:       { dataUrl: matSet.normal?.dataUrl ?? null },
            width:        matSet.width      ?? null,
            height_px:    matSet.height_px  ?? null,
            registeredAt: new Date().toISOString(),
        };
        // Re-insert at end so iteration order = recency (used by LRU)
        if (this._sets.has(kind)) this._sets.delete(kind);
        this._sets.set(kind, entry);
        // LRU eviction
        while (this._sets.size > MAX_ENTRIES) {
            const oldest = this._sets.keys().next().value;
            this._sets.delete(oldest);
        }
        this._persist();
        this._notify({ type: "register", kind });
        return true;
    }

    get(kind)  { return this._sets.get(kind) ?? null; }
    has(kind)  { return this._sets.has(kind); }

    list() {
        const out = [];
        for (const [kind, e] of this._sets) {
            out.push({
                kind,
                registeredAt: e.registeredAt,
                width:        e.width,
                height:       e.height_px,
                hasHeight:    !!e.height?.dataUrl,
                hasNormal:    !!e.normal?.dataUrl,
            });
        }
        return out;
    }

    remove(kind) {
        const had = this._sets.delete(kind);
        if (had) {
            this._persist();
            this._notify({ type: "remove", kind });
        }
        return had;
    }

    clear() {
        this._sets.clear();
        try { localStorage.removeItem(LS_KEY); } catch {}
        this._notify({ type: "clear" });
    }

    addListener(fn)    { this._listeners.add(fn); }
    removeListener(fn) { this._listeners.delete(fn); }

    _notify(event) {
        for (const fn of this._listeners) {
            try { fn(event); } catch (e) {
                console.warn("[MaterialSetRegistry] listener error:", e);
            }
        }
    }

    _persist() {
        // Attempt localStorage write. If it fails (quota exceeded), drop
        // the oldest entry and retry. Loop bounded by entry count to
        // avoid pathological loops.
        let attempt = 0;
        while (attempt < MAX_ENTRIES + 1) {
            try {
                const payload = {};
                for (const [k, v] of this._sets) payload[k] = v;
                localStorage.setItem(LS_KEY, JSON.stringify(payload));
                return true;
            } catch (e) {
                // Quota exceeded — drop oldest and retry
                const oldest = this._sets.keys().next().value;
                if (!oldest) {
                    console.warn("[MaterialSetRegistry] persist failed and no entries to drop:", e.message);
                    return false;
                }
                this._sets.delete(oldest);
                console.warn(`[MaterialSetRegistry] localStorage full — dropped "${oldest}" and retrying`);
                attempt++;
            }
        }
        return false;
    }

    _restore() {
        try {
            const s = localStorage.getItem(LS_KEY);
            if (!s) return;
            const j = JSON.parse(s);
            for (const k of Object.keys(j)) this._sets.set(k, j[k]);
        } catch (e) {
            console.warn("[MaterialSetRegistry] restore failed:", e.message);
        }
    }
}

// Singleton — everyone shares this instance
export const materialSets = new MaterialSetRegistry();
// Also expose the class for testing
export { MaterialSetRegistry };
