// WebGLEngine/tools/roundhouse/meltBind.mjs -- v3618
//
// THE MELT DEVICE -- the first one in this lab that can be asked whether it CONSERVES anything.
//
// tools/roundhouse/conservationReach.mjs says in its own header that it is a NAME SCAN and "a proposal, never
// a verdict": no device here has ever carried a conservation identity. Melting does, because the enthalpy
// method's whole point is that latent heat has somewhere to go.
//
// Three modes, three different KINDS of truth, which is the reason there are three:
//
//   "front"       -- the EXTERNAL key. X(t) = 2*lambda*sqrt(alpha*t) with lambda from the Stefan
//                    transcendental. Nothing in it comes from our grid, so the solver can be wrong in a way
//                    that shows. The observable is the relative departure from that closed form.
//   "convergence" -- the ORDER, not the error. The error ratio under grid doubling is ~2 (first order, as a
//                    fixed grid with a front BETWEEN cells must be). A SINGLE ERROR NUMBER PASSES ON A SOLVER
//                    THAT IS WRONG AND NEVER IMPROVES; a ratio does not.
//   "stall"       -- the IDENTITY. Every enthalpy strictly inside the mushy range must read EXACTLY Tm. Not
//                    nearly -- exactly, because T is DERIVED from H rather than tracked beside it.
//
// AND THE NEGATIVE CONTROL SHIPS WITH THE DEVICE rather than living only in the gate: `naive` runs the obvious
// temperature-based solver, which puts 400 OF 400 CELLS above Tm and has NO FRONT AT ALL. A device that can
// only show itself succeeding is a device nobody can grade.
"use strict";
import {
    MATERIALS, alphaOf, stefanNumber, lambdaFor, stefanFront, meltEnthalpy, stallCheck, refinement,
} from "../../physics/thermal/stefan.mjs";

export const MELT_OBSERVABLES = [
    "lambda", "lambdaResidual", "exactFront", "solverFront", "frontRelErr",
    "convergenceRatio", "moltenFraction", "naiveMoltenFraction", "stallExact", "stefanNumber",
];

const num = (v, d) => (Number.isFinite(+v) ? +v : d);

export function meltDefaults(hyp = {}) {
    const h = { ...hyp }, c = { ...(h.config || {}) };
    // BOUNDED so a wild proposal cannot pin the builder: the refinement mode is O(n^2) in wall time.
    c.L = Math.min(8, Math.max(0.125, num(c.L, 1)));
    c.n = Math.min(1600, Math.max(100, num(c.n, 400) | 0));
    c.tEnd = Math.min(4, Math.max(0.25, num(c.tEnd, 1)));
    if (!["front", "convergence", "stall"].includes(h.mode)) h.mode = "front";
    h.config = c;
    return h;
}

function frontRun(c) {
    const St = 1 / c.L, lam = lambdaFor(St);
    const exact = stefanFront(St, 1, c.tEnd);
    const r = meltEnthalpy(c.L, { n: c.n, tEnd: c.tEnd });
    const bad = meltEnthalpy(c.L, { n: c.n, tEnd: c.tEnd, naive: true });
    return {
        stefanNumber: St, lambda: lam.lambda, lambdaResidual: lam.residual,
        exactFront: exact, solverFront: r.front,
        frontRelErr: r.front === null ? null : Math.abs(r.front - exact) / exact,
        moltenFraction: r.moltenFraction, naiveMoltenFraction: bad.moltenFraction,
    };
}

function convergenceRun(c) {
    const ref = refinement(c.L, [c.n / 2 | 0, c.n, c.n * 2], { tEnd: c.tEnd });
    const ratios = ref.rows.filter((r) => r.ratio).map((r) => r.ratio);
    return {
        exactFront: ref.exact,
        rows: ref.rows.map((r) => ({ n: r.n, front: r.front, relErr: r.relErr })),
        convergenceRatio: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
        stefanNumber: 1 / c.L,
    };
}

function stallRun(c) {
    const rows = stallCheck(c.L, 12);
    const inside = rows.filter((r) => r.h > 0 && r.h < c.L);
    return {
        samples: rows.length, insideMushy: inside.length,
        stallExact: inside.every((r) => r.T === 0),
        worstDeparture: inside.reduce((m, r) => Math.max(m, Math.abs(r.T)), 0),
        stefanNumber: 1 / c.L,
    };
}

export function buildMelt(hyp, base = {}) {
    const h = meltDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    if (h.mode === "convergence") return { kind: "convergence", ...convergenceRun(h.config) };
    if (h.mode === "stall") return { kind: "stall", ...stallRun(h.config) };
    return { kind: "front", ...frontRun(h.config) };
}

export const meltDevice = {
    // THREE MODES, THREE KINDS OF TRUTH -- an external closed form, a convergence ORDER, and an exact
    // identity. Each verified to give a DISTINCT answer, because v3192's lesson is that a mode nobody can
    // discover is a mode nobody will use.
    modes: ["front", "convergence", "stall"],
    name: "melt-stefan",
    observables: MELT_OBSERVABLES,
    build: buildMelt,
    defaults: meltDefaults,
    materials: MATERIALS,
    alphaOf,
    stefanNumber,
};
