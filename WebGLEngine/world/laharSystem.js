// FILE: world/laharSystem.js
// VERSION: v1 — VOLCANIC LAHAR: mudflow that fuses flood + erosion + lava
//
// A lahar is a volcanic debris flow — water + ash + rock slurry that rushes
// downhill, scours the loose ground it passes, and dumps a mud/ash fan where
// it stalls. This is the payoff that ties the three systems together:
//
//   • FLOOD  — moves with the same mass-conserving water step (fall → cascade
//              toward a drop → flatten a pile → settle).
//   • EROSION— while flowing it SCOURS erodible banks (dirt/grass/sand/snow/ash)
//              into a suspended sediment load (bulking the flow).
//   • LAVA   — on contact it QUENCHES lava to stone with a steam burst (the
//              volcanic origin: water hitting hot rock is what spawns a lahar).
//
// Deposition: a cell that can no longer move SETTLES. If it carries sediment it
// dries into ASH (the mud deposit / fan); if it ran clear it stays WATER (the
// watery runout). While moving, a mud cell is a WATER voxel so it renders as
// flowing water (the palette has no brown "mud" id — honest limitation).
//
// Ticked by a gated driver in main.js (window.lahar.update(dt)); writes through
// world.setVoxel (auto-dirty + remesh). Console: window.lahar.triggerHere().

import { VOXEL } from "./voxelFormat.js";

const MAX_MUD = 6000;
const lkey = (x, y, z) => x + "," + y + "," + z;
const ERODIBLE = new Set([VOXEL.DIRT, VOXEL.GRASS, VOXEL.SAND, VOXEL.SNOW, VOXEL.ASH]);
const isOpen = (v) => v === VOXEL.AIR || v === VOXEL.WATER || v === VOXEL.FLOWING_WATER;

export class LaharSystem {
    constructor(world) {
        this.world = world;
        this.cells = new Map();   // key -> { x, y, z, sed }
        this.params = { flowRate: 3, erodePower: 1, maxSediment: 5, quenchLava: true };
        this.eroded = 0; this.deposited = 0; this.settled = 0;
    }

    setParams(p) { Object.assign(this.params, p); }
    _maxY() { const c = this.world.chunks?.values?.().next?.().value; return c?.height ?? 64; }

    _steam(x, y, z, n = 4) {
        const p = (typeof window !== "undefined") ? window.gpuParticles : null;
        if (!p?.spawn) return;
        for (let i = 0; i < n; i++) p.spawn({ x: x + 0.5, y: y + 0.8, z: z + 0.5,
            vx: (Math.random() - 0.5) * 0.5, vy: 0.9 + Math.random() * 0.7, vz: (Math.random() - 0.5) * 0.5,
            life: 1.3, size: 0.7, r: 0.8, g: 0.8, b: 0.85, shape: 0 });
    }

    // Seed a muddy column (volcanic mudflow source) carrying initial sediment.
    trigger(x, y, z, amount = 8, sediment = 3) {
        x |= 0; y |= 0; z |= 0;
        if (!this.world.getChunk(x, z)) return { placed: 0, active: this.cells.size };
        const maxY = this._maxY();
        let placed = 0;
        for (let i = 0; i < amount; i++) {
            const cy = y + i;
            if (cy < 1 || cy >= maxY) break;
            if (this.world.voxelAt(x, cy, z) !== VOXEL.AIR) continue;
            this.world.setVoxel(x, cy, z, VOXEL.WATER);
            this.cells.set(lkey(x, cy, z), { x, y: cy, z, sed: sediment });
            placed++;
        }
        return { placed, active: this.cells.size };
    }

    update(dt) {
        const world = this.world;
        const { flowRate, erodePower, maxSediment, quenchLava } = this.params;
        const sub = Math.max(1, Math.round(flowRate));
        const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
        for (let s = 0; s < sub; s++) {
            if (!this.cells.size) break;
            const next = new Map();
            for (const cell of this.cells.values()) {
                let { x, y, z, sed } = cell;
                if (world.voxelAt(x, y, z) !== VOXEL.WATER) continue;     // vacated / overwritten

                // LAVA quench — adjacent lava cools to stone + steam burst
                if (quenchLava) {
                    for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
                        if (world.voxelAt(x + dx, y + dy, z + dz) === VOXEL.LAVA) {
                            world.setVoxel(x + dx, y + dy, z + dz, VOXEL.STONE);
                            this._steam(x, y, z, 6);
                        }
                    }
                }

                // EROSION pickup — scour an erodible bank (same Y, solid below it) into suspended load
                if (sed < maxSediment) {
                    for (const [dx, dz] of shuffle([[1,0],[-1,0],[0,1],[0,-1]])) {
                        const nx = x + dx, nz = z + dz;
                        if (ERODIBLE.has(world.voxelAt(nx, y, nz)) && !isOpen(world.voxelAt(nx, y - 1, nz)) && world.getChunk(nx, nz)) {
                            world.setVoxel(nx, y, nz, VOXEL.AIR);
                            sed = Math.min(maxSediment, sed + erodePower);
                            this.eroded++;
                            break;
                        }
                    }
                }

                // MOVE (mass-conserving water step)
                // 1) fall
                if (world.getChunk(x, z) && world.voxelAt(x, y - 1, z) === VOXEL.AIR) {
                    world.setVoxel(x, y, z, VOXEL.AIR);
                    world.setVoxel(x, y - 1, z, VOXEL.WATER);
                    next.set(lkey(x, y - 1, z), { x, y: y - 1, z, sed });
                    continue;
                }
                // 2) cascade toward a drop
                let moved = false;
                for (const [dx, dz] of shuffle([[1,0],[-1,0],[0,1],[0,-1]])) {
                    const nx = x + dx, nz = z + dz;
                    if (world.getChunk(nx, nz) && world.voxelAt(nx, y, nz) === VOXEL.AIR && world.voxelAt(nx, y - 1, nz) === VOXEL.AIR) {
                        world.setVoxel(x, y, z, VOXEL.AIR);
                        world.setVoxel(nx, y, nz, VOXEL.WATER);
                        next.set(lkey(nx, y, nz), { x: nx, y, z: nz, sed });
                        moved = true; break;
                    }
                }
                if (moved) continue;
                // 3) flatten if stacked
                if (world.voxelAt(x, y + 1, z) === VOXEL.WATER) {
                    for (const [dx, dz] of shuffle([[1,0],[-1,0],[0,1],[0,-1]])) {
                        const nx = x + dx, nz = z + dz;
                        if (world.getChunk(nx, nz) && world.voxelAt(nx, y, nz) === VOXEL.AIR) {
                            world.setVoxel(x, y, z, VOXEL.AIR);
                            world.setVoxel(nx, y, nz, VOXEL.WATER);
                            next.set(lkey(nx, y, nz), { x: nx, y, z: nz, sed });
                            moved = true; break;
                        }
                    }
                }
                if (moved) continue;

                // SETTLE → deposit: muddy cell dries to ASH; clear cell stays WATER
                if (sed > 0) { world.setVoxel(x, y, z, VOXEL.ASH); this.deposited++; }
                this.settled++;
            }
            this.cells = next;
        }
        return { active: this.cells.size, eroded: this.eroded, deposited: this.deposited, settled: this.settled };
    }

    // Remove still-flowing mud (its WATER voxels) → air; deposits (ASH) remain.
    clearActive() {
        let n = 0;
        for (const c of this.cells.values()) {
            if (this.world.voxelAt(c.x, c.y, c.z) === VOXEL.WATER) { this.world.setVoxel(c.x, c.y, c.z, VOXEL.AIR); n++; }
        }
        this.cells.clear();
        return { cleared: n };
    }
}
