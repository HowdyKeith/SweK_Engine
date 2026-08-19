// tools/roundhouse/magmapFastPath-selfcheck.mjs
//
// Run: node tools/roundhouse/magmapFastPath-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2947 -- THE FIRST OPTIMISATION ROUND, AND THE RULE THAT MAKES IT SAFE.
//
// The magmap CPU reference is the ANSWER KEY every GPU is graded against. Optimising an answer key is the most
// dangerous kind of optimisation there is: a change that makes it 7x faster and one ulp different would silently
// re-grade every device that ever reported. So the rule for this round, and any that follow it, is absolute:
//
//     A SPEEDUP THAT CHANGES A SINGLE BIT IS NOT A SPEEDUP. IT IS A NEW ANSWER KEY, AND IT IS REJECTED.
//
// This was not theoretical. The first attempt at this optimisation reimplemented muPoint as its algebraically
// equivalent closed form (u^2+2)/(u*sqrt(u^2+4)) instead of the two-image sum the reference actually uses. Same
// mathematics, different rounding: it diverged by 6.0e-14 and was rejected on the spot. The surviving change
// removes ONLY the identity function -- in f64 mode the rounding hook `f` is (x) => x, called ~6 times per inner
// iteration, about 6 million dead calls per 441-cell map. Removing an identity cannot change a bit.
//
// MEASURED: 75.5ms -> 10.4ms for the full graded grid, a 7.3x speedup, maxAbsDiff EXACTLY 0 across all 441 cells.
// This matters on the phone too: magmap-android.html imports this same reference to grade its GPU, so the
// audition page got the same 7x.
//
// THE GATE'S TRICK: the fast path triggers only on (precision f64 AND not contractFma). So calling with
// { precision: "f64", contractFma: true } still routes through the ORIGINAL general path -- giving a built-in
// A/B of new against old, on the same inputs, in the same process. If they ever disagree by one bit, this fails.

import { cellMag, cellOffset, sampleTable, referenceCell } from "./magmapKernel.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const table = sampleTable(48, 48);
const N = 21, SPAN = 1, RHO = 0.1, NR = 48;

// ---- 1. BIT-IDENTICAL ON EVERY CELL OF THE GRADED GRID ---------------------------------------------------------------
{
    let allBits = true, worst = 0, checked = 0;
    for (let k = 0; k < N * N; k++) {
        const u0 = cellOffset(k, N, SPAN).u0;
        const fast = cellMag(u0, RHO, table, { precision: "f64", nR: NR });                    // new fast path
        const general = cellMag(u0, RHO, table, { precision: "f64", contractFma: true, nR: NR }); // original path
        checked++;
        if (!Object.is(fast, general)) { allBits = false; worst = Math.max(worst, Math.abs(fast - general)); }
    }
    ok("!! the f64 fast path is BIT-IDENTICAL to the general path on all 441 graded cells",
        allBits && worst === 0,
        "checked " + checked + " cells with Object.is, worst absolute difference " + worst + ". Not 'within " +
        "tolerance' -- identical. Removing an identity function cannot change a bit, and this proves the " +
        "implementation actually only removed the identity");
}

// ---- 2. IT HOLDS AWAY FROM THE GRADED GRID TOO -----------------------------------------------------------------------
{
    // the grid is one configuration; a fast path that agreed only there would be fitted to the test
    let allBits = true;
    for (const u0 of [0, 1e-9, 0.001, 0.37, 1.0, 2.5, 11.0]) {
        for (const rho of [0.01, 0.1, 0.5]) {
            const fast = cellMag(u0, rho, table, { precision: "f64", nR: NR });
            const general = cellMag(u0, rho, table, { precision: "f64", contractFma: true, nR: NR });
            if (!Object.is(fast, general)) allBits = false;
        }
    }
    ok("!! and on 21 configurations OFF the graded grid, including u0 = 0 and the tiny-u branch",
        allBits,
        "u0 from 0 to 11, rho from 0.01 to 0.5 -- including u0=0 where the u<1e-12 continue branch fires most. " +
        "An optimisation validated only on the grid it is graded against would be fitted to its own test");
}

// ---- 3. THE f32 PATH IS UNTOUCHED ------------------------------------------------------------------------------------
{
    const a = cellMag(0.3, RHO, table, { precision: "f32", nR: NR });
    ok("!! the f32 path still runs and still returns a finite f32-modelled value",
        Number.isFinite(a),
        "f32 = " + a + ". The fast path is gated on precision === 'f64', so the f32 model -- where every `f` call " +
        "is a REAL rounding step and load-bearing -- is not entered and not changed. That model is what predicts " +
        "what the shader computes; breaking it would break every GPU grade");

    // and f32 must still differ from f64: if the fast path had leaked into f32 they would collide
    const f64 = cellMag(0.3, RHO, table, { precision: "f64", nR: NR });
    ok("...and f32 still differs from f64, so the fast path did not leak across the precision boundary",
        a !== f64,
        "f32 " + a + " vs f64 " + f64 + " -- distinct, as they must be. If removing the identity had been applied " +
        "to the f32 path, these would have become equal and every f32 drift measurement would read zero");
}

// ---- 4. THE PUBLIC ENTRY POINT GOT THE SPEEDUP, NOT JUST THE INNER FUNCTION -------------------------------------------
{
    const cfg = { n: N, span: SPAN, rho: RHO, table, nR: NR };
    for (let i = 0; i < N * N; i++) referenceCell(i, cfg);          // warm
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N * N; i++) referenceCell(i, cfg);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    ok("referenceCell -- what the phone page and every gate actually call -- runs the fast path",
        ms < 40,
        "full 441-cell reference in " + ms.toFixed(1) + "ms (was ~75ms before this round, measured on the same " +
        "box). The threshold is deliberately loose because this gate runs on unknown hardware; it is checking " +
        "that the fast path is REACHED, not benchmarking the machine");
}

console.log();
if (fails) { console.log("magmapFastPath-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("magmapFastPath-selfcheck: all checks pass");
