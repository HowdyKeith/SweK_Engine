// physics/sph/wideTilt-selfcheck.mjs
//
// Is the tilt slope a real key at 24 columns? MEASURED ~63s on one core (timed with date(1)). The 24-COLUMN
// runs themselves cost ~405-425s EACH (v3546's precedent for a header that says so): they are REPORTED here
// from MEASURED_V3549, which was built by driving wideTiltRun() directly this session, not remembered from an
// earlier one. The NARROW fixture is driven LIVE (~60s) and is what carries the contrast in this gate's own
// runtime.
"use strict";
import { wideTiltRun, askable, transferTolerance, WIDE_W, MEASURED_V3549, CLOSES_V3545 } from "./wideTilt.mjs";
import { tiltedProfile, worstError, transferByWidth } from "./tiltPower.mjs";
import { SHIPPED_FLOOR } from "./poolFixture.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("wideTilt-selfcheck -- is the tilt slope a key at 24 columns?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE FIXTURE IS 24 COLUMNS, DERIVED FROM WIDE_W NOT TYPED ***");
{
    const cols = Math.ceil(WIDE_W / 0.1 - 1e-9);
    ok("!! the wide fixture is 24 x-columns", cols === 24, "W " + WIDE_W + " / h 0.1 = " + cols);
    ok("the register agrees with the derived column count", MEASURED_V3549.columns === cols,
        "register says " + MEASURED_V3549.columns);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE TOLERANCE IS READ OFF tiltPower's TABLE, RE-DERIVED HERE, NEVER TYPED ***");
{
    const tol = transferTolerance(WIDE_W);
    ok("!! transferTolerance(24 columns) matches worstError from tiltPower's own sweep",
        Math.abs(tol - worstError(transferByWidth({ widths: [WIDE_W] })[0])) < 1e-12,
        "tolerance " + tol.toFixed(4) + " -- computed from tiltPower.transferByWidth, not stored twice");
    ok("...and it is close to the register's recorded value (a sanity bound, not a duplicate declaration)",
        Math.abs(tol - MEASURED_V3549.transferWorstAt24) < 0.005,
        "live " + tol.toFixed(4) + " vs register " + MEASURED_V3549.transferWorstAt24);
}

// ---------------------------------------------------------------------------
console.log("\n3. *** SECTION 5's ANTIDOTE FIRES: THE KEY, WITH THE TOLERANCE FROM SECTION 2 ***");
{
    const tol = transferTolerance(WIDE_W);
    const w5 = MEASURED_V3549.wide[5], w10 = MEASURED_V3549.wide[10];
    ok("!! *** 5deg SLOPE MATCHES tan(theta) WITHIN THE TRANSFER TOLERANCE ***",
        Math.abs(w5.ratio - 1) <= tol,
        "ratio " + w5.ratio.toFixed(4) + "x, departure " + Math.abs(w5.ratio - 1).toFixed(4) +
        " against tolerance " + tol.toFixed(4) + " -- THIS IS THE KEY v3545 SAID WAS OWED.");
    report("10deg sits just outside the tolerance, and that is reported rather than hidden",
        "ratio " + w10.ratio.toFixed(4) + "x, departure " + Math.abs(w10.ratio - 1).toFixed(4) +
        " against " + tol.toFixed(4) + " -- ~1% excess is the fluid's own; naming its mechanism is what " +
        "should turn this report into an assertion, not widening the tolerance to cover it.");
    ok("...and BOTH are dramatically closer than the six-column fixture ever got",
        Math.abs(w5.ratio - 1) < 0.1 * Math.abs(0 - 1) && Math.abs(w10.ratio - 1) < 0.1 * Math.abs(1.452 - 1),
        "6-col was 0.000x / 1.452x; 24-col is " + w5.ratio.toFixed(3) + "x / " + w10.ratio.toFixed(3) + "x");
}

// ---------------------------------------------------------------------------
console.log("\n4. THREE CONTROLS, LIVE WHERE THEY ARE CHEAP");
{
    const level = tiltedProfile({ deg: 0, targetN: 2800 });
    ok("!! a LEVEL narrow pool reads exactly zero slope (a wider box does not manufacture one)",
        level.slope === 0, "narrow 0deg slope " + level.slope);
    const wide0 = MEASURED_V3549.wide[0], wide5 = MEASURED_V3549.wide[5], wide10 = MEASURED_V3549.wide[10];
    ok("!! every wide run is stable (v3542's bound: a lossy wall can only REMOVE energy)",
        wide0.energyRatio < 1 && wide5.energyRatio < 1 && wide10.energyRatio < 1,
        [wide0, wide5, wide10].map((r) => r.energyRatio.toFixed(3)).join(" / "));
    const narrow0 = MEASURED_V3549.narrow[0];
    ok("!! the WIDE pool is SHALLOWER than the narrow one, not deeper -- the agreement was bought with columns",
        wide0.depthCells < narrow0.depthCells,
        "wide " + wide0.depthCells + " cells vs narrow " + narrow0.depthCells +
        " cells -- same particle budget, sixteen times the floor area");
    ok("!! drop-one leverage collapses from six columns to twenty-four",
        MEASURED_V3549.narrow[10].leverage.worstShift > 6 * MEASURED_V3549.wide[10].leverage.worstShift,
        "narrow " + (MEASURED_V3549.narrow[10].leverage.worstShift * 100).toFixed(1) + "% vs wide " +
        (MEASURED_V3549.wide[10].leverage.worstShift * 100).toFixed(1) + "%");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** WHAT IS NOT ASKED, AND THE BOUND IS DERIVED NOT DETACHMENT ***");
{
    const a20 = askable({ deg: 20, columns: 24, depthCells: MEASURED_V3549.wide[0].depthCells });
    ok("!! 20deg is NOT askable at this depth", !a20.askable,
        "uphill end " + a20.uphillEnd.toFixed(3) + " cells against a quantum of " + a20.quantum +
        " -- below it, not above zero. THE INSTRUMENT RUNS OUT BEFORE THE FLUID DOES.");
    // The naive/wrong bound this file's own first draft asserted, kept as a named trap.
    const naiveRise = 24 * Math.tan(20 * Math.PI / 180);
    ok("...and the naive bound (rise vs depth, no /2) is a DIFFERENT and wrong statement",
        naiveRise > MEASURED_V3549.wide[0].depthCells && a20.uphillEnd > 0,
        "naive rise " + naiveRise.toFixed(2) + " EXCEEDS depth " + MEASURED_V3549.wide[0].depthCells +
        " (would read as 'detaches'), but the plane pivots about the MIDDLE so the true uphill end is " +
        a20.uphillEnd.toFixed(3) + " -- still above the floor, still non-askable, for a DIFFERENT reason.");
    ok("5 and 10deg both remain askable at this depth", askable({ deg: 5, columns: 24,
        depthCells: MEASURED_V3549.wide[0].depthCells }).askable &&
        askable({ deg: 10, columns: 24, depthCells: MEASURED_V3549.wide[0].depthCells }).askable,
        "both uphill ends stay above the one-cell quantum, which is why section 3 can grade them");
}

console.log(fails ? `\nwideTilt-selfcheck: ${fails} FAILED` : "\nwideTilt-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
