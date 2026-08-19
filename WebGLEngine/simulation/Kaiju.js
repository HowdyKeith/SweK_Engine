// FILE: simulation/Kaiju.js
// VERSION: v3 — multi-type targets (civ OR kaiju)
//
// v3 widens target selection to include other kaiju. When two kaiju
// are both alive and in range, they target each other (predators are
// territorial). Combat between kaiju has its own damage profile —
// higher mutual damage than vs civs since kaiju are tougher targets
// that actually fight back.
//
// Target shape: { type: "civ" | "kaiju", ref: <object> }
//   * type "civ"   → ref is a CivilizationEntity, ref.center is position
//   * type "kaiju" → ref is another Kaiju, ref.position is position
//
// The state machine is unchanged from v2, but engagement now branches
// on target type for damage application. Victory over another kaiju
// sets `_lastVictim` so the manager can publish a kaiju_victory event
// after the tick completes.

import { generateKaijuName } from "../world/kaijuNames.js";
import { pickKindConfig }     from "../world/kaijuKinds.js";

const ENGAGE_RANGE         = 6;
const CIV_HIT_BASE         = 0.10;
const COUNTER_HIT          = 0.012;     // kaiju takes from a civ
const KAIJU_HIT_BASE       = 0.06;      // damage between kaiju (per tick)
const KAIJU_COUNTER_HIT    = 0.06;      // mirror — kaiju duels are mutual
const PASSIVE_DECAY        = 0.003;
const KILL_REGEN_CIV       = 0.35;
const KILL_REGEN_KAIJU     = 0.55;      // bigger reward for kaiju kill
const DAMAGE_VOXEL_R       = 4;

export class Kaiju {

    constructor(id, opts) {
        this.id   = id;
        this.name = generateKaijuName();
        this.kind = opts.kind ?? "sky";
        this.config = pickKindConfig(this.kind);
        this.origin = this.config.origin;

        this.position    = { x: opts.x, y: opts.y, z: opts.z };
        this.target      = null;        // { type, ref } when engaging
        this.targetCivId = opts.targetCivId ?? null;

        // Round 10 — allegiance to a patron civ. When set, kaiju
        // never targets that civ, and treats other kaiju with the
        // same allegiance as allies (won't fight them).
        this.allegiance       = opts.allegiance      ?? null;
        this.allegianceColor  = opts.allegianceColor ?? null;

        // Round 158 — path planning state for ground kaiju. _path is a
        // list of {x,z,y} waypoints from the planner; _pathIdx points
        // at the next one. Flying/swimming kaiju leave these null and
        // use the straight-line greedy move as before.
        this._path        = null;
        this._pathIdx     = 0;
        this._pathTargetX = null;
        this._pathTargetZ = null;
        this._pathReplanAt = 0;

        this.state  = "spawning";
        this.energy = 1.0;
        this.age    = 0;

        // Set on the survivor frame after a kaiju kill — manager reads
        // and clears this to publish a kaiju_victory event.
        this._lastVictim = null;

        // Round 20 — biome influence + queen state.
        // _biomeAccum: seconds since last biome scatter (manager reads/resets)
        // becameQueen: latched once age threshold crossed
        // _queenSpawnTimer: counts down to next minion spawn
        // _queenChildren: total minions this queen has spawned
        this._biomeAccum     = 0;
        this.becameQueen     = false;
        this.becameKing      = false;     // round 36 — second tier above queen
        this._queenSpawnTimer = 0;
        this._queenChildren  = 0;

        // Round 30 — ranged attack cooldown. Manager reads kaiju.kind,
        // looks up KIND_TO_ATTACK, fires when (age - _lastAttackTime)
        // exceeds the attack's cooldown.
        this._lastAttackTime = -Infinity;

        // Round 21 — projectile throw cooldown. While seeking or
        // engaging, Kaiju periodically emits kaiju:want_throw and the
        // manager handles tree lookup + projectile launch.
        this._throwCooldown  = 5 + Math.random() * 5;

        // Round 274 — ABSORB MECHANIC. A subset of kaiju have an
        // affinity that lets them ABSORB a specific damage type
        // instead of taking damage from it. Each absorbed hit grows
        // the kaiju by one tier (scale ramps 1 → 10 over 10 hits).
        // At tier ≥7 their attacks become "mega" variants with
        // multiplied damage + range. At tier 10 they reach a
        // termination event — one of OVERLOAD / MELT / DISINTEGRATE /
        // DEMON_PULL — picked randomly when the threshold trips.
        //
        // absorbsType: null (most kaiju) or one of:
        //   "energy"   — laser/plasma/magic
        //   "nuclear"  — nukes, radiation pulses
        //   "kinetic"  — kinetic strikes, rod-from-god, bullets
        //   "fire"     — flamethrower, fireball, lava
        //   "cold"     — ice ray, frost
        //
        // ~25% of kaiju get a random absorb type at spawn so the
        // mechanic surfaces naturally during sandbox play.
        this.absorbsType  = opts.absorbsType ?? this._pickAbsorbAtSpawn();
        this.absorbTier   = 0;
        this.absorbScale  = 1.0;                  // round 274 — multiplier on top of base kaiju scale
        this._lastAbsorbAt = 0;                   // performance.now ms; pulse cue gate
        this._terminating  = null;                // null | termination kind once tier ≥10
    }

    _pickAbsorbAtSpawn() {
        if (Math.random() > 0.25) return null;    // 75% of kaiju are normal
        const types = ["energy", "nuclear", "kinetic", "fire", "cold"];
        return types[Math.floor(Math.random() * types.length)];
    }

    // Round 274 — entry point for damage-type-aware hits. The caller
    // (satellite strike, weapon hit, civ counter) passes both raw
    // damage AND a type tag. If the kaiju absorbs that type, we
    // grow instead of subtracting energy. Returns the actual energy
    // applied so callers can chain death detection.
    //
    // Termination kinds at tier 10:
    //   OVERLOAD     — explodes in 24u radius AOE, damages all in blast
    //   MELT         — collapses into a lava pool hazard for 30s
    //   DISINTEGRATE — dissolves into particles, no after-effect
    //   DEMON_PULL   — hellspawn portal opens beneath, kaiju dragged under
    // v794 — applyTypedDamage now accepts an optional source position
    // {x, y, z} so damage paths that know where the hit came from can
    // route through here and get directional camera shake. Existing
    // 2-arg callers continue to work (source = null → isotropic shake).
    applyTypedDamage(amount, type = null, source = null) {
        if (this.absorbsType && type === this.absorbsType) {
            this.absorbTier = Math.min(10, this.absorbTier + 1);
            this._lastAbsorbAt = (typeof performance !== "undefined") ? performance.now() : Date.now();
            // Geometric scale: tier 0→1.0, tier 5→3.0, tier 10→10.0.
            // Aggressive ramp at the end so the player feels the swell.
            const tier = this.absorbTier;
            if      (tier <= 3) this.absorbScale = 1.0 + tier * 0.50;            // 1.0, 1.5, 2.0, 2.5
            else if (tier <= 6) this.absorbScale = 2.5 + (tier - 3) * 0.85;      // 3.35, 4.2, 5.05
            else if (tier <= 9) this.absorbScale = 5.05 + (tier - 6) * 1.30;     // 6.35, 7.65, 8.95
            else                this.absorbScale = 10.0;                         // tier 10 cap
            if (this.absorbTier >= 10 && !this._terminating) {
                const terms = ["OVERLOAD", "MELT", "DISINTEGRATE", "DEMON_PULL"];
                this._terminating = terms[Math.floor(Math.random() * terms.length)];
            }
            return 0;       // absorbed — no energy lost
        }
        this.energy = Math.max(0, this.energy - amount);
        // v795 — stamp real-time hit timestamp so the HUD hit-flash + any
        // other receive-side feedback can fire. Updated only for non-
        // absorbed damage (absorbed = no visceral feedback).
        // v798 — also stamp the damage type so HUD can tint the flash.
        this._lastHitMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
        this._lastHitType = type;
        // v786 — camera shake on damage RECEIVED (mirrors the v780 shake-on-fire).
        // v794 — when source position provided, pass direction to cam.shake.
        if (this._isPlayerDriven) {
            try {
                const cam = (typeof window !== "undefined") ? window.camera : null;
                if (cam?.shake && cam.mode === "kaiju_drive" && cam._kaijuTarget === this) {
                    const amp = Math.min(0.50, 0.05 + amount * 1.5);
                    const ms = 180 + Math.min(120, amount * 200);
                    if (source && typeof source.x === "number") {
                        const dx = this.position.x - source.x;
                        const dz = this.position.z - source.z;
                        cam.shake(amp, ms, dx, dz);
                    } else {
                        cam.shake(amp, ms);
                    }
                }
                // v795 — player damage audio. Throttled to 200ms so an AoE
                // that hits multiple times doesn't spam. Heavy concussive
                // sound. Played non-spatially (at the listener) since it's
                // about the player feeling damage, not localizing it.
                // v796 — per-type variation. Different attack types get
                // different "hurt" sounds for variety.
                const audio = (typeof window !== "undefined") ? window.audio : null;
                const nowMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
                if (audio?.play && (!this._lastDamageAudioMs || (nowMs - this._lastDamageAudioMs) > 200)) {
                    const DAMAGE_AUDIO_MAP = {
                        "fire":       "ogre_gas_blast",          // burns
                        "ice":        "ogre_laser_fire",         // sharp slap
                        "lightning":  "ogre_internal_explosion", // crack
                        "kinetic":    "ogre_artillery_impact",   // thud
                        "energy":     "ogre_internal_explosion", // concussion
                        "acid":       "ogre_gas_blast",          // hiss
                        "radiation":  "ogre_gas_blast",          // sickly
                        "magic":      "ogre_internal_explosion", // arcane boom
                    };
                    const sound = DAMAGE_AUDIO_MAP[type] || "ogre_internal_explosion";
                    audio.play(sound);
                    this._lastDamageAudioMs = nowMs;
                }
            } catch {}
        }
        return amount;
    }

    isAlive() {
        return this.state !== "dying" && this.energy > 0.05;
    }

    tick(delta, civManager, kaijuManager) {
        this.age += delta;

        // v794 — ambient roar for AI kaiju. Random-interval (8-20s between
        // roars). Each AI kaiju maintains its own _nextRoarAt timestamp.
        // Spatialized so distant kaiju are quieter. Skipped for player-
        // driven (the player doesn't roar at themselves). Skipped during
        // stunned/dying states for the same reason — no sound when the
        // kaiju isn't acting.
        if (!this._isPlayerDriven && this.state !== "dying" && !this._stunnedUntil) {
            if (!this._nextRoarAt) {
                this._nextRoarAt = performance.now() + 3000 + Math.random() * 8000;
            } else if (performance.now() >= this._nextRoarAt) {
                try {
                    const audio = (typeof window !== "undefined") ? window.audio : null;
                    if (audio?.playSpatial && window.camera) {
                        // Sound varies by kaiju kind for variety
                        const roarMap = {
                            hell:    "ogre_internal_explosion",
                            tech:    "ogre_laser_fire",
                            sky:     "ogre_internal_explosion",
                            ice:     "ogre_gas_blast",
                            space:   "ogre_laser_fire",
                            water:   "ogre_artillery_fire",
                            ground:  "ogre_artillery_impact",
                        };
                        const sound = roarMap[this.kind] || "ogre_artillery_impact";
                        audio.playSpatial(sound, this.position.x, this.position.y, this.position.z, window.camera);
                    }
                } catch {}
                // Reschedule next roar
                this._nextRoarAt = performance.now() + 8000 + Math.random() * 12000;
            }
        }

        // Round 270b — orbital EMP stun. SatelliteFleet's EMP strikes
        // (or signal-suppression from a SIGNAL satellite) set timestamps
        // on the kaiju that tell us to suppress AI for a window. While
        // stunned, the kaiju keeps animating + ageing but contributes
        // no movement or attacks. While suppressed (weaker effect), the
        // kaiju acts but its attack cooldown is multiplied so ranged
        // attacks fire less often.
        const nowMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (this._stunnedUntil && nowMs < this._stunnedUntil) {
            // Stunned — return without state work; downstream rendering
            // sees the kaiju in its current state animation.
            return [];
        } else if (this._stunnedUntil) {
            this._stunnedUntil = 0;        // expired
        }
        if (this._signalSuppressUntil && nowMs >= this._signalSuppressUntil) {
            this._signalSuppressUntil = 0;
            this._attackCooldownMul = 1.0;
        }

        // Round 124 — player-driven flag. When the camera is in
        // kaiju_drive mode targeting this entity, _isPlayerDriven is
        // set (by the camera on mode entry, cleared on exit). AI
        // movement is suppressed for the duration. The kaiju still
        // ages, takes damage, fires attacks when the player commits,
        // and runs through state machines for queen/king promotion.
        // We just don't run movement, state transitions, or AI target
        // selection because the player is choosing where to go.
        //
        // Round 125 — flag is persistent (set on enter, cleared on
        // exit) so downstream code (mesh-sync, animator) can read it
        // throughout the tick. Previous round used a per-tick flag
        // that got consumed too early.
        if (this._isPlayerDriven) {
            return [];
        }

        // Round 20 — queen ascension. Kaiju that survives past a
        // threshold age (2/3 of natural lifetime) becomes a queen:
        // bigger, brighter, longer-lived, periodically spawns minions.
        // Latched — only fires once.
        const queenAge = this.config.maxLifetime * 0.4;
        const actions = [];
        if (!this.becameQueen
            && this.age > queenAge
            && this.state !== "spawning"
            && this.state !== "dying") {
            this.becameQueen = true;
            // Replace config with an extended copy — bigger + tougher
            this.config = {
                ...this.config,
                scale:       this.config.scale * 1.5,
                damageMul:   (this.config.damageMul ?? 1.0) * 1.3,
                maxLifetime: this.config.maxLifetime * 2,
            };
            this.energy = 1.0;     // refilled at coronation
            this._queenSpawnTimer = 18;   // first child arrives 18s after rise
            actions.push({ type: "kaiju:queen_rises" });
        }

        // Round 36 — KING ascension. A queen who survives well past
        // her queen threshold (now at ~70% of her extended lifetime)
        // becomes a king: even bigger, faster minion cadence, buff aura
        // applied by manager to nearby kaiju regardless of kind.
        // Latched — only fires once per kaiju.
        const kingAge = this.config.maxLifetime * 0.7;
        if (this.becameQueen
            && !this.becameKing
            && this.age > kingAge
            && this.state !== "spawning"
            && this.state !== "dying") {
            this.becameKing = true;
            this.config = {
                ...this.config,
                scale:       this.config.scale * 1.3,
                damageMul:   (this.config.damageMul ?? 1.0) * 1.2,
                maxLifetime: this.config.maxLifetime * 1.5,
            };
            this.energy = 1.0;
            this._queenSpawnTimer = 12;   // kings spawn faster (12s) than queens (25s)
            actions.push({ type: "kaiju:king_rises" });
        }

        // Queen periodic minion spawning — manager picks up the
        // kaiju:queen_spawn action and creates a child of same kind.
        if (this.becameQueen && this.state !== "spawning" && this.state !== "dying") {
            this._queenSpawnTimer -= delta;
            if (this._queenSpawnTimer <= 0) {
                this._queenSpawnTimer = this.becameKing ? 12 : 25;
                this._queenChildren++;
                actions.push({
                    type: "kaiju:queen_spawn",
                    // Round 36 — kings command across kinds. Manager
                    // sees crossKind=true and picks a random different
                    // kind. Queens stay same-kind.
                    kind: this.kind,
                    crossKind: this.becameKing,
                    x: this.position.x,
                    z: this.position.z,
                });
            }

            // Round 35 — hell queens drop portal sculptures (5x5
            // ring with lava center + memory corners). Other queen
            // kinds can carry their own bonus drops in future rounds.
            if (this.kind === "hell") {
                this._portalDropTimer = (this._portalDropTimer ?? 22) - delta;
                if (this._portalDropTimer <= 0) {
                    this._portalDropTimer = 32;
                    actions.push({
                        type: "kaiju:portal_drop",
                        x: this.position.x,
                        z: this.position.z,
                    });
                }
            }
        }

        // Round 37 — tech kaiju drop "metal trees" (4-tall MEMORY
        // pillars) as they roam, regardless of queen status. Mark
        // their hunting ground with mechanical glyphs.
        if (this.kind === "tech"
            && this.state !== "spawning"
            && this.state !== "dying") {
            this._metalTreeTimer = (this._metalTreeTimer ?? 28) - delta;
            if (this._metalTreeTimer <= 0) {
                this._metalTreeTimer = 38;
                actions.push({
                    type: "kaiju:metal_tree_drop",
                    x: this.position.x,
                    z: this.position.z,
                });
            }
        }

        // Round 21 — projectile throw. Manager handles tree lookup
        // and ballistic launch; we just signal want+target. Skip
        // for sky kaiju — aerial throws look weird (no anchor for
        // the wind-up).
        if (this.state === "seeking" || this.state === "engaging") {
            this._throwCooldown -= delta;
            if (this._throwCooldown <= 0 && this.kind !== "sky") {
                // Reset cooldown — queens throw 2x as often
                this._throwCooldown = this.becameQueen ? 6 : 12;
                // Determine target position
                let tx = null, ty = null, tz = null;
                if (this.target?.type === "civ") {
                    tx = this.target.ref.center.x;
                    ty = this.target.ref.center.y;
                    tz = this.target.ref.center.z;
                } else if (this.target?.type === "kaiju") {
                    tx = this.target.ref.position.x;
                    ty = this.target.ref.position.y;
                    tz = this.target.ref.position.z;
                } else if (this.targetCivId != null && civManager?.getById) {
                    const civ = civManager.getById(this.targetCivId);
                    if (civ) { tx = civ.center.x; ty = civ.center.y; tz = civ.center.z; }
                }
                if (tx != null) {
                    actions.push({
                        type: "kaiju:want_throw",
                        kaijuId: this.id,
                        fromX: this.position.x, fromY: this.position.y, fromZ: this.position.z,
                        toX: tx, toY: ty, toZ: tz,
                        damageMul: this.config.damageMul ?? 1.0,
                    });
                }
            }
        }

        if (this.age > this.config.maxLifetime) {
            this.state = "dying";
            return actions;
        }

        // Round 37 — smarter AI: retreat-when-low. If energy drops
        // below 0.3 and the kaiju was damaged recently, switch to
        // retreating state. Recovers passively, returns to seeking
        // when energy >= 0.7. Time-bounded so a kaiju can't loop
        // retreat-recover-retreat indefinitely (max 18s).
        //
        // Round 88 — OGRE and other "boss" kaiju opt out via the
        // noRetreat flag set by their spawner. They never run away;
        // OgreScenario triggers self-detonation instead when blocked.
        const damagedRecently = this._lastDamageTime != null
            && (this.age - this._lastDamageTime) < 4.0;
        // PATCH-B5 -- aggro-scaled retreat threshold. The GPU brain's policy
        // publishes 0..1 per kaiju (see brain/policy.js); 0.5 reproduces the
        // stock 0.3 threshold EXACTLY, brave kaiju (high tier, healthy, prey
        // in reach) hold to ~0.18, timid ones bail at ~0.42. No brain ->
        // getBrainAggro returns null -> stock 0.3.
        let retreatAt = 0.3;
        {
            const ag = (typeof window !== "undefined" && window.getBrainAggro)
                ? window.getBrainAggro(this.id) : null;
            if (ag != null) retreatAt = 0.3 * (1.4 - 0.8 * ag);
        }
        if (!this.noRetreat
            && this.state !== "spawning" && this.state !== "dying"
            && this.state !== "retreating"
            && this.energy < retreatAt && damagedRecently) {
            this.state = "retreating";
            this._retreatStart = this.age;
            this._retreatTarget = this._pickRetreatTarget();
            this.target = null;
        }

        // v795 — AI footstep audio. Distance-based trigger so steps stay
        // in sync with actual movement (not tied to a fixed timer). The
        // step threshold is roughly the kaiju's stride distance. Skipped
        // for: player-driven (foley would compete with own movement),
        // dying/stunned (no movement), and aerial kaiju (no contact
        // sound). Spatialized so distant footsteps are quieter.
        if (!this._isPlayerDriven
            && this.state !== "dying"
            && !this._stunnedUntil
            && this._isGroundLocomotion?.()) {
            if (!this._lastFootstepPos) {
                this._lastFootstepPos = { x: this.position.x, z: this.position.z };
            } else {
                const dpx = this.position.x - this._lastFootstepPos.x;
                const dpz = this.position.z - this._lastFootstepPos.z;
                const traveled = Math.hypot(dpx, dpz);
                // Stride scales with kaiju radius (proxy for size).
                // Default ~3 units; bigger kaiju have proportionally bigger steps.
                const stride = Math.max(2.5, (this.config?.radius ?? 1.5) * 1.6);
                if (traveled >= stride) {
                    try {
                        const audio = (typeof window !== "undefined") ? window.audio : null;
                        if (audio?.playSpatial && window.camera) {
                            // Use a per-kaiju-kind footstep sound. ground/water = heavy thud,
                            // tech = metallic, hell/space = ethereal scrape.
                            const stepMap = {
                                ground: "ogre_artillery_impact",
                                water:  "ogre_artillery_impact",
                                tech:   "ogre_internal_explosion",
                                hell:   "ogre_gas_blast",
                                space:  "ogre_gas_blast",
                                sky:    "ogre_gas_blast",
                                ice:    "ogre_artillery_impact",
                            };
                            const sound = stepMap[this.kind] || "ogre_artillery_impact";
                            audio.playSpatial(sound, this.position.x, this.position.y, this.position.z, window.camera);
                        }
                    } catch {}
                    this._lastFootstepPos.x = this.position.x;
                    this._lastFootstepPos.z = this.position.z;
                }
            }
        }

        switch (this.state) {
            case "spawning":   return actions.concat(this._tickSpawning(delta));
            case "seeking":    return actions.concat(this._tickSeeking(delta, civManager, kaijuManager));
            case "engaging":   return actions.concat(this._tickEngaging(delta, civManager, kaijuManager));
            case "retreating": return actions.concat(this._tickRetreating(delta));
            default:           return actions;
        }
    }

    // Round 37 — pick a retreat point opposite the current move
    // direction, far enough away that the kaiju can disengage.
    _pickRetreatTarget() {
        // PATCH-B4 -- threat-aware retreat. The old picker fled 60 units in
        // a RANDOM direction, which regularly meant fleeing INTO the fight,
        // into another kaiju, or into open water. When the GPU brain has a
        // threat field (cost-weighted distance to the nearest kaiju --
        // higher = safer, and terrain between you and a threat counts),
        // score 12 candidates on the ring and take the safest. No brain ->
        // the stock random pick, byte-for-byte.
        const sample = (typeof window !== "undefined") ? window.sampleBrainThreat : null;
        if (sample) {
            let best = null, bestScore = -Infinity;
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                const cx = this.position.x + Math.cos(a) * 60;
                const cz = this.position.z + Math.sin(a) * 60;
                const s = sample(cx, cz);
                // out-of-window candidates read as "unknown, probably fine"
                const score = (s == null ? 500 : s) + Math.random() * 2;   // jitter breaks ties
                if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; }
            }
            if (best) return best;
        }
        // Default: back-track 60 units in a random angled direction
        const angle = Math.random() * Math.PI * 2;
        return {
            x: this.position.x + Math.cos(angle) * 60,
            z: this.position.z + Math.sin(angle) * 60,
        };
    }

    _tickRetreating(delta) {
        // Recover energy faster than passive decay (regen at +0.05/s
        // net) — equivalent to PASSIVE_DECAY undone plus a regen bonus.
        this.energy = Math.min(1.0, this.energy + 0.05 * delta);

        // Move toward retreat point at 1.3× normal speed (panic boost)
        const tp = this._retreatTarget ?? this._pickRetreatTarget();
        const dx = tp.x - this.position.x;
        const dz = tp.z - this.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.5) {
            const step = Math.min(this.config.moveSpeed * 1.3 * delta, dist);
            this.position.x += (dx / dist) * step;
            this.position.z += (dz / dist) * step;
        }

        // Exit conditions: recovered (>=0.7) or timed out (18s max)
        const elapsed = this.age - this._retreatStart;
        if (this.energy >= 0.7 || elapsed > 18) {
            this.state = "seeking";
            this._retreatTarget = null;
        }
        return [];
    }

    _tickSpawning(delta) {
        const fall = this.config.spawnFallSpeed;
        this.position.y -= fall * delta;
        const land = this.config.spawnLandY;
        const landed = fall > 0
            ? this.position.y <= land
            : this.position.y >= land;
        if (landed) {
            this.position.y = land;
            this.state = "seeking";
        }
        return [];
    }

    _tickSeeking(delta, civManager, kaijuManager) {
        const target = this._resolveTarget(civManager, kaijuManager);
        if (!target) {
            this.energy -= PASSIVE_DECAY;
            return [];
        }

        const tp = this._targetPosition(target);
        const dx = tp.x - this.position.x;
        const dz = tp.z - this.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist < ENGAGE_RANGE) {
            this.target = target;
            this.state = "engaging";
            return [];
        }

        // Round 158 — path planning for ground kaiju. Flying/swimming
        // kinds bypass since their pathing is unconstrained.
        //
        // Round 307 — gated to OGRE scenarios only. Per-frame A* is
        // expensive (up to 2000 nodes × 8 neighbors × heightAt cost per
        // replan, every 4 sec per kaiju), and during normal sandbox /
        // city-destruction play the kaiju move so simply that straight-
        // line greedy is visually equivalent. OGRE waves benefit because
        // OGRE units need to navigate around defender placements.
        //
        // Check both the local _ogreUnit tag (set by OGRE spawn paths)
        // AND the scenario active flag — covers the edge case where a
        // kaiju was spawned during an OGRE wave then the scenario ends.
        const planner = kaijuManager?.pathPlanner;
        const isGround = this._isGroundLocomotion();
        const ogreActive = kaijuManager?.ogreScenario?.active === true;
        const isOgreUnit = this._ogreUnit === true;
        const usePlanner = planner && isGround && (ogreActive || isOgreUnit);
        if (usePlanner) {
            this._followPath(delta, planner, tp);
        } else {
            // Original straight-line greedy move
            const step = Math.min(this.config.moveSpeed * delta, dist);
            this.position.x += (dx / dist) * step;
            this.position.z += (dz / dist) * step;
        }

        this.energy -= PASSIVE_DECAY;
        return [];
    }

    // Round 158 — is this kaiju ground-locomotive? Anything not in the
    // fly/swim sets above. Hell, frost, default ground = walk.
    _isGroundLocomotion() {
        const k = this.kind;
        return k !== "sky" && k !== "space" && k !== "tech" && k !== "water";
    }

    // Round 158 — walk along planned waypoints, replanning when the
    // target has drifted significantly or our plan is stale.
    _followPath(delta, planner, targetPos) {
        const REPLAN_INTERVAL = 4.0;     // seconds between forced replans
        const TARGET_DRIFT    = 8.0;     // target moved this much → replan
        const WAYPOINT_REACH  = 2.5;     // close enough to advance

        // Decide if we need to (re)plan
        let needPlan = false;
        if (!this._path || this._pathIdx >= this._path.length) needPlan = true;
        if (this._pathReplanAt <= this.age) needPlan = true;
        if (this._pathTargetX != null) {
            const dx = targetPos.x - this._pathTargetX;
            const dz = targetPos.z - this._pathTargetZ;
            if (Math.hypot(dx, dz) > TARGET_DRIFT) needPlan = true;
        }

        if (needPlan) {
            const path = planner.planSmoothed(
                this.position.x, this.position.z,
                targetPos.x, targetPos.z);
            this._path = path;
            this._pathIdx = path && path.length > 1 ? 1 : 0;   // skip "current cell"
            this._pathTargetX = targetPos.x;
            this._pathTargetZ = targetPos.z;
            this._pathReplanAt = this.age + REPLAN_INTERVAL;
        }

        if (!this._path || this._path.length === 0) {
            // Planner failed — fall back to straight-line
            // PATCH-B3: ...unless the GPU brain published a flow field. The
            // straight-line fallback is exactly the case that walks kaiju
            // into cliff faces and open water; the field is a cost-weighted
            // gradient toward civ centers that routes around both. Blend
            // 60% field / 40% direct-to-target so kaiju whose target is NOT
            // a civ (duels, OGRE, player aggro) still make progress toward
            // it. No brain running -> sampler returns null -> old behavior.
            const dx = targetPos.x - this.position.x;
            const dz = targetPos.z - this.position.z;
            const d = Math.hypot(dx, dz) || 1;
            const step = this.config.moveSpeed * delta;
            const f = (typeof window !== "undefined" && window.sampleBrainFlow)
                ? window.sampleBrainFlow(this.position.x, this.position.z) : null;
            if (f) {
                let bx = f.x * 0.6 + (dx / d) * 0.4;
                let bz = f.z * 0.6 + (dz / d) * 0.4;
                const bd = Math.hypot(bx, bz) || 1;
                this.position.x += (bx / bd) * step;
                this.position.z += (bz / bd) * step;
                return;
            }
            this.position.x += (dx / d) * step;
            this.position.z += (dz / d) * step;
            return;
        }

        // Walk toward current waypoint
        const wp = this._path[this._pathIdx];
        const dx = wp.x - this.position.x;
        const dz = wp.z - this.position.z;
        const d = Math.hypot(dx, dz);
        if (d < WAYPOINT_REACH) {
            // Advance to next waypoint
            this._pathIdx++;
            if (this._pathIdx >= this._path.length) {
                // Reached end of path — straight-line the last bit
                const ddx = targetPos.x - this.position.x;
                const ddz = targetPos.z - this.position.z;
                const dd = Math.hypot(ddx, ddz) || 1;
                const step = this.config.moveSpeed * delta;
                this.position.x += (ddx / dd) * step;
                this.position.z += (ddz / dd) * step;
                return;
            }
        } else {
            const step = Math.min(this.config.moveSpeed * delta, d);
            this.position.x += (dx / d) * step;
            this.position.z += (dz / d) * step;
        }
    }

    _tickEngaging(delta, civManager, kaijuManager) {
        // Re-resolve each tick — current target may have died, moved
        // out of range, or no longer be the nearest threat.
        let target = this.target;
        if (!target || !this._isTargetValid(target)) {
            target = this._resolveTarget(civManager, kaijuManager);
            this.target = target;
            if (!target) {
                this.state = "seeking";
                return [];
            }
        }

        const tp = this._targetPosition(target);
        const dx = tp.x - this.position.x;
        const dz = tp.z - this.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > ENGAGE_RANGE * 1.5) {
            this.state = "seeking";
            this.target = null;
            return [];
        }

        // Damage exchange — branches on target type
        if (target.type === "civ") {
            return this._engageCiv(target.ref);
        } else {
            return this._engageKaiju(target.ref);
        }
    }

    _engageCiv(civ) {
        const civHit = CIV_HIT_BASE * (this.config.damageMul ?? 1.0);
        civ.energy   = Math.max(0, civ.energy   - civHit);
        this.energy  = Math.max(0, this.energy  - COUNTER_HIT);

        if (civ.energy < 0.05) {
            this.energy = Math.min(1.0, this.energy + KILL_REGEN_CIV);
            this.target = null;
            this.targetCivId = null;
            this.state = "seeking";
        }

        const r = DAMAGE_VOXEL_R;
        const vx = Math.floor(civ.center.x + (Math.random() * 2 - 1) * r);
        const vy = Math.floor(civ.center.y);
        const vz = Math.floor(civ.center.z + (Math.random() * 2 - 1) * r);
        return [{ type: "voxel:remove", x: vx, y: vy, z: vz }];
    }

    _engageKaiju(other) {
        // Mutual damage — kaiju duels are brutal. Each side's damage
        // also scales with their own kind's damageMul, so a hell kaiju
        // (1.6×) hits a sky kaiju (1.0×) for 1.6× while taking 1.0× back.
        const myDmg     = KAIJU_HIT_BASE     * (this.config.damageMul   ?? 1.0);
        const theirDmg  = KAIJU_COUNTER_HIT  * (other.config.damageMul  ?? 1.0);
        other.energy   = Math.max(0, other.energy   - myDmg);
        this.energy    = Math.max(0, this.energy    - theirDmg);

        if (other.energy < 0.05 && this.energy > 0.05) {
            // Victory — record for the manager to publish event
            this.energy = Math.min(1.0, this.energy + KILL_REGEN_KAIJU);
            this._lastVictim = other;
            other.state = "dying";    // mark loser for despawn
            this.target = null;
            this.state = "seeking";
        }

        // No voxel:remove for kaiju duels — the destruction trail is
        // an attack-on-civ thing. Their fight is between bodies only.
        return [];
    }

    // Returns { type, ref } for the nearest valid target, or null.
    // Considers both civs and other live kaiju (excluding self and
    // any kaiju still in spawning state — they're not on the ground
    // yet so attacking them mid-descent would look weird).
    _resolveTarget(civManager, kaijuManager) {
        // Round 126 — hellspawn priority. Kaiju summoned by a civ
        // specifically to attack the OGRE prefer the OGRE as target
        // when it's active. This keeps them on-mission rather than
        // wandering toward the nearest civ. Falls through to normal
        // target selection if the OGRE isn't active or accessible.
        if (this._targetsOgre && kaijuManager?.ogreScenario?.getOgreState) {
            const og = kaijuManager.ogreScenario.getOgreState();
            if (og) {
                const dx = og.x - this.position.x;
                const dz = og.z - this.position.z;
                return {
                    type: "ogre",
                    ref: kaijuManager.ogreScenario,
                    distSq: dx * dx + dz * dz,
                };
            }
            // OGRE not active — hellspawn linger with no target until
            // the next OGRE wave appears. They'll loiter near their
            // summon point harmlessly.
            return null;
        }

        // PATCH-B13 -- pack focus-fire (GPU Brain phase 9). A fresh order
        // (stamped by the king aura within the last 4s) redirects target
        // selection to the king's target. Hellspawn stay on-mission (the
        // block above already returned), demoralized kaiju ignore orders,
        // and stale/dead orders fall straight through to normal selection.
        if (this._packFocusTarget && !this._demoralized
            && this._packFocusAt && (performance.now() - this._packFocusAt) < 4000) {
            const ft = this._packFocusTarget;
            const fp = (ft.ref && (ft.ref.center ?? ft.ref.position)) || null;
            const alive = ft.type !== "kaiju" || (ft.ref && ft.ref.state !== "dying" && (ft.ref.energy ?? 1) > 0);
            if (fp && alive) {
                const dx = fp.x - this.position.x;
                const dz = fp.z - this.position.z;
                return { type: ft.type, ref: ft.ref, distSq: dx * dx + dz * dz };
            }
            this._packFocusTarget = null;
        }
        // Round 39 — player retaliation. If a player bolt hit this kaiju
        // recently, prefer the player as target. Manager sets
        // _lastPlayerHitTime + _playerRef when bolt lands; we read them
        // here. After PLAYER_AGGRO_WINDOW seconds since last hit, kaiju
        // forgets the player and re-resolves to nearest civ/kaiju.
        const PLAYER_AGGRO_WINDOW = 8.0;
        if (this._playerRef
            && this._lastPlayerHitTime != null
            && (this.age - this._lastPlayerHitTime) < PLAYER_AGGRO_WINDOW) {
            const p = this._playerRef.position;
            const dx = p.x - this.position.x;
            const dz = p.z - this.position.z;
            return {
                type: "player",
                ref: this._playerRef,
                distSq: dx * dx + dz * dz,
            };
        }

        const candidates = [];

        if (civManager) {
            for (const civ of civManager.getAll()) {
                // Round 10 — never target your patron
                if (this.allegiance != null && civ.id === this.allegiance) continue;
                const dx = civ.center.x - this.position.x;
                const dz = civ.center.z - this.position.z;
                candidates.push({
                    type: "civ", ref: civ, distSq: dx * dx + dz * dz,
                });
            }
        }

        if (kaijuManager) {
            for (const k of kaijuManager.getAll()) {
                if (k.id === this.id) continue;
                if (k.state === "spawning") continue;
                if (k.state === "dying")    continue;
                // Round 10 — same allegiance = ally, not target
                if (this.allegiance != null &&
                    k.allegiance != null &&
                    k.allegiance === this.allegiance) continue;
                const dx = k.position.x - this.position.x;
                const dz = k.position.z - this.position.z;
                candidates.push({
                    type: "kaiju", ref: k, distSq: dx * dx + dz * dz,
                });
            }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => a.distSq - b.distSq);
        return candidates[0];
    }

    _targetPosition(target) {
        if (target.type === "civ")    return target.ref.center;
        if (target.type === "player") return target.ref.position;
        // Round 126 — OGRE target. ref is the scenario; query position
        // through getOgreState() each call since the OGRE moves.
        if (target.type === "ogre") {
            const og = target.ref?.getOgreState?.();
            if (og) return { x: og.x, y: og.y, z: og.z };
            // Fallback: target.ref might not have the method (defensive
            // — should not happen in practice but avoids null-deref)
            return this.position;
        }
        return target.ref.position;
    }

    _isTargetValid(target) {
        if (!target || !target.ref) return false;
        if (target.type === "civ")    return (target.ref.energy ?? 0) > 0.05;
        if (target.type === "kaiju")  return target.ref.isAlive?.() ?? false;
        if (target.type === "player") return true;     // player always "valid"
        // Round 126 — OGRE valid while scenario is active and chassis
        // alive. Hellspawn kaiju with their target cleared (because the
        // OGRE died or wave ended) re-resolve next tick and may
        // gracefully fall back to having no target.
        if (target.type === "ogre") {
            const og = target.ref?.getOgreState?.();
            return !!(og && og.hp > 0);
        }
        return false;
    }
}
