// FILE: render/particleEmitters.js
// VERSION: v1
//
// Round 23 — atmospheric particle emitters. Each emitter consumes a
// ParticleSystem (the one true particle pool) and feeds it spawn
// calls based on its own logic.
//
// Round 24 — emitters now select sprites from the shared atlas.
//   * LavaEmberEmitter   → SPRITE.EMBER (warm radial gradient)
//   * MemoryShimmer      → SPRITE.GLYPH (cyan plus / cross)
//   * ImpactBurstEmitter → SPRITE.SPARK (sparks) + SPRITE.DUST (dust)

import { SPRITE } from "./spriteAtlas.js";

const VOXEL_LAVA = 12;

// LavaEmberEmitter
//
// Scans terrain in a ring around the camera each scan interval,
// finds lava voxels with air above them (i.e. exposed lava
// surfaces), and emits embers from random samples. Sample density
// is rate-limited so a giant lava lake doesn't overwhelm the pool.
export class LavaEmberEmitter {
    constructor({ particles, world, camera, scanRadius = 60, scanInterval = 0.4, embersPerScan = 6 }) {
        this.particles = particles;
        this.world = world;
        this.camera = camera;
        this.scanRadius = scanRadius;
        this.scanInterval = scanInterval;
        this.embersPerScan = embersPerScan;
        this._timer = 0;
    }

    tick(delta) {
        this._timer -= delta;
        if (this._timer > 0) return;
        this._timer = this.scanInterval;

        if (!this.particles || !this.world || !this.camera) return;
        const get = this.world.voxelAt
            ? (x, y, z) => this.world.voxelAt(x, y, z)
            : this.world.getVoxel
                ? (x, y, z) => this.world.getVoxel(x, y, z)
                : null;
        if (!get) return;

        // Random sampling within the scan ring. We don't enumerate
        // every voxel — that's 60³ = 216K cells. Instead we sample
        // a small number of random positions per scan and check those.
        const cx = Math.floor(this.camera.position.x);
        const cy = Math.floor(this.camera.position.y);
        const cz = Math.floor(this.camera.position.z);
        const r = this.scanRadius;

        // Try up to 8× more samples than embers so dense lava areas
        // emit at full rate but sparse ones don't waste many tries.
        const tries = this.embersPerScan * 8;
        let placed = 0;
        for (let i = 0; i < tries && placed < this.embersPerScan; i++) {
            const dx = Math.floor((Math.random() * 2 - 1) * r);
            const dy = Math.floor((Math.random() - 0.5) * 16);
            const dz = Math.floor((Math.random() * 2 - 1) * r);
            const x = cx + dx, y = cy + dy, z = cz + dz;

            // Need lava with air above
            const here = get(x, y, z);
            if (here !== VOXEL_LAVA) continue;
            const above = get(x, y + 1, z);
            if (above !== 0) continue;

            // Spawn an ember rising from the lava surface
            this.particles.spawn({
                x: x + 0.3 + Math.random() * 0.4,
                y: y + 1.0,
                z: z + 0.3 + Math.random() * 0.4,
                vx: (Math.random() - 0.5) * 0.4,
                vy: 1.2 + Math.random() * 0.8,    // upward
                vz: (Math.random() - 0.5) * 0.4,
                ttl: 1.4 + Math.random() * 1.6,
                size: 0.35 + Math.random() * 0.20,
                r: 1.0,
                g: 0.55 + Math.random() * 0.25,    // yellow-orange variation
                b: 0.10,
                a: 1.0,
                gravity: -0.5,    // negative pulls upward
                sprite: SPRITE.EMBER,
            });
            placed++;
        }
    }
}

// ImpactBurstEmitter
//
// Subscribes to the eventBus for projectile_impact events. On each
// event, spawns a burst of dust + spark particles at the impact
// position. Combines with the existing voxelDebris (cube particles)
// for layered visual feedback.
export class ImpactBurstEmitter {
    constructor({ particles, eventBus, particleCount = 40 }) {
        this.particles = particles;
        this.particleCount = particleCount;
        if (eventBus?.subscribe) {
            eventBus.subscribe((evt) => {
                if (evt.type === "projectile_impact") this._burst(evt);
            });
        }
    }

    _burst(evt) {
        const x = evt.x, y = evt.y, z = evt.z;
        if (!this.particles) return;

        for (let i = 0; i < this.particleCount; i++) {
            // Mix of dust (gray, slow, lingering) and sparks (bright,
            // fast, short-lived). 70/30 split.
            const isSpark = Math.random() < 0.3;
            const angle = Math.random() * Math.PI * 2;
            // Radial outward, with random vertical
            const speed = isSpark
                ? 5 + Math.random() * 6
                : 1.5 + Math.random() * 2;
            const vx = Math.cos(angle) * speed;
            const vz = Math.sin(angle) * speed;
            const vy = isSpark
                ? 3 + Math.random() * 4
                : 1 + Math.random() * 2;

            this.particles.spawn({
                x, y, z,
                vx, vy, vz,
                ttl: isSpark
                    ? 0.6 + Math.random() * 0.4
                    : 1.2 + Math.random() * 0.8,
                size: isSpark
                    ? 0.30 + Math.random() * 0.15
                    : 0.55 + Math.random() * 0.30,
                r: isSpark ? 1.0 : 0.5,
                g: isSpark ? 0.7 + Math.random() * 0.3 : 0.45,
                b: isSpark ? 0.2 : 0.4,
                a: isSpark ? 1.0 : 0.65,
                gravity: 8,    // both arc downward, sparks stronger feel
                sprite: isSpark ? SPRITE.SPARK : SPRITE.DUST,
            });
        }
    }
}

// MemoryShimmerEmitter
//
// Cyan motes drifting near MEMORY voxels. Same scan pattern as lava
// embers but smaller particle count (memory blocks are rarer).
const VOXEL_MEMORY = 30;

export class MemoryShimmerEmitter {
    constructor({ particles, world, camera, scanRadius = 50, scanInterval = 0.6, motesPerScan = 3 }) {
        this.particles = particles;
        this.world = world;
        this.camera = camera;
        this.scanRadius = scanRadius;
        this.scanInterval = scanInterval;
        this.motesPerScan = motesPerScan;
        this._timer = 0;
    }

    tick(delta) {
        this._timer -= delta;
        if (this._timer > 0) return;
        this._timer = this.scanInterval;

        if (!this.particles || !this.world || !this.camera) return;
        const get = this.world.voxelAt
            ? (x, y, z) => this.world.voxelAt(x, y, z)
            : null;
        if (!get) return;

        const cx = Math.floor(this.camera.position.x);
        const cy = Math.floor(this.camera.position.y);
        const cz = Math.floor(this.camera.position.z);
        const r = this.scanRadius;

        const tries = this.motesPerScan * 5;
        let placed = 0;
        for (let i = 0; i < tries && placed < this.motesPerScan; i++) {
            const dx = Math.floor((Math.random() * 2 - 1) * r);
            const dy = Math.floor((Math.random() - 0.5) * 14);
            const dz = Math.floor((Math.random() * 2 - 1) * r);
            const x = cx + dx, y = cy + dy, z = cz + dz;
            if (get(x, y, z) !== VOXEL_MEMORY) continue;

            this.particles.spawn({
                x: x + Math.random(),
                y: y + 0.5 + Math.random() * 1.5,
                z: z + Math.random(),
                vx: (Math.random() - 0.5) * 0.3,
                vy: 0.4 + Math.random() * 0.5,
                vz: (Math.random() - 0.5) * 0.3,
                ttl: 2.5 + Math.random() * 2.0,
                size: 0.30 + Math.random() * 0.15,
                r: 0.30, g: 0.95, b: 0.95,
                a: 0.9,
                gravity: -0.2,    // gently rises
                sprite: SPRITE.GLYPH,
            });
            placed++;
        }
    }
}
