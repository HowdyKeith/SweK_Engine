// WebGLEngine/render/slugMelt.mjs -- v4501
//
// *** A FIRE-FILLED GLYPH MELTS TO A PUDDLE (task 48). *** The task 44 morph (render/slugMorph.mjs over vendor/morphicons)
// takes a glyph outline to ANY closed outline, so the puddle is one more target: an ellipse `width` wide and `height` tall
// sitting on the baseline, wound the way the font winds its OUTER contours (negative signed area, as polygonArea reads it),
// plus one PINHOLE per hole -- a tiny contour of the opposite winding at the hole's centre, so morphicons pairs holes with
// holes and each shrinks to nothing rather than being paired with a duplicated puddle it would cancel (a hole is wound
// against its outer; a hole morphed onto the puddle and a second puddle under it would wind to zero and draw NOTHING).
// The fill (task 47) rides along by holding ONE em rectangle through the melt -- the union of the glyph's bound and the
// puddle's, its floor the fire's source row -- so as the glyph collapses the puddle shows the fire's hottest rows.
"use strict";
import { glyphMorph, polygonArea, polylineToContour } from "./slugMorph.mjs";

/** the signed area of a contour's on-curve points (the shoelace over the curves' starts) */
export function contourArea(contour) { const pts = []; for (const q of contour) pts.push(q[0], q[1]); return polygonArea(pts); }

/**
 * An ellipse `width` x `height` with its bottom on y = `floor`, centred on x = cx, as N points wound NEGATIVE (the font's
 * outer winding). Returned as a Slug contour of degenerate quadratics.
 */
export function puddleContour({ cx = 0.3, floor = 0, width = 0.6, height = 0.12, N = 64 } = {}) {
    const a = width / 2, b = height / 2, cy = floor + b, pts = new Float64Array(N * 2);
    for (let i = 0; i < N; i++) { const th = -2 * Math.PI * i / N; pts[2 * i] = cx + a * Math.cos(th); pts[2 * i + 1] = cy + b * Math.sin(th); }
    return polylineToContour(pts);
}

/** what an N-gon inscribed in an ellipse a x b encloses: pi a b scaled by the polygon's sinc -- the exact key for puddleContour's area */
export function inscribedEllipseArea(width, height, N) { return -(width / 2) * (height / 2) * (N / 2) * Math.sin(2 * Math.PI / N); }

/** a pinhole: a contour of radius r wound POSITIVE (the font's hole winding) at (cx, cy) */
export function pinholeContour(cx, cy, r = 1e-3, N = 8) {
    const pts = new Float64Array(N * 2);
    for (let i = 0; i < N; i++) { const th = 2 * Math.PI * i / N; pts[2 * i] = cx + r * Math.cos(th); pts[2 * i + 1] = cy + r * Math.sin(th); }
    return polylineToContour(pts);
}

/** the centroid of a contour's on-curve points */
export function contourCentre(contour) { let x = 0, y = 0; for (const q of contour) { x += q[0]; y += q[1]; } return [x / contour.length, y / contour.length]; }

/**
 * The melt target for a glyph outline: one puddle under the glyph's bound (its width `spread` times the glyph's, its
 * height `height` em, on the glyph's floor) and a pinhole per hole. Returns { contours, bbox, puddle, holes } -- an
 * outline glyphMorph accepts.
 */
export function meltTarget(outline, { spread = 1.6, height = 0.12, N = 64, pinhole = 1e-3 } = {}) {
    const bb = outline.bbox, cx = (bb.x0 + bb.x1) / 2, width = (bb.x1 - bb.x0) * spread;
    const puddle = puddleContour({ cx, floor: bb.y0, width, height, N });
    const holes = outline.contours.filter((c) => contourArea(c) > 0).map((c) => { const [hx] = contourCentre(c); return pinholeContour(Math.min(cx + width / 2 - 2 * pinhole, Math.max(cx - width / 2 + 2 * pinhole, hx)), bb.y0 + height / 2, pinhole); });
    return { contours: [puddle, ...holes], bbox: { x0: cx - width / 2, y0: bb.y0, x1: cx + width / 2, y1: bb.y0 + height }, puddle: { cx, floor: bb.y0, width, height, N }, holes: holes.length };
}

/** the one em rectangle the fill holds through the melt: the union of the glyph's bound and the puddle's, the floor shared */
export function meltRect(outline, target) { const a = outline.bbox, b = target.bbox; return [Math.min(a.x0, b.x0), Math.min(a.y0, b.y0), Math.max(a.x1, b.x1), Math.max(a.y1, b.y1)]; }

/** the melt: a glyphMorph from the outline to its puddle, with the target and the fill rectangle beside it */
export function meltMorph(outline, opts = {}) {
    const target = meltTarget(outline, opts);
    const morph = glyphMorph(outline, target, { N: opts.N || 64, polar: opts.polar !== false });
    return { morph, target, rect: meltRect(outline, target), at: (t) => morph.at(t) };
}

/** the melt's timing: a glyph sags slowly and then drops -- t cubed eased into a smoothstep tail */
export function meltEase(t) { const u = Math.min(1, Math.max(0, t)); return u * u * u * (10 - 15 * u + 6 * u * u); }
