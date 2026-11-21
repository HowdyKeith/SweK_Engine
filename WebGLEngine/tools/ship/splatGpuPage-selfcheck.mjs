// WebGLEngine/tools/ship/splatGpuPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/splatGpuPage-selfcheck.mjs      (about a minute: the page opened twice in a headless browser)
//
// THE SPLAT PAGE ON THE GRAPHICS CARD, HELD. splat-gpu.html draws a splat cloud with render/splatRendererGPU.mjs (sorted and drawn on the card) and, without
// WebGPU or with ?backend=webgl2, with engine/SplatRenderer.js (sorted on the CPU). Both now use the same covariance math and the same premultiplied
// blend, so ON ONE RASTERISER THEY SHOULD DRAW THE SAME PICTURE -- which is what this holds:
//
//   1  THE PAGE     it loads the WebGPU renderer and the WebGL2 one, the generated clouds and the file parser; it falls back to WebGL2 when WebGPU fails
//   2  WEBGPU       the page comes up on WebGPU, draws frames with no page error, and its frame (read back from the frame itself) covers the cloud
//   3  ONE PICTURE  the same cloud on ?backend=webgl2, sampled on the same 32 x 20 grid: within a few levels of the WebGPU frame
//
// THE FLAGS ARE tools/ship/webgpuHarness.mjs's PRESENT_ARGS: on Linux the only set measured to PRESENT a WebGPU canvas (with --enable-unsafe-webgpu alone the
// device is lost on the first read-back, "A valid external Instance reference no longer exists" -- seen again here). Section 3 asserts only where both
// backends are SwiftShader (Linux); on Windows PRESENT_ARGS puts WebGPU on SwiftShader and WebGL2 on the GPU, two rasterisers, so it reports there.
//
// SABOTAGE LOG: 8 mutants of splat-gpu.html, each in a hard-linked copy of the tree: 7 RED (an opaque canvas, always WebGL2, no fallback, WebGL2's rows
//   unflipped, WebGL2 drawn from another camera, the loop never stopped, WebGPU clearing and drawing nothing). ONE GREEN AND EQUIVALENT ON THIS BOX: the
//   blue and red bytes of a BGRA canvas left unswapped -- this box's preferred canvas format is rgba8unorm (printed in section 2), so that branch never
//   runs here; on a box that prefers bgra8unorm (Windows, macOS) section 3 REPORTS rather than asserts, so a swapped picture would show there as a large difference, not as a red row.
"use strict";
import fs from "node:fs";
import os from "node:os";
import { writePly } from "../../engine/plyWriter.mjs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PRESENT_ARGS, webgpuSkipReason } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".."), PAGE = path.join(ENG, "splat-gpu.html");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };

console.log("splatGpuPage-selfcheck -- splat-gpu.html, sorted and drawn on the card, held to the WebGL2 renderer\n");

console.log("1. THE PAGE");
await section(() => {
    const src = fs.readFileSync(PAGE, "utf8");
    ok("!! it imports the WebGPU renderer, the WebGL2 renderer, the generators and the file parser, by relative path", ['import { createSplatRendererGPU } from "./render/splatRendererGPU.mjs"', 'import { SplatRenderer } from "./engine/SplatRenderer.js"', 'from "./engine/splatGenerator.js"', 'import { parseSplatFile } from "./engine/splatParser.js"'].every((s) => src.includes(s)));
    ok("!! it falls back to WebGL2 when WebGPU fails, and says why; ?backend=webgl2 forces it; ?still stops the loop for a screenshot", /try \{ draw = await useWebGPU\(splat\); state\.backend = "webgpu"; return; \} catch \(e\) \{ state\.fallback =/.test(src) && /draw = useWebGL2\(splat\); state\.backend = "webgl2";/.test(src)
        && /Q\.get\("backend"\) === "webgl2"/.test(src) && /STILL > 0 && state\.frames >= STILL/.test(src));
    ok("!! the canvas is configured premultiplied, as the renderer's blend writes it, and can be read back", /alphaMode: "premultiplied", usage: GPUTextureUsage\.RENDER_ATTACHMENT \| GPUTextureUsage\.COPY_SRC/.test(src) && /bgra/.test(src));
});

const skip = webgpuSkipReason(require);
if (skip) console.log(`\n2-3. SKIPPED: ${skip}`);
else {
    const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };
    const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "splatpage-"));
    const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split("?")[0]); if (u.startsWith("/__tmp/")) { const t = path.join(TMP, path.basename(u)); if (fs.existsSync(t)) { r.writeHead(200, { "Content-Type": "application/octet-stream" }); return r.end(fs.readFileSync(t)); } } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
    await new Promise((res) => srv.listen(0, "127.0.0.1", res));
    const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) });
    const open = async (be, extra = "") => {
        const p = await browser.newPage({ viewport: { width: 320, height: 200 } }), errors = []; p.on("pageerror", (e) => errors.push(e.message));
        await p.goto(`http://127.0.0.1:${srv.address().port}/splat-gpu.html?n=20000&still=3${be ? "&backend=" + be : ""}${extra}`);
        await p.waitForFunction(() => window.__splatGpu && (window.__splatGpu.stopped || window.__splatGpu.error), null, { timeout: 90000 });
        const r = await p.evaluate(async () => { const s = window.__splatGpu; return { state: { shDegree: s.shDegree || 0, hud: document.getElementById("hud") ? document.getElementById("hud").textContent : "", ready: s.ready, backend: s.backend, count: s.count, frames: s.frames, error: s.error, adapter: s.adapter || null, format: s.format || null, fallback: s.fallback || null }, cap: s.error ? null : await s.capture() }; });
        await p.close(); return { ...r, errors };
    };
    let gpu = null, gl = null;
    console.log("2. WEBGPU");
    await section(async () => {
        gpu = await open("");
        ok("!! the page comes up ON WEBGPU (no fallback), draws its frames, with no page error", gpu.state.backend === "webgpu" && !gpu.state.fallback && gpu.state.frames >= 3 && gpu.state.ready && !gpu.state.error && gpu.errors.length === 0, JSON.stringify({ ...gpu.state, errors: gpu.errors.slice(0, 2) }));
        ok("!! its frame, read back from the frame itself, covers the cloud: between a fifth and nine tenths of it is not background", gpu.cap && gpu.cap.lit > 0.2 && gpu.cap.lit < 0.9 && gpu.cap.w === 320, gpu.cap ? `${(gpu.cap.lit * 100).toFixed(1)}% lit, ${gpu.cap.w} x ${gpu.cap.h}` : "no capture");
    });
    console.log("3. ONE PICTURE");
    await section(async () => {
        gl = await open("webgl2");
        let mean = null, max = null;
        if (gpu && gpu.cap && gl.cap) { let sum = 0; max = 0; for (let i = 0; i < gpu.cap.grid.length; i++) { const d = Math.abs(gpu.cap.grid[i] - gl.cap.grid[i]); sum += d; max = Math.max(max, d); } mean = sum / gpu.cap.grid.length; }
        ok("!! the WebGL2 renderer draws the same cloud with no page error", gl.state.backend === "webgl2" && !gl.state.error && gl.errors.length === 0 && gl.cap && gl.cap.lit > 0.2, JSON.stringify({ ...gl.state, errors: gl.errors.slice(0, 2) }));
        const detail = mean == null ? "nothing to compare" : `on the 32 x 20 grid: mean ${mean.toFixed(2)}, worst ${max} of 255 a channel; lit ${(gpu.cap.lit * 100).toFixed(1)}% against ${(gl.cap.lit * 100).toFixed(1)}%`;
        if (process.platform === "linux") ok("!! ONE PICTURE: the card's sort and draw against the CPU's sort and WebGL2's draw, within 1 level on average and 8 at worst", mean != null && mean <= 1 && max <= 8, detail);
        else console.log(`  ----  reported, not asserted (two rasterisers under ${PRESENT_ARGS.join(" ")}): ${detail}`);
    });
    console.log("4. A CAPTURE WITH HARMONICS");
    await section(async () => {
        // 3,000 splats with degree-3 harmonics, written by engine/plyWriter.mjs, opened by URL: the page reads f_rest, says so, and draws it differently from band 0
        const hh = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
        fs.writeFileSync(path.join(TMP, "sh.ply"), writePly(Array.from({ length: 3000 }, (_, i) => ({ x: (hh(i) - 0.5) * 3, y: (hh(i + 1e4) - 0.5) * 3, z: (hh(i + 2e4) - 0.5) * 3, scale: [-3, -3, -3], rot: [1, 0, 0, 0], color: [0, 0, 0], opacity: 2, rest: Array.from({ length: 45 }, (_, r) => (hh(i * 50 + r) - 0.5) * 2) }))));
        const a = await open(null, "&ply=/__tmp/sh.ply"), b = await open(null, "&ply=/__tmp/sh.ply&sh=0");
        let diff = 0; if (a.cap && b.cap) for (let k = 0; k < a.cap.grid.length; k++) diff += Math.abs(a.cap.grid[k] - b.cap.grid[k]);
        ok("!! ?ply= opens a .ply with f_rest: 3,000 splats, harmonics to degree 3 on the status line, no page error", a.state.count === 3000 && a.state.shDegree === 3 && /harmonics to degree 3/.test(a.state.hud) && !a.state.error && a.errors.length === 0, JSON.stringify({ count: a.state.count, sh: a.state.shDegree, error: a.state.error, errors: a.errors }));
        ok("!! ...and ?sh=0 draws band 0 only, a visibly different picture (over 4 levels a sample on average)", b.state.shDegree === 0 && !/harmonics/.test(b.state.hud) && diff / (a.cap ? a.cap.grid.length : 1) > 4, `${(diff / (a.cap ? a.cap.grid.length : 1)).toFixed(1)} levels a sample apart`);
    });
    await browser.close(); srv.close(); fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
