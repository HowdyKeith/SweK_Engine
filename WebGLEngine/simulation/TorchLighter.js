// =============================================================================
// FILE: /simulation/TorchLighter.js
// ROUND: 227
// =============================================================================
//
// Real torch lighting for WAD dungeons. Until now, "torch" props were
// inert wooden posts — they read as decoration but emitted no light or
// fire. This module attaches a continuous fire+ember effect to each
// torch entity that the OllamaLevelGenerator placed in the current
// level.
//
// Three particle streams per torch:
//   1. Flame core — short-lived bright yellow/orange particles rising
//      straight up. Tight cone, high density, fast lifecycle.
//   2. Flame outer wisp — longer-lived darker orange particles, wider
//      spread, slight horizontal drift to simulate convection.
//   3. Ember drift — rare slow-rising sparks that survive longer and
//      drift sideways. Catches the eye even from across a room.
//
// Each torch fires at most EMIT_HZ times/sec so a level with 20 torches
// stays under the particle budget. Particles cost nothing once
// despawned by their TTL.
//
// API:
//   const torches = new TorchLighter({ particles, ollamaLevelGen });
//   torches.tick(dt);   // called from main loop
// =============================================================================

const EMIT_HZ = 24;                        // flame core emissions/sec per torch
const EMIT_EMBER_HZ = 4;                   // ember drift emissions/sec per torch
const FLAME_RISE_VEL = 2.4;                // m/s upward
const EMBER_RISE_VEL = 0.8;
const RENDER_DISTANCE = 60;                // skip torches farther than this from camera

export class TorchLighter {
    constructor({ particles, ollamaLevelGen, camera = null }) {
        this.particles = particles;
        this.ollamaLevelGen = ollamaLevelGen;
        this.camera = camera;
        this._flameTimers = new Map();       // torchId → seconds since last flame emit
        this._emberTimers = new Map();       // torchId → seconds since last ember emit
        this._counters = { flames: 0, embers: 0 };
        this._enabled = true;
    }

    setEnabled(on) { this._enabled = !!on; }
    getStats() { return { ...this._counters, enabled: this._enabled }; }

    tick(dt) {
        if (!this._enabled) return;
        if (!this.particles?.spawn) return;
        const torches = this.ollamaLevelGen?.getLastTorches?.();
        if (!torches || torches.length === 0) return;

        const camX = this.camera?.position?.x ?? 0;
        const camZ = this.camera?.position?.z ?? 0;

        for (const t of torches) {
            // Cull distant torches — particle cost scales linearly with
            // visible torches, so keep emitting only nearby
            const dx = t.x - camX, dz = t.z - camZ;
            if (dx*dx + dz*dz > RENDER_DISTANCE * RENDER_DISTANCE) continue;

            // Flame core — emit at fixed Hz independent of dt
            let ft = (this._flameTimers.get(t.id) || 0) + dt;
            const flameInterval = 1 / EMIT_HZ;
            while (ft >= flameInterval) {
                ft -= flameInterval;
                this._emitFlameCore(t);
            }
            this._flameTimers.set(t.id, ft);

            // Ember drift — rarer, on its own schedule
            let et = (this._emberTimers.get(t.id) || 0) + dt;
            const emberInterval = 1 / EMIT_EMBER_HZ;
            while (et >= emberInterval) {
                et -= emberInterval;
                this._emitEmber(t);
            }
            this._emberTimers.set(t.id, et);
        }

        // GC timers for torches that no longer exist (e.g. after level
        // transition). Cheap — sized by torch count, not particle count.
        if (this._flameTimers.size > torches.length * 2) {
            const live = new Set(torches.map(t => t.id));
            for (const id of [...this._flameTimers.keys()]) {
                if (!live.has(id)) this._flameTimers.delete(id);
            }
            for (const id of [...this._emberTimers.keys()]) {
                if (!live.has(id)) this._emberTimers.delete(id);
            }
        }
    }

    _emitFlameCore(t) {
        // Two-stream emission: a bright inner spark and a softer outer
        // wisp. Together they read as a flickering flame top.
        const innerOuter = Math.random();
        if (innerOuter < 0.65) {
            // Inner spark — bright yellow/white, narrow cone, short TTL
            const sx = (Math.random() - 0.5) * 0.18;
            const sz = (Math.random() - 0.5) * 0.18;
            this.particles.spawn({
                x: t.x + sx, y: t.y, z: t.z + sz,
                vx: sx * 0.6, vy: FLAME_RISE_VEL + Math.random() * 0.6,
                vz: sz * 0.6,
                ttl: 0.18 + Math.random() * 0.12,
                size: 0.30 + Math.random() * 0.12,
                r: 1.0, g: 0.85 + Math.random() * 0.15, b: 0.35 + Math.random() * 0.20,
                a: 0.95,
                gravity: -1.5,           // upward acceleration (flame rises)
            });
        } else {
            // Outer wisp — darker orange, wider cone, longer TTL
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.10 + Math.random() * 0.20;
            this.particles.spawn({
                x: t.x + Math.cos(ang) * rad, y: t.y, z: t.z + Math.sin(ang) * rad,
                vx: Math.cos(ang) * 0.5,
                vy: FLAME_RISE_VEL * 0.7 + Math.random() * 0.4,
                vz: Math.sin(ang) * 0.5,
                ttl: 0.35 + Math.random() * 0.25,
                size: 0.40 + Math.random() * 0.20,
                r: 0.95, g: 0.45 + Math.random() * 0.20, b: 0.15,
                a: 0.65,
                gravity: -0.5,
            });
        }
        this._counters.flames++;
    }

    _emitEmber(t) {
        // Slow rising spark with horizontal drift — survives ~1.5s
        // so it draws the eye from across the room. Spawns slightly
        // above the flame base.
        const ang = Math.random() * Math.PI * 2;
        const driftX = Math.cos(ang) * (0.4 + Math.random() * 0.4);
        const driftZ = Math.sin(ang) * (0.4 + Math.random() * 0.4);
        this.particles.spawn({
            x: t.x + Math.cos(ang) * 0.15, y: t.y + 0.2,
            z: t.z + Math.sin(ang) * 0.15,
            vx: driftX, vy: EMBER_RISE_VEL + Math.random() * 0.3, vz: driftZ,
            ttl: 1.4 + Math.random() * 0.8,
            size: 0.10 + Math.random() * 0.08,
            r: 1.0, g: 0.50 + Math.random() * 0.20, b: 0.10,
            a: 0.85,
            gravity: -0.3,
        });
        this._counters.embers++;
    }
}
