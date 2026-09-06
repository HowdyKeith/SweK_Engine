#!/usr/bin/env node
// WebGLEngine/tools/ship/asciiShape-selfcheck.mjs -- v4505
//
// SHAPE-AWARE ASCII (task 51): render/asciiShape.mjs, after edoardolunardi/ascii-logo (MIT). Section 1, headless: the 95 glyphs by
// index; the table DERIVED from the vendored Plex through slugRender with every column peaking at 1, the space the only all-zero
// row, the underscore's ink in the bottom pair only and the caret's in the top; nearestGlyph the first of equals; cellVector on a
// flat scene the flat value; THE DEMONSTRATION against tools/ship/asciiLut.mjs -- a cell white on its left half, one white on its
// right half and one flat mid-grey share a mean luminance to 1e-6, the shape search picks three different glyphs, and asciiLut's
// single-scalar pick is the same glyph for all three; the descriptor's two languages and four knobs; both fragments carrying the six
// sample points, the ring radius and a strict '<'. Section 2, both backends: procPlanet's bake at 252 x 120 in 6 x 10 cells (504
// cells) and the three-cell demonstration scene; the frame's R index EQUAL to the CPU twin's on every cell whose two best distances
// are further apart than 1e-5 (the near-ties counted, not hidden), its G mean within 2 of 255, the backends together; the three
// demonstration cells picked by name on the GPU.
//
// MEASURED AT v4505 (Plex through slugRender at 24 x 40 per glyph, the bake at 252 x 120 in 6 x 10 cells): the table's six columns peak at
// 1, the space is the only all-zero row, the underscore's ink is in samples 5 and 6 only (0.076, 0.066) and the caret's in 1 and 2
// (0.120, 0.081). The demonstration: left-white, right-white and flat cells at mean 0.5000 / 0.5000 / 0.5020 pick "L", "4" and "1" by
// shape; asciiLut picks "#" for all three. On both backends the fragment's argmin is the CPU twin's on 504 of 504 bake cells and 3 of 3
// demonstration cells with 0 near-ties under 1e-5 and the mean luminance exact; the backends 0 apart. 25 distinct glyphs on the bake.
//
// SABOTAGE (v4505): A  the WGSL ring radius 0.161 -> 0.3 (the scene sampled on a wider ring)   -> 6 red: the text hold, WebGPU 158 of 504 bake
//                                                                                                 cells and 3 of 3 demonstration cells off
//                                                                                                 ("i" "t" "t"), the backends 158 / 3 apart.
//                   B  the GLSL luminance weights swapped (blue weighted as red)               -> 2 red: WebGL2 103 of 504 bake cells off, the
//                                                                                                 backends 103 apart (the grey demonstration
//                                                                                                 is colourless and cannot see a swap).
//                   C  shapeTable not normalising per column (raw discs uploaded)              -> 3 red: the derivation hold (peaks under 1),
//                                                                                                 the demonstration on the CPU and on the GPU
//                                                                                                 ("&" "$" "$"). THE CELL-FOR-CELL HOLDS STAYED
//                                                                                                 GREEN: both sides read the same bytes, so
//                                                                                                 parity cannot see what the table holds --
//                                                                                                 the derivation holds are what guard it.
//                   D  the CPU twin's cellVector taking the centre tap only                    -> 2 red: both backends 106 of 504 bake cells
//                                                                                                 off the twin (the demonstration's halves
//                                                                                                 are flat under either sampling).
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/asciiShape-selfcheck.mjs      (~40 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { SlugFontDevice } from "../../render/slugDevice.mjs";
import { planetSpec, bakeEquirect } from "../../world/procPlanet.js";
import { GLYPHS, GLYPH_COUNT, INNER_SAMPLES, RING_RADIUS, shapeTable, nearestGlyph, cellVector, asciiShapeCpu, asciiShapePipelineDesc, FRAGMENT_GLSL, FRAGMENT_WGSL, KNOBS } from "../../render/asciiShape.mjs";
import { pickGlyph, rampFrom } from "./asciiLut.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const CW = 6, CH = 10, SW = 252, SH = 120, SEED = 7, TIE = 1e-5, TOL = 2;
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const fd = new SlugFontDevice(nullBackend(), font, GLYPHS.join(""), { logWidth: 11 });
const table = shapeTable(fd);
const bake = bakeEquirect(planetSpec(SEED), SW, SH), scene = { rgba: bake.rgba, w: SW, h: SH };
// the demonstration scene: three cells side by side -- left half white, right half white, flat 50% grey
const demo = { w: CW * 3, h: CH, rgba: new Uint8ClampedArray(CW * 3 * CH * 4) };
for (let j = 0; j < CH; j++) for (let i = 0; i < CW * 3; i++) { const cell = Math.floor(i / CW), x = i % CW; const v = cell === 0 ? (x < CW / 2 ? 255 : 0) : cell === 1 ? (x >= CW / 2 ? 255 : 0) : 128; const o = (j * demo.w + i) * 4; demo.rgba[o] = demo.rgba[o + 1] = demo.rgba[o + 2] = v; demo.rgba[o + 3] = 255; }
const gi = (ch) => ch.charCodeAt(0) - 32;

sec("1. HEADLESS: the glyphs, the derived table, the search, the demonstration against asciiLut, the two fragments");
{
    ok("95 glyphs, space through tilde, index = codepoint - 32", GLYPHS.length === GLYPH_COUNT && GLYPHS[0] === " " && GLYPHS[94] === "~" && GLYPHS[gi("A")] === "A");
    const peaks = [0, 0, 0, 0, 0, 0]; let zero = 0; for (let g = 0; g < 95; g++) { let s = 0; for (let k = 0; k < 6; k++) { peaks[k] = Math.max(peaks[k], table.vectors[g * 6 + k]); s += table.raw[g * 6 + k]; } if (s === 0) zero++; }
    ok("the table is DERIVED from Plex: 95 x 6, every column normalised to peak at exactly 1 (a byte of 255), and the space the only all-zero row", table.h === 95 && table.w === 6 && peaks.every((p) => p === 1) && zero === 1 && table.raw.subarray(0, 6).every((v) => v === 0), `peaks ${peaks.join(",")}, ${zero} all-zero`);
    const us = table.raw.subarray(gi("_") * 6, gi("_") * 6 + 6), caret = table.raw.subarray(gi("^") * 6, gi("^") * 6 + 6);
    ok("the underscore's ink is in the bottom pair of samples only and the caret's in the top pair (the six points read where the ink sits)", us[0] === 0 && us[1] === 0 && us[2] === 0 && us[3] === 0 && us[4] > 0.02 && us[5] > 0.02 && caret[0] > 0.02 && caret[1] > 0.02 && caret[4] === 0 && caret[5] < 0.02, `_ ${Array.from(us).map((v) => v.toFixed(3)).join(",")}  ^ ${Array.from(caret).map((v) => v.toFixed(3)).join(",")}`);
    const twin = new Float32Array(12); twin.set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6], 0); twin.set([0.1, 0.2, 0.3, 0.4, 0.5, 0.6], 6);
    ok("nearestGlyph keeps the FIRST of equals and reports the margin to the runner-up", nearestGlyph([0.1, 0.2, 0.3, 0.4, 0.5, 0.6], twin, 2).index === 0 && nearestGlyph([0.1, 0.2, 0.3, 0.4, 0.5, 0.6], twin, 2).margin === 0);
    const flat = cellVector(demo, CW, CH, 2, 0);
    ok("cellVector on a flat cell is the flat luminance at every sample (128 of 255)", Array.from(flat).every((v) => near(v, 128 / 255, 1e-6)));
    const vL = cellVector(demo, CW, CH, 0, 0), vR = cellVector(demo, CW, CH, 1, 0), mean = (v) => Array.from(v).reduce((a, b) => a + b, 0) / 6;
    const pL = nearestGlyph(vL, table.vectors), pR = nearestGlyph(vR, table.vectors), pF = nearestGlyph(flat, table.vectors);
    const ramp = rampFrom(), lut = [vL, vR, flat].map((v) => pickGlyph(mean(v), ramp).ch);
    report(`left-white ${JSON.stringify(GLYPHS[pL.index])} right-white ${JSON.stringify(GLYPHS[pR.index])} flat ${JSON.stringify(GLYPHS[pF.index])} by shape; means ${[vL, vR, flat].map((v) => mean(v).toFixed(4)).join(" / ")}; asciiLut picks ${lut.map((c) => JSON.stringify(c)).join(" ")}`);
    ok("*** THE DEMONSTRATION: three cells with the same mean luminance to 1e-6 get three DIFFERENT glyphs by shape, and asciiLut's single scalar gives all three the SAME glyph ***", near(mean(vL), mean(vR), 1e-6) && near(mean(vL), mean(flat), 1e-2) && pL.index !== pR.index && pL.index !== pF.index && pR.index !== pF.index && lut[0] === lut[1] && lut[1] === lut[2]);
    const d = asciiShapePipelineDesc();
    ok("the descriptor carries both languages, the four knobs in order, no vertex buffer", typeof d.shaders.wgsl === "string" && typeof d.shaders.glsl.fragment === "string" && d.uniforms.map((u) => u.name).join() === KNOBS.join() && d.attributes.length === 0);
    const pts = INNER_SAMPLES.map(([x, y]) => `${x}, ${y}`);
    ok(`both fragments carry the six sample points, the ring radius ${RING_RADIUS}, ${GLYPH_COUNT} candidates and a strict '<'`, pts.every((p) => FRAGMENT_GLSL.includes(`vec2(${p})`) && FRAGMENT_WGSL.includes(`vec2f(${p})`)) && FRAGMENT_GLSL.includes(`cellH * ${RING_RADIUS}`) && FRAGMENT_WGSL.includes(`u.cellH * ${RING_RADIUS}`) && FRAGMENT_GLSL.includes(`g < ${GLYPH_COUNT}`) && FRAGMENT_WGSL.includes(`g < ${GLYPH_COUNT}`) && /if \(d < bestD\)/.test(FRAGMENT_GLSL) && /if \(d < bestD\)/.test(FRAGMENT_WGSL));
}

sec("2. THE CELL PASS ON BOTH BACKENDS AGAINST THE CPU ARGMIN, cell for cell");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { CW, CH, SW, SH, SEED, bytes: Array.from(table.bytes), demo: Array.from(demo.rgba), demoW: demo.w }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { planetSpec, bakeEquirect } = await import("/world/procPlanet.js");
            const { asciiShapePipelineDesc, shapeTexture, sceneTexture, drawAsciiShape } = await import("/render/asciiShape.mjs");
            const { CW, CH, SW, SH, SEED, bytes, demo, demoW } = a; const out = {};
            const bake = bakeEquirect(planetSpec(SEED), SW, SH);
            const scenes = [{ rgba: bake.rgba, w: SW, h: SH }, { rgba: new Uint8ClampedArray(demo), w: demoW, h: CH }];
            for (const backend of ["webgpu", "webgl2"]) {
                const o = { backend, frames: [] };
                for (const s of scenes) {
                    const cols = Math.floor(s.w / CW), rows = Math.floor(s.h / CH);
                    const cv = document.createElement("canvas"); cv.width = cols; cv.height = rows;
                    const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" }); o.backend = dev.backend;
                    const pipe = dev.pipeline(asciiShapePipelineDesc()); if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.error = err; break; } }
                    const shapes = shapeTexture(dev, { bytes: new Uint8ClampedArray(bytes), w: 6, h: 95 }), tex = sceneTexture(dev, s);
                    const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); drawAsciiShape(pass, pipe, tex, shapes, CW, CH, s.w, s.h); }, { read: true });
                    o.frames.push({ cols, rows, pixels: Array.from(fr.pixels) }); dev.destroy();
                }
                out[backend] = o;
            }
            return out;
        }` });
        ok("both backends compiled the cell pass and drew the bake and the demonstration", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? ((r.result.webgpu && r.result.webgpu.error) || (r.result.webgl2 && r.result.webgl2.error) || "") : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && !r.result.webgpu.error && !r.result.webgl2.error) {
            const cpuBake = asciiShapeCpu(scene, table, CW, CH), cpuDemo = asciiShapeCpu(demo, table, CW, CH);
            [["the bake", cpuBake, 0], ["the demonstration", cpuDemo, 1]].forEach(([name, cpu, fi]) => {
                for (const bk of ["webgpu", "webgl2"]) {
                    const f = r.result[bk].frames[fi]; let same = 0, diff = 0, nearTies = 0, diffClear = 0, worstMean = 0; const n = cpu.cols * cpu.rows;
                    for (let i = 0; i < n; i++) { const gpuIdx = Math.round(f.pixels[i * 4] / 255 * 255), gm = f.pixels[i * 4 + 1]; const tie = cpu.margin[i] < TIE; if (tie) nearTies++;
                        if (gpuIdx === cpu.index[i]) same++; else { diff++; if (!tie) diffClear++; } worstMean = Math.max(worstMean, Math.abs(gm - Math.round(cpu.mean[i] * 255))); }
                    report(`${bk} on ${name}: ${same} of ${n} cells the CPU's glyph, ${diff} not (${diffClear} of those with a clear margin), ${nearTies} near-ties under ${TIE}; mean luminance worst ${worstMean}`);
                    ok(`*** ${bk} on ${name}: the fragment's argmin is the CPU twin's on every cell with a clear margin, and the mean within ${TOL} of 255 ***`, f.cols === cpu.cols && f.rows === cpu.rows && diffClear === 0 && worstMean <= TOL && nearTies < n * 0.05);
                }
                let po = 0; for (let i = 0; i < cpu.cols * cpu.rows; i++) if (r.result.webgpu.frames[fi].pixels[i * 4] !== r.result.webgl2.frames[fi].pixels[i * 4]) po++;
                ok(`  ${name}: the two backends pick the same glyph on every cell`, po === 0, `${po} apart`);
            });
            const f = r.result.webgpu.frames[1], picks = [0, 1, 2].map((i) => GLYPHS[f.pixels[i * 4]]);
            ok(`the GPU's demonstration picks by name: ${picks.map((c) => JSON.stringify(c)).join(" ")} -- three different glyphs for three cells of one mean`, new Set(picks).size === 3 && picks[0] === GLYPHS[cpuDemo.index[0]] && picks[1] === GLYPHS[cpuDemo.index[1]] && picks[2] === GLYPHS[cpuDemo.index[2]]);
            let inked = 0; for (let i = 0; i < cpuBake.cols * cpuBake.rows; i++) if (cpuBake.index[i] !== 0) inked++;
            ok(`CONTROL: the bake is not blank -- ${inked} of ${cpuBake.cols * cpuBake.rows} cells pick a glyph other than the space, and more than 10 distinct glyphs appear`, inked > cpuBake.cols * cpuBake.rows * 0.3 && new Set(cpuBake.index).size > 10, `${new Set(cpuBake.index).size} distinct`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: ascii-logo's outer ring and its two contrast powers (not taken: weights on the same six numbers); the picked glyphs' LOOK (ascii-shape.html prints them through Slug); a font other than Plex (the table is derived from whichever font device is passed).");
process.exit(fails ? 1 : 0);
