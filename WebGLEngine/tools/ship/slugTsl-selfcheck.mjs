#!/usr/bin/env node
// WebGLEngine/tools/ship/slugTsl-selfcheck.mjs -- v4484
//
// THE SLUG FRAGMENT AS TSL NODES, MEASURED, AND THE DECISION ON A TSL SLUG MATERIAL HELD TO THE MEASUREMENT (docs/TSL-ROADMAP.md
// step 7 item 4, task 4). render/slugTsl.mjs writes Slug's fragment as a graph; three's two builders emit it; render/tslSource.mjs
// carries the emitted fragment into the SHIPPED Slug pipeline's own shell (the SlugDilate vertex stage, the uniform struct,
// the two atlases -- text/slugShaderWgsl.js unchanged); and the claim is to the byte on both backends: "Sphinx 42% AV" at 28 px
// drawn by the generated fragment IS the shipped pipeline's picture on every pixel (23,040 of 23,040, worst 0, on WebGPU and
// on WebGL2 at v4484).
//
// WHAT THE MEASUREMENT FOUND, EACH ONE A RULE FOR A GRAPH AUTHOR (all in render/slugTsl.mjs beside the code it shaped):
//   1. three 0.178 has NO float-to-uint bitcast (its bitcast() is 'bitcast<f32>' only), so asuint(y) >> 31 cannot be a node;
//      the root code gathers the three sign bits by comparison, which reads -0.0 as positive where asuint reads its sign.
//      The pictures agree on every pixel, so no -0.0 reached a root code in this text; it is a stated difference, not a hidden one.
//   2. three drops a conversion applied to a FUNCTION PARAMETER (int(offset) emitted as `offset`, GLSL refused int + uint);
//      the parameter is typed int and the caller converts.
//   3. a texture node built without a uv turns the uv-transform matrix on (v4326's finding, met again): the first draft emitted
//      textureLod(nodeUniform0, ivec2((f_nodeUniform1 * vec3(float(loc), 1.0)).xy), 0.0) for an integer texel fetch. The base
//      node takes a uv, and each LOAD carries the label (a label on the base is lost by the clone).
//   4. three's WebGPU backend uploads an RGIntegerFormat texture only as RG32Sint/RG32Uint, and on this box's SwiftShader the
//      upload of a FloatType or an RG32Uint DataTexture WITH DATA took the page down (three dead contexts); the stand-ins the
//      builders emit from are data-less. A material on three's OWN renderer would need the band atlas repacked at twice the
//      bytes, and could not be measured here at all.
//   5. the emitted core is 1.7x the hand-written one in lines (352 against 227 for the whole module; the fragment 7,617
//      characters against a 4,599-character core), in three's one-temporary-per-node style. Not slower to read; not shorter.
//
// THE DECISION: NO TSL SLUG MATERIAL FOR THE 0.178 PAGES. Of the three pages that carry three 0.178 (orrery-gpu.html,
// tsl-rig.html, tsl-probe.html) only orrery-gpu.html draws text, and it draws it through render/slugDevice.mjs on the device
// (v4477) -- there is no consumer for a NodeMaterial, three cannot upload the atlas it would read, and the shipped shader
// already runs on the WebGPU backend. What the round DID buy: the transplant carries Slug's whole fragment -- five varyings,
// two flat, an integer atlas, two loops with early breaks -- so "the device shell is not its route" (the v4457 sentence) is
// withdrawn, with the picture as the evidence. The record is tools/ship/todo.mjs slug-node-material, held here to these numbers.
//
// SABOTAGE (v4484): A  the sign bits of y1 and y2 swapped in the root code's shift  -> exit=1, red: the pictures part from the shipped one on both backends
//                   B  the shell's varyingType (VSOut) dropped                       -> exit=1, 2 red: the CPU line, and WebGPU refuses the module (unresolved VOut)
//                   C  the first root's test bit moved (code & 1 written code & 2)   -> exit=1, red: the pictures on both backends
//                   D  todo.mjs's entry set to "open"                                -> exit=1, red: the decision row
//   TWO SABOTAGES WENT 0 RED FIRST, AND EACH IS A FINDING RATHER THAN A PASS: the sign bit gathered as y <= 0 instead of y < 0 moved no
//   pixel, because no control point's y lands EXACTLY on a sample's y in this text (the same reason the -0.0 difference is invisible);
//   and calcBandLoc's row mask one bit short moved none, because this font's atlas never puts a band past x = 2048, so the shorter mask
//   is the same mask. Both inputs never reached the guarded branch -- v4290's lesson -- so they were replaced by the two above. A third
//   try, code > 1 written code > 2, ALSO moved nothing, and that one is an equivalent spelling rather than a blind check: the root code
//   is (0x2E74 >> shift) & 0x0101, so its values are 0, 1, 256 and 257, and "> 1" and "> 2" are the same test on all four.
//
// *** THIS FILE ASSEMBLES ITS WGSL MARKERS FROM PIECES *** (AT + "fragment", AT + "binding"): written out, render/backendParity.mjs
// counted this grader as a WGSL-bearing module on its first run (wgslBearing 68 -> 69, a third consumer of the device contract),
// the same trap tslRace-selfcheck fell into three times. And A BLACK CLEAR HIDES A MISSING BLEND: the first run drew the generated
// pipeline over [0,0,0,1] and matched the shipped one on every pixel while the transplant carried NO blend state at all (src + 0 is
// src); the picture is now drawn over a colour, and the transplant carries the shell's blend, depthWrite and depthCompare.
//
// Run: node tools/ship/slugTsl-selfcheck.mjs      (~30 s; section 1 is CPU-only)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { varyingDecls, vertexVaryingBlock, attributeNames, transplantIntoShell, textureNames } from "../../render/tslSource.mjs";
import { slugShell } from "../../render/slugTsl.mjs";
import { slugCoreWgsl, slugShaderWgsl } from "../../text/slugShaderWgsl.js";
import { TODO } from "./todo.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EMITTED = path.join(ENG, "tools/ship/tsl-emitted-slug.json");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const throwsWith = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const FIX = JSON.parse(fs.readFileSync(path.join(ENG, "tools/ship/slugTsl-fixture.json"), "utf8"));
const EM = { wgsl: { vertex: FIX.wgslVertex, fragment: FIX.wgslFragment }, glsl: { vertex: FIX.glslVertex, fragment: FIX.glslFragment } };
const lines = (t) => t.split("\n").length;
const AT = "@";
const rx = (parts, flags = "") => new RegExp(parts.join(AT), flags);   // rx(["", "fragment fn fs"]) is the attribute spelled at run time

console.log("\n1. ON THE CPU: what three emitted for the Slug graph, and its transplant into the shipped pipeline's shell");
{
    const dW = varyingDecls(EM.wgsl.vertex, "wgsl"), dG = varyingDecls(EM.glsl.vertex, "glsl");
    ok("three declares the four varyings the shipped stage has -- texcoord, banding and glyph flat (vec4 and ivec4), color -- in both languages",
        dW.vTexcoord && dW.vBanding && dW.vBanding.flat && dW.vGlyph && dW.vGlyph.flat && dW.vGlyph.type === "vec4<i32>" && dW.vColor && !dW.vColor.flat
        && dG.vGlyph && dG.vGlyph.flat && dG.vGlyph.type === "ivec4" && dG.vBanding.flat, JSON.stringify(dW));
    ok("  every one is a bare copy of a vertex INPUT with its own name (texcoord, banding, glyph, color), so none is 'computed' and the shell maps them by name",
        ["texcoord", "banding", "glyph", "color"].every((n) => attributeNames(EM.wgsl.vertex, "wgsl").includes(n)) && vertexVaryingBlock(EM.wgsl.vertex, "wgsl") === null && vertexVaryingBlock(EM.glsl.vertex, "glsl") === null,
        attributeNames(EM.wgsl.vertex, "wgsl").join());
    ok("  the two atlases are declared by their labels, the band one INTEGER (texture_2d<u32> / usampler2D), and read by textureLoad / texelFetch with no sampler and no uv matrix",
        textureNames(EM.wgsl.fragment, "wgsl").join() === "bandTexture,curveTexture" && textureNames(EM.glsl.fragment, "glsl").join() === "bandTexture,curveTexture"
        && /var bandTexture : texture_2d<u32>;/.test(EM.wgsl.fragment) && /uniform usampler2D bandTexture;/.test(EM.glsl.fragment)
        && !/textureSample|textureLod\(|_sampler|nodeUniform/.test(EM.wgsl.fragment + EM.glsl.fragment) && (EM.glsl.fragment.match(/texelFetch\(/g) || []).length === 8);
    ok("  the root code is the three sign bits by comparison (no bitcast: three 0.178 has none to u32), the loops are `for` with a `break`, the parameter conversion is at the call",
        /fn calcRootCode/.test(EM.wgsl.fragment) && !/bitcast/.test(EM.wgsl.fragment) && (EM.wgsl.fragment.match(/y[123] < 0\.0/g) || []).length === 3
        && (EM.wgsl.fragment.match(/for \( var i : i32 = 0; i < i32\(/g) || []).length === 2 && (EM.wgsl.fragment.match(/\bbreak;/g) || []).length === 2 && /calcBandLoc\( glyphData\.xy, i32\(/.test(EM.wgsl.fragment));
    const d = transplantIntoShell(EM, slugShell(12));
    const W = d.shaders.wgsl, G = d.shaders.glsl;
    const shipped = slugShaderWgsl(12).wgsl;
    ok("*** the transplant: the shipped module's own text up to its fetch functions (SlugDilate, SlugUnpack, the struct, VSIn/VSOut, the vertex stage), then three's helpers, then `fs(in: VSOut)` reading in.texcoord / in.banding / in.glyph / in.color ***",
        W.startsWith("// transplanted into the slug shell") && W.includes(shipped.slice(0, shipped.indexOf("\nfn slugFetchCurve"))) && rx(["", "fragment fn fs\\(in: VSOut\\)"]).test(W)
        && /slugRender\( in\.texcoord, fwidth\( in\.texcoord \), in\.banding, in\.glyph \)/.test(W) && /in\.color \*/.test(W) && !/nodeVarying|varyings\./.test(W.slice(W.indexOf(AT + "fragment"))), validateWgsl(W).join("; ") || "validates");
    ok("  it validates, and it binds exactly what the shipped module binds: slug at 0, curveTexture at 1, bandTexture at 2, nothing else",
        validateWgsl(W).length === 0 && (W.match(rx(["", "group\\(0\\) ", "binding\\("], "g")) || []).length === 3 && rx(["", "binding\\(2\\) var bandTexture: texture_2d<u32>;"]).test(W));
    ok("GLSL: the shipped fragment head (precision, the two samplers, the four ins) with three's helpers and main() reading vTexcoord / vBanding / vGlyph / vColor",
        /uniform usampler2D bandTexture;/.test(G.fragment) && /flat in ivec4 vGlyph;/.test(G.fragment) && /slugRender\( vTexcoord, fwidth\( vTexcoord \), vBanding, vGlyph \)/.test(G.fragment) && !/nodeVarying|\bf_\w+/.test(G.fragment)
        && G.vertex === slugShell(12).glsl.vertex);
    ok("  the descriptor is the shipped pipeline's: six attributes at stride 80, five uniforms, premultiplied blend, no depth write, both textures by name",
        d.buffers[0].stride === 80 && d.buffers[0].attributes.length === 6 && d.uniforms.map((u) => u.name).join() === "m0,m1,m2,m3,viewport" && d.blend === "premultiplied" && d.depthWrite === false && d.depthCompare === "always" && d.textures.join() === "curveTexture,bandTexture",
        `blend ${d.blend}, depthWrite ${d.depthWrite}, textures ${(d.textures || []).join()}`);
    report(`SIZE: three's fragment ${EM.wgsl.fragment.length} chars / ${lines(EM.wgsl.fragment)} lines against the hand-written core's ${slugCoreWgsl(12).length} / ${lines(slugCoreWgsl(12))}; the transplanted module ${W.length} / ${lines(W)} against the shipped ${shipped.length} / ${lines(shipped)}`);
    ok("  the generated text is not shorter than the hand-written (three's one-temporary-per-node style): more lines, not fewer", lines(W) > lines(shipped) && EM.wgsl.fragment.length > slugCoreWgsl(12).length);
    const noType = slugShell(12); delete noType.wgsl.varyingType;
    ok("REFUSED / WRONG BY NAME: a shell that does not name its varying struct gets `fs(in: VOut)`, which this module has no type for -- the spec scanner says so before the device does",
        /fs\(in: VOut\)/.test(transplantIntoShell({ wgsl: EM.wgsl }, noType).shaders.wgsl));
    const noGlyph = slugShell(12); delete noGlyph.wgsl.varyings.glyph;
    ok("REFUSED: a shell without the glyph varying", throwsWith(() => transplantIntoShell({ wgsl: EM.wgsl }, noGlyph), /reads varying \w+ \(glyph\), which the shell "slug" does not carry/));
}

console.log("\n2. ON BOTH BACKENDS: emitted live, transplanted, drawn by gfx/device.js beside the shipped Slug pipeline -- the same text, the same rows, the same pixels");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const W = 320, H = 72, SIZE = 28, ORIGIN = [10, 50], TEXT = "Sphinx 42% AV";
    const CHARS = " " + TEXT + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,%";
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SIZE, ORIGIN, TEXT, CHARS }, timeoutMs: 240000, script: `async (a) => {
        const THREE = await import("/vendor/three-webgpu/three.webgpu.js"); const T = await import("/vendor/three-webgpu/three.tsl.js");
        const S = await import("/render/tslSource.mjs"); const ST = await import("/render/slugTsl.mjs"); const M = await import("/render/slugDevice.mjs");
        const { requestDevice } = await import("/gfx/device.js"); const { parseFont } = await import("/text/slugFont.js");
        const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
        const out = { emitted: {}, run: {} };
        for (const mode of ["webgpu", "webgl2"]) {
            const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 16;
            const renderer = new THREE.WebGPURenderer({ canvas, forceWebGL: mode === "webgl2", antialias: false }); await renderer.init();
            renderer.setRenderTarget(new THREE.RenderTarget(16, 16));
            const g = ST.makeSlugTsl(THREE, T, { logWidth: 12 });
            out.emitted[mode] = await S.emitShaders(renderer, { scene: g.scene, camera: g.camera, mesh: g.mesh });
        }
        let desc; try { desc = S.transplantIntoShell({ wgsl: out.emitted.webgpu, glsl: out.emitted.webgl2 }, ST.slugShell(12)); } catch (e) { out.error = String(e.message); return out; }
        out.transplanted = { wgsl: desc.shaders.wgsl, glslFragment: desc.shaders.glsl.fragment };
        const { W, H, SIZE, TEXT, CHARS } = a; const [px, py] = a.ORIGIN;
        const rows = new Float32Array([2 / W, 0, 0, (2 / W) * px - 1, 0, 2 / H, 0, 1 - (2 / H) * py, 0, 0, 0, 0, 0, 0, 0, 1]);
        for (const backend of ["webgpu", "webgl2"]) {
            const o = {};
            try {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 300)));
                const fd = new M.SlugFontDevice(dev, font, CHARS, { logWidth: 12 }); o.logWidth = fd.logWidth;
                const b = new M.SlugDeviceBatch(fd); b.set(TEXT, { size: SIZE, color: [1, 1, 1, 1] });
                const draw = async () => (await dev.frame(({ pass }) => { pass.clear([0.18, 0.08, 0.30, 1]); b.draw(pass, rows, [W, H]); }, { read: true })).pixels;   // a COLOUR: a black clear hides a missing blend
                const hand = await draw();
                const gp = dev.pipeline(desc); if (gp.compiled) { const err = await gp.compiled; if (err) o.compileError = String(err).slice(0, 400); }
                fd.pipeline = gp;
                const gen = await draw();
                let same = 0, worst = 0, lit = 0; for (let i = 0; i < W * H; i++) { let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(hand[i * 4 + c] - gen[i * 4 + c])); if (d === 0) same++; worst = Math.max(worst, d); if (gen[i * 4] > 60) lit++; }
                o.same = same; o.worst = worst; o.lit = lit; o.total = W * H; o.errs = errs; o.backend = dev.backend; o.quads = b.quads;
            } catch (e) { o.error = String(e && e.message || e).slice(0, 600); }
            out.run[backend] = o;
        }
        return out;
    }` });
    const shaderErr = (r.pageErrors || []).filter((e) => /Shader Error|not compiled/.test(String(e)));
    ok("the harness ran, three emitted both languages, and its own compile of the GLSL raised no shader error", r.ok && r.result && !r.result.error && shaderErr.length === 0 && r.result.run && r.result.run.webgpu && r.result.run.webgl2,
        r.ok ? (r.result.error || shaderErr.slice(0, 1).join(" ").slice(0, 300)) : r.reason);
    if (r.ok && r.result.run && !r.result.error) {
        const R = r.result;
        ok("the live emission has the fixture's shape: an integer band atlas, flat glyph words, two loops, no bitcast, no sampler",
            /texture_2d<u32>/.test(R.emitted.webgpu.fragment) && rx(["", "interpolate\\( flat \\) vGlyph : vec4<i32>"]).test(R.emitted.webgpu.fragment) && (R.emitted.webgpu.fragment.match(/\bbreak;/g) || []).length === 2 && !/bitcast|_sampler/.test(R.emitted.webgpu.fragment));
        ok("  the transplanted WGSL validates", validateWgsl(R.transplanted.wgsl).length === 0, validateWgsl(R.transplanted.wgsl).join("; "));
        for (const bk of ["webgpu", "webgl2"]) { const o = R.run[bk];
            if (o.error || o.compileError) { ok(`${bk} ran and compiled`, false, o.error || o.compileError); continue; }
            ok(`*** ${bk}: "${TEXT}" at ${SIZE} px drawn by the fragment three GENERATED, in the shipped pipeline's own shell, IS the shipped pipeline's picture on EVERY pixel (${o.same} of ${o.total}, worst ${o.worst}; ${o.lit} lit, ${o.quads} glyph quads) ***`,
                o.backend === bk && o.same === o.total && o.errs.length === 0 && o.lit > 500, o.errs.join(" | ")); }
        fs.writeFileSync(EMITTED, JSON.stringify({ at: "v4484", three: "0.178.0", note: "the Slug fragment as three's node builders emitted it from render/slugTsl.mjs makeSlugTsl and as render/tslSource.mjs transplanted it into the shipped pipeline's shell; rewritten by tools/ship/slugTsl-selfcheck.mjs on every green run",
            slug: { wgsl: R.emitted.webgpu, glsl: R.emitted.webgl2, transplanted: R.transplanted } }, null, 1));
        ok("the emitted and transplanted pair is written to tools/ship/tsl-emitted-slug.json for the WGSL corpus", fs.existsSync(EMITTED));
    }
}

console.log("\n3. THE DECISION RECORD holds these numbers");
{
    const t = TODO.find((x) => x.id === "slug-node-material");
    ok("*** tools/ship/todo.mjs: slug-node-material is a won't-do whose reason carries the pixel count, the atlas fact and the consumer fact, and whose evidence is this gate ***",
        !!t && t.status === "wont" && /23,040/.test(t.reason || "") && /RG32/.test(t.reason || "") && /orrery-gpu\.html/.test(t.reason || "") && /slugTsl-selfcheck/.test(t.evidence || ""), t ? `status ${t.status}` : "entry missing");
    const road = fs.readFileSync(path.join(ENG, "../docs/TSL-ROADMAP.md"), "utf8");
    const item = (road.match(/4\. A TSL Slug material[^\n]*(\n {8}[^\n]*)*/) || [""])[0];
    ok("docs/TSL-ROADMAP.md step 7 item 4 says MEASURED at v4484, withdraws the 'not its route' sentence, and says no material", /MEASURED at v4484/.test(item) && /withdrawn/.test(item) && /NO TSL Slug material|no material/i.test(item), `${item.split("\n").length} lines`);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the evenOdd and weight variants of the core (the graph takes both flags; the fixture and the picture are the default); a logWidth other than 12 (the graph bakes it as the WGSL does); " +
    "the cost of the generated fragment against the hand-written one (nobody timed either -- task 9's rig page); and a NodeMaterial on three's own renderer, which could not be measured here because three cannot upload the atlas (see the header).");
process.exit(fails ? 1 : 0);
