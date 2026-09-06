#!/usr/bin/env node
// WebGLEngine/tools/ship/stereographic-selfcheck.mjs -- v4499
//
// THE LITTLE PLANET (task 45): render/stereographic.mjs's projection held headless, its CPU twin held to the bake, and the
// fragment pass on both backends held to the twin texel for texel. Section 1: the origin is the south pole, r = 1 the
// equator, r -> infinity the north pole, every direction unit length; roll shifts longitude by exactly roll and tilt
// leans the axis; dirToUv sends the bake's own texel directions back to their own texels (the mapping is the bake's,
// not a second convention); the CPU frame's centre is the bake's bottom row and every pixel is a bake colour; the
// pipeline descriptor carries both languages and the four knobs. Section 2: the pass on WebGPU and WebGL2 against the
// CPU twin at two knob settings, the two backends against each other.
//
// MEASURED AT v4499 (planet seed 7, a terran bake of 256 x 128, a 160 x 120 frame): 2,236 of the bake's own texel-centre directions
// round-trip to their texels; the pass on both backends is the CPU twin texel for texel on 19,180 / 19,172 (WebGPU / WebGL2) of
// 19,200 pixels at the default knobs and 19,112 on both at zoom 1.6, roll 0.9, tilt 0.35 -- the rest are texel-boundary
// neighbours (every one a bake colour, never a blend), where f32 lands the nearest sample on the other side of a boundary the
// f64 twin lands on this side of. The backends agree on all but 44 pixels at the default knobs and on every pixel at the second.
//
// SABOTAGE (v4499): A  planeToDir's y component sign flipped (the north pole at the origin)                   -> exit=1, red 6: the pole rows and all four frames (the twin
//                      and the shaders disagree on which pole is at the centre)
//                   B  the WGSL fragment's longitude seam left to the sampler (no fract)                        -> 0 RED ON ANY PIXEL, A FINDING: (lon + pi) / 2pi is already in
//                      [0, 1], so the fract guards one column at u = 1 exactly and the sampler's clamp gives the same texel there. The first draft held
//                      the fract by grepping the shader text, which is a tautology, and that row was dropped. B': u.roll unused in the WGSL -> exit=1,
//                      red: the WebGPU frames at the rolled setting and the backends' agreement
//                   C  the GLSL fragment's uv.y not flipped (vUv.y * 2 - 1)                                     -> exit=1, red 4: both WebGL2 frames and both agreements
//                      (11,722 / 14,432 pixels apart -- the picture upside down)
//                   D  the CPU twin sampling bilinearly (the average of the four texels)                       -> exit=1, red 5: the palette row (12,318 of 19,200 bake
//                      colours) and all four frames
//
// Run: node tools/ship/stereographic-selfcheck.mjs      (~30 s)
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { planetSpec, bakeEquirect } from "../../world/procPlanet.js";
import { planeToDir, dirToUv, nearestTexel, pixelToPlane, littlePlanetCpu, stereographicPipelineDesc, KNOBS, DEFAULT_KNOBS } from "../../render/stereographic.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const W = 160, H = 120, SEED = 7, BW = 256, BH = 128;
const SETTINGS = [{ zoom: 1, roll: 0, tilt: 0 }, { zoom: 1.6, roll: 0.9, tilt: 0.35 }];
const spec = planetSpec(SEED), bake = bakeEquirect(spec, BW, BH);

sec("1. HEADLESS: the projection, the bake's own mapping, the CPU twin");
{
    const d0 = planeToDir(0, 0), d1 = planeToDir(1, 0), dfar = planeToDir(1e7, 0);
    ok("the origin is the south pole, r = 1 the equator, r -> infinity the north pole", near(d0[1], -1) && near(d1[1], 0) && near(d1[0], 1) && dfar[1] > 0.999999, `${d0.map((v) => v.toFixed(3))} | ${d1.map((v) => v.toFixed(3))} | ${dfar.map((v) => v.toFixed(6))}`);
    let worstLen = 0; for (let i = 0; i < 200; i++) { const x = Math.sin(i * 1.7) * 3, y = Math.cos(i * 0.9) * 3; worstLen = Math.max(worstLen, Math.abs(Math.hypot(...planeToDir(x, y, { zoom: 0.7 + (i % 5) * 0.3, roll: i * 0.1, tilt: Math.sin(i) })) - 1)); }
    ok("every direction is unit length under any zoom, roll and tilt", worstLen < 1e-12, `worst ${worstLen.toExponential(1)}`);
    const a = dirToUv(planeToDir(0.5, 0.2)), b = dirToUv(planeToDir(0.5, 0.2, { roll: 0.7 }));
    ok("roll shifts longitude by exactly roll (u by roll / 2pi) and leaves latitude alone", near(((b[0] - a[0]) % 1 + 1) % 1, 0.7 / (2 * Math.PI), 1e-9) && near(a[1], b[1]), `du ${(b[0] - a[0]).toFixed(6)} against ${(0.7 / (2 * Math.PI)).toFixed(6)}`);
    ok("tilt moves the south pole off the centre (the origin's direction gains a z component of -sin(tilt))", near(planeToDir(0, 0, { tilt: 0.4 })[2], -Math.sin(0.4)) && near(planeToDir(0, 0, { tilt: 0.4 })[1], -Math.cos(0.4)));
    ok("zoom scales the plane: (zoom, 0) at zoom lands where (1, 0) lands at zoom 1", planeToDir(2, 0, { zoom: 2 }).every((v, i) => near(v, d1[i])));
    // the bake's own texel directions round-trip: bakeEquirect's lat/lon per texel -> dirToUv -> nearestTexel -> the same texel
    let miss = 0, n = 0;
    for (let y = 0; y < BH; y += 3) for (let x = 0; x < BW; x += 5) { const lat = (0.5 - (y + 0.5) / BH) * Math.PI, lon = ((x + 0.5) / BW) * 2 * Math.PI - Math.PI; const d = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]; const [u, v] = dirToUv(d), [tx, ty] = nearestTexel(u, v, BW, BH); n++; if (tx !== x || ty !== y) miss++; }
    ok(`*** dirToUv is the bake's own convention: ${n} texel-centre directions from bakeEquirect's formula come back to their own texels ***`, miss === 0 && n > 2000, `${miss} missed`);
    ok("pixelToPlane: the frame's centre is the origin, its right edge is +aspect, its top edge is +1 (uv.y flipped)", (() => { const c = pixelToPlane(W / 2 - 0.5, H / 2 - 0.5, W, H), r = pixelToPlane(W - 0.5, H / 2 - 0.5, W, H), t = pixelToPlane(W / 2 - 0.5, -0.5, W, H); return near(c[0], 0) && near(c[1], 0) && near(r[0], W / H) && near(t[1], 1); })());
    const f = littlePlanetCpu(bake, W, H);
    const centre = (W / 2) + (H / 2) * W, ci = centre * 4, bottom = ((BH - 1) * BW + BW / 2) * 4;
    ok("the CPU frame's centre pixel is the bake's bottom-row texel (the south pole at the centre)", f[ci] === bake.rgba[bottom] && f[ci + 1] === bake.rgba[bottom + 1] && f[ci + 2] === bake.rgba[bottom + 2], `${f[ci]},${f[ci + 1]},${f[ci + 2]} against ${bake.rgba[bottom]},${bake.rgba[bottom + 1]},${bake.rgba[bottom + 2]}`);
    const pal = new Set(); for (let i = 0; i < BW * BH; i++) pal.add(bake.rgba[i * 4] + "," + bake.rgba[i * 4 + 1] + "," + bake.rgba[i * 4 + 2]);
    let inPal = 0; for (let i = 0; i < W * H; i++) if (pal.has(f[i * 4] + "," + f[i * 4 + 1] + "," + f[i * 4 + 2])) inPal++;
    ok("every pixel of the CPU frame is a colour the bake holds (nearest sampling invents nothing) and the frame is not one colour", inPal === W * H && new Set(Array.from({ length: W * H }, (_, i) => f[i * 4] + "," + f[i * 4 + 1])).size > 20, `${inPal} of ${W * H}; planet ${spec.type}, sea ${bake.seaFraction.toFixed(2)}`);
    const d = stereographicPipelineDesc();
    ok("the descriptor carries both languages, the four knobs in order, and no vertex buffer (a full-screen triangle from the vertex index)", typeof d.shaders.wgsl === "string" && typeof d.shaders.glsl.fragment === "string" && d.uniforms.map((u) => u.name).join() === KNOBS.join() && d.attributes.length === 0);
}

sec("2. THE PASS ON BOTH BACKENDS AGAINST THE CPU TWIN, texel for texel");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SEED, BW, BH, SETTINGS }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { planetSpec, bakeEquirect } = await import("/world/procPlanet.js");
            const { stereographicPipelineDesc, bakeTexture, drawLittlePlanet } = await import("/render/stereographic.mjs");
            const { W, H, SEED, BW, BH, SETTINGS } = a; const out = {};
            const bake = bakeEquirect(planetSpec(SEED), BW, BH);
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, frames: [] };
                const pipe = dev.pipeline(stereographicPipelineDesc()); if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.error = err; out[backend] = o; continue; } }
                const tex = bakeTexture(dev, bake);
                for (const k of SETTINGS) { const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); drawLittlePlanet(pass, pipe, tex, W, H, k); }, { read: true }); o.frames.push(Array.from(fr.pixels)); }
                dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("both backends compiled the pass and drew the two settings", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? ((r.result.webgpu && r.result.webgpu.error) || (r.result.webgl2 && r.result.webgl2.error) || "") : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok) {
            const pal = new Set(); for (let i = 0; i < BW * BH; i++) pal.add(bake.rgba[i * 4] + "," + bake.rgba[i * 4 + 1] + "," + bake.rgba[i * 4 + 2]);
            SETTINGS.forEach((k, si) => {
                const cpu = littlePlanetCpu(bake, W, H, k);
                for (const bk of ["webgpu", "webgl2"]) {
                    const px = r.result[bk].frames[si]; let exact = 0, off = 0, worst = 0, blends = 0;
                    for (let i = 0; i < W * H; i++) { const d = Math.max(Math.abs(px[i * 4] - cpu[i * 4]), Math.abs(px[i * 4 + 1] - cpu[i * 4 + 1]), Math.abs(px[i * 4 + 2] - cpu[i * 4 + 2])); if (d === 0) exact++; else { off++; if (!pal.has(px[i * 4] + "," + px[i * 4 + 1] + "," + px[i * 4 + 2])) blends++; } if (d > worst) worst = d; }
                    report(`${bk} at zoom ${k.zoom} roll ${k.roll} tilt ${k.tilt}: ${exact} of ${W * H} pixels exact against the CPU twin, ${off} off (worst ${worst}) -- a nearest sample straddling a texel boundary in f32`);
                    ok(`*** ${bk} setting ${si + 1}: the frame is the CPU twin texel for texel on more than 99% of pixels, and every other pixel is a bake colour (a boundary neighbour, not a blend) ***`, exact > W * H * 0.99 && blends === 0, `${exact} exact, ${blends} blends`);
                }
                let po = 0; for (let i = 0; i < W * H * 4; i += 4) if (r.result.webgpu.frames[si][i] !== r.result.webgl2.frames[si][i] || r.result.webgpu.frames[si][i + 1] !== r.result.webgl2.frames[si][i + 1]) po++;
                ok(`  setting ${si + 1}: the two backends agree on more than 99.5% of pixels`, po < W * H * 0.005, `${po} differ`);
            });
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: bilinear sampling (nearest is what the twin can hold exactly); the bake's own correctness (world/procPlanet-selfcheck.mjs's); the pass wired into main.js (little-planet.html is the view).");
process.exit(fails ? 1 : 0);
