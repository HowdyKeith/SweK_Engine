// tools/roundhouse/bellBind.mjs
//
// v3990 -- THE BELL DEVICE. physics/quantum/bell.mjs shipped at v3989 with its own gate; this hands it to the
// roundhouse so the CHSH violation is swept and adjudicated beside the other devices.
//
// MODES:
//   "chsh"      the headline: S at the optimal angles, against BOTH bounds -- the classical 2 it beats and the
//               Tsirelson 2*sqrt(2) it cannot cross.
//   "routes"    the three independent correlators (closed form, 4x4 tensor operator, Monte Carlo over sampled
//               measurement events) and how far apart they land.
//   "bounds"    the two brute-force searches: 16 enumerated local-hidden-variable strategies, and a sweep of
//               the full four-angle space.
//
// ================================================================================================================
// *** THE PLANTED ERROR STILL VIOLATES BELL, WHICH IS THE ENTIRE POINT OF CHOOSING IT ***
// ================================================================================================================
//
// The plant replaces the singlet with partialSinglet(0.65) -- cos(t)|01> - sin(t)|10> at t = 0.65 instead of
// pi/4. That state is:
//
//   STILL NORMALISED           cos^2 + sin^2 = 1 for every t, so a normalisation check cannot see it.
//   STILL ENTANGLED            it is not a product state, and the two images do not factorise.
//   STILL VIOLATING BELL       |S| = 2.777 at the textbook angles, comfortably above the classical bound of 2.
//
// So every check of the form "does this device demonstrate a Bell violation" PASSES THE PLANT. What the plant
// cannot do is SATURATE Tsirelson: 2*sqrt(1+sin^2(2t)) at t = 0.65 is 2.77737, short of 2*sqrt(2) = 2.82843 by
// 0.051. Only a check that compares against the QUANTUM bound -- not merely the classical one -- catches it.
//
// That is the shape this lab keeps finding to be the useful one, and it is the same shape as the reactor
// device's dropped generation time: correct everywhere anybody normally samples, wrong at the one limit.
//
// EVERY MODE REPORTS `tsirelsonGap`, and that is deliberate rather than decorative. plantedCoverage RUNS each
// device nominal against planted in every declared mode and counts a mode only if a FINITE NUMERIC observable
// moves. The gap from the quantum bound is the one quantity the plant always shifts -- the classical-violation
// flag never does, by construction.
"use strict";
import {
    SINGLET, partialSinglet, maxCHSHPartial,
    correlatorExact, correlatorMatrix, monteCarloCorrelator, mulberry32,
    chsh, OPTIMAL_ANGLES, CLASSICAL_BOUND, TSIRELSON_BOUND, lhvBoundBySearch, chshMaxByAngleSweep,
} from "../../physics/quantum/bell.mjs";

export const BELL_OBSERVABLES = [
    "chshExact", "chshMatrix", "chshMonteCarlo", "violatesClassical", "tsirelsonGap", "classicalMargin",
    "routeSpreadExact", "routeSpreadMonteCarlo", "correlatorAtProbe",
    "lhvMax", "lhvStrategies", "sweepMax", "sweepGap",
    "planted",
];

// t = 0.65 rather than pi/4: still entangled, still violating, 0.051 short of Tsirelson.
const PLANT_T = 0.65;
const DEF = { a: OPTIMAL_ANGLES.a, ap: OPTIMAL_ANGLES.ap, b: OPTIMAL_ANGLES.b, bp: OPTIMAL_ANGLES.bp,
              probeA: 0.4, probeB: 1.3, samples: 40000, seed: 20250825, sweepSteps: 14 };

function buildBell({ mode = "chsh", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT, and it is one state: maximal entanglement becomes partial. Nothing else is swapped, so the
    // whole path from that one substitution to every reported observable is what gets graded.
    const state = config.planted ? partialSinglet(PLANT_T) : SINGLET;
    const corrM = (x, y) => correlatorMatrix(x, y, state);

    const blank = {
        chshExact: null, chshMatrix: null, chshMonteCarlo: null, violatesClassical: null,
        tsirelsonGap: null, classicalMargin: null,
        routeSpreadExact: null, routeSpreadMonteCarlo: null, correlatorAtProbe: null,
        lhvMax: null, lhvStrategies: null, sweepMax: null, sweepGap: null,
        planted: !!config.planted,
    };

    // The matrix route is the one that reads the STATE, so it is the device's spine: chshExact is the
    // closed-form singlet answer and does NOT know about the plant, which is exactly why comparing the two
    // is informative rather than circular.
    const S = chsh(c.a, c.ap, c.b, c.bp, corrM);
    const absS = Math.abs(S);

    if (mode === "routes") {
        const rng = mulberry32(c.seed);
        const mc = monteCarloCorrelator(c.probeA, c.probeB, c.samples, rng, state);
        const exactAtProbe = correlatorExact(c.probeA, c.probeB);
        const matrixAtProbe = corrM(c.probeA, c.probeB);
        return {
            ...blank,
            correlatorAtProbe: matrixAtProbe,
            routeSpreadExact: Math.abs(matrixAtProbe - exactAtProbe),
            routeSpreadMonteCarlo: Math.abs(mc - matrixAtProbe),
            chshMonteCarlo: Math.abs(chsh(c.a, c.ap, c.b, c.bp,
                (x, y) => monteCarloCorrelator(x, y, c.samples, rng, state))),
            tsirelsonGap: TSIRELSON_BOUND - absS,
        };
    }

    if (mode === "bounds") {
        const lhv = lhvBoundBySearch();
        const sweep = chshMaxByAngleSweep({ steps: c.sweepSteps, correlatorFn: corrM });
        return {
            ...blank,
            lhvMax: lhv.maxAbs,
            lhvStrategies: lhv.values.length,
            sweepMax: sweep.best,
            sweepGap: TSIRELSON_BOUND - sweep.best,
            tsirelsonGap: TSIRELSON_BOUND - absS,
        };
    }

    // "chsh" -- the headline, against both bounds
    return {
        ...blank,
        chshExact: Math.abs(chsh(c.a, c.ap, c.b, c.bp, correlatorExact)),
        chshMatrix: absS,
        // THE FLAG THE PLANT DOES NOT MOVE, kept precisely because it does not: a device graded on this alone
        // would pass a partially entangled state without complaint.
        violatesClassical: absS > CLASSICAL_BOUND,
        classicalMargin: absS - CLASSICAL_BOUND,
        tsirelsonGap: TSIRELSON_BOUND - absS,
    };
}


// v4000 -- *** ONE DECLARATION SITE FOR THE MODES, SO defaults() CAN REFUSE WHAT THE DEVICE DOES NOT OFFER. ***
// deviceModes-selfcheck's ratchet caught this device newly accepting ANY mode string: `mode: mode || "chsh"`
// echoes back whatever it is handed, and checkMode reads that echo as "the device offers this". A mode selects
// WHICH PHYSICS RUNS, so a device that accepts a name it does not declare runs something else and says nothing.
//
// The gate declined to fix it -- "making one validate means knowing WHICH modes it means to offer, and guessing
// that would declare an interface on somebody else's behalf" -- and that caution was right in general and
// unnecessary here: THE DEVICE ALREADY SAID. The list below was sitting inline in the device object all along,
// so nothing is being guessed; the two halves are simply being made to read from the same place.
export const BELL_MODES = ["chsh", "routes", "bounds"];

export const bellDevice = {
    // KNOB PLANT: the perturbation replaces the QUANTUM STATE upstream of every observable, so the whole path
    // from a wrong state to the reported numbers is graded -- plantedError's "perturb the physics, not the
    // number" in its ordinary form.
    plantKind: "knob",
    modes: BELL_MODES,
    name: "chsh-bell-inequality", observables: BELL_OBSERVABLES, build: buildBell,
    defaults: ({ mode } = {}) => ({ mode: BELL_MODES.includes(mode) ? mode : "chsh", config: { ...DEF } }),
};
