// FILE: simulation/kaijuAttacks.js
// VERSION: v1 (round 30)
//
// Round 30 — kaiju ranged-attack registry. Each kaiju kind gets a set
// of attack families with distinct visuals (color, projectile shape,
// AoE pattern) so the player can read what kind of damage is coming
// before they see who launched it.
//
// Three base SHAPES (existing CentipedeManager scaffolding):
//   beam       — instant hit + stretched mesh from kaiju to target
//   projectile — travels via ProjectileManager.launch()
//   aoe        — radial burst at target position
//
// Each named family maps to one of those shapes plus visual params.
// CentipedeManager queries this registry by attack name (e.g. "laser")
// rather than by raw shape, so all the visual variety lives here.
//
// To add a new attack: drop an entry into KAIJU_ATTACKS, then add the
// name to the appropriate kind's preset list in KIND_ATTACK_PRESETS.
//
// User-facing extras beyond the original 9: acid_spit, quill_barrage,
// sonic_scream, earthquake_stomp, meteor, EMP_burst, toxic_cloud,
// frost_shard, tractor_beam. Some are visually thin placeholders for
// future custom rendering; all damage correctly today.

// Each attack family entry:
//   shape:        "beam" | "projectile" | "aoe"
//   color:        hex hint for FX subscribers (kaijuAttackFx, etc.)
//   damage:       hit damage (per direct hit for projectile/beam,
//                 per target within radius for aoe)
//   range:        max distance kaiju will fire at this attack (world units)
//   fireInterval: [minMs, maxMs] random delay between shots of this kind
//   verb:         narration verb ("blasts", "spits", "calls down")
//   projectileKind: when shape=projectile, kind name passed to ProjectileManager
//   projectileScale: visual scale for the projectile
//   trail:        "smoke" | "spark" | "ice" | "magic" | null
//   beamScaleXY:  for shape=beam, thickness of the stretched obelisk
//   beamFadeMs:   for shape=beam, how long the visual lingers
//   aoeRadius:    for shape=aoe, world-unit damage radius
//   aoeBursts:    for shape=aoe, number of particles spawned
//   aoeParticleKind: visual kind for the burst particles
export const KAIJU_ATTACKS = {

    // ---- Beams (instant hit, visible line from kaiju to target) ----

    laser: {
        shape: "beam", color: "#ff3030", damage: 6, range: 40,
        fireInterval: [1800, 2800], verb: "lances",
        beamScaleXY: 0.10, beamFadeMs: 180,
    },
    ice_ray: {
        shape: "beam", color: "#80e8ff", damage: 4, range: 36,
        fireInterval: [2200, 3400], verb: "freezes",
        beamScaleXY: 0.20, beamFadeMs: 320,
    },
    plasma_beam: {
        shape: "beam", color: "#c060ff", damage: 8, range: 32,
        fireInterval: [2500, 3800], verb: "blasts",
        beamScaleXY: 0.26, beamFadeMs: 280,
    },
    lightning: {
        shape: "beam", color: "#fffacd", damage: 7, range: 50,
        fireInterval: [2000, 3200], verb: "strikes",
        beamScaleXY: 0.12, beamFadeMs: 140,
    },
    tractor_beam: {
        shape: "beam", color: "#5080ff", damage: 1, range: 28,
        fireInterval: [3000, 4500], verb: "ensnares",
        beamScaleXY: 0.22, beamFadeMs: 600,   // longer linger; intent is grappling
    },

    // ---- Projectiles (travel through space, ProjectileManager handles physics) ----

    fireball: {
        shape: "projectile", color: "#ff6020", damage: 10, range: 36,
        fireInterval: [2400, 3600], verb: "hurls a fireball at",
        projectileKind: "fireball", projectileScale: 0.7, trail: "smoke",
    },
    magic_orb: {
        shape: "projectile", color: "#a050ff", damage: 9, range: 34,
        fireInterval: [2800, 4000], verb: "casts magic at",
        projectileKind: "magic_orb", projectileScale: 0.5, trail: "spark",
    },
    frost_shard: {
        shape: "projectile", color: "#a0e8ff", damage: 6, range: 32,
        fireInterval: [1600, 2400], verb: "shards",
        projectileKind: "frost_shard", projectileScale: 0.4, trail: "ice",
    },
    plasma_orb: {
        shape: "projectile", color: "#e040c0", damage: 12, range: 30,
        fireInterval: [3000, 4500], verb: "fires plasma at",
        projectileKind: "plasma_orb", projectileScale: 0.8, trail: "spark",
    },
    acid_spit: {
        shape: "projectile", color: "#80ff20", damage: 5, range: 22,
        fireInterval: [1500, 2400], verb: "spits acid at",
        projectileKind: "acid_glob", projectileScale: 0.4, trail: "smoke",
    },
    quill_barrage: {
        // Quill barrage fires THREE projectiles in quick succession
        // (handled in CentipedeManager._fireProjectile by burstCount).
        shape: "projectile", color: "#806040", damage: 4, range: 28,
        fireInterval: [3500, 5000], verb: "barrages",
        projectileKind: "quill", projectileScale: 0.3, trail: null,
        burstCount: 3, burstSpacingMs: 90,
    },
    guns: {
        // Sustained rapid fire — short interval, low damage per shot.
        shape: "projectile", color: "#ffd040", damage: 3, range: 38,
        fireInterval: [600, 1100], verb: "guns down",
        projectileKind: "bullet", projectileScale: 0.2, trail: null,
        burstCount: 2, burstSpacingMs: 70,
    },

    // ---- AoE (radial burst at target's last-known position) ----

    radiation: {
        shape: "aoe", color: "#80ff60", damage: 4, range: 30,
        fireInterval: [3500, 5500], verb: "irradiates",
        aoeRadius: 5, aoeBursts: 16, aoeParticleKind: "kaiju_radiation",
    },
    flamethrower: {
        // Conceptually a cone — implemented as aoe with bigger radius
        // and forward-biased burst pattern. Tighter fire interval.
        shape: "aoe", color: "#ff8030", damage: 8, range: 18,
        fireInterval: [1800, 2800], verb: "torches",
        aoeRadius: 6, aoeBursts: 24, aoeParticleKind: "kaiju_flame",
    },
    earthquake_stomp: {
        shape: "aoe", color: "#806040", damage: 12, range: 14,
        fireInterval: [4500, 6500], verb: "stomps near",
        aoeRadius: 7, aoeBursts: 20, aoeParticleKind: "kaiju_dust",
    },
    toxic_cloud: {
        shape: "aoe", color: "#60c060", damage: 3, range: 24,
        fireInterval: [3000, 4500], verb: "envenoms",
        aoeRadius: 6, aoeBursts: 18, aoeParticleKind: "kaiju_toxin",
    },
    emp_burst: {
        // Tech-vs-tech disabler. Damage low but reaches farther.
        shape: "aoe", color: "#40e0ff", damage: 2, range: 32,
        fireInterval: [4000, 6000], verb: "EMPs",
        aoeRadius: 8, aoeBursts: 24, aoeParticleKind: "kaiju_emp",
    },
    sonic_scream: {
        shape: "aoe", color: "#fff080", damage: 5, range: 26,
        fireInterval: [3000, 4500], verb: "screams at",
        aoeRadius: 6, aoeBursts: 18, aoeParticleKind: "kaiju_sonic",
    },
    meteor: {
        // "Sky" attack — large radius, low fire rate. Visual lands at
        // target so it reads like a strike from above even though
        // implementation is a centered AoE.
        shape: "aoe", color: "#ff4020", damage: 18, range: 42,
        fireInterval: [6000, 9000], verb: "calls a meteor on",
        aoeRadius: 9, aoeBursts: 28, aoeParticleKind: "kaiju_meteor",
    },
};

// ---------------------------------------------------------------------------
// Kaiju kind → default attack family list. CentipedeManager picks at
// random from the list each shot, so a kaiju with multiple attacks
// stays unpredictable. Most kinds have 2-3 attacks for variety.
//
// Naming aligns with the engine's existing kaiju kinds (kaiju_space,
// kaiju_hell, kaiju_tech, kaiju_frost, kaiju_water, kaiju_sky,
// kaiju_cave, kaiju_underground, kaiju_ogre_hull). Map keys are the
// suffix only ("space" instead of "kaiju_space") so the consumer
// can resolve either form.
// ---------------------------------------------------------------------------

export const KIND_ATTACK_PRESETS = {
    // The original five tagged in the arc plan
    space:       ["plasma_orb", "plasma_beam", "radiation"],
    hell:        ["fireball", "magic_orb", "flamethrower"],
    tech:        ["laser", "emp_burst", "guns"],
    frost:       ["ice_ray", "frost_shard"],
    ice:         ["ice_ray", "frost_shard"],

    // Additional kinds — each gets a thematic mix
    water:       ["acid_spit", "sonic_scream"],       // tidal/sonar via existing shapes
    sky:         ["lightning", "meteor"],
    cave:        ["earthquake_stomp", "quill_barrage"],
    underground: ["earthquake_stomp", "toxic_cloud", "quill_barrage"],
    ogre_hull:   ["guns", "flamethrower"],            // mechanical/military
    centipede:   ["fireball", "acid_spit"],           // default for the existing centipede

    // Universal fallback — used if a kaiju's kind isn't in the map
    _default:    ["fireball", "radiation"],
};

// Lookup helper. Accepts the raw kind ("kaiju_space") or the suffix
// ("space"). Returns the attack name list for that kind, never null.
export function attacksForKind(kind) {
    if (!kind) return KIND_ATTACK_PRESETS._default;
    const suffix = String(kind).replace(/^kaiju_/, "");
    return KIND_ATTACK_PRESETS[suffix] || KIND_ATTACK_PRESETS._default;
}

// Lookup a single attack family. Returns null if unknown so callers
// can fall back to legacy behavior rather than crash.
export function getAttack(name) {
    return KAIJU_ATTACKS[name] || null;
}

// Total count of registered attack families. Useful for boot log + tests.
export function attackCount() {
    return Object.keys(KAIJU_ATTACKS).length;
}
