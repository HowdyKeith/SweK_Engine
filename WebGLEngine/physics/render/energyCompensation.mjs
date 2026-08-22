// WebGLEngine/physics/render/energyCompensation.mjs -- v3492
//
// *** THE RARE CASE WHERE THE ANSWER KEY EXISTED BEFORE THE CODE. *** v3490 measured what single-scattering GGX
// throws away -- E runs 0.996950 at roughness 0.05 down to 0.327508 at 1.0 -- and named the shortfall as the
// energy that scattering BETWEEN microfacets would have returned. This is the term that returns it, and the
// thing it must satisfy was already written down: *** A COMPENSATED BRDF MUST DRIVE E BACK TO EXACTLY 1, AT
// EVERY ROUGHNESS AND EVERY VIEW ANGLE. *** Nothing here is graded against a picture or a tolerance.
//
// ================================================================================================
// THE CONSTRUCTION, AND WHY IT CLOSES
// ================================================================================================
//
//     f_ms(mu_o, mu_i) = (1 - E(mu_o)) (1 - E(mu_i)) / (pi (1 - E_avg))       E_avg = 2 INT E(mu) mu dmu
//
// Integrate it against cos over the hemisphere and the denominator cancels exactly:
//
//     INT (1 - E(mu_i)) cos dw = pi - pi E_avg = pi (1 - E_avg)
//     =>  INT f_ms cos dw = (1 - E(mu_o))          <- exactly the shortfall, at every angle
//
// So E + INT f_ms cos dw = 1. THE CLOSURE IS ALGEBRA AND NOT A FIT, which is what makes it gradeable: the gate
// integrates the lobe NUMERICALLY rather than substituting the closed form, so a wrong table, a wrong average
// or a wrong denominator all break it.
//
// ================================================================================================
// *** THE HONEST LIMIT, AND IT MUST BE READ BEFORE THE EXACT CLOSURE BELOW IS BELIEVED ***
// ================================================================================================
//
// THIS RESTORES THE ENERGY AND NOT THE DISTRIBUTION. f_ms depends on NOTHING BUT E and E_avg, so any two BRDFs
// with the same directional albedo receive the SAME compensation lobe -- which cannot be right in detail,
// because the true multiple-scattering term depends on the microsurface that produced it. It is the simplest
// function that is (a) reciprocal, (b) energy-restoring and (c) vanishing where there is nothing to compensate.
//
// *** AN EXACT CLOSURE IS PROOF OF CONSISTENCY, NEVER OF CORRECTNESS. This tree has hit that sentence five
// times in other subjects (oscillation's unitarity, lensing's magnification difference, Friedmann's Omega
// closure); it is stated here BEFORE the measurement rather than discovered afterwards. ***
"use strict";
import { directionalAlbedo } from "./microfacet.mjs";

/**
 * The directional-albedo table and its cosine-weighted average.
 *
 * `K` is the number of samples in mu. It is a REAL parameter of the method and not an implementation detail --
 * a renderer ships this as a texture, and the gate proves the closure residual is SECOND ORDER in it, so "the
 * table is coarse" and "the construction is wrong" are told apart by the ORDER rather than by the size.
 */
export function buildTable(alpha, { K = 24, N = 220, M = 220, plant = {} } = {}) {
    const mu = [], E = [];
    for (let i = 0; i < K; i++) { const m = (i + 0.5) / K; mu.push(m); E.push(directionalAlbedo(alpha, m, { N, M, plant })); }
    // E_avg = 2 INT E(mu) mu dmu, the cosine-weighted average over the hemisphere.
    const Eavg = 2 * E.reduce((s, e, i) => s + e * mu[i], 0) / K;
    return { alpha, K, mu, E, Eavg };
}

/** Linear interpolation into the table -- the renderer's real situation, so the gate grades what would ship. */
export function albedoAt(T, mu) {
    const x = mu * T.K - 0.5;
    const i = Math.max(0, Math.min(T.K - 2, Math.floor(x)));
    const f = Math.min(1, Math.max(0, x - i));
    return T.E[i] * (1 - f) + T.E[i + 1] * f;
}

/**
 * The multiple-scattering lobe.
 *
 *   noDenominator -- PLANT: drop the 1/(1 - E_avg). It UNDER-compensates by exactly (1 - E) E_avg, and at low
 *                    roughness E_avg -> 1 so it compensates almost nothing -- which is invisible there because
 *                    there was almost nothing to compensate.
 *   table         -- pass a DIFFERENT table to compensate against. PLANT: the separable-G2 albedo used on a
 *                    height-correlated lobe. Both tables are legitimate; using one on the other OVER-compensates
 *                    and manufactures energy.
 *
 * IT IS SYMMETRIC IN ITS TWO ARGUMENTS BY CONSTRUCTION, which is Helmholtz reciprocity and is asserted BIT-EXACT
 * rather than to a tolerance -- there is no arithmetic here that could make it approximate.
 */
export function msLobe(T, muO, muI, { noDenominator = false, table = null } = {}) {
    const S = table || T;
    const num = (1 - albedoAt(S, muO)) * (1 - albedoAt(S, muI));
    return noDenominator ? num / Math.PI : num / (Math.PI * (1 - S.Eavg));
}

/**
 * E(mu_o) plus the hemisphere integral of the compensation lobe. *** THE INTEGRAL IS COMPUTED NUMERICALLY AND
 * NEVER REPLACED BY THE CLOSED FORM (1 - E): substituting it would make this function return 1 by construction
 * and the gate would be checking arithmetic rather than the construction. ***
 */
export function compensatedAlbedo(T, muO, { N = 400, ...o } = {}) {
    let s = 0; const dth = Math.PI / 2 / N;
    for (let i = 0; i < N; i++) {
        const th = (i + 0.5) * dth, ct = Math.cos(th);
        s += msLobe(T, muO, ct, o) * ct * Math.sin(th) * dth;
    }
    return albedoAt(T, muO) + s * 2 * Math.PI;
}
