// WebGLEngine/text/slugAtlas.js — v3823
// ---------------------------------------------------------------------------------------------------------------
// THE TWO TEXTURES SLUG'S FRAGMENT SHADER READS, BUILT SO THAT EVERY ADDRESS THE SHADER COMPUTES LANDS ON THE
// TEXEL WE MEANT.
//
// Slug is a data-structure algorithm wearing a shader as a hat. The fragment shader is short and has no options in
// it; ALL of the difficulty is on this side, in laying out two textures whose addressing rules are implied by six
// lines of the shader and stated nowhere else. Those rules, extracted from SlugPixelShader.hlsl and each one a
// standing constraint on this file:
//
//   1. HEADER TEXELS ARE READ WITHOUT WRAPPING.  `TexelLoad2D(bandData, int2(glyphLoc.x + bandIndex.y, glyphLoc.y))`
//      adds to x and keeps y. So a glyph's H+V header texels MUST fit in the remainder of one texture row. Spill
//      the header across a row and you silently read another glyph's bands.
//
//   2. CURVE LISTS ARE READ WITHOUT WRAPPING EITHER.  The loop indexes `hbandLoc.x + curveIndex` with a fixed
//      hbandLoc.y. So each individual band's list must fit in the remainder of its row -- even though the list's
//      START is located by CalcBandLoc, which DOES wrap.
//
//   3. ONLY THE LIST START WRAPS.  CalcBandLoc treats (glyphLoc.x + offset) as a flat index and carries the
//      overflow into y. So offsets are linear distances from the glyph's first texel, and offset is a 16-bit
//      channel: a glyph's data must live within 65535 texels of its own header.
//
//   4. CURVES SHARE ENDPOINT TEXELS.  A curve reads p1,p2 from its texel and p3 from `curveLoc.x + 1` -- again
//      without wrapping. A contour of n curves is therefore n+1 CONSECUTIVE texels in ONE row, the last holding
//      the point the contour closes back onto. This is not a compression trick we chose; the shader requires it.
//
//   5. THE EARLY-OUT IS A SORT CONTRACT.  The loop breaks on the first curve whose largest CONTROL-POINT
//      coordinate falls behind the sample. That is only correct if the band's curves are sorted DESCENDING along
//      the ray axis, and it is the SORT DIRECTION and the SORT AXIS that carry the weight, not the choice of
//      bound. The requirement is exactly this: the key must be an upper bound on the curve's true reach. Then a
//      break at curve D (hull_D < sample) guarantees every later curve C has reach_C <= key_C <= key_D <= hull_D
//      < sample, so nothing that could still contribute is skipped. BOTH the control hull and the tight curve
//      extent satisfy that, and slug-selfcheck.mjs establishes it by measurement rather than by argument: 0
//      errors in 7900 samples either way. *** AN EARLIER DRAFT OF THIS FILE CLAIMED THE TIGHT EXTENT WAS A
//      CORRECTNESS BUG AND WAS WRONG. *** The hull is used anyway, for a smaller reason that is still a reason:
//      it is the quantity the shader's break names, so the two cannot drift apart if the break is ever edited.
//
//      What DOES break the early-out is the direction and the axis. Not sorting at all costs 1445 of 7900
//      samples; sorting ascending costs 3002; and sorting a horizontal band by max Y instead of max X -- the
//      copy-paste between two near-identical loops -- costs 2286. Those are the plants, because those are the
//      mistakes.
//
//      Band MEMBERSHIP is a separate question and uses the TIGHT bound, because a curve that cannot reach the
//      band is pure loop cost in the fragment shader.
//
// Band membership overlaps neighbouring bands by 1/1024 em, per Lengyel's README. Straight horizontal lines are
// kept out of horizontal bands and straight vertical lines out of vertical bands, also per the README: a ray
// parallel to a line cannot cross it, so those entries could only ever burn an iteration.
//
// Slug shader algorithm and data layout: Copyright 2017 Eric Lengyel, MIT OR Apache-2.0.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { quadExtent, curveBounds } from "./slugFont.js";

/**
 * Band overlap in em, from the Slug README, which asks for it without saying what it buys.
 *
 * *** MEASURED, BECAUSE THE OBVIOUS STORY ABOUT IT IS WRONG. *** The intuition is that a band needs slack to
 * cover the antialiasing footprint of samples near its edge. It does not, and the reason is worth writing down:
 * Slug's horizontal ray is a LINE, NOT A BOX. Coverage comes from where a crossing lands in x, through
 * saturate(r + 0.5); nothing about it integrates over y. So the only curves that can contribute at a sample are
 * those whose y extent contains the sample's y, which is exactly what membership already selects. Growing the
 * epsilon to half a pixel, and then to three and a half pixels, changed the antialiasing error by NOTHING at all
 * (mean 0.00974 and worst pixel 0.2378, identical to four decimals in every case) while taking the inner loop
 * from 5.88 curve tests per sample to 12.24. An oversized epsilon is pure cost.
 *
 * What it actually guards is narrower: this file decides membership in float64 and the GPU decides the sample's
 * band index in float32, from a different expression. Over 400000 y values on one glyph those two disagreed
 * twice. A curve sitting exactly on a boundary can therefore be absent from the band a sample lands in. Setting
 * the epsilon to zero produced no error even sampling densely at the boundaries -- such a crossing is tangential
 * and its double root cancels -- so this is insurance against a case that was not reproduced rather than a fix
 * for one that was. It is kept at the README's value because it is cheap at that size and Lengyel asks for it.
 *
 * The residual worst-pixel error of 0.24 is not a banding gap. It is inherent to estimating coverage from two
 * rays through the pixel centre instead of sampling area, which is the trade the algorithm makes.
 */
export const BAND_EPSILON = 1 / 1024;

/* ------------------------------------------------------------------------------------------------------------
 * Half floats. The curve texture is RGBA16F because that is what Slug specifies, so em coordinates round to
 * ~2^-11 relative -- about 0.0005 em, or 0.03 px at a 64 px em. Written out by hand because the packing has to
 * be exact and Float16Array is not available everywhere this engine runs.
 * --------------------------------------------------------------------------------------------------------- */

const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);

/** IEEE 754 binary32 -> binary16, round-to-nearest-even, with overflow to Inf and gradual underflow. */
export function toHalf(value) {
    _f32[0] = value;
    const x = _u32[0];
    const sign = (x >>> 16) & 0x8000;
    let exp = (x >>> 23) & 0xFF;
    let man = x & 0x007FFFFF;

    if (exp === 0xFF) return sign | 0x7C00 | (man ? 0x0200 : 0);          // Inf / NaN
    let e = exp - 127 + 15;
    if (e >= 0x1F) return sign | 0x7C00;                                   // overflow -> Inf
    if (e <= 0) {
        if (e < -10) return sign;                                          // underflow -> zero
        man |= 0x00800000;                                                 // subnormal: shift the implicit 1 in
        const shift = 14 - e;
        let h = man >>> shift;
        const rem = man & ((1 << shift) - 1), half = 1 << (shift - 1);
        if (rem > half || (rem === half && (h & 1))) h++;
        return sign | h;
    }
    let h = (e << 10) | (man >>> 13);
    const rem = man & 0x1FFF;
    if (rem > 0x1000 || (rem === 0x1000 && (h & 1))) h++;                  // round-to-nearest-even; carries into exp
    return sign | h;
}

/** binary16 -> binary32. Present so the selfcheck can read back exactly what the GPU will see. */
export function fromHalf(h) {
    const sign = (h & 0x8000) ? -1 : 1;
    const exp = (h >>> 10) & 0x1F;
    const man = h & 0x03FF;
    if (exp === 0) return sign * man * Math.pow(2, -24);
    if (exp === 0x1F) return man ? NaN : sign * Infinity;
    return sign * (man + 1024) * Math.pow(2, exp - 25);
}

/* ------------------------------------------------------------------------------------------------------------
 * Per-glyph curve list and band assignment
 * --------------------------------------------------------------------------------------------------------- */

/**
 * Flatten a glyph's contours into the texel-sharing layout of rule 4.
 *
 * Returns { texels, curves } where `texels` is a flat array of [p1x, p1y, p2x, p2y] rows (one row per texel,
 * n+1 rows per contour) and `curves` describes each drawable curve as
 *   { texel, p1, p2, p3, hullMaxX, hullMaxY, ext }
 * with `texel` the index into `texels` that the shader's curveLoc must point at.
 */
export function flattenContours(contours) {
    const texels = [];
    const curves = [];
    for (const contour of contours) {
        if (contour.length === 0) continue;
        const base = texels.length;
        for (let k = 0; k < contour.length; k++) {
            const q = contour[k];
            texels.push([q[0], q[1], q[2], q[3]]);
            curves.push({
                texel: base + k,
                p1: [q[0], q[1]], p2: [q[2], q[3]], p3: [q[4], q[5]],
                hullMaxX: Math.max(q[0], q[2], q[4]),
                hullMaxY: Math.max(q[1], q[3], q[5]),
                ext: { x: quadExtent(q[0], q[2], q[4]), y: quadExtent(q[1], q[3], q[5]) }
            });
        }
        // The closing texel: the point the contour returns to, which is the last curve's p3 and equals the first
        // curve's p1 by construction in slugFont. Its z,w are never read, so they carry the first control point
        // purely to keep the buffer free of arbitrary values.
        const first = contour[0];
        texels.push([first[0], first[1], first[2], first[3]]);
    }
    return { texels, curves };
}

/** Curves whose y never varies cannot be crossed by a horizontal ray. Same idea for x and vertical rays. */
const isHorizontalLine = (c) => c.ext.y[0] === c.ext.y[1];
const isVerticalLine   = (c) => c.ext.x[0] === c.ext.x[1];

/**
 * Assign curves to `count` bands spanning [lo, hi] along one axis.
 * `axis` is "y" for horizontal bands (rays travel in +x) or "x" for vertical bands (rays travel in +y).
 * Lists come back sorted descending by control-hull extent along the RAY axis -- rule 5.
 */
export function assignBands(curves, axis, lo, hi, count, epsilon = BAND_EPSILON) {
    const span = hi - lo;
    const thickness = span / count;
    const skip = axis === "y" ? isHorizontalLine : isVerticalLine;
    const sortKey = axis === "y" ? ((c) => c.hullMaxX) : ((c) => c.hullMaxY);

    const bands = [];
    for (let i = 0; i < count; i++) bands.push([]);

    for (const c of curves) {
        if (skip(c)) continue;
        const ext = c.ext[axis];
        // Overlap the bands slightly so a curve grazing a boundary lands in both.
        let first = Math.floor((ext[0] - epsilon - lo) / thickness);
        let last  = Math.floor((ext[1] + epsilon - lo) / thickness);
        if (first < 0) first = 0;
        if (last > count - 1) last = count - 1;
        for (let i = first; i <= last; i++) bands[i].push(c);
    }

    for (const b of bands) b.sort((p, q) => sortKey(q) - sortKey(p));
    return bands;
}

/**
 * Choose a band count, per the README's "minimize the maximum number of curves in any single band".
 *
 * Taken literally that instruction runs away: more bands is never worse by that measure alone, and a glyph would
 * end up with hundreds of near-empty bands, each costing a header texel. So the rule here is to find the best
 * achievable maximum and then take the SMALLEST count that gets within one curve of it -- the shader's inner loop
 * is what we are buying, and the last curve of slack is not worth a pile of header texels.
 */
export function chooseBandCount(curves, axis, lo, hi, maxBands = 16, epsilon = BAND_EPSILON) {
    if (hi - lo <= 0 || curves.length === 0) return 1;
    let best = Infinity;
    const worst = [];
    for (let n = 1; n <= maxBands; n++) {
        const bands = assignBands(curves, axis, lo, hi, n, epsilon);
        let m = 0;
        for (const b of bands) if (b.length > m) m = b.length;
        worst.push(m);
        if (m < best) best = m;
    }
    for (let n = 1; n <= maxBands; n++) if (worst[n - 1] <= best + 1) return n;
    return 1;
}

/**
 * Everything one glyph needs, short of a texture position.
 * `bbox` is the tight outline bound; the band transform maps em coordinates onto band indices over that bound.
 */
export function buildGlyph(contours, opts = {}) {
    const maxBands = opts.maxBands || 16;
    const epsilon = opts.epsilon === undefined ? BAND_EPSILON : opts.epsilon;
    const { texels, curves } = flattenContours(contours);
    const bbox = curveBounds(contours);

    if (curves.length === 0) {
        return { empty: true, texels: [], curves: [], hbands: [], vbands: [], bbox, transform: [0, 0, 0, 0] };
    }

    // A zero-thickness axis (a glyph that is a perfectly flat rule, say) gets one band and a zero scale, which
    // clamps every sample into band 0. That is the right answer, and it keeps the division below out of trouble.
    const wide = bbox.x1 - bbox.x0 > 0, tall = bbox.y1 - bbox.y0 > 0;
    const V = wide ? chooseBandCount(curves, "x", bbox.x0, bbox.x1, maxBands, epsilon) : 1;
    const H = tall ? chooseBandCount(curves, "y", bbox.y0, bbox.y1, maxBands, epsilon) : 1;

    const hbands = assignBands(curves, "y", bbox.y0, bbox.y1, H, epsilon);
    const vbands = assignBands(curves, "x", bbox.x0, bbox.x1, V, epsilon);

    const sx = wide ? V / (bbox.x1 - bbox.x0) : 0;
    const sy = tall ? H / (bbox.y1 - bbox.y0) : 0;
    return {
        empty: false, texels, curves, hbands, vbands, bbox,
        transform: [sx, sy, -bbox.x0 * sx, -bbox.y0 * sy]
    };
}

/* ------------------------------------------------------------------------------------------------------------
 * Packing
 * --------------------------------------------------------------------------------------------------------- */

/** Round a linear texel index up to the start of the next row if `run` texels would not fit in the current one. */
function fitRun(index, run, width) {
    const col = index % width;
    return (col + run <= width) ? index : index + (width - col);
}

/**
 * Pack a set of glyphs into the curve texture and the band texture.
 *
 * `glyphs` is [{ key, contours }]. Returns
 *   {
 *     width, curveTexels, bandTexels,               // texture dimensions
 *     curveData: Uint16Array (RGBA16F) | Float32Array (RGBA32F),
 *     bandData: Uint16Array (RG16UI),
 *     glyphs: Map key -> { loc:[x,y], bandMax:[V-1,H-1], transform:[sx,sy,ox,oy], bbox, curveCount, empty }
 *   }
 *
 * `opts.format` is "16f" (default, what Slug specifies) or "32f" (exact; useful when a selfcheck wants to
 * separate a packing bug from a rounding artefact).
 */
export function packAtlas(glyphs, opts = {}) {
    const logWidth = opts.logWidth || 12;                  // must equal kLogBandTextureWidth in the shader
    const width = 1 << logWidth;
    const format = opts.format || "16f";

    const curveRows = [];                                  // flat [x,y,z,w] per texel
    const bandRows = [];                                   // flat [r,g] per texel
    const out = new Map();

    for (const g of glyphs) {
        const built = buildGlyph(g.contours, opts);

        if (built.empty) {
            out.set(g.key, { loc: [0, 0], bandMax: [0, 0], transform: [0, 0, 0, 0], bbox: built.bbox, curveCount: 0, empty: true });
            continue;
        }

        // --- curve texels: each contour is a consecutive run that may not cross a row (rule 4) ----------------
        const texelBase = new Array(built.texels.length);
        {
            // Contour boundaries are recoverable from the curve list: a contour starts at each curve whose texel
            // index is not one past the previous curve's.
            const runs = [];
            let start = 0;
            for (let i = 1; i <= built.curves.length; i++) {
                if (i === built.curves.length || built.curves[i].texel !== built.curves[i - 1].texel + 1) {
                    runs.push([built.curves[start].texel, built.curves[i - 1].texel + 1]);   // inclusive of closing texel
                    start = i;
                }
            }
            for (const [from, to] of runs) {
                const run = to - from + 1;
                if (run > width) throw new Error("slugAtlas: contour of " + (run - 1) + " curves exceeds texture width " + width);
                let at = fitRun(curveRows.length, run, width);
                while (curveRows.length < at) curveRows.push([0, 0, 0, 0]);
                for (let t = from; t <= to; t++) { texelBase[t] = curveRows.length; curveRows.push(built.texels[t]); }
            }
        }

        // --- band texels ---------------------------------------------------------------------------------------
        const H = built.hbands.length, V = built.vbands.length;
        const header = H + V;
        if (header > width) throw new Error("slugAtlas: glyph header of " + header + " texels exceeds texture width " + width);

        let glyphStart = fitRun(bandRows.length, header, width);          // rule 1: header may not cross a row
        while (bandRows.length < glyphStart) bandRows.push([0, 0]);
        const headerAt = glyphStart;
        for (let i = 0; i < header; i++) bandRows.push([0, 0]);           // reserved, filled once offsets are known

        // Lists, deduplicated. Bands that ended up with identical curve sets share one list, which is the first
        // of the two optimisations the README suggests. (The second -- pointing a band at a contiguous SUBSET of
        // a longer band's list -- is not done here: it interacts with rule 2's row-fit constraint in a way that
        // would need the search to be aware of row boundaries, and exact sharing already collapses the adjacent
        // duplicate bands that dominate real glyphs.)
        const listOffset = new Map();
        const emit = (band) => {
            const entries = band.map((c) => texelBase[c.texel]);
            const key = entries.join(",");
            if (listOffset.has(key)) return listOffset.get(key);
            if (entries.length === 0) { listOffset.set(key, 0); return 0; }   // count 0; offset never dereferenced

            let at = fitRun(bandRows.length, entries.length, width);           // rule 2: a list may not cross a row
            while (bandRows.length < at) bandRows.push([0, 0]);
            const offset = at - headerAt;                                     // rule 3: linear distance from the header
            if (offset > 0xFFFF) throw new Error("slugAtlas: band list offset " + offset + " exceeds the 16-bit field");
            for (const e of entries) {
                const x = e % width, y = (e - x) / width;
                if (y > 0xFFFF) throw new Error("slugAtlas: curve texture taller than the 16-bit coordinate field");
                bandRows.push([x, y]);
            }
            listOffset.set(key, offset);
            return offset;
        };

        for (let i = 0; i < H; i++) bandRows[headerAt + i] = [built.hbands[i].length, emit(built.hbands[i])];
        for (let j = 0; j < V; j++) bandRows[headerAt + H + j] = [built.vbands[j].length, emit(built.vbands[j])];

        const lx = headerAt % width, ly = (headerAt - lx) / width;
        out.set(g.key, {
            loc: [lx, ly],
            bandMax: [V - 1, H - 1],
            transform: built.transform,
            bbox: built.bbox,
            curveCount: built.curves.length,
            empty: false
        });
    }

    // --- serialise -------------------------------------------------------------------------------------------
    const curveTexels = Math.max(1, Math.ceil(curveRows.length / width));
    const bandTexels = Math.max(1, Math.ceil(bandRows.length / width));

    let curveData;
    if (format === "32f") {
        curveData = new Float32Array(width * curveTexels * 4);
        for (let i = 0; i < curveRows.length; i++) for (let k = 0; k < 4; k++) curveData[i * 4 + k] = curveRows[i][k];
    } else {
        curveData = new Uint16Array(width * curveTexels * 4);
        for (let i = 0; i < curveRows.length; i++) for (let k = 0; k < 4; k++) curveData[i * 4 + k] = toHalf(curveRows[i][k]);
    }

    const bandData = new Uint16Array(width * bandTexels * 2);
    for (let i = 0; i < bandRows.length; i++) { bandData[i * 2] = bandRows[i][0]; bandData[i * 2 + 1] = bandRows[i][1]; }

    return { width, logWidth, format, curveTexels, bandTexels, curveData, bandData, glyphs: out };
}

/* ------------------------------------------------------------------------------------------------------------
 * Vertex-side packing of the two integer words the shader unpacks out of tex.zw
 * --------------------------------------------------------------------------------------------------------- */

/** tex.z: glyph data location in the band texture. Low 16 bits x, high 16 bits y. */
export function packGlyphLoc(x, y) { return ((y & 0xFFFF) << 16 | (x & 0xFFFF)) >>> 0; }

/**
 * tex.w: band maxima and flags.
 *   bits  0..7   band max x   (vertical band count - 1)
 *   bits 16..23  band max y   (horizontal band count - 1)
 *   bit  28      E -- even-odd fill rule, only consulted when the shader is compiled with SLUG_EVENODD
 *
 * The shader masks band max y with 0x00FF after the unpack, so eight bits each is the real ceiling: at most 256
 * bands per axis. chooseBandCount's maxBands default of 16 is comfortably inside it, and packing asserts rather
 * than truncating, because a truncated band max reads the wrong header texel and produces a glyph that is subtly
 * wrong rather than obviously broken.
 */
export function packGlyphFlags(bandMaxX, bandMaxY, evenOdd = false) {
    if (bandMaxX < 0 || bandMaxX > 255 || bandMaxY < 0 || bandMaxY > 255) {
        throw new Error("slugAtlas: band max out of the 8-bit field (" + bandMaxX + ", " + bandMaxY + ")");
    }
    return ((bandMaxX & 0xFF) | ((bandMaxY & 0xFF) << 16) | (evenOdd ? 0x10000000 : 0)) >>> 0;
}
