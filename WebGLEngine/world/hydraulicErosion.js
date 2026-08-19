// FILE: world/hydraulicErosion.js
// VERSION: v2 - BOUNDED + STUCK DETECTION + WATER THRESHOLD DEATH
//
// Fixes from v1:
//   * Stuck-particle bug: when no air below, v1 left bestY = y, so the
//     particle stayed at the same cell forever, eroding it tick after
//     tick. v2 detects "no flow option" and kills the particle (or after
//     N stuck ticks if the cell becomes air via its own erosion).
//   * Water threshold death: particles with water < 0.05 are dropped
//     (v1 just decayed forever).
//   * Hard cap on flow.length so seed pushes can't grow unbounded if
//     called from rain → fluid → hydraulic chain.
//   * y > 1 guard preserved (don't erode bedrock).

import { VOXEL } from "./voxelFormat.js";

const MAX_FLOW       = 500;
const WATER_DEATH    = 0.05;
const MAX_STUCK_TICKS = 4;

export class HydraulicErosion {
    constructor(world) {
        this.world = world;
        this.flow = [];
        this.totalEroded = 0;
    }

    add(x, y, z) {
        if (this.flow.length >= MAX_FLOW) return;
        this.flow.push({
            x, y, z,
            water: 1.0,
            sediment: 0.0,
            stuck: 0,
        });
    }

    update() {
        const next = [];

        for (const p of this.flow) {
            if (next.length >= MAX_FLOW) break;
            if (p.water < WATER_DEATH) continue;
            if (p.stuck > MAX_STUCK_TICKS) continue;

            const { x, y, z, sediment } = p;
            let { water, stuck } = p;

            const chunk = this.world.getChunk(x, z);
            if (!chunk) continue;

            const lx = x - chunk.cx * chunk.size;
            const lz = z - chunk.cz * chunk.size;

            // Erode current cell (river carving)
            const v = chunk.get(lx, y, lz);
            if (v !== VOXEL.AIR && y > 1 && v !== VOXEL.WATER) {
                chunk.set(lx, y, lz, VOXEL.AIR);
                chunk.dirty = true;
                this.totalEroded++;
                let nextSed = sediment + 0.3;
                // Continue at SAME position next tick; the cell is now air
                // so flow will naturally find a way down.
                next.push({ x, y, z, water: water * 0.98, sediment: nextSed, stuck: 0 });
                continue;
            }

            // Find best downhill neighbor
            let bestX = null, bestY = null, bestZ = null;
            for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dz === 0) continue;
                    if (this.world.isAir(x + dx, y - 1, z + dz)) {
                        bestX = x + dx; bestY = y - 1; bestZ = z + dz;
                        break;
                    }
                }
                if (bestX !== null) break;
            }

            // Also check straight down
            if (bestX === null && this.world.isAir(x, y - 1, z)) {
                bestX = x; bestY = y - 1; bestZ = z;
            }

            if (bestX !== null) {
                next.push({
                    x: bestX, y: bestY, z: bestZ,
                    water: water * 0.98,
                    sediment,
                    stuck: 0,
                });
            } else {
                // Stuck — couldn't go anywhere. Live a few more ticks then
                // die. Allows nearby erosion to free up a path.
                next.push({ x, y, z, water: water * 0.95, sediment, stuck: stuck + 1 });
            }
        }

        this.flow = next;
    }

    snapshot() {
        return { flow: this.flow.length, eroded: this.totalEroded };
    }
}
