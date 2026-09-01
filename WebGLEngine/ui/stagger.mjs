// FILE: ui/stagger.mjs -- v4197
//
// STAGGERED DELAYS AS DATA: given a count, hand back one delay per item. Pure -- no DOM, no clock -- so a
// gate reads the same numbers a page animates with.
//
// Idea from juliangarnier/anime (MIT). *** THE LIBRARY WAS REFUSED AND THE FUNCTION TAKEN, FOR A REASON THAT
// IS SPECIFIC RATHER THAN TASTE. *** anime.js drives its own requestAnimationFrame loop. ui/domAnimation.mjs
// (v4191) chose the Web Animations API deliberately, BECAUSE document.getAnimations() is what makes an
// animation visible to engine/frameDirty.js -- an anime.js timeline would be invisible to exactly the
// mechanism that module exists to serve, so adopting it would be a regression wearing an upgrade's clothes.
// stagger() has no such problem: it is arithmetic, and arithmetic ports cleanly.
//
// *** THIS TREE HAD ALREADY WRITTEN IT THREE TIMES. *** Same shape as v4165's "one Ashima noise, not three
// copies of it":
//
//   ui/brainTrail.js:190      (opts.drawStaggerMs ?? 90) * _drawn++          index x step, from the FIRST
//   ui/odometerModel.mjs:121  (digitCount - 1 - i) * stagger + base          index x step, from the LAST
//   ui/peerRadar.js:396       i * 28                                          index x step, from the FIRST
//
// Three copies of `index * step`, differing only in ORIGIN and one base offset -- which is why this module
// carries exactly those two knobs and not anime's whole surface. Grid and axis staggering are deliberately
// absent: nothing in this tree needs them yet, and unused generality is a thing to maintain, not a feature.
"use strict";

import { EASING } from "../simulation/easing.js";

/** Where the wave starts. A number is an explicit index, so a caller can originate anywhere. */
export const ORIGINS = Object.freeze(["first", "last", "center"]);

/**
 * The index the wave radiates from.
 *
 * *** "center" OF AN EVEN COUNT IS NOT AN INDEX, AND ROUNDING IT IS A VISIBLE BUG. *** With 6 items the
 * centre sits at 2.5. Rounding to 2 makes items 2 and 3 unequal neighbours of an origin that is really
 * between them, and the pair nearest the middle stops arriving together -- the symmetry the effect exists
 * for is exactly what gets lost. So the origin stays FRACTIONAL and the distance is measured to it.
 */
export function originIndex(n, from) {
    if (typeof from === "number") return from;
    if (from === "last") return n - 1;
    if (from === "center") return (n - 1) / 2;
    return 0;                                    // "first", and the default
}

/**
 * Delay for one item, in the same unit as `step` (milliseconds for every caller in this tree).
 *
 * @param i     item index
 * @param n     total items
 * @param step  delay between adjacent items
 * @param start constant offset added to every item -- odometerModel's `base`
 * @param from  "first" | "last" | "center" | an index
 * @param ease  name from simulation/easing.js, applied to the DISTRIBUTION of delays
 */
export function staggerDelay(i, n, { step = 0, start = 0, from = "first", ease = "linear" } = {}) {
    if (!(n > 0)) return start;
    const o = originIndex(n, from);
    const d = Math.abs(i - o);
    // *** THE EASE SHAPES THE SPACING, NOT THE ANIMATION. *** Easing a stagger makes items bunch up at one
    // end of the wave while each item still animates at its own timing. Easing the ANIMATION is a different
    // knob on a different object (ui/domAnimation.mjs's TIMING), and confusing the two produces a change
    // nobody can see: an ease applied to a 1-item stagger does nothing at all, correctly.
    const far = Math.max(o, n - 1 - o) || 1;     // the largest distance any item can be from the origin
    const fn = (ease && EASING[ease]) || null;
    const shaped = fn ? fn(d / far) * far : d;
    return start + shaped * step;
}

/** Every delay, in item order. The shape every caller in this tree actually wants. */
export function staggerDelays(n, opts = {}) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(staggerDelay(i, n, opts));
    return out;
}

/**
 * When the last item FINISHES, given how long each one runs.
 *
 * A caller that starts another pass before this has elapsed gets two waves overlapping -- which is why
 * odometerModel.totalDuration existed before this module did, and why it is the one piece of the three
 * copies that was worth generalising rather than merely deduplicating.
 */
export function staggerSpan(n, opts = {}, duration = 0) {
    if (!(n > 0)) return 0;
    return Math.max(...staggerDelays(n, opts)) + duration;
}

/** Everything wrong with a stagger request. Empty means it is usable. */
export function validateStagger(n, opts = {}) {
    const p = [];
    if (!Number.isInteger(n) || n < 0) p.push(`count ${n} is not a non-negative integer`);
    const { step = 0, start = 0, from = "first", ease = "linear" } = opts;
    if (!Number.isFinite(step)) p.push("step is not finite");
    if (!Number.isFinite(start)) p.push("start is not finite");
    if (typeof from === "number") {
        if (!Number.isFinite(from)) p.push("numeric origin is not finite");
        else if (from < 0 || from > n - 1) p.push(`origin index ${from} is outside 0..${n - 1}`);
    } else if (!ORIGINS.includes(from)) {
        p.push(`unknown origin "${from}" -- expected ${ORIGINS.join(", ")} or an index`);
    }
    if (ease && ease !== "linear" && !EASING[ease]) p.push(`unknown easing "${ease}"`);
    // A negative step runs the wave backwards through zero, which is a delay in the past: every caller here
    // schedules with setTimeout, and a negative timeout fires immediately, silently collapsing the stagger.
    if (step < 0) p.push("negative step -- delays before zero fire immediately and the stagger vanishes");
    return p;
}
