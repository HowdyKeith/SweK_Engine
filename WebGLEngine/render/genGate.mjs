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

// ---- v4693 -- THE OPERATING POINT, AND WHY IT IS A FUNCTION OF SCORES ALONE ---------------------------------
//
// *** C5 IS STRUCTURAL, NOT A PROMISE. *** render/learned-calibration-preregistration.md section 6 requires
// that the threshold never see the held-out scene. `rateMatch` takes SCORES AND A TARGET RATE and nothing
// else -- no scene, no rows, no frames, no labels. There is no argument through which checker data could
// reach it, which is the same construction that keeps `features()` away from ground truth: the separation
// lives in the call signature rather than in a comment somebody has to keep honest.
//
// *** RATE MATCHING IS PARAMETER-FREE, WHICH IS THE POINT. *** v4691 measured a predictor keeping 21% of
// blocks where the truth said about 44%. The smallest tau whose keep-rate meets the target is the one
// correction that introduces no tuning knob -- an accuracy search over a grid would, and is a declared
// secondary precisely so it cannot quietly become the primary.

/**
 * The smallest tau (over the observed scores) whose predicted-positive rate meets `targetRate`.
 * Returns { tau, rate }. Scores are p in [0,1]; ties are handled by scanning DESCENDING and cutting once
 * the rate is met, so the returned tau is achievable rather than interpolated.
 */
export function rateMatch(scores, targetRate) {
    const n = scores.length;
    if (!n) throw new Error("genGate.rateMatch: no scores");
    if (!(targetRate >= 0) || !(targetRate <= 1))
        throw new Error(`genGate.rateMatch: targetRate must be in [0, 1] -- got ${targetRate}`);
    // Keeping NOTHING is a legitimate answer at target 0, and keeping everything at target 1; both are
    // reachable and neither is an error. What is NOT legitimate is interpolating a tau between two observed
    // scores, because the rate is a step function of tau and a tau nothing attains is a tau nobody can apply.
    const sorted = Float64Array.from(scores).sort();          // ascending
    const want = Math.ceil(targetRate * n);
    if (want <= 0) return { tau: Number.POSITIVE_INFINITY, rate: 0 };
    if (want >= n) return { tau: Number.NEGATIVE_INFINITY, rate: 1 };
    const tau = sorted[n - want];
    let rate = 0; for (let i = 0; i < n; i++) if (scores[i] >= tau) rate++;
    return { tau, rate: rate / n };
}

/**
 * Area under the ROC curve, by the rank-sum identity, with ties taking their average rank.
 *
 * *** THIS IS THE DIAGNOSTIC THAT SEPARATES THE ROUND'S TWO EXPLANATIONS, AND IT IS THRESHOLD-FREE. ***
 * Section 2 of the pre-registration: E1 (calibration) predicts AUC comfortably above 0.5, E2
 * (representation) predicts about 0.5. It is declared a diagnostic and not a primary because a ranking that
 * is good does not by itself put dB on the board -- which is a thing this arc can now say from measurement.
 */
export function auc(scores, labels) {
    const n = scores.length;
    if (n !== labels.length) throw new Error(`genGate.auc: ${n} scores against ${labels.length} labels`);
    const pos = labels.reduce((a, v) => a + (v ? 1 : 0), 0), neg = n - pos;
    // A one-class sample has NO auc -- not 0.5, which is the value a coin would score and would read as a
    // measurement. Null with a reason, the shape tools/ship/pairedStats.mjs uses for a constant sample.
    if (!pos || !neg) return { auc: null, pos, neg, why: `one class only: ${pos} positive, ${neg} negative` };
    const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => scores[a] - scores[b]);
    const rank = new Float64Array(n);
    for (let i = 0; i < n;) {
        let j = i; while (j + 1 < n && scores[idx[j + 1]] === scores[idx[i]]) j++;
        const avg = (i + j) / 2 + 1;                          // ranks are 1-based; ties share the mean rank
        for (let k = i; k <= j; k++) rank[idx[k]] = avg;
        i = j + 1;
    }
    let sum = 0; for (let i = 0; i < n; i++) if (labels[i]) sum += rank[i];
    return { auc: (sum - pos * (pos + 1) / 2) / (pos * neg), pos, neg, why: null };
}

// ---- v4696 -- THE SCALE-FREE FEATURE SET -------------------------------------------------------------------
//
// *** WHY A SECOND SET RATHER THAN AN EDIT TO THE FIRST. *** render/learned-transfer-preregistration.md
// clause (b) compares the two on IDENTICAL folds, trainer, seed and split. Editing FEATURE_NAMES in place
// would make that comparison impossible to run and would silently re-map v4691's and v4693's shipped weights
// onto different quantities. Both sets live here; the caller says which it wants.
//
// *** THE MECHANISM, STATED SO IT CAN BE WRONG. *** Five of the original eleven are in the units of the
// picture -- sadApp, sadFlow, sadStill, laplacian, variance -- and those units move with the content. The
// LABEL is a comparison, and a comparison is scale-free, so a network handed absolutes has to infer the
// scene's scale before it can use them. Inferring the scene's scale IS learning scene identity, which is
// exactly what v4693 measured: base rate 0.6343 on smooth against 0.2367 on zone, and AUC 0.4214 off-scene.

export const FEATURE_NAMES_V2 = Object.freeze([
    "logFlowOverApp", "logStillOverApp", "logGain", "dispPerBlock", "lapPerContrast",
    "varOverFrame", "lapOverFrame", "holeFrac", "depthRank", "srcIsApp", "srcIsFlowBeat",
]);
export const N_FEATURES_V2 = FEATURE_NAMES_V2.length;   // 11, deliberately the same count
const EPS = 1e-6;

/**
 * The v2 features for one generated frame. Same call shape as features(), and the same refusal: it is NOT
 * given the true middle frame and has no parameter one could arrive through.
 *
 * *** THE TWO FRAME-RELATIVE TERMS ARE THE POINT OF THE SET. *** `varOverFrame` and `lapOverFrame` divide by
 * the mean of the same quantity over THIS frame, so a block's detail is expressed relative to the picture it
 * is in rather than in absolute contrast. That is the term a prior shift cannot move, and it costs one extra
 * pass over the blocks -- computed here rather than on the host, so inference and training see one definition.
 */
export function featuresV2({ cur, w, h, rc, hole, depthBlock, block }) {
    const base = features({ cur, w, h, rc, hole, depthBlock, block });   // reuse the absolute terms
    const bw = rc.bw, bh = rc.bh, n = bw * bh;
    const out = new Float32Array(n * N_FEATURES_V2);
    // frame means for the two relative terms, and the depth ORDER for the rank
    let sumVar = 0, sumLap = 0;
    for (let b = 0; b < n; b++) { sumLap += base[b * N_FEATURES + 5]; sumVar += base[b * N_FEATURES + 6]; }
    const meanLap = sumLap / n || EPS, meanVar = sumVar / n || EPS;
    // *** THE DEPTH RANK IS A RANK, WHICH IS WHY TIES SHARE ONE. *** Consecutive ranks over tied depths would
    // turn whatever order the sort produced into a feature -- the same defect auc() is written to avoid, and
    // flat geometry makes ties the common case rather than the rare one.
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b2) => depthBlock[a] - depthBlock[b2]);
    const rank = new Float32Array(n);
    for (let i = 0; i < n;) {
        let j = i; while (j + 1 < n && depthBlock[order[j + 1]] === depthBlock[order[i]]) j++;
        const r = n > 1 ? ((i + j) / 2) / (n - 1) : 0;
        for (let k = i; k <= j; k++) rank[order[k]] = r;
        i = j + 1;
    }
    for (let b = 0; b < n; b++) {
        const o = b * N_FEATURES, q = b * N_FEATURES_V2;
        const sadApp = base[o + 0], sadFlow = base[o + 1], sadStill = base[o + 2];
        const lap = base[o + 5], vari = base[o + 6];
        out[q + 0] = Math.log((sadFlow + EPS) / (sadApp + EPS));
        out[q + 1] = Math.log((sadStill + EPS) / (sadApp + EPS));
        out[q + 2] = Math.log((Math.min(sadApp, sadFlow) + EPS) / (sadStill + EPS));
        out[q + 3] = Math.hypot(base[o + 3], base[o + 4]) / block;
        // *** v4696 -- THE PRE-REGISTERED FORM OF THIS FEATURE IS NOT SCALE-FREE, AND ITS OWN TEST FOUND
        // THAT. *** render/learned-transfer-preregistration.md section 2 declares
        // `laplacian / (sqrt(variance) + eps)` with an ABSOLUTE eps. Wherever variance -> 0 -- which is most
        // of a flat frame -- the eps dominates the denominator, the numerator still scales with the picture,
        // and the ratio scales with it too. MEASURED by the row in render/genGate-selfcheck.mjs written to
        // test the scale-free claim: a 4x brightness scaling moved this feature by 1.50e+5.
        //
        // The denominator is regularised by the FRAME's own contrast instead, which scales with the picture
        // exactly as sqrt(variance) does, so the ratio is invariant everywhere including on flat blocks. The
        // absolute floor that remains bites only on a literally uniform frame, where the numerator is zero too.
        // *** v4695 IS LEFT STANDING AND IS NOT EDITED TO AGREE. *** It recorded what was believed before the
        // measurement; this is the measurement. No result in v4696 rests on this feature -- control C8 failed
        // and H3 was not reported -- so the correction costs nothing that was already claimed, and any round
        // that wants to USE this set owes a fresh pre-registration naming this form.
        out[q + 4] = lap / (Math.sqrt(vari) + Math.sqrt(meanVar) + EPS);
        out[q + 5] = vari / meanVar;
        out[q + 6] = lap / meanLap;
        out[q + 7] = base[o + 8];       // holeFrac, already a fraction
        out[q + 8] = rank[b];
        out[q + 9] = base[o + 9];       // srcIsApp
        out[q + 10] = base[o + 10];     // srcIsFlowBeat
    }
    return out;
}

/**
 * Mann-Whitney normal approximation for an AUC against the null 0.5, as section 4 of the transfer
 * pre-registration declares it. Returns { z, p, n } with a two-sided p.
 */
export function aucP(a, nPos, nNeg) {
    if (!(nPos > 0) || !(nNeg > 0)) return { z: null, p: null, why: "one class only" };
    const sd = Math.sqrt(nPos * nNeg * (nPos + nNeg + 1) / 12) / (nPos * nNeg);
    if (!(sd > 0)) return { z: null, p: null, why: "zero variance" };
    const z = (a - 0.5) / sd;
    // two-sided, via the erf complement -- Abramowitz & Stegun 7.1.26, enough digits for a p we compare to 0.05
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
        * Math.exp(-((Math.abs(z) / Math.SQRT2) ** 2));
    return { z, p: Math.min(1, 1 - y), n: nPos + nNeg, why: null };
}
