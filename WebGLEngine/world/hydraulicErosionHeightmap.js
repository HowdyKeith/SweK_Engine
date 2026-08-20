// FILE: world/hydraulicErosionHeightmap.js
// VERSION: v1 — HEIGHTMAP DROPLET EROSION + VOXEL BRIDGE
//
// The decision (vs the engine's existing voxel-native ErosionSystem /
// HydraulicErosion, which only CARVE to AIR) was: heightmap erosion WITH the
// chunk bridge — because the droplet model erodes AND deposits, giving smooth,
// geologically-believable terrain (valleys carved, sediment fans + beaches
// laid down) instead of pure carving.
//
// Pipeline (one-shot bake):
//   1. sample()  — read the current voxel terrain into a 2D float height field
//                  over a square region (topmost solid, skipping water/lava).
//   2. erode()   — standard hydraulic-erosion droplet simulation on that field.
//                  PURE function of the field (no engine) → unit-testable.
//   3. apply()   — THE BRIDGE. For every column whose integer height changed,
//                  carve voxels → AIR (erosion) or stack sediment voxels
//                  (deposition) via world.setVoxel(). setVoxel already marks the
//                  chunk dirty + _modified + emits voxel:set, so the real mesher
//                  (render/voxelrenderer.js) remeshes next frame. No bespoke
//                  ChunkRebuilder needed.
//
// Console API (wired in main.js): window.erosionHM.bakeHere({ radius, droplets })
// Terrain edits are persistent (chunk._modified); world.regenerate() resets.

import { VOXEL } from "./voxelFormat.js";

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Voxel ids that are NOT terrain (don't count as surface, don't carve as rock).
const NON_TERRAIN = new Set([VOXEL.AIR, VOXEL.WATER, VOXEL.FLOWING_WATER, VOXEL.LAVA]);

export class HeightmapErosion {
    constructor(world) {
        this.world = world;
    }

    // ---- 1. SAMPLE: voxel terrain -> 2D float height field ----------------
    // Returns { x0, z0, n, height:Float32Array, surfId:Uint8Array, maxY }
    sample({ centerX = 0, centerZ = 0, radius = 48 } = {}) {
        const world = this.world;
        const n  = radius * 2;
        const x0 = Math.floor(centerX) - radius;
        const z0 = Math.floor(centerZ) - radius;
        const anyChunk = world.chunks?.values?.().next?.().value;
        const maxY = anyChunk?.height ?? 64;

        const height = new Float32Array(n * n);
        const surfId = new Uint8Array(n * n);
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const wx = x0 + i, wz = z0 + j;
                let h = 0, sid = VOXEL.AIR;
                for (let y = maxY - 1; y >= 1; y--) {
                    const v = world.voxelAt(wx, y, wz);
                    if (!NON_TERRAIN.has(v)) { h = y; sid = v; break; }
                }
                height[i + j * n] = h;
                surfId[i + j * n] = sid;
            }
        }
        return { x0, z0, n, height, surfId, maxY };
    }

    // ---- 2. ERODE: hydraulic droplet simulation (pure; mutates field.height) -
    erode(field, opts = {}) {
        const { n, height } = field;
        const droplets    = opts.droplets    ?? n * n * 2;
        const maxSteps    = opts.maxSteps    ?? 64;
        const inertia     = opts.inertia     ?? 0.05;
        const capacityK   = opts.capacity    ?? 4.0;
        const minSlope    = opts.minSlope    ?? 0.01;
        const deposition  = opts.deposition  ?? 0.3;
        const erosionK    = opts.erosion     ?? 0.3;
        const evaporation = opts.evaporation ?? 0.02;
        const gravity     = opts.gravity     ?? 4.0;
        const brush       = opts.brush       ?? 2;
        const rng = mulberry32(opts.seed ?? 1337);

        const H = (x, z) => height[x + z * n];

        // Bilinear height + gradient at a fractional cell position.
        function heightAndGrad(px, pz) {
            const x = Math.min(n - 2, Math.max(0, Math.floor(px)));
            const z = Math.min(n - 2, Math.max(0, Math.floor(pz)));
            const u = px - x, w = pz - z;
            const h00 = H(x, z), h10 = H(x + 1, z), h01 = H(x, z + 1), h11 = H(x + 1, z + 1);
            const gx = (h10 - h00) * (1 - w) + (h11 - h01) * w;
            const gz = (h01 - h00) * (1 - u) + (h11 - h10) * u;
            const h  = h00 * (1 - u) * (1 - w) + h10 * u * (1 - w)
                     + h01 * (1 - u) * w       + h11 * u * w;
            return { h, gx, gz };
        }
        function depositBilinear(px, pz, amount) {
            const x = Math.floor(px), z = Math.floor(pz);
            if (x < 0 || z < 0 || x >= n - 1 || z >= n - 1) return;
            const u = px - x, w = pz - z;
            height[x + z * n]             += amount * (1 - u) * (1 - w);
            height[x + 1 + z * n]         += amount * u * (1 - w);
            height[x + (z + 1) * n]       += amount * (1 - u) * w;
            height[x + 1 + (z + 1) * n]   += amount * u * w;
        }
        function erodeBrush(px, pz, amount) {
            const cx = Math.floor(px), cz = Math.floor(pz);
            let total = 0; const cells = [];
            for (let dz = -brush; dz <= brush; dz++) {
                for (let dx = -brush; dx <= brush; dx++) {
                    const x = cx + dx, z = cz + dz;
                    if (x < 0 || z < 0 || x >= n || z >= n) continue;
                    const wgt = brush - Math.hypot(dx, dz);
                    if (wgt > 0) { cells.push(x + z * n); total += wgt;
                        cells.push(wgt); }   // store idx,wgt pairs
                }
            }
            if (total <= 0) return;
            for (let k = 0; k < cells.length; k += 2) {
                const idx = cells[k];
                height[idx] = Math.max(0, height[idx] - amount * (cells[k + 1] / total));
            }
        }

        for (let d = 0; d < droplets; d++) {
            let px = rng() * (n - 1), pz = rng() * (n - 1);
            let dirx = 0, dirz = 0, vel = 1, water = 1, sediment = 0;
            for (let s = 0; s < maxSteps; s++) {
                const cur = heightAndGrad(px, pz);
                dirx = dirx * inertia - cur.gx * (1 - inertia);
                dirz = dirz * inertia - cur.gz * (1 - inertia);
                const len = Math.hypot(dirx, dirz);
                if (len < 1e-6) { const a = rng() * Math.PI * 2; dirx = Math.cos(a); dirz = Math.sin(a); }
                else { dirx /= len; dirz /= len; }
                const nx = px + dirx, nz = pz + dirz;
                if (nx < 0 || nz < 0 || nx >= n - 1 || nz >= n - 1) break;
                const nh = heightAndGrad(nx, nz).h;
                const dh = nh - cur.h;                         // >0 uphill, <0 downhill
                const cap = Math.max(-dh, minSlope) * vel * water * capacityK;
                if (sediment > cap || dh > 0) {
                    const amt = (dh > 0) ? Math.min(dh, sediment) : (sediment - cap) * deposition;
                    depositBilinear(px, pz, amt); sediment -= amt;
                } else {
                    const amt = Math.min((cap - sediment) * erosionK, -dh);
                    erodeBrush(px, pz, amt); sediment += amt;
                }
                vel = Math.min(8, Math.sqrt(Math.max(0, vel * vel + (-dh) * gravity)));
                water *= (1 - evaporation);
                px = nx; pz = nz;
                if (water < 1e-3) break;
            }
            // Mass conservation: deposit whatever the droplet still carries at
            // its final cell instead of letting it vanish (the runaway cause —
            // droplets that erode to the region edge must drop their sediment).
            if (sediment > 0) {
                depositBilinear(Math.min(n - 1.001, Math.max(0, px)),
                                Math.min(n - 1.001, Math.max(0, pz)), sediment);
            }
        }
        return field;
    }

    // ---- 3. APPLY (THE BRIDGE): write changed columns back into voxels -----
    apply(field, baseline, opts = {}) {
        const { x0, z0, n, height, maxY } = field;
        const world = this.world;
        const waterLevel = opts.waterLevel ?? 8;
        let added = 0, removed = 0, cols = 0;
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const oldH = Math.round(baseline[i + j * n]);
                let newH = Math.round(height[i + j * n]);
                if (newH < 1) newH = 1;
                if (newH > maxY - 1) newH = maxY - 1;
                if (newH === oldH) continue;
                const wx = x0 + i, wz = z0 + j;
                cols++;
                if (newH < oldH) {
                    // EROSION — carve the removed terrain to AIR.
                    for (let y = oldH; y > newH; y--) { world.setVoxel(wx, y, wz, VOXEL.AIR); removed++; }
                } else {
                    // DEPOSITION — stack sediment (sand near/below water = beaches, else dirt).
                    const mat = (newH <= waterLevel + 1) ? VOXEL.SAND : VOXEL.DIRT;
                    for (let y = oldH + 1; y <= newH; y++) { world.setVoxel(wx, y, wz, mat); added++; }
                }
            }
        }
        return { added, removed, cols };
    }

    // ---- One-shot: sample -> erode -> apply --------------------------------
    bake(opts = {}) {
        const field = this.sample(opts);
        const baseline = field.height.slice();
        this.erode(field, opts);
        const res = this.apply(field, baseline, opts);
        console.log(`[HeightmapErosion] region ${field.n}x${field.n} @ (${field.x0},${field.z0}) — `
            + `${res.cols} columns changed, +${res.added} sediment / -${res.removed} carved voxels`);
        return res;
    }
}
