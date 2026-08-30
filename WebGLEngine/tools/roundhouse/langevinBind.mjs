// tools/roundhouse/langevinBind.mjs
//
// v3290 -- STOCHASTIC THERMODYNAMICS JOINS THE ROUNDHOUSE. Fifth promotion, and the recipe was declared spent
// one round early.
//
// v3289 concluded that no ungraded module still carried both a closed form and a planted error. That was WRONG,
// and the way it was wrong is worth keeping: the sweep looked for identifiers matching /exact[A-Z]|Exact\(/ and
// this module's key is a LOCAL named dFexact inside jarzynskiRun, invisible to a scan of exported names. A
// search for a naming convention is not a search for a property. The correction cost nothing here because the
// next sweep found it, but the lesson is that "there are no more" was a claim about my grep, not about the tree.
//
// THREE INDEPENDENT EXACT KEYS, which is more than any other device here carries:
//
//   JARZYNSKI    <exp(-W/kT)> = exp(-dF/kT), EXACTLY, over nonequilibrium trajectories driven arbitrarily fast.
//                For a harmonic trap stiffened k0 -> k1 the reference is closed form: dF = (kT/2) ln(k1/k0).
//                Measured 0.6902 against 0.6931. The second law appears as a by-product: <W> = 1.204 >= dF.
//   EQUIPARTITION  <x^2> = kT/k in the stationary state. Measured 0.4926 against 0.5.
//   EINSTEIN     free-particle MSD = 2 D t with D = kT/gamma. Measured 39.76 against 40.
//
// TWO PLANTED ERRORS, BOTH EXPORTED, AND THEY FAIL DIFFERENT KEYS -- which is why all three are worth grading:
//   workIncrementWRONG   dF error 2.9e-3 -> 3.6e-1 (125x). Breaks Jarzynski, leaves equipartition intact,
//                        because the dynamics are still correct -- only the work accounting is wrong.
//   ouStepNoiseWRONG     dF error -> 8.8e-2 (30x) AND equipartition 0.4926 -> 0.2463, exactly half. That is a
//                        fluctuation-dissipation violation: noise and drag no longer agree on a temperature, so
//                        the stationary distribution is the wrong width and NO amount of sampling fixes it.
//
// A device grading only Jarzynski would catch both; a device grading only equipartition would miss the work bug
// entirely. Keeping all three separates "the accounting is wrong" from "the physics is wrong".

import {
    jarzynskiRun, equipartitionRun, msdRun,
    workIncrementWRONG, ouStepNoiseWRONG,
} from "../../physics/langevin/langevin.js";

export const LANGEVIN_OBSERVABLES = [
    "dFerr", "dFjarzynski", "dFexact", "meanW", "secondLawHolds", "nTraj",
    "equipartitionErr", "x2", "msdErr", "msd",
];

const DEF = { nTraj: 30000, steps: 4, seed: 17 };

function buildLangevin({ mode = "jarzynski", config = {} } = {}) {
    const c = { ...DEF, ...config };

    if (mode === "fluctuation") {
        // the two equilibrium keys: stationary width and free diffusion
        const step = config.planted ? ouStepNoiseWRONG : undefined;
        const e = equipartitionRun(step ? { step } : {});
        const m = msdRun({});
        return {
            dFerr: null, dFjarzynski: null, dFexact: null, meanW: null, secondLawHolds: null, nTraj: 0,
            equipartitionErr: Math.abs(e.x2 - e.exact) / e.exact, x2: e.x2,
            msdErr: Math.abs(m.msd - m.exact) / m.exact, msd: m.msd,
        };
    }

    const opts = { nTraj: c.nTraj, steps: c.steps, seed: c.seed };
    if (config.planted === "work") opts.workInc = workIncrementWRONG;
    if (config.planted === "noise") opts.step = ouStepNoiseWRONG;
    const j = jarzynskiRun(opts);
    return {
        dFerr: Math.abs(j.dFjarzynski - j.dFexact), dFjarzynski: j.dFjarzynski, dFexact: j.dFexact,
        meanW: j.meanW, secondLawHolds: j.meanW >= j.dFexact, nTraj: j.nTraj,
        equipartitionErr: null, x2: null, msdErr: null, msd: null,
    };
}

export const langevinDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4130 -- NAMED, THE SAME COMPLETION v3851/v4088-v4129 gave the rest of this family. UNUSUAL SIGNATURE:
    // `jarzynski` mode reads config.planted STRICTLY ("work" or "noise", selecting workIncrementWRONG or
    // ouStepNoiseWRONG), so an ordinary `planted: true` probe leaves it BLIND -- MEASURED, dFerr stays exactly
    // 0.002899 under config.planted=true, but moves to 0.3614 ("work") or 0.0881 ("noise") when the string is
    // passed explicitly. `fluctuation` mode reads config.planted as an ordinary TRUTHY flag, so it is the one a
    // standard true/false probe actually reaches -- MEASURED, equipartitionErr 0.01470 -> 0.50735 under
    // config.planted=true (msdErr stays blind: ouStepNoiseWRONG only corrupts the OU step equipartitionRun
    // uses, not the free-particle msdRun path).
    planted: { knob: "planted", observable: "equipartitionErr",
               note: "in fluctuation mode, a plain truthy planted flag swaps in ouStepNoiseWRONG, a noise step that no longer agrees with the drag coefficient on a temperature (a fluctuation-dissipation violation) -- the stationary distribution settles to the wrong width and no amount of sampling fixes it. jarzynski mode carries the stronger pair of plants (workIncrementWRONG and ouStepNoiseWRONG) but only responds to the literal strings 'work'/'noise', not to planted:true" },
    modes: ["jarzynski", "fluctuation"],
    name: "stochastic-thermodynamics", observables: LANGEVIN_OBSERVABLES, build: buildLangevin,
    defaults: ({ mode } = {}) => ({ mode: mode || "jarzynski", config: { ...DEF } }),
};
