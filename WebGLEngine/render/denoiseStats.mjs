// WebGLEngine/render/denoiseStats.mjs -- the denoiser arc, round 2: the statistic, as code, before there is anything to
// apply it to
//
// render/learned-denoiser-preregistration.md sections 6 and 7, written as functions and gated on planted outcomes
// (render/denoiseStats-selfcheck.mjs) so the analysis is fixed by code and not only by prose before a single dataset
// error is measured -- v4698's rule. verdict() is the whole decision: it takes the measured errors and returns, per
// hypothesis, "supported", "not supported" or "not resolvable", or "not reported" for the run when a control that
// guards the whole run fires.
"use strict";

export const REL_EPS = 0.01;      // relMSE's denominator offset
export const C1_MIN_WINS = 11;    // of 12: both methods must beat the noisy input this often
export const C1_OF = 12;          // ...and section 26 holds the training images to the same fraction, 11 in 12
export const C3_FLOOR_FACTOR = 2; // a method within this factor of the reference floor cannot be ranked there
export const C0_MAX_RATIO = 0.8;  // section 13: every seed's network must fit its training set to this x the noisy error
export const C6_MAX_RATIO = 0.8;  // section 17: the accumulated history must bring the training images to this x the noisy error

/** Relative MSE over every pixel and channel: mean( (y - r)^2 / (r^2 + 0.01) ). */
export function relMSE(y, r) {
    if (y.length !== r.length || !y.length) throw new Error(`denoiseStats: relMSE over ${y.length} and ${r.length} values`);
    let s = 0;
    for (let i = 0; i < y.length; i++) { const e = y[i] - r[i]; s += e * e / (r[i] * r[i] + REL_EPS); }
    return s / y.length;
}

/** The network's per-image relMSE: the MEAN over seeds of each seed's relMSE (not the relMSE of a mean image). */
export function seedMean(perSeed) {
    const n = perSeed[0].length;
    if (!perSeed.every((s) => s.length === n)) throw new Error("denoiseStats: seeds disagree on the number of images");
    return Array.from({ length: n }, (_, i) => perSeed.reduce((a, s) => a + s[i], 0) / perSeed.length);
}

/** d_i = ln relMSE(filter_i) - ln relMSE(net_i). Positive: the network won image i. */
export function effects(filterRel, netRel) {
    if (filterRel.length !== netRel.length) throw new Error("denoiseStats: effect over unequal sets");
    return filterRel.map((f, i) => Math.log(f) - Math.log(netRel[i]));
}

/** The exact one-sided sign test: P(X >= k) for X ~ Binomial(n, 1/2). */
export function signTestUpper(k, n) {
    if (!(Number.isInteger(k) && Number.isInteger(n) && k >= 0 && k <= n)) throw new Error(`denoiseStats: sign test of ${k} of ${n}`);
    let c = 1n, sum = 0n;
    for (let j = 0; j <= n; j++) { if (j >= k) sum += c; c = c * BigInt(n - j) / BigInt(j + 1); }
    return Number(sum) / 2 ** n;
}

/**
 * Holm-Bonferroni, step-down: sort the p values ascending; the i-th smallest (from 0) is held to alpha / (m - i), and
 * the first that fails stops every later one. Returns per input index { p, threshold, reject }.
 */
export function holm(ps, alpha = 0.05) {
    const m = ps.length, order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = new Array(m);
    let stopped = false;
    order.forEach(([p, i], rank) => {
        const threshold = alpha / (m - rank);
        const reject = !stopped && p < threshold;
        if (!reject) stopped = true;
        out[i] = { p, threshold, reject };
    });
    return out;
}

/**
 * Control C0 (pre-registration section 13), decided on the TRAINING images before any test scene is rendered. Per
 * seed, the geometric mean over the training images of relMSE(network) / relMSE(noisy input); C0 holds when every
 * seed's is at most C0_MAX_RATIO. `netRel` is [per seed: relMSE per training image], `noisyRel` per training image.
 */
export function trainFit(netRel, noisyRel) {
    if (!netRel.length || !netRel.every((s) => s.length === noisyRel.length && s.length > 0)) throw new Error("denoiseStats: C0 over mismatched sets");
    const ratios = netRel.map((s) => Math.exp(s.reduce((a, v, i) => a + Math.log(v / noisyRel[i]), 0) / s.length));
    return { ratios, ok: ratios.every((r) => r <= C0_MAX_RATIO) };
}

/**
 * Control C6 (pre-registration section 17), decided on the TRAINING images before any test scene is rendered: the
 * geometric mean over the training images of relMSE(accumulated history, re-modulated) / relMSE(noisy measured frame)
 * must be at most C6_MAX_RATIO. If seven frames of reprojected history do not beat one frame, the front-end both methods
 * share is broken and nothing measured after it means anything.
 */
export function historyFit(accumRel, noisyRel) {
    if (!accumRel.length || accumRel.length !== noisyRel.length) throw new Error("denoiseStats: C6 over mismatched sets");
    const ratio = Math.exp(accumRel.reduce((a, v, i) => a + Math.log(v / noisyRel[i]), 0) / accumRel.length);
    return { ratio, ok: ratio <= C6_MAX_RATIO };
}

/**
 * Control C1 as section 26 decides it: on the TRAINING images, before any test scene is rendered, as C0 is. The filter
 * and the network -- its per-image mean over seeds, as on a test set -- must each beat the noisy input on at least
 * C1_MIN_WINS in C1_OF of them (88 of 96). C1 is a sanity check on the pipeline both methods share; decided here it can
 * no longer spend a test set, and a test image where the filter loses to the noisy input is what it is -- an image.
 * `filterRel` and `noisyRel` per training image, `netRel` [per seed: per training image].
 */
export function trainSanity(filterRel, netRel, noisyRel) {
    const n = noisyRel.length;
    if (!n || filterRel.length !== n || !netRel.length || !netRel.every((s) => s.length === n)) throw new Error("denoiseStats: C1 over mismatched training sets");
    const net = seedMean(netRel), need = Math.ceil(C1_MIN_WINS * n / C1_OF);
    const netWins = net.filter((v, i) => v < noisyRel[i]).length, filterWins = filterRel.filter((v, i) => v < noisyRel[i]).length;
    return { n, need, netWins, filterWins, ok: netWins >= need && filterWins >= need };
}

/**
 * The verdict. `sets` maps a hypothesis name to its test set's measurements, all arrays over that set's images:
 *     { noisy: relMSE of the noisy input, filter: relMSE of the filter, net: [per seed: relMSE of the network],
 *       floor: relMSE between the two references }
 * `shuffled` is the shuffled-target network's per-seed relMSE on H1's set (control C2); `determinism` (C4) and
 * `seedsDistinct` (C5) are the booleans their checks produced; `c0`, when given, is trainFit()'s result, and `c6`
 * historyFit()'s. `c1Train`, when given, is trainSanity()'s: C1 is then decided on the training images (section 26),
 * and each test set's wins over the noisy input are reported, not tested. Returns { run, reasons, hypotheses, controls }.
 */
export function verdict({ sets, shuffled, determinism, seedsDistinct, c0 = null, c6 = null, c1Train = null, alpha = 0.05, inFamily = "H1" }) {
    const reasons = [], controls = {};
    // C6 (section 17), like C0, is decided before the test sets exist
    if (c6) {
        controls.C6 = c6;
        if (!c6.ok) return { run: "not reported", hypotheses: {}, controls,
            reasons: [`C6: the accumulated history brought the training images to ${c6.ratio.toFixed(3)} x the noisy error; it needs <= ${C6_MAX_RATIO}`] };
    }
    // C0 (section 13) is decided before the test sets exist: when it fires the run stops, and there is nothing to test
    if (c0) {
        controls.C0 = c0;
        if (!c0.ok) return { run: "not reported", hypotheses: {}, controls,
            reasons: [`C0: a network fit its training set to ${c0.ratios.map((r) => r.toFixed(3)).join(" / ")} x the noisy error; every seed needs <= ${C0_MAX_RATIO}`] };
    }
    // C1 as section 26 decides it, on the training images: when it fires the run stops, before the test sets exist
    if (c1Train) {
        controls.C1 = c1Train;
        if (!c1Train.ok) return { run: "not reported", hypotheses: {}, controls,
            reasons: [`C1 on the training images: the network beat the noisy input on ${c1Train.netWins} and the filter on ${c1Train.filterWins} of ${c1Train.n}; both need ${c1Train.need}`] };
    }
    controls.C4 = !!determinism; if (!controls.C4) reasons.push("C4: one seed twice did not give bit-identical weights");
    controls.C5 = !!seedsDistinct; if (!controls.C5) reasons.push("C5: an input and a reference shared a render seed");
    const names = Object.keys(sets);
    const H = {};
    for (const name of names) {
        const S = sets[name], net = seedMean(S.net), n = net.length;
        const netWins = net.filter((v, i) => v < S.noisy[i]).length, filterWins = S.filter.filter((v, i) => v < S.noisy[i]).length;
        const c1 = netWins >= C1_MIN_WINS && filterWins >= C1_MIN_WINS;
        const nearFloor = net.filter((v, i) => v <= C3_FLOOR_FACTOR * S.floor[i]).length;
        const d = effects(S.filter, net), k = d.filter((v) => v > 0).length;
        H[name] = { n, meanD: d.reduce((a, v) => a + v, 0) / n, k, p: signTestUpper(k, n), d,
                    // with C1 decided on the training images, a test set's wins over the noisy input are reported, never tested
                    c1: c1Train ? { netWins, filterWins, tested: false } : { netWins, filterWins, ok: c1 }, c3: { nearFloor, resolvable: nearFloor <= n / 2 } };
        if (!c1 && !c1Train) reasons.push(`C1 on ${name}: the network beat the noisy input on ${netWins} and the filter on ${filterWins} of ${n}; both need ${C1_MIN_WINS}`);
    }
    if (!c1Train) controls.C1 = names.every((nm) => H[nm].c1.ok);
    const c1ok = c1Train ? c1Train.ok : controls.C1;
    let c2 = true;
    if (shuffled) {
        const sh = seedMean(shuffled), dS = effects(sets[inFamily].filter, sh);
        const meanS = dS.reduce((a, v) => a + v, 0) / dS.length;
        c2 = meanS <= 0; controls.C2 = { meanD: meanS, ok: c2 };
        if (!c2) reasons.push(`C2: the shuffled-target network beat the filter on ${inFamily} (mean d ${meanS.toFixed(4)})`);
    } else { controls.C2 = { ok: false }; c2 = false; reasons.push("C2: the shuffled-target network was not run"); }
    const tests = holm(names.map((nm) => H[nm].p), alpha);
    names.forEach((nm, i) => {
        const h = H[nm];
        h.threshold = tests[i].threshold; h.reject = tests[i].reject;
        h.status = !h.c3.resolvable ? "not resolvable" : (h.meanD > 0 && h.reject ? "supported" : "not supported");
    });
    let run = "reported";
    if (!controls.C4 || !controls.C5 || !c1ok) run = "not reported";
    else if (!c2) run = "not resolvable";
    if (run !== "reported") for (const nm of names) H[nm].status = run;
    return { run, reasons, hypotheses: H, controls };
}
