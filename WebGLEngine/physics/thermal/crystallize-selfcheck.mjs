// WebGLEngine/physics/thermal/crystallize-selfcheck.mjs -- v3621
//
// Run: node physics/thermal/crystallize-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/thermal/crystallize.mjs. THE CHECK THIS FILE EXISTS FOR is section 3: THE EFFECT IS STATED
// AGAINST THE SEED SPREAD. ising.L is this lab's standing example of a beautiful convergence that is noise --
// gorgeous at its default seed, FLAT over four -- and it was measured in the wrong order. This gate measures
// the spread and only then asks whether the exponents mean anything.
//
// It re-derives at L = 32 rather than quoting the L = 64 register: a gate that could only repeat its own
// header would be a memory. The register's numbers are the deeper run and are asserted CONSISTENT, not equal.
import {
    AVRAMI, MODE_GAP, transformTimes, fitExponent, seedEnsemble, discriminationPower, MEASURED_V3621, reportLines,
} from "./crystallize.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const OPTS = { L: 32, nNuclei: 30, tMax: 12, seeds: [1, 2, 3, 4] };

// ---- 1. THE PREDICTIONS COME FROM GEOMETRY -----------------------------------------------------------------------
{
    ok("!! the exponents are DERIVED from dimensionality and nucleation mode, not fitted",
       AVRAMI["3d-site-saturated"].n === 3 && AVRAMI["3d-continuous"].n === 4 &&
       AVRAMI["2d-site-saturated"].n === 2 && AVRAMI["2d-continuous"].n === 3,
       "3D site-saturated 3, 3D continuous 4 -- the extra power IS the nucleation rate integrated over time, " +
       "and 2D is one less in each case. NOTHING HERE COMES FROM THE LATTICE.");
    ok("...and continuous exceeds site-saturated by exactly one, in both dimensionalities",
       AVRAMI["3d-continuous"].n - AVRAMI["3d-site-saturated"].n === 1 &&
       AVRAMI["2d-continuous"].n - AVRAMI["2d-site-saturated"].n === 1 && MODE_GAP === 1,
       "so the gap the round has to resolve is 1, whatever the dimension");
}

// ---- 2. THE LATTICE RECOVERS BOTH EXPONENTS ------------------------------------------------------------------------
const D = discriminationPower(OPTS);
{
    ok("!! site-saturated growth recovers n = 3", Math.abs(D.saturated.mean - 3) < 0.3,
       "mean " + D.saturated.mean.toFixed(4) + " over " + D.saturated.seeds + " seeds (sd " +
       D.saturated.sd.toFixed(4) + "), predicted 3 -- and the prediction was never handed to the simulation");
    ok("!! continuous nucleation recovers n = 4", Math.abs(D.continuous.mean - 4) < 0.4,
       "mean " + D.continuous.mean.toFixed(4) + " (sd " + D.continuous.sd.toFixed(4) + "), predicted 4");
    ok("!! ...and they land on DIFFERENT integers, which is the whole discrimination",
       Math.round(D.saturated.mean) === 3 && Math.round(D.continuous.mean) === 4,
       "one simulation, one fit, two nucleation modes, two exponents");
}

// ---- 3. THE CLAIM IS STATED AGAINST THE NOISE -- THE ising.L LESSON, APPLIED IN ADVANCE --------------------------------
{
    ok("!! THE EFFECT IS SEVERAL TIMES THE SEED SPREAD, AND THE RATIO IS THE RESULT", D.effectOverNoise > 2,
       "gap " + MODE_GAP + " against a worst per-seed sd of " + Math.max(D.saturated.sd, D.continuous.sd).toFixed(4) +
       " = " + D.effectOverNoise.toFixed(2) + "x. ising.L'S DEFECT WAS A TREND SMALLER THAN ITS OWN SEED NOISE " +
       "and a device was nearly promoted on it; THIS IS THE SAME MEASUREMENT RUN IN THE RIGHT ORDER, and the " +
       "round would have had to report the other answer had it come out the other way.");
    ok("!! ...and the HONEST margin is the population gap, which is tighter than the means suggest",
       D.separated,
       "worst saturated seed " + D.saturated.max.toFixed(4) + " against best continuous seed " +
       D.continuous.min.toFixed(4) + " -- margin " + D.populationMargin.toFixed(4) + ", about " +
       (D.populationMargin / Math.max(D.saturated.sd, D.continuous.sd)).toFixed(1) + " per-seed sigma. THE " +
       "ENSEMBLE DISCRIMINATES; A SINGLE SEED IS NOT COMFORTABLY CLEAR OF THE WRONG ANSWER.");
    ok("!! a single seed is NOT the answer, and the spread is nonzero rather than assumed so",
       D.saturated.sd > 0 && D.continuous.sd > 0 && D.saturated.ns.length > 1,
       "per-seed n: " + D.saturated.ns.map((x) => x.toFixed(3)).join(", ") + " -- IF THIS READ ZERO THE " +
       "ENSEMBLE WOULD BE ONE RUN REPEATED and every ratio above would be meaningless");
    ok("the register's deeper run agrees with this one on both exponents",
       Math.abs(MEASURED_V3621.at64.saturated.mean - D.saturated.mean) < 0.4 &&
       Math.abs(MEASURED_V3621.at64.continuous.mean - D.continuous.mean) < 0.5,
       "L=64 recorded " + MEASURED_V3621.at64.saturated.mean + " / " + MEASURED_V3621.at64.continuous.mean +
       ", L=32 re-derived " + D.saturated.mean.toFixed(4) + " / " + D.continuous.mean.toFixed(4) +
       " -- ASSERTED CONSISTENT, NEVER EQUAL, because they are different lattices");
}

// ---- 4. IMPINGEMENT IS REAL, AND THE FIT WINDOW IS STATED RATHER THAN TUNED ------------------------------------------
{
    const T = transformTimes({ L: 32, nNuclei: 30, seed: 1 });
    ok("every cell transforms -- no cell is starved by the boundary", T.every((t) => Number.isFinite(t) && t >= 0),
       "minimum-image periodic distances; without them, cells near a face transform late for a reason that is " +
       "geometry rather than kinetics");
    // ONE nucleus in a periodic box: every cell belongs to it, and the transformed volume grows as a sphere,
    // so the exponent is 3 WITH NO IMPINGEMENT AT ALL. That separates the growth law from the impingement.
    const one = fitExponent(transformTimes({ L: 32, nNuclei: 1, seed: 1 }), { lo: 0.02, hi: 0.30 });
    ok("!! a SINGLE nucleus gives n = 3 before impingement can matter", Math.abs(one.slope - 3) < 0.35,
       "n = " + one.slope.toFixed(4) + " fitted at low X, where one sphere is still growing freely -- SO THE " +
       "EXPONENT IS THE GROWTH LAW, and what impingement does is bend the curve later rather than set n");
    ok("the fit window is declared with its reason", (MEASURED_V3621.fitWindow || "").includes("LATTICE ARTEFACTS"),
       "X in [0.05, 0.85] -- below that the log of a quantised fraction is noise, above it the remnant is " +
       "single cells. STATED, NOT TUNED UNTIL n CAME OUT RIGHT.");
}

// ---- 5. WHAT IS NOT CLAIMED ------------------------------------------------------------------------------------------
//
// ANTIDOTE: if a later round derives a nucleation RATE from an interfacial energy, section 5 goes red and must
// be rewritten to assert the rate is graded against ITS OWN key -- do not delete the refusal, and do not let a
// nucleation model borrow this file's exponent, which says nothing about where nuclei come from.
{
    ok("no nucleation theory is claimed", (MEASURED_V3621.notClaimed || "").includes("NO NUCLEATION THEORY"),
       "where nuclei appear and how often is IMPOSED; classical nucleation theory needs an interfacial energy " +
       "and a critical radius this tree does not have");
    ok("!! ...and ising.js is explicitly NOT claimed as the host",
       (MEASURED_V3621.notClaimed || "").includes("ORDERING at equilibrium"),
       "the Ising model grades ORDERING AT EQUILIBRIUM and this grades the KINETICS of a transformation -- " +
       "JOINING THEM BECAUSE BOTH ARE CALLED CRYSTALLISATION IS HOW ising.L HAPPENED");
    const rep = reportLines();
    ok("the report renders and names the ordering", rep.length > 15 && rep.join("\n").includes("SEED SPREAD"),
       rep.length + " lines");
}

// ---- *** THE PLANT (v3721): DROP THE MINIMUM-IMAGE WRAPPING *** -------------------------------------------------
// This module's own header warns about it: without wrapping, cells near a face are starved of nuclei and
// transform late FOR A REASON THAT IS GEOMETRY RATHER THAN KINETICS. So it is the plausible wrong derivation.
// *** AND IT IS A WEAK PLANT, WHICH IS THE POINT AND IS ASSERTED IN BOTH DIRECTIONS. The site-saturated
// ensemble mean moves 2.9622 -> 2.7355 against a per-seed sd of 0.1454 -- ABOUT 1.6 PER-SEED SIGMA, so ONE
// SEED CANNOT TELL A PLANTED LATTICE FROM AN UNLUCKY HONEST ONE, while over six seeds the same shift is more
// than three standard errors. THIS DEVICE EXISTS BECAUSE ising.L WAS NEARLY PROMOTED ON A TREND SMALLER THAN
// ITS SEED NOISE; quoting this plant at one seed would be that mistake with the sign flipped. ***
// WHEN THIS GOES RED the fix is to restore the wrapping, NEVER to widen the ensemble bar.
{
    const { seedEnsemble } = await import("./phaseOps.mjs");
    const opts = { L: 48, nNuclei: 30, continuous: false, tMax: 12, seeds: [1, 2, 3, 4, 5, 6] };
    const honest = seedEnsemble({ ...opts, periodic: true });
    const planted = seedEnsemble({ ...opts, periodic: false });
    const se = honest.sd / Math.sqrt(honest.seeds);
    const shift = honest.mean - planted.mean;

    ok("!! the planted lattice drags the Avrami exponent DOWN, and the ENSEMBLE MEAN sees it",
        shift > 3 * se && planted.mean < honest.mean,
        `mean ${honest.mean.toFixed(4)} -> ${planted.mean.toFixed(4)}, a shift of ${shift.toFixed(4)} against a standard error of ${se.toFixed(4)} (${(shift / se).toFixed(1)} SE)`);

    // *** THE HALF THAT MATTERS MORE: A SINGLE SEED DOES NOT SEPARATE THEM. Asserted so nobody later quotes
    // one seed as the catch -- this is the margin the device already reports for its own claim. ***
    ok("!! ...and a SINGLE SEED does not separate the two populations -- the ensemble is the instrument",
        shift < 2 * honest.sd,
        `shift ${shift.toFixed(4)} against a per-seed sd of ${honest.sd.toFixed(4)} (${(shift / honest.sd).toFixed(2)} sigma) -- honest seeds span ${honest.min.toFixed(3)}..${honest.max.toFixed(3)}, planted ${planted.min.toFixed(3)}..${planted.max.toFixed(3)}`);
}
console.log(fails ? "\ncrystallize-selfcheck: " + fails + " FAILED" : "\ncrystallize-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
