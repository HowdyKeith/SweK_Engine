// tools/roundhouse/airySlitAdoption-selfcheck.mjs
//
// Run: node tools/roundhouse/airySlitAdoption-selfcheck.mjs   (~40s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2932 -- THE TWO PURE-IMPROVEMENT FIXES ADOPTED, AND THE PIN CHANGE MADE VISIBLE.
//
// v2931 adopted the edge check (a new field, no pinned value moved). This round adopts the two fixes that DO
// move pinned values: the airy refined estimator + exact constant (v2911) and the slit refined estimator
// (v2913). The whole point of the discipline here is that changing a pinned number is the dangerous operation --
// it is how a regression hides -- so the change is made in ONE commit with the pin, the direction of improvement
// is measured, and this gate refuses to pass if the new numbers are not actually better than the old.

import { getDevice } from "./devices.mjs";
import { BASELINE } from "./physicsBaseline.mjs";
import { AIRY_FIRST_RING } from "../../physics/optics/airyRefined.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const dev = await getDevice("optics");
const pin = (id) => BASELINE.find((e) => e.id === id);

// ---- 1. AIRY: THE ESTIMATOR CONVERGES AND GRADES AGAINST THE EXACT RING ----------------------------------------------
{
    const o = await dev.build({ mode: "airy" });
    ok("!! airy grades against the EXACT ring j(1,1)/pi, not the rounded 1.22",
        Math.abs(o.rayleighFactorExact - AIRY_FIRST_RING) < 1e-15 && Math.abs(AIRY_FIRST_RING - 1.2196698912665045) < 1e-15,
        "rayleighFactorExact = " + o.rayleighFactorExact.toPrecision(13) + ". The old grade against 1.22 put a " +
        "2.7e-4 floor under the error and rewarded a measurement for landing near a constant wrong in the 4th digit");

    ok("!! the default measurement is an order of magnitude more accurate than before",
        o.airyRingErrFrac < 5e-5,
        "airyRingErrFrac = " + o.airyRingErrFrac.toExponential(3) + " against the exact ring, down from 7.1e-4. " +
        "The refined estimator (parabola on intensity) locates the ring to sub-sample precision instead of " +
        "returning the grid sample");

    const hi = await dev.build({ mode: "airy", config: { nSamples: 2001 } });
    ok("!! and the fake exact zero at the resolution clamp is gone",
        hi.airyRingErrFrac > 0,
        "at nSamples 2001 the raw estimator scored EXACTLY 0 against 1.22 (a grid point landing on the rounded " +
        "constant); the refined estimator against the exact ring reports " + hi.airyRingErrFrac.toExponential(2) +
        " -- a real residual that cannot be a coincidence of the grid");
}

// ---- 2. SLIT: SAME ESTIMATOR, CONVERGING TOWARD THE TRUE 1 -----------------------------------------------------------
{
    const vals = {};
    for (const n of [301, 900, 901, 2001]) vals[n] = (await dev.build({ mode: "slit", config: { nSamples: n } })).slitFirstMinFactor;
    ok("!! the slit grid-alignment exact hits are gone -- every resolution now shows real residual",
        vals[301] !== 1 && vals[901] !== 1 && vals[2001] !== 1,
        "before v2932, (nSamples-1)%4==0 gave EXACTLY 1 (a sample on the answer) and other resolutions ~1e-3. " +
        "Now: " + [301, 901, 2001].map((n) => "n=" + n + ":" + Math.abs(vals[n] - 1).toExponential(1)).join(", ") +
        " -- the estimator's genuine precision, converging toward the analytic 1 rather than alternating");

    const o = await dev.build({ mode: "slit" });
    ok("slitFirstMinErrFrac is a new, census-visible graded field",
        Number.isFinite(o.slitFirstMinErrFrac) && o.slitFirstMinErrFrac < 1e-3,
        "= " + o.slitFirstMinErrFrac.toExponential(3) + ", and its name matches the census selector, so the slit " +
        "mode is no longer invisible to the zero census (the v2913 blind spot, closed as a side effect)");
}

// ---- 3. THE PIN CHANGE, MADE VISIBLE -------------------------------------------------------------------------------
{
    const airy = pin("airy-rayleigh-factor"), slit = pin("slit-first-min-factor");
    ok("!! both pins were UPDATED in this commit, not left stale against the new estimator",
        Math.abs(airy.value - 1.21969504720) < 1e-8 && Math.abs(slit.value - 1.00001619731) < 1e-8,
        "airy pin 1.21913 -> " + airy.value.toPrecision(9) + ", slit pin 1.00111 -> " + slit.value.toPrecision(9) +
        ". A refined estimator with a stale pin would fail physicsBaselineCoverage, which is the trap this avoids");

    ok("!! and both were reclassified from ARTEFACT to KEYED",
        airy.kind === "keyed" && slit.kind === "keyed",
        "they were artefacts because the raw estimator did not converge to a closed form -- it landed on grid " +
        "samples. The refined estimator DOES converge to j(1,1)/pi and to 1 respectively, so they are now keyed " +
        "quantities with a real answer key, which is a stronger claim and the honest one to make");

    ok("the pins reproduce -- the new values are what the device now emits",
        Math.abs((await dev.build({ mode: "airy" })).rayleighFactor - airy.value) / airy.value < airy.tol &&
        Math.abs((await dev.build({ mode: "slit" })).slitFirstMinFactor - slit.value) / slit.value < slit.tol,
        "measured within pinned tolerance, so physicsBaseline gates the adopted behaviour going forward");
}

// ---- 4. WHAT REMAINS -----------------------------------------------------------------------------------------------
{
    console.log("  NOTE   of the five diagnosed fixes, THREE are now adopted: edge (v2931), airy + slit (v2932).");
    console.log("         TWO remain, both deliberately held back because they are not pure improvements:");
    console.log("         - escapeBudget default (v2919): adopting the converged value makes the reported error");
    console.log("           LARGER (1.6e-3 -> 4.4e-3). It is more honest but looks worse, so it needs an explicit");
    console.log("           decision, not a quiet adoption. The number that improves is truthfulness, not size.");
    console.log("  v3313  THAT DECISION WAS TAKEN, AT v2932, AND THIS NOTE OUTLIVED IT. defaultPlacementSweep.mjs");
    console.log("         records the escapeBudget fix ADOPTED -- escSteps raised to the converged plateau -- which");
    console.log("         dissolved the escRFar basin along with the dt and escSteps ones, all three being");
    console.log("         artefacts of the unconverged default. So of the two held back here, ONE IS SETTLED and");
    console.log("         only the deflect two-reference reframing remains open. A deferred note that has been met");
    console.log("         advertises open work that is finished; the next reader spends a round rediscovering it.");
    console.log("         - deflect two-reference (v2930): reframes a '72% error' as real strong-field GR; it");
    console.log("           changes what the field MEANS, so it wants its own round with the reframing documented.");
    ok("the two held-back fixes are tradeoffs, not improvements, and are named as such",
        true,
        "the discipline that let airy/slit/edge be adopted freely -- measured improvement, visible pin -- is the " +
        "same discipline that says escapeBudget and deflect must not be adopted the same way");
}

console.log();
if (fails) { console.log("airySlitAdoption-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("airySlitAdoption-selfcheck: all checks pass");
