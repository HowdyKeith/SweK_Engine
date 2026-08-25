// tools/roundhouse/inference-selfcheck.mjs
//
// v3289 -- BAYESIAN PARAMETER RECOVERY BECOMES THE 38th GRADED DEVICE, AND THE PROMOTION RECIPE RUNS OUT.
//
// The last three devices were all found the same way: sweep the ungraded physics for a module carrying BOTH a
// closed-form key and an exported named-wrong variant, and wire whatever comes back. Sweeping again after this
// one returns nothing. That is worth stating plainly, because the obvious next move -- keep promoting -- now
// requires BUILDING a key rather than finding one, which is a different and much larger job than four rounds of
// wiring have been.
//
// WHAT THIS DEVICE ADDS THAT THE OTHERS DO NOT: a key that grades the UNCERTAINTY rather than the estimate.
//
//     EXACT        conjugacy gives the posterior in closed form, so the chain's moments are graded against
//                  algebra. Measured: max |chain mean - exact| = 0.0065, sigma error 0.0007.
//
//     CALIBRATION  90% credible intervals must contain the truth about 90% of the time across repeated
//                  datasets. This catches a failure the moments cannot see -- UNDERSTATING THE NOISE gives
//                  tight, plausible, confident posteriors that are wrong more often than they claim.
//
// THE CALIBRATION NUMBERS ARE THE POINT:
//     true sigma = 0.5    coverage 83.3%   mean interval width 0.052
//     sigma = 0.15        coverage 36.7%   mean interval width 0.016
// Coverage halves AND the intervals get NARROWER. A device grading only the estimate would pass that happily,
// which is why "did it converge" and "is it honest about what it does not know" are two different questions.
//
// A DEFECT FOUND WHILE WIRING THIS, reported rather than quietly worked around: the module's header states
// "sigmaWRONG is exported for exactly that measurement". sigmaWRONG appears ONLY IN TWO COMMENTS in that file.
// It is never defined, never exported, and importing it gives undefined -- so the documented route to the
// overconfidence test does not exist. The route that DOES work is an explicit sigmaLik, which is what this
// device uses.

import { getDevice } from "./devices.mjs";
import * as INF from "../../physics/hmc/inference.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("inference");

// ---- 1. THE EXACT KEY: conjugacy, not another simulation ---------------------------------------------------------
{
    const o = await dev.build({ mode: "posterior" });
    ok("!! the chain recovers the closed-form conjugate posterior",
        o.muErr < 0.05 && o.sigmaErr < 0.02,
        `max |mean - exact mu| = ${o.muErr.toFixed(5)}, sigma error ${o.sigmaErr.toFixed(5)} over ${o.samples} ` +
        "samples. The reference is algebra -- Sigma* = (X'X/s^2 + P0)^-1 -- so nothing here is graded against " +
        "another run of itself");

    ok("acceptance is high, which is a diagnostic and NOT the check",
        o.acceptRate > 0.8,
        `${(o.acceptRate * 100).toFixed(1)}%. A poorly tuned sampler with low acceptance still targets the right ` +
        "distribution; it just wastes work. Grading on acceptance would pass a correct-but-slow sampler and fail " +
        "a fast one, neither of which is the question");
}

// ---- 2. THE CALIBRATION KEY: grading the uncertainty, not the estimate ----------------------------------------------
{
    const o = await dev.build({ mode: "calibration" });
    ok("!! 90% credible intervals cover the truth at roughly the stated rate",
        o.coverage > 0.7 && o.coverage <= 1.0,
        `${(o.coverage * 100).toFixed(1)}% over ${o.repeats} independent datasets, mean width ` +
        `${o.meanWidth.toFixed(4)}. Nominal is 90%; with ${o.repeats} repeats the binomial standard error alone ` +
        `is ${(Math.sqrt(0.9 * 0.1 / o.repeats) * 100).toFixed(1)} points, so the bound is loose because the ` +
        "sample is small -- not because the measurement was allowed to set it");

    ok("!! understating the noise COLLAPSES coverage while NARROWING the intervals",
        o.coverageUnderstated < o.coverage * 0.6 && o.widthUnderstated < o.meanWidth,
        `coverage ${(o.coverage * 100).toFixed(1)}% -> ${(o.coverageUnderstated * 100).toFixed(1)}%, width ` +
        `${o.meanWidth.toFixed(4)} -> ${o.widthUnderstated.toFixed(4)}. Tighter and more confident and wrong more ` +
        "often. This is the failure the exact-moments key cannot see, because with an understated sigma the " +
        "sampler is still correctly targeting the posterior it was given -- the posterior is just the wrong one");
}

// ---- 3. THE DOCUMENTED EXPORT THAT DOES NOT EXIST ----------------------------------------------------------------------
{
    ok("!! sigmaWRONG is documented as exported and is NOT",
        INF.sigmaWRONG === undefined,
        "the module header reads 'sigmaWRONG is exported for exactly that measurement'; the identifier appears " +
        "only in two comments and is never defined. Anyone following the documentation gets undefined, which " +
        "passed silently into calibrationRun as a missing option and produced IDENTICAL numbers for the correct " +
        "and overconfident cases -- a null that looked like a physics result. Asserted here so the doc and the " +
        "code cannot disagree quietly");

    ok("...and the route that DOES work is the one this device uses",
        typeof INF.calibrationRun === "function",
        "an explicit sigmaLik. The capability was always there; only the advertised handle was missing");
}

// ---- 4. DECLARED, AND THE RECIPE IS NOTED AS SPENT -----------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    // *** v4000 -- THE FOURTH STALE COUNT PIN THIS ROUND, AND THE FAMILY IS THE FINDING. *** This pinned TWO
    // modes; the device declares three -- posterior, calibration, overconfident. Same shape as figureEight's
    // "four modes" (a fifth had been added, and it was that device's PLANT), fieldNav's "three" and
    // conservationReach's "the count is ONE". A NUMBER TYPED BESIDE A LIST IS A SECOND DECLARATION OF THAT
    // LIST, and it goes stale the first time somebody edits the real one.
    //
    // The "38 graded of 113" in the label was a second one in the same line, a progress figure true when
    // written and checked by nothing. It is gone rather than updated: this check is about whether the DEVICE
    // declares its modes, and a lab-wide statistic riding in its label could only ever rot.
    //
    // What v3192 actually cared about is `source`: a device whose modes are EXPORTED can be asked, while one
    // that must be PROBED is only ever known to a candidate list -- and the lab's apparent one-moded-ness
    // turned out to be that list rather than the devices. So that is the assertion, every declared mode must
    // run, a nonsense one must be refused, and the count is REPORTED.
    const { checkMode } = await import("./knobGate.mjs");
    const runs = m.declared.filter((x) => checkMode(dev, x).ok !== false);
    ok("!! inference's modes are EXPORTED rather than probed, and every one of them is accepted",
        m.source === "exported" && m.declared.length > 0 && runs.length === m.declared.length,
        `source "${m.source}", ${m.declared.length} modes ${JSON.stringify(m.declared)}` +
        (runs.length === m.declared.length ? "" : "  <- REFUSED ITS OWN: " +
         m.declared.filter((x) => !runs.includes(x)).join(", ")) +
        ". This module carries a ready-made closed form; the next promotion has to build a key rather than find one");
    ok("!! ...and a mode it never declared is refused", checkMode(dev, "zzz_no_mode").ok === false,
        "a mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not declare runs " +
        "something else and says nothing");
}

console.log();
if (fails) { console.log("inference-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("inference-selfcheck: all checks pass");
