// WebGLEngine/fx/polyBrush.mjs -- v4421
//
// *** AN ARBITRARY CLOSED POLYGON AS A BRUSH, AND THE FILL RULE THAT WAS NEVER A CHOICE. ***
//
// fx/primitiveFit.mjs places four shapes: triangle, rect, rotatedRect, ellipse. v4419 measured that a kind
// outside that list used to rasterise BIT-IDENTICALLY to an ellipse and made it refuse instead. This is the
// fifth kind, and it is the first one that costs the fitter nothing structurally:
//
//   * A POLYGON IS A FILLED REGION WITH ONE FREE COLOUR, so optimalColour applies unchanged -- the exact
//     least-squares mean over its pixels, the module's first headline idea, with nothing to re-derive.
//   * ITS COVERAGE IS SPANS, so differenceChange applies unchanged -- the second idea, scoring over the
//     shape rather than the picture.
//
// Compare what does NOT fit: render/doomFire.mjs has a fixed 37-colour palette and a stateful, order-dependent
// update, so it breaks both (v4419 measured the palette cost at 5.7%); fx/procBrush.mjs emits line SEGMENTS at
// alpha 0.12 that ACCUMULATE, which is a different compositing model rather than a different shape.
//
// ---- THE PART THAT IS NOT FREE: primitiveFit's SCANLINE IS CONVEX-ONLY AND DOES NOT SAY SO ---------------------
//
// Its polygon path takes the MIN and MAX crossing on each scanline and fills between them. For a triangle or
// a rectangle that is exactly right, because a convex shape crosses any horizontal line exactly twice. FOR A
// CONCAVE ONE IT FILLS THE NOTCHES -- it draws the shape's row-wise convex hull, silently, and a star comes
// out a blob.
//
// evenOddSpans below pairs ALL the crossings instead, which is SVG's `fill-rule: evenodd`. *** AND THE CHANGE
// IS SAFE PRECISELY BECAUSE THE THREE EXISTING POLYGON KINDS ARE CONVEX: *** with exactly two crossings the
// pairing IS the min and the max, so the two rules agree BIT FOR BIT, which the gate measures over random
// shapes rather than arguing.
//
// ---- AND THE RULE NOT CHOSEN, NAMED --------------------------------------------------------------------------
//
// SVG's OTHER rule is `nonzero`, which counts winding direction and so FILLS the overlap of a self-crossing
// path where evenodd leaves it empty. The tree's own digit 8 is exactly that case: a figure-eight whose two
// lobes wind oppositely, so its shoelace area nearly cancels (14.67 against digit 0's 174.92 for a glyph of
// the same size). EVENODD IS IMPLEMENTED AND NONZERO IS NOT, and the gate measures where they would differ
// rather than leaving the choice unstated.
"use strict";

import { DIGIT_STROKES, parseStroke, resample, morphAt } from "../physics/mesh/strokeMorph.mjs";
import { flattenPath } from "../ui/svgPath.mjs";
import { blank, drawShape, mulberry32 } from "./primitiveFit.mjs";

/**
 * The crossings of one scanline, as x positions, using primitiveFit's own conventions: the scanline sits at
 * y + 0.5 and an edge counts when it straddles it half-open. *** THE HALF-OPEN TEST IS WHAT MAKES A VERTEX
 * LANDING ON THE SCANLINE COUNT ONCE RATHER THAN TWICE, *** which is the whole reason an even-odd pairing is
 * well defined at all.
 */
export function crossingsAt(points, cy) {
    const xs = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
            const t = (cy - a[1]) / (b[1] - a[1]);
            xs.push(a[0] + t * (b[0] - a[0]));
        }
    }
    return xs.sort((p, q) => p - q);
}

/** primitiveFit's CURRENT rule, extracted so the two can be compared rather than described. */
export function convexSpans(points, w, h) {
    const spans = [];
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
        const xs = crossingsAt(points, y + 0.5);
        if (!xs.length) continue;
        const x0 = Math.max(0, Math.round(xs[0])), x1 = Math.min(w, Math.round(xs[xs.length - 1]));
        if (x1 > x0) spans.push([y, x0, x1]);
    }
    return spans;
}

/** SVG's `fill-rule: evenodd`: pair the sorted crossings, first-to-second, third-to-fourth, and so on. */
export function evenOddSpans(points, w, h) {
    const spans = [];
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
        const xs = crossingsAt(points, y + 0.5);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const x0 = Math.max(0, Math.round(xs[k])), x1 = Math.min(w, Math.round(xs[k + 1]));
            if (x1 > x0) spans.push([y, x0, x1]);
        }
    }
    return spans;
}

/** SVG's other rule, for MEASURING the difference rather than for use -- see the header. */
export function nonZeroSpans(points, w, h) {
    const spans = [];
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
    const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(h - 1, Math.ceil(maxY));
    for (let y = y0; y <= y1; y++) {
        const cy = y + 0.5, hits = [];
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            if (a[1] <= cy && b[1] > cy) hits.push({ x: a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), dir: 1 });
            else if (b[1] <= cy && a[1] > cy) hits.push({ x: a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), dir: -1 });
        }
        hits.sort((p, q) => p.x - q.x);
        let wind = 0, start = 0;
        for (const t of hits) {
            if (wind === 0) start = t.x;
            wind += t.dir;
            if (wind === 0) {
                const x0 = Math.max(0, Math.round(start)), x1 = Math.min(w, Math.round(t.x));
                if (x1 > x0) spans.push([y, x0, x1]);
            }
        }
    }
    return spans;
}

/** Total covered pixels, and the set itself, so two rules can be compared per pixel rather than in total. */
export function pixelSet(spans, w) {
    const s = new Set();
    for (const [y, x0, x1] of spans) for (let x = x0; x < x1; x++) s.add(y * w + x);
    return s;
}

/** Shoelace area. Its near-cancellation is the signature of a figure-eight, which is why it is exported. */
export function signedArea(points) {
    let s = 0;
    for (let i = 0; i < points.length; i++) { const q = points[(i + 1) % points.length]; s += points[i][0] * q[1] - q[0] * points[i][1]; }
    return s / 2;
}

/** True when every turn goes the same way. */
export function isConvex(points) {
    let sign = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
        const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
        if (Math.abs(cr) < 1e-9) continue;
        const s = Math.sign(cr);
        if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
}

/** Fit a polygon into a box, so glyphs authored on a 24-unit grid can be placed at any size. */
export function fitInto(points, x, y, w, h) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const sx = (x1 - x0) > 1e-9 ? w / (x1 - x0) : 1, sy = (y1 - y0) > 1e-9 ? h / (y1 - y0) : 1;
    return points.map((p) => [x + (p[0] - x0) * sx, y + (p[1] - y0) * sy]);
}

/** One of the tree's ten digit glyphs, flattened and closed into a polygon. */
export function glyphPolygon(digit, { steps = 16, n = 64 } = {}) {
    const d = DIGIT_STROKES[String(digit)];
    if (!d) throw new Error("no glyph for " + digit);
    return resample(parseStroke(d, steps), n);
}

/**
 * The morph between two glyphs, at t. *** THIS IS THE PART NO OTHER PRIMITIVE HAS: A CONTINUOUS SHAPE
 * PARAMETER. *** A rect has a width and a height; a polygon brush drawn from a morph has a knob that walks
 * one outline into another, and the gate measures that the walk crosses a topological change rather than
 * merely interpolating coordinates.
 */
export function glyphMorph(a, b, t, opts = {}) {
    return morphAt(glyphPolygon(a, opts), glyphPolygon(b, opts), t);
}

/** A concave, non-self-crossing fixture from the tree's own SVG path flattener. */
export function starPolygon({ cx = 32, cy = 32, outer = 28, inner = 11, points = 5 } = {}) {
    let d = "M";
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner, a = -Math.PI / 2 + i * Math.PI / points;
        d += ` ${(cx + r * Math.cos(a)).toFixed(3)} ${(cy + r * Math.sin(a)).toFixed(3)}` + (i === 0 ? " L" : "");
    }
    return flattenPath(d + " Z")[0];
}

/** Place a glyph outline as a polygon shape: a box, a rotation, and which glyph (or which morph). */
export function glyphShape({ glyph = 0, to = null, t = 0, x = 0, y = 0, w = 20, h = 20, angle = 0, n = 48 } = {}) {
    const base = to === null ? glyphPolygon(glyph, { n }) : glyphMorph(glyph, to, t, { n });
    const box = fitInto(base, -w / 2, -h / 2, w, h);
    const c = Math.cos(angle), sn = Math.sin(angle);
    const points = box.map(([px, py]) => [x + px * c - py * sn, y + px * sn + py * c]);
    return { kind: "polygon", points, glyph, to, t, x, y, w, h, angle, n };
}

/**
 * A random glyph placement, in fitStep's `propose` slot. *** THE SHAPE PARAMETER IS WHAT NO OTHER PRIMITIVE
 * HAS: *** `t` walks one outline into another, so the search has a continuous knob over FORM and not only
 * over position and size.
 */
export function randomGlyph(w, h, rng, { morph = true, n = 48 } = {}) {
    const g = (rng() * 10) | 0;
    return glyphShape({ glyph: g, to: morph ? (rng() * 10) | 0 : null, t: morph ? rng() : 0,
                        x: rng() * w, y: rng() * h, w: 4 + rng() * w * 0.7, h: 4 + rng() * h * 0.7,
                        angle: (rng() - 0.5) * Math.PI, n });
}

/**
 * Nudge a glyph placement. *** mutateShape CANNOT DO THIS: it jitters every numeric field, and `points` is an
 * array, so it would produce NaN. *** The outline is rebuilt from the parameters instead, which is why the
 * shape carries them.
 */
export function mutateGlyph(shape, w, h, rng, scale = 1) {
    const span = Math.max(w, h) / 8;
    const j = (v, k) => v + (rng() - 0.5) * k * scale;
    return glyphShape({
        glyph: shape.glyph, to: shape.to, n: shape.n,
        t: shape.to === null ? 0 : Math.max(0, Math.min(1, j(shape.t, 0.3))),
        x: j(shape.x, span), y: j(shape.y, span),
        w: Math.max(2, j(shape.w, span)), h: Math.max(2, j(shape.h, span)),
        angle: j(shape.angle, 0.6),
    });
}

/**
 * A target built OUT OF glyphs, so the brush has something it should be good at -- and the gate pairs it with
 * a control the brush should be BAD at, because a fixture made of the thing under test proves nothing on its
 * own.
 */
export function glyphTargetPlan(w, h, seed = 1, { count = 4 } = {}) {
    const r = mulberry32(seed >>> 0);
    const bg = [30 + r() * 60, 30 + r() * 60, 40 + r() * 60];
    const shapes = [];
    for (let i = 0; i < count; i++) {
        const sh = glyphShape({ glyph: (r() * 10) | 0, x: (0.2 + r() * 0.6) * w, y: (0.2 + r() * 0.6) * h,
                                w: (0.2 + r() * 0.3) * w, h: (0.25 + r() * 0.35) * h, angle: (r() - 0.5) * 1.2 });
        shapes.push({ shape: sh, colour: [60 + r() * 190, 60 + r() * 190, 60 + r() * 190] });
    }
    return { bg, shapes };
}

/**
 * Paint a plan. *** SPLIT OUT SO THE TARGET AND ITS OWN FOUR SHAPES ARE THE SAME OBJECT: *** the gate paints
 * the plan to make the picture and then hands the SAME four shapes back to the fitter as a witness, which is
 * what turns "the search did not find it" into a number rather than a suspicion. v4417 did this by replaying
 * makeTarget's RNG; here the plan is returned outright, so there is no duplicate to keep in step.
 */
export function paintPlan(plan, w, h, { alpha = 1 } = {}) {
    const img = blank(w, h, plan.bg);
    for (const { shape, colour } of plan.shapes) drawShape(img, evenOddSpans(shape.points, w, h), colour, alpha);
    return img;
}

export const glyphTarget = (w, h, seed = 1, opts = {}) => paintPlan(glyphTargetPlan(w, h, seed, opts), w, h);
