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
import { furnace, EXPECTED, uniformSampleHemisphere, uniformThetaHemisphere, createCoordinateSystem, rng,
         cosinePdf, cosineSampleHemisphere, toWorld } from "./furnace.mjs";

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
 * 5. *** cosinePdf, AND THE WHOLE v3468 COSINE ARC THIS GATE HAD NEVER DRIVEN ***
 *
 * v3904 -- definitionGates flagged cosinePdf as a definition its own gate does not name, and pulling that
 * thread found the flagged export was the visible tip: THE WORD "strategy" DOES NOT APPEAR IN THIS FILE
 * EITHER, so `strategy: "cosine"`, cosineSampleHemisphere and EXPECTED_COSINE were all shipped ungraded here.
 * (EXPECTED_COSINE is invisible to definitionGates entirely -- its scan reads `export const NAME = (` and
 * `export function NAME`, and an exported TABLE matches neither. The instrument found one of four.)
 *
 * AND THE PDF IS NOT A DETAIL OF THE ESTIMATOR: it is what makes the cosine-weighted integrand CONSTANT, so
 * the two faults it can carry are told apart by something the mean cannot see. That is the section.
 * --------------------------------------------------------------------------------------------------------- */
{
    // ---- 5a. IT IS A DENSITY -------------------------------------------------------------------------------
    let s = 0; const N = 200000, dth = (Math.PI / 2) / N;
    for (let i = 0; i < N; i++) { const th = (i + 0.5) * dth; s += cosinePdf(Math.cos(th)) * Math.sin(th) * dth; }
    const mass = s * 2 * Math.PI;
    ok("cosinePdf integrates to 1 over the hemisphere", Math.abs(mass - 1) < 1e-6,
       `INT (cos/pi) dw = ${mass.toFixed(12)}. The pi is the normalising constant and nothing else -- INT cos dw over a hemisphere IS pi.`);

    // ---- 5b. THE CANCELLATION, MEASURED IN ULPS RATHER THAN ASSUMED EXACT -----------------------------------
    //
    // *** THE CLAIM THE MODULE MAKES IS THAT THE COSINE CANCELS AGAINST THE PDF. IT DOES NOT CANCEL EXACTLY --
    // IT CANCELS TO ONE ULP, and stating it as an equality would have been the same armchair mistake morphAt's
    // header records ("a + 1*(b-a) IS b IN IEEE-754" -- false, and the gate caught it). Measured over 100,000
    // cosines, cos / cosinePdf(cos) departs from pi by at most 4.44e-16 against an ulp of 6.98e-16. ***
    let worst = 0;
    for (let i = 1; i <= 100000; i++) { const c = i / 100000; worst = Math.max(worst, Math.abs(c / cosinePdf(c) - Math.PI)); }
    ok("!! *** cos / cosinePdf(cos) IS pi TO WITHIN ONE ULP, WHICH IS WHY THE ESTIMATOR CARRIES NO COSINE ***",
       worst <= Number.EPSILON * Math.PI,
       `worst departure ${worst.toExponential(3)} against ulp(pi) = ${(Number.EPSILON * Math.PI).toExponential(3)}, over 100,000 values. NOT ASSERTED AS AN EXACT IDENTITY, because it is not one -- the division rounds. It is asserted at the precision it actually holds at.`);

    // ---- 5c. THE CONSEQUENCE: A ZERO-VARIANCE ESTIMATOR, NOT MERELY A BETTER ONE ----------------------------
    //
    // If the integrand is constant, every sample returns the same number and the average is exact at ONE
    // sample. That is the textbook statement of perfect importance sampling and it is almost never
    // demonstrable -- here it is, because the furnace's radiance really is constant.
    const spread = (opts, n = 2000) => {
        const v = [];
        for (let k = 1; k <= 24; k++) v.push(furnace(RHO, n, { seed: k * 7919, ...opts }));
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        return { mean: m / RHO, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) / RHO };
    };
    const uni = spread({}), cos = spread({ strategy: "cosine" }), bad = spread({ strategy: "cosine", wrongPdf: true });
    say(`24 seeds at 2000 samples -- uniform: mean ${uni.mean.toFixed(6)} sd ${uni.sd.toExponential(3)}`);
    say(`                            cosine:  mean ${cos.mean.toFixed(6)} sd ${cos.sd.toExponential(3)}`);
    say(`                            wrongPdf: mean ${bad.mean.toFixed(6)} sd ${bad.sd.toExponential(3)}`);
    ok("!! *** IMPORTANCE-SAMPLING WITH THIS PDF MAKES THE INTEGRAND CONSTANT: THE VARIANCE IS ZERO, NOT SMALL ***",
       cos.sd < 1e-14 && uni.sd > 1e-3 && Math.abs(cos.mean - 1) < 1e-9,
       `${cos.sd.toExponential(2)} against the uniform sampler's ${uni.sd.toExponential(2)} -- THIRTEEN ORDERS OF MAGNITUDE, and it is not "better sampling". Every sample contributes exactly pi because the cosine cancels, so the estimator is EXACT AT ONE SAMPLE. The answer is also unmoved, which is v3468's claim: changing the sampling must not change the answer.`);

    // ---- 5d. THE PDF IS THE SAMPLER'S OWN DENSITY, NOT A SECOND OPINION ABOUT IT ----------------------------
    //
    // A pdf and a sampler that disagree are the commonest importance-sampling bug there is, and they are
    // written in two adjacent lines of the module where a reader would never see it. Malley's method draws
    // cos^2 = 1 - u1, so the cdf is c^2 and the inversion is exact arithmetic.
    let worstU = 0;
    for (let i = 0; i <= 1000; i++) { const u = i / 1000, y = cosineSampleHemisphere(u, 0.3)[1]; worstU = Math.max(worstU, Math.abs((1 - y * y) - u)); }
    ok("!! the sampler inverts the cdf THIS pdf implies: 1 - cos^2 returns the u it was handed",
       worstU < 1e-14,
       `worst ${worstU.toExponential(2)}. P(cos < c) = c^2 is the integral of cosinePdf, so this ties the two lines together instead of trusting that whoever wrote them meant the same distribution.`);
    const rand = rng(4242);
    let inv = 0; const M = 200000;
    for (let i = 0; i < M; i++) inv += 1 / cosinePdf(cosineSampleHemisphere(rand(), rand())[1]);
    inv /= M;
    ok("...and Monte Carlo agrees from the other direction: E[1/pdf] is the hemisphere's solid angle",
       Math.abs(inv - 2 * Math.PI) / (2 * Math.PI) < 5e-3,
       `${inv.toFixed(6)} against 2pi = ${(2 * Math.PI).toFixed(6)} over ${M} samples. A pdf wrong by ANY constant fails this, including one that still integrates to 1 on a grid the sampler never visits.`);

    // ---- 5e. TWO FAULTS, AND THE MEAN CANNOT TELL THEM APART -----------------------------------------------
    //
    // *** THIS IS THE FINDING WORTH KEEPING FROM THE SECTION. A pdf wrong by a CONSTANT and a pdf wrong in
    // SHAPE are both "the wrong pdf" and they are different defects: the constant one is a pure bias with the
    // variance still at zero, and the shape one restores the variance the importance sampling was bought to
    // remove. A gate reading only the mean would call them the same fault. ***
    const constWrong = (() => {
        const v = [];
        for (let k = 1; k <= 24; k++) {
            const r = rng(k * 7919), Nrm = [0, 1, 0], { Nt, Nb } = createCoordinateSystem(Nrm);
            let sum = 0;
            for (let i = 0; i < 2000; i++) {
                const dir = toWorld(cosineSampleHemisphere(r(), r()), Nrm, Nt, Nb);
                const c = Math.max(0, dir[0] * Nrm[0] + dir[1] * Nrm[1] + dir[2] * Nrm[2]);
                sum += c / (cosinePdf(c) / 2);                      // the pdf wrong by a factor of two, nothing else
            }
            v.push((RHO / Math.PI) * (sum / 2000));
        }
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        return { mean: m / RHO, sd: Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) / RHO };
    })();
    say(`a pdf wrong by a CONSTANT (half of cosinePdf): mean ${constWrong.mean.toFixed(6)} sd ${constWrong.sd.toExponential(3)}`);
    ok("!! *** SABOTAGE: A CONSTANT-WRONG PDF IS PURE BIAS -- EXACTLY 2x, WITH THE VARIANCE STILL AT ZERO ***",
       Math.abs(constWrong.mean - 2) < 1e-9 && constWrong.sd < 1e-14,
       "the integrand stays constant, so the estimator remains exact -- about the wrong number. NO AMOUNT OF SAMPLING FINDS THIS, and a convergence check would report a perfectly converged renderer.");
    ok("!! ...while a SHAPE-wrong pdf lands on 4/3 AND brings the variance back",
       Math.abs(bad.mean - 4 / 3) < 5e-3 && bad.sd > 1e-3,
       `mean ${bad.mean.toFixed(6)} against the module's predicted ${(4 / 3).toFixed(6)}, sd ${bad.sd.toExponential(2)} against the clean ${cos.sd.toExponential(2)}. TWO FAULTS SEPARATED BY A NUMBER THE MEAN DOES NOT CONTAIN: sample the NDF and divide by the cosine pdf and you get both a bias and your variance back; scale the pdf and you get only the bias.`);
}

console.log(fails ? "\nfurnace-selfcheck: " + fails + " FAILED" : "\nfurnace-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
