// WebGLEngine/physics/render/microfacet.mjs -- v3490
//
// *** THE WHITE FURNACE TEST'S ACTUAL PURPOSE, WHICH SweK HAS NEVER BEEN ABLE TO ASK. ***
//
// v3467 built the furnace for a LAMBERTIAN surface, where the answer is the albedo and the test catches a wrong
// sampler. That is not what the furnace test is for in practice. Its real job is to ask whether a MATERIAL
// MODEL CONSERVES ENERGY -- and every renderer that ships a single-scattering microfacet BRDF fails it, by an
// amount that grows with roughness and that nobody notices, because a surface that throws away two thirds of
// its light still looks like a plausible rough metal.
//
// Everything here is DERIVED FROM THE DEFINITIONS rather than ported. The three ingredients:
//
//   D(m)      Trowbridge-Reitz / GGX normal distribution: a^2 / (pi * ((n.m)^2 (a^2 - 1) + 1)^2)
//   Lambda(w) the Smith auxiliary: (-1 + sqrt(1 + a^2 tan^2 theta)) / 2
//   G1, G2    masking and masking-shadowing built FROM Lambda, never tabulated
//
// ================================================================================================
// TWO EXACT IDENTITIES AND ONE MEASURED CURVE, AND THEY CATCH DIFFERENT THINGS
// ================================================================================================
//
//   (1) THE NDF NORMALISES:            INT D(m) (n.m) dm = 1        over the hemisphere, at EVERY roughness.
//       This is what makes D a distribution at all. A wrong constant in D is invisible in a picture -- it
//       rescales every highlight equally and reads as a brighter material.
//
//   (2) THE WEAK WHITE FURNACE TEST:   INT D(wh) G1(wo) / (4 |cos_o|) dwi = 1     over the FULL SPHERE.
//       *** THIS IS THE SHARP ONE AND IT IS THE REASON THE TEST EXISTS: IT HOLDS ONLY IF D AND G1 ARE MUTUALLY
//       CONSISTENT. A masking function borrowed from a DIFFERENT distribution -- the commonest way to get this
//       wrong, because both are published beside each other -- leaves D normalised, leaves the picture
//       plausible, and breaks this. It holds at every roughness AND every view angle, so it is a
//       parameter-that-must-not-matter key with TWO parameters. ***
//
//   (3) THE STRONG TEST:               E(wo) = INT D(wh) G2(wo,wi,wh) / (4 cos_o) dwi   over the hemisphere.
//       With F = 1 and no absorption ANYWHERE, a conserving BRDF would give exactly 1. Single-scattering GGX
//       gives LESS, and the shortfall IS the energy that multiple scattering between microfacets would have
//       returned. It is not a bug and it is not a tolerance: it is a MEASURED CURVE with a known shape.
//
// *** AND THE SHORTFALL IS THE DANGEROUS KIND: at a = 0.05 it is 0.7% -- inside any tolerance anybody would
// write -- and at a = 1.0 it is 67%. THE TWO CASES ARE TOLD APART BY THE TREND, NOT BY WHETHER THE NUMBER IS
// SMALL, which is v3420's Hall rule in a new subject. ***
"use strict";

/** GGX / Trowbridge-Reitz. `noPi` is a PLANT: drop the normalising pi and the NDF integral reads exactly pi. */
export function D(cosM, alpha, { noPi = false } = {}) {
    if (cosM <= 0) return 0;
    const a2 = alpha * alpha, c2 = cosM * cosM;
    // *** v3494 -- WRITTEN AS A SUM OF POSITIVES RATHER THAN THE TEXTBOOK cos^2 (a^2 - 1) + 1, WHICH IS A
    // DIFFERENCE OF NUMBERS NEAR 1. Algebraically identical and worth 3.8e-15 here, WHICH IS WHY IT WAS THE
    // textbook form until the GLSL port asked at binary32: there the textbook denominator is 2.60e-2 out at
    // roughness 0.001 against 1.33e-7 for this one, and the NDF stops integrating to 1. THE MODULE AND THE
    // SHADER NOW CARRY ONE EXPRESSION rather than two that agree only at double precision -- a second
    // declaration that agrees today is still a second declaration. ***
    const t = (1 - c2) + a2 * c2;
    return a2 / ((noPi ? 1 : Math.PI) * t * t);
}

/**
 * The Smith auxiliary for GGX.
 *
 * `beckmann` is the PLANT THAT MATTERS: Smith's Lambda for the BECKMANN distribution, used with GGX's D. It is
 * a real function, correctly implemented, and it belongs to a different microfacet distribution -- which is
 * exactly the mistake the weak furnace test was invented to catch, because both forms are published beside each
 * other and neither one looks wrong on its own.
 */
export function Lambda(cosW, alpha, { beckmann = false } = {}) {
    const c2 = cosW * cosW, tan2 = (1 - c2) / Math.max(c2, 1e-16);
    if (!beckmann) return (-1 + Math.sqrt(1 + alpha * alpha * tan2)) / 2;
    const a = 1 / (alpha * Math.sqrt(tan2) || 1e-16);
    return (erf(a) - 1) / 2 + Math.exp(-a * a) / (2 * a * Math.sqrt(Math.PI));
}

/** Abramowitz-Stegun 7.1.26. Needed only by the Beckmann plant, and DERIVED here rather than approximated away. */
function erf(x) {
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
}

export const G1 = (cosW, alpha, o = {}) => 1 / (1 + Lambda(cosW, alpha, o));
/**
 * Height-correlated Smith masking-shadowing. `separable` is NOT a plant: it is the OTHER legitimate choice,
 * G1(o)G1(i), which assumes masking and shadowing are independent. It is a different model rather than a wrong
 * one, and the difference between them is measured rather than argued about.
 */
export const G2 = (cosO, cosI, alpha, { separable = false, ...o } = {}) =>
    separable ? G1(cosO, alpha, o) * G1(cosI, alpha, o) : 1 / (1 + Lambda(cosO, alpha, o) + Lambda(cosI, alpha, o));

const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/**
 * INT D(m) (n.m) dm over the hemisphere. Must be 1.
 *
 * THE RESIDUAL HERE IS THE QUADRATURE'S AND NOT THE PHYSICS', WHICH IS WHY THE GATE PROVES IT BY REFINEMENT
 * RATHER THAN BY TOLERANCE: a narrow lobe needs a finer grid, so the error must FALL as N rises, and a residual
 * that did not fall would mean the identity itself was broken.
 */
export function ndfIntegral(alpha, { N = 4000, plant = {} } = {}) {
    let s = 0; const dth = Math.PI / 2 / N;
    for (let i = 0; i < N; i++) {
        const th = (i + 0.5) * dth, c = Math.cos(th);
        s += D(c, alpha, plant) * c * Math.sin(th) * dth;
    }
    return s * 2 * Math.PI;
}

/**
 * The two furnace integrals, which differ by ONE TERM and by their domain -- so they are computed by one loop
 * with one flag rather than by two bodies of code that could disagree for a second reason.
 *
 *   weak   -- G1(wo) only, over the FULL SPHERE, must be exactly 1
 *   strong -- G2(wo,wi), over the UPPER HEMISPHERE, is the directional albedo and must be <= 1
 *
 * The integrand is symmetric about the plane containing wo and the normal, so phi runs over [0, pi] and the
 * result is doubled -- an exact halving of the cost, not an approximation.
 */
export function furnaceIntegral(alpha, cosO, { strong = false, N = 500, M = 500, plant = {}, noJacobian = false } = {}) {
    const so = Math.sqrt(Math.max(0, 1 - cosO * cosO)), wo = [so, 0, cosO];
    const thMax = strong ? Math.PI / 2 : Math.PI;
    const dth = thMax / N, dph = Math.PI / M;
    let s = 0;
    for (let i = 0; i < N; i++) {
        const th = (i + 0.5) * dth, ct = Math.cos(th), st = Math.sin(th);
        for (let j = 0; j < M; j++) {
            const ph = (j + 0.5) * dph;
            const wi = [st * Math.cos(ph), st * Math.sin(ph), ct];
            const hl = Math.hypot(wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]);
            if (hl < 1e-9) continue;
            const wh = nrm([wo[0] + wi[0], wo[1] + wi[1], wo[2] + wi[2]]);
            const mask = strong ? G2(cosO, ct, alpha, plant)
                                : ((wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2]) / cosO > 0 ? G1(cosO, alpha, plant) : 0);
            // *** THE 4 IS THE JACOBIAN OF THE HALF-VECTOR CHANGE OF VARIABLE, NOT A FUDGE. `noJacobian` drops
            // it and the answer reads EXACTLY FOUR TIMES too large -- a predicted factor with no free
            // parameter, and one the NDF normalisation cannot see because there is no 4 in D. ***
            s += D(wh[2], alpha, plant) * mask / ((noJacobian ? 1 : 4) * Math.abs(cosO)) * st * dth * dph;
        }
    }
    return s * 2;
}

/** Directional albedo: how much of the arriving light a white, non-absorbing GGX surface actually sends back. */
export const directionalAlbedo = (alpha, cosO, o = {}) => furnaceIntegral(alpha, cosO, { ...o, strong: true });

/* ---------------------------------------------------------------------------------------------------------
 * v3493 -- SAMPLING, WHICH IS THE HALF A RENDERER NEEDS AND AN INTEGRAL DOES NOT
 *
 * *** EVALUATING D * G2 * F / (4 cos_o cos_i) AT A DIRECTION SOMEBODY HANDED YOU IS THE RASTERISER'S RECIPE. A
 * PATH TRACER HAS TO **CHOOSE** THE DIRECTION AND THEN DIVIDE BY THE PROBABILITY IT CHOSE IT WITH, and that pdf
 * is where the bugs live: v3468 measured the commonest one -- change the sampler, forget the pdf -- landing on
 * a predicted 4/3. The sampler and its pdf are therefore written together, in one file, and the gate checks
 * them APART from the estimator. ***
 * ------------------------------------------------------------------------------------------------------- */

/**
 * Sample a half-vector from the NDF. Inverting the GGX cdf gives cos(theta_h) in closed form, so this is
 * arithmetic and a square root -- no rejection loop, no table.
 *
 * *** v4409 -- THIS DENOMINATOR IS THE CANCELLATION v3494 REMOVED FROM D, AND IT IS STILL HERE. ***
 *
 *     shipped, below       u1 * (a2 - 1) + 1        a DIFFERENCE OF NUMBERS NEAR 1
 *     algebraically same   (1 - u1) + u1 * a2       a SUM OF POSITIVES
 *
 * The same shape, in this same file, missed because v3494 was looking at D. At binary32 it is worth 3.28e-3
 * in cos_h at alpha 0.001, u1 0.999999, against 1.4e-8 for the rewrite -- five orders, exactly as in D.
 *
 * *** AND IT IS LEFT ALONE ON PURPOSE, BECAUSE THE MEASUREMENT SAYS SO. *** Through the estimator the rewrite
 * moves the answer by 1.2e-8 at worst and by EXACTLY ZERO at alpha >= 0.25: the corrupted samples live where
 * u1 -> 1, they are a vanishing fraction of any uniform or stratified draw, and bounceWeight is smooth there.
 * A latent hazard named with a number is worth more than a fix nobody could justify from a measurement.
 *
 * WHAT WOULD CHANGE THAT: a consumer that samples u1 NON-uniformly and clusters it near 1 -- an adaptive
 * scheme, or a low-discrepancy sequence whose first dimension bunches -- would meet the 3.28e-3 directly.
 * physics/render/microfacetSampleWgsl.mjs keeps the rewrite one bit away (REPAIR.stableCdf) for that day, and
 * physics/render/microfacetSampleWgsl-selfcheck.mjs section 5 holds both forms side by side.
 */
export function sampleHalfVector(u1, u2, alpha) {
    const a2 = alpha * alpha;
    const cosH = Math.sqrt((1 - u1) / (u1 * (a2 - 1) + 1));
    const sinH = Math.sqrt(Math.max(0, 1 - cosH * cosH));
    const phi = 2 * Math.PI * u2;
    return [sinH * Math.cos(phi), cosH, sinH * Math.sin(phi)];   // y is up, matching furnace.mjs's frame
}

/** The pdf of the SAMPLED DIRECTION, not of the half-vector: the 1/(4 |wo.wh|) is the Jacobian of the reflection. */
export const sampleDirPdf = (cosH, dotOH, alpha) => D(cosH, alpha) * cosH / (4 * Math.abs(dotOH));

/**
 * The throughput multiplier for one microfacet bounce: f * cos_i / pdf, with everything that cancels cancelled
 * ANALYTICALLY rather than computed and divided out.
 *
 *     f cos_i / pdf = [D G2 F / (4 cos_o cos_i)] cos_i [4 |wo.wh| / (D cos_h)] = F G2 |wo.wh| / (cos_o cos_h)
 *
 * *** D DISAPPEARS. That is not an optimisation, it is the reason importance-sampling the NDF is worth doing --
 * and it is also why a wrong D is INVISIBLE to this weight and must be graded by the integrals in this file
 * instead. `wrongPdf` is the plant: keep the weight but sample as if the pdf were the cosine one. ***
 */
export function bounceWeight(cosO, cosI, cosH, dotOH, alpha, { F = 1, wrongPdf = false, ...o } = {}) {
    if (cosI <= 0 || cosO <= 0) return 0;
    const g2 = G2(cosO, cosI, alpha, o);
    if (wrongPdf) return F * g2 * D(cosH, alpha, o) / (4 * cosO * cosI) * cosI / (cosI / Math.PI);
    return F * g2 * Math.abs(dotOH) / (cosO * cosH);
}

/**
 * v3495 -- EVALUATE the BRDF at a direction somebody hands you: f = D G2 F / (4 cos_o cos_i).
 *
 * *** THIS IS THE FUNCTION THE RASTERISER'S RECIPE REACHES FOR, AND v3493 SAID SO -- ON ITS OWN IT GIVES A
 * HIGHLIGHT AND NO ESTIMATOR. It becomes correct the moment it is DIVIDED BY THE PDF OF THE ROUTE THAT CHOSE
 * THE DIRECTION, which is exactly what next-event estimation needs: the light picks the direction, so the BRDF
 * must be evaluated rather than sampled. Sampling and evaluation are the two halves of one BSDF and a renderer
 * doing MIS needs BOTH -- which is why they live in one file, where their D and G2 cannot drift apart. ***
 */
export function bsdfEval(cosO, cosI, cosH, alpha, { F = 1, ...o } = {}) {
    if (cosI <= 0 || cosO <= 0) return 0;
    return D(cosH, alpha, o) * G2(cosO, cosI, alpha, o) * F / (4 * cosO * cosI);
}

/**
 * The balance heuristic. v3472 proved these weights sum to 1 for the cone/cosine pair; THIS IS A DIFFERENT PAIR
 * (cone against the NDF) and the property has to hold again -- it is p_i/(p_L+p_B) summed over i, so it is one
 * BY CONSTRUCTION, and that is the only reason combining two estimators does not double-count.
 *
 * *** v4409 -- "ONE BY CONSTRUCTION" IS ALGEBRA. IN FLOATING POINT IT IS ONE TO WITHIN A BIT. *** Measured over
 * 4096 pairs: 10.8% do not sum to exactly 1 at f64 and 12.6% do not on a device, worst departure 1.0 ULP.
 * The rate is the SAME at both precisions, so this is not a precision question and porting it changes nothing
 * -- the sum rounds two quotients and adds them, and that misses by a bit wherever it runs. No weight leaves
 * [0, 1], which is the part that would actually break an estimator, and one ULP is far beneath any renderer's
 * sampling noise. The sentence above is not wrong; it is a statement about the reals.
 */
export const misWeight = (pThis, pOther) => (pThis + pOther > 0 ? pThis / (pThis + pOther) : 0);
