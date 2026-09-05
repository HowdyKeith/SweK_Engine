#!/usr/bin/env node
// WebGLEngine/tools/ship/repoLanding-selfcheck.mjs -- v4479 (git terrain, step 1)
//
// GRADES THE TREEMAP LANDING: a body of the orrery becomes the GitHub Terrain of v4149 -- world/repoHeightfield.js's
// squarified treemap, a directory a landmass, a file a peak, data files as lakes -- drawn through the SAME terrain
// pipeline, ladder and pick as the hash hills of v4317 (render/bodyTerrain.mjs repoTerrainOf, landingFor).
//
// THE KEYS. On the CPU: the texel under every cell IS repoHeightfield's own smoothed height there, normalised, to
// half a byte; every leaf's rectangle centre names that leaf's file (the treemap's own answer, all 233 of krbn's);
// a lake sits below its landmass; a line is 80 bytes and the reason is measured. On both backends: the treemap
// draws through gpuTerrain's pipeline, and a pick at a leaf's centre lands on the chunk that contains it -- the
// chunk index from the geometry, not from a second lookup.
//
// SABOTAGE (v4479), each applied, run, restored byte for byte:
//   A  bodyTerrain: the field written unnormalised (no span)      -> exit=1, 1 red: the texel key at worst 8.9e-1 (makeField clamps, so the span check alone stays green)
//   B  bodyTerrain: fileAt answering files[0] always              -> exit=1, 2 red: 1 of 233 centres names its file; the margin names somebody
//   C  orrery-gpu.html: landOn ignoring the select (hills only)   -> exit=1, 1 red: the page's wiring
//   D  gpuTerrain: the pick stage's half-size taken as rec.w      -> exit=1, 3 red: 2 of 6 and 1 of 6 picks on their chunk, the backends parting --
//                                                                   the DEFAULT pick picture's fault, reproduced on purpose
//
// Run: node tools/ship/repoLanding-selfcheck.mjs      (~4 s: one browser, two backends)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as B from "../../render/bodyTerrain.mjs";
import * as G from "../../render/gpuDriven.mjs";
import { OPAQUE_EXT } from "../../world/orrery.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const raw = JSON.parse(fs.readFileSync(path.join(ENG, "orrery.json"), "utf8"));
const body = raw.bodies.find((b) => b.name === "krbn");

// ---------------------------------------------------------------------------------------------------------
sec("1. THE ENTRIES: the bake's bytes as repoHeightfield's lines, by a measured constant");
// ---------------------------------------------------------------------------------------------------------
{
    ok(B.BYTES_PER_LINE === 80, "a line is 80 bytes -- the bridge's pseudo-line, and this tree's measured mean of 80.7 over 5,022 text files (v4479)");
    const e = B.entriesFromFiles([{ path: "a.js", bytes: 800 }, { path: "b.wasm", bytes: 79 }, { path: "c.json", bytes: 0 }, null, { bytes: 5 }]);
    ok(e.length === 3 && e[0].lines === 10 && e[0].binary === false && e[1].lines === 1 && e[1].binary === true && e[2].lines === 1, "800 bytes is 10 lines, 79 is 1 (never 0), a wasm is binary by the opacity rule, a null and a pathless entry are dropped", JSON.stringify(e));
    ok(OPAQUE_EXT.test("x.wasm") && !OPAQUE_EXT.test("x.js"), "CONTROL: the opacity rule is world/orrery.mjs's, not a second list");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE TREEMAP GROUND: the field is repoHeightfield's, the rectangles name their files, lakes lie low");
// ---------------------------------------------------------------------------------------------------------
const t = B.repoTerrainOf(body);
{
    ok(t.kind === "treemap" && t.field.width === 128 && t.leaves.length === body.files.length && t.files.length === t.leaves.length,
       `${body.name} lands as a treemap: ${t.leaves.length} leaves for ${body.files.length} files, a ${t.field.width}x${t.field.height} field over ${t.params.extent} units`);
    const span = t.repo.max - t.repo.min; let worst = 0;
    for (let tz = 0; tz < t.size; tz++) for (let tx = 0; tx < t.size; tx++) {
        const x = t.params.originX + (tx + 0.5) / t.size * t.params.extent, z = t.params.originZ + (tz + 0.5) / t.size * t.params.extent;
        worst = Math.max(worst, Math.abs(t.heightAt(x, z) - (t.repo.heights[tz * t.size + tx] - t.repo.min) / span));
    }
    ok(worst <= 0.5 / 255 + 1e-12, "*** the texel under every cell IS repoHeightfield's smoothed height there, normalised, to half a byte ***", `worst ${worst.toExponential(2)} over ${t.size * t.size} cells`);
    let lo = 1, hi = 0; for (let i = 0; i < t.field.data.length; i += 4) { lo = Math.min(lo, t.field.data[i] / 255); hi = Math.max(hi, t.field.data[i] / 255); }
    ok(lo === 0 && hi === 1, "  the field spans 0..1: the lowest cell is 0 and the tallest 1", `${lo} .. ${hi}`);
    let named = 0; const misses = [];
    for (let i = 0; i < t.leaves.length; i++) { const p = t.peak(i); const f = t.fileAt(p.x, p.z); if (f && f.path === p.file.path) named++; else misses.push(p.file.path); }
    ok(named === t.leaves.length, `*** every leaf's rectangle centre names that leaf's file: ${named} of ${t.leaves.length} ***`, misses.slice(0, 3).join(", "));
    ok(t.fileAt(t.params.originX + 0.01, t.params.originZ + 0.01) === null, "  the margin around the treemap names no file: it is shoreline, not somebody's");
    // lakes: a data file's bed is its landmass without the file's own summit, so it sits below the mean of its neighbours
    const lakes = t.leaves.filter((l) => l.water);
    let low = 0;
    for (const l of lakes) { const dir = l.path.includes("/") ? l.path.slice(0, l.path.lastIndexOf("/")) : "";
        const land = t.leaves.filter((k) => !k.water && (k.path.includes("/") ? k.path.slice(0, k.path.lastIndexOf("/")) : "") === dir);
        if (!land.length) { low++; continue; }
        const mean = land.reduce((s, k) => s + t.peak(k.i).h, 0) / land.length; if (t.peak(l.i).h < mean) low++; }
    ok(lakes.length >= 5 && low === lakes.length, `*** the ${lakes.length} data files are lakes, each below the mean of its own landmass's peaks ***`, `${low} of ${lakes.length} low; ${t.repo.lakes.length} lakes reported by repoHeightfield`);
    ok(t.repo.peaks.length === 12 && t.repo.peaks[0].height >= t.repo.peaks[1].height, "repoHeightfield's own summits travel through: the tallest first", t.repo.peaks.slice(0, 3).map((p) => p.path).join(", "));
    const again = B.repoTerrainOf(body);
    ok(Buffer.compare(Buffer.from(again.field.data), Buffer.from(t.field.data)) === 0, "  the same body lands the same way twice");
    ok(throwsWith(() => B.repoTerrainOf({ name: "empty", files: [] }), /no files to land on/), "REFUSED: a body with no files");
    ok(B.landingFor(body, "hills").kind === "hills" && B.landingFor(body, "treemap").kind === "treemap" && throwsWith(() => B.landingFor(body, "voxels"), /unknown landing kind/), "landingFor is the one door: hills, treemap, and a third word is refused by name");
    const L = B.landingRecords(t, 8);
    ok(L.records.length === 64 * G.RECORD_FLOATS && L.side === 8, "landingRecords over the treemap: the same 64 chunks gpuTerrain's ladder takes");
    let chunkOk = true;
    for (let c = 0; c < 64; c++) { const f = B.fileOfChunk(t, 8, c); const i = c % 8, j = Math.floor(c / 8); const cx = t.params.originX + (i + 0.5), cz = t.params.originZ + (j + 0.5);
        const want = t.fileAt(cx, cz); if ((f.file && f.file.path) !== (want && want.path)) chunkOk = false; }
    ok(chunkOk, "  and fileOfChunk names, for every chunk, the leaf under its centre");
}

// ---------------------------------------------------------------------------------------------------------
sec("3. ON BOTH BACKENDS: the treemap draws through gpuTerrain's pipeline, and a pick at a leaf lands on its chunk");
// ---------------------------------------------------------------------------------------------------------
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    // The six largest leaves whose centres sit clear of a chunk edge (a tenth of a chunk), so a pick's chunk is not a coin toss.
    // *** THE PICK IS FROM STRAIGHT ABOVE, AND WHAT THE FIRST RUNS FOUND WAS NOT THE VIEW. *** 0 of 6 picks landed on their
    // chunk from [0, 9, 9] and 1 of 6 from straight above -- and the reason was gpuTerrain's pick picture: drawn by gpuDriven's
    // DEFAULT pick pipeline, flat and scaled by the cull radius, so it was a sheet of oversized overlapping squares and
    // not the terrain. gpuTerrain.terrainPickPipelineDesc (v4479) picks with the terrain's own vertex stage. The view is
    // kept from above because a treemap is plateaus and cliffs, and from 45 degrees a taller landmass in front can stand
    // between the eye and a leaf behind it, which is a fact about occlusion and not about the pick.
    const clear = (v) => { const f = ((v + 4) / 8 * 8) % 1; return f > 0.1 && f < 0.9; };
    const biggest = t.leaves.slice().sort((a, b) => b.lines - a.lines).map((l) => { const p = t.peak(l.i); return { x: p.x, z: p.z, path: p.file.path }; })
        .filter((p) => clear(p.x) && clear(p.z)).slice(0, 6);
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 256, body, leaves: biggest }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const T = await import("/render/gpuTerrain.mjs"); const B = await import("/render/bodyTerrain.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const bt = B.landingFor(a.body, "treemap"); const L = B.landingRecords(bt, 8);
        // from straight above (a hair off the axis so lookAt's up is not parallel to the view): the whole 8-unit extent in a 0.3 fov at 40 units
        const eye = [0, 40, 0.01], viewProj = G.multiply(G.perspective(0.3, 1, 0.1, 100), G.lookAt(eye, [0, 0, 0]));
        const lods = () => [{ name: "coarse", mesh: T.skirtedQuadMesh(1) }, { name: "fine", mesh: T.skirtedQuadMesh(6) }];
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const tex = dev.texture({ width: bt.field.width, height: bt.field.height, data: bt.field.data, nearest: true });
            const sc = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: [0.02], records: L.records, pipeline: T.terrainPipelineDesc(), bind: (pass) => { pass.uniform("terrain", L.params); pass.uniform("light", new Float32Array(T.LIGHT)); pass.texture("heightTex", tex, 0); },
                                                   pickPipeline: T.terrainPickPipelineDesc(), pickBind: T.terrainPickBind(L.params, tex) });
            const f = sc.frame({ viewProj, eye, read: true, clear: [0, 0, 0, 1] }); const pix = await f.pixels;
            let lit = 0; for (let i = 0; i < pix.pixels.length; i += 4) if (pix.pixels[i] + pix.pixels[i + 1] > 0) lit++;
            const picks = [];
            for (const p of a.leaves) { const y = bt.heightAt(p.x, p.z) * bt.params.heightScale; const q = G.project(viewProj, [p.x, y, p.z]);
                const hit = await sc.pick((q[0] * 0.5 + 0.5) * a.N, (1 - (q[1] * 0.5 + 0.5)) * a.N);
                const want = Math.floor((p.x - bt.params.originX) / bt.params.extent * 8) + 8 * Math.floor((p.z - bt.params.originZ) / bt.params.extent * 8);
                picks.push({ path: p.path, hit: hit ? hit.id : null, want, file: hit ? (B.fileOfChunk(bt, 8, hit.id).file || {}).path : null }); }
            out[backend] = { backend: dev.backend, path: sc.path, lit, total: pix.pixels.length / 4, counts: await sc.readCounts(), picks };
            sc.destroy(); tex.destroy(); dev.destroy();
        }
        return out;
    }` });
    ok(r.ok && r.result && r.result.webgpu && r.result.webgl2, "the harness ran both backends", r.ok ? "" : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        for (const b of ["webgpu", "webgl2"]) {
            const R = r.result[b];
            ok(R.backend === b && R.lit > R.total * 0.1 && R.counts.reduce((x, y) => x + y, 0) > 0, `${b}: the treemap draws (${R.path}), chunks culled into the ladder`, `${R.lit} lit of ${R.total}, counts ${R.counts.join("/")}`);
            const onChunk = R.picks.filter((p) => p.hit === p.want).length;
            ok(onChunk === R.picks.length, `*** ${b}: a pick at each of the six largest leaves' centres lands on the chunk that contains it (${onChunk} of ${R.picks.length}) ***`, R.picks.map((p) => `${p.path.split("/").pop()} -> chunk ${p.hit} (${p.file ? p.file.split("/").pop() : "-"})`).join("; "));
        }
        ok(JSON.stringify(r.result.webgpu.picks.map((p) => p.hit)) === JSON.stringify(r.result.webgl2.picks.map((p) => p.hit)), "both backends pick the same chunks");
    }
}

// ---------------------------------------------------------------------------------------------------------
sec("4. THE PAGE: orrery-gpu.html lands on either ground, by a select, through landingFor");
// ---------------------------------------------------------------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "orrery-gpu.html"), "utf8");
    ok(/id="terrainKind"/.test(page) && /value="treemap"/.test(page) && /value="hills"/.test(page), "a select offers the hash hills and the treemap");
    ok(/landingFor\(b, document\.getElementById\("terrainKind"\)\.value\)/.test(page), "landOn lands through landingFor with the select's word");
    ok(/bt\.kind === "treemap"/.test(page), "and the HUD says which ground it is standing on");
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: the biomes and the water repoHeightfield also computes -- the field carries height alone until git terrain steps 2 and 3 put biome and blend in its other channels and colour them; and real line counts, which the bake does not carry (a line is 80 bytes here, measured).");
process.exit(fails ? 1 : 0);
