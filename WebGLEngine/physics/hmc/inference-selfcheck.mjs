// WebGLEngine/physics/hmc/inference-selfcheck.mjs — v3282
//
// Run: node physics/hmc/inference-selfcheck.mjs   (~10s — MEASURED, dominated by the 40-repeat calibrations)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Two keys of different KINDS, on purpose. The conjugate posterior is ALGEBRA — HMC's recovered moments are
// held against a closed form that owes nothing to sampling. Calibration is FREQUENTIST — over 40 fresh seeded
// datasets the 90% interval must cover the known truth ~90% of the time, and that is the check an overconfident
// likelihood fails: its posteriors are tight, centered on plausible values, and their coverage collapses. A
// posterior can look perfect one dataset at a time and be wrong as a procedure; coverage is where that shows.

import { linearPosteriorExact, linearTarget, posteriorChain, momentsOf, calibrationRun } from "./inference.js";
import { makeRng } from "./hmc.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE EXACT KEY: conjugate linear-regression posterior ----------------------------------------------------
{
    const rng = makeRng(31);
    const ts = [], ys = [], aT = 0.7, bT = -1.2, sigma = 0.4, tau = 5;
    for (let i = 0; i < 25; i++) { const t = i * 0.2; ts.push(t); ys.push(aT + bT * t + sigma * rng.gauss()); }
    const exact = linearPosteriorExact(ts, ys, sigma, tau);
    const target = linearTarget(ts, ys, sigma, tau);
    const chain = posteriorChain(target, exact.mu.slice(), { n: 10000, burn: 800, eps: 0.012, L: 50, seed: 5 });
    const m = momentsOf(chain.samples);
    // tolerances scale with the posterior's own sd (sampling error over 8000 correlated draws)
    const sd0 = Math.sqrt(exact.Sigma[0][0]), sd1 = Math.sqrt(exact.Sigma[1][1]);
    ok("!! HMC recovers the CLOSED-FORM posterior mean (conjugacy is the answer key, not another chain)",
       Math.abs(m.mean[0] - exact.mu[0]) < 0.1 * sd0 * 4 && Math.abs(m.mean[1] - exact.mu[1]) < 0.1 * sd1 * 4,
       "mean [" + m.mean[0].toFixed(4) + ", " + m.mean[1].toFixed(4) + "] vs exact [" + exact.mu[0].toFixed(4) + ", " + exact.mu[1].toFixed(4) + "]");
    ok("!! ...and the closed-form posterior COVARIANCE (widths, not just centers)",
       Math.abs(m.cov[0][0] / exact.Sigma[0][0] - 1) < 0.15 && Math.abs(m.cov[1][1] / exact.Sigma[1][1] - 1) < 0.15 &&
       Math.abs(m.cov[0][1] / exact.Sigma[0][1] - 1) < 0.25,
       "var ratios " + (m.cov[0][0] / exact.Sigma[0][0]).toFixed(3) + ", " + (m.cov[1][1] / exact.Sigma[1][1]).toFixed(3) +
       "; cross " + (m.cov[0][1] / exact.Sigma[0][1]).toFixed(3) + " — an anti-correlated posterior (slope vs intercept), and the chain must reproduce that structure");
    ok("...acceptance stays high on the exact-gradient posterior", chain.acceptRate > 0.9, (chain.acceptRate * 100).toFixed(1) + "%");
}

// ---- 2. THE CALIBRATION KEY: 90% intervals cover the truth ~90% of the time -------------------------------------
// binomial n=40 p=0.9: mean 36, sd 1.9 — accept [31, 40] (about 2.6 sigma; a run below 31 is not luck).
let clean;
{
    clean = calibrationRun({ repeats: 40, seed: 100 });
    ok("!! over 40 fresh datasets the 90% credible interval covers the true omega ~90% of the time",
       clean.covered >= 31, clean.covered + "/40 covered (rate " + (clean.rate * 100).toFixed(0) + "%), mean interval width " + clean.meanWidth.toFixed(4));
}

// ---- 3. THE SABOTAGE: an overconfident likelihood is CAUGHT BY COVERAGE, not by looks ---------------------------
{
    const over = calibrationRun({ repeats: 40, seed: 100, sigmaLik: 0.5 / 3 });   // noise understated 3x
    ok("!! an overconfident likelihood (noise/3) produces TIGHTER intervals...",
       over.meanWidth < clean.meanWidth * 0.6, "width " + over.meanWidth.toFixed(4) + " vs clean " + clean.meanWidth.toFixed(4) + " — each posterior LOOKS better");
    ok("!! ...and its coverage COLLAPSES, which is the only place this failure is visible",
       over.covered < 31 && over.covered < clean.covered,
       over.covered + "/40 vs clean " + clean.covered + "/40 — one dataset at a time nothing is wrong; as a PROCEDURE it is broken, and the calibration key is what sees procedures");
}

// ---- 4. determinism ---------------------------------------------------------------------------------------------
{
    const a = calibrationRun({ repeats: 4, seed: 55 }), b = calibrationRun({ repeats: 4, seed: 55 });
    ok("seeded calibration runs are bit-identical (a failure reproduces)", a.covered === b.covered && a.meanWidth === b.meanWidth);
}

console.log(fails ? ("[inference-selfcheck] FAILED " + fails) : "[inference-selfcheck] all passed");
process.exit(fails ? 1 : 0);
