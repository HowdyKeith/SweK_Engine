#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceBlend-selfcheck.mjs -- v4458
//
// GRADES gfx/device.js's BLEND STATE BY DRIVING THE SHIPPING MODULE THROUGH BOTH BACKENDS AND HOLDING THE PIXELS
// TO THE BLEND ARITHMETIC COMPUTED IN JAVASCRIPT.
//
// *** UNTIL v4458 A DEVICE PIPELINE HAD TOPOLOGY, CULL AND FRONT FACE, AND NO BLEND AT ALL. *** Every draw through
// gfx/device.js landed opaque, on both backends, whatever alpha the fragment wrote. That was invisible because
// every consumer so far drew opaque geometry or a full-screen post effect. Slug text (text/slugShaderWgsl.js,
// v4457) returns colour PREMULTIPLIED by coverage and needs (ONE, ONE_MINUS_SRC_ALPHA); without it the WGSL twin
// would compile, run and draw every antialiased edge as a hard one. So the descriptor gains a `blend` word.
//
// THE KEY IS THE BLEND EQUATION ITSELF, evaluated here in f64 on the two colours the frame draws, quantised to
// bytes the way an 8-bit target quantises. It is not a picture from either backend, so a backend that blended
// with the wrong factors would be wrong against it and not merely different from its twin. The two backends are
// ALSO diffed against each other, because parity is the device's promise.
//
// THE SCENE: an opaque background quad over the whole target at z = 0.5, then a translucent quad over the LEFT
// half at z = 0.25 (nearer, so it passes the depth test both backends keep on by default). The right half is the
// control: whatever the mode, it must hold the background untouched. Each of the four modes is one frame.
//
// TOLERANCES, SET BEFORE THE RUN: a blended byte may differ from the f64 model by 1 (the GPU blends in float and
// rounds once; where the model lands within half a step of a boundary the two may fall either side). The two
// backends must agree to the byte on the control half and within 1 on the blended half, for the same reason.
//
// SABOTAGE LOG (v4458) -- each applied to gfx/device.js, gate run, exit read, file restored and compared byte for byte:
//   A  WebGL2 use() never enables BLEND            -> exit=1, 6 red: premultiplied, alpha and additive each worst 127 of
//      255 on WebGL2 and 127 against WebGPU; WebGPU green, "none" green -- the half that was never blending.
//   B  WebGPU target built without its blend       -> exit=1, 8 red: the mirror image, plus the source check that
//      names `targets: [target]`.
//   C  premultiplied dst factor mistyped as "one"  -> exit=1, 4 red: BOTH backends worst 77 of 255 on premultiplied
//      and agreeing with each other, so the pair check alone would have passed it -- the equation in f64 is what
//      caught it, and the CONTROL went red too because premultiplied had become additive.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { CAPABILITIES, BLEND_MODES, nullBackend } from "../../gfx/device.js";
import { renderPipelineDesc } from "../../render/gpuDriven.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const N = 32;
const BG = [0.2, 0.6, 0.4, 1.0];          // the opaque background
const FG = [0.8, 0.3, 0.5, 0.5];          // the translucent overlay, written as-is by the fragment shader
const MODES = ["none", "premultiplied", "alpha", "additive"];

/** The blend equation, in f64, per mode: what an 8-bit target must hold after drawing FG over BG. */
function expectedByte(mode, c) {
    const s = FG[c], d = BG[c], sa = FG[3];
    let v;
    if (mode === "none") v = s;
    else if (mode === "premultiplied") v = s + d * (1 - sa);
    else if (mode === "alpha") v = (c === 3 ? s : s * sa) + d * (1 - sa);
    else if (mode === "additive") v = s + d;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

console.log("\n1. THE WORDS ARE THE CONTRACT, AND AN UNKNOWN ONE IS REFUSED BEFORE ANY BACKEND SEES IT");
{
    ok("BLEND_MODES carries exactly none, premultiplied, alpha, additive", Object.keys(BLEND_MODES).join(",") === MODES.join(","));
    ok("  premultiplied is (ONE, ONE_MINUS_SRC_ALPHA) for colour and alpha -- what a coverage-premultiplied fragment needs",
        BLEND_MODES.premultiplied.src === "one" && BLEND_MODES.premultiplied.dst === "one-minus-src-alpha" &&
        BLEND_MODES.premultiplied.srcAlpha === "one" && BLEND_MODES.premultiplied.dstAlpha === "one-minus-src-alpha");
    ok("  alpha is (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) for colour", BLEND_MODES.alpha.src === "src-alpha" && BLEND_MODES.alpha.dst === "one-minus-src-alpha");
    ok("  additive is (ONE, ONE)", BLEND_MODES.additive.src === "one" && BLEND_MODES.additive.dst === "one");
    for (const b of ["webgpu", "webgl2", "null"]) ok(`CAPABILITIES.${b}.blend is true`, CAPABILITIES[b].blend === true);
    const nb = nullBackend();
    ok("the null backend records the word on the pipeline", nb.pipeline({ blend: "premultiplied" }).blend === "premultiplied");
    ok("  and defaults to none, which is what every pipeline before v4458 drew", nb.pipeline({}).blend === "none");
    let msg = "";
    try { nb.pipeline({ blend: "screen" }); } catch (e) { msg = e.message; }
    ok("*** an unknown word is refused by name, naming the four it accepts ***", /unknown blend mode "screen"/.test(msg) && /none, premultiplied, alpha, additive/.test(msg), msg.slice(0, 90));
    ok("render/gpuDriven.mjs's descriptor carries blend the way it carries topology", renderPipelineDesc({ blend: "alpha" }).blend === "alpha" && !("blend" in renderPipelineDesc({})));
    const dev = codeOf(read("gfx/device.js"));
    ok("the WebGL2 backend sets blend state at use(), beside cull", /gl\.blendFuncSeparate\(/.test(dev) && /gl\.disable\(gl\.BLEND\)/.test(dev));
    ok("  the WebGPU backend puts it on the colour target", /targets: \[target\]/.test(dev) && /srcFactor: bm\.src, dstFactor: bm\.dst/.test(dev));
    ok("  and both read ONE table", (dev.match(/BLEND_MODES\[/g) || []).length >= 2);
}

console.log("\n2. FOUR MODES, TWO BACKENDS, ONE EQUATION");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  ${skip}`);
        report("*** NOT A PASS. *** Section 1 reads source and drives the recorder. Only this one blends on a real device.");
        fails++;
    } else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, BG, FG, MODES }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { renderPipelineDesc } = await import("/render/gpuDriven.mjs");
            const N = a.N;
            const quad = (x0, x1, z, c) => { const v = []; const tri = (x, y) => v.push(x, y, z, c[0], c[1], c[2], c[3]);
                tri(x0, -1); tri(x1, -1); tri(x1, 1); tri(x0, -1); tri(x1, 1); tri(x0, 1); return new Float32Array(v); };
            const bg = quad(-1, 1, 0.5, a.BG), fg = quad(-1, 0, 0.25, a.FG);
            const rec = new Float32Array(12); rec[3] = 1;                                   // one instance at the origin, scale 1
            const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
            const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, frames: {} };
                const vb = dev.buffer({ usage: "vertex", data: bg }), vf = dev.buffer({ usage: "vertex", data: fg }), ib = dev.buffer({ usage: "vertex", data: rec });
                const opaque = dev.pipeline(renderPipelineDesc());
                for (const mode of a.MODES) {
                    const blended = dev.pipeline(renderPipelineDesc({ blend: mode }));
                    const fr = await dev.frame(({ pass }) => {
                        pass.clear([0, 0, 0, 1]);
                        pass.use(opaque); pass.uniform("viewProj", I); pass.vertices(vb); pass.instances(ib); pass.draw(6, 1);
                        pass.use(blended); pass.uniform("viewProj", I); pass.vertices(vf); pass.instances(ib); pass.draw(6, 1);
                    }, { read: true });
                    o.frames[mode] = Array.from(fr.pixels);
                }
                try { dev.pipeline(renderPipelineDesc({ blend: "screen" })); o.unknown = "no throw"; } catch (e) { o.unknown = e.message; }
                dev.destroy();
                out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends drew the four frames through gfx/device.js ***", r.ok && r.result && r.result.webgpu && r.result.webgl2,
            r.ok ? `webgpu=${r.result.webgpu.backend} webgl2=${r.result.webgl2.backend}` : r.reason);
        if (r.ok) {
            const bgByte = BG.map((v) => Math.round(v * 255));
            for (const mode of MODES) {
                const exp = [0, 1, 2, 3].map((c) => expectedByte(mode, c));
                let wG = 0, wL = 0, wPair = 0, pairExactCtl = true, left = 0, right = 0;
                for (const b of ["webgpu", "webgl2"]) {
                    const px = r.result[b].frames[mode];
                    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                        const i = (y * N + x) * 4, want = x < N / 2 ? exp : bgByte;
                        for (let c = 0; c < 4; c++) {
                            const d = Math.abs(px[i + c] - want[c]);
                            if (b === "webgpu") wG = Math.max(wG, d); else wL = Math.max(wL, d);
                        }
                    }
                }
                const G = r.result.webgpu.frames[mode], L = r.result.webgl2.frames[mode];
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const i = (y * N + x) * 4;
                    for (let c = 0; c < 4; c++) { const d = Math.abs(G[i + c] - L[i + c]); if (x < N / 2) { wPair = Math.max(wPair, d); left++; } else { if (d) pairExactCtl = false; right++; } }
                }
                report(`${mode}: expected ${exp.join(",")} over the left half, ${bgByte.join(",")} over the right; worst webgpu ${wG}, webgl2 ${wL}, pair ${wPair}`);
                ok(`*** ${mode}: WebGPU holds the blend equation within 1 on every byte, both halves ***`, wG <= 1, `worst ${wG} of 255`);
                ok(`  ${mode}: WebGL2 too`, wL <= 1, `worst ${wL} of 255`);
                ok(`  ${mode}: the two backends agree to the byte on the control half and within 1 on the blended half`, pairExactCtl && wPair <= 1, `blended worst ${wPair}`);
            }
            // The modes must actually differ from one another, or the equation checked nothing.
            const sig = (m) => r.result.webgpu.frames[m].slice(0, 4).join(",");
            ok("CONTROL: the four modes produce four different left-half colours", new Set(MODES.map(sig)).size === 4, MODES.map((m) => `${m}=${sig(m)}`).join(" "));
            for (const b of ["webgpu", "webgl2"]) ok(`  ${b}: an unknown word is refused before the backend builds anything`, /unknown blend mode "screen"/.test(r.result[b].unknown), String(r.result[b].unknown).slice(0, 80));
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: PRESENTING TO A CANVAS ON WebGPU (this box loses the device on a canvas-targeted pass, " +
    "so its frames went to the owned offscreen texture), a blend equation other than add (min, max and " +
    "reverse-subtract are not offered, so nothing is compared), and depthWrite on the WebGL2 backend -- the " +
    "WebGPU pipeline honours d.depthWrite and the WebGL2 one has no gl.depthMask, which a translucent overlay " +
    "will want next; recorded for the device-path text round rather than widened into this one.");
process.exit(fails ? 1 : 0);
