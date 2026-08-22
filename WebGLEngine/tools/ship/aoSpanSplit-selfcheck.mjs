// WebGLEngine/tools/ship/aoSpanSplit-selfcheck.mjs -- v2793
//
// Run: node tools/ship/aoSpanSplit-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES voxel/rleRenderMesh.js splitSideSpansByAO -- the AO span-split refinement (merged from the parallel
// v2790 work, which shipped ungated). The known limitation it fixes: a tall greedy side span emits ONE quad, so
// AO is sampled only at the ends and the GPU interpolates between -- a mid-span occluder reads smoothed, not
// sharp. The split cuts a span where per-unit-face AO stops being uniform.
//
// The two things that must BOTH hold (this is the whole point):
//   (a) a mid-span occluder actually splits the span  -> sharp AO
//   (b) a UNIFORM tall span still emits ONE quad      -> no geometry explosion
// Plus: surface area is conserved (geometry unchanged), and default-off is byte-identical to before.

import { splitSideSpansByAO } from "../../voxel/rleRenderMesh.js";
import { encodeRLE, rleIndex } from "../../voxel/voxelRLE.js";
import { rleMesh } from "../../voxel/rleMesh.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const isSolid = (t) => t !== 0;
const D = { sx: 16, sy: 24, sz: 16 };

function chunkFrom(fill) {
    const v = new Uint8Array(D.sx * D.sy * D.sz);
    for (let x = 0; x < D.sx; x++) for (let y = 0; y < D.sy; y++) for (let z = 0; z < D.sz; z++) if (fill(x, y, z)) v[rleIndex(x, y, z, D)] = 1;
    return encodeRLE(v, D);
}
function areaOf(m) {
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

// FIXTURE A: a tall isolated pillar -- every side face is equally open, so AO is UNIFORM up the whole span.
const pillar = chunkFrom((x, y, z) => x === 8 && z === 8 && y >= 2 && y < 14);   // 12 tall
// FIXTURE B: same pillar + ONE occluder voxel floating beside it partway up -> AO changes mid-span.
const occluded = chunkFrom((x, y, z) => (x === 8 && z === 8 && y >= 2 && y < 14) || (x === 9 && z === 8 && y === 8));

// 1. UNIFORM tall span stays merged (no geometry explosion)
{
    const m = rleMesh(pillar, isSolid);
    const split = splitSideSpansByAO(m, pillar, isSolid);
    ok("uniform tall span: quad count unchanged (stays merged, no explosion)", split.quadCount === m.quadCount, "before=" + m.quadCount + " after=" + split.quadCount);
}

// 2. MID-SPAN OCCLUDER splits the span (the actual fix)
{
    const m = rleMesh(occluded, isSolid);
    const split = splitSideSpansByAO(m, occluded, isSolid);
    ok("mid-span occluder: span IS split (more quads than the merged mesh)", split.quadCount > m.quadCount, "before=" + m.quadCount + " after=" + split.quadCount);
    // but not shattered into every unit face -- uniform runs above/below the occluder stay merged
    const unitFaceUpper = 4 * 12;   // if it split every 1-tall face on all 4 sides of the 12-tall pillar
    ok("mid-span occluder: NOT shattered into unit quads (uniform runs still merged)", split.quadCount < m.quadCount + unitFaceUpper, "after=" + split.quadCount);
}

// 3. GEOMETRY CONSERVED: splitting changes tessellation, never surface area
{
    for (const [name, rle] of [["pillar", pillar], ["occluded", occluded]]) {
        const m = rleMesh(rle, isSolid);
        const split = splitSideSpansByAO(m, rle, isSolid);
        ok(`area conserved through split (${name})`, Math.abs(areaOf(split) - areaOf(m)) < 1e-9, "before=" + areaOf(m).toFixed(2) + " after=" + areaOf(split).toFixed(2));
    }
}

// 4. WINDING preserved: every triangle's geometric normal still matches its declared normal
{
    const m = rleMesh(occluded, isSolid);
    const s = splitSideSpansByAO(m, occluded, isSolid);
    const p = s.positions, n = s.normals, ix = s.indices;
    let allAgree = true;
    for (let i = 0; i < ix.length; i += 3) {
        const A = ix[i] * 3, B = ix[i + 1] * 3, C = ix[i + 2] * 3;
        const ux = p[B] - p[A], uy = p[B + 1] - p[A + 1], uz = p[B + 2] - p[A + 2];
        const vx = p[C] - p[A], vy = p[C + 1] - p[A + 1], vz = p[C + 2] - p[A + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const L = Math.hypot(cx, cy, cz) || 1;
        if ((cx / L) * n[A] + (cy / L) * n[A + 1] + (cz / L) * n[A + 2] < 0.99) allAgree = false;
    }
    ok("winding preserved: geometric normals still match declared normals", allAgree);
}

// 5. SABOTAGE / load-bearing: the split must actually change the OCCLUDED case and not the uniform one.
// If splitSideSpansByAO were a no-op (the bug it fixes), test 2 would fail -- assert the difference explicitly.
{
    const mu = rleMesh(pillar, isSolid), su = splitSideSpansByAO(mu, pillar, isSolid);
    const mo = rleMesh(occluded, isSolid), so = splitSideSpansByAO(mo, occluded, isSolid);
    const changedOccluded = so.quadCount !== mo.quadCount, changedUniform = su.quadCount !== mu.quadCount;
    ok("SABOTAGE guard: split fires ONLY where AO actually varies (occluded yes, uniform no)", changedOccluded && !changedUniform);
}

// 6. +-Y faces and 1-tall spans are untouched (only tall side spans are candidates)
{
    const slab = chunkFrom((x, y, z) => y === 3 && x >= 4 && x < 10 && z >= 4 && z < 10);   // flat 1-tall slab
    const m = rleMesh(slab, isSolid);
    const s = splitSideSpansByAO(m, slab, isSolid);
    ok("flat slab (1-tall spans, +-Y faces): untouched", s.quadCount === m.quadCount, "before=" + m.quadCount + " after=" + s.quadCount);
}

// 7. opt-in wiring: rleMeshToRenderMesh only splits when opts.splitSpansByAO is set (default path unchanged)
{
    const src = (await import("node:fs")).readFileSync(new URL("../../voxel/rleRenderMesh.js", import.meta.url), "utf8");
    ok("wiring: split is opt-in behind opts.splitSpansByAO (default OFF)", /opts\.splitSpansByAO\s*&&/.test(src));
    ok("source: no node builtin / DOM at module scope (browser-safe)", !/^\s*import[^\n]*["'](node:|fs|path|url)/m.test(src) && !/\bdocument\b|\bwindow\b/.test(src));
}

console.log("aoSpanSplit-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
