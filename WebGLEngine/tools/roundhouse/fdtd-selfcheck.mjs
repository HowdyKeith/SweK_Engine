// tools/roundhouse/fdtd-selfcheck.mjs
//
// Run: node tools/roundhouse/fdtd-selfcheck.mjs   (~12s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// THE BEST ANSWER KEY IN THE LAB, AND IT IS NOT CLOSE. Every other device asks whether the simulation matches
// the right answer. FDTD's error is a CLOSED FORM that can be written down before the code runs:
//
//     omega = (2/dt) asin(S sin(k dx / 2)),   S = c dt / dx
//
// so what is graded here is not "the answer is right" but "THE ANSWER IS WRONG BY EXACTLY THIS MUCH". If the
// grid and the formula agree on the error, the model of the model is correct.
//
// The solver has existed since v2487 and is exercised by physicsSuite; it was never a device, while its
// directory neighbour born.js has been one since v2818. Electromagnetism was missing from all thirteen areas
// with the physics already written and passing.

import { getDevice } from "./devices.mjs";
import { numericalPhaseVelocity } from "../../simulation/em/fdtd1d.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const dev = await getDevice("fdtd");

// ---- 1. THE GRID AND THE FORMULA AGREE ON THE ERROR -------------------------------------------------------------
{
    const rows = [];
    for (const [S, ppw] of [[0.9, 12], [0.5, 8], [0.7, 16]]) {
        const r = await dev.build({ mode: "dispersion", config: { S, pointsPerWavelength: ppw } });
        if (r.error) { ok("dispersion at S=" + S, false, r.error); continue; }
        rows.push({ S, ppw, ...r });
    }
    const worst = Math.max(...rows.map((r) => r.vpErrAbs));
    // TOLERANCE EARNED, AND IT IS DOMINATED BY THE COARSEST SETTING. Measured: 1.6e-5 at S=0.9/12, 2.5e-5 at
    // S=0.7/16, and 8.1e-4 at S=0.5/8. Eight points per wavelength is a coarse grid and the zero crossings are
    // located by LINEAR interpolation between samples, so the apparatus itself carries error there -- the two
    // finer settings sit thirty times closer. 2e-3 is 2.5x the measured worst; it is not the number the two good
    // settings would justify, and pretending one tolerance fits all three would hide which one is doing the work.
    ok("!! the measured phase velocity matches the closed form at three (S, points-per-wavelength) settings",
       rows.length === 3 && worst < 2e-3,
       rows.map((r) => "S=" + r.S + "/" + r.ppw + ": " + r.vpMeasured.toFixed(6) + " vs " + r.vpPredicted.toFixed(6)).join(", ") +
       " — worst |diff| " + worst.toExponential(2) + " (the coarse 8-points-per-wavelength case; the two finer ones are ~2e-5). " +
       "The formula is the reference and the grid is the measurement");
    ok("...and the waves really are SLOW, as the discretisation says they must be (a one-signed error)",
       rows.every((r) => r.vpPredicted <= 1 + 1e-12),
       "every predicted vp/c is at or below 1 — a grid that ran a wave FAST would be a different bug, and the sign is a free extra check");
}

// ---- 2. THE MAGIC STEP: SMALLER IS WORSE ---------------------------------------------------------------------------
// At S = 1 exactly, asin(sin(x)) = x and the dispersion collapses to omega = c k. No error at all, at every
// frequency. Taking a smaller timestep "to be safe" makes it WORSE, which is the opposite of every instinct
// about numerical methods, and is why this mode exists.
{
    const r = await dev.build({ mode: "magic", config: { pointsPerWavelength: 12 } });
    ok("!! at the magic step S = 1 the error is EXACTLY zero, not merely small",
       r.magicErr === 0,
       "magicErr " + r.magicErr + " — an exact zero that is EARNED: at S=1 the wave advances exactly one cell per step, so the discrete update and Maxwell are the same arithmetic");
    ok("!! ...and SHRINKING the step makes it worse, which is the counterintuitive half",
       r.errorGrowsAsStepShrinks === true && r.offMagicErr > 1e-3,
       "S=1 -> 0, S=0.5 -> " + r.offMagicErr.toExponential(2) + ". A device that measured monotone improvement as dt fell would be measuring something else");
    ok("the closed form agrees that S = 1 is exact, independently of the grid",
       numericalPhaseVelocity(1.0, 12) === 1 && numericalPhaseVelocity(1.0, 40) === 1,
       "the formula returns exactly 1 at the magic step for every points-per-wavelength, so the grid's zero is confirmed by algebra rather than by luck");
}

// ---- 3. THE SPEED OF LIGHT, AND THE CIRCULARITY THAT NEARLY SHIPPED --------------------------------------------------
// v2496's mutation sweep changed C0 by 3% AND EVERY FDTD CHECK STAYED GREEN, because vp/c and reflection
// coefficients are ratios and c cancels. The first version of the lightspeed mode reproduced that hole exactly:
// it compared the measured speed against the IMPORTED C0, and since dt is computed as S*dx/C0 the module's own
// value came straight back out. It scored a perfect 0.0 while measuring nothing.
{
    const r = await dev.build({ mode: "lightspeed", config: {} });
    ok("!! time of flight between two probes recovers the speed of light in ABSOLUTE units",
       r.cErrFrac < 1e-9,
       r.cMeasured.toExponential(6) + " m/s against " + r.cExact.toExponential(6) + " (SI, exact by definition of the metre)");
    ok("!! ...and the reference is a LITERAL, so a wrong C0 in the module cannot cancel out of it",
       r.cExact === 299792458,
       "299792458 is a fact about the SI system, not about this repository — importing the module's own constant " +
       "would give exactly zero for any value of it, including a wrong one");
    // the check has teeth: a 3% error in the module's constant would show up at 2.9e-2, not 0
    const wrong = r.cMeasured / 1.03;
    ok("!! a 3% wrong speed of light would read 2.9e-2 here rather than zero (the v2496 hole, closed)",
       Math.abs(wrong - 299792458) / 299792458 > 0.02,
       "detection power computed against the same literal the mode uses");
}

// ---- 4. THE DEVICE DECLARES WHAT IT CAN DO ------------------------------------------------------------------------------
{
    // one build per declared mode, so "distinct" is MEASURED rather than assumed from the names
    const modeAnswers = [];
    for (const m of dev.modes) modeAnswers.push(await dev.build({ mode: m }));
    // *** v3734 -- THIS CHECK WAS PINNED TO A COUNT AND WENT RED WHEN THE DEVICE CORRECTLY GAINED TWO MODES.
    // It read `modes.length === 3` against a literal list, AND IT NEVER CHECKED THE DISTINCTNESS ITS OWN TITLE
    // CLAIMS -- it counted. The property is: THE THREE ORIGINAL MODES ARE STILL THERE, and every declared mode
    // ANSWERS DIFFERENTLY, which is the thing that makes a mode a mode. WHEN A LATER ROUND ADDS A SIXTH, THIS
    // LINE SHOULD STAY AS IT IS: it is a property now, not an arrangement. If a new mode duplicates another's
    // answer, the right response is to delete the duplicate mode, NOT to weaken this. (v3196's idiom.) ***
    const ORIGINAL = ["dispersion", "magic", "lightspeed"];
    ok("the original modes survive, and every declared mode gives a DISTINCT answer",
       ORIGINAL.every((m) => dev.modes.includes(m)) && dev.modes.length >= 3 &&
       new Set(modeAnswers.map((a) => JSON.stringify(a))).size === dev.modes.length,
       dev.modes.join(", ") + " — an undeclared mode is invisible to every census and sweep, which is how thermal's convect mode hid until v3315");
    const obs = new Set(dev.observables);
    ok("...and every observable it returns is declared",
       ["vpPredicted", "vpMeasured", "magicErr", "cMeasured", "cErrFrac"].every((f) => obs.has(f)),
       dev.observables.length + " declared");
}

// ---- 5. determinism ------------------------------------------------------------------------------------------------------
{
    const a = await dev.build({ mode: "dispersion", config: { S: 0.9, pointsPerWavelength: 12 } });
    const b = await dev.build({ mode: "dispersion", config: { S: 0.9, pointsPerWavelength: 12 } });
    ok("repeat builds are bit-identical (a failure reproduces)", a.vpMeasured === b.vpMeasured);
}

console.log(fails ? ("fdtd-selfcheck: " + fails + " FAILURES") : "fdtd-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
