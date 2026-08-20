// tools/roundhouse/fmaAssumption-selfcheck.mjs
//
// v2970 -- contractFma IS LIVE. I SAID TWICE THAT IT WAS DEAD, AND I WAS WRONG BOTH TIMES.
//
// THE RECORD, because how the wrong answer was reached matters more than the right one:
//
//   v2947  Noticed cellMag(f32) and cellMag(f32, contractFma:true) returning the identical value, called the
//          knob "DEAD (suspect)" and deliberately deferred it. That was ONE input -- u0 = 0.3 -- and it happens
//          to be a point where the fused and unfused roundings agree. The same single-operating-point mistake
//          v2910 had already named in writing: "the sweep measures response at the DEFAULT operating point".
//
//   v2969  Repeated the claim in a gap inventory as a "confirmed defect". Confirmed by nothing; repeated.
//
//   v2970  Swept 400 offsets: 50 differ. Then ran a full-grid comparison that reported ZERO -- and that test was
//          also wrong: magmapEmulated returns { kernel, adapter, value }, so `a.values || a.cells || a` fell
//          through to the OBJECT, .length was undefined, and the loop never executed. A test that runs zero
//          iterations reports perfect agreement.
//
// THE ACTUAL MEASUREMENT, on the 441 points the grader really samples:
//
//     44 of 441 cells change. Worst relative change 1.91e-7, at u0 = 0.9434.
//
// So the knob is live, it bites ON the graded grid, and it moves the emulated reference by up to 1.9% of the
// registered tolerance (4.4% of the f32 floor). It cannot flip a verdict at 1e-5 -- but it is a real term in the
// reference every mobile GPU is measured against, not a vestige to delete.

import { cellMag, cellOffset, sampleTable, muPointF32 } from "./magmapKernel.mjs";
import { MAGMAP_TOL, F32_FLOOR } from "./magmapGpu.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const table = sampleTable(48, 48);
const both = (u0) => [cellMag(u0, 0.1, table, { precision: "f32" }), cellMag(u0, 0.1, table, { precision: "f32", contractFma: true })];

// ---- 1. THE KNOB IS LIVE ON THE GRID THE GRADER ACTUALLY USES -----------------------------------------------------------
{
    let differ = 0, worst = 0, worstAt = null;
    for (let k = 0; k < 441; k++) {
        const u0 = cellOffset(k, 21, 1.0).u0;
        const [a, b] = both(u0);
        if (!Object.is(a, b)) { differ++; const d = Math.abs(a - b) / Math.abs(a); if (d > worst) { worst = d; worstAt = u0; } }
    }
    ok("!! contractFma changes 44 of the 441 graded cells -- it is NOT a dead knob",
        differ === 44 && worst > 1e-7,
        differ + "/441 differ, worst " + worst.toExponential(3) + " at u0=" + worstAt.toFixed(4) + ". Claimed dead " +
        "in v2947 and again in v2969 on the strength of a single input");

    ok("...and the magnitude is real but below the tolerance",
        worst < MAGMAP_TOL && worst / MAGMAP_TOL > 0.005,
        "worst is " + (worst / MAGMAP_TOL * 100).toFixed(1) + "% of MAGMAP_TOL and " + (worst / F32_FLOOR * 100).toFixed(1) +
        "% of the f32 floor. It cannot flip a verdict at 1e-5, but it IS a term in the reference every mobile GPU " +
        "is graded against -- worth knowing when the tolerance is next revisited");
}

// ---- 2. THE POINT THAT FOOLED ME, PINNED SO IT CANNOT AGAIN --------------------------------------------------------------
{
    const [a, b] = both(0.3);
    ok("!! u0 = 0.3 genuinely gives identical results -- the single point the wrong claim rested on",
        Object.is(a, b),
        "the observation was correct; the INFERENCE from one point to the whole knob was not. This assertion " +
        "exists so the next reader sees why it looked dead and does not repeat the conclusion");
}

// ---- 3. THE LEAF IMPLEMENTS IT, AND THE PATH FORWARDS IT ------------------------------------------------------------------
{
    // NOTE: the first version of this check passed the CELL's u0 (0.9434) straight to muPointF32 and failed --
    // because a cell differs on account of the u values its integration SAMPLES, not on account of u0 itself.
    // Probing the leaf with a coordinate that belongs to the outer loop is the third wrong probe in this one
    // investigation, and it is recorded rather than quietly corrected.
    ok("muPointF32 itself distinguishes the two roundings, at the u values where it bites",
        !Object.is(muPointF32(0.002, { contractFma: false }), muPointF32(0.002, { contractFma: true })),
        "differs at 530 of 20000 sampled u values, first at u=0.002. At u=0.9434 -- the CELL offset probed first " +
        "-- the leaf agrees, which is why that check failed: a cell differs because of the u values its " +
        "integration visits, not because of its own u0. The leaf was never the problem, and cellMag forwards the " +
        "flag correctly, so the wiring was right end to end the whole time");
}

// ---- 4. THE TEST THAT REPORTED ZERO WAS RUNNING ZERO ITERATIONS -------------------------------------------------------------
{
    const emu = { kernel: "x", adapter: {}, value: 1 };            // magmapEmulated's actual shape
    const wrong = emu.values || emu.cells || emu;                   // what the bad test did
    ok("!! a comparison over `a.values || a.cells || a` iterates ZERO times on this shape",
        wrong.length === undefined,
        "magmapEmulated returns { kernel, adapter, value } -- no array. The fallback chain yielded the object, " +
        "length was undefined, the loop body never ran, and the result was reported as perfect agreement. A test " +
        "that executes no iterations must never look like a pass");
}

console.log();
if (fails) { console.log("fmaAssumption-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("fmaAssumption-selfcheck: all checks pass");
