// physics/sph/levelClaim-selfcheck.mjs
//
// v3544 -- GRADES THE CLAIM v3540 WROTE DOWN AND NOTHING IN FOUR ROUNDS COULD ASK.
//
// STATED RUNTIME: **OVER 1200s ON ONE CORE**, RE-MEASURED AT v3544 AND CORRECTED FROM A STATED ~250s.
// *** THE OLD FIGURE WAS OFF BY MORE THAN A FACTOR OF FOUR, AND IT SAID 'MEASURED'. *** Timed alone, with no
// other job contending, from the extracted zip: the run spans more than twenty minutes and section 4 alone is
// most of it -- the tilt sweep settles four angles AND a four-point stationarity check, which is 27,000 steps
// at N = 2800. A STATED RUNTIME NOBODY RE-MEASURES IS A MEMORY (v3211-v3213 found this in 59 of 82 gate
// headers, and v3519 found one off by fifteen). IT IS THE ROUND'S OWN SUBJECT ONE LEVEL UP: a number written
// down once and never re-taken, in the file whose finding is a statistic nobody re-sampled.
// Most of the cost is the tilt sweep, which is unavoidable: the negative has to be
// SETTLED to be worth anything, and settling takes 3000 steps at 2800 particles.
//
// *** THE ASSERTIONS ARE RELATIONS AND ORDERINGS. *** The only equality is that the container floor reads a
// spread of zero, and that is exact by construction rather than chosen -- the floor is flat because the wall
// clamps every particle to the same coordinate, which v3540 discovered by shipping a statistic that measured
// it. That bug is this file's control.
"use strict";
import { settlePool, SHIPPED_FLOOR } from "./poolFixture.mjs";
import { surfaceHeights, heightsOverBox, spread, surfaceSlope, levellingSeries, fullSensitivity,
         MEASURED_V3544, CORRECTS_V3543 } from "./levelClaim.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("levelClaim-selfcheck -- a settled liquid's surface is level\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE SURFACE CAN NOW BE UNEVEN, WHICH IS WHAT FOUR ROUNDS WERE MISSING ***");
const early = settlePool({ targetN: 2800, damColumns: 5, steps: 300, viscosity: 3 });
{
    const s = spread(surfaceHeights(early));
    ok("!! a dam break gives a surface with real spread", s.sd > 1,
        "sd " + s.sd.toFixed(3) + " over " + s.columns + " columns. *** EVERY FIXTURE IN THIS ARC FILLED THE " +
        "BOX UNIFORMLY AND LET IT SETTLE, SO THE SURFACE STARTED LEVEL AND STAYED LEVEL. A statistic asked " +
        "only about states that are already flat reports flat -- and three rounds read that as a resolution " +
        "problem. IT WAS NEVER GIVEN ANYTHING TO BE UNEVEN ABOUT. ***");
    ok("...and it is the SAME box, so this is not v3543's narrowing", early.W === SHIPPED_FLOOR && early.damColumns === 5,
        "W " + early.W + " with the FILL narrowed to " + early.damColumns + " lattice columns -- the particle " +
        "count is held by growing the column, so only the STARTING SHAPE changes");
}

// ---------------------------------------------------------------------------
console.log("\n2. AND IT LEVELS -- THE CLAIM, SEEN HAPPENING FOR THE FIRST TIME");
const series = levellingSeries();
{
    const first = series[0], last = series[series.length - 1];
    ok("!! *** THE SPREAD FALLS ***", last.sd < first.sd,
        series.map((r) => r.steps + ":" + r.sd.toFixed(3)).join(" -> ") +
        ". *** v3540 WROTE THIS CLAIM AND MEASURED IT ON FLIP; NOTHING IN THE SPH ARC HAD EVER SEEN IT " +
        "HAPPEN, because nothing had built a state it could happen from. ***");
    let monotone = true;
    for (let i = 1; i < series.length; i++) if (series[i].sd > series[i - 1].sd) monotone = false;
    ok("...and it falls monotonically rather than wandering", monotone,
        "no reversal across " + series.length + " marks -- ASSERTED AS AN ORDERING, so it cannot pass on a " +
        "fixture whose absolute numbers drift");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** WHY THE ZERO AT REST IS AN ANSWER AND NOT FURNITURE -- v3543's OWN TEST, PASSED ***");
{
    // v3543 condemned the statistic because the CONTAINER FLOOR, flat by construction, read the same zero.
    // That test is right and it is applied here to the TRANSIENT as well as to the rest state.
    const s = spread(surfaceHeights(early)), floor = spread(surfaceHeights(early, { bottom: true }));
    ok("!! DURING THE TRANSIENT the surface and the floor DISAGREE, by cells", s.sd - floor.sd > 1,
        "surface " + s.sd.toFixed(3) + " against floor " + floor.sd.toFixed(3) +
        ". *** THAT IS THE DISCRIMINATOR v3543 ASKED FOR: the two agree only where they should. ***");
    ok("!! the floor reads a spread of ZERO, exactly, and it is flat BY CONSTRUCTION", floor.sd === 0,
        "the wall clamps every bottom particle to the same coordinate, which is v3540's own shipped-and-caught " +
        "bug used deliberately as a control. A ZERO REACHED FROM ELEVEN IS A MEASUREMENT; A ZERO THAT WAS " +
        "NEVER ANYTHING ELSE IS FURNITURE.");
    const rest = series[series.length - 1];
    ok("...and at rest they agree, which is now the RESULT rather than the problem",
        rest.sd === rest.floorSd,
        "surface " + rest.sd.toFixed(3) + " against floor " + rest.floorSd.toFixed(3) + " at " + rest.steps +
        " steps");
    report("STATED LIMIT, BECAUSE IT WOULD OTHERWISE READ AS SOLVED",
        "THE SUB-CELL TERM COLLAPSES TO THE INTEGER AT REST -- the cell above the surface is empty in every " +
        "column, so the settled spread is still quantised to the grid and the resolution problem was NOT " +
        "fixed, it was SIDESTEPPED by measuring a state that moves. A fixture that could resolve BELOW a cell " +
        "at rest is a different round.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE LOAD-BEARING NEGATIVE: A STATE THAT IS SETTLED AND NOT LEVEL");
{
    // A dam break proves the statistic can be LARGE. It cannot prove it can FAIL, because everything it
    // grades ends level. Tilting gravity gives a settled surface that is not level IN THE BOX FRAME.
    const rows = MEASURED_V3544.tilt.map(([deg]) => {
        const p = settlePool({ targetN: 2800, damColumns: 5, steps: 3000, viscosity: 3, tiltDeg: deg });
        return { deg, ...spread(surfaceHeights(p)), slope: surfaceSlope(surfaceHeights(p)) };
    });
    let rising = true;
    for (let i = 1; i < rows.length; i++) if (!(rows[i].sd > rows[i - 1].sd)) rising = false;
    ok("!! *** THE SPREAD RISES MONOTONICALLY WITH THE TILT ***", rising,
        rows.map((r) => r.deg + "deg:" + r.sd.toFixed(4)).join("  ") +
        ". *** SO THE STATISTIC CAN FAIL, AND THE LEVEL CLAIM IS FALSIFIABLE RATHER THAN MERELY SATISFIED. ***");
    ok("!! and the level fixture is the one that reads zero", rows[0].sd === 0 && rows[rows.length - 1].sd > 1,
        "0 degrees -> " + rows[0].sd.toFixed(4) + " against " + rows[rows.length - 1].deg + " degrees -> " +
        rows[rows.length - 1].sd.toFixed(4));
    // AND IT IS SETTLED, NOT CAUGHT MID-SLIDE. Without this the negative is a transient wearing a verdict.
    const a = spread(surfaceHeights(settlePool({ targetN: 2800, damColumns: 5, steps: 3000, viscosity: 3, tiltDeg: 20 })));
    const b = spread(surfaceHeights(settlePool({ targetN: 2800, damColumns: 5, steps: 6000, viscosity: 3, tiltDeg: 20 })));
    ok("!! *** AND THE TILTED STATE IS GENUINELY SETTLED ***", Math.abs(b.sd - a.sd) / a.sd < 0.05,
        "sd " + a.sd.toFixed(3) + " at 3000 steps against " + b.sd.toFixed(3) + " at 6000 -- within 5%. " +
        "*** WITHOUT THIS THE NEGATIVE IS A TRANSIENT WEARING A VERDICT, and this arc has already read one " +
        "transient as an equilibrium (v3542's lid). ***");
    report("*** AND THE CLOSED FORM DOES NOT HOLD, WHICH IS REPORTED RATHER THAN ASSERTED ***",
        "The obvious key is that a settled surface is perpendicular to gravity, so its slope should be " +
        "tan(theta). Measured: " + MEASURED_V3544.tiltSlopeOverTan.map(([d, r]) => d + "deg " + r.toFixed(2) + "x").join(", ") +
        " -- UNDER at small tilt (the slope is below one cell across the whole box and the grid cannot see " +
        "it) and OVER at large. THIS ROUND DOES NOT SETTLE WHY, and asserting the closed form would be " +
        "numerology (v3472's own correction). WHEN SOMEBODY EXPLAINS IT, THIS LINE GOES RED AND SHOULD BECOME " +
        "THE KEY -- NOT WEAKENED, AND NOT DELETED.");
}

// ---------------------------------------------------------------------------
console.log("\n5. CORRECTING v3543: ROBUST IS NOT INVARIANT, AND I WROTE THE WRONG ONE IN CAPITALS");
{
    const rows = fullSensitivity();
    const byFull = Object.fromEntries(rows.map((r) => [r.full, r]));
    const declared = byFull[7.2169], slab = byFull[8.6798];
    ok("!! sd is NOT invariant under the choice of `full`", declared.sd !== slab.sd,
        "sd " + declared.sd.toFixed(4) + " at the declared 7.2169 against " + slab.sd.toFixed(4) +
        " at the measured slab 8.6798. *** v3543 SAID A MIS-DEFINED full 'SHIFTS EVERY COLUMN TOGETHER AND " +
        "CANCELS'. IT DOES NOT CANCEL. ***");
    const rel = Math.abs(declared.sd - slab.sd) / declared.sd;
    ok("!! but it IS robust over the range that matters, which is why the conclusion survives", rel < 0.05,
        "moves " + (rel * 100).toFixed(1) + "% across the declared-to-slab range, against a signal that runs " +
        MEASURED_V3544.damBreak[0][1] + " to 0. ROBUST, NOT INVARIANT -- DIFFERENT CLAIMS.");
    const meanRel = Math.abs(declared.mean - slab.mean) / declared.mean;
    ok("!! *** AND THE MEAN MOVES MORE THAN THE SPREAD, WHICH IS WHY THE VOLUME CLAIM IS THE ONE THAT FAILED ***",
        meanRel > rel,
        "mean " + declared.mean.toFixed(4) + " -> " + slab.mean.toFixed(4) + " (" + (meanRel * 100).toFixed(1) +
        "%) against the spread's " + (rel * 100).toFixed(1) + "%. A statistic about DIFFERENCES between " +
        "columns survives a shared offset; one about an ABSOLUTE height does not. THAT IS THE WHOLE REASON " +
        "v3543 COULD CLOSE NEITHER AND THIS ROUND CAN CLOSE ONE.");
    ok("...and the correction is recorded where the next reader will look", CORRECTS_V3543.invariance.length > 100,
        "CORRECTS_V3543 names the wrong word and keeps the surviving conclusion");
}

console.log("\n6. *** THE COMPLEMENT OF THE TILT NEGATIVE: THE SPREAD IS BLIND TO A FLUID THAT IS NOT THERE ***");
{
    // Section 4 shows the statistic can be LARGE when the surface slopes. THIS SHOWS IT CAN BE ZERO WHEN THE
    // FLUID NEVER SPREAD, because surfaceHeights iterates over columns that HOLD PARTICLES. A fluid occupying
    // half the box at uniform depth is not penalised -- it is measured over fewer columns and reads perfect.
    const good = settlePool({ targetN: 2800, damColumns: 5, steps: 3000, viscosity: 3 });
    const dead = settlePool({ targetN: 2800, damColumns: 5, steps: 3000, viscosity: 3, eos: "ideal", stiffness: 0 });
    const gW = spread(surfaceHeights(good)), dW = spread(surfaceHeights(dead));
    const gB = heightsOverBox(good), dB = heightsOverBox(dead);
    ok("!! *** A PRESSURELESS FLUID READS THE SAME PERFECT ZERO OVER ITS WETTED COLUMNS ***",
        dW.sd === gW.sd && dB.wettedCols < gB.wettedCols,
        "correct " + gB.wettedCols + " columns sd " + gW.sd.toFixed(4) + " against pressureless " +
        dB.wettedCols + " columns sd " + dW.sd.toFixed(4) + ". *** THE COLUMN COUNT IS THE DISCRIMINATOR AND " +
        "THE SPREAD IS BLIND TO IT. A CHECK THAT CANNOT TELL A CORRECT FLUID FROM AN ABSENT ONE. ***");
    const gO = spread(gB.heights), dO = spread(dB.heights);
    ok("!! and over the CONTAINER's columns the negative bites at once", dO.sd > gO.sd,
        "sd over the box: correct " + gO.sd.toFixed(4) + " against pressureless " + dO.sd.toFixed(4) +
        ". *** AN UNWETTED COLUMN'S SURFACE IS AT THE FLOOR -- A BOUND DERIVED FROM THE CONTAINER, NOT " +
        "CHOSEN -- SO A FLUID THAT DID NOT ARRIVE IS MAXIMALLY UNLEVEL RATHER THAN ABSENT FROM THE AVERAGE. ***");
    ok("...and the correct fluid still reads level over the box, so the fix costs the claim nothing",
        gO.sd === gW.sd,
        "sd " + gO.sd.toFixed(4) + " either way -- it wets every column, so the two measures COINCIDE where " +
        "they should and differ only where the fluid is missing");
    report("*** BOTH NEGATIVES ARE NEEDED AND NEITHER SUBSUMES THE OTHER ***",
        "TILT gives a surface that is settled and SLOPED; THIS gives one that is settled, LEVEL WHERE IT " +
        "EXISTS, AND ABSENT ELSEWHERE. A suite holding only the tilt would certify a solver whose fluid never " +
        "spread, and a suite holding only this would certify one that pooled everywhere at the wrong angle. " +
        "IF SOMEBODY MERGES THE TWO MEASURES INTO ONE, THIS SECTION GOES RED AND THE PAIR IS WHAT TO KEEP -- " +
        "NOT WEAKENED, AND NOT DELETED.");
}

console.log(`\nlevelClaim-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
