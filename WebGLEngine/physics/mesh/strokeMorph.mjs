// physics/mesh/strokeMorph.mjs
//
// v3530 -- MORPHING ONE STROKE GLYPH INTO ANOTHER, DERIVED, BECAUSE THE HARD PART OF THE LIBRARY IS IDLE HERE.
//
// Keith asked whether a counter could morph 1 -> 2 -> 3, and whether we could replicate or better
// guillermolg00/morphicons by deriving it. THE PACKAGE VERIFIED CLEANLY -- MIT, `dependencies: {}`, framework
// peers all optional, a DOM-free entry that runs in node, 132 KB dist, fetched with `npm pack` and inspected
// rather than trusted from the README. IT IS NOT REFUSED FOR QUALITY.
//
// *** IT IS REFUSED BECAUSE THE DIGIT CASE DOES NOT USE IT. MEASURED ACROSS ALL TEN GLYPHS: every one resamples
// to EXACTLY ONE SUBPATH, NONE CLOSED, and every adjacent pair produces the SAME plan shape. *** So the two
// things morphicons exists to solve are both idle: SUBPATH CORRESPONDENCE (its costMatrix/centroid assignment)
// is trivial with one subpath each, and CYCLIC ROTATION ALIGNMENT -- the hardest part, and the thing its README
// sells hardest, "no hand-declared rotation group per pair" -- ONLY APPLIES TO CLOSED PATHS and never runs.
// What is left doing the work is arc-length resampling and a pairwise lerp, which is this file.
//
// THE GENERAL PROBLEM COLLAPSES BECAUSE WE OWN THE GLYPH SET: ten known open strokes, authored once. Same
// reasoning that refused the Vercidium mesher and both Terasology ideas -- THE PATTERN TRAVELS, THE CODE DOES
// NOT. *** AND THE REFUSAL HAS AN EXPIRY WRITTEN INTO IT: THE MOMENT SOMEBODY WANTS A CLOSED OR MULTI-SUBPATH
// ICON, THIS FILE IS THE WRONG TOOL AND morphicons IS THE THING TO REACH FOR. Do not re-derive that half. ***
//
// AND DERIVING BUYS THE ONE THING THE DEPENDENCY COULD NOT GIVE: AN EXACT KEY. Driven against the real package,
// its t=0 returns a 128-POINT RESAMPLE rather than the source path, so "progress 0 equals the source" -- which
// is how I first stated the key -- IS FALSE AGAINST A CORRECT IMPLEMENTATION. Owning the resampler makes it an
// identity instead: sample k sits at arc-length fraction k/(N-1) of the source, exactly, and at t=0 the output
// IS the source's own resampling. A key that has to be a tolerance because somebody else chose the sample
// count is a weaker key than one that is an equality because we chose it.
"use strict";

/** Parse a stroke path into a polyline. DELIBERATELY TINY: M/L absolute plus C, flattened. Anything else
 *  THROWS rather than being skipped -- a parser that ignores what it does not understand produces a shape that
 *  is wrong in a way nothing downstream can see, which is v3442's vox defect in a new subject. */
export function parseStroke(d, curveSteps = 16) {
    const t = String(d).trim().split(/[\s,]+/);
    const pts = [];
    let i = 0, cur = null;
    const num = () => { const v = Number(t[i++]); if (!Number.isFinite(v)) throw new Error("bad number in path: " + t[i - 1]); return v; };
    while (i < t.length) {
        const op = t[i++];
        if (op === "M") { cur = [num(), num()]; pts.push(cur.slice()); }
        else if (op === "L") { cur = [num(), num()]; pts.push(cur.slice()); }
        else if (op === "C") {
            if (!cur) throw new Error("C before M");
            const p0 = cur, p1 = [num(), num()], p2 = [num(), num()], p3 = [num(), num()];
            for (let s = 1; s <= curveSteps; s++) {
                const u = s / curveSteps, v = 1 - u;
                pts.push([
                    v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0],
                    v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1],
                ]);
            }
            cur = p3;
        } else throw new Error("unsupported path op: " + op + " (this parser handles M, L and C only, and REFUSES the rest)");
    }
    if (pts.length < 2) throw new Error("a stroke needs at least two points");
    return pts;
}

/** Cumulative arc length along a polyline. */
export function arcLengths(pts) {
    const s = [0];
    for (let i = 1; i < pts.length; i++) {
        s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    return s;
}

export const totalLength = (pts) => arcLengths(pts)[pts.length - 1];

/**
 * Resample to N points EQUALLY SPACED BY ARC LENGTH.
 *
 * *** THE ENDPOINTS ARE PLACED BY IDENTITY AND NOT BY THE SEARCH. *** Point 0 is the first vertex and point
 * N-1 is the last, copied, because the interpolation that finds the interior points is a division and a
 * division at the exact end can land one ulp short -- and an endpoint that drifts would make the morph's
 * strongest key a tolerance for a reason having nothing to do with morphing.
 */
export function resample(pts, N = 64) {
    if (!(N >= 2)) throw new Error("N must be at least 2");
    const s = arcLengths(pts), total = s[s.length - 1];
    if (!(total > 0)) throw new Error("a degenerate stroke has no arc length to resample along");
    const out = [pts[0].slice()];
    let j = 1;
    for (let k = 1; k < N - 1; k++) {
        const target = (total * k) / (N - 1);
        while (j < s.length - 1 && s[j] < target) j++;
        const s0 = s[j - 1], s1 = s[j], f = s1 > s0 ? (target - s0) / (s1 - s0) : 0;
        out.push([
            pts[j - 1][0] + f * (pts[j][0] - pts[j - 1][0]),
            pts[j - 1][1] + f * (pts[j][1] - pts[j - 1][1]),
        ]);
    }
    out.push(pts[pts.length - 1].slice());
    return out;
}

/**
 * Pair two resampled strokes and interpolate.
 *
 * DIRECTION IS CHOSEN BY MEASUREMENT, NOT ASSUMED: a glyph authored end-to-start would travel the long way
 * round and every point would cross the shape. The reversed pairing is tried and the SHORTER TOTAL TRAVEL
 * wins -- which is the one piece of morphicons' correspondence that still has work to do when there is only
 * one open subpath, and it is two lines rather than an assignment problem.
 */
export function pairStrokes(a, b) {
    if (a.length !== b.length) throw new Error("both strokes must be resampled to the same N");
    const travel = (dst) => a.reduce((sum, p, i) => sum + Math.hypot(dst[i][0] - p[0], dst[i][1] - p[1]), 0);
    const fwd = travel(b), rev = travel([...b].reverse());
    return { target: rev < fwd ? [...b].reverse() : b, reversed: rev < fwd, travelForward: fwd, travelReversed: rev };
}

/**
 * Linear interpolation at t, WITH THE ENDPOINTS PLACED BY IDENTITY -- the same rule the resampler uses.
 *
 * *** I WROTE "a + 1*(b-a) IS b IN IEEE-754" AND IT IS FALSE, AND THE GATE CAUGHT IT. *** a + 0*(b-a) really
 * is a exactly, but at t=1 the SUBTRACTION rounds and then the ADDITION rounds again, so the result lands
 * near b rather than on it. The claim was stated from the armchair and the measurement disagreed -- twenty
 * endpoint comparisons across ten adjacent digit pairs, and the t=1 half did not hold.
 *
 * THE FIX IS THE ONE THIS FILE ALREADY USES ON ITS RESAMPLER RATHER THAN A TOLERANCE: return the endpoint
 * ITSELF at t=0 and t=1. Not a fudge -- it is the identity being asserted, made true by construction instead
 * of hoped for, and it is exactly why deriving this was worth doing. A vendored morph cannot be asked to
 * guarantee it.
 */
export function morphAt(a, target, t) {
    if (t === 0) return a.map((p) => p.slice());
    if (t === 1) return target.map((p) => p.slice());
    return a.map((p, i) => [p[0] + t * (target[i][0] - p[0]), p[1] + t * (target[i][1] - p[1])]);
}

/** A polyline back to an SVG `d`. */
export function toPathD(pts, places = 4) {
    const f = (v) => Number(v.toFixed(places));
    return "M" + pts.map((p, i) => (i ? "L" : "") + f(p[0]) + " " + f(p[1])).join("");
}

/** One call: two path strings and a progress, out comes a path string. */
export function morphPaths(dA, dB, t, N = 64) {
    const a = resample(parseStroke(dA), N), b = resample(parseStroke(dB), N);
    const { target } = pairStrokes(a, b);
    return toPathD(morphAt(a, target, t));
}

/** The ten digits, as single open strokes. THE GLYPH SET IS THE REASON THIS FILE IS SMALL, so it lives here
 *  rather than in a page: a second copy in a page would be the two-declarations defect wearing a font. */
export const DIGIT_STROKES = {
    0: "M 12 3 C 16 3 18 7 18 12 C 18 17 16 21 12 21 C 8 21 6 17 6 12 C 6 7 8 3 12 3",
    1: "M 8 6 L 12 3 L 12 21",
    2: "M 6 7 C 6 4 12 2 15 5 C 18 8 13 12 6 21 L 18 21",
    3: "M 6 5 L 17 5 L 10 12 C 16 12 18 15 17 18 C 16 21 9 21 6 18",
    4: "M 15 21 L 15 3 L 5 15 L 18 15",
    5: "M 17 4 L 8 4 L 7 11 C 12 9 18 11 18 16 C 18 20 11 22 6 19",
    6: "M 16 4 C 10 4 6 9 6 15 C 6 19 9 21 12 21 C 16 21 18 18 18 15 C 18 12 15 10 12 10 C 9 10 6 12 6 15",
    7: "M 6 4 L 18 4 L 10 21",
    8: "M 12 3 C 15 3 17 5 17 7 C 17 10 12 12 12 12 C 12 12 6 14 6 17 C 6 20 9 21 12 21 C 15 21 18 20 18 17 C 18 14 12 12 12 12 C 12 12 7 10 7 7 C 7 5 9 3 12 3",
    9: "M 8 20 C 14 20 18 15 18 9 C 18 5 15 3 12 3 C 8 3 6 6 6 9 C 6 12 9 14 12 14 C 15 14 18 12 18 9",
};
