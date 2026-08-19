// FILE: world/floodSystem.js
// VERSION: v1 — BASIN FLOOD-FILL (LAKE) + VOLUME-CONSERVING RELEASE + DRAIN
//
// Builds on the same idea as the engine's orphan FluidSystem (voxel-cellular
// water), but purpose-built for the three scopes we want to "work through",
// one-shot (no frame-loop wiring) and writing through world.setVoxel (which
// already dirties + remeshes the chunk):
//
//   • LAKE (valley-fill)  — lake({x,z,level})        fill the connected basin
//                            up to a chosen waterline Y. Walls (terrain that
//                            rises above the waterline) contain it.
//   • PUDDLE              — release({x,z,volume}) small   a finite volume
//                            settles into the local low → a shallow pool.
//   • DAM-BREAK           — release({x,z,volume}) large   a big volume finds
//                            its equilibrium waterline and floods the basin.
//   • DRAIN               — drain({centerX,centerZ,radius})  remove water.
//
// release() is volume-conserving: it binary-searches the waterline whose basin
// capacity matches the requested volume, so "puddle" vs "dam-break" is a real
// behavioural difference (small vs large body of water), not just a label.
//
// NOTE: this is the END STATE (instant). Animated rushing water would need the
// system ticked each frame — a separate follow-up.

import { VOXEL } from "./voxelFormat.js";

// Cells water may occupy or flow through. Lava is treated as a solid barrier.
function isOpen(v) { return v === VOXEL.AIR || v === VOXEL.WATER || v === VOXEL.FLOWING_WATER; }

const FLOW_MAX = 6000;            // cap on simultaneously-active flowing water cells
const CARVABLE = new Set([VOXEL.DIRT, VOXEL.SAND, VOXEL.GRASS, VOXEL.SNOW, VOXEL.ASH]);  // loose bed a river can cut (stone/rubble/ice resist)
const fkey = (x, y, z) => x + "," + y + "," + z;

export class FloodSystem {
    constructor(world) {
        this.world = world;
        this.flow = new Map();    // key -> { x, y, z }  active flowing water cells (ticked)
        this.flowSettled = 0;
        this.springs = [];        // v505 — river sources: { x, y, z }
        this.carved = 0;
        // v517 — current field: key -> { vx, vy, vz, speed } for cells that MOVED
        // this tick. Settled water drops out (no current). Derived from the flow
        // moves, so it's free; consumed by foam viz, buoyancy, flash floods.
        this.velocity = new Map();
        // v530 — watershed: sediment budget. Material freed by the carve becomes
        // deposit budget (rough mass conservation), settled by depositSediment().
        this.sediment = 0;
        this._lastCarved = 0;
        // v944 — active lakes for re-flood: each { sx, sz, level, frontier:Set, maxCells }.
        // frontier = columns the fill WANTED to spread into but couldn't because their
        // chunk wasn't loaded yet. reflood() resumes from these as chunks stream in.
        this.lakes = [];
    }

    // v505 — rivers: a spring feeds water that flows + carves a channel.
    addSpring(x, y, z) { this.springs.push({ x: x | 0, y: y | 0, z: z | 0 }); return { springs: this.springs.length }; }
    clearSprings() { this.springs = []; }
    pumpSprings(amount = 2) { let placed = 0; for (const s of this.springs) placed += this.gush(s.x, s.y, s.z, amount).placed; return { placed, springs: this.springs.length }; }

    _maxY() {
        const anyChunk = this.world.chunks?.values?.().next?.().value;
        return anyChunk?.height ?? 64;
    }

    // Highest solid terrain top at/below `level` for column (x,z); -1 if none.
    _floorAt(x, z, level) {
        for (let y = level; y >= 0; y--) {
            if (!isOpen(this.world.voxelAt(x, y, z))) return y;
        }
        return -1;
    }

    // ---- DRY BASIN SCAN: count air cells fillable up to `level` -------------
    // Same BFS as lake() but counts instead of placing — used by release() to
    // size the waterline. Bounded to loaded chunks + maxCells.
    _basinVolume(x, z, level, maxCells) {
        const world = this.world;
        const sx = Math.round(x), sz = Math.round(z);
        const q = [[sx, sz]];
        const seen = new Set([sx + "," + sz]);
        let vol = 0;
        while (q.length) {
            const [cx, cz] = q.shift();
            const floor = this._floorAt(cx, cz, level);
            if (floor >= level) continue;                 // wall — contains the water
            for (let y = floor + 1; y <= level; y++) {
                if (world.voxelAt(cx, y, cz) === VOXEL.AIR) { vol++; if (vol >= maxCells) return vol; }
            }
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, nz = cz + dz, key = nx + "," + nz;
                if (seen.has(key)) continue;
                if (!world.getChunk(nx, nz)) continue;     // stay inside the loaded world
                seen.add(key);
                q.push([nx, nz]);
            }
        }
        return vol;
    }

    // ---- CORE BFS FILL (resumable) ----------------------------------------
    // Fills connected air columns up to `level` starting from `seeds`. Columns
    // whose chunk isn't loaded are recorded in `frontier` (to resume later via
    // reflood). frontOnly=true confines the BFS to the wetting front (columns
    // that actually placed water) so a re-flood doesn't crawl back across the
    // already-filled basin.
    _fillFrom(seeds, level, maxCells, frontier, frontOnly) {
        const world = this.world;
        const q = seeds.slice();
        const seen = new Set(q.map(([x, z]) => x + "," + z));
        let placed = 0;
        while (q.length) {
            const [cx, cz] = q.shift();
            const floor = this._floorAt(cx, cz, level);
            if (floor >= level) continue;                 // wall — contains the water
            let here = 0;
            for (let y = floor + 1; y <= level; y++) {
                if (world.voxelAt(cx, y, cz) === VOXEL.AIR) {
                    world.setVoxel(cx, y, cz, VOXEL.WATER);
                    here++; placed++;
                    if (placed >= maxCells) return { placed, capped: true };
                }
            }
            if (frontOnly && here === 0) continue;         // don't re-crawl filled basin
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, nz = cz + dz, key = nx + "," + nz;
                if (seen.has(key)) continue;
                if (!world.getChunk(nx, nz)) { if (frontier) frontier.add(key); continue; }
                seen.add(key);
                q.push([nx, nz]);
            }
        }
        return { placed, capped: false };
    }

    _recordLake(sx, sz, level, frontier, maxCells) {
        // Replace any near-identical lake (same level, ~same seed) then cap the list.
        this.lakes = this.lakes.filter(l => !(Math.abs(l.sx - sx) < 2 && Math.abs(l.sz - sz) < 2 && l.level === level));
        this.lakes.push({ sx, sz, level, frontier, maxCells, ts: Date.now() });
        if (this.lakes.length > 12) this.lakes = this.lakes.slice(-12);
    }

    // ---- LAKE: fill the connected basin up to waterline `level` ------------
    lake({ x, z, level, maxCells = 2_000_000 } = {}) {
        const maxY = this._maxY();
        level = Math.min(maxY - 1, Math.max(1, Math.round(level)));
        const sx = Math.round(x), sz = Math.round(z);
        const frontier = new Set();
        const r = this._fillFrom([[sx, sz]], level, maxCells, frontier, false);
        this._recordLake(sx, sz, level, frontier, maxCells);
        return { placed: r.placed, level, capped: r.capped, frontier: frontier.size };
    }

    // ---- REFLOOD: resume active lakes into chunks that have since streamed in.
    // Bounded per call (budget) so it never stalls a frame. Self-terminating:
    // lakes with an empty frontier are dropped. Returns what it did this pass.
    reflood({ budget = 25000 } = {}) {
        const world = this.world;
        let placed = 0, advanced = 0;
        for (const lake of this.lakes) {
            if (placed >= budget) break;
            const ready = [];
            const stillBlocked = new Set();
            for (const key of lake.frontier) {
                const [nx, nz] = key.split(",").map(Number);
                if (world.getChunk(nx, nz)) ready.push([nx, nz]); else stillBlocked.add(key);
            }
            lake.frontier = stillBlocked;
            if (!ready.length) continue;
            const r = this._fillFrom(ready, lake.level, budget - placed, lake.frontier, true);
            placed += r.placed; advanced++;
        }
        this.lakes = this.lakes.filter(l => l.frontier.size > 0);
        return { placed, advanced, activeLakes: this.lakes.length };
    }

    // ---- RELEASE: fill a fixed VOLUME of water to its equilibrium level -----
    release({ x, z, volume = 1500, maxCells = 2_000_000 } = {}) {
        const maxY = this._maxY();
        const sx = Math.round(x), sz = Math.round(z);
        const bedFloor = this._floorAt(sx, sz, maxY - 1);
        let lo = Math.max(1, bedFloor + 1), hi = maxY - 1;
        const want = Math.min(volume, maxCells);
        // Binary-search the waterline whose basin capacity ≈ requested volume.
        for (let it = 0; it < 12 && lo < hi; it++) {
            const mid = Math.floor((lo + hi + 1) / 2);
            const cap = this._basinVolume(sx, sz, mid, maxCells);
            if (cap <= want) lo = mid; else hi = mid - 1;
        }
        return this.lake({ x: sx, z: sz, level: lo, maxCells });
    }

    // ---- DRAIN: remove water in a region (or whole world if no region) ------
    drain({ centerX = null, centerZ = null, radius = 64 } = {}) {
        const world = this.world;
        const maxY = this._maxY();
        let removed = 0;
        const scanCol = (x, z) => {
            for (let y = 0; y < maxY; y++) {
                const v = world.voxelAt(x, y, z);
                if (v === VOXEL.WATER || v === VOXEL.FLOWING_WATER) { world.setVoxel(x, y, z, VOXEL.AIR); removed++; }
            }
        };
        if (centerX === null) {
            for (const chunk of world.chunks.values()) {
                const bx = chunk.cx * chunk.size, bz = chunk.cz * chunk.size;
                for (let lx = 0; lx < chunk.size; lx++)
                    for (let lz = 0; lz < chunk.size; lz++)
                        scanCol(bx + lx, bz + lz);
            }
        } else {
            const cx = Math.round(centerX), cz = Math.round(centerZ);
            for (let dz = -radius; dz <= radius; dz++)
                for (let dx = -radius; dx <= radius; dx++)
                    scanCol(cx + dx, cz + dz);
        }
        return { removed };
    }

    // ---- ticked animated flow (v495): water rushes + settles over time ----

    // Seed a column/burst of water at (x,y,z) that will then flow (spring / dam-break source).
    gush(x, y, z, amount = 6) {
        x |= 0; y |= 0; z |= 0;
        if (!this.world.getChunk(x, z)) return { placed: 0, active: this.flow.size };
        const maxY = this._maxY();
        let placed = 0;
        for (let i = 0; i < amount; i++) {
            const cy = y + i;
            if (cy < 1 || cy >= maxY) break;
            if (this.world.voxelAt(x, cy, z) !== VOXEL.AIR) continue;
            this.world.setVoxel(x, cy, z, VOXEL.WATER);
            this.flow.set(fkey(x, cy, z), { x, y: cy, z });
            placed++;
        }
        return { placed, active: this.flow.size };
    }

    // Register water ALREADY in the world (WAD flooded room, Lego/schematic, sea)
    // into the flow sim so it rushes/settles. Bounded + idempotent + chunk-guarded.
    adoptExisting({ centerX = null, centerZ = null, radius = null } = {}) {
        const world = this.world;
        let adopted = 0;
        for (const chunk of world.chunks.values()) {
            const S = chunk.size, H = chunk.height;
            const bx = chunk.cx * S, bz = chunk.cz * S;
            for (let lx = 0; lx < S; lx++) {
                const wx = bx + lx;
                if (radius != null && centerX != null && Math.abs(wx - centerX) > radius) continue;
                for (let lz = 0; lz < S; lz++) {
                    const wz = bz + lz;
                    if (radius != null && centerZ != null && Math.abs(wz - centerZ) > radius) continue;
                    for (let y = 1; y < H; y++) {
                        const v = chunk.get(lx, y, lz);
                        if (v !== VOXEL.WATER && v !== VOXEL.FLOWING_WATER) continue;
                        const k = fkey(wx, y, wz);
                        if (this.flow.has(k)) continue;
                        if (this.flow.size >= FLOW_MAX) return { adopted, active: this.flow.size, capped: true };
                        this.flow.set(k, { x: wx, y, z: wz });
                        adopted++;
                    }
                }
            }
        }
        return { adopted, active: this.flow.size, capped: false };
    }

    // v530 — WATERSHED additions (additive; never touch the carve in updateFlow).

    // Snowmelt: exposed snow below the melt line releases meltwater that joins the
    // flow → feeds streams that run downhill into the watershed. Non-destructive by
    // default (treats snowfields as a renewable source); deplete:true slowly eats
    // the snowcap back.
    snowmelt(cx, cz, { radius = 28, chance = 0.05, meltLine = 42, max = 60, deplete = false } = {}) {
        const world = this.world; cx |= 0; cz |= 0;
        const maxY = this._maxY();
        const topScan = Math.min(meltLine, maxY - 2);
        let melted = 0;
        for (let dx = -radius; dx <= radius && melted < max; dx += 2) {
            for (let dz = -radius; dz <= radius && melted < max; dz += 2) {
                const x = cx + dx, z = cz + dz;
                if (!world.getChunk(x, z)) continue;
                for (let y = topScan; y >= 2; y--) {
                    if (world.voxelAt(x, y, z) !== VOXEL.SNOW) continue;
                    if (world.voxelAt(x, y + 1, z) !== VOXEL.AIR) break;   // buried snow stays frozen
                    if (Math.random() < chance) {
                        world.setVoxel(x, y + 1, z, VOXEL.WATER);
                        this.flow.set(fkey(x, y + 1, z), { x, y: y + 1, z });
                        if (deplete && Math.random() < 0.25) world.setVoxel(x, y, z, VOXEL.AIR);
                        melted++;
                    }
                    break;   // only the topmost exposed snow per column
                }
            }
        }
        return { melted, active: this.flow.size };
    }

    // Sediment / deltas: material the river carved (this.carved) becomes a deposit
    // budget that settles in slow / still water, raising the bed — so deltas grow
    // where streams meet lakes/sea and pools slowly silt. Total deposited can't
    // exceed total carved (rough mass conservation), which also bounds it.
    depositSediment(cx = null, cz = null, { radius = 40, max = 40, slowSpeed = 0.5 } = {}) {
        const world = this.world;
        const freed = this.carved - this._lastCarved;
        this._lastCarved = this.carved;
        if (freed > 0) this.sediment += freed;
        if (this.sediment <= 0) return { deposited: 0, budget: this.sediment };
        let deposited = 0;
        for (const cell of this.flow.values()) {
            if (deposited >= max || this.sediment <= 0) break;
            const { x, y, z } = cell;
            if (cx != null && (Math.abs(x - cx) > radius || Math.abs(z - cz) > radius)) continue;
            if (!world.getChunk(x, z) || world.voxelAt(x, y, z) !== VOXEL.WATER) continue;
            const vel = this.velocity.get(fkey(x, y, z));
            if (vel && vel.speed > slowSpeed) continue;     // moving fast → still carrying, don't drop
            // find the lowest water cell of this column; deposit on the bed under it
            let lw = y;
            while (lw - 1 >= 1 && world.voxelAt(x, lw - 1, z) === VOXEL.WATER) lw--;
            if (world.voxelAt(x, lw - 1, z) !== VOXEL.AIR) {   // sitting on a real bed, not mid-air
                world.setVoxel(x, lw, z, VOXEL.SAND);
                this.flow.delete(fkey(x, lw, z));
                this.sediment--; deposited++;
            }
        }
        return { deposited, budget: this.sediment };
    }

    // Advance the flow with MASS-CONSERVING movement: each water cell moves once
    // (vacating its source) — falls if it can, else cascades sideways toward a
    // drop, else (if it has water stacked on top) shoves sideways to flatten the
    // pile; a cell that can do none SETTLES (stays put, leaves the active set).
    // Total water is conserved, so a gush/dam-break rushes + finds its level
    // instead of cloning itself. Bounded by FLOW_MAX. The one-shot lake()/
    // release() remain for instant fills.
    updateFlow(dt, { flowRate = 3, carveChance = 0 } = {}) {
        const world = this.world;
        const subSteps = Math.max(1, Math.round(flowRate));
        const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
        // v517 — per-move current speeds (voxels/step, roughly normalized).
        const SP_FALL = 1.0, SP_CASCADE = 0.9, SP_LATERAL = 0.45, SP_CARVE = 0.4;
        for (let s = 0; s < subSteps; s++) {
            if (!this.flow.size) break;
            const next = new Map();
            const nextVel = new Map();   // v517 — current field for THIS step's destinations
            for (const cell of this.flow.values()) {
                const { x, y, z } = cell;
                if (world.voxelAt(x, y, z) !== VOXEL.WATER) continue;        // vacated / drained
                // 1) fall straight down
                if (world.getChunk(x, z) && world.voxelAt(x, y - 1, z) === VOXEL.AIR) {
                    world.setVoxel(x, y, z, VOXEL.AIR);
                    world.setVoxel(x, y - 1, z, VOXEL.WATER);
                    next.set(fkey(x, y - 1, z), { x, y: y - 1, z });
                    nextVel.set(fkey(x, y - 1, z), { vx: 0, vy: -SP_FALL, vz: 0, speed: SP_FALL });
                    continue;
                }
                // 1b) river carve — water on a loose bed keeps cutting DOWN until it
                // reaches stone/rubble (then flows on). Stays active over diggable ground
                // so it doesn't pool and choke the channel.
                if (carveChance > 0 && world.getChunk(x, z) && CARVABLE.has(world.voxelAt(x, y - 1, z))) {
                    if (Math.random() < carveChance) { world.setVoxel(x, y - 1, z, VOXEL.AIR); this.carved++; }
                    next.set(fkey(x, y, z), { x, y, z });   // keep cutting next step
                    nextVel.set(fkey(x, y, z), { vx: 0, vy: -SP_CARVE, vz: 0, speed: SP_CARVE });
                    continue;
                }
                // 2) cascade sideways toward a drop (air neighbour with air below it)
                let moved = false;
                for (const [dx, dz] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
                    const nx = x + dx, nz = z + dz;
                    if (world.getChunk(nx, nz) && world.voxelAt(nx, y, nz) === VOXEL.AIR && world.voxelAt(nx, y - 1, nz) === VOXEL.AIR) {
                        world.setVoxel(x, y, z, VOXEL.AIR);
                        world.setVoxel(nx, y, nz, VOXEL.WATER);
                        next.set(fkey(nx, y, nz), { x: nx, y, z: nz });
                        nextVel.set(fkey(nx, y, nz), { vx: dx * SP_CASCADE, vy: 0, vz: dz * SP_CASCADE, speed: SP_CASCADE });
                        moved = true; break;
                    }
                }
                if (moved) continue;
                // 3) if stacked (water on top), shove sideways to flatten the pile
                if (world.voxelAt(x, y + 1, z) === VOXEL.WATER) {
                    for (const [dx, dz] of shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
                        const nx = x + dx, nz = z + dz;
                        if (world.getChunk(nx, nz) && world.voxelAt(nx, y, nz) === VOXEL.AIR) {
                            world.setVoxel(x, y, z, VOXEL.AIR);
                            world.setVoxel(nx, y, nz, VOXEL.WATER);
                            next.set(fkey(nx, y, nz), { x: nx, y, z: nz });
                            nextVel.set(fkey(nx, y, nz), { vx: dx * SP_LATERAL, vy: 0, vz: dz * SP_LATERAL, speed: SP_LATERAL });
                            moved = true; break;
                        }
                    }
                }
                if (!moved) this.flowSettled++;   // settled — water voxel stays
            }
            this.flow = next;
            this.velocity = nextVel;              // v517 — only moving cells carry a current
        }
        return { active: this.flow.size, settled: this.flowSettled };
    }

    // v517 — current field queries. getCurrent: the flow vector at an exact cell
    // (zero if that cell isn't moving). currentAt: the topmost moving water cell
    // in a column — the surface current a floating thing / boat would feel.
    getCurrent(x, y, z) {
        return this.velocity.get(fkey(x | 0, y | 0, z | 0)) || { vx: 0, vy: 0, vz: 0, speed: 0 };
    }
    currentAt(x, z, { scanTop = 56 } = {}) {
        x = x | 0; z = z | 0;
        for (let y = scanTop; y >= 1; y--) {
            const v = this.velocity.get(fkey(x, y, z));
            if (v) return { ...v, y };
        }
        return { vx: 0, vy: 0, vz: 0, speed: 0, y: null };
    }
    // Up to `max` fastest moving cells near a point — for the foam/current viz.
    currentSamples({ centerX = 0, centerZ = 0, radius = 48, max = 60, minSpeed = 0.5 } = {}) {
        const out = []; const R2 = radius * radius;
        for (const [k, v] of this.velocity) {
            if (v.speed < minSpeed) continue;
            const c = this.flow.get(k); if (!c) continue;
            const dx = c.x - centerX, dz = c.z - centerZ;
            if (dx * dx + dz * dz > R2) continue;
            out.push({ x: c.x, y: c.y, z: c.z, vx: v.vx, vy: v.vy, vz: v.vz, speed: v.speed });
            if (out.length >= max * 3) break;     // cheap cap before sort
        }
        out.sort((a, b) => b.speed - a.speed);
        return out.slice(0, max);
    }
    currentStats() {
        let n = 0, sum = 0, mx = 0;
        for (const v of this.velocity.values()) { n++; sum += v.speed; if (v.speed > mx) mx = v.speed; }
        return { cells: n, avgSpeed: n ? sum / n : 0, maxSpeed: mx };
    }

    clearFlow() { this.flow.clear(); this.flowSettled = 0; }

    // v516 — rain runoff. Scatter `drops` water voxels onto the top-solid voxel
    // of random columns within `radius` of a point, and enlist them in the flow
    // sim so updateFlow() routes them downhill — swelling river channels and
    // pooling in low ground (lowland flooding). Skips ungenerated / air-topped /
    // already-water columns. `minY` keeps drops above the sea so we don't just
    // re-fill the ocean. Returns { placed }.
    rainfall(centerX, centerZ, { drops = 30, radius = 60, minY = 9, scanTop = 56 } = {}) {
        const world = this.world; let placed = 0;
        const cx = centerX | 0, cz = centerZ | 0;
        for (let i = 0; i < drops; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
            const wx = (cx + Math.cos(a) * r) | 0, wz = (cz + Math.sin(a) * r) | 0;
            if (!world.getChunk(wx, wz)) continue;
            // Find the top solid voxel (first non-air, non-water from the top).
            let ty = -1;
            for (let y = scanTop; y >= 1; y--) {
                const v = world.voxelAt(wx, y, wz);
                if (v === VOXEL.AIR || v === VOXEL.WATER || v === VOXEL.FLOWING_WATER) continue;
                ty = y; break;
            }
            if (ty < minY) continue;                          // below sea / nothing found
            const py = ty + 1;
            if (world.voxelAt(wx, py, wz) !== VOXEL.AIR) continue;   // already wet/blocked
            if (this.flow.size >= FLOW_MAX) break;
            world.setVoxel(wx, py, wz, VOXEL.WATER);
            this.flow.set(fkey(wx, py, wz), { x: wx, y: py, z: wz });
            placed++;
        }
        return { placed };
    }

    // v516 — recede after the storm. Remove shallow ELEVATED water (a 1-deep
    // film sitting on solid ground above the sea) within `radius`, with `chance`
    // per cell. Deep bodies (water under water), river channels, and anything at
    // or below `minY` (the ocean) are left intact, so puddles dry up but lakes,
    // rivers, and the sea persist. Returns { removed }.
    evaporateShallow(centerX, centerZ, { radius = 80, chance = 0.15, minY = 9 } = {}) {
        const world = this.world; let removed = 0;
        const cx = centerX | 0, cz = centerZ | 0, R = radius | 0;
        for (const cell of [...this.flow.values()]) {
            const { x, y, z } = cell;
            if (y < minY) continue;                           // protect the sea
            const dx = x - cx, dz = z - cz;
            if (dx * dx + dz * dz > R * R) continue;
            const below = world.voxelAt(x, y - 1, z);
            if (below === VOXEL.WATER || below === VOXEL.FLOWING_WATER) continue;   // deep — keep
            const above = world.voxelAt(x, y + 1, z);
            if (above === VOXEL.WATER || above === VOXEL.FLOWING_WATER) continue;   // submerged — keep
            if (Math.random() >= chance) continue;
            world.setVoxel(x, y, z, VOXEL.AIR);
            this.flow.delete(fkey(x, y, z));
            removed++;
        }
        return { removed };
    }

    // v519 — flash flood: dump a tall slug of water onto the local ground over a
    // small footprint and enlist it in the flow sim, so updateFlow (run at a high
    // rate by the caller) rushes it downhill as a surge. Returns { placed, baseY }.
    surge(centerX, centerZ, { volume = 4000, radius = 3, height = 14 } = {}) {
        const world = this.world; let placed = 0;
        const cx = centerX | 0, cz = centerZ | 0, R = radius | 0;
        // local ground top at the center (first non-air, non-water from the top)
        let baseY = 1;
        for (let y = 58; y >= 1; y--) {
            const v = world.voxelAt(cx, y, cz);
            if (v !== VOXEL.AIR && v !== VOXEL.WATER && v !== VOXEL.FLOWING_WATER) { baseY = y + 1; break; }
        }
        for (let dz = -R; dz <= R && placed < volume; dz++) {
            for (let dx = -R; dx <= R && placed < volume; dx++) {
                if (dx * dx + dz * dz > R * R) continue;
                const wx = cx + dx, wz = cz + dz;
                if (!world.getChunk(wx, wz)) continue;
                for (let h = 0; h < height && placed < volume; h++) {
                    const y = baseY + h;
                    if (world.voxelAt(wx, y, wz) !== VOXEL.AIR) continue;
                    if (this.flow.size >= FLOW_MAX) return { placed, baseY };
                    world.setVoxel(wx, y, wz, VOXEL.WATER);
                    this.flow.set(fkey(wx, y, wz), { x: wx, y, z: wz });
                    placed++;
                }
            }
        }
        return { placed, baseY };
    }
}
