#!/usr/bin/env node
// WebGLEngine/tools/ship/gpuPick-selfcheck.mjs -- v4299 (Level 13)
//
// GRADES PICKING ON THE GPU-DRIVEN PATH: the compacted record carries its input index through the cull, a pick
// pipeline draws identity instead of colour into an OFFSCREEN target, and one pixel names what is under the
// cursor -- with the depth test deciding what is in front, exactly as it does for the colour picture.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import * as G from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const N = 160, CAM = { eye: [0, 0, 6], target: [0, 0, 0], fov: Math.PI / 3, near: 0.1, far: 100 };
const viewProj = G.multiply(G.perspective(CAM.fov, 1, CAM.near, CAM.far), G.lookAt(CAM.eye, CAM.target));
// the grid, plus one big near body (index 256) that covers instance 119's centre from this vantage
const grid = G.gridScene({}), records = new Float32Array(grid.length + 4); records.set(grid); records.set([-0.5, -0.5, 0.5, 0.9], grid.length);
const COUNT = records.length / 4;

console.log("\n1. IDENTITY SURVIVES COMPACTION");
{
    ok("the pick shader validates in WGSL", validateWgsl(G.PICK_WGSL).length === 0);
    ok("  the pick pipeline shares the colour pipeline's buffers and uniform", JSON.stringify(G.pickPipelineDesc().buffers) === JSON.stringify(G.renderPipelineDesc().buffers) && G.pickPipelineDesc().uniforms[0].name === "viewProj");
    ok("  a compacted record is 8 floats: the input record, then id and lod", G.OUT_RECORD_FLOATS === 8 && G.RECORD_BYTES === 32);
    const u = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: [0.04, 0.025], count: COUNT, lodCount: 3, cap: COUNT });
    const twin = G.cullLodCpu(records, u);
    let idsOk = true; for (let l = 0; l < 3; l++) for (let s = 0; s < twin.counts[l]; s++) { const o = (l * COUNT + s) * 8; if (twin.compact[o + 4] !== twin.ids[l][s] || twin.compact[o + 5] !== l) idsOk = false; }
    ok("the twin writes the input index and the LOD into every compacted record", idsOk);
    ok("decodePick reads back what the shader encodes, and null for background", JSON.stringify(G.decodePick(new Uint8Array([0x34, 0x12, 2, 255]), 0)) === JSON.stringify({ id: 0x1234, lod: 2 }) && G.decodePick(new Uint8Array([9, 9, 9, 0]), 0) === null);
}

console.log("\n2. PICK EVERY VISIBLE BODY AT ITS CENTRE, ON BOTH BACKENDS");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, CAM, records: Array.from(records) }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = new Float32Array(a.records), count = records.length / 4;
        const lods = () => [{ name: "mid", mesh: G.quadMesh(2, [0, 1, 0, 1]) }, { name: "coarse", mesh: G.quadMesh(1, [0, 0, 1, 1]) }, { name: "fine", mesh: G.quadMesh(4, [1, 0, 0, 1]) }];
        const viewProj = G.multiply(G.perspective(a.CAM.fov, 1, a.CAM.near, a.CAM.far), G.lookAt(a.CAM.eye, a.CAM.target));
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const sc = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: [0.025, 0.04], records });
            const before = await sc.frame({ viewProj, eye: a.CAM.eye, read: true }).pixels;
            const picks = [];
            for (let i = 0; i < count; i++) { const p = G.project(viewProj, [records[i * 4], records[i * 4 + 1], records[i * 4 + 2]]); if (Math.abs(p[0]) >= 1 || Math.abs(p[1]) >= 1) { picks.push(null); continue; }
                picks.push(await sc.pick((p[0] * 0.5 + 0.5) * a.N, (1 - (p[1] * 0.5 + 0.5)) * a.N)); }
            // a gap between four grid bodies, well away from the big near one: (3, 3, -2) is the midpoint of a cell
            const gap = G.project(viewProj, [3, 3, -2]);
            const corner = await sc.pick((gap[0] * 0.5 + 0.5) * a.N, (1 - (gap[1] * 0.5 + 0.5)) * a.N);
            const after = await sc.frame({ viewProj, eye: a.CAM.eye, read: true }).pixels;
            let changed = 0; for (let i = 0; i < before.pixels.length; i++) if (before.pixels[i] !== after.pixels[i]) changed++;
            out[backend] = { backend: dev.backend, picks, corner, changed, counts: await sc.readCounts() };
            sc.destroy(); dev.destroy();
        }
        return out;
    }` });
    ok("*** both backends pick ***", r.ok, r.ok ? "" : r.reason);
    if (r.ok) {
        const u = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: [0.04, 0.025], count: COUNT, lodCount: 3, cap: COUNT });
        const ranked = G.rankLods([{ name: "mid", mesh: G.quadMesh(2) }, { name: "coarse", mesh: G.quadMesh(1) }, { name: "fine", mesh: G.quadMesh(4) }], [0.025, 0.04]);
        for (const b of ["webgpu", "webgl2"]) {
            const P = r.result[b].picks; let right = 0, wrong = 0, covered = 0, sampled = 0; const bad = [];
            for (let i = 0; i < COUNT; i++) { if (!P[i] && P[i] !== null) continue; const lod = G.cullLodCpuOne([records[i * 4], records[i * 4 + 1], records[i * 4 + 2], records[i * 4 + 3]], u); if (lod < 0 || P[i] === null) continue;
                sampled++; if (P[i] && P[i].id === i && P[i].lod === lod) right++; else if (P[i] && P[i].id === COUNT - 1 && i !== COUNT - 1) covered++; else { wrong++; if (bad.length < 3) bad.push(`${i}->${JSON.stringify(P[i])} want lod ${lod}`); } }
            ok(`*** ${b}: every visible body picks as ITSELF with its LOD, except those the big near body covers ***`, wrong === 0 && right > 50, `${right} right, ${covered} covered by body ${COUNT - 1}, ${wrong} wrong of ${sampled}${bad.length ? " -- " + bad.join("; ") : ""}`);
            ok(`  ${b}: the covered centres pick the NEAR body -- depth decides, as for colour`, covered > 0 && P[COUNT - 1] && P[COUNT - 1].id === COUNT - 1, `${covered} covered`);
            ok(`  ${b}: the gap between four bodies picks nothing`, r.result[b].corner === null, JSON.stringify(r.result[b].corner));
            ok(`  ${b}: picking left the presented picture untouched`, r.result[b].changed === 0, `${r.result[b].changed} pixels changed across a pick`);
        }
        ok("CONTROL: the LOD ranking the pick reports is the derived one", ranked.lods.map((l) => l.name).join() === "fine,mid,coarse");
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

// =============================================================================================================
// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at Level 13.
//   A  the id's two bytes swapped in the pick shader -> exit=1, 2 red: 101 of 101 picks wrong (body 51 reads as
//      13,056), and the covered centres name nothing recognisable. WebGL2 stays green, since only the WGSL moved,
//      which is why each backend is graded on its own line.
//   0  (found, not planted) `meta` as an attribute name: a reserved word in WGSL, caught by Level 11's compile
//      watcher as "'meta' is a reserved keyword" at the first use() -- the second time that word cost a frame.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a pick during a two-phase frame draws both phases' records and is graded only through " +
    "the single-phase scene; and ids above 65,535, which the two-byte encoding cannot carry (the universe has 694 " +
    "systems and a few thousand bodies, well under it).");
process.exit(fails ? 1 : 0);
