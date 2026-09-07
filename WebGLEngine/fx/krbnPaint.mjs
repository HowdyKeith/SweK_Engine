// WebGLEngine/fx/krbnPaint.mjs -- v4418
//
// *** THE PAINTER IS 2D. KRBN IS THE GATED, EXACT BRIDGE BETWEEN THAT PLANE AND A 3D SURFACE. THEY HAVE NEVER
// BEEN CONNECTED. *** This file is the connector, and it is deliberately small: everything it does is done by
// modules that already exist and are already graded.
//
//   fx/primitiveFit.mjs        places flat convex shapes into an RGBA raster
//   tools/krbn/krbnCompare.js  project() flattens 3D to screen; backProjectHit() puts a screen point back on
//                              the SURFACE as { point, tri, bary } through a cached BVH
//   tools/krbn/strokeLift.js   liftStrokes() runs that over every point of a polyline, breaking it where the
//                              ray leaves the mesh so nothing is emitted floating in space
//
// A painted shape already HAS a screen-space boundary polyline -- pointsOf() returns the corner polygon for
// the three polygonal kinds and an ellipse samples -- so the painter's output is already in liftStrokes's
// input format. NOTHING NEW HAD TO BE INVENTED; the two halves simply had no caller in common.
//
// ---- WHY THIS IS WORTH A ROUND AND NOT JUST A WIRE ---------------------------------------------------------
//
// v2721 settled that Krbn's flattening is one-way FOR THE PICTURE and reversible GIVEN THE GEOMETRY, and
// krbnCompare-selfcheck holds the round-trip for a single point at err < 1e-6. What nobody has asked is what
// happens to a WHOLE SHAPE, and the answer splits a number the painter reports as one thing:
//
//   *** THE FITTER SCORES IN SCREEN SPACE, WHERE A PIXEL BESIDE A SILHOUETTE COSTS EXACTLY WHAT A PIXEL IN THE
//   MIDDLE OF A FACE COSTS. ON THE SURFACE THEY ARE NOT THE SAME PIXEL. *** One shape lands on a single
//   triangle patch; another lands on two disjoint patches; a third lands on nothing at all and is a mark on
//   the empty space around the object. The painter's own residual cannot tell those apart, and the lift makes
//   the difference explicit for every shape it placed.
//
// ---- WHAT IS AND IS NOT A SURFACE-SCORED FITTER --------------------------------------------------------------
//
// surfaceScoredTarget() below builds one out of the shipped fitter with no new search code: the off-mesh
// pixels of the target are set to the background colour the canvas starts at, so they begin at zero error.
// *** THAT IS A PENALTY, NOT A MASK, AND THE DIFFERENCE IS STATED RATHER THAN GLOSSED. *** Masking the score
// would make a background pixel contribute nothing whether painted or not; here, covering one COSTS. The
// stronger condition is the useful one for this question -- and calling it "masking" would be describing an
// experiment nobody ran.
"use strict";

import { blank, spansOf, pointsOf, averageColour, quantise } from "./primitiveFit.mjs";
import { dims } from "../render/perceptual.mjs";
import { KRBN_CAM, project, backProjectHit } from "../tools/krbn/krbnCompare.js";
import { liftStrokes, drawingBounds } from "../tools/krbn/strokeLift.js";

/**
 * The pixel-to-screen map for a raster that frames a mesh's drawing.
 *
 * The painter works in pixels and Krbn works in the camera's 720x560 viewport, so something has to carry the
 * two together. The frame is derived from drawingBounds() -- the projected mesh's own bounding box -- with a
 * stated margin, so the object fills the raster the same way at any mesh and any resolution.
 */
export function frameFor(mesh, { w = 64, h = 64, pad = 0.18, cam = KRBN_CAM } = {}) {
    const b = drawingBounds(mesh, cam);
    const side = Math.max(b.x1 - b.x0, b.y1 - b.y0) * (1 + 2 * pad);
    return { w, h, cam, side, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, bounds: b };
}

/** Pixel centre (px, py) to a screen point in the camera's viewport. */
export const toScreen = (f, px, py) => [f.cx - f.side / 2 + (px + 0.5) / f.w * f.side,
                                        f.cy - f.side / 2 + (py + 0.5) / f.h * f.side];

/** The outward face normal of one triangle, from the mesh's own positions. */
export function faceNormal(mesh, tri) {
    const [i, j, k] = mesh.triangles[tri];
    const A = mesh.positions[i], B = mesh.positions[j], C = mesh.positions[k];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const m = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / m, n[1] / m, n[2] / m];
}

/**
 * A rendered frame of the mesh, AND the mask saying which pixels are the object.
 *
 * *** THE PICTURE IS MADE BY THE SAME FUNCTION THAT WILL LIFT THE PAINTER'S SHAPES. *** Every pixel is one
 * backProjectHit() -- the shipped ray-cast through the shipped BVH -- so this file supplies rays and shading
 * and casts nothing itself. The mask is the whole point of the round: it is the fact about the picture that
 * the painter's distance cannot see, and it comes free with the render.
 */
export function krbnTarget(mesh, frame, { light = [0.4, 0.6, 0.7], shine = 20 } = {}) {
    const { w, h, cam } = frame;
    const image = blank(w, h, [0, 0, 0]);
    const hit = new Uint8Array(w * h);
    let onMesh = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const [sx, sy] = toScreen(frame, x, y);
        const g = backProjectHit(sx, sy, mesh, cam);
        const i = (y * w + x) * 4;
        let c;
        if (g) {
            hit[y * w + x] = 1; onMesh++;
            const n = faceNormal(mesh, g.tri);
            const d = Math.abs(n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
            const s = Math.pow(d, shine);
            c = [40 + 180 * d + 180 * s, 50 + 160 * d + 180 * s, 70 + 130 * d + 180 * s];
        } else {
            const g2 = 1 - (y + 0.5) / h;
            c = [25 + 60 * g2, 30 + 70 * g2, 55 + 85 * g2];
        }
        image.data[i] = Math.min(255, c[0]); image.data[i + 1] = Math.min(255, c[1]); image.data[i + 2] = Math.min(255, c[2]);
    }
    return { image, hit, onMesh };
}

/**
 * A painted shape's boundary, as a CLOSED screen-space polyline -- liftStrokes's input format.
 * The three polygonal kinds have corners; an ellipse is sampled, and the sample count is a parameter because
 * it decides how finely a silhouette crossing can be resolved rather than being a detail.
 */
export function boundaryOf(shape, frame, { samples = 48 } = {}) {
    const pts = pointsOf(shape);
    if (pts) return [...pts, pts[0]].map(([px, py]) => toScreen(frame, px, py));
    const out = [];
    for (let k = 0; k <= samples; k++) {
        const a = 2 * Math.PI * k / samples;
        out.push(toScreen(frame, shape.x + shape.rx * Math.cos(a), shape.y + shape.ry * Math.sin(a)));
    }
    return out;
}

/**
 * Every placed shape, sorted by how its boundary meets the surface, plus what the whole painting lifts to.
 *
 * *** A SHAPE THAT STRADDLES A SILHOUETTE CAN LIFT TO NOTHING AT ALL. *** liftStrokes emits a polyline only
 * where two CONSECUTIVE points hit, so a boundary that clips the object between samples contributes no 3D
 * geometry even though part of it is genuinely on the surface. That is strokeLift working correctly -- it
 * refuses to emit anything floating -- and it is why "straddling" and "liftable" are counted separately.
 */
export function classifyShapes(shapes, mesh, frame, opts = {}) {
    const { cam } = frame;
    let whole = 0, straddle = 0, off = 0, polylines = 0, vertices = 0;
    const pieces = [];
    for (const s of shapes) {
        const b = boundaryOf(s, frame, opts);
        let n = 0;
        for (const [x, y] of b) if (backProjectHit(x, y, mesh, cam)) n++;
        if (n === 0) off++; else if (n === b.length) whole++; else straddle++;
        const p = liftStrokes([b], mesh, cam);
        polylines += p.length; vertices += p.reduce((a, q) => a + q.length, 0);
        pieces.push(p.length);
    }
    return { whole, straddle, off, polylines, vertices, pieces, shapes: shapes.length };
}

/** Squared error split by the mask: what is on the object, and what is the empty space around it. */
export function splitError(target, canvas, hit) {
    const T = dims(target), C = dims(canvas);
    let on = 0, off = 0;
    for (let p = 0; p < T.w * T.h; p++) {
        const i = p * 4;
        let d = 0;
        for (let k = 0; k < 3; k++) { const e = T.data[i + k] - C.data[i + k]; d += e * e; }
        if (hit[p]) on += d; else off += d;
    }
    return { on, off };
}

/**
 * Replay the painting shape by shape, recording what each one bought IN TOTAL and what it bought ON THE MESH.
 * The two orderings are the round's sharpest number: the fitter chose by the first and a surface cares about
 * the second. The replay composites exactly as drawShape does, so the per-shape gains sum to the whole.
 */
export function perShapeGain(target, shapes, hit, { background = null } = {}) {
    const T = dims(target);
    const canvas = blank(T.w, T.h, background || averageColour(target));
    const rows = [];
    for (const s of shapes) {
        const spans = spansOf(s, T.w, T.h);
        let gain = 0, gainOn = 0, area = 0, areaOn = 0;
        for (const [y, x0, x1] of spans) for (let x = x0; x < x1; x++) {
            const i = (y * T.w + x) * 4, p = y * T.w + x;
            area++;
            let before = 0, after = 0;
            for (let k = 0; k < 3; k++) {
                const t = T.data[i + k], c = canvas.data[i + k];
                // *** QUANTISED, BECAUSE THE CANVAS IS. *** The first draft compared against the raw float
                // composite and the replay's gains then summed to 1.0004 of the real improvement -- a 0.04%
                // drift that looks like nothing and is a different arithmetic. differenceChange() rounds here
                // and Uint8ClampedArray rounds on assignment; a replay that does neither is measuring a
                // painting nobody painted.
                const nv = quantise(c * (1 - s.alpha) + s.colour[k] * s.alpha);
                before += (t - c) * (t - c); after += (t - nv) * (t - nv);
            }
            gain += before - after;
            if (hit[p]) { gainOn += before - after; areaOn++; }
        }
        for (const [y, x0, x1] of spans) for (let x = x0; x < x1; x++) {
            const i = (y * T.w + x) * 4;
            for (let k = 0; k < 3; k++) canvas.data[i + k] = canvas.data[i + k] * (1 - s.alpha) + s.colour[k] * s.alpha;
        }
        rows.push({ gain, gainOn, area, areaOn });
    }
    return rows;
}

/** How many of the top n by one measure are in the top n by the other. */
export function rankOverlap(rows, n) {
    const byAll = [...rows.keys()].sort((a, b) => rows[b].gain - rows[a].gain).slice(0, n);
    const byOn = new Set([...rows.keys()].sort((a, b) => rows[b].gainOn - rows[a].gainOn).slice(0, n));
    return byAll.filter((i) => byOn.has(i)).length;
}

/**
 * A target whose off-mesh pixels are already the colour the canvas starts at -- see the header. A PENALTY,
 * NOT A MASK: covering a background pixel costs, where masking would merely make it not help.
 */
export function surfaceScoredTarget(target, hit, background) {
    const T = dims(target);
    const out = { data: new Uint8ClampedArray(T.data), w: T.w, h: T.h };
    for (let p = 0; p < T.w * T.h; p++) {
        if (hit[p]) continue;
        const i = p * 4;
        out.data[i] = background[0]; out.data[i + 1] = background[1]; out.data[i + 2] = background[2];
    }
    return out;
}

/** The exact round-trip: every boundary point that hits must project back to where it came from. */
export function boundaryRoundTrip(shapes, mesh, frame, opts = {}) {
    const { cam } = frame;
    let hits = 0, misses = 0, worst = 0;
    for (const s of shapes) for (const [sx, sy] of boundaryOf(s, frame, opts)) {
        const g = backProjectHit(sx, sy, mesh, cam);
        if (!g) { misses++; continue; }
        const p = project(g.point, cam);
        hits++;
        worst = Math.max(worst, Math.hypot(p[0] - sx, p[1] - sy));
    }
    return { hits, misses, worst };
}
