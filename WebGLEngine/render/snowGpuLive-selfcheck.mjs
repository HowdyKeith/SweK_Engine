// WebGLEngine/render/snowGpuLive-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowGpuLive-selfcheck.mjs
//
// THE LIVE LOOP OF THE SNOW FRAME: snow-gpu.html left to run on requestAnimationFrame, presenting to the canvas, for nine seconds; it steps the walker, stamps footprints and raises no GPU
// error. Split out of render/snowGpu-selfcheck.mjs at v4896 (see that file: the whole thing took 38-57 s, past the sweep's 20 s cap). It prints the frame rate as a "reading" line,
// which tools/ship/realGpuRun.mjs keeps in its report: on the software adapter about 11-15 fps at 320x180; on a D3D12 GPU, the first honest look at what the graph costs.
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

console.log("snowGpuLive-selfcheck -- the snow frame's live loop\n");
console.log("THE LIVE LOOP");
const skipWhy = webgpuSkipReason(require_);
if (skipWhy) {
    report("live half SKIPPED -- " + skipWhy);
    report("*** THAT IS A SKIP AND NOT A PASS: nothing here has shown one frame of the GPU path presenting");
} else {
    const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
    const server = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split("?")[0]), f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { s.writeHead(200, { "Content-Type": types[path.extname(f)] || "text/plain" }); return s.end(fs.readFileSync(f)); } s.writeHead(404); s.end("no"); });
    await new Promise((r) => server.listen(0, SECURE_HOST, r));
    const pw = resolvePlaywright(require_), browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
    const base = `http://${SECURE_HOST}:${server.address().port}`;
    try {
        const live = await browser.newPage({ viewport: { width: 320, height: 180 } }), liveErrs = [];
        live.on("pageerror", (e) => liveErrs.push(String(e).slice(0, 300))); live.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) liveErrs.push(m.text().slice(0, 300)); });
        await live.goto(base + "/snow-gpu.html"); await live.waitForFunction(() => window.__snowgpu && (window.__snowgpu.ready || window.__snowgpu.error), null, { timeout: 60000 }); await live.waitForTimeout(9000);
        const L = await live.evaluate(() => ({ adapter: window.__snowgpu.adapter || "?", frames: window.__snowgpu.frames, fp: window.__snowgpu.footprints, errs: window.__snowgpu.gpu ? window.__snowgpu.gpu.errors.length : -1, text: document.getElementById("stats").textContent }));
        ok("!! the live loop (requestAnimationFrame, presenting to the canvas) ran: " + L.frames + " frames in nine seconds, " + L.fp + " footprints, " + L.errs + " GPU errors", L.frames > 20 && L.fp >= 4 && L.errs === 0 && liveErrs.length === 0, liveErrs.join(" | ").slice(0, 200));
        // v4896 -- a TIMING reading for the real-hardware report (tools/ship/realGpuRun.mjs keeps "----" lines): the whole frame graph, presenting, at 320x180, on whatever adapter the browser found.
        // On the software adapter this is a CPU rasteriser's rate; on a D3D12 GPU it is the number that says whether the graph (deform, sky bake, 3 shadow passes, clipmap, TAA) is cheap.
        console.log("  ----  reading snowGpu: live loop " + L.frames + " frames in 9 s (" + (L.frames / 9).toFixed(1) + " fps) at 320x180, " + L.fp + " footprints, adapter " + L.adapter);
    } finally { await browser.close(); server.close(); }
}

console.log(`\nsnowGpuLive-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
