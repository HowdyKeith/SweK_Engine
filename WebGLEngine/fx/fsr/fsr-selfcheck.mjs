#!/usr/bin/env node
// WebGLEngine/fx/fsr/fsr-selfcheck.mjs -- v4546
//
// EASU, THE UPSCALE HALF OF FSR1, AS AN ALGORITHM RATHER THAN A DEPENDENCY. fx/fsr/fsr.js holds the CPU reference
// (a transcription of AMD's f32 `FsrEasuF` from ffx_fsr1.h, MIT) and fx/fsr/fsrKernels.js the WGSL that mirrors it
// statement by statement; this gate runs the WGSL on a real WebGPU device through gfx/device.js and holds it to the
// CPU, then checks the three things EASU is FOR -- it does not blur a flat field, it beats bilinear on an edge, and
// it does not ring.
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
import { easuCPU, bilinearCPU } from "./fsr.js";
import { EASU_WGSL } from "./fsrKernels.js";

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

// SABOTAGE LOG -- applied to fx/fsr/fsr.js and fx/fsr/fsrKernels.js, gate run, red count read, both files restored
// and md5-verified. Baseline 0 red. MEASURED at v4546.
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
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: RCAS, FSR1's sharpening half (EASU upscales; RCAS is the pass after it and is its own rung); " +
    "the TEMPORAL path, which wants depth, per-pixel motion vectors and a jittered projection with history -- this tree has " +
    "none of those and no previous-frame view-projection matrix anywhere, so that rung has a prerequisite rung before it; " +
    "HDR and the colour domain (FSR1 wants perceptual input and this file does not choose a transfer function for a caller); " +
    "and SPEED -- nobody has timed the kernel against bilinear or against anime4k.");
process.exit(fails ? 1 : 0);
