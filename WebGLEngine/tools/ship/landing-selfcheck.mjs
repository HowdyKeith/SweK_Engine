#!/usr/bin/env node
// WebGLEngine/tools/ship/landing-selfcheck.mjs -- v4317 (Level 17)
//
// GRADES LANDING ON A PLANET: a body of the orrery becomes a heightfield of its own file tree (render/bodyTerrain.mjs),
// drawn through the SAME terrain pipeline, LOD ladder and pick as render/gpuTerrain.mjs, so that pointing at a
// ridge names the file whose bytes made it. On the CPU: every file's peak names that file, the field is bounded,
// the same path lands the same way. On both backends: the terrain draws, a pick at a hill's peak names a chunk,
// and the chunk's file is the hill's.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as B from "../../render/bodyTerrain.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const body = raw.bodies.find((b) => b.name === "wasm"), krbn = raw.bodies.find((b) => b.name === "krbn");

console.log("\n1. A BODY'S FILES AS HILLS: every peak names its file, the field is bounded, the landing is a fact about the path");
const bt = B.bodyHeightfield(body);
{
    ok(`${body.name} lands: ${bt.files.length} files, a ${bt.size}x${bt.size} field over ${bt.params.extent} units`, bt.files.length === body.files.length && bt.field.width === 64);
    let named = 0, tallestNamed = 0; const misses = [];
    for (let i = 0; i < bt.files.length; i++) { const p = bt.peak(i); const f = bt.fileAt(p.x, p.z); if (f && f.path === p.file.path) named++; else misses.push(p.file.path.split("/").pop()); }
    const tallest = bt.hills.slice().sort((a, b) => b.h - a.h).slice(0, 5);
    for (const h of tallest) { const p = bt.peak(h.i); if (bt.fileAt(p.x, p.z) && bt.fileAt(p.x, p.z).path === h.path) tallestNamed++; }
    ok("*** at a hill's peak the field names that hill's file -- for the five tallest, every one; for all files, all but the few a bigger neighbour covers ***", tallestNamed === 5 && named >= bt.files.length * 0.8, `${named}/${bt.files.length} peaks name their own file; covered: ${misses.join(", ") || "none"}`);
    let lo = 1, hi = 0; for (let i = 0; i < bt.field.data.length; i += 4) { const v = bt.field.data[i] / 255; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    ok("  heights lie in [floor, 1] and the tallest file reaches 1", lo >= 0.05 - 1e-9 && hi === 1, `${lo.toFixed(3)} .. ${hi}`);
    const again = B.bodyHeightfield(body);
    ok("  the same body lands the same way twice (the hash is the path's)", Buffer.compare(Buffer.from(again.field.data), Buffer.from(bt.field.data)) === 0 && again.owners.every((v, i) => v === bt.owners[i]));
    const h1 = B.hillOf("src/a.js"), h2 = B.hillOf("src/b.js");
    ok("  two paths land in two places, and no hill sits on the edge", (h1.u !== h2.u || h1.v !== h2.v) && [h1, h2].every((h) => h.u > 0.05 && h.u < 0.95 && h.v > 0.05 && h.v < 0.95));
    ok("REFUSED: a body with no files", throwsWith(() => B.bodyHeightfield({ name: "empty", files: [] }), /no files to land on/));
    const L = B.landingRecords(bt, 8);
    ok("the landing's chunks are gpuTerrain's chunk records over the field (64 of them), and a chunk's file is fileAt() at its centre", L.records.length === 64 * G.RECORD_FLOATS && L.side === 8 && B.fileOfChunk(bt, 8, 0).x === bt.params.originX + 0.5 * bt.params.extent / 8);
    const kb = B.bodyHeightfield(krbn);
    report(`${krbn.name}: ${kb.files.length} files; the tallest is ${kb.hills.slice().sort((a, b) => b.h - a.h)[0].path} (${kb.hills.slice().sort((a, b) => b.h - a.h)[0].bytes} bytes)`);
}

console.log("\n2. ON BOTH BACKENDS: the body's terrain draws through gpuTerrain's pipeline, and a pick at a peak names the file");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const tallest = bt.hills.slice().sort((a, b) => b.h - a.h).slice(0, 4).map((h) => ({ i: h.i, ...bt.peak(h.i) }));
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 256, body, peaks: tallest.map((p) => ({ x: p.x, z: p.z, path: p.file.path })) }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const T = await import("/render/gpuTerrain.mjs"); const B = await import("/render/bodyTerrain.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const bt = B.bodyHeightfield(a.body); const L = B.landingRecords(bt, 8);
        const eye = [0, 9, 9], viewProj = G.multiply(G.perspective(0.9, 1, 0.1, 100), G.lookAt(eye, [0, 0, 0]));
        const lods = () => [{ name: "coarse", mesh: T.skirtedQuadMesh(1) }, { name: "fine", mesh: T.skirtedQuadMesh(6) }];
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const tex = dev.texture({ width: bt.field.width, height: bt.field.height, data: bt.field.data, nearest: true });
            const sc = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: [0.08], records: L.records, pipeline: T.terrainPipelineDesc(), bind: (pass) => { pass.uniform("terrain", L.params); pass.uniform("light", new Float32Array(T.LIGHT)); pass.texture("heightTex", tex, 0); },
                                                   pickPipeline: T.terrainPickPipelineDesc(), pickBind: T.terrainPickBind(L.params, tex) });   // v4479 -- the terrain's own pick picture
            const f = sc.frame({ viewProj, eye, read: true, clear: [0, 0, 0, 1] }); const pix = await f.pixels;
            let lit = 0; for (let i = 0; i < pix.pixels.length; i += 4) if (pix.pixels[i] + pix.pixels[i + 1] > 0) lit++;
            const picks = [];
            for (const p of a.peaks) { const y = bt.heightAt(p.x, p.z) * bt.params.heightScale; const q = G.project(viewProj, [p.x, y, p.z]);
                const hit = await sc.pick((q[0] * 0.5 + 0.5) * a.N, (1 - (q[1] * 0.5 + 0.5)) * a.N);
                picks.push({ path: p.path, hit, file: hit ? B.fileOfChunk(bt, 8, hit.id).file : null }); }
            out[backend] = { backend: dev.backend, path: sc.path, lit, total: pix.pixels.length / 4, counts: await sc.readCounts(), picks };
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ") || r.error));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(`${b}: the body's terrain draws (${R.path}), chunks culled into the ladder`, R.backend === b && R.lit > R.total * 0.1 && R.counts.reduce((x, y) => x + y, 0) > 0, `${R.lit} lit of ${R.total}, counts ${R.counts.join("/")}`);
            const named = R.picks.filter((p) => p.hit && p.file && p.file.path === p.path).length;
            ok(`*** ${b}: a pick at the tallest hills' peaks names a chunk, and the chunk's file is the hill's file (${named} of ${R.picks.length}) ***`, named === R.picks.length && R.picks.every((p) => p.hit), R.picks.map((p) => `${p.path.split("/").pop()} -> ${p.file ? p.file.path.split("/").pop() : "nothing"}`).join(", "));
        }
        ok("both backends name the same files at the same peaks", JSON.stringify(r.result.webgpu.picks.map((p) => p.file && p.file.path)) === JSON.stringify(r.result.webgl2.picks.map((p) => p.file && p.file.path)));
    }
}

// v4479 -- *** THE ONE-MISS TOLERANCE WAS HIDING A DEFECT. *** "named >= picks - 1" passed at 3 of 4 for 162 rounds while the pick
// picture was gpuDriven's DEFAULT: flat squares scaled by the cull radius, not the terrain. The treemap landing (repoLanding-
// selfcheck) missed 6 of 6 and found it; gpuTerrain.terrainPickPipelineDesc picks with the terrain's own vertex stage, and
// this gate now requires every peak to name its file: 4 of 4 on both backends.
// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4317.
//   A  fileAt() answering the first file always -> exit=1, 3 red: 1 of 45 peaks names its own file on the CPU, and on
//      both backends the four picks all name bench.ts.
//   B  hillOf() ignoring the path (every hill at the centre) -> exit=1, 4 red: two paths land in one place, 1 of 45
//      peaks names its file, and the picks on both backends name the one tallest hill for everything.
//   C  landingRecords() at half the extent (chunks over a quarter of the field) -> exit=1, 4 red: the terrain draws
//      nothing the cull keeps (counts 0/64 -- every chunk's sphere off the frustum's centre), and every peak picks nothing.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the zoom itself -- the page switches to the landing view on a key, it does not fly down through a threshold; " +
    "and what a hill's SHAPE should be (a file is a Gaussian here; a directory tree would be a range).");
process.exit(fails ? 1 : 0);
