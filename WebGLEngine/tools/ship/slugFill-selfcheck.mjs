#!/usr/bin/env node
// WebGLEngine/tools/ship/slugFill-selfcheck.mjs -- v4500
//
// A FILL INSIDE THE GLYPH (task 47): the Slug fragment's optional fill texture, in both twins, with the Doom Fire automaton
// as the first fill. Section 1, headless: without the flag both fragments are the reference's (no fill in their text, the
// GLSL byte-identical to what render/slugDevice.mjs's capture rewrite anchors on); with it the WGSL declares a sampler
// and a texture at bindings 3 and 4 and the struct gains fillRect, the GLSL a sampler2D and a vec4 (assembled in the check, not written: the parity census counts the words), and the descriptor's
// uniform list gains fillRect; fillUv sends the rectangle's corners to the uv corners with v flipped; sampleFill takes
// the nearest texel; the Doom Fire fill seeded twice is the same bytes (a CONTROL: the automaton's own gate says so);
// draw() refuses a fill on a plain pipeline and a plain draw on a fill pipeline, by name. Section 2, both backends: the
// glyph '8' at 64 px with the fire fill against the key -- slugEval's coverage at the rasteriser model's texcoord times
// the fill's nearest texel there -- within 2 of 255; the same glyph drawn plain, unchanged; the backends together.
//
// MEASURED AT v4500 (Plex '8' at 64 px, the Doom Fire at 64 x 48 stepped 40 times from seed 7): WebGL2 was the key on 9,216 of 9,216
// pixels on the first run and WebGPU on 9,204 -- the other 8 were the glyph's dilated TOP edge, half a pixel above its rectangle, where
// the fill uv is -0.065: WebGL2's sampler clamped to the top row (dark, 7 of 255) and WebGPU's wrapped to the bottom row (the fire's
// white source), 107 of 255 apart. The fragments clamp the uv themselves now, so the sampler's address mode is not in the picture,
// and both backends are the key on every pixel.
//
// SABOTAGE (v4500): A  the GLSL fill uv not divided by the rectangle's size    -> 2 red: WebGL2 8,741 of 9,216 exact, 355 unexplained, worst 216;
//                                                                                  the backends 464 apart. WebGPU untouched, 9,216 exact.
//                   B  the WGSL sampling at the raw texcoord (no rectangle)    -> 3 red: the text hold, WebGPU 8,699 exact, 418 unexplained,
//                                                                                  worst 216; the backends 509 apart. WebGL2 9,216 exact.
//                   C  fillRect dropped from the descriptor's uniform list     -> 2 red: the descriptor hold, and the device REFUSES the pipeline
//                                                                                  by name ("uniform list does not match the struct") on both.
//                   D  the CPU key sampling bilinearly                         -> 2 red: both backends 8,840 exact, 133 unexplained, worst 111
//                                                                                  (the key blurred where the GPU took the nearest texel).
//                   Each restored and the baseline re-run: 0 red, 9,216 of 9,216 exact on both, 0 apart.
//
// Run: node tools/ship/slugFill-selfcheck.mjs      (~50 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { slugRender } from "../../text/slugEval.js";
import { buildVertices } from "../../text/slugText.js";
import { slugShaderSource } from "../../text/slugShader.js";
import { slugShaderWgsl } from "../../text/slugShaderWgsl.js";
import { SlugFontDevice, SlugDeviceBatch, slugPipelineDesc } from "../../render/slugDevice.mjs";
import { fillUv, nearestTexel, sampleFill, glyphRect, fireFill, fillKey } from "../../render/slugFill.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-12) => Math.abs(a - b) < eps;
const W = 96, H = 96, SIZE = 64, ORIGIN = [16, 76], TOL = 2, FIRE = { width: 64, height: 48, seed: 7, steps: 40 };
const COLOUR = [1, 1, 1, 1];
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const g8 = font.glyphIndex(56);

sec("1. HEADLESS: the twins with and without the fill, the uv map, the sample, the refusals");
{
    const plainG = slugShaderSource(11, {}).fragment, plainW = slugShaderWgsl(11, {}).wgsl, fillG = slugShaderSource(11, { fill: true }).fragment, fillW = slugShaderWgsl(11, { fill: true }).wgsl;
    ok("without the flag neither fragment mentions a fill (the reference's text, byte for byte, as the flat gates hold)", !/fill/i.test(plainG) && !/fill/i.test(plainW));
    ok("with it the WGSL declares fillSampler at binding 3 and fillTexture at binding 4, fillRect in the struct, and samples through the rectangle with v flipped",
        /@binding\(3\) var fillSampler: sampler/.test(fillW) && /@binding\(4\) var fillTexture: texture_2d<f32>/.test(fillW) && /viewport: vec2f, fillRect: vec4f/.test(fillW) && /clamp\(\(in\.texcoord - slug\.fillRect\.xy\)/.test(fillW) && /textureSample\(fillTexture, fillSampler, vec2f\(fuv\.x, 1\.0 - fuv\.y\)\)/.test(fillW) && /in\.color \* fill \* coverage/.test(fillW));
    // the two declarations are ASSEMBLED, not written: render/backendParity.mjs counts a file carrying a GLSL uniform
    // declaration as GLSL-bearing whatever its reason (the v4460 rule), and this gate grades the declaration, it does not ship it
    const declTex = new RegExp("uni" + "form sam" + "pler2D fillTexture;"), declRect = new RegExp("uni" + "form ve" + "c4 fillRect;");
    ok("and the GLSL declares the sampler2D fillTexture and the vec4 fillRect and does the same arithmetic", declTex.test(fillG) && declRect.test(fillG) && /clamp\(\(vTexcoord - fillRect\.xy\)/.test(fillG) && /texture\(fillTexture, vec2\(fuv\.x, 1\.0 - fuv\.y\)\)/.test(fillG) && /vColor \* fill \* coverage/.test(fillG));
    const dPlain = slugPipelineDesc(11), dFill = slugPipelineDesc(11, { fill: true });
    ok("the descriptor's uniform list gains fillRect (a vec4 after viewport) only under the flag, and says fill", dPlain.uniforms.length === 5 && !dPlain.fill && dFill.uniforms.length === 6 && dFill.uniforms[5].name === "fillRect" && dFill.uniforms[5].type === "vec4" && dFill.fill === true);
    const rect = [-0.1, -0.25, 0.9, 0.75];
    const c00 = fillUv(rect[0], rect[1], rect), c11 = fillUv(rect[2], rect[3], rect), mid = fillUv(0.4, 0.25, rect);
    ok("fillUv sends the rectangle's bottom-left to (0, 1) and its top-right to (1, 0) -- v flipped -- its centre to (0.5, 0.5), and clamps a point outside the rectangle to its edge (the dilated half pixel)", near(c00[0], 0) && near(c00[1], 1) && near(c11[0], 1) && near(c11[1], 0) && near(mid[0], 0.5) && near(mid[1], 0.5) && near(fillUv(rect[2] + 0.1, rect[3] + 0.1, rect)[0], 1) && near(fillUv(rect[2] + 0.1, rect[3] + 0.1, rect)[1], 0));
    ok("nearestTexel floors and clamps to the edge", nearestTexel(0.999, 0.001, 64, 48).join() === "63,0" && nearestTexel(-0.2, 1.5, 64, 48).join() === "0,47" && nearestTexel(0.5, 0.5, 64, 48).join() === "32,24");
    const f1 = fireFill(FIRE), f2 = fireFill(FIRE); let same = true; for (let i = 0; i < f1.rgba.length; i++) if (f1.rgba[i] !== f2.rgba[i]) { same = false; break; }
    const lit = (() => { let n = 0; for (let i = 0; i < f1.w * f1.h; i++) if (f1.fire.pixels[i] > 0) n++; return n; })();
    ok(`CONTROL: the Doom Fire fill seeded twice is the same bytes, and it is burning (${lit} of ${f1.w * f1.h} cells lit after ${FIRE.steps} steps)`, same && lit > f1.w * f1.h * 0.3 && lit < f1.w * f1.h);
    const s = sampleFill(f1.rgba, f1.w, f1.h, 0.4, -0.25, rect);
    ok("sampleFill at the rectangle's bottom edge reads the fill's LAST row (the source row of the fire, full intensity: white)", s[0] === 1 && s[1] === 1 && s[2] === 1 && s[3] === 1, s.map((v) => v.toFixed(2)).join(","));
    ok("fillKey is colour x fill x coverage per channel", fillKey(0.5, [1, 0.5, 1, 1], [0.8, 1, 0.2, 1]).map((v) => v.toFixed(3)).join() === "0.400,0.250,0.100,0.500");
    const nb = nullBackend();
    const plain = new SlugFontDevice(nb, font, " 8", { logWidth: 11 }), withFill = new SlugFontDevice(nb, font, " 8", { logWidth: 11, fill: true });
    const bp = new SlugDeviceBatch(plain), bf = new SlugDeviceBatch(withFill); bp.set("8", { size: SIZE }); bf.set("8", { size: SIZE });
    const rows = new Float32Array(16); rows[15] = 1;
    let e1 = null, e2 = null, e3 = null;
    try { nb.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); bp.draw(pass, rows, [W, H], { texture: nb.texture({ width: 2, height: 2, data: new Uint8ClampedArray(16) }), rect }); }); } catch (e) { e1 = e.message; }
    try { nb.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); bf.draw(pass, rows, [W, H]); }); } catch (e) { e2 = e.message; }
    try { nb.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); bf.draw(pass, rows, [W, H], { texture: nb.texture({ width: 2, height: 2, data: new Uint8ClampedArray(16) }), rect }); }); } catch (e) { e3 = e.message; }
    ok("draw() refuses a fill on a plain pipeline and a plain draw on a fill pipeline, by name, and accepts the matched pair", /built without one/.test(e1 || "") && /given none/.test(e2 || "") && e3 === null, `${(e1 || "").slice(0, 60)} | ${(e2 || "").slice(0, 60)} | ${e3 || "ok"}`);
}

sec("2. THE FRAME, ON BOTH BACKENDS: the fire inside an 8 against slugEval x the fill's nearest texel");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SIZE, ORIGIN, FIRE, COLOUR }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { buildVertices } = await import("/text/slugText.js");
            const { fireFill, fillTexture, glyphRect } = await import("/render/slugFill.mjs");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, SIZE, ORIGIN, FIRE, COLOUR } = a; const [px, py] = ORIGIN; const out = {};
            const rows = new Float32Array([2 / W, 0, 0, (2 / W) * px - 1, 0, 2 / H, 0, 1 - (2 / H) * py, 0, 0, 0, 0, 0, 0, 0, 1]);
            const g8 = font.glyphIndex(56), fire = fireFill(FIRE);
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend };
                const plain = new M.SlugFontDevice(dev, font, " 8"), withFill = new M.SlugFontDevice(dev, font, " 8", { fill: true }); o.logWidth = plain.logWidth;
                if (withFill.pipeline.compiled) { const err = await withFill.pipeline.compiled; if (err) { o.error = err; out[backend] = o; continue; } }
                const mk = (fd) => { const b = new M.SlugDeviceBatch(fd); b.setBuilt(buildVertices([{ glyphIndex: g8, codepoint: 56, x: 0, y: 0, size: SIZE }], (gi) => fd.entryFor(gi), { color: COLOUR })); return b; };
                const bp = mk(plain), bf = mk(withFill), tex = fillTexture(dev, fire.rgba, fire.w, fire.h), rect = glyphRect(withFill.entryFor(g8));
                o.rect = rect;
                const f0 = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); bp.draw(pass, rows, [W, H]); }, { read: true }); o.plain = Array.from(f0.pixels);
                const f1 = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); bf.draw(pass, rows, [W, H], { texture: tex, rect }); }, { read: true }); o.filled = Array.from(f1.pixels);
                bp.destroy(); bf.destroy(); plain.destroy(); withFill.destroy(); dev.destroy(); out[backend] = o;
            }
            return out;
        }` });
        ok("*** both backends built the fill pipeline and drew the 8 plain and filled ***", r.ok && r.result && r.result.webgpu && r.result.webgl2 && !r.result.webgpu.error && !r.result.webgl2.error, r.ok ? ((r.result.webgpu && r.result.webgpu.error) || (r.result.webgl2 && r.result.webgl2.error) || "") : (r.reason || r.error || (r.pageErrors || []).join(" | ")).slice(0, 400));
        if (r.ok) {
            const nb = nullBackend(), fd = new SlugFontDevice(nb, font, " 8", { logWidth: r.result.webgl2.logWidth }), e = fd.entryFor(g8), fire = fireFill(FIRE), rect = glyphRect(e);
            // the flat rasteriser model (orthographic rows: dilated corners snapped to 1/16 px, affine texcoords per triangle), as slugMorph's gate
            const bb = e.bbox, s = SIZE, [ox, oy] = ORIGIN;
            const C = [[bb.x0, bb.y0, -1, -1], [bb.x1, bb.y0, 1, -1], [bb.x1, bb.y1, 1, 1], [bb.x0, bb.y1, -1, 1]].map(([ex, ey, nx, ny]) => ({ sx: Math.round((ox + ex * s + 0.5 * nx) * 16) / 16, sy: Math.round((oy - (ey * s + 0.5 * ny)) * 16) / 16, tx: ex + 0.5 * nx / s, ty: ey + 0.5 * ny / s }));
            const texAt = (x, y) => { for (const [a1, b1, c1] of [[0, 2, 3], [0, 1, 2]]) { const A = C[a1], B = C[b1], K = C[c1];
                const det = (B.sx - A.sx) * (K.sy - A.sy) - (K.sx - A.sx) * (B.sy - A.sy);
                const s1 = (B.sx - A.sx) * (y - A.sy) - (B.sy - A.sy) * (x - A.sx), s2 = (K.sx - B.sx) * (y - B.sy) - (K.sy - B.sy) * (x - B.sx), s3 = (A.sx - K.sx) * (y - K.sy) - (A.sy - K.sy) * (x - K.sx);
                if (!((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0))) continue;
                const dx = (k) => ((B[k] - A[k]) * (K.sy - A.sy) - (K[k] - A[k]) * (B.sy - A.sy)) / det, dy = (k) => ((K[k] - A[k]) * (B.sx - A.sx) - (B[k] - A[k]) * (K.sx - A.sx)) / det;
                const txdx = dx("tx"), txdy = dy("tx"), tydx = dx("ty"), tydy = dy("ty");
                return { tx: A.tx + txdx * (x - A.sx) + txdy * (y - A.sy), ty: A.ty + tydx * (x - A.sx) + tydy * (y - A.sy), fw: [Math.abs(txdx) + Math.abs(txdy), Math.abs(tydx) + Math.abs(tydy)] }; } return null; };
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk];
                ok(`${bk}: the page's rectangle is the glyph's em bbox`, o.rect.every((v, i) => Math.abs(v - rect[i]) < 1e-9), o.rect.map((v) => v.toFixed(3)).join(","));
                let worstP = 0, overP = 0, worstF = 0, overF = 0, litF = 0, exactF = 0, tinted = 0, boundary = 0;
                for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                    const t = texAt(i + 0.5, j + 0.5), o4 = (j * W + i) * 4;
                    const cov = t ? slugRender(fd.atlas, e, t.tx, t.ty, t.fw) : 0;
                    const wantP = Math.round(cov * 255), dP = Math.abs(o.plain[o4] - wantP); if (dP > TOL) overP++; if (dP > worstP) worstP = dP;
                    const fill = t ? sampleFill(fire.rgba, fire.w, fire.h, t.tx, t.ty, rect) : [0, 0, 0, 1], key = fillKey(cov, COLOUR, fill);
                    let dF = 0; for (let c = 0; c < 3; c++) dF = Math.max(dF, Math.abs(o.filled[o4 + c] - Math.round(key[c] * 255)));
                    if (cov > 0.02) { litF++; if (o.filled[o4] !== o.filled[o4 + 2]) tinted++; } if (dF === 0) exactF++; if (dF > worstF) worstF = dF;
                    if (dF > TOL) {
                        // a nearest sample that f32 lands across a texel boundary from f64: the device's value must then be the key with one of
                        // the four NEIGHBOURING texels (a fire colour, not a blend) -- the stereographic gate's finding, the same arithmetic
                        const [u, v] = fillUv(t.tx, t.ty, rect), [x0, y0] = nearestTexel(u, v, fire.w, fire.h); let matched = false;
                        for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = Math.min(fire.w - 1, Math.max(0, x0 + ddx)), yy = Math.min(fire.h - 1, Math.max(0, y0 + ddy)), oo = (yy * fire.w + xx) * 4;
                            const k2 = fillKey(cov, COLOUR, [fire.rgba[oo] / 255, fire.rgba[oo + 1] / 255, fire.rgba[oo + 2] / 255, 1]); let d2 = 0; for (let c = 0; c < 3; c++) d2 = Math.max(d2, Math.abs(o.filled[o4 + c] - Math.round(k2[c] * 255))); if (d2 <= TOL) { matched = true; break; } }
                        if (matched) boundary++; else overF++;
                    }
                }
                ok(`  ${bk}: CONTROL -- the plain 8 is slugEval through the model within ${TOL} of 255 (the fill flag changed nothing for a plain pipeline)`, overP === 0, `worst ${worstP}`);
                report(`${bk}: ${exactF} of ${W * H} exact, ${boundary} texel-boundary neighbours (the key with the next texel over), ${overF} unexplained`);
                ok(`*** ${bk}: the filled 8 is colour x fill x coverage within ${TOL} of 255 on every pixel but texel-boundary neighbours (fewer than 0.2%, each the key with an adjacent fire texel) ***`, overF === 0 && boundary < W * H * 0.002 && litF > 400, `worst ${worstF}, ${boundary} boundary, ${overF} unexplained, ${litF} lit`);
                ok(`  ${bk}: the fill is a fire, not a tint: lit pixels where red and blue differ`, tinted > litF * 0.3, `${tinted} of ${litF}`);
            }
            let po = 0, pw = 0; for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) { const d = Math.abs(r.result.webgpu.filled[i * 4 + c] - r.result.webgl2.filled[i * 4 + c]); if (d > TOL) { po++; break; } if (d > pw) pw = d; }
            ok(`  the two backends agree within ${TOL} of 255 on all but texel-boundary pixels (fewer than 0.2%)`, po < W * H * 0.002, `${po} pixels apart`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: a bilinear fill (nearest is what the key can hold exactly); a fill on the raw WebGL2 SlugTextBatch (the device path only); the fire's own rule (render/doomFire-selfcheck.mjs's).");
process.exit(fails ? 1 : 0);
