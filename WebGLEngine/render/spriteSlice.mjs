// FILE: render/spriteSlice.mjs
// VERSION: v1 -- v4174
//
// Sprite sheet slicing and backdrop removal. From boona13/sprite-lab (MIT), whose framing is
// "100% client-side, deterministic, no ML, no network" -- which is the reason it is worth porting here
// rather than the pixels it produces. Identical input gives byte-identical output, so this is gateable
// as an EXACT property instead of a visual judgement, which is what the rest of this tree asks of a
// renderer and almost never gets from an image tool.
//
// render/spriteAtlas.js is not the same thing and does not overlap: it DRAWS eight procedural particle
// cells at startup. Nothing in the tree could take a sheet an artist made and find the frames in it.
//
// Works on { width, height, data } RGBA -- the shape of ImageData, so a browser passes ImageData straight
// in and node passes a plain object. No canvas, no DOM, no GL.
//
// TWO PROBLEMS, AND THE SECOND ONE IS WHERE THE HALOS COME FROM.
//
// 1. WHERE ARE THE FRAMES. Blind grid slicing assumes every frame is the same size and evenly spaced,
//    which is true of sheets a tool generated and false of sheets a person drew. Connected-component
//    labelling asks the pixels instead. The wrinkle is that one sprite is often several components --
//    a dot over an i, a detached spark, a sword held away from the body -- so components are merged when
//    their boxes are close, and "close" is a stated distance rather than a guess.
//
// 2. WHAT IS THE BACKDROP. Keying out every pixel matching the backdrop colour is the obvious approach
//    and it is wrong twice over:
//
//    (a) IT EATS THE SPRITE'S OWN COLOUR. A magenta backdrop and a magenta gem in the sprite are the same
//        colour; a global colour test punches a hole through the gem. Background is therefore what is
//        REACHABLE FROM THE BORDER, not what matches -- a flood fill, not a comparison. An enclosed pocket
//        of backdrop-coloured pixels inside the sprite stays, which is the right answer: it is drawn.
//
//    (b) IT LEAVES A HALO, AND THIS IS THE PART EVERY NAIVE KEYER GETS WRONG. An antialiased edge drawn
//        over magenta is not magenta and not the sprite -- it is a MIXTURE, C = a*F + (1-a)*K. Removing
//        only the pixels that match K exactly leaves the mixed ring behind at full opacity: the pink
//        fringe. The fix is not a wider tolerance (that erodes the sprite); it is to solve the mixture.
//        With the key K known and the foreground F estimated from the nearest interior pixel, a falls out
//        of C = a*F + (1-a)*K per channel, and the pixel is rewritten as F at opacity a. The fringe
//        becomes a correctly translucent edge instead of a coloured one.
//
//    (c) AND THEN THE GPU PUTS THE HALO BACK. Even with alpha correct, a transparent pixel still carries
//        RGB, and bilinear filtering blends it into its visible neighbours. If those transparent pixels
//        kept the key colour, magenta seeps back in at every non-integer sample. So the fourth pass
//        BLEEDS foreground colour outward into the transparent margin. Invisible in a still, and the
//        difference between a clean sprite and a fringed one once it is scaled or rotated.

const DEFAULT_TOLERANCE = 24;      // per-channel distance, 0-255, for "is this the key colour"
const DEFAULT_ALPHA_CUT = 8;       // alpha at or below this is background when the source has an alpha channel
const DEFAULT_MERGE_GAP = 2;       // components whose boxes come within this many pixels are one frame
const DEFAULT_MIN_AREA  = 1;       // components smaller than this are dropped as speckle

/** Squared RGB distance, so callers never pay a sqrt in the inner loop. */
function dist2(d, i, r, g, b) {
    const dr = d[i] - r, dg = d[i + 1] - g, db = d[i + 2] - b;
    return dr * dr + dg * dg + db * db;
}

/**
 * Infer the backdrop key from the four corners. Returns { key:[r,g,b], kind, agree } where agree is how
 * many of the four corners voted for the winner -- a caller that wants to refuse an ambiguous sheet can
 * read it rather than being told a confident wrong answer.
 *
 * A CHECKERBOARD IS NOT ONE COLOUR, and it is the most common "transparent" backdrop there is. Two
 * alternating colours over the corners read as a 2-2 split, which is exactly the signature, so it is
 * reported as kind "checker" with BOTH colours rather than being averaged into a grey that matches
 * neither.
 */
export function detectKey(img) {
    const { width: w, height: h, data: d } = img;
    if (w < 2 || h < 2) return { key: [0, 0, 0], kind: "empty", agree: 0, keys: [] };
    const at = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];

    // An existing alpha channel settles it: if every corner is already transparent, the sheet is keyed.
    if (corners.every((c) => c[3] <= DEFAULT_ALPHA_CUT)) return { key: [0, 0, 0], kind: "alpha", agree: 4, keys: [] };

    // Group corners by colour. Fixed scan order, so ties resolve the same way every run.
    const groups = [];
    for (const c of corners) {
        const g = groups.find((q) => Math.abs(q.c[0] - c[0]) <= DEFAULT_TOLERANCE
                                  && Math.abs(q.c[1] - c[1]) <= DEFAULT_TOLERANCE
                                  && Math.abs(q.c[2] - c[2]) <= DEFAULT_TOLERANCE);
        if (g) g.n++; else groups.push({ c, n: 1 });
    }
    groups.sort((a, b) => b.n - a.n);
    if (groups.length === 2 && groups[0].n === 2 && groups[1].n === 2) {
        return { key: groups[0].c.slice(0, 3), kind: "checker", agree: 2, keys: [groups[0].c.slice(0, 3), groups[1].c.slice(0, 3)] };
    }
    return { key: groups[0].c.slice(0, 3), kind: "solid", agree: groups[0].n, keys: [groups[0].c.slice(0, 3)] };
}

/**
 * Mark background as what is REACHABLE FROM THE BORDER and matches the key -- not merely what matches.
 * Returns a Uint8Array mask, 1 = background. 4-connected on purpose: an 8-connected fill leaks diagonally
 * through a one-pixel antialiased outline and swallows the sprite's interior, which is a total loss rather
 * than a cosmetic one. Iterative stack, never recursion: a 4096x4096 sheet would blow the call stack.
 */
export function borderFill(img, keys, tolerance = DEFAULT_TOLERANCE) {
    const { width: w, height: h, data: d } = img;
    const mask = new Uint8Array(w * h);
    const tol2 = tolerance * tolerance * 3;
    const isKey = (p) => {
        const i = p * 4;
        if (d[i + 3] <= DEFAULT_ALPHA_CUT) return true;     // already transparent is already background
        for (const k of keys) if (dist2(d, i, k[0], k[1], k[2]) <= tol2) return true;
        return false;
    };
    const stack = [];
    const push = (p) => { if (!mask[p] && isKey(p)) { mask[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
        const p = stack.pop();
        const x = p % w, y = (p - x) / w;
        if (x > 0)     push(p - 1);
        if (x < w - 1) push(p + 1);
        if (y > 0)     push(p - w);
        if (y < h - 1) push(p + w);
    }
    return mask;
}

/**
 * Solve the mixture on edge pixels and bleed colour into the margin. Mutates a COPY and returns it, so a
 * caller can hold the original -- an in-place matte that turned out wrong would have destroyed the source.
 *
 * a comes out of C = a*F + (1-a)*K, read on the channel where F and K are furthest apart, because that is
 * the channel where the estimate is least sensitive to noise. When F and K are the same colour on every
 * channel there is no information to recover and the pixel is left opaque rather than guessed at.
 */
export function unmix(img, mask, key) {
    const { width: w, height: h, data: src } = img;
    const out = new Uint8ClampedArray(src);
    const bgAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 1 : mask[y * w + x];

    // (3) edge unmix -- an interior pixel touching background is a mixture, not a colour.
    const edges = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (mask[p]) continue;
        if (!(bgAt(x - 1, y) || bgAt(x + 1, y) || bgAt(x, y - 1) || bgAt(x, y + 1))) continue;
        edges.push(p);
    }
    // Membership is a flat byte array, not a scan of the edge list: edges.includes(q) inside a 3x3 inside
    // a per-pixel loop is O(edges) per neighbour, which turns a 2048x2048 sheet from milliseconds into
    // minutes for no reason.
    const isEdge = new Uint8Array(w * h);
    for (const p of edges) isEdge[p] = 1;
    for (const p of edges) {
        const x = p % w, y = (p - x) / w, i = p * 4;
        // F estimated from the nearest INTERIOR neighbour -- a neighbour that is itself an edge pixel is
        // also a mixture, and averaging mixtures in would drag the estimate toward the key.
        //
        // *** BUT PREFERRING INTERIOR PIXELS IS NOT THE SAME AS REQUIRING THEM, AND REQUIRING THEM FAILS ON
        // *** A WHOLE CLASS OF REAL SPRITES. Anything two pixels or thinner -- a rope, an antenna, a spark,
        // a small icon -- is ENTIRELY edge: every one of its pixels touches the backdrop, so there is no
        // interior anywhere to estimate from. The first draft returned no estimate there, which made a fall
        // back to the pixel's own colour, which made the solve read a = 1, which left the fringe exactly as
        // it found it. The gate's half-covered edge pixel came out opaque and pink. So: interior neighbours
        // when they exist, any visible neighbour when they do not, and only then the pixel itself.
        let fr = 0, fg = 0, fb = 0, n = 0;
        let ar = 0, ag = 0, ab = 0, an = 0;      // the fallback tier: any non-background neighbour
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx;
            if (q === p || mask[q]) continue;
            const j = q * 4;
            ar += src[j]; ag += src[j + 1]; ab += src[j + 2]; an++;
            if (isEdge[q]) continue;
            fr += src[j]; fg += src[j + 1]; fb += src[j + 2]; n++;
        }
        const F = n  ? [fr / n, fg / n, fb / n]
                : an ? [ar / an, ag / an, ab / an]
                     : [src[i], src[i + 1], src[i + 2]];
        // pick the channel with the largest |F - K|
        let best = -1, spread = 0;
        for (let c = 0; c < 3; c++) { const s = Math.abs(F[c] - key[c]); if (s > spread) { spread = s; best = c; } }
        if (best < 0 || spread < 1) continue;                  // no information -- leave it alone
        let a = (src[i + best] - key[best]) / (F[best] - key[best]);
        if (!Number.isFinite(a)) continue;
        a = Math.max(0, Math.min(1, a));
        out[i] = F[0]; out[i + 1] = F[1]; out[i + 2] = F[2];
        out[i + 3] = Math.round(a * 255);
    }

    // (4) colour bleed -- transparent pixels take a visible neighbour's colour so bilinear filtering has
    // nothing coloured to blend in. Alpha stays zero; only RGB moves.
    for (let p = 0; p < w * h; p++) if (mask[p]) out[p * 4 + 3] = 0;
    const bled = new Uint8ClampedArray(out);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (out[p * 4 + 3] !== 0) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = (ny * w + nx) * 4;
            if (out[j + 3] === 0) continue;
            r += out[j]; g += out[j + 1]; b += out[j + 2]; n++;
        }
        if (n) { bled[p * 4] = r / n; bled[p * 4 + 1] = g / n; bled[p * 4 + 2] = b / n; }
    }
    return { width: w, height: h, data: bled };
}

/**
 * Connected components over the visible pixels, as bounding boxes. 8-connected here (unlike the border
 * fill): a diagonal pixel chain is one drawn stroke, and splitting it would invent frames that are not
 * there. Iterative BFS in raster order so the labelling -- and therefore the output -- is identical run
 * to run.
 */
export function components(img, alphaCut = DEFAULT_ALPHA_CUT) {
    const { width: w, height: h, data: d } = img;
    const seen = new Uint8Array(w * h);
    const boxes = [];
    const vis = (p) => d[p * 4 + 3] > alphaCut;
    const queue = new Int32Array(w * h);
    for (let p0 = 0; p0 < w * h; p0++) {
        if (seen[p0] || !vis(p0)) continue;
        let head = 0, tail = 0;
        queue[tail++] = p0; seen[p0] = 1;
        let x0 = p0 % w, x1 = x0, y0 = (p0 - x0) / w, y1 = y0, area = 0;
        while (head < tail) {
            const p = queue[head++]; area++;
            const x = p % w, y = (p - x) / w;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                const q = ny * w + nx;
                if (seen[q] || !vis(q)) continue;
                seen[q] = 1; queue[tail++] = q;
            }
        }
        boxes.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
    }
    return boxes;
}

/** True when two boxes are within gap pixels of each other (or overlap). */
function near(a, b, gap) {
    return !(a.x - gap > b.x + b.w - 1 || b.x - gap > a.x + a.w - 1
          || a.y - gap > b.y + b.h - 1 || b.y - gap > a.y + a.h - 1);
}

/**
 * Merge boxes that are close, transitively. One sprite is routinely several components -- a dot over an i,
 * a detached spark, a sword held clear of the body -- and treating each as its own frame is the failure
 * mode connected-component slicing has that grid slicing does not. Repeats to a fixed point because a
 * merge can bring two previously distant boxes into contact.
 */
export function mergeBoxes(boxes, gap = DEFAULT_MERGE_GAP) {
    let cur = boxes.map((b) => ({ ...b }));
    for (;;) {
        let merged = false;
        const next = [];
        const used = new Uint8Array(cur.length);
        for (let i = 0; i < cur.length; i++) {
            if (used[i]) continue;
            let a = cur[i]; used[i] = 1;
            for (let j = i + 1; j < cur.length; j++) {
                if (used[j] || !near(a, cur[j], gap)) continue;
                const b = cur[j]; used[j] = 1; merged = true;
                const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
                const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
                a = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, area: a.area + b.area };
            }
            next.push(a);
        }
        cur = next;
        if (!merged) return cur;
    }
}

/**
 * Reading order: rows top to bottom, left to right within a row. Frames on one row of a sheet are rarely
 * aligned to the pixel, so a plain sort by y scrambles them -- boxes are banded by whether they overlap
 * vertically with the band opened so far, which is what a person means by "the same row".
 */
export function readingOrder(boxes) {
    const rest = boxes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const out = [];
    while (rest.length) {
        const seed = rest.shift();
        let top = seed.y, bot = seed.y + seed.h;
        const row = [seed];
        for (let i = 0; i < rest.length; i++) {
            const b = rest[i];
            if (b.y < bot && b.y + b.h > top) { row.push(b); top = Math.min(top, b.y); bot = Math.max(bot, b.y + b.h); rest.splice(i--, 1); }
        }
        row.sort((a, b) => (a.x - b.x) || (a.y - b.y));
        out.push(...row);
    }
    return out;
}

/**
 * The whole pipeline. Returns { frames, matted, key } -- frames in reading order, matted as an RGBA image
 * the caller can upload, key as what the backdrop was decided to be so the decision is inspectable rather
 * than internal.
 */
export function sliceSheet(img, opts = {}) {
    const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
    const gap       = opts.mergeGap  ?? DEFAULT_MERGE_GAP;
    const minArea   = opts.minArea   ?? DEFAULT_MIN_AREA;
    const det  = opts.key ? { key: opts.key, kind: "given", agree: 4, keys: [opts.key] } : detectKey(img);
    const keys = det.kind === "alpha" ? [] : det.keys;
    const mask = borderFill(img, keys, tolerance);
    const matted = keys.length ? unmix(img, mask, det.key) : img;
    let boxes = components(matted, opts.alphaCut ?? DEFAULT_ALPHA_CUT).filter((b) => b.area >= minArea);
    boxes = mergeBoxes(boxes, gap);
    return { frames: readingOrder(boxes), matted, key: det };
}

export const SLICE_DEFAULTS = Object.freeze({
    tolerance: DEFAULT_TOLERANCE, alphaCut: DEFAULT_ALPHA_CUT, mergeGap: DEFAULT_MERGE_GAP, minArea: DEFAULT_MIN_AREA,
});

/**
 * Emit the metadata shape tools/ship/spriteSheetImport.mjs already validates:
 *   { sheet: { w, h }, frames: [ { name, x, y, w, h }, ... ] }
 *
 * *** THE TWO MODULES ARE HALVES OF ONE PIPELINE, WHICH IS WHY THIS FUNCTION EXISTS RATHER THAN A SECOND
 * *** UV DERIVATION. spriteSheetImport is the DECLARED half: a sheet that arrives WITH a JSON saying where
 * its frames are, validated and refused if a rect samples outside the sheet. This module is the UNDECLARED
 * half: a sheet that arrives with nothing, where the frames have to be found in the pixels. Feeding this
 * output into validateSheet/importSheet means found frames are held to exactly the same standard as
 * declared ones -- including the out-of-bounds refusal -- instead of getting a private, laxer path.
 *
 * Not imported from here: spriteSheetImport pulls node:url, and this module must stay loadable in a
 * browser. The join is made by the caller, and the gate proves it holds.
 */
export function toSheetMeta(img, frames, prefix = "f") {
    return {
        sheet: { w: img.width, h: img.height },
        frames: frames.map((b, i) => ({ name: `${prefix}${i}`, x: b.x, y: b.y, w: b.w, h: b.h })),
    };
}
