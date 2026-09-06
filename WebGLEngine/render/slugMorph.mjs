// WebGLEngine/render/slugMorph.mjs -- v4498
//
// *** ONE GLYPH OUTLINE MORPHED INTO ANOTHER, DRAWN BY SLUG (task 44). *** physics/mesh/strokeMorph.mjs derived a
// morph for the gauge digits -- single open strokes -- and refused vendor/morphicons for them, writing the refusal's
// expiry into its header: closed or multi-subpath outlines are morphicons' job. Font glyphs are exactly that (an 8 is
// three closed contours, a 0 two), so this module reaches for the vendored core: the glyph's quadratic contours become
// an SVG path (M / Q / Z, em units), morphicons resamples each subpath to N points, pairs the subpaths of the two
// glyphs (its cost matrix and cyclic alignment -- the half strokeMorph said not to re-derive), and interpolates; the
// interpolated polylines come back as Slug contours (each segment a degenerate quadratic whose control point is its
// midpoint -- the a = 0 case slugFont's header names as handled) and text/slugAtlas.js packs that ONE glyph, per frame.
// Slug's non-zero winding coverage tolerates the self-intersections an intermediate shape has. The round trip's cost is
// measured by the gate, not presumed: about 30 curves in, N points a subpath out, one packAtlas of one glyph a frame.
"use strict";
import { resampleIcon, buildPlan, allocOutputs, interpPolar, interpLinear } from "../vendor/morphicons/index.js";
import { packAtlas } from "../text/slugAtlas.js";

/** a glyph's quadratic contours (slugFont outline, em units) as an SVG path: M start, Q control end per curve, Z per contour */
export function contoursToPathD(contours, places = 5) {
    const f = (v) => Number(v.toFixed(places));
    let d = "";
    for (const c of contours) {
        if (!c.length) continue;
        d += `M${f(c[0][0])} ${f(c[0][1])}`;
        for (const q of c) d += `Q${f(q[2])} ${f(q[3])} ${f(q[4])} ${f(q[5])}`;
        d += "Z";
    }
    return d;
}

/**
 * A resampled polyline (Float64Array of x, y pairs, closed) as a Slug contour of degenerate quadratics. The closing curve
 * ends EXACTLY on the first curve's start by construction -- segment i runs pts[i] -> pts[(i + 1) % n], so the last one's end
 * IS pts[0] -- which slugAtlas relies on to share texels between neighbouring curves. (A first draft re-pinned the last
 * end to the first start afterwards; a sabotage that removed the pin changed nothing, because there was nothing to pin.)
 */
export function polylineToContour(pts) {
    const n = pts.length >> 1, out = [];
    if (n < 2) return out;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = pts[2 * i], y0 = pts[2 * i + 1], x1 = pts[2 * j], y1 = pts[2 * j + 1];
        if (x0 === x1 && y0 === y1) continue;
        out.push([x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, x1, y1]);
    }
    return out;
}

/** signed area of a closed polyline (shoelace), for a shape's winding and size */
export function polygonArea(pts) { const n = pts.length >> 1; let a = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; } return a / 2; }

/**
 * A morph between two glyphs' outlines. `a` and `b` are slugFont outlines ({ contours }); N is points per subpath.
 * Returns { plan, at(t) -> { contours, polylines }, subpaths: { a, b, paired }, samplesA, samplesB }.
 */
export function glyphMorph(a, b, { N = 64, polar = true } = {}) {
    const dA = contoursToPathD(a.contours), dB = contoursToPathD(b.contours);
    const sa = resampleIcon(dA, N), sb = resampleIcon(dB, N);
    const plan = buildPlan(sa, sb);
    const out = allocOutputs(plan);
    const interp = polar ? interpPolar : interpLinear;
    return {
        plan, samplesA: sa, samplesB: sb, dA, dB,
        subpaths: { a: sa.length, b: sb.length, paired: plan.items.length },
        // DUPLICATES ARE DROPPED, AND THE REASON IS SLUG'S FILL RULE. When the glyphs' contour counts differ, morphicons pairs one
        // source subpath with two targets by DUPLICATING it (0 -> 8: the 0's hole twice, one copy for each of the 8's holes). Under
        // non-zero winding two coincident holes wind +2 against the outer's -1 and the hole reads as INK: at t = 0 the morph drew a
        // filled 0 (814 lit pixels against the font's 603, the gate's first run). Exact duplicates are dropped here, so the endpoints
        // are the glyphs; between them the two copies diverge and their OVERLAP still winds +2 until they separate -- a brief filled
        // lens where a hole is splitting, recorded rather than hidden (even-odd would fill it too: three crossings).
        at(t) { interp(plan, t, out); const polylines = dedupe(out.map((o) => o.slice())); return { polylines, contours: polylines.map(polylineToContour).filter((c) => c.length) }; },
    };
}

/** drop polylines that are exact duplicates of an earlier one (same length, every coordinate within 1e-9) */
export function dedupe(polylines, eps = 1e-9) {
    const keep = [];
    for (const p of polylines) { if (!keep.some((q) => q.length === p.length && q.every((v, i) => Math.abs(v - p[i]) <= eps))) keep.push(p); }
    return keep;
}

/** pack one morphed glyph into its own atlas (key 0), the shape Slug draws from */
export function packMorphed(contours, opts = {}) {
    return packAtlas([{ key: 0, contours }], { format: "16f", logWidth: opts.logWidth || 11, maxBands: opts.maxBands, epsilon: opts.epsilon });
}
