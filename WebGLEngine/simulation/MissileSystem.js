// FILE: simulation/MissileSystem.js
// Round 46 — guided rockets + guided missiles.
//
// Rockets: fire-and-forget straight-line projectile, big AoE. No camera.
// Guided missiles: camera attaches, mouse steers heading. Slower than
//   rockets but tracks moving targets. Self-destructs on impact / range
//   limit / ttl.
//
// One missile in flight at a time (the camera handoff makes "salvo"
// behavior incoherent). Player must wait for current missile to detonate
// or time out before firing another.
//
// Camera handoff for guided:
//   - Save player's camera state (mode, position, yaw, pitch)
//   - Each frame: camera.position = missile.pos - heading*5 + up*1.5
//   - camera.yaw / camera.pitch ARE the missile's heading (mouse steering
//     directly drives both); missile velocity rotates toward heading at
//     turnRateRad/sec
//   - On detonate: restore saved camera state. Camera.mode flag prevents
//     player WASD/jump while missile is in flight.

const TRAIL_PARTICLES_PER_TICK = 4;
const CAMERA_BACK_OFFSET = 5;
const CAMERA_UP_OFFSET   = 1.6;

export class MissileSystem {
    constructor(opts = {}) {
        this.camera = opts.camera ?? null;
        this.kaijuManager = opts.kaijuManager ?? null;
        this.world = opts.world ?? null;
        this.particles = opts.particles ?? null;
        this.audio = opts.audioManager ?? null;
        this.playerCombat = opts.playerCombat ?? null;
        this.playerEnergy = opts.playerEnergy ?? null;

        this.active = null;            // current missile or null
        this._savedCamera = null;       // for restore after guided
    }

    isActive()    { return this.active != null; }
    isGuided()    { return this.active?.cfg?.guided === true; }

    // Returns true if the missile launched. Refuses if one's already in
    // flight or if energy is too low.
    fire({ from, fwd, cfg, yaw, pitch }) {
        if (this.active) return false;
        const e = cfg.energy ?? 0;
        if (this.playerEnergy && e > 0 && this.playerEnergy.current < e) {
            this.playerEnergy._deny?.();
            return false;
        }
        if (this.playerEnergy && e > 0) {
            this.playerEnergy.current = Math.max(0, this.playerEnergy.current - e);
        }

        const speed = cfg.speed ?? 30;
        this.active = {
            pos: { x: from.x, y: from.y, z: from.z },
            vel: { x: fwd.x * speed, y: fwd.y * speed, z: fwd.z * speed },
            yaw: yaw ?? 0,
            pitch: pitch ?? 0,
            ttl: cfg.ttl ?? (cfg.range / speed) * 1.2,
            traveled: 0,
            cfg,
        };

        if (cfg.guided && this.camera) {
            // Save camera state for restore after detonate
            this._savedCamera = {
                mode: this.camera.mode,
                x: this.camera.position.x,
                y: this.camera.position.y,
                z: this.camera.position.z,
                yaw: this.camera.yaw,
                pitch: this.camera.pitch,
            };
            // Camera mode flag — main loop / camera input checks gate on this
            this.camera.mode = "missile_cam";
        }
        // Audio cue — missile launch
        if (this.audio?.triggerDanger) this.audio.triggerDanger(0.6);

        return true;
    }

    tick(dt) {
        if (!this.active) return;
        const m = this.active;
        const cfg = m.cfg;

        m.ttl -= dt;
        if (m.ttl <= 0) { return this._detonate("ttl"); }

        if (cfg.guided && this.camera) {
            // Camera yaw/pitch IS the missile's desired heading. Velocity
            // rotates toward it at turnRateRad per second.
            m.yaw = this.camera.yaw;
            m.pitch = Math.max(-1.4, Math.min(1.4, this.camera.pitch));
            const desired = this._dirFromYawPitch(m.yaw, m.pitch);
            const speed = Math.hypot(m.vel.x, m.vel.y, m.vel.z) || cfg.speed;
            const cur = { x: m.vel.x / speed, y: m.vel.y / speed, z: m.vel.z / speed };
            // Slerp-ish: rotate cur toward desired by max angle (turnRate*dt)
            const dot = Math.max(-1, Math.min(1, cur.x * desired.x + cur.y * desired.y + cur.z * desired.z));
            const angle = Math.acos(dot);
            const maxStep = (cfg.turnRateRad ?? 2.5) * dt;
            let nx, ny, nz;
            if (angle < 1e-4) {
                nx = desired.x; ny = desired.y; nz = desired.z;
            } else if (maxStep >= angle) {
                nx = desired.x; ny = desired.y; nz = desired.z;
            } else {
                const t = maxStep / angle;
                // SLERP
                const sinA = Math.sin(angle);
                const w0 = Math.sin((1 - t) * angle) / sinA;
                const w1 = Math.sin(t * angle) / sinA;
                nx = cur.x * w0 + desired.x * w1;
                ny = cur.y * w0 + desired.y * w1;
                nz = cur.z * w0 + desired.z * w1;
                const ln = Math.hypot(nx, ny, nz) || 1;
                nx /= ln; ny /= ln; nz /= ln;
            }
            m.vel.x = nx * speed;
            m.vel.y = ny * speed;
            m.vel.z = nz * speed;
        }

        // Move
        const stepX = m.vel.x * dt;
        const stepY = m.vel.y * dt;
        const stepZ = m.vel.z * dt;
        m.pos.x += stepX;
        m.pos.y += stepY;
        m.pos.z += stepZ;
        m.traveled += Math.hypot(stepX, stepY, stepZ);

        // Range cap
        if (m.traveled >= (cfg.range ?? Infinity)) {
            return this._detonate("range");
        }

        // Particle trail
        if (this.particles?.spawn) {
            const [r, g, b] = cfg.color ?? [1, 0.6, 0.2];
            for (let i = 0; i < TRAIL_PARTICLES_PER_TICK; i++) {
                const jitter = 0.15;
                this.particles.spawn({
                    x: m.pos.x + (Math.random() - 0.5) * jitter,
                    y: m.pos.y + (Math.random() - 0.5) * jitter,
                    z: m.pos.z + (Math.random() - 0.5) * jitter,
                    vx: -m.vel.x * 0.05 + (Math.random() - 0.5) * 1,
                    vy: 0.3 + (Math.random() - 0.5) * 1,
                    vz: -m.vel.z * 0.05 + (Math.random() - 0.5) * 1,
                    ttl: 0.6 + Math.random() * 0.3,
                    size: 0.4 + Math.random() * 0.2,
                    r, g, b, a: 0.9,
                    gravity: -0.2,
                    sprite: 4,    // EMBER
                });
            }
        }

        // Camera follow for guided
        if (cfg.guided && this.camera) {
            const dir = this._dirFromYawPitch(m.yaw, m.pitch);
            this.camera.position.x = m.pos.x - dir.x * CAMERA_BACK_OFFSET;
            this.camera.position.y = m.pos.y - dir.y * CAMERA_BACK_OFFSET + CAMERA_UP_OFFSET;
            this.camera.position.z = m.pos.z - dir.z * CAMERA_BACK_OFFSET;
        }

        // Collision: kaiju within hit radius (smaller than AoE — direct hit)
        const hitR = 1.5;
        const hitR2 = hitR * hitR;
        if (this.kaijuManager?.kaiju) {
            for (const k of this.kaijuManager.kaiju.values()) {
                if (!k.isAlive || !k.isAlive()) continue;
                const dx = k.position.x - m.pos.x;
                const dy = k.position.y - m.pos.y;
                const dz = k.position.z - m.pos.z;
                if (dx * dx + dy * dy + dz * dz < hitR2) {
                    return this._detonate("kaiju_hit");
                }
            }
        }

        // Terrain / floor check
        if (m.pos.y <= 1) return this._detonate("ground");
        if (this.world && !this.world.isAir?.(Math.floor(m.pos.x), Math.floor(m.pos.y), Math.floor(m.pos.z))) {
            return this._detonate("solid");
        }
    }

    _detonate(reason) {
        if (!this.active) return;
        const m = this.active;
        const cfg = m.cfg;
        const aoe2 = (cfg.aoe ?? 8) ** 2;

        // AoE damage to nearby kaiju
        let killed = 0;
        if (this.kaijuManager?.kaiju) {
            for (const k of this.kaijuManager.kaiju.values()) {
                if (!k.isAlive || !k.isAlive()) continue;
                const dx = k.position.x - m.pos.x;
                const dy = k.position.y - m.pos.y;
                const dz = k.position.z - m.pos.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < aoe2) {
                    // Falloff: full at center, half at edge
                    const falloff = 1 - 0.5 * (Math.sqrt(d2) / (cfg.aoe ?? 8));
                    const wasAlive = (k.energy ?? 1) > 0;
                    const dmg = (cfg.damage ?? 0.5) * falloff;
                    k.energy = Math.max(0, (k.energy ?? 1) - dmg);
                    k._lastDamageTime = k.age;
                    k._lastPlayerHitTime = k.age;
                    k._playerRef = window._playerRef;
                    // Round 305 — radial outward direction from missile impact
                    const len = Math.hypot(dx, dy, dz) || 1;
                    k._lastHitDir = { x: dx / len, y: dy / len, z: dz / len };
                    k._lastHitMag = dmg;
                    k._lastHitAge = k.age;
                    if (wasAlive && k.energy <= 0 && this.playerCombat) {
                        this.playerCombat.creditKill(k);
                        killed++;
                    }
                    // v856 — engine event for kaiju death (same as
                    // WeaponSystem). Fires on killing blow only.
                    if (wasAlive && k.energy <= 0) {
                        try {
                            window.dispatchEvent(new CustomEvent("engine:kaijuDefeated", {
                                detail: {
                                    kind: k.kind || k.type || "kaiju",
                                    by: "missile",
                                    position: k.position ? { x: k.position.x, y: k.position.y, z: k.position.z } : null,
                                },
                            }));
                        } catch {}
                    }
                }
            }
        }

        // Explosion particles
        if (this.particles?.spawn) {
            const [r, g, b] = cfg.color ?? [1, 0.6, 0.2];
            for (let i = 0; i < 50; i++) {
                const a = Math.random() * Math.PI * 2;
                const phi = Math.acos(2 * Math.random() - 1);
                const speed = 4 + Math.random() * 8;
                this.particles.spawn({
                    x: m.pos.x, y: m.pos.y, z: m.pos.z,
                    vx: Math.sin(phi) * Math.cos(a) * speed,
                    vy: Math.cos(phi) * speed,
                    vz: Math.sin(phi) * Math.sin(a) * speed,
                    ttl: 0.9 + Math.random() * 0.6,
                    size: 0.7 + Math.random() * 0.4,
                    r, g, b, a: 1.0,
                    gravity: 4,
                    sprite: 4,
                });
            }
        }

        if (this.audio?.triggerDanger) this.audio.triggerDanger(1.5);
        console.log(`[Missile] detonated (${reason}) at (${m.pos.x.toFixed(1)}, ${m.pos.y.toFixed(1)}, ${m.pos.z.toFixed(1)}) — ${killed} kills`);

        // Restore camera if guided
        if (cfg.guided && this._savedCamera && this.camera) {
            this.camera.mode = this._savedCamera.mode;
            this.camera.position.x = this._savedCamera.x;
            this.camera.position.y = this._savedCamera.y;
            this.camera.position.z = this._savedCamera.z;
            this.camera.yaw = this._savedCamera.yaw;
            this.camera.pitch = this._savedCamera.pitch;
            this._savedCamera = null;
        }

        this.active = null;
    }

    _dirFromYawPitch(yaw, pitch) {
        const cp = Math.cos(pitch);
        return {
            x: Math.sin(yaw) * cp,
            y: -Math.sin(pitch),
            z: -Math.cos(yaw) * cp,
        };
    }

    snapshot() {
        if (!this.active) return null;
        return {
            guided: this.active.cfg.guided,
            ttl: this.active.ttl,
            range: this.active.cfg.range,
            traveled: this.active.traveled,
        };
    }
}
