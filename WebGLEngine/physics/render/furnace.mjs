// WebGLEngine/physics/render/furnace.mjs -- v3467
//
// *** THE FURNACE TEST, WITH NO RENDERER AT ALL -- AND THAT IS THE POINT, NOT A LIMITATION. ***
//
// SweK has no path tracer. Checked at v3454 rather than assumed: ZERO hits across the tree for pathTrace,
// russianRoulette, nextEventEstimation, bsdfSample or importanceSample. That is why the real-time path-guiding
// paper (arXiv 2112.09728) had no consumer here -- there is nothing to reduce the variance OF.
//
// So the first piece is not a renderer. It is the ANSWER KEY a renderer would have to satisfy.
//
// ================================================================================================
// WHY THIS IS GRADEABLE WHEN AN IMAGE IS NOT
// ================================================================================================
//
// A diffuse sphere of albedo rho, enclosed by a white environment emitting unit radiance, must read EXACTLY rho
// at every point. Geometry disappears; the surface is featureless. In a furnace at equilibrium the energy
// arriving equals the energy leaving, and that is where the name comes from.
//
// AND THE VALUE IS EXACT RATHER THAN A TOLERANCE, WHICH IS WHY IT IS WORTH BUILDING FIRST. Derive it:
//
//     L = (albedo / pi) * (1/N) * sum[ Li * cos(theta_i) / pdf ],   pdf = 1 / (2 pi),  Li = 1
//       = (albedo / pi) * 2 pi * E[cos theta]
//       = 2 * albedo * E[cos theta]
//
// and for directions distributed uniformly with respect to SOLID ANGLE, E[cos theta] = 1/2 exactly. So L =
// albedo. *** NOTHING IN THE ESTIMATOR IS TOLD THE ANSWER: the albedo enters as a scale, and the 1/2 comes out
// of the sampling. A wrong sampler still produces a beautiful smooth sphere -- of the wrong brightness. ***
//
// ================================================================================================
// THE THREE CLASSIC ERRORS, AND EACH IS WRONG BY A DIFFERENT PREDICTABLE FACTOR
// ================================================================================================
//
//     forget to divide by the PDF   ->  L = albedo / (2 pi)      a factor of 2 pi TOO DARK
//     forget the cosine term        ->  L = 2 * albedo           EXACTLY TWICE too bright
//     sample theta uniformly        ->  L = (4/pi) * albedo      too bright by 4/pi = 1.2732
//
// *** THAT LAST ONE IS THE DANGEROUS ONE AND IT IS WHY THIS FILE EXISTS. Sampling theta uniformly in [0, pi/2]
// LOOKS like uniform sampling, produces a perfectly smooth image, and is wrong by 27%. The other two are off by
// 6.28x and 2x and somebody would notice. A 27% error just looks like a slightly different material. ***
//
// Each factor is a PREDICTION with no free parameter, so the three faults are told apart BY THEIR RATIO rather
// than by a threshold -- v3201's rule, in rendering.
"use strict";

/** Deterministic LCG. Math.random would make every number here unreproducible and the gate unfalsifiable. */
export function rng(seed = 12345) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * A direction in the hemisphere, uniform WITH RESPECT TO SOLID ANGLE.
 *
 * r1 IS cos(theta) directly, which is not a shortcut but the result of inverting the CDF: p(theta) = sin theta,
 * so P(theta) = 1 - cos theta, and inverting gives cos theta = 1 - u. Since u is uniform on [0,1], so is 1 - u.
 * *** THE WHOLE CORRECTNESS OF THIS FILE SITS IN THAT ONE LINE: y = r1 rather than y = cos(r1 * pi/2). ***
 */
export function uniformSampleHemisphere(r1, r2) {
    const sinTheta = Math.sqrt(Math.max(0, 1 - r1 * r1));
    const phi = 2 * Math.PI * r2;
    return [sinTheta * Math.cos(phi), r1, sinTheta * Math.sin(phi)];
}

/** The wrong sampler, kept as a NAMED PLANT rather than a comment, so the gate can drive it. */
export function uniformThetaHemisphere(r1, r2) {
    const theta = r1 * Math.PI / 2, phi = 2 * Math.PI * r2;
    return [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
}


/**
 * COSINE-WEIGHTED sampling: directions drawn in proportion to cos(theta), which is the very term the rendering
 * equation multiplies by. Malley's method -- a uniform point on the unit disc, lifted to the hemisphere.
 *
 * *** THE PDF IS cos(theta)/pi, SO THE COSINE CANCELS AGAINST IT EXACTLY AND THE ESTIMATOR STOPS CARRYING A
 * COSINE AT ALL. That cancellation is the whole reason to do this, and it is also the trap: an implementation
 * that importance-samples AND still multiplies by cos(theta) is wrong by a factor of E[cos theta] = 2/3 under
 * this distribution -- 0.667, which is a plausible-looking darkening rather than an obvious break. ***
 */
export function cosineSampleHemisphere(r1, r2) {
    const r = Math.sqrt(r1), phi = 2 * Math.PI * r2;
    return [r * Math.cos(phi), Math.sqrt(Math.max(0, 1 - r1)), r * Math.sin(phi)];
}
export const cosinePdf = (cos) => cos / Math.PI;

/**
 * A local frame with N as the up axis.
 *
 * The branch on |N.x| > |N.y| is NOT stylistic: the other construction divides by sqrt(Nx^2 + Nz^2), which goes
 * to zero as N approaches the pole, and a tangent built there is numerical noise pointing anywhere.
 */
export function createCoordinateSystem(N) {
    let Nt;
    if (Math.abs(N[0]) > Math.abs(N[1])) {
        const inv = 1 / Math.hypot(N[0], N[2]);
        Nt = [N[2] * inv, 0, -N[0] * inv];
    } else {
        const inv = 1 / Math.hypot(N[1], N[2]);
        Nt = [0, -N[2] * inv, N[1] * inv];
    }
    const Nb = [N[1] * Nt[2] - N[2] * Nt[1], N[2] * Nt[0] - N[0] * Nt[2], N[0] * Nt[1] - N[1] * Nt[0]];
    return { Nt, Nb };
}

export const toWorld = (s, N, Nt, Nb) => [
    s[0] * Nb[0] + s[1] * N[0] + s[2] * Nt[0],
    s[0] * Nb[1] + s[1] * N[1] + s[2] * Nt[1],
    s[0] * Nb[2] + s[1] * N[2] + s[2] * Nt[2],
];

/**
 * The estimator. `faults` names what to break -- the plants are PARAMETERS, not edits, so a planted run and a
 * clean run are the SAME CODE PATH and a difference cannot be an accident of which copy was executed.
 */
export function furnace(albedo, samples, {
    seed = 1, N = [0, 1, 0], radiance = () => 1,
    noPdf = false, noCosine = false, badSampler = false,
    // v3468 -- "cosine" importance-samples. A STRATEGY, NOT A SEPARATE FUNCTION: the two must share one
    // estimator or a difference between them could be a difference between two bodies of code rather than
    // between two samplings, and the whole claim here is that THE ANSWER DOES NOT MOVE.
    strategy = "uniform", wrongPdf = false,
} = {}) {
    const rand = rng(seed);
    const { Nt, Nb } = createCoordinateSystem(N);
    const cosineWeighted = strategy === "cosine";
    const sampler = badSampler ? uniformThetaHemisphere : cosineWeighted ? cosineSampleHemisphere : uniformSampleHemisphere;
    let sum = 0;
    for (let i = 0; i < samples; i++) {
        const r1 = rand(), r2 = rand();
        const s = sampler(r1, r2);
        const dir = toWorld(s, N, Nt, Nb);
        // The cosine is read from the DIRECTION, never from r1: with the bad sampler r1 is not cos(theta), and
        // taking the shortcut would hide half the fault by making the estimator self-consistent.
        const cos = Math.max(0, dir[0] * N[0] + dir[1] * N[1] + dir[2] * N[2]);
        // *** THE CANCELLATION RUNS THE OTHER WAY AND I WROTE IT BACKWARDS FIRST. The cosine is STILL multiplied
        // in; what cancels it is DIVIDING BY A PDF THAT IS PROPORTIONAL TO IT. Skipping the multiply instead
        // divides by cos with nothing to cancel, and the furnace read 2x albedo on the first run -- caught by
        // the key in one measurement, which is the argument for building the key before the renderer. ***
        //
        // `wrongPdf` is the real trap named as a parameter: change the sampler, forget the pdf. It is the
        // commonest importance-sampling bug there is, and it predicts 4/3.
        const pdf = (cosineWeighted && !wrongPdf) ? cosinePdf(cos) : 1 / (2 * Math.PI);
        let contrib = radiance(dir);
        if (!noCosine) contrib *= cos;
        if (!noPdf) contrib /= (pdf || Number.MIN_VALUE);
        sum += contrib;
    }
    return (albedo / Math.PI) * (sum / samples);
}

/** What each fault predicts, as a MULTIPLE of the albedo. No free parameters. */
export const EXPECTED = { clean: 1, noPdf: 1 / (2 * Math.PI), noCosine: 2, badSampler: 4 / Math.PI };
// Cosine-weighted: the answer is UNCHANGED (that is the point) and the classic bug predicts 4/3, because
// E[cos theta] under a cosine-weighted distribution is 2/3 and the uniform pdf leaves a factor of 2 behind.
export const EXPECTED_COSINE = { clean: 1, wrongPdf: 4 / 3 };
