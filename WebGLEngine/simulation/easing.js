// FILE: simulation/easing.js
// VERSION: v1 — round 321
//
// Shared easing function library. Centralizes the standard easing
// curves that were inlined across world/birthSpawner.js,
// world/treeSpawner.js, simulation/OgreScenario.js, and
// simulation/EjectSequence.js.
//
// All functions take t in [0, 1] and return a value in [0, 1]
// (except easeOutBack which can briefly overshoot above 1 — that's
// the point of "back" easings).
//
// Naming follows the Penner/Robert easing convention:
//   easeIn*   — slow start, fast end (use for "accelerating" motion)
//   easeOut*  — fast start, slow end (use for "decelerating" / "settling")
//   easeInOut* — slow at both ends, fast in middle (use for symmetric motion)
//
// Quad = quadratic, Cubic = cubic, Expo = exponential, Back = with overshoot.
//
// Not a replacement for framerate-independent dampening:
//     const k = 1 - Math.exp(-dt * rate);
//     x += (target - x) * k;
// That pattern (used in camera.js, OgreScenario.js's idle camera) is
// distinct — it's a smoothing filter, not a parametric tween. Keep it
// inline; this module is for parametric t-in-[0,1] curves.

// Linear / identity. Provided for explicit caller intent.
export function linear(t) { return t; }

// Quadratic — `t^2` family.
export function easeInQuad(t)    { return t * t; }
export function easeOutQuad(t)   { return 1 - (1 - t) * (1 - t); }
export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Cubic — `t^3` family. Most common "natural feel" curve.
export function easeInCubic(t)    { return t * t * t; }
export function easeOutCubic(t)   { return 1 - Math.pow(1 - t, 3); }
export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Exponential — strong acceleration / hard settle.
export function easeOutExpo(t) {
    return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// Back — overshoots above 1 then settles. Good for "pop-in" effects.
// Constants from Penner; c1 controls overshoot amount (1.70158 = ~10%).
export function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Elastic — a damped sinusoid: overshoots, comes back, overshoots less, settles. v4197.
//
// *** THIS IS NOT easeOutBack WITH MORE OF IT. *** Back overshoots ONCE and returns; elastic OSCILLATES,
// crossing the target several times. That is a different motion and a different meaning: back reads as
// something landing, elastic reads as something sprung. The tree had the first and not the second.
//
// Constants are Penner's, as the rest of this file is: c4 = 2*PI/3 sets the period so the last visible
// overshoot lands where the eye expects. The 10 in 2^-10t is the damping.
//
// *** THE ENDPOINT GUARDS ARE PART OF THE DEFINITION, AND THE REASON IS SMALLER AND WORSE THAN IT LOOKS. ***
// The first draft of this comment claimed an un-guarded elastic "jumps a third of the way backwards" at
// t = 0. Measured, that is false: easeOutElastic(0) already lands on exactly 0. Four of the six endpoints
// across the three curves DO miss, and they miss by very little --
//
//   easeOutElastic     f(0) = 0 exactly      f(1) = 1.000488281   <- misses
//   easeInElastic      f(0) = -4.883e-4      f(1) = 1 exactly
//   easeInOutElastic   f(0) = 8.479e-5       f(1) = 0.999915211   <- both miss
//
// A miss of 5e-4 is invisible in one frame and permanent in the last one: an animation that ends at
// 0.99991 instead of 1 leaves the property a hair off its target forever -- a fade that never quite reaches
// opaque, a slide that stops just short and stays there. Small and wrong beats large and obvious, because
// nobody looks for it. The guards are cheap; the failure is silent.
export function easeOutElastic(t) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

export function easeInElastic(t) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
}

export function easeInOutElastic(t) {
    const c5 = (2 * Math.PI) / 4.5;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
        :  (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
}

// Convenience map for "look up an easing by name" callers
// (used by anim systems that take a string config).
export const EASING = {
    linear,
    easeInElastic, easeOutElastic, easeInOutElastic,
    easeInQuad,
    easeOutQuad,
    easeInOutQuad,
    easeInCubic,
    easeOutCubic,
    easeInOutCubic,
    easeOutExpo,
    easeOutBack,
};
