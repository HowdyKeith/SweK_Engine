// WebGLEngine/tools/ship/smaaPassGPU-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/smaaPassGPU-selfcheck.mjs      (about a minute: WebGPU in headless Chromium)
//
// SMAA AND ITS TEMPORAL RESOLVE ON WEBGPU, HELD. render/smaaPassGPU.mjs is render/smaaPass.js's three passes in WGSL (PlayCanvas's, de-dialected) and a two-frame resolve.
//
//   1  THE SHADERS     every module compiles and every pipeline builds with no validation error
//   2  NOTHING TO DO   a flat frame and a boundary of 3% a channel (under the threshold) come out bit for bit; after a hard frame and a flat one the edge target holds nothing
//   3  THE EDGES       hard slanted shapes in FOUR ORIENTATIONS on a 128 x 80 frame (not square): against the 8 x 8 supersampled truth, SMAA's edge error is under 70% of
//                      the aliased frame's every time; no pixel away from an edge changes. The WebGL2 pass's figures are reported beside it
//   4  T2x             a still camera, the scene drawn at the two T2x jitters in turn: the resolved frame is nearer the truth than SMAA 1x of either jittered frame alone;
//                      with the camera MOVED the history is dropped and the frame is SMAA 1x of the current picture to the bit; jitter is [0, 0] without temporal
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PRESENT_ARGS, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

const PAGE = `<!doctype html><html><body><script type="module">
import { createSmaaGPU } from "/render/smaaPassGPU.mjs";
const W = 128, H = 80, R = {};
try {
const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice(), errs = []; device.onuncapturederror = (e) => errs.push(e.error.message);
device.pushErrorScope("validation");
const aa = createSmaaGPU(device, { width: W, height: H }), t2 = createSmaaGPU(device, { width: W, height: H, temporal: true });
R.buildError = await device.popErrorScope().then((e) => (e ? e.message : null));
const triCode = "struct V { @builtin(position) p: vec4f, @location(0) c: vec4f }; struct In { @location(0) p: vec2f, @location(1) c: vec4f }; @vertex fn vs(i: In) -> V { var o: V; o.p = vec4f(i.p, 0.0, 1.0); o.c = i.c; return o; } @fragment fn fs(v: V) -> @location(0) vec4f { return v.c; }";
const tm = device.createShaderModule({ code: triCode }), tri = device.createRenderPipeline({ layout: "auto", vertex: { module: tm, entryPoint: "vs", buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }, { shaderLocation: 1, offset: 8, format: "float32x4" }] }] }, fragment: { module: tm, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
const T = [[-0.8, -0.7, 0.85, -0.45, -0.6, 0.8, 0.95, 0.85, 0.3, 1], [0.1, -0.9, 0.9, 0.2, 0.3, 0.6, 0.2, 0.9, 0.95, 1], [-0.9, 0.3, -0.2, 0.95, 0.5, 0.35, 1, 0.5, 0.2, 1]];
function verts(scene, o, w, h, jx = 0, jy = 0) {
    const bg = [0.1, 0.12, 0.15, 1], v = [], quad = (x0, y0, x1, y1, c) => v.push(x0, y0, ...c, x1, y0, ...c, x0, y1, ...c, x1, y0, ...c, x1, y1, ...c, x0, y1, ...c);
    quad(-1, -1, 1, 1, bg); if (scene === "low") quad(-0.4, -1, 0.4, 1, [0.13, 0.15, 0.18, 1]);
    if (scene === "tris") { const turn = (x, y) => { for (let k = 0; k < o; k++) [x, y] = [-y, x]; return [x + 2 * jx / w, y - 2 * jy / h]; }; for (const t of T) for (let k = 0; k < 3; k++) v.push(...turn(t[2 * k], t[2 * k + 1]), t[6], t[7], t[8], t[9]); }
    return new Float32Array(v);
}
const draw = (view, w, h, scene, o, jx, jy) => { const data = verts(scene, o, w, h, jx, jy), buf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(buf, 0, data); const enc = device.createCommandEncoder(), rp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: "clear", clearValue: [0, 0, 0, 1], storeOp: "store" }] }); rp.setPipeline(tri); rp.setVertexBuffer(0, buf); rp.draw(data.length / 6); rp.end(); device.queue.submit([enc.finish()]); };
const target = (w, h, f = "rgba8unorm") => device.createTexture({ size: [w, h], format: f, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING });
const read = async (tex, w, h, bpp = 4) => { const row = 256 * Math.ceil((w * bpp) / 256), b = device.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), enc = device.createCommandEncoder(); enc.copyTextureToBuffer({ texture: tex }, { buffer: b, bytesPerRow: row }, [w, h]); device.queue.submit([enc.finish()]); await b.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(b.getMappedRange().slice(0)); b.unmap(); const px = new Uint8Array(w * h * bpp); for (let y = 0; y < h; y++) px.set(raw.subarray(y * row, y * row + w * bpp), y * w * bpp); return px; };
const run = async (pass, scene, o, opts = {}, jx = 0, jy = 0) => { draw(pass.inputView, W, H, scene, o, jx, jy); const out = target(W, H), enc = device.createCommandEncoder(); pass.encode(enc, out.createView(), opts); device.queue.submit([enc.finish()]); return read(out, W, H); };
const plain = target(W, H), big = target(W * 8, H * 8);
const truthOf = async (scene, o, jx = 0, jy = 0) => { draw(big.createView(), W * 8, H * 8, scene, o, jx, jy); const bp = await read(big, W * 8, H * 8), t = new Float32Array(W * H * 4); for (let y = 0; y < H * 8; y++) for (let x = 0; x < W * 8; x++) for (let c = 0; c < 4; c++) t[((y >> 3) * W + (x >> 3)) * 4 + c] += bp[(y * W * 8 + x) * 4 + c] / 64; return t; };
const aliasOf = async (scene, o, jx = 0, jy = 0) => { draw(plain.createView(), W, H, scene, o, jx, jy); return read(plain, W, H); };
const edgeMask = (alias, truth) => { const e = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) if (Math.abs(truth[p * 4 + c] - alias[p * 4 + c]) > 1.5) e[p] = 1; return e; };
const err = (img, truth, e) => { let s = 0, n = 0; for (let p = 0; p < W * H; p++) if (e[p]) { for (let c = 0; c < 3; c++) s += Math.abs(img[p * 4 + c] - truth[p * 4 + c]); n++; } return n ? s / (n * 3) : 0; };
R.scenes = {};
for (const [scene, o] of [["flat", 0], ["low", 0], ["tris", 0], ["tris", 1], ["tris", 2], ["tris", 3]]) {
    const alias = await aliasOf(scene, o), s = await run(aa, scene, o), truth = await truthOf(scene, o), e = edgeMask(alias, truth);
    let far = 0, farChanged = 0, changed = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; let near = false; for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) { const q = (y + dy) * W + (x + dx); if (y + dy >= 0 && y + dy < H && x + dx >= 0 && x + dx < W && e[q]) { near = true; break; } } let d = false; for (let c = 0; c < 4; c++) if (s[p * 4 + c] !== alias[p * 4 + c]) d = true; if (d) changed++; if (!near) { far++; if (d) farChanged++; } }
    R.scenes[scene + o] = { edgePixels: e.reduce((a, v) => a + v, 0), aliasErr: err(alias, truth, e), smaaErr: err(s, truth, e), changed, far, farChanged, identical: alias.every((v, i) => v === s[i]) };
}
await run(aa, "tris", 0); await run(aa, "flat", 0); const ed = await read(aa.edgesTexture, W, H, 2); R.staleEdges = ed.reduce((a, v) => a + (v ? 1 : 0), 0);
// T2x: a still camera, the two jitters in turn; the truth of the UNJITTERED scene (the average of the two jitters' is centred on it)
const truth = await truthOf("tris", 0), e = edgeMask(await aliasOf("tris", 0), truth), J = [t2.jitter(0), t2.jitter(1)];
const one0 = await run(aa, "tris", 0, {}, ...J[0]), one1 = await run(aa, "tris", 0, {}, ...J[1]);
let t2out = null; for (let f = 0; f < 4; f++) t2out = await run(t2, "tris", 0, {}, ...t2.jitter());
const moved = await run(t2, "tris", 0, { moved: true }, ...t2.jitter(t2.frame)), oneNow = await run(aa, "tris", 0, {}, ...J[(t2.frame - 1) & 1]);
const ghost = await run(t2, "flat", 0, {}, ...t2.jitter()), flatPlain = await aliasOf("flat", 0);   // the picture changed but the camera did not: the clamp must not let the shapes ghost into it
R.t2 = { noGhost: ghost.every((v, i) => v === flatPlain[i]), jitter: J, plainJitter: aa.jitter(5), one0: err(one0, truth, e), one1: err(one1, truth, e), t2x: err(t2out, truth, e), movedIsOne: moved.every((v, i) => v === oneNow[i]) };
R.errors = errs; R.ok = true;
} catch (e) { R.error = String(e && e.stack || e); }
window.__smaaGpu = R;
</script></body></html>`;

console.log("smaaPassGPU-selfcheck -- SMAA and its temporal resolve on WebGPU\n");
const skip = webgpuSkipReason(require);
if (skip) { console.log(`  ----  skipped: ${skip}`); process.exit(0); }
let R = null;
await section(async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split("?")[0]); if (u === "/__smaagpu.html") { r.writeHead(200, { "Content-Type": "text/html" }); return r.end(PAGE); } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), p = await browser.newPage(), pe = [];
    p.on("pageerror", (e) => pe.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/__smaagpu.html`);
    await p.waitForFunction(() => window.__smaaGpu, null, { timeout: 180000 }).catch(() => {});
    R = await p.evaluate(() => window.__smaaGpu || null); await browser.close(); srv.close();
    console.log("1. THE SHADERS");
    ok("!! every SMAA module compiles and every pipeline builds (1x and temporal) with no validation error and no page error", R && R.ok && !R.buildError && R.errors.length === 0 && pe.length === 0, R ? (R.error || R.buildError || R.errors.slice(0, 2).join(" | ")) : pe.join(" | "));
});
if (R && R.ok) {
    console.log("2. NOTHING TO DO");
    ok("!! a flat frame and a boundary of 3% a channel come out bit for bit unchanged; after a hard frame and then a flat one the edge target holds nothing", R.scenes.flat0.identical && R.scenes.low0.identical && R.staleEdges === 0, `stale edge texels ${R.staleEdges}`);
    console.log("3. THE EDGES");
    const T = [0, 1, 2, 3].map((o) => R.scenes["tris" + o]);
    ok("!! IN ALL FOUR ORIENTATIONS SMAA's edge error is under 70% of the aliased frame's against the 8 x 8 truth", T.every((t) => t.edgePixels > 200 && t.smaaErr < 0.7 * t.aliasErr), T.map((t, o) => `${o * 90} deg: aliased ${t.aliasErr.toFixed(1)}, SMAA ${t.smaaErr.toFixed(1)}`).join("; "));
    ok("!! ...and no pixel 3 or more away from every edge pixel changes", T.every((t) => t.farChanged === 0 && t.far > 1000 && t.changed > 100), T.map((t) => `${t.changed} changed, ${t.farChanged} far`).join("; "));
    console.log("4. T2x");
    const t = R.t2;
    ok("!! A STILL CAMERA, THE TWO T2x JITTERS IN TURN: the resolved frame is nearer the unjittered truth than SMAA 1x of either jittered frame alone, and nearer than SMAA 1x of the unjittered frame itself; the jitters are (+1/4, -1/4) and (-1/4, +1/4), [0, 0] without temporal", t.t2x < Math.min(t.one0, t.one1) && t.t2x < R.scenes.tris0.smaaErr && JSON.stringify(t.jitter) === "[[0.25,-0.25],[-0.25,0.25]]" && JSON.stringify(t.plainJitter) === "[0,0]", `SMAA 1x of the jittered frames ${t.one0.toFixed(2)} and ${t.one1.toFixed(2)}, of the unjittered ${R.scenes.tris0.smaaErr.toFixed(2)}; T2x ${t.t2x.toFixed(2)}`);
    ok("!! WITH THE CAMERA MOVED the history is dropped: the frame is SMAA 1x of the current picture, to the bit", t.movedIsOne);
    ok("!! AND THE HISTORY IS CLAMPED: when the picture changes with the camera still (the shapes gone, a flat frame), no ghost of them survives -- the flat frame to the bit", t.noGhost);
}

console.log("5. THE PAGE (splat-gpu.html ?aa=smaa and ?aa=t2x)");
await section(async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
    const open = async (q) => { const p = await browser.newPage({ viewport: { width: 320, height: 200 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`http://127.0.0.1:${srv.address().port}/splat-gpu.html?n=20000&still=4${q}`); await p.waitForFunction(() => window.__splatGpu && (window.__splatGpu.stopped || window.__splatGpu.error), null, { timeout: 120000 });
        const r = await p.evaluate(async () => { const s = window.__splatGpu; return { jit: s.aaJitter || null, aa: s.aa, backend: s.backend, error: s.error, hud: document.getElementById("hud").textContent, cap: s.error ? null : await s.capture() }; }); await p.close(); return { ...r, errors }; };
    const off = await open(""), on = await open("&aa=smaa"), t2 = await open("&aa=t2x");
    await browser.close(); srv.close();
    const diff = (a, b) => { let d = 0; for (let k = 0; k < a.cap.grid.length; k++) d += Math.abs(a.cap.grid[k] - b.cap.grid[k]); return d / a.cap.grid.length; };
    const pics = [off, on, t2].every((x) => x.cap && x.backend === "webgpu" && !x.error && x.errors.length === 0);
    ok("!! ?aa=smaa and ?aa=t2x draw the splats through SMAA on WebGPU and say so, with no page error, and the picture is the same cloud (within 4 levels a sample of the plain one, lit alike)", pics && on.aa === "smaa" && t2.aa === "t2x" && /SMAA(?! T2x)/.test(on.hud) && /SMAA T2x/.test(t2.hud) && off.aa === "off" && on.jit && on.jit.join() === "0,0" && t2.jit && Math.abs(t2.jit[0]) === 0.25 && Math.abs(t2.jit[1]) === 0.25 && diff(off, on) < 4 && diff(off, t2) < 4 && Math.abs(on.cap.lit - off.cap.lit) < 0.05, pics ? `smaa ${diff(off, on).toFixed(2)}, t2x ${diff(off, t2).toFixed(2)} levels a sample from the plain picture` : JSON.stringify([off, on, t2].map((x) => ({ aa: x.aa, error: x.error, errors: x.errors.slice(0, 1) }))));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 13 mutants, each in a hard-linked copy of the tree: ALL 13 RED. 11 of render/smaaPassGPU.mjs (the full-screen triangle's v flipped, the blend's direction
// flipped, the threshold at 0, width and height swapped, the two tables swapped, the history not clamped -- GREEN at first, as the scene never changed under a still
// camera; a flat frame after the shapes, the camera still, must now come out clean --, the history kept when the camera moves, one jitter for both frames, one history
// buffer read and written, no history at all, no search steps); 2 of splat-gpu.html (?aa ignored; the jitter not applied -- GREEN at first, the page check compared
// pictures only; the page now reports the offset it drew at).
