// FILE: simulation/civPersonalities.js
// VERSION: v1
//
// Round 34 — civilization personality archetypes. Five flavors with
// distinct stat modifiers that propagate through tick logic:
//
//   peaceful       — slow growth, late summoner, fragile in war
//   expansionist   — high intent (territory grows fast), aggressive
//   religious      — fast megastructure builds, early kaiju summons
//   tech           — fast research → reaches tier-4 quicker
//   militaristic   — frequent defender bolts, hard-hitting counters
//
// All modifiers are multipliers (1.0 = neutral) or absolute thresholds.
// Manager + entity tick logic read the active personality's mods and
// apply at each relevant decision point.

export const PERSONALITY_NAMES = ["peaceful", "expansionist", "religious", "tech", "militaristic"];

export const PERSONALITY_DATA = {
    peaceful: {
        icon: "☮",
        color: "#8df",
        mods: {
            researchMul:        0.65,
            combatDamageMul:    0.50,
            warDrainMul:        1.50,    // takes more damage when at war
            summonThreshold:    0.10,    // only summons when truly desperate
            megaSpeedMul:       1.00,
            intentBonus:        0.00,
            boltCooldownMul:    1.30,
            counterCooldownMul: 1.30,
        },
    },
    expansionist: {
        icon: "→",
        color: "#fc6",
        mods: {
            researchMul:        1.00,
            combatDamageMul:    1.30,
            warDrainMul:        0.80,
            summonThreshold:    0.15,
            megaSpeedMul:       0.70,    // doesn't prioritize monuments
            intentBonus:        0.20,    // pushes territory growth
            boltCooldownMul:    1.00,
            counterCooldownMul: 1.00,
        },
    },
    religious: {
        icon: "✦",
        color: "#fcf",
        mods: {
            researchMul:        0.80,
            combatDamageMul:    0.80,
            warDrainMul:        1.10,
            summonThreshold:    0.22,    // summons early — patron kaiju as savior
            megaSpeedMul:       1.60,    // monuments are sacred work
            intentBonus:        0.05,
            boltCooldownMul:    1.20,
            counterCooldownMul: 1.20,
        },
    },
    tech: {
        icon: "⚙",
        color: "#cfc",
        mods: {
            researchMul:        1.55,    // fast tier progression
            combatDamageMul:    1.00,
            warDrainMul:        1.00,
            summonThreshold:    0.10,
            megaSpeedMul:       1.10,
            intentBonus:        0.05,
            boltCooldownMul:    0.85,
            counterCooldownMul: 0.85,
        },
    },
    militaristic: {
        icon: "⚔",
        color: "#f99",
        mods: {
            researchMul:        0.95,
            combatDamageMul:    1.55,
            warDrainMul:        0.85,
            summonThreshold:    0.25,
            megaSpeedMul:       0.85,
            intentBonus:        0.10,
            boltCooldownMul:    0.55,    // bolts fly thick
            counterCooldownMul: 0.65,
        },
    },
};

// Deterministic pick by civ id + seed offset. Same id always picks
// the same personality so reload doesn't reroll.
export function pickPersonality(civId, seed = 0) {
    const h = ((civId * 2654435761) ^ (seed * 1597334677)) >>> 0;
    return PERSONALITY_NAMES[h % PERSONALITY_NAMES.length];
}

export function getPersonalityData(name) {
    return PERSONALITY_DATA[name] ?? PERSONALITY_DATA.peaceful;
}

export function getPersonalityMods(name) {
    return getPersonalityData(name).mods;
}
