// WebGLEngine/render/denoiseDevice.mjs -- the denoiser arc, round 12: the trained network on the device
//
// Section 34 sent round 11's network to the device for scenes of families R and C. This is that: the kernel-predicting
// network's forward pass and its kernel, run as WebGPU compute on any GPUDevice -- a browser's (denoise.html), or Dawn's
// in a gate (render/denoiseDevice-selfcheck.mjs) -- with every intermediate on the device and one read-back at the end.
//
// ---- THE PASSES ---------------------------------------------------------------------------------------------------
//
//   the conv layers   brain/conv2d.mjs's kernels, unchanged. A layer the TILED kernel can hold (k <= K_MAX, Cout <=
//                     COUT_MAX) runs tiled; the 1 x 1 head of 81 logits does not fit its 32 private accumulators and
//                     runs on the DIRECT kernel, which keeps one accumulator at a time and was never bound by COUT_MAX.
//                     So the head needed no widening and no splitting: the limit was only ever the tiled kernel's.
//   the kernel        k_apply, below: per pixel, a softmax over the 9 x 9 taps that are inside the image and on the
//                     pixel's own side of the emitter mask, then the weighted noisy irradiance, re-modulated by the
//                     albedo. render/denoiseNet.mjs's kernelApply, in f32, in this order.
//
// ---- WHAT IS EXACT AND WHAT IS NOT ---------------------------------------------------------------------------------
//
// A conv layer adds and multiplies only, so the device's every cell is the f32 twin's (brain/conv2d.mjs conv2dCpu) or
// the fused mirror's (conv2dCpuFma) -- explained, not tolerated -- GIVEN THE DEVICE'S OWN INPUT TO THAT LAYER: a cell
// the device fused in layer 1 is an input to layer 2, so each layer is judged on what the device handed it, never on a
// twin of the whole chain. The kernel's exp and its division are not correctly rounded in WGSL (the spec allows
// exp 3 + 2|x| ulp, division 2.5 ulp), so k_apply is held to its twin (kernelApplyCpu) within APPLY_TOL, a bound fixed
// in section 35 from synthetic images before any measured one. And the whole pass to the f64 network
// (denoiseNet.mjs's denoise) is a measurement, not a key.
//
// ---- TWO KERNEL SETS (round 13, section 39) ------------------------------------------------------------------------
//
//   "r12"   the kernels above: brain/conv2d.mjs's tiled kernel for the hidden layers, its direct kernel for the head
//   "r13"   brain/conv2d.mjs's fast kernel, generated per layer, for every layer it can hold -- all five here; a layer
//           it cannot hold falls back to its r12 kernel
// Both add every cell in the same order, so both are held to the same twin, cell for cell. The pass runs DEFAULT_KERNELS
// unless told otherwise; section 39's outcome rule, read off the rig, is what may change it. The timing ladder times
// both, taking turns on one device.
"use strict";
import { conv2dWgsl, conv2dTiledWgsl, conv2dFastWgsl, packProbeUniforms, packFastUniforms, fastShape, conv2dCpu, TILE, K_MAX, COUT_MAX } from "../brain/conv2d.mjs";
import { KERNEL_RADIUS, KERNEL_TAPS, headOf } from "./denoiseNet.mjs";
import { ALBEDO_FLOOR, strideOf } from "./denoiseScenes.mjs";
import { maskChannelOf } from "./denoiseMask.mjs";
import { SOFTWARE_HINTS } from "../ui/localModelProbe.js";

// WebGPU's flag values, from the specification -- the same numbers in a browser and in Dawn, so this module needs no
// global GPUBufferUsage (node-webgpu keeps its globals on the module, not on globalThis)
const BU = Object.freeze({ MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, UNIFORM: 0x40, STORAGE: 0x80, QUERY_RESOLVE: 0x200 });
const MAP_READ = 0x1;
const NO_MASK = 0xffffffff;

/** The relative bound k_apply is held to against its twin (section 35): |device - twin| <= APPLY_TOL * (|twin| + 1e-30). */
export const APPLY_TOL = 1e-5;

const D = 2 * KERNEL_RADIUS + 1;
const DECL_APPLY = `
struct AP { H: u32, W: u32, C: u32, mc: u32, floor: f32, pad0: u32, pad1: u32, pad2: u32 };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // H x W x 3
@group(0) @binding(1) var<uniform> P: AP;
@group(0) @binding(2) var<storage, read>       L: array<f32>;   // H x W x ${KERNEL_TAPS}, the head's logits
@group(0) @binding(3) var<storage, read>       X: array<f32>;   // H x W x C, the network's input`;
const BODY_APPLY = `
fn tapOk(p: u32, py: i32, px: i32, t: u32) -> bool {
    let qy = py + i32(t / ${D}u) - ${KERNEL_RADIUS}; let qx = px + i32(t % ${D}u) - ${KERNEL_RADIUS};
    if (qy < 0 || qy >= i32(P.H) || qx < 0 || qx >= i32(P.W)) { return false; }
    if (P.mc == ${NO_MASK}u) { return true; }
    return X[(u32(qy) * P.W + u32(qx)) * P.C + P.mc] == X[p * P.C + P.mc];
}
@compute @workgroup_size(${TILE}, ${TILE})
fn k_apply(@builtin(global_invocation_id) gid: vec3<u32>) {
    let px = i32(gid.x); let py = i32(gid.y);
    if (gid.x >= P.W || gid.y >= P.H) { return; }
    let p = gid.y * P.W + gid.x;
    // the largest logit among the taps the kernel may weigh -- the centre always may, so there is one
    var m = 0.0; var have = false;
    for (var t = 0u; t < ${KERNEL_TAPS}u; t = t + 1u) {
        if (tapOk(p, py, px, t)) { let l = L[p * ${KERNEL_TAPS}u + t]; if (!have || l > m) { m = l; have = true; } }
    }
    var e: array<f32, ${KERNEL_TAPS}>;
    var sum = 0.0;
    for (var t = 0u; t < ${KERNEL_TAPS}u; t = t + 1u) {
        e[t] = 0.0;
        if (tapOk(p, py, px, t)) { e[t] = exp(L[p * ${KERNEL_TAPS}u + t] - m); sum = sum + e[t]; }
    }
    var r = 0.0; var g = 0.0; var b = 0.0;
    for (var t = 0u; t < ${KERNEL_TAPS}u; t = t + 1u) {
        let wt = e[t] / sum;
        if (wt == 0.0) { continue; }
        let q = (u32(py + i32(t / ${D}u) - ${KERNEL_RADIUS}) * P.W + u32(px + i32(t % ${D}u) - ${KERNEL_RADIUS})) * P.C;
        r = r + wt * X[q]; g = g + wt * X[q + 1u]; b = b + wt * X[q + 2u];
    }
    let o = p * P.C;
    Y[p * 3u] = r * max(X[o + 3u], P.floor); Y[p * 3u + 1u] = g * max(X[o + 4u], P.floor); Y[p * 3u + 2u] = b * max(X[o + 5u], P.floor);
}
`;

/** The kernel apply (entry k_apply): Y at 0, the uniform at 1, the logits at 2, the input at 3. */
export function kernelApplyWgsl() { return DECL_APPLY + BODY_APPLY; }

/** The apply uniform block: H, W, C, the mask channel (none: 0xffffffff) as u32 bits, the albedo floor as an f32. */
export function packApplyUniforms({ H, W, C }) {
    const b = new ArrayBuffer(32), u = new Uint32Array(b), f = new Float32Array(b), mc = maskChannelOf(C);
    u[0] = H; u[1] = W; u[2] = C; u[3] = mc < 0 ? NO_MASK : mc; f[4] = ALBEDO_FLOOR;
    return f;
}

/**
 * k_apply's twin: f32, rounded after every operation, in the kernel's order, exp and division correctly rounded (the
 * device's are within the spec's ulps of these -- hence APPLY_TOL). `logits` H x W x 81, `x` H x W x C. H x W x 3.
 */
export function kernelApplyCpu(x, logits, H, W) {
    const f = Math.fround, C = strideOf(x, H * W), mc = maskChannelOf(C), R = KERNEL_RADIUS, T = KERNEL_TAPS, y = new Float32Array(H * W * 3), e = new Float32Array(T);
    const floor = f(ALBEDO_FLOOR);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const p = py * W + px;
        const ok = (t) => { const qy = py + ((t / D) | 0) - R, qx = px + (t % D) - R;
                            return qy >= 0 && qy < H && qx >= 0 && qx < W && (mc < 0 || f(x[(qy * W + qx) * C + mc]) === f(x[p * C + mc])); };
        let m = 0, have = false;
        for (let t = 0; t < T; t++) if (ok(t)) { const l = f(logits[p * T + t]); if (!have || l > m) { m = l; have = true; } }
        let sum = 0;
        for (let t = 0; t < T; t++) { e[t] = 0; if (ok(t)) { e[t] = f(Math.exp(f(f(logits[p * T + t]) - m))); sum = f(sum + e[t]); } }
        let r = 0, g = 0, b = 0;
        for (let t = 0; t < T; t++) {
            const wt = f(e[t] / sum);
            if (wt === 0) continue;
            const q = ((py + ((t / D) | 0) - R) * W + (px + (t % D) - R)) * C;
            r = f(r + f(wt * f(x[q]))); g = f(g + f(wt * f(x[q + 1]))); b = f(b + f(wt * f(x[q + 2])));
        }
        const o = p * C;
        y[p * 3] = f(r * Math.max(f(x[o + 3]), floor)); y[p * 3 + 1] = f(g * Math.max(f(x[o + 4]), floor)); y[p * 3 + 2] = f(b * Math.max(f(x[o + 5]), floor));
    }
    return y;
}

/** The kernel sets a pass can run on: round 12's, and round 13's fast kernel (section 39). */
export const KERNEL_SETS = Object.freeze(["r12", "r13"]);
/** The set a pass runs unless told otherwise: round 12's, until section 39's outcome rule says otherwise. */
export const DEFAULT_KERNELS = "r12";

/**
 * The kernel a layer runs on in a set. r12: tiled when the tiled kernel can hold it, direct otherwise (the 81-logit
 * head). r13: the fast kernel when its uniform block and tile fit the device's default limits, else the layer's r12 kernel.
 */
export const kernelFor = (L, set = DEFAULT_KERNELS) => {
    if (!KERNEL_SETS.includes(set)) throw new Error(`denoiseDevice: no kernel set "${set}" -- the sets are ${KERNEL_SETS.join(", ")}`);
    return set === "r13" && fastShape(L).fits ? "fast" : L.k <= K_MAX && L.Cout <= COUT_MAX ? "tiled" : "direct";
};

/** A network's layers as the device takes them: f32 weights and biases, each layer's kernel in `set` named. */
export function deviceLayers(net, set = DEFAULT_KERNELS) {
    if (headOf(net) !== "kernel") throw new Error("denoiseDevice: only the kernel-predicting network runs on the device");
    return net.layers.map((L) => ({ Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act ?? "none", W: Float32Array.from(L.W), b: Float32Array.from(L.b), kernel: kernelFor(L, set) }));
}

/** The whole pass's twin, layer by layer through conv2dCpu, then kernelApplyCpu: { y, acts } -- the device's order exactly. */
export function denoiseTwin(net, x, H, W) {
    const layers = deviceLayers(net), acts = [];
    let a = Float32Array.from(x);
    for (const L of layers) { a = conv2dCpu(a, H, W, L); acts.push(a); }
    return { y: kernelApplyCpu(x, a, H, W), acts };
}

/**
 * A denoiser on `dev` (a GPUDevice) for one network, one image size and one kernel set: run(x) -> { y, acts?, ms }. With
 * `keep`, every layer's output is read back too (the gate judges each layer on its own device input). Buffers and
 * pipelines are built once -- only the kernels the set uses, the fast kernel once per layer, as it is generated for one;
 * destroy() frees the buffers.
 */
export async function createDeviceDenoiser(dev, net, { H, W, C, kernels = DEFAULT_KERNELS }) {
    const layers = deviceLayers(net, kernels);
    if (layers[0].Cin !== C) throw new Error(`denoiseDevice: a network of ${layers[0].Cin} input channels was handed an input of ${C}`);
    const used = new Set(layers.map((L) => L.kernel)), errors = [], pipe = {};
    const build = async (key, code, entryPoint) => {
        const m = dev.createShaderModule({ code });
        const info = m.getCompilationInfo ? await m.getCompilationInfo() : { messages: [] };
        const bad = info.messages.filter((g) => g.type === "error");
        for (const g of bad) errors.push(`${key} ${g.lineNum}:${g.linePos} ${g.message}`);
        if (!bad.length) pipe[key] = dev.createComputePipeline({ layout: "auto", compute: { module: m, entryPoint } });
    };
    if (used.has("direct")) await build("direct", conv2dWgsl(), "k_conv");
    if (used.has("tiled")) await build("tiled", conv2dTiledWgsl(), "k_conv_tiled");
    for (const [i, L] of layers.entries()) if (L.kernel === "fast") await build("fast" + i, conv2dFastWgsl(L), "k_conv_fast");
    await build("apply", kernelApplyWgsl(), "k_apply");
    if (errors.length) throw new Error("denoiseDevice: WGSL did not compile: " + errors.join("; "));
    const owned = [];
    const buffer = (bytes, usage, data = null) => {
        const b = dev.createBuffer({ size: Math.max(16, bytes), usage });
        if (data) dev.queue.writeBuffer(b, 0, data);
        owned.push(b);
        return b;
    };
    const S = BU.STORAGE | BU.COPY_DST | BU.COPY_SRC;
    const xBuf = buffer(H * W * C * 4, S);
    const outs = layers.map((L) => buffer(H * W * L.Cout * 4, S));
    const yBuf = buffer(H * W * 3 * 4, S);
    const groups = [Math.ceil(W / TILE), Math.ceil(H / TILE)];
    const steps = layers.map((L, i) => {
        if (L.kernel === "fast") {
            // the fast kernel: its weights and bias in the uniform block, the image alone at binding 2, a z group per FAST_GROUP channels
            const p = pipe["fast" + i], uni = packFastUniforms({ H, W, layer: L });
            return { p, wg: [...groups, fastShape(L).groups], bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
                { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: buffer(uni.byteLength, BU.UNIFORM | BU.COPY_DST, uni) } },
                { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } }] }) };
        }
        const p = pipe[L.kernel];
        const uni = buffer(32, BU.UNIFORM | BU.COPY_DST, packProbeUniforms({ H, W, Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act, tiled: L.kernel === "tiled" }));
        return { p, wg: [...groups, 1], bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: uni } }, { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } },
            { binding: 3, resource: { buffer: buffer(L.W.length * 4, BU.STORAGE | BU.COPY_DST, L.W) } }, { binding: 4, resource: { buffer: buffer(L.b.length * 4, BU.STORAGE | BU.COPY_DST, L.b) } }] }) };
    });
    const applyUni = buffer(32, BU.UNIFORM | BU.COPY_DST, packApplyUniforms({ H, W, C }));
    steps.push({ p: pipe.apply, wg: [...groups, 1], bind: dev.createBindGroup({ layout: pipe.apply.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: yBuf } }, { binding: 1, resource: { buffer: applyUni } }, { binding: 2, resource: { buffer: outs[outs.length - 1] } },
        { binding: 3, resource: { buffer: xBuf } }] }) });
    const readBack = async (src, n) => {
        const rb = dev.createBuffer({ size: n * 4, usage: BU.COPY_DST | BU.MAP_READ });
        const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(src, 0, rb, 0, n * 4); dev.queue.submit([enc.finish()]);
        await rb.mapAsync(MAP_READ);
        const v = new Float32Array(rb.getMappedRange().slice(0));
        rb.unmap(); rb.destroy();
        return v;
    };
    return {
        layers, kernels,
        async run(x, { keep = false } = {}) {
            if (x.length !== H * W * C) throw new Error(`denoiseDevice: an input of ${x.length} values for ${H} x ${W} x ${C}`);
            const t0 = (globalThis.performance ?? Date).now();
            dev.queue.writeBuffer(xBuf, 0, Float32Array.from(x));
            const enc = dev.createCommandEncoder();
            for (const s of steps) { const pass = enc.beginComputePass(); pass.setPipeline(s.p); pass.setBindGroup(0, s.bind); pass.dispatchWorkgroups(...s.wg); pass.end(); }
            dev.queue.submit([enc.finish()]);
            const y = await readBack(yBuf, H * W * 3);
            const ms = (globalThis.performance ?? Date).now() - t0;
            const acts = keep ? await Promise.all(layers.map((L, i) => readBack(outs[i], H * W * L.Cout))) : null;
            return { y, acts, ms };
        },
        /** The output buffer as it stands -- what the last run or timed pass wrote. */
        output: () => readBack(yBuf, H * W * 3),
        /**
         * Time the pass (section 37): `warmup` untimed passes, then timed ones until `maxReps`, or `budgetMs` of them once
         * there are `minReps`. Per pass, `wall` is submit to queue.onSubmittedWorkDone() -- the device's work and the
         * queue's overhead, no upload and no read-back -- and, when the device has timestamp-query, `gpu` is the first
         * pass's start to the last pass's end on the device's own clock, and `perPass` each layer's and the kernel's.
         * `elapsed` is the GUARD: submit to a 4-byte read-back of the output, which cannot land before the work is done.
         * The budget is spent in it, and the ladder predicts from it, so a clock that under-reports cannot run a slow
         * device into sizes it would take minutes on (a sabotage did exactly that before the guard).
         */
        async time(x, { warmup = 2, minReps = 3, maxReps = 30, budgetMs = 2000 } = {}) {
            if (x.length !== H * W * C) throw new Error(`denoiseDevice: an input of ${x.length} values for ${H} x ${W} x ${C}`);
            dev.queue.writeBuffer(xBuf, 0, Float32Array.from(x));
            const ts = !!(dev.features && dev.features.has("timestamp-query")), n = steps.length;
            const qs = ts ? dev.createQuerySet({ type: "timestamp", count: 2 * n }) : null;
            const resolved = ts ? dev.createBuffer({ size: 16 * n, usage: BU.QUERY_RESOLVE | BU.COPY_SRC }) : null;
            const read = ts ? dev.createBuffer({ size: 16 * n, usage: BU.COPY_DST | BU.MAP_READ }) : null;
            const probe = dev.createBuffer({ size: 16, usage: BU.COPY_DST | BU.MAP_READ });
            const now = () => (globalThis.performance ?? Date).now(), wall = [], gpu = [], perPass = [], elapsed = [];
            let spent = 0;
            try {
                for (let rep = 0; rep < warmup + maxReps; rep++) {
                    const enc = dev.createCommandEncoder();
                    steps.forEach((s, i) => {
                        const pass = enc.beginComputePass(ts ? { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 } } : {});
                        pass.setPipeline(s.p); pass.setBindGroup(0, s.bind); pass.dispatchWorkgroups(...s.wg); pass.end();
                    });
                    if (ts) { enc.resolveQuerySet(qs, 0, 2 * n, resolved, 0); enc.copyBufferToBuffer(resolved, 0, read, 0, 16 * n); }
                    enc.copyBufferToBuffer(yBuf, 0, probe, 0, 4);
                    const cb = enc.finish(), t0 = now();
                    dev.queue.submit([cb]);
                    await dev.queue.onSubmittedWorkDone();
                    const t = now() - t0;
                    await probe.mapAsync(MAP_READ); probe.unmap();
                    const g = now() - t0;
                    let st = null;
                    if (ts) { await read.mapAsync(MAP_READ); st = new BigUint64Array(read.getMappedRange().slice(0)); read.unmap(); }
                    if (rep < warmup) continue;
                    wall.push(t); elapsed.push(g); spent += g;
                    if (st) { gpu.push(Number(st[2 * n - 1] - st[0]) / 1e6); perPass.push(steps.map((_, i) => Number(st[2 * i + 1] - st[2 * i]) / 1e6)); }
                    if (wall.length >= maxReps || (wall.length >= minReps && spent >= budgetMs)) break;
                }
            } finally { qs?.destroy(); resolved?.destroy(); read?.destroy(); probe.destroy(); }
            return { wall, elapsed, gpu: ts ? gpu : null, perPass: ts ? perPass : null, timestamps: ts,
                     passes: [...layers.map((L, i) => `layer ${i} (${L.kernel}, ${L.Cin} -> ${L.Cout})`), "kernel"] };
        },
        destroy() { for (const b of owned) b.destroy(); owned.length = 0; },
    };
}

// ---- THE SHIPPED NETWORK ---------------------------------------------------------------------------------------
// A trained network as JSON-safe data: each layer's shape, and its weights as base64 of little-endian float64s, so
// the network a page decodes is the trained one bit for bit (render/denoise-net-r11.json; section 35's D0 holds it to
// round 11's harvest). btoa and atob exist in browsers and in node.
const toB64 = (a) => { const v = new DataView(new ArrayBuffer(a.length * 8)); a.forEach((x, i) => v.setFloat64(i * 8, x, true));
                       let s = ""; const u = new Uint8Array(v.buffer); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (s) => { const bin = atob(s), v = new DataView(new ArrayBuffer(bin.length)); for (let i = 0; i < bin.length; i++) v.setUint8(i, bin.charCodeAt(i));
                         return Float64Array.from({ length: bin.length / 8 }, (_, i) => v.getFloat64(i * 8, true)); };
/** A network as data: { layers: [{ Cin, Cout, k, act, W, b }] }, W and b base64 float64. */
export function encodeNet(net) {
    return { layers: net.layers.map((L) => ({ Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act ?? "none", W: toB64(L.W), b: toB64(L.b) })) };
}
/** encodeNet's inverse, refusing a layer whose weights do not fill its shape. */
export function decodeNet(data) {
    return { layers: data.layers.map((L, i) => {
        const W = fromB64(L.W), b = fromB64(L.b);
        if (W.length !== L.Cout * L.k * L.k * L.Cin || b.length !== L.Cout) throw new Error(`denoiseDevice: layer ${i} holds ${W.length} + ${b.length} values for ${L.Cin} -> ${L.Cout}, k ${L.k}`);
        return { Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act, W, b };
    }) };
}

// ---- TIMING ON A DEVICE (section 37) ---------------------------------------------------------------------------
// Every time in sections 35-36 was SwiftShader's -- a CPU running a JIT. A GPU's time is what a real-hardware run is for
// (tools/ship/realGpuRun.mjs, docs/real-hardware-fsr.md), so the pass is timed on a ladder of image sizes, up to a 1080p
// frame, on whatever device it is handed: render/denoiseTiming-selfcheck.mjs in node and through the page, and the page's
// own "Time on this device". The network is fully convolutional and the kernel is per pixel, so any size runs; what a
// pass costs does not depend on what the image shows, so the input is synthetic.

/** The sizes timed, smallest first: the trained 64 x 64 up to a 1080p frame. */
export const TIMING_SIZES = Object.freeze([[64, 64], [128, 128], [256, 256], [512, 512], [1024, 1024], [1920, 1080]].map((s) => Object.freeze(s)));
/** The largest buffer a pass at H x W needs, in bytes -- the widest layer's output (the head's 81 logits). */
export const largestBuffer = (net, H, W) => H * W * Math.max(...net.layers.map((L) => L.Cout), net.layers[0].Cin) * 4;
/** A deterministic input of C channels: irradiance, albedo, normals and a two-valued mask, in the network's ranges. */
export function timingInput(H, W, C = 10, seed = 1) {
    let s = seed >>> 0; const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const x = new Float32Array(H * W * C);
    for (let p = 0; p < H * W; p++) {
        for (let c = 0; c < 3; c++) x[p * C + c] = u() * 2;
        for (let c = 3; c < 6; c++) x[p * C + c] = u();
        for (let c = 6; c < 9; c++) x[p * C + c] = u() * 2 - 1;
        if (C === 10) x[p * C + 9] = (p % W) < W / 8 ? 1 : 0;
    }
    return x;
}
/** Median and the 10th and 90th percentiles of a list of times (nearest rank). */
export function summarize(ms) {
    if (!ms || !ms.length) return null;
    const s = [...ms].sort((a, b) => a - b), at = (q) => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
    return { median: at(0.5), p10: at(0.1), p90: at(0.9), n: s.length };
}
/** An adapter's name, and whether it is CPU emulation (the report's software flag: the spec's own, else the name). */
export function adapterOf(adapter) {
    const i = adapter?.info || {}, name = [i.vendor, i.architecture, i.description].filter(Boolean).join(" / ") || "unnamed";
    const software = adapter && "isFallbackAdapter" in adapter && adapter.isFallbackAdapter === true ? true : SOFTWARE_HINTS.test(name);
    return { name, software, timestamps: !!(adapter?.features && adapter.features.has("timestamp-query")) };
}
/** A device from `adapter` for a pass needing `bytes` in one buffer: timestamp queries when offered, the storage limits raised to fit. */
export async function timingDevice(adapter, bytes) {
    const cap = Math.min(adapter.limits.maxStorageBufferBindingSize, adapter.limits.maxBufferSize);
    if (bytes > cap) return null;
    const want = Math.max(bytes, Math.min(cap, 134217728));
    return adapter.requestDevice({ requiredFeatures: adapter.features.has("timestamp-query") ? ["timestamp-query"] : [],
                                   requiredLimits: { maxStorageBufferBindingSize: want, maxBufferSize: want } });
}
/**
 * The ladder: each size in `sizes`, on a fresh device from `newAdapter()` (one per size -- a reused Dawn device was found to
 * crash, section 35), released after. On that one device every kernel set in `sets` is timed by time(), TAKING TURNS
 * (round 13, section 39): `rounds` rounds, the sets' order reversed each round, so a device that warms up or throttles
 * during a size shares it between them -- each set's passes are pooled across the rounds. A size is skipped when the
 * adapter's buffers cannot hold it; a set is left out at a size its own last GUARD median (time()'s `elapsed`), scaled by
 * pixels, predicts past `capMs`, so the faster set can climb past where the slower one stops; and nothing runs once
 * `totalMs` is spent. On the first size each set measures, it also checks that timing changes nothing: the image a timed
 * pass wrote is an untimed run's, bit for bit.
 * Returns { adapter, sets, rows: { [set]: [{ H, W, skipped, reason, wall, gpu, perPass, timestamps, mpxPerS, order }] },
 * speedup: [{ H, W, measured, clock, ratio }] -- the first set's median over the last's, on the device's clock where both
 * have one -- and invisible: { [set]: bool } }.
 */
export async function timingLadder(net, newAdapter, { sizes = TIMING_SIZES, sets = KERNEL_SETS, rounds = 3, capMs = 1500, totalMs = 120000, C = net.layers[0].Cin,
                                                      warmup = 2, minReps = 3, maxReps = 30, budgetMs = 2000 } = {}) {
    const now = () => (globalThis.performance ?? Date).now(), start = now();
    const rows = Object.fromEntries(sets.map((s) => [s, []])), last = {}, invisible = {};
    let adapter = null;
    for (const [W, H] of sizes) {
        const bytes = largestBuffer(net, H, W), skip = {};
        for (const s of sets) {
            if (now() - start > totalMs) skip[s] = `the ladder's ${totalMs / 1000} s budget is spent`;
            else if (last[s] && last[s].ms * (H * W) / last[s].px > capMs) skip[s] = `predicted ${(last[s].ms * (H * W) / last[s].px).toFixed(0)} ms a pass, over the ${capMs} ms cap`;
        }
        const live = sets.filter((s) => !skip[s]);
        if (!live.length) { for (const s of sets) rows[s].push({ H, W, skipped: true, reason: skip[s] }); continue; }
        const a = await newAdapter();
        adapter = adapter || adapterOf(a);
        const dev = await timingDevice(a, bytes);
        if (!dev) { for (const s of sets) rows[s].push({ H, W, skipped: true, reason: skip[s] || `a ${(bytes / 2 ** 20).toFixed(0)} MiB buffer is over the adapter's limit` }); continue; }
        try {
            const x = timingInput(H, W, C), Ds = {}, got = {}, order = [];
            for (const s of live) { Ds[s] = await createDeviceDenoiser(dev, net, { H, W, C, kernels: s }); got[s] = { wall: [], gpu: [], perPass: [], elapsed: [], timestamps: false, passes: null }; }
            for (let r = 0; r < rounds; r++) for (const s of (r % 2 ? [...live].reverse() : live)) {
                const t = await Ds[s].time(x, { warmup: r ? 1 : warmup, minReps: Math.ceil(minReps / rounds), maxReps: Math.ceil(maxReps / rounds), budgetMs: budgetMs / rounds });
                const g = got[s]; order.push(s);
                g.wall.push(...t.wall); g.elapsed.push(...t.elapsed); g.timestamps = t.timestamps; g.passes = t.passes;
                if (t.gpu) { g.gpu.push(...t.gpu); g.perPass.push(...t.perPass); }
            }
            for (const s of live) if (invisible[s] === undefined) {
                const timed = await Ds[s].output(), plain = (await Ds[s].run(x)).y;
                invisible[s] = timed.length === plain.length && timed.every((v, i) => Object.is(v, plain[i]));
            }
            for (const s of live) Ds[s].destroy();
            for (const s of sets) {
                if (skip[s]) { rows[s].push({ H, W, skipped: true, reason: skip[s] }); continue; }
                const t = got[s], wall = summarize(t.wall), gpu = t.timestamps ? summarize(t.gpu) : null, elapsed = summarize(t.elapsed);
                const perPass = t.timestamps ? t.passes.map((name, i) => ({ name, ms: summarize(t.perPass.map((q) => q[i])).median })) : null;
                rows[s].push({ H, W, skipped: false, wall, gpu, elapsed, perPass, timestamps: t.timestamps, order, passes: t.passes,
                               raw: { wall: t.wall, gpu: t.timestamps ? t.gpu : null, perPass: t.timestamps ? t.perPass : null, elapsed: t.elapsed },
                               mpxPerS: (H * W / 1e6) / (wall.median / 1000) });
                last[s] = { ms: elapsed.median, px: H * W };
            }
        } finally { dev.destroy(); }
    }
    const [A, B] = [sets[0], sets[sets.length - 1]];
    const speedup = rows[A].map((a, i) => {
        const b = rows[B][i];
        if (a.skipped || b.skipped || A === B) return { H: a.H, W: a.W, measured: false };
        const clock = a.gpu && b.gpu ? "device" : "wall";
        return { H: a.H, W: a.W, measured: true, clock, ratio: clock === "device" ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median };
    });
    return { adapter, sets: [...sets], rows, speedup, invisible };
}
