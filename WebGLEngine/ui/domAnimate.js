// FILE: ui/domAnimate.js -- v4191
//
// The browser half of ui/domAnimation.mjs: play a named animation, and tell engine/frameDirty.js whether the
// DOM is moving. Everything that DECIDES anything lives in the model; this file touches elements.
"use strict";

import { KEYFRAMES, TIMING, NAMES, timingFor, reducedTiming, quietStateOf, nameOf } from "./domAnimation.mjs";

/**
 * Does this reader want less movement? The same query ui/stateOrb.js and ui/textMorph.js already ask.
 * Wrapped, because matchMedia is absent in a headless context and a throw here would take the page with it.
 */
export function reducedMotion() {
    try { return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch { return false; }
}

/**
 * Play a named animation on an element.
 *
 * *** UNDER prefers-reduced-motion IT STILL RUNS -- in zero time, and the result sticks. *** See
 * reducedTiming() for why returning early would be the wrong repair (a fadeIn that never runs leaves the
 * element invisible). Pass `force: true` to override, for the rare case where the motion IS the information.
 *
 * @returns the Animation, or null when the element or the API is missing (never a fake object -- a caller
 *          that gets an object back is entitled to await its `finished`)
 */
export function play(el, name, over = {}) {
    if (!el || typeof el.animate !== "function") return null;
    const frames = KEYFRAMES[name];
    if (!frames) throw new Error(`domAnimate: no animation "${name}" (have: ${NAMES.join(", ")})`);
    const t = timingFor(name, over);
    return el.animate(frames, (reducedMotion() && over.force !== true) ? reducedTiming(t) : t);
}

/** Play and resolve when it ends. An endless animation never resolves, so it is refused rather than hanging. */
export function playAndWait(el, name, over = {}) {
    const t = timingFor(name, over);
    // an endless animation is refusable only when it will actually be endless: under reduced motion it is not
    if (t.iterations === Infinity && !(reducedMotion() && over.force !== true)) {
        return Promise.reject(new Error(`domAnimate: "${name}" never finishes -- do not await it`));
    }
    const a = play(el, name, over);
    if (!a) return Promise.resolve(null);
    return a.finished.catch(() => null);
}

/** Everything the document is animating right now: CSS animations, transitions and WAAPI alike, in one call. */
export function currentAnimations(doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d || typeof d.getAnimations !== "function") return { list: [], present: false };
    try { return { list: d.getAnimations(), present: true }; }
    catch { return { list: [], present: false }; }      // a throwing getAnimations is "cannot say", not "quiet"
}

/**
 * *** A frameDirty PROBE FOR THE WHOLE DOM. ***
 *
 * frameDirty's eleven sources are all about the 3D scene -- camera, particles, water, weather, agents. None
 * of them knows the DOM exists, and this tree carries 77 distinct @keyframes rules across 14 pages, so a page
 * could have a spinner turning while the flag called the frame quiet. document.getAnimations() covers every
 * one of them, CSS and WAAPI together, in a single call.
 *
 * It returns TRUE (dirty) whenever it cannot prove otherwise: no getAnimations, an unreadable list, an
 * animation in a state the model does not recognise. That is frameDirty's own rule -- an unregistered or
 * unsure source may not vote quiet.
 */
export function domAnimationProbe(doc) {
    return function probe() {
        const { list, present } = currentAnimations(doc);
        return !quietStateOf(list, present).quiet;
    };
}

/** The same information, but readable -- for a HUD that wants to say what is keeping the page awake. */
export function domAnimationStatus(doc) {
    const { list, present } = currentAnimations(doc);
    return quietStateOf(list, present);
}

export { KEYFRAMES, TIMING, NAMES, nameOf, reducedTiming };
