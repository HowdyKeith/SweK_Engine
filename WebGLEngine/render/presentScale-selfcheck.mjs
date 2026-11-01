// WebGLEngine/render/presentScale-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// Run: node render/presentScale-selfcheck.mjs      (about 9 s on the software adapter, most of it the sky-bake compile on the first frame)
//
// GATES RENDER SCALE: snowGpu's present pass (PRESENT_WGSL) reading a render target at (render size / output size) BILINEARLY, so the frame can render at 75% or 50% of the canvas and still fill it. Two halves, on a native
// device (this file makes its own with resolveWebgpu, so tools/ship/realGpuRun.mjs's `--native --only render/` runs it on D3D12 on the Windows rig, where the readings below are the first on a real GPU):
//   1  THE KERNEL AGAINST ITS TWIN: PRESENT_WGSL itself, run on a 4x3 rgba16float source with distinct values at output sizes that give ratios 1, 1/2, 3/4 and 1/3, held to a CPU twin (the same bilinear taps, clamped to the
//      target, the same tone map, rounded to 8 bits) within ONE level. Ratio 1 must be the single textureLoad it replaces (the case every earlier snow gate depends on).
//   2  THE PIPELINE, END TO END: createSnowGpu renders a frame at 80x45 and `shot` presents it at 80x45 and at 160x90 (outW/outH); the two are the same picture at two sizes.
// Each worst difference is printed as a `reading` line (the margin against the one-level limit) for the real-hardware report.
//
// SABOTAGES, RESULTS BY NAME (each against render/snowGpu.mjs, this gate run, restored identical):
//   S1 the sample position drops the half-texel (q = p * ratio, not p * ratio - 0.5)  -> 6 RED: all five kernel rows (ratio 1 reads the neighbour too) and the ratio-1 identity row's twin
//   S2 the taps are not clamped to the target (the last column reads past it)         -> 4 RED: the four ratios under 1, whose last output pixels reach beyond the edge; ratio 1 never does
//   S3 the ratio is ignored (the sample position uses the output pixel as is)          -> 4 RED: the four ratios under 1; ratio 1 is untouched, which is why it cannot see this
//   S4 the shot ignores outW/outH                                                      -> 2 RED: the pipeline size row and the smoothed-upsample row
"use strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolveWebgpu, configureVulkanIcd, headlessGpuSkipReason, noteNativeAdapter, doubleToHalf, halfToDouble, reading, exitCleanly } from "../tools/ship/headlessGpu.mjs";
import { createSnowGpu, PRESENT_WGSL } from "./snowGpu.mjs";
import { orbitAt } from "./snowFrameTiming.mjs";

const require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

console.log("presentScale-selfcheck -- the present pass at a render scale\n");

// the CPU twin of PRESENT_WGSL: out pixel (px, py) reads the source at ((px + 0.5) * rx - 0.5, ...), bilinear over clamped taps, times exposure, c / (1 + c), gamma 1/2.2, rounded to 8 bits
const SRC_W = 4, SRC_H = 3;
const src = []; for (let y = 0; y < SRC_H; y++) for (let x = 0; x < SRC_W; x++) src.push([0.15 + 0.3 * x + 0.05 * y, 0.9 - 0.2 * x + 0.1 * y, 0.05 + 0.1 * x * y]);
const half = (v) => doubleToHalf(v);
const tap = (x, y) => src[Math.min(SRC_H - 1, Math.max(0, y)) * SRC_W + Math.min(SRC_W - 1, Math.max(0, x))].map((v) => halfToDouble(half(v)));   // the value after the half-float round trip the GPU texture applies
function twin(outW, outH, exposure) {
    const rx = SRC_W / outW, ry = SRC_H / outH, out = new Uint8Array(outW * outH * 4);
    for (let py = 0; py < outH; py++) for (let px = 0; px < outW; px++) {
        const qx = (px + 0.5) * rx - 0.5, qy = (py + 0.5) * ry - 0.5, x0 = Math.floor(qx), y0 = Math.floor(qy), fx = qx - x0, fy = qy - y0;
        const a = tap(x0, y0), b = tap(x0 + 1, y0), d = tap(x0, y0 + 1), e = tap(x0 + 1, y0 + 1);
        for (let k = 0; k < 3; k++) {
            const c = ((a[k] * (1 - fx) + b[k] * fx) * (1 - fy) + (d[k] * (1 - fx) + e[k] * fx) * fy) * exposure, t = c / (1 + c);
            out[(py * outW + px) * 4 + k] = Math.round(Math.min(1, Math.max(0, Math.pow(Math.max(t, 0), 1 / 2.2))) * 255);
        }
        out[(py * outW + px) * 4 + 3] = 255;
    }
    return out;
}

const skip = headlessGpuSkipReason(require_);
if (skip) {
    report("native half SKIPPED -- " + skip);
    report("*** THAT IS A SKIP AND NOT A PASS: nothing here has shown the present pass upsample on a native device");
} else {
    configureVulkanIcd();
    const { mod } = resolveWebgpu(require_);
    Object.assign(globalThis, mod.globals || {});
    const gpu = mod.create([]);   // reachable for the whole run (headlessGpu.mjs's v4691 note)
    const adapter = await gpu.requestAdapter();
    const info = adapter ? adapter.info || {} : {}, name = [info.vendor, info.architecture, info.description].filter(Boolean).join(" ");
    ok("a native adapter answered", !!adapter, name);
    if (adapter) {
        noteNativeAdapter(adapter, { gate: fileURLToPath(import.meta.url) });
        const device = await adapter.requestDevice(), TU = globalThis.GPUTextureUsage, BU = globalThis.GPUBufferUsage, MM = globalThis.GPUMapMode;
        const errs = []; device.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message || e)));

        console.log("1. THE PRESENT KERNEL AGAINST ITS TWIN");
        const srcTex = device.createTexture({ size: [SRC_W, SRC_H], format: "rgba16float", usage: TU.TEXTURE_BINDING | TU.COPY_DST });
        const bytes = new Uint16Array(SRC_W * SRC_H * 4); src.forEach((p, i) => { bytes.set([half(p[0]), half(p[1]), half(p[2]), half(1)], i * 4); });
        device.queue.writeTexture({ texture: srcTex }, bytes, { bytesPerRow: SRC_W * 8 }, [SRC_W, SRC_H]);
        const module_ = device.createShaderModule({ code: PRESENT_WGSL });
        const pipe = device.createRenderPipeline({ layout: "auto", vertex: { module: module_, entryPoint: "vs" }, fragment: { module: module_, entryPoint: "fs", targets: [{ format: "rgba8unorm" }] }, primitive: { topology: "triangle-list" } });
        async function runPresent(outW, outH, exposure) {
            const ub = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST }); device.queue.writeBuffer(ub, 0, new Float32Array([exposure, SRC_W / outW, SRC_H / outH, 0]));
            const out = device.createTexture({ size: [outW, outH], format: "rgba8unorm", usage: TU.RENDER_ATTACHMENT | TU.COPY_SRC }), bpr = Math.ceil(outW * 4 / 256) * 256;
            const rb = device.createBuffer({ size: bpr * outH, usage: BU.COPY_DST | BU.MAP_READ });
            const bg = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: srcTex.createView() }, { binding: 1, resource: { buffer: ub } }] });
            const enc = device.createCommandEncoder(), p = enc.beginRenderPass({ colorAttachments: [{ view: out.createView(), clearValue: [0, 0, 0, 1], loadOp: "clear", storeOp: "store" }] });
            p.setPipeline(pipe); p.setBindGroup(0, bg); p.draw(3); p.end(); enc.copyTextureToBuffer({ texture: out }, { buffer: rb, bytesPerRow: bpr }, [outW, outH]); device.queue.submit([enc.finish()]);
            await rb.mapAsync(MM.READ); const raw = new Uint8Array(rb.getMappedRange().slice(0)), px = new Uint8Array(outW * outH * 4);
            for (let y = 0; y < outH; y++) px.set(raw.subarray(y * bpr, y * bpr + outW * 4), y * outW * 4);
            rb.unmap(); rb.destroy(); out.destroy(); ub.destroy(); return px;
        }
        const worst = (a, b) => { let w = 0; for (let i = 0; i < a.length; i++) if (i % 4 !== 3) w = Math.max(w, Math.abs(a[i] - b[i])); return w; };
        for (const [ow, oh, label] of [[4, 3, "ratio 1 (the render size)"], [8, 6, "ratio 1/2 (a 2x upsample)"], [16, 9, "ratio 1/4 by 1/3 (an uneven upsample)"], [12, 9, "ratio 1/3 (a 3x upsample)"], [5, 4, "ratio 4/5 by 3/4 (a small one)"]]) {
            const got = await runPresent(ow, oh, 0.55), w = worst(got, twin(ow, oh, 0.55));
            ok("PRESENT_WGSL at " + label + " (" + ow + "x" + oh + " from " + SRC_W + "x" + SRC_H + ") is within one level of the twin", w <= 1, "worst " + w + " of 255");
            reading("present scale: " + label + " vs twin, 8-bit levels", w, 1, ow * oh * 3, name);
        }
        const flat = await runPresent(4, 3, 0.55), ref = twin(4, 3, 0.55);
        ok("at ratio 1 every output texel is the tone-mapped source texel itself (the filter weights are 0 and 1): not one level of blur", worst(flat, ref) <= 1 && flat[3] === 255);

        console.log("\n2. THE PIPELINE, END TO END");
        const g = await createSnowGpu(device, { canvas: null, width: 80, height: 45 });
        const o = orbitAt(0);
        await g.frame(1 / 60, o.focus, o.cam);                       // the first frame pays the sky bake's compile
        const same = await g.shot(1 / 60, o.focus, o.cam), up = await g.shot(1 / 60, o.focus, o.cam, { outW: 160, outH: 90 });
        ok("!! a shot at the render size is 80x45, and a shot asked to present at 160x90 IS 160x90 (the present pass upsampled, not the render re-made bigger)", same.width === 80 && same.height === 45 && up.width === 160 && up.height === 90 && same.pixels.length === 80 * 45 * 4 && up.pixels.length === 160 * 90 * 4, `${same.width}x${same.height} and ${up.width}x${up.height}`);
        const mean = (px) => { let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / (px.length / 4) / 3 / 255; };
        const m1 = mean(same.pixels), m2 = mean(up.pixels);
        ok("the upsampled picture is the same picture: neither is black, and their mean brightness agrees within 8% (two frames apart, so the jitter differs)", m1 > 0.02 && m2 > 0.02 && Math.abs(m1 - m2) < 0.08 * Math.max(m1, m2), `means ${m1.toFixed(3)} and ${m2.toFixed(3)}`);
        // the upsample is SMOOTH: a 2x bilinear upsample has no step bigger than the source's own neighbour difference, so the largest jump between neighbouring output pixels is below the largest in the render
        const maxStep = (px, w, h) => { let m = 0; for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(px[(y * w + x) * 4 + k] - px[(y * w + x - 1) * 4 + k])); return m; };
        const s1 = maxStep(same.pixels, 80, 45), s2 = maxStep(up.pixels, 160, 90);
        ok("and it is smoothed, not repeated: the largest step between neighbouring pixels does not grow in the upsample", s2 <= s1, `largest horizontal step ${s1} in the render, ${s2} upsampled`);
        await new Promise((r) => setTimeout(r, 50));
        ok("no GPU error from any of it", errs.length === 0 && g.errors.length === 0, errs.concat(g.errors).join(" | ").slice(0, 200));
    }
}

console.log(`\npresentScale-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here: A REAL GPU (the sandbox's native run is a software rasteriser; the rig's `realGpuRun.mjs --native --only render/` carries the D3D12 readings) and the page's slider itself (the live loop is snowGpuLive-selfcheck's).");
exitCleanly(fails === 0 ? 0 : 1);
