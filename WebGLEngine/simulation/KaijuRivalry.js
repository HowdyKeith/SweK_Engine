// FILE: /simulation/KaijuRivalry.js
// VERSION: v1 — round 287
//
// Faction-based kaiju-vs-kaiju targeting. Kaiju kinds belong to one
// of five FACTIONS, and certain faction pairs are rivals — within
// range, a kaiju will opportunistically launch its ranged attack at
// a rival kaiju (after exhausting civ / OGRE targets).
//
// FACTIONS (by kind keyword):
//   sky      — lightning, cloud kaiju
//   hell     — fire, demon, hellspawn
//   space    — plasma, void, kaiju from space
//   tech     — metal, alien-tech (round R37 backlog)
//   nature   — kaiju that grow/throw trees, swamp creatures
//
// RIVALRY MATRIX (one-way is symmetric here; both target each other):
//   sky ↔ hell      (lightning meets fire — classic)
//   space ↔ tech    (energy weapons fight each other)
//   nature ↔ hell   (nature opposes destruction)
//   sky ↔ space     (rival celestial powers)
//
// Same-faction kaiju never attack each other. Tier <2 kaiju are too
// small to engage ranged duels — they just stomp around the player.
//
// API:
//   const r = makeKaijuRivalry();
//   r.findRivalTarget(k, range, allKaiju) → target object | null
//   r.areRivals(kindA, kindB) → boolean
//   r.factionOf(kind) → "sky" | "hell" | "space" | "tech" | "nature" | "unknown"
//
// Target return shape matches _findRangedTarget contract:
//   { x, y, z, ref, _type: "kaiju", name, applyDamage(d) }

const FACTION_KEYWORDS = {
    sky:    ["lightning", "cloud", "thunder", "sky", "winged", "storm"],
    hell:   ["fire", "flame", "demon", "hell", "lava", "magma", "infernal", "spawn"],
    space:  ["plasma", "void", "cosmic", "star", "nebula", "alien", "extraterrestrial", "asteroid"],
    tech:   ["metal", "robot", "mech", "cyber", "drone", "synth", "tech"],
    nature: ["tree", "swamp", "moss", "vine", "forest", "spore", "fungal", "rooted", "leaf"],
};

const RIVALRIES = {
    sky:    ["hell", "space"],
    hell:   ["sky", "nature"],
    space:  ["tech", "sky"],
    tech:   ["space"],
    nature: ["hell"],
};

function _factionOf(kind) {
    if (!kind || typeof kind !== "string") return "unknown";
    const lower = kind.toLowerCase();
    for (const [faction, kws] of Object.entries(FACTION_KEYWORDS)) {
        for (const kw of kws) {
            if (lower.includes(kw)) return faction;
        }
    }
    return "unknown";
}

function _areRivals(a, b) {
    if (!a || !b || a === "unknown" || b === "unknown" || a === b) return false;
    const rivs = RIVALRIES[a];
    return !!rivs && rivs.includes(b);
}

export function makeKaijuRivalry() {
    // Tiny cache so we don't re-classify the same kind on every tick
    const factionCache = new Map();
    function factionOf(kind) {
        if (factionCache.has(kind)) return factionCache.get(kind);
        const f = _factionOf(kind);
        factionCache.set(kind, f);
        return f;
    }

    function areRivals(kindA, kindB) {
        return _areRivals(factionOf(kindA), factionOf(kindB));
    }

    // Find a rival kaiju within range. Returns null if none.
    // Tier <2 kaiju don't engage in ranged duels — they're too small
    // and the fight reads better when only the larger kinds clash.
    function findRivalTarget(k, range, allKaiju) {
        if (!k || !Array.isArray(allKaiju) || allKaiju.length < 2) return null;
        if ((k.tier ?? 0) < 2) return null;
        const myFaction = factionOf(k.kind);
        if (myFaction === "unknown") return null;
        const range2 = range * range;
        let best = null, bestD2 = range2;
        const kx = k.position?.x ?? 0;
        const ky = k.position?.y ?? 0;
        const kz = k.position?.z ?? 0;
        for (const other of allKaiju) {
            if (other === k) continue;
            if (!other.position) continue;
            if (other.state === "dying" || !other.isAlive?.()) continue;
            if ((other.tier ?? 0) < 1) continue;
            if (!_areRivals(myFaction, factionOf(other.kind))) continue;
            const dx = other.position.x - kx;
            const dy = other.position.y - ky;
            const dz = other.position.z - kz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; best = other; }
        }
        if (!best) return null;
        return {
            x: best.position.x,
            y: best.position.y,
            z: best.position.z,
            ref: best,
            _type: "kaiju",
            name: best.name ?? best.kind ?? "rival",
            applyDamage: (d) => {
                // Use the kaiju's energy bar directly. Scale damage down
                // a bit so kaiju-vs-kaiju doesn't trivialize boss fights
                // — they hurt each other ~70% of normal.
                const scaled = d * 0.7;
                best.energy = Math.max(0, (best.energy ?? 1) - scaled);
                best._lastDamageTime = best.age;
                best._lastAttacker = k;     // for retaliation aim
            },
        };
    }

    return { findRivalTarget, areRivals, factionOf };
}
