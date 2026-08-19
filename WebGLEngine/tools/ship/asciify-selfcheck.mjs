// WebGLEngine/tools/ship/asciify-selfcheck.mjs
//
// Run: node tools/ship/asciify-selfcheck.mjs   (~2s -- MEASURED)
//
// v3322 -- ASCII RENDERING, TAKEN AS A TECHNIQUE RATHER THAN AS A DEPENDENCY.
//
// Keith on DavidHDev/canvas-ui: "the ascii object is amazing. if we could view our avatar or other 3d objects
// through that, that would be very cool." Their components are React/Vue/Svelte source. *** THE TECHNIQUE NEEDS
// NOTHING: luminance into a character ramp is arithmetic over pixels. *** So the module takes RGBA in and
// returns text -- no canvas, no DOM, no GL -- which is exactly what makes the whole claim checkable on a box
// with no GPU.
//
// AND IT ALSO ANSWERS THE npm QUESTION HONESTLY. The bar is not "npm is bad": the ai-bridge already installs
// packages. It is that NOTHING IN WebGLEngine/*.html MAY NEED COMPILING, because a phone peer opens those pages
// in a browser with no toolchain. An idea ports; a build step is a permanent cost paid by every peer.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const { asciify, glyphFor, RAMP, CELL_ASPECT } =
    await import(pathToFileURL(path.join(ROOT, "tools", "render-qa", "asciify.mjs")).href);
const page = fs.readFileSync(path.join(ROOT, "ascii-object.html"), "utf8");
// v3331 -- THE NO-CONTEXT MESSAGE IS TEXT THE PAGE SHOWS A PERSON, NOT A COMMENT ABOUT IT. So the assertion runs
// through noComments (comments stripped, STRINGS KEPT) rather than prose(): matching raw would let a commented-out
// copy of the sentence satisfy a check about what the page RENDERS, which is the false pass this view exists to stop.
const pageNC = noComments(page);

const solid = (w, h, r, g, b, a = 255) => {
    const p = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < p.length; i += 4) { p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = a; }
    return p;
};

{
    ok("!! *** brightness picks the glyph: black is the ramp's first, white its last ***",
        asciify(solid(20, 20, 0, 0, 0), 20, 20, { cols: 4 }).text[0] === RAMP[0] &&
        asciify(solid(20, 20, 255, 255, 255), 20, 20, { cols: 4 }).text[0] === RAMP[RAMP.length - 1],
        "the entire claim in one line, and it is checkable without a GPU because the module takes PIXELS, not a " +
        "canvas. THAT SEPARATION IS WHAT MAKES THIS A GATE INSTEAD OF A SCREENSHOT");

    // *** REC. 601 LUMA, NOT A FLAT MEAN. *** A flat (r+g+b)/3 makes pure green and pure blue equally bright --
    // and SweK's entire palette is green, so that is the one channel a naive average gets most wrong here.
    const g = asciify(solid(8, 8, 0, 255, 0), 8, 8, { cols: 2 }).text[0];
    const b = asciify(solid(8, 8, 0, 0, 255), 8, 8, { cols: 2 }).text[0];
    ok("!! ...and green is far brighter than blue, because it is luma and not a flat mean",
        RAMP.indexOf(g) > RAMP.indexOf(b) + 3,
        "green -> '" + g + "', blue -> '" + b + "'. A FLAT MEAN WOULD MAKE THEM IDENTICAL, and SweK's palette is " +
        "green from end to end -- the exact case that would have looked fine and been wrong");

    ok("!! *** transparent becomes SPACE, not the darkest glyph ***",
        asciify(solid(8, 8, 0, 0, 0, 0), 8, 8, { cols: 2 }).text[0] === " ",
        "a transparent background averages to ZERO LUMINANCE and would fill the frame with a solid block -- an " +
        "object silhouetted on darkness, which is the opposite of what an ASCII view is for. Alpha is ASKED " +
        "ABOUT rather than assumed away");
}
{
    // A SQUARE INPUT MUST NOT PRODUCE A SQUARE GRID. Cells are ~2:1, so sampling square cells stretches the
    // image vertically -- the step naive ASCII renderers skip and the reason most come out squashed.
    const r = asciify(solid(100, 100, 128, 128, 128), 100, 100, { cols: 50 });
    ok("!! ...and the cell aspect is corrected 2:1, so a circle stays a circle",
        r.rows === 25 && CELL_ASPECT === 2,
        r.cols + " cols x " + r.rows + " rows from a square frame. HALF AS MANY ROWS AS COLUMNS IS THE CORRECTION; " +
        "equal counts would mean the renderer never made it");

    ok("...and the ramp is short on purpose",
        RAMP.length === 10,
        "a seventy-character ramp looks impressive and QUANTISES NOISE INTO VISIBLE BANDS, because adjacent " +
        "glyphs stop differing in perceived weight. Short and honest beats long and decorative");

    let threw = 0;
    try { asciify(null, 10, 10); } catch { threw++; }
    try { asciify(solid(4, 4, 0, 0, 0), 4, 4, { cols: 0 }); } catch { threw++; }
    ok("...and bad input refuses rather than returning empty text",
        threw === 2,
        "empty text renders as a blank panel and reads as 'the source did not load' -- the convincing-nothing " +
        "failure this tree has refused five times");
}
{
    ok("!! *** the page's source is the REAL wireframe head module, not a copy of its shape ***",
        /face\/wireframeHead\.js/.test(page) && /buildWireframeHead\(THREE\)/.test(page),
        "the same module thead.html draws and the Pip-Boy's screen 1 renders (v3239, v3240). ONE DEFINITION, " +
        "THREE CONSUMERS -- if the head changes, this changes, which is the whole reason it was extracted");

    ok("!! ...and it flips readPixels' bottom-up rows",
        /H - 1 - y/.test(page),
        "readPixels returns BOTTOM-UP and asciify walks top-down. Without the flip the head renders UPSIDE DOWN " +
        "and looks like a bug in the sampler rather than a coordinate convention");

    ok("...and a missing WebGL context is NAMED, not left blank",
        /no WebGL context/.test(pageNC) && /What is missing here is the SOURCE FRAME/.test(pageNC),
        "the sampler needs no GPU and is gated headlessly; only the SOURCE FRAME does. An empty pre would blame " +
        "the wrong half");
}

// ---- THE PIP-BOY'S OWN SCREEN, AS ASCII (v3323) ----------------------------------------------------------------------
{
    const host = fs.readFileSync(path.join(ROOT, "pipboy-models.html"), "utf8");

    ok("!! *** ?screen1=ascii draws the SAME rig through the sampler, not a second head ***",
        /asciify\(flip, 256, 216/.test(host) && /screen1=ascii|screen1"\) \|\| "texture"/.test(host) &&
        (host.match(/buildWireframeHead\(THREE\)/g) || []).length === 1,
        "TWO MODES OVER ONE SOURCE: both paths render the same rig into the same target and only the last step " +
        "differs. A SECOND HEAD FOR THE ASCII VIEW would be the copy this tree spends its rounds removing, and " +
        "would drift the moment either was touched");

    ok("!! ...and it hands the texture back before painting",
        /setScreen1Texture\(null\)/.test(host),
        "without it the material KEEPS SAMPLING THE RENDER TARGET while the 2D callback paints underneath, " +
        "unseen -- a mode that appears to do nothing while running correctly");

    ok("...and the default is unchanged",
        /\|\| "texture"/.test(host),
        "a new mode that altered what everybody already sees would be A PREFERENCE WEARING A FEATURE'S CLOTHES");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT PROVE: that it looks good. The glyph mapping, the aspect and the alpha");
console.log("  ----  rule are arithmetic and are checked; whether a head reads as a head at 100 columns is");
console.log("  ----  Keith's eye on ascii-object.html.");
if (fails) { console.log("asciify-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("asciify-selfcheck: all checks pass");
