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

/**
 * *** AND THE ESTIMATE HAS A FLOOR OF ITS OWN, WHICH v4560 RETURNED AS EXACTLY ZERO. ***
 *
 * At an INTEGER displacement f(1-f) is exactly zero, so the Taylor term is exactly zero, so on resolved
 * content the estimator returned 0. A floor of zero is the answer v4561's own sampling section calls the most
 * dangerous one there is: ridgeMarginBounds turns noiseFloor 0 into margin 0, and a margin of zero makes
 * every fluctuation a feature. The ring is NOT exact there -- it is exact up to the arithmetic, and the
 * arithmetic has a floor.
 *
 * MEASURED at an exactly-integer displacement on four contents spanning a 64x range of magnitude: the ring
 * mean's error divided by (f32 epsilon * the local magnitude) reads 1.05, 1.05, 1.05 and 0.54. So the floor
 * is ONE ULP of the local magnitude, and it scales with magnitude rather than being an absolute number --
 * which matters, since an HDR caller's values are not in [0, 1].
 *
 * The bound is set at TWO ulps. That is the measurement rounded up to the next power of two, and it is
 * labelled as such rather than dressed as a derivation: the (P+1)/2-ulp argument from summing P values and
 * dividing predicts 4.5 and over-predicts the measurement by 4x, so it is not what is used.
 */
export const EPS_F32 = 1.1920928955078125e-7;
export const ARITHMETIC_ULPS = 2;

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
    let lo = Infinity, hi = -Infinity, mag = 0;
    for (let k = -2; k <= 2; k++) {
        const q = L[i + k * stride];
        if (q < lo) lo = q; if (q > hi) hi = q;
        const m = Math.abs(q); if (m > mag) mag = m;      // the scale the arithmetic floor is relative to
    }
    return { d3: Math.abs(d2b - d2a), d2: Math.max(Math.abs(d2a), Math.abs(d2b)), step: Math.max(Math.abs(L[i] - L[i - stride]), Math.abs(L[i + stride] - L[i])), range: hi - lo, mag };
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
/**
 * *** THE PHASE FACTOR IS A CHOICE, AND WHICH ONE IS RIGHT DEPENDS ON THE QUESTION (v4564). ***
 *
 * "frame" uses THIS frame's sub-pixel phase, f(1-f). It is what v4560 built and it is tight -- a median
 * 1.11x of the error actually there on the resolved branch. *** IT IS A BOUND ON THE FRAME'S WORST ERROR
 * AND NOT ON EACH PIXEL'S OWN. *** Measured on a perspective ground plane: safe frame-wide on 14 of 14
 * frames, and BELOW the error actually present at 21.5% of pixels -- 36.2% of those on the resolved branch.
 * The reason is the one v4562 wrote down about a different form and nobody followed through: the ring's
 * window spans P frames at P different jitter phases, so this frame's f does not bound the window's worst.
 * Frame-wide that washes out, because some pixel in the frame always has a large phase. Per pixel it does
 * not.
 *
 * "window" uses the largest value f(1-f) can take, which is 0.25 at f = 0.5, so it holds whatever phases the
 * window happened to contain -- and the jitter guarantees it spans them. Measured: 0.0% of pixels below
 * their own error, at 17.3x the median looseness. That is the price of a bound that holds per pixel.
 *
 * Use "frame" for a frame-wide number and "window" for anything spent per pixel. marginsFromFloor REFUSES
 * the frame form, because v4563 spent one per pixel and the round could not tell.
 */
export function ringFloorCPU(luma, motion, w, h, period, tau = RESOLUTION_TAU, phase = "frame") {
    if (!luma || luma.length < w * h) throw new Error("ringFloorCPU: luma must be a scalar field of w*h");
    if (w < 7 || h < 7) throw new Error("ringFloorCPU: the estimator's stencil needs at least 7x7");
    if (phase !== "frame" && phase !== "window") throw new Error(`ringFloorCPU: phase must be "frame" or "window", not ${phase}`);
    const windowPhase = phase === "window";
    const depth = resampleDepth(period);
    const per = new Float32Array(w * h);
    // *** WHICH BRANCH EACH PIXEL TOOK, because the two are different KINDS of bound and their errors are
    // nothing alike (v4564). *** The Taylor branch is tight -- measured at a median 1.1x of the error
    // actually there; the step branch is a worst case over an unresolved neighbourhood and runs to 100x.
    // A caller told only the number cannot tell which it holds, and the frame-wide worst is nearly always a
    // step-branch pixel, so the aggregate hides the distinction that matters.
    const regime = new Uint8Array(w * h);          // 1 where either axis fell back to the step bound
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
        // 0.25 is the maximum of f(1-f), so the window form is this frame's bound taken over ANY phase
        const px = windowPhase ? 0.25 : fx * (1 - fx), py = windowPhase ? 0.25 : fy * (1 - fy);
        const ex = rx ? depth * 0.5 * px * (X.d2 + X.d3) : Math.max(fx, 1 - fx) * X.step;
        const ey = ry ? depth * 0.5 * py * (Y.d2 + Y.d3) : Math.max(fy, 1 - fy) * Y.step;
        // never below the arithmetic's own floor: at an integer displacement both axis terms are exactly
        // zero and the ring is still not exact -- it is exact to within the representation
        per[i] = Math.max(ex + ey, ARITHMETIC_ULPS * EPS_F32 * Math.max(X.mag, Y.mag));
        total++; if (!rx || !ry) { unresolved++; regime[i] = 1; }
        if (per[i] > worst) worst = per[i];
    }
    // *** total, NOT w*h. *** A fraction over pixels the estimator never visited would read low for a reason
    // that has nothing to do with the content -- the arc has written that absence-as-measurement twice.
    return { worst, per, regime, unresolved, total, unresolvedFraction: total ? unresolved / total : 0, depth, phase };
}

/**
 * *** A FLOOR POOLED OVER ONE JITTER PERIOD, BECAUSE A MARGIN THAT MOVES MAKES A LOCK FLICKER. ***
 *
 * v4562 measured the floor varying 6x across one perspective frame and called a per-pixel margin worth
 * having. Measured at v4563, spending it per pixel straight from the current frame costs 51.8% churn per
 * ridge held, against 10.7% for the arc's fixed margin -- a lock that blinks is worse than no lock, because
 * blinking is the artefact the lock exists to suppress.
 *
 * The cause is the jitter. The floor is a property of content and geometry, both of which change smoothly;
 * the frame-to-frame swing is the sample grid moving. v4553's insight applies unchanged: any P consecutive
 * frames span a whole jitter period.
 *
 * *** AND THE POOL IS A MAX, NOT A MEAN, BECAUSE THE FLOOR IS A BOUND. *** Measured over fourteen frames:
 *
 *     pooling      ridges/frame   churn per ridge   below their own floor   margin swing p90
 *     none            101.1          32.4%                0.0%                   15%
 *     period MEAN      98.4          25.4%                1.5%                    5%
 *     period MAX       87.4          27.7%                0.0%                    4%
 *
 * The mean is steadier and stops being a bound -- 1.5% of the locks it keeps stand under the floor of the
 * very frame they are in, which is the thing the whole composition exists to prevent. The max cannot do
 * that: it includes the current frame, so it is never below it. It costs 14% of the ridges the instantaneous
 * floor would keep, and that is the price of a threshold that holds still.
 *
 * *** THESE NUMBERS REPLACE v4563's, WHICH WERE TAKEN WITH THE FRAME-PHASE FLOOR. *** That table read
 * 51.8 / 26.7 / 28.9% and made pooling look like a halving. Most of what it was removing was phase noise the
 * bound should never have carried: the window form's phase factor is the constant 0.25, so its margin starts
 * steady (15% p90 rather than 30%) and pooling buys 15% of the churn rather than 50%. The four-fold
 * steadying of the margin itself survives unchanged.
 */
export function makeFloorPool(w, h, period) {
    if (!Number.isInteger(period) || period < 1) throw new Error("makeFloorPool: period must be a positive integer");
    return { w, h, period, frames: [], n: 0, phase: null };
}

/** Push this frame's per-pixel floor. Keeps the last `period` of them and nothing older. */
export function pushFloor(pool, per, phase = null) {
    if (!per || per.length !== pool.w * pool.h) throw new Error("pushFloor: a floor field of w*h is required");
    // the phase form travels WITH the numbers, so a pool cannot mix the two or be read as the wrong one
    if (phase !== null) {
        if (pool.phase !== null && pool.phase !== phase) throw new Error(`pushFloor: this pool holds "${pool.phase}" floors and was handed a "${phase}" one`);
        pool.phase = phase;
    }
    pool.frames.push(per);
    if (pool.frames.length > pool.period) pool.frames.shift();
    pool.n++;
    return pool;
}

/**
 * The pooled floor, and whether the pool has actually seen a whole period yet.
 * *** `whole` IS NOT DECORATION. *** A pool part-way through its first period spans an arbitrary fraction of
 * the jitter, so it is neither jitter-free nor a bound over one -- v4402's fault, an absence read as a pass,
 * and the caller is told rather than guessed for.
 */
export function pooledFloor(pool) {
    const N = pool.w * pool.h, out = new Float32Array(N);
    for (const f of pool.frames) for (let i = 0; i < N; i++) if (f[i] > out[i]) out[i] = f[i];
    return { data: out, whole: pool.frames.length >= pool.period, frames: pool.frames.length, phase: pool.phase };
}

/**
 * A per-pixel floor composed into a per-pixel MARGIN, through the same ridgeMarginBounds every frame-wide
 * caller uses -- one composition, not two.
 *
 * An infeasible pixel becomes Infinity, which ridgesCPU reads as "nothing here is a ridge". That is the
 * honest reading: the interval being empty means no margin can separate a feature from the noise, so the
 * answer is that nothing is lockable there -- NOT that everything is. Measured on a perspective ground
 * plane over fourteen frames, 29-34% of the pixels that HAVE a surface come out infeasible at a 10% blind
 * budget -- counted over on-plane pixels, since a whole-buffer figure mixes "unlockable" with "nothing here".
 */
export function marginsFromFloor(floor, w, h, bounds, opts = {}) {
    if (typeof bounds !== "function") throw new Error("marginsFromFloor: pass ridgeMarginBounds -- this module does not own the composition");
    // *** AND IT REFUSES A FLOOR THAT IS NOT A PER-PIXEL BOUND. *** v4563 composed the "frame" form into a
    // per-pixel margin and nothing in the tree could tell; the round's own safety row compared each ridge
    // against the floor its margin was derived from, which can only ever return zero. A caller who has not
    // said which form this is has not made the choice, and being asked is cheaper than being wrong.
    if (opts.phase !== "window") throw new Error(
        `marginsFromFloor: a per-pixel margin needs a per-pixel bound -- pass opts.phase "window" and a floor built with it, not ${JSON.stringify(opts.phase)}. ` +
        `The "frame" form bounds the frame's worst error, not each pixel's own (measured at v4564: 21.5% of pixels below their own error).`);
    const out = new Float32Array(w * h);
    let feasible = 0;
    for (let i = 0; i < w * h; i++) {
        const b = bounds({ noiseFloor: floor[i], contrast: opts.contrast, blindBudget: opts.blindBudget, safety: opts.safety });
        if (b.feasible) { out[i] = b.margin; feasible++; } else out[i] = Infinity;
    }
    return { data: out, feasible, total: w * h, feasibleFraction: feasible / (w * h) };
}
