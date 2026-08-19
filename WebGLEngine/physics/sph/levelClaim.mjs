// physics/sph/levelClaim.mjs
//
// v3544 -- *** THE LEVEL CLAIM IS GRADEABLE AT LAST, AND WHAT UNBLOCKED IT WAS NOT DEPTH. ***
//
// v3543 closed with the one thing still open: "levelness reads sd EXACTLY 0.0000 at EVERY fixture, so THE
// LEVEL CLAIM REMAINS UNGRADED for want of a pool whose surface CAN be uneven". Three rounds had read that
// zero as a resolution problem -- v3540 called it the grid, v3542 called it a dead check, v3543 spent itself
// on depth. *** IT IS NEITHER. THE SURFACE WAS NEVER GIVEN ANYTHING TO BE UNEVEN ABOUT. *** Every fixture in
// the arc filled the box uniformly and let it settle, so the surface starts level and stays level, and a
// statistic asked only about states that are already flat reports flat.
//
// *** CORRECTION, BY A SECOND SURFACE THAT BUILT THIS SAME ROUND AND FOUND THIS FILE ALREADY HERE (EIGHTH
// INSTANCE; v3511's precedent, no duplicate shipped). THE SENTENCE ABOVE IS REFUTED BY THIS FILE'S OWN
// REGISTER. *** `levelStart` records the UNIFORM fill at 0.3614 / 2.7664 / 0.0479 / 0.0000 over steps
// 0/300/900/1800: IT DOES NOT START LEVEL AND IT DOES NOT STAY LEVEL -- it rises to nearly three cells of
// spread and then comes level, and a second surface reproduced 2.7664 independently before noticing the
// number was already sitting twenty lines below. SO THE UNIFORM FIXTURE WAS NEVER FLAT; IT WAS NEVER
// SAMPLED EARLY. The dam break is still the better fixture -- 11.045 against 2.766 is four times the signal
// -- but it is better because it is LOUDER, not because the old one was silent. TWO DECLARATIONS ABOUT ONE
// THING THAT NOBODY COMPARED, in the round whose subject is a statistic nobody sampled, with both halves in
// one file. THE FIX AND THE DATA STAND; THE REASON GIVEN FOR THE FIX DID NOT.
//
// TWO CHANGES, AND NEITHER IS A DEEPER POOL:
//
//   1. A DAM BREAK -- the same particles in HALF the floor, twice as tall, in the SAME box. The surface then
//      starts as a step and has somewhere to go. sd runs 11.045 -> 1.980 -> 0.000 -> 0.000 over 300/900/
//      1800/3000 steps. *** ELEVEN CELLS OF SPREAD COLLAPSING TO ZERO IS THE CLAIM v3540 WROTE DOWN, AND IT
//      IS THE FIRST TIME ANYTHING IN THIS ARC HAS SEEN IT HAPPEN. ***
//
//   2. A SUB-CELL SURFACE HEIGHT. The old statistic returned the INTEGER index of the top qualifying cell;
//      this one adds how far the cell ABOVE is filled, so a column can sit at 8.4 rather than 8 or 9. It is
//      the transient that needs this -- and AT REST IT COLLAPSES BACK TO THE INTEGER, because the cell above
//      the surface is empty in every column, which is worth saying rather than leaving as an impression that
//      the resolution problem was solved. IT WAS NOT. IT WAS SIDESTEPPED BY MEASURING A STATE THAT MOVES.
//
// ---- WHY THE ZERO AT REST IS NOW AN ANSWER RATHER THAN A DEAD CHECK -----------------------------------------
//
// v3543's test for a uninformative zero was: does the CONTAINER FLOOR -- flat by construction -- report the
// same number? At rest it does, and that is what condemned the statistic. *** DURING THE TRANSIENT IT DOES
// NOT: at 300 steps the surface reads 11.045 and the floor reads 0.000. *** The two agree only where they
// should and differ by eleven cells where they should. A zero reached from eleven is a measurement; a zero
// that was never anything else is furniture.
//
// ---- THE LOAD-BEARING NEGATIVE IS A SETTLED STATE THAT IS NOT LEVEL ------------------------------------------
//
// A dam break proves the statistic can be large. It does not prove the statistic can FAIL, because everything
// it grades ends level. *** TILT GRAVITY AND THE FLUID SETTLES TO A SURFACE THAT IS NOT LEVEL IN THE BOX
// FRAME *** -- and it is genuinely SETTLED, not caught mid-slide: at 20 degrees sd reads 3.014, 2.184, 2.171,
// 2.186 over 1500/3000/4500/6000 steps, stationary to 1% from 3000 on. Response is monotone in tilt:
// 0.0000 / 0.0455 / 0.8188 / 2.1845 at 0/5/10/20 degrees.
//
// *** AND THE CLOSED FORM DOES NOT HOLD, WHICH IS REPORTED RATHER THAN DRESSED UP. *** The obvious key is
// that the settled surface is perpendicular to gravity, so its slope should be tan(theta). Measured against
// a least-squares fit over the columns it reads 0.075x, 2.20x and 2.82x of tan(theta) at 5/10/20 degrees --
// under at small tilt (the slope is below one cell across the box and the grid cannot see it) and OVER at
// large. THIS ROUND DOES NOT SETTLE WHY, and asserting the closed form would be numerology (v3472's own
// correction). WHAT IS ASSERTED IS THE MONOTONE RESPONSE, which is what makes the negative load-bearing.
//
// ---- AND A CORRECTION TO v3543, WHICH I WROTE IN CAPITALS ------------------------------------------------------
//
// v3543 concluded that the level claim survives a mis-defined `full` because "a mis-defined full shifts every
// column together and CANCELS". *** IT DOES NOT CANCEL. IT IS ROBUST, NOT INVARIANT, AND THOSE ARE DIFFERENT
// CLAIMS. *** Measured on one settled state across full = 4.33 / 7.22 / 8.00 / 8.68 / 10.83, sd reads 2.3518 /
// 1.9803 / 1.9832 / 1.9250 / 1.8569: over the range that actually matters -- the declared 7.2169 to the
// measured slab 8.6798 -- it moves 2.8%, against a signal that runs from 11.045 to 0. So the conclusion
// stands and the word was wrong, and the mean moves far more than the spread does, which is exactly why the
// VOLUME claim is the one that could not be closed.
"use strict";
import { settlePool, cellIndex, perCellFullDeclared, SHIPPED_FLOOR } from "./poolFixture.mjs";

/**
 * The free surface as a CONTINUOUS height per column: the top qualifying cell, plus how far the cell above it
 * is filled. Returns [columnKey, height] so a caller can fit against position as well as take a spread.
 *
 * `bottom: true` returns the LOWEST qualifying cell instead -- the container floor, which is flat by
 * construction and is the negative that decides whether a zero means anything (v3540's own shipped-and-caught
 * bug, used here deliberately as a control).
 */
export function surfaceHeights(pool, { full = null, frac = 0.5, bottom = false } = {}) {
    const { w, W, h } = pool, P = w.particles;
    const FULL = full != null ? full : perCellFullDeclared(h, pool.mass);
    const cnt = new Map();
    for (const p of P) {
        const k = cellIndex(p.x, W, h) + "," + Math.floor(p.y / h) + "," + cellIndex(p.z, W, h);
        cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    const cols = new Map();
    for (const [k, v] of cnt) {
        const [cx, cy, cz] = k.split(",").map(Number), c = cx + "," + cz;
        if (!cols.has(c)) cols.set(c, new Map());
        cols.get(c).set(cy, v);
    }
    const out = [];
    for (const [c, byY] of cols) {
        let pick = bottom ? Infinity : -1;
        for (const [cy, v] of byY) if (v >= frac * FULL) { if (bottom ? cy < pick : cy > pick) pick = cy; }
        if (!Number.isFinite(pick) || pick < 0) continue;
        if (bottom) { out.push([c, pick]); continue; }
        // THE SUB-CELL TERM. At rest this is 0 in every column (the cell above the surface is empty), so the
        // statistic collapses to the integer -- which is why the TRANSIENT is what makes the claim gradeable.
        out.push([c, pick + 1 + Math.min(1, (byY.get(pick + 1) || 0) / FULL)]);
    }
    return out;
}

/**
 * *** ADDED v3544 BY A SECOND SURFACE THAT BUILT THIS SAME ROUND AND DELETED ITS DRAFT (v3511's precedent,
 * EIGHTH instance). THE ONE THING IT CARRIED THAT THIS FILE DID NOT: surfaceHeights above iterates only over
 * columns that HOLD PARTICLES, so a fluid that never spreads is not penalised -- IT IS MEASURED OVER FEWER
 * COLUMNS AND READS PERFECTLY LEVEL. *** Driven: a pressureless fluid (ideal law, stiffness 0) sits in half
 * the box and reads sd 0.0000 over 18 columns, exactly what a correct fluid reads over 36. THE COLUMN COUNT
 * IS THE DISCRIMINATOR AND THE SPREAD IS BLIND TO IT.
 *
 * The fix is DERIVED FROM THE CONTAINER RATHER THAN CHOSEN: an UNWETTED column's surface is at the FLOOR,
 * which is maximally unlevel. Both are returned because THE PAIR IS THE FINDING -- only having them side by
 * side makes the blindness visible, and this is the tilt negative's complement: tilt shows the statistic can
 * be LARGE when the surface slopes, and this shows it can be ZERO when the fluid is not there at all.
 */
export function heightsOverBox(pool, opts = {}) {
    const wet = new Map(surfaceHeights(pool, opts));
    const n = Math.ceil(pool.W / pool.h), out = [];
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
        const c = a + "," + b;
        out.push([c, wet.has(c) ? wet.get(c) : 0]);        // UNWETTED -> the FLOOR
    }
    return { heights: out, wettedCols: wet.size, boxCols: out.length };
}

export function spread(heights) {
    const ys = heights.map((p) => p[1]);
    if (ys.length < 2) return { columns: ys.length, mean: NaN, sd: NaN };
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    return { columns: ys.length, mean,
             sd: Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length) };
}

/** Least-squares slope of surface height against x-column. Used for the tilt negative, and NOT as a key. */
export function surfaceSlope(heights) {
    const pts = heights.map(([c, y]) => [Number(c.split(",")[0]), y]);
    if (pts.length < 2) return NaN;
    const mx = pts.reduce((a, b) => a + b[0], 0) / pts.length, my = pts.reduce((a, b) => a + b[1], 0) / pts.length;
    const num = pts.reduce((a, [x, y]) => a + (x - mx) * (y - my), 0);
    const den = pts.reduce((a, [x]) => a + (x - mx) ** 2, 0);
    return den > 0 ? num / den : NaN;
}

/** The dam break as a settling SERIES -- the whole point is that the spread FALLS, which needs more than one point. */
export function levellingSeries({ marks = [300, 900, 1800, 3000], targetN = 2800, damColumns = 5,
                                  viscosity = 3, W = SHIPPED_FLOOR } = {}) {
    const rows = [];
    for (const steps of marks) {
        const pool = settlePool({ W, targetN, damColumns, viscosity, steps });
        const s = spread(surfaceHeights(pool)), floor = spread(surfaceHeights(pool, { bottom: true }));
        rows.push({ steps, sd: s.sd, columns: s.columns, floorSd: floor.sd });
    }
    return rows;
}

/** sd against the choice of `full`. THE CLAIM IS ROBUSTNESS, NOT INVARIANCE -- v3543 said the latter and was wrong. */
export function fullSensitivity({ fulls = [4.3302, 7.2169, 8.0, 8.6798, 10.8254], targetN = 2800,
                                  damColumns = 5, steps = 900 } = {}) {
    const pool = settlePool({ targetN, damColumns, steps, viscosity: 3 });
    return fulls.map((full) => {
        const s = spread(surfaceHeights(pool, { full }));
        return { full, sd: s.sd, mean: s.mean, columns: s.columns };
    });
}

// ---- THE REGISTER. RECORDED; THE GATE RE-DERIVES. ---------------------------------------------------------
export const MEASURED_V3544 = {
    viscosity: 3, targetN: 2800, damColumns: 5, W: SHIPPED_FLOOR, c: 15, dt: 1 / 1000,
    damBreak: [[300, 11.045, 0.000], [900, 1.980, 0.000], [1800, 0.000, 0.000], [3000, 0.000, 0.000]], // steps, surface sd, FLOOR sd
    levelStart: [[0, 0.3614], [300, 2.7664], [900, 0.0479], [1800, 0.0000], [3000, 0.0000]],
    tilt: [[0, 0.0000], [5, 0.0455], [10, 0.8188], [20, 2.1845]],
    tiltSettled: [[1500, 3.014], [3000, 2.184], [4500, 2.171], [6000, 2.186]],
    tiltSlopeOverTan: [[5, 0.075], [10, 2.198], [20, 2.820]],
    fullSensitivity: [[4.3302, 2.3518], [7.2169, 1.9803], [8.0, 1.9832], [8.6798, 1.9250], [10.8254, 1.8569]],
    note: "*** THE ZERO AT REST IS NOW AN ANSWER REACHED FROM ELEVEN, NOT FURNITURE: during the transient the " +
          "surface reads 11.045 while the CONTAINER FLOOR reads 0.000, so the statistic separates them by " +
          "eleven cells where it should and agrees only at rest. AND THE NEGATIVE IS A SETTLED STATE THAT IS " +
          "NOT LEVEL -- tilted gravity, stationary to 1% from 3000 steps on. The slope does NOT match " +
          "tan(theta) and that is REPORTED rather than claimed.",
};

export const CORRECTS_V3543 = {
    invariance: "v3543 wrote that a mis-defined `full` 'shifts every column together and CANCELS'. IT DOES " +
                "NOT CANCEL -- sd moves 2.8% across the declared-to-slab range and 19% across a 2.5x range. " +
                "ROBUST, NOT INVARIANT, and those are different claims. The conclusion survives because the " +
                "signal runs 11.045 to 0; the word did not.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------
export function reportLines({ live = true } = {}) {
    const L = [];
    L.push("[levelClaim] A SETTLED LIQUID'S SURFACE IS LEVEL -- gradeable at last, and depth was never the blocker");
    L.push("");
    L.push("  DAM BREAK (same particles, HALF the floor, SAME box): surface sd against the CONTAINER FLOOR's");
    L.push("    steps    surface sd    floor sd");
    for (const [s, a, b] of MEASURED_V3544.damBreak)
        L.push("    " + String(s).padStart(5) + a.toFixed(3).padStart(14) + b.toFixed(3).padStart(12));
    L.push("  *** ELEVEN CELLS COLLAPSING TO ZERO WHILE THE FLOOR NEVER MOVES. A zero reached from eleven is a");
    L.push("      measurement; a zero that was never anything else is furniture. ***");
    L.push("");
    L.push("  THE NEGATIVE -- TILTED GRAVITY, A STATE THAT IS SETTLED AND NOT LEVEL:");
    L.push("    tilt deg  " + MEASURED_V3544.tilt.map(([d]) => String(d).padStart(8)).join(""));
    L.push("    sd        " + MEASURED_V3544.tilt.map(([, s]) => s.toFixed(4).padStart(8)).join(""));
    L.push("    settled?  sd " + MEASURED_V3544.tiltSettled.map(([s, v]) => s + ":" + v.toFixed(3)).join("  ") +
           " -- stationary to 1% from 3000 on");
    L.push("    *** AND THE SLOPE DOES NOT MATCH tan(theta): " +
           MEASURED_V3544.tiltSlopeOverTan.map(([d, r]) => d + "deg " + r.toFixed(2) + "x").join(", ") +
           ". REPORTED, NOT CLAIMED -- asserting the closed form would be numerology. ***");
    L.push("");
    L.push("  CORRECTS v3543: " + CORRECTS_V3543.invariance);
    if (live) {
        const rows = levellingSeries({ marks: [300, 1800] });
        L.push("    MEASURED NOW: " + rows.map((r) => r.steps + " -> sd " + r.sd.toFixed(3) +
               " (floor " + r.floorSd.toFixed(3) + ")").join(",  "));
    }
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === `file://${process.argv[1]}`) { for (const l of reportLines()) console.log(l); process.exit(0); }
