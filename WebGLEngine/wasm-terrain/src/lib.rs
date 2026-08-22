// terrain-wasm — Rust/WASM port of the SweK VoxelEngine terrain pipeline.
//
// This is a *faithful* port of the JS generation path (v2796):
//   world/worleyBiomes.js   -> worley / climate / biome classification + blending
//   world/biomeTerrain.js   -> biomeColumnMaterials / biomeHeightParams
//   world/world.js          -> _biomeAt / _baseHeightAt / _heightAt / _caveDensityAt / generateChunk
//   world/erosion.js        -> ErosionCache tile generation (hydraulic + thermal), same seeded LCG
//
// Every constant, hash, and RNG call order matches the JS source so a given
// (seed, useWorley, cx, cz) produces the same terrain the JS path produces —
// up to possible 1-ulp differences in sin/cos between V8 and Rust libm.
// Because hydraulic erosion is chaotic, those ulp differences CAN diverge
// within an erosion tile; the JS integration layer therefore assigns each
// 128x128 tile to exactly one generator (see world/terrainWasm.js notes).
//
// Exported API (wasm-bindgen):
//   TerrainGen::new(seed, use_worley, chunk_size, chunk_height)
//   .generate_chunk(cx, cz) -> Vec<u8>       // chunk_size * chunk_height * chunk_size voxel ids
//   .height_at(wx, wz) -> i32                // eroded, clamped height (same as world._heightAt)
//   .prewarm_tile(tx, tz)                    // generate + cache one erosion tile
//   .tile_cached(tx, tz) -> bool
//   .tiles_cached(), .last_gen_ms()
//
// The erosion tile cache lives inside the TerrainGen instance, so repeated
// generate_chunk calls amortize tile generation exactly like the JS cache.

use std::collections::HashMap;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// VOXEL ids — world/voxelFormat.js
// ---------------------------------------------------------------------------
const AIR: u8 = 0;
const STONE: u8 = 1;
const DIRT: u8 = 2;
const GRASS: u8 = 3;
const SAND: u8 = 4;
const SNOW: u8 = 5;
const WATER: u8 = 10;

// generateChunk tuning — world/world.js
const WATER_LEVEL: i32 = 8;
const CAVE_THRESHOLD: f64 = 0.3;
const CAVE_CEILING_BUFFER: i32 = 4;

// Erosion tuning — world/erosion.js
const TILE_SIZE: i32 = 128;
const PADDING: i32 = 16;
const PADDED: i32 = TILE_SIZE + PADDING * 2; // 160

const HYDRAULIC_PARTICLES: u32 = 1500;
const PARTICLE_MAX_STEPS: u32 = 30;
const PARTICLE_INERTIA: f64 = 0.05;
const PARTICLE_INIT_WATER: f64 = 1.0;
const SEDIMENT_CAPACITY_K: f64 = 4.0;
const MIN_SLOPE: f64 = 0.01;
const EROSION_RATE: f64 = 0.30;
const DEPOSITION_RATE: f64 = 0.30;
const EVAPORATION_RATE: f64 = 0.012;

const THERMAL_ITERATIONS: u32 = 3;
const TALUS_ANGLE: f64 = 1.4;
const THERMAL_TRANSFER: f64 = 0.4;

// Worley biome params — world/worleyBiomes.js
const CELL_SCALE: f64 = 96.0;
const BORDER_BAND_FRAC: f64 = 0.18;

// ---------------------------------------------------------------------------
// JS-semantics helpers
// ---------------------------------------------------------------------------

/// JS `Math.imul(a, b)` — 32-bit wrapping multiply.
#[inline(always)]
fn imul(a: i32, b: i32) -> i32 {
    a.wrapping_mul(b)
}

/// JS `x >>> n` on an i32 value, result reinterpreted as i32 (as `^` operands).
#[inline(always)]
fn ushr(x: i32, n: u32) -> i32 {
    ((x as u32) >> n) as i32
}

// ---------------------------------------------------------------------------
// worleyBiomes.js — deterministic hashes, value noise, worley cells, biomes
// ---------------------------------------------------------------------------

/// worleyBiomes._hash(ix, iz, seed) -> 0..1
fn whash(ix: i32, iz: i32, seed: i32) -> f64 {
    let mut h = imul(ix, 374761393) ^ imul(iz, 668265263) ^ imul(seed, 982451653);
    h = imul(h ^ ushr(h, 13), 1274126177);
    h ^= ushr(h, 16);
    (h as u32) as f64 / 4294967295.0
}

/// worleyBiomes._hashB — second channel (seed ^ 0x9e3779b9, JS ToInt32)
#[inline]
fn whash_b(ix: i32, iz: i32, seed: i32) -> f64 {
    whash(ix, iz, seed ^ (0x9e3779b9u32 as i32))
}

/// worleyBiomes._valueNoise(x, z, seed)
fn value_noise(x: f64, z: f64, seed: i32) -> f64 {
    let x0 = x.floor();
    let z0 = z.floor();
    let fx = x - x0;
    let fz = z - z0;
    let u = fx * fx * (3.0 - 2.0 * fx);
    let v = fz * fz * (3.0 - 2.0 * fz);
    let (x0, z0) = (x0 as i32, z0 as i32);
    let h00 = whash(x0, z0, seed);
    let h10 = whash(x0 + 1, z0, seed);
    let h01 = whash(x0, z0 + 1, seed);
    let h11 = whash(x0 + 1, z0 + 1, seed);
    h00 * (1.0 - u) * (1.0 - v) + h10 * u * (1.0 - v) + h01 * (1.0 - u) * v + h11 * u * v
}

struct WorleyResult {
    f1: f64,
    f2: f64,
    cx1: i32,
    cz1: i32,
    cx2: i32,
    cz2: i32,
}

/// worleyBiomes.worley(x, z, seed, cellScale) — nearest + second-nearest jittered feature points.
/// Reference for worley_cached.
#[allow(dead_code)]
fn worley(x: f64, z: f64, seed: i32) -> WorleyResult {
    let gx = (x / CELL_SCALE).floor() as i32;
    let gz = (z / CELL_SCALE).floor() as i32;
    let mut r = WorleyResult { f1: f64::INFINITY, f2: f64::INFINITY, cx1: 0, cz1: 0, cx2: 0, cz2: 0 };
    for dj in -1..=1 {
        for di in -1..=1 {
            let cx = gx + di;
            let cz = gz + dj;
            let jx = (cx as f64 + whash(cx, cz, seed)) * CELL_SCALE;
            let jz = (cz as f64 + whash_b(cx, cz, seed)) * CELL_SCALE;
            let dx = x - jx;
            let dz = z - jz;
            let d = (dx * dx + dz * dz).sqrt();
            if d < r.f1 {
                r.f2 = r.f1; r.cx2 = r.cx1; r.cz2 = r.cz1;
                r.f1 = d; r.cx1 = cx; r.cz1 = cz;
            } else if d < r.f2 {
                r.f2 = d; r.cx2 = cx; r.cz2 = cz;
            }
        }
    }
    r
}

/// Surface / subsurface material tags used by the biome table.
#[derive(Clone, Copy, PartialEq)]
enum Mat { Snow, Grass, Sand, Dirt, Stone }

impl Mat {
    fn voxel(self) -> u8 {
        match self {
            Mat::Snow => SNOW,
            Mat::Grass => GRASS,
            Mat::Sand => SAND,
            Mat::Dirt => DIRT,
            Mat::Stone => STONE,
        }
    }
}

struct BiomeDef {
    base_h: f64,
    amp: f64,
    surface: Mat,
    sub: Mat,
}

/// worleyBiomes.BIOMES — continuous params + materials (colors omitted; not used by gen).
fn biome_def(key: Biome) -> BiomeDef {
    match key {
        Biome::Tundra =>    BiomeDef { base_h: 6.0,  amp: 3.0,  surface: Mat::Snow,  sub: Mat::Dirt },
        Biome::Taiga =>     BiomeDef { base_h: 8.0,  amp: 6.0,  surface: Mat::Grass, sub: Mat::Dirt },
        Biome::Shrubland => BiomeDef { base_h: 7.0,  amp: 5.0,  surface: Mat::Grass, sub: Mat::Dirt },
        Biome::Plains =>    BiomeDef { base_h: 6.0,  amp: 4.0,  surface: Mat::Grass, sub: Mat::Dirt },
        Biome::Forest =>    BiomeDef { base_h: 9.0,  amp: 8.0,  surface: Mat::Grass, sub: Mat::Dirt },
        Biome::Desert =>    BiomeDef { base_h: 5.0,  amp: 3.0,  surface: Mat::Sand,  sub: Mat::Sand },
        Biome::Savanna =>   BiomeDef { base_h: 6.0,  amp: 4.0,  surface: Mat::Grass, sub: Mat::Dirt },
        Biome::Jungle =>    BiomeDef { base_h: 11.0, amp: 10.0, surface: Mat::Grass, sub: Mat::Dirt },
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Biome { Tundra, Taiga, Shrubland, Plains, Forest, Desert, Savanna, Jungle }

/// worleyBiomes.classify(heat, moisture) — Whittaker-style 2D lookup.
fn classify(heat: f64, moisture: f64) -> Biome {
    if heat < 0.25 {
        if moisture < 0.40 { Biome::Tundra } else { Biome::Taiga }
    } else if heat < 0.50 {
        if moisture < 0.35 { Biome::Shrubland } else if moisture < 0.70 { Biome::Plains } else { Biome::Forest }
    } else if heat < 0.75 {
        if moisture < 0.30 { Biome::Desert } else if moisture < 0.60 { Biome::Savanna } else { Biome::Forest }
    } else {
        if moisture < 0.35 { Biome::Desert } else if moisture < 0.65 { Biome::Savanna } else { Biome::Jungle }
    }
}

/// worleyBiomes.cellClimate + biomeForCell
fn biome_for_cell(cx: i32, cz: i32, seed: i32) -> Biome {
    let heat = value_noise(cx as f64 * 0.35, cz as f64 * 0.35, seed);
    let moisture = value_noise(
        cx as f64 * 0.35 + 41.7,
        cz as f64 * 0.35 + 17.3,
        seed ^ 0x5a5a5a5a,
    );
    classify(heat, moisture)
}

struct BiomeSample {
    base_h: f64,   // blended
    amp: f64,      // blended
    surface: Mat,  // dominant cell
    sub: Mat,      // dominant cell
}

/// worleyBiomes.biomeAt(x, z, seed) — nearest two biomes, border blend, lerped params.
/// Reference for biome_at_cached.
#[allow(dead_code)]
fn biome_at(x: f64, z: f64, seed: i32) -> BiomeSample {
    let border_band = BORDER_BAND_FRAC * CELL_SCALE;
    let w = worley(x, z, seed);
    let primary = biome_for_cell(w.cx1, w.cz1, seed);
    let secondary = biome_for_cell(w.cx2, w.cz2, seed);
    let t = ((w.f2 - w.f1) / border_band).clamp(0.0, 1.0);
    let blend = 0.5 * (1.0 - t);
    let a = biome_def(primary);
    let b = biome_def(secondary);
    let lerp = |p: f64, q: f64| p + (q - p) * blend;
    BiomeSample {
        base_h: lerp(a.base_h, b.base_h),
        amp: lerp(a.amp, b.amp),
        surface: a.surface,
        sub: a.sub,
    }
}

/// v2800 — WORLEY MEMOIZATION. worley() hashes 9 candidate cells per
/// sample and biome_for_cell runs two 4-hash value noises per cell — but
/// a 160-unit erosion tile only spans a handful of DISTINCT 96-unit
/// worley cells. Caching the per-cell jittered feature point and the
/// per-cell biome classification collapses ~34 hash evaluations per
/// sample into 9 map lookups. The cached values are the exact f64s /
/// enums the direct calls produce, so downstream math is bit-identical
/// (enforced by worley_cache_is_exact). Keyed by grid cell only — the
/// seed is fixed per TerrainGen instance. Growth is bounded in practice:
/// one entry per 96×96-unit cell ever visited (~12k entries per 10k
/// units of roaming; a few hundred KB).
#[derive(Default)]
struct WorleyCache {
    points: HashMap<(i32, i32), (f64, f64)>, // jittered feature point per cell
    biomes: HashMap<(i32, i32), Biome>,      // classified biome per cell
}

impl WorleyCache {
    #[inline]
    fn point(&mut self, cx: i32, cz: i32, seed: i32) -> (f64, f64) {
        *self.points.entry((cx, cz)).or_insert_with(|| {
            (
                (cx as f64 + whash(cx, cz, seed)) * CELL_SCALE,
                (cz as f64 + whash_b(cx, cz, seed)) * CELL_SCALE,
            )
        })
    }
    #[inline]
    fn biome(&mut self, cx: i32, cz: i32, seed: i32) -> Biome {
        *self
            .biomes
            .entry((cx, cz))
            .or_insert_with(|| biome_for_cell(cx, cz, seed))
    }
}

/// worley() with memoized feature points — same candidates, same compare
/// order, same tie behavior; only the jx/jz values come from the cache
/// (and they are the exact values the direct computation produces).
fn worley_cached(x: f64, z: f64, seed: i32, cache: &mut WorleyCache) -> WorleyResult {
    let gx = (x / CELL_SCALE).floor() as i32;
    let gz = (z / CELL_SCALE).floor() as i32;
    let mut r = WorleyResult { f1: f64::INFINITY, f2: f64::INFINITY, cx1: 0, cz1: 0, cx2: 0, cz2: 0 };
    for dj in -1..=1 {
        for di in -1..=1 {
            let cx = gx + di;
            let cz = gz + dj;
            let (jx, jz) = cache.point(cx, cz, seed);
            let dx = x - jx;
            let dz = z - jz;
            let d = (dx * dx + dz * dz).sqrt();
            if d < r.f1 {
                r.f2 = r.f1; r.cx2 = r.cx1; r.cz2 = r.cz1;
                r.f1 = d; r.cx1 = cx; r.cz1 = cz;
            } else if d < r.f2 {
                r.f2 = d; r.cx2 = cx; r.cz2 = cz;
            }
        }
    }
    r
}

/// biome_at() with memoized cells — bit-identical output.
fn biome_at_cached(x: f64, z: f64, seed: i32, cache: &mut WorleyCache) -> BiomeSample {
    let border_band = BORDER_BAND_FRAC * CELL_SCALE;
    let w = worley_cached(x, z, seed, cache);
    let primary = cache.biome(w.cx1, w.cz1, seed);
    let secondary = cache.biome(w.cx2, w.cz2, seed);
    let t = ((w.f2 - w.f1) / border_band).clamp(0.0, 1.0);
    let blend = 0.5 * (1.0 - t);
    let a = biome_def(primary);
    let b = biome_def(secondary);
    let lerp = |p: f64, q: f64| p + (q - p) * blend;
    BiomeSample {
        base_h: lerp(a.base_h, b.base_h),
        amp: lerp(a.amp, b.amp),
        surface: a.surface,
        sub: a.sub,
    }
}

// ---------------------------------------------------------------------------
// biomeTerrain.js — column materials + height params
// ---------------------------------------------------------------------------

/// biomeTerrain.biomeColumnMaterials(wx, wz, seed, height, { slope, waterLevel })
/// Defaults: peakStone 36, snowCap 44. Reference for the _cached variant.
#[allow(dead_code)]
fn biome_column_materials(wx: f64, wz: f64, seed: i32, height: i32, slope: i32) -> (u8, u8) {
    let b = biome_at(wx, wz, seed);
    let mut surface = b.surface;
    let mut sub = b.sub;
    let is_sandy = b.surface == Mat::Sand;
    let is_snowy = b.surface == Mat::Snow;

    // elevation-first overrides (same precedence chain as JS)
    if height > 44 {
        surface = Mat::Snow;
        sub = Mat::Stone;
    } else if height > 36 && !is_sandy {
        surface = Mat::Stone;
        sub = Mat::Stone;
    } else if height <= WATER_LEVEL + 2 && !is_snowy {
        surface = Mat::Sand;
        sub = Mat::Sand;
    } else if slope >= 3 && !is_sandy {
        surface = Mat::Dirt;
    }
    (surface.voxel(), sub.voxel())
}

/// Cached variant of biome_column_materials — identical logic over the
/// bit-identical biome_at_cached sample.
fn biome_column_materials_cached(
    wx: f64, wz: f64, seed: i32, height: i32, slope: i32, cache: &mut WorleyCache,
) -> (u8, u8) {
    let b = biome_at_cached(wx, wz, seed, cache);
    let mut surface = b.surface;
    let mut sub = b.sub;
    let is_sandy = b.surface == Mat::Sand;
    let is_snowy = b.surface == Mat::Snow;
    if height > 44 {
        surface = Mat::Snow;
        sub = Mat::Stone;
    } else if height > 36 && !is_sandy {
        surface = Mat::Stone;
        sub = Mat::Stone;
    } else if height <= WATER_LEVEL + 2 && !is_snowy {
        surface = Mat::Sand;
        sub = Mat::Sand;
    } else if slope >= 3 && !is_sandy {
        surface = Mat::Dirt;
    }
    (surface.voxel(), sub.voxel())
}

#[derive(Clone, Copy, PartialEq)]
enum Kind { Desert, Plains, Mountain }

/// Cached variant of biome_height_params — identical logic over the
/// bit-identical biome_at_cached sample.
fn biome_height_params_cached(wx: f64, wz: f64, seed: i32, cache: &mut WorleyCache) -> (f64, f64, Kind) {
    let b = biome_at_cached(wx, wz, seed, cache);
    let base = 13.0 + b.base_h;
    let amp_mul = (b.amp / 6.0).clamp(0.4, 1.6);
    let kind = if b.amp < 4.0 { Kind::Desert } else if b.amp >= 8.0 { Kind::Mountain } else { Kind::Plains };
    (base, amp_mul, kind)
}

/// biomeTerrain.biomeHeightParams(wx, wz, seed) — { base, ampMul, kind }
/// Reference for the _cached variant.
#[allow(dead_code)]
fn biome_height_params(wx: f64, wz: f64, seed: i32) -> (f64, f64, Kind) {
    let b = biome_at(wx, wz, seed);
    let base = 13.0 + b.base_h; // baseFloor 13
    let amp_mul = (b.amp / 6.0).clamp(0.4, 1.6); // ampDivisor 6
    let kind = if b.amp < 4.0 { Kind::Desert } else if b.amp >= 8.0 { Kind::Mountain } else { Kind::Plains };
    (base, amp_mul, kind)
}

// ---------------------------------------------------------------------------
// world.js — legacy biome, base height (domain warp + ridged/fBm), caves
// ---------------------------------------------------------------------------

/// world._biomeAt(wx, wz) — legacy low-frequency continuous biome scalar.
#[inline]
fn legacy_biome_at(wx: f64, wz: f64) -> f64 {
    (wx * 0.012).sin() * (wz * 0.011).cos() + 0.4 * ((wx + wz) * 0.018).sin()
}

#[inline]
fn legacy_biome_kind(biome: f64) -> Kind {
    if biome < -0.5 { Kind::Desert } else if biome > 0.5 { Kind::Mountain } else { Kind::Plains }
}

/// world._baseHeightAt(wx, wz) — un-eroded height. Flag-aware (worley vs legacy).
/// v2799: production fills use fill_base_heights (table-driven, bit-identical);
/// this direct form is retained as the reference for fill_tables_are_bit_identical.
#[allow(dead_code)]
fn base_height_at(wx: f64, wz: f64, seed: i32, use_worley: bool, chunk_height: i32) -> f64 {
    let (kind, base, amp);
    if use_worley {
        let (b, a, k) = biome_height_params(wx, wz, seed);
        kind = k; base = b; amp = a;
    } else {
        let biome = legacy_biome_at(wx, wz);
        kind = legacy_biome_kind(biome);
        base = 20.0 + biome * 4.0;
        amp = (1.0 + biome * 0.5).clamp(0.4, 1.5);
    }

    // Domain warping (Round 133)
    let warp_x = (wx * 0.018 + 0.7).sin() * (wz * 0.022).cos() * 8.0;
    let warp_z = (wx * 0.021).cos() * (wz * 0.019 + 1.2).sin() * 8.0;
    let sx = wx + warp_x;
    let sz = wz + warp_z;

    let hill;
    if kind == Kind::Mountain {
        // Ridged multifractal + valley carving
        let r1 = 1.0 - ((sx * 0.04).sin() * (sz * 0.04).cos()).abs();
        let r2 = 1.0 - (sx * 0.09 + 1.7).sin().abs();
        let r3 = 1.0 - (sz * 0.11 + 0.3).cos().abs();
        let ridge = (r1 * r1 * 14.0)
            + (r2 * r1 * 4.0)
            + (r3 * r1 * 3.0)
            + ((sx * 0.27).sin() * (sz * 0.27).cos() * 2.0);
        let valley_dip = (0.35 - r1).max(0.0) * 12.0;
        hill = ridge - valley_dip + ((wx + wz) * 0.4).sin();
    } else {
        // Plains/desert — 5-octave fBm; last octave un-warped
        hill = 12.0 * (sx * 0.04).sin() * (sz * 0.04).cos()
            + 5.0 * (sx * 0.09 + 1.7).sin()
            + 3.0 * (sz * 0.11 + 0.3).cos()
            + 3.0 * (sx * 0.27).sin() * (sz * 0.27).cos()
            + 1.0 * ((wx + wz) * 0.4).sin();
    }

    let h = (base + hill * amp).floor();
    h.max(1.0).min((chunk_height - 1) as f64)
}

/// world._caveDensityAt(wx, wy, wz) — two-channel trig noise, ~[0, 3].
/// Retained as the reference implementation for cave_lut_is_bit_identical.
#[allow(dead_code)]
#[inline]
fn cave_density_at(wx: f64, wy: f64, wz: f64) -> f64 {
    let a = (wx * 0.06).sin() * (wy * 0.05).cos() * (wz * 0.06).sin();
    let b = (wx * 0.04 + 1.7).sin() * (wz * 0.05 + 0.3).cos() + (wy * 0.07).sin();
    a.abs() + b.abs()
}

// ---------------------------------------------------------------------------
// erosion.js — seeded per-tile RNG + hydraulic + thermal erosion
// ---------------------------------------------------------------------------

/// erosion.hashStr — djb2-xor over the tile-key string, min 1.
fn hash_str(s: &str) -> u32 {
    let mut h: i32 = 5381;
    for &c in s.as_bytes() {
        h = (h.wrapping_shl(5).wrapping_add(h)) ^ (c as i32);
    }
    let u = h as u32;
    if u == 0 { 1 } else { u }
}

/// erosion.makeRng — Park–Miller-style LCG with JS `| 0` wrapping semantics.
struct Lcg {
    state: i32,
}

impl Lcg {
    fn new(seed: u32) -> Self {
        Lcg { state: seed as i32 }
    }
    #[inline]
    fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_mul(16807);
        if self.state <= 0 {
            self.state = self.state.wrapping_add(2147483647);
        }
        self.state as f64 / 2147483647.0
    }
}

/// v2799 — table-driven base-height fill for one padded erosion tile.
///
/// Every trig call in base_height_at whose argument depends on ONLY wx,
/// ONLY wz, or ONLY (wx+wz) is precomputed into a 1D table (160 or 319
/// entries) instead of being evaluated per cell (25,600 cells). All
/// coordinates here are integer-valued f64 well inside the 2^53 exact
/// range, so (ox+x)+(oz+z) == (ox+oz)+(x+z) bitwise and table lookups
/// return the EXACT same f64 the direct call would — the per-cell math
/// then substitutes identical values in the identical op order, making
/// the output bit-identical to base_height_at (enforced by
/// fill_tables_are_bit_identical). The warped-coordinate trig inside the
/// hill branches has non-integer arguments and stays direct.
fn fill_base_heights(ox: f64, oz: f64, seed: i32, use_worley: bool, chunk_height: i32, cache: &mut WorleyCache) -> Vec<f64> {
    let w = PADDED as usize;
    let diag_n = 2 * w - 1;

    // x-only / z-only / diagonal tables
    let mut t_warp_sx = vec![0.0f64; w];
    let mut t_warp_cx = vec![0.0f64; w];
    let mut t_warp_cz = vec![0.0f64; w];
    let mut t_warp_sz = vec![0.0f64; w];
    let mut t_diag4 = vec![0.0f64; diag_n];
    for i in 0..w {
        let wx = ox + i as f64;
        t_warp_sx[i] = (wx * 0.018 + 0.7).sin();
        t_warp_cx[i] = (wx * 0.021).cos();
        let wz = oz + i as f64;
        t_warp_cz[i] = (wz * 0.022).cos();
        t_warp_sz[i] = (wz * 0.019 + 1.2).sin();
    }
    for k in 0..diag_n {
        t_diag4[k] = ((ox + oz + k as f64) * 0.4).sin();
    }
    // legacy-only tables
    let (mut t_bio_sx, mut t_bio_cz, mut t_diag18) = (Vec::new(), Vec::new(), Vec::new());
    if !use_worley {
        t_bio_sx = (0..w).map(|i| ((ox + i as f64) * 0.012).sin()).collect();
        t_bio_cz = (0..w).map(|j| ((oz + j as f64) * 0.011).cos()).collect();
        t_diag18 = (0..diag_n).map(|k| ((ox + oz + k as f64) * 0.018).sin()).collect();
    }

    let mut heights = vec![0.0f64; w * w];
    for z in 0..w {
        let wz = oz + z as f64;
        let base_i = z * w;
        for x in 0..w {
            let wx = ox + x as f64;
            let k = x + z;

            let (kind, base, amp);
            if use_worley {
                let (b, a, kk) = biome_height_params_cached(wx, wz, seed, cache);
                kind = kk; base = b; amp = a;
            } else {
                let biome = t_bio_sx[x] * t_bio_cz[z] + 0.4 * t_diag18[k];
                kind = legacy_biome_kind(biome);
                base = 20.0 + biome * 4.0;
                amp = (1.0 + biome * 0.5).clamp(0.4, 1.5);
            }

            let warp_x = t_warp_sx[x] * t_warp_cz[z] * 8.0;
            let warp_z = t_warp_cx[x] * t_warp_sz[z] * 8.0;
            let sx = wx + warp_x;
            let sz = wz + warp_z;

            let hill;
            if kind == Kind::Mountain {
                let r1 = 1.0 - ((sx * 0.04).sin() * (sz * 0.04).cos()).abs();
                let r2 = 1.0 - (sx * 0.09 + 1.7).sin().abs();
                let r3 = 1.0 - (sz * 0.11 + 0.3).cos().abs();
                let ridge = (r1 * r1 * 14.0)
                    + (r2 * r1 * 4.0)
                    + (r3 * r1 * 3.0)
                    + ((sx * 0.27).sin() * (sz * 0.27).cos() * 2.0);
                let valley_dip = (0.35 - r1).max(0.0) * 12.0;
                hill = ridge - valley_dip + t_diag4[k];
            } else {
                hill = 12.0 * (sx * 0.04).sin() * (sz * 0.04).cos()
                    + 5.0 * (sx * 0.09 + 1.7).sin()
                    + 3.0 * (sz * 0.11 + 0.3).cos()
                    + 3.0 * (sx * 0.27).sin() * (sz * 0.27).cos()
                    + 1.0 * t_diag4[k];
            }

            let h = (base + hill * amp).floor();
            heights[x + base_i] = h.max(1.0).min((chunk_height - 1) as f64);
        }
    }
    heights
}

/// ErosionCache._generateTile — fill padded base heightmap, run hydraulic
/// particles, run thermal relaxation, extract the 128x128 core.
fn generate_tile(tx: i32, tz: i32, seed: i32, use_worley: bool, chunk_height: i32, cache: &mut WorleyCache) -> Vec<f32> {
    let w = PADDED as usize;
    let ox = (tx * TILE_SIZE - PADDING) as f64;
    let oz = (tz * TILE_SIZE - PADDING) as f64;

    // --- fill (v2799: table-driven, bit-identical to base_height_at) ---
    let mut heights = fill_base_heights(ox, oz, seed, use_worley, chunk_height, cache);

    // --- hydraulic (same RNG call order as JS: px, pz per particle) ---
    let mut rng = Lcg::new(hash_str(&format!("hyd_{}_{}", tx, tz)));
    let wf = PADDED as f64;
    const PAD: i32 = 2;
    let x_max = PADDED - PAD - 1;
    let z_max = PADDED - PAD - 1;

    for _p in 0..HYDRAULIC_PARTICLES {
        let mut px = PAD as f64 + rng.next() * (wf - (PAD * 2) as f64 - 1.0);
        let mut pz = PAD as f64 + rng.next() * (wf - (PAD * 2) as f64 - 1.0);
        let mut vx = 0.0f64;
        let mut vz = 0.0f64;
        let mut water = PARTICLE_INIT_WATER;
        let mut sediment = 0.0f64;

        for _step in 0..PARTICLE_MAX_STEPS {
            let cx = px.floor() as i32;
            let cz = pz.floor() as i32;
            if cx < PAD || cx > x_max || cz < PAD || cz > z_max {
                break;
            }
            let fx = px - cx as f64;
            let fz = pz - cz as f64;
            let i = (cx + cz * PADDED) as usize;
            let h00 = heights[i];
            let h10 = heights[i + 1];
            let h01 = heights[i + w];
            let h11 = heights[i + w + 1];

            let dhdx = (h10 - h00) * (1.0 - fz) + (h11 - h01) * fz;
            let dhdz = (h01 - h00) * (1.0 - fx) + (h11 - h10) * fx;

            vx = vx * PARTICLE_INERTIA + (-dhdx) * (1.0 - PARTICLE_INERTIA);
            vz = vz * PARTICLE_INERTIA + (-dhdz) * (1.0 - PARTICLE_INERTIA);
            let speed_sq = vx * vx + vz * vz;
            if speed_sq < 1e-8 {
                break;
            }
            let speed = speed_sq.sqrt();
            vx /= speed;
            vz /= speed;

            let npx = px + vx;
            let npz = pz + vz;
            let ncx = npx.floor() as i32;
            let ncz = npz.floor() as i32;
            if ncx < PAD || ncx > x_max || ncz < PAD || ncz > z_max {
                break;
            }

            let nfx = npx - ncx as f64;
            let nfz = npz - ncz as f64;
            let ni = (ncx + ncz * PADDED) as usize;
            let n00 = heights[ni];
            let n10 = heights[ni + 1];
            let n01 = heights[ni + w];
            let n11 = heights[ni + w + 1];
            let new_h = n00 * (1.0 - nfx) * (1.0 - nfz)
                + n10 * nfx * (1.0 - nfz)
                + n01 * (1.0 - nfx) * nfz
                + n11 * nfx * nfz;
            let old_h = h00 * (1.0 - fx) * (1.0 - fz)
                + h10 * fx * (1.0 - fz)
                + h01 * (1.0 - fx) * fz
                + h11 * fx * fz;
            let dh = new_h - old_h;

            let cap = (-dh).max(MIN_SLOPE) * speed * water * SEDIMENT_CAPACITY_K;

            if sediment > cap || dh > 0.0 {
                let deposit = if dh > 0.0 {
                    dh.min(sediment)
                } else {
                    (sediment - cap) * DEPOSITION_RATE
                };
                sediment -= deposit;
                heights[i] += deposit * (1.0 - fx) * (1.0 - fz);
                heights[i + 1] += deposit * fx * (1.0 - fz);
                heights[i + w] += deposit * (1.0 - fx) * fz;
                heights[i + w + 1] += deposit * fx * fz;
            } else {
                let erode = ((cap - sediment) * EROSION_RATE).min(-dh);
                sediment += erode;
                heights[i] -= erode * (1.0 - fx) * (1.0 - fz);
                heights[i + 1] -= erode * fx * (1.0 - fz);
                heights[i + w] -= erode * (1.0 - fx) * fz;
                heights[i + w + 1] -= erode * fx * fz;
            }

            px = npx;
            pz = npz;
            water *= 1.0 - EVAPORATION_RATE;
            if water < 0.01 {
                break;
            }
        }
    }

    // --- thermal relaxation ---
    for _iter in 0..THERMAL_ITERATIONS {
        for z in 1..(w - 1) {
            for x in 1..(w - 1) {
                let i = x + z * w;
                let h = heights[i];
                let mut lowest_h = h;
                let mut lowest_idx = usize::MAX;
                let n_idx = [i - 1, i + 1, i - w, i + w];
                for &ni in &n_idx {
                    if heights[ni] < lowest_h {
                        lowest_h = heights[ni];
                        lowest_idx = ni;
                    }
                }
                if lowest_idx == usize::MAX {
                    continue;
                }
                let dh = h - lowest_h;
                if dh > TALUS_ANGLE {
                    let mv = (dh - TALUS_ANGLE) * THERMAL_TRANSFER * 0.5;
                    heights[i] -= mv;
                    heights[lowest_idx] += mv;
                }
            }
        }
    }

    // --- extract 128x128 core (matches ErosionCache._extract: stores f32) ---
    let ts = TILE_SIZE as usize;
    let pad = PADDING as usize;
    let mut out = vec![0.0f32; ts * ts];
    for z in 0..ts {
        for x in 0..ts {
            out[x + z * ts] = heights[(x + pad) + (z + pad) * w] as f32;
        }
    }
    out
}

// ---------------------------------------------------------------------------
// Public wasm-bindgen API
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub struct TerrainGen {
    seed: i32,
    use_worley: bool,
    chunk_size: i32,
    chunk_height: i32,
    tiles: HashMap<(i32, i32), Vec<f32>>,
    tiles_generated: u32,
    worley: WorleyCache,   // v2800 — memoized worley cells (see WorleyCache)
    // v2798 — cave-noise LUTs. cave_density_at's y-terms only ever see
    // INTEGER world heights (0..chunk_height), so cos(y*0.05) and
    // sin(y*0.07) are tabulated once. The per-voxel evaluation keeps the
    // exact multiplication/addition order of the direct formula, so the
    // result is BIT-IDENTICAL (verified by cave_lut_is_bit_identical).
    cos_y_005: Vec<f64>,
    sin_y_007: Vec<f64>,
}

/// JS `Math.floor(a / b)` for possibly-negative world coords.
#[inline]
fn floor_div(a: i32, b: i32) -> i32 {
    (a as f64 / b as f64).floor() as i32
}

#[wasm_bindgen]
impl TerrainGen {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: i32, use_worley: bool, chunk_size: u32, chunk_height: u32) -> TerrainGen {
        let h = chunk_height as i32;
        let cos_y_005 = (0..h).map(|y| (y as f64 * 0.05).cos()).collect();
        let sin_y_007 = (0..h).map(|y| (y as f64 * 0.07).sin()).collect();
        TerrainGen {
            seed,
            use_worley,
            chunk_size: chunk_size as i32,
            chunk_height: h,
            tiles: HashMap::new(),
            tiles_generated: 0,
            worley: WorleyCache::default(),
            cos_y_005,
            sin_y_007,
        }
    }

    fn tile(&mut self, tx: i32, tz: i32) -> &Vec<f32> {
        if !self.tiles.contains_key(&(tx, tz)) {
            let t = generate_tile(tx, tz, self.seed, self.use_worley, self.chunk_height, &mut self.worley);
            self.tiles.insert((tx, tz), t);
            self.tiles_generated += 1;
        }
        self.tiles.get(&(tx, tz)).unwrap()
    }

    /// world._heightAt — eroded height for a column (no real-terrain override;
    /// the JS side keeps override chunks on the JS path).
    pub fn height_at(&mut self, wx: i32, wz: i32) -> i32 {
        let tx = floor_div(wx, TILE_SIZE);
        let tz = floor_div(wz, TILE_SIZE);
        let ch = self.chunk_height;
        let tile = self.tile(tx, tz);
        let lx = (wx - tx * TILE_SIZE) as usize;
        let lz = (wz - tz * TILE_SIZE) as usize;
        let h = tile[lx + lz * TILE_SIZE as usize] as f64;
        (h.floor() as i32).max(1).min(ch - 1)
    }

    /// Generate + cache one erosion tile (worker/prewarm use).
    pub fn prewarm_tile(&mut self, tx: i32, tz: i32) {
        self.tile(tx, tz);
    }

    pub fn tile_cached(&self, tx: i32, tz: i32) -> bool {
        self.tiles.contains_key(&(tx, tz))
    }

    pub fn tiles_cached(&self) -> u32 {
        self.tiles.len() as u32
    }

    /// v2800 — drop cached erosion tiles beyond a Chebyshev radius of the
    /// given tile center. Safe: any trimmed tile regenerates identically
    /// on demand (generation is deterministic). Bounds long-session
    /// memory (~65KB per tile). Returns the number of tiles dropped.
    pub fn trim_tiles(&mut self, center_tx: i32, center_tz: i32, keep_radius: i32) -> u32 {
        let before = self.tiles.len();
        self.tiles.retain(|&(tx, tz), _| {
            (tx - center_tx).abs() <= keep_radius && (tz - center_tz).abs() <= keep_radius
        });
        (before - self.tiles.len()) as u32
    }

    /// world.generateChunk(cx, cz) — returns the full voxel array
    /// (chunk_size * chunk_height * chunk_size u8, index = x + S*(z + S*y)).
    pub fn generate_chunk(&mut self, cx: i32, cz: i32) -> Vec<u8> {
        let s = self.chunk_size;
        let h = self.chunk_height;
        let su = s as usize;
        let mut voxels = vec![AIR; su * su * h as usize];

        // Per-column heights for the chunk plus a 1-voxel apron for slope.
        // Fixed scratch (S+2)^2 — for chunk_size 16 that's 324 i32 on the
        // heap once per call; a TinyVec/SmallVec would matter here only if
        // this became a variable-length per-column list (see README).
        let aw = (s + 2) as usize;
        let mut hgrid = vec![0i32; aw * aw];
        for gz in 0..aw as i32 {
            for gx in 0..aw as i32 {
                let wx = cx * s + gx - 1;
                let wz = cz * s + gz - 1;
                hgrid[(gx + gz * aw as i32) as usize] = self.height_at(wx, wz);
            }
        }
        let hg = |gx: i32, gz: i32| hgrid[((gx + 1) + (gz + 1) * aw as i32) as usize];

        let idx = |x: i32, y: i32, z: i32| (x + s * (z + s * y)) as usize;

        for x in 0..s {
            for z in 0..s {
                let wx = cx * s + x;
                let wz = cz * s + z;

                let height = hg(x, z);

                // Slope = max abs height delta to any 4-neighbour.
                let d_n = (hg(x, z - 1) - height).abs();
                let d_s = (hg(x, z + 1) - height).abs();
                let d_e = (hg(x + 1, z) - height).abs();
                let d_w = (hg(x - 1, z) - height).abs();
                let slope = d_n.max(d_s).max(d_e).max(d_w);

                // Per-biome surface + mid-layer choice.
                let surface_type: u8;
                let mut mid_layer: u8 = DIRT;
                if self.use_worley {
                    let (surf, sub) = biome_column_materials_cached(
                        wx as f64, wz as f64, self.seed, height, slope, &mut self.worley);
                    surface_type = surf;
                    mid_layer = sub;
                } else {
                    let biome = legacy_biome_at(wx as f64, wz as f64);
                    match legacy_biome_kind(biome) {
                        Kind::Desert => {
                            surface_type = SAND;
                            mid_layer = SAND;
                        }
                        Kind::Mountain => {
                            mid_layer = STONE;
                            surface_type = if height > 36 {
                                STONE
                            } else if slope >= 2 {
                                DIRT
                            } else {
                                GRASS
                            };
                        }
                        Kind::Plains => {
                            surface_type = if height <= 10 {
                                SAND
                            } else if slope >= 2 {
                                DIRT
                            } else {
                                GRASS
                            };
                        }
                    }
                }

                // Column fill: stone core, mid layer, surface cap.
                for y in 0..h {
                    let v = if y < height - 4 {
                        STONE
                    } else if y < height - 1 {
                        mid_layer
                    } else if y == height - 1 {
                        surface_type
                    } else {
                        AIR
                    };
                    if v != AIR {
                        voxels[idx(x, y, z)] = v;
                    }
                }

                // Cave carve pass — STONE only, below surface buffer, above bedrock.
                // v2798 — LUT form of cave_density_at. Direct formula:
                //   a = sin(wx*.06) * cos(wy*.05) * sin(wz*.06)     (left-assoc)
                //   b = sin(wx*.04+1.7) * cos(wz*.05+.3) + sin(wy*.07)
                // Per column the wx/wz factors are constant and wy is the
                // integer y, so with the constructor LUTs each voxel costs
                // two mults + one add + two abs — zero trig — while keeping
                // the exact op order (bit-identical; see tests).
                let s1 = (wx as f64 * 0.06).sin();
                let s2 = (wz as f64 * 0.06).sin();
                let b1 = (wx as f64 * 0.04 + 1.7).sin() * (wz as f64 * 0.05 + 0.3).cos();
                let cave_top = height - CAVE_CEILING_BUFFER;
                let mut y = 1;
                while y < cave_top {
                    let i = idx(x, y, z);
                    if voxels[i] == STONE {
                        let a = s1 * self.cos_y_005[y as usize] * s2;
                        let b = b1 + self.sin_y_007[y as usize];
                        if a.abs() + b.abs() < CAVE_THRESHOLD {
                            voxels[i] = if y < WATER_LEVEL { WATER } else { AIR };
                        }
                    }
                    y += 1;
                }

                // Ocean fill — AIR below WATER_LEVEL becomes WATER.
                for y in 0..WATER_LEVEL {
                    let i = idx(x, y, z);
                    if voxels[i] == AIR {
                        voxels[i] = WATER;
                    }
                }
            }
        }

        voxels
    }
}

// ---------------------------------------------------------------------------
// Native tests (run with plain `cargo test`, no wasm needed) — sanity checks
// the port is internally consistent; cross-checks against JS live in
// tools/terrain-parity.mjs.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    // Reference values below were captured from the ACTUAL JS functions
    // running under Node/V8 (see tools/terrain-parity.mjs for the full
    // cross-check). Integer paths must match exactly; f64 paths to 1e-15.

    #[test]
    fn whash_matches_v8_exactly() {
        assert!((whash(12, -7, 1337) - 0.93726352367952082).abs() < 1e-15);
        assert!((whash(0, 0, 1337) - 0.49993145826736735).abs() < 1e-15);
    }

    #[test]
    fn hash_str_matches_v8_exactly() {
        // Includes a negative tile coordinate ("-" is part of the string).
        assert_eq!(hash_str("hyd_0_0"), 1100740080);
        assert_eq!(hash_str("hyd_-3_7"), 1963583833);
    }

    #[test]
    fn lcg_matches_v8_exactly() {
        let mut r = Lcg::new(hash_str("hyd_0_0"));
        assert!((r.next() - 0.79832071848135477).abs() < 1e-15);
        assert!((r.next() - 0.37630926788612701).abs() < 1e-15);
        assert!((r.next() - 0.62986241729457970).abs() < 1e-15);
    }

    // Full-pipeline check: material histograms of two legacy-path chunks,
    // captured from the pristine JS world (seed 1337). Erosion is chaotic
    // under sin/cos ulp differences, so allow a small per-material drift;
    // a port bug shifts these by thousands, not dozens.
    fn hist(v: &[u8]) -> HashMap<u8, i64> {
        let mut m = HashMap::new();
        for &x in v {
            *m.entry(x).or_insert(0) += 1;
        }
        m
    }

    fn assert_hist_close(actual: &HashMap<u8, i64>, expected: &[(u8, i64)], tol: i64) {
        for &(mat, count) in expected {
            let a = *actual.get(&mat).unwrap_or(&0);
            assert!(
                (a - count).abs() <= tol,
                "material {mat}: got {a}, expected {count} (±{tol})"
            );
        }
    }

    #[test]
    fn worley_cache_is_exact() {
        // Cached biome sampling must return the exact same f64 bits and
        // material choices as the uncached reference — including on cache
        // HITS (the cache is shared across the whole sweep).
        let mut cache = WorleyCache::default();
        let mut coords = Vec::new();
        for i in -40..40 {
            for j in -40..40 {
                coords.push((i as f64 * 37.0, j as f64 * 41.0));
            }
        }
        // Two passes: second pass is all cache hits.
        for _pass in 0..2 {
            for &(x, z) in &coords {
                let a = biome_at(x, z, 1337);
                let b = biome_at_cached(x, z, 1337, &mut cache);
                assert!(a.base_h.to_bits() == b.base_h.to_bits(), "base_h at ({x},{z})");
                assert!(a.amp.to_bits() == b.amp.to_bits(), "amp at ({x},{z})");
                assert!(a.surface == b.surface && a.sub == b.sub, "materials at ({x},{z})");
            }
        }
        assert!(cache.points.len() > 10 && cache.biomes.len() > 10, "cache unused?");
    }

    #[test]
    fn trim_tiles_drops_far_keeps_near() {
        let mut g = TerrainGen::new(1337, false, 16, 64);
        g.prewarm_tile(0, 0);
        g.prewarm_tile(1, 0);
        g.prewarm_tile(9, 9);
        assert_eq!(g.tiles_cached(), 3);
        let dropped = g.trim_tiles(0, 0, 2);
        assert_eq!(dropped, 1);
        assert!(g.tile_cached(0, 0) && g.tile_cached(1, 0) && !g.tile_cached(9, 9));
        // Trimmed tiles regenerate identically (determinism).
        let h_before = g.height_at(9 * 128 + 5, 9 * 128 + 5);
        let mut g2 = TerrainGen::new(1337, false, 16, 64);
        assert_eq!(h_before, g2.height_at(9 * 128 + 5, 9 * 128 + 5));
    }

    #[test]
    fn fill_tables_are_bit_identical() {
        // fill_base_heights must reproduce base_height_at EXACTLY for
        // every cell of a padded tile — both biome paths, including
        // negative tile coords (negative integer f64 sums are also exact).
        for &(tx, tz) in &[(0i32, 0i32), (-3, 7), (11, -2)] {
            for &worley in &[false, true] {
                let ox = (tx * TILE_SIZE - PADDING) as f64;
                let oz = (tz * TILE_SIZE - PADDING) as f64;
                let mut cache = WorleyCache::default();
                let tab = fill_base_heights(ox, oz, 1337, worley, 64, &mut cache);
                let w = PADDED as usize;
                for z in 0..w {
                    for x in 0..w {
                        let direct =
                            base_height_at(ox + x as f64, oz + z as f64, 1337, worley, 64);
                        assert!(
                            tab[x + z * w].to_bits() == direct.to_bits(),
                            "bit mismatch tile({tx},{tz}) worley={worley} cell({x},{z})"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn cave_lut_is_bit_identical() {
        // The LUT evaluation must reproduce cave_density_at EXACTLY —
        // same fp op order, so same bits — across the whole y range and a
        // spread of world coords (including negatives).
        let g = TerrainGen::new(1337, false, 16, 64);
        for &wx in &[-1000i32, -137, -1, 0, 1, 63, 999, 4096] {
            for &wz in &[-777i32, -16, 0, 5, 128, 2222] {
                let s1 = (wx as f64 * 0.06).sin();
                let s2 = (wz as f64 * 0.06).sin();
                let b1 = (wx as f64 * 0.04 + 1.7).sin() * (wz as f64 * 0.05 + 0.3).cos();
                for y in 0..64i32 {
                    let lut = (s1 * g.cos_y_005[y as usize] * s2).abs()
                        + (b1 + g.sin_y_007[y as usize]).abs();
                    let direct = cave_density_at(wx as f64, y as f64, wz as f64);
                    assert!(
                        lut.to_bits() == direct.to_bits(),
                        "bit mismatch at ({wx},{y},{wz}): lut={lut:e} direct={direct:e}"
                    );
                }
            }
        }
    }

    #[test]
    fn legacy_chunks_match_js_histograms() {
        let mut g = TerrainGen::new(1337, false, 16, 64);
        let h00 = hist(&g.generate_chunk(0, 0));
        assert_hist_close(&h00, &[(0, 9896), (1, 5464), (2, 856), (3, 168)], 60);
        let h32 = hist(&g.generate_chunk(-3, 2));
        assert_hist_close(
            &h32,
            &[(0, 12020), (1, 3316), (2, 634), (3, 146), (4, 244), (10, 24)],
            60,
        );
    }

    #[test]
    fn chunk_is_full_size_and_has_terrain() {
        let mut g = TerrainGen::new(1337, false, 16, 64);
        let v = g.generate_chunk(0, 0);
        assert_eq!(v.len(), 16 * 16 * 64);
        let stone = v.iter().filter(|&&m| m == STONE).count();
        assert!(stone > 1000, "expected substantial stone, got {stone}");
    }

    #[test]
    fn deterministic_across_instances() {
        let mut a = TerrainGen::new(42, true, 16, 64);
        let mut b = TerrainGen::new(42, true, 16, 64);
        assert_eq!(a.generate_chunk(3, -2), b.generate_chunk(3, -2));
    }
}
