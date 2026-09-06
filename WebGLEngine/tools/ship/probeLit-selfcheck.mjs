#!/usr/bin/env node
// WebGLEngine/tools/ship/probeLit-selfcheck.mjs -- v4514
//
// THE PROBE VOLUME ON THE DEVICE (Probes 1): render/probeLit.mjs, both backends. Section 1, headless: the atlas layout by
// index (texel (x, (p * nz + z) * ny + y) is the packed float rounded to half, spelled out on a hand grid); halfGrid within a
// half-ULP of the bake; the pipeline description's slots and four uniforms; the WGSL validates; both fragment stages spell
// the same lobe factors, the same basis constants and the same row formula. Section 2, ON BOTH BACKENDS, a unit-radius
// sphere drawn through makeGpuDrivenScene with the probe-lit pipeline under FOUR bakes -- (a) a radiance equal to the
// position, so the pixel is the hit point itself and the trilinear sample and the grid mapping are what is graded; (b) a
// two-tone sky the same at every probe (warm above, cool below), so the basis and the lobe are what is graded; (c) the
// v4513 splat source over a two-tone shell of 300 splats around the sphere; (d) a quadrupole, bright at both poles and dark
// at the equator, even in every axis so only orders 0 and 2 survive -- and for every pixel whose ray hits the
// sphere 1.5 px inside the limb, the twin: splatProbes.shadeAt on the SAME halves the texture holds, at the hit point with
// the sphere's normal. Held per channel: the mean error under 2.5 of 255 and 98 % of pixels within 12, on each backend;
// the two backends within 8 on 97 %. Interpolated per-vertex normals on a subdiv-3 icosphere and the half-float atlas
// are the slack, and they are said.
//
// MEASURED AT v4514 (a 0.9 sphere at distance 5, 160 x 160, 1,788 keyed pixels): mean error 0.20 / 0.11 / 0.06 / 0.07 of 255 on the
// four bakes with a worst of 1, identical on both backends (0 pixels apart); the two-tone sky draws top r 229 b 51 against
// bottom r 51 b 229; the shell draws top r 254 b 27 against bottom r 26 b 254; the quadrupole draws both poles r 102 and the
// equator r 64; the halves read the bake back within 3.7e-4 relative; the shell bake is 9 x 9 x 9 probes in 0.5 s. THE
// FINDING: the first three bakes are ODD in y or constant in direction, so no order-2 term reached a pixel and the pi / 4
// lobe sabotage went red on the text check alone; the quadrupole bake was added for it and it goes red on the pixels now.
//
// SABOTAGE (v4514): A  the atlas row formula (z * 7 + p) instead of (p * nz + z), both languages   -> 9 red: the text hold, all six pixel
//                                                                                                       holds (mean 158), both pictures black.
//                   B  the trilinear select swapped (f for 1 - f on the low probe), both languages   -> 4 red: bakes A and C on both backends
//                                                                                                       (mean 11, worst 64); B and D are the
//                                                                                                       same at every probe and cannot see it.
//                   C  the order-2 lobe factor pi / 3 instead of pi / 4, both languages               -> 1 RED THE FIRST TIME, the text hold
//                                                                                                       only; with the quadrupole bake 3 red
//                                                                                                       (mean 3.9, worst 10 on D).
//                   D  the y basis sign flipped in the fragment, both languages                       -> 7 red: the text hold, bakes B and C on
//                                                                                                       both backends, both pictures inverted.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/probeLit-selfcheck.mjs      (~25 s: the shell bake and six frames)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { probeAtlas, halfGrid, probeLitPipelineDesc, probeUniforms, PROBE_LIT_WGSL, PROBE_LIT_FRAGMENT_GLSL, PROBE_LIT_VERTEX_GLSL } from "../../render/probeLit.mjs";
import { probeGrid, bakeProbes, packProbes, sampleProbes, shadeAt, cloudBounds, splatRadiance, PLANES } from "../../render/splatProbes.mjs";
import { sphereCloud } from "../../physics/splat/splatMesh.mjs";
import { fromHalf, toHalf } from "../../text/slugAtlas.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

// ---------------------------------------------------------------------------------------------------------------------------------
sec("1. headless: the atlas, the halves, the pipeline, the two stages");
{
    const g = probeGrid({ min: [0, 0, 0], max: [1, 0.5, 1.5] }, 0.5);   // 3 x 2 x 4
    bakeProbes(g, (p, d) => [p[0] + 0.3 * d[0], p[1] + 0.2 * d[1] + 0.1, p[2] + 0.1 * d[2]], 8);
    const packed = packProbes(g), atlas = probeAtlas(packed), [nx, ny, nz] = g.counts;
    ok("the atlas is nx wide and PLANES * nz * ny tall", atlas.width === nx && atlas.height === PLANES * nz * ny && atlas.data.length === atlas.width * atlas.height * 4, `${atlas.width} x ${atlas.height}`);
    let bad = 0;
    for (let p = 0; p < PLANES; p++) for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const row = (p * nz + z) * ny + y, i = (z * ny + y) * nx + x;
        for (let k = 0; k < 4; k++) if (atlas.data[(row * nx + x) * 4 + k] !== toHalf(packed.data[p * nx * ny * nz * 4 + i * 4 + k])) bad++;
    }
    ok("texel (x, (p * nz + z) * ny + y) is the packed float of probe (x, y, z) on plane p, rounded to half, every texel", bad === 0, `${bad} wrong`);
    const hg = halfGrid(packed); let worstRel = 0;
    for (let i = 0; i < g.total; i++) for (let s = 0; s < 9; s++) for (let c = 0; c < 3; c++) { const a = g.coefficients[i][s][c], b = hg.coefficients[i][s][c]; const rel = Math.abs(a - b) / Math.max(1e-3, Math.abs(a)); if (rel > worstRel) worstRel = rel; }
    ok("halfGrid reads the bake back within a half-float ULP (relative 1e-3)", worstRel < 1e-3 && hg.total === g.total, `worst relative ${worstRel.toExponential(2)}`);
    ok("halfGrid's coefficients are exactly fromHalf(toHalf(coefficient))", hg.coefficients.every((cc, i) => cc.every((t, s) => t.every((v, c) => v === fromHalf(toHalf(g.coefficients[i][s][c]))))));
    const desc = probeLitPipelineDesc();
    ok("probeLitPipelineDesc: the lit layout's slots, the normal at location 4, and viewProj + probeMin + probeStep + probeCounts", desc.buffers[0].stride === 40 && desc.buffers[0].attributes.some((a) => a.name === "n" && a.location === 4) && desc.uniforms.map((u) => u.name).join() === "viewProj,probeMin,probeStep,probeCounts");
    const u = probeUniforms(packed);
    ok("probeUniforms carries min, step and counts as vec4s", u.probeMin.length === 4 && u.probeMin[2] === 0 && u.probeStep[0] === 0.5 && u.probeCounts.join() === "3,2,4,0");
    const v = validateWgsl(PROBE_LIT_WGSL);
    ok("PROBE_LIT_WGSL validates, declares the atlas at binding 1 and no sampler", v.length === 0 && /@binding\(1\) var tProbes: texture_2d<f32>/.test(PROBE_LIT_WGSL) && !/sampler/.test(PROBE_LIT_WGSL), v.join("; "));
    const same = (re) => re.test(PROBE_LIT_WGSL) && re.test(PROBE_LIT_FRAGMENT_GLSL);
    ok("both fragment stages spell the lobe factors pi, 2 pi / 3 and pi / 4", same(/A0 = 3\.141592653589793/) && same(/A1 = 2\.0943951023931953/) && same(/A2 = 0\.7853981633974483/));
    ok("both spell the basis constants and the tree's signs (-c1 y, +c1 z, -c1 x)", same(/c0 = 0\.28209479177387814/) && same(/c1 = 0\.4886025119029199/) && same(/\(A1 \* -c1 \* d\.y\)/) && same(/\(A1 \* c1 \* d\.z\)/) && same(/\(A1 \* -c1 \* d\.x\)/));
    ok("both spell the row (p * nz + z) * ny + y and read seven planes by integer texel", same(/\(p \* nz \+ z\) \* ny \+ y/) && /textureLoad\(tProbes/.test(PROBE_LIT_WGSL) && /texelFetch\(tProbes/.test(PROBE_LIT_FRAGMENT_GLSL) && same(/p < 7/));
    ok("the vertex stage is litSphere's own", PROBE_LIT_VERTEX_GLSL.includes("vN = n; vW = w;") && /rec\.xyz \+ p \* rec\.w/.test(PROBE_LIT_WGSL));
}

// ---------------------------------------------------------------------------------------------------------------------------------
sec("2. ON BOTH BACKENDS: a sphere lit by three probe volumes against splatProbes.shadeAt on the same halves");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const W = 160, RAD = 0.9, DIST = 5, FOV = Math.PI / 3, SPACING = 0.5;
        const gA = probeGrid({ min: [-1, -1, -1], max: [1, 1, 1] }, SPACING); bakeProbes(gA, (p) => [(p[0] + 1) / 2, (p[1] + 1) / 2, (p[2] + 1) / 2], 8);
        const gB = probeGrid({ min: [-1, -1, -1], max: [1, 1, 1] }, SPACING); bakeProbes(gB, (p, d) => (d[1] > 0 ? [1, 0.5, 0.1] : [0.1, 0.5, 1]), 16);
        const cloud = sphereCloud({ n: 300, radius: 1.6, scale: 0.25, opacity: 1 }), colours = new Float32Array(cloud.count * 3);
        for (let i = 0; i < cloud.count; i++) { const up = cloud.positions[i * 3 + 1] > 0; colours[i * 3] = up ? 1 : 0.1; colours[i * 3 + 1] = 0.5; colours[i * 3 + 2] = up ? 0.1 : 1; }
        const t0 = Date.now(), gC = probeGrid(cloudBounds(cloud, 0.3), SPACING); bakeProbes(gC, splatRadiance(cloud, colours, [0.2, 0.2, 0.2]), 8);
        // D: a QUADRUPOLE -- bright at both poles, dark at the equator -- is even in every axis, so its projection is order 0 and
        // order 2 and nothing else; it is the bake that puts the pi / 4 lobe factor on the pixels (sabotage C was blind without it)
        const gD = probeGrid({ min: [-1, -1, -1], max: [1, 1, 1] }, SPACING); bakeProbes(gD, (p, d) => [d[1] * d[1], 0.5 * d[1] * d[1], 1 - d[1] * d[1]], 16);
        report(`bakes: A ${gA.counts.join(" x ")} (position), B ${gB.counts.join(" x ")} (two-tone sky), C ${gC.counts.join(" x ")} over 300 splats in ${Date.now() - t0} ms, D ${gD.counts.join(" x ")} (quadrupole)`);
        const sets = [gA, gB, gC, gD].map((g) => { const packed = packProbes(g); return { packed: { ...packed, data: Array.from(packed.data) }, half: halfGrid(packed) }; });
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, RAD, DIST, FOV, packs: sets.map((s) => s.packed) }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const G = await import("/render/gpuDriven.mjs");
            const L = await import("/render/litSphere.mjs");
            const P = await import("/render/probeLit.mjs");
            const { W, RAD, DIST, FOV, packs } = a; const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = W;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const o = { backend: dev.backend, frames: [], errs };
                const eye = [0, 0, DIST];
                const cam = { viewProj: G.multiply(G.perspective(FOV, 1, 0.1, 100), G.lookAt(eye, [0, 0, 0])), eye };
                for (const pk of packs) {
                    const packed = { ...pk, data: Float32Array.from(pk.data) }, tex = P.uploadProbes(dev, packed);
                    const extras = new Float32Array(G.EXTRA_FLOATS);
                    const sc = G.makeGpuDrivenScene(dev, { lods: [{ name: "only", mesh: L.sphereMesh(3, [1, 1, 1, 1]) }], thresholds: [], records: Float32Array.from([0, 0, 0, RAD]), layout: G.LAYOUTS.lit, pipeline: P.probeLitPipelineDesc(), bind: P.probeBind(packed, tex), headings: { cpu: () => extras } });
                    const f = await sc.frame({ ...cam, read: true, clear: [0, 0, 0, 1] }).pixels;
                    o.frames.push({ pixels: Array.from(f.pixels), path: sc.path });
                }
                dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("both backends built the probe-lit pipeline and drew the four spheres", r.ok && r.result && r.result.webgpu && r.result.webgl2 && r.result.webgpu.frames.length === 4 && r.result.webgl2.frames.length === 4 && r.result.webgpu.errs.length === 0, r.ok ? (r.result.webgpu.errs || []).join(" | ").slice(0, 300) : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.webgpu.frames.length === 4) {
            const t = Math.tan(FOV / 2), eye = [0, 0, DIST], limbPx = (W / 2) * (RAD / (DIST * t)) / Math.sqrt(1 - (RAD / DIST) ** 2);
            const hits = [];
            for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
                const rx = x + 0.5 - W / 2, ry = y + 0.5 - W / 2; if (Math.hypot(rx, ry) > limbPx - 1.5) continue;
                const d = [rx / (W / 2) * t, -ry / (W / 2) * t, -1], dl = Math.hypot(d[0], d[1], d[2]); d[0] /= dl; d[1] /= dl; d[2] /= dl;
                const b = 2 * (eye[2] * d[2]), c = eye[2] * eye[2] - RAD * RAD, disc = b * b - 4 * c; if (disc < 0) continue;
                const s = (-b - Math.sqrt(disc)) / 2, hit = [eye[0] + s * d[0], eye[1] + s * d[1], eye[2] + s * d[2]];
                hits.push({ px: y * W + x, hit, nrm: [hit[0] / RAD, hit[1] / RAD, hit[2] / RAD] });
            }
            const names = ["A position", "B two-tone sky", "C splat shell", "D quadrupole"];
            for (let k = 0; k < 4; k++) {
                const half = sets[k].half;
                const want = hits.map((h) => { const s = k === 0 ? [(h.hit[0] + 1) / 2, (h.hit[1] + 1) / 2, (h.hit[2] + 1) / 2] : shadeAt(half, h.hit, h.nrm); return s.map((v) => Math.round(255 * Math.min(1, Math.max(0, v)))); });
                if (k === 0) { const s0 = shadeAt(half, hits[0].hit, hits[0].nrm), e0 = (hits[0].hit[0] + 1) / 2; ok("  bake A's twin: shadeAt of the position bake is the position (the two keys agree)", Math.abs(s0[0] - e0) < 2e-3, `${s0[0].toFixed(4)} vs ${e0.toFixed(4)}`); }
                for (const bk of ["webgpu", "webgl2"]) {
                    const f = r.result[bk].frames[k], px = f.pixels; let sum = 0, n = 0, within = 0, worst = 0;
                    for (let i = 0; i < hits.length; i++) for (let c = 0; c < 3; c++) { const e = Math.abs(px[hits[i].px * 4 + c] - want[i][c]); sum += e; n++; if (e <= 12) within++; if (e > worst) worst = e; }
                    const mean = sum / n;
                    report(`${bk} (${f.path}) ${names[k]}: ${hits.length} pixels, mean error ${mean.toFixed(2)} of 255, worst ${worst}, ${(100 * within / n).toFixed(1)} % within 12`);
                    ok(`*** ${bk} ${names[k]}: the sphere's pixels are shadeAt on the same halves -- mean under 2.5 of 255, 98 % within 12 ***`, mean < 2.5 && within / n > 0.98 && hits.length > 1000);
                }
                let po = 0; const A = r.result.webgpu.frames[k].pixels, B = r.result.webgl2.frames[k].pixels; for (const h of hits) if (Math.abs(A[h.px * 4] - B[h.px * 4]) > 8 || Math.abs(A[h.px * 4 + 1] - B[h.px * 4 + 1]) > 8 || Math.abs(A[h.px * 4 + 2] - B[h.px * 4 + 2]) > 8) po++;
                ok(`  ${names[k]}: the two backends agree within 8 of 255 on 97 % of the sphere`, po < hits.length * 0.03, `${po} apart`);
            }
            const B = r.result.webgpu.frames[1].pixels, top = hits.filter((h) => h.nrm[1] > 0.7), bot = hits.filter((h) => h.nrm[1] < -0.7);
            const avg = (list, c) => list.reduce((s, h) => s + B[h.px * 4 + c], 0) / list.length;
            ok("  bake B on the picture: the sphere's top is warm and its underside cool", avg(top, 0) > avg(bot, 0) + 60 && avg(bot, 2) > avg(top, 2) + 60, `top r ${avg(top, 0).toFixed(0)} b ${avg(top, 2).toFixed(0)}; bottom r ${avg(bot, 0).toFixed(0)} b ${avg(bot, 2).toFixed(0)}`);
            const C = r.result.webgpu.frames[2].pixels, avgC = (list, c) => list.reduce((s, h) => s + C[h.px * 4 + c], 0) / list.length;
            ok("  bake C on the picture: inside the two-tone shell the top reads redder than the underside and the underside bluer", avgC(top, 0) > avgC(bot, 0) + 20 && avgC(bot, 2) > avgC(top, 2) + 20, `top r ${avgC(top, 0).toFixed(0)} b ${avgC(top, 2).toFixed(0)}; bottom r ${avgC(bot, 0).toFixed(0)} b ${avgC(bot, 2).toFixed(0)}`);
            const D = r.result.webgpu.frames[3].pixels, eq = hits.filter((h) => Math.abs(h.nrm[1]) < 0.15), avgD = (list, c) => list.reduce((s, h) => s + D[h.px * 4 + c], 0) / list.length;
            ok("  bake D on the picture: the quadrupole lights both poles alike and the equator less, in red; the reverse in blue", Math.abs(avgD(top, 0) - avgD(bot, 0)) < 12 && avgD(top, 0) > avgD(eq, 0) + 25 && avgD(eq, 2) > avgD(top, 2) + 25, `poles r ${avgD(top, 0).toFixed(0)} / ${avgD(bot, 0).toFixed(0)}, equator r ${avgD(eq, 0).toFixed(0)} b ${avgD(eq, 2).toFixed(0)}, pole b ${avgD(top, 2).toFixed(0)}`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
        if (r && r.result && r.result.webgl2 && r.result.webgl2.errs && r.result.webgl2.errs.length) report("webgl2 errors: " + r.result.webgl2.errs.join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a page (Probes 3); the occupancy fit (Probes 2); a float32 atlas (the device's float format is rgba16float, and the twin reads the same halves).");
process.exit(fails ? 1 : 0);
