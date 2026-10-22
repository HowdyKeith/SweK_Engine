// WebGLEngine/brain/conv2d-selfcheck.mjs -- the denoiser arc, round 1
//
// Run: node brain/conv2d-selfcheck.mjs
//
// GATES brain/conv2d.mjs -- the convolution layer the path-tracer denoiser is built from. Its exports, each named
// here: TILE, K_MAX, CB, COUT_MAX, conv2dForward, conv2dCpu, conv2dCpuFma, conv2dBackward, conv2dWgsl,
// conv2dTiledWgsl, packProbeUniforms, probeFixture, probeCpu, keyCpu, PROBES -- round 13's (section 39): FAST_GROUP,
// UNIFORM_MAX, fastShape, conv2dFastWgsl, packFastUniforms -- round 14's (section 43): headShape, conv2dHeadWgsl,
// packHeadUniforms, planarToChannelsLast -- round 16's (section 54): tileShape, conv2dTileWgsl, packTileUniforms,
// tileWorkgroups -- round 17's (section 59): fastAltShape, conv2dFastAltWgsl, packFastAltUniforms -- and round 27's (section 83,
// v4868): WINO_CB, WINO_G4S, winoShape, winoFilter, conv2dCpuWino, conv2dCpuWinoFma, conv2dWinoWgsl, packWinoUniforms, winoWorkgroups.
// Round 19 (section 66, v4851): which rounds' device rows stand aside, by adapter and by the run's compiler (nativeStandAside).
// Round 22 (section 71, v4859): round 16's rows run on D3D12 under DXC too, so only FXC (or an unread compiler) stands aside there.
// Round 40 (section 108): SUB_WG, subShape, subSpan, subWorkgroups, packSubUniforms, conv2dSubWgsl -- the subgroup kernel, cell for
// cell against conv2dCpu natively where the adapter has subgroups (standing aside on D3D12 under FXC), and its CPU shape and text.
// Sabotaged with render/denoiseDevice-selfcheck.mjs, by the byte-safe runner, each restored byte-identical (sha256); the reds in
// both gates together:
//   G1  the shuffle reading lane + kx, not lane + kx - 1                9 RED (five device cases here; K0s natively and in the
//                                                                          browser, the small network, r15's bits there)
//   G2  a halo lane writing its column                                 9 RED (the same nine)
//   G3  the span taken as S, not S - 2                                 10 RED (the same nine and the identity key here)
//   G4  a row outside the image read from the edge row, not skipped    9 RED (the same nine)
//   G5  the channels before the taps within a row (cj before kx)       8 RED (the five here; K0s natively and in the browser, the
//                                                                          small network -- r15's bits row holds only where nothing fused)
// Round 41 (section 109): FAST_ARITH, f16round, f16bits, conv2dCpuF16, conv2dCpuF16Fma -- the half-precision template (f32: r18u's text,
// frozen by sha256; f16; f16emu, the test instrument) and its twin. The f16 device rows SKIP here (no shader-f16) and run on the Intel.
// Sabotaged with render/denoiseDevice-selfcheck.mjs, by the byte-safe runner, each restored byte-identical (sha256):
//   H1  the packing's halves swapped (zw for xy)                       4 RED (every emulation case)
//   H2  a weight's word index one on (c + 1 over 2)                    3 RED (the three one-group cases; the three-group 1 x 1 reads
//                                                                          through the z-group index, which H2 leaves alone)
//   H3  the packed weights not f16-rounded first                       1 RED (the packing row). f16bits rounds the mantissa itself, so the
//                                                                          emulation saw nearly the same words: the packing row is the catch
//   H4  r18u's f32 text changed (0.00 for 0.0)                         1 RED (the sha256 row -- added because no cell moves)
//   H5  conv2dCpuF16 rounding to f32                                   2 RED (the twin row; r41h's image row in the device gate)
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
//   section 83 (v4868), against the Winograd kernel, its twin and its buffers (full gate each time, restored, md5 verified):
//   W1  the twin's B^T row 2 as d1 - d2, its sign flipped                       11 RED -- the order row, the not-canonical row, the CPU
//       integer key and all eight device cases; the transform row stays green, as it should: it is written from the matrices
//   W2  the kernel's weights read without the group offset                       9 RED -- every device case (each has z groups) and the
//       device integer key
//   W3  the kernel's window origin one pixel right (its -1 dropped)              9 RED -- the same nine
//   W4  the kernel's second barrier removed                                       8 RED -- every device case but the 3 x 5 image, whose
//       few live threads read their block before the next load reaches it; deterministic on SwiftShader, as S5, F4 and P3 were
//   W5  the twin sums M from the last input channel down                          9 RED -- the order row and all eight device cases
//   W6  the kernel's guard on channels past Cout removed                          4 RED -- the 13 -> 11 cases, the 6 -> 7 case and the
//       device integer key (Cout 5): exactly the cases whose Cout is not a multiple of four
//   W7  packWinoUniforms' bias one float late                                    10 RED -- the layout row, all eight device cases, the
//       device integer key
//   W8  winoShape holding any odd k                                               1 RED -- the shape row
//   W9  winoFilter filing position (i, j) at (j, i) -- in the kernel AND the twin  5 RED -- the order row, the not-canonical row, both
//       integer keys and the layout row. *** NOT ONE DEVICE CELL ROW: *** the kernel and its twin read the same wrong weights and agree
//       cell for cell. A mistake the twin shares is invisible to every row that compares the device with the twin, which is why the
//       order is held by rows written from the matrices and the integer key against conv2dForward, not by the twin alone
//   W10 nativeStandAside without round 27's DXC exemption                         1 RED -- the round-27 stand-aside row (5e)
//   and a check, not a sabotage: r17Comparator forced to "fast" on SwiftShader -- round 17's two inline rows ran against the fast
//   kernel's bits and were green (0 fused of 12,768 and 4,477), so the D3D12-under-DXC path is exercised on a device here
//
// *** S5 WAS EXPECTED TO GO ZERO RED AND DID NOT. *** A missing barrier is a race, and races hide on a device that
// runs a workgroup's threads one after another. SwiftShader does run them in order -- which is exactly why it is
// caught: the first thread of the next block's load overwrites the tile before the later threads of this block
// have read it, every time. On a real GPU the same defect would be intermittent; here it is deterministic.
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const C = await imp("brain/conv2d.mjs");
const { TILE, K_MAX, CB, COUT_MAX, conv2dForward, conv2dCpu, conv2dCpuFma, conv2dBackward, conv2dWgsl, conv2dTiledWgsl,
        packProbeUniforms, probeFixture, probeCpu, keyCpu, PROBES, FAST_GROUP, UNIFORM_MAX, fastShape, conv2dFastWgsl, packFastUniforms,
        headShape, conv2dHeadWgsl, packHeadUniforms, planarToChannelsLast, tileShape, conv2dTileWgsl, packTileUniforms, tileWorkgroups,
        fastAltShape, conv2dFastAltWgsl, packFastAltUniforms, WINO_CB, WINO_G4S, winoShape, winoFilter, conv2dCpuWino, conv2dCpuWinoFma, conv2dWinoWgsl,
        packWinoUniforms, winoWorkgroups, SUB_WG, subShape, subSpan, subWorkgroups, packSubUniforms, conv2dSubWgsl,
        FAST_ARITH, f16round, f16bits, conv2dCpuF16, conv2dCpuF16Fma } = C;
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
    // v4868 -- round 27 (section 83): the Winograd kernel runs under DXC, which built every shape the rig was handed (sections 65, 71),
    // and stands aside under FXC, where nobody has built it -- an FXC that never finishes a pipeline stops this gate (section 56)
    if ((round === 16 || round === 17 || round === 27 || round === 40 || round === 41) && compiler === "DXC") return null;
    const said = compiler === "DXC" || compiler === "FXC" ? compiler : `an unread compiler (${JSON.stringify(compiler ?? null)}), counted as FXC`;
    if (round === 17) return `${FXC_SKIP_R17}; this run compiles with ${said}, and under DXC (node-webgpu 0.6.2) they run (section 66)`;
    if (round === 16) return `${FXC_SKIP}; this run compiles with ${said}, and under DXC (node-webgpu 0.6.2) they run (section 71)`;
    // round 41 (section 109): FXC has no 16-bit types
    if (round === 41) return `round 41's half-precision kernel needs 16-bit types, shader model 6.2, which FXC cannot compile; this run compiles with ${said}, and under DXC it runs (section 109)`;
    // round 40 (section 108): the subgroup kernel's wave operations are shader model 6, which FXC does not compile
    if (round === 40) return `round 40's subgroup kernel uses wave operations, shader model 6, which FXC cannot compile; this run compiles with ${said}, and under DXC it runs (section 108)`;
    if (round === 27) return `round 27's Winograd kernel has never been built under FXC, and stands aside there on the safe side; this run compiles with ${said}, and under DXC it runs (section 83)`;
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
    // v4868 -- round 27 (section 83): the Winograd kernel's device rows as round 17's are: run under DXC, stand aside under anything else on D3D12
    ok("!! round 27 (section 83): on a D3D12 adapter the Winograd kernel's device rows run under DXC and stand aside under FXC, an unread compiler or none, the SKIP line naming the compiler and section 83; off D3D12 they run under any compiler",
        RIG.every((a) => runs(a, "DXC", 27) && NOT_DXC.every((c) => { const why = nativeStandAside(a, c, 27) || "";
            return why.includes("section 83") && (c === "FXC" ? /this run compiles with FXC,/.test(why) : why.includes(`an unread compiler (${JSON.stringify(c ?? null)}), counted as FXC`)); })) &&
            OFF.every((a) => [...NOT_DXC, "DXC"].every((c) => runs(a, c, 27))),
        `the 1080: under DXC ${runs(gtx, "DXC", 27) ? "runs" : "aside"}, under FXC ${runs(gtx, "FXC", 27) ? "runs" : "aside"}; SwiftShader under FXC ${runs(OFF[0], "FXC", 27) ? "runs" : "aside"}`);
    // round 40 (section 108): the subgroup kernel's device rows as round 27's are -- under DXC on D3D12, anywhere else whatever the compiler
    ok("!! round 40 (section 108): on a D3D12 adapter the subgroup kernel's device rows run under DXC and stand aside under FXC, an unread compiler or none, the SKIP line naming the compiler and section 108; off D3D12 they run under any compiler",
        RIG.every((a) => runs(a, "DXC", 40) && NOT_DXC.every((c) => { const why = nativeStandAside(a, c, 40) || "";
            return why.includes("section 108") && /shader model 6/.test(why) && (c === "FXC" ? /this run compiles with FXC,/.test(why) : why.includes(`an unread compiler (${JSON.stringify(c ?? null)}), counted as FXC`)); })) &&
            OFF.every((a) => [...NOT_DXC, "DXC"].every((c) => runs(a, c, 40))),
        `the 1080: under DXC ${runs(gtx, "DXC", 40) ? "runs" : "aside"}, under FXC ${runs(gtx, "FXC", 40) ? "runs" : "aside"}; SwiftShader under FXC ${runs(OFF[0], "FXC", 40) ? "runs" : "aside"}`);
    // round 41 (section 109): the half-precision kernel's device rows the same way
    ok("!! round 41 (section 109): on a D3D12 adapter the half-precision kernel's device rows run under DXC and stand aside under FXC, an unread compiler or none, naming 16-bit types and section 109; off D3D12 they run under any compiler",
        RIG.every((a) => runs(a, "DXC", 41) && NOT_DXC.every((c) => { const why = nativeStandAside(a, c, 41) || ""; return why.includes("section 109") && /16-bit types/.test(why); })) &&
            OFF.every((a) => [...NOT_DXC, "DXC"].every((c) => runs(a, c, 41))),
        `the Intel: under DXC ${runs(intel, "DXC", 41) ? "runs" : "aside"}, under FXC ${runs(intel, "FXC", 41) ? "runs" : "aside"}`);
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

console.log("\n5f. THE WINOGRAD KERNEL'S TRANSFORM, ITS TWIN'S ORDER AND ITS BUFFERS, ON THE CPU (round 27, section 83)");
// Written here from the three matrices, not from brain/conv2d.mjs's loops: B^T, G and A^T as arrays, a dense f64 product, and an
// f32 product that adds each row's nonzero terms left to right with a rounding after every add -- the order the module's header
// states. Every row of B^T and A^T has its first nonzero at +1 or -1 and the rest +-1, so that rule IS the stated order.
const WB = [[1, 0, -1, 0], [0, 1, 1, 0], [0, -1, 1, 0], [0, 1, 0, -1]], WG = [[1, 0, 0], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5], [0, 0, 1]], WA = [[1, 1, 1, 0], [0, 1, -1, -1]];
const mm = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, a, k) => s + a * B[k][j], 0)));
const tp = (A) => A[0].map((_, j) => A.map((r) => r[j]));
const rowF = (row, v) => { let acc = null; row.forEach((c, k) => { if (!c) return; const t = c > 0 ? v[k] : -v[k]; acc = acc === null ? t : Math.fround(acc + t); }); return acc; };
const leftF = (Mx, X) => tp(tp(X).map((col) => Mx.map((r) => rowF(r, col))));        // Mx X, a column of X at a time
const rightF = (X, Mx) => X.map((row) => Mx.map((r) => rowF(r, row)));                 // X Mx^T, a row of X at a time
// round 27's exact key: 9 x 7, 6 -> 5, integers in [-4, 4], integer weights in [-2, 2] and biases in [-3, 3]
function winoIntKey() {
    const I = { H: 9, W: 7, Cin: 6, Cout: 5, k: 3, act: "none" }, xi = new Float32Array(I.H * I.W * I.Cin), Wi = new Float32Array(I.Cout * 9 * I.Cin), bi = new Float32Array(I.Cout);
    let s = 17; const ri = (m) => { s = (s * 1103515245 + 12345) >>> 0; return (s % (2 * m + 1)) - m; };
    for (let i = 0; i < xi.length; i++) xi[i] = ri(4);
    for (let i = 0; i < Wi.length; i++) Wi[i] = ri(2);
    for (let i = 0; i < bi.length; i++) bi[i] = ri(3);
    return { I, xi, LI: { ...I, W: Wi, b: bi } };
}
// one layer, Winograd by the matrices: `f32` false is exact f64 (the transform's own arithmetic); true is the twin's order
function winoByMatrices(x, H, W, L, f32) {
    const { Cin, Cout } = L, y = new Float64Array(H * W * Cout), f = f32 ? Math.fround : (v) => v;
    const g = (co, ci) => [0, 1, 2].map((ky) => [0, 1, 2].map((kx) => Math.fround(L.W[((co * 3 + ky) * 3 + kx) * Cin + ci])));
    const U = []; for (let co = 0; co < Cout; co++) { U.push([]); for (let ci = 0; ci < Cin; ci++) U[co].push(mm(mm(WG, g(co, ci)), tp(WG)).map((r) => r.map(Math.fround))); }
    const U64 = []; for (let co = 0; co < Cout; co++) { U64.push([]); for (let ci = 0; ci < Cin; ci++) U64[co].push(mm(mm(WG, g(co, ci)), tp(WG))); }
    for (let py = 0; py < H; py += 2) for (let px = 0; px < W; px += 2) {
        const Vs = [];
        for (let ci = 0; ci < Cin; ci++) {
            const d = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => { const yy = py - 1 + i, xx = px - 1 + j; return yy < 0 || yy >= H || xx < 0 || xx >= W ? 0 : Math.fround(x[(yy * W + xx) * Cin + ci]); }));
            Vs.push(f32 ? rightF(leftF(WB, d), WB) : mm(mm(WB, d), tp(WB)));
        }
        for (let co = 0; co < Cout; co++) {
            const M = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
            for (let ci = 0; ci < Cin; ci++) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) M[i][j] = f(M[i][j] + f((f32 ? U : U64)[co][ci][i][j] * Vs[ci][i][j]));
            const Y = f32 ? rightF(leftF(WA, M), WA) : mm(mm(WA, M), tp(WA));
            for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
                if (py + a >= H || px + b >= W) continue;
                const v = f(Y[a][b] + f(L.b[co]));
                y[((py + a) * W + px + b) * Cout + co] = String(L.act ?? "none") === "relu" ? Math.max(v, 0) : v;
            }
        }
    }
    return y;
}
{
    const cases = [{ H: 7, W: 5, Cin: 4, Cout: 3, k: 3, act: "none", seed: 3 }, { H: 9, W: 11, Cin: 10, Cout: 13, k: 3, act: "relu", seed: 41 }, { H: 6, W: 8, Cin: 13, Cout: 4, k: 3, act: "none", seed: 9 }];
    let worst64 = 0, orderDiff = 0, cells = 0, worstTw = 0, worstDir = 0, notDirect = 0;
    for (const a of cases) {
        const F = probeFixture(a), ref = conv2dForward(F.x, F.H, F.W, F.layer), mx = Math.max(...Array.from(ref, Math.abs));
        const w64 = winoByMatrices(F.x, F.H, F.W, F.layer, false), w32 = winoByMatrices(F.x, F.H, F.W, F.layer, true), tw = conv2dCpuWino(F.x, F.H, F.W, F.layer), dt = conv2dCpu(F.x, F.H, F.W, F.layer);
        for (let i = 0; i < ref.length; i++) {
            worst64 = Math.max(worst64, Math.abs(w64[i] - ref[i]) / mx); cells++;
            if (w32[i] !== tw[i]) orderDiff++;
            worstTw = Math.max(worstTw, Math.abs(tw[i] - ref[i]) / mx); worstDir = Math.max(worstDir, Math.abs(dt[i] - ref[i]) / mx);
            if (tw[i] !== dt[i]) notDirect++;
        }
    }
    ok("!! round 27: the transform IS the convolution -- Winograd F(2 x 2, 3 x 3) written here from B^T, G and A^T in f64 equals conv2dForward on every cell, borders, partial tiles and partial vec4s included",
        worst64 < 1e-12, `worst ${worst64.toExponential(2)} of the output's largest, over ${cells} cells of three layers (odd sizes, 4 to 13 input channels)`);
    ok("!! *** round 27: conv2dCpuWino IS the order its header states -- the matrices' rows added left to right, an f32 rounding after every add, M from zero over ci ascending, then the bias -- cell for cell ***",
        orderDiff === 0, `${orderDiff} of ${cells} cells differ from the order written here from the matrices`);
    ok("  ...and it is NOT the canonical order: it gives other bits than conv2dCpu, as close to the f64 layer -- a twin of its own, which is why a Winograd cell is never judged against conv2dCpu",
        notDirect > cells / 4 && worstTw < 1e-6 && worstTw > 0, `${notDirect} of ${cells} cells differ from conv2dCpu; worst against conv2dForward: Winograd ${worstTw.toExponential(2)}, direct ${worstDir.toExponential(2)}, of the output's largest`);
    const F = probeFixture({ H: 5, W: 6, Cin: 7, Cout: 11, k: 3, act: "relu", seed: 23 }), tw = conv2dCpuWino(F.x, F.H, F.W, F.layer), fm = conv2dCpuWinoFma(F.x, F.H, F.W, F.layer);
    ok("  its fused mirror differs from it on some cells, as the direct kernels' does -- M + V U is the kernel's one multiply-add, the transforms' coefficients all +-1",
        diffCount(tw, fm) > 0, `${diffCount(tw, fm)} of ${tw.length} cells`);
    // an exact key of its own: Winograd cannot pass the identity key bit for bit (V's sums round), but with small integers in and
    // integer weights, every value it makes is a multiple of a quarter far below 2^24 -- so every order gives the same bits
    const { I, xi, LI } = winoIntKey(), refI = conv2dForward(xi, I.H, I.W, LI);
    ok("!! round 27's exact key: integers in, integer weights and biases -- every transform, product and sum exact in f32 -- and the twin and its mirror are conv2dForward bit for bit",
        [conv2dCpuWino(xi, I.H, I.W, LI), conv2dCpuWinoFma(xi, I.H, I.W, LI)].every((o) => o.every((v, i) => v === refI[i])) && refI.some((v) => Math.abs(v) > 20));
    // the transformed weights: every one G g G^T of its channel pair, in f64 from the f32 weights, rounded once, where the header says
    const L = probeFixture({ H: 2, W: 2, Cin: 7, Cout: 11, k: 3, act: "none", seed: 29 }).layer, S = winoShape(L), U = winoFilter(L, S.C4);
    let misplaced = 0, placed = 0, pad = 0;
    for (let co = 0; co < 11; co++) for (let ci = 0; ci < 7; ci++) {
        const g = [0, 1, 2].map((ky) => [0, 1, 2].map((kx) => Math.fround(L.W[((co * 3 + ky) * 3 + kx) * 7 + ci]))), u = mm(mm(WG, g), tp(WG));
        for (let e = 0; e < 16; e++) { placed++; if (U[(e * 7 + ci) * S.C4 * 4 + co] !== Math.fround(u[e >> 2][e & 3])) misplaced++; }
    }
    for (let e = 0; e < 16; e++) for (let ci = 0; ci < 7; ci++) for (let co = 11; co < 4 * S.C4; co++) if (U[(e * 7 + ci) * S.C4 * 4 + co] !== 0) pad++;
    const pk = packWinoUniforms({ H: 5, W: 6, layer: L }), pu = new Uint32Array(pk.uniforms.buffer);
    let bias = 0; for (let co = 0; co < 11; co++) if (pk.uniforms[4 + co] !== L.b[co]) bias++;
    ok("!! round 27: winoFilter puts G g G^T of (co, ci) at position e = 4 i + j where the header says -- e, then ci, then co as vec4s, the padding past Cout zero -- and packWinoUniforms holds H, W and the bias, its weights winoFilter's",
        misplaced === 0 && pad === 0 && U.length === 16 * 7 * S.C4 * 4 && pu[0] === 5 && pu[1] === 6 && bias === 0 && pk.uniforms.length * 4 === S.bytes && same(Array.from(pk.weights), Array.from(U)) &&
            Array.from(pk.uniforms.slice(4 + 11)).every((v) => v === 0),
        `${misplaced} misplaced of ${placed}, ${pad} nonzero padding, ${bias} bias misplaced; ${S.bytes} uniform bytes, ${S.weightBytes} weight bytes`);
    const sh = (Ld, cfg) => winoShape(Ld, cfg), L10 = { Cin: 10, Cout: 32, k: 3 }, L32 = { Cin: 32, Cout: 32, k: 3 };
    const refuse = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
    ok(`  winoShape: the denoiser's 10 -> 32 and 32 -> 32 fit at ${WINO_G4S.join(", ")} vec4s a thread -- 64 KiB of weights at 32 -> 32, one vec4 -- in ${sh(L32).wgBytes} B of window; a 1 x 1 or 5 x 5 layer, or 3 vec4s, does not, and the kernel and its twin refuse them by name`,
        WINO_G4S.every((g4) => sh(L10, { g4 }).fits && sh(L32, { g4 }).fits) && sh(L32).weightBytes === 65536 && sh(L32).groups === 8 && sh(L32, { g4: 2 }).groups === 4 && sh(L32).wgBytes === 18 * 18 * WINO_CB * 4 &&
            !sh({ Cin: 32, Cout: 81, k: 1 }).fits && !sh({ Cin: 4, Cout: 4, k: 5 }).fits && !sh(L32, { g4: 3 }).fits &&
            /Winograd kernel holds a 3 x 3 layer/.test(refuse(() => conv2dWinoWgsl({ Cin: 32, Cout: 81, k: 1 })) || "") &&
            /3 x 3 layer, got k 1/.test(refuse(() => conv2dCpuWino(new Float32Array(4), 2, 2, { Cin: 1, Cout: 1, k: 1, W: [1], b: [0] })) || "") &&
            /cannot hold/.test(refuse(() => packWinoUniforms({ H: 2, W: 2, layer: { ...L, k: 1 } })) || ""),
        `32 -> 32: ${sh(L32).groups} z groups of 1 vec4, ${sh(L32, { g4: 2 }).groups} of 2, ${sh(L32, { g4: 4 }).groups} of 4`);
    const c1 = conv2dWinoWgsl({ ...L32, act: "relu" }, { g4: 1 }), c2 = conv2dWinoWgsl({ ...L32, act: "relu" }, { g4: 2 });
    ok("  its code: entry k_conv_wino, 16 vec4 accumulators a vec4 of outputs kept, the transformed weights a read-only storage array at binding 3, no weight in the uniform block",
        /fn k_conv_wino/.test(c1) && (c1.match(/var m\d+_\d+ = vec4<f32>\(0\.0\);/g) || []).length === 16 && (c2.match(/var m\d+_\d+ = vec4<f32>\(0\.0\);/g) || []).length === 32 &&
            /@binding\(3\) var<storage, read>\s+U: array<vec4<f32>>/.test(c1) && /struct WP \{ H: u32, W: u32, pad0: u32, pad1: u32, b: array<vec4<f32>, 8> \}/.test(c1),
        `g4 1: ${(c1.match(/var m\d+_\d+/g) || []).length} accumulators, g4 2: ${(c2.match(/var m\d+_\d+/g) || []).length}`);
}

console.log("\n5g. THE SUBGROUP KERNEL'S SHAPE, UNIFORM BLOCK AND TEXT, ON THE CPU (round 40, section 108)");
{
    const L32 = { Cin: 32, Cout: 32, k: 3, act: "relu" }, S = subShape(L32), F = probeFixture({ H: 7, W: 9, Cin: 16, Cout: 11, k: 3, act: "none", seed: 5 });
    const refuse = (f) => { try { f(); return null; } catch (e) { return e.message; } };
    // the uniform block is the pixel-tiled kernel's at one pixel and the same vec4s -- every byte -- and the shape's vec4s are the tile's
    const pu = packSubUniforms({ H: 7, W: 9, layer: F.layer }, { rows: 2, g4: 2 }), tu = packTileUniforms({ H: 7, W: 9, layer: F.layer }, { px: 1, g4: 2 });
    ok("  round 40: the subgroup kernel holds 32 -> 32 at 3 x 3 in 8 vec4s and 2 rows, one z group, the tile kernel's C4; its uniform block is the tile kernel's at 1 pixel, bit for bit; a subgroup of 32 writes 30 columns and of 4 writes 2",
        S.fits && S.g4 === 8 && S.rows === 2 && S.groups === 1 && S.C4 === tileShape(L32, { px: 1, g4: 8 }).C4 && S.R === 1 &&
        same(Array.from(pu), Array.from(tu)) && subSpan(32, 3) === 30 && subSpan(4, 3) === 2 && subSpan(32, 1) === 32 && SUB_WG === 64 &&
        same(subWorkgroups(1080, 1920, L32, {}, 32), [Math.ceil(1920 / 60), 540, 1]) && same(subWorkgroups(13, 19, L32, { rows: 4 }, 4), [Math.ceil(19 / 32), 4, 1]),
        `${S.bytes} bytes of weights; 1920 x 1080 at 32 lanes: ${subWorkgroups(1080, 1920, L32, {}, 32).join(" x ")} workgroups`);
    ok("  round 40: and it refuses, by name, what it cannot hold -- input channels not in whole blocks of 8 (the network's first layer, 10 -> 32), an even k, 3 rows",
        /whole blocks of 8/.test(refuse(() => conv2dSubWgsl({ Cin: 10, Cout: 32, k: 3 })) || "") && !subShape({ Cin: 10, Cout: 32, k: 3 }).fits &&
        /odd k/.test(refuse(() => conv2dSubWgsl({ Cin: 8, Cout: 8, k: 2 })) || "") && /rows in 1\/2\/4/.test(refuse(() => conv2dSubWgsl(L32, { rows: 3 })) || "") &&
        /cannot hold 10 -> 32/.test(refuse(() => packSubUniforms({ H: 2, W: 2, layer: { Cin: 10, Cout: 32, k: 3, W: new Float32Array(2880), b: new Float32Array(32) } })) || ""));
    // the text: the subgroups extension, shuffles and no barrier or workgroup memory at all; the span named by the subgroup's first index
    const code = conv2dSubWgsl(L32);
    ok("  round 40: its WGSL enables subgroups, shuffles its neighbours' columns, keeps no workgroup memory and passes no barrier, and names a subgroup's span by its first thread's index over the subgroup size",
        /^enable subgroups;/.test(code) && /fn k_conv_sub/.test(code) && (code.match(/subgroupShuffle\(/g) || []).length === 4 * 2 * 8 && !/workgroupBarrier|var<workgroup>|atomic/.test(code) &&
        /let slot = subgroupBroadcastFirst\(li\) \/ ss;/.test(code) && /@workgroup_size\(64, 1, 1\)/.test(code),
        `${code.split("\n").length} lines, ${(code.match(/subgroupShuffle\(/g) || []).length} shuffles`);
}

console.log("\n5h. HALF PRECISION: THE ROUNDING, THE TWIN, THE PACKING AND THE KERNEL'S TEXT, ON THE CPU (round 41, section 109)");
{
    // f16round and f16bits on cases worked by hand: ties to even both ways, the smallest subnormal and half of it, the largest
    // finite, the last value that rounds to it and the first that overflows, and two values with no exact f16
    const H16 = [[1, 1, 0x3c00], [65504, 65504, 0x7bff], [65519, 65504, 0x7bff], [65520, Infinity, 0x7c00], [2 ** -24, 2 ** -24, 1], [2 ** -25, 0, 0],
                 [1.5 * 2 ** -25, 2 ** -24, 1], [1 + 2 ** -11, 1, 0x3c00], [1 + 3 * 2 ** -11, 1 + 2 ** -9, 0x3c02], [-2.5, -2.5, 0xc100], [0.1, 0.0999755859375, 0x2e66],
                 [2 ** -14, 2 ** -14, 0x0400], [1 / 3, 0.333251953125, 0x3555]];
    ok("  round 41: f16round is binary16's round to nearest, ties to even -- subnormals, 65504, 65520 overflowing -- and f16bits its bits",
        H16.every(([x, v, b]) => f16round(x) === v && f16bits(f16round(x)) === b) && f16round(-0) === -0 && f16bits(-0) === 0x8000 && Number.isNaN(f16round(NaN)),
        H16.filter(([x, v, b]) => !(f16round(x) === v && f16bits(f16round(x)) === b)).map(([x]) => x).join(", ") || `${H16.length} cases`);
    // the twin: every value an f16, the f32 twin's bits nowhere it matters, and the mirror another rounding of the same sums
    const F = probeFixture({ H: 9, W: 7, Cin: 19, Cout: 12, k: 3, act: "relu", seed: 61 }), t16 = conv2dCpuF16(F.x, F.H, F.W, F.layer), m16 = conv2dCpuF16Fma(F.x, F.H, F.W, F.layer), t32 = conv2dCpu(F.x, F.H, F.W, F.layer);
    ok("  round 41: conv2dCpuF16 is f16-valued everywhere, not the f32 twin, and its fused mirror is f16-valued and close to it",
        t16.every((v) => f16round(v) === v) && m16.every((v) => f16round(v) === v) && diffCount(Array.from(t16), Array.from(t32)) > t16.length / 2 &&
        Array.from(t16).every((v, i) => Math.abs(v - m16[i]) <= 1e-2 * (Math.abs(v) + 1)),
        `${diffCount(Array.from(t16), Array.from(t32))} of ${t16.length} cells differ from the f32 twin, ${diffCount(Array.from(t16), Array.from(m16))} from the mirror`);
    // the template: the f32 setting is the default's text; the f16 kernel's every other line carries its types, its weight read or its
    // conversions; the emulation is the f16 kernel with f32 types and unpack2x16float -- the same lines elsewhere
    const L32 = { Cin: 32, Cout: 32, k: 3, act: "relu" }, R18 = { reads: "f32", unroll: true };
    const base = conv2dFastAltWgsl(L32, R18), k16 = conv2dFastAltWgsl(L32, { ...R18, arith: "f16" }), kem = conv2dFastAltWgsl(L32, { ...R18, arith: "f16emu" });
    const bl = base.split("\n"), hl = k16.split("\n"), el = kem.split("\n"), d16 = hl.filter((l, i) => l !== bl[i]), dem = el.filter((l, i) => l !== bl[i]);
    ok("  round 41: the template's f32 setting is r18u's own kernel, the f16 kernel is it line for line but where its types, weight reads and conversions differ, and the emulation differs only in its weight reads",
        conv2dFastAltWgsl(L32, { ...R18, arith: "f32" }) === base && hl.length === bl.length && el.length === bl.length && /^enable f16;/.test(k16) && !/enable f16/.test(kem) &&
        d16.every((l) => /f16|bitcast|vec4<u32>|0\.0h|= f32\(a\d\.[xyzw]\)/.test(l)) && dem.every((l) => /unpack2x16float|vec4<u32>/.test(l)) && (k16.match(/bitcast<vec4<f16>>/g) || []).length === 9 * 8 * 8 &&
        /var<workgroup> T: array<f16,/.test(k16) && /= f32\(a0\.x\);/.test(k16) && /max\(a0, vec4<f16>\(0\.0h\)\)/.test(k16) && /v = f16\(X\[/.test(k16) && !/f16/.test(kem.replace(/2x16float/g, "")),
        `${d16.length} line(s) differ in the f16 kernel, ${dem.length} in the emulation, of ${bl.length}`);
    // the packing: decoded as bitcast<vec4<f16>> reads it -- word v / 2 of a block, its xy half for an even v, zw for an odd -- every
    // weight is the f16-rounded weight, in the same order as the f32 block; the bias stays f32; half the weight bytes
    const L = probeFixture({ H: 2, W: 2, Cin: 19, Cout: 16, k: 3, seed: 62 }).layer, P16 = { ...R18, arith: "f16" }, S16 = fastAltShape(L, P16), S32 = fastAltShape(L, R18);
    const p16 = packFastAltUniforms({ H: 2, W: 2, layer: L }, P16), p32 = packFastAltUniforms({ H: 2, W: 2, layer: L }, R18);
    const u16 = new Uint16Array(p16.buffer), w0 = 4 + 4 * S16.C4, back = (bits) => { const e = (bits >> 10) & 31, m = bits & 1023, sg = bits & 0x8000 ? -1 : 1; return sg * (e ? (1 + m / 1024) * 2 ** (e - 15) : m * 2 ** -24); };
    let bad = 0;
    for (let b = 0; b < S16.blocks; b++) for (let v = 0; v < S16.perBlock; v++) for (let lane = 0; lane < 4; lane++) {
        const word = b * (S16.perBlock / 2) + (v >> 1), half = v % 2 ? 2 : 0, bits = u16[2 * w0 + 2 * (4 * word + half + (lane >> 1)) + (lane & 1)];
        if (back(bits) !== f16round(p32[w0 + 4 * (b * S32.perBlock + v) + lane])) bad++;
    }
    ok("  round 41: the packed f16 weights, decoded as bitcast<vec4<f16>> reads them, are the f32 block's weights f16-rounded, in its order; the bias stays f32; the weights take half the bytes",
        bad === 0 && Array.from(p16.slice(0, w0)).every((v, i) => Object.is(v, p32[i])) && S16.bytes - (16 + 16 * S16.C4) === (S32.bytes - (16 + 16 * S32.C4)) / 2 && S16.fits,
        `${S16.blocks} blocks x ${S16.perBlock} vec4s; ${bad} weight(s) wrong; ${S16.bytes} bytes against ${S32.bytes}`);
    // r18u's own kernel text, frozen at the round that made it a template's f32 setting: the sha256 of both its shapes, taken at the
    // commit before round 41 and after it alike -- so a change to r18u's text is red even where it moves no cell
    const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
    ok("!! round 41 (section 109): r18u's kernel text is what it was before the template -- 32 -> 32 and the 10 -> 32 first layer, by sha256",
        sha(base) === "1102b3dc38f811deab6e3584716c0fbf19519b6b9c33971946e30ae73940956e" &&
        sha(conv2dFastAltWgsl({ Cin: 10, Cout: 32, k: 3, act: "relu" }, R18)) === "52f968042a427267c1743515127de260f0a67e68e62908bd85b2d6251721c7d9",
        `${sha(base).slice(0, 12)}...`);
    ok("  round 41: and the half-precision ways refuse what they cannot pack -- vec4 reads, a block not written out, an unknown arithmetic",
        !fastAltShape(L32, { reads: "vec4", unroll: true, arith: "f16" }).fits && !fastAltShape(L32, { reads: "f32", unroll: false, arith: "f16" }).fits &&
        !fastAltShape(L32, { ...R18, arith: "bf16" }).fits && FAST_ARITH.join() === "f32,f16,f16emu" && /arith f32 or f16 or f16emu/.test((() => { try { conv2dFastAltWgsl(L32, { reads: "vec4", unroll: true, arith: "f16" }); } catch (e) { return e.message; } })() || ""));
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
    // round 27 (section 83): the Winograd kernel against ITS twin and fused mirror (conv2dCpuWino, conv2dCpuWinoFma), never conv2dCpu's --
    // the denoiser's 10 -> 32 and 32 -> 32 on odd sizes, 13 -> 11 on a 33 x 35 image (four blocks, the last partial; a partial vec4;
    // three workgroups a side, the last partial), and a 3 x 5 image smaller than one workgroup, at every g4 -- then its exact key
    // against conv2dForward. On D3D12 it runs under DXC and stands aside under FXC, where nobody has built it.
    const aside27 = nativeStandAside(adapter, COMPILER, 27);
    if (aside27) console.log(`  SKIP  round 27's device cases: ${aside27}`);
    else {
        const wino = (a, cfg, F = probeFixture(a)) => { const pk = packWinoUniforms({ H: a.H, W: a.W, layer: F.layer }, cfg);
            return H.runWgslComputeNative({ code: conv2dWinoWgsl(a, cfg), entryPoint: "k_conv_wino", outCount: a.H * a.W * a.Cout, uniforms: pk.uniforms,
                workgroups: winoWorkgroups(a.H, a.W, a, cfg), inputs: [{ binding: 2, data: F.x }, { binding: 3, data: pk.weights }] }); };
        const judgeW = (r, a) => { const F = probeFixture(a), tw = conv2dCpuWino(F.x, F.H, F.W, F.layer), fm = conv2dCpuWinoFma(F.x, F.H, F.W, F.layer); let unexplained = 0, fused = 0;
            for (let i = 0; i < tw.length; i++) { const v = Math.fround(r.values[i]); if (v === tw[i]) continue; if (v === fm[i]) fused++; else unexplained++; }
            return { unexplained, fused, n: tw.length }; };
        for (const [a, g4s] of [[{ H: 21, W: 19, Cin: 10, Cout: 32, k: 3, act: "relu", seed: 41 }, [1, 2, 4]], [{ H: 19, W: 13, Cin: 32, Cout: 32, k: 3, act: "relu", seed: 43 }, [1, 2]],
                                [{ H: 33, W: 35, Cin: 13, Cout: 11, k: 3, act: "none", seed: 53 }, [1, 2]], [{ H: 3, W: 5, Cin: 6, Cout: 7, k: 3, act: "relu", seed: 3 }, [1]]]) {
            for (const g4 of g4s) {
                const r = await wino(a, { g4 }), j = r.ok ? judgeW(r, a) : null, S = winoShape(a, { g4 });
                if (j) CASES.push([`conv2d.conv2dWinoWgsl g4 ${g4}`, a.H, a.W, a.Cin, a.Cout, j.n - j.fused, j.fused, j.unexplained]);
                ok(`!! round 27: the Winograd kernel, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, ${S.g4} vec4 a thread (${S.groups} z group${S.groups > 1 ? "s" : ""}): every cell conv2dCpuWino's or its fused mirror's`,
                    r.ok && j.unexplained === 0, r.ok ? `${j.n - j.fused} plain, ${j.fused} fused, ${j.unexplained} unexplained` : r.reason + " " + (r.errors || []).join("; "));
            }
        }
        const { I, xi, LI } = winoIntKey(), refI = conv2dForward(xi, I.H, I.W, LI), outI = [];
        for (const g4 of [1, 2]) { const r = await wino(I, { g4 }, { H: I.H, W: I.W, x: xi, layer: LI }); outI.push(r.ok && refI.every((v, i) => Math.fround(r.values[i]) === v)); }
        ok("!! round 27's exact key on the device: integers in, integer weights -- the Winograd kernel gives conv2dForward's bits at 1 and 2 vec4s a thread, whatever order a compiler kept",
            outI.every(Boolean), outI.join(", "));
    }
    // round 40 (section 108): the subgroup kernel against conv2dCpu and its fused mirror, and against the pixel-tiled kernel's
    // bits (edge zero, the r18t configuration's way with a tap outside) where neither fused -- 32 -> 32 on odd sizes at 1, 2 and 4
    // rows, 16 -> 11 on a wide image (partial spans and a partial vec4 group), the 1 x 1 head (no halo), and a 5 x 3 image
    // narrower than one span. It needs the subgroups feature: an adapter without it skips the rows by name. 4 rows at 8 vec4s (128
    // accumulator floats a thread) is not a case: natively here it crashed SwiftShader's pipeline build, the process dying with no row,
    // as written-out blocks of the fast kernel did (section 59); 4 rows run at 2 vec4s, and the set runs 2 rows (section 108).
    const aside40 = nativeStandAside(adapter, COMPILER, 40);
    if (aside40) console.log(`  SKIP  round 40's device cases: ${aside40}`);
    else {
        const sub = (a, cfg, minSize) => { const F = probeFixture(a); return H.runWgslComputeNative({ code: conv2dSubWgsl(a, cfg), entryPoint: "k_conv_sub", outCount: a.H * a.W * a.Cout,
            uniforms: packSubUniforms({ H: a.H, W: a.W, layer: F.layer }, cfg), workgroups: subWorkgroups(a.H, a.W, a, cfg, minSize), inputs: [{ binding: 2, data: F.x }], features: ["subgroups"] }); };
        const tile = (a, cfg) => { const F = probeFixture(a); return H.runWgslComputeNative({ code: conv2dTileWgsl(a, cfg), entryPoint: "k_conv_tile", outCount: a.H * a.W * a.Cout,
            uniforms: packTileUniforms({ H: a.H, W: a.W, layer: F.layer }, cfg), workgroups: tileWorkgroups(a.H, a.W, a, cfg), inputs: [{ binding: 2, data: F.x }] }); };
        const probe = await sub({ H: 1, W: 1, Cin: 8, Cout: 4, k: 1, act: "none", seed: 1 }, { rows: 1, g4: 1 }, 4);
        if (probe.skipped) console.log(`  SKIP  round 40's device cases: ${probe.reason}`);
        else {
            const minSize = (probe.subgroups && probe.subgroups.min) || 4;
            for (const [a, cfgs] of [[{ H: 19, W: 13, Cin: 32, Cout: 32, k: 3, act: "relu", seed: 43 }, [{ rows: 2, g4: 8 }, { rows: 1, g4: 4 }]],
                                     [{ H: 11, W: 37, Cin: 16, Cout: 11, k: 3, act: "none", seed: 53 }, [{ rows: 2, g4: 2 }, { rows: 4, g4: 2 }]],
                                     [{ H: 9, W: 17, Cin: 32, Cout: 81, k: 1, act: "none", seed: 47 }, [{ rows: 2, g4: 8 }]],
                                     [{ H: 5, W: 3, Cin: 8, Cout: 6, k: 3, act: "relu", seed: 3 }, [{ rows: 2, g4: 8 }]]]) {
                const rt = await tile(a, { px: 1, g4: 8, edge: "zero", weights: "inline" }), jt = rt.ok ? judge(rt, a) : null;
                for (const cfg of cfgs) {
                    const r = await sub(a, cfg, minSize), j = r.ok ? judge(r, a) : null, S = subShape(a, cfg);
                    if (j) CASES.push([`conv2d.conv2dSubWgsl rows ${cfg.rows} g4 ${S.g4}`, a.H, a.W, a.Cin, a.Cout, j.n - j.fused, j.fused, j.unexplained]);
                    ok(`!! round 40: the subgroup kernel, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, k ${a.k}, ${cfg.rows} row${cfg.rows > 1 ? "s" : ""} x ${S.g4} vec4s (${S.groups} z group${S.groups > 1 ? "s" : ""}), subgroups of ${minSize}: every cell explained -- and where neither fused, the pixel-tiled kernel's own bits`,
                        r.ok && rt.ok && j.unexplained === 0 && (j.fused || jt.fused || same(Array.from(r.values), Array.from(rt.values))),
                        r.ok && rt.ok ? `sub ${j.fused} fused, tile ${jt.fused} fused of ${j.n}` : (r.reason || rt.reason) + " " + (r.errors || []).join("; "));
                }
            }
            const K = keyCpu({ H: 9, W: 21, C: 8 }), kt = await H.runWgslComputeNative({ code: conv2dSubWgsl(K.layer, { rows: 2, g4: 2 }), entryPoint: "k_conv_sub", outCount: K.x.length,
                uniforms: packSubUniforms({ H: K.H, W: K.W, layer: K.layer }, { rows: 2, g4: 2 }), workgroups: subWorkgroups(K.H, K.W, K.layer, { rows: 2, g4: 2 }, minSize), inputs: [{ binding: 2, data: K.x }], features: ["subgroups"] });
            ok("  round 40: the identity key on the device, 9 x 21, eight channels: the subgroup kernel returns its input bit for bit", kt.ok && K.x.every((v, i) => Math.fround(kt.values[i]) === v), kt.ok ? "" : kt.reason);
        }
    }
    // round 41 (section 109): the half-precision kernel -- here as its emulation (the same packed words through unpack2x16float, f32
    // types), held to conv2dCpu on f16-rounded weights; and as itself where the adapter offers shader-f16, held to conv2dCpuF16 or its
    // mirror. Odd sizes, partial channel blocks (10 and 19 inputs), three z groups. Under FXC on D3D12 they stand aside (no 16-bit types).
    const aside41 = nativeStandAside(adapter, COMPILER, 41);
    if (aside41) console.log(`  SKIP  round 41's device cases: ${aside41}`);
    else {
        const R18 = { reads: "f32", unroll: true };
        const alt16 = (a, arith, features = []) => { const F = probeFixture(a), cfg = { ...R18, arith }; return H.runWgslComputeNative({ code: conv2dFastAltWgsl(a, cfg), entryPoint: "k_conv_fast_alt", outCount: a.H * a.W * a.Cout,
            uniforms: packFastAltUniforms({ H: a.H, W: a.W, layer: F.layer }, cfg), workgroups: [Math.ceil(a.W / TILE), Math.ceil(a.H / TILE), fastAltShape(a, cfg).groups], inputs: [{ binding: 2, data: F.x }], features }); };
        const judgeWith = (r, a, tw, fm) => { let unexplained = 0, fused = 0; for (let i = 0; i < tw.length; i++) { const v = Math.fround(r.values[i]); if (v === tw[i]) continue; if (v === fm[i]) fused++; else unexplained++; } return { unexplained, fused, n: tw.length }; };
        const CASES41 = [{ H: 19, W: 13, Cin: 32, Cout: 32, k: 3, act: "relu", seed: 43 }, { H: 21, W: 19, Cin: 10, Cout: 32, k: 3, act: "relu", seed: 41 },
                         { H: 11, W: 7, Cin: 19, Cout: 12, k: 3, act: "none", seed: 53 }, { H: 9, W: 17, Cin: 32, Cout: 80, k: 1, act: "none", seed: 47 }];
        for (const a of CASES41) {
            const F = probeFixture(a), Lr = { ...F.layer, W: Float64Array.from(F.layer.W, f16round) }, r = await alt16(a, "f16emu");
            const j = r.ok ? judgeWith(r, a, conv2dCpu(F.x, a.H, a.W, Lr), conv2dCpuFma(F.x, a.H, a.W, Lr)) : null;
            if (j) CASES.push(["conv2d.conv2dFastAltWgsl f16emu", a.H, a.W, a.Cin, a.Cout, j.n - j.fused, j.fused, j.unexplained]);
            ok(`!! round 41: the half-precision kernel's emulation, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, k ${a.k} (${fastAltShape(a, { ...R18, arith: "f16emu" }).groups} z group(s)): every cell conv2dCpu's on the f16-rounded weights, or its fused mirror's -- the packed words read in the right order`,
                r.ok && j.unexplained === 0, r.ok ? `${j.n - j.fused} plain, ${j.fused} fused, ${j.unexplained} unexplained` : r.reason + " " + (r.errors || []).join("; "));
        }
        const probe16 = await alt16(CASES41[2], "f16", ["shader-f16"]);
        if (probe16.skipped) console.log(`  SKIP  round 41's f16 device cases: ${probe16.reason} -- the Intel gen-9 has it, natively and in Chrome (section 109)`);
        else for (const a of CASES41) {
            const F = probeFixture(a), r = a === CASES41[2] ? probe16 : await alt16(a, "f16", ["shader-f16"]);
            const j = r.ok ? judgeWith(r, a, conv2dCpuF16(F.x, a.H, a.W, F.layer), conv2dCpuF16Fma(F.x, a.H, a.W, F.layer)) : null;
            if (j) CASES.push(["conv2d.conv2dFastAltWgsl f16", a.H, a.W, a.Cin, a.Cout, j.n - j.fused, j.fused, j.unexplained]);
            ok(`!! round 41: the half-precision kernel, ${a.H} x ${a.W}, ${a.Cin} -> ${a.Cout}, k ${a.k}: every cell conv2dCpuF16's or its fused mirror's`,
                r.ok && j.unexplained === 0, r.ok ? `${j.n - j.fused} plain, ${j.fused} fused, ${j.unexplained} unexplained` : r.reason + " " + (r.errors || []).join("; "));
        }
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
