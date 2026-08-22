// FILE: world/erosion.js
// VERSION: v1
//
// Round 135 — terrain naturalism step 4: hydraulic erosion.
//
// Carves real river valleys, smooths peaks, deposits sediment in
// basins. The single biggest "natural realism" upgrade after ridged
// noise + domain warping. Compounds beautifully with v2.133's ridged
// mountains — sharp peaks become weathered crags, valleys between
// ridges become meandering riverbeds.
//
// IMPLEMENTATION
// --------------
// Particle-based hydraulic erosion (the standard "raindrop" algorithm
// popularized by Sebastian Lague). Each particle:
//   1. Spawns at a random position with some initial water + 0 sediment
//   2. Each step: samples the heightmap gradient, accelerates downhill
//      with inertia, calculates sediment capacity from speed × slope ×
//      water amount
//   3. Carries less than capacity → erodes terrain into sediment
//      Carries more than capacity (or moving uphill) → deposits
//      sediment back into terrain
//   4. Loses water each step (evaporation); dies when water ≈ 0 or
//      walks off the tile
//
// Followed by thermal erosion: simple talus-angle relaxation that
// transfers material from steep slopes to lower neighbors. Smooths
// sharp peaks (which the ridged-multifractal step intentionally
// produced) into more natural weathered shapes.
//
// TILE CACHE
// ----------
// The world is infinite, so we can't erode globally. Instead each
// 128x128 region ("tile") is eroded once on first access and cached.
// Tile generation has 16-voxel padding around the core area: particles
// starting near a tile edge can erode INTO the padding without
// immediately falling off, reducing visible seams at tile boundaries.
//
// Trade-off: particles in tile A that would have continued into tile B
// stop at the padding edge. Some seam artifacts remain, but with 16u
// padding (chunk-scale) they're rare enough not to matter visually.
//
// PERFORMANCE
// -----------
// ~1500 particles × ~30 steps = ~45K simulation ops per tile, each
// ~10 multiplies. Estimated 30-80ms per tile generation on desktop.
// Tiles are 8 chunks wide, so a new tile is generated every ~128
// voxels of camera travel — well-spread, no continuous cost.
//
// Long-term: this should move to a Web Worker so tile-generation
// doesn't stall frames. For round 4 we ship it synchronous (first
// access has a hitch); worker migration is a polish round.

const TILE_SIZE = 128;
const PADDING   = 16;
const PADDED    = TILE_SIZE + PADDING * 2;     // 160

// Erosion tuning constants. These are mostly classical values from
// Lague's reference implementation, with a few tweaks for voxel-world
// scale (heights here are in 1-voxel units, so erosion needs to be
// strong enough to make a visible difference in <2u terms).
const HYDRAULIC_PARTICLES   = 1500;
const PARTICLE_MAX_STEPS    = 30;
const PARTICLE_INERTIA      = 0.05;
const PARTICLE_INIT_WATER   = 1.0;
const SEDIMENT_CAPACITY_K   = 4.0;
const MIN_SLOPE             = 0.01;
const EROSION_RATE          = 0.30;
const DEPOSITION_RATE       = 0.30;
const EVAPORATION_RATE      = 0.012;
const GRAVITY               = 4.0;

const THERMAL_ITERATIONS    = 3;
const TALUS_ANGLE           = 1.4;     // max stable slope (voxels per voxel)
const THERMAL_TRANSFER      = 0.4;

// Lightweight string-to-uint hash for deterministic per-tile RNG
// seeding. We want tiles to be reproducible across sessions (same
// world coordinates → same erosion result), so we seed by tile coord
// rather than Math.random().
function hashStr(s) {
    let h = 5381 | 0;
    for (let i = 0; i < s.length; i++) {
        h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
    }
    return (h >>> 0) || 1;
}

// LCG-style RNG seeded from the hash. Sequence is the same per tile
// across sessions but different between tiles.
function makeRng(seed) {
    let state = seed | 0;
    return () => {
        state = (state * 16807) | 0;
        if (state <= 0) state = (state + 2147483647) | 0;
        return state / 2147483647;
    };
}

export class ErosionCache {

    constructor(baseHeightFn) {
        // baseHeightFn(wx, wz) → float height. Called during tile
        // generation to populate the un-eroded heightmap.
        this.baseHeightFn = baseHeightFn;
        // tileKey ("tx,tz") → Float32Array(TILE_SIZE * TILE_SIZE)
        this.tiles = new Map();
        // Stats
        this.tilesGenerated = 0;
        this.lastGenMs = 0;
        // v430 — in-flight prefetch tile context (one at a time), advanced
        // by prewarm() across frames.
        this._pending = null;
    }

    // Public API. Called per-voxel-column by world.generateChunk.
    // Returns the eroded height in voxel units.
    heightAt(wx, wz) {
        // Fast path: most calls cluster within one tile. Check that
        // tile first; lazy-generate if needed.
        const tx = Math.floor(wx / TILE_SIZE);
        const tz = Math.floor(wz / TILE_SIZE);
        const key = tx + "," + tz;
        let tile = this.tiles.get(key);
        if (!tile) {
            // v430 — if this tile is mid-prefetch, finish it synchronously
            // (cheaper than a full gen — some phases are already done).
            // Otherwise generate it fully now. Either way the returned
            // value is the complete eroded height (no pop-in).
            if (this._pending && this._pending.key === key) {
                tile = this._finishPending();
            } else {
                tile = this._generateTile(tx, tz);
            }
            this.tiles.set(key, tile);
        }
        const lx = wx - tx * TILE_SIZE;
        const lz = wz - tz * TILE_SIZE;
        return tile[lx + lz * TILE_SIZE];
    }

    // v430 — a tile is built in sliceable phases so generation can be
    // spread across frames (prewarm) instead of blocking the frame the
    // camera crosses a tile boundary (the 30-80ms "60→10→60" hitch).
    // Synchronous _generateTile and the incremental prewarm path call the
    // SAME _step* helpers, so the eroded output is bit-identical either way.
    _newTileCtx(tx, tz) {
        return {
            tx, tz, key: tx + "," + tz,
            ox: tx * TILE_SIZE - PADDING,
            oz: tz * TILE_SIZE - PADDING,
            heights: new Float32Array(PADDED * PADDED),
            fillZ: 0,                                       // next base-fill row
            rng: makeRng(hashStr("hyd_" + tx + "_" + tz)),  // persisted across slices
            pIdx: 0,                                        // next hydraulic particle
            thermIter: 0,                                   // next thermal iteration
            phase: 0,                                       // 0 fill · 1 hydraulic · 2 thermal · 3 done
        };
    }

    _generateTile(tx, tz) {
        const t0 = performance.now ? performance.now() : Date.now();
        const ctx = this._newTileCtx(tx, tz);
        this._stepFill(ctx, PADDED);                       // all rows
        this._stepHydraulic(ctx, HYDRAULIC_PARTICLES);     // all particles
        this._stepThermal(ctx, THERMAL_ITERATIONS);        // all iterations
        const out = this._extract(ctx);
        const dt = (performance.now ? performance.now() : Date.now()) - t0;
        this.tilesGenerated++;
        this.lastGenMs = dt;
        return out;
    }

    // Fill up to `maxRows` more rows of the padded base heightmap from
    // domain-warped + ridged noise. Row order is irrelevant (each cell
    // independent), so slicing here can't change the result.
    _stepFill(ctx, maxRows) {
        const endZ = Math.min(PADDED, ctx.fillZ + maxRows);
        for (let z = ctx.fillZ; z < endZ; z++) {
            const base = z * PADDED;
            for (let x = 0; x < PADDED; x++) {
                ctx.heights[x + base] = this.baseHeightFn(ctx.ox + x, ctx.oz + z);
            }
        }
        ctx.fillZ = endZ;
        if (ctx.fillZ >= PADDED && ctx.phase === 0) ctx.phase = 1;
    }

    // Extract the core TILE_SIZE × TILE_SIZE region (leaving padding).
    _extract(ctx) {
        const out = new Float32Array(TILE_SIZE * TILE_SIZE);
        const h = ctx.heights;
        for (let z = 0; z < TILE_SIZE; z++) {
            for (let x = 0; x < TILE_SIZE; x++) {
                out[x + z * TILE_SIZE] = h[(x + PADDING) + (z + PADDING) * PADDED];
            }
        }
        return out;
    }

    // Particle-based hydraulic erosion. Standard algorithm; see
    // module header for the conceptual outline.
    _stepHydraulic(ctx, maxParticles) {
        const heights = ctx.heights;
        const rng = ctx.rng;            // persisted closure → resumable across slices
        const W = PADDED;
        const PAD = 2;   // particles must die before reaching outer ring
        const xMax = W - PAD - 1, zMax = W - PAD - 1;

        const end = Math.min(HYDRAULIC_PARTICLES, ctx.pIdx + maxParticles);
        for (let p = ctx.pIdx; p < end; p++) {
            // Spawn inside the tile area (not in the outermost padding
            // ring — those particles would die immediately).
            let px = PAD + rng() * (W - PAD * 2 - 1);
            let pz = PAD + rng() * (W - PAD * 2 - 1);
            let vx = 0, vz = 0;
            let water = PARTICLE_INIT_WATER;
            let sediment = 0;

            for (let step = 0; step < PARTICLE_MAX_STEPS; step++) {
                const cx = Math.floor(px), cz = Math.floor(pz);
                if (cx < PAD || cx > xMax || cz < PAD || cz > zMax) break;

                const fx = px - cx, fz = pz - cz;
                const i  = cx + cz * W;
                const h00 = heights[i];
                const h10 = heights[i + 1];
                const h01 = heights[i + W];
                const h11 = heights[i + W + 1];

                // Bilinear gradient of the heightmap at the particle's
                // sub-cell position. The X gradient at fixed z is the
                // weighted difference of the two row gradients.
                const dhdx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz;
                const dhdz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;

                // Velocity update with inertia. New velocity = old *
                // inertia + downhill * (1 - inertia). Downhill is the
                // negative gradient.
                vx = vx * PARTICLE_INERTIA + (-dhdx) * (1 - PARTICLE_INERTIA);
                vz = vz * PARTICLE_INERTIA + (-dhdz) * (1 - PARTICLE_INERTIA);
                const speedSq = vx * vx + vz * vz;
                if (speedSq < 1e-8) break;
                const speed = Math.sqrt(speedSq);
                vx /= speed; vz /= speed;

                // Move particle one step in the velocity direction.
                const npx = px + vx;
                const npz = pz + vz;
                const ncx = Math.floor(npx), ncz = Math.floor(npz);
                if (ncx < PAD || ncx > xMax || ncz < PAD || ncz > zMax) break;

                // Sample new height (bilinear, same as old).
                const nfx = npx - ncx, nfz = npz - ncz;
                const ni  = ncx + ncz * W;
                const n00 = heights[ni];
                const n10 = heights[ni + 1];
                const n01 = heights[ni + W];
                const n11 = heights[ni + W + 1];
                const newH = n00 * (1 - nfx) * (1 - nfz)
                           + n10 *      nfx  * (1 - nfz)
                           + n01 * (1 - nfx) *      nfz
                           + n11 *      nfx  *      nfz;
                const oldH = h00 * (1 - fx) * (1 - fz)
                           + h10 *      fx  * (1 - fz)
                           + h01 * (1 - fx) *      fz
                           + h11 *      fx  *      fz;
                const dh = newH - oldH;

                // Sediment capacity. More water + faster + steeper
                // downhill → more capacity. If actually going uphill
                // (dh > 0), capacity drops to MIN_SLOPE so the
                // particle drops sediment.
                const cap = Math.max(MIN_SLOPE, -dh) * speed * water * SEDIMENT_CAPACITY_K;

                if (sediment > cap || dh > 0) {
                    // Deposit. If we're going uphill, deposit enough
                    // to fill (but no more than the climb height) so
                    // the particle doesn't push terrain unnaturally.
                    const deposit = (dh > 0)
                        ? Math.min(dh, sediment)
                        : (sediment - cap) * DEPOSITION_RATE;
                    sediment -= deposit;
                    // Distribute the deposit across the 4 bilinearly-
                    // weighted cells at the current position.
                    heights[i]         += deposit * (1 - fx) * (1 - fz);
                    heights[i + 1]     += deposit *      fx  * (1 - fz);
                    heights[i + W]     += deposit * (1 - fx) *      fz;
                    heights[i + W + 1] += deposit *      fx  *      fz;
                } else {
                    // Erode. Capped by both the erosion rate and the
                    // height differential — don't erode more material
                    // than the slope provides.
                    const erode = Math.min((cap - sediment) * EROSION_RATE, -dh);
                    sediment += erode;
                    heights[i]         -= erode * (1 - fx) * (1 - fz);
                    heights[i + 1]     -= erode *      fx  * (1 - fz);
                    heights[i + W]     -= erode * (1 - fx) *      fz;
                    heights[i + W + 1] -= erode *      fx  *      fz;
                }

                // Advance position, evaporate water.
                px = npx; pz = npz;
                water *= (1 - EVAPORATION_RATE);
                if (water < 0.01) break;
            }
        }
        ctx.pIdx = end;
        if (ctx.pIdx >= HYDRAULIC_PARTICLES && ctx.phase === 1) ctx.phase = 2;
    }

    // Thermal erosion / talus relaxation. For each cell, if a neighbor
    // is below by more than TALUS_ANGLE, transfer some material across.
    // Sliced by whole iterations — each is a full grid pass that reads its
    // own in-progress mutations, so iterations stay atomic to match the
    // synchronous result exactly.
    _stepThermal(ctx, maxIters) {
        const heights = ctx.heights;
        const W = PADDED;
        const end = Math.min(THERMAL_ITERATIONS, ctx.thermIter + maxIters);
        for (let iter = ctx.thermIter; iter < end; iter++) {
            for (let z = 1; z < W - 1; z++) {
                for (let x = 1; x < W - 1; x++) {
                    const i = x + z * W;
                    const h = heights[i];
                    // Find the steepest descent among the 4 neighbors
                    let lowestH = h, lowestIdx = -1;
                    const nIdx = [i - 1, i + 1, i - W, i + W];
                    for (let k = 0; k < 4; k++) {
                        const ni = nIdx[k];
                        if (heights[ni] < lowestH) {
                            lowestH = heights[ni];
                            lowestIdx = ni;
                        }
                    }
                    if (lowestIdx < 0) continue;
                    const dh = h - lowestH;
                    if (dh > TALUS_ANGLE) {
                        const move = (dh - TALUS_ANGLE) * THERMAL_TRANSFER * 0.5;
                        heights[i]         -= move;
                        heights[lowestIdx] += move;
                    }
                }
            }
        }
        ctx.thermIter = end;
        if (ctx.thermIter >= THERMAL_ITERATIONS && ctx.phase === 2) ctx.phase = 3;
    }

    // ---- Prefetch: spread tile generation across frames -------------
    // Called each frame with the camera position. Advances the nearest
    // uncached in-radius tile by a small time budget so the tile is ready
    // BEFORE the camera reaches it — eliminating the boundary-crossing
    // stall (the 30-80ms "60→10→60" hitch). One tile in flight at a time.
    prewarm(camX, camZ, budgetMs = 3) {
        const clock = () => (performance.now ? performance.now() : Date.now());
        const t0 = clock();
        if (!this._pending) {
            const target = this._nearestUncachedTile(camX, camZ);
            if (!target) return;
            this._pending = this._newTileCtx(target.tx, target.tz);
        }
        const ctx = this._pending;
        while ((clock() - t0) < budgetMs && ctx.phase < 3) {
            if (ctx.phase === 0)      this._stepFill(ctx, 16);
            else if (ctx.phase === 1) this._stepHydraulic(ctx, 120);
            else                      this._stepThermal(ctx, 1);
        }
        if (ctx.phase >= 3) {
            this.tiles.set(ctx.key, this._extract(ctx));
            this.tilesGenerated++;
            this._pending = null;
        }
    }

    // Finish the in-progress tile synchronously (when heightAt needs a
    // tile the prefetcher hasn't completed yet — rare at normal speeds).
    _finishPending() {
        const ctx = this._pending;
        this._stepFill(ctx, PADDED);
        this._stepHydraulic(ctx, HYDRAULIC_PARTICLES);
        this._stepThermal(ctx, THERMAL_ITERATIONS);
        const out = this._extract(ctx);
        this._pending = null;
        return out;
    }

    _nearestUncachedTile(camX, camZ) {
        const ctx = Math.floor(camX / TILE_SIZE);
        const ctz = Math.floor(camZ / TILE_SIZE);
        const R = 2;   // prewarm a 5×5 tile ring (±256 units) around the camera
        let best = null, bestD = Infinity;
        for (let dz = -R; dz <= R; dz++) {
            for (let dx = -R; dx <= R; dx++) {
                const tx = ctx + dx, tz = ctz + dz;
                if (this.tiles.has(tx + "," + tz)) continue;
                const d = dx * dx + dz * dz;
                if (d < bestD) { bestD = d; best = { tx, tz }; }
            }
        }
        return best;
    }

    // v2801 — drop cached tiles beyond a Chebyshev radius of the given
    // tile center (mirror of the wasm TerrainGen::trim_tiles). Safe:
    // generation is deterministic (per-tile seeded RNG), so a trimmed
    // tile regenerates bit-identically on demand; already-generated
    // chunks hold their own voxels and are unaffected. Bounds
    // long-session memory (~65KB per tile). Does NOT touch the in-flight
    // prefetch tile (_pending) — it isn't in the map yet.
    // Returns the trimmed tile keys so the caller can keep ownership
    // bookkeeping (world._jsTiles) consistent.
    trimTiles(centerTx, centerTz, keepRadius) {
        const trimmed = [];
        for (const key of this.tiles.keys()) {
            const [tx, tz] = key.split(",").map(Number);
            if (Math.abs(tx - centerTx) > keepRadius || Math.abs(tz - centerTz) > keepRadius) {
                trimmed.push(key);
            }
        }
        for (const key of trimmed) this.tiles.delete(key);
        return trimmed;
    }

    // Debug / stats — useful in console: window._erosion.dumpStats()
    dumpStats() {
        return {
            tilesGenerated: this.tilesGenerated,
            tilesCached: this.tiles.size,
            lastGenMs: this.lastGenMs.toFixed(1),
            estCacheBytes: this.tiles.size * TILE_SIZE * TILE_SIZE * 4,
        };
    }
}
