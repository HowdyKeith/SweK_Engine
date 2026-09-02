#!/usr/bin/env node
// WebGLEngine/tools/ship/tslPhysics-selfcheck.mjs -- v4321
//
// GRADES PHYSICS AS TSL NODES (docs/TSL-ROADMAP.md step 5): swk_lyapunov's exponent and the Heidler current written as
// TSL functions (render/physicsTsl.mjs), graded by the keys their WGSL and GLSL twins are held to -- ln 2 at r = 4 within
// 2e-3, the period-3 window dark; the lightning's peak over i0 an exact 1 at the true eta (1e-4) and 1.0667 at the
// published one (1e-3) -- read off both of three's backends through the TSL render path, and then AGAIN through
// gfx/device.js after render/tslSource.mjs transplants the emitted fragments: generated physics in the device's own
// pipeline, the same keys. Every number is read back from a picture; the shader is never handed the answer.
// v4329 -- AND IT NOW CHECKS THE SPLIT IT WAS PART OF. render/physicsTsl.mjs was named for physics and had grown
// three fleet shells and five looks by v4328; they moved to render/fleetTsl.mjs. Section 1 asks the exact question
// that keeps them apart -- does the physics module contain shader text at all -- because a shell is a vertex stage
// written out in both languages and a look that drifts back would bring one with it.
//
// SABOTAGE P, MEASURED at v4329: a shell put back into render/physicsTsl.mjs (a two-language template on an export
// named ...Shell) -> exit=1, 2 red here BY NAME, and 5 more in tools/ship/backendParity-selfcheck.mjs, whose census
// sees the markers arrive: glslBearing 145 -> 146, wgslBearing 56 -> 57, both 13 -> 14, the directive/framework
// split, and the shader-module list growing to eleven. Seven red for one function in the wrong file.
// v4331 -- AND THE COMPUTE STAGE, WHICH IS THE ONE PLACE THIS TREE'S PAIR CONTRACT DOES NOT APPLY. Every other
// transplant in this arc is held to a WGSL/GLSL pair; WebGL2 has no compute stage, so a compute pass has no pair to
// be held to and gfx/device.js says so by name. What it can still be held to is a hand-written twin and the CPU
// model, and section 4 does both.
//
// *** AND THE CLAIM IS NOT "BIT FOR BIT", BECAUSE THE SUBJECT IS A CHAOTIC MAP. *** Measured, on the same 64-element
// sweep: the generated pass and the hand-written one are bit-identical on every element whose exponent is NEGATIVE
// (22 of 22, at both sample counts), and part on the same five chaotic elements at both counts -- by 2.5e-5 after 12
// iterations and 4.5e-2 after 448. Two modules compiled separately may round a multiply-add differently, and on a
// chaotic orbit that one ulp is the whole difference by the end; the growth rate IS the Lyapunov exponent this pass
// computes. So the gate asserts bits where bits are meaningful, measures the divergence where they are not, and
// claims no bound at all against the CPU's f64 on the chaotic elements -- a tolerance wide enough to cover that
// would assert nothing.
//
// v4336 -- AND A PASS THAT READS ONE (section 5). Every real compute pass in render/gpuDriven.mjs reads buffers as
// well as writing them; until now this transplant had only ever written. The shell is where READ-ONLY is stated,
// because three declares every buffer it touches as read_write whether the graph writes to it or not, and the
// transplant matches a generated buffer to a shell entry BY ROLE -- which one the body assigns to -- rather than by
// the order three emitted them in. Two dispatches on one frame's encoder, the second bound to the first's buffer,
// and the mask it writes is the sign of the sweep's own output on all 64 elements. The keyed part: every element the
// mask calls periodic above r = 3.8 lies inside [1 + sqrt(8), 3.857] -- the period-3 window, whose edge this tree
// owns exactly.
//
// v4337 -- AND AN ATOMIC ONE (section 6). render/gpuDriven.mjs's cull pass counts survivors into an indirect draw's
// instanceCount, which every invocation may increment at once; nothing transplanted here had ever done that. A shell
// entry may now say `atomic: true`, and the pair must agree -- three writes atomicAdd(&buf.value[i], ...) and WGSL
// takes that pointer only into an atomic<T>, so a shell that forgot is refused by name rather than by the compiler.
// The counter is also a WRITTEN buffer that nothing assigns to, so the role detector looks for the atomic call too.
//
// *** AND THE ATOMIC IS MEASURED, NOT ASSUMED. *** The same transplanted module with the atomic taken out by hand --
// a plain read-modify-write on a plain u32 -- compiles, runs, and counts 156 to 171 where the truth is 670: 74% to
// 77% of the increments lost to contention across sixteen workgroups, and a DIFFERENT wrong number every run. The
// atomic version reads 670 exactly, five times. That is why this section runs at 1024 elements and not at 64: at one
// workgroup there is nothing to lose and a plain add would have passed.
//
// *** AND A REGEX INSIDE THIS FILE'S BROWSER SCRIPT LOSES ITS BACKSLASHES TWICE. *** The script is a template
// literal, so /atomicAdd\(/ arrives at RegExp as atomicAdd(s*...) and matches nothing. Two attempts at the
// non-atomic variant replaced NOTHING, leaving an atomicAdd on a plain u32 -- caught only because the device refused
// the module by name. The replacement is done by index and plain string now, with no pattern to escape.
//
// SABOTAGES, MEASURED at v4331:
//   S  three's `enable subgroups;` and its @builtin(subgroup_size) left in the transplant -> exit=1, 6 red: the device
//      refuses the module (12 uncaptured errors) and the storage buffer comes back zero on every element. three's own
//      renderer asks the adapter for that feature; gfx/device.js never did, and nothing but this drop bridges them.
//   T  the storage rename skipped, so the module keeps three's generated NodeBuffer_NNN -> exit=1, 6 red: the CPU line
//      by name, and on the device a buffer nothing is bound to, so every element reads zero.
//   MEASURED at v4336 (a pass that reads one):
//   U  the storage buffers mapped by ORDER instead of by role -> exit=1, 2 red: the mask pass writes into the buffer it was
//      meant to read (6 device errors, a read-only binding assigned to), every element reads periodic, and the period-3
//      claim goes with it. *** THIS SABOTAGE WENT 0 RED ON ITS FIRST RUN AND THAT WAS THE FINDING. *** The shell listed
//      the WRITTEN buffer first, which is the order three happened to emit, so position and role agreed and the check
//      proved nothing. The shell now declares its input first -- the order render/gpuDriven.mjs's own cull pass uses --
//      and the claim beside it says "measured as sabotage U" rather than asserting what a positional mapping would do.
//   V  the second pass reading its OWN buffer instead of the first's (a one-word typo) -> exit=1, 1 red, refused by name
//      before the device sees it: the graph then touches one buffer and the shell names two.
//   MEASURED at v4337 (the atomic):
//   W  the atomic-declaration guard removed from transplantCompute -> exit=1, 1 red: both refusals stop happening, and what
//      would have been caught by name is left for the device's WGSL parser to reject at pipeline creation instead.
//   X  the tally graph built without .toAtomic() and counting with a plain add -> exit=1, 1 red, refused by name before the
//      device sees it ("the shell declares tally atomic and the pass never touches it atomically").
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { LN2, PERIOD3, LY_DEFAULTS, truePeak, etaStandard, PARAMS, lyapunovSweepCpu } from "../../render/physicsTsl.mjs";
import { computeShell, transplantCompute } from "../../render/tslSource.mjs";
import { lyapunovComputeWgsl } from "../../render/lyapunovWgsl.mjs";
import { validateWgsl, parseBindings } from "../../render/wgslSpec.mjs";
import { keyCpu } from "../../render/heidlerWgsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted-physics.json");
const EMITTED_C = path.join(ENG, "tools/ship/tsl-emitted-compute.json");   // v4331 -- the compute pass, for the corpus
const FIXC = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/tslCompute-fixture.json"), "utf8")).wgsl;
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const median = (a) => { const s = Array.from(a).sort((x, y) => x - y); return s[s.length >> 1]; };

console.log("\n1. THE KEYS, FROM THE MODULES THE GATE TRUSTS: ln 2, the true eta and the published one, the period-3 window");
const k = keyCpu(PARAMS.first);
{
    const src = fs.readFileSync(path.join(ENG, "render/physicsTsl.mjs"), "utf8");
    ok("the Heidler twin says the peak over i0 is 1 at the true eta and 1.0667 at the published eta (the module's finding, not the shader's)", k.atTrueEta === 1 && Math.abs(k.atStandardEta - 1.0667) < 1e-3, `${k.atTrueEta}, ${k.atStandardEta.toFixed(4)}; true eta ${k.trueEta.toFixed(5)}, standard ${k.standard.toFixed(5)}`);
    ok("the TSL modules take their constants from the modules (imported DEFAULTS, PARAMS, LN2), and the Lyapunov log has its 2", /import \{ LN2, DEFAULTS as LY_DEFAULTS, PERIOD3[^}]*\} from "\.\/lyapunovWgsl\.mjs"/.test(src) && /x\.mul\(2\.0\)/.test(src) && /r\.mul\(x\)\.mul\(float\(1\.0\)\.sub\(x\)\)/.test(src) && /t\.div\(t1\)\.mul\(t\.div\(t1\)\)/.test(src) && !/\b3\.4\b|\b0\.05\b|\b485\b/.test(src.replace(/\/\/.*$/gm, "")));   // v4329: the look sections that carried the LOOK's own literals (0.05, 0.9: the seed span) left with them, so the whole file is the window now
    // v4329 -- the LOOKS moved to render/fleetTsl.mjs, so the count that was 12 in one file is 10 here and 8 there.
    // Counted in BOTH rather than dropped to ten: an unlabelled uniform is a transplant that refuses by name, and
    // the looks are exactly where that now bites. Two of the fleet labels are .label(name) -- a texture's binding
    // name passed in -- so the fleet count is of .label( and the key count of .label(" .
    const fleetSrc = fs.readFileSync(path.join(ENG, "render/fleetTsl.mjs"), "utf8");
    // *** v4329 -- THE SPLIT, MADE CHECKABLE RATHER THAN ANNOUNCED. *** This module was named for physics and had
    // grown three fleet SHELLS and five looks; the shells are vertex stages written out in both languages, so the
    // question "is a look back in the physics module" has an exact answer: does this file contain shader text at
    // all. It must not, and fleetTsl.mjs must. The markers are assembled at run time for the reason
    // render/backendParity.mjs's header gives and this session has now relearned twelve times: a file that spells
    // a marker becomes a file the census counts.
    const WGSL_TELL = new RegExp("@" + "vertex"), GLSL_TELL = new RegExp("#" + "version 300 es");
    ok("*** the split holds: the PHYSICS module carries no shader text at all, and the FLEET module carries both languages ***",
        !WGSL_TELL.test(src) && !GLSL_TELL.test(src) && WGSL_TELL.test(fleetSrc) && GLSL_TELL.test(fleetSrc),
        `physics wgsl ${WGSL_TELL.test(src)} glsl ${GLSL_TELL.test(src)}; fleet wgsl ${WGSL_TELL.test(fleetSrc)} glsl ${GLSL_TELL.test(fleetSrc)}`);
    ok("  ...and it exports no shell and no look, which is the same statement said in names", !/export function \w*(Shell|Look\w*Tsl)\b/.test(src) && /export function \w+Shell\b/.test(fleetSrc));
    ok("  the uniforms are labelled (render/tslSource.mjs binds by the label): the two keys' ten and the compute sweep's one here, the fleet looks' eight in render/fleetTsl.mjs", (src.match(/\.label\("/g) || []).length === 11 && (fleetSrc.match(/\.label\(/g) || []).length === 8, `${(src.match(/\.label\("/g) || []).length} physics (ten keys + the compute sweep's span), ${(fleetSrc.match(/\.label\(/g) || []).length} fleet`);
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

console.log("\n4. THE COMPUTE STAGE (v4331): the exponent as a TSL COMPUTE pass, transplanted into a gfx/device.js compute pipeline");
{
    const shell = computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
    ok("the shell declares the storage buffer the device will bind by name, and the uniform struct after it", /var<storage, read_write> out: outBuf;/.test(shell.prefix) && /var<uniform> u: uStruct;/.test(shell.prefix) && parseBindings(shell.prefix + "\n").length === 2, shell.prefix.replace(/\n/g, " | "));
    const twin = lyapunovComputeWgsl({ prefix: shell.prefix, warmup: LY_DEFAULTS.warmup, samples: LY_DEFAULTS.samples });
    ok("  the hand-written twin is the module's own lyapunov() in that shell, and it validates", validateWgsl(twin).length === 0 && /fn lyapunov\(r: f32/.test(twin), validateWgsl(twin).join("; "));
    // the marker is assembled, for the reason render/backendParity.mjs's header gives and this session has relearned twelve times
    const notCompute = "// Three.js r178 - Node System\n@" + "fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(0.0); }";
    ok("REFUSED: a fragment handed to the compute transplant, and a graph whose storage count the shell does not name", throwsWith(() => transplantCompute(notCompute, shell), /has no compute entry point/) && throwsWith(() => transplantCompute(FIXC, computeShell({ storage: [], uniforms: [{ name: "span", type: "vec4" }] })), /touches 1 storage buffer\(s\) and the shell "compute" names 0/));
    ok("REFUSED: a uniform the shell's struct lacks, and a workgroup size the shell disagrees with", throwsWith(() => transplantCompute(FIXC, computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [] })), /is not in the shell "compute"'s struct \(none\)/) && throwsWith(() => transplantCompute(FIXC, computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }], workgroupSize: 32 })), /@workgroup_size\(64\) and the shell "compute" says 32/));
    const t = transplantCompute(FIXC, shell);
    ok("*** three asks for an extension the device never requested -- `enable subgroups;` and a @builtin(subgroup_size) it does not use -- and the transplant drops both ***", !/enable subgroups/.test(t.wgsl) && !/subgroup_size/.test(t.wgsl) && /enable subgroups/.test(FIXC), "left in, the device refuses the module: measured as sabotage S");
    ok("  and the generated pass is the shell's own buffer and struct, with nothing of three's naming left", /out\.value\[ instanceIndex \]/.test(t.wgsl) && /u\.span\.x/.test(t.wgsl) && !/NodeBuffer_|object\./.test(t.wgsl) && validateWgsl(t.wgsl).length === 0, validateWgsl(t.wgsl).join("; "));
}
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 64;
    const cpu = lyapunovSweepCpu({ count: N, seed: 0.4 });
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const L = await import("/render/lyapunovWgsl.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        out.threeBackend = renderer.backend.isWebGPUBackend ? "webgpu" : "webgl2";
        // TWO configurations, and the second is the point: SHORT (the map has not had time to separate) and FULL.
        const mk = async (opts) => { const g = P.makeLyapunovComputeTsl(T, { count: a.N, seed: 0.4, ...opts }); await renderer.computeAsync(g.node);
            return { g, emitted: renderer._nodes.getForCompute(g.node).computeShader, three: [...new Float32Array(await renderer.getArrayBufferAsync(g.buffer.value))] }; };
        const full = await mk({}), short = await mk({ samples: 8, warmup: 4 });
        const g = full.g, emitted = full.emitted;
        out.emitted = emitted; out.threeValues = full.three;
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            out.deviceBackend = dev.backend;
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const shell = S.computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
            const gen = S.transplantCompute(emitted, shell);
            out.transplanted = gen.wgsl;
            const hand = L.lyapunovComputeWgsl({ prefix: shell.prefix, warmup: g.warmup, samples: g.samples });
            // the uniform struct is a BUFFER the caller fills, the way every compute pass in render/gpuDriven.mjs binds its own
            const ubuf = dev.buffer({ data: Float32Array.from(g.knobs), usage: "uniform" });
            const run = async (wgsl) => {
                const buf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
                const pipe = dev.compute({ wgsl });
                pipe.bind("out", buf).bind("u", ubuf);
                dev.frame(({ pass }) => { pass.dispatch(pipe, Math.ceil(a.N / 64)); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
                const back = new Float32Array(await dev.read(buf)); buf.destroy(); return [...back];
            };
            out.genValues = await run(gen.wgsl);
            out.handValues = await run(hand);
            // the same pair at a sample count too short for the map to separate two roundings
            const genS = S.transplantCompute(short.emitted, shell);
            const handS = L.lyapunovComputeWgsl({ prefix: shell.prefix, warmup: short.g.warmup, samples: short.g.samples });
            out.shortGen = await run(genS.wgsl); out.shortHand = await run(handS);
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran three's compute and the device's", r.ok && r.result && !r.result.error && r.result.genValues && r.result.handValues, r.ok ? (r.result && r.result.error) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && !r.result.error) {
        const R = r.result;
        const short_it = 4 + 8, full_it = LY_DEFAULTS.warmup + LY_DEFAULTS.samples;
        const partOf = (A, B) => A.map((v, i) => i).filter((i) => A[i] !== B[i]);
        const partedShort = partOf(R.shortGen, R.shortHand), parted = partOf(R.genValues, R.handValues);
        const worstOf = (A, B, idx) => (idx.length ? Math.max(...idx.map((i) => Math.abs(A[i] - B[i]))) : 0);
        const periodic = cpu.map((v, i) => i).filter((i) => cpu[i] <= 0);
        const periodicSame = periodic.filter((i) => R.genValues[i] === R.handValues[i] && R.shortGen[i] === R.shortHand[i]).length;
        ok(`*** on the PERIODIC part of the sweep the generated compute pass and the hand-written one agree BIT FOR BIT, at both sample counts (${periodicSame} of ${periodic.length}) ***`,
            periodicSame === periodic.length && periodic.length > 10 && (R.errs || []).length === 0,
            `${periodicSame}/${periodic.length} elements whose exponent is negative; device errors ${(R.errs || []).length}`);
        // and where they part, they part on the CHAOTIC elements -- the same ones at both counts, by a difference that grows
        const sameSet = partedShort.join() === parted.join();
        const allChaotic = parted.every((i) => cpu[i] > 0) && partedShort.every((i) => cpu[i] > 0);
        ok(`*** and where they part it is the SAME ${parted.length} elements at both counts, every one of them chaotic, by a difference that grows from ${worstOf(R.shortGen, R.shortHand, partedShort).toExponential(1)} at ${short_it} iterations to ${worstOf(R.genValues, R.handValues, parted).toExponential(1)} at ${full_it} ***`,
            sameSet && allChaotic && parted.length > 0 && worstOf(R.genValues, R.handValues, parted) > 100 * worstOf(R.shortGen, R.shortHand, partedShort),
            `parted ${JSON.stringify(parted)}; same set at both counts: ${sameSet}. TWO MODULES COMPILED SEPARATELY MAY ROUND A MULTIPLY-ADD DIFFERENTLY, and on a chaotic orbit one ulp is the whole difference by the end -- which is what physics/chaos/logistic.js measures. This gate does not identify the ulp; it measures the consequence, and it does NOT claim bit equality on a chaotic map`);
        const worstCpu = Math.max(...R.genValues.map((v, i) => Math.abs(v - cpu[i])));
        const worstCpuPeriodic = Math.max(...periodic.map((i) => Math.abs(R.genValues[i] - cpu[i])));
        ok(`  and the generated pass agrees with the CPU's f64 sweep to ${worstCpuPeriodic.toExponential(2)} on the periodic elements`, worstCpuPeriodic < 1e-3,
            `f32 against f64 over ${LY_DEFAULTS.samples} logs of near-zero slopes; the bound is measured, not chosen. NO BOUND IS CLAIMED on the chaotic elements, where the worst is ${worstCpu.toExponential(2)}: a single-precision orbit and a double-precision one separate there for the same reason the two GPU passes do, and a tolerance wide enough to cover it would assert nothing`);
        const atFour = R.genValues[R.genValues.length - 1], cpuFour = cpu[cpu.length - 1];
        ok(`  and r = 4 reads ${atFour.toFixed(6)} against the CPU's ${cpuFour.toFixed(6)} and ln 2 = ${LN2.toFixed(6)}`, Math.abs(atFour - LN2) < 0.05,
            `${LY_DEFAULTS.samples} samples is a FINITE-SAMPLE value and r = 4 is the most chaotic point in the sweep: the CPU itself sits ${Math.abs(cpuFour - LN2).toFixed(6)} from ln 2, and no bit claim is made at this end of it`);
        ok("  three's own renderer read the same buffer back, so the transplant is graded against the graph's own output too", R.threeValues && Math.max(...R.threeValues.map((v, i) => Math.abs(v - R.genValues[i]))) < 1e-6 && R.threeBackend === "webgpu" && R.deviceBackend === "webgpu", `three ${R.threeBackend}, device ${R.deviceBackend}`);
        fs.writeFileSync(EMITTED_C, JSON.stringify({ at: "v4331", three: "0.178.0", note: "the Lyapunov sweep as a TSL compute pass, as three emitted it and as render/tslSource.mjs transplanted it into a gfx/device.js compute pipeline; rewritten by this gate on every run", emitted: R.emitted, transplanted: R.transplanted }, null, 1));
        ok("the emitted and transplanted compute pass is written to tools/ship/tsl-emitted-compute.json for the WGSL corpus", fs.existsSync(EMITTED_C));
    }
}

console.log("\n5. A COMPUTE PASS THAT READS ONE (v4336): two dispatches in one frame, the second reading what the first wrote");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const N = 64;
    const r2 = await runInEngineOrigin({ engineRoot: ENG, args: { N, P3LO: PERIOD3.lo, P3HI: PERIOD3.hi }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const g = P.makeLyapunovComputeTsl(T, { count: a.N, seed: 0.4 });
        await renderer.computeAsync(g.node);
        const m = P.makeChaosMaskTsl(T, { sweep: g.buffer, count: a.N });
        await renderer.computeAsync(m.node);
        const sweepEmitted = renderer._nodes.getForCompute(g.node).computeShader;
        const maskEmitted = renderer._nodes.getForCompute(m.node).computeShader;
        out.bothReadWrite = (maskEmitted.match(/var<storage, read_write>/g) || []).length;   // three declares BOTH as read_write
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const sweepShell = S.computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
            // the shell is where read-only is STATED: three emitted both as read_write, and the mask pass only reads the sweep
            // the INPUT is declared first, the way render/gpuDriven.mjs's cull pass declares its reads before its writes --
            // which is the opposite of the order three emitted them in, so the role mapping is load-bearing here
            const maskShell = S.computeShell({ name: "chaos mask", storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "mask", element: "f32" }], uniforms: [] });
            const genSweep = S.transplantCompute(sweepEmitted, sweepShell);
            const genMask = S.transplantCompute(maskEmitted, maskShell);
            out.maskWgsl = genMask.wgsl; out.reads = genMask.reads; out.writes = genMask.writes;
            const sweepBuf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
            const maskBuf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
            const ubuf = dev.buffer({ data: Float32Array.from(g.knobs), usage: "uniform" });
            const pipeA = dev.compute({ wgsl: genSweep.wgsl }); pipeA.bind("out", sweepBuf).bind("u", ubuf);
            const pipeB = dev.compute({ wgsl: genMask.wgsl }); pipeB.bind("mask", maskBuf).bind("sweep", sweepBuf);
            // BOTH DISPATCHES IN ONE FRAME, in order: the device runs compute on the frame's own encoder before the render pass
            dev.frame(({ pass }) => { pass.dispatch(pipeA, 1); pass.dispatch(pipeB, 1); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            out.sweep = [...new Float32Array(await dev.read(sweepBuf))];
            out.mask = [...new Float32Array(await dev.read(maskBuf))];
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran both dispatches", r2.ok && r2.result && !r2.result.error && r2.result.mask, r2.ok ? (r2.result && r2.result.error) : (r2.reason || (r2.pageErrors || []).join("; ")));
    if (r2.ok && r2.result && !r2.result.error) {
        const M = r2.result;
        const agree = M.mask.filter((v, i) => v === (M.sweep[i] > 0 ? 1 : 0)).length;
        ok(`*** the second pass read what the first wrote: its mask is the SIGN of the sweep's own output on every element (${agree} of ${N}) ***`, agree === N && (M.errs || []).length === 0 && M.mask.some((v) => v === 1) && M.mask.some((v) => v === 0),
            `${agree}/${N}, ${M.mask.filter((v) => v === 1).length} chaotic; device errors ${(M.errs || []).length}. Two dispatches on ONE frame's encoder, the second bound to the first's buffer`);
        ok("*** and the shell is where read-only is stated: three declared BOTH buffers read_write, and the transplant matched them BY ROLE -- mask written, sweep read ***",
            M.bothReadWrite === 2 && M.writes.join() === "mask" && M.reads.join() === "sweep" && /var<storage, read> sweep:/.test(M.maskWgsl) && /var<storage, read_write> mask:/.test(M.maskWgsl),
            `three: ${M.bothReadWrite} read_write; transplanted writes ${M.writes.join()}, reads ${M.reads.join()}. three gave binding 0 to the buffer it WRITES and this shell declares the one it READS first, so a positional mapping binds them backwards -- measured as sabotage U, not assumed`);
        // the keyed claim: the periodic elements above 3.8 are the period-3 window, and the tree owns its edge exactly
        const rOf = (i) => LY_DEFAULTS.rLo + (LY_DEFAULTS.rHi - LY_DEFAULTS.rLo) * (i / (N - 1));
        const highPeriodic = M.mask.map((v, i) => i).filter((i) => M.mask[i] === 0 && rOf(i) > 3.8);
        const inWindow = highPeriodic.filter((i) => rOf(i) >= PERIOD3.lo && rOf(i) <= PERIOD3.hi);
        ok(`*** and the mask finds the PERIOD-3 WINDOW: every periodic element above r = 3.8 lies inside [1 + sqrt(8), 3.857] -- ${highPeriodic.length} of them, at r = ${highPeriodic.map((i) => rOf(i).toFixed(4)).join(", ")} ***`,
            highPeriodic.length > 0 && inWindow.length === highPeriodic.length,
            `1 + sqrt(8) = ${PERIOD3.lo.toFixed(6)}, the window's own edge from render/lyapunovWgsl.mjs. A sign test on a buffer another pass wrote, landing on a constant this tree owns exactly`);
    }
}

console.log("\n6. AN ATOMIC PASS (v4337): sixteen workgroups counting into one number, which is the cull pass's own shape");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const NBIG = 1024;
    const r3 = await runInEngineOrigin({ engineRoot: ENG, args: { N: NBIG }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const out = {};
        const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
        const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
        const g = P.makeLyapunovComputeTsl(T, { count: a.N, seed: 0.4 });
        await renderer.computeAsync(g.node);
        const t = P.makeChaosTallyTsl(T, { sweep: g.buffer, count: a.N });
        await renderer.computeAsync(t.node);
        const sweepEmitted = renderer._nodes.getForCompute(g.node).computeShader;
        const tallyEmitted = renderer._nodes.getForCompute(t.node).computeShader;
        out.threeDeclaresAtomic = /array< atomic<u32> >/.test(tallyEmitted);
        try {
            const cv = document.createElement("canvas"); cv.width = 32; cv.height = 32; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
            const sweepShell = S.computeShell({ storage: [{ name: "out", element: "f32" }], uniforms: [{ name: "span", type: "vec4" }] });
            const tallyShell = S.computeShell({ name: "chaos tally", storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "tally", element: "u32", atomic: true }], uniforms: [] });
            const genSweep = S.transplantCompute(sweepEmitted, sweepShell);
            const genTally = S.transplantCompute(tallyEmitted, tallyShell);
            out.tallyWgsl = genTally.wgsl; out.reads = genTally.reads; out.writes = genTally.writes;
            // REFUSED: the same pass into a shell that forgot the atomic, and an atomic shell for a pass that has none
            out.refusedNoAtomic = (() => { try { S.transplantCompute(tallyEmitted, S.computeShell({ name: "chaos tally", storage: [{ name: "sweep", element: "f32", access: "read" }, { name: "tally", element: "u32" }], uniforms: [] })); return null; } catch (e) { return e.message; } })();
            out.refusedSpurious = (() => { try { S.transplantCompute(sweepEmitted, S.computeShell({ storage: [{ name: "out", element: "f32", atomic: true }], uniforms: [{ name: "span", type: "vec4" }] })); return null; } catch (e) { return e.message; } })();
            const sweepBuf = dev.buffer({ usage: ["storage"], size: a.N * 4 });
            const ubuf = dev.buffer({ data: Float32Array.from(g.knobs), usage: "uniform" });
            const groups = Math.ceil(a.N / 64);
            const runTally = async (wgsl) => { const tb = dev.buffer({ data: new Uint32Array([0]), usage: ["storage"] });
                const pA = dev.compute({ wgsl: genSweep.wgsl }); pA.bind("out", sweepBuf).bind("u", ubuf);
                const pB = dev.compute({ wgsl }); pB.bind("sweep", sweepBuf).bind("tally", tb);
                dev.frame(({ pass }) => { pass.dispatch(pA, groups); pass.dispatch(pB, groups); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
                const v = new Uint32Array(await dev.read(tb))[0]; tb.destroy(); return v; };
            out.groups = groups;
            out.tally = await runTally(genTally.wgsl);
            // THE SAME MODULE WITH THE ATOMIC TAKEN OUT BY HAND: a plain read-modify-write on a plain u32. It compiles, it
            // runs, and it is wrong -- which is the only reason the atomic declaration is worth a refusal of its own.
            // NO REGEX HERE, AND THAT IS THE POINT. This whole script is a template literal, so a pattern written as
            // /atomicAdd\\(/ loses its backslashes twice on the way to RegExp and matches nothing; two attempts replaced
            // nothing at all and left an atomicAdd on a plain u32, which the device refused by name ("no matching call to
            // atomicAdd(ptr<storage, u32, read_write>, u32)"). The call is found by index and replaced as a plain string.
            const callAt = genTally.wgsl.indexOf("atomicAdd(");
            const call = genTally.wgsl.slice(callAt, genTally.wgsl.indexOf(")", callAt) + 1);
            const naive = genTally.wgsl.replace("array<atomic<u32>>", "array<u32>").replace(call, "tally.value[ 0u ] = tally.value[ 0u ] + 1u");
            out.naiveIsPlain = naive.includes("tally.value[ 0u ] = tally.value[ 0u ] + 1u") && !/atomic/.test(naive);
            out.naiveRuns = []; for (let i = 0; i < 5; i++) out.naiveRuns.push(await runTally(naive));
            out.sweep = [...new Float32Array(await dev.read(sweepBuf))];
            out.errs = errs;
        } catch (e) { out.error = String(e && e.message || e).slice(0, 400); }
        return out;
    }` });
    ok("the harness ran the sweep and the tally", r3.ok && r3.result && !r3.result.error && r3.result.tally != null, r3.ok ? (r3.result && r3.result.error) : (r3.reason || (r3.pageErrors || []).join("; ")));
    if (r3.ok && r3.result && !r3.result.error) {
        const A = r3.result;
        const truth = A.sweep.filter((v) => v > 0).length;
        ok(`*** ${A.groups} workgroups counted into ONE number and none of them lost an increment: the tally is ${A.tally}, and ${truth} of ${NBIG} elements of the sweep it read are positive ***`,
            A.tally === truth && truth > 100 && A.groups > 1 && (A.errs || []).length === 0,
            `tally ${A.tally}, truth ${truth}, ${A.groups} workgroups; device errors ${(A.errs || []).length}. At one workgroup there is no contention to lose, which is why this runs at ${NBIG}`);
        ok("*** the atomic is declared on BOTH sides: three emitted array<atomic<u32>> and the shell says atomic, and the transplant refuses either without the other ***",
            A.threeDeclaresAtomic && /array<atomic<u32>>/.test(A.tallyWgsl) && /does not declare it atomic/.test(A.refusedNoAtomic || "") && /never touches it atomically/.test(A.refusedSpurious || ""),
            `refusals: ${(A.refusedNoAtomic || "none").slice(0, 60)} | ${(A.refusedSpurious || "none").slice(0, 60)}`);
        ok(`*** and the atomic is what buys it: the SAME module with the atomic taken out counts ${A.naiveRuns.join(", ")} instead of ${truth}, a different wrong number every run ***`,
            A.naiveIsPlain && A.naiveRuns.every((v) => v < truth) && new Set(A.naiveRuns).size > 1,
            `atomic ${A.tally} exactly, five times; plain read-modify-write ${A.naiveRuns.join(", ")} -- ${Math.round(100 * (1 - Math.max(...A.naiveRuns) / truth))}% to ${Math.round(100 * (1 - Math.min(...A.naiveRuns) / truth))}% of the increments lost to contention. It compiles and runs, which is why the shell declares the atomic and the transplant refuses a mismatch`);
        ok("  and the roles still hold with an atomic in the shell: the counter is a WRITTEN buffer even though nothing assigns to it", A.writes.join() === "tally" && A.reads.join() === "sweep",
            `writes ${A.writes.join()}, reads ${A.reads.join()} -- the write is inside atomicAdd(&tally.value[0], 1u), which no assignment scan would see`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4321.
//   A  the Lyapunov log's 2 dropped (log|r(1 - x)| for log|r(1 - 2x)|) -> exit=1, 9 red: the source line, and on every path and
//      backend the exponent reads 0.000077 for ln 2 and the window and the bright end both read 0 -- the same sabotage
//      lyapunovWgsl's gate logged at v4315, in TSL, caught four ways.
//   B  the Heidler shape with (t/t1) for (t/t1)^2 -> exit=1, 5 red: the source line, and on every path and backend the peak
//      over i0 reads 0.85081 at the true eta and 0.9076 at the published one -- heidlerWgsl's sabotage B, reproduced in TSL.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the Lyapunov Loop's cost through three (448 iterations a pixel, timed by nobody); a real GPU's log() and exp() against SwiftShader's -- " +
    "which is the same question the chaotic five ask, one machine further out; a workgroup-shared or ATOMIC pass, which three can emit and this transplant has never seen (the " +
    "an INDIRECT dispatch, where the count a pass runs at is itself in a buffer, which is the last thing between this and " +
    "regenerating a real gpuDriven pass; and workgroup-SHARED memory, which three can emit and no shell here declares.");
process.exit(fails ? 1 : 0);
