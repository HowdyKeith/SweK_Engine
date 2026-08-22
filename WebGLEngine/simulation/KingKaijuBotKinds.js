// =============================================================================
// FILE: /simulation/KingKaijuBotKinds.js
// ROUND: 234
// =============================================================================
//
// Boss-tier kaiju mini-bosses. v226 introduced a generic mini-boss (15
// HP, magenta, scale 2.6). v230 brought the kaiju roster into dungeons
// as enemies. This module bridges the gap: each boss IS a king-tier
// kaiju with promoted attacks from KING_ATTACK_OVERRIDES, multi-attack
// rotation per KING_ATTACK_ROTATION, and stats scaled for a 2-3 minute
// boss fight.
//
// Difference from KaijuBotKinds.js (the regular minion roster):
//   • HP roughly 2× regular kaiju (22-30 vs 5-12)
//   • Scale uses kaiju.scale × 0.85 instead of × 0.55 — kings are
//     significantly bigger than regular kaiju enemies
//   • Damage scaled DOWN slightly more (× 0.25 instead of × 0.33)
//     because they fire faster + have more sustained encounter time
//   • Attack rotation: kings cycle through 2 attacks (primary +
//     KING_ATTACK_ROTATION variant if defined). BotManager honors the
//     rotation via bot.attackRotIdx.
//
// Exports:
//   KING_KAIJU_BOT_KINDS — spec map, keys "bot_king_X"
//   KING_KAIJU_BOT_KIND_NAMES — array of available king kinds
//   pickRandomKingKind() — for boss spawning when no theme hint exists
// =============================================================================

import { KAIJU_KINDS }     from "../world/kaijuKinds.js";
import {
    KAIJU_ATTACKS,
    KIND_TO_ATTACK,
    KING_ATTACK_OVERRIDES,
    KING_ATTACK_ROTATION,
} from "../world/kaijuAttacks.js";

// HP/speed tuning per king. Substantially heftier than the regular
// kaiju roster — kings are meant to anchor a 2-3 minute fight, not
// drop in 4 hits.
const KING_HP_BY_KIND = {
    sky:         22,
    space:       30,
    cave:        24,
    underground: 28,
    water:       25,
    hell:        26,
    tech:        20,
};
const KING_SPEED_BY_KIND = {
    sky:         2.0,
    space:       1.6,
    cave:        2.0,
    underground: 1.4,
    water:       1.8,
    hell:        2.2,
    tech:        2.4,   // ion-lance king is the most agile
};

// Scale-up ratio — kings appear larger than regular kaiju
const KING_SCALE_RATIO = 0.85;
const KING_DAMAGE_SCALE = 0.25;

// User-facing labels for the boss HP bar
const KING_LABELS = {
    sky:         "SKY KING",
    space:       "VOID SOVEREIGN",
    cave:        "STONE KING",
    underground: "DREGS-KING",
    water:       "TIDE KING",
    hell:        "HELL KING",
    tech:        "ARBITER",
};

// Themed speech: spawn / engage / death lines per king.
// Different from the v230 regular kaiju lines — kings have presence.
const KING_SPEECH = {
    sky: {
        spawn:  "Lift your gaze. Despair.",
        engage: "You walk under my sky.",
        death:  "...the storm passes.",
    },
    space: {
        spawn:  "I am the silence between stars.",
        engage: "Annihilate. Annihilate. Annihilate.",
        death:  "...returned to vacuum.",
    },
    cave: {
        spawn:  "The mountain remembers you.",
        engage: "Crushed beneath stone.",
        death:  "...stone settles.",
    },
    underground: {
        spawn:  "Breathe deeply. Choke.",
        engage: "Rot from within.",
        death:  "...the rot fades.",
    },
    water: {
        spawn:  "The flood has arrived.",
        engage: "Drown. Drown. Drown.",
        death:  "...the tide recedes.",
    },
    hell: {
        spawn:  "I have waited a long time.",
        engage: "Burn for an eternity.",
        death:  "...the cycle continues.",
    },
    tech: {
        spawn:  "Designation: hostile. Engaging.",
        engage: "Resistance: futile.",
        death:  "...connection lost.",
    },
};

// Build attack rotation for a king kind. If KING_ATTACK_ROTATION
// has an explicit rotation, use it; otherwise rotate between the
// king's override attack and the regular kind's attack.
function buildAttackRotation(kaijuKind) {
    if (KING_ATTACK_ROTATION[kaijuKind]?.length) {
        return [...KING_ATTACK_ROTATION[kaijuKind]];
    }
    const king = KING_ATTACK_OVERRIDES[kaijuKind];
    const regular = KIND_TO_ATTACK[kaijuKind];
    if (king && regular && king !== regular) return [king, regular];
    if (king) return [king];
    if (regular) return [regular];
    return [];
}

function buildKingSpec(kaijuKind) {
    const k = KAIJU_KINDS[kaijuKind];
    if (!k) return null;
    const rotation = buildAttackRotation(kaijuKind);
    if (rotation.length === 0) return null;
    // Use the first (king-tier) attack for headline stats; rotation
    // happens in BotManager at fire time.
    const primaryName = rotation[0];
    const primary = KAIJU_ATTACKS[primaryName];
    if (!primary) return null;

    const baseDamage = (primary.damage ?? 0.10) * (k.damageMul ?? 1.0) * KING_DAMAGE_SCALE;
    const range = Math.max(14, Math.min(40, primary.range ?? 25));
    const fireInterval = Math.max(0.6, (primary.cooldown ?? 2.5) * 0.5);

    return {
        hp:            KING_HP_BY_KIND[kaijuKind] ?? 24,
        speed:         KING_SPEED_BY_KIND[kaijuKind] ?? 2.0,
        sightRange:    Math.max(range + 10, 32),
        fireRange:     range,
        fireInterval,
        damage:        baseDamage,
        color:         k.color,
        scale:         (k.scale ?? 3.0) * KING_SCALE_RATIO * (k.absorbScale ?? 1.0),  // round 274
        // Tags for downstream recognition
        kaijuOrigin:   kaijuKind,
        isKing:        true,
        kingLabel:     KING_LABELS[kaijuKind] || `${kaijuKind.toUpperCase()} KING`,
        attackRotation: rotation,           // list of attack names
        attackName:    primaryName,         // headline (BotManager fallback)
        speech:        KING_SPEECH[kaijuKind] || {
            spawn:  "I am here.",
            engage: "End of the road.",
            death:  "...defeated.",
        },
    };
}

function buildKingKinds() {
    const out = {};
    for (const origin of Object.keys(KAIJU_KINDS)) {
        const spec = buildKingSpec(origin);
        if (spec) out[`bot_king_${origin}`] = spec;
    }
    return out;
}

export const KING_KAIJU_BOT_KINDS = buildKingKinds();
export const KING_KAIJU_BOT_KIND_NAMES = Object.keys(KING_KAIJU_BOT_KINDS);

export function pickRandomKingKind() {
    const names = KING_KAIJU_BOT_KIND_NAMES;
    return names[Math.floor(Math.random() * names.length)];
}

export function isKingBotKind(name) {
    return typeof name === "string" && name.startsWith("bot_king_");
}
