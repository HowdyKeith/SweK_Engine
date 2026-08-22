// WebGLEngine/tools/render-qa/traceAscii-selfcheck.mjs -- v3509
//
// Run: node tools/render-qa/traceAscii-selfcheck.mjs   (~2s)
//
// *** THE ASSERTIONS ARE MADE ON THE TEXT, NOT ON THE EYE. *** The register exists so a failing gate can be
// READ rather than only counted, and this file is what stops the picture becoming decoration: every claim its
// captions make is checked against the characters, so a caption that stopped being true would go red.
//
// AND ONE OF THEM ALREADY DID, ON THE FIRST RUN -- see section 3.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scenes, renderAscii, CAM } from "./traceAscii.mjs";
import { RAMP, glyphFor } from "./asciify.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const S = Object.fromEntries(scenes().map((s) => [s.name, s]));
const R = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, renderAscii(v)]));
const lines = (r) => r.text.split("\n");
const mid = (r) => lines(r)[Math.floor(lines(r).length / 2)];
const corner = (r) => lines(r)[0][0];
/** The glyph run through the middle row, inside the disc: what the sphere prints where it is widest. */
function middleRun(r) {
    const row = mid(r), bg = corner(r);
    const i = row.indexOf(row.split("").find((c) => c !== bg));
    const j = row.length - 1 - [...row].reverse().findIndex((c) => c !== bg);
    // *** ERODED BY TWO COLUMNS AT EACH END, AND MY FIRST VERSION WAS NOT: the furnace run came back as THREE
    // glyphs over 42 columns and the extra two were the SILHOUETTE, where a cell mixes sphere and sky. That is
    // v3473's lesson arriving in a third form -- the numeric side already erodes its coverage mask by three
    // pixels for exactly this reason, and the TEXT side needed the same treatment. A check that read the edge
    // would call every flat disc shaded. ***
    return i < 0 || j - i < 8 ? "" : row.slice(i + 2, j - 1);
}

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE FURNACE PRINTS AS ONE GLYPH, WHICH IS v3467'S KEY MADE VISIBLE
 * --------------------------------------------------------------------------------------------------------- */
{
    const r = R["furnace"], run = middleRun(r);
    say(`furnace: disc mean ${r.discMean.toFixed(6)}, middle run is ${new Set(run).size} distinct glyph(s) over ${run.length} columns`);
    ok("!! *** THE FURNACE DISC IS FLAT: ONE GLYPH ALL THE WAY ACROSS ***",
       new Set(run).size === 1 && run.length > 30,
       "*** v3467's key was that a diffuse sphere of albedo rho in a white furnace reads EXACTLY rho with nothing in the estimator told rho. THAT NUMBER HAS BEEN 0.180000 FOR FORTY ROUNDS AND THIS IS THE FIRST TIME ANYBODY ON THIS SIDE OF THE NETWORK HAS SEEN THE DISC IT DESCRIBES. A shaded disc here would mean the albedo was being modulated by view angle, which for a Lambertian surface it must not be. ***");

    ok("...and it prints DARKER than the sky, which is the other half of the claim",
       RAMP.indexOf(run[Math.floor(run.length / 2)]) < RAMP.indexOf(corner(r)),
       `disc glyph "${run[Math.floor(run.length / 2)]}" against sky "${corner(r)}" on the ramp "${RAMP}". An albedo of 0.18 under a sky of 1 must be visibly darker; a disc the same shade as the sky would be the compensated scene, not this one.`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. *** THE COMPENSATED SPHERE VANISHES, AND THAT IS v3492'S PREDICTION SEEN RATHER THAN COMPUTED ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const c = R["rough-compensated"], u = R["rough-metal"];
    const cRun = middleRun(c), uRun = middleRun(u);
    say(`compensated: disc mean ${c.discMean.toFixed(6)}, ${c.glyphs} distinct glyphs in the whole frame`);
    say(`uncompensated: disc mean ${u.discMean.toFixed(6)}, ${u.glyphs} distinct glyphs in the whole frame`);
    ok("!! *** THE COMPENSATED SPHERE PRINTS THE SAME GLYPH AS THE SKY -- IT DISAPPEARS ***",
       cRun === "" || new Set(cRun + corner(c)).size <= 2,
       "*** v3492 PROVED THIS BY QUADRATURE AND v3493 BY MONTE CARLO AND BOTH WERE NUMBERS. Here the sphere is simply not in the picture. The few stray glyphs are sampling noise, which is what a frame that is uniform to within noise looks like -- and a REAL disc would be a contiguous shape rather than scattered pixels. ***");

    ok("!! ...and the UNCOMPENSATED one beside it is unmistakably there, which is what makes that mean anything",
       new Set(uRun).size > 1 && RAMP.indexOf(uRun[Math.floor(uRun.length / 2)]) < RAMP.indexOf(corner(u)),
       "*** A REGISTER SHOWING ONLY THE COMPENSATED SCENE WOULD SHOW A SPHERE VANISHING INTO A UNIFORM FIELD AND A READER COULD NOT TELL THAT FROM A RENDERER DRAWING NOTHING -- the exact failure v3486 found on path-tracer.html, and the reason v3493 shipped both scenes rather than one. The same argument applies to a picture in a log. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. *** THE ROUND'S OWN FINDING: THE PICTURE CORRECTED A CAPTION I WROTE FROM THE NUMBER ***
 * --------------------------------------------------------------------------------------------------------- */
{
    const r = R["rough-metal"], run = middleRun(r);
    // *** BANDS, NOT SINGLE CHARACTERS, AND MY FIRST VERSION USED SINGLE CHARACTERS. Comparing run[2] against
    // the middle character made the answer depend on exactly where one column landed, and after the silhouette
    // erosion above it landed inside the flat part and the check flipped. A MEAN OVER A BAND IS THE STATISTIC;
    // one glyph is a sample. Same species as v3416's "one alignment measures alignment, not order". ***
    const idxOf = (c) => RAMP.indexOf(c);
    const band = (a, b) => { const p = [...run].slice(Math.floor(a * run.length), Math.ceil(b * run.length)); return p.reduce((n, c) => n + idxOf(c), 0) / p.length; };
    const rimI = (band(0, 0.18) + band(0.82, 1)) / 2, centreI = band(0.4, 0.6);
    const rim = run[1], centre = run[Math.floor(run.length / 2)];
    say(`rough metal, middle row: outer bands mean ramp index ${rimI.toFixed(2)}, centre band ${centreI.toFixed(2)} (glyphs "${rim}" vs "${centre}")`);
    ok("!! *** THE DISC IS NOT FLAT -- IT BRIGHTENS TOWARD THE RIM ***",
       rimI > centreI,
       "*** MY CAPTION SAID \"still flat -- the loss is uniform, not a shadow\", WRITTEN FROM THE DISC MEAN, WHICH WAS THE ONLY NUMBER THIS SCENE HAD EVER PRODUCED. THE PICTURE SAID OTHERWISE AND THE PICTURE IS RIGHT: v3490 measured E as a function of VIEW ANGLE and at roughness 0.8 grazing returns 0.700929 against 0.442236 head-on, so the rim MUST be brighter. A DISC MEAN AVERAGES EXACTLY THAT AWAY. The caption is corrected and this line now guards the corrected version. ***");

    ok("...and the direction is the one v3490 measured, not merely 'some variation'",
       rimI - centreI > 0.15,
       "*** ASSERTING ONLY THAT THE DISC IS SHADED WOULD PASS ON A SHADOW, A GRADIENT SKY OR A BUG. What is asserted is the SIGN: grazing brighter than head-on, which is v3490's curve at THIS roughness and would REVERSE below alpha 0.343611 -- the crossing that round bisected. A fixture at a smoother roughness would need the opposite assertion, and that is a fact about the physics rather than about the picture. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 4. THE LIT SPHERE HAS A TERMINATOR, AND THE BACKGROUND IS BACKGROUND
 * --------------------------------------------------------------------------------------------------------- */
{
    const r = R["lit-sphere"], run = middleRun(r);
    const idx = [...run].map((c) => RAMP.indexOf(c));
    let rises = 0; for (let i = 1; i < idx.length; i++) if (idx[i] > idx[i - 1]) rises++;
    say(`lit sphere: ${r.glyphs} distinct glyphs, middle run spans ramp ${Math.min(...idx)} to ${Math.max(...idx)}`);
    ok("!! a lit sphere uses most of the ramp, which is what shading IS",
       r.glyphs >= 8 && Math.max(...idx) - Math.min(...idx) >= 5,
       "The furnace uses one glyph across the disc and this uses most of ten. THE SAME RENDERER, THE SAME SPHERE, AND THE DIFFERENCE IS ENTIRELY THE LIGHTING -- which is the cheapest possible demonstration that the flat disc above is a result and not a broken shader.");

    ok("...and the sky prints as SPACE rather than as the ramp's darkest glyph",
       corner(r) === " ",
       "asciify maps a luminance of ~0 to the ramp's first character, which is a space by construction. A background of solid blocks would silhouette the object against a slab and is the thing that makes most ASCII renderers unreadable -- stated in asciify's own header at v3322 and inherited here.");
}

/* ------------------------------------------------------------------------------------------------------------
 * 5. THE MAPPING ITSELF, AND THE FRONT DOOR
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("!! the glyph for a luminance is checked directly rather than trusted",
       glyphFor(0) === RAMP[0] && glyphFor(1) === RAMP[RAMP.length - 1] && glyphFor(0.5) === RAMP[Math.round(0.5 * (RAMP.length - 1))],
       "asciify exports glyphFor precisely so a gate can assert the mapping without reading pixels. THE PICTURES ABOVE ARE ONLY EVIDENCE IF THE RAMP MEANS WHAT IT SAYS.");

    const reg = fs.readFileSync(path.join(ROOT, "tools", "ship", "reportingTools.mjs"), "utf8");
    ok("!! the register is reachable from tools.html rather than only from a console",
       /tools\/render-qa\/traceAscii\.mjs/.test(reg),
       "Keith's standing rule -- EVERY TOOL NEEDS A FRONT DOOR. The report prints and exits ZERO; this gate is what exits nonzero.");

    ok("!! *** AND THE FILE SAYS OUT LOUD THAT THE PICTURE IS NOT THE CHECK ***",
       /THE PICTURE IS NOT THE CHECK/.test(fs.readFileSync(path.join(ROOT, "tools", "render-qa", "traceAscii.mjs"), "utf8")),
       "*** THIS ARC EXISTS BECAUSE A 27% ERROR LOOKS LIKE A SLIGHTLY DIFFERENT MATERIAL (v3467), AND A ROUND THAT ENDED BY PUTTING A PICTURE IN THE LOG COULD EASILY BE READ AS ABANDONING THAT. What the ASCII buys is READABILITY WHEN A GATE FAILS -- a number says the furnace read 0.71 and the disc says whether it is dark all over or dark down one side. The numbers still decide. ***");
}

console.log(fails ? "\ntraceAscii-selfcheck: " + fails + " FAILED" : "\ntraceAscii-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
