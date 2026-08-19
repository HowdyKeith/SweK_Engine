// WebGLEngine/physics/render/importance-selfcheck.mjs -- v3468
//
// Run: node physics/render/importance-selfcheck.mjs
//
// *** THE CLAIM OF IMPORTANCE SAMPLING IS THAT IT CHANGES THE NOISE AND NOT THE ANSWER. That is a
// parameter-that-must-not-matter key in its purest form, and the parameter is THE ALGORITHM ITSELF. ***
//
// Cosine-weighted sampling draws directions in proportion to cos(theta) -- the very term the rendering equation
// multiplies by -- so the pdf, cos(theta)/pi, cancels the cosine in the estimator.
//
// AND THE FURNACE TEST GOES **EXACT** UNDER IT, WHICH IS THE FINDING OF THIS ROUND. With a constant environment
// every sample returns albedo, so the variance is ZERO and ONE SAMPLE IS ENOUGH. *** THE KEY THAT GRADED THE
// UNIFORM SAMPLER CANNOT GRADE THIS ONE: it becomes unfalsifiable exactly when the implementation improves. A
// convergence check against a constant furnace would report a perfect 1/sqrt(N) fit on an estimator that never
// converges because it starts correct. *** So this file adds a NON-CONSTANT environment whose answer is still
// analytic, and measures the variance there instead. THE FIXTURE HAD TO GET HARDER BECAUSE THE CODE GOT BETTER.
"use strict";
import { furnace, EXPECTED_COSINE, cosineSampleHemisphere, rng } from "./furnace.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const RHO = 0.18;

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE ANSWER DOES NOT MOVE
 * --------------------------------------------------------------------------------------------------------- */
{
    const u = furnace(RHO, 200000, { seed: 5 }) / RHO;
    const c = furnace(RHO, 200000, { seed: 5, strategy: "cosine" }) / RHO;
    say(`uniform ${u.toFixed(6)} x albedo | cosine ${c.toFixed(6)} x albedo`);
    ok("!! *** BOTH STRATEGIES RETURN THE ALBEDO -- the sampling changed and the answer did not ***",
       Math.abs(u - 1) < 3e-3 && Math.abs(c - 1) < 1e-9,
       "THE PARAMETER THAT MUST NOT MATTER HERE IS THE ALGORITHM. Two different distributions, two different pdfs, one answer -- and they share ONE estimator, so a difference between them could not have been a difference between two bodies of code.");

    ok("!! *** AND COSINE SAMPLING IS EXACT ON A CONSTANT FURNACE -- ONE SAMPLE, ZERO ERROR ***",
       Math.abs(furnace(RHO, 1, { seed: 5, strategy: "cosine" }) / RHO - 1) < 1e-12,
       `a SINGLE sample lands on the albedo to machine precision, because every sample returns exactly the same value: the cosine cancels against the pdf and a constant radiance leaves nothing to vary. *** THAT IS WHY THIS FILE EXISTS. THE FURNACE KEY BECOMES UNFALSIFIABLE THE MOMENT THE SAMPLER IMPROVES -- a convergence check run here would report a flawless fit on an estimator that never converges because it starts correct. A KEY THAT GETS WEAKER AS THE CODE GETS BETTER MUST BE REPLACED, NOT RELAXED. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE CLASSIC BUG: NEW SAMPLER, OLD PDF
 * --------------------------------------------------------------------------------------------------------- */
{
    const w = furnace(RHO, 200000, { seed: 5, strategy: "cosine", wrongPdf: true }) / RHO;
    say(`cosine sampler with the UNIFORM pdf -> ${w.toFixed(5)} x albedo (predicted ${EXPECTED_COSINE.wrongPdf.toFixed(5)})`);
    ok("!! *** CHANGING THE SAMPLER AND FORGETTING THE PDF PREDICTS 4/3, AND MEASURES IT ***",
       Math.abs(w - 4 / 3) / (4 / 3) < 5e-3,
       "E[cos theta] under a cosine-weighted distribution is 2/3, and the uniform pdf leaves a factor of 2 behind: 2 * 2/3 = 4/3. *** IT IS A 33% BRIGHTENING -- the same dangerous magnitude as v3467's uniform-theta fault, and for the same reason: big enough to be wrong, small enough to look like a material choice. This is the commonest importance-sampling bug there is. ***");

    // The distribution is checked directly too, not only through the answer.
    const rand = rng(31);
    let acc = 0, n = 200000;
    for (let i = 0; i < n; i++) acc += cosineSampleHemisphere(rand(), rand())[1];
    ok("...and E[cos theta] under cosine weighting is 2/3, measured", Math.abs(acc / n - 2 / 3) < 3e-3,
       `${(acc / n).toFixed(5)} against 2/3 = ${(2 / 3).toFixed(5)}. Checked apart from the estimator so a sampler error and a pdf error cannot cancel into a passing answer.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. A HARDER ENVIRONMENT, BECAUSE THE EASY ONE STOPPED GRADING
 * --------------------------------------------------------------------------------------------------------- */
{
    // Li(w) = 1 + k cos(theta). Still analytic:
    //   L = (rho/pi) * INT (1 + k cos) cos dw = (rho/pi) * (pi + k * 2pi/3) = rho * (1 + 2k/3)
    // using INT cos dw = pi and INT cos^2 dw = 2pi/3 over the hemisphere. NOTHING IN THE LOOP KNOWS THIS VALUE.
    const K = 3;
    const N = [0, 1, 0];
    const radiance = (d) => 1 + K * Math.max(0, d[0] * N[0] + d[1] * N[1] + d[2] * N[2]);
    const exact = RHO * (1 + 2 * K / 3);
    const u = furnace(RHO, 400000, { seed: 5, radiance });
    const c = furnace(RHO, 400000, { seed: 5, radiance, strategy: "cosine" });
    say(`gradient sky, k=${K}: exact ${exact.toFixed(6)} | uniform ${u.toFixed(6)} | cosine ${c.toFixed(6)}`);

    ok("!! *** BOTH STRATEGIES HIT AN ANALYTIC ANSWER THE LOOP WAS NEVER TOLD ***",
       Math.abs(u - exact) / exact < 4e-3 && Math.abs(c - exact) / exact < 4e-3,
       `rho * (1 + 2k/3) = ${exact.toFixed(6)}, from INT cos dw = pi and INT cos^2 dw = 2pi/3. A SECOND EXACT KEY, and it survives the sampler improving -- which the constant furnace did not.`);

    // Variance, over seeds, at a sample count low enough for the difference to show.
    const spread = (opts) => {
        const xs = [];
        for (let s = 1; s <= 40; s++) xs.push(furnace(RHO, 256, { seed: s * 7919, radiance, ...opts }));
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
    };
    const su = spread({}), sc = spread({ strategy: "cosine" });
    say(`std-dev over 40 seeds at 256 samples: uniform ${su.toExponential(3)} | cosine ${sc.toExponential(3)} | ratio ${(su / sc).toFixed(2)}x`);

    ok("!! *** AND THE NOISE FALLS WHILE THE ANSWER STAYS -- WHICH IS THE ENTIRE CLAIM OF IMPORTANCE SAMPLING ***",
       sc < su,
       `cosine weighting is ${(su / sc).toFixed(2)}x tighter at the same sample count. *** THE ANSWER IS UNCHANGED AND THE SPREAD IS NOT: that pairing is the claim, and EITHER HALF ALONE WOULD BE MEANINGLESS. A method that lowered the variance and moved the answer would just be a different, wrong integral -- which is exactly what the wrongPdf case above is. ***`);
}

console.log(fails ? "\nimportance-selfcheck: " + fails + " FAILED" : "\nimportance-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
