// tools/rleSideFaces-selfcheck.mjs
//
// Run: node tools/rleSideFaces-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Proves the +-X/+-Z side faces from a column run-merge are EXACTLY the voxel-scan side faces once the greedy
// spans are expanded -- and that the spans are genuinely greedy (far fewer than the per-voxel faces), found at
// run cost. The load-bearing line is the solid-vs-not-solid comparison in mergeColumns; SABOTAGE the direction
// (emit where BOTH are solid) and the expanded set no longer matches the scan.

import { RLE_SX, RLE_SY, RLE_SZ, RLE_N, rleIndex, encodeRLE } from "../voxel/voxelRLE.js";
import { sideFacesFromRLE, sideFacesBrute, expandSpans, sideKey } from "../voxel/rleSideFaces.js";
import { warpedTerrainHeight } from "../world/autoExtremity.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const isSolid = (t) => t !== 0;
const sameSet = (a, b) => { if (a.length !== b.length) return false; const S = new Set(a.map(sideKey)); for (const f of b) if (!S.has(sideKey(f))) return false; return true; };

function terrainChunk() {
    const v = new Uint8Array(RLE_N);
    for (let x = 0; x < RLE_SX; x++) for (let z = 0; z < RLE_SZ; z++) {
        const h = Math.min(RLE_SY - 1, Math.max(1, Math.floor(warpedTerrainHeight(x, z, { amp: 40, base: 60, seed: 3, warpAmp: 8, freq: 0.05 }))));
        for (let y = 0; y < RLE_SY; y++) { let t = 0; if (y < h - 4) t = 1; else if (y < h) t = 2; else if (y === h) t = 3; v[rleIndex(x, y, z)] = t; }
    }
    return v;
}

const flat = terrainChunk();
const rle = encodeRLE(flat);
const spans = sideFacesFromRLE(rle, isSolid);
const expanded = expandSpans(spans);
const brute = sideFacesBrute(flat, isSolid);

// 1. expanded run-merge faces are EXACTLY the voxel-scan side faces
ok("!! the column-merge side faces are EXACTLY the voxel-scan side faces -- same set", sameSet(expanded, brute),
   `merge expanded to ${expanded.length} faces, scan found ${brute.length} -- identical set`);

// 2. the spans are genuinely GREEDY on a TALL WALL (smooth terrain only steps ~1 voxel per column, so its side
//    spans are legitimately short -- the greedy win is for cliffs and walls, which the pillar/cliff show)
{
    const v = new Uint8Array(RLE_N);
    for (let x = 0; x < 16; x++) for (let z = 0; z < RLE_SZ; z++) for (let y = 0; y < 100; y++) v[rleIndex(x, y, z)] = 1;  // a 100-tall cliff wall
    const cliffRle = encodeRLE(v);
    const cliffSpans = sideFacesFromRLE(cliffRle, isSolid);
    const cliffFaces = expandSpans(cliffSpans).length;
    ok("!! the spans are greedy on a tall wall -- one quad per exposed cliff face, not one per voxel", cliffSpans.length < cliffFaces / 10,
       `${cliffSpans.length} greedy spans cover ${cliffFaces} voxel faces -- ${(cliffFaces / cliffSpans.length).toFixed(0)} faces per span (a 100-tall cliff is one quad per column, not 100)`);
}

// 3. found at run cost, not voxel cost
ok("!! found at run cost, not voxel cost", rle.types.length < RLE_N / 10,
   `${rle.types.length} runs merged vs ${RLE_N} voxels the scan touched`);

// 4. a single solid pillar exposed on all four sides -> one span per side, full height
{
    const v = new Uint8Array(RLE_N);
    for (let y = 0; y < 120; y++) v[rleIndex(10, y, 10)] = 1;   // a lone 120-tall pillar
    const sp = sideFacesFromRLE(encodeRLE(v), isSolid).filter((s) => s.x === 10 && s.z === 10);
    const dirs = new Set(sp.map((s) => s.dir));
    ok("!! a lone pillar gives one full-height span per side, all four sides", sp.length === 4 && dirs.size === 4 && sp.every((s) => s.y0 === 0 && s.y1 === 120),
       `${sp.length} spans, dirs ${[...dirs].sort().join("")}, each y 0..${sp[0] ? sp[0].y1 : "?"} -- four quads for a 120-tall pillar, not 480 faces`);
}

// 5. two solids side by side share no side face between them (the touching wall is hidden)
{
    const v = new Uint8Array(RLE_N);
    for (let y = 0; y < 50; y++) { v[rleIndex(4, y, 4)] = 1; v[rleIndex(5, y, 4)] = 1; }   // 2x1 solid block
    const sp = sideFacesFromRLE(encodeRLE(v), isSolid);
    const between = sp.filter((s) => (s.x === 4 && s.dir === "+x") || (s.x === 5 && s.dir === "-x"));
    ok("!! the wall between two touching solids is hidden -- no face there", between.length === 0,
       `${between.length} faces between the two touching columns (must be 0) -- ${sp.length} spans total around the block`);
}

console.log(fails ? "\nrleSideFaces-selfcheck: " + fails + " FAILED" : "\nrleSideFaces-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
