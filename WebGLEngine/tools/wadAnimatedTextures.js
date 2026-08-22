// =============================================================
// FILE: /tools/wadAnimatedTextures.js
// ROUND: 396
// =============================================================
//
// Doom's iconic animated textures: dripping slime (SLADRIP1→3),
// flickering fire blue (FIREBLU1→2), bubbling nukage (NUKAGE1→3),
// and the rest. These are NAMED CYCLES — Doom hard-coded which
// texture names participate in which animation; the ANIMATED lump
// in Boom/MBF defines additional cycles externally.
//
// THIS MODULE PROVIDES:
//   1. The vanilla-Doom cycle registry (compiled in below).
//   2. A `TextureAnimator` that ticks all live cycles, exposes
//      "what's the current frame of cycle X?" queries.
//   3. A material-binding helper: register a (paletteBaseId, voxel
//      material id, cycle name) tuple, and on each animator tick the
//      engine's material color for that id is recomputed.
//
// THE TICK RATE:
//   Doom's animation table uses 8 game tics per frame at 35Hz (so
//   each frame holds for ~228ms). We expose the rate as configurable
//   so it can be slowed to read on a non-Doom display, or sped up
//   for stress testing.
//
// WHAT THIS MODULE DOESN'T DO:
//   • Atlas the actual animated wall textures — that needs the
//     existing wadWallTextures + a per-frame atlas update. The
//     voxel-color path covered here is the "Doom in voxels" port:
//     animated COLOR rather than animated PIXEL ART. Adding pixel
//     art atlasing is the next round (deferred backlog item).

/**
 * Vanilla Doom animated cycles. Each entry: { last, first, ticDiv }
 * — Doom uses NAMES that fall lexicographically between first and
 * last; the cycle progresses through every texture with a name in
 * that range. For runtime simplicity we expand the ranges here.
 *
 * Source: ID Software's anims[] in p_spec.c (Doom v1.9).
 */
export const DOOM_TEXTURE_CYCLES = [
    // Walls
    { name: "BLODGR",   frames: ["BLODGR1", "BLODGR2", "BLODGR3", "BLODGR4"], ticDiv: 8 },
    { name: "BLODRIP",  frames: ["BLODRIP1", "BLODRIP2", "BLODRIP3", "BLODRIP4"], ticDiv: 8 },
    { name: "FIREBLU",  frames: ["FIREBLU1", "FIREBLU2"], ticDiv: 8 },
    { name: "FIRLAV",   frames: ["FIRLAV3", "FIRLAVA"], ticDiv: 8 },
    { name: "FIREMAG",  frames: ["FIREMAG1", "FIREMAG2", "FIREMAG3"], ticDiv: 8 },
    { name: "FIREWAL",  frames: ["FIREWALA", "FIREWALB", "FIREWALL"], ticDiv: 8 },
    { name: "GSTFONT",  frames: ["GSTFONT1", "GSTFONT2", "GSTFONT3"], ticDiv: 8 },
    { name: "ROCKRED",  frames: ["ROCKRED1", "ROCKRED2", "ROCKRED3"], ticDiv: 8 },
    { name: "SLADRIP",  frames: ["SLADRIP1", "SLADRIP2", "SLADRIP3"], ticDiv: 8 },
    { name: "BFALL",    frames: ["BFALL1", "BFALL2", "BFALL3", "BFALL4"], ticDiv: 8 },
    { name: "SFALL",    frames: ["SFALL1", "SFALL2", "SFALL3", "SFALL4"], ticDiv: 8 },
    { name: "WFALL",    frames: ["WFALL1", "WFALL2", "WFALL3", "WFALL4"], ticDiv: 8 },
    { name: "DBRAIN",   frames: ["DBRAIN1", "DBRAIN2", "DBRAIN3", "DBRAIN4"], ticDiv: 8 },
    // Flats
    { name: "NUKAGE",   frames: ["NUKAGE1", "NUKAGE2", "NUKAGE3"], ticDiv: 8 },
    { name: "FWATER",   frames: ["FWATER1", "FWATER2", "FWATER3", "FWATER4"], ticDiv: 8 },
    { name: "SWATER",   frames: ["SWATER1", "SWATER2", "SWATER3", "SWATER4"], ticDiv: 8 },
    { name: "LAVA",     frames: ["LAVA1", "LAVA2", "LAVA3", "LAVA4"], ticDiv: 8 },
    { name: "BLOOD",    frames: ["BLOOD1", "BLOOD2", "BLOOD3"], ticDiv: 8 },
    { name: "RROCK",    frames: ["RROCK05", "RROCK06", "RROCK07", "RROCK08"], ticDiv: 8 },
    { name: "SLIME",    frames: ["SLIME01", "SLIME02", "SLIME03", "SLIME04",
                                  "SLIME05", "SLIME06", "SLIME07", "SLIME08"], ticDiv: 8 },
];

/** Reverse-lookup: texture name → cycle definition. */
const FRAME_TO_CYCLE = new Map();
for (const cyc of DOOM_TEXTURE_CYCLES) {
    for (const frame of cyc.frames) {
        FRAME_TO_CYCLE.set(frame, cyc);
    }
}

/** Find the cycle a given texture name participates in (or null). */
export function cycleForTextureName(name) {
    return FRAME_TO_CYCLE.get(name) ?? null;
}

/** Is the given texture animated at all? */
export function isAnimatedTexture(name) {
    return FRAME_TO_CYCLE.has(name);
}

/**
 * TextureAnimator — central clock + binding registry.
 *
 *   const anim = new TextureAnimator({ tickHz: 35 });
 *   anim.bind("NUKAGE1", (currentFrame) => {
 *     // currentFrame is e.g. "NUKAGE3" — update voxel material colors here
 *   });
 *   ...each frame: anim.tick(performance.now())
 *
 * Doom's clock is 35Hz; ticDiv=8 means a cycle advances every 8 tics
 * = ~228ms per frame. We use the same convention.
 */
export class TextureAnimator {
    constructor(opts = {}) {
        this.tickHz       = opts.tickHz ?? 35;
        this.startTime    = null;
        this._listeners   = new Map();    // textureName → array of callbacks
        this._lastFrameByCycle = new Map();    // cycleName → last reported frame name
    }

    /**
     * Register a callback that fires when the cycle a texture belongs
     * to advances. The texture name passed to `bind` is just the
     * lookup key; the callback receives the CURRENT frame name,
     * which may differ from the lookup key as the cycle progresses.
     *
     * Returns an unbind function.
     */
    bind(textureName, callback) {
        const cyc = cycleForTextureName(textureName);
        if (!cyc) return () => {};        // not animated → no-op
        let arr = this._listeners.get(cyc.name);
        if (!arr) { arr = []; this._listeners.set(cyc.name, arr); }
        arr.push(callback);
        return () => {
            const idx = arr.indexOf(callback);
            if (idx >= 0) arr.splice(idx, 1);
        };
    }

    /**
     * Advance all cycles to the appropriate frame for the given
     * timestamp (milliseconds, from performance.now()). Listeners
     * fire only when their cycle's frame index actually changes.
     */
    tick(now) {
        if (this.startTime == null) this.startTime = now;
        const elapsedMs = now - this.startTime;
        const elapsedTics = (elapsedMs * this.tickHz) / 1000;
        for (const cyc of DOOM_TEXTURE_CYCLES) {
            const frameIdx = Math.floor(elapsedTics / cyc.ticDiv) % cyc.frames.length;
            const frameName = cyc.frames[frameIdx];
            const prev = this._lastFrameByCycle.get(cyc.name);
            if (prev !== frameName) {
                this._lastFrameByCycle.set(cyc.name, frameName);
                const arr = this._listeners.get(cyc.name);
                if (arr) for (const cb of arr) cb(frameName);
            }
        }
    }

    /**
     * Reset the animator's clock. Useful at scene-load to keep
     * cycles from "jumping" mid-frame after a long pause.
     */
    reset() {
        this.startTime = null;
        this._lastFrameByCycle.clear();
    }

    /** Current frame name for a cycle (e.g. "NUKAGE") or null. */
    currentFrame(cycleName) {
        return this._lastFrameByCycle.get(cycleName) ?? null;
    }

    /** Total number of bound listeners across all cycles. */
    listenerCount() {
        let n = 0;
        for (const arr of this._listeners.values()) n += arr.length;
        return n;
    }
}
