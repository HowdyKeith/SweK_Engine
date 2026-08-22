// tools/roundhouse/inferenceBind.mjs
//
// v3289 -- BAYESIAN PARAMETER RECOVERY JOINS THE ROUNDHOUSE. Fourth promotion, and the last easy one.
//
// THE RECIPE IS EXHAUSTED, and that is worth recording. The previous three promotions were selected the same
// way: an ungraded physics module carrying BOTH a closed-form key and an exported named-wrong variant. A sweep
// of the remaining ungraded set finds no more of those -- physics/hmc/inference.js is the last module with a
// real closed form, and it has no working planted error (see below). Future promotions will need a key built
// rather than found, which is a different and larger job.
//
// TWO KEYS OF DIFFERENT KINDS, which is what makes this module worth grading as its own device rather than
// folding into hmc:
//
//   EXACT       Bayesian linear regression with known noise is conjugate, so the posterior is Gaussian in closed
//               form: Sigma* = (X'X/s^2 + P0)^-1, mu* = Sigma* X'y/s^2. The chain must recover those moments.
//               Measured: max |chain mean - exact mu| = 0.0065 at n=3000.
//
//   CALIBRATION 90% credible intervals must contain the truth about 90% of the time across repeated datasets.
//               This is a different question from "did the sampler converge" and it catches a different failure:
//               UNDERSTATING THE NOISE produces beautiful, tight, plausible posteriors whose coverage collapses.
//               Measured: coverage 83.3% at the true sigma=0.5, falling to 36.7% at sigma=0.15 -- while the mean
//               interval WIDTH also falls, 0.052 to 0.016. Confidently wrong, and narrower while being wrong,
//               which is exactly the shape a moments check would pass.
//
// A DEFECT FOUND WHILE WIRING IT: the module's header states "sigmaWRONG is exported for exactly that
// measurement". sigmaWRONG APPEARS ONLY IN TWO COMMENTS -- it is never defined and never exported, and importing
// it yields undefined. The overconfidence case is reachable only by passing an explicit sigmaLik, which is what
// this device does. Reported in the gate rather than papered over.

import {
    linearPosteriorExact, linearTarget, posteriorChain, momentsOf, calibrationRun,
} from "../../physics/hmc/inference.js";

export const INFERENCE_OBSERVABLES = [
    "muErr", "sigmaErr", "acceptRate", "samples",
    "coverage", "meanWidth", "coverageUnderstated", "widthUnderstated", "repeats",
];

const DEF = { n: 3000, seed: 5, sigma: 0.5, tau: 3, nData: 30, repeats: 30 };

function makeData(c) {
    const ts = Array.from({ length: c.nData }, (_, i) => (i / (c.nData - 1)) * 4 - 2);
    let s = 42;
    const rng = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ys = ts.map((t) => 2 * t + 0.5 + c.sigma * (rng() * 2 - 1));
    return { ts, ys };
}

function buildInference({ mode = "posterior", config = {} } = {}) {
    const c = { ...DEF, ...config };

    if (mode === "calibration") {
        const good = calibrationRun({ repeats: c.repeats, sigma: c.sigma, nData: c.nData, seed: 3 });
        const bad = calibrationRun({ repeats: c.repeats, sigma: c.sigma, nData: c.nData, seed: 3, sigmaLik: c.sigma * 0.3 });
        return {
            muErr: null, sigmaErr: null, acceptRate: null, samples: 0,
            coverage: good.rate, meanWidth: good.meanWidth,
            coverageUnderstated: bad.rate, widthUnderstated: bad.meanWidth,
            repeats: c.repeats,
        };
    }

    // *** v3902 -- `overconfident` IS THE PLANT, AND THE HEADER ABOVE ALREADY WROTE IT DOWN AS A SENTENCE. ***
    // "UNDERSTATING THE NOISE produces beautiful, tight, plausible posteriors whose coverage collapses" -- and
    // the `calibration` mode MEASURES that already, coverage 83.3% falling to 36.7% while the interval width
    // also falls. THE CENSUS COULD NOT SEE ANY OF IT: those findings live in `coverage`/`coverageUnderstated`,
    // which are NULL in `posterior`, and the mode-plant contract needs one observable that is a finite number
    // in both arms. So the same defect is restated in `posterior`'s own shape.
    //
    // THE CHAIN IS SAMPLED AT AN UNDERSTATED SIGMA AND GRADED AGAINST THE EXACT POSTERIOR AT THE TRUE ONE --
    // the key never moves, which is what makes this a `knob` and not a moved goalpost. The same 0.3 factor
    // `calibration` uses, so the two modes are describing ONE defect at one strength.
    //
    // *** AND THE FILE ALREADY RECORDS THAT THE MODULE'S OWN PLANT DOES NOT EXIST: *** "sigmaWRONG is exported
    // for exactly that measurement" appears in the module's header, but sigmaWRONG "APPEARS ONLY IN TWO
    // COMMENTS -- it is never defined and never exported". The overconfidence case is reachable only by passing
    // an explicit sigmaLik. That is what this plant does, so the device now HAS the planted error the module
    // only claimed to export.
    const { ts, ys } = makeData(c);
    const sigLik = mode === "overconfident" ? c.sigma * 0.3 : c.sigma;
    const ex = linearPosteriorExact(ts, ys, c.sigma, c.tau);
    const ch = posteriorChain(linearTarget(ts, ys, sigLik, c.tau), ex.mu.slice(), { n: c.n, seed: c.seed });
    const m = momentsOf(ch.samples);
    const muErr = Math.max(...m.mean.map((v, i) => Math.abs(v - ex.mu[i])));
    const sigmaErr = Math.max(
        Math.abs(Math.sqrt(m.cov[0][0]) - Math.sqrt(ex.Sigma[0][0])),
        Math.abs(Math.sqrt(m.cov[1][1]) - Math.sqrt(ex.Sigma[1][1])));
    return {
        muErr, sigmaErr, acceptRate: ch.acceptRate, samples: ch.samples.length,
        coverage: null, meanWidth: null, coverageUnderstated: null, widthUnderstated: null, repeats: 0,
    };
}

export const INFERENCE_MODES = ["posterior", "calibration", "overconfident"];

export const inferenceDevice = {
    modes: INFERENCE_MODES,
    name: "bayesian-inference", observables: INFERENCE_OBSERVABLES, build: buildInference,
    // v3902 -- REFUSES an undeclared mode instead of handing the name back. The old line was
    // `mode: mode || "posterior"`, which returns ANY truthy name as though the device offered it -- the same
    // shape that kept `spatial` on deviceModes-selfcheck's UNGUARDED_BASELINE. NULL is beamBind's behaviour
    // and the one that gate calls correct.
    defaults: ({ mode } = {}) => {
        const m = mode ?? "posterior";
        return INFERENCE_MODES.includes(m) ? { mode: m, config: { ...DEF } } : null;
    },
    // `sigmaErr` 7.4704e-4 -> 6.3739e-2, the posterior WIDTH being what understating the noise corrupts.
    // *** AND `muErr` GETS BETTER UNDER THE PLANT: 6.4796e-3 -> 1.6527e-3, nearly four times closer. *** A
    // device graded on the recovered MEAN would report the overconfident sampler as the more accurate one --
    // which is the header's "confidently wrong" in one number, and the second device this round (geometry's
    // volume key was the other) whose obvious observable ENDORSES the defect rather than missing it.
    // `coverage` is NULL in `posterior`, so it cannot carry the declaration however well it describes this.
    plantMode: "overconfident", plantFlips: "sigmaErr", plantKind: "knob",
};
