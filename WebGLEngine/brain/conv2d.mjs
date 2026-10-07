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
 * the twin. `pre` returns the value before the activation, which the backward pass needs.
 */
function forward(x, H, W, layer, round, fused, pre) {
    check(H, W, layer);
    const { Cin, Cout, k } = layer, r = (k - 1) / 2, relu = String(layer.act ?? "none") === "relu";
    const f = round ? Math.fround : (v) => v;
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

/**
 * The f64 backward pass. `dY` is the loss's gradient with respect to this layer's OUTPUT (after the activation).
 * Returns { dX, dW, db } -- with respect to the input, the weights and the bias. The relu's gradient is taken as 0
 * where the pre-activation is exactly 0, the usual subgradient.
 */
export function conv2dBackward(x, H, W, layer, dY) {
    const { z } = forward(x, H, W, layer, false, false, true);
    const { Cin, Cout, k } = layer, r = (k - 1) / 2, relu = String(layer.act ?? "none") === "relu";
    if (dY.length !== H * W * Cout) throw new Error(`conv2d: dY holds ${dY.length}, H*W*Cout is ${H * W * Cout}`);
    const dX = new Float64Array(H * W * Cin), dW = new Float64Array(layer.W.length), db = new Float64Array(Cout);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) for (let co = 0; co < Cout; co++) {
        const o = (py * W + px) * Cout + co;
        const g = relu && !(z[o] > 0) ? 0 : dY[o];
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
]);
