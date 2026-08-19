// FILE: simulation/ProjectileManager.js
// VERSION: v1
//
// Tracks projectiles in flight, runs physics, applies impact effects.
// One owner per projectile (kaiju that threw it). Damage scales with
// owner's damageMul so queens hurl trees that hit ~2x harder than a
// freshly-spawned kaiju.
//
// Impact effects:
//   * Voxel carve — radius 3 sphere set to AIR around impact point
//     (terrain / civ structures lose those voxels)
//   * Splash entity damage — civs within radius 6 lose 0.30 energy,
//     kaiju within radius 6 lose 0.15 energy (less, since kaiju are
//     tougher targets)
//   * Debris burst at impact for visual feedback

import { Projectile } from "./Projectile.js";
import { treeThrowTakeoff, treeThrowTrail, treeThrowImpact, isTreeProjectile } from "../world/treeThrowFx.js";   // v407

const SPLASH_VOXEL_RADIUS = 3;
const SPLASH_ENTITY_RADIUS = 6;
const CIV_DAMAGE_BASE     = 0.30;
const KAIJU_DAMAGE_BASE   = 0.15;

export class ProjectileManager {
    constructor({ router, world, civManager, kaijuManager, eventBus, debris, particles }) {
        this.router = router;
        this.world = world;
        this.civManager = civManager;
        this.kaijuManager = kaijuManager;
        this.eventBus = eventBus;
        this.debris = debris;
        this.particles = particles ?? null;       // round 14 — for projectile trails

        this.projectiles = new Map();
        this._nextId = 1;
    }

    // Launch a projectile from `from` toward `to`. Computes ballistic
    // velocity for ~2s flight time. Caller (KaijuManager) provides the
    // tree entity id from the despawned tree so we render the flying
    // tree with the same mesh asset.
    //
    // Round 14 — `trail` option: "smoke" | "fire" | "ember" | undefined
    //   None: no trail (legacy default for trees)
    //   smoke: gray smoke puffs (civ missile, hell fireball)
    //   fire:  yellow-orange flames + smoke (heavy missile)
    //   ember: bright spark trail (rock spike, plasma)
    // PATCH-B10 -- ownerCivId: attribution for civ-fired bolts, so their
    // impact events can close the civ-defense learning loop the same way
    // ownerKaijuId closes the kaiju one. Optional; nothing else changes.
    launch({ from, to, kind, scale, ownerKaijuId, damageMul, trail, trailColor, ownerCivId, targetKaijuId }) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        // Flight time scales with horizontal distance — short throws
        // arc steeply, long throws stretch out. Clamped so the visual
        // is always recognizable.
        const horizDist = Math.sqrt(dx * dx + dz * dz);
        const t = Math.max(1.0, Math.min(3.5, horizDist / 12));
        const g = 18;

        const vx = dx / t;
        const vz = dz / t;
        const vy = (dy + 0.5 * g * t * t) / t;   // solves for ballistic arc

        const p = new Projectile(this._nextId++, {
            x: from.x, y: from.y + 2, z: from.z,
            vx, vy, vz,
            kind, scale,
            ownerKaijuId,
        });
        p._damageMul = damageMul ?? 1.0;
        p.ownerCivId = ownerCivId ?? null;        // PATCH-B10
        p.targetKaijuId = targetKaijuId ?? null;  // PATCH-B10b: which kaiju the shot was AIMED at
        p._trail = trail ?? null;                 // round 14
        p._trailColor = trailColor ?? null;       // round 14
        this.projectiles.set(p.id, p);

        // Spawn ECS mesh entity for in-flight visual. Manager updates
        // its position each tick via entity:move; despawned on impact.
        if (this.router) {
            const result = this.router.exec({
                type: "entity:spawnMesh",
                assetId: kind,
                x: p.position.x, y: p.position.y, z: p.position.z,
                scale: scale,
                kind: kind,    // tree_oak / tree_palm tint fallback
            });
            if (result?.ok && result.id != null) p._meshEntityId = result.id;
        }

        // v407 — tree-throw cinematic takeoff burst. Only ember-trailed
        // projectiles (trees) get it; missiles keep their plain trail.
        if (isTreeProjectile(p)) {
            treeThrowTakeoff(from, to);
        }
        return p;
    }

    tick(delta) {
        if (this.projectiles.size === 0) return;

        for (const p of this.projectiles.values()) {
            const result = p.tick(delta, this.world);

            // Round 14 — trail emission. Projectiles with _trail set
            // emit particles each tick. Smoke / fire / ember styles
            // distinguish missile types visually.
            if (p._trail && this.particles?.spawn) {
                this._emitTrail(p);
            }
            // v407 — GPU ember trail for trees, in addition to the CPU
            // trail above. Cheap (1-2 particles/tick) and adds the
            // glowing arc the cinematic wants.
            if (isTreeProjectile(p)) {
                treeThrowTrail(p.position);
            }

            // Update mesh position regardless of state — covers the
            // last frame before despawn so the impact looks instant.
            // Round 81 — also send orientation so the tumble animation
            // is visible. yaw / tiltX / tiltZ are accumulated each tick
            // by Projectile.tick(). Entities with all-zero spin (laser
            // bolts, etc.) effectively just send 0,0,0 — no extra cost.
            if (p._meshEntityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: p._meshEntityId,
                    x: p.position.x, y: p.position.y, z: p.position.z,
                    yaw: p.yaw, tiltX: p.tiltX, tiltZ: p.tiltZ,
                });
            }

            if (result.state === "alive") continue;

            // Despawn flying mesh entity
            if (p._meshEntityId != null && this.router) {
                this.router.exec({
                    type: "entity:despawn",
                    id: p._meshEntityId,
                });
            }

            if (result.state === "impact") {
                this._applyImpact(p, result);
            }

            this.projectiles.delete(p.id);
        }
    }

    // Round 14 — emit trail particles for missile-style projectiles.
    _emitTrail(p) {
        const px = p.position.x, py = p.position.y, pz = p.position.z;
        const c = p._trailColor;
        if (p._trail === "smoke") {
            // Gray-white smoke puffs
            this.particles.spawn({
                x: px + (Math.random() - 0.5) * 0.4,
                y: py + (Math.random() - 0.5) * 0.4,
                z: pz + (Math.random() - 0.5) * 0.4,
                vy: 0.5 + Math.random() * 0.6,
                ttl: 0.7, size: 0.55,
                r: 0.65, g: 0.65, b: 0.65, a: 0.8,
            });
            // Occasional bright tracer
            if (Math.random() < 0.3) {
                this.particles.spawn({
                    x: px, y: py, z: pz,
                    ttl: 0.18, size: 0.4,
                    r: c?.[0] ?? 1.0, g: c?.[1] ?? 0.8, b: c?.[2] ?? 0.5, a: 1.0,
                });
            }
        } else if (p._trail === "fire") {
            // Bright flame + smoke
            this.particles.spawn({
                x: px + (Math.random() - 0.5) * 0.3,
                y: py + (Math.random() - 0.5) * 0.3,
                z: pz + (Math.random() - 0.5) * 0.3,
                ttl: 0.35, size: 0.45,
                r: 1.0, g: 0.85, b: 0.4, a: 1.0,
            });
            this.particles.spawn({
                x: px + (Math.random() - 0.5) * 0.4,
                y: py + (Math.random() - 0.5) * 0.4,
                z: pz + (Math.random() - 0.5) * 0.4,
                ttl: 0.55, size: 0.5,
                r: 1.0, g: 0.45, b: 0.1, a: 0.95,
            });
            // Smoke trail behind
            this.particles.spawn({
                x: px + (Math.random() - 0.5) * 0.5,
                y: py + 0.3 + Math.random() * 0.5,
                z: pz + (Math.random() - 0.5) * 0.5,
                vy: 0.4 + Math.random() * 0.4,
                ttl: 0.9, size: 0.55,
                r: 0.3, g: 0.3, b: 0.3, a: 0.65,
            });
        } else if (p._trail === "ember") {
            // Spark / ember trail — bright dot, short ttl
            const cr = c?.[0] ?? 1.0, cg = c?.[1] ?? 0.7, cb = c?.[2] ?? 0.3;
            this.particles.spawn({
                x: px + (Math.random() - 0.5) * 0.2,
                y: py + (Math.random() - 0.5) * 0.2,
                z: pz + (Math.random() - 0.5) * 0.2,
                ttl: 0.25, size: 0.3,
                r: cr, g: cg, b: cb, a: 1.0,
            });
        }
    }

    _applyImpact(p, hit) {
        const cx = Math.floor(hit.x);
        const cy = Math.floor(hit.y);
        const cz = Math.floor(hit.z);

        // v516 — splashdown: a projectile / thrown tree stops on the first
        // non-air voxel, so a hit IN water lands on a WATER(10)/FLOWING_WATER(11)
        // cell. Kick up a real surface ripple + spray before the carve runs.
        try {
            const w = this.world;
            const hereV  = w?.voxelAt ? w.voxelAt(cx, cy, cz) : 0;
            const belowV = w?.voxelAt ? w.voxelAt(cx, cy - 1, cz) : 0;
            const isW = (v) => v === 10 || v === 11;
            if ((isW(hereV) || isW(belowV)) && typeof window !== "undefined") {
                const force = Math.min(3.2, 1.3 + (p?._damageMul ?? 1) * 0.8);
                try { window.waterField?.splash?.(hit.x, hit.z, force, 3.2); } catch {}
                try {
                    window.gpuParticles?.spawnBurst?.({ x: hit.x, y: Math.max(8.6, cy + 0.5), z: hit.z,
                        count: 28, speed: 7, direction: [0, 1, 0], spreadAngle: 1.0,
                        life: 0.7, size: 0.5, r: 0.82, g: 0.92, b: 1.0, shape: 0 });
                } catch {}
                try { window.floatingDebris?.spawn?.(cx, cz, { kind: "debris" }); } catch {}   // v518 — leaves a floating chunk
            }
        } catch {}

        // Voxel carve in sphere — radius 3, ~33 voxels
        if (this.router) {
            const r = SPLASH_VOXEL_RADIUS;
            for (let dy = -r; dy <= r; dy++) {
                for (let dz = -r; dz <= r; dz++) {
                    for (let dx = -r; dx <= r; dx++) {
                        const d2 = dx * dx + dy * dy + dz * dz;
                        if (d2 > r * r) continue;
                        if (cy + dy < 1) continue;   // don't carve bedrock
                        this.router.exec({
                            type: "voxel:set",
                            x: cx + dx, y: cy + dy, z: cz + dz, v: 0,
                        });
                    }
                }
            }
        }

        // Debris burst for visual feedback
        if (this.debris && this.debris.spawn) {
            this.debris.spawn(hit.x, hit.y, hit.z, 1);   // stone-grey debris
        }

        // Splash damage to entities — civs lose more energy than kaiju
        const dmgMul = p._damageMul ?? 1.0;
        const splashR = SPLASH_ENTITY_RADIUS;
        const splashR2 = splashR * splashR;

        let civsHit = 0, kaijuHit = 0;
        if (this.civManager?.getAll) {
            for (const civ of this.civManager.getAll()) {
                if (!civ?.center) continue;
                const ddx = civ.center.x - hit.x;
                const ddz = civ.center.z - hit.z;
                if (ddx * ddx + ddz * ddz < splashR2) {
                    civ.energy = Math.max(0, (civ.energy ?? 1) - CIV_DAMAGE_BASE * dmgMul);
                    civsHit++;
                }
            }
        }
        if (this.kaijuManager?.kaiju) {
            for (const k of this.kaijuManager.kaiju.values()) {
                if (k.id === p.ownerKaijuId) continue;   // can't friendly-fire self
                const ddx = k.position.x - hit.x;
                const ddy = k.position.y - hit.y;
                const ddz = k.position.z - hit.z;
                if (ddx * ddx + ddz * ddz < splashR2) {
                    const dmg = KAIJU_DAMAGE_BASE * dmgMul;
                    k.energy = Math.max(0, (k.energy ?? 1) - dmg);
                    k._lastDamageTime = k.age;       // round 37 — retreat trigger
                    k._lastHitMs = (typeof performance !== "undefined") ? performance.now() : Date.now();   // v795
                    k._lastHitType = p.type || "kinetic";   // v798 — projectile's damage type if labeled
                    // Round 305 — outward radial direction for ragdoll
                    const len = Math.hypot(ddx, ddy, ddz) || 1;
                    k._lastHitDir = { x: ddx / len, y: ddy / len, z: ddz / len };
                    k._lastHitMag = dmg;
                    k._lastHitAge = k.age;
                    // v840 — world-space hit position; used by RagdollIntegration
                    // to pick the closest bone for specific-limb severance.
                    k._lastHitPos = { x: hit.x, y: hit.y, z: hit.z };
                    kaijuHit++;

                    // v794 — projectile hits previously bypassed applyTypedDamage,
                    // which meant the v786 camera-shake-on-damage never fired here.
                    // Fire it directly. Direction is the impact→kaiju unit vector
                    // (matches the ragdoll dir already tracked above).
                    if (k._isPlayerDriven) {
                        try {
                            const cam = (typeof window !== "undefined") ? window.camera : null;
                            if (cam?.shake && cam.mode === "kaiju_drive" && cam._kaijuTarget === k) {
                                const amp = Math.min(0.50, 0.05 + dmg * 1.5);
                                const ms = 180 + Math.min(120, dmg * 200);
                                // v794 — directional shake: if cam.shake accepts dir,
                                // pass it; else falls back to the v786 isotropic shake.
                                cam.shake(amp, ms, k._lastHitDir.x, k._lastHitDir.z);
                            }
                            // v795 — player damage audio (same throttle as Kaiju.applyTypedDamage path)
                            const audio = (typeof window !== "undefined") ? window.audio : null;
                            const nowMs = (typeof performance !== "undefined") ? performance.now() : Date.now();
                            if (audio?.play && (!k._lastDamageAudioMs || (nowMs - k._lastDamageAudioMs) > 200)) {
                                audio.play("ogre_internal_explosion");
                                k._lastDamageAudioMs = nowMs;
                            }
                        } catch {}
                    }
                }
            }
        }

        // v794 — projectile impact audio. Plays spatially at the impact
        // point regardless of whether anything was hit (you hear the
        // explosion / thump even on a ground splash). Sound choice based
        // on the projectile's family/type if known, else generic.
        try {
            const audio = (typeof window !== "undefined") ? window.audio : null;
            if (audio && window.camera) {
                // Mapping: tree → tree_thud; lightning → internal_explosion;
                // default projectile → artillery_impact (heavier than mg).
                let soundName = "ogre_artillery_impact";
                if (isTreeProjectile(p))               soundName = "ogre_artillery_impact";
                else if (p.kind === "lightning")        soundName = "ogre_internal_explosion";
                else if (p.kind === "plasma")           soundName = "ogre_internal_explosion";
                if (audio.playSpatial) {
                    audio.playSpatial(soundName, hit.x, hit.y, hit.z, window.camera);
                } else if (audio.play) {
                    audio.play(soundName);
                }
            }
        } catch {}

        if (this.eventBus?.publish) {
            this.eventBus.publish("projectile_impact", {
                ownerKaijuId: p.ownerKaijuId,
                ownerCivId: p.ownerCivId ?? null,     // PATCH-B10
                targetKaijuId: p.targetKaijuId ?? null,   // PATCH-B10b
                x: hit.x, y: hit.y, z: hit.z,
                civsHit, kaijuHit,
            });
        }
        // v407 — tree-throw cinematic impact burst. Intensity scales up
        // when the tree landed on a civilization (more dramatic splash).
        if (isTreeProjectile(p)) {
            treeThrowImpact({ x: hit.x, y: hit.y, z: hit.z }, civsHit > 0 ? 1.4 : 1.0);
        }
        console.log(`[ProjectileManager] impact at (${cx},${cy},${cz}) — civs hit ${civsHit}, kaiju hit ${kaijuHit}`);
    }

    snapshot() {
        return { active: this.projectiles.size, total: this._nextId - 1 };
    }
}
