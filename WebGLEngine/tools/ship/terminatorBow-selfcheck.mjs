// tools/ship/terminatorBow-selfcheck.mjs
//
// Run: node tools/ship/terminatorBow-selfcheck.mjs   (instant)
//
// v3180 -- THE SHADING CLAIM IS NOW DECIDED BY THE QA RUN, NOT BY LOOKING.
//
// v3179 put a FLAT DISC beside a SPHERE IMPOSTOR from one light so a human could see the difference. Keith
// asked the better question: WHY IS A HUMAN THE ONE COMPARING THEM?
//
// *** THE CLAIM IS GEOMETRIC AND THEREFORE MEASURABLE. *** A flat disc lit by a constant has a light/dark
// boundary that is a STRAIGHT LINE -- the same x on every row. A sphere impostor's terminator BOWS, because the
// surface turns away. terminatorBow walks a region row by row, finds each row's crossing, and reports the
// SPREAD as a fraction of region width.
//
// *** AND IT IS ASSERTED IN BOTH DIRECTIONS, WHICH IS THE WHOLE POINT. *** The sphere panel must bow AT LEAST
// 0.05 and the flat panel AT MOST 0.03. A check demanding only "the sphere bows" WOULD PASS ON A PAGE THAT DREW
// TWO SPHERES; one demanding only that they DIFFER would pass on two arbitrary pictures. THE FAILING CASE HAS
// TO BE MEASURED FAILING.
//
// VALIDATED WITHOUT A GPU: the check is exercised on SYNTHETIC images built here -- a straight boundary
// measures 0.0000 and a bowed one 0.2833. That is the instrument being tested, separately from the page it will
// be pointed at, which is the only honest way to ship a measurement from a box that cannot render.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const C = await import(pathToFileURL(path.join(ENG, "tools", "render-qa", "checks.mjs")).href);
const man = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));

/** Synthetic panels: the instrument is tested on shapes whose answer is known by construction. */
const mk = (w, h, f) => {
    const d = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = f(x / w, y / h) ? 230 : 20, i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    return { width: w, height: h, data: d };
};
const flat  = mk(120, 120, (u) => u > 0.5);
const bowed = mk(120, 120, (u, v) => { const dy = (v - 0.5) * 2; return u > 0.5 - 0.28 * Math.sqrt(Math.max(0, 1 - dy * dy)); });

// ---- 1. THE INSTRUMENT DISCRIMINATES ---------------------------------------------------------------------------
{
    const f = C.terminatorBow(flat, {}), b = C.terminatorBow(bowed, {});
    ok("!! a STRAIGHT boundary measures essentially zero bow",
        f.bow < 0.01 && f.rows >= 100,
        "bow " + f.bow.toFixed(4) + " over " + f.rows + " rows. Synthetic, so the answer is known BY " +
        "CONSTRUCTION rather than by agreeing with the thing being tested");

    ok("!! a BOWED boundary measures a lot",
        b.bow > 0.2 && b.rows >= 100,
        "bow " + b.bow.toFixed(4) + " over " + b.rows + " rows -- a factor of " + (b.bow / Math.max(f.bow, 1e-6)).toExponential(1) +
        " apart. AN INSTRUMENT THAT COULD NOT SEPARATE THESE TWO WOULD PASS ON THE PAGE AND MEAN NOTHING");

    ok("!! the threshold is DERIVED from the region's own range, never typed",
        (() => { const src = fs.readFileSync(path.join(ENG, "tools", "render-qa", "checks.mjs"), "utf8");
                 return /const mid = \(lo \+ hi\) \/ 2;/.test(src); })(),
        "a fixed luminance would decide differently on a dark planet and a bright one -- a property of the " +
        "PAINT rather than of the GEOMETRY, and the geometry is the claim");

    ok("!! a region with no light/dark range REFUSES rather than returning zero",
        (() => { const blank = mk(60, 60, () => true); const r = C.terminatorBow(blank, {});
                 return r.ok === false && /no light\/dark range/.test(r.why); })(),
        "a uniformly lit region has NO boundary, and reporting bow 0 there would read as 'measured flat' -- " +
        "the most permissive possible answer to a question that could not be asked");

    // ASSERTED BY BEHAVIOUR, NOT BY THE COMMENT THAT DESCRIBES IT. My first version matched the explanatory
    // sentence in checks.mjs, and commentFalsePass flagged it -- a code-idiom regex against raw source is the
    // exact hazard that gate exists to find, and it was right about mine for the second time this session.
    ok("...and rows with no crossing are SKIPPED, not counted as zero",
        (() => {
            // Half the rows fully lit (no crossing), half carrying a STRAIGHT boundary. If empty rows counted
            // as zero, the spread would jump to the boundary's own x; skipping keeps it near nothing.
            const half = mk(120, 120, (u, v) => v < 0.5 ? true : u > 0.6);
            const r = C.terminatorBow(half, {});
            return r.ok !== false && r.rows < 120 && r.bow < 0.01;
        })(),
        "counting an empty row as zero would drag the spread toward the region's left edge -- a number about " +
        "the CROP rather than about the shading");
}

// ---- 2. BOTH DIRECTIONS ARE IN THE MANIFEST ----------------------------------------------------------------------
{
    const sph = man.pages.find((p) => p.name === "sphere-impostor");
    const flt = man.pages.find((p) => p.name === "sphere-impostor-flat");
    const bowOf = (p) => (p.checks || []).find((c) => c.type === "terminatorBow");

    ok("!! *** the SPHERE panel must bow AND the FLAT panel must not ***",
        bowOf(sph) && bowOf(sph).minBow > 0 && bowOf(flt) && bowOf(flt).maxBow > 0,
        "minBow " + bowOf(sph).minBow + " against maxBow " + bowOf(flt).maxBow + ". A CHECK DEMANDING ONLY " +
        "'THE SPHERE BOWS' WOULD PASS ON A PAGE THAT DREW TWO SPHERES, and one demanding only that they differ " +
        "would pass on two arbitrary pictures");

    ok("!! both entries load the SAME url and screenshot different canvases",
        sph.url === flt.url && sph.canvas !== flt.canvas,
        sph.canvas + " and " + flt.canvas + " from " + sph.url + ". One page, one light, two measurements -- so " +
        "a disagreement cannot come from two different renders");

    ok("...and the flat entry records WHY it exists",
        /THE FAILING CASE HAS TO BE MEASURED FAILING/.test(flt.note || ""),
        "otherwise somebody tidies away the panel that looks like it does nothing, and the surviving check " +
        "quietly stops meaning anything");
}

console.log();
console.log("  ----  WHAT THIS BOX STILL CANNOT DO: render either panel. The INSTRUMENT is validated here on");
console.log("  ----  synthetic shapes; whether the PAGE produces them is the rig's run. On the rig, render-qa");
console.log("  ----  now DECIDES it: sphere-impostor must report bow >= 0.05 and sphere-impostor-flat <= 0.03.");
console.log("  ----  If both bow, the flat panel is not flat. If neither does, the impostor normal is not");
console.log("  ----  reaching the fragment -- and nobody has to squint at a screenshot to find out which.");
if (fails) { console.log("terminatorBow-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("terminatorBow-selfcheck: all checks pass");
