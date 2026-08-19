// WebGLEngine/text/slugFont.js — v3823
// ---------------------------------------------------------------------------------------------------------------
// TRUETYPE OUTLINES, READ AS QUADRATIC BÉZIERS, BECAUSE THAT IS THE ONE SHAPE SLUG WANTS.
//
// Slug's whole fragment shader is built on quadratic Béziers: it solves a t^2 - 2b t + c per curve and reads three
// control points per curve out of a texture. TrueType `glyf` outlines are ALREADY quadratic. So the conversion here
// is not an approximation step, it is a TRANSCRIPTION -- and that is the reason this integration parses `glyf`
// directly rather than going through a general font library that would hand back cubics for us to re-fit.
//
// *** THE ONE THING THAT IS NOT A TRANSCRIPTION, AND WHY IT IS THE MOST LIKELY PLACE TO BE WRONG. *** TrueType
// stores contours as a run of points that are each flagged on-curve or off-curve, and TWO ADJACENT OFF-CURVE POINTS
// IMPLY AN ON-CURVE POINT AT THEIR MIDPOINT that is never stored in the file. A contour may also BEGIN on an
// off-curve point, and a contour may consist ENTIRELY of off-curve points (a circle drawn as four control points
// with every on-curve point implied). Get any of those three cases wrong and most glyphs still look fine, which is
// exactly what makes it dangerous. slug-selfcheck.mjs asserts all three against outlines whose true shape is known
// from construction rather than from this parser.
//
// STRAIGHT LINES ARE EMITTED AS {p1, p2, p2}. That is Lengyel's own recommendation in the Slug README: duplicating
// the far endpoint makes a degenerate quadratic whose a coefficient is exactly zero, which is the case the shader's
// `abs(a) < 1/65536` branch is written for. The alternative (midpoint as control) is algebraically the same curve
// but leaves a ~0 rather than == 0, and near-zero is the worse of the two for a reciprocal.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO: CFF/OTTO outlines (cubic; would need a fitting pass), GPOS kerning
// (only the legacy `kern` format 0 is read), hinting (Slug ignores it by design -- see the cap-height trick in
// slugText.js instead), and variable-font axes. Each is a real gap and is reported as such rather than silently
// producing a wrong glyph.
//
// Coordinates come out in EM SPACE (font units divided by unitsPerEm, y up), which is the space Slug's shader
// samples in. Nothing downstream ever sees a font unit.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

/* ------------------------------------------------------------------------------------------------------------
 * Byte reader. Big-endian, because sfnt is.
 * --------------------------------------------------------------------------------------------------------- */

function reader(bytes) {
    const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let p = 0;
    return {
        get pos() { return p; },
        set pos(v) { p = v; },
        len: u8.byteLength,
        u8: () => dv.getUint8(p++),
        i8: () => dv.getInt8(p++),
        u16: () => { const v = dv.getUint16(p); p += 2; return v; },
        i16: () => { const v = dv.getInt16(p); p += 2; return v; },
        u32: () => { const v = dv.getUint32(p); p += 4; return v; },
        i32: () => { const v = dv.getInt32(p); p += 4; return v; },
        f2dot14: () => { const v = dv.getInt16(p); p += 2; return v / 16384; },
        tag: () => { let s = ""; for (let i = 0; i < 4; i++) s += String.fromCharCode(dv.getUint8(p++)); return s; },
        at: (o) => { p = o; }
    };
}

/* ------------------------------------------------------------------------------------------------------------
 * Table directory
 * --------------------------------------------------------------------------------------------------------- */

/** Parse the sfnt header and return { tables, kind }. Throws with a specific reason on formats we cannot use. */
export function readTableDirectory(bytes) {
    const r = reader(bytes);
    const version = r.u32();

    if (version === 0x74746366) throw new Error("slugFont: TrueType Collection (ttcf) -- extract a single face first");
    if (version === 0x4F54544F) throw new Error("slugFont: OTTO/CFF outlines are cubic; Slug needs quadratics. Convert the font to TrueType (glyf) outlines.");
    if (version !== 0x00010000 && version !== 0x74727565) throw new Error("slugFont: not an sfnt font (version 0x" + version.toString(16) + ")");

    const numTables = r.u16();
    r.pos += 6; // searchRange, entrySelector, rangeShift
    const tables = {};
    for (let i = 0; i < numTables; i++) {
        const tag = r.tag();
        r.u32();                       // checksum, unverified on purpose: we never write the font back out
        const offset = r.u32(), length = r.u32();
        tables[tag] = { offset, length };
    }
    return { tables, version };
}

/* ------------------------------------------------------------------------------------------------------------
 * Contour extraction: points -> quadratic Béziers
 *
 * A curve is [x1, y1, x2, y2, x3, y3]: start, control, end. A contour is an array of curves, closed (the last
 * curve's end equals the first curve's start EXACTLY, by construction rather than by tolerance -- slugAtlas
 * relies on that to share texels between neighbouring curves).
 * --------------------------------------------------------------------------------------------------------- */

const ON_CURVE = 0x01, X_SHORT = 0x02, Y_SHORT = 0x04, REPEAT = 0x08, X_SAME = 0x10, Y_SAME = 0x20;

/**
 * Turn one TrueType point run into quadratic curves.
 * `pts` is [{x, y, on}], already in font units. Returns an array of curves.
 *
 * This is the function that handles implied midpoints. It is exported so the selfcheck can drive it with
 * hand-built point runs -- the three awkward cases (leading off-curve point, two adjacent off-curve points, an
 * all-off-curve contour) are much easier to state as points than as a font file.
 */
export function contourToCurves(pts) {
    const n = pts.length;
    if (n === 0) return [];
    if (n === 1) return [];

    // A curve whose three control points coincide. Fonts produce these whenever a contour stores an explicit
    // closing point that duplicates its first point (IBM Plex does it on '(' and ',' among others). The shader
    // is not WRONG about them -- CalcRootCode sees three identical y signs and returns 0, so they are skipped --
    // but they still occupy a texel, a band-list slot, and a loop iteration in every band they land in.
    const degenerate = (q) => q[0] === q[2] && q[2] === q[4] && q[1] === q[3] && q[3] === q[5];
    const emit = (list, q) => { if (!degenerate(q)) list.push(q); };

    // Find a starting on-curve point. If there is none, every on-curve point is implied, and the midpoint of the
    // last and first points is as good a start as any (it is a real point on the curve).
    let start = -1;
    for (let i = 0; i < n; i++) if (pts[i].on) { start = i; break; }

    let startPt;
    if (start < 0) {
        startPt = { x: (pts[n - 1].x + pts[0].x) / 2, y: (pts[n - 1].y + pts[0].y) / 2, on: true };
        start = 0;                                    // the walk begins at pts[0], which is off-curve
    } else {
        startPt = pts[start];
        start = start + 1;                            // the walk begins after it
    }

    const curves = [];
    let cur = { x: startPt.x, y: startPt.y };
    let ctrl = null;

    for (let k = 0; k < n; k++) {
        const p = pts[(start + k) % n];
        if (p.on) {
            if (ctrl) { emit(curves, [cur.x, cur.y, ctrl.x, ctrl.y, p.x, p.y]); ctrl = null; }
            else       { emit(curves, [cur.x, cur.y, p.x, p.y, p.x, p.y]); }   // straight line as {p1, p2, p2}
            cur = { x: p.x, y: p.y };
        } else {
            if (ctrl) {
                // Two off-curve points in a row: the on-curve point between them is implied at their midpoint.
                const mx = (ctrl.x + p.x) / 2, my = (ctrl.y + p.y) / 2;
                emit(curves, [cur.x, cur.y, ctrl.x, ctrl.y, mx, my]);
                cur = { x: mx, y: my };
            }
            ctrl = { x: p.x, y: p.y };
        }
    }

    // Close back onto the exact starting point.
    if (ctrl) emit(curves, [cur.x, cur.y, ctrl.x, ctrl.y, startPt.x, startPt.y]);
    else if (cur.x !== startPt.x || cur.y !== startPt.y) emit(curves, [cur.x, cur.y, startPt.x, startPt.y, startPt.x, startPt.y]);

    return curves;
}

/* ------------------------------------------------------------------------------------------------------------
 * glyf
 * --------------------------------------------------------------------------------------------------------- */

function parseSimpleGlyph(r, numContours) {
    const endPts = new Array(numContours);
    for (let i = 0; i < numContours; i++) endPts[i] = r.u16();
    const numPts = numContours > 0 ? endPts[numContours - 1] + 1 : 0;

    const instrLen = r.u16();
    r.pos += instrLen;

    const flags = new Uint8Array(numPts);
    for (let i = 0; i < numPts;) {
        const f = r.u8();
        flags[i++] = f;
        if (f & REPEAT) { let c = r.u8(); while (c-- > 0 && i < numPts) flags[i++] = f; }
    }

    const xs = new Int32Array(numPts);
    let x = 0;
    for (let i = 0; i < numPts; i++) {
        const f = flags[i];
        if (f & X_SHORT) { const d = r.u8(); x += (f & X_SAME) ? d : -d; }
        else if (!(f & X_SAME)) { x += r.i16(); }
        xs[i] = x;
    }
    const ys = new Int32Array(numPts);
    let y = 0;
    for (let i = 0; i < numPts; i++) {
        const f = flags[i];
        if (f & Y_SHORT) { const d = r.u8(); y += (f & Y_SAME) ? d : -d; }
        else if (!(f & Y_SAME)) { y += r.i16(); }
        ys[i] = y;
    }

    const contours = [];
    let s = 0;
    for (let c = 0; c < numContours; c++) {
        const e = endPts[c];
        const pts = [];
        for (let i = s; i <= e; i++) pts.push({ x: xs[i], y: ys[i], on: !!(flags[i] & ON_CURVE) });
        const curves = contourToCurves(pts);
        if (curves.length) contours.push(curves);
        s = e + 1;
    }
    return contours;
}

const ARG_1_AND_2_ARE_WORDS = 0x0001, ARGS_ARE_XY_VALUES = 0x0002, WE_HAVE_A_SCALE = 0x0008,
      MORE_COMPONENTS = 0x0020, X_AND_Y_SCALE = 0x0040, TWO_BY_TWO = 0x0080;

function parseCompositeGlyph(r, font, depth) {
    if (depth > 5) throw new Error("slugFont: composite glyph nested more than 5 deep");
    const out = [];
    let flags;
    do {
        flags = r.u16();
        const glyphIndex = r.u16();
        let dx, dy;
        if (flags & ARG_1_AND_2_ARE_WORDS) { dx = r.i16(); dy = r.i16(); }
        else { dx = r.i8(); dy = r.i8(); }
        if (!(flags & ARGS_ARE_XY_VALUES)) { dx = 0; dy = 0; }   // point-matching placement: not supported, treated as no offset

        let a = 1, b = 0, c = 0, d = 1;
        if (flags & WE_HAVE_A_SCALE) { a = d = r.f2dot14(); }
        else if (flags & X_AND_Y_SCALE) { a = r.f2dot14(); d = r.f2dot14(); }
        else if (flags & TWO_BY_TWO) { a = r.f2dot14(); b = r.f2dot14(); c = r.f2dot14(); d = r.f2dot14(); }

        const sub = glyphContours(font, glyphIndex, depth + 1);
        for (const contour of sub) {
            const moved = contour.map((q) => {
                const o = new Array(6);
                for (let i = 0; i < 6; i += 2) {
                    o[i]     = a * q[i] + c * q[i + 1] + dx;
                    o[i + 1] = b * q[i] + d * q[i + 1] + dy;
                }
                return o;
            });
            out.push(moved);
        }
    } while (flags & MORE_COMPONENTS);
    return out;
}

/** Contours for one glyph index, in FONT UNITS. Empty array for blank glyphs (space). */
export function glyphContours(font, glyphIndex, depth = 0) {
    if (glyphIndex < 0 || glyphIndex >= font.numGlyphs) return [];
    const start = font.loca[glyphIndex], end = font.loca[glyphIndex + 1];
    if (end <= start) return [];                                   // zero-length: legitimately blank

    const r = reader(font.bytes);
    r.at(font.tables.glyf.offset + start);
    const numContours = r.i16();
    r.pos += 8;                                                    // xMin, yMin, xMax, yMax -- recomputed, never trusted
    return numContours >= 0 ? parseSimpleGlyph(r, numContours) : parseCompositeGlyph(r, font, depth);
}

/* ------------------------------------------------------------------------------------------------------------
 * cmap
 * --------------------------------------------------------------------------------------------------------- */

function parseCmap(bytes, offset) {
    const r = reader(bytes);
    r.at(offset);
    r.u16();                                    // version
    const numTables = r.u16();

    let best = null, bestScore = -1;
    for (let i = 0; i < numTables; i++) {
        const platform = r.u16(), encoding = r.u16(), sub = r.u32();
        // Preference: full Unicode (3,10) > BMP (3,1) > Unicode platform (0,*) > Mac Roman (1,0)
        const score = (platform === 3 && encoding === 10) ? 4
                    : (platform === 3 && encoding === 1) ? 3
                    : (platform === 0) ? 2
                    : (platform === 1 && encoding === 0) ? 1 : 0;
        if (score > bestScore) { bestScore = score; best = offset + sub; }
    }
    if (best === null) return new Map();

    const map = new Map();
    r.at(best);
    const format = r.u16();

    if (format === 4) {
        r.u16(); r.u16();                       // length, language
        const segX2 = r.u16(), seg = segX2 >> 1;
        r.pos += 6;                             // searchRange, entrySelector, rangeShift
        const endCode = [], startCode = [], idDelta = [], idRangeOffset = [], idRangeAddr = [];
        for (let i = 0; i < seg; i++) endCode.push(r.u16());
        r.u16();                                // reservedPad
        for (let i = 0; i < seg; i++) startCode.push(r.u16());
        for (let i = 0; i < seg; i++) idDelta.push(r.i16());
        for (let i = 0; i < seg; i++) { idRangeAddr.push(r.pos); idRangeOffset.push(r.u16()); }
        for (let i = 0; i < seg; i++) {
            for (let c = startCode[i]; c <= endCode[i] && c !== 0xFFFF; c++) {
                let g;
                if (idRangeOffset[i] === 0) g = (c + idDelta[i]) & 0xFFFF;
                else {
                    const addr = idRangeAddr[i] + idRangeOffset[i] + (c - startCode[i]) * 2;
                    const rr = reader(bytes); rr.at(addr);
                    g = rr.u16();
                    if (g !== 0) g = (g + idDelta[i]) & 0xFFFF;
                }
                if (g) map.set(c, g);
            }
        }
    } else if (format === 12) {
        r.u16(); r.u32(); r.u32();              // reserved, length, language
        const nGroups = r.u32();
        for (let i = 0; i < nGroups; i++) {
            const s = r.u32(), e = r.u32(), g = r.u32();
            for (let c = s; c <= e; c++) map.set(c, g + (c - s));
        }
    } else if (format === 6) {
        r.u16(); r.u16();                       // length, language
        const first = r.u16(), count = r.u16();
        for (let i = 0; i < count; i++) { const g = r.u16(); if (g) map.set(first + i, g); }
    } else if (format === 0) {
        r.u16(); r.u16();                       // length, language
        for (let c = 0; c < 256; c++) { const g = r.u8(); if (g) map.set(c, g); }
    }
    return map;
}

/* ------------------------------------------------------------------------------------------------------------
 * kern (legacy format 0 only)
 * --------------------------------------------------------------------------------------------------------- */

function parseKern(bytes, offset) {
    const pairs = new Map();
    try {
        const r = reader(bytes);
        r.at(offset);
        const version = r.u16();
        if (version !== 0) return pairs;                 // Apple's extended kern table: skipped rather than guessed at
        const nTables = r.u16();
        for (let t = 0; t < nTables; t++) {
            r.u16();                                     // subtable version
            const length = r.u16();
            const next = r.pos + length - 4;
            const coverage = r.u16();
            if ((coverage & 0x00FF) === 0x0001 && (coverage & 0xFF00) === 0) {
                const nPairs = r.u16();
                r.pos += 6;                              // searchRange, entrySelector, rangeShift
                for (let i = 0; i < nPairs; i++) {
                    const left = r.u16(), right = r.u16(), value = r.i16();
                    pairs.set((left << 16) | right, value);
                }
            }
            r.at(next);
        }
    } catch (e) { /* a malformed kern table costs kerning, not text */ }
    return pairs;
}

/* ------------------------------------------------------------------------------------------------------------
 * Public entry point
 * --------------------------------------------------------------------------------------------------------- */

/**
 * Parse a TrueType font from bytes (Uint8Array / ArrayBuffer).
 *
 * Returns a font object with:
 *   unitsPerEm, numGlyphs, ascent, descent, lineGap, capHeight (all in em units except unitsPerEm)
 *   glyphIndex(codepoint) -> int
 *   advance(glyphIndex) -> em
 *   kern(leftGlyph, rightGlyph) -> em
 *   outline(glyphIndex) -> { contours, bbox } in EM units
 */
export function parseFont(bytes) {
    const u8 = (bytes instanceof Uint8Array) ? bytes : new Uint8Array(bytes);
    const { tables } = readTableDirectory(u8);

    for (const need of ["head", "maxp", "loca", "glyf"]) {
        if (!tables[need]) throw new Error("slugFont: missing required table '" + need + "'" + (need === "glyf" ? " (CFF-flavoured font?)" : ""));
    }

    const r = reader(u8);

    r.at(tables.head.offset + 18);
    const unitsPerEm = r.u16();
    r.at(tables.head.offset + 50);
    const indexToLocFormat = r.i16();

    r.at(tables.maxp.offset + 4);
    const numGlyphs = r.u16();

    // loca
    const loca = new Uint32Array(numGlyphs + 1);
    r.at(tables.loca.offset);
    if (indexToLocFormat === 0) for (let i = 0; i <= numGlyphs; i++) loca[i] = r.u16() * 2;
    else                        for (let i = 0; i <= numGlyphs; i++) loca[i] = r.u32();

    // hhea / hmtx
    let numberOfHMetrics = 0, ascent = 0, descent = 0, lineGap = 0;
    if (tables.hhea) {
        r.at(tables.hhea.offset + 4);
        ascent = r.i16(); descent = r.i16(); lineGap = r.i16();
        r.at(tables.hhea.offset + 34);
        numberOfHMetrics = r.u16();
    }
    const advances = new Uint16Array(Math.max(numGlyphs, 1));
    if (tables.hmtx && numberOfHMetrics > 0) {
        r.at(tables.hmtx.offset);
        let last = 0;
        for (let i = 0; i < numGlyphs; i++) {
            if (i < numberOfHMetrics) { last = r.u16(); r.i16(); }
            advances[i] = last;
        }
    }

    // OS/2 sCapHeight -- Lengyel's pixel-grid alignment trick needs it. Absent in old fonts; 0 means "unknown".
    let capHeight = 0;
    if (tables["OS/2"] && tables["OS/2"].length >= 90) {
        r.at(tables["OS/2"].offset);
        const version = r.u16();
        if (version >= 2) { r.at(tables["OS/2"].offset + 88); capHeight = r.i16(); }
    }

    const cmap = tables.cmap ? parseCmap(u8, tables.cmap.offset) : new Map();
    const kernPairs = tables.kern ? parseKern(u8, tables.kern.offset) : new Map();

    const font = {
        bytes: u8, tables, unitsPerEm, numGlyphs, loca,
        ascent: ascent / unitsPerEm,
        descent: descent / unitsPerEm,
        lineGap: lineGap / unitsPerEm,
        capHeight: capHeight / unitsPerEm,
        hasKernTable: kernPairs.size > 0,
        hasGPOS: !!tables.GPOS,
        _cmap: cmap, _kern: kernPairs, _advances: advances, _cache: new Map(),

        glyphIndex(codepoint) { return cmap.get(codepoint) || 0; },
        advance(glyphIndex) { return (advances[glyphIndex] || 0) / unitsPerEm; },
        kern(left, right) { const v = kernPairs.get((left << 16) | right); return v ? v / unitsPerEm : 0; },

        /** Outline in EM units, y up, with a bbox computed from the actual curves rather than the font's claim. */
        outline(glyphIndex) {
            const hit = font._cache.get(glyphIndex);
            if (hit) return hit;
            const raw = glyphContours(font, glyphIndex, 0);
            const s = 1 / unitsPerEm;
            const contours = raw.map((c) => c.map((q) => [q[0] * s, q[1] * s, q[2] * s, q[3] * s, q[4] * s, q[5] * s]));
            const out = { contours, bbox: curveBounds(contours) };
            font._cache.set(glyphIndex, out);
            return out;
        }
    };
    return font;
}

/* ------------------------------------------------------------------------------------------------------------
 * Exact quadratic bounds. Not the control hull -- the curve.
 *
 * The control hull is what the SHADER's early-out compares against (it takes max over the three control points),
 * so the sort key in slugAtlas uses the hull. But band MEMBERSHIP wants the tight bound, because a curve whose
 * hull crosses a band while the curve itself does not is pure loop cost in the fragment shader.
 * --------------------------------------------------------------------------------------------------------- */

/** Exact [min, max] of one axis of a quadratic Bézier given its three control values. */
export function quadExtent(a, b, c) {
    let lo = Math.min(a, c), hi = Math.max(a, c);
    const denom = a - 2 * b + c;
    if (Math.abs(denom) > 1e-12) {
        const t = (a - b) / denom;
        if (t > 0 && t < 1) {
            const v = (1 - t) * (1 - t) * a + 2 * t * (1 - t) * b + t * t * c;
            lo = Math.min(lo, v); hi = Math.max(hi, v);
        }
    }
    return [lo, hi];
}

/** Tight bbox { x0, y0, x1, y1 } over a list of contours. Returns a zero box for empty input. */
export function curveBounds(contours) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const contour of contours) {
        for (const q of contour) {
            const ex = quadExtent(q[0], q[2], q[4]), ey = quadExtent(q[1], q[3], q[5]);
            if (ex[0] < x0) x0 = ex[0];
            if (ex[1] > x1) x1 = ex[1];
            if (ey[0] < y0) y0 = ey[0];
            if (ey[1] > y1) y1 = ey[1];
        }
    }
    if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    return { x0, y0, x1, y1 };
}
