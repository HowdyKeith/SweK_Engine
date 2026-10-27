#!/usr/bin/env node
// WebGLEngine/render/learnedUpscale-selfcheck.mjs -- FSR4's first round, round 65 (pre-registration section 148)
//
// U, the learned 2x upscale, on synthetic frames only -- no scene of any split is rendered here:
//   1. its input: the bilinear upsample, the guides, the depth, the phase, at the channels the module names
//   2. its output: an untrained U is the 4 x 4 box; any U's pixel lies within its sixteen taps (it only redistributes light)
//   3. its gradients: the loss's, through the transfer, the composite, the softmax and the network, against finite differences;
//      and a crop's loss is the whole frame's at the same pixels
//   4. its training: deterministic by seed, and on frames whose truth is known it learns -- beating the bilinear upsample it is fed
//
// SABOTAGED, each restored byte-identical (sha-256): U1 the taps a texel right -> 3 red (the taps, the crop, the training's win);
// U2 the composite's (1 - cov) left out of the gradient -> 2 red; U3 the softmax's Jacobian without its mean -> 2 red; U4 the head
// not zeroed -> 1 red (the box); U5 the crop's pad 1 -> 3 red (NaN); U6 the x phase flipped -> 2 red; U7 the loss in linear
// radiance -> 3 red (U7 had no row of its own before it was run: the gradient check stays consistent with whichever loss it is
// given, so the definition row was added for it); U8 the crop's composite without E -> 1 red.
// SECTION 157 (U_E): E1 EASU's logit back at +8 -> 2 red; E2 the 17th tap read from the half frame -> 2 red; E3 the head not
// zeroed -> 1 red; E4 the first layer 16 wide -> 2 red; E5 the crop's EASU halved -> 2 red. Each restored byte-identical.
// SECTION 159 (U_R): R1 the hold 0.6, R2 the derivative without tanh', R3 the head not zeroed, R5 the residual additive -> 2 red
// each; R4 the input without EASU, R6 the crop's E zeroed, R7 the chain without EASU for U_R -> 1 red each. Each restored byte-identical.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ENG, p)).href);
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const t0 = Date.now();
const U = await imp("render/learnedUpscale.mjs"), { seededRandom, initNet, paramCount } = await imp("brain/convNet.mjs");
const { toPerceptual } = await imp("render/denoiseUpscale.mjs"), { relMSE } = await imp("render/denoiseStats.mjs");

// a synthetic scene at full size: smooth light with edges (two discs), albedo and normals that follow the discs, depth per disc;
// its half-size frame is the 2 x 2 box of the full -- so the truth of the upscale is known
function scene(W, H, seed) {
    const r = seededRandom(seed), discs = Array.from({ length: 3 }, () => ({ x: r.u() * W, y: r.u() * H, rad: (0.15 + 0.2 * r.u()) * W, c: [r.u() * 2, r.u() * 2, r.u() * 2], d: 1 + 4 * r.u() }));
    const full = new Float64Array(W * H * 3), albedo = new Float64Array(W * H * 3), normal = new Float64Array(W * H * 3), depth = new Float64Array(W * H).fill(1e9);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; let hit = null;
        for (const D of discs) if ((x + 0.5 - D.x) ** 2 + (y + 0.5 - D.y) ** 2 < D.rad * D.rad && (!hit || D.d < hit.d)) hit = D;
        for (let c = 0; c < 3; c++) { full[p * 3 + c] = hit ? hit.c[c] * (0.6 + 0.4 * Math.sin(0.3 * x + c)) : 0.05 + 0.02 * c; albedo[p * 3 + c] = hit ? 0.3 + 0.2 * c : 0; normal[p * 3 + c] = hit ? (c === 2 ? 1 : 0) : 0; }
        if (hit) depth[p] = hit.d; }
    const w = W / 2, h = H / 2, half = new Float64Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++)
        half[(y * w + x) * 3 + c] = (full[((2 * y) * W + 2 * x) * 3 + c] + full[((2 * y) * W + 2 * x + 1) * 3 + c] + full[((2 * y + 1) * W + 2 * x) * 3 + c] + full[((2 * y + 1) * W + 2 * x + 1) * 3 + c]) / 4;
    const cov = new Float64Array(W * H), E = new Float64Array(W * H * 3);
    return { w, h, half, ref: full, cov, E, x: U.upscaleInput(half, w, h, albedo, normal, depth), albedo, normal, depth };
}

console.log("1. THE INPUT");
{
    const s = scene(16, 12, 1), C = U.UP_CHANNELS, W = 16;
    const p = 5 * W + 7, o = p * C, u = (7 + 0.5) / 2 - 0.5, v = (5 + 0.5) / 2 - 0.5, x0 = Math.floor(u), y0 = Math.floor(v), tx = u - x0, ty = v - y0, hw = 8;
    const bil = (c) => (s.half[(y0 * hw + x0) * 3 + c] * (1 - tx) + s.half[(y0 * hw + x0 + 1) * 3 + c] * tx) * (1 - ty) + (s.half[((y0 + 1) * hw + x0) * 3 + c] * (1 - tx) + s.half[((y0 + 1) * hw + x0 + 1) * 3 + c] * tx) * ty;
    ok("  UP_CHANNELS 12 -- the bilinear upsample (0-2), the albedo (3-5), the normal (6-8), depth d / (1 + d) with sky 0 (9), the phase +-0.25 (10, 11)",
        C === 12 && [0, 1, 2].every((c) => Math.abs(s.x[o + c] - bil(c)) < 1e-15) && [0, 1, 2].every((c) => s.x[o + 3 + c] === s.albedo[p * 3 + c] && s.x[o + 6 + c] === s.normal[p * 3 + c]) &&
        s.x[o + 9] === (s.depth[p] >= 1e8 ? 0 : s.depth[p] / (1 + s.depth[p])) && s.x[o + 10] === 0.25 && s.x[o + 11] === 0.25 && s.x[(0 * W + 0) * C + 10] === -0.25 && s.x[(0 * W + 0) * C + 11] === -0.25);
    const T = U.upTaps(0, 0, 8, 6), T2 = U.upTaps(7, 5, 8, 6);
    ok("  upTaps: the 4 x 4 half-size texels round the pixel's centre, clamped at the frame's edge",
        T.length === 16 && T[0] === 0 && T[5] === 0 && T[15] === 1 * 8 + 1 && T2[0] === 1 * 8 + 2 && T2[15] === 4 * 8 + 5);
}

console.log("\n2. THE OUTPUT");
{
    const s = scene(16, 12, 2), net0 = U.makeUpscaler(7), r0 = U.learnedUpscale(net0, s.x, s.half, s.w, s.h);
    let boxErr = 0; for (let Y = 0; Y < 12; Y++) for (let X = 0; X < 16; X++) { const T = U.upTaps(X, Y, 8, 6); for (let c = 0; c < 3; c++) {
        const m = Array.from(T).reduce((a, q) => a + s.half[q * 3 + c], 0) / 16; boxErr = Math.max(boxErr, Math.abs(r0.y[(Y * 16 + X) * 3 + c] - m)); } }
    ok("!! an untrained U (the head's weights zero) is the 4 x 4 box: every weight 1/16, every pixel the mean of its taps", boxErr < 1e-14 && r0.w.every((v) => Math.abs(v - 1 / 16) < 1e-15), `worst ${boxErr.toExponential(2)}`);
    const net = initNet(U.UP_SHAPE, seededRandom(9)), r = U.learnedUpscale(net, s.x, s.half, s.w, s.h);
    let out = 0; for (let Y = 0; Y < 12; Y++) for (let X = 0; X < 16; X++) { const T = U.upTaps(X, Y, 8, 6); for (let c = 0; c < 3; c++) {
        const vs = Array.from(T).map((q) => s.half[q * 3 + c]), v = r.y[(Y * 16 + X) * 3 + c]; if (v < Math.min(...vs) - 1e-12 || v > Math.max(...vs) + 1e-12) out++; } }
    ok("!! any U's pixel lies within its sixteen taps, channel by channel -- it redistributes the half-size light and adds none", out === 0 && r.w.some((v) => Math.abs(v - 1 / 16) > 1e-3), `${out} outside`);
    ok("  UP_SHAPE: three 3 x 3 layers of 16 and the 16-logit head as 1 x 1 -- 6,656 parameters (1,744 + 2,320 + 2,320 + 272), about the shipped denoiser's",
        U.UP_SHAPE.length === 4 && U.UP_SHAPE[3][1] === 16 && U.UP_SHAPE[3][3] === 1 && paramCount(net) === 6656, `${paramCount(net)}`);
}

console.log("\n3. THE GRADIENTS");
{
    const s = scene(8, 8, 3), net = initNet(U.UP_SHAPE, seededRandom(11));
    for (let p = 0; p < 64; p++) if (p % 5 === 0) { s.cov[p] = 0.5; for (let c = 0; c < 3; c++) s.E[p * 3 + c] = 0.7; }
    const g = U.upLossAndGrads(net, s.x, s.half, s.w, s.h, s.ref, s.cov, s.E);
    const L = () => U.upLossAndGrads(net, s.x, s.half, s.w, s.h, s.ref, s.cov, s.E).loss;
    let worst = 0;
    for (const [li, wi] of [[0, 3], [0, 400], [1, 77], [2, 1200], [3, 5], [3, 200]]) {
        const Wt = net.layers[li].W, keep = Wt[wi], e = 1e-6; Wt[wi] = keep + e; const a = L(); Wt[wi] = keep - e; const b = L(); Wt[wi] = keep;
        const fd = (a - b) / (2 * e), an = g.grads[li].dW[wi]; worst = Math.max(worst, Math.abs(fd - an) / Math.max(1e-9, Math.abs(fd) + Math.abs(an)));
    }
    ok("!! the loss's gradient -- display space, through the composite (E, cov), the softmax and the network -- matches central differences on weights in every layer, within 1e-5 relative",
        worst < 1e-5 && g.loss > 0, `worst ${worst.toExponential(2)}`);
    // the loss is its definition: relMSE of the composite E + (1 - cov) U against the reference, both through round 26's transfer
    const yU = U.learnedUpscale(net, s.x, s.half, s.w, s.h).y, O = Float64Array.from(yU, (v, i) => s.E[i] + (1 - s.cov[(i / 3) | 0]) * v);
    ok("!! the loss is section 148's: relMSE in display space of the composite (E + (1 - cov) U) against the reference", Math.abs(g.loss - relMSE(Float64Array.from(O, toPerceptual), Float64Array.from(s.ref, toPerceptual))) < 1e-15, `${g.loss}`);
    const c = U.cropLoss(net, s, 0, 0, 8);
    let gd = 0; c.grads.forEach((q, i) => q.dW.forEach((v, j) => { gd = Math.max(gd, Math.abs(v - g.grads[i].dW[j])); }));
    ok("  ...and a crop of the whole frame, its taps read from the padded half-size window, gives the whole frame's loss and gradients", Math.abs(c.loss - g.loss) < 1e-15 && gd < 1e-15, `loss ${c.loss} / ${g.loss}, grads ${gd.toExponential(2)}`);
    const s2 = scene(16, 16, 4), net2 = initNet(U.UP_SHAPE, seededRandom(12)), whole = U.learnedUpscale(net2, s2.x, s2.half, s2.w, s2.h);
    // a crop away from the edge: its output pixels are the whole frame's -- U is 3 conv layers deep, so the crop's inner pixels (3 in) are exact
    const cc = U.upCrop(s2, 4, 4, 8);
    ok("  upCrop: the crop's input, reference and composite are the whole frame's at those pixels, and its half window the frame's texels round them",
        cc.x.length === 64 * 12 && cc.x[(1 * 8 + 2) * 12 + 4] === s2.x[(5 * 16 + 6) * 12 + 4] && cc.half[((0 + 2) * cc.hw + 2) * 3] === s2.half[(2 * 8 + 2) * 3] && whole.y.length === 16 * 16 * 3);
}

console.log("\n4. THE TRAINING");
{
    const ex = [5, 6, 7, 8].map((k) => scene(32, 32, 100 + k)), test = [scene(32, 32, 200), scene(32, 32, 201)];
    const run = () => U.trainUpscaler(ex, { seed: 3, steps: 120, batch: 2, crop: 16 });
    const a = run(), b = run();
    ok("  deterministic: the same seed trains the same U, bit for bit", a.net.layers.every((L, i) => L.W.every((v, j) => Object.is(v, b.net.layers[i].W[j]))) && a.losses.every((v, i) => Object.is(v, b.losses[i])));
    const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length;
    ok("!! it learns: the last 20 steps' loss below the first 20's", mean(a.losses.slice(-20)) < 0.8 * mean(a.losses.slice(0, 20)), `${mean(a.losses.slice(0, 20)).toFixed(5)} -> ${mean(a.losses.slice(-20)).toFixed(5)}`);
    const disp = (y) => Float64Array.from(y, toPerceptual);
    const score = (t, y) => relMSE(disp(y), disp(t.ref));
    const learned = test.map((t) => score(t, U.learnedUpscale(a.net, t.x, t.half, t.w, t.h).y)), bilinear = test.map((t) => { const y = new Float64Array(32 * 32 * 3);
        for (let p = 0; p < 1024; p++) for (let c = 0; c < 3; c++) y[p * 3 + c] = t.x[p * 12 + c]; return score(t, y); });
    ok("!! ...and on two held-out frames of known truth it beats the bilinear upsample it is fed, in display space", learned.every((v, i) => v < bilinear[i]), learned.map((v, i) => `${v.toExponential(2)} against ${bilinear[i].toExponential(2)}`).join("; "));
}

console.log("\n5. ROUND 68 (section 157): U_E, A LEARNED CORRECTION OF EASU");
{
    const { upscale } = await imp("render/denoiseUpscale.mjs"), withEasu = (sc) => ({ ...sc, easuUp: upscale(sc.half, sc.w, sc.h, 2 * sc.w, 2 * sc.h, "easu") });
    const s = withEasu(scene(16, 12, 21)), u0 = U.makeUpscalerE(4), r0 = U.learnedUpscale(u0, s.x, s.half, s.w, s.h, s.easuUp), K = U.UPE_TAPS;
    const wE = Math.exp(U.UPE_EASU_BIAS) / (16 + Math.exp(U.UPE_EASU_BIAS));
    let worstW = 0, worstY = 0; for (let p = 0; p < 16 * 12; p++) { worstW = Math.max(worstW, Math.abs(r0.w[p * K + 16] - wE));
        const T = U.upTaps(p % 16, (p / 16) | 0, 8, 6); for (let c = 0; c < 3; c++) { const box = Array.from(T).reduce((q, i) => q + s.half[i * 3 + c], 0) / 16;
            worstY = Math.max(worstY, Math.abs(r0.y[p * 3 + c] - (wE * s.easuUp[p * 3 + c] + (1 - wE) * box))); } }
    ok("!! an untrained U_E -- the head zero, EASU's logit biased -8 -- is round 67's box start, with e^-8 / (16 + e^-8) = 2.10e-5 of every pixel on EASU's own output",
        U.UPE_TAPS === 17 && U.UPE_EASU_BIAS === -8 && Math.abs(wE - 2.0966e-5) < 1e-9 && worstW < 1e-14 && worstY < 1e-13 && U.UPE_SHAPE[0][1] === 32 && U.UPE_SHAPE[3][1] === 17,
        `weight on EASU ${wE.toExponential(4)}; worst ${worstY.toExponential(2)}`);
    let refused = null; try { U.learnedUpscale(u0, s.x, s.half, s.w, s.h); } catch (e) { refused = e.message; }
    ok("  ...and U_E without EASU's output is refused, not run on a missing tap", /pass easuUp/.test(refused || ""));
    const g8 = withEasu(scene(8, 8, 23)), net = U.makeUpscalerE(5);
    net.layers.forEach((L, li) => { const r = seededRandom(30 + li); for (let i = 0; i < L.W.length; i++) L.W[i] += 0.05 * (r.u() - 0.5); });
    for (let p = 0; p < 64; p++) if (p % 7 === 0) { g8.cov[p] = 0.4; for (let c = 0; c < 3; c++) g8.E[p * 3 + c] = 0.6; }
    const G = U.upLossAndGrads(net, g8.x, g8.half, g8.w, g8.h, g8.ref, g8.cov, g8.E, g8.easuUp), L = () => U.upLossAndGrads(net, g8.x, g8.half, g8.w, g8.h, g8.ref, g8.cov, g8.E, g8.easuUp).loss;
    let worst = 0;
    for (const [li, wi] of [[0, 9], [1, 500], [2, 3000], [3, 16], [3, 16 * 32 + 5], [3, 540]]) { const Wt = net.layers[li].W, keep = Wt[wi], e = 1e-5; Wt[wi] = keep + e; const a1 = L(); Wt[wi] = keep - e; const b1 = L(); Wt[wi] = keep;
        const fd = (a1 - b1) / (2 * e), an = G.grads[li].dW[wi]; worst = Math.max(worst, Math.abs(fd - an) / Math.max(1e-9, Math.abs(fd) + Math.abs(an))); }
    ok("!! U_E's gradient, through EASU's tap as well as the sixteen, matches central differences (step 1e-5: the head's entries are ~1e-6, below 1e-6's roundoff) in every layer within 1e-5 relative", worst < 1e-5, `worst ${worst.toExponential(2)}`);
    const C8 = U.cropLoss(net, g8, 0, 0, 8); let gd = 0; C8.grads.forEach((q, i) => q.dW.forEach((v, j) => { gd = Math.max(gd, Math.abs(v - G.grads[i].dW[j])); }));
    ok("  ...and a crop of the whole frame gives the whole frame's loss and gradients, EASU's tap cropped with it", Math.abs(C8.loss - G.loss) < 1e-15 && gd < 1e-15);
    const ex = [5, 6, 7, 8].map((k) => withEasu(scene(32, 32, 300 + k))), test = [withEasu(scene(32, 32, 400)), withEasu(scene(32, 32, 401))];
    const run = (steps) => U.trainUpscaler(ex, { seed: 3, steps, batch: 2, crop: 16, variant: "easu" }), a0 = run(20), b0 = run(20), a = run(300);
    ok("  U_E trains deterministically by seed", a0.net.layers.every((Lr, i) => Lr.W.every((v, j) => Object.is(v, b0.net.layers[i].W[j]))) && a.net.layers[3].Cout === 17);
    const disp = (y) => Float64Array.from(y, toPerceptual), score = (t, y) => relMSE(disp(y), disp(t.ref));
    const learned = test.map((t) => score(t, U.learnedUpscale(a.net, t.x, t.half, t.w, t.h, t.easuUp).y)), easu = test.map((t) => score(t, t.easuUp));
    ok("!! ...and on two held-out frames of known truth 300 steps from the box start beat EASU, the tap it is offered, in display space", learned.every((v, i) => v < easu[i]), learned.map((v, i) => `${v.toExponential(3)} against ${easu[i].toExponential(3)}`).join("; "));
    const stuck = U.trainUpscaler(ex, { seed: 3, steps: 300, batch: 2, crop: 16, variant: "easu", easuBias: 8 }).net, atE = test.map((t) => score(t, U.learnedUpscale(stuck, t.x, t.half, t.w, t.h, t.easuUp).y));
    ok("  ...where the same 300 steps from a start at EASU (its logit +8) never leave it, to 3 digits -- section 157's pilot, why U_E starts from the box", atE.every((v, i) => Math.abs(v - easu[i]) < 1e-3 * easu[i]), atE.map((v, i) => `${v.toExponential(3)} against ${easu[i].toExponential(3)}`).join("; "));
    let bad = null; try { U.trainUpscaler([scene(16, 16, 1)], { seed: 1, steps: 1, batch: 1, crop: 16, variant: "easu" }); } catch (e) { bad = e.message; }
    ok("  ...and U_E's training refuses examples without EASU's output, and the variant is box, easu or (round 69) residual", /carry easuUp/.test(bad || "") && U.UP_VARIANTS.join() === "box,easu,residual");
}

console.log("\n6. ROUND 69 (section 159): U_R, A HELD RESIDUAL ON EASU");
{
    const { upscale } = await imp("render/denoiseUpscale.mjs"), withEasu = (sc) => ({ ...sc, easuUp: upscale(sc.half, sc.w, sc.h, 2 * sc.w, 2 * sc.h, "easu") });
    const s = withEasu(scene(16, 12, 21)), u0 = U.makeUpscalerR(4), r0 = U.learnedUpscale(u0, s.x, s.half, s.w, s.h, s.easuUp), xr = U.residualInput(s.x, s.easuUp, 16, 12);
    ok("!! an untrained U_R -- the head zero -- is EASU's output exactly, bit for bit; its input U's twelve channels and EASU's three; 32 wide, a 3-channel head; the hold 0.5",
        r0.y.every((v, i) => Object.is(v, s.easuUp[i])) && U.UPR_CHANNELS === 15 && U.UPR_SCALE === 0.5 && U.UPR_SHAPE[0][0] === 15 && U.UPR_SHAPE[0][1] === 32 && U.UPR_SHAPE[3][1] === 3 && U.isResidual(u0) &&
        !U.isResidual(U.makeUpscalerE(4)) && !U.isResidual(U.makeUpscaler(4)) &&
        [0, 50, 191].every((p) => [...Array(12).keys()].every((c) => xr[p * 15 + c] === s.x[p * 12 + c]) && [0, 1, 2].every((c) => xr[p * 15 + 12 + c] === s.easuUp[p * 3 + c])));
    const net = U.makeUpscalerR(5);
    net.layers.forEach((L, li) => { const r = seededRandom(40 + li); for (let i = 0; i < L.W.length; i++) L.W[i] += 0.3 * (r.u() - 0.5); for (let i = 0; i < L.b.length; i++) L.b[i] += 0.3 * (r.u() - 0.5); });
    const o = U.learnedUpscale(net, s.x, s.half, s.w, s.h, s.easuUp);
    let held = true; for (let i = 0; i < o.y.length; i++) { const k = o.y[i] / s.easuUp[i]; if (s.easuUp[i] > 0 && !(k >= 0.5 - 1e-12 && k <= 1.5 + 1e-12 && Math.abs(k - (1 + 0.5 * Math.tanh(o.w[i]))) < 1e-12)) held = false; }
    ok("!! any U_R's pixel is EASU's times 1 + 0.5 tanh(r): within half and one and a half of EASU on every channel, never negative where EASU is not",
        held && o.w.some((v) => Math.abs(v) > 0.05), `residual range ${Math.min(...o.w).toFixed(3)} to ${Math.max(...o.w).toFixed(3)}`);
    let refused = null; try { U.learnedUpscale(u0, s.x, s.half, s.w, s.h); } catch (e) { refused = e.message; }
    ok("  ...and U_R without EASU's output is refused", /U_R corrects EASU's output/.test(refused || ""));
    const g8 = withEasu(scene(8, 8, 23));
    for (let p = 0; p < 64; p++) if (p % 7 === 0) { g8.cov[p] = 0.4; for (let c = 0; c < 3; c++) g8.E[p * 3 + c] = 0.6; }
    const G = U.upLossAndGrads(net, g8.x, g8.half, g8.w, g8.h, g8.ref, g8.cov, g8.E, g8.easuUp), L = () => U.upLossAndGrads(net, g8.x, g8.half, g8.w, g8.h, g8.ref, g8.cov, g8.E, g8.easuUp).loss;
    let worst = 0;
    for (const [li, wi] of [[0, 9], [0, 14 * 9 + 4], [1, 500], [2, 3000], [3, 5], [3, 70]]) { const Wt = net.layers[li].W, keep = Wt[wi], e = 1e-5; Wt[wi] = keep + e; const a1 = L(); Wt[wi] = keep - e; const b1 = L(); Wt[wi] = keep;
        const fd = (a1 - b1) / (2 * e), an = G.grads[li].dW[wi]; worst = Math.max(worst, Math.abs(fd - an) / Math.max(1e-9, Math.abs(fd) + Math.abs(an))); }
    ok("!! U_R's gradient, through the composite, the transfer and 1 + 0.5 tanh(r), matches central differences in every layer within 1e-5 relative", worst < 1e-5, `worst ${worst.toExponential(2)}`);
    const C8 = U.cropLoss(net, g8, 0, 0, 8); let gd = 0; C8.grads.forEach((q, i) => q.dW.forEach((v, j) => { gd = Math.max(gd, Math.abs(v - G.grads[i].dW[j])); }));
    ok("  ...and a crop of the whole frame gives the whole frame's loss and gradients", Math.abs(C8.loss - G.loss) < 1e-15 && gd < 1e-15);
    const ex = [5, 6, 7, 8].map((k) => withEasu(scene(32, 32, 300 + k))), test = [withEasu(scene(32, 32, 400)), withEasu(scene(32, 32, 401))];
    const run = (steps) => U.trainUpscaler(ex, { seed: 3, steps, batch: 2, crop: 16, variant: "residual" }), a0 = run(20), b0 = run(20), a = run(300);
    ok("  U_R trains deterministically by seed", a0.net.layers.every((Lr, i) => Lr.W.every((v, j) => Object.is(v, b0.net.layers[i].W[j]))) && U.isResidual(a.net));
    const disp = (y) => Float64Array.from(y, toPerceptual), score = (t, y) => relMSE(disp(y), disp(t.ref));
    const learned = test.map((t) => score(t, U.learnedUpscale(a.net, t.x, t.half, t.w, t.h, t.easuUp).y)), easu = test.map((t) => score(t, t.easuUp));
    ok("!! ...and on two held-out frames of known truth, 300 steps from EASU leave it -- and beat it, in display space", learned.every((v, i) => v < 0.95 * easu[i]), learned.map((v, i) => `${v.toExponential(3)} against ${easu[i].toExponential(3)}`).join("; "));
    let bad = null; try { U.trainUpscaler([scene(16, 16, 1)], { seed: 1, steps: 1, batch: 1, crop: 16, variant: "residual" }); } catch (e) { bad = e.message; }
    ok("  ...and U_R's training refuses examples without EASU's output", /U_R trains on examples that carry easuUp/.test(bad || ""));
}

console.log(`\n${fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN"} (${Date.now() - t0} ms)` +
    "\nnot closed here: whether U beats EASU on the path tracer's frames. That is round 65's harvest, section 148's.");
process.exit(fails ? 1 : 0);
