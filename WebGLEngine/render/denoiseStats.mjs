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
export const C3_FLOOR_FACTOR = 2; // a method within this factor of the reference floor cannot be ranked there

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
 * The verdict. `sets` maps a hypothesis name to its test set's measurements, all arrays over that set's images:
 *     { noisy: relMSE of the noisy input, filter: relMSE of the filter, net: [per seed: relMSE of the network],
 *       floor: relMSE between the two references }
 * `shuffled` is the shuffled-target network's per-seed relMSE on H1's set (control C2); `determinism` (C4) and
 * `seedsDistinct` (C5) are the booleans their checks produced. Returns { run, reasons, hypotheses, controls }.
 */
export function verdict({ sets, shuffled, determinism, seedsDistinct, alpha = 0.05, inFamily = "H1" }) {
    const reasons = [], controls = {};
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
                    c1: { netWins, filterWins, ok: c1 }, c3: { nearFloor, resolvable: nearFloor <= n / 2 } };
        if (!c1) reasons.push(`C1 on ${name}: the network beat the noisy input on ${netWins} and the filter on ${filterWins} of ${n}; both need ${C1_MIN_WINS}`);
    }
    controls.C1 = names.every((nm) => H[nm].c1.ok);
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
    if (!controls.C4 || !controls.C5 || !controls.C1) run = "not reported";
    else if (!c2) run = "not resolvable";
    if (run !== "reported") for (const nm of names) H[nm].status = run;
    return { run, reasons, hypotheses: H, controls };
}
