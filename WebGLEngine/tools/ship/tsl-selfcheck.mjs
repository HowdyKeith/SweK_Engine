#!/usr/bin/env node
// WebGLEngine/tools/ship/tsl-selfcheck.mjs -- v4319
//
// GRADES TSL IN THIS TREE: three.js's node shading language, vendored for the first time (vendor/three-webgpu,
// three 0.178: the WebGPU build with its WebGL2 backend, and three.tsl.js), running in the ship harness on
// BOTH backends, and the first effect written in it -- badTv (render/badTvTsl.mjs) -- held to the device
// pipeline (render/badTvDevicePass.mjs, WGSL on WebGPU and GLSL on WebGL2) and to the CPU model
// (render/badTvModel.mjs). The claim is to the byte: three's node builders compile one TSL graph to WGSL and
// to GLSL, and each picture is the hand-written pair's picture, after the documented row mirror.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { THREE_PASS_RELATION } from "../../render/badTvDevicePass.mjs";
import { TSL_KNOBS } from "../../render/badTvTsl.mjs";
import { KNOB_ORDER } from "../../render/badTvWgsl.mjs";
import { keyCpu, NEWTON_STEPS } from "../../render/blackbodyTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const V = path.join(ENG, "vendor/three-webgpu");

console.log("\n1. THE VENDORED BUILD: three 0.178's WebGPU build and TSL, beside r160, with exactly one edit");
{
    const files = ["three.webgpu.js", "three.core.js", "three.tsl.js", "LICENSE", "README.md"];
    ok("vendor/three-webgpu carries the WebGPU build, its core, TSL, the MIT licence and a README", files.every((f) => fs.existsSync(path.join(V, f))), files.filter((f) => !fs.existsSync(path.join(V, f))).join(", ") || "all present");
    const webgpu = fs.readFileSync(path.join(V, "three.webgpu.js"), "utf8"), tsl = fs.readFileSync(path.join(V, "three.tsl.js"), "utf8"), readme = fs.readFileSync(path.join(V, "README.md"), "utf8");
    const rev = (webgpu.match(/REVISION = '(\d+)'/) || webgpu.match(/const REVISION = '(\d+)'/) || [null, null])[1] || (fs.readFileSync(path.join(V, "three.core.js"), "utf8").match(/REVISION = '(\d+)'/) || [])[1];
    // v4556 -- re-vendored to three@0.185.1 (tools/ship/three-probe.json settled the pin question rig-side); the
    // r160 module stays for main.js and every three.js page regardless of which WebGPU build sits beside it.
    ok(`the build is r185 (the README names 0.185.1), not r160 -- the r160 module stays for main.js and every three.js page`, rev === "185" && /0\.185\.1/.test(readme) && fs.existsSync(path.join(ENG, "vendor/three/three.module.js")), `revision ${rev}`);
    ok("*** the ONE edit: three.tsl.js imports './three.webgpu.js' instead of the bare 'three/webgpu', and the README says so ***", /from '\.\/three\.webgpu\.js'/.test(tsl) && !/from 'three\/webgpu'/.test(tsl) && /ONE EDIT/.test(readme));
    ok("  three.webgpu.js imports its core by relative path as shipped (no edit)", /from '\.\/three\.core\.js'/.test(webgpu));
    ok("  the licence is three.js's MIT", /MIT License/.test(fs.readFileSync(path.join(V, "LICENSE"), "utf8")) && /three\.js authors/.test(fs.readFileSync(path.join(V, "LICENSE"), "utf8")));
    const src = fs.readFileSync(path.join(ENG, "render/badTvTsl.mjs"), "utf8"), wgsl = fs.readFileSync(path.join(ENG, "render/badTvWgsl.mjs"), "utf8");
    const consts = ["0.211324865405187", "0.366025403784439", "-0.577350269189626", "0.024390243902439", "1.79284291400159", "0.85373472095314", "130.0", "289.0", "34.0"];
    // the constants are checked WHERE THEY ARE USED (the vec4 C and the two multipliers), not anywhere in the file: the header
    // comment quotes 0.211324865405187 too, and a check that only asked "is the string in the file" let a retyped C through (v4319)
    const cLine = "vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439)";
    ok("the TSL simplex carries Ashima's constants digit for digit as the WGSL does (the C vector as one line, the two multipliers, the 130 and the 289)", src.includes(cLine) && wgsl.includes(cLine.replace("vec4(", "vec4f(")) && /float\(1\.79284291400159\)/.test(src) && /mul\(0\.85373472095314\)/.test(src) && /mul\(130\.0\)/.test(src) && consts.every((c) => wgsl.includes(c)), src.includes(cLine) ? "all nine" : "the C vector differs");
    ok("  the frequencies and gains are INTERPOLATED from badTvModel.mjs, not retyped (no literal 3.0, 50.0, 0.2 or 0.001 in the effect)", /COARSE_FREQ\)/.test(src) && /FINE_FREQ\)/.test(src) && /COARSE_GAIN\)/.test(src) && /FINE_GAIN\)/.test(src) && !/mul\(50\.0\)|mul\(3\.0\)|mul\(0\.001\)|mul\(0\.2\)/.test(src));
    ok("  the knobs are the device pass's, in its order, so one packKnobs() feeds both", TSL_KNOBS.join() === KNOB_ORDER.join());
    ok("  the cube is written in the original's order: offset * distortion * offset * distortion * offset", /coarse\.mul\(uniforms\.distortion\)\.mul\(coarse\)\.mul\(uniforms\.distortion\)\.mul\(coarse\)/.test(src));
    ok("  no three.js page mixes the two builds (nothing imports both vendor/three/ and vendor/three-webgpu/)", !fs.readdirSync(ENG).filter((f) => f.endsWith(".html")).some((f) => { const t = fs.readFileSync(path.join(ENG, f), "utf8"); return /vendor\/three\/three\.module\.js/.test(t) && /vendor\/three-webgpu\//.test(t); }));
}

const skip = webgpuSkipReason();
console.log("\n2. TSL RUNS HERE, ON BOTH BACKENDS: a uv gradient through a node material, read back, and each backend's row order measured");
let rowOrder = null;
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 64 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const out = { revision: THREE.REVISION, tslExports: Object.keys(T).length };
        for (const mode of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.N; canvas.height = a.N;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const errs = []; const gd = renderer.backend.device; if (gd && gd.addEventListener) gd.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 160)));
                const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                const mat = new THREE.MeshBasicNodeMaterial(); mat.colorNode = T.Fn(() => T.vec4(T.uv().x, T.uv().y, 0.5, 1.0))();
                scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
                const rt = new THREE.RenderTarget(a.N, a.N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                renderer.setRenderTarget(rt); for (let i = 0; i < 2; i++) await renderer.renderAsync(scene, cam);
                const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, a.N, a.N);
                const at = (x, y) => Array.from(px.slice((y * a.N + x) * 4, (y * a.N + x) * 4 + 4));
                o.backend = renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2"; o.row0 = at(0, 0); o.row0right = at(a.N - 1, 0); o.rowLast = at(0, a.N - 1); o.errs = errs.slice();
                // CONTROL, RE-MEASURED POST-RE-VENDOR (0.178 -> 0.185.1): three's WebGPU readback at a width
                // whose row is not 256-byte aligned (32 px = 128 bytes). At 0.178 this raised a validation
                // error and read nothing -- the staging buffer was undersized. At 0.185.1 it raises NO error,
                // and the returned buffer is bigger than a tightly-packed 32*32*4 (measured: 8064 bytes, not
                // 4096) -- because it carries the SAME 256-byte-per-row padding WebGPU's own
                // copyTextureToBuffer mandates, trimmed only on the final row's trailing pad (32*256-128 =
                // 8064). Read naively with a width-sized stride (the gate's own at() helper, above -- correct only
                // when width*4 is already 256-aligned, which is exactly why this gate keeps to such widths
                // elsewhere), every ODD row lands inside the PREVIOUS row's padding and reads as zero;
                // proven not to be real data loss by re-reading the SAME buffer at a 64-pixel (256-byte)
                // stride, which recovers a perfect, unbroken gradient on every row with nothing missing.
                // Both reads are captured here so the assertion below can show both halves of the finding
                // rather than asserting one and leaving the other to be taken on faith.
                if (mode === "webgpu") { const rt2 = new THREE.RenderTarget(32, 32); renderer.setRenderTarget(rt2); await renderer.renderAsync(scene, cam); const p2 = await renderer.readRenderTargetPixelsAsync(rt2, 0, 0, 32, 32);
                    const naive = (x, y) => Array.from(p2.slice((y * 32 + x) * 4, (y * 32 + x) * 4 + 4));
                    const padded = (x, y) => Array.from(p2.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
                    o.at32 = { errs: errs.length - o.errs.length, byteLen: p2.byteLength,
                        naiveRow0: naive(0, 0), naiveRow1: naive(0, 1),
                        paddedRows: Array.from({ length: 32 }, (_, y) => padded(0, y)) }; }
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out[mode] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result && r.result.webgpu && r.result.webgpu.error, r.result && r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        const R = r.result;
        ok(`three ${R.revision} loads with ${R.tslExports} TSL exports`, R.revision === "185" && R.tslExports > 400);
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            const gradientOk = o.row0 && o.row0[2] === 128 && o.row0right[2] === 128 && Math.abs(o.row0right[0] - 253) <= 2 && o.row0[0] <= 2;
            ok(`*** ${b}: the ${b === "webgpu" ? "WebGPU" : "WebGL2"} backend really is that backend, and a TSL colour node renders the uv gradient (x across, 0.5 in blue) ***`, o.backend === b && gradientOk && (o.errs || []).length === 0, `row 0: ${o.row0 && o.row0.join(",")} .. ${o.row0right && o.row0right.join(",")}; errors ${(o.errs || []).length}`); }
        rowOrder = { webgpu: R.webgpu.row0[1] > 128 ? "top-first" : "bottom-first", webgl2: R.webgl2.row0[1] > 128 ? "top-first" : "bottom-first" };
        ok("MEASURED, not assumed: readRenderTargetPixelsAsync hands rows TOP-first on WebGPU and BOTTOM-first on WebGL2 (v = 1 at row 0 there, v = 0 here) -- a caller comparing the two flips one", rowOrder.webgpu === "top-first" && rowOrder.webgl2 === "bottom-first", `webgpu ${rowOrder.webgpu} (green ${R.webgpu.row0[1]}), webgl2 ${rowOrder.webgl2} (green ${R.webgl2.row0[1]})`);
        // *** RE-MEASURED POST-RE-VENDOR: THE FAILURE MODE CHANGED SHAPE, AND IT IS NOT DATA LOSS. ***
        // At three@0.178 a WebGPU readback whose row is not 256-byte aligned (32 px = 128 bytes) raised a
        // validation error and read nothing -- the staging buffer was undersized, a real upstream bug. At
        // 0.185.1: 0 errors -- but the FIRST attempt at this control (asserting the naive read was simply
        // correct) went red itself: a width-sized stride read tl/tr fine and bl/br (y=31) as all zeros. NOT
        // three misbehaving -- MEASURED: the buffer is 8064 bytes, not the 4096 a tightly-packed 32x32x4
        // would be, because it carries the SAME 256-byte-per-row padding copyTextureToBuffer mandates
        // (32 rows x 256 bytes, minus the final row's trailing pad this API trims: 32*256-128 = 8064, exact).
        // A caller reading with `width` as the stride -- correct only when width*4 is already 256-aligned,
        // which is exactly why this gate keeps to such widths elsewhere -- lands every ODD row inside the
        // PREVIOUS row's padding and reads zero. Re-reading the SAME bytes at the real (256-byte / 64-pixel)
        // stride recovers a perfect, unbroken gradient on all 32 rows: nothing is lost, nothing is wrong,
        // the row math was. THE GATE STILL KEEPS TO 256-BYTE-ALIGNED WIDTHS ELSEWHERE ON PURPOSE -- this
        // control now demonstrates why: at an unaligned width, correctness depends on stride-awareness this
        // gate's own simple `at()` does not have, not on hoping upstream never pads.
        {
            const c = R.webgpu.at32;
            const naiveRow1IsZero = c && c.naiveRow1 && c.naiveRow1.every((v) => v === 0);
            const naiveRow0Ok = c && c.naiveRow0 && c.naiveRow0[2] === 128 && c.naiveRow0[3] === 255;
            const rows = c && c.paddedRows;
            const paddedAllOk = rows && rows.length === 32 && rows.every((p, y) =>
                p[2] === 128 && p[3] === 255 && (y === 0 || p[1] < rows[y - 1][1]));   // G strictly falls row over row -- a real, unbroken gradient
            const ok32 = !!c && c.errs === 0 && c.byteLen === 8064 && naiveRow0Ok && naiveRow1IsZero && paddedAllOk;
            ok("CONTROL: three@0.185.1's WebGPU readback at 32 px (a 128-byte row, not 256-aligned) raises no error, returns a 256-byte-per-row PADDED buffer (8064 bytes, not 4096) -- a width-strided read misreads every odd row as zero, and the SAME bytes at the true stride are a perfect gradient: not corruption, a stride the naive read does not know to expect",
                ok32, c ? `errs ${c.errs}, byteLen ${c.byteLen}; naive row0 ${c.naiveRow0 && c.naiveRow0.join(",")} row1 ${c.naiveRow1 && c.naiveRow1.join(",")}; padded rows all-ok ${paddedAllOk}` : "no control ran");
        }
    }
}

console.log("\n3. badTv IN TSL: one graph, two compilers, and each picture is the hand-written pair's, TO THE BYTE, after the row mirror");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 64, TIME: 1.5 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const B = await import("/render/badTvTsl.mjs"); const D = await import("/render/badTvDevicePass.mjs"); const M = await import("/render/badTvModel.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const N = a.N, src = new Uint8Array(N * N * 4); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; src[i] = Math.round(x * 255 / (N - 1)); src[i + 1] = Math.round(y * 255 / (N - 1)); src[i + 2] = 0; src[i + 3] = 255; }
        const knobs = D.packKnobs({ time: a.TIME });
        const out = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const pipe = dev.pipeline(D.badTvPipelineDesc()); const tex = dev.texture({ width: N, height: N, data: src, nearest: true });
                const devPx = (await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe); for (let i = 0; i < D.KNOB_ORDER.length; i++) pass.uniform(D.KNOB_ORDER[i], knobs[i]); pass.texture("tDiffuse", tex, 0); pass.draw(3); }, { read: true, depth: false })).pixels;
                const canvas = document.createElement("canvas"); canvas.width = N; canvas.height = N;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: backend === "webgl2", antialias: false }); await renderer.init();
                const fx = B.makeBadTvTsl(THREE, T, { texture: B.sourceTexture(THREE, { pixels: src, width: N, height: N }) }); fx.setKnobs({ time: a.TIME });
                const rt = new THREE.RenderTarget(N, N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                renderer.setRenderTarget(rt); for (let i = 0; i < 2; i++) await renderer.renderAsync(fx.scene, fx.camera);
                const raw = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, N, N);
                const isGL = !renderer.backend.isWebGPUBackend; const tsl = new Uint8Array(N * N * 4);
                for (let y = 0; y < N; y++) tsl.set(raw.subarray((isGL ? (N - 1 - y) : y) * N * 4, ((isGL ? (N - 1 - y) : y) + 1) * N * 4), y * N * 4);
                const stats = (A, Bp, mirror) => { let same = 0, worst = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4, j = ((mirror ? N - 1 - y : y) * N + x) * 4; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(A[i + c] - Bp[j + c])); if (d === 0) same++; worst = Math.max(worst, d); } return { same, worst }; };
                o.asIs = stats(devPx, tsl, false); o.mirrored = stats(devPx, tsl, true);
                let modelSame = 0, modelWorst = 0;
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = (x + 0.5) / N, v = 1 - (y + 0.5) / N; const s = M.sampleAt(u, v, a.TIME, {}); const sx = Math.floor(s[0] * N) % N, sy = Math.floor(s[1] * N) % N;
                    const i = (y * N + x) * 4; const d = Math.max(Math.abs(tsl[i] - Math.round(sx * 255 / (N - 1))), Math.abs(tsl[i + 1] - Math.round(sy * 255 / (N - 1)))); if (d === 0) modelSame++; modelWorst = Math.max(modelWorst, d); }
                o.model = { same: modelSame, worst: modelWorst }; o.backend = renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2"; o.total = N * N;
                // the tear is real: the picture is not the source
                let moved = 0; for (let i = 0; i < N * N * 4; i += 4) if (tsl[i] !== src[i] || tsl[i + 1] !== src[i + 1]) moved++; o.moved = moved;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result && r.result.webgpu && r.result.webgpu.error, r.result && r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error) {
        for (const b of ["webgpu", "webgl2"]) { const o = r.result[b];
            ok(`*** ${b}: the TSL badTv, row-mirrored, is the device pass's picture on EVERY pixel (${o.mirrored.same} of ${o.total}, worst 0) -- three's ${b === "webgpu" ? "WGSL" : "GLSL"} builder against our hand-written ${b === "webgpu" ? "WGSL" : "GLSL"} ***`, o.backend === b && o.mirrored.same === o.total && o.mirrored.worst === 0, `mirrored ${o.mirrored.same}/${o.total} (worst ${o.mirrored.worst})`);
            ok(`  ${b}: unmirrored the two agree on NO pixel -- the mirror is real (${THREE_PASS_RELATION.relation})`, o.asIs.same === 0, `as-is ${o.asIs.same}/${o.total}, worst ${o.asIs.worst}`);
            ok(`  ${b}: and every pixel is the CPU model's texel (badTvModel.sampleAt in three's uv), while the tear moved most of the picture`, o.model.same === o.total && o.model.worst === 0 && o.moved > o.total * 0.5, `model ${o.model.same}/${o.total}; ${o.moved} pixels moved from the source`); }
    }
}

console.log("\n4. PHYSICS AS TSL NODES: Wien's root by a TSL Loop, the key read off both backends");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 256 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js"); const BB = await import("/render/blackbodyTsl.mjs");
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.N; canvas.height = a.N;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const errs = []; const gd = renderer.backend.device; if (gd && gd.addEventListener) gd.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const rt = new THREE.RenderTarget(a.N, a.N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const read = async (n) => { const k = BB.makeBlackbodyKeyTsl(THREE, T, { nLo: n, nHi: n }); renderer.setRenderTarget(rt); for (let i = 0; i < 2; i++) await renderer.renderAsync(k.scene, k.camera);
                    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, a.N, a.N); const rows = []; let blue = 0;
                    for (let y = 0; y < a.N; y += 16) { let best = -1, bx = 0; for (let x = 0; x < a.N; x++) { const i = (y * a.N + x) * 4; const v = (px[i] + px[i + 1] / 255) / 255; if (v > best) { best = v; bx = x; } } rows.push({ peakX: 12 * (bx + 0.5) / a.N, peak: best }); blue = px[(y * a.N + 3) * 4 + 2]; }
                    return { rows, blue }; };
                o.n5 = await read(5); o.n3 = await read(3); o.errs = errs; o.backend = renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2"; o.bin = 12 / a.N;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out[mode] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result && r.result.webgpu && r.result.webgpu.error, r.result && r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error) {
        const k5 = keyCpu(5), k3 = keyCpu(3);
        for (const b of ["webgpu", "webgl2"]) { const o = r.result[b];
            ok(`*** ${b}: a TSL Loop of ${NEWTON_STEPS} Newton steps finds Wien's root -- the brightest column on every sampled row is x_lambda = 4.965114 within a column (${o.bin.toFixed(3)}) for n = 5, and x_nu = 2.821439 for n = 3 ***`, o.backend === b && o.n5.rows.every((w) => Math.abs(w.peakX - k5.root) <= o.bin) && o.n3.rows.every((w) => Math.abs(w.peakX - k3.root) <= o.bin) && o.errs.length === 0, `n=5 peak x ${o.n5.rows[0].peakX.toFixed(4)}, n=3 ${o.n3.rows[0].peakX.toFixed(4)}; errors ${o.errs.length}`);
            ok(`  ${b}: the root rides in the blue byte (${k5.blueByte} for n = 5, ${k3.blueByte} for n = 3), and the peak column decodes to 1`, Math.abs(o.n5.blue - k5.blueByte) <= 1 && Math.abs(o.n3.blue - k3.blueByte) <= 1 && o.n5.rows.every((w) => w.peak > 0.995), `blue ${o.n5.blue} / ${o.n3.blue}, peak ${o.n5.rows[0].peak.toFixed(4)}`); }
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4319.
//   A  select's arguments swapped (the simplex corner choice inverted) -> exit=1, 4 red: on both backends the TSL picture parts
//      from the device pass on 768 of 4,096 pixels and from the model on the same -- noise that still looks like noise, caught
//      numerically, as badTvWgsl.mjs's header said it would have to be.
//   B  the cube written as offset * distortion -> exit=1, 5 red: the source line and, on both backends, 3,456 of 4,096 pixels
//      wrong against the pass and the model.
//   C  the C vector's first constant retyped to twelve digits (0.211324865405 for 0.211324865405187) -> the PIXELS DO NOT
//      MOVE (1.9e-13 is below what f32 can hold) and the first text check did not see it either, because the header comment
//      quotes the full constant; the check now reads the vec4 line itself -> exit=1, 1 red (the text line). A drift the picture
//      cannot show is caught by the text, and the log says which.
//   D  the TSL Newton started at x = 1 -> exit=1, 4 red: both backends find the trivial root (blue byte 0 for 158 and 90) and
//      the brightest column is the first -- the same failure the WGSL's sabotage D showed at v4318, in TSL.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: TSL's OWN noise and effects (mx_noise etc. -- this round writes the tree's arithmetic in TSL, it does not adopt three's); " +
    "presenting to a canvas on WebGPU in this headless shell (the device is lost on present, as gfx/device.js's offscreen flag already knows, so " +
    "every picture here is a render target); the generated WGSL/GLSL text (three keeps it inside the renderer; step 4 of the roadmap reads it out); and " +
    "a real GPU's compilers, which SwiftShader's are not.");
process.exit(fails ? 1 : 0);
