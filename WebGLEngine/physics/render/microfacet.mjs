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

/* ---------------------------------------------------------------------------------------------------------
 * v4412 -- ANISOTROPY, WHICH IS THE PARAMETER EVERY KEY IN THIS FILE HAS BEEN AVERAGING OVER
 *
 * D above takes a COSINE. That is not a simplification, it is the isotropic assumption written into a
 * signature: a lobe that depends only on the angle from the normal cannot know which way the surface is
 * brushed. A real anisotropic GGX takes the whole microfacet direction in a TANGENT FRAME.
 *
 *     D(m) = 1 / (pi ax ay ((m.x/ax)^2 + (m.z/ay)^2 + m.y^2)^2)        y up, x tangent, z bitangent
 *
 * *** AND IT BRINGS A KEY THAT DOES NOT EXIST IN THE ISOTROPIC CASE. *** Rotating the tangent frame by 90
 * degrees about the normal and swapping ax with ay must leave the lobe unchanged -- it is the same surface
 * described from a frame turned a quarter turn. Measured BIT-EXACT, not to a tolerance, because the two
 * expressions are the same arithmetic with two arguments exchanged.
 *
 * The isotropic forms above are kept rather than replaced: they are what render/microfacetShader.js ships in
 * GLSL and what v4408 graded on a device, and a signature change there would have moved four rounds of
 * measurements. The gate proves the general form CONTAINS them, which is the honest relationship.
 * ------------------------------------------------------------------------------------------------------- */

/**
 * Anisotropic GGX / Trowbridge-Reitz. `m` is a unit microfacet normal in the tangent frame (y up).
 *
 * WRITTEN AS A SUM OF POSITIVES, for v3494's reason and with v4408's finding in view: (m.x/ax)^2 + (m.z/ay)^2
 * + m.y^2 has nothing that cancels, where the textbook cos^2(a^2 - 1) + 1 does. That mattered at binary32 in
 * the isotropic case and it matters more here, because the tangential terms are divided by roughnesses that
 * can be small.
 */
export function Daniso(m, ax, ay) {
    if (m[1] <= 0) return 0;
    const tx = m[0] / ax, tz = m[2] / ay;
    const t = tx * tx + tz * tz + m[1] * m[1];
    // *** THE PARENTHESES ARE THE SWAP IDENTITY. *** Multiplication is COMMUTATIVE but not ASSOCIATIVE, so
    // (PI ax) ay and (PI ay) ax differ by a rounding -- and that rounding is the whole difference between an
    // exact key and a one-ULP one. Grouped this way the only operation asked to commute is ax * ay, which
    // does, and D(m; ax, ay) == D(rot90 m; ay, ax) BIT FOR BIT: 216 of 216 sampled directions against 170
    // ungrouped. v3494 re-associated to avoid a cancellation; this re-associates to preserve an exactness.
    return 1 / (Math.PI * (ax * ay) * (t * t));
}

/**
 * The Smith auxiliary for anisotropic GGX. The roughness a direction sees is its own azimuthal blend of ax
 * and ay, and writing it this way -- (ax w.x)^2 + (ay w.z)^2 over w.y^2 -- keeps that implicit rather than
 * computing an angle and a cos^2/sin^2 pair, which would introduce a second place for the frame to be wrong.
 */
export function lambdaAniso(w, ax, ay) {
    const c2 = w[1] * w[1];
    if (c2 >= 1) return 0;
    const tx = ax * w[0], tz = ay * w[2];
    return (-1 + Math.sqrt(1 + (tx * tx + tz * tz) / c2)) / 2;
}

export const G1aniso = (w, ax, ay) => 1 / (1 + lambdaAniso(w, ax, ay));
/** Height-correlated Smith, as G2 above. `separable` is the other legitimate choice, not a plant. */
export const G2aniso = (wo, wi, ax, ay, { separable = false } = {}) =>
    separable ? G1aniso(wo, ax, ay) * G1aniso(wi, ax, ay)
              : 1 / (1 + lambdaAniso(wo, ax, ay) + lambdaAniso(wi, ax, ay));

/** f cos_i / pdf under anisotropic visible-normal sampling: G2 / G1(wo), unchanged in form from v4410. */
export function visibleBounceWeightAniso(wo, wi, ax, ay, { F = 1, ...o } = {}) {
    if (wi[1] <= 0 || wo[1] <= 0) return 0;
    return F * G2aniso(wo, wi, ax, ay, o) / G1aniso(wo, ax, ay);
}

/** The direction pdf under anisotropic visible-normal sampling. */
export const visibleNormalDirPdfAniso = (wo, wh, ax, ay) => G1aniso(wo, ax, ay) * Daniso(wh, ax, ay) / (4 * wo[1]);

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
// ---- *** THE GRID'S DOMAIN OF VALIDITY, AND IT WAS ACCIDENTAL SAFETY UNTIL v4439. *** -------------------
//
// v4437 found this integrator's default grid wrong by 3x for a narrow lobe at a grazing view; v4438 found the
// baked energy table a quarter wrong at an alpha its own gates build at, and repaired THAT CALLER. v4439
// audited the rest and the result is worth stating exactly, because two of three came back clean:
//
//   roughDiffuse's table (N=96)      CLEAN -- worst 0.036%. Oren-Nayar has no narrow lobe; the grid is the
//                                    right instrument there, and finding a defect nearby is not evidence for
//                                    one here.
//   ndfIntegral (N=4000)             CLEAN -- 3.2e-5 at alpha 0.02, 5.1e-4 at an extreme 0.005.
//   furnaceIntegral (N=500, M=500)   STILL WRONG: 50% at alpha 0.02 / cosO 0.0208, 6.9% at alpha 0.05.
//
// *** AND NOTHING WAS BREAKING ONLY BECAUSE NO CALLER GOES BELOW cosO 0.2. *** Every gate's shallowest angle
// is 0.2, where N=500 is fine. That is luck, not a design, and the next caller to ask for a grazing angle
// would have got a silently wrong number. So the guard moves INTO the integrator: it routes to the sampler in
// the domain where marching a grid cannot work, and every caller gets it rather than the one that was patched.
//
// The sampler needs no import -- sampleHalfVector and bounceWeight are in this file, which is exactly why
// they belong in one file. A plant KEEPS THE GRID: a plant is a deliberate corruption of the grid, and routing
// one through the sampler would silently disarm every gate that plants one (v4438 learned that from a
// sabotage that read zero red).
export const GRID_NARROW_ALPHA = 0.3;
export const GRID_OBLIQUE_COS = 0.35;
export const gridUnsafeFor = (alpha, cosO) => alpha < GRID_NARROW_ALPHA && cosO < GRID_OBLIQUE_COS;

/** The albedo by drawing from the lobe. Deterministic seed, and escaped draws counted rather than dropped. */
export function sampledFurnace(alpha, cosO, { n = 60000, seed = 1 } = {}) {
    let a = seed | 0;
    const rand = () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const sinO = Math.sqrt(Math.max(0, 1 - cosO * cosO));
    const wo = [sinO, cosO, 0];
    let sum = 0, escaped = 0;
    for (let k = 0; k < n; k++) {
        const h = sampleHalfVector(rand(), rand(), alpha);
        const dot = wo[0] * h[0] + wo[1] * h[1] + wo[2] * h[2];
        if (dot <= 0) { escaped++; continue; }
        const cosI = 2 * dot * h[1] - wo[1];
        if (cosI <= 0) { escaped++; continue; }
        sum += bounceWeight(cosO, cosI, h[1], dot, alpha);
    }
    return { value: sum / n, n, escaped };
}

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

/**
 * Directional albedo BY QUADRATURE: how much of the arriving light a white, non-absorbing GGX surface sends back.
 *
 * *** v4411 MEASURED WHAT THIS INSTRUMENT CANNOT RESOLVE, AND THE NUMBERS ARE THE REASON THE ROUTING EXISTS. ***
 * A 500x500 grid reads 0.512 at roughness 0.001 where the answer is 0.999999, and a 220x220 grid -- what
 * buildTable used to ask for -- reads 0.145. The failure is confined to alpha below about 0.01 and is TOTAL
 * there. Kept here because v4439's decision below is only defensible against a measured domain.
 */
/** Directional albedo: how much of the arriving light a white, non-absorbing GGX surface actually sends back. */
// *** THE GUARD IS DELIBERATELY *NOT* HERE, AND A GATE THAT ALREADY EXISTED IS THE REASON. ***
// v4439 first put the routing INSIDE this function so every caller would get the right number without asking.
// It went red on physics/render/renderBsdf-selfcheck.mjs, whose headline row reads: "PATH SAMPLING AND
// MIDPOINT QUADRATURE AGREE ON THE DIRECTIONAL ALBEDO TO BETTER THAN 0.3% -- THE TWO ROUTES SHARE ONLY THE
// DEFINITIONS OF D AND G2." *** THAT GATE'S ENTIRE VALUE IS THAT THE TWO ESTIMATORS ARE INDEPENDENT, AND THE
// GUARD WOULD HAVE MADE THE QUADRATURE SIDE INTO THE SAMPLER -- comparing the sampler to itself. *** A version
// that PASSED would have been worthless, which is the defect this session keeps finding, nearly built into
// the fix for it. So directionalAlbedo stays exactly what it says it is: a marched grid, deterministic, and
// independent of the sampler. The routing lives in physics/render/albedoEstimator.mjs where a caller CHOOSES
// it, and physics/render/albedoEstimator-selfcheck.mjs asserts that no caller in this tree marches the grid
// inside the domain where it cannot work -- which makes the safety explicit instead of accidental.
export const directionalAlbedo = (alpha, cosO, o = {}) => furnaceIntegral(alpha, cosO, { ...o, strong: true });

/**
 * v4411 -- Directional albedo BY VISIBLE-NORMAL SAMPLING, which is grid-free and therefore has no lobe it
 * cannot resolve. Same quantity, 3.4e-5 at every roughness from 0.0005 to 1, and 4096 evaluations against the
 * quadrature's 48,400.
 *
 * The sample points are a Hammersley set from a SIXTEEN-BIT van der Corput inverse -- v4410's construction and
 * for its reason: 2^16 is under 2^24, so f32() of the integer is exact on any conformant device, and 65536 is
 * a power of two, so a port of this reproduces the CPU's sample set rather than approximating it.
 */
export function directionalAlbedoSampled(alpha, cosO, { samples = 4096, ...o } = {}) {
    const so = Math.sqrt(Math.max(0, 1 - cosO * cosO)), wo = [so, cosO, 0];
    let s = 0;
    for (let i = 0; i < samples; i++) {
        const wh = sampleVisibleNormal(wo, alpha, (i + 0.5) / samples, vanDerCorput16(i) / 65536, o);
        const d = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
        const cosI = 2 * d * wh[1] - wo[1];
        if (cosI > 0) s += visibleBounceWeight(cosO, cosI, alpha, o);
    }
    return s / samples;
}

/**
 * v4416 -- THE SAME ESTIMATOR WITH A REAL FRESNEL TERM, AND THE TRANSMITTED SHARE ACCUMULATED ALONGSIDE IT.
 *
 * `Fof` is called with dot(wo, wh) -- the angle AT THE MICROFACET, which is what Fresnel is a function of and
 * is NOT the angle to the macroscopic normal. Passing cos_o there is a real and popular bug; it is invisible
 * at normal incidence and at every roughness below about 0.1, because the two angles coincide in the limit.
 *
 * *** THE COMPLEMENT IS THE POINT. *** Under visible-normal sampling the reflected estimator is F * G2/G1(wo),
 * so (1 - F) * G2/G1(wo) is the light that went THROUGH the interface rather than being lost, and the two sum
 * to the F = 1 albedo sample for sample. That is what makes a Fresnel deficit DISTINGUISHABLE from a masking
 * deficit: fresnel-selfcheck.mjs's "R + T = 1 is worthless if T is defined as 1 - R", lifted from one
 * interface to a whole lobe. With Fof = null this returns exactly directionalAlbedoSampled with T = 0.
 */
export function directionalAlbedoSplit(alpha, cosO, Fof = null, { samples = 4096, ...o } = {}) {
    const so = Math.sqrt(Math.max(0, 1 - cosO * cosO)), wo = [so, cosO, 0];
    let R = 0, T = 0, one = 0;
    for (let i = 0; i < samples; i++) {
        const wh = sampleVisibleNormal(wo, alpha, (i + 0.5) / samples, vanDerCorput16(i) / 65536, o);
        const d = wo[0] * wh[0] + wo[1] * wh[1] + wo[2] * wh[2];
        const cosI = 2 * d * wh[1] - wo[1];
        if (cosI <= 0) continue;
        const w = visibleBounceWeight(cosO, cosI, alpha, o);
        const F = Fof ? Fof(Math.min(1, Math.max(0, d))) : 1;
        R += F * w; T += (1 - F) * w; one += w;
    }
    return { E: R / samples, T: T / samples, one: one / samples };
}

/** Bit reversal of the low sixteen bits. Integer throughout, so it is exact wherever it runs. */
export function vanDerCorput16(i) {
    let b = i & 0xffff;
    b = ((b & 0x00ff) << 8) | ((b & 0xff00) >>> 8);
    b = ((b & 0x0f0f) << 4) | ((b & 0xf0f0) >>> 4);
    b = ((b & 0x3333) << 2) | ((b & 0xcccc) >>> 2);
    b = ((b & 0x5555) << 1) | ((b & 0xaaaa) >>> 1);
    return b & 0xffff;
}

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

/* ---------------------------------------------------------------------------------------------------------
 * v4410 -- THE VISIBLE-NORMAL SAMPLER, WHICH IS WHAT A MODERN TRACER ACTUALLY USES
 *
 * *** sampleHalfVector ABOVE DRAWS FROM D. THAT IS THE WRONG DISTRIBUTION AND HAS BEEN SINCE 2014. *** It
 * samples microfacets by how MANY there are, not by how many the viewer can SEE, so at grazing angles it keeps
 * proposing facets that face away from wo -- 444 of 4096 at roughness 0.25 and cos_o 0.3, 1432 of 4096 at
 * roughness 1 -- and every one of them is a sample whose weight is zero. Heitz's sampler draws from
 *
 *     D_visible(wh) = G1(wo) max(0, wo.wh) D(wh) / cos_o
 *
 * which is a normalised distribution over the hemisphere at EVERY view angle, and it proposes a backfacing
 * facet exactly never.
 *
 * *** AND THE WEIGHT COLLAPSES FURTHER THAN v4409's DID: f cos_i / pdf = G2 / G1(wo). *** No D, no |wo.wh|, no
 * cos_h -- the entire lobe cancels and what is left is the masking-shadowing ratio. That is the reason to do
 * it, and it is an algebraic identity with no free parameter, so it can be checked pointwise.
 * ------------------------------------------------------------------------------------------------------- */

/**
 * Heitz 2018 (JCGT 7:4), "Sampling the GGX Distribution of Visible Normals", listing 3, isotropic.
 *
 * *** WRITTEN IN THE PAPER'S OWN Z-UP FRAME SO IT CAN BE READ AGAINST THE PAPER LINE FOR LINE, with ONE named
 * swap at each end. *** This file is y-up (sampleHalfVector's own comment says so). A transcription that
 * silently reorders axes is unreadable against its source and is exactly the class of error v4409's section 7
 * found this arc could not see; here the swap is a single involution and the gate proves it is one.
 *
 * `noWarp` and `noDegenerate` are the listing's two traps, as options rather than as a second copy:
 *   noWarp        drops the section-4.2 reparameterisation. STILL PROPOSES NO BACKFACING FACET -- so the cheap
 *                 structural check passes -- while the distribution is wrong by up to 35%.
 *   noDegenerate  drops the lensq == 0 special case. Returns NaN when wo is along the normal, which is not an
 *                 exotic direction: it is the centre of every flat surface facing the camera.
 */
export function sampleVisibleNormal(wo, alpha, u1, u2, { noWarp = false, noDegenerate = false, alphaY = alpha } = {}) {
    // v4412 -- alphaY defaults to alpha, so every v4410 caller is unchanged. Heitz's listing was ALWAYS
    // anisotropic; v4410 used the special case, and the two roughnesses enter at exactly the two places the
    // paper puts them -- the 3.2 stretch and the 3.4 unstretch.
    const Ve = [wo[0], wo[2], wo[1]];                       // y-up -> the paper's z-up. Named swap, one of two.
    const V0 = [alpha * Ve[0], alphaY * Ve[1], Ve[2]];      // 3.2: stretch into the hemisphere configuration
    const vl = Math.hypot(V0[0], V0[1], V0[2]), Vh = [V0[0] / vl, V0[1] / vl, V0[2] / vl];
    const lensq = Vh[0] * Vh[0] + Vh[1] * Vh[1];            // 4.1: an orthonormal basis about Vh
    const T1 = (lensq > 0 || noDegenerate)
        ? [-Vh[1] / Math.sqrt(lensq), Vh[0] / Math.sqrt(lensq), 0] : [1, 0, 0];
    const T2 = [Vh[1] * T1[2] - Vh[2] * T1[1], Vh[2] * T1[0] - Vh[0] * T1[2], Vh[0] * T1[1] - Vh[1] * T1[0]];
    const r = Math.sqrt(u1), phi = 2 * Math.PI * u2;        // 4.2: a uniform disk, then warped to the
    const t1 = r * Math.cos(phi);                           //      PROJECTED AREA of the hemisphere
    let t2 = r * Math.sin(phi);
    const s = 0.5 * (1 + Vh[2]);
    if (!noWarp) t2 = (1 - s) * Math.sqrt(Math.max(0, 1 - t1 * t1)) + s * t2;
    const k = Math.sqrt(Math.max(0, 1 - t1 * t1 - t2 * t2));                          // 4.3: reproject up
    const Nh = [t1 * T1[0] + t2 * T2[0] + k * Vh[0], t1 * T1[1] + t2 * T2[1] + k * Vh[1],
                t1 * T1[2] + t2 * T2[2] + k * Vh[2]];
    const Ne = [alpha * Nh[0], alphaY * Nh[1], Math.max(0, Nh[2])];                    // 3.4: unstretch
    const nl = Math.hypot(Ne[0], Ne[1], Ne[2]);
    return [Ne[0] / nl, Ne[2] / nl, Ne[1] / nl];            // z-up -> y-up. The second half of the same swap.
}

/**
 * The pdf of the SAMPLED DIRECTION under visible-normal sampling. The half-vector pdf is D_visible; the
 * 1/(4|wo.wh|) is the reflection's Jacobian, and it cancels the max(0, wo.wh) inside D_visible outright --
 * which is why this depends on cos_h and cos_o and NOT on the dot product that sampleDirPdf needs.
 */
export const visibleNormalDirPdf = (cosO, cosH, alpha, o = {}) => G1(cosO, alpha, o) * D(cosH, alpha, o) / (4 * cosO);

/**
 * f cos_i / pdf under visible-normal sampling, cancelled analytically: F G2 / G1(wo).
 *
 * *** COMPARE bounceWeight ABOVE, WHICH STILL CARRIES |wo.wh| / (cos_o cos_h). *** Sampling the visible
 * normals removes those too. A wrong D is invisible here for the same reason it is invisible there, and more
 * so: nothing about the lobe survives into the weight at all.
 */
export function visibleBounceWeight(cosO, cosI, alpha, { F = 1, ...o } = {}) {
    if (cosI <= 0 || cosO <= 0) return 0;
    return F * G2(cosO, cosI, alpha, o) / G1(cosO, alpha, o);
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
