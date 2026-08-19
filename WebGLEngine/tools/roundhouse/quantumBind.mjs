// tools/roundhouse/quantumBind.mjs
//
// v2822 -- roundhouse device: the 1D SCHRODINGER solver. Four exact keys, and two of them are deliberately
// OPPOSITE SHAPES from the same solver on the same grid: a square well whose gaps WIDEN as n^2 and an
// oscillator whose gaps are IDENTICAL. A solver tuned to reproduce one would break the other.
//
// Modes:
//   "well"     -- infinite square well. Reports the measured n^2 ratios and the worst level error.
//   "osc"      -- harmonic oscillator. Reports the gap spread (must be ~0) and the ground state (must be omega/2).
//   "tunnel"   -- barrier transmission at a chosen energy below the top, where classical mechanics says zero.
//   "norm"     -- Crank-Nicolson evolution. normDrift is a RUNNING INVARIANT, not a fitted quantity: the
//                 propagator is unitary by construction, so any drift beyond round-off means the solve is wrong.

import { wellLevel, oscillatorLevel, barrierTransmission, squareWellLevels, oscillatorLevels, evolve } from "../../physics/quantum/schrodinger1d.js";
// v3420 -- the fourth v3410 module with a page, a gate and no bind. A MODE on the existing 1D-Schrodinger
// device rather than a new one: it is the same subject and the same solver family.
// `gaps` is RENAMED on import, not by accident: the osc branch below declares its own `const gaps`, and a
// module-scope import of the same name puts the whole function in the temporal dead zone -- build() threw
// "Cannot access 'gaps' before initialization" from a line that never runs in that mode. A COLLISION THAT ONLY
// FIRES IN THE BRANCH THAT DOES NOT USE EITHER ONE.
import { bandEdges, gaps as kpGaps, kpRhs, numericEdges } from "../../physics/quantum/kronigPenney.js";

export const QUANTUM_OBSERVABLES = [
    "levelErrWorst", "ratio21", "ratio31", "gapWidens",
    "gapSpread", "groundState", "gapMean",
    "transmission", "energyOverBarrier", "barrierWidth",
    "norm", "normDrift", "steps", "gridN",
    "bandCount", "gapCount", "widestGap", "edgeRhsWorst", "insideGapWorst", "insideBandWorst",
    "numericEdgeWorst", "bandGridN",
];

const DEF = {
    // v3435 -- DECLARED, NOT ADDED: every key below was ALREADY READ by this bind and ALREADY had this
    // exact fallback. defaults() simply never said so, and strictBuild therefore REJECTED A PARAMETER THAT
    // DEMONSTRABLY WORKS -- blackhole's iscoKm moves 12.40 -> 17.72 when nsMass is set. THE GUARD WAS
    // BLOCKING THE THING IT WAS BUILT TO PROTECT. Declaring costs nothing at run time because the value is
    // the one the code already fell back to; what it buys is that the contract now matches the behaviour.
    // v3765 -- the grid the SECOND route diagonalises. Declared with the rest, and bounded below, because
    // blochSpectrum is O(n^3) and a wild proposal must not pin the builder.
    bandGridN: 400,
    kpV0: 20,
 N: 800, L: 1, omega: 1, count: 5, E: 0.5, V0: 1, a: 1, steps: 400, dt: 2e-5 };

// v3420 -- *** THE MODE LIST WAS DECLARED TWICE AND ADDING A MODE FOUND IT THE WORST WAY. *** `modes:` on the
// device and a hardcoded array inside quantumDefaults were two copies, and only the device one was updated, so
// build({mode:"bands"}) SILENTLY RETURNED THE "well" ANSWER -- not a refusal, not an error, just a different
// device's numbers under the name I asked for. A SECOND DECLARATION NOBODY COMPARED, and its failure mode here
// is worse than a red gate: a caller gets a plausible result for a question it did not ask.
// v3765 -- "stencil" is the mode plant and runs the bands branch, so numericEdgeWorst (which that branch
// reports) is its flipped observable. "bands" is listed BEFORE it so the mode-plant contract compares the
// plant against the mode that owns the observable -- v3762's lesson, applied rather than re-learned.
export const QUANTUM_MODES = ["bands", "well", "osc", "tunnel", "norm", "stencil"];

export function quantumDefaults(hyp) {
    const h = { mode: "well", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // the eigensolver is O(N) per bisection step, but the grid must stay sane
    c.bandGridN = Math.min(800, Math.max(100, num(c.bandGridN, DEF.bandGridN) | 0));
    c.N = Math.min(2000, Math.max(50, num(c.N, DEF.N) | 0));
    c.L = Math.min(100, Math.max(0.01, num(c.L, DEF.L)));
    c.omega = Math.min(50, Math.max(0.01, num(c.omega, DEF.omega)));
    c.count = Math.min(8, Math.max(2, num(c.count, DEF.count) | 0));
    c.V0 = Math.min(1e4, Math.max(1e-6, num(c.V0, DEF.V0)));
    c.E = Math.min(1e5, Math.max(0, num(c.E, DEF.E)));
    c.a = Math.min(50, Math.max(1e-3, num(c.a, DEF.a)));
    c.steps = Math.min(4000, Math.max(20, num(c.steps, DEF.steps) | 0));
    h.config = c;
    if (!QUANTUM_MODES.includes(h.mode)) h.mode = "well";
    return h;
}

export async function buildQuantum(hyp, base = {}) {
    const h = quantumDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;

    if (h.mode === "bands" || h.mode === "stencil") {   // v3765 -- the plant runs the bands branch
        // *** THE FORBIDDEN GAPS ARE THE FALSIFIER, AND THEY ARE CHECKED FROM THE OTHER SIDE. *** An energy is
        // allowed exactly when |rhs(E)| <= 1, so the band edges are where |rhs| = 1 EXACTLY. Reporting the
        // edges alone would let a bisection that converged on the wrong thing look tidy; probing the MIDDLE of
        // each gap and demanding |rhs| > 1, and the middle of each band demanding |rhs| <= 1, asks the
        // criterion the opposite question and cannot be satisfied by a sloppy root find.
        // The barrier strength is this mode's OWN knob (kpV0), not the shared DEF.V0 the tunnel mode uses. At
        // the shared default of 1 the gaps are so narrow that a gap midpoint reads |rhs| = 1.00003 -- true, and
        // a margin that thin is evidence of nothing. A FIXTURE SHARED WITH ANOTHER MODE IS NOT AUTOMATICALLY
        // THE RIGHT FIXTURE, and the number that showed it was one that only just cleared its own bar.
        const p = { V0: Math.min(1e4, Math.max(1e-6, Number(c.kpV0) || 20)), a: c.a === undefined ? 1 : c.a, b: 0.2 };
        const edges = bandEdges({ ...p, eMax: 60, samples: 8000, iters: 60 });
        const g = kpGaps(edges, p);
        const mid = (lo, hi) => (lo + hi) / 2;
        // Edges: |rhs| must sit on 1. Gaps: the midpoint must be FORBIDDEN. Bands: the midpoint must be ALLOWED.
        const edgeRhsWorst = edges.reduce((w, E) => Math.max(w, Math.abs(Math.abs(kpRhs(E, p)) - 1)), 0);
        const insideGapWorst = g.reduce((w, [lo, hi]) => Math.min(w, Math.abs(kpRhs(mid(lo, hi), p))), Infinity);
        let insideBandWorst = 0;
        for (let i = 0; i + 1 < edges.length; i += 2) {
            insideBandWorst = Math.max(insideBandWorst, Math.abs(kpRhs(mid(edges[i], edges[i + 1]), p)));
        }

        // *** v3765 -- THE SECOND ROUTE, WHICH EXISTED AND WAS NOT WIRED. Everything above evaluates kpRhs at
        // points bandEdges produced from kpRhs: A SELF-CONSISTENCY CHECK, NOT TWO ROUTES. It confirms the
        // root-finder found roots of the function it was given, WHICH IT WOULD DO EVEN IF THE FUNCTION WERE
        // WRONG. blochSpectrum builds a real discrete Hamiltonian and diagonalises it -- IT SHARES NO CODE WITH
        // kpRhs -- and it has been sitting in the same module with its only consumer a selfcheck.
        // MEASURED: the two agree to 3.573e-3 at n=400 and the disagreement HALVES WITH EACH DOUBLING OF THE
        // GRID (7.364e-3 at 200, 3.573e-3 at 400, 1.814e-3 at 800) -- FIRST ORDER, which is what makes it a
        // key rather than a coincidence. The observable is the WORST relative gap, and the convergence RATE is
        // what the gate grades: "they are close" is satisfied by two wrong answers that happen to agree. ***
        // *** THE PLANT: `stencil` USES -1/dx^2 OFF THE DIAGONAL INSTEAD OF -0.5/dx^2 -- forgetting the 1/2 in
        // front of the Laplacian, which is the classic slip. It BREAKS THE ROW SUM RULE (a constant is a
        // zero-energy eigenstate of the kinetic operator where V = 0) while still producing a symmetric, real,
        // perfectly diagonalisable matrix. ONE-SIDED BY CONSTRUCTION: the analytic route never sees the
        // matrix, so the comparison moves and the reference does not. ***
        const numeric = numericEdges({ ...p, n: c.bandGridN, count: 8,
                                       offDiag: h.mode === "stencil" ? -1 : -0.5 });
        const nEdges = Math.min(6, edges.length, numeric.all.length);
        let numericEdgeWorst = 0;
        for (let i = 0; i < nEdges; i++) {
            numericEdgeWorst = Math.max(numericEdgeWorst, Math.abs(edges[i] - numeric.all[i]) / Math.abs(edges[i]));
        }
        return {
            bandCount: Math.floor(edges.length / 2), gapCount: g.length,
            widestGap: g.reduce((m, [lo, hi]) => Math.max(m, hi - lo), 0),
            edgeRhsWorst, insideGapWorst, insideBandWorst,
            numericEdgeWorst, bandGridN: c.bandGridN,
            // every field the other modes report, absent rather than faked
            levelErrWorst: null, ratio21: null, ratio31: null, gapWidens: null, gapSpread: null,
            groundState: edges[0], gapMean: null, transmission: null, energyOverBarrier: null,
            barrierWidth: null, norm: null, normDrift: null, steps: null, gridN: null,
        };
    }

    if (h.mode === "osc") {
        const E = oscillatorLevels({ omega: c.omega, N: Math.max(600, c.N), span: 14, count: c.count });
        const gaps = E.slice(1).map((v, i) => v - E[i]);
        let worst = 0;
        E.forEach((v, n) => { worst = Math.max(worst, Math.abs(v - oscillatorLevel(n, c.omega)) / oscillatorLevel(n, c.omega)); });
        return {
            levelErrWorst: worst,
            gapSpread: Math.max(...gaps) - Math.min(...gaps),      // must be ~0: equally spaced
            gapMean: gaps.reduce((a, b) => a + b, 0) / gaps.length, // must be omega
            groundState: E[0],                                     // must be omega/2
            gridN: c.N,
        };
    }

    if (h.mode === "tunnel") {
        return {
            transmission: barrierTransmission(c.E, c.V0, c.a),
            energyOverBarrier: c.E / c.V0,
            barrierWidth: c.a,
        };
    }

    if (h.mode === "norm") {
        const x0 = 0.35 * c.L, s = 0.05 * c.L, k0 = 40 / c.L;
        const psi0 = (x) => { const g = Math.exp(-((x - x0) ** 2) / (2 * s * s)); return [g * Math.cos(k0 * x), g * Math.sin(k0 * x)]; };
        const r = evolve({ N: Math.min(600, c.N), L: c.L, dt: c.dt, steps: c.steps, psi0 });
        return { norm: r.norm, normDrift: r.normDrift, steps: c.steps, gridN: Math.min(600, c.N) };
    }

    const E = squareWellLevels({ L: c.L, N: c.N, count: Math.max(3, c.count) });
    let worst = 0;
    E.forEach((v, i) => { worst = Math.max(worst, Math.abs(v - wellLevel(i + 1, c.L)) / wellLevel(i + 1, c.L)); });
    const gaps = E.slice(1).map((v, i) => v - E[i]);
    return {
        levelErrWorst: worst,
        ratio21: E[1] / E[0],                                  // must be 4
        ratio31: E[2] / E[0],                                  // must be 9
        gapWidens: gaps.every((g, i) => i === 0 || g > gaps[i - 1]),
        gridN: c.N,
    };
}

export const quantumDevice = {
    // v3192 -- EXPORTED. This device reported as ONE-MODE to the census because its own mode names were
    // not in the probe's candidate list -- the LOWER BOUND, biting for the third time. Derived from
    // this file's own default plus every mode its own build() branches on, each verified to give a
    // DISTINCT answer. *** A MODE NOBODY CAN DISCOVER IS A MODE NOBODY WILL USE. ***
    modes: QUANTUM_MODES,
    plantMode: "stencil", plantFlips: "numericEdgeWorst", plantKind: "mode",
    name: "schrodinger-1d", observables: QUANTUM_OBSERVABLES, build: buildQuantum, defaults: quantumDefaults };
