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
//   "r14"   round 14 (section 43): r13's fast kernel for the hidden layers; the LAST layer, when it is 1 x 1, on
//           brain/conv2d.mjs's head kernel, which writes its logits planar; and k_apply_fast, which reads them so
//   "r15"   round 15 (section 46): r13's fast kernel for the hidden layers; the LAST layer, when it is the 1 x 1 head of
//           81 logits, and the kernel apply in ONE pass, k_head_apply below -- the logits never stored
// Round 16 (section 54) added "r16a" and "r16b": r15 with every hidden layer on brain/conv2d.mjs's pixel-tiled kernel. Section
// 57 withdrew both, by section 56's rule: node-webgpu's FXC did not build that kernel at 32 -> 32 within 3 minutes on either
// GPU, at either edge, so no gate could run them natively there. The kernel stays in brain/conv2d.mjs; no set uses it.
// Round 18 (section 61) adds two sets for THE PAGE, in Chromium, on the adapters section 61's rule names:
//   "r18t"  r15 with every hidden layer on the pixel-tiled kernel at 2 pixels x 8 vec4s, edge zero, weights read where
//           they are used -- round 17's tile2-zero-inline, 1.14 and 1.17 x the fast kernel in Chrome at 1024 (section 60)
//   "r18u"  r15 with every hidden layer on the fast kernel with a block of 8 channels written out -- round 17's
//           fast-unroll, 2.11 x on the Intel in Chrome, 0.57 x on the 1080 (section 60)
// node-webgpu's FXC builds neither (section 60: it stopped on the first, crashed on the second), so they are FXC_UNBUILT_SETS:
// no gate builds them natively on a D3D12 adapter whose compiler is FXC (nativeSetsFor). The page runs
// pageKernelsFor(its adapter): PAGE_KERNELS_BY_ADAPTER's set for a measured adapter, PAGE_KERNELS for any other. Section 63
// filled the table: r18u on the Intel gen-9, r18t on the GTX 1080, in Chrome on Windows.
// Round 19 (section 66): node-webgpu 0.6.2 compiles with DXC, and built both sets' kernels in seconds, exact, on both of the
// rig's GPUs (section 65). So a native run whose compiler is DXC builds and times them too, and NATIVE_KERNELS_BY_ADAPTER --
// empty until section 66's rule is read off the rig -- may name one per native adapter, for a DXC run only. Every FXC run,
// and every adapter the table does not name, keeps DEFAULT_KERNELS.
// The page runs PAGE_KERNELS and every other caller DEFAULT_KERNELS. Section 43's rules, read off both GPUs' round-14 runs
// (section 49), put the page on r13 and the default on r14; section 46's, read off their round-15 runs (section 50), put
// both on r15 -- the later run's decision stands.
// Every set adds every cell in the same order, so all are held to the same twin, cell for cell. The pass runs DEFAULT_KERNELS
// unless told otherwise; section 39's outcome rule, read off the rig, is what may change it. The timing ladder times
// the sets it is handed, taking turns on one device.
"use strict";
import { conv2dWgsl, conv2dTiledWgsl, conv2dFastWgsl, conv2dHeadWgsl, packProbeUniforms, packFastUniforms, packHeadUniforms, fastShape, headShape,
         conv2dTileWgsl, packTileUniforms, tileShape, tileWorkgroups, conv2dFastAltWgsl, packFastAltUniforms, fastAltShape,
         planarToChannelsLast, conv2dCpu, conv2dCpuFma, TILE, K_MAX, COUT_MAX } from "../brain/conv2d.mjs";
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

// ---- k_apply_fast (round 14, section 43) ---------------------------------------------------------------------------
// Section 42: once round 13 sped up the convolutions, k_apply was half of a 1080p frame on the GTX 1080. Three things in
// it cost more than its arithmetic: each thread reads its 81 logits with neighbouring threads 81 floats apart; every tap's
// mask and colour are read from storage, by every pixel whose window covers it; and the 81 exponentials sit in a private
// array, which usually lives in memory. This is the same kernel with those three moved:
//   - the logits arrive PLANAR (the round 14 head writes them so: brain/conv2d.mjs's k_head), read with neighbouring
//     threads on neighbouring addresses;
//   - an 8 x 8 tile's 16 x 16 halo of colour and mask is loaded into workgroup memory once, and every tap read from it;
//   - the exponential is computed again in the last loop instead of being stored -- the same operation on the same
//     value, so the same number.
// The order of every sum is k_apply's, and so kernelApplyCpu's: it is held to the same twin within APPLY_TOL.
const HALO_A = 8 + 2 * KERNEL_RADIUS;
const BODY_APPLY_FAST = `
var<workgroup> S: array<vec4<f32>, ${HALO_A * HALO_A}>;   // the tile's halo: r, g, b, mask
@compute @workgroup_size(${TILE}, ${TILE})
fn k_apply_fast(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>,
                @builtin(workgroup_id) wid: vec3<u32>) {
    let ox = i32(wid.x * ${TILE}u) - ${KERNEL_RADIUS}; let oy = i32(wid.y * ${TILE}u) - ${KERNEL_RADIUS};
    for (var i = lid.y * ${TILE}u + lid.x; i < ${HALO_A * HALO_A}u; i = i + ${TILE * TILE}u) {
        let sx = ox + i32(i % ${HALO_A}u); let sy = oy + i32(i / ${HALO_A}u);
        var v = vec4<f32>(0.0);
        if (sx >= 0 && sx < i32(P.W) && sy >= 0 && sy < i32(P.H)) {
            let q = (u32(sy) * P.W + u32(sx)) * P.C;
            v = vec4<f32>(X[q], X[q + 1u], X[q + 2u], select(0.0, X[q + P.mc], P.mc != ${NO_MASK}u));
        }
        S[i] = v;
    }
    workgroupBarrier();
    let px = i32(gid.x); let py = i32(gid.y);
    if (gid.x >= P.W || gid.y >= P.H) { return; }
    let n = P.H * P.W; let p = gid.y * P.W + gid.x;
    let own = S[(lid.y + ${KERNEL_RADIUS}u) * ${HALO_A}u + lid.x + ${KERNEL_RADIUS}u].w;
    // a tap is weighed when it is inside the image and, with a mask, on the pixel's own side of it -- k_apply's tapOk,
    // its bounds on global coordinates and its mask read from the halo
    var m = 0.0; var have = false;
    for (var t = 0u; t < ${KERNEL_TAPS}u; t = t + 1u) {
        let dy = t / ${D}u; let dx = t % ${D}u;
        let qy = py + i32(dy) - ${KERNEL_RADIUS}; let qx = px + i32(dx) - ${KERNEL_RADIUS};
        if (qy < 0 || qy >= i32(P.H) || qx < 0 || qx >= i32(P.W)) { continue; }
        if (P.mc != ${NO_MASK}u && S[(lid.y + dy) * ${HALO_A}u + lid.x + dx].w != own) { continue; }
        let l = L[t * n + p]; if (!have || l > m) { m = l; have = true; }
    }
    var sum = 0.0;
    for (var t = 0u; t < ${KERNEL_TAPS}u; t = t + 1u) {
        let dy = t / ${D}u; let dx = t % ${D}u;
        let qy = py + i32(dy) - ${KERNEL_RADIUS}; let qx = px + i32(dx) - ${KERNEL_RADIUS};
        if (qy < 0 || qy >= i32(P.H) || qx < 0 || qx >= i32(P.W)) { continue; }
        if (P.mc != ${NO_MASK}u && S[(lid.y + dy) * ${HALO_A}u + lid.x + dx].w != own) { continue; }
        sum = sum + exp(L[t * n + p] - m);
    }
    var r = 0.0; var g = 0.0; var b = 0.0;
    for (var t = 0u; t < ${KERNEL_TAPS}u; t = t + 1u) {
        let dy = t / ${D}u; let dx = t % ${D}u;
        let qy = py + i32(dy) - ${KERNEL_RADIUS}; let qx = px + i32(dx) - ${KERNEL_RADIUS};
        if (qy < 0 || qy >= i32(P.H) || qx < 0 || qx >= i32(P.W)) { continue; }
        let s = S[(lid.y + dy) * ${HALO_A}u + lid.x + dx];
        if (P.mc != ${NO_MASK}u && s.w != own) { continue; }
        let wt = exp(L[t * n + p] - m) / sum;
        if (wt == 0.0) { continue; }
        r = r + wt * s.x; g = g + wt * s.y; b = b + wt * s.z;
    }
    let o = p * P.C;
    Y[p * 3u] = r * max(X[o + 3u], P.floor); Y[p * 3u + 1u] = g * max(X[o + 4u], P.floor); Y[p * 3u + 2u] = b * max(X[o + 5u], P.floor);
}
`;
/** The fast kernel apply (entry k_apply_fast): k_apply's bindings, the logits at 2 PLANAR (81 planes of H x W). */
export function kernelApplyFastWgsl() { return DECL_APPLY.replace(`H x W x ${KERNEL_TAPS}, the head's logits`, `PLANAR: ${KERNEL_TAPS} planes of H x W, the head's logits`) + BODY_APPLY_FAST; }

// ---- k_head_apply (round 15, section 46) ---------------------------------------------------------------------------
// Round 14 wrote the 81 logits to storage (k_head) and read them back three times (k_apply_fast's three loops). At 1080p
// that buffer is 672 MB, the largest the pass allocates, and it is written once and read three times a frame. This is
// the head and the kernel apply in one pass, the logits never leaving the thread:
//   - each pixel's 81 logits are 21 named vec4 accumulators, each lane one cell, added b then ci in order -- k_head's sum,
//     so conv2dCpu's (or the fused mirror's);
//   - the 81 taps are unrolled, so a tap's logit is a NAMED lane (a9.y), never an index into a private array -- which a
//     compiler would put in memory, the thing round 14's dump counts as an indexable temp;
//   - which taps are weighed (inside the image, on the pixel's side of the mask) is decided once, as k_apply_fast decides
//     it, into three words of bits; then k_apply_fast's three sums, in its order, over the same halo in workgroup memory.
// No cell is stored, so no cell can be judged on its own: the image is judged, against kernelApplyCpu on the twin's logits
// and on the fused mirror's, from the device's own input to the head (judgeHeadApply).
/** The fused head and kernel apply (entry k_head_apply), generated for a 1 x 1 head of KERNEL_TAPS logits. */
export function kernelHeadApplyWgsl({ Cin, Cout, k, act = "none" }) {
    const S = headShape({ Cin, Cout, k });
    if (Cout !== KERNEL_TAPS || !S.fits) throw new Error(`denoiseDevice: the fused head holds a 1 x 1 layer of ${KERNEL_TAPS} logits whose weights fit one uniform binding, got ${Cin} -> ${Cout}, k ${k}, ${S.bytes} bytes`);
    const G = S.C4, js = Array.from({ length: G }, (_, j) => j), lanes = ["x", "y", "z", "w"], taps = Array.from({ length: KERNEL_TAPS }, (_, t) => t);
    const lg = (t) => `a${t >> 2}.${lanes[t & 3]}`, on = (t) => `(ok${t >> 5} & ${(1 << (t & 31)) >>> 0}u) != 0u`;
    const halo = (t) => `S[(lid.y + ${Math.floor(t / D)}u) * ${HALO_A}u + lid.x + ${t % D}u]`;
    const off = (d) => (d - KERNEL_RADIUS < 0 ? ` - ${KERNEL_RADIUS - d}` : d - KERNEL_RADIUS > 0 ? ` + ${d - KERNEL_RADIUS}` : "");
    return `
struct AP { H: u32, W: u32, C: u32, mc: u32, floor: f32, pad0: u32, pad1: u32, pad2: u32 };
struct HP { H: u32, W: u32, pad0: u32, pad1: u32, b: array<vec4<f32>, ${G}>, w: array<vec4<f32>, ${Cin * G}> };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // H x W x 3
@group(0) @binding(1) var<uniform> P: AP;                        // packApplyUniforms
@group(0) @binding(2) var<uniform> F: HP;                        // packHeadUniforms: the head's bias and weights
@group(0) @binding(3) var<storage, read>       A: array<f32>;   // H x W x ${Cin}, the head's input, channels last
@group(0) @binding(4) var<storage, read>       X: array<f32>;   // H x W x C, the network's input
var<workgroup> S: array<vec4<f32>, ${HALO_A * HALO_A}>;   // the tile's halo: r, g, b, mask
@compute @workgroup_size(${TILE}, ${TILE})
fn k_head_apply(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>,
                @builtin(workgroup_id) wid: vec3<u32>) {
    let ox = i32(wid.x * ${TILE}u) - ${KERNEL_RADIUS}; let oy = i32(wid.y * ${TILE}u) - ${KERNEL_RADIUS};
    for (var i = lid.y * ${TILE}u + lid.x; i < ${HALO_A * HALO_A}u; i = i + ${TILE * TILE}u) {
        let sx = ox + i32(i % ${HALO_A}u); let sy = oy + i32(i / ${HALO_A}u);
        var v = vec4<f32>(0.0);
        if (sx >= 0 && sx < i32(P.W) && sy >= 0 && sy < i32(P.H)) {
            let q = (u32(sy) * P.W + u32(sx)) * P.C;
            v = vec4<f32>(X[q], X[q + 1u], X[q + 2u], select(0.0, X[q + P.mc], P.mc != ${NO_MASK}u));
        }
        S[i] = v;
    }
    workgroupBarrier();
    let px = i32(gid.x); let py = i32(gid.y);
    if (gid.x >= P.W || gid.y >= P.H) { return; }
    let p = gid.y * P.W + gid.x;
    // the head: ${KERNEL_TAPS} logits as ${G} vec4s, each lane one cell, b then ci in order
    ${js.map((j) => `var a${j} = F.b[${j}u];`).join("\n    ")}
    let xo = p * ${Cin}u;
    for (var ci = 0u; ci < ${Cin}u; ci = ci + 1u) {
        let v = A[xo + ci]; let w = ci * ${G}u;
        ${js.map((j) => `a${j} = a${j} + v * F.w[w + ${j}u];`).join("\n        ")}
    }
    ${act === "relu" ? js.map((j) => `a${j} = max(a${j}, vec4<f32>(0.0));`).join("\n    ") : ""}
    // the taps the kernel weighs: inside the image and, with a mask, on the pixel's own side of it -- k_apply_fast's test
    let own = S[(lid.y + ${KERNEL_RADIUS}u) * ${HALO_A}u + lid.x + ${KERNEL_RADIUS}u].w;
    let free = P.mc == ${NO_MASK}u;
    var ok0 = 0u; var ok1 = 0u; var ok2 = 0u;
    ${taps.map((t) => { const dy = Math.floor(t / D), dx = t % D;
        return `if (py${off(dy)} >= 0 && py${off(dy)} < i32(P.H) && px${off(dx)} >= 0 && px${off(dx)} < i32(P.W) && (free || ${halo(t)}.w == own)) { ok${t >> 5} = ok${t >> 5} | ${(1 << (t & 31)) >>> 0}u; }`; }).join("\n    ")}
    var m = 0.0; var have = false;
    ${taps.map((t) => `if (${on(t)}) { let l = ${lg(t)}; if (!have || l > m) { m = l; have = true; } }`).join("\n    ")}
    var sum = 0.0;
    ${taps.map((t) => `if (${on(t)}) { sum = sum + exp(${lg(t)} - m); }`).join("\n    ")}
    var r = 0.0; var g = 0.0; var b = 0.0;
    ${taps.map((t) => `if (${on(t)}) { let wt = exp(${lg(t)} - m) / sum; if (wt != 0.0) { let s = ${halo(t)}; r = r + wt * s.x; g = g + wt * s.y; b = b + wt * s.z; } }`).join("\n    ")}
    let o = p * P.C;
    Y[p * 3u] = r * max(X[o + 3u], P.floor); Y[p * 3u + 1u] = g * max(X[o + 4u], P.floor); Y[p * 3u + 2u] = b * max(X[o + 5u], P.floor);
}
`;
}

/**
 * The fused pass judged (section 46): its image against kernelApplyCpu on the head's twin logits and on its fused mirror's,
 * both from `input`, the device's own input to the head. A value passes within APPLY_TOL of either -- a compiler that
 * contracts the head's adds gives the mirror's logits, one that does not gives the twin's. { worst, twin, mirror }: the
 * worst of the nearer, and the worst against each.
 */
export function judgeHeadApply(x, input, L, y, H, W) {
    const tw = kernelApplyCpu(x, conv2dCpu(input, H, W, L), H, W), fm = kernelApplyCpu(x, conv2dCpuFma(input, H, W, L), H, W);
    const rel = (a, b) => Math.abs(a - b) / (Math.abs(b) + 1e-30);
    let worst = 0, twin = 0, mirror = 0;
    for (let c = 0; c < tw.length; c++) { const a = rel(y[c], tw[c]), b = rel(y[c], fm[c]); twin = Math.max(twin, a); mirror = Math.max(mirror, b); worst = Math.max(worst, Math.min(a, b)); }
    return { worst, twin, mirror };
}

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

/** The kernel sets a pass can run on: round 12's, round 13's fast kernel (section 39), round 14's (section 43), round 15's (section 46), round 18's two (section 61). */
export const KERNEL_SETS = Object.freeze(["r12", "r13", "r14", "r15", "r18t", "r18u"]);
/**
 * Round 18 (section 61): the kernel each round-18 set runs its hidden layers on, and that kernel's configuration --
 * brain/conv2d.mjs's pixel-tiled kernel (tileShape's cfg) or its fast kernel written another way (fastAltShape's opts).
 */
export const R18_KERNELS = Object.freeze({
    r18t: Object.freeze({ kernel: "tile_inline", cfg: Object.freeze({ px: 2, g4: 8, edge: "zero", weights: "inline" }) }),
    r18u: Object.freeze({ kernel: "fast_unroll", cfg: Object.freeze({ reads: "f32", unroll: true }) }),
});
/**
 * The sets no gate builds natively on a D3D12 adapter whose compiler is FXC: node-webgpu 0.6.0's FXC stopped on r18t's kernel
 * and crashed on r18u's (section 60). Round 18 called them browser-only; 0.6.2's DXC built both natively (section 65).
 */
export const FXC_UNBUILT_SETS = Object.freeze(["r18t", "r18u"]);
/** A NATIVE adapter (node-webgpu's) that compiles through D3D12: its description names the backend, never the compiler (section 66). */
export const isD3D12Native = (adapter) => /\bD3D12\b/i.test(adapter?.info?.description || "");
/** A native run's compiler is DXC: as tools/ship/headlessGpu.mjs's nativeCompiler names it ("DXC"), or a dump read it ("DXC (DXIL)"). Anything else, or none, is not. */
export const isDxcCompiler = (compiler) => /^DXC\b/.test(compiler || "");
/**
 * `sets` as a native ladder or gate may build them on `adapter`, whose run compiles with `compiler`: on a D3D12 adapter whose
 * compiler is not DXC, without FXC_UNBUILT_SETS -- no compiler named counts as FXC, the safe side. Never for a browser's adapter.
 */
export const nativeSetsFor = (adapter, sets, { compiler = null } = {}) =>
    (isD3D12Native(adapter) && !isDxcCompiler(compiler) ? sets.filter((s) => !FXC_UNBUILT_SETS.includes(s)) : [...sets]);
/**
 * The sets the ladders time: r12, the reference every speedup is read against; r15, the default and the page's (section 50);
 * and round 18's two (section 61) -- on the page always, natively where nativeSetsFor allows (since section 66, a DXC run on D3D12 too). Section 54 added round 16's two
 * candidates and section 57 withdrew them; r13 and r14 are decided (sections 49 and 50) and left out.
 */
export const TIMED_SETS = Object.freeze(["r12", "r15", "r18t", "r18u"]);
/** The set a pass runs unless told otherwise: r15, by section 46's default rule on both GPUs (section 50) -- 9.25 x against r14's 6.33. */
export const DEFAULT_KERNELS = "r15";
/** The set denoise.html runs on an adapter PAGE_KERNELS_BY_ADAPTER does not name: r15, by section 46's page rule on both GPUs (section 50) -- 9.25 x against r13's 6.49 and r14's 6.33. */
export const PAGE_KERNELS = "r15";
/**
 * Round 18: the set denoise.html runs on an adapter section 61's rule measured, by pageAdapterKey. Section 63 read the rule
 * off both GPUs' round-18 runs, in Chrome on Windows: on the Intel gen-9, r18u's pass was 1.524 x r15's at 1024 x 1024 and
 * r18t's 1.026 x (under 1.05); on the GTX 1080, r18t's was 1.087 x at 1920 x 1080 and r18u's 0.657 x. Only a Chromium browser
 * on the measured platform makes a key that can match.
 */
export const PAGE_KERNELS_BY_ADAPTER = Object.freeze({ "Windows/intel/gen-9": "r18u", "Windows/nvidia/pascal": "r18t" });
/**
 * The page's key for an adapter: "<platform>/<vendor>/<architecture>", the platform from navigator.userAgentData -- which only
 * Chromium browsers have, so any other browser makes no key and runs PAGE_KERNELS. Section 61's sets were measured in Chrome
 * on Windows, through its D3D12 compiler (DXC), and nowhere else.
 */
export const pageAdapterKey = (info, uaData) => (uaData && uaData.platform && info && info.vendor ? `${uaData.platform}/${info.vendor}/${info.architecture || ""}` : null);
/** The set denoise.html runs for an adapter's key: PAGE_KERNELS_BY_ADAPTER's, else PAGE_KERNELS. */
export const pageKernelsFor = (key, table = PAGE_KERNELS_BY_ADAPTER) => (key && Object.hasOwn(table, key) ? table[key] : PAGE_KERNELS);
/**
 * Round 19: the set a NATIVE run takes by default on an adapter section 66's rule measured, by nativeAdapterKey -- for a run
 * whose compiler is DXC only, since FXC builds neither round-18 set (section 60). Empty until section 66's rule is read off
 * both GPUs' round-19 runs; until then, and on every other adapter and every FXC run, nativeKernelsFor gives DEFAULT_KERNELS.
 */
export const NATIVE_KERNELS_BY_ADAPTER = Object.freeze({});
/** A native adapter's key: "<platform>/<vendor>/<architecture>", the platform Node's (process.platform), so "win32/nvidia/pascal". */
export const nativeAdapterKey = (info, platform) => (platform && info && info.vendor ? `${platform}/${info.vendor}/${info.architecture || ""}` : null);
/** The set a native run takes for its adapter's key under `compiler`: NATIVE_KERNELS_BY_ADAPTER's when the compiler is DXC, else DEFAULT_KERNELS. */
export const nativeKernelsFor = (key, compiler, table = NATIVE_KERNELS_BY_ADAPTER) =>
    (isDxcCompiler(compiler) && key && Object.hasOwn(table, key) ? table[key] : DEFAULT_KERNELS);

/**
 * The kernel a layer runs on in a set. r12: tiled when the tiled kernel can hold it, direct otherwise (the 81-logit
 * head). r13: the fast kernel when its uniform block and tile fit the device's default limits, else the layer's r12 kernel.
 * r14: r13's, except that the LAST layer (`last`), when it is 1 x 1 and fits, runs the head kernel and writes planar --
 * only the last, because only k_apply_fast reads a planar layer. r15: r13's, except that the last layer, when it is the 1 x 1
 * head of KERNEL_TAPS logits and fits, runs with the kernel apply as one pass, k_head_apply. r18t and r18u: r15's last layer;
 * every other layer on the set's R18_KERNELS kernel when it fits, else r15's kernel for it.
 */
export const kernelFor = (L, set = DEFAULT_KERNELS, last = false) => {
    if (!KERNEL_SETS.includes(set)) throw new Error(`denoiseDevice: no kernel set "${set}" -- the sets are ${KERNEL_SETS.join(", ")}`);
    if (set === "r14" && last && headShape(L).fits) return "head";
    if ((set === "r15" || set in R18_KERNELS) && last && L.Cout === KERNEL_TAPS && headShape(L).fits) return "head_apply";
    if (set === "r18t" && tileShape(L, R18_KERNELS.r18t.cfg).fits) return "tile_inline";
    if (set === "r18u" && fastAltShape(L, R18_KERNELS.r18u.cfg).fits) return "fast_unroll";
    return set !== "r12" && fastShape(L).fits ? "fast" : L.k <= K_MAX && L.Cout <= COUT_MAX ? "tiled" : "direct";
};
/**
 * The kernel apply a set runs: k_apply_fast when the set's last layer is planar (the head kernel), "head_apply" when the
 * last layer IS the apply (k_head_apply -- no pass of its own), k_apply otherwise.
 */
export const applyFor = (layers) => { const k = layers[layers.length - 1].kernel; return k === "head" ? "apply_fast" : k === "head_apply" ? "head_apply" : "apply"; };

/** A network's layers as the device takes them: f32 weights and biases, each layer's kernel in `set` named. */
export function deviceLayers(net, set = DEFAULT_KERNELS) {
    if (headOf(net) !== "kernel") throw new Error("denoiseDevice: only the kernel-predicting network runs on the device");
    return net.layers.map((L, i) => ({ Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act ?? "none", W: Float32Array.from(L.W), b: Float32Array.from(L.b),
                                       kernel: kernelFor(L, set, i === net.layers.length - 1) }));
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
    for (const [i, L] of layers.entries()) if (L.kernel === "tile_inline") await build("tile_inline" + i, conv2dTileWgsl(L, R18_KERNELS.r18t.cfg), "k_conv_tile");
    for (const [i, L] of layers.entries()) if (L.kernel === "fast_unroll") await build("fast_unroll" + i, conv2dFastAltWgsl(L, R18_KERNELS.r18u.cfg), "k_conv_fast_alt");
    for (const [i, L] of layers.entries()) if (L.kernel === "head") await build("head" + i, conv2dHeadWgsl(L), "k_head");
    for (const [i, L] of layers.entries()) if (L.kernel === "head_apply") await build("head_apply" + i, kernelHeadApplyWgsl(L), "k_head_apply");
    const apply = applyFor(layers);
    if (apply !== "head_apply") await build("apply", apply === "apply_fast" ? kernelApplyFastWgsl() : kernelApplyWgsl(), apply === "apply_fast" ? "k_apply_fast" : "k_apply");
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
    // a fused last layer (k_head_apply) writes the image, so its logits get no buffer -- the one round 15 removes
    const outs = layers.map((L) => (L.kernel === "head_apply" ? null : buffer(H * W * L.Cout * 4, S)));
    const yBuf = buffer(H * W * 3 * 4, S);
    const groups = [Math.ceil(W / TILE), Math.ceil(H / TILE)];
    const applyUni = buffer(32, BU.UNIFORM | BU.COPY_DST, packApplyUniforms({ H, W, C }));
    const steps = layers.map((L, i) => {
        if (L.kernel === "head_apply") {
            // the head and the kernel apply in one pass: the head's weights in their uniform block, the image out
            const p = pipe["head_apply" + i], uni = packHeadUniforms({ H, W, layer: L });
            return { p, wg: [...groups, 1], bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
                { binding: 0, resource: { buffer: yBuf } }, { binding: 1, resource: { buffer: applyUni } },
                { binding: 2, resource: { buffer: buffer(uni.byteLength, BU.UNIFORM | BU.COPY_DST, uni) } },
                { binding: 3, resource: { buffer: i ? outs[i - 1] : xBuf } }, { binding: 4, resource: { buffer: xBuf } }] }) };
        }
        if (L.kernel === "head") {
            // the head kernel: a thread per pixel and vec4 of outputs, written planar for k_apply_fast
            const p = pipe["head" + i], uni = packHeadUniforms({ H, W, layer: L });
            return { p, wg: [Math.ceil(H * W / 64), headShape(L).C4, 1], bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
                { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: buffer(uni.byteLength, BU.UNIFORM | BU.COPY_DST, uni) } },
                { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } }] }) };
        }
        if (L.kernel === "fast") {
            // the fast kernel: its weights and bias in the uniform block, the image alone at binding 2, a z group per FAST_GROUP channels
            const p = pipe["fast" + i], uni = packFastUniforms({ H, W, layer: L });
            return { p, wg: [...groups, fastShape(L).groups], bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
                { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: buffer(uni.byteLength, BU.UNIFORM | BU.COPY_DST, uni) } },
                { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } }] }) };
        }
        if (L.kernel === "tile_inline") {
            // round 18's r18t: the pixel-tiled kernel, the fast kernel's bindings, a workgroup per TILE px x TILE pixels
            const cfg = R18_KERNELS.r18t.cfg, p = pipe["tile_inline" + i], uni = packTileUniforms({ H, W, layer: L }, cfg);
            return { p, wg: tileWorkgroups(H, W, L, cfg), bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
                { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: buffer(uni.byteLength, BU.UNIFORM | BU.COPY_DST, uni) } },
                { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } }] }) };
        }
        if (L.kernel === "fast_unroll") {
            // round 18's r18u: the fast kernel's thread, bindings and dispatch, its weights packed block by block
            const cfg = R18_KERNELS.r18u.cfg, p = pipe["fast_unroll" + i], uni = packFastAltUniforms({ H, W, layer: L }, cfg);
            return { p, wg: [...groups, fastAltShape(L, cfg).groups], bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
                { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: buffer(uni.byteLength, BU.UNIFORM | BU.COPY_DST, uni) } },
                { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } }] }) };
        }
        const p = pipe[L.kernel];
        const uni = buffer(32, BU.UNIFORM | BU.COPY_DST, packProbeUniforms({ H, W, Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act, tiled: L.kernel === "tiled" }));
        return { p, wg: [...groups, 1], bind: dev.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [
            { binding: 0, resource: { buffer: outs[i] } }, { binding: 1, resource: { buffer: uni } }, { binding: 2, resource: { buffer: i ? outs[i - 1] : xBuf } },
            { binding: 3, resource: { buffer: buffer(L.W.length * 4, BU.STORAGE | BU.COPY_DST, L.W) } }, { binding: 4, resource: { buffer: buffer(L.b.length * 4, BU.STORAGE | BU.COPY_DST, L.b) } }] }) };
    });
    if (apply !== "head_apply") steps.push({ p: pipe.apply, wg: [...groups, 1], bind: dev.createBindGroup({ layout: pipe.apply.getBindGroupLayout(0), entries: [
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
            // every layer read back channels last, as the twin computes it: a planar layer (the head kernel's) is transposed,
            // and a fused one (k_head_apply's) has no output but the image -- null, judged through it (judgeHeadApply)
            const acts = keep ? await Promise.all(layers.map(async (L, i) => { if (!outs[i]) return null; const v = await readBack(outs[i], H * W * L.Cout);
                return L.kernel === "head" ? planarToChannelsLast(v, H * W, L.Cout) : v; })) : null;
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
                     passes: [...layers.map((L, i) => (L.kernel === "head_apply" ? `layer ${i} and kernel (head_apply, ${L.Cin} -> ${L.Cout} -> 3)` : `layer ${i} (${L.kernel}, ${L.Cin} -> ${L.Cout})`)),
                              ...(apply === "head_apply" ? [] : [`kernel (${apply})`])] };
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
/**
 * The storage a pass at H x W allocates in a kernel set, in bytes: the input, every layer's output but a fused last one
 * (r15's k_head_apply keeps its logits in the thread), and the image -- uniform blocks left out. Round 15 reports it.
 */
export const passBytes = (net, H, W, set = DEFAULT_KERNELS) => H * W * 4 *
    (net.layers[0].Cin + deviceLayers(net, set).reduce((a, L) => a + (L.kernel === "head_apply" ? 0 : L.Cout), 0) + 3);
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
 * speedup: { [set]: [{ H, W, measured, clock, ratio }] } -- for each set after the first, the first set's median over its
 * own, on the device's clock where both have one (round 14: three sets, r12 the reference) -- and invisible: { [set]: bool } }.
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
    const A = sets[0], speedup = {};
    for (const B of sets.slice(1)) speedup[B] = rows[A].map((a, i) => {
        const b = rows[B][i];
        if (a.skipped || b.skipped) return { H: a.H, W: a.W, measured: false };
        const clock = a.gpu && b.gpu ? "device" : "wall";
        return { H: a.H, W: a.W, measured: true, clock, ratio: clock === "device" ? a.gpu.median / b.gpu.median : a.wall.median / b.wall.median };
    });
    return { adapter, sets: [...sets], rows, speedup, invisible };
}
