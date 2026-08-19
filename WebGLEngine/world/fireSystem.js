// FILE: world/fireSystem.js
// VERSION: v1 — WILDFIRE: spreads through flammable voxels, burns out to ASH
//
// The combustion cousin of the lava system: a burning cell ages, ignites
// adjacent flammable voxels (spread), and once its burn time elapses the voxel
// chars to ASH. Water (and being next to water) stops it — wet fuel won't catch
// and a burning cell beside water goes out. Flammable = GRASS (extensible to
// wood/leaf ids if they're added). Ticked by a gated driver (window.fire), so it
// only runs while enabled. Ignited by the player, by lava, or by lightning.

import { VOXEL } from "./voxelFormat.js";

const MAX_FIRE = 5000;
const fkey = (x, y, z) => x + "," + y + "," + z;
const FLAMMABLE = new Set([VOXEL.GRASS]);
const NB6 = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

export class FireSystem {
    constructor(world) {
        this.world = world;
        this.cells = new Map();   // key -> { x, y, z, age }
        this.params = { spreadRate: 2, burnSeconds: 4, igniteChance: 0.5, waterStops: true };
        this.burned = 0;
    }
    setParams(p) { Object.assign(this.params, p); }
    _maxY() { return this.world.chunks?.values?.().next?.().value?.height ?? 64; }

    _nearWater(x, y, z) {
        const w = this.world;
        for (const [dx, dy, dz] of NB6) { const v = w.voxelAt(x + dx, y + dy, z + dz); if (v === VOXEL.WATER || v === VOXEL.FLOWING_WATER) return true; }
        return false;
    }

    _flames(x, y, z) {
        const p = (typeof window !== "undefined") ? window.gpuParticles : null;
        if (!p?.spawn) return;
        for (let i = 0; i < 2; i++) p.spawn({ x: x + 0.5, y: y + 0.7, z: z + 0.5,
            vx: (Math.random() - 0.5) * 0.4, vy: 1.2 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.4,
            life: 0.6, size: 0.5, r: 1.0, g: 0.5 + Math.random() * 0.3, b: 0.1, shape: 0 });
    }

    // Ignite a single voxel if it's flammable and not wet.
    ignite(x, y, z) {
        x |= 0; y |= 0; z |= 0;
        if (!this.world.getChunk(x, z)) return false;
        if (!FLAMMABLE.has(this.world.voxelAt(x, y, z))) return false;
        if (this.params.waterStops && this._nearWater(x, y, z)) return false;
        const k = fkey(x, y, z);
        if (this.cells.has(k) || this.cells.size >= MAX_FIRE) return false;
        this.cells.set(k, { x, y, z, age: 0 });
        return true;
    }

    // Ignite flammable surfaces in a region (the top voxel of each column).
    igniteArea({ centerX, centerZ, radius = 6 } = {}) {
        const w = this.world, maxY = this._maxY(), r = radius | 0;
        let lit = 0;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            const x = centerX + dx, z = centerZ + dz;
            if (!w.getChunk(x, z)) continue;
            for (let y = maxY - 1; y >= 1; y--) { const v = w.voxelAt(x, y, z); if (v !== VOXEL.AIR) { if (FLAMMABLE.has(v) && this.ignite(x, y, z)) lit++; break; } }
        }
        return { lit, active: this.cells.size };
    }

    update(dt) {
        const w = this.world;
        const { spreadRate, burnSeconds, igniteChance, waterStops } = this.params;
        const sub = Math.max(1, Math.round(spreadRate));
        const toBurn = [], toIgnite = [];
        for (const cell of this.cells.values()) {
            cell.age += dt;
            if (waterStops && this._nearWater(cell.x, cell.y, cell.z)) { this.cells.delete(fkey(cell.x, cell.y, cell.z)); continue; }  // doused
            if (cell.age >= burnSeconds) { toBurn.push(cell); continue; }
            this._flames(cell.x, cell.y, cell.z);
            for (let s = 0; s < sub; s++) {
                for (const [dx, dy, dz] of NB6) {
                    const nx = cell.x + dx, ny = cell.y + dy, nz = cell.z + dz;
                    if (!w.getChunk(nx, nz)) continue;
                    if (!FLAMMABLE.has(w.voxelAt(nx, ny, nz))) continue;
                    const nk = fkey(nx, ny, nz);
                    if (this.cells.has(nk)) continue;
                    if (waterStops && this._nearWater(nx, ny, nz)) continue;
                    if (Math.random() < igniteChance) toIgnite.push({ x: nx, y: ny, z: nz, k: nk });
                }
            }
        }
        for (const c of toBurn) { w.setVoxel(c.x, c.y, c.z, VOXEL.ASH); this.burned++; this.cells.delete(fkey(c.x, c.y, c.z)); }
        for (const n of toIgnite) {
            if (this.cells.size >= MAX_FIRE) break;
            if (this.cells.has(n.k)) continue;
            if (!FLAMMABLE.has(w.voxelAt(n.x, n.y, n.z))) continue;
            this.cells.set(n.k, { x: n.x, y: n.y, z: n.z, age: 0 });
        }
        return { active: this.cells.size, burned: this.burned };
    }

    extinguishAll() { this.cells.clear(); }   // stop burning; un-burned fuel stays
}
