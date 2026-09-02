#!/usr/bin/env node
// WebGLEngine/tools/ship/tslPhysics-selfcheck.mjs -- v4321
//
// GRADES PHYSICS AS TSL NODES (docs/TSL-ROADMAP.md step 5): swk_lyapunov's exponent and the Heidler current written as
// TSL functions (render/physicsTsl.mjs), graded by the keys their WGSL and GLSL twins are held to -- ln 2 at r = 4 within
// 2e-3, the period-3 window dark; the lightning's peak over i0 an exact 1 at the true eta (1e-4) and 1.0667 at the
// published one (1e-3) -- read off both of three's backends through the TSL render path, and then AGAIN through
// gfx/device.js after render/tslSource.mjs transplants the emitted fragments: generated physics in the device's own
// pipeline, the same keys. Every number is read back from a picture; the shader is never handed the answer.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { LN2, PERIOD3, LY_DEFAULTS, truePeak, etaStandard, PARAMS } from "../../render/physicsTsl.mjs";
import { keyCpu } from "../../render/heidlerWgsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted-physics.json");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const median = (a) => { const s = Array.from(a).sort((x, y) => x - y); return s[s.length >> 1]; };

console.log("\n1. THE KEYS, FROM THE MODULES THE GATE TRUSTS: ln 2, the true eta and the published one, the period-3 window");
const k = keyCpu(PARAMS.first);
{
    const src = fs.readFileSync(path.join(ENG, "render/physicsTsl.mjs"), "utf8");
    ok("the Heidler twin says the peak over i0 is 1 at the true eta and 1.0667 at the published eta (the module's finding, not the shader's)", k.atTrueEta === 1 && Math.abs(k.atStandardEta - 1.0667) < 1e-3, `${k.atTrueEta}, ${k.atStandardEta.toFixed(4)}; true eta ${k.trueEta.toFixed(5)}, standard ${k.standard.toFixed(5)}`);
    ok("the TSL modules take their constants from the modules (imported DEFAULTS, PARAMS, LN2), and the Lyapunov log has its 2", /import \{ LN2, DEFAULTS as LY_DEFAULTS, PERIOD3[^}]*\} from "\.\/lyapunovWgsl\.mjs"/.test(src) && /x\.mul\(2\.0\)/.test(src) && /r\.mul\(x\)\.mul\(float\(1\.0\)\.sub\(x\)\)/.test(src) && /t\.div\(t1\)\.mul\(t\.div\(t1\)\)/.test(src) && !/\b3\.4\b|\b0\.05\b|\b485\b/.test(src.split("// ---- v4322")[0].replace(/\/\/.*$/gm, "")));   // the v4322 look section carries the LOOK's own literals (0.05, 0.9: the seed span), which are lyapunovWgsl's
    ok("  the uniforms are labelled (render/tslSource.mjs binds by the label): the two keys' ten and the look's two", (src.match(/\.label\("/g) || []).length === 12);
}

const skip = webgpuSkipReason();
console.log("\n2. THROUGH THREE, ON BOTH BACKENDS: the exponent's key, the window, and the lightning's two peaks, read off pictures");
console.log("\n3. THROUGH gfx/device.js, TRANSPLANTED: the same keys from the fragments three generated");
let R = null;
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 128, W: 256, LO: PERIOD3.lo, HI: PERIOD3.hi, rLo: LY_DEFAULTS.rLo, rHi: LY_DEFAULTS.rHi, eStd: etaStandard(PARAMS.first.t1, PARAMS.first.t2), eTrue: truePeak(PARAMS.first.t1, PARAMS.first.t2).peak, first: PARAMS.first }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js"); const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = { three: {}, device: {}, emitted: {} };
        const colMedians = (px, W, H, dec) => { const cols = []; for (let x = 0; x < W; x++) { const c = []; for (let y = 0; y < H; y++) c.push(dec(px, (y * W + x) * 4)); c.sort((p, q) => p - q); cols.push(c[c.length >> 1]); } return cols; };
        const maxOf = (px, n, dec) => { let m = -1; for (let i = 0; i < n; i++) m = Math.max(m, dec(px, i * 4)); return m; };
        const emitted = { lyapunov: {}, heidler: {} };
        for (const mode of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const canvas = document.createElement("canvas"); canvas.width = a.W; canvas.height = a.N;
                const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
                const errs = []; const gd = renderer.backend.device; if (gd && gd.addEventListener) gd.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const rt = new THREE.RenderTarget(a.W, a.N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
                const draw = async (kit) => { renderer.setRenderTarget(rt); for (let i = 0; i < 2; i++) await renderer.renderAsync(kit.scene, kit.camera); return renderer.readRenderTargetPixelsAsync(rt, 0, 0, a.W, a.N); };
                // lyapunov at r = 4: every pixel the key; then the sweep
                const ly4 = P.makeLyapunovKeyTsl(THREE, T, { rLo: 4, rHi: 4 }); const p4 = await draw(ly4);
                const lams = []; for (let i = 0; i < a.W * a.N; i++) lams.push(P.decodeLyapunov(p4, i * 4)); lams.sort((p, q) => p - q); o.lyMedian = lams[lams.length >> 1];
                const lySweep = P.makeLyapunovKeyTsl(THREE, T, {}); const ps = await draw(lySweep); o.lyCols = colMedians(ps, a.W, a.N, P.decodeLyapunov);
                emitted.lyapunov[mode] = (await S.emitShaders(renderer, { scene: lySweep.scene, camera: lySweep.camera, mesh: lySweep.scene.children[0] })).fragment;
                // heidler at the true eta and the standard one
                const hT = P.makeHeidlerKeyTsl(THREE, T, {}); const pT = await draw(hT); o.heidlerTrue = maxOf(pT, a.W * a.N, P.decodeHeidler);
                const hS = P.makeHeidlerKeyTsl(THREE, T, { eta: a.eStd }); const pS = await draw(hS); o.heidlerStd = maxOf(pS, a.W * a.N, P.decodeHeidler);
                emitted.heidler[mode] = (await S.emitShaders(renderer, { scene: hT.scene, camera: hT.camera, mesh: hT.scene.children[0] })).fragment;
                o.errs = errs; o.backend = renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2";
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out.three[mode] = o;
        }
        // the transplant into gfx/device.js
        let descLy, descH; try { descLy = S.devicePipelineFromTsl({ wgsl: emitted.lyapunov.webgpu, glsl: emitted.lyapunov.webgl2 }); descH = S.devicePipelineFromTsl({ wgsl: emitted.heidler.webgpu, glsl: emitted.heidler.webgl2 }); } catch (e) { out.transplantError = String(e && e.message || e).slice(0, 300); return out; }
        out.emitted = { lyapunov: { wgsl: emitted.lyapunov.webgpu, glsl: emitted.lyapunov.webgl2, transplanted: { wgsl: descLy.shaders.wgsl, glsl: descLy.shaders.glsl.fragment } }, heidler: { wgsl: emitted.heidler.webgpu, glsl: emitted.heidler.webgl2, transplanted: { wgsl: descH.shaders.wgsl, glsl: descH.shaders.glsl.fragment } } };
        out.uniforms = { lyapunov: descLy.uniforms.map((u) => u.name), heidler: descH.uniforms.map((u) => u.name) };
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = a.W; cv.height = a.N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const draw = (pd, bind) => dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(dev.pipeline(pd)); bind(pass); pass.draw(3); }, { read: true, depth: false });
                const ly4 = (await draw(descLy, (pass) => { pass.uniform("rLo", 4); pass.uniform("rHi", 4); pass.uniform("seedLo", 0.05); pass.uniform("seedHi", 0.95); })).pixels;
                const lams = []; for (let i = 0; i < a.W * a.N; i++) lams.push(P.decodeLyapunov(ly4, i * 4)); lams.sort((p, q) => p - q); o.lyMedian = lams[lams.length >> 1];
                const sweep = (await draw(descLy, (pass) => { pass.uniform("rLo", a.rLo); pass.uniform("rHi", a.rHi); pass.uniform("seedLo", 0.05); pass.uniform("seedHi", 0.95); })).pixels; o.lyCols = colMedians(sweep, a.W, a.N, P.decodeLyapunov);
                const bindH = (eta) => (pass) => { pass.uniform("i0", a.first.i0); pass.uniform("t1", a.first.t1); pass.uniform("t2", a.first.t2); pass.uniform("eta", eta); pass.uniform("tLo", a.first.t1 / 50); pass.uniform("tHi", a.first.t2 * 8); };
                o.heidlerTrue = maxOf((await draw(descH, bindH(a.eTrue))).pixels, a.W * a.N, P.decodeHeidler); o.heidlerStd = maxOf((await draw(descH, bindH(a.eStd))).pixels, a.W * a.N, P.decodeHeidler); o.backend = dev.backend;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out.device[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran (three on both backends, then the device on both)", r.ok && r.result && r.result.three.webgpu && r.result.three.webgl2 && !r.result.three.webgpu.error && !r.result.three.webgl2.error && !r.result.transplantError, r.ok ? (r.result.transplantError || JSON.stringify([r.result.three.webgpu && r.result.three.webgpu.error, r.result.three.webgl2 && r.result.three.webgl2.error])) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.three.webgpu && !r.result.transplantError) {
        R = r.result;
        const grade = (o, via, b) => {
            if (!o || o.error) { ok(`${via} ${b} ran`, false, o && o.error); return; }
            ok(`*** ${via} ${b}: the Lyapunov key at r = 4 decodes to ln 2 over the whole picture, median within 2e-3 ***`, Math.abs(o.lyMedian - LN2) < 2e-3, `median ${o.lyMedian.toFixed(6)}, |err| ${Math.abs(o.lyMedian - LN2).toExponential(2)}`);
            const colR = (x) => LY_DEFAULTS.rLo + (x + 0.5) / o.lyCols.length * (LY_DEFAULTS.rHi - LY_DEFAULTS.rLo);
            const win = o.lyCols.filter((_, x) => colR(x) > PERIOD3.lo + 0.004 && colR(x) < PERIOD3.hi - 0.004), hot = o.lyCols.filter((_, x) => colR(x) > 3.95);
            ok(`  ${via} ${b}: the period-3 window is dark (negative median, most columns) and r near 4 bright`, win.length >= 2 && median(win) < 0 && win.filter((v) => v < 0).length >= win.length * 0.6 && median(hot) > 0.4, `window median ${median(win).toFixed(3)} over ${win.length} columns; near 4 ${median(hot).toFixed(3)}`);
            ok(`*** ${via} ${b}: the lightning's peak over i0 reads 1 at the true eta (1e-4) and 1.0667 at the published one (1e-3) ***`, Math.abs(o.heidlerTrue - 1) < 1e-4 && Math.abs(o.heidlerStd - 1.0667) < 1e-3, `${o.heidlerTrue.toFixed(5)}, ${o.heidlerStd.toFixed(4)}`);
        };
        for (const b of ["webgpu", "webgl2"]) grade(R.three[b], "three's TSL path,", b);
        ok("the emitted fragments transplant (labelled uniforms in three's order: the Lyapunov key's four, the Heidler key's six)", R.uniforms && R.uniforms.lyapunov.slice().sort().join() === "rHi,rLo,seedHi,seedLo" && R.uniforms.heidler.slice().sort().join() === "eta,i0,t1,t2,tHi,tLo", JSON.stringify(R.uniforms));
        for (const b of ["webgpu", "webgl2"]) grade(R.device[b], "the device, transplanted,", b);
        const rec = { at: "v4321", three: "0.178.0", note: "emitted by three's node builders from render/physicsTsl.mjs and transplanted by render/tslSource.mjs; rewritten by tools/ship/tslPhysics-selfcheck.mjs on every run", ...R.emitted };
        fs.writeFileSync(EMITTED, JSON.stringify(rec, null, 1));
        ok("the emitted pairs are written to tools/ship/tsl-emitted-physics.json for the WGSL corpus", fs.existsSync(EMITTED));
        report(`three's TSL path and the transplanted device path agree on ln 2 to ${Math.abs(R.three.webgpu.lyMedian - R.device.webgpu.lyMedian).toExponential(1)} on WebGPU and ${Math.abs(R.three.webgl2.lyMedian - R.device.webgl2.lyMedian).toExponential(1)} on WebGL2`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4321.
//   A  the Lyapunov log's 2 dropped (log|r(1 - x)| for log|r(1 - 2x)|) -> exit=1, 9 red: the source line, and on every path and
//      backend the exponent reads 0.000077 for ln 2 and the window and the bright end both read 0 -- the same sabotage
//      lyapunovWgsl's gate logged at v4315, in TSL, caught four ways.
//   B  the Heidler shape with (t/t1) for (t/t1)^2 -> exit=1, 5 red: the source line, and on every path and backend the peak
//      over i0 reads 0.85081 at the true eta and 0.9076 at the published one -- heidlerWgsl's sabotage B, reproduced in TSL.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the Chaos race's hull painted by the TSL node (the race is a device pipeline; a NodeMaterial version would be the next rung); " +
    "the Lyapunov Loop's cost through three (448 iterations a pixel, timed by nobody); and a real GPU's log() and exp() against SwiftShader's.");
process.exit(fails ? 1 : 0);
