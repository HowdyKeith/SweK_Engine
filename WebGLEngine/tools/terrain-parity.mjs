// tools/terrain-parity.mjs
//
// JS-vs-WASM terrain parity check. Run from WebGLEngine/ AFTER building the
// wasm crate (wasm-terrain/build_wasm.bat):
//
//   node tools/terrain-parity.mjs               # default: 5x5 chunk grid, legacy biomes
//   node tools/terrain-parity.mjs --worley      # worley-biome path
//   node tools/terrain-parity.mjs --radius 8    # bigger comparison grid
//
// WHAT "PASS" MEANS
// -----------------
// The Rust port mirrors the JS math op-for-op, but V8's Math.sin/cos and
// Rust's libm may differ in the last ulp. Un-eroded quantities (materials,
// caves, base heights) should match essentially everywhere. Hydraulic
// erosion is chaotic, so a 1-ulp input difference can grow into ±1-2 voxel
// height differences on a small fraction of columns within a tile. That is
// visually invisible but means the two paths are NOT byte-interchangeable —
// which is exactly why world.js enforces one-generator-per-tile ownership.
//
// Thresholds below encode "visually identical": fail loudly if the paths
// diverge more than ulp-chaos can explain (a real port bug).
//
//   PASS: <2% of voxels differ AND max column-height delta <= 3
//
// It also reports per-path timing for the same workload — your speedup number.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const USE_WORLEY = args.includes("--worley");
const RADIUS = (() => {
    const i = args.indexOf("--radius");
    return i >= 0 ? Math.max(1, parseInt(args[i + 1], 10) || 2) : 2;
})();

// ---------------------------------------------------------------------------
// 1. WASM side — load the built pkg directly (bypasses terrainWasm.js because
//    the web-target loader wants to fetch(); in Node we hand init the bytes).
// ---------------------------------------------------------------------------
let wasm;
try {
    wasm = await import(join(here, "..", "world", "wasm", "terrain_wasm.js"));
    const bytes = await readFile(join(here, "..", "world", "wasm", "terrain_wasm_bg.wasm"));
    await wasm.default(bytes);
} catch (err) {
    console.error("Could not load world/wasm/terrain_wasm.* — build it first:");
    console.error("  cd wasm-terrain && build_wasm.bat");
    console.error(String(err && err.message ? err.message : err));
    process.exit(2);
}

// ---------------------------------------------------------------------------
// 2. JS side — the real VoxelWorld, wasm path force-disabled so its chunks
//    come from the original generator. (world.js checks __swekWasmGen.)
// ---------------------------------------------------------------------------
globalThis.window = { __swekWasmGen: false, __swekBiomes: USE_WORLEY };
const { VoxelWorld } = await import(join(here, "..", "world", "world.js"));

const SEED = 1337;               // matches world.biomeSeed default
const S = 16, H = 64;

console.log(`Parity: ${(2 * RADIUS + 1) ** 2} chunks, ` +
    `${USE_WORLEY ? "worley" : "legacy"} biomes, seed ${SEED}\n`);

// JS reference world. Its constructor pre-generates a grid; we time a fresh
// region OUTSIDE that grid so both paths pay cold erosion-tile costs.
const world = new VoxelWorld();
const OFF = 64;                  // chunk offset → world x ~1024, untouched tiles

const t0 = performance.now();
const jsChunks = new Map();
for (let cz = -RADIUS; cz <= RADIUS; cz++) {
    for (let cx = -RADIUS; cx <= RADIUS; cx++) {
        jsChunks.set(`${cx},${cz}`, world.generateChunk(cx + OFF, cz + OFF).voxels);
    }
}
const jsMs = performance.now() - t0;

// WASM world, same region.
const gen = new wasm.TerrainGen(SEED, USE_WORLEY, S, H);
const t1 = performance.now();
const wasmChunks = new Map();
for (let cz = -RADIUS; cz <= RADIUS; cz++) {
    for (let cx = -RADIUS; cx <= RADIUS; cx++) {
        wasmChunks.set(`${cx},${cz}`, gen.generate_chunk(cx + OFF, cz + OFF));
    }
}
const wasmMs = performance.now() - t1;

// ---------------------------------------------------------------------------
// 3. Diff
// ---------------------------------------------------------------------------
const colHeight = (vox, x, z) => {
    for (let y = H - 1; y >= 0; y--) {
        const v = vox[x + S * (z + S * y)];
        if (v !== 0 && v !== 10 && v !== 11) return y + 1;   // ignore air + water
    }
    return 0;
};

let totalVox = 0, diffVox = 0, maxHDelta = 0, diffCols = 0, totalCols = 0;
for (const [k, jv] of jsChunks) {
    const wv = wasmChunks.get(k);
    if (wv.length !== jv.length) {
        console.error(`FAIL: chunk ${k} length mismatch (${wv.length} vs ${jv.length})`);
        process.exit(1);
    }
    totalVox += jv.length;
    for (let i = 0; i < jv.length; i++) if (jv[i] !== wv[i]) diffVox++;
    for (let z = 0; z < S; z++) {
        for (let x = 0; x < S; x++) {
            totalCols++;
            const d = Math.abs(colHeight(jv, x, z) - colHeight(wv, x, z));
            if (d > 0) diffCols++;
            if (d > maxHDelta) maxHDelta = d;
        }
    }
}

const pctVox = (100 * diffVox / totalVox);
const pctCols = (100 * diffCols / totalCols);
console.log(`voxels differing : ${diffVox} / ${totalVox} (${pctVox.toFixed(3)}%)`);
console.log(`columns differing: ${diffCols} / ${totalCols} (${pctCols.toFixed(2)}%), max height delta ${maxHDelta}`);
console.log(`\ntiming (same ${jsChunks.size}-chunk workload, cold tiles):`);
console.log(`  JS   : ${jsMs.toFixed(1)} ms`);
console.log(`  WASM : ${wasmMs.toFixed(1)} ms   (${(jsMs / wasmMs).toFixed(1)}x)`);

const pass = pctVox < 2.0 && maxHDelta <= 3;
console.log(pass
    ? "\nPASS — differences within sin/cos-ulp erosion chaos; port is faithful."
    : "\nFAIL — divergence exceeds ulp-chaos bounds; suspect a port bug (check the newest change to lib.rs vs world.js).");
process.exit(pass ? 0 : 1);
