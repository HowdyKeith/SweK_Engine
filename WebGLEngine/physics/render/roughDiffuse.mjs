// WebGLEngine/physics/render/roughDiffuse.mjs -- v4275
//
// A DIFFUSE LOBE THAT KNOWS ABOUT ROUGHNESS, WHICH THIS TREE'S DID NOT.
//
// ---- WHAT WAS ALREADY HERE, MEASURED BEFORE ANYTHING WAS WRITTEN ------------------------------------------------
//
// The SPECULAR side of this renderer is serious. physics/render/microfacet.mjs has the GGX distribution, Smith
// Lambda, G1 and G2, a furnace integral, directional albedo, half-vector sampling and MIS weights.
// physics/render/energyCompensation.mjs builds directional-albedo tables and adds the multiple-scattering lobe
// that single-scattering GGX loses. physics/render/furnace.mjs is a white-furnace harness with named failure
// modes. Nine files mention GGX; thirty-one touch path tracing.
//
// *** AND THE DIFFUSE SIDE IS albedo / PI. *** Lambert. Zero files in this tree mention Oren-Nayar. So a rough
// surface and a polished one scatter light identically in the diffuse lobe, which is the one place roughness
// obviously ought to matter, and the elaborate energy-compensation machinery next door applies to neither.
//
// ---- *** WHAT THIS IS AND, MORE IMPORTANTLY, WHAT IT IS NOT *** --------------------------------------------------
//
// The round was suggested by portsmouth/EON-diffuse -- "EON" being an energy-preserving Oren-Nayar. *** THIS IS
// NOT THAT, AND CALLING IT THAT WOULD BE A CLAIM I HAVE NOT CHECKED. *** Its analytic fit was not consulted:
// what is below was derived here, and nothing in it came from that repository.
//
// *** THE REASON GIVEN FOR THAT AT v4275 WAS WRONG, AND v4276 CORRECTED IT. *** That round said "this session
// has no network" and filed the repository as unreachable. It was never tested. The proxy gates GitHub per
// repository and anonymous git reads of public repositories work; EON-diffuse was clonable the whole time and
// is MIT (world/licenceSweep.mjs holds the licence file's hash and line count). So the refusal to copy its
// model stands on its own merits -- the fit was not read, so it is not claimed -- and NOT on a claim about
// what this machine could reach.
//
// What is implemented here is:
//
//   1. OREN-NAYAR'S PUBLISHED QUALITATIVE MODEL (1994), the widely-restated A/B form. Textbook material, older
//      than any repository, and needing nobody's source.
//   2. AN ENERGY COMPENSATION MEASURED BY THIS TREE'S OWN FURNACE MACHINERY rather than taken from a paper's
//      fit. The loss is integrated here, tabulated here, and the correction is whatever makes the white furnace
//      read 1. That is a weaker result than a closed-form fit and an honest one: every number in it was
//      produced by code in this repository.
//
// So the IDEA travels -- rough diffuse loses energy and the loss should be put back -- exactly as v4247 took
// Ramotion's gaze-dwell interaction without its code. The specific published fit does not, because it was not
// read.
"use strict";

/** Oren-Nayar's roughness parameter is a slope standard deviation in RADIANS. sigma = 0 is Lambert exactly. */
export const SIGMA_MAX = Math.PI / 2;

/**
 * The A and B coefficients of the standard Oren-Nayar approximation.
 *
 * Kept as their own function because they are the part a reader will want to check against the paper, and
 * because the gate asserts A + B behaviour at the two ends rather than trusting the algebra was typed right.
 */
export function orenNayarAB(sigma) {
    const s2 = sigma * sigma;
    return { A: 1 - 0.5 * s2 / (s2 + 0.33), B: 0.45 * s2 / (s2 + 0.09) };
}

/**
 * The uncompensated Oren-Nayar BRDF value, WITHOUT the albedo/PI factor.
 *
 * Angles are given as direction cosines plus the azimuth difference, which is what a path tracer has to hand.
 * *** AT sigma = 0 THIS MUST RETURN EXACTLY 1, *** so the lobe reduces to Lambert with no special case and no
 * epsilon -- a model that only approximately reduces to the thing it generalises is the kind of error that
 * hides inside a tolerance for years.
 */
export function orenNayarFactor(cosI, cosO, cosPhiDiff, sigma) {
    const { A, B } = orenNayarAB(sigma);
    if (B === 0) return A;
    const thetaI = Math.acos(Math.max(-1, Math.min(1, cosI)));
    const thetaO = Math.acos(Math.max(-1, Math.min(1, cosO)));
    const alpha = Math.max(thetaI, thetaO), beta = Math.min(thetaI, thetaO);
    return A + B * Math.max(0, cosPhiDiff) * Math.sin(alpha) * Math.tan(beta);
}

/** The BRDF itself: albedo/PI times the factor. Reciprocal by construction -- the factor is symmetric in i/o. */
export function orenNayarBrdf(albedo, cosI, cosO, cosPhiDiff, sigma) {
    return (albedo / Math.PI) * orenNayarFactor(cosI, cosO, cosPhiDiff, sigma);
}

/**
 * Directional albedo: the fraction of light leaving, for one incoming direction, integrated over the hemisphere.
 *
 * *** THIS IS THE MEASUREMENT THE COMPENSATION IS BUILT FROM, SO IT IS DONE HERE AND NOT QUOTED. *** Integration
 * is a deterministic double sum over (theta, phi) rather than Monte Carlo, because a table built from noise
 * makes the compensated furnace test read "1 plus noise" and there is then no way to tell a real 0.5% loss from
 * the sampler.
 */
export function directionalAlbedo(cosO, sigma, { N = 128, M = 64 } = {}) {
    let sum = 0;
    for (let i = 0; i < N; i++) {
        const thetaI = (i + 0.5) / N * (Math.PI / 2);
        const cosI = Math.cos(thetaI), sinI = Math.sin(thetaI);
        let phiSum = 0;
        for (let j = 0; j < M; j++) {
            const phi = (j + 0.5) / M * 2 * Math.PI;
            phiSum += orenNayarFactor(cosI, cosO, Math.cos(phi), sigma);
        }
        // integrand: f * cos(thetaI) * sin(thetaI) dTheta dPhi, with albedo/PI folded in as 1/PI
        sum += (phiSum / M) * (2 * Math.PI) * cosI * sinI * ((Math.PI / 2) / N);
    }
    return sum / Math.PI;
}

/**
 * A compensation table over cos(theta_o), for one roughness.
 *
 * `scale[k]` is what the lobe must be multiplied by so that a white surface (albedo 1) returns all its light.
 * Shaped like physics/render/energyCompensation.mjs's buildTable so the two read alike at a call site, because
 * a second energy table with a different shape is how a renderer ends up with two ideas of what energy means.
 */
export function buildDiffuseTable(sigma, { K = 33, N = 96, M = 48 } = {}) {
    const scale = new Float64Array(K), albedo = new Float64Array(K);
    for (let k = 0; k < K; k++) {
        const mu = (k + 0.5) / K;
        const E = directionalAlbedo(mu, sigma, { N, M });
        albedo[k] = E;
        scale[k] = E > 0 ? 1 / E : 1;
    }
    return { sigma, K, albedo, scale };
}

/** Linear lookup in a table built above. Clamped, because a path tracer will hand it mu exactly 0 and 1. */
export function compensationAt(T, mu) {
    const x = Math.max(0, Math.min(1, mu)) * T.K - 0.5;
    const i = Math.max(0, Math.min(T.K - 2, Math.floor(x))), t = Math.max(0, Math.min(1, x - i));
    return T.scale[i] * (1 - t) + T.scale[i + 1] * t;
}

/** The compensated lobe. With a table for its own sigma, a white surface conserves energy to the table's accuracy. */
export function roughDiffuseBrdf(albedo, cosI, cosO, cosPhiDiff, sigma, table = null) {
    const base = orenNayarBrdf(albedo, cosI, cosO, cosPhiDiff, sigma);
    return table ? base * compensationAt(table, cosO) : base;
}

/**
 * How much energy plain Oren-Nayar loses at a given roughness, as a fraction, averaged over the hemisphere.
 *
 * Exported so the gate can state the motivation as a NUMBER rather than as "rough diffuse loses energy".
 */
export function energyLoss(sigma, { K = 17, N = 96, M = 48 } = {}) {
    let worst = 0, sum = 0;
    for (let k = 0; k < K; k++) {
        const mu = (k + 0.5) / K;
        const E = directionalAlbedo(mu, sigma, { N, M });
        const loss = 1 - E;
        sum += loss;
        if (Math.abs(loss) > Math.abs(worst)) worst = loss;
    }
    return { mean: sum / K, worst };
}
