// WebGLEngine/tools/ship/splatRendererGPU-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/splatRendererGPU-selfcheck.mjs      (seconds to a minute on SwiftShader; each device case runs in its own child process)
//      node tools/ship/realGpuRun.mjs --native --only splatRendererGPU      (on a real GPU)
//
// THE WEBGPU SPLAT RENDERER, HELD. render/splatRendererGPU.mjs draws Gaussian splats straight from render/splatSortGPU.mjs's sorted index buffer. Three
// things hold it:
//
//   1  THE SHADER        it compiles; it carries engine/SplatRenderer.js's math term for term (the conic, the 3σ square, the one-pixel blur, the culls, the
//                        alpha floor and cap); it reads splat order[instance], not instance; it writes premultiplied colour for its blend
//   2  THE PICTURE       on node-webgpu: 40 overlapping splats at 96 x 96 against a CPU evaluation of exactly that math (f64, the same back-to-front order),
//                        pixel by pixel; and how far the WebGL2 renderer's unpremultiplied blend is from it. THE TIGHT SQUARES (2026-11-21): a faint 4,000-splat
//                        cloud drawn with the old 3σ squares and the tight ones is no further from the CPU's picture; the size cap does change pixels (so it
//                        is off); and on the card's own clock (render/gpuTimer.mjs) the draw pass takes at least 15% less (25% on SwiftShader). THE
//                        HARMONICS: a degree-3 cloud from two sides against the CPU's picture with render/splatSH.mjs's colour for each eye
//   3  THE ORDER         a near red splat over a far blue one: red on top from one side, and after the camera crosses to the other side WITHOUT re-uploading
//                        anything, blue on top -- the card re-sorted and the draw read the new order
//
// Device cases run in child processes and a SwiftShader abort is retried, for the reasons tools/ship/splatSortGPU-selfcheck.mjs's header gives; a wrong
// picture or a hang fails at once, and an abort every time fails.
//
// SABOTAGE LOG: 13 mutants of render/splatRendererGPU.mjs, each in a hard-linked copy of the tree: ALL 13 RED (the instance read instead of order[instance],
// straight colour under the premultiplied blend, no blur, the conic's sign, a 2σ square, the quaternion's order, scales not in log space, no sigmoid, never
// re-sorting after the first frame, the origin ignored, no alpha cap, an attribute unchecked, an additive blend). 2026-11-21, the tight squares: 6 more, ALL 6
// RED (k always 3, k too tight, the wrong floor in the log, the opacity cull too high, loose by default, the size cap ignored). The harmonics: 5 more, 4 RED
// (the direction reversed, the coefficient count not sent, the eye not placed, sh: false ignored); ONE GREEN AND EQUIVALENT HERE: the floor at 0 removed --
// an 8-bit unorm target clamps the fragment's output to 0..1 before blending, so a negative colour already lands at 0 (it would not on a float target).
// The speed check is a timing claim: run this gate on its own -- three copies at once on one machine starved SwiftShader and failed it for every mutant.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, FINE_CLOCK_FLAG } from "./headlessGpu.mjs";
import { createGpuTimer } from "../../render/gpuTimer.mjs";
import { viewColors } from "../../render/splatSH.mjs";
import * as R from "../../render/splatRendererGPU.mjs";
import * as C from "../../render/splatSort.mjs";

const require = createRequire(import.meta.url), SELF = fileURLToPath(import.meta.url), ENG = path.resolve(path.dirname(SELF), "..", "..");
const ATTEMPTS = 5, CASE_MS = 180000, W = 96, H = 96, NATIVE_ABORT = /futex|Fatal glibc|pthread|std::system_error|Invalid argument|Segmentation|Aborted/;

// ---- the scene and the camera, the same in the child and the parent ----
function lookAt(eye, at, up = [0, 1, 0]) {
    const sub = (a, b) => a.map((v, i) => v - b[i]), norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); }, cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const f = norm(sub(at, eye)), s = norm(cross(f, up)), u = cross(s, f);
    return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1]);   // column-major, as gl-matrix
}
function perspective(fovy, aspect, near, far) { const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far); return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]); }
/** 40 splats: a hashed spread of positions, sizes, colours, opacities and rotations. Pure. */
export function scene(n = 40) {
    const h = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    const s = { count: n, positions: new Float32Array(n * 3), scales: new Float32Array(n * 3), colors: new Float32Array(n * 3), opacities: new Float32Array(n), quats: new Float32Array(n * 4) };
    for (let i = 0; i < n; i++) {
        for (let k = 0; k < 3; k++) { s.positions[i * 3 + k] = (h(i * 7 + k) - 0.5) * 1.6; s.scales[i * 3 + k] = Math.log(0.05 + 0.25 * h(i * 11 + k)); s.colors[i * 3 + k] = h(i * 13 + k); }
        s.opacities[i] = (h(i * 17) - 0.3) * 4;
        const q = [h(i * 19) - 0.5, h(i * 19 + 1) - 0.5, h(i * 19 + 2) - 0.5, h(i * 19 + 3) - 0.5]; s.quats.set(q, i * 4);
    }
    return s;
}
export const CAMERA = Object.freeze({ eye: [0.4, 0.3, 3.2], at: [0, 0, 0], fovy: 0.9, origin: [0.1, -0.05, 0], scale: 1.1 });

/** engine/SplatRenderer.js's math in f64, every splat in the CPU sort's back-to-front order, composited per pixel. `premultiply` false is the WebGL2 blend. */
export function cpuRender(s, view, proj, { origin, scale, eye }, { premultiply = true } = {}) {
    const img = new Float64Array(W * H * 4), n = s.count, keys = new Float32Array(n);
    for (let i = 0; i < n; i++) { const d = [0, 1, 2].map((k) => s.positions[i * 3 + k] * scale + origin[k] - eye[k]); keys[i] = -(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]); }
    const order = C.radixSortIndices(keys, new Uint32Array(n), C.makeSortScratch(n));
    const V = (r, c) => view[c * 4 + r], P = (r, c) => proj[c * 4 + r];
    for (const i of order) {
        const wp = [0, 1, 2].map((k) => s.positions[i * 3 + k] * scale + origin[k]);
        const vp = [0, 1, 2, 3].map((r) => V(r, 0) * wp[0] + V(r, 1) * wp[1] + V(r, 2) * wp[2] + V(r, 3));
        const z = -vp[2]; if (z < 0.01) continue;
        let [qw, qx, qy, qz] = Array.from(s.quats.subarray(i * 4, i * 4 + 4)); const ql = Math.hypot(qw, qx, qy, qz); qw /= ql; qx /= ql; qy /= ql; qz /= ql;
        const w = qw, x = qx, y = qy, zz = qz;   // the shader's (w, x, y, z)
        const Rm = [[1 - 2 * (y * y + zz * zz), 2 * (x * y - w * zz), 2 * (x * zz + w * y)], [2 * (x * y + w * zz), 1 - 2 * (x * x + zz * zz), 2 * (y * zz - w * x)], [2 * (x * zz - w * y), 2 * (y * zz + w * x), 1 - 2 * (x * x + y * y)]];   // rows
        const sc = [0, 1, 2].map((k) => Math.exp(s.scales[i * 3 + k]) * scale);
        const M = Rm.map((row) => row.map((v, c) => v * sc[c]));
        const cov = [0, 1, 2].map((r) => [0, 1, 2].map((c) => M[r][0] * M[c][0] + M[r][1] * M[c][1] + M[r][2] * M[c][2]));
        const fx = P(0, 0), fy = P(1, 1);
        const J = [[fx / z, 0, -fx * vp[0] / (z * z)], [0, fy / z, -fy * vp[1] / (z * z)], [0, 0, 0]];   // rows
        const Wm = [0, 1, 2].map((r) => [0, 1, 2].map((c) => V(r, c)));
        const T = J.map((row) => [0, 1, 2].map((c) => row[0] * Wm[0][c] + row[1] * Wm[1][c] + row[2] * Wm[2][c]));
        const TC = T.map((row) => [0, 1, 2].map((c) => row[0] * cov[0][c] + row[1] * cov[1][c] + row[2] * cov[2][c]));
        const c2 = (r, c) => TC[r][0] * T[c][0] + TC[r][1] * T[c][1] + TC[r][2] * T[c][2];
        const blur = 2 / H, a = c2(0, 0) + blur, b = c2(0, 1), cc = c2(1, 1) + blur, det = a * cc - b * b; if (det <= 0) continue;
        const mid = 0.5 * (a + cc), disc = Math.max(0, mid * mid - det), radius = 3 * Math.sqrt(Math.max(mid + Math.sqrt(disc), mid - Math.sqrt(disc)));
        const clip = [0, 1, 3].map((r) => P(r, 0) * vp[0] + P(r, 1) * vp[1] + P(r, 2) * vp[2] + P(r, 3) * vp[3]), cx = clip[0] / clip[2], cy = clip[1] / clip[2];
        const conic = [cc / det, -b / det, a / det], opac = 1 / (1 + Math.exp(-s.opacities[i])), col = [0, 1, 2].map((k) => s.colors[i * 3 + k]);
        for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
            const dx = ((px + 0.5) / W) * 2 - 1 - cx, dy = 1 - ((py + 0.5) / H) * 2 - cy;
            if (Math.abs(dx) > radius || Math.abs(dy) > radius) continue;
            const power = -0.5 * (conic[0] * dx * dx + conic[2] * dy * dy) - conic[1] * dx * dy; if (power > 0) continue;
            const al = Math.min(0.99, opac * Math.exp(power)); if (al < 0.003) continue;
            const o = (py * W + px) * 4, f = premultiply ? al : 1;
            for (let k = 0; k < 3; k++) img[o + k] = Math.min(1, col[k] * f + img[o + k] * (1 - al));   // an 8-bit target holds no more than 1 after each blend (harmonics can push a colour past 1)
            img[o + 3] = al + img[o + 3] * (1 - al);
        }
    }
    return img;
}

// ---- THE CHILD: one device case, one JSON line ----
async function child(kind) {
    configureVulkanIcd(); const { mod } = resolveWebgpu(require);
    const gpu = mod.create([]), ad = await gpu.requestAdapter(), dev = await ad.requestDevice(), G = mod.globals || globalThis, info = ad.info || {};
    const adapter = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ") || "unknown";
    dev.pushErrorScope("validation");
    const target = dev.createTexture({ size: [W, H], format: "rgba8unorm", usage: G.GPUTextureUsage.RENDER_ATTACHMENT | G.GPUTextureUsage.COPY_SRC });
    const proj = perspective(CAMERA.fovy, W / H, 0.05, 50), padded = 256 * Math.ceil((W * 4) / 256);
    const shoot = async (r, eye, at = CAMERA.at) => {
        const view = lookAt(eye, at), enc = dev.createCommandEncoder();
        r.draw(enc, { view, proj, camera: eye, target: target.createView(), width: W, height: H, clear: [0, 0, 0, 0] });
        const rb = dev.createBuffer({ size: padded * H, usage: G.GPUBufferUsage.COPY_DST | G.GPUBufferUsage.MAP_READ });
        enc.copyTextureToBuffer({ texture: target }, { buffer: rb, bytesPerRow: padded }, [W, H]); dev.queue.submit([enc.finish()]);
        await rb.mapAsync(G.GPUMapMode.READ); const raw = new Uint8Array(rb.getMappedRange().slice(0)); rb.unmap(); rb.destroy();
        const img = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) img.set(raw.subarray(y * padded, y * padded + W * 4), y * W * 4); return { img, view };
    };
    let out;
    if (kind === "speed") {
        // THE CARD'S OWN CLOCK: the same faint cloud, 256 x 256, the draw pass timed by render/gpuTimer.mjs, loose squares and tight, frames interleaved, medians
        const gpu2 = mod.create([FINE_CLOCK_FLAG]), ad2 = await gpu2.requestAdapter(), d2 = await ad2.requestDevice({ requiredFeatures: ["timestamp-query"] }), S = 256;
        const tgt = d2.createTexture({ size: [S, S], format: "rgba8unorm", usage: G.GPUTextureUsage.RENDER_ATTACHMENT });
        const n = 6000, sc = scene(n); for (let i = 0; i < n; i++) { sc.opacities[i] = -4 + 2.5 * ((i * 0.618034) % 1); for (let k = 0; k < 3; k++) sc.scales[i * 3 + k] = Math.log(0.15); }
        const mk = (tight) => { const r = R.createSplatRendererGPU(d2, sc, { usage: G.GPUBufferUsage, mapMode: G.GPUMapMode, tight }); r.position = CAMERA.origin; r.scale = CAMERA.scale; return r; };
        const arms = { loose: mk(false), tight: mk(true) }, ms = { loose: [], tight: [] }, view = lookAt(CAMERA.eye, CAMERA.at), pr = perspective(CAMERA.fovy, 1, 0.05, 50);
        for (let f = 0; f < 24; f++) for (const a of f % 2 ? ["tight", "loose"] : ["loose", "tight"]) {
            const t = createGpuTimer(d2, { usage: G.GPUBufferUsage, mapMode: G.GPUMapMode }), enc = d2.createCommandEncoder();
            arms[a].draw(enc, { view, proj: pr, camera: CAMERA.eye, target: tgt.createView(), width: S, height: S, clear: [0, 0, 0, 0], timer: t }); t.finish(enc); d2.queue.submit([enc.finish()]);
            await d2.queue.onSubmittedWorkDone(); const st = await t.collect(); if (f >= 4 && st.labels.draw) ms[a].push(st.labels.draw.last); t.destroy();
        }
        const med = (v) => { const x = v.slice().sort((p, q) => p - q); return x.length ? x[x.length >> 1] : null; };
        out = { kind, looseMs: med(ms.loose), tightMs: med(ms.tight), frames: ms.loose.length };
    } else if (kind === "compile") {
        const ci = await dev.createShaderModule({ code: R.SPLAT_WGSL }).getCompilationInfo();
        out = { kind, errors: ci.messages.filter((m) => m.type === "error").map((m) => `${m.lineNum}:${m.linePos} ${m.message}`) };
    } else if (kind === "picture") {
        const s = scene(), r = R.createSplatRendererGPU(dev, s, { usage: G.GPUBufferUsage, mapMode: G.GPUMapMode }); r.position = CAMERA.origin; r.scale = CAMERA.scale;
        const { img, view } = await shoot(r, CAMERA.eye), ref = cpuRender(s, view, proj, { ...CAMERA }), refWebgl = cpuRender(s, view, proj, { ...CAMERA }, { premultiply: false });
        let sum = 0, max = 0, covered = 0, sumGl = 0, n = 0;
        for (let p = 0; p < W * H; p++) for (let k = 0; k < 4; k++) { const g = img[p * 4 + k] / 255, d = Math.abs(g - ref[p * 4 + k]); sum += d; max = Math.max(max, d); n++; if (k < 3) sumGl += Math.abs(Math.min(1, refWebgl[p * 4 + k]) - ref[p * 4 + k]); }
        for (let p = 0; p < W * H; p++) if (ref[p * 4 + 3] > 0.05) covered++;
        out = { kind, mean: sum / n, max, covered, meanWebglBlend: sumGl / (W * H * 3) };
    } else if (kind === "tight") {
        // THE SAME PICTURE, LESS FILL: a faint, overlapping cloud (most splats at opacity 0.02-0.2) drawn with the old 3-sigma squares and with the tight ones
        const n = 4000, s = scene(n); for (let i = 0; i < n; i++) { s.opacities[i] = -4 + 2.5 * ((i * 0.618034) % 1); for (let k = 0; k < 3; k++) s.scales[i * 3 + k] = Math.log(0.15); }
        for (let i = 0; i < 300; i++) s.opacities[i] = -7;   // under the floor (sigmoid < 0.003): never drawn
        let viewOf = null; const run = async (opts) => { const r = R.createSplatRendererGPU(dev, s, { usage: G.GPUBufferUsage, mapMode: G.GPUMapMode, ...opts }); r.position = CAMERA.origin; r.scale = CAMERA.scale; const { img, view } = await shoot(r, CAMERA.eye); viewOf = view; return img; };
        const loose = await run({ tight: false }), tightImg = await run({}), capped = await run({ maxRadiusPx: 4 });
        let same = 0, maxd = 0, capDiff = 0, sum = 0; for (let k = 0; k < loose.length; k++) { const d = Math.abs(loose[k] - tightImg[k]); if (d === 0) same++; sum += d; maxd = Math.max(maxd, d); capDiff += Math.abs(loose[k] - capped[k]); }
        const ref = cpuRender(s, viewOf, proj, { ...CAMERA }), errOf = (img) => { let e = 0; for (let k = 0; k < img.length; k++) e += Math.abs(img[k] / 255 - ref[k]); return e / img.length * 255; };
        out = { kind, looseErr: errOf(loose), tightErr: errOf(tightImg), identical: same / loose.length, maxDiff: maxd, meanDiff: sum / loose.length, capMean: capDiff / loose.length, defaultTight: R.createSplatRendererGPU(dev, scene(4), { usage: G.GPUBufferUsage, mapMode: G.GPUMapMode }).tight === true };
    } else if (kind === "sh") {
        // THE COLOUR FROM WHERE YOU STAND: the 40 splats with degree-3 harmonics (15 coefficients a channel, +-0.35), seen from two sides; each picture against
        // the CPU's f64 picture with render/splatSH.mjs's viewColors as each splat's colour, and against the same cloud drawn with sh: false
        const base = scene(), K = 15, sc = { ...base, shDegree: 3, sh: new Float32Array(base.count * K * 3) }, h = (i) => { const x = Math.sin(i * 3.1337 + 1.7) * 9631.123; return x - Math.floor(x); };
        for (let k = 0; k < sc.sh.length; k++) sc.sh[k] = (h(k) - 0.5) * 0.7;
        sc.colors = base.colors.map((v) => v * 0.3);   // dark base colours, so the harmonics push many channels below 0 and the floor is exercised
        const eyes = [CAMERA.eye, [-2.6, 1.2, 1.6]], res = [];
        for (const eye of eyes) {
            const mk = (o) => { const r = R.createSplatRendererGPU(dev, sc, { usage: G.GPUBufferUsage, mapMode: G.GPUMapMode, ...o }); r.position = CAMERA.origin; r.scale = CAMERA.scale; return r; };
            const r = mk({}), { img, view } = await shoot(r, eye), flat = await shoot(mk({ sh: false }), eye);
            const ref = cpuRender({ ...sc, colors: viewColors(sc, eye, { origin: CAMERA.origin, scale: CAMERA.scale }) }, view, proj, { ...CAMERA, eye });
            let sum = 0, max = 0, off = 0; for (let k = 0; k < img.length; k++) { const d = Math.abs(img[k] / 255 - ref[k]); sum += d; max = Math.max(max, d); off += Math.abs(img[k] - flat.img[k]); }
            res.push({ mean: sum / img.length * 255, max: max * 255, fromFlat: off / img.length, degree: r.shDegree });
        }
        out = { kind, views: res };
    } else if (kind === "order") {
        // a red splat at z +0.4 and a blue one at z -0.4, both opaque and wide, on the axis
        const s = { count: 2, positions: new Float32Array([0, 0, 0.4, 0, 0, -0.4]), scales: new Float32Array(6).fill(Math.log(0.3)), colors: new Float32Array([1, 0, 0, 0, 0, 1]), opacities: new Float32Array([6, 6]), quats: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]) };
        const r = R.createSplatRendererGPU(dev, s, { usage: G.GPUBufferUsage, mapMode: G.GPUMapMode }), c = ((H / 2) * W + W / 2) * 4;
        const front = await shoot(r, [0, 0, 3]), back = await shoot(r, [0, 0, -3]);
        out = { kind, front: Array.from(front.img.subarray(c, c + 4)), back: Array.from(back.img.subarray(c, c + 4)) };
    }
    const v = await dev.popErrorScope();
    console.log("RESULT " + JSON.stringify({ ...out, adapter, validation: v ? String(v.message || v) : null }));
    process.exit(0);
}

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const section = async (fn) => { try { await fn(); } catch (e) { ok(`!! the section THREW instead of answering: ${e.message}`, false, String(e.stack).split("\n")[1]); } };
const aborts = [];
function runCase(kind) {
    for (let a = 1; a <= ATTEMPTS; a++) {
        const r = spawnSync(process.execPath, [SELF, "--child", kind], { encoding: "utf8", timeout: CASE_MS });
        const line = (r.stdout || "").split("\n").find((l) => l.startsWith("RESULT "));
        if (line) return JSON.parse(line.slice(7));
        if (r.error && r.error.code === "ETIMEDOUT") return { kind, crashed: `ran past ${CASE_MS / 1000} s and was stopped` };
        const why = ((r.stderr || "") + (r.stdout || "")).trim().split("\n").filter(Boolean).pop() || `exit ${r.status} signal ${r.signal}`;
        if (!NATIVE_ABORT.test(why) && r.signal == null && r.status !== 134 && r.status !== 139) return { kind, crashed: why };
        aborts.push(`${kind}: ${why.slice(0, 90)}`);
    }
    return null;
}

if (process.argv[2] === "--child") await child(process.argv[3]);
else {
    console.log("splatRendererGPU-selfcheck -- Gaussian splats on WebGPU, drawn from the card's own sort\n");
    console.log("1. THE SHADER");
    await section(() => {
        const w = R.SPLAT_WGSL, gl = fs.readFileSync(path.join(ENG, "engine", "SplatRenderer.js"), "utf8");
        const terms = [["the near cull", /if \(z < 0\.01\)/], ["the one-pixel blur", /2\.0 \/ (u_viewport|F\.viewport)\.y/], ["the conic", /vec3(<f32>)?\(c, -b, a\) \/ det/], ["the 3-sigma radius", /3\.0 \* sqrt\(max\(|select\(3\.0, min\(3\.0, sqrt\(2\.0 \* log/], ["the determinant cull", /if \(det <= 0\.0\)/],
            ["the alpha cap", /min\(0\.99, v[._]opacity \* exp\(power\)\)/], ["the alpha floor", /if \(alpha < 0\.003\)/], ["the power", /-0\.5 \* \(v[._]conic\.x \* v[._]offset\.x \* v[._]offset\.x\s*\+\s*v[._]conic\.z \* v[._]offset\.y \* v[._]offset\.y\)\s*-\s*v[._]conic\.y \* v[._]offset\.x \* v[._]offset\.y/]];
        const missing = terms.filter(([, re]) => !re.test(w) || !re.test(gl)).map(([n]) => n);
        ok("!! engine/SplatRenderer.js's math, term for term, in both files: the near cull, the blur, the conic, the 3σ radius, the determinant cull, the alpha cap and floor, the power", missing.length === 0, missing.join(", "));
        ok("!! it reads splat order[instance] -- the card's sorted list -- never the instance itself", /let i = order\[ii\];/.test(w) && !/pos\[ii/.test(w) && /var<storage, read> order: array<u32>/.test(w));
        ok("!! it writes PREMULTIPLIED colour for its (one, one-minus-src-alpha) blend, and so, since 2026-11-21, does the WebGL2 renderer with the same blend", /return vec4<f32>\(v\.color \* alpha, alpha\)/.test(w) && /srcFactor: "one", dstFactor: "one-minus-src-alpha"/.test(fs.readFileSync(path.join(ENG, "render", "splatRendererGPU.mjs"), "utf8")) && /fragColor = vec4\(v_color \* alpha, alpha\)/.test(gl) && !/fragColor = vec4\(v_color, alpha\)/.test(gl) && /blendFunc\(gl\.ONE, gl\.ONE_MINUS_SRC_ALPHA\)/.test(gl));
        ok("!! a cloud with a missing or short attribute is refused by name", (() => { try { R.createSplatRendererGPU({}, { ...scene(4), quats: new Float32Array(3) }, { usage: {} }); return false; } catch (e) { return /splat\.quats/.test(e.message); } })());
    });
    const skip = headlessGpuSkipReason(require);
    if (skip) console.log(`\n2-3. SKIPPED: ${skip}`);
    else {
        console.log("2. THE PICTURE (node-webgpu)");
        await section(() => {
            const c = runCase("compile");
            ok("!! the shader compiles on the device", c && !c.crashed && c.errors.length === 0, c ? (c.crashed || c.errors.join("; ") || c.adapter) : "aborted every time");
            const p = runCase("picture");
            ok("!! THE PICTURE IS THE CPU'S: 40 splats at 96 x 96, mean difference under 1/255 a channel, none over 6/255, and the splats cover the frame", p && !p.crashed && !p.validation && p.mean < 1 / 255 && p.max <= 6 / 255 && p.covered > W * H * 0.2, p ? (p.crashed || `mean ${(p.mean * 255).toFixed(3)}/255, max ${(p.max * 255).toFixed(1)}/255, ${p.covered} px covered${p.validation ? " REJECTED " + p.validation : ""}`) : "aborted every time");
            if (p && !p.crashed) console.log(`  ----  measured, not held: the WebGL2 renderer's OLD unpremultiplied blend (before 2026-11-21) is ${(p.meanWebglBlend * 255).toFixed(1)}/255 a channel away from this picture on average -- the halo it had, fixed in engine/SplatRenderer.js the same day`);
        });
        await section(() => {
            const t = runCase("tight");
            ok("!! TIGHT SQUARES LOSE NOTHING: a faint overlapping cloud (4,000 splats) drawn with the old 3-sigma squares and the tight ones, both against the CPU's f64 picture -- the tight one is no further from it (within 0.05 of a level), and the two differ by rounding only (the offset is interpolated over a smaller quad: no byte by more than 2 levels, the mean under 0.2); tight is the default", t && !t.crashed && !t.validation && t.tightErr <= t.looseErr + 0.05 && t.maxDiff <= 2 && t.meanDiff < 0.2 && t.defaultTight, t ? JSON.stringify(t) : "aborted every time");
            ok("!! ...and the size cap, off by default, DOES change pixels when asked for (4 px), which is why it is not on", t && !t.crashed && t.capMean > 0.5, t && `capped: ${t.capMean.toFixed(2)} levels a channel away`);
        });
        await section(() => {
            const t = runCase("speed");
            ok("!! ...AND IT IS FASTER ON THE CARD'S OWN CLOCK: the draw pass of a faint 6,000-splat cloud at 256 x 256, timed by render/gpuTimer.mjs over 20 interleaved frames, takes at least 15% less with the tight squares", t && !t.crashed && t.frames >= 20 && t.tightMs > 0 && t.tightMs < 0.85 * t.looseMs, t && (t.crashed || `median draw ${t.looseMs.toFixed(2)} ms loose, ${t.tightMs.toFixed(2)} ms tight (${(100 * (1 - t.tightMs / t.looseMs)).toFixed(0)}% less) on ${t.adapter}`));
        });
        await section(() => {
            const t = runCase("sh");
            ok("!! SPHERICAL HARMONICS: a degree-3 cloud from two sides is, each time, the CPU's picture with render/splatSH.mjs's colour for that eye (mean under 1 level, none over 6), and visibly not the band-0 picture (over 2 levels a channel on average)", t && !t.crashed && !t.validation && t.views.length === 2 && t.views.every((v) => v.degree === 3 && v.mean < 1 && v.max <= 6 && v.fromFlat > 2), t && (t.crashed || JSON.stringify(t.views.map((v) => ({ mean: +v.mean.toFixed(3), max: +v.max.toFixed(1), fromFlat: +v.fromFlat.toFixed(2) })))));
        });
        console.log("3. THE ORDER");
        await section(() => {
            const o = runCase("order");
            ok("!! a near red splat over a far blue one: red on top from the front; from behind, with nothing re-uploaded, blue on top (the card re-sorted)", o && !o.crashed && !o.validation && o.front[0] > 200 && o.front[2] < 40 && o.back[2] > 200 && o.back[0] < 40, o ? JSON.stringify({ front: o.front, back: o.back, crashed: o.crashed }) : "aborted every time");
        });
        if (aborts.length) console.log(`  ----  the software renderer ABORTED ${aborts.length} time(s) and those runs were repeated: ${aborts.slice(0, 3).join(" | ")}`);
    }
    console.log(`\n${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
    process.exit(fails === 0 ? 0 : 1);
}
