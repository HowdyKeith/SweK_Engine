// FILE: tools/wadThings.js
// VERSION: v1 — round 379
//
// Convert a parsed WAD map's THING list into a structured set of
// billboard placement specs. v365 added the THING reader; this round
// turns the raw {x, y, angle, type, flags} records into engine-ready
// data for spawning kaiju, items, props, and decorations.
//
// Categories:
//
//   monster      — zombiemen, imps, demons, barons, cyberdemons, etc.
//                  Suggested rendering: animated billboard sprite or
//                  spawn an actual kaiju entity at the world position.
//
//   weapon       — shotgun, chaingun, rocket launcher, plasma, BFG, etc.
//                  Suggested rendering: glowing billboard quad.
//
//   item         — health/armor bonuses, stimpaks, medikits, backpack.
//
//   powerup      — berserk, invulnerability, computer map.
//
//   decoration   — barrels, lamps, corpses (the static eye candy).
//                  Note: v365's THING_TYPES table doesn't enumerate all
//                  of these; they're recognized by a fallback name.
//
//   spawn        — player1-4 starts, deathmatch starts, teleport dests.
//                  Excluded from billboard output by default; voxelizer
//                  already uses player1_start for the camera teleport.
//
// USAGE:
//
//   const parsedMap = wad.parseMap(wadFile, "MAP01", { full: true })
//   const placements = thingsToPlacements(parsedMap, {
//       unitsPerVoxel: 16,
//       baseY: 2,
//       includeSpawns: false,
//   })
//   // → [{ kind, label, x, y, z, angle, flags, type, thingIdx }, ...]
//
//   for (const p of placements) {
//       if (p.kind === "monster") spawnKaijuAt(p.x, p.y, p.z, p.label)
//       else                       addBillboardAt(p.x, p.y, p.z, p.label)
//   }

import { THING_TYPES } from "./wadLoader.js";

// Per-type kind classification. Built from the THING_TYPES table above.
const KIND_MAP = {
    // spawns — usually NOT placed as billboards, just used for player/teleport
    player1_start: "spawn",
    player2_start: "spawn",
    player3_start: "spawn",
    player4_start: "spawn",
    dm_start:      "spawn",
    teleport_dest: "spawn",

    // monsters — Doom 1 set
    zombieman:         "monster",
    shotgun_guy:       "monster",
    chaingunner:       "monster",
    imp:               "monster",
    demon:             "monster",
    baron:             "monster",
    cyberdemon:        "monster",
    spider_mastermind: "monster",

    // weapons
    shotgun:         "weapon",
    chaingun:        "weapon",
    rocket_launcher: "weapon",
    plasma_rifle:    "weapon",
    chainsaw:        "weapon",
    bfg:             "weapon",

    // items
    health_bonus: "item",
    armor_bonus:  "item",
    armor:        "item",
    megaarmor:    "item",
    stimpak:      "item",
    medikit:      "item",
    backpack:     "item",

    // powerups
    computer_map: "powerup",
    berserk:      "powerup",
    invuln:       "powerup",
};

// Doom THING flag bits (skill levels + difficulty filters)
export const THING_FLAG = {
    EASY:       0x0001,
    MEDIUM:     0x0002,
    HARD:       0x0004,
    DEAF:       0x0008,
    MULTIPLAYER:0x0010,
};

/**
 * Classify a numeric THING type code into:
 *   { label, kind }
 * Returns kind="unknown" for type codes not in the table (e.g. mod-
 * specific decorations from PWADs).
 */
export function classifyThing(typeCode) {
    const label = THING_TYPES[typeCode];
    if (!label) {
        return { label: `type_${typeCode}`, kind: "unknown" };
    }
    return { label, kind: KIND_MAP[label] ?? "decoration" };
}

/**
 * Convert a parsed map's THING list into a list of placement specs in
 * voxel-world coordinates. Coordinates are computed using the same
 * centering rule as voxelizeWadMap so a placement at (worldX, worldZ)
 * lines up with the voxelized walls.
 *
 * @param {Object} parsedMap
 * @param {Object} [opts]
 * @param {number} [opts.unitsPerVoxel=16]
 * @param {number} [opts.baseY=2]
 * @param {boolean} [opts.includeSpawns=false]  include player_start etc.
 * @param {boolean} [opts.centerOnPlayerStart=true]
 * @param {boolean} [opts.includeMultiplayer=false] include MP-only things
 * @param {string}   [opts.skill]                "easy" | "medium" | "hard" — filter
 */
export function thingsToPlacements(parsedMap, opts = {}) {
    if (!parsedMap?.things) return [];
    const ups        = opts.unitsPerVoxel ?? 16;
    const baseY      = opts.baseY ?? 2;
    const includeSpawns = !!opts.includeSpawns;
    const includeMP    = !!opts.includeMultiplayer;
    const skill        = opts.skill ?? null;
    const center       = opts.centerOnPlayerStart !== false;

    let cx = 0, cz = 0;
    const playerThing = parsedMap.things.find(t => t.type === 1);
    if (playerThing && center) {
        cx = playerThing.x; cz = playerThing.y;
    } else if (center && parsedMap.bounds) {
        cx = (parsedMap.bounds.minX + parsedMap.bounds.maxX) / 2;
        cz = (parsedMap.bounds.minY + parsedMap.bounds.maxY) / 2;
    }

    const skillBit = skill === "easy"   ? THING_FLAG.EASY
                  : skill === "medium" ? THING_FLAG.MEDIUM
                  : skill === "hard"   ? THING_FLAG.HARD
                  : null;

    const out = [];
    for (let i = 0; i < parsedMap.things.length; i++) {
        const t = parsedMap.things[i];
        const c = classifyThing(t.type);
        if (c.kind === "spawn" && !includeSpawns) continue;
        if (!includeMP && (t.flags & THING_FLAG.MULTIPLAYER)) continue;
        if (skillBit !== null && !(t.flags & skillBit)) continue;
        const vx = Math.round((t.x - cx) / ups);
        const vz = Math.round((t.y - cz) / ups);
        out.push({
            kind:   c.kind,
            label:  c.label,
            type:   t.type,
            x: vx, y: baseY, z: vz,
            angle:  t.angle,
            flags:  t.flags,
            thingIdx: i,
        });
    }
    return out;
}

/**
 * Convenience: group placements by kind. Returns
 *   { monster: [...], weapon: [...], item: [...], ... }
 * Useful for "spawn all monsters but not items" workflows.
 */
export function groupPlacementsByKind(placements) {
    const out = {};
    for (const p of placements) {
        (out[p.kind] = out[p.kind] ?? []).push(p);
    }
    return out;
}

/**
 * Histogram of THING kinds in a parsed map — for quick diagnostics.
 *   { monster: 23, weapon: 5, item: 14, ... }
 */
export function thingHistogram(parsedMap, opts = {}) {
    const placements = thingsToPlacements(parsedMap, { includeSpawns: true, ...opts });
    const counts = {};
    for (const p of placements) counts[p.kind] = (counts[p.kind] ?? 0) + 1;
    return counts;
}
