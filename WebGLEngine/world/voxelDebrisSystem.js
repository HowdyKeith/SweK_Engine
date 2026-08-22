// FILE: world/voxelDebrisSystem.js
// VERSION: v1
//
// Particle-based "voxel destruction" effect. When a voxel is removed
// via the editor, six small debris cubes spawn at the cell's center,
// burst outward + upward, fall under gravity, and despawn after one
// second. Pool is capped at MAX_PARTICLES so a chain of fast
// destructions can't blow up GPU upload bandwidth — oldest particles
// are dropped first.
//
// Currently fires only from EditorController (left-click). Sim systems
// (erosion, hydraulic) deliberately do NOT spawn debris because they
// destroy voxels at high frequency and the screen would saturate. If
// we want gameplay-driven destruction (projectiles, AOE explosions)
// they should call this module directly.

// Mirror of render/voxelrenderer.js PALETTE so debris colors match
// the destroyed voxel. v398 — also consults the MaterialRegistry
// (for WAD palette swap, atlas materials, etc); local table is only
// the legacy-id fallback when registry doesn't have an entry.
import { getMaterialRegistry } from "../engine/MaterialRegistry.js";

const VOXEL_COLOR = {
    1:  [0.65, 0.65, 0.70],   // STONE
    2:  [0.60, 0.50, 0.30],   // DIRT
    3:  [0.30, 0.80, 0.30],   // GRASS
    4:  [0.92, 0.85, 0.55],   // SAND
    10: [0.20, 0.45, 0.85],   // WATER
    11: [0.25, 0.55, 0.95],   // FLOWING_WATER
    12: [0.95, 0.40, 0.10],   // LAVA
    20: [0.10, 0.10, 0.15],   // SCREEN
    30: [0.20, 0.95, 0.95],   // MEMORY
};
const DEFAULT_COLOR = [0.7, 0.7, 0.7];

const GRAVITY               = -25.0;     // world-units / sec²
const MAX_AGE               = 1.0;       // seconds before despawn
const MAX_PARTICLES         = 400;       // cap on simultaneous active
const PARTICLES_PER_BREAK   = 6;
const PARTICLE_BASE_SCALE   = 0.25;      // world units, shrinks with age
const HORIZ_SPEED_MIN       = 2;
const HORIZ_SPEED_MAX       = 6;
const VERT_BURST_MIN        = 4;
const VERT_BURST_MAX        = 8;
const FLOOR_Y               = 0;         // particles below this just despawn

export class VoxelDebrisSystem {
    constructor() {
        this.particles = [];
        this.totalSpawned = 0;
    }

    // x, y, z are integer voxel coords. voxelType is the value the
    // voxel had immediately before destruction (used to color debris).
    spawn(x, y, z, voxelType) {
        if (voxelType === 0) return;     // destroying air → no debris
        // v398 — registry first, legacy local table as fallback.
        const color = getMaterialRegistry().getColor(voxelType) ||
                       VOXEL_COLOR[voxelType] || DEFAULT_COLOR;
        const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;

        for (let i = 0; i < PARTICLES_PER_BREAK; i++) {
            // Pool full → drop oldest. Gives newer destructions priority.
            if (this.particles.length >= MAX_PARTICLES) {
                this.particles.shift();
            }
            const ang = Math.random() * Math.PI * 2;
            const horizSpeed = HORIZ_SPEED_MIN +
                               Math.random() * (HORIZ_SPEED_MAX - HORIZ_SPEED_MIN);
            const vertBurst  = VERT_BURST_MIN +
                               Math.random() * (VERT_BURST_MAX - VERT_BURST_MIN);
            this.particles.push({
                x: cx + (Math.random() - 0.5) * 0.3,
                y: cy + (Math.random() - 0.5) * 0.3,
                z: cz + (Math.random() - 0.5) * 0.3,
                vx: Math.cos(ang) * horizSpeed,
                vy: vertBurst,
                vz: Math.sin(ang) * horizSpeed,
                r: color[0],
                g: color[1],
                b: color[2],
                age: 0,
            });
            this.totalSpawned++;
        }
    }

    // Per-frame physics step. Cheap; no terrain collision (would cost
    // a getVoxel per particle per frame). Particles just fly through
    // the world and despawn at MAX_AGE or when they fall below FLOOR_Y.
    update(dt) {
        if (dt > 0.1) dt = 0.1;          // clamp on big stalls
        const survivors = [];
        for (const p of this.particles) {
            p.age += dt;
            if (p.age >= MAX_AGE) continue;
            p.vy += GRAVITY * dt;
            p.x  += p.vx * dt;
            p.y  += p.vy * dt;
            p.z  += p.vz * dt;
            if (p.y < FLOOR_Y) continue;
            survivors.push(p);
        }
        this.particles = survivors;
    }

    // Pack active particles into a Float32Array of [x, y, z, scale,
    // r, g, b] per instance, ready for the renderer to upload directly.
    // Scale shrinks with age so particles fade out by visibly shrinking
    // — feels more punchy than a constant-size pop.
    getInstanceData() {
        const n = this.particles.length;
        const buf = new Float32Array(n * 7);
        for (let i = 0; i < n; i++) {
            const p = this.particles[i];
            const lifeFrac = 1 - (p.age / MAX_AGE);
            const scale = PARTICLE_BASE_SCALE * lifeFrac;
            const o = i * 7;
            buf[o + 0] = p.x;
            buf[o + 1] = p.y;
            buf[o + 2] = p.z;
            buf[o + 3] = scale;
            buf[o + 4] = p.r;
            buf[o + 5] = p.g;
            buf[o + 6] = p.b;
        }
        return { data: buf, count: n };
    }

    snapshot() {
        return {
            active: this.particles.length,
            spawned: this.totalSpawned,
        };
    }
}
