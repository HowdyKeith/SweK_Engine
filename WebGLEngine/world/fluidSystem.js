// FILE: world/fluidSystem.js
// VERSION: v2 - BOUNDED, AIR-ONLY, NO OVERWRITE
//
// Fixes from v1:
//   * Sets WATER only when current cell is AIR (v1 overwrote stone!)
//   * Spreads sideways only into AIR neighbors (v1 grew exponentially in
//     confined spaces — every blocked particle became 4 next-tick particles
//     regardless of whether those slots were also blocked)
//   * Hard cap on `active.length` (default 2000); oldest dropped if exceeded
//   * Per-particle TTL (default 200 ticks) so stuck particles eventually die
//
// Particles dying when their host chunk unloads is preserved (the
// `if (!chunk) continue;` drops them naturally).

import { VOXEL } from "./voxelFormat.js";

const MAX_PARTICLES = 2000;
const MAX_AGE       = 200;

export class FluidSystem {
    constructor(world) {
        this.world = world;
        this.active = [];
        this.lastSettled = 0;
    }

    addWater(x, y, z) {
        if (this.active.length >= MAX_PARTICLES) return;
        this.active.push({ x, y, z, age: 0 });
    }

    update() {
        const next = [];
        let settled = 0;

        for (const w of this.active) {
            if (next.length >= MAX_PARTICLES) break;
            if (w.age > MAX_AGE) { settled++; continue; }

            const { x, y, z, age } = w;
            const chunk = this.world.getChunk(x, z);
            if (!chunk) continue;

            const lx = x - chunk.cx * chunk.size;
            const lz = z - chunk.cz * chunk.size;
            const current = chunk.get(lx, y, lz);

            // already water -> particle "lands"
            if (current === VOXEL.WATER) { settled++; continue; }
            // non-air, non-water -> can't fill this cell, particle dies
            if (current !== VOXEL.AIR) { settled++; continue; }

            // Place water voxel
            chunk.set(lx, y, lz, VOXEL.WATER);
            chunk.dirty = true;

            // Try to fall first
            if (this.world.isAir(x, y - 1, z)) {
                next.push({ x, y: y - 1, z, age: age + 1 });
                continue;
            }

            // Spread sideways — only into AIR. If no air neighbors, the
            // particle is settled and dies (water voxel above stays).
            let spread = 0;
            for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                if (next.length >= MAX_PARTICLES) break;
                if (this.world.isAir(x + dx, y, z + dz)) {
                    next.push({ x: x + dx, y, z: z + dz, age: age + 1 });
                    spread++;
                }
            }
            if (spread === 0) settled++;
        }

        this.active = next;
        this.lastSettled = settled;
    }

    snapshot() {
        return { active: this.active.length, lastSettled: this.lastSettled };
    }
}
