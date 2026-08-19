// =============================================================================
// FILE: /simulation/KaijuBotKinds.js
// ROUND: 230
// =============================================================================
//
// The VoxelEngine's open-world kaiju system (world/kaijuKinds.js +
// world/kaijuAttacks.js) defines a richer enemy roster than the dungeon
// bots: 7 thematic origins (sky / space / cave / underground / water /
// hell / tech), each with its own color, scale, damage multiplier, and
// signature attack (lightning / plasma / fireball / etc).
//
// This module bridges that roster into the WAD dungeon FPS layer. We
// don't reuse the full Kaiju spawn-from-altitude physics — those need
// open terrain. We just pull the *configuration* (color, scale,
// damage from attack spec) and produce BOT_KINDS spec objects that
// BotManager can spawn just like grunt/sniper/heavy/miniboss.
//
// Visual identity comes free:
//   • spec.color drives tracer-particle color (BotManager line 382)
//   • spec.scale drives mesh size at spawn (BotManager line 217)
//   • spec.speech provides themed voice lines per kind
//
// Stats are tuned for dungeon scale — kaiju in the open world are
// world-bosses, but in a dungeon they're medium-tier enemies. Scale
// is halved (typical kaiju 3.0-4.0 → bot 1.5-2.0) so they fit in
// corridors but still feel intimidating compared to a grunt.
//
// Exports:
//   KAIJU_BOT_KINDS — BOT_KINDS-shaped spec object, one entry per
//                     kaiju origin. Keys are "bot_kaiju_sky" etc.
//   isKaijuBotKind(name) — true if name starts with "bot_kaiju_"
//   kaijuLabelFor(kaijuKind) — friendly label for HUD/lore
// =============================================================================

import { KAIJU_KINDS }     from "../world/kaijuKinds.js";
import { KAIJU_ATTACKS, KIND_TO_ATTACK } from "../world/kaijuAttacks.js";

// Speech lines per kaiju origin — keep these short and atmospheric.
// The death line is what plays when the player kills one in FPS mode.
const KAIJU_SPEECH = {
    sky: {
        spawn: "Look up.",
        engage: "Storms gather.",
        death: "...the sky weeps.",
    },
    space: {
        spawn: "We are far from home.",
        engage: "Annihilate.",
        death: "...silence returns.",
    },
    cave: {
        spawn: "The deep stirs.",
        engage: "You're trespassing.",
        death: "...back to the stone.",
    },
    underground: {
        spawn: "Beneath everything.",
        engage: "Down where you belong.",
        death: "...buried again.",
    },
    water: {
        spawn: "The tide reaches you.",
        engage: "Drown.",
        death: "...dispersed.",
    },
    hell: {
        spawn: "I waited for this.",
        engage: "Burn for an eternity.",
        death: "...not yet ended.",
    },
    tech: {
        spawn: "Target locked.",
        engage: "Compute. Erase.",
        death: "...offline.",
    },
};

// Per-origin HP + speed tuning for dungeon scale. Kaiju are typically
// 75-100 second world-bosses; here they're 4-12 HP medium enemies.
// HP scales with kaiju.scale (bigger = tankier). Speed inverse to
// scale (bigger = slower). Damage comes from the attack spec.
const KAIJU_HP_BY_KIND = {
    sky:          5,   // scale 3 — medium tank, lightning sniper
    space:        12,  // scale 4 — heavy tank, plasma artillery
    cave:         8,   // scale 2.5 — solid bruiser, rock spike
    underground:  10,  // scale ~3 — heavy, rad pulse
    water:        7,   // scale ~3 — medium, tidal AoE feel
    hell:         9,   // scale ~3 — tough, fireball thrower
    tech:         6,   // scale ~2.5 — medium, sniper-like ion lance
};
const KAIJU_SPEED_BY_KIND = {
    sky:          2.5,
    space:        1.8,
    cave:         2.2,
    underground:  1.6,
    water:        2.0,
    hell:         2.4,
    tech:         2.2,
};

// Scale-down ratio so dungeon kaiju fit in corridors. Open-world kaiju
// stand 60-80 voxels tall; we want 1.5-2.0× a grunt.
const SCALE_RATIO = 0.55;

// Build the bot spec for one kaiju origin.
function buildBotSpec(kaijuKind) {
    const k = KAIJU_KINDS[kaijuKind];
    if (!k) return null;
    const attackName = KIND_TO_ATTACK[kaijuKind] || null;
    const attack = attackName ? KAIJU_ATTACKS[attackName] : null;

    // Per-shot damage scaled by the kaiju's damageMul so a hell kaiju
    // (damageMul 1.0) hits at the attack's base, while space (1.4)
    // hits noticeably harder. The attack specs are tuned for open-
    // world kaiju where the player has high regen / cover — for
    // dungeon-scale FPS we apply a /3 nerf so a hell bot hits ~24%
    // HP not ~72%. Still meaningful, still survivable in mid-fight.
    const DUNGEON_DAMAGE_SCALE = 0.33;
    const baseDamage = (attack?.damage ?? 0.08) * (k.damageMul ?? 1.0) * DUNGEON_DAMAGE_SCALE;
    // Range from the attack spec, clamped so cave melee doesn't try
    // to snipe and sky lightning doesn't fire across the dungeon
    const range = Math.max(10, Math.min(35, attack?.range ?? 20));
    // Fire interval — derive from the attack's cooldown but speed it
    // up a little so combat is brisk
    const fireInterval = Math.max(0.7, (attack?.cooldown ?? 2.5) * 0.6);

    return {
        hp:           KAIJU_HP_BY_KIND[kaijuKind] ?? 6,
        speed:        KAIJU_SPEED_BY_KIND[kaijuKind] ?? 2.0,
        sightRange:   Math.max(range + 8, 28),
        fireRange:    range,
        fireInterval,
        damage:       baseDamage,
        color:        k.color,
        // Round 274 — absorb mechanic. When a kaiju absorbs damage of
        // its affinity type it grows by tier (absorbScale ramps 1→10).
        // Multiply into the rendered bot scale so the world entity
        // visibly swells with each absorbed strike.
        scale:        (k.scale ?? 2.5) * SCALE_RATIO * (k.absorbScale ?? 1.0),
        // Tag so downstream code (lore, HUD, FPSShooter boss check)
        // can identify these as kaiju-derived enemies
        kaijuOrigin:  kaijuKind,
        attackName,
        speech:       KAIJU_SPEECH[kaijuKind] || {
            spawn:  "I have arrived.",
            engage: "You cannot win.",
            death:  "...the cycle continues.",
        },
    };
}

// Build the full bot kinds map. Keys are namespaced "bot_kaiju_X" so
// they don't collide with the original grunt/sniper/heavy names.
function buildKaijuBotKinds() {
    const out = {};
    for (const origin of Object.keys(KAIJU_KINDS)) {
        const spec = buildBotSpec(origin);
        if (spec) out[`bot_kaiju_${origin}`] = spec;
    }
    return out;
}

export const KAIJU_BOT_KINDS = buildKaijuBotKinds();

export function isKaijuBotKind(name) {
    return typeof name === "string" && name.startsWith("bot_kaiju_");
}

// Returns user-facing label for HUD / KPop toasts
export function kaijuLabelFor(kaijuKind) {
    const labels = {
        sky:         "Sky Kaiju",
        space:       "Star Kaiju",
        cave:        "Cave Kaiju",
        underground: "Underground Kaiju",
        water:       "Water Kaiju",
        hell:        "Hell Kaiju",
        tech:        "Tech Kaiju",
    };
    return labels[kaijuKind] || `${kaijuKind} kaiju`;
}

// All available kaiju bot kinds for Ollama prompt enumeration
export const KAIJU_BOT_KIND_NAMES = Object.keys(KAIJU_BOT_KINDS);
