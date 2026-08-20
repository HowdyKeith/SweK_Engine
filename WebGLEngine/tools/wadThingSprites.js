// FILE: tools/wadThingSprites.js
// VERSION: v1 — round 380
//
// Map THING type codes to their canonical sprite name. The standard
// Doom 1+2 IWADs assign one 4-letter sprite to each enemy/item/weapon;
// armed with this mapping the engine can render a placement directly:
//
//   const placements = wad.things(parsedMap)
//   for (const p of placements) {
//     const sprName = thingSpriteName(p.type)
//     if (sprName) {
//       const decoded = wad.spriteFrame(wadFile, sprName, "A", 1, pal)
//       drawBillboard(decoded.rgba, p.x, p.y, p.z, p.angle)
//     }
//   }

// Per-type → sprite-name lookup. Covers the Doom 1+2 set referenced
// by v365's THING_TYPES table.
const THING_TO_SPRITE = {
    // Monsters
    3004: "POSS",   // zombieman
    9:    "SPOS",    // shotgun_guy ("Sergeant")
    65:   "CPOS",    // chaingunner
    3001: "TROO",    // imp
    3002: "SARG",    // demon (pinky)
    3003: "BOSS",    // baron of hell
    16:   "CYBR",    // cyberdemon
    7:    "SPID",    // spider mastermind
    // Items
    2014: "BON1",    // health bonus
    2015: "BON2",    // armor bonus
    2018: "ARM1",    // armor
    2019: "ARM2",    // megaarmor
    2011: "STIM",    // stimpak
    2012: "MEDI",    // medikit
    8:    "BPAK",    // backpack
    // Weapons
    2001: "SHOT",    // shotgun
    2002: "MGUN",    // chaingun
    2003: "LAUN",    // rocket launcher
    2004: "PLAS",    // plasma rifle
    2005: "CSAW",    // chainsaw
    2006: "BFUG",    // BFG9000
    // Powerups
    2026: "PMAP",    // computer map
    2024: "PSTR",    // berserk (Strength power-up sprite)
    2025: "PINV",    // invulnerability
};

/**
 * Return the 4-letter sprite name for a THING type, or null.
 */
export function thingSpriteName(typeCode) {
    return THING_TO_SPRITE[typeCode] ?? null;
}

/**
 * Bulk view — every (typeCode, label, spriteName) triple this module
 * knows about. Useful for "list everything renderable" diagnostics.
 */
export function listThingSpriteMap() {
    return { ...THING_TO_SPRITE };
}
