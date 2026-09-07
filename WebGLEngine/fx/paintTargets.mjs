// WebGLEngine/fx/paintTargets.mjs -- v4417
//
// *** WHAT THE PAINTER HAS EVER BEEN SHOWN, AND WHAT HAPPENS WHEN IT IS SHOWN SOMETHING ELSE. ***
//
// v4220 built a policy that PLACES shapes over fx/primitiveFit.mjs, whose colour is solved in closed form so
// the policy never has to learn one. Its gate is careful about the comparison it makes and honest about the
// one it loses. What neither says is what its TARGET is:
//
//     brain/rl/paintEnv.js's makeTarget draws four flat quadrants and one flat disc. FIVE FLAT REGIONS, at
//     every seed. It is a picture the fitter's own model class -- unions of flat-coloured convex shapes --
//     can reproduce with FIVE SHAPES.
//
// So every number ever measured about that painter was measured on a target it could in principle finish
// exactly. That is not a fault; it is a fact nobody had written down, and it makes three questions askable
// for the first time. This module supplies the targets to ask them with.
//
// ---- THE THREE TARGETS, AND WHY EACH ONE IS THE ONE IT IS -----------------------------------------------------
//
//   flat regions   makeTarget's own picture -- exactly representable, and rebuilt HERE from recovered
//                  geometry so the reconstruction can be held to it bit for bit rather than trusted.
//   a ramp         a linear grey wedge. Piecewise-constant approximation of a linear function has a KNOWN
//                  optimum -- N equal strips give RMS = range / (N * sqrt(12)) -- so the fitter can be
//                  measured against a bound rather than against its own previous run.
//   a render       a real frame: physics/render/sdfMarch.mjs sphere-tracing a Wyvill metaball field from
//                  physics/mesh/marchingCubes.js, Lambert plus a specular, over a graded backdrop. Curved
//                  shading, a silhouette and a highlight, computed by two shipped and gated modules rather
//                  than drawn by this file pretending to be a renderer.
//
// ---- AND THE COMPOSITION, WHICH IS THE PART THAT HAD TO STAY OUT OF THE GATE ------------------------------------
//
// tools/ship/composePropose.mjs has a small local model propose a diorama and composeValidate.mjs decide
// whether the stage can build it. *** THE MODEL DOES NOT COME INTO THIS. *** Two reasons, and the first is
// the important one:
//
//   1. composeValidate.mjs's header names the failure: "A MODEL WHOSE OUTPUT IS ACCEPTED BECAUSE IT PARSED IS
//      THE VOYAGER FAILURE THIS TREE ALREADY CRITICISED... which is the model judging its own work." Scoring
//      a generated composition by how well a learned painter reproduces it is that failure with an extra hop.
//      What is used here is the VALIDATOR and the composition's declared PROP COUNT -- a number a person
//      typed or a model proposed and a checker approved -- as an independent variable. Nothing reads a
//      judgement out of a picture.
//   2. The producer needs ollama, and "there was no model" is its own reported state. A gate that depends on
//      it is a SKIP, and a SKIP is a fail.
//
// `ballsForProps` is the whole of the composition-to-scene rule and it is deliberately trivial: one ball per
// declared prop, on a fixed golden-angle ring. IT IS STATED RATHER THAN TUNED, because the round's question
// is whether the DECLARED count shows up downstream at all -- and if the mapping were tuned until it did,
// the answer would be about the mapping.
"use strict";

import { blank, difference, distanceOf, averageColour, spansOf, drawShape, optimalColour, mulberry32, fit } from "./primitiveFit.mjs";
import { dims } from "../render/perceptual.mjs";
import { marchBalls } from "../physics/render/sdfMarch.mjs";
import { wyvill, wyvillGrad } from "../physics/mesh/marchingCubes.js";

/** How many distinct RGB triples an image uses. The cheapest statement of "how flat is this". */
export function distinctColours(img) {
    const { data } = dims(img);
    const s = new Set();
    for (let i = 0; i < data.length; i += 4) s.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    return s.size;
}

/** The starting distance a fitter faces: the flat average against the target. */
export function startDistanceOf(img) {
    const { w, h } = dims(img);
    return distanceOf(difference(img, blank(w, h, averageColour(img))), w * h);
}

/**
 * makeTarget's geometry, recovered by replaying its RNG in its own order.
 *
 * *** THIS IS A DUPLICATE OF brain/rl/paintEnv.js AND THE GATE MAKES IT FALSIFIABLE RATHER THAN TRUSTED. ***
 * Rebuilding the image from these numbers must reproduce makeTarget BIT FOR BIT; if paintEnv's generator ever
 * changes, that check goes red instead of this file quietly describing a picture that no longer exists. A
 * copy nobody compares is the thing this tree calls a fiction.
 */
export function targetGeometry(w, h, seed = 1) {
    const r = mulberry32(seed >>> 0);
    const cols = [];
    for (let i = 0; i < 4; i++) cols.push([40 + r() * 200, 40 + r() * 200, 40 + r() * 200]);
    const cx = (0.3 + r() * 0.4) * w, cy = (0.3 + r() * 0.4) * h, rad = (0.15 + r() * 0.12) * Math.min(w, h);
    const disc = [40 + r() * 200, 40 + r() * 200, 40 + r() * 200];
    const sx = (0.3 + r() * 0.4) * w, sy = (0.3 + r() * 0.4) * h;
    return { cols, disc, cx, cy, rad, sx, sy };
}

/** The five shapes that ARE that picture: four quadrant rectangles and the disc, in the fitter's own format. */
export function targetShapes(w, h, seed = 1) {
    const g = targetGeometry(w, h, seed);
    return [
        { kind: "rect", x: 0, y: 0, w: g.sx, h: g.sy },
        { kind: "rect", x: g.sx, y: 0, w: w - g.sx, h: g.sy },
        { kind: "rect", x: 0, y: g.sy, w: g.sx, h: h - g.sy },
        { kind: "rect", x: g.sx, y: g.sy, w: w - g.sx, h: h - g.sy },
        { kind: "ellipse", x: g.cx, y: g.cy, rx: g.rad, ry: g.rad },
    ];
}

/**
 * Rebuild the image from an EXPLICIT geometry, pixel test for pixel test.
 *
 * *** THE DISC TEST IS STRICT `<`, AND IT IS SPLIT OUT HERE BECAUSE THE BIT-IDENTITY CHECK CANNOT SEE IT. ***
 * Changing it to `<=` leaves makeTarget's own five seeds bit-identical -- no integer pixel lands EXACTLY on a
 * radius those seeds produce, so the convention is unconstrained by that comparison however many seeds it
 * runs. Taking geometry as an argument lets the gate hand in a radius the boundary does hit (cx = cy = 0,
 * rad = 5 puts pixel (3,4) exactly on the circle) and pin the convention on purpose. A sabotage going 0 RED
 * is what bought this split.
 */
export function rebuildFrom(g, w, h) {
    const im = blank(w, h, [20, 20, 30]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const c = g.cols[(x < g.sx ? 0 : 1) + (y < g.sy ? 0 : 2)];
        const use = Math.hypot(x - g.cx, y - g.cy) < g.rad ? g.disc : c;
        im.data[i] = use[0]; im.data[i + 1] = use[1]; im.data[i + 2] = use[2];
    }
    return im;
}

/** The same, for one of makeTarget's own seeds. */
export const rebuildFlatTarget = (w, h, seed = 1) => rebuildFrom(targetGeometry(w, h, seed), w, h);

/**
 * Paint the five true shapes, either with the generator's OWN colours or with the fitter's least-squares
 * colour at each step. *** THE TWO ANSWERS ARE DIFFERENT AND THE SECOND IS WORSE, WHICH IS THE POINT. ***
 * primitiveFit's first headline idea is that the colour is SOLVED rather than searched, and it is -- for a
 * shape in isolation. A rectangle that something will later be drawn ON TOP OF is solved for a picture that
 * will not exist, and the greedy fitter never revisits it.
 */
export function paintFive(target, shapes, { colours = null, alpha = 1 } = {}) {
    const { w, h } = dims(target);
    const canvas = blank(w, h, averageColour(target));
    shapes.forEach((s, i) => {
        const spans = spansOf(s, w, h);
        if (!spans.length) return;
        const c = colours ? colours[i] : optimalColour(target, canvas, spans, alpha);
        if (c) drawShape(canvas, spans, c, alpha);
    });
    return { canvas, distance: distanceOf(difference(target, canvas), w * h) };
}

/** How many pixels two images disagree on at all, and the worst sum-of-channels disagreement. */
export function pixelDisagreement(a, b) {
    const A = dims(a), B = dims(b);
    let n = 0, worst = 0;
    for (let i = 0; i < A.data.length; i += 4) {
        const d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
        if (d > 0) { n++; if (d > worst) worst = d; }
    }
    return { pixels: n, worst, of: A.data.length / 4 };
}

/** A linear grey wedge across x. Varies along ONE axis, which is what makes its optimum a closed form. */
export function rampTarget(w, h) {
    const im = blank(w, h, [0, 0, 0]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, v = Math.round(255 * x / (w - 1));
        im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v;
    }
    return im;
}

/**
 * The best a partition into N equal vertical strips can do -- each strip's own mean, which is the
 * least-squares constant for it. For a linear ramp this approaches range / (N * sqrt(12)), and the gate
 * checks the closed form against this sum rather than asserting either alone.
 */
export function stripOptimum(img, N) {
    const { data, w, h } = dims(img);
    let diff = 0;
    for (let k = 0; k < N; k++) {
        const x0 = Math.floor(k * w / N), x1 = Math.floor((k + 1) * w / N);
        if (x1 <= x0) continue;
        for (let ch = 0; ch < 3; ch++) {
            let sum = 0, n = 0;
            for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) { sum += data[(y * w + x) * 4 + ch]; n++; }
            const m = sum / n;
            for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) { const d = data[(y * w + x) * 4 + ch] - m; diff += d * d; }
        }
    }
    return distanceOf(diff, w * h);
}

/** One ball per declared prop, on a fixed golden-angle ring. Stated, never tuned -- see the header. */
export const ballsForProps = (n) => Array.from({ length: n }, (_, k) => {
    const a = k * 2.399963229728653;
    return { cx: Math.cos(a) * 1.05, cy: Math.sin(a) * 0.85, cz: (k % 2) * 0.4, r: 2.1 + 0.15 * (k % 3), s: 1 };
});

/**
 * A REAL FRAME. Orthographic rays, sphere-traced into the metaball field by physics/render/sdfMarch.mjs,
 * shaded Lambert plus a tight specular, over a backdrop that is a gradient by construction. Every non-flat
 * thing in it -- the curved shading, the highlight, the silhouette, the graded sky -- is something no finite
 * union of flat shapes reproduces exactly, and all of it is computed by shipped modules this file only calls.
 */
export function marchedTarget(w, h, balls, { dx = 0, dy = 0, light = [0.577, 0.577, 0.577] } = {}) {
    const im = blank(w, h, [0, 0, 0]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w * 2 - 1, v = 1 - (y + 0.5) / h * 2;
        const r = marchBalls(balls, [u * 2 - dx, v * 2 - dy, -6], [0, 0, 1], { iso: 0.5, wyvill, wyvillGrad, maxSteps: 96, tMax: 14 });
        let c;
        if (r.hit && r.N) {
            const nl = Math.hypot(r.N[0], r.N[1], r.N[2]) || 1;
            const d = Math.max(0, -((r.N[0] / nl) * light[0] + (r.N[1] / nl) * light[1] + (r.N[2] / nl) * light[2]));
            const s = Math.pow(d, 24);
            c = [30 + 190 * d + 200 * s, 40 + 150 * d + 200 * s, 60 + 120 * d + 200 * s];
        } else {
            const g = 0.5 - v * 0.35;
            c = [30 + 90 * g, 35 + 100 * g, 60 + 120 * g];
        }
        const i = (y * w + x) * 4;
        im.data[i] = Math.min(255, c[0]); im.data[i + 1] = Math.min(255, c[1]); im.data[i + 2] = Math.min(255, c[2]);
    }
    return im;
}

/** How many shapes the fitter needs to get within `frac` of the starting distance. null if it never does. */
export function budgetTo(target, frac, { cap = 80, seed = 7, ...o } = {}) {
    const start = startDistanceOf(target);
    const r = fit(target, { shapes: cap, seed, ...o });
    for (let i = 0; i < r.trace.length; i++) if (r.trace[i] <= frac * start) return i;
    return null;
}

/** Least-squares slope of log(distance) against log(N) -- the fitter's convergence exponent on this target. */
export function convergenceExponent(target, Ns, { seed = 7, ...o } = {}) {
    const xs = [], ys = [];
    for (const N of Ns) { xs.push(Math.log(N)); ys.push(Math.log(fit(target, { shapes: N, seed, ...o }).distance)); }
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    return -num / den;
}
