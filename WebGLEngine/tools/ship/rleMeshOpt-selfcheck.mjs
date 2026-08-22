// WebGLEngine/tools/ship/rleMeshOpt-selfcheck.mjs -- v2795
//
// Run: node tools/ship/rleMeshOpt-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/rleMeshOpt.js -- the two optimisations the v2794 benchmark called for: skip the never-visible world
// floor, and greedy-merge +-Y faces. The danger of a merge is silent geometry corruption, so the gate proves
// COVERAGE (merged rectangles + leftover units reproduce the original face set EXACTLY -- no gap, no overlap),
// AO PRESERVATION (only AO-uniform faces merge, so a merged quad's corner AO equals what the unit faces had),
// and the keepFace pre-filter that stops a merged rectangle escaping the real chunk across a padded shell.

import { rleMeshOptimized, mergeYFaces, faceAO } from "../../voxel/rleMeshOpt.js";
import { rleMesh } from "../../voxel/rleMesh.js";
import { yFacesFromRLE } from "../../voxel/rleSurface.js";
import { encodeRLE, rleIndex } from "../../voxel/voxelRLE.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const isSolid = (t) => t !== 0;
const D = { sx: 16, sy: 24, sz: 16 };
const mk = (fill) => { const v = new Uint8Array(D.sx * D.sy * D.sz); for (let x = 0; x < D.sx; x++) for (let y = 0; y < D.sy; y++) for (let z = 0; z < D.sz; z++) if (fill(x, y, z)) v[rleIndex(x, y, z, D)] = 1; return encodeRLE(v, D); };
const area = (m) => { const p = m.positions, ix = m.indices; let a = 0; for (let i = 0; i < ix.length; i += 3) { const A = ix[i] * 3, B = ix[i + 1] * 3, C = ix[i + 2] * 3; const ux = p[B] - p[A], uy = p[B + 1] - p[A + 1], uz = p[B + 2] - p[A + 2]; const vx = p[C] - p[A], vy = p[C + 1] - p[A + 1], vz = p[C + 2] - p[A + 2]; const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; a += 0.5 * Math.hypot(cx, cy, cz); } return a; };

const flat = mk((x, y, z) => y < 8);
const bumpy = mk((x, y, z) => y < 8 + ((x + z) % 3));
const pit = mk((x, y, z) => y < 8 && !(x >= 6 && x < 9 && z >= 6 && z < 9 && y >= 6));   // a notch -> varying AO

// 1. COVERAGE: rects + units expand back to EXACTLY the original +-Y face set
{
    for (const [name, rle] of [["flat", flat], ["bumpy", bumpy], ["pit", pit]]) {
        const orig = new Set(yFacesFromRLE(rle, isSolid).map((f) => `${f.x},${f.y},${f.z},${f.dir}`));
        const { rects, units } = mergeYFaces(rle, isSolid, {});
        const got = new Set();
        let overlap = false;
        for (const r of rects) for (let x = r.x0; x < r.x1; x++) for (let z = r.z0; z < r.z1; z++) { const k = `${x},${r.y},${z},${r.dir}`; if (got.has(k)) overlap = true; got.add(k); }
        for (const f of units) { const k = `${f.x},${f.y},${f.z},${f.dir}`; if (got.has(k)) overlap = true; got.add(k); }
        const same = got.size === orig.size && [...orig].every((k) => got.has(k));
        ok(`coverage (${name}): merged rects + units == original face set, no overlap`, same && !overlap, `orig=${orig.size} got=${got.size}${overlap ? " OVERLAP" : ""}`);
    }
}

// 2. AREA conserved by merging alone (no floor skip)
{
    for (const [name, rle] of [["flat", flat], ["bumpy", bumpy], ["pit", pit]]) {
        const a = area(rleMesh(rle, isSolid)), b = area(rleMeshOptimized(rle, isSolid, {}));
        ok(`area conserved through merge (${name})`, Math.abs(a - b) < 1e-9, `base=${a} opt=${b}`);
    }
}

// 3. MERGE ACTUALLY WORKS: a flat top collapses; and it is load-bearing (mergeY:false leaves it alone)
{
    const merged = rleMeshOptimized(flat, isSolid, {});
    const unmerged = rleMeshOptimized(flat, isSolid, { mergeY: false });
    ok("merge: flat surface collapses to far fewer quads", merged.quadCount < unmerged.quadCount / 4, `merged=${merged.quadCount} unmerged=${unmerged.quadCount}`);
    ok("merge: mergeY:false disables it (option is load-bearing)", unmerged.quadCount === rleMesh(flat, isSolid).quadCount);
}

// 4. AO PRESERVATION: every merged rectangle is AO-uniform, and equals the AO of each unit face it covers
{
    const { rects } = mergeYFaces(pit, isSolid, {});
    let allUniform = true, mismatch = "";
    for (const r of rects) {
        const want = faceAO(pit, { x: r.x0, y: r.y, z: r.z0, dir: r.dir }, isSolid);
        const uniformWant = want.every((v) => v === want[0]);
        if (!uniformWant) { allUniform = false; mismatch = "seed face not uniform"; break; }
        for (let x = r.x0; x < r.x1 && allUniform; x++) for (let z = r.z0; z < r.z1; z++) {
            const ao = faceAO(pit, { x, y: r.y, z, dir: r.dir }, isSolid);
            if (!ao.every((v) => v === want[0])) { allUniform = false; mismatch = `face ${x},${z} AO ${ao} != ${want[0]}`; break; }
        }
    }
    ok("AO: every merged rectangle is uniform-AO throughout (merge cannot smooth an occluder)", allUniform, mismatch);
}

// 5. faces with VARYING AO are never merged -- they stay unit quads
{
    const { units } = mergeYFaces(pit, isSolid, {});
    const anyVarying = units.some((u) => u.ao && !u.ao.every((v) => v === u.ao[0]));
    ok("AO: varying-AO faces are kept as unit quads (not merged)", anyVarying, `units=${units.length}`);
}

// 6. FLOOR SKIP removes exactly the downward faces on the named plane, nothing else.
// NOTE: uses a FLOATING slab -- a slab resting on the grid bottom has no -Y faces at all (yFacesFromRLE only
// emits at a run boundary inside the column), so it would make this check vacuous.
{
    const floating = mk((x, y, z) => y >= 4 && y < 8);
    const withFloor = mergeYFaces(floating, isSolid, { mergeY: false });
    const floorY = Math.min(...withFloor.units.filter((f) => f.dir < 0).map((f) => f.y));
    const dropped = mergeYFaces(floating, isSolid, { mergeY: false, skipFloorY: floorY });
    const lost = withFloor.units.length - dropped.units.length;
    const expected = withFloor.units.filter((f) => f.dir < 0 && f.y === floorY).length;
    ok("floor skip: drops exactly the -Y faces on that plane", lost === expected && expected > 0, `lost=${lost} expected=${expected}`);
    ok("floor skip: keeps every +Y face", dropped.units.filter((f) => f.dir > 0).length === withFloor.units.filter((f) => f.dir > 0).length);
}

// 7. SABOTAGE / keepFace is load-bearing: without it, a merge on a PADDED chunk escapes the real-chunk bounds.
// (This is a real bug that was caught during the build: a rectangle spanning the shell cannot be trimmed later,
// because the downstream keepVoxel filter tests one centroid per quad.)
{
    const P = { sx: 18, sy: 24, sz: 18 };   // 16x16 real chunk + 1 shell each side
    const v = new Uint8Array(P.sx * P.sy * P.sz);
    for (let x = 0; x < P.sx; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < P.sz; z++) v[rleIndex(x, y, z, P)] = 1;
    const prle = encodeRLE(v, P);
    const inReal = (x, y, z) => x >= 1 && x <= 16 && y >= 1 && y <= 22 && z >= 1 && z <= 16;
    const guarded = mergeYFaces(prle, isSolid, { keepFace: inReal });
    const unguarded = mergeYFaces(prle, isSolid, {});
    const escapes = (res) => res.rects.some((r) => r.x0 < 1 || r.x1 > 17 || r.z0 < 1 || r.z1 > 17);
    ok("SABOTAGE: WITHOUT keepFace a merged rectangle escapes the real chunk into the shell", escapes(unguarded));
    ok("keepFace: WITH it, every merged rectangle stays inside the real chunk", !escapes(guarded));
}

// 8. winding preserved on the optimised mesh
{
    const m = rleMeshOptimized(bumpy, isSolid, {});
    const p = m.positions, n = m.normals, ix = m.indices;
    let agree = true;
    for (let i = 0; i < ix.length; i += 3) {
        const A = ix[i] * 3, B = ix[i + 1] * 3, C = ix[i + 2] * 3;
        const ux = p[B] - p[A], uy = p[B + 1] - p[A + 1], uz = p[B + 2] - p[A + 2];
        const vx = p[C] - p[A], vy = p[C + 1] - p[A + 1], vz = p[C + 2] - p[A + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const L = Math.hypot(cx, cy, cz) || 1;
        if ((cx / L) * n[A] + (cy / L) * n[A + 1] + (cz / L) * n[A + 2] < 0.99) agree = false;
    }
    ok("winding: geometric normals still match declared normals", agree);
}

// 9. browser/worker-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../voxel/rleMeshOpt.js", import.meta.url), "utf8");
    ok("source: imports only pure voxel modules, no node/DOM at module scope", !/^\s*import[^\n]*["'](node:|fs|path|url)/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
}

console.log("rleMeshOpt-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
