#!/usr/bin/env node
// WebGLEngine/tools/ship/water2d-selfcheck.mjs -- v4506
//
// 2D WATER (task 52): render/water2d.mjs, after StefanJo3107/2D-Water-Shader (MIT). Section 1, headless: waterNoise deterministic
// from its seed and different across seeds; wrapTexel and clampTexel the fragment's own formulas; offsetAt the two maps' RG summed;
// THE PARALLAX IS A CLOSED FORM -- a camera shift of parallax * (k / w) reads the map k texels along, exactly; foamAt's three cases
// by name (both channels past the threshold, one channel not, below the leaning edge line); the contrast curve at 0.5 and its
// spread; the descriptor's two languages and twelve knobs; both fragments carrying the foam condition and the flipped v. Section 2,
// both backends, TWO SCENES: a coordinate RAMP whose colour is its texel index (R = column, G = row), tint flat (0.5 curves to
// itself) and foam white, so every pixel's colour NAMES the scene texel the offset chose and the twin's texel is held against it
// exactly on every pixel not within f32 of a texel boundary (counted), and the foam mask held pixel for pixel; then procPlanet's
// bake with the default tint and translucent foam, within 2 of 255 on every non-boundary pixel. Two camera positions on the ramp,
// the second the parallax closed form's k-texel shift of the first's foam mask. The backends together.
//
// MEASURED AT v4506 (60-texel maps from seeds 7 and 11, a 128 x 64 ramp and bake, a 160 x 96 frame): on the ramp WebGPU names the twin's
// texel or its foam on 15,349 / 15,348 of 15,360 pixels at the two cameras and WebGL2 on 15,356 / 15,356, the rest on a texel boundary
// within 2e-6, 0 wrong texels and 0 foam decisions wrong off-boundary; 4,611 foam pixels; on the bake 0 pixels over 2 off-boundary on
// either backend (5 excused); the second camera's foam mask is the first's moved 8 pixels on 14,592 of 14,592 pixels; the backends 0 / 0 / 11
// apart. THREE CORRECTIONS TO THE GATE'S OWN ARITHMETIC before it was green: a ramp of raw indices halved by the tint put odd indices on
// a .5 that f32 and f64 round apart (the ramp holds 2 x index now); 64-texel maps against 160 x 96 put every fifth column and every
// third row exactly on a texel boundary, 7% of the frame excused (60-texel maps now); and the parallax shift was compared in the wrong
// direction (63% until the camera moved RIGHT read the map further along, i + cols).
//
// SABOTAGE (v4506): A  the WGSL foam condition's && made ||                    -> 7 red: the text hold, WebGPU 8,483 of 15,360 exact on the ramp
//                                                                                 and 7,489 bake pixels over 2 (worst 149), the backends 6,877 /
//                                                                                 6,877 / 7,507 apart; WebGL2 untouched.
//                   B  the GLSL offset not divided by amount                    -> 7 red: the text hold, WebGL2 10,688 wrong texels (worst 120
//                                                                                 half-texels) and 14,123 bake pixels over 2 (worst 183).
//                   C  the twin's parallax sign flipped (camX / -parallax)      -> 6 red: the closed-form hold, both backends' second camera
//                                                                                 6,280 wrong texels and 8,341 bake pixels over 2, and the
//                                                                                 mask shift; the first camera (camX 0) unchanged, as it must be.
//                   D  the detail map dropped from both fragments' offset       -> 7 red: the text hold, both backends 10,293 wrong texels
//                                                                                 (worst 4 half-texels) and 10,695 bake pixels over 2.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/water2d-selfcheck.mjs      (~40 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { planetSpec, bakeEquirect } from "../../world/procPlanet.js";
import { KNOBS, DEFAULT_KNOBS, waterNoise, wrapTexel, clampTexel, offsetAt, foamAt, contrastCurve, water2dCpu, water2dPipelineDesc, FRAGMENT_GLSL, FRAGMENT_WGSL } from "../../render/water2d.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
// 60-texel maps against a 160 x 96 frame: (i + 0.5) * 60 / 160 and (j + 0.5) * 60 / 96 never land on a texel boundary, where 64-texel
// maps put every fifth column and every third row exactly on one (a first draft excused 7% of the frame as "boundary" for it)
const W = 160, H = 96, RW = 128, RH = 64, DW = 60, DH = 60, TOL = 2, EPS = 2e-6;
const disp = waterNoise(7, DW, DH), detail = waterNoise(11, DW, DH, 16);
const ramp = { w: RW, h: RH, rgba: new Uint8ClampedArray(RW * RH * 4) };
// the ramp holds 2 * index: the flat tint of 0.5 halves it back to the index EXACTLY in bytes, where an odd index halved is a .5 that f32 and f64 round apart
for (let j = 0; j < RH; j++) for (let i = 0; i < RW; i++) { const o = (j * RW + i) * 4; ramp.rgba[o] = 2 * i; ramp.rgba[o + 1] = 2 * j; ramp.rgba[o + 2] = 0; ramp.rgba[o + 3] = 255; }
const bake = bakeEquirect(planetSpec(7), RW, RH), scene = { rgba: bake.rgba, w: RW, h: RH };
const RAMP_K = { ...DEFAULT_KNOBS, time: 12.371, foamThreshold: 0.0121, edgeFoamThreshold: 0.0051, foamAlpha: 1, tintR: 0.5, tintG: 0.5, tintB: 0.5 };
const K_SHIFT = 3, RAMP_K2 = { ...RAMP_K, camX: RAMP_K.parallax * (K_SHIFT / DW) };
const BAKE_K = { ...DEFAULT_KNOBS, time: 3.257, camX: 0.7, foamThreshold: 0.0121, foamAlpha: 0.6 };

sec("1. HEADLESS: the noise, the texel formulas, the offset, the parallax closed form, the foam cases, the curve, the fragments");
{
    const a = waterNoise(7, DW, DH), b = waterNoise(7, DW, DH), c = waterNoise(8, DW, DH); let same = true, diff = 0; for (let i = 0; i < a.rgba.length; i++) { if (a.rgba[i] !== b.rgba[i]) same = false; if (a.rgba[i] !== c.rgba[i]) diff++; }
    ok("waterNoise is the same bytes from the same seed and different from another, opaque, R and G spread across the range", same && diff > a.rgba.length * 0.3 && a.rgba[3] === 255 && Math.max(...a.rgba.filter((_, i) => i % 4 === 0)) > 200 && Math.min(...a.rgba.filter((_, i) => i % 4 === 0)) < 50);
    ok("wrapTexel wraps u by fract and clamps v; clampTexel clamps both; both floor to the texel", wrapTexel(1.25, 0.5, 64, 32).join() === "16,16" && wrapTexel(-0.25, 2, 64, 32).join() === "48,31" && clampTexel(1.25, -1, 64, 32).join() === "63,0" && clampTexel(0.999, 0.999, 64, 32).join() === "63,31");
    const k = { ...RAMP_K }, o = offsetAt(0.3, 0.4, disp, detail, k);
    const [dx, dy] = wrapTexel(0.3 + k.time / k.dispSpeed, 0.4, DW, DH), [ex, ey] = wrapTexel(0.3 + k.time / k.detailSpeed, 0.4, DW, DH);
    const want = [(disp.rgba[(dy * DW + dx) * 4] + detail.rgba[(ey * DW + ex) * 4]) / 255, (disp.rgba[(dy * DW + dx) * 4 + 1] + detail.rgba[(ey * DW + ex) * 4 + 1]) / 255];
    ok("offsetAt is the two maps' RG summed, each read at its own scrolled x", near(o[0], want[0]) && near(o[1], want[1]), o.map((v) => v.toFixed(4)).join(","));
    let shiftOk = true; for (let t = 0; t < 200; t++) { const u = t / 200, v = (t * 7 % 200) / 200; const p = offsetAt(u, v, disp, detail, k), q = offsetAt(u - K_SHIFT / DW, v, disp, detail, RAMP_K2); if (p[0] !== q[0] || p[1] !== q[1]) { shiftOk = false; break; } }
    ok(`*** THE PARALLAX CLOSED FORM: a camera shift of parallax * ${K_SHIFT} / ${DW} reads both maps exactly ${K_SHIFT} texels along -- the offset at u under it equals the offset at u - ${K_SHIFT}/${DW} without it, on 200 points ***`, shiftOk);
    const F = { amount: 40, foamThreshold: 0.0121, edgeFoamThreshold: 0.0051 };
    ok("foamAt: both channels past the threshold is foam, one channel short is not, and a fragment below the leaning edge line is foam whatever the channels", foamAt(0.5, 0.5, [1.0, 1.0], F) === true && foamAt(0.5, 0.5, [1.0, 0.9], F) === false && foamAt(0.5, 0.00001, [0.7, 0.5], F) === true && foamAt(0.5, 0.5, [0.5, 0.5], F) === false);
    ok("contrastCurve leaves 0.5 alone at any contrast, pushes 0.8 past 1 at contrast 1 and toward 0.5 at 0.2", contrastCurve(0.5, 0.3) === 0.5 && contrastCurve(0.8, 1) > 1.09 && contrastCurve(0.8, 0.2) < 0.6 && contrastCurve(0.2, 1) < -0.09);
    const d = water2dPipelineDesc();
    ok("the descriptor carries both languages, the twelve knobs in order, no vertex buffer", typeof d.shaders.wgsl === "string" && typeof d.shaders.glsl.fragment === "string" && d.uniforms.map((u) => u.name).join() === KNOBS.join() && d.uniforms.length === 12 && d.attributes.length === 0);
    ok("both fragments flip v, sum the two maps, divide by amount, and carry the foam condition with its && and its edge line", /vec2 uv = vec2\(vUv\.x, 1\.0 - vUv\.y\)/.test(FRAGMENT_GLSL) && /vec2 offset = a \+ b;/.test(FRAGMENT_GLSL) && /\(offset - 0\.5\) \/ amount/.test(FRAGMENT_GLSL) && /abs\(ox\) > foamThreshold && abs\(oy\) > foamThreshold\) \|\| uv\.y < edgeFoamThreshold \* ox/.test(FRAGMENT_GLSL)
        && /let uv = vec2f\(vUv\.x, 1\.0 - vUv\.y\)/.test(FRAGMENT_WGSL) && /let offset = a \+ b;/.test(FRAGMENT_WGSL) && /\(offset - 0\.5\) \/ u\.amount/.test(FRAGMENT_WGSL) && /abs\(ox\) > u\.foamThreshold && abs\(oy\) > u\.foamThreshold\) \|\| uv\.y < u\.edgeFoamThreshold \* ox/.test(FRAGMENT_WGSL));
}

/** is any coordinate this pixel's fragment computes within EPS of a texel boundary (where f32 and f64 may floor differently)? */
function boundaryPixel(i, j, k, sceneW, sceneH) {
    const u = (i + 0.5) / W, v = 1 - (j + 0.5) / H, shift = k.camX / k.parallax;
    const fr = (x) => x - Math.floor(x), nearEdge = (x, n) => { const t = fr(x) * n; return Math.abs(t - Math.round(t)) < EPS * n; };
    if (nearEdge(u + k.time / k.dispSpeed + shift, DW) || nearEdge(u + k.time / k.detailSpeed + shift, DW) || nearEdge(v, DH)) return true;
    const off = offsetAt(u, v, disp, detail, k), au = u + (off[0] - 0.5) / k.amount, av = v + (off[1] - 0.5) / k.amount;
    if (Math.abs(au * sceneW - Math.round(au * sceneW)) < EPS * sceneW || Math.abs(av * sceneH - Math.round(av * sceneH)) < EPS * sceneH) return true;
    const ox = (off[0] - 0.5) / k.amount, oy = (off[1] - 0.5) / k.amount;
    if (Math.abs(Math.abs(ox) - k.foamThreshold) < 1e-6 || Math.abs(Math.abs(oy) - k.foamThreshold) < 1e-6 || Math.abs(v - k.edgeFoamThreshold * ox) < 1e-6) return true;
    return false;
}

sec("2. THE PASS ON BOTH BACKENDS: the ramp names its texel, the foam mask pixel for pixel, the parallax shift, the bake within 2");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, RW, RH, DW, DH, disp: Array.from(disp.rgba), detail: Array.from(detail.rgba), ramp: Array.from(ramp.rgba), SETS: [RAMP_K, RAMP_K2, BAKE_K] }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { planetSpec, bakeEquirect } = await import("/world/procPlanet.js");
            const { water2dPipelineDesc, imageTexture, drawWater2d } = await import("/render/water2d.mjs");
            const { W, H, RW, RH, DW, DH, disp, detail, ramp, SETS } = a; const out = {};
            const bake = bakeEquirect(planetSpec(7), RW, RH);
            const scenes = [{ rgba: new Uint8ClampedArray(ramp), w: RW, h: RH }, { rgba: new Uint8ClampedArray(ramp), w: RW, h: RH }, { rgba: bake.rgba, w: RW, h: RH }];
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, frames: [] };
                const pipe = dev.pipeline(water2dPipelineDesc()); if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.error = err; out[backend] = o; continue; } }
                const tD = imageTexture(dev, { rgba: new Uint8ClampedArray(disp), w: DW, h: DH }), tE = imageTexture(dev, { rgba: new Uint8ClampedArray(detail), w: DW, h: DH });
                for (let s = 0; s < SETS.length; s++) { const tS = imageTexture(dev, scenes[s]); const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); drawWater2d(pass, pipe, tS, tD, tE, SETS[s]); }, { read: true }); o.frames.push(Array.from(fr.pixels)); }
                dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("both backends compiled the pass and drew the three settings", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? ((r.result.webgpu && r.result.webgpu.error) || (r.result.webgl2 && r.result.webgl2.error) || "") : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && !r.result.webgpu.error && !r.result.webgl2.error) {
            const cpu = [water2dCpu(ramp, disp, detail, W, H, RAMP_K), water2dCpu(ramp, disp, detail, W, H, RAMP_K2), water2dCpu(scene, disp, detail, W, H, BAKE_K)];
            let foamCount = 0; for (const f of cpu[0].foam) foamCount += f;
            ok(`CONTROL: the ramp setting has foam on between 3% and 60% of the frame (${foamCount} of ${W * H}) and is not all foam`, foamCount > W * H * 0.03 && foamCount < W * H * 0.6);
            for (const bk of ["webgpu", "webgl2"]) {
                for (const si of [0, 1]) {
                    const px = r.result[bk].frames[si], c = cpu[si], k = si === 0 ? RAMP_K : RAMP_K2; let exact = 0, bnd = 0, off = 0, foamOff = 0, worstT = 0;
                    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const p = j * W + i, o = p * 4; const isFoam = px[o] === 255 && px[o + 1] === 255 && px[o + 2] === 255;
                        if (c.foam[p]) { if (!isFoam) { if (boundaryPixel(i, j, k, RW, RH)) bnd++; else foamOff++; } else exact++; continue; }
                        if (isFoam) { if (boundaryPixel(i, j, k, RW, RH)) bnd++; else foamOff++; continue; }
                        // a non-foam ramp pixel: the ramp holds 2 * index and the tint of 0.5 curves to 0.5 at any contrast, so the byte is the index itself
                        const tx = c.texel[p * 2], ty = c.texel[p * 2 + 1], wantR = tx, wantG = ty;
                        const d = Math.max(Math.abs(px[o] - wantR), Math.abs(px[o + 1] - wantG)); if (d === 0) exact++; else if (boundaryPixel(i, j, k, RW, RH)) bnd++; else { off++; worstT = Math.max(worstT, d); } }
                    report(`${bk} ramp setting ${si + 1}: ${exact} of ${W * H} pixels name the twin's texel or its foam exactly, ${bnd} on a boundary, ${off} wrong texels (worst ${worstT} half-texels), ${foamOff} foam decisions wrong off-boundary`);
                    ok(`*** ${bk} ramp setting ${si + 1}: every non-boundary pixel reads the twin's texel and every non-boundary foam decision is the twin's ***`, off === 0 && foamOff === 0 && exact > W * H * 0.98);
                }
                const px = r.result[bk].frames[2], c = cpu[2]; let over = 0, worst = 0, bnd = 0;
                for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const o = (j * W + i) * 4; const d = Math.max(Math.abs(px[o] - c.pixels[o]), Math.abs(px[o + 1] - c.pixels[o + 1]), Math.abs(px[o + 2] - c.pixels[o + 2])); if (d > TOL) { if (boundaryPixel(i, j, BAKE_K, RW, RH)) bnd++; else { over++; worst = Math.max(worst, d); } } }
                report(`${bk} bake: ${over} pixels over ${TOL} off-boundary (worst ${worst}), ${bnd} boundary pixels excused`);
                ok(`*** ${bk} bake with the tint curve and translucent foam: every non-boundary pixel within ${TOL} of 255 of the twin ***`, over === 0);
            }
            // the parallax on the GPU: setting 2's foam mask is setting 1's shifted by K texels of the map -- held through the twin's masks, which the frames matched above
            // the camera moved RIGHT reads the maps further along: pixel i under camera 2 is pixel i + cols under camera 1 (a first draft compared i - cols and read 63%)
            let shifted = 0, total = 0; const cols = Math.round(K_SHIFT / DW * W); for (let j = 0; j < H; j++) for (let i = 0; i < W - cols; i++) { total++; if (cpu[1].foam[j * W + i] === cpu[0].foam[j * W + i + cols]) shifted++; }
            report(`the parallax on screen: setting 2 (camera ${RAMP_K2.camX.toFixed(4)}) has ${K_SHIFT} map texels = ${cols} pixels of shift; ${shifted} of ${total} mask pixels are setting 1's moved by that`);
            ok(`*** the second camera's foam mask is the first's moved ${cols} pixels, on more than 99.5% of pixels (an integer shift: ${K_SHIFT} texels of a ${DW}-texel map over ${W} pixels) ***`, shifted > total * 0.995);
            for (const si of [0, 1, 2]) { let po = 0; for (let i = 0; i < W * H * 4; i += 4) if (Math.abs(r.result.webgpu.frames[si][i] - r.result.webgl2.frames[si][i]) > TOL) po++; ok(`  setting ${si + 1}: the two backends agree within ${TOL} on all but boundary pixels (fewer than 0.5%)`, po < W * H * 0.005, `${po} apart`); }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the original's bilinear sampling (nearest is what the twin can name exactly), its vertex displacement and perspective-correction toggles (not taken), a reflection render as the scene (the page uses procPlanet's bake).");
process.exit(fails ? 1 : 0);
