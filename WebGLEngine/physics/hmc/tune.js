// WebGLEngine/physics/hmc/tune.js — v3282
// ---------------------------------------------------------------------------------------------------------------
// THE BRAIN PROPOSES, THE LAB ADJUDICATES — the first honest handshake between a learning loop and the physics
// lab, kept small on purpose. A proposer searches HMC's (eps, L) for the config that maximizes EFFECTIVE SAMPLES
// PER GRADIENT EVALUATION, and every candidate it likes is ADJUDICATED by the exact-moments key before it can be
// adopted. The proposer here is a measured grid/bandit, not the RL brain — but the interface is the point:
// propose(config) -> score, with a falsifier the proposer cannot write. That is already the fleet's rule for
// phones (the peer stores a measurement, never a verdict), turned inward.
//
// WHY THE FALSIFIER IS LOAD-BEARING, measured in the gate: reward ACCEPTANCE alone and the search drives eps
// tiny — acceptance ~100%, trajectories going nowhere, ESS/grad orders of magnitude worse — a degenerate policy
// that its own reward calls perfect. Efficiency (ESS/grad) plus the moments key catches it; acceptance alone
// cannot, because acceptance is a diagnostic of the INTEGRATOR, not of mixing.
//
// ESS here is the standard initial-positive-sequence estimator on the chain's first coordinate: n / (1 + 2 sum
// of autocorrelations while consecutive pairs stay positive). Conservative and simple; stated, not hidden.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { makeRng, hmcStep } from "./hmc.js";

// effective sample size of a 1D series (initial positive sequence estimator).
function essOf(xs) {
    const n = xs.length;
    let mean = 0; for (const x of xs) mean += x; mean /= n;
    let c0 = 0; for (const x of xs) c0 += (x - mean) * (x - mean); c0 /= n;
    if (c0 <= 0) return 1;
    const rho = (k) => { let s = 0; for (let i = 0; i + k < n; i++) s += (xs[i] - mean) * (xs[i + k] - mean); return (s / n) / c0; };
    let sum = 0;
    for (let k = 1; k + 1 < n; k += 2) {
        const pair = rho(k) + rho(k + 1);
        if (pair <= 0) break;   // initial positive sequence: stop when a consecutive pair goes non-positive
        sum += pair;
    }
    return Math.max(1, n / (1 + 2 * sum));
}

// run a short chain at (eps, L) and score it. Returns everything the adjudicator needs, never a verdict.
function scoreConfig(target, { eps, L, n = 600, seed = 3 } = {}) {
    const rng = makeRng(seed);
    let q = target.mu.slice(); const xs = [];
    let accepted = 0;
    for (let i = 0; i < n; i++) { const r = hmcStep(target, q, rng, { eps, L }); q = r.q; if (r.accepted) accepted++; xs.push(q[0]); }
    const ess = essOf(xs);
    return { eps, L, ess, gradEvals: n * L, essPerGrad: ess / (n * L), acceptRate: accepted / n, xs };
}

// the proposer: measured search over a grid, maximizing rewardFn. Default reward is essPerGrad (efficiency);
// the gate also runs it with the DEGENERATE acceptance-only reward to measure why the falsifier matters.
function tuneHMC(target, { epsGrid = [0.02, 0.05, 0.1, 0.18, 0.3, 0.5], LGrid = [4, 8, 16, 32],
                           n = 600, seed = 3, rewardFn = (s) => s.essPerGrad } = {}) {
    let best = null; const trials = [];
    for (const eps of epsGrid) for (const L of LGrid) {
        const s = scoreConfig(target, { eps, L, n, seed });
        trials.push(s);
        if (!best || rewardFn(s) > rewardFn(best)) best = s;
    }
    return { best, trials };
}

// THE ADJUDICATOR: a tuned config is only adoptable if a fresh chain at that config still recovers the exact
// moments. The proposer never writes this verdict; the fixture's closed form does.
function adjudicate(target, cfg, { n = 12000, seed = 21, tolMean = 0.08, tolCov = 0.12 } = {}) {
    const rng = makeRng(seed);
    let q = target.mu.slice();
    const mean = [0, 0], sam = [];
    for (let i = 0; i < n; i++) { const r = hmcStep(target, q, rng, { eps: cfg.eps, L: cfg.L }); q = r.q; sam.push(q.slice()); }
    for (const s of sam) { mean[0] += s[0]; mean[1] += s[1]; } mean[0] /= n; mean[1] /= n;
    let c00 = 0, c01 = 0, c11 = 0;
    for (const s of sam) { const a = s[0] - mean[0], b = s[1] - mean[1]; c00 += a * a; c01 += a * b; c11 += b * b; }
    c00 /= n - 1; c01 /= n - 1; c11 /= n - 1;
    const S = target.S;
    const okMean = Math.abs(mean[0] - target.mu[0]) < tolMean && Math.abs(mean[1] - target.mu[1]) < tolMean;
    const okCov = Math.abs(c00 - S[0][0]) < tolCov && Math.abs(c11 - S[1][1]) < tolCov && Math.abs(c01 - S[0][1]) < tolCov;
    return { pass: okMean && okCov, mean, cov: [[c00, c01], [c01, c11]] };
}

export { essOf, scoreConfig, tuneHMC, adjudicate };
if (typeof module !== "undefined" && module.exports) module.exports = { essOf, scoreConfig, tuneHMC, adjudicate };
