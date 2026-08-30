// tools/roundhouse/hmcBind.mjs
//
// v3287 -- HAMILTONIAN MONTE CARLO JOINS THE ROUNDHOUSE. Second promotion from the ungraded 78.
//
// physics/hmc/hmc.js was proven and graded by nothing. It qualifies for the same reason kuramoto did -- it
// already carries closed-form keys AND a named-wrong variant -- and it adds a kind of key the lab did not have:
// a STRUCTURAL invariant that is exact in floating point rather than statistical.
//
//   moments      E[q] = mu and Cov[q] = S are exact for the Gaussian target, so a chain can be graded against
//                theory. Statistical: converges as 1/sqrt(n), so the tolerance must respect the sample size.
//   jacobian     det(d(q',p')/d(q,p)) = 1 for leapfrog. EXACTLY one, not approximately -- symplectic integrators
//                preserve phase-space volume by construction. eulerStepWRONG gives 1.0599 at the same step size.
//                No sampling, no seed, no convergence argument: one number that is 1 or is not.
//   reversible   running L steps forward then negating momentum and running L back returns to the start, to
//                5.6e-17. Also structural.
//
// WHY THAT MATTERS FOR GRADING: the module's own header names the dangerous case -- a wrong GRADIENT with an
// exact accept step still samples correctly and only costs acceptance, while a wrong INTEGRATOR silently breaks
// detailed balance. The Jacobian test catches the second without needing a chain long enough for the first to
// show, which is why it is the headline observable here rather than the moments.

import {
    gaussian2D, sampleChain, leapfrog, eulerStepWRONG,
    reversibilityResidual, stepJacobianDet,
} from "../../physics/hmc/hmc.js";

export const HMC_OBSERVABLES = [
    "jacobianDet", "jacobianErr", "reversibilityResidual",
    "meanErr", "covErr", "acceptRate", "meanAbsDH", "samples",
];

const MU = [1, -2], S = [[2, 0.6], [0.6, 1]];
const DEF = { n: 4000, eps: 0.18, L: 12, seed: 7 };

function buildHmc({ mode = "moments", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const target = gaussian2D(MU, S);
    const integ = config.planted ? eulerStepWRONG : leapfrog;
    const q0 = [0.3, 0.4], p0 = [0.2, -0.1];

    if (mode === "symplectic") {
        // structural, exact, and independent of any chain
        const det = stepJacobianDet(integ, q0, p0, c.eps, target.gradU);
        return {
            jacobianDet: det, jacobianErr: Math.abs(det - 1),
            reversibilityResidual: reversibilityResidual(q0, p0, c.eps, c.L, target.gradU, integ),
            meanErr: null, covErr: null, acceptRate: null, meanAbsDH: null, samples: 0,
        };
    }

    const ch = sampleChain(target, c.n, { eps: c.eps, L: c.L, seed: c.seed });
    const meanErr = Math.max(Math.abs(ch.mean[0] - MU[0]), Math.abs(ch.mean[1] - MU[1]));
    const covErr = Math.max(
        Math.abs(ch.cov[0][0] - S[0][0]), Math.abs(ch.cov[0][1] - S[0][1]), Math.abs(ch.cov[1][1] - S[1][1]));
    return {
        jacobianDet: null, jacobianErr: null, reversibilityResidual: null,
        meanErr, covErr, acceptRate: ch.acceptRate, meanAbsDH: ch.meanAbsDH, samples: ch.samples.length,
    };
}

export const hmcDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4097 -- NAMED, THE SAME COMPLETION v3851/v4088-v4096 gave the rest of this family. The plant reaches
    // `symplectic` only -- `moments` calls sampleChain without ever passing the integrator, so config.planted
    // is dead there by design (probeLiveness confirms: symplectic 3/4 moved, moments 0/5). MEASURED, symplectic
    // mode both arms: jacobianErr 2.32e-11 -> 0.0599, reversibilityResidual 5.55e-17 -> 1.590 -- matching the
    // header's own quoted 1.0599 and 5.6e-17 exactly.
    planted: { knob: "planted", observable: "jacobianErr",
               note: "eulerStepWRONG replaces leapfrog: a non-symplectic integrator does not preserve phase-space volume, so det(d(q',p')/d(q,p)) drifts off its exact 1 -- structural, not statistical, and needs no chain to show" },
    modes: ["moments", "symplectic"],
    name: "hamiltonian-monte-carlo", observables: HMC_OBSERVABLES, build: buildHmc,
    defaults: ({ mode } = {}) => ({ mode: mode || "moments", config: { ...DEF } }),
};
