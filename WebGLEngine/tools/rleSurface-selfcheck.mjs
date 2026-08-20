// tools/rleSurface-selfcheck.mjs
//
// Run: node tools/rleSurface-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves the run boundaries ARE the vertical surface. yFacesFromRLE walks the runs and emits exactly the same
// +Y/-Y faces a full voxel scan finds -- but by touching the runs (~thousands) instead of the voxels (262,144).
// The load-bearing line is the solid-meets-not-solid test at each boundary; SABOTAGE it to also fire between two
// solids and the fast path emits interior faces the brute scan never would, so the set-equality check fails --
// which is the whole danger, meshing hidden interior faces you cannot see.

import { RLE_SX, RLE_SY, RLE_SZ, RLE_N, rleIndex, encodeRLE } from "../voxel/voxelRLE.js";
import { yFacesFromRLE, yFacesBrute, faceKey } from "../voxel/rleSurface.js";
import { warpedTerrainHeight } from "../world/autoExtremity.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const isSolid = (t) => t !== 0;
const sameSet = (a, b) => { if (a.length !== b.length) return false; const S = new Set(a.map(faceKey)); for (const f of b) if (!S.has(faceKey(f))) return false; return true; };

// a terrain-shaped chunk (layered columns) -- realistic runs
function terrainChunk() {
    const v = new Uint8Array(RLE_N);
    for (let x = 0; x < RLE_SX; x++) for (let z = 0; z < RLE_SZ; z++) {
        const h = Math.min(RLE_SY - 1, Math.max(1, Math.floor(warpedTerrainHeight(x, z, { amp: 40, base: 60, seed: 3, warpAmp: 8, freq: 0.05 }))));
        for (let y = 0; y < RLE_SY; y++) {
            let t = 0; if (y < h - 4) t = 1; else if (y < h) t = 2; else if (y === h) t = 3;
            v[rleIndex(x, y, z)] = t;
        }
    }
    return v;
}

const flat = terrainChunk();
const rle = encodeRLE(flat);

// 1. the run-boundary faces are EXACTLY the brute-force faces
const fast = yFacesFromRLE(rle, isSolid);
const brute = yFacesBrute(flat, isSolid);
ok("!! the run-boundary faces are EXACTLY the voxel-scan faces -- same set", sameSet(fast, brute),
   `run walk found ${fast.length} faces, voxel scan found ${brute.length} -- identical set`);

// 2. and it found them by touching runs, not voxels -- the speed win
ok("!! found by touching runs, not voxels -- O(runs) not O(voxels)", rle.types.length < RLE_N / 10,
   `${rle.types.length} runs walked vs ${RLE_N} voxels scanned by the brute path -- ${(RLE_N / rle.types.length).toFixed(0)}x fewer touches`);

// 3. a simple flat-topped column: solid 0..99, air above -> exactly one +Y face (the top), no interior faces
{
    const v = new Uint8Array(RLE_N);
    for (let y = 0; y < 100; y++) v[rleIndex(5, y, 5)] = 1;   // one solid column, height 100
    const f = yFacesFromRLE(encodeRLE(v), isSolid);
    const top = f.filter((q) => q.x === 5 && q.z === 5 && q.dir === 1);
    ok("!! a solid column capped by air yields exactly ONE top face, no interior faces", top.length === 1 && top[0].y === 99,
       `top face at y=${top[0] ? top[0].y : "none"}, ${f.length} total faces (a 100-tall column is one surface, not 100)`);
}

// 4. a solid-to-DIFFERENT-solid boundary (stone under dirt) is NOT a face -- you cannot see it
{
    const v = new Uint8Array(RLE_N);
    for (let y = 0; y < 50; y++) v[rleIndex(7, y, 7)] = 1;         // stone 0..49
    for (let y = 50; y < 80; y++) v[rleIndex(7, y, 7)] = 2;       // dirt 50..79, air above
    const f = yFacesFromRLE(encodeRLE(v), isSolid).filter((q) => q.x === 7 && q.z === 7);
    const atStoneDirt = f.filter((q) => q.y === 49 || q.y === 50);
    ok("!! the stone/dirt boundary is hidden -- only the dirt/air top is a face", atStoneDirt.length === 0 && f.length === 1 && f[0].y === 79,
       `interior stone/dirt faces: ${atStoneDirt.length} (must be 0); the one face is the top at y=${f[0] ? f[0].y : "none"}`);
}

// 5. an all-air column has no faces
{
    const v = new Uint8Array(RLE_N);   // all zero
    ok("...and empty space has no surface at all", yFacesFromRLE(encodeRLE(v), isSolid).length === 0,
       "all air -> no faces");
}

console.log(fails ? "\nrleSurface-selfcheck: " + fails + " FAILED" : "\nrleSurface-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
