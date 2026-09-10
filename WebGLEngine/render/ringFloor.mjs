/**
 * THE RING'S NOISE FLOOR, DERIVED FROM WHAT A RENDERER HOLDS.
 *
 * v4557 built ridgeMarginBounds and it refuses to run without a measured `noiseFloor`. v4558 and v4559
 * measured that floor -- but both measured it against ANALYTIC TRUTH, evaluating the surface the fixture was
 * drawn from. A renderer has no such surface. So ridgeMarginBounds has sat since v4557 demanding a number
 * that only an oracle could supply, which makes it a control nobody can call.
 *
 * This module supplies it from the frame and the motion vectors, and nothing else.
 *
 * *** THE IDENTITY. *** Interpolating g, sampled at integers, at x = n + f leaves exactly
 *
 *     g(n + f) - [(1 - f) g(n) + f g(n + 1)] = -1/2 f (1 - f) g''(xi),    xi in (n, n + 1)
 *
 * Both factors are in the renderer's hands: f is frac(hu * w), straight out of the motion vectors, and g''
 * is the frame's own second difference. The identity predicts, with no fitted constant, everything v4559
 * measured -- exact at integer displacements because f(1-f) is zero there; quadratic in cycles per pixel
 * because the second derivative of a sinusoid is; saturating above Nyquist because the sampled second
 * difference cannot exceed the content's range.
 *
 * *** THE DEPTH IS DERIVED TOO, AND IT IS NOT (1 + P) / 2. *** pushLuma writes the current luma into the
 * newest slot and reprojects every other slot by one bilinear fetch, so slot k has been resampled
 * (F - 1 - k) times. lumaMean averages slots P..F-1, which is resample depths 0..P-1, so the mean depth is
 * (P - 1) / 2. The newest slot is FRESH -- never reprojected -- and that is why a P = 1 ring has a floor of
 * exactly zero rather than one bilinear step's worth. Measured: 0.000e+0 at P = 1, and 0.48 / 1.36 / 2.46
 * of one step's error at P = 2 / 4 / 8 against a predicted 0.5 / 1.5 / 3.5.
 *
 * *** AND THE IDENTITY IS VOID AT A STEP, WHICH IS HALF OF WHY THIS FILE IS NOT ONE LINE. *** Taylor needs a
 * bounded second derivative and a step does not have one. Measured, the Taylor term alone under-predicts a
 * chequer's floor by 4x -- an UNSAFE bound, which for a margin is the dangerous direction. Where the field is
 * not resolved the bound is the step's own: a bilinear fetch between two taps differing by d is wrong by at
 * most max(f, 1 - f) * d, which is near-exact for a chequer (3.00x) and an edge (1.38x) and 141x LOOSE on a
 * smooth sinusoid. Neither bound serves alone; the regime has to be decided per pixel.
 */

/**
 * *** THE REGIME TEST, AND MY FIRST TWO WERE BOTH WRONG IN THE SAME WAY. ***
 *
 *   |D2| < |first difference|   reads every EXTREMUM of a smooth sinusoid as a step -- the slope vanishes
 *                               there while the curvature is maximal. It flagged 7% of the arc's own smooth
 *                               fixture and that false 7% dominated the worst-over-frame, taking the
 *                               estimate from 1.04x of truth to 9.93x.
 *   |D3| < |D2|                 moves the same degeneracy to the INFLECTIONS, where D2 passes through zero.
 *                               6-8% flagged, and the estimate got worse still: 95x.
 *
 * Both compared against a quantity that VANISHES somewhere on a perfectly smooth field. The test has to be
 * normalised by something that does not, and the local range is the only such scale -- it vanishes only on a
 * flat field, where every bound is zero anyway and the regime does not matter.
 *
 * Measured on the four contents, |D3| / range is 0.0021 and 0.0421 at worst where the field is resolved and
 * 1.0 at least where it is not: a gap of 24x with nothing in it.
 *
 * *** TAU NAMES A RESOLUTION, NOT A PREFERENCE. *** A sinusoid at n samples per period has
 * |D3| / range = (2 pi / n)^3 / 2, so a threshold tau is the resolution n = 2 pi / (2 tau)^(1/3). At 0.25
 * that is 7.9 samples per period: above about eight pixels per cycle Taylor is trusted, below it the step
 * bound takes over. Nyquist is 2 and v4559 measured the arc's margin crossing at 12, so the changeover sits
 * between them. The four measured contents sit at roughly 71, 18, 2 and 1 samples per period -- none of them
 * is near 7.9, so none of them set it.
 */
export const RESOLUTION_TAU = 0.25;

/** The resolution a threshold names, in samples per period -- tau's meaning, stated in v4559's own units. */
export function samplesPerPeriodAt(tau = RESOLUTION_TAU) {
    if (!(tau > 0)) throw new Error("samplesPerPeriodAt: tau must be positive");
    return 2 * Math.PI / Math.cbrt(2 * tau);
}

/**
 * How many bilinear resamples the jitter-free mean carries, on average.
 * DERIVED from lumaMean's slot range, not fitted: it averages resample depths 0..P-1.
 */
export function resampleDepth(period) {
    if (!Number.isInteger(period) || period < 1) throw new Error("resampleDepth: period must be a positive integer");
    return (period - 1) / 2;
}

/** Second differences either side of the tap interval, and the local range that normalises the regime test. */
function neighbourhood(L, i, stride) {
    const d2a = L[i - stride] - 2 * L[i] + L[i + stride];
    const d2b = L[i] - 2 * L[i + stride] + L[i + 2 * stride];
    let lo = Infinity, hi = -Infinity;
    for (let k = -2; k <= 2; k++) { const q = L[i + k * stride]; if (q < lo) lo = q; if (q > hi) hi = q; }
    return { d3: Math.abs(d2b - d2a), d2: Math.max(Math.abs(d2a), Math.abs(d2b)), step: Math.max(Math.abs(L[i] - L[i - stride]), Math.abs(L[i + stride] - L[i])), range: hi - lo };
}

/**
 * The floor the ring mean will carry this frame, per pixel and frame-wide.
 *
 * `luma` is a scalar field, `motion` the four-component motion buffer pushLuma is given. The border of three
 * is the estimator's own stencil, not a fudge: the regime test reads two texels either side.
 *
 * The curvature surrogate is D2max + |D3|, not D2max. The identity's xi lies INSIDE the tap interval and the
 * second difference varies across that interval by at most the third, so the larger endpoint alone can
 * under-predict -- measured at 0.98x of truth on the finer sinusoid, unsafe by 2%. Adding |D3| costs 10% of
 * tightness and buys a bound that did not go under on any content or period measured.
 */
export function ringFloorCPU(luma, motion, w, h, period, tau = RESOLUTION_TAU) {
    if (!luma || luma.length < w * h) throw new Error("ringFloorCPU: luma must be a scalar field of w*h");
    if (w < 7 || h < 7) throw new Error("ringFloorCPU: the estimator's stencil needs at least 7x7");
    const depth = resampleDepth(period);
    const per = new Float32Array(w * h);
    let worst = 0, unresolved = 0, total = 0;
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
        const i = y * w + x, o = i * 4;
        const hu = (x + 0.5) / w + (motion ? motion[o] : 0);
        const hv = (y + 0.5) / h + (motion ? motion[o + 1] : 0);
        const fx = hu * w - 0.5 - Math.floor(hu * w - 0.5);
        const fy = hv * h - 0.5 - Math.floor(hv * h - 0.5);
        const X = neighbourhood(luma, i, 1), Y = neighbourhood(luma, i, w);
        const rx = X.range > 1e-6 && X.d3 / X.range < tau;
        const ry = Y.range > 1e-6 && Y.d3 / Y.range < tau;
        const ex = rx ? depth * 0.5 * fx * (1 - fx) * (X.d2 + X.d3) : Math.max(fx, 1 - fx) * X.step;
        const ey = ry ? depth * 0.5 * fy * (1 - fy) * (Y.d2 + Y.d3) : Math.max(fy, 1 - fy) * Y.step;
        per[i] = ex + ey;
        total++; if (!rx || !ry) unresolved++;
        if (per[i] > worst) worst = per[i];
    }
    // *** total, NOT w*h. *** A fraction over pixels the estimator never visited would read low for a reason
    // that has nothing to do with the content -- the arc has written that absence-as-measurement twice.
    return { worst, per, unresolved, total, unresolvedFraction: total ? unresolved / total : 0, depth };
}
