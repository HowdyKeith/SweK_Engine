// WebGLEngine/brain/conv2d-selfcheck.mjs -- the denoiser arc, round 1
//
// Run: node brain/conv2d-selfcheck.mjs
//
// GATES brain/conv2d.mjs -- the convolution layer the path-tracer denoiser is built from. Its exports, each named
// here: TILE, K_MAX, CB, COUT_MAX, conv2dForward, conv2dCpu, conv2dCpuFma, conv2dBackward, conv2dWgsl,
// conv2dTiledWgsl, packProbeUniforms, probeFixture, probeCpu, keyCpu, PROBES -- round 13's (section 39): FAST_GROUP,
// UNIFORM_MAX, fastShape, conv2dFastWgsl, packFastUniforms -- round 14's (section 43): headShape, conv2dHeadWgsl,
// packHeadUniforms, planarToChannelsLast -- round 16's (section 54): tileShape, conv2dTileWgsl, packTileUniforms,
// tileWorkgroups -- and round 17's (section 59): fastAltShape, conv2dFastAltWgsl, packFastAltUniforms.
// Round 19 (section 66, v4851): which rounds' device rows stand aside, by adapter and by the run's compiler (nativeStandAside).
// Round 22 (section 71, v4859): round 16's rows run on D3D12 under DXC too, so only FXC (or an unread compiler) stands aside there.
//
// What it holds: the twin to the f64 reference within f32 rounding; the identity kernel exact through every pass;
// a 1x1 convolution BIT-IDENTICAL to the GPU Brain's dense layer (render/brainTsl.mjs's mlpLayerCpu), so the dense
// and the convolutional networks share one arithmetic; the channel-block order load-bearing where it should be and
// invisible where it should be; the backward pass to central finite differences; and every WGSL kernel to the twin,
// cell for cell, on Dawn -- the fast kernel on the shapes the denoiser runs it at, the head's three channel groups
// among them, with its uniform block laid out as its header says and its limits refused by name.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//
//   S1  the CPU passes sum in the plain order, the kernels keep the blocks      4 RED
//   S2  dX reads the tap's first weight for every channel                       2 RED
//   S3  the backward pass ignores relu's mask                                   2 RED
//   S4  the tiled kernel's halo origin one pixel off                            4 RED
//   S5  the tiled kernel's second barrier removed                               2 RED
//   S6  the direct kernel's bottom bound test off by one (reads past the image) 2 RED
//   S7  the identity key's 1 placed on the wrong channel                        2 RED
//   S8  the packer sends relu as "none"                                         3 RED
//   S9  the tiled kernel's accumulator drifts by one part in 10^7 a block       4 RED
//   round 13, against the fast kernel and its packer:
//   F1  a block's channels summed last-first                                    5 RED (the manifest case: 189 unexplained, and 26
//       cells that MATCH THE FUSED MIRROR BY ACCIDENT -- why a cell is held to two orders and the image to neither)
//   F2  the weights read without the group offset (groups 2-3 read group 1's)   1 RED (the head's case, the only one with groups)
//   F3  the bias packed one float late                                          6 RED (the layout row, and every device case)
//   F4  the second barrier removed                                              5 RED (deterministic here, as S5 was)
//   F5  the padding channels written past Cout                                  3 RED (the head, the 11-channel case, the key)
//   round 14, against the head kernel and its packer:
//   H1  the head kernel sums its channels last-first                           4 RED (the manifest case: 217 unexplained; and the
//       three device cases)
//   H2  the head kernel writes channels last, not planar                       5 RED (the manifest case, the three device cases, the key)
//   H3  packHeadUniforms puts the bias one float late                          5 RED (the layout row, the manifest case, the three
//       device cases)
//   round 16, against the pixel-tiled kernel (each also against render/denoiseDevice-selfcheck.mjs and
//   render/denoiseCompile-selfcheck.mjs; all restored, md5 verified):
//   P1  a block's channels summed last-first                                   10 RED (the manifest case: 189 unexplained and 26
//       fused by accident, F1's count exactly -- the same reversal on the same case)
//   P2  pixel p reads pixel 0's window (its strip offset dropped)              10 RED (and the identity key)
//   P3  the second barrier removed                                             10 RED (deterministic on SwiftShader, as S5 and F4 were;
//       the identity key holds -- five channels are one block, and one block needs no second barrier)
//   P4  the weights read without the group offset                               5 RED (exactly the five cases with z groups)
//   P6  tileWorkgroups dispatches half the columns                              6 RED (the shape row, the wide cases, the key)
//   P7  the guarded branch's per-pixel bound test removed                       0 RED, AND IT CANNOT BE OTHERWISE PORTABLY: the tile
//       holds zero outside the image, so the tap adds a zero product, which is the skip except in the sign of a zero --
//       which `===` does not see, and which WGSL lets an implementation ignore. The guard stays because the twin skips
//       (the header's "skipping and adding a zero"), and no row holds it
//   section 56, against edge "zero" (render/denoiseCompile-selfcheck.mjs alongside; restored, md5 verified):
//   Z1  the tile's load stops zeroing taps left and right of the image          4 RED -- every edge-zero case, and no edge-skip one:
//       edge zero adds what the tile holds outside the image, so its exactness IS the zero fill; edge skip never reads it
//   section 57, against the D3D12 stand-aside:
//   Z2  every adapter read as D3D12                                             1 RED (the stand-aside row) -- the tile kernel's device
//       rows all say SKIP, as they would on a D3D12 box; only the row holding the detector to D3D12 alone sees that it is wrong
//   section 59, against round 17's kernels (restored, md5 verified):
//   Q1  a vec4's four lanes added last-first                                    7 RED -- every vec4 case, written out or not; the
//       reversal fuses some cells by accident (698 of 12,768 at 10 -> 32), and the rows read them as unexplained bits
//   Q2  a written-out block's weights read from the next block                  6 RED (every written-out one-group case, and the code
//       row; the 81-channel head's offsets are run-time, and it passes)
//   Q3  the block packer files channel cj + 1 where cj belongs                  8 RED (the layout row, every written-out case, the key)
//   Q4  a written-out tap's column guard removed                                0 RED, as P7 was: the tile holds zero outside the image,
//       so the tap adds a zero product -- the skip but for the sign of a zero
//   Q5  the tile kernel's inline weights: pixel 1 reads the next vec4           1 RED (the two-pixel case; the one-pixel case has no
//       pixel 1)
//   section 66 (v4851), against the stand-aside by adapter AND compiler (section 5e; full gate each time, restored, md5 verified):
//   R1  round 17 stands aside under DXC too                                     1 RED (the D3D12-under-DXC row)
//   R2  round 16 runs under DXC as round 17 does                                1 RED (the same row)
//   R3  r17Comparator always "hoist" (round 16's tile built on D3D12 under DXC) 1 RED (the same row)
//   R4  an unread compiler counted as DXC                                       1 RED (the FXC-or-unread row)
//   R5  round 17's SKIP line stops naming the compiler                          1 RED (the same row)
//   R6  every adapter stands aside unless the compiler is DXC                   1 RED (the off-D3D12 row) -- and SwiftShader's round-16 and
//       round-17 device rows all said SKIP, 82 PASS falling to 53: nothing else on this box sees a stand-aside that is too wide
//   R7  NATIVE_FLAGS made ["disable-dawn-features=use_dxc"]                     1 RED (the flags row)
//   and a check, not a sabotage: r17Comparator forced to "fast" on SwiftShader -- round 17's two inline rows ran against the fast
//   kernel's bits and were green (0 fused of 12,768 and 4,477), so the D3D12-under-DXC path is exercised on a device here
//
// *** S5 WAS EXPECTED TO GO ZERO RED AND DID NOT. *** A missing barrier is a race, and races hide on a device that
// runs a workgroup's threads one after another. SwiftShader does run them in order -- which is exactly why it is
// caught: the first thread of the next block's load overwrites the tile before the later threads of this block
// have read it, every time. On a real GPU the same defect would be intermittent; here it is deterministic.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const C = await imp("brain/conv2d.mjs");
const { TILE, K_MAX, CB, COUT_MAX, conv2dForward, conv2dCpu, conv2dCpuFma, conv2dBackward, conv2dWgsl, conv2dTiledWgsl,
        packProbeUniforms, probeFixture, probeCpu, keyCpu, PROBES, FAST_GROUP, UNIFORM_MAX, fastShape, conv2dFastWgsl, packFastUniforms,
        headShape, conv2dHeadWgsl, packHeadUniforms, planarToChannelsLast, tileShape, conv2dTileWgsl, packTileUniforms, tileWorkgroups,
        fastAltShape, conv2dFastAltWgsl, packFastAltUniforms } = C;
const { mlpLayerCpu } = await imp("render/brainTsl.mjs");
const H = await imp("tools/ship/headlessGpu.mjs");
// v4838: the device cases as a report table (tools/ship/gateReport.mjs) -- the counts every PASS line prints, kept past the terminal
const { gateReport } = await imp("tools/ship/gateReport.mjs");
const REPORT = gateReport("brain/conv2d-selfcheck.mjs"), CASES = [];

// *** SECTION 57: THE PIXEL-TILED KERNEL IS NOT BUILT NATIVELY ON A D3D12 ADAPTER. *** node-webgpu compiles D3D12 pipelines with
// FXC, which did not build it at 32 -> 32 within 3 minutes on either of Keith's GPUs (section 56's probe), and stopped every
// denoiser gate that tried at realGpuRun's 30-minute cap. On such an adapter its device rows say SKIP and why; its CPU rows,
// and its device rows on any other backend (SwiftShader, Vulkan, Metal), still hold.
const fxcAdapter = (ad) => /\bD3D12\b/i.test(ad?.description || "");
const FXC_SKIP = "the pixel-tiled kernel is not built natively on a D3D12 adapter: node-webgpu's FXC did not finish it in 3 minutes on either GPU (section 57)";
// section 59: round 17's kernels -- the fast kernel's other ways, the tile kernel's inline weights -- stand aside there too until
// the probe shows FXC builds them; the probe builds each under a cap, so no gate has to find out by waiting
// v4851: section 60 read that probe -- 0.6.0's FXC stopped on r18t's kernel at 3 minutes and crashed on r18u's, on both GPUs
const FXC_SKIP_R17 = "round 17's kernels are not built natively on a D3D12 adapter under FXC: node-webgpu 0.6.0's FXC stopped on r18t's kernel and crashed on r18u's on both GPUs (section 60)";
// v4851 -- round 19 (section 66): ROUND 17'S DEVICE ROWS RUN ON A D3D12 ADAPTER WHEN THE RUN'S COMPILER IS DXC; ROUND 16'S STILL DO NOT.
// node-webgpu 0.6.2 ships DXC, and on both of the rig's GPUs it built all 7 of round 17's shapes (BUILD_PROBE_R17), each exact, in
// 2.4 s or less (section 65). That probe ran round 17's shapes only: round 16's (BUILD_PROBE -- the hoisted tile at every px, edge
// skip and zero) were never built under DXC anywhere, so they stand aside on every D3D12 adapter, whatever the compiler. The
// compiler is read off the package (tools/ship/headlessGpu.mjs's nativeCompiler) with the flags this gate's device is made with
// -- runWgslComputeNative's instanceFor makes it through mod.create([]), Dawn as shipped, so NATIVE_FLAGS is empty -- because the
// adapter cannot say: on 0.6.2 its description is "D3D12 driver version ..." under either compiler. The compile gate holds that
// reading to Dawn's own dump in the same run. Anything but "DXC" -- FXC, none, unread -- counts as FXC, the safe side: a wrong
// "FXC" costs rows, a wrong "DXC" stops the gate at realGpuRun's 30-minute cap (section 56). Off D3D12 nothing stands aside.
const NATIVE_FLAGS = Object.freeze([]);
const WPKG = H.webgpuPackage(H.resolveWebgpu().from);
const COMPILER = H.nativeCompiler({ pkg: WPKG, platform: process.platform, flags: NATIVE_FLAGS });
// null: the round's device rows run on this adapter under this compiler; else the SKIP line's reason, naming the compiler read.
// Pure -- the adapter as runWgslComputeNative reports it ({ vendor, architecture, description }), the compiler as nativeCompiler
// names it, the round as a number -- so section 5e holds every branch on the rig's own descriptions, on a box with no D3D12.
// v4859 -- round 22 (section 71): ROUND 16'S DEVICE ROWS RUN UNDER DXC TOO. On both of the rig's GPUs, node-webgpu 0.6.2 with
// nothing set built all ten of round 16's shapes natively under DXC (BUILD_PROBE: the hoisted tile at every px, edge skip and zero;
// 1.3 s at worst), every dump DXIL, every one exact at 64 x 64 -- so the stand-aside narrows to FXC, as round 17's did at section 66.
function nativeStandAside(adapter, compiler, round) {
    if (!fxcAdapter(adapter)) return null;
    if ((round === 16 || round === 17) && compiler === "DXC") return null;
    const said = compiler === "DXC" || compiler === "FXC" ? compiler : `an unread compiler (${JSON.stringify(compiler ?? null)}), counted as FXC`;
    if (round === 17) return `${FXC_SKIP_R17}; this run compiles with ${said}, and under DXC (node-webgpu 0.6.2) they run (section 66)`;
    if (round === 16) return `${FXC_SKIP}; this run compiles with ${said}, and under DXC (node-webgpu 0.6.2) they run (section 71)`;
    return `round ${round}'s kernels are not named by section 66 and stand aside on a D3D12 adapter under any compiler; this run compiles with ${said}`;
}
// round 17's inline-weight rows compare, where neither fused, with the tile kernel's hoisted weights -- round 16's shapes. Where
// round 16 stands aside and round 17 runs (D3D12 under DXC until v4859) that comparator would build a round-16 shape on D3D12, so the
// fast kernel's bits stand in: round 16's own rows hold the hoisted tile to exactly those bits wherever both run (sections 54-58)
const r17Comparator = (adapter, compiler) => (nativeStandAside(adapter, compiler, 16) ? "fast" : "hoist");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const diffCount = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) n++; return n; };

console.log("1. THE FORWARD PASS: THE TWIN, THE REFERENCE, AND THE ONE KEY THAT IS EXACT");
{
    const F = probeFixture({ H: 9, W: 7, Cin: 11, Cout: 6, k: 3, act: "none", seed: 5 });
    const ref = conv2dForward(F.x, F.H, F.W, F.layer), twin = conv2dCpu(F.x, F.H, F.W, F.layer), fma = conv2dCpuFma(F.x, F.H, F.W, F.layer);
    let worst = 0; for (let i = 0; i < ref.length; i++) worst = Math.max(worst, Math.abs(ref[i] - twin[i]));
    ok(`  the f32 twin is the f64 reference within f32 rounding -- worst ${worst.toExponential(2)} over ${ref.length} outputs of ~100-term sums`,
        worst < 1e-5 && worst > 0, "nonzero, so the twin really rounds; small, so it rounds the same sum");
    // bounded against the REFERENCE, not in ulps of the output: a ~100-term sum can cancel to a small value after
    // rounding on partial sums much larger than it, so the first draft's "a few ulps of the result" failed honestly
    const nf = diffCount(twin, fma);
    let wf = 0; for (let i = 0; i < ref.length; i++) wf = Math.max(wf, Math.abs(ref[i] - fma[i]));
    ok(`  the fused mirror differs from the twin on ${nf} of ${twin.length} cells, and is as close to the reference: worst ${wf.toExponential(2)} -- the room a contracting compiler has`,
        nf > 0 && wf < 1e-5);
    const K = keyCpu();
    const outs = [conv2dForward(K.x, K.H, K.W, K.layer), conv2dCpu(K.x, K.H, K.W, K.layer), conv2dCpuFma(K.x, K.H, K.W, K.layer)];
    ok("!! the identity kernel (1 at the centre tap of the matching channel, no bias) returns its input BIT FOR BIT through the reference, the twin and the fused mirror",
        outs.every((o) => o.length === K.x.length && o.every((v, i) => v === K.x[i])), `${K.H} x ${K.W} x ${K.layer.Cin}`);
    const R = probeFixture({ H: 5, W: 5, Cin: 3, Cout: 2, k: 3, act: "relu", seed: 9 });
    const zr = conv2dForward(R.x, R.H, R.W, { ...R.layer, act: "none" }), yr = conv2dForward(R.x, R.H, R.W, R.layer);
    ok("  relu is max(z, 0) of the same sum, and the fixture has both signs", yr.every((v, i) => v === Math.max(zr[i], 0)) && zr.some((v) => v < 0) && zr.some((v) => v > 0));
}

console.log("\n2. *** A 1x1 CONVOLUTION IS THE GPU BRAIN'S DENSE LAYER, BIT FOR BIT ***");
{
    // the weights of a 1x1 conv are Cout x 1 x 1 x Cin, which IS mlp's nOut x nIn row-major, and the sum is the same
    // bias-first walk over the inputs -- so a pixel is a batch row and the two twins must agree exactly
    for (const [Cin, act] of [[7, "relu"], [21, "none"]]) {
        const F = probeFixture({ H: 4, W: 6, Cin, Cout: 5, k: 1, act, seed: 13 });
        const conv = conv2dCpu(F.x, F.H, F.W, F.layer);
        const mlp = mlpLayerCpu({ nIn: Cin, nOut: 5, W: F.layer.W, b: F.layer.b, act }, F.x, F.H * F.W);
        ok(`!! ${F.H * F.W} pixels x ${Cin} -> 5 channels (${act}): conv2dCpu with k = 1 === mlpLayerCpu over the pixels as a batch`, same(conv, mlp),
            `${diffCount(conv, mlp)} of ${conv.length} cells differ` + (Cin > CB ? ` -- with ${Cin} inputs, more than one channel block of ${CB}: at k = 1 the blocks are consecutive, so the order is the plain one` : ""));
    }
}

console.log("\n3. THE CHANNEL BLOCKS ARE IN THE ORDER, WHERE THEY MATTER AND NOWHERE ELSE");
{
    // the plain order -- every channel of a tap before the next tap -- written out here as the rival
    const plain = (x, Hh, Ww, L) => {
        const { Cin, Cout, k } = L, r = (k - 1) / 2, f = Math.fround, y = new Float32Array(Hh * Ww * Cout);
        for (let py = 0; py < Hh; py++) for (let px = 0; px < Ww; px++) for (let co = 0; co < Cout; co++) {
            let acc = f(L.b[co]);
            for (let ky = 0; ky < k; ky++) { const sy = py + ky - r; if (sy < 0 || sy >= Hh) continue;
                for (let kx = 0; kx < k; kx++) { const sx = px + kx - r; if (sx < 0 || sx >= Ww) continue;
                    const xo = (sy * Ww + sx) * Cin, wo = ((co * k + ky) * k + kx) * Cin;
                    for (let ci = 0; ci < Cin; ci++) acc = f(acc + f(f(x[xo + ci]) * f(L.W[wo + ci]))); } }
            y[(py * Ww + px) * Cout + co] = L.act === "relu" ? f(Math.max(acc, 0)) : acc;
        }
        return y;
    };
    const A = probeFixture({ H: 8, W: 8, Cin: CB, Cout: 4, k: 3, act: "none", seed: 21 });
    const B = probeFixture({ H: 8, W: 8, Cin: 3 * CB - 3, Cout: 4, k: 3, act: "none", seed: 21 });
    const dA = diffCount(conv2dCpu(A.x, 8, 8, A.layer), plain(A.x, 8, 8, A.layer)), dB = diffCount(conv2dCpu(B.x, 8, 8, B.layer), plain(B.x, 8, 8, B.layer));
    ok(`  with Cin = CB = ${CB} there is one block and the canonical order IS the plain one: ${dA} cells differ`, dA === 0);
    ok(`!! with Cin = ${3 * CB - 3} (three blocks) the block-outer order moves ${dB} of 256 cells -- the blocks are a real choice of sum, made once and copied everywhere`,
        dB > 0, "SwiftShader's pipeline build is why they exist: the all-channels tile took 3,149 ms, the 8-channel tile 324");
}

console.log("\n4. THE BACKWARD PASS, AGAINST CENTRAL FINITE DIFFERENCES");
{
    for (const act of ["none", "relu"]) {
        const F = probeFixture({ H: 6, W: 5, Cin: 10, Cout: 3, k: 3, act, seed: 3 });
        const x = Float64Array.from(F.x), L = { ...F.layer, W: Float64Array.from(F.layer.W), b: Float64Array.from(F.layer.b) };
        let s = 99; const u = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1);
        const dY = Float64Array.from({ length: 6 * 5 * 3 }, u);
        const loss = () => { const y = conv2dForward(x, 6, 5, L); let a = 0; for (let i = 0; i < y.length; i++) a += y[i] * dY[i]; return a; };
        const g = conv2dBackward(x, 6, 5, L, dY), h = 1e-6;
        const fd = (arr, i) => { const o = arr[i]; arr[i] = o + h; const a = loss(); arr[i] = o - h; const b = loss(); arr[i] = o; return (a - b) / (2 * h); };
        let wx = 0, ww = 0, wb = 0;
        for (let i = 0; i < x.length; i++) wx = Math.max(wx, Math.abs(fd(x, i) - g.dX[i]));
        for (let i = 0; i < L.W.length; i++) ww = Math.max(ww, Math.abs(fd(L.W, i) - g.dW[i]));
        for (let i = 0; i < L.b.length; i++) wb = Math.max(wb, Math.abs(fd(L.b, i) - g.db[i]));
        ok(`!! ${act}: dX, dW and db agree with central differences -- worst ${Math.max(wx, ww, wb).toExponential(2)} over ${x.length + L.W.length + L.b.length} parameters`,
            Math.max(wx, ww, wb) < 1e-6, `dX ${wx.toExponential(1)}, dW ${ww.toExponential(1)}, db ${wb.toExponential(1)}`);
    }
    const R = probeFixture({ H: 7, W: 6, Cin: 9, Cout: 5, k: 3, act: "relu", seed: 17 });
    const rx = Float64Array.from(R.x), RL = { ...R.layer, W: Float64Array.from(R.layer.W), b: Float64Array.from(R.layer.b) };
    let s2 = 7; const dY2 = Float64Array.from({ length: 7 * 6 * 5 }, () => ((s2 = (s2 * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1));
    const gA = conv2dBackward(rx, 7, 6, RL, dY2), gB = conv2dBackward(rx, 7, 6, RL, dY2, { y: conv2dForward(rx, 7, 6, RL) });
    ok("!! handed the layer's own forward output, the backward pass reads relu's mask from it and gives the SAME gradients, bit for bit",
        same(gA.dX, gB.dX) && same(gA.dW, gB.dW) && same(gA.db, gB.db), "the training loop keeps every layer's output, so it never re-runs a forward pass to differentiate it");
    const Z = { Cin: 1, Cout: 1, k: 1, W: [1], b: [0], act: "relu" };
    const gz = conv2dBackward([0], 1, 1, Z, [1]);
    ok("  relu's gradient at exactly zero is taken as 0, the usual subgradient", gz.dX[0] === 0 && gz.db[0] === 0);
}

console.log("\n5. THE FAST KERNEL'S UNIFORM BLOCK, ON THE CPU (round 13)");
{
    // the layout its header states: H and W as u32, the bias of co at float 4 + co, weight (co, ky, kx, ci) at float
    // 4 + 4 C4 + ((ky k + kx) Cin + ci) 4 C4 + co -- read back here for every weight of a layer with three groups
    const F = probeFixture({ H: 5, W: 6, Cin: 3, Cout: 70, k: 3, act: "none", seed: 9 }), L = F.layer, S = fastShape(L);
    const f = packFastUniforms({ H: 5, W: 6, layer: L }), u = new Uint32Array(f.buffer), w0 = 4 + 4 * S.C4;
    let misplaced = 0;
    for (let co = 0; co < L.Cout; co++) {
        if (f[4 + co] !== L.b[co]) misplaced++;
        for (let ky = 0; ky < 3; ky++) for (let kx = 0; kx < 3; kx++) for (let ci = 0; ci < 3; ci++)
            if (f[w0 + ((ky * 3 + kx) * 3 + ci) * 4 * S.C4 + co] !== L.W[((co * 3 + ky) * 3 + kx) * 3 + ci]) misplaced++;
    }
    let padding = 0;
    for (let c = L.Cout; c < 4 * S.C4; c++) { if (f[4 + c] !== 0) padding++; for (let t = 0; t < 27; t++) if (f[w0 + t * 4 * S.C4 + c] !== 0) padding++; }
    ok(`!! the block is laid out as its header says: H, W, then ${S.C4} vec4s of bias and ${9 * 3 * S.C4} of weights for 3 -> 70 at 3 x 3 -- every weight and bias where the kernel reads it, the padding zero`,
        u[0] === 5 && u[1] === 6 && misplaced === 0 && padding === 0 && f.length * 4 === S.bytes && S.bytes === 16 + 16 * S.C4 + 16 * 27 * S.C4,
        `${misplaced} misplaced, ${padding} nonzero padding, ${S.bytes} bytes`);
    ok(`  a thread keeps ${FAST_GROUP} channels (${FAST_GROUP / 4} vec4s); 70 channels are ${S.groups} groups of ${S.g4} vec4s, the last part padding -- the head's 81 likewise`,
        S.g4 === FAST_GROUP / 4 && S.groups === 3 && S.C4 === 24 && fastShape({ Cin: 32, Cout: 81, k: 1 }).groups === 3 && fastShape({ Cin: 13, Cout: 4, k: 3 }).g4 === 1);
    const big = { Cin: 64, Cout: 32, k: 3 };
    let refused = null; try { conv2dFastWgsl({ ...big, act: "none" }); } catch (e) { refused = e.message; }
    let refusedP = null; try { packFastUniforms({ H: 2, W: 2, layer: { ...big, W: new Float32Array(64 * 32 * 9), b: new Float32Array(32) } }); } catch (e) { refusedP = e.message; }
    ok(`  a layer whose weights pass one ${UNIFORM_MAX}-byte uniform binding is refused by name, by the kernel and by the packer -- 64 -> 32 at 3 x 3 is ${fastShape(big).bytes} bytes`,
        !fastShape(big).fits && /uniform binding/.test(refused || "") && /uniform binding/.test(refusedP || "") && fastShape({ Cin: 32, Cout: 32, k: 3 }).fits);
    const code = conv2dFastWgsl({ Cin: 32, Cout: 32, k: 3, act: "relu" });
    ok("  the kernel is generated for its layer: one entry, three bindings, eight vec4 accumulators, the relu written in only when asked",
        /fn k_conv_fast/.test(code) && (code.match(/@binding\(/g) || []).length === 3 && /var a7 = /.test(code) && !/var a8 = /.test(code) &&
        /max\(a0, vec4<f32>\(0\.0\)\)/.test(code) && !/max\(a0/.test(conv2dFastWgsl({ Cin: 32, Cout: 32, k: 3, act: "none" })));
}

console.log("\n5b. THE HEAD KERNEL'S UNIFORM BLOCK AND ITS PLANAR OUTPUT, ON THE CPU (round 14)");
{
    // weight (co, ci) at float 4 + 4 C4 + ci 4 C4 + co, the bias of co at 4 + co, every one read back for 32 -> 81
    const F = probeFixture({ H: 3, W: 4, Cin: 32, Cout: 81, k: 1, act: "none", seed: 21 }), L = F.layer, S = headShape(L);
    const f = packHeadUniforms({ H: 3, W: 4, layer: L }), u = new Uint32Array(f.buffer), w0 = 4 + 4 * S.C4;
    let misplaced = 0, padding = 0;
    for (let co = 0; co < 81; co++) { if (f[4 + co] !== L.b[co]) misplaced++; for (let ci = 0; ci < 32; ci++) if (f[w0 + ci * 4 * S.C4 + co] !== L.W[co * 32 + ci]) misplaced++; }
    for (let c = 81; c < 4 * S.C4; c++) { if (f[4 + c] !== 0) padding++; for (let ci = 0; ci < 32; ci++) if (f[w0 + ci * 4 * S.C4 + c] !== 0) padding++; }
    ok(`!! the head kernel's block is laid out as its header says: H, W, ${S.C4} vec4s of bias, ${32 * S.C4} of weights for the 32 -> 81 head -- every one where the kernel reads it, the padding zero`,
        u[0] === 3 && u[1] === 4 && S.C4 === 21 && misplaced === 0 && padding === 0 && f.length * 4 === S.bytes, `${misplaced} misplaced, ${padding} nonzero padding, ${S.bytes} bytes`);
    const y = Float32Array.from({ length: 12 * 5 }, (_, i) => i), cl = planarToChannelsLast(y, 12, 5);
    ok("  planar to channels last: plane c, pixel p lands at p x Cout + c", cl[0] === 0 && cl[1] === 12 && cl[5] === 1 && cl[5 * 11 + 4] === 4 * 12 + 11);
    let refused = null; try { conv2dHeadWgsl({ Cin: 32, Cout: 81, k: 3 }); } catch (e) { refused = e.message; }
    let refusedP = null; try { packHeadUniforms({ H: 2, W: 2, layer: { Cin: 64, Cout: 512, k: 1, W: new Float32Array(64 * 512), b: new Float32Array(512) } }); } catch (e) { refusedP = e.message; }
    ok("  the head kernel holds 1 x 1 layers whose weights fit one uniform binding, and refuses the rest by name -- a 3 x 3 layer, and 64 -> 512",
        !headShape({ Cin: 32, Cout: 81, k: 3 }).fits && /1 x 1 layer/.test(refused || "") && /1 x 1 layer/.test(refusedP || "") && headShape({ Cin: 32, Cout: 81, k: 1 }).fits);
    const code = conv2dHeadWgsl({ Cin: 32, Cout: 81, k: 1, act: "none" });
    ok("  it is generated for its layer: one entry, three bindings, no workgroup memory and no barrier -- section 42's slow layer had both",
        /fn k_head/.test(code) && (code.match(/@binding\(/g) || []).length === 3 && !/var<workgroup>/.test(code) && !/workgroupBarrier/.test(code));
}

console.log("\n5c. THE PIXEL-TILED KERNEL'S SHAPE AND UNIFORM BLOCK, ON THE CPU (round 16)");
{
    // the fast kernel's layout with the configuration's own C4: where the two C4s agree the blocks are the same bytes; where
    // they do not (70 channels in groups of 4 vec4s: C4 20, the fast kernel's 24), every weight is read back where it lands
    const T2 = { px: 2, g4: 8 }, T4 = { px: 4, g4: 4 };
    const F32 = probeFixture({ H: 5, W: 6, Cin: 32, Cout: 32, k: 3, act: "relu", seed: 23 }), fast32 = packFastUniforms({ H: 5, W: 6, layer: F32.layer });
    const asFast = [T2, T4].every((c) => same(Array.from(packTileUniforms({ H: 5, W: 6, layer: F32.layer }, c)), Array.from(fast32)));
    const F = probeFixture({ H: 5, W: 6, Cin: 3, Cout: 70, k: 3, act: "none", seed: 9 }), L = F.layer, S = tileShape(L, T4);
    const f = packTileUniforms({ H: 5, W: 6, layer: L }, T4), u = new Uint32Array(f.buffer), w0 = 4 + 4 * S.C4;
    let misplaced = 0, padding = 0;
    for (let co = 0; co < 70; co++) {
        if (f[4 + co] !== L.b[co]) misplaced++;
        for (let t = 0; t < 9; t++) for (let ci = 0; ci < 3; ci++) if (f[w0 + (t * 3 + ci) * 4 * S.C4 + co] !== L.W[(co * 9 + t) * 3 + ci]) misplaced++;
    }
    for (let c = 70; c < 4 * S.C4; c++) { if (f[4 + c] !== 0) padding++; for (let t = 0; t < 27; t++) if (f[w0 + t * 4 * S.C4 + c] !== 0) padding++; }
    ok(`!! the pixel-tiled kernel's block is the fast kernel's layout with its own C4: 32 -> 32 the fast block bit for bit at both configurations; 3 -> 70 in groups of 4 vec4s, C4 ${S.C4} (the fast kernel's ${fastShape(L).C4}), every weight and bias where the kernel reads it, the padding zero`,
        asFast && S.C4 === 20 && S.groups === 5 && u[0] === 5 && u[1] === 6 && misplaced === 0 && padding === 0 && f.length * 4 === S.bytes,
        `${misplaced} misplaced, ${padding} nonzero padding, ${S.bytes} bytes`);
    const s2 = tileShape({ Cin: 32, Cout: 32, k: 3 }, T2), s4 = tileShape({ Cin: 32, Cout: 32, k: 3 }, T4);
    ok(`  its shape: a workgroup ${TILE * 2} x ${TILE} pixels at 2 a thread (a ${s2.TW} x ${s2.TH} tile, ${s2.wgBytes} bytes), ${TILE * 4} x ${TILE} at 4 (${s4.TW} x ${s4.TH}, ${s4.wgBytes}); 32 channels in 1 z group of 8 vec4s, or 2 of 4`,
        s2.TW === 18 && s2.TH === 10 && s2.wgBytes === 18 * 10 * CB * 4 && s4.TW === 34 && s4.wgBytes === 34 * 10 * CB * 4 && s2.groups === 1 && s2.g4 === 8 && s4.groups === 2 && s4.g4 === 4 &&
        tileWorkgroups(1080, 1920, { Cin: 32, Cout: 32, k: 3 }, T2).join() === "120,135,1" && tileWorkgroups(1080, 1920, { Cin: 32, Cout: 32, k: 3 }, T4).join() === "60,135,2" &&
        tileShape({ Cin: 9, Cout: 16, k: 3 }, T2).g4 === 4);
    const refuse = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    const big = { Cin: 64, Cout: 32, k: 3 }, rBig = refuse(() => conv2dTileWgsl(big, T2)), rPx = refuse(() => conv2dTileWgsl({ Cin: 4, Cout: 4, k: 3 }, { px: 3, g4: 1 }));
    const rK = refuse(() => conv2dTileWgsl({ Cin: 4, Cout: 4, k: 2 }, T2)), rP = refuse(() => packTileUniforms({ H: 2, W: 2, layer: { ...big, W: new Float32Array(64 * 32 * 9), b: new Float32Array(32) } }, T2));
    ok("  what it cannot hold is refused by name, by the kernel and by the packer: weights past one uniform binding (64 -> 32), px 3, an even k",
        /uniform binding/.test(rBig || "") && /px in 1\/2\/4/.test(rPx || "") && /odd k/.test(rK || "") && /cannot hold/.test(rP || ""));
    const code = conv2dTileWgsl({ Cin: 32, Cout: 32, k: 3, act: "relu" }, T2), code4 = conv2dTileWgsl({ Cin: 32, Cout: 32, k: 3, act: "none" }, T4);
    ok("  it is generated for its layer and configuration: one entry, three bindings, px x g4 named vec4 accumulators (2 x 8, 4 x 4), each weight read once a channel, the relu only when asked",
        /fn k_conv_tile/.test(code) && (code.match(/@binding\(/g) || []).length === 3 && /var a1_7 = /.test(code) && !/var a2_0 = /.test(code) && !/var a1_8 = /.test(code) &&
        /var a3_3 = /.test(code4) && !/var a3_4 = /.test(code4) && !/var a4_0 = /.test(code4) && (code.match(/let w7 = F\.w\[w \+ 7u\];/g) || []).length === 1 &&
        /max\(a1_7, vec4<f32>\(0\.0\)\)/.test(code) && !/max\(a/.test(code4));
    // section 56: edge "zero" drops the guarded copy of the channel loop; "skip" is the default and section 54's kernel
    const zero = conv2dTileWgsl({ Cin: 32, Cout: 32, k: 3, act: "relu" }, { ...T2, edge: "zero" }), rEdge = refuse(() => conv2dTileWgsl({ Cin: 4, Cout: 4, k: 3 }, { px: 2, g4: 1, edge: "clamp" }));
    ok("  edge \"zero\" (section 56): one channel loop a tap and no per-pixel bound test -- the tile's zero stands in for the skip; \"skip\" is the default, and any other edge is refused by name",
        (zero.match(/for \(var cj/g) || []).length === 1 && (code.match(/for \(var cj/g) || []).length === 2 && !/o0/.test(zero) && /if \(o0 && o1\)/.test(code) &&
        conv2dTileWgsl({ Cin: 32, Cout: 32, k: 3, act: "relu" }, T2) === conv2dTileWgsl({ Cin: 32, Cout: 32, k: 3, act: "relu" }, { ...T2, edge: "skip" }) &&
        tileShape({ Cin: 32, Cout: 32, k: 3 }, { ...T2, edge: "zero" }).fits && /edge skip or zero/.test(rEdge || ""));
    ok("  section 57: the tile kernel's device rows stand aside on a D3D12 adapter (node-webgpu's FXC) and on no other -- Vulkan, SwiftShader, Metal",
        fxcAdapter({ description: "D3D12 driver version 32.0.15.8180" }) && !fxcAdapter({ description: "SwiftShader driver 5.0.0" }) &&
        !fxcAdapter({ description: "Vulkan driver" }) && !fxcAdapter({ description: "Metal driver on macOS" }) && !fxcAdapter(null));
}

console.log("\n5d. THE FAST KERNEL'S OTHER WAYS, AND THE TILE KERNEL'S INLINE WEIGHTS, ON THE CPU (round 17)");
{
    // without unroll the block is packFastUniforms' own; with it, block by block -- every weight read back where it lands for
    // 19 -> 11, two whole blocks and a last of three, the padding (channels past Cin, lanes past Cout) zero
    const F = probeFixture({ H: 5, W: 6, Cin: 19, Cout: 11, k: 3, act: "none", seed: 29 }), L = F.layer, S = fastAltShape(L, { unroll: true });
    const f = packFastAltUniforms({ H: 5, W: 6, layer: L }, { unroll: true }), u = new Uint32Array(f.buffer), w0 = 4 + 4 * S.C4;
    let misplaced = 0, nonzero = 0, placed = 0;
    for (let co = 0; co < 11; co++) { if (f[4 + co] !== L.b[co]) misplaced++;
        for (let t = 0; t < 9; t++) for (let ci = 0; ci < 19; ci++) { const at = w0 + 4 * (Math.floor(ci / CB) * S.perBlock + (t * CB + ci % CB) * S.C4) + co; placed++;
            if (f[at] !== L.W[(co * 9 + t) * 19 + ci]) misplaced++; } }
    for (let i = w0; i < f.length; i++) if (f[i] !== 0) nonzero++;
    const flat = packFastAltUniforms({ H: 5, W: 6, layer: L }, { reads: "vec4" });
    ok(`!! round 17: written out, the uniform block holds the weights block by block -- ${S.blocks} blocks of ${S.perBlock} vec4s for 19 -> 11, the last block's channels past Cin zero; without unroll it is packFastUniforms' own, bit for bit`,
        misplaced === 0 && nonzero === placed - [...L.W].filter((v) => v === 0).length && S.blocks === 3 && S.perBlock === 9 * CB * S.C4 && f.length * 4 === S.bytes &&
        u[0] === 5 && u[1] === 6 && same(Array.from(flat), Array.from(packFastUniforms({ H: 5, W: 6, layer: L }))),
        `${misplaced} misplaced, ${nonzero} nonzero of ${placed} placed, ${S.bytes} bytes`);
    const L32 = { Cin: 32, Cout: 32, k: 3, act: "relu" }, cv = conv2dFastAltWgsl(L32, { reads: "vec4" }), cu = conv2dFastAltWgsl(L32, { unroll: true }), cb = conv2dFastAltWgsl(L32, { reads: "vec4", unroll: true });
    const refuse = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    ok("  their code: vec4 reads a pixel's 8 channels as 2 vec4s; written out, no channel loop and every weight at a constant offset in its block (F.w[b][...]), 576 multiply-adds a block; an unknown reads is refused",
        /var<workgroup> T: array<vec4<f32>, 200>/.test(cv) && /let x4 = T\[to \+ 1u\]/.test(cv) && !/for \(var cj/.test(cu) && (cu.match(/F\.w\[b\]\[\d+u\]/g) || []).length === 576 &&
        !/F\.w\[w/.test(cu) && (cb.match(/let x4 = T\[tb \+ \d+u\]/g) || []).length === 18 && /reads f32 or vec4/.test(refuse(() => conv2dFastAltWgsl(L32, { reads: "f16" })) || "") &&
        !fastAltShape({ Cin: 64, Cout: 32, k: 3 }, { unroll: true }).fits);
    const ti = conv2dTileWgsl(L32, { px: 2, g4: 8, edge: "zero", weights: "inline" }), th = conv2dTileWgsl(L32, { px: 2, g4: 8, edge: "zero" });
    ok("  the tile kernel's weights \"inline\": no weight held in a let, each pixel's multiply-add reading F.w itself -- \"hoist\" the default, as sections 54-58 ran it",
        !/let w0 = F\.w/.test(ti) && (ti.match(/v1 \* F\.w\[w \+ \du\]/g) || []).length === 8 && /let w0 = F\.w/.test(th) &&
        th === conv2dTileWgsl(L32, { px: 2, g4: 8, edge: "zero", weights: "hoist" }) && /weights hoist or inline/.test(refuse(() => conv2dTileWgsl(L32, { weights: "both" })) || ""));
}

console.log("\n5e. WHICH ROUNDS' DEVICE ROWS STAND ASIDE, BY ADAPTER AND COMPILER, ON STUB ADAPTERS (round 19, section 66)");
{
    // v4851: this box has no D3D12, so every branch of nativeStandAside is held here, on the rig's own adapters as the build probe
    // named them (section 65) and as runWgslComputeNative reports one -- the Intel's and the 1080's -- and on adapters that are not D3D12
    const intel = { vendor: "intel", architecture: "gen-9", description: "D3D12 driver version 31.0.101.2137" };
    const gtx = { vendor: "nvidia", architecture: "pascal", description: "D3D12 driver version 32.0.15.8180" };
    const RIG = [intel, gtx], OFF = [{ vendor: "google", architecture: "swiftshader", description: "SwiftShader driver 5.0.0" }, { description: "Vulkan driver" },
        { description: "Metal driver on macOS" }, { vendor: "intel", architecture: "gen-9" }, null];
    // undefined and null a compiler not read; the rest names nativeCompiler never gives -- none of them is DXC
    const NOT_DXC = ["FXC", undefined, null, "", "unknown (no dump)", "dxc", "DXCompiler"], said = (c) => (c === undefined ? "(none)" : JSON.stringify(c));
    const runs = (a, c, r) => nativeStandAside(a, c, r) === null;
    // SABOTAGED v4851: round 17 stands aside under DXC too (its DXC exemption dropped) -> RED by name (this row alone); restored.
    // v4859 -- round 22 (section 71) turned this row's round-16 half over: round 16's shapes built and were exact natively under DXC on
    // both GPUs, so on D3D12 under DXC both rounds run, and round 17's inline rows compare with the hoisted tile again, as they do off D3D12.
    // SABOTAGED v4859: round 16 standing aside under DXC again (its DXC exemption dropped) -> RED by name (this row alone); restored, md5 verified.
    // SABOTAGED v4859: r17Comparator always "fast" -> RED by name (this row and the off-D3D12 row); restored, md5 verified.
    ok("!! round 22 (section 71): on a D3D12 adapter under DXC, round 16's and round 17's device rows both run -- the rig built all ten of round 16's shapes natively under DXC, exact -- and round 17's inline rows compare with round 16's hoisted tile",
        RIG.every((a) => runs(a, "DXC", 17) && runs(a, "DXC", 16) &&
            !runs(a, "DXC", undefined) && !runs(a, "DXC", "17") && r17Comparator(a, "DXC") === "hoist"),
        RIG.map((a) => `${a.vendor}: 17 ${runs(a, "DXC", 17) ? "runs" : "aside"}, 16 ${runs(a, "DXC", 16) ? "runs" : "aside"}, comparator ${r17Comparator(a, "DXC")}`).join("; "));
    // SABOTAGED v4851: an unread compiler counted as DXC (compiler !== "FXC" in place of === "DXC") -> RED by name (this row alone); restored.
    // SABOTAGED v4851: the SKIP line stops naming the compiler (said dropped from round 17's reason) -> RED by name (this row alone); restored.
    ok("!! round 19 (section 66): on a D3D12 adapter under FXC, an unread compiler or none, both rounds stand aside and each SKIP line names the compiler read -- anything but \"DXC\" counts as FXC, the safe side",
        RIG.every((a) => NOT_DXC.every((c) => [16, 17].every((r) => {
            const why = nativeStandAside(a, c, r) || "";
            return (c === "FXC" ? /this run compiles with FXC,/.test(why) : why.includes(`an unread compiler (${JSON.stringify(c ?? null)}), counted as FXC`)) && why.includes(`section ${r === 16 ? 57 : 60}`);
        }))),
        `the 1080 under ${NOT_DXC.map((c) => `${said(c)}: 16 ${runs(gtx, c, 16) ? "runs" : "aside"}, 17 ${runs(gtx, c, 17) ? "runs" : "aside"}`).join("; ")}`);
    // SABOTAGED v4851: every adapter stands aside unless the compiler is DXC (the D3D12 test made compiler-only) -> RED by name (this row alone; SwiftShader's own
    //   round-16 and round-17 device rows then printed SKIP, 82 PASS falling to 53 with no other red -- why this row has to exist); restored.
    ok("  round 19: off D3D12 -- SwiftShader, Vulkan, Metal, an adapter with no description, none -- both rounds run whatever compiler is named, and round 17's inline rows keep the hoisted tile as their comparator",
        OFF.every((a) => [...NOT_DXC, "DXC"].every((c) => runs(a, c, 16) && runs(a, c, 17) && r17Comparator(a, c) === "hoist")),
        `on SwiftShader under "FXC": 16 ${runs(OFF[0], "FXC", 16) ? "runs" : "aside"}, 17 ${runs(OFF[0], "FXC", 17) ? "runs" : "aside"}`);
    // v4851: the compiler is only as good as the flags it is read with, and the device here is made inside headlessGpu, not in this
    // file -- so this reads instanceFor's source: every instance it makes is mod.create([]), the flags NATIVE_FLAGS says (none)
    // SABOTAGED v4851: NATIVE_FLAGS read as ["disable-dawn-features=use_dxc"] (a compiler read with flags the device is not made with) -> RED by name (this row alone); restored.
    const hsrc = fs.readFileSync(path.join(ENG, "tools", "ship", "headlessGpu.mjs"), "utf8"), iI = hsrc.indexOf("function instanceFor(");
    const inst = iI >= 0 ? hsrc.slice(iI, hsrc.indexOf("\n}", iI)) : "", made = inst.match(/mod\.create\(([^)]*)\)/g) || [];
    ok("  round 19: the compiler is read with the flags this gate's device is made with -- runWgslComputeNative's instanceFor makes every instance with mod.create([]), so NATIVE_FLAGS is empty -- and it is none off win32",
        made.length > 0 && made.every((m) => m === "mod.create([])") && Object.isFrozen(NATIVE_FLAGS) && NATIVE_FLAGS.length === 0 &&
            COMPILER === H.nativeCompiler({ pkg: WPKG, platform: process.platform, flags: [] }) && (process.platform === "win32" ? ["DXC", "FXC"].includes(COMPILER) : COMPILER === null),
        `instanceFor: ${made.join(", ") || "not found"}; NATIVE_FLAGS ${JSON.stringify(NATIVE_FLAGS)}; this run: ${COMPILER || `none on ${process.platform}`}, node-webgpu ${(WPKG && WPKG.version) || "(version unread)"}`);
}

console.log("\n6. *** EVERY KERNEL ON THE DEVICE, CELL FOR CELL AGAINST THE TWIN ***");
const skip = H.headlessGpuSkipReason ? H.headlessGpuSkipReason() : null;
if (skip) console.log("  SKIP  " + skip);
else {
    const run = async (code, entryPoint, a) => {
        const F = probeFixture(a);
        return H.runWgslComputeNative({ code, entryPoint, outCount: a.H * a.W * a.Cout, uniforms: packProbeUniforms(a), workgroups: [Math.ceil(a.W / TILE), Math.ceil(a.H / TILE)],
            inputs: [{ binding: 2, data: F.x }, { binding: 3, data: F.layer.W }, { binding: 4, data: F.layer.b }] });
    };
    // a cell is the twin's, or the fused mirror's -- explained, not tolerated (render/brainTsl.mjs's rule)
    const judge = (r, a) => {
        const F = probeFixture(a), twin = conv2dCpu(F.x, F.H, F.W, F.layer), fma = conv2dCpuFma(F.x, F.H, F.W, F.layer);
        let unexplained = 0, fused = 0;
        for (let i = 0; i < twin.length; i++) { const v = Math.fround(r.values[i]); if (v === twin[i]) continue; if (v === fma[i]) fused++; else unexplained++; }
        return { unexplained, fused, n: twin.length };
    };
    let adapter = null;
    for (const P of PROBES) {
        // section 57: the tile kernel's manifest case is last, so the adapter is known before it
        // v4851 (section 66): round 16's shape; v4859 (section 71): it stands aside on D3D12 under FXC only
        const asideP = P.entryPoint === "k_conv_tile" ? nativeStandAside(adapter, COMPILER, 16) : null;
        if (asideP) { console.log(`  SKIP  ${P.id}: ${asideP}`); continue; }
        // each entry run through its own packer, inputs and dispatch -- the manifest is what a lab-wide runner would use
        const a = P.args, t = Date.now(), r = await H.runWgslComputeNative({ code: P.code(a), entryPoint: P.entryPoint, outCount: P.outCount(a), uniforms: P.pack(a),
            workgroups: P.workgroups(a), inputs: P.inputs(a) });
        adapter = adapter || r.adapter;
        // the head kernel writes planar: transposed back, it is judged as every other kernel is
        const planar = P.entryPoint === "k_head", n = a.H * a.W;
        const j = r.ok ? judge(planar ? { ...r, values: planarToChannelsLast(r.values, n, a.Cout) } : r, P.args) : null;
        if (j) CASES.push([P.id, P.args.H, P.args.W, P.args.Cin, P.args.Cout, j.n - j.fused, j.fused, j.unexplained]);
        ok(`!! ${P.id} (the manifest's own case, ${P.args.H} x ${P.args.W}, ${P.args.Cin} -> ${P.args.Cout}): every cell the twin's or the fused mirror's`,
            r.ok && j.unexplained === 0, r.ok ? `${j.n - j.fused} plain, ${j.fused} fused, ${j.unexplained} unexplained, ${Date.now() - t} ms` : r.reason + " " + (r.errors || []).join("; "));
        ok(`  ...and the manifest entry is the kernel's: tol ${P.tol}, cpu is probeCpu, ${P.workgroups(P.args).join(" x ")} workgroups`,
            P.tol === 0 && same(planar ? Array.from(planarToChannelsLast(P.cpu(a), n, a.Cout)) : P.cpu(a), Array.from(probeCpu(a))) && P.outCount(a) === a.H * a.W * a.Cout);
    }
    // off the manifest: odd sizes, three channel blocks, k = 1, and the identity key
    for (const a of [{ H: 19, W: 13, Cin: 19, Cout: 11, k: 3, act: "relu", seed: 31 }, { H: 9, W: 17, Cin: 6, Cout: COUT_MAX, k: 1, act: "none", seed: 2 }]) {
        const [rd, rt] = [await run(conv2dWgsl(), "k_conv", a), await run(conv2dTiledWgsl(), "k_conv_tiled", { ...a, tiled: true })];
        const jd = rd.ok ? judge(rd, a) : null, jt = rt.ok ? judge(rt, a) : null;
        ok(`  ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, k ${a.k}: direct and tiled, every cell explained, and the two kernels identical to each other`,
            rd.ok && rt.ok && jd.unexplained === 0 && jt.unexplained === 0 && same(Array.from(rd.values), Array.from(rt.values)),
            rd.ok && rt.ok ? `direct ${jd.fused} fused, tiled ${jt.fused} fused of ${jd.n}` : (rd.reason || rt.reason));
    }
    // round 13: the fast kernel at the shapes the denoiser runs it at -- 10 -> 32 and 32 -> 32 at 3 x 3, the 81-logit head
    // at 1 x 1 in three groups -- on odd sizes, against the twin and against the tiled or direct kernel on the same case
    const fast = (a) => { const F = probeFixture(a); return H.runWgslComputeNative({ code: conv2dFastWgsl(a), entryPoint: "k_conv_fast", outCount: a.H * a.W * a.Cout,
        uniforms: packFastUniforms({ H: a.H, W: a.W, layer: F.layer }), workgroups: [Math.ceil(a.W / TILE), Math.ceil(a.H / TILE), fastShape(a).groups], inputs: [{ binding: 2, data: F.x }] }); };
    for (const a of [{ H: 21, W: 19, Cin: 10, Cout: 32, k: 3, act: "relu", seed: 41 }, { H: 19, W: 13, Cin: 32, Cout: 32, k: 3, act: "relu", seed: 43 },
                     { H: 9, W: 17, Cin: 32, Cout: 81, k: 1, act: "none", seed: 47 }, { H: 11, W: 7, Cin: 19, Cout: 11, k: 3, act: "none", seed: 53 }]) {
        const tiled = a.Cout <= COUT_MAX;
        const [rf, ro] = [await fast(a), await run(tiled ? conv2dTiledWgsl() : conv2dWgsl(), tiled ? "k_conv_tiled" : "k_conv", { ...a, tiled })];
        const jf = rf.ok ? judge(rf, a) : null, jo = ro.ok ? judge(ro, a) : null;
        ok(`!! the fast kernel, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, k ${a.k} (${fastShape(a).groups} group${fastShape(a).groups > 1 ? "s" : ""}): every cell explained` +
           ` -- and where neither fused, the ${tiled ? "tiled" : "direct"} kernel's own bits`,
            rf.ok && ro.ok && jf.unexplained === 0 && (jf.fused || jo.fused || same(Array.from(rf.values), Array.from(ro.values))),
            rf.ok && ro.ok ? `fast ${jf.fused} fused, ${tiled ? "tiled" : "direct"} ${jo.fused} fused of ${jf.n}` : (rf.reason || ro.reason) + " " + (rf.errors || []).join("; "));
    }
    // round 14: the head kernel at the shapes it runs at -- the large network's 32 -> 81 head and the small one's -- on
    // odd sizes, judged channels last, against the direct kernel on the same case
    const head = (a) => { const F = probeFixture(a); return H.runWgslComputeNative({ code: conv2dHeadWgsl(a), entryPoint: "k_head", outCount: a.H * a.W * a.Cout,
        uniforms: packHeadUniforms({ H: a.H, W: a.W, layer: F.layer }), workgroups: [Math.ceil(a.H * a.W / 64), headShape(a).C4, 1], inputs: [{ binding: 2, data: F.x }] }); };
    for (const a of [{ H: 21, W: 19, Cin: 32, Cout: 81, k: 1, act: "none", seed: 61 }, { H: 13, W: 11, Cin: 16, Cout: 81, k: 1, act: "none", seed: 67 },
                     { H: 9, W: 7, Cin: 19, Cout: 6, k: 1, act: "relu", seed: 71 }]) {
        const [rh, rd] = [await head(a), await run(conv2dWgsl(), "k_conv", a)];
        const n = a.H * a.W, cl = rh.ok ? planarToChannelsLast(rh.values, n, a.Cout) : null;
        const jh = rh.ok ? judge({ ...rh, values: cl }, a) : null, jd = rd.ok ? judge(rd, a) : null;
        ok(`!! the head kernel, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout} at 1 x 1, planar out: every cell explained -- and where neither fused, the direct kernel's own bits`,
            rh.ok && rd.ok && jh.unexplained === 0 && (jh.fused || jd.fused || same(Array.from(cl), Array.from(rd.values).map(Math.fround))),
            rh.ok && rd.ok ? `head ${jh.fused} fused, direct ${jd.fused} fused of ${jh.n}` : (rh.reason || rd.reason) + " " + (rh.errors || []).join("; "));
    }
    const aside16 = nativeStandAside(adapter, COMPILER, 16), aside17 = nativeStandAside(adapter, COMPILER, 17);
    if (aside16) console.log(`  SKIP  the pixel-tiled kernel's device cases, edge zero's and its identity key: ${aside16}`);
    else {
    // round 16: the pixel-tiled kernel at both configurations and a third -- the denoiser's 10 -> 32 and 32 -> 32 at 3 x 3 on
    // odd sizes, a wide image of 13 -> 11 (several strips, the last partial), a 1 x 1 head in z groups, a 5 x 3 image
    // narrower than one strip -- against the twin, and against the fast kernel's bits on the same case where neither fused
    const tile = (a, cfg) => { const F = probeFixture(a); return H.runWgslComputeNative({ code: conv2dTileWgsl(a, cfg), entryPoint: "k_conv_tile", outCount: a.H * a.W * a.Cout,
        uniforms: packTileUniforms({ H: a.H, W: a.W, layer: F.layer }, cfg), workgroups: tileWorkgroups(a.H, a.W, a, cfg), inputs: [{ binding: 2, data: F.x }] }); };
    for (const [a, cfgs] of [[{ H: 21, W: 19, Cin: 10, Cout: 32, k: 3, act: "relu", seed: 41 }, [{ px: 2, g4: 8 }, { px: 4, g4: 4 }]],
                             [{ H: 19, W: 13, Cin: 32, Cout: 32, k: 3, act: "relu", seed: 43 }, [{ px: 2, g4: 8 }, { px: 4, g4: 4 }]],
                             [{ H: 11, W: 37, Cin: 13, Cout: 11, k: 3, act: "none", seed: 53 }, [{ px: 4, g4: 4 }, { px: 2, g4: 2 }]],
                             [{ H: 9, W: 17, Cin: 32, Cout: 81, k: 1, act: "none", seed: 47 }, [{ px: 2, g4: 8 }, { px: 4, g4: 4 }]],
                             [{ H: 5, W: 3, Cin: 19, Cout: 6, k: 3, act: "relu", seed: 3 }, [{ px: 4, g4: 4 }]]]) {
        const rf = await fast(a), jf = rf.ok ? judge(rf, a) : null;
        for (const cfg of cfgs) {
            const rt = await tile(a, cfg), jt = rt.ok ? judge(rt, a) : null, S = tileShape(a, cfg);
            ok(`!! the pixel-tiled kernel, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, k ${a.k}, ${cfg.px} px x ${S.g4} vec4s a thread (${S.groups} z group${S.groups > 1 ? "s" : ""}): every cell explained -- and where neither fused, the fast kernel's own bits`,
                rt.ok && rf.ok && jt.unexplained === 0 && (jt.fused || jf.fused || same(Array.from(rt.values), Array.from(rf.values))),
                rt.ok && rf.ok ? `tile ${jt.fused} fused, fast ${jf.fused} fused of ${jt.n}` : (rt.reason || rf.reason) + " " + (rt.errors || []).join("; "));
        }
    }
    // section 56: edge "zero" -- every tap of an in-image row added, the tile's zero outside the image -- on the same odd
    // sizes, against the twin, and against edge "skip"'s bits where neither fused: adding a zero product is the skip but
    // for the sign of a zero, which no `===` sees
    for (const [a, cfg] of [[{ H: 21, W: 19, Cin: 10, Cout: 32, k: 3, act: "relu", seed: 41 }, { px: 2, g4: 8 }], [{ H: 19, W: 13, Cin: 32, Cout: 32, k: 3, act: "relu", seed: 43 }, { px: 4, g4: 4 }],
                            [{ H: 11, W: 37, Cin: 13, Cout: 11, k: 3, act: "none", seed: 53 }, { px: 2, g4: 2 }], [{ H: 5, W: 3, Cin: 19, Cout: 6, k: 3, act: "relu", seed: 3 }, { px: 4, g4: 4 }]]) {
        const [rz, rs] = [await tile(a, { ...cfg, edge: "zero" }), await tile(a, cfg)], jz = rz.ok ? judge(rz, a) : null, js = rs.ok ? judge(rs, a) : null;
        ok(`!! edge zero, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, ${cfg.px} px x ${tileShape(a, cfg).g4} vec4s: every cell explained -- and where neither fused, edge skip's own bits`,
            rz.ok && rs.ok && jz.unexplained === 0 && (jz.fused || js.fused || Array.from(rz.values).every((v, i) => v === rs.values[i])),
            rz.ok && rs.ok ? `zero ${jz.fused} fused, skip ${js.fused} fused of ${jz.n}` : (rz.reason || rs.reason) + " " + (rz.errors || []).join("; "));
    }
    {
        const K = keyCpu({ H: 9, W: 21, C: 5 }), out = [];
        for (const cfg of [{ px: 2, g4: 8 }, { px: 4, g4: 4 }, { px: 2, g4: 8, edge: "zero" }, { px: 4, g4: 4, edge: "zero" }]) {
            const kt = await H.runWgslComputeNative({ code: conv2dTileWgsl(K.layer, cfg), entryPoint: "k_conv_tile", outCount: K.x.length, uniforms: packTileUniforms({ H: K.H, W: K.W, layer: K.layer }, cfg),
                workgroups: tileWorkgroups(K.H, K.W, K.layer, cfg), inputs: [{ binding: 2, data: K.x }] });
            out.push(kt.ok && K.x.every((v, i) => Math.fround(kt.values[i]) === v));
        }
        ok("  the identity key on the device, 9 x 21: the pixel-tiled kernel returns its input bit for bit at 2 and at 4 pixels a thread, edge skip and edge zero", out.every(Boolean), out.join(", "));
    }
    }
    // round 17 (section 59): the fast kernel's other ways, against the twin and the fast kernel's own bits on the same case --
    // a partial last block (10 -> 32), two whole blocks and a last of three (19 -> 11), a head in three groups (its weights'
    // offsets then run-time), and 32 -> 32 written out with vec4 reads; then the tile kernel's inline weights
    // v4851 (section 66): on D3D12 these run when the run's compiler is DXC, and stand aside under FXC, naming it
    if (aside17) console.log(`  SKIP  round 17's device cases: ${aside17}`);
    else {
        const alt = (a, o) => { const F = probeFixture(a); return H.runWgslComputeNative({ code: conv2dFastAltWgsl(a, o), entryPoint: "k_conv_fast_alt", outCount: a.H * a.W * a.Cout,
            uniforms: packFastAltUniforms({ H: a.H, W: a.W, layer: F.layer }, o), workgroups: [Math.ceil(a.W / TILE), Math.ceil(a.H / TILE), fastAltShape(a, o).groups], inputs: [{ binding: 2, data: F.x }] }); };
        for (const [a, opts] of [[{ H: 21, W: 19, Cin: 10, Cout: 32, k: 3, act: "relu", seed: 41 }, [{ reads: "f32" }, { reads: "vec4" }, { unroll: true }, { reads: "vec4", unroll: true }]],
                                 [{ H: 11, W: 7, Cin: 19, Cout: 11, k: 3, act: "none", seed: 53 }, [{ reads: "vec4" }, { unroll: true }, { reads: "vec4", unroll: true }]],
                                 [{ H: 9, W: 17, Cin: 32, Cout: 81, k: 1, act: "none", seed: 47 }, [{ reads: "vec4" }, { reads: "vec4", unroll: true }]],
                                 [{ H: 19, W: 13, Cin: 32, Cout: 32, k: 3, act: "relu", seed: 43 }, [{ reads: "vec4", unroll: true }]]]) {
            const rf = await fast(a), jf = rf.ok ? judge(rf, a) : null;
            for (const o of opts) {
                const r = await alt(a, o), j = r.ok ? judge(r, a) : null;
                ok(`!! round 17: the fast kernel ${o.reads === "vec4" ? "reading vec4s" : "reading f32s"}${o.unroll ? ", written out" : ""}, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, k ${a.k}: every cell explained -- and where neither fused, the fast kernel's own bits`,
                    r.ok && rf.ok && j.unexplained === 0 && (j.fused || jf.fused || same(Array.from(r.values), Array.from(rf.values))),
                    r.ok && rf.ok ? `${j.fused} fused, fast ${jf.fused} fused of ${j.n}` : (r.reason || rf.reason) + " " + (r.errors || []).join("; "));
            }
        }
        const tile = (a, cfg) => { const F = probeFixture(a); return H.runWgslComputeNative({ code: conv2dTileWgsl(a, cfg), entryPoint: "k_conv_tile", outCount: a.H * a.W * a.Cout,
            uniforms: packTileUniforms({ H: a.H, W: a.W, layer: F.layer }, cfg), workgroups: tileWorkgroups(a.H, a.W, a, cfg), inputs: [{ binding: 2, data: F.x }] }); };
        for (const [a, cfg] of [[{ H: 21, W: 19, Cin: 10, Cout: 32, k: 3, act: "relu", seed: 41 }, { px: 2, g4: 8, edge: "zero" }], [{ H: 11, W: 37, Cin: 13, Cout: 11, k: 3, act: "none", seed: 53 }, { px: 1, g4: 8, edge: "skip" }]]) {
            // v4851 (section 66): the comparator is the hoisted tile -- round 16's shape -- except where round 16 stands aside and this
            // runs: there the fast kernel's bits (r17Comparator, held in 5e). Since v4859 (section 71) no adapter and compiler gives that
            // pair -- both rounds run on D3D12 under DXC and both stand aside under FXC -- and the fallback is kept for a future split.
            const hoist = r17Comparator(adapter, COMPILER) === "hoist";
            const [ri, rh] = [await tile(a, { ...cfg, weights: "inline" }), hoist ? await tile(a, cfg) : await fast(a)], ji = ri.ok ? judge(ri, a) : null, jh = rh.ok ? judge(rh, a) : null;
            ok(`!! round 17: the tile kernel's inline weights, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, ${cfg.px} px, edge ${cfg.edge}: every cell explained -- and where neither fused, ` +
               (hoist ? "its hoisted weights' bits" : "the fast kernel's own bits (round 16's hoisted tile stands aside here, section 66)"),
                ri.ok && rh.ok && ji.unexplained === 0 && (ji.fused || jh.fused || same(Array.from(ri.values), Array.from(rh.values))),
                ri.ok && rh.ok ? `inline ${ji.fused} fused, ${hoist ? "hoist" : "fast"} ${jh.fused} fused of ${ji.n}` : (ri.reason || rh.reason) + " " + (ri.errors || []).join("; "));
        }
        const K = keyCpu({ H: 9, W: 21, C: 5 }), out = [];
        for (const o of [{ reads: "vec4" }, { unroll: true }, { reads: "vec4", unroll: true }]) {
            const kt = await H.runWgslComputeNative({ code: conv2dFastAltWgsl(K.layer, o), entryPoint: "k_conv_fast_alt", outCount: K.x.length, uniforms: packFastAltUniforms({ H: K.H, W: K.W, layer: K.layer }, o),
                workgroups: [Math.ceil(K.W / TILE), Math.ceil(K.H / TILE), 1], inputs: [{ binding: 2, data: K.x }] });
            out.push(kt.ok && K.x.every((v, i) => Math.fround(kt.values[i]) === v));
        }
        ok("  the identity key on the device, 9 x 21, five channels (one partial block): the fast kernel's other ways return their input bit for bit", out.every(Boolean), out.join(", "));
    }
    {
        const K1 = keyCpu({ k: 1, C: 5 }), n = K1.H * K1.W, ka1 = { H: K1.H, W: K1.W, Cin: K1.layer.Cin, Cout: K1.layer.Cout, k: 1, act: "none" };
        const kh = await H.runWgslComputeNative({ code: conv2dHeadWgsl(ka1), entryPoint: "k_head", outCount: K1.x.length, uniforms: packHeadUniforms({ H: K1.H, W: K1.W, layer: K1.layer }),
            workgroups: [Math.ceil(n / 64), headShape(ka1).C4, 1], inputs: [{ binding: 2, data: K1.x }] });
        const back = kh.ok ? planarToChannelsLast(kh.values, n, 5) : null;
        ok("  the 1 x 1 identity key through the head kernel: its input back, bit for bit, once read channels last", kh.ok && K1.x.every((v, i) => back[i] === v));
    }
    const K = keyCpu(), ka = { H: K.H, W: K.W, Cin: K.layer.Cin, Cout: K.layer.Cout, k: K.layer.k, act: "none" };
    {
        const kf = await H.runWgslComputeNative({ code: conv2dFastWgsl(ka), entryPoint: "k_conv_fast", outCount: K.x.length, uniforms: packFastUniforms({ H: K.H, W: K.W, layer: K.layer }),
            workgroups: [1, 1, 1], inputs: [{ binding: 2, data: K.x }] });
        ok("  the identity key on the device: the fast kernel returns its input bit for bit", kf.ok && K.x.every((v, i) => Math.fround(kf.values[i]) === v));
    }
    const kr = await H.runWgslComputeNative({ code: conv2dTiledWgsl(), entryPoint: "k_conv_tiled", outCount: K.x.length, uniforms: packProbeUniforms(ka),
        workgroups: [1, 1], inputs: [{ binding: 2, data: K.x }, { binding: 3, data: K.layer.W }, { binding: 4, data: K.layer.b }] });
    ok("  the identity key on the device: the tiled kernel returns its input bit for bit", kr.ok && K.x.every((v, i) => Math.fround(kr.values[i]) === v));
    let refused = null; try { packProbeUniforms({ H: 4, W: 4, Cin: 4, Cout: COUT_MAX + 1, k: 3, tiled: true }); } catch (e) { refused = e.message; }
    let refusedK = null; try { packProbeUniforms({ H: 4, W: 4, Cin: 4, Cout: 4, k: K_MAX + 2, tiled: true }); } catch (e) { refusedK = e.message; }
    ok(`  the tiled kernel's limits are refused by name, not overrun: Cout > ${COUT_MAX}, k > ${K_MAX}`, /Cout/.test(refused || "") && /k <=/.test(refusedK || ""));
    console.log(`  ....  adapter: ${adapter ? [adapter.vendor, adapter.architecture, adapter.description].filter(Boolean).join(" / ") : "?"}; compiler, from the package: ${COMPILER || `none on ${process.platform}`} (node-webgpu ${(WPKG && WPKG.version) || "version unread"})`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: SPEED. No kernel is timed by this gate, because the only device here is SwiftShader, whose costs " +
    "are a JIT's and not a GPU's; render/denoiseTiming-selfcheck.mjs times the denoiser's kernel sets " +
    "side by side, and a GPU's figures come from the rig (section 39's K1). Nor is there a device BACKWARD pass yet: training starts on the CPU, against " +
    "conv2dBackward, and moves to the device when a measurement says the CPU is the wall.");
if (CASES.length) REPORT.table("the manifest's kernels on the device: each cell the f32 twin's (plain), the fused mirror's, or unexplained",
    ["kernel", "H", "W", "Cin", "Cout", "plain", "fused", "unexplained"], CASES);
else REPORT.skip("the device cases", "no WebGPU device here");
REPORT.write();
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
