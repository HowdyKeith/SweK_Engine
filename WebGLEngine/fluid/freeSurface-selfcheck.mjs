// fluid/freeSurface-selfcheck.mjs
//
// v3540 -- GRADES THE FREE-SURFACE KEY, AND THE NEGATIVES ARE ABOUT THE STATISTIC RATHER THAN THE FLUID.
//
// Two closed-form claims, neither needing an external table: A SETTLED LIQUID'S FREE SURFACE IS LEVEL, and ITS
// HEIGHT FOLLOWS FROM ITS OWN VOLUME. What makes them gradeable at all is that the surface is defined by
// DENSITY rather than by an extreme particle -- v3539 measured the extreme version at a roughness that
// PLATEAUED BY 300 STEPS and never improved, which reads as "the surface never levels" and is actually
// particle discreteness that no amount of settling can remove.
//
// *** THE MOST USEFUL CHECK HERE IS SECTION 4, AND IT EXISTS BECAUSE I SHIPPED THE BUG IT CATCHES. *** My first
// surfaceCells took the MINIMUM cell per column, on a header comment I had written asserting y grows downward.
// It does not: the fill starts at y 32..36 and settles to mean 1.0, so gravity DECREASES y. The minimum is THE
// BOTTOM OF THE FLUID, which rests on the container floor and is FLAT BY CONSTRUCTION -- it reported sd
// 0.0000 at every step from 0 to 3000. A KEY READING PERFECT ZERO SPREAD AND CALLING THE SURFACE LEVEL WOULD
// HAVE BEEN GRADING THE CONTAINER.
import { Flip2D } from "./flip2d.mjs";
import { surfaceCells, levelness, volumeHeight, occupancy } from "./freeSurface.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// fillBlock is (x0, y0, x1, y1, perCell) -- READ FROM THE SOURCE. Reading it as (x0,x1,y0,y1) was the ninth
// assumed signature this project has counted, and it made every earlier attempt at this key measure nothing.
const PER_CELL = 2, PPC = PER_CELL * PER_CELL;
const make = () => { const f = new Flip2D(40, 40, {}); f.fillBlock(8, 32, 22, 36, PER_CELL); return f; };
const run = async (f, n) => { for (let s = 0; s < n; s++) await f.step(1 / 60); return f; };
const surf = (f) => surfaceCells(f.px, f.py, f.h, PPC, 0.5);

console.log("freeSurface-selfcheck -- where the liquid ends\n");

// ---------------------------------------------------------------------------
console.log("1. THE FILL IS WHAT THE SOURCE SAYS IT IS");
{
    const f = make();
    const occ = occupancy(f.px, f.py, f.h);
    const median = [...occ.values()].sort((a, b) => a - b)[Math.floor(occ.size / 2)];
    ok("!! occupancy matches perCell^2, DERIVED not assumed", median === PPC,
        "median " + median + " particles per cell from perCell=" + PER_CELL + ", over " + occ.size + " cells");
    ok("...and the particle count follows from the block", f.px.length === occ.size * PPC,
        f.px.length + " particles. *** READING fillBlock AS (x0,x1,y0,y1) GAVE 1344 AND A FILL DENSITY OF 24, " +
        "AND EVERY COLUMN THEN FAILED THE THRESHOLD. THE SIGNATURE IS (x0,y0,x1,y1,perCell). ***");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE LEVEL CLAIM: THE SURFACE FLATTENS AS IT SETTLES");
{
    const f = make();
    await run(f, 300); const early = levelness(surf(f));
    await run(f, 600); const later = levelness(surf(f));
    await run(f, 2100); const late = levelness(surf(f));
    ok("!! *** THE SPREAD FALLS BETWEEN 300 AND 900 STEPS ***", later.sd < early.sd,
        "sd " + early.sd.toFixed(4) + " -> " + later.sd.toFixed(4) + " over " + later.columns +
        " columns. THE EXTREME-PARTICLE SURFACE COULD NOT SHOW THIS: v3539 measured it flat at 0.18 from 300 " +
        "steps to 3000, because one particle's position was setting the number.");
    ok("...and it does not blow up afterwards", late.sd <= early.sd,
        "sd " + late.sd.toFixed(4) + " at 3000 steps -- SETTLING, then holding");
    report("WHY 'FALLS' AND NOT 'REACHES ZERO'",
        "*** A FLIP FREE SURFACE IS RESOLVED TO A CELL, so its spread has a floor set by the grid and NOT by " +
        "the physics. Demanding zero would fail a correct solver forever; demanding a FALL asks the thing the " +
        "physics actually claims -- that a resting liquid stops being sloped. ***");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE VOLUME CLAIM: THE HEIGHT FOLLOWS FROM THE PARTICLES");
{
    const f = await run(make(), 1800);
    const s = surf(f);
    const V = volumeHeight({ px: f.px, py: f.py, h: f.h, perCellFull: PPC, floorCell: 0, surface: s });
    ok("!! the predicted height comes from the PARTICLES, not the surface", V.predicted > 0 && Number.isFinite(V.predicted),
        "predicted " + V.predicted.toFixed(3) + " cells over a wetted width of " + V.width +
        " -- *** A GENUINE SECOND ROUTE: `predicted` never looks at the surface and `observed` never counts " +
        "particles, which is v3201's test for a key that is not a mirror. ***");
    ok("!! *** AND THE TWO ROUTES AGREE TO BETTER THAN 20% ***", V.errFrac < 0.2,
        "observed " + V.observed.toFixed(3) + " against predicted " + V.predicted.toFixed(3) +
        ", err " + (V.errFrac * 100).toFixed(1) + "%. The gap is REAL and expected: the surface cell is " +
        "counted whole while it is partly air, so `observed` is biased UP by up to half a cell -- and half a " +
        "cell on a 1.5-cell depth IS about this size. THE ERROR IS NOT NOISE, IT IS A KNOWN BIAS WITH A SIGN.");
    const V2 = volumeHeight({ px: f.px, py: f.py, h: f.h, perCellFull: PPC, floorCell: 0, surface: s });
    ok("...and the measurement is deterministic", V.errFrac === V2.errFrac, "same inputs, same number");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE LOAD-BEARING NEGATIVE: THE BUG I SHIPPED, MADE INTO A CHECK");
{
    const f = await run(make(), 1800);
    const cnt = occupancy(f.px, f.py, f.h);
    const bottom = new Map();
    for (const [k, v] of cnt) {
        if (v < 0.5 * PPC) continue;
        const i = k.indexOf(","), cx = +k.slice(0, i), cy = +k.slice(i + 1);
        if (!bottom.has(cx) || cy < bottom.get(cx)) bottom.set(cx, cy);   // MINIMUM: what I wrote first
    }
    const bot = levelness([...bottom.entries()].map(([cx, cy]) => ({ cx, cy })));
    const top = levelness(surf(f));
    ok("!! *** THE MINIMUM CELL IS FLAT BY CONSTRUCTION AND IS NOT THE SURFACE ***", bot.sd < top.sd,
        "bottom sd " + bot.sd.toFixed(4) + " against surface sd " + top.sd.toFixed(4) +
        ". *** IT SITS ON THE CONTAINER FLOOR. My first version took the minimum, on a header comment I had " +
        "written asserting y grows downward -- IT DOES NOT: the fill starts at y 32..36 and settles to mean " +
        "1.0, so gravity DECREASES y. A DIRECTION IS AN ASSUMPTION TOO. ***");
    ok("...and the surface is ABOVE the bottom, which is the direction test", top.mean > bot.mean,
        "surface mean " + top.mean.toFixed(3) + " > bottom mean " + bot.mean.toFixed(3) +
        " -- asserted as a RELATION so it cannot pass on a solver whose convention changes");
}

report("WHAT THIS UNBLOCKS",
    "*** A PLACEMENT AGENT NEEDS A SCORE, AND THIS IS THE FIRST ONE THE LIQUID HAS. `model proposes, gate " +
    "scores` was never blocked on the model -- THE GATE WAS THE MISSING HALF. Levelness and volume agreement " +
    "are both numbers a proposal can be ranked by. ***");
report("*** AND v3540's NEXT-ROUND LINE HERE WAS WRONG TWICE, CORRECTED AT v3541 ***",
    "It said 'viscosity and surface tension as MEASURED knobs (Flip2D already carries stflip/stSubsteps)'. " +
    "*** ST-FLIP IS **SPACETIME**: flip2d.mjs's seam comment says motion-blur the P2G deposit across the " +
    "time-slab, the SIGGRAPH large-time-step technique. A TWO-LETTER ABBREVIATION WAS READ AS THE WORDS THE " +
    "SENTENCE WANTED, and there is no surface tension anywhere in this tree. *** AND Flip2D EXPOSES NO " +
    "MATERIAL PARAMETER AT ALL -- every option it has is numerical, which is what an incompressible " +
    "projection solver IS. So the knobs are on SPH and the score is here, on two different solvers. THE " +
    "DENSITY INTUITION WAS RIGHT AND FOR A SHARPER REASON: rho0 is not a weak material lever, it is a " +
    "statement about the PARTICLE PACKING -- move it alone and the column collapses outright, move it with " +
    "the mass that makes the packing deliver it and the answer does not move at all. Detail, and the " +
    "census that inverts when the container's lid is raised, in physics/sph/materialKnobs.mjs. " +
    "*** WHAT THIS SCORE STILL WANTS IS A SETTLED COLUMN, WHICH NEITHER SPH EQUATION OF STATE PRODUCES: " +
    "WHEN ONE DOES, THAT IS WHEN levelness AND volumeHeight GET POINTED AT IT. ***");

console.log(`\nfreeSurface-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
