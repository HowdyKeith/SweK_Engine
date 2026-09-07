// physics/render/bssrdfSample.mjs -- v4444 -- the integration v4443 closed as a model and left open.
//
// *** v4443 SHIPPED THE PROFILE AND SAID IN ITS OWN HONEST SCOPE THAT THE GAP WAS "CLOSED AS A MODEL AND LEFT
// OPEN AS AN INTEGRATION". *** A BSSRDF needs a SURFACE: light enters at one point and leaves at another, and
// physics/render/principled.mjs is a BRDF evaluated at a single point with no surface anywhere in its
// signature. This is that surface, and the surface is the one the tree already renders on --
// physics/render/pathTracer.mjs's furnace sphere, which has exact analytic geometry.
//
// ---- *** THE ESTIMAND, WRITTEN DOWN BEFORE EITHER ESTIMATOR *** -------------------------------------------
//
// A sphere of radius `a` under unit irradiance, shading point anywhere on it. Because the profile depends
// only on distance and the irradiance is constant, the surface integral collapses to one dimension in the
// GEODESIC distance r, whose area element on a sphere is 2 pi a sin(r/a) dr:
//
//     I(a, d) = INT[0, pi a] R(r, d) * 2 pi a sin(r/a) dr
//
// *** AND ITS FLAT LIMIT IS AN EXACT CHECK RATHER THAN A PLAUSIBILITY ARGUMENT. *** As a grows the sphere
// becomes a plane, sin(r/a) -> r/a, the element becomes 2 pi r dr, and I -> the plane normalisation, which
// v4443 proved is exactly 1. Measured: 0.529916, 0.834307, 0.977815, 0.999767, 0.999997 at a = 1, 3, 10, 100,
// 1000. A curve arriving at a number proved by a different argument in a different round.
//
// ---- *** TWO ESTIMATORS, AND THE PAIR OF CHECKS IS THE POINT *** ------------------------------------------
//
// They must AGREE IN THE MEAN, because both are unbiased -- that is where a wrong Jacobian shows, and it is
// the check that catches WRONGNESS. They must DIFFER IN VARIANCE -- that is the benefit, and it is the check
// that MEASURES it. Neither can be faked by the other, which is the property this tree has spent a great many
// rounds learning to ask for.
//
//   UNIFORM     samples r from the sphere's own area density, sin(r/a)/(2a), and weighs R(r) * 4 pi a^2.
//               R is singular at the origin where the area density vanishes, so the weight has a heavy tail.
//   IMPORTANCE  samples r from the PROFILE's CDF, whose radial density is exactly R(r) * 2 pi r, and the
//               weight collapses to a * sin(r/a) / r -- WHICH IS THE JACOBIAN AND NOTHING ELSE.
//
// *** THAT COLLAPSE IS THE DEMONSTRATION. *** The importance weight is the ratio of the sphere's area element
// to the plane's, so as the sphere flattens it goes to 1 and THE ESTIMATOR BECOMES EXACT -- zero variance,
// because every sample returns the same number. Measured standard deviation across a = 1, 3, 10, 100:
// 4.07e-1, 2.56e-1, 5.19e-2, 6.03e-4, against uniform's 1.54e0, 4.28e0, 1.21e1, 5.49e1. The variance ratio
// runs from 14x to 8.3e9.

import { profile, cdf, sampleRadius } from "./subsurface.mjs";

"use strict";

export function rng(seed = 1) {
    let a = seed | 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The estimand, by quadrature. Deliberately a different method from either estimator, so it can disagree. */
export function groundTruth(a, d, { N = 400000 } = {}) {
    const rMax = Math.PI * a, dr = rMax / N;
    let s = 0;
    for (let i = 0; i < N; i++) {
        const r = (i + 0.5) * dr;
        s += profile(r, d) * 2 * Math.PI * a * Math.sin(r / a) * dr;
    }
    return s;
}

/**
 * One importance sample. The radius comes from the profile's own CDF, so the pdf is R(r) 2 pi r and every
 * factor of R cancels: the weight IS the Jacobian between the sphere's area element and the plane's.
 * A sample past the antipode contributes nothing -- the sphere has run out of surface, not the profile.
 */
export function importanceSample(u, a, d) {
    const r = sampleRadius(u, d);
    if (!(r < Math.PI * a)) return { r, weight: 0, beyondAntipode: true };
    return { r, weight: (a * Math.sin(r / a)) / r, beyondAntipode: false };
}

/**
 * One uniform-area sample. The sphere's area density in geodesic radius is sin(r/a)/(2a), whose CDF is
 * (1 - cos(r/a))/2 and inverts in closed form -- so this estimator needs no bisection and shares no code
 * with the one it is checking.
 */
export function uniformSample(u, a, d) {
    const r = a * Math.acos(1 - 2 * u);
    return { r, weight: profile(r, d) * 4 * Math.PI * a * a, beyondAntipode: false };
}

/** Run one estimator. Reports the standard error so unbiasedness is judged against MEASURED noise. */
export function estimate(kind, a, d, { n = 40000, seed = 7 } = {}) {
    const r = rng(seed);
    const draw = kind === "importance" ? importanceSample : uniformSample;
    let s = 0, s2 = 0, beyond = 0;
    for (let k = 0; k < n; k++) {
        const { weight, beyondAntipode } = draw(r(), a, d);
        if (beyondAntipode) beyond++;
        s += weight;
        s2 += weight * weight;
    }
    const mean = s / n;
    const variance = Math.max(0, s2 / n - mean * mean);
    return { kind, mean, variance, sd: Math.sqrt(variance), stderr: Math.sqrt(variance / n), n, beyond };
}

/** Both estimators and the ratio, which is the number the round exists to produce. */
export function compare(a, d, opts = {}) {
    const imp = estimate("importance", a, d, opts);
    const uni = estimate("uniform", a, d, opts);
    return {
        a, d, truth: groundTruth(a, d), importance: imp, uniform: uni,
        varianceRatio: imp.variance > 0 ? uni.variance / imp.variance : Infinity,
        // Samples the uniform estimator needs to match the importance estimator's error at n.
        samplesToMatch: imp.variance > 0 ? (uni.variance / imp.variance) * imp.n : Infinity,
    };
}

// ---- *** THE COMPANION MEASUREMENT: WHAT THE CLASSICAL DIPOLE DOES INSTEAD *** -----------------------------
//
// v4443 chose Christensen and Burley's profile over Jensen's dipole because the former is NORMALISED BY
// CONSTRUCTION. This measures what that is worth. The dipole places a real source below the surface and a
// virtual one above it, and its radial integral is NOT one and NOT the albedo it was handed -- it is a
// function of the parameters that has to be computed, which is exactly the inconvenience Burley removed.
export function dipole(r, { sigmaTPrime = 1, alphaPrime = 0.8, A = 1.44 } = {}) {
    const sigmaAPrime = sigmaTPrime * (1 - alphaPrime);
    const sigmaTr = Math.sqrt(3 * sigmaAPrime * sigmaTPrime);
    const zr = 1 / sigmaTPrime;
    const zv = zr * (1 + (4 / 3) * A);
    const dr = Math.hypot(r, zr), dv = Math.hypot(r, zv);
    const term = (z, dist) => (z * (1 + sigmaTr * dist) * Math.exp(-sigmaTr * dist)) / (dist * dist * dist);
    return (alphaPrime / (4 * Math.PI)) * (term(zr, dr) + term(zv, dv));
}

/** The dipole's total radial integral, by the same quadrature shape v4443 uses on the Burley profile. */
export function dipoleIntegral(opts = {}, { N = 400000, rMax = 400 } = {}) {
    const dr = rMax / N;
    let s = 0;
    for (let i = 0; i < N; i++) {
        const r = (i + 0.5) * dr;
        s += 2 * Math.PI * r * dipole(r, opts) * dr;
    }
    return s;
}

export { profile, cdf, sampleRadius };

// ---- *** THE DOOR (v3327's split) *** ---------------------------------------------------------------------
//
// v4461 -- registered at v4460 with nothing to render. The report prints what importance sampling is WORTH
// as samples-to-match rather than as a variance ratio alone, because a ratio is a number and a sample count
// is a cost somebody has to pay.

export function reportLines() {
    const L = [];
    L.push("[bssrdfSample] drawing from the profile against drawing uniformly, and what the difference costs");
    L.push("");
    // *** THE ESTIMAND IS NOT 1, AND SAYING WHY IS THE POINT. *** On a PLANE the profile integrates to one by
    // construction -- that is subsurface.mjs's exact half. Here it is integrated over a SPHERE of radius a, so
    // the geometry no longer cancels, the answer depends on a and d, and an estimator is needed at all.
    // `truth` is quadrature over that sphere, not a reference implementation.
    L.push("  the estimand: the profile integrated over a SPHERE of radius a, not a plane. On a plane it is 1");
    L.push("  by construction and needs no estimator; on a sphere the geometry stops cancelling.");
    L.push("");
    L.push("   sphere a    d       truth      importance    uniform     var ratio   uniform samples to match");
    for (const [a, d] of [[0.2, 0.5], [0.5, 1], [0.8, 1], [0.8, 5], [0.95, 20]]) {
        const c = compare(a, d, { n: 20000, seed: 7 });
        L.push("   " + a.toFixed(2).padStart(8) + "  " + String(d).padStart(4) + "   " +
               c.truth.toFixed(6).padStart(9) + "    " + c.importance.mean.toFixed(6).padStart(9) + "   " +
               c.uniform.mean.toFixed(6).padStart(9) + "   " +
               (isFinite(c.varianceRatio) ? c.varianceRatio.toFixed(1) : "inf").padStart(9) + "   " +
               (isFinite(c.samplesToMatch) ? Math.round(c.samplesToMatch).toLocaleString("en-GB") : "inf").padStart(14));
    }
    L.push("");
    // *** THE COMPANION MEASUREMENT IS WHY THE PROFILE WAS CHOSEN, AND IT IS A NUMBER RATHER THAN A PREFERENCE. ***
    // Burley's profile integrates to one by construction. Jensen's dipole integrates to whatever the
    // parameters make it, which somebody then has to compute and divide out.
    L.push("  *** AND WHAT THE CLASSICAL DIPOLE DOES INSTEAD: its radial integral is neither 1 nor the");
    L.push("      albedo it was handed, so a renderer using it owes a normalisation it has to compute. ***");
    L.push("     alpha'    A      dipole integral    handed albedo    off by");
    for (const [ap, A] of [[0.4, 1.44], [0.8, 1.44], [0.95, 1.44], [0.8, 1.0], [0.8, 2.0]]) {
        const I = dipoleIntegral({ alphaPrime: ap, A }, { N: 60000, rMax: 200 });
        L.push("   " + ap.toFixed(2).padStart(7) + "  " + A.toFixed(2).padStart(5) + "    " +
               I.toFixed(6).padStart(13) + "    " + ap.toFixed(6).padStart(13) + "    " +
               (I - ap >= 0 ? "+" : "") + (I - ap).toFixed(6));
    }
    L.push("");
    L.push("  which is the inconvenience v4443 removed by choosing the normalised profile, and the reason");
    L.push("  that choice is recorded as a measurement rather than as a preference between two papers.");
    return L;
}
