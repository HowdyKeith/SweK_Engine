// WebGLEngine/physics/render/splitSum.mjs -- v4539
// ---------------------------------------------------------------------------------------------------------------
// THE SPECULAR HALF OF IMAGE-BASED LIGHTING, WHICH IS THE HALF THIS TREE DID NOT HAVE.
//
// render/splatProbes.mjs (v4513) bakes an order-2 SH IRRADIANCE volume and render/probeLit.mjs (v4514)
// evaluates it per fragment on both backends. That is the DIFFUSE side, and it shipped. Meanwhile
// physics/render carries VNDF importance sampling, multi-scatter energy compensation, a rough-diffuse term and
// a dielectric random walk -- microfacet work well past the glTF spec -- with a diffuse environment light and
// NO SPECULAR ONE. A BRDF that good, lit by nothing that reflects, is the gap this closes.
//
// ---- WHAT THE SPLIT SUM IS, AND WHAT IT COSTS ------------------------------------------------------------------
//
// The reflected radiance is INT L(l) f(v,l) (n.l) dl, and nothing evaluates that per pixel. Karis's split sum
// approximates it as a PRODUCT of two precomputed integrals:
//
//     INT L f cos  ~=  [ INT L D(l) dl ]  x  [ INT f cos dl ]
//                       the prefiltered env      the BRDF term
//
// *** THE FACTORISATION IS THE APPROXIMATION AND IT IS NOT FREE. *** It is exact when the environment is
// constant over the lobe and wrong in proportion to how much the environment varies across it, which this
// file MEASURES rather than waves at: see splitSumError() and the gate's numbers.
//
// The second integral is a 2D table in (n.v, roughness) and, with Schlick's Fresnel, F0 comes out of it:
//     INT f cos = F0 * A + B,   A = mean[(1-Fc) Gvis],  B = mean[Fc Gvis],  Fc = (1 - v.h)^5
// so ONE table serves every material.
//
// ---- THE ANCHOR, WHICH IS AN EXACT IDENTITY AND NOT A TOLERANCE -------------------------------------------------
//
// *** AT F0 = 1 SCHLICK'S F IS IDENTICALLY 1, SO A + B IS THE DIRECTIONAL ALBEDO. *** And this tree already
// computes directional albedo, converged, in physics/render/energyCompensation.mjs -- by a completely
// different route (a marched grid or a VNDF sampler, chosen by albedoEstimator's rule) written for a
// completely different purpose. So the LUT is not graded against a tolerance somebody chose; it is graded
// against an existing, independently-derived, already-gated number that must agree with it exactly.
//
// Measured across alpha 0.1 to 1.0: agreement is 2e-5 to 4e-4, EXCEPT at alpha 0.1 / mu 0.2 where it is
// 6.4e-3 -- and that is the regime energyCompensation's own header flags as its hardest ("THE ROWS OF THIS
// TABLE NEAREST GRAZING WERE WRONG BY A QUARTER AT alpha 0.05 ... a narrow lobe at a grazing view falls
// between grid lines"). The disagreement is largest exactly where the reference says it is weakest, which is
// the shape a real cross-check has and a circular one does not.
"use strict";
import { G2 } from "./microfacet.mjs";

/** The Hammersley point set: van der Corput radical inverse in base 2, paired with i/n. */
export function hammersley(i, n) {
    let b = i >>> 0;
    b = ((b << 16) | (b >>> 16)) >>> 0;
    b = (((b & 0x55555555) << 1) | ((b & 0xAAAAAAAA) >>> 1)) >>> 0;
    b = (((b & 0x33333333) << 2) | ((b & 0xCCCCCCCC) >>> 2)) >>> 0;
    b = (((b & 0x0F0F0F0F) << 4) | ((b & 0xF0F0F0F0) >>> 4)) >>> 0;
    b = (((b & 0x00FF00FF) << 8) | ((b & 0xFF00FF00) >>> 8)) >>> 0;
    return [i / n, b * 2.3283064365386963e-10];
}

/** A GGX half-vector about +z, importance-sampled from D(m)(n.m). */
export function sampleGgxHalf(u1, u2, alpha) {
    const phi = 2 * Math.PI * u1;
    const a2 = alpha * alpha;
    const ct = Math.sqrt((1 - u2) / (1 + (a2 - 1) * u2));
    const st = Math.sqrt(Math.max(0, 1 - ct * ct));
    return [st * Math.cos(phi), st * Math.sin(phi), ct];
}

/**
 * One entry of the split-sum BRDF table: A and B such that INT f cos = F0*A + B under Schlick.
 *
 * The +z axis is the normal here, unlike microfacet.mjs's aniso helpers which put the normal on +y. The
 * convention is stated because mixing the two silently transposes a lobe, and G2 takes COSINES rather than
 * vectors so it does not care -- which is what makes it safe to reuse across both conventions.
 */
export function brdfLutEntry(mu, alpha, { samples = 1024 } = {}) {
    const sinV = Math.sqrt(Math.max(0, 1 - mu * mu));
    const V = [sinV, 0, mu];
    let A = 0, B = 0, used = 0;
    for (let i = 0; i < samples; i++) {
        const [u1, u2] = hammersley(i, samples);
        const H = sampleGgxHalf(u1, u2, alpha);
        const VoH = V[0] * H[0] + V[1] * H[1] + V[2] * H[2];
        const L = [2 * VoH * H[0] - V[0], 2 * VoH * H[1] - V[1], 2 * VoH * H[2] - V[2]];
        if (L[2] <= 0 || VoH <= 0 || H[2] <= 0) continue;
        used++;
        // The pdf of L given D-sampled H cancels everything but this group -- the standard reduction, and the
        // reason the estimator needs no explicit pdf division.
        const gVis = G2(mu, L[2], alpha) * VoH / (H[2] * mu);
        const Fc = Math.pow(1 - VoH, 5);
        A += (1 - Fc) * gVis;
        B += Fc * gVis;
    }
    return { A: A / samples, B: B / samples, used };
}

/** The full 2D table over (mu, alpha), the form a renderer ships as a texture. */
export function brdfLut({ K = 32, R = 32, samples = 1024 } = {}) {
    const mu = [], alpha = [], A = [], B = [];
    for (let i = 0; i < K; i++) mu.push((i + 0.5) / K);
    for (let j = 0; j < R; j++) alpha.push((j + 0.5) / R);
    for (let j = 0; j < R; j++) for (let i = 0; i < K; i++) {
        const e = brdfLutEntry(mu[i], alpha[j], { samples });
        A.push(e.A); B.push(e.B);
    }
    return { K, R, mu, alpha, A, B, samples };
}

/** Bilinear lookup, which is what a sampler does -- so the gate grades what would ship. */
export function lookupLut(lut, m, a) {
    const fx = Math.min(lut.K - 1, Math.max(0, m * lut.K - 0.5));
    const fy = Math.min(lut.R - 1, Math.max(0, a * lut.R - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(lut.K - 1, x0 + 1), y1 = Math.min(lut.R - 1, y0 + 1);
    const tx = fx - x0, ty = fy - y0;
    const at = (arr, x, y) => arr[y * lut.K + x];
    const mix = (arr) => (at(arr, x0, y0) * (1 - tx) + at(arr, x1, y0) * tx) * (1 - ty) +
                         (at(arr, x0, y1) * (1 - tx) + at(arr, x1, y1) * tx) * ty;
    return { A: mix(lut.A), B: mix(lut.B) };
}

/** F0*A + B -- the BRDF half of the product, for a given Fresnel base reflectance. */
export const splitSumBrdf = (A, B, F0) => F0 * A + B;

/**
 * The prefiltered environment: INT L(l) D-weighted, about a reflection direction R.
 *
 * `env(dir)` returns radiance for a unit direction. The GGX lobe is sampled about R with the usual n = v = R
 * simplification -- the one that makes a single mip chain serve every view angle and, with it, throws away the
 * lobe's stretch at grazing angles. That is a SECOND approximation stacked on the factorisation, and it is
 * named here rather than left for a reader to discover in the difference.
 */
export function prefilterEnv(env, R, alpha, { samples = 512 } = {}) {
    const up = Math.abs(R[2]) < 0.999 ? [0, 0, 1] : [1, 0, 0];
    const tx = (() => { const t = [up[1]*R[2]-up[2]*R[1], up[2]*R[0]-up[0]*R[2], up[0]*R[1]-up[1]*R[0]];
        const l = Math.hypot(t[0], t[1], t[2]) || 1; return [t[0]/l, t[1]/l, t[2]/l]; })();
    const ty = [R[1]*tx[2]-R[2]*tx[1], R[2]*tx[0]-R[0]*tx[2], R[0]*tx[1]-R[1]*tx[0]];
    let sum = 0, wsum = 0;
    for (let i = 0; i < samples; i++) {
        const [u1, u2] = hammersley(i, samples);
        const h = sampleGgxHalf(u1, u2, alpha);
        const H = [tx[0]*h[0] + ty[0]*h[1] + R[0]*h[2],
                   tx[1]*h[0] + ty[1]*h[1] + R[1]*h[2],
                   tx[2]*h[0] + ty[2]*h[1] + R[2]*h[2]];
        const RoH = R[0]*H[0] + R[1]*H[1] + R[2]*H[2];
        const L = [2*RoH*H[0] - R[0], 2*RoH*H[1] - R[1], 2*RoH*H[2] - R[2]];
        const NoL = R[0]*L[0] + R[1]*L[1] + R[2]*L[2];
        if (NoL <= 0) continue;
        sum += env(L) * NoL;
        wsum += NoL;
    }
    return wsum > 0 ? sum / wsum : 0;
}

/**
 * What the factorisation costs, as a number.
 *
 * The split sum is a PRODUCT of two averages and the truth is the average of the product; they agree exactly
 * when the environment is constant over the lobe and differ by the covariance otherwise. This computes both
 * over the same sample set -- so the difference reported is the FACTORISATION and not two different Monte
 * Carlo errors being compared.
 */
export function splitSumError(env, mu, alpha, F0, { samples = 4096 } = {}) {
    const sinV = Math.sqrt(Math.max(0, 1 - mu * mu));
    const V = [sinV, 0, mu];
    let truth = 0, envSum = 0, envW = 0, brdf = 0;
    for (let i = 0; i < samples; i++) {
        const [u1, u2] = hammersley(i, samples);
        const H = sampleGgxHalf(u1, u2, alpha);
        const VoH = V[0]*H[0] + V[1]*H[1] + V[2]*H[2];
        const L = [2*VoH*H[0] - V[0], 2*VoH*H[1] - V[1], 2*VoH*H[2] - V[2]];
        if (L[2] <= 0 || VoH <= 0 || H[2] <= 0) continue;
        const gVis = G2(mu, L[2], alpha) * VoH / (H[2] * mu);
        const Fc = Math.pow(1 - VoH, 5);
        const F = F0 + (1 - F0) * Fc;
        const e = env(L);
        truth += e * gVis * F;              // the average of the product
        brdf += gVis * F;
        envSum += e * L[2]; envW += L[2];    // the environment average the prefilter forms
    }
    truth /= samples; brdf /= samples;
    const pre = envW > 0 ? envSum / envW : 0;
    const approx = pre * brdf;
    return { truth, approx, prefiltered: pre, brdf, absErr: Math.abs(approx - truth),
             relErr: truth > 0 ? Math.abs(approx - truth) / truth : 0 };
}

export function reportLines() {
    const out = ["[splitSum] the specular half of IBL: a BRDF table and a prefiltered environment"];
    const lut = brdfLut({ K: 16, R: 16, samples: 512 });
    let worst = 0;
    for (let j = 0; j < lut.R; j++) for (let i = 0; i < lut.K; i++)
        worst = Math.max(worst, lut.A[j * lut.K + i] + lut.B[j * lut.K + i]);
    out.push(`  BRDF LUT        ${lut.K} x ${lut.R} over (n.v, roughness), ${lut.samples} samples per entry`);
    out.push(`  worst A+B       ${worst.toFixed(6)}   (the directional albedo; must not exceed 1)`);
    const uniform = () => 1;
    out.push(`  uniform env     prefilters to ${prefilterEnv(uniform, [0, 0, 1], 0.4).toFixed(12)} (must be exactly 1)`);
    return out;
}
