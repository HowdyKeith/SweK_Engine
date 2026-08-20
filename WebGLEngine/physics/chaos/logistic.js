// physics/chaos/logistic.js
//
// THE LOGISTIC MAP -- v2823. x -> r x (1 - x). One line of arithmetic, and it contains a route to chaos whose
// numbers are UNIVERSAL: they show up in any system that gets there the same way, whether it is a dripping tap,
// a population, or an electronic oscillator. That is what makes this worth grading rather than merely drawing.
//
// THE EXACT KEYS, none of them written into the iteration:
//
//   FIXED POINT        for 1 < r < 3 the map settles on x* = 1 - 1/r. Exact algebra.
//   FIRST DOUBLING     the fixed point loses stability at EXACTLY r = 3, where |f'(x*)| = |2 - r| reaches 1.
//   SECOND DOUBLING    period 2 becomes period 4 at EXACTLY r = 1 + sqrt(6) = 3.449489742783178.
//   FEIGENBAUM DELTA   the bifurcation points crowd together geometrically, and the ratio of successive gaps
//                      converges to delta = 4.669201609102990... -- a UNIVERSAL constant, not a property of
//                      this map. Measuring it from our own iteration is the point of the instrument.
//   LYAPUNOV AT r = 4  the map is exactly solvable there (conjugate to the tent map), and the Lyapunov exponent
//                      is EXACTLY ln 2 = 0.6931471805599453. An exact answer in the middle of chaos.
//
// The Lyapunov exponent is also the sharpest available statement of what "chaos" means here: it is the average
// of ln|f'(x)| along the orbit, so it is NEGATIVE wherever the orbit is attracted to a cycle and POSITIVE where
// nearby trajectories separate. It changes sign at the onset, and it dips back below zero inside the periodic
// windows -- including the famous period-3 window, which is why that window is visible as a gap in the diagram.
//
// Pure, no imports, browser-safe.

export const FEIGENBAUM_DELTA = 4.669201609102990;
export const FEIGENBAUM_ALPHA = 2.502907875095892;
export const CHAOS_ONSET = 3.569945672;                 // the accumulation point of the cascade
export const LN2 = Math.LN2;

export const logistic = (r, x) => r * x * (1 - x);
export const fixedPoint = (r) => 1 - 1 / r;              // exact for 1 < r < 3
export const secondDoubling = () => 1 + Math.sqrt(6);    // exact: period 2 -> 4

// Iterate past the transient and return the attractor samples.
export function orbit(r, { x0 = 0.4, warmup = 2000, samples = 256 } = {}) {
    let x = x0;
    for (let i = 0; i < warmup; i++) x = logistic(r, x);
    const out = new Float64Array(samples);
    for (let i = 0; i < samples; i++) { x = logistic(r, x); out[i] = x; }
    return out;
}

// The period of the attracting cycle, or 0 if none is found within maxPeriod (chaotic or too long).
// Compares the orbit against itself at a lag -- the smallest lag that reproduces the trajectory is the period.
export function periodOf(r, { x0 = 0.4, warmup = 20000, maxPeriod = 64, tol = 1e-9 } = {}) {
    let x = x0;
    for (let i = 0; i < warmup; i++) x = logistic(r, x);
    const ref = x;
    const seen = new Float64Array(maxPeriod + 1);
    let y = x;
    for (let p = 1; p <= maxPeriod; p++) {
        y = logistic(r, y);
        seen[p] = y;
        if (Math.abs(y - ref) < tol) return p;
    }
    return 0;
}

// The LYAPUNOV EXPONENT: the average of ln|f'(x)| = ln|r(1 - 2x)| along the orbit. Negative on a cycle,
// positive in chaos. Nothing in it knows where the onset is.
// *** v3717 -- THE SLOPE IS NAMED BECAUSE GETTING IT WRONG IS THE CLASSIC SLIP, AND THE WRONG ONE IS WORSE THAN
// WRONG. d/dx [r x (1-x)] = r(1 - 2x). Writing r(1 - x) is confusing the map with its own slope, and it is not
// merely inaccurate: r(1-x) IS x_{i+1}/x_i, so summing its logs TELESCOPES to (ln x_N - ln x_0)/N AND VANISHES
// AS 1/N. The exponent would read ZERO AT EVERY r -- no chaos, no stability, ever, and it would look like a
// clean measurement rather than a broken one. MEASURED at v3717: 5.55e-17 at r=3.2 and 7.26e-5 at r=4, matching
// (ln x_N - ln x_0)/N to the last digit. `slopeOfMap` exists so the plant is a MODE OF THIS FUNCTION rather
// than a second copy of it; see chaosBind. ***
export const LOGISTIC_SLOPE = (r, x) => r * (1 - 2 * x);

export function lyapunov(r, { x0 = 0.4, warmup = 5000, samples = 20000, slopeOfMap = LOGISTIC_SLOPE } = {}) {
    let x = x0;
    for (let i = 0; i < warmup; i++) x = logistic(r, x);
    let sum = 0, n = 0;
    for (let i = 0; i < samples; i++) {
        x = logistic(r, x);
        const d = Math.abs(slopeOfMap(r, x));
        if (d > 1e-300) { sum += Math.log(d); n++; }
    }
    return n ? sum / n : NaN;
}

// Find where the period first becomes `target`, by bisection on the measured period. The search is on the
// PERIOD -- an integer the iteration reports -- so nothing here consults a bifurcation formula.
export function bifurcationPoint(target, { lo, hi, iters = 60, warmup = 40000, tol = 1e-11 } = {}) {
    let a = lo, b = hi;
    for (let i = 0; i < iters; i++) {
        const mid = 0.5 * (a + b);
        const p = periodOf(mid, { warmup, maxPeriod: Math.max(64, target * 2), tol });
        if (p >= target && p > 0) b = mid; else a = mid;
        if (b - a < 1e-13) break;
    }
    return 0.5 * (a + b);
}

// The first few bifurcation points of the cascade. Each search is bracketed by the previous point and the
// accumulation point, which is where the cascade is known to end.
export function cascade({ count = 5 } = {}) {
    const rs = [];
    let lo = 2.9;
    for (let n = 0; n < count; n++) {
        const target = Math.pow(2, n + 1);                     // period 2, 4, 8, 16, 32
        const hi = n === 0 ? 3.2 : CHAOS_ONSET;
        const r = bifurcationPoint(target, { lo, hi, warmup: 40000 + n * 40000, tol: 1e-10 });
        rs.push(r);
        lo = r + 1e-7;
    }
    return rs;
}

// delta_n = (r_n - r_{n-1}) / (r_{n+1} - r_n) -- converging to Feigenbaum's constant.
export function deltaEstimates(rs) {
    const out = [];
    for (let i = 1; i + 1 < rs.length; i++) {
        const num = rs[i] - rs[i - 1], den = rs[i + 1] - rs[i];
        if (den > 0) out.push(num / den);
    }
    return out;
}

// A bifurcation diagram: attractor samples across a range of r, for drawing.
export function diagram({ rMin = 2.5, rMax = 4, columns = 600, warmup = 800, samples = 120 } = {}) {
    const cols = [];
    for (let i = 0; i < columns; i++) {
        const r = rMin + (rMax - rMin) * i / (columns - 1);
        cols.push({ r, xs: orbit(r, { warmup, samples }) });
    }
    return cols;
}
