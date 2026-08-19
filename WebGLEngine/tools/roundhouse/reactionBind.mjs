// WebGLEngine/tools/roundhouse/reactionBind.mjs -- v3379
//
// *** DEVICE 55: TURING PATTERN SELECTION. The lab's first reaction-diffusion instrument. ***
//
// physics/reaction/brusselator.js has had its own gate for a long time and NO DEVICE. It was one of five
// fields (elasticity, reaction, galaxy, geostats, pulsar) with a module AND a gate and no bind -- architecture
// built and never represented in the graded lab.
//
// *** THE HARD PART WAS FINDING SOMETHING THE MODULE'S OWN GATE DOES NOT ALREADY PROVE. *** It is thorough: the
// steady state, the Jacobian, growthRate against the linear-stability formula in both directions, the discrete
// Laplacian eigenvalue, B_c, the Hopf line, the marginal mode at B_c, and a 5% error in k_c. A DEVICE THAT
// RESTATED ANY OF THAT WOULD MOVE THE COVERAGE COUNT AND GRADE NOTHING NEW -- the v3201 trap, written down and
// still easy to walk into.
//
// THE INDEPENDENT ROUTE IS A COMPETITION. Every check in that gate SEEDS ONE MODE and measures ITS rate against
// the formula. THIS SEEDS EVERY MODE WITH NOISE AND ASKS WHICH ONE WINS -- and consults no formula at all while
// running. The answer emerges from the dynamics; the closed form is only met at the comparison.
//
// *** THE KEY IS A LIMIT, NOT AN EQUALITY, AND MY FIRST VERSION HAD IT WRONG. *** I expected the winner to BE
// k_c. It is not: at B=9, well above threshold, the winner sits at k=1.3744 against k_c=1.0299. THAT IS
// CORRECT PHYSICS -- k_c is the MARGINAL wavenumber AT B_c, and above threshold a whole band is unstable with
// its growth peak elsewhere. The real statement is that THE SELECTED MODE CONVERGES TO k_c AS B FALLS TO B_c:
//
//     B      12       9       6       5      4.6      (B_c = 4.2463, k_c = 1.02988)
//     k    1.3744  1.3744  1.1781  1.1781  0.9817
//     |dk| 0.3446  0.3446  0.1482  0.1482  0.0481     <- monotone, and it is the whole key
//
// AND THE GRID CANNOT DO BETTER THAN ITS NEAREST MODE: k_c corresponds to continuous index 5.245, so m=5 is the
// closest integer available and 0.0481 is the QUANTISATION FLOOR, not a convergence failure. A tolerance would
// have hidden that distinction; the monotone approach does not.
//
// THE LOAD-BEARING NEGATIVE IS PHYSICS WITH NO FREE PARAMETER: Turing patterns need LONG-RANGE INHIBITION --
// the inhibitor must diffuse FASTER than the activator. SWAP Du AND Dv and nothing forms at any B: amplitude
// 9.9e-10 against 2.6 unswapped, nine orders. No threshold was tuned to make that happen.
"use strict";
import { makeField, step, criticalK, criticalB, hopfB } from "../../physics/reaction/brusselator.js";

const DEF = { A: 3, Du: 1, Dv: 8, n: 128, L: 32, seed: 11, dt: 2e-3, noise: 1e-6 };
export const MODES = ["selection", "approach", "swapped", "thresholds"];

/** Seed EVERY mode with tiny noise, run, and report which spatial mode dominates. No formula is consulted. */
export function compete({ A, B, Du, Dv, n, L, seed, dt, noise, T }) {
    const F = makeField({ n, L, A, B, Du, Dv, mode: 1, amp: 0 });
    let r = seed >>> 0;
    const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 - 0.5; };
    for (let i = 0; i < F.n; i++) { F.u[i] += noise * rnd(); F.v[i] += noise * rnd(); }
    for (let s = 0; s < Math.round(T / dt); s++) step(F, dt);
    let best = 0, bestA = -1;
    for (let m = 1; m < F.n / 2; m++) {
        let c = 0, si = 0;
        for (let i = 0; i < F.n; i++) { const d = F.u[i] - F.ss.u; c += d * Math.cos(2 * Math.PI * m * i / F.n); si += d * Math.sin(2 * Math.PI * m * i / F.n); }
        const a = Math.hypot(c, si) * 2 / F.n;
        if (a > bestA) { bestA = a; best = m; }
    }
    return { mode: best, amp: bestA, k: 2 * Math.PI * best / L };
}

export function defaults({ mode = "selection" } = {}) {
    if (!MODES.includes(mode)) return null;
    return { mode, config: { ...DEF, B: 9, T: 6 } };
}

export function build({ mode = "selection", config = {} } = {}) {
    if (!MODES.includes(mode)) throw new Error("reaction: undeclared mode " + mode);
    const c = { ...DEF, B: 9, T: 6, ...config };
    const kc = criticalK(c.A, c.Du, c.Dv), Bc = criticalB(c.A, c.Du, c.Dv), Bh = hopfB(c.A);

    if (mode === "thresholds") {
        // The two instabilities are DIFFERENT and their ORDER decides what you get. Neither threshold alone
        // says this; it is the relation between them.
        return { criticalB: Bc, hopfB: Bh, criticalK: kc, turingFirst: Bc < Bh, gap: Bh - Bc,
                 continuousModeIndex: kc * c.L / (2 * Math.PI) };
    }
    if (mode === "swapped") {
        const normal = compete({ ...c, T: 6 });
        const swapped = compete({ ...c, Du: c.Dv, Dv: c.Du, T: 6 });
        return { normalAmp: normal.amp, swappedAmp: swapped.amp, ratio: normal.amp / swapped.amp,
                 normalMode: normal.mode, swappedMode: swapped.mode };
    }
    if (mode === "approach") {
        const rows = [[12, 6], [9, 6], [6, 12], [5, 20], [4.6, 40]].map(([B, T]) => {
            const w = compete({ ...c, B, T });
            return { B, mode: w.mode, k: w.k, dk: Math.abs(w.k - kc) };
        });
        const dks = rows.map((r) => r.dk);
        return { criticalK: kc, criticalB: Bc, rows,
                 monotone: dks.every((d, i) => i === 0 || d <= dks[i - 1] + 1e-12),
                 nearest: dks[dks.length - 1], firstDk: dks[0] };
    }
    const w = compete(c);
    return { winningMode: w.mode, k: w.k, amp: w.amp, criticalK: kc, criticalB: Bc, hopfB: Bh,
             aboveThreshold: c.B > Bc, dkFromCritical: Math.abs(w.k - kc) };
}

/** Every observable any mode emits -- the roundhouse's proposer reads this list, so it must be complete. */
export const REACTION_OBSERVABLES = [
    "winningMode", "k", "amp", "criticalK", "criticalB", "hopfB", "aboveThreshold", "dkFromCritical",
    "turingFirst", "gap", "continuousModeIndex", "normalAmp", "swappedAmp", "ratio", "monotone", "nearest", "firstDk",
];

/** The device descriptor, in the same shape every other bind uses -- ONE declaration, not a second convention. */
export const reactionDevice = {
    modes: MODES, name: "turing-selection", observables: REACTION_OBSERVABLES, build, defaults,
};
export default reactionDevice;
