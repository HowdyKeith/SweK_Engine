// FILE: world/caveCarver.js
// VERSION: v1
//
// Round 33 — procedural cave systems carved out of subsurface stone.
// Uses 3D value noise: each voxel below y=15 is sampled; if the noise
// exceeds the carve threshold, the voxel becomes AIR.
//
// Tunnel density tunes via THRESHOLD: lower = more cave (huge open
// spaces), higher = less cave (rare tunnels). 0.62 carves about 12-
// 18% of underground volume which reads as "wormy connected
// tunnels" rather than swiss-cheese.
//
// One-shot per world via localStorage flag, mirrors BiomePainter.

import { VOXEL } from "./voxelFormat.js";

const STORAGE_KEY = "voxelengine.caves_v1_applied";
const Y_FLOOR = 2;            // don't carve into the very bottom (preserves seal)
const Y_CEILING = 14;          // carve up to here; surface is around y=12-14
const THRESHOLD = 0.62;        // higher = sparser caves

// Hash-based 3D value noise. Cheap, deterministic.
function _hash3d(x, y, z, seed) {
    let h = (x * 374761393) ^ (y * 1103515245) ^ (z * 668265263) ^ (seed * 982451653);
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
}

function _valueNoise3d(x, y, z, seed) {
    const x0 = Math.floor(x), x1 = x0 + 1;
    const y0 = Math.floor(y), y1 = y0 + 1;
    const z0 = Math.floor(z), z1 = z0 + 1;
    const fx = x - x0, fy = y - y0, fz = z - z0;
    // smoothstep
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const w = fz * fz * (3 - 2 * fz);

    const c000 = _hash3d(x0, y0, z0, seed);
    const c100 = _hash3d(x1, y0, z0, seed);
    const c010 = _hash3d(x0, y1, z0, seed);
    const c110 = _hash3d(x1, y1, z0, seed);
    const c001 = _hash3d(x0, y0, z1, seed);
    const c101 = _hash3d(x1, y0, z1, seed);
    const c011 = _hash3d(x0, y1, z1, seed);
    const c111 = _hash3d(x1, y1, z1, seed);

    // Trilinear interpolation
    const x00 = c000 * (1 - u) + c100 * u;
    const x10 = c010 * (1 - u) + c110 * u;
    const x01 = c001 * (1 - u) + c101 * u;
    const x11 = c011 * (1 - u) + c111 * u;
    const y0i = x00 * (1 - v) + x10 * v;
    const y1i = x01 * (1 - v) + x11 * v;
    return y0i * (1 - w) + y1i * w;
}

export class CaveCarver {
    constructor({ world, region = 200, center = { x: 0, z: 0 }, seed = 4242 }) {
        this.world = world;
        this.region = region;
        this.center = center;
        this.seed = seed;
    }

    isAlreadyCarved() {
        try { return localStorage.getItem(STORAGE_KEY) === "1"; }
        catch { return false; }
    }

    markCarved() {
        try { localStorage.setItem(STORAGE_KEY, "1"); }
        catch {}
    }

    static clearCarvedFlag() {
        try { localStorage.removeItem(STORAGE_KEY); }
        catch {}
    }

    carve(opts = {}) {
        if (!opts.force && this.isAlreadyCarved()) {
            console.log("[CaveCarver] already applied; skipping");
            return { carved: 0, skipped: true };
        }
        if (!this.world?.setVoxel || !this.world?.voxelAt) {
            console.warn("[CaveCarver] world missing required API");
            return { carved: 0, skipped: false };
        }

        const r = this.region >> 1;
        let carved = 0;

        // Frequency: 0.08 horizontal, 0.12 vertical so caves are
        // wider than they are tall (reads more like horizontal
        // tunnels than vertical shafts)
        const fxz = 0.08;
        const fy  = 0.12;

        for (let z = this.center.z - r; z < this.center.z + r; z++) {
            for (let x = this.center.x - r; x < this.center.x + r; x++) {
                for (let y = Y_FLOOR; y <= Y_CEILING; y++) {
                    // Only carve solid stone/dirt — preserve fluids,
                    // memory blocks, etc.
                    const cur = this.world.voxelAt(x, y, z);
                    if (cur !== VOXEL.STONE && cur !== VOXEL.DIRT) continue;

                    const n = _valueNoise3d(x * fxz, y * fy, z * fxz, this.seed);
                    if (n > THRESHOLD) {
                        this.world.setVoxel(x, y, z, VOXEL.AIR);
                        carved++;
                    }
                }
            }
        }

        this.markCarved();
        console.log(`[CaveCarver] carved ${carved} voxels (region ${this.region}, threshold ${THRESHOLD})`);
        return { carved, skipped: false };
    }
}
