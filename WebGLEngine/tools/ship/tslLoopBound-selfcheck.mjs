#!/usr/bin/env node
// WebGLEngine/tools/ship/tslLoopBound-selfcheck.mjs -- v4471
//
// A TSL COMPUTE PASS WHOSE LOOP BOUND COMES FROM A BUFFER, MEASURED. From v4331 the roadmap's step 6 said a TSL Loop
// wants a JavaScript bound: every generated pass baked its trip count into the text, and a stepper whose step count
// arrives at run time was NOT CLAIMED. three's LoopNode builds `end` when it is a node, so this gate asks the question
// with a graph: render/physicsTsl.mjs makeLogisticStepperTsl steps the logistic map `bound` times, the bound read from a
// vec4 uniform in one variant and from a storage buffer's element in the other, r and x0 per element from read-only
// buffers -- the fixture physics/chaos/logisticWgsl.mjs gives its hand-written kernel. three emits each variant ONCE;
// render/tslSource.mjs transplants it into a gfx/device.js shell; the device runs the one module at 1, 2, 3, 50 and
// 200 steps with only the buffer changed; and every run is held to the f32 twin BIT FOR BIT -- on a chaotic map, so
// a loop that ran a step too many or too few, or read a baked bound, is an unrelated orbit rather than a rounding.
//
// The emitted and transplanted texts are written to tools/ship/tsl-emitted-loop.json for the WGSL corpus, as the other
// generated passes are, and the loop's bound is read out of the emitted text: it must name the uniform or the buffer,
// not a literal.
//
// MEASURED AT v4471 (this box): both variants, five step counts, 1,024 of 1,024 every time; the gate 876-945 ms over
// five runs (three's renderer initialises once and emits twice), inside the quick sweep's budget.
//
// SABOTAGE LOG (v4471) -- each applied to render/physicsTsl.mjs, gate run, exit read, module and fixture restored:
//   A  the Loop's end baked as the JavaScript number      -> exit=1, 7 red. The uniform variant's loop reads `i < 200`
//      and every count but 200 is an unrelated orbit; the STORAGE variant never reaches the device: three emits no
//      buffer the body does not read, so the graph touches three storage buffers where the shell names four, and
//      render/tslSource.mjs refuses by name. A baked bound cannot pass as a buffer one at either layer.
//   B  the bound plus one                                 -> exit=1, 14 red: every count in both variants, 0 of 1,024.
//   C  1 - x written as 0.999 - x                          -> exit=1, 14 red: every count in both variants.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { computeShell } from "../../render/tslSource.mjs";
/** The shell the transplant lands in, per variant: out written, r and x0 read, steps read; the bound uniform only where it is one.
 *  Defined HERE, not in render/physicsTsl.mjs, because that module exports no shell by tslPhysics-selfcheck's rule (the split). */
function logisticStepperShell(boundFrom = "uniform") {
    const storage = [{ name: "out", element: "f32" }, { name: "r", element: "f32", access: "read" }, { name: "x0", element: "f32", access: "read" }];
    if (boundFrom === "storage") storage.push({ name: "steps", element: "f32", access: "read" });
    return { name: "logistic stepper (" + boundFrom + " bound)", storage, uniforms: boundFrom === "uniform" ? [{ name: "bound", type: "vec4" }] : [], workgroupSize: 64 };
}
import { fixture, orbitCpu } from "../../physics/chaos/logisticWgsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted-loop.json");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sameBits = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) n++; return n; };
const STEPS = [1, 2, 3, 50, 200];

console.log("\n1. THE SHELLS, BY VARIANT");
{
    const u = computeShell(logisticStepperShell("uniform")), s = computeShell(logisticStepperShell("storage"));
    ok("the uniform variant's shell: out written, r and x0 read, one vec4 uniform `bound`", u.storage.map((b) => b.name + (b.access === "read" ? "(r)" : "")).join() === "out,r(r),x0(r)" && u.uniforms.length === 1 && u.uniforms[0].name === "bound");
    ok("the storage variant's shell: the bound is a fourth buffer, `steps`, read-only; no uniform at all", s.storage.map((b) => b.name).join() === "out,r,x0,steps" && s.uniforms.length === 0);
    ok("  both prefixes declare their buffers by the graph's labels (the transplant maps by name)", /var<storage, read_write> out:/.test(u.prefix) && /var<storage, read> r:/.test(u.prefix) && /var<storage, read> steps:/.test(s.prefix));
}

console.log("\n2. EMITTED ONCE PER VARIANT, RUN AT FIVE STEP COUNTS WITH THE BUFFER ALONE CHANGED, HELD TO THE f32 TWIN BIT FOR BIT");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const F = fixture();
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { count: F.count, r: Array.from(F.r), x0: Array.from(F.x), STEPS, shells: { uniform: logisticStepperShell("uniform"), storage: logisticStepperShell("storage") } }, script: `async (a) => {
            const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
            const P = await import("/render/physicsTsl.mjs"); const S = await import("/render/tslSource.mjs"); const { requestDevice } = await import("/gfx/device.js");
            const out = { variants: {} };
            const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: false, antialias: false }); await renderer.init();
            const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8; const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
            out.deviceBackend = dev.backend;
            for (const boundFrom of ["uniform", "storage"]) {
                const v = { runs: {} };
                try {
                    const g = P.makeLogisticStepperTsl(T, { count: a.count, steps: 200, boundFrom });
                    // three needs the buffers filled to emit and run its own copy once; the device run below is the claim
                    g.rBuf.value.array.set(a.r); g.x0Buf.value.array.set(a.x0); if (g.stepsBuf) g.stepsBuf.value.array.set([200, 0, 0, 0]);
                    await renderer.computeAsync(g.node);
                    v.emitted = renderer._nodes.getForCompute(g.node).computeShader;
                    v.three = Array.from(new Float32Array(await renderer.getArrayBufferAsync(g.out.value)));
                    const shell = S.computeShell(a.shells[boundFrom]);
                    const gen = S.transplantCompute(v.emitted, shell);
                    v.transplanted = gen.wgsl;
                    const pipe = dev.compute({ wgsl: gen.wgsl });
                    const bOut = dev.buffer({ size: a.count * 4, usage: "storage" }), bR = dev.buffer({ data: new Float32Array(a.r), usage: "storage" }), bX = dev.buffer({ data: new Float32Array(a.x0), usage: "storage" });
                    pipe.bind("out", bOut).bind("r", bR).bind("x0", bX);
                    let bBound = null;
                    if (boundFrom === "uniform") { bBound = dev.buffer({ data: new Float32Array([200, 0, 0, 0]), usage: "uniform" }); pipe.bind("u", bBound); }
                    else { bBound = dev.buffer({ data: new Float32Array([200, 0, 0, 0]), usage: "storage" }); pipe.bind("steps", bBound); }
                    for (const n of a.STEPS) {
                        bBound.write(new Float32Array([n, 0, 0, 0]));
                        dev.frame(({ pass }) => { pass.dispatch(pipe, Math.ceil(a.count / 64)); });
                        v.runs[n] = Array.from(new Float32Array(await dev.read(bOut)));
                    }
                    for (const b of [bOut, bR, bX, bBound]) b.destroy();
                } catch (e) { v.error = String(e && e.message || e).slice(0, 400); }
                out.variants[boundFrom] = v;
            }
            dev.destroy(); return out;
        }`, timeoutMs: 180000 });
        ok("*** the harness ran three's emission and the device for both variants ***", r.ok && r.result && r.result.variants && !r.result.variants.uniform.error && !r.result.variants.storage.error,
            r.ok ? [r.result.variants.uniform.error, r.result.variants.storage.error].filter(Boolean).join(" | ") : r.reason);
        if (r.ok && r.result.variants) {
            for (const [bf, v] of Object.entries(r.result.variants)) {
                if (v.error) continue;
                const loopLine = (v.transplanted.match(/for\s*\([^)]*\)/) || [""])[0];
                const boundNamed = bf === "uniform" ? /u\.bound/.test(loopLine) : /steps\.value\[/.test(loopLine);
                ok(`*** ${bf}: the emitted loop's bound is the ${bf === "uniform" ? "uniform" : "buffer element"}, read from the text, not a literal ***`, boundNamed && !/<\s*\d+\s*;/.test(loopLine), loopLine.slice(0, 110));
                let all = true;
                for (const n of STEPS) { const twin = orbitCpu(F, n), s = sameBits(v.runs[n], twin); if (s !== F.count) all = false;
                    ok(`  ${bf}: ${String(n).padStart(3)} steps from the buffer alone -- ${s} of ${F.count} orbits bit-identical to the f32 twin`, s === F.count); }
                ok(`*** ${bf}: one emitted module, five step counts, every orbit the twin's ***`, all);
                const t200 = sameBits(v.three, orbitCpu(F, 200));
                ok(`  ${bf}: three's own renderer ran the graph at 200 and read the same bits back`, t200 === F.count, `${t200}/${F.count}`);
            }
            const U = r.result.variants.uniform, Sv = r.result.variants.storage;
            if (!U.error && !Sv.error) {
                fs.writeFileSync(EMITTED, JSON.stringify({ at: "v4471", three: "0.178.0", note: "the logistic map stepped `bound` times, the bound a vec4 uniform in one variant and a storage buffer's element in the other -- the first generated pass whose trip count is not baked into its text; render/physicsTsl.mjs makeLogisticStepperTsl, transplanted by render/tslSource.mjs",
                    emitted: U.emitted, transplanted: U.transplanted, emittedStorage: Sv.emitted, transplantedStorage: Sv.transplanted }, null, 1) + "\n");
                ok("the two emitted and transplanted passes are written to tools/ship/tsl-emitted-loop.json for the WGSL corpus", fs.existsSync(EMITTED));
            }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a bound that changes MID-DISPATCH (a while-shaped loop on a value the kernel itself writes), a bound per " +
    "element (this one is one number for the whole dispatch), the WebGL2 path (three's WebGL backend has no compute, per step 6), and real hardware.");
process.exit(fails ? 1 : 0);
