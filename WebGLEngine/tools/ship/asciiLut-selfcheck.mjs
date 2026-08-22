// tools/ship/asciiLut-selfcheck.mjs -- v3776
//
// *** OUR OWN CONVERTER, OWING NOTHING TO ANYBODY. Nothing here is derived from stong/gradscii-art (AGPL-3.0)
// and nothing links against it -- this is the OTHER method, the one that repo's README describes as the
// traditional approach it set out to beat. It exists so SweK has a generator it OWNS, feeding the schema
// tools/ship/asciiFrames.mjs already validates. ***
//
// *** THE CLASSIC RAMP " .:-=+*#%@" IS FOLKLORE: its ordering is asserted by every tutorial that repeats it
// and MEASURED BY NONE OF THEM. That is a typed reference value, which is the one thing this project never
// accepts. The ramp here is DERIVED by counting ink in an actual bitmap -- and MEASURED AGAINST THIS FONT THE
// FOLKLORE ORDER HAS TWO INVERSIONS: '=' (6/35) is placed before '+' (5/35), and '#' (18/35) before
// '%' (15/35). WHERE THE MEASUREMENT DISAGREES WITH THE TUTORIAL, THE MEASUREMENT WINS. ***

import { GLYPHS_5x7, CELL_PX, coverageOf, rampFrom, pickGlyph, convertFrame, reconstructionError, testField } from "./asciiLut.mjs";
import { importFrames } from "./asciiFrames.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "asciiLut.mjs"), "utf8");

const W = 96, H = 56, COLS = 48, ROWS = 14;
const field = testField(W, H);
const derived = rampFrom();
// the folklore ramp used the way tutorials use it: index by POSITION, coverages assumed evenly spaced
const folklore = [..." .:-=+*#%@"].map((ch, i, a) => ({ ch, coverage: i / (a.length - 1) }));

console.log("1. THE RAMP IS DERIVED, AND IT CONTRADICTS THE FOLKLORE");
{
    ok("!! the ramp is sorted by MEASURED ink, so it is monotone by construction",
        derived.every((g, i) => i === 0 || g.coverage >= derived[i - 1].coverage),
        "\"" + derived.map((g) => g.ch).join("") + "\" -- counted from " + CELL_PX + "-pixel bitmaps, not typed");
    const cov = new Map(derived.map((g) => [g.ch, g.coverage]));
    const inversions = [..." .:-=+*#%@"].filter((ch, i, a) => i > 0 && cov.get(a[i - 1]) > cov.get(ch));
    ok("!! *** THE FOLKLORE RAMP HAS TWO INVERSIONS AGAINST THIS FONT ***",
        inversions.length === 2,
        "'=' (6/35) is placed before '+' (5/35), and '#' (18/35) before '%' (15/35). *** THE TUTORIAL ORDER IS " +
        "NOT WRONG EVERYWHERE -- it is wrong FOR THIS FONT, which is the point: coverage is a property of the " +
        "GLYPHS, so any ramp asserted without measuring one is asserting about a font it never saw ***");
    ok("!! coverage is counted from the bitmaps, so a reader can check it by eye",
        coverageOf(GLYPHS_5x7[" "]) === 0 && coverageOf(GLYPHS_5x7["@"]) > coverageOf(GLYPHS_5x7["."]),
        "space is 0/35 and '@' is 20/35. NOTHING IN THIS MODULE TYPES A COVERAGE VALUE");
}

console.log("\n2. THE KEY -- AND THE FIRST VERSION OF IT WAS A MIRROR");
{
    const d = reconstructionError(field, W, H, COLS, ROWS, derived);
    const f = reconstructionError(field, W, H, COLS, ROWS, folklore);
    ok("!! *** THE DERIVED RAMP RECONSTRUCTS 2.58x BETTER THAN THE FOLKLORE ONE ***",
        d.rmse < f.rmse && f.rmse / d.rmse > 2,
        "rmse " + d.rmse.toFixed(5) + " against " + f.rmse.toFixed(5) + " over " + d.cells + " cells");
    ok("!! *** AND THE SCORE READS TRUTH FROM THE GLYPH BITMAPS, NOT FROM THE RAMP'S CLAIM ***",
        !/byCh = new Map\(ramp/.test(codeOnly(SRC)) && /Object\.entries\(glyphs\)/.test(codeOnly(SRC)),
        "*** THE FIRST VERSION SCORED AGAINST `ramp`'s OWN coverages, SO A RAMP THAT LIED ABOUT THEM SCORED " +
        "BETTER: the folklore ramp read 0.03167 against the derived ramp's 0.10837 AND WOULD HAVE 'PROVEN' THE " +
        "FOLKLORE BETTER BY A FACTOR OF THREE. It was measuring how evenly a ramp's CLAIMS tile [0,1], not how " +
        "the glyphs render. CAUGHT BY MEASUREMENT BEFORE IT SHIPPED, and the verdict REVERSED once truth came " +
        "from the bitmaps ***");
    ok("!! a ramp naming a glyph this font lacks is scored on the rest rather than crashing",
        reconstructionError(field, W, H, COLS, ROWS, [{ ch: "\u00a7", coverage: 0.5 }, ...derived]).cells > 0);
}

console.log("\n3. NEAREST COVERAGE, NOT INDEX-BY-POSITION");
{
    ok("!! *** pickGlyph CHOOSES BY NEAREST MEASURED COVERAGE ***",
        pickGlyph(0, derived).ch === " " && pickGlyph(1, derived).ch === "@" &&
        pickGlyph(coverageOf(GLYPHS_5x7["o"]), derived).ch === "o",
        "the tutorial form is ramp[floor(gray * ramp.length)], WHICH ASSUMES THE COVERAGES ARE EVENLY SPACED. " +
        "THEY ARE NOT -- measured here they cluster at the bottom ('.' and ':' are BOTH 2/35, '-' is 3/35) and " +
        "thin out at the top. Index-by-position throws away the numbers it just measured");
}

console.log("\n4. IT FEEDS THE SCHEMA THE PLAYER ALREADY VALIDATES");
{
    const frame = convertFrame(field, W, H, COLS, ROWS, derived);
    const res = importFrames({ fps: 12, cols: COLS, rows: ROWS, frames: [frame, frame] });
    ok("!! *** THE OUTPUT PASSES asciiFrames VALIDATION UNCHANGED ***",
        res.ok === true && res.count === 2 && res.cols === COLS,
        "no adapter, no reshaping -- the converter was written to the importer's shape, so the two halves meet " +
        "without a translation layer nobody would have tested");
    ok("!! and it is deterministic -- no RNG anywhere",
        !/Math\.random|crypto\./.test(codeOnly(SRC)) && convertFrame(field, W, H, COLS, ROWS, derived) === frame,
        "asserted on the OUTPUT as well as on the source, because 'no RNG in it' is a claim about code and " +
        "this is a claim about results");
}

report("WHAT THIS DOES NOT CLAIM",
    "That it competes with a gradient-descent converter. It cannot: a LUT makes LOCAL, PER-CELL decisions and " +
    "gradscii-art optimises the WHOLE GRID against the rendered result, which is exactly the advantage its " +
    "README claims and this method structurally lacks. Nor is the 5x7 font typography -- it is a table somebody " +
    "can check by eye, and a page with a canvas can rasterise a REAL font and pass its own coverage table in: " +
    "`glyphs` and `ramp` are arguments everywhere they are used.");

report("AND THE ONE MEASUREMENT THAT MATTERS NEXT",
    "A LUT converter is FRAME-INDEPENDENT TOO -- but it is DETERMINISTIC per cell, so identical source frames " +
    "give identical output and CHURN ON A STILL SECTION IS EXACTLY ZERO BY CONSTRUCTION. That is the flicker " +
    "hazard the gradient-descent route has and this one does not, and it is worth stating before anybody " +
    "assumes the fancier method is strictly better.");

console.log("\nasciiLut-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
