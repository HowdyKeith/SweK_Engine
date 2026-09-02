// FILE: simulation/SatelliteFleet.js
// VERSION: v1 — round 266
//
// Cities launch satellites that drift overhead at high altitude
// (y=85), cross the world, go off-screen, wait for the orbital cycle,
// and reappear from the opposite side. Each satellite is one of a
// catalog of types: passive sensors (detection, aiming, ir, uv,
// signal) buff military aim or surface kaiju info; active weapons
// (laser, emp, kinetic, nuke) fire a strike when they pass near a
// kaiju and their cooldown is ready.
//
// Architecturally a sibling of BotManager: satellites have their own
// motion model (linear across the sky, no pursuit) so they don't fit
// the bot pathfinder. They DO use the entity spawn path
// (router.exec({type:"entity:spawnMesh"})) so they render through the
// existing asset pipeline.
//
// Strikes are visual + particle for round 266; actual damage hookup
// to KaijuManager is held for a follow-up round.

import { rng } from "../world/procPlanet.js";   // mulberry32, the same one the orrery's planets are seeded with

const WORLD_EDGE      = 200;        // |x| or |z| past which a sat is "off-frame"
const SAT_ALTITUDE_Y  = 85;         // well above the tallest snow cap (~75)
const SAT_SPEED       = 4.0;        // u/s — slow drift; takes ~100s to cross
const ORBIT_WAIT_MS   = 20_000;     // off-frame wait before reappearing
const STRIKE_RANGE    = 60;         // horizontal distance for active strike
const PASSIVE_RADIUS  = 80;         // sensor reach

export const SATELLITE_TYPES = {
    // ---------- Passive sensors ----------
    detection: {
        label: "DETECTION", emoji: "📡", passive: true,
        radius: PASSIVE_RADIUS, color: [0.4, 0.7, 1.0],
        asset: "obelisk", scale: 0.30,
    },
    aiming: {
        label: "AIMING",    emoji: "🎯", passive: true,
        radius: PASSIVE_RADIUS, color: [1.0, 0.95, 0.4],
        asset: "obelisk", scale: 0.30,
    },
    ir: {
        label: "IR",        emoji: "🌡",  passive: true,
        radius: PASSIVE_RADIUS, color: [1.0, 0.3, 0.2],
        asset: "obelisk", scale: 0.30,
    },
    uv: {
        label: "UV",        emoji: "🟣", passive: true,
        radius: PASSIVE_RADIUS, color: [0.8, 0.4, 0.95],
        asset: "obelisk", scale: 0.30,
    },
    signal: {
        label: "SIGNAL",    emoji: "📵", passive: true,
        radius: PASSIVE_RADIUS, color: [0.4, 0.4, 0.55],
        asset: "obelisk", scale: 0.30,
    },
    // ---------- Active weapons ----------
    laser: {
        label: "LASER",     emoji: "🔆", passive: false,
        cooldownMs: 8000,  color: [1.0, 0.15, 0.15],
        asset: "obelisk", scale: 0.32,
    },
    emp: {
        label: "EMP",       emoji: "⚡", passive: false,
        cooldownMs: 12_000, color: [0.6, 0.85, 1.0],
        asset: "obelisk", scale: 0.32,
    },
    kinetic: {
        label: "KINETIC",   emoji: "💎", passive: false,
        cooldownMs: 10_000, color: [0.95, 0.95, 0.9],
        asset: "obelisk", scale: 0.32,
    },
    nuke: {
        label: "NUKE",      emoji: "☢",  passive: false,
        cooldownMs: 30_000, color: [1.0, 0.55, 0.1],
        asset: "obelisk", scale: 0.34,
    },
};

const ALL_TYPE_KEYS = Object.keys(SATELLITE_TYPES);

let _nextSatId = 1;

export class SatelliteFleet {
    /**
     * *** v4325 -- `seed`, BECAUSE SEVEN Math.random CALLS MADE THIS DEMO UNREPRODUCIBLE AND NONE OF THEM NEEDED
     * TO BE RANDOM. *** Backlog #68 counted them and said it exactly: "None NEED randomness; they need variety,
     * which a hash gives." Two runs of this fleet could not be compared, so a change to its motion could not be
     * told from a different roll of the dice -- and #68's whole promise is "two runs match unless the repo
     * changed".
     *
     * The default is UNCHANGED: with no seed, Math.random is used and the kaiju game behaves exactly as it did.
     * Pass a seed and every choice below comes from world/procPlanet.js's mulberry32 instead -- the same
     * generator the orrery's planets are baked with, imported rather than a second copy, so a seeded fleet and
     * a seeded planet cannot drift apart in how they consume their stream.
     */
    constructor({ router, world, particles = null, audio = null,
                  kaijuManager = null, kpop = null, seed = null,
                  launchIntervalMs = 25_000 } = {}) {
        this.router = router;
        // A stream, not a number: every draw below goes through this one function, so a seeded fleet is
        // reproducible in the ORDER it draws as well as in what it draws.
        this.seed = seed;
        this._rnd = (seed == null) ? Math.random : rng(seed >>> 0);
        this.world = world;
        this.particles = particles;
        this.audio = audio;
        this.kaijuManager = kaijuManager;
        this.kpop = kpop;
        this.launchIntervalMs = launchIntervalMs;
        this.active = false;
        this.satellites = new Map();   // id → satState
        this._lastLaunchMs = 0;
        this._lastTickMs = (typeof performance !== "undefined") ? performance.now() : 0;
        this._cityCenter = { x: 0, z: 0 };
    }

    start({ cityCenterX = 0, cityCenterZ = 0 } = {}) {
        if (this.active) return;
        this.active = true;
        this._cityCenter.x = cityCenterX;
        this._cityCenter.z = cityCenterZ;
        this._lastLaunchMs = (typeof performance !== "undefined") ? performance.now() : 0;
        console.log("[SatelliteFleet] active — cities will launch satellites");
    }

    stop() {
        if (!this.active) return;
        this.active = false;
        for (const sat of this.satellites.values()) this._despawnEntity(sat);
        this.satellites.clear();
        console.log("[SatelliteFleet] stopped — all satellites despawned");
    }

    /** Cap on simultaneous live satellites. Cities won't launch past this. */
    _capacity() { return 6; }

    tick(dt) {
        if (!this.active) return;
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        // Schedule next launch
        if (now - this._lastLaunchMs >= this.launchIntervalMs &&
            this.satellites.size < this._capacity()) {
            this._lastLaunchMs = now;
            this.launchRandom();
        }
        // Per-satellite update
        for (const sat of this.satellites.values()) this._tickSat(sat, dt, now);
    }

    /** Launch a satellite of a random type, entering from a random edge. */
    launchRandom(typeKey = null) {
        const key = typeKey || ALL_TYPE_KEYS[Math.floor(this._rnd() * ALL_TYPE_KEYS.length)];
        return this.launch(key);
    }

    launch(typeKey) {
        const spec = SATELLITE_TYPES[typeKey];
        if (!spec) {
            console.warn(`[SatelliteFleet] unknown type "${typeKey}"`);
            return null;
        }
        // Pick a random edge entry point. Velocity heads roughly toward
        // the opposite edge with some XZ angle so trajectories don't
        // all line up.
        const angle = this._rnd() * Math.PI * 2;
        const startX = Math.cos(angle) * WORLD_EDGE;
        const startZ = Math.sin(angle) * WORLD_EDGE;
        // Velocity points roughly toward opposite side with ±25° jitter
        const targetAngle = angle + Math.PI + (this._rnd() - 0.5) * 0.9;
        const vx = Math.cos(targetAngle) * SAT_SPEED;
        const vz = Math.sin(targetAngle) * SAT_SPEED;
        const sat = {
            id: _nextSatId++,
            type: typeKey,
            spec,
            state: "crossing",         // crossing | orbiting
            x: startX, z: startZ,
            y: SAT_ALTITUDE_Y,
            vx, vz,
            entityId: null,
            orbitEndMs: 0,
            lastStrikeMs: 0,
            launchMs: (typeof performance !== "undefined") ? performance.now() : Date.now(),
        };
        this._spawnEntity(sat);
        this.satellites.set(sat.id, sat);
        if (this.kpop?.toast) {
            this.kpop.toast(`${spec.emoji} ${spec.label} satellite launched`, 2500).catch(() => {});
        }
        return sat.id;
    }

    _spawnEntity(sat) {
        if (!this.router?.exec) return;
        try {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: sat.spec.asset,
                kind: `satellite_${sat.type}`,
                x: sat.x, y: sat.y, z: sat.z,
                scale: sat.spec.scale,
            });
            sat.entityId = r?.id ?? null;
        } catch {}
    }

    _despawnEntity(sat) {
        if (sat.entityId == null || !this.router?.exec) return;
        try { this.router.exec({ type: "entity:despawn", id: sat.entityId }); } catch {}
        sat.entityId = null;
    }

    _moveEntity(sat) {
        if (sat.entityId == null || !this.router?.exec) return;
        try {
            this.router.exec({
                type: "entity:move",
                id: sat.entityId,
                x: sat.x, y: sat.y, z: sat.z,
            });
        } catch {}
    }

    _tickSat(sat, dt, now) {
        if (sat.state === "orbiting") {
            // Off-frame — wait, then re-emerge from opposite edge
            if (now >= sat.orbitEndMs) {
                // Reappear from opposite edge with rough mirror trajectory
                const mirror = (val) => -Math.sign(val) * WORLD_EDGE;
                sat.x = mirror(sat.x);
                sat.z = mirror(sat.z);
                // Re-pick a velocity heading toward another edge so it
                // crosses again (not a perfect mirror — feels more alive)
                const targetAngle = Math.atan2(-sat.z, -sat.x) + (this._rnd() - 0.5) * 1.4;
                sat.vx = Math.cos(targetAngle) * SAT_SPEED;
                sat.vz = Math.sin(targetAngle) * SAT_SPEED;
                sat.state = "crossing";
                this._spawnEntity(sat);
            }
            return;
        }

        // Crossing: integrate position
        sat.x += sat.vx * dt;
        sat.z += sat.vz * dt;
        this._moveEntity(sat);

        // Type-specific behavior — passive sensors paint kaiju in radius
        // (just particle hint for now); active weapons fire on cooldown
        // when a kaiju is within strike range.
        this._applyEffect(sat, now);

        // Emit a faint trail particle so the type is visible
        if (this.particles?.spawn && this._rnd() < 0.35) {
            const [r, g, b] = sat.spec.color;
            this.particles.spawn({
                x: sat.x - sat.vx * 0.1,
                y: sat.y,
                z: sat.z - sat.vz * 0.1,
                vx: 0, vy: -0.05, vz: 0,
                r, g, b, a: 0.7,
                size: 0.4, lifeMs: 2200,
            });
        }

        // Check if off-frame → enter orbit
        if (Math.abs(sat.x) > WORLD_EDGE || Math.abs(sat.z) > WORLD_EDGE) {
            sat.state = "orbiting";
            sat.orbitEndMs = now + ORBIT_WAIT_MS;
            this._despawnEntity(sat);
        }
    }

    _applyEffect(sat, now) {
        const km = this.kaijuManager;
        // Round 269 — KaijuManager exposes `.kaiju` (singular Map), not
        // `.kaijus`. Previous pre-compaction code looked at `km.kaijus`
        // which was always undefined, so strikes never found targets.
        // Kaiju also expose position via `.position.{x,y,z}`, not flat
        // `.x/.y/.z`. Helper to read either shape safely.
        if (!km?.kaiju) return;
        const getKaijuPos = (k) => {
            if (k?.position) return { x: k.position.x, y: k.position.y, z: k.position.z };
            return { x: k.x ?? 0, y: k.y ?? 0, z: k.z ?? 0 };
        };
        if (sat.spec.passive) {
            // Sensors — find any kaiju within radius and emit a ping
            // particle on it. Round 270b — SIGNAL passive sats also
            // apply attack-rate suppression to every kaiju in their
            // radius: _attackCooldownMul=2.0 doubles their cooldown
            // for ~6s. KaijuManager ranged-attack code already
            // multiplies its base cooldown by this when set (the
            // _attackCooldownMul flag has been recognized since round
            // 36's king-aura). IR/UV/AIMING/DETECTION just ping.
            const nowMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
            for (const k of km.kaiju.values()) {
                const kp = getKaijuPos(k);
                const dx = kp.x - sat.x;
                const dz = kp.z - sat.z;
                if (dx * dx + dz * dz <= sat.spec.radius * sat.spec.radius) {
                    if (this.particles?.spawn && this._rnd() < 0.05) {
                        const [r, g, b] = sat.spec.color;
                        this.particles.spawn({
                            x: kp.x, y: kp.y + 5, z: kp.z,
                            vx: 0, vy: 0.5, vz: 0,
                            r, g, b, a: 0.9,
                            size: 1.0, lifeMs: 700,
                        });
                    }
                    if (sat.type === "signal") {
                        k._attackCooldownMul = 2.0;
                        k._signalSuppressUntil = nowMs + 6000;
                    }
                }
            }
            return;
        }
        // Active weapon — fire on cooldown when a kaiju is within range
        if (now - sat.lastStrikeMs < sat.spec.cooldownMs) return;
        let target = null;
        let bestD2 = STRIKE_RANGE * STRIKE_RANGE;
        for (const k of km.kaiju.values()) {
            if (!k.isAlive?.()) continue;
            const kp = getKaijuPos(k);
            const dx = kp.x - sat.x;
            const dz = kp.z - sat.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; target = k; }
        }
        if (target) {
            sat.lastStrikeMs = now;
            this._fireStrike(sat, target);
        }
    }

    _fireStrike(sat, target) {
        // Round 269 — read kaiju position via .position (the correct
        // accessor) and APPLY DAMAGE. Pre-compaction comment said
        // damage was deferred to a follow-up round; this is it.
        // Damage amount scales by weapon type (read from spec.damage,
        // with a fallback for satellites that pre-date that field).
        const tp = target?.position
            ? { x: target.position.x, y: target.position.y, z: target.position.z }
            : { x: target?.x ?? 0, y: target?.y ?? 0, z: target?.z ?? 0 };
        if (this.particles?.spawn) {
            const [r, g, b] = sat.spec.color;
            const steps = 14;
            for (let i = 0; i < steps; i++) {
                const t = i / (steps - 1);
                this.particles.spawn({
                    x: sat.x + (tp.x - sat.x) * t,
                    y: sat.y + (tp.y + 4 - sat.y) * t,
                    z: sat.z + (tp.z - sat.z) * t,
                    vx: 0, vy: 0, vz: 0,
                    r, g, b, a: 0.95,
                    size: 0.9, lifeMs: 500,
                });
            }
            // Target burst — 24 outward particles
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2;
                this.particles.spawn({
                    x: tp.x, y: tp.y + 3, z: tp.z,
                    vx: Math.cos(a) * 3, vy: this._rnd() * 4 + 1, vz: Math.sin(a) * 3,
                    r, g, b, a: 0.95,
                    size: 1.1, lifeMs: 1100,
                });
            }
        }
        // Apply damage to the kaiju via its `energy` proxy (kaiju use
        // energy as HP — isAlive() returns true when energy > 0.05).
        // Round 274 — damage TYPES map onto kaiju absorb affinities:
        // laser/emp = "energy", nuke = "nuclear", kinetic = "kinetic".
        // If the kaiju absorbs the type, applyTypedDamage returns 0
        // and grows the kaiju instead.
        const damageByType = {
            laser:   { amount: 0.35, type: "energy"  },
            emp:     { amount: 0.15, type: "energy"  },
            kinetic: { amount: 0.50, type: "kinetic" },
            nuke:    { amount: 0.80, type: "nuclear" },
        };
        const dmgSpec = damageByType[sat.type] ?? { amount: sat.spec.damage ?? 0.30, type: null };
        const dmg = dmgSpec.amount;
        if (typeof target.applyTypedDamage === "function") {
            target.applyTypedDamage(dmg, dmgSpec.type);
        } else if (typeof target.energy === "number") {
            target.energy = Math.max(0, target.energy - dmg);
        }
        // Round 270b — type-specific debuffs on top of raw damage.
        // EMP stuns the primary target for 3.5s — no movement, no
        // attacks. Nukes also drop a smaller AOE on every other kaiju
        // within 18u (chain damage). Kinetic strikes shake the world
        // (small camera nudge) as a feel cue.
        const nowMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (sat.type === "emp") {
            target._stunnedUntil = nowMs + 3500;
        }
        if (sat.type === "nuke") {
            const AOE_R2 = 18 * 18;
            const km = this.kaijuManager;
            if (km?.kaiju) {
                for (const other of km.kaiju.values()) {
                    if (other === target) continue;
                    if (!other.isAlive?.()) continue;
                    const op = other.position
                        ? { x: other.position.x, y: other.position.y, z: other.position.z }
                        : { x: 0, y: 0, z: 0 };
                    const dx = op.x - tp.x;
                    const dz = op.z - tp.z;
                    const d2 = dx * dx + dz * dz;
                    if (d2 < AOE_R2) {
                        // Falloff: full damage at center, half at edge
                        const falloff = 1 - Math.sqrt(d2 / AOE_R2) * 0.5;
                        const aoeDmg = dmg * 0.5 * falloff;
                        if (typeof other.applyTypedDamage === "function") {
                            other.applyTypedDamage(aoeDmg, "nuclear");
                        } else {
                            other.energy = Math.max(0, (other.energy ?? 1) - aoeDmg);
                        }
                        if (this.damageNumbers?.show) {
                            this.damageNumbers.show(op.x, op.y, op.z,
                                Math.round(aoeDmg * 100), {
                                    color: "rgb(255,180,40)",
                                    prefix: "-",
                                    size: 16,
                                    durationMs: 1000,
                                });
                        }
                    }
                }
            }
        }
        // Floating damage number — anti-kaiju damage uses the satellite
        // type's color so the strike "owner" is identifiable.
        if (this.damageNumbers?.show) {
            const [r, g, b] = sat.spec.color;
            const cssColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
            this.damageNumbers.show(tp.x, tp.y, tp.z, Math.round(dmg * 100), {
                color: cssColor,
                prefix: "-",
                size: sat.type === "nuke" ? 28 : (sat.type === "kinetic" ? 24 : 20),
                durationMs: 1200,
            });
            // Round 270 — minimap pulse so the player can spot where
            // satellite strikes are landing even with the camera elsewhere.
            if (typeof window !== "undefined" && window._wadMap?.addPulse) {
                window._wadMap.addPulse(tp.x, tp.z, {
                    color: cssColor,
                    radius: sat.type === "nuke" ? 16 : (sat.type === "kinetic" ? 12 : 9),
                    durationMs: 1100,
                });
            }
        }
        if (this.audio?.playEffect) {
            try { this.audio.playEffect("explosion"); } catch {}
        }
        if (this.kpop?.toast) {
            this.kpop.toast(`${sat.spec.emoji} ${sat.spec.label} strike on kaiju`, 2000).catch(() => {});
        }
        console.log(`[SatelliteFleet] ${sat.spec.label} strike → kaiju at (${tp.x.toFixed(1)}, ${tp.z.toFixed(1)}) -${(dmg * 100).toFixed(0)} energy`);
    }

    /** For HUD / debug. */
    snapshot() {
        const types = {};
        for (const sat of this.satellites.values()) {
            types[sat.type] = (types[sat.type] || 0) + 1;
        }
        return {
            active: this.active,
            count: this.satellites.size,
            byType: types,
        };
    }
}
