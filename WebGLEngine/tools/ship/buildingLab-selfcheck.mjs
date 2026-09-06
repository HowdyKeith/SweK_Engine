#!/usr/bin/env node
// WebGLEngine/tools/ship/buildingLab-selfcheck.mjs -- v4512
//
// THE BUILDING LAB (buildings 4): render/buildingLab.mjs on gpuDriven's records and the lit pipeline. Section 1, headless: the cube is
// 24 vertices and 12 triangles with unit axis normals that agree with their vertices' side, wound outward; labRecords is one record
// per placement centred on the origin with the floors on y, a tint per kind, and the kinds partition the placements; rayBox's slab
// test on hand rays. Section 2, both backends: the default building (5 x 4 x 4) drawn through makeGpuDrivenScene with a camera on
// the +z axis; the cull twin sees every placement (all inside the frustum); the frame's covered pixels agree with the CPU
// silhouette (a ray per pixel against the union of the boxes) on more than 97% of pixels with the rest within a pixel of an edge;
// the frame carries the palette (at least four distinct tints where the CPU says four kinds face the camera); a front party wall
// draws the same silhouette with the front's tint moved to blank; the backends together.
//
// MEASURED AT v4512 (a 5 x 3 x 6 building, 160 x 120, the camera 11 away on +z): 90 records, 24 corners, 6 stairs, 3 roof caps, 42 walls;
// on both backends 4,958 pixels lit against a CPU silhouette of 4,960, 19,186 pixels agree, 12 differ within a pixel of an edge and 2
// elsewhere (the sub-pixel gaps between boxes), the cull twin sees 90 of 90, 4 distinct tints face the camera, a front party wall darkens
// 5,816 pixels and brightens 0; the backends 82 pixels apart. A first draft used the 5 x 4 x 4 default building and sabotage A -- the
// floors put on z -- drew the same boxes (four deep, four tall): 0 red until the building was made asymmetric in every axis.
//
// SABOTAGE (v4512): A  labRecords putting the floors on z instead of y        -> 0 RED on the 5 x 4 x 4 default (symmetric in the swapped axes);
//                                                                                1 red on 5 x 3 x 6: the records' y spans +-1 where six floors
//                                                                                span +-2.5, by name.
//                   B  boxMesh's +x face normal pointing -x                    -> 1 red: the cube hold (a normal against its own face).
//                   C  the record size the full tile (gap ignored)             -> 3 red: the size hold, and only 3 tints on the picture on both
//                                                                                backends (the boxes fuse and the interior kind vanishes).
//                   D  kindOf calling a blank cell a wall                      -> 3 red: the party-wall tint hold, and the front's pixels get
//                                                                                brighter (1,212) instead of darker on both backends.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/buildingLab-selfcheck.mjs      (~40 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { KINDS, KIND_TINTS, kindOf, boxMesh, labRecords, labBuilding, rayBox, silhouette } from "../../render/buildingLab.mjs";
import { cullLodCpu, EXTRA_FLOATS } from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
// 5 x 3 x 6: a first draft used the 5 x 4 x 4 default, and a sabotage that swapped the depth and floor axes drew the same boxes (four deep,
// four tall); the building here is asymmetric in every axis, so which axis is which shows in the records and in the picture
const W = 160, H = 120, FOV = 0.9, DIST = 11, SEED = 7, SHAPE = { nx: 5, ny: 3, nz: 6 };

sec("1. HEADLESS: the cube, the records, the kinds, the slab test");
{
    const m = boxMesh([1, 1, 1, 1]);
    let agree = true, unit = true; for (let v = 0; v < 24; v++) { const p = [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]], n = [m.normals[v * 3], m.normals[v * 3 + 1], m.normals[v * 3 + 2]]; if (!near(Math.hypot(...n), 1)) unit = false; if (p[0] * n[0] + p[1] * n[1] + p[2] * n[2] < 0.5 - 1e-9) agree = false; }
    let outward = 0; for (let t = 0; t < 12; t++) { const P = [0, 1, 2].map((k) => { const i = m.indices[t * 3 + k]; return [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]; }); const e1 = P[1].map((v, k) => v - P[0][k]), e2 = P[2].map((v, k) => v - P[0][k]); const nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const c = P[0].map((v, k) => (v + P[1][k] + P[2][k]) / 3); if (nrm[0] * c[0] + nrm[1] * c[1] + nrm[2] * c[2] > 0) outward++; }
    ok("the cube: 24 vertices, 12 triangles, unit axis normals each pointing out of its own face, every triangle wound outward", m.positions.length === 72 && m.indices.length === 36 && unit && agree && outward === 12);
    const b = labBuilding(SEED, SHAPE);
    let ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity; for (let i = 0; i < b.count; i++) { ymin = Math.min(ymin, b.records[i * 4 + 1]); ymax = Math.max(ymax, b.records[i * 4 + 1]); zmin = Math.min(zmin, b.records[i * 4 + 2]); zmax = Math.max(zmax, b.records[i * 4 + 2]); }
    ok("one record per placement, centred (the records' mean is the origin), the FLOORS on the world's y (six floors span +-2.5) and the depth on z (three cells span +-1), size the tile less the gap", b.count === b.grammar.placements.length && b.count === 90 && near([...Array(b.count)].reduce((s, _, i) => s + b.records[i * 4 + 1], 0) / b.count, 0, 1e-9) && near(b.records[3], 0.92, 1e-6) && ymin === -2.5 && ymax === 2.5 && zmin === -1 && zmax === 1);
    const tally = {}; b.grammar.placements.forEach((p, i) => { const k = kindOf(p); tally[k] = (tally[k] || 0) + 1; if (b.extras[i * EXTRA_FLOATS + 1] !== KINDS.indexOf(k) + 1) tally.bad = 1; });
    ok("the kinds partition the placements and each record's tint index is its kind's, 1-based (24 corners, 6 stairs, 3 roof caps, 42 walls)", !tally.bad && Object.values(tally).reduce((a, c) => a + c, 0) === 90 && tally.corner === 24 && tally.stairs === 6 && tally.roofCap === 3 && (tally.wall || 0) + (tally.blank || 0) === 42, JSON.stringify(tally));
    ok("a front party wall moves the front's 30 walls and corners to the blank tint and nothing else", (() => { const p = labBuilding(SEED, { ...SHAPE, brandmauer: { front: true } }); let moved = 0, other = 0; for (let i = 0; i < 90; i++) { const a = b.extras[i * EXTRA_FLOATS + 1], c = p.extras[i * EXTRA_FLOATS + 1]; if (a !== c) { if (c === KINDS.indexOf("blank") + 1 && b.grammar.placements[i].cell[1] === 2) moved++; else other++; } } return moved === 30 && other === 0; })());
    ok("rayBox: a ray down -z from z = 5 hits the unit box at the origin at t = 4.5, misses beside it, and a ray away from it misses", near(rayBox([0, 0, 5], [0, 0, -1], [0, 0, 0], 0.5), 4.5) && rayBox([0.7, 0, 5], [0, 0, -1], [0, 0, 0], 0.5) === Infinity && rayBox([0, 0, 5], [0, 0, 1], [0, 0, 0], 0.5) === Infinity);
    ok(`KIND_TINTS has ${KINDS.length} entries, under the lit pipeline's eight`, KIND_TINTS.length === KINDS.length && KINDS.length <= 8);
}

sec("2. THE FRAME ON BOTH BACKENDS: the cull twin, the silhouette, the palette, a party wall");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const base = labBuilding(SEED, SHAPE), party = labBuilding(SEED, { ...SHAPE, brandmauer: { front: true } });
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, FOV, DIST, sets: [{ records: Array.from(base.records), extras: Array.from(base.extras) }, { records: Array.from(party.records), extras: Array.from(party.extras) }], tints: KIND_TINTS }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const { boxMesh } = await import("/render/buildingLab.mjs");
            const { W, H, FOV, DIST, sets, tints } = a; const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, frames: [] };
                const eye = [0, 0, DIST], light = [4, 6, DIST, 0.3];
                const cam = { viewProj: G.multiply(G.perspective(FOV, W / H, 0.1, 100), G.lookAt(eye, [0, 0, 0])), eye };
                for (const s of sets) {
                    const records = Float32Array.from(s.records), extras = Float32Array.from(s.extras);
                    const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "only", mesh: boxMesh([1, 1, 1, 1]) }], thresholds: [], records, layout: G.LAYOUTS.lit, pipeline: L.litPipelineDesc({ tints }), bind: L.litBind(light), headings: extras });
                    const fr = sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }), f = await fr.pixels;
                    o.frames.push({ pixels: Array.from(f.pixels), path: sc.path, uniforms: Array.from(fr.uniforms || []) });
                }
                dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("both backends built the lit box scene and drew the two buildings", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.frames.length === 2 && r.result.webgl2.frames.length === 2, r.ok ? "" : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu.frames.length === 2) {
            const sil = silhouette(base.records, base.count, W, H, FOV, DIST); let silCount = 0; for (const v of sil) silCount += v;
            for (const bk of ["webgpu", "webgl2"]) {
                const f = r.result[bk].frames[0], px = f.pixels; let covered = 0, agree = 0, disagree = 0, edge = 0;
                const lit = (i) => px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 24;
                for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const p = j * W + i, g = lit(p) ? 1 : 0; if (g) covered++; if (g === sil[p]) { agree++; continue; }
                    let nearEdge = false; for (let dj = -1; dj <= 1 && !nearEdge; dj++) for (let di = -1; di <= 1; di++) { const q = (j + dj) * W + (i + di); if (i + di < 0 || i + di >= W || j + dj < 0 || j + dj >= H) continue; if (sil[q] !== sil[p]) { nearEdge = true; break; } } if (nearEdge) edge++; else disagree++; }
                const u = f.uniforms.length ? cullLodCpu(base.records, Float32Array.from(f.uniforms), null, base.extras).visible : -1;
                report(`${bk} (${f.path}): ${covered} pixels lit, CPU silhouette ${silCount}; ${agree} agree, ${edge} differ within a pixel of an edge, ${disagree} differ elsewhere; the cull twin sees ${u} of ${base.count}`);
                // up to 4 of 19,200 pixels may differ away from a silhouette edge: the boxes are 0.08 apart, and a gap under a pixel wide sits
                // where the GPU's edge arithmetic and the CPU ray disagree by less than a pixel with no silhouette transition next door (2 measured)
                ok(`*** ${bk}: every placement survives the cull twin, and the frame's coverage is the CPU silhouette on more than 97% of pixels with the rest at edges (at most 4 elsewhere) ***`, u === base.count && disagree <= 4 && agree > W * H * 0.97 && covered > 1000);
                const hues = new Set(); for (let p = 0; p < W * H; p++) if (lit(p)) hues.add(Math.round(px[p * 4] / Math.max(1, px[p * 4 + 1]) * 10));
                ok(`  ${bk}: the palette is on the picture (${hues.size} distinct red-to-green ratios among lit pixels; corners, walls, stairs and roof caps face the camera)`, hues.size >= 4);
                const g2 = r.result[bk].frames[1].pixels; let same = 0, darker = 0, other = 0; for (let p = 0; p < W * H; p++) { const a = px[p * 4] + px[p * 4 + 1] + px[p * 4 + 2], c = g2[p * 4] + g2[p * 4 + 1] + g2[p * 4 + 2]; if (a === c) same++; else if (c < a) darker++; else other++; }
                ok(`  ${bk}: with a front party wall the silhouette is unchanged and the front's pixels only get darker (the blank tint): ${darker} darker, ${other} brighter`, other < W * H * 0.002 && darker > 200);
            }
            let po = 0; const A = r.result.webgpu.frames[0].pixels, B = r.result.webgl2.frames[0].pixels; for (let p = 0; p < W * H; p++) if (Math.abs(A[p * 4] - B[p * 4]) > 8 || Math.abs(A[p * 4 + 1] - B[p * 4 + 1]) > 8) po++;
            ok("  the two backends agree within 8 of 255 on all but edge pixels (fewer than 3%)", po < W * H * 0.03, `${po} apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the exact shade of each box (litSphere's gate holds the lighting arithmetic); accessories (the grammar's, not drawn: a box per cell has no railing); the page's orbit camera (building-lab.html, eyeballed).");
process.exit(fails ? 1 : 0);
