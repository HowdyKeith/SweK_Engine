// WebGLEngine/physics/statmech/binderBudget.js — v3283
// ---------------------------------------------------------------------------------------------------------------
// THE BRAIN ALLOCATES THE MEASUREMENT BUDGET — the second proposer-adjudicator handshake, one step up from the
// HMC tuner. The tuner chose a sampler's knobs; this chooses WHICH EXPERIMENT TO RUN NEXT. Goal: pin the Binder
// crossing (the Ising T_c estimate) with a fixed budget of measurements, each costing real sweeps. A strategy
// sees the data so far and proposes the next temperature; it NEVER grades itself — the falsifier is that the
// final crossing must still land on Onsager's T_c, a number no strategy contains.
//
// Three strategies, because the comparison IS the finding:
//   uniformStrategy — the honest baseline: spread measurements evenly, no adaptivity.
//   activeStrategy  — bisection on the sign change of U4(L=8) - U4(L=16): always measure inside the current
//                     bracket, halving where the crossing can hide. Information-seeking.
//   easyStrategy    — THE DEGENERATE POLICY, named as such: it prefers temperatures FAR from the action, where
//                     the lattice is deeply ordered/disordered and measurements are smooth and "clean". A reward
//                     of low-variance data endorses it; it never brackets the crossing at all. Measured in the
//                     gate, because that attractor is exactly what a naive learner optimizing "confident
//                     measurements" falls into — pretty data about nothing.
//
// Every measurement is a REAL binderMeasure call on the existing statmech device (one implementation of the
// physics; this file only decides where to spend it). Deterministic seeding throughout.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { binderMeasure } from "./ising.js";

// one budget unit: U4 at temperature T for BOTH lattice sizes (that is what a crossing needs).
function measurePair(T, { seed = 7, warmup = 600, samples = 3000 } = {}) {
    const a = binderMeasure({ L: 8, T, seed: seed + 8000 + Math.round(T * 1000), warmup, samples });
    const b = binderMeasure({ L: 16, T, seed: seed + 16000 + Math.round(T * 1000), warmup, samples });
    return { T, d: a.U4 - b.U4, U4a: a.U4, U4b: b.U4 };
}

// current bracket: the adjacent pair straddling the transition. SIGN CONVENTION, LEARNED THE HARD WAY: below
// T_c the LARGER lattice is more ordered, so d = U4(L=8) - U4(L=16) is NEGATIVE below and POSITIVE above. The
// first version of this function scanned for positive -> negative — the reverse — and happily "bracketed" noise
// flips in the ordered phase; the FALSIFIER caught it (crossing 2.19 vs Onsager 2.2692), which is the entire
// reason the falsifier exists. Scan for the LAST negative -> positive transition so a stray noise flip below
// the real one cannot claim the bracket.
function bracketOf(points) {
    const p = points.slice().sort((x, y) => x.T - y.T);
    let br = null;
    for (let i = 1; i < p.length; i++) if (p[i - 1].d < 0 && p[i].d > 0) br = [p[i - 1].T, p[i].T, p[i - 1].d, p[i].d];
    return br ? [br[0], br[1]] : null;
}

// crossing estimate: linear interpolation on d(T) ACROSS THE BRACKET PAIR ONLY — points far from the transition
// carry noise, not information about where d changes sign, so they get no vote.
function crossingOf(points) {
    const p = points.slice().sort((x, y) => x.T - y.T);
    for (let i = p.length - 1; i >= 1; i--) {
        if (p[i - 1].d < 0 && p[i].d > 0) {
            const t = -p[i - 1].d / (p[i].d - p[i - 1].d);
            return p[i - 1].T + t * (p[i].T - p[i - 1].T);
        }
    }
    return null;
}

// ---- the strategies: (points, span) -> next T. Pure functions of the data so far. -------------------------------
function uniformStrategy(points, [lo, hi]) {
    // largest gap between measured temperatures, split in half — even coverage without adaptivity.
    const ts = points.map((p) => p.T).sort((a, b) => a - b);
    let bestGap = 0, at = (lo + hi) / 2;
    for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > bestGap) { bestGap = ts[i] - ts[i - 1]; at = (ts[i - 1] + ts[i]) / 2; }
    return at;
}
function activeStrategy(points, span) {
    const br = bracketOf(points);
    if (br) return (br[0] + br[1]) / 2;          // bisect where the crossing hides
    return uniformStrategy(points, span);         // no bracket yet: widen coverage until one appears
}
function easyStrategy(points, [lo, hi]) {
    // prefers the ends of the span — deep order/disorder, smooth data, nothing to learn. DEGENERATE, on purpose.
    return points.length % 2 ? lo + 0.001 * points.length : hi - 0.001 * points.length;
}

// ---- run one campaign: 3 seed points + (budget-3) proposed measurements, then report -----------------------------
function runCampaign(strategy, { budget = 9, span = [2.05, 2.50], seed = 7, warmup = 1200, samples = 6000 } = {}) {
    const opts = { seed, warmup, samples };
    const points = [measurePair(span[0], opts), measurePair((span[0] + span[1]) / 2, opts), measurePair(span[1], opts)];
    let sweepsSpent = 3;
    while (sweepsSpent < budget) {
        const T = Math.max(span[0], Math.min(span[1], strategy(points, span)));
        points.push(measurePair(T, opts));
        sweepsSpent++;
    }
    const br = bracketOf(points);
    return {
        points, budget,
        bracket: br, bracketWidth: br ? br[1] - br[0] : null,
        crossing: crossingOf(points),
    };
}

export { measurePair, bracketOf, crossingOf, uniformStrategy, activeStrategy, easyStrategy, runCampaign };
if (typeof module !== "undefined" && module.exports) module.exports = { measurePair, bracketOf, crossingOf, uniformStrategy, activeStrategy, easyStrategy, runCampaign };
