// tools/voxelRLE-selfcheck.mjs
//
// Run: node tools/voxelRLE-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves run-length-encoded 32x256x32 chunks are runtime-usable: the round-trip is lossless, a point query with
// the prefix index returns the exact same voxel as the flat array, and terrain-shaped data compresses tens of
// times while incompressible noise is honestly reported as a LOSS. The load-bearing line is the count in
// decodeRLE (out.fill(t, i, i+c)); SABOTAGE the count and the round-trip stops being lossless -- an RLE codec
// that miscounts a run is a world that quietly changes underfoot.

import { RLE_SX, RLE_SY, RLE_SZ, RLE_N, rleIndex, encodeRLE, decodeRLE, getRLE, buildIndex, getRLEIndexed, runStats } from "../voxel/voxelRLE.js";
import { warpedTerrainHeight } from "../world/autoExtremity.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const equal = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

// a terrain-shaped chunk: layered columns (stone / dirt / grass / air), which is what real chunks look like
function terrainChunk() {
    const v = new Uint8Array(RLE_N);
    for (let x = 0; x < RLE_SX; x++) for (let z = 0; z < RLE_SZ; z++) {
        const h = Math.min(RLE_SY - 1, Math.max(1, Math.floor(warpedTerrainHeight(x, z, { amp: 40, base: 60, seed: 3, warpAmp: 8, freq: 0.05 }))));
        for (let y = 0; y < RLE_SY; y++) {
            let t = 0;                       // air
            if (y < h - 4) t = 1;            // stone
            else if (y < h) t = 2;           // dirt
            else if (y === h) t = 3;         // surface
            v[rleIndex(x, y, z)] = t;
        }
    }
    return v;
}

// 1. the chunk dimensions are exactly 32 x 256 x 32
ok("!! a chunk is 32 x 256 x 32 = 262,144 voxels", RLE_SX === 32 && RLE_SY === 256 && RLE_SZ === 32 && RLE_N === 262144,
   `${RLE_SX} x ${RLE_SY} x ${RLE_SZ} = ${RLE_N}`);

// 2. round-trip is LOSSLESS on terrain-shaped data
const terrain = terrainChunk();
const enc = encodeRLE(terrain);
const dec = decodeRLE(enc);
ok("!! decode(encode(terrain)) is bit-for-bit the original -- lossless", equal(terrain, dec),
   `${enc.types.length} runs reconstruct all ${RLE_N} voxels exactly`);

// 3. round-trip is lossless on RANDOM data too (the hard case for a codec, though not for compression)
const rnd = new Uint8Array(RLE_N);
let seed = 12345; const nx = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
for (let i = 0; i < RLE_N; i++) rnd[i] = Math.floor(nx() * 4);
ok("...and lossless on random data as well", equal(rnd, decodeRLE(encodeRLE(rnd))),
   "the round-trip does not depend on the data being compressible");

// 4. a point query returns the EXACT flat voxel, without decoding -- both the walk and the indexed path
const prefix = buildIndex(enc);
let queryOK = true, mism = null;
for (let s = 0; s < 4000; s++) {
    const x = s * 7 % RLE_SX, z = s * 13 % RLE_SZ, y = s * 29 % RLE_SY;
    const flat = terrain[rleIndex(x, y, z)];
    if (getRLE(enc, x, y, z) !== flat || getRLEIndexed(enc, prefix, x, y, z) !== flat) { queryOK = false; mism = `(${x},${y},${z})`; break; }
}
ok("!! a point query on the RLE returns the exact voxel -- no decode needed", queryOK,
   mism ? `mismatch at ${mism}` : "4000 random coords: walk AND O(log runs) index both match the flat array");

// 5. terrain compresses tens of times -- this is the whole point
const st = runStats(enc);
ok("!! terrain compresses by tens of times -- 256 KB down to a few KB", st.byteRatio > 10,
   `${st.runs} runs, ${st.voxelsPerRun.toFixed(0)} voxels/run, ${st.flatBytes} bytes -> ${st.rleBytes} bytes (${st.byteRatio.toFixed(1)}x)`);

// 6. HONEST: incompressible noise is a LOSS, and the codec says so rather than hiding it
const rndStats = runStats(encodeRLE(rnd));
ok("...and incompressible noise is honestly a LOSS, not a hidden blow-up", rndStats.byteRatio < 1,
   `random data: ${rndStats.voxelsPerRun.toFixed(2)} voxels/run -> ${rndStats.byteRatio.toFixed(2)}x (use flat for the chunk you are carving)`);

console.log(fails ? "\nvoxelRLE-selfcheck: " + fails + " FAILED" : "\nvoxelRLE-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
