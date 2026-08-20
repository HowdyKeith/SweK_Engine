// WebGLEngine/tools/ship/rleRenderMesh-selfcheck.mjs -- v2774
//
// Run: node tools/ship/rleRenderMesh-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/rleRenderMesh.js -- the adapter from rleMesh {positions,normals,indices} to the live renderer's
// {verts,cols,aos} (world/chunkMesherCore.js contract). Pins: (1) FORMAT shape matches the renderer (6 verts/quad,
// 3 floats/vert verts+cols, 1/vert aos); (2) GEOMETRY preserved (de-indexed triangle area == indexed area);
// (3) OFFSET applied; (4) COLOUR-BY-TYPE position-correct vs an independent per-quad type lookup; (5) SABOTAGE:
// sampling the AIR side (centroid + 0.5n) instead of the solid side gives different colours -> the back-step is
// load-bearing; (6) AO in range; (7) getRLE is dim-correct at 16x16x16 (the point-query fix this adapter needs).

import { rleMeshToRenderMesh } from "../../voxel/rleRenderMesh.js";
import { meshWorldChunk, worldChunkToRLE } from "../../voxel/rleWorldBridge.js";
import { encodeRLE, rleIndex, getRLE } from "../../voxel/voxelRLE.js";
import { rleMesh } from "../../voxel/rleMesh.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const isSolid = (t) => t !== 0;
const S = 16, wIdx = (x, y, z) => x + y * S + z * S * S;

// A two-material chunk: stone (1) for y<4, dirt (2) for 4<=y<7, interior column so all neighbours exist.
function twoMatChunk() {
    const v = new Uint8Array(S * S * S);
    for (let x = 5; x < 9; x++) for (let z = 5; z < 9; z++) {
        for (let y = 0; y < 4; y++) v[wIdx(x, y, z)] = 1;      // stone
        for (let y = 4; y < 7; y++) v[wIdx(x, y, z)] = 2;      // dirt
    }
    return v;
}
const PALETTE = { 1: [0.65, 0.65, 0.70], 2: [0.60, 0.50, 0.30] };

function triArea(verts) {   // non-indexed: every 3 verts is a triangle
    let a = 0;
    for (let i = 0; i < verts.length; i += 9) {
        const ux = verts[i + 3] - verts[i], uy = verts[i + 4] - verts[i + 1], uz = verts[i + 5] - verts[i + 2];
        const vx = verts[i + 6] - verts[i], vy = verts[i + 7] - verts[i + 1], vz = verts[i + 8] - verts[i + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        a += 0.5 * Math.hypot(cx, cy, cz);
    }
    return a;
}
function indexedArea(m) {
    const p = m.positions, ix = m.indices; let a = 0;
    for (let i = 0; i < ix.length; i += 3) {
        const A = ix[i] * 3, B = ix[i + 1] * 3, C = ix[i + 2] * 3;
        const ux = p[B] - p[A], uy = p[B + 1] - p[A + 1], uz = p[B + 2] - p[A + 2];
        const vx = p[C] - p[A], vy = p[C + 1] - p[A + 1], vz = p[C + 2] - p[A + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        a += 0.5 * Math.hypot(cx, cy, cz);
    }
    return a;
}

const chunk = twoMatChunk();
const rle = worldChunkToRLE(chunk, S);
const mesh = rleMesh(rle, isSolid);
const q = mesh.quadCount;

// 1. FORMAT matches the renderer contract
{
    const r = rleMeshToRenderMesh(mesh, rle, { palette: PALETTE });
    ok("format: verts = quadCount*6*3", r.verts.length === q * 18, "verts=" + r.verts.length + " exp=" + q * 18);
    ok("format: cols = quadCount*6*3", r.cols.length === q * 18);
    ok("format: aos = quadCount*6", r.aos.length === q * 6);
    ok("format: count = quadCount*6 (verts.length/3)", r.count === q * 6 && r.verts.length / 3 === r.count);
    ok("format: vertex count divisible by 3 (whole triangles)", (r.verts.length / 3) % 3 === 0);
}

// 2. GEOMETRY preserved through de-index
{
    const r = rleMeshToRenderMesh(mesh, rle, { palette: PALETTE });
    ok("geometry: de-indexed area == indexed rleMesh area", Math.abs(triArea(r.verts) - indexedArea(mesh)) < 1e-6, "deidx=" + triArea(r.verts) + " idx=" + indexedArea(mesh));
}

// 3. OFFSET applied to every vertex
{
    const r = rleMeshToRenderMesh(mesh, rle, { palette: PALETTE, offset: [100, 5, -20] });
    const vi0 = mesh.indices[0] * 3;
    ok("offset: first vertex shifted by the chunk offset", Math.abs(r.verts[0] - (mesh.positions[vi0] + 100)) < 1e-6 && Math.abs(r.verts[1] - (mesh.positions[vi0 + 1] + 5)) < 1e-6);
}

// 4. COLOUR-BY-TYPE is position-correct (independent per-quad type lookup off the chunk)
{
    const r = rleMeshToRenderMesh(mesh, rle, { palette: PALETTE });
    const P = mesh.positions, N = mesh.normals;
    let mism = 0, dirtSeen = 0, stoneSeen = 0;
    for (let i = 0; i < q; i++) {
        const nb = i * 4 * 3, nx = N[nb], ny = N[nb + 1], nz = N[nb + 2];
        let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 4; k++) { const b = (i * 4 + k) * 3; cx += P[b]; cy += P[b + 1]; cz += P[b + 2]; }
        cx *= 0.25; cy *= 0.25; cz *= 0.25;
        const vx = Math.floor(cx - 0.5 * nx), vy = Math.floor(cy - 0.5 * ny), vz = Math.floor(cz - 0.5 * nz);
        const t = chunk[wIdx(vx, vy, vz)];                 // INDEPENDENT: read the original chunk directly
        const want = PALETTE[t] || [0.8, 0.8, 0.8];
        const cb = i * 6 * 3;                               // first vertex colour of this quad
        if (Math.abs(r.cols[cb] - want[0]) > 1e-6 || Math.abs(r.cols[cb + 1] - want[1]) > 1e-6 || Math.abs(r.cols[cb + 2] - want[2]) > 1e-6) mism++;
        if (t === 2) dirtSeen++; if (t === 1) stoneSeen++;
    }
    ok("colour: every quad's colour matches its solid voxel's type (independent lookup)", mism === 0, "mismatches=" + mism);
    ok("colour: both materials actually appear (stone + dirt)", dirtSeen > 0 && stoneSeen > 0, "dirtQuads=" + dirtSeen + " stoneQuads=" + stoneSeen);
}

// 5. SABOTAGE: sampling the AIR side (centroid + 0.5n) mislabels colours -> back-step direction is load-bearing
{
    const good = rleMeshToRenderMesh(mesh, rle, { palette: PALETTE });
    const P = mesh.positions, N = mesh.normals;
    const badCols = new Float32Array(q * 18); let bp = 0;
    for (let i = 0; i < q; i++) {
        const nb = i * 4 * 3, nx = N[nb], ny = N[nb + 1], nz = N[nb + 2];
        let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 4; k++) { const b = (i * 4 + k) * 3; cx += P[b]; cy += P[b + 1]; cz += P[b + 2]; }
        cx *= 0.25; cy *= 0.25; cz *= 0.25;
        const t = getRLE(rle, Math.floor(cx + 0.5 * nx), Math.floor(cy + 0.5 * ny), Math.floor(cz + 0.5 * nz));  // WRONG: air side
        const c = PALETTE[t] || [0.8, 0.8, 0.8];
        for (let e = 0; e < 6; e++) { badCols[bp++] = c[0]; badCols[bp++] = c[1]; badCols[bp++] = c[2]; }
    }
    let differ = false; for (let i = 0; i < badCols.length; i++) if (Math.abs(badCols[i] - good.cols[i]) > 1e-6) { differ = true; break; }
    ok("SABOTAGE: sampling the air side gives different colours (back-step is real)", differ);
}

// 6. AO in range
{
    const r = rleMeshToRenderMesh(mesh, rle, { palette: PALETTE });
    let inRange = true; for (const a of r.aos) if (!(a >= 0 && a <= 1)) { inRange = false; break; }
    ok("ao: all AO values in [0,1]", inRange);
}

// 7. getRLE dim-correct at 16^3 (the point-query fix)
{
    ok("getRLE: dim-aware read at 16^3 returns the right type", getRLE(rle, 6, 5, 6) === 2 && getRLE(rle, 6, 1, 6) === 1, "top=" + getRLE(rle, 6, 5, 6) + " bottom=" + getRLE(rle, 6, 1, 6));
}

// 8. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../voxel/rleRenderMesh.js", import.meta.url), "utf8");
    ok("source: rleRenderMesh imports no Node builtin at module scope", !/^\s*import[^\n]*["'](node:|fs|path|url|crypto|net|dgram|zlib)/m.test(src));
}

console.log("rleRenderMesh-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
