// FILE: world/ruinPlacer.js
// VERSION: v1
//
// Round 33 — ancient ruins scattered across the world. Each ruin is a
// weathered version of a megastructure pattern (round 25):
//   * ~45% of voxels are skipped (decay)
//   * MEMORY (cyan glow) blocks are stripped — ruins lost their
//     memory cores when their civs fell
//   * 30% of remaining STONE becomes DIRT (erosion)
//   * stamped at terrain top in plains or jungle biomes only
//     (mountains have peaks, volcano has lava — would clip ugly)
//
// Eight ruins per world, evenly spaced via deterministic spiral
// from origin. localStorage-gated one-shot.

import { VOXEL } from "./voxelFormat.js";
import { MEGASTRUCTURE_BY_STYLE } from "../simulation/megastructurePatterns.js";

const STORAGE_KEY = "voxelengine.ruins_v1_applied";

const STYLE_NAMES = ["step_pyramid", "tower", "ring_wall", "plaza", "spire_field"];

// Seeded RNG so ruins are deterministic per world (same seed → same
// ruins on every paint). Same shape as BiomePainter's.
function _seededRand(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

export class RuinPlacer {
    constructor({ world, biomeMap, region = 180, count = 8, seed = 7777 }) {
        this.world = world;
        this.biomeMap = biomeMap;
        this.region = region;
        this.count = count;
        this.seed = seed;
    }

    isAlreadyPlaced() {
        try { return localStorage.getItem(STORAGE_KEY) === "1"; }
        catch { return false; }
    }

    markPlaced() {
        try { localStorage.setItem(STORAGE_KEY, "1"); }
        catch {}
    }

    static clearPlacedFlag() {
        try { localStorage.removeItem(STORAGE_KEY); }
        catch {}
    }

    place(opts = {}) {
        if (!opts.force && this.isAlreadyPlaced()) {
            console.log("[RuinPlacer] already applied; skipping");
            return { placed: 0, skipped: true };
        }
        if (!this.world?.setVoxel || !this.world?.voxelAt) {
            console.warn("[RuinPlacer] world missing required API");
            return { placed: 0, skipped: false };
        }
        if (!this.biomeMap?.getBiomeAt) {
            console.warn("[RuinPlacer] biomeMap required for ruin placement");
            return { placed: 0, skipped: false };
        }

        const rand = _seededRand(this.seed);
        let placed = 0;
        let voxelsWritten = 0;
        let attempts = 0;
        const maxAttempts = this.count * 8;

        while (placed < this.count && attempts < maxAttempts) {
            attempts++;
            // Random spot inside region; reject if not in plains/jungle
            const x = Math.floor((rand() - 0.5) * this.region);
            const z = Math.floor((rand() - 0.5) * this.region);
            const biome = this.biomeMap.getBiomeAt(x, z);
            if (biome !== "plains" && biome !== "jungle") continue;

            const baseY = this._terrainTopAt(x, z);
            if (baseY < 1) continue;

            // Pick a random style + apply weathered pattern
            const style = STYLE_NAMES[(rand() * STYLE_NAMES.length) | 0];
            const spec = MEGASTRUCTURE_BY_STYLE[style];
            if (!spec) continue;

            const written = this._stampRuin(spec, x, baseY, z, rand);
            if (written > 0) {
                placed++;
                voxelsWritten += written;
            }
        }

        this.markPlaced();
        console.log(`[RuinPlacer] placed ${placed} ruins (${voxelsWritten} voxels) in ${attempts} attempts`);
        return { placed, voxelsWritten, skipped: false };
    }

    _stampRuin(spec, baseX, baseY, baseZ, rand) {
        let written = 0;
        for (const v of spec.voxels) {
            // Decay — skip 45% of voxels for the broken look
            if (rand() < 0.45) continue;
            // MEMORY blocks faded entirely (ruins lost their souls)
            if (v.mat === VOXEL.MEMORY) continue;

            // Erosion — 30% of stone becomes dirt
            let mat = v.mat;
            if (mat === VOXEL.STONE && rand() < 0.30) {
                mat = VOXEL.DIRT;
            }

            this.world.setVoxel(baseX + v.dx, baseY + v.dy, baseZ + v.dz, mat);
            written++;
        }
        return written;
    }

    _terrainTopAt(x, z) {
        // v332 — same fix as v329 biomePainter: clamp scan to natural
        // terrain Y range, accept only natural voxel types. Prevents
        // ruins from being stamped on top of mountain caps, floating
        // entities, megastructure remnants, or anything else high.
        // Returns 0 if no natural ground found → caller skips the
        // ruin for this column.
        const MAX_NATURAL_TOP = 15;
        for (let y = MAX_NATURAL_TOP; y >= 0; y--) {
            const v = this.world.voxelAt(x, y, z);
            if (v === 0 || v === undefined) continue;
            if (v === VOXEL.STONE || v === VOXEL.DIRT ||
                v === VOXEL.GRASS || v === VOXEL.SAND) {
                return y;
            }
            // Skip SNOW (mountain cap), ASH, WATER, LAVA, SCREEN,
            // MEMORY, RUBBLE — keep scanning for natural terrain below.
        }
        return 0;
    }
}
