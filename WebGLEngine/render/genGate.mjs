// render/genGate.mjs -- the LEARNED PER-BLOCK GATE on frame generation, CPU side.
//
// *** WHAT THIS PREDICTS, AND WHY IT IS A DECISION RATHER THAN A PICTURE. ***
// Twelve rounds of this arc measured that a generated frame LOSES to a cross-fade of the same two presented
// frames, and refuted three explanations for it. What survived is content spatial frequency: generation wins
// where the picture has detail a cross-fade destroys (pixel checker +0.107 dB) and loses where it does not
// (smooth -0.857, zone plate -0.965). So the useful learned quantity here is not a pixel -- it is WHERE TO
// TRUST THE GENERATOR, per block, without having seen the answer.
//
// *** THE SHAPE IS FIXED BY brain/learn.js's TRAINER AND NOT BY TASTE. *** MLPTrainer has a SCALAR SIGMOID
// head: one z2, one L2.b[0], and a `p - r` update, which is binary cross-entropy against a reward in [0, 1].
// It cannot regress a vector and it cannot do 3-way classification. A learned blend weight or a learned
// `source` choice would each have needed the trainer rewritten; a per-block binary gate fits it exactly.
// render/learned-preregistration.md fixed all of this BEFORE any feature was extracted.
//
// NO FEATURE HERE MAY TOUCH THE TRUE MIDDLE FRAME. That is the one way to make a learned result worthless,
// so `features()` is not given it at all -- it takes only what the chain has already produced by the time the
// generator runs. `labels()` takes it, is used at TRAINING time only, and is a separate function on purpose.
"use strict";
import { SRC_APP, SRC_FLOW_BEAT } from "./flowReconcile.mjs";

/** The eleven, in the pre-registration's order. Exported so a gate can assert the order has not drifted. */
export const FEATURE_NAMES = Object.freeze([
    "sadApp", "sadFlow", "sadStill", "absFx", "absFy",
    "laplacian", "variance", "depth", "holeFrac", "srcIsApp", "srcIsFlowBeat",
]);
export const N_FEATURES = FEATURE_NAMES.length;   // 11
export const HIDDEN = 16;                         // fixed in the pre-registration, section 3

const f = Math.fround;
const lum = (px, i) => f(0.25 * px[i * 4] + 0.5 * px[i * 4 + 1] + 0.25 * px[i * 4 + 2]);

/**
 * Per-block features for one generated frame. Returns Float32Array(bw*bh*N_FEATURES), row-major by block.
 *
 * `cur` is the frame the generator warps FROM at time t=1; `rc` is reconcileFlowCPU's output; `hole` is
 * interpolateFrameCPU's post-splat mask; `depthBlock` is the per-block depth the splat contested on.
 */
export function features({ cur, w, h, rc, hole, depthBlock, block }) {
    const bw = rc.bw, bh = rc.bh;
    if (!(bw > 0 && bh > 0)) throw new Error("genGate.features: the reconciled field has no blocks");
    if (!depthBlock || depthBlock.length < bw * bh)
        throw new Error(`genGate.features: depthBlock must be bw*bh = ${bw * bh} -- got ${depthBlock ? depthBlock.length : "nothing"}`);
    if (!hole || hole.length < w * h)
        throw new Error(`genGate.features: hole must be w*h = ${w * h} -- got ${hole ? hole.length : "nothing"}`);
    const out = new Float32Array(bw * bh * N_FEATURES);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const b = by * bw + bx, o = b * N_FEATURES;
        // ---- the three SADs and the reconciled vector, straight off the chain ----
        out[o + 0] = rc.sadApp[b]; out[o + 1] = rc.sadFlow[b]; out[o + 2] = rc.sadStill[b];
        out[o + 3] = Math.abs(rc.flow[b * 2]); out[o + 4] = Math.abs(rc.flow[b * 2 + 1]);
        // ---- the spatial-frequency pair, over the block's own pixels in `cur` ----
        // *** THE LAPLACIAN IS THE FEATURE THE ARC'S FINDING POINTS AT, AND THE VARIANCE IS ITS CRUDER
        // TWIN. *** Both are here because they disagree on a zone plate: variance is high wherever the
        // picture swings, the Laplacian only where it swings FAST, and the arc's ordering runs with the
        // second. Keeping both lets section 9's secondary say which the weights actually lean on.
        let sum = 0, sumSq = 0, lap = 0, n = 0;
        const x0 = bx * block, y0 = by * block;
        for (let y = y0; y < Math.min(h, y0 + block); y++) for (let x = x0; x < Math.min(w, x0 + block); x++) {
            const i = y * w + x, c = lum(cur, i);
            sum += c; sumSq += c * c; n++;
            // 4-neighbour Laplacian with CLAMPED edges -- the frame's border is not a discontinuity
            const l = lum(cur, y * w + Math.max(0, x - 1)), r = lum(cur, y * w + Math.min(w - 1, x + 1));
            const u = lum(cur, Math.max(0, y - 1) * w + x), d = lum(cur, Math.min(h - 1, y + 1) * w + x);
            lap += Math.abs(4 * c - l - r - u - d);
        }
        const mean = n ? sum / n : 0;
        out[o + 5] = n ? lap / n : 0;
        out[o + 6] = n ? Math.max(0, sumSq / n - mean * mean) : 0;
        out[o + 7] = depthBlock[b];
        // ---- how much of the block the splat failed to cover ----
        let holes = 0;
        for (let y = y0; y < Math.min(h, y0 + block); y++) for (let x = x0; x < Math.min(w, x0 + block); x++)
            if (hole[y * w + x]) holes++;
        out[o + 8] = n ? holes / n : 0;
        // ---- which candidate the reconciler chose, one-hot over two of the three codes ----
        // SRC_FLOW_ONLY is the implied third and is NOT given a column: three one-hot columns for three
        // exclusive codes is one redundant column, and a redundant input is a free parameter.
        out[o + 9] = rc.source[b] === SRC_APP ? 1 : 0;
        out[o + 10] = rc.source[b] === SRC_FLOW_BEAT ? 1 : 0;
    }
    return out;
}

/**
 * The per-block labels: 1 where the GENERATED block beat the CROSS-FADED one against the true middle frame.
 *
 * *** THIS TAKES GROUND TRUTH AND `features()` DOES NOT. *** They are separate functions so that the
 * separation is structural rather than a promise in a comment: nothing that computes a feature can reach
 * `truth` from here, because it was never passed one.
 */
export function labels({ gen, cf, truth, w, h, bw, bh, block }) {
    for (const [nm, a] of [["gen", gen], ["cf", cf], ["truth", truth]])
        if (!a || a.length < w * h * 4) throw new Error(`genGate.labels: ${nm} must be w*h*4 = ${w * h * 4} -- got ${a ? a.length : "nothing"}`);
    const y = new Uint8Array(bw * bh), mseGen = new Float32Array(bw * bh), mseCf = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const b = by * bw + bx;
        let eg = 0, ec = 0, n = 0;
        for (let yy = by * block; yy < Math.min(h, by * block + block); yy++)
            for (let xx = bx * block; xx < Math.min(w, bx * block + block); xx++) {
                const i = yy * w + xx;
                for (let c = 0; c < 3; c++) {   // rgb; alpha carries no picture here
                    const t = truth[i * 4 + c];
                    eg += (gen[i * 4 + c] - t) ** 2;
                    ec += (cf[i * 4 + c] - t) ** 2;
                }
                n += 3;
            }
        mseGen[b] = n ? eg / n : 0; mseCf[b] = n ? ec / n : 0;
        y[b] = mseGen[b] < mseCf[b] ? 1 : 0;
    }
    return { y, mseGen, mseCf, base: y.reduce((a, v) => a + v, 0) / (y.length || 1) };
}

/**
 * Feature standardisation, fitted on TRAINING ROWS ONLY.
 *
 * *** A SCALER FITTED ON THE HELD-OUT SCENE LEAKS IT, *** which is the quietest way to make a held-out
 * measurement report an in-distribution one. `fitScaler` is therefore only ever called on the training split
 * and the constants it returns ship beside the weights; `applyScaler` is what inference uses.
 */
export function fitScaler(rows) {
    const n = rows.length / N_FEATURES;
    if (!n) throw new Error("genGate.fitScaler: no rows");
    const mean = new Float32Array(N_FEATURES), sd = new Float32Array(N_FEATURES);
    for (let i = 0; i < n; i++) for (let k = 0; k < N_FEATURES; k++) mean[k] += rows[i * N_FEATURES + k];
    for (let k = 0; k < N_FEATURES; k++) mean[k] /= n;
    for (let i = 0; i < n; i++) for (let k = 0; k < N_FEATURES; k++) sd[k] += (rows[i * N_FEATURES + k] - mean[k]) ** 2;
    // A CONSTANT COLUMN GETS sd 1, NOT sd 0 -- dividing by its spread would put an infinity in every row, and
    // a feature that never varies should contribute nothing rather than everything.
    for (let k = 0; k < N_FEATURES; k++) { sd[k] = Math.sqrt(sd[k] / n); if (!(sd[k] > 1e-8)) sd[k] = 1; }
    return { mean, sd, n };
}
export function applyScaler(rows, sc) {
    const out = new Float32Array(rows.length);
    for (let i = 0; i < rows.length; i++) { const k = i % N_FEATURES; out[i] = (rows[i] - sc.mean[k]) / sc.sd[k]; }
    return out;
}

/**
 * The forward pass, in f32, matching brain/mlp.js's kernel operation for operation.
 * Two layers: [N_FEATURES -> HIDDEN, relu] then [HIDDEN -> 1, sigmoid].
 */
export function forward(layers, x, batch) {
    let a = x;
    for (const L of layers) {
        const y = new Float32Array(batch * L.nOut);
        for (let r = 0; r < batch; r++) {
            const xoff = r * L.nIn;
            for (let o = 0; o < L.nOut; o++) {
                const woff = o * L.nIn;
                let acc = f(L.b[o]);
                for (let k = 0; k < L.nIn; k++) acc = f(acc + f(f(a[xoff + k]) * f(L.W[woff + k])));
                if (L.act === "relu") acc = f(Math.max(acc, 0));
                else if (L.act === "sigmoid") acc = f(1 / f(1 + f(Math.exp(f(-acc)))));
                y[r * L.nOut + o] = acc;
            }
        }
        a = y;
    }
    return a;
}

/** Blend a generated frame with a cross-fade, taking the generator only where `keep` says so. */
export function applyGate({ gen, cf, keep, w, h, bw, block }) {
    const out = new Float32Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, b = ((y / block) | 0) * bw + ((x / block) | 0);
        const src = keep[b] ? gen : cf;
        for (let c = 0; c < 4; c++) out[i * 4 + c] = src[i * 4 + c];
    }
    return out;
}
