// tools/roundhouse/kineticsBind.mjs
//
// v3984 -- THE REACTOR KINETICS DEVICE. Round 2 of the reactor build: v3983 shipped the physics and its gate,
// this hands it to the roundhouse so it is swept and adjudicated alongside the other 108 devices (109 with it).
//
// MODES:
//   "period"   the two-route key: the inhour equation solved by bracketed bisection against RK4 integration of
//              the same seven ODEs, with the asymptotic rate MEASURED from the log-slope. No shared line.
//   "scram"    the EXTERNAL key: a reactor cannot be shut down faster than its longest-lived precursor, so
//              however deep the scram the rate approaches -lambda_1 = -0.0124 and stops. A limit, with its
//              rate of approach, which is a stronger statement than a value.
//   "prompt"   the STRUCTURAL key: below prompt critical the period ignores the generation time; above it the
//              period is proportional to it. beta is located by that change in character and is never compared
//              against, so the threshold is recovered rather than asserted.
//
// ================================================================================================================
// *** THE PLANTED ERROR IS A MODELLING ASSUMPTION A COMPETENT PERSON WOULD ACTUALLY MAKE, NOT A TYPO. ***
// ================================================================================================================
//
// The plant is `gen = 0`: neglect the prompt neutron generation time beside the delayed groups. That is a REAL
// named approximation -- the prompt-jump approximation -- and it is defensible almost everywhere, which is
// exactly what makes it dangerous. Across the whole normal operating range it is wrong by under a third of one
// percent, BECAUSE below prompt critical the period genuinely does not depend on GEN. Every observable a device
// grading "is the period about right" would sample passes it.
//
// AND ABOVE PROMPT CRITICAL IT INVERTS THE PHYSICS. With gen = 0 the inhour curve's supremum is exactly beta, so
// rho >= beta has no root on the prompt branch at all. The solver then returns the next branch down, and the
// device reports that a reactor held at $2.00 -- twice prompt critical, a power excursion -- is DECAYING at
// -1.26e-2 per second. Measured, nominal against planted:
//
//     rho        nominal w        planted w        roots
//     $0.50      +1.74397e-1      +1.74907e-1      7 -> 6      <- 0.3% apart; invisible
//     $2.00      +3.25503e+2      -1.25894e-2      7 -> 5      <- sign inverted; a runaway reported as a shutdown
//
// It is the SEMF surface term's shape, which is the shape this lab keeps finding to be the useful one: plausible
// everywhere anybody samples, and fatal at the one limit nobody thinks to take.
//
// EVERY MODE CARRIES `rootCount`, and that is deliberate rather than decorative. plantedCoverage RUNS each
// device nominal against planted in every declared mode and counts a mode only if a FINITE NUMERIC observable
// actually moves -- a NaN is not a movement. The scram asymptote is the one place the plant is nearly harmless
// (w*gen is ~2e-7 against delayed terms of ~6e-3, so the floor barely shifts), so without a root count that mode
// would look uncovered while being perfectly well tested. The count moves 7 -> 6 everywhere and 7 -> 5 above
// prompt critical, because dropping the prompt term deletes the prompt branch itself.
"use strict";
import {
    KEEPIN_U235, GEN_LWR, totalBeta, fromDollars,
    inhourRoots, dominantRoot, period, measuredRate,
    genSensitivity, promptCriticalByAsymptote,
} from "../../physics/nuclear/kinetics.mjs";

export const KINETICS_OBSERVABLES = [
    "rootCount", "dominantRate", "periodSeconds", "inhourVsRk4",
    "scramRate", "asymptoteGap", "floorRespected", "approachMonotone",
    "genSensLow", "genSensHigh", "regimeSeparation", "betaRecovered", "betaRelErr",
    "planted",
];

// *** THE INTEGRATION PARAMETERS ARE NOT ADVERTISED AS KNOBS, AND THAT IS THE POINT OF v3436's LESSON. ***
// `t` and `dt` were in this table first. Driven across every mode they MOVED NOTHING: at t = 200, dt = 1e-3 the
// two routes already agree to 2.5e-14, so doubling the window or halving the step changes the only observable
// they touch by about 1e-12 -- float noise, not a response. That is precisely the defect nuclearBind's own
// comment records ("two knobs a caller could set that the device ignored"), and the sensitivity matrix would
// have found them the same way it found A and Z there. They are fixed constants below instead, chosen so the
// two routes meet at machine precision, and a caller is not offered control the observables cannot reflect.
const RK4_T = 200, RK4_DT = 1e-3;

const DEF = { dollars: 0.5, gen: GEN_LWR, scramDollars: -10, promptDollars: 2 };

function buildKinetics({ mode = "period", config = {} } = {}) {
    const c = { ...DEF, ...config };
    // THE PLANT, and it is one number: the generation time goes to zero. Nothing else is swapped, so the whole
    // path from that one assumption to every reported observable is what gets graded.
    const gen = config.planted ? 0 : c.gen;
    const groups = KEEPIN_U235;

    const blank = {
        rootCount: null, dominantRate: null, periodSeconds: null, inhourVsRk4: null,
        scramRate: null, asymptoteGap: null, floorRespected: null, approachMonotone: null,
        genSensLow: null, genSensHigh: null, regimeSeparation: null, betaRecovered: null, betaRelErr: null,
        planted: !!config.planted,
    };

    if (mode === "scram") {
        const l1 = groups.lambda[0];
        const deep = [-1, -5, c.scramDollars, -50, -200].map((d) => dominantRoot(fromDollars(d, groups), gen, groups));
        const gaps = deep.map((w) => Math.abs(w - (-l1)));
        return {
            ...blank,
            rootCount: inhourRoots(fromDollars(c.scramDollars, groups), gen, groups).length,
            scramRate: deep[2],
            asymptoteGap: gaps[2],
            // the floor is a fact about the world, not a tolerance: no scram may beat the slowest precursor
            floorRespected: deep.every((w) => w < 0 && w > -l1),
            approachMonotone: gaps.every((g, i, a) => i === 0 || g < a[i - 1]),
            dominantRate: deep[2],
        };
    }

    if (mode === "prompt") {
        const rhoHi = fromDollars(c.promptDollars, groups);
        const lo = genSensitivity(fromDollars(0.5, groups), groups, gen);
        const hi = genSensitivity(rhoHi, groups, gen);
        const B = totalBeta(groups);
        const est = promptCriticalByAsymptote(rhoHi, gen, groups);
        return {
            ...blank,
            rootCount: inhourRoots(rhoHi, gen, groups).length,
            dominantRate: dominantRoot(rhoHi, gen, groups),
            genSensLow: lo, genSensHigh: hi,
            regimeSeparation: Number.isFinite(lo / hi) ? lo / hi : null,
            betaRecovered: est,
            betaRelErr: Math.abs(est - B) / B,
        };
    }

    // "period" -- the two routes, and they must not share a line
    const rho = fromDollars(c.dollars, groups);
    const wInhour = dominantRoot(rho, gen, groups);
    const wRk4 = measuredRate(rho, { t: RK4_T, dt: RK4_DT, gen: gen || GEN_LWR, groups });
    return {
        ...blank,
        rootCount: inhourRoots(rho, gen, groups).length,
        dominantRate: wInhour,
        periodSeconds: period(rho, gen, groups),
        // NOTE the RK4 arm keeps a real generation time even when planted: the plant is a claim about the
        // INHOUR ALGEBRA, and grading it against an integration that had been given the same wrong assumption
        // would be grading it against itself. The disagreement IS the finding.
        inhourVsRk4: Math.abs(wRk4 - wInhour) / Math.max(1e-300, Math.abs(wInhour)),
    };
}

export const kineticsDevice = {
    // KNOB PLANT: the perturbation replaces a physical constant upstream of every observable, so the whole path
    // from the wrong assumption to the reported number is graded -- plantedError's "perturb the physics, not the
    // number" in its ordinary form.
    plantKind: "knob",
    modes: ["period", "scram", "prompt"],
    name: "point-reactor-kinetics", observables: KINETICS_OBSERVABLES, build: buildKinetics,
    defaults: ({ mode } = {}) => ({ mode: mode || "period", config: { ...DEF } }),
};
