// WebGLEngine/tools/ship/volumetricFog-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/volumetricFog-selfcheck.mjs      (about a minute: the CPU sums, then WebGL2 and WebGPU in headless Chromium)
//
// VOLUMETRIC FOG, HELD. render/volumetricFog.mjs:
//
//   1  THE SUM         fog of one density: the march IS the closed form, at any number of steps; height fog: 128 midpoint steps within 0.1% of the closed-form transmittance,
//                      for rays going up, down, level, and crossing the base height from below; the light added is exactly albedo * source * (1 - T); a scene the
//                      colour of the fog's own light (albedo 1) is left as it is; the jitter spreads 64 pixels' starts over [0, 1)
//   2  THE PHASE       Henyey-Greenstein integrates to 1 over the sphere and is brightest looking toward the light for g > 0 (forward scattering), flat for g = 0
//   3  WEBGL2          the GLSL pass over a known colour and DEPTH_COMPONENT32F texture (a ramp of depths and a band of sky), read back: every pixel within 2 levels of
//                      fogCPU's -- jitter, height, sky at maxDistance and all; again with maxDistance beyond the far plane
//   4  WEBGPU          the WGSL pass over a known colour and a depth32float written by a draw, read back: the same, with 0..1 depth
//   5  THE PAGE        gizmo-demo.html ?fog=1: the sky (nothing drawn there) is exactly fogCPU's at maxDistance; on the ground the fog's change grows with distance
//
// SABOTAGE LOG: see the bottom of this file.
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as F from "../../render/volumetricFog.mjs";
import { invert4 } from "../../render/gizmo.mjs";
import { perspective, lookAt } from "../../render/gpuDriven.mjs";
import { PRESENT_ARGS } from "./webgpuHarness.mjs";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require = createRequire(import.meta.url), ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };
const mul4 = (a, b) => { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const T4 = (m, v) => [0, 1, 2, 3].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
const W = 160, H = 100, EYE = [0.3, 1.6, 4.2], ZO = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1];
const PARAMS0 = { density: 0.12, falloff: 1.5, baseHeight: 0.2, albedo: 0.8, ambient: [0.35, 0.4, 0.45], lightDir: [0.4, 0.7, -0.5], lightColor: [0.3, 0.27, 0.22], g: 0.5, maxDistance: 40, steps: 24, jitter: true };
const PARAMS = PARAMS0, FAR_SKY = { ...PARAMS0, falloff: 0, density: 0.01, maxDistance: 150 };   // the sky past the far plane (100): only a sky sent to maxDistance gets this right
const depthAt = (x, yTop) => (yTop < H * 0.25 ? 1 : Math.fround(0.95 + 0.0499 * (x / W) + 0.0004 * (yTop / H)));   // a ramp of depths, the top quarter sky
const colorAt = (x, yTop) => [Math.round((x / W) * 255), Math.round((yTop / H) * 255), 128];
/** What fogCPU says for pixel (x, yTop), its jitter taken at the backend's own pixel coordinates (jy). */
function expected(vp, inv, x, yTop, jy, zo, PARAMS = PARAMS0) {
    const d = depthAt(x, yTop), nx = ((x + 0.5) / W) * 2 - 1, ny = 1 - ((yTop + 0.5) / H) * 2, w = T4(inv, [nx, ny, zo ? d : d * 2 - 1, 1]), p = w.slice(0, 3).map((v) => v / w[3]), f = T4(inv, [nx, ny, 1, 1]);
    const sky = d >= 1, dir = norm(sky ? f.slice(0, 3).map((v, i) => v / f[3] - EYE[i]) : p.map((v, i) => v - EYE[i])), dist = sky ? PARAMS.maxDistance : Math.hypot(...p.map((v, i) => v - EYE[i]));
    return F.fogCPU(PARAMS, { origin: EYE, dir, distance: dist, color: colorAt(x, yTop).map((v) => v / 255), px: x, py: jy }).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255));
}

console.log("volumetricFog-selfcheck -- volumetric fog\n");

console.log("1. THE SUM");
await section(() => {
    const flat = { ...PARAMS, falloff: 0, jitter: false }, o = [0, 1, 0];
    let worstFlat = 0; for (const steps of [1, 3, 32]) for (const d of [norm([1, 0.2, 0.3]), norm([0.2, -0.4, 1])]) { const T = F.transmittanceExact(flat, o, d, 25), c = F.fogCPU({ ...flat, steps }, { origin: o, dir: d, distance: 25, color: [0, 0, 0] }), S = F.sourceOf({ ...F.FOG_DEFAULTS, ...flat, L: norm(flat.lightDir) }, d); worstFlat = Math.max(worstFlat, ...c.map((v, i) => Math.abs(v - flat.albedo * S[i] * (1 - T)))); }
    ok("!! FOG OF ONE DENSITY: the march IS the closed form -- at 1, 3 and 32 steps the light added is albedo * source * (1 - e^(-density * distance)) to 1e-12", worstFlat < 1e-12, `worst ${worstFlat.toExponential(2)}`);
    const hp = { ...PARAMS, jitter: false, steps: 128 }, rays = [[[0, 1, 0], norm([1, 0.3, 0.2])], [[0, 3, 0], norm([0.5, -0.12, 1])], [[0, 1.2, 0], [1, 0, 0]], [[0, -0.5, 0], norm([0.3, 0.25, 1])]];
    let worstT = 0; for (const [or, d] of rays) { const T = F.transmittanceExact(hp, or, d, 30), c = F.fogCPU(hp, { origin: or, dir: d, distance: 30, color: [1, 1, 1] }), S = F.sourceOf({ ...F.FOG_DEFAULTS, ...hp, L: norm(hp.lightDir) }, d), Tm = (c[0] - hp.albedo * S[0]) / (1 - hp.albedo * S[0]); worstT = Math.max(worstT, Math.abs(Tm - T) / T); }
    ok("!! HEIGHT FOG: 128 midpoint steps land within 0.1% of the closed-form transmittance -- up, down, level, and from below the base height up through it", worstT < 1e-3, `worst ${(worstT * 100).toFixed(4)}%`);
    const S = F.sourceOf({ ...F.FOG_DEFAULTS, ...PARAMS, L: norm(PARAMS.lightDir) }, norm([1, 0.1, 0])), same = F.fogCPU({ ...PARAMS, albedo: 1 }, { origin: [0, 1, 0], dir: norm([1, 0.1, 0]), distance: 20, color: S });
    ok("!! a scene the colour of the fog's own light (albedo 1) is left as it is: the fog takes away exactly what it adds", same.every((v, i) => Math.abs(v - S[i]) < 1e-12));
    const js = Array.from({ length: 64 }, (_, k) => F.ign(k % 8, k >> 3));
    ok("!! the jitter (interleaved gradient noise) spreads 64 pixels' starts over [0, 1): every eighth of the range is used", js.every((v) => v >= 0 && v < 1) && [0, 1, 2, 3, 4, 5, 6, 7].every((b) => js.some((v) => Math.floor(v * 8) === b)));
});

console.log("2. THE PHASE");
await section(() => {
    let sum = 0; const N = 4000; for (let i = 0; i < N; i++) { const c = -1 + (2 * (i + 0.5)) / N; sum += F.phaseHG(c, 0.6) * 2 * Math.PI * (2 / N); }
    ok("!! Henyey-Greenstein integrates to 1 over the sphere (g 0.6), is brightest toward the light for g > 0, and flat for g = 0", Math.abs(sum - 1) < 1e-4 && F.phaseHG(1, 0.6) > F.phaseHG(0, 0.6) && F.phaseHG(0, 0.6) > F.phaseHG(-1, 0.6) && Math.abs(F.phaseHG(1, 0) - F.phaseHG(-1, 0)) < 1e-15, `integral ${sum.toFixed(6)}`);
});

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript" };
const PAGE = `<!doctype html><html><body><canvas id="c" width="${W}" height="${H}"></canvas><script type="module">
import { createFogGL, createFogGPU } from "/render/volumetricFog.mjs";
const W = ${W}, H = ${H}, depthAt = ${depthAt.toString().replace("(x, yTop) =>", "(x, yTop) =>")}, colorAt = ${colorAt.toString()};
window.__gl = (inv, eye, params) => {
    const gl = document.getElementById("c").getContext("webgl2", { preserveDrawingBuffer: true, antialias: false }), col = new Uint8Array(W * H * 4), dep = new Float32Array(W * H);
    for (let yb = 0; yb < H; yb++) for (let x = 0; x < W; x++) { const yt = H - 1 - yb, c = colorAt(x, yt); col.set([...c, 255], (yb * W + x) * 4); dep[yb * W + x] = depthAt(x, yt); }
    const tex = (ifmt, fmt, type, data) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, W, H, 0, fmt, type, data); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
    const ct = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, col), dt = tex(gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT, dep);
    gl.viewport(0, 0, W, H); createFogGL(gl).draw({ colorTex: ct, depthTex: dt, invViewProj: inv, eye, params, zRange: "gl" });
    const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); return { px: Array.from(px), err: gl.getError() };
};
window.__gpu = async (inv, eye, params) => {
    const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice(), errs = []; device.pushErrorScope("validation");
    const col = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) col.set([...colorAt(x, y), 255], (y * W + x) * 4);
    const color = device.createTexture({ size: [W, H], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST }); device.queue.writeTexture({ texture: color }, col, { bytesPerRow: W * 4 }, [W, H]);
    const depth = device.createTexture({ size: [W, H], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING }), out = device.createTexture({ size: [W, H], format: "rgba8unorm", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    // the depth pattern, written by a draw (depth32float cannot be written by a copy)
    const m = device.createShaderModule({ code: "@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0; return vec4f(p, 0.5, 1.0); } struct O { @builtin(frag_depth) d: f32 }; @fragment fn fs(@builtin(position) q: vec4f) -> O { let x = floor(q.x); let y = floor(q.y); var o: O; o.d = select(0.95 + 0.0499 * (x / ${W}.0) + 0.0004 * (y / ${H}.0), 1.0, y < ${H * 0.25}.0); return o; }" });
    const dp = device.createRenderPipeline({ layout: "auto", vertex: { module: m, entryPoint: "vs" }, fragment: { module: m, entryPoint: "fs", targets: [] }, depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "always" }, primitive: { topology: "triangle-list" } });
    const enc = device.createCommandEncoder(), p0 = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: depth.createView(), depthLoadOp: "clear", depthClearValue: 1, depthStoreOp: "store" } }); p0.setPipeline(dp); p0.draw(3); p0.end();
    createFogGPU(device, "rgba8unorm").encode(enc, out.createView(), { colorView: color.createView(), depthView: depth.createView(), invViewProj: inv, eye, params, zRange: "zo" });
    const row = 256 * Math.ceil(W * 4 / 256), buf = device.createBuffer({ size: row * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ }); enc.copyTextureToBuffer({ texture: out }, { buffer: buf, bytesPerRow: row }, [W, H]); device.queue.submit([enc.finish()]);
    const e = await device.popErrorScope(); if (e) errs.push(e.message);
    await buf.mapAsync(GPUMapMode.READ); const raw = new Uint8Array(buf.getMappedRange().slice(0)), px = []; for (let y = 0; y < H; y++) for (let x = 0; x < W * 4; x++) px.push(raw[y * row + x]); return { px, errs };
};
window.__ready = true;
<\/script></body></html>`;
const srv = http.createServer((q, r) => { const u = decodeURIComponent(q.url.split("?")[0]); if (u === "/__fog.html") { r.writeHead(200, { "Content-Type": "text/html" }); return r.end(PAGE); } const f = path.join(ENG, u); if (f.startsWith(ENG) && fs.existsSync(f) && fs.statSync(f).isFile()) { r.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); return r.end(fs.readFileSync(f)); } r.writeHead(404); r.end(); });
await new Promise((res) => srv.listen(0, "127.0.0.1", res));
const { chromium } = resolvePlaywright(require);
const compare = (px, vp, inv, zo, bottomUp, P = PARAMS0) => { let worst = 0, sky = 0, n = 0; for (let yt = 0; yt < H; yt++) for (let x = 0; x < W; x++) { const row = bottomUp ? H - 1 - yt : yt, got = px.slice((row * W + x) * 4, (row * W + x) * 4 + 3), want = expected(vp, inv, x, yt, bottomUp ? H - 1 - yt : yt, zo, P); worst = Math.max(worst, ...got.map((v, i) => Math.abs(v - want[i]))); n++; if (depthAt(x, yt) >= 1) sky++; } return { worst, sky, n }; };

console.log("3. WEBGL2 (ANGLE on SwiftShader)");
await section(async () => {
    const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), p = await browser.newPage(), pe = []; p.on("pageerror", (e) => pe.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/__fog.html`); await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
    const vp = mul4(perspective(0.9, W / H, 0.1, 100), lookAt(EYE, [0, 0.4, 0])), inv = invert4(vp), r = await p.evaluate(([i, e, pr]) => window.__gl(i, e, pr), [Array.from(inv), EYE, PARAMS]);
    const c = compare(r.px, vp, inv, false, true);
    ok("!! THE GLSL PASS IS fogCPU's: every one of 16,000 pixels within 2 levels -- a ramp of depths, the sky band at maxDistance, the jitter at WebGL2's bottom-up pixels", r.err === 0 && pe.length === 0 && c.worst <= 2 && c.sky > 3000, `worst ${c.worst} levels; ${c.sky} sky pixels; ${pe[0] || ""}`);
    const r2 = await p.evaluate(([i, e, pr]) => window.__gl(i, e, pr), [Array.from(inv), EYE, FAR_SKY]), c2 = compare(r2.px, vp, inv, false, true, FAR_SKY);
    ok("!! ...and with maxDistance (150) beyond the far plane (100), the sky is fogged to maxDistance, not to the far plane", r2.err === 0 && c2.worst <= 2, `worst ${c2.worst} levels`);
    await browser.close();
});

console.log("4. WEBGPU");
await section(async () => {
    const browser = await chromium.launch({ args: [...PRESENT_ARGS], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), p = await browser.newPage(), pe = []; p.on("pageerror", (e) => pe.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/__fog.html`); await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
    const vp = mul4(ZO, mul4(perspective(0.9, W / H, 0.1, 100), lookAt(EYE, [0, 0.4, 0]))), inv = invert4(vp), r = await p.evaluate(([i, e, pr]) => window.__gpu(i, e, pr), [Array.from(inv), EYE, PARAMS]);
    const c = compare(r.px, vp, inv, true, false);
    ok("!! THE WGSL PASS IS fogCPU's: every pixel within 2 levels, with 0..1 depth from a depth32float the page drew", r.errs.length === 0 && pe.length === 0 && c.worst <= 2 && c.sky > 3000, `worst ${c.worst} levels; ${[...r.errs, ...pe].join("; ")}`);
    await browser.close();
});

console.log("5. THE PAGE (gizmo-demo.html ?fog=1)");
await section(async () => {
    const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"], ...(HEADLESS_SHELL ? { executablePath: HEADLESS_SHELL } : {}) }), p = await browser.newPage({ viewport: { width: 640, height: 400 } }), pe = []; p.on("pageerror", (e) => pe.push(e.message));
    await p.goto(`http://127.0.0.1:${srv.address().port}/gizmo-demo.html?ease=0&fog=1&gputimer=0`); await p.waitForFunction(() => window.__gizmoDemo && window.__gizmoDemo.ready, null, { timeout: 60000 });
    await p.evaluate(() => { const s = window.__gizmoDemo; s.gridOn = false; s.controls.goal.pitch = 0.12; });
    await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const on = await p.evaluate(async () => { const s = window.__gizmoDemo; const c = await s.capture(); return { ...c, vp: s.viewProj, eye: s.eye, params: s.fogParams }; }).then((c) => ({ ...c, px: Buffer.from(c.b64, "base64") }));
    const off = await p.evaluate(async () => { const s = window.__gizmoDemo; s.fogOn = false; await new Promise((r) => requestAnimationFrame(r)); const c = await s.capture(); s.fogOn = true; return c; }).then((c) => ({ ...c, px: Buffer.from(c.b64, "base64") }));
    const boxAt = await p.evaluate(([w, h]) => { const s = window.__gizmoDemo, out = {}; for (let yb = 2; yb < h; yb += 5) for (let x = 2; x < w; x += 5) out[`${x},${yb}`] = s.pick(x + 0.5, h - 1 - yb + 0.5) >= 0; return out; }, [on.w, on.h]);
    const inv = invert4(on.vp), BG = [11, 15, 23].map((v) => v / 255); let sky = 0, skyWorst = 0; const ground = [];
    for (let yb = 2; yb < on.h; yb += 5) for (let x = 2; x < on.w; x += 5) {
        const nx = ((x + 0.5) / on.w) * 2 - 1, ny = ((yb + 0.5) / on.h) * 2 - 1, a = T4(inv, [nx, ny, -1, 1]), b = T4(inv, [nx, ny, 1, 1]), p0 = a.slice(0, 3).map((v) => v / a[3]), dir = norm(b.slice(0, 3).map((v, i) => v / b[3] - p0[i])), o = (yb * on.w + x) * 4;
        const got = on.px.slice(o, o + 3), was = off.px.slice(o, o + 3);
        if (dir[1] > 0.02) { const want = F.fogCPU(on.params, { origin: on.eye, dir, distance: on.params.maxDistance, color: BG, px: x, py: yb }).map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)); sky++; skyWorst = Math.max(skyWorst, ...got.map((v, i) => Math.abs(v - want[i]))); }
        else if (dir[1] < -0.02 && !boxAt[`${x},${yb}`]) { const t = -on.eye[1] / dir[1]; if (t < 50) ground.push([t, Math.abs(got[1] - was[1])]); }
    }
    const xs = ground.map((g) => g[0]), ys = ground.map((g) => g[1]), mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length, corr = xs.reduce((s, v, i) => s + (v - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((s, v) => s + (v - mx) ** 2, 0) * ys.reduce((s, v) => s + (v - my) ** 2, 0));
    ok("!! THE SKY (nothing drawn there) IS fogCPU's AT maxDistance, within 2 levels; no page error", sky > 200 && skyWorst <= 2 && pe.length === 0, `${sky} sky pixels, worst ${skyWorst}`);
    ok("!! ON THE BARE GROUND THE FOG'S CHANGE GROWS WITH DISTANCE (correlation over 0.8 between how far the ground is and how much the fog changed it)", ground.length > 200 && corr > 0.8, `${ground.length} ground pixels, correlation ${corr.toFixed(3)}`);
    await browser.close();
});

srv.close();
console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);

// SABOTAGE LOG: 13 mutants of render/volumetricFog.mjs, each in a hard-linked copy of the tree: ALL 13 RED -- the CPU step not energy-conserving, the density not falling
// with height, the closed form's split at the base height dropped, the phase not normalised, the phase's sign flipped, GLSL reading 0..1 depth as NDC, GLSL not sending the
// sky to maxDistance (GREEN at first: with the far plane beyond maxDistance the two agree; a run with maxDistance past the far plane now tells them apart), GLSL's jitter not
// at the pixel's corner, GLSL taking height on z for a y-up page, WGSL not attenuating the scene, WGSL treating 0..1 depth as -1..1, WGSL dropping the albedo, and the light
// colour divided by 4 pi a second time.
