// FILE: world/caveDwellerSpawns.js
// VERSION: v1 - cave dwellers
//
// caveCarver carves out subsurface voids but nothing ever populates them. This finds valid spawn points INSIDE those
// caves - air pockets that have a solid floor to stand on, headroom to fit, and that sit far enough below the surface to
// be genuinely enclosed (so we don't spawn things in open-air pits or surface dips) - and hands them to a spawn callback.
//
// The finder is pure (a voxelAt(x,y,z) accessor + a region in), so it's unit-testable headless. The orchestrator wires it
// to a live VoxelWorld; the spawn callback itself (which creates the actual creature) is injected by the caller.

import { VOXEL } from "./voxelFormat.js";

// A floor must be walkable solid - not air, water or lava. A cell counts as air if it's empty (0 / undefined).
const SOLID = (c) => c > 0 && c !== VOXEL.WATER && c !== VOXEL.FLOWING_WATER && c !== VOXEL.LAVA;
const AIR = (c) => !c;

// Scan a voxel region and return cave-interior spawn points. voxelAt(x,y,z) returns a VOXEL code.
// A point (x,y,z) qualifies when: the cell + `headroom` cells above are air, the cell directly below is solid (a floor),
// and the cell is at least `minDepth` below this column's surface (the highest solid) - which guarantees terrain overhead,
// i.e. an enclosed cave rather than an open pit. Accepted points are kept `minSpacing` apart, capped at `maxSpawns`.
function findCaveSpawns(voxelAt, region, opts = {}) {
    const { x0, x1, z0, z1, yMin = 1, yMax } = region;
    const headroom   = opts.headroom   ?? 2;
    const minDepth   = opts.minDepth   ?? 3;
    const minSpacing = opts.minSpacing ?? 6;
    const maxSpawns  = opts.maxSpawns  ?? 24;
    const solid = opts.isSolid || SOLID;
    const air   = opts.isAir   || AIR;
    const out = [];
    const farEnough = (x, y, z) => out.every((p) => (Math.abs(p.x - x) + Math.abs(p.y - y) + Math.abs(p.z - z)) >= minSpacing);

    for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
            let surfaceY = -1;
            for (let y = yMax; y >= yMin; y--) { if (solid(voxelAt(x, y, z))) { surfaceY = y; break; } }
            if (surfaceY < yMin + minDepth) continue;                       // column too shallow to hold a buried cave
            for (let y = yMin; y <= surfaceY - minDepth; y++) {
                if (!solid(voxelAt(x, y - 1, z))) continue;                 // need a solid floor underfoot
                let clear = true;
                for (let h = 0; h < headroom; h++) if (!air(voxelAt(x, y + h, z))) { clear = false; break; }
                if (!clear) continue;                                       // need air for the body to fit
                if (!farEnough(x, y, z)) continue;
                out.push({ x, y, z });
                if (out.length >= maxSpawns) return out;
                break;                                                      // one dweller per column
            }
        }
    }
    return out;
}

// Find cave spawns in a square region around (cx,cz) of a live world, then call spawnFn(x,y,z) for each, up to `budget`.
// spawnFn returns false to reject a point (e.g. spawn failed). Unloaded columns are treated as solid so we never spawn at
// the ragged edge of loaded terrain. Returns { found, spawned, points }.
function spawnCaveDwellers(world, spawnFn, opts = {}) {
    const read = world && (world.voxelAt ? world.voxelAt.bind(world) : (world.getVoxel ? world.getVoxel.bind(world) : null));
    if (!read || typeof spawnFn !== "function") return { found: 0, spawned: 0, points: [] };
    const cx = Math.round(opts.cx || 0), cz = Math.round(opts.cz || 0);
    const radius = opts.radius ?? 40;
    const budget = opts.budget ?? 3;
    const yMax = opts.yMax ?? ((world.chunks?.values?.().next?.().value?.height ?? 64) - 1);
    const hasChunk = world.getChunk ? world.getChunk.bind(world) : null;
    const guarded = hasChunk ? (x, y, z) => (hasChunk(x, z) ? read(x, y, z) : 1) : read;
    const region = { x0: cx - radius, x1: cx + radius, z0: cz - radius, z1: cz + radius, yMin: 2, yMax };
    const points = findCaveSpawns(guarded, region, {
        maxSpawns: budget * 4, minSpacing: opts.minSpacing ?? 8,
        headroom: opts.headroom ?? 2, minDepth: opts.minDepth ?? 3,
    });
    let spawned = 0;
    for (const p of points) {
        if (spawned >= budget) break;
        try { if (spawnFn(p.x, p.y, p.z) !== false) spawned++; } catch (e) {}
    }
    return { found: points.length, spawned, points };
}

// Drives spawnCaveDwellers on a timer around a moving center. tick() is timestamp-based so it's independent of frame dt
// units. enabled defaults on; pass enabled:false to keep it dormant.
class CaveDwellerSpawner {
    constructor(world, spawnFn, opts = {}) {
        this.world = world; this.spawnFn = spawnFn;
        this.intervalMs = opts.intervalMs ?? 18000;
        this.opts = opts; this.enabled = opts.enabled ?? true;
        this._cx = 0; this._cz = 0; this._last = 0;
        this.waves = 0; this.totalSpawned = 0;
    }
    setCenter(x, z) { this._cx = Math.round(x || 0); this._cz = Math.round(z || 0); }
    tick(nowMs) {
        if (!this.enabled) return null;
        if (!this._last) { this._last = nowMs; return null; }              // first call seeds the clock
        if (nowMs - this._last < this.intervalMs) return null;
        this._last = nowMs; this.waves++;
        const res = spawnCaveDwellers(this.world, this.spawnFn, Object.assign({ cx: this._cx, cz: this._cz }, this.opts));
        this.totalSpawned += res.spawned;
        return res;
    }
}

export { findCaveSpawns, spawnCaveDwellers, CaveDwellerSpawner };
