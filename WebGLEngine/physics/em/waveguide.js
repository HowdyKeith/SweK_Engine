// WebGLEngine/physics/em/waveguide.js — v3408
// ---------------------------------------------------------------------------------------------------------------
// RECTANGULAR WAVEGUIDE CUTOFFS — and the boundary condition IS the physics.
//
// A hollow metal pipe carries no wave at all below a cutoff frequency, and above it carries a discrete set of
// modes. Both facts come from one 2D eigenproblem on the cross-section,
//
//     laplacian(psi) + kc^2 psi = 0,      f_c = c kc / (2 pi)
//
// with the exact answer kc = pi sqrt((m/a)^2 + (n/b)^2), so for a guide of width a and height b every cutoff is
// a closed form and the SET of allowed (m, n) is the interesting part:
//
//     TM modes -- psi = Ez, which must VANISH on a conductor: DIRICHLET, and m,n >= 1. No TM01, no TM10.
//     TE modes -- psi = Hz, whose normal derivative vanishes: NEUMANN, and m,n >= 0 but not both zero.
//
// *** SO TE AND TM DIFFER ONLY IN A BOUNDARY CONDITION, AND THAT DIFFERENCE DECIDES WHICH MODE IS DOMINANT. ***
// For the standard a = 2b guide the lowest TE cutoff is TE10 at f = c/(2a); the lowest TM is TM11, higher by a
// factor of sqrt(5) = 2.236. A solver that swapped Dirichlet for Neumann would report a guide that cannot carry
// its dominant mode -- and would still return a tidy list of plausible frequencies, which is why the mode SET is
// checked here and not only the numbers.
//
// THE SOLVER DOES NOT KNOW THE ANSWER SEPARATES. The rectangle's eigenvalues happen to split into an x part and
// a y part, and the exact formula is built from that. This assembles the FULL 2D Laplacian on the cross-section
// and diagonalises it, so agreement with pi sqrt((m/a)^2 + (n/b)^2) is a result rather than a restatement of the
// method. A separable solver checked against a separable formula would be marking its own homework.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { C_DEFINED } from "./maxwell.mjs";
import { symEigenvalues } from "../quantum/rmt.js";   // the one symmetric eigensolver in this tree

/** Exact cutoff wavenumber for mode (m, n) of an a-by-b guide. */
export const cutoffK = (m, n, a, b) => Math.PI * Math.hypot(m / a, n / b);

/** Exact cutoff frequency, in Hz, using the defined speed of light. */
export const cutoffFrequency = (m, n, a, b, c = C_DEFINED) => c * cutoffK(m, n, a, b) / (2 * Math.PI);

/** The exact mode list for a given family, sorted by cutoff. TM excludes any index of zero; TE excludes (0,0). */
export function exactModes(kind, a, b, count = 6, maxIndex = 6) {
    const out = [];
    for (let m = 0; m <= maxIndex; m++) for (let n = 0; n <= maxIndex; n++) {
        if (kind === "TM" && (m === 0 || n === 0)) continue;
        if (kind === "TE" && m === 0 && n === 0) continue;
        out.push({ m, n, k: cutoffK(m, n, a, b) });
    }
    out.sort((p, q) => p.k - q.k);
    return out.slice(0, count);
}

/**
 * The 2D Laplacian on an nx-by-ny grid over the cross-section, as a dense symmetric matrix.
 *
 * DIRICHLET (TM) uses INTERIOR nodes only, so the wall value of zero never enters the unknowns. NEUMANN (TE)
 * uses cell centres with a mirrored ghost outside each wall, which folds a +1 onto the diagonal there -- the
 * same ghost-fold idea the beam's clamped row uses, and the same reason it must be written carefully: a Neumann
 * matrix assembled as if it were Dirichlet is still symmetric, still gives real eigenvalues, and describes a
 * different pipe.
 */
export function laplacian2D({ nx, ny, a, b, neumann = false }) {
    const hx = a / (neumann ? nx : nx + 1), hy = b / (neumann ? ny : ny + 1);
    const N = nx * ny;
    const A = new Float64Array(N * N);
    const ix = (i, j) => j * nx + i;
    const cx = 1 / (hx * hx), cy = 1 / (hy * hy);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const r = ix(i, j);
        let diag = 2 * cx + 2 * cy;
        if (i > 0) A[r * N + ix(i - 1, j)] -= cx; else if (neumann) diag -= cx;   // mirrored ghost
        if (i < nx - 1) A[r * N + ix(i + 1, j)] -= cx; else if (neumann) diag -= cx;
        if (j > 0) A[r * N + ix(i, j - 1)] -= cy; else if (neumann) diag -= cy;
        if (j < ny - 1) A[r * N + ix(i, j + 1)] -= cy; else if (neumann) diag -= cy;
        A[r * N + r] += diag;
    }
    return { A, N };
}

/**
 * Measured cutoff wavenumbers. The eigenvalues of -laplacian are kc^2, so kc is their square root; the TE family
 * carries one exact ZERO eigenvalue (the constant mode, which is not a propagating mode) and it is dropped by
 * name rather than by a tolerance -- it is zero because a constant has no curvature, not because it is small.
 */
export function measureCutoffs({ kind = "TE", nx = 24, ny = 12, a = 2, b = 1, count = 5 } = {}) {
    const { A, N } = laplacian2D({ nx, ny, a, b, neumann: kind === "TE" });
    const ev = symEigenvalues(A, N);
    const kept = kind === "TE" ? ev.slice(1) : ev;      // drop the constant mode for Neumann
    const ks = kept.slice(0, count).map((v) => Math.sqrt(Math.max(0, v)));
    return { ks, dropped: kind === "TE" ? ev[0] : null, exact: exactModes(kind, a, b, count).map((m) => m.k),
             modes: exactModes(kind, a, b, count) };
}
