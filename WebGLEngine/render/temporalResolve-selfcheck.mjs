#!/usr/bin/env node
// WebGLEngine/render/temporalResolve-selfcheck.mjs -- v4551
//
// THE LAST STRUCTURAL RUNG: the jitter-aware Lanczos2 resolve, which is what makes this UPSCALING rather than
// anti-aliasing. render/temporalAccumulate-selfcheck.mjs accumulates at ratio 1, where the jittered samples and the
// output share a grid. Above 1 they do not: each frame's samples land at render-resolution positions offset by that
// phase's jitter, and every display pixel has to be built from the render texels around it.
//
// *** THE WHOLE RUNG IS ONE SUBTRACTION, AND THE GATE MEASURES WHAT IT BUYS. *** srcPos = uv * renderSize - 0.5 -
// JITTER. Drop the jitter term and the weights measure to the render texel grid while the samples move every frame,
// so the accumulation averages misaligned taps and converges to a blur.
//
// The rows: the kernel is Lanczos2; the resolve is the IDENTITY at ratio 1 with no jitter; the dering box is what
// stops the negative lobes ringing; confidence is the distance to the nearest real sample; and then the two
// comparisons this whole arc exists to make -- temporal against the same frame resolved once, and temporal against
// EASU, the spatial upscaler fx/fsr already holds.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { lanczos2, resolveJitterAwareCPU } from "./temporalResolve.mjs";
import { RESOLVE_WGSL } from "./temporalResolveWgsl.mjs";
import { temporalAccumulateCPU } from "./temporalAccumulate.mjs";
import { jitterSequence } from "./jitter.mjs";
import { easuCPU, bilinearCPU } from "../fx/fsr/fsr.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const R = 24, D = 48;   // a 2x upscale
function scene(u, v) {
    const disc = Math.hypot(u - 0.42, v - 0.5) < 0.26 ? 1 : 0;
    const bar = Math.abs((u + v) - 1.15) < 0.012 ? 1 : 0;
    const val = Math.max(disc, bar);
    return [val, val * 0.6 + (1 - val) * 0.1, 1 - val];
}
const TRUTH = (() => { const t = new Float32Array(D * D * 4);
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) { const a = [0, 0, 0];
        for (let sy = 0; sy < 16; sy++) for (let sx = 0; sx < 16; sx++) {
            const s = scene((x + (sx + 0.5) / 16) / D, (y + (sy + 0.5) / 16) / D);
            for (let c = 0; c < 3; c++) a[c] += s[c]; }
        const o = (y * D + x) * 4; for (let c = 0; c < 3; c++) t[o + c] = a[c] / 256; t[o + 3] = 1; }
    return t; })();
const renderAt = (jx, jy) => { const f = new Float32Array(R * R * 4);
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) {
        const s = scene((x + 0.5 + jx) / R, (y + 0.5 + jy) / R), o = (y * R + x) * 4;
        for (let c = 0; c < 3; c++) f[o + c] = s[c]; f[o + 3] = 1; }
    return f; };
const rms = (a) => { let s = 0; for (let i = 0; i < D * D; i++) for (let c = 0; c < 3; c++) { const d = a[i * 4 + c] - TRUTH[i * 4 + c]; s += d * d; } return Math.sqrt(s / (D * D * 3)); };
const STATIC = (() => { const m = new Float32Array(D * D * 4); for (let i = 0; i < D * D; i++) m[i * 4 + 2] = 1; return m; })();
const SEQ = jitterSequence(32);
const accumulate = (aware, frames = 64) => { let hist = null; const errs = [];
    for (let k = 0; k < frames; k++) { const [jx, jy] = SEQ[k % 32];
        const cur = resolveJitterAwareCPU({ src: renderAt(jx, jy), rw: R, rh: R, dw: D, dh: D, jitter: [jx, jy], jitterAware: aware }).data;
        hist = temporalAccumulateCPU({ current: cur, history: hist, motion: STATIC, w: D, h: D, alpha: 1 / (k + 1), clampToNeighbourhood: false }).data;
        errs.push(rms(hist)); }
    return errs; };

console.log("\n1. THE KERNEL AND THE RESOLVE'S OWN PROPERTIES");
{
    ok("the WGSL validates against the spec scanner", validateWgsl(RESOLVE_WGSL).length === 0, validateWgsl(RESOLVE_WGSL).join("; "));
    ok(`lanczos2 is 1 at 0, zero at every other integer, zero beyond 2, and NEGATIVE at 1.5 (${lanczos2(1.5).toFixed(6)}) -- the lobe the dering box exists for`,
       lanczos2(0) === 1 && Math.abs(lanczos2(1)) < 1e-12 && lanczos2(2) === 0 && lanczos2(3) === 0 && lanczos2(1.5) < -0.01 && lanczos2(0.5) > 0.5,
       `0:${lanczos2(0)} 1:${lanczos2(1).toExponential(1)} 1.5:${lanczos2(1.5).toFixed(6)} 2:${lanczos2(2)}`);

    // *** AT RATIO 1 WITH NO JITTER THE RESOLVE IS THE IDENTITY, BIT FOR BIT. *** Lanczos2 is 1 at the centre tap
    // and 0 at every other integer offset, so the 3x3 collapses to the one texel. An upsampler that blurred a 1:1
    // frame would be wrong in a way no amount of accumulation could recover.
    const N = 16, noise = new Float32Array(N * N * 4);
    let seed = 3; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < N * N; i++) { noise[i * 4] = rnd(); noise[i * 4 + 1] = rnd(); noise[i * 4 + 2] = rnd(); noise[i * 4 + 3] = 1; }
    const id = resolveJitterAwareCPU({ src: noise, rw: N, rh: N, dw: N, dh: N, jitter: [0, 0] });
    let worstId = 0; for (let i = 0; i < N * N * 4; i++) worstId = Math.max(worstId, Math.abs(id.data[i] - noise[i]));
    ok(`*** at ratio 1 with no jitter the resolve is the IDENTITY, bit for bit (worst ${worstId.toExponential(2)}) -- Lanczos2 is 1 at the centre and 0 at every other integer, so the 3x3 collapses to one texel ***`,
       worstId === 0, `worst ${worstId}`);

    // *** THE DERING BOX IS NOT DECORATION: the negative lobes leave the range of the taps themselves. ***
    const E = 24, edge = new Float32Array(E * E * 4);
    for (let y = 0; y < E; y++) for (let x = 0; x < E; x++) { const v = x < E / 2 ? 0 : 1, o = (y * E + x) * 4;
        edge[o] = v; edge[o + 1] = v; edge[o + 2] = v; edge[o + 3] = 1; }
    const range = (d) => { let lo = 9, hi = -9; for (let i = 0; i < d.length / 4; i++) { lo = Math.min(lo, d[i * 4]); hi = Math.max(hi, d[i * 4]); } return [lo, hi]; };
    const on = range(resolveJitterAwareCPU({ src: edge, rw: E, rh: E, dw: E * 2, dh: E * 2, jitter: [0.31, -0.17], dering: true }).data);
    const off = range(resolveJitterAwareCPU({ src: edge, rw: E, rh: E, dw: E * 2, dh: E * 2, jitter: [0.31, -0.17], dering: false }).data);
    ok(`*** the DERING box stops the ring: on a hard edge the undered resolve reaches [${off[0].toFixed(4)}, ${off[1].toFixed(4)}] from an input of [0, 1] -- Lanczos2's negative lobes overshooting BOTH ends -- and the dered one is exactly [${on[0].toFixed(4)}, ${on[1].toFixed(4)}] ***`,
       off[0] < -0.01 && off[1] > 1.01 && on[0] >= 0 && on[1] <= 1, `undered [${off[0].toFixed(5)}, ${off[1].toFixed(5)}], dered [${on[0].toFixed(5)}, ${on[1].toFixed(5)}]`);

    // confidence: at 2x with no jitter every display pixel centre sits a quarter of a render texel from a sample in
    // each axis, so the distance is hypot(0.25, 0.25) and the confidence is one minus that, everywhere
    const c = resolveJitterAwareCPU({ src: edge, rw: E, rh: E, dw: E * 2, dh: E * 2, jitter: [0, 0] });
    const want = 1 - Math.hypot(0.25, 0.25);
    let cmin = 9, cmax = -9; for (const v of c.confidence) { cmin = Math.min(cmin, v); cmax = Math.max(cmax, v); }
    ok(`  and CONFIDENCE is the distance to the nearest real sample: at 2x with no jitter every display pixel reads ${cmin.toFixed(4)}, which is 1 - hypot(0.25, 0.25) = ${want.toFixed(4)} computed here, because the grid is regular and every pixel is equally far from one`,
       Math.abs(cmin - want) < 1e-6 && Math.abs(cmax - want) < 1e-6, `[${cmin.toFixed(6)}, ${cmax.toFixed(6)}], want ${want.toFixed(6)}`);
}

console.log("\n2. THE TWO COMPARISONS THIS ARC EXISTS TO MAKE");
{
    const aware = accumulate(true), blind = accumulate(false);
    const one = renderAt(0, 0);
    const easu = rms(easuCPU(one, R, R, D, D).data);
    const bilin = rms(bilinearCPU(one, R, R, D, D).data);
    const once = rms(resolveJitterAwareCPU({ src: one, rw: R, rh: R, dw: D, dh: D, jitter: [0, 0] }).data);

    ok(`*** TEMPORAL UPSCALING BEATS SPATIAL: at 2x, accumulating 32 jittered frames through the jitter-aware resolve reaches ${aware[31].toFixed(5)} against a display-resolution ground truth, where EASU -- FSR1's own spatial upscaler, from fx/fsr -- reaches ${easu.toFixed(5)} on one frame. ${(easu / aware[31]).toFixed(2)}x better, and that IS the reason a temporal upscaler exists ***`,
       aware[31] < easu / 1.3, `temporal ${aware[31].toFixed(5)}, easu ${easu.toFixed(5)}, bilinear ${bilin.toFixed(5)}, one resolve ${once.toFixed(5)}`);

    // *** AND THE SUBTRACTION IS WHAT BUYS IT. *** Same accumulation, same frames, same everything -- only the
    // jitter term in srcPos removed, so the weights measure to the texel grid while the samples move.
    ok(`*** and the JITTER TERM is what buys it: the identical accumulation with the jitter dropped from srcPos reaches only ${blind[31].toFixed(5)} against the aware ${aware[31].toFixed(5)} -- ${((blind[31] / aware[31] - 1) * 100).toFixed(0)}% worse, from one subtraction ***`,
       blind[31] > aware[31] * 1.1, `aware ${aware[31].toFixed(5)}, blind ${blind[31].toFixed(5)}`);
    ok(`  and the accumulation is doing the work, not the resolve alone: one frame through the same resolve is ${once.toFixed(5)} and 32 accumulated is ${aware[31].toFixed(5)}, ${(once / aware[31]).toFixed(2)}x better`,
       aware[31] < once / 1.3, `one ${once.toFixed(5)} -> 32 ${aware[31].toFixed(5)}`);
    ok(`  and it settles at the phase count: frames 32 and 64 agree to ${Math.abs(aware[31] - aware[63]).toExponential(2)}`,
       Math.abs(aware[31] - aware[63]) / aware[31] < 1e-6, `32:${aware[31]} 64:${aware[63]}`);
    // *** WHAT UPSCALING COSTS, SAID PLAINLY. *** v4550 measured 0.01041 accumulating at ratio 1 on this same scene.
    // At 2x the same 32 phases reach 0.05541: a display pixel sees a quarter as many render samples per frame, and
    // the sequence sweeps one render pixel, so the coverage per display pixel is thinner. Temporal upscaling beats
    // every spatial option here and is still five times worse than not upscaling at all, which is the trade.
    report(`the cost of upscaling, measured: this scene accumulates to 0.01041 at ratio 1 (v4550) and ${aware[31].toFixed(5)} at 2x -- ` +
           `${(aware[31] / 0.01041).toFixed(1)}x worse than not upscaling, and ${(easu / aware[31]).toFixed(2)}x better than the best spatial upscaler here`);
    report(`full table at 2x: temporal ${aware[31].toFixed(5)}, jitter-blind temporal ${blind[31].toFixed(5)}, EASU ${easu.toFixed(5)}, one resolve ${once.toFixed(5)}, bilinear ${bilin.toFixed(5)}`);
}

console.log("\n3. ON THE DEVICE: the WGSL through gfx/device.js, held to the CPU reference");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1 and 2 are CPU only; nothing here has run the kernel."); fails++; }
else {
    const [jx, jy] = SEQ[7];
    const src = renderAt(jx, jy);
    const CPU = {
        aware: resolveJitterAwareCPU({ src, rw: R, rh: R, dw: D, dh: D, jitter: [jx, jy], jitterAware: true, dering: true }),
        blind: resolveJitterAwareCPU({ src, rw: R, rh: R, dw: D, dh: D, jitter: [jx, jy], jitterAware: false, dering: true }),
        raw: resolveJitterAwareCPU({ src, rw: R, rh: R, dw: D, dh: D, jitter: [jx, jy], jitterAware: true, dering: false }),
    };
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { R, D, jx, jy, src: Array.from(src) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { RESOLVE_WGSL } = await import("/render/temporalResolveWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const src = dev.buffer({ data: new Float32Array(a.src), usage: ["storage"] });
        const groups = Math.ceil(a.D / 8);
        const go = async (flags) => {
            const dst = dev.buffer({ data: new Float32Array(a.D * a.D * 4), usage: ["storage"] });
            const conf = dev.buffer({ data: new Float32Array(a.D * a.D), usage: ["storage"] });
            const ub = new ArrayBuffer(32);
            new Uint32Array(ub, 0, 4).set([a.R, a.R, a.D, a.D]);
            new Float32Array(ub, 16, 2).set([a.jx, a.jy]);
            new Uint32Array(ub, 24, 2).set([flags, 0]);
            const u = dev.buffer({ data: new Uint32Array(ub), usage: "uniform" });
            const p = dev.compute({ wgsl: RESOLVE_WGSL });
            p.bind("src", src).bind("dst", dst).bind("conf", conf).bind("u", u);
            dev.frame(({ pass }) => { pass.dispatch(p, [groups, groups]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            return { out: Array.from(new Float32Array(await dev.read(dst))), conf: Array.from(new Float32Array(await dev.read(conf))) };
        };
        return { aware: await go(3), blind: await go(2), raw: await go(1), errs, backend: dev.backend };
    }` });
    ok("the harness ran the kernel on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
       r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && r.result.aware) {
        const cmp = (G, ref) => { let w = 0; for (let i = 0; i < D * D * 4; i++) w = Math.max(w, Math.abs(G[i] - ref[i])); return w; };
        const wa = cmp(r.result.aware.out, CPU.aware.data), wb = cmp(r.result.blind.out, CPU.blind.data), wr = cmp(r.result.raw.out, CPU.raw.data);
        const LSB = 1 / 255, worst = Math.max(wa, wb, wr);
        // stated against an 8-bit LSB, the unit this picture is displayed in -- a nine-tap sin() kernel in f32
        // against f64 is not going to be bit-identical and the number that matters is whether a viewer could see it
        ok(`*** the device's resolve is the CPU reference's on all three paths -- worst ${worst.toExponential(2)}, which is ${(worst / LSB).toExponential(1)} of an 8-bit LSB (jitter-aware ${wa.toExponential(2)}, jitter-blind ${wb.toExponential(2)}, undered ${wr.toExponential(2)}) ***`,
           worst < LSB / 50, `aware ${wa.toExponential(3)}, blind ${wb.toExponential(3)}, raw ${wr.toExponential(3)}; LSB ${LSB.toExponential(2)}`);
        let wc = 0; for (let i = 0; i < D * D; i++) wc = Math.max(wc, Math.abs(r.result.aware.conf[i] - CPU.aware.confidence[i]));
        ok(`  and the device's CONFIDENCE buffer matches to ${wc.toExponential(2)} on all ${D * D} pixels`, wc < 1e-6, `worst ${wc.toExponential(3)}`);
        // the device's OWN output must show the dering property, not inherit it from the CPU
        let lo = 9, hi = -9, loR = 9, hiR = -9;
        for (let i = 0; i < D * D; i++) { lo = Math.min(lo, r.result.aware.out[i * 4]); hi = Math.max(hi, r.result.aware.out[i * 4]);
            loR = Math.min(loR, r.result.raw.out[i * 4]); hiR = Math.max(hiR, r.result.raw.out[i * 4]); }
        ok(`  and the DEVICE's own dered output stays inside its taps ([${lo.toFixed(4)}, ${hi.toFixed(4)}]) while its undered one rings to [${loR.toFixed(4)}, ${hiR.toFixed(4)}] -- asserted on the device's output, not inherited from the CPU's`,
           lo >= -1e-6 && hi <= 1 + 1e-6 && (loR < -1e-4 || hiR > 1 + 1e-4), `dered [${lo.toFixed(5)}, ${hi.toFixed(5)}], undered [${loR.toFixed(5)}, ${hiR.toFixed(5)}]`);
    }
}

// SABOTAGE LOG -- applied to render/temporalResolve.mjs and render/temporalResolveWgsl.mjs, gate run, red count
// read, both files restored and md5-verified. Baseline 0 red. MEASURED at v4551.
//   BB the jitter term dropped from srcPos on both sides    -> 1 red. Only one row moves, and that is the honest
//      count: with the jitter gone the resolve is still a correct Lanczos2 upsample of the frames it is handed --
//      it is just resampling them all on the same grid, so it converges to a blur instead of a super-sample. The
//      row that notices is the one that compares the accumulated result against the reference, which is the only
//      row that can: nothing about a single frame is wrong.
//   BC the jitter ADDED instead of subtracted                 -> 3 red. Twice the offset in the wrong direction is
//      visible where the sign error is not, which is why the set includes both.
//   BD Lanczos2 replaced by a box, every tap weight 1          -> 7 red, most of the gate. The kernel is what nearly
//      every row is ultimately reading.
//   BE the dering box removed                                 -> 2 red: the undered/dered row, and the device's own
//      dering row, which asserts the property on the device's output rather than inheriting it from the CPU's.
//   BF the weight sum not normalised (wsum divide dropped)     -> 1 red. Lanczos2's nine taps sum close to 1 already,
//      so the picture only darkens slightly and only the identity row -- which holds ratio 1 with zero jitter to
//      BIT exactness -- is tight enough to see it. A tolerance of even 1e-3 there would have made this 0-RED.
//   BG confidence floored at 1 (the clamp's low bound raised)  -> 1 red. Confidence is carried but nothing downstream
//      in this tree consumes it yet, so one row is all it can be. Recorded rather than dressed up: the buffer is
//      produced and checked, and its USE is future work, listed in the unchecked note below.
//   BH the base texel FLOORED instead of rounded, WGSL ONLY    -> 2 red. Deliberately one-sided, because the previous
//      rung's two 0-REDs were both cases where a change made to BOTH sides left them agreeing. The mirror caught it
//      at 1.43e-1 -- 36 LSBs -- and the confidence buffer at 5.17e-1, since flooring puts the base texel up to a
//      whole texel from the sample and the confidence is exactly the distance between them.
//   No 0-RED among the seven. BF is the thin one and it survives only because the identity row is bit-exact; if that
//   row is ever loosened, the normalisation stops being covered.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: a MOVING scene at ratio > 1 -- the accumulation rows hold camera and world still, so " +
    "reprojection is the identity and the resolve is the only thing being measured; DISOCCLUSION and the locks FSR keeps " +
    "to protect thin features from being clamped away; REACTIVE masks and shading-change detection; the YCoCg box FSR " +
    "derings in, where this uses RGB; and RATIOS other than 2 -- the phase count formula covers them and nothing here " +
    "has run one.");
process.exit(fails ? 1 : 0);
