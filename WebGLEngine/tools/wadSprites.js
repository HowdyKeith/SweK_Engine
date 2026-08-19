// FILE: tools/wadSprites.js
// VERSION: v1 — round 380
//
// Decode Doom sprite lumps. Sprites use the same "picture format" as
// wall patches (8-byte header + column directory + column posts), so
// this module reuses v377's decodePatch. What's new here is the sprite
// naming convention and the per-frame/per-rotation grouping.
//
// SPRITE LUMP NAMES:
//
//   AAAABBCC  where:
//     AAAA  — 4-letter sprite name (TROO, POSS, SARG, BOSS, ...)
//     B     — frame letter (A-Z; identifies animation phase)
//     C     — rotation digit:
//                0      — single sprite for all viewing angles
//                1-8    — per-rotation sprite (1=north, 3=east, etc.)
//     DD    — optional second frame (mirrored — same sprite used for
//             two rotations to save space)
//
//   Examples:
//     TROOA1    — imp, frame A, rotation 1 (facing camera)
//     TROOA2A8  — imp, frame A, rotations 2 AND 8 (mirrored)
//     TROOH0    — imp, frame H (death pose), any rotation
//
// LUMP REGION:
//
//   Doom sprites live between S_START and S_END markers (some PWADs
//   use SS_START / SS_END). v365's WAD parser doesn't track region
//   markers explicitly, but the lumps are still in the directory; we
//   filter by name pattern (4-letter prefix, all uppercase, length 6
//   or 8) and try-decode each. Lumps that don't parse as picture
//   format get skipped.
//
// USAGE:
//
//   const pal = wad.palette(wadFile)
//   const sprite = decodeSpriteFrame(wadFile, "TROO", "A", 1, pal)
//   // → { width, height, leftOffset, topOffset, rgba }
//
//   const allFrames = decodeSpriteSet(wadFile, "TROO", pal)
//   // → Map<"A1", { width, height, rgba }, "A2A8": {...}, "H0": {...} >
//
//   const names = listSpriteNames(wadFile)
//   // → ["TROO", "POSS", "SARG", "BOSS", ...]   (4-letter prefixes)

import { decodePatch } from "./wadWallTextures.js";

const SPRITE_NAME_RX = /^([A-Z][A-Z0-9_]{3})([A-Z])([0-9])(?:([A-Z])([0-9]))?$/;

/**
 * Parse a sprite lump name into its components, or null if it doesn't
 * look like a sprite. Real WADs occasionally have non-sprite 6-letter
 * lumps in S_START region; the regex catches the well-formed shape.
 */
export function parseSpriteName(lumpName) {
    const m = SPRITE_NAME_RX.exec((lumpName ?? "").toUpperCase().trim().replace(/\0+$/, ""));
    if (!m) return null;
    return {
        sprite:    m[1],
        frame:     m[2],
        rotation:  Number(m[3]),
        frame2:    m[4] ?? null,
        rotation2: m[5] != null ? Number(m[5]) : null,
    };
}

/**
 * Return the unique 4-letter sprite prefixes present in the WAD. Sorted
 * alphabetically. Useful for "what monsters does this WAD ship?" probes.
 */
export function listSpriteNames(wadFile) {
    const seen = new Set();
    for (const l of wadFile.lumps) {
        const p = parseSpriteName(l.name);
        if (p) seen.add(p.sprite);
    }
    return [...seen].sort();
}

/**
 * Locate the lump that provides sprite `name`, frame `frame` (letter),
 * rotation `rotation` (0-8). Handles mirrored entries (e.g. TROOA2A8
 * serves both rotation 2 and rotation 8). Returns the lump or null.
 */
function _findSpriteLump(wadFile, name, frame, rotation) {
    const upName = name.toUpperCase();
    const upFrame = frame.toUpperCase();
    // First try exact 6-letter match: NAME + frame + rot
    const target = upName + upFrame + String(rotation);
    for (const l of wadFile.lumps) {
        if (l.name.toUpperCase().replace(/\0+$/, "") === target) return l;
    }
    // Then try mirrored 8-letter forms — second pair matches our rot
    for (const l of wadFile.lumps) {
        const p = parseSpriteName(l.name);
        if (!p) continue;
        if (p.sprite !== upName) continue;
        if (p.frame === upFrame && p.rotation === rotation) return l;
        if (p.frame2 === upFrame && p.rotation2 === rotation) return l;
    }
    // Last resort: rotation 0 (omni-directional) of this frame
    if (rotation !== 0) {
        const omni = upName + upFrame + "0";
        for (const l of wadFile.lumps) {
            if (l.name.toUpperCase().replace(/\0+$/, "") === omni) return l;
        }
    }
    return null;
}

/**
 * Decode one specific (sprite, frame, rotation) into an RGBA bitmap.
 * Falls back to rotation 0 if the requested rotation isn't present.
 *
 * @param {Object} wadFile
 * @param {string} name      4-letter sprite ("TROO", "POSS", ...)
 * @param {string} frame     frame letter ("A", "B", ...)
 * @param {number} rotation  0-8
 * @param {Uint8Array} palette  768-byte PLAYPAL palette
 * @returns {{width, height, rgba, leftOffset, topOffset}|null}
 */
export function decodeSpriteFrame(wadFile, name, frame, rotation, palette) {
    const lump = _findSpriteLump(wadFile, name, frame, rotation);
    if (!lump) return null;
    return decodePatch(wadFile, lump.name, palette);
}

/**
 * Decode every frame+rotation of a sprite into a Map keyed by the
 * frame/rotation suffix. The key matches the lump's letter+digit pair
 * (e.g. "A1", "A2A8" for mirrored, "H0" for omni).
 *
 * @returns {Map<string, {width, height, rgba}>}
 */
export function decodeSpriteSet(wadFile, name, palette) {
    const upName = name.toUpperCase();
    const out = new Map();
    for (const l of wadFile.lumps) {
        const p = parseSpriteName(l.name);
        if (!p || p.sprite !== upName) continue;
        const key = (p.frame + p.rotation) + (p.frame2 ? p.frame2 + p.rotation2 : "");
        try {
            out.set(key, decodePatch(wadFile, l.name, palette));
        } catch (e) {
            console.warn(`[wadSprites] decode '${l.name}' failed: ${e?.message ?? e}`);
        }
    }
    return out;
}

/**
 * For each unique sprite in the WAD, return its frame letters. Quick
 * way to inventory animation states.
 *   { TROO: ["A","B","C","D","E","F","G","H","I","J","K","L","M"],
 *     POSS: ["A","B","C","D","E","F","G","H","I","J","K"], ... }
 */
export function spriteAnimationMap(wadFile) {
    const out = {};
    for (const l of wadFile.lumps) {
        const p = parseSpriteName(l.name);
        if (!p) continue;
        const set = out[p.sprite] = out[p.sprite] ?? new Set();
        set.add(p.frame);
        if (p.frame2) set.add(p.frame2);
    }
    // Convert each Set → sorted array
    for (const k of Object.keys(out)) {
        out[k] = [...out[k]].sort();
    }
    return out;
}
