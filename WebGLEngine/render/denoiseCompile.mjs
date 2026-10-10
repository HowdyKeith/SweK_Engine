// WebGLEngine/render/denoiseCompile.mjs -- the denoiser arc, round 14: the kernels section 43's measurement A times
//
// Browser-safe (no node built-ins): render/denoiseCompile-selfcheck.mjs runs these natively, one kernel a process under
// each D3D12 compiler it finds, and in Chromium from the page's own origin. Each kernel the denoiser runs, on a synthetic
// layer of the shipped network's shape at 64 x 64: its job (WGSL, uniforms, inputs, dispatch, and how to judge its output
// against the twin), a measurement of it on a device (the pipeline's build time on the wall clock, the pass on the device's
// clock where it has one), and what a compiler made of it, read from Dawn's shader dump.
"use strict";
import * as Cv from "../brain/conv2d.mjs";
import * as D from "./denoiseDevice.mjs";

const N = 64;   // every kernel is timed at the trained 64 x 64 -- round 13's native head took 1.2 s a pass there

// the kernels, each on a synthetic layer of the shipped network's shape
const conv = (Cin, Cout, k, act, seed) => Cv.probeFixture({ H: N, W: N, Cin, Cout, k, act, seed });
export const VARIANTS = Object.freeze([
    { id: "r12-tiled-3x3", what: "round 12's tiled kernel, 32 -> 32 at 3 x 3", kind: "tiled", L: () => conv(32, 32, 3, "relu", 11) },
    { id: "r13-fast-3x3", what: "the fast kernel, 32 -> 32 at 3 x 3", kind: "fast", L: () => conv(32, 32, 3, "relu", 11) },
    { id: "r12-direct-head", what: "round 12's direct kernel, the 32 -> 81 head", kind: "direct", L: () => conv(32, 81, 1, "none", 13) },
    { id: "r13-fast-head", what: "the fast kernel, the 32 -> 81 head (section 42's slow layer)", kind: "fast", L: () => conv(32, 81, 1, "none", 13) },
    { id: "r14-head", what: "the head kernel, the 32 -> 81 head, planar out", kind: "head", L: () => conv(32, 81, 1, "none", 13) },
    { id: "r12-apply", what: "k_apply, the 81-tap kernel", kind: "apply" },
    { id: "r14-apply-fast", what: "k_apply_fast, planar logits and a halo in workgroup memory", kind: "apply_fast" },
    { id: "r15-head-apply", what: "k_head_apply, the head and the kernel apply in one pass -- on the order probe", kind: "head_apply" },
].map((v) => Object.freeze(v)));

// ---- THE ORDER PROBE (round 15, section 46) -------------------------------------------------------------------------
// k_head_apply stores no logit, so its head's cells cannot be judged one by one -- only the image can. This head makes
// the ORDER of its adds visible in the image, and nothing else: every input is 1 + i/64 (7 significant bits) and every
// weight 8192 + j/8, j in -4..4 (17 bits), so every product is exact in f32 and a fused multiply-add rounds exactly as a
// multiply then an add -- the twin's logits and the fused mirror's are the same bits. The sums are not exact: a logit
// near 3.8e5 keeps 2^-5, and adding in another order moves a logit by up to 0.19 -- measured here on the CPU, the image
// by 0.5% at the median, 99.9% of its values past APPLY_TOL. So an image within APPLY_TOL of the twin's says the head
// added in the twin's order. The common 8192 is the same for every tap, so the softmax sees only the j/8 part: a spread
// of about 16 between a pixel's logits, a kernel neither flat nor one tap.
export function headApplyProbe() {
    const n = N * N, Cin = 32, T = 81;
    let s = 9; const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const A = new Float32Array(n * Cin); for (let i = 0; i < A.length; i++) A[i] = 1 + Math.floor(u() * 64) / 64;
    const L = { Cin, Cout: T, k: 1, act: "none", W: new Float32Array(T * Cin), b: new Float32Array(T) };
    for (let i = 0; i < L.W.length; i++) L.W[i] = 8192 + (Math.floor(u() * 9) - 4) / 8;
    return { A, L, x: D.timingInput(N, N, 10, 5) };
}

// the kernel apply's inputs: a masked image and logits in the head's range, seeded
function applyInputs() {
    const x = D.timingInput(N, N, 10, 5), n = N * N, T = 81, logits = new Float32Array(n * T);
    let s = 7; const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = 0; i < logits.length; i++) logits[i] = Math.fround(u() * 6 - 3);
    const planar = new Float32Array(n * T);
    for (let p = 0; p < n; p++) for (let t = 0; t < T; t++) planar[t * n + p] = logits[p * T + t];
    return { x, logits, planar };
}

/**
 * One kernel's job description: its WGSL, entry, uniforms, inputs (a second uniform block marked `uniform`), dispatch,
 * output count, and how to judge the output.
 */
export function jobFor(v) {
    const n = N * N;
    if (v.kind === "head_apply") {
        const P = headApplyProbe();
        return { code: D.kernelHeadApplyWgsl(P.L), entry: "k_head_apply", uniforms: D.packApplyUniforms({ H: N, W: N, C: 10 }),
                 inputs: [{ binding: 2, data: Cv.packHeadUniforms({ H: N, W: N, layer: P.L }), uniform: true }, { binding: 3, data: P.A }, { binding: 4, data: P.x }],
                 wg: [N / 8, N / 8, 1], out: n * 3,
                 judge: (y) => { const j = D.judgeHeadApply(P.x, P.A, P.L, y, N, N);
                                 return { ok: j.worst <= D.APPLY_TOL, detail: `worst ${j.worst.toExponential(2)} against the twin's logits, which are the fused mirror's here (APPLY_TOL ${D.APPLY_TOL})` }; } };
    }
    if (v.kind === "apply" || v.kind === "apply_fast") {
        const A = applyInputs(), fast = v.kind === "apply_fast";
        return { code: fast ? D.kernelApplyFastWgsl() : D.kernelApplyWgsl(), entry: fast ? "k_apply_fast" : "k_apply",
                 uniforms: D.packApplyUniforms({ H: N, W: N, C: 10 }), inputs: [{ binding: 2, data: fast ? A.planar : A.logits }, { binding: 3, data: A.x }],
                 wg: [N / 8, N / 8, 1], out: n * 3,
                 judge: (y) => { const tw = D.kernelApplyCpu(A.x, A.logits, N, N); let w = 0; for (let i = 0; i < tw.length; i++) w = Math.max(w, Math.abs(y[i] - tw[i]) / (Math.abs(tw[i]) + 1e-30));
                                 return { ok: w <= D.APPLY_TOL, detail: `worst ${w.toExponential(2)} (APPLY_TOL ${D.APPLY_TOL})` }; } };
    }
    const F = v.L(), L = F.layer, tw = Cv.conv2dCpu(F.x, N, N, L), fm = Cv.conv2dCpuFma(F.x, N, N, L);
    const judge = (y) => { let plain = 0, fused = 0, un = 0; for (let i = 0; i < tw.length; i++) { const c = Math.fround(y[i]); if (c === tw[i]) plain++; else if (c === fm[i]) fused++; else un++; }
                           return { ok: un === 0, detail: `${plain} plain, ${fused} fused, ${un} unexplained` }; };
    if (v.kind === "fast") return { code: Cv.conv2dFastWgsl(L), entry: "k_conv_fast", uniforms: Cv.packFastUniforms({ H: N, W: N, layer: L }),
                                    inputs: [{ binding: 2, data: F.x }], wg: [N / 8, N / 8, Cv.fastShape(L).groups], out: n * L.Cout, judge };
    if (v.kind === "head") return { code: Cv.conv2dHeadWgsl(L), entry: "k_head", uniforms: Cv.packHeadUniforms({ H: N, W: N, layer: L }),
                                    inputs: [{ binding: 2, data: F.x }], wg: [Math.ceil(n / 64), Cv.headShape(L).C4, 1], out: n * L.Cout,
                                    judge: (y) => judge(Cv.planarToChannelsLast(y, n, L.Cout)) };
    const tiled = v.kind === "tiled";
    return { code: tiled ? Cv.conv2dTiledWgsl() : Cv.conv2dWgsl(), entry: tiled ? "k_conv_tiled" : "k_conv",
             uniforms: Cv.packProbeUniforms({ H: N, W: N, Cin: L.Cin, Cout: L.Cout, k: L.k, act: L.act, tiled }),
             inputs: [{ binding: 2, data: F.x }, { binding: 3, data: L.W }, { binding: 4, data: L.b }], wg: [N / 8, N / 8, 1], out: n * L.Cout, judge };
}

/**
 * Build one job on `dev` and time it: the shader module and pipeline built (createComputePipelineAsync, timed by the wall
 * clock -- there is no device clock for a build), one untimed pass, then timed passes until 3 or 1.5 s of them, each on the
 * device's clock where it has timestamp queries, else submit to queue done; the output read back and judged.
 */
export async function measure(dev, job, { now = () => performance.now(), budgetMs = 1500 } = {}) {
    const BU = { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, UNIFORM: 0x40, STORAGE: 0x80, QUERY_RESOLVE: 0x200 };
    const t0 = now();
    const mod = dev.createShaderModule({ code: job.code });
    const info = mod.getCompilationInfo ? await mod.getCompilationInfo() : { messages: [] };
    const errs = info.messages.filter((m) => m.type === "error").map((m) => `${m.lineNum}:${m.linePos} ${m.message}`);
    if (errs.length) return { built: false, reason: "WGSL did not compile: " + errs.join("; ") };
    let pipe;
    try { pipe = await dev.createComputePipelineAsync({ layout: "auto", compute: { module: mod, entryPoint: job.entry } }); }
    catch (e) { return { built: false, reason: "pipeline: " + String(e && e.message || e).slice(0, 200) }; }
    const buildMs = now() - t0;
    const owned = [], buf = (bytes, usage, data) => { const b = dev.createBuffer({ size: Math.max(16, bytes), usage }); if (data) dev.queue.writeBuffer(b, 0, data); owned.push(b); return b; };
    try {
        const out = buf(job.out * 4, BU.STORAGE | BU.COPY_SRC | BU.COPY_DST);
        const entries = [{ binding: 0, resource: { buffer: out } }, { binding: 1, resource: { buffer: buf(job.uniforms.byteLength, BU.UNIFORM | BU.COPY_DST, job.uniforms) } },
                         ...job.inputs.map((i) => ({ binding: i.binding, resource: { buffer: buf(i.data.byteLength, (i.uniform ? BU.UNIFORM : BU.STORAGE) | BU.COPY_DST, i.data) } }))];
        const bind = dev.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries });
        const ts = !!(dev.features && dev.features.has("timestamp-query"));
        const qs = ts ? dev.createQuerySet({ type: "timestamp", count: 2 }) : null;
        const res = ts ? buf(16, BU.QUERY_RESOLVE | BU.COPY_SRC) : null, rd = ts ? buf(16, BU.COPY_DST | BU.MAP_READ) : null;
        const pass = (timed) => {
            const enc = dev.createCommandEncoder();
            const p = enc.beginComputePass(timed && ts ? { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
            p.setPipeline(pipe); p.setBindGroup(0, bind); p.dispatchWorkgroups(...job.wg); p.end();
            if (timed && ts) { enc.resolveQuerySet(qs, 0, 2, res, 0); enc.copyBufferToBuffer(res, 0, rd, 0, 16); }
            return enc.finish();
        };
        dev.queue.submit([pass(false)]); await dev.queue.onSubmittedWorkDone();
        const times = []; let spent = 0;
        while (times.length < 3 || (spent < budgetMs && times.length < 30)) {
            const cb = pass(true), t = now();
            dev.queue.submit([cb]); await dev.queue.onSubmittedWorkDone();
            const wall = now() - t; spent += wall;
            if (ts) { await rd.mapAsync(BU.MAP_READ); const st = new BigUint64Array(rd.getMappedRange().slice(0)); rd.unmap(); times.push(Number(st[1] - st[0]) / 1e6); }
            else times.push(wall);
            if (spent > 4 * budgetMs) break;
        }
        const rb = dev.createBuffer({ size: job.out * 4, usage: BU.COPY_DST | BU.MAP_READ });
        const enc = dev.createCommandEncoder(); enc.copyBufferToBuffer(out, 0, rb, 0, job.out * 4); dev.queue.submit([enc.finish()]);
        await rb.mapAsync(BU.MAP_READ); const y = new Float32Array(rb.getMappedRange().slice(0)); rb.unmap(); rb.destroy();
        qs?.destroy();
        const j = job.judge(y), s = [...times].sort((a, b) => a - b);
        return { built: true, buildMs, passMs: s[Math.floor(s.length / 2)], passes: s.length, clock: ts ? "device" : "wall", exact: j.ok, detail: j.detail };
    } finally { for (const b of owned) b.destroy(); }
}

/**
 * What a compiler made of a kernel, counted from Dawn's dump: which compiler, and the shape of the code. The dump holds
 * every shader the process built -- Dawn's own included (it resolves timestamp queries with an internal compute shader) --
 * so the kernel's is found by its WGSL: the "// Dumped WGSL:" block that declares `fn <entry>`, and the disassembly after it.
 */
export function dumpStats(text, entry) {
    const blocks = String(text || "").split("// Dumped WGSL:").slice(1);
    const s = blocks.find((b) => new RegExp(`fn\\s+${entry}\\b`).test(b)) || "";
    const compiler = /Dumped disassembled DXIL/.test(s) ? "DXC (DXIL)" : /Dumped disassembled DXBC/.test(s) ? "FXC (DXBC)" : /Dumped SPIRV/.test(s) ? "SPIR-V (no D3D compiler)" : "unknown (no dump)";
    const i = Math.max(s.lastIndexOf("Dumped disassembled DX"), s.lastIndexOf("Dumped SPIRV"));
    const body = i >= 0 ? s.slice(i) : "";
    const lines = body.split("\n");
    return { compiler, lines: lines.length,
             loops: lines.filter((l) => /^\s*loop\b|\bbr\b.*loop|OpLoopMerge/.test(l)).length,
             indexableTemps: lines.filter((l) => /dcl_indexableTemp|\bx\d+\[/.test(l)).length,
             barriers: lines.filter((l) => /sync_g|sync_t|OpControlBarrier|barrier/.test(l)).length };
}

