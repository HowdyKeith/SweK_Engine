// physics/render/microsurfaceWalk.mjs -- v4446 -- the ground truth v4445 said it needed and did not have.
//
// *** v4445 WIRED THE MULTI-SCATTER TERM IN AND COULD ONLY BOUND IT. *** Its honest scope said so: "a
// coloured metal is NOT claimed correct -- two exact bounds are asserted and the value between them is
// MEASURED rather than claimed. Pinning it would need a random-walk ground truth on a GGX microsurface, which
// is NOT here and is the honest next step." This is that random walk, and the bound becomes a number.
//
// The method is Heitz, Hanika, d'Eon and Dachsbacher 2016, "Multiple-Scattering Microfacet BSDFs with the
// Smith Model" -- the uniform-height variant. Nothing is vendored: it is a paper, and the walk is thirty
// lines. It is INDEPENDENT of Kulla-Conty by construction: it simulates bounces on a microsurface and never
// consults a table, an albedo fit, or any of the machinery it is being used to check.
//
// ---- *** A GROUND TRUTH NOBODY CHECKED IS WORSE THAN NO GROUND TRUTH, SO IT IS CHECKED TWICE FIRST *** ----
//
//   CONSERVATION.   With Fresnel identically one -- a lossless white conductor -- the walk must return
//                   EXACTLY 1.0, because energy that goes in has nowhere else to go. Measured: 1.000000 at
//                   alpha 0.16, 0.49 and 1.0. That is a LAW rather than a fit, and no parameter was tuned
//                   to make it hold.
//   SINGLE SCATTER. Counting only the paths that bounce ONCE and escape must reproduce
//                   microfacet.directionalAlbedo, which was graded rounds ago by an unrelated quadrature.
//                   Measured at cosO 0.7: 0.950920 / 0.795565 / 0.582680 / 0.378855 against the table's
//                   0.950620 / 0.794751 / 0.582111 / 0.378889. Agreement to 3.4e-5 at roughness 1.
//
// *** AND THE SECOND CHECK FAILED FIRST, FOR A REASON WORTH KEEPING. *** Restricting the walk to one bounce
// with a maxBounces cap gave 0.587860 against the table's 0.378889 -- fifty per cent high. A cap TRUNCATES
// THE WALK BEFORE THE ESCAPE TEST, so a ray that would have been shadowed on its way out is counted as
// having left. Single scatter is not "one bounce"; it is "one bounce AND THEN ESCAPES", and the difference
// is exactly the shadowing term. The walk was right and the way of asking it was wrong.
//
// ---- *** WHAT IT SAYS ABOUT WHAT v4445 SHIPPED *** ---------------------------------------------------------
//
//     F0      walk (truth)   Kulla-Conty   error
//     1       1.000000       0.999817      -0.0%
//     0.9     0.818022       0.788009      -3.7%
//     0.5     0.314246       0.291158      -7.3%
//     0.2     0.097177       0.093732      -3.5%
//     0.1     0.045176       0.044892      -0.6%
//     0.04    0.017837       0.018551      +4.0%
//
// *** THE ERROR IS NOT MONOTONE AND IT CHANGES SIGN. *** Exact at a white mirror, under-compensating by up
// to 7.3% in the middle, and OVER-compensating for very dark conductors. So it cannot be repaired by a single
// scale factor, and anyone quoting "Kulla-Conty is within a few per cent" owes the reader a WHERE.

import { Lambda } from "./microfacet.mjs";

"use strict";

const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The uniform height distribution's CDF and its inverse. Heights live in [-1, 1]. */
export const C1 = (h) => Math.min(1, Math.max(0, (h + 1) / 2));
export const invC1 = (u) => Math.max(-1, Math.min(1, 2 * Math.min(1, Math.max(0, u)) - 1));

/**
 * *** SMITH'S LAMBDA IS SIGNED, AND microfacet.mjs's IS NOT -- WHICH IS CORRECT THERE AND WRONG HERE. ***
 * That module only ever asks about directions above the horizon, so it takes a cosine and squares it. A walk
 * goes BELOW the horizon on its very first step, where Lambda(w) = -1 - Lambda(-w). Using the unsigned value
 * made every ray fail to escape and the whole walk return zero -- the first thing this file did.
 */
export const lambdaSigned = (wz, alpha) => (wz >= 0 ? Lambda(wz, alpha) : -1 - Lambda(-wz, alpha));

/** G1 at a height. ZERO for a downward ray: it cannot escape upward, so it never terminates the walk. */
export const g1AtHeight = (wz, h, alpha) =>
    (wz <= 0 ? 0 : (wz > 0.9999 ? 1 : Math.pow(C1(h), lambdaSigned(wz, alpha))));

/** Sample the next height a ray reaches, or Infinity if it escapes the microsurface. */
export function sampleHeight(w, h, U, alpha) {
    const wz = w[2];
    if (wz > 0.9999) return Infinity;
    if (wz < -0.9999) return invC1(U * C1(h));
    if (Math.abs(wz) < 1e-4) return h;
    if (U > 1 - g1AtHeight(wz, h, alpha)) return Infinity;
    return invC1(C1(h) / Math.pow(1 - U, 1 / lambdaSigned(wz, alpha)));
}

/** Heitz 2018's visible-normal sampling for GGX: exact, and no rejection loop. */
export function sampleVNDF(wo, alpha, U1, U2) {
    const Vh = nrm([alpha * wo[0], alpha * wo[1], wo[2]]);
    const lensq = Vh[0] * Vh[0] + Vh[1] * Vh[1];
    const T1 = lensq > 0 ? [-Vh[1] / Math.sqrt(lensq), Vh[0] / Math.sqrt(lensq), 0] : [1, 0, 0];
    const T2 = cross(Vh, T1);
    const r = Math.sqrt(U1), phi = 2 * Math.PI * U2;
    const t1 = r * Math.cos(phi);
    let t2 = r * Math.sin(phi);
    const s = 0.5 * (1 + Vh[2]);
    t2 = (1 - s) * Math.sqrt(Math.max(0, 1 - t1 * t1)) + s * t2;
    const z = Math.sqrt(Math.max(0, 1 - t1 * t1 - t2 * t2));
    const Nh = [t1 * T1[0] + t2 * T2[0] + z * Vh[0],
                t1 * T1[1] + t2 * T2[1] + z * Vh[1],
                t1 * T1[2] + t2 * T2[2] + z * Vh[2]];
    return nrm([alpha * Nh[0], alpha * Nh[1], Math.max(1e-6, Nh[2])]);
}

/** One path. `F` is called with |wo . wm| at each bounce and returns that bounce's Fresnel reflectance. */
export function walk(cosO, alpha, F, rand, { maxBounces = 64 } = {}) {
    const so = Math.sqrt(Math.max(0, 1 - cosO * cosO));
    let wr = [-so, 0, -cosO];                 // the direction of propagation, heading INTO the surface
    let h = 1 + 1e-4, energy = 1, bounces = 0;
    while (bounces < maxBounces) {
        h = sampleHeight(wr, h, rand(), alpha);
        if (!Number.isFinite(h)) break;       // escaped
        const wo = [-wr[0], -wr[1], -wr[2]];
        const wm = sampleVNDF(wo, alpha, rand(), rand());
        energy *= F(Math.abs(dot(wo, wm)));
        const d = dot(wr, wm);
        wr = [wr[0] - 2 * d * wm[0], wr[1] - 2 * d * wm[1], wr[2] - 2 * d * wm[2]];
        bounces++;
        if (energy < 1e-9) break;
    }
    return { energy: wr[2] > 0 ? energy : 0, bounces };
}

export function rng(seed = 1) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The directional albedo by random walk. `onlyBounces` restricts which path lengths are counted -- pass 1 to
 * get the SINGLE-SCATTER component, which is the validation against microfacet.directionalAlbedo.
 *
 * *** IT COUNTS PATHS THAT BOUNCE ONCE AND THEN ESCAPE, NOT PATHS TRUNCATED AFTER ONE BOUNCE. *** Capping the
 * walk at one bounce reads 0.587860 where the table says 0.378889, because the cap removes the escape test
 * and a shadowed ray is counted as having left. The difference between those two numbers IS the shadowing.
 */
export function albedo(cosO, alpha, F, { n = 200000, seed = 1, onlyBounces = null } = {}) {
    const rand = rng(seed);
    let sum = 0, sum2 = 0, bounceTotal = 0, escaped = 0;
    for (let k = 0; k < n; k++) {
        const r = walk(cosO, alpha, F, rand);
        bounceTotal += r.bounces;
        if (r.energy > 0) escaped++;
        const e = onlyBounces === null || r.bounces === onlyBounces ? r.energy : 0;
        sum += e;
        sum2 += e * e;
    }
    const mean = sum / n;
    const variance = Math.max(0, sum2 / n - mean * mean);
    return { value: mean, n, sd: Math.sqrt(variance), stderr: Math.sqrt(variance / n),
             meanBounces: bounceTotal / n, escapedFraction: escaped / n };
}

// *** THE RECORD, FROZEN BY NAME (v4399's rule). What v4445's Kulla-Conty scaling is actually worth. ***
export const KC_ERROR_AT_V4446 = Object.freeze({
    at: "v4446",
    where: "roughness 1, cosO 0.7, conductor, Schlick Fresnel",
    rows: Object.freeze([
        Object.freeze({ f0: 1, truth: 1.000000, kc: 0.999817 }),
        Object.freeze({ f0: 0.9, truth: 0.818022, kc: 0.788009 }),
        Object.freeze({ f0: 0.5, truth: 0.314246, kc: 0.291158 }),
        Object.freeze({ f0: 0.2, truth: 0.097177, kc: 0.093732 }),
        Object.freeze({ f0: 0.1, truth: 0.045176, kc: 0.044892 }),
        Object.freeze({ f0: 0.04, truth: 0.017837, kc: 0.018551 }),
    ]),
    worstUnder: -0.073,   // at F0 = 0.5
    worstOver: 0.040,     // at F0 = 0.04
    note: "THE ERROR CHANGES SIGN. Exact at a white mirror, under-compensating by up to 7.3% in the middle, " +
          "over-compensating for very dark conductors -- so it cannot be repaired by one scale factor, and " +
          "a claim that Kulla-Conty is 'within a few per cent' owes the reader a WHERE.",
});
