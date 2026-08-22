// WebGLEngine/physics/em/gridRefine-selfcheck.mjs -- v3632
//
// Run: node physics/em/gridRefine-selfcheck.mjs
//
// WHAT ADAPTIVITY COSTS, MEASURED RATHER THAN ARGUED.
//
// v3631 refused WAVELET's "dynamic grid that adapts as transmitters are added" under the greedyMesh3d rule and
// wrote down the key hiding in the refusal. This is that key. *** THE ANSWER IS ZERO AND IT NEEDS NO REFERENCE
// VALUE: in the continuum a refinement interface DOES NOT EXIST. Same eps, same mu, same c on both sides -- a
// change of cell size is a change in how the problem is written down, not in the problem. So every photon that
// comes back is pure numerical artefact and its size IS the price. The div-B shape. ***
//
// AND THE SECOND COST IS ARITHMETIC RATHER THAN MEASUREMENT, AND IT IS THE ONE NOBODY QUOTES: one time step is
// shared, so S_fine = ratio * S_coarse and stability limits the WHOLE domain by the FINEST cell. THE MAGIC TIME
// STEP THEREFORE EXISTS ON AT MOST ONE SIDE OF ANY REFINEMENT INTERFACE.

import { readFileSync } from "node:fs";
import { interfaceReflection, courantPair, makeGrid } from "./gridRefine.mjs";
import { cflLimit } from "./maxwell.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// --- 1. the control, and the key is zero ---------------------------------------------------------------------
{
    say("1. THE TRUE REFLECTION IS EXACTLY ZERO, because in the continuum there is no interface to reflect from.");
    const c1 = interfaceReflection({ ratio: 1 });
    ok("!! at ratio 1 the measurement reads EXACTLY zero", c1.coefficient === 0,
        "the non-uniform machinery reduces to the uniform scheme and adds NOTHING -- without this line every " +
        "number below could have been the fixture rather than the interface");
    ok("...and the incident pulse was actually there to be reflected", c1.incident > 0.4,
        "incident peak " + c1.incident.toFixed(6) + " at the probe, so the zero is a reading and not an empty run");
}

// --- 2. the price, and it SATURATES --------------------------------------------------------------------------
{
    say("2. REFLECTION AGAINST REFINEMENT RATIO, fine side held at its magic step S = 1.");
    const rows = [1, 1.5, 2, 3, 4, 6].map((ratio) => ({ ratio, q: interfaceReflection({ ratio }) }));
    for (const r of rows) say("     ratio " + String(r.ratio).padEnd(4) + " S_coarse " + r.q.courant.sCoarse.toFixed(4) +
        "   |r| " + r.q.coefficient.toExponential(3));
    ok("refining at all costs something, and refining more costs more", rows.slice(1).every((r, i) => r.q.coefficient > rows[i].q.coefficient),
        "monotone from " + rows[1].q.coefficient.toExponential(3) + " at 1.5x to " + rows[5].q.coefficient.toExponential(3) + " at 6x");
    ok("!! but the price SATURATES -- 6x costs only a third more than 2x, not three times more",
        rows[5].q.coefficient / rows[2].q.coefficient < 1.5,
        "2x -> 6x is " + (100 * (rows[5].q.coefficient / rows[2].q.coefficient - 1)).toFixed(1) + "% more reflection, " +
        "not 200%. The interface cost approaches a CEILING set by the coarse side alone, because as the ratio grows " +
        "the fine side becomes perfectly resolved and stops contributing. AN ENGINEERING NUMBER: the choice between " +
        "2x and 6x is not paid for at the interface");
}

// --- 3. and it is SECOND ORDER in the cell size ----------------------------------------------------------------
{
    say("3. RESOLUTION SWEEP at ratio 2. A better-resolved pulse should see less of the discretisation.");
    const errs = [7, 14, 28, 56].map((pulseWidth) => interfaceReflection({ ratio: 2, pulseWidth }).coefficient);
    const orders = errs.slice(1).map((e, i) => Math.log2(errs[i] / e));
    say("     pulse width 7, 14, 28, 56 coarse cells:  " + errs.map((e) => e.toExponential(3)).join("  "));
    ok("!! the interface reflection falls at SECOND ORDER in cell size, DERIVED not typed",
        orders.every((o) => o > 1.9 && o < 2.1),
        "orders " + orders.map((o) => o.toFixed(3)).join(", ") + " -- so the artefact is a discretisation error of " +
        "the same order as the scheme itself, and it does NOT go away faster than everything else does");
    say("   WHICH IS THE ACTUAL VERDICT ON ADAPTIVITY: the interface does not introduce a NEW order of error, it");
    say("   introduces MORE OF THE ORDER THAT WAS ALREADY THERE. That is a much better answer than either 'it is");
    say("   fine' or 'it is broken', and it is the one their README cannot give, having no test in it.");
}

// --- 4. THE COST THAT IS NOT A MEASUREMENT ---------------------------------------------------------------------
{
    say("4. ONE TIME STEP IS SHARED, SO S_fine = ratio * S_coarse AND THE FINEST CELL LIMITS THE WHOLE DOMAIN.");
    for (const ratio of [1, 2, 4]) {
        const c = courantPair({ ratio, sFine: 1 });
        say("     ratio " + ratio + "   S_fine " + c.sFine + "   S_coarse " + c.sCoarse +
            "   sides that can hold the magic step: " + c.magicSidesPossible);
    }
    ok("!! the magic time step exists on AT MOST ONE SIDE of any refinement interface",
        courantPair({ ratio: 1 }).magicSidesPossible === 2 && [1.5, 2, 3, 4].every((r) => courantPair({ ratio: r }).magicSidesPossible === 1),
        "and at ratio 1 -- which is to say, no refinement -- BOTH sides can, which is the only case where they do");
    ok("the coarse side is then dispersive by exactly the ratio", courantPair({ ratio: 4, sFine: 1 }).sCoarse === 0.25,
        "S_coarse = 1/ratio, so a 4x refinement leaves the coarse 3/4 of the domain running at a quarter of its " +
        "magic step -- and fdtd-selfcheck already measured that SHRINKING the step makes 1D FDTD WORSE, not better");
    ok("...and the stability ceiling is maxwell.mjs's, not a second opinion", cflLimit(1) === 1 &&
        courantPair({ ratio: 2, sFine: 1.2 }).stable === false && courantPair({ ratio: 2, sFine: 1 }).stable === true);
    say("   SO THE REAL PRICE OF ADAPTIVITY IN 1D IS NOT THE REFLECTION AT ALL -- IT IS THAT REFINING ANY PART OF");
    say("   THE GRID TAKES THE ONE EXACT CONFIGURATION AWAY FROM EVERY OTHER PART. The reflection is second order");
    say("   and bounded; losing the magic step is neither.");
}

// --- 5. three fixture artefacts, all from one cause ------------------------------------------------------------
{
    say("5. THREE THINGS THAT LOOKED LIKE PHYSICS AND WERE MY FIXTURE. All from a geometry fixed in CELLS.");
    const src = readFileSync(new URL("./gridRefine.mjs", import.meta.url), "utf8");
    ok("the geometry is DERIVED from the pulse width and the ratio, and the file records why",
        /THE GEOMETRY IS DERIVED FROM THE PULSE WIDTH, NOT FIXED/.test(src) && /standoff/.test(src),
        "(1) fixed steps meant the echo had not RETURNED at ratio 3 and 4, reading 1.1e-11 and 0.000e+0 -- " +
        "'refining more reflects less'. (2) a pulse 56 cells wide already STRADDLED the interface at t = 0, so a " +
        "resolution sweep was secretly a geometry sweep. (3) the fine zone was sized in CELLS not SPACE, so the " +
        "pulse hit ITS far wall and |r| saturated at 0.50 -- THE WHOLE PULSE -- for every ratio from 1.5 up");
    // MY FIRST VERSION OF THIS LINE WAS `/exact phrase/.test(src) || /saturates at/.test(src)` -- the fallback made
    // it pass on the loose half whatever the first said, which is a check that can barely fail. One phrase, no OR.
    ok("!! and the give-away is recorded beside the fix, not only in a changelog",
        /A reflection coefficient that saturates at/.test(src) && /it was measuring my far wall, not the interface/.test(src),
        "a coefficient reading one half at EVERY setting is not a measurement of anything, and the next reader of " +
        "this file meets that sentence before they trust a number from it");
    const g = makeGrid({ nCoarse: 10, nFine: 10, ratio: 2 });
    ok("makeGrid puts the coarse cells first and halves them after the split", g.dx[9] === 1 && g.dx[10] === 0.5 && g.splitAt === 10);
}

// --- 6. scope ---------------------------------------------------------------------------------------------------
{
    say("6. SCOPE.");
    const src = readFileSync(new URL("./gridRefine.mjs", import.meta.url), "utf8");
    ok("browser-safe: no node builtins, no DOM", !/from\s+["']node:/.test(src) && !/\bdocument\s*[.[]/.test(src));
    say("   NOT BUILT, AND STILL REFUSED: an actual adaptive grid. Nothing in this tree consumes an EM field volume");
    say("   and it already carries four meshers nobody imports -- the greedyMesh3d rule is unchanged and this round");
    say("   does not expire it. WHAT THIS IS: the number you would want BEFORE deciding to build one.");
    say("   NOT MEASURED HERE: subgridding with a separate fine-side time step and temporal interpolation (which");
    say("   buys back the magic step and costs its own interpolation error), 2D/3D interfaces where the reflection");
    say("   is angle-dependent, and a MOVING interface -- WAVELET's actual claim -- where the grid changes under a");
    say("   field that is already propagating. Each is its own round with its own key.");
}

console.log("gridRefine-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
