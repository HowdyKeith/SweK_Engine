// fx/primitiveFit.mjs -- v4220 -- approximating a picture with a few dozen coloured shapes.
//
// The algorithm is Michael Fogleman's `primitive`, by way of ondras/primitive.js (MIT, Ondrej Zara and
// Michael Fogleman). Two ideas are taken and the rest is not; both are the reason it is fast enough to watch.
//
// ---- *** 1. THE COLOUR IS SOLVED, NOT SEARCHED. *** ----------------------------------------------------------
// The obvious way to place a shape is to try colours and keep the best. You never have to. Compositing a
// colour c at alpha a over the current canvas gives  new = cur(1-a) + c*a,  so the squared error against the
// target is  (t - cur(1-a) - c*a)^2,  which is a quadratic in c with one minimum:
//
//     d/dc = -2a( t - cur(1-a) - c*a ) = 0   =>   c = (t - cur)/a + cur
//
// and because the total over a shape's pixels is a SUM of such quadratics, the best single colour for the
// whole shape is the MEAN of those per-pixel optima. That is not an approximation or a heuristic -- it is the
// exact least-squares answer, and the gate proves it by grid-searching all 256 values of a channel and
// showing none beats it.
//
// ---- *** 2. THE SCORE IS COMPUTED OVER THE SHAPE, NOT THE PICTURE. *** ----------------------------------------
// Adding a shape changes only the pixels it covers, so the change in total error is a sum over those pixels.
// Scoring a candidate against the whole image instead is not merely slower, it is slower by the ratio of the
// image area to the shape area -- and the search evaluates hundreds of candidates per shape. The gate asserts
// the two agree to floating-point noise AND measures the difference in work.
//
// ---- what is NOT taken ----------------------------------------------------------------------------------------
// primitive.js rasterises with an HTML5 <canvas>, which is flexible and cannot run in the gate. Everything here
// is a pure scanline over typed arrays: convex polygons by edge intersection, ellipses analytically. So the
// whole thing runs in node with no DOM, which is what lets 40-odd checks drive it.
"use strict";

import { dims } from "../render/perceptual.mjs";

export const KINDS = Object.freeze(["triangle", "rect", "rotatedRect", "ellipse"]);
export const DEFAULTS = Object.freeze({ alpha: 0.5, candidates: 60, mutations: 30, patience: 10 });

/** A deterministic RNG, so every measurement in the gate is repeatable. */
export function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

/** A blank RGBA canvas of one colour. */
export function blank(w, h, rgb = [255, 255, 255]) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; }
    return { data, w, h };
}

/** The average colour of an image -- the background primitive starts from. */
export function averageColour(img) {
    const { data, w, h } = dims(img);
    let r = 0, g = 0, b = 0; const n = w * h;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Clone an image buffer. */
export function cloneImage(img) { const { data, w, h } = dims(img); return { data: new Uint8ClampedArray(data), w, h }; }

// ---- rasterisation ---------------------------------------------------------------------------------------------

/** The corner points of a shape, as a convex polygon. Ellipses have no polygon and return null. */
export function pointsOf(s) {
    if (s.kind === "triangle") return [[s.x1, s.y1], [s.x2, s.y2], [s.x3, s.y3]];
    if (s.kind === "rect") return [[s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h]];
    if (s.kind === "rotatedRect") {
        const c = Math.cos(s.angle), sn = Math.sin(s.angle), hw = s.w / 2, hh = s.h / 2;
        return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [s.x + x * c - y * sn, s.y + x * sn + y * c]);
    }
    return null;
}

/**
 * The rows a shape covers, as [y, x0, x1) spans clipped to the canvas.
 *
 * *** A SHAPE THAT IS ENTIRELY OFF-CANVAS MUST PRODUCE NO SPANS, NOT NEGATIVE ONES. *** The optimal colour
 * divides by the covered-pixel count, so an empty coverage that still reports rows yields 0/0 -- a NaN colour
 * that composites the whole shape to zero and, worse, scores as a huge improvement. Every span here is clipped
 * and then dropped if empty.
 */
export function spansOf(shape, w, h) {
    const spans = [];
    const pts = pointsOf(shape);
    if (pts) {
        let minY = Infinity, maxY = -Infinity;
        for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
        const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY));
        for (let y = y0; y <= y1; y++) {
            const cy = y + 0.5;
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < pts.length; i++) {
                const a = pts[i], b = pts[(i + 1) % pts.length];
                if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
                    const t = (cy - a[1]) / (b[1] - a[1]);
                    const x = a[0] + t * (b[0] - a[0]);
                    if (x < lo) lo = x; if (x > hi) hi = x;
                }
            }
            if (lo > hi) continue;
            const x0 = Math.max(0, Math.round(lo)), x1 = Math.min(w, Math.round(hi));
            if (x1 > x0) spans.push([y, x0, x1]);
        }
        return spans;
    }
    // ellipse, analytically: x = cx +/- rx*sqrt(1 - ((y-cy)/ry)^2)
    const y0 = Math.max(0, Math.floor(shape.y - shape.ry)), y1 = Math.min(h - 1, Math.ceil(shape.y + shape.ry));
    for (let y = y0; y <= y1; y++) {
        const dy = (y + 0.5 - shape.y) / shape.ry;
        if (Math.abs(dy) > 1) continue;
        const half = shape.rx * Math.sqrt(1 - dy * dy);
        const x0 = Math.max(0, Math.round(shape.x - half)), x1 = Math.min(w, Math.round(shape.x + half));
        if (x1 > x0) spans.push([y, x0, x1]);
    }
    return spans;
}

/** How many pixels a span list covers. */
export function areaOf(spans) { let n = 0; for (const s of spans) n += s[2] - s[1]; return n; }

// ---- the two ideas ----------------------------------------------------------------------------------------------

/**
 * The exact least-squares colour for a shape at this alpha. See the header derivation.
 * Returns null when the shape covers nothing -- a caller must not average over zero pixels.
 */
export function optimalColour(target, current, spans, alpha) {
    const t = dims(target), c = dims(current);
    let r = 0, g = 0, b = 0, n = 0;
    for (const [y, x0, x1] of spans) {
        for (let x = x0; x < x1; x++) {
            const i = (y * t.w + x) * 4;
            r += (t.data[i] - c.data[i]) / alpha + c.data[i];
            g += (t.data[i + 1] - c.data[i + 1]) / alpha + c.data[i + 1];
            b += (t.data[i + 2] - c.data[i + 2]) / alpha + c.data[i + 2];
            n++;
        }
    }
    if (!n) return null;
    const clamp = (v) => Math.max(0, Math.min(255, Math.round(v / n)));
    return [clamp(r), clamp(g), clamp(b)];
}

/**
 * The value a composite ACTUALLY takes once stored, which is not the value the arithmetic produces.
 *
 * *** THE CANVAS IS Uint8ClampedArray, AND IT ROUNDS HALF TO EVEN. *** The first version of
 * differenceChange scored the ideal float composite while drawShape stored the quantised one, so the
 * predicted improvement was never quite the realised improvement -- and fit() accumulates those predictions
 * rather than re-measuring. MEASURED: the accumulated total drifted 0.13% optimistic after 10 shapes and
 * 2.38% after 120, ALWAYS in the flattering direction, so the fit reported itself better than it was and the
 * lie grew with every shape. Modelling the quantisation here makes the prediction exact instead.
 * (Uint8ClampedArray(0.5) is 0 and (1.5) is 2 -- banker's rounding, not the round() everyone reaches for.)
 */
export function quantise(v) {
    if (!(v > 0)) return 0;                       // negatives and NaN clamp to 0, as the array does
    if (v >= 255) return 255;
    const f = Math.floor(v), d = v - f;
    if (d < 0.5) return f;
    if (d > 0.5) return f + 1;
    return (f % 2 === 0) ? f : f + 1;             // exactly .5 goes to the even neighbour
}

/** Total squared error between two images, over every pixel and the three colour channels. */
export function difference(a, b) {
    const A = dims(a), B = dims(b);
    let sum = 0;
    for (let i = 0; i < A.data.length; i += 4) {
        const dr = A.data[i] - B.data[i], dg = A.data[i + 1] - B.data[i + 1], db = A.data[i + 2] - B.data[i + 2];
        sum += dr * dr + dg * dg + db * db;
    }
    return sum;
}

/** Normalised RMS distance in [0,1], from a squared-error total. Comparable across image sizes. */
export function distanceOf(diff, pixels) { return Math.sqrt(diff / (pixels * 3)) / 255; }

/**
 * How much the total squared error CHANGES if this shape is drawn -- computed over the shape's own pixels.
 * Negative is an improvement. This is idea 2, and it is exact rather than an estimate: pixels outside the
 * shape are untouched, so they contribute exactly zero to the difference.
 */
export function differenceChange(target, current, spans, colour, alpha) {
    const t = dims(target), c = dims(current);
    let delta = 0;
    for (const [y, x0, x1] of spans) {
        for (let x = x0; x < x1; x++) {
            const i = (y * t.w + x) * 4;
            for (let k = 0; k < 3; k++) {
                const tv = t.data[i + k], cv = c.data[i + k];
                const nv = quantise(cv * (1 - alpha) + colour[k] * alpha);
                delta += (tv - nv) * (tv - nv) - (tv - cv) * (tv - cv);
            }
        }
    }
    return delta;
}

/** Composite a shape onto a canvas, in place. */
export function drawShape(canvas, spans, colour, alpha) {
    const c = dims(canvas);
    for (const [y, x0, x1] of spans) {
        for (let x = x0; x < x1; x++) {
            const i = (y * c.w + x) * 4;
            for (let k = 0; k < 3; k++) c.data[i + k] = c.data[i + k] * (1 - alpha) + colour[k] * alpha;
        }
    }
    return canvas;
}

// ---- the search ---------------------------------------------------------------------------------------------

export function randomShape(kind, w, h, rng) {
    const rx = () => rng() * w, ry = () => rng() * h;
    if (kind === "triangle") {
        const x = rx(), y = ry(), s = 8 + rng() * Math.min(w, h) / 2;
        return { kind, x1: x, y1: y, x2: x + (rng() - 0.5) * s, y2: y + (rng() - 0.5) * s,
                 x3: x + (rng() - 0.5) * s, y3: y + (rng() - 0.5) * s };
    }
    if (kind === "rect") return { kind, x: rx(), y: ry(), w: 2 + rng() * w / 2, h: 2 + rng() * h / 2 };
    if (kind === "rotatedRect") return { kind, x: rx(), y: ry(), w: 2 + rng() * w / 2, h: 2 + rng() * h / 2, angle: rng() * Math.PI };
    return { kind: "ellipse", x: rx(), y: ry(), rx: 2 + rng() * w / 4, ry: 2 + rng() * h / 4 };
}

/** A shape nudged. Every numeric field moves; sizes stay positive. */
export function mutateShape(s, w, h, rng, scale = 1) {
    const n = { ...s };
    const jitter = (v, k) => v + (rng() - 0.5) * k * scale;
    const span = Math.max(w, h) / 8;
    for (const key of Object.keys(n)) {
        if (key === "kind") continue;
        if (key === "angle") { n[key] = jitter(n[key], 0.6); continue; }
        n[key] = jitter(n[key], span);
    }
    for (const key of ["w", "h", "rx", "ry"]) if (key in n) n[key] = Math.max(1, n[key]);
    return n;
}

/**
 * One shape: the best of `candidates` random starts, then hill-climbed by `mutations` nudges.
 *
 * *** THE HILL CLIMB KEEPS ONLY IMPROVEMENTS AND GIVES UP AFTER `patience` CONSECUTIVE FAILURES. *** Running
 * a fixed number of mutations regardless spends most of its budget on shapes that stopped improving twenty
 * nudges ago -- the same total work buys more shapes when it is spent where it still helps.
 */
export function fitStep(target, current, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const t = dims(target);
    const rng = o.rng || mulberry32(1);
    const kinds = o.kinds || KINDS;
    const score = (shape) => {
        const spans = spansOf(shape, t.w, t.h);
        if (!spans.length) return null;
        const colour = optimalColour(target, current, spans, o.alpha);
        if (!colour) return null;
        return { shape, spans, colour, delta: differenceChange(target, current, spans, colour, o.alpha) };
    };

    let best = null;
    for (let i = 0; i < o.candidates; i++) {
        const cand = score(randomShape(kinds[(rng() * kinds.length) | 0], t.w, t.h, rng));
        if (cand && (!best || cand.delta < best.delta)) best = cand;
    }
    if (!best) return null;

    let fails = 0;
    for (let i = 0; i < o.mutations && fails < o.patience; i++) {
        const cand = score(mutateShape(best.shape, t.w, t.h, rng));
        if (cand && cand.delta < best.delta) { best = cand; fails = 0; } else fails++;
    }
    return best;
}

/**
 * Fit a whole picture. Returns the canvas, the shapes chosen, and the distance after each one.
 * A step that cannot improve the picture is DISCARDED rather than drawn -- see the note in the gate.
 */
export function fit(target, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const t = dims(target);
    const rng = o.rng || mulberry32(o.seed || 1);
    const canvas = blank(t.w, t.h, o.background || averageColour(target));
    const pixels = t.w * t.h;
    let diff = difference(target, canvas);
    const shapes = [], trace = [distanceOf(diff, pixels)];
    for (let n = 0; n < (o.shapes || 20); n++) {
        const step = fitStep(target, canvas, { ...o, rng });
        if (!step || step.delta >= 0) { trace.push(distanceOf(diff, pixels)); continue; }
        drawShape(canvas, step.spans, step.colour, o.alpha);
        diff += step.delta;
        shapes.push({ ...step.shape, colour: step.colour, alpha: o.alpha });
        trace.push(distanceOf(diff, pixels));
    }
    return { canvas, shapes, trace, distance: distanceOf(diff, pixels), difference: diff };
}

export default { KINDS, DEFAULTS, fit, fitStep, optimalColour, differenceChange, difference, distanceOf, spansOf };
