// WebGLEngine/physics/render/furnace-selfcheck.mjs -- v3467
//
// Run: node physics/render/furnace-selfcheck.mjs
//
// *** THE KEY IS AN EXACT VALUE NOBODY TYPED IN: a diffuse sphere of albedo rho in a white furnace reads rho.
// The estimator is never told rho -- it enters as a scale, and the factor of 2 that makes it come out right
// falls out of E[cos theta] = 1/2 under solid-angle-uniform sampling. ***
//
// AND THE THREE CLASSIC ERRORS ARE TOLD APART BY THEIR RATIO, NOT BY A THRESHOLD, because each predicts a
// different exact multiple: 1/(2 pi), 2, and 4/pi. A tolerance would lump them; a ratio names which one.
"use strict";
import { furnace, EXPECTED, uniformSampleHemisphere, uniformThetaHemisphere, createCoordinateSystem, rng, cosineSampleHemisphere, cosinePdf, toWorld } from "./furnace.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const RHO = 0.18;   // the albedo the lesson uses, and the one every renderer is tested against

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE FURNACE READS THE ALBEDO BACK
 * --------------------------------------------------------------------------------------------------------- */
{
    const hi = furnace(RHO, 400000, { seed: 7 });
    say(`albedo ${RHO} in a white furnace, 400k samples -> ${hi.toFixed(6)}`);
    ok("!! *** THE FURNACE RETURNS THE ALBEDO, AND NOTHING IN THE LOOP KNOWS IT ***",
       Math.abs(hi - RHO) / RHO < 2e-3,
       `${hi.toFixed(6)} against ${RHO}, relative error ${(100 * Math.abs(hi - RHO) / RHO).toFixed(3)}%. The albedo enters as a SCALE; the factor that makes it come out right is E[cos theta] = 1/2, which falls out of the SAMPLING. A wrong sampler still renders a beautiful smooth sphere -- of the wrong brightness.`);

    // The albedo must scale out linearly -- if it did not, the estimator would be reading it somewhere it should not.
    const rows = [0.05, 0.18, 0.5, 0.9].map((a) => [a, furnace(a, 200000, { seed: 3 }) / a]);
    ok("...and the ratio is the same for every albedo, so the key is not tuned to 0.18",
       rows.every(([, r]) => Math.abs(r - 1) < 3e-3),
       rows.map(([a, r]) => a + "->" + r.toFixed(5)).join("  ") + ". A check that only ever ran at one albedo could pass on an estimator that had 0.18 baked into it.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE SAMPLER IS UNIFORM IN SOLID ANGLE -- CHECKED DIRECTLY, NOT VIA THE ANSWER
 * --------------------------------------------------------------------------------------------------------- */
{
    const rand = rng(99);
    let sum = 0, n = 300000;
    for (let i = 0; i < n; i++) sum += uniformSampleHemisphere(rand(), rand())[1];
    const mean = sum / n;
    ok("!! E[cos theta] = 1/2 for the correct sampler, measured", Math.abs(mean - 0.5) < 3e-3,
       `${mean.toFixed(5)} against exactly 0.5. THIS IS CHECKED SEPARATELY FROM THE FURNACE ON PURPOSE: if only the final number were tested, a sampler error and a compensating estimator error would cancel and both would pass.`);

    const rand2 = rng(99);
    let sum2 = 0;
    for (let i = 0; i < n; i++) sum2 += uniformThetaHemisphere(rand2(), rand2())[1];
    const mean2 = sum2 / n;
    ok("!! *** and the WRONG sampler gives E[cos theta] = 2/pi, which is why it is wrong by 4/pi ***",
       Math.abs(mean2 - 2 / Math.PI) < 3e-3,
       `${mean2.toFixed(5)} against 2/pi = ${(2 / Math.PI).toFixed(5)}. Sampling theta uniformly in [0, pi/2] LOOKS uniform and is not: it over-weights directions near the pole, because equal steps in theta cover unequal solid angle.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE THREE ERRORS, EACH WRONG BY ITS OWN PREDICTED FACTOR
 * --------------------------------------------------------------------------------------------------------- */
{
    const S = 400000;
    const got = {
        clean: furnace(RHO, S, { seed: 11 }) / RHO,
        noPdf: furnace(RHO, S, { seed: 11, noPdf: true }) / RHO,
        noCosine: furnace(RHO, S, { seed: 11, noCosine: true }) / RHO,
        badSampler: furnace(RHO, S, { seed: 11, badSampler: true }) / RHO,
    };
    for (const k of Object.keys(got)) say(`${k.padEnd(11)} -> ${got[k].toFixed(5)} x albedo   (predicted ${EXPECTED[k].toFixed(5)})`);

    ok("!! *** EACH FAULT LANDS ON ITS PREDICTED FACTOR -- NO FREE PARAMETER IN ANY OF THEM ***",
       Object.keys(got).every((k) => Math.abs(got[k] - EXPECTED[k]) / EXPECTED[k] < 5e-3),
       `dropping the PDF is ${(1 / EXPECTED.noPdf).toFixed(2)}x TOO DARK, dropping the cosine is EXACTLY 2x too bright, and the wrong sampler is 4/pi. THE FAULTS ARE TOLD APART BY WHICH RATIO THEY HIT, not by a tolerance that would lump all three under "wrong".`);

    ok("!! *** AND THE WRONG SAMPLER IS THE DANGEROUS ONE, WHICH IS THE FINDING WORTH KEEPING ***",
       // STATED AS A FACTOR, NOT A PERCENTAGE, AND MY FIRST VERSION GOT THAT WRONG: I asserted the gross faults
       // were off by more than 0.9 in absolute terms, and the missing-PDF case is 0.159 -- which is 0.84 away
       // from 1 and SIX TIMES too dark. A DIFFERENCE AND A RATIO ARE NOT THE SAME CLAIM, and for brightness the
       // ratio is the one a person perceives. The check failed a run in which every number had landed on its
       // prediction to four figures.
       ((x) => x < 1.3)(Math.max(got.badSampler, 1 / got.badSampler)) &&
       ((x) => x >= 2)(Math.max(got.noPdf, 1 / got.noPdf)) &&
       ((x) => x >= 2)(Math.max(got.noCosine, 1 / got.noCosine)),
       `it is off by a factor of ${Math.max(got.badSampler, 1 / got.badSampler).toFixed(2)} while the other two are off by ${Math.max(got.noPdf, 1 / got.noPdf).toFixed(2)}x and ${Math.max(got.noCosine, 1 / got.noCosine).toFixed(2)}x. *** A 6x or 2x error gets noticed on the first render. A 27% error JUST LOOKS LIKE A SLIGHTLY DIFFERENT MATERIAL, and it is the one a human eye signs off. That is the whole argument for having a number here instead of an image. ***`);

    ok("...and the plants are PARAMETERS, not edited copies",
       furnace(RHO, 1000, { seed: 5 }) === furnace(RHO, 1000, { seed: 5, noPdf: false, noCosine: false, badSampler: false }),
       "clean and planted runs take the SAME code path with the same seed, so a difference between them cannot be an accident of which copy ran.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE CONVERGENCE LAW: ERROR FALLS AS 1/sqrt(N), MEASURED RATHER THAN ASSERTED
 * --------------------------------------------------------------------------------------------------------- */
{
    // Averaged over seeds: ONE seed's error is a single draw from a distribution and can improve or worsen by
    // luck. The LAW is about the spread, so it needs more than one sample to be visible at all.
    const errAt = (n) => {
        let acc = 0;
        for (let s = 1; s <= 24; s++) acc += Math.abs(furnace(RHO, n, { seed: s * 7919 }) - RHO);
        return acc / 24;
    };
    const e1 = errAt(1000), e2 = errAt(4000), e3 = errAt(16000);
    const r1 = e1 / e2, r2 = e2 / e3;
    say(`mean |error| at 1k / 4k / 16k samples: ${e1.toExponential(3)} / ${e2.toExponential(3)} / ${e3.toExponential(3)}`);
    ok("!! *** QUADRUPLING THE SAMPLES HALVES THE ERROR -- Monte Carlo's 1/sqrt(N), measured ***",
       Math.abs(r1 - 2) < 0.45 && Math.abs(r2 - 2) < 0.45,
       `ratios ${r1.toFixed(3)} and ${r2.toFixed(3)} against a predicted 2.000. This is what makes path tracing expensive and it is a PROPERTY OF THE ESTIMATOR, not of the scene -- an implementation converging faster than this is biased, and one converging slower has a bug.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. THE COSINE-WEIGHTED SAMPLER, ITS PDF, AND THE FRAME TRANSFORM -- EACH CHECKED DIRECTLY, NOT VIA furnace()
 * --------------------------------------------------------------------------------------------------------- */
{
    // cosineSampleHemisphere: E[cos theta] under ITS OWN distribution is 2/3, not 1/2 -- the exact number the
    // comment above it names, and the one that makes "importance-sample AND still multiply by cos" a 0.667x
    // darkening rather than a crash.
    const rand = rng(41);
    let sum = 0, n = 300000;
    for (let i = 0; i < n; i++) sum += cosineSampleHemisphere(rand(), rand())[1];
    const mean = sum / n;
    ok("!! E[cos theta] = 2/3 under cosine-weighted sampling, measured directly on cosineSampleHemisphere",
       Math.abs(mean - 2 / 3) < 3e-3,
       `${mean.toFixed(5)} against exactly 2/3 = ${(2 / 3).toFixed(5)}. Checked on the SAMPLER itself, not through furnace()'s cosine strategy, so a compensating bug elsewhere in the estimator cannot hide a broken sampler here.`);

    // Every sample must land on the unit hemisphere: x^2+y^2+z^2=1 (Malley's method preserves length by
    // construction: r^2 + (1-r1) with r=sqrt(r1) is exactly 1) and y >= 0 (upper hemisphere only).
    const rand2 = rng(43);
    let maxLenErr = 0, minY = Infinity;
    for (let i = 0; i < 20000; i++) {
        const s = cosineSampleHemisphere(rand2(), rand2());
        maxLenErr = Math.max(maxLenErr, Math.abs(s[0] * s[0] + s[1] * s[1] + s[2] * s[2] - 1));
        minY = Math.min(minY, s[1]);
    }
    ok("!! cosineSampleHemisphere returns unit vectors confined to the upper hemisphere (y >= 0)",
       maxLenErr < 1e-9 && minY >= 0,
       `worst |len^2-1| over 20000 draws: ${maxLenErr.toExponential(2)}, minimum y: ${minY.toFixed(6)}.`);

    // cosinePdf: INT cosinePdf(cos theta) dOmega over the hemisphere must be exactly 1 -- that is what makes it
    // a pdf. Estimated with the UNIFORM sampler (a different function, with a different, already-verified pdf
    // 1/(2pi)) so the check cannot be fooled by cosinePdf and cosineSampleHemisphere sharing one bug.
    const rand3 = rng(53);
    let acc = 0, n3 = 300000;
    for (let i = 0; i < n3; i++) {
        const s = uniformSampleHemisphere(rand3(), rand3());
        acc += cosinePdf(s[1]) / (1 / (2 * Math.PI));
    }
    const estimate = acc / n3;
    ok("!! *** cosinePdf INTEGRATES TO EXACTLY 1 OVER THE HEMISPHERE, MEASURED BY IMPORTANCE SAMPLING FROM A DIFFERENT SAMPLER ***",
       Math.abs(estimate - 1) < 3e-3,
       `${estimate.toFixed(5)} against exactly 1. cosinePdf is called directly and integrated with uniformSampleHemisphere's own pdf, not cosineSampleHemisphere's -- so a normalising-constant bug shared between the pdf and the sampler that produced it (the classic way to hide one) cannot cancel here.`);
    ok("...and cosinePdf(1) = 1/pi exactly, the value straight down the normal",
       Math.abs(cosinePdf(1) - 1 / Math.PI) < 1e-15,
       `${cosinePdf(1)} against ${1 / Math.PI}.`);

    // toWorld: the frame's own local axes must map back to exactly what createCoordinateSystem built them from
    // -- local +Y (the "up" every sampler here returns as its cosine/solid-angle axis) must land on N itself,
    // and local +X / +Z must land on Nb / Nt, because those are the basis toWorld is defined in terms of.
    const N = [0.2672612419124244, 0.5345224838248488, 0.8017837257372732]; // a normalized, non-axis-aligned N
    const { Nt, Nb } = createCoordinateSystem(N);
    const up = toWorld([0, 1, 0], N, Nt, Nb);
    const ex = toWorld([1, 0, 0], N, Nt, Nb);
    const ez = toWorld([0, 0, 1], N, Nt, Nb);
    ok("!! *** toWorld MAPS THE FRAME'S OWN LOCAL AXES BACK ONTO N, Nb AND Nt -- EXACTLY, NOT WITHIN TOLERANCE ***",
       up.every((v, i) => v === N[i]) && ex.every((v, i) => v === Nb[i]) && ez.every((v, i) => v === Nt[i]),
       `local +Y -> [${up.map((v) => v.toFixed(6))}] against N [${N.map((v) => v.toFixed(6))}]; local +X -> Nb, local +Z -> Nt. Every sampler in this file returns its cosine axis as the middle component, so if toWorld put N in the wrong slot every furnace reading above would be shading with the wrong normal while still looking like a smooth sphere.`);

    // And it must be an isometry: an orthonormal change of basis preserves length, for a vector that is not
    // one of the axes (which would trivially pass via the exact check above).
    const rand4 = rng(61);
    let maxDelta = 0;
    for (let i = 0; i < 5000; i++) {
        const s = [rand4() * 2 - 1, rand4() * 2 - 1, rand4() * 2 - 1];
        const sLen = Math.hypot(...s);
        const w = toWorld(s, N, Nt, Nb);
        maxDelta = Math.max(maxDelta, Math.abs(Math.hypot(...w) - sLen));
    }
    ok("!! toWorld preserves vector length for arbitrary (non-axis) local vectors, as an orthonormal transform must",
       maxDelta < 1e-9,
       `worst |len(toWorld(s)) - len(s)| over 5000 random s: ${maxDelta.toExponential(2)}. A dropped or duplicated term in the linear combination would show up here even on directions the two exact axis checks above do not exercise.`);
}

console.log(fails ? "\nfurnace-selfcheck: " + fails + " FAILED" : "\nfurnace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
