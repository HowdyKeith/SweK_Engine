// WebGLEngine/text/slug-selfcheck.mjs -- v3823
//
// Run: node text/slug-selfcheck.mjs
//
// *** THE TREE HAD NO GLYPH RENDERER AT ALL. *** Verified before building rather than assumed: zero hits
// tree-wide for msdf, sdfText, glyph, fontAtlas, bitmapFont and shapeText, and the only "sdf" in the tree is
// physics/render/sdfMarch.mjs, which marches a scalar field and has nothing to do with type. So this is a new
// subsystem and not a fifth copy of one.
//
// FOUR KEYS, AND NOT ONE OF THEM IS THE SHADER GRADING ITSELF:
//
//   1. A WINDING NUMBER FROM FLATTENED LINE SEGMENTS. Slug decides inside-ness by solving quadratics, indexing
//      bands and consulting a 16-entry bit table. The reference route chops every curve into 128 segments and
//      counts ray crossings, which is the DEFINITION of the nonzero fill rule rather than an implementation of
//      it. It has no bands, no texels, no offsets and no root code, so it cannot share a mistake with the thing
//      it grades.
//   2. AREA BY SUPERSAMPLING. Slug's antialiasing is an approximation, not exact area sampling, so "does it
//      match" is the wrong question and "how far off is it" is the right one. 64 subsamples per pixel of the
//      route in key 1 gives the true covered area to compare against.
//   3. A TEST FONT WHOSE OUTLINES ARE KNOWN FROM CONSTRUCTION. Its six glyphs were specified point by point to
//      contain the three TrueType cases that are easy to get wrong, so the expected curves come from the format
//      specification and not from the parser being tested.
//   4. RE-DERIVING THE ROOT CODE. The 0x2E74 table is re-established by solving each curve independently and
//      counting crossings in [0,1), rather than by trusting the constant.
//
// *** AND THE EVALUATOR REFUSES TO WRAP, WHICH IS THE ONLY REASON PLANT 3 BITES. *** slugEval's texelFetch
// returns ZERO outside the texture. An earlier draft indexed the flat array as (y * width + x), so a read past
// the right edge slid onto the next row -- and that wrap silently UNDID the wrong wrap in CalcBandLoc, so a
// shader compiled for the wrong kLogBandTextureWidth scored a perfect 0/9600 here and would have shipped garbage
// to the first device reporting MAX_TEXTURE_SIZE 2048, which is all WebGL2 guarantees. A test harness that is
// more forgiving than the hardware is worse than no test harness, because it certifies the bug.
//
// *** THE PLANT THAT ISN'T HERE, AND WHY IT ISN'T. *** This file used to plant "sort each band by the tight
// curve extent instead of the control hull" and assert damage. It measured 0 errors in 7900 samples, and the
// assertion was wrong, not the code: any upper bound on a curve's reach is a safe sort key, so both bounds work.
// The claim was removed from slugAtlas.js rather than the measurement being explained away. What DOES break the
// early-out is the sort DIRECTION and the sort AXIS, and those are plants 1 and 2 below.
"use strict";
import { parseFont, contourToCurves, quadExtent } from "./slugFont.js";
import { packAtlas, buildGlyph, assignBands, flattenContours, toHalf, fromHalf, packGlyphLoc, packGlyphFlags, BAND_EPSILON } from "./slugAtlas.js";
import { slugRender, calcRootCode, solveHorizPoly, flattenToSegments, windingNumber, distanceToSegments, texelFetchBand } from "./slugEval.js";
import { slugShaderSource, VERTEX_LAYOUT, VERTEX_STRIDE } from "./slugShader.js";
import { layoutText, buildVertices, orthoRows, snapSizeToCapHeight } from "./slugText.js";
import { testFontBytes } from "./slugTestFont.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ------------------------------------------------------------------------------------------------------------
 * The test font. Six glyphs, specified point by point rather than drawn, so that every expectation below is a
 * restatement of the TrueType specification and not of this parser.
 *
 *   A "tri"       three on-curve points                      -> three straight lines
 *   B "offstart"  contour BEGINS on an off-curve point
 *   C "twooff"    two adjacent off-curve points              -> one implied on-curve midpoint
 *   D "alloff"    EVERY point off-curve                      -> every on-curve point implied
 *   E "comp"      composite: "tri" at half scale, offset (200, 150)
 *   F "ring"      square annulus, outer CCW and inner CW     -> nonzero fill with a hole
 *
 * unitsPerEm 1024, sCapHeight 700, and a legacy `kern` table carrying A/B = -80 and B/C = +40.
 * --------------------------------------------------------------------------------------------------------- */


const FONT_BYTES = testFontBytes();          // v4457 -- the bytes moved to text/slugTestFont.mjs; see its header
const font = parseFont(FONT_BYTES);
const U = font.unitsPerEm;
const gid = (ch) => font.glyphIndex(ch.codePointAt(0));
const outlineOf = (ch) => font.outline(gid(ch));
/** Outline in font units, for comparing against integers rather than against 0.09765625. */
const unitsOf = (ch) => outlineOf(ch).contours.map((c) => c.map((q) => q.map((v) => Math.round(v * U * 1e6) / 1e6)));

/* ============================================================================================================
 * 1. THE ROOT CODE, RE-DERIVED RATHER THAN TRUSTED
 * ========================================================================================================= */
{
    // The independent route. Solve a t^2 - 2b t + c = 0 for the sample-relative y polynomial, keep the roots in
    // [0, 1), and count each crossing by the direction the curve is travelling through the ray. Nothing here
    // knows that a 16-bit table exists.
    function crossingsByHand(p1, p2, p3) {
        const a = p1[1] - 2 * p2[1] + p3[1], b = p1[1] - p2[1], c = p1[1];
        const yAt = (t) => (1 - t) * (1 - t) * p1[1] + 2 * t * (1 - t) * p2[1] + t * t * p3[1];
        const xAt = (t) => (1 - t) * (1 - t) * p1[0] + 2 * t * (1 - t) * p2[0] + t * t * p3[0];
        const dyAt = (t) => 2 * ((1 - t) * (p2[1] - p1[1]) + t * (p3[1] - p2[1]));

        let roots = [];
        if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) roots = [c / (2 * b)]; }
        else {
            const disc = b * b - a * c;
            if (disc >= 0) { const d = Math.sqrt(disc); roots = [(b - d) / a, (b + d) / a]; }
        }
        let total = 0;
        for (const t of roots) {
            if (!(t >= 0 && t < 1)) continue;
            if (Math.abs(yAt(t)) > 1e-9) continue;                 // a root the formula found but the curve does not have
            if (xAt(t) <= 0) continue;                             // the ray travels in +x only
            total += dyAt(t) > 0 ? 1 : -1;
        }
        return total;
    }

    // What Slug computes, in the sharp limit: pixelsPerEm enormous, so saturate(r + 0.5) is a step function and
    // the sum is a crossing count rather than a coverage.
    function crossingsBySlug(p1, p2, p3) {
        const HUGE = 1e9;
        const code = calcRootCode(p1[1], p2[1], p3[1]);
        if (code === 0) return 0;
        const r = solveHorizPoly(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
        let cov = 0;
        const sat = (v) => (v < 0 ? 0 : (v > 1 ? 1 : v));
        if ((code & 1) !== 0) cov += sat(r[0] * HUGE + 0.5);
        if (code > 1) cov -= sat(r[1] * HUGE + 0.5);
        return cov;
    }

    let seen = new Set(), tested = 0, disagree = 0, worst = null;
    let rnd = 12345;
    const rand = () => { rnd = (rnd * 1103515245 + 12345) & 0x7FFFFFFF; return rnd / 0x7FFFFFFF; };

    for (let i = 0; i < 200000; i++) {
        const p1 = [rand() * 2 - 1, rand() * 2 - 1];
        const p2 = [rand() * 2 - 1, rand() * 2 - 1];
        const p3 = [rand() * 2 - 1, rand() * 2 - 1];
        // Stay off the degenerate cases the sharp limit cannot represent: a crossing exactly on the ray origin.
        if (Math.min(Math.abs(p1[1]), Math.abs(p2[1]), Math.abs(p3[1])) < 1e-4) continue;
        if (Math.abs(p1[0]) < 1e-4 || Math.abs(p3[0]) < 1e-4) continue;

        const sign = ((p1[1] < 0) ? 1 : 0) | ((p2[1] < 0) ? 2 : 0) | ((p3[1] < 0) ? 4 : 0);
        seen.add(sign);
        const mine = crossingsByHand(p1, p2, p3);
        const slug = -crossingsBySlug(p1, p2, p3);       // Slug's first root adds; the hand count's convention is opposite
        tested++;
        if (Math.abs(mine - slug) > 1e-6) { disagree++; if (!worst) worst = { p1, p2, p3, mine, slug, sign }; }
    }

    say(`${tested} random quadratics, all 8 sign configurations reached (${seen.size}/8), crossing counts compared`);
    ok("!! *** THE 0x2E74 TABLE FALLS OUT OF AN INDEPENDENT CROSSING COUNT, ON EVERY CURVE ***",
       disagree === 0 && seen.size === 8 && tested > 100000,
       "*** THE TABLE IS NOT A LOOKUP OF 'DOES A ROOT EXIST' -- for the (+,-,+) class it marks BOTH roots eligible even when the curve never reaches the ray, and the two contributions then cancel because the clamped discriminant collapses them onto one point. That is the part a reader reimplementing this would get wrong, and it is the part this key covers: the hand count solves the quadratic and filters t to [0,1) with no table at all, so agreement across 200k curves is agreement between two different ideas rather than one idea checked twice. ***");

    ok("...and the eligibility depends on the sign bits ALONE, which is the table's whole premise",
       (() => {
           for (let s = 0; s < 8; s++) {
               const y = [(s & 1) ? -1 : 1, (s & 2) ? -1 : 1, (s & 4) ? -1 : 1];
               const a = calcRootCode(y[0] * 0.3, y[1] * 0.7, y[2] * 0.1);
               const b = calcRootCode(y[0] * 91.0, y[1] * 0.002, y[2] * 4.0);
               if (a !== b) return false;
           }
           return true;
       })(),
       "Magnitudes vary by five orders of magnitude across the pair; only the signs are held. If the code ever read anything but the sign bits, the shader's asuint shifts would be reading exponent bits by accident.");

    ok("...and negative zero counts as negative, which `y < 0.0` would not",
       calcRootCode(-0, 1, 1) === calcRootCode(-0.001, 1, 1) && calcRootCode(-0, 1, 1) !== calcRootCode(0, 1, 1),
       "asuint(-0.0) >> 31 is 1. A curve endpoint landing exactly on the ray at -0.0 is rare and entirely possible on axis-aligned stems, and the two spellings disagree there.");
}

/* ============================================================================================================
 * 2. THE PARSER, ON THE THREE CASES THAT ARE EASY TO GET WRONG
 * ========================================================================================================= */
{
    ok("font header read: 1024 upm, 7 glyphs, cap height 700, legacy kern present",
       U === 1024 && font.numGlyphs === 7 && Math.round(font.capHeight * U) === 700 && font.hasKernTable === true);

    const A = unitsOf("A");
    ok("all-on-curve contour becomes straight lines encoded as {p1, p2, p2}",
       A.length === 1 && A[0].length === 3 && A[0].every((q) => q[2] === q[4] && q[3] === q[5]),
       "Lengyel's README asks for the duplicated endpoint specifically: it makes the quadratic's a coefficient EXACTLY zero, which is the case the shader's abs(a) < 1/65536 branch handles. A midpoint control is the same curve with a merely tiny a, and tiny is worse than zero when you are about to take a reciprocal.");

    const B = unitsOf("B");
    ok("!! contour BEGINNING on an off-curve point starts from the first on-curve point instead",
       B.length === 1 && B[0].length === 2 &&
       B[0][0].join() === [100, 100, 900, 100, 900, 100].join() &&
       B[0][1].join() === [900, 100, 500, 900, 100, 100].join(),
       "The stored points are OFF(500,900), ON(100,100), ON(900,100). Beginning the walk at index 0 regardless -- the obvious loop -- produces a contour that starts at a point which is not on the curve, and the glyph acquires a spur nobody can explain.");

    const C = unitsOf("C");
    ok("!! two adjacent off-curve points imply an on-curve point at their midpoint",
       C.length === 1 && C[0].length === 3 &&
       C[0][0][4] === 500 && C[0][0][5] === 900 && C[0][1][0] === 500 && C[0][1][1] === 900,
       "(300,900) and (700,900) are both off-curve, so (500,900) exists in the outline and appears in no byte of the file. Miss it and the two curves join through whichever control point came second, which shortens the glyph by a visible amount at display sizes.");

    const D = unitsOf("D");
    const midpointsOK = D[0].every((q, i) => {
        const next = D[0][(i + 1) % D[0].length];
        return q[4] === next[0] && q[5] === next[1];
    });
    ok("!! an ENTIRELY off-curve contour yields four curves, closed, with every endpoint a midpoint",
       D.length === 1 && D[0].length === 4 && midpointsOK &&
       D[0][0][0] === 318 && D[0][0][1] === 706,
       "Four control points and not one stored on-curve point: the start is synthesised at the midpoint of the last and first. This is how circles are drawn in many fonts, so getting it wrong is not an edge case, it is every 'o'.");

    const E = unitsOf("E");
    ok("composite glyph applies the component's 2x2 scale AND its offset, in that order",
       E.length === 1 && E[0].length === 3 &&
       E[0][0][0] === 250 && E[0][0][1] === 150 && E[0][1][2] === 450 && E[0][1][3] === 550,
       "'comp' references 'tri' at scale 0.5 with offset (200,150), so tri's (100,0) must land at (250,150). Applying the offset before the scale gives (150,75) and a glyph that is merely somewhere else, which is easy to mistake for a layout bug.");

    ok("...and the composite's own advance is used, not the component's",
       Math.round(font.advance(gid("E")) * U) === 700 && Math.round(font.advance(gid("A")) * U) === 1000);

    const ring = unitsOf("F");
    ok("a two-contour glyph keeps both contours and their opposite windings",
       ring.length === 2 && ring[0].length === 4 && ring[1].length === 4 &&
       signedArea(ring[0]) * signedArea(ring[1]) < 0,
       "Outer counter-clockwise and inner clockwise is what makes the nonzero rule cut a hole. Both the same way round and the annulus fills solid.");

    // Points that duplicate their predecessor produce zero-length curves. They are harmless to the shader (three
    // identical y signs, root code 0) but they occupy a texel, a band slot and a loop iteration in every band
    // they touch, which is why slugFont drops them.
    const withDup = contourToCurves([{ x: 0, y: 0, on: true }, { x: 10, y: 0, on: true }, { x: 10, y: 10, on: true }, { x: 0, y: 0, on: true }]);
    ok("an explicit duplicate closing point does not become a zero-length curve",
       withDup.length === 3 && withDup.every((q) => !(q[0] === q[4] && q[1] === q[5])),
       "IBM Plex stores one on '(' and on ','. Kept, they cost a texel and an iteration each and buy nothing.");
}

function signedArea(curves) {
    // Exact area of a closed quadratic contour, by Green's theorem. Used only to compare two windings.
    let a = 0;
    for (const [x1, y1, x2, y2, x3, y3] of curves) {
        a += (x1 * (2 * y2 + y3) - y1 * (2 * x2 + x3) + 2 * (x2 * y3 - y2 * x3)) / 6;
    }
    return a;
}

/* ============================================================================================================
 * 3. HALF FLOATS -- the curve texture's storage, and the only lossy step in the pipeline
 * ========================================================================================================= */
{
    let worst = 0, worstAt = 0;
    for (let i = 0; i <= 40000; i++) {
        const v = -1 + (i / 40000) * 3;                 // em coordinates live in roughly [-1, 2]
        const back = fromHalf(toHalf(v));
        const err = Math.abs(back - v);
        if (err > worst) { worst = err; worstAt = v; }
    }
    say(`half-float round trip over em range [-1, 2]: worst absolute error ${worst.toExponential(3)} em at ${worstAt.toFixed(4)}`);
    ok("RGBA16F storage holds em coordinates to better than 1/1000 em",
       worst < 1e-3,
       "At a 64 px em that is 0.06 px of control-point error, which is why Slug specifies 16F and why the atlas can also be built at 32F when a test needs to tell a packing bug apart from a rounding artefact.");

    ok("...rounding is to nearest even, and exact halves do not drift upward",
       fromHalf(toHalf(1)) === 1 && fromHalf(toHalf(0.5)) === 0.5 && fromHalf(toHalf(0)) === 0 &&
       fromHalf(toHalf(-0.25)) === -0.25 && Object.is(fromHalf(toHalf(-0)), -0),
       "Negative zero surviving the round trip matters: section 1 showed the root code reads its sign.");

    ok("...and a mantissa that rounds up out of its field carries into the exponent",
       fromHalf(toHalf(2047.9)) === 2048 && fromHalf(toHalf(65519)) === 65504,
       "2047.9 has to become 2048 by carrying, not by staying at the top of the smaller exponent. Writing the carry by hand and missing this turns the largest value in each binade into the wrong one.");

    ok("...and the overflow boundary is the round-to-even tie, not the largest finite value",
       fromHalf(toHalf(65519)) === 65504 && fromHalf(toHalf(65520)) === Infinity,
       "65520 sits exactly halfway between 65504 and 65536, so round-to-nearest-even takes it UP and out to infinity. Clamping to 65504 instead -- the intuitive reading of 'largest half' -- is a different function from IEEE 754, and em coordinates never reach here anyway, which is exactly why it would go unnoticed if the encoder were reused for anything else.");
}

/* ============================================================================================================
 * 4. THE ADDRESSING RULES, ASSERTED ON A PACKED ATLAS BIG ENOUGH TO FORCE ROW CROSSINGS
 *
 * A small atlas never leaves its first row and so never exercises the rules that matter. This one is packed at a
 * width of 64 so that every glyph crosses rows, which is the geometry the real 4096-wide case only reaches after
 * a few hundred glyphs.
 * ========================================================================================================= */
{
    const chars = "ABCDEF";
    const list = chars.split("").map((ch) => ({ key: ch, contours: outlineOf(ch).contours }));
    const narrow = packAtlas(list, { logWidth: 6, format: "32f" });      // 64 texels wide
    const width = narrow.width;

    say(`narrow atlas: ${width} wide, ${narrow.curveTexels} curve rows, ${narrow.bandTexels} band rows`);

    let headerSpills = 0, listSpills = 0, offsetOverflow = 0, contourSpills = 0;
    for (const ch of chars) {
        const e = narrow.glyphs.get(ch);
        if (e.empty) continue;
        const H = e.bandMax[1] + 1, V = e.bandMax[0] + 1;

        // Rule 1: the H + V header texels are read with a fixed y, so they must fit in the row.
        if (e.loc[0] + H + V > width) headerSpills++;

        // Rules 2 and 3: each list's start is located with the wrap, but the list itself is read without it.
        for (let i = 0; i < H + V; i++) {
            const rec = texelFetchBand(narrow, e.loc[0] + i, e.loc[1]);
            const count = rec[0], offset = rec[1];
            if (count === 0) continue;
            if (offset > 0xFFFF) offsetOverflow++;
            const lin = e.loc[1] * width + e.loc[0] + offset;
            if ((lin % width) + count > width) listSpills++;
        }
    }

    // Rule 4: a contour's texels are consecutive and its p3 is read at curveLoc.x + 1 without wrapping, so no
    // contour may straddle a row.
    for (const ch of chars) {
        const e = narrow.glyphs.get(ch);
        if (e.empty) continue;
        const H = e.bandMax[1] + 1, V = e.bandMax[0] + 1;
        for (let i = 0; i < H + V; i++) {
            const rec = texelFetchBand(narrow, e.loc[0] + i, e.loc[1]);
            const lin = e.loc[1] * width + e.loc[0] + rec[1];
            const bx = lin % width, by = (lin - bx) / width;
            for (let k = 0; k < rec[0]; k++) {
                const cl = texelFetchBand(narrow, bx + k, by);
                if (cl[0] + 1 >= width) contourSpills++;            // p3 would wrap onto the next row
            }
        }
    }

    ok("!! *** NO GLYPH HEADER, BAND LIST OR CURVE PAIR CROSSES A TEXTURE ROW, AT A WIDTH THAT FORCES THE ISSUE ***",
       headerSpills === 0 && listSpills === 0 && contourSpills === 0 && offsetOverflow === 0,
       `header spills ${headerSpills}, list spills ${listSpills}, curve-pair spills ${contourSpills}, offsets over 16 bits ${offsetOverflow}. *** ONLY THE LIST START WRAPS. CalcBandLoc carries overflow into y; the three loops that walk from it do not, they just add to x. So a spill does not read garbage -- it reads a DIFFERENT GLYPH'S data, which renders as a plausible wrong letter rather than as noise, and at a 4096 width it would first appear once an atlas grew past a few hundred glyphs. ***`);

    // The layout's own arithmetic, checked against the shader's, at a width where they differ.
    const e = narrow.glyphs.get("F");
    const H = e.bandMax[1] + 1;
    const vrec = texelFetchBand(narrow, e.loc[0] + H, e.loc[1]);        // first vertical band header
    ok("the vertical band header sits immediately after all the horizontal ones",
       vrec[0] > 0,
       "The shader finds it at glyphLoc.x + bandMax.y + 1 + bandIndex.x. Reserving the two header blocks in the other order is invisible on a square glyph, where H happens to equal V.");

    ok("packGlyphLoc and packGlyphFlags produce the words the shader unpacks",
       (() => {
           const loc = packGlyphLoc(4095, 273);
           const flg = packGlyphFlags(11, 200, true);
           // SlugUnpack: ivec4(x & 0xFFFF, x >> 16, y & 0xFFFF, y >> 16)
           const g = [loc & 0xFFFF, loc >>> 16, flg & 0xFFFF, flg >>> 16];
           return g[0] === 4095 && g[1] === 273 && g[2] === 11 && ((g[3] & 0x00FF) === 200) && ((g[3] & 0x1000) !== 0);
       })(),
       "Band max y arrives in the HIGH word and is masked to 8 bits by the shader, while band max x arrives in the low word unmasked. Packing them symmetrically -- the natural thing to write -- puts band max y where the shader will read the even-odd flag out of it.");

    ok("...and a band count past the 8-bit field is refused rather than truncated",
       (() => { try { packGlyphFlags(0, 256); return false; } catch (err) { return true; } })(),
       "A truncated band max reads the wrong header texel. That is a glyph that is subtly wrong, which costs more to find than a glyph that is obviously missing.");
}

/* ============================================================================================================
 * 5. COVERAGE AGAINST AN INDEPENDENT WINDING NUMBER
 *
 * The shader transliteration in slugEval reads the REAL packed Uint16Array through a texelFetch that includes
 * CalcBandLoc's wrap, so this is the addressing and the arithmetic together. The route it is graded against
 * flattens the same outline into segments and counts crossings.
 * ========================================================================================================= */
const REAL_TEXT = "ABCDEF";
{
    const list = REAL_TEXT.split("").map((ch) => ({ key: ch, contours: outlineOf(ch).contours }));
    const atlas = packAtlas(list, { format: "32f" });
    atlas.oob = { curve: 0, band: 0 };            // slugEval counts reads that fall outside either texture
    const TINY = [1e-7, 1e-7];

    let total = 0, bad = 0, skipped = 0, iterSum = 0, iterMax = 0, curveSum = 0;
    for (const ch of REAL_TEXT) {
        const e = atlas.glyphs.get(ch);
        if (e.empty) continue;
        const segs = flattenToSegments(outlineOf(ch).contours, 128);
        const stats = {};
        for (let iy = 0; iy < 61; iy++) for (let ix = 0; ix < 61; ix++) {
            const x = e.bbox.x0 + (e.bbox.x1 - e.bbox.x0) * (ix + 0.5) / 61;
            const y = e.bbox.y0 + (e.bbox.y1 - e.bbox.y0) * (iy + 0.5) / 61;
            // The comparison is only meaningful away from the boundary: at the boundary Slug is antialiasing and
            // the winding number is a step, and they SHOULD differ.
            if (distanceToSegments(segs, x, y) < 2e-3) { skipped++; continue; }
            const cov = slugRender(atlas, e, x, y, TINY, {}, stats);
            total++;
            if (Math.abs(cov - (windingNumber(segs, x, y) !== 0 ? 1 : 0)) > 1e-3) bad++;
        }
        iterSum += stats.hIter + stats.vIter;
        iterMax = Math.max(iterMax, stats.maxIter);
        curveSum += e.curveCount * 2 * stats.samples;
    }

    say(`${total} interior samples over ${REAL_TEXT.length} glyphs, ${skipped} skipped within 0.002 em of an edge`);
    ok("!! *** NOT ONE TEXEL FETCH FELL OUTSIDE EITHER TEXTURE, ACROSS EVERY SAMPLE ***",
       atlas.oob.curve === 0 && atlas.oob.band === 0,
       `curve ${atlas.oob.curve}, band ${atlas.oob.band}. slugEval returns ZERO outside the texture rather than sliding onto the next row, which is what the hardware does and what an earlier draft of it did not. A correct atlas never makes such a read at all, so counting them is a stronger statement than checking the pixels they would have produced: an addressing bug that happened to land on plausible data would still show up here.`);

    ok("!! *** SLUG'S COVERAGE IS THE NONZERO WINDING NUMBER, AT EVERY SAMPLE, READ OUT OF THE REAL TEXTURES ***",
       bad === 0 && total > 15000,
       `${bad} disagreements. *** THE GRADER HAS NO BANDS, NO OFFSETS, NO TEXELS AND NO ROOT CODE: it chops each curve into 128 segments and counts ray crossings, which is the definition of the fill rule rather than an implementation of it. So this covers the packing and the arithmetic AT ONCE -- a band list pointed one texel wide would leave the winding number untouched and break this immediately. ***`);

    say(`banding cost on the test font: ${(iterSum / total).toFixed(2)} curve tests per sample against ${(curveSum / total).toFixed(1)} unbanded, worst band ${iterMax} curves`);

    // The test font cannot answer the question. Its heaviest glyph has eight curves, and eight curves need no
    // index -- a band structure over them is overhead with a shader attached. The claim is only meaningful on a
    // glyph with enough curves to sort, so it is measured on one.
    {
        const heavy = [[20, 0.30, 0.48], [48, 0.30, 0.48]].map(([n, r, R]) => {
            const contours = rosette(n, r, R);
            const a = packAtlas([{ key: "X", contours }], { format: "32f" });
            const e = a.glyphs.get("X");
            const stats = {};
            for (let iy = 0; iy < 60; iy++) for (let ix = 0; ix < 60; ix++) slugRender(a, e, (ix + 0.5) / 60, (iy + 0.5) / 60, [1 / 32, 1 / 32], {}, stats);
            const per = (stats.hIter + stats.vIter) / stats.samples;
            return { n, curves: e.curveCount, bands: (e.bandMax[0] + 1) + "x" + (e.bandMax[1] + 1), per, unbanded: e.curveCount * 2 };
        });
        for (const h of heavy) say(`  ${h.curves} curves in ${h.bands} bands: ${h.per.toFixed(2)} tests/sample against ${h.unbanded} unbanded, ${(h.unbanded / h.per).toFixed(1)}x`);
        ok("!! the bands are earning their place, on glyphs heavy enough for the question to mean anything",
           heavy.every((h) => h.unbanded / h.per > 4),
           "The comparison is against testing every curve twice, which is what the algorithm degenerates to at one band per axis. Below roughly a dozen curves the index costs more than it saves, which is why this is asserted on a rosette and merely reported on the test font -- an assertion that only holds on the easy case is an assertion about the case, not the code.");
    }

    // The ring is the case the nonzero rule exists for.
    {
        const e = atlas.glyphs.get("F");
        const cov = (x, y) => slugRender(atlas, e, x / U, y / U, TINY);
        ok("the annulus has a hole in it, and the hole is where the inner contour is",
           cov(200, 500) > 0.99 && cov(500, 500) < 0.01 && cov(800, 500) > 0.99,
           "Between the contours is ink, inside the inner contour is not. If the inner contour's winding were read the same way round as the outer, the middle sample would read solid and the glyph would be a filled square.");
    }
}

/* ============================================================================================================
 * 6. ANTIALIASING: THE COVERAGE IS AN AREA, TO WITHIN WHAT THE APPROXIMATION ALLOWS
 * ========================================================================================================= */
{
    const list = ["D", "F"].map((ch) => ({ key: ch, contours: outlineOf(ch).contours }));
    const atlas = packAtlas(list, { format: "32f" });
    const PX = 24;                                          // a 24 px em: small enough that antialiasing dominates
    const emsPerPixel = [1 / PX, 1 / PX];

    for (const ch of ["D", "F"]) {
        const e = atlas.glyphs.get(ch);
        const segs = flattenToSegments(outlineOf(ch).contours, 256);
        let sumSlug = 0, sumTrue = 0, sumAbs = 0, n = 0, worst = 0;

        // Walk whole pixels across the glyph, one Slug sample at each pixel centre against 8x8 subsamples of the
        // independent route in the same pixel.
        const x0 = Math.floor(e.bbox.x0 * PX) - 1, x1 = Math.ceil(e.bbox.x1 * PX) + 1;
        const y0 = Math.floor(e.bbox.y0 * PX) - 1, y1 = Math.ceil(e.bbox.y1 * PX) + 1;
        for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
            const cx = (px + 0.5) / PX, cy = (py + 0.5) / PX;
            const cov = slugRender(atlas, e, cx, cy, emsPerPixel);
            let inside = 0;
            for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) {
                const ux = (px + (sx + 0.5) / 8) / PX, uy = (py + (sy + 0.5) / 8) / PX;
                if (windingNumber(segs, ux, uy) !== 0) inside++;
            }
            const truth = inside / 64;
            sumSlug += cov; sumTrue += truth; sumAbs += Math.abs(cov - truth);
            worst = Math.max(worst, Math.abs(cov - truth));
            n++;
        }

        const inkErr = Math.abs(sumSlug - sumTrue) / sumTrue;
        say(`'${ch}' at ${PX} px em: ${n} pixels, total ink off by ${(inkErr * 100).toFixed(2)}%, mean |error| ${(sumAbs / n).toFixed(4)}, worst pixel ${worst.toFixed(3)}`);
        ok(`'${ch}' antialiased coverage carries the right amount of ink`,
           inkErr < 0.02 && sumAbs / n < 0.02,
           "Slug is not an exact area sampler and is not trying to be -- it estimates coverage from where two rays cross the outline -- so the question is how far off, not whether. Total ink is the number the eye reads as weight: a systematic error here is a font that renders too light or too heavy at small sizes, which is the failure that made everyone use hinting.");
    }
}

/* ============================================================================================================
 * 7. WINDING DIRECTION IS GENUINELY IRRELEVANT, WHICH IS A CLAIM ABOUT ONE abs()
 * ========================================================================================================= */
{
    const reversed = (contours) => contours.map((c) => c.slice().reverse().map((q) => [q[4], q[5], q[2], q[3], q[0], q[1]]));

    const normal = packAtlas([{ key: "F", contours: outlineOf("F").contours }], { format: "32f" });
    const flipped = packAtlas([{ key: "F", contours: reversed(outlineOf("F").contours) }], { format: "32f" });
    const a = normal.glyphs.get("F"), b = flipped.glyphs.get("F");

    let worst = 0;
    for (let iy = 0; iy < 40; iy++) for (let ix = 0; ix < 40; ix++) {
        const x = a.bbox.x0 + (a.bbox.x1 - a.bbox.x0) * (ix + 0.5) / 40;
        const y = a.bbox.y0 + (a.bbox.y1 - a.bbox.y0) * (iy + 0.5) / 40;
        worst = Math.max(worst, Math.abs(slugRender(normal, a, x, y, [1 / 32, 1 / 32]) - slugRender(flipped, b, x, y, [1 / 32, 1 / 32])));
    }
    ok("reversing every contour changes nothing, including at antialiased edges",
       worst < 1e-6,
       `worst difference ${worst.toExponential(2)}. CalcCoverage takes an absolute value before clamping, which is the only reason a font authored with either winding convention renders at all. Dropping that abs() looks like dropping a redundancy and turns half the fonts in the world inside out.`);
}

/* ============================================================================================================
 * 8. THE PLANTS
 *
 * Each one is a change a careful reader would sign off on. That is the point of them.
 *
 * They are run against a ROSETTE rather than against a letter of the test font, and the reason is a finding in
 * itself: on the font's six glyphs -- a triangle, a diamond, a square annulus -- every plant below scores ZERO.
 * Straight edges and four-curve outlines are too easy. The rosette puts twenty curves with heavy control-point
 * overshoot into fifteen bands per axis, which is the regime a real lowercase 'g' lives in, and it is the regime
 * where the early-out has enough curves in a band to get the order wrong.
 * ========================================================================================================= */

/** A closed contour of `n` quadratics with on-curve points on radius r and controls thrown out to radius R. */
function rosette(n, r, R, cx = 0.5, cy = 0.5) {
    const pts = [];
    for (let k = 0; k < n; k++) {
        const a = 2 * Math.PI * k / n, b = 2 * Math.PI * (k + 0.5) / n;
        pts.push({ on: [cx + r * Math.cos(a), cy + r * Math.sin(a)], ctrl: [cx + R * Math.cos(b), cy + R * Math.sin(b)] });
    }
    return [pts.map((p, k) => {
        const A = p.on, C = p.ctrl, B = pts[(k + 1) % n].on;
        return [A[0], A[1], C[0], C[1], B[0], B[1]];
    })];
}

{
    const contours = rosette(20, 0.30, 0.48);
    const segs = flattenToSegments(contours, 256);
    const TINY = [1e-7, 1e-7];
    const base = buildGlyph(contours, {});

    say(`plant subject: ${base.curves.length} curves in ${base.vbands.length}x${base.hbands.length} bands, worst band ${Math.max(...base.hbands.map((b) => b.length))} curves`);

    /** Samples where a patched atlas disagrees with the independent winding number. */
    function damage(built) {
        const atlas = packBuilt(built, "X");
        const e = atlas.glyphs.get("X");
        let bad = 0, n = 0;
        for (let iy = 0; iy < 90; iy++) for (let ix = 0; ix < 90; ix++) {
            const x = (ix + 0.5) / 90, y = (iy + 0.5) / 90;
            if (distanceToSegments(segs, x, y) < 3e-3) continue;
            n++;
            if (Math.abs(slugRender(atlas, e, x, y, TINY) - (windingNumber(segs, x, y) !== 0 ? 1 : 0)) > 1e-3) bad++;
        }
        return { bad, n };
    }

    const clean = damage(base);
    ok("the unplanted rosette is clean, so the plants below are measuring the plant",
       clean.bad === 0 && clean.n > 6000, `${clean.n} samples, ${clean.bad} disagreements`);

    // --- The sort key, which is NOT a plant, kept as a standing assertion --------------------------------------
    {
        const tight = { ...base,
            hbands: base.hbands.map((b) => b.slice().sort((p, q) => q.ext.x[1] - p.ext.x[1])),
            vbands: base.vbands.map((b) => b.slice().sort((p, q) => q.ext.y[1] - p.ext.y[1])) };
        const d = damage(tight);
        ok("sorting bands by the TIGHT curve extent is also safe, which is why it is not a plant",
           d.bad === 0,
           "*** THIS ASSERTION EXISTS BECAUSE AN EARLIER DRAFT CLAIMED THE OPPOSITE AND WAS WRONG. *** Any upper bound on a curve's reach is a legal sort key: a break at D means hull_D is behind the sample, and every later C has reach_C <= key_C <= key_D <= hull_D, so nothing that could contribute is skipped. The control hull is used anyway because it is the quantity the shader's break names, so the two cannot drift apart -- a smaller reason, but a real one, and stated as the small reason it is rather than as a correctness argument it is not.");
    }

    // --- PLANT 1: the lists are not sorted at all ---------------------------------------------------------------
    {
        const planted = { ...base,
            hbands: base.hbands.map((b) => b.slice().sort((p, q) => p.texel - q.texel)),
            vbands: base.vbands.map((b) => b.slice().sort((p, q) => p.texel - q.texel)) };
        const d = damage(planted);
        say(`plant 1 (band lists left in contour order): ${d.bad}/${d.n} samples wrong`);
        ok("!! *** LEAVING THE BAND LISTS UNSORTED BREAKS THE EARLY-OUT ***",
           d.bad > 100,
           "*** THE SORT IS NOT AN OPTIMISATION, IT IS THE LOOP'S EXIT CONDITION. *** Contour order is the order the curves were read in, which is the order they would naturally be appended in, and it looks like a list that simply has not been optimised yet. The break then fires on the first curve that happens to lie behind the sample and discards every real contributor after it. The damage is winding numbers that are short by one, which reads as chunks of the glyph missing.");
    }

    // --- PLANT 2: the horizontal bands sorted along the vertical axis -------------------------------------------
    {
        const planted = { ...base,
            hbands: base.hbands.map((b) => b.slice().sort((p, q) => q.hullMaxY - p.hullMaxY)),
            vbands: base.vbands.map((b) => b.slice().sort((p, q) => q.hullMaxX - p.hullMaxX)) };
        const d = damage(planted);
        say(`plant 2 (each band sorted along the other axis): ${d.bad}/${d.n} samples wrong`);
        ok("!! sorting a horizontal band by max Y instead of max X breaks it just as thoroughly",
           d.bad > 100,
           "The two loops in assignBands are near-identical and differ only in which axis is the ray and which is the stack. This is the copy-paste that follows, and it is worse than no sort at all rather than better, because a Y-descending order is actively uncorrelated with the X the break tests. It would survive review: the line reads `sort by max, descending`, which is what the rule says.");
    }

    // --- PLANT 3: the shader compiled for a different atlas width than the pack ---------------------------------
    {
        // A single small glyph never leaves its first row, so the wrap this plant corrupts never happens. Six
        // rosettes at a width of 64 force band lists to start on later rows, which is the geometry a 4096-wide
        // atlas only reaches after a few hundred glyphs.
        const many = [];
        for (let i = 0; i < 6; i++) many.push({ key: "g" + i, contours: rosette(12 + i, 0.30 + 0.01 * i, 0.47) });
        const narrow = packAtlas(many, { logWidth: 6, format: "32f" });

        let wrapping = 0;
        for (const [, e] of narrow.glyphs) {
            const H = e.bandMax[1] + 1, V = e.bandMax[0] + 1;
            for (let i = 0; i < H + V; i++) {
                const rec = texelFetchBand(narrow, e.loc[0] + i, e.loc[1]);
                if (rec[0] > 0 && e.loc[0] + rec[1] >= narrow.width) wrapping++;
            }
        }

        function sweep(atlas) {
            let bad = 0, n = 0;
            for (const [key, e] of atlas.glyphs) {
                const s2 = flattenToSegments(many.find((m) => m.key === key).contours, 128);
                for (let iy = 0; iy < 40; iy++) for (let ix = 0; ix < 40; ix++) {
                    const x = (ix + 0.5) / 40, y = (iy + 0.5) / 40;
                    n++;
                    if (Math.abs(slugRender(atlas, e, x, y, TINY) - (windingNumber(s2, x, y) !== 0 ? 1 : 0)) > 0.5) bad++;
                }
            }
            return { bad, n };
        }

        const right = sweep(narrow);
        const lying = sweep({ ...narrow, logWidth: 7 });
        say(`plant 3: ${wrapping} band lists genuinely wrap to another row; width 64 gives ${right.bad}/${right.n} wrong, width 128 gives ${lying.bad}/${lying.n}`);
        ok("!! *** A kLogBandTextureWidth THAT DISAGREES WITH THE PACKING CORRUPTS EVERY WRAPPED BAND ***",
           right.bad === 0 && lying.bad > 1000 && wrapping > 0,
           "*** THE WIDTH APPEARS IN THE SHADER, IN CalcBandLoc, AND NOWHERE IN THE DATA. *** So the two can disagree with nothing to notice, and they WILL the first time a device reports MAX_TEXTURE_SIZE 2048, which is all WebGL2 guarantees. slugText derives both from one getParameter for exactly this reason. This plant is also the one that only bites because slugEval's texelFetch returns zero outside the texture instead of sliding onto the next row -- with a wrapping evaluator it scored a clean 0/9600.");
    }

    // --- NOT A PLANT: the band overlap epsilon, which could not be shown to matter -----------------------------
    {
        const PX = 28;
        const measure = (eps) => {
            const atlas = packAtlas([{ key: "X", contours }], { format: "32f", epsilon: eps });
            const e = atlas.glyphs.get("X");
            const stats = {};
            let worst = 0, sum = 0, n = 0;
            for (let py = 0; py < PX; py++) for (let px = 0; px < PX; px++) {
                const cov = slugRender(atlas, e, (px + 0.5) / PX, (py + 0.5) / PX, [1 / PX, 1 / PX], {}, stats);
                let ins = 0;
                for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) {
                    if (windingNumber(segs, (px + (sx + 0.5) / 8) / PX, (py + (sy + 0.5) / 8) / PX) !== 0) ins++;
                }
                const err = Math.abs(cov - ins / 64);
                worst = Math.max(worst, err); sum += err; n++;
            }
            return { worst, mean: sum / n, iter: (stats.hIter + stats.vIter) / stats.samples };
        };

        const none = measure(0), spec = measure(BAND_EPSILON), huge = measure(1 / 8);
        say(`band overlap at ${PX} px em: eps 0 -> mean ${none.mean.toFixed(5)} worst ${none.worst.toFixed(4)} at ${none.iter.toFixed(2)} tests/sample`);
        say(`                              eps 1/1024 -> mean ${spec.mean.toFixed(5)} worst ${spec.worst.toFixed(4)} at ${spec.iter.toFixed(2)} tests/sample`);
        say(`                              eps 1/8 -> mean ${huge.mean.toFixed(5)} worst ${huge.worst.toFixed(4)} at ${huge.iter.toFixed(2)} tests/sample`);

        ok("!! *** THE BAND OVERLAP CHANGES NO PIXEL AT ANY SIZE, AND AN OVERSIZED ONE IS PURE COST ***",
           Math.abs(none.mean - spec.mean) < 1e-9 && Math.abs(huge.mean - spec.mean) < 1e-9 && huge.iter > spec.iter * 1.5,
           "*** THE INTUITIVE STORY ABOUT THIS EPSILON IS WRONG AND THE MEASUREMENT SAYS SO. *** The story is that a band needs slack to cover the antialiasing footprint of samples near its edge. It does not: Slug's ray is a LINE, NOT A BOX. Coverage comes from where a crossing lands in x, through saturate(r + 0.5), and nothing about it integrates over y -- so the only curves that can contribute at a sample are those whose y extent contains the sample's y, which is exactly what membership already selects. A three-and-a-half-pixel epsilon moves the error not at all and doubles the inner loop. The README's value is kept because it is cheap and Lengyel asks for it, but it is insurance against float rounding at an exact boundary, not the antialiasing fix it looks like.");

        ok("...and the residual worst-pixel error is the estimator's, not the banding's",
           spec.worst > 0.1 && spec.mean < 0.02,
           `worst ${spec.worst.toFixed(4)}, mean ${spec.mean.toFixed(5)}. Two rays through the pixel centre is not area sampling and was never going to be. Asserting the worst pixel is LARGE is deliberate: if it ever drops near zero, something has quietly started supersampling and the performance argument for this algorithm has gone with it.`);
    }
}

function packBuilt(built, key = "X") {
    // Mirrors packAtlas's single-glyph path closely enough to isolate the change under test.
    const fake = [{ key, contours: [] }];
    const atlas = packAtlas(fake, { format: "32f" });
    const width = atlas.width;
    const curveRows = [], bandRows = [];

    const texelBase = new Array(built.texels.length);
    const runs = [];
    let start = 0;
    for (let i = 1; i <= built.curves.length; i++) {
        if (i === built.curves.length || built.curves[i].texel !== built.curves[i - 1].texel + 1) {
            runs.push([built.curves[start].texel, built.curves[i - 1].texel + 1]); start = i;
        }
    }
    for (const [from, to] of runs) for (let t = from; t <= to; t++) { texelBase[t] = curveRows.length; curveRows.push(built.texels[t]); }

    const H = built.hbands.length, V = built.vbands.length;
    const headerAt = 0;
    for (let i = 0; i < H + V; i++) bandRows.push([0, 0]);
    const emit = (band) => {
        if (band.length === 0) return 0;
        const at = bandRows.length;
        for (const c of band) { const e = texelBase[c.texel]; bandRows.push([e % width, (e - (e % width)) / width]); }
        return at - headerAt;
    };
    for (let i = 0; i < H; i++) bandRows[headerAt + i] = [built.hbands[i].length, emit(built.hbands[i])];
    for (let j = 0; j < V; j++) bandRows[headerAt + H + j] = [built.vbands[j].length, emit(built.vbands[j])];

    const curveTexels = Math.max(1, Math.ceil(curveRows.length / width));
    const bandTexels = Math.max(1, Math.ceil(bandRows.length / width));
    const curveData = new Float32Array(width * curveTexels * 4);
    for (let i = 0; i < curveRows.length; i++) for (let k = 0; k < 4; k++) curveData[i * 4 + k] = curveRows[i][k];
    const bandData = new Uint16Array(width * bandTexels * 2);
    for (let i = 0; i < bandRows.length; i++) { bandData[i * 2] = bandRows[i][0]; bandData[i * 2 + 1] = bandRows[i][1]; }

    const glyphs = new Map();
    glyphs.set(key, { loc: [0, 0], bandMax: [V - 1, H - 1], transform: built.transform, bbox: built.bbox, curveCount: built.curves.length, empty: false });
    return { width, logWidth: atlas.logWidth, format: "32f", curveTexels, bandTexels, curveData, bandData, glyphs };
}

/* ============================================================================================================
 * 9. LAYOUT
 * ========================================================================================================= */
{
    const one = layoutText(font, "AB", { size: 100 });
    // A advances 1000/1024 em; the A/B kern pair is -80/1024 em.
    const expected = (1000 - 80) / 1024 * 100;
    ok("the legacy kern table is applied between the pair, not after it",
       Math.abs(one.glyphs[1].x - expected) < 1e-9,
       `second pen position ${one.glyphs[1].x.toFixed(6)} against ${expected.toFixed(6)}. Applying the kern to the following advance instead shifts everything after the pair as well, which reads as correct on a two-letter test.`);

    ok("...and it is reported as coming from `kern`, so a GPOS-only font is not silently unkerned",
       one.kerningSource === "kern",
       "Most modern fonts kern through GPOS, which this integration does not read. Returning zero and saying so is a different thing from returning zero.");

    const multi = layoutText(font, "AB\nA", { size: 100, align: "center" });
    const lineWidth = (1000 - 80 + 1000) / 1024 * 100;
    ok("centred lines are offset by half the difference in line width",
       multi.lines === 2 && Math.abs(multi.width - lineWidth) < 1e-9 &&
       Math.abs(multi.glyphs[2].x - (lineWidth - 1000 / 1024 * 100) / 2) < 1e-9);

    ok("...and the second line sits one line height BELOW the first, in a y-up space",
       multi.glyphs[2].y < 0 && Math.abs(multi.glyphs[2].y + multi.lineHeight) < 1e-9);

    const spaced = layoutText(font, "AA", { size: 100, letterSpacing: 0.5, kerning: false });
    ok("!! letter spacing after the final glyph is not part of the line width",
       Math.abs(spaced.width - (1000 / 1024 * 100 + 50 + 1000 / 1024 * 100)) < 1e-9,
       "Leaving the trailing space in makes every centred or right-aligned line sit half a letter-space off, which is the sort of thing that gets attributed to the font.");

    // Lengyel's cap-height trick, from the README.
    const snapped = snapSizeToCapHeight(31.4, font, 2);
    ok("snapping the size puts the cap height on a whole number of device pixels",
       Math.abs(snapped * 2 * font.capHeight - Math.round(snapped * 2 * font.capHeight)) < 1e-9 && Math.abs(snapped - 31.4) < 1.5,
       `31.4 px at dpr 2 becomes ${snapped.toFixed(4)}. Slug ignores hinting by design, and this is the compensation the README offers: flat tops and bottoms of capitals land on the pixel grid, so they stop being two grey rows.`);

    ok("...and a font with no sCapHeight gets its size back unchanged rather than a guess",
       snapSizeToCapHeight(31.4, { capHeight: 0 }, 2) === 31.4);

    const empty = layoutText(font, " ", { size: 100 });
    ok("a blank glyph occupies its advance and produces no quad",
       empty.glyphs.length === 1 && empty.width > 0);
}

/* ============================================================================================================
 * 10. THE VERTEX STREAM AND THE SHADER THAT READS IT
 *
 * These two have to agree about six byte offsets, and nothing at runtime will say so if they do not: a stream
 * that is off by eight bytes still draws.
 * ========================================================================================================= */
{
    const src = slugShaderSource(12, {});

    ok("every attribute in the layout table is declared at the same location in the vertex shader",
       VERTEX_LAYOUT.every((a) => new RegExp(`layout\\(location = ${a.location}\\)\\s+in\\s+\\S+\\s+${a.name}\\b`).test(src.vertex)),
       "The layout table drives the VAO setup; the shader source declares the other end. One table, checked against the text that consumes it.");

    ok("...and the layout is gapless and exactly one vertex stride long",
       (() => {
           let at = 0;
           for (const a of VERTEX_LAYOUT) { if (a.offset !== at) return false; at += a.size * 4; }
           return at === VERTEX_STRIDE;
       })(), `${VERTEX_STRIDE} bytes per vertex`);

    ok("the glyph words go through the integer attribute path",
       VERTEX_LAYOUT.find((a) => a.name === "aGlyph").integer === true &&
       /in uvec2 aGlyph/.test(src.vertex),
       "Sent as floats they would be converted and converted back, which mangles any band-texture location above 2^24 -- reachable on a 4096-wide atlas at 4096 rows.");

    ok("the ported fragment shader still carries the constants the algorithm turns on",
       /0x2E74u/.test(src.fragment) && /1\.0 \/ 65536\.0/.test(src.fragment) &&
       /#define kLogBandTextureWidth 12/.test(src.fragment) &&
       /floatBitsToUint/.test(src.fragment),
       "The four things a tidying pass would remove: the truth table, the near-linear threshold, the injected width, and the bit-level sign extraction that is not the same as a comparison against zero.");

    ok("...and the width the shader is compiled for can be changed, because WebGL2 only guarantees 2048",
       /#define kLogBandTextureWidth 11/.test(slugShaderSource(11, {}).fragment));

    ok("the even-odd and optical-weight variants compile in only when asked",
       !/#define SLUG_EVENODD/.test(src.fragment) &&
       /#define SLUG_EVENODD/.test(slugShaderSource(12, { evenOdd: true }).fragment) &&
       !/#define SLUG_WEIGHT/.test(src.fragment) &&
       /#define SLUG_WEIGHT/.test(slugShaderSource(12, { weight: true }).fragment),
       "The reference keeps both #if blocks in the source unconditionally and switches them with a #define, so testing for the bare token would pass on every build. Only the #define line distinguishes them.");

    ok("the fragment shader outputs PREMULTIPLIED colour, which constrains the blend function",
       /fragColor = vColor \* coverage/.test(src.fragment),
       "colour times coverage is premultiplied, so the blend must be (ONE, ONE_MINUS_SRC_ALPHA). Set it to (SRC_ALPHA, ONE_MINUS_SRC_ALPHA) -- the reflex -- and every glyph renders at coverage squared, which reads as text that is too light and gets 'fixed' by making the font bolder.");

    // The vertex stream itself.
    const list = REAL_TEXT.split("").map((ch) => ({ key: gid(ch), contours: outlineOf(ch).contours }));
    const atlas = packAtlas(list, {});
    const laid = layoutText(font, "ADF", { size: 64 });
    const built = buildVertices(laid.glyphs, (g) => atlas.glyphs.get(g), { color: [1, 1, 1, 1] });

    ok("one quad per drawable glyph, four vertices and six indices each",
       built.quadCount === 3 && built.vertexCount === 12 && built.indices.length === 18);

    {
        const f32 = new Float32Array(built.buffer);
        const N = VERTEX_STRIDE / 4;
        const normals = [];
        for (let v = 0; v < 4; v++) normals.push([f32[v * N + 2], f32[v * N + 3]]);
        ok("!! the four corner normals are the outward diagonals, and none of them is zero",
           normals.length === 4 && normals.every((n) => Math.abs(n[0]) === 1 && Math.abs(n[1]) === 1) &&
           new Set(normals.map((n) => n.join())).size === 4,
           "SlugDilate normalizes this vector. A zero normal makes normalize() produce NaN and takes the whole quad with it -- so a degenerate glyph box is dropped in buildVertices rather than allowed to reach the shader.");

        const invS = f32[8];
        ok("the inverse Jacobian is the em-per-object scale, diagonal for an unrotated quad",
           Math.abs(invS - 1 / 64) < 1e-12 && f32[9] === 0 && f32[10] === 0 && Math.abs(f32[11] - 1 / 64) < 1e-12,
           "The dilation converts its object-space push back into em space with this. A wrong Jacobian moves the sample point without moving the vertex, which shows up as an outline that shivers as the camera moves rather than as anything static.");

        // Corner em coordinates must be the glyph's own bbox corners, or the sample point and the geometry
        // disagree about where the glyph is.
        const e = atlas.glyphs.get(gid("A"));
        ok("each corner's em coordinate is the matching corner of the glyph's tight bounding box",
           Math.abs(f32[4] - e.bbox.x0) < 1e-7 && Math.abs(f32[5] - e.bbox.y0) < 1e-7 &&
           Math.abs(f32[1 * N + 4] - e.bbox.x1) < 1e-7 && Math.abs(f32[2 * N + 5] - e.bbox.y1) < 1e-7);
    }

    const rows = orthoRows(800, 600, true);
    // gl_Position.x = p.x * m0.x + p.y * m0.y + m0.w, and likewise for y.
    const project = (x, y) => [x * rows[0] + y * rows[1] + rows[3], x * rows[4] + y * rows[5] + rows[7]];
    ok("orthoRows maps the pixel corners to clip space in the (m.x, m.y, -, m.w) form the shader reads",
       (() => {
           const tl = project(0, 0), br = project(800, 600);
           // The rows are a Float32Array, because that is what reaches glUniform4fv. 2/800 is not
           // representable, so the far corner lands within a float32 epsilon of 1 rather than on it.
           return Math.abs(tl[0] + 1) < 1e-12 && Math.abs(tl[1] - 1) < 1e-12 &&
                  Math.abs(br[0] - 1) < 1e-6 && Math.abs(br[1] + 1) < 1e-6;
       })(),
       "The shader reads rows, uses only columns 0, 1 and 3, and never touches column 2 because the glyph's own z is always zero. That is what lets a 3D placement be folded into the same four rows.");
}

/* ============================================================================================================
 * 11. THE ATLAS AT SCALE -- the numbers a caller has to budget for
 * ========================================================================================================= */
{
    const chars = REAL_TEXT;
    const atlas = packAtlas(chars.split("").map((ch) => ({ key: ch, contours: outlineOf(ch).contours })), {});
    const bytes = atlas.width * atlas.curveTexels * 8 + atlas.width * atlas.bandTexels * 4;
    say(`${chars.length} glyphs -> ${atlas.curveTexels} curve row(s) and ${atlas.bandTexels} band row(s) at width ${atlas.width}, ${(bytes / 1024).toFixed(1)} KiB`);
    ok("the curve texture is RGBA16F and the band texture is RG16UI, as the reference specifies",
       atlas.curveData instanceof Uint16Array && atlas.curveData.length === atlas.width * atlas.curveTexels * 4 &&
       atlas.bandData instanceof Uint16Array && atlas.bandData.length === atlas.width * atlas.bandTexels * 2);

    ok("a glyph with no outline is recorded as empty rather than as a zero-size quad",
       (() => {
           const a = packAtlas([{ key: "sp", contours: [] }], {});
           return a.glyphs.get("sp").empty === true;
       })());
}

console.log(fails === 0 ? "\n  ALL PASS\n" : `\n  ${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
