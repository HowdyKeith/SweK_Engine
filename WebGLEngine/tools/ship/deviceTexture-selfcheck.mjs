#!/usr/bin/env node
// WebGLEngine/tools/ship/deviceTexture-selfcheck.mjs -- v4299 (Level 11)
//
// GRADES gfx/device.js's WebGPU TEXTURE BINDING BY DRIVING THE SHIPPING MODULE THROUGH BOTH BACKENDS.
//
// *** FROM v4273 TO v4296 THE WebGPU BACKEND COULD NOT BIND A TEXTURE, AND THE ORRERY WAS PINNED TO WebGL2 FOR IT.
// *** badTvDevicePass-selfcheck rendered badTv on both backends at v4271 and diffed the frames -- but through the
// harness's OWN hand-built WebGPU objects, not through gfx/device.js. So "write it once, run on either" had been
// measured for the shader and never for the device. This gate imports /gfx/device.js in a real browser, builds
// the same badTv pipeline on each backend, binds the same canvas as a texture, and reads the frames back.
//
// ---- WHAT THIS BOX CAN AND CANNOT DO, MEASURED --------------------------------------------------------------
//
// The headless shell here LOSES THE WebGPU DEVICE on any render pass that targets a canvas, in the DOM or not.
// It renders to an owned texture correctly. So the WebGPU device is requested `offscreen: true`, which is the
// mode gfx/device.js added for exactly this, and the canvas-presenting path is rig-only and said so at the end.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { CAPABILITIES, nullBackend } from "../../gfx/device.js";
import { TEXTURE_CAPABLE_BACKENDS } from "../../ui/orreryPost.mjs";
import { parseBindings } from "../../render/wgslSpec.mjs";
import { FRAGMENT_WGSL } from "../../render/badTvWgsl.mjs";
import { sampleAt } from "../../render/badTvModel.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");
const codeOf = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const N = 64, TIME = 1.5;
function expected(x, y) {
    const [su, sv] = sampleAt((x + 0.5) / N, (y + 0.5) / N, TIME);
    const sx = Math.min(N - 1, Math.floor(su * N)), sy = Math.min(N - 1, Math.floor(sv * N));
    return [Math.round(sx * 255 / (N - 1)), Math.round(sy * 255 / (N - 1))];
}

console.log("\n1. THE BINDINGS ARE READ FROM THE SHADER, AND THE CAPABILITY IS STATED AS DATA");
{
    const dev = codeOf(read("gfx/device.js"));
    ok("*** gfx/device.js derives its bind group from parseBindings(), not from a typed list ***",
        /parseBindings\(/.test(dev) && /texBindings/.test(dev) && /samplerBindings/.test(dev));
    ok("  the old refusal is gone", !/cannot bind textures yet/.test(dev), "it refused by name from v4273 to v4296");
    ok("  an UNDECLARED texture name is refused by name", /declares no texture named/.test(dev));
    ok("  a DECLARED texture left unbound is refused with its binding number", /nothing was bound to it/.test(dev) && /@binding\(\$\{t\.binding\}\)/.test(dev));
    ok("  a canvas source goes up through copyExternalImageToTexture, no readback", /copyExternalImageToTexture/.test(dev));
    ok("CAPABILITIES says WebGPU binds textures", CAPABILITIES.webgpu.textures === true);
    ok("  and orreryPost DERIVES its capable list from that table", TEXTURE_CAPABLE_BACKENDS.includes("webgpu") && TEXTURE_CAPABLE_BACKENDS.includes("webgl2"),
        TEXTURE_CAPABLE_BACKENDS.join(", "));
    ok("  by reading it, not by restating it", /Object\.keys\(CAPABILITIES\)/.test(codeOf(read("ui/orreryPost.mjs"))));
    const b = parseBindings(FRAGMENT_WGSL);
    ok("CONTROL: badTv's WGSL declares a uniform, a sampler and a texture at three distinct bindings",
        b.length === 3 && new Set(b.map((x) => x.binding)).size === 3 && b.some((x) => /^texture_2d/.test(x.type)) && b.some((x) => /^sampler/.test(x.type)),
        b.map((x) => `${x.binding}:${x.name}`).join(" "));
    const nb = nullBackend();
    const p = nb.pipeline({ shaders: { wgsl: FRAGMENT_WGSL, glsl: {} }, attributes: [] });
    ok("  the null backend records the same three bindings on its pipeline", p.bindings.length === 3);
}

console.log("\n2. THE ORRERY STAGE RE-USES ONE TEXTURE INSTEAD OF LEAKING ONE PER FRAME");
{
    const src = codeOf(read("ui/orreryPost.mjs"));
    ok("*** draw() updates the texture it has rather than creating a new one every frame ***",
        /srcTex\.update\(\{ source: sourceCanvas \}\)/.test(src) && /if \(!srcTex \|\|/.test(src),
        "v4273..v4296 allocated a canvas-sized texture per frame on both backends and freed none");
    ok("  and destroy() frees it", /srcTex\?\.destroy/.test(src));
    ok("  the stage no longer asks for webgl2 by name", !/TEXTURE_CAPABLE_BACKENDS\[0\]/.test(src) && /opts\.backend \|\| null/.test(src));
}

console.log("\n3. RENDER THROUGH gfx/device.js ON BOTH BACKENDS AND DIFF");
let r = null;
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  ${skip}`);
        report("*** NOT A PASS. *** Sections 1 and 2 read source. Only this one binds a texture on a real device.");
        fails++;
    } else {
        r = await runInEngineOrigin({ engineRoot: ENG, args: { N, TIME }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { badTvPipelineDesc, packKnobs, KNOB_ORDER } = await import("/render/badTvDevicePass.mjs");
            const N = a.N;
            const src = document.createElement("canvas"); src.width = N; src.height = N;
            const c2 = src.getContext("2d"); const img = c2.createImageData(N, N);
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; img.data[i] = Math.round(x * 255 / (N - 1)); img.data[i + 1] = Math.round(y * 255 / (N - 1)); img.data[i + 2] = 0; img.data[i + 3] = 255; }
            c2.putImageData(img, 0, 0);
            const knobs = packKnobs({ time: a.TIME, rows: N });
            const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend };
                const pipe = dev.pipeline(badTvPipelineDesc());
                const tex = dev.texture({ source: src, nearest: true });
                const draw = (t, read) => dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe); for (let i = 0; i < KNOB_ORDER.length; i++) pass.uniform(KNOB_ORDER[i], knobs[i]); pass.texture("tDiffuse", t); pass.draw(3); }, read ? { read: true } : undefined);
                const fr = await draw(tex, true);
                o.pixels = Array.from(fr.pixels); o.w = fr.width; o.h = fr.height;
                // negatives, on the real backend
                try { dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe); pass.texture("nope", tex); pass.draw(3); }); o.undeclared = "no throw"; } catch (e) { o.undeclared = e.message; }
                try { const p2 = dev.pipeline(badTvPipelineDesc()); dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(p2); pass.draw(3); }); o.unbound = "no throw"; } catch (e) { o.unbound = e.message; }
                // update(): invert the source's red channel and re-upload into the SAME texture
                for (let i = 0; i < img.data.length; i += 4) img.data[i] = 255 - img.data[i];
                c2.putImageData(img, 0, 0);
                tex.update({ source: src });
                const fr2 = await draw(tex, true);
                let changed = 0; for (let i = 0; i < fr2.pixels.length; i += 4) if (fr2.pixels[i] !== fr.pixels[i]) changed++;
                o.changedAfterUpdate = changed;
                o.redSumBefore = fr.pixels.reduce((s, v, i) => (i % 4 === 0 ? s + v : s), 0);
                o.redSumAfter = fr2.pixels.reduce((s, v, i) => (i % 4 === 0 ? s + v : s), 0);
                for (let i = 0; i < img.data.length; i += 4) img.data[i] = 255 - img.data[i];
                c2.putImageData(img, 0, 0);
                tex.destroy(); dev.destroy();
                out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends render badTv through gfx/device.js with the canvas bound as a texture ***", r.ok && r.result && r.result.webgpu && r.result.webgl2,
            r.ok ? `webgpu=${r.result.webgpu.backend} webgl2=${r.result.webgl2.backend}` : r.reason);
        if (r.ok) {
            const G = r.result.webgpu, L = r.result.webgl2;
            let wGpu = 0, wGl = 0, differing = 0, wPair = 0;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const [eR, eG] = expected(x, y), i = (y * N + x) * 4;
                wGpu = Math.max(wGpu, Math.abs(G.pixels[i] - eR), Math.abs(G.pixels[i + 1] - eG));
                wGl = Math.max(wGl, Math.abs(L.pixels[i] - eR), Math.abs(L.pixels[i + 1] - eG));
                const dp = Math.max(Math.abs(G.pixels[i] - L.pixels[i]), Math.abs(G.pixels[i + 1] - L.pixels[i + 1]));
                if (dp) differing++; wPair = Math.max(wPair, dp);
            }
            ok("*** every WebGPU pixel matches render/badTvModel.mjs exactly ***", wGpu === 0, `worst ${wGpu} of 255 -- a bound texture read through the device, not a hand-built one`);
            ok("  every WebGL2 pixel matches the model exactly", wGl === 0, `worst ${wGl} of 255`);
            ok("*** and the two backends agree pixel for pixel ***", differing === 0, `${differing} of ${N * N} differ, worst ${wPair}`);
            ok("CONTROL: the frame is not blank", G.pixels.some((v, i) => i % 4 === 0 && v > 0) && L.pixels.some((v, i) => i % 4 === 0 && v > 0));
            for (const b of ["webgpu", "webgl2"]) {
                const o = r.result[b];
                if (b === "webgpu") {
                    ok(`  ${b}: binding an undeclared name is refused by name`, /declares no texture named "nope"/.test(o.undeclared), String(o.undeclared).slice(0, 100));
                    ok(`  ${b}: drawing with the declared texture unbound is refused with its binding`, /"tDiffuse" at @group\(0\) @binding\(2\)/.test(o.unbound), String(o.unbound).slice(0, 110));
                } else report(`${b}: an undeclared name -> ${String(o.undeclared).slice(0, 60)}; unbound -> ${String(o.unbound).slice(0, 60)} (GL binds unit 0 whatever is there; the WebGPU refusals are the new contract)`);
                ok(`*** ${b}: update() re-uploads into the same texture and the picture changes ***`, o.changedAfterUpdate > N * N / 2,
                    `${o.changedAfterUpdate} of ${N * N} pixels changed after inverting the source's red channel`);
            }
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

// =============================================================================================================
console.log("\n4. THE ADDRESS MODE IS THE CALLER'S, AND IT IS THE SAME ON BOTH BACKENDS (v4543)");
// Until v4543 gfx/device.js created its WebGPU sampler with addressModeU/V "repeat" and its WebGL2 textures with
// CLAMP_TO_EDGE, under a comment claiming the WebGPU setting matched WebGL2's. It never had. So the same
// dev.texture() sampled differently on the two backends at every seam and no caller could say which -- and a pixel
// diff between the backends WAS a comparison of sampler defaults, exactly what that comment said it was not.
// This section is what the comment claimed and could not show: for ONE named wrap the two backends agree on every
// pixel; the two wraps DIFFER, and only at the seam; and a word that is neither is refused by name.
{
    const skip2 = webgpuSkipReason();
    if (skip2) { console.log(`  SKIP  ${skip2}`); fails++; }
    else {
        const w = await runInEngineOrigin({ engineRoot: ENG, args: { N, TIME }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { badTvPipelineDesc, packKnobs, KNOB_ORDER } = await import("/render/badTvDevicePass.mjs");
            const N = a.N, src = new Uint8Array(N * N * 4);
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4;
                src[i] = Math.round(x * 255 / (N - 1)); src[i + 1] = Math.round(y * 255 / (N - 1)); src[i + 2] = ((x ^ y) & 1) ? 200 : 30; src[i + 3] = 255; }
            const knobs = packKnobs({ time: a.TIME, rows: N });
            const out = { shots: {}, refused: null };
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const pipe = dev.pipeline(badTvPipelineDesc());
                for (const wrap of ["clamp", "repeat"]) {
                    // linear filtering is what makes the address mode visible: at the seam the second tap is either
                    // the far edge (repeat) or the near one again (clamp)
                    const tex = dev.texture({ width: N, height: N, data: src, nearest: false, wrap });
                    const px = (await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(pipe);
                        for (let i = 0; i < KNOB_ORDER.length; i++) pass.uniform(KNOB_ORDER[i], knobs[i]);
                        pass.texture("tDiffuse", tex, 0); pass.draw(3); }, { read: true, depth: false })).pixels;
                    out.shots[backend + ":" + wrap] = Array.from(px);
                }
                if (backend === "webgl2") { try { dev.texture({ width: N, height: N, data: src, wrap: "mirror" }); out.refused = "NOT REFUSED"; }
                                            catch (e) { out.refused = String(e.message).slice(0, 160); } }
            }
            return out;
        }` });
        ok("the harness rendered one linear-filtered picture per backend per wrap", w.ok && w.result && Object.keys(w.result.shots).length === 4, w.ok ? Object.keys(w.result && w.result.shots || {}).join(",") : (w.reason || (w.pageErrors || []).join("; ")));
        if (w.ok && w.result && Object.keys(w.result.shots).length === 4) {
            const S4 = w.result.shots, total = N * N;
            const diff = (a, b) => { let same = 0, worst = 0; const perRow = new Array(N).fill(0);
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; let d = 0;
                    for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[i + c] - b[i + c]));
                    if (d === 0) same++; else perRow[y]++; worst = Math.max(worst, d); }
                const touched = perRow.filter((n) => n > 0);
                return { same, worst, rows: touched.length, full: touched.filter((n) => n === N).length, singles: touched.filter((n) => n === 1).length, other: touched.filter((n) => n !== N && n !== 1).length }; };
            const clampBoth = diff(S4["webgpu:clamp"], S4["webgl2:clamp"]), repeatBoth = diff(S4["webgpu:repeat"], S4["webgl2:repeat"]);
            ok(`*** ONE named wrap, TWO backends, the SAME picture on every pixel -- clamp ${clampBoth.same}/${total}, repeat ${repeatBoth.same}/${total}, worst 0 both. This is what the comment removed at v4543 asserted and could not show ***`,
               clampBoth.same === total && clampBoth.worst === 0 && repeatBoth.same === total && repeatBoth.worst === 0,
               `clamp ${clampBoth.same}/${total} worst ${clampBoth.worst}; repeat ${repeatBoth.same}/${total} worst ${repeatBoth.worst}`);
            const perBackend = ["webgpu", "webgl2"].map((b) => diff(S4[b + ":clamp"], S4[b + ":repeat"]));
            ok(`  and the option is not a no-op: clamp and repeat DIFFER on each backend (${perBackend.map((d) => total - d.same).join(" and ")} pixels), by a lot where they differ (worst ${perBackend.map((d) => d.worst).join(", ")} of 255)`,
               perBackend.every((d) => d.same < total && d.worst > 32), perBackend.map((d, i) => `${["webgpu", "webgl2"][i]}: ${total - d.same} differ, worst ${d.worst}`).join("; "));
            // the SHAPE of the difference, not a bound on it: a first draft of this row asserted "at most 3 rows"
            // from a half-remembered measurement and went red at 62. The effect wraps u and v with fract(), so an
            // address mode can change exactly two things -- the v seam, which is ONE whole row, and the u seam,
            // which is ONE PIXEL in every other row. That is what 125 of 4,096 is, and nothing else may differ.
            ok(`  and they differ only where an address mode CAN differ: exactly one whole row (the v seam) and exactly one pixel in each of the others (the u seam), nothing in between -- ${perBackend.map((d) => `${d.full} full + ${d.singles} single`).join(", ")}`,
               perBackend.every((d) => d.full === 1 && d.other === 0 && d.singles === d.rows - 1 && d.singles > 0),
               perBackend.map((d, i) => `${["webgpu", "webgl2"][i]}: ${d.rows} rows touched -- ${d.full} full, ${d.singles} single, ${d.other} neither`).join("; "));
            ok("  a wrap that is neither is refused BY NAME, not silently taken as whichever the backend prefers", /unknown texture wrap "mirror"/.test(w.result.refused || ""), String(w.result.refused).slice(0, 120));
        }
    }
}

// SABOTAGE LOG -- each applied, gate run, exit code read, file restored and its anchor re-grepped. MEASURED.
//
//   A  the sampler entries dropped from bindGroupFor() -> exit=1, 5 red. The bind group builds (layout "auto"
//      tolerates it here) and the frame is BLACK: "every WebGPU pixel matches the model" red at worst 255 of
//      255, "the two backends agree" red at 4,095 of 4,096, and the not-blank CONTROL red. A texture bound
//      with no sampler is a frame without its source, which is v4273's silent failure arrived at from the
//      other side, and the control is what names it.
//   B  `nearest` ignored on the WebGPU sampler (always linear) -> exit=1, 3 red: worst 127 of 255 against the
//      model and 4,096 of 4,096 differing from WebGL2 -- a half-texel blend the model does not do, on every
//      pixel of a position-encoding source.
//   C  update() made a no-op on the WebGPU texture handle -> exit=1, 2 red: "update() re-uploads" red for
//      webgpu with 0 of 4,096 changed, green for webgl2 -- the leak-fix path checked per backend for this.
// MEASURED at v4543 (section 4, the address mode). Applied to gfx/device.js, the named gate run, red count read,
// source and emitted json restored and md5-verified. Baseline 0 red on both gates.
//   HH the WebGPU sampler back to hard-coded "repeat" -> 3 red, and it reproduces the v4540 defect exactly: the two
//      backends agree at repeat and read 3971/4096 at clamp, and "clamp vs repeat" on WebGPU differs by 0 pixels
//      because both are repeat. That is the bug this round fixed, put back and caught.
//   II the WebGL2 textures back to hard-coded CLAMP_TO_EDGE -> 3 red, the mirror image: 3971/4096 at repeat.
//   JJ an unknown wrap taken as the default instead of refused -> 1 red ("NOT REFUSED"). A word the device does not
//      know must not fall through to whichever mode a backend prefers, which is how this defect looked from a
//      caller's side for as long as it existed.
//   KK the bound texture's wrap never reaching the sampler (the option accepted and ignored on WebGPU) -> 3 red.
//   LL the same edit graded from tools/ship/tslSource-selfcheck.mjs -> 1 red: three's RepeatWrapping texture asked
//      for repeat and given clamp, and the device stops matching three's own render.
//   No 0-RED among the five.
//   And the BLAST RADIUS of defaulting both backends to clamp, measured rather than argued: every gate here that
//   creates or binds a device texture -- 28 of them, device*, slug*, tsl*, badTv*, crt*, terrain, landing -- green,
//   with exactly one caller (tslSource section 3, against three's RepeatWrapping texture) having to say `repeat`.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: PRESENTING TO A CANVAS ON WebGPU. This box loses the device on any canvas-targeted " +
    "render pass, so the WebGPU frames above went to an owned offscreen texture; the canvas path is the same " +
    "pipeline, bind group and draw with a different attachment, and it is rig-only until Keith's box runs " +
    "orrery.html with the effect on. Also unchecked: mipmaps and non-repeat addressing -- neither backend " +
    "offers them, so nothing is compared.");
process.exit(fails ? 1 : 0);
