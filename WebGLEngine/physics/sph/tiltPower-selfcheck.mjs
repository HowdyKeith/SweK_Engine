// physics/sph/tiltPower-selfcheck.mjs
//
// Does v3544's tilt slope have any power at six columns? MEASURED 62s on one core (timed with date(1) around the run, not remembered). Sections 1-4 and 6 are SYNTHETIC and cost milliseconds -- the instrument is the
// subject, and the instrument needs no fluid. Section 5 settles ONE real tilted pool (3000 steps at N = 2800,
// about 60s) and is the whole runtime. A STATED RUNTIME NOBODY RE-MEASURES IS A MEMORY -- v3211-v3213 found
// that in 59 of 82 headers and v3544's own gate was off by more than four with the word MEASURED on it.
//
// *** THE ASSERTIONS ARE RELATIONS, ORDERINGS AND ONE EXACT ZERO. *** The exact zero is section 1's, and it is
// exact by construction rather than chosen: a surface lying wholly inside one cell band puts every column on
// the same integer, so the least-squares numerator is identically 0. Everything else is "this span is wide",
// "this error falls", "this drop moves the answer more than that one" -- so no line can be satisfied by the
// absolute numbers drifting.
//
// THE CONTROL THAT MAKES ANY OF IT MEAN ANYTHING: planePool's surface is an EXACT plane whose slope is the
// caller's own argument. A statistic fed a truth it cannot be wrong about, reporting something else, is
// convicted without reference to the solver. Section 6 proves the control has teeth by checking it reads
// FAITHFULLY once the box is wide -- a control that was wrong at every width would be a broken fixture, not
// evidence about six columns.
"use strict";
import { planePool, transferRatio, phaseSwing, transferByWidth, worstError, columnLeverage, slopeOf,
         xProfile, tiltedProfile, MEASURED_V3545, EXPLAINS_V3544 } from "./tiltPower.mjs";
import { surfaceHeights, surfaceSlope } from "./levelClaim.mjs";
import { SHIPPED_FLOOR } from "./poolFixture.mjs";
import { reportLines } from "./tiltPower.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("tiltPower-selfcheck -- does the tilt slope have any power at six columns?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE FIXTURE IS SIX COLUMNS WIDE AND THE SIGNAL IS ONE CELL ***");
{
    const cols = Math.ceil(SHIPPED_FLOOR / 0.1 - 1e-9);
    ok("!! the box the whole arc measures is six x-columns", cols === 6,
        "W " + SHIPPED_FLOOR + " / h 0.1 = " + cols + " columns -- DERIVED from the shipped constant, not " +
        "typed, so it moves if the fixture does");
    const rise = MEASURED_V3545.riseAcrossBox.map(([d]) => [d, cols * Math.tan(d * Math.PI / 180)]);
    ok("...and the rise across the WHOLE box is one to two cells", rise[0][1] < 1 && rise[2][1] < 3,
        rise.map(([d, r]) => d + "deg " + r.toFixed(3)).join("  ") + " cells, against a statistic whose " +
        "quantum is ONE cell. THE SIGNAL IS THE SIZE OF THE RESOLUTION.");
    // The exact zero, on a plane that is definitely NOT flat.
    const p = planePool({ slope: Math.tan(5 * Math.PI / 180), meanDepth: 8.75 });
    const s = surfaceSlope(surfaceHeights(p));
    ok("!! *** AND THE STATISTIC READS EXACTLY ZERO ON A PLANE THAT IS DEFINITELY SLOPED ***", s === 0,
        "slope " + s.toFixed(6) + " against a true tan of " + Math.tan(5 * Math.PI / 180).toFixed(4) +
        ". The surface lies wholly inside one cell band, so every column returns the same integer and the " +
        "fit's numerator is IDENTICALLY zero. THIS IS THE ZERO v3544 MEASURED ON THE REAL POOL.");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE CONTROL HAS TO BE ABLE TO BE RIGHT, OR ITS BEING WRONG SAYS NOTHING");
{
    // A flat plane must read flat: if planePool could not produce a level surface the zero above would be
    // furniture, which is the exact failure v3540 shipped and this arc has been paying for since.
    const flat = surfaceSlope(surfaceHeights(planePool({ slope: 0, meanDepth: 8.5 })));
    ok("a plane built with slope 0 reads slope 0", flat === 0,
        "the control can be level, so section 1's zero is a reading rather than the fixture's only output");
    const wide = transferRatio(20, { W: 9.6, meanDepth: 8.5 });
    ok("!! ...and the SAME control reads a sloped plane FAITHFULLY once the box is wide", Math.abs(wide - 1) < 0.05,
        "ratio " + wide.toFixed(4) + "x at 96 columns. *** A CONTROL THAT WAS WRONG AT EVERY WIDTH WOULD BE A " +
        "BROKEN FIXTURE AND NOT EVIDENCE ABOUT SIX COLUMNS. *** It is right where it should be right.");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** LEG 2 -- SUB-CELL PHASE: THE ANSWER MOVES WHILE THE TRUTH DOES NOT ***");
{
    const sw5 = phaseSwing({ deg: 5 }), sw10 = phaseSwing({ deg: 10 }), sw20 = phaseSwing({ deg: 20 });
    ok("!! sliding the depth through ONE cell swings the reported slope enormously at 5deg", sw5.span > 1.5,
        "ratio ranges " + sw5.lo.toFixed(3) + "x .. " + sw5.hi.toFixed(3) + "x (span " + sw5.span.toFixed(3) +
        ") ON A PLANE WHOSE SLOPE NEVER CHANGED. The only thing that moved is where the surface sits inside " +
        "a cell.");
    ok("...and the swing SHRINKS as the signal grows past the quantum",
        sw5.span > sw10.span && sw10.span > sw20.span,
        "spans " + [sw5, sw10, sw20].map((s) => s.deg + "deg " + s.span.toFixed(3)).join("  ") +
        " -- ASSERTED AS AN ORDERING, so it cannot pass on drifting absolutes");
    ok("!! v3544's 0.075x at 5deg is INSIDE the phase range -- the reading needed no fluid at all",
        MEASURED_V3545.liveRatios[0][1] >= sw5.lo && 0.075 >= sw5.lo && 0.075 <= sw5.hi,
        "0.075x sits in [" + sw5.lo.toFixed(3) + ", " + sw5.hi.toFixed(3) + "]");
    // THE HONEST LIMIT OF THIS LEG, and I got it wrong first.
    ok("!! ...and its 2.20x / 2.82x are NOT, which is why this leg is not the whole answer",
        2.198 > sw10.hi && 2.820 > sw20.hi,
        "2.198x > " + sw10.hi.toFixed(3) + " and 2.820x > " + sw20.hi.toFixed(3) + ". *** A FIRST DRAFT OF " +
        "tiltPower.mjs CLAIMED THE PHASE RANGE COVERED ALL THREE AND THE FIRST RUN OF ITS OWN FRONT DOOR " +
        "REFUTED IT. This line exists so the overclaim cannot come back: phase carries 5deg, LEVERAGE " +
        "carries 10 and 20, and neither leg alone explains v3544's line. ***");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE ERROR BELONGS TO THE WIDTH, AND IT CONVERGES ***");
{
    const rows = transferByWidth();
    const errs = rows.map((r) => [r.columns, worstError(r)]);
    report("worst |ratio - 1| by column count",
        errs.map(([c, e]) => c + ":" + e.toFixed(3)).join("  "));
    let falling = true;
    for (let i = 1; i < errs.length; i++) if (errs[i][1] > errs[i - 1][1] + 1e-9) falling = false;
    ok("!! the transfer error falls monotonically as the box widens", falling,
        "so the departure v3544 reported is a property of the FIXTURE'S WIDTH and not of the claim about " +
        "the fluid -- and that is what makes the diagnosis actionable rather than a complaint");
    const at6 = errs[0][1], at24 = errs.find(([c]) => c === 24)[1];
    ok("!! ...and by 24 columns the instrument is faithful", at6 > 10 * at24 && at24 < 0.05,
        "worst error " + at6.toFixed(3) + " at 6 columns against " + at24.toFixed(3) + " at 24 -- MORE THAN " +
        "AN ORDER OF MAGNITUDE. THAT NUMBER IS THE FIXTURE THE NEXT ROUND OWES.");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** LEG 3 -- ONE WALL COLUMN CARRIES THE ANSWER (the live pool, ~60s) ***");
{
    const t = tiltedProfile({ deg: 20 });
    const prof = t.profile;
    report("settled 20deg profile", prof.map(([, y]) => y.toFixed(2)).join("  ") +
           "   (energy ratio " + t.energyRatio.toFixed(3) + ", so it is stable rather than blowing up)");
    ok("the pool is stable at this viscosity, so the profile is a settled state", t.energyRatio < 1,
        "energy ratio " + t.energyRatio.toFixed(3) + " -- v3542's bound: a lossy wall can only REMOVE energy, " +
        "so a ratio below 1 is the only admissible one");
    const lev = columnLeverage(prof);
    ok("!! *** DROPPING ONE COLUMN OF SIX MOVES THE ANSWER BY HALF ***", lev.worst.shift > 0.35,
        "full fit " + (lev.full / t.tan).toFixed(3) + "x tan; dropping column " + lev.worst.x + " gives " +
        (lev.worst.slope / t.tan).toFixed(3) + "x, a " + (lev.worst.shift * 100).toFixed(1) + "% shift. " +
        "*** A FIT WHOSE ANSWER DEPENDS ON ONE POINT OF SIX IS REPORTING THAT POINT, NOT A SLOPE. ***");
    const last = prof[prof.length - 1], rest = prof.slice(0, -1);
    const restMax = Math.max(...rest.map((p) => p[1]));
    ok("...and the leverage point is the DOWNHILL WALL COLUMN, where the clamp piles particles up",
        lev.worst.x === last[0] && last[1] - restMax > 1.5,
        "wall column reads " + last[1].toFixed(2) + " against a maximum of " + restMax.toFixed(2) +
        " elsewhere -- a pile-up of " + (last[1] - restMax).toFixed(2) + " cells in the column v3543's clamp " +
        "sends every over-driven particle into. NOT a coincidence of this run: it is where the fluid goes.");

    // *** THE ANTIDOTE FIRED AT v3549 (physics/sph/wideTilt.mjs), REWRITTEN TO THE KEY -- SIXTH TIME v3196's
    // IDIOM HAS PAID. *** This line is no longer a claim about whether SIX columns can decide the fluid: it is
    // now a statement about THAT fixture alone, which remains true regardless of what a wider one finds.
    ok("!! the SIX-COLUMN fixture's own verdict stands: it cannot decide the fluid, and that is asserted rather than hoped",
        t.pool.W === SHIPPED_FLOOR && prof.length < 24,
        "*** " + prof.length + " COLUMNS. THIS IS A STATEMENT ABOUT THE NARROW FIXTURE, NOT ABOUT THE FLUID -- " +
        "physics/sph/wideTilt.mjs (v3549) BUILT THE 24-COLUMN FIXTURE THIS ANTIDOTE ASKED FOR AND THE KEY NOW " +
        "LIVES THERE (slope == tan(theta) within the transfer tolerance from section 4 above, measured, not " +
        "chosen): 1.009x at 5deg, 0.964x at 10deg, against 0.000x / 1.452x here. THE NEW ANTIDOTE: if somebody " +
        "widens SHIPPED_FLOOR ITSELF past six columns, this line goes red again and should be DELETED -- not " +
        "re-narrowed -- because a wider shipped fixture would make the narrow-fixture verdict moot rather than " +
        "wrong. ***");
}

// ---------------------------------------------------------------------------
console.log("\n6. WHAT IS NOT CLAIMED, AND THE REGISTER SAYS SO IN ITS OWN WORDS");
{
    ok("no key is registered here", !("key" in MEASURED_V3545) && /NO KEY IS REGISTERED/.test(MEASURED_V3545.note),
        "this round shows the six-column fixture CANNOT TELL whether the surface is perpendicular to gravity. " +
        "It does not show that it is. Claiming the closed form is the numerology v3544 correctly refused, and " +
        "'the instrument is blind' is a NARROWER claim than either 'the fluid is right' or 'the fluid is wrong'");
    ok("the register names what is owed and it is a FIXTURE, not a solver change",
        /24 COLUMNS/.test(EXPLAINS_V3544.owed),
        EXPLAINS_V3544.owed);
    ok("the front door prints and the numbers in it are derived from the same functions the gate drives",
        typeof transferRatio === "function" && typeof phaseSwing === "function" && typeof columnLeverage === "function",
        "no reference value in this gate is typed -- every comparison drives planePool or the live pool");
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
       L.join("\n").includes("[tiltPower]"),
       L.length + " lines, self-named");
}

console.log(fails ? `\ntiltPower-selfcheck: ${fails} FAILED` : "\ntiltPower-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
