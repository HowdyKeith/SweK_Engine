// FILE: tools/wadThingSpawner.js
// VERSION: v1 — round 412 (WAD round)
//
// Turns a WAD map's THING list into LIVE entities in the voxel world.
// v379 (wadThings) produced placement specs but only ever fed the
// billboard manager — and nothing renders those quads in the main loop,
// so a loaded Doom map's monsters were invisible. This round closes the
// loop a different, cohesive way: instead of bolting on a separate Doom
// sprite renderer, the map's MONSTER placements spawn as actual KAIJU
// entities, which the engine already renders, animates, and runs AI for.
//
// The result: load a Doom map and its monster layout comes alive as a
// kaiju encounter sitting on the voxelized geometry — the WAD pipeline
// feeds the kaiju gameplay rather than being a parallel renderer.
//
// Doom monster class → kaiju kind + scale tier. The mapping is by
// "threat weight": small fodder → small fast kinds, heavies → big
// kinds, the two bosses → king-scale.
//
//   zombieman / shotgun_guy / chaingunner  → cave   (small grunts)
//   imp                                       → hell   (the iconic fireball thrower)
//   demon (pinky)                             → underground (melee bruiser)
//   baron                                      → hell   (large)
//   cyberdemon                                  → space  (king-scale boss)
//   spider_mastermind                            → sky    (king-scale boss)
//
// Items / weapons / powerups / decorations are ignored for now (no
// pickup system on the kaiju side); a later round can spawn those as
// prop meshes or wire a real pickup loop.
//
// USAGE:
//   import { spawnWadThingsAsKaiju } from "./tools/wadThingSpawner.js";
//   const placements = wad.things(map, { includeSpawns: false });
//   const res = spawnWadThingsAsKaiju(placements, kaijuManager, {
//       maxKaiju: 24,       // safety cap
//       scaleMul: 1.0,       // global scale multiplier
//   });
//   // res = { spawned, skipped, byKind, ids }

// Doom monster label → { kind, tier }. tier scales the kaiju's size so
// a room of zombiemen reads as a swarm and a cyberdemon reads as a boss.
const MONSTER_MAP = {
    zombieman:         { kind: "cave",        tier: 0.55 },
    shotgun_guy:       { kind: "cave",        tier: 0.6 },
    chaingunner:       { kind: "cave",        tier: 0.65 },
    imp:               { kind: "hell",        tier: 0.7 },
    demon:             { kind: "underground", tier: 0.85 },
    baron:             { kind: "hell",        tier: 1.3 },
    cyberdemon:        { kind: "space",       tier: 2.2 },   // boss
    spider_mastermind: { kind: "sky",         tier: 2.4 },   // boss
};

const DEFAULT_MONSTER = { kind: "underground", tier: 0.8 };  // unrecognized monster fallback

/**
 * Spawn a map's monster THINGs as live kaiju.
 *
 * @param {Array}  placements   from wadThings.thingsToPlacements(map, ...)
 *                              each: { kind, label, x, y, z, angle, ... }
 *                              (here `kind` is the THING category:
 *                               "monster" | "item" | "weapon" | ...)
 * @param {Object} kaijuManager must expose _spawn({x,y,z,kind,scaleMul?})
 *                              and a `kaiju` Map (for the cap check).
 * @param {Object} [opts]
 * @param {number} [opts.maxKaiju=24]   safety cap on how many to spawn
 * @param {number} [opts.scaleMul=1.0]  global scale multiplier on tier
 * @param {boolean}[opts.bosses=true]   include cyberdemon/mastermind
 * @param {Function}[opts.onSpawn]      called with (kaiju, placement)
 * @returns {{ spawned:number, skipped:number, byKind:Object, ids:Array }}
 */
export function spawnWadThingsAsKaiju(placements, kaijuManager, opts = {}) {
    const maxKaiju = opts.maxKaiju ?? 24;
    const scaleMul = opts.scaleMul ?? 1.0;
    const bosses   = opts.bosses ?? true;

    const out = { spawned: 0, skipped: 0, byKind: {}, ids: [] };
    if (!Array.isArray(placements) || !kaijuManager?._spawn) {
        console.warn("[wadThingSpawner] bad placements or kaijuManager — nothing spawned");
        return out;
    }

    // Monsters only. Sort so bosses spawn first (they get priority under
    // the cap), then by descending tier so the cap keeps the scariest.
    const monsters = placements
        .filter(p => p.kind === "monster")
        .map(p => ({ p, spec: MONSTER_MAP[p.label] ?? DEFAULT_MONSTER }))
        .sort((a, b) => b.spec.tier - a.spec.tier);

    const existing = kaijuManager.kaiju?.size ?? 0;
    let budget = Math.max(0, maxKaiju - existing);

    for (const { p, spec } of monsters) {
        const isBoss = spec.tier >= 2.0;
        if (isBoss && !bosses) { out.skipped++; continue; }
        if (budget <= 0) { out.skipped++; continue; }

        const kaiju = kaijuManager._spawn({
            x: p.x, y: p.y, z: p.z,
            kind: spec.kind,
        });
        if (!kaiju) { out.skipped++; continue; }

        // Size by threat tier. _spawn() doesn't take a scale arg, but
        // Kaiju.absorbScale (round 274) multiplies the base kind scale —
        // so a zombieman reads small and a cyberdemon reads boss-size.
        if (kaiju.absorbScale != null) kaiju.absorbScale = spec.tier * scaleMul;

        budget--;
        out.spawned++;
        out.byKind[spec.kind] = (out.byKind[spec.kind] ?? 0) + 1;
        if (kaiju.id != null) out.ids.push(kaiju.id);
        if (typeof opts.onSpawn === "function") opts.onSpawn(kaiju, p);
    }

    console.log(`[wadThingSpawner] spawned ${out.spawned} kaiju from ${monsters.length} ` +
                `monster THINGs (skipped ${out.skipped}, cap ${maxKaiju}) —`, out.byKind);
    return out;
}

/**
 * Preview what would spawn without spawning. Useful for the Doom panel
 * to show "this map → 12 cave, 4 hell, 1 space boss" before committing.
 */
export function previewWadThingSpawn(placements, opts = {}) {
    const bosses = opts.bosses ?? true;
    const byKind = {}, byLabel = {};
    let total = 0;
    for (const p of placements ?? []) {
        if (p.kind !== "monster") continue;
        const spec = MONSTER_MAP[p.label] ?? DEFAULT_MONSTER;
        if (spec.tier >= 2.0 && !bosses) continue;
        byKind[spec.kind]  = (byKind[spec.kind]  ?? 0) + 1;
        byLabel[p.label]   = (byLabel[p.label]   ?? 0) + 1;
        total++;
    }
    return { total, byKind, byLabel };
}

/** Exported for tests / tools that want to inspect the mapping. */
export function getMonsterMap() { return { ...MONSTER_MAP, _default: DEFAULT_MONSTER }; }
