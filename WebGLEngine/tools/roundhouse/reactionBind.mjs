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
//
// *** v3902 -- THE PLANT SMUGGLES THE ANSWER INTO THE INITIAL CONDITION, AND IT IS THE ONE DEFECT THIS DEVICE
// WAS BUILT TO BE IMMUNE TO. *** The header above says what makes this device worth having: "THIS SEEDS EVERY
// MODE WITH NOISE AND ASKS WHICH ONE WINS -- and consults no formula at all while running." So the plant is to
// stop doing that. `seeded` puts the amplitude on ONE mode -- Math.round(k_c L / 2pi) = 5, the nearest integer
// the formula points at -- and lets the same dynamics run:
//
//     winningMode      7          ->   5      (exactly the mode that was seeded, at EVERY B)
//     k                1.3744     ->   0.9817
//     dkFromCritical   0.34456    ->   0.048136        <- DECLARED
//
// *** AND THE DEFECT MAKES THE DEVICE AGREE WITH THE WRONG HYPOTHESIS THE HEADER ABOVE RECORDS HOLDING. ***
// "I expected the winner to BE k_c. It is not." Under the plant it IS -- dk sits on the 0.048136 quantisation
// floor at B=12, 9, 6, 5 and 4.6 alike, so the seeded run would have CONFIRMED the belief the real run
// refuted. A plant that produces the tidier answer is the dangerous kind, and this one is only visible
// because the true device measured something less tidy first.
//
// *** WHAT CATCHES IT IS NOT `monotone`. *** A CONSTANT SEQUENCE IS MONOTONE NON-INCREASING, so the pinned
// 0.048136 at every B satisfies `dks.every(d <= prev)` and `monotone` stays TRUE under the plant. What fires
// is the RATIO clause the device gate already pairs with it -- `nearest < firstDk / 5`, which reads
// 0.048136 < 0.0096 and fails -- and `nearest` ALONE is blind too (0.048136 in both arms, because the true
// B=4.6 row also lands on m=5). THE DECLARED OBSERVABLE IS `dkFromCritical` FOR EXACTLY THAT REASON: two of
// this device's three approach observables cannot see the plant, and v3852 already cost a round to
// discovering that a declaration pointed at a blind number is not coverage.
//
// KIND: `knob`. The physics input -- the initial condition -- is replaced upstream; the integrator, the mode
// scan and the closed forms are all untouched.
"use strict";
import { makeField, step, criticalK, criticalB, hopfB } from "../../physics/reaction/brusselator.js";

const DEF = { A: 3, Du: 1, Dv: 8, n: 128, L: 32, seed: 11, dt: 2e-3, noise: 1e-6 };
export const MODES = ["selection", "approach", "swapped", "thresholds", "seeded"];

/** Seed EVERY mode with tiny noise, run, and report which spatial mode dominates. No formula is consulted. */
export function compete({ A, B, Du, Dv, n, L, seed, dt, noise, T, seedMode = 0 }) {
    // seedMode > 0 IS THE PLANT AND NOTHING ELSE PASSES IT. The default arm is unchanged to the byte: a flat
    // field (amp 0) plus noise on every cell, so every spatial mode starts with power and the dynamics pick.
    // The plant arm puts that same amplitude on ONE cosine and adds no noise at all -- the answer, handed in.
    const F = seedMode > 0
        ? makeField({ n, L, A, B, Du, Dv, mode: seedMode, amp: noise })
        : makeField({ n, L, A, B, Du, Dv, mode: 1, amp: 0 });
    if (!(seedMode > 0)) {
        let r = seed >>> 0;
        const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648 - 0.5; };
        for (let i = 0; i < F.n; i++) { F.u[i] += noise * rnd(); F.v[i] += noise * rnd(); }
    }
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
    // "selection" and its plant "seeded" share this shape exactly, so the census compares like with like and
    // the ONLY difference between the arms is where the initial power went. The seeded mode is DERIVED from
    // k_c rather than typed: the nearest integer mode the grid can hold, which is the answer the formula
    // points at -- 5 here, against the 7 the honest competition actually selects at B=9.
    const seedMode = mode === "seeded" ? Math.round(kc * c.L / (2 * Math.PI)) : 0;
    const w = compete({ ...c, seedMode });
    return { winningMode: w.mode, k: w.k, amp: w.amp, criticalK: kc, criticalB: Bc, hopfB: Bh,
             aboveThreshold: c.B > Bc, dkFromCritical: Math.abs(w.k - kc) };
}

/** Every observable any mode emits -- the roundhouse's proposer reads this list, so it must be complete. */
export const REACTION_OBSERVABLES = [
    "winningMode", "k", "amp", "criticalK", "criticalB", "hopfB", "aboveThreshold", "dkFromCritical",
    "turingFirst", "gap", "continuousModeIndex", "normalAmp", "swappedAmp", "ratio", "monotone", "nearest", "firstDk",
    // v4085 -- COMPLETED: rows (approach's per-B table), normalMode/swappedMode (swapped's selected wavenumbers)
    // were returned and never declared. Same defect as v3850/v4082/v4084.
    "rows", "normalMode", "swappedMode",
];

/** The device descriptor, in the same shape every other bind uses -- ONE declaration, not a second convention. */
export const reactionDevice = {
    modes: MODES, name: "turing-selection", observables: REACTION_OBSERVABLES, build, defaults,
    // `dkFromCritical` and NOT `monotone` or `nearest` -- both of those are blind to this plant, and the
    // header above says why. 0.34456 -> 0.048136, finite in both arms, which is what probeModePlant requires.
    plantMode: "seeded", plantFlips: "dkFromCritical", plantKind: "knob",
    plantDirectionRefused:
        "DIRECTION IS THE WRONG TEST FOR THIS PLANT, AND THAT IS THE POINT OF IT. The seeded arm takes dkFromCritical 0.34456 -> 0.048136, which is CLOSER to critical -- tidier, not worse -- because the plant smuggles the answer into the initial condition and the winner then sits on the quantisation floor at every B. A plant that produces the more attractive number cannot be read by |planted - ideal| > |honest - ideal| in either direction, and declaring an ideal here would be picking a number because it makes the wall pass. WHAT ACTUALLY CATCHES IT is the ratio clause this device's gate already pairs with the observable -- nearest < firstDk / 5, reading 0.048136 < 0.0096 and failing -- and the header above records that `monotone` and `nearest` alone are both blind to it. The plant is real and verified; the DIRECTION probe is not what verifies it",
};
export default reactionDevice;
