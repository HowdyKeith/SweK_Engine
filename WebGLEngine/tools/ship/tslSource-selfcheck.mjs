#!/usr/bin/env node
// WebGLEngine/tools/ship/tslSource-selfcheck.mjs -- v4320
//
// GRADES TSL AS A SOURCE FOR gfx/device.js (docs/TSL-ROADMAP.md step 4): three's node builders emit WGSL on the
// WebGPU backend and GLSL on the WebGL2 backend from ONE TSL graph; render/tslSource.mjs transplants each
// emitted fragment into the device's own full-screen shell and hands back a device pipeline descriptor. The claim
// is to the byte on both backends: the pipeline whose fragment nobody wrote by hand draws the same picture as the
// hand-written pair (render/badTvDevicePass.mjs) on every pixel; a second graph (the blackbody key) transplants
// too and finds Wien's root; the rules refuse by name (an unlabelled uniform, a camera matrix, no varying); and
// the emitted pair is written down (tools/ship/tsl-emitted.json) so the WGSL corpus can compile it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { transplantFragment, uniformFields, textureNames, devicePipelineFromTsl, TRI_VS_WGSL } from "../../render/tslSource.mjs";
import { KNOB_ORDER } from "../../render/badTvWgsl.mjs";
import { keyCpu } from "../../render/blackbodyTsl.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted.json");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// the fixtures live in tools/ship/tslSource-fixture.json (three r178's shape), as DATA: a gate file that carried both languages
// counted as a shader module in the parity census (measured at v4320), and a fixture is not a shader anybody runs
const FIX = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/tslSource-fixture.json"), "utf8"));
const fill = (t, m) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => m[k]);
const W_FIX = (uni = "\ttime : f32,\n\tspeed : f32", tex = "tDiffuse", vary = "nodeVarying3", extra = "") => fill(FIX.wgsl, { UNI: uni, TEX: tex, VARY: vary, EXTRA: extra });
const G_FIX = (uni = "\tfloat f_time;\n\tfloat f_speed;", tex = "tDiffuse") => fill(FIX.glsl, { UNI: uni, TEX: tex });
const AT = "@";

console.log("\n1. THE TRANSPLANT ON THE CPU: three's names become the device's, and the rules refuse by name");
{
    const W = transplantFragment(W_FIX(), "wgsl"), G = transplantFragment(G_FIX(), "glsl");
    ok("WGSL: the object struct becomes struct U at binding 0, the texture's sampler the device's `samp` at 1, the texture at 2, the varying `uv`, main() the device's fs returning the colour", /struct U \{ time: f32, speed: f32 \}/.test(W.code) && /@binding\(0\) var<uniform> u: U/.test(W.code) && /@binding\(1\) var samp: sampler/.test(W.code) && /@binding\(2\) var tDiffuse: texture_2d<f32>/.test(W.code) && /textureSample\( tDiffuse, samp, vec2<f32>\( helper\( uv\.x \+ \( u\.time \* u\.speed \) \), uv\.y \) \)/.test(W.code) && /return nodeVar0;/.test(W.code) && !/object\.|nodeVarying|output\.color/.test(W.code), W.code.split("\n").slice(0, 4).join(" | "));
    ok("  the device's full-screen vertex stage rides along, and the helper function three emitted survives", W.code.includes(TRI_VS_WGSL) && /fn helper\( x : f32 \)/.test(W.code) && validateWgsl(W.code).length === 0, validateWgsl(W.code).join("; "));
    ok("GLSL: the std140 block becomes plain uniforms by name, the varying `vUv`, fragColor kept, the f_ prefixes gone", new RegExp("uni" + "form float time;\\s*uni" + "form float speed;").test(G.code) && new RegExp("uni" + "form sampler2D tDiffuse;").test(G.code) && /in vec2 vUv;/.test(G.code) && /texture\( tDiffuse, vec2\( helper\( vUv\.x \+ \( time \* speed \) \), vUv\.y \) \)/.test(G.code) && !/f_time|nodeVarying|fragment_object/.test(G.code));
    const desc = devicePipelineFromTsl({ wgsl: W_FIX(), glsl: G_FIX() });
    ok("  the descriptor carries the uniform list in three's order, typed, and the textures by name", desc.uniforms.map((u) => `${u.name}:${u.type}`).join() === "time:f32,speed:f32" && desc.textures.join() === "tDiffuse" && desc.attributes.length === 0 && desc.vs === "vs" && desc.fs === "fs");
    ok("REFUSED: an unlabelled uniform (nodeUniform1 has no name to bind under)", throwsWith(() => uniformFields(W_FIX("\ttime : f32,\n\tnodeUniform1 : f32"), "wgsl"), /UNLABELLED uniform/) && throwsWith(() => uniformFields(G_FIX("\tfloat f_time;\n\tfloat f_nodeUniform1;"), "glsl"), /UNLABELLED uniform/));
    ok("REFUSED: an unlabelled texture, a camera matrix in the fragment, a fragment with no varying, a text that is not three's", throwsWith(() => textureNames(W_FIX(undefined, "nodeUniform0"), "wgsl"), /UNLABELLED texture/) && throwsWith(() => transplantFragment(W_FIX(undefined, undefined, undefined, "\n\tnodeVar0 = render.cameraProjectionMatrix[0];"), "wgsl"), /camera or object matrices/) && throwsWith(() => transplantFragment(W_FIX().replace(AT + "location( 3 ) nodeVarying3 : vec2<f32>", ""), "wgsl"), /exactly one vec2 varying/) && throwsWith(() => transplantFragment(AT + "fragment fn fs() {}", "wgsl"), /not a three\.js/));
    ok("REFUSED: the two builders disagreeing about the uniforms or the textures", throwsWith(() => devicePipelineFromTsl({ wgsl: W_FIX("\ttime : f32"), glsl: G_FIX() }), /different uniform lists/) && throwsWith(() => devicePipelineFromTsl({ wgsl: W_FIX(undefined, "tOther"), glsl: G_FIX() }), /different textures/));
    ok("  a type the device does not carry is refused, not guessed", throwsWith(() => uniformFields(W_FIX("\ttime : mat3x3<f32>"), "wgsl"), /which the device's uniform list does not carry/));
}

console.log("\n2. ON BOTH BACKENDS: emitted by three, transplanted, run by gfx/device.js -- and the picture is the hand-written pair's, to the byte");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 64, TIME: 1.5 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const B = await import("/render/badTvTsl.mjs"); const S = await import("/render/tslSource.mjs"); const D = await import("/render/badTvDevicePass.mjs"); const BB = await import("/render/blackbodyTsl.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const N = a.N, src = new Uint8Array(N * N * 4); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; src[i] = Math.round(x * 255 / (N - 1)); src[i + 1] = Math.round(y * 255 / (N - 1)); src[i + 2] = 0; src[i + 3] = 255; }
        const emitted = {}, emittedBB = {};
        for (const mode of ["webgpu", "webgl2"]) {
            const canvas = document.createElement("canvas"); canvas.width = N; canvas.height = N;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const fx = B.makeBadTvTsl(THREE, T, { texture: B.sourceTexture(THREE, { pixels: src, width: N, height: N }) });
            renderer.setRenderTarget(new THREE.RenderTarget(N, N));
            emitted[mode] = await S.emitShaders(renderer, { scene: fx.scene, camera: fx.camera, mesh: fx.scene.children[0] });
            const kb = BB.makeBlackbodyKeyTsl(THREE, T, {}); emittedBB[mode] = await S.emitShaders(renderer, { scene: kb.scene, camera: kb.camera, mesh: kb.scene.children[0] });
        }
        const out = { languages: [emitted.webgpu.language, emitted.webgl2.language] };
        let desc, descBB; try { desc = S.devicePipelineFromTsl({ wgsl: emitted.webgpu.fragment, glsl: emitted.webgl2.fragment }); descBB = S.devicePipelineFromTsl({ wgsl: emittedBB.webgpu.fragment, glsl: emittedBB.webgl2.fragment }); } catch (e) { out.error = String(e && e.message || e).slice(0, 400); return out; }
        out.uniforms = desc.uniforms.map((u) => u.name); out.textures = desc.textures; out.bbUniforms = descBB.uniforms.map((u) => u.name);
        out.emitted = { badTv: { wgsl: emitted.webgpu.fragment, glsl: emitted.webgl2.fragment, transplanted: { wgsl: desc.shaders.wgsl, glsl: desc.shaders.glsl.fragment } }, blackbody: { wgsl: emittedBB.webgpu.fragment, glsl: emittedBB.webgl2.fragment, transplanted: { wgsl: descBB.shaders.wgsl, glsl: descBB.shaders.glsl.fragment } } };
        const knobs = D.packKnobs({ time: a.TIME }); out.run = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                const tex = dev.texture({ width: N, height: N, data: src, nearest: true });
                const draw = (pd, bind) => dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(dev.pipeline(pd)); bind(pass); pass.draw(3); }, { read: true, depth: false });
                const hand = (await draw(D.badTvPipelineDesc(), (pass) => { for (let i = 0; i < D.KNOB_ORDER.length; i++) pass.uniform(D.KNOB_ORDER[i], knobs[i]); pass.texture("tDiffuse", tex, 0); })).pixels;
                const gen = (await draw(desc, (pass) => { for (const u of desc.uniforms) pass.uniform(u.name, knobs[D.KNOB_ORDER.indexOf(u.name)]); pass.texture("tDiffuse", tex, 0); })).pixels;
                let same = 0, worst = 0, moved = 0; for (let i = 0; i < N * N; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(hand[i * 4 + c] - gen[i * 4 + c])); if (d === 0) same++; worst = Math.max(worst, d); if (gen[i * 4] !== src[i * 4] || gen[i * 4 + 1] !== src[i * 4 + 1]) moved++; }
                o.same = same; o.worst = worst; o.moved = moved; o.total = N * N; o.backend = dev.backend;
                const bb = (await draw(descBB, (pass) => { pass.uniform("xLo", 0); pass.uniform("xHi", 12); pass.uniform("nLo", 5); pass.uniform("nHi", 5); pass.uniform("rootScale", 8); })).pixels;
                let best = -1, bx = 0; for (let x = 0; x < N; x++) { const i = (10 * N + x) * 4; const v = (bb[i] + bb[i + 1] / 255) / 255; if (v > best) { best = v; bx = x; } } o.bbPeakX = 12 * (bx + 0.5) / N; o.bbPeak = best; o.bbBlue = bb[(10 * N + 3) * 4 + 2]; o.bin = 12 / N; o.errs = errs;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 400); }
            out.run[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran and both graphs transplanted", r.ok && r.result && !r.result.error && r.result.run && r.result.run.webgpu && r.result.run.webgl2 && !r.result.run.webgpu.error && !r.result.run.webgl2.error, r.ok ? (r.result.error || (r.result.run && JSON.stringify([r.result.run.webgpu && r.result.run.webgpu.error, r.result.run.webgl2 && r.result.run.webgl2.error]))) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.run && !r.result.error) {
        const R = r.result;
        // three emits only what the fragment READS: `rows` (a probe-only knob the device pass keeps in its struct) is dropped by both builders
        const read = KNOB_ORDER.filter((k) => k !== "rows");
        ok("three emitted WGSL from its WebGPU backend and GLSL from its WebGL2 backend; both builders named the five knobs the fragment reads (labelled), dropped the unread sixth (rows), and named the one texture", R.languages.join() === "wgsl,glsl" && R.uniforms.slice().sort().join() === read.slice().sort().join() && !R.uniforms.includes("rows") && R.textures.join() === "tDiffuse" && R.bbUniforms.join() === "xLo,xHi,nLo,nHi,rootScale", `${R.uniforms.join(",")}; ${R.textures.join(",")}`);
        ok("  the transplanted WGSL validates against the spec scanner", validateWgsl(R.emitted.badTv.transplanted.wgsl).length === 0 && validateWgsl(R.emitted.blackbody.transplanted.wgsl).length === 0, validateWgsl(R.emitted.badTv.transplanted.wgsl).join("; "));
        for (const b of ["webgpu", "webgl2"]) { const o = R.run[b]; if (o.error) { ok(`${b} ran`, false, o.error); continue; }
            ok(`*** ${b}: the pipeline whose ${b === "webgpu" ? "WGSL" : "GLSL"} three GENERATED draws the hand-written pass's picture on EVERY pixel -- ${o.same} of ${o.total}, worst 0, no mirror needed (the device's own vertex stage) ***`, o.backend === b && o.same === o.total && o.worst === 0 && o.moved > o.total * 0.5 && o.errs.length === 0, `${o.same}/${o.total}, worst ${o.worst}, ${o.moved} moved; errors ${o.errs.length}`);
            const k = keyCpu(5);
            ok(`  ${b}: the blackbody graph transplants too -- the brightest column is Wien's x_lambda within a column (${o.bin.toFixed(3)}), the root in the blue byte (${k.blueByte})`, Math.abs(o.bbPeakX - k.root) <= o.bin && o.bbPeak > 0.995 && Math.abs(o.bbBlue - k.blueByte) <= 1, `peak x ${o.bbPeakX.toFixed(4)}, blue ${o.bbBlue}`); }
        // write the emitted pair down for the corpus
        const rec = { at: "v4320", three: "0.178.0", note: "emitted by three's node builders from render/badTvTsl.mjs and render/blackbodyTsl.mjs, transplanted by render/tslSource.mjs; rewritten by tools/ship/tslSource-selfcheck.mjs on every run", ...R.emitted };
        fs.writeFileSync(EMITTED, JSON.stringify(rec, null, 1));
        ok("the emitted and transplanted pair is written to tools/ship/tsl-emitted.json, for the WGSL corpus to compile as generated code", fs.existsSync(EMITTED) && JSON.parse(fs.readFileSync(EMITTED, "utf8")).badTv.transplanted.wgsl.length > 1000);
        report(`emitted WGSL ${R.emitted.badTv.wgsl.length} chars -> transplanted ${R.emitted.badTv.transplanted.wgsl.length}; GLSL ${R.emitted.badTv.glsl.length} -> ${R.emitted.badTv.transplanted.glsl.length}`);
    }
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4320.
//   A  the `object.` rewrite dropped (three's struct name left in the body) -> exit=1, 3 red: the CPU fixture line, and on WebGPU the
//      generated WGSL no longer compiles, so the device draws the clear (1 of 4,096 pixels agree) and the blackbody finds nothing.
//      WebGL2 stays green: the GLSL transplant is a different rewrite and was untouched.
//   B  the uniform struct emitted in REVERSE order (the list in three's order, the struct backwards) -> exit=1, 3 red: gfx/device.js
//      REFUSES the pipeline by name ("this pipeline's uniform list does not match the struct its WGSL declares") before any draw --
//      the v4278 host/shader agreement check catching a generated pair, which is what it was written for.
//   C  the varying's y turned over in the transplanted body (uv.y -> 1 - uv.y) -> exit=1, 2 red: the CPU fixture line and, on WebGPU,
//      0 of 4,096 pixels agree with the hand-written pass -- the mirror the device's vertex stage made unnecessary, put back and caught.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a graph with MORE than one varying or with three's camera in it (refused, not transplanted -- a vertex-stage transplant is " +
    "the next rung); textures sampled with a linear filter through three's sampler (badTv's is nearest, which three reads with textureLoad; the fixture " +
    "covers the sampler path on the CPU only); and whether the generated code is as FAST as the hand-written -- three's nodeVar chain is longer, and nobody timed it.");
process.exit(fails ? 1 : 0);
