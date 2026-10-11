#!/usr/bin/env node
// WebGLEngine/render/temporalAccumulate-selfcheck.mjs -- v4550
//
// THE FIRST RUNG OF THIS ARC THAT MAKES A PICTURE, AND THE FIRST THAT CAN TEST THE CLAIM THE OTHERS REST ON.
// render/jitter-selfcheck.mjs can say the Halton sequence is low-discrepancy and covers the pixel footprint; that
// the accumulation CONVERGES TO A SUPER-SAMPLED RESULT is a claim about an image, and until something blended a
// history buffer nothing could measure it. This measures it.
//
// The scene is analytic -- a disc and a thin diagonal bar, both of which alias hard when point-sampled -- so the
// ground truth is the scene integrated over each pixel's footprint (16x16 samples), not another render. Each frame
// point-samples at the pixel centre plus that phase's jitter, which is what a rasteriser does to a hard-edged scene.
//
// *** THIS IS TEMPORAL ANTI-ALIASING, NOT TEMPORAL UPSCALING. *** At ratio 1 the jittered samples and the output
// share a grid, so accumulating them IS the super-sample and the claim is directly measurable. Above 1 the samples
// land between display pixels and FSR resolves them with a jitter-aware Lanczos2 upsample -- a separate piece, and
// claiming this rung covers it would be the kind of half-done this tree keeps catching.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { temporalAccumulateCPU, sampleBilinear } from "./temporalAccumulate.mjs";
import { ACCUMULATE_WGSL } from "./temporalAccumulateWgsl.mjs";
import { jitterSequence, jitterPhaseCount, halton } from "./jitter.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const N = 48;
function scene(px, py) {
    const x = px / N, y = py / N;
    const disc = Math.hypot(x - 0.42, y - 0.5) < 0.26 ? 1 : 0;
    const bar = Math.abs((x + y) - 1.15) < 0.012 ? 1 : 0;
    const v = Math.max(disc, bar);
    return [v, v * 0.6 + (1 - v) * 0.1, 1 - v];
}
/** the ground truth: the scene integrated over each pixel, 256 samples -- not another render */
const TRUTH = (() => {
    const t = new Float32Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const acc = [0, 0, 0];
        for (let sy = 0; sy < 16; sy++) for (let sx = 0; sx < 16; sx++) {
            const s = scene(x + (sx + 0.5) / 16, y + (sy + 0.5) / 16);
            for (let c = 0; c < 3; c++) acc[c] += s[c];
        }
        const o = (y * N + x) * 4;
        for (let c = 0; c < 3; c++) t[o + c] = acc[c] / 256;
        t[o + 3] = 1;
    }
    return t;
})();
const frameAt = (jx, jy) => {
    const f = new Float32Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = scene(x + 0.5 + jx, y + 0.5 + jy), o = (y * N + x) * 4;
        for (let c = 0; c < 3; c++) f[o + c] = s[c];
        f[o + 3] = 1;
    }
    return f;
};
const rms = (a) => { let s = 0; for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) { const d = a[i * 4 + c] - TRUTH[i * 4 + c]; s += d * d; } return Math.sqrt(s / (N * N * 3)); };
const STATIC = (() => { const m = new Float32Array(N * N * 4); for (let i = 0; i < N * N; i++) m[i * 4 + 2] = 1; return m; })();
const run = (offsets, frames, { clampToNeighbourhood = false } = {}) => {
    let hist = null; const errs = [];
    for (let k = 0; k < frames; k++) {
        const [jx, jy] = offsets[k % offsets.length];
        hist = temporalAccumulateCPU({ current: frameAt(jx, jy), history: hist, motion: STATIC, w: N, h: N, alpha: 1 / (k + 1), clampToNeighbourhood }).data;
        errs.push(rms(hist));
    }
    return { hist, errs };
};

console.log("\n1. THE CLAIM THIS ARC HAS BEEN RESTING ON, MEASURED AT LAST");
const seq32 = jitterSequence(jitterPhaseCount(1) * 4);   // 32 phases
const single = rms(frameAt(0, 0));
{
    ok("the WGSL validates against the spec scanner", validateWgsl(ACCUMULATE_WGSL).length === 0, validateWgsl(ACCUMULATE_WGSL).join("; "));

    const on = run(seq32, 64);
    ok(`*** THE ACCUMULATION CONVERGES TO THE SUPER-SAMPLED TRUTH: rms against a 256-sample-per-pixel ground truth goes ${on.errs[0].toFixed(5)} -> ${on.errs[7].toFixed(5)} (8 frames) -> ${on.errs[31].toFixed(5)} (32), which is ${(single / on.errs[31]).toFixed(1)}x better than the single point-sampled frame's ${single.toFixed(5)} ***`,
       on.errs[31] < single / 3 && on.errs[31] < on.errs[7], `1:${on.errs[0].toFixed(5)} 8:${on.errs[7].toFixed(5)} 32:${on.errs[31].toFixed(5)} 64:${on.errs[63].toFixed(5)}; single ${single.toFixed(5)}`);

    // *** AND WITHOUT THE JITTER IT CONVERGES TO NOTHING. *** Every frame is the same aliased image, so a running
    // mean of them is that image. This is the row that says the JITTER does the work and not the blending -- an
    // accumulate pass that looked right would still look right here, and be worthless.
    const off = run(seq32.map(() => [0, 0]), 64);
    const flat = off.errs.every((e) => Math.abs(e - single) < 1e-9);
    ok(`*** with the jitter OFF the same accumulation converges to NOTHING: rms is ${off.errs[0].toFixed(5)} at frame 1 and ${off.errs[63].toFixed(5)} at frame 64, identical to the single frame at every one of the 64. The jitter does the work, not the blend ***`,
       flat && Math.abs(off.errs[63] - single) < 1e-9, `frame1 ${off.errs[0].toFixed(6)}, frame64 ${off.errs[63].toFixed(6)}, single ${single.toFixed(6)}`);

    // The period IS the phase count: after 32 frames the sequence repeats its sample set and the mean stops moving.
    // NOT "to the bit", though -- the mean is accumulated INCREMENTALLY, one blend per frame, so 64 blends carry
    // f64 rounding that 32 do not. A first draft asserted 1e-12 and read 2.9e-9. The bound is relative to the error
    // being measured, which is the honest way to say "stopped moving".
    const drift = Math.abs(on.errs[31] - on.errs[63]);
    ok(`  and the PERIOD is the phase count: the running mean at frame 32 and at frame 64 agree to ${drift.toExponential(2)}, which is ${(drift / on.errs[31]).toExponential(1)} of the error itself -- after a full period the sequence repeats its samples and the mean stops moving, to the precision an incremental blend can hold`,
       drift / on.errs[31] < 1e-6, `32:${on.errs[31]} 64:${on.errs[63]}, relative ${(drift / on.errs[31]).toExponential(2)}`);

    // the anti-ghosting clamp is nearly free on a static scene, which is worth knowing before anyone turns it off
    const clamped = run(seq32, 32, { clampToNeighbourhood: true });
    ok(`  and the neighbourhood clamp costs almost nothing on a static scene: ${clamped.errs[31].toFixed(5)} against ${on.errs[31].toFixed(5)} without it, ${(100 * (clamped.errs[31] / on.errs[31] - 1)).toFixed(1)}% worse -- anti-ghosting is not paid for in convergence here`,
       clamped.errs[31] < on.errs[31] * 1.05, `${clamped.errs[31].toFixed(6)} vs ${on.errs[31].toFixed(6)}`);

    // *** AND A HYPOTHESIS THAT DID NOT SURVIVE, RECORDED BECAUSE IT WOULD OTHERWISE BE GUESSED AGAIN. *** v4549
    // measured that the Halton mean is off-centre by 1.5%/1.9% of a pixel at 32 phases, and the obvious guess is
    // that the residual error here IS that bias. It is not: 63 phases reaches 0.00489 while 127, whose mean offset
    // is HALF as large, reaches 0.00553. The residual is quasi-Monte-Carlo sampling error on a hard-edged area
    // integral, which falls with phase count broadly but not monotonically and not in step with the offset. So a
    // phase count should not be chosen by the offset.
    const table = [8, 15, 16, 31, 32, 63, 64, 127, 128].map((n) => {
        const s = jitterSequence(n);
        const mean = (b) => { let t = 0; for (let k = 1; k <= n; k++) t += halton(k, b) - 0.5; return t / n; };
        return { n, rms: rms(run(s, n).hist), off: Math.hypot(mean(2), mean(3)) };
    });
    const t63 = table.find((r) => r.n === 63), t127 = table.find((r) => r.n === 127);
    ok(`*** the residual is NOT the sequence's off-centre bias, which was the obvious guess: 63 phases reaches ${t63.rms.toFixed(5)} at an offset of ${t63.off.toExponential(2)} while 127 reaches ${t127.rms.toFixed(5)} at ${t127.off.toExponential(2)} -- half the bias and MORE error. It is QMC sampling error on a hard edge, and a phase count picked by the offset would be picked wrong ***`,
       t127.off < t63.off * 0.8 && t127.rms > t63.rms, table.map((r) => `${r.n}:${r.rms.toFixed(5)}`).join(" "));
    report(`error against phase count: ${table.map((r) => `${r.n}=${r.rms.toFixed(5)}`).join(", ")} -- falling broadly, not monotonically`);
}

console.log("\n2. WHAT THE PASS MUST REFUSE TO REUSE");
{
    // *** THE FIRST FRAME HAS NO HISTORY AND THE OUTPUT IS THE CURRENT FRAME, BIT-IDENTICAL. *** The same rule
    // render/jitter.mjs and render/motionVectors.mjs carry: a zero-filled history would be believed and would
    // darken the opening frames of every shot.
    const cur = frameAt(0.1, -0.2);
    const first = temporalAccumulateCPU({ current: cur, history: null, motion: STATIC, w: N, h: N, alpha: 0.1 });
    ok("with NO history the output is the current frame, bit-identical -- not a blend against zeros",
       Array.from(first.data).every((v, i) => v === cur[i]));

    // a surface the motion vector calls invalid, or one that reprojects off screen, has no history to reuse
    const m = Float32Array.from(STATIC);
    m[(10 * N + 10) * 4 + 2] = 0;                      // invalid
    m[(12 * N + 12) * 4] = -0.9;                       // reprojects off the left edge
    const other = frameAt(0.4, 0.4);
    const r = temporalAccumulateCPU({ current: cur, history: other, motion: m, w: N, h: N, alpha: 0.05, clampToNeighbourhood: false });
    const px = (y, x, c) => r.data[(y * N + x) * 4 + c];
    ok(`a pixel the motion vector marks INVALID takes the current frame, not a stale sample (${r.stats.rejectedInvalid} invalid, ${r.stats.rejectedOffscreen} off screen, ${r.stats.reused} reused of ${N * N})`,
       px(10, 10, 0) === cur[(10 * N + 10) * 4] && px(12, 12, 0) === cur[(12 * N + 12) * 4] && r.stats.rejectedInvalid === 1 && r.stats.rejectedOffscreen === 1,
       JSON.stringify(r.stats));

    // *** THE HISTORY IS SAMPLED BILINEARLY, AND NOTHING SAID SO UNTIL THIS ROW. *** A sabotage that swapped the
    // bilinear fetch for a nearest one went 0-RED through the whole gate: every convergence row holds the camera
    // STILL, so the reprojection lands exactly on a texel centre where nearest and bilinear agree, and the device
    // parity row cannot help because a change made to BOTH sides leaves them agreeing. A reprojection that lands
    // between texels is the normal case for any camera that is moving at all, so it is asserted here directly --
    // a known fractional motion over a known gradient, against an interpolation computed in this file.
    const grad = new Float32Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const o = (y * N + x) * 4;
        grad[o] = x / (N - 1); grad[o + 1] = y / (N - 1); grad[o + 2] = 0.5; grad[o + 3] = 1; }
    const fracM = new Float32Array(N * N * 4);
    const DU = 0.37 / N, DV = -0.21 / N;                     // 0.37 of a texel right, 0.21 up
    for (let i = 0; i < N * N; i++) { fracM[i * 4] = DU; fracM[i * 4 + 1] = DV; fracM[i * 4 + 2] = 1; }
    const bil = temporalAccumulateCPU({ current: grad, history: grad, motion: fracM, w: N, h: N, alpha: 0, clampToNeighbourhood: false });
    const X = 20, Y = 20, oo = (Y * N + X) * 4;
    const wantR = (X + 0.5 + 0.37) / (N - 1) - 0.5 / (N - 1);   // the gradient read 0.37 of a texel to the right
    const gotR = bil.data[oo], nearestR = grad[oo];
    ok(`*** the history is sampled BILINEARLY: a motion vector of 0.37 of a texel over a linear gradient reads ${gotR.toFixed(6)}, the interpolated value, where a NEAREST fetch would read ${nearestR.toFixed(6)} -- a difference of ${Math.abs(gotR - nearestR).toExponential(2)} that only a fractional reprojection shows, and every convergence row above holds the camera still ***`,
       Math.abs(gotR - (grad[oo] + 0.37 / (N - 1))) < 1e-6 && Math.abs(gotR - nearestR) > 1e-4,
       `got ${gotR}, nearest ${nearestR}, want ${grad[oo] + 0.37 / (N - 1)}`);
    ok(`  and in the other axis too: ${bil.data[oo + 1].toFixed(6)} against a nearest ${grad[oo + 1].toFixed(6)}, a -0.21 texel step down the y gradient`,
       Math.abs(bil.data[oo + 1] - (grad[oo + 1] - 0.21 / (N - 1))) < 1e-6, `got ${bil.data[oo + 1]}, want ${grad[oo + 1] - 0.21 / (N - 1)}`);

    // *** THE CLAMP IS WHAT STOPS GHOSTING, AND THE WAY TO SHOW IT IS TO HAND IT HISTORY OF SOMETHING ELSE. ***
    const ghost = new Float32Array(N * N * 4);         // a history that is nothing like the current frame
    for (let i = 0; i < N * N; i++) { ghost[i * 4] = 1; ghost[i * 4 + 1] = 0; ghost[i * 4 + 2] = 1; ghost[i * 4 + 3] = 1; }
    const noClamp = temporalAccumulateCPU({ current: cur, history: ghost, motion: STATIC, w: N, h: N, alpha: 0.05, clampToNeighbourhood: false });
    const withClamp = temporalAccumulateCPU({ current: cur, history: ghost, motion: STATIC, w: N, h: N, alpha: 0.05, clampToNeighbourhood: true });
    // *** THE WORST-CASE DEVIATION CANNOT SEE THIS CLAMP, AND A FIRST DRAFT MEASURED EXACTLY THAT AND READ 0.9500
    // FOR BOTH. *** At an EDGE the current frame's own 3x3 spans the full range, so the clamp permits the ghost
    // there and the worst case is unchanged whatever the clamp does. What moves is how MANY pixels the ghost
    // survives at: the mean deviation, and the count still drifting.
    const stat = (a) => { let sum = 0, worst = 0, over = 0;
        for (let i = 0; i < N * N; i++) { let d = 0;
            for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(a[i * 4 + c] - cur[i * 4 + c]));
            sum += d; worst = Math.max(worst, d); if (d > 0.1) over++; }
        return { mean: sum / (N * N), worst, over }; };
    const A = stat(noClamp.data), B = stat(withClamp.data);
    ok(`*** the neighbourhood clamp STOPS GHOSTING: handed a history of a different picture entirely, the unclamped blend drifts on ALL ${A.over} of ${N * N} pixels (mean ${A.mean.toFixed(4)}) and the clamped one on ${B.over} (mean ${B.mean.toFixed(4)}, ${(A.mean / B.mean).toFixed(1)}x less) -- and the ${B.over} survivors are the EDGE pixels, where the current frame's own 3x3 spans the range and the ghost is a value that could legitimately be there ***`,
       B.mean < A.mean / 4 && B.over < A.over / 4 && withClamp.stats.clamped > N * N * 0.5,
       `unclamped mean ${A.mean.toFixed(5)} over ${A.over}; clamped mean ${B.mean.toFixed(5)} over ${B.over}; worst is ${A.worst.toFixed(4)} either way, which is why worst-case cannot grade this`);
    ok("  and in a FLAT region the clamp is exact: the 3x3 min and max are the same value, so a ghost is pinned to it and no blend can survive",
       (() => { const flatCur = new Float32Array(N * N * 4).fill(0.25);
           const w2 = temporalAccumulateCPU({ current: flatCur, history: ghost, motion: STATIC, w: N, h: N, alpha: 0.05, clampToNeighbourhood: true });
           let worst = 0; for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(w2.data[i * 4 + c] - 0.25));
           return worst < 1e-6; })());
}

console.log("\n3. ON THE DEVICE: the WGSL through gfx/device.js, held to the CPU reference");
const skip = webgpuSkipReason();
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. *** Sections 1 and 2 are CPU only; nothing here has run the kernel."); fails++; }
else {
    const cur = frameAt(0.1, -0.2), hist = frameAt(-0.3, 0.2);
    const m = Float32Array.from(STATIC);
    m[(10 * N + 10) * 4 + 2] = 0; m[(12 * N + 12) * 4] = -0.9;
    for (let i = 0; i < 40; i++) { m[(20 * N + i) * 4] = 0.013; m[(20 * N + i) * 4 + 1] = -0.007; }   // a band that really reprojects
    // *** THE THIRD CASE EXISTS BECAUSE THE FIRST TWO COULD NOT TELL WHAT THE CLAMP READS FROM. *** With a history
    // that is nearly the current frame, clamping to the current 3x3 and clamping to the history's own 3x3 give
    // almost the same answer -- a WGSL-only sabotage that swapped them went 0-RED here. A history of a completely
    // different picture makes the two sources disagree by half the range, and the parity row can see it.
    const ghostHist = new Float32Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { ghostHist[i * 4] = 1; ghostHist[i * 4 + 1] = 0; ghostHist[i * 4 + 2] = 1; ghostHist[i * 4 + 3] = 1; }
    const cases = [{ clamp: false, alpha: 0.15 }, { clamp: true, alpha: 0.15 }];
    const CPU = cases.map((c) => temporalAccumulateCPU({ current: cur, history: hist, motion: m, w: N, h: N, alpha: c.alpha, clampToNeighbourhood: c.clamp }));
    const CPUghost = temporalAccumulateCPU({ current: cur, history: ghostHist, motion: m, w: N, h: N, alpha: 0.15, clampToNeighbourhood: true });
    const noHist = temporalAccumulateCPU({ current: cur, history: null, motion: m, w: N, h: N, alpha: 0.15 });
    const r = await runInEngineOrigin({ engineRoot: ENG, args: { N, cur: Array.from(cur), hist: Array.from(hist), ghost: Array.from(ghostHist), motion: Array.from(m) }, script: `async (a) => {
        const { requestDevice } = await import("/gfx/device.js");
        const { ACCUMULATE_WGSL } = await import("/render/temporalAccumulateWgsl.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
        const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const cur = dev.buffer({ data: new Float32Array(a.cur), usage: ["storage"] });
        const hist = dev.buffer({ data: new Float32Array(a.hist), usage: ["storage"] });
        const ghost = dev.buffer({ data: new Float32Array(a.ghost), usage: ["storage"] });
        const mot = dev.buffer({ data: new Float32Array(a.motion), usage: ["storage"] });
        const groups = Math.ceil(a.N / 8);
        const go = async (flags, alpha, hbuf) => {
            const dst = dev.buffer({ data: new Float32Array(a.N * a.N * 4), usage: ["storage"] });
            const ub = new ArrayBuffer(16);
            new Uint32Array(ub, 0, 3).set([a.N, a.N, flags]); new Float32Array(ub, 12, 1)[0] = alpha;
            const u = dev.buffer({ data: new Uint32Array(ub), usage: "uniform" });
            const p = dev.compute({ wgsl: ACCUMULATE_WGSL });
            p.bind("current", cur).bind("history", hbuf || hist).bind("motion", mot).bind("dst", dst).bind("u", u);
            dev.frame(({ pass }) => { pass.dispatch(p, [groups, groups]); pass.clear([0, 0, 0, 1]); }, { offscreen: true });
            return Array.from(new Float32Array(await dev.read(dst)));
        };
        return { plain: await go(1, 0.15), clamped: await go(3, 0.15), noHistory: await go(0, 0.15), ghosted: await go(3, 0.15, ghost), errs, backend: dev.backend };
    }` });
    ok("the harness ran the kernel on a real WebGPU device", r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
       r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
    if (r.ok && r.result && r.result.plain) {
        const cmp = (G, ref) => { let worst = 0; for (let i = 0; i < N * N * 4; i++) worst = Math.max(worst, Math.abs(G[i] - ref[i])); return worst; };
        const wPlain = cmp(r.result.plain, CPU[0].data), wClamp = cmp(r.result.clamped, CPU[1].data), wNo = cmp(r.result.noHistory, noHist.data);
        const wGhost = cmp(r.result.ghosted, CPUghost.data);
        // stated against an 8-BIT LSB (1/255 = 3.9e-3), the unit this picture is eventually displayed in: a bilinear
        // history fetch plus a blend in f32 against f64 lands at 1.1e-6, which is a 3,500th of the smallest
        // difference a viewer's screen can show. 1e-6 flat was a number copied from a better-conditioned gate.
        const LSB = 1 / 255, worst3 = Math.max(wPlain, wClamp, wNo, wGhost);
        ok(`*** the device's accumulated picture is the CPU reference's on all three paths -- worst ${worst3.toExponential(2)}, which is ${(worst3 / LSB).toExponential(1)} of an 8-bit LSB (clamp off ${wPlain.toExponential(2)}, clamp on ${wClamp.toExponential(2)}, no-history ${wNo.toExponential(2)}, across ${N * N * 4} channels), and on a fourth where the history is a DIFFERENT picture so the clamp binds hard (${wGhost.toExponential(2)}) ***`,
           worst3 < LSB / 100, `off ${wPlain.toExponential(3)}, on ${wClamp.toExponential(3)}, none ${wNo.toExponential(3)}, ghost ${wGhost.toExponential(3)}; LSB ${LSB.toExponential(2)}`);
        ok(`  and the DEVICE's own no-history path returns the current frame bit-identically, so the first-frame rule holds where it actually runs`,
           r.result.noHistory.every((v, i) => v === cur[i]), `worst ${wNo.toExponential(3)}`);
    }
}

// SABOTAGE LOG -- applied to render/temporalAccumulate.mjs and render/temporalAccumulateWgsl.mjs, gate run, red
// count read, both files restored and md5-verified. Baseline 0 red. MEASURED at v4550.
//   AV the motion vector ignored, history always read at the pixel's own uv -> 3 red.
//   AW the first-frame rule dropped, a null history treated as zeros          -> 2 red, on the CPU and on the device.
//   AX the off-screen and invalid refusals removed                            -> 1 red: stale history reused for
//      surfaces that had none, which is how a temporal pass smears geometry entering the frame.
//   AY the clamp widened to the whole [0,1] range -- present, and binding on nothing -> 2 red. A clamp that cannot
//      bind is decoration, and the ghosting row is what notices.
//   AZ the blend inverted, alpha weighting the HISTORY                        -> 6 red, most of the gate.
//   AU the history sampled NEAREST instead of bilinear                        -> 2 red, AFTER this round added the
//      row for it. *** IT WENT 0-RED FIRST AND THAT IS THE FINDING. *** Every convergence row holds the camera
//      STILL, so the reprojection lands exactly on a texel centre where nearest and bilinear agree; and the device
//      parity row cannot help, because a change made to BOTH sides leaves them agreeing. Nothing asserted that a
//      sub-texel reprojection interpolates -- the normal case for any camera that moves at all. A row now reads a
//      known fractional motion over a known gradient and holds it to an interpolation computed in the gate.
//   BA the clamp's 3x3 read from the HISTORY instead of the current frame     -> 1 red, AFTER this round added the
//      fourth device case. *** ALSO 0-RED FIRST. *** The parity cases used a history that was nearly the current
//      frame, so clamping to one 3x3 or the other gave almost the same answer and a WGSL-only swap was invisible.
//      A case whose history is a completely different picture makes the two sources disagree by half the range.
//   No 0-RED among the seven once those two rows exist. Both gaps were the same shape: a property that only shows
//   under conditions no row arranged, in a gate whose other rows all passed.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: UPSCALING -- this rung accumulates at ratio 1, where the samples and the output share a grid; " +
    "above 1 the jitter-aware Lanczos2 upsample is its own piece and nothing here stands in for it. Also: a MOVING scene " +
    "(the convergence rows hold the camera and the world still, so reprojection is the identity there and only section 2 " +
    "exercises a real motion vector); DISOCCLUSION, which the clamp softens but does not solve; REACTIVE masks and " +
    "shading-change detection, which FSR uses to spare transparency and lighting changes from the clamp; and a fixed " +
    "alpha's steady-state, since the convergence rows use alpha = 1/(n+1) to get the exact running mean.");
process.exit(fails ? 1 : 0);
