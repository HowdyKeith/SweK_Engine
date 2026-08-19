// WebGLEngine/tools/ship/rleMesh-selfcheck.mjs -- v2772
//
// Run: node tools/ship/rleMesh-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered by the *-selfcheck.mjs pattern).
//
// GATES voxel/rleMesh.js -- the module that turns the RLE face lists into a drawable mesh. rleMesh adds no
// new faces; it only wraps geometry around the faces rleSurface/rleSideFaces already found. So the meaningful
// failure is GEOMETRY: a quad placed wrong, sized wrong, or wound inward. Two invariants pin it, both computed
// from the ACTUAL emitted triangles (not from face counts), so a bad quad is caught:
//   (A) sum of triangle areas == exposed surface area (1 per +-Y face, a span's height per side span)
//   (B) every triangle's geometric normal agrees with the declared per-vertex normal (outward winding)
// Plus the spec fixtures (1x1x100 pillar -> 402, empty -> 0) and a SABOTAGE proof (drop the -X faces -> the
// area invariant fails), because a control that cannot fail is decoration.

import { RLE_SX, RLE_SY, RLE_SZ, RLE_N, rleIndex, encodeRLE } from "../../voxel/voxelRLE.js";
import { yFacesFromRLE } from "../../voxel/rleSurface.js";
import { sideFacesFromRLE, expandSpans } from "../../voxel/rleSideFaces.js";
import { rleMesh } from "../../voxel/rleMesh.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const isSolid = (t) => t !== 0;

// The exposed surface area the faces represent: each +-Y face is a unit, each side span contributes its height.
function exposedArea(rle) {
    return yFacesFromRLE(rle, isSolid).length + expandSpans(sideFacesFromRLE(rle, isSolid)).length;
}

// Geometric triangle-area sum from the mesh's own positions+indices -- if a quad is degenerate or misplaced,
// this diverges from exposedArea.
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

// Every triangle's geometric normal must point the same way as its declared per-vertex normal.
function windingAllOutward(m) {
    const p = m.positions, n = m.normals, ix = m.indices;
    for (let i = 0; i < ix.length; i += 3) {
        const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const na = ix[i] * 3;
        const dot = cx * n[na] + cy * n[na + 1] + cz * n[na + 2];
        if (!(dot > 0)) return false;   // inward or degenerate
    }
    return true;
}

function emptyChunk() { return new Uint8Array(RLE_N); }
// place a solid voxel at (x,y,z)
function setV(flat, x, y, z, t) { flat[rleIndex(x, y, z)] = t; }

// ---- FIXTURE 1: interior 1x1x100 pillar, floating (air above and below) -> area 402 ------------------
// top(1) + bottom(1) + 4 walls x 100 = 402. Interior x,z so all four side neighbours exist.
{
    const flat = emptyChunk();
    for (let y = 1; y <= 100; y++) setV(flat, 5, y, 5, 1);   // 100 tall, y in [1,100], air at y=0 and y>=101
    const rle = encodeRLE(flat);
    const exposed = exposedArea(rle);
    const m = rleMesh(rle, isSolid);
    ok("pillar: exposed surface area == 402", exposed === 402, "exposed=" + exposed);
    ok("pillar: mesh triangle area == exposed area", Math.abs(meshTriangleArea(m) - exposed) < 1e-9, "mesh=" + meshTriangleArea(m) + " exposed=" + exposed);
    ok("pillar: all triangles wound outward", windingAllOutward(m));
    ok("pillar: quadCount == face count", m.quadCount === (yFacesFromRLE(rle, isSolid).length + sideFacesFromRLE(rle, isSolid).length));
}

// ---- FIXTURE 2: empty chunk -> area 0, no geometry --------------------------------------------------
{
    const rle = encodeRLE(emptyChunk());
    const m = rleMesh(rle, isSolid);
    ok("empty: exposed area 0", exposedArea(rle) === 0);
    ok("empty: mesh emits no triangles", m.triCount === 0 && m.vertexCount === 0);
    ok("empty: mesh area 0", meshTriangleArea(m) === 0);
}

// ---- FIXTURE 3: a lumpy interior blob -> the invariant must hold on non-trivial geometry ------------
{
    const flat = emptyChunk();
    // a 4x3x5 box plus a bump, well inside the chunk
    for (let x = 8; x < 12; x++) for (let z = 10; z < 15; z++) for (let y = 20; y < 23; y++) setV(flat, x, y, z, 1);
    setV(flat, 9, 23, 12, 1); setV(flat, 9, 24, 12, 1);   // a 2-tall bump on top
    const rle = encodeRLE(flat);
    const exposed = exposedArea(rle);
    const m = rleMesh(rle, isSolid);
    ok("blob: mesh triangle area == exposed area", Math.abs(meshTriangleArea(m) - exposed) < 1e-9, "mesh=" + meshTriangleArea(m) + " exposed=" + exposed);
    ok("blob: all triangles wound outward", windingAllOutward(m));
    ok("blob: 2 triangles per quad", m.triCount === m.quadCount * 2);
}

// ---- SABOTAGE: drop the -X faces -> the area invariant must FAIL ------------------------------------
// Proves the invariant is load-bearing: a mesh missing a whole face family no longer matches exposed area.
{
    const flat = emptyChunk();
    for (let y = 1; y <= 100; y++) setV(flat, 5, y, 5, 1);
    const rle = encodeRLE(flat);
    const exposed = exposedArea(rle);
    const sab = rleMesh(rle, isSolid, { skipDirs: new Set(["-x"]) });
    const short = meshTriangleArea(sab);
    ok("SABOTAGE: dropping -X faces makes mesh area fall short of exposed (invariant is real)", short < exposed - 1, "sabotaged=" + short + " exposed=" + exposed);
}

// ---- BROWSER-SAFE: rleMesh imports no Node builtin (it is reached from browser pages) ---------------
{
    const src = (await import("node:fs")).readFileSync(new URL("../../voxel/rleMesh.js", import.meta.url), "utf8");
    ok("source: rleMesh imports no Node builtin at module scope", !/^\s*import[^\n]*["'](node:|fs|path|url|crypto|net|dgram|zlib)/m.test(src));
}

console.log("rleMesh-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
