// tools/ship/asciiLut.mjs -- v3776
//
// *** OUR OWN LOOKUP-TABLE ASCII CONVERTER. Nothing here is derived from stong/gradscii-art (AGPL-3.0) and
// nothing links against it: this is the OTHER method entirely -- the one that repo's README describes as the
// traditional approach it set out to beat. It exists so SweK has a generator it OWNS, feeding the schema
// tools/ship/asciiFrames.mjs already validates. ***
//
// *** THE DESIGN QUESTION THAT MADE THIS GRADEABLE: THE CLASSIC RAMP " .:-=+*#%@" IS FOLKLORE. Its ordering is
// asserted by every tutorial that repeats it and MEASURED BY NONE OF THEM -- it is a typed reference value,
// which is the one thing this project never accepts. So the ramp here is DERIVED: each glyph's INK COVERAGE is
// counted from an actual bitmap, and the ramp is those glyphs SORTED BY THE COUNT. If the folklore order is
// right, the derivation agrees with it; where it disagrees, the measurement wins. ***
//
// *** THE FONT IS OURS AND IS DELIBERATELY TINY. A 5x7 bitmap per glyph, written out below as row bitmasks --
// no canvas, no font file, no fs, so the module is pure and a fixture can drive it headless. THE POINT IS NOT
// TYPOGRAPHY: it is that coverage is COUNTED FROM PIXELS somebody can look at, rather than asserted. A page
// wanting real font metrics can rasterise a real font and pass its own table in; coverageTable() is an
// argument everywhere it is used. ***

// 5 columns x 7 rows. Each entry is 7 row-bitmasks, bit 4 = leftmost column.
export const GLYPHS_5x7 = {
    " ": [0, 0, 0, 0, 0, 0, 0],
    ".": [0, 0, 0, 0, 0, 0b00100, 0b00100],
    ":": [0, 0, 0b00100, 0, 0, 0b00100, 0],
    "-": [0, 0, 0, 0b01110, 0, 0, 0],
    "=": [0, 0, 0b01110, 0, 0b01110, 0, 0],
    "+": [0, 0, 0b00100, 0b01110, 0b00100, 0, 0],
    "*": [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
    "o": [0, 0, 0b01110, 0b10001, 0b10001, 0b01110, 0],
    "O": [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
    "#": [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0],
    "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
    "8": [0b01110, 0b10001, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
    "@": [0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01110],
    "W": [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
    "M": [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
};

export const CELL_W = 5, CELL_H = 7, CELL_PX = CELL_W * CELL_H;

/** Ink coverage of one glyph, in [0,1]. COUNTED, not asserted. */
export function coverageOf(rows) {
    let n = 0;
    for (const r of rows) for (let b = 0; b < CELL_W; b++) if (r & (1 << b)) n++;
    return n / CELL_PX;
}

/** @returns {[{ch, coverage}]} sorted ASCENDING by measured coverage -- the derived ramp. */
export function rampFrom(glyphs = GLYPHS_5x7) {
    return Object.entries(glyphs)
        .map(([ch, rows]) => ({ ch, coverage: coverageOf(rows) }))
        .sort((a, b) => a.coverage - b.coverage || (a.ch < b.ch ? -1 : 1));
}

/**
 * *** THE CONVERSION, AND IT PICKS THE NEAREST COVERAGE RATHER THAN INDEXING A STRING.
 * The tutorial form is `ramp[Math.floor(gray * ramp.length)]`, which assumes the ramp's coverages are EVENLY
 * SPACED. THEY ARE NOT -- measured here they cluster hard at the bottom (a dot is 2/35, a colon 2/35, a dash
 * 3/35) and thin out at the top. Index-by-position throws that away and quantises unevenly; NEAREST-COVERAGE
 * uses the numbers it just measured. ***
 */
export function pickGlyph(gray, ramp) {
    let best = ramp[0], bestD = Infinity;
    for (const g of ramp) { const d = Math.abs(g.coverage - gray); if (d < bestD) { bestD = d; best = g; } }
    return best;
}

/**
 * Convert a grayscale field to one frame string.
 * @param {Float64Array|number[]} gray values in [0,1], row-major, width*height
 * @returns {string} `rows` lines of `cols` characters -- the shape asciiFrames.mjs validates
 */
export function convertFrame(gray, width, height, cols, rows, ramp = rampFrom()) {
    const lines = [];
    for (let r = 0; r < rows; r++) {
        let line = "";
        for (let c = 0; c < cols; c++) {
            // box-average the source region for this cell -- a point sample would alias badly on fine detail
            const x0 = Math.floor(c * width / cols), x1 = Math.max(x0 + 1, Math.floor((c + 1) * width / cols));
            const y0 = Math.floor(r * height / rows), y1 = Math.max(y0 + 1, Math.floor((r + 1) * height / rows));
            let sum = 0, n = 0;
            for (let y = y0; y < y1 && y < height; y++) for (let x = x0; x < x1 && x < width; x++) { sum += gray[y * width + x]; n++; }
            line += pickGlyph(n ? sum / n : 0, ramp).ch;
        }
        lines.push(line);
    }
    return lines.join("\n");
}

/**
 * *** THE KEY, AND IT IS NOT A MIRROR: RENDER THE CHOSEN GLYPHS BACK TO COVERAGE AND COMPARE TO THE SOURCE.
 * The comparison runs against the BOX-AVERAGED SOURCE, which the converter also used -- so this measures the
 * QUANTISATION ONLY, which is the thing a ramp controls. Comparing against the raw pixels instead would fold
 * in the downscale and report an error the charset cannot fix.
 * *** AND THE FIRST VERSION OF THIS FUNCTION WAS A MIRROR, CAUGHT BY MEASUREMENT BEFORE IT SHIPPED. It scored
 * against `ramp`'s OWN claimed coverages -- so a ramp that LIED about them scored BETTER. The folklore ramp
 * used the tutorial way (position as coverage, evenly spaced 0..1) read rmse 0.03167 against the derived
 * ramp's 0.10837, WHICH WOULD HAVE "PROVEN" THE FOLKLORE BETTER. It was measuring how evenly a ramp's CLAIMS
 * tile [0,1], not how the glyphs render. THE SCORE NOW READS TRUTH FROM THE GLYPH BITMAPS, independently of
 * whatever the ramp asserts: the converter may pick by any table it likes, and it is graded on the INK THAT
 * WOULD ACTUALLY APPEAR. ***
 */
export function reconstructionError(gray, width, height, cols, rows, ramp = rampFrom(), glyphs = GLYPHS_5x7) {
    // TRUTH, not the ramp's claim -- this is the whole difference between a key and a mirror.
    const byCh = new Map(Object.entries(glyphs).map(([ch, r]) => [ch, coverageOf(r)]));
    const frame = convertFrame(gray, width, height, cols, rows, ramp).split("\n");
    let se = 0, n = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const x0 = Math.floor(c * width / cols), x1 = Math.max(x0 + 1, Math.floor((c + 1) * width / cols));
        const y0 = Math.floor(r * height / rows), y1 = Math.max(y0 + 1, Math.floor((r + 1) * height / rows));
        let sum = 0, m = 0;
        for (let y = y0; y < y1 && y < height; y++) for (let x = x0; x < x1 && x < width; x++) { sum += gray[y * width + x]; m++; }
        const want = m ? sum / m : 0;
        const got = byCh.get(frame[r][c]);
        if (got === undefined) continue;   // a ramp naming a glyph this font does not have is scored on the rest
        se += (want - got) * (want - got); n++;
    }
    return { rmse: Math.sqrt(se / n), cells: n };
}

/** A deterministic grayscale test field: a smooth diagonal gradient with a disc. No RNG. */
export function testField(width, height) {
    const g = new Float64Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const dx = x - width * 0.5, dy = y - height * 0.5;
        const disc = Math.hypot(dx, dy) < Math.min(width, height) * 0.25 ? 0.55 : 0;
        g[y * width + x] = Math.min(1, (x / width) * 0.5 + (y / height) * 0.2 + disc);
    }
    return g;
}

// v3900 -- GUARDED. This module is loaded by a PAGE as well as run as a CLI, and `process` at module
// top level is a ReferenceError in a browser -- not a caught failure, an EVALUATION failure, so the
// whole module fails to load and every import of it dies with it. browserSafety-selfcheck caught this
// on Keith's rig; the guard is the tree's existing idiom (physics/mpm/step.mjs and three siblings).
// v3941 -- SEPARATOR-TOLERANT AND ANCHORED. `split("/")` returns THE WHOLE PATH on Windows, so this
// guard was false and the block below never ran there. The leading "/" matters too: without it
// `.../loopScope.mjs`.endsWith("Scope.mjs") is true, and a sibling could wake somebody else's main
// block. THIS FILE MAY NOT IMPORT node:url -- a browser page imports it -- so a basename compare is
// the strongest form available here, and winPathGuard re-derives that exemption rather than trusting it.
if (typeof process !== "undefined" && process.argv[1] && import.meta.url.endsWith("/" + process.argv[1].split(/[\\/]/).pop())) {
    const ramp = rampFrom();
    console.log("[asciiLut] DERIVED ramp (ascending measured coverage):");
    console.log("   " + ramp.map((g) => "'" + g.ch + "'=" + (g.coverage * CELL_PX).toFixed(0) + "/" + CELL_PX).join("  "));
    console.log("[asciiLut] as a string: \"" + ramp.map((g) => g.ch).join("") + "\"");
    const W = 96, H = 56, g = testField(W, H);
    const e = reconstructionError(g, W, H, 48, 14, ramp);
    console.log("[asciiLut] reconstruction rmse over " + e.cells + " cells: " + e.rmse.toFixed(5));
    console.log(convertFrame(g, W, H, 48, 14, ramp));
}
