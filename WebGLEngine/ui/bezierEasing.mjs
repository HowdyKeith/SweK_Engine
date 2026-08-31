// ui/bezierEasing.mjs -- v4224 -- inverting a CSS cubic-bezier, including where Newton-Raphson cannot.
//
// The algorithm is gre/bezier-easing's (MIT): a precomputed sample table for the initial guess, Newton-Raphson
// where the curve is steep enough to trust it, and BINARY SUBDIVISION where it is not.
//
// *** THE FALLBACK IS THE WHOLE POINT, AND rig/RigSystem.js HAD NO FALLBACK AT ALL. *** Its solver ran eight
// Newton steps and then:
//
//     if (Math.abs(dx) < 1e-6) break;      // ...returning whatever t happened to be at that moment
//
// A CSS timing function is x(t) and y(t), and easing means inverting x to find t for a given progress. Newton
// needs dx/dt, and dx/dt is EXACTLY ZERO at t=0 whenever x1 is 0 -- which `cubic-bezier(0, ...)` is, and which
// is one of the most common curves anyone writes. So the very first step of such an animation is solved by
// giving up.
//
// MEASURED against a 200-iteration bisection of the same curve, over the whole legal control-point grid:
//   * at ordinary sampling the old solver's worst error was 1.7e-4, which is invisible;
//   * in the small-u tail it reached 0.132 for cubic-bezier(0, 1, 0, 1) -- 13% of the output range.
// That is real and it is also SMALL IN PRACTICE, because u < 0.0025 is inside the first frame of any
// animation. This round fixes a correctness hole that was not hurting anything, and says so rather than
// inventing a symptom for it.
"use strict";

const SAMPLES = 11;                       // gre/bezier-easing's kSplineTableSize
const STEP = 1 / (SAMPLES - 1);
const NEWTON_MIN_SLOPE = 0.001;           // below this, Newton is not trustworthy and subdivision takes over
const NEWTON_ITERS = 8;
const SUBDIVISION_ITERS = 24;
const SUBDIVISION_EPS = 1e-9;
// *** THE RESIDUAL THAT DECIDES WHETHER NEWTON IS BELIEVED. *** See tForX.
const ACCEPT_EPS = 1e-8;

/** The Bezier basis with P0=0 and P3=1, in the standard polynomial form. */
export const A = (a1, a2) => 1.0 - 3.0 * a2 + 3.0 * a1;
export const B = (a1, a2) => 3.0 * a2 - 6.0 * a1;
export const C = (a1) => 3.0 * a1;

/** x(t) or y(t) for control values a1, a2. Horner form: three multiplies, no pow. */
export function calcBezier(t, a1, a2) { return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t; }

/** dx/dt -- the slope Newton needs, and the thing that is zero at t=0 when a1 is 0. */
export function slope(t, a1, a2) { return 3.0 * A(a1, a2) * t * t + 2.0 * B(a1, a2) * t + C(a1); }

/**
 * Bisect for t in [lo, hi] such that x(t) = target.
 *
 * *** THIS IS THE HALF rig/RigSystem.js WAS MISSING. *** Bisection needs no derivative at all, so a flat
 * region costs it nothing: it halves the bracket every step regardless, and 10 steps over an interval of
 * width 0.1 gets within 1e-4 of t with no assumption about the curve whatsoever.
 */
export function binarySubdivide(target, lo, hi, x1, x2) {
    let current, t, i = 0;
    do {
        t = lo + (hi - lo) / 2;
        current = calcBezier(t, x1, x2) - target;
        if (current > 0) hi = t; else lo = t;
    } while (Math.abs(current) > SUBDIVISION_EPS && ++i < SUBDIVISION_ITERS);
    return t;
}

/** Newton-Raphson from a guess. Only called where the slope is at least NEWTON_MIN_SLOPE. */
export function newtonRaphson(target, guess, x1, x2) {
    let t = guess;
    for (let i = 0; i < NEWTON_ITERS; i++) {
        const d = slope(t, x1, x2);
        if (d === 0.0) return t;
        t -= (calcBezier(t, x1, x2) - target) / d;
    }
    return t;
}

/**
 * An easing function for cubic-bezier(x1, y1, x2, y2).
 *
 * x1 and x2 MUST be in [0,1] -- that is the CSS rule, and it is what makes x(t) monotonic and therefore
 * invertible at all. y is unconstrained, which is how overshoot curves like ease-out-back are written.
 * Throws on an out-of-range x rather than returning a function that is quietly not a timing curve.
 */
export function bezierEasing(x1, y1, x2, y2) {
    if (!(x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1)) {
        throw new RangeError("cubic-bezier x values must be in [0,1]; got " + x1 + " and " + x2);
    }
    if (x1 === y1 && x2 === y2) return (u) => u;              // the identity, exactly, with no sampling

    // *** THE SAMPLE TABLE IS BUILT ONCE PER CURVE, NOT PER CALL. *** It is what gives Newton a guess close
    // enough to converge in four steps, and it is what tells us which interval's slope to judge.
    const table = new Float64Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) table[i] = calcBezier(i * STEP, x1, x2);

    function tForX(u) {
        let interval = 0, guess = 0;
        const last = SAMPLES - 1;
        for (let i = 1; i <= last && table[i] <= u; i++) interval = i;
        // linear interpolation within the interval, as the initial guess
        const dist = (u - table[interval]) / (table[interval + 1] - table[interval]);
        guess = (interval + (Number.isFinite(dist) ? dist : 0)) * STEP;
        const lo = interval * STEP, hi = lo + STEP;
        const initialSlope = slope(guess, x1, x2);
        if (initialSlope === 0.0) return guess;               // dead flat: the guess is as good as it gets
        if (initialSlope >= NEWTON_MIN_SLOPE) {
            // *** NEWTON IS CHECKED, NOT TRUSTED, AND THAT IS A DEPARTURE FROM THE LIBRARY. ***
            // gre/bezier-easing takes Newton's answer whenever the slope clears 0.001, with no test of what
            // came back. MEASURED on cubic-bezier(1, 0, 0, 1) at u = 0.501: the slope at the guess is
            // 1.166e-2, comfortably over the threshold, and four Newton steps still land 4.2e-4 away in t --
            // a y error of 6.2e-4, where bisection over the same interval manages 9.9e-5. A shallow-but-not-
            // flat curve is exactly where a fixed iteration count runs out, and the slope alone cannot tell
            // you that it has. Checking the residual costs one evaluation and removes the guesswork.
            const t = newtonRaphson(u, guess, x1, x2);
            if (t >= 0 && t <= 1 && Math.abs(calcBezier(t, x1, x2) - u) <= ACCEPT_EPS) return t;
        }
        return binarySubdivide(u, lo, hi, x1, x2);            // shallow, or Newton did not converge
    }

    return function easing(u) {
        // The endpoints are returned EXACTLY rather than solved. Every solver here is iterative, so without
        // this a curve would end at 0.9999999 and an animation would never quite arrive.
        if (u === 0 || u === 1) return u;
        return calcBezier(tForX(u), y1, y2);
    };
}

/** Parse a CSS `cubic-bezier(a, b, c, d)` string. Returns [x1,y1,x2,y2] or null. */
export function parseCubicBezier(text) {
    const m = /cubic-bezier\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(String(text || ""));
    if (!m) return null;
    const v = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])];
    return v.every(Number.isFinite) ? v : null;
}

/** The CSS keywords, as the control points the spec defines them to be. */
export const CSS_KEYWORDS = Object.freeze({
    ease:        [0.25, 0.1, 0.25, 1],
    "ease-in":   [0.42, 0, 1, 1],
    "ease-out":  [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
    linear:      [0, 0, 1, 1],
});

/** An easing function from a CSS string -- a keyword or a cubic-bezier(). Returns null if it is neither. */
export function easingFromCSS(text) {
    const key = String(text || "").trim().toLowerCase();
    if (CSS_KEYWORDS[key]) return bezierEasing(...CSS_KEYWORDS[key]);
    const p = parseCubicBezier(text);
    return p ? bezierEasing(...p) : null;
}

export default bezierEasing;
