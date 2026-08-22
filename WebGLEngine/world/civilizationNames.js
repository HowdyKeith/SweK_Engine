// FILE: world/civilizationNames.js
// VERSION: v1
//
// Procedural name generator for civilizations. One name per civ
// instance, generated at birth, persisted on the entity for its
// lifetime. Mixes three syllable banks; ~2500 possible names so
// collisions are rare even at the 24-civ cap.

const PREFIXES = [
    "Vel", "Ket", "Or",  "Drav", "Tor", "Kal", "Ash", "Elv",
    "Mor", "Syn", "The", "Dav",  "Zor", "Quel", "Tyr", "Bal",
];

const ROOTS = [
    "thar", "orin", "vel",  "eth", "ar",  "oss", "ix", "an",
    "en",   "ock",  "ada",  "ova", "yr",  "im",  "ula", "endra",
];

const SUFFIXES = [
    "", "", "",                  // bias toward shorter names (prefix+root only)
    "ar", "us", "elle", "ana",
    "ix", "on", "esh",
];

export function generateCivilizationName() {
    const p = PREFIXES[(Math.random() * PREFIXES.length) | 0];
    const r = ROOTS[   (Math.random() * ROOTS.length)    | 0];
    const s = SUFFIXES[(Math.random() * SUFFIXES.length) | 0];
    return p + r + s;
}
