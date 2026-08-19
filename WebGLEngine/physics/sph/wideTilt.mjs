// physics/sph/wideTilt.mjs
//
// v3549 -- THE TILT SLOPE IS A KEY AT LAST. A SETTLED SURFACE IS PERPENDICULAR TO GRAVITY.
//
// v3545 named the fixture owed: "a tilted pool settled in a box of AT LEAST 24 COLUMNS, where LEG 2 proves the
// transfer faithful". This builds it. W = 2.4 (24 x-columns at h = 0.1), N = 19044 -- SAME solver, SAME tilts,
// SAME viscosity, SAME settling time as the six-column fixture. Only the box is wider.
//
//     columns    5deg ratio    10deg ratio    worst drop-one
//        24         1.009x         0.964x       2.7% / 6.1%
//         6         0.000x         1.452x         -- / 38.1%
//
// A SETTLED SURFACE IS PERPENDICULAR TO GRAVITY. v3544 measured 0.075x / 2.20x / 2.82x at six columns and
// refused to claim the closed form -- correctly, because the departure was NEVER the fluid. v3545 explained it
// as the instrument (quantisation, sub-cell phase, one-column leverage); this fixture is the test of that
// diagnosis, and it holds: widening the box to where LEG 2 says the transfer is faithful is the whole fix.
//
// *** THE TOLERANCE IS READ OFF tiltPower's TRANSFER TABLE, NOT CHOSEN. *** worst |ratio-1| on a SYNTHETIC
// plane at 24 columns is 0.026 (transferByWidth/worstError, driven live below -- no number typed here that the
// gate does not also derive). Measured on the FLUID: 0.009 at 5deg (INSIDE), 0.036 at 10deg (slightly OUTSIDE).
// SO ~1% AT 10 DEGREES IS THE FLUID'S OWN AND IS REPORTED RATHER THAN EXPLAINED -- calling it zero would be
// v3544's overclaim from the other direction. When somebody explains that excess, THAT LINE GOES RED and
// should name the mechanism, not be widened until it passes. A tolerance from an INDEPENDENT measurement of
// the instrument is a key; one picked from the first passing run is a frozen outcome.
//
// THREE CONTROLS, ALL MEASURED THIS SESSION:
//   1. A LEVEL POOL (tiltDeg 0) reads EXACTLY 0.0000 at both widths -- a wider box does not manufacture a
//      slope, which is v3540's own shipped-and-caught defect from the other side.
//   2. EVERY RUN IS STABLE -- energy ratio 0.698 / 0.712 / 0.755 at 24 columns and 0.509 / 0.511 / 0.515 at
//      six, ALL below 1 (v3542's bound: a lossy wall can only remove energy).
//   3. THE WIDE POOL IS SHALLOWER, NOT DEEPER -- 5 cells against 9, because the same particle budget spreads
//      over sixteen times the floor. THE AGREEMENT WAS BOUGHT WITH COLUMNS, NOT DEPTH, and that is stated
//      rather than hidden. Drop-one leverage at 10deg falls from 38.1% (six columns) to 6.1% (twenty-four).
//
// *** WHAT IS NOT ASKED, AND WHY. *** 20 degrees is NOT askable at this depth. Naively: rise = columns *
// tan(20) = 8.74 cells against mean depth 5.0, so the rise "exceeds" the depth -- WRONG, because the plane
// pivots about the MIDDLE of the box, not the upstream wall. The uphill end sits at depthCells - rise/2 =
// 5.0 - 4.37 = 0.63 cells, ABOVE the floor. A first draft of this file asserted 20deg detaches, and the
// arithmetic disagreed with the prose -- THIRD TIME IN THIS ARC A CHECK HAS CAUGHT ITS OWN AUTHOR (v3545's
// jackknife bug, v3546's OR-bug, now this). The real bound is the statistic's OWN ONE-CELL QUANTUM, the
// quantity this whole arc rests on: 0.63 cells is below it, so those columns are UNRESOLVED OR DROPPED. THE
// INSTRUMENT RUNS OUT BEFORE THE FLUID DOES -- sharper than "detaches", and it is what askable() asserts.
"use strict";
import { settlePool } from "./poolFixture.mjs";
import { surfaceHeights, surfaceSlope } from "./levelClaim.mjs";
import { columnLeverage, xProfile, transferByWidth, worstError, tiltedProfile } from "./tiltPower.mjs";

export const WIDE_W = 2.4;
export const WIDE_TARGET_N = 19044;

/** Settle the WIDE fixture at one tilt and hand back its profile, slope and stability -- the live, expensive leg. */
export function wideTiltRun({ deg = 0, W = WIDE_W, targetN = WIDE_TARGET_N, viscosity = 3, steps = 3000 } = {}) {
    const pool = settlePool({ W, targetN, viscosity, steps, tiltDeg: deg });
    const heights = surfaceHeights(pool);
    const profile = xProfile(heights);
    const slope = surfaceSlope(heights);
    const tan = Math.tan(deg * Math.PI / 180);
    const depthCells = profile.reduce((a, p) => a + p[1], 0) / profile.length + 1;   // +1: surfaceHeights indexes cells from 0
    return { deg, columns: profile.length, slope, tan, ratio: tan > 0 ? slope / tan : null,
             energyRatio: pool.energyRatio, profile, depthCells };
}

/**
 * *** THE REAL BOUND, AND IT IS NOT DETACHMENT. *** planePool's plane pivots about the box's MIDDLE (see its
 * own `(cx + 0.5 - n/2)` term), so the shallow end of a tilted surface is depthCells - rise/2, not
 * depthCells - rise. A tilt is askable only while that shallow end stays above the statistic's own quantum
 * (one cell): below it, columns are unresolved or dropped, and the instrument -- not the fluid -- has run out.
 */
export function askable({ deg, columns, depthCells, quantum = 1 } = {}) {
    const rise = columns * Math.tan(deg * Math.PI / 180);
    const uphillEnd = depthCells - rise / 2;
    return { deg, rise, uphillEnd, quantum, askable: uphillEnd > quantum };
}

/** The tolerance a key must clear, read off tiltPower's own synthetic-plane sweep -- never chosen. */
export function transferTolerance(W = WIDE_W) {
    const rows = transferByWidth({ widths: [W] });
    return worstError(rows[0]);
}

export const MEASURED_V3549 = {
    W: WIDE_W, h: 0.1, columns: 24, targetN: WIDE_TARGET_N, viscosity: 3, steps: 3000,
    wide: {
        0:  { ratio: null, energyRatio: 0.6979615333515208, depthCells: 5 },
        5:  { slope: 0.0882742312506181, tan: 0.08748866352592401, ratio: 1.0089790801806147,
              energyRatio: 0.7116986706014174, depthCells: 4.969190404221735,
              leverage: { worstShift: 0.027183132711571825 } },
        10: { slope: 0.1700085805755451, tan: 0.17632698070846498, ratio: 0.9641665721971014,
              energyRatio: 0.7546464599350398, depthCells: 4.962958750094924,
              leverage: { worstShift: 0.06147554776339645 } },
    },
    narrow: {
        0:  { ratio: null, energyRatio: 0.5091506123613617, depthCells: 9 },
        5:  { slope: 0, tan: 0.08748866352592401, ratio: 0,
              energyRatio: 0.5114677473230832, depthCells: 9 },
        10: { slope: 0.2560221829197316, tan: 0.17632698070846498, ratio: 1.4519739514115135,
              energyRatio: 0.5145246881416524, depthCells: 9.034640786593647,
              leverage: { worstShift: 0.38118230896697064 } },
    },
    transferWorstAt24: 0.0262,       // read off tiltPower.transferByWidth -- the gate re-derives this, never types it
    fluidExcessAt10: 0.036 - 0.0262, // what the tolerance does NOT cover -- reported, not explained
    note: "*** SAME SOLVER, SAME TILTS, SAME VISCOSITY, SAME SETTLING TIME -- ONLY THE BOX IS WIDER, AND THE " +
          "AGREEMENT WITH tan(theta) ARRIVES. 1.009x at 5deg and 0.964x at 24 columns against 0.000x and " +
          "1.452x at six -- v3545's diagnosis (quantisation, sub-cell phase, one-column leverage) CONFIRMED " +
          "by widening rather than by arguing harder. The tolerance is READ OFF the transfer table (0.026), " +
          "not chosen: 5deg lands inside it, 10deg lands slightly outside (0.036), so ~1% at 10deg is the " +
          "fluid's own excess and is reported rather than explained away. 20 DEGREES IS NOT ASKED: the plane " +
          "pivots about the box's MIDDLE so the uphill end sits at depth - rise/2 = 0.63 cells, BELOW the " +
          "statistic's own one-cell quantum -- THE INSTRUMENT RUNS OUT BEFORE THE FLUID DOES, not detachment, " +
          "and a first draft of this file asserted detachment before the arithmetic corrected it. ***",
};

export const CLOSES_V3545 = {
    line: "v3545 showed the six-column fixture cannot tell whether a settled surface is perpendicular to " +
          "gravity, and named what was owed: the same fixture at 24 columns, where LEG 2 proves the transfer " +
          "faithful.",
    verdict: "BUILT AND MEASURED. Slope tracks tan(theta) to within the transfer tolerance at 5 degrees and " +
             "just outside it at 10 -- a key, with the residual reported rather than folded into the " +
             "tolerance to make it pass.",
};

// ---- FRONT DOOR -------------------------------------------------------------------------------------------
export function reportLines() {
    const L = [];
    L.push("[wideTilt] IS THE TILT SLOPE A KEY AT 24 COLUMNS? YES, TO WITHIN A MEASURED TOLERANCE");
    L.push("");
    L.push("  columns   5deg ratio   10deg ratio   worst drop-one");
    L.push("     24        1.009x        0.964x       2.7% / 6.1%");
    L.push("      6        0.000x        1.452x         -- / 38.1%");
    L.push("");
    L.push("  TOLERANCE READ OFF tiltPower's TRANSFER TABLE, NOT CHOSEN: worst |ratio-1| " +
           MEASURED_V3549.transferWorstAt24.toFixed(4) + " on a synthetic plane at 24 columns.");
    L.push("    5deg  measured departure 0.009  -- INSIDE the tolerance");
    L.push("    10deg measured departure 0.036  -- slightly OUTSIDE; ~1% is the fluid's own and is reported");
    L.push("");
    L.push("  THREE CONTROLS: level pool reads exactly 0.0000 at both widths; every run stable (energy ratio " +
           "< 1); the wide pool is SHALLOWER not deeper (5 cells vs 9) -- the agreement was bought with " +
           "columns, not depth.");
    L.push("");
    L.push("  20 DEGREES NOT ASKED: the plane pivots about the box's MIDDLE, so the uphill end sits at " +
           "depth - rise/2 = 0.63 cells, below the statistic's own one-cell quantum. THE INSTRUMENT RUNS OUT " +
           "BEFORE THE FLUID DOES.");
    return L;
}

// A REPORTING TOOL MUST PRINT AND EXIT ZERO; the gate beside it is what exits nonzero.
if (import.meta.url === `file://${process.argv[1]}`) { for (const l of reportLines()) console.log(l); process.exit(0); }
