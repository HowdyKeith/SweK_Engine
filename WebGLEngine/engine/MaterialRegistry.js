// =============================================================
// FILE: /engine/MaterialRegistry.js
// ROUND: 398
// =============================================================
//
// Central registry for voxel materials. Until this round, the
// renderer's PALETTE table was a hard-coded 12-entry array indexed
// by VOXEL.STONE..VOXEL.MEMORY. That worked fine when "all voxels
// are one of 12 types" but broke down for:
//
//   • PLAYPAL palette swap (v394) — 256 PLAYPAL colors at ids 100..355
//   • Sector-light tints (v395) — same source color in many dim
//     variants, each a distinct material id
//   • Animated textures (v396) — material color needs to change at
//     ~5Hz as a cycle advances
//   • Pixel-perfect wall textures (v400) — per-voxel UV coords +
//     atlas reference
//
// The registry is the single source of truth. Renderer reads from
// it, animator writes to it, palette-swap code bulk-registers from
// it. Idempotent — re-registering an id overwrites the old entry.
//
// USAGE:
//
//   import { getMaterialRegistry } from "./engine/MaterialRegistry.js";
//   const reg = getMaterialRegistry();
//
//   reg.register({ id: 100, r: 0.2, g: 0.4, b: 0.85, name: "WAD_WATER" });
//   reg.update(100, 0.1, 0.3, 0.7);          // change color (e.g. animator tick)
//   const c = reg.getColor(100);              // → [0.1, 0.3, 0.7] or null
//
//   reg.bulkRegister(arrayOfMatRecords);       // many at once
//
// Subscribe to changes (for renderers that cache palette entries):
//
//   const unsub = reg.onChange((id, color) => {
//     // rebuild GPU palette UBO for this id
//   });

// All colors stored as [r, g, b] in 0..1 floats — matches the
// engine's existing PALETTE convention.

let _singleton = null;

export class MaterialRegistry {
    constructor() {
        this._colors  = new Map();   // id → [r, g, b]
        this._names   = new Map();   // id → name (debug/logging only)
        this._meta    = new Map();   // id → arbitrary metadata
        this._listeners = new Set();   // (id, color) → void

        // Seed with the engine's canonical voxel ids so the registry
        // is a strict superset of the legacy PALETTE.
        this._seedDefaults();
    }

    _seedDefaults() {
        // Mirror /render/voxelrenderer.js PALETTE constants
        const defaults = [
            [1,  [0.65, 0.65, 0.70], "STONE"],
            [2,  [0.60, 0.50, 0.30], "DIRT"],
            [3,  [0.30, 0.80, 0.30], "GRASS"],
            [4,  [0.92, 0.85, 0.55], "SAND"],
            [5,  [0.95, 0.97, 1.00], "SNOW"],
            [6,  [0.22, 0.18, 0.16], "ASH"],
            [7,  [0.38, 0.32, 0.28], "RUBBLE"],
            [10, [0.20, 0.45, 0.85], "WATER"],
            [11, [0.25, 0.55, 0.95], "FLOWING_WATER"],
            [12, [0.95, 0.40, 0.10], "LAVA"],
            [20, [0.10, 0.10, 0.15], "SCREEN"],
            [30, [0.20, 0.95, 0.95], "MEMORY"],
        ];
        for (const [id, rgb, name] of defaults) {
            this._colors.set(id, rgb);
            this._names.set(id, name);
        }
    }

    // ---- writes ----

    /**
     * Register or replace a material. Accepts either a record
     * `{ id, r, g, b, name?, meta? }` or positional args.
     *
     * r/g/b can be either 0..1 floats OR 0..255 integers; values
     * > 1 are normalized by /255. This matches the convention WAD
     * palette decoders use (Uint8 RGB) vs the engine's float palette.
     */
    register(arg, g, b, name) {
        let id, r, gg, bb, nm, meta;
        if (typeof arg === "object" && arg !== null) {
            ({ id, r, g: gg, b: bb, name: nm, meta } = arg);
        } else {
            id = arg; r = g; gg = b; bb = name; nm = undefined;
        }
        if (typeof id !== "number") {
            throw new Error("MaterialRegistry.register: id required");
        }
        const rf = r > 1 ? r / 255 : r;
        const gf = gg > 1 ? gg / 255 : gg;
        const bf = bb > 1 ? bb / 255 : bb;
        const rgb = [rf, gf, bf];
        this._colors.set(id, rgb);
        if (nm)   this._names.set(id, nm);
        if (meta) this._meta.set(id, meta);
        this._fire(id, rgb);
    }

    /**
     * Bulk register — convenience for arrays produced by
     * wadPaletteSwap.paletteToMaterials.
     */
    bulkRegister(records) {
        for (const r of records) this.register(r);
    }

    /** Update just the color of an existing id. No-op if unknown. */
    update(id, r, g, b) {
        if (!this._colors.has(id)) return false;
        const rf = r > 1 ? r / 255 : r;
        const gf = g > 1 ? g / 255 : g;
        const bf = b > 1 ? b / 255 : b;
        const rgb = [rf, gf, bf];
        this._colors.set(id, rgb);
        this._fire(id, rgb);
        return true;
    }

    /** Remove a registered material. */
    unregister(id) {
        this._colors.delete(id);
        this._names.delete(id);
        this._meta.delete(id);
    }

    /** Strip every non-default entry (callbacks fired only for unique ids). */
    resetToDefaults() {
        const ids = Array.from(this._colors.keys());
        this._colors.clear();
        this._names.clear();
        this._meta.clear();
        this._seedDefaults();
        for (const id of ids) this._fire(id, this._colors.get(id) ?? null);
    }

    // ---- reads ----

    /** Get a material's RGB triplet (0..1 floats) or null. */
    getColor(id) {
        return this._colors.get(id) ?? null;
    }

    /** Lookup name for an id (debugging) or null. */
    getName(id) {
        return this._names.get(id) ?? null;
    }

    /** Free-form metadata for an id (e.g. atlas UV box, anim cycle). */
    getMeta(id) {
        return this._meta.get(id) ?? null;
    }

    /** Set free-form metadata for an id. */
    setMeta(id, meta) {
        this._meta.set(id, meta);
    }

    /** Is this id registered? */
    has(id) {
        return this._colors.has(id);
    }

    /** Total number of registered materials. */
    count() {
        return this._colors.size;
    }

    /** Array of all registered ids (insertion order). */
    listIds() {
        return Array.from(this._colors.keys());
    }

    // ---- subscriptions ----

    /**
     * Subscribe to color-change events. Callback receives
     * (id, [r, g, b]). Returns an unsubscribe function.
     */
    onChange(cb) {
        this._listeners.add(cb);
        return () => this._listeners.delete(cb);
    }

    _fire(id, color) {
        for (const cb of this._listeners) {
            try { cb(id, color); } catch (e) { console.error("MaterialRegistry listener:", e); }
        }
    }
}

/**
 * Singleton accessor. Most callers want this — there's one global
 * registry; the renderer + animator + palette swap all share it.
 */
export function getMaterialRegistry() {
    if (!_singleton) _singleton = new MaterialRegistry();
    return _singleton;
}

/** Test-only reset. Not exposed on window. */
export function _resetMaterialRegistry() {
    _singleton = null;
}
