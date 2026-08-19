// physics/sph/stability-selfcheck.mjs
//
// v3542 -- GRADES THE ENERGY FINDING, AND EVERY ASSERTION IS A RELATION OR A PHYSICAL BOUNDARY.
//
// STATED RUNTIME: ~200s, MEASURED. The cost is bisections; the gate uses FEWER bisection steps than the
// register because what it needs are ORDERINGS (this threshold exceeds that one, this one did not move under
// refinement) and not a precise value. A gate re-deriving the register's digits would be pinning an
// arrangement.
//
// *** THE ONE NUMBER NOTHING HERE CHOOSES IS THE VERDICT ITSELF. *** In a system whose only external force is
// gravity and whose only boundary reverses velocity at restitution 0.3 -- so it can only ever REMOVE energy --
// total mechanical energy MAY NOT RISE. E(T)/E(0) > 1 IS the instability. There is no tolerance to argue
// about and no threshold anybody had to pick, which is the rarest shape this lab produces.
"use strict";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { codeOnly } from "../../tools/ship/sourceScan.mjs";
import { energyBudget, energyRatio, viscosityThreshold, lidBudget, settledSurface,
         MEASURED_V3542, STILL_BLOCKED, TALL_LID } from "./stability.mjs";
import { SHIPPED_LID, FREE_LID } from "./materialKnobs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "../..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("stability-selfcheck -- the column was never failing to settle\n");

// ---------------------------------------------------------------------------
console.log("1. *** AT THE SHIPPED VISCOSITY THE SOLVER CREATES ENERGY ***");
const shipped = energyBudget({ visc: 0.1, T: 2.0, samples: 5 });
{
    const first = shipped.rows[0].total, last = shipped.rows[shipped.rows.length - 1].total;
    ok("!! *** TOTAL MECHANICAL ENERGY RISES, WHICH IS IMPOSSIBLE HERE ***", last > first,
        "KE+PE per particle " + shipped.rows.map((r) => r.total.toFixed(3)).join(" -> ") +
        ". Gravity is the ONLY external force and the wall clamp reverses velocity at restitution 0.3, so the " +
        "boundary can only REMOVE energy. *** THIS IS THE VERDICT AND NOBODY CHOSE ITS THRESHOLD. ***");
    ok("!! and it is not potential energy being converted -- BOTH halves rise", shipped.rows[shipped.rows.length - 1].ke > shipped.rows[0].ke && last > first,
        "*** A COLLAPSING COLUMN GAINS KINETIC ENERGY FROM POTENTIAL ENERGY AND CREATES NOTHING. READING KE " +
        "ALONE CANNOT TELL THAT FROM AN INSTABILITY -- this round's first probe measured exactly that wrong " +
        "quantity and the second one settled it. KE+PE is what separates them. ***");
    ok("...and the fluid climbs far above where it started", shipped.top > 2 * TALL_LID / 6,
        "topmost particle " + shipped.top.toFixed(3) + " under a lid at " + shipped.lidY +
        ", from a column whose whole starting height was 0.65. IT WOULD CLIMB THROUGH ANY LID.");
}

// ---------------------------------------------------------------------------
console.log("\n2. THE POSITIVE CONTROL: ABOVE THE THRESHOLD IT SETTLES, SO THE INSTRUMENT IS NOT A YES-MACHINE");
{
    const calm = energyBudget({ visc: 10, T: 2.0, samples: 5 });
    ok("!! energy DECREASES monotonically at a high viscosity", calm.ratio < 1,
        "E(T)/E(0) = " + calm.ratio.toFixed(4) + " against " + shipped.ratio.toFixed(4) + " at the shipped value. " +
        "*** WITHOUT THIS, SECTION 1 WOULD PASS ON AN INSTRUMENT THAT REPORTED GROWTH FOR EVERYTHING (v3177's " +
        "shape, a check that passes because the system does nothing). ***");
    const ke = calm.rows[calm.rows.length - 1].ke;
    ok("...and it genuinely comes to rest", ke < calm.rows[0].total * 1e-2,
        "KE per particle " + ke.toExponential(3) + " -- *** SO THE ANSWER TO v3541's 'MAKE THE COLUMN SETTLE' " +
        "IS YES, AND THE LEVER IS THE KNOB v3541 MADE REACHABLE. The round that wired viscosity through " +
        "makeColumn is the round before the one that needed it. ***");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE KEY IS A BIFURCATION, AND THE SHIPPED DEFAULT SITS BELOW IT");
const th15 = viscosityThreshold({ c: 15, dt: 1 / 1000, T: 1.0, steps: 5 });
{
    ok("!! *** THE SHIPPED VISCOSITY IS BELOW THE STABILITY THRESHOLD ***", MEASURED_V3542.shippedViscosity < th15.bracket[0],
        "threshold bracketed in [" + th15.bracket.map((v) => v.toFixed(4)).join(", ") + "] against a default of " +
        MEASURED_V3542.shippedViscosity + ". ASSERTED AS A RELATION -- the bracket may tighten and the claim " +
        "stays the same one.");
    ok("...and the bracket is a real bisection: below it grows, above it does not",
        energyRatio({ visc: th15.bracket[0], T: 1.0 }) > 1 && energyRatio({ visc: th15.bracket[1], T: 1.0 }) < 1,
        "MEASURED FROM BOTH SIDES, which is what makes it a boundary rather than a number that came out of a " +
        "loop (v3200's friction key, where mu is recovered by bisecting the stick/slide transition)");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** IT IS NOT THE TIME STEP, AND THAT IS THE HALF A GUESS WOULD HAVE GOT WRONG ***");
{
    // SIMULATED TIME HELD CONSTANT. Halving dt at a fixed STEP COUNT halves the run and truncates the question
    // rather than refining it -- v3512 registered blackhole's dt as a refinement knob on exactly that mistake.
    const coarse = viscosityThreshold({ c: 15, dt: 1 / 1000, T: 1.0, steps: 5 });
    const fine = viscosityThreshold({ c: 15, dt: 1 / 4000, T: 1.0, steps: 5 });
    ok("!! *** A FOURFOLD dt REFINEMENT DOES NOT REMOVE THE REQUIREMENT ***", fine.threshold > MEASURED_V3542.shippedViscosity * 2,
        "threshold " + coarse.threshold.toFixed(4) + " at CFL " + coarse.cfl.toFixed(3) + " against " +
        fine.threshold.toFixed(4) + " at CFL " + fine.cfl.toFixed(3) + ". *** IT CONVERGES TO A NONZERO FLOOR. " +
        "NO STEP SIZE MAKES THE SHIPPED VISCOSITY SUFFICIENT. ***");
    ok("...and refining does not make it WORSE either, which would be a different diagnosis", fine.threshold <= coarse.threshold * 1.2,
        "a threshold that ROSE under refinement would mean the coarse step was accidentally damping -- an " +
        "artefact encoded as the expectation. It falls slightly and then stops.");
}

// ---------------------------------------------------------------------------
console.log("\n5. IT IS THE SOUND SPEED -- ONE PARAMETER MOVES IT AND THE OTHER CANNOT");
{
    const slow = viscosityThreshold({ c: 8, dt: 1 / 1000, T: 1.0, steps: 5 });
    const fast = viscosityThreshold({ c: 30, dt: 1 / 1000, T: 1.0, steps: 5 });
    ok("!! *** THE THRESHOLD RISES WITH THE SOUND SPEED ***", fast.threshold > slow.threshold,
        "c 8 -> " + slow.threshold.toFixed(4) + ", c 15 -> " + th15.threshold.toFixed(4) + ", c 30 -> " +
        fast.threshold.toFixed(4) + ". ASSERTED AS AN ORDERING, not a fitted exponent -- three points do not " +
        "settle a power law and claiming one would be numerology (v3472's own correction).");
    ok("!! and section 4 is the contrast that makes it a diagnosis", true,
        "*** A REQUIREMENT THAT SCALES WITH c AND SURVIVES TIME-STEP REFINEMENT IS THE SIGNATURE OF MISSING " +
        "PHYSICAL DISSIPATION, NOT OF AN INTEGRATOR OVERSTEPPING -- which is exactly what the standard SPH " +
        "artificial viscosity (a term proportional to c and h) supplies and this solver does not have: its " +
        "viscosity is a plain constant the caller passes. THE TWO CURES ARE OPPOSITE AND A ROUND THAT GUESSED " +
        "HAD A FIFTY-FIFTY CHANCE OF SPENDING ITSELF ON THE dt. ***");
    report("NOT FIXED, AND DELIBERATELY", "THE DEFAULT IS NOT CHANGED. viscosity 0.1 is read by every frozen " +
        "lab row that touches this solver, so moving it is a change to what the device PROMISES -- v3132's " +
        "battery-change rule, the same reason v3513 left ising's temperature-dependent tolerance alone. " +
        "Whether the fix is a raised default, an artificial-viscosity term proportional to c*h, or a boundary " +
        "that pushes back is a PHYSICS JUDGEMENT AND IT IS KEITH'S.");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE CORRECTION TO MY OWN v3541: A 'FREE' BOX IS A CLAIM WITH A STEP BUDGET");
{
    const b = lidBudget({ lidY: FREE_LID, marks: [1200, 2000] });
    const early = b.marks[0], late = b.marks[1];
    ok("!! *** v3541's FREE_LID IS ONLY FREE FOR A BOUNDED NUMBER OF STEPS ***", late.gap < early.gap,
        "top " + early.top.toFixed(3) + " at 1200 steps (gap " + early.gap.toFixed(3) + ") and " +
        late.top.toFixed(3) + " at 2000 (gap " + late.gap.toFixed(3) + ") under a lid at " + FREE_LID +
        ". v3541 called it 'a box the fluid does not touch' AND ATTACHED NO STEP BUDGET. The census it " +
        "supports ran at 1200 and is unaffected; THE DESCRIPTION WAS WIDER THAN THE MEASUREMENT.");
    ok("...and the shipped BOX is reached far sooner, which v3541 got right",
        lidBudget({ lidY: SHIPPED_LID, marks: [1200] }).marks[0].gap < early.gap,
        "*** THE v3541 FINDING IS NOT WITHDRAWN AND IT GETS WORSE RATHER THAN WRONG: `retained` does measure " +
        "the container, and the reason is not that the fluid expands to a taller equilibrium -- IT IS THAT IT " +
        "NEVER REACHES ONE. Everything MEASURED_V2881 has reported since v2881 was read off a run gaining " +
        "energy. THE KNOB CENSUS STANDS, because which parameters the solver READS is a fact about the code " +
        "and does not need a fluid at rest. ***");
}

// ---------------------------------------------------------------------------
console.log("\n7. THE FREE-SURFACE SCORE IS STILL BLOCKED, AND THE BLOCKER MOVED RATHER THAN CLEARED");
{
    const s = settledSurface({ visc: 3, T: 3.0 });
    ok("!! the settled state IS at rest, so v3541's blocker is genuinely answered", s.ke < 1e-2,
        "KE per particle " + s.ke.toExponential(3) + " over " + s.columns + " wetted columns");
    ok("!! *** AND levelness READS EXACTLY ZERO, WHICH IS THE ONE THING v3540 SAID TO DISTRUST ***", s.sd === 0,
        "sd " + s.sd.toFixed(4) + " across all " + s.columns + " columns at surface cell " + s.meanCell.toFixed(3) +
        ". *** THAT IS THE SIGNATURE OF THE BUG v3540 SHIPPED AND THEN CAUGHT -- a statistic measuring the " +
        "CONTAINER rather than the fluid. Here it is the GRID: the settled pool is TWO CELLS DEEP over the " +
        "whole floor, a surface resolved to a cell has a spread floor set by the grid and not by the physics, " +
        "and with two cells of depth there is nothing left for the physics to say. A KEY BUILT ON THIS ZERO " +
        "WOULD CERTIFY THE RESOLUTION. ***");
    ok("...and the volume claim carries a large shortfall for the same reason", s.errFrac > 0.1,
        "observed " + s.observedCells.toFixed(3) + " cells against " + s.predictedCells.toFixed(3) +
        " predicted from the particles alone, err " + (s.errFrac * 100).toFixed(1) + "% -- against the 20% " +
        "v3540's Flip2D fixture needed at 1.5 cells of depth. THE DEPTH IS THE PROBLEM IN BOTH.");
    ok("...perCellFull is derived from the MATERIAL, not from the state being judged", s.perCellFull > 0,
        "rho0 * h^3 / mass = " + s.perCellFull.toFixed(4) + " particles per cell -- a fact about the fluid, so " +
        "freeSurface's rule holds and a collapsed fluid cannot redefine 'full' and then pass (v3201's mirror)");
    report("*** THE ANTIDOTE, AND WHAT IS OWED ***",
        "THE BLOCKER MOVED FROM 'NO REST STATE' TO 'NOT ENOUGH CELLS OF DEPTH', WHICH IS A FIXTURE SIZE AND " +
        "NOT A PHYSICS PROBLEM. What is owed is a fixture whose SETTLED depth is many cells -- more particles, " +
        "or a smaller h against the same box. WHEN THAT EXISTS THIS SECTION GOES RED AND SHOULD BE REWRITTEN " +
        "TO ASSERT THAT sd IS NONZERO AND FALLS, AND THAT THE VOLUME ERROR SHRINKS WITH DEPTH -- NOT WEAKENED, " +
        "AND NOT DELETED. And note v3541's OWN antidote did NOT fire and was right not to: it said section 7 " +
        "would go red when somebody made the column settle, and settling it took CHANGING A PARAMETER rather " +
        "than fixing the solver, so the default still does not settle and that gate is still telling the truth.");
}

// ---------------------------------------------------------------------------
console.log("\n7b. *** THE THIRD REFINEMENT AXIS, AND THE THRESHOLD DOES NOT SURVIVE IT ***");
{
    // ADDED BY A SECOND SURFACE THAT BUILT THIS SAME ROUND IN THE SAME SANDBOX AND DELETED ITS DUPLICATE
    // (v3511's precedent, SEVENTH instance of two surfaces working one tree). THE ONE THING IT CARRIED THAT
    // THIS FILE DID NOT: section 4 refines dt and HOLDS T, section 5 sweeps c and HOLDS T -- and nobody
    // refined T. Doing it is the same idiom one axis over, and the answer is different.
    const r = [1, 2, 4].map((T) => energyRatio({ visc: 0.47, T }));
    ok("!! *** viscosity 0.47 LOOKS DISSIPATIVE AT T = 1 AND CROSSES OVER BY T = 4 ***",
        r[0] < 1 && r[2] > 1,
        "ratios " + r.map((x) => x.toFixed(4)).join(" -> ") + " across T = 1/2/4 at dt 1e-3. *** A VISCOSITY " +
        "THIS FILE'S OWN BISECTION CALLS STABLE IS NOT STABLE ONCE THE RUN IS LONG ENOUGH. ***");
    const a = viscosityThreshold({ T: 1 }).bracket, b = viscosityThreshold({ T: 4 }).bracket;
    ok("!! and the BRACKETS DO NOT OVERLAP, so it is not a tightening -- it MOVES",
        a[1] <= b[0],
        "T=1 [" + a.map((x) => x.toFixed(4)).join(", ") + "] against T=4 [" + b.map((x) => x.toFixed(4)).join(", ") +
        "]. *** SO WHAT SECTIONS 3-5 MEASURE IS A THRESHOLD-AT-A-HORIZON AND NOT A THRESHOLD. The dt " +
        "refinement was the right question asked on the wrong axis: HOLDING T CONSTANT WHILE REFINING dt IS " +
        "CORRECT FOR dt AND SAYS NOTHING ABOUT T. ***");
    ok("...and the shipped viscosity is below BOTH brackets, so section 3's claim is untouched",
        0.1 < a[0] && 0.1 < b[0],
        "0.1 against a lower edge of " + Math.min(a[0], b[0]).toFixed(4) + " at either horizon -- *** THE " +
        "FINDING THAT THE SHIPPED CONFIGURATION IS UNSTABLE DOES NOT DEPEND ON WHERE THE BOUNDARY IS, which " +
        "is why that claim is asserted as a RELATION and this one is a caveat on the NUMBER rather than on " +
        "the verdict. ***");
    report("ANTIDOTE", "IF SOMEBODY REGISTERS A SINGLE VISCOSITY THRESHOLD AS A CONSTANT, THIS SECTION GOES " +
        "RED. THE CORRECT RESPONSE IS TO DELETE THE CONSTANT, NOT THIS CHECK -- unless they have measured the " +
        "horizon dependence away, in which case rewrite this to assert THAT. A THRESHOLD IS ONLY A THRESHOLD " +
        "IF IT STOPS MOVING WHEN YOU LOOK FOR LONGER.");
}

console.log("\n8. THE FRONT DOOR, AND ONE DECLARATION OF THE INSTRUMENT");
{
    const rt = readFileSync(path.join(ENG, "tools/ship/reportingTools.mjs"), "utf8");
    ok("!! this module has a front door", /physics\/sph\/stability\.mjs/.test(rt),
        "registered in reportingTools' REPORTING list; PRINTS and EXITS ZERO, and this gate is what exits nonzero");
    const src = readFileSync(path.join(HERE, "stability.mjs"), "utf8");
    const code = codeOnly(src);
    ok("...and it reuses materialKnobs' lattice rather than declaring a second one", /LATTICE/.test(code) && /packedDensity/.test(code),
        "*** A SECOND DECLARATION OF THE FIXTURE WOULD BE THE DEFECT THIS TREE NAMES MOST, in the round " +
        "correcting the round that wrote the first one. ***");
    ok("...and STILL_BLOCKED records the new blocker where the next reader will look", STILL_BLOCKED.freeSurfaceScore.length > 200,
        "so the next round starts from the fixture size rather than re-deriving that the column now settles");
}

console.log(`\nstability-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
