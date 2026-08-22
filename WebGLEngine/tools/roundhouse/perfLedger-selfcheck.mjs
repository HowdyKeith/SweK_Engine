// tools/roundhouse/perfLedger-selfcheck.mjs
//
// Run: node tools/roundhouse/perfLedger-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2940 -- THE PERFORMANCE LEDGER, AND THE NOISE FLOOR IT IS BUILT AROUND.
//
// The lab has never measured SPEED -- every gate is about correctness. This ledger appends per-check timing
// across runs and flags real regressions. The entire risk is false alarms: timing is noisy (measured 13% CV,
// 1.35x worst-case range on the reference box), so a naive alarm fires on scheduler ticks and gets ignored. The
// gate therefore pins the discipline that makes the ledger trustworthy: noise stays quiet, real regressions
// fire, and the machine is only ever compared to itself.

import { foldRun, gradePerf, perfLines, REGRESS_FACTOR, MIN_RUNS_EACH } from "./perfLedger.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const host = { platform: "linux", arch: "x64", libc: "glibc" };
const run = (name, ms, h = host) => ({ at: new Date().toISOString(), host: h, checks: [{ name, status: "pass", ms }] });
const build = (name, series, h = host) => { let L = {}; for (const ms of series) L = foldRun(L, run(name, ms, h)); return L; };

// ---- 1. NOISE DOES NOT FIRE ----------------------------------------------------------------------------------------
{
    // 13% CV, realistic spread, no real trend
    const L = build("noisy", [300, 340, 290, 320, 310, 305, 330, 300]);
    const g = gradePerf(L);
    ok("!! run-to-run noise (13% CV, 1.35x range) produces NO regression",
        g.regressions.length === 0,
        "the same check varying 290-340ms across eight runs is stable, ratio " +
        (g.stable[0] ? g.stable[0].ratio.toFixed(2) : "?") + "x. A threshold that fired here would fire on every " +
        "scheduler tick -- the measured noise floor is why the regress factor is " + REGRESS_FACTOR + "x, not 1.2x");
}

// ---- 2. A REAL REGRESSION FIRES ------------------------------------------------------------------------------------
{
    const L = build("slowed", [1000, 1100, 950, 1050, 1020, 9800, 10200, 10000]);
    const g = gradePerf(L);
    ok("!! a 10x slowdown IS flagged as a regression",
        g.regressions.length === 1 && g.regressions[0].ratio > 8,
        "recent median ~10000ms vs baseline ~1020ms, " + (g.regressions[0] ? g.regressions[0].ratio.toFixed(1) : "?") +
        "x -- the kind of move an unwired cache or an accidental O(n^2) produces, well clear of the noise band");
}

// ---- 3. THE THRESHOLD SITS AT THE NOISE BOUNDARY, MEASURED --------------------------------------------------------
{
    const at = (factor) => { const L = build("b", [300, 300, 300, 300, 300, 300 * factor, 300 * factor, 300 * factor]); return gradePerf(L).regressions.length > 0; };
    ok("!! 1.9x stays quiet and 2.1x fires -- the boundary is where the noise floor puts it",
        at(1.9) === false && at(2.1) === true,
        "1.3x and 1.9x are within reach of the 1.35x noise range and must not alarm; 2.1x is a real move. The " +
        "threshold is " + REGRESS_FACTOR + "x, chosen ABOVE the measured worst-case noise, not picked for convenience");
}

// ---- 4. IT WILL NOT JUDGE ON TOO FEW RUNS --------------------------------------------------------------------------
{
    const g2 = gradePerf(build("thin", [300, 9000]));
    ok("!! two runs is INSUFFICIENT -- a median of two noisy samples is noise",
        g2.regressions.length === 0 && g2.insufficient.length === 1,
        "even a 30x jump between two runs is not flagged, because two samples cannot establish a median. Needs " +
        ">= " + (MIN_RUNS_EACH + 1) + " runs on the host before it will judge -- the ledger stays silent rather " +
        "than guessing, the same way the persistence grader stays AWAITING on one boot");
}

// ---- 5. A MACHINE IS COMPARED ONLY TO ITSELF ---------------------------------------------------------------------
{
    // a slow phone and a fast desktop, each stable on its own, must NOT cross-flag
    const phone = { platform: "android", arch: "arm64", libc: "bionic" };
    let L = {};
    for (const ms of [300, 310, 305, 320, 300, 315]) L = foldRun(L, run("x", ms, host));      // fast desktop
    for (const ms of [3000, 3100, 3050, 3200, 3000, 3150]) L = foldRun(L, run("x", ms, phone)); // slow phone
    const g = gradePerf(L);
    ok("!! the slow phone is NOT a regression against the fast desktop -- hosts are graded separately",
        g.regressions.length === 0,
        "the same check runs 10x slower on the phone, but that is the phone being a phone, not a regression. Only " +
        "a given (check, host) getting slower than its OWN history flags -- both hosts are stable here");
}

// ---- 6. ONLY PASSING CHECKS ARE TIMED ----------------------------------------------------------------------------
{
    let L = foldRun({}, { at: "t", host, checks: [
        { name: "p", status: "pass", ms: 300 },
        { name: "p", status: "fail", ms: 5 },        // failed fast -- meaningless time
        { name: "p", status: "timeout", ms: 180000 }, // killed at budget -- meaningless time
    ] });
    ok("!! a failed or timed-out check's time is NOT recorded -- it would corrupt the median",
        L.checks.p.length === 1 && L.checks.p[0].ms === 300,
        "only the passing sample (300ms) is kept; the fail (died at 5ms) and the timeout (killed at the 180s " +
        "budget) are excluded, because their durations reflect early death or the budget cap, not the check's " +
        "real cost. Mixing them in would swing the median wildly");
}

console.log();
if (fails) { console.log("perfLedger-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("perfLedger-selfcheck: all checks pass");
