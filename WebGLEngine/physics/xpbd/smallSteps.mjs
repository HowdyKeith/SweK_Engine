// physics/xpbd/smallSteps.mjs -- v4441 -- substeps against iterations, and the crossover nobody had located.
//
// *** THE PLAN ITEM SAID "CHECK THE TREE'S XPBD AGAINST warp.sim". warp.sim NO LONGER EXISTS. *** It was
// deprecated in Warp 1.8 (July 2025) and REMOVED in Warp 1.10; its successor is newton-physics/newton, a
// Linux Foundation project, Apache 2.0. That is the fifth round running in which checking a premise before
// building on it changed the round, and the second in which the premise was mine.
//
// It does not matter as much as it looks, because THE REFERENCE WAS NEVER THE SOURCE. warp.sim and newton both
// implement two papers, and papers make claims that can be tested against this tree directly:
//
//   Macklin, Muller, Chentanez 2016, XPBD          -- compliance makes stiffness ITERATION-INDEPENDENT.
//                                                     Already graded here, by physics/xpbd/compliance.mjs.
//   Macklin et al. 2019, "Small Steps in Physics Simulation" -- for a FIXED BUDGET, spend it on SUBSTEPS
//                                                     rather than iterations. This is the defining design
//                                                     choice of warp, newton and Omniverse, and it is what
//                                                     physics/xpbd/xpbd.js's `iterations ?? 1` default is.
//
// *** AND ON THIS TREE'S OWN SOLVER THE SECOND CLAIM IS CONDITIONAL, WITH THE CONDITION LOCATED. ***
//
// ---- THE FIRST TWO RIGS COULD NOT SEE IT, AND THAT IS WORTH MORE THAN THE THIRD ONE WORKING ---------------
//
// RIG 1, the tree's own hangingLink from compliance.mjs -- ONE constraint. At a fixed budget of 1600 the error
// falls MONOTONICALLY as budget moves to iterations: 4.0e-4 at (1600 x 1) down to 2.3e-14 at (50 x 32). That
// is the exact opposite of Small Steps, and it is not a refutation: WITH ONE CONSTRAINT THERE IS NO NETWORK
// FOR INFORMATION TO PROPAGATE THROUGH, and iterating simply converges a single scalar solve. A rig that
// cannot exhibit the mechanism cannot test the claim about it.
//
// RIG 2, a chain of 32 -- a network, but measured at its TAIL MEAN, a quasi-static equilibrium. Still no
// clear winner (1.4e-2 against 8.2e-3, under 2x, non-monotone at N = 8). Also not a refutation: the steady
// stretch is precisely the thing XPBD's compliance makes iteration-independent, so measuring it asks the 2016
// claim rather than the 2019 one.
//
// RIG 3, the same chain SWEPT OVER STIFFNESS -- and the claim appears at once, with a sign change:
//
//     compliance   its=1      its=4      its=16     its=32
//     1e-3         1.38e-2    1.08e-2    8.33e-3    8.17e-3     <- iterations win
//     1e-5         9.80e-4    3.28e-3    1.47e-2    3.08e-2     <- SUBSTEPS win, by 31x
//     0            1.01e-3    4.01e-3    1.52e-2    3.17e-2
//
// *** THE CROSSOVER IS AT COMPLIANCE 3.487e-4 AND THIS TREE USES COMPLIANCES ON BOTH SIDES OF IT. ***

import { colorConstraints, xpbdSubstep } from "./xpbd.js";

"use strict";

/**
 * A hanging chain: particle 0 fixed, N compliant links below it, each of unit mass.
 * Link k carries the weight of the (N - k) particles below it, so its equilibrium stretch is
 * compliance * (N - k) * |g| by Hooke -- which makes the total length ANALYTIC and the rig a real test
 * rather than a self-comparison.
 */
export function chain(N, {
    compliance = 1e-3, gravity = -10, substeps = 400, iterations = 1, totalTime = 4.0, rest = 1.0,
} = {}) {
    const pos = new Float64Array(3 * (N + 1)), invMass = new Float64Array(N + 1);
    for (let k = 0; k <= N; k++) { pos[3 * k + 1] = -k * rest; invMass[k] = k === 0 ? 0 : 1; }
    const state = { pos, vel: new Float64Array(3 * (N + 1)), invMass };
    const cons = [];
    for (let k = 0; k < N; k++) cons.push({ i: k, j: k + 1, rest, compliance });
    const batches = colorConstraints(cons);
    const dt = totalTime / substeps;
    const tail = [];
    for (let s = 0; s < substeps; s++) {
        xpbdSubstep(state, cons, batches, { dt, gravity: [0, gravity, 0], iterations });
        if (s > substeps * 0.5) tail.push(Math.abs(state.pos[3 * N + 1]));
    }
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    let exact = 0;
    for (let k = 0; k < N; k++) exact += rest + compliance * (N - k) * Math.abs(gravity);
    return { mean, exact, relErr: Math.abs(mean - exact) / exact, substeps, iterations, compliance };
}

/** Hold substeps x iterations constant and vary the split. The only fair way to ask the 2019 question. */
export function budgetSplit(N, budget = 1600, { splits = [1, 2, 4, 8, 16, 32], ...opts } = {}) {
    return splits.map((its) => ({ iterations: its, substeps: budget / its,
                                  relErr: chain(N, { ...opts, substeps: budget / its, iterations: its }).relErr }));
}

/**
 * The compliance at which the ordering flips. Bisected in LOG space because compliance spans decades and a
 * linear bisection would spend every step in the top decade.
 */
export function crossoverCompliance(N = 32, budget = 1600, { lo = 1e-6, hi = 1e-2, steps = 24, ...opts } = {}) {
    return crossoverDetail(N, budget, { lo, hi, steps, ...opts }).value;
}

/**
 * *** A BISECTION THAT RETURNS ITS OWN BRACKET IS NOT A MEASUREMENT, AND THIS ONE DID. *** At N = 2 the
 * search returned exactly 1.000e-6 -- the lower bound -- because substeps never win anywhere in the range, so
 * every step pushed the interval down until it collapsed onto the floor. Reported as a number it looks like a
 * crossover a thousand times stiffer than its neighbours; it is the absence of a crossover wearing a number.
 * `saturated` says which, and callers that plot these are obliged to look.
 */
export function crossoverDetail(N = 32, budget = 1600, { lo = 1e-6, hi = 1e-2, steps = 24, ...opts } = {}) {
    const wins = (compliance) => {
        const few = chain(N, { ...opts, substeps: budget, iterations: 1, compliance }).relErr;
        const many = chain(N, { ...opts, substeps: budget / 32, iterations: 32, compliance }).relErr;
        return few < many;                 // true = substeps win here
    };
    const atLo = wins(lo), atHi = wins(hi);
    // A sign change across the bracket is what makes a bisection meaningful. Without one there is nothing
    // between the ends to find, and the answer is an end.
    if (atLo === atHi) return { value: atLo ? lo : hi, saturated: true, at: atLo ? "lo" : "hi", atLo, atHi };
    let a = lo, b = hi;
    for (let k = 0; k < steps; k++) {
        const mid = Math.sqrt(a * b);
        if (wins(mid)) a = mid; else b = mid;
    }
    return { value: Math.sqrt(a * b), saturated: false, at: null, atLo, atHi };
}

// *** THE RECORD, FROZEN BY NAME (v4399's rule), AND THE HALF THAT MATTERS IS THE CENSUS. ***
export const CROSSOVER_AT_V4441 = Object.freeze({
    at: "v4441",
    reference: "Macklin et al. 2019, Small Steps in Physics Simulation -- the design choice behind warp, " +
               "newton and Omniverse. warp.sim itself was REMOVED in Warp 1.10; newton-physics/newton " +
               "(Apache 2.0) is the successor. Nothing is vendored: the reference is a paper.",
    budget: 1600,
    links: 32,
    crossover: 3.487e-4,
    // Below the crossover, ONE iteration and many substeps wins. Above it, the reverse.
    stiffWins: "substeps",
    softWins: "iterations",
    worstRatio: 31,          // its=32 against its=1 at compliance 1e-5
    // *** IT IS NOT A CONSTANT OF XPBD AND THE SPREADS SAY SO. *** Across chain length it moves 620x (and
    // SATURATES below N = 8, where substeps never win in the searched range at all); across budget it moves
    // 38x, monotonically, which is the cleaner axis and the one the gate asserts on.
    budgetAxis: Object.freeze({ 400: 9.496e-3, 800: 1.811e-3, 1600: 3.487e-4, 3200: 2.467e-4 }),
    budgetSpread: 38.49,
    // *** THE TREE SITS ON BOTH SIDES, WHICH IS WHY THE NUMBER IS WORTH HAVING. ***
    treeCompliances: Object.freeze([0, 1e-6, 5e-6, 1e-4, 5e-4, 8e-4, 1e-3, 2e-2]),
    belowCrossover: Object.freeze([0, 1e-6, 5e-6, 1e-4]),
    aboveCrossover: Object.freeze([5e-4, 8e-4, 1e-3, 2e-2]),
    // physics/xpbd/xpbd.js defaults to `iterations ?? 1`, which is the small-steps convention and is RIGHT
    // for the stiff half. Modules that pass 2, 4, 5 or 8 are only right if their compliance is above 3.5e-4.
    solverDefault: 1,
    otherIterationCounts: Object.freeze([2, 4, 5, 8]),
});
