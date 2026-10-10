// WebGLEngine/render/denoiseDevice-selfcheck.mjs -- the denoiser arc, round 12
//
// Run: node render/denoiseDevice-selfcheck.mjs
//
// GATES render/denoiseDevice.mjs -- the kernel-predicting network's forward pass and its kernel on a GPUDevice
// (pre-registration section 35). Its exports, each named here: APPLY_TOL, kernelApplyWgsl, packApplyUniforms,
// kernelApplyCpu, kernelFor, deviceLayers, denoiseTwin, createDeviceDenoiser, encodeNet, decodeNet, KERNEL_SETS,
// DEFAULT_KERNELS -- and, held by
// render/denoiseTiming-selfcheck.mjs rather than here (section 37), TIMING_SIZES, largestBuffer, timingInput, summarize,
// adapterOf, timingDevice and timingLadder. What it holds: the
// apply twin is render/denoiseNet.mjs's f64 kernel within f32 rounding, mask and borders included; the head runs on the
// direct kernel and every other layer of the large network on the tiled one; on Dawn, every conv cell is the twin's or
// the fused mirror's given the device's own input to that layer, the kernel is its twin within APPLY_TOL, and the whole
// pass is the f64 network's within f32 rounding; the shipped network decodes to its shape bit for bit; and the page,
// denoise.html, in Chromium, runs the network on ITS device and finds it the f64 network's, refusing a dataset seed.
// Round 13 (section 39): both kernel sets, r12 and the fast r13, held to the same twin cell for cell -- natively on Dawn
// (section 3), and in the browser's own origin (section 5) -- K0's (b) and (c) on the rig.
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
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const { APPLY_TOL, kernelApplyWgsl, packApplyUniforms, kernelApplyCpu, kernelFor, deviceLayers, denoiseTwin, createDeviceDenoiser, encodeNet, decodeNet,
        KERNEL_SETS, DEFAULT_KERNELS } = await imp("render/denoiseDevice.mjs");
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
    const L = deviceLayers(net);
    ok(`!! the large network's four hidden layers run TILED and its head of ${KERNEL_TAPS} logits DIRECT -- past the tiled kernel's COUT_MAX ${COUT_MAX}, on the kernel that never had one`,
        L.map((l) => l.kernel).join() === "tiled,tiled,tiled,tiled,direct" && L[4].Cout === KERNEL_TAPS && KERNEL_TAPS > COUT_MAX &&
        kernelFor({ k: 3, Cout: COUT_MAX }) === "tiled" && kernelFor({ k: 3, Cout: COUT_MAX + 1 }) === "direct" && kernelFor({ k: 5, Cout: 4 }) === "direct");
    const L13 = deviceLayers(net, "r13");
    let noSet = null; try { kernelFor({ k: 3, Cout: 4, Cin: 4 }, "r14"); } catch (e) { noSet = e.message; }
    ok(`!! round 13: the r13 set runs every layer of the large network on the fast kernel, the ${KERNEL_TAPS}-logit head among them -- the default stays ${DEFAULT_KERNELS} (section 39)`,
        L13.map((l) => l.kernel).join() === "fast,fast,fast,fast,fast" && KERNEL_SETS.join() === "r12,r13" && DEFAULT_KERNELS === "r12" &&
        deviceLayers(net).map((l) => l.kernel).join() === L.map((l) => l.kernel).join() && kernelFor({ Cin: 64, Cout: 32, k: 3 }, "r13") === "tiled" && /no kernel set "r14"/.test(noSet || ""),
        "a layer too big for one uniform binding (64 -> 32 at 3 x 3) falls back to its r12 kernel; an unknown set is refused by name");
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
    const job = async (net, x, h, w, C, kernels = DEFAULT_KERNELS) => {
        const adapter = await gpu.requestAdapter(), dev = await adapter.requestDevice(), info = adapter.info || {};
        try {
            const D = await createDeviceDenoiser(dev, net, { H: h, W: w, C, kernels });
            const out = await D.run(x, { keep: true });
            D.destroy();
            return { ...out, adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") };
        } finally { dev.destroy(); }
    };
    // each layer judged on the device's OWN input to it: the twin's cell, or the fused mirror's, or unexplained
    const judge = (net, x, h, w, acts, set = DEFAULT_KERNELS) => deviceLayers(net, set).map((L, i) => {
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
    // round 13: the fast set, the same network and image -- section 39's K0, natively
    const r13 = await job(net, x, HH, WW, 10, "r13"), J13 = judge(net, x, HH, WW, r13.acts, "r13");
    const w13 = worstRel(r13.y, kernelApplyCpu(x, r13.acts[4], HH, WW));
    ok(`!! *** K0 natively: the r13 set -- the fast kernel on all five layers -- every cell the twin's or the fused mirror's, given the device's own input; the kernel within APPLY_TOL ***`,
        J13.every((j) => j.unexplained === 0) && J13.every((j) => j.kernel === "fast") && w13 <= APPLY_TOL && worstRel(r13.y, ref, 1e-12) < 1e-5,
        J13.map((j) => `${j.kernel} ${j.plain}+${j.fused}f`).join(", ") + `; kernel ${w13.toExponential(2)}`);
    const noneFused = [...J, ...J13].every((j) => j.fused === 0);
    ok("  ...and where no layer of either set fused a cell, the two sets' images are the same bits", !noneFused || r13.y.every((v, i) => Object.is(v, r.y[i])),
        noneFused ? "no cell fused in either set on this device: the images must agree exactly" : "a set fused cells here, so the images may differ where it did");
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
    // nine channels, no mask, the small network: the mask test off
    const net9 = makeDenoiser(4, "he", "kernel", 9), x9 = synth(13, 11, 9, 8), r9 = await job(net9, x9, 13, 11, 9);
    const J9 = judge(net9, x9, 13, 11, r9.acts);
    ok("  the small network on nine channels, no mask: every layer explained, the kernel within its bound",
        J9.every((j) => j.unexplained === 0) && worstRel(r9.y, kernelApplyCpu(x9, r9.acts[r9.acts.length - 1], 13, 11)) <= APPLY_TOL, J9.map((j) => j.kernel).join(","));
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

console.log("\n5. BOTH KERNEL SETS IN THE BROWSER, CELL FOR CELL (round 13, section 39's K0 (c))");
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
                const layers = D.deviceLayers(net, set).map((L, i) => {
                    const input = i ? res.acts[i - 1] : Float32Array.from(x), tw = Cv.conv2dCpu(input, h, w, L), fm = Cv.conv2dCpuFma(input, h, w, L);
                    let plain = 0, fused = 0, unexplained = 0;
                    for (let j = 0; j < tw.length; j++) { const v = res.acts[i][j]; if (v === tw[j]) plain++; else if (v === fm[j]) fused++; else unexplained++; }
                    return { kernel: L.kernel, plain, fused, unexplained };
                });
                const tw = D.kernelApplyCpu(x, res.acts[res.acts.length - 1], h, w);
                let worst = 0; for (let j = 0; j < tw.length; j++) worst = Math.max(worst, Math.abs(res.y[j] - tw[j]) / (Math.abs(tw[j]) + 1e-30));
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
            ok(`!! ${s === "r13" ? "*** K0 in the browser: " : ""}the ${s} set in the browser's own device, every cell the twin's or the fused mirror's, the kernel within APPLY_TOL${s === "r13" ? " ***" : ""}`,
                r.ok && !r.pageErrors.length && !!O[s] && O[s].layers.length === 5 && O[s].layers.every((j) => j.unexplained === 0) && O[s].worst <= APPLY_TOL &&
                O[s].kernels.join() === (s === "r13" ? "fast,fast,fast,fast,fast" : "tiled,tiled,tiled,tiled,direct"),
                r.ok ? `${line(s)}; kernel ${O[s] ? O[s].worst.toExponential(2) : "-"}` + (r.result && r.result.error ? "; " + r.result.error : "") : r.reason);
    }
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: the shipped network itself, on the images it was measured on. `node tools/denoiseDevice.mjs --measure-r12` is " +
    "section 35's one command, and no gate runs it; round 13's is `--measure-r13` (section 39's K0 (a)).");
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
