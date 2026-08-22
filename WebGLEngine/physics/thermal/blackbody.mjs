// physics/thermal/blackbody.mjs -- v3811
//
// BLACKBODY RADIATION, AND EVERY KEY IS A MATHEMATICAL CONSTANT OR A DEFINED SI VALUE RATHER THAN A NUMBER
// TYPED HERE. (This is Stefan-BOLTZMANN radiation. physics/thermal/stefan.mjs is the Stefan PROBLEM -- a moving
// melt boundary -- and shares nothing with this file but a surname.)
//
// *** THE KEYS, AND NOT ONE IS A REFERENCE VALUE I INVENTED:
//   1. THE WIEN PEAKS ARE ROOTS OF TRANSCENDENTALS. The Planck spectrum peaks where n*(1 - e^-x) = x: n = 5 in
//      WAVELENGTH (x = 4.9651...) and n = 3 in FREQUENCY (x = 2.8214...). Those are facts about x^5/(e^x-1) and
//      x^3/(e^x-1), found by a root-finder AND by an independent maximiser, two routes sharing no code.
//   2. THE MASTER IDENTITY: INT_0^inf x^(s-1)/(e^x - 1) dx = Gamma(s) * zeta(s). The total-energy integral is
//      s = 4 -> Gamma(4) zeta(4) = 6 * (pi^4/90) = pi^4/15, and the photon-NUMBER integral is s = 3 ->
//      Gamma(3) zeta(3) = 2 zeta(3). This file computes the left side by QUADRATURE and grades it against the
//      right side reached through physics/zeta.js's zeta and the v3810 module's gammaFn -- THREE MODULES MEETING
//      on a number none of them alone computes.
//   3. THE SI CONSTANTS ARE DEFINED, SO sigma AND WIEN'S b ARE EXACT: sigma = 2 pi^5 k^4 / (15 h^3 c^2) and
//      b = h c / (x_lambda k), computed here from the 2019-exact h, k, c and matched against CODATA.
//
// *** THE LOAD-BEARING NEGATIVE IS THE ONE EVERYONE GETS WRONG: THE WAVELENGTH PEAK AND THE FREQUENCY PEAK ARE
// NOT THE SAME PHOTON. x_lambda = 4.965 and x_nu = 2.821, so lambda_peak * nu_peak / c = x_nu / x_lambda =
// 0.568, NOT 1. Converting one peak to the other with lambda*nu = c is a real error the gate plants and catches
// -- the peak of a distribution depends on whether you bin in d(lambda) or d(nu), and the Jacobian reshapes it.
//
// BROWSER-SAFE: no node builtins, no DOM. Deterministic and pure.

import { zeta } from "../zeta.js";              // JOIN: the existing Riemann zeta, for Gamma(s) zeta(s)
import { gammaFn } from "../md/maxwellSpeed.mjs"; // JOIN: the v3810 Gamma, already pinned by its own gate

// ---- SI defining constants (exact since the 2019 redefinition). External anchors, not tunables. ------------
export const H_PLANCK = 6.62607015e-34;    // J s   (exact)
export const K_BOLTZ = 1.380649e-23;       // J/K   (exact)
export const C_LIGHT = 299792458;          // m/s   (exact)

// ---- The dimensionless Planck spectral shapes in x = h nu / kT (freq) or x = h c / (lambda kT) (wavelength).
// The exponent n is the whole difference between the two: 3 for frequency, 5 for wavelength.
export function planckShape(x, n) {
    if (x <= 0) return 0;                    // x^n / (e^x - 1) -> 0 as x -> 0 for n >= 1
    return Math.pow(x, n) / Math.expm1(x);   // expm1 keeps e^x - 1 accurate for small x
}
export const planckNuShape = (x) => planckShape(x, 3);
export const planckLambdaShape = (x) => planckShape(x, 5);

// ---- Wien peak, route 1: NEWTON on the derivative condition n*(1 - e^-x) = x  <=>  x - n(1 - e^-x) = 0. -----
export function wienRootNewton(n, { x0 = null, iters = 60 } = {}) {
    let x = x0 == null ? n : x0;             // n is a good start (the root sits just below n)
    for (let i = 0; i < iters; i++) {
        const em = Math.exp(-x);
        const f = x - n * (1 - em);           // = 0 at the peak
        const df = 1 - n * em;                // d/dx
        const step = f / df;
        x -= step;
        if (Math.abs(step) < 1e-16) break;
    }
    return x;
}

// ---- Wien peak, route 2: GOLDEN-SECTION maximiser of the SHAPE itself. Shares no code with the root-finder --
// (it never forms the derivative), so agreement is corroboration rather than the same computation twice.
export function wienPeakMaximise(n, { lo = 0.1, hi = 4 * n, iters = 200 } = {}) {
    const phi = (Math.sqrt(5) - 1) / 2;      // 0.618...
    let a = lo, b = hi;
    let c = b - phi * (b - a), d = a + phi * (b - a);
    let fc = planckShape(c, n), fd = planckShape(d, n);
    for (let i = 0; i < iters; i++) {
        if (fc > fd) { b = d; d = c; fd = fc; c = b - phi * (b - a); fc = planckShape(c, n); }
        else { a = c; c = d; fc = fd; d = a + phi * (b - a); fd = planckShape(d, n); }
    }
    return 0.5 * (a + b);
}

// The residual of the transcendental at a claimed root -- a third, closed check that needs no solver.
export const wienResidual = (x, n) => x - n * (1 - Math.exp(-x));

// ---- The Bose-Einstein integral INT_0^inf x^(s-1)/(e^x - 1) dx. -------------------------------------------
// Substitute x = t^2 (dx = 2t dt): the integrand becomes 2 t^(2s-1)/(e^(t^2) - 1), which near t = 0 behaves as
// 2 t^(2s-3) -- FINITE for s >= 3/2 where the ORIGINAL integrand x^(s-2) diverges (integrably) at 0. That is why
// the substitution matters: it lets one Simpson rule cover the s = 3/2 case (Bose-Einstein condensation) and the
// s = 3, 4 cases (radiation) alike, agreeing with Gamma(s)zeta(s) to ~1e-13 across all of them. NO Gamma and NO
// zeta enter here -- this is the left-hand side. (v3814 -- was an x-space Simpson scoped to s >= 2; the t-space
// form extended it to the integrable-singularity regime that BEC needs, with the s = 3, 4 values unchanged.)
export function boseIntegral(s, { tMax = 8, steps = 400000 } = {}) {
    const f = (t) => {
        if (t <= 0) { const p = 2 * s - 3; return p > 0 ? 0 : (p === 0 ? 2 : 0); } // t->0 limit of 2 t^(2s-3)
        return 2 * Math.pow(t, 2 * s - 1) / Math.expm1(t * t);
    };
    const h = tMax / steps;
    let sum = f(0) + f(tMax);
    for (let i = 1; i < steps; i++) sum += (i % 2 ? 4 : 2) * f(i * h);
    return (h / 3) * sum;
}

// The RIGHT-hand side of the master identity, reached through two OTHER modules.
export const boseClosed = (s) => gammaFn(s) * zeta(s);

// ---- Dimensionful anchors, computed from the exact SI constants. ------------------------------------------
// Stefan-Boltzmann constant sigma = 2 pi^5 k^4 / (15 h^3 c^2).
export function stefanBoltzmannSigma() {
    return (2 * Math.pow(Math.PI, 5) * Math.pow(K_BOLTZ, 4)) / (15 * Math.pow(H_PLANCK, 3) * C_LIGHT * C_LIGHT);
}
// Wien's displacement constant b = h c / (x_lambda k), with x_lambda the wavelength-peak root.
export function wienConstant() {
    return (H_PLANCK * C_LIGHT) / (wienRootNewton(5) * K_BOLTZ);
}
// The peak wavelength of a blackbody at temperature T (metres): lambda_peak = b / T.
export const peakWavelength = (T) => wienConstant() / T;

// Total radiated exitance M = sigma T^4 (the Stefan-Boltzmann law), for the T-scaling control.
export const exitance = (T) => stefanBoltzmannSigma() * Math.pow(T, 4);

// v3811 -- MEASURED, printed by the gate rather than trusted from this comment.
export const MEASURED_V3811 = {
    wien_lambda_root: "4.9651142317 (n=5)",
    wien_nu_root: "2.8214393721 (n=3)",  // NB: computed by the solver, which caught a digit-swap in this comment's first draft
    stefanBoltzmann_integral: "pi^4/15 = 6.4939394023 = 6*zeta(4)",
    photon_number_integral: "2*zeta(3) = 2.4041138063",
    peaks_are_different_photons: "nu_peak*lambda_peak/c = x_nu/x_lambda = 0.5683, NOT 1",
    zeta_join_real_s: "v3811 found physics/zeta.js returned zeta(3) for zeta(2.5) (ipow counted loop); FIXED in v3812 by wiring zeta.js to the tree's existing strict-libm (tools/strictExpErf + tools/strictLog), so the Gamma(s)zeta(s) join now holds at real s.",
    note: "Stefan-BOLTZMANN radiation, not the Stefan melt problem. Ideal blackbody: no emissivity, no transfer.",
};
