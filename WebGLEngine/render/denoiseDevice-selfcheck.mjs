// WebGLEngine/render/denoiseDevice-selfcheck.mjs -- the denoiser arc, round 12
//
// Run: node render/denoiseDevice-selfcheck.mjs
//
// GATES render/denoiseDevice.mjs -- the kernel-predicting network's forward pass and its kernel on a GPUDevice
// (pre-registration section 35). Its exports, each named here: APPLY_TOL, kernelApplyWgsl, packApplyUniforms,
// kernelApplyCpu, kernelFor, deviceLayers, denoiseTwin, createDeviceDenoiser, encodeNet, decodeNet, KERNEL_SETS,
// DEFAULT_KERNELS, round 14's PAGE_KERNELS, applyFor and kernelApplyFastWgsl, and round 15's kernelHeadApplyWgsl and
// judgeHeadApply -- and, held by
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
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { APPLY_TOL, kernelApplyWgsl, packApplyUniforms, kernelApplyCpu, kernelFor, deviceLayers, denoiseTwin, createDeviceDenoiser, encodeNet, decodeNet,
        KERNEL_SETS, DEFAULT_KERNELS, PAGE_KERNELS, applyFor, kernelApplyFastWgsl, kernelHeadApplyWgsl, judgeHeadApply } = await imp("render/denoiseDevice.mjs");
const CMP = await imp("render/denoiseCompile.mjs");
const { makeDenoiser, denoise, KERNEL_TAPS, shapeFor, paramCount } = await imp("render/denoiseNet.mjs");
const { conv2dCpu, conv2dCpuFma, COUT_MAX } = await imp("brain/conv2d.mjs");
const { seededRandom } = await imp("brain/convNet.mjs");
const { ALBEDO_FLOOR } = await imp("render/denoiseScenes.mjs");
const H = await imp("tools/ship/headlessGpu.mjs");
const { runInEngineOrigin } = await imp("tools/ship/webgpuHarness.mjs");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
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
        L13.map((l) => l.kernel).join() === "fast,fast,fast,fast,fast" && KERNEL_SETS.join() === "r12,r13,r14,r15" &&
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
}

console.log("\n3. *** THE WHOLE PASS ON THE DEVICE (Dawn) ***");
const skip = H.headlessGpuSkipReason ? H.headlessGpuSkipReason() : null;
if (skip) console.log("  SKIP  " + skip);
else try {
    H.configureVulkanIcd();
    const { mod } = H.resolveWebgpu(), gpu = mod.create([]);
    // one job: a fresh adapter and device, the network built and run, everything read back, the device destroyed --
    // before any CPU work long enough to matter
    // round 12's kernels unless told otherwise -- the rows below that name no set are about them, whatever the default is
    const job = async (net, x, h, w, C, kernels = "r12") => {
        const adapter = await gpu.requestAdapter(), dev = await adapter.requestDevice(), info = adapter.info || {};
        try {
            const D = await createDeviceDenoiser(dev, net, { H: h, W: w, C, kernels });
            const out = await D.run(x, { keep: true });
            D.destroy();
            return { ...out, adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") };
        } finally { dev.destroy(); }
    };
    // each layer judged on the device's OWN input to it: the twin's cell, or the fused mirror's, or unexplained -- except a
    // fused last layer (r15's k_head_apply), which stores no cell and is judged through the image (judgeHeadApply)
    const judge = (net, x, h, w, acts, set = "r12") => deviceLayers(net, set).map((L, i) => {
        if (L.kernel === "head_apply") return { kernel: L.kernel, plain: 0, fused: 0, unexplained: 0, image: true };
        const input = i ? acts[i - 1] : Float32Array.from(x), tw = conv2dCpu(input, h, w, L), fm = conv2dCpuFma(input, h, w, L);
        let plain = 0, fused = 0, unexplained = 0;
        for (let j = 0; j < tw.length; j++) { const v = acts[i][j]; if (v === tw[j]) plain++; else if (v === fm[j]) fused++; else unexplained++; }
        return { kernel: L.kernel, plain, fused, unexplained };
    });
    const net = makeDenoiser(3, "he", "kernel", 10, "large"), x = synth(HH, WW, 10, 7);
    const r = await job(net, x, HH, WW, 10);
    const J = judge(net, x, HH, WW, r.acts);
    ok(`!! *** every cell of every layer, on the device, is the twin's or the fused mirror's, given the device's own input to that layer -- the head of ${KERNEL_TAPS} on the direct kernel among them ***`,
        J.every((j) => j.unexplained === 0) && J[4].kernel === "direct", J.map((j) => `${j.kernel} ${j.plain}+${j.fused}f`).join(", "));
    const tw = kernelApplyCpu(x, r.acts[4], HH, WW), wa = worstRel(r.y, tw);
    ok(`!! the kernel on the device is its twin within APPLY_TOL ${APPLY_TOL} on every value -- exp and division are not correctly rounded in WGSL, so it is held to a bound, not to bits`,
        wa <= APPLY_TOL, `worst relative ${wa.toExponential(2)}, ${(APPLY_TOL / Math.max(wa, 1e-30)).toFixed(0)} x inside`);
    const ref = denoise(net, x, HH, WW).y, wf = worstRel(r.y, ref, 1e-12);
    ok("  the whole pass on the device is the f64 network's output within f32 rounding", wf < 1e-5, `worst relative ${wf.toExponential(2)}`);
    // round 14: the r14 set, the same network and image -- section 43's K0, natively (r13's is section 42's)
    const r14 = await job(net, x, HH, WW, 10, "r14"), J14 = judge(net, x, HH, WW, r14.acts, "r14");
    const w14 = worstRel(r14.y, kernelApplyCpu(x, r14.acts[4], HH, WW));
    ok(`!! *** K0 natively: the r14 set -- the fast kernel, the head kernel's planar logits (read back and judged channels last), and k_apply_fast -- every cell the twin's or the fused mirror's, given the device's own input; the kernel within APPLY_TOL ***`,
        J14.every((j) => j.unexplained === 0) && J14.map((j) => j.kernel).join() === "fast,fast,fast,fast,head" && w14 <= APPLY_TOL && worstRel(r14.y, ref, 1e-12) < 1e-5,
        J14.map((j) => `${j.kernel} ${j.plain}+${j.fused}f`).join(", ") + `; kernel ${w14.toExponential(2)}`);
    const noneFused = [...J, ...J14].every((j) => j.fused === 0);
    ok("  ...and where no layer of either set fused a cell, the two sets' images are the same bits", !noneFused || r14.y.every((v, i) => Object.is(v, r.y[i])),
        noneFused ? "no cell fused in either set on this device: the images must agree exactly" : "a set fused cells here, so the images may differ where it did");
    // round 15: the r15 set, the same network and image -- section 46's K0, natively
    const r15 = await job(net, x, HH, WW, 10, "r15"), J15 = judge(net, x, HH, WW, r15.acts, "r15"), L15 = deviceLayers(net, "r15");
    const j15 = judgeHeadApply(x, r15.acts[3], L15[4], r15.y, HH, WW);
    ok(`!! *** K0 natively: the r15 set -- the fast kernel's hidden layers every cell the twin's or the fused mirror's, and k_head_apply's image within APPLY_TOL of kernelApplyCpu on the twin's logits or the fused mirror's, from the device's own input to the head ***`,
        J15.slice(0, 4).every((j) => j.unexplained === 0) && J15.map((j) => j.kernel).join() === "fast,fast,fast,fast,head_apply" && r15.acts[4] === null &&
        j15.worst <= APPLY_TOL && worstRel(r15.y, ref, 1e-12) < 1e-5,
        J15.slice(0, 4).map((j) => `${j.kernel} ${j.plain}+${j.fused}f`).join(", ") + `; head and kernel ${j15.worst.toExponential(2)} (twin ${j15.twin.toExponential(2)}, mirror ${j15.mirror.toExponential(2)})`);
    const none15 = [...J14, ...J15].every((j) => j.fused === 0);
    ok("  ...and where no cell of r14 or r15 fused, r15's image is r14's, bit for bit -- the same logits, summed by k_apply_fast's order", !none15 || r15.y.every((v, i) => Object.is(v, r14.y[i])),
        none15 ? "no cell fused in either set on this device: the images must agree exactly" : "a set fused cells here, so the images may differ where it did");
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
    let refusedC = null;
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
        return { run, refused, scope: $("scope").textContent };
    }` });
    if (r.skipped) console.log("  SKIP  " + r.reason);
    else {
        const R = r.result || {}, run = R.run || {}, m = /worst relative difference ([0-9.e+-]+)/.exec(run.status || ""), wd = m ? Number(m[1]) : NaN;
        ok("!! *** the page renders a scene of C, runs the network ON ITS DEVICE, and finds the image the f64 network's within f32 rounding -- no page error ***",
            r.ok && !r.pageErrors.length && /on the device/.test(run.cap || "") && wd < 1e-5 && run.e.every((v) => /^\d\.\d{4}$/.test(v)),
            r.ok ? `${(run.status || "").slice(0, 150)}; errors ${r.pageErrors.length}` : r.reason);
        ok("  ...and it refuses a round 11 test seed before rendering it, and says above everything that it covers R and C only",
            /35000 belongs to the arc's dataset and is refused/.test(R.refused?.status || "") && /only those/.test(R.scope || "") && /not<\/b>|not trained on/.test(R.scope || ""),
            (R.refused?.status || "").slice(0, 100));
    }
}

console.log("\n5. EVERY KERNEL SET IN THE BROWSER, CELL FOR CELL (rounds 13-15, sections 39, 43 and 46, K0 (c))");
{
    // in the engine's origin, on the browser's own adapter: the large network drawn from a seed, both sets run with every
    // layer read back, and each cell judged against the twin and the fused mirror in the page itself -- an adapter per set,
    // as a browser's adapter gives one device
    const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, script: `async () => {
        const D = await import("/render/denoiseDevice.mjs"), Cv = await import("/brain/conv2d.mjs"), N = await import("/render/denoiseNet.mjs");
        const net = N.makeDenoiser(3, "he", "kernel", 10, "large"), h = 21, w = 19, x = D.timingInput(h, w, 10, 7), out = {};
        if (!navigator.gpu) return { error: "no navigator.gpu" };
        for (const set of D.KERNEL_SETS) {
            const a = await navigator.gpu.requestAdapter(); if (!a) return { error: "no adapter" };
            const dev = await a.requestDevice();
            try {
                const Dn = await D.createDeviceDenoiser(dev, net, { H: h, W: w, C: 10, kernels: set }), res = await Dn.run(x, { keep: true });
                const DL = D.deviceLayers(net, set), fusedLast = DL[DL.length - 1].kernel === "head_apply";
                const layers = DL.map((L, i) => {
                    if (L.kernel === "head_apply") return { kernel: L.kernel, plain: 0, fused: 0, unexplained: 0 };
                    const input = i ? res.acts[i - 1] : Float32Array.from(x), tw = Cv.conv2dCpu(input, h, w, L), fm = Cv.conv2dCpuFma(input, h, w, L);
                    let plain = 0, fused = 0, unexplained = 0;
                    for (let j = 0; j < tw.length; j++) { const v = res.acts[i][j]; if (v === tw[j]) plain++; else if (v === fm[j]) fused++; else unexplained++; }
                    return { kernel: L.kernel, plain, fused, unexplained };
                });
                // a fused last pass is judged through its image, on the twin's logits and the fused mirror's
                let worst = 0;
                if (fusedLast) worst = D.judgeHeadApply(x, res.acts[DL.length - 2], DL[DL.length - 1], res.y, h, w).worst;
                else { const tw = D.kernelApplyCpu(x, res.acts[res.acts.length - 1], h, w); for (let j = 0; j < tw.length; j++) worst = Math.max(worst, Math.abs(res.y[j] - tw[j]) / (Math.abs(tw[j]) + 1e-30)); }
                out[set] = { layers, worst, kernels: Dn.layers.map((L) => L.kernel) };
                Dn.destroy();
            } finally { dev.destroy(); }
        }
        return { out };
    }` });
    if (r.skipped) console.log("  SKIP  " + r.reason);
    else {
        const O = (r.result && r.result.out) || {}, line = (s) => O[s] ? O[s].layers.map((j) => `${j.kernel} ${j.plain}+${j.fused}f${j.unexplained ? "+" + j.unexplained + "?" : ""}`).join(", ") : "not run";
        for (const s of KERNEL_SETS)
            ok(`!! ${s !== "r12" ? "*** K0 in the browser: " : ""}the ${s} set in the browser's own device, every cell the twin's or the fused mirror's, the kernel within APPLY_TOL${s !== "r12" ? " ***" : ""}`,
                r.ok && !r.pageErrors.length && !!O[s] && O[s].layers.length === 5 && O[s].layers.every((j) => j.unexplained === 0) && O[s].worst <= APPLY_TOL &&
                O[s].kernels.join() === { r12: "tiled,tiled,tiled,tiled,direct", r13: "fast,fast,fast,fast,fast", r14: "fast,fast,fast,fast,head", r15: "fast,fast,fast,fast,head_apply" }[s],
                r.ok ? `${line(s)}; kernel ${O[s] ? O[s].worst.toExponential(2) : "-"}` + (r.result && r.result.error ? "; " + r.result.error : "") : r.reason);
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the shipped network itself, on the images it was measured on. `node tools/denoiseDevice.mjs --measure-r12` is " +
    "section 35's one command, and no gate runs it; rounds 13-15's are `--measure-r13`, `--measure-r14` and `--measure-r15` (K0 (a)).");
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
