// WebGLEngine/physics/elasticity/buckling.js — v3407
// ---------------------------------------------------------------------------------------------------------------
// EULER BUCKLING — a THIRD exact key on the SAME discretisation the static and vibration keys already use.
//
// Load a column hard enough along its own axis and it does not squash: it snaps sideways. The load at which it
// does is exact, and for a clamped-free column it is
//
//     P_cr = pi^2 EI / (4 L^2)   ->   P_cr L^2 / (EI) = pi^2/4 = 2.467401
//
// with higher modes at the odd squares, P_n = (2n-1)^2 pi^2 EI / (4L^2), so the ratios 9 and 25 are INTEGERS that
// no plausible discretisation error produces by accident.
//
// *** WHY THIS IS WORTH HAVING WHEN THE BEAM ALREADY HAS TWO KEYS. *** Static deflection loads the beam and asks
// where it ends up; vibration never loads it and asks how it rings; buckling asks WHEN IT STOPS BEING STABLE.
// All three run through the same fourth-difference operator and the same clamped-free boundary rows, and v3319
// already showed the first two catch different faults -- one wrong row broke both at once while giving each a
// plausible-looking wrong answer. A third independent question on the same matrix is a real test of the
// operator, not a repeat of the first two.
//
// THE EIGENPROBLEM. Under axial compression P the Euler-Bernoulli equation gains a term:
//
//     EI w'''' + P w'' = 0
//
// which discretises to (EI/h^4) K w = -(P/h^2) G w, with K the existing fourth-difference bending matrix and G
// the second-difference geometric matrix. So P = mu EI / h^2 for mu an eigenvalue of K v = mu (-G) v.
//
// *** THE TRAP, AND IT IS A REAL ONE: THE FREE-END SHEAR CONDITION CHANGES UNDER AXIAL LOAD. *** With no axial
// load the free end has w''' = 0. With it, force balance gives w''' + (P/EI) w' = 0 -- the axial force has a
// transverse component once the column has tilted. A buckling code that reuses the unloaded shear row is solving
// a subtly different problem, and it still returns a plausible number. That condition is folded into G's last
// rows rather than K's, which is what keeps the existing stiffness matrix untouched and shared.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { stiffness } from "./beam.js";
import { symEigenvalues } from "../quantum/rmt.js";   // the one symmetric eigensolver in this tree

/** The exact critical loads, in units of EI/L^2. Odd squares times pi^2/4. */
export const criticalLoad = (n = 1, { L = 1, E = 1, I = 1 } = {}) =>
    Math.pow(2 * n - 1, 2) * Math.PI * Math.PI * E * I / (4 * L * L);

/**
 * Geometric stiffness: the second-difference operator on the same node set, carrying the CLAMPED-FREE conditions.
 * Returned as -G so the generalized problem K v = mu (-G) v has positive eigenvalues.
 *
 * The clamped row folds the ghost w[-1] = w[1] exactly as K's does; the free end is a half cell for the same
 * reason K's last row is, and getting that wrong is what makes the matrix asymmetric (v3319 caught precisely
 * that, twice, from two different symptoms).
 */
// *** WRITTEN AS AN ENERGY FORM, BECAUSE HAND-ROLLING THE ROWS PRODUCED A SPURIOUS MODE. ***
// The first version set the second-difference rows directly, with a ghost fold at the clamped end and a half
// cell at the free end to mirror K. It returned a lowest "critical load" of 0.152, then 0.076, then 0.038 as
// the grid refined -- HALVING WITH n, which is the signature of a null-space artefact rather than a physical
// load, and it sat below the true answer of 2.467 where nobody reading a buckling result would be pleased to
// find it.
//
// The geometric stiffness is the discrete form of the axial energy integral of the squared slope, so writing
// it as D^T D with D the first-difference operator makes it SYMMETRIC AND POSITIVE DEFINITE BY CONSTRUCTION
// rather than by hand-checking. D row 0 is w[0] minus zero: the wall sits one node before the first interior
// node and its displacement is zero, so the clamped condition enters as arithmetic instead of as a special
// case. The free end needs no row at all -- it is the NATURAL boundary of the energy, which is exactly the
// condition a hand-written shear row gets subtly wrong once an axial load tilts the column.
export function geometricStiffness(n) {
    const G = Array.from({ length: n }, () => new Float64Array(n));
    for (let r = 0; r < n; r++) {
        // row r of D: +1 at r, -1 at r-1 (absent at r = 0, where the wall supplies the zero)
        const idx = r === 0 ? [[r, 1]] : [[r, 1], [r - 1, -1]];
        for (const [i, a] of idx) for (const [j, b] of idx) G[i][j] += a * b;
    }
    return G;
}

/** Cholesky of a symmetric positive-definite matrix, for reducing the generalized problem to a standard one. */
function cholesky(M, n) {
    const Lm = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let s = M[i][j];
            for (let k = 0; k < j; k++) s -= Lm[i][k] * Lm[j][k];
            if (i === j) {
                if (s <= 0) return null;   // not positive definite: reported, never patched over
                Lm[i][i] = Math.sqrt(s);
            } else Lm[i][j] = s / Lm[j][j];
        }
    }
    return Lm;
}

/** Solve L y = b for lower-triangular L. */
function forwardSolve(Lm, b, n) {
    const y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        let s = b[i];
        for (let k = 0; k < i; k++) s -= Lm[i][k] * y[k];
        y[i] = s / Lm[i][i];
    }
    return y;
}

/**
 * The critical loads, measured. Reduces K v = mu G v to a standard symmetric problem via Cholesky on G:
 * with G = L L^T, the eigenvalues of L^-1 K L^-T are exactly the mu wanted, and the matrix stays symmetric so
 * the existing solver applies unchanged.
 */
export function measureBuckling({ n = 100, L = 1, E = 1, I = 1, count = 3 } = {}) {
    const h = L / n;
    const K = stiffness(n), G = geometricStiffness(n);
    const Lm = cholesky(G, n);
    if (!Lm) return { loads: null, why: "geometric stiffness is not positive definite" };

    // A = L^-1 K L^-T, built column by column: solve L X = K, then L Y = X^T.
    const X = Array.from({ length: n }, (_, j) => forwardSolve(Lm, K.map((r) => r[j]), n));
    const A = new Float64Array(n * n);
    for (let j = 0; j < n; j++) {
        const col = forwardSolve(Lm, Float64Array.from({ length: n }, (_, i) => X[i][j]), n);
        for (let i = 0; i < n; i++) A[i * n + j] = col[i];
    }
    // symmetrise against round-off: the reduction is symmetric in exact arithmetic and drifts by ~1e-15
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const m = 0.5 * (A[i * n + j] + A[j * n + i]);
        A[i * n + j] = A[j * n + i] = m;
    }
    const mu = symEigenvalues(A, n).slice(0, count);
    // P = mu EI / h^2, and h^2 carries the grid: the eigenvalue is dimensionless
    const loads = mu.map((m) => m * E * I / (h * h));
    return { loads, mu, h, exact: Array.from({ length: count }, (_, k) => criticalLoad(k + 1, { L, E, I })) };
}
