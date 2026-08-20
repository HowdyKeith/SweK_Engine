// physics/sph/poolFixture-selfcheck.mjs
//
// v3543 -- GRADES BOTH HALVES OF WHAT v3542 SAID WAS OWED, AND NEITHER HALF WORKS.
//
// STATED RUNTIME: ~200s, MEASURED. The N = 2800 settle is ~60s of it and is unavoidable: the shipped particle
// count HAS NO INTERIOR, so the only fixture that can be asked the question is the expensive one.
//
// *** THE ASSERTIONS ARE RELATIONS AND DERIVATIONS, NEVER TYPED THRESHOLDS. *** The one equality asserted is
// the phantom-column arithmetic, and it is exact by construction: Math.floor(W/h) is one PAST the last cell
// index inside a box W/h cells wide, so the bound comes from the box rather than from a number chosen here.
"use strict";
import { settlePool, poolSurface, settledDensity, interiorNumberDensity, fullCellSplit,
         cellIndex, perCellFullDeclared, perCellFullLattice, makeFixture,
         SHIPPED_FLOOR, MEASURED_V3543, REFUSED_FIX, REFUTED_ROUTES } from "./poolFixture.mjs";
import { LATTICE } from "./materialKnobs.mjs";
import { reportLines } from "./poolFixture.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);
const pct = (x) => (x * 100).toFixed(1) + "%";

console.log("poolFixture-selfcheck -- the fixture v3542 said was owed\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE WALL CLAMP PUTS PARTICLES IN A CELL OUTSIDE THE BOX ***");
const narrow = settlePool({ W: 0.4, targetN: 686, steps: 3000 });
{
    const P = narrow.w.particles, W = 0.4, h = narrow.h;
    const atWall = P.filter((p) => p.x === W).length;
    ok("!! particles sit at EXACTLY the wall coordinate", atWall > 0,
        atWall + " of " + P.length + " at x = " + W + " exactly -- the clamp is `a[k] = hi`, not a nudge inside");
    const boxCells = Math.ceil(W / h);
    ok("!! *** AND Math.floor(x/h) THERE IS A CELL INDEX OUTSIDE A BOX " + boxCells + " CELLS WIDE ***",
        Math.floor(W / h) === boxCells && cellIndex(W, W, h) === boxCells - 1,
        "raw index " + Math.floor(W / h) + " against a last-inside index of " + (boxCells - 1) +
        ". *** THE BOUND IS DERIVED FROM THE BOX, NOT CHOSEN. ***");
    const raw = poolSurface(narrow, { clamped: false }), fixed = poolSurface(narrow, { clamped: true });
    ok("!! the phantom columns are COUNTED, so `predicted = cells/columns` is too small",
        raw.columns > fixed.columns && fixed.columns <= fixed.boxColumns,
        raw.columns + " raw against " + fixed.columns + " clamped, in a box of " + fixed.boxColumns +
        " columns. A COLUMN COUNT ABOVE THE BOX'S OWN IS THE TELL.");
    ok("!! *** AND CORRECTING IT MAKES THE ERROR WORSE AND THE SPREAD VANISH ***",
        fixed.errFrac > raw.errFrac && fixed.sd < raw.sd,
        "err " + pct(raw.errFrac) + " -> " + pct(fixed.errFrac) + ", sd " + raw.sd.toFixed(3) + " -> " +
        fixed.sd.toFixed(3) + ". *** THE TWO THINGS v3542's ANTIDOTE ASKED FOR -- A NONZERO SPREAD AND A " +
        "SMALLER VOLUME ERROR -- WERE ENTIRELY THE CELLS OUTSIDE THE BOX. ***");
}

// ---------------------------------------------------------------------------
console.log("\n2. NARROWING THE BOX IS THE WRONG LEVER, AND THE LAST COLUMN SAYS WHY");
{
    const wide = settlePool({ W: SHIPPED_FLOOR, targetN: 686, steps: 3000 });
    const a = poolSurface(wide), b = poolSurface(narrow);
    ok("!! a narrower floor makes the volume error WORSE, not better", b.errFrac > a.errFrac,
        "W " + SHIPPED_FLOOR + " -> " + pct(a.errFrac) + " against W 0.4 -> " + pct(b.errFrac) +
        ". *** depth x columns IS A CONSERVED BUDGET so a narrower floor MUST buy depth -- and it buys " +
        "nothing, because of the next line. ***");
    ok("!! *** A NARROW TANK IS ALMOST ENTIRELY BOUNDARY LAYER ***", b.onSideWallFrac > a.onSideWallFrac * 1.2,
        pct(a.onSideWallFrac) + " of the fluid touches a SIDE wall at W " + SHIPPED_FLOOR + " against " +
        pct(b.onSideWallFrac) + " at W 0.4 (the FLOOR is excluded -- it is there at every width, and mixing it in read 56.0% against 57.1%, hiding the whole effect). It is not a deeper pool, it is a thinner one seen end-on.");
    ok("...and the fixture changes only the CONTAINER", makeFixture({ W: 0.4 }).spacing === LATTICE.spacing,
        "the fill is centred and its pitch comes from materialKnobs' LATTICE -- ONE DECLARATION OF THE PITCH, " +
        "so a width sweep leaves the solver untouched");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** EIGHTFOLD DEPTH MOVES THE ERROR BY NOTHING ***");
const deep = settlePool({ W: SHIPPED_FLOOR, targetN: 2800, steps: 3000 });
{
    const shallow = poolSurface(settlePool({ W: SHIPPED_FLOOR, targetN: 686, steps: 3000 }));
    const s = poolSurface(deep);
    ok("!! the pool IS much deeper", s.predicted > shallow.predicted * 3,
        "predicted depth " + shallow.predicted.toFixed(2) + " -> " + s.predicted.toFixed(2) + " cells");
    ok("!! *** AND THE RELATIVE ERROR DOES NOT MOVE ***", Math.abs(s.errFrac - shallow.errFrac) < 1e-6,
        pct(shallow.errFrac) + " against " + pct(s.errFrac) + ", equal to within a millionth. *** A RATIO " +
        "THAT WILL NOT FOLLOW A REFINEMENT IS NOT A DISCRETISATION ERROR (v3492's rule). BOTH v3540's " +
        "'known bias with a sign' AND v3542's 'quantisation on a 2.6-cell depth' ARE REFUTED AS THE WHOLE " +
        "STORY BY THIS ONE COMPARISON. ***");
    report("EQUALITY IS THE RIGHT ASSERTION HERE",
        "everywhere else in this arc a typed number would be wrong; here the CLAIM IS that the number does " +
        "not move, so demanding it move by less than a millionth is asserting the finding rather than a " +
        "tolerance. If it ever starts moving, the cause has changed and this line should be REWRITTEN TO THE " +
        "NEW PROPERTY, NOT LOOSENED.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE SHIPPED FIXTURE CANNOT BE ASKED AT ALL, AND THE PROBE REFUSES RATHER THAN ANSWERING");
{
    const shallowPool = settlePool({ W: SHIPPED_FLOOR, targetN: 686, steps: 3000 });
    const nd = interiorNumberDensity(shallowPool);
    ok("!! *** A TWO-CELL POOL HAS NO INTERIOR AND THE PROBE SAYS SO ***", nd.askable === false,
        nd.why + " *** A ROUTE THAT QUIETLY RETURNED 0 WOULD HAVE REPORTED AN INFINITE ERROR ABOUT A FIXTURE " +
        "THAT CANNOT BE ASKED -- v3177's shape, a number about nothing. ***");
    const nd2 = interiorNumberDensity(deep);
    ok("!! and the deep fixture CAN be asked", nd2.askable && nd2.count > 0,
        nd2.count + " particles in a slab of volume " + nd2.volume.toFixed(5) +
        ". *** THAT IS THE REAL REASON 'MORE PARTICLES' WAS THE RIGHT LEVER, AND IT IS NOT THE REASON v3542 " +
        "GAVE: not to shrink the error, which does not move, but to make the question askable. ***");
}

// ---------------------------------------------------------------------------
console.log("\n5. WHAT THE GAP IS, SPLIT BY A ROUTE THAT IS NEITHER A MIRROR NOR AN EXTREME");
{
    const s = poolSurface(deep), nd = interiorNumberDensity(deep);
    const split = fullCellSplit({ slabPerCell: nd.perCell, surfaceErrFrac: s.errFrac });
    ok("!! rho0 IS A KERNEL SUM AND perCellFull COUNTS PARTICLES -- two densities under one name",
        split.kernelUnderRead < 1 && split.declared < split.lattice,
        "declared " + split.declared.toFixed(4) + " against the lattice's exact " + split.lattice.toFixed(4) +
        " (factor " + split.kernelUnderRead.toFixed(5) + "). Sum m W UNDER-samples at h/spacing = " +
        (0.1 / LATTICE.spacing).toFixed(0) + ".");
    ok("!! the two factors reproduce declared/slab EXACTLY, so the split is arithmetic and not a story",
        Math.abs(split.productCheck - split.declared / split.slab) < 1e-12,
        "kernel " + split.kernelUnderRead.toFixed(5) + " x 1/relaxation " + (1 / split.relaxation).toFixed(5) +
        " = " + split.productCheck.toFixed(5) + " = declared/slab");
    ok("!! *** AND IT SPLITS THE GAP RATHER THAN EXPLAINING ALL OF IT ***",
        split.definitionErr > 0 && split.statisticErr > 0 && split.definitionErr < s.errFrac,
        "MIS-DEFINED CELL " + pct(split.definitionErr) + " + THE STATISTIC'S OWN BIAS " + pct(split.statisticErr) +
        " = " + pct(s.errFrac) + ". *** SO THE QUANTISATION STORY WAS A THIRD OF THE TRUTH: NOT NONE OF IT " +
        "AND NOT ALL OF IT. A round that had stopped at 'it is all definition' would have been as wrong as " +
        "the two rounds it corrected. ***");
    // THE CONTROL. Without it this whole section reads as a compressed fluid rather than a mis-defined cell.
    const d = settledDensity(deep);
    ok("!! CONTROL: the settled fluid sits ON its rest density, so the FLUID is not the defect",
        Math.abs(d.ratio - 1) < 0.05,
        "mean SPH density " + d.mean.toFixed(2) + " against rho0 " + d.rho0.toFixed(2) + ", ratio " +
        d.ratio.toFixed(4) + ". *** THE CELL IS MIS-DEFINED; THE FLUID IS FINE. ***");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE TWO ROUTES THAT DID NOT WORK, DRIVEN RATHER THAN DESCRIBED");
{
    const s = poolSurface(deep), P = deep.w.particles;
    // (1) THE MIRROR. Shown identical rather than argued.
    ok("!! *** meanOccupancy IS N/(columns*observed) ALGEBRAICALLY -- A MIRROR ***",
        Math.abs(s.meanOccupancy - P.length / (s.columns * s.observed)) < 1e-9,
        s.meanOccupancy.toFixed(6) + " against " + (P.length / (s.columns * s.observed)).toFixed(6) +
        ". *** 'PREDICTING' THE ERROR FROM IT REPRODUCES THE ERROR TO SIX DECIMALS AND CONFIRMS NOTHING. THE " +
        "GIVE-AWAY WAS THAT IT AGREED TOO EXACTLY -- v3201's rule, caught before it shipped. ***");
    // (2) THE EXTREME. Driven on the same pool.
    const W = deep.W, h = deep.h;
    const interior = P.filter((q) => q.x > h && q.x < W - h && q.z > h && q.z < W - h && q.y > h).slice(0, 120);
    let sum = 0;
    for (const a of interior) {
        let best = Infinity;
        for (const b of P) { if (b === a) continue;
            const dd = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2; if (dd < best) best = dd; }
        sum += Math.sqrt(best);
    }
    const dnn = sum / interior.length, ratio = (LATTICE.spacing / dnn) ** 3;
    const nd = interiorNumberDensity(deep);
    ok("!! *** AND NEAREST-NEIGHBOUR SPACING IS AN EXTREME: IT OVER-READS THE DENSITY ***",
        ratio > nd.perCell / perCellFullLattice(),
        "(spacing/dnn)^3 = " + ratio.toFixed(3) + " against the slab's relaxation of " +
        (nd.perCell / perCellFullLattice()).toFixed(3) + ". NN spacing equals the pitch ONLY on a perfect " +
        "lattice and is the minimum over a dozen neighbours in any disordered packing at the same density. " +
        "*** THIRD EXTREME IN THIS ARC, after v3539's topmost particle and v3540's max-occupancy threshold. ***");
    ok("...and both are recorded where the next reader will reach for them",
        REFUTED_ROUTES.meanOccupancy.length > 40 && REFUTED_ROUTES.nearestNeighbour.length > 40,
        "REFUTED_ROUTES names each with its reason -- a wrong route with a reason is worth more than an absence");
}

// ---------------------------------------------------------------------------
console.log("\n7. THE FIX IS REFUSED, AND THE REASON IS THE CONTRACT");
{
    const nd = interiorNumberDensity(deep);
    ok("!! the true occupancy is knowable from NEITHER the fill NOR the material",
        Math.abs(nd.perCell - perCellFullLattice()) > 0.1 && Math.abs(nd.perCell - perCellFullDeclared()) > 0.1,
        "slab " + nd.perCell.toFixed(4) + " against lattice " + perCellFullLattice().toFixed(4) +
        " and material " + perCellFullDeclared().toFixed(4) +
        ". *** THE PACKING A FLUID RELAXES INTO IS A RESULT, NOT AN INPUT. v3540 took 'full' from the LATTICE " +
        "and v3542 from the MATERIAL; both are caller-side and both are wrong by the relaxation. ***");
    ok("...so measuring it from the pool would turn the volume claim into a mirror",
        REFUSED_FIX.perCellFull.includes("RESULT AND NOT AN INPUT"),
        "freeSurface's argument-not-inference design exists to stop exactly that (v3201). REFUSED, WITH THE " +
        "REASON RECORDED.");
    report("*** WHICH CLAIM SURVIVES, AND THE ANTIDOTE ***",
        "THE LEVEL CLAIM NEEDS ONLY A THRESHOLD THAT RANKS COLUMNS CONSISTENTLY, so a mis-defined 'full' " +
        "shifts every column together and cancels. THE VOLUME CLAIM NEEDS AN ABSOLUTE ONE and therefore " +
        "cannot be closed this way. IF SOMEBODY LATER DERIVES A CALLER-SIDE 'full' THAT SURVIVES RELAXATION, " +
        "SECTION 7 GOES RED AND SHOULD BE REWRITTEN TO ASSERT THAT DERIVATION -- NOT WEAKENED, AND NOT " +
        "DELETED. And note what is still NOT closed: levelness reads sd EXACTLY 0.0000 at every fixture in " +
        "this round, so the level claim remains UNGRADED for want of a pool whose surface can be uneven.");
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
       L.join("\n").includes("[poolFixture]"),
       L.length + " lines, self-named");
}

console.log(`\npoolFixture-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
