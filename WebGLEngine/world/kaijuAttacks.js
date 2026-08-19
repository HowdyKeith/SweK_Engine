// FILE: world/kaijuAttacks.js
// VERSION: v1
//
// Round 30 — kaiju ranged attacks. Each kaiju kind has a signature
// attack type. Mechanics fall into three families:
//
//   beam       — instant hit, particle stream visualizes path,
//                damage applied immediately on cooldown
//   projectile — uses ProjectileManager (existing round 21 system),
//                physics arc + impact carving
//   aoe        — expanding ring of particles, area damage
//
// Sprite ids reference SpriteAtlas indices used by the particle
// system: 0=CIRCLE, 1=SMOKE, 2=SPARK, 3=DUST, 4=EMBER, 5=GLYPH,
// 6=HALO, 7=RUNE.

export const SPRITE = {
    CIRCLE: 0, SMOKE: 1, SPARK: 2, DUST: 3,
    EMBER:  4, GLYPH: 5, HALO: 6, RUNE: 7,
};

//
// v829 — Optional `originBone` field per attack: when a kaiju entity has
// a rig bridge attached (via window.entityRig.attach) and the rig contains
// a bone with the named id, particle origins resolve to that bone's world
// position instead of bot.x + 1.5y. Falls through to bot center when no
// bone is resolvable. Standard bone names used here: "mouth", "eye",
// "claw_l", "claw_r", "tail_tip".
//
export const KAIJU_ATTACKS = {
    // Sky kaiju → vertical lightning strike from cloud height down to
    // target. 12 GLYPH particles in a column, instant damage, dramatic.
    "lightning": {
        originBone: "head",     // v830 — called down from above the kaiju head
        family: "beam",
        cooldown: 4.0,
        range: 35,
        damage: 0.05,
        color:  [1.0, 1.0, 0.4],
        sprite: SPRITE.GLYPH,
        narrativeVerb: "calls down lightning on",
    },

    // Hell kaiju → fireball projectile with ember trail. Carves
    // voxels on impact like tree throws, smaller splash.
    "fireball": {
        originBone: "mouth",      // v829 — particles spawn from mouth bone when rig is bound
        family: "projectile",
        cooldown: 3.5,
        range: 30,
        damage: 0.45,
        color:  [1.0, 0.45, 0.10],
        sprite: SPRITE.EMBER,
        projectileKind: "fireball",
        scale:  0.9,
        narrativeVerb: "hurls a fireball at",
    },

    // Space kaiju → slow plasma orb. Bigger, brighter, distinct
    // pacing from the fast fireball.
    "plasma": {
        originBone: "mouth",      // v829
        family: "projectile",
        cooldown: 5.0,
        range: 38,
        damage: 0.55,
        color:  [0.55, 0.85, 1.0],
        sprite: SPRITE.HALO,
        projectileKind: "plasma_orb",
        scale:  1.2,
        narrativeVerb: "fires a plasma bolt at",
    },

    // Water + frost kaiju → ice ray beam. Cyan particle stream from
    // kaiju to target, instant damage, no impact carving.
    "ice_ray": {
        originBone: "mouth",      // v829
        family: "beam",
        cooldown: 2.5,
        range: 26,
        damage: 0.04,
        color:  [0.7, 0.95, 1.0],
        sprite: SPRITE.SPARK,
        narrativeVerb: "freezes",
    },

    // Underground kaiju → radiation pulse. Expanding ring of particles
    // around the kaiju. Damages anything in radius (not just primary
    // target — area attack).
    "rad_pulse": {
        originBone: "chest",     // v830
        family: "aoe",
        cooldown: 7.0,
        range: 18,           // both detection range AND splash radius
        damage: 0.08,
        color:  [0.65, 1.0, 0.45],
        sprite: SPRITE.RUNE,
        narrativeVerb: "emits a radiation pulse near",
    },

    // Cave kaiju → rapid rock spike volleys. Smaller projectiles,
    // shorter cooldown, less damage per hit but more frequent.
    "rock_spike": {
        originBone: "claw_r",  // v830 — summoning gesture
        family: "projectile",
        cooldown: 2.2,
        range: 22,
        damage: 0.25,
        color:  [0.55, 0.5, 0.45],
        sprite: SPRITE.DUST,
        projectileKind: "rock_spike",
        scale:  0.7,
        narrativeVerb: "hurls a stone spike at",
    },

    // Round 35 — water-themed spells. All AoE family, distinct
    // visual signatures.

    // TIDAL_WAVE — sweeping wall of water voxels rushing toward
    // target. Visualized as a long line of large blue droplets
    // streaking from kaiju toward target, tightly packed.
    "tidal_wave": {
        family: "aoe",
        cooldown: 5.5,
        range: 32,
        damage: 0.35,
        color:  [0.30, 0.65, 0.95],
        sprite: SPRITE.CIRCLE,
        narrativeVerb: "summons a tidal wave at",
        // AoE-flavor metadata read by KaijuManager._executeAoEAttack
        aoeStyle: "wave",          // sweeping line vs default ring
        waterEffect: "tidalWave",  // v2240 - drives window.waterField: a real wall of water sweeps the lake toward the target
        particleCount: 40,
    },

    // DELUGE — heavy localized rainfall. AoE cloud of falling water
    // particles drifting down into target zone for a sustained 2s.
    "deluge": {
        family: "aoe",
        cooldown: 8.0,
        range: 16,
        damage: 0.10,
        color:  [0.50, 0.70, 1.00],
        sprite: SPRITE.SPARK,
        narrativeVerb: "calls down a deluge upon",
        aoeStyle: "rain",
        waterEffect: "deluge",     // v2240 - a downpour of splashes across the target zone on real water
        particleCount: 60,
    },

    // TYPHOON — rotating spiral of debris around the target. Particles
    // orbit center then close inward, dealing damage as they hit.
    "typhoon": {
        family: "aoe",
        cooldown: 6.5,
        range: 22,
        damage: 0.20,
        color:  [0.75, 0.85, 0.90],
        sprite: SPRITE.DUST,
        narrativeVerb: "spins a typhoon over",
        aoeStyle: "vortex",
        waterEffect: "vortex",     // v2240 - a rotating ring of splashes churns the water
        particleCount: 48,
    },

    // PLAGUE — lingering toxic green cloud. Slow damage but big visual.
    "plague": {
        family: "aoe",
        cooldown: 10.0,
        range: 14,
        damage: 0.06,
        color:  [0.55, 0.95, 0.40],
        sprite: SPRITE.SMOKE,
        narrativeVerb: "spreads plague across",
        aoeStyle: "miasma",
        particleCount: 32,
    },
    // Round 37 — tech alien race signature attack. Narrow blue beam,
    // faster cadence than lightning, lower per-hit damage. DPS-over-time.
    "ion_lance": {
        originBone: "eye",        // v829 — beam from eye bone
        family: "beam",
        cooldown: 2.5,
        range: 36,
        damage: 0.06,
        color:  [0.55, 0.85, 1.00],
        sprite: SPRITE.SPARK,
        narrativeVerb: "lances with an ion beam at",
    },
    // Round 45 — flamethrower.
    "flamethrower": {
        originBone: "mouth",  // v829
        family: "beam",
        cooldown: 1.4,
        range: 22,
        damage: 0.10,
        color:  [1.00, 0.55, 0.10],
        sprite: SPRITE.EMBER,
        narrativeVerb: "engulfs in flame",
    },
    // Round 14 — conventional machinegun.
    "machinegun_volley": {
        originBone: "claw_r",  // v829 — from right claw
        family: "beam",
        cooldown: 0.7,
        range: 32,
        damage: 0.04,
        color:  [1.00, 0.85, 0.35],
        sprite: SPRITE.SPARK,
        burstCount: 6,
        burstSpread: 0.6,
        narrativeVerb: "rakes with machinegun fire",
    },
    // Round 15 — meteor strike. King-tier sky attack. A glowing
    // projectile drops from very high altitude (90u) onto target
    // with a slight delay; impact carves a crater. Ground impact
    // creates large radial particle burst.
    "meteor": {
        family: "projectile",
        cooldown: 8.0,
        range: 50,
        damage: 1.0,
        color:  [1.00, 0.55, 0.20],
        sprite: SPRITE.EMBER,
        projectileKind: "meteor",
        scale:  1.8,
        meteorAltitude: 90,           // launches from far above target
        narrativeVerb: "calls down a meteor on",
    },
    // Round 15 — soul drain. Hell-king attack. Beam family that
    // also spawns reverse-flowing particles from victim back to
    // caster, visualizing energy theft. Heals caster slightly.
    "soul_drain": {
        originBone: "claw_r",  // v830
        family: "beam",
        cooldown: 4.5,
        range: 28,
        damage: 0.18,
        color:  [0.85, 0.20, 0.85],
        sprite: SPRITE.GLYPH,
        narrativeVerb: "drains the soul of",
        soulDrain: true,
        healFactor: 0.5,
    },
    // Round 15 — shadow bolt. Hell-king alt. Fast dark projectile.
    "shadow_bolt": {
        originBone: "claw_r",    // v829
        family: "projectile",
        cooldown: 2.0,
        range: 36,
        damage: 0.55,
        color:  [0.45, 0.10, 0.65],     // dark violet
        sprite: SPRITE.HALO,
        projectileKind: "shadow_bolt",
        scale: 0.7,
        narrativeVerb: "hurls a shadow bolt at",
    },
    // Round 15 — geyser. Vertical water column erupts under target
    // for ~2s. Particles spew vertically from target's ground level.
    "geyser": {
        family: "aoe",
        cooldown: 7.0,
        range: 24,
        damage: 0.20,
        color:  [0.40, 0.75, 1.00],
        sprite: SPRITE.SPARK,
        narrativeVerb: "summons a geyser under",
        aoeStyle: "geyser",
        particleCount: 50,
    },
    // Round 50 — hell magic spell, distinct from fireball/flamethrower.
    // Lingering dark-violet curse cloud that drifts on the target zone
    // and ticks low damage for several seconds. Reuses the "miasma"
    // aoeStyle particle pattern with violet+rune sprite.
    "hell_curse": {
        originBone: "claw_r",  // v830
        family: "aoe",
        cooldown: 9.0,
        range: 20,
        damage: 0.14,
        color:  [0.65, 0.18, 0.85],
        sprite: SPRITE.RUNE,
        narrativeVerb: "lays a curse on",
        aoeStyle: "miasma",
        particleCount: 40,
    },
    // Round 50 — cave-king signature. Vertical dust column erupts at
    // target plus a spreading ring of debris at ground level. Hits
    // hard, slow cooldown. Visually unmistakable.
    "tremor": {
        originBone: "foot_l",     // v830 — stomp
        family: "aoe",
        cooldown: 6.5,
        range: 26,
        damage: 0.32,
        color:  [0.55, 0.50, 0.45],
        sprite: SPRITE.DUST,
        narrativeVerb: "shatters the ground beneath",
        aoeStyle: "ring",
        particleCount: 40,
    },
    // Round 122 — SWARM_VOLLEY. Fast tiny projectile burst — fires a
    // sequence of micro-spikes in a cone. Lower per-hit damage than
    // rock_spike but multiple hits per fire event. Reads as an insect-
    // or swarm-themed attack. Pairs with tech/cave as a secondary.
    "swarm_volley": {
        originBone: "mouth", // v830 — swarm bursts from mouth
        family: "projectile",
        cooldown: 1.8,
        range: 24,
        damage: 0.18,
        color:  [0.85, 0.85, 0.5],
        sprite: SPRITE.SPARK,
        projectileKind: "rock_spike",
        scale:  0.5,
        burstCount: 5,           // launch this many micro-spikes
        burstSpread: 0.35,
        narrativeVerb: "unleashes a swarm volley at",
    },
    // Round 122 — SHOCKWAVE. Single AoE pulse that radiates outward
    // from the kaiju's feet. Faster cooldown than rad_pulse, smaller
    // radius, more visceral particles. Pairs with sky/underground.
    "shockwave": {
        originBone: "foot_r",     // v830 — ground slam
        family: "aoe",
        cooldown: 4.5,
        range: 14,
        damage: 0.18,
        color:  [0.90, 0.80, 0.55],
        sprite: SPRITE.DUST,
        narrativeVerb: "slams a shockwave under",
        aoeStyle: "ring",
        particleCount: 36,
    },

    // v769 (round 30 follow-up) — five new attack families wired in
    // from simulation/kaijuAttacks.js so real kaiju get the variety
    // CentipedeManager has been showing off since v767. Field names
    // match the existing registry shape; statusEffect is optional and
    // read by the new status effect system (simulation/statusEffects.js).

    // Hell/space arcane sibling to fireball — magic orb projectile
    // with spark trail, slightly slower, slightly bigger damage.
    "magic_orb": {
        originBone: "claw_l",      // v829
        family: "projectile",
        cooldown: 3.8,
        range: 32,
        damage: 0.42,
        color:  [0.63, 0.31, 1.00],
        sprite: SPRITE.SPARK,
        projectileKind: "magic_orb",
        scale: 0.7,
        narrativeVerb: "casts magic at",
    },

    // Acid spit — rapid short-range projectile that applies a
    // corrosion DoT (damage-over-time) status to the target on hit.
    "acid_spit": {
        originBone: "mouth",   // v829
        family: "projectile",
        cooldown: 2.0,
        range: 22,
        damage: 0.22,
        color:  [0.50, 1.00, 0.13],
        sprite: SPRITE.SPARK,
        projectileKind: "acid_glob",
        scale: 0.5,
        narrativeVerb: "spits acid at",
        // v769 status-effect metadata. Status system reads this on hit.
        statusEffect: {
            type: "acid",
            duration: 4.0,        // seconds
            ticksPerSec: 2,
            damagePerTick: 0.06,  // small repeated damage
        },
    },

    // Sonic scream — AoE sound wave. Wider radius than rad_pulse but
    // shorter cooldown. Applies "concussed" slow effect.
    "sonic_scream": {
        originBone: "mouth",  // v829
        family: "aoe",
        cooldown: 4.5,
        range: 24,
        damage: 0.20,
        color:  [1.00, 0.94, 0.50],
        sprite: SPRITE.GLYPH,
        narrativeVerb: "screams at",
        aoeStyle: "ring",
        particleCount: 30,
        statusEffect: {
            type: "slow",
            duration: 3.0,
            slowMul: 0.5,         // halves cooldown speed / move speed
        },
    },

    // EMP burst — tech kaiju anti-defender. Low damage, wider radius,
    // applies "disabled" status that prevents attacks for a few seconds.
    "emp_burst": {
        originBone: "chest",   // v830 — radial from chest
        family: "aoe",
        cooldown: 6.5,
        range: 30,
        damage: 0.08,
        color:  [0.25, 0.88, 1.00],
        sprite: SPRITE.HALO,
        narrativeVerb: "EMPs",
        aoeStyle: "ring",
        particleCount: 32,
        statusEffect: {
            type: "disabled",
            duration: 3.5,
        },
    },

    // Meteor — sky/space heavy AoE. Long cooldown, biggest damage,
    // wider radius. Used by king or sky kaiju.
    "meteor": {
        family: "aoe",
        cooldown: 8.0,
        range: 42,
        damage: 0.75,
        color:  [1.00, 0.25, 0.13],
        sprite: SPRITE.EMBER,
        narrativeVerb: "calls a meteor on",
        aoeStyle: "ring",
        particleCount: 48,
    },
    // v770 — tractor beam. Beam-family attack that drags the target
    // toward the caster via the new "pulled" status effect. Tech/space
    // flavored; pulls slowly (3u/sec) so it's a threat without being a
    // hard-yank. Requires target.moveBy() — defenders in the city demo
    // implement it; civs and kaiju silently ignore.
    "tractor_beam": {
        originBone: "eye",  // v830
        family: "beam",
        cooldown: 5.0,
        range: 30,
        damage: 0.05,
        color:  [0.31, 0.50, 1.00],
        sprite: SPRITE.SPARK,
        narrativeVerb: "ensnares",
        statusEffect: {
            type: "pulled",
            duration: 2.5,
            pullPerSec: 3,
        },
    },
    // Round 156 — earlier code had an orphaned attack-spec block here
    // (missing key) that prematurely closed KAIJU_ATTACKS. Removed.
    // If you want a heavier earthshake variant, add a new keyed entry:
    //   "earthshake": { family: "aoe", cooldown: 6.0, range: 18,
    //                   damage: 0.30, color: [0.55,0.45,0.35],
    //                   sprite: SPRITE.DUST, aoeStyle: "tremor",
    //                   particleCount: 56,
    //                   narrativeVerb: "triggers a tremor under" },
};

// Map kaiju kind → attack name. Modded kinds can override via the
// kaiju_attack mod type (see ModLoader).
export const KIND_TO_ATTACK = {
    sky:         "lightning",
    hell:        "fireball",
    space:       "plasma",
    water:       "tidal_wave",   // round 35 — was ice_ray
    frost:       "ice_ray",      // mod kind from round 26 example
    underground: "rad_pulse",
    cave:        "rock_spike",
    tech:        "ion_lance",    // round 37
};

// v834 — KIND_TO_RIG: maps kaiju kind to its rig template (one of the
// templates in rig/templates/). When a kaiju spawns with a kind in this
// map AND its mesh is rigged, BotManager auto-attaches the rig so
// attack origins resolve to the right anatomical bones automatically.
// Kinds NOT in this map (or with no matching template) keep the default
// behavior (attacks spawn from bot.y + 1.5).
export const KIND_TO_RIG = {
    sky:         "winged",      // flying kaiju — wings + tail
    hell:        "biped",       // humanoid demon
    space:       "biped",       // alien with arms
    water:       "serpent",     // sea creature
    frost:       "quadruped",   // yeti / four-legged beast
    underground: "quadruped",   // burrowing
    cave:        "quadruped",   // cave-dweller
    tech:        "biped",       // robotic biped
};

// Round 122 — secondary attack per kind. Regular (non-king) kaiju now
// alternate between primary and alt attacks via k._attackRotIdx,
// giving each kaiju more variety even without king promotion. Kings
// continue to use KING_ATTACK_OVERRIDES / KING_ATTACK_ROTATION which
// take priority. Picked to feel thematic with the kind:
//   sky          → thunder_clap analog via shockwave (vibration vs strike)
//   hell         → flamethrower (sustained close burst vs ranged fireball)
//   space        → machinegun_volley (kinetic kinetic kinetic)
//   water        → geyser (vertical surge vs horizontal wave)
//   frost        → shockwave (ice crack)
//   underground  → shockwave (seismic pair)
//   cave         → swarm_volley (rapid spikes vs heavy spike)
//   tech         → swarm_volley (gattling beam pulses)
//
// v769 — third entry per kind via KIND_TO_ATTACK_ALT2 (rotation cycles
// through primary → alt → alt2). Surfaces the new attack families to
// real kaiju so the v767 registry expansion is actually used.
export const KIND_TO_ATTACK_ALT = {
    sky:         "shockwave",
    hell:        "flamethrower",
    space:       "machinegun_volley",
    water:       "geyser",
    frost:       "shockwave",
    underground: "shockwave",
    cave:        "swarm_volley",
    tech:        "swarm_volley",
};

// v769 — third attack per kind. Drives kaiju further away from
// firing the same attack twice in a row. Picked to introduce the
// new families: hell→magic_orb, tech→emp_burst, water→sonic_scream,
// underground→acid_spit, sky→meteor, etc.
// v771 — space switched from meteor (duplicate of sky's) to tractor_beam
// so the new pull mechanic actually appears in rotation. Tractor beam
// drags tanks/planes toward the caster — fits space-kaiju flavor.
export const KIND_TO_ATTACK_ALT2 = {
    sky:         "meteor",
    hell:        "magic_orb",
    space:       "tractor_beam",
    water:       "sonic_scream",
    frost:       "sonic_scream",
    underground: "acid_spit",
    cave:        "acid_spit",
    tech:        "emp_burst",
};

// Round 45 — kings get scarier attacks. When a kaiju becomes king
// (round 36 promotion), the lookup pivots here. Uses the unmapped
// "weather" attacks (deluge/typhoon/plague) for narrative weight.
// Falls through to the kind's regular attack if the king has no
// override.
// Round 50 — hell + cave kings upgraded. hell king now alternates
// between flamethrower and hell_curse via KING_ATTACK_ROTATION; cave
// king gets the new tremor (was unchanged at rock_spike).
export const KING_ATTACK_OVERRIDES = {
    sky:         "typhoon",       // rotating debris storm
    hell:        "flamethrower",  // primary; rotation adds hell_curse + magic_orb
    space:       "tractor_beam",  // v773 — kings space-grapple defenders (was plasma)
    water:       "deluge",        // sustained downpour
    frost:       "ice_ray",       // unchanged
    underground: "plague",        // sustained drain cloud
    cave:        "tremor",        // round 50 — was rock_spike
    tech:        "emp_burst",     // v773 — kings carry EMP (was ion_lance)
};

// Round 50 — optional rotation. When a king has 2+ attacks, the
// _tickRangedAttack code can alternate them so the kaiju doesn't spam
// the same effect. Keys are kaiju kinds; values are arrays of attack
// names in fire order.
// v773 — expanded rotations using new families so kings feel scarier
// than non-kings via VARIETY (not just damage). Each king now has 2-3
// attacks in rotation.
export const KING_ATTACK_ROTATION = {
    hell:        ["flamethrower", "hell_curse", "magic_orb"],
    space:       ["plasma", "tractor_beam", "meteor"],
    underground: ["plague", "acid_spit", "rad_pulse"],
    water:       ["deluge", "sonic_scream", "tidal_wave"],
    frost:       ["ice_ray", "sonic_scream"],
    tech:        ["ion_lance", "emp_burst"],
    sky:         ["typhoon", "lightning", "meteor"],
};

export function getAttackForKind(kindName) {
    const attackName = KIND_TO_ATTACK[kindName];
    return attackName ? KAIJU_ATTACKS[attackName] : null;
}

// Round 45 — king-aware lookup. Pass the kaiju, not just the kind,
// so the registry can read becameKing for the upgrade.
// Round 50 — if the kaiju is a king AND a rotation list exists for its
// kind, alternate through the rotation using k._kingAttackRotIdx
// (initialized + bumped here so callers don't need to know about it).
// Round 122 — non-kings ALSO rotate (primary ↔ alt) for variety, using
// k._attackRotIdx. Kings still take priority via KING_ATTACK_OVERRIDES.
export function getAttackForKaiju(k) {
    if (!k) return null;
    if (k.becameKing) {
        const rot = KING_ATTACK_ROTATION[k.kind];
        if (Array.isArray(rot) && rot.length > 0) {
            const idx = (k._kingAttackRotIdx ?? 0) % rot.length;
            const name = rot[idx];
            return name ? KAIJU_ATTACKS[name] : null;
        }
        const name = KING_ATTACK_OVERRIDES[k.kind] || KIND_TO_ATTACK[k.kind];
        return name ? KAIJU_ATTACKS[name] : null;
    }
    // Non-king rotation: primary / alt / alt2 (v769 expanded from 2-deep to
    // 3-deep). Cycles k._attackRotIdx mod (number of available attacks).
    const primary = KIND_TO_ATTACK[k.kind];
    const alt = KIND_TO_ATTACK_ALT[k.kind];
    const alt2 = KIND_TO_ATTACK_ALT2[k.kind];
    const rotation = [primary, alt, alt2].filter(Boolean);
    if (rotation.length > 1) {
        const idx = (k._attackRotIdx ?? 0) % rotation.length;
        const name = rotation[idx];
        return name ? KAIJU_ATTACKS[name] : null;
    }
    return primary ? KAIJU_ATTACKS[primary] : null;
}

// Round 50 — advance the rotation index on a king after a successful
// fire. Lives here so the rotation policy is co-located with the data.
// No-op for non-kings or kinds without a rotation.
// Round 122 — also advance the non-king rotation when an alt exists.
export function advanceKingAttackRotation(k) {
    if (!k) return;
    if (k.becameKing) {
        const rot = KING_ATTACK_ROTATION[k.kind];
        if (Array.isArray(rot) && rot.length > 1) {
            k._kingAttackRotIdx = ((k._kingAttackRotIdx ?? 0) + 1) % rot.length;
        }
        return;
    }
    // Non-king: cycle the FULL rotation. PATCH-B8 fix: this advanced
    // % 2 while getAttackForKaiju indexes a 3-deep rotation (v769), so
    // the index never reached 2 and every alt2 attack (meteor, magic_orb,
    // tractor_beam, sonic_scream, acid_spit, emp_burst) was unreachable
    // for non-king kaiju. Modulo the actual rotation length instead.
    const rotLen = [KIND_TO_ATTACK[k.kind], KIND_TO_ATTACK_ALT[k.kind], KIND_TO_ATTACK_ALT2[k.kind]]
        .filter(Boolean).length;
    if (rotLen > 1) {
        k._attackRotIdx = ((k._attackRotIdx ?? 0) + 1) % rotLen;
    }
}

// Mod hook — register a new attack or override an existing one
export function registerAttack(name, spec) {
    if (!name || !spec) return false;
    KAIJU_ATTACKS[name] = spec;
    return true;
}

// Mod hook — bind a kaiju kind to an attack (for kind-specific overrides)
export function bindKindAttack(kind, attackName) {
    if (!kind || !attackName) return false;
    KIND_TO_ATTACK[kind] = attackName;
    return true;
}


// PATCH-B8 -- every spec knows its own registry name (the ranged-attack
// event previously reported KIND_TO_ATTACK[kind] regardless of what the
// rotation or king override actually fired).
for (const _n of Object.keys(KAIJU_ATTACKS)) KAIJU_ATTACKS[_n].name = _n;

// PATCH-B8 -- the legal attack set for a kaiju RIGHT NOW: the king
// rotation when promoted (falling through to override/primary), else the
// primary/alt/alt2 rotation. Single source of truth shared by the GPU
// brain snapshot (main.js publisher) and the manager's validation of
// brain suggestions -- the brain can only ever pick something this
// function returns.
export function availableAttacksFor(k) {
    if (!k) return [];
    let names;
    if (k.becameKing) {
        const rot = KING_ATTACK_ROTATION[k.kind];
        names = (Array.isArray(rot) && rot.length > 0)
            ? rot
            : [KING_ATTACK_OVERRIDES[k.kind] || KIND_TO_ATTACK[k.kind]];
    } else {
        names = [KIND_TO_ATTACK[k.kind], KIND_TO_ATTACK_ALT[k.kind], KIND_TO_ATTACK_ALT2[k.kind]];
    }
    const out = [];
    for (const n of names) {
        if (n && KAIJU_ATTACKS[n]) out.push(KAIJU_ATTACKS[n]);
    }
    return out;
}
