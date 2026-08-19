// FILE: world/kaijuNames.js
// VERSION: v1
//
// Procedural name generator for kaiju. Distinct register from civ
// names — heavier consonants, more mythic/guttural feel (Cthulhu /
// Godzilla register). Caller invokes once per spawn; the name
// persists on the entity for its lifetime.

const PREFIXES = [
    "Gor",   "Vrak",  "Kha",  "Nyx",  "Bru", "Mor", "Zar",  "Tia",
    "Khor",  "Drag",  "Yog",  "Tho",  "Ulm", "Reg", "Sath", "Ymir",
];

const ROOTS = [
    "thoth",  "tagath", "mog",  "dagon", "rax",   "vroth", "ula",
    "tlon",   "zoth",   "gar",  "shath", "ekath", "ogor",  "amara",
    "nyrax",  "kthul",
];

const SUFFIXES = [
    "", "", "",                          // bias toward shorter names
    "-rex", "-an", "-oth", "-ix",
    "-um", "-ar",
];

export function generateKaijuName() {
    const p = PREFIXES[(Math.random() * PREFIXES.length) | 0];
    const r = ROOTS[   (Math.random() * ROOTS.length)    | 0];
    const s = SUFFIXES[(Math.random() * SUFFIXES.length) | 0];
    return p + r + s;
}
