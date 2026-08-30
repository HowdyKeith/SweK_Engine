// FILE: ui/domAnimation.mjs -- v4191
//
// DOM ANIMATIONS AS DATA, AND AS SOMETHING THE DIRTY FLAG CAN SEE. Pure: no DOM, no clock, so a gate reads
// the same rules the browser does. ui/domAnimate.js is the wiring.
//
// Idea from gibbok/animatelo (MIT), which ports animate.css to the Web Animations API. Written here rather
// than vendored, and for a reason beyond licence hygiene: the half of it worth having is not the animations,
// it is that WAAPI makes an animation an OBJECT THE PAGE CAN BE ASKED ABOUT.
//
// *** THE GAP THIS CLOSES, MEASURED. *** engine/frameDirty.js (v4174) skips a frame when nothing moved, and
// its rule is that clean is PROVEN rather than assumed -- a source that cannot say stays dirty. It has eleven
// sources: camera, demo, particles, water, dayNight, weather, projectiles, debris, agents, scripted,
// reactions. NOT ONE OF THEM IS ABOUT THE DOM. Meanwhile this tree carries 86 DISTINCT @keyframes RULES
// ACROSS 34 FILES -- 19 of them in pages and 60 in ui/*.js modules that inject their own styles, which is
// exactly where a HUD animation lives -- and document.getAnimations(), which returns CSS animations,
// transitions and WAAPI animations alike, is called in exactly ZERO files. So a page could have a spinner
// turning in the corner while the dirty flag reported the frame quiet, and one call covers all 86.
//
// (The first draft of this note said "77 across 14 pages". That conflated two scopes: 77 counted pages AND
// ui modules together, while 14 counted pages alone. Two measurements in one sentence, which is the shape of
// a number nobody can check.)
"use strict";

/**
 * *** THE KEYFRAMES ARE DATA, WHICH IS THE SAME MOVE audio/sfxModel.mjs MADE FOR SOUND. *** An animation is a
 * table entry, not a function: it can be listed, diffed, gated for validity, tuned in a page, and handed to
 * something else (a spell book, a HUD) as one more field. animate.css is a stylesheet of exactly this data
 * written in a form only a browser can read; this form can be read by a test.
 *
 * Offsets are explicit on every frame. WAAPI will distribute them evenly if you leave them out, which is
 * convenient and means a reader cannot tell a deliberate ease-in from an accident.
 */
export const KEYFRAMES = Object.freeze({
    fadeIn:      [{ offset: 0, opacity: 0 }, { offset: 1, opacity: 1 }],
    fadeOut:     [{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0 }],
    pulse:       [{ offset: 0, transform: "scale(1)" }, { offset: 0.5, transform: "scale(1.05)" }, { offset: 1, transform: "scale(1)" }],
    flash:       [{ offset: 0, opacity: 1 }, { offset: 0.25, opacity: 0 }, { offset: 0.5, opacity: 1 }, { offset: 0.75, opacity: 0 }, { offset: 1, opacity: 1 }],
    shake:       [{ offset: 0, transform: "translateX(0)" }, { offset: 0.2, transform: "translateX(-10px)" },
                  { offset: 0.4, transform: "translateX(10px)" }, { offset: 0.6, transform: "translateX(-10px)" },
                  { offset: 0.8, transform: "translateX(10px)" }, { offset: 1, transform: "translateX(0)" }],
    bounce:      [{ offset: 0, transform: "translateY(0)" }, { offset: 0.4, transform: "translateY(-24px)" },
                  { offset: 0.6, transform: "translateY(-12px)" }, { offset: 0.8, transform: "translateY(-4px)" },
                  { offset: 1, transform: "translateY(0)" }],
    swing:       [{ offset: 0, transform: "rotate(0deg)" }, { offset: 0.2, transform: "rotate(12deg)" },
                  { offset: 0.4, transform: "rotate(-9deg)" }, { offset: 0.6, transform: "rotate(6deg)" },
                  { offset: 0.8, transform: "rotate(-3deg)" }, { offset: 1, transform: "rotate(0deg)" }],
    zoomIn:      [{ offset: 0, opacity: 0, transform: "scale(0.4)" }, { offset: 1, opacity: 1, transform: "scale(1)" }],
    slideInLeft: [{ offset: 0, opacity: 0, transform: "translateX(-40px)" }, { offset: 1, opacity: 1, transform: "translateX(0)" }],
    headShake:   [{ offset: 0, transform: "translateX(0) rotateY(0deg)" }, { offset: 0.35, transform: "translateX(-6px) rotateY(-9deg)" },
                  { offset: 0.65, transform: "translateX(5px) rotateY(7deg)" }, { offset: 1, transform: "translateX(0) rotateY(0deg)" }],
    rubberBand:  [{ offset: 0, transform: "scale(1, 1)" }, { offset: 0.3, transform: "scale(1.25, 0.75)" },
                  { offset: 0.5, transform: "scale(0.85, 1.15)" }, { offset: 0.75, transform: "scale(1.05, 0.95)" },
                  { offset: 1, transform: "scale(1, 1)" }],
    spin:        [{ offset: 0, transform: "rotate(0deg)" }, { offset: 1, transform: "rotate(360deg)" }],
});

/** Default timing per animation. Separate from the frames so one set of frames can be reused at any speed. */
export const TIMING = Object.freeze({
    fadeIn: { duration: 320, easing: "ease-out" },
    fadeOut: { duration: 320, easing: "ease-in" },
    pulse: { duration: 700, easing: "ease-in-out" },
    flash: { duration: 900, easing: "linear" },
    shake: { duration: 620, easing: "ease-in-out" },
    bounce: { duration: 800, easing: "ease-out" },
    swing: { duration: 800, easing: "ease-in-out" },
    zoomIn: { duration: 380, easing: "ease-out" },
    slideInLeft: { duration: 380, easing: "ease-out" },
    headShake: { duration: 700, easing: "ease-in-out" },
    rubberBand: { duration: 900, easing: "ease-in-out" },
    // *** THE ONLY ONE THAT NEVER ENDS, AND IT IS DECLARED RATHER THAN INCIDENTAL. *** An infinite animation
    // holds the dirty flag open forever by design; quietStateOf reports these by name so a page that will
    // never go quiet can say WHY instead of merely being slow.
    spin: { duration: 1100, easing: "linear", iterations: Infinity },
});

export const NAMES = Object.freeze(Object.keys(KEYFRAMES));

/** Timing for a named animation, with overrides. Unknown names throw -- a silent no-op animation is a bug. */
export function timingFor(name, over = {}) {
    if (!KEYFRAMES[name]) throw new Error(`domAnimation: no animation "${name}" (have: ${NAMES.join(", ")})`);
    return Object.assign({ duration: 400, easing: "linear", iterations: 1, fill: "none" }, TIMING[name], over);
}

/**
 * *** WHETHER ONE ANIMATION IS A REASON TO REDRAW. ***
 *
 * The playStates WAAPI defines are idle, running, paused and finished. Only `running` changes pixels:
 *   - finished / idle: it is not moving and will not move until something starts it, and starting it is an
 *     event the engine sees.
 *   - paused: the same. A paused animation holds its element still. Resuming is an event.
 *   - running: moving now.
 *
 * *** AND ANYTHING ELSE IS DIRTY. *** A state this function does not recognise -- a new value in a future
 * spec, an object that is not an Animation, undefined because the browser has no WAAPI -- must NOT be read
 * as quiet. frameDirty's whole rule is that clean is proven; a probe that answers "quiet" when it does not
 * understand the question is exactly the failure that rule exists to prevent.
 */
export function isAnimating(a) {
    if (!a || typeof a !== "object") return true;              // not an animation: cannot prove quiet
    const s = a.playState;
    if (s === "running") return true;
    if (s === "paused" || s === "finished" || s === "idle") return false;
    return true;                                                // unrecognised state: dirty
}

/** Is an animation one that will never finish on its own? */
export function isEndless(a) {
    try {
        const t = a && a.effect && a.effect.getTiming ? a.effect.getTiming() : (a && a.effect && a.effect.timing) || null;
        return !!t && (t.iterations === Infinity || t.iterations === "infinite");
    } catch { return false; }
}

/**
 * The verdict over a whole list, with the reason.
 *
 * @param anims   what document.getAnimations() returned, or descriptors shaped like it
 * @param present false when the browser has no getAnimations at all -- see below
 * @returns { quiet, running, endless, names }
 */
export function quietStateOf(anims, present = true) {
    // *** NO getAnimations MEANS DIRTY, NOT QUIET. *** A browser without WAAPI still runs CSS animations; it
    // simply cannot be asked about them. Reporting quiet there would freeze a page that is visibly animating,
    // which is a far worse failure than drawing frames nobody needed.
    if (!present) return { quiet: false, running: -1, endless: [], names: [], reason: "getAnimations unavailable -- cannot prove quiet" };
    if (!Array.isArray(anims)) return { quiet: false, running: -1, endless: [], names: [], reason: "animation list unreadable -- cannot prove quiet" };
    const live = anims.filter(isAnimating);
    const endless = live.filter(isEndless).map(nameOf);
    return {
        quiet: live.length === 0,
        running: live.length,
        endless,
        names: live.map(nameOf),
        reason: live.length === 0 ? "no animation is running" : `${live.length} running`,
    };
}

/** A readable label for an animation, for a page that wants to say what is keeping it awake. */
export function nameOf(a) {
    try {
        if (a && a.animationName) return String(a.animationName);           // a CSSAnimation
        if (a && a.transitionProperty) return "transition:" + a.transitionProperty;
        if (a && a.id) return String(a.id);
        return "(unnamed)";
    } catch { return "(unnamed)"; }
}

/**
 * *** VALIDATION, BECAUSE A BAD KEYFRAME LIST DOES NOTHING AND SAYS NOTHING. *** element.animate() with
 * offsets out of order throws; with a misspelled property it silently animates nothing at all. Both are
 * invisible in a page -- the element simply sits there -- so the table is checked rather than trusted.
 */
export function validateKeyframes(frames) {
    const problems = [];
    if (!Array.isArray(frames) || frames.length < 2) return ["needs at least two frames"];
    let last = -1;
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (!f || typeof f !== "object") { problems.push(`frame ${i} is not an object`); continue; }
        if (!("offset" in f)) { problems.push(`frame ${i} has no explicit offset`); continue; }
        const o = f.offset;
        if (typeof o !== "number" || !(o >= 0 && o <= 1)) problems.push(`frame ${i} offset ${o} is outside [0,1]`);
        else if (o <= last) problems.push(`frame ${i} offset ${o} does not increase (previous ${last})`);
        else last = o;
        const props = Object.keys(f).filter((k) => k !== "offset" && k !== "easing");
        if (!props.length) problems.push(`frame ${i} animates nothing`);
    }
    if (frames[0] && frames[0].offset !== 0) problems.push("does not start at offset 0");
    if (frames[frames.length - 1] && frames[frames.length - 1].offset !== 1) problems.push("does not end at offset 1");
    return problems;
}
