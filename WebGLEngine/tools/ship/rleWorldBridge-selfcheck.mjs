// WebGLEngine/tools/ship/rleWorldBridge-selfcheck.mjs -- v2773
//
// Run: node tools/ship/rleWorldBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/rleWorldBridge.js -- feeding a live VoxelWorld chunk (X-FASTEST, size 16) through the RLE
// surface->mesh stack (Y-FASTEST, dims now parameterised).
//
// WHY FACE-SET EQUALITY, NOT AREA: total surface area is INVARIANT under an axis permutation, so for a cube an
// axis-swapped (wrong index-order) chunk has the SAME area as the right one -- an area check passes on scrambled
// data. The honest observable is the SET of exposed voxel-faces WITH COORDINATES, computed directly off the
// X-fastest buffer as an independent reference. That pins transcode + dims + face positions together, and the
// sabotage (skip the transcode) then genuinely diverges.

import { meshWorldChunk, worldChunkToRLE, chunkToRLE, chunkIndexReal } from "../../voxel/rleWorldBridge.js";
import { encodeRLE, decodeRLE, rleIndex } from "../../voxel/voxelRLE.js";
import { yFacesFromRLE } from "../../voxel/rleSurface.js";
import { sideFacesFromRLE, expandSpans } from "../../voxel/rleSideFaces.js";
import { rleMesh } from "../../voxel/rleMesh.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const isSolid = (t) => t !== 0;
const wIdx = (x, y, z, S) => x + y * S + z * S * S;

function refFaceSet(world, SX, SY, SZ) {
    const at = (x, y, z) => (x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ) && isSolid(world[x + y * SX + z * SX * SY]);
    const set = new Set();
    const dirs = [["+x", 1, 0, 0], ["-x", -1, 0, 0], ["+y", 0, 1, 0], ["-y", 0, -1, 0], ["+z", 0, 0, 1], ["-z", 0, 0, -1]];
    for (let x = 0; x < SX; x++) for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) {
        if (!at(x, y, z)) continue;
        for (const [lbl, dx, dy, dz] of dirs) {
            const nx = x + dx, ny = y + dy, nz = z + dz;
            const inB = nx >= 0 && ny >= 0 && nz >= 0 && nx < SX && ny < SY && nz < SZ;
            if (inB && !at(nx, ny, nz)) set.add(lbl + ":" + x + "," + y + "," + z);
        }
    }
    return set;
}

function rleFaceSet(rle) {
    const set = new Set();
    for (const f of yFacesFromRLE(rle, isSolid)) set.add((f.dir > 0 ? "+y" : "-y") + ":" + f.x + "," + f.y + "," + f.z);
    for (const f of expandSpans(sideFacesFromRLE(rle, isSolid))) set.add(f.dir + ":" + f.x + "," + f.y + "," + f.z);
    return set;
}
const setsEqual = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

function meshTriangleArea(m) {
    const p = m.positions, ix = m.indices;
    let area = 0;
    for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        area += 0.5 * Math.hypot(cx, cy, cz);
    }
    return area;
}
function windingAllOutward(m) {
    const p = m.positions, n = m.normals, ix = m.indices;
    for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const na = ix[i] * 3;
        if (!(cx * n[na] + cy * n[na + 1] + cz * n[na + 2] > 0)) return false;
    }
    return true;
}

function voxelWorldTerrain(S) {
    const v = new Uint8Array(S * S * S);
    for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) {
        const h = Math.floor((Math.sin(x * 0.3) + Math.cos(z * 0.3)) * 2 + 6);
        if (y < h) v[wIdx(x, y, z, S)] = 1;
    }
    return v;
}

// 1. real VoxelWorld chunk -> right FACES (position-sensitive)
{
    const S = 16, world = voxelWorldTerrain(S);
    const ref = refFaceSet(world, S, S, S);
    const rle = worldChunkToRLE(world, S);
    const got = rleFaceSet(rle);
    ok("VoxelWorld 16^3: RLE face SET equals X-fastest reference (positions, not just count)", setsEqual(got, ref), "got=" + got.size + " ref=" + ref.size);
    ok("VoxelWorld 16^3: reference is non-trivial", ref.size > 100, "ref=" + ref.size);
    const m = meshWorldChunk(world, S, isSolid);
    ok("VoxelWorld 16^3: mesh area == face count", Math.abs(meshTriangleArea(m) - ref.size) < 1e-9, "mesh=" + meshTriangleArea(m) + " faces=" + ref.size);
    ok("VoxelWorld 16^3: all triangles wound outward", windingAllOutward(m));
}

// 2. dims reconciled + lossless transcode
{
    const S = 16, world = voxelWorldTerrain(S);
    const rle = worldChunkToRLE(world, S);
    ok("dims: rle carries sx=sy=sz=16", rle.sx === 16 && rle.sy === 16 && rle.sz === 16);
    const flatY = decodeRLE(rle);
    const back = new Uint8Array(S * S * S), dims = { sx: S, sy: S, sz: S };
    for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) for (let z = 0; z < S; z++) back[wIdx(x, y, z, S)] = flatY[rleIndex(x, y, z, dims)];
    let same = back.length === world.length; for (let i = 0; same && i < world.length; i++) if (back[i] !== world[i]) same = false;
    ok("dims: transcode is lossless (world -> RLE -> world round-trips)", same);
}

// 3. index-order transcode is load-bearing (area could not catch this)
{
    const S = 16, world = voxelWorldTerrain(S);
    const ref = refFaceSet(world, S, S, S);
    const wrong = encodeRLE(world, { sx: S, sy: S, sz: S });
    const got = rleFaceSet(wrong);
    ok("SABOTAGE: skipping the transcode gives a DIFFERENT face set (positions wrong)", !setsEqual(got, ref), "wrongSet=" + got.size + " ref=" + ref.size);
    ok("SABOTAGE: area alone would have MISSED it (same face count)", got.size === ref.size, "counts both " + ref.size);
}

// 4. no regression: default 32x256x32 pillar -> 402
{
    const flat = new Uint8Array(32 * 256 * 32);
    for (let y = 1; y <= 100; y++) flat[rleIndex(5, y, 5)] = 1;
    const m = rleMesh(encodeRLE(flat), isSolid);
    ok("regression: default 32x256x32 pillar still meshes to area 402", Math.abs(meshTriangleArea(m) - 402) < 1e-9, "area=" + meshTriangleArea(m));
}

// 5. non-cube dims 16x32x8: face-set equality
{
    const SX = 16, SY = 32, SZ = 8;
    const world = new Uint8Array(SX * SY * SZ);
    const wi = (x, y, z) => x + y * SX + z * SX * SY;
    for (let x = 4; x < 9; x++) for (let y = 3; y < 20; y++) for (let z = 2; z < 6; z++) world[wi(x, y, z)] = 1;
    const ref = refFaceSet(world, SX, SY, SZ);
    const dims = { sx: SX, sy: SY, sz: SZ };
    const flat = new Uint8Array(SX * SY * SZ);
    for (let x = 0; x < SX; x++) for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) flat[rleIndex(x, y, z, dims)] = world[wi(x, y, z)];
    const rle = encodeRLE(flat, dims);
    ok("non-cube 16x32x8: RLE face set equals reference", setsEqual(rleFaceSet(rle), ref), "got=" + rleFaceSet(rle).size + " ref=" + ref.size);
    ok("non-cube 16x32x8: wound outward", windingAllOutward(rleMesh(rle, isSolid)));
}

// 6. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../voxel/rleWorldBridge.js", import.meta.url), "utf8");
    ok("source: rleWorldBridge imports no Node builtin at module scope", !/^\s*import[^\n]*["'](node:|fs|path|url|crypto|net|dgram|zlib)/m.test(src));
}

// 7. REAL ENGINE CHUNK ORDER (world/chunk.js): idx = x + sx*z + sx*sz*y, dims 16x64x16.
// Prove the real order transcodes to the correct faces -- this is the order main.js's world actually uses,
// distinct from voxelworld.js. Reference is computed directly in the real order.
{
    const SX = 16, SY = 64, SZ = 16;
    const ridx = (x, y, z) => x + SX * z + SX * SZ * y;   // world/chunk.js order
    const chunk = new Uint8Array(SX * SY * SZ);
    // asymmetric fill so an axis swap could not accidentally match
    for (let x = 2; x < 7; x++) for (let z = 9; z < 13; z++) for (let y = 1; y < 30; y++) chunk[ridx(x, y, z)] = 1;
    const at = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ && chunk[ridx(x, y, z)] !== 0;
    const ref = new Set();
    const dirs = [["+x", 1, 0, 0], ["-x", -1, 0, 0], ["+y", 0, 1, 0], ["-y", 0, -1, 0], ["+z", 0, 0, 1], ["-z", 0, 0, -1]];
    for (let x = 0; x < SX; x++) for (let y = 0; y < SY; y++) for (let z = 0; z < SZ; z++) {
        if (!at(x, y, z)) continue;
        for (const [lbl, dx, dy, dz] of dirs) { const nx = x + dx, ny = y + dy, nz = z + dz; if (nx >= 0 && ny >= 0 && nz >= 0 && nx < SX && ny < SY && nz < SZ && !at(nx, ny, nz)) ref.add(lbl + ":" + x + "," + y + "," + z); }
    }
    const rle = chunkToRLE(chunk, { sx: SX, sy: SY, sz: SZ }, chunkIndexReal);
    const got = rleFaceSet(rle);
    ok("REAL chunk order (16x64x16, x+sx*z+sx*sz*y): RLE face set equals reference", setsEqual(got, ref), "got=" + got.size + " ref=" + ref.size);
    ok("REAL chunk order: reference non-trivial", ref.size > 100, "ref=" + ref.size);
}

console.log("rleWorldBridge-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
