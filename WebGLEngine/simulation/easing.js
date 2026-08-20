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

// Convenience map for "look up an easing by name" callers
// (used by anim systems that take a string config).
export const EASING = {
    linear,
    easeInQuad,
    easeOutQuad,
    easeInOutQuad,
    easeInCubic,
    easeOutCubic,
    easeInOutCubic,
    easeOutExpo,
    easeOutBack,
};
