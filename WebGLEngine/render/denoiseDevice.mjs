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
"use strict";
import { conv2dWgsl, conv2dTiledWgsl, packProbeUniforms, conv2dCpu, TILE, K_MAX, COUT_MAX } from "../brain/conv2d.mjs";
import { KERNEL_RADIUS, KERNEL_TAPS, headOf } from "./denoiseNet.mjs";
import { ALBEDO_FLOOR, strideOf } from "./denoiseScenes.mjs";
import { maskChannelOf } from "./denoiseMask.mjs";

// WebGPU's flag values, from the specification -- the same numbers in a browser and in Dawn, so this module needs no
// global GPUBufferUsage (node-webgpu keeps its globals on the module, not on globalThis)
const BU = Object.freeze({ MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, UNIFORM: 0x40, STORAGE: 0x80 });
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

/** The kernel each layer runs on: tiled when the tiled kernel can hold it, direct otherwise (the 81-logit head). */
export const kernelFor = (L) => (L.k <= K_MAX && L.Cout <= COUT_MAX ? "tiled" : "direct");

/** A network's layers as the device takes them: f32 weights and biases, each layer's kernel named. */
export function deviceLayers(net) {
    if (headOf(net) !== "kernel") throw new Error("denoiseDevice: only the kernel-predicting network runs on the device");
    return net.layers.map((L) => ({ Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act ?? "none", W: Float32Array.from(L.W), b: Float32Array.from(L.b), kernel: kernelFor(L) }));
}

/** The whole pass's twin, layer by layer through conv2dCpu, then kernelApplyCpu: { y, acts } -- the device's order exactly. */
export function denoiseTwin(net, x, H, W) {
    const layers = deviceLayers(net), acts = [];
    let a = Float32Array.from(x);
    for (const L of layers) { a = conv2dCpu(a, H, W, L); acts.push(a); }
    return { y: kernelApplyCpu(x, a, H, W), acts };
}

/**
 * A denoiser on `dev` (a GPUDevice) for one network and one image size: run(x) -> { y, acts?, ms }. With `keep`, every
 * layer's output is read back too (the gate judges each layer on its own device input). Buffers and pipelines are built
 * once; destroy() frees the buffers.
 */
export async function createDeviceDenoiser(dev, net, { H, W, C }) {
    const layers = deviceLayers(net);
    if (layers[0].Cin !== C) throw new Error(`denoiseDevice: a network of ${layers[0].Cin} input channels was handed an input of ${C}`);
    const mods = {}, errors = [];
    for (const [key, code] of [["direct", conv2dWgsl()], ["tiled", conv2dTiledWgsl()], ["apply", kernelApplyWgsl()]]) {
        const m = dev.createShaderModule({ code });
        const info = m.getCompilationInfo ? await m.getCompilationInfo() : { messages: [] };
        for (const g of info.messages) if (g.type === "error") errors.push(`${key} ${g.lineNum}:${g.linePos} ${g.message}`);
        mods[key] = m;
    }
    if (errors.length) throw new Error("denoiseDevice: WGSL did not compile: " + errors.join("; "));
    const pipe = {
        direct: dev.createComputePipeline({ layout: "auto", compute: { module: mods.direct, entryPoint: "k_conv" } }),
        tiled: dev.createComputePipeline({ layout: "auto", compute: { module: mods.tiled, entryPoint: "k_conv_tiled" } }),
        apply: dev.createComputePipeline({ layout: "auto", compute: { module: mods.apply, entryPoint: "k_apply" } }),
    };
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
        const p = pipe[L.kernel];
        const uni = buffer(32, BU.UNIFORM | BU.COPY_DST, packProbeUniforms({ H, W, Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act, tiled: L.kernel === "tiled" }));
        return { p, bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: uni } }, { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } },
            { binding: 3, resource: { buffer: buffer(L.W.length * 4, BU.STORAGE | BU.COPY_DST, L.W) } }, { binding: 4, resource: { buffer: buffer(L.b.length * 4, BU.STORAGE | BU.COPY_DST, L.b) } }] }) };
    });
    const applyUni = buffer(32, BU.UNIFORM | BU.COPY_DST, packApplyUniforms({ H, W, C }));
    steps.push({ p: pipe.apply, bind: dev.createBindGroup({ layout: pipe.apply.getBindGroupLayout(0), entries: [
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
        layers,
        async run(x, { keep = false } = {}) {
            if (x.length !== H * W * C) throw new Error(`denoiseDevice: an input of ${x.length} values for ${H} x ${W} x ${C}`);
            const t0 = (globalThis.performance ?? Date).now();
            dev.queue.writeBuffer(xBuf, 0, Float32Array.from(x));
            const enc = dev.createCommandEncoder();
            for (const s of steps) { const pass = enc.beginComputePass(); pass.setPipeline(s.p); pass.setBindGroup(0, s.bind); pass.dispatchWorkgroups(groups[0], groups[1]); pass.end(); }
            dev.queue.submit([enc.finish()]);
            const y = await readBack(yBuf, H * W * 3);
            const ms = (globalThis.performance ?? Date).now() - t0;
            const acts = keep ? await Promise.all(layers.map((L, i) => readBack(outs[i], H * W * L.Cout))) : null;
            return { y, acts, ms };
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
