// WebGLEngine/physics/astroparticle/jeans-selfcheck.mjs — v3429
//
// Run: node physics/astroparticle/jeans-selfcheck.mjs   (~60s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// A THRESHOLD WITH A REGIME WHERE THE INTERESTING THING PROVABLY CANNOT HAPPEN -- deliberately the same shape as
// the Turing round, so the tree has two instances of it rather than one.
//
//     omega^2 = c_s^2 k^2 - 4 pi G rho0
//
// Short wavelengths ring as sound waves, long ones collapse into stars, and at k_J = sqrt(4 pi G rho0)/c_s the
// frequency is EXACTLY zero. *** AND WITHOUT GRAVITY NO WAVELENGTH IS EVER UNSTABLE: *** set G = 0 and omega^2 =
// c_s^2 k^2 > 0 for every k. Not "usually stable" -- stable identically, which is a stronger statement than any
// numerical comparison and is the same kind of theorem the Turing round used for its sabotage.
//
// THE GRAVITY IS SOLVED ON THE GRID. A spectral Poisson solve would hand back -4 pi G rho0 delta_k / k^2 and the
// measured growth rate would be the dispersion relation restated -- the solver marking its own homework, which
// is the trap the waveguide round named. So the potential comes from a real-space second-difference solve, and
// the prediction uses the DISCRETE Laplacian eigenvalue rather than k^2, the same correction the Brusselator
// round needed for the same reason.

import { omegaSquared, jeansK, jeansLength, jeansMass, growthRate, discreteK,
         poisson, makeField, step, modeAmplitude, measureGrowth, measureOscillation } from "./jeans.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const P = { cs: 1, rho0: 1 };
const S = { n: 64, L: 8, cs: 1, rho0: 1, dt: 2e-3, tEnd: 2.5, poissonIters: 4000 };

// ---- 1. THE THRESHOLD IS EXACT, AND THE FREQUENCY THERE IS EXACTLY ZERO --------------------------------------------
{
    const kJ = jeansK(P);
    ok("!! omega is EXACTLY zero at the Jeans wavenumber -- marginal stability, neither growing nor ringing",
       Math.abs(omegaSquared(kJ, P)) < 1e-12,
       "k_J = " + kJ.toFixed(6) + " gives omega^2 = " + omegaSquared(kJ, P).toExponential(1) +
       ", and the Jeans length is " + jeansLength(P).toFixed(6));
    ok("...and the two sides of it are genuinely different regimes, not degrees of the same one",
       omegaSquared(kJ * 0.9, P) < 0 && omegaSquared(kJ * 1.1, P) > 0,
       "10% below k_J gives omega^2 = " + omegaSquared(kJ * 0.9, P).toFixed(4) + " (growth), 10% above gives " +
       omegaSquared(kJ * 1.1, P).toFixed(4) + " (oscillation)");
}

// ---- 2. UNSTABLE MODES GROW AT THE PREDICTED RATE ---------------------------------------------------------------------
{
    const rows = [1, 2, 3].map((mode) => {
        const r = measureGrowth({ ...S, mode });
        return { mode, ...r, rel: Math.abs(r.rate - r.predicted) / r.predicted };
    });
    const worst = Math.max(...rows.map((r) => r.rel));
    ok("!! the measured growth rate matches the dispersion relation for every unstable mode",
       worst < 0.03,
       rows.map((r) => "m" + r.mode + ": " + r.rate.toFixed(4) + " vs " + r.predicted.toFixed(4)).join(", ") +
       " — worst " + (worst * 100).toFixed(1) + "%, from a grid that solves Poisson in REAL SPACE and so does not " +
       "have the answer built into it");
    const near = measureGrowth({ ...S, mode: 4 });
    ok("...and the mode nearest the threshold is the least accurate, which is what should happen",
       Math.abs(near.rate - near.predicted) / near.predicted > worst,
       "mode 4 sits closest to k_J, grows slowest (" + near.predicted.toFixed(4) + ") and fits worst (" +
       (Math.abs(near.rate - near.predicted) / near.predicted * 100).toFixed(1) + "%) — a slow exponential over a " +
       "fixed window has the least signal, and a device where the marginal case fitted BEST would be suspicious");
}

// ---- 3. STABLE MODES OSCILLATE RATHER THAN GROWING ----------------------------------------------------------------------
{
    const rows = [6, 8].map((mode) => measureOscillation({ n: 64, L: 8, cs: 1, rho0: 1, mode, dt: 5e-4, tEnd: 8, poissonIters: 2000 }));
    ok("!! above the threshold the gas RINGS instead of collapsing, at roughly the predicted frequency",
       rows.every((r) => r.omega !== null && Math.abs(r.omega - r.predicted) / r.predicted < 0.10),
       rows.map((r) => r.omega.toFixed(4) + " vs " + r.predicted.toFixed(4)).join(", ") +
       " — measured by counting zero crossings, which is a coarse instrument, so 10% is the honest tolerance here " +
       "and it is looser than the growth branch on purpose");
    ok("...and it does not grow at all: the amplitude comes back",
       rows.every((r) => r.crossings >= 2),
       "several full oscillations within the window, where an unstable mode would run away");
}

// ---- 4. *** THE THEOREM: WITHOUT GRAVITY, NOTHING IS EVER UNSTABLE. *** -------------------------------------------------
{
    const ks = [0.01, 0.1, 0.785, 3.14, 100];
    ok("!! with G = 0 every wavelength has omega^2 > 0 -- not usually stable, stable IDENTICALLY",
       ks.every((k) => omegaSquared(k, { ...P, G: 0 }) > 0),
       ks.map((k) => omegaSquared(k, { ...P, G: 0 }).toFixed(3)).join(", ") +
       " — pressure alone cannot make a lump collapse, whatever its size, and no amount of waiting changes that");
    ok("...and the same modes ARE unstable once gravity is switched on, so the theorem is doing work",
       [0.785, 1.571].every((k) => omegaSquared(k, P) < 0),
       "the identical wavenumbers give " + [0.785, 1.571].map((k) => omegaSquared(k, P).toFixed(3)).join(", ") +
       " with G = 1 — the sabotage removes exactly one term and the whole phenomenon with it");
}

// ---- 5. *** AN UNDER-CONVERGED GRAVITY SOLVE REPORTS COLLAPSE THAT IS TOO SLOW. *** ------------------------------------
// Jacobi converges slowest for the LONGEST wavelength, which is also the fastest-growing mode. At 600 iterations
// mode 1 measures 3.343 against a predicted 3.457; at 4000 it is 3.445 and has plateaued. The failure looks
// exactly like "gravity is a little weaker than theory says" -- a plausible physical claim rather than an
// obvious bug, which is why the iteration count is pinned rather than left to taste.
{
    const lo = measureGrowth({ ...S, mode: 1, poissonIters: 600 });
    const hi = measureGrowth({ ...S, mode: 1, poissonIters: 4000 });
    ok("!! too few Poisson iterations make the collapse look SLOWER than it is",
       lo.rate < hi.rate && (hi.rate - lo.rate) / hi.rate > 0.02,
       "600 iterations give " + lo.rate.toFixed(5) + " against " + hi.rate.toFixed(5) + " at 4000 — " +
       "an error of " + ((hi.rate - lo.rate) / hi.rate * 100).toFixed(1) + "% pointing in the direction of " +
       "'gravity is weaker than predicted', which is a physical-sounding wrong answer rather than an obvious fault");
    ok("...and it has converged by the count this device uses",
       Math.abs(measureGrowth({ ...S, mode: 1, poissonIters: 10000 }).rate - hi.rate) / hi.rate < 2e-3,
       "10000 iterations move it by less than 0.2% from 4000, so the pinned count sits on the plateau rather than on the slope");
}

// ---- 6. THE PREDICTION USES THE GRID'S LAPLACIAN, NOT THE CONTINUUM ONE ---------------------------------------------------
{
    const k = 2 * Math.PI * 3 / 8, dx = 8 / 64;
    const kd = discreteK(k, dx);
    ok("!! the discrete Laplacian eigenvalue is (2/dx^2)(1-cos(k dx)), and the prediction uses it",
       kd < k && (k - kd) / k > 1e-5,
       "discrete k = " + kd.toFixed(6) + " against continuum " + k.toFixed(6) + " — comparing a grid to a continuum " +
       "formula compares two different operators, which the Brusselator round found the hard way");
    // and the Poisson solver itself: a uniform overdensity must produce no force
    const F = makeField({ n: 32, L: 8, mode: 0, amp: 0 });
    for (let i = 0; i < F.n; i++) F.delta[i] = 0.5;
    const phi = poisson(F.delta, F.dx, { rho0: 1, iters: 500 });
    ok("!! a UNIFORM overdensity produces no potential gradient (the periodic null space, projected out explicitly)",
       Math.max(...phi.map(Math.abs)) < 1e-9,
       "max |phi| = " + Math.max(...phi.map(Math.abs)).toExponential(1) + " — a constant density exerts no force, " +
       "the periodic solve is singular in that direction, and the mean is removed rather than left for the iteration to wander in");
}

console.log(fails ? ("[jeans-selfcheck] FAILED " + fails) : "[jeans-selfcheck] all passed");
process.exit(fails ? 1 : 0);
