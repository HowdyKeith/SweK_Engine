// WebGLEngine/physics/render/nee.mjs -- v3472
//
// *** NEXT-EVENT ESTIMATION: SAMPLE THE LIGHT INSTEAD OF HOPING TO HIT IT -- AND THE KEY IS THE EXACT
// COMPLEMENT OF v3469'S. ***
//
// A sphere light of radius r whose centre is at distance d along the normal subtends a cap of half-angle
// alpha = asin(r/d). v3469 established that a cap removes exactly pi sin^2(alpha) from an integral totalling
// pi. So the SAME cap, now emitting rather than blocking, contributes exactly what it took away:
//
//     L_direct = rho * Le * (r/d)^2
//
// *** WHICH GIVES A STRUCTURAL IDENTITY ACROSS THREE ROUNDS: at Le = 1, the direct term from the light PLUS the
// occluded furnace with the same sphere as a blocker EQUALS the plain unoccluded furnace, exactly. Blocked and
// emitting are the same solid angle wearing different clothes, and if the two rounds disagreed one of them
// would be wrong. ***
//
// ================================================================================================
// UNIFORM SAMPLING OF A CONE, AND THE PDF THAT MAKES IT UNBIASED
// ================================================================================================
//
// Sampling directions uniformly by SOLID ANGLE inside the cone gives pdf = 1 / (2 pi (1 - cos alpha)), and
//
//     E[cos theta] over that cone = (1 + cos alpha) / 2,
//     so   (rho/pi) * Le * 2 pi (1 - cos a) * (1 + cos a)/2  =  rho Le (1 - cos^2 a)  =  rho Le sin^2 a.
//
// *** THE FAULT WORTH PLANTING IS USING THE HEMISPHERE PDF 1/(2 pi) WITH THE CONE SAMPLER -- the same
// changed-the-sampler-forgot-the-pdf mistake v3468 measured, in a place where it is far worse: it predicts
// rho Le (1 + cos alpha), which for a small light is ENORMOUSLY too bright, by 1/(1 - cos alpha). A distant
// light makes the error bigger, so the brighter the bug looks the further away the light is. ***
"use strict";

export const capHalfAngle = (r, d) => Math.asin(Math.min(1, r / d));

/** A direction inside a cone of half-angle alpha about +y, uniform in SOLID ANGLE. */
export function sampleCone(r1, r2, cosAlpha) {
    const cosT = 1 - r1 * (1 - cosAlpha);          // uniform in cos(theta) over [cosAlpha, 1]
    const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
    const phi = 2 * Math.PI * r2;
    return [sinT * Math.cos(phi), cosT, sinT * Math.sin(phi)];
}
export const conePdf = (cosAlpha) => 1 / (2 * Math.PI * (1 - cosAlpha));

/** What the direct term must come to. Nothing in the estimator is told this. */
export const directExact = (rho, Le, r, d) => rho * Le * (r / d) * (r / d);

/**
 * The direct term by sampling the LIGHT (next-event estimation).
 * `wrongPdf` uses the hemisphere pdf with the cone sampler -- the classic bug, as a parameter.
 */
export function directNEE(rho, Le, r, d, samples, { seed = 1, rng, wrongPdf = false } = {}) {
    const rand = rng(seed);
    const cosA = Math.cos(capHalfAngle(r, d));
    const pdf = wrongPdf ? 1 / (2 * Math.PI) : conePdf(cosA);
    let sum = 0;
    for (let i = 0; i < samples; i++) sum += Le * sampleCone(rand(), rand(), cosA)[1] / pdf;
    return (rho / Math.PI) * (sum / samples);
}

/**
 * The same term by sampling the BSDF instead -- cosine-weighted over the hemisphere, counting only the
 * directions that happen to land on the light. Correct, and much noisier for a small light.
 */
export function directBSDF(rho, Le, r, d, samples, { seed = 1, rng, sampler } = {}) {
    const rand = rng(seed);
    const cosA = Math.cos(capHalfAngle(r, d));
    let sum = 0;
    for (let i = 0; i < samples; i++) {
        const s = sampler(rand(), rand());
        if (s[1] >= cosA) sum += Le;               // cosine-weighted: cosine and pdf cancel
    }
    return rho * (sum / samples);
}

/**
 * MULTIPLE IMPORTANCE SAMPLING, balance heuristic. The weights are w_i = p_i / (p_light + p_bsdf).
 *
 * *** THEY SUM TO EXACTLY ONE FOR EVERY DIRECTION BY CONSTRUCTION, AND THAT IS AN INVARIANCE RATHER THAN A
 * TOLERANCE -- which is the only reason combining two estimators does not double-count. ***
 */
export const misWeights = (pLight, pBsdf) => {
    const t = pLight + pBsdf;
    return t > 0 ? [pLight / t, pBsdf / t] : [0, 0];
};

/**
 * The combined estimator, ONE SAMPLE PER STRATEGY PER ITERATION.
 *
 *     F = SUM_i  w_i(x_i) * f(x_i) / p_i(x_i)
 *
 * with f(w) = (rho/pi) Le cos(theta) restricted to the cone. Written out from the balance heuristic rather than
 * assembled by inspection -- my first attempt multiplied by pi and divided by it again in three places and was
 * numerology, not a derivation.
 */
export function directMIS(rho, Le, r, d, samples, { seed = 1, rng, sampler } = {}) {
    const rand = rng(seed);
    const cosA = Math.cos(capHalfAngle(r, d));
    const pL = conePdf(cosA);
    const f = (cos) => (rho / Math.PI) * Le * cos;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
        // strategy 1: sample the light. Always inside the cone by construction.
        const cl = sampleCone(rand(), rand(), cosA)[1];
        sum += misWeights(pL, cl / Math.PI)[0] * f(cl) / pL;
        // strategy 2: sample the BSDF. Contributes only when it happens to land on the light.
        const cb = sampler(rand(), rand())[1];
        if (cb >= cosA) sum += misWeights(pL, cb / Math.PI)[1] * f(cb) / (cb / Math.PI);
    }
    return sum / samples;
}
