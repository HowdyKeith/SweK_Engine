// FILE: world/biomePainter.js
// VERSION: v1
//
// Round 29 — biome surface modification. Run once per world (gated
// via localStorage), this scans a region around origin, looks up
// the biome at each column, and applies biome-specific changes:
//
//   tundra    → top voxel painted SAND (pale tundra look)
//   plains    → no change (default grass keeps its look)
//   jungle    → no change in voxels; TreeSpawner handles dense trees
//   mountains → stack 5-20 STONE voxels above base terrain, top voxel
//               painted SNOW if peak ≥ 8 high (so big peaks get caps)
//   volcano   → top voxel painted ASH; ~6% of surface gets a LAVA
//               patch instead, and a 1-voxel column of LAVA
//
// All edits go through world.setVoxel which marks chunks dirty for
// re-mesh. The 200×200 region (40K columns) typically rebuilds 30-60
// chunks; renderer's MAX_REBUILDS_PER_FRAME=4 keeps frame time
// reasonable and they catch up over the first ~2 seconds.

import { VOXEL } from "./voxelFormat.js";

// Round 280 — bumped v1 → v2 so existing worlds re-paint with the
// new swamp+lake wetness overlay. Tundra/mountains/volcano changes
// from v1 will be re-applied (idempotent: cur === GRASS check skips
// already-painted cells). Lake/swamp patches will appear in plains
// and jungle areas where the wetness noise is high.
const STORAGE_KEY = "voxelengine.biomes_v2_applied";

export class BiomePainter {
    constructor({ world, biomeMap, region = 200, center = { x: 0, z: 0 } }) {
        this.world = world;
        this.biomeMap = biomeMap;
        this.region = region;
        this.center = center;
    }

    // Already painted? Return true if the localStorage flag is set,
    // meaning we should skip painting (idempotent boot).
    isAlreadyPainted() {
        try { return localStorage.getItem(STORAGE_KEY) === "1"; }
        catch { return false; }
    }

    markPainted() {
        try { localStorage.setItem(STORAGE_KEY, "1"); }
        catch {}
    }

    // Force a re-paint (e.g. for testing — paint regardless of flag)
    static clearPaintedFlag() {
        try { localStorage.removeItem(STORAGE_KEY); }
        catch {}
    }

    paint(opts = {}) {
        if (!opts.force && this.isAlreadyPainted()) {
            console.log("[BiomePainter] already applied (flag set in localStorage); skipping");
            return { painted: 0, skipped: true };
        }
        if (!this.world?.setVoxel || !this.world?.voxelAt) {
            console.warn("[BiomePainter] world missing required API");
            return { painted: 0, skipped: false };
        }

        const r = this.region >> 1;
        let painted = 0;
        const biomeCounts = { tundra: 0, plains: 0, jungle: 0, mountains: 0, volcano: 0 };

        for (let z = this.center.z - r; z < this.center.z + r; z++) {
            for (let x = this.center.x - r; x < this.center.x + r; x++) {
                const biome = this.biomeMap.getBiomeAt(x, z);
                biomeCounts[biome]++;
                const topY = this._terrainTopAt(x, z);
                if (topY < 1) continue;

                if (biome === "tundra") {
                    // Replace top voxel only if currently grass — preserve
                    // sand beaches, stone peaks already there
                    const cur = this.world.voxelAt(x, topY, z);
                    if (cur === VOXEL.GRASS) {
                        this.world.setVoxel(x, topY, z, VOXEL.SAND);
                        painted++;
                    }
                } else if (biome === "mountains") {
                    // Add a peak above the existing terrain. Height
                    // varies 5-20 by mountain noise; peaks ≥ 8 high get
                    // a SNOW cap voxel.
                    //
                    // v336 — IDEMPOTENCY. Detect columns that already
                    // have a peak from a previous paint pass. The
                    // gate flag (voxelengine.biomes_v2_applied)
                    // previously prevented re-paint, but explicit
                    // force-paint (via world.regenerate's onRegenerate
                    // listener) bypasses the flag — and each force-
                    // paint stacked another 5-20 stones on top, so
                    // long-played worlds got 60+ voxel cliff mountains.
                    //
                    // Heuristic: natural base terrain caps at ~Y=10;
                    // a mountain column already painted has topY > 10.
                    // Skip if so — the existing peak is intentional.
                    if (topY > 10) {
                        continue;
                    }
                    const peakNoise = this.biomeMap.getMountainPeak(x, z);
                    const peakHeight = 5 + Math.floor(peakNoise * 16);
                    for (let dy = 1; dy <= peakHeight; dy++) {
                        const y = topY + dy;
                        const isCap = (dy === peakHeight && peakHeight >= 8);
                        this.world.setVoxel(x, y, z, isCap ? VOXEL.SNOW : VOXEL.STONE);
                        painted++;
                    }
                } else if (biome === "volcano") {
                    // Top voxel ASH normally, ~6% chance of LAVA patch
                    const cur = this.world.voxelAt(x, topY, z);
                    if (cur === VOXEL.GRASS || cur === VOXEL.DIRT || cur === VOXEL.SAND) {
                        const lavaChance = this.biomeMap.getVolcanoLavaChance(x, z);
                        if (lavaChance > 0.92) {
                            this.world.setVoxel(x, topY, z, VOXEL.LAVA);
                        } else {
                            this.world.setVoxel(x, topY, z, VOXEL.ASH);
                        }
                        painted++;
                    }
                }
                // Round 280 — wetness overlay. Painted ONLY on plains/
                // jungle (not on tundra/mountains/volcano which have
                // their own surface). Lake = water replaces top voxel
                // and the one below (deeper pools). Swamp = DIRT top
                // with sparse WATER puddles.
                if (biome === "plains" || biome === "jungle") {
                    const wet = this.biomeMap.getWetness?.(x, z) ?? 0;
                    if (wet > 0.85) {
                        // LAKE — dig down one voxel and fill with water.
                        // Looks like a recessed pool when the surrounding
                        // terrain has grass at +0 and the lake column is
                        // water at -1 and -2.
                        const cur = this.world.voxelAt(x, topY, z);
                        if (cur === VOXEL.GRASS || cur === VOXEL.DIRT) {
                            this.world.setVoxel(x, topY, z, VOXEL.WATER);
                            painted++;
                            if (topY >= 1) {
                                this.world.setVoxel(x, topY - 1, z, VOXEL.WATER);
                                painted++;
                            }
                            biomeCounts.lake = (biomeCounts.lake ?? 0) + 1;
                        }
                    } else if (wet > 0.65) {
                        // SWAMP — dirt-top with scattered water puddles.
                        // Use lava-chance noise (also independent) at a
                        // higher threshold so ~10% of swamp cells get
                        // a single WATER puddle.
                        const cur = this.world.voxelAt(x, topY, z);
                        if (cur === VOXEL.GRASS) {
                            const puddleNoise = this.biomeMap.getVolcanoLavaChance(x, z);
                            if (puddleNoise > 0.90) {
                                this.world.setVoxel(x, topY, z, VOXEL.WATER);
                            } else {
                                this.world.setVoxel(x, topY, z, VOXEL.DIRT);
                            }
                            painted++;
                            biomeCounts.swamp = (biomeCounts.swamp ?? 0) + 1;
                        }
                    }
                }
                // jungle + plains: no voxel changes
            }
        }

        this.markPainted();
        const volcanoes = this._buildVolcanoes();
        console.log(`[BiomePainter] painted ${painted} voxels — biomes:`,
            Object.entries(biomeCounts).map(([k, v]) => `${k}=${v}`).join(", "),
            `| volcanoes built: ${volcanoes}`);
        return { painted, skipped: false, biomeCounts, volcanoes };
    }

    // v903 — raise actual volcano landforms (cone + crater + lava pool) at
    // sparse centers inside the volcano biome, and record their craters in
    // world.volcanoes = [{x,z,craterY,R}] so the eruption driver can spew
    // lava there (the existing LavaSystem then flows it down the slopes).
    _buildVolcanoes() {
        const r = this.region >> 1, step = 56;
        const list = (this.world.volcanoes = this.world.volcanoes || []);
        for (let cz = this.center.z - r; cz < this.center.z + r; cz += step) {
            for (let cx = this.center.x - r; cx < this.center.x + r; cx += step) {
                // jitter the center off the grid via noise so they're not lined up
                const j = this.biomeMap.getVolcanoLavaChance(cx, cz);
                const vx = cx + (Math.floor(j * 53) % step) - (step >> 1);
                const vz = cz + (Math.floor(j * 97) % step) - (step >> 1);
                if (this.biomeMap.getBiomeAt(vx, vz) !== "volcano") continue;
                const baseY = this._terrainTopAt(vx, vz);
                if (baseY < 1) continue;
                if (baseY > 10) continue;   // already elevated here (cone/mountain) — idempotent, don't restack
                const sizeNoise = this.biomeMap.getVolcanoLavaChance(vx + 13, vz - 7); // 0..1
                const R = Math.round(13 + sizeNoise * 15);              // 13..28 ("big volcano" near 28)
                const H = Math.round(R * 0.7);                          // ~9..20 tall
                const craterR = Math.max(2, Math.round(R * 0.22));
                const craterDepth = Math.max(2, Math.round(H * 0.32));
                const rimY = baseY + H, craterFloorY = Math.max(baseY + 1, rimY - craterDepth);
                const R2 = R * R;
                for (let dz = -R; dz <= R; dz++) {
                    for (let dx = -R; dx <= R; dx++) {
                        const d2 = dx * dx + dz * dz; if (d2 > R2) continue;
                        const d = Math.sqrt(d2), x = vx + dx, z = vz + dz;
                        const topY = baseY + Math.round(H * (1 - d / R));
                        if (topY <= baseY) continue;
                        if (d < craterR) {                               // crater: stone walls, lava pool floor
                            for (let y = baseY + 1; y < craterFloorY; y++) this.world.setVoxel(x, y, z, VOXEL.STONE);
                            this.world.setVoxel(x, craterFloorY, z, VOXEL.LAVA);
                        } else {                                         // slope: stone body, ash cap (rare lava streak)
                            for (let y = baseY + 1; y < topY; y++) this.world.setVoxel(x, y, z, VOXEL.STONE);
                            const streak = this.biomeMap.getVolcanoLavaChance(x, z) > 0.95;
                            this.world.setVoxel(x, topY, z, streak ? VOXEL.LAVA : VOXEL.ASH);
                        }
                    }
                }
                list.push({ x: vx, z: vz, craterY: craterFloorY, R });
            }
        }
        return list.length;
    }

    _terrainTopAt(x, z) {
        // v329 — Clamp the scan to natural terrain Y range. The base
        // terrain generator works in roughly Y=1..10; mountains stack
        // up to ~Y=30 once. Scanning from Y=60 was treating ANY high
        // content (kaiju debris, megastructures, residual mountain
        // pillars, SCREEN voxels for the face wall) as "ground" and
        // stacking mountain on top of it. Re-runs of paint would then
        // build sky towers on top of those.
        //
        // Now: scan from MAX_NATURAL_TOP (15) downward, and only
        // accept natural-terrain voxel ids (STONE/DIRT/GRASS/SAND).
        // Anything else returns 0 → skip painting this column.
        const MAX_NATURAL_TOP = 15;
        for (let y = MAX_NATURAL_TOP; y >= 0; y--) {
            const v = this.world.voxelAt(x, y, z);
            if (v === 0 || v === undefined) continue;
            if (v === VOXEL.STONE || v === VOXEL.DIRT ||
                v === VOXEL.GRASS || v === VOXEL.SAND) {
                return y;
            }
            // Found a non-natural voxel (SNOW from prior mountain pass,
            // ASH, LAVA, WATER, SCREEN, MEMORY, RUBBLE) — keep scanning
            // down. If the column is genuinely terrain, we'll find a
            // natural voxel below. If not, we'll bottom out at 0.
        }
        return 0;
    }
}
