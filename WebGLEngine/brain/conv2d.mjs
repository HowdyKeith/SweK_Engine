// WebGLEngine/brain/conv2d.mjs -- the denoiser arc, round 1: a 2-D convolution layer, on the CPU and on the device
//
// *** THE TREE HAD NO CONVOLUTION. *** brain/mlp.js multiplies a batch of vectors by a dense matrix; a network that
// looks at an IMAGE -- a path-tracer denoiser, the first target of this arc -- needs a layer whose weights are shared
// across every pixel and see only a small window around it. This module is that layer, in the shape
// docs/GPU-KERNEL-CONTRACT.md asks of a kernel: WGSL producers, a packer, the CPU twin in the kernel's own summation
// order, a key and a PROBES manifest -- and, because a network has to be TRAINED, the f64 reference forward AND
// backward pass the training rounds will stand on. tools/ship/conv2d-selfcheck.mjs gates all of it.
//
// ---- THE LAYER --------------------------------------------------------------------------------------------------
//
//   input   x: H x W x Cin, CHANNELS LAST (pixel-major, a pixel's channels contiguous) -- the layout
//           physics/render/pathTracer.mjs's render({ rgb: true }) already returns, so a noisy frame needs no
//           transpose to become an input
//   weights W: Cout x k x k x Cin, the input channel innermost so both reads in the inner loop are contiguous
//   bias    b: Cout
//   output  y: H x W x Cout, y = act(b + sum over the k x k window and the Cin channels of x * W)
//   k odd (1 or 3 here), stride 1, "same" size: taps that fall outside the image are SKIPPED rather than read as
//   zero. Skipping and adding a zero are the same sum except in the sign of a zero, and skipping is what the kernel
//   does, so the twin skips too -- the bit-identity claim is about the order the device actually adds in.
//
// ---- ONE ORDER, THREE PLACES -------------------------------------------------------------------------------------
//
// acc = b[co]; then for each BLOCK of CB input channels, for ky, for kx (in bounds), for ci in the block:
// acc = acc + x * W. conv2dForward (f64, the reference),
// conv2dCpu (Math.fround after every operation -- the twin) and both WGSL kernels add in exactly this order. The
// TILED kernel loads the window into workgroup memory first and then walks the same order out of it, so tiling
// moves where a number is READ from and never which numbers are added when: it is held to the same twin, at zero.
// *** THE BLOCKS ARE IN THE ORDER BECAUSE OF SWIFTSHADER, AND THAT IS WHY THEY ARE IN EVERY COPY OF IT. *** The first
// tiled kernel loaded every channel of the halo'd tile at once, (8+2)^2 x 32 x 4 B = 12,800 B of workgroup memory,
// and SwiftShader took 3,149 ms to build its pipeline (6,400 B: 521 ms; the direct kernel: 24 ms) -- a JIT cost that
// grows faster than the array, measured, not a GPU one. Loading CB channels at a time keeps the tile at 3,200 B, but
// only if the SUM walks the channels block by block too; so the canonical order is block-outer everywhere, and a
// layer with Cin <= CB is summed exactly as the plain order would sum it.
// WGSL lets a compiler contract `acc + x * W` into one fma (brainTsl.mjs's mlpLayerCpuFma found 56 cells move on
// Keith's NVIDIA box for the MLP), so conv2dCpuFma is the fused mirror, and a cell a device computes is held to
// one or the other -- explained, not tolerated.
// *** ONE KERNEL HERE IS THE EXCEPTION, AND SAYS SO: *** round 27's Winograd kernel (section 83, below) adds transformed numbers in a
// transformed domain, so it is held to a twin of its own, conv2dCpuWino, and never to conv2dCpu.
"use strict";

export const TILE = 8;          // the tiled kernel's workgroup is TILE x TILE output pixels
export const K_MAX = 3;         // the tiled kernel's halo is sized for this kernel width
export const CB = 8;            // input channels are summed in BLOCKS of this many -- see "one order" above
export const COUT_MAX = 32;     // the tiled kernel keeps one accumulator per output channel in private memory
const ACT = Object.freeze({ none: 0, relu: 1 });

function check(H, W, layer) {
    const { Cin, Cout, k } = layer;
    if (!(k % 2 === 1 && k >= 1)) throw new Error("conv2d: k must be odd, got " + k);
    if (layer.W.length !== Cout * k * k * Cin) throw new Error(`conv2d: W holds ${layer.W.length}, Cout*k*k*Cin is ${Cout * k * k * Cin}`);
    if (layer.b.length !== Cout) throw new Error(`conv2d: b holds ${layer.b.length}, Cout is ${Cout}`);
    if (!(H > 0 && W > 0)) throw new Error("conv2d: empty image");
    if (!(String(layer.act ?? "none") in ACT)) throw new Error("conv2d: act must be none or relu, got " + layer.act);
}

/**
 * The reference forward pass in f64, or -- with `round` -- in f32 with a rounding after every operation, which is
 * the twin. `pre` returns the value before the activation, which the backward pass needs. Round 41: `round` may be a
 * rounding function instead of true -- f16round, for the half-precision twin (every value an f16 is also an f32).
 */
function forward(x, H, W, layer, round, fused, pre) {
    check(H, W, layer);
    const { Cin, Cout, k } = layer, r = (k - 1) / 2, relu = String(layer.act ?? "none") === "relu";
    const f = round === true ? Math.fround : round ? round : (v) => v;
    const y = round ? new Float32Array(H * W * Cout) : new Float64Array(H * W * Cout);
    const z = pre ? new Float64Array(H * W * Cout) : null;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) for (let co = 0; co < Cout; co++) {
        let acc = f(layer.b[co]);
        for (let c0 = 0; c0 < Cin; c0 += CB) {
            const c1 = Math.min(c0 + CB, Cin);
            for (let ky = 0; ky < k; ky++) {
                const sy = py + ky - r; if (sy < 0 || sy >= H) continue;
                for (let kx = 0; kx < k; kx++) {
                    const sx = px + kx - r; if (sx < 0 || sx >= W) continue;
                    const xo = (sy * W + sx) * Cin, wo = ((co * k + ky) * k + kx) * Cin;
                    if (fused) for (let ci = c0; ci < c1; ci++) acc = f(f(x[xo + ci]) * f(layer.W[wo + ci]) + acc);
                    else for (let ci = c0; ci < c1; ci++) acc = f(acc + f(f(x[xo + ci]) * f(layer.W[wo + ci])));
                }
            }
        }
        const o = (py * W + px) * Cout + co;
        if (z) z[o] = acc;
        y[o] = relu ? f(Math.max(acc, 0)) : acc;
    }
    return pre ? { y, z } : y;
}

/** The f64 reference forward pass: H x W x Cout. */
export function conv2dForward(x, H, W, layer) { return forward(x, H, W, layer, false, false, false); }
/** The twin: f32, rounded after every operation, in the kernels' order. */
export function conv2dCpu(x, H, W, layer) { return forward(x, H, W, layer, true, false, false); }
/** The fused mirror: each multiply-add rounded once, as a compiler that contracts it to an fma would. */
export function conv2dCpuFma(x, H, W, layer) { return forward(x, H, W, layer, true, true, false); }

// ---- HALF PRECISION (the denoiser arc, round 41: pre-registration section 109) -------------------------------------------
/**
 * x rounded to the nearest IEEE binary16 value, ties to even, as a WGSL f16 operation rounds (its +, - and * are correctly
 * rounded): subnormals below 2^-14, the largest finite 65504, and anything from 65520 up (half way to the next binade) infinite.
 * Node 22 has no Math.f16round. Exact: the quantum is a power of two, so every step is exact in f64.
 */
export function f16round(x) {
    if (!Number.isFinite(x) || x === 0) return x;
    const s = x < 0 ? -1 : 1, a = Math.abs(x);
    let e = Math.floor(Math.log2(a));
    if (2 ** e > a) e--; else if (2 ** (e + 1) <= a) e++;
    const q = 2 ** (Math.max(e, -14) - 10), r = a / q, fl = Math.floor(r), d = r - fl;
    const n = d > 0.5 ? fl + 1 : d < 0.5 ? fl : fl % 2 === 0 ? fl : fl + 1, v = n * q;
    return v > 65504 ? s * Infinity : s * v;
}
/** A binary16's 16 bits, from a value f16round leaves as it is: sign, five exponent bits, ten mantissa bits. */
export function f16bits(v) {
    if (Number.isNaN(v)) return 0x7e00;
    const s = v < 0 || Object.is(v, -0) ? 0x8000 : 0, a = Math.abs(v);
    if (a === Infinity) return s | 0x7c00;
    if (a === 0) return s;
    if (a < 2 ** -14) return s | Math.round(a / 2 ** -24);                       // subnormal: the mantissa alone
    const e = Math.floor(Math.log2(a)), E = 2 ** e > a ? e - 1 : 2 ** (e + 1) <= a ? e + 1 : e;
    return s | ((E + 15) << 10) | Math.round((a / 2 ** E - 1) * 1024);
}
/** The half-precision twin: every input, weight and bias taken as f16, every product and sum rounded to f16, in the kernels' order. */
export function conv2dCpuF16(x, H, W, layer) { return forward(x, H, W, layer, f16round, false, false); }
/** Its fused mirror: each f16 multiply-add rounded once, as a compiler that contracts it to an fma would. */
export function conv2dCpuF16Fma(x, H, W, layer) { return forward(x, H, W, layer, f16round, true, false); }

/**
 * The f64 backward pass. `dY` is the loss's gradient with respect to this layer's OUTPUT (after the activation).
 * Returns { dX, dW, db } -- with respect to the input, the weights and the bias. The relu's gradient is taken as 0
 * where the pre-activation is exactly 0, the usual subgradient.
 *
 * `y`, when given, is this layer's own forward output for `x`, and the relu mask is read from it (y > 0 exactly when
 * z > 0) instead of re-running the forward pass -- which a network's training loop already ran and kept. Same
 * gradients, bit for bit (conv2d-selfcheck section 4 holds it); a third of the work.
 */
export function conv2dBackward(x, H, W, layer, dY, { y = null } = {}) {
    check(H, W, layer);
    const z = y ? null : forward(x, H, W, layer, false, false, true).z;
    const live = (o) => (y ? y[o] > 0 : z[o] > 0);
    const { Cin, Cout, k } = layer, r = (k - 1) / 2, relu = String(layer.act ?? "none") === "relu";
    if (dY.length !== H * W * Cout) throw new Error(`conv2d: dY holds ${dY.length}, H*W*Cout is ${H * W * Cout}`);
    const dX = new Float64Array(H * W * Cin), dW = new Float64Array(layer.W.length), db = new Float64Array(Cout);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) for (let co = 0; co < Cout; co++) {
        const o = (py * W + px) * Cout + co;
        const g = relu && !live(o) ? 0 : dY[o];
        if (g === 0) continue;
        db[co] += g;
        for (let ky = 0; ky < k; ky++) {
            const sy = py + ky - r; if (sy < 0 || sy >= H) continue;
            for (let kx = 0; kx < k; kx++) {
                const sx = px + kx - r; if (sx < 0 || sx >= W) continue;
                const xo = (sy * W + sx) * Cin, wo = ((co * k + ky) * k + kx) * Cin;
                for (let ci = 0; ci < Cin; ci++) { dW[wo + ci] += g * x[xo + ci]; dX[xo + ci] += g * layer.W[wo + ci]; }
            }
        }
    }
    return { dX, dW, db };
}

// ---- THE DEVICE ------------------------------------------------------------------------------------------------

const DECL_PROBE = `
struct CP { H: u32, W: u32, Cin: u32, Cout: u32, k: u32, act: u32, pad0: u32, pad1: u32 };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // H x W x Cout
@group(0) @binding(1) var<uniform> P: CP;
@group(0) @binding(2) var<storage, read>       X: array<f32>;   // H x W x Cin
@group(0) @binding(3) var<storage, read>       Wt: array<f32>;  // Cout x k x k x Cin
@group(0) @binding(4) var<storage, read>       B: array<f32>;   // Cout`;

// one thread per output PIXEL, every output channel in turn, reading the image straight from storage
const BODY_DIRECT = `
@compute @workgroup_size(${TILE}, ${TILE})
fn k_conv(@builtin(global_invocation_id) gid: vec3<u32>) {
    let px = gid.x; let py = gid.y;
    if (px >= P.W || py >= P.H) { return; }
    let r = i32(P.k / 2u);
    for (var co = 0u; co < P.Cout; co = co + 1u) {
        var acc = B[co];
        for (var c0 = 0u; c0 < P.Cin; c0 = c0 + ${CB}u) {
            let c1 = min(c0 + ${CB}u, P.Cin);
            for (var ky = 0u; ky < P.k; ky = ky + 1u) {
                let sy = i32(py) + i32(ky) - r;
                if (sy < 0 || sy >= i32(P.H)) { continue; }
                for (var kx = 0u; kx < P.k; kx = kx + 1u) {
                    let sx = i32(px) + i32(kx) - r;
                    if (sx < 0 || sx >= i32(P.W)) { continue; }
                    let xo = (u32(sy) * P.W + u32(sx)) * P.Cin;
                    let wo = ((co * P.k + ky) * P.k + kx) * P.Cin;
                    for (var ci = c0; ci < c1; ci = ci + 1u) { acc = acc + X[xo + ci] * Wt[wo + ci]; }
                }
            }
        }
        if (P.act == 1u) { acc = max(acc, 0.0); }
        Y[(py * P.W + px) * P.Cout + co] = acc;
    }
}
`;

// the same arithmetic out of workgroup memory: for each block of CB input channels, the TILE x TILE block and its halo
// are loaded once by all 64 threads, and every output channel of every pixel adds that block's window out of the tile
// into its own accumulator. Both barriers sit in uniform control flow (the block loop's bound is a uniform; no thread
// returns early); the bounds test that skips an out-of-image tap is on GLOBAL coordinates, exactly as in the direct
// kernel, so every sum is the same sum in the same order.
const HALO = TILE + K_MAX - 1;
const BODY_TILED = `
var<workgroup> T: array<f32, ${HALO * HALO * CB}>;
@compute @workgroup_size(${TILE}, ${TILE})
fn k_conv_tiled(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>,
                @builtin(workgroup_id) wid: vec3<u32>) {
    let r = i32(P.k / 2u);
    let hw = ${TILE}u + P.k - 1u;                       // the halo'd tile's side for this k
    let ox = i32(wid.x * ${TILE}u) - r; let oy = i32(wid.y * ${TILE}u) - r;
    let px = gid.x; let py = gid.y;
    let inside = px < P.W && py < P.H;
    var acc: array<f32, ${COUT_MAX}>;
    for (var co = 0u; co < P.Cout; co = co + 1u) { acc[co] = B[co]; }
    for (var c0 = 0u; c0 < P.Cin; c0 = c0 + ${CB}u) {
        let nb = min(${CB}u, P.Cin - c0);
        let n = hw * hw * nb;
        for (var i = lid.y * ${TILE}u + lid.x; i < n; i = i + ${TILE * TILE}u) {
            let cj = i % nb; let t = i / nb; let tx = i32(t % hw); let ty = i32(t / hw);
            let sx = ox + tx; let sy = oy + ty;
            var v = 0.0;
            if (sx >= 0 && sx < i32(P.W) && sy >= 0 && sy < i32(P.H)) { v = X[(u32(sy) * P.W + u32(sx)) * P.Cin + c0 + cj]; }
            T[i] = v;
        }
        workgroupBarrier();
        if (inside) {
            for (var co = 0u; co < P.Cout; co = co + 1u) {
                var a = acc[co];
                for (var ky = 0u; ky < P.k; ky = ky + 1u) {
                    let sy = i32(py) + i32(ky) - r;
                    if (sy < 0 || sy >= i32(P.H)) { continue; }
                    for (var kx = 0u; kx < P.k; kx = kx + 1u) {
                        let sx = i32(px) + i32(kx) - r;
                        if (sx < 0 || sx >= i32(P.W)) { continue; }
                        let to = ((lid.y + ky) * hw + (lid.x + kx)) * nb;
                        let wo = ((co * P.k + ky) * P.k + kx) * P.Cin + c0;
                        for (var cj = 0u; cj < nb; cj = cj + 1u) { a = a + T[to + cj] * Wt[wo + cj]; }
                    }
                }
                acc[co] = a;
            }
        }
        workgroupBarrier();
    }
    if (inside) {
        for (var co = 0u; co < P.Cout; co = co + 1u) {
            var a = acc[co];
            if (P.act == 1u) { a = max(a, 0.0); }
            Y[(py * P.W + px) * P.Cout + co] = a;
        }
    }
}
`;

// ---- THE FAST KERNEL (the denoiser arc, round 13: pre-registration section 39) ----------------------------------
//
// Round 12's rig run (section 38) found the tiled kernel at about 2% of an Intel gen-9's peak. Three things in it cost
// more than the arithmetic: each multiply-add loads twice (the tile, and the weight from storage); the output channel is
// the OUTER loop, so the same tile value is re-read for each of 32 channels; and 32 accumulators indexed by a loop
// variable with a runtime bound usually live in memory, not registers. This kernel keeps every number the same and moves
// where it is read from:
//   - it is generated per layer, Cin, Cout, k and the activation written in as constants;
//   - its weights and bias are in ONE uniform block (packFastUniforms), as vec4s of four output channels -- a constant
//     buffer read the same by every thread, and the harness layout unchanged: Y at 0, the uniform at 1, X at 2;
//   - a thread keeps up to FAST_GROUP output channels in registers, as named vec4 accumulators (a0..a7), and a wider
//     layer is split into groups across the dispatch's z (the 81-logit head is three);
//   - the tap and the input channel are the OUTER loops: each value is read from the tile once, and added into every
//     channel's accumulator.
// *** NOT ONE CELL'S ORDER MOVES. *** Each accumulator still adds b, then block by block, ky, kx (in bounds), ci -- the
// order conv2dCpu adds in. Interleaving DIFFERENT cells' additions is free; a vec4's four lanes are four cells, each
// added on its own. So the kernel is held to the same twin, or the fused mirror, cell for cell, at zero.
export const FAST_GROUP = 32;           // output channels one thread keeps, as FAST_GROUP / 4 vec4s
export const UNIFORM_MAX = 65536;       // WebGPU's default maxUniformBufferBindingSize: one layer's weights must fit it
const WORKGROUP_MAX = 16384;            // WebGPU's default maxComputeWorkgroupStorageSize

/**
 * The fast kernel's shape for a layer: g4 vec4s a thread keeps, groups of them across z, C4 vec4s of padded output
 * channels, the uniform block's bytes (16 of H and W, then the bias, then the weights), and whether the device's default
 * limits hold it.
 */
export function fastShape({ Cin, Cout, k }) {
    const c4 = Math.ceil(Cout / 4), g4 = Math.min(FAST_GROUP / 4, c4), groups = Math.ceil(c4 / g4), C4 = groups * g4;
    const bytes = 16 + 16 * C4 + 16 * k * k * Cin * C4, halo = TILE + k - 1, wgBytes = halo * halo * CB * 4;
    return { g4, groups, C4, bytes, wgBytes, fits: k % 2 === 1 && bytes <= UNIFORM_MAX && wgBytes <= WORKGROUP_MAX };
}

/** The fast kernel (entry k_conv_fast), generated for one layer's Cin, Cout, k and activation. */
export function conv2dFastWgsl({ Cin, Cout, k, act = "none" }) {
    const S = fastShape({ Cin, Cout, k });
    if (!S.fits) throw new Error(`conv2d: the fast kernel holds a layer whose weights fit one ${UNIFORM_MAX}-byte uniform binding, got ${S.bytes} bytes for ${Cin} -> ${Cout}, k ${k}`);
    const R = (k - 1) / 2, HW = TILE + k - 1, G = S.g4, js = Array.from({ length: G }, (_, j) => j);
    const lanes = ["x", "y", "z", "w"];
    return `
struct FP { H: u32, W: u32, pad0: u32, pad1: u32, b: array<vec4<f32>, ${S.C4}>, w: array<vec4<f32>, ${k * k * Cin * S.C4}> };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // H x W x ${Cout}
@group(0) @binding(1) var<uniform> F: FP;                        // packFastUniforms
@group(0) @binding(2) var<storage, read>       X: array<f32>;   // H x W x ${Cin}
var<workgroup> T: array<f32, ${HW * HW * CB}>;
@compute @workgroup_size(${TILE}, ${TILE}, 1)
fn k_conv_fast(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>,
               @builtin(workgroup_id) wid: vec3<u32>) {
    let ox = i32(wid.x * ${TILE}u) - ${R}; let oy = i32(wid.y * ${TILE}u) - ${R};
    let px = gid.x; let py = gid.y; let g = wid.z;
    let inside = px < F.W && py < F.H;
    ${js.map((j) => `var a${j} = F.b[g * ${G}u + ${j}u];`).join("\n    ")}
    for (var c0 = 0u; c0 < ${Cin}u; c0 = c0 + ${CB}u) {
        let nb = min(${CB}u, ${Cin}u - c0);
        for (var i = lid.y * ${TILE}u + lid.x; i < ${HW * HW}u * nb; i = i + ${TILE * TILE}u) {
            let cj = i % nb; let t = i / nb; let sx = ox + i32(t % ${HW}u); let sy = oy + i32(t / ${HW}u);
            var v = 0.0;
            if (sx >= 0 && sx < i32(F.W) && sy >= 0 && sy < i32(F.H)) { v = X[(u32(sy) * F.W + u32(sx)) * ${Cin}u + c0 + cj]; }
            T[i] = v;
        }
        workgroupBarrier();
        if (inside) {
            for (var ky = 0u; ky < ${k}u; ky = ky + 1u) {
                let sy = i32(py) + i32(ky) - ${R};
                if (sy < 0 || sy >= i32(F.H)) { continue; }
                for (var kx = 0u; kx < ${k}u; kx = kx + 1u) {
                    let sx = i32(px) + i32(kx) - ${R};
                    if (sx < 0 || sx >= i32(F.W)) { continue; }
                    let to = ((lid.y + ky) * ${HW}u + lid.x + kx) * nb;
                    let wb = ((ky * ${k}u + kx) * ${Cin}u + c0) * ${S.C4}u + g * ${G}u;
                    for (var cj = 0u; cj < nb; cj = cj + 1u) {
                        let x = T[to + cj];
                        let w = wb + cj * ${S.C4}u;
                        ${js.map((j) => `a${j} = a${j} + x * F.w[w + ${j}u];`).join("\n                        ")}
                    }
                }
            }
        }
        workgroupBarrier();
    }
    if (!inside) { return; }
    let o = (py * F.W + px) * ${Cout}u; let c = g * ${G * 4}u;
    ${js.map((j) => (act === "relu" ? `a${j} = max(a${j}, vec4<f32>(0.0));\n    ` : "") +
        lanes.map((l, n) => `if (c + ${4 * j + n}u < ${Cout}u) { Y[o + c + ${4 * j + n}u] = a${j}.${l}; }`).join(" ")).join("\n    ")}
}
`;
}

/**
 * The fast kernel's uniform block for one layer at H x W: H and W as u32 bits, then the bias, then the weights, each as
 * vec4s of four output channels -- weight (co, ky, kx, ci) at float ((ky k + kx) Cin + ci) 4 C4 + co after the bias,
 * the bias of co at float co; the padding past Cout is zero. Refuses a layer the kernel cannot hold, by name.
 */
export function packFastUniforms({ H, W, layer }) {
    const { Cin, Cout, k } = layer, S = fastShape(layer);
    if (!S.fits) throw new Error(`conv2d: the fast kernel holds a layer whose weights fit one ${UNIFORM_MAX}-byte uniform binding, got ${S.bytes} bytes for ${Cin} -> ${Cout}, k ${k}`);
    const buf = new ArrayBuffer(S.bytes), u = new Uint32Array(buf), f = new Float32Array(buf), w0 = 4 + 4 * S.C4;
    u[0] = H; u[1] = W;
    for (let co = 0; co < Cout; co++) f[4 + co] = layer.b[co];
    for (let co = 0; co < Cout; co++) for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) for (let ci = 0; ci < Cin; ci++)
        f[w0 + ((ky * k + kx) * Cin + ci) * 4 * S.C4 + co] = layer.W[((co * k + ky) * k + kx) * Cin + ci];
    return f;
}

// ---- THE FAST KERNEL, TWO OTHER WAYS (the denoiser arc, round 17: pre-registration section 59) --------------------------
//
// Round 16's pixel-tiled kernel did not build under FXC, and was not faster in Chrome (sections 57-58). These are the fast
// kernel itself -- a thread one pixel and FAST_GROUP channels, the same bindings and dispatch -- written two other ways, each
// of which leaves every cell's order as it was:
//   reads: "vec4"  the tile holds each pixel's block of CB channels as CB / 4 vec4s, so a thread reads four channels from
//                  workgroup memory in one load, then adds them one lane at a time, ci ascending -- a quarter of the loads;
//   unroll: true   within a block of CB channels, the taps and channels are written out, and the weights are packed BLOCK
//                  BY BLOCK (packFastAltUniforms: F.w[block][tap, channel, vec4]), so a weight's index within its block is
//                  a constant -- no channel loop, no per-read index arithmetic, no bound clamp but the block's. A tap
//                  outside the image is skipped by an `if` around it, as the fast kernel skips it with `continue`. The loop
//                  over blocks stays a loop: writing out all four of a 32-channel layer's blocks (2,304 multiply-adds a
//                  thread) crashed SwiftShader's pipeline build, here, where one block (576) builds.
// *** NOT ONE CELL'S ORDER MOVES. *** Each accumulator adds b, then block by block, ky, kx (in bounds), ci -- conv2dCpu's
// order -- so either way, and both, are held to the same twin, cell for cell, at zero.
const FAST_READS = Object.freeze(["f32", "vec4"]);
/**
 * Round 41 (section 109): the arithmetic a written-out fast kernel does -- "f32" (r18u's, its text unchanged); "f16" (enable f16:
 * the tile, the accumulators and every multiply-add in half precision, the weights f16-rounded and packed two vec4s of f16 to a
 * uniform vec4<u32>, read with bitcast); "f16emu" (a TEST INSTRUMENT, never a set's kernel: the same packed words decoded with
 * unpack2x16float, every type f32, so the packing and indexing run on a device without shader-f16).
 */
export const FAST_ARITH = Object.freeze(["f32", "f16", "f16emu"]);
/**
 * The fast kernel's other ways' shape for a layer and { reads, unroll, arith }: the fast kernel's, but with unroll the uniform
 * block holds whole blocks of CB channels (the last padded with zero weights), block-major -- in half the bytes when the weights
 * are packed f16, which needs f32 reads, the block written out, and an even number of vec4s wherever the z group lands.
 */
export function fastAltShape({ Cin, Cout, k }, { reads = "f32", unroll = false, arith = "f32" } = {}) {
    const F = fastShape({ Cin, Cout, k }), blocks = Math.ceil(Cin / CB), perBlock = k * k * CB * F.C4, half = arith !== "f32";
    const bytes = unroll ? 16 + 16 * F.C4 + 16 * blocks * (half ? perBlock / 2 : perBlock) : F.bytes;
    const packs = !half || (unroll && reads === "f32" && perBlock % 2 === 0 && (F.groups === 1 || F.g4 % 2 === 0));
    return { ...F, reads, unroll, arith, blocks, perBlock, bytes, fits: F.fits && FAST_READS.includes(reads) && FAST_ARITH.includes(arith) && packs && bytes <= UNIFORM_MAX };
}
/** The fast kernel written another way (entry k_conv_fast_alt): { reads: "f32" | "vec4", unroll: false | true, arith: FAST_ARITH }. */
export function conv2dFastAltWgsl({ Cin, Cout, k, act = "none" }, { reads = "f32", unroll = false, arith = "f32" } = {}) {
    const S = fastAltShape({ Cin, Cout, k }, { reads, unroll, arith });
    if (!S.fits) throw new Error(`conv2d: the fast kernel's other ways hold reads ${FAST_READS.join(" or ")}, arith ${FAST_ARITH.join(" or ")} (the f16 ways with f32 reads, written out) and a layer whose weights fit one ${UNIFORM_MAX}-byte uniform binding -- got reads ${reads}, arith ${arith}, ${S.bytes} bytes for ${Cin} -> ${Cout}, k ${k}${unroll ? " written out" : ""}`);
    // round 41: the types and the four places f16 differs -- the tile's value, the weight read, the accumulators' start, the store
    const h = arith === "f16", T16 = h ? "f16" : "f32", V16 = `vec4<${T16}>`;
    const R = (k - 1) / 2, HW = TILE + k - 1, G = S.g4, js = Array.from({ length: G }, (_, j) => j), lanes = ["x", "y", "z", "w"];
    const v4 = reads === "vec4", Q = CB / 4, partial = Cin % CB !== 0, full = Math.floor(Cin / CB), tail = Cin - full * CB;
    // the tile load: f32 as the fast kernel's (pixel t, channel cj at t nb + cj); vec4 as Q vec4s a pixel, lanes past nb zero
    const load = (c0, nb, guard) => v4
        ? `for (var i = lid.y * ${TILE}u + lid.x; i < ${HW * HW * Q}u; i = i + ${TILE * TILE}u) {
            let q = i % ${Q}u; let t = i / ${Q}u; let sx = ox + i32(t % ${HW}u); let sy = oy + i32(t / ${HW}u);
            var v = vec4<f32>(0.0);
            if (sx >= 0 && sx < i32(F.W) && sy >= 0 && sy < i32(F.H)) {
                let o = (u32(sy) * F.W + u32(sx)) * ${Cin}u + ${c0} + 4u * q;
                ${lanes.map((l, n) => (guard ? `if (4u * q + ${n}u < ${nb}) { v.${l} = X[o + ${n}u]; }` : `v.${l} = X[o + ${n}u];`)).join(" ")}
            }
            T[i] = v;
        }`
        : `for (var i = lid.y * ${TILE}u + lid.x; i < ${HW * HW}u * ${nb}; i = i + ${TILE * TILE}u) {
            let cj = i % ${nb}; let t = i / ${nb}; let sx = ox + i32(t % ${HW}u); let sy = oy + i32(t / ${HW}u);
            var v = ${h ? "0.0h" : "0.0"};
            if (sx >= 0 && sx < i32(F.W) && sy >= 0 && sy < i32(F.H)) { v = ${h ? "f16(" : ""}X[(u32(sy) * F.W + u32(sx)) * ${Cin}u + ${c0} + cj]${h ? ")" : ""}; }
            T[i] = v;
        }`;
    // one channel's adds into every accumulator, from x, in the order j -- each lane a cell of its own
    const adds = (x, w) => js.map((j) => `a${j} = a${j} + ${x} * ${w(j)};`).join(" ");
    let body;
    if (!unroll) {
        // the fast kernel's loops; vec4 reads take a block's channels Q vec4s at a time, lane by lane
        const inner = v4
            ? Array.from({ length: Q }, (_, q) => `{ let x4 = T[to + ${q}u];\n                        ` +
                lanes.map((l, n) => { const ci = 4 * q + n, a = `let w = wb + ${ci}u * ${S.C4}u; ${adds(`x4.${l}`, (j) => `F.w[w + ${j}u]`)}`;
                    return partial ? `if (${ci}u < nb) { ${a} }` : `{ ${a} }`; }).join("\n                        ") + " }").join("\n                    ")
            : `for (var cj = 0u; cj < nb; cj = cj + 1u) {
                        let x = T[to + cj]; let w = wb + cj * ${S.C4}u;
                        ${adds("x", (j) => `F.w[w + ${j}u]`)}
                    }`;
        body = `    for (var c0 = 0u; c0 < ${Cin}u; c0 = c0 + ${CB}u) {
        let nb = min(${CB}u, ${Cin}u - c0);
        ${load("c0", "nb", partial)}
        workgroupBarrier();
        if (inside) {
            for (var ky = 0u; ky < ${k}u; ky = ky + 1u) {
                let sy = i32(py) + i32(ky) - ${R};
                if (sy < 0 || sy >= i32(F.H)) { continue; }
                for (var kx = 0u; kx < ${k}u; kx = kx + 1u) {
                    let sx = i32(px) + i32(kx) - ${R};
                    if (sx < 0 || sx >= i32(F.W)) { continue; }
                    let to = ((lid.y + ky) * ${HW}u + lid.x + kx) * ${v4 ? `${Q}u` : "nb"};
                    let wb = ((ky * ${k}u + kx) * ${Cin}u + c0) * ${S.C4}u + g * ${G}u;
                    ${inner}
                }
            }
        }
        workgroupBarrier();
    }`;
    } else {
        // one block written out: its taps and nb channels are constants; the block (b) and the pixel's base in the tile are not
        // round 41: packed f16, vec4 c of a block is half of word c / 2 -- xy for an even c, zw for an odd one (G even, so the z group's
        // offset g G keeps c's parity); bitcast for f16, unpack2x16float for the emulation
        const wAt = arith === "f32"
            ? (tap, cj, j) => { const c = (tap * CB + cj) * S.C4 + j; return S.groups === 1 ? `F.w[b][${c}u]` : `F.w[b][g * ${G}u + ${c}u]`; }
            : (tap, cj, j) => { const c = (tap * CB + cj) * S.C4 + j, wd = S.groups === 1 ? `F.w[b][${c >> 1}u]` : `F.w[b][g * ${G / 2}u + ${c >> 1}u]`, hl = c % 2 ? "zw" : "xy";
                return h ? `bitcast<vec4<f16>>(${wd}.${hl})` : `vec4<f32>(unpack2x16float(${wd}.${hl[0]}), unpack2x16float(${wd}.${hl[1]}))`; };
        const taps = (nb) => Array.from({ length: k }, (_, ky) => `{ let sy = i32(py) ${ky >= R ? "+ " + (ky - R) : "- " + (R - ky)};
            if (sy >= 0 && sy < i32(F.H)) {
` + Array.from({ length: k }, (_, kx) => {
                const tap = ky * k + kx, off = (ky * HW + kx) * (v4 ? Q : nb);
                const chans = v4
                    ? Array.from({ length: Math.ceil(nb / 4) }, (_, q) => `{ let x4 = T[tb + ${off + q}u]; ` +
                        lanes.slice(0, Math.min(4, nb - 4 * q)).map((l, n) => adds(`x4.${l}`, (j) => wAt(tap, 4 * q + n, j))).join(" ") + " }").join("\n                    ")
                    : Array.from({ length: nb }, (_, cj) => `{ let x = T[tb + ${off + cj}u]; ${adds("x", (j) => wAt(tap, cj, j))} }`).join("\n                    ");
                return `                if (px + ${kx}u >= ${R}u && px + ${kx}u < F.W + ${R}u) {
                    ${chans}
                }`;
            }).join("\n") + `
            } }`).join("\n            ");
        const block = (c0, nb, guard) => `        ${load(c0, `${nb}u`, guard)}
        workgroupBarrier();
        if (inside) {
            let tb = (lid.y * ${HW}u + lid.x) * ${v4 ? Q : nb}u;
            ${taps(nb)}
        }
        workgroupBarrier();`;
        body = (full ? `    for (var b = 0u; b < ${full}u; b = b + 1u) {
        let c0 = b * ${CB}u;
${block("c0", CB, false)}
    }
` : "") + (tail ? `    { // the last block: channels ${full * CB}-${Cin - 1}
        let b = ${full}u;
${block(`${full * CB}u`, tail, true)}
    }
` : "");
    }
    const wDecl = arith !== "f32" ? `array<array<vec4<u32>, ${S.perBlock / 2}>, ${S.blocks}>` : unroll ? `array<array<vec4<f32>, ${S.perBlock}>, ${S.blocks}>` : `array<vec4<f32>, ${k * k * Cin * S.C4}>`;
    return `${h ? "enable f16;" : ""}
struct FP { H: u32, W: u32, pad0: u32, pad1: u32, b: array<vec4<f32>, ${S.C4}>, w: ${wDecl} };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // H x W x ${Cout}
@group(0) @binding(1) var<uniform> F: FP;                        // packFastAltUniforms
@group(0) @binding(2) var<storage, read>       X: array<f32>;   // H x W x ${Cin}
var<workgroup> T: array<${v4 ? "vec4<f32>" : T16}, ${HW * HW * (v4 ? Q : CB)}>;
@compute @workgroup_size(${TILE}, ${TILE}, 1)
fn k_conv_fast_alt(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>,
                   @builtin(workgroup_id) wid: vec3<u32>) {
    let ox = i32(wid.x * ${TILE}u) - ${R}; let oy = i32(wid.y * ${TILE}u) - ${R};
    let px = gid.x; let py = gid.y; let g = wid.z;
    let inside = px < F.W && py < F.H;
    ${js.map((j) => `var a${j} = ${h ? "vec4<f16>(" : ""}F.b[g * ${G}u + ${j}u]${h ? ")" : ""};`).join("\n    ")}
${body}
    if (!inside) { return; }
    let o = (py * F.W + px) * ${Cout}u; let c = g * ${G * 4}u;
    ${js.map((j) => (act === "relu" ? `a${j} = max(a${j}, ${V16}(${h ? "0.0h" : "0.0"}));\n    ` : "") +
        lanes.map((l, n) => `if (c + ${4 * j + n}u < ${Cout}u) { Y[o + c + ${4 * j + n}u] = ${h ? `f32(a${j}.${l})` : `a${j}.${l}`}; }`).join(" ")).join("\n    ")}
}
`;
}
/**
 * The other ways' uniform block: without unroll, packFastUniforms' own; with it, H and W, the bias, then the weights block by
 * block -- weight (co, ky, kx, ci) at vec4 b perBlock + ((ky k + kx) CB + cj) C4 + co / 4, lane co % 4, for ci = b CB + cj,
 * the last block's channels past Cin zero. Refuses what the kernel cannot hold, by name.
 */
export function packFastAltUniforms({ H, W, layer }, opts = {}) {
    const { Cin, Cout, k } = layer, S = fastAltShape(layer, opts);
    if (!S.fits) throw new Error(`conv2d: the fast kernel's other ways cannot hold ${Cin} -> ${Cout}, k ${k}: ${S.bytes} bytes`);
    if (!S.unroll) return packFastUniforms({ H, W, layer });
    const buf = new ArrayBuffer(S.bytes), u = new Uint32Array(buf), f = new Float32Array(buf), w0 = 4 + 4 * S.C4;
    u[0] = H; u[1] = W;
    for (let co = 0; co < Cout; co++) f[4 + co] = layer.b[co];
    if (S.arith !== "f32") {
        // round 41: the same vec4 order as below, each weight f16-rounded and stored as its 16 bits -- vec4 v of a block at bytes
        // 8 v of the weights, so word v / 2 holds vec4 v in its xy half (v even) or zw half (v odd), little-endian
        const h16 = new Uint16Array(buf), hw0 = 2 * w0;
        for (let co = 0; co < Cout; co++) for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) for (let ci = 0; ci < Cin; ci++) {
            const b = Math.floor(ci / CB), cj = ci % CB;
            h16[hw0 + 4 * (b * S.perBlock + ((ky * k + kx) * CB + cj) * S.C4) + co] = f16bits(f16round(layer.W[((co * k + ky) * k + kx) * Cin + ci]));
        }
        return f;
    }
    for (let co = 0; co < Cout; co++) for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) for (let ci = 0; ci < Cin; ci++) {
        const b = Math.floor(ci / CB), cj = ci % CB;
        f[w0 + 4 * (b * S.perBlock + ((ky * k + kx) * CB + cj) * S.C4) + co] = layer.W[((co * k + ky) * k + kx) * Cin + ci];
    }
    return f;
}

// ---- THE HEAD KERNEL (the denoiser arc, round 14: pre-registration section 43) ------------------------------------
//
// Section 42: the fast kernel's 81-logit head ran 1,900 times slower natively (node-webgpu, D3D12) than in Chrome, on the
// same WGSL, while the fast kernel's 3 x 3 layers were fine on both. The head is the one layer with k = 1 and groups
// across z. This is a 1 x 1 convolution with none of the fast kernel's machinery -- no tile, no barrier, no z groups:
//   - one thread per (pixel, vec4 of four output channels): a 64-wide workgroup along the pixels, the vec4 along y;
//   - the pixel's Cin inputs read straight from storage, the weights and bias from one uniform block (packHeadUniforms);
//   - the output written PLANAR, channel-major (Y[c * H*W + p]), so the next pass reads it with neighbouring threads on
//     neighbouring addresses -- render/denoiseDevice.mjs's k_apply_fast is built for that layout.
// *** THE ORDER IS THE TWIN'S. *** At k = 1 the block-outer order is the plain one: b, then ci in order. Each lane of the
// accumulator is one cell, added on its own. So it is held to conv2dCpu, or the fused mirror, cell for cell, at zero --
// the planar layout moves where a cell is written, never what it is.

/** The head kernel's shape for a 1 x 1 layer: C4 vec4s of output channels, the uniform block's bytes, whether it fits. */
export function headShape({ Cin, Cout, k }) {
    const C4 = Math.ceil(Cout / 4), bytes = 16 + 16 * C4 + 16 * Cin * C4;
    return { C4, bytes, fits: k === 1 && bytes <= UNIFORM_MAX };
}

/** The head kernel (entry k_head), generated for one 1 x 1 layer: X channels-last in, Y planar out. */
export function conv2dHeadWgsl({ Cin, Cout, k, act = "none" }) {
    const S = headShape({ Cin, Cout, k });
    if (!S.fits) throw new Error(`conv2d: the head kernel holds a 1 x 1 layer whose weights fit one ${UNIFORM_MAX}-byte uniform binding, got k ${k}, ${S.bytes} bytes for ${Cin} -> ${Cout}`);
    const lanes = ["x", "y", "z", "w"];
    return `
struct HP { H: u32, W: u32, pad0: u32, pad1: u32, b: array<vec4<f32>, ${S.C4}>, w: array<vec4<f32>, ${Cin * S.C4}> };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // PLANAR: ${Cout} planes of H x W
@group(0) @binding(1) var<uniform> F: HP;                        // packHeadUniforms
@group(0) @binding(2) var<storage, read>       X: array<f32>;   // H x W x ${Cin}, channels last
@compute @workgroup_size(64, 1, 1)
fn k_head(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = F.H * F.W; let p = gid.x; let j = gid.y;
    if (p >= n) { return; }
    var a = F.b[j];
    let xo = p * ${Cin}u;
    for (var ci = 0u; ci < ${Cin}u; ci = ci + 1u) { a = a + X[xo + ci] * F.w[ci * ${S.C4}u + j]; }
    ${act === "relu" ? "a = max(a, vec4<f32>(0.0));" : ""}
    let c = j * 4u;
    ${lanes.map((l, i) => `if (c + ${i}u < ${Cout}u) { Y[(c + ${i}u) * n + p] = a.${l}; }`).join("\n    ")}
}
`;
}

/**
 * The head kernel's uniform block for a 1 x 1 layer at H x W: H and W as u32 bits, then the bias, then the weights as
 * vec4s of four output channels -- weight (co, ci) at float 4 + 4 C4 + ci 4 C4 + co, the bias of co at float 4 + co; the
 * padding past Cout is zero. Refuses a layer the kernel cannot hold, by name.
 */
export function packHeadUniforms({ H, W, layer }) {
    const { Cin, Cout, k } = layer, S = headShape(layer);
    if (!S.fits) throw new Error(`conv2d: the head kernel holds a 1 x 1 layer whose weights fit one ${UNIFORM_MAX}-byte uniform binding, got k ${k}, ${S.bytes} bytes for ${Cin} -> ${Cout}`);
    const buf = new ArrayBuffer(S.bytes), u = new Uint32Array(buf), f = new Float32Array(buf), w0 = 4 + 4 * S.C4;
    u[0] = H; u[1] = W;
    for (let co = 0; co < Cout; co++) f[4 + co] = layer.b[co];
    for (let co = 0; co < Cout; co++) for (let ci = 0; ci < Cin; ci++) f[w0 + ci * 4 * S.C4 + co] = layer.W[co * Cin + ci];
    return f;
}
// ---- THE PIXEL-TILED KERNEL (the denoiser arc, round 16: pre-registration section 54) ------------------------------
//
// Round 15 left the four hidden 3 x 3 layers three quarters of a 1080p frame on the GTX 1080 and 89% of a 1024 x 1024
// one on the Intel, both near a fifth of the GPU's peak. In the fast kernel a thread is one pixel: for each tap and input
// channel it reads one value from the tile and FAST_GROUP / 4 vec4s of weights from the uniform block, and every weight
// it reads feeds that one pixel. This kernel gives a thread PX pixels, so each weight read feeds PX of them:
//   - pixel p of a thread is column p * TILE + lid.x of the workgroup's tile -- PX TILE-wide strips side by side, so
//     neighbouring threads still read neighbouring words of the tile, and the workgroup covers TILE PX x TILE pixels;
//   - a thread keeps G4 vec4s of output channels for each of its PX pixels (a<p>_<j>), and a wider layer is split into
//     groups across z, as the fast kernel splits;
//   - the weights are the fast kernel's uniform block, with C4 padded to a whole number of G4-groups (packTileUniforms).
// *** NOT ONE CELL'S ORDER MOVES. *** Each accumulator still adds b, then block by block, ky, kx, ci, and skips a tap
// outside the image for ITS pixel alone -- one branch for a tap all PX pixels may take, a guarded one at the image's
// edge. So it is held to conv2dCpu, or the fused mirror, cell for cell, at zero, like every kernel before it.
// *** THE EDGE, TWO WAYS (section 56). *** On both GPUs' rigs, node-webgpu's FXC did not finish building this kernel in 15
// minutes, where it builds the fast kernel in seconds. `edge` names how a tap outside the image is handled:
//   "skip"  (section 54's kernel) -- the guarded branch above: the tap is skipped for each pixel it falls outside;
//   "zero"  no guarded branch: every pixel adds every tap of an in-image row, and a tap outside the image adds the zero the
//           tile holds there. Adding a zero product is the skip except in the SIGN of a zero (sabotage P7), which `===`
//           does not see and WGSL lets an implementation ignore -- so it is held to the same twin, cell for cell.
// *** THE WEIGHTS, TWO WAYS (section 59). *** Section 58 found FXC compiling each weight read of this kernel into a scan of the
// whole weight array, where it reads the fast kernel's as one indexed operand. The one difference in how they are written:
// here each weight read is stored once and used for every pixel; there it is used where it is read. `weights` names which:
//   "hoist"  (sections 54-58) -- let w<j> = F.w[...], then one multiply-add a pixel;
//   "inline" every pixel's multiply-add reads F.w[...] itself, as the fast kernel's does. The same weights, the same adds in
//            the same order -- the same cells.
const TILE_PX = Object.freeze([1, 2, 4]), TILE_EDGE = Object.freeze(["skip", "zero"]), TILE_WEIGHTS = Object.freeze(["hoist", "inline"]);
/**
 * The pixel-tiled kernel's shape for a layer and a configuration { px, g4 }: G4 vec4s a pixel keeps (at most the layer's
 * own), groups of them across z, C4 vec4s of padded output channels, the uniform block's bytes, the tile's width and
 * height with its halo, its workgroup bytes, and whether the device's default limits hold it.
 */
export function tileShape({ Cin, Cout, k }, { px = 2, g4 = FAST_GROUP / 4, edge = "skip", weights = "hoist" } = {}) {
    const c4 = Math.ceil(Cout / 4), G = Math.min(g4, c4), groups = Math.ceil(c4 / G), C4 = groups * G;
    const bytes = 16 + 16 * C4 + 16 * k * k * Cin * C4, TW = TILE * px + k - 1, TH = TILE + k - 1, wgBytes = TW * TH * CB * 4;
    return { px, g4: G, groups, C4, bytes, TW, TH, wgBytes, edge, weights,
             fits: k % 2 === 1 && TILE_PX.includes(px) && TILE_EDGE.includes(edge) && TILE_WEIGHTS.includes(weights) && g4 >= 1 && bytes <= UNIFORM_MAX && wgBytes <= WORKGROUP_MAX };
}

/** The pixel-tiled kernel (entry k_conv_tile), generated for one layer and one { px, g4 }. */
export function conv2dTileWgsl({ Cin, Cout, k, act = "none" }, cfg = {}) {
    const S = tileShape({ Cin, Cout, k }, cfg);
    if (!S.fits) throw new Error(`conv2d: the pixel-tiled kernel holds an odd k, px in ${TILE_PX.join("/")}, edge ${TILE_EDGE.join(" or ")}, weights ${TILE_WEIGHTS.join(" or ")}, its weights in one ${UNIFORM_MAX}-byte uniform binding and a tile in ${WORKGROUP_MAX} bytes -- got ${Cin} -> ${Cout}, k ${k}, px ${cfg.px}, ${S.bytes} + ${S.wgBytes} bytes`);
    const R = (k - 1) / 2, G = S.g4, P = S.px, js = Array.from({ length: G }, (_, j) => j), ps = Array.from({ length: P }, (_, p) => p), skip = S.edge === "skip";
    const lanes = ["x", "y", "z", "w"], a = (p, j) => `a${p}_${j}`;
    return `
struct FP { H: u32, W: u32, pad0: u32, pad1: u32, b: array<vec4<f32>, ${S.C4}>, w: array<vec4<f32>, ${k * k * Cin * S.C4}> };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // H x W x ${Cout}
@group(0) @binding(1) var<uniform> F: FP;                        // packTileUniforms
@group(0) @binding(2) var<storage, read>       X: array<f32>;   // H x W x ${Cin}
var<workgroup> T: array<f32, ${S.TW * S.TH * CB}>;
@compute @workgroup_size(${TILE}, ${TILE}, 1)
fn k_conv_tile(@builtin(local_invocation_id) lid: vec3<u32>, @builtin(workgroup_id) wid: vec3<u32>) {
    let ox = i32(wid.x * ${TILE * P}u) - ${R}; let oy = i32(wid.y * ${TILE}u) - ${R};
    let py = wid.y * ${TILE}u + lid.y; let g = wid.z;
    // pixel p of this thread: column p * ${TILE} + lid.x of the tile
    ${ps.map((p) => `let x${p} = wid.x * ${TILE * P}u + ${p * TILE}u + lid.x;`).join(" ")}
    ${ps.map((p) => js.map((j) => `var ${a(p, j)} = F.b[g * ${G}u + ${j}u];`).join(" ")).join("\n    ")}
    for (var c0 = 0u; c0 < ${Cin}u; c0 = c0 + ${CB}u) {
        let nb = min(${CB}u, ${Cin}u - c0);
        for (var i = lid.y * ${TILE}u + lid.x; i < ${S.TW * S.TH}u * nb; i = i + ${TILE * TILE}u) {
            let cj = i % nb; let t = i / nb; let sx = ox + i32(t % ${S.TW}u); let sy = oy + i32(t / ${S.TW}u);
            var v = 0.0;
            if (sx >= 0 && sx < i32(F.W) && sy >= 0 && sy < i32(F.H)) { v = X[(u32(sy) * F.W + u32(sx)) * ${Cin}u + c0 + cj]; }
            T[i] = v;
        }
        workgroupBarrier();
        if (py < F.H) {
            for (var ky = 0u; ky < ${k}u; ky = ky + 1u) {
                let sy = i32(py) + i32(ky) - ${R};
                if (sy < 0 || sy >= i32(F.H)) { continue; }
                for (var kx = 0u; kx < ${k}u; kx = kx + 1u) {
                    ${skip ? "// a tap inside the image for pixel p, and where pixel p reads it in the tile" : "// where pixel p reads the tap in the tile: zero there when it is outside the image"}
                    ${ps.map((p) => (skip ? `let s${p} = i32(x${p}) + i32(kx) - ${R}; let o${p} = s${p} >= 0 && s${p} < i32(F.W); ` : "") + `let t${p} = ((lid.y + ky) * ${S.TW}u + ${p * TILE}u + lid.x + kx) * nb;`).join("\n                    ")}
                    let wb = ((ky * ${k}u + kx) * ${Cin}u + c0) * ${S.C4}u + g * ${G}u;
                    ${skip ? `if (${ps.map((p) => `o${p}`).join(" && ")}) {` : "{"}
                        for (var cj = 0u; cj < nb; cj = cj + 1u) {
                            ${ps.map((p) => `let v${p} = T[t${p} + cj];`).join(" ")}
                            let w = wb + cj * ${S.C4}u;
                            ${js.map((j) => (S.weights === "inline" ? ps.map((p) => `${a(p, j)} = ${a(p, j)} + v${p} * F.w[w + ${j}u];`).join(" ")
                                : `let w${j} = F.w[w + ${j}u]; ` + ps.map((p) => `${a(p, j)} = ${a(p, j)} + v${p} * w${j};`).join(" "))).join("\n                            ")}
                        }
                    }${skip ? ` else {
                        for (var cj = 0u; cj < nb; cj = cj + 1u) {
                            let w = wb + cj * ${S.C4}u;
                            ${ps.map((p) => `if (o${p}) { let v = T[t${p} + cj]; ` + js.map((j) => `${a(p, j)} = ${a(p, j)} + v * F.w[w + ${j}u];`).join(" ") + " }").join("\n                            ")}
                        }
                    }` : ""}
                }
            }
        }
        workgroupBarrier();
    }
    if (py >= F.H) { return; }
    let c = g * ${G * 4}u;
    ${ps.map((p) => `if (x${p} < F.W) {\n        let o = (py * F.W + x${p}) * ${Cout}u;\n        ` + js.map((j) => (act === "relu" ? `${a(p, j)} = max(${a(p, j)}, vec4<f32>(0.0)); ` : "") +
        lanes.map((l, n) => `if (c + ${4 * j + n}u < ${Cout}u) { Y[o + c + ${4 * j + n}u] = ${a(p, j)}.${l}; }`).join(" ")).join("\n        ") + "\n    }").join("\n    ")}
}
`;
}

/**
 * The pixel-tiled kernel's uniform block: the fast kernel's layout (H and W, then the bias, then the weights as vec4s of
 * four output channels) with C4 the configuration's -- weight (co, ky, kx, ci) at float ((ky k + kx) Cin + ci) 4 C4 + co
 * after the bias. Refuses a layer the configuration cannot hold, by name.
 */
export function packTileUniforms({ H, W, layer }, cfg = {}) {
    const { Cin, Cout, k } = layer, S = tileShape(layer, cfg);
    if (!S.fits) throw new Error(`conv2d: the pixel-tiled kernel cannot hold ${Cin} -> ${Cout}, k ${k}, px ${cfg.px}: ${S.bytes} + ${S.wgBytes} bytes`);
    const buf = new ArrayBuffer(S.bytes), u = new Uint32Array(buf), f = new Float32Array(buf), w0 = 4 + 4 * S.C4;
    u[0] = H; u[1] = W;
    for (let co = 0; co < Cout; co++) f[4 + co] = layer.b[co];
    for (let co = 0; co < Cout; co++) for (let ky = 0; ky < k; ky++) for (let kx = 0; kx < k; kx++) for (let ci = 0; ci < Cin; ci++)
        f[w0 + ((ky * k + kx) * Cin + ci) * 4 * S.C4 + co] = layer.W[((co * k + ky) * k + kx) * Cin + ci];
    return f;
}
/** The pixel-tiled kernel's dispatch at H x W: a workgroup per TILE PX x TILE pixels, a z group per G4 vec4s. */
export const tileWorkgroups = (H, W, layer, cfg = {}) => { const S = tileShape(layer, cfg); return [Math.ceil(W / (TILE * S.px)), Math.ceil(H / TILE), S.groups]; };

// ---- THE SUBGROUP KERNEL (the denoiser arc, round 40: pre-registration section 108) ------------------------------------
//
// The pixel-tiled kernel's work -- `rows` output rows of one column a thread, `g4` vec4s of output channels each, from the same
// uniform block of weights (packTileUniforms at 1 pixel) -- with its inputs SHARED ACROSS A SUBGROUP instead of staged in
// workgroup memory behind two barriers a block:
//   - a workgroup is SUB_WG threads in a row; each subgroup in it takes the span of columns its first thread's index names
//     (that index over the subgroup size), which assumes a subgroup is a contiguous, aligned run of a workgroup's threads --
//     WGSL does not promise it, so every cell row would go red on an adapter that broke it. A workgroup atomic was the first
//     way: on SwiftShader it returned 0 to every subgroup (section 108). Every size is read from the subgroup_size builtin;
//   - each lane loads ITS column of each input row the block reads, and takes its neighbours' columns with subgroupShuffle;
//     the subgroup's R lanes at each end are halo only, so a subgroup of S lanes writes S - 2R columns (subSpan);
//   - the input rows are streamed, each fed to the output rows that read it, and within a block every tap and channel is
//     written out with the block's weights at a constant offset from c0 -- the block loop stays a loop, as r18u's does,
//     because SwiftShader's pipeline build crashed on four written-out blocks of the fast kernel (section 59).
// *** NOT ONE CELL'S ORDER MOVES. *** Each accumulator adds b, then block by block, ky, kx, ci: a row outside the image is
// skipped, as every kernel skips it; a column outside adds the zero its lane loaded, as the tile kernel's zero edge does. So it
// is held to conv2dCpu, or its fused mirror, cell for cell, at zero. It needs the device's `subgroups` feature.
export const SUB_WG = 64;                                   // a workgroup's threads, one row of them
const SUB_ROWS = Object.freeze([1, 2, 4]);
/**
 * The subgroup kernel's shape for a layer and { rows, g4 }: G vec4s a row keeps (at most the layer's own), groups of them across
 * z, C4 vec4s of padded output channels (the tile kernel's), the uniform block's bytes, and whether it holds the layer -- an odd
 * k and input channels in whole blocks of CB.
 */
export function subShape({ Cin, Cout, k }, { rows = 2, g4 = 8 } = {}) {
    const c4 = Math.ceil(Cout / 4), G = Math.min(g4, c4), groups = Math.ceil(c4 / G), C4 = groups * G;
    const bytes = 16 + 16 * C4 + 16 * k * k * Cin * C4;
    return { rows, g4: G, groups, C4, bytes, R: (k - 1) / 2, fits: k % 2 === 1 && Cin % CB === 0 && SUB_ROWS.includes(rows) && g4 >= 1 && bytes <= UNIFORM_MAX };
}
/** The columns a subgroup of `size` lanes writes for a k x k layer: its lanes less the halo at each end. */
export const subSpan = (size, k) => size - (k - 1);
/** The subgroup kernel's dispatch at H x W, by the adapter's smallest subgroup size: a larger one leaves trailing workgroups idle. */
export const subWorkgroups = (H, W, layer, cfg = {}, minSize = 4) => {
    const S = subShape(layer, cfg);
    return [Math.ceil(W / ((SUB_WG / minSize) * subSpan(minSize, layer.k))), Math.ceil(H / S.rows), S.groups];
};
/** The subgroup kernel's uniform block: the pixel-tiled kernel's at 1 pixel and the same vec4s, bit for bit. */
export function packSubUniforms({ H, W, layer }, cfg = {}) {
    const S = subShape(layer, cfg);
    if (!S.fits) throw new Error(`conv2d: the subgroup kernel cannot hold ${layer.Cin} -> ${layer.Cout}, k ${layer.k}, rows ${cfg.rows}: it needs an odd k, input channels in whole blocks of ${CB} and ${S.bytes} bytes of weights in one ${UNIFORM_MAX}-byte uniform binding`);
    return packTileUniforms({ H, W, layer }, { px: 1, g4: S.g4 });
}

/** The subgroup kernel (entry k_conv_sub), generated for one layer and one { rows, g4 }. */
export function conv2dSubWgsl({ Cin, Cout, k, act = "none" }, cfg = {}) {
    const S = subShape({ Cin, Cout, k }, cfg);
    if (!S.fits) throw new Error(`conv2d: the subgroup kernel holds an odd k, rows in ${SUB_ROWS.join("/")}, input channels in whole blocks of ${CB} and its weights in one ${UNIFORM_MAX}-byte uniform binding -- got ${Cin} -> ${Cout}, k ${k}, rows ${cfg.rows}, ${S.bytes} bytes`);
    const R = S.R, G = S.g4, P = S.rows, js = Array.from({ length: G }, (_, j) => j), qs = Array.from({ length: P }, (_, q) => q);
    const cjs = Array.from({ length: CB }, (_, c) => c), kxs = Array.from({ length: k }, (_, x) => x), lanes = ["x", "y", "z", "w"], a = (q, j) => `a${q}_${j}`;
    // input row r of a block is image row py + r - R; output row q reads it at ky = r - q
    const rowCode = (r) => {
        const uses = qs.filter((q) => r - q >= 0 && r - q < k);
        const body = kxs.map((kx) => cjs.map((cj) => {
            const n = kx === R ? `v${cj}` : `subgroupShuffle(v${cj}, u32(clamp(i32(sl) + ${kx - R}, 0, i32(ss) - 1)))`;
            return `{ let n = ${n};\n                ` + uses.map((q) => js.map((j) => `${a(q, j)} = ${a(q, j)} + n * F.w[wc + ${(((r - q) * k + kx) * Cin + cj) * S.C4 + j}u];`).join(" ")).join("\n                ") + " }";
        }).join("\n            ")).join("\n            ");
        return `// input row ${r}: image row py ${r - R >= 0 ? "+" : "-"} ${Math.abs(r - R)}, read by output row${uses.length > 1 ? "s" : ""} ${uses.join(" and ")}
        let sy${r} = i32(py) + ${r - R};
        if (sy${r} >= 0 && sy${r} < i32(F.H)) {
            let bi = (u32(sy${r}) * F.W + u32(clamp(x, 0, i32(F.W) - 1))) * ${Cin}u + c0;
            ${cjs.map((cj) => `let v${cj} = select(0.0, X[bi + ${cj}u], inx);`).join(" ")}
            ${body}
        }`;
    };
    return `enable subgroups;
struct FP { H: u32, W: u32, pad0: u32, pad1: u32, b: array<vec4<f32>, ${S.C4}>, w: array<vec4<f32>, ${k * k * Cin * S.C4}> };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;   // H x W x ${Cout}
@group(0) @binding(1) var<uniform> F: FP;                        // packSubUniforms (the tile kernel's at 1 pixel)
@group(0) @binding(2) var<storage, read>       X: array<f32>;   // H x W x ${Cin}
@compute @workgroup_size(${SUB_WG}, 1, 1)
fn k_conv_sub(@builtin(workgroup_id) wid: vec3<u32>, @builtin(local_invocation_index) li: u32, @builtin(subgroup_invocation_id) sl: u32, @builtin(subgroup_size) ss: u32) {
    // this subgroup's span of columns, named by its first thread's index: a subgroup of ss lanes writes ss - ${2 * R} of them
    let slot = subgroupBroadcastFirst(li) / ss;
    let span = ss - ${2 * R}u;
    let x = i32((wid.x * (${SUB_WG}u / ss) + slot) * span + sl) - ${R};
    let inx = x >= 0 && x < i32(F.W);
    let py = wid.y * ${P}u; let g = wid.z;
    ${qs.map((q) => js.map((j) => `var ${a(q, j)} = F.b[g * ${G}u + ${j}u];`).join(" ")).join("\n    ")}
    for (var c0 = 0u; c0 < ${Cin}u; c0 = c0 + ${CB}u) {
        let wc = c0 * ${S.C4}u + g * ${G}u;
        ${Array.from({ length: P + k - 1 }, (_, r) => rowCode(r)).join("\n        ")}
    }
    // the halo lanes, and lanes past the image, write nothing
    if (sl < ${R}u || sl >= ss - ${R}u || !inx) { return; }
    let c = g * ${G * 4}u;
    ${qs.map((q) => `if (py + ${q}u < F.H) {\n        let o = ((py + ${q}u) * F.W + u32(x)) * ${Cout}u;\n        ` + js.map((j) => (act === "relu" ? `${a(q, j)} = max(${a(q, j)}, vec4<f32>(0.0)); ` : "") +
        lanes.map((l, n) => `if (c + ${4 * j + n}u < ${Cout}u) { Y[o + c + ${4 * j + n}u] = ${a(q, j)}.${l}; }`).join(" ")).join("\n        ") + "\n    }").join("\n    ")}
}
`;
}

// ---- THE WINOGRAD KERNEL (the denoiser arc, round 27: pre-registration section 83) --------------------------------------
//
// Winograd's F(2 x 2, 3 x 3): a 2 x 2 block of outputs from a 4 x 4 block of inputs in 16 multiplies an input channel and an
// output channel, where the direct sum takes 36 -- 2.25 x fewer. Each 3 x 3 filter is transformed once, ON THE HOST
// (winoFilter: U = G g G^T in f64, rounded to f32 once); each 4 x 4 input tile on the device (V = B^T d B, adds and
// subtracts only); the 16 products are summed over the input channels IN THE TRANSFORMED DOMAIN (M = the sum over ci of
// U V, ci ascending, from zero); and the 2 x 2 outputs come back by A^T M A, adds and subtracts only, then the bias and the
// activation:
//
//   B^T = [1 0 -1 0; 0 1 1 0; 0 -1 1 0; 0 1 0 -1]    G = [1 0 0; 1/2 1/2 1/2; 1/2 -1/2 1/2; 0 0 1]    A^T = [1 1 1 0; 0 1 -1 -1]
//
// *** THIS IS NOT THE CANONICAL ORDER, AND NO KERNEL ABOVE IS ITS TWIN. *** Every kernel above adds b, then block by block,
// ky, kx, ci: one product of an input and a weight at a time into one accumulator. This one adds other numbers -- transformed
// ones -- in another domain, then mixes sixteen sums. So it has a twin of its own, conv2dCpuWino, which does the kernel's
// operations in the kernel's order with an f32 rounding after every one, and a fused mirror, conv2dCpuWinoFma, for a compiler
// that contracts M + V U into one fma: the kernel's only multiply-add, since every coefficient on the device is 1 or -1 (the
// halves of G are the host's). A cell the device computes is held to one or the other, as every kernel above is held to
// conv2dCpu or conv2dCpuFma. What changes is how far that twin sits from the f64 layer, and section 83 fixes the bound.
//
// THE THREAD. One 2 x 2 tile of outputs and `g4` vec4s of output channels: 16 vec4 accumulators each, one per transformed
// position. A workgroup is TILE x TILE threads, so 16 x 16 outputs; the 18 x 18 window they read (their tiles and a pixel of
// halo each side) is staged in workgroup memory WINO_CB input channels at a time, ZERO outside the image -- Winograd pads, it
// cannot skip a tap (the direct kernels' "skipping and adding a zero" again, here the only way). Groups of output channels
// run across z, as the fast kernel's do, so every thread of a workgroup reads the same weights. The transformed weights are
// 16 Cin C4 vec4s -- 64 KiB at 32 -> 32, all of a default uniform binding with no room for the bias -- so they are a
// read-only STORAGE buffer at binding 3, and the uniform block holds H, W and the bias.
export const WINO_CB = 4;                      // input channels staged a block: 18 x 18 x 4 x 4 B = 5,184 B of workgroup memory
export const WINO_G4S = Object.freeze([1, 2, 4]);   // vec4s of output channels a thread may keep, 16 accumulators each
const WT = 2 * TILE + 2;                       // the staged window's side: a workgroup's 16 outputs and a pixel of halo each side

/**
 * The Winograd kernel's shape for a layer and { g4 }: G vec4s a thread keeps (at most the layer's own), groups of them across
 * z, C4 vec4s of padded output channels, the uniform block's bytes (16 of H and W, then the bias), the transformed weights'
 * bytes, the window's workgroup bytes, and whether the kernel holds it -- a 3 x 3 layer only.
 */
export function winoShape({ Cin, Cout, k }, { g4 = 1 } = {}) {
    const c4 = Math.ceil(Cout / 4), G = Math.min(g4, c4), groups = Math.ceil(c4 / G), C4 = groups * G;
    const bytes = 16 + 16 * C4, weightBytes = 16 * 16 * Cin * C4, wgBytes = WT * WT * WINO_CB * 4;
    return { g4: G, groups, C4, bytes, weightBytes, wgBytes, fits: k === 3 && WINO_G4S.includes(g4) && bytes <= UNIFORM_MAX && wgBytes <= WORKGROUP_MAX };
}

/**
 * A 3 x 3 layer's transformed weights, G g G^T per (output, input) channel pair, computed in f64 from the f32 weights and
 * rounded to f32 ONCE: position e = 4 i + j (i the transform of the filter's rows, j of its columns) of channel pair
 * (co, ci) at float ((e Cin + ci) C4 + co / 4) 4 + co % 4 -- e outermost, then ci, then the output channels as vec4s, the
 * padding past Cout zero. What the kernel reads at binding 3, and what its twin multiplies by.
 */
export function winoFilter({ Cin, Cout, k, W }, C4 = Math.ceil(Cout / 4)) {
    if (k !== 3) throw new Error(`conv2d: the Winograd transform is for a 3 x 3 filter, got k ${k}`);
    const U = new Float32Array(16 * Cin * C4 * 4), w = (co, ky, kx, ci) => Math.fround(W[((co * 3 + ky) * 3 + kx) * Cin + ci]);
    for (let co = 0; co < Cout; co++) for (let ci = 0; ci < Cin; ci++) {
        const Gg = [];                                  // G g, a filter column at a time: Gg[kx][i]
        for (let kx = 0; kx < 3; kx++) { const a = w(co, 0, kx, ci), b = w(co, 1, kx, ci), c = w(co, 2, kx, ci); Gg.push([a, (a + b + c) / 2, (a - b + c) / 2, c]); }
        for (let i = 0; i < 4; i++) {                   // (G g) G^T, a row at a time
            const a = Gg[0][i], b = Gg[1][i], c = Gg[2][i], row = [a, (a + b + c) / 2, (a - b + c) / 2, c];
            for (let j = 0; j < 4; j++) U[((i * 4 + j) * Cin + ci) * C4 * 4 + co] = row[j];
        }
    }
    return U;
}

/** The Winograd forward pass in f32 -- the twin (fused false) or the fused mirror (fused true) -- in the kernel's order. */
function winoForward(x, H, W, layer, fused) {
    check(H, W, layer);
    if (layer.k !== 3) throw new Error(`conv2d: the Winograd twin is for a 3 x 3 layer, got k ${layer.k}`);
    const { Cin, Cout } = layer, f = Math.fround, relu = String(layer.act ?? "none") === "relu", C4 = Math.ceil(Cout / 4), U = winoFilter(layer, C4);
    const y = new Float32Array(H * W * Cout), V = new Float32Array(Cin * 16), d = new Float32Array(16), t = new Float32Array(16), M = new Float32Array(16);
    const at = (yy, xx, ci) => (yy < 0 || yy >= H || xx < 0 || xx >= W ? 0 : f(x[(yy * W + xx) * Cin + ci]));
    for (let py = 0; py < H; py += 2) for (let px = 0; px < W; px += 2) {
        for (let ci = 0; ci < Cin; ci++) {
            for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) d[i * 4 + j] = at(py - 1 + i, px - 1 + j, ci);
            // t = B^T d, a column at a time
            for (let j = 0; j < 4; j++) { t[j] = f(d[j] - d[8 + j]); t[4 + j] = f(d[4 + j] + d[8 + j]); t[8 + j] = f(d[8 + j] - d[4 + j]); t[12 + j] = f(d[4 + j] - d[12 + j]); }
            // V = t B, a row at a time
            for (let i = 0; i < 4; i++) { const r = 4 * i, o = 16 * ci + r; V[o] = f(t[r] - t[r + 2]); V[o + 1] = f(t[r + 1] + t[r + 2]); V[o + 2] = f(t[r + 2] - t[r + 1]); V[o + 3] = f(t[r + 1] - t[r + 3]); }
        }
        for (let co = 0; co < Cout; co++) {
            M.fill(0);
            for (let ci = 0; ci < Cin; ci++) for (let e = 0; e < 16; e++) {
                const v = V[16 * ci + e], u = U[(e * Cin + ci) * C4 * 4 + co];
                M[e] = fused ? f(v * u + M[e]) : f(M[e] + f(v * u));
            }
            // A^T M A: s and q are A^T M's two rows, a column at a time; then the 2 x 2 outputs, the bias, the activation
            const s = [0, 1, 2, 3].map((j) => f(f(M[j] + M[4 + j]) + M[8 + j])), q = [0, 1, 2, 3].map((j) => f(f(M[4 + j] - M[8 + j]) - M[12 + j]));
            const out = [f(f(s[0] + s[1]) + s[2]), f(f(s[1] - s[2]) - s[3]), f(f(q[0] + q[1]) + q[2]), f(f(q[1] - q[2]) - q[3])], b = f(layer.b[co]);
            for (let a = 0; a < 4; a++) {
                const yy = py + (a >> 1), xx = px + (a & 1);
                if (yy >= H || xx >= W) continue;
                const v = f(out[a] + b);
                y[(yy * W + xx) * Cout + co] = relu ? f(Math.max(v, 0)) : v;
            }
        }
    }
    return y;
}
/** The Winograd kernel's twin: f32, rounded after every operation, in the kernel's order. A 3 x 3 layer only. */
export function conv2dCpuWino(x, H, W, layer) { return winoForward(x, H, W, layer, false); }
/** Its fused mirror: each M + V U rounded once, as a compiler that contracts it to an fma would. */
export function conv2dCpuWinoFma(x, H, W, layer) { return winoForward(x, H, W, layer, true); }

/** The Winograd kernel (entry k_conv_wino), generated for one 3 x 3 layer and one { g4 }. */
export function conv2dWinoWgsl({ Cin, Cout, k, act = "none" }, cfg = {}) {
    const S = winoShape({ Cin, Cout, k }, cfg);
    if (!S.fits) throw new Error(`conv2d: the Winograd kernel holds a 3 x 3 layer at g4 ${WINO_G4S.join("/")}, a bias in one ${UNIFORM_MAX}-byte uniform binding and a window in ${WORKGROUP_MAX} bytes -- got ${Cin} -> ${Cout}, k ${k}, g4 ${cfg.g4}`);
    const G = S.g4, js = Array.from({ length: G }, (_, j) => j), es = Array.from({ length: 16 }, (_, e) => e), r4 = [0, 1, 2, 3];
    const lanes = ["x", "y", "z", "w"], m = (e, j) => `m${e}_${j}`;
    const outFor = (j) => [
        ...r4.map((c) => `let s${c} = (${m(c, j)} + ${m(4 + c, j)}) + ${m(8 + c, j)}; let q${c} = (${m(4 + c, j)} - ${m(8 + c, j)}) - ${m(12 + c, j)};`),
        `let b = P.b[g * ${G}u + ${j}u];`,
        `var y0 = ((s0 + s1) + s2) + b; var y1 = ((s1 - s2) - s3) + b; var y2 = ((q0 + q1) + q2) + b; var y3 = ((q1 - q2) - q3) + b;`,
        ...(act === "relu" ? [r4.map((a) => `y${a} = max(y${a}, vec4<f32>(0.0));`).join(" ")] : []),
        ...r4.map((a) => `if (py + ${a >> 1}u < P.H && px + ${a & 1}u < P.W) { let o = ((py + ${a >> 1}u) * P.W + px + ${a & 1}u) * ${Cout}u + c + ${4 * j}u; ` +
            lanes.map((l, n) => `if (c + ${4 * j + n}u < ${Cout}u) { Y[o + ${n}u] = y${a}.${l}; }`).join(" ") + " }"),
    ];
    return `
struct WP { H: u32, W: u32, pad0: u32, pad1: u32, b: array<vec4<f32>, ${S.C4}> };
@group(0) @binding(0) var<storage, read_write> Y: array<f32>;            // H x W x ${Cout}
@group(0) @binding(1) var<uniform> P: WP;                                 // packWinoUniforms: H, W, the bias
@group(0) @binding(2) var<storage, read>       X: array<f32>;            // H x W x ${Cin}
@group(0) @binding(3) var<storage, read>       U: array<vec4<f32>>;      // winoFilter: 16 x ${Cin} x ${S.C4} vec4s
var<workgroup> T: array<f32, ${WT * WT * WINO_CB}>;
@compute @workgroup_size(${TILE}, ${TILE}, 1)
fn k_conv_wino(@builtin(local_invocation_id) lid: vec3<u32>, @builtin(workgroup_id) wid: vec3<u32>) {
    let ox = i32(wid.x * ${2 * TILE}u) - 1; let oy = i32(wid.y * ${2 * TILE}u) - 1;
    // this thread's tile: outputs (px, py) to (px + 1, py + 1)
    let px = wid.x * ${2 * TILE}u + 2u * lid.x; let py = wid.y * ${2 * TILE}u + 2u * lid.y; let g = wid.z;
    ${es.map((e) => js.map((j) => `var ${m(e, j)} = vec4<f32>(0.0);`).join(" ")).join("\n    ")}
    for (var c0 = 0u; c0 < ${Cin}u; c0 = c0 + ${WINO_CB}u) {
        let nb = min(${WINO_CB}u, ${Cin}u - c0);
        for (var i = lid.y * ${TILE}u + lid.x; i < ${WT * WT}u * nb; i = i + ${TILE * TILE}u) {
            let cj = i % nb; let t = i / nb; let sx = ox + i32(t % ${WT}u); let sy = oy + i32(t / ${WT}u);
            var v = 0.0;
            if (sx >= 0 && sx < i32(P.W) && sy >= 0 && sy < i32(P.H)) { v = X[(u32(sy) * P.W + u32(sx)) * ${Cin}u + c0 + cj]; }
            T[i] = v;
        }
        workgroupBarrier();
        for (var cj = 0u; cj < nb; cj = cj + 1u) {
            // d: the tile's 4 x 4 inputs, out of the window
            let o = (2u * lid.y * ${WT}u + 2u * lid.x) * nb + cj;
            ${r4.map((i) => r4.map((j) => `let d${i}${j} = T[o + ${i * WT + j}u * nb];`).join(" ")).join("\n            ")}
            // t = B^T d, a column at a time
            ${r4.map((j) => `let t0${j} = d0${j} - d2${j}; let t1${j} = d1${j} + d2${j}; let t2${j} = d2${j} - d1${j}; let t3${j} = d1${j} - d3${j};`).join("\n            ")}
            // v = t B, a row at a time
            ${r4.map((i) => `let v${i}0 = t${i}0 - t${i}2; let v${i}1 = t${i}1 + t${i}2; let v${i}2 = t${i}2 - t${i}1; let v${i}3 = t${i}1 - t${i}3;`).join("\n            ")}
            // M = M + v U, position by position: U of (e, ci, vec4 g ${G} + j) is at (e ${Cin} + ci) ${S.C4} + g ${G} + j
            let ub = (c0 + cj) * ${S.C4}u + g * ${G}u;
            ${es.map((e) => js.map((j) => `${m(e, j)} = ${m(e, j)} + v${e >> 2}${e & 3} * U[ub + ${e * Cin * S.C4 + j}u];`).join(" ")).join("\n            ")}
        }
        workgroupBarrier();
    }
    // A^T M A, the bias, the activation; a tile's outputs outside the image are not written
    let c = g * ${4 * G}u;
    ${js.map((j) => "{\n        " + outFor(j).join("\n        ") + "\n    }").join("\n    ")}
}
`;
}

/**
 * The Winograd kernel's two buffers for one layer at H x W: `uniforms`, H and W as u32 bits then the bias of co at float
 * 4 + co (padding zero), for binding 1; and `weights`, winoFilter's transformed weights, for binding 3. Refuses a layer the
 * kernel cannot hold, by name.
 */
export function packWinoUniforms({ H, W, layer }, cfg = {}) {
    const { Cin, Cout, k } = layer, S = winoShape(layer, cfg);
    if (!S.fits) throw new Error(`conv2d: the Winograd kernel cannot hold ${Cin} -> ${Cout}, k ${k}, g4 ${cfg.g4}`);
    const buf = new ArrayBuffer(S.bytes), u = new Uint32Array(buf), f = new Float32Array(buf);
    u[0] = H; u[1] = W;
    for (let co = 0; co < Cout; co++) f[4 + co] = layer.b[co];
    return { uniforms: f, weights: winoFilter(layer, S.C4) };
}
/** The Winograd kernel's dispatch at H x W: a workgroup per 16 x 16 outputs (TILE x TILE tiles of 2 x 2), a z group per g4 vec4s. */
export const winoWorkgroups = (H, W, layer, cfg = {}) => [Math.ceil(W / (2 * TILE)), Math.ceil(H / (2 * TILE)), winoShape(layer, cfg).groups];

/** Planar (Cout planes of n) to channels last (n x Cout): how a planar layer's output is judged against the twin. */
export function planarToChannelsLast(y, n, Cout) {
    const out = new Float32Array(n * Cout);
    for (let c = 0; c < Cout; c++) for (let p = 0; p < n; p++) out[p * Cout + c] = y[c * n + p];
    return out;
}

/** The direct kernel (entry k_conv), in the harness layout: Y at 0, the uniform at 1, X W B at 2 3 4. */
export function conv2dWgsl() { return DECL_PROBE + BODY_DIRECT; }
/** The tiled kernel (entry k_conv_tiled): same layout, same order, the window read from workgroup memory. */
export function conv2dTiledWgsl() { return DECL_PROBE + BODY_TILED; }

/** The uniform block: H, W, Cin, Cout, k, act as u32 bits in a Float32Array. Refuses what the tiled kernel cannot hold. */
export function packProbeUniforms({ H, W, Cin, Cout, k = 3, act = "none", tiled = false }) {
    if (tiled && (k > K_MAX || Cout > COUT_MAX)) throw new Error(`conv2d: the tiled kernel holds k <= ${K_MAX} and Cout <= ${COUT_MAX}, got k ${k}, Cout ${Cout}`);
    const b = new ArrayBuffer(32), u = new Uint32Array(b);
    u[0] = H; u[1] = W; u[2] = Cin; u[3] = Cout; u[4] = k; u[5] = ACT[act] ?? 0;
    return new Float32Array(b);
}
/** A seeded image and layer: values in [-1, 1), weights scaled by 1 / sqrt(k k Cin) so sums stay O(1). */
export function probeFixture({ H = 12, W = 10, Cin = 5, Cout = 4, k = 3, act = "relu", seed = 7 } = {}) {
    let s = seed >>> 0; const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; };
    const sc = 1 / Math.sqrt(k * k * Cin);
    const x = new Float32Array(H * W * Cin), Wt = new Float32Array(Cout * k * k * Cin), b = new Float32Array(Cout);
    for (let i = 0; i < x.length; i++) x[i] = Math.fround(u());
    for (let i = 0; i < Wt.length; i++) Wt[i] = Math.fround(u() * sc);
    for (let i = 0; i < b.length; i++) b[i] = Math.fround(u() * 0.1);
    return { H, W, x, layer: { Cin, Cout, k, W: Wt, b, act } };
}
/** The probe's twin: the fixture through conv2dCpu. */
export function probeCpu(args) { const F = probeFixture(args); return conv2dCpu(F.x, F.H, F.W, F.layer); }
/**
 * The exact key: a kernel that is 1 at its centre tap of the matching channel and 0 elsewhere, with no bias, is the
 * identity -- every output equals its input bit for bit, through any of the passes, because each sum is one product
 * by 1 among products by 0.
 */
export function keyCpu({ H = 6, W = 5, C = 3, k = 3, seed = 11 } = {}) {
    const F = probeFixture({ H, W, Cin: C, Cout: C, k, act: "none", seed });
    const Wt = new Float32Array(C * k * k * C), r = (k - 1) / 2;
    for (let c = 0; c < C; c++) Wt[((c * k + r) * k + r) * C + c] = 1;
    return { x: F.x, H, W, layer: { Cin: C, Cout: C, k, W: Wt, b: new Float32Array(C), act: "none" } };
}

const probe = (id, code, entryPoint, args) => Object.freeze({
    id, code, entryPoint, args: Object.freeze(args),
    pack: (a) => packProbeUniforms(a),
    inputs: (a) => { const F = probeFixture(a); return [{ binding: 2, data: F.x }, { binding: 3, data: F.layer.W }, { binding: 4, data: F.layer.b }]; },
    outCount: (a) => a.H * a.W * a.Cout,
    workgroups: (a) => [Math.ceil(a.W / TILE), Math.ceil(a.H / TILE)],
    cpu: (a) => probeCpu(a), tol: 0,
    key: () => keyCpu(),
});
// Borders on every side (12 x 10 is not a multiple of 8, so the second workgroup row and column are partial), 13 input
// channels so there are two channel blocks and the second is partial, and a relu so a sign error in the sum cannot
// hide behind a clamp at zero on only one side.
export const PROBES = Object.freeze([
    probe("conv2d.conv2dWgsl", () => conv2dWgsl(), "k_conv", { H: 12, W: 10, Cin: 13, Cout: 4, k: 3, act: "relu", seed: 7 }),
    probe("conv2d.conv2dTiledWgsl", () => conv2dTiledWgsl(), "k_conv_tiled", { H: 12, W: 10, Cin: 13, Cout: 4, k: 3, act: "relu", seed: 7, tiled: true }),
    // round 13: the same case, generated for its shape, its weights in the uniform -- binding 2 the image alone
    Object.freeze({ ...probe("conv2d.conv2dFastWgsl", (a) => conv2dFastWgsl(a), "k_conv_fast", { H: 12, W: 10, Cin: 13, Cout: 4, k: 3, act: "relu", seed: 7 }),
        pack: (a) => packFastUniforms({ H: a.H, W: a.W, layer: probeFixture(a).layer }),
        inputs: (a) => [{ binding: 2, data: probeFixture(a).x }],
        workgroups: (a) => [Math.ceil(a.W / TILE), Math.ceil(a.H / TILE), fastShape(a).groups] }),
    // round 14: a 1 x 1 case through the head kernel -- planar out, so its twin is the channels-last one transposed
    Object.freeze({ ...probe("conv2d.conv2dHeadWgsl", (a) => conv2dHeadWgsl(a), "k_head", { H: 12, W: 10, Cin: 13, Cout: 7, k: 1, act: "relu", seed: 7 }),
        pack: (a) => packHeadUniforms({ H: a.H, W: a.W, layer: probeFixture(a).layer }),
        inputs: (a) => [{ binding: 2, data: probeFixture(a).x }],
        workgroups: (a) => [Math.ceil(a.H * a.W / 64), headShape(a).C4, 1],
        cpu: (a) => { const y = probeCpu(a), n = a.H * a.W, out = new Float32Array(y.length);
                      for (let p = 0; p < n; p++) for (let c = 0; c < a.Cout; c++) out[c * n + p] = y[p * a.Cout + c]; return out; } }),
    // round 16: the same case through the pixel-tiled kernel, two pixels a thread -- 10 columns are one workgroup of two
    // 8-wide strips, the second three-fifths outside the image, so the guarded path runs beside the fast one
    Object.freeze({ ...probe("conv2d.conv2dTileWgsl", (a) => conv2dTileWgsl(a, a), "k_conv_tile", { H: 12, W: 10, Cin: 13, Cout: 4, k: 3, act: "relu", seed: 7, px: 2, g4: 8 }),
        pack: (a) => packTileUniforms({ H: a.H, W: a.W, layer: probeFixture(a).layer }, a),
        inputs: (a) => [{ binding: 2, data: probeFixture(a).x }],
        workgroups: (a) => tileWorkgroups(a.H, a.W, a, a) }),
]);
