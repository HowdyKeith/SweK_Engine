// WebGLEngine/render/snowGpuField-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/snowGpuField-selfcheck.mjs
//
// ONE OF SIX GATES THAT TOGETHER ARE THE SNOW FRAME ON THE GPU (render/snowGpu.mjs, snow-gpu.html). It was one file, render/snowGpu-selfcheck.mjs, and took 38-57 s: past the quick sweep's
// 20 s cap, so no sweep or default rotation ever recorded it finishing, and gateBudget carried it as UNRESOLVED. MEASURED while splitting it: g.frame() only QUEUES the work, and
// the first readback pays ~9.5 s for SwiftShader to compile the sky-bake kernel, so EVERY page that reads anything back starts ~10 s in; the six gates are balanced so each is
// that plus under ~8 s of its own work. The browser rows are unchanged except where a part says otherwise. The six: snowGpu (maths, source, the core stages), snowGpuField (the
// compute-stepped deformation), snowGpuTaa (the TAA kernel, the flicker, the sky dome), snowGpuLookA (the shadow maps and cascades, fine relief, subsurface scattering),
// snowGpuLookB (glints) and snowGpuLive (the live loop and its rate). THIS ONE: the field stepped by the compute kernel equals a CPU DeformField given the same four brushes and a moving focus.
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

console.log("snowGpuField-selfcheck -- the compute-stepped deformation field against the CPU DeformField\n");
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
            // ---- the field: GPU kernel vs CPU DeformField given the same brushes and focus
            const fieldR = await run(async () => {
                const S = window.__snowgpu, g = S.gpu, T = await import("/render/toroidalDeform.mjs"), cpu = new T.DeformField({ res: g.deformRes, size: 20, windDirectionDeg: 40 });
                const stamps = [[3, 1, 0.5, 0.12, 0.08, 0.6, 0.3, 0.4, 1.8, 0], [-2, 4, 0.4, 0.1, 0.05, 0.5, 0, 1.1, 1, 0], [0.3, -1, 0.7, 0.15, 0.1, 0.8, 0.5, 0, 1, 0], [9.8, 0.2, 0.5, 0.1, 0.05, 0.5, 0, 0, 1, 0]];
                const focuses = Array.from({ length: 14 }, (_, i) => ({ x: i * 0.31, z: i * 0.12 })), cam = S.camFor();
                for (let i = 0; i < 14; i++) {
                    if (i === 2) for (const s of stamps) { g.stamp(...s); cpu.brush(...s); }
                    const dt = i % 5 === 4 ? 0.45 : 0.05;   // a banked step is spent on frames 4, 9, 14
                    await g.frame(dt, focuses[i], cam, { present: false }); cpu.update(dt, focuses[i]);
                }
                const gf = await g.readField(), w = [0, 0, 0, 0]; let nz = 0;
                for (let i = 0; i < gf.length; i++) { w[i % 4] = Math.max(w[i % 4], Math.abs(gf[i] - cpu.state[i])); if (cpu.state[i] !== 0) nz++; }
                return { worst: w, nonzero: nz, total: gf.length };
            });
            ok("!! the compute-stepped field equals a CPU DeformField given the same four brushes, focus moving over 14 frames, relaxation spent on three of them: per channel worst " + fieldR.worst.map((v) => v.toExponential(1)).join(", ") + " (" + fieldR.nonzero + " nonzero texels of " + fieldR.total / 4 + ")", fieldR.nonzero > 200 && fieldR.worst[0] < 2e-4 && fieldR.worst[2] < 2e-4 && fieldR.worst[3] < 2e-4 && fieldR.worst[1] < 5e-4);
            const errs = await run(() => window.__snowgpu.gpu.errors.slice());
            ok("!! no GPU error was raised (uncaptured validation or out-of-memory) in the whole run", errs.length === 0, errs.join(" | ").slice(0, 300));
        }
        ok("  no page or console error", pageErrs.length === 0, pageErrs.join(" | ").slice(0, 300));
    } finally { await browser.close(); server.close(); }
}

console.log(`\nsnowGpuField-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
