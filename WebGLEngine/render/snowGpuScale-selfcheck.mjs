// WebGLEngine/render/snowGpuScale-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowGpuScale-selfcheck.mjs      (about 10 s on the software adapter)
//
// THE RENDER SCALE AND THE SHADOW SIZE ON THE REAL PAGE, split out of render/snowGpuLive-selfcheck.mjs at v4896 so each browser gate stays under the sweep's 20 s cap: snow-gpu.html at ?scale=0.5&shadow=1024 renders at half the canvas with a 1024
// px shadow map; its slider, moved on the running page, resizes the render and the loop carries on; ?scale=auto starts with the auto box ticked. The kernel under all of it is render/presentScale-selfcheck.mjs's, the rule
// behind auto is render/autoScale-selfcheck.mjs's.
//
// SABOTAGES, RESULTS BY NAME (each against snow-gpu.html, this gate run, restored identical): the page ignoring ?scale (rw/rh without the scale) -> the first row RED; the slider's handler not calling rebuildSize -> the run-time
// size row RED; ?scale=auto not ticking the box -> the auto row RED.
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

console.log("snowGpuScale-selfcheck -- the render scale on the real page\n");
const skipWhy = webgpuSkipReason(require_);
if (skipWhy) {
    report("scale half SKIPPED -- " + skipWhy);
    report("*** THAT IS A SKIP AND NOT A PASS: nothing here has shown the scaled page present one frame");
} else {
    const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
    const server = http.createServer((q, s) => { const u = decodeURIComponent(q.url.split("?")[0]), f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { s.writeHead(200, { "Content-Type": types[path.extname(f)] || "text/plain" }); return s.end(fs.readFileSync(f)); } s.writeHead(404); s.end("no"); });
    await new Promise((r) => server.listen(0, SECURE_HOST, r));
    const pw = resolvePlaywright(require_), browser = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: [...LAUNCH_ARGS] });
    const base = `http://${SECURE_HOST}:${server.address().port}`;
    try {
        // v4896 -- RENDER SCALE ON THE REAL PAGE: snow-gpu.html?scale=0.5&shadow=1024 renders at half the canvas and makes a 1024 shadow map; the loop still runs, still presents, still raises no GPU error.
        // SABOTAGE: the page ignoring ?scale (rw/rh without the scale) -> the size row RED by name; restored.
        const sc = await browser.newPage({ viewport: { width: 320, height: 180 } }), scErrs = [];
        sc.on("pageerror", (e) => scErrs.push(String(e).slice(0, 300))); sc.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) scErrs.push(m.text().slice(0, 300)); });
        await sc.goto(base + "/snow-gpu.html?scale=0.5&shadow=1024"); await sc.waitForFunction(() => window.__snowgpu && (window.__snowgpu.ready || window.__snowgpu.error), null, { timeout: 60000 });
        let scWhy = ""; try { await sc.waitForFunction(() => window.__snowgpu.frames >= 4, null, { timeout: 120000, polling: 250 }); } catch (e) { scWhy = "the scaled loop did not reach 4 frames in 120 s"; }
        const Q = await sc.evaluate(() => { const g = window.__snowgpu; return { size: g.gpu.size, canvas: [document.getElementById("c").width, document.getElementById("c").height], shadow: g.shadowRes, shadowMap: g.gpu.stats.shadowRes, frames: g.frames, errs: g.gpu.errors.length, slider: document.getElementById("scale").value, auto: document.getElementById("auto").checked, label: document.getElementById("scalev").textContent }; });
        ok("!! the page at ?scale=0.5&shadow=1024 renders at half the canvas (" + Q.size.join("x") + " of " + Q.canvas.join("x") + ") with a " + Q.shadowMap + " px shadow map, the slider reads " + Q.label + ", and the loop runs (" + Q.frames + " frames) with " + Q.errs + " GPU errors",
            !scWhy && Q.size[0] === Math.round(Q.canvas[0] * 0.5) && Q.size[1] === Math.round(Q.canvas[1] * 0.5) && Q.shadowMap === 1024 && Q.slider === "50" && Q.auto === false && Q.frames >= 4 && Q.errs === 0 && scErrs.length === 0, (scWhy + " " + scErrs.join(" | ")).trim().slice(0, 240));
        // v4896 -- THE SLIDER AT RUN TIME, AND AUTO MODE'S START. The slider calls gpu.rebuildSize on the running page: the size changes, the history restarts, the loop carries on without a GPU error. And ?scale=auto starts at
        // 100% with the auto box ticked (the rule that lowers it is render/autoScale-selfcheck.mjs's; on this box's software rasteriser it takes minutes to act, so it is not waited for here).
        // v4897 -- AUTO IS THE DEFAULT (the Intel gen-9 trial said it "looks and runs great"): the page with no query starts ticked, and a fixed ?scale=0.5 starts unticked.
        // SABOTAGES: the slider's handler no longer calling rebuildSize -> the run-time size row RED by name; the page's default put back to off (autoOn only for ?scale=auto) -> the default row RED; autoOn true whatever the query -> the half-scale row RED (auto ticked on a fixed size); restored.
        const f0 = await sc.evaluate(() => window.__snowgpu.frames);
        await sc.evaluate(() => { const e = document.getElementById("scale"); e.value = "70"; e.dispatchEvent(new Event("input", { bubbles: true })); });
        let rbWhy = ""; try { await sc.waitForFunction((f) => window.__snowgpu.frames >= f + 4, f0, { timeout: 120000, polling: 250 }); } catch (e) { rbWhy = "the loop did not carry on after the slider moved"; }
        const R = await sc.evaluate(() => ({ size: window.__snowgpu.gpu.size, canvas: [document.getElementById("c").width, document.getElementById("c").height], errs: window.__snowgpu.gpu.errors.length, label: document.getElementById("scalev").textContent }));
        ok("!! the slider moved to 70% on the running page resizes the render to " + R.size.join("x") + " of " + R.canvas.join("x") + " (" + R.label + "), the loop carries on and raises " + R.errs + " GPU errors",
            !rbWhy && R.size[0] === Math.round(R.canvas[0] * 0.7) && R.size[1] === Math.round(R.canvas[1] * 0.7) && R.errs === 0 && scErrs.length === 0, (rbWhy + " " + scErrs.join(" | ")).trim().slice(0, 240));
        const au = await browser.newPage({ viewport: { width: 320, height: 180 } }), auErrs = [];
        au.on("pageerror", (e) => auErrs.push(String(e).slice(0, 300)));
        await au.goto(base + "/snow-gpu.html"); await au.waitForFunction(() => window.__snowgpu && (window.__snowgpu.ready || window.__snowgpu.error), null, { timeout: 60000 });
        let auWhy = ""; try { await au.waitForFunction(() => window.__snowgpu.frames >= 3, null, { timeout: 120000, polling: 250 }); } catch (e) { auWhy = "the auto page did not reach 3 frames"; }
        const A = await au.evaluate(() => ({ auto: document.getElementById("auto").checked, slider: document.getElementById("scale").value, size: window.__snowgpu.gpu.size, canvas: [document.getElementById("c").width, document.getElementById("c").height] }));
        ok("!! THE DEFAULT PAGE (no query) starts with the auto box ticked (v4897: on by default; ?scale=auto is the same expression), the slider at 100% and the render at full size, and the loop runs", !auWhy && A.auto === true && A.slider === "100" && A.size[0] === A.canvas[0] && A.size[1] === A.canvas[1] && auErrs.length === 0, (auWhy + " " + auErrs.join(" | ")).trim().slice(0, 200));
    } finally { await browser.close(); server.close(); }
}

console.log(`\nsnowGpuScale-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
