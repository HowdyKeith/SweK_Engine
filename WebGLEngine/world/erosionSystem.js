// FILE: world/erosionSystem.js
// VERSION: v2 - BOUNDED + AIR-ONLY SPREAD + WATER THRESHOLD
//
// Fixes from v1:
//   * Spreads only to AIR neighbors (v1 spawned 4 children unconditionally
//     → exponential growth in confined regions)
//   * Hard cap on `steps.length` (default 500)
//   * water threshold death (v1 decayed forever, never dropped)
//
// Independent from HydraulicErosion: this one models broad surface
// erosion (water spreads outward, eroding what it touches), while
// HydraulicErosion follows downhill paths (river carving). Either or
// both can run; nothing seeds ErosionSystem in the default demo, so
// it stays at zero particles unless something calls addDrop().

import { VOXEL } from "./voxelFormat.js";

const MAX_STEPS   = 500;
const WATER_DEATH = 0.05;

export class ErosionSystem {
    constructor(world) {
        this.world = world;
        this.steps = [];
        this.totalEroded = 0;
    }

    addDrop(x, y, z, strength = 1.0) {
        if (this.steps.length >= MAX_STEPS) return;
        this.steps.push({ x, y, z, water: strength, sediment: 0 });
    }

    update() {
        const next = [];

        for (const d of this.steps) {
            if (next.length >= MAX_STEPS) break;
            if (d.water < WATER_DEATH) continue;

            const { x, y, z, water } = d;
            let sediment = d.sediment;

            const chunk = this.world.getChunk(x, z);
            if (!chunk) continue;

            const lx = x - chunk.cx * chunk.size;
            const lz = z - chunk.cz * chunk.size;
            const current = chunk.get(lx, y, lz);

            // Erode terrain (skip water + bedrock)
            if (current !== VOXEL.AIR && current !== VOXEL.WATER && y > 1) {
                chunk.set(lx, y, lz, VOXEL.AIR);
                chunk.dirty = true;
                sediment += 0.2;
                this.totalEroded++;
            }

            // Flow down preferentially
            if (this.world.isAir(x, y - 1, z)) {
                next.push({ x, y: y - 1, z, water: water * 0.97, sediment });
                continue;
            }

            // Otherwise spread sideways into AIR neighbors only
            for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                if (next.length >= MAX_STEPS) break;
                if (this.world.isAir(x + dx, y, z + dz)) {
                    next.push({
                        x: x + dx, y, z: z + dz,
                        water: water * 0.93, sediment,
                    });
                }
            }
        }

        this.steps = next;
    }

    snapshot() {
        return { steps: this.steps.length, eroded: this.totalEroded };
    }
}
