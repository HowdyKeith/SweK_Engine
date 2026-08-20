// FILE: tools/voxImporter.js
// VERSION: v1 — round 277
//
// Stamps a parsed MagicaVoxel model into the live voxel world. Pairs
// with voxParser.js — the parser hands us {models, palette}, this
// module decides where each voxel goes in world coords and what
// engine VOXEL_ID best matches its color.
//
// Color matching uses nearest-neighbor in RGB space against a small
// table of palette ID → RGB mappings. We don't need perfect color
// fidelity (the engine has ~10 voxel IDs total, the .vox file has up
// to 256 colors) — close-enough is fine for portfolio. The mapping
// table can be tuned by the user via setColorMap().
//
// Coordinate convention:
//   MagicaVoxel:   +X right, +Y depth, +Z up
//   Engine:        +X right, +Y up,    +Z forward
// We swap Y and Z when stamping so a "standing" model in MagicaVoxel
// stays standing in-engine.
//
// API:
//   const importer = new VoxImporter(world);
//   importer.stamp(parsedVox, { x, y, z, scale, rotate });
//     → { stamped: N, model: { sizeX, sizeY, sizeZ } }
//   importer.setColorMap([{ rgb: [r,g,b], voxelId: 1 }, ...])

// Engine voxel IDs we can map TO. Keep this in sync with the world
// palette (memory: AIR=0, STONE=1, DIRT=2, GRASS=3, SAND=4, SNOW=5,
// ASH=6, RUBBLE=7, WATER=10, FLOWING_WATER=11, LAVA=12, SCREEN=20,
// MEMORY=30).
const DEFAULT_COLOR_MAP = [
    { rgb: [128, 128, 128], voxelId: 1  },     // STONE — neutral grey
    { rgb: [110,  72,  44], voxelId: 2  },     // DIRT — brown
    { rgb: [ 70, 150,  70], voxelId: 3  },     // GRASS — green
    { rgb: [220, 210, 150], voxelId: 4  },     // SAND — pale yellow
    { rgb: [240, 240, 250], voxelId: 5  },     // SNOW — white
    { rgb: [ 40,  40,  40], voxelId: 6  },     // ASH — near-black
    { rgb: [120, 100,  80], voxelId: 7  },     // RUBBLE — warm brown
    { rgb: [ 30,  90, 200], voxelId: 10 },     // WATER — blue
    { rgb: [255, 130,  20], voxelId: 12 },     // LAVA — orange
    { rgb: [ 80, 220, 240], voxelId: 30 },     // MEMORY — cyan glow
    { rgb: [200,  60, 200], voxelId: 30 },     // magenta → MEMORY
];

function nearestVoxelId(rgb, colorMap) {
    let bestId = 1, bestD = Infinity;
    const [r, g, b] = rgb;
    for (const entry of colorMap) {
        const dr = entry.rgb[0] - r;
        const dg = entry.rgb[1] - g;
        const db = entry.rgb[2] - b;
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; bestId = entry.voxelId; }
    }
    return bestId;
}

export class VoxImporter {
    constructor(world, opts = {}) {
        this.world = world;
        this.colorMap = opts.colorMap || DEFAULT_COLOR_MAP.slice();
    }

    // Override the color → voxelId mapping. Each entry: {rgb:[r,g,b],
    // voxelId}. The mapping runs nearest-neighbor in RGB space, so
    // entries don't need to be exact — they're "exemplar colors" for
    // each engine voxel id.
    setColorMap(map) {
        if (Array.isArray(map) && map.length > 0) {
            this.colorMap = map.slice();
        }
    }

    // Stamp a parsed .vox into the world.
    //
    // parsed: shape returned by parseVox() — { ok, models, palette }
    // opts:
    //   x, y, z       — world origin (model lower-front-left corner)
    //   scale         — uniform scale, default 1 (each model voxel
    //                   becomes scale × scale × scale world voxels)
    //   rotate        — 0/1/2/3 quarter-turns around the vertical axis
    //   modelIndex    — which model to stamp when the file has many
    //
    // Returns { stamped: N, model: { sizeX, sizeY, sizeZ } }.
    stamp(parsed, opts = {}) {
        if (!parsed?.ok || !parsed.models?.length) {
            return { stamped: 0, error: parsed?.error ?? "no models" };
        }
        if (!this.world?.setVoxel) {
            return { stamped: 0, error: "world.setVoxel unavailable" };
        }
        const m = parsed.models[opts.modelIndex ?? 0];
        if (!m?.voxels?.length) {
            return { stamped: 0, error: "model has no voxels" };
        }
        const ox = opts.x ?? 0;
        const oy = opts.y ?? 0;
        const oz = opts.z ?? 0;
        const scale  = Math.max(1, Math.floor(opts.scale ?? 1));
        const rotate = ((opts.rotate ?? 0) % 4 + 4) % 4;
        const palette = parsed.palette || [];
        let stamped = 0;
        // Pre-resolve color→voxel for each palette entry we encounter.
        // The .vox file rarely uses all 256 — typically <16 — so a
        // lookup cache pays for itself even on small models.
        const voxIdCache = new Map();
        for (const v of m.voxels) {
            let voxelId = voxIdCache.get(v.c);
            if (voxelId == null) {
                const rgba = palette[v.c] || [128, 128, 128, 255];
                voxelId = nearestVoxelId(rgba, this.colorMap);
                voxIdCache.set(v.c, voxelId);
            }
            // MagicaVoxel (X right, Y depth, Z up) → engine (X right,
            // Y up, Z forward). Swap Y/Z; flip Z so a model "facing
            // forward" in MagicaVoxel still faces forward in-engine.
            let mx = v.x;
            let my = v.z;
            let mz = m.sizeY - 1 - v.y;
            // Rotate around Y (vertical) by quarter-turns
            if (rotate !== 0) {
                const cx = m.sizeX / 2, cz = m.sizeY / 2;
                let lx = mx - cx, lz = mz - cz;
                for (let i = 0; i < rotate; i++) {
                    const t = lx; lx = -lz; lz = t;
                }
                mx = lx + cx; mz = lz + cz;
            }
            // Apply scale + origin offset
            for (let sx = 0; sx < scale; sx++) {
                for (let sy = 0; sy < scale; sy++) {
                    for (let sz = 0; sz < scale; sz++) {
                        try {
                            this.world.setVoxel(
                                ox + Math.round(mx * scale + sx),
                                oy + Math.round(my * scale + sy),
                                oz + Math.round(mz * scale + sz),
                                voxelId
                            );
                            stamped++;
                        } catch {}
                    }
                }
            }
        }
        return {
            stamped,
            model: { sizeX: m.sizeX, sizeY: m.sizeY, sizeZ: m.sizeZ },
        };
    }

    // Round 281 — async, chunked variant that yields to the event loop
    // between batches. For big models (a 256³ stamp produces ~100K-1M
    // setVoxel calls) the sync stamp() above blocks the main thread
    // long enough to drop frames. This version processes the voxel
    // list in CHUNK_SIZE batches and awaits a microtask + animation
    // frame between them, so the renderer keeps going at ~60 fps even
    // while a big model is being imported.
    //
    // opts.onProgress(progress) — optional, called per chunk with
    //   { stamped, total, percent }. Useful for HUD progress bars.
    //
    // Returns a Promise resolving to the same shape as stamp().
    async stampAsync(parsed, opts = {}) {
        if (!parsed?.ok || !parsed.models?.length) {
            return { stamped: 0, error: parsed?.error ?? "no models" };
        }
        if (!this.world?.setVoxel) {
            return { stamped: 0, error: "world.setVoxel unavailable" };
        }
        const m = parsed.models[opts.modelIndex ?? 0];
        if (!m?.voxels?.length) {
            return { stamped: 0, error: "model has no voxels" };
        }
        const ox = opts.x ?? 0;
        const oy = opts.y ?? 0;
        const oz = opts.z ?? 0;
        const scale  = Math.max(1, Math.floor(opts.scale ?? 1));
        const rotate = ((opts.rotate ?? 0) % 4 + 4) % 4;
        const palette = parsed.palette || [];
        const voxIdCache = new Map();
        const CHUNK_SIZE = opts.chunkSize ?? 4000;     // ~5ms of work at typical rates
        const total = m.voxels.length;
        let stamped = 0;
        const yieldToFrame = () => new Promise((r) => {
            // Yield to the rendering pipeline. requestAnimationFrame
            // gives the browser a full frame to paint; if it's missing
            // (Node test env) we fall back to setTimeout(0).
            if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(() => r());
            } else {
                setTimeout(r, 0);
            }
        });
        for (let i = 0; i < total; i++) {
            const v = m.voxels[i];
            let voxelId = voxIdCache.get(v.c);
            if (voxelId == null) {
                const rgba = palette[v.c] || [128, 128, 128, 255];
                voxelId = nearestVoxelId(rgba, this.colorMap);
                voxIdCache.set(v.c, voxelId);
            }
            let mx = v.x;
            let my = v.z;
            let mz = m.sizeY - 1 - v.y;
            if (rotate !== 0) {
                const cx = m.sizeX / 2, cz = m.sizeY / 2;
                let lx = mx - cx, lz = mz - cz;
                for (let r = 0; r < rotate; r++) {
                    const t = lx; lx = -lz; lz = t;
                }
                mx = lx + cx; mz = lz + cz;
            }
            for (let sx = 0; sx < scale; sx++) {
                for (let sy = 0; sy < scale; sy++) {
                    for (let sz = 0; sz < scale; sz++) {
                        try {
                            this.world.setVoxel(
                                ox + Math.round(mx * scale + sx),
                                oy + Math.round(my * scale + sy),
                                oz + Math.round(mz * scale + sz),
                                voxelId
                            );
                            stamped++;
                        } catch {}
                    }
                }
            }
            // Yield every CHUNK_SIZE voxels. Progress callback first
            // so the HUD updates BEFORE the yield (no off-by-one
            // "stuck at 99%" feel).
            if ((i + 1) % CHUNK_SIZE === 0) {
                if (opts.onProgress) {
                    try {
                        opts.onProgress({
                            stamped, total: total * scale * scale * scale,
                            percent: ((i + 1) / total) * 100,
                        });
                    } catch {}
                }
                await yieldToFrame();
            }
        }
        if (opts.onProgress) {
            try { opts.onProgress({ stamped, total: stamped, percent: 100 }); } catch {}
        }
        return {
            stamped,
            model: { sizeX: m.sizeX, sizeY: m.sizeY, sizeZ: m.sizeZ },
        };
    }
}
