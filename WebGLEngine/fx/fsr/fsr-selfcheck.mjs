#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsr-selfcheck.mjs -- v4546
//
// FSR1 -- EASU THEN RCAS -- AS AN ALGORITHM RATHER THAN A DEPENDENCY. fx/fsr/fsr.js holds the CPU reference
// (transcriptions of AMD's f32 `FsrEasuF` and `FsrRcasF` from ffx_fsr1.h, MIT) and fx/fsr/fsrKernels.js the WGSL
// that mirrors them statement by statement; this gate runs both on a real WebGPU device through gfx/device.js and
// holds them to the CPU, then checks what each pass is FOR. EASU: it does not blur a flat field, it beats bilinear
// on an edge, it does not ring. RCAS: a flat field is untouched, the sharpness knob is monotone, the denoise pulls
// back on grain and not on edges -- and two things about the limiter that are NOT what they look like, below.
//
// WHY NOT VENDOR @pmndrs/upscaler, MEASURED RATHER THAN ARGUED: its 0.2.0 tarball carries 2,743 lines of WGSL under
// src/shaders that import no three at all, and 3,331 lines of three.js DRIVER around them (Upscaler.ts 1828,
// UpscalerNode.ts 477, types.ts 326, TemporalGuidesNode.ts 274, UpscalePass.ts 208, MomentsPass.ts 157,
// internal/threeWebGPU.ts 61). gfx/device.js already IS that driver. fx/anime4k said the same thing in its own
// header two upscalers ago -- "no aggregator, no external deps, just the algorithm, as a chain of passes" -- and
// this is that, held to a CPU mirror the way anime4k is.
//
// SPATIAL ONLY, AND SAID SO: FSR's temporal path (FSR2/3) wants depth, per-pixel motion vectors and a jittered
// projection with history. This tree has NO motion vectors and no previous-frame view-projection matrix anywhere in
// it, so the temporal path is a later rung with a prerequisite, not something this file half-does.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "../../render/wgslSpec.mjs";
import { easuCPU, rcasCPU, fsr1CPU, bilinearCPU, RCAS_LIMIT } from "./fsr.js";
import { EASU_WGSL, RCAS_WGSL } from "./fsrKernels.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const N = 32, M = 64;   // render 32x32 -> display 64x64, a 2x upscale
// *** TWO PICTURES, BECAUSE ONE NUMBER DOES NOT MEAN THE SAME THING ON BOTH. *** The mixed scene (a diagonal, a
// chequer corner, three channels doing different things) exercises the kernel hardest and is what the CPU and the
// GPU are held to. The EDGE-ADAPTIVE claim is counted on a PURE DIAGONAL, because it counts pixels "in the mushy
// middle" and a one-texel chequer at 2x upscale is legitimately, unavoidably mushy -- EASU leaves 647 intermediate
// pixels on the mixed scene against bilinear's 820 and 67 against 248 on the diagonal, and the first pair says
// nothing about edges. The first draft of this gate measured 3.7x on the diagonal, changed the picture, and kept
// the threshold: a bound carried over from a different measurement, which is what the row went red on.
function mixed(n) {
    const src = new Float32Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = (y * n + x) * 4;
        const edge = (x + y < n) ? 0 : 1;                                 // the diagonal
        const chq = (x > n * 0.6 && y < n * 0.4) ? ((x ^ y) & 1) : edge;   // a chequer corner
        src[i] = chq; src[i + 1] = chq * 0.5 + edge * 0.5; src[i + 2] = 1 - chq; src[i + 3] = 1;
    }
    return src;
}
function diagonal(n) {
    const src = new Float32Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const v = (x + y < n) ? 0 : 1, i = (y * n + x) * 4;
        src[i] = v; src[i + 1] = v; src[i + 2] = v; src[i + 3] = 1;
    }
    return src;
}
const SRC = mixed(N), EDGE = diagonal(N);
const CPU = easuCPU(SRC, N, N, M, M);
const BIL = bilinearCPU(SRC, N, N, M, M);
const CPU_E = easuCPU(EDGE, N, N, M, M), BIL_E = bilinearCPU(EDGE, N, N, M, M);
const midOf = (d) => { let n = 0; for (let i = 0; i < M * M; i++) { const v = d[i * 4]; if (v > 0.06 && v < 0.94) n++; } return n; };

console.log("\n1. ON THE CPU: the reference is EASU and not a blur");
{
    ok("the WGSL validates against the spec scanner", validateWgsl(EASU_WGSL).length === 0, validateWgsl(EASU_WGSL).join("; "));

    // *** A FLAT FIELD MUST COME BACK FLAT. *** This is the degenerate branch of the kernel shaping -- a region with
    // no gradient has no edge direction, and the reference falls back to axis-aligned with zero strength. A kernel
    // that got that wrong would tint every constant area, which is the loudest way an upscaler can be wrong.
    const flat = new Float32Array(8 * 8 * 4);
    for (let i = 0; i < 64; i++) { flat[i * 4] = 0.3; flat[i * 4 + 1] = 0.6; flat[i * 4 + 2] = 0.9; flat[i * 4 + 3] = 1; }
    const f = easuCPU(flat, 8, 8, 16, 16);
    let worstFlat = 0;
    for (let i = 0; i < 256; i++) for (let c = 0; c < 3; c++) worstFlat = Math.max(worstFlat, Math.abs(f.data[i * 4 + c] - [0.3, 0.6, 0.9][c]));
    ok(`a constant field upscales to that constant (worst deviation ${worstFlat.toExponential(2)}, float rounding only)`, worstFlat < 1e-6, worstFlat.toExponential(3));

    // *** IT DERINGS, WHICH IS THE CLAMP'S WHOLE JOB. *** Every output pixel must lie inside the componentwise
    // min/max of the FOUR NEAREST source texels. A 12-tap Lanczos-like kernel with a negative lobe overshoots
    // without this, and overshoot on an edge is the halo the algorithm exists to avoid.
    const S = (x, y, c) => SRC[((y < 0 ? 0 : y > N - 1 ? N - 1 : y) * N + (x < 0 ? 0 : x > N - 1 ? N - 1 : x)) * 4 + c];
    let viol = 0, worstOver = 0;
    for (let py = 0; py < M; py++) for (let px = 0; px < M; px++) {
        const fx = Math.floor((px + 0.5) * N / M - 0.5), fy = Math.floor((py + 0.5) * N / M - 0.5);
        for (let c = 0; c < 3; c++) {
            const n4 = [S(fx, fy, c), S(fx + 1, fy, c), S(fx, fy + 1, c), S(fx + 1, fy + 1, c)];
            const lo = Math.min(...n4), hi = Math.max(...n4), v = CPU.data[(py * M + px) * 4 + c];
            const over = Math.max(lo - v, v - hi);
            if (over > 1e-6) { viol++; worstOver = Math.max(worstOver, over); }
        }
    }
    ok(`*** it DERINGS: every one of ${M * M * 3} output channels lies inside the min/max of the four nearest source texels -- ${viol} outside ***`, viol === 0, `${viol} violations, worst overshoot ${worstOver.toExponential(2)}`);

    // *** AND IT IS EDGE-ADAPTIVE, WHICH IS THE ONLY REASON TO RUN IT INSTEAD OF BILINEAR. *** On a hard diagonal
    // the question is how many output pixels land in the mushy middle. Bilinear smears the step across the whole
    // ramp; EASU rotates its kernel to the edge and keeps it thin.
    const e = midOf(CPU_E.data), b = midOf(BIL_E.data);
    ok(`*** it is EDGE-ADAPTIVE: on a PURE diagonal EASU leaves ${e} intermediate pixels where bilinear leaves ${b} of ${M * M} -- ${(b / e).toFixed(1)}x thinner, and that IS the algorithm ***`, e < b / 2 && e > 0, `easu ${e}, bilinear ${b} (on the mixed scene the same counts are ${midOf(CPU.data)} and ${midOf(BIL.data)}, which is the chequer corner and not the edge)`);
    report(`the same picture through both: EASU and bilinear differ on ${(() => { let n = 0; for (let i = 0; i < M * M; i++) if (Math.abs(CPU.data[i * 4] - BIL.data[i * 4]) > 0.02) n++; return n; })()} of ${M * M} pixels -- an upscaler that agreed with bilinear everywhere would be bilinear`);
}

console.log("\n2. ON THE DEVICE: the WGSL through gfx/device.js, held to the CPU reference");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Section 1 is CPU only; nothing here has run the kernel."); fails++; }
else {
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, M, src: Array.from(SRC), edge: Array.from(EDGE) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { EASU_WGSL } = await import("/fx/fsr/fsrKernels.js");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const u = dev.buffer({ data: new Uint32Array([a.N, a.N, a.M, a.M]), usage: "uniform" });
        const groups = Math.ceil(a.M / 8);
        const run = async (pixels) => {
            const src = dev.buffer({ data: new Float32Array(pixels), usage: ["storage"] });
            const dst = dev.buffer({ data: new Float32Array(a.M * a.M * 4), usage: ["storage"] });
            const p = dev.compute({ wgsl: EASU_WGSL });
            p.bind("src", src).bind("dst", dst).bind("u", u);
            dev.frame(({ pass }) => { pass.dispatch(p, [groups, groups]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(dst)));
        };
        return { out: await run(a.src), outEdge: await run(a.edge), errs, backend: dev.backend };
    }` });
    ok("the harness ran the kernel on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0 && r.result.out.length === M * M * 4,
       r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && r.result.out.length === M * M * 4) {
        const G = r.result.out;
        let worst = 0, same = 0, alphaBad = 0;
        for (let i = 0; i < M * M; i++) {
            for (let c = 0; c < 3; c++) { const d = Math.abs(G[i * 4 + c] - CPU.data[i * 4 + c]); worst = Math.max(worst, d); }
            if (G[i * 4 + 3] !== 1) alphaBad++;
            let eq = true; for (let c = 0; c < 3; c++) if (G[i * 4 + c] !== CPU.data[i * 4 + c]) eq = false;
            if (eq) same++;
        }
        // f32 on the GPU and f64 in JS: the two cannot be bit-identical through a Lanczos accumulation, so the row
        // states the number it MEASURED rather than a tolerance chosen to fit. 1e-6 is the claim; the detail is the fact.
        ok(`*** the picture the GPU computes is the CPU reference's, to ${worst.toExponential(2)} on every one of ${M * M * 3} channels (${same} of ${M * M} pixels bit-identical; the rest is f32 against f64 through a 12-tap accumulation) ***`,
           worst < 1e-6 && alphaBad === 0, `worst ${worst.toExponential(3)}, ${same}/${M * M} exact, ${alphaBad} bad alpha`);
        // and the GPU picture must pass the same two property checks -- a mirror that agrees with a wrong reference
        // is still wrong, so the properties are asserted on the GPU's own output too
        const S = (x, y, c) => SRC[((y < 0 ? 0 : y > N - 1 ? N - 1 : y) * N + (x < 0 ? 0 : x > N - 1 ? N - 1 : x)) * 4 + c];
        let viol = 0;
        for (let py = 0; py < M; py++) for (let px = 0; px < M; px++) {
            const fx = Math.floor((px + 0.5) * N / M - 0.5), fy = Math.floor((py + 0.5) * N / M - 0.5);
            for (let c = 0; c < 3; c++) {
                const n4 = [S(fx, fy, c), S(fx + 1, fy, c), S(fx, fy + 1, c), S(fx + 1, fy + 1, c)];
                if (G[(py * M + px) * 4 + c] < Math.min(...n4) - 1e-6 || G[(py * M + px) * 4 + c] > Math.max(...n4) + 1e-6) viol++;
            }
        }
        ok(`  and the GPU's OWN picture derings: ${viol} of ${M * M * 3} channels outside the four-nearest bounds -- asserted on the device's output, because a mirror that agrees with a wrong reference is still wrong`,
           viol === 0, `${viol} violations`);
        const midG = midOf(r.result.outEdge), midB = midOf(BIL_E.data);
        ok(`  and the GPU's own picture is edge-adaptive on the pure diagonal: ${midG} intermediate pixels against bilinear's ${midB} (${(midB / midG).toFixed(1)}x thinner)`,
           midG > 0 && midG < midB / 2, `gpu ${midG}, cpu ${midOf(CPU_E.data)}, bilinear ${midB}`);
    }
}

console.log("\n3. RCAS, FSR1's OTHER HALF: sharpening that is limited, and two places the limit is not what it looks like");
{
    // *** A FLAT FIELD IS EXACTLY UNCHANGED, AND THAT IS ALGEBRA, NOT A TOLERANCE. *** With all five taps equal the
    // resolve is (lobe*4c + c) / (4*lobe + 1) = c for ANY lobe. A sharpener that tinted flat areas would be wrong in
    // the loudest possible way, and this is the row that would say so.
    const flat = new Float32Array(8 * 8 * 4);
    for (let i = 0; i < 64; i++) { flat[i * 4] = 0.3; flat[i * 4 + 1] = 0.6; flat[i * 4 + 2] = 0.9; flat[i * 4 + 3] = 1; }
    const fr = rcasCPU(flat, 8, 8, 1, false);
    let worstFlat = 0;
    for (let i = 0; i < 64; i++) for (let c = 0; c < 3; c++) worstFlat = Math.max(worstFlat, Math.abs(fr.data[i * 4 + c] - [0.3, 0.6, 0.9][c]));
    ok(`a flat field goes through RCAS unchanged (worst ${worstFlat.toExponential(2)}) -- the lobe cancels in the resolve for any lobe at all`, worstFlat < 1e-6, worstFlat.toExponential(3));

    // *** THE LIMITER'S DENOMINATORS VANISH ON FLAT BLACK AND FLAT WHITE, AND BOTH LANGUAGES HIDE IT. *** MEASURED:
    // WGSL computes 0/0 = NaN there but max(NaN, x) returns x, so the NaN falls through into a lobe of -RCAS_LIMIT;
    // JS's Math.max(NaN, x) returns NaN, so a naive mirror emits NaN for the same pixel. The fall-through is the
    // worse of the two because it is SILENT: a lone white pixel on black resolves to 4.0 and a lone black pixel on
    // white to -3.0, out of a limiter whose whole job is the range. Both sides carry an epsilon now, and this row
    // is the one that would catch its removal.
    const lone = (centre) => { const n = 5, a = new Float32Array(n * n * 4);
        for (let i = 0; i < n * n; i++) { const v = 1 - centre; a[i * 4] = v; a[i * 4 + 1] = v; a[i * 4 + 2] = v; a[i * 4 + 3] = 1; }
        const c = (2 * n + 2) * 4; a[c] = centre; a[c + 1] = centre; a[c + 2] = centre; return { a, n, c }; };
    const wOnB = lone(1), bOnW = lone(0);
    const rw = rcasCPU(wOnB.a, wOnB.n, wOnB.n, 1, false).data[wOnB.c];
    const rb = rcasCPU(bOnW.a, bOnW.n, bOnW.n, 1, false).data[bOnW.c];
    ok(`*** the 0/0 in the limiter is guarded on both sides: a lone WHITE pixel on black stays ${rw.toFixed(3)} and a lone BLACK pixel on white stays ${rb.toFixed(3)} -- unguarded, WGSL's NaN-swallowing max() resolves them to 4.0 and -3.0 ***`,
       Math.abs(rw - 1) < 1e-6 && Math.abs(rb) < 1e-6, `white-on-black ${rw}, black-on-white ${rb}`);

    // a 2-D blurred blob: every cross neighbour differs from the centre, which a 1-D ramp cannot arrange
    const m = 24, blob = new Float32Array(m * m * 4);
    const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
        const v = sm(1 - Math.hypot(x - 12, y - 12) / 7), i = (y * m + x) * 4;
        blob[i] = v; blob[i + 1] = v; blob[i + 2] = v; blob[i + 3] = 1;
    }
    const lap = (d) => { let g = 0; for (let y = 1; y < m - 1; y++) for (let x = 1; x < m - 1; x++) {
        const c = d[(y * m + x) * 4];
        g += Math.abs(4 * c - d[(y * m + x + 1) * 4] - d[(y * m + x - 1) * 4] - d[((y + 1) * m + x) * 4] - d[((y - 1) * m + x) * 4]); } return g; };
    const steps = [0, 0.25, 0.5, 0.75, 1].map((sh) => ({ sh, e: lap(rcasCPU(blob, m, m, sh, false).data) }));
    const base = lap(blob);
    const monotone = steps.every((s2, k) => k === 0 || s2.e > steps[k - 1].e) && steps[0].e > base;
    // *** MEASURED ON A BLOB, NOT A RAMP. *** A first draft measured this on a linear ramp and read no change at any
    // sharpness at all -- correctly: a linear ramp has no second derivative for a Laplacian sharpen to amplify, and
    // a SUMMED gradient over a monotone edge telescopes to its endpoints and cannot move either. Wrong signal and
    // wrong statistic at once.
    ok(`*** sharpening is MONOTONE in the sharpness knob: Laplacian energy ${base.toFixed(2)} in, then ${steps.map((s2) => s2.e.toFixed(2)).join(" -> ")} at sharpness ${steps.map((s2) => s2.sh).join(", ")} ***`,
       monotone, steps.map((s2) => `${s2.sh}:${s2.e.toFixed(3)}`).join(" "));

    // *** AND RCAS OVERSHOOTS AT A LOCAL PEAK. NAMED, BECAUSE A CALLER HAS TO KNOW. *** The ring's own bound is the
    // POLE of 1/(4*lobe+1), so RCAS_LIMIT exists to keep the resolve off it -- not to bound the result. Where the
    // centre already sits above its four neighbours, sharpening pushes it further: MEASURED, a blob peak of 1.000
    // resolves to 1.166 at full sharpness. The reference stores that straight into rgba16float without a clamp and
    // so does this file; anything compositing to an 8-bit target has to clamp, and now the tree says so.
    const peakIn = blob[(12 * m + 12) * 4];
    const peakOut = rcasCPU(blob, m, m, 1, false).data[(12 * m + 12) * 4];
    ok(`*** RCAS OVERSHOOTS a local peak and is not clamped: ${peakIn.toFixed(3)} in, ${peakOut.toFixed(3)} out at full sharpness -- RCAS_LIMIT (${RCAS_LIMIT}) keeps the resolve off the pole of 1/(4*lobe+1), it does NOT bound the range, and a caller writing to 8 bits must clamp ***`,
       peakOut > 1.02 && peakOut < 1.5, `${peakIn} -> ${peakOut}`);

    // *** THE DENOISE PATH WAS IMPLEMENTED ON BOTH SIDES AND EXERCISED BY NEITHER until this row. *** FSR1's
    // FSR_RCAS_DENOISE reads a lone outlier against its cross as grain and pulls the lobe back by up to half. On a
    // NOISY field it must sharpen less than the plain form; on a clean edge, where the centre sits on the ramp
    // rather than off it, it must barely differ -- otherwise it is not a denoise, it is just less sharpening.
    let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const noisy = new Float32Array(m * m * 4);
    for (let i = 0; i < m * m; i++) { const v = 0.5 + (rnd() - 0.5) * 0.4;
        noisy[i * 4] = v; noisy[i * 4 + 1] = v; noisy[i * 4 + 2] = v; noisy[i * 4 + 3] = 1; }
    const nOff = lap(rcasCPU(noisy, m, m, 1, false).data), nOn = lap(rcasCPU(noisy, m, m, 1, true).data);
    const cOff = lap(rcasCPU(blob, m, m, 1, false).data), cOn = lap(rcasCPU(blob, m, m, 1, true).data);
    ok(`*** the DENOISE pulls the lobe back where the signal is grain and leaves a clean edge nearly alone: on noise ${nOff.toFixed(1)} -> ${nOn.toFixed(1)} (${((1 - nOn / nOff) * 100).toFixed(0)}% less), on the blob ${cOff.toFixed(2)} -> ${cOn.toFixed(2)} (${((1 - cOn / cOff) * 100).toFixed(1)}%) ***`,
       nOn < nOff * 0.9 && cOn > cOff * 0.95, `noise ${nOff.toFixed(3)}/${nOn.toFixed(3)}, blob ${cOff.toFixed(3)}/${cOn.toFixed(3)}`);

    // FSR1 end to end: EASU upscales, RCAS sharpens what it produced
    const chain = fsr1CPU(SRC, N, N, M, M, 1, false);
    const lapM = (d, n) => { let g = 0; for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
        const c = d[(y * n + x) * 4];
        g += Math.abs(4 * c - d[(y * n + x + 1) * 4] - d[(y * n + x - 1) * 4] - d[((y + 1) * n + x) * 4] - d[((y - 1) * n + x) * 4]); } return g; };
    ok(`  and FSR1 END TO END is sharper than EASU alone: Laplacian energy ${lapM(CPU.data, M).toFixed(1)} after EASU, ${lapM(chain.data, M).toFixed(1)} after EASU then RCAS`,
       lapM(chain.data, M) > lapM(CPU.data, M) * 1.02, `${lapM(CPU.data, M).toFixed(2)} -> ${lapM(chain.data, M).toFixed(2)}`);
}

console.log("\n4. RCAS ON THE DEVICE: the WGSL through gfx/device.js, held to the CPU reference");
if (skip) { console.log(`  SKIP  ${skip}`); fails++; }
else {
    const SH = 1;
    // both denoise settings, because a parity row that only ever runs one of them grades half the kernel
    const RCPU = { off: rcasCPU(CPU.data, M, M, SH, false), on: rcasCPU(CPU.data, M, M, SH, true) };
    const r2 = await runInEngineOrigin({ engineRoot: ENG, args: { M, SH, src: Array.from(CPU.data) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RCAS_WGSL } = await import("/fx/fsr/fsrKernels.js");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const src = dev.buffer({ data: new Float32Array(a.src), usage: ["storage"] });
        const groups = Math.ceil(a.M / 8);
        const run = async (den) => {
            const dst = dev.buffer({ data: new Float32Array(a.M * a.M * 4), usage: ["storage"] });
            // struct P { w:u32, h:u32, denoise:u32, sharp:f32 } -- three u32 then one f32, in one 16-byte view
            const ub = new ArrayBuffer(16); new Uint32Array(ub, 0, 3).set([a.M, a.M, den]); new Float32Array(ub, 12, 1)[0] = a.SH;
            const u = dev.buffer({ data: new Uint32Array(ub), usage: "uniform" });
            const p = dev.compute({ wgsl: RCAS_WGSL });
            p.bind("src", src).bind("dst", dst).bind("u", u);
            dev.frame(({ pass }) => { pass.dispatch(p, [groups, groups]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(dst)));
        };
        return { out: await run(0), outDen: await run(1), errs, backend: dev.backend };
    }` });
    ok("the harness ran RCAS on a real WebGPU device", r2.ok && r2.result && r2.result.backend === "webgpu" && r2.result.errs.length === 0 && r2.result.out.length === M * M * 4,
       r2.ok ? `${r2.result && r2.result.backend}; errors ${(r2.result && r2.result.errs || []).join(" | ")}` : (r2.reason || (r2.pageErrors || []).join("; ")));
    if (r2.ok && r2.result && r2.result.out.length === M * M * 4) {
        const cmp = (G, ref) => { let worst = 0, same = 0;
            for (let i = 0; i < M * M; i++) { let eq = true;
                for (let c = 0; c < 3; c++) { const d = Math.abs(G[i * 4 + c] - ref[i * 4 + c]); worst = Math.max(worst, d); if (G[i * 4 + c] !== ref[i * 4 + c]) eq = false; }
                if (eq) same++; }
            return { worst, same }; };
        const A = cmp(r2.result.out, RCPU.off.data), B = cmp(r2.result.outDen, RCPU.on.data);
        const G = r2.result.out;
        ok(`*** RCAS on the device is the CPU reference's picture on BOTH denoise settings, to ${Math.max(A.worst, B.worst).toExponential(2)} on every one of ${M * M * 3} channels (${A.same} and ${B.same} of ${M * M} bit-identical) ***`,
           A.worst < 1e-6 && B.worst < 1e-6, `denoise off worst ${A.worst.toExponential(3)} (${A.same}/${M * M}); denoise on worst ${B.worst.toExponential(3)} (${B.same}/${M * M})`);
        // and the guarded limiter has to hold on the DEVICE, where the unguarded form's NaN would fall through silently
        let bad = 0; for (let i = 0; i < M * M * 4; i++) if (!Number.isFinite(G[i])) bad++;
        ok(`  and nothing the device produced is NaN or infinite (${bad} of ${M * M * 4}) -- the epsilon is what makes that true on a picture carrying pure black and pure white`,
           bad === 0, `${bad} non-finite`);
    }
}

// SABOTAGE LOG -- applied to fx/fsr/fsr.js and fx/fsr/fsrKernels.js, gate run, red count read, both files restored
// and md5-verified. Baseline 0 red. MEASURED at v4546 (EASU) and v4547 (RCAS).
//   TT the dering clamp dropped on BOTH sides -> 2 red, and by the number that names the hazard: 730 of 12,288
//      channels immediately land outside the four-nearest bounds. That is the halo the clamp exists to stop, and it
//      is there the moment the clamp is not.
//   UU the kernel no longer rotated to the edge (dir forced axis-aligned)      -> 2 red: 3.7x thinner than bilinear
//      becomes 1.3x. The rotation IS the "edge adaptive" in the name.
//   VV the edge STRENGTH thrown away (no stretch, no lobe shaping)             -> 2 red, the same 1.3x. Either half
//      of the shaping missing and the kernel is an isotropic filter wearing FSR's name.
//   WW EASU's green-weighted luma replaced by Rec.709 IN THE WGSL ONLY         -> 1 red: the CPU mirror catches it at
//      2.52e-1, which is the whole reason the mirror is here rather than the GPU grading itself.
//   XX the flat-region fallback removed on both sides                          -> 2 red with NaN: a gradient-free
//      patch has no direction to normalise, and without the fallback the reciprocal square root takes 1/0. The
//      constant-field row is what says so, and it is the loudest way an upscaler can be wrong.
//   No 0-RED among the five.
//   RCAS, at v4547 -- baseline 0 red:
//   YY the 0/0 epsilon guard removed on BOTH sides -> 5 red, every one of them NaN. The guard is load-bearing on any
//      picture carrying pure black or pure white, which is most of them.
//   ZZ the sharpness knob ignored (peak fixed at 1) -> 1 red: the Laplacian energy reads 11.36 at every sharpness
//      instead of climbing 11.09 -> 11.36. A knob that does nothing is worse than no knob.
//   AB RCAS_LIMIT dropped from the lobe clamp -> 3 red, and the overshoot row reads INFINITY. That is the row's own
//      claim demonstrated: the ring's bound IS the pole of 1/(4*lobe+1), and the limit is what keeps the resolve off
//      it. Without it a flat field comes back NaN.
//   AC the cross mis-sampled in the WGSL ONLY -> 1 red, caught by the CPU mirror at 2.78e-1.
//   AD the resolve's normalisation dropped on both sides -> 4 red, starting with the flat field moving by 0.675.
//   AE the denoise measured on RED instead of GREEN, in the WGSL ONLY -> 1 red, caught by the mirror at 1.14e-1 --
//      and only because the device run grades BOTH denoise settings. It graded one until this round, which left half
//      the kernel checked on the CPU alone.
//   No 0-RED among the six.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the TEMPORAL path, which wants depth, per-pixel motion vectors and a jittered projection with history -- this tree has " +
    "none of those and no previous-frame view-projection matrix anywhere, so that rung has a prerequisite rung before it; " +
    "HDR and the colour domain (FSR1 wants perceptual input and this file does not choose a transfer function for a caller); " +
    "SPEED -- nobody has timed either kernel against bilinear or against anime4k; and RCAS's OVERSHOOT once a caller " +
    "composites it, since this gate measures that it happens (1.166 from 1.000 at a local peak) and no caller in this " +
    "tree yet clamps it, because no caller in this tree yet uses it.");
process.exit(fails ? 1 : 0);
