// WebGLEngine/render/snowGpu-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~16 s with a browser; sections 1-2 alone ~0.5 s)
//
// Run: node render/snowGpu-selfcheck.mjs
//
// THE SNOW FRAME ON THE GPU, HELD STAGE BY STAGE TO THE CPU TWINS THAT GRADE THE PIECES (render/snowGpu.mjs, snow-gpu.html):
//   1  THE CAMERA   (node) viewProj puts a point straight ahead at clip (0, 0, depth, depth) with depth 0 at the near plane and 1 at the far, a point at +tanX x depth on NDC x = 1, adds the jitter to NDC and nothing else;
//                   invView inverts the view; reprojecting a jittered pixel with the CLEAN previous matrix lands j/2 away in uv -- the jitter is removed, which is what the TAA relies on; lightFit centres the sun's box;
//   2  THE SOURCE   the vertex function that places and lifts a vertex is ONE function called by the beauty vertex stage, the shadow vertex stage and the debug dump; the clipmap placement, the deformation read, PCSS,
//                   aerialTransmittance and the TAA resolve inside the shaders are upstream's text; a pass draws the terrain with ONE indexed draw;
//   3  THE FRAME    (needs a browser with WebGPU; SKIPPED, and said, without one) snow-gpu.html in headless Chromium's software WebGPU adapter, frames driven from outside:
//        - the page starts with no GPU error, and one frame is ONE indexed draw per pass (shadow, beauty) plus the sky's 3-vertex draw, counted at the encoder;
//        - the field stepped by the compute kernel equals a CPU DeformField given the same brushes and focus (worst difference bounded per channel);
//        - the sky buffer equals skyBake's CPU bake, and moving the sun re-bakes exactly once;
//        - the VERTEX STAGE's own function, read back through the debug dump, equals the CPU: placement and spacing to f32, heights to the noise's f32 disagreement, normals within a few hundredths;
//        - the shadow: on flat ground under a 4 degree sun almost nothing is shadowed (no acne: the receiver-plane term works on the GPU), on dunes some of it is (the shadows are real);
//        - the TAA pass on textures equals the CPU resolve on the same images, and with a jittered camera held still the frame-to-frame flicker is lower with TAA on than off;
//        - the sky dome is the right way round: looking toward the sun is brighter than looking away, and the zenith is blue;
//        - the live loop (rAF, presenting to the canvas) runs for four seconds, steps the walker, and raises no GPU error.
// SABOTAGES, each applied to the real render/snowGpu.mjs, restored, md5 verified; every one red by name (rows red): the shadow lookup's v sign in the plane gradient flipped 1 (flat ground 65% shadowed) | the TAA
// texture fetch's row flip removed 3 | the normal's difference step doubled 1 | the sky re-baked every frame 1.
//   AND, in the frame: the GPU-baked detail map equals the CPU bake and its mip chain is the box filter; the sky buffer is the whole mip chain; all three shadow maps hold terrain and the cascades describe the SAME shadows
//   (each read alone over the near ground); sastrugi and detail are in the picture (local contrast x17); subsurface lights the snow looking into the sun and not away; glints are grazing-only (none looking straight down).
// NOT GRADED, said plainly: speed or looks on a real GPU (the adapter is a software rasteriser), the sun's disc and the ground bounce, AgX and film grain.
// SABOTAGES OF THE SPLIT (v4896), each applied to the real source, the part run alone, restored md5-identical; every one red BY NAME, so the split lost no wiring: snowGpuField -- the stamp
// no-op'd (the field row); snowGpuLookB -- the glint intensity zeroed in the Frame uniform (the glint row); snowGpuLookA -- the subsurface strength zeroed in the material (the subsurface
// row); snowGpuTaa -- rowOf's y flip removed (the TAA kernel row); snowGpuLive -- the page's rAF loop stopped (the live-loop row: 1 frame in nine seconds); and THIS file -- the mip kernel
// reading its x0 sample twice (the mip-chain row). Measured alone on the box that split it: this 15 s, Field 13 s, Live 10 s, LookA 18 s, LookB 15 s, Taa 17 s -- none capped.
// SABOTAGE LOG (v4895): see cascades-selfcheck (the plane sign: 2 red) and snowFine-selfcheck (the mip kernel: 3 red); each on the real file, restored.
// v4896 -- SPLIT. This file was the whole snow frame on the GPU and took 38-57 s, past the quick sweep's 20 s cap: no sweep ever recorded it finishing, and gateBudget carried it as UNRESOLVED.
// The browser blocks are unchanged (but for the look gates' sizes, said in them) and live in five siblings now, each well under the cap alone: snowGpuField (the compute-stepped deformation field against the CPU DeformField),
// snowGpuTaa (the TAA texture kernel, the flicker with the jitter held still, the sky dome), snowGpuLookA (the shadow maps and cascades, fine relief, subsurface scattering), snowGpuLookB (glints) and snowGpuLive (the live loop
// and its rate, which realGpuRun reads). THIS file keeps sections 1-2 (maths and text) and the core stages: the page boot, the draw calls, the sky bake, the vertex stage, the
// shadows, the detail map and the mip chain.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as G from "./snowGpu.mjs";
import { mulMat4Vec4 } from "./taaResolve.mjs";
import { LAUNCH_ARGS, SECURE_HOST, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const norm = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim();
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

console.log("snowGpu-selfcheck -- the snow frame on the GPU\n");
console.log("1. THE CAMERA");
{
    const b = G.cameraBasis([3, 2, -5], [3, 2, 5]), tanX = 0.9, tanY = 0.5, n = 0.05, f = 2000;
    const clip = (m, p) => mulMat4Vec4(m, [p[0], p[1], p[2], 1]);
    const vp = G.viewProj(b, tanX, tanY, n, f);
    const ahead = clip(vp, [3, 2, -5 + 10]), nearP = clip(vp, [3, 2, -5 + n]), farP = clip(vp, [3, 2, -5 + f]), right = clip(vp, [3 + tanX * 10, 2, -5 + 10]), up = clip(vp, [3, 2 + tanY * 10, -5 + 10]);
    ok("!! viewProj: straight ahead at 10 m is clip (0, 0, z, 10); depth is 0 at the near plane and 1 at the far; a point at +tanX x depth is NDC x = 1 and one at +tanY x depth is NDC y = 1", near(ahead[0], 0) && near(ahead[1], 0) && near(ahead[3], 10) && near(nearP[2] / nearP[3], 0, 1e-9) && near(farP[2] / farP[3], 1, 1e-9) && near(right[0] / right[3], 1) && near(up[1] / up[3], 1), "z/w ahead " + (ahead[2] / ahead[3]).toFixed(5));
    const j = G.viewProj(b, tanX, tanY, n, f, 0.02, -0.03), cj = clip(j, [4, 3, 6]), c0 = clip(vp, [4, 3, 6]);
    ok("!! the jitter adds exactly (jx, jy) to NDC and leaves depth and w alone", near(cj[0] / cj[3] - c0[0] / c0[3], 0.02) && near(cj[1] / cj[3] - c0[1] / c0[3], -0.03) && near(cj[2], c0[2]) && near(cj[3], c0[3]));
    const iv = G.invView(b), viewPt = [1.5, -0.7, 8], world = mulMat4Vec4(iv, [...viewPt, 1]), back = [(world[0] - b.pos[0]) * b.r[0] + (world[1] - b.pos[1]) * b.r[1] + (world[2] - b.pos[2]) * b.r[2], (world[0] - b.pos[0]) * b.u[0] + (world[1] - b.pos[1]) * b.u[1] + (world[2] - b.pos[2]) * b.u[2], (world[0] - b.pos[0]) * b.f[0] + (world[1] - b.pos[1]) * b.f[1] + (world[2] - b.pos[2]) * b.f[2]];
    ok("  invView takes a view-space point (x right, y up, z forward) to the world and the basis takes it back", back.every((v, i) => near(v, viewPt[i], 1e-9)));
    // the TAA's reprojection of a JITTERED pixel through the CLEAN previous matrix, exactly as taa.fragment.wgsl does it
    const J = [0.013, -0.021], W = 64, H = 36; let worst = 0;
    for (let k = 0; k < 50; k++) {
        const u = 0.1 + 0.8 * ((k * 0.618) % 1), v = 0.1 + 0.8 * ((k * 0.381) % 1), z = 5 + k, ndc = [u * 2 - 1 - J[0], v * 2 - 1 - J[1]];
        const w = mulMat4Vec4(iv, [ndc[0] * tanX * z, ndc[1] * tanY * z, z, 1]), pc = mulMat4Vec4(vp, [w[0], w[1], w[2], 1]);
        const prevUV = [(pc[0] / pc[3]) * 0.5 + 0.5, (pc[1] / pc[3]) * 0.5 + 0.5];
        worst = Math.max(worst, Math.abs(prevUV[0] - (u - J[0] / 2)), Math.abs(prevUV[1] - (v - J[1] / 2)));
    }
    ok("!! reprojecting a jittered pixel through the clean matrix lands exactly j/2 away in uv (the jitter is removed), over 50 pixels and depths (worst error " + worst.toExponential(1) + ")", worst < 1e-9);
    const sun = [0.3, 0.6, 0.74], sl = Math.hypot(...sun), sd = sun.map((x) => x / sl), lf = G.lightFit(sd, [10, 0, -4], 80, 160), cc = mulMat4Vec4(lf.vp, [10, 0, -4, 1]);
    const toSun = mulMat4Vec4(lf.vp, [10 + sd[0] * 60, 0 + sd[1] * 60, -4 + sd[2] * 60, 1]), edge = mulMat4Vec4(lf.vp, [10 + lf.r[0] * 40, 0 + lf.r[1] * 40, -4 + lf.r[2] * 40, 1]);
    ok("!! lightFit: the centre is NDC (0, 0) at depth 0.5, a point 40 m along the light's right is NDC x = 1, and a point toward the sun is nearer the light (smaller depth)", near(cc[0], 0) && near(cc[1], 0) && near(cc[2], 0.5, 1e-9) && near(edge[0], 1, 1e-9) && toSun[2] < cc[2] && near(Math.hypot(...lf.f) , 1) && near(lf.f[0] + sd[0], 0));
    const js = Array.from({ length: 8 }, (_, i) => G.jitterNdc(i, 640, 360));
    ok("  the jitter is Halton(2,3) over 8 frames, within half a pixel (1/640 and 1/360 in NDC), and repeats", js.every(([x, y]) => Math.abs(x) <= 1 / 640 + 1e-12 && Math.abs(y) <= 1 / 360 + 1e-12) && G.jitterNdc(8, 640, 360).join() === js[0].join() && new Set(js.map((p) => p.join())).size === 8);
}

console.log("\n2. THE SOURCE");
{
    const V = norm(G.TERRAIN_VERTEX_WGSL), B = norm(G.BEAUTY_WGSL), T = norm(G.TAA_GPU_WGSL), up = (f) => norm(fs.readFileSync(path.join(ENG, "vendor/snowflow/src/shaders", f), "utf8"));
    const calls = (V.match(/surfaceOf\(/g) || []).length - 1;   // minus the definition
    ok("!! one function places and lifts a vertex: surfaceOf is called by the beauty vertex stage, the shadow vertex stage and the debug dump (" + calls + " callers), so the shadow pass cannot disagree with the picture", calls === 3 && /fn vsMain[\s\S]{0,200}surfaceOf/.test(V) && /fn vsShadow[\s\S]{0,200}surfaceOf/.test(V) && /fn dumpTerrain[\s\S]{0,400}surfaceOf/.test(V));
    const sf = up("snow.fragment.wgsl"), ab = up("auxBake.fragment.wgsl"), clip = up("lib/clipmap.wgsl"), dfm = up("lib/deform.wgsl"), atm = up("lib/atmosphere.wgsl"), sh = up("lib/shading.wgsl"), taa = up("post/taa.fragment.wgsl");
    const need = [[V, clip, "let morph = clamp((cheb - 0.70) / 0.16, 0.0, 1.0);"], [V, clip, "let coarseGrid = floor(grid * 0.5) * 2.0; let coarseLocal = coarseGrid * spacing; local = mix(local, coarseLocal, morph);"], [V, dfm, "return 1.0 - smoothstep(0.80, 0.96, max(d.x, d.y));"], [V, dfm, "acc += (s.g - s.r) * wt; } } return acc * scale * w; }"], [B, sh, "let penumbraWorld = blockerDist * 0.0093 * softness;"], [B, sh, "lit += select(1.0, 0.0, d < cmp); } return lit / 12.0;"], [B, atm, "integral = (exp(-k * camPos.y) - exp(-k * worldPos.y)) / (k * dy) * length(d);"], [T, taa, "let hist = clamp(raw, lo, hi);"], [T, taa, "let w12 = w1 + w2; let off12 = w2 / w12;"],
        [B, sf, "let footprintMin = max(min(length(ddxW.xz), length(ddyW.xz)), 1e-4);"], [B, sf, "let steep = smoothstep(0.55, 0.9, 1.0 - N.y);"], [B, sf, "let f1 = 1.0 - smoothstep(0.02, 0.12, footprint);"], [B, sf, "acc = blendNormalRNM(acc, mix(vec3f(0.0, 0.0, 1.0), d, f1 * 0.85));"],
        [B, sf, "albedo = mix(albedo, vec3f(0.62, 0.665, 0.755), compression * 0.85);"], [B, sf, "roughness = mix(roughness, 0.07, iceAmount);"], [B, sf, "let wrapAmount = mix(0.62, 0.15, max(compression, rockExposed));"], [B, sf, "direct += sss * albedo * mix(0.42, 1.0, shadow);"],
        [B, sf, "let bounceUp = clamp(-N.y * 0.5 + 0.5, 0.0, 1.0);"], [B, sf, "let mip = sqrt(roughness) * 6.0;"], [B, sf, "let caveTint = mix(vec3f(1.0), vec3f(0.55, 0.72, 1.0), (1.0 - ao) * 0.95); color *= ao * caveTint;"],
        [B, sf, "let df = mix(c, (c + dxA + dxB + dzA + dzB) * 0.2, wide);"], [B, sf, "color += sunRadiance * g * shadow * (1.0 - iceAmount * 0.6) * 0.55;"],
        [B, ab, "clamp(0.5 - lap * 2.2, 0.0, 1.0)"], [V, ab, "clamp(0.5 - lap * 2.2, 0.0, 1.0)"], [V, up("snow.vertex.wgsl"), "smoothstep(0.16, 0.42,"], [V, up("snow.vertex.wgsl"), "smoothstep(0.5, 1.0,"]];
    const missing = need.filter(([mod, upstream, s]) => !(mod.includes(s) && upstream.includes(s)));
    ok("!! the clipmap placement, the deformation read, PCSS, aerialTransmittance, the TAA resolve AND the snow material's own composition (the normal chain, the albedo states, the wrap, the subsurface, the sky bounce, the glint, the cave tint) inside the shaders are upstream's text (spot statements from each found in both)", missing.length === 0, need.length + " statements" + (missing.length ? "; MISSING " + missing.map((m) => m[2].slice(0, 40)).join(" | ") : ""));
    const src = fs.readFileSync(path.join(ENG, "render/snowGpu.mjs"), "utf8");
    ok("!! a pass draws the terrain with ONE indexed draw: the shadow pass and the beauty pass each call drawIndexed(clip.indices.length) once, and the sky is a 3-vertex draw", (src.match(/drawIndexed\(clip\.indices\.length\)/g) || []).length === 2 && (src.match(/p\.draw\(3\)/g) || []).length >= 2);
    ok("  the page uses only createSnowGpu and loads nothing from outside; nothing becomes markup", (() => { const h = fs.readFileSync(path.join(ENG, "snow-gpu.html"), "utf8"); const body = h.slice(h.indexOf('<script type="module">')).replace(/\/\/[^\n]*/g, ""); return /createSnowGpu\(device/.test(h) && !["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function"].some((w) => body.includes(w)) && !/(?:src|href)=["']https?:/.test(h); })());
}

{
    // the constants and the small shaders, held to what they must equal
    const floatsOf = (struct) => { let n = 0; for (const m of struct.matchAll(/:\s*(?:array<)?(mat4x4f|vec4f)(?:,\s*(\d+)>)?/g)) n += (m[1] === "mat4x4f" ? 16 : 4) * (m[2] ? +m[2] : 1); return n; };
    const frameStruct = G.TERRAIN_VERTEX_WGSL.slice(G.TERRAIN_VERTEX_WGSL.indexOf("struct Frame {"), G.TERRAIN_VERTEX_WGSL.indexOf("};", G.TERRAIN_VERTEX_WGSL.indexOf("struct Frame {")));
    ok("!! FRAME_FLOATS (" + G.FRAME_FLOATS + ") is the Frame uniform block's size in floats as the WGSL declares it (" + floatsOf(frameStruct) + "), and the sky LUT and shadow map sizes the module sets are the ones the shaders declare (SKY_W " + G.SKY_W + ", SKY_H " + G.SKY_H + ", SHADOW_RES " + G.SHADOW_RES + ", POST_FAR " + G.POST_FAR + ")", floatsOf(frameStruct) === G.FRAME_FLOATS && new RegExp("const SKY_W: i32 = " + G.SKY_W + ";").test(G.TERRAIN_VERTEX_WGSL) && new RegExp("const SKY_H: i32 = " + G.SKY_H + ";").test(G.TERRAIN_VERTEX_WGSL) && new RegExp("const POST_FAR: f32 = " + G.POST_FAR + "\\.0;").test(G.TAA_GPU_WGSL) && G.SHADOW_RES === 2048 && G.HDR_FORMAT === "rgba16float" && G.DEPTH_FORMAT === "r32float");
    ok("  the sky sampler is upstream's mapping (u = atan2(x, z) / 2pi + 0.5, v = acos(y) / pi) with a wrapped u and a clamped v, and the present pass exposes, Reinhard-maps and gamma-encodes", /let u = atan2\(d\.x, d\.z\) \/ \(2\.0 \* PI\) \+ 0\.5;/.test(G.SKY_SAMPLE_WGSL) && /let v = acos\(clamp\(d\.y, -1\.0, 1\.0\)\) \/ PI;/.test(G.SKY_SAMPLE_WGSL) && /clamp\(iy, 0, SKY_H - 1\)/.test(G.SKY_SAMPLE_WGSL) && /c \/ \(1\.0 \+ c\)/.test(G.PRESENT_WGSL) && /1\.0 \/ 2\.2/.test(G.PRESENT_WGSL));
    const shA = G.skySH([0, Math.sin(0.2), Math.cos(0.2)], 20, [0.55, 0.62, 0.74]);
    ok("  skySH is nine [r, g, b, 0] coefficients of the sky (36 floats), the first (the mean) positive and blue-dominant", shA.length === 36 && shA[0] > 0 && shA[2] > shA[0] && shA[3] === 0);
    const a2 = G.skyAmbient([0, Math.sin(0.2), Math.cos(0.2)], 20, [0.55, 0.62, 0.74]), a40 = G.skyAmbient([0, Math.sin(0.7), Math.cos(0.7)], 20, [0.55, 0.62, 0.74]);
    ok("  skyAmbient (five CPU evaluations of the kernel's own function) is finite and positive, bluer than it is red, and brighter with the sun higher (" + a2.map((v) => v.toFixed(2)).join(" ") + " at 11 degrees, " + a40.map((v) => v.toFixed(2)).join(" ") + " at 40)", a2.every((v) => v > 0 && Number.isFinite(v)) && a2[2] > a2[0] && a40[0] + a40[1] + a40[2] > a2[0] + a2[1] + a2[2]);
}

console.log("\n3. THE FRAME");
const skipWhy = webgpuSkipReason(require_);
if (skipWhy) {
    report("live half SKIPPED -- " + skipWhy);
    report("*** THAT IS A SKIP AND NOT A PASS: sections 1-2 read maths and text, and neither shows one frame of the GPU path");
} else {
    const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
    const server = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split("?")[0]), f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { s.writeHead(200, { "Content-Type": types[path.extname(f)] || "text/plain" }); return s.end(fs.readFileSync(f)); } s.writeHead(404); s.end("no"); });
    await new Promise((r) => server.listen(0, SECURE_HOST, r));
    const pw = resolvePlaywright(require_), browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
    const base = `http://${SECURE_HOST}:${server.address().port}`;
    try {
        const page = await browser.newPage({ viewport: { width: 320, height: 180 } }), pageErrs = [];
        page.on("pageerror", (e) => pageErrs.push(String(e).slice(0, 300)));
        page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) pageErrs.push(m.text().slice(0, 300)); });
        await page.goto(base + "/snow-gpu.html?manual=1");
        await page.waitForFunction(() => window.__snowgpu && (window.__snowgpu.ready || window.__snowgpu.error), null, { timeout: 60000 });
        const boot = await page.evaluate(() => ({ ready: window.__snowgpu.ready, error: window.__snowgpu.error, adapter: window.__snowgpu.adapter }));
        ok("!! snow-gpu.html starts on WebGPU (adapter " + (boot.adapter || "?") + ") with no error", boot.ready && !boot.error, boot.error);
        if (boot.ready) {
            const run = (fn, arg) => page.evaluate(fn, arg);
            // ---- one frame's draw calls, counted at the encoder
            const calls = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, P = GPURenderPassEncoder.prototype, d0 = P.draw, di0 = P.drawIndexed, c = { draw: 0, drawIndexed: 0, indexCounts: [] };
                P.draw = function (...a) { c.draw++; return d0.apply(this, a); }; P.drawIndexed = function (...a) { c.drawIndexed++; c.indexCounts.push(a[0]); return di0.apply(this, a); };
                await g.frame(0.016, { x: 0, z: 0 }, S.camFor(), { present: false }); P.draw = d0; P.drawIndexed = di0; return { ...c, indices: g.stats.indices };
            });
            ok("!! one frame is " + calls.drawIndexed + " indexed draws (three shadow cascades and the beauty pass, " + calls.indexCounts[0] + " indices each = the whole clipmap) plus the sky dome's " + calls.draw + " draw (plus the present triangle when presenting)", calls.drawIndexed === 4 && calls.indexCounts.every((n) => n === calls.indices) && calls.draw >= 1);
            // ---- the sky
            const skyR = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, SB = await import("/render/skyBake.mjs"), b0 = g.stats.bakes, lut = await g.readSky(), sun = g.sun;
                const cpu = SB.bakeSky(64, 32, sun, 20, [0.55, 0.62, 0.74]); let worstRel = 0; for (let i = 0; i < cpu.length; i++) { if (i % 4 === 3) continue; worstRel = Math.max(worstRel, Math.abs(lut[i] - cpu[i]) / Math.max(Math.abs(cpu[i]), 0.02)); }
                g.setSun(40); await g.frame(0.016, { x: 0, z: 0 }, S.camFor(), { present: false }); const b1 = g.stats.bakes; await g.frame(0.016, { x: 0, z: 0 }, S.camFor(), { present: false }); const b2 = g.stats.bakes;
                const lut2 = await g.readSky(); let moved = 0; for (let i = 0; i < lut.length; i++) moved += Math.abs(lut2[i] - lut[i]);
                g.setSun(13); await g.frame(0.016, { x: 0, z: 0 }, S.camFor(), { present: false });
                return { worstRel, b0, b1, b2, moved };
            });
            ok("!! the sky buffer the GPU baked equals skyBake's CPU bake over 64 x 32 texels (worst relative difference " + (skyR.worstRel * 100).toFixed(2) + "%), and moving the sun re-bakes exactly once (" + skyR.b0 + " -> " + skyR.b1 + " -> " + skyR.b2 + " bakes) and changes the buffer", skyR.worstRel < 0.05 && skyR.b1 === skyR.b0 + 1 && skyR.b2 === skyR.b1 && skyR.moved > 10);
            // the vertex block below reads the field's trail, so give it one: the same four brushes the field gate stamps (snowGpuField-selfcheck.mjs grades the field itself), carried in by three frames
            await run(async () => {
                const S = window.__snowgpu, g = S.gpu, cam = S.camFor();
                for (const st of [[3, 1, 0.5, 0.12, 0.08, 0.6, 0.3, 0.4, 1.8, 0], [-2, 4, 0.4, 0.1, 0.05, 0.5, 0, 1.1, 1, 0], [0.3, -1, 0.7, 0.15, 0.1, 0.8, 0.5, 0, 1, 0], [9.8, 0.2, 0.5, 0.1, 0.05, 0.5, 0, 0, 1, 0]]) g.stamp(...st);
                for (let i = 0; i < 3; i++) await g.frame(0.05, { x: i * 0.31, z: i * 0.12 }, cam, { present: false });
            });
            // ---- the vertex stage's own function, read back
            const vtx = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, CM = await import("/render/clipmapTerrain.mjs"), DR = await import("/render/deformRead.mjs"), T = await import("/render/toroidalDeform.mjs");
                await g.frame(0.016, { x: S.walker.x, z: S.walker.z }, S.camFor(), { present: false });
                const cam = S.camFor(), N = 1500, verts = new Float32Array(N * 3), pick = []; let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
                for (let i = 0; i < N; i++) { const s = Math.floor(rnd() * g.clip.vertices); pick.push(s); verts.set(g.clip.positions.subarray(s * 3, s * 3 + 3), i * 3); }
                const out = await g.dumpTerrain(verts), field = await g.readField(), f = g.field;
                const SFm = await import("/render/snowFine.mjs"), dunes = (x, z) => 1.1 * T.noise2(x * 0.045 + 3, z * 0.045 - 5) + 0.35 * T.noise2(x * 0.14, z * 0.14 + 9) + 0.06 * T.noise2(x * 0.9, z * 0.9);
                const expo = (x, z) => { const wd = 3, lap = (dunes(x - wd, z) + dunes(x + wd, z) + dunes(x, z - wd) + dunes(x, z + wd) - 4 * dunes(x, z)) / (wd * wd); return Math.min(1, Math.max(0, 0.5 - lap * 2.2)); };
                const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
                const H = (x, z, sp) => { let h = dunes(x, z); if (sp < 0.42) h += SFm.terrainFine(x, z, g.state.windDeg * Math.PI / 180, expo(x, z), g.state.sastrugi)[0] * (1 - sstep(0.16, 0.42, sp)); if (sp < 1) h += DR.deformHeight(field, g.deformRes, x, z, f.center, f.size, 1, sp) * (1 - sstep(0.5, 1, sp)); return h; };
                let wPos = 0, wSp = 0, wH = 0, wN = 0, wMorph = 0, deformed = 0;
                for (let i = 0; i < N; i++) {
                    const p = CM.placeVertex(verts[i * 3], verts[i * 3 + 2], verts[i * 3 + 1], [cam.pos[0], cam.pos[2]], g.baseSpacing, g.gridN / 2), e = Math.max(p.spacing, 0.05), h = H(p.x, p.z, p.spacing);
                    const hx = H(p.x + e, p.z, p.spacing) - H(p.x - e, p.z, p.spacing), hz = H(p.x, p.z + e, p.spacing) - H(p.x, p.z - e, p.spacing), nx = -hx / (2 * e), nz = -hz / (2 * e), nl = Math.hypot(nx, 1, nz);
                    const o = i * 8; wPos = Math.max(wPos, Math.abs(out[o] - p.x), Math.abs(out[o + 2] - p.z)); wSp = Math.max(wSp, Math.abs(out[o + 3] - p.spacing)); wMorph = Math.max(wMorph, Math.abs(out[o + 4] - p.morph)); wH = Math.max(wH, Math.abs(out[o + 1] - h));
                    wN = Math.max(wN, Math.hypot(out[o + 5] - nx / nl, out[o + 6] - 1 / nl, out[o + 7] - nz / nl)); if (Math.abs(DR.deformHeight(field, g.deformRes, p.x, p.z, f.center, f.size, 1, p.spacing)) > 1e-4) deformed++;
                }
                return { wPos, wSp, wMorph, wH, wN, deformed, N };
            });
            ok("!! the vertex stage's own function (read back through the debug dump) equals the CPU over 1,500 clipmap vertices: placement within " + vtx.wPos.toExponential(1) + " m, spacing " + vtx.wSp.toExponential(1) + ", morph " + vtx.wMorph.toExponential(1) + ", height within " + vtx.wH.toExponential(1) + " m (the noise's f32), normal within " + vtx.wN.toFixed(3) + " (" + vtx.deformed + " of them sit in the trail)", vtx.wPos < 1e-3 && vtx.wSp < 1e-4 && vtx.wMorph < 1e-4 && vtx.wH < 2e-2 && vtx.wN < 0.12 && vtx.deformed > 30);
            // ---- shadows: no acne on flat ground, real shadows on dunes
            const shadowR = await run(async () => {
                const S = window.__snowgpu, g = S.gpu; g.state.debug = 1; g.state.taa = false;
                const stat = async (flat, elev) => { g.state.flat = flat; g.setSun(elev, 60); await g.frame(0.016, { x: 0, z: 0 }, S.camFor(), { present: false }); const sh = await g.shot(0.016, { x: 0, z: 0 }, S.camFor()); let terrain = 0, dark = 0;
                    const [w, h] = [sh.width, sh.height]; for (let y = Math.floor(h * 0.62); y < h; y++) for (let x = 0; x < w; x++) { const v = sh.pixels[(y * w + x) * 4]; terrain++; if (v < 140) dark++; }   // the lower part of the frame is terrain; a visibility of 1 shows as ~158 after the exposure and tone map, 0.5 as ~127, 0 as 0
                    return dark / terrain; };
                const flat2 = await stat(true, 2), flat4 = await stat(true, 3), dunes4 = await stat(false, 3), dunes40 = await stat(false, 40); g.state.flat = false; g.state.debug = 0; g.state.taa = true; g.setSun(13, 60);
                return { flat2, flat4, dunes4, dunes40 };
            });
            ok("!! shadows are shadows, not acne: flat ground under a 3 degree sun is shadowed over " + (100 * shadowR.flat4).toFixed(2) + "% of the terrain pixels (the receiver-plane term works on the GPU; the few percent are the footprints' own walls and the cascades' filter noise, against 65% when the plane term is wrong), the dunes " + (100 * shadowR.dunes4).toFixed(1) + "% under the same sun, under a 40 degree sun " + (100 * shadowR.dunes40).toFixed(1) + "%", shadowR.flat4 < 0.06 && shadowR.dunes4 > 0.04 && shadowR.dunes4 > shadowR.dunes40 + 0.03 && shadowR.dunes4 > shadowR.flat4 * 3);
            report("THE EDGE: at a 2 degree sun flat ground is shadowed over " + (100 * shadowR.flat2).toFixed(1) + "% -- acne. The receiver-plane gradient is clamped to a slope of 6 as upstream clamps it, and a sun that low asks for more; snow-gpu.html's sun slider starts at 3 degrees for that reason.");
            // ---- the detail map: baked on the GPU, graded against the CPU bake, and its mip chain
            const det = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, d = g.device, SFm = await import("/render/snowFine.mjs");
                const d16 = (b) => { const s = (b & 0x8000) ? -1 : 1, e = (b >> 10) & 31, m = b & 1023; return e === 0 ? s * Math.pow(2, -14) * (m / 1024) : s * Math.pow(2, e - 15) * (1 + m / 1024); };
                const read = async (level, n) => { const bpr = Math.max(256, Math.ceil(n * 8 / 256) * 256), rb = d.createBuffer({ size: bpr * n, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), e = d.createCommandEncoder(); e.copyTextureToBuffer({ texture: g.detailTex, mipLevel: level }, { buffer: rb, bytesPerRow: bpr }, [n, n]); d.queue.submit([e.finish()]); await rb.mapAsync(GPUMapMode.READ); const raw = new Uint16Array(rb.getMappedRange().slice(0)); rb.unmap(); const out = new Float32Array(n * n * 4); for (let y = 0; y < n; y++) for (let x = 0; x < n * 4; x++) out[y * n * 4 + x] = d16(raw[y * (bpr / 2) + x]); return out; };
                const l0 = await read(0, 256), l1 = await read(1, 128), l8 = await read(8, 1);
                let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
                const errs = []; for (let i = 0; i < 60; i++) { const x = Math.floor(rnd() * 256), y = Math.floor(rnd() * 256), t = SFm.detailTexel((x + 0.5) / 256, (y + 0.5) / 256, 256, SFm.GRAIN_SCALE); let e = 0; for (let k = 0; k < 4; k++) e = Math.max(e, Math.abs(l0[(y * 256 + x) * 4 + k] - t[k])); errs.push(e); }
                errs.sort((a, b) => a - b);
                let wMip = 0; for (let i = 0; i < 40; i++) { const x = Math.floor(rnd() * 128), y = Math.floor(rnd() * 128); for (let k = 0; k < 4; k++) { const m = (l0[((2 * y) * 256 + 2 * x) * 4 + k] + l0[((2 * y) * 256 + 2 * x + 1) * 4 + k] + l0[((2 * y + 1) * 256 + 2 * x) * 4 + k] + l0[((2 * y + 1) * 256 + 2 * x + 1) * 4 + k]) / 4; wMip = Math.max(wMip, Math.abs(m - l1[(y * 128 + x) * 4 + k])); } }
                let mean = [0, 0, 0, 0]; for (let i = 0; i < 256 * 256; i++) for (let k = 0; k < 4; k++) mean[k] += l0[i * 4 + k] / (256 * 256);
                let tilt = 0; for (let i = 0; i < 256 * 256; i += 7) tilt += Math.hypot(l0[i * 4] * 2 - 1, l0[i * 4 + 1] * 2 - 1);
                return { median: errs[30], p75: errs[45], p90: errs[54], worst: errs[59], wMip, apex: Array.from(l8), mean, tilt: tilt / (256 * 256 / 7) };
            });
            ok("!! the detail map the GPU baked equals the CPU bake at 60 random texels (median error " + det.median.toExponential(1) + ", 75th " + det.p75.toExponential(1) + ", 90th percentile " + det.p90.toExponential(1) + ", worst " + det.worst.toExponential(1) + ": the f32 hash), each mip level is the 2 x 2 mean of the one above to " + det.wMip.toExponential(1) + " (half floats), and the last level is the whole map's mean (" + det.apex.slice(0, 4).map((v) => v.toFixed(3)).join(" ") + " against " + det.mean.map((v) => v.toFixed(3)).join(" ") + ")", det.median < 0.01 && det.p75 < 0.03 && det.wMip < 2e-3 && det.apex.every((v, i) => Math.abs(v - det.mean[i]) < 0.01));
            // ---- the sky chain: the mip kernel over the baked level 0
            const chainR = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, SB = await import("/render/skyBake.mjs"); await g.frame(0.016, { x: 0, z: 0 }, S.camFor(), { present: false });
                const ch = await g.readSkyChain(), l0 = ch.slice(0, 64 * 32 * 4), cpu = SB.buildSkyMips(l0, 64, 32); let worst = 0; for (let i = 0; i < cpu.length; i++) worst = Math.max(worst, Math.abs(ch[i] - cpu[i]) / Math.max(Math.abs(cpu[i]), 0.02));
                return { worst, n: ch.length, expect: SB.mipFloats(64, 32) };
            });
            ok("!! the sky buffer is the whole MIP CHAIN (" + chainR.n + " floats = 64 x 32 + 32 x 16 + ... x 4): the GPU's five mip passes equal the CPU box filter over the baked level 0 (worst relative difference " + chainR.worst.toExponential(1) + ")", chainR.n === chainR.expect && chainR.worst < 1e-4);
            const errs = await run(() => window.__snowgpu.gpu.errors.slice());
            ok("!! no GPU error was raised (uncaptured validation or out-of-memory) in the whole run", errs.length === 0, errs.join(" | ").slice(0, 300));
        }
        ok("  no page or console error", pageErrs.length === 0, pageErrs.join(" | ").slice(0, 300));
    } finally { await browser.close(); server.close(); }
}

console.log(`\nsnowGpu-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
