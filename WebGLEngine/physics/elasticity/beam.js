// WebGLEngine/physics/elasticity/beam.js — v3319
// ---------------------------------------------------------------------------------------------------------------
// THE CANTILEVER BEAM — continuum mechanics, which this lab had none of, and two exact keys from ONE
// discretisation that fail in different ways.
//
// Euler-Bernoulli: a slender beam resists bending in proportion to the curvature of its centreline,
//
//     EI d4w/dx4 = q(x)
//
// clamped at one end (w = 0, w' = 0) and free at the other (w'' = 0, w''' = 0). One fourth-order operator, one
// pair of boundary conditions at each end, and two completely different questions answered by the same matrix:
//
//   STATIC   -- a point load F at the tip deflects it by exactly
//                   delta = F L^3 / (3 E I)
//               No series, no special functions. A number a first-year exam expects you to know.
//
//   DYNAMIC  -- the free vibration frequencies are set by the roots of
//                   cos(b) cosh(b) = -1
//               b = 1.8751041, 4.6940911, 7.8547574, ... and omega_n = b_n^2 sqrt(EI / (rho A L^4)).
//               A TRANSCENDENTAL condition, so the ratios f2/f1 = 6.2669 and f3/f1 = 17.5475 are irrational
//               numbers that no plausible bug produces by accident.
//
// *** WHY BOTH, AND WHY FROM ONE MATRIX. *** The static test loads the beam and looks at where it ends up; the
// dynamic test never loads it at all and looks at how it rings. They exercise the same fourth-difference stencil
// and the same clamped-free boundary rows, and they are sensitive to different mistakes: a wrong boundary row at
// the free end changes the mode ratios while barely moving the tip deflection, and a wrong EI scaling moves the
// deflection while leaving every ratio untouched. Either alone would miss half of what the other catches.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { symEigenvalues } from "../quantum/rmt.js";   // ONE symmetric eigensolver in this tree, already gated

/** The three lowest roots of cos(b)cosh(b) = -1, to the precision the textbooks quote. */
export const BETA = [1.875104068711961, 4.694091132974175, 7.854757438237613];

/** The closed-form static tip deflection under a point load. */
export const tipDeflection = ({ F = 1, L = 1, E = 1, I = 1 }) => (F * L * L * L) / (3 * E * I);

/** Closed-form natural frequency of mode n (0-based), in rad/s. */
export const naturalOmega = (n, { L = 1, E = 1, I = 1, rho = 1, Aarea = 1 }) =>
    BETA[n] * BETA[n] * Math.sqrt((E * I) / (rho * Aarea * L * L * L * L));

/**
 * Assemble the clamped-free fourth-difference operator on n interior nodes.
 *
 * THE BOUNDARY ROWS ARE THE WHOLE DIFFICULTY and they are written out rather than hidden in a loop. The clamped
 * end contributes ghost values w[-1] = w[1] (zero slope) and w[0] = 0; the free end needs zero curvature and
 * zero shear, which after eliminating two ghosts turns the last two rows into [.., 5, -4] and [.., -2, 2] rather
 * than the interior [1, -4, 6, -4, 1]. Get those four numbers wrong and the beam still bends -- it just rings at
 * the wrong frequencies, which is exactly what the dynamic key is for.
 */
// *** THE LAST ROW IS A HALF CELL, AND WRITING IT AS A WHOLE ONE BROKE TWO THINGS AT ONCE. ***
// The natural free-end row is [2, -4, 2], which gives K[n-1][n-2] = -4 while K[n-2][n-1] = -2: the matrix is
// ASYMMETRIC. That is not cosmetic. It halves the tip stiffness, so the static deflection came out at exactly
// FL^3/(6EI) -- converging cleanly to the wrong constant, 0.166669 against 0.333333, which looks like a settled
// answer rather than a bug. And it fed a non-symmetric matrix to a solver that assumes symmetry, which returned
// a spurious ZERO eigenvalue and a first mode of 0.0000 against 3.516.
// Scaling the row by a half restores symmetry and fixes both, because both were the same mistake.
export function stiffness(n) {
    const K = Array.from({ length: n }, () => new Float64Array(n));
    const set = (i, j, v) => { if (j >= 0 && j < n) K[i][j] += v; };
    for (let i = 0; i < n; i++) {
        if (i === n - 1) {            // free end: last row, HALF-CELL SCALED -- see below
            set(i, i, 1); set(i, i - 1, -2); set(i, i - 2, 1);
        } else if (i === n - 2) {     // free end: second-to-last row
            set(i, i + 1, -2); set(i, i, 5); set(i, i - 1, -4); set(i, i - 2, 1);
        } else if (i === 0) {         // clamped end: the ghost w[-1] = w[1] folds a +1 onto the diagonal
            set(i, i, 7); set(i, i + 1, -4); set(i, i + 2, 1);
        } else {
            set(i, i - 2, 1); set(i, i - 1, -4); set(i, i, 6); set(i, i + 1, -4); set(i, i + 2, 1);
        }
    }
    return K;
}

/** Solve K w = f by Gaussian elimination with partial pivoting. Small n, exact enough, no library. */
export function solve(K, f) {
    const n = f.length;
    const M = K.map((row, i) => Float64Array.from([...row, f[i]]));
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        const d = M[c][c];
        for (let j = c; j <= n; j++) M[c][j] /= d;
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const g = M[r][c];
            if (g === 0) continue;
            for (let j = c; j <= n; j++) M[r][j] -= g * M[c][j];
        }
    }
    return Float64Array.from({ length: n }, (_, i) => M[i][n]);
}

/** Static tip deflection, measured off the grid. A tip point load is a single entry in f. */
export function measureTipDeflection({ n = 200, L = 1, E = 1, I = 1, F = 1 } = {}) {
    const h = L / n;
    const K = stiffness(n);
    const f = new Float64Array(n);
    // A POINT LOAD IS NOT A NODAL VALUE OF q. The fourth-order equation discretises to K w = q h^4/(EI),
    // but a tip force F spread over one cell is q = F/h, so the entry is F h^3/(EI). Using F h^4/(EI) made
    // the deflection a factor of h too small -- measured 0.003334 against 0.333333 at n=50, a clean 1/n that
    // reads as a convergence failure rather than a units error until you notice it tracks n exactly.
    f[n - 1] = F * h * h * h / (E * I);
    const w = solve(K, f);
    return { tip: w[n - 1], exact: tipDeflection({ F, L, E, I }), w, h };
}

/**
 * The lowest eigenvalues of K by inverse power iteration with deflation. Returns omega for each mode.
 * omega^2 = (EI / (rho A)) * lambda / h^4, with lambda the eigenvalue of the fourth-difference matrix.
 */
// *** THE EIGENSOLVER IS IMPORTED, NOT WRITTEN AGAIN. *** physics/quantum/rmt.js already carries Householder
// tridiagonalisation plus implicit-shift QL, gated there against spectra known in closed form. The first version
// of this file hand-rolled inverse iteration with deflation, got the first two modes to four digits and the
// THIRD one badly wrong, because deflation in the wrong inner product loses orthogonality. There is one
// symmetric eigensolver in this tree and this is not a second one.
export function measureModes({ n = 120, L = 1, E = 1, I = 1, rho = 1, Aarea = 1, count = 3 } = {}) {
    const h = L / n;
    const K = stiffness(n);
    const flat = new Float64Array(n * n);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) flat[a * n + b] = K[a][b];
    const lambdas = symEigenvalues(flat, n).slice(0, count);     // ascending, so the softest modes first
    const omegas = lambdas.map((lam) => Math.sqrt(Math.max(0, lam) * (E * I) / (rho * Aarea)) / (h * h));
    return { omegas, lambdas, h,
             exact: Array.from({ length: count }, (_, m) => naturalOmega(m, { L, E, I, rho, Aarea })) };
}
