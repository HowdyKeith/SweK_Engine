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
import { directionalAlbedo, directionalAlbedoSampled } from "./microfacet.mjs";

/**
 * The directional-albedo table and its cosine-weighted average.
 *
 * `K` is the number of samples in mu. It is a REAL parameter of the method and not an implementation detail --
 * a renderer ships this as a texture, and the gate proves the closure residual is SECOND ORDER in it, so "the
 * table is coarse" and "the construction is wrong" are told apart by the ORDER rather than by the size.
 *
 * ================================================================================================
 * *** v4411 -- THE TABLE WAS BUILT BY THE ONE INSTRUMENT THAT CANNOT MEASURE IT AT LOW ROUGHNESS. ***
 * ================================================================================================
 *
 * Until v4411 this asked directionalAlbedo -- a quadrature -- at N = M = 220, and path-tracer.html asked for
 * 160. v4409 measured what a grid does to a lobe narrower than its step, and the numbers here are worse than
 * anybody would guess:
 *
 *     alpha 0.01     E reads 0.998467  against 0.999845     0.1% out   -- fine
 *     alpha 0.005    E reads 0.926156  against 0.999962     7.4% out
 *     alpha 0.001    E reads 0.145049  against 0.999929    85.5% out
 *     alpha 0.0005   E reads 0.039269  against 0.982046    96.0% out
 *
 * *** AND THE CLOSURE CANNOT SEE IT. *** E + INT f_ms cos dw = 1 is algebra in WHATEVER E it is handed: feed
 * it 0.039 for a surface that returns 0.98 of its light and the closure still reads 1.00014, while the
 * compensation lobe manufactures 96% of the surface's energy out of nothing. Every check in
 * energyCompensation-selfcheck.mjs passes on that table. THE SENTENCE IN THIS FILE'S HEADER -- "AN EXACT
 * CLOSURE IS PROOF OF CONSISTENCY, NEVER OF CORRECTNESS" -- was written at v3492 as a caution and is now a
 * measurement, in the one place it was pointed at itself.
 *
 * THE DEFAULT IS THEREFORE THE SAMPLER, which v4410 built and which has no grid to be too coarse: 3.4e-5 at
 * every roughness from 0.0005 to 1, and 4096 evaluations against the quadrature's 48,400. It is more accurate
 * AND cheaper, so there is no trade being made here. `quadrature: true` keeps the old path reachable, because
 * the gate has to be able to produce the wrong table in order to measure that the closure cannot see it.
 *
 * NOT REACHED BY ANY SHIPPED CALLER TODAY: path-tracer.html sweeps alpha from 0.05 up, where 160x160 is
 * accurate to 1e-6. This was latent, not live -- and it is fixed rather than merely named, which is the
 * opposite call from v4409's cdf denominator, because there the measurement said the hazard did not bite and
 * here it says it bites totally.
 */
export function buildTable(alpha, { K = 24, N = 220, M = 220, samples = 4096, quadrature = false, plant = {} } = {}) {
    const mu = [], E = [];
    for (let i = 0; i < K; i++) {
        const m = (i + 0.5) / K; mu.push(m);
        E.push(quadrature ? directionalAlbedo(alpha, m, { N, M, plant })
                          : directionalAlbedoSampled(alpha, m, { samples, ...plant }));
    }
    // E_avg = 2 INT E(mu) mu dmu, the cosine-weighted average over the hemisphere.
    const Eavg = 2 * E.reduce((s, e, i) => s + e * mu[i], 0) / K;
    return { alpha, K, mu, E, Eavg };
}

/**
 * v4411 -- THE CLOSURE RESIDUAL'S ORDER IN K, MEASURED ONCE ACROSS THE INSTRUMENT THAT BUILDS THE TABLE.
 *
 * *** THE EXPONENT IDENTIFIES WHICH INSTRUMENT YOU USED, WHICH IS SHARPER THAN THE RESIDUAL'S SIZE. ***
 * energyCompensation-selfcheck.mjs held from v3492 that the residual is SECOND order in K, "so it is the
 * TABLE's and not the algebra's". The conclusion was right and the exponent was the quadrature's: refine the
 * quadrature and the order climbs, and with a grid-free estimator it is exactly 3.
 *
 * Fitted over K = 16, 32, 64, 128, 256 at the worst cell (alpha 0.05, cos_o 0.2), lobe integral at N = 6400
 * so the integrator is not the thing being measured:
 *
 *     quadrature N=160   2.11        quadrature N=1600  2.57
 *     quadrature N=220   2.09        quadrature N=3000  2.84
 *     quadrature N=400   2.09        sampler   1024     3.05
 *     quadrature N=800   2.23        sampler   4096     3.00
 *                                    sampler   65536    3.00
 *
 * THREE IS THE TRUE ORDER, and the reason is that linear interpolation error on a MIDPOINT grid alternates in
 * sign cell to cell, so integrating it against a smooth weight cancels one order. The quadrature's E carries a
 * grid-dependent wobble that does NOT alternate, so it dominates and reads 2 -- and it is flat at 2 until the
 * grid is fine enough to get out of the way. The sampler's 3 is flat in SAMPLE COUNT across six doublings,
 * which is what says it is the interpolation and not the estimator's noise.
 *
 * Frozen rather than re-run: the N = 1200 point alone costs 34 s. The gate asserts the two cheap endpoints
 * every run and holds this record to being monotone and landing on 3.
 */
export const ORDER_SWEEP = Object.freeze({
    at: "v4411", cell: { alpha: 0.05, cosO: 0.2 }, Ks: Object.freeze([16, 32, 64, 128, 256]), lobeN: 6400,
    quadrature: Object.freeze([{ N: 160, order: 2.11 }, { N: 220, order: 2.09 }, { N: 400, order: 2.09 },
                               { N: 800, order: 2.23 }, { N: 1600, order: 2.57 }, { N: 3000, order: 2.84 }]),
    sampled: Object.freeze([{ samples: 1024, order: 3.05 }, { samples: 4096, order: 3.00 },
                            { samples: 65536, order: 3.00 }]),
});

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
