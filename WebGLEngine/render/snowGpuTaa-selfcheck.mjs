// WebGLEngine/render/snowGpuTaa-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowGpuTaa-selfcheck.mjs
//
// ONE OF SIX GATES THAT TOGETHER ARE THE SNOW FRAME ON THE GPU (render/snowGpu.mjs, snow-gpu.html). It was one file, render/snowGpu-selfcheck.mjs, and took 38-57 s: past the quick sweep's
// 20 s cap, so no sweep or default rotation ever recorded it finishing, and gateBudget carried it as UNRESOLVED. MEASURED while splitting it: g.frame() only QUEUES the work, and
// the first readback pays ~9.5 s for SwiftShader to compile the sky-bake kernel, so EVERY page that reads anything back starts ~10 s in; the six gates are balanced so each is
// that plus under ~8 s of its own work. The browser rows are unchanged except where a part says otherwise. The six: snowGpu (maths, source, the core stages), snowGpuField (the
// compute-stepped deformation), snowGpuTaa (the TAA kernel, the flicker, the sky dome), snowGpuLookA (the shadow maps and cascades, fine relief, subsurface scattering),
// snowGpuLookB (glints) and snowGpuLive (the live loop and its rate). THIS ONE: the TAA texture kernel against the CPU resolve, the frame-to-frame flicker with and without the resolve, and the sky dome the right way round.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { LAUNCH_ARGS, SECURE_HOST, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("snowGpuTaa-selfcheck -- the TAA kernel, the flicker with the jitter held still, and the sky dome\n");
console.log("THE FRAME");
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
            // ---- TAA: the texture kernel vs the CPU resolve, then the flicker
            const taaK = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, d = g.device, M = await import("/render/snowGpu.mjs"), T = await import("/render/taaResolve.mjs");
                const w = 24, h = 16, TU = GPUTextureUsage, f16 = (v) => { const f = new Float32Array([v]), u = new Uint32Array(f.buffer)[0]; const s = (u >>> 16) & 0x8000, e = ((u >>> 23) & 0xff) - 127 + 15, m = (u >>> 13) & 0x3ff; if (v === 0 || Math.abs(v) < 6.2e-5) return 0; return s | (e << 10) | m; };
                const d16 = (b) => { const s = (b & 0x8000) ? -1 : 1, e = (b >> 10) & 31, m = b & 1023; return e === 0 ? s * Math.pow(2, -14) * (m / 1024) : s * Math.pow(2, e - 15) * (1 + m / 1024); };
                let seed = 21; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
                const mk = (fn) => { const a = new Float32Array(w * h * 4), q = new Uint16Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y), o = (y * w + x) * 4; for (let k = 0; k < 3; k++) { q[o + k] = f16(c[k]); a[o + k] = d16(q[o + k]); } q[o + 3] = f16(1); a[o + 3] = 1; } return { a, q }; };
                const cur = mk((x, y) => [0.4 + 0.3 * Math.sin(x * 0.4) + 0.1 * rnd(), 0.3 + 0.2 * Math.cos(y * 0.5), 0.5 + 0.1 * rnd()]), hist = mk((x, y) => [0.4 + 0.3 * Math.sin(x * 0.4 + 0.2) + 0.1 * rnd(), 0.3 + 0.2 * Math.cos(y * 0.5), 0.5]);
                const depth = new Float32Array(w * h); for (let i = 0; i < depth.length; i++) depth[i] = 15 + 10 * rnd();
                const tanX = 0.9, tanY = 0.6, vp = new Array(16).fill(0); vp[0] = 1 / tanX; vp[5] = 1 / tanY; vp[10] = 1; vp[11] = 1; const vp2 = vp.slice(); vp2[12] = 0.04; vp2[13] = -0.02;
                const iv = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], jit = [0.02, -0.03];
                const flip = (img) => { const o = new Float32Array(img.length); for (let y = 0; y < h; y++) o.set(img.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4); return o; };
                const S2 = { w, h, cur: flip(cur.a), hist: flip(hist.a), depth: (() => { const o = new Float32Array(w * h); for (let y = 0; y < h; y++) o.set(depth.subarray(y * w, (y + 1) * w), (h - 1 - y) * w); return o; })(), prevViewProj: vp2, invView: iv, projInfo: [tanX, tanY], jitterNdc: jit, historyValid: 1, enabled: 1, feedback: 0.9 };
                const twin = flip(T.resolveFrame(S2));
                const mkTex = (fmt, usage) => d.createTexture({ size: [w, h], format: fmt, usage });
                const tc = mkTex("rgba16float", TU.TEXTURE_BINDING | TU.COPY_DST), th = mkTex("rgba16float", TU.TEXTURE_BINDING | TU.COPY_DST), td = mkTex("r32float", TU.TEXTURE_BINDING | TU.COPY_DST), to = mkTex("rgba16float", TU.STORAGE_BINDING | TU.COPY_SRC);
                d.queue.writeTexture({ texture: tc }, cur.q, { bytesPerRow: w * 8 }, [w, h]); d.queue.writeTexture({ texture: th }, hist.q, { bytesPerRow: w * 8 }, [w, h]); d.queue.writeTexture({ texture: td }, depth, { bytesPerRow: w * 4 }, [w, h]);
                const u = new Float32Array(44); u.set(vp2, 0); u.set(iv, 16); u.set([tanX, tanY, 1 / w, 1 / h, jit[0], jit[1], 1, 1, 0.9, 0, 0, 0], 32);
                const ub = d.createBuffer({ size: 176, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }); d.queue.writeBuffer(ub, 0, u);
                const pipe = d.createComputePipeline({ layout: "auto", compute: { module: d.createShaderModule({ code: M.TAA_GPU_WGSL }), entryPoint: "main" } });
                const bg = d.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ub } }, { binding: 1, resource: tc.createView() }, { binding: 2, resource: th.createView() }, { binding: 3, resource: td.createView() }, { binding: 4, resource: to.createView() }] });
                const bpr = 256, rb = d.createBuffer({ size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), e = d.createCommandEncoder(), cp = e.beginComputePass(); cp.setPipeline(pipe); cp.setBindGroup(0, bg); cp.dispatchWorkgroups(3, 2); cp.end();
                e.copyTextureToBuffer({ texture: to }, { buffer: rb, bytesPerRow: bpr }, [w, h]); d.queue.submit([e.finish()]); await rb.mapAsync(GPUMapMode.READ);
                const raw = new Uint16Array(rb.getMappedRange().slice(0)); let worst = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(d16(raw[y * (bpr / 2) + x * 4 + k]) - twin[(y * w + x) * 4 + k]) / Math.max(Math.abs(twin[(y * w + x) * 4 + k]), 0.05));
                return { worst };
            });
            ok("!! the TAA texture kernel (rgba16float history and frame, r32float depth, storage-texture output, rows flipped to upstream's y-up) equals the CPU resolve on the same images with a moving camera and a jittered ray: worst relative difference " + (taaK.worst * 100).toFixed(2) + "% (half-float output)", taaK.worst < 0.01);
            const flick = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, cam = { pos: [0, 2.2, -9], target: [0, 0.5, 0], fovY: 60 };
                const mean = async (taa) => { g.state.taa = true; g.state.resolve = taa; g.state.jitter = true; g.state.historyValid = 0; for (let i = 0; i < 6; i++) await g.frame(0.016, { x: 0, z: 0 }, cam, { present: false }); const shots = []; for (let i = 0; i < 6; i++) shots.push((await g.shot(0.016, { x: 0, z: 0 }, cam)).pixels);
                    let d = 0, n = 0; for (let i = 1; i < shots.length; i++) for (let k = 0; k < shots[i].length; k++) if (k % 4 !== 3) { d += Math.abs(shots[i][k] - shots[i - 1][k]); n++; } return d / n; };
                const off = await mean(false), on = await mean(true); g.state.taa = true; g.state.resolve = true; return { off, on };
            });
            ok("!! with a jittered camera held still the frame-to-frame change is " + flick.off.toFixed(3) + " grey levels with the jitter on and the resolve off, and " + flick.on.toFixed(3) + " with the resolve on (TAA integrates the jitter instead of flickering with it)", flick.on < flick.off * 0.7 && flick.off > 0.05);
            // ---- the sky dome the right way round
            const dome = await run(async () => {
                const S = window.__snowgpu, g = S.gpu; g.state.taa = false; g.state.jitter = false; g.state.historyValid = 0; g.setSun(13, 60); const sd = g.sun;
                const look = async (dir) => { const cam = { pos: [0, 40, 0], target: [dir[0] * 50, 40 + dir[1] * 50, dir[2] * 50], fovY: 60 }; await g.frame(0.016, { x: 0, z: 0 }, cam, { present: false }); const sh = await g.shot(0.016, { x: 0, z: 0 }, cam), w = sh.width, h = sh.height, px = (x, y) => Array.from(sh.pixels.slice((y * w + x) * 4, (y * w + x) * 4 + 3)); return { top: px(w >> 1, 4), mid: px(w >> 1, h >> 1) }; };
                const toward = await look([sd[0], 0.2, sd[2]]), away = await look([-sd[0], 0.2, -sd[2]]); g.state.taa = true; g.state.jitter = true;
                const lum = (p) => 0.3 * p[0] + 0.42 * p[1] + 0.28 * p[2];
                return { towardTop: toward.top, awayTop: away.top, towardMid: lum(toward.mid), awayMid: lum(away.mid) };
            });
            ok("!! the sky dome is the right way round: looking toward the sun is brighter at the horizon (" + dome.towardMid.toFixed(0) + ") than looking away (" + dome.awayMid.toFixed(0) + "), and the zenith is blue (b " + dome.towardTop[2] + " > r " + dome.towardTop[0] + ")", dome.towardMid > dome.awayMid + 10 && dome.towardTop[2] > dome.towardTop[0] && dome.awayTop[2] > dome.awayTop[0]);
            const errs = await run(() => window.__snowgpu.gpu.errors.slice());
            ok("!! no GPU error was raised (uncaptured validation or out-of-memory) in the whole run", errs.length === 0, errs.join(" | ").slice(0, 300));
        }
        ok("  no page or console error", pageErrs.length === 0, pageErrs.join(" | ").slice(0, 300));
    } finally { await browser.close(); server.close(); }
}

console.log(`\nsnowGpuTaa-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
