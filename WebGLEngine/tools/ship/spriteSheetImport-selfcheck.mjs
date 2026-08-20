// tools/ship/spriteSheetImport-selfcheck.mjs -- v3757
//
// The gate for tools/ship/spriteSheetImport.mjs.
//
// *** THE CHECK THAT MATTERS MOST IS THE OFF-SHEET FRAME, BECAUSE IT IS THE SILENT ONE. A rect running past the
// sheet edge samples whatever sits next to it and renders something PLAUSIBLE -- a torn edge, a neighbour's
// pixels bleeding in -- which reads as an ART problem rather than an IMPORT problem. That is the class of
// defect that costs an afternoon, and it is the one an importer is for. ***
//
// *** AND THE SCHEMA IS OURS, NOT sprite-maker's. That repo (JohnKinyanjui, MIT, THREE COMMITS, alpha) exports
// "sheets + JSON metadata" and NOBODY HERE HAS SEEN ONE -- there is no sample in this tree. Writing a parser
// for a format I have not read would be FABRICATING PROVENANCE. This accepts a minimal DECLARED shape and
// refuses anything else by name; mapping a real export onto it is a ten-line adapter once one file exists. ***

import { validateSheet, toUV, importSheet, gridSheet } from "./spriteSheetImport.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (n, d) => console.log("  ----  " + n + "   " + d);
const SRC = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "spriteSheetImport.mjs"), "utf8");

// ---- 1. THE SILENT ONE -------------------------------------------------------------------------------------
console.log("1. A FRAME THAT RUNS OFF THE SHEET IS REFUSED, NOT CLAMPED");
{
    const off = importSheet({ sheet: { w: 64, h: 64 }, frames: [{ name: "a", x: 40, y: 0, w: 40, h: 32 }] });
    ok("!! *** AN OFF-SHEET RECT IS REFUSED BY NAME, WITH THE RECT AND THE SHEET IN THE MESSAGE ***",
        off.ok === false && /runs outside/.test(off.errors[0]) && /40x32/.test(off.errors[0]) && /64x64/.test(off.errors[0]),
        off.errors[0] + " -- *** CLAMPING IT WOULD HAVE PRODUCED A SMALLER FRAME THAT LOOKS FINE, and dropping " +
        "it silently would have produced a sheet with a missing animation nobody could trace ***");
    ok("!! ...and it is refused on every edge, not just the right one",
        [{ x: -1, y: 0, w: 8, h: 8 }, { x: 0, y: -1, w: 8, h: 8 }, { x: 60, y: 0, w: 8, h: 8 }, { x: 0, y: 60, w: 8, h: 8 }]
            .every((r) => importSheet({ sheet: { w: 64, h: 64 }, frames: [{ name: "a", ...r }] }).ok === false),
        "asserted on all four, because a bound checked in one direction is a bound half-checked");
    ok("!! a frame flush to the edge is ACCEPTED -- the check must not be off by one",
        importSheet({ sheet: { w: 64, h: 64 }, frames: [{ name: "a", x: 32, y: 32, w: 32, h: 32 }] }).ok === true,
        "x + w === sheet.w is exactly in bounds. A check that fires on correct input is worse than no check");
}

// ---- 2. NAMES ----------------------------------------------------------------------------------------------
console.log("\n2. DUPLICATE NAMES ARE REFUSED, NOT LAST-ONE-WINS");
{
    const dup = importSheet({ sheet: { w: 64, h: 64 },
        frames: [{ name: "walk_01", x: 0, y: 0, w: 8, h: 8 }, { name: "walk_01", x: 8, y: 0, w: 8, h: 8 }] });
    ok("!! *** two frames with one name is an error, not a silent replacement ***",
        dup.ok === false && /duplicate frame name/.test(dup.errors[0]),
        "v3729: a census keyed by id needs something asserting ids are UNIQUE, and there the duplicate SILENTLY " +
        "REPLACED its sibling with no symptom but a total that disagreed with its own corpus");
    ok("an unnamed frame is refused too",
        importSheet({ sheet: { w: 64, h: 64 }, frames: [{ x: 0, y: 0, w: 8, h: 8 }] }).ok === false);
}

// ---- 3. THE GRID -------------------------------------------------------------------------------------------
console.log("\n3. A GRID IS DERIVED, AND A GRID THAT DOES NOT DIVIDE IS REFUSED");
{
    const g = gridSheet({ w: 256, h: 128, cellW: 64, cellH: 64, prefix: "walk" });
    ok("!! a dividing grid yields exactly rows x cols frames",
        g.ok === true && g.frames.length === 8 && g.frames[0].name === "walk_000",
        "256x128 at 64x64 -> 4 cols x 2 rows = 8");
    ok("!! *** A GRID THAT LEAVES A REMAINDER IS REFUSED, NOT TRUNCATED ***",
        (() => { const b = gridSheet({ w: 100, h: 64, cellW: 32, cellH: 32 });
                 return b.ok === false && /4px across/.test(b.errors[0]); })(),
        "a 100px sheet at 32px cells is three cells and FOUR PIXELS OF SOMETHING. Silently returning three " +
        "would hide whichever mistake produced the four -- a wrong cell size, a wrong sheet, or a trimmed export");
    ok("!! the UVs are DERIVED from the rect and round-trip back to it",
        (() => { const f = g.frames[3];
                 return f.u0 * 256 === f.px.x && f.v0 * 128 === f.px.y &&
                        (f.u1 - f.u0) * 256 === f.px.w && (f.v1 - f.v0) * 128 === f.px.h; })(),
        "never typed. And the pixel rect TRAVELS WITH the UVs, so a reader can check the arithmetic without " +
        "re-deriving it from the sheet size");
}

// ---- 4. WHAT IT REFUSES TO DECIDE --------------------------------------------------------------------------
console.log("\n4. THE BOUNDARY IS DECLARED, NOT BLURRED");
ok("!! *** no canvas, no GL, no fs -- this is the DATA half and it is pure ***",
    !/document|createElement|WebGL|gl\.|node:fs|readFileSync/.test(codeOnly(SRC)),
    "turning frames into a texture needs a browser and CANNOT BE GRADED HERE. Writing that half anyway would " +
    "be a module that only works where nobody can check it -- so it is NAMED and not written");
ok("!! the origin convention is stated rather than silently applied",
    /TOP-LEFT/.test(SRC) && !/1\s*-\s*v|flipY/.test(codeOnly(SRC)),
    "a v-flip is a RENDERER's convention; applying one here would put the decision in the wrong file and stay " +
    "invisible until something rendered upside down");

report("WHAT THIS DOES NOT CLAIM",
    "That it reads a sprite-maker export. NOBODY HERE HAS SEEN ONE and there is no sample in the tree, so the " +
    "schema is OURS and is refused-by-name for anything else. Nor that anything DISPLAYS: render/spriteAtlas.js " +
    "is a PROCEDURAL atlas that draws eight shapes into a canvas, and wiring imported frames into it is the " +
    "browser half. WHAT EXISTS NOW IS THE PART THAT CAN BE WRONG SILENTLY, CHECKED.");

console.log("\nspriteSheetImport-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
