// WebGLEngine/physics/hmc/hmc-selfcheck.mjs — v3281
//
// Run: node physics/hmc/hmc-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// HMC's correctness rests on properties that are each measurable, and the trap has TWO directions which this gate
// measures separately because they fail differently:
//   - a WRONG GRADIENT with an exact accept step is still CORRECT (detailed balance survives; acceptance pays) —
//     asserted by recovering the true moments anyway, at a measured lower acceptance.
//   - a WRONG POTENTIAL IN THE ACCEPT STEP, or a NON-SYMPLECTIC integrator, keeps plausible acceptance while the
//     stationary distribution silently changes — the convincing-nothing case, caught by the moments key and (for
//     Euler) by the volume gate directly.
// The fixture is exact (2D correlated Gaussian), so every reference below is closed-form, never a stored table.

import { makeRng, gaussian2D, hamiltonian, leapfrog, energyDrift, eulerStepWRONG, sampleChain, reversibilityResidual, stepJacobianDet } from "./hmc.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const target = gaussian2D([1, -1], [[1, 0.8], [0.8, 1]]);
const q0 = [2.2, 0.4], p0 = [0.7, -1.1];

// ---- 1. ENERGY: bounded along the trajectory, and second order — halve eps, the drift drops ~4x ------------------
{
    const L = 64;
    const d1 = energyDrift(target, q0, p0, 0.10, L, target.gradU);
    const d2 = energyDrift(target, q0, p0, 0.05, L * 2, target.gradU);   // same trajectory length, half the step
    const d3 = energyDrift(target, q0, p0, 0.025, L * 4, target.gradU);
    const r12 = d1 / d2, r23 = d2 / d3;
    ok("!! energy drift is small and BOUNDED along a long trajectory", d1 < 0.02, "max |dH| = " + d1.toExponential(2) + " at eps=0.10 over " + L + " steps");
    ok("!! drift converges at SECOND order (halve eps -> ~quarter the drift, twice)", r12 > 3.0 && r12 < 5.0 && r23 > 3.0 && r23 < 5.0,
       "ratios " + r12.toFixed(2) + ", " + r23.toFixed(2) + " (a first-order integrator would give ~2, and O(eps^2) is the symplectic claim made measurable)");
}

// ---- 2. REVERSIBILITY: forward, flip momentum, forward again — back to the start at round-off --------------------
{
    const r = reversibilityResidual(q0, p0, 0.15, 48, target.gradU);
    ok("!! leapfrog is time-reversible to round-off", r < 1e-11, "return residual " + r.toExponential(2) + " after 48 steps out and 48 back");
    const rE = reversibilityResidual(q0, p0, 0.15, 48, target.gradU, eulerStepWRONG);
    ok("Euler is NOT reversible (the check has teeth)", rE > 1e-3, "Euler return residual " + rE.toExponential(2));
}

// ---- 3. VOLUME: one leapfrog step has numerical Jacobian det = 1; Euler does not ---------------------------------
{
    const dL = stepJacobianDet(leapfrog, q0, p0, 0.2, target.gradU);
    const dE = stepJacobianDet(eulerStepWRONG, q0, p0, 0.2, target.gradU);
    ok("!! leapfrog preserves phase-space volume (numerical 4x4 Jacobian det = 1)", Math.abs(dL - 1) < 1e-5, "det = " + dL.toFixed(8));
    ok("Euler does NOT preserve volume (same measurement, different verdict)", Math.abs(dE - 1) > 1e-3, "det = " + dE.toFixed(6) + " — this is why exp(-dH) acceptance over Euler samples the wrong law");
}

// ---- 4. THE SAMPLER RECOVERS THE EXACT MOMENTS -------------------------------------------------------------------
// n=24000 kept samples; HMC on a Gaussian mixes fast, so 3-sigma bands on the mean are ~3/sqrt(n_eff) — the 0.06 /
// 0.10 tolerances below are generous against the truth yet tight enough that both sabotages fail them (measured).
const N = 24000;
let clean;
{
    clean = sampleChain(target, N, { seed: 7, eps: 0.18, L: 24 });
    const m = clean.mean, c = clean.cov;
    ok("!! chain recovers the exact mean [1, -1]", Math.abs(m[0] - 1) < 0.06 && Math.abs(m[1] + 1) < 0.06,
       "mean = [" + m[0].toFixed(3) + ", " + m[1].toFixed(3) + "]");
    ok("!! chain recovers the exact covariance [[1,.8],[.8,1]]",
       Math.abs(c[0][0] - 1) < 0.10 && Math.abs(c[1][1] - 1) < 0.10 && Math.abs(c[0][1] - 0.8) < 0.10,
       "cov = [[" + c[0][0].toFixed(3) + "," + c[0][1].toFixed(3) + "],[.," + c[1][1].toFixed(3) + "]]");
    ok("!! acceptance is HIGH because H is nearly conserved — the sampler self-diagnoses its integrator",
       clean.acceptRate > 0.95, "accept " + (clean.acceptRate * 100).toFixed(1) + "%, mean |dH| " + clean.meanAbsDH.toExponential(2));
}

// ---- 5. TRAP DIRECTION ONE (the safe one, measured): wrong gradient + TRUE accept = still correct ---------------
{
    // roll on an ISOTROPIC field (wrong for a 0.8-correlated target) but accept with the true U
    const iso = gaussian2D([1, -1], [[1, 0], [0, 1]]);
    const r = sampleChain(target, N, { seed: 7, eps: 0.18, L: 24, gradFn: iso.gradU });
    const c = r.cov;
    ok("wrong GRADIENT with exact accept still recovers the true covariance (detailed balance survives)",
       Math.abs(c[0][0] - 1) < 0.12 && Math.abs(c[0][1] - 0.8) < 0.12,
       "cov[0][1] = " + c[0][1].toFixed(3) + " (truth 0.8)");
    ok("...but it PAYS in acceptance — correct-but-slow, which is the recoverable failure",
       r.acceptRate < clean.acceptRate - 0.02, "accept " + (r.acceptRate * 100).toFixed(1) + "% vs clean " + (clean.acceptRate * 100).toFixed(1) + "%");
}

// ---- 6. TRAP DIRECTION TWO (the dangerous one, measured): wrong U in the ACCEPT step ----------------------------
{
    // accept against an isotropic potential while believing we sample the correlated target: acceptance stays
    // HIGH and the recovered covariance is the WRONG law's — high confidence, wrong answer. The moments key is
    // the only thing standing between this chain and being believed.
    const iso = gaussian2D([1, -1], [[1, 0], [0, 1]]);
    const r = sampleChain(target, N, { seed: 7, eps: 0.18, L: 24, gradFn: iso.gradU, acceptU: iso.U });
    ok("wrong U in the ACCEPT step keeps PLAUSIBLE acceptance (this is what makes it dangerous)", r.acceptRate > 0.9,
       "accept " + (r.acceptRate * 100).toFixed(1) + "%");
    ok("...and the moments key CATCHES it — recovered correlation is the wrong law's, far from 0.8",
       Math.abs(r.cov[0][1] - 0.8) > 0.4, "cov[0][1] = " + r.cov[0][1].toFixed(3) + " (truth 0.8; the chain converged to the accept-U's law)");
}

// ---- 7. SABOTAGE: Euler under the same accept rule biases the chain ---------------------------------------------
{
    const r = sampleChain(target, N, { seed: 7, eps: 0.18, L: 24, integrator: eulerStepWRONG });
    const biased = Math.abs(r.cov[0][0] - 1) > 0.10 || Math.abs(r.cov[1][1] - 1) > 0.10 || Math.abs(r.cov[0][1] - 0.8) > 0.10 ||
                   Math.abs(r.mean[0] - 1) > 0.06 || Math.abs(r.mean[1] + 1) > 0.06 || r.acceptRate < 0.5;
    ok("a NON-SYMPLECTIC integrator under the same accept rule fails the keys (moments and/or acceptance)", biased,
       "accept " + (r.acceptRate * 100).toFixed(1) + "%, var = [" + r.cov[0][0].toFixed(3) + ", " + r.cov[1][1].toFixed(3) + "], corr term " + r.cov[0][1].toFixed(3));
}

// ---- 8. determinism: the same seed replays the same chain --------------------------------------------------------
{
    const a = sampleChain(target, 500, { seed: 42 });
    const b = sampleChain(target, 500, { seed: 42 });
    const same = a.samples.length === b.samples.length && a.samples.every((s, i) => s[0] === b.samples[i][0] && s[1] === b.samples[i][1]);
    ok("seeded chains are bit-identical (a failure reproduces)", same);
}

console.log(fails ? ("[hmc-selfcheck] FAILED " + fails) : "[hmc-selfcheck] all passed");
process.exit(fails ? 1 : 0);
