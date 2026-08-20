# terrain-wasm — WASM terrain generation for the VoxelEngine

Rust port of the full terrain pipeline (`_baseHeightAt` domain-warp/ridged
noise, Worley biomes, hydraulic + thermal erosion tiles, chunk fill with
caves and ocean) compiled to WebAssembly. One JS↔WASM boundary crossing per
chunk: `generate_chunk(cx, cz)` returns the complete 16×64×16 voxel array.

The engine runs **unchanged without this build** — `world/terrainWasm.js`
detects the missing package and the original JS path takes over. This crate
is the opt-in fast path.

## Layout (inside WebGLEngine/)

```
wasm-terrain/                 this crate (Cargo.toml, src/lib.rs, build_wasm.bat)
world/terrainWasm.js          loader + graceful-fallback wrapper
world/terrainGenWorker.js     Web Worker running TerrainGen off-thread (v2798)
world/terrainWorkerClient.js  worker manager + ready-chunk cache (v2798)
world/world.js                patched: wasm fast path, tile ownership, worker feed
world/wasm/                   build output lands here (terrain_wasm.js + _bg.wasm)
tools/terrain-parity.mjs      JS-vs-WASM diff + benchmark (run with node)
main.js                       patched: prewarm routed via world.prewarmTerrain
```

## Build

One-time setup: `winget install Rustlang.Rustup`, then `rustup default stable`.

Then double-click `build_wasm.bat` (or run it from a terminal). It runs the
native test suite first — which cross-checks hashes, the erosion RNG, and two
whole-chunk material histograms against values captured from the JS path
under V8 — then builds with `wasm-pack --target web --release` and copies the
output into `world/wasm/`.

Verify in the browser console: `world.wasmGenStats()` → `{ ready: true, ... }`
with `tilesOwned` growing as you fly. Kill switch: `?wasmgen=0`, or
`localStorage.setItem("voxelengine.terrain.wasm", "0")`, or
`window.__swekWasmGen = false` before world construction.

Parity + speedup numbers: `node tools/terrain-parity.mjs` (add `--worley`
for the v2780 biome path, `--radius 8` for a bigger sample).

## How the integration works (and why)

**Fidelity.** Every constant, hash, LCG call order, and branch mirrors the
JS source, so a given `(seed, worleyFlag, cx, cz)` produces the same terrain.
The only unavoidable slack: V8's `Math.sin/cos` and Rust's libm can differ in
the last ulp.

**Tile ownership.** That last-ulp slack matters in exactly one place:
hydraulic erosion is chaotic, so within a 128×128 erosion tile a 1-ulp base
height difference can grow to ±1–2 voxels on some columns. Mixing JS-generated
and wasm-generated chunks *inside one tile* could therefore seam. `world.js`
enforces that each tile is generated wholly by one path: `_wasmTiles` records
wasm-owned tiles, `generateChunk` only takes the wasm path when every tile the
chunk touches (including the 1-voxel slope apron) is wasm-owned or untouched
by the JS cache, and `_heightAt` routes queries for wasm tiles into the wasm
module so slopes, spawns, and physics agree with the voxels on the ground.

**Startup.** The wasm module loads asynchronously, and the world constructor
generates its initial grid synchronously — so the initial grid is always JS.
Wasm takes over for tiles the JS cache hasn't touched: streamed chunks
(`ChunkStreamer`), `growGrid` rings, and prewarmed tiles. The prewarmer
(`world.prewarmTerrain`, called from main.js each frame) warms one nearest
unowned tile per call when wasm is active, so ownership migrates outward
ahead of the camera.

**Out of scope, on purpose.** Real-terrain heightmap stamps
(`_heightOverride`) keep the JS path — the override callback lives in JS and
crossing the boundary per column would defeat the batching. If a wasm call
ever throws, the wrapper demotes to the JS path for the rest of the session
rather than retrying in the render loop.

## The TinyVec question — an honest answer

The port turned out not to need it. Chunk generation's scratch is all
fixed-size and known at compile time (the (S+2)² height apron, the 160×160
erosion tile), so plain arrays/Vecs with one allocation per call are already
optimal. `TinyVec`/`SmallVec` earn their keep when you have *small,
variable-length* per-item lists — which will show up the moment gen grows
per-column feature lists (ore veins, decor placements, structure anchors
collected during the column pass). That's the point to add
`tinyvec::ArrayVec<[Feature; N]>` as the per-column scratch; wiring it in now
would be dependency ballast.

## Round 2 (v2798): worker offload, SIMD, cave LUT

**Worker offload.** `world/terrainGenWorker.js` runs a second `TerrainGen`
in a module Web Worker; `world/terrainWorkerClient.js` manages it. Each
frame, `world.prewarmTerrain` (a) warms one erosion tile in the main-thread
instance so `_heightAt` stays stall-free, and (b) feeds the worker the
nearest missing chunks around the camera (radiate-outward, mirroring
ChunkStreamer's order, capped at 4 in flight / 256 baked ≈ 4MB). When
`generateChunk` needs a chunk, the order is: worker-baked cache hit (free —
the buffer was transferred, not copied), then synchronous main-thread wasm,
then JS. Worker and main thread run the *same wasm binary*, so their output
is bit-identical and shares one ownership rule. The worker only spawns
after main-thread wasm init succeeds; any spawn/runtime failure demotes it
permanently and the sync path continues. Kill switch: `?wasmworker=0`,
`localStorage voxelengine.terrain.worker = "0"`, or
`window.__swekWasmWorker = false`. Health: `world.wasmGenStats().worker`.

ChunkStreamer needed zero changes: its `_loadOne` calls
`world.generateChunk`, which now hits the baked cache.

**SIMD.** `build_wasm.bat` now builds with `-C target-feature=+simd128` by
default (Chrome 91+; the launcher opens Chrome). LLVM autovectorizes the
erosion fill and column-fill loops. `build_wasm.bat nosimd` disables it;
native `cargo test` always runs without the wasm-only flag. Honest
expectation: the biggest per-voxel cost was libm sin/cos, which SIMD alone
does not vectorize — which is why the round also includes:

**Cave LUT.** `cave_density_at`'s y-axis terms only ever see integer
heights, so `cos(y*0.05)` / `sin(y*0.07)` are tabulated once in the
constructor. The per-voxel evaluation keeps the exact fp op order of the
direct formula, so output is **bit-identical** — enforced by the
`cave_lut_is_bit_identical` test (`.to_bits()` equality across a coordinate
sweep). Cave carving drops from 2 trig calls per voxel to 2 mults + 1 add.

## Round 3 (v2799): mesh worker pool + erosion fill LUTs

**Mesh worker pool** (`render/voxelrenderer.js`). Meshing was already
off-thread, but capped at ONE worker with ONE in-flight job — with gen now
nearly free, that single mesher became the pipeline bottleneck (the
renderer's own comment called the pool a follow-up). The renderer now
spawns `min(4, hardwareConcurrency - 2)` mesh workers (override:
`window.__swekMeshWorkers = N` before construction), dispatches to every
idle worker, and scales the queue cap with pool size. `_onWorkerMesh` /
`_drainMeshQueue` / the dirty-scan loop are pool-aware; the sync fallback
and the VR1–VR4 buffer-reuse/leak fixes are untouched. `this.meshWorker`
survives as an alias to pool worker 0 for any external references. With
the pool up, `chunkStreamer.setFrameChunkBudget(4)` and
`chunkRebuildDispatcher.maxPerFrame` become safe knobs to raise.

**Erosion fill LUTs** (`src/lib.rs`, bit-identical). The tile fill
evaluates trig only at integer world coordinates, and integer f64 sums
below 2^53 are exact — so `(ox+x)+(oz+z) == (ox+oz)+(x+z)` bitwise, and
every term depending on only wx, only wz, or only (wx+wz) tabulates into
1D tables (160/319 entries) instead of running per-cell (25,600 cells):
the domain-warp factors, the legacy biome scalar, and the final fBm
octave. Warped-coordinate trig has non-integer arguments and stays direct.
Enforced by `fill_tables_are_bit_identical` (`.to_bits()` equality across
whole tiles, both biome paths, negative coords) with `base_height_at`
retained as the reference implementation. Legacy-path fill drops ~5 of
~12 trig calls per cell; the worley path's cost is dominated by
`biome_height_params` instead (see next steps).

## Round 4 (v2800): worley memoization + bounded tile memory

**Worley memoization** (`src/lib.rs`, bit-identical). A worley sample
hashes 9 candidate cells and classifies 2 of them (two 4-hash value
noises each) — ~34 hash evaluations — but a 160-unit erosion tile spans
only a handful of distinct 96-unit worley cells. `WorleyCache` memoizes
the per-cell jittered feature point and the per-cell biome, collapsing
those evaluations into 9 map lookups per sample. Cached values are the
exact f64s/enums the direct calls produce, so all downstream math is
bit-identical — `worley_cache_is_exact` sweeps 6,400 coords TWICE (second
pass all cache hits) asserting `.to_bits()` equality against the retained
uncached references. Threaded through both the erosion fill
(`biome_height_params_cached`) and chunk column materials
(`biome_column_materials_cached`). This mostly de-fangs the worley path's
noise cost; cache growth is ~one small entry per 96×96-unit cell visited.

**Bounded tile memory.** Erosion tile caches (~65KB/tile, previously
unbounded in BOTH wasm instances, mirroring the JS cache's unbounded
growth) now trim: `TerrainGen::trim_tiles(cx, cz, keepRadius)` retains a
Chebyshev window, `world.prewarmTerrain` calls it every ~300 frames with
radius 5 around the camera tile for the main instance and (fire-and-
forget) the worker. Safe by construction — trimmed tiles regenerate
identically on demand, and `_wasmTiles` ownership is retained so a
re-entered region still routes to wasm. `trim_tiles_drops_far_keeps_near`
covers drop/keep/regen-identity.

**Deliberately NOT shipped: pre-meshing in the gen worker.** Under
radiate-outward streaming a chunk is meshed the frame it installs —
before its neighbors exist — so a premesh built against self-generated
neighbors is either rejected almost always (safe gate: all 8 neighbors
present + pristine) or shows transient holes at the streaming frontier
(no gate). With the mesh pool in place the payoff doesn't cover the
visual risk. Revisit only if profiling shows initial-mesh latency
mattering again.

## Round 5 (v2801): JS-side tile trim mirror

`ErosionCache.trimTiles(cx, cz, keepRadius)` mirrors the wasm trim for
the JS cache; `world.prewarmTerrain`'s JS branch calls it on the same
~300-call cadence, radius 5 around the camera tile. The trap this had to
avoid: the ownership rule detected JS tiles BY their presence in the JS
cache, so trimming one would have let wasm claim it while JS-generated
chunks from it were still loaded — intra-tile generator mixing. Trimmed
keys therefore go into a persistent `world._jsTiles` set, consulted by
`_wasmSpannedTiles` and the wasm tile-prewarm picker alongside the cache
itself. Trimmed tiles regenerate bit-identically (per-tile seeded RNG);
loaded chunks are unaffected (they own their voxels).

## Next steps this sets up

- **Hand-SIMD**: explicit `core::arch::wasm32::v128` kernels for the
  erosion bilinear ops if profiling shows tile generation still limiting
  at large view distances. The bilinear 4-corner updates and the thermal
  pass can be vectorized bit-identically (f64x2 mul/add are IEEE-exact
  per lane, op order preservable); a vectorized polynomial sin for the
  fill loop can NOT (it changes output vs libm) and would have to be an
  explicit opt-in fidelity trade.
