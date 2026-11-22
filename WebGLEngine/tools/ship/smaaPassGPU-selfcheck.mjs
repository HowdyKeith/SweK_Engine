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
//   6  REPROJECTION    (2026-11-22) the WGSL's reprojectUV is motionVectorsCPU's at every pixel of a frame with random depths (within 1e-5 of a frame), including where
//                      it says a pixel was behind the last eye; a camera panning a third of a pixel a frame keeps its history and lands nearer the truth than SMAA 1x
//                      (14.19 against 14.68: a small win, as the bilinear re-read of a history a third of a pixel off softens it), without reprojection it is SMAA 1x
//                      to the bit, and no flat pixel ghosts; a depth texture of the plane's depth is the plane's picture to the bit, a nearer one is not; after a
//                      slide of 0.6 every pixel whose last place is off the screen takes no history
//   5  THE PAGE        splat-gpu.html ?aa=smaa|t2x draws the same cloud and says so; ?aa=t2x reprojects by the target plane; with ?spin the history is kept across
//                      the moves, with &reproject=0 never
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
import { motionVectorsCPU, mat4Multiply, mat4Invert, transform4 } from "../../render/motionVectors.mjs";
import { perspective, lookAt } from "../../render/gpuDriven.mjs";

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

console.log("6. REPROJECTION (2026-11-22): the history follows a moving camera");
// THE SECOND TEST PAGE: frames handed in from here (each frame's triangles already in NDC, its jitter, its matrices), and a compute probe of SMAA_REPROJECT_WGSL
const PAGE2 = `<!doctype html><html><body><script type="module">
import { createSmaaGPU, SMAA_REPROJECT_WGSL } from "/render/smaaPassGPU.mjs";
const W = 128, H = 80, adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
const tm = device.createShaderModule({ code: "struct V { @builtin(position) p: vec4f, @location(0) c: vec4f }; struct In { @location(0) p: vec2f, @location(1) c: vec4f }; @vertex fn vs(i: In) -> V { var o: V; o.p = vec4f(i.p, 0.0, 1.0); o.c = i.c; return o; } @fragment fn fs(v: V) -> @location(0) vec4f { return v.c; }" });
const tri = device.createRenderPipeline({ layout: "auto", vertex: { module: tm, entryPoint: "vs", buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }, { shaderLocation: 1, offset: 8, format: "float32x4" }] }] }, fragment: { module: tm, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
const draw = (view, data) => { const buf = device.createBuffer({ size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }); device.queue.writeBuffer(buf, 0, data); const enc = device.createCommandEncoder(), rp = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: "clear", clearValue: [0.1, 0.12, 0.15, 1], storeOp: "store" }] }); rp.setPipeline(tri); rp.setVertexBuffer(0, buf); rp.draw(data.length / 6); rp.end(); device.queue.submit([enc.finish()]); };
const target = (w, h) => device.createTexture({ size: [w, h], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
const read = async (tex, w, h) => { const row = 256 * Math.ceil((w * 4) / 256), b = device.createBuffer({ size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), enc = device.createCommandEncoder(); enc.copyTextureToBuffer({ texture: tex }, { buffer: b, bytesPerRow: row }, [w, h]); device.queue.submit([enc.finish()]); await b.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(b.getMappedRange().slice(0)); b.unmap(); const px = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) px.set(raw.subarray(y * row, y * row + w * 4), y * w * 4); return px; };
window.__run = async (frames, truthTris) => {
    const out = target(W, H), big = target(W * 8, H * 8), plain = target(W, H);
    const passes = { re: createSmaaGPU(device, { width: W, height: H, temporal: true }), reTex: createSmaaGPU(device, { width: W, height: H, temporal: true }), reBad: createSmaaGPU(device, { width: W, height: H, temporal: true }), drop: createSmaaGPU(device, { width: W, height: H, temporal: true }), one: createSmaaGPU(device, { width: W, height: H }), oneJ: createSmaaGPU(device, { width: W, height: H }) }, res = {};
    for (const [k, pass] of Object.entries(passes)) {
        let last = null;
        const dt = device.createTexture({ size: [W, H], format: "r32float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
        for (const f of frames) { if (k === "reTex" || k === "reBad") device.queue.writeTexture({ texture: dt }, new Float32Array(W * H).fill(k === "reBad" ? -0.9 : f.depth), { bytesPerRow: W * 4 }, [W, H]); draw(pass.inputView, new Float32Array(k === "one" ? f.plain : f.jittered[pass.frame & 1])); const enc = device.createCommandEncoder(); pass.encode(enc, out.createView(), k.startsWith("re") ? { moved: true, reproject: { invViewProj: f.inv, prevViewProj: f.prev, depth: k === "re" ? f.depth : dt.createView() } } : { moved: true }); device.queue.submit([enc.finish()]); last = await read(out, W, H); }
        res[k] = last;
    }
    draw(big.createView(), new Float32Array(truthTris)); const bp = await read(big, W * 8, H * 8), truth = new Float32Array(W * H * 4);
    for (let y = 0; y < H * 8; y++) for (let x = 0; x < W * 8; x++) for (let c = 0; c < 4; c++) truth[((y >> 3) * W + (x >> 3)) * 4 + c] += bp[(y * W * 8 + x) * 4 + c] / 64;
    draw(plain.createView(), new Float32Array(frames.at(-1).plain)); const alias = await read(plain, W, H), e = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) for (let c = 0; c < 3; c++) if (Math.abs(truth[p * 4 + c] - alias[p * 4 + c]) > 1.5) e[p] = 1;
    const err = (img) => { let s = 0, n = 0; for (let p = 0; p < W * H; p++) if (e[p]) { for (let c = 0; c < 3; c++) s += Math.abs(img[p * 4 + c] - truth[p * 4 + c]); n++; } return s / (n * 3); };
    const flat = (p) => { const x = p % W, y = (p / W) | 0; if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) return false; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (let c = 0; c < 3; c++) if (alias[((y + dy) * W + x + dx) * 4 + c] !== alias[p * 4 + c]) return false; return true; };
    let far = 0, flats = 0; for (let p = 0; p < W * H; p++) { if (!flat(p)) continue; flats++; let d = 0; for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(res.re[p * 4 + c] - alias[p * 4 + c])); if (d > 2) far++; }
    return { edgePixels: e.reduce((a, v) => a + v, 0), alias: err(alias), one: err(res.one), drop: err(res.drop), re: err(res.re), dropIsOne: res.drop.every((v, i) => v === res.oneJ[i]), reFarChanged: far, flats, texIsPlane: res.reTex.every((v, i) => v === res.re[i]), badDiffers: res.reBad.some((v, i) => v !== res.re[i]) };
};
window.__offscreen = async (A, B, inv, prev, depth) => {
    const out = target(W, H), t = createSmaaGPU(device, { width: W, height: H, temporal: true }), one = createSmaaGPU(device, { width: W, height: H }), res = {};
    draw(t.inputView, new Float32Array(A)); let enc = device.createCommandEncoder(); t.encode(enc, out.createView()); device.queue.submit([enc.finish()]);
    draw(t.inputView, new Float32Array(B)); enc = device.createCommandEncoder(); t.encode(enc, out.createView(), { moved: true, reproject: { invViewProj: inv, prevViewProj: prev, depth } }); device.queue.submit([enc.finish()]); res.t = Array.from(await read(out, W, H));
    draw(one.inputView, new Float32Array(B)); enc = device.createCommandEncoder(); one.encode(enc, out.createView()); device.queue.submit([enc.finish()]); res.one = Array.from(await read(out, W, H));
    return res;
};
window.__probe = async (depth, w, h, inv, prev) => {
    const code = SMAA_REPROJECT_WGSL + "\\n@group(0) @binding(0) var<storage, read> D: array<f32>; @group(0) @binding(1) var<storage, read_write> O: array<f32>; struct M { a: mat4x4f, b: mat4x4f }; @group(0) @binding(2) var<uniform> MM: M;\\n@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3u) { let i = g.x; if (i >= " + (w * h) + "u) { return; } let p = vec2i(i32(i % " + w + "u), i32(i / " + w + "u)); let r = reprojectUV(p, vec2i(" + w + ", " + h + "), D[i], MM.a, MM.b); O[i * 3u] = r.x; O[i * 3u + 1u] = r.y; O[i * 3u + 2u] = r.z; }";
    const pipe = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code }), entryPoint: "main" } });
    const dB = device.createBuffer({ size: depth.length * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }), oB = device.createBuffer({ size: w * h * 12, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }), mB = device.createBuffer({ size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }), rB = device.createBuffer({ size: w * h * 12, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    device.queue.writeBuffer(dB, 0, new Float32Array(depth)); device.queue.writeBuffer(mB, 0, new Float32Array([...inv, ...prev]));
    const enc = device.createCommandEncoder(), cp = enc.beginComputePass(); cp.setPipeline(pipe); cp.setBindGroup(0, device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: dB } }, { binding: 1, resource: { buffer: oB } }, { binding: 2, resource: { buffer: mB } }] })); cp.dispatchWorkgroups(Math.ceil(w * h / 64)); cp.end(); enc.copyBufferToBuffer(oB, 0, rB, 0, w * h * 12); device.queue.submit([enc.finish()]);
    await rB.mapAsync(GPUMapMode.READ); return Array.from(new Float32Array(rB.getMappedRange().slice(0)));
};
window.__ready = true;
<\/script></body></html>`;
await section(async () => {
    const W = 128, H = 80, proj = perspective(1.0, W / H, 0.1, 20), vpAt = (cx) => mat4Multiply(proj, lookAt([cx, 0, 2.5], [cx, 0, 0]));
    // 1) the WGSL reprojection against motionVectorsCPU: a real perspective pair (the camera slid and turned a little), random NDC depths in the frustum
    const w = 32, h = 20, cur = mat4Multiply(proj, lookAt([0.1, 0.05, 2.4], [0, 0, 0])), prev = mat4Multiply(proj, lookAt([0, 0, 2.5], [0.02, 0, 0])), inv = mat4Invert(cur);
    let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }, depth = Array.from({ length: w * h }, () => 0.6 + 0.39 * rnd());
    const cpu = motionVectorsCPU(Float32Array.from(depth), w, h, inv, prev);
    // 2) a panning camera: triangles on the plane z = 0, the camera sliding 0.012 a frame (about a third of a pixel) and looking straight at it, so the plane has one NDC depth
    const TRI = [[-0.9, -0.6, 0.8, -0.4, -0.5, 0.75, 0.95, 0.85, 0.3, 1], [0.1, -0.8, 1.0, 0.2, 0.3, 0.6, 0.2, 0.9, 0.95, 1], [-1.0, 0.3, -0.3, 0.8, 0.4, 0.35, 1, 0.5, 0.2, 1]];
    const ndcTris = (vp, jx = 0, jy = 0) => { const v = []; for (const t of TRI) for (let k = 0; k < 3; k++) { const q = transform4(vp, t[2 * k], t[2 * k + 1], 0, 1); v.push(q[0] / q[3] + 2 * jx / W, q[1] / q[3] - 2 * jy / H, t[6], t[7], t[8], t[9]); } return v; };
    const frames = []; let prevVP = vpAt(0);
    for (let f = 0; f < 8; f++) { const vp = vpAt(0.012 * f), q = transform4(vp, 0.012 * f, 0, 0, 1); frames.push({ plain: ndcTris(vp), jittered: [ndcTris(vp, 0.25, -0.25), ndcTris(vp, -0.25, 0.25)], inv: Array.from(mat4Invert(vp)), prev: Array.from(prevVP), depth: q[2] / q[3] }); prevVP = vp; }
    const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split("?")[0]); if (u === "/__smaagpu2.html") { r.writeHead(200, { "Content-Type": "text/html" }); return r.end(PAGE2); } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": /\.m?js$/.test(f) ? "text/javascript" : "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), p = await browser.newPage(), pe = []; p.on("pageerror", (e) => pe.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/__smaagpu2.html`); await p.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const g = await p.evaluate(([d, w2, h2, a, b]) => window.__probe(d, w2, h2, a, b), [depth, w, h, Array.from(inv), Array.from(prev)]);
    // behind the last eye: the previous camera stood between the scene and this one, facing away, so some of what this camera sees was behind it
    const prevBack = mat4Multiply(proj, lookAt([0, 0, 1.2], [0, 0, 5])), cpuB = motionVectorsCPU(Float32Array.from(depth), w, h, inv, prevBack);
    const gB = await p.evaluate(([d, w2, h2, a, b]) => window.__probe(d, w2, h2, a, b), [depth, w, h, Array.from(inv), Array.from(prevBack)]);
    let behind = 0, behindSame = true; for (let i = 0; i < w * h; i++) { if (!cpuB.valid[i]) behind++; if ((gB[i * 3 + 2] > 0.5) !== (cpuB.valid[i] === 1)) behindSame = false; }
    // off the last frame: a full-screen red frame, then the camera slides 0.6 to the right over one-pixel stripes (every 3 x 3 spans the stripes and the clear, so the clamp lets red through)
    const vA = vpAt(0), vB = vpAt(0.6), dB = transform4(vB, 0.6, 0, 0, 1), planeB = dB[2] / dB[3], A = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1].flatMap((c, k, a) => (k % 2 ? [] : [a[k], a[k + 1], 1, 0, 0, 1]));
    const B = []; for (let x = 0; x < W; x += 2) { const x0 = (2 * x) / W - 1, x1 = (2 * (x + 1)) / W - 1; for (const [X, Y] of [[x0, -1], [x1, -1], [x1, 1], [x0, -1], [x1, 1], [x0, 1]]) B.push(X, Y, 1, 1, 1, 1); }
    const off = await p.evaluate(([a, b, i2, pv, dd]) => window.__offscreen(a, b, i2, pv, dd), [A, B, Array.from(mat4Invert(vB)), Array.from(vA), planeB]);
    const mvB = motionVectorsCPU(new Float32Array(W * H).fill(planeB), W, H, mat4Invert(vB), vA); let outside = 0, outsideSame = true, insideChanged = 0;
    for (let i = 0; i < W * H; i++) { const u = (i % W + 0.5) / W + mvB.data[i * 4], same = [0, 1, 2].every((c) => off.t[i * 4 + c] === off.one[i * 4 + c]); if (u < 0 || u > 1) { outside++; if (!same) outsideSame = false; } else if (!same) insideChanged++; }
    const run = await p.evaluate(([fr, tt]) => window.__run(fr, tt), [frames, frames.at(-1).plain]);
    await browser.close(); srv.close();
    let worst = 0, validSame = true; for (let i = 0; i < w * h; i++) { const u = (i % w + 0.5) / w, v = (Math.floor(i / w) + 0.5) / h; if ((g[i * 3 + 2] > 0.5) !== (cpu.valid[i] === 1)) validSame = false; if (cpu.valid[i]) worst = Math.max(worst, Math.abs(g[i * 3] - (u + cpu.data[i * 4])), Math.abs(g[i * 3 + 1] - (v + cpu.data[i * 4 + 1]))); }
    ok("!! THE REPROJECTION IS motionVectorsCPU's: at every pixel of a 32 x 20 frame with random depths and a real perspective pair, where it says a pixel was last frame agrees within 1e-5 of a frame, and so does whether it had one", validSame && worst < 1e-5 && pe.length === 0, `worst ${worst.toExponential(2)} of a frame; ${pe.slice(0, 1).join("")}`);
    ok("!! ...and where it was BEHIND the last eye it says there is no history, as motionVectorsCPU does", behind > 50 && behind < w * h && behindSame, `${behind} of ${w * h} pixels behind`);
    ok("!! WHAT WAS OFF THE LAST FRAME TAKES NO HISTORY: after a slide of 0.6, every pixel whose last place is off the screen is SMAA 1x of this frame to the bit, while the rest took the (red) history in", outside > 500 && outsideSame && insideChanged > 500, `${outside} off-screen, ${insideChanged} of the rest changed by the history`);
    ok("!! A PANNING CAMERA (a third of a pixel a frame, 8 frames): T2x with reprojection keeps its history and lands nearer the truth than SMAA 1x; without it the history is dropped every frame and the picture is SMAA 1x of the same jittered frame, to the bit", run.re < run.one && run.dropIsOne && run.edgePixels > 200, `aliased ${run.alias.toFixed(2)}, SMAA 1x ${run.one.toFixed(2)}, T2x dropping ${run.drop.toFixed(2)}, T2x reprojected ${run.re.toFixed(2)}`);
    ok("!! a depth TEXTURE holding the plane's depth at every pixel gives the plane's picture to the bit (the per-pixel path reads what the uniform path is given), and one holding a nearer depth does not", run.texIsPlane && run.badDiffers);
    ok("!! ...and it ghosts nothing: no pixel whose 5 x 5 neighbourhood is one colour is more than 2 levels from it (the history is clamped to the current 3 x 3)", run.reFarChanged === 0 && run.flats > 5000, `${run.reFarChanged} of ${run.flats} pixels`);
});

console.log("5. THE PAGE (splat-gpu.html ?aa=smaa and ?aa=t2x)");
await section(async () => {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
    const srv = http.createServer((q, r) => { const f = path.join(ENG, decodeURIComponent(q.url.split("?")[0])); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
    const open = async (q) => { const p = await browser.newPage({ viewport: { width: 320, height: 200 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`http://127.0.0.1:${srv.address().port}/splat-gpu.html?n=20000&still=4${q}`); await p.waitForFunction(() => window.__splatGpu && (window.__splatGpu.stopped || window.__splatGpu.error), null, { timeout: 120000 });
        const r = await p.evaluate(async () => { const s = window.__splatGpu; return { jit: s.aaJitter || null, re: s.aaReproject ?? null, carried: s.aaCarried || 0, aa: s.aa, backend: s.backend, error: s.error, hud: document.getElementById("hud").textContent, cap: s.error ? null : await s.capture() }; }); await p.close(); return { ...r, errors }; };
    const off = await open(""), on = await open("&aa=smaa"), t2 = await open("&aa=t2x"), t2n = await open("&aa=t2x&reproject=0"), sp = await open("&aa=t2x&spin=0.004"), spn = await open("&aa=t2x&spin=0.004&reproject=0");
    await browser.close(); srv.close();
    const diff = (a, b) => { let d = 0; for (let k = 0; k < a.cap.grid.length; k++) d += Math.abs(a.cap.grid[k] - b.cap.grid[k]); return d / a.cap.grid.length; };
    const pics = [off, on, t2].every((x) => x.cap && x.backend === "webgpu" && !x.error && x.errors.length === 0);
    ok("!! ?aa=smaa and ?aa=t2x draw the splats through SMAA on WebGPU and say so, with no page error, and the picture is the same cloud (within 4 levels a sample of the plain one, lit alike)", pics && on.aa === "smaa" && t2.aa === "t2x" && /SMAA(?! T2x)/.test(on.hud) && /SMAA T2x/.test(t2.hud) && off.aa === "off" && on.jit && on.jit.join() === "0,0" && t2.jit && Math.abs(t2.jit[0]) === 0.25 && Math.abs(t2.jit[1]) === 0.25 && diff(off, on) < 4 && diff(off, t2) < 4 && Math.abs(on.cap.lit - off.cap.lit) < 0.05, pics ? `smaa ${diff(off, on).toFixed(2)}, t2x ${diff(off, t2).toFixed(2)} levels a sample from the plain picture` : JSON.stringify([off, on, t2].map((x) => ({ aa: x.aa, error: x.error, errors: x.errors.slice(0, 1) }))));
    ok("!! ?aa=t2x carries its history across a move by the target plane (the page says \"plane\" once it has a last frame); &reproject=0 turns that off and says so; plain SMAA has none; with the camera turning every frame (?spin) the history is KEPT across the moves, and with &reproject=0 never", t2.re === "plane" && t2n.re === "off" && on.re === null && [t2n, sp, spn].every((x) => x.errors.length === 0 && !x.error) && sp.carried >= 2 && spn.carried === 0, JSON.stringify([on.re, t2.re, t2n.re, sp.carried, spn.carried]));
});

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 13 mutants, each in a hard-linked copy of the tree: ALL 13 RED. 11 of render/smaaPassGPU.mjs (the full-screen triangle's v flipped, the blend's direction
// flipped, the threshold at 0, width and height swapped, the two tables swapped, the history not clamped -- GREEN at first, as the scene never changed under a still
// camera; a flat frame after the shapes, the camera still, must now come out clean --, the history kept when the camera moves, one jitter for both frames, one history
// buffer read and written, no history at all, no search steps); 2 of splat-gpu.html (?aa ignored; the jitter not applied -- GREEN at first, the page check compared
// pictures only; the page now reports the offset it drew at).
// 2026-11-22, REPROJECTION: 15 more, ALL 15 RED. 11 of render/smaaPassGPU.mjs (v not flipped, no perspective divide, behind-the-eye not refused -- GREEN at first,
// the probe's pair never put a point behind the last eye; one now does --, the history read in place instead of at the reprojected uv and the depth texture ignored
// (both red only because the pipeline's auto layout loses the then-unused binding, not by a picture), no clamp, off-screen history kept -- GREEN at first;
// the slide of 0.6 over stripes now catches it --, the two matrices swapped, a move dropping the history even when reprojecting, the reproject flag never set,
// lastUsedHistory always true); 4 of splat-gpu.html (reproject never passed -- GREEN at first, the page check read only the label; ?spin and the carried count now
// show it --, ?reproject=0 ignored, the last frame's matrix never kept, every frame counted as still).
