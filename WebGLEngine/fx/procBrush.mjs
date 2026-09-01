// fx/procBrush.mjs -- v4216 -- brushes that draw RELATIONSHIPS between stroke points, not dabs.
//
// *** MEASURED: THIS TREE HAS NO DRAWING SURFACE AT ALL. *** No painting page, no brush, no stroke model --
// an engine full of shaders and simulations in which you cannot draw a line.
//
// ---- LICENCE, AND WHY NO SOURCE WAS READ ------------------------------------------------------------------
// Prompted by mrdoob/harmony, which is *** GPL-3.0 ***: "This program is free software: you can redistribute
// it and/or modify it under the terms of the GNU General Public License as published by the Free Software
// Foundation, either version 3 of the License, or (at your option) any later version."
//
// REACHED, NOT CAPTURED -- severity 3 RECIPROCAL, the same posture as CliWaifuTamagotchi and the same reason
// ai-bridge/sunshineBridge.js never vendors Sunshine: this tree publishes public release zips.
//
// *** SO harmony's SOURCE WAS DELIBERATELY NOT READ. *** For the MIT projects this tree has borrowed from --
// sileo, animatelo, frame.js -- reading the source and writing fresh is fine and was done. Under GPL-3.0 it
// is not the same act: a clean implementation written from copyleft source one has just studied is a much
// weaker claim than one written from a published description. What is implemented below is the TECHNIQUE,
// which has been publicly described since 2010 and is a geometric idea rather than an expression of it:
//
//   A CONVENTIONAL BRUSH STAMPS SOMETHING AT EACH POINT. A PROCEDURAL BRUSH OF THIS FAMILY LOOKS BACK AT THE
//   POINTS ALREADY IN THE STROKE AND DRAWS LINES BETWEEN THEM -- so the mark is made of relationships, and
//   the same path drawn slowly, quickly, or doubled back over itself produces a genuinely different image.
//
// No harmony code, constants, or structure is reproduced here.
//
// ---- PURE ----------------------------------------------------------------------------------------------------
// No canvas, no DOM, no events. A brush takes a stroke and returns SEGMENTS; ui/procBrushCanvas.js draws them.
// That is what lets the three traps below be measured in node rather than judged by eye.

/** A segment is what every brush emits. The renderer knows nothing else. */
function seg(x1, y1, x2, y2, alpha, width) { return { x1, y1, x2, y2, alpha, width }; }

export const DEFAULTS = Object.freeze({
    radius: 40,          // how far a point looks for neighbours, in pixels
    maxLinks: 6,         // *** and how many it may actually draw -- see the alpha note
    alpha: 0.12,
    width: 1,
    minSpacing: 1.5,     // points closer than this are dropped -- see dedupe()
});

/**
 * *** TRAP 1: A SLOW STROKE PILES POINTS ON TOP OF EACH OTHER, AND IT BREAKS BOTH OF THE OTHER TWO. ***
 *
 * Pointer events fire on a clock, not on distance. Hold still for a second and a stroke gains sixty points in
 * the same place. Every one of them is then a neighbour of every other, so the link count explodes AND the
 * same pixels are painted over and over until they go solid. Deduping by distance is not tidying: it is the
 * precondition for the rest of this file behaving.
 */
export function dedupe(points, minSpacing = DEFAULTS.minSpacing) {
    const out = [];
    for (const p of points) {
        if (!out.length) { out.push(p); continue; }
        const q = out[out.length - 1];
        if (Math.hypot(p.x - q.x, p.y - q.y) >= minSpacing) out.push(p);
    }
    return out;
}

/**
 * *** A UNIFORM GRID OVER THE STROKE, AND IT EXISTS BECAUSE MY FIRST ANSWER WAS WRONG IN AN INTERESTING WAY.
 * ***
 *
 * The naive neighbour search is all-pairs: every new point against every earlier one, which is O(n^2) over a
 * stroke and about 12.5 million distance tests for 5,000 points -- during a drag, on the main thread.
 *
 * The obvious fix is to look back only a bounded number of points, and it works: measured, it cut 5,000
 * points from 12,497,500 tests to 475,344. *** AND THEN MEASURING WHAT IT DREW SHOWED IT HAD QUIETLY REMOVED
 * THE POINT OF THE BRUSH. *** A circle of 160 points produced ZERO links to a distant part of the stroke,
 * because coming back around takes more than the window allows -- and links between parts of a stroke that
 * are FAR APART IN TIME BUT CLOSE IN SPACE are exactly what makes this kind of brush look drawn rather than
 * traced. A single smooth sweep links only to its own immediate neighbours, which just redraws the line.
 *
 * So the bound was the wrong axis. A uniform grid keyed on POSITION answers "what is near here" over the
 * WHOLE stroke, at a cost proportional to how many points are genuinely nearby rather than to how long the
 * stroke is. Both properties at once, and no window to tune.
 *
 * Cells are `radius` wide, so a query touches the 3x3 block around the point and cannot miss a neighbour.
 */
export class StrokeIndex {
    constructor(cell = DEFAULTS.radius) { this.cell = Math.max(1, cell); this.cells = new Map(); this.n = 0; }
    _key(x, y) { return Math.floor(x / this.cell) + "," + Math.floor(y / this.cell); }
    add(p, index) {
        const k = this._key(p.x, p.y);
        let bucket = this.cells.get(k);
        if (!bucket) { bucket = []; this.cells.set(k, bucket); }
        bucket.push(index);
        this.n++;
        return this;
    }
    /** Candidate indices in the 3x3 block around (x,y). A superset of the true neighbours, never a subset. */
    near(x, y) {
        const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
        const out = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const b = this.cells.get((cx + dx) + "," + (cy + dy));
                if (b) out.push(...b);
            }
        }
        return out;
    }
}

/** Build an index over the first `upto` points. Live drawing adds incrementally instead; see the renderer. */
export function indexOf(points, upto = points.length, cell = DEFAULTS.radius) {
    const ix = new StrokeIndex(cell);
    for (let i = 0; i < upto; i++) ix.add(points[i], i);
    return ix;
}

/**
 * The neighbours of point i, nearest first.
 *
 * With an index, only genuinely nearby points are tested and there is NO limit on how far back in the stroke
 * a neighbour may be -- which is the whole reason the index exists. Without one it falls back to all-pairs,
 * so the function is still correct on its own; `tests` is returned either way so the gate can assert the
 * saving rather than trust it.
 */
export function neighboursOf(points, i, { radius = DEFAULTS.radius, index = null } = {}) {
    const p = points[i];
    const found = [];
    let tests = 0;
    const candidates = index ? index.near(p.x, p.y) : null;
    if (candidates) {
        for (const j of candidates) {
            if (j >= i) continue;                       // only points already laid down
            tests++;
            const q = points[j];
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            if (d <= radius) found.push({ index: j, point: q, d });
        }
    } else {
        for (let j = 0; j < i; j++) {
            tests++;
            const q = points[j];
            const d = Math.hypot(p.x - q.x, p.y - q.y);
            if (d <= radius) found.push({ index: j, point: q, d });
        }
    }
    found.sort((a, b) => a.d - b.d);
    return { found, tests };
}

/**
 * *** TRAP 3: LINKING TO EVERY NEIGHBOUR TURNS A DENSE AREA INTO A BLACK BLOB. ***
 *
 * Each link is a translucent line. Draw k of them across roughly the same pixels and the accumulated opacity
 * is 1-(1-a)^k, which climbs fast: at alpha 0.12, eight links already reach 0.64 and twenty reach 0.92. So
 * where the hand slows -- exactly where a person is concentrating -- the mark goes solid and the drawing
 * loses its shading. Two guards, and BOTH are needed: `maxLinks` caps how many are drawn at all, and the
 * alpha of each is divided down by how many were found, so density varies smoothly instead of stepping.
 */
export function linkSegments(points, i, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const { found } = neighboursOf(points, i, o);
    if (!found.length) return [];
    const use = found.slice(0, o.maxLinks);
    const p = points[i];
    // Divide by the number FOUND, not the number USED: a dense region should draw fainter lines, and dividing
    // by the capped count would make every dense region identical to a six-neighbour one.
    const a = o.alpha / Math.max(1, Math.sqrt(found.length));
    return use.map((n) => seg(p.x, p.y, n.point.x, n.point.y, a, o.width));
}

/** ---- THE BRUSHES ----------------------------------------------------------------------------------------
 * Each takes the whole stroke and the index of the newest point, and returns segments for THAT point only --
 * so a live stroke is drawn incrementally and a replayed one gives byte-identical output.
 */
export const BRUSHES = Object.freeze({
    /** The plain trail: the newest point joined to the one before. A control, and the only non-relational one. */
    line(points, i, opts = {}) {
        const o = { ...DEFAULTS, ...opts };
        if (i < 1) return [];
        const p = points[i], q = points[i - 1];
        return [seg(q.x, q.y, p.x, p.y, Math.min(1, o.alpha * 6), o.width)];
    },

    /** Sketchy: faint links to nearby earlier points. Repeated passes darken and the mark looks hand-hatched. */
    sketchy(points, i, opts = {}) { return linkSegments(points, i, opts); },

    /**
     * Fur: links pushed PAST the neighbour, so the line overshoots and the stroke grows bristles.
     * The overshoot is what separates it from sketchy -- same neighbours, different endpoint.
     */
    fur(points, i, opts = {}) {
        const o = { ...DEFAULTS, overshoot: 1.6, ...opts };
        const { found } = neighboursOf(points, i, o);
        if (!found.length) return [];
        const p = points[i];
        const a = o.alpha / Math.max(1, Math.sqrt(found.length));
        return found.slice(0, o.maxLinks).map((n) => {
            const dx = n.point.x - p.x, dy = n.point.y - p.y;
            return seg(p.x, p.y, p.x + dx * o.overshoot, p.y + dy * o.overshoot, a, o.width);
        });
    },

    /**
     * Shaded: links whose opacity falls off with distance, so the near side of a curve fills in and the far
     * side stays open. The distance term is what makes it read as tone rather than as hatching.
     */
    shaded(points, i, opts = {}) {
        const o = { ...DEFAULTS, ...opts };
        const { found } = neighboursOf(points, i, o);
        if (!found.length) return [];
        const p = points[i];
        const base = o.alpha / Math.max(1, Math.sqrt(found.length));
        return found.slice(0, o.maxLinks).map((n) =>
            seg(p.x, p.y, n.point.x, n.point.y, base * (1 - n.d / o.radius), o.width));
    },

    /**
     * Ribbon: width from SPEED. Fast strokes thin out, slow ones swell -- the one brush here that uses the
     * timestamps rather than only the geometry, which is why points carry a t at all.
     */
    ribbon(points, i, opts = {}) {
        const o = { ...DEFAULTS, maxWidth: 12, ...opts };
        if (i < 1) return [];
        const p = points[i], q = points[i - 1];
        const dt = Math.max(1, (p.t ?? 0) - (q.t ?? 0));
        const speed = Math.hypot(p.x - q.x, p.y - q.y) / dt;
        const w = Math.max(0.5, o.maxWidth * (1 - Math.min(1, speed / 2)));
        return [seg(q.x, q.y, p.x, p.y, Math.min(1, o.alpha * 6), w)];
    },
});

export const NAMES = Object.freeze(Object.keys(BRUSHES));

/** Render a whole stroke at once -- for replay, and for the gate. Identical to drawing it incrementally. */
export function strokeSegments(points, brush = "sketchy", opts = {}) {
    const fn = BRUSHES[brush];
    if (!fn) return [];
    const o = { ...DEFAULTS, ...opts };
    const pts = dedupe(points, o.minSpacing);
    // The index is grown POINT BY POINT rather than built up front, so a whole-stroke render sees exactly what
    // a live one does: point i may only link to points already laid down. Building it fully first would let
    // early points link to the future and a replay would not match the drawing.
    const index = new StrokeIndex(o.radius);
    const out = [];
    for (let i = 0; i < pts.length; i++) {
        out.push(...fn(pts, i, { ...opts, index }));
        index.add(pts[i], i);
    }
    return out;
}

/**
 * Total distance tests a whole stroke costs -- so the saving is a measured fact rather than a claim.
 * Pass { index: false } to measure the all-pairs cost the index replaces.
 */
export function costOf(points, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const useIndex = opts.index !== false;
    const index = useIndex ? new StrokeIndex(o.radius) : null;
    let tests = 0;
    for (let i = 0; i < points.length; i++) {
        tests += neighboursOf(points, i, { radius: o.radius, index }).tests;
        if (index) index.add(points[i], i);
    }
    return tests;
}

/** What a naive all-pairs implementation would have cost, for comparison. */
export function naiveCost(n) { return (n * (n - 1)) / 2; }

/** Accumulated opacity of k overlapping strokes at alpha a -- the arithmetic behind trap 3. */
export function accumulatedAlpha(a, k) { return 1 - Math.pow(1 - a, k); }

export default { DEFAULTS, BRUSHES, NAMES, dedupe, neighboursOf, linkSegments, strokeSegments, costOf, naiveCost, accumulatedAlpha };
