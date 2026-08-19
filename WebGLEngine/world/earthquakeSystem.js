// FILE: world/earthquakeSystem.js
// VERSION: v1 — EARTHQUAKES: tear jagged fissures that split the ground open
//
// A fissure is a crack carved along a line: at each step we find the surface and
// gouge a column of voxels out down to some depth, with a wandering path and a
// jagged floor so it reads like the earth ripped apart rather than a tidy trench.
// A quake spawns several fissures radiating (and forking) from an epicentre and
// reports its region so the driver can shake the camera and shrug loose slopes
// down into the cracks. Optionally the fissure floor is LAVA (a rift).
//
// Carving only removes voxels down to a stone floor it leaves intact (never digs
// below y=1), and every write is getChunk-guarded.

import { VOXEL } from "./voxelFormat.js";

const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class EarthquakeSystem {
    constructor(world) {
        this.world = world;
        this.carved = 0;
        this.fissures = 0;
    }
    _maxY() { return this.world.chunks?.values?.().next?.().value?.height ?? 64; }

    _surfaceY(x, z) {
        const w = this.world; if (!w.getChunk(x, z)) return -1;
        for (let y = this._maxY() - 1; y >= 1; y--) if (w.voxelAt(x, y, z) !== VOXEL.AIR) return y;
        return -1;
    }

    // Carve one crack from (x,z) heading along yaw for `length`, gouging `depth`
    // down with a wandering centreline and jagged floor. Returns voxels removed.
    fissure({ x, z, yaw = 0, length = 24, depth = 6, width = 1, lava = false } = {}) {
        const w = this.world;
        let dirX = Math.sin(yaw), dirZ = -Math.cos(yaw);   // yaw=0 → -Z (engine convention)
        let fx = x, fz = z, removed = 0;
        const half = Math.max(0, (width - 1) / 2);
        for (let step = 0; step < length; step++) {
            // wander the centreline a little each step
            dirX += (Math.random() - 0.5) * 0.25; dirZ += (Math.random() - 0.5) * 0.25;
            const m = Math.hypot(dirX, dirZ) || 1; dirX /= m; dirZ /= m;
            fx += dirX; fz += dirZ;
            const cx = Math.round(fx), cz = Math.round(fz);
            // perpendicular for width
            const px = -dirZ, pz = dirX;
            const stepDepth = Math.max(2, Math.round(depth + (Math.random() * 2 - 1) * 2));   // jagged floor
            for (let wOff = -Math.ceil(half); wOff <= Math.ceil(half); wOff++) {
                const gx = Math.round(cx + px * wOff), gz = Math.round(cz + pz * wOff);
                if (!w.getChunk(gx, gz)) continue;
                const sy = this._surfaceY(gx, gz);
                if (sy < 1) continue;
                const floorY = Math.max(1, sy - stepDepth);    // leave a stone floor; never below y=1
                for (let y = sy; y > floorY; y--) {
                    if (w.voxelAt(gx, y, gz) !== VOXEL.AIR) { w.setVoxel(gx, y, gz, VOXEL.AIR); removed++; }
                }
                if (lava) w.setVoxel(gx, floorY, gz, VOXEL.LAVA);
            }
        }
        this.carved += removed; this.fissures++;
        return { removed, end: { x: Math.round(fx), z: Math.round(fz) } };
    }

    // A quake: several fissures from an epicentre, scaled by magnitude (1..5),
    // with a chance to fork. Returns the affected region for the driver.
    quake({ centerX, centerZ, magnitude = 3, lava = false } = {}) {
        const mag = Math.max(1, Math.min(5, magnitude | 0));
        const n = 2 + mag;                       // number of primary rifts
        const length = 14 + mag * 6;
        const depth = 3 + mag * 2;
        let total = 0;
        for (let i = 0; i < n; i++) {
            const yaw = Math.random() * Math.PI * 2;
            const r = this.fissure({ x: centerX, z: centerZ, yaw, length, depth, width: 1 + (mag >= 4 ? 1 : 0), lava });
            total += r.removed;
            if (Math.random() < 0.5) {           // a fork partway out
                this.fissure({ x: r.end.x, z: r.end.z, yaw: yaw + (Math.random() - 0.5) * 1.4, length: length * 0.6, depth, width: 1, lava });
            }
        }
        const radius = length + 8;
        return { fissures: this.fissures, removed: total, region: { centerX, centerZ, radius } };
    }
}
