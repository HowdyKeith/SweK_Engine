// tools/roundhouse/temperingBind.mjs
//
// v3300 -- PARALLEL TEMPERING JOINS THE ROUNDHOUSE. Thirteenth promotion.
//
// Run one copy of the system at each of several temperatures and let neighbouring copies TRADE CONFIGURATIONS. A
// replica trapped in a metastable state at low temperature wanders up the ladder, melts, and comes back down
// somewhere else. It is the standard cure for a sampler that is not wrong, just stuck.
//
// THE SWAP RULE IS THE WHOLE THING. Exchanging between chains at beta_i and beta_j is a Metropolis move in the
// JOINT ensemble, so it must be accepted with
//     P_swap = min(1, exp((beta_i - beta_j)(E_i - E_j)))
// and the tempting alternative -- "just swap, both are valid configurations" -- silently destroys the marginals.
//
// *** AND THE FAILURE IS QUIET, WHICH IS WHY IT NEEDS A DEVICE. *** Measured with swapAlwaysWRONG:
//
//     T        1.8      2.0      2.2      2.4      2.7
//     correct  0.9542   0.9084   0.8017   0.5129   0.2552
//     planted  0.6912   0.6624   0.6240   0.5792   0.5453
//
// Every chain still runs. Every chain still produces a plausible magnetisation. But they have been SMEARED
// TOWARD EACH OTHER -- the ladder now samples one blended distribution wearing five temperature labels. Nothing
// in the run reports an error; the swap acceptance simply reads 100% instead of 37/30/19/19%.
//
// THE KEY IS BORROWED, NOT INVENTED: each replica's marginal must still be Boltzmann at ITS OWN temperature, so
// it owes the same Yang magnetisation the plain Ising device already owes, temperature by temperature. A sampler
// that moves configurations between ensembles has every opportunity to blend them, and this is what sees it.
//
// SECOND KEY, AN IDENTITY RATHER THAN A NUMBER: detailed balance is symmetric, so accepted i->j swaps must equal
// accepted j->i swaps over a run. Free to compute, and it catches asymmetric-indexing bugs long before the
// marginals would.

import {
    runTempering, plainRun, swapAcceptCorrect, swapAlwaysWRONG,
} from "../../physics/statmech/tempering.js";

export const TEMPERING_OBSERVABLES = [
    "temps", "absM", "yang", "worstMagErrBelowTc", "swapRate", "meanSwapRate",
    "spreadAcrossLadder", "occupancyMin", "L", "sweeps",
];

const DEF = { L: 16, temps: [1.8, 2.0, 2.2, 2.4, 2.7], seed: 4242, sweeps: 3000 };

function buildTempering({ mode = "marginals", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const r = runTempering({
        L: c.L, temps: c.temps, seed: c.seed, sweeps: c.sweeps,
        ...(config.planted ? { accept: swapAlwaysWRONG } : {}),
    });

    // worst departure from Yang, BELOW T_c only -- above it Yang is exactly 0 for the infinite lattice while a
    // finite one retains real magnetisation, so grading there would fail correct code for being finite.
    let worst = 0;
    for (let i = 0; i < r.temps.length; i++) if (r.yang[i] > 0) worst = Math.max(worst, Math.abs(r.absM[i] - r.yang[i]));

    // how far apart the ladder's magnetisations are: a healthy ladder SPREADS, a smeared one converges
    const spread = Math.max(...r.absM) - Math.min(...r.absM);
    const occ = r.occupancy ? Math.min(...r.occupancy.map((row) => Math.min(...row))) : null;

    return {
        temps: r.temps, absM: r.absM, yang: r.yang,
        worstMagErrBelowTc: worst,
        swapRate: r.swapRate, meanSwapRate: r.swapRate.reduce((a, b) => a + b, 0) / r.swapRate.length,
        spreadAcrossLadder: spread, occupancyMin: occ,
        L: r.L, sweeps: r.sweeps,
    };
}

export const temperingDevice = {
    // v3400 -- KNOB PLANT: the perturbation replaces a PHYSICS LAW or FUNCTION upstream of every observable,
    // so the whole path from the wrong derivation to the reported number is graded. plantedError's second design
    // rule ("perturb the physics, not the number") in its ordinary form.
    plantKind: "knob",
    // v4099 -- NAMED, THE SAME COMPLETION v3851/v4088-v4098 gave the rest of this family. MEASURED, both arms:
    // worstMagErrBelowTc 0.0169 -> 0.2656, spreadAcrossLadder 0.699 -> 0.146 (the ladder smearing the header
    // describes), meanSwapRate 26% -> 100%.
    planted: { knob: "planted", observable: "worstMagErrBelowTc",
               note: "swapAlwaysWRONG accepts every replica exchange instead of the Metropolis rule the joint ensemble requires -- every chain still runs and looks plausible, but the ladder blends into one distribution wearing five temperature labels, and each replica's marginal stops owing the Yang magnetisation at its own temperature" },
    modes: ["marginals"],
    name: "parallel-tempering-replica-exchange", observables: TEMPERING_OBSERVABLES, build: buildTempering,
    defaults: ({ mode } = {}) => ({ mode: mode || "marginals", config: { ...DEF } }),
};
