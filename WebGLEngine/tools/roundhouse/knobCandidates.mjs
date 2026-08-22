// tools/roundhouse/knobCandidates.mjs
//
// v2917 -- WHY ELIGIBILITY IS HARD TO WIDEN, WRITTEN DOWN SO IT IS NOT REDISCOVERED.
//
// v2908 measured that only four devices carry both a refinement knob and a nuisance knob, which is what a
// quantity needs before the full four-criteria battery can be run at all. v2916 closed by naming eligibility as
// the binding constraint and the cheapest thing to widen. This round tried to widen it and failed three times,
// which turned out to be more informative than succeeding once.
//
// The three failures are not the same failure. Each is a general trap, and each would have produced a knob that
// LOOKED declarable and then quietly poisoned a verdict:
//
//   1. A STOCHASTIC SAMPLE COUNT IS NOT A REFINEMENT KNOB. ising's `samples` is the obvious criterion-3 knob and
//      it does not work, because criterion 3 as implemented asks whether successive differences SHRINK. Monte
//      Carlo does not converge that way: the standard error falls as 1/sqrt(N) while the value performs a random
//      walk inside it. Measured at samples = 100, 200, 400, 800: 0.9085, 0.9141, 0.9127, 0.9156 -- wandering,
//      not settling, and classifySequence would call it DRIFTING and be wrong. This is a GAP IN THE CRITERIA,
//      not in the device: the right statistical test is that the seed spread shrinks as 1/sqrt(N), which is a
//      different measurement and nothing in this tree performs it.
//
//   2. A COMPENSATED PAIR CAN BE VACUOUS BY IEEE ARITHMETIC. blackhole's physics depends on G and M only through
//      their product, so G -> lambda*G with M -> M/lambda looks like a perfect live nuisance: every input
//      changes, the physics cannot. It is worthless. lambda * (1/lambda) evaluates to EXACTLY 1.0 for every
//      lambda tested -- 2, 3, 5, 7, 0.3, 1.7 -- so GM reconstructs bit-for-bit and nothing downstream can
//      differ. The invariance is guaranteed by floating-point round-tripping, not by the physics being tested,
//      and v2906's rule catches it only as SUSPECT-bit-identical. Any nuisance built as (x, 1/x) needs this
//      check before it is declared.
//
//   3. A CONVERGENCE KNOB IS NOT A NUISANCE. blackhole's escRFar -- the radius at which a trajectory is declared
//      escaped -- reads like one ("where you declare 'far' cannot matter"). It matters, and how it matters is
//      the finding below.

/**
 * REJECTED CANDIDATES. A knob that has been examined and found unusable is worth as much as one that works,
 * provided the reason is recorded. Without this file the same three would be re-tried, because all three are the
 * first thing anyone would reach for on those devices.
 */
export const REJECTED_KNOBS = {
    // v3512 -- THREE MORE EXAMINED, THREE MORE REJECTED, AND THEY ARE THE THREE THE REACH CENSUS CALLED THE
    // CHEAPEST PROMOTIONS IN THE LAB. corroborationReach names splat, blackhole and ising as ONE KNOB SHORT;
    // that is a statement about the REGISTERS and not about the physics, and measuring it is what turns a
    // to-do list into three reasons.
    "ising.L": {
        proposedAs: "refinement",
        rejected: "*** IT CONVERGES BEAUTIFULLY AT THE DEFAULT SEED AND THE CONVERGENCE IS SAMPLING LUCK. *** " +
                  "magnetisationErrFrac at seed 12345 reads 1.1811e-2, 4.4674e-3, 1.5432e-3, 2.9045e-4 over " +
                  "L = 12, 16, 24, 32 -- classifySequence returns CONVERGING with ZERO REVERSALS, monotone " +
                  "shrinking steps and a contraction of 0.171, which is a cleaner c3 pass than most registered " +
                  "knobs produce. AVERAGED OVER FOUR SEEDS THE SAME SWEEP IS FLAT: 2.94e-2, 5.61e-3, 6.75e-3, " +
                  "6.81e-3, and the seed standard deviation is COMPARABLE TO OR LARGER THAN THE MEAN at every " +
                  "L (mean/sd 0.69, 4.68, 1.39, 1.11). The trend is smaller than the noise it is measured in",
        gap: "THIS IS ising.samples' RECORDED GAP ARRIVING FROM THE OTHER SIDE. That entry says criterion 3 " +
             "has no statistical variant and would report DRIFTING for a correct device; L is the mirror image " +
             "-- CONVERGING for a sequence that is noise. A systematic parameter does not escape the problem, " +
             "because the answer it moves is still a Monte Carlo estimate. The fix is the one already written " +
             "there: for a stochastic device the test is that the SEED SPREAD shrinks, not that the value does",
    },
    "blackhole.dtHalving-as-nuisance": {
        proposedAs: "audit of a REGISTERED knob rather than a new candidate",
        rejected: "not rejected as a knob -- FLAGGED AS A SUSPECT PASS. With dt * escSteps held constant so the " +
                  "simulated time is unchanged, escapeV is BIT-IDENTICAL at 0.537736013162 across dt = 0.02, " +
                  "0.01, 0.005. v2906's rule reports bit-identical as SUSPECT rather than as success, and dt IS " +
                  "live (holding escSteps fixed instead moves escapeV 0.562 -> 0.949, which is the trajectory " +
                  "being TRUNCATED rather than refined -- my own first fixture, and it would have registered dt " +
                  "as a refinement knob on a measurement of the wrong thing)",
        gap: "*** v3512 SUSPECTED escapeV WAS QUANTISED BY ITS OWN escTol = 1e-4 BISECTION TOLERANCE, SO THAT " +
             "THE INVARIANCE WOULD BE THE TOLERANCE RATHER THAN THE PHYSICS. v3514 SWEPT IT AND THE SUSPICION " +
             "IS WRONG: the dt sweep stays BIT-IDENTICAL at escTol 1e-4, 1e-5 AND 1e-6, so tightening the " +
             "bracket a hundredfold does not uncover a hidden dt dependence. THE INVARIANCE IS REAL. *** What " +
             "is bit-identical rather than merely small is a consequence of the observable's SHAPE: escapeV is " +
             "settled by a bisection on a BOOLEAN (did this trajectory escape), so dt would have to change an " +
             "escape/no-escape VERDICT to move the answer at all, and at these resolutions it does not. The " +
             "pass stays SUSPECT under v2906's rule because bit-identical cannot distinguish invariance from a " +
             "parameter never read -- but the reason is now measured instead of guessed, AND THE SWEEP RUN TO " +
             "TEST IT PROMOTED escTol TO A REFINEMENT KNOB (see REFINEMENT_KNOBS.blackhole)",
    },
    "splat.nuisance-candidates": {
        proposedAs: "nuisance",
        rejected: "EVERY candidate is vacuous on the graded field. integralErrFrac reads 7.4940e-14 with a " +
                  "spread of EXACTLY ZERO under sigma (0.05..0.4), alpha (0.2..0.7) and count (5..13), and " +
                  "2.22e-16 -- one ulp -- under z and f scaled together. 7e-14 is THE EPSILON ANSWER: a " +
                  "quantity graded against its own forward model returns machine precision and proves the " +
                  "arithmetic rather than the physics, so there is nothing for a nuisance knob to fail to move",
        gap: "*** THE SECOND HALF OF THIS REASON WAS REFUTED AT v3516 AND THE ENTRY IS CORRECTED RATHER " +
             "THAN DELETED (v3202: a register entry whose stated reason has expired is a stale suppression, " +
             "and deleting it would lose the fact that the question was asked). IT SAID compose and " +
             "perspective 'did not enumerate under JSON.stringify'. THEY BOTH ENUMERATE PERFECTLY -- " +
             "perspective returns 2 finite numbers, compose 6 and a boolean. `{}` IS WHAT JSON.stringify " +
             "RETURNS FOR AN **UN-AWAITED PROMISE**, and getDevice() and build() are BOTH async, so the " +
             "recorded symptom was a missing `await` in the probe and not a property of the device. *** " +
             "THE FIRST HALF STANDS AND IS RE-MEASURED EVERY RUN: integralErrFrac is the epsilon answer and " +
             "has nothing to be invariant under, so a splat nuisance knob did need a DIFFERENT OBSERVABLE -- " +
             "and it is perspective/scale (sigma and f together), registered at v3516. See " +
             "tools/roundhouse/splatNuisance-selfcheck.mjs",
    },
    "ising.warmup": {
        proposedAs: "refinement",
        rejected: "same failure as ising.samples and measured rather than assumed by analogy: 3.239e-3, " +
                  "3.991e-3, 1.543e-3, 7.935e-3 at warmup = 100, 200, 400, 800 -- non-monotone with steps " +
                  "GROWING 7.52e-4, 2.45e-3, 6.39e-3",
        gap: null,
    },
    "ising.samples": {
        proposedAs: "refinement",
        rejected: "criterion 3 tests whether successive differences shrink; a Monte Carlo estimator's value " +
                  "random-walks inside a standard error that falls as 1/sqrt(N). Measured 0.9085, 0.9141, " +
                  "0.9127, 0.9156 at N = 100, 200, 400, 800 -- non-monotone, and the classifier would report " +
                  "DRIFTING for a device that is behaving correctly",
        gap: "criterion 3 has no statistical variant. The correct test for a stochastic device is that the SEED " +
             "SPREAD shrinks as 1/sqrt(N), not that the value settles",
    },
    // v3533 -- *** THE KNOB blackhole ACTUALLY NEEDS, MEASURED, AND THE CLAMP THAT BOUNDS IT. ***
    // The register has said for rounds that blackhole is one NUISANCE knob short and that its dt sweep is a
    // SUSPECT pass (bit-identical, so v2906 cannot tell invariance from a parameter never read). The standing
    // note was that it needs a DIFFERENT OBSERVABLE, as splat did at v3516. IT ALREADY HAS ONE, on `orbit`.
    //
    // THE TRANSFORMATION: M -> lambda*M with r0 -> lambda*r0 AND dt -> lambda*dt. Schwarzschild has M as its
    // only scale, so lengths carry lambda and dimensionless quantities do not -- lens's knob (v3134) in a
    // second device. THE COMPENSATING HALF IS dt, because in G=c=1 TIME SCALES AS LENGTH: without it `orbits`
    // reads 19, 6 and 2 across lambda 1, 3 and 7.3, so the sweep changes HOW FAR THE RUN GOT rather than
    // testing scale, and precessionPerOrbit moves by 1.4e-5 for a reason having nothing to do with the physics.
    //
    // WITH dt SCALED IT HOLDS: orbits stays 19 and precessionPerOrbit agrees to TWELVE DIGITS at lambda 1, 3
    // and 0.37, while rMin/lambda is 8.916141494668 at all three. AND rMin IS THE LIVENESS WITNESS lens needed
    // at v3518 -- a LENGTH THE INTEGRATOR COMPUTED, not an echo of the config and not dimensionless, so this
    // knob cannot rest on round-off the way lens's did for 437 versions.
    //
    // *** BUT IT IS BOUNDED BY A CLAMP NOBODY DECLARED, AND THAT IS THE ROUND'S REAL FINDING. *** blackHoleBind
    // does `cfg.dt = Math.min(0.1, ...)`, so above lambda = 5 the compensating half IS SILENTLY DISCARDED: the
    // device ACCEPTS dt 0.146, quietly uses 0.1, and the invariance breaks -- orbits 19 -> 13, rMin/lambda
    // moving in the seventh digit -- WITH NOTHING SAYING THE PARAMETER WAS OVERRIDDEN. That is kepler's dead
    // `mu` (v3517) one step along: there the bind accepted a parameter and never passed it on; here it accepts
    // it, bounds it, and never tells the caller.
    //
    // *** SO A SWEEP AT lambda IN {1, 3, 0.37} WOULD HAVE REGISTERED CLEANLY AND BEEN WRONG ABOVE 5. *** v3516
    // learned that dyadic lambdas are too EASY; this is the same lesson from the other side -- THE RANGE was
    // too easy. NOT REGISTERED YET, and the reason is a judgement rather than a measurement: whether 0.1 is a
    // real integrator stability limit (in which case the knob's range is bounded BY PHYSICS and the entry must
    // say "valid for lambda <= 5") or a guard missing its refusal (v3442's exportVox shape -- REFUSE instead of
    // coerce). CHOOSING THAT IS KEITH'S; measuring it was this round's.
    // v3534 -- *** THE ESCAPE ROUTE THE REGISTER PRESCRIBED FOR ising IS ITSELF UNSUPPORTED, AND MY OWN FIRST
    // MEASUREMENT OF THAT WAS AN ARTEFACT. *** ising.samples was rejected because criterion 3 has no
    // statistical variant; ising.L was rejected because a systematic parameter does not escape it (the trend is
    // smaller than the seed noise). Both entries name the same way out: FOR A STOCHASTIC DEVICE THE TEST IS
    // THAT THE SEED SPREAD SHRINKS AS 1/sqrt(N), NOT THAT THE VALUE SETTLES. IT HAD NEVER BEEN RUN.
    //
    // Run with seedSpread.mjs (extracted this round precisely so it COULD be run): if the claim held,
    // rel * sqrt(N) would be FLAT. Over a 16-fold sweep of `samples` it is not, at EITHER temperature -- span
    // 1.88 at T = 2.00 and 2.45 at T = 2.27, both climbing rather than holding.
    //
    // *** AND THE INTERESTING PART IS THAT I FIRST MEASURED THIS AT SIX SEEDS AND REPORTED "IT HOLDS AWAY FROM
    // Tc AND FAILS AT Tc". WIDENING TO TWELVE HALVED THE EFFECT: the Tc-to-control span ratio falls from 2.38
    // to 1.31. DOUBLING THE SEED COUNT HALVING THE APPARENT EFFECT IS THE SIGNATURE OF A SEED-COUNT ARTEFACT,
    // NOT OF PHYSICS -- and it is v3512's own finding about ising.L arriving one level up: there the trend was
    // smaller than the seed noise, here the trend is smaller than the SEED-COUNT DEPENDENCE. ***
    //
    // SO ising IS NOT ONE KNOB SHORT IN THE SENSE THE LIST IMPLIES. Three routes have been tried and the third
    // is not a route: the prescribed statistic is not supported by the device it was prescribed for, and
    // measuring it at all needs more seeds than anybody has used. THAT IS A CLAIM ABOUT THE INSTRUMENT AS MUCH
    // AS THE DEVICE, and the honest disposition is NOT-YET-MEASURABLE rather than NOT-YET-DONE.
    //
    // *** DELIBERATELY NOT DONE: taking ising off the one-knob-short list. That moves an eligibility
    // denominator, which is v3511's defect (the numerator watched while the denominator changed), and it should
    // move on a decision rather than on a measurement I have already had to correct once in one round. ***
    "ising.seedSpread-as-refinement": {
        proposedAs: "refinement",
        rejected: "the prescribed statistic is NOT SUPPORTED by the device. rel * sqrt(N) should be FLAT if " +
                  "the spread shrinks as 1/sqrt(N); over a 16-fold sweep it spans 1.88 at T=2.00 and 2.45 at " +
                  "T=2.27, climbing at both. AND THE APPARENT Tc SPECIALNESS IS LARGELY A SEED-COUNT ARTEFACT: " +
                  "the Tc-to-control span ratio falls 2.38 -> 1.31 when the seed set doubles from 6 to 12",
        gap: "how many seeds a spread estimate on this device actually needs before its own noise floor is " +
             "below the effect being measured -- until that is known, NO verdict here is safe, including this one",
    },
    "blackhole.scale-with-dt": {
        proposedAs: "nuisance",
        rejected: "NOT rejected on the physics -- the invariance is real and rMin is admissible liveness " +
                  "evidence. HELD because dt is CLAMPED AT 0.1 in the bind, so the compensating half is " +
                  "silently dropped above lambda = 5 and the declared transformation stops being the one " +
                  "that runs. A knob whose range is bounded by an undeclared clamp is a knob that passes " +
                  "until somebody sweeps wider",
        gap: "decide whether dt's 0.1 ceiling is an integrator stability limit (declare it, and bound the " +
             "knob's lambda range with it) or a guard that should REFUSE rather than coerce",
    },
    "blackhole.GM-compensated": {
        proposedAs: "nuisance",
        rejected: "G -> lambda*G with M -> M/lambda holds the product fixed, but lambda*(1/lambda) is exactly " +
                  "1.0 in IEEE double for every lambda tried, so GM is bit-identical and the whole build is " +
                  "bit-identical. Vacuous by arithmetic rather than by physics",
        gap: "any compensated-pair nuisance must be checked for exact round-tripping before declaration",
    },
    "blackhole.escRFar": {
        proposedAs: "nuisance",
        rejected: "it is a convergence knob, not a nuisance -- the measured escape velocity depends on it " +
                  "strongly and monotonically. See ESC_RFAR_PROFILE",
        gap: null,
    },
};

/**
 * THE FINDING. escapeV against the radius at which escape is declared, everything else at defaults.
 *
 * escapeV rises MONOTONICALLY with escRFar -- 0.5284 to 0.5468 across 200 to 1600 -- and crosses the reported
 * theory value of 0.534522483825 somewhere between 800 and 1000. The graded error therefore has a MINIMUM at the
 * crossing, and the device's default escRFar of 800 sits on it:
 *
 *     escRFar    200      400      600      800      1000     1200     1600
 *     errFrac    1.15e-2  8.82e-3  5.41e-3  1.57e-3  3.27e-3  8.98e-3  2.30e-2
 *
 * The 1.57e-3 agreement the device reports is not evidence that the integrator is accurate. It is evidence that
 * a monotone curve was sampled where it crosses the answer. Two steps either way is 2x worse, four steps is 15x
 * worse, and because the quantity is monotone in escRFar there is no limit to appeal to -- refining escRFar
 * makes the agreement WORSE, in both directions, forever.
 *
 * This is the fourth member of a family this lab keeps finding: an impressive agreement produced by where a
 * parameter sits rather than by the physics. v2911 (airy, grid landing on a wrong constant), v2913 (slit, grid
 * landing on the right one), v2914 (edge, search grid landing on the rounded textbook value), and now this --
 * the first one where the parameter is physical rather than a discretisation.
 *
 * NOT CLAIMED: that anyone tuned it. The default may predate the theory comparison entirely. What is claimed is
 * that the number cannot be read as a validation, and that nothing in the device says so.
 */
export const ESC_RFAR_PROFILE = {
    // v2932 RE-MEASURED after the escSteps default rose 600000 -> 1200000 (converged budget). The profile shifted:
    // escapeV at escRFar 800 is now the converged 0.532157 (errFrac 4.425e-3), and the ERROR MINIMUM MOVED from
    // escRFar 800 to escRFar 1200. The v2917 concern was "the graded error is minimised at the default escRFar" --
    // that coincidence is now BROKEN by the budget adoption: the default (800) is no longer the minimum. Raising
    // the budget removed the very alignment v2917 flagged, a cleaner outcome than documenting a dead coincidence.
    minimumAt: 1200,
    defaultIsMinimum: false,
    knob: "escRFar",
    theory: 0.534522483825,
    samples: [
        { escRFar: 200, escapeV: 0.530689085885, errFrac: 7.172e-3 },
        { escRFar: 400, escapeV: 0.530689085885, errFrac: 7.172e-3 },
        { escRFar: 600, escapeV: 0.531393778613, errFrac: 5.853e-3 },
        { escRFar: 800, escapeV: 0.532157195734, errFrac: 4.425e-3, isDefault: true },
        { escRFar: 1000, escapeV: 0.532861888462, errFrac: 3.107e-3 },
        { escRFar: 1200, escapeV: 0.533684029978, errFrac: 1.569e-3 },
        { escRFar: 1600, escapeV: 0.535680659373, errFrac: 2.167e-3 },
    ],
};

/** True when a proposed compensated-pair nuisance would be vacuous because the pair round-trips exactly. */
export function compensatedPairIsVacuous(lambdas = [2, 3, 5, 7, 0.3, 1.7]) {
    return lambdas.every((l) => l * (1 / l) === 1);
}
