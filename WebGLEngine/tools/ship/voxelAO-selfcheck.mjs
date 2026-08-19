// WebGLEngine/tools/ship/voxelAO-selfcheck.mjs -- v2775
//
// Run: node tools/ship/voxelAO-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/voxelAO.js -- corner ambient occlusion from neighbour voxels. Pins the standard formula against
// known neighbour configs: isolated voxel = fully open everywhere; occluders monotonically darken; the
// (side1 && side2) crease special-cases to 0; and a SABOTAGE (sample the SOLID side instead of the air side)
// gives wrong AO -- proving the air-side sampling is load-bearing.

import { vertexAO, tangents } from "../../voxel/voxelAO.js";
import { encodeRLE, rleIndex } from "../../voxel/voxelRLE.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const isSolid = (t) => t !== 0;

const D = { sx: 16, sy: 16, sz: 16 };
function chunk(fill) {
    const flat = new Uint8Array(D.sx * D.sy * D.sz);
    fill((x, y, z, t) => { flat[rleIndex(x, y, z, D)] = t; });
    return encodeRLE(flat, D);
}

// A single voxel's +Y face, 4 corners. n=+y, tangents X,Z. The four corners lean (du,dw) in {-1,+1}^2.
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
function topFaceAO(rle, S) {
    // +Y face grid vertices of voxel S: the top-plane corners at y=S[1]+1
    const y = S[1] + 1, x = S[0], z = S[2];
    const pos = [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]];
    // match each grid vertex to its (du,dw) lean about the face centre (x+0.5, y, z+0.5)
    return pos.map((p) => {
        const du = Math.sign(p[0] - (x + 0.5));   // X lean
        const dw = Math.sign(p[2] - (z + 0.5));   // Z lean
        return vertexAO(rle, p, [0, 1, 0], du, dw, isSolid);
    });
}

// 1. ISOLATED voxel -> every corner fully open (AO 1)
{
    const rle = chunk((set) => set(8, 8, 8, 1));
    const ao = topFaceAO(rle, [8, 8, 8]);
    ok("isolated voxel: all 4 top-face corners fully open (AO 1)", ao.every((a) => Math.abs(a - 1) < 1e-9), "ao=" + ao.map((a) => a.toFixed(2)));
}

// 2. ONE diagonal occluder at a corner -> that corner dims to 2/3, others stay 1
{
    // solid voxel at (8,8,8); put a solid diagonal on the air side at (9,9,9) -> occludes the (+x,+z) corner
    const rle = chunk((set) => { set(8, 8, 8, 1); set(9, 9, 9, 1); });
    const ao = topFaceAO(rle, [8, 8, 8]);
    // corner (+1,+1) is index 2 in CORNERS ordering above
    ok("one diagonal occluder: the (+x,+z) corner dims to 2/3", Math.abs(ao[2] - 2 / 3) < 1e-9, "corner=" + ao[2].toFixed(3));
    ok("one diagonal occluder: the other 3 corners stay open", Math.abs(ao[0] - 1) < 1e-9 && Math.abs(ao[1] - 1) < 1e-9 && Math.abs(ao[3] - 1) < 1e-9);
}

// 3. BOTH edges occluded (the crease special case) -> corner goes fully dark (0), even without the diagonal
{
    // both edge neighbours of the (+x,+z) corner solid on the air side: (9,9,8) and (8,9,9); leave diagonal (9,9,9) air
    const rle = chunk((set) => { set(8, 8, 8, 1); set(9, 9, 8, 1); set(8, 9, 9, 1); });
    const ao = topFaceAO(rle, [8, 8, 8]);
    ok("both edges occluded: corner is fully dark (crease special case -> 0)", Math.abs(ao[2] - 0) < 1e-9, "corner=" + ao[2].toFixed(3));
}

// 4. MONOTONIC: 0,1,2(non-crease via edge+diagonal) occluders -> AO strictly decreases
{
    const c0 = chunk((set) => set(8, 8, 8, 1));                                  // 0 occluders
    const c1 = chunk((set) => { set(8, 8, 8, 1); set(9, 9, 9, 1); });            // 1 (diagonal)
    const c2 = chunk((set) => { set(8, 8, 8, 1); set(9, 9, 8, 1); set(9, 9, 9, 1); }); // 1 edge + diagonal (no crease)
    const a0 = topFaceAO(c0, [8, 8, 8])[2], a1 = topFaceAO(c1, [8, 8, 8])[2], a2 = topFaceAO(c2, [8, 8, 8])[2];
    ok("monotonic: more occluders -> lower AO (1 > 2/3 > 1/3)", a0 > a1 && a1 > a2, "a0=" + a0.toFixed(2) + " a1=" + a1.toFixed(2) + " a2=" + a2.toFixed(2));
}

// 5. AO always in [0,1] across a random-ish filled chunk, all six face directions
{
    const rle = chunk((set) => { for (let x = 4; x < 11; x++) for (let z = 4; z < 11; z++) for (let y = 2; y < 9; y++) if ((x * 7 + y * 13 + z * 5) % 3 !== 0) set(x, y, z, 1); });
    const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let inRange = true;
    for (const n of normals) for (const [du, dw] of CORNERS) { const a = vertexAO(rle, [7, 5, 7], n, du, dw, isSolid); if (!(a >= 0 && a <= 1)) inRange = false; }
    ok("AO always in [0,1] across all six face directions", inRange);
}

// 6. SABOTAGE: sampling the SOLID side (invert the normal) gives different AO -> air-side sampling is real
{
    const rle = chunk((set) => { set(8, 8, 8, 1); set(9, 9, 9, 1); });
    const good = vertexAO(rle, [9, 9, 9], [0, 1, 0], 1, 1, isSolid);      // real: air side is +Y
    const bad = vertexAO(rle, [9, 9, 9], [0, -1, 0], 1, 1, isSolid);      // wrong normal -> samples the wrong side
    ok("SABOTAGE: flipping to the solid side changes AO (air-side sampling load-bearing)", Math.abs(good - bad) > 1e-9, "good=" + good.toFixed(3) + " bad=" + bad.toFixed(3));
}

// 7. tangents are perpendicular unit axes to the normal
{
    const perpOK = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].every((n) => { const [u, w] = tangents(n); const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; return dot(n, u) === 0 && dot(n, w) === 0 && dot(u, w) === 0; });
    ok("tangents: perpendicular to the normal and to each other", perpOK);
}

// 8. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../voxel/voxelAO.js", import.meta.url), "utf8");
    ok("source: voxelAO imports no Node builtin at module scope", !/^\s*import[^\n]*["'](node:|fs|path|url|crypto|net|dgram|zlib)/m.test(src));
}

console.log("voxelAO-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
