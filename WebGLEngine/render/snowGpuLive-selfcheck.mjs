// WebGLEngine/render/snowGpuLive-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowGpuLive-selfcheck.mjs
//
// THE LIVE LOOP OF THE SNOW FRAME: snow-gpu.html left to run on requestAnimationFrame, presenting to the canvas, until it has run 12 frames and 4 footprints over at least 3 s (120 s ceiling); it steps the walker, stamps footprints and raises no GPU
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
        await live.goto(base + "/snow-gpu.html"); await live.waitForFunction(() => window.__snowgpu && (window.__snowgpu.ready || window.__snowgpu.error), null, { timeout: 60000 });
        // v4896 -- WAIT FOR THE LOOP TO PROVE IT RUNS, NOT FOR NINE SECONDS TO PASS. The rig's first run (2026-10-23, Windows, the headless shell on a software adapter) got 4 frames in nine
        // seconds -- 0.4 fps, against the 11-15 fps this gate was written on -- and the row demanded more than 20, so a slow CPU rasteriser read as a dead loop. What the row is FOR is that the
        // requestAnimationFrame loop steps the walker, stamps footprints and presents without a GPU error; how fast it does so is a READING, printed below and kept by realGpuRun. So: at least
        // 12 frames and 4 footprints and 3 s of running (so a fast GPU's rate is read over enough frames), with a 120 s ceiling that a loop which really is dead still hits.
        // SABOTAGE: the page's frame loop stopped after its first frame -> RED by name at the 120 s ceiling ("0 frames in 120.0 s"); restored identical. A 25x CPU throttle did NOT slow the software rasteriser (7.9 fps), so it does not stand in for the rig's 0.4 fps: that case rests on the rig's own report.
        const t0 = await live.evaluate(() => { window.__t0 = performance.now(); return window.__snowgpu.frames; });
        let L = null, why = "";
        try {
            await live.waitForFunction(() => { const g = window.__snowgpu; return g.frames >= 12 && g.footprints >= 4 && performance.now() - window.__t0 >= 3000; }, null, { timeout: 120000, polling: 250 });
        } catch (e) { why = "the loop did not reach 12 frames and 4 footprints in 120 s: " + String(e).slice(0, 120); }
        L = await live.evaluate(() => ({ adapter: window.__snowgpu.adapter || "?", frames: window.__snowgpu.frames, fp: window.__snowgpu.footprints, errs: window.__snowgpu.gpu ? window.__snowgpu.gpu.errors.length : -1, secs: (performance.now() - window.__t0) / 1000 }));
        const ran = L.frames - t0, fps = ran / L.secs;
        ok("!! the live loop (requestAnimationFrame, presenting to the canvas) ran: " + ran + " frames in " + L.secs.toFixed(1) + " s, " + L.fp + " footprints, " + L.errs + " GPU errors", !why && ran >= 12 && L.fp >= 4 && L.errs === 0 && liveErrs.length === 0, (why + " " + liveErrs.join(" | ")).trim().slice(0, 240));
        // v4896 -- a TIMING reading for the real-hardware report (tools/ship/realGpuRun.mjs keeps "----" lines): the whole frame graph, presenting, at 320x180, on whatever adapter the browser found.
        // On the software adapter this is a CPU rasteriser's rate; on a D3D12 GPU it is the number that says whether the graph (deform, sky bake, 3 shadow passes, clipmap, TAA) is cheap.
        console.log("  ----  reading snowGpu: live loop " + ran + " frames in " + L.secs.toFixed(1) + " s (" + fps.toFixed(1) + " fps) at 320x180, " + L.fp + " footprints, adapter " + L.adapter);
        // v4896 -- RENDER SCALE ON THE REAL PAGE: snow-gpu.html?scale=0.5&shadow=1024 renders at half the canvas and makes a 1024 shadow map; the loop still runs, still presents, still raises no GPU error.
        // SABOTAGE: the page ignoring ?scale (rw/rh without the scale) -> the size row RED by name; restored.
        const sc = await browser.newPage({ viewport: { width: 320, height: 180 } }), scErrs = [];
        sc.on("pageerror", (e) => scErrs.push(String(e).slice(0, 300))); sc.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) scErrs.push(m.text().slice(0, 300)); });
        await sc.goto(base + "/snow-gpu.html?scale=0.5&shadow=1024"); await sc.waitForFunction(() => window.__snowgpu && (window.__snowgpu.ready || window.__snowgpu.error), null, { timeout: 60000 });
        let scWhy = ""; try { await sc.waitForFunction(() => window.__snowgpu.frames >= 4, null, { timeout: 120000, polling: 250 }); } catch (e) { scWhy = "the scaled loop did not reach 4 frames in 120 s"; }
        const Q = await sc.evaluate(() => { const g = window.__snowgpu; return { size: g.gpu.size, canvas: [document.getElementById("c").width, document.getElementById("c").height], shadow: g.shadowRes, shadowMap: g.gpu.stats.shadowRes, frames: g.frames, errs: g.gpu.errors.length, slider: document.getElementById("scale").value, label: document.getElementById("scalev").textContent }; });
        ok("!! the page at ?scale=0.5&shadow=1024 renders at half the canvas (" + Q.size.join("x") + " of " + Q.canvas.join("x") + ") with a " + Q.shadowMap + " px shadow map, the slider reads " + Q.label + ", and the loop runs (" + Q.frames + " frames) with " + Q.errs + " GPU errors",
            !scWhy && Q.size[0] === Math.round(Q.canvas[0] * 0.5) && Q.size[1] === Math.round(Q.canvas[1] * 0.5) && Q.shadowMap === 1024 && Q.slider === "50" && Q.frames >= 4 && Q.errs === 0 && scErrs.length === 0, (scWhy + " " + scErrs.join(" | ")).trim().slice(0, 240));
    } finally { await browser.close(); server.close(); }
}

console.log(`\nsnowGpuLive-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
