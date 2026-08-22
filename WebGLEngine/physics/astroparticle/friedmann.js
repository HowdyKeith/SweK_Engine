// WebGLEngine/physics/astroparticle/friedmann.js — v3428
// ---------------------------------------------------------------------------------------------------------------
// THE EXPANDING UNIVERSE — one integrator, three exact regimes, and a closure identity that is not a fit.
//
//     (a'/a)^2 = H0^2 [ Om/a^3 + Or/a^4 + Ok/a^2 + OL ]
//
// Each term dilutes differently -- matter as volume, radiation as volume plus a redshift, curvature as area,
// the cosmological constant not at all -- so a universe made of only one of them has a CLOSED-FORM history:
//
//     matter only      a(t) proportional to t^(2/3)
//     radiation only   a(t) proportional to t^(1/2)
//     Lambda only      a(t) proportional to exp(H0 t)
//
// THREE EXACT ANSWERS FROM ONE PIECE OF CODE, and they fail differently: a wrong exponent on the matter term
// leaves the radiation case untouched, and neither touches the exponential. That is the structure the beam
// device has with static/vibration/buckling, and it is the reason a third regime is worth having rather than
// being a restatement of the first two.
//
// *** AND THE CLOSURE CONDITION IS AN IDENTITY, NOT A MEASUREMENT. *** Om + Or + Ok + OL = 1 EXACTLY at the
// present day, because that is how the density parameters are DEFINED -- Ok is whatever is left over. So a
// universe can be built with any three and the fourth follows, and a check that the four sum to one is checking
// the arithmetic rather than the cosmology. It is included here precisely BECAUSE it is that kind of check: the
// oscillation and lensing devices both showed that a true, exactly-satisfied identity can be blind to a serious
// error, and this is a third example in a third subject.
//
// THE AGE IS THE KEY THAT IS NOT BLIND. For a flat matter-only universe the age is exactly 2/(3 H0), which
// depends on the matter exponent and would move if the dilution were wrong. It is the one check here that could
// catch a bad Friedmann equation.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/** Hubble constant in SI: km/s/Mpc -> 1/s. */
export const MPC_KM = 3.0856775814913673e19;
export const h0SI = (h0KmSMpc) => h0KmSMpc / MPC_KM;

/** Seconds in a Julian year, and a Gyr, for reporting an age somebody can recognise. */
export const YEAR_S = 31557600;
export const GYR_S = 1e9 * YEAR_S;

/** Curvature is whatever is left. This is a DEFINITION, which is why the sum is exactly one. */
export const closure = ({ Om = 0, Or = 0, OL = 0 }) => ({ Om, Or, OL, Ok: 1 - Om - Or - OL });

/** The expansion rate at scale factor a, in units of H0. */
export function eOfA(a, { Om = 0, Or = 0, Ok = 0, OL = 0 }) {
    return Math.sqrt(Or / (a * a * a * a) + Om / (a * a * a) + Ok / (a * a) + OL);
}

/**
 * Integrate a(t) from a small starting scale factor. Uses RK4 on da/dt = a H0 E(a), with the time returned in
 * units of 1/H0 so the results are pure numbers that can be compared against the closed forms directly.
 */
export function expand({ Om = 1, Or = 0, OL = 0, a0 = 1e-6, aEnd = 1, steps = 200000 } = {}) {
    const O = closure({ Om, Or, OL });
    const f = (a) => a * eOfA(a, O);                  // da/dtau with tau = H0 t
    // integrate dtau/da = 1/f(a) instead, which is well behaved from a small a0
    const g = (a) => 1 / f(a);
    let tau = 0;
    const h = (aEnd - a0) / steps;
    const track = [];
    for (let i = 0; i < steps; i++) {
        const a = a0 + i * h;
        const k1 = g(a), k2 = g(a + h / 2), k3 = g(a + h / 2), k4 = g(a + h);
        tau += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
        if (i % Math.max(1, Math.floor(steps / 400)) === 0) track.push({ a: a + h, tau });
    }
    return { tau, track, O };
}

/** Age in units of 1/H0, from the big bang to a = 1. */
export const ageInHubbleTimes = (opts) => expand(opts).tau;

/** Exact age of a flat matter-only universe: 2/3 of a Hubble time. No integration involved. */
export const AGE_MATTER_EXACT = 2 / 3;
/** Exact age of a flat radiation-only universe: half a Hubble time. */
export const AGE_RADIATION_EXACT = 1 / 2;

/**
 * Fit the power-law exponent of a(tau) over a window, so the closed-form exponents can be checked against a
 * measurement of the integrated history rather than against themselves.
 */
export function fitExponent(track, { from = 0.3, to = 0.9 } = {}) {
    const pts = track.filter((p, i) => i > track.length * from && i < track.length * to && p.tau > 0);
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of pts) {
        const x = Math.log(p.tau), y = Math.log(p.a);
        sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const n = pts.length;
    return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

/** Redshift and scale factor are the same statement: 1 + z = 1/a, exactly. */
export const redshiftOfA = (a) => 1 / a - 1;
export const aOfRedshift = (z) => 1 / (1 + z);
