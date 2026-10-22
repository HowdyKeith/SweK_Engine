// WebGLEngine/render/denoiseDevice-selfcheck.mjs -- the denoiser arc, round 12
//
// Run: node render/denoiseDevice-selfcheck.mjs
//
// GATES render/denoiseDevice.mjs -- the kernel-predicting network's forward pass and its kernel on a GPUDevice
// (pre-registration section 35). Its exports, each named here: APPLY_TOL, kernelApplyWgsl, packApplyUniforms,
// kernelApplyCpu, kernelFor, deviceLayers, denoiseTwin, createDeviceDenoiser, encodeNet, decodeNet, KERNEL_SETS,
// DEFAULT_KERNELS, round 14's PAGE_KERNELS, applyFor and kernelApplyFastWgsl, round 15's kernelHeadApplyWgsl and
// judgeHeadApply, round 18's R18_KERNELS, FXC_UNBUILT_SETS (round 18's BROWSER_ONLY_SETS, renamed by round 19), isD3D12Native,
// nativeSetsFor, PAGE_KERNELS_BY_ADAPTER, pageAdapterKey and pageKernelsFor, and round 19's isDxcCompiler,
// NATIVE_KERNELS_BY_ADAPTER, nativeAdapterKey and nativeKernelsFor -- and, held by
// render/denoiseTiming-selfcheck.mjs rather than here (section 37), TIMING_SIZES, largestBuffer, timingInput, summarize,
// adapterOf, timingDevice and timingLadder. What it holds: the
// apply twin is render/denoiseNet.mjs's f64 kernel within f32 rounding, mask and borders included; the head runs on the
// direct kernel and every other layer of the large network on the tiled one; on Dawn, every conv cell is the twin's or
// the fused mirror's given the device's own input to that layer, the kernel is its twin within APPLY_TOL, and the whole
// pass is the f64 network's within f32 rounding; the shipped network decodes to its shape bit for bit; and the page,
// denoise.html, in Chromium, runs the network on ITS device and finds it the f64 network's, refusing a dataset seed.
// Round 13 (section 39): both kernel sets, r12 and the fast r13, held to the same twin cell for cell -- natively on Dawn
// (section 3), and in the browser's own origin (section 5) -- K0's (b) and (c) on the rig.
// Round 14 (section 43): the r14 set -- the fast kernel, the head kernel writing planar logits, and k_apply_fast reading
// them -- natively in place of r13 (whose native build costs minutes under the D3D12 compiler node-webgpu ships, and whose
// native exactness section 42 already holds), and all three sets in the browser.
// Round 15 (section 46): the r15 set -- the fast kernel, then the head and the kernel apply as ONE pass (k_head_apply),
// whose logits are never stored. Its hidden layers are judged cell for cell as before; its last pass through the image,
// against kernelApplyCpu on the twin's logits and on the fused mirror's (judgeHeadApply); and its head's ORDER through
// render/denoiseCompile.mjs's order probe, a head whose products are exact and whose sums are not -- natively here, and
// all four sets in the browser.
// Round 16 (section 54) added rows for its two sets, r16a and r16b, on brain/conv2d.mjs's pixel-tiled kernel. Section 57
// withdrew both sets by section 56's rule -- node-webgpu's FXC did not build that kernel within 3 minutes on either GPU -- and
// their rows with them: built natively on a D3D12 adapter, they would stop this gate as they stopped it in section 56.
// Round 18 (section 61): two sets for the page -- r18t, every hidden layer on the pixel-tiled kernel at 2 pixels x 8 vec4s,
// edge zero, weights read where they are used; r18u, every hidden layer on the fast kernel with a block of 8 channels
// written out -- each with r15's fused last pass. Their hidden layers are judged cell for cell, their last pass through the
// image, and where no cell fused each set's every hidden layer and its image are r15's, bit for bit: natively where the
// adapter is not D3D12 (on one, node-webgpu's FXC stopped on r18t's kernel and crashed on r18u's -- section 60 -- so their
// rows print SKIP there; since round 19, under FXC only), and in the browser always. The page runs pageKernelsFor(its
// adapter's key), r15 on any adapter section 61's table does not name.
// Round 19 (section 66): node-webgpu 0.6.2 compiles with DXC, which built both round-18 sets' kernels in seconds, exact, on
// both of the rig's GPUs (section 65) -- so their native rows run on a D3D12 adapter too when the run's compiler is DXC, and
// print SKIP there only under FXC, naming the compiler read. That compiler is read off the package (tools/ship/headlessGpu.mjs's
// nativeCompiler, handed the flags this gate's device is made with: none, Dawn as shipped) -- the adapter cannot say, and the
// compile gate holds the reading to Dawn's own dump in the same run. A SWEK_WEBGPU this box cannot load is a red here, never a
// skip: as a skip, a DXC run with a mistyped path passed green with no native row. The native adapter, with that compiler, is
// named where tools/ship/realGpuRun.mjs reads adapters, and one measured ("----") line says which round-18 sets' native rows ran
// and whether every one was green -- section 66's condition (1), readable off the rig's report, which keeps only measured and
// failing lines. NATIVE_KERNELS_BY_ADAPTER, a DXC run's native set by adapter, is section 66's rule read off the rig's two
// round-19 reports (section 67, v4852: r18u on the Intel gen-9, nothing on the GTX 1080) -- derived here by rule66Entries from
// the committed reports, not retyped -- and DEFAULT_KERNELS stays r15. tools/denoiseDevice.mjs's --measure-r18t and --measure-r18u refuse, by name, a run whose
// compiler FXC_UNBUILT_SETS drops; no gate runs that CLI, so a row here reads its source.
// Round 27 (section 83, v4868): "r27w", every hidden 3 x 3 layer on brain/conv2d.mjs's Winograd kernel, with r15's fused last pass --
// the first set whose hidden cells are NOT added in the canonical order. Each layer is judged against the twin twinsOf names for its
// kernel (conv2dCpuWino or its fused mirror for a Winograd layer), the last pass through the image as r15's, and -- the restated
// key -- the image held to the f64 network's 1e-5 per value, the bound every set has met since section 35 and, for r27w, the only
// bridge to r15: its bits cannot be r15's. Natively under DXC and off D3D12, never under FXC (FXC_UNTRIED_SETS), and in the browser
// always, with its own measured line for the rig's report and R27_KERNELS's configuration, one vec4 a thread, named.
//
// *** NOTHING HERE RENDERS A DATASET SEED. *** The images are synthetic; the networks are drawn from seeds here.
// *** ONE DEVICE PER JOB. *** Measured while building this: a Dawn device reused after the JS thread had been busy for
// about a second crashed the process (std::system_error, then a futex error) or hung, with or without the first
// denoiser destroyed; a fresh adapter and device per job, destroyed after, ran clean every time. Each device section
// below asks for its own and destroys it before any long CPU work.
//
// ---- SABOTAGES, WITH THEIR RESULTS ---------------------------------------------------------------------------
//   V1  k_apply weighs taps across the emitter mask                             3 RED
//   V2  k_apply re-modulates by the albedo without its floor                    5 RED
//   V3  the head sent to the tiled kernel (COUT_MAX ignored)                     3 RED (refused by the packer, by name)
//   V4  the twin compares the mask on the wrong channel                          5 RED
//   V5  decodeNet reads big-endian                                               2 RED
//   V6  the device layers lose their biases                                      1 RED (the synthetic networks' biases are zero; the page's
//       trained one is what sees it)
//   V7  layer 1 reads the input image instead of layer 0's output               4 RED
//   V8  k_apply's weights not normalised by their sum                            6 RED
//   V9  the page hands the network nine channels, without the mask              1 RED
//   V10 the page's dataset-seed refusal removed                                  1 RED (the renderer refuses anyway, and the row
//       holds the page's own refusal)
//   V11 k_apply's softmax without the largest logit subtracted                   1 RED (0 until the shift-by-100 row: until a
//       logit passes ~88 it changes nothing a finite image shows)
//   round 13, against brain/conv2d.mjs's fast kernel and the r13 set (each also run against brain/conv2d-selfcheck.mjs):
//   F1  the fast kernel sums a block's channels last-first                       2 RED (K0 natively and in the browser)
//   F2  its weights read without the group offset                                3 RED (the head's groups 2-3)
//   F3  its bias packed one float late                                           0 RED HERE -- V6's blind spot again: these
//       networks' biases are zero; brain/conv2d-selfcheck.mjs's layout row and its six device cases catch it, 6 RED
//   F4  its second barrier removed                                               3 RED
//   F5  its padding channels written past Cout                                   3 RED
//   F6  the r13 set never picks the fast kernel                                  3 RED
//   round 14, against the head kernel, k_apply_fast and the r14 set (the head's three also run against
//   brain/conv2d-selfcheck.mjs, every one also against render/denoiseCompile-selfcheck.mjs where it applies):
//   H1  the head kernel sums its channels last-first                            2 RED (K0 natively and in the browser)
//   H2  the head kernel writes channels last, not planar                        3 RED
//   H3  packHeadUniforms puts the bias one float late                           0 RED HERE -- F3's blind spot a third time: these
//       networks' biases are zero; brain/conv2d-selfcheck.mjs's layout row and its device cases catch it, 5 RED
//   A1  k_apply_fast weighs taps across the emitter mask                        4 RED (the shifted-logits row: worst relative 7.57e+1)
//   A2  k_apply_fast's halo origin one pixel off                                4 RED (3.02e+0)
//   A3  k_apply_fast's barrier removed                                          4 RED (1.00e+0 -- deterministic on SwiftShader, as the
//       tiled kernel's S5 was: it runs a workgroup's threads in order, so the tile is read before it is written)
//   S1  the r14 set never runs the head kernel                                  3 RED (the r14 row, K0 natively and in the browser)
//   S2  the r14 set reads its planar logits with k_apply                        4 RED
//   round 15, against k_head_apply, the r15 set, judgeHeadApply and the order probe (the kernel's five also against
//   render/denoiseCompile-selfcheck.mjs, 2 RED each: its native and browser rows):
//   R1  k_head_apply's head sums its channels last-first                       2 RED -- AND NOT THE K0 ROWS: on these networks the
//       reordered logits move the image by less than APPLY_TOL, so K0 on the image alone passes it, natively and in the
//       browser. The order probe catches it, and the same-bits-as-r14 row. That is what the probe is for
//   R2  k_head_apply weighs taps across the emitter mask                       5 RED
//   R3  k_head_apply reads each tap's colour one column right                  6 RED (the no-mask row: worst relative 1.27e+0)
//   R4  k_head_apply's barrier removed                                         7 RED (deterministic on SwiftShader, as A3 was)
//   R5  k_head_apply's softmax without the largest logit subtracted            3 RED (the bias-plus-100 row, the probe -- its logits
//       near 3.8e5 overflow exp -- and the same-bits row; 0 on K0 itself, V11's blind spot)
//   R6  the r15 set never fuses its head                                       4 RED
//   R8  the order probe's weights not exact products (j/7)                     1 RED (the probe-is-a-probe row; the compile gate stays
//       green under it, as it must on a device that never fuses: twin and mirror only part where a device fuses)
//   R9  judgeHeadApply judges nothing                                          1 RED (the same row: the judge must see the reversed head)
//   R10 applyFor gives the fused set a separate k_apply                        6 RED (no logit buffer to bind: the pass does not build)
//   round 14's verdict (section 49: the default r14, the page r13):
//   V1  the default left at r12                                                 1 RED (the r14 row)
//   V2  the page given rule B's runner-up, r14                                  1 RED (the same row)
//   round 15's verdict (section 50: the default and the page both r15; the assertion moved to the r15 row):
//   V3  the default left at r14                                                 1 RED (the r15 row)
//   V4  the page left at r13                                                    1 RED (the same row)
//   round 16, against brain/conv2d.mjs's pixel-tiled kernel and the r16a and r16b sets -- THOSE ROWS LEFT WITH THE SETS AT
//   SECTION 57; these record what they caught while they stood (P1-P4, P6, P7 also against
//   brain/conv2d-selfcheck.mjs and render/denoiseCompile-selfcheck.mjs, P5 against render/denoiseTiming-selfcheck.mjs):
//   P1  the tile kernel sums a block's channels last-first                      5 RED (K0 natively and in the browser for both sets,
//       and the small network) -- NOT the same-bits-as-r15 rows: the reversal fused some cells by accident, so those rows
//       stood aside, as they are written to; the K0 rows are what hold the order
//   P2  pixel p reads pixel 0's window                                           7 RED
//   P3  its second barrier removed                                               7 RED
//   P4  its weights read without the group offset                                3 RED (r16b only: its 32 channels are two z groups,
//       r16a's one)
//   P5  the r16a set never picks the pixel-tiled kernel                          4 RED
//   P6  tileWorkgroups dispatches half the columns                               3 RED (r16a; at 19 wide, r16b's 32-pixel workgroup is
//       one either way -- brain/conv2d-selfcheck.mjs's wider cases and the compile gate's 64 catch it)
//   P7  the guarded branch's per-pixel bound test removed                        0 RED -- the tile is zero outside the image, so only
//       the sign of a zero could move (brain/conv2d-selfcheck.mjs's P7)
//   round 18, against the r18t and r18u sets and the page's table (U1-U4 also against render/denoiseTiming-selfcheck.mjs). Each
//   restored, md5 verified:
//   U1  the r18t set never picks the pixel-tiled kernel                         4 RED (the sets row, K0 natively and in the browser,
//       the small network)
//   U2  the r18u set never picks the written-out fast kernel                    4 RED (the same four)
//   U3  nativeSetsFor keeps every set on a D3D12 adapter                        1 RED (the browser-only row)
//   U4  isD3D12Native never sees D3D12 (the regex asks for D3D11)               1 RED (the same row)
//   U5  pageKernelsFor ignores the table                                        1 RED (the page-key row)
//   U6  pageAdapterKey makes a key without a platform ("undefined/...")         1 RED (the same row) -- a first form that read
//       uaData.platform unguarded crashed the gate instead, red by its exit code and no row
//   U7  pageKernelsFor reads the table without Object.hasOwn                    1 RED (the same row: "constructor" is a key)
//   U8  the page runs r18t whatever the table says                              1 RED (the page's caption row)
//   U11 the tile_inline layers dispatched with the fast kernel's workgroups     0 RED -- twice the columns, every extra pixel outside
//       the image, so no cell moves: a waste of time, not of exactness, and nothing here times it
//   U11b ...and with half the columns                                           3 RED (r18t's K0 natively and in the browser, the
//       same-bits-as-r15 row)
//   U12 the fast_unroll layers packed as the fast kernel's (not block by block) 4 RED (r18u's K0 natively and in the browser, the
//       same-bits row, the small network)
//   round 18's verdict (section 63: r18u on the Intel gen-9, r18t on the GTX 1080). Each restored, md5 verified:
//   V5  the table's two entries swapped                                         1 RED (the verdict row)
//   V6  the page refuses the table's set for an adapter the table names         0 RED HERE -- this box's adapter (SwiftShader) is not
//       in the table, so the page row checks the miss path; on either rig GPU the same row checks the table's set
//   V7  the table names a third adapter (this box's)                            1 RED (the verdict row)
// v4851 -- ROUND 19'S ROWS, SABOTAGED. Each against render/denoiseDevice.mjs, the gate run, restored byte-identical:
//   S1  nativeSetsFor drops r18t and r18u on D3D12 even under DXC        -> RED: "DXC builds both"
//   S2  nativeSetsFor keeps them under FXC                               -> RED: "FXC builds neither round-18 set"
//   S3  isDxcCompiler matches "dxc" in any case                          -> RED: "isDxcCompiler is DXC as the package names it"
//   S4  NATIVE_KERNELS_BY_ADAPTER ships an entry before the rule is read -> RED: "NATIVE_KERNELS_BY_ADAPTER is frozen and EMPTY"
//   S5  nativeKernelsFor reads the table without asking the compiler    -> RED: "nativeKernelsFor gives a table's set"
//   (S4's row held the table EMPTY until the rule was read; v4852 read it, and the row now holds it frozen -- the verdict rows below
//   hold what is in it.)
// v4852 -- ROUND 19'S VERDICT (section 67), SABOTAGED. Each against the file named, the gate run, restored byte-identical (md5):
//   T1  render/denoiseDevice.mjs: the Intel's entry swapped to r18t       -> 2 RED: the verdict row, "nativeKernelsFor gives a table's set"
//   T2  render/denoiseDevice.mjs: the 1080 given r18t as well             -> 2 RED: the same two
//   T3  rule66Entries without condition 4                                 -> 3 RED: the verdict, "the rule discriminates", the predictions
//   T4  rule66Entries reading the key off section 61's line               -> 3 RED: the same three
//   T5  sizeRatios' top taking the SMALLEST size                          -> 2 RED: "the rule discriminates", the predictions
//   T6  r15DxcOverFxc reading the smallest common size                    -> 1 RED: the predictions (at 64 x 64 the Intel's r15
//       ran 4.705 ms under DXC against 4.713 under FXC -- P3 holds only at the size the rule names)
// v4852 -- ROUND 20'S CALLER (section 68), SABOTAGED. Each against the file named, the gate run, restored byte-identical (md5):
//   U1  nativePick reading every run as DXC                               -> 1 RED: "nativePick takes section 67's set ..."
//   U2  nativePick ignoring the table it is handed                        -> 1 RED: "createNativeDenoiser builds the set it picked"
//   U3  createNativeDenoiser building DEFAULT_KERNELS                     -> 1 RED: the same row
//   U4  nativePick keyed with "win32" whatever the platform               -> 1 RED: "nativePick takes section 67's set ..."
//   U5  createNativeDenoiser building r15 when it picked r18u             -> 1 RED: "createNativeDenoiser builds the set it picked"
//   U6  tools/denoiseDevice.mjs --which reading the compiler with use_dxc disabled -> 0 RED HERE: linux has no D3D compiler, so
//       the flags change nothing on this box; on the rig, section 68's Q1 reads the compiler line, and 0.6.2 would print FXC
// v4853 -- SECTION 68'S OUTCOME (render/denoise-rig-r20-which.txt), SABOTAGED. Each restored byte-identical (md5):
//   W1  WHICH_PREDICTED: the Intel under DXC predicted r15                   -> 1 RED: "section 68's outcome"
//   W2  the rig file: the 1080 under DXC given a reason nativePick does not  -> 1 RED: the same row
//   W3  the rig file: the Intel's DXC pass 2e-4 from the f64 network         -> 1 RED: the same row
//   W4  the version test reading 0.6.1 as DXC-capable                        -> 1 RED: the same row (the Intel's installed 0.6.1)
// ROUND 40 (section 108), against the r40s set, by the byte-safe runner with brain/conv2d-selfcheck.mjs, each restored
// byte-identical (sha256) -- the kernel's own sabotages, G1-G5, are logged there (8-10 RED across both gates); the set's here:
//   G6  createDeviceDenoiser building r40s on a device without subgroups   1 RED (the refusal row: WGSL did not compile, not refused by name)
//   G7  the ladder keeping r40s on an adapter without subgroups            1 RED (the hidden-feature ladder row: it threw instead). It would
//       have been 0 RED -- a gate that dies prints no FAIL line -- before that row caught the throw, and the runner now counts a crash
// ROUND 41 (section 109), against the r41h set, with brain/conv2d-selfcheck.mjs (H1-H5 logged there); the set's here:
//   H6  F16_IMAGE_TOL widened to 1e-1                                     1 RED (the r41h row)
//   H7  createDeviceDenoiser building r41h on a device without shader-f16 1 RED (the refusal row: WGSL did not compile, not refused by name)
//   K0h natively and in the browser SKIP here (no shader-f16): the Intel runs them, and no sabotage of the f16 kernel's own types is seen
//   before it does
// v4868 -- ROUND 27 (section 83), against the r27w set, twinsOf and FXC_UNTRIED_SETS. Each restored byte-identical (md5):
//   Y1  kernelFor never picks the Winograd kernel for r27w                  -> 6 RED: the whole-twin row, the layers row, K0w natively,
//       the not-r15's-bits row, the small network, K0w in the browser (and 2 in render/denoiseTiming-selfcheck.mjs: different kernels)
//   Y2  twinsOf giving every layer the direct pair                          -> 5 RED: the whole-twin row, the layers row, K0w natively,
//       the small network, K0w in the browser -- every Winograd cell then reads as unexplained. The not-r15's-bits row stays green, as
//       it should: it compares the device with r15, not with a twin
//   Y3  nativeSetsFor ignoring FXC_UNTRIED_SETS                              -> 2 RED: the FXC row and the FXC_UNTRIED_SETS row (and 2 in
//       render/denoiseTiming-selfcheck.mjs: the ladders' sets row and the native plan row)
//   Y4  the Winograd layers dispatched at two vec4s' z groups, half of them  -> 3 RED: K0w natively, the small network, K0w in the browser
//   Y5  --measure-r27w judging every layer against the direct pair            -> 1 RED: the CLI source row (no gate runs the CLI)
//   Y6  R27_KERNELS at two vec4s a thread                                     -> 1 RED: the layers row -- K0w holds at two, as it should;
//       the configuration is held by name, because section 83 says why one
// v4869 -- ROUND 27'S VERDICT (section 86): rule83Entries and its three rows. Each restored byte-identical (md5):
//   Z1  RULE83_MIN 0.25 instead of 1.05                                       -> 3 RED: the verdict, the discrimination row, the predictions
//   Z2  the present entry read as r15 whatever the table said                 -> 1 RED: the discrimination row (r27w is under r15 too, so the
//       verdict alone cannot tell; lifted over r15 and not r18t, the copy then qualifies)
//   Z3  render/denoiseDevice.mjs: the 1080's page entry given r27w            -> 2 RED: the verdict and round 18's page verdict (section 63)
//   Z4  the page's K0w ignoring a skipped exact-gate row                       -> 1 RED: the discrimination row
//   Z5  section 85's check dropped (a report that did not time r27w keyed)    -> 1 RED: the discrimination row
//   Z6  the committed 1080 run b edited to 1.100 x r18t natively at 1080p     -> 3 RED: the verdict, the discrimination row (its one-run
//       lift is now two), the predictions -- one run alone still moves no entry, and the verdict row reads condition 3 in every run
//   Z7  both runs asked as either run (some for every)                        -> 1 RED: the discrimination row
// v4871+ -- ROUND 28'S VERDICT (section 88): the two rows read off render/denoise-rig-r28-*.json and -which.txt. Each restored byte-identical
// (sha256), by a runner that reads and writes bytes and restores on SIGTERM:
//   X1  prediction 3 looking for section 79's reason (the number before the renumbering)  -> 1 RED: the verdict
//   X2  the committed Intel report's use_dxc-off group edited to 8 of 8 built             -> 1 RED: the verdict
//   X3  the committed console's 1080 --which edited to r15                                -> 1 RED: the verdict
//   X4  the Intel's expected set made r15                                                 -> 1 RED: the verdict
//   X5  the --which rule without its kernels clause and its nativePick re-derivation      -> 1 RED: the discrimination row (either clause
//       alone catches r15, so removing one alone should leave the row green -- read off the code, not run: the run that would have
//       measured it is the killed one below)
//   *** THE FIRST RUNNER LEFT TWO THINGS BROKEN, AND NEITHER WAS ITS RED COUNT. *** It was killed by its caller's timeout during X4, and a
//   Python `finally` does not run on SIGTERM: the --which rule was left without its kernels clause. And it wrote files back in text mode,
//   so the committed console -- CRLF, as the rig wrote it -- came back LF, with its md5 "restored" against the text it had already
//   converted. git status showed the second, a grep for the clause the first; both were put back and cmp'd against the upload.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { APPLY_TOL, kernelApplyWgsl, packApplyUniforms, kernelApplyCpu, kernelFor, deviceLayers, denoiseTwin, createDeviceDenoiser, encodeNet, decodeNet,
        KERNEL_SETS, DEFAULT_KERNELS, PAGE_KERNELS, applyFor, kernelApplyFastWgsl, kernelHeadApplyWgsl, judgeHeadApply,
        R18_KERNELS, FXC_UNBUILT_SETS, isD3D12Native, nativeSetsFor, PAGE_KERNELS_BY_ADAPTER, pageAdapterKey, pageKernelsFor, passBytes, TIMED_SETS,
        isDxcCompiler, NATIVE_KERNELS_BY_ADAPTER, NATIVE_KERNELS_DECIDED_BY, nativeAdapterKey, nativeKernelsFor, nativePick, createNativeDenoiser,
        R27_KERNELS, FXC_UNTRIED_SETS, twinsOf, R40_KERNELS, SUBGROUP_SETS, featureSetsFor, timingLadder, R41_KERNELS, F16_SETS, SET_FEATURES, F16_IMAGE_TOL } = await imp("render/denoiseDevice.mjs");
// v4862 -- the native table as sections 67 and 68 measured it, before section 78 gave the 1080 r18t. Rows about what the rig ran THEN
// (section 68's --which runs, round 19's verdict) are held to it; rows about what a native run picks NOW, to the shipped table.
const NATIVE_KERNELS_AT_V4852 = Object.freeze({ "win32/intel/gen-9": "r18u" });
const CMP = await imp("render/denoiseCompile.mjs");
const { makeDenoiser, denoise, KERNEL_TAPS, shapeFor, paramCount } = await imp("render/denoiseNet.mjs");
const { conv2dCpu, conv2dCpuFma, COUT_MAX, tileShape, fastAltShape, conv2dTileWgsl, conv2dFastAltWgsl, conv2dCpuWino, conv2dCpuWinoFma, winoShape, conv2dWinoWgsl, conv2dCpuF16, conv2dCpuF16Fma } = await imp("brain/conv2d.mjs");
const { seededRandom } = await imp("brain/convNet.mjs");
const { ALBEDO_FLOOR } = await imp("render/denoiseScenes.mjs");
const H = await imp("tools/ship/headlessGpu.mjs");
const { runInEngineOrigin } = await imp("tools/ship/webgpuHarness.mjs");
// v4838: K0 for every set on every path as a report table (tools/ship/gateReport.mjs), the counts the PASS lines print
const { gateReport } = await imp("tools/ship/gateReport.mjs");
const REPORT = gateReport("render/denoiseDevice-selfcheck.mjs"), K0ROWS = [];
const k0row = (where, set, J, worst) => K0ROWS.push([where, set, J.reduce((a, j) => a + j.plain, 0), J.reduce((a, j) => a + j.fused, 0), J.reduce((a, j) => a + j.unexplained, 0), worst]);

let fails = 0;
// v4849 -- it returns the row's result, so round 19's measured line can say which round-18 sets' native rows were green
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; return !!c; };

// v4852 -- SECTION 66'S RULE, AS CODE, read off a realGpuRun --only denoise report (render/denoise-rig-r19-*.json). Per set (r18t,
// r18u) it asks the five conditions in order and records the first that fails: 0 the run's compiler is DXC (the package said
// DXC, the compile gate green, every "as shipped" dump DXIL); 1 K0 (b), the set's native rows in the exact gate all green;
// 2 K1 against r12 under DXC (at least 2 x at the largest size both measured, at least 1 x at every one); 3 at least 1.05 x
// r15 under DXC, and 4 at least 1.05 x r15 under FXC (unpaired), each at the largest size the report prints for it. The entry
// is the qualifier with the larger condition-3 ratio, a tie to r18u; no key, or no qualifier, is no entry.
const RULE66_SETS = ["r18t", "r18u"], RULE66_MIN = 1.05;
const rigGate = (rep, name) => (rep.gates || []).find((g) => g.gate === `render/${name}-selfcheck.mjs`) || null;
const rigLines = (g) => (g && g.measured) || [];
const sizeRatios = (lines, head) => lines.map((l) => l.startsWith(head) && l.slice(head.length).match(/^(\d+) x (\d+): ([\d.]+) x as fast/))
    .filter(Boolean).map((m) => ({ px: +m[1] * +m[2], size: `${m[1]} x ${m[2]}`, r: +m[3] })).sort((a, b) => a.px - b.px);
// v4861 -- SECTION 75'S RULE is the same function with condition 4 reported and not asked ({ fxc: false }): with the pin on 0.6.2
// a native caller already runs r15 under DXC, so "beat r15 under FXC" protected a caller who no longer exists. Conditions 0 and 1 keep
// the code's reading, the WHOLE compile and exact gates green, which section 76 adopted over the prose's "the row is green" after
// round 24's second runs crashed on both GPUs in rows the prose did not name.
function rule66Entries(rep, { fxc: askFxc = true } = {}) {
    const comp = rigGate(rep, "denoiseCompile"), dev = rigGate(rep, "denoiseDevice"), tim = rigGate(rep, "denoiseTiming");
    const T = rigLines(tim), keyLine = T.map((l) => l.match(/^native: this adapter's key for section 66's table: (\S+)$/)).find(Boolean);
    const key = keyLine ? keyLine[1] : null;
    const c0 = !!comp && comp.ok === true && !!rep.nodeWebgpu && rep.nodeWebgpu.compiler === "DXC" &&
        rigLines(comp).some((l) => /^native \/ as shipped in all: (\d+) of \1 built; dumps: \1 DXC \(DXIL\); compiler, from the package: DXC;/.test(l));
    const sets = RULE66_SETS.map((s) => {
        const c1 = !!dev && dev.ok === true && rigLines(dev).some((l) => new RegExp(`\\b${s} green \\((\\d+) of \\1 native rows\\)`).test(l));
        const k1 = sizeRatios(T, `native: ${s} against r12 at `), dxc = sizeRatios(T, `native: ${s} against r15 at `), fxc = sizeRatios(T, `native: ${s} against r15 under FXC at `);
        const top = (a) => (a.length ? a[a.length - 1] : null);
        const conds = [c0, c1, !!tim && tim.ok === true && k1.length > 0 && top(k1).r >= 2 && k1.every((x) => x.r >= 1),
                       !!top(dxc) && top(dxc).r >= RULE66_MIN, !askFxc || (!!top(fxc) && top(fxc).r >= RULE66_MIN)];
        const fail = conds.indexOf(false);
        return { s, fail, c3: top(dxc), line: `${s} K1 ${top(k1) ? top(k1).r + " x at " + top(k1).size : "none"}, ${top(dxc) ? top(dxc).r + " x r15 under DXC at " + top(dxc).size : "no DXC ratio"}, ` +
                 `${top(fxc) ? top(fxc).r + " x r15 under FXC at " + top(fxc).size : "no FXC ratio"}${fail < 0 ? ", qualifies" : `, fails condition ${fail}`}` };
    });
    const q = sets.filter((x) => x.fail < 0).sort((a, b) => a.c3.r - b.c3.r || RULE66_SETS.indexOf(a.s) - RULE66_SETS.indexOf(b.s));
    return [{ key, entry: key && q.length ? q[q.length - 1].s : null, fail: Object.fromEntries(sets.map((x) => [x.s, x.fail])), lines: sets.map((x) => x.line) }];
}
// v4869 -- SECTION 83'S RULE, AS CODE, read off one realGpuRun --only denoise report. Per path it asks the conditions in order and
// records the first that fails. Natively: 0 the run's compiler is DXC and the whole compile gate green (rule66's condition 0, which
// is section 76's reading); 1 K0w (b), the whole exact gate green and its measured line "r27w green (N of N native rows)"; 2 K1 against
// r12 natively (at least 2 x at the largest size both measured, at least 1 x at every one); 3 at least 1.05 x the GPU's present
// native entry at the largest size both measured. On the page: 1 K0w (c), the whole exact gate green with no row skipped and its
// browser adapter hardware -- a browser row that went red is a FAIL line, one that could not run a SKIP line; 2 K1 on the page; 3 at
// least 1.05 x the present page entry. The present entries are the tables as section 83 was fixed (RULE83_AT), not the live ones,
// so the rule reads what r27w had to beat; an adapter neither names is held to r15. A report whose timing gate did not time r27w
// (section 85's check) reads as no key, and so no entry.
const RULE83_MIN = 1.05;
const RULE83_AT = Object.freeze({ native: Object.freeze({ "win32/intel/gen-9": "r18u", "win32/nvidia/pascal": "r18t" }),
                                  page: Object.freeze({ "Windows/intel/gen-9": "r18u", "Windows/nvidia/pascal": "r18t" }) });
function rule83Entries(rep) {
    const comp = rigGate(rep, "denoiseCompile"), dev = rigGate(rep, "denoiseDevice"), tim = rigGate(rep, "denoiseTiming");
    const T = rigLines(tim), keyOf = (re) => (T.map((l) => l.match(re)).find(Boolean) || [])[1] || null;
    const timed = T.some((l) => /^native: .*; sets timed: (?:\S+, )*r27w(?:,|$)/.test(l));
    const keys = timed ? { native: keyOf(/^native: this adapter's key for section 66's table: (\S+)$/), page: keyOf(/^page: this adapter's key for section 61's table: (\S+)$/) } : { native: null, page: null };
    const c0 = !!comp && comp.ok === true && !!rep.nodeWebgpu && rep.nodeWebgpu.compiler === "DXC" &&
        rigLines(comp).some((l) => /^native \/ as shipped in all: (\d+) of \1 built; dumps: \1 DXC \(DXIL\); compiler, from the package: DXC;/.test(l));
    const devGreen = !!dev && dev.ok === true && !(dev.fails || []).length;
    const k0w = { native: devGreen && rigLines(dev).some((l) => /^native K0w for round 27's set on .*: r27w green \((\d+) of \1 native rows\)$/.test(l)),
                  page: devGreen && !(dev.skips || []).length && dev.software === false && (dev.adapters || []).some((a) => !/\(native\)$/.test(a)) };
    const top = (a) => (a.length ? a[a.length - 1] : null), out = { key: keys };
    for (const p of ["native", "page"]) {
        const present = keys[p] && Object.hasOwn(RULE83_AT[p], keys[p]) ? RULE83_AT[p][keys[p]] : "r15";
        const k1 = sizeRatios(T, `${p}: r27w against r12 at `), c3 = sizeRatios(T, `${p}: r27w against ${present} at `);
        const conds = [p === "page" || c0, k0w[p], !!tim && tim.ok === true && k1.length > 0 && top(k1).r >= 2 && k1.every((x) => x.r >= 1), !!top(c3) && top(c3).r >= RULE83_MIN];
        const fail = keys[p] ? conds.indexOf(false) : 0;
        out[p] = { present, fail, entry: keys[p] && fail < 0 ? "r27w" : null, c3: top(c3),
                   line: `${p}: K1 ${top(k1) ? top(k1).r + " x at " + top(k1).size : "none"}, ${top(c3) ? top(c3).r + " x " + present + " at " + top(c3).size : "no ratio against " + present}` +
                         `${!keys[p] ? ", no key" : fail < 0 ? ", qualifies" : `, fails condition ${fail}`}` };
    }
    return out;
}
// v4852+ -- SECTION 68'S OUTCOME: tools/denoiseDevice.mjs --which, as the rig printed it (render/denoise-rig-r20-which.txt,
// committed as received). Each run is three lines: the adapter, package and compiler; the key, set and reason; the pass.
function parseWhich(text) {
    const L = String(text).split(/\r?\n/).filter((l) => l.startsWith("[denoiseDevice] --which: ")).map((l) => l.slice(25)), runs = [];
    for (let i = 0; i + 2 < L.length; i += 3) {
        const a = L[i].match(/^adapter ([^/]+) \/ ([^/]+) \/ (.+?); node-webgpu (\S+) from (.+); compiler (\S+)$/);
        const k = L[i + 1].match(/^key (\S+); kernels (\S+) -- (.+)$/);
        const r = L[i + 2].match(/^(\S+) built and ran one 64 x 64 pass in ([\d.]+) ms; worst relative difference from the f64 network on the CPU ([\d.e+-]+)$/);
        runs.push(a && k && r ? { vendor: a[1], architecture: a[2], description: a[3], version: a[4], compiler: a[6], key: k[1], kernels: k[2], why: k[3],
                                  built: r[1], ms: +r[2], worst: +r[3] } : { bad: [L[i], L[i + 1], L[i + 2]] });
    }
    return runs;
}
// Section 68's table, fixed before the rig ran: per GPU, as installed (a package before 0.6.2, so FXC) and with 0.6.2 (DXC)
const WHICH_PREDICTED = Object.freeze([
    { vendor: "intel", dxc: false, key: "win32/intel/gen-9", kernels: "r15", why: /entry is for a DXC run/ },
    { vendor: "intel", dxc: true, key: "win32/intel/gen-9", kernels: "r18u", why: /^section 67's for win32\/intel\/gen-9/ },
    { vendor: "nvidia", dxc: false, key: "win32/nvidia/pascal", kernels: "r15", why: /^no entry for win32\/nvidia\/pascal/ },
    { vendor: "nvidia", dxc: true, key: "win32/nvidia/pascal", kernels: "r15", why: /^no entry for win32\/nvidia\/pascal/ },
]);
// P3's reading: r15's pass on the device's clock under DXC (the native ladder) and under FXC (the FXC child), at the largest size both reached
function r15DxcOverFxc(rep) {
    const T = rigLines(rigGate(rep, "denoiseTiming")), at = (head) => new Map(T.map((l) => l.startsWith(head) && l.slice(head.length).match(/^(\d+ x \d+): .*?on the device's clock ([\d.]+) ms/))
        .filter(Boolean).map((m) => [m[1], +m[2]]));
    const dxc = at("native r15: "), fxc = at("native FXC r15: ");
    const both = [...dxc.keys()].filter((k) => fxc.has(k)).sort((a, b) => a.split(" x ").reduce((p, v) => p * v, 1) - b.split(" x ").reduce((p, v) => p * v, 1));
    const size = both[both.length - 1];
    return size ? { size, dxc: dxc.get(size), fxc: fxc.get(size) } : null;
}
const t0 = Date.now();
const worstRel = (a, b, eps = 1e-30) => { let w = 0; for (let i = 0; i < a.length; i++) w = Math.max(w, Math.abs(a[i] - b[i]) / (Math.abs(b[i]) + eps)); return w; };

// a synthetic input: irradiance in [0, 2), albedo in [0, 1) with some below the floor, normals, and -- with 10
// channels -- an emitter mask with two values, so the kernel must refuse taps across it. Odd sizes: partial workgroups.
function synth(h, w, C, seed) {
    const r = seededRandom(seed), x = new Float64Array(h * w * C);
    for (let p = 0; p < h * w; p++) {
        for (let c = 0; c < 3; c++) x[p * C + c] = r.u() * 2;
        for (let c = 3; c < 6; c++) x[p * C + c] = r.u() < 0.1 ? 0.001 : r.u();
        for (let c = 6; c < 9; c++) x[p * C + c] = r.u() * 2 - 1;
        if (C === 10) x[p * C + 9] = (p % w) < w / 3 ? 1 : (p % 13 === 0 ? 0.5 : 0);
    }
    return x;
}
const HH = 21, WW = 19;

console.log("1. THE KERNEL'S TWIN, ON THE CPU");
{
    const net = makeDenoiser(3, "he", "kernel", 10, "large"), x = synth(HH, WW, 10, 7);
    const ref = denoise(net, x, HH, WW), twin = denoiseTwin(net, x, HH, WW);
    const w = worstRel(twin.y, ref.y, 1e-12);
    ok("!! the whole f32 twin -- conv2dCpu layer by layer, then kernelApplyCpu -- is the f64 network's output within f32 rounding", w > 0 && w < 1e-5, `worst relative ${w.toExponential(2)}`);
    // v4868 -- round 27 (section 83): the whole twin of the Winograd set, through the twins its layers answer to (twinsOf)
    const tw27 = denoiseTwin(net, x, HH, WW, "r27w"), w27 = worstRel(tw27.y, ref.y, 1e-12);
    ok("!! round 27 (section 83): the r27w twin -- conv2dCpuWino for the hidden layers, conv2dCpu for the head, then kernelApplyCpu -- is the f64 network's output within the same 1e-5, and not r15's twin's bits",
        w27 > 0 && w27 < 1e-5 && tw27.acts[0].some((v, i) => !Object.is(v, twin.acts[0][i])), `worst relative ${w27.toExponential(2)} (r15's twin ${w.toExponential(2)})`);
    // the twin's kernel on the f64 network's own logits: only f32 rounding between them
    const logits = Float32Array.from(ref.acts[ref.acts.length - 1]), ya = kernelApplyCpu(x, logits, HH, WW);
    ok("  kernelApplyCpu on the f64 network's logits is its kernel within f32 rounding -- borders, mask and albedo floor included", worstRel(ya, ref.y, 1e-12) < 1e-5);
    // the mask: with the far side of the mask made enormous, a pixel on the near side must not see it
    const xm = Float64Array.from(x);
    for (let p = 0; p < HH * WW; p++) if (xm[p * 10 + 9] === 1) for (let c = 0; c < 3; c++) xm[p * 10 + c] = 1e6;
    const ym = kernelApplyCpu(xm, logits, HH, WW);
    let leaked = 0; for (let p = 0; p < HH * WW; p++) if (xm[p * 10 + 9] !== 1 && ym[p * 3] > 1e3) leaked++;
    ok("  a tap across the emitter mask is never weighed: made a million times brighter, the mask's far side leaks into no pixel", leaked === 0 && ym.some((v, i) => v > 1e3));
    const u9 = new Uint32Array(packApplyUniforms({ H: 2, W: 3, C: 9 }).buffer), u10 = new Uint32Array(packApplyUniforms({ H: 2, W: 3, C: 10 }).buffer);
    ok("  the uniform block: H, W, C, the mask channel -- 9 with the mask, none (0xffffffff) without -- and the floor as an f32",
        u10[0] === 2 && u10[1] === 3 && u10[2] === 10 && u10[3] === 9 && u9[3] === 0xffffffff && new Float32Array(u10.buffer)[4] === Math.fround(ALBEDO_FLOOR));
    const L = deviceLayers(net, "r12");
    ok(`!! the large network's four hidden layers run TILED and its head of ${KERNEL_TAPS} logits DIRECT -- past the tiled kernel's COUT_MAX ${COUT_MAX}, on the kernel that never had one`,
        L.map((l) => l.kernel).join() === "tiled,tiled,tiled,tiled,direct" && L[4].Cout === KERNEL_TAPS && KERNEL_TAPS > COUT_MAX &&
        kernelFor({ k: 3, Cout: COUT_MAX }, "r12") === "tiled" && kernelFor({ k: 3, Cout: COUT_MAX + 1 }, "r12") === "direct" && kernelFor({ k: 5, Cout: 4 }, "r12") === "direct");
    const L13 = deviceLayers(net, "r13");
    let noSet = null; try { kernelFor({ k: 3, Cout: 4, Cin: 4 }, "r16"); } catch (e) { noSet = e.message; }
    const L14 = deviceLayers(net, "r14"), L14s = deviceLayers(makeDenoiser(4, "he", "kernel", 9), "r14");
    ok(`!! round 14: the r14 set runs the hidden layers on the fast kernel and the ${KERNEL_TAPS}-logit head -- the last layer only -- on the head kernel, then k_apply_fast; ` +
       `r12 and r13 keep k_apply (section 49 put the default on r14 and the page on r13; section 50 moved both to r15)`,
        L14.map((l) => l.kernel).join() === "fast,fast,fast,fast,head" && applyFor(L14) === "apply_fast" && applyFor(L13) === "apply" && applyFor(L) === "apply" &&
        L14s.map((l) => l.kernel).join() === "fast,fast,fast,head" && kernelFor({ Cin: 32, Cout: 81, k: 1 }, "r14", false) === "fast",
        `${L14.map((l) => l.kernel).join()} + ${applyFor(L14)}; a 1 x 1 layer that is not the last stays on the fast kernel`);
    ok(`!! round 13: the r13 set runs every layer of the large network on the fast kernel, the ${KERNEL_TAPS}-logit head among them (section 39)`,
        L13.map((l) => l.kernel).join() === "fast,fast,fast,fast,fast" && KERNEL_SETS.join() === "r12,r13,r14,r15,r18t,r18u,r27w,r40s,r41h" &&
        kernelFor({ Cin: 64, Cout: 32, k: 3 }, "r13") === "tiled" && /no kernel set "r16"/.test(noSet || ""),
        "a layer too big for one uniform binding (64 -> 32 at 3 x 3) falls back to its r12 kernel; an unknown set is refused by name");
    const L15 = deviceLayers(net, "r15"), L15s = deviceLayers(makeDenoiser(4, "he", "kernel", 9), "r15");
    let noFuse = null; try { kernelHeadApplyWgsl({ Cin: 32, Cout: 6, k: 1 }); } catch (e) { noFuse = e.message; }
    const code15 = kernelHeadApplyWgsl(L15[4]);
    ok(`!! round 15: the r15 set runs the hidden layers on the fast kernel and the ${KERNEL_TAPS}-logit head WITH the kernel apply as one pass, k_head_apply -- no apply pass of its own; by section 46's rules on both GPUs it is the default and the page (section 50)`,
        DEFAULT_KERNELS === "r15" && PAGE_KERNELS === "r15" && deviceLayers(net).map((l) => l.kernel).join() === L15.map((l) => l.kernel).join() &&
        L15.map((l) => l.kernel).join() === "fast,fast,fast,fast,head_apply" && applyFor(L15) === "head_apply" && L15s.map((l) => l.kernel).join() === "fast,fast,fast,head_apply" &&
        kernelFor({ Cin: 32, Cout: 81, k: 1 }, "r15", false) === "fast" && kernelFor({ Cin: 32, Cout: 6, k: 1 }, "r15", true) === "fast" && /fused head holds a 1 x 1 layer of 81 logits/.test(noFuse || ""),
        `${L15.map((l) => l.kernel).join()}; a 1 x 1 layer that is not the last, or not of ${KERNEL_TAPS} logits, stays on the fast kernel -- and the generator refuses one by name`);
    {
        // round 18 (section 61): the two page sets' layers, and the kernels they generate -- round 17's probe shapes
        const Lt = deviceLayers(net, "r18t"), Lu = deviceLayers(net, "r18u"), Lts = deviceLayers(makeDenoiser(4, "he", "kernel", 9), "r18t");
        const T = R18_KERNELS.r18t.cfg, U = R18_KERNELS.r18u.cfg, ct = conv2dTileWgsl(Lt[1], T), cu = conv2dFastAltWgsl(Lu[1], U);
        ok(`!! round 18: r18t runs every hidden layer on the pixel-tiled kernel at 2 pixels x 8 vec4s, edge zero, weights inline; r18u on the fast kernel with a block written out; both the ${KERNEL_TAPS}-logit head as r15 does -- k_head_apply, one pass`,
            Lt.map((l) => l.kernel).join() === "tile_inline,tile_inline,tile_inline,tile_inline,head_apply" && Lu.map((l) => l.kernel).join() === "fast_unroll,fast_unroll,fast_unroll,fast_unroll,head_apply" &&
            applyFor(Lt) === "head_apply" && applyFor(Lu) === "head_apply" && Lts.map((l) => l.kernel).join() === "tile_inline,tile_inline,tile_inline,head_apply" &&
            T.px === 2 && T.g4 === 8 && T.edge === "zero" && T.weights === "inline" && U.reads === "f32" && U.unroll === true && Object.isFrozen(T) && Object.isFrozen(U) &&
            tileShape(Lt[1], T).groups === 1 && fastAltShape(Lu[0], U).blocks === 2 && fastAltShape(Lu[1], U).blocks === 4 &&
            /fn k_conv_tile/.test(ct) && !/let w\d+ = F\.w/.test(ct) && /fn k_conv_fast_alt/.test(cu) && kernelFor({ Cin: 64, Cout: 32, k: 3 }, "r18t") === "tiled" && kernelFor({ Cin: 64, Cout: 32, k: 3 }, "r18u") === "tiled",
            `${Lt.map((l) => l.kernel).join()} / ${Lu.map((l) => l.kernel).join()}; a layer too big for one uniform binding falls back as in r15`);
        // v4868 -- round 27 (section 83): the Winograd set's layers, the twin each is judged against, and the kernel it generates
        const Lw = deviceLayers(net, "r27w"), Lws = deviceLayers(makeDenoiser(4, "he", "kernel", 9), "r27w"), Cw = R27_KERNELS.r27w.cfg, cw = conv2dWinoWgsl(Lw[1], Cw);
        ok(`!! round 27 (section 83): r27w runs every hidden 3 x 3 layer on the Winograd kernel at one vec4 a thread and the ${KERNEL_TAPS}-logit head as r15 does -- k_head_apply; a layer the kernel cannot hold (1 x 1 not last, 5 x 5) falls back to r15's kernel; and twinsOf holds a Winograd layer to conv2dCpuWino and its mirror, every other to conv2dCpu and its`,
            Lw.map((l) => l.kernel).join() === "wino,wino,wino,wino,head_apply" && applyFor(Lw) === "head_apply" && Lws.map((l) => l.kernel).join() === "wino,wino,wino,head_apply" &&
            Cw.g4 === 1 && Object.isFrozen(Cw) && Object.isFrozen(R27_KERNELS) && winoShape(Lw[0], Cw).groups === 8 && /fn k_conv_wino/.test(cw) &&
            kernelFor({ Cin: 32, Cout: 32, k: 1 }, "r27w") === "fast" && kernelFor({ Cin: 4, Cout: 4, k: 5 }, "r27w") === "fast" &&
            twinsOf(Lw[0]).twin === conv2dCpuWino && twinsOf(Lw[0]).mirror === conv2dCpuWinoFma && twinsOf(Lw[4]).twin === conv2dCpu && twinsOf(L15[0]).twin === conv2dCpu && twinsOf(L15[0]).mirror === conv2dCpuFma,
            `${Lw.map((l) => l.kernel).join()}; small network ${Lws.map((l) => l.kernel).join()}`);
        // round 40 (section 108): the subgroup set's layers -- the first layer's 10 channels are not whole blocks of 8, so r15's kernel;
        // the small network's 9 the same and its 16 hidden channels two blocks -- and which adapters may run it at all
        const Ls = deviceLayers(net, "r40s"), Lss = deviceLayers(makeDenoiser(4, "he", "kernel", 9), "r40s"), Cs = R40_KERNELS.r40s.cfg;
        const withSg = { features: new Set(["subgroups", "timestamp-query"]) }, without = { features: new Set(["timestamp-query"]) };
        ok(`!! round 40 (section 108): r40s runs every hidden layer the subgroup kernel holds on it at 2 rows x 8 vec4s, the first layer (10 channels, not whole blocks) on r15's fast kernel, and the ${KERNEL_TAPS}-logit head as r15 does; it needs the subgroups feature, and featureSetsFor leaves it out of an adapter without it, by name of the set alone`,
            Ls.map((l) => l.kernel).join() === "fast,sub,sub,sub,head_apply" && applyFor(Ls) === "head_apply" && Lss.map((l) => l.kernel).join() === "fast,sub,sub,head_apply" &&
            Cs.rows === 2 && Cs.g4 === 8 && Object.isFrozen(Cs) && Object.isFrozen(R40_KERNELS) && SUBGROUP_SETS.join() === "r40s" && Object.isFrozen(SUBGROUP_SETS) &&
            kernelFor({ Cin: 10, Cout: 32, k: 3 }, "r40s") === "fast" && kernelFor({ Cin: 32, Cout: 32, k: 1 }, "r40s") === "sub" && twinsOf(Ls[1]).twin === conv2dCpu && twinsOf(Ls[1]).mirror === conv2dCpuFma &&
            featureSetsFor(withSg, KERNEL_SETS).join() === KERNEL_SETS.filter((s) => s !== "r41h").join() && featureSetsFor(without, KERNEL_SETS).join() === KERNEL_SETS.filter((s) => s !== "r40s" && s !== "r41h").join() &&
            featureSetsFor(null, ["r15", "r40s"]).join() === "r15" && featureSetsFor({}, ["r40s"]).length === 0,
            `${Ls.map((l) => l.kernel).join()}; small network ${Lss.map((l) => l.kernel).join()}; without subgroups: ${featureSetsFor(without, KERNEL_SETS).join(",")}`);
        // round 41 (section 109): the half-precision set's layers, its feature, the twin it answers to -- and its image on the CPU against
        // the f64 network: within F16_IMAGE_TOL, and NOT within f32 rounding, which is why it has a bound of its own
        const Lh = deviceLayers(net, "r41h"), Lhs = deviceLayers(makeDenoiser(4, "he", "kernel", 9), "r41h"), Ch = R41_KERNELS.r41h.cfg;
        const withF16 = { features: new Set(["shader-f16"]) }, xh = synth(HH, WW, 10, 7), yh = denoiseTwin(net, xh, HH, WW, "r41h").y, y64 = denoise(net, xh, HH, WW).y, wh = worstRel(yh, y64, 1e-12);
        ok(`!! round 41 (section 109): r41h runs every layer r18u writes out on the half-precision kernel (fast_unroll_h: f16 arithmetic, f32 reads, packed f16 weights) and the ${KERNEL_TAPS}-logit head as r15 does, in f32; it needs shader-f16; twinsOf holds a half-precision layer to conv2dCpuF16 and its mirror -- and its twin's image is within F16_IMAGE_TOL of the f64 network, and not within f32 rounding`,
            Lh.map((l) => l.kernel).join() === "fast_unroll_h,fast_unroll_h,fast_unroll_h,fast_unroll_h,head_apply" && Lhs.map((l) => l.kernel).join() === "fast_unroll_h,fast_unroll_h,fast_unroll_h,head_apply" &&
            Ch.arith === "f16" && Ch.unroll === true && Ch.reads === "f32" && Object.isFrozen(Ch) && Object.isFrozen(R41_KERNELS) && F16_SETS.join() === "r41h" && SET_FEATURES.r41h === "shader-f16" && SET_FEATURES.r40s === "subgroups" &&
            twinsOf(Lh[0]).twin === conv2dCpuF16 && twinsOf(Lh[0]).mirror === conv2dCpuF16Fma && twinsOf(Lh[4]).twin === conv2dCpu &&
            featureSetsFor(withF16, KERNEL_SETS).join() === KERNEL_SETS.filter((s) => s !== "r40s").join() && F16_IMAGE_TOL === 1e-2 && wh <= F16_IMAGE_TOL && wh > 1e-5,
            `${Lh.map((l) => l.kernel).join()}; its twin against the f64 network ${wh.toExponential(2)} (bound ${F16_IMAGE_TOL}); with shader-f16 only: ${featureSetsFor(withF16, KERNEL_SETS).join(",")}`);
        // v4849 -- round 19 (section 66): which sets a native gate builds, by the run's compiler as well as its adapter. Round 18's
        // row here ("r18t and r18u are browser-only on D3D12") held the adapter alone. On 0.6.2 the rig's descriptions are "D3D12
        // driver version ..." under either compiler, so the compiler comes from the package (headlessGpu's nativeCompiler: "DXC" or
        // "FXC") or a dump (denoiseCompile's dumpStats: "DXC (DXIL)", "FXC (DXBC)", "unknown (no dump)"). This box has no D3D12, so
        // the DXC and FXC branches are held HERE, on stub adapters with the rig's own descriptions -- the 1080's and the Intel's.
        const d3d = { info: { vendor: "intel", architecture: "gen-9", description: "D3D12 driver version 31.0.101.2137" } }, vk = { info: { vendor: "google", architecture: "swiftshader", description: "Vulkan" } };
        const d3n = { info: { vendor: "nvidia", architecture: "pascal", description: "D3D12 driver version 32.0.15.8180" } }, FOUR = "r12,r13,r14,r15", SIX = KERNEL_SETS.join();
        // undefined is the two-argument call (no options at all); null and "" a compiler not read
        const FXC_SAID = [undefined, null, "", "FXC", "FXC (DXBC)", "unknown (no dump)"], DXC_SAID = ["DXC", "DXC (DXIL)"];
        const setsBy = (a, c) => (c === undefined ? nativeSetsFor(a, KERNEL_SETS) : nativeSetsFor(a, KERNEL_SETS, { compiler: c })).join();
        const said = (c) => (c === undefined ? "(no options)" : JSON.stringify(c));
        ok("!! round 19 (section 66): FXC builds neither round-18 set -- on a D3D12 adapter, a run whose compiler is FXC (the package's \"FXC\", the dump's \"FXC (DXBC)\"), unknown, or not named at all builds r12-r15 natively and never FXC_UNBUILT_SETS (nor, since round 27, FXC_UNTRIED_SETS)",
            FXC_UNBUILT_SETS.join() === "r18t,r18u" && Object.isFrozen(FXC_UNBUILT_SETS) && isD3D12Native(d3d) && isD3D12Native(d3n) && !isD3D12Native(vk) &&
            !isD3D12Native({ info: { vendor: "intel", architecture: "gen-9" } }) && !isD3D12Native(null) && [d3d, d3n].every((a) => FXC_SAID.every((c) => setsBy(a, c) === FOUR)),
            `on the 1080's description: ${FXC_SAID.map((c) => `${said(c)} ${setsBy(d3n, c)}`).join("; ")} -- section 60: 0.6.0's FXC stopped on r18t's kernel at 3 minutes and crashed on r18u's, on both GPUs`);
        ok("!! round 19 (section 66): DXC builds both -- on a D3D12 adapter, a run whose compiler is DXC (the package's \"DXC\", the dump's \"DXC (DXIL)\") builds every set natively, r27w among them; an adapter that is not D3D12 builds every set whatever compiler is named, and a browser's adapter is never asked",
            [d3d, d3n].every((a) => DXC_SAID.every((c) => setsBy(a, c) === SIX)) && [...FXC_SAID, ...DXC_SAID].every((c) => setsBy(vk, c) === SIX) && nativeSetsFor(vk, KERNEL_SETS) !== KERNEL_SETS,
            `on the 1080's description: ${DXC_SAID.map((c) => `${said(c)} ${setsBy(d3n, c)}`).join("; ")}; Vulkan under "FXC": ${setsBy(vk, "FXC")} -- section 65: 0.6.2's DXC built both in seconds, exact, on both GPUs`);
        const notDxc = ["FXC", "FXC (DXBC)", "unknown (no dump)", "", null, undefined, "dxc", "DXCompiler", "not DXC", "SPIR-V"];
        ok("  round 19: isDxcCompiler is DXC as the package names it (\"DXC\") or a dump reads it (\"DXC (DXIL)\"), and nothing else -- not FXC, unknown, none, a lower-case name, a longer word, or DXC named second",
            DXC_SAID.every((c) => isDxcCompiler(c) === true) && notDxc.every((c) => isDxcCompiler(c) === false),
            `true for ${DXC_SAID.map(said).join(", ")}; false for ${notDxc.map(said).join(", ")}`);
        // v4868 -- round 27 (section 83): r27w was never built under FXC, so it stands aside there on the safe side -- a list of its own,
        // since FXC_UNBUILT_SETS is the sets FXC was SEEN to fail (section 60)
        // round 40 (section 108): and r40s, whose wave operations FXC cannot compile at all
        ok("!! round 27 (section 83), round 40 (section 108) and round 41 (section 109): FXC_UNTRIED_SETS is r27w, r40s and r41h, and nativeSetsFor drops them on a D3D12 adapter under FXC, an unknown compiler or none, keeps them under DXC, and keeps them off D3D12 under anything",
            FXC_UNTRIED_SETS.join() === "r27w,r40s,r41h" && Object.isFrozen(FXC_UNTRIED_SETS) && ["r27w", "r40s", "r41h"].every((t) => !FXC_UNBUILT_SETS.includes(t)) &&
            ["r27w", "r40s", "r41h"].every((t) => [d3d, d3n].every((a) => FXC_SAID.every((c) => !setsBy(a, c).split(",").includes(t)) && DXC_SAID.every((c) => setsBy(a, c).split(",").includes(t))) &&
                [...FXC_SAID, ...DXC_SAID].every((c) => setsBy(vk, c).split(",").includes(t))),
            `the 1080 under "FXC": ${setsBy(d3n, "FXC")}; under "DXC": ${setsBy(d3n, "DXC")}`);
        // v4849 -- round 19 (section 66): the native set by adapter, for a DXC run only, keyed as the timing gate prints it.
        // v4852 -- section 67 read the rule off both GPUs' round-19 runs; the verdict rows below derive the table from them.
        const nk = { "win32/nvidia/pascal": "r18t" }, keyN = nativeAdapterKey(d3n.info, "win32");
        ok("!! round 19 (section 66): NATIVE_KERNELS_BY_ADAPTER is frozen, and a native adapter's key is Node's platform, its vendor and its architecture, none without a platform or a vendor",
            Object.isFrozen(NATIVE_KERNELS_BY_ADAPTER) && keyN === "win32/nvidia/pascal" &&
            nativeAdapterKey(d3d.info, "win32") === "win32/intel/gen-9" && nativeAdapterKey(vk.info, "linux") === "linux/google/swiftshader" && nativeAdapterKey({ vendor: "intel" }, "win32") === "win32/intel/" &&
            nativeAdapterKey(d3n.info, undefined) === null && nativeAdapterKey(d3n.info, "") === null && nativeAdapterKey({}, "win32") === null && nativeAdapterKey(null, "win32") === null,
            `${JSON.stringify(NATIVE_KERNELS_BY_ADAPTER)}; the 1080's key ${keyN}`);
        ok("!! round 19 (section 66): nativeKernelsFor gives a table's set for a key it names under DXC ONLY -- DEFAULT_KERNELS (r15, a set FXC builds) under FXC, unknown or no compiler, for a key the table does not name, for no key, and from the shipped table",
            DXC_SAID.every((c) => nativeKernelsFor(keyN, c, nk) === "r18t") && FXC_SAID.every((c) => nativeKernelsFor(keyN, c, nk) === DEFAULT_KERNELS) &&
            nativeKernelsFor("win32/intel/gen-9", "DXC", nk) === DEFAULT_KERNELS && nativeKernelsFor(null, "DXC", nk) === DEFAULT_KERNELS && nativeKernelsFor("constructor", "DXC", nk) === DEFAULT_KERNELS &&
            nativeKernelsFor(keyN, "DXC") === "r18t" && FXC_SAID.every((c) => nativeKernelsFor(keyN, c) === DEFAULT_KERNELS) && nativeKernelsFor("constructor", "DXC") === DEFAULT_KERNELS &&
            nativeKernelsFor("win32/intel/gen-9", "DXC") === "r18u" && FXC_SAID.every((c) => nativeKernelsFor("win32/intel/gen-9", c) === DEFAULT_KERNELS) &&
            DEFAULT_KERNELS === "r15" && nativeSetsFor(d3n, [DEFAULT_KERNELS], { compiler: "FXC" }).length === 1,
            `a fixture table ${JSON.stringify(nk)}: ${[...DXC_SAID, "FXC", null].map((c) => `${said(c)} ${nativeKernelsFor(keyN, c, nk)}`).join(", ")}; the shipped table under "DXC": the 1080 ${nativeKernelsFor(keyN, "DXC")}, the Intel ${nativeKernelsFor("win32/intel/gen-9", "DXC")}, the Intel under "FXC" ${nativeKernelsFor("win32/intel/gen-9", "FXC")}`);
        // v4852 -- round 20 (section 68): the native caller's pick, as denoise.html picks the page's -- on the rig's own adapters, stubbed
        const pick = (a, c, plat = "win32", table) => nativePick(a, { compiler: c, platform: plat, ...(table ? { table } : {}) });
        const pI = pick(d3d, "DXC"), pIF = pick(d3d, "FXC"), pIN = pick(d3d, null), pN = pick(d3n, "DXC"), pNF = pick(d3n, "FXC"), pV = pick(vk, null, "linux"), p0 = pick(null, "DXC");
        // v4862 -- the 1080 under DXC takes section 78's r18t now; under FXC it is DEFAULT_KERNELS like the Intel. Each reason names its section.
        ok("!! round 20 (section 68): nativePick takes section 67's set for the Intel and section 78's for the 1080 under DXC, and r15 for either under FXC or an unread compiler, off win32 and with no adapter -- and says which",
            pI.key === "win32/intel/gen-9" && pI.kernels === "r18u" && /^section 67's for win32\/intel\/gen-9/.test(pI.why) &&
            [pIF, pIN, pNF].every((p) => p.kernels === DEFAULT_KERNELS && /entry is for a DXC run/.test(p.why)) && pN.kernels === "r18t" && /^section 78's for win32\/nvidia\/pascal/.test(pN.why) &&
            pV.key === "linux/google/swiftshader" && pV.kernels === DEFAULT_KERNELS && p0.key === null && p0.kernels === DEFAULT_KERNELS && /^no key/.test(p0.why) &&
            typeof createNativeDenoiser === "function",
            [pI, pIF, pIN, pN, pV, p0].map((p) => `${p.key || "(no key)"} ${p.kernels}`).join("; "));
        // v4849 -- round 19: tools/denoiseDevice.mjs's --measure-r18t and --measure-r18u built natively through mod.create([]) and never
        // asked the compiler: on a D3D12 adapter under FXC the build stops or crashes an image in (section 60). No gate runs that CLI
        // (section 35's measurements are one command each), so this reads its source: the compiler read with the flags its device
        // is made with, and a set nativeSetsFor drops refused -- exit 2, naming SWEK_WEBGPU -- before any image is built
        {
            // v4852 -- the --measure branch only: --which (section 68) makes its own device and reads its own compiler before it
            const cliAll = fs.readFileSync(path.join(ENG, "tools", "denoiseDevice.mjs"), "utf8"), cli = cliAll.slice(Math.max(0, cliAll.indexOf("} else if (measure) {")));
            const iRead = cli.search(/GPU\.nativeCompiler\(\{ pkg, platform: process\.platform, flags: FLAGS \}\)/), iMake = cli.indexOf("W.mod.create([...FLAGS])");
            const iAsk = cli.search(/if \(!nativeSetsFor\(\w+, \[kernels\], \{ compiler \}\)\.length\)/), iBuild = cli.indexOf("createDeviceDenoiser(dev,");
            const refusal = iAsk > 0 ? cli.slice(iAsk, cli.indexOf("\n    }", iAsk)) : "";
            ok("  round 19: tools/denoiseDevice.mjs reads its run's compiler with its own device's flags, and refuses a set nativeSetsFor drops -- exit 2, one line naming SWEK_WEBGPU's remedy -- before any image is built",
                iRead > 0 && iMake > iRead && iAsk > iMake && iBuild > iAsk && (cli.match(/\bmod\.create\(/g) || []).length === 1 && /GPU\.exitCleanly\(2\)/.test(refusal) && /GPU\.WEBGPU_ENV/.test(refusal),
                `compiler read at ${iRead}, the device made at ${iMake}, the refusal at ${iAsk}, the first build at ${iBuild}`);
            // v4868 -- round 27 (section 83): --measure-r27w is K0w (a), and nothing runs it but a person -- so its source is read: the flag
            // names r27w and its own results file, every hidden layer is judged against the pair twinsOf names (never conv2dCpu by name,
            // which would call every Winograd cell unexplained), and D4, the restated key, is in the file at D4_REL 1e-5
            const flag = /"--measure-r27w": \{ kernels: "r27w", results: RESULTS_R27W \}/.test(cliAll) && /RESULTS_R27W = "render\/denoise-results-r27w\.json"/.test(cliAll);
            const judged = /T = twinsOf\(L\), tw = T\.twin\(input, image, image, L\), fm = T\.mirror\(input, image, image, L\)/.test(cli) && !/\bconv2dCpu(Fma)?\(/.test(cli);
            const d4 = /const D4_REL = 1e-5;/.test(cliAll) && /D4: \{ ok: D4 <= D4_REL, worst: D4,/.test(cli) && /imageWorst = Math\.max\(imageWorst, Math\.abs\(out\.y\[c\] - y64\[c\]\) \/ \(Math\.abs\(y64\[c\]\) \+ 1e-12\)\)/.test(cli);
            ok("  round 27 (section 83): tools/denoiseDevice.mjs --measure-r27w writes its own file, judges every hidden layer against the twin its kernel answers to (twinsOf), and carries D4, the image within 1e-5 of the f64 network on every value",
                flag && judged && d4, `flag ${flag}, twinsOf ${judged}, D4 ${d4}`);
        }
        // v4852 -- ROUND 19'S VERDICT (section 67): section 66's rule, written as code and read off the two committed rig reports
        // (render/denoise-rig-r19-*.json: realGpuRun --only denoise, SWEK_WEBGPU naming node-webgpu 0.6.2, at v4851's release commit).
        // The table is DERIVED from them here, not retyped: a changed report, a changed rule or a changed table each turns a row red.
        {
            const rig = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "render", f), "utf8"));
            const R19 = { intel: rig("denoise-rig-r19-intel-gen9.json"), gtx1080: rig("denoise-rig-r19-gtx1080.json") };
            const r66 = rule66Entries(R19.intel).concat(rule66Entries(R19.gtx1080));
            const got = r66.filter((e) => e.entry).map((e) => [e.key, e.entry]);
            for (const e of r66) console.log(`  ----  section 66 on ${e.key}: ${e.lines.join("; ")} -> ${e.entry || "no entry"}`);
            ok("!! *** round 19's verdict (section 67): NATIVE_KERNELS_BY_ADAPTER is section 66's rule read off both GPUs' round-19 reports -- r18u for the Intel gen-9, nothing for the GTX 1080 -- and nothing else ***",
                JSON.stringify(Object.entries(NATIVE_KERNELS_AT_V4852).sort()) === JSON.stringify(got.sort()) && got.length === 1 && got[0][0] === "win32/intel/gen-9" && got[0][1] === "r18u" &&
                got.every(([k, v]) => NATIVE_KERNELS_BY_ADAPTER[k] === v) &&
                r66.length === 2 && r66.every((e) => e.key) && Object.values(NATIVE_KERNELS_BY_ADAPTER).every((v) => TIMED_SETS.includes(v) && FXC_UNBUILT_SETS.includes(v)) && DEFAULT_KERNELS === "r15",
                `the table as round 19 left it, ${JSON.stringify(NATIVE_KERNELS_AT_V4852)}, against the rule's ${JSON.stringify(Object.fromEntries(got))}; the shipped table keeps it`);
            // the rule DISCRIMINATES: the 1080's report with r18t's unpaired FXC ratio at its largest size moved over 1.05 gives r18t,
            // the Intel's with r18u's FXC ratio moved under gives nothing, and a report with no key gives no entry
            const lift = JSON.parse(JSON.stringify(R19.gtx1080)), drop = JSON.parse(JSON.stringify(R19.intel)), nokey = JSON.parse(JSON.stringify(R19.intel));
            const edit = (rep, re, to) => { for (const g of rep.gates) g.measured = (g.measured || []).map((l) => (re.test(l) ? l.replace(/: [\d.]+ x as fast/, `: ${to} x as fast`) : l)); };
            edit(lift, /^native: r18t against r15 under FXC at 1920 x 1080/, "1.060");
            edit(drop, /^native: r18u against r15 under FXC at 1024 x 1024/, "1.040");
            for (const g of nokey.gates) g.measured = (g.measured || []).filter((l) => !/key for section 66's table/.test(l));
            const [eL] = rule66Entries(lift), [eD] = rule66Entries(drop), [eN] = rule66Entries(nokey);
            ok("  ...and the rule discriminates: condition 4 alone moves the 1080 to r18t and the Intel to nothing, and a report with no key gets no entry",
                eL.entry === "r18t" && eD.entry === null && eN.entry === null && eN.key === null,
                `1080 with r18t at 1.060 x under FXC: ${eL.entry}; the Intel with r18u at 1.040 x under FXC: ${eD.entry}; no key: ${eN.entry}`);
            // section 66's predictions, fixed before the run: P1 the Intel's entry is r18u; P2 the 1080 gets none; P3 r15 runs slower under DXC
            // than under FXC on both GPUs at their largest common size
            const p3 = [R19.intel, R19.gtx1080].map(r15DxcOverFxc);
            ok("  section 66's predictions, read off the same reports: P1 (the Intel's entry is r18u), P2 (the 1080 gets none, by condition 4), P3 (r15 slower under DXC than FXC on both)",
                r66[0].entry === "r18u" && r66[1].entry === null && r66[1].fail.r18t === 4 && r66[1].fail.r18u === 3 && r66[0].fail.r18t === 3 && r66[0].fail.r18u === -1 && p3.every((p) => p && p.dxc > p.fxc),
                p3.map((p) => p ? `r15 at ${p.size}: ${p.dxc} ms under DXC, ${p.fxc} ms under FXC` : "unread").join("; "));
        }
        // v4861 -- ROUND 24'S VERDICT (section 76): section 75's rule -- conditions 0 to 3, in BOTH of a GPU's two runs -- read off the
        // four committed reports (render/denoise-rig-r24-{a,b}-*.json, realGpuRun --only denoise at v4860's release, SWEK_WEBGPU cleared).
        // Run b crashed on both GPUs (0xC0000005: two FXC-mode build children on the 1080, the native caller on the Intel), each gate
        // that held the crash went red, and under the strict reading a red gate fails its condition. So no set qualifies on the 1080 in
        // both runs and the table is unchanged; the Intel is the control and its entry is not re-decided (section 75).
        // SABOTAGED v4861: rule66Entries' condition 0 back to the prose's "the row is green" (comp.ok dropped) -> 1 RED, this row (the
        //   discrimination row sets run b's gate green itself, so it stands); NATIVE_KERNELS_BY_ADAPTER given "win32/nvidia/pascal": "r18t"
        //   -> 5 RED (this row, round 19's verdict, the two nativeKernelsFor/nativePick rows, and section 68's --which outcome); each restored, md5 verified.
        {
            const rig = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "render", f), "utf8"));
            const R24 = { intel: ["a", "b"].map((r) => rig(`denoise-rig-r24-${r}-intel-gen9.json`)), gtx1080: ["a", "b"].map((r) => rig(`denoise-rig-r24-${r}-gtx1080.json`)) };
            const runs = Object.fromEntries(Object.entries(R24).map(([k, reps]) => [k, reps.map((r) => rule66Entries(r, { fxc: false })[0])]));
            const both = (rs) => (rs.every((e) => e.key === rs[0].key && e.entry) && rs.every((e) => e.entry === rs[0].entry) ? rs[0].entry : null);
            for (const [k, rs] of Object.entries(runs)) console.log(`  ----  section 75 on ${rs[0].key}: ${rs.map((e, i) => `run ${"ab"[i]} ${e.entry || "none"} (${e.lines.join("; ")})`).join(" | ")}`);
            ok("!! *** round 24's verdict (section 76): read strictly, no set holds section 75's conditions in both of the 1080's runs -- run b's compile gate crashed -- so the 1080 keeps no entry and the table is unchanged ***",
                runs.gtx1080[0].entry === "r18t" && runs.gtx1080[1].entry === null && runs.gtx1080[1].fail.r18t === 0 && both(runs.gtx1080) === null &&
                runs.intel[0].entry === "r18u" && runs.intel[1].entry === null && runs.intel[1].fail.r18u === 1 &&
                JSON.stringify(NATIVE_KERNELS_AT_V4852) === JSON.stringify({ "win32/intel/gen-9": "r18u" }),
                `1080: run a ${runs.gtx1080[0].entry}, run b ${runs.gtx1080[1].entry} (fails condition ${runs.gtx1080[1].fail.r18t}); Intel: run a ${runs.intel[0].entry}, run b ${runs.intel[1].entry} (fails condition ${runs.intel[1].fail.r18u})`);
            // and it discriminates: with run b's compile gate green, r18t holds in both and the 1080 would take it; and condition 4 dropped
            // is what moves it -- the same run a under section 66's rule gives the 1080 nothing
            const fixed = JSON.parse(JSON.stringify(R24.gtx1080[1])); rigGate(fixed, "denoiseCompile").ok = true;
            const [eF] = rule66Entries(fixed, { fxc: false }), [e66] = rule66Entries(R24.gtx1080[0]);
            ok("  ...and the rule discriminates: run b with its compile gate green gives r18t in both runs, and run a under section 66's rule, condition 4 asked, gives nothing",
                both([runs.gtx1080[0], eF]) === "r18t" && e66.entry === null && e66.fail.r18t === 4,
                `run b repaired: ${eF.entry}; run a with condition 4: ${e66.entry} (fails ${e66.fail.r18t}); r18t against r15 under DXC at 1920 x 1080: ${runs.gtx1080.map((e) => e.lines[0].match(/([\d.]+) x r15 under DXC/)?.[1]).join(" and ")}`);
        }
        // v4862 -- ROUND 24b'S VERDICT (section 78): section 77's rule -- section 75's conditions 0 to 3, the whole compile and exact gates
        // green, in BOTH of a GPU's two runs -- read off the four committed reports (render/denoise-rig-r24b-{a,b}-*.json, realGpuRun --only
        // denoise at v4861's release, SWEK_WEBGPU cleared; step 1's standalone runs are render/denoise-rig-r24b-step1.txt). Every gate green
        // in all four; r18t qualifies on the 1080 in both, so the table is round 19's plus that one entry, and the Intel's control holds.
        // SABOTAGED v4862: the 1080's entry removed from NATIVE_KERNELS_BY_ADAPTER -> 3 RED (this row, the nativeKernelsFor row and the
        //   nativePick row); the 1080's run b r18t-against-r15 at 1920 x 1080 read as 1.040 -> 1 RED (this row; the discrimination row
        //   edits its own copy); NATIVE_KERNELS_DECIDED_BY naming section 67 for the 1080 -> 2 RED (the nativePick row and this one). Each restored, md5 verified.
        {
            const rig = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "render", f), "utf8"));
            const R = { intel: ["a", "b"].map((r) => rig(`denoise-rig-r24b-${r}-intel-gen9.json`)), gtx1080: ["a", "b"].map((r) => rig(`denoise-rig-r24b-${r}-gtx1080.json`)) };
            const runs = Object.fromEntries(Object.entries(R).map(([k, reps]) => [k, reps.map((r) => rule66Entries(r, { fxc: false })[0])]));
            const both = (rs) => (rs.every((e) => e.key && e.key === rs[0].key && e.entry && e.entry === rs[0].entry) ? rs[0].entry : null);
            const allGreen = Object.values(R).flat().every((r) => (r.gates || []).length === 3 && r.gates.every((g) => g.ok === true));
            for (const [k, rs] of Object.entries(runs)) console.log(`  ----  section 77 on ${rs[0].key}: ${rs.map((e, i) => `run ${"ab"[i]} ${e.entry || "none"}`).join(", ")}; ${rs[0].lines.join("; ")}`);
            const want = { ...NATIVE_KERNELS_AT_V4852, [runs.gtx1080[0].key]: both(runs.gtx1080) };
            ok("!! *** round 24b's verdict (section 78): every gate green in all four runs, r18t qualifies on the 1080 in both, and NATIVE_KERNELS_BY_ADAPTER is round 19's table plus win32/nvidia/pascal -> r18t, decided by section 78 ***",
                allGreen && both(runs.gtx1080) === "r18t" && both(runs.intel) === "r18u" && runs.gtx1080.every((e) => e.fail.r18u === 3) &&
                JSON.stringify(Object.entries(NATIVE_KERNELS_BY_ADAPTER).sort()) === JSON.stringify(Object.entries(want).sort()) &&
                NATIVE_KERNELS_DECIDED_BY["win32/nvidia/pascal"] === "section 78" && NATIVE_KERNELS_DECIDED_BY["win32/intel/gen-9"] === "section 67" &&
                Object.keys(NATIVE_KERNELS_DECIDED_BY).sort().join() === Object.keys(NATIVE_KERNELS_BY_ADAPTER).sort().join() && Object.isFrozen(NATIVE_KERNELS_DECIDED_BY),
                `${JSON.stringify(NATIVE_KERNELS_BY_ADAPTER)} against the rule's ${JSON.stringify(want)}; the 1080's r18t at 1920 x 1080: ` +
                runs.gtx1080.map((e) => e.lines[0].match(/([\d.]+) x r15 under DXC/)?.[1]).join(" and ") + `; the Intel's control r18u: ${runs.intel.map((e) => e.entry).join(", ")}`);
            // it discriminates: one 1080 run under the bar, or one run with a red gate, and the 1080 gets nothing
            const low = JSON.parse(JSON.stringify(R.gtx1080[1]));
            for (const g of low.gates) g.measured = (g.measured || []).map((l) => (/^native: r18t against r15 at 1920 x 1080/.test(l) ? l.replace(/: [\d.]+ x as fast/, ": 1.040 x as fast") : l));
            const red = JSON.parse(JSON.stringify(R.gtx1080[0])); rigGate(red, "denoiseDevice").ok = false;
            const [eLow] = rule66Entries(low, { fxc: false }), [eRed] = rule66Entries(red, { fxc: false });
            ok("  ...and it discriminates: the 1080's run b with r18t at 1.040 x, or its run a with the exact gate red, and r18t no longer holds in both",
                both([runs.gtx1080[0], eLow]) === null && eLow.fail.r18t === 3 && both([eRed, runs.gtx1080[1]]) === null && eRed.fail.r18t === 1,
                `run b at 1.040 x: fails condition ${eLow.fail.r18t}; run a with a red exact gate: fails condition ${eRed.fail.r18t}`);
        }
        // v4869 -- ROUND 27'S VERDICT (section 86): section 83's rule -- per GPU and path, every condition in BOTH of two runs -- read off
        // the four committed reports (render/denoise-rig-r27-{a,b}-*.json, realGpuRun --only denoise at d11534e3, v4868's release record,
        // SWEK_WEBGPU cleared). Every gate green in all four; K0w and K1 hold on both GPUs and both paths; r27w fails condition 3 on every
        // one -- 0.30 x r18t on the 1080 and 0.33-0.37 x r18u on the Intel -- so no entry moves and both tables are as section 83 found them.
        {
            const rig = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "render", f), "utf8"));
            const R = { intel: ["a", "b"].map((r) => rig(`denoise-rig-r27-${r}-intel-gen9.json`)), gtx1080: ["a", "b"].map((r) => rig(`denoise-rig-r27-${r}-gtx1080.json`)) };
            const runs = Object.fromEntries(Object.entries(R).map(([k, reps]) => [k, reps.map(rule83Entries)]));
            const both = (rs, p) => (rs.every((e) => e.key[p] && e.key[p] === rs[0].key[p] && e[p].entry === "r27w") ? "r27w" : null);
            const derive = (p) => { const t = { ...RULE83_AT[p] }; for (const rs of Object.values(runs)) if (both(rs, p)) t[rs[0].key[p]] = "r27w"; return t; };
            const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
            const allGreen = Object.values(R).flat().every((r) => (r.gates || []).length === 3 && r.gates.every((g) => g.ok === true) && /^d11534e3 /.test(r.commit || ""));
            for (const [k, rs] of Object.entries(runs)) for (const p of ["native", "page"]) console.log(`  ----  section 83 on ${rs[0].key[p]}: ${rs.map((e, i) => `run ${"ab"[i]} ${e[p].line}`).join(" | ")}`);
            const want = { native: { "win32/intel/gen-9": "r18u", "win32/nvidia/pascal": "r18t" }, page: { "Windows/intel/gen-9": "r18u", "Windows/nvidia/pascal": "r18t" } };
            const read = Object.values(runs).flat().every((e) => e.native.fail === 3 && e.page.fail === 3);
            ok("!! *** round 27's verdict (section 86): every gate green in all four runs at d11534e3, K0w and K1 hold on both GPUs and paths, r27w fails condition 3 on every one in both runs, and both tables are as section 83 found them -- no r27w in either ***",
                allGreen && read && same(derive("native"), want.native) && same(derive("page"), want.page) &&
                same(NATIVE_KERNELS_BY_ADAPTER, want.native) && same(PAGE_KERNELS_BY_ADAPTER, want.page) && same(RULE83_AT.native, want.native) && same(RULE83_AT.page, want.page) &&
                NATIVE_KERNELS_DECIDED_BY["win32/intel/gen-9"] === "section 67" && NATIVE_KERNELS_DECIDED_BY["win32/nvidia/pascal"] === "section 78" &&
                ![...Object.values(NATIVE_KERNELS_BY_ADAPTER), ...Object.values(PAGE_KERNELS_BY_ADAPTER)].includes("r27w") && DEFAULT_KERNELS === "r15" && PAGE_KERNELS === "r15",
                Object.entries(runs).map(([k, rs]) => `${k}: native ${rs.map((e) => e.native.c3 && e.native.c3.r).join(" and ")} x ${rs[0].native.present}, page ${rs.map((e) => e.page.c3 && e.page.c3.r).join(" and ")} x ${rs[0].page.present}`).join("; "));
            // it discriminates. On copies: the 1080's two runs with r27w at 1.100 x r18t natively at 1920 x 1080 give the 1080 r27w natively
            // and nothing on the page; one run lifted gives nothing (both runs); lifted with one exact gate red fails condition 1; r27w lifted
            // over r15 but not r18t still fails 3 (the present entry, not r15); a skipped row fails the page's condition 1 and not the native
            // one; and a report that did not time r27w has no key (section 85's check)
            const lift = (rep, re) => { const c = JSON.parse(JSON.stringify(rep)); for (const g of c.gates) g.measured = (g.measured || []).map((l) => (re.test(l) ? l.replace(/: [\d.]+ x as fast/, ": 1.100 x as fast") : l)); return c; };
            const L = R.gtx1080.map((r) => lift(r, /^native: r27w against r18t at 1920 x 1080/)), eL = L.map(rule83Entries);
            const red = lift(R.gtx1080[0], /^native: r27w against r18t at 1920 x 1080/); rigGate(red, "denoiseDevice").ok = false;
            const r15only = rule83Entries(lift(R.gtx1080[0], /^native: r27w against r15 at 1920 x 1080/));
            const skip = JSON.parse(JSON.stringify(R.intel[0])); rigGate(skip, "denoiseDevice").skips = ["SKIP  section 5: no browser"];
            const eS = rule83Entries(skip);
            const stale = JSON.parse(JSON.stringify(R.intel[0])); for (const g of stale.gates) g.measured = (g.measured || []).map((l) => l.replace(/, r27w$/, ""));
            const eStale = rule83Entries(stale);
            ok("  ...and it discriminates: the 1080 lifted to 1.100 x r18t natively in both runs takes r27w natively and not on the page; in one run, or with one exact gate red, or lifted over r15 alone, it takes nothing; a skipped row fails the page's K0w only; a report that did not time r27w has no key",
                both(eL, "native") === "r27w" && both(eL, "page") === null && both([eL[0], runs.gtx1080[1]], "native") === null &&
                both([rule83Entries(red), eL[1]], "native") === null && rule83Entries(red).native.fail === 1 && r15only.native.fail === 3 &&
                eS.page.fail === 1 && eS.native.fail === 3 && eStale.key.native === null && eStale.native.fail === 0 && eStale.native.entry === null,
                `lifted: native ${eL.map((e) => e.native.entry || "none").join(", ")}, page ${eL.map((e) => e.page.entry || "none").join(", ")}; red exact gate: fails ${rule83Entries(red).native.fail}; ` +
                `over r15 only: fails ${r15only.native.fail}; skipped row: page fails ${eS.page.fail}, native ${eS.native.fail}; not timed: key ${eStale.key.native}`);
            // section 83's predictions, read off the same reports. P1 (r27w qualifies on the 1080, natively and on the page) FAILED; P2 (not
            // on the Intel) held; P3 (K0w on both GPUs, natively and in Chrome) held -- and its aside, "with some cells fused on the 1080, as
            // r15's were", is not what the compile gate saw: r27w's hidden kernel fused no cell in either mode on either GPU, as r15's did not
            const fusedW = Object.values(R).flat().map((r) => rigLines(rigGate(r, "denoiseCompile")).map((l) => l.match(/^native \/ (?:as shipped|use_dxc): r27w-wino-3x3: .*?, (\d+) plain, (\d+) fused, (\d+) unexplained;/)).filter(Boolean));
            ok("  section 83's predictions, read off the same reports: P1 FAILED (the 1080 takes nothing on either path), P2 held (nor the Intel), P3 held (K0w natively and in Chrome on both GPUs, both runs) -- with no Winograd cell fused, where P3's aside expected some on the 1080",
                runs.gtx1080.every((e) => !e.native.entry && !e.page.entry) && runs.intel.every((e) => !e.native.entry && !e.page.entry) &&
                Object.values(runs).flat().every((e) => e.native.fail > 1 && e.page.fail > 1) &&
                fusedW.every((m) => m.length === 2 && m.every((x) => +x[1] === 131072 && +x[2] === 0 && +x[3] === 0)),
                `the Winograd kernel's compile-gate job, as shipped and use_dxc, per run: ${fusedW.map((m) => m.map((x) => `${x[1]} plain + ${x[2]} fused`).join(" / ")).join("; ")}`);
        }
        // v4852+ -- SECTION 68'S OUTCOME (round 20): the rig's six --which lines per GPU, held to the table fixed before they ran, and
        // each re-derived from nativePick on the adapter and compiler the line itself names -- so the rig's reasons are this code's
        {
            const runs = parseWhich(fs.readFileSync(path.join(ENG, "render", "denoise-rig-r20-which.txt"), "utf8"));
            const held = WHICH_PREDICTED.map((w, i) => {
                const r = runs[i] || {}, re = r.bad ? null : nativePick({ info: { vendor: r.vendor, architecture: r.architecture, description: r.description } }, { compiler: r.compiler, platform: "win32", table: NATIVE_KERNELS_AT_V4852 });   // v4862: the table these runs ran against
                const ok1 = !r.bad && r.vendor === w.vendor && r.compiler === (w.dxc ? "DXC" : "FXC") && H.versionAtLeast(r.version, "0.6.2") === w.dxc &&
                    r.key === w.key && r.kernels === w.kernels && r.built === w.kernels && w.why.test(r.why) && r.worst <= 1e-4 &&
                    re.key === r.key && re.kernels === r.kernels && re.why === r.why;
                return { ok: ok1, line: r.bad ? `unparsed: ${r.bad.join(" | ")}` : `${r.vendor} ${r.version} ${r.compiler}: ${r.kernels}, ${r.worst}` };
            });
            ok("!! *** section 68's outcome: the rig's four --which runs are the four section 68 predicted -- key, set, reason and compiler -- each pass within 1e-4 of the f64 network, and each reason is nativePick's own on the adapter the line names ***",
                runs.length === 4 && held.every((h) => h.ok), held.map((h) => (h.ok ? "" : "WRONG ") + h.line).join("; "));
            const asInstalled = runs.filter((r, i) => !r.bad && !WHICH_PREDICTED[i].dxc).map((r) => `${r.vendor} ${r.version}`);
            console.log(`  ----  section 68: the packages the rig had installed (the pin is 0.6.0): ${asInstalled.join(", ")}`);
        }
        // v4871+ -- ROUND 28'S VERDICT (section 88): section 87's four deciding predictions, read off the committed run -- one realGpuRun
        // --only denoise per GPU at 8490e721 (render/denoise-rig-r28-{intel-gen9,gtx1080}.json) and the console with each GPU's --which
        // (render/denoise-rig-r28-which.txt). 1: every gate green; 2: the compile gate's use_dxc-off group is r12-tiled-3x3 alone, built,
        // exact, its dump FXC (DXBC), the other seven standing aside by section 87's line; 3: the timing gate's FXC ladder skipped with
        // section 87's reason, and no FXC line timed; 4: --which r18u on the Intel and r18t on the 1080, each line nativePick's own. The
        // gate durations section 87 reported without deciding on are printed beside it. The retirement stands.
        {
            const rig = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "render", f), "utf8"));
            const R28 = { intel: rig("denoise-rig-r28-intel-gen9.json"), gtx1080: rig("denoise-rig-r28-gtx1080.json") };
            const which28 = parseWhich(fs.readFileSync(path.join(ENG, "render", "denoise-rig-r28-which.txt"), "utf8"));
            const rule87 = (rep) => {
                const comp = rigGate(rep, "denoiseCompile"), tim = rigGate(rep, "denoiseTiming"), C = rigLines(comp), T = rigLines(tim);
                const p1 = (rep.gates || []).length === 3 && rep.gates.every((g) => g.ok === true);
                const offJobs = C.filter((l) => l.startsWith("native / use_dxc off: "));
                const p2 = C.some((l) => /^native \/ use_dxc off in all: 1 of 1 built; dumps: 1 FXC \(DXBC\); compiler, from the package: FXC;/.test(l)) &&
                    offJobs.length === 1 && /^native \/ use_dxc off: r12-tiled-3x3: .*, 131072 plain, 0 fused, 0 unexplained; dump: FXC \(DXBC\)/.test(offJobs[0]) &&
                    (comp.skips || []).some((l) => /^SKIP  section 87: native \/ use_dxc off is FXC -- the denoiser's FXC paths are retired; r12-tiled-3x3 alone is built, as FXC's control, and the other 7 stand aside, not counted as unbuilt/.test(l));
                const p3 = (tim.skips || []).some((l) => /^SKIP  native FXC ladder: retired by section 87 /.test(l)) && !T.some((l) => /^native FXC/.test(l));
                return { p1, p2, p3, compS: Math.round(comp.ms / 1000), timS: Math.round(tim.ms / 1000), commit: rep.commit || "" };
            };
            const r = Object.fromEntries(Object.entries(R28).map(([k, rep]) => [k, rule87(rep)]));
            const want = { intel: { vendor: "intel", key: "win32/intel/gen-9", kernels: "r18u" }, nvidia: { vendor: "nvidia", key: "win32/nvidia/pascal", kernels: "r18t" } };
            const rule87which = (W) => W.length === 2 && W.every((w) => {
                const t = !w.bad && want[w.vendor], re = t && nativePick({ info: { vendor: w.vendor, architecture: w.architecture, description: w.description } }, { compiler: w.compiler, platform: "win32" });
                return !!t && w.compiler === "DXC" && w.key === t.key && w.kernels === t.kernels && w.built === t.kernels && w.worst <= 1e-4 &&
                    re.key === w.key && re.kernels === w.kernels && re.why === w.why;
            });
            const p4 = rule87which(which28);
            ok("!! *** round 28's verdict (section 88): section 87's four deciding predictions hold on both GPUs at 8490e721 -- every gate green, FXC builds the control kernel alone, the FXC ladder is skipped, --which unchanged -- so the FXC retirement stands ***",
                Object.values(r).every((x) => x.p1 && x.p2 && x.p3 && /^8490e721 /.test(x.commit)) && p4,
                Object.entries(r).map(([k, x]) => `${k}: 1 ${x.p1}, 2 ${x.p2}, 3 ${x.p3}`).join("; ") + `; 4 ${p4} (${which28.map((w) => `${w.vendor} ${w.kernels}`).join(", ")})`);
            console.log(`  ----  section 87, reported and not deciding: compile gate ${r.intel.compS} s on the Intel (bound 200) and ${r.gtx1080.compS} s on the 1080 (bound 120); ` +
                `timing gate ${r.intel.timS} s (bound 351) and ${r.gtx1080.timS} s (bound 230)`);
            // it discriminates. On copies: the Intel's compile gate building all eight under FXC fails 2; the 1080's timing gate with the
            // FXC ladder run fails 3; a --which naming r15 for the Intel fails 4
            const all8 = JSON.parse(JSON.stringify(R28.intel));
            for (const g of all8.gates) g.measured = (g.measured || []).map((l) => l.replace("native / use_dxc off in all: 1 of 1 built; dumps: 1 FXC", "native / use_dxc off in all: 8 of 8 built; dumps: 8 FXC"));
            const ran = JSON.parse(JSON.stringify(R28.gtx1080)); rigGate(ran, "denoiseTiming").skips = []; rigGate(ran, "denoiseTiming").measured.push("native FXC: node-webgpu 0.6.2 ...; sets timed: r12, r15");
            const w15 = parseWhich(fs.readFileSync(path.join(ENG, "render", "denoise-rig-r28-which.txt"), "utf8").replace("kernels r18u -- section 67's for win32/intel/gen-9, under DXC", "kernels r15 -- no entry"));
            ok("  ...and it discriminates: all eight built under FXC, the FXC ladder run, or --which naming r15 on the Intel, and the verdict would not hold",
                !rule87(all8).p2 && !rule87(ran).p3 && !rule87which(w15),
                `eight under FXC: prediction 2 ${rule87(all8).p2}; ladder run: prediction 3 ${rule87(ran).p3}; --which naming r15: prediction 4 ${rule87which(w15)}`);
        }
        const tbl = { "Windows/intel/gen-9": "r18u" };
        ok("!! round 18: the page's key is platform, vendor and architecture -- none without a platform, as every browser but Chromium -- and pageKernelsFor gives the table's set for a key it names, PAGE_KERNELS for any other",
            pageAdapterKey({ vendor: "intel", architecture: "gen-9", description: "x" }, { platform: "Windows" }) === "Windows/intel/gen-9" &&
            pageAdapterKey({ vendor: "intel", architecture: "gen-9" }, undefined) === null && pageAdapterKey({ vendor: "intel", architecture: "gen-9" }, { platform: "" }) === null &&
            pageAdapterKey({}, { platform: "Windows" }) === null &&
            pageKernelsFor("Windows/intel/gen-9", tbl) === "r18u" && pageKernelsFor("macOS/intel/gen-9", tbl) === PAGE_KERNELS && pageKernelsFor(null, tbl) === PAGE_KERNELS &&
            pageKernelsFor("constructor", tbl) === PAGE_KERNELS && pageKernelsFor("constructor") === PAGE_KERNELS && pageKernelsFor("Windows/amd/rdna-3") === PAGE_KERNELS,
            "the table's own prototype is not a key; an adapter the shipped table does not name runs PAGE_KERNELS");
        const verdict = [["Windows/intel/gen-9", "r18u"], ["Windows/nvidia/pascal", "r18t"]];
        // v4849 -- round 19 renamed BROWSER_ONLY_SETS to FXC_UNBUILT_SETS; the table's two sets are still exactly those
        ok("!! round 18's verdict (section 63): the page's table is section 61's rule read off both GPUs' runs -- r18u for the Intel gen-9, r18t for the GTX 1080, in Chrome on Windows -- and nothing else; PAGE_KERNELS and DEFAULT_KERNELS stay r15",
            JSON.stringify(Object.entries(PAGE_KERNELS_BY_ADAPTER).sort()) === JSON.stringify(verdict) && Object.isFrozen(PAGE_KERNELS_BY_ADAPTER) &&
            Object.values(PAGE_KERNELS_BY_ADAPTER).every((v) => KERNEL_SETS.includes(v) && FXC_UNBUILT_SETS.includes(v)) && PAGE_KERNELS === "r15" && DEFAULT_KERNELS === "r15" &&
            pageKernelsFor("Windows/intel/gen-9") === "r18u" && pageKernelsFor("Windows/nvidia/pascal") === "r18t" && pageKernelsFor("Linux/google/swiftshader") === "r15",
            JSON.stringify(PAGE_KERNELS_BY_ADAPTER) + " -- section 63: r18u 1.524 x r15 at 1024 on the Intel, r18t 1.087 x at 1080p on the 1080");
    }
    ok("  k_head_apply: five bindings, one barrier, its 81 taps unrolled -- each logit a named lane, no private array a compiler would put in memory",
        /fn k_head_apply/.test(code15) && (code15.match(/@binding\(/g) || []).length === 5 && (code15.match(/workgroupBarrier\(\)/g) || []).length === 1 &&
        !/array<f32, 81>/.test(code15) && /let l = a20\.x;/.test(code15) && (code15.match(/exp\(/g) || []).length === 2 * KERNEL_TAPS);
    // the order probe is a probe, and the judge can fail: on the CPU, the probe's twin logits and fused mirror's are the
    // same bits, and a head added last-first -- the defect only the probe can see through the image -- moves it
    {
        const P = CMP.headApplyProbe(), N = 64, n = N * N, T = KERNEL_TAPS, Cin = P.L.Cin, f = Math.fround;
        const tw = conv2dCpu(P.A, N, N, P.L), fm = conv2dCpuFma(P.A, N, N, P.L), rev = new Float32Array(n * T);
        let same = 0; for (let i = 0; i < tw.length; i++) if (tw[i] === fm[i]) same++;
        for (let p = 0; p < n; p++) for (let t = 0; t < T; t++) { let a = f(P.L.b[t]); for (let ci = Cin - 1; ci >= 0; ci--) a = f(a + f(P.A[p * Cin + ci] * P.L.W[t * Cin + ci])); rev[p * T + t] = a; }
        const yT = kernelApplyCpu(P.x, tw, N, N), yR = kernelApplyCpu(P.x, rev, N, N);
        const jT = judgeHeadApply(P.x, P.A, P.L, yT, N, N), jR = judgeHeadApply(P.x, P.A, P.L, yR, N, N);
        let over = 0; for (let i = 0; i < yT.length; i++) if (Math.abs(yR[i] - yT[i]) > APPLY_TOL * (Math.abs(yT[i]) + 1e-30)) over++;
        ok("!! round 15: the order probe is a probe -- every product exact, so its twin logits ARE the fused mirror's -- and a head added last-first moves its image past APPLY_TOL, which judgeHeadApply sees",
            same === tw.length && jT.worst === 0 && jR.worst > 100 * APPLY_TOL && over / yT.length > 0.9,
            `${same} of ${tw.length} logits the same both ways; added last-first: worst ${jR.worst.toExponential(2)}, ${(100 * over / yT.length).toFixed(1)}% of values past APPLY_TOL`);
    }
    let refused = null; try { deviceLayers(makeDenoiser(1, "he", "residual")); } catch (e) { refused = e.message; }
    ok("  a residual network is refused by name: only the kernel-predicting network runs on the device", /only the kernel-predicting/.test(refused || ""));
    ok("  kernelApplyWgsl is one kernel, k_apply, with its four bindings", /fn k_apply/.test(kernelApplyWgsl()) && (kernelApplyWgsl().match(/@binding\(/g) || []).length === 4);
}

console.log("\n2. THE SHIPPED NETWORK'S ENCODING");
{
    const net = makeDenoiser(9, "he", "kernel", 10, "large"), d = decodeNet(JSON.parse(JSON.stringify(encodeNet(net))));
    ok("!! encodeNet then decodeNet, through JSON, is the network bit for bit -- every weight, every bias, every shape",
        d.layers.length === 5 && d.layers.every((L, i) => ["Cin", "Cout", "k", "act"].every((k) => L[k] === net.layers[i][k]) &&
            L.W.every((v, j) => Object.is(v, net.layers[i].W[j])) && L.b.every((v, j) => Object.is(v, net.layers[i].b[j]))), `${paramCount(net)} parameters`);
    const e = encodeNet(net); e.layers[4].W = e.layers[4].W.slice(0, -12);
    let refused = null; try { decodeNet(e); } catch (er) { refused = er.message; }
    ok("  a layer whose weights do not fill its shape is refused, not zero-padded", /layer 4 holds/.test(refused || ""));
    const shape = shapeFor("kernel", 10, "large");
    ok("  the large network's shape is section 28's, with the mask's tenth channel", shape.map((s) => s.slice(0, 2).join(">")).join() === "10>32,32>32,32>32,32>32,32>81");
    // v4845 -- TIMED_SETS was one of the symbols definitionGates' census found no row of this gate naming. render/denoiseTiming-selfcheck.mjs
    // holds its order; this holds what it is FOR: every set a pass or the page can run is on the ladders, so no default ships untimed.
    // v4849 -- round 19: and each native adapter's pick (NATIVE_KERNELS_BY_ADAPTER), once section 66's rule fills it
    const runnable = [DEFAULT_KERNELS, PAGE_KERNELS, ...Object.values(PAGE_KERNELS_BY_ADAPTER), ...Object.values(NATIVE_KERNELS_BY_ADAPTER)];
    ok("!! every set a pass or the page can choose -- the default, the page's, and each adapter's measured pick, on the page or natively -- is one the ladders time, with r12 first as the reference",
        runnable.every((s) => TIMED_SETS.includes(s)) && TIMED_SETS[0] === "r12" && TIMED_SETS.every((s) => KERNEL_SETS.includes(s)) && Object.isFrozen(TIMED_SETS),
        `timed ${TIMED_SETS.join(", ")}; runnable ${[...new Set(runnable)].join(", ")}`);
}

console.log("\n3. *** THE WHOLE PASS ON THE DEVICE (Dawn) ***");
// v4849 -- round 19 (section 66): the package this gate's device comes from, and the compiler the run compiles with -- read off
// the package with the flags the device is made with (FLAGS: none, Dawn as shipped; one list for both, so they cannot part),
// because the adapter cannot say which (on 0.6.2 its description is "D3D12 driver version ..." under either). The compile gate
// holds this reading to Dawn's dump in the same run. A SWEK_WEBGPU this box cannot load is a red here, never a skip, as in the
// compile gate (section 64): printed as a skip by headlessGpuSkipReason, a DXC run with a mistyped path passed green with no
// native row -- and section 66 reads its condition (1) off these rows.
const W = H.resolveWebgpu(), FLAGS = Object.freeze([]), PKG = H.webgpuPackage(W.from);
const COMPILER = H.nativeCompiler({ pkg: PKG, platform: process.platform, flags: FLAGS });
const compilerSaid = `${COMPILER || `no D3D compiler on ${process.platform}`}, from node-webgpu ${(PKG && PKG.version) || "(version unread)"}`;
const skip = W.refused ? null : H.headlessGpuSkipReason();
// v4852 -- section 68: this box's own native pick, made on section 3's adapter (one Dawn instance per gate: a second, made late,
// died on Dawn's futex error while this round was built) and read again by section 6's caller row
let HERE_PICK = null;
if (W.refused) ok(`!! round 19: ${H.WEBGPU_ENV} names a node-webgpu package this box can load -- a refused one is a red here, never a skip (a DXC run would pass with no native row)`, false, W.refused);
else if (skip) console.log("  SKIP  " + skip);
else try {
    H.configureVulkanIcd();
    const gpu = W.mod.create([...FLAGS]);
    // v4849 -- round 19 (section 66): the native adapter, named where tools/ship/realGpuRun.mjs reads adapters -- a measured line it
    // keeps, with the compiler read above, and the SWEK_ADAPTER_LOG record its verdict counts. Round 18's r18 reports named this
    // gate's adapter nowhere (the "...." line at the end of this section is not one realGpuRun reads). Noted before any job, so a
    // gate that dies later has still named it; the record is kept here too, so a row can hold what it says.
    const NATIVE = await gpu.requestAdapter(), NOTED = [];
    H.noteNativeAdapter(NATIVE, { gate: fileURLToPath(import.meta.url), compiler: COMPILER, env: { SWEK_ADAPTER_LOG: process.env.SWEK_ADAPTER_LOG || "(this gate's own copy)" },
        append: (f, line) => { NOTED.push(JSON.parse(line)); if (process.env.SWEK_ADAPTER_LOG) fs.appendFileSync(f, line); } });
    // one job: a fresh adapter and device, the network built and run, everything read back, the device destroyed --
    // before any CPU work long enough to matter
    // round 12's kernels unless told otherwise -- the rows below that name no set are about them, whatever the default is
    const job = async (net, x, h, w, C, kernels = "r12") => {
        // round 40: the subgroups feature asked for where the adapter offers it -- r40s needs it, and no other set's kernels read it
        const adapter = await gpu.requestAdapter(), dev = await adapter.requestDevice({ requiredFeatures: adapter.features.has("subgroups") ? ["subgroups"] : [] }), info = adapter.info || {};
        try {
            const D = await createDeviceDenoiser(dev, net, { H: h, W: w, C, kernels, subgroupMinSize: info.subgroupMinSize });
            const out = await D.run(x, { keep: true });
            D.destroy();
            return { ...out, adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") };
        } finally { dev.destroy(); }
    };
    // each layer judged on the device's OWN input to it: the twin's cell, or the fused mirror's, or unexplained -- except a
    // fused last layer (r15's k_head_apply), which stores no cell and is judged through the image (judgeHeadApply)
    const judge = (net, x, h, w, acts, set = "r12") => deviceLayers(net, set).map((L, i) => {
        if (L.kernel === "head_apply") return { kernel: L.kernel, plain: 0, fused: 0, unexplained: 0, image: true };
        // v4868 -- round 27: the twin and mirror this layer's kernel answers to (twinsOf): the Winograd pair for a Winograd layer
        const input = i ? acts[i - 1] : Float32Array.from(x), T = twinsOf(L), tw = T.twin(input, h, w, L), fm = T.mirror(input, h, w, L);
        let plain = 0, fused = 0, unexplained = 0;
        for (let j = 0; j < tw.length; j++) { const v = acts[i][j]; if (v === tw[j]) plain++; else if (v === fm[j]) fused++; else unexplained++; }
        return { kernel: L.kernel, plain, fused, unexplained };
    });
    const net = makeDenoiser(3, "he", "kernel", 10, "large"), x = synth(HH, WW, 10, 7);
    // v4845 -- passBytes is what round 15 REPORTS a pass allocating; held here to what createDeviceDenoiser actually asks the device
    // for: every STORAGE buffer it creates, summed, for an unfused set (r12) and the fused one (r15, whose head keeps its logits).
    // MEASURED, the first time this row ran: r12 allocated 487,628 B against passBytes' 354,312 and r15 exactly its 225,036. The
    // difference is 133,316 B = 33,329 parameters x 4 -- r12 keeps the network's weights in storage buffers and r15 does not. So
    // passBytes is the PER-PIXEL storage (input, layer outputs, image), the part that grows with the frame; the weights are a
    // constant beside it on the sets that store them. The row holds both, so neither half can move unseen.
    {
        const allocated = async (set) => { const adapter = await gpu.requestAdapter(), dev = await adapter.requestDevice(); let sum = 0;
            const real = dev.createBuffer.bind(dev); dev.createBuffer = (d) => { if (d.usage & 0x80) sum += d.size; return real(d); };
            try { const D = await createDeviceDenoiser(dev, net, { H: HH, W: WW, C: 10, kernels: set }); D.destroy(); return sum; } finally { dev.destroy(); } };
        const a12 = await allocated("r12"), a15 = await allocated("r15");
        const wb = paramCount(net) * 4;
        ok("!! passBytes is the per-pixel storage the device denoiser really allocates: r15 exactly, r12 plus its weights (which r12 alone keeps in storage) -- and the 81 logits a pixel are the difference",
            a12 === passBytes(net, HH, WW, "r12") + wb && a15 === passBytes(net, HH, WW, "r15") && a12 - wb - a15 === HH * WW * 81 * 4,
            `r12 ${a12} B allocated = passBytes ${passBytes(net, HH, WW, "r12")} + weights ${wb}; r15 ${a15} against ${passBytes(net, HH, WW, "r15")}`);
    }
    const r = await job(net, x, HH, WW, 10);
    {
        const rec = NOTED[0] || {}, a = rec.adapter, named = a ? [a.vendor, a.architecture, a.description].filter(Boolean).join(" / ") : null;
        ok("!! round 19 (section 66): the native adapter is named where realGpuRun reads adapters -- one record, keyed by this gate's path from the engine root, naming the adapter the jobs run on, its software flag a boolean",
            NOTED.length === 1 && rec.gate === "render/denoiseDevice-selfcheck.mjs" && named === r.adapter && typeof rec.software === "boolean" && (rec.launchArgs || [])[0] === "node-webgpu (native)",
            `${named} (${rec.software ? "SOFTWARE" : "hardware"}), ${NOTED.length} record(s) keyed ${rec.gate}; compiler ${compilerSaid}`);
    }
    const J = judge(net, x, HH, WW, r.acts);
    ok(`!! *** every cell of every layer, on the device, is the twin's or the fused mirror's, given the device's own input to that layer -- the head of ${KERNEL_TAPS} on the direct kernel among them ***`,
        J.every((j) => j.unexplained === 0) && J[4].kernel === "direct", J.map((j) => `${j.kernel} ${j.plain}+${j.fused}f`).join(", "));
    const tw = kernelApplyCpu(x, r.acts[4], HH, WW), wa = worstRel(r.y, tw);
    k0row("native", "r12", J, wa);
    ok(`!! the kernel on the device is its twin within APPLY_TOL ${APPLY_TOL} on every value -- exp and division are not correctly rounded in WGSL, so it is held to a bound, not to bits`,
        wa <= APPLY_TOL, `worst relative ${wa.toExponential(2)}, ${(APPLY_TOL / Math.max(wa, 1e-30)).toFixed(0)} x inside`);
    const ref = denoise(net, x, HH, WW).y, wf = worstRel(r.y, ref, 1e-12);
    ok("  the whole pass on the device is the f64 network's output within f32 rounding", wf < 1e-5, `worst relative ${wf.toExponential(2)}`);
    // round 14: the r14 set, the same network and image -- section 43's K0, natively (r13's is section 42's)
    const r14 = await job(net, x, HH, WW, 10, "r14"), J14 = judge(net, x, HH, WW, r14.acts, "r14");
    const w14 = worstRel(r14.y, kernelApplyCpu(x, r14.acts[4], HH, WW));
    k0row("native", "r14", J14, w14);
    ok(`!! *** K0 natively: the r14 set -- the fast kernel, the head kernel's planar logits (read back and judged channels last), and k_apply_fast -- every cell the twin's or the fused mirror's, given the device's own input; the kernel within APPLY_TOL ***`,
        J14.every((j) => j.unexplained === 0) && J14.map((j) => j.kernel).join() === "fast,fast,fast,fast,head" && w14 <= APPLY_TOL && worstRel(r14.y, ref, 1e-12) < 1e-5,
        J14.map((j) => `${j.kernel} ${j.plain}+${j.fused}f`).join(", ") + `; kernel ${w14.toExponential(2)}`);
    const noneFused = [...J, ...J14].every((j) => j.fused === 0);
    ok("  ...and where no layer of either set fused a cell, the two sets' images are the same bits", !noneFused || r14.y.every((v, i) => Object.is(v, r.y[i])),
        noneFused ? "no cell fused in either set on this device: the images must agree exactly" : "a set fused cells here, so the images may differ where it did");
    // round 15: the r15 set, the same network and image -- section 46's K0, natively
    const r15 = await job(net, x, HH, WW, 10, "r15"), J15 = judge(net, x, HH, WW, r15.acts, "r15"), L15 = deviceLayers(net, "r15");
    const j15 = judgeHeadApply(x, r15.acts[3], L15[4], r15.y, HH, WW);
    k0row("native", "r15", J15, j15.worst);
    ok(`!! *** K0 natively: the r15 set -- the fast kernel's hidden layers every cell the twin's or the fused mirror's, and k_head_apply's image within APPLY_TOL of kernelApplyCpu on the twin's logits or the fused mirror's, from the device's own input to the head ***`,
        J15.slice(0, 4).every((j) => j.unexplained === 0) && J15.map((j) => j.kernel).join() === "fast,fast,fast,fast,head_apply" && r15.acts[4] === null &&
        j15.worst <= APPLY_TOL && worstRel(r15.y, ref, 1e-12) < 1e-5,
        J15.slice(0, 4).map((j) => `${j.kernel} ${j.plain}+${j.fused}f`).join(", ") + `; head and kernel ${j15.worst.toExponential(2)} (twin ${j15.twin.toExponential(2)}, mirror ${j15.mirror.toExponential(2)})`);
    const none15 = [...J14, ...J15].every((j) => j.fused === 0);
    ok("  ...and where no cell of r14 or r15 fused, r15's image is r14's, bit for bit -- the same logits, summed by k_apply_fast's order", !none15 || r15.y.every((v, i) => Object.is(v, r14.y[i])),
        none15 ? "no cell fused in either set on this device: the images must agree exactly" : "a set fused cells here, so the images may differ where it did");
    // round 18 (section 61): r18t and r18u, the same network and image -- K0 natively where the adapter is not D3D12, and since
    // round 19 (section 66) on a D3D12 adapter whose run compiles with DXC: the hidden layers cell for cell, the fused last pass
    // through the image; and where nothing fused, r15's every layer bit for bit. K18 keeps each set's native rows' results.
    const native18 = nativeSetsFor(NATIVE, FXC_UNBUILT_SETS, { compiler: COMPILER }), K18 = Object.fromEntries(FXC_UNBUILT_SETS.map((s) => [s, []]));
    const unbuilt = `on a D3D12 adapter whose run compiles with ${compilerSaid} -- FXC does not build its kernel (section 60), DXC does (section 65): ` +
                    `${H.WEBGPU_ENV} naming node-webgpu 0.6.2, which ships its DXC beside dawn.node`;
    for (const set of FXC_UNBUILT_SETS) {
        if (!native18.includes(set)) { console.log(`  SKIP  K0 natively for ${set}: one of FXC_UNBUILT_SETS, ${unbuilt}; section 5 holds it in the browser`); continue; }
        const r18 = await job(net, x, HH, WW, 10, set), J18 = judge(net, x, HH, WW, r18.acts, set), L18 = deviceLayers(net, set), k = R18_KERNELS[set].kernel;
        const j18 = judgeHeadApply(x, r18.acts[3], L18[4], r18.y, HH, WW);
        k0row("native", set, J18, j18.worst);
        K18[set].push(ok(`!! *** K0 natively: the ${set} set -- its hidden layers (${k}) every cell the twin's or the fused mirror's, given the device's own input; k_head_apply's image within APPLY_TOL ***`,
            J18.slice(0, 4).every((j) => j.unexplained === 0) && J18.map((j) => j.kernel).join() === `${k},${k},${k},${k},head_apply` && r18.acts[4] === null &&
            j18.worst <= APPLY_TOL && worstRel(r18.y, ref, 1e-12) < 1e-5,
            J18.slice(0, 4).map((j) => `${j.kernel} ${j.plain}+${j.fused}f`).join(", ") + `; head and kernel ${j18.worst.toExponential(2)}`));
        const none18 = [...J15, ...J18].every((j) => j.fused === 0);
        K18[set].push(ok(`  ...and where no cell of r15 or ${set} fused, ${set}'s every hidden layer and its image are r15's, bit for bit -- the kernel moves which thread adds and how the code is written, never the order`,
            !none18 || (r18.y.every((v, i) => Object.is(v, r15.y[i])) && r18.acts.slice(0, 4).every((a, i) => a.every((v, j) => Object.is(v, r15.acts[i][j])))),
            none18 ? "no cell fused in either set on this device: every layer must agree exactly" : "a set fused cells here, so the layers may differ where it did"));
    }
    // v4868 -- round 27 (section 83): r27w, the same network and image -- K0w natively where nativeSetsFor allows (DXC on D3D12, and off it):
    // its hidden layers cell for cell against the Winograd twin or its mirror (judge asks twinsOf), its fused last pass through the image,
    // and -- the key restated -- the image within 1e-5 of the f64 network on every value. KW keeps the native rows' results for the
    // measured line below.
    const native27 = nativeSetsFor(NATIVE, FXC_UNTRIED_SETS, { compiler: COMPILER }), KW = [];
    if (!native27.includes("r27w")) console.log(`  SKIP  K0w natively for r27w: one of FXC_UNTRIED_SETS, on a D3D12 adapter whose run compiles with ${compilerSaid} -- never built under FXC (section 83); section 5 holds it in the browser`);
    else {
        const r27 = await job(net, x, HH, WW, 10, "r27w"), J27 = judge(net, x, HH, WW, r27.acts, "r27w"), L27 = deviceLayers(net, "r27w");
        const j27 = judgeHeadApply(x, r27.acts[3], L27[4], r27.y, HH, WW), w64 = worstRel(r27.y, ref, 1e-12), w15 = worstRel(r15.y, ref, 1e-12);
        k0row("native", "r27w", J27, j27.worst);
        KW.push(ok(`!! *** K0w natively (section 83): the r27w set -- its hidden layers (wino) every cell conv2dCpuWino's or its fused mirror's, given the device's own input; k_head_apply's image within APPLY_TOL; the image within 1e-5 of the f64 network on every value ***`,
            J27.slice(0, 4).every((j) => j.unexplained === 0) && J27.map((j) => j.kernel).join() === "wino,wino,wino,wino,head_apply" && r27.acts[4] === null && j27.worst <= APPLY_TOL && w64 < 1e-5,
            J27.slice(0, 4).map((j) => `${j.kernel} ${j.plain}+${j.fused}f${j.unexplained ? "+" + j.unexplained + "?" : ""}`).join(", ") +
            `; head and kernel ${j27.worst.toExponential(2)}; the image against the f64 network ${w64.toExponential(2)} (r15's ${w15.toExponential(2)})`));
        const moved = r27.acts[0].reduce((a, v, j) => a + (Object.is(v, r15.acts[0][j]) ? 0 : 1), 0);
        ok("  ...and its first layer is NOT r15's bits, from the same input -- another order, so the same-bits-as-r15 rows every earlier set carries cannot apply; its bridge to r15 is the f64 bound",
            moved > 0, `${moved} of ${r27.acts[0].length} first-layer cells differ from r15's`);
    }
    // the order probe (render/denoiseCompile.mjs): a head whose products are exact and whose sums are not, so the image is
    // within APPLY_TOL of the twin's only if the head added in the twin's order
    {
        const a = await gpu.requestAdapter(), dv = await a.requestDevice();
        let m; try { m = await CMP.measure(dv, CMP.jobFor(CMP.VARIANTS.find((v) => v.kind === "head_apply"))); } finally { dv.destroy(); }
        ok("!! k_head_apply on the order probe -- every product exact, so the twin's logits ARE the fused mirror's, and only the ORDER of the head's adds can move the image -- is within APPLY_TOL",
            m.built && m.exact, m.built ? m.detail : m.reason);
    }
    // the softmax is shift-invariant: the head's bias plus 100 must give the same image, which k_head_apply can only do by
    // subtracting the largest logit before exp
    {
        const netS = { layers: net.layers.map((L, i) => (i === 4 ? { ...L, b: Float64Array.from(L.b, (v) => v + 100) } : L)) };
        const rS = await job(netS, x, HH, WW, 10, "r15"), jS = judgeHeadApply(x, rS.acts[3], deviceLayers(netS, "r15")[4], rS.y, HH, WW);
        ok("  ...and with every head bias plus 100, k_head_apply's image is still within APPLY_TOL of its twin -- the largest logit is subtracted, or e^100 would overflow",
            jS.worst <= APPLY_TOL && rS.y.every(Number.isFinite), `worst relative ${jS.worst.toExponential(2)}`);
    }
    // the mask is read on the device too: the same image with the mask erased gives another output
    const x0 = Float64Array.from(x); for (let p = 0; p < HH * WW; p++) x0[p * 10 + 9] = 0;
    const r0 = await job(net, x0, HH, WW, 10);
    ok("  ...and the device reads the mask: the same network with the mask erased gives another image", r0.y.some((v, i) => v !== r.y[i]) && worstRel(r0.y, kernelApplyCpu(x0, r0.acts[4], HH, WW)) <= APPLY_TOL);
    // the softmax is shift-invariant, so the kernel alone, handed the same logits plus 100, must give the same image --
    // which it can only do by subtracting the largest logit first: e^100 overflows an f32
    const sh = Float32Array.from(r.acts[4], (v) => v + 100);
    const k = await H.runWgslComputeNative({ code: kernelApplyWgsl(), entryPoint: "k_apply", outCount: HH * WW * 3, uniforms: packApplyUniforms({ H: HH, W: WW, C: 10 }),
        workgroups: [Math.ceil(WW / 8), Math.ceil(HH / 8)], inputs: [{ binding: 2, data: sh }, { binding: 3, data: Float32Array.from(x) }] });
    const ws = k.ok ? worstRel(Array.from(k.values), tw) : Infinity;
    ok("  the kernel alone, handed every logit plus 100, gives the same image within its bound -- the largest logit is subtracted before exp, or e^100 would overflow",
        k.ok && ws <= APPLY_TOL, k.ok ? `worst relative ${ws.toExponential(2)}` : k.reason);
    // and k_apply_fast the same way, its logits planar: the same shift, the same image
    const shP = new Float32Array(sh.length), nP = HH * WW;
    for (let p = 0; p < nP; p++) for (let t = 0; t < KERNEL_TAPS; t++) shP[t * nP + p] = sh[p * KERNEL_TAPS + t];
    const kf = await H.runWgslComputeNative({ code: kernelApplyFastWgsl(), entryPoint: "k_apply_fast", outCount: HH * WW * 3, uniforms: packApplyUniforms({ H: HH, W: WW, C: 10 }),
        workgroups: [Math.ceil(WW / 8), Math.ceil(HH / 8)], inputs: [{ binding: 2, data: shP }, { binding: 3, data: Float32Array.from(x) }] });
    const wsf = kf.ok ? worstRel(Array.from(kf.values), tw) : Infinity;
    ok("  ...and k_apply_fast, handed the same shifted logits planar, gives the same image within its bound", kf.ok && wsf <= APPLY_TOL,
        kf.ok ? `worst relative ${wsf.toExponential(2)}` : kf.reason + " " + (kf.errors || []).join("; "));
    // nine channels, no mask, the small network: the mask test off
    const net9 = makeDenoiser(4, "he", "kernel", 9), x9 = synth(13, 11, 9, 8), r9 = await job(net9, x9, 13, 11, 9);
    const J9 = judge(net9, x9, 13, 11, r9.acts);
    ok("  the small network on nine channels, no mask: every layer explained, the kernel within its bound",
        J9.every((j) => j.unexplained === 0) && worstRel(r9.y, kernelApplyCpu(x9, r9.acts[r9.acts.length - 1], 13, 11)) <= APPLY_TOL, J9.map((j) => j.kernel).join(","));
    {
        const r9f = await job(net9, x9, 13, 11, 9, "r15"), L9 = deviceLayers(net9, "r15"), J9f = judge(net9, x9, 13, 11, r9f.acts, "r15");
        const j9 = judgeHeadApply(x9, r9f.acts[L9.length - 2], L9[L9.length - 1], r9f.y, 13, 11);
        ok("  ...and on r15 too, no mask: k_head_apply's every tap inside the image weighed, its image within its bound",
            J9f.slice(0, -1).every((j) => j.unexplained === 0) && J9f[J9f.length - 1].kernel === "head_apply" && j9.worst <= APPLY_TOL, `worst relative ${j9.worst.toExponential(2)}`);
    }
    {
        // round 18 on the small network, nine channels, 16 hidden channels: tile_inline's G4 capped at the layer's own four
        // vec4s, fast_unroll's 9 and 16 inputs a whole block and a part
        const out = [];
        for (const set of native18) {
            const rt = await job(net9, x9, 13, 11, 9, set), Lt = deviceLayers(net9, set), Jt = judge(net9, x9, 13, 11, rt.acts, set);
            const jt = judgeHeadApply(x9, rt.acts[Lt.length - 2], Lt[Lt.length - 1], rt.y, 13, 11);
            out.push({ set, ok: Jt.slice(0, -1).every((j) => j.unexplained === 0) && Jt.slice(0, -1).every((j) => j.kernel === R18_KERNELS[set].kernel) && jt.worst <= APPLY_TOL, w: jt.worst });
            K18[set].push(out[out.length - 1].ok);
        }
        for (const set of FXC_UNBUILT_SETS) if (!native18.includes(set)) console.log(`  SKIP  ${set} on the small network: one of FXC_UNBUILT_SETS, ${unbuilt}`);
        if (native18.length) ok(`  ...and ${native18.join(" and ")} on the small network, no mask: every layer on their kernels explained, the image within its bound`,
            out.every((o) => o.ok), out.map((o) => `${o.set} ${o.w.toExponential(2)}`).join(", "));
    }
    // v4868 -- round 27 on the small network: nine inputs (blocks of 4, 4 and 1 staged), 16 hidden channels (four z groups of one vec4)
    if (native27.includes("r27w")) {
        const rw = await job(net9, x9, 13, 11, 9, "r27w"), Lw9 = deviceLayers(net9, "r27w"), Jw = judge(net9, x9, 13, 11, rw.acts, "r27w");
        const jw = judgeHeadApply(x9, rw.acts[Lw9.length - 2], Lw9[Lw9.length - 1], rw.y, 13, 11), w64 = worstRel(rw.y, denoise(net9, x9, 13, 11).y, 1e-12);
        KW.push(ok("  ...and r27w on the small network, no mask: every Winograd cell explained against its twin, the image within its bound and within 1e-5 of the f64 network",
            Jw.slice(0, -1).every((j) => j.unexplained === 0 && j.kernel === "wino") && jw.worst <= APPLY_TOL && w64 < 1e-5, `head and kernel ${jw.worst.toExponential(2)}; against f64 ${w64.toExponential(2)}`));
    } else console.log("  SKIP  r27w on the small network: one of FXC_UNTRIED_SETS, under FXC on a D3D12 adapter (section 83)");
    // round 40 (section 108): r40s -- K0s natively where nativeSetsFor and the adapter's features allow (DXC on D3D12, and off it; the
    // subgroups feature): its hidden layers cell for cell against conv2dCpu or its mirror, the head through the image; where nothing
    // fused, r15's every layer bit for bit -- the key every set but r27w is held to; on the small network too. KS keeps the native rows.
    const native40 = featureSetsFor(NATIVE, nativeSetsFor(NATIVE, ["r40s"], { compiler: COMPILER })), KS = [];
    if (!native40.includes("r40s")) console.log(`  SKIP  K0s natively for r40s: ${NATIVE && NATIVE.features && NATIVE.features.has("subgroups") ? `one of FXC_UNTRIED_SETS, on a D3D12 adapter whose run compiles with ${compilerSaid} -- wave operations are shader model 6` : "the adapter has no subgroups feature"} (section 108)`);
    else {
        const r40 = await job(net, x, HH, WW, 10, "r40s"), J40 = judge(net, x, HH, WW, r40.acts, "r40s"), L40 = deviceLayers(net, "r40s");
        const j40 = judgeHeadApply(x, r40.acts[3], L40[4], r40.y, HH, WW), w64 = worstRel(r40.y, ref, 1e-12);
        k0row("native", "r40s", J40, j40.worst);
        KS.push(ok(`!! *** K0s natively (section 108): the r40s set -- its first layer (fast) and hidden layers (sub) every cell the twin's or the fused mirror's, given the device's own input; k_head_apply's image within APPLY_TOL ***`,
            J40.slice(0, 4).every((j) => j.unexplained === 0) && J40.map((j) => j.kernel).join() === "fast,sub,sub,sub,head_apply" && r40.acts[4] === null && j40.worst <= APPLY_TOL && w64 < 1e-5,
            J40.slice(0, 4).map((j) => `${j.kernel} ${j.plain}+${j.fused}f${j.unexplained ? "+" + j.unexplained + "?" : ""}`).join(", ") + `; head and kernel ${j40.worst.toExponential(2)}; against f64 ${w64.toExponential(2)}`));
        const none40 = [...J15, ...J40].every((j) => j.fused === 0);
        KS.push(ok("  ...and where no cell of r15 or r40s fused, r40s's every hidden layer and its image are r15's, bit for bit -- the subgroup kernel moves where the inputs come from, never the order",
            !none40 || (r40.y.every((v, i) => Object.is(v, r15.y[i])) && r40.acts.slice(0, 4).every((a, i) => a.every((v, j) => Object.is(v, r15.acts[i][j])))),
            none40 ? "no cell fused in either set on this device: every layer must agree exactly" : "a set fused cells here, so the layers may differ where it did"));
        const rs = await job(net9, x9, 13, 11, 9, "r40s"), Ls9 = deviceLayers(net9, "r40s"), Js = judge(net9, x9, 13, 11, rs.acts, "r40s");
        const js = judgeHeadApply(x9, rs.acts[Ls9.length - 2], Ls9[Ls9.length - 1], rs.y, 13, 11);
        KS.push(ok("  ...and r40s on the small network, no mask: nine inputs on the fast kernel, 16 hidden channels (two blocks) on the subgroup kernel, every cell explained, the image within its bound",
            Js.slice(0, -1).every((j) => j.unexplained === 0) && Js.map((j) => j.kernel).join() === "fast,sub,sub,head_apply" && js.worst <= APPLY_TOL, `head and kernel ${js.worst.toExponential(2)}`));
        // a device made WITHOUT the feature is refused by name, before any work, whatever its adapter offers
        let noSg = null;
        try { const a = await gpu.requestAdapter(), dv = await a.requestDevice(); try { await createDeviceDenoiser(dv, net, { H: 4, W: 4, C: 10, kernels: "r40s" }); } finally { dv.destroy(); } } catch (e) { noSg = e.message; }
        KS.push(ok("  ...and r40s on a device made without the subgroups feature is refused by name, not built", /needs a device with the "subgroups" feature -- this one has none \(section 108\)/.test(noSg || ""), noSg || "built"));
    }
    // round 41 (section 109): r41h -- K0h natively where the adapter offers shader-f16 (the Intel; not SwiftShader, so here it SKIPs by
    // name): every half-precision layer's cells conv2dCpuF16's or its mirror's, the f32 head through the image, the image within
    // F16_IMAGE_TOL of the f64 network; and on the small network. KH keeps the native rows. A device without the feature refuses r41h
    // by name whatever the adapter offers -- which runs everywhere.
    const native41 = featureSetsFor(NATIVE, nativeSetsFor(NATIVE, ["r41h"], { compiler: COMPILER })), KH = [];
    if (!native41.includes("r41h")) console.log(`  SKIP  K0h natively for r41h: ${NATIVE && NATIVE.features && NATIVE.features.has("shader-f16") ? `one of FXC_UNTRIED_SETS, on a D3D12 adapter whose run compiles with ${compilerSaid} -- FXC has no 16-bit types` : "the adapter has no shader-f16 feature"} (section 109)`);
    else {
        const jobH = async (n, xx, h, w, C) => { const a = await gpu.requestAdapter(), dv = await a.requestDevice({ requiredFeatures: ["shader-f16"] });
            try { const D = await createDeviceDenoiser(dv, n, { H: h, W: w, C, kernels: "r41h" }); const out = await D.run(xx, { keep: true }); D.destroy(); return out; } finally { dv.destroy(); } };
        const r41 = await jobH(net, x, HH, WW, 10), J41 = judge(net, x, HH, WW, r41.acts, "r41h"), L41 = deviceLayers(net, "r41h");
        const j41 = judgeHeadApply(x, r41.acts[3], L41[4], r41.y, HH, WW), w64 = worstRel(r41.y, ref, 1e-12);
        k0row("native", "r41h", J41, j41.worst);
        KH.push(ok(`!! *** K0h natively (section 109): the r41h set -- its half-precision layers every cell conv2dCpuF16's or its fused mirror's, given the device's own input; k_head_apply's image within APPLY_TOL; the image within F16_IMAGE_TOL of the f64 network ***`,
            J41.slice(0, 4).every((j) => j.unexplained === 0) && J41.map((j) => j.kernel).join() === "fast_unroll_h,fast_unroll_h,fast_unroll_h,fast_unroll_h,head_apply" && r41.acts[4] === null && j41.worst <= APPLY_TOL && w64 <= F16_IMAGE_TOL,
            J41.slice(0, 4).map((j) => `${j.kernel} ${j.plain}+${j.fused}f${j.unexplained ? "+" + j.unexplained + "?" : ""}`).join(", ") + `; head and kernel ${j41.worst.toExponential(2)}; against f64 ${w64.toExponential(2)}`));
        const rh = await jobH(net9, x9, 13, 11, 9), Lh9 = deviceLayers(net9, "r41h"), Jh = judge(net9, x9, 13, 11, rh.acts, "r41h");
        const jh = judgeHeadApply(x9, rh.acts[Lh9.length - 2], Lh9[Lh9.length - 1], rh.y, 13, 11);
        KH.push(ok("  ...and r41h on the small network, no mask: nine inputs and 16 hidden channels in half precision, every cell explained, the image within its bound",
            Jh.slice(0, -1).every((j) => j.unexplained === 0 && j.kernel === "fast_unroll_h") && jh.worst <= APPLY_TOL, `head and kernel ${jh.worst.toExponential(2)}`));
    }
    {
        let noF16 = null;
        try { const a = await gpu.requestAdapter(), dv = await a.requestDevice(); try { await createDeviceDenoiser(dv, net, { H: 4, W: 4, C: 10, kernels: "r41h" }); } finally { dv.destroy(); } } catch (e) { noF16 = e.message; }
        ok("  round 41 (section 109): r41h on a device made without the shader-f16 feature is refused by name, not built", /needs a device with the "shader-f16" feature -- this one has none \(section 109\)/.test(noF16 || ""), noF16 || "built");
    }
    console.log(`  ----  native K0h for round 41's set on ${nativeAdapterKey(NATIVE && NATIVE.info, process.platform) || "(an adapter with no vendor)"}, compiler ${compilerSaid}: ` +
        (!native41.includes("r41h") ? `r41h not built natively (${NATIVE && NATIVE.features && NATIVE.features.has("shader-f16") ? "one of FXC_UNTRIED_SETS, under FXC" : "no shader-f16 feature"})` : `r41h ${KH.length && KH.every(Boolean) ? "green" : "RED"} (${KH.filter(Boolean).length} of ${KH.length} native rows)`));
    // round 40: the ladder on an adapter WITHOUT subgroups -- this box's adapter has them, so the Intel's case is made here: the real
    // native adapter with the feature hidden. r40s must stand aside by name at every size, and the set beside it still be timed.
    {
        const hide = (a) => new Proxy(a, { get: (t, k) => (k === "features" ? new Set([...t.features].filter((f) => f !== "subgroups")) : (typeof t[k] === "function" ? t[k].bind(t) : t[k])) });
        let L = null, threw = null;
        try { L = await timingLadder(makeDenoiser(4, "he", "kernel", 9), async () => hide(await gpu.requestAdapter()), { sizes: [[8, 8], [16, 16]], sets: ["r15", "r40s"], rounds: 1, maxReps: 3, minReps: 1, warmup: 0 }); }
        catch (e) { threw = String(e.message).slice(0, 200); }
        if (!L) ok("  round 40 (section 108): on an adapter without the subgroups feature the ladder stands r40s aside -- it threw instead", false, threw);
        else ok("  round 40 (section 108): on an adapter without the subgroups feature the ladder stands r40s aside at every size, naming the feature and section 108, and still times the set beside it",
            L.rows.r40s.length === 2 && L.rows.r40s.every((x) => x.skipped && /no subgroups feature/.test(x.reason) && /section 108/.test(x.reason)) && L.rows.r15.every((x) => !x.skipped && x.wall.median > 0),
            `r40s: ${L.rows.r40s.map((x) => x.reason).join(" | ")}; r15 ${L.rows.r15.map((x) => (x.skipped ? "skipped" : x.wall.median.toFixed(1) + " ms")).join(", ")}`);
    }
    // v4849 -- round 19 (section 66)'s condition (1), readable off the rig's report: realGpuRun keeps measured and failing lines,
    // never a PASS or a SKIP, so which round-18 sets' native rows ran here, under which compiler, and whether every one was green
    // is said on one measured line -- by the key nativeAdapterKey gives this adapter
    console.log(`  ----  native K0 for round 18's sets on ${nativeAdapterKey(NATIVE && NATIVE.info, process.platform) || "(an adapter with no vendor)"}, compiler ${compilerSaid}: ` +
        FXC_UNBUILT_SETS.map((s) => (!native18.includes(s) ? `${s} not built natively (one of FXC_UNBUILT_SETS, under FXC)` :
            `${s} ${K18[s].length && K18[s].every(Boolean) ? "green" : "RED"} (${K18[s].filter(Boolean).length} of ${K18[s].length} native rows)`)).join("; "));
    // v4868 -- round 27 (section 83)'s condition, readable off the rig's report the same way: whether r27w's native rows ran, under
    // which compiler, and whether every one was green
    console.log(`  ----  native K0w for round 27's set on ${nativeAdapterKey(NATIVE && NATIVE.info, process.platform) || "(an adapter with no vendor)"}, compiler ${compilerSaid}: ` +
        (!native27.includes("r27w") ? "r27w not built natively (one of FXC_UNTRIED_SETS, under FXC)" : `r27w ${KW.length && KW.every(Boolean) ? "green" : "RED"} (${KW.filter(Boolean).length} of ${KW.length} native rows)`));
    // round 40 (section 108)'s condition C2, readable off the rig's report the same way: whether r40s's native rows ran, and were all green
    console.log(`  ----  native K0s for round 40's set on ${nativeAdapterKey(NATIVE && NATIVE.info, process.platform) || "(an adapter with no vendor)"}, compiler ${compilerSaid}: ` +
        (!native40.includes("r40s") ? `r40s not built natively (${NATIVE && NATIVE.features && NATIVE.features.has("subgroups") ? "one of FXC_UNTRIED_SETS, under FXC" : "no subgroups feature"})` : `r40s ${KS.length && KS.every(Boolean) ? "green" : "RED"} (${KS.filter(Boolean).length} of ${KS.length} native rows)`));
    let refusedC = null;
    // v4852 -- round 20 (section 68): this box's native pick, and the builder held to it. This box picks r15 whatever a caller does,
    // so a builder that ignored the pick would pass section 6's row; here the pick is forced off r15 through a fixture table naming
    // this adapter's own key under DXC (which builds every set), and the denoiser handed back must be built on the set it picked.
    HERE_PICK = nativePick(NATIVE, { compiler: COMPILER, platform: process.platform });
    {
        const ad = await gpu.requestAdapter(), dv = await ad.requestDevice();
        try {
            const fx = { [HERE_PICK.key]: "r18u" };
            const got = await createNativeDenoiser(ad, dv, net, { H: 21, W: 19, C: 10, compiler: "DXC", platform: process.platform, table: fx });
            const ks = got.denoiser.layers.map((L) => L.kernel).join(); got.denoiser.destroy();
            ok("  round 20 (section 68): createNativeDenoiser builds the set it picked -- a fixture table naming this adapter r18u under DXC hands back an r18u denoiser",
                got.kernels === "r18u" && got.key === HERE_PICK.key && ks === deviceLayers(net, "r18u").map((L) => L.kernel).join() && ks !== deviceLayers(net, DEFAULT_KERNELS).map((L) => L.kernel).join(),
                `picked ${got.kernels} (${got.why}); built ${ks}`);
        } finally { dv.destroy(); }
    }
    try { const a = await gpu.requestAdapter(), dv = await a.requestDevice(); try { await createDeviceDenoiser(dv, net, { H: 4, W: 4, C: 9 }); } finally { dv.destroy(); } } catch (e) { refusedC = e.message; }
    ok("  a network handed an input of the wrong width is refused, not read at the wrong stride", /10 input channels was handed an input of 9/.test(refusedC || ""));
    console.log(`  ....  adapter: ${r.adapter}; one ${HH} x ${WW} pass ${r.ms.toFixed(0)} ms (SwiftShader's, a JIT's cost and not a GPU's)`);
} catch (e) { ok("!! the device section ran to its end", false, String(e && e.message || e).slice(0, 200)); }

console.log("\n4. THE PAGE, IN CHROMIUM: denoise.html ON ITS OWN DEVICE");
{
    // the page itself, in an iframe at the engine's origin: family C, a seed outside every split, a 64-sample reference;
    // then a round 11 test seed, which it must refuse before rendering anything
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 120000, args: { seed: 991234, dataset: 35000 }, script: `async (a) => {
        const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = "/denoise.html"; document.body.appendChild(f);
        await new Promise((r) => f.onload = r);
        const d = f.contentDocument, $ = (id) => d.getElementById(id), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const press = async (seed) => {
            $("family").value = "C"; $("seed").value = String(seed); $("refspp").value = "64"; $("status").textContent = "idle"; $("go").click();
            // a deadline, not a measurement: Date, so tools/ship/realGpuRun.mjs reads this gate as exact (a clock read is timing)
            const t = Date.now();
            while (Date.now() - t < 100000) { const s = $("status").textContent; if (/rendered in|failed|refused/.test(s)) break; await wait(100); }
            return { status: $("status").textContent, cap: $("netCap").textContent, e: ["eNoisy", "eFilter", "eNet"].map((k) => $(k).textContent) };
        };
        const run = await press(a.seed), refused = await press(a.dataset);
        // the key the page looked its set up by, made the page's way in the same browser (section 61)
        const D = await import("/render/denoiseDevice.mjs"), ad = navigator.gpu ? await navigator.gpu.requestAdapter() : null;
        return { run, refused, scope: $("scope").textContent, key: D.pageAdapterKey(ad && ad.info, navigator.userAgentData) };
    }` });
    if (r.skipped) console.log("  SKIP  " + r.reason);
    else {
        const R = r.result || {}, run = R.run || {}, m = /worst relative difference ([0-9.e+-]+)/.exec(run.status || ""), wd = m ? Number(m[1]) : NaN;
        ok("!! *** the page renders a scene of C, runs the network ON ITS DEVICE, and finds the image the f64 network's within f32 rounding -- no page error ***",
            r.ok && !r.pageErrors.length && /on the device/.test(run.cap || "") && wd < 1e-5 && run.e.every((v) => /^\d\.\d{4}$/.test(v)),
            r.ok ? `${(run.status || "").slice(0, 150)}; errors ${r.pageErrors.length}` : r.reason);
        // the set the page must run: the table's for an adapter it names (on the rig's two GPUs since section 63), PAGE_KERNELS otherwise
        const named = !!R.key && Object.hasOwn(PAGE_KERNELS_BY_ADAPTER, R.key), want = pageKernelsFor(R.key);
        ok(`  round 18: ...and the page runs the set section 61's table gives its adapter's key -- ${named ? `${want}, the table's for ${R.key}` : `PAGE_KERNELS (${want}), the key ${R.key || "(none)"} not in the table`} -- and its caption says which`,
            r.ok && new RegExp(`kernels ${want}(?![\\w(])`).test(run.cap || "") && /section 61's for/.test(run.cap || "") === named &&
            (!named || (run.cap || "").includes(`section 61's for ${R.key}`)), (run.cap || "").slice(0, 120));
        ok("  ...and it refuses a round 11 test seed before rendering it, and says above everything that it covers R and C only",
            /35000 belongs to the arc's dataset and is refused/.test(R.refused?.status || "") && /only those/.test(R.scope || "") && /not<\/b>|not trained on/.test(R.scope || ""),
            (R.refused?.status || "").slice(0, 100));
    }
}

console.log("\n5. EVERY KERNEL SET IN THE BROWSER, CELL FOR CELL (rounds 13-15, 18 and 27, sections 39, 43, 46, 61 and 83, K0 (c))");
{
    // in the engine's origin, on the browser's own adapter: the large network drawn from a seed, both sets run with every
    // layer read back, and each cell judged against the twin and the fused mirror in the page itself -- an adapter per set,
    // as a browser's adapter gives one device
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 480000, script: `async () => {
        const D = await import("/render/denoiseDevice.mjs"), Cv = await import("/brain/conv2d.mjs"), N = await import("/render/denoiseNet.mjs");
        const net = N.makeDenoiser(3, "he", "kernel", 10, "large"), h = 21, w = 19, x = D.timingInput(h, w, 10, 7), out = {}, y64 = N.denoise(net, x, h, w).y;
        if (!navigator.gpu) return { error: "no navigator.gpu" };
        for (const set of D.KERNEL_SETS) {
            const a = await navigator.gpu.requestAdapter(); if (!a) return { error: "no adapter" };
            // round 40: a set the adapter's features cannot build stands aside by name; the feature asked for where offered
            if (!D.featureSetsFor(a, [set]).length) { out[set] = { aside: "the adapter has no " + D.SET_FEATURES[set] + " feature (" + (set === "r41h" ? "section 109" : "section 108") + ")" }; continue; }
            const dev = await a.requestDevice({ requiredFeatures: ["subgroups", "shader-f16"].filter((f) => a.features.has(f)) });
            try {
                const Dn = await D.createDeviceDenoiser(dev, net, { H: h, W: w, C: 10, kernels: set, subgroupMinSize: a.info && a.info.subgroupMinSize }), res = await Dn.run(x, { keep: true });
                const DL = D.deviceLayers(net, set), fusedLast = DL[DL.length - 1].kernel === "head_apply";
                const layers = DL.map((L, i) => {
                    if (L.kernel === "head_apply") return { kernel: L.kernel, plain: 0, fused: 0, unexplained: 0 };
                    const input = i ? res.acts[i - 1] : Float32Array.from(x), T = D.twinsOf(L), tw = T.twin(input, h, w, L), fm = T.mirror(input, h, w, L);
                    let plain = 0, fused = 0, unexplained = 0;
                    for (let j = 0; j < tw.length; j++) { const v = res.acts[i][j]; if (v === tw[j]) plain++; else if (v === fm[j]) fused++; else unexplained++; }
                    return { kernel: L.kernel, plain, fused, unexplained };
                });
                // a fused last pass is judged through its image, on the twin's logits and the fused mirror's
                let worst = 0;
                if (fusedLast) worst = D.judgeHeadApply(x, res.acts[DL.length - 2], DL[DL.length - 1], res.y, h, w).worst;
                else { const tw = D.kernelApplyCpu(x, res.acts[res.acts.length - 1], h, w); for (let j = 0; j < tw.length; j++) worst = Math.max(worst, Math.abs(res.y[j] - tw[j]) / (Math.abs(tw[j]) + 1e-30)); }
                let w64 = 0; for (let j = 0; j < y64.length; j++) w64 = Math.max(w64, Math.abs(res.y[j] - y64[j]) / (Math.abs(y64[j]) + 1e-12));
                out[set] = { layers, worst, w64, kernels: Dn.layers.map((L) => L.kernel) };
                Dn.destroy();
            } finally { dev.destroy(); }
        }
        return { out };
    }` });
    if (r.skipped) console.log("  SKIP  " + r.reason);
    else {
        const O = (r.result && r.result.out) || {}, line = (s) => O[s] ? O[s].layers.map((j) => `${j.kernel} ${j.plain}+${j.fused}f${j.unexplained ? "+" + j.unexplained + "?" : ""}`).join(", ") : "not run";
        for (const s of KERNEL_SETS) if (O[s] && !O[s].aside) k0row("browser", s, O[s].layers, O[s].worst);
        for (const s of KERNEL_SETS)
            if (O[s] && O[s].aside) console.log(`  SKIP  K0${s === "r41h" ? "h" : "s"} in the browser for ${s}: ${O[s].aside}`);
            else ok(`!! ${s !== "r12" ? `*** K0${s === "r27w" ? "w" : s === "r40s" ? "s" : s === "r41h" ? "h" : ""} in the browser: ` : ""}the ${s} set in the browser's own device, every cell ${s === "r27w" ? "the Winograd twin's or its fused mirror's" : "the twin's or the fused mirror's"}, the kernel within APPLY_TOL` +
               `${s === "r27w" ? ", the image within 1e-5 of the f64 network (section 83)" : ""}${s !== "r12" ? " ***" : ""}`,
                r.ok && !r.pageErrors.length && !!O[s] && O[s].layers.length === 5 && O[s].layers.every((j) => j.unexplained === 0) && O[s].worst <= APPLY_TOL && (s !== "r27w" || O[s].w64 < 1e-5) && (s !== "r41h" || O[s].w64 <= F16_IMAGE_TOL) &&
                O[s].kernels.join() === { r12: "tiled,tiled,tiled,tiled,direct", r13: "fast,fast,fast,fast,fast", r14: "fast,fast,fast,fast,head", r15: "fast,fast,fast,fast,head_apply",
                                         r18t: "tile_inline,tile_inline,tile_inline,tile_inline,head_apply", r18u: "fast_unroll,fast_unroll,fast_unroll,fast_unroll,head_apply",
                                         r27w: "wino,wino,wino,wino,head_apply", r40s: "fast,sub,sub,sub,head_apply", r41h: "fast_unroll_h,fast_unroll_h,fast_unroll_h,fast_unroll_h,head_apply" }[s],
                r.ok ? `${line(s)}; kernel ${O[s] ? O[s].worst.toExponential(2) : "-"}; image against f64 ${O[s] ? O[s].w64.toExponential(2) : "-"}` + (r.result && r.result.error ? "; " + r.result.error : "") : r.reason);
    }
}

console.log("\n6. ROUND 20 (section 68): THE NATIVE CALLER, RUN AS THE RIG RUNS IT -- tools/denoiseDevice.mjs --which");
// The CLI is createNativeDenoiser's one caller: it reads the compiler off the package as the gates do, takes nativePick's set, builds
// it and runs one 64 x 64 pass against the f64 network. Run here as a child, as on the rig, so the caller -- not a copy of it -- is held.
if (W.refused || skip) console.log("  SKIP  the native caller needs a device here: " + (W.refused || skip));
else {
    const r = spawnSync(process.execPath, [path.join(ENG, "tools", "denoiseDevice.mjs"), "--which"], { cwd: ENG, encoding: "utf8", timeout: 240000 });
    const said = String(r.stdout || ""), m = said.match(/--which: key (\S+); kernels (\S+) -- (.*)/), ran = said.match(/--which: (\S+) built and ran one 64 x 64 pass in ([\d.]+) ms; worst relative difference from the f64 network on the CPU ([\d.e+-]+)/);
    const want = HERE_PICK || { key: null, kernels: null };
    console.log(`  ----  native caller here: ${m ? `key ${m[1]}, kernels ${m[2]} (${m[3]})` : "no pick line"}; ${ran ? `ran in ${ran[2]} ms, worst ${ran[3]}` : "no run line"}`);
    ok("!! round 20 (section 68): the native caller picks what nativePick gives this adapter and this run's compiler, builds it, and runs one pass within 1e-4 of the f64 network",
        r.status === 0 && !!m && !!ran && m[1] === (want.key || "(none)") && m[2] === want.kernels && ran[1] === want.kernels && +ran[3] <= 1e-4,
        `exit ${r.status}; the gate's own pick ${want.key} ${want.kernels}` + (r.status ? "; " + String(r.stderr || said).trim().split("\n").slice(-2).join(" | ") : ""));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the shipped network itself, on the images it was measured on. `node tools/denoiseDevice.mjs --measure-r12` is " +
    "section 35's one command, and no gate runs it; rounds 13-15's, 18's and 27's are `--measure-r13`, `--measure-r14`, `--measure-r15`, `--measure-r18t`, `--measure-r18u` and `--measure-r27w` (K0 (a)).");
if (K0ROWS.length) REPORT.table("K0 on a 21 x 19 image of the large network: each set's conv cells (the twin's, the fused mirror's, unexplained) and its kernel's worst relative error (APPLY_TOL 1e-5)",
    ["path", "set", "plain cells", "fused cells", "unexplained", "worst kernel error"], K0ROWS);
else REPORT.skip("K0 on a device", "no WebGPU device here");
REPORT.write();
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
