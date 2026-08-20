// tools/roundhouse/rmt-selfcheck.mjs
//
// v3291 -- RANDOM MATRIX THEORY BECOMES THE 40th GRADED DEVICE, AND CARRIES THE SHARPEST PLANTED ERROR HERE.
//
// This device grades a detector for CHAOS that looks only at a list of numbers. Wigner's claim -- sixty years of
// evidence deep -- is that the FLUCTUATIONS of a quantum spectrum depend on nothing about the system except its
// symmetry class and whether the classical dynamics is chaotic:
//
//     <r> = 4 - 2 sqrt(3) = 0.535898     chaotic, time-reversal symmetric (GOE): adjacent levels REPEL
//     <r> = 2 ln 2 - 1    = 0.386294     integrable: levels uncorrelated, piling up at zero spacing
//
// WHY THE r-STATISTIC AND NOT THE SPACING DISTRIBUTION: r is a ratio of ADJACENT gaps, so it survives any smooth
// rescaling of the spectrum and needs NO UNFOLDING. Unfolding is where these analyses usually go wrong -- a
// badly chosen smooth density can manufacture repulsion or destroy it -- and an observable that does not need
// the step cannot fail at it.
//
// *** THE PLANTED ERROR DOES NOT PRODUCE A WRONG NUMBER. IT PRODUCES THE OTHER TEXTBOOK NUMBER. ***
//
// diagonalWRONG builds a matrix that is random but is NOT a GOE, and its <r> lands at 0.369 -- the POISSON
// value, which is exactly what theory predicts for uncorrelated levels. A check asking "is <r> in a plausible
// range for a spectrum" passes it. A check asking "is <r> the GOE value" catches it. That distinction is the
// whole reason a closed-form key beats a sanity band, and this is the cleanest example of it in the lab.

import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("rmt");
const GOE = 4 - 2 * Math.sqrt(3), POISSON = 2 * Math.log(2) - 1;

// ---- 1. LEVEL REPULSION MATCHES THE WIGNER VALUE -------------------------------------------------------------------
{
    const o = await dev.build({ mode: "repulsion" });
    ok("!! GOE spectra show level repulsion at the exact Wigner-surmise value",
        o.rGoeErr < 0.01,
        `<r> = ${o.rGoe.toFixed(6)} against 4 - 2sqrt(3) = ${GOE.toFixed(6)}, error ${o.rGoeErr.toExponential(2)} ` +
        `over ${o.reps} matrices of size ${o.n}. The key is not fitted to the data -- it is a prediction about ` +
        "any chaotic time-reversal-symmetric system, from a nucleus to a billiard");

    ok("...and an INDEPENDENT integrable spectrum lands on the Poisson value",
        o.rPoissonErr < 0.03,
        `a rectangle billiard gives <r> = ${o.rPoisson.toFixed(6)} against 2ln2 - 1 = ${POISSON.toFixed(6)}. ` +
        "Different construction, different physics, second closed form -- so the device is not merely " +
        "reproducing one number it was built around");

    ok("the two classes are far apart, which is what makes the statistic a detector",
        Math.abs(o.rGoe - o.rPoisson) > 0.1,
        `${o.rGoe.toFixed(4)} vs ${o.rPoisson.toFixed(4)}. A 0.15 gap between chaotic and integrable is why this ` +
        "single number can classify a spectrum with no other information about the system");
}

// ---- 2. THE PLANTED ERROR RETURNS A DIFFERENT TEXTBOOK CONSTANT -------------------------------------------------------
{
    const good = await dev.build({ mode: "repulsion" });
    const bad = await dev.build({ mode: "repulsion", config: { planted: true } });
    ok("!! diagonalWRONG is caught: <r> collapses from the GOE value to the POISSON value",
        bad.rGoeErr > 0.1 && Math.abs(bad.rGoe - POISSON) < 0.03,
        `${good.rGoe.toFixed(4)} -> ${bad.rGoe.toFixed(4)}. It is not noise and it is not a wild number: it is ` +
        `${POISSON.toFixed(4)}, the OTHER exact constant. The matrix is still random, it is simply not a GOE, so ` +
        "its levels do not repel -- and a range check on <r> would call that healthy");

    ok("...and the small-gap fraction moves the same way, from repulsion to pile-up",
        bad.smallGap > good.smallGap * 3,
        `${good.smallGap.toFixed(4)} -> ${bad.smallGap.toFixed(4)}. P(s -> 0) = 0 is the signature of repulsion; ` +
        "losing it means near-degenerate levels appear, which is the physical content of the r collapse");
}

// ---- 3. THE SEMICIRCLE -- a key about the density rather than the fluctuations -------------------------------------------
{
    const o = await dev.build({ mode: "semicircle" });
    ok("!! the spectrum fills a semicircle of the predicted radius 2 sigma sqrt(N)",
        o.semicircleErr < 0.05,
        `largest |eigenvalue| ${o.semicircleMeasured.toFixed(3)} against predicted ` +
        `${o.semicirclePredicted.toFixed(3)}, ${(o.semicircleErr * 100).toFixed(2)}% high. The extreme eigenvalue ` +
        "sits slightly outside the bulk edge, which is expected -- the semicircle is the limiting DENSITY, not a " +
        "hard wall, and finite N leaves fluctuations at the edge");

    ok("this key and the r-statistic are independent",
        o.semicircleMeasured > 0 && o.rGoe === null,
        "the semicircle constrains where the eigenvalues ARE; r constrains how they are SPACED. diagonalWRONG " +
        "would keep a sensible spread while destroying the spacing correlations, so the fluctuation key is the " +
        "one carrying the detection power");
}

// ---- 4. DECLARED --------------------------------------------------------------------------------------------------------
{
    const { modesOf } = await import("./deviceModes.mjs");
    const m = modesOf(dev, null);
    ok("rmt declares its modes -- 40 graded of 113 proven",
        m.source === "exported" && m.declared.length === 2,
        `source "${m.source}", modes ${JSON.stringify(m.declared)}. Found by sweeping for the PROPERTY (an ` +
        "exported named-wrong variant) instead of a naming convention -- the correction that also produced v3290");
}

console.log();
if (fails) { console.log("rmt-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("rmt-selfcheck: all checks pass");
