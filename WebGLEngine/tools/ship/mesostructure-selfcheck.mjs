// WebGLEngine/tools/ship/mesostructure-selfcheck.mjs
//
// Run: node tools/ship/mesostructure-selfcheck.mjs   (~0.1s -- MEASURED)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// v3253 -- WHAT A HEIGHTFIELD CANNOT SAY, PROVED RATHER THAN ASSERTED.
//
// Keith: "tessellation makes it possible to add non-height field mesostructural details to geometry."
//
// That sentence names the exact boundary pom-demo.html lives on, AND pom-demo NEVER SAID SO -- grepping it for
// silhouette / overhang / heightfield / cannot returned nothing. A page demonstrating a convincing depth effect
// with no statement of what the effect cannot represent is this tree's own failure mode: A CLAIM WITHOUT ITS
// LIMIT.
//
// *** THE BROWSER HAS NO TESSELLATION STAGE. *** Neither WebGL2 nor WebGPU exposes one, so the technique as
// quoted is not something SweK is declining to build -- it is unavailable. THE CAPABILITY IS ALREADY HERE BY
// ANOTHER ROUTE: a voxel DDA marches a VOLUME (v2782), and a volume has no one-height-per-texel restriction.
// So the answer to "is there a further implementation" is NO -- the ray marcher IS the implementation, and what
// was missing was the proof of where the line falls.
//
// *** AND THE MEASUREMENT IS SHARPER THAN THE PROSE WAS. *** On the fixture, the heightfield LOSES NOTHING and
// INVENTS 84 CELLS: it keeps every solid voxel and packs the air beneath the overhang solid, because a column
// must have exactly one surface. THAT IS WHY POM IS CONVINCING AND WRONG -- you never see geometry go missing,
// you see solid where there should be a gap.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const M = await import(pathToFileURL(path.join(ROOT, "tools", "render-qa", "mesostructure.mjs")).href);
const modRaw = fs.readFileSync(path.join(ROOT, "tools", "render-qa", "mesostructure.mjs"), "utf8");
const pomRaw = fs.readFileSync(path.join(ROOT, "pom-demo.html"), "utf8");

// ---- 1. THE LOSS IS DEMONSTRATED, NOT DESCRIBED --------------------------------------------------------------------------
{
    const vol = M.overhangVolume();
    const f = M.heightFieldFidelity(vol);

    ok("!! *** a heightfield cannot represent the fixture, and the numbers say how ***",
        f.faithful === false && f.invented > 0 && f.cells === 384 && f.solidCells === 108,
        M.mesoReceipt(vol));

    ok("!! ...and it LOSES NOTHING while INVENTING 84 -- which is the whole reason POM convinces",
        f.lost === 0 && f.invented === 84,
        "the roof survives because it IS the top of its column; what disappears is THE AIR BENEATH IT, packed " +
        "solid so the column has exactly one surface. YOU NEVER SEE GEOMETRY GO MISSING, YOU SEE SOLID WHERE " +
        "THERE SHOULD BE A GAP -- a failure that looks like success");

    ok("!! ...and the count of unrepresentable columns is explicit",
        M.columnsWithMultipleSurfaces(vol) === 12 &&
        M.surfaceCrossings(vol, 12).filter((c) => c.kind === "enter").length === 2,
        "12 of 24 columns have more than one surface. A heightfield answers 'where is the surface' with ONE " +
        "number and a volume answers with a LIST -- the length of that list IS the property under test");
}

// ---- 2. IT CAN ALSO SAY "NO DIFFERENCE HERE" -----------------------------------------------------------------------------
{
    const flat = M.overhangVolume({ w: 8, h: 6 });
    for (let i = 0; i < flat.solid.length; i++) flat.solid[i] = (i % 48) < 24 ? 1 : 0;
    const f = M.heightFieldFidelity(flat);

    ok("!! a flat volume reports EXACT, and warns that exact is not sufficient",
        f.faithful === true && /not evidence the technique is sufficient/.test(M.mesoReceipt(flat)),
        "A CHECK THAT CANNOT PASS PROVES NOTHING. And the passing wording refuses the obvious misreading: a " +
        "heightfield being exact on a flat fixture says the FIXTURE is flat, not that the technique is enough");
}

// ---- 3. THE LOSS HAPPENS IN THE PROJECTION, NOT THE TRACER ----------------------------------------------------------------
{
    ok("!! the module says WHERE the information is destroyed",
        /projection is\s*\n?\s*\/\/ lossy BEFORE any shading/.test(modRaw) || /lossy BEFORE any shading/.test(modRaw),
        "building the heightfield is a projection from a volume to a function, and it is lossy BEFORE a single " +
        "shading step runs -- so no amount of refinement, silhouette clipping or extra POM layers can recover " +
        "it. Somebody will otherwise try to fix this in the shader");

    ok("...and the two error kinds are kept apart",
        /invented/.test(modRaw) && /lost/.test(modRaw) && !/errors\s*=/.test(noComments(modRaw)),
        "A SINGLE 'ERROR' COUNT WOULD AVERAGE A HOLE THAT VANISHED AGAINST A HOLE THAT WAS NEVER THERE -- they " +
        "are different failures and only one of them is happening here");
}

// ---- 4. THE LIMIT IS ON THE PAGE THAT DEMONSTRATES THE TECHNIQUE ----------------------------------------------------------
{
    ok("!! *** pom-demo.html now states what POM cannot represent ***",
        /unrepresentable/.test(pomRaw) && /one height per texel/i.test(pomRaw) && /silhouette never moves/i.test(pomRaw),
        "the page demonstrated a convincing depth effect and said NOTHING about its boundary. A CLAIM WITHOUT " +
        "ITS LIMIT is what this tree spends its rounds removing, and the caveat belongs where somebody is " +
        "looking at the effect");

    ok("!! ...and the number on the page is COMPUTED, not typed",
        /mesoReceipt\(overhangVolume\(\)\)/.test(pomRaw),
        "a caveat carrying a hand-written figure is a claim that can go stale silently -- on a page about a " +
        "technique that looks right while being wrong");

    ok("...and it points at the route that DOES work",
        /ray-march-demo/.test(pomRaw) && /no tessellation stage/i.test(pomRaw),
        "naming a limit without naming the alternative leaves somebody trying to fix POM. The browser has no " +
        "tessellation stage, so THE RAY MARCHER IS THE IMPLEMENTATION -- there is no further one to build");
}

// ---- 5. THE TWO TRACERS, AND THE CONTROL THAT MAKES THE DIFFERENCE MEAN ANYTHING (v3254) --------------------------------
{
    const { amplifiedDiff, diffReceipt } =
        await import(pathToFileURL(path.join(ROOT, "tools", "render-qa", "amplifiedDiff.mjs")).href);
    const W = 96, H = 64;
    const vol = M.overhangVolume();
    const d = amplifiedDiff(M.traceVolume(vol, { W, H }), M.traceHeightfield(vol, { W, H }), { gain: 80 });

    ok("!! *** the two tracers DISAGREE on a volume with an overhang ***",
        d.stats.differing > 1000 && d.stats.identical === false,
        diffReceipt(d.stats) + " -- rendered in PLAIN JAVASCRIPT at 96x64 on purpose: a WebGL version would look " +
        "better and COULD NOT BE CHECKED HERE AT ALL, and the property under test is geometric rather than shaded");

    // *** THE CONTROL IS THE CHECK THAT MATTERS. *** Without it, 31% could be any difference at all -- a camera
    // off by a pixel, a shading constant, a rounding rule. A comparison that CANNOT come out identical is
    // measuring its own setup, and this tree has spent a session finding numbers that described the instrument.
    const flat = M.overhangVolume({ w: 24, h: 16 });
    for (let x = 0; x < flat.w; x++) for (let y = 0; y < flat.h; y++) flat.solid[flat.at(x, y)] = y < 5 ? 1 : 0;
    const c = amplifiedDiff(M.traceVolume(flat, { W, H }), M.traceHeightfield(flat, { W, H }), { gain: 80 });

    ok("!! *** and they agree EXACTLY on a flat one -- zero differing pixels ***",
        c.stats.differing === 0,
        c.stats.differing + " differ of " + c.stats.pixels.toLocaleString() + ". THIS IS WHAT MAKES THE 31% A " +
        "FACT ABOUT THE PROJECTION rather than about my camera: same volume, same ray, same shading, and the " +
        "ONLY line that differs between the tracers is the occupancy test");

    const modSrc = fs.readFileSync(path.join(ROOT, "tools", "render-qa", "mesostructure.mjs"), "utf8");
    ok("...and the source says which line that is",
        /<-- THE ONLY DIFFERENCE/.test(modSrc),
        "a reader comparing two 20-line tracers should not have to diff them by eye to find the one that " +
        "matters -- and if a second difference ever creeps in, the control above goes red before anybody reads it");

    const page = fs.readFileSync(path.join(ROOT, "heightfield-vs-volume.html"), "utf8");
    ok("!! ...and the control runs ON THE PAGE, not only in this gate",
        /Control &mdash; a flat volume/.test(page) && /measuring its own setup/.test(page),
        "somebody looking at a 31% difference should be able to see ON THE SAME SCREEN that these two tracers " +
        "CAN agree. Otherwise the number is unfalsifiable from where they are standing");
}

console.log();
console.log("  ----  WHAT THIS DOES NOT DO: render either technique. It proves the boundary in DATA -- a volume");
console.log("  ----  against the heightfield derived from it -- so the claim is a gate rather than a screenshot,");
console.log("  ----  and needs no GPU. Seeing the two SHADED side by side is a rig job, and v3252's amplified");
console.log("  ----  diff is the instrument for it: the interiors will agree and the overhang will light up.");
if (fails) { console.log("mesostructure-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("mesostructure-selfcheck: all checks pass");
