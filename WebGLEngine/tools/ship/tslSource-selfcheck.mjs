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
import { transplantFragment, uniformFields, textureNames, devicePipelineFromTsl, unreadUnlabelledUniforms, foldableConstants, TRI_VS_WGSL } from "../../render/tslSource.mjs";
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
const G_FIX = (uni = "\tfloat f_time;\n\tfloat f_speed;", tex = "tDiffuse", extra = "") => fill(FIX.glsl, { UNI: uni, TEX: tex, EXTRA: extra });
const AT = "@";

console.log("\n1. THE TRANSPLANT ON THE CPU: three's names become the device's, and the rules refuse by name");
{
    const W = transplantFragment(W_FIX(), "wgsl"), G = transplantFragment(G_FIX(), "glsl");
    ok("WGSL: the object struct becomes struct U at binding 0, the texture's sampler the device's `samp` at 1, the texture at 2, the varying `uv`, main() the device's fs returning the colour", /struct U \{ time: f32, speed: f32 \}/.test(W.code) && /@binding\(0\) var<uniform> u: U/.test(W.code) && /@binding\(1\) var samp: sampler/.test(W.code) && /@binding\(2\) var tDiffuse: texture_2d<f32>/.test(W.code) && /textureSample\( tDiffuse, samp, vec2<f32>\( helper\( uv\.x \+ \( u\.time \* u\.speed \) \), uv\.y \) \)/.test(W.code) && /return nodeVar0;/.test(W.code) && !/object\.|nodeVarying|output\.color/.test(W.code), W.code.split("\n").slice(0, 4).join(" | "));
    ok("  the device's full-screen vertex stage rides along, and the helper function three emitted survives", W.code.includes(TRI_VS_WGSL) && /fn helper\( x : f32 \)/.test(W.code) && validateWgsl(W.code).length === 0, validateWgsl(W.code).join("; "));
    ok("GLSL: the std140 block becomes plain uniforms by name, the varying `vUv`, fragColor kept, the f_ prefixes gone", new RegExp("uni" + "form float time;\\s*uni" + "form float speed;").test(G.code) && new RegExp("uni" + "form sampler2D tDiffuse;").test(G.code) && /in vec2 vUv;/.test(G.code) && /texture\( tDiffuse, vec2\( helper\( vUv\.x \+ \( time \* speed \) \), vUv\.y \) \)/.test(G.code) && !/f_time|nodeVarying|fragment_object/.test(G.code));
    const desc = devicePipelineFromTsl({ wgsl: W_FIX(), glsl: G_FIX() });
    ok("  the descriptor carries the uniform list in three's order, typed, and the textures by name", desc.uniforms.map((u) => `${u.name}:${u.type}`).join() === "time:f32,speed:f32" && desc.textures.join() === "tDiffuse" && desc.attributes.length === 0 && desc.vs === "vs" && desc.fs === "fs");
    // v4538 narrowed the refusal to an unlabelled uniform THE FRAGMENT READS -- and this row went on passing a
    // fixture whose body reads nothing of the kind, so from v4538 to v4539 it exercised no refusal at all. The
    // body now READS it, in both languages, and the unread case is asserted separately so the narrowing has a
    // control of its own. (Writing this is what found the f_ hole in unreadUnlabelledUniforms.)
    ok("REFUSED: an unlabelled uniform the fragment READS (nodeUniform1 has no name to bind under) -- in both languages, and in GLSL under three's f_ prefix too", throwsWith(() => uniformFields(W_FIX("\ttime : f32,\n\tnodeUniform1 : f32", undefined, undefined, "\n\tnodeVar0.x = object.nodeUniform1;"), "wgsl"), /UNLABELLED uniform/) && throwsWith(() => uniformFields(G_FIX("\tfloat f_time;\n\tfloat f_nodeUniform1;", undefined, "\n\tnodeVar0.x = f_nodeUniform1;"), "glsl"), /UNLABELLED uniform/) && throwsWith(() => uniformFields(G_FIX("\tfloat f_time;\n\tfloat nodeUniform1;", undefined, "\n\tnodeVar0.x = nodeUniform1;"), "glsl"), /UNLABELLED uniform/));
    ok("  and NOT refused when nobody reads it (r184's object matrix): dropped from the bound list and named, not refused", uniformFields(W_FIX("\ttime : f32,\n\tnodeUniform8 : mat4x4<f32>"), "wgsl").map((u) => u.name).join() === "time" && uniformFields(G_FIX("\tfloat f_time;\n\tmat4 f_nodeUniform8;"), "glsl").map((u) => u.name).join() === "time" && unreadUnlabelledUniforms(W_FIX("\ttime : f32,\n\tnodeUniform8 : mat4x4<f32>"), "wgsl").join() === "nodeUniform8");
    ok("REFUSED: an unlabelled texture, a camera matrix in the fragment, a fragment with no varying, a text that is not three's", throwsWith(() => textureNames(W_FIX(undefined, "nodeUniform0"), "wgsl"), /UNLABELLED texture/) && throwsWith(() => transplantFragment(W_FIX(undefined, undefined, undefined, "\n\tnodeVar0 = render.cameraProjectionMatrix[0];"), "wgsl"), /camera or object matrices/) && throwsWith(() => transplantFragment(W_FIX().replace(AT + "location( 3 ) nodeVarying3 : vec2<f32>", ""), "wgsl"), /exactly one vec2 varying/) && throwsWith(() => transplantFragment(AT + "fragment fn fs() {}", "wgsl"), /not a three\.js/));
    ok("REFUSED: the two builders disagreeing about the uniforms or the textures", throwsWith(() => devicePipelineFromTsl({ wgsl: W_FIX("\ttime : f32"), glsl: G_FIX() }), /different uniform lists/) && throwsWith(() => devicePipelineFromTsl({ wgsl: W_FIX(undefined, "tOther"), glsl: G_FIX() }), /different textures/));
    ok("  a type the device does not carry is refused, not guessed", throwsWith(() => uniformFields(W_FIX("\ttime : mat3x3<f32>"), "wgsl"), /which the device's uniform list does not carry/));
    // v4540: the fold's `labelled` guard, given teeth of its own. Sabotage P -- dropping that guard -- went 0-RED
    // through the whole gate, because CONST_LITERAL carries only bool/int/uint and every knob in every graph here is
    // a float, so nothing the guard protects was reachable. It is redundant TODAY and load-bearing the moment a float
    // joins that table, which is exactly the kind of protection that quietly stops working. So it is checked directly,
    // against a state built here rather than one three happened to emit.
    const fakeState = (rows) => ({ bindings: [{ name: "object", bindings: [{ isUniformBuffer: true, uniforms: rows.map((r) => ({ name: r.name, getType: () => r.nodeType, nodeUniform: { node: { name: r.label || "", value: r.value } } })) }] }] });
    const folds = foldableConstants(fakeState([{ name: "mine", nodeType: "uint", label: "mine", value: true }, { name: "nodeUniform6", nodeType: "uint", value: true }, { name: "nodeUniform7", nodeType: "float", value: 0.5 }]));
    ok("  the fold takes ONLY what three allocated for itself: a LABELLED uint is left alone (the caller drives it), an unlabelled uint is folded, an unlabelled float is not (bool/int/uint only, on purpose)", folds.map((f) => f.name + "=" + f.literal).join() === "nodeUniform6=1u", folds.map((f) => f.name + "=" + f.literal).join() || "nothing folded");
    ok("  and a value that is not a whole number is refused a literal rather than rounded into one", foldableConstants(fakeState([{ name: "nodeUniform6", nodeType: "uint", value: 1.5 }])).length === 0);
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
        // v4540: the version was DECLARED here as "0.178.0" and went on being written into an r184 artifact. It is read
        // out of the emitted text instead -- three prints its own revision at the top of every shader it builds.
        const three = (R.emitted.badTv.wgsl.match(/Three\.js (r\d+)/) || [])[1] || "unknown";
        const rec = { at: "v4540", three, note: "emitted by three's node builders from render/badTvTsl.mjs and render/blackbodyTsl.mjs, transplanted by render/tslSource.mjs; rewritten by tools/ship/tslSource-selfcheck.mjs on every run", ...R.emitted };
        fs.writeFileSync(EMITTED, JSON.stringify(rec, null, 1));
        ok(`the emitted and transplanted pair is written to tools/ship/tsl-emitted.json, for the WGSL corpus to compile as generated code -- stamped with the revision READ OUT of the shader three printed (${three}), not one typed here`, fs.existsSync(EMITTED) && JSON.parse(fs.readFileSync(EMITTED, "utf8")).badTv.transplanted.wgsl.length > 1000 && /^r\d+$/.test(three) && JSON.parse(fs.readFileSync(EMITTED, "utf8")).three === three);
        report(`emitted WGSL ${R.emitted.badTv.wgsl.length} chars -> transplanted ${R.emitted.badTv.transplanted.wgsl.length}; GLSL ${R.emitted.badTv.glsl.length} -> ${R.emitted.badTv.transplanted.glsl.length}`);
    }
}

console.log("\n3. LINEAR SAMPLING (v4323): three's sampler becomes the device's, and the picture is the hand-written linear pass's, to the byte");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 64, TIME: 1.5 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const B = await import("/render/badTvTsl.mjs"); const S = await import("/render/tslSource.mjs"); const D = await import("/render/badTvDevicePass.mjs"); const { requestDevice } = await import("/gfx/device.js");
        const N = a.N, src = new Uint8Array(N * N * 4); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4; src[i] = Math.round(x * 255 / (N - 1)); src[i + 1] = Math.round(y * 255 / (N - 1)); src[i + 2] = (x ^ y) & 1 ? 200 : 30; src[i + 3] = 255; }
        const emitted = {}, three = {};
        for (const mode of ["webgpu", "webgl2"]) {
            const canvas = document.createElement("canvas"); canvas.width = N; canvas.height = N;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            const tex = B.sourceTexture(THREE, { pixels: src, width: N, height: N }); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
            const fx = B.makeBadTvTsl(THREE, T, { texture: tex }); fx.setKnobs({ time: a.TIME });
            const rt = new THREE.RenderTarget(N, N, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }); renderer.setRenderTarget(rt);
            emitted[mode] = await S.emitShaders(renderer, { scene: fx.scene, camera: fx.camera, mesh: fx.scene.children[0] });
            for (let i = 0; i < 2; i++) await renderer.renderAsync(fx.scene, fx.camera); const raw = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, N, N);
            const isGL = !renderer.backend.isWebGPUBackend; const px = new Uint8Array(N * N * 4); for (let y = 0; y < N; y++) px.set(raw.subarray((isGL ? (N - 1 - y) : y) * N * 4, ((isGL ? (N - 1 - y) : y) + 1) * N * 4), y * N * 4); three[mode] = px;
        }
        const out = { samplerInWgsl: emitted.webgpu.fragment.includes("textureSample(") && emitted.webgpu.fragment.includes("_sampler") };
        let desc; try { desc = S.devicePipelineFromTsl({ wgsl: emitted.webgpu.fragment, glsl: emitted.webgl2.fragment }); } catch (e) { out.error = String(e && e.message || e).slice(0, 300); return out; }
        out.usesSampler = desc.transplant.wgsl.usesSampler; out.declaresSamp = desc.shaders.wgsl.includes("@binding(1) var samp: sampler");
        const knobs = D.packKnobs({ time: a.TIME }); out.run = {};
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = N; cv.height = N; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
                // v4543 -- three's source texture is RepeatWrapping (its default), and gfx/device.js can now be TOLD
                // which address mode to use instead of having one per backend. Saying so is what makes the row below
                // -- the device against three's own render -- a comparison of pictures rather than of sampler defaults.
                const tex = dev.texture({ width: N, height: N, data: src, nearest: false, wrap: "repeat" });
                const draw = (pd, bind) => dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); pass.use(dev.pipeline(pd)); bind(pass); pass.draw(3); }, { read: true, depth: false });
                const hand = (await draw(D.badTvPipelineDesc(), (pass) => { for (let i = 0; i < D.KNOB_ORDER.length; i++) pass.uniform(D.KNOB_ORDER[i], knobs[i]); pass.texture("tDiffuse", tex, 0); })).pixels;
                const gen = (await draw(desc, (pass) => { for (const u of desc.uniforms) pass.uniform(u.name, knobs[D.KNOB_ORDER.indexOf(u.name)]); pass.texture("tDiffuse", tex, 0); })).pixels;
                let same = 0, worst = 0, sameThree = 0, worstThree = 0, blended = 0; const tp = three[backend];
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = (y * N + x) * 4, j = ((N - 1 - y) * N + x) * 4; let d = 0, d3 = 0; for (let c = 0; c < 3; c++) { d = Math.max(d, Math.abs(hand[i + c] - gen[i + c])); d3 = Math.max(d3, Math.abs(tp[j + c] - gen[i + c])); } if (d === 0) same++; worst = Math.max(worst, d); if (d3 === 0) sameThree++; worstThree = Math.max(worstThree, d3); if (gen[i + 2] > 40 && gen[i + 2] < 190) blended++; }
                o.same = same; o.worst = worst; o.sameThree = sameThree; o.worstThree = worstThree; o.blended = blended; o.total = N * N; o.errs = errs; o.backend = dev.backend;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 300); }
            out.run[backend] = o;
        }
        return out;
    }` });
    ok("the harness ran and the linear graph transplanted", r.ok && r.result && !r.result.error && r.result.run && !r.result.run.webgpu.error && !r.result.run.webgl2.error, r.ok ? (r.result.error || JSON.stringify([r.result.run && r.result.run.webgpu && r.result.run.webgpu.error, r.result.run && r.result.run.webgl2 && r.result.run.webgl2.error])) : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result.run && !r.result.error) {
        const R = r.result;
        ok("with a LinearFilter texture three emits textureSample through a sampler (nearest it read with textureLoad), and the transplant declares the device's `samp` for it", R.samplerInWgsl && R.usesSampler && R.declaresSamp);
        for (const b of ["webgpu", "webgl2"]) { const o = R.run[b]; if (o.error) { ok(`${b} ran`, false, o.error); continue; }
            ok(`*** ${b}: linear sampling through the generated pipeline is the hand-written linear pass on EVERY pixel (${o.same} of ${o.total}, worst 0) -- and the picture really is blended (a checkerboard's blue lands between its two values) ***`, o.backend === b && o.same === o.total && o.worst === 0 && o.blended > o.total * 0.2 && o.errs.length === 0, `${o.same}/${o.total}, worst ${o.worst}, ${o.blended} blended`);
            // *** THIS ROW WAS RED AT v4540 AND THE FAULT WAS gfx/device.js's, NOT THE TRANSPLANT'S -- FIXED AT v4543. ***
            // MEASURED then, three against three with no device in it: three's two backends agree with EACH OTHER on
            // every pixel for the same wrap mode (repeat vs repeat 4096/4096 worst 0; clamp vs clamp the same). three
            // was consistent. gfx/device.js was not -- it hard-coded addressModeU/V "repeat" on its WebGPU sampler
            // (under a comment claiming that matched WebGL2) and CLAMP_TO_EDGE on its WebGL2 textures, with no way
            // for a caller to say which, so the same dev.texture() sampled differently on the two backends at every
            // seam: one row, one pixel per row, worst 127 of 255, and NO wrap setting made both green.
            // The device takes `wrap` now and defaults both backends to clamp, so this row says which it wants --
            // repeat, because three's source texture is RepeatWrapping -- and gets 4096/4096 on both.
            ok(`  ${b}: and three's own linear render, row-mirrored, agrees with the device on EVERY pixel (two samplers, one filter, one address mode -- the device is TOLD which since v4543)`, o.worstThree === 0 && o.sameThree === o.total, `${o.sameThree}/${o.total} identical, worst ${o.worstThree}`); }
    }
}

console.log("\n4. THE SECOND OPINION (v4539): the same uniforms read from three's NodeBuilderState, not from the text three printed");
// Going 0.178 -> 0.184 broke four SPELLINGS in render/tslSource.mjs at once, and each was repaired by teaching a
// regex the new spelling -- a fix pinned to a spelling rather than to a mechanism. three's debug hook keeps two
// strings out of a state with eleven fields; `bindings` is one of the nine it throws away, and it carries the same
// uniforms already parsed. This section asserts the two readers AGREE, so the structural one arrives as a second
// opinion rather than as a swap made on faith -- and NAMES the one case where they do not.
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N: 64 }, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const B = await import("/render/badTvTsl.mjs"); const S = await import("/render/tslSource.mjs"); const BB = await import("/render/blackbodyTsl.mjs");
        const N = a.N, src = new Uint8Array(N * N * 4); for (let i = 0; i < N * N; i++) { src[i * 4] = i & 255; src[i * 4 + 3] = 255; }
        const out = {};
        for (const mode of ["webgpu", "webgl2"]) {
            const canvas = document.createElement("canvas"); canvas.width = N; canvas.height = N;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            renderer.setRenderTarget(new THREE.RenderTarget(N, N));
            const graphs = { badTv: B.makeBadTvTsl(THREE, T, { texture: B.sourceTexture(THREE, { pixels: src, width: N, height: N }) }),
                             blackbody: BB.makeBlackbodyKeyTsl(THREE, T, {}) };
            for (const [name, fx] of Object.entries(graphs)) {
                const mesh = fx.scene.children[0], rec = {};
                try {
                    const em = await S.emitShaders(renderer, { scene: fx.scene, camera: fx.camera, mesh });
                    rec.language = em.language;
                    try { rec.text = S.uniformFields(em.fragment, em.language); } catch (e) { rec.textRefused = String(e.message); }
                    try { rec.textTex = S.textureNames(em.fragment, em.language); } catch (e) { rec.textTexRefused = String(e.message); }
                    const st = await S.nodeBuilderStateFor(renderer, { scene: fx.scene, camera: fx.camera, mesh });
                    rec.stateFields = Object.keys(st);
                    rec.keptByDebugHook = Object.keys(await renderer.debug.getShaderAsync(fx.scene, fx.camera, mesh));
                    rec.all = S.bindingsFromState(st); rec.state = S.deviceUniformsFromState(st);
                    rec.folded = em.folded; rec.foldError = em.foldError; rec.fragment = em.fragment;
                    // the independent check: parse the TRANSPLANTED shader and confirm nothing it assigns is undeclared.
                    // transplantFragment asserts this against the SOURCE's declarations; this asserts it against what
                    // actually came out, so a declaration that was found and then not emitted is caught too.
                    const code = S.transplantFragment(em.fragment, em.language).code;
                    const entry = em.language === "wgsl" ? code.split("fn fs(")[1] : code.split("void main()")[1];
                    const declared = new Set([...code.matchAll(em.language === "wgsl" ? /\b(?:var<private>|var)\s+(\w+)\s*:/g : /^\s*(?:uniform\s+|in\s+|out\s+)?\w+\s+(\w+)\s*(?:;|=)/gm)].map((m) => m[1]));
                    rec.undeclared = [...new Set([...entry.matchAll(/^\s*(\w+)\s*=[^=]/gm)].map((m) => m[1]))].filter((n) => !declared.has(n));
                    rec.carried = S.carriedDeclarations(em.fragment, em.language, entry).length;
                } catch (e) { rec.error = String(e && e.message || e).slice(0, 400); }
                out[mode + ":" + name] = rec;
            }
        }
        return out;
    }` });
    ok("the harness ran and three's NodeBuilderState was reachable for all four cases (renderer._renderLists / _renderContexts / _objects -- the same path three's own getShaderAsync walks)",
       r.ok && r.result && Object.values(r.result).length === 4 && Object.values(r.result).every((v) => !v.error && v.all),
       r.ok ? Object.entries(r.result || {}).map(([k, v]) => v.error && k + ": " + v.error).filter(Boolean).join(" | ") : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && Object.values(r.result).every((v) => !v.error && v.all)) {
        const R = r.result, K = Object.keys(R).sort(), j = (a) => (a || []).map((u) => u.name + ":" + u.type).join(",");
        const one = R["webgpu:badTv"];
        ok("the state carries eleven fields and three's debug hook keeps two of them -- `bindings` is one of the nine it throws away", one.stateFields.length === 11 && one.stateFields.includes("bindings") && one.keptByDebugHook.slice().sort().join() === "fragmentShader,vertexShader" && !one.keptByDebugHook.includes("bindings"), `state ${one.stateFields.length} fields; hook kept ${one.keptByDebugHook.join(",")}`);
        // where the TEXT reader answers, the STATE reader answers identically -- name, type and order
        const answered = K.filter((k) => !R[k].textRefused), agreed = answered.filter((k) => j(R[k].text) === j(R[k].state));
        ok(`*** where the text reader answers, the state reader answers IDENTICALLY -- same names, same device types, same order (${agreed.length} of ${answered.length}: ${agreed.join(", ")}) ***`,
           answered.length >= 3 && agreed.length === answered.length, answered.map((k) => `${k}: text[${j(R[k].text)}] state[${j(R[k].state)}]`).join(" | "));
        ok("  and on the textures, in all four -- read from NodeSampledTexture rather than from a `var x : texture_2d<f32>;` line",
           K.every((k) => !R[k].textTexRefused && R[k].textTex.join() === R[k].all.textures.join()), K.map((k) => `${k}: ${(R[k].textTex || []).join()}/${R[k].all.textures.join()}`).join(" | "));
        ok("  the camera matrices are the `render` group's, and no camera matrix leaks into the object uniforms",
           K.every((k) => R[k].all.cameraMatrices.join() === "cameraProjectionMatrix,cameraViewMatrix" && !R[k].all.uniforms.some((u) => /camera|modelView/i.test(u.name))), K.map((k) => R[k].all.cameraMatrices.join("+")).join(" | "));
        // *** THE EQUIVALENCE THAT SAYS THE REGEX WAS STANDING IN FOR A PROPERTY ***
        const spelt = (u) => !/^nodeUniform\d+$/.test(u.name);
        const disagree = K.flatMap((k) => R[k].all.uniforms.filter((u) => spelt(u) !== u.labelled).map((u) => `${k}:${u.name}`));
        ok("*** `nodeUniformN` is not a name three chose -- it is three's stringification of an EMPTY one: on every uniform of every case, the spelling the regexes match and the property (node.name !== \"\") agree ***",
           disagree.length === 0 && K.some((k) => R[k].all.uniforms.some((u) => !u.labelled)), disagree.join(", ") || "no disagreement; " + K.flatMap((k) => R[k].all.uniforms.filter((u) => !u.labelled).map((u) => k.split(":")[1] + "/" + u.name)).join(","));
        report("and the NUMBER in that stringification is not stable either: the same object matrix is " + R["webgpu:badTv"].all.uniforms.filter((u) => !u.labelled).map((u) => u.name).join("/") +
               " in WGSL and " + R["webgl2:badTv"].all.uniforms.filter((u) => !u.labelled && u.nodeType === "mat4").map((u) => u.name).join("/") + " in GLSL");
        // v4539 recorded ONE case the text reader refused -- r184's unlabelled `uint` flipY switch, which no caller can
        // label because it is three's. v4540 folds it from the state instead, so nothing refuses now; this row asserts
        // the FOLD, and that the constant burned in is three's own value rather than a guess.
        ok("nothing refuses any more, because the one uniform nobody could label is FOLDED from the state: r184's unlabelled `uint` flipY switch, burned in at three's own value",
           K.every((k) => !R[k].textRefused) && R["webgl2:badTv"].folded.length === 1 && R["webgl2:badTv"].folded[0].nodeType === "uint" && R["webgl2:badTv"].folded[0].value === false && R["webgl2:badTv"].folded[0].literal === "0u",
           K.map((k) => `${k}: ${(R[k].folded || []).map((f) => `${f.name}=${f.literal}`).join(",") || "nothing"}`).join(" | "));
        ok("  and only there -- the other three emit no scalar of three's own, and the fold reached the state on every one of the four (a silent fall back to the old refusal would say so here)",
           K.every((k) => R[k].foldError === null) && K.filter((k) => R[k].folded.length).join() === "webgl2:badTv",
           K.map((k) => `${k}: ${R[k].foldError || "state ok"}`).join(" | "));
        ok("  the folded fragment names that uniform NOWHERE -- declaration deleted, every reading replaced, so the rules below see a fragment with no unlabelled uniform in it at all",
           !/nodeUniform6/.test(R["webgl2:badTv"].fragment) && /bool\( 0u \)/.test(R["webgl2:badTv"].fragment), (R["webgl2:badTv"].fragment.match(/^.*0u.*$/m) || [""])[0].trim().slice(0, 80));
        ok("  and three's temporaries, which r184 moved OUT of main() to file scope, are carried -- checked on the OUTPUT: every name the transplanted body assigns is declared somewhere in the transplanted shader, and there is something to carry in all four",
           K.every((k) => R[k].undeclared && R[k].undeclared.length === 0 && R[k].carried > 0),
           K.map((k) => `${k}: ${R[k].carried} carried${R[k].undeclared && R[k].undeclared.length ? ", UNDECLARED " + R[k].undeclared.join(",") : ""}`).join(" | "));
        ok("  and the device's uniform vocabulary is exactly five words -- an unpackable node type comes back as type null, not as a word gfx/device.js would silently pack into four bytes",
           K.every((k) => R[k].all.uniforms.every((u) => u.type === null || ["f32", "vec2", "vec3", "vec4", "mat4"].includes(u.type))), K.flatMap((k) => R[k].all.uniforms.map((u) => u.type)).filter((t) => t && !["f32", "vec2", "vec3", "vec4", "mat4"].includes(t)).join(","));
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
//   MEASURED at v4323 (linear sampling):
//   D  the transplant no longer renaming three's `<texture>_sampler` to the device's `samp` -> exit=1, 4 red: the fixture line, the
//      declaration line, and on WebGPU the generated WGSL names a sampler nobody declared, so nothing draws (0 of 4,096 agree with
//      the hand-written pass and with three's own render). WebGL2 stays green: the GLSL binds its sampler by texture name.
//   MEASURED at v4539. Baseline 2 red, both the r184 GLSL flipY refusal in sections 2-3 (see render/tslSource.mjs's v4539
//   banner); everything else green. Applied one at a time to render/tslSource.mjs, gate run, exit code and red count read,
//   file restored and md5-verified, with a sentinel written before each mutation so a kill leaves a recoverable state.
//   I  the `render` group no longer skipped in bindingsFromState (three's camera matrices land in the object list) -> +2:
//      the identity row (0 of 3 agree -- the state now offers two matrices the text never saw) and the camera-leak row by name.
//   J  `labelled` hard-wired true (the property stops distinguishing three's own uniforms from the graph's) -> +3: the identity
//      row, the spelling-vs-property row (nodeUniform8 now claims a name), and the flipY refusal row that rests on it.
//   K  `uint` put back into DEVICE_UNIFORM_TYPES -> +2: the flipY row (nodeUniform6 stops being unpackable) and the five-word
//      row. This is the sabotage of the trap the table was written to avoid: gfx/device.js's _uniformLayout packs an unknown
//      type as `SZ[u.type] || 4`, so `u32` would have come out right BY ACCIDENT and `uvec2` silently wrong.
//   L  deviceUniformsFromState no longer filtering to the labelled -> +1: the identity row, three's own matrix offered to the
//      device alongside the graph's five knobs.
//   M  the f_ prefix taken back out of unreadUnlabelledUniforms' read-test -> +1: the refusal row, on its GLSL f_ case. This is
//      the sabotage of the hole this round FOUND -- `\bnodeUniform1\b` does not match inside `f_nodeUniform1`, so an r178 GLSL
//      that genuinely read an unlabelled uniform was called unread and the refusal silently skipped.
//   N  unreadUnlabelledUniforms calling every unlabelled uniform unread (the refusal off wholesale) -> +6, and worth reading:
//      the refusal row, and then BOTH backends failing to compile at all -- three's `nodeVar0` is declared inside the struct
//      block the transplant strips, so dropping the wrong field takes the declaration with it. The teeth are not decorative.
//   No 0-RED among the six. Restored and md5-verified after each.
//   MEASURED at v4540 (the flipY fold, the carried declarations, the codes region). Baseline 1 red -- gfx/device.js's own
//   address-mode contradiction, named at the section-3 row above and NOT the transplant's. Sentinel now covers what the
//   gate WRITES as well as what it is fed, which is the v4539 fault this log records.
//   O  the flipY constant folded to the WRONG literal (1u for three's false) -> +5: on WebGL2 the generated pipeline
//      draws 0 of 4,096 pixels of the hand-written picture, both in section 2 and section 3, plus the two fold rows.
//      The v is flipped, exactly as three would have flipped it had the flag been true. The fold is load-bearing.
//   P  the fold no longer restricted to the unlabelled -> +1, AND ONLY BECAUSE THIS ROUND ADDED THE ROW THAT CATCHES IT.
//      *** THE FIRST ATTEMPT AT P WENT 0-RED THROUGH THE WHOLE GATE. *** CONST_LITERAL carries bool/int/uint and every
//      knob in every graph here is a float, so the `labelled` guard protected nothing reachable -- redundant today and
//      load-bearing the day a float joins that table, which is how a protection quietly stops working. It is now
//      checked directly against a state built in section 1, and the sabotage bites.
//   Q  the declaration left in place, only the readings replaced (`uint 0u;`) -> +3: the two builders emit different
//      uniform lists, so devicePipelineFromTsl refuses before any draw, and the state/text agreement row goes with it.
//   R  carriedDeclarations returning nothing (the state before this round) -> +3, and by the NAMED refusal:
//      "the fragment assigns nodeVar0, which nothing in the transplanted shader declares".
//   S' the carry dropped AND that refusal removed -> +7, and this is what the refusal buys: the same fault arrives as
//      "gfx/device: the WGSL ... did not compile: unresolved value" and "shader: ERROR: 0:19: 'nodeVar0' : undeclared
//      identifier" -- a driver's error about a symbol, instead of a sentence naming what this file failed to carry.
//   T  the carry no longer narrowed to what the body names -> +5: `var<private> output : OutputStruct;` rides along into
//      a shell that declares no OutputStruct, and render/wgslSpec.mjs's scanner calls that clean, so only the WebGPU
//      driver says so. The scanner is weaker than the compiler here, which is worth knowing.
//   U  the GLSL codes region split back on `// structs` -> +4: r184 moved that marker above the uniforms, so the region
//      runs to the end of the file and main() is emitted twice; WebGL2 fails on the first undeclared temporary.
//   No 0-RED among the seven. Restored and verified after each, source and derived file both.
//   *** AND A FAULT IN THE SABOTAGE HARNESS ITSELF, RECORDED BECAUSE IT WAS MINE. *** The sentinel protected the file being
//   sabotaged (render/tslSource.mjs) and nothing else -- but under N the transplant SUCCEEDED and only the compile failed,
//   so this gate reached its own writer and rewrote tools/ship/tsl-emitted.json from sabotaged code. The source restored
//   clean and the DERIVED file did not; `git status` after the run is what caught it, not the harness. A sabotage harness
//   must restore everything the gate WRITES, not just what it is fed.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("gfx/device.js's address-mode contradiction (v4540: WebGPU sampled `repeat`, WebGL2 `clamp`, neither sayable by a caller) " +
    "is FIXED at v4543: dev.texture({ wrap }) takes \"clamp\" (the default, and what WebGL2 and the mip blit have always done) or " +
    "\"repeat\", both backends alike, and an unknown value is refused by name. The row above asks for repeat, because three's texture " +
    "is RepeatWrapping, and gets 4096 of 4096 on both backends where it got 3971 with worst 127 on one of them.");
console.log("unchecked here: a graph with MORE than one varying or with three's camera in it (refused, not transplanted -- a vertex-stage transplant is " +
    "the next rung); textures sampled with a linear filter through three's sampler (badTv's is nearest, which three reads with textureLoad; the fixture " +
    "covers the sampler path on the CPU only); and whether the generated code is as FAST as the hand-written -- three's nodeVar chain is longer, and nobody timed it.");
process.exit(fails ? 1 : 0);
