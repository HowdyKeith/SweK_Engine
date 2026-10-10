// WebGLEngine/brain/conv2d-selfcheck.mjs -- the denoiser arc, round 1
//
// Run: node brain/conv2d-selfcheck.mjs
//
// GATES brain/conv2d.mjs -- the convolution layer the path-tracer denoiser is built from. Its exports, each named
// here: TILE, K_MAX, CB, COUT_MAX, conv2dForward, conv2dCpu, conv2dCpuFma, conv2dBackward, conv2dWgsl,
// conv2dTiledWgsl, packProbeUniforms, probeFixture, probeCpu, keyCpu, PROBES -- and round 13's (section 39): FAST_GROUP,
// UNIFORM_MAX, fastShape, conv2dFastWgsl, packFastUniforms.
//
// What it holds: the twin to the f64 reference within f32 rounding; the identity kernel exact through every pass;
// a 1x1 convolution BIT-IDENTICAL to the GPU Brain's dense layer (render/brainTsl.mjs's mlpLayerCpu), so the dense
// and the convolutional networks share one arithmetic; the channel-block order load-bearing where it should be and
// invisible where it should be; the backward pass to central finite differences; and all three WGSL kernels to the twin,
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
//
// *** S5 WAS EXPECTED TO GO ZERO RED AND DID NOT. *** A missing barrier is a race, and races hide on a device that
// runs a workgroup's threads one after another. SwiftShader does run them in order -- which is exactly why it is
// caught: the first thread of the next block's load overwrites the tile before the later threads of this block
// have read it, every time. On a real GPU the same defect would be intermittent; here it is deterministic.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
const C = await imp("brain/conv2d.mjs");
const { TILE, K_MAX, CB, COUT_MAX, conv2dForward, conv2dCpu, conv2dCpuFma, conv2dBackward, conv2dWgsl, conv2dTiledWgsl,
        packProbeUniforms, probeFixture, probeCpu, keyCpu, PROBES, FAST_GROUP, UNIFORM_MAX, fastShape, conv2dFastWgsl, packFastUniforms } = C;
const { mlpLayerCpu } = await imp("render/brainTsl.mjs");
const H = await imp("tools/ship/headlessGpu.mjs");

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

console.log("\n6. *** ALL THREE KERNELS ON THE DEVICE, CELL FOR CELL AGAINST THE TWIN ***");
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
        // each entry run through its own packer, inputs and dispatch -- the manifest is what a lab-wide runner would use
        const a = P.args, t = Date.now(), r = await H.runWgslComputeNative({ code: P.code(a), entryPoint: P.entryPoint, outCount: P.outCount(a), uniforms: P.pack(a),
            workgroups: P.workgroups(a), inputs: P.inputs(a) });
        adapter = adapter || r.adapter;
        const j = r.ok ? judge(r, P.args) : null;
        ok(`!! ${P.id} (the manifest's own case, ${P.args.H} x ${P.args.W}, ${P.args.Cin} -> ${P.args.Cout}): every cell the twin's or the fused mirror's`,
            r.ok && j.unexplained === 0, r.ok ? `${j.n - j.fused} plain, ${j.fused} fused, ${j.unexplained} unexplained, ${Date.now() - t} ms` : r.reason + " " + (r.errors || []).join("; "));
        ok(`  ...and the manifest entry is the kernel's: tol ${P.tol}, cpu is probeCpu, ${P.workgroups(P.args).join(" x ")} workgroups`,
            P.tol === 0 && same(P.cpu(P.args), probeCpu(P.args)) && P.outCount(P.args) === P.args.H * P.args.W * P.args.Cout);
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
    console.log(`  ....  adapter: ${adapter ? [adapter.vendor, adapter.architecture, adapter.description].filter(Boolean).join(" / ") : "?"}`);
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: SPEED. No kernel is timed by this gate, because the only device here is SwiftShader, whose costs " +
    "are a JIT's and not a GPU's; render/denoiseTiming-selfcheck.mjs times the denoiser on round 12's kernels and the fast " +
    "one side by side, and a GPU's figures come from the rig (section 39's K1). Nor is there a device BACKWARD pass yet: training starts on the CPU, against " +
    "conv2dBackward, and moves to the device when a measurement says the CPU is the wall.");
H.exitCleanly ? H.exitCleanly(fails ? 1 : 0) : process.exit(fails ? 1 : 0);
