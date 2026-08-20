// tools/roundhouse/refinementKnobs-selfcheck.mjs
//
// Run: node tools/roundhouse/refinementKnobs-selfcheck.mjs   (~10s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2907 -- CRITERION 3. TWO CLEAN CONVERGENCES, ONE OBSERVABLE THAT NEVER HAD ANY, AND A PREDICTION OF MINE
// THAT FAILED.

import { REFINEMENT_KNOBS, refinementSweep, refinementLines, classifySequence, REFINEMENT_REGISTRATION } from "./refinementKnobs.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const rows = await refinementSweep();
console.log();
refinementLines(rows).forEach((l) => console.log(l));
console.log();
const by = (d) => rows.find((r) => r.device === d);
const fld = (d, f) => by(d).fields.find((x) => x.field === f);

// ---- 1. THE CLASSIFIER, WHICH NEEDED CALIBRATING BEFORE IT COULD BE TRUSTED ---------------------------------------
{
    ok("a knob echoed back under another name is not classified as physics",
        fld("quantum", "gridN").verdict === "ECHO" && fld("chaos", "cascadePoints").verdict === "ECHO",
        "quantum reports gridN for what it was given as N; chaos reports cascadePoints for count");
    ok("a synthetic converging sequence is recognised",
        classifySequence([1, 0.5, 0.25, 0.125]).verdict === "CONVERGING");
    ok("a synthetic drifting sequence is recognised",
        classifySequence([1, 2, 3.5, 5.5]).verdict === "DRIFTING",
        "differences 1, 1.5, 2 -- growing, so the quantity is a function of how hard you looked");
    ok("!! and a sequence whose whole variation is at the double floor is neither",
        classifySequence([1e-16, 3e-15, 8e-15, 2e-14]).verdict === "FLOOR-LIMITED",
        "the first run of this file had no such guard and reported two floor-limited quantities as DRIFTING -- " +
        "the same error v2905 caught in its amplification table, made again one round later");
}

// ---- 2. TWO GENUINE CONVERGENCES, WHICH IS WHAT LICENSES THE FAILURES ----------------------------------------------
{
    const lev = fld("quantum", "levelErrWorst"), r21 = fld("quantum", "ratio21"), r31 = fld("quantum", "ratio31");
    ok("!! quantum.well converges onto the infinite-well spectrum",
        lev.verdict === "CONVERGING" && Math.abs(r21.vals[3] - 4) < 1e-4 && Math.abs(r31.vals[3] - 9) < 1e-4,
        "levelErrWorst " + lev.vals.map((v) => v.toExponential(2)).join(" -> ") + " (a clean factor of 4 per " +
        "doubling, so second order), and the level ratios reach " + r21.vals[3].toFixed(6) + " and " +
        r31.vals[3].toFixed(6) + " against the exact 4 and 9 of an n^2 spectrum");

    // WHICH ENERGY ERROR TO ASSERT ON, AND WHY IT MATTERS. energyErrFinal gives ratios 4.08, 3.99, 5.71 -- the
    // last one badly off. energyErrFirstHalf gives 4.03, 4.01, 4.00. The difference is physics, not noise: a
    // symplectic integrator does not accumulate energy error, it oscillates within a bounded envelope whose
    // amplitude is O(h^2). A half-window measure tracks that envelope; the value sampled at the final instant is
    // one point of an oscillation, and where in its cycle the orbit stops is not a function of the order. So the
    // order check belongs on the envelope, and energyErrFinal drifting off it is the symplectic property showing
    // rather than a convergence failure.
    const e = fld("kepler", "energyErrFirstHalf");
    const ratios = e.vals.slice(1).map((v, i) => e.vals[i] / v);
    const fin = fld("kepler", "energyErrFinal");
    const finRatios = fin.vals.slice(1).map((v, i) => fin.vals[i] / v);
    ok("!! kepler's verlet integrator converges at exactly its advertised order",
        e.verdict === "CONVERGING" && ratios.every((r) => r > 3.8 && r < 4.2),
        "energy error envelope falls " + e.vals.map((v) => v.toExponential(2)).join(" -> ") + ", ratios " +
        ratios.map((r) => r.toFixed(2)).join(", ") + " -- second order, textbook, and it had never been checked");
    ok("...while the instantaneous final-step error does NOT, for a stated reason",
        finRatios.some((r) => r > 4.5),
        "energyErrFinal ratios " + finRatios.map((r) => r.toFixed(2)).join(", ") + " -- a symplectic integrator's " +
        "energy error is bounded and oscillatory, so the final sample is a point on a cycle, not the envelope. " +
        "Asserting the order on it would have been a check that passes or fails on where the orbit happened to stop");

    // These two matter procedurally: a convergence sweep that had only ever reported problems would be
    // indistinguishable from a broken sweep.
    ok("the sweep therefore demonstrably can see convergence when it is there",
        ["quantum", "kepler", "optics"].every((d) => by(d).fields.some((f) => f.verdict === "CONVERGING")));
}

// ---- 3. THE FINDING: AN OBSERVABLE WITH NO DISCRETISATION IN IT ----------------------------------------------------
{
    const err = fld("splat", "integralErrFrac");
    ok("!! splat's graded integral error is floor-limited across the whole sweep",
        err.verdict === "FLOOR-LIMITED",
        "values " + err.vals.map((v) => v.toExponential(2)).join(" -> ") + " -- it GROWS with resolution");

    // Chased below the sweep's range, which is where it becomes a finding rather than a curiosity.
    const dev = await getDevice("splat");
    const coarse = [];
    for (const g of [4, 8, 16, 32, 64]) coarse.push((await dev.build({ mode: "integral", config: { gridN: g } })).integralErrFrac);
    const pinnedBelow32 = coarse.slice(0, 4).every((v) => Object.is(v, coarse[0]));

    ok("!! and the reason is that the quadrature converges BEFORE the coarsest grid the device allows",
        pinnedBelow32 && coarse[0] < 1e-14,
        "gridN 4, 8, 16 and 32 all return " + coarse[0].toExponential(3) + " identically -- splatDefaults clamps " +
        "gridN to [32, 1024], so those all ARE 32. At n=32 the cell is 0.5 sigma, and the midpoint rule on a " +
        "Gaussian converges EXPONENTIALLY (Euler-Maclaurin: every periodic derivative vanishes), so the " +
        "quadrature error there is around e^-79. Over the device's entire permitted range there is no " +
        "discretisation error left in integralErrFrac -- what it measures is accumulated summation rounding, " +
        "which is why refining makes it worse");

    ok("...so the number is honest about magnitude and mis-named about content",
        err.vals[err.vals.length - 1] < 1e-12,
        "1.3e-13 at gridN=512 is a true statement that the rasteriser reproduces the closed form to 13 digits. " +
        "It is not a statement about resolution, and criterion 3 is what separates those. The v2898 tautology " +
        "census could not: it hunts exact zeros, and this is not zero");
}

// ---- 4. THE PRE-REGISTERED PREDICTION, WHICH FAILED ------------------------------------------------------------------
{
    const spread = fld("chaos", "deltaSpread"), best = fld("chaos", "deltaBest");

    // I registered deltaSpread DRIFTING and deltaBest CONVERGING. Half of that was right.
    ok("!! prediction FAILED: deltaSpread does not drift under refinement, it plateaus",
        spread.verdict !== "DRIFTING" && REFINEMENT_REGISTRATION.claim.target === true,
        "deltaSpread " + spread.vals.map((v) => v.toFixed(6)).join(", ") + " -- zero at count=3 because one " +
        "estimate has no range, then FIXED at 0.110295 from count=4 onward. I predicted it would grow, reasoning " +
        "from v2905 that it is limited by how well a high-period bifurcation can be located. It does not grow: " +
        "each new estimate falls inside the range the first two already set");

    ok("the other half of the prediction held",
        best.verdict === "CONVERGING",
        "deltaBest " + best.vals.map((v) => v.toFixed(6)).join(", ") + " settling toward 4.669202");

    // WHAT THE FAILURE ACTUALLY TAUGHT, which is more useful than the prediction would have been.
    ok("!! and the two criteria now disagree about the same number, which is the point of having four",
        spread.vals[3] > 0.1 && spread.vals[2] === spread.vals[3],
        "deltaSpread is STABLE under refinement (criterion 3, this round) and moves by a factor of 110 under a " +
        "one-ulp libm shift (criterion 4, v2905). Both are true. It is a fixed, reproducible-on-one-machine " +
        "disagreement of 0.11 between delta estimates -- about 2.4% of delta -- that more cascade points do not " +
        "reduce and a different libm does not reproduce. A quantity can be perfectly converged and still not be " +
        "a measurement");

    ok("the range the device permits is too short to say more than that",
        REFINEMENT_KNOBS.chaos.values.length === 4 && REFINEMENT_KNOBS.chaos.values[3] === 6,
        "chaosDefaults clamps count to [3, 6], so the sequence is four points and the last two agree exactly. " +
        "A plateau over two points is not a proof of a plateau; raising the clamp is the follow-on");
}

// ---- 5. WHAT THIS DOES NOT ESTABLISH --------------------------------------------------------------------------------
{
    // v3081 -- THE SIXTH MECHANISM-PINNED GATE, and the only one so far that went red for doing the RIGHT thing.
    // This assertion was `=== 5`: a literal count of the register, frozen at the size it happened to have when
    // v2907 wrote it. Registering lens.dphi -- which is the exact activity this file exists to encourage --
    // turned it red, so the gate punished the contribution and would have kept punishing every future one. The
    // count was never the claim. The claim is that COVERAGE IS A SMALL MINORITY, so a device with no verdict
    // here has not passed criterion 3, it has not been asked. That is asserted against the live device registry
    // instead of against a number somebody typed -- and the "24 devices" in the old evidence string had drifted
    // to 27 in the meantime, which is the same disease in the prose.
    const nKnobs = Object.keys(REFINEMENT_KNOBS).length, nDev = DEVICE_NAMES.length;
    ok("a handful of knobs is not a lab", nKnobs * 2 < nDev,
        nKnobs + " declared of " + nDev + " devices (" + (100 * nKnobs / nDev).toFixed(0) + "%). v2904 counted " +
        "302 unkeyed observables in modes with no refinement knob; this moves that by a handful. A device absent " +
        "from this register has NOT passed criterion 3 -- it has not been asked, and the two look identical from " +
        "a summary");
    console.log("  NOTE   energyGrowthRatio is reported DRIFTING and arguably should not be: it sits at 1 with a");
    console.log("         wobble of ~9e-9, which is a symplectic integrator conserving energy, not a quantity");
    console.log("         failing to settle. The classifier's floor guard is set at 1e-12 relative and does not");
    console.log("         catch it. Recorded rather than tuned away -- moving a threshold until the output looks");
    console.log("         tidy is how a gate stops meaning anything.");
}

console.log();
if (fails) { console.log("refinementKnobs-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("refinementKnobs-selfcheck: all checks pass");
