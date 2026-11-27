// WebGLEngine/tools/ship/infiniteGrid-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/infiniteGrid-selfcheck.mjs      (under a minute: WebGPU in headless Chromium)
//
// THE GRID ON WEBGPU, HELD. render/infiniteGrid.mjs's WGSL (createGridGPU) drawn into a 320 x 200 target with a 0..1-depth camera, read back, against gridAlphaCPU:
//   where the CPU sum says a line is strong the pixel is the grid's; where it says nothing (nor beside it) the pixel is the clear colour exactly; above the horizon,
//   nothing; and with a depth buffer cleared NEARER than the plane on the left half, the left half shows no grid -- it writes and tests the plane's own depth.
//   (WebGL2's GLSL is held on gizmo-demo.html by tools/ship/gizmoOverlay-selfcheck.mjs.)
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PRESENT_ARGS } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { gridAlphaCPU } from "../../render/infiniteGrid.mjs";
import { invert4 } from "../../render/gizmo.mjs";
import { perspective, lookAt } from "../../render/gpuDriven.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const mul4 = (a, b) => { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const W = 320, H = 200, eye = [3, 2, 5], ZO = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1], vp = mul4(ZO, mul4(perspective(0.9, W / H, 0.1, 100), lookAt(eye, [0, 0, 0]))), inv = invert4(vp);
const P = { invViewProj: inv, eye, up: "y", cell: 0.5, major: 10, fade: 20, zRange: "zo" };
const PAGE = `<!doctype html><html><body><script type="module">
import { createGridGPU } from "/render/infiniteGrid.mjs";
const W = ${W}, H = ${H}, adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
window.__run = async (vp, inv, eye, nearLeft) => {
    const color = device.createTexture({ size: [W, H], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC }), depth = device.createTexture({ size: [W, H], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const grid = createGridGPU(device, "rgba8unorm", { depthFormat: "depth32float" }), errs = []; device.pushErrorScope("validation");
    const enc = device.createCommandEncoder();
    if (nearLeft) { const pass0 = enc.beginRenderPass({ colorAttachments: [{ view: color.createView(), loadOp: "clear", clearValue: [0.05, 0.06, 0.09, 1], storeOp: "store" }], depthStencilAttachment: { view: depth.createView(), depthLoadOp: "clear", depthClearValue: 1, depthStoreOp: "store" } }); pass0.end();
        // a wall of depth 0.01 over the left half, written by a scissored clear-by-draw: a full-screen triangle at depth 0.01, colour masked
        const m = device.createShaderModule({ code: "@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0; return vec4f(p, 0.01, 1.0); } @fragment fn fs() -> @location(0) vec4f { return vec4f(0.0); }" });
        const wall = device.createRenderPipeline({ layout: "auto", vertex: { module: m, entryPoint: "vs" }, fragment: { module: m, entryPoint: "fs", targets: [{ format: "rgba8unorm", writeMask: 0 }] }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "always" }, primitive: { topology: "triangle-list" } });
        const pw = enc.beginRenderPass({ colorAttachments: [{ view: color.createView(), loadOp: "load", storeOp: "store" }], depthStencilAttachment: { view: depth.createView(), depthLoadOp: "load", depthStoreOp: "store" } }); pw.setScissorRect(0, 0, W / 2, H); pw.setPipeline(wall); pw.draw(3); pw.end(); }
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: color.createView(), loadOp: nearLeft ? "load" : "clear", clearValue: [0.05, 0.06, 0.09, 1], storeOp: "store" }], depthStencilAttachment: { view: depth.createView(), depthLoadOp: nearLeft ? "load" : "clear", depthClearValue: 1, depthStoreOp: "store" } });
    grid.encode(pass, { invViewProj: inv, viewProj: vp, eye, cell: 0.5, major: 10, fade: 20, zRange: "zo" }); pass.end();
    const row = 256 * Math.ceil(W * 4 / 256), buf = device.createBuffer({ size: row * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    enc.copyTextureToBuffer({ texture: color }, { buffer: buf, bytesPerRow: row }, [W, H]); device.queue.submit([enc.finish()]);
    const e = await device.popErrorScope(); if (e) errs.push(e.message);
    await buf.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(buf.getMappedRange().slice(0)), px = []; for (let y = 0; y < H; y++) for (let x = 0; x < W * 4; x++) px.push(raw[y * row + x]); return { px, errs };
};
window.__ready = true;
<\/script></body></html>`;
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split("?")[0]); if (u === "/__grid.html") { r.writeHead(200, { "Content-Type": "text/html" }); return r.end(PAGE); } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": "text/javascript" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const { chromium } = resolvePlaywright(require), browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), pg = await browser.newPage(), pe = []; pg.on("pageerror", (e) => pe.push(e.message));
console.log("infiniteGrid-selfcheck -- the infinite grid on WebGPU\n");
try {
    await pg.goto(`http://127.0.0.1:${srv.address().port}/__grid.html`); await pg.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    const a = await pg.evaluate(([v, i, e]) => window.__run(v, i, e, false), [Array.from(vp), Array.from(inv), eye]), b = await pg.evaluate(([v, i, e]) => window.__run(v, i, e, true), [Array.from(vp), Array.from(inv), eye]);
    const at = (img, x, y) => img.slice((y * W + x) * 4, (y * W + x) * 4 + 3), BG = [13, 15, 23];
    const ratios = []; let strong = 0, shown = 0, empty = 0, exact = true, sky = 0, skyExact = true, leftGrid = 0, rightSame = true;
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const c = at(a.px, x, y), al = gridAlphaCPU(P, x, y, W, H), around = [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => gridAlphaCPU(P, x + dx, y + dy, W, H) === 0), isBg = c.every((v, i) => Math.abs(v - BG[i]) <= 1);
        const nx = ((x + 0.5) / W) * 2 - 1, ny = 1 - ((y + 0.5) / H) * 2, q0 = [0, 1, 2, 3].map((r) => inv[r] * nx + inv[4 + r] * ny + inv[12 + r]), q1 = [0, 1, 2, 3].map((r) => inv[r] * nx + inv[4 + r] * ny + inv[8 + r] + inv[12 + r]), up = q1[1] / q1[3] - q0[1] / q0[3] > 0;
        if (up) { sky++; if (!isBg) skyExact = false; }
        else if (al > 0.6) { strong++; if (!isBg) shown++; }
        if (!up && al > 0.15 && al < 0.6) { const g0 = [0, 1, 2, 3].map((r) => inv[r] * nx + inv[4 + r] * ny + inv[12 + r]), g1 = [0, 1, 2, 3].map((r) => inv[r] * nx + inv[4 + r] * ny + inv[8 + r] + inv[12 + r]), o = g0.map((v) => v / g0[3]), dd = g1.map((v, i) => v / g1[3] - o[i]), t = -o[1] / dd[1], gx = o[0] + dd[0] * t, gz = o[2] + dd[2] * t;
            if (Math.abs(gx) > 1 && Math.abs(gz) > 1) ratios.push(((c[1] - BG[1]) / (153 - BG[1])) / al); }
        else if (al === 0 && around) { empty++; if (!isBg) exact = false; }
        const d = at(b.px, x, y); if (x < W / 2 - 1) { if (!d.every((v, i) => Math.abs(v - BG[i]) <= 1)) leftGrid++; } else if (x > W / 2 + 1 && !d.every((v, i) => v === c[i])) rightSame = false;
    }
    ok("!! THE WGSL GRID BUILDS AND DRAWS with no validation error", a.errs.length === 0 && b.errs.length === 0 && pe.length === 0, [...a.errs, ...b.errs, ...pe].join("; "));
    ok("!! where the CPU sum says a line is strong the pixel is the grid's (nine in ten at least); where it says nothing the pixel is the clear colour; above the horizon, nothing", strong > 20 && shown >= 0.9 * strong && empty > 500 && exact && sky > 500 && skyExact, `${shown} of ${strong} strong; ${empty} empty; ${sky} sky`);
    ratios.sort((p2, q2) => p2 - q2); const med = ratios.length ? ratios[ratios.length >> 1] : 0;
    ok("!! THE BLEND IS THE SUM'S: on fainter line pixels away from the axes, the amount of grid colour in the pixel over the CPU sum's alpha is about 1 (median within 0.75 to 1.33)", ratios.length > 30 && med > 0.75 && med < 1.33, `median ${med.toFixed(3)} over ${ratios.length} pixels`);
    ok("!! IT WRITES AND TESTS THE PLANE'S DEPTH: behind a nearer wall over the left half no grid shows; the right half is the grid as before", leftGrid === 0 && rightSame, `${leftGrid} grid pixels behind the wall`);
} catch (e) { ok(`!! the check THREW instead of answering: ${e.message}`, false); }
await browser.close(); srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 3 mutants of render/infiniteGrid.mjs: ALL 3 RED -- the WGSL writing no depth, the WGSL not discarding the sky, and gridAlphaCPU's fade off by a factor of
// three (GREEN at first: the checks only asked strong or nothing; the measured blend over the sum's alpha is now held near 1).
