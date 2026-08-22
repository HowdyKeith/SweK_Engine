// WebGLEngine/physics/diffusionKnob.mjs -- v3598
// ---------------------------------------------------------------------------------------------------------------
// THE LAST CANDIDATE LAB SCENE, AND ITS TRAJECTORY ROUTE IS A MIRROR TOO -- UNLESS IT IS READ STATISTICALLY.
//
// The triage row already named the easy trap: composing kelvinOfWarmth(warmthOfKelvin(T)) returns T to 5.7e-14
// because they are a forward and an inverse of one formula, so an adjudicator on the exposed pair would pass
// everything. MEASURED HERE AT 300 K: 300.00000000000006. A control that cannot fail.
//
// It also named the cure -- go through the trajectory, recover D from the MSD of the simulated wander and THEN
// invert -- and physics/blobKelvin.js CANNOT DO THAT, because it contains no simulation at all: four pure
// functions, forward and inverse of Stokes-Einstein, and nothing that moves. The wander lives in
// strictGaussian.js's strictJitterCentres, which IS a module export, so the round trip can be built from
// modules rather than from physics-lab.html's inline copy.
//
// *** AND THE TRAJECTORY ROUTE, RUN ON ONE SEED, IS ALSO A MIRROR. ***
//
// Measured: the recovered temperature's relative error is 2.53e-2 at 260 K, at 300 K, at 340 K AND at 373 K --
// IDENTICAL TO THREE DIGITS AT EVERY TEMPERATURE. The reason is structural rather than a coincidence: the
// Brownian step is sigma = sqrt(2 D dt) applied to a FIXED random stream, so the MSD scales exactly with D and
// Dhat/D is a pure function of the seed. Recovering T then returns (a seed-dependent constant) x T, and
// comparing it against the commanded T tests only that one random sample happened to land near 1. THE WANDER
// IS SIMULATED AND STILL TELLS YOU NOTHING ABOUT THE TEMPERATURE. Third round running where the proposed key
// failed for a different reason: v3596 both routes aliased, v3597 the model was not in the module, and here
// the trajectory reproduces its own input.
//
// *** AND THE SINGLE-SEED ERROR DOES NOT CONVERGE, WHICH IS THE OTHER HALF: *** 2.53e-2 / 7.79e-2 / 2.19e-3 /
// 1.91e-2 across N = 7, 70, 700, 7000 particles -- NON-MONOTONE, no 1/sqrt(n). v3512's ising.L exactly: a
// beautiful-looking estimate whose error does not follow the sample size is noise, and registering on the
// good value would have been a promotion that was real in the register and false in the world.
//
// SO THE KEY IS THE SPREAD, NOT THE VALUE -- v3513's rule for a stochastic device, and the first time it has
// been the ONLY available reading rather than a refinement. Over a seed ensemble the MEAN recovered
// temperature converges on the commanded one and the SPREAD shrinks with the sample: relative spread
// 2.34e-1 / 1.74e-1 / 6.65e-2 / 2.69e-2 at n = 840 / 13440 / 53760 / 215040 samples.
//
// *** THE REFUSAL IS DERIVED FROM THE SLIDER ITSELF AND NEEDS NO CHOSEN CONSTANT: AN ESTIMATOR WHOSE SPREAD
// EXCEEDS THE KNOB'S OWN HALF-RANGE CANNOT TELL ONE END OF THE SLIDER FROM THE OTHER. *** tempK spans
// 250-373 K, a fractional half-range of 0.1974 about its midpoint. At the SHIPPED fixture -- 7 centres and a
// 120-frame ring, n = 840 -- the spread is 2.34e-1, WIDER THAN THE SLIDER. So the scene as shipped cannot
// resolve its own knob, which is a fact about the fixture and not about the physics, and it is reported that
// way rather than dressed as a failed device.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { strictJitterCentres } from "./strictGaussian.js";
import { warmthOfKelvin, kelvinOfWarmth, SCENARIOS } from "./blobKelvin.js";
import { lcg } from "./blobThermal.js";

export const SCEN = SCENARIOS.bacterium;
export const DT = 1 / 60;
export const SEED0 = 20260715;
// The tempK slider as physics-lab.html declares it. The half-range is what a knob search must be able to
// resolve, and it is READ FROM THE SCENE rather than chosen here.
export const KNOB = { min: 250, max: 373 };
export const knobHalfRange = () => (KNOB.max - KNOB.min) / (KNOB.max + KNOB.min);
// THE SHIPPED FIXTURE, for the record: seven centres and a 120-frame ring buffer.
export const SHIPPED = { N: 7, steps: 120 };
// A convention, NOT a measurement, and said so: three standard errors of the mean. Nothing here was tuned
// until it passed -- the bar moves with the measured spread and the seed count, not with the verdict.
export const SIGMA_BAR = 3;

/** ONE SEED: commanded T -> D -> simulated wander -> MSD -> Dhat -> That. Never composes the algebra pair. */
export function recoverOnce(T, { N = SHIPPED.N, steps = SHIPPED.steps, seed = SEED0, dt = DT } = {}) {
    const D = warmthOfKelvin(T, SCEN), rnd = lcg(seed), c = [];
    for (let i = 0; i < N; i++) c.push({ x: 0, y: 0, z: 0 });
    for (let s = 0; s < steps; s++) strictJitterCentres(c, { D, dt, rnd });
    let msd = 0;
    for (const b of c) msd += b.x * b.x + b.y * b.y + b.z * b.z;
    msd /= N;                                   // <r^2> = 6 D t in three dimensions
    const Dhat = msd / (6 * steps * dt);
    return { D, Dhat, That: kelvinOfWarmth(Dhat, SCEN), samples: N * steps };
}

/** THE ENSEMBLE, which is the only honest reading. */
export function seedEnsemble(T, o = {}) {
    const M = o.seeds ?? 16;
    const v = [];
    for (let m = 0; m < M; m++) v.push(recoverOnce(T, { ...o, seed: SEED0 + m * 7919 }).That);
    const mean = v.reduce((a, b) => a + b, 0) / M;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (M - 1));
    return { M, mean, sd, rel: sd / mean, stderr: sd / Math.sqrt(M),
             samples: (o.N ?? SHIPPED.N) * (o.steps ?? SHIPPED.steps) };
}

/**
 * *** THE PROOF THAT ONE SEED IS A MIRROR, AS A CALLABLE ROUTINE RATHER THAN A CLAIM IN A COMMENT. ***
 * The single-seed ratio That/T is the same number at every temperature, because sigma scales the same random
 * stream. Returns the spread of that ratio across the slider -- which is ZERO to rounding when it is a mirror.
 */
export function singleSeedRatioSpread(temps = [260, 300, 340, 373], o = {}) {
    const rs = temps.map((T) => recoverOnce(T, o).That / T);
    return { ratios: rs, spread: Math.max(...rs) - Math.min(...rs) };
}

/**
 * *** THE ENSEMBLE IS A MIRROR TOO, AND THAT IS WHY THIS FILE REGISTERS NOTHING. ***
 * Averaging over seeds does not rescue it. Measured: mean/T is 0.880446437 at n = 840, 1.047902948 at
 * n = 53760 and 0.986012509 at n = 215040 -- AND AT EACH SAMPLE SIZE IT IS THE SAME NUMBER AT 250 K, 300 K
 * AND 373 K, to 2.22e-16. So the ensemble mean is (a sample-dependent constant) x T at every size, and the
 * "commanded vs measured" readout can only ever report the ESTIMATOR'S BIAS. It is structurally incapable of
 * being wrong about the temperature, which is the definition of a control that cannot fail.
 */
export function ensembleRatioSpread(temps = [250, 300, 373], o = {}) {
    const rs = temps.map((T) => seedEnsemble(T, o).mean / T);
    return { ratios: rs, spread: Math.max(...rs) - Math.min(...rs) };
}

/**
 * *** THE REFUSAL, AND IT IS STRUCTURAL RATHER THAN STATISTICAL -- WHICH IS NOT WHAT THIS ROUND SET OUT TO
 * FIND. *** The plan was v3513's rule: for a stochastic device the test is the SEED SPREAD rather than the
 * value. The spread does behave (2.34e-1 at n = 840 down to 2.69e-2 at n = 215040), and it buys nothing,
 * because D CANCELS OUT OF THE ROUND TRIP ENTIRELY. Commanded T sets D, D scales sigma, sigma scales a fixed
 * random stream, the MSD scales with D exactly, and inverting returns D back. NO SAMPLE SIZE FIXES THAT --
 * more samples only make the multiplicative constant closer to 1, which is a statement about the estimator
 * and never about the physics.
 *
 * SO THE SCENE IS REFUSED, AND THE PRECEDENT IS orbit AT v3588: attempted, measured, WITHDRAWN, with the
 * measurement kept. A REAL KEY POINTED AT THE WRONG PARAMETER. What would make it askable is named rather
 * than hand-waved: the wander would have to be driven by something the temperature does NOT simply scale --
 * a thermostat with a target kinetic energy, a drag whose fluctuation and dissipation are separately
 * parameterised, or a trap the diffusion has to climb. This tree HAS such a device already: blobkelvin and
 * blobthermal are graded, and the boiling-point key there (373.14999963 against 373.15 K) is external in a
 * way this round trip cannot be.
 *
 * ANTIDOTE, IN ADVANCE (v3196): if somebody gives the scene a fluctuation-dissipation pair that does not
 * cancel, THIS EXPORT GOES STALE AND THE REFUSAL SHOULD BE REPLACED BY AN ADJUDICATOR -- not weakened, and
 * not deleted while leaving the row a candidate.
 */
export const REFUSED = {
    scene: "diffusion", knob: "tempK", verdict: "refused",
    why: "THE ROUND TRIP CANNOT BE WRONG ABOUT THE TEMPERATURE. D cancels: T sets D, D scales sigma, sigma " +
         "scales a fixed random stream, the MSD scales with D, and inverting returns D. That/T is one number " +
         "for the whole slider -- 1.025347 at every temperature, spread 4.44e-16 on a single seed and " +
         "2.22e-16 on a 16-seed ensemble.",
    notStatistical: "This is NOT the small-sample problem the round expected. The seed spread behaves " +
         "(2.34e-1 -> 2.69e-2 over 256x the samples); it simply does not help, because the quantity it is " +
         "the spread OF carries no temperature information at any size.",
    whatWouldMakeItAskable: "a wander the temperature does not merely SCALE -- a thermostat with a target " +
         "kinetic energy, a separately parameterised fluctuation-dissipation pair, or a trap to climb.",
    alsoRecorded: "the shipped fixture (7 centres, a 120-frame ring, n = 840) has a seed spread of 2.34e-1 " +
         "against a tempK half-range of 0.1974 -- WIDER THAN THE SLIDER -- so even a sound key could not " +
         "have been resolved there. TWO INDEPENDENT REASONS, and only the first is fatal.",
};

export const MEASURED_V3598 = {
    theAlgebraIsAControlThatCannotFail:
        "kelvinOfWarmth(warmthOfKelvin(300)) = 300.00000000000006. Forward and inverse of one formula.",
    theTrajectoryOnOneSEEDisAlsoAMirror:
        "*** relative error 2.53e-2 at 260, 300, 340 AND 373 K -- IDENTICAL TO THREE DIGITS. *** sigma = " +
        "sqrt(2 D dt) scales a FIXED random stream, so the MSD scales exactly with D and Dhat/D is a pure " +
        "function of the seed. The wander is simulated and carries no information about the temperature.",
    theSingleSeedErrorDoesNotConverge:
        "2.53e-2 / 7.79e-2 / 2.19e-3 / 1.91e-2 at N = 7 / 70 / 700 / 7000 -- NON-MONOTONE. v3512's ising.L: " +
        "an estimate whose error does not follow the sample size is noise.",
    theEnsembleDoes:
        "relative seed spread 2.34e-1 / 1.74e-1 / 6.65e-2 / 2.69e-2 at n = 840 / 13440 / 53760 / 215040 " +
        "samples over 16 seeds, and the mean walks 264.1 / 299.5 / 314.4 / 295.8 K toward a commanded 300.",
    theShippedFixtureCannotResolveItsOwnKnob:
        "*** at the shipped 7 centres and 120-frame ring the spread is 2.34e-1 against a knob half-range of " +
        "0.1974 -- WIDER THAN THE SLIDER. *** Every temperature is inside every other's error bar. A fact " +
        "about the fixture, reported rather than dressed up as a failed device.",
};

export function reportLines() {
    const L = [];
    L.push("[diffusionKnob] the temperature knob: ATTEMPTED, MEASURED, REFUSED");
    L.push("");
    const one = singleSeedRatioSpread();
    L.push("  single seed   That/T across 260..373 K: " + one.ratios.map((r) => r.toFixed(9)).join("  "));
    L.push("                spread " + one.spread.toExponential(2));
    const ens = ensembleRatioSpread([250, 300, 373], { N: 7, steps: 120, seeds: 16 });
    L.push("  16 seeds      mean/T across 250..373 K: " + ens.ratios.map((r) => r.toFixed(9)).join("  "));
    L.push("                spread " + ens.spread.toExponential(2));
    L.push("");
    L.push("  *** ONE NUMBER FOR THE WHOLE SLIDER: the round trip cannot be wrong about the temperature. ***");
    L.push("  " + REFUSED.why.slice(0, 96));
    const e = seedEnsemble(300, { N: SHIPPED.N, steps: SHIPPED.steps, seeds: 16 });
    L.push("");
    L.push("  and separately, the shipped fixture: spread " + e.rel.toExponential(3) +
           " against a knob half-range of " + knobHalfRange().toFixed(4) + " -- wider than the slider");
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of reportLines()) console.log(l);
    process.exit(0);
}
