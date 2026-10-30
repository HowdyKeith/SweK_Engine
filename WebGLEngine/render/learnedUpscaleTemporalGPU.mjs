// WebGLEngine/render/learnedUpscaleTemporalGPU.mjs -- round 71 (pre-registration section 163): U_T on the device
//
// Section 162's U_T (render/learnedUpscaleTemporal.mjs) as five compute passes at full size, on a GPUDevice:
//   layers 0-3   brain/conv2d.mjs's fast kernel (r15's, the page's default), one per layer: 17 -> 32, 32 -> 32, 32 -> 32 (3 x 3, ReLU),
//                32 -> 3 (1 x 1) -- the denoiser's own kernel, generated for these shapes, held to conv2dCpu as the denoiser's are
//   the hold     HOLD_WGSL: y = A (1 + 0.5 tanh r), A the input's channels 0-2, r the head's output
// Used by the gate (render/denoiseLearnedUpscaleGPU-selfcheck.mjs, in a browser page or on the rig) and by path-tracer.html's
// temporal view. readH71 is section 163's rule over a realGpuRun report.
"use strict";
import { conv2dFastWgsl, packFastUniforms, fastShape, TILE } from "../brain/conv2d.mjs";
import { UT_CHANNELS, UT_SCALE } from "./learnedUpscaleTemporal.mjs";
import { readH63 } from "./denoiseFrameGenGPU.mjs";

const BU = Object.freeze({ MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, UNIFORM: 0x40, STORAGE: 0x80, QUERY_RESOLVE: 0x200 });
// tanh's argument clamped to +-15 on the device: some drivers' tanh overflows to NaN past ~44, and tanh(15) is 1 - 1.9e-13, so the
// clamp moves no value by more than that against the CPU's unclamped Math.tanh
export const HOLD_CLAMP = 15;
export const HOLD_WGSL = /* wgsl */`
struct HP { H: u32, W: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // H x W x 3
@group(0) @binding(1) var<uniform> U: HP;
@group(0) @binding(2) var<storage, read>       X: array<f32>;   // H x W x ${UT_CHANNELS}, A in channels 0-2
@group(0) @binding(3) var<storage, read>       R: array<f32>;   // H x W x 3, the head's residual
@compute @workgroup_size(${TILE}, ${TILE}, 1)
fn k_hold(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= U.W || gid.y >= U.H) { return; }
    let p = gid.y * U.W + gid.x;
    for (var c = 0u; c < 3u; c = c + 1u) {
        let r = clamp(R[p * 3u + c], -${HOLD_CLAMP}.0, ${HOLD_CLAMP}.0);
        Y[p * 3u + c] = X[p * ${UT_CHANNELS}u + c] * (1.0 + ${UT_SCALE} * tanh(r));
    }
}
`;

/** U_T's layers as the device takes them: f32 weights, each on the fast kernel, refused by name if one does not fit it. */
export function deviceLayersT(net) {
    return net.layers.map((L, i) => {
        const D = { Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act ?? "none", W: Float32Array.from(L.W), b: Float32Array.from(L.b) };
        if (!fastShape(D).fits) throw new Error(`learnedUpscaleTemporalGPU: layer ${i} (${L.Cin} -> ${L.Cout}, k ${L.k}) does not fit the fast kernel`);
        return D;
    });
}

/**
 * U_T on `dev` (a GPUDevice) at H x W: run(x, { keep }) -> { y, r, acts?, ms }, time(x) -> { gpu, perPass, wall, timestamps, passes },
 * destroy(). x is temporalInput's 17 channels a pixel. Buffers and pipelines are built once.
 */
export async function createDeviceTemporal(dev, net, { H, W }) {
    const layers = deviceLayersT(net);
    if (layers[0].Cin !== UT_CHANNELS || layers[layers.length - 1].Cout !== 3) throw new Error("learnedUpscaleTemporalGPU: U_T takes 17 channels and gives 3");
    const errors = [], build = async (code, entryPoint) => {
        const m = dev.createShaderModule({ code }), info = m.getCompilationInfo ? await m.getCompilationInfo() : { messages: [] };
        for (const g of info.messages.filter((g) => g.type === "error")) errors.push(`${entryPoint} ${g.lineNum}:${g.linePos} ${g.message}`);
        return dev.createComputePipeline({ layout: "auto", compute: { module: m, entryPoint } });
    };
    const pipes = [];
    for (const L of layers) pipes.push(await build(conv2dFastWgsl(L), "k_conv_fast"));
    const hold = await build(HOLD_WGSL, "k_hold");
    if (errors.length) throw new Error("learnedUpscaleTemporalGPU: WGSL did not compile: " + errors.join("; "));
    const owned = [], buffer = (bytes, usage, data = null) => { const b = dev.createBuffer({ size: Math.max(16, bytes), usage }); if (data) dev.queue.writeBuffer(b, 0, data); owned.push(b); return b; };
    const S = BU.STORAGE | BU.COPY_DST | BU.COPY_SRC, xBuf = buffer(H * W * UT_CHANNELS * 4, S), outs = layers.map((L) => buffer(H * W * L.Cout * 4, S)), yBuf = buffer(H * W * 3 * 4, S);
    const groups = [Math.ceil(W / TILE), Math.ceil(H / TILE)];
    const steps = layers.map((L, i) => {
        const p = pipes[i], uni = packFastUniforms({ H, W, layer: L });
        return { p, wg: [...groups, fastShape(L).groups], bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: buffer(uni.byteLength, BU.UNIFORM | BU.COPY_DST, uni) } },
            { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } }] }) };
    });
    steps.push({ p: hold, wg: [...groups, 1], bind: dev.createBindGroup({ layout: hold.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: yBuf } }, { binding: 1, resource: { buffer: buffer(16, BU.UNIFORM | BU.COPY_DST, new Uint32Array([H, W, 0, 0])) } },
        { binding: 2, resource: { buffer: xBuf } }, { binding: 3, resource: { buffer: outs[outs.length - 1] } }] }) });
    const readBack = async (src, n) => {
        const rb = dev.createBuffer({ size: n * 4, usage: BU.COPY_DST | BU.MAP_READ }), enc = dev.createCommandEncoder();
        enc.copyBufferToBuffer(src, 0, rb, 0, n * 4); dev.queue.submit([enc.finish()]);
        await rb.mapAsync(BU.MAP_READ); const v = new Float32Array(rb.getMappedRange().slice(0)); rb.unmap(); rb.destroy(); return v;
    };
    const encode = (enc, ts = null) => steps.forEach((s, i) => {
        const pass = enc.beginComputePass(ts ? { timestampWrites: { querySet: ts, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 } } : {});
        pass.setPipeline(s.p); pass.setBindGroup(0, s.bind); pass.dispatchWorkgroups(...s.wg); pass.end();
    });
    const now = () => (globalThis.performance ?? Date).now();
    return {
        layers,
        passes: [...layers.map((L, i) => `layer ${i} (fast, ${L.Cin} -> ${L.Cout}, ${L.k} x ${L.k})`), "hold"],
        async run(x, { keep = false } = {}) {
            if (x.length !== H * W * UT_CHANNELS) throw new Error(`learnedUpscaleTemporalGPU: an input of ${x.length} values for ${H} x ${W} x ${UT_CHANNELS}`);
            const t0 = now();
            dev.queue.writeBuffer(xBuf, 0, Float32Array.from(x));
            const enc = dev.createCommandEncoder(); encode(enc); dev.queue.submit([enc.finish()]);
            const y = await readBack(yBuf, H * W * 3), ms = now() - t0, r = await readBack(outs[outs.length - 1], H * W * 3);
            const acts = keep ? await Promise.all(layers.map((L, i) => readBack(outs[i], H * W * L.Cout))) : null;
            return { y, r, acts, ms };
        },
        /** `warmup` untimed passes, then up to `reps` timed: the five passes on the device's clock where it has timestamp-query, else submit to done. */
        async time(x, { warmup = 2, reps = 9 } = {}) {
            dev.queue.writeBuffer(xBuf, 0, Float32Array.from(x));
            const ts = !!(dev.features && dev.features.has("timestamp-query")), n = steps.length;
            const qs = ts ? dev.createQuerySet({ type: "timestamp", count: 2 * n }) : null;
            const resolved = ts ? dev.createBuffer({ size: 16 * n, usage: BU.QUERY_RESOLVE | BU.COPY_SRC }) : null;
            const read = ts ? dev.createBuffer({ size: 16 * n, usage: BU.COPY_DST | BU.MAP_READ }) : null;
            const wall = [], gpu = [], perPass = [];
            try {
                for (let rep = 0; rep < warmup + reps; rep++) {
                    const enc = dev.createCommandEncoder(); encode(enc, qs);
                    if (ts) { enc.resolveQuerySet(qs, 0, 2 * n, resolved, 0); enc.copyBufferToBuffer(resolved, 0, read, 0, 16 * n); }
                    const t0 = now(); dev.queue.submit([enc.finish()]); await dev.queue.onSubmittedWorkDone(); const t = now() - t0;
                    let st = null; if (ts) { await read.mapAsync(BU.MAP_READ); st = new BigUint64Array(read.getMappedRange().slice(0)); read.unmap(); }
                    if (rep < warmup) continue;
                    wall.push(t);
                    if (st) { gpu.push(Number(st[2 * n - 1] - st[0]) / 1e6); perPass.push(steps.map((_, i) => Number(st[2 * i + 1] - st[2 * i]) / 1e6)); }
                }
            } finally { qs?.destroy(); resolved?.destroy(); read?.destroy(); }
            const med = (a) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
            return { timestamps: ts, wall, gpu: ts ? gpu : null, perPass: ts ? perPass : null, ms: ts ? med(gpu) : med(wall), clock: ts ? "device" : "wall",
                     passMs: ts ? steps.map((_, i) => med(perPass.map((q) => q[i]))) : null };
        },
        destroy() { for (const b of owned) b.destroy(); owned.length = 0; },
    };
}

/** The hold on the CPU in f64, applied to a residual r the device gave: y = A (1 + 0.5 tanh r), as HOLD_WGSL does (the clamp included). */
export function holdCpu(x, r, H, W) {
    const y = new Float64Array(H * W * 3);
    for (let p = 0; p < H * W; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = x[p * UT_CHANNELS + c] * (1 + UT_SCALE * Math.tanh(Math.min(HOLD_CLAMP, Math.max(-HOLD_CLAMP, r[p * 3 + c]))));
    return y;
}

/**
 * SECTION 163's RULE over a realGpuRun report: U, U_T's five passes at 1920 x 1080 (this gate's line), against T, section 103's chain
 * with its history (the denoiseUpscaleGPU line readH63 reads). A run counts when every gate is green with exit 0.
 */
export function readH71(rep) {
    const base = readH63(rep), g = (rep.gates || []).find((x) => x.gate === "render/denoiseLearnedUpscaleGPU-selfcheck.mjs");
    let U = null, clock = null;
    for (const l of (g && g.measured) || []) { const m = l.match(/^section 163: U_T at 1920 x 1080 ([\d.]+) ms \((device|wall)\)/); if (m) { U = +m[1]; clock = m[2]; break; } }
    return { commit: base.commit, counts: base.counts, T: base.T, U, clock, ratio: U !== null && base.T !== null ? U / base.T : null };
}
export const H71_RATIO = 0.25;
/** The sizes the gate times U_T at: 1920 x 1080 on hardware (section 163's, the line readH71 reads), 240 x 136 on a software adapter. */
export const UT_TIMING = Object.freeze({ hw: Object.freeze([1920, 1080]), soft: Object.freeze([240, 136]) });
/** H71 over one GPU's runs: "holds" when every run counts and U / T <= 0.25 in each; "fails" when all count and one is over; else "no verdict". */
export function h71(runs) {
    if (!runs.length || !runs.every((r) => r.counts && r.ratio !== null)) return "no verdict";
    return runs.every((r) => r.ratio <= H71_RATIO) ? "holds" : "fails";
}
