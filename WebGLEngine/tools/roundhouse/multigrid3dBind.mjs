// tools/roundhouse/multigrid3dBind.mjs
//
// v3723 -- roundhouse device: the 3D POISSON MULTIGRID (fluid/multigrid3d.mjs). The curriculum has proposed
// GRADE fluid/multigrid3d.mjs for several rounds; gradedCoverage's rule is this file existing and importing it.
//
// *** THE KEY IS THE ONE PROPERTY THAT MAKES A MULTIGRID A MULTIGRID, AND THE CODE IS NEVER TOLD IT: THE WORK
// DOES NOT SCALE WITH THE PROBLEM. A single-level smoother needs more sweeps as the grid refines, because
// information crosses one cell per sweep and the domain is getting wider in cells. A V-cycle carries the low
// frequencies on coarse grids, so the iteration count should stay nearly flat while the cell count explodes.
// NOTHING IN multigrid3d.mjs CONTAINS THAT CLAIM -- it is a consequence of the cycle, which is what makes it a
// key rather than a restatement. MEASURED: cells 4096 -> 32768 (8x) while iterations go 20 -> 28 (1.4x). ***
//
// AND THE SECOND KEY IS A REFUSAL, WHICH IS THE SHARPER OF THE TWO. With every boundary SOLID the discrete
// Poisson problem is ALL-NEUMANN and therefore SINGULAR: it has a solution only if the right-hand side has
// ZERO MEAN over the fluid cells (the compatibility condition). Feed it a strictly positive divergence and
// there is no solution to find -- measured, the solve runs to its iteration cap and the relative residual
// stalls at 1.2e6 rather than falling. A SOLVER THAT "CONVERGED" ON AN INCOMPATIBLE PROBLEM WOULD BE THE
// ALARMING RESULT, and this device asks for that case on purpose.
//
// *** I FOUND THAT CONDITION BY GETTING IT WRONG. My first measurement fed a sine-cubed (everywhere positive)
// divergence, saw 200 iterations and a residual of 1e7, and the honest first reading was "the solver does not
// converge". IT WAS MY RIGHT-HAND SIDE THAT WAS UNSOLVABLE, NOT THE SOLVER THAT WAS BROKEN. That is why the
// incompatible case is a NAMED MODE here rather than a footnote: the next person will hit it too. ***
//
// WHAT THIS DOES NOT CLAIM: that the solver is verified. Grading convergence BEHAVIOUR does not grade the
// discretisation, the Galerkin coarsening, the boundary handling or the answer's accuracy against an analytic
// field. A DEVICE THAT GRADES ONE PROPERTY MOVES gradedCoverage BY ONE MODULE, and the honest reading is "this
// module now has a key", not "this module is right".

import { PoissonMG3D, FLUID, SOLID } from "../../fluid/multigrid3d.mjs";

import { pathToFileURL } from "node:url";
export const MG3D_OBSERVABLES = [
    "iters", "residual", "converged", "cells", "levels", "n",
    "itersSmall", "itersLarge", "cellRatio", "iterRatio", "compatible",
    // v4085 -- COMPLETED: `kind` is returned by every mode (scaling/solve/incompatible/nopreconditioner)
    // and was never declared. Same defect as v3850/v4082/v4084.
    "kind",
];

const DEF = { n: 24, tol: 1e-6, maxIters: 200, small: 16, large: 32 };

export function mg3dDefaults(hyp) {
    const h = { mode: "scaling", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    c.n = Math.min(40, Math.max(8, num(c.n, DEF.n) | 0));
    c.small = Math.min(32, Math.max(8, num(c.small, DEF.small) | 0));
    c.large = Math.min(40, Math.max(c.small + 4, num(c.large, DEF.large) | 0));
    c.tol = Math.min(1e-2, Math.max(1e-9, num(c.tol, DEF.tol)));
    c.maxIters = Math.min(500, Math.max(10, num(c.maxIters, DEF.maxIters) | 0));
    h.config = c;
    // v3784 -- the validator must list the plant mode too, or defaults() SILENTLY REWRITES IT TO "scaling" and
    // the plant runs the honest path while appearing to fire. REACHABLE AND FINDABLE ARE TWO DIFFERENT EDITS.
    if (!["scaling", "solve", "incompatible", "nopreconditioner"].includes(h.mode)) h.mode = "scaling";
    if (!h.claim || !h.claim.observable) h.claim = { observable: "iterRatio", max: 2 };
    return h;
}

/**
 * One solve on an n^3 box walled in SOLID. `zeroMean` subtracts the fluid-cell mean from the divergence,
 * which is the COMPATIBILITY CONDITION the all-Neumann problem requires -- without it there is no solution
 * and the iteration count is a statement about the problem, not about the solver.
 */
function solveOnce(n, { tol, maxIters, zeroMean = true, pcCycles }) {
    const mg = new PoissonMG3D(n, n, n);
    const N = n * n * n, type = new Uint8Array(N), div = new Float32Array(N), p = new Float32Array(N);
    const idx = (i, j, k) => (k * n + j) * n + i;
    const fluid = [];
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const solid = (i === 0 || j === 0 || k === 0 || i === n - 1 || j === n - 1 || k === n - 1);
        type[idx(i, j, k)] = solid ? SOLID : FLUID;
        if (!solid) { div[idx(i, j, k)] = Math.sin(2 * Math.PI * i / n) * Math.sin(2 * Math.PI * j / n); fluid.push(idx(i, j, k)); }
    }
    if (zeroMean) {
        let s = 0; for (const c of fluid) s += div[c];
        const m = s / fluid.length; for (const c of fluid) div[c] -= m;
    }
    // v3784 -- pcCycles goes on solveCG's OPTIONS, not the constructor. I put it on the constructor first and
    // the plant read the same number in both arms, which looked like a plant that does not fire: AN OPTIONS
    // OBJECT TAKES ANY KEY YOU HAND IT AND IGNORES THE ONES IT DOES NOT READ.
    mg.solveCG(type, div, 1 / 60, p, pcCycles === undefined ? { maxIters, tol } : { maxIters, tol, pcCycles });
    return { iters: mg.iters, residual: mg.res, converged: mg.res < tol * 10, cells: N, levels: mg.levels.length, n };
}

export function buildMG3D(hyp, base = {}) {
    const h = mg3dDefaults({ ...hyp, config: { ...(base || {}), ...(hyp && hyp.config) } });
    const c = h.config;

    if (h.mode === "solve") return { kind: "solve", ...solveOnce(c.n, c), compatible: true };

    if (h.mode === "incompatible") {
        // THE REFUSAL: a strictly positive divergence has no zero-mean part removed, so the all-Neumann system
        // is inconsistent and there is nothing to converge TO.
        const r = solveOnce(c.n, { ...c, zeroMean: false });
        return { kind: "incompatible", ...r, compatible: false };
    }

    // *** v3784 -- THE PLANT: "nopreconditioner" runs the SAME comparison with pcCycles 0, which is PLAIN CG.
    // Both solves still CONVERGE to the same tolerance -- it is a correct Poisson solve -- so `converged`
    // stays true and the residual still meets tol. WHAT BREAKS IS THE SCALING, THE ONE PROPERTY THAT MAKES IT
    // MULTIGRID: measured, 20 -> 28 with the preconditioner and 43 -> 93 without. A DEVICE WATCHING ONLY "DID
    // IT SOLVE" WOULD SEE NOTHING AT ALL. ***
    const pc = h.mode === "nopreconditioner" ? { pcCycles: 0 } : {};
    const a = solveOnce(c.small, { ...c, ...pc }), b = solveOnce(c.large, { ...c, ...pc });
    return {
        kind: "scaling",
        itersSmall: a.iters, itersLarge: b.iters,
        cellRatio: b.cells / a.cells, iterRatio: b.iters / a.iters,
        iters: b.iters, residual: b.residual, converged: a.converged && b.converged,
        cells: b.cells, levels: b.levels, n: b.n, compatible: true,
    };
}

export const multigrid3dDevice = {
    // v3784 -- "scaling" stays FIRST so the contract compares the plant against the mode that owns iterRatio.
    modes: ["scaling", "solve", "incompatible", "nopreconditioner"],
    plantMode: "nopreconditioner", plantFlips: "iterRatio", plantKind: "mode",
    name: "multigrid3d-grid-independence",
    observables: MG3D_OBSERVABLES,
    build: buildMG3D,
    defaults: mg3dDefaults,
};

// ---- front door ------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    console.log("[multigrid3d] the property that makes a multigrid a multigrid: THE WORK DOES NOT SCALE WITH THE PROBLEM\n");
    const s = buildMG3D({ mode: "scaling" });
    console.log(`  ${s.cellRatio.toFixed(0)}x the cells (${s.itersSmall} iterations at n=16, ${s.itersLarge} at n=32)` +
        ` -> only ${s.iterRatio.toFixed(2)}x the iterations, ${s.levels} levels, residual ${s.residual.toExponential(2)}`);
    const bad = buildMG3D({ mode: "incompatible" });
    console.log(`\n  AND THE REFUSAL: a right-hand side with NO zero-mean part makes the all-Neumann system singular.`);
    console.log(`  ${bad.iters} iterations (the cap) and the relative residual STALLS at ${bad.residual.toExponential(2)}` +
        ` -- there is no solution to find, and a solver that "converged" here would be the alarming result.`);
    console.log("\n  NOT CLAIMED: that the solver is verified. The discretisation, the Galerkin coarsening, the");
    console.log("  boundary handling and the answer's accuracy against an analytic field all stay UNGRADED.");
}
