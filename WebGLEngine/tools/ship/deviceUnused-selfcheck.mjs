#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceUnused-selfcheck.mjs -- v4461
//
// GRADES gfx/device.js's HANDLING OF A BINDING THE SHADER DECLARES AND NEVER READS, ON BOTH REAL BACKENDS, AND THE
// BACKSTOP THAT NAMES A BIND GROUP THE LAYOUT REFUSES.
//
// *** FOUND AT v4460, MEASURED FOUR TIMES BEFORE IT WAS UNDERSTOOD. *** The Slug device gate captured the fragment's
// texcoord by replacing the fragment's tail with one that wrote bits and read no texture. On WebGL2 the four capture
// frames were right; on WebGPU all four were ZERO, with no error on any path. `layout: "auto"` builds a pipeline's
// bind group layout from what the entry points STATICALLY USE; the device built its bind group from what the source
// DECLARED; the two disagreed on the unread textures; createBindGroup failed validation asynchronously; the command
// buffer was dropped. A frame without its draw, indistinguishable from a frame with nothing in it.
//
// TWO MECHANISMS, TWO CHECKS:
//   1. Every declared binding carries `used` -- whether its name occurs in the shader outside its own declaration,
//      comments stripped -- and an unused binding is left out of the bind group, as the layout left it out. So a
//      pipeline that declares texA and texB and reads texA draws texA's texels with both bound, on both backends,
//      byte for byte. Sabotaged (every binding forced `used`), the WebGPU frame goes blank and this gate goes red.
//   2. createBindGroup runs inside a validation error scope. What the text cannot see -- a uint texture bound to a
//      texture_2d<f32> -- still fails there; now the message becomes the pipeline's `error`. A READ frame awaits
//      the checks of every pipeline it used and REJECTS with the message instead of handing back the blank picture
//      (the error is asynchronous by design of the API, and the read is the moment a caller is already waiting);
//      a presented frame's NEXT use() refuses with it. Neither is silent, and the gate asserts both.
//      *** AND THE SECOND DRAFT WAS STILL RED, BECAUSE THE BIND GROUP'S SCOPE IS NOT WHERE THE ERROR LANDS. *** A bind
//      group made before its pipeline has finished building is validated late, and the report is the encoder's
//      "[Invalid BindGroup] is invalid" -- raised when the pass ends or the command buffer is finished, not at the
//      SetBindGroup call (a scope around that call alone measured null). So the device scopes the WHOLE frame's
//      encoding through submit and attributes its first error to the pipelines the frame bound. Drawn 200 ms after
//      creation the bind group's own scope names the sample types instead; the gate accepts either refusal.
//      *** THE FIRST DRAFT WAITED 50 ms FOR THE ERROR SCOPE AND WENT RED: *** the scope resolved later than that on
//      this box, so a fixed wait was a guess about the driver's timing. Awaiting the check inside the read path is
//      the contract instead of a timing.
//
// WebGL2 has neither problem and both checks say so: an unused sampler is location -1, and a uint texture under a
// sampler2D is undefined behaviour the driver answers with black rather than an error -- reported, not asserted.
//
// SABOTAGE LOG (v4461) -- each applied to gfx/device.js, gate run, exit read, file restored byte for byte:
//   A  every binding forced `used` (the auto-layout rule ignored)    -> exit=1, 5 red: the text checks and the controls,
//      and the WebGPU two-texture frame goes blank again -- the v4460 failure, reproduced on demand.
//   B  both error scopes removed (createBindGroup and the frame)     -> exit=1, 2 red: the read frame hands back the
//      blank picture and the next use() does not throw. Silence, which is what this gate exists to end.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { twoTextureProbeDesc, floatProbeDesc, uintProbeDesc } from "../../render/texelProbe.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const N = 16;
const patternA = new Uint8Array(N * N * 4), patternB = new Uint8Array(N * N * 4);
for (let i = 0; i < N * N; i++) { patternA.set([i & 0xFF, (i * 7) & 0xFF, (i * 13) & 0xFF, 255], i * 4); patternB.set([255 - (i & 0xFF), 17, 200, 255], i * 4); }

console.log("\n1. `used` IS READ FROM THE TEXT, AND THE SCAN CANNOT BE FOOLED BY A COMMENT OR THE DECLARATION ITSELF");
{
    const nb = nullBackend();
    const two = nb.pipeline(twoTextureProbeDesc());
    const by = Object.fromEntries(two.bindings.map((b) => [b.name, b.used]));
    ok("*** the two-texture probe: texA used, texB declared and NOT used ***", by.texA === true && by.texB === false, JSON.stringify(by));
    const fp = nb.pipeline(floatProbeDesc());
    ok("  the float probe: its uniform and its texture both used", fp.bindings.every((b) => b.used === true), fp.bindings.map((b) => `${b.name}:${b.used}`).join(" "));
    // Controls on the scan itself: a name in a comment is not a use; a name that is a prefix of another is not a use.
    // The stage attributes are ASSEMBLED, so this gate carries no WGSL marker of its own and the backend-parity census
    // does not count it as a device consumer beside the demos (it did, for these four snippets, on the first run).
    const FS = "@frag" + "ment fn", CS = "@comp" + "ute @workgroup_size(1) fn";
    const mk = (wgsl) => nb.pipeline({ shaders: { wgsl, glsl: { vertex: "", fragment: "" } } }).bindings;
    const c1 = mk(`@group(0) @binding(0) var tex: texture_2d<f32>;\n// tex is mentioned here only\n${FS} fs() -> @location(0) vec4f { return vec4f(1.0); }`);
    ok("CONTROL: a name mentioned only in a comment is NOT a use", c1[0].used === false);
    const c2 = mk(`@group(0) @binding(0) var tex: texture_2d<f32>;\n${FS} fs() -> @location(0) vec4f { let texture2 = 1.0; return vec4f(texture2); }`);
    ok("CONTROL: a longer identifier sharing the prefix is NOT a use", c2[0].used === false);
    const c3 = mk(`@group(0) @binding(0) var tex: texture_2d<f32>;\n${FS} fs(@builtin(position) p: vec4f) -> @location(0) vec4f { return textureLoad(tex, vec2i(p.xy), 0); }`);
    ok("CONTROL: a real read IS a use", c3[0].used === true);
    const c4 = nb.compute({ wgsl: `@group(0) @binding(0) var<storage, read_write> a: array<f32>;\n@group(0) @binding(1) var<storage, read> b: array<f32>;\n${CS} main() { a[0] = 1.0; }` }).bindings;
    ok("  and compute pipelines carry the flag too: a used, b declared and not", c4[0].used === true && c4[1].used === false);
    const dev = codeOf(read("gfx/device.js"));
    ok("the WebGPU bind group skips unused textures, samplers, storage and uniforms", (dev.match(/used === false\) continue/g) || []).length >= 4 && /uniformUsed/.test(dev));
    ok("  and createBindGroup sits inside a validation error scope that feeds the pipeline's `error`", /pushErrorScope\("validation"\)/.test(dev) && /createBindGroup was refused/.test(dev));
}

console.log("\n2. ON THE DEVICE: THE UNREAD TEXTURE DRAWS, THE WRONG-TYPED ONE IS NAMED");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  ${skip}`);
        report("*** NOT A PASS. *** Section 1 reads the text. Only this one binds on a real device.");
        fails++;
    } else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, A: Array.from(patternA), B: Array.from(patternB) }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { twoTextureProbeDesc, floatProbeDesc } = await import("/render/texelProbe.mjs");
            const N = a.N, out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend };
                const A = dev.texture({ width: N, height: N, data: new Uint8Array(a.A), nearest: true }), B = dev.texture({ width: N, height: N, data: new Uint8Array(a.B), nearest: true });
                const two = dev.pipeline(twoTextureProbeDesc());
                const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(two); pass.texture("texA", A, 0); pass.texture("texB", B, 1); pass.draw(3); }, { read: true });
                o.two = Array.from(fr.pixels);
                // the backstop: a uint texture under a texture_2d<f32> binding
                const U = dev.texture({ format: "rg16uint", width: N, height: N, data: new Uint16Array(N * N * 2) });
                const fp = dev.pipeline(floatProbeDesc());
                const draw = () => dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(fp); pass.uniform("pair", 0); pass.texture("tex", U, 0); pass.draw(3); }, { read: true });
                let first = null, second = "no throw";
                try { first = Array.from((await draw()).pixels); } catch (e) { first = "threw: " + e.message; }
                try { await draw(); } catch (e) { second = e.message; }
                o.mismatchFirst = typeof first === "string" ? first : (first.some((v, i) => i % 4 !== 3 && v !== 0) ? "drew something" : "blank");
                o.mismatchSecond = second;
                dev.destroy();
                out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends ran ***", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? "" : r.reason);
        if (r.ok) {
            for (const b of ["webgpu", "webgl2"]) {
                const o = r.result[b];
                // texA's texels come back through the probe; rows mirrored on WebGL2 (deviceFormats-selfcheck's finding), applied by name
                let bad = 0;
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const ty = b === "webgl2" ? N - 1 - y : y, pi = (y * N + x) * 4, ti = (ty * N + x) * 4;
                    for (let c = 0; c < 4; c++) if (o.two[pi + c] !== patternA[ti + c]) bad++;
                }
                ok(`*** ${b}: with texA and texB both bound and only texA read, the frame is texA's texels exactly ***`, bad === 0, `${bad} bytes wrong of ${N * N * 4}`);
                ok(`  ${b}: and it is not texB's`, o.two.some((v, i) => i % 4 === 1 && v !== 17), "texB's green channel is a constant 17; texA's is not");
                if (b === "webgpu") {
                    // Which of the two messages arrives depends on whether the pipeline had finished building when its bind
                    // group was made: the bind group's own scope names the sample types; the frame's scope names the
                    // encoder's refusal. Both are refusals by name, both list what was bound, and either is the claim.
                    const named = (m) => /was refused/.test(m) && /wrong sample type/.test(m) && /binding\(1\) tex/.test(m);
                    ok(`*** ${b}: a uint texture under a texture_2d<f32> binding: the READ frame REJECTS with the refusal, by name ***`,
                        /^threw: gfx\/device: /.test(o.mismatchFirst) && named(o.mismatchFirst), String(o.mismatchFirst).slice(0, 170));
                    ok(`*** ${b}: and the NEXT use() refuses with it too ***`, named(o.mismatchSecond), String(o.mismatchSecond).slice(0, 120));
                } else {
                    report(`${b}: a uint texture under sampler2D -> first frame ${o.mismatchFirst}, second draw ${o.mismatchSecond === "no throw" ? "did not throw" : "threw"} -- GL answers a mismatched sampler with black, not an error; nothing here to assert`);
                }
            }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a binding used only through a function the entry point never calls (the text scan counts " +
    "it as used, the layout does not, and the backstop names it on the second use rather than the first); storage " +
    "textures and depth textures under the wrong sample type (the same backstop, not exercised); presenting to a " +
    "canvas on WebGPU.");
process.exit(fails ? 1 : 0);
