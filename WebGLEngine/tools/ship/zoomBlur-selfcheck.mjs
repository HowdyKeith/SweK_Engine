#!/usr/bin/env node
// WebGLEngine/tools/ship/zoomBlur-selfcheck.mjs -- v4504
//
// THE ZOOM BLUR BESIDE THE GOD RAYS (task 46): render/zoomBlur.mjs, a radial march toward an arbitrary centre that averages the
// scene and replaces it, in both languages with a CPU twin; and render/bloomPass.js's GODRAYS_FS run RAW on the same scene in the
// same page, so what separates the two marches is measured. Section 1, headless: the sample positions (the fragment first, the point
// `strength` of the way to the centre last); bilinear at a texel centre is the texel, halfway is the mean, outside clamps; the twin at
// strength 0 is the scene and a constant scene stays constant; the descriptor's two languages and three knobs; both fragments clamp to
// the texel-centre range and march N samples. Section 2, both backends: procPlanet's bake as the scene, two settings, every pixel
// within 2 of 255 of the twin, the backends together. Section 3, GODRAYS_FS beside it: with the depth at the far plane and no threshold
// it streaks toward the same centre; with the threshold (0.99) above the scene's brightest pixel (250 of 255) it is black; with the depth off the far
// plane it is black; on a constant grey scene it returns a different grey (its luminance weight) where the zoom blur returns the grey.
//
// MEASURED AT v4504 (the bake at 128 x 64 with its edges painted, a 160 x 96 frame): against the twin WebGPU is exact on 15,357 / 15,355 /
// 13,921 of 15,360 pixels at the three settings and WebGL2 on 15,359 / 15,360 / 13,644, worst 1 everywhere, the backends 0 apart. GODRAYS_FS
// raw from bloomPass.js's text: with the depth at the far plane and no threshold it lights all 15,360 pixels; at threshold 0.99 (the bake's
// brightest is 250, 0.980) it lights 0; at depth 0.5 it lights 0. On a constant grey of 128 the zoom blur returns 128 on every pixel and
// GODRAYS_FS returns 31.0 -- g * g * sum(decay^i) / N, 31.3 by the formula. The two frames' luminance correlates at 0.992 on the bake
// (reported, not held). The first draft's gated threshold was 0.95, which is NOT above 0.980; and the first two clamp sabotages were
// blind -- see paintEdges and the third setting.
//
// SABOTAGE (v4504): A  the WGSL marching AWAY from the centre (uv + d * t)                        -> 5 red: the text hold, WebGPU worst 146 / 186,
//                                                                                                     the backends 14,135 / 14,681 apart.
//                   B  the GLSL dividing by N - 1 instead of N (the mean too bright)             -> 5 red: the text hold, WebGL2 worst 7 on every
//                                                                                                     pixel, the backends 4,189 / 3,187 apart.
//                   C  the twin's bilinear reading nearest                                        -> 5 red: the bilinear hold, both backends worst
//                                                                                                     31 / 33 with 3,520 / 3,766 over.
//                   D  the shaders' clamp dropped (the sampler's edge rule back in the picture)   -> 3 red: the text hold, WebGPU at strength 0
//                                                                                                     worst 42 on 508 pixels (its sampler repeats:
//                                                                                                     the painted edge reads the far column),
//                                                                                                     WebGL2 unchanged (its sampler clamps).
//                                                                                                     BLIND TWICE FIRST: on the unpainted bake the
//                                                                                                     far column is the seam's own colour, and under
//                                                                                                     the march the edge is one sample in 32 (0.8 of
//                                                                                                     a level, worst 2).
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/zoomBlur-selfcheck.mjs      (~40 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { planetSpec, bakeEquirect } from "../../world/procPlanet.js";
import { N_SAMPLES, KNOBS, samplePos, bilinear, zoomBlurCpu, zoomBlurPipelineDesc, FRAGMENT_GLSL, FRAGMENT_WGSL } from "../../render/zoomBlur.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const W = 160, H = 96, BW = 128, BH = 64, SEED = 7, TOL = 2;
// the third setting is strength 0: every sample lands on the fragment itself, so the pass is a bilinear RESAMPLE of the scene and the
// edge pixels read the whole difference between the clamped and the repeated neighbour (25 levels on the painted edge) rather than a
// thirty-second of it (0.8 of a level under the march, which the tolerance swallows -- sabotage D was blind twice before this setting)
const SETTINGS = [{ cx: 0.5, cy: 0.5, strength: 0.35 }, { cx: 0.2, cy: 0.7, strength: 0.6 }, { cx: 0.5, cy: 0.5, strength: 0 }];
const bake = bakeEquirect(planetSpec(SEED), BW, BH);
// THE SCENE IS THE BAKE WITH ITS EDGES PAINTED: left column and top row 250, right column and bottom row 0. A first sabotage that
// dropped the shaders' clamp changed no pixel, because an equirectangular bake is CONTINUOUS across its seam -- WebGPU's repeating
// sampler read the far column and found the same colour the clamp would have. A hard edge is what makes the clamp measurable.
export function paintEdges(rgba, w, h) { const o = new Uint8ClampedArray(rgba); const set = (i, v) => { o[i * 4] = v; o[i * 4 + 1] = v; o[i * 4 + 2] = v; };
    for (let j = 0; j < h; j++) { set(j * w, 250); set(j * w + w - 1, 0); } for (let i = 0; i < w; i++) { set(i, 250); set((h - 1) * w + i, 0); } return o; }
const scene = { rgba: paintEdges(bake.rgba, BW, BH), w: BW, h: BH };

sec("1. HEADLESS: the march, the sample, the twin, the descriptor, the two fragments");
{
    const p0 = samplePos(0.9, 0.1, 0, SETTINGS[1]), pl = samplePos(0.9, 0.1, N_SAMPLES - 1, SETTINGS[1]);
    ok("samplePos: sample 0 is the fragment itself and the last is `strength` of the way to the centre", near(p0[0], 0.9) && near(p0[1], 0.1) && near(pl[0], 0.9 - 0.7 * 0.6) && near(pl[1], 0.1 + 0.6 * 0.6), `${pl.map((v) => v.toFixed(3)).join(",")}`);
    const w = 8, h = 4, rgba = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) { rgba[i * 4] = (i % w) * 30; rgba[i * 4 + 1] = Math.floor(i / w) * 60; rgba[i * 4 + 3] = 255; }
    const c = bilinear(rgba, w, h, 1.5 / w, 1.5 / h), m = bilinear(rgba, w, h, 2 / w, 1.5 / h), lo = bilinear(rgba, w, h, -1, -1), hi = bilinear(rgba, w, h, 2, 2);
    ok("bilinear: a texel centre is the texel, halfway between two is their mean, and a position outside the image clamps to the corner texel", c[0] === 30 && c[1] === 60 && m[0] === 45 && m[1] === 60 && lo[0] === 0 && lo[1] === 0 && hi[0] === 210 && hi[1] === 180);
    const f0 = zoomBlurCpu({ rgba, w, h }, w, h, { cx: 0.5, cy: 0.5, strength: 0 }); let same = true; for (let i = 0; i < rgba.length; i++) if (f0[i] !== rgba[i]) { same = false; break; }
    const g = new Uint8ClampedArray(w * h * 4).fill(200), fg = zoomBlurCpu({ rgba: g, w, h }, w, h); let konst = true; for (let i = 0; i < fg.length; i++) if (fg[i] !== (i % 4 === 3 ? 255 : 200)) { konst = false; break; }
    ok("the twin at strength 0 is the scene byte for byte, and a constant scene stays constant under the default march", same && konst);
    const cpu = zoomBlurCpu(scene, W, H, SETTINGS[0]); let moved = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const s = bilinear(scene.rgba, BW, BH, (i + 0.5) / W, (j + 0.5) / H); if (Math.abs(cpu[(j * W + i) * 4] - s[0]) > 4) moved++; }
    ok(`CONTROL: on the bake the default march changes the picture (more than a quarter of the pixels move by more than 4 levels in red)`, moved > W * H * 0.25, `${moved} of ${W * H}`);
    const d = zoomBlurPipelineDesc();
    ok("the descriptor carries both languages, the three knobs in order, and no vertex buffer", typeof d.shaders.wgsl === "string" && typeof d.shaders.glsl.fragment === "string" && typeof d.shaders.glsl.vertex === "string" && d.uniforms.map((u) => u.name).join() === KNOBS.join() && d.attributes.length === 0);
    ok(`both fragments clamp the sample to the texel-centre range and march ${N_SAMPLES} samples, dividing by ${N_SAMPLES}`, /clamp\(vUv - d \* t, lo, hi\)/.test(FRAGMENT_GLSL) && new RegExp(`const int N = ${N_SAMPLES};`).test(FRAGMENT_GLSL) && /acc \/ float\(N\)/.test(FRAGMENT_GLSL) && /clamp\(uv - d \* t, lo, hi\)/.test(FRAGMENT_WGSL) && new RegExp(`i < ${N_SAMPLES};`).test(FRAGMENT_WGSL) && new RegExp(`acc / f32\\(${N_SAMPLES}\\)`).test(FRAGMENT_WGSL));
}

let result = null;
sec("2. THE PASS ON BOTH BACKENDS AGAINST THE CPU TWIN, and 3. GODRAYS_FS raw beside it");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const GREY = 128;
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SEED, BW, BH, SETTINGS, GREY }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { planetSpec, bakeEquirect } = await import("/world/procPlanet.js");
            const { zoomBlurPipelineDesc, sceneTexture, drawZoomBlur } = await import("/render/zoomBlur.mjs");
            const { W, H, SEED, BW, BH, SETTINGS, GREY } = a; const out = {};
            const bake = bakeEquirect(planetSpec(SEED), BW, BH);
            const paintEdges = (rgba, w, h) => { const o = new Uint8ClampedArray(rgba); const set = (i, v) => { o[i * 4] = v; o[i * 4 + 1] = v; o[i * 4 + 2] = v; };
                for (let j = 0; j < h; j++) { set(j * w, 250); set(j * w + w - 1, 0); } for (let i = 0; i < w; i++) { set(i, 250); set((h - 1) * w + i, 0); } return o; };
            const scene = { rgba: paintEdges(bake.rgba, BW, BH), w: BW, h: BH };
            const grey = { rgba: new Uint8ClampedArray(BW * BH * 4).fill(GREY), w: BW, h: BH }; for (let i = 3; i < grey.rgba.length; i += 4) grey.rgba[i] = 255;
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, frames: [] };
                const pipe = dev.pipeline(zoomBlurPipelineDesc()); if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.error = err; out[backend] = o; continue; } }
                const tex = sceneTexture(dev, scene), gtex = sceneTexture(dev, grey);
                for (const k of SETTINGS) { const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); drawZoomBlur(pass, pipe, tex, k); }, { read: true }); o.frames.push(Array.from(fr.pixels)); }
                const fg = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); drawZoomBlur(pass, pipe, gtex, SETTINGS[0]); }, { read: true }); o.grey = Array.from(fg.pixels);
                dev.destroy(); out[backend] = o;
            }
            // GODRAYS_FS, raw WebGL2, from bloomPass.js's own text
            const src = await (await fetch("/render/bloomPass.js")).text();
            const between = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); const s = src.slice(i, j); const q0 = s.indexOf("\`") + 1, q1 = s.lastIndexOf("\`"); return s.slice(q0, q1); };
            const VS = between("const PASSTHROUGH_VS", "const "), FS = between("const GODRAYS_FS", "const COMPOSITE_FS");
            const gcv = document.createElement("canvas"); gcv.width = W; gcv.height = H; const gl = gcv.getContext("webgl2", { preserveDrawingBuffer: true });
            const god = { vsLen: VS.length, fsLen: FS.length, frames: {} };
            if (!gl) { god.error = "no webgl2"; out.god = god; return out; }
            const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
            let prog; try { prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); } catch (e) { god.error = String(e.message).slice(0, 200); out.god = god; return out; }
            const mk = (rgba, w, h) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
            // the scene must be FLIPPED for the raw pass: PASSTHROUGH_VS's vUV has y up (0 at the bottom row), the device pass's uv has y down
            const flip = (s) => { const o = new Uint8ClampedArray(s.rgba.length); for (let j = 0; j < s.h; j++) o.set(s.rgba.subarray(j * s.w * 4, (j + 1) * s.w * 4), (s.h - 1 - j) * s.w * 4); return o; };
            const tScene = mk(flip(scene), BW, BH), tGrey = mk(flip(grey), BW, BH);
            const depthOf = (v) => { const d = new Uint8ClampedArray(BW * BH * 4); for (let i = 0; i < BW * BH; i++) { d[i * 4] = v; d[i * 4 + 3] = 255; } return mk(d, BW, BH); };
            const tFar = depthOf(255), tNear = depthOf(128);
            const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.useProgram(prog); gl.viewport(0, 0, W, H);
            const U = (n) => gl.getUniformLocation(prog, n);
            const run = (sceneTex, depthTex, k, threshold) => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTex); gl.uniform1i(U("uScene"), 0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depthTex); gl.uniform1i(U("uSceneDepth"), 1);
                gl.uniform2f(U("uSunPosUV"), k.cx, 1 - k.cy); gl.uniform1f(U("uVisibility"), 1); gl.uniform1f(U("uIntensity"), 1); gl.uniform1f(U("uThreshold"), threshold);
                gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
                const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
                const o = new Uint8Array(W * H * 4); for (let j = 0; j < H; j++) o.set(px.subarray(j * W * 4, (j + 1) * W * 4), (H - 1 - j) * W * 4); return Array.from(o); };
            god.frames.open = run(tScene, tFar, SETTINGS[0], 0.0);
            god.frames.gated = run(tScene, tFar, SETTINGS[0], 0.99);
            god.frames.near = run(tScene, tNear, SETTINGS[0], 0.0);
            god.frames.grey = run(tGrey, tFar, SETTINGS[0], 0.0);
            out.god = god; return out;
        }` });
        ok("both backends compiled the pass and drew the three settings and the grey, and GODRAYS_FS compiled raw from bloomPass.js's text", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error && r.result.god && !r.result.god.error, r.ok ? ((r.result.webgpu && r.result.webgpu.error) || (r.result.webgl2 && r.result.webgl2.error) || (r.result.god && r.result.god.error) || "") : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok && r.result.god && !r.result.god.error) {
            result = r.result;
            SETTINGS.forEach((k, si) => {
                const cpu = zoomBlurCpu(scene, W, H, k);
                for (const bk of ["webgpu", "webgl2"]) {
                    const px = result[bk].frames[si]; let exact = 0, worst = 0, over = 0;
                    for (let i = 0; i < W * H; i++) { const d = Math.max(Math.abs(px[i * 4] - cpu[i * 4]), Math.abs(px[i * 4 + 1] - cpu[i * 4 + 1]), Math.abs(px[i * 4 + 2] - cpu[i * 4 + 2])); if (d === 0) exact++; if (d > worst) worst = d; if (d > TOL) over++; }
                    report(`${bk} at centre (${k.cx}, ${k.cy}) strength ${k.strength}: ${exact} of ${W * H} exact against the twin, worst ${worst}, ${over} over ${TOL}`);
                    ok(`*** ${bk} setting ${si + 1}: every pixel within ${TOL} of 255 of the CPU twin (${N_SAMPLES} bilinear samples averaged in f64) ***`, over === 0, `worst ${worst}`);
                }
                let po = 0; for (let i = 0; i < W * H * 4; i += 4) if (Math.abs(result.webgpu.frames[si][i] - result.webgl2.frames[si][i]) > TOL) po++;
                ok(`  setting ${si + 1}: the two backends agree within ${TOL} on every pixel`, po === 0, `${po} apart`);
            });
            // 3. the god rays beside it
            const g = result.god, lum = (px, i) => Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
            let openLit = 0, gatedLit = 0, nearLit = 0, maxScene = 0; for (let i = 0; i < W * H; i++) { if (lum(g.frames.open, i) > 2) openLit++; if (lum(g.frames.gated, i) > 0) gatedLit++; if (lum(g.frames.near, i) > 0) nearLit++; }
            for (let i = 0; i < BW * BH; i++) maxScene = Math.max(maxScene, lum(scene.rgba, i));
            report(`GODRAYS_FS from bloomPass.js (${g.vsLen} + ${g.fsLen} chars): far depth and no threshold lights ${openLit} of ${W * H} pixels; threshold 0.99 above the scene's brightest (${maxScene} of 255, ${(maxScene / 255).toFixed(3)}) lights ${gatedLit}; depth 0.5 lights ${nearLit}`);
            ok("GODRAYS_FS with the depth at the far plane and no threshold streaks over most of the frame", openLit > W * H * 0.5);
            ok("*** the two gates the zoom blur does not have: a threshold above the scene's brightest pixel makes GODRAYS_FS black, and a depth off the far plane makes it black, while the zoom blur's frames are what they were ***", gatedLit === 0 && nearLit === 0 && maxScene < 0.99 * 255);   // the bake's brightest is 250 (0.980): 0.95 was NOT above it, 0.99 is
            let zg = 0, gg = 0, zgWorst = 0; for (let i = 0; i < W * H; i++) { zg += result.webgpu.grey[i * 4]; gg += g.frames.grey[i * 4]; zgWorst = Math.max(zgWorst, Math.abs(result.webgpu.grey[i * 4] - GREY)); } zg /= W * H; gg /= W * H;
            // the god-ray answer on a constant grey g: g * g * sum(decay^i) / N * intensity = g^2 * (1 - 0.965^48) / 0.035 / 48
            const expectGod = (GREY / 255) * (GREY / 255) * (1 - Math.pow(0.965, 48)) / 0.035 / 48 * 255;
            report(`a constant grey of ${GREY}: the zoom blur returns ${zg.toFixed(1)} (worst pixel ${zgWorst} off), GODRAYS_FS returns ${gg.toFixed(1)} -- its luminance weight makes g * g of it, ${expectGod.toFixed(1)} by the formula`);
            ok("*** on a constant grey the zoom blur is the grey on every pixel (a mean of equals) and GODRAYS_FS is not (its samples weigh by their own luminance and decay) ***", zgWorst <= 1 && Math.abs(gg - expectGod) < 3 && Math.abs(gg - GREY) > 20);
            // the same centre: both streak toward it -- the god-ray frame and the zoom blur are correlated in luminance, radially
            let sxy = 0, sxx = 0, syy = 0, mx = 0, my = 0; const zb = result.webgpu.frames[0]; for (let i = 0; i < W * H; i++) { mx += lum(zb, i); my += lum(g.frames.open, i); } mx /= W * H; my /= W * H;
            for (let i = 0; i < W * H; i++) { const x = lum(zb, i) - mx, y = lum(g.frames.open, i) - my; sxy += x * y; sxx += x * x; syy += y * y; }
            report(`luminance correlation between the zoom blur and the open god rays on the bake, same centre: ${(sxy / Math.sqrt(sxx * syy)).toFixed(3)} (reported, not held: they are different functions of the same march)`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a decay or a weight of any kind (the zoom blur has none by design); the pass on a rendered scene rather than a bake (zoom-blur.html blurs the bake); GODRAYS_FS's own correctness (bloomPass's).");
process.exit(fails ? 1 : 0);
