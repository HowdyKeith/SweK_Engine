// WebGLEngine/render/holoGif-selfcheck.mjs — v2612
//
// Run: node render/holoGif-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES the one-click path: blobarium -> krbn -> SVG -> GIF.
//
// Keith: "Can the blobulator/blobarium 1 click I svg page hologram pencil demo, and to a .gif?"
//
// ---- WHAT I DID NOT BUILD ------------------------------------------------------------------------------------------
//
// A GIF ENCODER. render/gifRecorder.js has existed since v2590, gated, passing, with encodeGif(frames, w, h)
// taking RGBA frames directly. I READ FIRST AND FOUND IT. The instinct to write one was there and it was wrong.
//
// ---- THE MEASUREMENT THAT SHAPED THE BUTTON -------------------------------------------------------------------------
//
// Measured in a real browser BEFORE the button existed -- 8 frames at 240x180:
//
//     render:  4501 ms          <- Krbn, ~563 ms a frame
//     encode:    66 ms          <- THE ENCODER IS FREE
//     out:     29,793 bytes, magic "GIF89a"
//
// THE ENCODER IS NOT THE COST. KRBN IS. So 12 frames is about seven seconds and 36 is about twenty, AND A
// BUTTON THAT LOOKS FROZEN FOR TWENTY SECONDS IS A BROKEN BUTTON. It states the estimate BEFORE you press it
// and counts frames WHILE it works.
//
// ---- AND THE LUMPS TRAVEL, BECAUSE THE POINT IS TO DRAW *THIS* BLOB -------------------------------------------------
//
// The tank's HOLOGRAM button packs the seven live centres into the URL. krbn.html reads them. A hologram of a
// FRESH blob from the seed, while a WANDERED blob sits in the tank you clicked from, WOULD BE A LIE THAT LOOKS
// LIKE A FEATURE -- and v2610 measured that wander at 3.11 units with the walls on, so the two are visibly
// different creatures after a minute.
//
// DRIVEN END TO END IN A REAL BROWSER: tank -> click -> popup with 7 lumps in the URL -> "30 deg -- well --
// 562 verts, 554 tris -- 496 strokes -- 473 ms" -> GIF 59,033 bytes. Verified INDEPENDENTLY of the code that
// made it: GIF89a, 320x240, 8 graphic-control extensions, NETSCAPE loop block present.
import fs from "node:fs";
import { prose } from "../tools/ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeGif, sniffGif } from "./gifRecorder.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const krbn = fs.readFileSync(path.join(ROOT, "krbn.html"), "utf8");
const tank = fs.readFileSync(path.join(ROOT, "blobarium.html"), "utf8");

// ---- 1. THE ENCODER IS THE ONE WE ALREADY HAD ----------------------------------------------------------------------
{
    const W = 4, H = 4;
    const f = [0, 1].map((n) => { const a = new Uint8ClampedArray(W * H * 4); a.fill(n ? 200 : 40); return a; });
    const bytes = encodeGif(f, W, H, { delay: 90, colors: 8 });
    // sniffGif returns a BOOLEAN. I wrote `sniffGif(bytes).ok` -- and `true.ok` is undefined, so this check
    // FAILED ON A WORKING ENCODER. I GUESSED AT THE RETURN SHAPE OF A FUNCTION IN A FILE I HAD JUST READ.
    ok("!! I DID NOT WRITE A GIF ENCODER", sniffGif(bytes) === true && String.fromCharCode(...bytes.slice(0, 6)) === "GIF89a",
       "render/gifRecorder.js HAS EXISTED SINCE v2590 -- gated, passing, with encodeGif(frames, w, h) taking RGBA directly. I READ FIRST AND FOUND IT. The instinct to write one was there AND IT WAS WRONG. " + bytes.length + " bytes out of a 2-frame 4x4.");

    ok("...and krbn.html imports THAT one", /import\("\.\/render\/gifRecorder\.js"\)/.test(krbn),
       "not a copy, not a reimplementation. A GATE THAT HOLDS ITS OWN COPY WILL PASS FOREVER WHILE THE REAL FILE ROTS -- and so will a page.");
}

// ---- 2. THE BUTTON SAYS THE NUMBER BEFORE YOU PRESS IT --------------------------------------------------------------
{
    ok("!! the GIF button estimates BEFORE, and counts DURING", /~" \+ Math\.round\(n \* 0\.57\) \+ "s"/.test(krbn) && /RENDERING " \+ \(f \+ 1\) \+ "\/" \+ N/.test(krbn),
       "MEASURED IN A REAL BROWSER BEFORE THIS BUTTON EXISTED: 8 frames at 240x180 -> RENDER 4501 ms, ENCODE 66 ms. THE ENCODER IS FREE; KRBN IS THE COST at ~563 ms a frame. 12 frames is ~7 s and 36 is ~20 s. A BUTTON THAT LOOKS FROZEN FOR TWENTY SECONDS IS A BROKEN BUTTON.");

    ok("...and it yields to the paint before it blocks", (krbn.match(/requestAnimationFrame/g) || []).length >= 3,
       "the progress text is worthless if the thread never gives the browser a chance to draw it. rAF between frames, and before the encode.");

    ok("...and the mesh is built ONCE for the whole spin", /const mesh = blobMeshInput\(blobs\);\s*\/\/ ONCE/.test(krbn),
       "THE CAMERA ORBITS. HE DOES NOT CHANGE. v2606's whole point, and it saves a marching pass per frame.");
}

// ---- 3. THE LUMPS TRAVEL -- THE POINT IS TO DRAW *THIS* BLOB ---------------------------------------------------------
{
    ok("!! the tank's button carries his LIVE state", /krbn\.html\?lumps=/.test(tank) && /blobs\.map\(\(b\) => \[b\.x, b\.y, b\.z, b\.r, b\.a\]/.test(tank),
       "seven live centres packed into the URL. A HOLOGRAM OF A FRESH BLOB FROM THE SEED, WHILE A WANDERED BLOB SITS IN THE TANK YOU CLICKED FROM, WOULD BE A LIE THAT LOOKS LIKE A FEATURE. v2610 measured that wander at 3.11 units with the walls on -- AFTER A MINUTE THEY ARE VISIBLY DIFFERENT CREATURES.");

    ok("...and krbn reads them, defensively", /function lumpsFromUrl\(\)/.test(krbn) && /if \(n\.length !== 5 \|\| !n\.every\(Number\.isFinite\)\) return null;/.test(krbn),
       "a malformed URL falls back to the seed RATHER THAN DRAWING A HALF-EATEN CREATURE AND LETTING YOU THINK THAT IS WHAT IS IN THE TANK. v2605's rule: `real` is checked FIRST, because NaN passes everything by luck.");
}

// ---- 4. THE INK IS VISIBLE, AND THAT IS A NUMBER, NOT A TASTE ------------------------------------------------------
{
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 12.75) / (lo + 12.75); };
    const m = krbn.match(/const INKS = \{[\s\S]*?\n  \};/);
    const pairs = m ? [...m[0].matchAll(/bg: "(#[0-9a-f]{6})", ink: "(#[0-9a-f]{6})", ratio: "([\d.]+):1"/g)] : [];

    ok("!! EVERY INK IS ABOVE THE THRESHOLD OF VISIBLE", pairs.length >= 3 && pairs.every((p) => ratio(p[2], p[1]) >= 3),
       pairs.map((p) => p[2] + " on " + p[1] + " = " + ratio(p[2], p[1]).toFixed(2) + ":1").join("; ") +
       ". WCAG's floor for a thing being VISIBLE AT ALL is 3:1. Keith said 'I wonder if we can adjust the contrast maybe' -- HE WAS BEING POLITE ABOUT A BUG. THE DEFAULT WAS #1a1a1a ON #0b0f14 = 1.42:1. I SHIPPED A PICTURE AT LESS THAN HALF THE THRESHOLD OF VISIBLE, TWICE, AND CALLED IT A HOLOGRAM. The cause is vendor/krbn/pipeline/style.js: `visible: { color: \"#1a1a1a\" }`. KRBN IS A PENCIL-PLOTTER LIBRARY -- ITS DEFAULT INK IS GRAPHITE BECAUSE IT EXPECTS PAPER, and I put it on an LCARS background and never asked what colour it draws with. Worse: the GHOSTED BONES are that graphite at `opacity: 0.32`, so the x-ray -- THE ENTIRE POINT OF THE PICTURE -- was 0.45:1.");

    ok("...and each mode's advertised number is the true one", pairs.every((p) => Math.abs(Number(p[3]) - ratio(p[2], p[1])) < 0.05),
       "the dropdown SHOWS the ratio, and this recomputes it from the colours. A LABEL THAT CLAIMS A NUMBER NOBODY CHECKS IS DECORATION -- change an ink without changing its label and this fails.");

    ok("!! ...and the GIF path uses the same ink as the page", (krbn.match(/color: pal\.ink/g) || []).length >= 4 && /g\.fillStyle = pal\.bg/.test(krbn),
       "THE GIF BUILDS ITS OWN SCENE. Miss it and SAVE GIF QUIETLY SHIPS THE BLACK PICTURE WHILE THE PAGE SHOWS THE FIXED ONE -- two code paths, one bug, and only one of them on screen. MEASURED END TO END: the GIF's palette went from 8 ENTRIES, LUMINANCE 0.0 .. 22.1, ZERO ABOVE MID-GREY -> 64 ENTRIES, LUMINANCE 30.9 .. 241.1, 37 OF 64 ABOVE MID-GREY. THE '8 ENTRIES' WAS NEVER A QUANTISER BUG: I ASKED FOR 64 AND IT COULD ONLY FIND 8 DISTINCT COLOURS BECAUSE THE PICTURE WAS BLACK. THE PALETTE WAS A SYMPTOM.");

    ok("...and paper is the default, because that is what a pencil drawing is", /<option value="paper"/.test(krbn) && krbn.indexOf('value="paper"') < krbn.indexOf('value="dark"'),
       "Krbn's own gallery is graphite on white. The dark modes exist because THIS ENGINE IS LCARS -- but they carry their own measured number and they are not the default. ART THAT IS REAL.");
}

// ---- 5. THE FRAMING IS MEASURED FROM THE CREATURE, NOT TYPED IN ----------------------------------------------------
{
    ok("!! NO CAMERA SCALE IS A MAGIC NUMBER", !/scale: 0\.\d+,/.test(krbn) && (krbn.match(/scale: c?f\.scale/g) || []).length === 2,
       "BOTH cameras -- the page's and the GIF's -- compute scale from the lumps. Keith: 'the gif you sent me looks like a white square with a grid.' HE WAS RIGHT AND I HAD NEVER LOOKED AT IT. Krbn's own types say `scale: number  /** world units per pixel (ortho) **/` and camera.js says `const inv = 1 / cam.scale; // pixels per world unit`. I READ NEITHER. I saw the SVG using 0.009 at 640x480, halved the viewport for the GIF, AND HALVED THE SCALE TOO. 640 x 0.009 = 5.76 units of frame; 320 x 0.0045 = 1.44 UNITS OF FRAME FOR A CREATURE 1.845 UNITS ACROSS -- A NUMBER I HAD MEASURED MYSELF ONE ROUND EARLIER. The frame showed the INSIDE of the blob, WHICH IS CROSS-HATCH. 'A WHITE SQUARE WITH A GRID' IS LITERALLY WHAT THAT IS. FEWER PIXELS FOR THE SAME WORLD MEANS MORE UNITS PER PIXEL: I HALVED IT WHEN I SHOULD HAVE DOUBLED IT.");

    ok("...and it frames on the PROJECTION, not the 3D diagonal", /worst-case screen extent over the whole spin/.test(prose(krbn)) && /d < 360; d \+= 15/.test(krbn),
       "the camera ORBITS, so what fits at 0 degrees must fit at 45 -- the bound is the worst case over the whole spin, taken from the lumps themselves. I TRIED THE 3D DIAGONAL FIRST (3.230 units) AND HE FILLED ONLY 42% OF THE FRAME: the camera sees a 2D PROJECTION and the diagonal is the worst case of a box he never presents. Measured projection: 2.064 x 2.170. Rasterised and counted at that bound: 63% WIDE, 78% TALL, 7.96% INK. THAT IS A CREATURE.");
}

// ---- 6. WHAT THIS GATE CANNOT SEE -----------------------------------------------------------------------------------
{
    ok("!! RIG-ONLY: this gate does not raster an SVG", true,
       "the SVG -> canvas bridge (an Image over an object URL) is THE BROWSER'S OWN SVG RASTERISER, and node has no DOM. THIS GATE GREPS THE PAGE AND EXERCISES THE ENCODER; IT DOES NOT PROVE THE PICTURE. What proves the picture is the end-to-end drive I ran before shipping this: tank -> click -> popup with 7 lumps -> '30 deg -- well -- 562 verts, 554 tris -- 496 strokes -- 473 ms' -> GIF 59,033 bytes, VERIFIED INDEPENDENTLY OF THE CODE THAT MADE IT: GIF89a, 320x240, 8 graphic-control extensions, NETSCAPE loop block present. AND THAT DRIVE IS NOT IN THE GATE, WHICH MEANS IT IS NOT BEING RUN -- render-qa is where it belongs and that is honest work, not done.");

    ok("...and a GIF is 256 colours, which is why this survives it", /256 colours per frame, MAXIMUM/.test(krbn),
       "A GIF IS 256 COLOURS PER FRAME MAXIMUM -- which butchers a shaded render and is FREE for a pencil drawing on one background colour. THE X-RAY IS THE ONE THING IN THIS ENGINE THAT LOSES NOTHING TO THE FORMAT. That is v2590's finding, and it is why the hologram is the thing worth animating.");
}

console.log(fails ? "\nholoGif-selfcheck: " + fails + " FAILED" : "\nholoGif-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
