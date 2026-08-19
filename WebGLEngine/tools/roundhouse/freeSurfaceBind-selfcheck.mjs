// tools/roundhouse/freeSurfaceBind-selfcheck.mjs
//
// v3728 -- GRADES THE FREE-SURFACE DEVICE, AND THE FIRST SECTION EXISTS BECAUSE THE BRIEF THIS ROUND CAME
// FROM WAS WRONG.
//
// The note carried in said fluid/freeSurface-selfcheck.mjs "PASSES THE SAME 4 TO BOTH" fillBlock's perCell
// and freeSurface's perCellFull, and quoted a 66.1% volume miss as the shipped defect. IT DOES NOT AND IT IS
// NOT: the gate reads PER_CELL = 2, PPC = PER_CELL * PER_CELL, hands the first to fillBlock and the second to
// the surface functions, and asserts median occupancy === perCell^2 by name. The 66.1% was reproduced here
// exactly -- by a PROBE that passed per=4 to fillBlock and 4 to perCellFull. *** A MEASUREMENT TAKEN THROUGH
// A FIXTURE THE MEASURER WROTE IS A STATEMENT ABOUT THAT FIXTURE UNTIL SOMETHING INDEPENDENT AGREES. ***
// Section 1 is that unit, asserted here too, so the same mistake cannot be made twice in the same tree.
//
// The device's own two claims and how each is shown to have power:
//   vessels -- gapEnvelope <= 1 cell. NEGATIVE CONTROL: the SAME fixture run shorter FAILS it (section 3).
//   depth   -- depthErrFrac <= 0.15. PLANT: v3540's minimum-cell surface passes the gap and fails this.
import { buildFreeSurface, vesselFixture, freeSurfaceDefaults, FREESURFACE_OBSERVABLES } from "./freeSurfaceBind.mjs";
import { surfaceCells, levelness, volumeHeight, occupancy } from "../../fluid/freeSurface.mjs";
import { Flip2D } from "../../fluid/flip2d.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("freeSurfaceBind-selfcheck -- communicating vessels, and the brief that was wrong\n");

// ---------------------------------------------------------------------------
console.log("1. THE UNIT THE BRIEF THOUGHT WAS BROKEN, ASSERTED RATHER THAN ARGUED");
{
    let allMatch = true, line = [];
    for (const per of [2, 3, 4]) {
        const g = new Flip2D(40, 40, {});
        g.fillBlock(8, 32, 22, 36, per, () => 0.5);
        const cells = occupancy(g.px, g.py, g.h).size;
        allMatch = allMatch && g.px.length === cells * per * per;
        line.push(`per=${per}: N=${g.px.length} over ${cells} cells`);
    }
    ok("!! *** fillBlock's perCell IS PER AXIS: N === cells * perCell^2, EXACTLY, AT THREE DENSITIES ***", allMatch,
        line.join(" | ") + ". *** THIS HALF OF THE BRIEF WAS TRUE. THE OTHER HALF -- that the shipped gate " +
        "passes the same 4 to both -- WAS NOT: fluid/freeSurface-selfcheck.mjs reads PER_CELL = 2, " +
        "PPC = PER_CELL * PER_CELL, and asserts the square by name. The 66.1% miss came from a probe that " +
        "made the mistake it was looking for. ***");

    const c = freeSurfaceDefaults({}).config;
    const { f, full } = vesselFixture(c);
    ok("...and this device uses the squared unit, checked against the fill it just made", full === c.per * c.per,
        `per=${c.per} -> perCellFull=${full}, ${f.count()} particles in the two blocks`);
}

// ---------------------------------------------------------------------------
console.log("\n2. THE STARTING VALUE IS EXACT, WHICH IS WHY THIS FIXTURE AND NOT THE FLAT BLOCK");
{
    let exact = true, half = true, line = [];
    for (const [L, R] of [[16, 4], [20, 2], [8, 6]]) {
        const r = await buildFreeSurface({ config: { leftTall: L, rightTall: R, steps: 120, settleWindow: 120, sample: 60 } });
        exact = exact && r.gapInitial === L - R && r.gapInitialExact === L - R;
        half = half && Math.abs(r.sdInitial - (L - R) / 2) < 1e-12;
        line.push(`${L}/${R} -> gap ${r.gapInitial.toFixed(4)}, sd ${r.sdInitial.toFixed(4)}`);
    }
    ok("!! *** gapInitial EQUALS leftTall - rightTall TO THE DIGIT, AT THREE ASYMMETRIES ***", exact, line.join(" | "));
    ok("...and sdInitial is exactly half of it, since the halves are equally wide", half,
        "*** THE SHIPPED FIXTURE CANNOT DO THIS. It drops ONE FLAT BLOCK, so its spread reads 0.0000 at step " +
        "0 -- FLAT BY CONSTRUCTION -- and the container floor reads the same zero, which is v3540's own caught " +
        "bug from the other side. A KEY WHOSE IDEAL VALUE IS ALSO ITS STARTING VALUE HAS TO LEAN ON THE " +
        "EXCURSION BETWEEN THEM. This one starts WRONG BY AN EXACT AMOUNT instead. ***");
}

// ---------------------------------------------------------------------------
console.log("\n3. THE NEGATIVE CONTROL: THE SAME FIXTURE RUN SHORTER MUST FAIL THE CLAIM");
{
    const runs = [];
    for (const steps of [1200, 1800, 2400, 3000]) runs.push([steps, await buildFreeSurface({ config: { steps } })]);
    const at = (s) => runs.find((r) => r[0] === s)[1];
    ok("!! *** AT 1800 STEPS THE FLUID IS STILL SLOSHING AND THE CLAIM IS FALSE ***", at(1800).gapEnvelope > 1,
        "envelope " + at(1800).gapEnvelope.toFixed(4) + " cells against a bound of 1");
    ok("!! ...and at 3000 it is true", at(3000).gapEnvelope <= 1,
        "envelope " + at(3000).gapEnvelope.toFixed(4) + ". *** A CLAIM THAT IS FALSE ON ITS OWN FIXTURE UNTIL " +
        "THE PHYSICS HAS ACTUALLY HAPPENED IS A CLAIM WITH POWER. Nothing here was tuned to make it pass: the " +
        "bound is ONE CELL because a column's surface is an INTEGER cell index, so two sides sampling one true " +
        "height between cells k and k+1 both have means inside [k, k+1]. ***");
    ok("...and the approach is monotone across the four lengths", 
        at(1200).gapEnvelope >= at(1800).gapEnvelope && at(1800).gapEnvelope >= at(2400).gapEnvelope && at(2400).gapEnvelope >= at(3000).gapEnvelope,
        runs.map(([s, r]) => s + ":" + r.gapEnvelope.toFixed(4)).join(" -> ") +
        " -- reported as a TRAJECTORY, because a single settled reading cannot show whether a statistic has power (v3544).");
    // *** THE MARGIN THIS BLOCK ONCE REPORTED WAS MEASURED ON TOO NARROW A SWEEP, AND A SECOND SWEEP MOVED IT
    // IN THE UNFLATTERING DIRECTION. Six seeds at per=2 top out at 0.3684 and four asymmetries at 0.4737 -- but
    // per=3 reads 0.8421 at seed 2 and 0.8947 at seed 5, so THE WORST HONEST READING IS 0.8947 AGAINST A BOUND
    // OF 1: A MARGIN OF 1.12x, NOT 2.11x. It is a STATIONARY offset rather than an unsettled run, and that was
    // checked rather than assumed -- seed 2 reads 0.7895 at BOTH 4500 and 6000 steps, 15 grid quanta. WHY odd
    // per behaves differently IS NOT KNOWN HERE AND IS NOT CLAIMED.
    // *** IT IS ASSERTED RATHER THAN REPORTED, WHICH IS THE WHOLE CORRECTION: a margin that lives in a prose
    // line is one nothing re-runs, and the first figure survived precisely because nothing did. IF THIS GOES
    // RED the odd-per case has crossed the bound and that is a finding about the solver -- NOT a reason to move
    // gapBoundCells, which is the grid's own resolution and cannot be widened without inventing resolution. ***
    const narrow = await buildFreeSurface({ config: { per: 3, seed: 5 } });
    ok("!! *** THE NARROWEST HONEST CONFIGURATION IS ASSERTED, NOT THE MOST FLATTERING ONE ***",
        narrow.gapEnvelope < narrow.gapBoundCells,
        "per=3 seed=5 envelope " + narrow.gapEnvelope.toFixed(4) + " against the bound of " + narrow.gapBoundCells +
        " -- a margin of " + (narrow.gapBoundCells / narrow.gapEnvelope).toFixed(2) + "x, against " +
        (at(3000).gapBoundCells / at(3000).gapEnvelope).toFixed(2) + "x at the per=2 default. A KEY SHIPPED " +
        "WITHOUT ITS SENSITIVITY IS A KEY SOMEBODY WILL OVER-TRUST, and quoting it at its best configuration " +
        "is the same failure wearing a number.");
    report("THE HONEST MARGIN, MEASURED NOT ASSUMED -- AND RE-MEASURED",
        "*** 0.8947 worst against a bound of 1 (per=3, seed 5). The 0.4737 / 2.11x this line used to carry was " +
        "true of the sweep it came from and FALSE OF THE DEVICE: per=2 and per=4 stay under 0.3684 on every " +
        "seed tried, and the odd-per readings sit at 0.8421 and 0.8947. A TALLY MEASURED ON A NARROW SWEEP " +
        "AND REPEATED FROM MEMORY DRIFTS IN THE FLATTERING DIRECTION -- say what the sweep was every time. ***");
}

// ---------------------------------------------------------------------------
console.log("\n4. PLANT ONE -- READ A POINT INSTEAD OF THE ENVELOPE. A SLOSH PASSES THROUGH LEVEL.");
{
    const r = await buildFreeSurface({ config: { steps: 420, settleWindow: 180, sample: 60 } });
    ok("!! *** THE FINAL SAMPLE READS LEVEL ON A FLUID THAT IS VIOLENTLY SLOSHING ***", r.gapFinal <= 1,
        "gapFinal " + r.gapFinal.toFixed(4) + " at step 420 -- it would pass the bound outright");
    ok("!! ...AND THE ENVELOPE OF THE SAME RUN FAILS IT", r.gapEnvelope > 1,
        "gapEnvelope " + r.gapEnvelope.toFixed(4) + " over the same " + r.samples + " samples, " +
        (r.gapEnvelope / Math.max(r.gapFinal, 1 / 38)).toFixed(0) + "x the point reading. *** ONE CALL, TWO " +
        "OBSERVABLES, OPPOSITE VERDICTS. This is why the device returns the envelope: a damped slosh crosses " +
        "its own converged value twice a period, so a late sample is not a late-time measurement, it is a " +
        "COIN TOSS ON THE PHASE. ***");
}

// ---------------------------------------------------------------------------
console.log("\n5. PLANT TWO -- v3540's MINIMUM-CELL SURFACE, AND THE BLINDNESS IT EXPOSES");
{
    const c = freeSurfaceDefaults({}).config;
    const { f, full, mid } = vesselFixture(c);
    for (let s = 0; s < c.steps; s++) await f.step(c.dt);

    const top = surfaceCells(f.px, f.py, f.h, full, 0.5);
    const cnt = occupancy(f.px, f.py, f.h), bot = new Map();
    for (const [k, v] of cnt) {                                     // MINIMUM per column: the bug v3540 shipped
        if (v < 0.5 * full) continue;
        const i = k.indexOf(","), cx = +k.slice(0, i), cy = +k.slice(i + 1);
        if (!bot.has(cx) || cy < bot.get(cx)) bot.set(cx, cy);
    }
    const min = [...bot.entries()].sort((a, b) => a[0] - b[0]).map(([cx, cy]) => ({ cx, cy }));
    const gapOf = (s) => {
        const L = s.filter((e) => e.cx < mid), R = s.filter((e) => e.cx >= mid);
        const m = (a) => a.reduce((x, e) => x + e.cy, 0) / a.length;
        return (L.length && R.length) ? Math.abs(m(L) - m(R)) : Infinity;
    };
    const Vt = volumeHeight({ px: f.px, py: f.py, h: f.h, perCellFull: full, floorCell: 0, surface: top });
    const Vb = volumeHeight({ px: f.px, py: f.py, h: f.h, perCellFull: full, floorCell: 0, surface: min });

    ok("!! *** THE PLANTED SURFACE PASSES THE GAP CLAIM OUTRIGHT -- THE CONTAINER FLOOR IS LEVEL TOO ***",
        gapOf(min) <= 1,
        "min-surface gap " + gapOf(min).toFixed(4) + " against the honest surface's " + gapOf(top).toFixed(4) +
        ", bound 1. *** NEITHER LEVELNESS NOR THE GAP CAN SEE THIS, AND NEITHER EVER CLAIMED TO: they are " +
        "statements about SLOPE and know nothing about HEIGHT. Calling that a gap in the gap claim would be " +
        "reading a structural blindness as a defect (v3715). ***");
    report("AND THE sd COMPARISON IS DELIBERATELY NOT ASSERTED",
        "min sd " + levelness(min).sd.toFixed(4) + " against surface sd " + levelness(top).sd.toFixed(4) +
        " -- BOTH READ EXACTLY ZERO ON THIS FIXTURE, so `min.sd <= top.sd` would be 0 <= 0 and would pass " +
        "whatever the plant did. A CHECK WHOSE ANSWER IS STRUCTURALLY GUARANTEED IS NOT EVIDENCE, so this " +
        "one is reported and not counted. (fluid/freeSurface-selfcheck section 4 CAN assert it, because its " +
        "settled block leaves a non-zero surface spread for the floor to be flatter than.)");
    ok("!! *** AND THE DEPTH CLAIM FIRES ON IT ***", Vb.errFrac > 0.15 && Vt.errFrac <= 0.15,
        "depthErrFrac " + Vb.errFrac.toFixed(4) + " planted against " + Vt.errFrac.toFixed(4) + " honest, bar 0.15 -- " +
        (Vb.errFrac / 0.15).toFixed(2) + "x the bar planted and " + (0.15 / Vt.errFrac).toFixed(2) +
        "x of margin honest. THE TWO MODES ARE A PAIR: `vessels` sees a fluid that is sloped, `depth` sees " +
        "one that is level AT THE WRONG HEIGHT, and each is blind to the other's case.");
    report("WHY depth's BAR IS 15% AND NOT 1%, WHICH IS A PHYSICS ANSWER AND NOT A TOLERANCE",
        "*** volumeHeight divides the particle count by the CALLER'S FILL DENSITY, and the density a fluid " +
        "relaxes into is a RESULT, NOT AN INPUT. Measured on this solver: settled interior occupancy over the " +
        "fill's perCell^2 reads 1.021 at per=2 and 0.868 at per=4 ON THE SAME PHYSICAL FLUID -- it misses in " +
        "OPPOSITE DIRECTIONS at the two densities. The SPH thread refused the volume claim for exactly this " +
        "reason at v3543/v3546; THIS IS THE SAME CONCLUSION REACHED BY A DIFFERENT SOLVER ON A DIFFERENT " +
        "FIXTURE, and it is worth more than either measurement alone because the routes share nothing. THE " +
        "GAP AVOIDS ALL OF IT by being a DIFFERENCE between two halves of one fluid: whatever the packing " +
        "constant is, it appears on both sides and subtracts out. ***");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE DEVICE CONTRACT");
{
    const r = await buildFreeSurface({ config: { steps: 600 } });
    const r2 = await buildFreeSurface({ config: { steps: 600 } });
    ok("every declared observable is present and finite", 
        FREESURFACE_OBSERVABLES.every((k) => Number.isFinite(r[k])),
        FREESURFACE_OBSERVABLES.length + " observables");
    ok("the same seed gives the same numbers", r.gapEnvelope === r2.gapEnvelope && r.depthErrFrac === r2.depthErrFrac,
        "gapEnvelope " + r.gapEnvelope.toFixed(6) + ", depthErrFrac " + r.depthErrFrac.toFixed(6) +
        " -- fillBlock takes an rng and this device hands it a seeded LCG, so nothing here depends on Math.random");
    const dm = freeSurfaceDefaults({ mode: "depth" }), vm = freeSurfaceDefaults({ mode: "vessels" });
    ok("each mode carries its OWN claim rather than one claim with a mode label",
        dm.claim.observable === "depthErrFrac" && vm.claim.observable === "gapEnvelope",
        "vessels -> " + vm.claim.observable + " <= " + vm.claim.max + " ; depth -> " + dm.claim.observable + " <= " + dm.claim.max);
    const flat = freeSurfaceDefaults({ config: { leftTall: 6, rightTall: 9 } });
    ok("!! a caller CANNOT ask for two equal columns, which would be the flat block again",
        flat.config.rightTall < flat.config.leftTall,
        "asked for 6/9, clamped to " + flat.config.leftTall + "/" + flat.config.rightTall +
        " -- *** THE FIXTURE'S WHOLE POINT IS THAT gapInitial IS NON-ZERO AND EXACT, so a config that " +
        "zeroes it is refused by the clamp rather than measured and reported as a pass. ***");
}

report("WHAT THIS DOES NOT CLAIM",
    "That fluid/freeSurface.mjs is verified. occupancy's binning, the frac threshold, levelness and " +
    "volumeHeight are all exercised on a real settled fluid; a 3D free surface, a moving container and the " +
    "surface's behaviour under a lid are UNGRADED. gradedCoverage moves by ONE MODULE, and the honest reading " +
    "of that is 'this module now has a key', not 'this module is correct'.");

console.log(`\nfreeSurfaceBind-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
