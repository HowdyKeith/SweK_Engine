// WebGLEngine/text/slugEval.js — v3823
// ---------------------------------------------------------------------------------------------------------------
// SLUG'S FRAGMENT SHADER, ON THE CPU, READING THE REAL PACKED TEXTURES.
//
// WHY THIS EXISTS AT ALL. A shader is the least testable code in the engine: it needs a GPU, a context, a
// framebuffer and a readback before it will tell you anything, and what it tells you then is a picture. Meanwhile
// EVERYTHING that can go wrong with a Slug integration is arithmetic and addressing -- a band list sorted the
// wrong way, an offset measured from the wrong origin, a header texel that spilled across a row. So the shader is
// transliterated here, line for line, and the transliteration is pointed at the SAME Uint16Array the GPU would be
// handed. texelFetchCurve and texelFetchBand below are texelFetch, including CalcBandLoc's row wrap.
//
// *** THE POINT IS THAT THIS IS NOT A MIRROR. *** Grading this file against the packer that fed it would prove
// nothing: both could share one wrong idea of where band 3's list lives and agree perfectly. What makes it a key
// is what slug-selfcheck.mjs compares it TO -- a winding number computed by flattening the same outline into line
// segments and counting ray crossings, a route that has never heard of bands, offsets, texels or root codes and
// gets to the answer by a method with no addressing in it whatsoever. Where those two agree, the addressing is
// right. Where they disagree, this file is the one that is wrong, because the segment count is not clever enough
// to be subtly broken.
//
// Faithfulness rules for anyone editing this file: no clean-ups. The float bit extraction in calcRootCode stays
// even though `y < 0` looks equivalent, because it is not equivalent at negative zero. The double-root fallback
// stays at exactly 1/65536. The abs() in calcCoverage stays, because it is the only reason a font drawn with
// either winding convention renders at all.
//
// Slug shader algorithm: Copyright 2017 Eric Lengyel, MIT OR Apache-2.0.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { fromHalf } from "./slugAtlas.js";

const saturate = (x) => (x < 0 ? 0 : (x > 1 ? 1 : x));

/* ------------------------------------------------------------------------------------------------------------
 * Bit-exact sign extraction, as asuint() does it
 * --------------------------------------------------------------------------------------------------------- */

const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
const asuint = (v) => { _f32[0] = v; return _u32[0]; };

/**
 * Root eligibility for a sample-relative quadratic, from the signs of the three y coordinates.
 *
 * The magic constant is a 16-entry truth table indexed by those three sign bits: bit `s` says whether the first
 * root contributes, bit `s+8` whether the second does. slug-selfcheck.mjs re-derives all sixteen entries by
 * actually solving the quadratic and counting crossings, rather than trusting the constant.
 */
export function calcRootCode(y1, y2, y3) {
    const i1 = asuint(y1) >>> 31;
    const i2 = asuint(y2) >>> 30;
    const i3 = asuint(y3) >>> 29;
    let shift = (i2 & 2) | (i1 & ~2);
    shift = (i3 & 4) | (shift & ~4);
    return (0x2E74 >>> shift) & 0x0101;
}

/** x coordinates where the sample-relative curve crosses y = 0, at the two roots. */
export function solveHorizPoly(p1x, p1y, p2x, p2y, p3x, p3y) {
    const ax = p1x - p2x * 2 + p3x, ay = p1y - p2y * 2 + p3y;
    const bx = p1x - p2x, by = p1y - p2y;
    const ra = 1 / ay, rb = 0.5 / by;
    const d = Math.sqrt(Math.max(by * by - ay * p1y, 0));
    let t1 = (by - d) * ra, t2 = (by + d) * ra;
    if (Math.abs(ay) < 1 / 65536) { t1 = t2 = p1y * rb; }
    return [(ax * t1 - bx * 2) * t1 + p1x, (ax * t2 - bx * 2) * t2 + p1x];
}

/** y coordinates where the sample-relative curve crosses x = 0, at the two roots. */
export function solveVertPoly(p1x, p1y, p2x, p2y, p3x, p3y) {
    const ax = p1x - p2x * 2 + p3x, ay = p1y - p2y * 2 + p3y;
    const bx = p1x - p2x, by = p1y - p2y;
    const ra = 1 / ax, rb = 0.5 / bx;
    const d = Math.sqrt(Math.max(bx * bx - ax * p1x, 0));
    let t1 = (bx - d) * ra, t2 = (bx + d) * ra;
    if (Math.abs(ax) < 1 / 65536) { t1 = t2 = p1x * rb; }
    return [(ay * t1 - by * 2) * t1 + p1y, (ay * t2 - by * 2) * t2 + p1y];
}

/** Combine the two rays' coverages. The abs() is what makes either winding convention work. */
export function calcCoverage(xcov, ycov, xwgt, ywgt, flags, opts = {}) {
    let coverage = Math.max(Math.abs(xcov * xwgt + ycov * ywgt) / Math.max(xwgt + ywgt, 1 / 65536),
                            Math.min(Math.abs(xcov), Math.abs(ycov)));
    if (opts.evenOdd && (flags & 0x1000) !== 0) {
        const frac = coverage * 0.5 - Math.floor(coverage * 0.5);
        coverage = 1 - Math.abs(1 - frac * 2);
    } else {
        coverage = saturate(coverage);
    }
    if (opts.weight) coverage = Math.sqrt(coverage);
    return coverage;
}

/* ------------------------------------------------------------------------------------------------------------
 * texelFetch
 * --------------------------------------------------------------------------------------------------------- */

/**
 * *** OUT-OF-RANGE READS RETURN ZERO AND ARE COUNTED. THEY DO NOT WRAP. ***
 *
 * The obvious way to index a flat array -- (y * width + x) -- makes an x past the right edge slide onto the next
 * row, and that is NOT what a GPU does. GLSL leaves texelFetch outside the texture undefined, and undefined is in
 * practice zero, never the neighbouring row. The difference is not academic: it is precisely the class of bug
 * this whole file exists to catch. An early version of this evaluator wrapped, and a shader compiled for the
 * wrong kLogBandTextureWidth then produced perfect output in test and would have produced garbage on a device --
 * because the wrap in the evaluator happened to undo the wrong wrap in CalcBandLoc. Modelling the hardware's
 * refusal to wrap is what makes that plant bite.
 *
 * `atlas.oob`, when present, counts the reads that fell outside. A correct atlas never makes one.
 */
export function texelFetchCurve(atlas, x, y) {
    const rows = atlas.curveTexels;
    if (x < 0 || y < 0 || x >= atlas.width || y >= rows) { if (atlas.oob) atlas.oob.curve++; return [0, 0, 0, 0]; }
    const i = (y * atlas.width + x) * 4;
    const d = atlas.curveData;
    if (atlas.format === "32f") return [d[i], d[i + 1], d[i + 2], d[i + 3]];
    return [fromHalf(d[i]), fromHalf(d[i + 1]), fromHalf(d[i + 2]), fromHalf(d[i + 3])];
}

/** Read one RG texel of the band texture. Same refusal to wrap, same reason. */
export function texelFetchBand(atlas, x, y) {
    if (x < 0 || y < 0 || x >= atlas.width || y >= atlas.bandTexels) { if (atlas.oob) atlas.oob.band++; return [0, 0]; }
    const i = (y * atlas.width + x) * 2;
    return [atlas.bandData[i], atlas.bandData[i + 1]];
}

/** CalcBandLoc: a linear offset from the glyph's header, carrying overflow into y. */
export function calcBandLoc(glyphX, glyphY, offset, logWidth) {
    let x = glyphX + offset;
    const y = glyphY + (x >> logWidth);
    x &= (1 << logWidth) - 1;
    return [x, y];
}

/* ------------------------------------------------------------------------------------------------------------
 * SlugRender
 * --------------------------------------------------------------------------------------------------------- */

/**
 * Coverage at one sample.
 *
 * `entry` is a packAtlas glyph record. `emsPerPixel` is [x, y] -- what fwidth(renderCoord) yields in the real
 * shader, and the only input here that a fragment shader gets for free. Pass something tiny to ask the question
 * "is this point inside the glyph", and a realistic value to ask "how much of this pixel is covered".
 *
 * `stats`, if supplied, collects the loop counts the GPU would pay, which is the only way to see whether the
 * banding is doing its job.
 */
export function slugRender(atlas, entry, x, y, emsPerPixel, opts = {}, stats = null) {
    if (entry.empty) return 0;

    const logWidth = atlas.logWidth;
    const pixelsPerEmX = 1 / emsPerPixel[0], pixelsPerEmY = 1 / emsPerPixel[1];

    const bandMaxX = entry.bandMax[0], bandMaxY = entry.bandMax[1] & 0x00FF;
    const [sx, sy, ox, oy] = entry.transform;

    // int() truncates toward zero, so a negative product lands on 0 and the clamp holds it there.
    let bix = Math.trunc(x * sx + ox), biy = Math.trunc(y * sy + oy);
    bix = Math.min(Math.max(bix, 0), bandMaxX);
    biy = Math.min(Math.max(biy, 0), bandMaxY);

    const gx = entry.loc[0], gy = entry.loc[1];

    // --- horizontal band: ray travels in +x ------------------------------------------------------------------
    let xcov = 0, xwgt = 0;
    const hband = texelFetchBand(atlas, gx + biy, gy);
    const hloc = calcBandLoc(gx, gy, hband[1], logWidth);
    let hIter = 0;
    for (let i = 0; i < hband[0]; i++) {
        hIter++;
        const cl = texelFetchBand(atlas, hloc[0] + i, hloc[1]);
        const t0 = texelFetchCurve(atlas, cl[0], cl[1]);
        const t1 = texelFetchCurve(atlas, cl[0] + 1, cl[1]);
        const p1x = t0[0] - x, p1y = t0[1] - y, p2x = t0[2] - x, p2y = t0[3] - y;
        const p3x = t1[0] - x, p3y = t1[1] - y;

        if (Math.max(p1x, p2x, p3x) * pixelsPerEmX < -0.5) break;

        const code = calcRootCode(p1y, p2y, p3y);
        if (code !== 0) {
            const r = solveHorizPoly(p1x, p1y, p2x, p2y, p3x, p3y);
            const r0 = r[0] * pixelsPerEmX, r1 = r[1] * pixelsPerEmX;
            if ((code & 1) !== 0) { xcov += saturate(r0 + 0.5); xwgt = Math.max(xwgt, saturate(1 - Math.abs(r0) * 2)); }
            if (code > 1)         { xcov -= saturate(r1 + 0.5); xwgt = Math.max(xwgt, saturate(1 - Math.abs(r1) * 2)); }
        }
    }

    // --- vertical band: ray travels in +y, and its header follows all the horizontal ones ---------------------
    let ycov = 0, ywgt = 0;
    const vband = texelFetchBand(atlas, gx + bandMaxY + 1 + bix, gy);
    const vloc = calcBandLoc(gx, gy, vband[1], logWidth);
    let vIter = 0;
    for (let i = 0; i < vband[0]; i++) {
        vIter++;
        const cl = texelFetchBand(atlas, vloc[0] + i, vloc[1]);
        const t0 = texelFetchCurve(atlas, cl[0], cl[1]);
        const t1 = texelFetchCurve(atlas, cl[0] + 1, cl[1]);
        const p1x = t0[0] - x, p1y = t0[1] - y, p2x = t0[2] - x, p2y = t0[3] - y;
        const p3x = t1[0] - x, p3y = t1[1] - y;

        if (Math.max(p1y, p2y, p3y) * pixelsPerEmY < -0.5) break;

        const code = calcRootCode(p1x, p2x, p3x);
        if (code !== 0) {
            const r = solveVertPoly(p1x, p1y, p2x, p2y, p3x, p3y);
            const r0 = r[0] * pixelsPerEmY, r1 = r[1] * pixelsPerEmY;
            if ((code & 1) !== 0) { ycov -= saturate(r0 + 0.5); ywgt = Math.max(ywgt, saturate(1 - Math.abs(r0) * 2)); }
            if (code > 1)         { ycov += saturate(r1 + 0.5); ywgt = Math.max(ywgt, saturate(1 - Math.abs(r1) * 2)); }
        }
    }

    if (stats) {
        stats.samples = (stats.samples || 0) + 1;
        stats.hIter = (stats.hIter || 0) + hIter;
        stats.vIter = (stats.vIter || 0) + vIter;
        stats.maxIter = Math.max(stats.maxIter || 0, hIter, vIter);
    }

    // glyphData.w in the shader carries band max y in its low bits and the even-odd E flag at bit 12. Only the
    // flag is read by calcCoverage, and here it comes from opts rather than from a word we would have to pack
    // and immediately unpack again.
    return calcCoverage(xcov, ycov, xwgt, ywgt, opts.evenOdd ? 0x1000 : 0, opts);
}

/* ------------------------------------------------------------------------------------------------------------
 * The independent route: winding number from flattened segments
 *
 * Deliberately stupid. It flattens every quadratic into line segments and counts signed crossings of a ray, which
 * is the definition of the nonzero fill rule rather than an implementation of it. No bands, no textures, no
 * offsets, no root code. It is slow and it does not antialias, and neither of those matters for what it is for.
 * --------------------------------------------------------------------------------------------------------- */

/** Flatten contours to segments [[x0,y0,x1,y1], ...] using `steps` subdivisions per curve. */
export function flattenToSegments(contours, steps = 64) {
    const segs = [];
    for (const contour of contours) {
        for (const q of contour) {
            let px = q[0], py = q[1];
            for (let i = 1; i <= steps; i++) {
                const t = i / steps, u = 1 - t;
                const nx = u * u * q[0] + 2 * t * u * q[2] + t * t * q[4];
                const ny = u * u * q[1] + 2 * t * u * q[3] + t * t * q[5];
                segs.push([px, py, nx, ny]);
                px = nx; py = ny;
            }
        }
    }
    return segs;
}

/** Signed winding number of `segs` about (x, y), counting crossings of the ray travelling in +x. */
export function windingNumber(segs, x, y) {
    let w = 0;
    for (const [x0, y0, x1, y1] of segs) {
        if (y0 <= y) {
            if (y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0) w++;
        } else if (y1 <= y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0) w--;
    }
    return w;
}

/** Distance from (x, y) to the nearest flattened segment. Used to keep comparisons off the boundary. */
export function distanceToSegments(segs, x, y) {
    let best = Infinity;
    for (const [x0, y0, x1, y1] of segs) {
        const dx = x1 - x0, dy = y1 - y0;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? ((x - x0) * dx + (y - y0) * dy) / len2 : 0;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const ex = x0 + t * dx - x, ey = y0 + t * dy - y;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d < best) best = d;
    }
    return best;
}
