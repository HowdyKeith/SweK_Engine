// FILE: ui/domLiquefy.js -- v4202
//
// A LIVE SMUDGE SURFACE: rasterise an element once, then let a pointer drag its pixels around.
//
// The pure half is render/liquefyModel.mjs -- field, strokes, decay, warp, all testable with no browser. This
// half is everything that needs a DOM: the rasterisation (ui/domToTexture.js, v4120), the pointer listeners,
// and the animation loop. Same split as ui/domDisintegrate.js (v4199), for the same reason: the arithmetic
// gets gated, the wiring gets driven by hand.
//
// *** THE LOOP STOPS ITSELF, AND THAT IS THE POINT OF THE WHOLE ROUND. *** Every other displacement effect in
// this tree recomputes from `time` and therefore animates forever. This one has a field that decays, so there
// is a moment after which redrawing changes nothing -- and the loop PROVES that moment with isQuiet() rather
// than guessing it with a timeout. engine/frameDirty.js's rule is that clean is proven, never assumed; a
// level-triggered source is exactly `() => !isQuiet(field)`, and `probe()` below is that source, exported so
// the page can hand it to a FrameDirty instead of running its own rAF.
"use strict";

import { rasterize } from "./domToTexture.js";
import { makeField, stampStroke, decayField, isQuiet, warp, peakDisplacement, QUIET_PX } from "../render/liquefyModel.mjs";

/**
 * A canvas that shows a warped copy of `el` and smudges under the pointer.
 *
 * Not a class ceremony for its own sake: the field, the last pointer position and the rAF handle are three
 * pieces of state that have to move together, and a teardown that forgets any one of them leaks a listener
 * onto a detached node -- the exact defect #76 (mutant) is filed against.
 */
export class LiquefyCanvas {
    constructor(canvas, source, opts = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.source = source;                       // ImageData -- the unwarped original, never mutated
        this.field = makeField(source.width, source.height);
        this.opts = { strength: 12, radius: 40, hardness: 0.5, rate: 0.94, ...opts };
        this._last = null;                          // last pointer position, or null when not dragging
        this._raf = 0;
        this._prev = 0;
        this._listeners = [];
        this.frames = 0;                            // frames actually drawn -- the number the loop is judged on
        this.skipped = 0;                           // frames the quiet proof let us skip
    }

    /** True for as long as this effect is animating. Hand this straight to FrameDirty.addSource(). */
    probe() { return !isQuiet(this.field); }

    /** Peak displacement in pixels -- what probe() thresholds, exposed so a caller can show it. */
    peak() { return peakDisplacement(this.field); }

    attach(target = this.canvas) {
        const pos = (ev) => {
            const r = target.getBoundingClientRect();
            return [(ev.clientX - r.left) * (this.source.width / r.width),
                    (ev.clientY - r.top) * (this.source.height / r.height)];
        };
        const down = (ev) => { this._last = pos(ev); target.setPointerCapture?.(ev.pointerId); };
        const move = (ev) => {
            if (!this._last) return;
            const p = pos(ev);
            // *** THE SEGMENT, NOT THE POINT. *** pointermove fires at whatever rate the browser can manage.
            // Measured: a 600px swipe in 0.2s arrives as 50px jumps at 60Hz, and stamping a disc at each
            // sample leaves 21 cells of the centre line at EXACTLY zero displacement -- visible craters with
            // untouched gaps between them. Stamping the swept segment leaves none, at any pointer rate.
            stampStroke(this.field, this._last[0], this._last[1], p[0], p[1], this.opts);
            this._last = p;
        };
        const up = (ev) => { this._last = null; target.releasePointerCapture?.(ev.pointerId); };
        for (const [type, fn] of [["pointerdown", down], ["pointermove", move], ["pointerup", up], ["pointercancel", up]]) {
            target.addEventListener(type, fn);
            this._listeners.push([target, type, fn]);
        }
        return this;
    }

    /** One step: decay, and redraw only if the field can still move a pixel. Returns true if it drew. */
    step(dt) {
        decayField(this.field, dt, { rate: this.opts.rate });
        // Dragging counts as dirty even if the field has not risen above the floor yet -- a stroke in progress
        // is a change nobody has drawn.
        if (!this._last && isQuiet(this.field)) { this.skipped++; return false; }
        this.ctx.putImageData(toImageData(warp(this.source, this.field)), 0, 0);
        this.frames++;
        return true;
    }

    start() {
        if (this._raf) return this;
        this._prev = now();
        const tick = () => {
            const t = now();
            this.step(Math.min(0.05, (t - this._prev) / 1000));
            this._prev = t;
            this._raf = requestAnimationFrame(tick);
        };
        this._raf = requestAnimationFrame(tick);
        return this;
    }

    stop() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; return this; }

    /** Remove every listener and stop the loop. Called on teardown, and safe to call twice. */
    destroy() {
        this.stop();
        for (const [t, type, fn] of this._listeners) t.removeEventListener(type, fn);
        this._listeners.length = 0;
        return this;
    }
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Wrap a {width,height,data} back into a real ImageData the 2d context will accept. */
function toImageData(im) {
    if (typeof ImageData !== "undefined") return new ImageData(im.data, im.width, im.height);
    return im;
}

/**
 * Rasterise an element, put a canvas over it, and return a running LiquefyCanvas.
 *
 * Returns { liquefy, canvas, why } -- `why` is non-null only on failure, so a refusal names its cause instead
 * of being a silent null. Same contract as disintegrate().
 */
export async function liquefyElement(el, opts = {}) {
    const src = await rasterize(el, opts);
    if (!src) return { liquefy: null, canvas: null, why: "domToTexture could not rasterise that element" };
    const sctx = src.getContext("2d");
    let img;
    try { img = sctx.getImageData(0, 0, src.width, src.height); }
    catch (e) { return { liquefy: null, canvas: src, why: "the canvas is tainted: " + e.message }; }

    const canvas = document.createElement("canvas");
    canvas.width = src.width; canvas.height = src.height;
    Object.assign(canvas.style, { touchAction: "none", cursor: "crosshair", maxWidth: "100%" });
    const lq = new LiquefyCanvas(canvas, img, opts).attach().start();
    lq.ctx.putImageData(img, 0, 0);                 // show the unwarped original until the first stroke
    return { liquefy: lq, canvas, why: null };
}

export { QUIET_PX };
