// physics/thermal/bec.mjs -- v3814
//
// BOSE-EINSTEIN CONDENSATION -- THE BOSE GAS THAT BLACKBODY AND DEBYE ARE NOT. Photons (blackbody) and phonons
// (debye) are Bose gases with NO conserved number: they are created and destroyed freely, so their chemical
// potential is pinned at zero and nothing ever condenses. A gas of MASSIVE atoms conserves N, so its chemical
// potential is a real variable, and when it climbs to zero a macroscopic fraction of the atoms falls into the
// single-particle ground state. That is the whole difference, and it is why this module needs the SAME Bose
// integral blackbody owns -- but at the HALF-INTEGER order s = 3/2, which only became computable when v3812 gave
// physics/zeta.js a real-s power. This round is the consumer that fix was waiting for.
//
// Working dimensionless, k_B = 1, in terms of the phase-space density n*lambda^3 (lambda the thermal wavelength)
// and t = T/Tc. The excited-state count is N_ex/N = g_{3/2}(z)/zeta(3/2), z = e^{mu/kT} the fugacity.
//
// *** THE KEYS, ALL EXACT AND NONE FED TO THE MODEL:
//   1. THE CONDENSATION CONDITION n*lambda_c^3 = zeta(3/2) = 2.6123753. Condensation begins exactly when the
//      excited states, filled to their z = 1 ceiling, can no longer hold every atom -- and that ceiling is
//      g_{3/2}(1) = zeta(3/2). Reached here three ways that share no code: the polylog series sum z^n/n^s at
//      z = 1, blackbody's boseIntegral(3/2)/gammaFn(3/2), and physics/zeta.js's zeta -- boseIntegral from one
//      module, Gamma from another, zeta from a third, meeting on a number none computes alone.
//   2. THE CONDENSATE FRACTION N0/N = 1 - (T/Tc)^{3/2} below Tc. The excited count is fixed at z = 1 and scales
//      as T^{3/2}, and it equals N at Tc, so the rest is in the ground state. An exact power law.
//   3. THE HEAT-CAPACITY CUSP at Tc: C_V/(Nk) = (15/4) zeta(5/2)/zeta(3/2) = 1.9257, joining zeta(5/2) and
//      zeta(3/2). C_V is CONTINUOUS there (the z<1 branch meets the same value as z->1) but its slope is not --
//      the famous cusp that becomes helium's lambda point once interactions are switched on.
//
// *** TWO LOAD-BEARING NEGATIVES.
//   - THE CLASSICAL GAS DOES NOT CONDENSE. Boltzmann statistics replace g_{3/2}(z) with a bare z, which grows
//     without bound, so the excited states never saturate and there is no Tc. Condensation is a purely
//     quantum-statistical effect, and the plant that swaps in the classical count loses it entirely.
//   - TWO DIMENSIONS HAS NO BEC. The ceiling is g_{d/2}(1) = zeta(d/2), and zeta(3/2) is finite while zeta(1) --
//     the d = 2 case -- is the harmonic series and DIVERGES, so the excited states in 2D can swallow any number
//     of atoms and never force a condensate. The dimension is load-bearing, exactly as it was for the
//     Maxwell-Boltzmann speeds and the Debye modes.
//
// BROWSER-SAFE: imports ./blackbody.mjs, ../md/maxwellSpeed.mjs, ../zeta.js; no node builtins, no DOM.

import { boseIntegral } from "./blackbody.mjs";       // the general Bose integral (t-space, valid at s = 3/2)
import { gammaFn } from "../md/maxwellSpeed.mjs";      // Gamma
import { zeta } from "../zeta.js";                     // real-s zeta (v3812)

// The polylog / Bose function g_s(z) = sum_{n>=1} z^n / n^s, summed with z^n accumulated iteratively. Converges
// fast for z well below 1; at z = 1 it converges only as a slow tail, which is the transition's own marginality,
// so the z = 1 values are taken from boseFunctionAtOne instead.
export function boseFunction(s, z, N = 20000) {
    let sum = 0, zn = 1;
    for (let n = 1; n <= N; n++) { zn *= z; if (zn === 0) break; sum += zn / Math.pow(n, s); }
    return sum;
}

// g_s(1) = zeta(s), reached through the integral and Gamma rather than the slow series: boseIntegral is
// INT_0^inf x^{s-1}/(e^x-1) dx = Gamma(s) zeta(s), so dividing by Gamma(s) gives zeta(s) with no zeta call.
export const boseFunctionAtOne = (s) => boseIntegral(s) / gammaFn(s);

// The critical phase-space density n lambda_c^3 = zeta(3/2).
export const criticalDensity = () => zeta(1.5);

// Condensate fraction below Tc; zero at and above Tc.
export const condensateFraction = (tOverTc) => (tOverTc < 1 ? 1 - Math.pow(tOverTc, 1.5) : 0);

// The heat-capacity cusp value at Tc, in units of Nk.
export const cvPeak = () => (15 / 4) * zeta(2.5) / zeta(1.5);

// C_V/(Nk) below Tc: rises as (T/Tc)^{3/2} to the cusp.
export function cvBelowTc(tOverTc) {
    if (tOverTc > 1) return NaN;
    return (15 / 4) * (zeta(2.5) / zeta(1.5)) * Math.pow(tOverTc, 1.5);
}

// Solve g_{3/2}(z) = target for z in (0,1), for the T > Tc branch where the fugacity is below one.
export function fugacityFor(target, { iters = 100 } = {}) {
    let lo = 1e-12, hi = 1;
    for (let i = 0; i < iters; i++) {
        const m = 0.5 * (lo + hi);
        if (boseFunction(1.5, m) < target) lo = m; else hi = m;
    }
    return 0.5 * (lo + hi);
}

// C_V/(Nk) above Tc: with z from the occupation constraint, C_V = (15/4) g_{5/2}/g_{3/2} - (9/4) g_{3/2}/g_{1/2}.
// As z -> 0 (T -> inf) this -> 3/2, the classical monatomic value; as z -> 1 (T -> Tc+) the second term vanishes
// because g_{1/2}(z) diverges, so it meets the cusp from above.
export function cvAboveTc(tOverTc) {
    if (tOverTc < 1) return NaN;
    const z = fugacityFor(zeta(1.5) * Math.pow(1 / tOverTc, 1.5));
    const g32 = boseFunction(1.5, z), g52 = boseFunction(2.5, z), g12 = boseFunction(0.5, z);
    return (15 / 4) * g52 / g32 - (9 / 4) * g32 / g12;
}

// THE CLASSICAL NEGATIVE: Boltzmann statistics count the excited states as a bare z (unbounded), not g_{3/2}(z).
export const classicalExcited = (z) => z;

// THE DIMENSIONAL NEGATIVE: the excited-state ceiling in d dimensions is zeta(d/2). Returned for d != 2; the d = 2
// case is the harmonic series and is handled by the gate as a divergent partial sum rather than a value.
export const ceilingForDimension = (d) => zeta(d / 2);

// v3814 -- MEASURED by the gate, not trusted from this comment.
export const MEASURED_V3814 = {
    critical_density: "n lambda_c^3 = zeta(3/2) = 2.6123753487",
    condensate_law: "N0/N = 1 - (T/Tc)^{3/2}, exact",
    cv_cusp: "C_V/(Nk) = (15/4) zeta(5/2)/zeta(3/2) = 1.925672 at Tc, continuous, slope-discontinuous",
    join: "g_{3/2}(1) = boseIntegral(3/2)/gammaFn(3/2) = zeta(3/2) -- three modules, half-integer s (needs v3812)",
    classical_negative: "Boltzmann count z is unbounded -> no Tc; condensation is quantum-statistical",
    twoD_negative: "ceiling zeta(d/2): finite at d=3 (2.612), divergent at d=2 (zeta(1), harmonic) -> no BEC in 2D",
    note: "ideal Bose gas, k_B=1. No interactions -- the cusp is not yet helium's lambda divergence. Conserved N.",
};
