// WebGLEngine/tools/roundhouse/trendVsNoise.mjs — v3527
// ---------------------------------------------------------------------------------------------------------------
// IS THE TREND BIGGER THAN THE NOISE IT SITS IN? — the question criterion 2 asks backwards.
//
// PROVENANCE. NVlabs/QeRL (Apache-2.0, ICLR 2026) headlines a claim worth arguing with: quantization noise
// increases policy entropy and therefore IMPROVES exploration, so they schedule the noise deliberately. No code
// is lifted -- it is CUDA on an H100 and this lab trains nothing. What transfers is the SHAPE of the claim, and
// the shape is the exact inverse of criterion 2.
//
// Criterion 2 says: a nuisance parameter is a knob the physics says CANNOT matter, so vary it and the answer must
// not move. QeRL says: this knob does matter, and helpfully. Both are claims about a knob that carries no
// physics, and both are only meaningful if THE EFFECT IS LARGER THAN THE SCATTER THE KNOB ALREADY PRODUCES.
//
// *** AND THIS LAB HAS A STANDING CASE OF GETTING THAT WRONG. *** ising.L -- a beautiful convergence that is
// noise. A trend read off a sweep looks like a result; the same numbers re-run at different seeds move by more
// than the trend does. corroborate() already computes seedSpread for a single point. Nothing has ever compared a
// TREND against it.
//
// SO THE INSTRUMENT IS: sweep a parameter, take an ensemble of seeds AT EACH POINT, and refuse to call the
// difference a trend unless it clears the scatter. Three verdicts, and the middle one is the point:
//
//   RESOLVED    -- the change across the sweep exceeds the within-point spread by the required margin.
//   UNRESOLVED  -- it does not. NOT "no effect": the measurement cannot tell, and saying so is the answer.
//   VACUOUS     -- the seeds returned bit-identical values, so the knob never reached the computation and the
//                  spread is zero for the wrong reason. Same house rule as corroborate's seedVacuous: a
//                  denominator of zero is not infinite confidence.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (xs.length - 1));
};

/**
 * measure({ value, seed }) -> number. `values` is the swept parameter; `seeds` the ensemble at each point.
 *
 * `margin` is how many within-point standard deviations the end-to-end change must clear. It defaults to 3,
 * which is a CHOICE and not a measurement -- stated here rather than buried, because this file exists to stop
 * people quoting effects they cannot resolve.
 */
export function trendVsNoise({ measure, values, seeds = [1, 2, 3, 4, 5], margin = 3 }) {
    if (typeof measure !== "function") throw new Error("trendVsNoise: measure must be a function");
    if (!Array.isArray(values) || values.length < 2) throw new Error("trendVsNoise: need at least two swept values");
    if (seeds.length < 2) throw new Error("trendVsNoise: need at least two seeds -- the whole question is the within-point scatter, and one seed has none");

    const points = values.map((value) => {
        const rep = seeds.map((seed) => measure({ value, seed }));
        return { value, replicates: rep, mean: mean(rep), sd: sd(rep),
                 identical: rep.every((v) => Object.is(v, rep[0])) };
    });

    const vacuous = points.every((p) => p.identical);
    // the noise floor is the TYPICAL within-point scatter, not the smallest or the largest
    const noise = mean(points.map((p) => p.sd));
    const first = points[0].mean, last = points[points.length - 1].mean;
    const change = last - first;
    const span = Math.max(...points.map((p) => p.mean)) - Math.min(...points.map((p) => p.mean));

    // monotonicity is reported but NOT used to decide: a monotone sequence of noise is still noise, and this is
    // exactly how a beautiful convergence gets believed
    const means = points.map((p) => p.mean);
    const up = means.every((v, i) => i === 0 || v >= means[i - 1]);
    const down = means.every((v, i) => i === 0 || v <= means[i - 1]);

    const ratio = noise > 0 ? Math.abs(change) / noise : (change === 0 ? 0 : Infinity);
    const verdict = vacuous ? "VACUOUS" : (ratio >= margin ? "RESOLVED" : "UNRESOLVED");

    return {
        verdict, points, noise, change, span, ratio, margin,
        monotone: up || down,
        why: vacuous
            ? "every seed returned a bit-identical value, so the seed knob never reached the computation. The scatter is zero for the wrong reason and no trend can be resolved against it."
            : verdict === "RESOLVED"
                ? `the end-to-end change of ${change.toPrecision(4)} is ${ratio.toFixed(1)}x the within-point scatter of ${noise.toPrecision(4)}`
                : `the end-to-end change of ${change.toPrecision(4)} is only ${ratio.toFixed(1)}x the within-point scatter of ${noise.toPrecision(4)}, below the ${margin}x required. This is NOT a statement that the effect is absent -- it is a statement that this measurement cannot tell.`,
    };
}

/**
 * THE INVERTED CLAIM, PUT DIRECTLY. QeRL asserts that adding noise IMPROVES a metric. Criterion 2 asserts that a
 * nuisance knob cannot move it at all. Both are answerable by the same sweep, and the honest outcome for either
 * is usually the middle one.
 *
 * `better` says which direction counts as improvement, so the caller cannot decide after seeing the numbers.
 */
export function noiseHelps({ measure, noiseLevels, seeds, better = "higher", margin = 3 }) {
    const t = trendVsNoise({ measure, values: noiseLevels, seeds, margin });
    if (t.verdict !== "RESOLVED") return { ...t, helps: null,
        claim: "UNSUPPORTED -- and unsupported is not refuted. " + t.why };
    const improved = better === "higher" ? t.change > 0 : t.change < 0;
    return { ...t, helps: improved,
        claim: improved
            ? "SUPPORTED at this margin: the metric moved in the declared better direction by more than the scatter"
            : "CONTRADICTED at this margin: the metric moved the WRONG way by more than the scatter, which is a stronger result than an unresolved sweep" };
}
