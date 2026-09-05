// physics/render/bssrdfSample-selfcheck.mjs -- v4444 -- the gate for physics/render/bssrdfSample.mjs.
//
// *** THE PAIR OF CHECKS IS THE WHOLE DESIGN. *** Two estimators of one integral must AGREE IN THE MEAN,
// because both are unbiased -- that is where a wrong Jacobian shows, and it catches WRONGNESS. They must
// DIFFER IN VARIANCE -- that is the benefit, and it MEASURES it. Neither can be faked by the other, and a
// round that only checked the second would pass with a biased sampler that happened to be quiet.
//
// ---- *** FOUR SABOTAGES, RESULTS BY NAME *** ------------------------------------------------------------
//
//  A. Drop the Jacobian from the importance weight (return 1)   -> 2 RED
//  B. Drop the 4 pi a^2 from the uniform weight                 -> 4 RED
//  C. Sample the uniform estimator linearly in r, not by area   -> 1 RED
//     One row, and it is the unbiasedness row for the uniform estimator -- which is the point of having it.
//     Sampling the wrong density leaves the VARIANCE comparison looking entirely reasonable; only the mean
//     knows. A round that measured only the benefit would have shipped this.
//  D. Let samples past the antipode contribute their weight     -> 2 RED
//
// ---- *** WHAT THIS DOES NOT CLAIM *** ---------------------------------------------------------------------
//
// That this renders. It is a one-dimensional collapse of a surface integral, valid because the irradiance is
// CONSTANT and the profile depends only on distance -- a textured or shadowed surface breaks that collapse
// and needs the real two-dimensional disc sampling, which is NOT here. That geodesic distance is the right
// distance: a real implementation uses the chord or a ray-traced probe, and on a sphere those differ from the
// geodesic by a known amount that nothing here measures. And that the dipole is WRONG -- section 5 measures
// that its integral is not one and that albedo is therefore not a free multiplier, which is an inconvenience
// rather than an error, and it is the inconvenience Burley removed.

import {
    groundTruth, importanceSample, uniformSample, estimate, compare, dipole, dipoleIntegral, rng,
} from "./bssrdfSample.mjs";
import { profile } from "./subsurface.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("bssrdfSample-selfcheck -- two estimators, one integral, and the pair is the point\n");

// ---- 1. THE ESTIMAND, AND ITS FLAT LIMIT IS A NUMBER PROVED IN ANOTHER ROUND ----------------------------
console.log("1. the surface integral, and where it has to land");

const truths = [1, 3, 10, 100, 1000].map((a) => groundTruth(a, 1));
say(`I(a, d=1) at a = 1, 3, 10, 100, 1000: ${truths.map((v) => v.toFixed(6)).join("  ")}`);
ok("the integral rises monotonically as the sphere flattens", truths.every((v, i) => i === 0 || v > truths[i - 1]));
// *** THE FLAT LIMIT IS v4443'S NORMALISATION, REACHED BY A COMPLETELY DIFFERENT ROUTE. *** That round proved
// INT R 2 pi r dr = 1 analytically on the plane; this one integrates over a sphere and watches it arrive.
ok("!! and it arrives at ONE -- the plane normalisation v4443 proved analytically",
   Math.abs(truths[truths.length - 1] - 1) < 1e-5,
   `${truths[truths.length - 1].toFixed(8)} at a = 1000, from a spherical integral that knows nothing about ` +
   "that proof");
ok("...and it is meaningfully BELOW one on a small sphere, so the limit is a limit and not a constant",
   truths[0] < 0.6, `${truths[0].toFixed(6)} at a = 1 -- the sphere runs out of surface before the profile ends`);

// ---- 2. UNBIASEDNESS: WHERE A WRONG JACOBIAN SHOWS ------------------------------------------------------
console.log("\n2. both estimators must agree with the truth -- judged against MEASURED noise");

const runs = [1, 3, 10, 100].map((a) => compare(a, 1, { n: 40000, seed: 7 }));
for (const c of runs) {
    const zi = Math.abs(c.importance.mean - c.truth) / c.importance.stderr;
    const zu = Math.abs(c.uniform.mean - c.truth) / c.uniform.stderr;
    say(`a=${String(c.a).padStart(4)} truth ${c.truth.toFixed(6)}  importance ${c.importance.mean.toFixed(6)} ` +
        `(${zi.toFixed(2)} se)  uniform ${c.uniform.mean.toFixed(6)} (${zu.toFixed(2)} se)`);
}
// *** THE BOUND IS THE ESTIMATOR'S OWN STANDARD ERROR, NOT A NUMBER SOMEBODY LIKED. *** v4437 learned that
// the hard way: a hand-picked tolerance went red on 1.35 sd of ordinary noise.
ok("!! the importance estimator is unbiased, within three of its own standard errors",
   runs.every((c) => Math.abs(c.importance.mean - c.truth) < 3 * c.importance.stderr));
ok("!! and so is the uniform one, which is what makes the comparison fair",
   runs.every((c) => Math.abs(c.uniform.mean - c.truth) < 3 * c.uniform.stderr),
   "a variance comparison between a biased and an unbiased estimator would be meaningless");

// ---- 3. VARIANCE: THE BENEFIT, MEASURED -----------------------------------------------------------------
console.log("\n3. and they must differ in variance -- that is the whole reason to do it");

for (const c of runs) {
    say(`a=${String(c.a).padStart(4)} sd importance ${c.importance.sd.toExponential(2)}  uniform ` +
        `${c.uniform.sd.toExponential(2)}  variance ratio ${c.varianceRatio.toExponential(2)}  ` +
        `uniform needs ${c.samplesToMatch.toExponential(2)} samples to match`);
}
ok("importance sampling has strictly lower variance at every radius",
   runs.every((c) => c.varianceRatio > 1));
// *** THE COLLAPSE IS THE DEMONSTRATION. *** The importance weight is the ratio of the sphere's area element
// to the plane's, so as the sphere flattens it goes to 1 and EVERY SAMPLE RETURNS THE SAME NUMBER.
ok("!! *** the importance estimator's variance COLLAPSES as the sphere flattens ***",
   runs[runs.length - 1].importance.sd < runs[0].importance.sd / 100,
   `${runs[0].importance.sd.toExponential(2)} at a=1 down to ${runs[runs.length - 1].importance.sd.toExponential(2)} ` +
   "at a=100 -- because the weight IS the Jacobian, and a flat sphere has none");
ok("!! ...while the uniform estimator's variance GROWS, which is the opposite and is why the ratio explodes",
   runs[runs.length - 1].uniform.sd > runs[0].uniform.sd * 10,
   `${runs[0].uniform.sd.toExponential(2)} to ${runs[runs.length - 1].uniform.sd.toExponential(2)}`);
ok("the ratio spans more than eight orders across the sweep",
   runs[runs.length - 1].varianceRatio / runs[0].varianceRatio > 1e8,
   `${runs[0].varianceRatio.toExponential(2)} to ${runs[runs.length - 1].varianceRatio.toExponential(2)}`);

// ---- 4. THE WEIGHT IS THE JACOBIAN, EXACTLY -------------------------------------------------------------
console.log("\n4. the weight is not LIKE the Jacobian, it IS the Jacobian");

let worstJac = 0;
for (const a of [0.5, 2, 30]) {
    for (let k = 1; k < 30; k++) {
        const { r, weight } = importanceSample(k / 30, a, 1);
        if (r >= Math.PI * a) continue;
        worstJac = Math.max(worstJac, Math.abs(weight - (a * Math.sin(r / a)) / r));
    }
}
ok("!! the importance weight equals a sin(r/a) / r exactly", worstJac === 0,
   "every factor of R cancels between the profile's pdf and the integrand, which is what importance " +
   "sampling MEANS when the sampler matches the integrand");
ok("...and it goes to one in the flat limit, which is why the variance goes to zero",
   Math.abs(importanceSample(0.5, 1e6, 1).weight - 1) < 1e-9);
ok("a sample past the antipode contributes nothing", (() => {
    const s = importanceSample(1 - 1e-15, 0.01, 1);
    return s.beyondAntipode === true && s.weight === 0;
})(), "the sphere has run out of surface, not the profile -- and counting it would be counting area twice");

// ---- 5. THE COMPANION: WHAT THE DIPOLE DOES INSTEAD -----------------------------------------------------
console.log("\n5. why v4443 chose Burley, measured rather than asserted");

const dips = [0.5, 0.8, 0.95].map((alphaPrime) => ({ alphaPrime, I: dipoleIntegral({ alphaPrime }) }));
for (const d of dips) say(`dipole with reduced albedo ${d.alphaPrime}: radial integral ${d.I.toFixed(6)}`);
ok("!! the dipole's radial integral is NOT one, at any albedo", dips.every((d) => Math.abs(d.I - 1) > 0.4));
ok("!! ...and it is not the albedo it was handed either", dips.every((d) => Math.abs(d.I - d.alphaPrime) > 0.1),
   "so ALBEDO IS NOT A FREE MULTIPLIER: hitting a target diffuse reflectance means inverting a function of " +
   "three parameters numerically, which is exactly the inconvenience Burley's normalisation removes");
ok("the dipole integral is monotone in the reduced albedo, so the inversion at least exists",
   dips.every((d, i) => i === 0 || d.I > dips[i - 1].I));
ok("and Burley's is exactly one by construction, which is the contrast", (() => {
    // The plane normalisation, integrated the same way the dipole just was, on the same quadrature shape.
    const N = 400000, rMax = 400, dr = rMax / N;
    let s = 0;
    for (let i = 0; i < N; i++) { const r = (i + 0.5) * dr; s += 2 * Math.PI * r * profile(r, 1) * dr; }
    return Math.abs(s - 1) < 1e-5;
})(), "same quadrature, same limits, same shape -- one integrates to 1 and the other does not");

console.log(`\nbssrdfSample-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
