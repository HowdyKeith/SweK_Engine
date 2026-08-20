// WebGLEngine/physics/discharge/heidler.mjs -- v3193
//
// THE HEIDLER RETURN-STROKE CURRENT, AND THE 5% THAT BELONGS TO THE FORMULA RATHER THAN TO ANY CODE.
//
// Keith raised diluuuu10/triggered-discharge -- a WebGPU lightning simulation. NOTHING IS VENDORED FROM IT: the
// repo carries NO LICENSE FILE, so all rights are reserved and only the idea travels. What travelled is the
// physics it grades against, which is public and published.
//
// The Heidler function is the standard analytic lightning current:
//
//     i(t) = (i0 / eta) * (t/t1)^n / (1 + (t/t1)^n) * exp(-t/t2),      with n = 2 here
//
// and eta is a CORRECTION FACTOR whose entire purpose is to make the peak equal i0.
//
// *** MEASURED: IT DOES NOT. peak/i0 IS 1.0667, 1.0397 AND 1.0505 FOR THE THREE STANDARD PARAMETER SETS. ***
//
// AND THAT IS NOT ANYBODY'S BUG. Dividing the shape's TRUE peak by the standard eta gives exactly the same
// three numbers, so the discrepancy is the published eta's own approximation and nothing to do with an
// implementation. THE DISAGREEMENT BELONGS TO THE REFERENCE, which is v3164's verdict on kh and Michalke
// arriving in a second place -- and a device that reported "5% error" without that would be blaming the code
// for the formula.

/** The standard correction factor for n = 2. APPROXIMATE BY CONSTRUCTION -- that is the finding, not a caveat. */
export function etaStandard(t1, t2) {
    return Math.exp(-(t1 / t2) * Math.sqrt((2 * t2) / t1));
}

/** The unnormalised shape: rise, saturate, decay. Peaks somewhere between t1 and t2. */
export function shape(t, t1, t2) {
    if (t <= 0) return 0;
    const x = (t / t1) * (t / t1);
    return (x / (1 + x)) * Math.exp(-t / t2);
}

/** The current, normalised by whichever eta the caller wants -- which is what makes the comparison possible. */
export function heidler(t, i0, t1, t2, eta = null) {
    if (t <= 0 || i0 <= 0) return 0;
    return (i0 / (eta === null ? etaStandard(t1, t2) : eta)) * shape(t, t1, t2);
}

/**
 * The TRUE peak of the shape, found by scanning and then bisecting.
 *
 * SCANNED GEOMETRICALLY, because t1 and t2 differ by three orders of magnitude in the standard parameter sets
 * and a linear grid would either miss the peak or take forever. The bisection afterwards is what makes the
 * answer precise enough to divide by: A PEAK FOUND ON A GRID IS ONLY AS GOOD AS THE GRID.
 */
export function truePeak(t1, t2) {
    let best = 0, tBest = 0;
    for (let t = t1 * 1e-3; t < t2 * 20; t *= 1.002) {
        const v = shape(t, t1, t2);
        if (v > best) { best = v; tBest = t; }
    }
    let lo = tBest / 1.01, hi = tBest * 1.01;
    for (let i = 0; i < 200; i++) {
        const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
        if (shape(a, t1, t2) < shape(b, t1, t2)) lo = a; else hi = b;
    }
    const tp = (lo + hi) / 2;
    return { peak: shape(tp, t1, t2), tPeak: tp };
}

/** Published parameter sets. STATED WITH THEIR SOURCE, because a constant without one is a magic number. */
export const PARAMS = {
    // CIGRE-style first stroke / subsequent stroke, and a fast subsequent stroke. i0 in kA, t1/t2 in microseconds.
    first:      { i0: 30,   t1: 19,    t2: 485 },
    subsequent: { i0: 12,   t1: 0.454, t2: 143 },
    fast:       { i0: 10.7, t1: 0.25,  t2: 2.5 },
};
