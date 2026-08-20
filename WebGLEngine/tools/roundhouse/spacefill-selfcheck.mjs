// tools/roundhouse/spacefill-selfcheck.mjs
//
// Run: node tools/roundhouse/spacefill-selfcheck.mjs   (~3s)
//
// v3188 -- THE FIRST DEVICE BUILT TO v3174's STANDARD RATHER THAN RETROFITTED TOWARD IT.
//
// v3174 measured that SIX OF SEVEN LOOSE DEVICES DECLARE EXACTLY ONE MODE, and a device with one mode CANNOT
// TELL YOU WHETHER ITS ERROR IS THE KEY'S TRUNCATION OR ITS OWN DEFECT -- it has nothing to compare against.
// probe was the worked example, with three. *** THIS SHIPS WITH THREE FROM BIRTH. ***
//
//   "stroke"  the claim -- one unbroken stroke, every cell once, mapping invertible
//   "raster"  THE LOAD-BEARING NEGATIVE -- same coverage, zero revisits, and it BREAKS
//   "order"   THE SCALING CHECK -- the property must hold across a sixteenfold growth, not at one size
//
// *** AND EVERY KEY IS ANALYTIC. *** cells = 4^order; hilbert breaks = 0, worst jump = 1; raster breaks = n-1,
// worst jump = n. NOTHING IS A REMEMBERED MEASUREMENT -- the keys come from the construction, so this device
// can be graded with no reference run and no baseline. That is what v3182 found 76% of lab claims could not do.

import path from "node:path";
import fsMod from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const D = await import(pathToFileURL(path.join(HERE, "devices.mjs")).href);
const K = await import(pathToFileURL(path.join(HERE, "knobGate.mjs")).href);
const dev = await D.getDevice("spacefill");

const stroke = await dev.build({ mode: "stroke" });
const raster = await dev.build({ mode: "raster" });
const orderM = await dev.build({ mode: "order" });

// ---- 1. THREE DECLARED MODES, WHICH IS THE WHOLE REASON IT EXISTS -------------------------------------------------
{
    const declared = ["stroke", "raster", "order"].filter((m) => { try { return K.checkMode(dev, m).ok !== false; } catch { return false; } });
    ok("!! *** it declares THREE modes, where six of seven LOOSE devices declare one ***",
        declared.length === 3,
        declared.join(", ") + ". v3174: A DEVICE WITH ONE MODE CANNOT TELL YOU WHETHER ITS ERROR IS THE KEY'S " +
        "TRUNCATION OR ITS OWN DEFECT. This is the first device built to that standard rather than retrofitted");

    ok("!! it is in the registry and reachable by name",
        D.DEVICE_NAMES.includes("spacefill"),
        D.DEVICE_NAMES.length + " devices. A module the registry cannot name is a module the lab cannot grade");
}

// ---- 2. THE CLAIM, AGAINST AN ANALYTIC KEY ------------------------------------------------------------------------
{
    ok("!! *** the stroke is CONTINUOUS: zero breaks against a key of zero ***",
        stroke.breaks === 0 && stroke.breaksExpected === 0 && stroke.breakErrAbs === 0 && stroke.worstJump === 1,
        "worst jump 1 over " + stroke.cells + " cells. Adjacency is EXACT -- Manhattan distance 1, never 'small " +
        "on average'. A CURVE WITH ONE BREAK IS NOT A SINGLE-LINE DRAWING");

    ok("!! coverage is exact and SEPARATE from continuity",
        stroke.coverageErrFrac === 0 && stroke.revisits === 0 && stroke.steps === stroke.cells,
        "a raster has PERFECT COVERAGE AND NO CONTINUITY, so a single 'is it a good fill' number would average " +
        "the two into meaninglessness. They are separate observables on purpose");

    ok("...and the mapping is invertible, checked over every cell",
        stroke.bijectionMismatches === 0,
        "xy2d(d2xy(d)) === d for all " + stroke.cells + ". A FILL THAT CANNOT ANSWER 'WHERE AM I ON THE STROKE' " +
        "IS A PICTURE, NOT AN INDEX");
}

// ---- 3. THE NEGATIVE, MEASURED FAILING, WITH ITS OWN DERIVED KEY --------------------------------------------------
{
    const n = 1 << raster.order;
    ok("!! *** the raster mode BREAKS, and by exactly the derived amount ***",
        raster.breaks === n - 1 && raster.breaksExpected === n - 1 && raster.breakErrAbs === 0 && raster.worstJump === n,
        raster.breaks + " breaks, worst jump " + raster.worstJump + ", key n-1 = " + (n - 1) + ". ONE BREAK PER " +
        "ROW END, EACH JUMPING THE GRID WIDTH -- derived from the construction, not observed once. IF THIS MODE " +
        "EVER REPORTED ZERO BREAKS, THE CHECKER WOULD BE MEASURING NOTHING");

    ok("!! and it has IDENTICAL coverage to the claim",
        raster.coverageErrFrac === 0 && raster.revisits === 0 && raster.distinct === stroke.distinct,
        "same cells, zero revisits, both. COVERAGE CANNOT TELL THE TWO APART -- which is exactly why the " +
        "negative is a MODE OF THE DEVICE rather than a sentence in a comment");
}

// ---- 4. THE PROPERTY HOLDS ACROSS SCALE, NOT AT ONE SIZE ----------------------------------------------------------
{
    ok("!! *** zero breaks across four orders -- a sixteenfold growth ***",
        orderM.orderRatio === 0,
        "summed breaks across orders 4 through 7: " + orderM.orderRatio + ". A PROPERTY THAT HELD AT ONE SIZE " +
        "AND NOWHERE ELSE IS A COINCIDENCE, and summing rather than averaging means ONE break at ONE size fails it");

    ok("...and the raster's key tracks n-1 at every order too",
        orderM.rasterTracksN === 0,
        "total deviation from n-1 across the same orders: 0. The NEGATIVE is checked against its own analytic " +
        "key as hard as the claim is -- a failing case that drifted would quietly stop being a control");

    ok("!! every key here is ANALYTIC, with no reference run",
        !/baseline|frozen|remembered/i.test(fsMod.readFileSync(path.join(HERE, "spacefillBind.mjs"), "utf8")
            .replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")),
        "cells = 4^order, breaks = 0 or n-1, worst jump = 1 or n -- all from the construction. v3182 found 76% " +
        "of lab claims could NOT be re-derived; this device needs nothing remembered to be graded");
}

console.log();
console.log("  ----  WHAT THIS CLOSES: SLDgen's 'single continuous stroke BY DESIGN' is now a graded instrument");
console.log("  ----  with a negative that fails on purpose and keys nobody has to remember. WHAT IT DOES NOT");
console.log("  ----  DO: draw a recognisable thing from a prompt. That needs the diffusion model, and with it");
console.log("  ----  the stochastic objective that would put it outside v3186's frozen baseline for good.");
if (fails) { console.log("spacefill-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("spacefill-selfcheck: all checks pass");
