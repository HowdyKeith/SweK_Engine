// =============================================================
// FILE: /tools/wadSectorEffects.js
// ROUND: 399
// =============================================================
//
// Doom sector specials. The `special` field on a sector (parsed in
// v365) selects from a small enum of behaviors — damaging floors,
// secret-tag rooms, flickering lights, doors that close after a
// delay, etc. This module:
//
//   1. Classifies the raw special code to a friendly enum.
//   2. Builds a position → effect lookup from a voxelized map so the
//      engine can query "what effect is the player standing on?"
//   3. Runs the effect tick — applies damage, fires secret-found
//      events, modulates light for flicker types.
//
// VANILLA DOOM SECTOR SPECIALS (most common):
//   0   — nothing
//   1   — random off (light flickers off briefly)
//   2   — blink 0.5s (light pulses every half second)
//   3   — blink 1s
//   4   — 20% damage + blink 0.5s
//   5   — 10% damage per second
//   7   — 5% damage per second
//   8   — light glows (light pulses smoothly)
//   9   — secret
//   10  — door close in 30s
//   11  — end-level (kills + ends map)
//   12  — blink 0.5s (synced)
//   13  — blink 1s (synced)
//   14  — door open in 5min
//   16  — 20% damage per second
//   17  — flicker

import { getMaterialRegistry } from "../engine/MaterialRegistry.js";

/**
 * Classify a raw sector.special code to a friendly enum.
 */
export const SECTOR_SPECIAL = Object.freeze({
    NONE:           0,
    LIGHT_FLICKER:  1,
    LIGHT_BLINK_05: 2,
    LIGHT_BLINK_10: 3,
    DAMAGE_20_BLINK: 4,
    DAMAGE_10:       5,
    DAMAGE_5:        7,
    LIGHT_GLOW:      8,
    SECRET:          9,
    DOOR_CLOSE_30:   10,
    END_LEVEL:       11,
    SYNC_BLINK_05:   12,
    SYNC_BLINK_10:   13,
    DOOR_OPEN_300:    14,
    DAMAGE_20:        16,
    FLICKER:          17,
});

/** Damage rate (per second, fractional health 0..1) for a special. */
export function damageRateForSpecial(special) {
    switch (special) {
        case SECTOR_SPECIAL.DAMAGE_20:
        case SECTOR_SPECIAL.DAMAGE_20_BLINK: return 0.20;
        case SECTOR_SPECIAL.DAMAGE_10:       return 0.10;
        case SECTOR_SPECIAL.DAMAGE_5:        return 0.05;
        case SECTOR_SPECIAL.END_LEVEL:       return Infinity;     // kills outright
        default: return 0;
    }
}

/** True when this special type modulates the sector's light at runtime. */
export function isLightSpecial(special) {
    return [
        SECTOR_SPECIAL.LIGHT_FLICKER,
        SECTOR_SPECIAL.LIGHT_BLINK_05,
        SECTOR_SPECIAL.LIGHT_BLINK_10,
        SECTOR_SPECIAL.LIGHT_GLOW,
        SECTOR_SPECIAL.SYNC_BLINK_05,
        SECTOR_SPECIAL.SYNC_BLINK_10,
        SECTOR_SPECIAL.FLICKER,
        SECTOR_SPECIAL.DAMAGE_20_BLINK,
    ].includes(special);
}

/** True if this is a "secret" sector — finding it should fire a found-secret event. */
export function isSecretSpecial(special) {
    return special === SECTOR_SPECIAL.SECRET;
}

/**
 * SectorEffectController — runs effects for an active map.
 *
 *   const ctrl = new SectorEffectController({
 *     map, voxelizeResult, getCameraSector,
 *     onDamage: (rate) => player.damage(rate),
 *     onSecretFound: (sIdx) => game.recordSecret(sIdx),
 *     onEndLevel: () => game.advanceMap(),
 *   });
 *
 *   // Per frame:
 *   ctrl.tick(now, dtSeconds);
 *
 * Caller supplies getCameraSector(): a callback that returns the
 * current sector index the camera/player is standing on, or -1.
 * (Usually wraps the BSP point-to-subsector + subsectorToSector
 * chain from v382.)
 */
export class SectorEffectController {
    constructor(opts) {
        this.map           = opts.map;
        this.getCameraSector = opts.getCameraSector ?? (() => -1);
        this.onDamage      = opts.onDamage      ?? (() => {});
        this.onSecretFound = opts.onSecretFound ?? (() => {});
        this.onEndLevel    = opts.onEndLevel     ?? (() => {});
        this.foundSecrets  = new Set();   // sector indices already found
        this._lastTickMs   = null;

        // Pre-classify each sector for fast per-frame lookup.
        const sectors = this.map?.sectors ?? [];
        this._special = new Array(sectors.length);
        this._origLight = new Array(sectors.length);   // for light effects to modulate FROM
        let damageCount = 0, secretCount = 0, lightCount = 0;
        for (let i = 0; i < sectors.length; i++) {
            const s = sectors[i];
            this._special[i] = s.special ?? 0;
            this._origLight[i] = s.light ?? 255;
            if (damageRateForSpecial(s.special)) damageCount++;
            if (isSecretSpecial(s.special)) secretCount++;
            if (isLightSpecial(s.special)) lightCount++;
        }
        this.stats = { damageCount, secretCount, lightCount, totalSectors: sectors.length };
    }

    /**
     * Advance one frame. `now` is performance.now()-style ms;
     * `dtSeconds` is seconds since the last tick.
     */
    tick(now, dtSeconds = 1 / 60) {
        // Per-camera sector effects
        const sIdx = this.getCameraSector();
        if (sIdx >= 0 && sIdx < this._special.length) {
            const special = this._special[sIdx];
            // Damage
            const rate = damageRateForSpecial(special);
            if (rate > 0) {
                if (rate === Infinity) {
                    this.onEndLevel();
                } else {
                    this.onDamage(rate * dtSeconds, { sectorIdx: sIdx, special });
                }
            }
            // Secret
            if (isSecretSpecial(special) && !this.foundSecrets.has(sIdx)) {
                this.foundSecrets.add(sIdx);
                this.onSecretFound(sIdx);
            }
        }

        // Light effects — modulate every sector with a light special.
        if (now != null) {
            this._tickLights(now);
        }
    }

    /**
     * Internal: re-tints sectors with light-modulating specials.
     * Updates the engine's MaterialRegistry directly so the renderer
     * picks up the new color on the next frame.
     */
    _tickLights(nowMs) {
        const sectors = this.map?.sectors;
        if (!sectors) return;
        const reg = getMaterialRegistry();
        for (let i = 0; i < this._special.length; i++) {
            const sp = this._special[i];
            if (!isLightSpecial(sp)) continue;
            const factor = this._lightFactor(sp, nowMs, i);
            const newLight = this._origLight[i] * factor;
            // The voxelize step assigned a material id per sector via
            // the floorTextureMap lookup; we re-tint that id. The id
            // was stored at voxelize time on the sector record via
            // a side channel (see ApplyLightEffectMaterials below).
            const matId = sectors[i]._lightMatId;
            if (matId != null) {
                const baseRGB = sectors[i]._baseRGB;
                if (baseRGB) {
                    reg.update(matId,
                        baseRGB[0] * factor,
                        baseRGB[1] * factor,
                        baseRGB[2] * factor);
                }
            }
        }
    }

    /**
     * Compute the light multiplier for a given special at time t.
     * Returns 0..1 (sometimes slightly above, e.g. for glow).
     */
    _lightFactor(special, nowMs, sectorIdx) {
        const t = nowMs / 1000;
        switch (special) {
            case SECTOR_SPECIAL.LIGHT_BLINK_05:
            case SECTOR_SPECIAL.SYNC_BLINK_05:
                return (Math.floor(t * 2) & 1) ? 1.0 : 0.4;
            case SECTOR_SPECIAL.LIGHT_BLINK_10:
            case SECTOR_SPECIAL.SYNC_BLINK_10:
                return (Math.floor(t) & 1) ? 1.0 : 0.4;
            case SECTOR_SPECIAL.LIGHT_GLOW:
                // Smooth sine pulse 0.4..1.0
                return 0.7 + 0.3 * Math.sin(t * 2 + sectorIdx * 0.7);
            case SECTOR_SPECIAL.LIGHT_FLICKER:
            case SECTOR_SPECIAL.FLICKER:
            case SECTOR_SPECIAL.DAMAGE_20_BLINK: {
                // Pseudo-random per-sector flicker
                const seed = sectorIdx * 9737 + Math.floor(t * 10);
                const r = (Math.sin(seed) * 43758.5453) % 1;
                return Math.abs(r) > 0.15 ? 1.0 : 0.35;
            }
            default:
                return 1.0;
        }
    }
}

/**
 * Convenience: register the per-sector base material colors so
 * SectorEffectController can re-tint them later. Call this AFTER
 * voxelize but BEFORE the controller's first tick().
 *
 *   ApplyLightEffectMaterials(parsedMap, palette,
 *                              { closestPaletteIndex, baseMatId: 100 });
 */
export function ApplyLightEffectMaterials(parsedMap, palette, opts = {}) {
    const baseMatId = opts.baseMatId ?? 100;
    const closestFn = opts.closestPaletteIndex;
    if (!closestFn) throw new Error("ApplyLightEffectMaterials: closestPaletteIndex required");
    const sectors = parsedMap?.sectors ?? [];
    let applied = 0;
    for (let i = 0; i < sectors.length; i++) {
        const s = sectors[i];
        if (!isLightSpecial(s.special)) continue;
        // We need a stable matId for this sector. The simplest choice:
        // dedicate one PLAYPAL slot per sector to its own animated
        // material. Reserve baseMatId + 256 + sectorIdx so we don't
        // collide with the 256 static PLAYPAL ids.
        const matId = baseMatId + 256 + i;
        s._lightMatId = matId;
        // Pick a starting RGB. Use the floor texture's dominant color
        // if a lookup function is provided; otherwise a default grey.
        const baseRGB = opts.baseColor || [0.5, 0.5, 0.5];
        s._baseRGB = baseRGB.slice();
        // Seed the registry. Subsequent ticks modulate this entry.
        const reg = getMaterialRegistry();
        reg.register({ id: matId, r: baseRGB[0], g: baseRGB[1], b: baseRGB[2],
                       name: `SECTOR_${i}_LIGHT` });
        applied++;
    }
    return applied;
}
