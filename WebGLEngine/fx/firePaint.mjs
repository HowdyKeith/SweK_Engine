// WebGLEngine/fx/firePaint.mjs -- v4419
//
// *** A TARGET THAT MOVES, UNDER A RULE THAT IS EXACTLY KNOWN. ***
//
// Every target the painter has ever been shown stands still. makeTarget's five flat regions, v4417's ramp and
// ray-marched frame, v4418's four Krbn projections -- all of them are one picture, held while the fitter works
// on it. render/doomFire.mjs is a SEEDED CELLULAR AUTOMATON: same seed, same field, frame for frame, by
// construction rather than retrofitted (that round took the RNG as a parameter precisely so this would be
// possible). So the target can be made to move and the motion is not noise -- it is a rule with a fixed point,
// and every comparison below has an exact reference.
//
// ---- THE QUESTION NOTHING HAS ASKED: DOES THE FITTER TRACK, OR DOES IT RE-SOLVE? ------------------------------
//
// fx/primitiveFit.mjs is greedy and stateless. It has no notion of a previous frame, and a renderer painting
// a fire would obviously keep the canvas and add to it rather than start from grey every frame. Nobody has
// measured what that is worth, and the honest measurement needs THREE runs, not two:
//
//   warm             one canvas, B shapes added per frame          -- what a real-time painter would do
//   cold, B shapes   from flat, B shapes, every frame              -- the same per-frame work, no memory
//   cold, same TOTAL from flat, as many shapes as warm has by now  -- the same shapes, no staleness
//
// *** AND A STILL-TARGET CONTROL, WHICH IS WHAT MAKES THE THIRD ONE MEAN ANYTHING. *** On a target that does
// not move, "add B shapes to the canvas each round" and "fit B*k shapes from flat" are THE SAME COMPUTATION --
// fit() is itself incremental -- so the two curves are identical to every digit. Measured over 25 frames: they
// are. So on a moving target the whole gap between them is the MOTION, isolated rather than argued.
//
// ---- AND A PALETTE THE COLOUR SOLVER CANNOT REACH -----------------------------------------------------------
//
// Doom fire is 37 fixed colours. optimalColour() returns the exact least-squares mean over a shape's pixels,
// which is a continuous value and almost never one of the 37. That makes the second thing this file measures
// possible: what primitiveFit's first headline idea -- "the colour is SOLVED, not searched" -- is actually
// worth against simply taking the nearest of a fixed palette.
"use strict";

import { DoomFire, PALETTE } from "../render/doomFire.mjs";
import { fit, fitStep, drawShape, spansOf, blank, averageColour, difference, distanceOf, mulberry32, DEFAULTS } from "./primitiveFit.mjs";
import { dims } from "../render/perceptual.mjs";

/** A settled fire, as an image the fitter can take directly -- toRGBA's output IS an ImageData data array. */
export const fireImage = (f) => ({ data: f.toRGBA(), w: f.width, h: f.height });

/**
 * A run of consecutive frames from one seeded fire, after `settle` steps so the transient from lighting it is
 * gone. *** THE SETTLE MATTERS: *** the first frames after light() are a front climbing an empty grid, which
 * is a different picture from a burning one, and measuring "how much does it move" across that transient
 * would measure the ignition rather than the fire.
 */
export function fireFrames(count, { w = 64, h = 64, seed = 0xF12E, settle = 200 } = {}) {
    const f = new DoomFire({ width: w, height: h, seed });
    for (let i = 0; i < settle; i++) f.step();
    const out = [];
    for (let k = 0; k < count; k++) { out.push(fireImage(f)); f.step(); }
    return out;
}

/** Normalised RMS distance between two images -- the fitter's own measure, over any pair. */
export function imageDistance(a, b) { const A = dims(a); return distanceOf(difference(a, b), A.w * A.h); }

/** How many pixels two images disagree on at all. */
export function pixelsMoved(a, b) {
    const A = dims(a), B = dims(b);
    let n = 0;
    for (let i = 0; i < A.data.length; i += 4)
        if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) n++;
    return n;
}

/**
 * Add n shapes to an EXISTING canvas, against a target. The whole of the warm run is this function called once
 * per frame, and it is fit()'s own loop with the canvas taken as an argument instead of created -- same
 * fitStep, same drawShape, same rejection rule (a step that cannot improve the picture is discarded).
 */
export function addShapes(target, canvas, n, rng, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    let placed = 0;
    for (let i = 0; i < n; i++) {
        const step = fitStep(target, canvas, { ...o, rng });
        if (!step || step.delta >= 0) continue;
        drawShape(canvas, step.spans, step.colour, o.alpha);
        placed++;
    }
    return placed;
}

/**
 * The three runs over one sequence of frames, plus the shape counts that make the third comparable.
 * `frames` may be a moving sequence or the same image repeated -- the still case is the control.
 */
export function trackFrames(frames, { budget = 10, seed = 7, alpha = DEFAULTS.alpha } = {}) {
    const T0 = dims(frames[0]);
    const canvas = blank(T0.w, T0.h, averageColour(frames[0]));
    const rng = mulberry32(seed);
    const warm = [], totals = [];
    let total = 0;
    for (const t of frames) {
        total += addShapes(t, canvas, budget, rng, { alpha });
        warm.push(imageDistance(t, canvas));
        totals.push(total);
    }
    const coldBudget = frames.map((t) => fit(t, { shapes: budget, seed, alpha }).distance);
    const coldTotal = frames.map((t, k) => fit(t, { shapes: totals[k], seed, alpha }).distance);
    return { warm, coldBudget, coldTotal, totals };
}

/** Distance from a solved colour to the nearest palette entry, and which one. */
export function nearestPalette(colour, palette = PALETTE) {
    let best = Infinity, at = 0;
    for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        const d = (colour[0] - p[0]) ** 2 + (colour[1] - p[1]) ** 2 + (colour[2] - p[2]) ** 2;
        if (d < best) { best = d; at = i; }
    }
    return { index: at, distance: Math.sqrt(best) };
}

/**
 * Repaint a finished set of shapes with their colours SNAPPED to the palette, so the exact least-squares
 * colour can be priced against the nearest of 37. Same shapes, same order, same alpha -- only the colour moves.
 */
export function snapToPalette(target, shapes, { palette = PALETTE, background = null } = {}) {
    const T = dims(target);
    const canvas = blank(T.w, T.h, background || averageColour(target));
    for (const s of shapes) {
        const spans = spansOf(s, T.w, T.h);
        if (!spans.length) continue;
        drawShape(canvas, spans, palette[nearestPalette(s.colour, palette).index], s.alpha);
    }
    return { canvas, distance: imageDistance(target, canvas) };
}
