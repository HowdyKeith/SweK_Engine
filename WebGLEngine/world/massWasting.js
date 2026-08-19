// FILE: world/massWasting.js
// VERSION: v1 — SLOPE FAILURE: avalanche + mudslide/landslide, unified
//
// The new mechanic is the TRIGGER: angle of repose. Loose material (snow, sand,
// dirt, rubble, ash) piled steeper than it can hold breaks loose and cascades
// downhill, settling once the slope is stable again. One system, themed by
// material — SNOW fails on gentle slopes (avalanche), dirt/rubble need a steeper
// face (landslide/mudslide). STONE, ICE, GRASS, bedrock never fail.
//
//   • destabilize(region) — scan surfaces; any loose top voxel whose drop to a
//     downhill neighbour exceeds its repose threshold is set in motion.
//   • updateFlow(dt)      — mass-conserving downhill move (fall → cascade to a
//     lower neighbour → flatten a pile → settle), carrying the material id. The
//     voxel relocates (never clones), so a slide conserves mass and terminates
//     once every slope is within repose.
//   • tick()              — scan + advance (the driver calls this); natural
//     slides happen wherever a slope is over-steep (e.g. blizzard-piled snow).
//
// Ties into the rest: blizzard piles snow → avalanche; rain/flood saturates and
// erosion undercuts → landslide. Writes via world.setVoxel (auto-remesh).

import { VOXEL } from "./voxelFormat.js";

const FLOW_MAX = 8000;
const mkey = (x, y, z) => x + "," + y + "," + z;
const LOOSE = new Set([VOXEL.SNOW, VOXEL.SAND, VOXEL.DIRT, VOXEL.RUBBLE, VOXEL.ASH]);

export class MassWasting {
    constructor(world) {
        this.world = world;
        this.flow = new Map();   // key -> { x, y, z, mat }  material in motion
        this.params = { reposeSnow: 1, reposeLoose: 2, reposeSaturated: 1, saturationOn: true, forceSaturated: false, flowRate: 3, radius: 40 };
        this.failed = 0;
        this.settledN = 0;
    }
    setParams(p) { Object.assign(this.params, p); }
    _maxY() { return this.world.chunks?.values?.().next?.().value?.height ?? 64; }

    // max stable drop to a neighbour before this material slides
    _repose(mat) { return (mat === VOXEL.SNOW || mat === VOXEL.SAND) ? this.params.reposeSnow : this.params.reposeLoose; }

    // is this voxel saturated (water touching it)? Wet dirt/sand slides on gentler slopes.
    _nearWater(x, y, z) {
        const w = this.world;
        for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
            const v = w.voxelAt(x + dx, y + dy, z + dz);
            if (v === VOXEL.WATER || v === VOXEL.FLOWING_WATER) return true;
        }
        return false;
    }

    // highest non-air voxel of a column + its material
    _surfaceTop(x, z) {
        const w = this.world, maxY = this._maxY();
        for (let y = maxY - 1; y >= 1; y--) { const v = w.voxelAt(x, y, z); if (v !== VOXEL.AIR) return { y, v }; }
        return { y: -1, v: 0 };
    }

    // Detect over-steep loose surfaces in a region and set their top voxel in motion.
    destabilize({ centerX, centerZ, radius = this.params.radius } = {}) {
        const w = this.world, r = radius | 0;
        let started = 0;
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const x = centerX + dx, z = centerZ + dz;
                if (!w.getChunk(x, z)) continue;
                const top = this._surfaceTop(x, z);
                if (top.y < 1 || !LOOSE.has(top.v)) continue;
                let maxDrop = 0;
                for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (!w.getChunk(x + ox, z + oz)) continue;
                    const drop = top.y - this._surfaceTop(x + ox, z + oz).y;
                    if (drop > maxDrop) maxDrop = drop;
                }
                if (maxDrop > 0) {
                    let rep = this._repose(top.v);
                    if (this.params.saturationOn && top.v !== VOXEL.SNOW && (this.params.forceSaturated || this._nearWater(x, top.y, z))) rep = Math.min(rep, this.params.reposeSaturated);
                    if (maxDrop > rep) {
                        const k = mkey(x, top.y, z);
                        if (!this.flow.has(k) && this.flow.size < FLOW_MAX) {
                            this.flow.set(k, { x, y: top.y, z, mat: top.v });
                            started++; this.failed++;
                        }
                    }
                }
            }
        }
        return { started, active: this.flow.size };
    }

    updateFlow(dt) {
        const w = this.world;
        const sub = Math.max(1, Math.round(this.params.flowRate));
        const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
        for (let s = 0; s < sub; s++) {
            if (!this.flow.size) break;
            const next = new Map();
            for (const c of this.flow.values()) {
                const { x, y, z, mat } = c;
                if (w.voxelAt(x, y, z) !== mat) continue;          // already moved/overwritten
                // 1) fall
                if (w.getChunk(x, z) && w.voxelAt(x, y - 1, z) === VOXEL.AIR) {
                    w.setVoxel(x, y, z, VOXEL.AIR);
                    w.setVoxel(x, y - 1, z, mat);
                    next.set(mkey(x, y - 1, z), { x, y: y - 1, z, mat });
                    continue;
                }
                // 2) cascade toward a lower neighbour (air at this y with air below it)
                let moved = false;
                for (const [ox, oz] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
                    const nx = x + ox, nz = z + oz;
                    if (w.getChunk(nx, nz) && w.voxelAt(nx, y, nz) === VOXEL.AIR && w.voxelAt(nx, y - 1, nz) === VOXEL.AIR) {
                        w.setVoxel(x, y, z, VOXEL.AIR);
                        w.setVoxel(nx, y, nz, mat);
                        next.set(mkey(nx, y, nz), { x: nx, y, z: nz, mat });
                        moved = true; break;
                    }
                }
                if (moved) continue;
                // 3) flatten if buried (loose voxel stacked on top) — pile spreads
                if (LOOSE.has(w.voxelAt(x, y + 1, z))) {
                    for (const [ox, oz] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
                        const nx = x + ox, nz = z + oz;
                        if (w.getChunk(nx, nz) && w.voxelAt(nx, y, nz) === VOXEL.AIR) {
                            w.setVoxel(x, y, z, VOXEL.AIR);
                            w.setVoxel(nx, y, nz, mat);
                            next.set(mkey(nx, y, nz), { x: nx, y, z: nz, mat });
                            moved = true; break;
                        }
                    }
                }
                if (!moved) this.settledN++;   // settled — voxel stays as its material
            }
            this.flow = next;
        }
        return { active: this.flow.size, failed: this.failed, settled: this.settledN };
    }

    // scan for instability + advance the slide (driver calls this each tick)
    tick(centerX, centerZ) {
        this.destabilize({ centerX, centerZ });
        return this.updateFlow(0.1);
    }

    clear() { this.flow.clear(); }
}
