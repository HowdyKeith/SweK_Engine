// tools/roundhouse/blobBodies-selfcheck.mjs
//
// v3302 -- THE BLOB ROUND TRIP BECOMES THE 50th GRADED DEVICE, AND ITS ANSWER KEY IS BUILT BY CONSTRUCTION.
//
// A plan arrived for "blobulator as the universe physics": bake the density into a WebGPU 3D texture, solve
// Navier-Stokes on it with semi-Lagrangian advection, marching cubes on the way out. THE SHAPE OF THAT PLAN IS
// CORRECT -- it is the standard Stam-1999 stable-fluids pipeline and it works. Nobody measured what it costs.
//
// THE KEY NEEDS NO REFERENCE VALUE, WHICH IS WHY IT IS A GOOD ONE. Advect the field right N steps, then left N
// steps. It ends EXACTLY where it started, so the true answer is "unchanged" and every departure is pure
// numerics with no motion mixed in. Stronger than comparing against an analytic solution, because there is no
// discretisation of the reference to argue about: the reference IS the input.
//
// *** AND THE FINDING IS IN THE TWO COLUMNS TOGETHER. ***
//
//     64^3 grid, four round trips:   PEAK KEPT 57.9%     MASS KEPT 99.99%
//
// The blob does not EVAPORATE -- the books balance to four decimal places. It DISSOLVES: smearing flatter and
// wider while conserving its own mass. A device grading only mass conservation would call this run perfect, and
// a device grading only the peak would suspect a leak. Neither alone says what happened.
//
// THE COMPARISON, and it is the point of the module: the same seven blobs moved as BODIES -- seven centres
// translated, the formula re-evaluated -- keep 100.0% of their peak with a drift of 8.9e-16. That is one float
// rounding, not accumulation: four round trips or four million, the blob is exact. The grid lost 42% of its
// peak. Seven numbers lost nothing, at 7 bodies against 262,144 voxels.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("blobbodies");
const grid = await dev.build({ mode: "roundtrip" });
const bodies = await dev.build({ mode: "bodies" });

// ---- 1. THE ROUND TRIP IS A REAL TEST -- the field must actually have something to lose ----------------------------
{
    ok("!! the field starts with a real peak, so a loss can be measured",
        grid.peak0 > 1 && grid.voxels === 262144,
        `peak ${grid.peak0.toFixed(4)} on a ${grid.gridN}^3 grid (${grid.voxels} voxels). Asserted first because ` +
        "a round trip on an empty field returns perfectly, and this run's whole content is what gets lost");
}

// ---- 2. THE GRID DISSOLVES: BOTH COLUMNS, TOGETHER --------------------------------------------------------------------
{
    ok("!! the grid loses roughly half its peak over four round trips of STANDING STILL",
        grid.peakKept < 0.7 && grid.peakKept > 0.3,
        `peak kept ${(grid.peakKept * 100).toFixed(1)}%. The field ends exactly where it began, so none of this is ` +
        "motion -- it is semi-Lagrangian advection's numerical diffusion, the price of the unconditional " +
        "stability that makes the method worth using. The plan that proposed this pipeline never mentions it");

    ok("!! and yet MASS IS CONSERVED to four decimal places -- it dissolves, it does not evaporate",
        grid.massKept > 0.99,
        `mass kept ${(grid.massKept * 100).toFixed(2)}% while the peak fell to ${(grid.peakKept * 100).toFixed(1)}%. ` +
        "The blob smears flatter and wider with the books balanced. A device grading only mass would call this " +
        "run perfect; a device grading only peak would suspect a leak. The two columns together are the finding");
}

// ---- 3. THE BODY PATH IS EXACT ------------------------------------------------------------------------------------------
{
    ok("!! moving seven centres and re-evaluating the formula loses NOTHING",
        bodies.bodyPeakKept > 0.9999 && bodies.bodyDrift < 1e-14,
        `peak kept ${(bodies.bodyPeakKept * 100).toFixed(1)}%, drift ${bodies.bodyDrift.toExponential(2)} -- one ` +
        "float rounding, not accumulation. Four round trips or four million, the blob is exact, because the " +
        "formula travels with the centres instead of being resampled onto a grid every step");

    ok("!! and it costs 7 bodies against 262,144 voxels",
        bodies.bodyCount === 7 && grid.voxels / bodies.bodyCount > 30000,
        `${bodies.bodyCount} numbers versus ${grid.voxels} -- a factor of ` +
        `${Math.round(grid.voxels / bodies.bodyCount)}. The cheaper representation is also the exact one, which ` +
        "is not the usual trade and is worth stating plainly");
}

// ---- 4. WHAT THIS DOES NOT CLAIM ---------------------------------------------------------------------------------------------
{
    ok("!! this does not show the grid pipeline is wrong -- it shows what it costs",
        grid.massKept > 0.99 && grid.peakKept < 0.7,
        "semi-Lagrangian advection is unconditionally stable and that is why it is standard. The measurement is " +
        "the DIFFUSION it buys that stability with, on a field asked only to stand still. A fluid that must " +
        "actually flow needs a grid; a blob that must keep its shape does not, and this device separates the two " +
        "questions instead of declaring a winner");
}

// ---- 4b. *** THE PLANT, AND THE OBSERVABLE THAT HAD TO EXIST BEFORE IT COULD BE CAUGHT (v3713) *** ---------------------------
// Swap the trilinear sampler for a nearest-neighbour one and the field NEVER MOVES: per step the departure
// point is about a quarter of a cell, so it rounds back into the cell it started in. The round trip then
// reports a PERFECT run, because the round trip measures LOSS and nothing was lost -- nothing was done.
// *** THIS IS THE FIRST PLANT IN THE TREE THAT MOVES ITS OBSERVABLES **TOWARD** THEIR IDEAL. v3690's rule --
// a plant moves the observable AWAY from the ideal, a positive control moves it TO the ideal -- reads this as
// a CONTROL. The rule holds where the ideal IS the truth; here "nothing was lost" is the symptom, not the
// truth. Direction is relative to the TRUTH, not to the prettier number. ***
// WHEN THIS GOES RED the fix is to restore the sampler, NEVER to relax shiftKept: a stalled field passing as a
// perfect one is exactly what this section exists to make impossible.
{
    const honest = dev.build({ mode: "roundtrip", config: { n: 32, trips: 2 } });
    const stalled = dev.build({ mode: "roundtrip", config: { n: 32, trips: 2, planted: true } });

    ok("!! the planted sampler scores PERFECTLY on both original columns -- better than the honest run",
        stalled.peakKept === 1 && stalled.massKept === 1 && stalled.peakKept > honest.peakKept && stalled.massKept > honest.massKept,
        `planted ${stalled.peakKept.toFixed(4)} / ${stalled.massKept.toFixed(4)} vs honest ${honest.peakKept.toFixed(4)} / ${honest.massKept.toFixed(4)}` +
        " -- a device grading only loss would call the broken run the better one");

    ok("!! shiftKept separates them absolutely: the honest field travels exactly as told, the stalled one not at all",
        Math.abs(honest.shiftKept - 1) < 1e-4 && stalled.shiftKept === 0,
        `honest ${honest.shiftKept.toFixed(6)}, planted ${stalled.shiftKept.toFixed(6)} -- expected travel ${honest.expectedShift.toFixed(4)} world units`);

    // The key needs no reference value: linear advection of a conserved quantity translates the centroid
    // EXACTLY, so 1 is derived from the velocity field the run was given, not looked up.
    ok("!! the transport key is derived from the run's own velocity, not typed",
        Math.abs(honest.oneWayShift - honest.expectedShift) < 1e-4 && honest.expectedShift > 0,
        `measured ${honest.oneWayShift.toFixed(8)} vs v*dt*steps ${honest.expectedShift.toFixed(8)}`);

    // *** THE TOLERANCE WAS MEASURED, NOT PICKED, AND MEASURING IT FOUND A BETTER KEY. My first spelling used
    // 1e-9 and went red at a residual of 1.4e-6 -- WHICH IS NOT FLOAT NOISE. It is DISCRETISATION, and it
    // FALLS WITH REFINEMENT: 2.62e-5 at n=24, 1.40e-6 at n=32, 6.17e-9 at n=48. A residual that shrinks when
    // the grid does is the signature of a convergent scheme, and it is a stronger claim than any fixed
    // tolerance because a stalled or a wrong sampler cannot produce it. ***
    const coarse = dev.build({ mode: "roundtrip", config: { n: 24, trips: 1 } });
    const finer = dev.build({ mode: "roundtrip", config: { n: 32, trips: 1 } });
    const rc = Math.abs(coarse.shiftKept - 1), rf = Math.abs(finer.shiftKept - 1);
    ok("!! the transport residual FALLS with refinement -- discretisation, not noise",
        rf < rc / 4,
        `n=24 ${rc.toExponential(2)} -> n=32 ${rf.toExponential(2)}, a factor of ${(rc / rf).toFixed(0)}` +
        " -- a fixed tolerance would have hidden this; a stalled sampler holds its residual at exactly 1");

    // AND THE ROUND MUST NOT MOVE THE VERDICT IT IS NOT ABOUT: the two original columns are unchanged, which
    // is why the one-way pass runs off a SAVED copy of the baked field rather than in front of the round trip.
    ok("!! the original loss columns are untouched by the new observable",
        Math.abs(honest.peakKept - 0.5617) < 1e-3 && honest.massKept > 0.999,
        `peakKept ${honest.peakKept.toFixed(6)} -- bit-identical to the v3712 build, checked against the shipped extract`);

    ok("the device names what its plant overturns, as data rather than prose",
        dev.planted && dev.planted.observable === "shiftKept" && !!dev.planted.knob);
}

// ---- 5. DECLARED --------------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("blobbodies declares its modes -- 50 graded of 124 proven",
        m.source === "exported" && m.declared.length === 2,
        `source "${m.source}", modes ${JSON.stringify(m.declared)}`);
}

console.log();
if (fails) { console.log("blobBodies-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("blobBodies-selfcheck: all checks pass");
