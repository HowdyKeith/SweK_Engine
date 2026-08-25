// tools/roundhouse/lotkaVolterraBind.mjs
//
// v3994 -- THE PREDATOR-PREY DEVICE. physics/ecology/lotkaVolterra.mjs ships with this round; the bind hands it
// to the roundhouse so the ecology is swept and adjudicated beside the physics devices.
//
// MODES:
//   "cycle"       run the system and report whether the first integral stayed integral: the drift in each half
//                 of the run and the ratio between them, plus the measured period.
//   "average"     the TIME-AVERAGE THEOREM -- over whole cycles, <x> = gamma/delta and <y> = alpha/beta exactly,
//                 at any amplitude. Reported against the closed forms the integrator is never told.
//   "volterra"    VOLTERRA'S PRINCIPLE -- harvest both species and the average PREY population goes UP.
//   "integrators" all three steppers over the same run. Explicit Euler does not drift here, it DIES.
//
// ================================================================================================================
// *** THE PLANTED ERROR IS THE STANDARD TEXTBOOK REFINEMENT OF THIS VERY MODEL ***
// ================================================================================================================
//
// The plant adds a logistic self-limitation -sigma*x^2 to the prey equation: prey compete for finite grass. That
// is not a corrupted model, it is the MORE REALISTIC one, and it is in every ecology textbook. Which is exactly
// what makes it the right plant here -- correct ecology for a different model, the shape v3991's cylindrical
// Lane-Emden used.
//
// WHAT IT LEAVES ALONE, AND THIS IS THE PART WORTH READING:
//   the prey fixed point x* = gamma/delta is BIT-IDENTICAL -- sigma does not appear in it at all;
//   the predator fixed point moves only 2.75 -> 2.70, and the planted run's own average matches that shifted
//     value, so the system is SELF-CONSISTENT rather than visibly broken;
//   the period shifts 0.933%, which is what a real observer writes off as parameter uncertainty;
//   *** and the TIME-AVERAGE THEOREM -- the best key this module has -- CONVERGES BACK ONTO THE PLANTED SYSTEM
//     THE LONGER YOU RUN: relative error 3.0e-3 at 20 cycles, 6.9e-4 at 100, 1.7e-4 at 400. The spiral settles
//     onto the very point the average is supposed to equal, so a longer run HIDES the plant better. ***
//
// WHAT IT DESTROYS: the closed orbit. The first integral stops being integral (3.46e-4 -> 3.76e-2, 109x) and the
// prey amplitude collapses (last cycle over first: 1.0000030 nominal against 4.24e-3 planted, 236x).
//
// EVERY MODE REPORTS `firstIntegralDrift` AND `amplitudeRatio`, deliberately rather than decoratively.
// plantedCoverage RUNS each device nominal against planted in every declared mode and counts a mode only if a
// FINITE NUMERIC observable moves. Those two are the quantities the plant always shifts -- and the mode-specific
// observables above are precisely the ones it does NOT, which is the device's whole content.
//
// *** AND NEITHER DETECTOR IS READABLE WITHOUT AN INTEGRATOR KNOWN NOT TO DAMP. *** A decaying oscillation is
// what a dissipative method produces on the honest model, so "the populations settled down" means nothing until
// the method is ruled out. The symplectic-in-log stepper's drift ratio is 1.000 at 50, 200, 800 and 3200 cycles
// alike, which is what licenses reading a decay as the MODEL. That is v3993's kepler result being SPENT here
// rather than restated.
"use strict";
import {
    DEFAULTS, fixedPoint, smallOscillationPeriod, INTEGRATORS,
    integrate, timeAverages, volterraPrinciple, amplitudeDecay, PLANT_SIGMA,
} from "../../physics/ecology/lotkaVolterra.mjs";
// v4000 -- THE SHARED CRITERION, IMPORTED RATHER THAN RE-DECLARED.
//
// *** conservationReach-selfcheck WENT RED ONE ROUND AFTER v3994 SHIPPED, AND IT WAS RIGHT. *** That gate
// counts binds which compute a first-half-versus-second-half comparison BY HAND, and asserts each one imports
// the shared module so the two answers are compared every run rather than merely coexisting. keplerBind has
// been wired since v3526. v3994 wrote the same algorithm again, here, and the count went from ONE to TWO --
// the exact shape v3525 was built to find, found in the round after it was created rather than 500 versions
// later, which is the whole value of a gate that counts instead of naming.
//
// The hand-rolled fields are FROZEN IN THE BASELINE and do not move. This is a second opinion beside them.
import { auditConservation } from "./conservation.mjs";

export const LOTKA_VOLTERRA_OBSERVABLES = [
    "firstIntegralDrift", "amplitudeRatio",
    // the shared module's verdict on the same orbit, beside the hand-rolled one rather than instead of it
    // firstIntegralSeries is the ARRAY itself, declared because v3520 taught the baseline to keep arrays and
    // conservationReach can only ask its question of a series that survives the bind uncollapsed.
    "firstIntegralSeries",
    "firstIntegralGrowthShared", "firstIntegralVerdictBounded", "firstIntegralSamples", "growthGapFrac",
    "driftGrowthRatio", "driftFirstHalf", "measuredPeriod", "theoryPeriod", "periodErrFrac",
    "cyclesCompleted", "blewUpAtCycle",
    "meanPrey", "meanPredator", "exactPrey", "exactPredator", "meanPreyErr", "meanPredatorErr",
    "harvest", "preyBefore", "preyAfter", "predatorBefore", "predatorAfter", "preyFactor", "predatorFactor",
    "eulerBlewUpAtCycle", "symplecticDrift", "rk4Drift", "symplecticRatio", "rk4Ratio", "accuracyGap",
    "planted",
];

// The default amplitude. 1.5x equilibrium is a big, visible orbit -- and DELIBERATELY not a small one, because
// the time-average theorem is exact at ANY amplitude and a device that only ever ran near the fixed point would
// be testing the linearisation instead of the theorem.
const DEF = { alpha: 1.1, beta: 0.4, gamma: 0.4, delta: 0.1, amplitude: 1.5, cycles: 60, stepsPerCycle: 400, harvest: 0.2 };

const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function lotkaVolterraDefaults(hyp) {
    const h = { mode: "cycle", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    // Every rate must be strictly positive or the system is not a predator-prey cycle at all.
    for (const k of ["alpha", "beta", "gamma", "delta"]) c[k] = Math.min(50, Math.max(1e-3, num(c[k], DEF[k])));
    c.amplitude = Math.min(6, Math.max(1.001, num(c.amplitude, DEF.amplitude)));
    c.cycles = Math.min(600, Math.max(6, num(c.cycles, DEF.cycles) | 0));
    c.stepsPerCycle = Math.min(4000, Math.max(50, num(c.stepsPerCycle, DEF.stepsPerCycle) | 0));
    // *** THE HARVEST IS CLAMPED BELOW alpha AND NOT AT SOME ROUND NUMBER. *** Past the prey growth rate the
    // system collapses and there is no cycle left to average, so volterraPrinciple throws. Clamping to a
    // fraction of alpha keeps the mode meaningful for every parameter set rather than only the default one.
    c.harvest = Math.min(0.9 * c.alpha, Math.max(0, num(c.harvest, DEF.harvest)));
    h.config = c;
    if (!LOTKA_VOLTERRA_MODES.includes(h.mode)) h.mode = "cycle";
    return h;
}

export const LOTKA_VOLTERRA_MODES = ["cycle", "average", "volterra", "integrators"];

export async function buildLotkaVolterra(hyp, base = {}) {
    const h = lotkaVolterraDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    const planted = !!c.planted;
    const sigma = planted ? PLANT_SIGMA : 0;
    const p = { alpha: c.alpha, beta: c.beta, gamma: c.gamma, delta: c.delta };
    const fp = fixedPoint(p);
    const runOpts = { p, x0: fp.x * c.amplitude, y0: fp.y, integrator: "symplectic",
                      stepsPerCycle: c.stepsPerCycle, cycles: c.cycles, sigma };

    // THE TWO OBSERVABLES EVERY MODE OWES. Both are properties of the ORBIT rather than of any one mode's
    // question, and both are what the plant moves -- so every declared mode is gradeable.
    const base_ = integrate(runOpts);
    const amp = amplitudeDecay(runOpts);
    // *** THE SAME QUESTION ASKED BY THE SHARED MODULE, BESIDE THE HAND-ROLLED ANSWER. *** growthGapFrac is
    // THE COST OF SAMPLING, measured: the shared verdict reads 64 samples of the FIRST INTEGRAL while
    // driftGrowthRatio reads every one of ~24,000 steps of its ERROR, so the two are not the same measurement
    // and the gap says by how much (symplectic: hand 1.000 against shared 0.963).
    //
    // AND ON explicit Euler THE SHARED VERDICT IS STRICTLY MORE INFORMATIVE, which is worth stating because it
    // was not the expected result. driftGrowthRatio is NaN there on purpose -- the v3993 saturation trap, where
    // a run that dies in the first half scores a perfect 0.000 -- while auditConservation reads the 29 samples
    // that did happen and returns `secular 18.63`. The guard that had to blank one field does not blank the other.
    const audit = auditConservation(base_.firstIntegralSeries || []);
    const sharedGrowth = Number.isFinite(audit.growth) ? audit.growth : -1;
    const handGrowth = base_.driftGrowthRatio;
    const blank = {
        firstIntegralDrift: base_.driftSecondHalf,
        amplitudeRatio: amp.ratio === null ? -1 : amp.ratio,
        firstIntegralSeries: base_.firstIntegralSeries || [],
        firstIntegralGrowthShared: sharedGrowth,
        firstIntegralVerdictBounded: audit.verdict === "bounded" || audit.verdict === "exact" ? 1 : 0,
        firstIntegralSamples: (base_.firstIntegralSeries || []).length,
        growthGapFrac: (Number.isFinite(handGrowth) && handGrowth > 0 && sharedGrowth > 0)
            ? Math.abs(sharedGrowth - handGrowth) / handGrowth : -1,
        planted,
    };

    if (h.mode === "average") {
        // *** WHOLE CYCLES ONLY. *** The theorem is exact over a closed orbit and merely approximate over any
        // other interval; timeAverages trims to the first and last detected crossing for that reason.
        const m = timeAverages(runOpts);
        return {
            ...blank,
            meanPrey: m.meanX, meanPredator: m.meanY,
            exactPrey: fp.x, exactPredator: fp.y,
            meanPreyErr: m.errX, meanPredatorErr: m.errY,
            cyclesCompleted: m.cycles,
        };
    }

    if (h.mode === "volterra") {
        // Harvesting BOTH species at rate h: alpha -> alpha-h, gamma -> gamma+h. The predicted averages come
        // from the time-average theorem on the harvested parameters, and `measured` integrates them -- so the
        // counterintuitive direction is a MEASUREMENT and not the algebra restated.
        // sigma is threaded so a planted run is planted THROUGHOUT this mode rather than reporting a planted
        // drift beside an honest harvest. The predicted direction does not move -- gamma/delta carries no sigma
        // -- so VOLTERRA'S PRINCIPLE SURVIVES THE LOGISTIC REFINEMENT, which is a real result and not a gap.
        const v = volterraPrinciple({ p, harvest: c.harvest, stepsPerCycle: c.stepsPerCycle,
                                      cycles: Math.min(60, c.cycles), sigma });
        return {
            ...blank,
            harvest: c.harvest,
            preyBefore: v.before.x, preyAfter: v.after.x,
            predatorBefore: v.before.y, predatorAfter: v.after.y,
            preyFactor: v.preyFactor, predatorFactor: v.predatorFactor,
            meanPrey: v.measured.x, meanPredator: v.measured.y,
            meanPreyErr: v.measuredErrX, meanPredatorErr: v.measuredErrY,
        };
    }

    if (h.mode === "integrators") {
        const runs = {};
        for (const k of Object.keys(INTEGRATORS)) runs[k] = integrate({ ...runOpts, integrator: k });
        return {
            ...blank,
            eulerBlewUpAtCycle: runs.euler.blewUpAtCycle === null ? -1 : runs.euler.blewUpAtCycle,
            symplecticDrift: runs.symplectic.driftSecondHalf, rk4Drift: runs.rk4.driftSecondHalf,
            symplecticRatio: runs.symplectic.driftGrowthRatio, rk4Ratio: runs.rk4.driftGrowthRatio,
            // *** REPORTED AS A GAP AND NOT AS A WINNER. *** RK4 is eight orders more accurate here and drifts
            // secularly; symplectic is bounded forever and coarse. Which one is right depends entirely on the
            // run length, so the device reports the ratio and declines to rank them.
            accuracyGap: runs.symplectic.driftSecondHalf / Math.max(1e-300, runs.rk4.driftSecondHalf),
        };
    }

    // "cycle" -- did the first integral stay integral, and what period did the orbit actually have?
    return {
        ...blank,
        driftGrowthRatio: Number.isNaN(base_.driftGrowthRatio) ? -1 : base_.driftGrowthRatio,
        driftFirstHalf: base_.driftFirstHalf,
        measuredPeriod: base_.measuredPeriod, theoryPeriod: smallOscillationPeriod(p),
        // *** periodErrFrac IS NOT AN ERROR AT THIS AMPLITUDE AND THE NAME IS KEPT HONEST BY THE MODULE'S OWN
        // HEADER. *** The closed form is the SMALL-oscillation limit; the real period grows with the orbit
        // (1.0108x at 1.5x equilibrium, 1.1047x at 3x). So this field measures the NONLINEARITY, not a defect,
        // and a sweep that drives `amplitude` should see it move for exactly that reason.
        periodErrFrac: base_.periodErrFrac,
        cyclesCompleted: base_.cyclesCompleted,
        blewUpAtCycle: base_.blewUpAtCycle === null ? -1 : base_.blewUpAtCycle,
    };
}

export const lotkaVolterraDevice = {
    // KNOB PLANT: sigma perturbs the MODEL upstream of every observable, so the whole path from a different
    // ecology to the reported numbers is graded -- not a number nudged at the end.
    plantKind: "knob",
    modes: LOTKA_VOLTERRA_MODES,
    name: "lotka-volterra-predator-prey",
    observables: LOTKA_VOLTERRA_OBSERVABLES,
    build: buildLotkaVolterra,
    defaults: lotkaVolterraDefaults,
};
