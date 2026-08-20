// physics/em/conservativeRemap.mjs
//
// THE SECOND-ORDER CONSERVATIVE REMAP v3633 SAID EXISTS -- BUILT, AND THE TRADE DOES NOT VANISH, IT MOVES.
//
// v3633 measured a NODE-VALUE remap and found you cannot have both: sampling keeps the value and loses the sum,
// averaging keeps the sum (to 2.004e-16) and loses the value, and averaging is only FIRST order. It ended by
// saying a second-order conservative remap exists and is what to reach for. This is it.
//
// *** THE FORMULATION CHANGES AND THAT IS NOT COSMETIC. v3633's operators moved NODE VALUES -- samples of a
// field at points. These move CELL AVERAGES -- the mean of the field over a cell of width h. "Conservative"
// means something different for the two: for node values it is a statement about a sum that happens to be
// preserved; for cell averages it is a statement about the INTEGRAL OF THE FIELD, which is the quantity a
// finite-volume scheme actually evolves. YOU CANNOT COMPARE THE TWO SETS OF NUMBERS DIRECTLY and the gate says
// so rather than putting them in one table. ***
//
// THE SCHEME. Reconstruct a straight line inside each coarse cell whose CELL AVERAGE is the stored value, then
// take the fine subcells' averages of that line. Coarsening is the exact block mean of r subcells.
//
//   subcell k of coarse cell i gets:   u_i + s_i * ((k + 0.5)/r - 0.5) * h
//
// *** CONSERVATION IS EXACT FOR ANY SLOPE WHATSOEVER, because the subcell offsets are symmetric about the cell
// centre and the slope term cancels in the mean. THAT IS WHY THE ROUND TRIP IS AGAIN THE IDENTITY BY
// CONSTRUCTION and again proves nothing -- v3633's lesson, written down before the fact this time instead of
// after. The slope is graded against ANALYTIC CELL AVERAGES, which is a truth no operator here is told. ***
//
// THREE SLOPES, AND THE WHOLE POINT IS THAT THEY ARE NOT RANKED:
//   "none"      piecewise constant. First order. Cannot overshoot.
//   "centered"  the unlimited central difference. SECOND ORDER -- and it OVERSHOOTS, inventing field values
//               outside the range of the data it was given.
//   "minmod"    the limited slope. Second order where the field is smooth, and it DROPS TO FIRST ORDER AT
//               EXTREMA, which is exactly where a wave's peak is.
//
// *** SO THE v3633 TRADE IS NOT DEFEATED, IT IS RELOCATED: you can have conservation AND second order, but not
// together with "creates no new extrema", and the place you pay is the peak of the wave. That is Godunov's
// barrier showing up in a remap operator, and it is the honest end of this thread rather than a win. ***
//
// BROWSER-SAFE: no imports, no DOM, no node builtins.

/** minmod: the smaller magnitude if the two agree in sign, zero otherwise. */
export const minmod = (a, b) => (a * b <= 0 ? 0 : (Math.abs(a) < Math.abs(b) ? a : b));

/** Slopes per cell, in units of value-per-cell-width. Ends get zero: no data on one side to difference. */
export function slopes(u, mode = "centered") {
    const n = u.length, s = new Float64Array(n);
    if (mode === "none") return s;
    for (let i = 1; i < n - 1; i++) {
        const back = u[i] - u[i - 1], fwd = u[i + 1] - u[i];
        s[i] = mode === "minmod" ? minmod(back, fwd) : 0.5 * (back + fwd);
    }
    return s;
}

/** Coarse cell averages -> fine cell averages. Conserves the integral EXACTLY, for any slope. */
export function refineCells(u, ratio, mode = "centered") {
    const s = slopes(u, mode), out = new Float64Array(u.length * ratio);
    for (let i = 0; i < u.length; i++) {
        for (let k = 0; k < ratio; k++) out[i * ratio + k] = u[i] + s[i] * ((k + 0.5) / ratio - 0.5);
    }
    return out;
}

/** Fine cell averages -> coarse cell averages: the exact block mean. */
export function coarsenCells(f, ratio) {
    const n = Math.floor(f.length / ratio), out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = 0; k < ratio; k++) s += f[i * ratio + k];
        out[i] = s / ratio;
    }
    return out;
}

/** The discrete integral a finite-volume scheme conserves: sum of (average * width). */
export const cellIntegral = (u, h = 1) => { let s = 0; for (let i = 0; i < u.length; i++) s += u[i] * h; return s; };

/** Exact cell averages of an analytic field -- the truth no operator is told. Simpson per cell. */
export function analyticCells(f, n, { x0 = 0, h = 1 } = {}) {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const a = x0 + i * h, b = a + h;
        out[i] = (f(a) + 4 * f(0.5 * (a + b)) + f(b)) / 6;
    }
    return out;
}

/** Worst relative departure of a refined field from the analytic cell averages on the fine grid. */
export function refineAccuracy(f, nCoarse, ratio, { x0 = 0, h = 1, mode = "centered" } = {}) {
    const coarse = analyticCells(f, nCoarse, { x0, h });
    const got = refineCells(coarse, ratio, mode);
    const truth = analyticCells(f, nCoarse * ratio, { x0, h: h / ratio });
    let worst = 0, peak = 0, worstAt = 0;
    // The ends carry a zero slope by construction, so they are excluded and the exclusion is STATED rather than
    // quietly widening the window: a boundary reconstruction is its own problem with its own literature.
    const skip = ratio;
    for (let i = skip; i < got.length - skip; i++) {
        peak = Math.max(peak, Math.abs(truth[i]));
        const d = Math.abs(got[i] - truth[i]);
        if (d > worst) { worst = d; worstAt = i; }
    }
    return { worst, peak, relative: worst / Math.max(peak, 1e-300), worstAt, cells: got.length };
}

/**
 * NEW EXTREMA: values outside the range of the coarse data they came from. A remap that invents field where
 * there was none is not a rounding error -- in an EM grid it is a source. Counted exactly, no tolerance.
 */
export function newExtrema(u, ratio, mode = "centered") {
    const got = refineCells(u, ratio, mode);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < u.length; i++) { lo = Math.min(lo, u[i]); hi = Math.max(hi, u[i]); }
    let count = 0, worst = 0;
    for (let i = 0; i < got.length; i++) {
        if (got[i] > hi) { count++; worst = Math.max(worst, got[i] - hi); }
        else if (got[i] < lo) { count++; worst = Math.max(worst, lo - got[i]); }
    }
    return { count, worst, range: hi - lo, relative: worst / Math.max(hi - lo, 1e-300) };
}

/** A step, the field that separates a limiter from an unlimited slope. */
export const stepCells = (n, at) => { const u = new Float64Array(n); for (let i = 0; i < n; i++) u[i] = i < at ? 1 : 0; return u; };
