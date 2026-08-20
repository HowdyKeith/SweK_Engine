// WebGLEngine/physics/quantum/kronigPenney.js — v3320
// ---------------------------------------------------------------------------------------------------------------
// BAND STRUCTURE, AND THE FORBIDDEN GAPS ARE THE FALSIFIER.
//
// An electron in a periodic potential cannot have just any energy. Bloch's theorem turns the infinite lattice
// into a condition on one cell, and for a square barrier of height V0 and width b in a period L = a + b the
// condition is a transcendental relation that is EXACT:
//
//     cos(kL) = cos(alpha a) cosh(beta b) + ((beta^2 - alpha^2)/(2 alpha beta)) sin(alpha a) sinh(beta b)
//
// with alpha = sqrt(2mE)/hbar and beta = sqrt(2m(V0-E))/hbar below the barrier (and beta -> i beta above it,
// which turns the cosh/sinh into cos/sin). An energy is ALLOWED when the right-hand side lands in [-1, 1] and
// FORBIDDEN when it does not. There is no approximation anywhere in that statement.
//
// *** THE BAND EDGES ARE WHERE THIS GETS SHARP. *** cos(kL) = +1 at k = 0 and -1 at k = pi/L, so every band edge
// is an exact root of RHS(E) = +-1 -- findable by bisection to machine precision, and a number the numerical
// solver is never told.
//
// AND THOSE TWO POINTS ARE EXACTLY WHERE THE BLOCH HAMILTONIAN IS REAL. At general k the periodic boundary
// carries a phase e^{ikL} and the matrix is complex; at k = 0 it is periodic and at k = pi/L it is
// ANTIperiodic, both real symmetric. So the band edges -- the only energies with an exact closed form -- are
// precisely the ones a real symmetric eigensolver can reach. The tree already has one, gated, in
// physics/quantum/rmt.js.
//
// THE FALSIFIER IS THE GAP: no computed eigenvalue may sit strictly inside a forbidden interval. A band-structure
// code that put a state in a gap would be wrong in the way that matters, and unlike a tolerance this is a
// yes-or-no question about a region the theory declares empty.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { symEigenvalues } from "./rmt.js";

// hbar = m = 1 throughout, so alpha = sqrt(2E) and beta = sqrt(2(V0 - E)).

/**
 * The right-hand side of the Kronig-Penney relation. Allowed energies are those with |rhs| <= 1.
 * Handles both branches: below the barrier (real beta, cosh/sinh) and above it (imaginary beta, cos/sin).
 */
export function kpRhs(E, { V0 = 20, a = 1, b = 0.2 } = {}) {
    if (E <= 0) return Infinity;
    const alpha = Math.sqrt(2 * E);
    if (Math.abs(E - V0) < 1e-12) {
        // the removable point E = V0: beta -> 0 and the bracket tends to a finite limit
        return Math.cos(alpha * a) - (alpha * b / 2) * Math.sin(alpha * a);
    }
    if (E < V0) {
        const beta = Math.sqrt(2 * (V0 - E));
        return Math.cos(alpha * a) * Math.cosh(beta * b)
             + ((beta * beta - alpha * alpha) / (2 * alpha * beta)) * Math.sin(alpha * a) * Math.sinh(beta * b);
    }
    const g = Math.sqrt(2 * (E - V0));      // above the barrier: cosh -> cos, sinh -> sin, and the sign flips
    return Math.cos(alpha * a) * Math.cos(g * b)
         - ((g * g + alpha * alpha) / (2 * alpha * g)) * Math.sin(alpha * a) * Math.sin(g * b);
}

export const isAllowed = (E, p) => Math.abs(kpRhs(E, p)) <= 1;

/**
 * Band edges by bisection on |rhs| = 1. Scans upward for sign changes of (|rhs| - 1) and refines each.
 * Returns a flat ascending list of edge energies; consecutive pairs alternate band, gap, band, gap...
 */
export function bandEdges({ V0 = 20, a = 1, b = 0.2, eMax = 60, samples = 20000, iters = 90 } = {}) {
    const p = { V0, a, b };
    const f = (E) => Math.abs(kpRhs(E, p)) - 1;
    const edges = [];
    const dE = eMax / samples;
    let prevE = 1e-6, prevF = f(prevE);
    for (let i = 1; i <= samples; i++) {
        const E = i * dE, fv = f(E);
        if (Number.isFinite(prevF) && Number.isFinite(fv) && prevF * fv < 0) {
            let lo = prevE, hi = E;
            for (let k = 0; k < iters; k++) {
                const mid = 0.5 * (lo + hi);
                if (f(lo) * f(mid) <= 0) hi = mid; else lo = mid;
            }
            edges.push(0.5 * (lo + hi));
        }
        prevE = E; prevF = fv;
    }
    return edges;
}

/** The forbidden intervals, derived from the edges by asking which side is allowed. */
export function gaps(edges, p) {
    const out = [];
    for (let i = 0; i + 1 < edges.length; i++) {
        const mid = 0.5 * (edges[i] + edges[i + 1]);
        if (!isAllowed(mid, p)) out.push([edges[i], edges[i + 1]]);
    }
    return out;
}

/**
 * The numerical side: a Bloch Hamiltonian on one period, discretised, at k = 0 (periodic) or k = pi/L
 * (antiperiodic). Both are REAL SYMMETRIC, which is exactly why the band edges are the reachable energies.
 *
 * The wrap element carries the sign: +1 for periodic, -1 for antiperiodic. That single sign is the whole of
 * Bloch's theorem at these two special points, and getting it wrong swaps every band edge with its neighbour.
 */
export function blochSpectrum({ V0 = 20, a = 1, b = 0.2, n = 600, antiperiodic = false, count = 8, offDiag = -0.5 } = {}) {
    const L = a + b, dx = L / n;
    const H = new Float64Array(n * n);
    const inv = 1 / (dx * dx);
    const sign = antiperiodic ? -1 : 1;
    for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * dx;
        const V = (x > a) ? V0 : 0;                       // barrier occupies the last b of the cell
        H[i * n + i] = inv + V;                           // -(1/2) d2/dx2 with hbar = m = 1 gives +1/dx^2 on the diagonal
        const jp = (i + 1) % n, jm = (i - 1 + n) % n;
        const wrapP = (i === n - 1) ? sign : 1;
        const wrapM = (i === 0) ? sign : 1;
        // *** v3765 -- `offDiag` DEFAULTS TO THE CORRECT -0.5 AND EXISTS SO A PLANT CAN SIT ON THE STENCIL.
        // -(1/2) d2/dx2 on a 3-point stencil is +1/dx^2 on the diagonal and -0.5/dx^2 either side, and THE
        // ROW MUST SUM TO ZERO WHERE V = 0 -- a constant wavefunction is a zero-energy eigenstate of the
        // kinetic operator. Using -1/dx^2 off the diagonal is the classic slip (forgetting the 1/2 in front of
        // the Laplacian) and it BREAKS THAT SUM RULE while still producing a symmetric, real, perfectly
        // diagonalisable matrix with a plausible spectrum. ***
        H[i * n + jp] += offDiag * inv * wrapP;
        H[i * n + jm] += offDiag * inv * wrapM;
    }
    return symEigenvalues(H, n).slice(0, count);
}

/** Numerical band edges: the k = 0 and k = pi/L spectra merged and sorted. */
export function numericEdges(opts = {}) {
    const per = blochSpectrum({ ...opts, antiperiodic: false });
    const anti = blochSpectrum({ ...opts, antiperiodic: true });
    return { periodic: per, antiperiodic: anti, all: [...per, ...anti].sort((x, y) => x - y) };
}
