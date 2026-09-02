#!/usr/bin/env node
// WebGLEngine/tools/ship/gpuTerrain-selfcheck.mjs -- v4299 (Level 12)
//
// GRADES render/gpuTerrain.mjs: A HEIGHTFIELD LIFTED IN THE VERTEX STAGE OVER GPU-DRIVEN CHUNK INSTANCES.
//
// The instrument is the texel: each chunk paints its centre texel's height as a flat colour, so the pixel at a
// chunk's projected centre is a direct readout of which texel the vertex stage fetched, and the CPU model
// (heightAt) has to agree EXACTLY -- integer fetch on both sides, nothing filtered. Culling, LOD and the
// indirect counts are the Level 11 twin's; the two backends must agree per colour with edge-only differences.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl, parseBindings } from "../../render/wgslSpec.mjs";
import { checkHostUniforms } from "../../render/wgslLayout.mjs";
import * as G from "../../render/gpuDriven.mjs";
import * as T from "../../render/gpuTerrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const N = 192, H = 32, SIDE = 8;
const PARAMS = { originX: -8, originZ: -8, extent: 16, heightScale: 3 };
/** A deterministic field with structure at the chunk scale: a ridge, a basin and a plateau. */
const fieldFn = (u, v) => Math.max(0, Math.min(1, 0.5 + 0.35 * Math.sin(u * 9.1) * Math.cos(v * 6.3) + (u > 0.7 && v < 0.3 ? 0.4 : 0) - (Math.hypot(u - 0.3, v - 0.7) < 0.15 ? 0.4 : 0)));
const field = T.heightfield(H, H, fieldFn);
const records = T.chunkRecords(PARAMS, SIDE);
const CAM = { eye: [0, 26, 9], target: [0, 0, 0], fov: 1.0, near: 0.5, far: 200 };
const proj = G.perspective(CAM.fov, 1, CAM.near, CAM.far), view = G.lookAt(CAM.eye, CAM.target), viewProj = G.multiply(proj, view);
const lods = () => [{ name: "coarse", mesh: G.quadMesh(1) }, { name: "fine", mesh: G.quadMesh(8) }, { name: "mid", mesh: G.quadMesh(4) }];
const THRESHOLDS = [0.07, 0.11];

console.log("\n1. THE SHADERS, THE CONTRACT, THE MODEL");
{
    ok("TERRAIN_WGSL validates and declares the camera block and the height texture", validateWgsl(T.TERRAIN_WGSL).length === 0 && parseBindings(T.TERRAIN_WGSL).map((b) => b.name).join() === "cam,heightTex");
    ok("  the host uniform list matches struct Cam", checkHostUniforms(T.TERRAIN_WGSL, T.terrainPipelineDesc().uniforms).ok);
    ok("  the lift is an integer fetch on both languages", /textureLoad\(heightTex/.test(T.TERRAIN_WGSL) && /texelFetch\(heightTex/.test(T.TERRAIN_VERTEX_GLSL) && !/textureSample|texture\(/.test(T.TERRAIN_WGSL + T.TERRAIN_VERTEX_GLSL));
    ok("  the chunk colour is the CENTRE texel, flat, so a pixel names a texel", /texelAt\(rec\.x, rec\.z\)/.test(T.TERRAIN_WGSL) && /texelAt\(rec\.x, rec\.z\)/.test(T.TERRAIN_VERTEX_GLSL));
    ok("  v4300: both languages shade from the same central differences and the same light", /shadeAt/.test(T.TERRAIN_WGSL) && /shadeAt/.test(T.TERRAIN_VERTEX_GLSL) && T.terrainPipelineDesc().uniforms.some((u) => u.name === "light"));
    const r0 = records[3], half = PARAMS.extent / SIDE / 2;
    // the record lives in a Float32Array, so the inversion is checked to f32, not to ===
    ok("the record radius contains the chunk's corners at any height, and the shader can invert it", Math.abs(r0 - (half * Math.SQRT2 + PARAMS.heightScale / 2)) < 1e-6 && Math.abs((r0 - PARAMS.heightScale / 2) / T.RADIUS_PER_HALF - half) < 1e-6, `radius ${r0.toFixed(3)}, half ${half}`);
    ok("heightAt reads the field's own bytes, clamped at the edges", T.heightAt(field, PARAMS, -100, -100) === field.data[0] / 255 && T.heightAt(field, PARAMS, 100, 100) === field.data[(H * H - 1) * 4] / 255);
    const ranked = G.rankLods(lods(), THRESHOLDS);
    ok("  LOD 0 is the 8x8 chunk mesh, derived", ranked.lods[0].name === "fine" && ranked.lods[2].name === "coarse");
}

console.log("\n2. ON BOTH BACKENDS: EVERY VISIBLE CHUNK SHOWS ITS CENTRE TEXEL'S HEIGHT");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, H, SIDE, PARAMS, CAM, THRESHOLDS, field: { width: H, height: H, data: Array.from(field.data) } }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const T = await import("/render/gpuTerrain.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const records = T.chunkRecords(a.PARAMS, a.SIDE);
        const lods = () => [{ name: "coarse", mesh: G.quadMesh(1) }, { name: "fine", mesh: G.quadMesh(8) }, { name: "mid", mesh: G.quadMesh(4) }];
        const proj = G.perspective(a.CAM.fov, 1, a.CAM.near, a.CAM.far), view = G.lookAt(a.CAM.eye, a.CAM.target), viewProj = G.multiply(proj, view);
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
            const tex = dev.texture({ width: a.H, height: a.H, data: new Uint8Array(a.field.data), nearest: true });
            const params = T.terrainParams(a.PARAMS);
            const sc = G.makeGpuDrivenScene(dev, { lods: lods(), thresholds: a.THRESHOLDS, records, pipeline: T.terrainPipelineDesc(), bind: (pass) => { pass.uniform("terrain", params); pass.uniform("light", new Float32Array(T.LIGHT)); pass.texture("heightTex", tex, 0); } });
            const f = sc.frame({ viewProj, eye: a.CAM.eye, clear: [0, 0, 1, 1], read: true }); const p = await f.pixels;
            out[backend] = { backend: dev.backend, path: sc.path, counts: await sc.readCounts(), pixels: Array.from(p.pixels), order: sc.order.lods.map((l) => l.name) };
            sc.destroy(); dev.destroy();
        }
        return out;
    }` });
    ok("*** the terrain draws through gfx/device.js on both backends ***", r.ok, r.ok ? `${r.result.webgpu.path} | ${r.result.webgl2.path}` : r.reason);
    if (r.ok) {
        const W = r.result.webgpu, L = r.result.webgl2;
        const u = G.packCullUniforms({ planes: G.frustumPlanes(viewProj), eye: CAM.eye, thresholds: G.rankLods(lods(), THRESHOLDS).thresholds, count: SIDE * SIDE, lodCount: 3, cap: SIDE * SIDE });
        const twin = G.cullLodCpu(records, u);
        ok("the indirect counts are the twin's, and WebGL2 agrees", W.counts.join() === Array.from(twin.counts).join() && L.counts.join() === W.counts.join(), `gpu ${W.counts.join("/")} twin ${Array.from(twin.counts).join("/")}`);
        ok("CONTROL: the chunks land in more than one LOD and none are culled from this vantage", twin.counts.filter((c) => c > 0).length >= 2 && twin.visible === SIDE * SIDE);
        let right = 0, wrong = 0, sampled = 0; const bad = [];
        for (let i = 0; i < SIDE * SIDE; i++) {
            const cx = records[i * 4], cz = records[i * 4 + 2], h = T.heightAt(field, PARAMS, cx, cz);
            const p = G.project(viewProj, [cx, h * PARAMS.heightScale, cz]); if (Math.abs(p[0]) >= 0.98 || Math.abs(p[1]) >= 0.98) continue;
            sampled++;
            const px = Math.floor((p[0] * 0.5 + 0.5) * N), py = Math.floor((1 - (p[1] * 0.5 + 0.5)) * N), j = (py * N + px) * 4, want = Math.round(h * 255);
            if (W.pixels[j] === want && L.pixels[j] === want) right++; else { wrong++; if (bad.length < 3) bad.push(`chunk ${i} want ${want} got ${W.pixels[j]}/${L.pixels[j]}`); }
        }
        ok("*** at every chunk's projected centre the pixel IS the centre texel's height byte, on both backends ***", wrong === 0 && right > 0, `${right} right, ${wrong} wrong of ${sampled} sampled${bad.length ? " -- " + bad.join("; ") : ""}`);
        // v4300 -- and the GREEN channel is the shade the model computes from the same four neighbouring texels
        let shadeOk = 0, shadeBad = 0, worstShade = 0, shades = new Set();
        for (let i = 0; i < SIDE * SIDE; i++) {
            const cx = records[i * 4], cz = records[i * 4 + 2], h = T.heightAt(field, PARAMS, cx, cz);
            const p = G.project(viewProj, [cx, h * PARAMS.heightScale, cz]); if (Math.abs(p[0]) >= 0.98 || Math.abs(p[1]) >= 0.98) continue;
            const px = Math.floor((p[0] * 0.5 + 0.5) * N), py = Math.floor((1 - (p[1] * 0.5 + 0.5)) * N), j = (py * N + px) * 4;
            const [tx, tz] = T.texelOf(field, PARAMS, cx, cz), want = Math.round(T.shadeAtTexel(field, PARAMS, tx, tz, T.LIGHT) * 255); shades.add(want);
            const d = Math.max(Math.abs(W.pixels[j + 1] - want), Math.abs(L.pixels[j + 1] - want)); worstShade = Math.max(worstShade, d); if (d <= 1) shadeOk++; else shadeBad++;
        }
        ok("*** and the green channel is the model's lambert shade at that texel's normal, within one level, on both ***", shadeBad === 0 && shadeOk > 0, `${shadeOk} right, ${shadeBad} off by more than one, worst ${worstShade} of 255`);
        ok("CONTROL: the shades vary across the ground (a flat field would shade evenly)", shades.size > 8, `${shades.size} distinct shades`);
        const hist = (P) => { const c = {}; for (let i = 0; i < P.length; i += 4) { const k = P[i] + "," + P[i + 1] + "," + P[i + 2]; c[k] = (c[k] || 0) + 1; } return c; };
        const hw = hist(W.pixels), hl = hist(L.pixels), keys = [...new Set([...Object.keys(hw), ...Object.keys(hl)])];
        let worst = 0; for (const k of keys) worst = Math.max(worst, Math.abs((hw[k] || 0) - (hl[k] || 0)));
        ok("  the two backends agree per colour to within edge pixels", worst <= N, `largest per-colour count difference ${worst} of ${N * N}`);
        ok("CONTROL: the ground has many heights and the sky is still blue somewhere", keys.length > 10 && (hw["0,0,255"] || 0) > 0 && (hl["0,0,255"] || 0) > 0, `${keys.length} colours`);
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

// =============================================================================================================
// SABOTAGE LOG -- each applied, gate run, exit code read, restored. MEASURED at Level 12.
//   A  the WGSL colour texel shifted by one column -> exit=1, 2 red: 62 of 64 chunk centres read the wrong byte
//      on WebGPU while WebGL2 reads the right one (want 179, got 193/179), and the per-colour histograms part by
//      421 pixels. Two chunks whose neighbour texel happens to match stay right -- and the gate says 62, not 64.
//   B  the GLSL lift dropped (y = 0) -> exit=1, 2 red: 9 centres now project somewhere else on WebGL2 (got 179/0:
//      the WebGPU pixel right, the WebGL2 one reading sky), and the histograms part by 1,398 pixels. 55 of 64
//      still land on their own chunk from this vantage, which is why the cross-backend line is needed too.
console.log("\n3. THE SEAM: A FINE CHUNK BESIDE A COARSE ONE CRACKS, AND A SKIRT CLOSES IT");
{
    const m = T.skirtedQuadMesh(4);
    ok("a skirted 4x4 chunk has its 25 surface vertices plus 20 skirt vertices, and 64 more triangles", m.positions.length / 3 === 45 && m.indices.length / 3 === 32 + 64 && m.skirt === true && m.indices.every((i) => i < 45), `${m.positions.length / 3} vertices, ${m.indices.length / 3} triangles`);
    ok("  every skirt vertex hangs the full height range below an edge vertex it copies", (() => { for (let i = 25; i < 45; i++) { const x = m.positions[i * 3], y = m.positions[i * 3 + 1], z = m.positions[i * 3 + 2]; if (z !== -1 || (Math.abs(x) !== 1 && Math.abs(y) !== 1)) return false; } return true; })());
    ok("  the surface vertices are the plain quad's", (() => { const q = G.quadMesh(4); for (let i = 0; i < 75; i++) if (q.positions[i] !== m.positions[i]) return false; return true; })());
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    // A real LOD crack: the field CURVES ALONG THE SEAM (z), so the fine chunk's edge is a texel staircase and
    // the coarse chunk's edge is one straight line between its two corner texels. Between them is a sliver with
    // nothing in it. Seen from ABOVE THE LOW SIDE looking at the high edge, a ray through the sliver passes under
    // the coarse chunk -- whose underside is CULLED (terrainPipelineDesc: cull back, front cw) -- and out to the
    // sky. Without culling the underside would show and no crack could ever be seen, which is what Level 13's first
    // three drafts of this section measured (0 sky pixels from below, from the side, across a cliff) before the
    // device learned cull modes. A skirt hanging from the high edge covers the sliver.
    const W2 = 16, slope = T.heightfield(W2, W2, (u, v) => 0.5 + 0.4 * Math.sin(v * 9));   // curved along the seam: a line cannot follow it
    const P2 = { originX: -4, originZ: -4, extent: 8, heightScale: 3 };
    const C2 = { eye: [-3.5, 3.2, 0], target: [0, 1.2, 0], fov: 0.9, near: 0.2, far: 100 };
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, P2, C2, field: { width: W2, height: W2, data: Array.from(slope.data) } }, script: `async (a) => {
        const G = await import("/render/gpuDriven.mjs"); const T = await import("/render/gpuTerrain.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const proj = G.perspective(a.C2.fov, 1, a.C2.near, a.C2.far), view = G.lookAt(a.C2.eye, a.C2.target), viewProj = G.multiply(proj, view);
        const half = 2, records = new Float32Array([-2, 0, 0, half * T.RADIUS_PER_HALF + a.P2.heightScale / 2, 2, 0, 0, half * T.RADIUS_PER_HALF + a.P2.heightScale / 2]);
        const out = {};
        for (const skirt of [false, true]) {
            const cv = document.createElement("canvas"); cv.width = a.N; cv.height = a.N;
            const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const tex = dev.texture({ width: a.field.width, height: a.field.height, data: new Uint8Array(a.field.data), nearest: true });
            const mk = (n, c) => skirt ? T.skirtedQuadMesh(n, c) : G.quadMesh(n, c);
            const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "coarse", mesh: mk(1) }, { name: "fine", mesh: mk(8) }], thresholds: [0.7], records, pipeline: T.terrainPipelineDesc(), bind: (pass) => { pass.uniform("terrain", T.terrainParams(a.P2)); pass.uniform("light", new Float32Array(T.LIGHT)); pass.texture("heightTex", tex, 0); } });
            const f = sc.frame({ viewProj, eye: a.C2.eye, clear: [0, 0, 1, 1], read: true }); const p = await f.pixels;
            out[String(skirt)] = { pixels: Array.from(p.pixels), counts: await sc.readCounts() };
            sc.destroy(); dev.destroy();
        }
        return out;
    }` });
    ok("*** the seam scene renders with and without skirts ***", r.ok, r.ok ? "" : r.reason);
    if (r.ok) {
        const A = r.result["false"], B = r.result["true"];
        ok("CONTROL: the two chunks land in different LODs", A.counts.join() === "1,1" && B.counts.join() === "1,1", `counts ${A.counts.join("/")}`);
        const proj = G.perspective(C2.fov, 1, C2.near, C2.far), view = G.lookAt(C2.eye, C2.target), viewProj = G.multiply(proj, view);
        // the two edges at x = 0: the fine one is piecewise-linear through 9 texel samples, the coarse one a line
        const hAt = (z) => T.heightAt(slope, P2, 0, z) * P2.heightScale;
        const fine = (z) => { const t = (z + 2) / 4 * 8, i = Math.max(0, Math.min(7, Math.floor(t))), f = t - i; return hAt(-2 + i * 0.5) * (1 - f) + hAt(-2 + (i + 1) * 0.5) * f; };
        const coarse = (z) => { const f = (z + 2) / 4; return hAt(-2) * (1 - f) + hAt(2) * f; };
        const toPx = (w) => { const q = G.project(viewProj, w); return [(q[0] * 0.5 + 0.5) * N, (1 - (q[1] * 0.5 + 0.5)) * N]; };
        const sky = (P) => { let n = 0, seen = new Set(); for (let z = -1.9; z < 1.9; z += 0.02) { const a = fine(z), b = coarse(z); if (Math.abs(a - b) < 0.03) continue;
            const p0 = toPx([0, Math.min(a, b), z]), p1 = toPx([0, Math.max(a, b), z]); const steps = Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
            for (let k = 1; k < steps; k++) { const x = Math.floor(p0[0] + (p1[0] - p0[0]) * k / steps), y = Math.floor(p0[1] + (p1[1] - p0[1]) * k / steps); const key = y * N + x; if (seen.has(key) || x < 0 || y < 0 || x >= N || y >= N) continue; seen.add(key);
                const i = key * 4; if (P[i] === 0 && P[i + 1] === 0 && P[i + 2] === 255) n++; } } return n; };
        ok("*** without skirts the sky shows through the crack between the fine and the coarse edge ***", sky(A.pixels) > 0, `${sky(A.pixels)} sky pixels in the sliver`);
        ok("*** with skirts, none ***", sky(B.pixels) === 0, `${sky(B.pixels)} sky pixels in the sliver`);
        const centre = (P, x, z) => { const h = T.heightAt(slope, P2, x, z), q = G.project(viewProj, [x, h * P2.heightScale, z]); const px = Math.floor((q[0] * 0.5 + 0.5) * N), py = Math.floor((1 - (q[1] * 0.5 + 0.5)) * N); return [P[(py * N + px) * 4], Math.round(h * 255)]; };
        // the left chunk's centre is under the camera and off screen from this vantage; the right one is in view
        const cr = centre(B.pixels, 2, 0);
        ok("  and the coarse surface still reads its centre texel with skirts on", cr[0] === cr[1], `right ${cr.join("=")}`);
    }
    if (r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
}

//   D  (v4300) the normal's x flipped in the WGSL only -> exit=1, 2 red: 62 of 64 shades off, worst 117 of 255,
//      and the backends part by 252 pixels per colour because GLSL still lights the right way. One language
//      wrong is exactly the drift the two-language gate exists to catch.
//   C  (Level 13) skirt vertices left at z = 0 (a skirt that hangs nowhere) -> exit=1, 3 red: the mesh check, the
//      seam still showing 10,266 sky pixels with "skirts" on, and the coarse surface's centre reading sky (0)
//      because a flat skirt is drawn ON the surface and wins the depth tie.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the LIFTED SILHOUETTE. The colour proves which texel each chunk's centre fetched; that " +
    "the other vertices rose by their own texels is proved only through the two backends agreeing per colour, " +
    "not against a CPU rasteriser. Chunk seams: Level 13 closed them with skirts (section 3) rather than stitching, " +
    "so a skirt is drawn even where no crack is -- the price of chunks that need not know their neighbours.");
process.exit(fails ? 1 : 0);
