// WebGLEngine/physics/hmc/hmc.js — v3281
// ---------------------------------------------------------------------------------------------------------------
// Hamiltonian Monte Carlo: MCMC where the proposal is PHYSICS. Give each parameter a momentum, treat the negative
// log-density as a potential U(q), and roll a leapfrog trajectory through (q, p) phase space; where the ball lands
// is the proposal, accepted with min(1, exp(-dH)). A random walk shuffles; this ROLLS along the contours.
//
// Why it belongs in this lab: the sampler carries its own answer key. A symplectic integrator nearly conserves H,
// so acceptance sits near 1 when the integrator is right and collapses when it is wrong — the residual is VISIBLE,
// not asserted, the same way the gyroscope's convergence order is. And its correctness rests on three properties
// that are each a measurable gate rather than an opinion:
//   ENERGY:        |H(t) - H(0)| stays bounded along a trajectory and shrinks as O(eps^2) — halve eps, quarter it.
//   REVERSIBILITY: run forward, flip the momentum, run again — you must land back on the start to round-off.
//   VOLUME:        one leapfrog step has Jacobian determinant EXACTLY 1 (a composition of shears), measurable
//                  numerically as a 4x4 determinant with no symplectic theory anywhere in the check.
//
// THE TRAP, STATED PRECISELY (and measured in the gate, both directions): a WRONG GRADIENT with an EXACT accept
// step is still a CORRECT sampler — leapfrog is reversible and volume-preserving no matter what field it
// integrates, so detailed balance holds and you only pay in acceptance. The dangerous mirror image is a WRONG
// POTENTIAL IN THE ACCEPT STEP or a NON-SYMPLECTIC integrator: acceptance stays plausible while the stationary
// distribution is quietly not the one you asked for. Correct-but-slow is recoverable; wrong-but-confident is the
// failure this lab exists to catch. The named-wrong variants below are EXPORTED FOR MEASUREMENT, not for use.
//
// The fixture is a 2D correlated Gaussian with mean mu and covariance S, because every quantity the chain should
// recover is EXACT: E[q] = mu, Cov[q] = S, and grad U = S^{-1}(q - mu) in closed form. No stored tables, no
// finite differences. Deterministic: the RNG is seeded, so a failure reproduces.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

// ---- deterministic RNG (LCG + Box-Muller) so every run is replayable --------------------------------------------
function makeRng(seed = 12345) {
    let s = seed >>> 0;
    const u = () => { s = (s * 1664525 + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
    let spare = null;
    const gauss = () => {
        if (spare != null) { const g = spare; spare = null; return g; }
        const a = Math.sqrt(-2 * Math.log(u())), b = 2 * Math.PI * u();
        spare = a * Math.sin(b);
        return a * Math.cos(b);
    };
    return { u, gauss };
}

// ---- the fixture: 2D correlated Gaussian with EXACT gradient ----------------------------------------------------
// S = [[s11, s12], [s12, s22]]; U(q) = 0.5 (q-mu)^T S^{-1} (q-mu) (normalising constants dropped — they cancel in dH).
function gaussian2D(mu = [1, -1], S = [[1, 0.8], [0.8, 1]]) {
    const det = S[0][0] * S[1][1] - S[0][1] * S[0][1];
    if (det <= 0) throw new Error("covariance must be positive definite");
    const inv = [[S[1][1] / det, -S[0][1] / det], [-S[0][1] / det, S[0][0] / det]];
    const U = (q) => { const dx = q[0] - mu[0], dy = q[1] - mu[1];
        return 0.5 * (dx * (inv[0][0] * dx + inv[0][1] * dy) + dy * (inv[1][0] * dx + inv[1][1] * dy)); };
    const gradU = (q) => { const dx = q[0] - mu[0], dy = q[1] - mu[1];
        return [inv[0][0] * dx + inv[0][1] * dy, inv[1][0] * dx + inv[1][1] * dy]; };
    return { mu: mu.slice(), S: [S[0].slice(), S[1].slice()], inv, U, gradU, dim: 2 };
}

// ---- Hamiltonian: H(q,p) = U(q) + K(p), unit mass so K = |p|^2 / 2 ----------------------------------------------
function hamiltonian(target, q, p) { let k = 0; for (const x of p) k += x * x; return target.U(q) + k / 2; }

// ---- leapfrog: kick-drift-kick. SYMPLECTIC (a composition of shears) and time-reversible by construction. ------
// gradFn is a parameter so the gate can hand it a WRONG field and measure that correctness survives (see header).
function leapfrog(q0, p0, eps, L, gradFn) {
    const q = q0.slice(), p = p0.slice();
    let g = gradFn(q);
    for (let i = 0; i < L; i++) {
        for (let k = 0; k < q.length; k++) p[k] -= 0.5 * eps * g[k];   // half kick
        for (let k = 0; k < q.length; k++) q[k] += eps * p[k];         // full drift
        g = gradFn(q);
        for (let k = 0; k < q.length; k++) p[k] -= 0.5 * eps * g[k];   // half kick
    }
    return { q, p };
}

// track |H - H0| along a trajectory (the ENERGY gate reads its max)
function energyDrift(target, q0, p0, eps, L, gradFn) {
    const q = q0.slice(), p = p0.slice();
    const H0 = hamiltonian(target, q, p);
    let worst = 0, g = gradFn(q);
    for (let i = 0; i < L; i++) {
        for (let k = 0; k < q.length; k++) p[k] -= 0.5 * eps * g[k];
        for (let k = 0; k < q.length; k++) q[k] += eps * p[k];
        g = gradFn(q);
        for (let k = 0; k < q.length; k++) p[k] -= 0.5 * eps * g[k];
        const d = Math.abs(hamiltonian(target, q, p) - H0);
        if (d > worst) worst = d;
    }
    return worst;
}

// ---- NAMED-WRONG integrator: explicit Euler. NOT volume-preserving, NOT reversible — DO NOT SAMPLE WITH THIS. --
// Exported so the gate can MEASURE that the same accept rule over a non-symplectic map biases the chain while the
// acceptance stays plausible; that is the convincing-nothing case, demonstrated rather than described.
function eulerStepWRONG(q0, p0, eps, L, gradFn) {
    const q = q0.slice(), p = p0.slice();
    for (let i = 0; i < L; i++) {
        const g = gradFn(q);
        for (let k = 0; k < q.length; k++) { q[k] += eps * p[k]; p[k] -= eps * g[k]; }
    }
    return { q, p };
}

// ---- one HMC transition ----------------------------------------------------------------------------------------
// opts.gradFn overrides the field the trajectory rolls on (default: the target's exact gradient).
// opts.acceptU overrides the potential used in the ACCEPT step (default: the target's true U). Overriding THIS is
// the dangerous sabotage — it changes which distribution the chain converges to.
// opts.integrator swaps leapfrog out (the gate hands it eulerStepWRONG).
function hmcStep(target, q0, rng, opts = {}) {
    const eps = opts.eps == null ? 0.18 : opts.eps;
    const L = opts.L == null ? 24 : opts.L;
    const gradFn = opts.gradFn || target.gradU;
    const integ = opts.integrator || leapfrog;
    const Ufn = opts.acceptU || target.U;
    const Hof = (q, p) => { let k = 0; for (const x of p) k += x * x; return Ufn(q) + k / 2; };
    const p0 = q0.map(() => rng.gauss());
    const H0 = Hof(q0, p0);
    const { q, p } = integ(q0, p0, eps, L, gradFn);
    const H1 = Hof(q, p);
    const dH = H1 - H0;
    const accept = Math.log(rng.u()) < -dH;   // min(1, exp(-dH)) in log space
    return { q: accept ? q : q0.slice(), accepted: accept, dH };
}

// ---- run a chain and report the diagnostics the gates read ------------------------------------------------------
function sampleChain(target, n, opts = {}) {
    const rng = makeRng(opts.seed == null ? 20260801 : opts.seed);
    let q = (opts.q0 || target.mu).slice();
    const burn = opts.burn == null ? Math.min(500, n >> 2) : opts.burn;
    const kept = [];
    let accepted = 0, sumAbsDH = 0, steps = 0;
    for (let i = 0; i < n + burn; i++) {
        const r = hmcStep(target, q, rng, opts);
        q = r.q; steps++;
        if (r.accepted) accepted++;
        sumAbsDH += Math.abs(r.dH);
        if (i >= burn) kept.push(q.slice());
    }
    // moments of the kept chain
    const d = target.dim, mean = new Array(d).fill(0);
    for (const s of kept) for (let k = 0; k < d; k++) mean[k] += s[k];
    for (let k = 0; k < d; k++) mean[k] /= kept.length;
    const cov = [[0, 0], [0, 0]];
    for (const s of kept) { const a = s[0] - mean[0], b = s[1] - mean[1]; cov[0][0] += a * a; cov[0][1] += a * b; cov[1][1] += b * b; }
    cov[0][0] /= kept.length - 1; cov[0][1] /= kept.length - 1; cov[1][0] = cov[0][1]; cov[1][1] /= kept.length - 1;
    return { samples: kept, mean, cov, acceptRate: accepted / steps, meanAbsDH: sumAbsDH / steps };
}

// reversibility residual: forward L steps, flip p, forward L again, flip p — distance back to the start.
function reversibilityResidual(q0, p0, eps, L, gradFn, integ = leapfrog) {
    const fwd = integ(q0, p0, eps, L, gradFn);
    const back = integ(fwd.q, fwd.p.map((x) => -x), eps, L, gradFn);
    const qb = back.q, pb = back.p.map((x) => -x);
    let r = 0;
    for (let k = 0; k < q0.length; k++) { r = Math.max(r, Math.abs(qb[k] - q0[k]), Math.abs(pb[k] - p0[k])); }
    return r;
}

// numerical Jacobian determinant of ONE integrator step over (q,p) in 2D — a 4x4 determinant by central
// differences, with no symplectic theory anywhere in the check. Leapfrog must return 1 to high accuracy; Euler
// must NOT — that is the volume gate's teeth, and the reason it is not a control that cannot fail.
function stepJacobianDet(integ, q0, p0, eps, gradFn, h = 1e-6) {
    const f = (v) => { const r = integ([v[0], v[1]], [v[2], v[3]], eps, 1, gradFn); return [r.q[0], r.q[1], r.p[0], r.p[1]]; };
    const x0 = [q0[0], q0[1], p0[0], p0[1]];
    const cols = [];
    for (let j = 0; j < 4; j++) {
        const xp = x0.slice(); xp[j] += h;
        const xm = x0.slice(); xm[j] -= h;
        const fp = f(xp), fm = f(xm);
        cols.push(fp.map((v, i) => (v - fm[i]) / (2 * h)));   // cols[j][i] = df_i / dx_j
    }
    const M = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => cols[j][i]));
    const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const minor = (m, r, c) => m.filter((_, i) => i !== r).map((row) => row.filter((_, j) => j !== c));
    let det = 0;
    for (let c = 0; c < 4; c++) det += (c % 2 ? -1 : 1) * M[0][c] * det3(minor(M, 0, c));
    return det;
}

export { makeRng, gaussian2D, hamiltonian, leapfrog, energyDrift, eulerStepWRONG, hmcStep, sampleChain, reversibilityResidual, stepJacobianDet };
if (typeof module !== "undefined" && module.exports) module.exports = { makeRng, gaussian2D, hamiltonian, leapfrog, energyDrift, eulerStepWRONG, hmcStep, sampleChain, reversibilityResidual, stepJacobianDet };
