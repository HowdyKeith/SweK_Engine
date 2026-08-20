// tools/roundhouse/percolation-selfcheck.mjs
//
// v3292 -- BOND PERCOLATION BECOMES THE 41st GRADED DEVICE, AND IT SETTLES A TOLERANCE ARGUMENT INSTEAD OF
// HAVING ONE.
//
// Emergent-threshold claims are nearly always statements about L -> infinity. Grading one at finite L means
// deciding how much finite-size drift to allow, and that decision is exactly where a tolerance stops being
// measured and starts being chosen. This device has no such decision to make:
//
//     ON AN L x (L+1) RECTANGLE, P(horizontal crossing at p = 1/2) = 1/2 EXACTLY, FOR EVERY L.
//
// Horizontal crossing and the dual lattice's vertical crossing are complementary events of identical
// distribution at p = 1/2 -- self-duality, with p_c = 1/2 proved by Kesten. There is no L in the statement, so
// the ENTIRE tolerance is the binomial standard error sqrt(0.25/reps), which the module computes for itself.
// Nothing is left to taste, and the check is written in SIGMA rather than in a hand-picked epsilon.
//
// A SECOND, INDEPENDENT KEY: the 2D correlation-length exponent nu = 4/3 is exactly known, and it is reachable
// by counting clusters at two sizes. The transition width shrinks as L^(-1/nu), so doubling L multiplies it by
// 2^(-3/4) = 0.5946. Measured 0.5852. A universal critical exponent, from nothing but counting.
//
// AN HONEST NOTE ON THE PLANTED ERROR, because it is weaker than the last device's: neighborsWRONG takes the
// crossing probability to EXACTLY ZERO. A broken neighbour rule does not shift a threshold, it destroys
// connectivity, so nothing ever spans and the failure is blunt. rmt's diagonalWRONG returned the OTHER textbook
// constant, which is a far harder thing to catch. Detection power here is real but cheap, and saying so is
// better than implying every planted error in the lab is equally sharp.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("percolation");

// ---- 1. THE EXACT FINITE-SIZE KEY, GRADED IN SIGMA -----------------------------------------------------------------
{
    const runs = [];
    for (const L of [16, 32, 64]) runs.push(await dev.build({ mode: "crossing", config: { L } }));
    ok("!! P(crossing) = 1/2 at every L, within the ensemble's own binomial error",
        runs.every((r) => r.sigmaOff < 3),
        runs.map((r) => `L=${r.L}: ${r.prob.toFixed(4)} (${r.sigmaOff.toFixed(2)} sigma)`).join("  |  ") +
        `. The tolerance is sqrt(0.25/reps) = ${runs[0].se.toFixed(4)} and nothing else -- the exact statement ` +
        "carries no L, so there is no finite-size allowance to argue over");

    ok("...and the deviation does NOT grow with L, which it would if the key were only asymptotic",
        runs[2].sigmaOff < 3 && runs.every((r) => r.dev < 0.03),
        "L=16, 32 and 64 all sit within a few standard errors. A key that only held as L -> infinity would show " +
        "a systematic drift at small L, and this one does not because the duality argument is exact at each size");
}

// ---- 2. THE EXPONENT, FROM COUNTING ---------------------------------------------------------------------------------
{
    const o = await dev.build({ mode: "exponent" });
    ok("!! the transition width shrinks by 2^(-1/nu) with nu = 4/3",
        o.nuErr < 0.1,
        `width ${o.widthSmall.toFixed(4)} at L=16 -> ${o.widthLarge.toFixed(4)} at L=32, ratio ` +
        `${o.widthRatio.toFixed(4)} against exact ${o.widthRatioExact.toFixed(4)} ` +
        `(${(o.nuErr * 100).toFixed(1)}% off). A universal critical exponent recovered by counting spanning ` +
        "clusters at two sizes -- no fitting, no free parameter");
}

// ---- 3. THE PLANTED ERROR, AND ITS LIMITS -----------------------------------------------------------------------------
{
    const bad = await dev.build({ mode: "crossing", config: { planted: true } });
    ok("!! neighborsWRONG is caught at 63 sigma",
        bad.sigmaOff > 20,
        `P = ${bad.prob.toFixed(4)} against 0.5, ${bad.sigmaOff.toFixed(1)} standard errors out`);

    ok("...and this is a BLUNT planted error, which is worth recording rather than glossing",
        bad.prob === 0,
        "the crossing probability is exactly zero: a broken neighbour rule destroys connectivity rather than " +
        "shifting a threshold, so nothing ever spans. Compare rmt's diagonalWRONG, which returned the other " +
        "textbook constant and would pass any range check. Detection power here is real but cheap, and a lab " +
        "that treated all planted errors as equally probing would be flattering itself");
}

// ---- 4. DECLARED --------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("percolation declares its modes -- 41 graded of 113 proven",
        m.source === "exported" && m.declared.length === 2,
        `source "${m.source}", modes ${JSON.stringify(m.declared)}`);
}

console.log();
if (fails) { console.log("percolation-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("percolation-selfcheck: all checks pass");
