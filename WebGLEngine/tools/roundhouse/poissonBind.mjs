// WebGLEngine/tools/roundhouse/poissonBind.mjs -- v3430
// ---------------------------------------------------------------------------------------------------------------
// POISSON BRACKETS AS A LAB DEVICE. Its own registry row: nothing shares the substrate, because nothing in the
// tree had a bracket in it at all.
//
// *** WHY IT EXISTS, MEASURED RATHER THAN ASSERTED: "symplectic" IS USED BY TWELVE MODULES UNDER physics/
// AND THE CONDITION IS RE-DERIVED IN EXACTLY ONE, hmc's 4x4 Jacobian determinant. *** My hand count was eleven
// and the walk says twelve; the gate re-derives it every run rather than trusting a list in a header. A property written down in eleven files
// where nothing recomputes it is this project's signature defect; the only new thing here is the subject.
//
// FIVE MODES, AND THEY ASK FOUR DIFFERENT QUESTIONS THAT ALL SOUND LIKE "IS THIS SYMPLECTIC":
//   canonical     -- does the bracket reproduce {q,p} = 1 and {q,q} = {p,p} = 0
//   jacobi        -- does the bracket satisfy the identity every bracket must
//   evolution     -- does {f,H} equal df/dt along the actual flow
//   preservation  -- does a MAP preserve brackets, which is what symplectic means
//   floor         -- and the one that stops preservation being read as a verdict
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { bracket, jacobi, symplecticDefect, H, verletStep, STEPPERS } from "../../physics/mechanics/poisson.mjs";

export const POISSON_MODES = ["canonical", "jacobi", "evolution", "preservation", "floor"];

const DEF = { q: 0.7, p: -0.3, eps: 1e-5, jacobiEps: 1e-3, dt: 0.1 };

export const POISSON_OBSERVABLES = [
    "qp", "qq", "pp", "antisymmetry", "canonicalErr",
    "jacobiSum", "jacobiEps",
    "bracketRate", "numericRate", "evolutionRelErr",
    "defects", "eulerOverDtSq", "verletDefect", "rk4Defect", "steppersSymplectic",
    "floorEstimate", "rk4FallsBelowFloor", "rk4AtCoarse", "rk4AtFine", "dtUsed",
    "planted",
];

const Q = (z) => z[0], P = (z) => z[1];
// Three arbitrary smooth functions for Jacobi. NOT canonical coordinates: the identity is trivial to satisfy on
// linear functions, so a fixture of q and p alone would be a check that passes because it does nothing.
const F = (z) => z[0] * z[0] + z[1], G = (z) => z[0] * z[1], K = (z) => z[1] * z[1] * z[1];

export function defaults({ mode = "canonical", config = {} } = {}) {
    if (!POISSON_MODES.includes(mode)) return null;      // a refusal, not a silent substitution
    return { mode, config: { ...DEF, ...config } };
}

export function build({ mode = "canonical", config = {} } = {}) {
    if (!POISSON_MODES.includes(mode)) throw new Error("poisson: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const z = [c.q, c.p], n = 1;
    const o = { eps: c.eps, dropSecond: !!c.planted };
    const blank = { planted: !!c.planted };

    if (mode === "canonical") {
        const qp = bracket(Q, P, z, n, o), qq = bracket(Q, Q, z, n, o), pp = bracket(P, P, z, n, o);
        return {
            ...blank, qp, qq, pp,
            // *** ANTISYMMETRY IS THE KEY HERE AND {q,p} IS NOT, WHICH IS THE OPPOSITE OF THE OBVIOUS CHOICE.
            // The planted bracket drops the second term, and that term VANISHES for the pair (q,p) -- so it
            // returns {q,p} = 1 to the same twelve digits as the true one and the canonical check cannot see
            // it at all. {q,p} + {p,q} is where it shows: exactly 0 against exactly 1. ***
            antisymmetry: qp + bracket(P, Q, z, n, o),
            canonicalErr: Math.max(Math.abs(qp - 1), Math.abs(qq), Math.abs(pp)),
        };
    }

    if (mode === "jacobi") {
        // A coarser eps deliberately: Jacobi nests a difference inside a difference, so the noise compounds and
        // 1e-5 would be measuring round-off rather than the identity. STATED, because a tolerance chosen to make
        // a number look good and one chosen from the method's structure are different things.
        return { ...blank, jacobiSum: jacobi(F, G, K, z, n, { ...o, eps: c.jacobiEps }), jacobiEps: c.jacobiEps };
    }

    if (mode === "evolution") {
        // *** THE BRACKET GENERATES TIME EVOLUTION: {f,H} = df/dt. *** Checked against the derivative taken
        // ALONG THE ACTUAL FLOW by stepping forward and back -- two routes, and the flow route knows nothing
        // about brackets.
        const dt = 1e-6;
        const rate = bracket(F, H, z, n, o);
        const fwd = verletStep(dt)(z), bwd = verletStep(-dt)(z);
        const numeric = (F(fwd) - F(bwd)) / (2 * dt);
        return { ...blank, bracketRate: rate, numericRate: numeric,
                 evolutionRelErr: Math.abs(rate - numeric) / Math.abs(numeric) };
    }

    if (mode === "preservation") {
        // *** THIS IS WHAT SYMPLECTIC MEANS, AND IT IS A DIFFERENT QUESTION FROM EVERY MODE ABOVE. *** A map is
        // symplectic exactly when M^T J M = J. The plant cannot reach this mode at all -- it perturbs the
        // BRACKET and this mode never calls one -- which is stated rather than hidden.
        const defects = {};
        for (const k of Object.keys(STEPPERS)) defects[k] = symplecticDefect(STEPPERS[k](c.dt), z);
        return {
            ...blank, defects, dtUsed: c.dt,
            verletDefect: defects.verlet, rk4Defect: defects.rk4,
            // EXPLICIT EULER'S DEFECT IS EXACTLY dt^2 ON THIS HAMILTONIAN -- its map is [[1,dt],[-dt,1]] and the
            // determinant is 1 + dt^2. A PREDICTED VALUE, not a tolerance.
            eulerOverDtSq: defects.euler / (c.dt * c.dt),
            steppersSymplectic: Object.keys(STEPPERS).filter((k) => defects[k] < 1e-9).sort(),
        };
    }

    // floor -- *** THE MODE THAT STOPS `preservation` BEING READ AS A VERDICT. ***
    // RK4 is NOT symplectic and its defect falls roughly two orders per halving of dt, so BELOW SOME dt IT
    // SINKS UNDER THE CENTRAL-DIFFERENCE FLOOR AND BECOMES INDISTINGUISHABLE FROM VERLET. A preservation check
    // run at one small dt would certify RK4 as symplectic. The discriminator is not the value, it is THE
    // SCALING: Euler's defect is dt^2 and visible at every step size, RK4's vanishes into the noise.
    const coarse = symplecticDefect(STEPPERS.rk4(c.dt), z);
    const fine = symplecticDefect(STEPPERS.rk4(c.dt / 8), z);
    const floorEstimate = symplecticDefect(STEPPERS.verlet(c.dt / 8), z);
    return {
        ...blank, rk4AtCoarse: coarse, rk4AtFine: fine, floorEstimate,
        rk4FallsBelowFloor: fine <= floorEstimate * 10, dtUsed: c.dt,
    };
}

export const poissonDevice = {
    // KNOB PLANT: `planted` drops the second term of the bracket -- what you write reading the definition as a
    // product rule rather than an antisymmetric pairing. It perturbs the DEFINITION, so every mode that uses a
    // bracket is graded through it, and the two that do not are blind BY CONSTRUCTION and say so.
    plantKind: "knob",
    // v4122 -- NAMED, THE SAME COMPLETION v3851/v4088-v4121 gave the rest of this family. MEASURED, canonical
    // mode (default) both arms: antisymmetry 0 -> 0.99999999999645, matching the header's own "exactly 0
    // against exactly 1" claim, while qp and canonicalErr stay bit-identical -- the plant drops the bracket's
    // second term, which happens to vanish for the pair (q,p) specifically, so {q,p} reads correct even under
    // the plant and only {q,p}+{p,q} shows the missing antisymmetry.
    planted: { knob: "planted", observable: "antisymmetry",
               note: "the bracket drops its second term, reading the definition as a product rule instead of an antisymmetric pairing -- invisible on {q,p} itself because that term vanishes there by coincidence, and caught only by checking {q,p} + {p,q} = 0, which the broken bracket cannot satisfy" },
    modes: POISSON_MODES, name: "poisson-brackets-and-symplecticity",
    observables: POISSON_OBSERVABLES, build, defaults,
};
export default poissonDevice;
