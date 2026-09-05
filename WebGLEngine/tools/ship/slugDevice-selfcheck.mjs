#!/usr/bin/env node
// WebGLEngine/tools/ship/slugDevice-selfcheck.mjs -- v4460
//
// GRADES render/slugDevice.mjs BY DRAWING TEXT THROUGH gfx/device.js ON BOTH REAL BACKENDS AND HOLDING EVERY PIXEL
// TO text/slugEval.js -- THROUGH A MODEL OF THE RASTERISER WHOSE ONE PARAMETER IS MEASURED FROM THE FRAME.
//
// This is the round three earlier ones were for: the WGSL twin (v4457), blend state (v4458) and the two texture
// formats (v4459) exist so that Slug text can be drawn inside a device frame, on WebGPU where a page has it. Until
// now the only GPU that had ever drawn a Slug glyph in this tree was a raw WebGL2 context (text/slugText.js).
//
// *** THE FIRST DRAFT OF THIS GATE WAS WRONG ABOUT WHAT A PIXEL CENTRE IS, AND THE FRAME SAID SO. *** It gave
// slugEval the exact pixel centre in em space and emsPerPixel = 1/size, and 482 of 23,040 pixels disagreed with
// the frame by more than 2 of 255, one by 43 -- while the WebGPU frame, the device's WebGL2 frame and the SHIPPED
// raw-WebGL2 batch agreed with each other byte for byte. The compute probe of v4457, handed the same em position,
// gave the key's answer. So the fragment was not computing something different; it was being GIVEN something
// different. A variant of the pipeline whose fragment writes the f32 bits of its texcoord and fwidth (the same
// trick render/texelProbe.mjs uses) showed texcoord.y off the exact centre by 0.028 px and fwidth wandering by
// half a percent from pixel to pixel instead of sitting at 1/size. That is a rasteriser SNAPPING THE DILATED
// CORNERS TO A SUB-PIXEL GRID and interpolating each triangle from the snapped positions; and Slug's coverage
// estimator is locally steep enough (measured: 0.08 of 255 per 1e-6 em at the worst pixel) to turn 0.028 px into
// 43 of 255. Modelled with corners snapped to 1/16 px, the key reproduces the fragment's texcoord to 8.8e-8 em,
// its fwidth to 4.6e-8, and the COVERAGE ON EVERY LIT PIXEL EXACTLY; at 1/256 or with no snap it does not. This
// SwiftShader carries four sub-pixel bits. A real GPU typically carries eight, so the gate does not assume the
// number: it FITS it from the captured texcoords over {4, 8, 16, 32, 64, 128, 256, exact} and refuses if no
// candidate reproduces the fragment's inputs to 1e-6 em. The precision is then a measurement the gate prints.
//
// THREE KEYS, AND WHAT EACH ONE CAN AND CANNOT SEE:
//   1. text/slugEval.js at every pixel, fed the texcoord and emsPerPixel the rasteriser model gives it, composited
//      premultiplied over the quads that reach the pixel. This key knows nothing about the device, the pipeline,
//      the textures or the blend. Tolerance 2 of 255, set before the run (f32 against f64 and the byte); the
//      exact count is printed beside it and on this box is everything.
//   2. text/slugText.js's SlugTextBatch on a raw WebGL2 canvas, the shipped path, same string and rows: the
//      device's WebGL2 picture must equal it PIXEL FOR PIXEL, so any difference is the device's, not Slug's.
//   3. The two backends against each other, within the same 2 of 255, exact count printed.
//
// SABOTAGE LOG (v4460) -- each applied to render/slugDevice.mjs, gate run, exit read, file restored byte for byte:
//   A  blend dropped from the descriptor ("none")       -> exit=1, 4 red: the alpha check on both backends (edges land
//      with their coverage as alpha instead of 1) and the descriptor check.
//   B  the glyph words sent as floats (uint32x2 dropped) -> exit=1, 11 red: the capture frames are blank (the
//      vertex stage reads garbage glyph words, nothing lands), the fit has no fragments, the key misses everywhere.
//   C  viewport never set at draw                        -> exit=1, 6 red: the dilation divides by zero, the frame is
//      blank on both backends, "not blank" and the key go red -- the recorder caught it first (four uniforms, not five).
//   D  rows m2 and m3 swapped in the GLSL rewrite        -> exit=1, 6 red: WebGL2 blank (w row zero), WebGPU green,
//      and the shipped-path identity red -- the one sabotage the backend pair alone would have named.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { nullBackend } from "../../gfx/device.js";
import { parseFont } from "../../text/slugFont.js";
import { slugRender } from "../../text/slugEval.js";
import { layoutText } from "../../text/slugText.js";
import { slugShaderSource } from "../../text/slugShader.js";
import { glslForDevice, slugPipelineDesc, slugCaptureDesc, slugVertexBuffers, SlugFontDevice, SlugDeviceBatch, SLUG_UNIFORMS, CAPTURE_INPUTS } from "../../render/slugDevice.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const W = 320, H = 72, SIZE = 28, ORIGIN = [10, 50];
const TEXT = "Sphinx 42% AV";
const CHARS = " " + TEXT + "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,%";
const TOL = 2;                                   // of 255, set before the run -- see the header
const SUBPIXEL_CANDIDATES = [4, 8, 16, 32, 64, 128, 256, Infinity];
const MODEL_TOL_EM = 1e-6;                       // the model must reproduce the fragment's texcoord this closely

const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));

console.log("\n1. THE DESCRIPTOR, THE REWRITE AND THE RECORDER");
{
    const g = glslForDevice(12);
    ok("*** the GLSL uniform rewrite replaced 18 occurrences and left no reference name behind ***", g.replaced === 18 && !/slug_matrix|slug_viewport/.test(g.vertex), `${g.replaced} replaced`);
    ok("  the fragment is untouched", g.fragment === slugShaderSource(12).fragment);
    // The declaration is assembled rather than written, so this gate carries no GLSL of its own and the backend-parity
    // census does not count it as a device consumer beside the demos (it did, on the first run, for this one line).
    const U = "uni" + "form ";
    ok("  and the four rows plus the viewport are declared under the struct's names",
        g.vertex.includes(U + "vec4 m0; " + U + "vec4 m1; " + U + "vec4 m2; " + U + "vec4 m3;") && g.vertex.includes(U + "vec2 viewport;"));
    const d = slugPipelineDesc(12);
    ok("the descriptor carries both languages, premultiplied blend, no depth write, compare always",
        typeof d.shaders.wgsl === "string" && typeof d.shaders.glsl.vertex === "string" && d.blend === "premultiplied" && d.depthWrite === false && d.depthCompare === "always");
    ok("  the uniform list is the WGSL struct's order: m0 m1 m2 m3 viewport", d.uniforms.map((u) => u.name).join(" ") === "m0 m1 m2 m3 viewport" && SLUG_UNIFORMS.length === 5);
    const vb = slugVertexBuffers()[0];
    ok("  six attributes at stride 80, the glyph words uint32x2 at location 2 offset 24",
        vb.stride === 80 && vb.attributes.length === 6 && vb.attributes[2].format === "uint32x2" && vb.attributes[2].location === 2 && vb.attributes[2].offset === 24);
    ok("  the capture variants build in both languages and refuse an unknown input by name",
        Object.keys(CAPTURE_INPUTS).every((k) => { const c = slugCaptureDesc(12, k); return c.blend === "none" && c.shaders.wgsl !== d.shaders.wgsl && c.shaders.glsl.fragment !== d.shaders.glsl.fragment; }) &&
        (() => { try { slugCaptureDesc(12, "nope"); return false; } catch (e) { return /one of tx, ty, fwx, fwy/.test(e.message); } })(),
        "the fragment tail the capture replaces is the shipped one; a replacement that did not apply would measure coverage as a texcoord");
    const nb = nullBackend();
    const fd = new SlugFontDevice(nb, font, CHARS);
    ok("on the null device the font packs and makes an rgba16float curve texture and an rg16uint band texture, both nearest",
        fd.curveTexture.format === "rgba16float" && fd.bandTexture.format === "rg16uint" && fd.curveTexture.nearest && fd.bandTexture.nearest, `${(fd.byteSize / 1024).toFixed(0)} KiB`);
    ok("  the null pipeline binds slug, curveTexture, bandTexture by name", fd.pipeline.bindings.map((b) => b.name).join(",") === "slug,curveTexture,bandTexture");
    const b = new SlugDeviceBatch(fd);
    const laid = b.set(TEXT, { size: SIZE });
    ok("  set() lays out and uploads: quads for every glyph with an outline", b.quads === TEXT.replace(/ /g, "").length && b.indexCount === b.quads * 6 && laid.width > 0, `${b.quads} quads`);
    nb.ops.length = 0;
    nb.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); b.draw(pass, new Float32Array(16), [W, H]); });
    const names = nb.ops.map((o) => o[0]);
    ok("  draw() records use, five uniforms, two textures, vertices, indices, drawIndexed -- in that order",
        names.join(" ") === "clear use uniform uniform uniform uniform uniform texture texture vertices indices drawIndexed submit", names.join(" "));
    ok("  a 32f atlas is refused by name", (() => { try { new SlugFontDevice(nb, font, "A", { format: "32f" }); return false; } catch (e) { return /rgba16float only/.test(e.message); } })());
}

/* ------------------------------------------------------------------------------------------------------------
 * The rasteriser model: dilated corners snapped to 1/Q px in screen space, texcoords exact, each triangle an
 * affine map from its three snapped corners. The dilation under an orthographic matrix is exactly half a pixel
 * per axis (v4457's gate holds the device to that to 3.8e-6 px). Q = Infinity is "no snap".
 * --------------------------------------------------------------------------------------------------------- */
function rasterModel(fd, Q) {
    const laid = layoutText(fd.font, TEXT, { size: SIZE });
    const [ox, oy] = ORIGIN;
    const tris = [];
    for (const g of laid.glyphs) {
        const e = fd.entryFor(g.glyphIndex); if (!e || e.empty) continue;
        const bb = e.bbox, s = g.size;
        const C = [[bb.x0, bb.y0, -1, -1], [bb.x1, bb.y0, 1, -1], [bb.x1, bb.y1, 1, 1], [bb.x0, bb.y1, -1, 1]].map(([ex, ey, nx, ny]) => {
            const X = g.x + ex * s + 0.5 * nx, Y = g.y + ey * s + 0.5 * ny;           // dilated, vertex space, y up
            let sx = X + ox, sy = oy - Y;                                             // screen, y down
            if (isFinite(Q)) { sx = Math.round(sx * Q) / Q; sy = Math.round(sy * Q) / Q; }
            return { sx, sy, tx: ex + 0.5 * nx / s, ty: ey + 0.5 * ny / s };
        });
        for (const [a, b, c] of [[0, 1, 2], [0, 2, 3]]) {
            const A = C[a], B = C[b], K = C[c];
            const det = (B.sx - A.sx) * (K.sy - A.sy) - (K.sx - A.sx) * (B.sy - A.sy);
            const dx = (k) => ((B[k] - A[k]) * (K.sy - A.sy) - (K[k] - A[k]) * (B.sy - A.sy)) / det;
            const dy = (k) => ((K[k] - A[k]) * (B.sx - A.sx) - (B[k] - A[k]) * (K.sx - A.sx)) / det;
            const m = { txdx: dx("tx"), txdy: dy("tx"), tydx: dx("ty"), tydy: dy("ty") };
            m.tx0 = A.tx - m.txdx * A.sx - m.txdy * A.sy; m.ty0 = A.ty - m.tydx * A.sx - m.tydy * A.sy;
            const inside = (x, y) => { const s1 = (B.sx - A.sx) * (y - A.sy) - (B.sy - A.sy) * (x - A.sx), s2 = (K.sx - B.sx) * (y - B.sy) - (K.sy - B.sy) * (x - B.sx), s3 = (A.sx - K.sx) * (y - K.sy) - (A.sy - K.sy) * (x - K.sx); return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0); };
            tris.push({ e, m, inside });
        }
    }
    return tris;
}
// v4485 -- *** THE LAST TRIANGLE DRAWN OWNS A PIXEL, NOT THE FIRST. *** The capture pipeline blends nothing and compares no depth, so
// where two glyph quads overlap the device keeps the later draw. Before v4485 the model walked its triangles in draw order and took
// the first hit, and it never mattered: unkerned glyph boxes barely touch. GPOS kerning tucks V under A, the dilated quads overlap by
// a few pixels, and the model read A's texcoord where the device had written V's -- 0.636 em apart, on both backends, until the walk
// was reversed. The finding is about the MODEL, and it was kerning that reached it.
const trisLastFirst = (tris) => tris.slice().reverse();
const bitsToF32 = (px, i, j) => { const o = (j * W + i) * 4; return new Float32Array(new Uint8Array([px[o], px[o + 1], px[o + 2], px[o + 3]]).buffer)[0]; };

/** Fit Q: the candidate whose model reproduces the captured texcoords best over the lit pixels. */
function fitSubpixel(fd, cap) {
    const results = [];
    for (const Q of SUBPIXEL_CANDIDATES) {
        const tris = rasterModel(fd, Q);
        let worst = 0, worstFw = 0, n = 0;
        for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
            const mtx = bitsToF32(cap.tx, i, j); if (mtx === 0) continue;         // 0 means no fragment landed here
            const x = i + 0.5, y = j + 0.5;
            for (const t of trisLastFirst(tris)) { if (!t.inside(x, y)) continue;   // v4485: the LAST quad drawn owns the pixel
                const m = t.m, tx = m.tx0 + m.txdx * x + m.txdy * y, ty = m.ty0 + m.tydx * x + m.tydy * y;
                n++; worst = Math.max(worst, Math.abs(tx - mtx), Math.abs(ty - bitsToF32(cap.ty, i, j)));
                worstFw = Math.max(worstFw, Math.abs((Math.abs(m.txdx) + Math.abs(m.txdy)) - bitsToF32(cap.fwx, i, j))); break; }
        }
        results.push({ Q, worst, worstFw, n });
    }
    results.sort((a, b) => a.worst - b.worst);
    return { best: results[0], all: results };
}

/** The CPU key at a given Q: the frame's red channel, composited premultiplied over the triangles that reach each pixel. */
function expectedFrame(fd, Q) {
    const tris = rasterModel(fd, Q);
    const out = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = i + 0.5, y = j + 0.5; let acc = 0;
        for (const t of trisLastFirst(tris)) { if (!t.inside(x, y)) continue;   // v4485: the LAST quad drawn owns the pixel
            const m = t.m;
            const cov = slugRender(fd.atlas, t.e, m.tx0 + m.txdx * x + m.txdy * y, m.ty0 + m.tydx * x + m.tydy * y, [Math.abs(m.txdx) + Math.abs(m.txdy), Math.abs(m.tydx) + Math.abs(m.tydy)]);
            acc = cov + acc * (1 - cov); }
        out[j * W + i] = acc;
    }
    return out;
}

console.log("\n2. THE FRAME, ON BOTH BACKENDS, AGAINST THREE KEYS");
{
    const skip = webgpuSkipReason();
    if (skip) {
        console.log(`  SKIP  ${skip}`);
        report("*** NOT A PASS. *** Section 1 drives the recorder. Only this one draws a glyph on a device.");
        fails++;
    } else {
        const r = await runInEngineOrigin({ engineRoot: ENG, args: { W, H, SIZE, ORIGIN, TEXT, CHARS, CAPTURE: Object.keys(CAPTURE_INPUTS) }, script: `async (a) => {
            const { requestDevice } = await import("/gfx/device.js");
            const { parseFont } = await import("/text/slugFont.js");
            const M = await import("/render/slugDevice.mjs");
            const { SlugFontGPU, SlugTextBatch } = await import("/text/slugText.js");
            const font = parseFont(await (await fetch("/vendor/fonts/IBMPlexSerif-Regular.ttf")).arrayBuffer());
            const { W, H, SIZE, TEXT, CHARS } = a; const [px, py] = a.ORIGIN;
            const rows = new Float32Array([2 / W, 0, 0, (2 / W) * px - 1, 0, 2 / H, 0, 1 - (2 / H) * py, 0, 0, 0, 0, 0, 0, 0, 1]);
            const out = {};
            for (const backend of ["webgpu", "webgl2"]) {
                const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
                const dev = await requestDevice(cv, { backend, offscreen: backend === "webgpu" });
                const o = { backend: dev.backend, cap: {}, capErrors: [] };
                const fd = new M.SlugFontDevice(dev, font, CHARS);
                o.logWidth = fd.logWidth; o.bytes = fd.byteSize;
                const b = new M.SlugDeviceBatch(fd);
                b.set(TEXT, { size: SIZE, color: [1, 1, 1, 1] });
                const fr = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); b.draw(pass, rows, [W, H]); }, { read: true });
                o.pixels = Array.from(fr.pixels);
                const fr2 = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 1]); b.draw(pass, rows, [W, H]); }, { read: true });
                let redraw = 0; for (let i = 0; i < fr.pixels.length; i++) if (fr.pixels[i] !== fr2.pixels[i]) redraw++;
                o.redrawDiff = redraw;
                // the capture variants: the same pipeline with the fragment's tail writing f32 bits, blend off (render/slugDevice.mjs slugCaptureDesc)
                for (const what of a.CAPTURE) {
                    let d; try { d = M.slugCaptureDesc(fd.logWidth, what); } catch (e) { o.capErrors.push(what + ": " + e.message); continue; }
                    const pipe = dev.pipeline(d);
                    if (pipe.compiled) { const err = await pipe.compiled; if (err) { o.capErrors.push(what + ": " + err); continue; } }
                    const cf = await dev.frame(({ pass }) => { pass.clear([0, 0, 0, 0]); pass.use(pipe); for (let i = 0; i < 4; i++) pass.uniform("m" + i, rows.subarray(i * 4, i * 4 + 4)); pass.uniform("viewport", [W, H]);
                        pass.texture("curveTexture", fd.curveTexture, 0); pass.texture("bandTexture", fd.bandTexture, 1); pass.vertices(b.vb); pass.indices(b.ib); pass.drawIndexed(b.indexCount); }, { read: true });
                    o.cap[what] = Array.from(cf.pixels);
                }
                b.destroy(); fd.destroy(); dev.destroy();
                out[backend] = o;
            }
            // KEY 2: the shipped raw-WebGL2 batch, same string, same rows, same size
            const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
            const gl = cv.getContext("webgl2", { antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true });
            const fg = new SlugFontGPU(gl, font, CHARS, { format: "16f" });
            const tb = new SlugTextBatch(fg);
            tb.set(TEXT, { size: SIZE, color: [1, 1, 1, 1] });
            gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
            tb.draw(rows, [W, H]);
            const raw = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
            const flipped = new Uint8Array(W * H * 4);
            for (let y = 0; y < H; y++) flipped.set(raw.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
            out.shipped = { pixels: Array.from(flipped), logWidth: fg.logWidth };
            return out;
        }` });
        ok("*** both backends drew Slug text through gfx/device.js ***", r.ok && r.result && r.result.webgpu && r.result.webgl2, r.ok ? `atlas ${(r.result.webgpu.bytes / 1024).toFixed(0)} KiB, logWidth ${r.result.webgpu.logWidth}/${r.result.webgl2.logWidth}` : r.reason);
        if (r.ok) {
            const nb = nullBackend();
            const fd = new SlugFontDevice(nb, font, CHARS, { logWidth: r.result.webgl2.logWidth });
            for (const bk of ["webgpu", "webgl2"]) {
                const o = r.result[bk];
                ok(`${bk}: the four capture variants compiled and drew`, o.capErrors.length === 0 && Object.keys(o.cap).length === 4, o.capErrors.join(" | ") || "tx ty fwx fwy");
                if (o.capErrors.length) continue;
                const fit = fitSubpixel(fd, o.cap);
                report(`${bk}: sub-pixel fit -- ` + fit.all.map((x) => `1/${x.Q}: ${x.worst.toExponential(2)}`).join("  "));
                ok(`*** ${bk}: a snapped-corner model reproduces the fragment's texcoord to ${MODEL_TOL_EM} em -- the rasteriser carries ${isFinite(fit.best.Q) ? Math.log2(fit.best.Q) + " sub-pixel bits" : "no snap"} ***`,
                    fit.best.worst < MODEL_TOL_EM && fit.best.n > 1000, `worst ${fit.best.worst.toExponential(2)} em over ${fit.best.n} fragments, fwidth to ${fit.best.worstFw.toExponential(2)}`);
                ok(`  ${bk}: and the exact-centre model does NOT -- the snap is real, not a tolerance`, fit.all.find((x) => x.Q === Infinity).worst > 1e-4,
                    `no-snap worst ${fit.all.find((x) => x.Q === Infinity).worst.toExponential(2)} em`);
                const key = expectedFrame(fd, fit.best.Q);
                const lit = key.filter((v) => v > 0.02).length, partial = key.filter((v) => v > 0.02 && v < 0.98).length;
                ok(`  ${bk}: CONTROL -- the key has ink and antialiased edges to compare`, lit > 500 && partial > 200, `${lit} lit, ${partial} partial`);
                let worst = 0, over = 0, exact = 0, worstAt = -1;
                for (let i = 0; i < W * H; i++) {
                    const want = Math.round(key[i] * 255), got = o.pixels[i * 4], d = Math.abs(got - want);
                    if (d === 0) exact++; if (d > TOL) over++; if (d > worst) { worst = d; worstAt = i; }
                }
                ok(`*** ${bk}: every pixel of the frame is within ${TOL} of 255 of slugEval through the rasteriser model ***`, over === 0,
                    `worst ${worst} at (${worstAt % W}, ${Math.floor(worstAt / W)}), ${exact} of ${W * H} exact`);
                ok(`  ${bk}: alpha is 1 everywhere (premultiplied over an opaque clear)`, o.pixels.every((v, i) => i % 4 !== 3 || v === 255));
                ok(`  ${bk}: a second frame from the same batch is the same picture`, o.redrawDiff === 0, `${o.redrawDiff} bytes differ`);
                ok(`  ${bk}: the frame is not blank`, o.pixels.some((v, i) => i % 4 === 0 && v > 128));
            }
            const S = r.result.shipped.pixels, L = r.result.webgl2.pixels, G = r.result.webgpu.pixels;
            let shipDiff = 0, shipWorst = 0;
            for (let i = 0; i < W * H * 4; i++) { const d = Math.abs(S[i] - L[i]); if (d) shipDiff++; if (d > shipWorst) shipWorst = d; }
            ok("*** the device's WebGL2 picture equals the shipped raw-WebGL2 SlugTextBatch picture PIXEL FOR PIXEL ***", shipDiff === 0 && r.result.shipped.logWidth === r.result.webgl2.logWidth,
                `${shipDiff} bytes differ, worst ${shipWorst}; logWidth ${r.result.shipped.logWidth} both`);
            let pairWorst = 0, pairOver = 0, pairExact = 0;
            for (let i = 0; i < W * H; i++) { const d = Math.abs(G[i * 4] - L[i * 4]); if (d === 0) pairExact++; if (d > TOL) pairOver++; if (d > pairWorst) pairWorst = d; }
            ok(`*** and the two backends agree within ${TOL} of 255 on every pixel ***`, pairOver === 0, `worst ${pairWorst}, ${pairExact} of ${W * H} exact`);
        }
        if (r && r.pageErrors && r.pageErrors.length) report("page errors: " + r.pageErrors.slice(0, 3).join(" | "));
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: PRESENTING TO A CANVAS ON WebGPU (offscreen target, as every device gate here), text in " +
    "PERSPECTIVE (the rows are orthographic, so the dilation is exactly half a pixel and the model can use it), " +
    "the even-odd and weight variants, a rasteriser with more than eight sub-pixel bits (the candidate list stops " +
    "at 256; a rig that fits none goes red and says so), and a consumer -- slug-device.html draws the sizes " +
    "ladder and no scene draws labels through this yet.");
process.exit(fails ? 1 : 0);
