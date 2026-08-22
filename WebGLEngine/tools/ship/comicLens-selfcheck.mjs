// tools/ship/comicLens-selfcheck.mjs
//
// Run: node tools/ship/comicLens-selfcheck.mjs   (instant)
//
// v3173 -- A MAGNIFIER FOR THE COMIC READER, AND THE ONE THING IT REFUSES TO DO.
//
// A CBZ scan is typically 1500-3000px wide and comics.html shows it FIT TO SCREEN, so two or three times as
// many pixels sit in the decoded image as reach the glass. A lens reveals them.
//
// *** NO LIBRARY, AND THE REASON IS A CATEGORY DIFFERENCE RATHER THAN A PREFERENCE. *** shuding/image-magnifier
// is real and well made, and it ANNOTATES: you place a lens, drag and resize it, and produce a still with the
// magnifier baked in -- for showing somebody a detail. A reader wants a LIVE lens that follows the cursor and
// leaves no trace. Different job, same noun, and adopting it would have been the "two things wearing one label"
// shape as a dependency.
//
// *** AND THE REFUSAL IS THE PART WORTH GATING. A MAGNIFIER ONLY REVEALS DETAIL IF THE DETAIL EXISTS. *** When
// naturalWidth is no larger than the displayed width -- a small scan, or a page already at 1:1 -- there is
// nothing behind the glass, and zooming produces BLUR THAT LOOKS EXACTLY LIKE A BROKEN FEATURE. That is v3120's
// law arriving in a reader: UNSUPPORTED and FAILED must stay apart, because "this scan has no more detail" and
// "the lens is broken" are indistinguishable through a blurry circle.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const page = fs.readFileSync(path.join(ENG, "comics.html"), "utf8");

// ---- 1. IT REFUSES WHERE THERE IS NOTHING TO SHOW ------------------------------------------------------------
{
    ok("!! *** the lens DISABLES ITSELF when the page holds no hidden detail ***",
        /LENS_MIN_GAIN/.test(page) && /b\.disabled = !usable/.test(page) &&
        /naturalWidth \/ im\.clientWidth/.test(page),
        "gain is naturalWidth over clientWidth, and below 1.25 the lens would show INTERPOLATION RATHER THAN " +
        "INFORMATION. A blurry circle is indistinguishable from a broken feature, which is v3120's " +
        "UNSUPPORTED-vs-FAILED law arriving in a reader");

    ok("!! and the REASON travels with the control",
        /No magnifier: this page is shown at/.test(page) && /this scan holds/.test(page),
        "a disabled button with no explanation is a control that has become scenery. v3112: a control that " +
        "could not read its state showed a plausible one anyway, and somebody acted on it");

    ok("!! the answer is recomputed PER PAGE and PER RESIZE, not once",
        /im\.addEventListener\("load", refreshLens\)/.test(page) && /window\.addEventListener\("resize", refreshLens\)/.test(page),
        "gain changes with EVERY page and EVERY window size -- a one-shot check would be v3138's frozen " +
        "denominator, measured once and presented as current");

    ok("...and an ACTIVE lens is turned off when a page arrives that cannot support it",
        /if \(!usable && lensOn\) setLens\(false\)/.test(page),
        "leaving it on would show a blurry circle on the next page and read as the feature breaking, rather " +
        "than as this page having nothing to magnify");
}

// ---- 2. IT DOES NOT LIE ABOUT POSITION, AND DOES NOT EAT THE READER ---------------------------------------------
{
    ok("!! outside the page is NOT a position -- the lens hides rather than clamps",
        /if \(x < 0 \|\| y < 0 \|\| x > r\.width \|\| y > r\.height\) \{ l\.style\.display = "none"; return; \}/.test(page),
        "clamping would park it on an edge and keep showing a magnified corner AS THOUGH THE CURSOR WERE STILL " +
        "ON IT -- a display that is confidently wrong about where you are pointing");

    ok("!! pointer-events:none, so it never eats the tap zones underneath",
        /#lens \{[^}]*pointer-events:none/s.test(page),
        "comics.html has tapL and tapR overlays for page turns. A lens that swallowed those would break " +
        "navigation to add magnification");

    ok("...and it uses currentSrc, not just src",
        /im\.currentSrc \|\| im\.src/.test(page),
        "currentSrc is what the browser ACTUALLY loaded. On any responsive or format-negotiated source they " +
        "differ, and magnifying a URL the page did not load would show a different image inside the circle");
}

// ---- 3. NO DEPENDENCY, AND THE MARKUP STILL BALANCES -------------------------------------------------------------
{
    ok("!! no library was added",
        // ASSERTED BY THE ABSENT SCRIPT TAG, not the absent mention. My first version tested for the NAME and
        // failed on MY OWN COMMENT explaining why the library was not used -- the THIRD time this session a
        // check counted its own warning (v3153, v3169, here). A library has to be LOADED to be a dependency,
        // so the script tag is the load-bearing fact and it cannot be tripped by prose.
        !/<script[^>]+src=[^>]*(magnif|magnify)/i.test(page) &&
        !/import[^;]*(image-magnifier|magnifier)/i.test(page),
        "about thirty lines against a dependency whose actual job is ANNOTATION -- placing a lens and baking " +
        "it into a still. SweK boots with no npm install, and an IDEA is free where a dependency is permanent");

    ok("...and the page's markup still balances",
        (page.match(/<div\b/g) || []).length === (page.match(/<\/div>/g) || []).length,
        "v3162's stray </div> did not throw -- it silently reparents everything after it, and nothing in this " +
        "tree renders HTML");
}

console.log();
console.log("  ----  WHAT THIS BOX CANNOT SHOW: the lens. It needs a browser, a CBZ and a cursor. The REFUSAL");
console.log("  ----  logic is asserted against source; whether the circle looks right is Keith's to see, and");
console.log("  ----  the thing to check is a SMALL scan -- the button should be GREYED with a reason, not");
console.log("  ----  clickable-and-blurry.");
console.log("  ----  NOT DONE: no PDF path exists in this tree at all, and a PDF lens is a DIFFERENT feature --");
console.log("  ----  a rasterised page has no hidden detail, so it must RE-RENDER the region at higher scale.");
if (fails) { console.log("comicLens-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("comicLens-selfcheck: all checks pass");
