// WebGLEngine/tools/ship/rleChunkMesh-selfcheck.mjs -- v2776
//
// Run: node tools/ship/rleChunkMesh-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/rleChunkMesh.js -- the seamless RLE chunk mesher that the worker swaps in behind useRLE. The
// point of this gate is to CERTIFY the RLE path before the flag is flipped: its emitted faces must equal the
// exposed-face set computed directly off voxels+neighbours (the same cross-chunk readVoxel logic the greedy
// mesher trusts), INCLUDING boundary faces at the chunk edges. That is "auto-gate RLE to be active" -- the flag
// is only safe because this equivalence holds. SABOTAGE: an internal-only mesh (no neighbour ring) MISSES the
// boundary faces -> proving the padded-ring boundary handling is load-bearing (this is exactly the seam a naive
// tiled swap would leave).

import { meshChunkRLE } from "../../voxel/rleChunkMesh.js";
import { encodeRLE, rleIndex } from "../../voxel/voxelRLE.js";
import { rleMesh } from "../../voxel/rleMesh.js";
import { rleMeshToRenderMesh } from "../../voxel/rleRenderMesh.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const isSolid = (t) => t !== 0;

const S = 16, H = 64;
const ridx = (x, y, z) => x + S * (z + S * y);   // real chunk order (world/chunk.js)

// portable readVoxel mirror (same as the module under test / chunkMesherCore)
function readVoxel(local, neighbors, lx, ly, lz) {
    if (ly < 0 || ly >= H) return 0;
    let dx = 0, dz = 0;
    if (lx < 0) { dx = -1; lx += S; } else if (lx >= S) { dx = 1; lx -= S; }
    if (lz < 0) { dz = -1; lz += S; } else if (lz >= S) { dz = 1; lz -= S; }
    const buf = (dx === 0 && dz === 0) ? local : (neighbors ? neighbors[dx + "," + dz] : null);
    if (!buf) return 0;
    return buf[lx + S * (lz + S * ly)];
}

// independent reference: exposed faces (WORLD-LOCAL coords + dir) of this chunk's solid voxels, crossing into
// neighbours. A face exists where the solid voxel's neighbour (in-chunk OR cross-chunk) is air.
function refFaceSet(voxels, neighbors) {
    const set = new Set();
    const dirs = [["+x", 1, 0, 0], ["-x", -1, 0, 0], ["+y", 0, 1, 0], ["-y", 0, -1, 0], ["+z", 0, 0, 1], ["-z", 0, 0, -1]];
    for (let x = 0; x < S; x++) for (let y = 0; y < H; y++) for (let z = 0; z < S; z++) {
        if (!isSolid(voxels[ridx(x, y, z)])) continue;
        for (const [lbl, dx, dy, dz] of dirs) {
            const nv = readVoxel(voxels, neighbors, x + dx, y + dy, z + dz);
            if (!isSolid(nv)) set.add(lbl + ":" + x + "," + y + "," + z);
        }
    }
    return set;
}

// recover the face set from a {verts,cols,aos} render mesh, EXPANDING each greedy quad into its unit voxel
// faces (a side span is one quad but many voxel faces) so it compares against the per-voxel reference.
function meshFaceSet(m, cx, cz) {
    const v = m.verts, set = new Set();
    for (let i = 0; i < v.length; i += 18) {   // 6 verts * 3 floats per quad
        // normal from the first triangle
        const ax = v[i], ay = v[i + 1], az = v[i + 2];
        const bx = v[i + 3], by = v[i + 4], bz = v[i + 5];
        const cx2 = v[i + 6], cy2 = v[i + 7], cz2 = v[i + 8];
        let nx = (by - ay) * (cz2 - az) - (bz - az) * (cy2 - ay);
        let ny = (bz - az) * (cx2 - ax) - (bx - ax) * (cz2 - az);
        let nz = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
        const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
        const n = [nx, ny, nz];
        const nAxis = Math.abs(nx) > 0.5 ? 0 : Math.abs(ny) > 0.5 ? 1 : 2;
        const lbl = nx > 0.5 ? "+x" : nx < -0.5 ? "-x" : ny > 0.5 ? "+y" : ny < -0.5 ? "-y" : nz > 0.5 ? "+z" : "-z";
        // bounding box of the 6 verts
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let k = 0; k < 6; k++) for (let c = 0; c < 3; c++) { const val = v[i + k * 3 + c]; if (val < lo[c]) lo[c] = val; if (val > hi[c]) hi[c] = val; }
        const tA = (nAxis + 1) % 3, tB = (nAxis + 2) % 3;   // the two tangent axes
        for (let a = Math.round(lo[tA]); a < Math.round(hi[tA]); a++) {
            for (let b = Math.round(lo[tB]); b < Math.round(hi[tB]); b++) {
                const p = [0, 0, 0];
                p[nAxis] = lo[nAxis]; p[tA] = a + 0.5; p[tB] = b + 0.5;
                const sv = [Math.floor(p[0] - 0.5 * n[0]), Math.floor(p[1] - 0.5 * n[1]), Math.floor(p[2] - 0.5 * n[2])];
                set.add(lbl + ":" + (sv[0] - cx * S) + "," + sv[1] + "," + (sv[2] - cz * S));
            }
        }
    }
    return set;
}
const setsEqual = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

// a solid neighbour chunk on the +X and -Z sides, air elsewhere -> exercises BOTH "boundary is solid (cull)"
// and "boundary is air (draw wall)".
function scene() {
    const voxels = new Uint8Array(S * H * S);
    for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
        const h = Math.max(1, Math.floor(6 + 4 * Math.sin(x * 0.6) * Math.cos(z * 0.5)));
        for (let y = 0; y < h; y++) voxels[ridx(x, y, z)] = (y > h - 2) ? 3 : 1;
    }
    // +X neighbour: a solid wall against our east edge (should CULL our +x boundary faces where it is solid)
    const east = new Uint8Array(S * H * S);
    for (let z = 0; z < S; z++) for (let y = 0; y < 6; y++) east[0 + S * (z + S * y)] = 1;   // its west column solid
    const neighbors = { "1,0": east };   // only east present; all other neighbours null (air) -> draw those walls
    return { voxels, neighbors };
}

// 1. EQUIVALENCE: RLE chunk mesh faces == independent cross-chunk reference (internal + boundary)
{
    const { voxels, neighbors } = scene();
    const m = meshChunkRLE({ voxels, neighbors, size: S, height: H, cx: 3, cz: -2, palette: { 1: [.6, .6, .7], 3: [.3, .8, .3] } });
    const got = meshFaceSet(m, 3, -2);
    const ref = refFaceSet(voxels, neighbors);
    ok("RLE chunk mesh face set == cross-chunk reference (internal + boundary)", setsEqual(got, ref), "got=" + got.size + " ref=" + ref.size);
    ok("reference is non-trivial", ref.size > 200, "ref=" + ref.size);
    ok("slope arrays are empty (RLE draws faces, not slopes)", m.slopeVerts.length === 0 && m.slopeNormals.length === 0 && m.slopeCols.length === 0);
    ok("verts are whole quads (multiple of 18)", m.verts.length % 18 === 0);
}

// 2. BOUNDARY faces actually present: our west edge (x=0) faces air (no west neighbour) -> -x walls must exist
{
    const { voxels, neighbors } = scene();
    const ref = refFaceSet(voxels, neighbors);
    let westWalls = 0; for (const k of ref) if (k.startsWith("-x:0,")) westWalls++;
    const m = meshChunkRLE({ voxels, neighbors, size: S, height: H, cx: 0, cz: 0, palette: {} });
    const got = meshFaceSet(m, 0, 0);
    let gotWest = 0; for (const k of got) if (k.startsWith("-x:0,")) gotWest++;
    ok("boundary: -x walls at the open west edge are drawn", gotWest > 0 && gotWest === westWalls, "got=" + gotWest + " ref=" + westWalls);
}

// 3. BOUNDARY culling: east edge (x=S-1) meets a solid neighbour column -> those +x faces must NOT be drawn
{
    const { voxels, neighbors } = scene();
    const ref = refFaceSet(voxels, neighbors);
    // where the east neighbour's west column is solid (y<6) and our east voxel is solid, ref has NO +x face
    let refEastLow = 0; for (const k of ref) if (k.startsWith("+x:" + (S - 1) + ",")) refEastLow++;
    const m = meshChunkRLE({ voxels, neighbors, size: S, height: H, cx: 0, cz: 0, palette: {} });
    let gotEast = 0; for (const k of meshFaceSet(m, 0, 0)) if (k.startsWith("+x:" + (S - 1) + ",")) gotEast++;
    ok("boundary: +x faces against a solid neighbour are culled (match reference exactly)", gotEast === refEastLow, "got=" + gotEast + " ref=" + refEastLow);
}

// 4. SABOTAGE: internal-only mesh (no neighbour ring) MISSES the boundary walls -> the seam a naive swap leaves
{
    const { voxels, neighbors } = scene();
    const ref = refFaceSet(voxels, neighbors);
    // internal-only: RLE the bare chunk with NO padding ring
    const dims = { sx: S, sy: H, sz: S };
    const flatY = new Uint8Array(S * H * S);
    for (let x = 0; x < S; x++) for (let y = 0; y < H; y++) for (let z = 0; z < S; z++) flatY[rleIndex(x, y, z, dims)] = voxels[ridx(x, y, z)];
    const internalOnly = rleMeshToRenderMesh(rleMesh(encodeRLE(flatY, dims), isSolid), encodeRLE(flatY, dims), { palette: {}, computeAO: false });
    const got = meshFaceSet(internalOnly, 0, 0);
    ok("SABOTAGE: internal-only mesh is missing boundary faces (padded ring is load-bearing)", got.size < ref.size, "internalOnly=" + got.size + " full=" + ref.size);
}

// 5. browser/worker-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../voxel/rleChunkMesh.js", import.meta.url), "utf8");
    ok("source: rleChunkMesh imports no Node builtin at module scope", !/^\s*import[^\n]*["'](node:|fs|path|url|crypto|net|dgram|zlib)/m.test(src));
}

console.log("rleChunkMesh-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
