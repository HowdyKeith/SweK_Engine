// FILE: ui/svgDraw.js -- v4180
//
// The self-drawing line, applied to a live SVG element. The measurement lives in ui/svgPath.mjs; this is the
// thin browser half that sets the two attributes and runs the clock.
//
// Technique from merri-ment/lazy-line-painter (MIT) and lcdsantos/jquery-drawsvg (MIT): stroke-dasharray is
// set to the path's length and stroke-dashoffset animated from that length to zero, so the stroke appears to
// draw itself.
//
// *** THE LENGTH IS TAKEN FROM getTotalLength WHEN A LIVE ELEMENT HAS IT, AND FROM OUR OWN MEASURER
// *** OTHERWISE -- AND THE GATE ASSERTS THE TWO AGREE. Preferring the browser's own number is right when it
// is available: it is the same number the renderer uses for the dash pattern, so the animation cannot end
// early or late by a rounding difference. But it is a DOM method, so it does not exist in node, it does not
// exist for a detached element in some engines, and it is not available to svg-forge or any export path.
// Having both, and checking they agree, is better than trusting either alone.
"use strict";

import { pathLength, isSupported } from "./svgPath.mjs";

/**
 * Measure an element's path. Returns { length, via } so the caller can see WHICH number it got -- a silent
 * fallback that measured something different is exactly the thing worth being able to notice.
 */
export function measureElement(el, opts = {}) {
    if (!el) return { length: 0, via: "none" };
    if (!opts.forceParse && typeof el.getTotalLength === "function") {
        try {
            const n = el.getTotalLength();
            // A detached or display:none element returns 0 in some engines rather than throwing. Zero is not
            // a plausible length for a path somebody asked to draw, so it falls through to the parser instead
            // of setting a dasharray of 0 -- which renders as a SOLID line and looks like the effect simply
            // did not run.
            if (Number.isFinite(n) && n > 0) return { length: n, via: "getTotalLength" };
        } catch (e) {}
    }
    const d = typeof el.getAttribute === "function" ? el.getAttribute("d") : null;
    if (d && isSupported(d)) return { length: pathLength(d, opts), via: "parsed" };
    return { length: 0, via: "unmeasurable" };
}

/**
 * Prime an element to be drawn: dasharray and dashoffset both set to its length, so it renders as nothing.
 * Returns the measurement, so a caller can hold the length for its own timing.
 */
export function primeDraw(el, opts = {}) {
    const m = measureElement(el, opts);
    if (!m.length) return m;
    el.style.strokeDasharray = String(m.length);
    el.style.strokeDashoffset = String(m.length);
    return m;
}

/** Set how much of a primed element is drawn: 0 = nothing, 1 = the whole path. Clamped. */
export function setProgress(el, t, length) {
    const L = Number.isFinite(length) ? length : parseFloat(el.style.strokeDasharray) || 0;
    if (!L) return 0;
    const p = t <= 0 ? 0 : t >= 1 ? 1 : t;
    el.style.strokeDashoffset = String(L * (1 - p));
    return p;
}

/**
 * Draw an element over a duration. Returns a handle with cancel() and a done promise.
 *
 * *** THE CLOCK IS INJECTED AND THE LAST FRAME IS ALWAYS EXACT. *** A loop that stops when elapsed >= duration
 * leaves the offset at whatever the final frame computed, which is a hair short of zero -- so a "finished"
 * line keeps a one-pixel gap at its end forever. Setting progress to exactly 1 on completion is the fix, and
 * it is the kind of thing that only shows up on a long path.
 */
export function drawElement(el, opts = {}) {
    const duration = Math.max(1, opts.duration ?? 1200);
    const now = opts.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    const raf = opts.raf || ((cb) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : setTimeout(() => cb(now()), 16)));
    const ease = opts.ease || ((t) => t * t * (3 - 2 * t));      // smoothstep
    const m = primeDraw(el, opts);
    if (!m.length) return { ok: false, via: m.via, cancel() {}, done: Promise.resolve({ ok: false, via: m.via }) };

    let cancelled = false, t0 = null;
    const done = new Promise((resolve) => {
        const tick = (t) => {
            if (cancelled) { resolve({ ok: false, cancelled: true, via: m.via }); return; }
            if (t0 === null) t0 = t;
            const u = Math.min(1, (t - t0) / duration);
            setProgress(el, ease(u), m.length);
            if (u < 1) raf(tick);
            else { setProgress(el, 1, m.length); resolve({ ok: true, via: m.via, length: m.length }); }
        };
        raf(tick);
    });
    return { ok: true, via: m.via, length: m.length, cancel() { cancelled = true; }, done };
}

/** Clear the dash attributes, leaving the stroke solid again. */
export function clearDraw(el) { if (el && el.style) { el.style.strokeDasharray = ""; el.style.strokeDashoffset = ""; } }
