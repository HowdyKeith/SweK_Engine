// FILE: render/liquefyModel.mjs -- v4202
//
// A DISPLACEMENT FIELD THAT REMEMBERS: strokes push pixels, and the push decays back to nothing over time.
// Pure -- no GL, no DOM, no clock -- so a gate drives it with hand-written strokes and reads the numbers.
//
// Shape from positlabs/spark-liquefy (MIT), a Meta Spark effect that smudges the camera texture under a
// finger. Written here rather than ported, because a Spark project file is not something this tree can run.
//
// *** THE FIVE RADIAL SHADERS OF v4196 ARE ALL STATELESS, AND THAT IS THE DIFFERENCE. *** touchRipple,
// liveRipple, shockwave, gravityWells and refractLens each recompute their whole displacement from `time`
// every frame; nothing carries over, and switching the effect off leaves no trace. Liquefy is the opposite:
// the field IS the state. Where you dragged five seconds ago is still slightly bent, and it un-bends only
// because something decays it. That makes it the first displacement in this tree with a memory -- and the
// first that engine/frameDirty.js has to be able to call QUIET.
//
// *** WHICH IS THE REAL DESIGN QUESTION HERE, NOT THE SMUDGE. *** A field decaying by a factor per second
// never reaches zero in floating point; it reaches 1e-30 and keeps going. A dirty flag that waits for exact
// zero waits forever, and one that assumes quiet after a fixed delay is guessing. frameDirty's rule (v4174)
// is that clean is PROVEN, never assumed, so `isQuiet` below proves it against a threshold with a stated
// meaning: displacement small enough that no pixel can move to a different pixel.
"use strict";

import { distToSegment2, closestT2 } from "../math/segment.mjs";

/** Below this many pixels of displacement, no sample can land on a different texel. */
export const QUIET_PX = 0.5;

/** Make an empty field. Two floats per cell: dx, dy, in PIXELS. */
export function makeField(w, h) {
    if (!(w > 0 && h > 0)) throw new RangeError(`liquefy: field must be positive, got ${w}x${h}`);
    return { w, h, dx: new Float32Array(w * h), dy: new Float32Array(w * h) };
}

/**
 * Stamp a stroke from a to b into the field.
 *
 * *** THE STROKE IS A SEGMENT, NOT TWO DOTS, AND THAT IS THE ENTIRE REASON math/segment.mjs IS IMPORTED. ***
 * Pointer events arrive at whatever rate the browser feels like -- often 60/s, sometimes far fewer under
 * load. A finger crossing 600 pixels in a fifth of a second jumps 50 pixels between samples. Stamping a disc
 * at each sample leaves a dotted line of craters with untouched gaps between them; stamping the SEGMENT
 * covers the swept path. The gate measures the gaps rather than asserting they exist.
 *
 * @param strength peak displacement in pixels at the centre of the stroke
 * @param radius   falloff radius in pixels
 */
export function stampStroke(field, ax, ay, bx, by, { strength = 12, radius = 40, hardness = 0.5 } = {}) {
    const { w, h, dx, dy } = field;
    // Only the bounding box of the stroke plus its radius can be touched. Walking the whole field per stroke
    // is what makes a naive liquefy unusable at any real canvas size.
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - radius));
    const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + radius));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - radius));
    const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + radius));
    // The push direction is the stroke's own direction -- a smudge follows the finger.
    let vx = bx - ax, vy = by - ay;
    const len = Math.hypot(vx, vy);
    if (len > 1e-9) { vx /= len; vy /= len; } else { vx = 0; vy = 0; }
    let touched = 0;
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const d = distToSegment2(x + 0.5, y + 0.5, ax, ay, bx, by);
            if (d >= radius) continue;
            const n = 1 - d / radius;
            // hardness shapes the falloff: 0 is a wide soft smudge, 1 a tight one. pow is the cheapest knob.
            const fall = Math.pow(n, 1 + hardness * 3);
            const i = y * w + x;
            dx[i] += vx * strength * fall;
            dy[i] += vy * strength * fall;
            touched++;
        }
    }
    return touched;
}

/**
 * Decay the whole field toward zero.
 *
 * *** THE DECAY IS PER SECOND, NOT PER FRAME, AND GETTING THAT WRONG IS INVISIBLE ON THE MACHINE YOU BUILD
 * ON. *** `field *= 0.95` every frame decays twice as fast at 120fps as at 60, so the smudge lasts half as
 * long on a better monitor and twice as long on a struggling one -- a bug nobody sees until someone else
 * runs it. pow(rate, dt * 60) makes the half-life a property of the effect rather than of the hardware, and
 * it is the same form ui/gestureVfx.js uses for its particle drag.
 */
export function decayField(field, dt, { rate = 0.94, maxStep = 0.05 } = {}) {
    const step = Math.max(0, Math.min(dt, maxStep));
    const k = Math.pow(rate, step * 60);
    const { dx, dy } = field;
    for (let i = 0; i < dx.length; i++) { dx[i] *= k; dy[i] *= k; }
    return k;
}

/** The largest displacement anywhere in the field, in pixels. */
export function peakDisplacement(field) {
    const { dx, dy } = field;
    let m = 0;
    for (let i = 0; i < dx.length; i++) {
        const d = dx[i] * dx[i] + dy[i] * dy[i];
        if (d > m) m = d;
    }
    return Math.sqrt(m);
}

/**
 * Is this field quiet enough to stop redrawing?
 *
 * *** ANSWERED WITH A THRESHOLD THAT MEANS SOMETHING, WHICH IS THE ONLY HONEST WAY TO ANSWER IT. ***
 * An exponential decay never reaches zero, so "wait for zero" never becomes true and the frame stays dirty
 * for the life of the page. Half a pixel is the threshold because below it every sample rounds back to the
 * texel it started on: the field is still mathematically non-zero and can no longer change any pixel. That is
 * frameDirty's rule -- clean is PROVEN -- applied to a quantity that only ever approaches zero.
 */
export function isQuiet(field, threshold = QUIET_PX) {
    return peakDisplacement(field) < threshold;
}

/** Displacement at a pixel, nearest-sampled. Out of bounds is zero, not an edge repeat. */
export function displacementAt(field, x, y) {
    const { w, h, dx, dy } = field;
    const px = Math.floor(x), py = Math.floor(y);
    if (px < 0 || py < 0 || px >= w || py >= h) return [0, 0];
    const i = py * w + px;
    return [dx[i], dy[i]];
}

/**
 * Apply the field to an image, sampling each output pixel from where the field says it came from.
 *
 * *** THE FIELD IS SUBTRACTED, NOT ADDED, AND THAT IS NOT A SIGN CONVENTION -- IT IS THE DIFFERENCE BETWEEN
 * A WARP AND A HOLE. *** To move an image's content ALONG the stroke, each destination pixel must read from
 * BEHIND itself. Adding instead reads from ahead, which drags content the wrong way and, worse, leaves
 * destinations that no source maps to: gaps that show as tears. Every scattered-write warp has this bug once.
 */
export function warp(img, field, { clampEdges = true } = {}) {
    const { width: w, height: h, data } = img;
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const [ddx, ddy] = displacementAt(field, x, y);
            let sx = Math.round(x - ddx), sy = Math.round(y - ddy);
            if (clampEdges) {
                sx = sx < 0 ? 0 : sx >= w ? w - 1 : sx;
                sy = sy < 0 ? 0 : sy >= h ? h - 1 : sy;
            } else if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
                continue;                                   // leaves transparent black, deliberately visible
            }
            const s = (sy * w + sx) * 4, d = (y * w + x) * 4;
            out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
        }
    }
    return { width: w, height: h, data: out };
}
