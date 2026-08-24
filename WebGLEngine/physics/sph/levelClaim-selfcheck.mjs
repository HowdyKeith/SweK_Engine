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
//
// v3972 -- WIRED INTO THE LESSON CORPUS, AND *** ONE OF THIS FILE'S THREE SWEEPS IS DELIBERATELY LEFT OUT. ***
//
// This is the most expensive gate in the tree (646.9s recorded; the header above measured over 1200s on one
// core), and two of its sections spend that time asking a question the corpus was built to remember: does a
// swept quantity SETTLE. Section 2 sweeps settle time and hand-rolls a reversal test; section 4's last check
// sweeps 3000 against 6000 steps and hand-rolls a 5%-drift test. Both verdicts already exist here, in this
// file, and until now died with the process -- so re-asking cost eleven minutes and the answer was already
// known.
//
// *** THE TILT SWEEP IS NOT WIRED, AND THAT IS THE POINT OF READING THIS COMMENT. *** Section 4's tilt rows
// look like the best candidate in the file -- four points, its own monotone loop, the same shape as the other
// two. IT HAS THE OPPOSITE SEMANTICS. The tilt sweep is a LOAD-BEARING NEGATIVE: the spread is SUPPOSED to
// rise with the angle, and the finding worth remembering is when it STOPS discriminating, not when it moves.
// recordSweepFinding writes the event "sweep-unsettled" and the reader renders it as "did not settle over
// <axis>: N step(s) jumped". Filing a statistic that went DEAF under that sentence would send the next reader
// hunting for a convergence failure that never happened. v3970 already learned this one size down -- wording a
// scatter as a plateau "would send whoever reads it looking for the wrong failure" -- and the same rule says
// the corpus has no word for this sweep yet, so it gets no record rather than the wrong one.
//
// A THIRD SWEEP THE CORPUS FITS IS STILL A SWEEP THE CORPUS SHOULD REFUSE.
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { settlePool, SHIPPED_FLOOR } from "./poolFixture.mjs";
import { surfaceHeights, heightsOverBox, spread, surfaceSlope, levellingSeries, fullSensitivity,
         MEASURED_V3544, CORRECTS_V3543 } from "./levelClaim.mjs";
import { reportLines } from "./levelClaim.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// v3972 -- READ FIRST, and lazily, with its failure swallowed: a physics gate must never go red because a
// lesson file could not be read. env "sph-level" rather than a registry device name because levelClaim is not
// a roundhouse device; the "sph" token is what puts it in one family with the next sph gate to be wired.
let _lessons = null;
try { _lessons = await import(pathToFileURL(path.join(ENG, "brain", "rl", "lessons.mjs")).href);
      console.log(_lessons.lessonsBrief("sph-level")); } catch {}

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

    // v3972 -- THE ORDERING TEST ABOVE, OBSERVED RATHER THAN RECOMPUTED. This gate already decided what a
    // failure to settle looks like for the levelling spread: the spread must fall, so a step where it ROSE is
    // the reversal the check forbids. recordSweepFinding is handed that same per-step boolean, so the corpus
    // and this file's own PASS/FAIL can never disagree about which steps counted. Nothing is written when the
    // series falls cleanly -- a corpus that logged every good sweep is a run log nobody reads.
    if (_lessons) {
        try {
            _lessons.recordSweepFinding({
                env: "sph-level", axis: "steps",
                series: series.map((r, i) => ({ x: r.steps, y: r.sd,
                                                settled: i === 0 ? true : !(r.sd > series[i - 1].sd) })),
                params: { targetN: 2800, damColumns: 5, viscosity: 3, steps: series.map((r) => r.steps) },
                note: "surface spread vs settle time (levelClaim section 2) -- a step counts as unsettled when " +
                      "the spread ROSE, which is the reversal the ordering check forbids",
            });
        } catch {}
    }
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

    // v3972 -- THE STATIONARITY CHECK, RECORDED FOR THE SAME REASON AND ON THE SAME TERMS. Two points is the
    // shortest series recordSweepFinding accepts, and it is the right length here: the question is whether
    // doubling the settle time moved the answer, which is exactly one transition. The 5% verdict is the one
    // the line above already rendered, not a second opinion computed here.
    if (_lessons) {
        try {
            _lessons.recordSweepFinding({
                env: "sph-level", axis: "steps@tilt20",
                series: [{ x: 3000, y: a.sd, settled: true },
                         { x: 6000, y: b.sd, settled: Math.abs(b.sd - a.sd) / a.sd < 0.05 }],
                params: { targetN: 2800, damColumns: 5, viscosity: 3, tiltDeg: 20 },
                note: "tilted-state stationarity (levelClaim section 4) -- unsettled means doubling the settle " +
                      "time moved the spread by more than 5%, which would make the tilt negative a transient",
            });
        } catch {}
    }
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

{
    // v3904 -- reportLines IS THIS MODULE'S OWN REPORT, AND NOTHING HAD EVER CALLED IT.
    // I nearly skipped this on the belief that toolFrontDoor already covered it. IT DOES NOT, AND I CHECKED
    // RATHER THAN ASSERTED: section 1 SPAWNS the file and demands non-empty stdout matching /[basename]/ --
    // that is what the MAIN BLOCK prints, which is a different function. A reportLines() returning [] would
    // leave the front door perfectly green, because the main block writes its own header either way.
    // *** A REPORTER NOBODY CALLS IS A REPORTER THAT CAN GO SILENT IN PRIVATE. *** The shape graded here is
    // the weakest one worth having -- an array, of strings, longer than a header, carrying its own name --
    // and it is the shape that distinguishes "the report is built" from "the function still returns".
    // WHAT IS NOT CLAIMED: the live arm. reportLines({ live: true }) drives the real solver, and levelClaim's
    // measured at 51s SOLO -- the gate went to 280s against a 143s default budget, so the live arm is
    // DELIBERATELY NOT DRIVEN HERE. A CHECK THAT TIMES OUT IS NOT A STRONGER CHECK, IT IS AN ABSENT ONE.
    const L = reportLines({ live: false });
    ok("reportLines returns a real report and names itself",
       Array.isArray(L) && L.length > 5 && L.every((x) => typeof x === "string") &&
       L.join("\n").includes("[levelClaim]"),
       L.length + " lines, self-named");
}

console.log(`\nlevelClaim-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
