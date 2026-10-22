// WebGLEngine/render/snowGpuLookA-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowGpuLookA-selfcheck.mjs
//
// ONE OF SIX GATES THAT TOGETHER ARE THE SNOW FRAME ON THE GPU (render/snowGpu.mjs, snow-gpu.html). It was one file, render/snowGpu-selfcheck.mjs, and took 38-57 s: past the quick sweep's
// 20 s cap, so no sweep or default rotation ever recorded it finishing, and gateBudget carried it as UNRESOLVED. MEASURED while splitting it: g.frame() only QUEUES the work, and
// the first readback pays ~9.5 s for SwiftShader to compile the sky-bake kernel, so EVERY page that reads anything back starts ~10 s in; the six gates are balanced so each is
// that plus under ~8 s of its own work. The browser rows are unchanged except where a part says otherwise. The six: snowGpu (maths, source, the core stages), snowGpuField (the
// compute-stepped deformation), snowGpuTaa (the TAA kernel, the flicker, the sky dome), snowGpuLookA (the shadow maps and cascades, fine relief, subsurface scattering),
// snowGpuLookB (glints) and snowGpuLive (the live loop and its rate). THIS ONE: all three shadow maps hold terrain and the cascades describe the same shadows; the fine relief and detail normals are in the picture; subsurface scattering lights the snow into the sun.
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

console.log("snowGpuLookA-selfcheck -- the shadow maps and cascades, fine relief and subsurface scattering\n");
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
            // ---- the three shadow maps, and the cascades agreeing with each other
            const casc = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, d = g.device; g.state.taa = false; g.state.jitter = false; g.state.debug = 1; g.state.flat = false; g.setSun(8, 60); g.state.historyValid = 0;
                const covers = []; await g.frame(0.016, { x: 0, z: 0 }, S.camFor(), { present: false });
                for (let c = 0; c < 3; c++) { const bpr = 2048 * 4, rb = d.createBuffer({ size: bpr * 2048, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }), e = d.createCommandEncoder(); e.copyTextureToBuffer({ texture: g.shadowTex[c], aspect: "depth-only" }, { buffer: rb, bytesPerRow: bpr }, [2048, 2048]); d.queue.submit([e.finish()]); await rb.mapAsync(GPUMapMode.READ); const f = new Float32Array(rb.getMappedRange().slice(0)); let n = 0, mn = 1; for (let i = 0; i < f.length; i += 5) { if (f[i] < 1) n++; if (f[i] < mn) mn = f[i]; } rb.unmap(); rb.destroy(); covers.push([n / (f.length / 5), mn]); }
                const imgs = []; for (const k of [1, 2, 3]) { g.state.forceCascade = k; await g.frame(0.016, { x: 0, z: 0 }, S.camFor(), { present: false }); imgs.push((await g.shot(0.016, { x: 0, z: 0 }, S.camFor())).pixels); } g.state.forceCascade = 0;
                const sh = await g.shot(0.016, { x: 0, z: 0 }, S.camFor()), w = sh.width, h = sh.height, diff = (a, b) => { let s = 0, n = 0; for (let y = Math.floor(h * 0.7); y < h; y++) for (let x = 0; x < w; x++) { s += Math.abs(a[(y * w + x) * 4] - b[(y * w + x) * 4]); n++; } return s / n / 158; };
                const dark = (a) => { let s = 0, n = 0; for (let y = Math.floor(h * 0.7); y < h; y++) for (let x = 0; x < w; x++) { n++; if (a[(y * w + x) * 4] < 140) s++; } return s / n; };
                g.state.debug = 0; g.state.taa = true; g.state.jitter = true; g.setSun(13, 60);
                return { covers, d01: diff(imgs[0], imgs[1]), d02: diff(imgs[0], imgs[2]), d12: diff(imgs[1], imgs[2]), dark: imgs.map(dark) };
            });
            ok("!! all three shadow maps hold terrain at an 8 degree sun (texels written: " + casc.covers.map((c) => (c[0] * 100).toFixed(2) + "%").join(" / ") + " -- low because at a grazing sun the ground is edge-on to the light and fills a thin band of each map; nearest depth " + casc.covers.map((c) => c[1].toFixed(3)).join(" / ") + ")", casc.covers.every((c) => c[0] > 0.0005 && c[1] < 0.9));
            ok("!! the cascades describe the SAME shadows: reading each alone over the near ground, the visibility images differ by " + (casc.d01 * 100).toFixed(1) + "% (0 against 1), " + (casc.d12 * 100).toFixed(1) + "% (1 against 2) and " + (casc.d02 * 100).toFixed(1) + "% (0 against 2) of full visibility; the shadowed fraction is " + casc.dark.map((v) => (v * 100).toFixed(1) + "%").join(" / "), casc.d01 < 0.12 && casc.d12 < 0.12 && casc.dark.every((v) => Math.abs(v - casc.dark[0]) < 0.12));
            // 480x270 here (was 640x360 in the one-file gate): these two rows are ratios of means and local contrast, which hold at the smaller size and cost 2 s a shot at the larger one
            const shade = await run(async () => {
                const S = window.__snowgpu, g = S.gpu; g.rebuildSize(480, 270); g.state.taa = false; g.state.jitter = false; g.state.historyValid = 0; g.state.debug = 0; g.setSun(13, 60); const sd = g.sun;
                const lum = (p, i) => 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
                const take = async (cam, over) => { const old = {}; for (const k in over) { old[k] = g.state[k]; g.state[k] = over[k]; } g.state.frame = 100; await g.frame(0.016, { x: 0, z: 0 }, cam, { present: false }); g.state.frame = 101; const sh = await g.shot(0.016, { x: 0, z: 0 }, cam); for (const k in old) g.state[k] = old[k]; return sh; };   // the frame index feeds the shadow filter's dither, so both renders of a pair use the same one
                const toward = { pos: [0, 1.5, 0], target: [sd[0] * 20, 1.0, sd[2] * 20], fovY: 60 }, away = { pos: [0, 1.5, 0], target: [-sd[0] * 20, 1.0, -sd[2] * 20], fovY: 60 };
                const stats = (sh) => { const w = sh.width, h = sh.height; let sum = 0, n = 0, lap = 0, bright = 0; for (let y = Math.floor(h * 0.6); y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = (y * w + x) * 4, l = lum(sh.pixels, i); sum += l; n++; lap += Math.abs(4 * l - lum(sh.pixels, i - 4) - lum(sh.pixels, i + 4) - lum(sh.pixels, i - w * 4) - lum(sh.pixels, i + w * 4)); if (l > 235) bright++; } return { mean: sum / n, lap: lap / n, bright }; };
                const near = { pos: [0, 2.2, -9], target: [0, 0.5, 0], fovY: 60 };
                const base = stats(await take(near, {})), flatter = stats(await take(near, { sastrugi: 0, detail: 0 }));
                const tOn = stats(await take(toward, {})), tOff = stats(await take(toward, { sss: 0 })), aOn = stats(await take(away, {})), aOff = stats(await take(away, { sss: 0 }));
                g.rebuildSize(320, 180); g.state.taa = true; g.state.jitter = true;
                return { base, flatter, tOn, tOff, aOn, aOff };
            });
            ok("!! the fine relief and the detail normals are in the picture: the local contrast of the near ground is " + shade.base.lap.toFixed(2) + " grey levels with them and " + shade.flatter.lap.toFixed(2) + " with sastrugi and detail off (a ratio of " + (shade.base.lap / shade.flatter.lap).toFixed(2) + ")", shade.base.lap > shade.flatter.lap * 1.3);
            ok("!! subsurface scattering lights the snow looking INTO the sun and not looking away: mean luminance of the ground " + shade.tOff.mean.toFixed(1) + " -> " + shade.tOn.mean.toFixed(1) + " toward the sun (x" + (shade.tOn.mean / shade.tOff.mean).toFixed(3) + "), " + shade.aOff.mean.toFixed(1) + " -> " + shade.aOn.mean.toFixed(1) + " away (x" + (shade.aOn.mean / shade.aOff.mean).toFixed(3) + ")", shade.tOn.mean > shade.tOff.mean * 1.002 && shade.aOn.mean < shade.aOff.mean * 1.0005 && shade.tOn.mean / shade.tOff.mean > shade.aOn.mean / shade.aOff.mean + 0.002);
            const errs = await run(() => window.__snowgpu.gpu.errors.slice());
            ok("!! no GPU error was raised (uncaptured validation or out-of-memory) in the whole run", errs.length === 0, errs.join(" | ").slice(0, 300));
        }
        ok("  no page or console error", pageErrs.length === 0, pageErrs.join(" | ").slice(0, 300));
    } finally { await browser.close(); server.close(); }
}

console.log(`\nsnowGpuLookA-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
