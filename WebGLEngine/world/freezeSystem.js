// FILE: world/freezeSystem.js
// VERSION: v1 — SNOW ACCUMULATION + WATER→ICE FREEZING + THAW
//
// The cold sibling of the lava/lahar work. Two behaviours, both region-bounded
// (around a centre, so cost stays sane) and ticked by a gated driver in main.js:
//
//   • SNOW accumulation — each pass lays one SNOW(5) layer on exposed tops
//     (highest non-air, non-water voxel), building up to maxDepth over time.
//   • WATER → ICE — each pass freezes the top water voxel of a column to
//     ICE(13) and thickens existing ice downward up to `thickness`.
//
//   • THAW reverses it (ICE→WATER, SNOW→AIR).
//
// Writes through world.setVoxel (auto-dirty + remesh). Snow/freeze are
// precipitation/phase-change, not mass-conserving (snow is added from "sky").
// Console: window.freeze.snowHere() / .iceHere() / .thawHere().

import { VOXEL } from "./voxelFormat.js";

const isWater = (v) => v === VOXEL.WATER || v === VOXEL.FLOWING_WATER;

export class FreezeSystem {
    constructor(world) {
        this.world = world;
        this.params = { radius: 40, maxSnowDepth: 3, iceThickness: 2, freezeWater: true, snow: true };
    }
    setParams(p) { Object.assign(this.params, p); }
    _maxY() { const c = this.world.chunks?.values?.().next?.().value; return c?.height ?? 64; }

    // highest non-air, non-water voxel in a column (the walkable surface)
    _topSolidY(x, z) {
        const maxY = this._maxY();
        for (let y = maxY - 1; y >= 1; y--) {
            const v = this.world.voxelAt(x, y, z);
            if (v !== VOXEL.AIR && !isWater(v)) return y;
        }
        return -1;
    }

    // visit each column in the square region around a centre
    _eachColumn(centerX, centerZ, radius, fn) {
        const r = radius | 0;
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const x = centerX + dx, z = centerZ + dz;
                if (!this.world.getChunk(x, z)) continue;
                fn(x, z);
            }
        }
    }

    // Lay ONE snow layer on exposed tops, capped at maxDepth (call repeatedly to build up).
    snowfall({ centerX, centerZ, radius = this.params.radius, maxDepth = this.params.maxSnowDepth } = {}) {
        const world = this.world, maxY = this._maxY();
        let placed = 0;
        this._eachColumn(centerX, centerZ, radius, (x, z) => {
            const top = this._topSolidY(x, z);
            if (top < 0) return;
            // count snow already stacked on top
            let depth = 0;
            for (let y = top; y >= 1 && world.voxelAt(x, y, z) === VOXEL.SNOW; y--) depth++;
            if (depth >= maxDepth) return;
            const ny = top + 1;
            if (ny >= maxY) return;
            if (world.voxelAt(x, ny, z) !== VOXEL.AIR) return;   // sheltered (something above)
            world.setVoxel(x, ny, z, VOXEL.SNOW);
            placed++;
        });
        return { placed };
    }

    // Freeze the top water voxel of each column to ICE; thicken existing ice down to `thickness`.
    freezeWater({ centerX, centerZ, radius = this.params.radius, thickness = this.params.iceThickness } = {}) {
        const world = this.world, maxY = this._maxY();
        let frozen = 0;
        this._eachColumn(centerX, centerZ, radius, (x, z) => {
            // find topmost water voxel (water with non-water above it)
            let topW = -1;
            for (let y = maxY - 1; y >= 1; y--) {
                if (isWater(world.voxelAt(x, y, z))) { topW = y; break; }
            }
            if (topW < 0) {
                // no water — but maybe existing ice to thicken downward
                for (let y = maxY - 1; y >= 1; y--) {
                    if (world.voxelAt(x, y, z) === VOXEL.ICE) {
                        for (let k = 1; k < thickness; k++) {
                            if (isWater(world.voxelAt(x, y - k, z))) { world.setVoxel(x, y - k, z, VOXEL.ICE); frozen++; }
                            else break;
                        }
                        break;
                    }
                }
                return;
            }
            world.setVoxel(x, topW, z, VOXEL.ICE); frozen++;
            for (let k = 1; k < thickness; k++) {
                if (isWater(world.voxelAt(x, topW - k, z))) { world.setVoxel(x, topW - k, z, VOXEL.ICE); frozen++; }
                else break;
            }
        });
        return { frozen };
    }

    thaw({ centerX, centerZ, radius = this.params.radius } = {}) {
        const world = this.world, maxY = this._maxY();
        let melted = 0;
        this._eachColumn(centerX, centerZ, radius, (x, z) => {
            for (let y = 1; y < maxY; y++) {
                const v = world.voxelAt(x, y, z);
                if (v === VOXEL.ICE) { world.setVoxel(x, y, z, VOXEL.WATER); melted++; }
                else if (v === VOXEL.SNOW) { world.setVoxel(x, y, z, VOXEL.AIR); melted++; }
            }
        });
        return { melted };
    }

    // Plow a travelable ICE ribbon: a width×length strip from (x,z) along `yaw`
    // (0 = toward -Z, engine convention). Snow/water surfaces pack down to ICE;
    // bare ground gets an ice cap on top. This is the snow OGRE's plow — it lays
    // its own road ahead (the inverse of the OGRE's ASH track-marks). Returns {laid}.
    iceStrip({ x, z, yaw = 0, width = 5, length = 10 } = {}) {
        const world = this.world, maxY = this._maxY();
        const fx = Math.sin(yaw), fz = -Math.cos(yaw);   // forward
        const sx = -fz, sz = fx;                          // lateral (perpendicular)
        const half = (width - 1) / 2;
        const seen = new Set();
        let laid = 0;
        for (let i = 0; i < length; i++) {
            for (let j = -half; j <= half; j++) {
                const cx = Math.round(x + fx * i + sx * j);
                const cz = Math.round(z + fz * i + sz * j);
                const key = cx + "," + cz;
                if (seen.has(key)) continue; seen.add(key);
                if (!world.getChunk(cx, cz)) continue;
                let top = -1, topV = 0;
                for (let y = maxY - 1; y >= 1; y--) { const v = world.voxelAt(cx, y, cz); if (v !== VOXEL.AIR) { top = y; topV = v; break; } }
                if (top < 0) continue;
                if (topV === VOXEL.SNOW || isWater(topV)) { world.setVoxel(cx, top, cz, VOXEL.ICE); laid++; }
                else if (topV !== VOXEL.ICE && top + 1 < maxY) { world.setVoxel(cx, top + 1, cz, VOXEL.ICE); laid++; }
            }
        }
        return { laid };
    }

    // one tick of accumulation (driver calls this)
    tick(centerX, centerZ) {
        const out = { placed: 0, frozen: 0 };
        if (this.params.freezeWater) out.frozen = this.freezeWater({ centerX, centerZ }).frozen;
        if (this.params.snow)        out.placed = this.snowfall({ centerX, centerZ }).placed;
        return out;
    }
}
