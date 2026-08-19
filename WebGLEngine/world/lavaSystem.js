// FILE: world/lavaSystem.js
// VERSION: v1 — VISCOUS CELLULAR LAVA: FLOW + TIMED COOL-TO-ROCK + WATER FREEZE
//
// Unlike flooding (one-shot), lava is temporal: it creeps downhill/outward,
// then freezes into rock after a while, and chills on contact with water. So
// this system is TICKED (the main.js driver runs update(dt) on an interval
// while enabled — no hot-render-loop edit needed) and writes through
// world.setVoxel (auto-dirties + remeshes the chunk).
//
// Every behaviour is a parameter (driven from the SETTINGS → Lava tab):
//   flowRate    flow sub-steps per tick   (higher = creeps faster/further)
//   viscosity   0..1 sideways-spread resistance (higher = thicker, less spread)
//   coolSeconds lifetime before a lava cell freezes
//   coolTarget  VOXEL it freezes into (STONE or RUBBLE)
//   waterCool   freeze instantly (+steam) when touching water
//
//   erupt(x,y,z, amount)  seed a lava column
//   update(dt)            advance flow + cooling (called by the driver)
//   coolAll()             freeze every tracked lava cell now
//   clearAll()            remove every tracked lava cell (→ AIR)

import { VOXEL } from "./voxelFormat.js";

const MAX_LAVA = 4000;            // hard cap on simultaneously-active lava cells
const key = (x, y, z) => x + "," + y + "," + z;

export class LavaSystem {
    constructor(world) {
        this.world = world;
        this.cells = new Map();   // key -> { x, y, z, age }
        this.params = {
            flowRate:    2,
            viscosity:   0.5,
            coolSeconds: 8,
            coolTarget:  VOXEL.RUBBLE,
            waterCool:   true,
        };
        this.totalFrozen = 0;
    }

    setParams(p) { Object.assign(this.params, p); }
    _maxY() { const c = this.world.chunks?.values?.().next?.().value; return c?.height ?? 64; }

    // Seed a vertical lava column at (x,y,z) going up `amount` cells.
    erupt(x, y, z, amount = 4) {
        x |= 0; y |= 0; z |= 0;
        const maxY = this._maxY();
        let placed = 0;
        for (let i = 0; i < amount; i++) {
            const cy = y + i;
            if (cy < 1 || cy >= maxY) break;
            if (this.world.voxelAt(x, cy, z) !== VOXEL.AIR) continue;
            this.world.setVoxel(x, cy, z, VOXEL.LAVA);
            this.cells.set(key(x, cy, z), { x, y: cy, z, age: 0 });
            placed++;
        }
        return { placed, active: this.cells.size };
    }

    _touchesWater(x, y, z) {
        const w = this.world;
        const N = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
        for (const [dx, dy, dz] of N) {
            const v = w.voxelAt(x + dx, y + dy, z + dz);
            if (v === VOXEL.WATER || v === VOXEL.FLOWING_WATER) return true;
        }
        return false;
    }

    _steam(x, y, z) {
        const p = (typeof window !== "undefined") ? window.gpuParticles : null;
        if (!p?.spawn) return;
        for (let i = 0; i < 4; i++) {
            p.spawn({ x: x + 0.5, y: y + 0.8, z: z + 0.5,
                vx: (Math.random() - 0.5) * 0.4, vy: 0.8 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.4,
                life: 1.2, size: 0.6, r: 0.85, g: 0.85, b: 0.9, shape: 0 });
        }
    }

    _freeze(cell, mat) {
        this.world.setVoxel(cell.x, cell.y, cell.z, mat);
        this.totalFrozen++;
    }

    // Register lava voxels that are ALREADY in the world (placed by a WAD
    // dungeon, Lego/schematic import, biome volcano, etc.) so the flow + cool
    // sim picks them up. Without this, pre-placed lava renders (it glows) but
    // sits static. Walks loaded chunks via chunk.get (cheap array index).
    // Small age jitter so a pit crusts over at staggered times, not all at once.
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
                        if (chunk.get(lx, y, lz) !== VOXEL.LAVA) continue;
                        const k = key(wx, y, wz);
                        if (this.cells.has(k)) continue;
                        if (this.cells.size >= MAX_LAVA) return { adopted, active: this.cells.size, capped: true };
                        this.cells.set(k, { x: wx, y, z: wz, age: Math.random() * 2 });
                        adopted++;
                    }
                }
            }
        }
        return { adopted, active: this.cells.size, capped: false };
    }

    update(dt) {
        const world = this.world;
        const { flowRate, viscosity, coolSeconds, coolTarget, waterCool } = this.params;
        const subSteps = Math.max(1, Math.round(flowRate));

        // --- cooling + water freeze (once per tick, uses real dt) ---
        const toFreeze = [];
        for (const cell of this.cells.values()) {
            cell.age += dt;
            if (waterCool && this._touchesWater(cell.x, cell.y, cell.z)) {
                toFreeze.push([cell, VOXEL.STONE, true]);   // pillow basalt + steam
            } else if (cell.age >= coolSeconds) {
                toFreeze.push([cell, coolTarget, false]);
            }
        }
        for (const [cell, mat, steam] of toFreeze) {
            this._freeze(cell, mat);
            if (steam) this._steam(cell.x, cell.y, cell.z);
            this.cells.delete(key(cell.x, cell.y, cell.z));
        }

        // --- flow advance (subSteps rings per tick) ---
        for (let s = 0; s < subSteps; s++) {
            if (this.cells.size >= MAX_LAVA) break;
            const adds = [];
            for (const cell of this.cells.values()) {
                if (this.cells.size + adds.length >= MAX_LAVA) break;
                const { x, y, z } = cell;
                // flow straight down into air
                if (world.voxelAt(x, y - 1, z) === VOXEL.AIR) {
                    adds.push({ x, y: y - 1, z });
                    continue;
                }
                // else spread sideways, gated by viscosity (thicker = rarer)
                if (Math.random() > viscosity) {
                    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
                    for (let i = dirs.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
                    for (const [dx, dz] of dirs) {
                        if (world.voxelAt(x + dx, y, z + dz) === VOXEL.AIR) { adds.push({ x: x + dx, y, z: z + dz }); break; }
                    }
                }
            }
            if (!adds.length) break;
            for (const a of adds) {
                const k = key(a.x, a.y, a.z);
                if (this.cells.has(k)) continue;
                if (!world.getChunk(a.x, a.z)) continue;   // stay inside the loaded world (setVoxel would no-op)
                if (world.voxelAt(a.x, a.y, a.z) !== VOXEL.AIR) continue;
                world.setVoxel(a.x, a.y, a.z, VOXEL.LAVA);
                this.cells.set(k, { x: a.x, y: a.y, z: a.z, age: 0 });
            }
        }
        return { active: this.cells.size, frozen: this.totalFrozen };
    }

    coolAll() {
        let n = 0;
        for (const cell of this.cells.values()) { this._freeze(cell, this.params.coolTarget); n++; }
        this.cells.clear();
        return { cooled: n };
    }

    clearAll() {
        let n = 0;
        for (const cell of this.cells.values()) { this.world.setVoxel(cell.x, cell.y, cell.z, VOXEL.AIR); n++; }
        this.cells.clear();
        return { cleared: n };
    }
}
