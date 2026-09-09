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

let threeRev = null;   // v4542: read from the build in section 1, and section 2 holds the RUNNING module to it
console.log("\n1. THE VENDORED BUILD: the vendored WebGPU build and TSL, beside r160, with exactly one edit");
{
    const files = ["three.webgpu.js", "three.core.js", "three.tsl.js", "LICENSE", "README.md"];
    ok("vendor/three-webgpu carries the WebGPU build, its core, TSL, the MIT licence and a README", files.every((f) => fs.existsSync(path.join(V, f))), files.filter((f) => !fs.existsSync(path.join(V, f))).join(", ") || "all present");
    const webgpu = fs.readFileSync(path.join(V, "three.webgpu.js"), "utf8"), tsl = fs.readFileSync(path.join(V, "three.tsl.js"), "utf8"), readme = fs.readFileSync(path.join(V, "README.md"), "utf8");
    const rev = (webgpu.match(/REVISION = '(\d+)'/) || webgpu.match(/const REVISION = '(\d+)'/) || [null, null])[1] || (fs.readFileSync(path.join(V, "three.core.js"), "utf8").match(/REVISION = '(\d+)'/) || [])[1];
    // v4542 -- THE REVISION WAS TYPED HERE IN TWO PLACES AND THE BUMP MADE BOTH WRONG. What this row is actually
    // for is that the vendored BUILD, the README's heading and the tarball the README says it came from all name
    // one revision; a number retyped beside them is a fourth claim nobody rechecks. So all three are read and held
    // to each other -- which also catches a bump that edits the heading and leaves the tarball URL behind, a drift
    // a typed constant could never have seen.
    const readmeRev = (readme.match(/^#\s*three\.js\s+0\.(\d+)\.\d+/m) || [])[1];
    const tarballRev = (readme.match(/three@0\.(\d+)\.\d+\.tgz|three-0\.(\d+)\.\d+\.tgz/) || []).slice(1).find(Boolean);
    ok(`the vendored build, the README's heading and the tarball it names are ONE revision (r${rev}), beside r160 -- the r160 module stays for main.js and every three.js page`,
       !!rev && readmeRev === rev && tarballRev === rev && fs.existsSync(path.join(ENG, "vendor/three/three.module.js")),
       `build r${rev}, README heading 0.${readmeRev}.x, tarball 0.${tarballRev}.x`);
    threeRev = rev;
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
                // CONTROL: three 0.178's WebGPU readback at a width whose row is not 256-byte aligned (32 px): the staging buffer is undersized
                if (mode === "webgpu") { const rt2 = new THREE.RenderTarget(32, 32); renderer.setRenderTarget(rt2); await renderer.renderAsync(scene, cam); const p2 = await renderer.readRenderTargetPixelsAsync(rt2, 0, 0, 32, 32);
                    const at = (stride, x, y) => Array.from(p2.slice(y * stride + x * 4, y * stride + x * 4 + 4));
                    o.at32 = { errs: errs.length - o.errs.length, len: p2.length, rowBytes: 32 * 4, paddedRow: 256,
                               row0: at(128, 0, 0), row0right: at(128, 31, 0),
                               lastAtWidth: at(128, 0, 31), lastAtPadded: at(256, 0, 31) }; }
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out[mode] = o;
        }
        return out;
    }` });
    ok("the harness ran both backends", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? JSON.stringify([r.result && r.result.webgpu && r.result.webgpu.error, r.result && r.result.webgl2 && r.result.webgl2.error]) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.webgpu && r.result.webgl2) {
        const R = r.result;
        // v4542: held to the build read off disk in section 1, not to a typed "178" -- which also answers a question
        // the typed form could not, namely whether the page loaded the build this repo vendors or some other one.
        ok(`the module the PAGE loaded is the build this repo vendors (r${R.revision} == r${threeRev}) and it carries ${R.tslExports} TSL exports`, R.revision === threeRev && R.tslExports > 400, `page r${R.revision}, vendored r${threeRev}, ${R.tslExports} exports`);
        for (const b of ["webgpu", "webgl2"]) { const o = R[b];
            const gradientOk = o.row0 && o.row0[2] === 128 && o.row0right[2] === 128 && Math.abs(o.row0right[0] - 253) <= 2 && o.row0[0] <= 2;
            ok(`*** ${b}: the ${b === "webgpu" ? "WebGPU" : "WebGL2"} backend really is that backend, and a TSL colour node renders the uv gradient (x across, 0.5 in blue) ***`, o.backend === b && gradientOk && (o.errs || []).length === 0, `row 0: ${o.row0 && o.row0.join(",")} .. ${o.row0right && o.row0right.join(",")}; errors ${(o.errs || []).length}`); }
        rowOrder = { webgpu: R.webgpu.row0[1] > 128 ? "top-first" : "bottom-first", webgl2: R.webgl2.row0[1] > 128 ? "top-first" : "bottom-first" };
        ok("MEASURED, not assumed: readRenderTargetPixelsAsync hands rows TOP-first on WebGPU and BOTTOM-first on WebGL2 (v = 1 at row 0 there, v = 0 here) -- a caller comparing the two flips one", rowOrder.webgpu === "top-first" && rowOrder.webgl2 === "bottom-first", `webgpu ${rowOrder.webgpu} (green ${R.webgpu.row0[1]}), webgl2 ${rowOrder.webgl2} (green ${R.webgl2.row0[1]})`);
        // *** v4542 -- THIS ROW ASSERTED A VALIDATION ERROR THAT r184 NO LONGER RAISES, AND THE FIRST REWRITE OF IT
        // SAID "r184 FIXED IT". THAT WAS WRONG, AND WHAT CAUGHT IT WAS ADDING THE BYTE COUNT. *** At 0.178 a readback
        // at a width whose row is not 256-byte aligned raised a validation error and read nothing. At 0.184 it raises
        // NOTHING and returns the 256-byte-PADDED staging buffer with the padding still in it. MEASURED at three
        // widths: 64 px (a 256-byte row, already aligned) gives w*h*4 exactly; 32 px gives 8,064 bytes and 16 px
        // gives 3,904, both exactly paddedRow*(h-1) + rowBytes. Row 0 is right either way, which is why sampling it
        // alone looked like a fix; from row 1 a caller indexing by width*4 walks off into the padding, and the last
        // row reads [0,0,0,0] against the [4,4,128,255] that is really there.
        //
        // So an ERROR became a SILENT WRONG PICTURE, which is worse, and the gate's original conclusion -- keep to
        // 256-aligned widths -- still stands with its stated reason replaced. The row asserts the padded shape, the
        // right pixel at the padded stride, and the wrong one at the width stride, because a row that asserted only
        // "no error" or only row 0 would have passed on exactly the hazard.
        const c32 = R.webgpu.at32;
        const grad32 = c32 && c32.row0 && c32.row0[2] === 128 && c32.row0right[2] === 128 && Math.abs(c32.row0right[0] - 250) <= 6 && c32.row0[0] <= 6;
        const paddedLen = c32 && c32.paddedRow * 31 + c32.rowBytes;
        ok("*** r184 does NOT fix the unaligned readback -- it stops REPORTING it: at 32 px (a 128-byte row) WebGPU raises no error and hands back the 256-byte-padded buffer, right in row 0 and wrong from row 1, so a caller indexing by width silently misreads. The 256-aligned rule this arc keeps to still holds; only its reason has changed ***",
           !!c32 && c32.errs === 0 && grad32 && c32.len === paddedLen && c32.len !== 32 * 32 * 4
           && c32.lastAtPadded[3] === 255 && c32.lastAtPadded[2] === 128 && c32.lastAtWidth.every((v) => v === 0),
           c32 ? `${c32.errs} error(s), ${c32.len} bytes (padded ${paddedLen}, unpadded ${32 * 32 * 4}); row 0 ${c32.row0.join(",")} .. ${c32.row0right.join(",")}; last row at width-stride ${c32.lastAtWidth.join(",")}, at padded stride ${c32.lastAtPadded.join(",")}` : "no control ran");
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
// MEASURED at v4542. Applied, this gate run, red count read, source and README restored and md5-verified. Baseline 0.
//   BB the README's heading naming a revision the build is not -> 1 red. The revision used to be TYPED here in two
//      places and the bump made both wrong; the row reads the build, the README's heading and the tarball the README
//      says it came from, and holds all three to each other -- which also catches a bump that edits the heading and
//      leaves the tarball URL behind, a drift no typed constant could see.
//   CC the readback row's two strides made one -> 1 red. Without the padded/unpadded distinction the row could not
//      tell that r184 hands back a PADDED buffer, which is the whole finding: an earlier draft of this row said
//      "r184 FIXED the unaligned readback" and was wrong, and what caught it was asserting the byte count as well
//      as the pixel. Row 0 is right at either stride; only the length and a later row tell them apart.
//   No 0-RED.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: TSL's OWN noise and effects (mx_noise etc. -- this round writes the tree's arithmetic in TSL, it does not adopt three's); " +
    "presenting to a canvas on WebGPU in this headless shell (the device is lost on present, as gfx/device.js's offscreen flag already knows, so " +
    "every picture here is a render target); the generated WGSL/GLSL text (three keeps it inside the renderer; step 4 of the roadmap reads it out); and " +
    "a real GPU's compilers, which SwiftShader's are not.");
process.exit(fails ? 1 : 0);
