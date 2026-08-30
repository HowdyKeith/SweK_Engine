// WebGLEngine/tools/roundhouse/crystallizeBind.mjs -- v3621
//
// THE CRYSTALLIZE DEVICE, LAST OF KEITH'S FIVE PHASE CHANGES. Three modes, and the third is the reason the
// other two can be believed.
//
//   "exponent"       -- the Avrami exponent recovered from a voxel lattice, against a prediction that comes
//                       from COUNTING DIMENSIONS: 3 site-saturated, 4 with continuous nucleation.
//   "spread"         -- the seed ensemble ON ITS OWN. Exposed as a mode rather than buried inside the claim,
//                       because ising.L is this lab's standing example of a beautiful convergence that is
//                       noise and it was measured in the wrong order.
//   "discrimination" -- the two put together: the effect over the noise, AND the population margin, which is
//                       the tighter and more honest of the two numbers.
//
// A DEVICE THAT COULD ONLY REPORT ITS EXPONENT WOULD BE THE ising.L SHAPE WITH A FRONT DOOR.
//
// *** v3721 -- THE PLANT: DROP THE MINIMUM-IMAGE WRAPPING. phaseOps' own header warns about it ("without that,
// cells near a face are starved of nuclei and transform late for a reason that is geometry rather than
// kinetics"), which makes it the plausible wrong derivation this census wants. AND THE MEASUREMENT SAYS IT IS
// A WEAK PLANT, WHICH IS THE FINDING RATHER THAN A REASON TO PICK A DIFFERENT ONE:
//
//     site-saturated (predicted 3)   periodic 2.9629 sd 0.1447   ->   PLANTED 2.7361 sd 0.0735
//     continuous     (predicted 4)   periodic 3.9461 sd 0.3334   ->   PLANTED 3.5479 sd 0.2956
//
// The shift is 0.227 and 0.398 against per-seed spreads of 0.1447 and 0.3334 -- ABOUT 1.6 AND 1.2 PER-SEED
// SIGMA. A SINGLE SEED CANNOT TELL THE PLANTED LATTICE FROM AN UNLUCKY HONEST ONE. Over the six-seed ensemble
// the standard error is sd/sqrt(6), so the same shift is ~3.8 and ~1.5 STANDARD ERRORS: the MEAN separates the
// site-saturated case and only barely separates the continuous one.
//
// *** THAT IS THIS DEVICE'S OWN QUESTION AIMED AT ITS OWN PLANT. It exists because ising.L was nearly promoted
// on a trend SMALLER THAN ITS SEED NOISE, and its `spread` and `discrimination` modes are the answer. So the
// plant is declared against the ENSEMBLE, not the single-seed exponent, and the gate asserts BOTH HALVES: the
// mean moves by more than three standard errors AND a single seed does not reliably separate. A PLANT QUOTED
// AT ONE SEED WOULD HAVE BEEN THE ising.L MISTAKE WITH THE SIGN FLIPPED. ***
"use strict";
import {
    AVRAMI, MODE_GAP, transformTimes, fitExponent, seedEnsemble, discriminationPower, MEASURED_V3621,
} from "../../physics/thermal/crystallize.mjs";

export const CRYSTALLIZE_OBSERVABLES = [
    "exponent", "predicted", "exponentErr", "mean", "sd", "spreadMin", "spreadMax",
    "effectOverNoise", "populationMargin", "marginInSigma", "separated", "satMean", "conMean",
    // *** v4082 -- COMPLETED, THE SAME DEFECT v3850 FIXED IN THE OTHER FOUR THERMAL DEVICES AND MISSED HERE.
    // *** These keys were RETURNED BY THE BUILDER AND NEVER DECLARED: `kind` and `note` on every mode, plus
    // `mode` (the Avrami case label) and `fitPoints` on `exponent`, `continuous`/`ns`/`seeds` on `spread`, and
    // `gap`/`satSd`/`conSd`/`satErr`/`conErr` on `discrimination`. An undeclared observable is invisible to
    // every consumer that reads the list rather than the code, which is the whole reason the list exists.
    "kind", "mode", "fitPoints", "note", "continuous", "ns", "seeds", "gap", "satSd", "conSd", "satErr", "conErr",
];

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export function crystallizeDefaults(hyp = {}) {
    const h = { ...hyp }, c = { ...(h.config || {}) };
    // BOUNDED: cost is L^3 * nNuclei * seeds and this is reachable from a model's proposal.
    c.L = Math.min(48, Math.max(16, num(c.L, 32) | 0));
    c.nNuclei = Math.min(60, Math.max(4, num(c.nNuclei, 30) | 0));
    c.seeds = Math.min(6, Math.max(2, num(c.seeds, 4) | 0));
    c.continuous = !!c.continuous;
    if (!["exponent", "spread", "discrimination"].includes(h.mode)) h.mode = "exponent";
    h.config = c;
    return h;
}

const seedList = (n) => Array.from({ length: n }, (_, i) => i + 1);

function exponentRun(c) {
    const key = c.continuous ? "3d-continuous" : "3d-site-saturated";
    const predicted = AVRAMI[key].n;
    const fit = fitExponent(transformTimes({ L: c.L, nNuclei: c.nNuclei, periodic: !c.planted, seed: 1, continuous: c.continuous, tMax: 12 }));
    return {
        mode: key, predicted, exponent: fit.slope, exponentErr: Math.abs(fit.slope - predicted),
        fitPoints: fit.points,
        note: "ONE SEED. This number is NOT the answer on its own -- see the `spread` mode, which exists " +
            "because ising.L converged beautifully at its default seed and was flat over four.",
    };
}

function spreadRun(c) {
    const e = seedEnsemble({ L: c.L, nNuclei: c.nNuclei, periodic: !c.planted, continuous: c.continuous, tMax: 12, seeds: seedList(c.seeds) });
    return {
        continuous: c.continuous, mean: e.mean, sd: e.sd, spreadMin: e.min, spreadMax: e.max,
        ns: e.ns, seeds: e.seeds,
        note: "THE SPREAD IS THE MEASUREMENT, not a caveat on one. A zero spread here would mean the ensemble " +
            "is one run repeated and every ratio in `discrimination` is meaningless.",
    };
}

function discriminationRun(c) {
    // *** v4082 -- WAS MISSING periodic: !c.planted, THE ONE LINE exponentRun AND spreadRun BOTH CARRY.
    // *** probeLiveness builds every mode twice, `config: { planted: true }` on the second arm, and this
    // mode read 0 of 10 observables moved -- not because discrimination is plant-blind by design (nothing
    // in the header says so; the opposite: "the gate asserts BOTH HALVES") but because the flag never reached
    // discriminationPower. MEASURED once wired: satErr 0.038 -> 0.265, conErr 0.080 -> 0.469 (L=32, 4 seeds).
    const d = discriminationPower({ L: c.L, nNuclei: c.nNuclei, tMax: 12, seeds: seedList(c.seeds), periodic: !c.planted });
    const worstSd = Math.max(d.saturated.sd, d.continuous.sd);
    return {
        gap: MODE_GAP, satMean: d.saturated.mean, conMean: d.continuous.mean,
        satSd: d.saturated.sd, conSd: d.continuous.sd,
        effectOverNoise: d.effectOverNoise,
        populationMargin: d.populationMargin, marginInSigma: d.populationMargin / worstSd,
        separated: d.separated, satErr: d.satErr, conErr: d.conErr,
        note: "THE MEANS SEPARATE MORE COMFORTABLY THAN THE POPULATIONS DO, and the population margin is the " +
            "honest number: the ensemble discriminates the two nucleation modes, a single seed is not " +
            "comfortably clear of the wrong answer.",
    };
}

export function buildCrystallize(hyp, base = {}) {
    const h = crystallizeDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    if (h.mode === "spread") return { kind: "spread", ...spreadRun(h.config) };
    if (h.mode === "discrimination") return { kind: "discrimination", ...discriminationRun(h.config) };
    return { kind: "exponent", ...exponentRun(h.config) };
}

export const crystallizeDevice = {
    // WHAT THE PLANT OVERTURNS, as data. NOTE THE OBSERVABLE IS THE ENSEMBLE MEAN, NOT THE SINGLE-SEED
    // exponent: the shift is only ~1.6 per-seed sigma, so quoting one seed would be the ising.L mistake.
    // *** v3851 -- KNOB. `periodic` switches minimum-image distances off, so cells near a face see the
    // wrong neighbour set and transform late. That is a BOUNDARY CONDITION on the geometry -- a setup input
    // upstream of every observable -- and the Avrami fit that reads it is unchanged.
    plantKind: "knob",
    // *** v3851 -- `plantKind` IS THE TAXONOMY; `planted.knob` BELOW IS THE CONFIG KEY. Two different
    // things wearing one word, and gates read the second by name, so it is NOT renamed here. ***
    planted: { knob: "periodic", observable: "mean",
               note: "no minimum-image wrapping starves face cells of nuclei; site-saturated mean 2.9629 -> 2.7361, about 3.8 standard errors over six seeds but only 1.6 per-seed sigma" },
    modes: ["exponent", "spread", "discrimination"],
    name: "crystallize-avrami",
    observables: CRYSTALLIZE_OBSERVABLES,
    build: buildCrystallize,
    defaults: crystallizeDefaults,
    avrami: AVRAMI,
};
