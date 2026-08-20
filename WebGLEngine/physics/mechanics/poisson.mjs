// WebGLEngine/physics/mechanics/poisson.mjs -- v3430
//
// POISSON BRACKETS, AND THE CONDITION ELEVEN MODULES ASSERT AND ONE CHECKS.
//
// *** THE FINDING THAT MOTIVATED THIS FILE: "symplectic" IS USED BY TWELVE MODULES UNDER physics/ AND THE
// CONDITION IS RE-DERIVED IN EXACTLY ONE, hmc's 4x4 Jacobian determinant. *** I COUNTED ELEVEN BY HAND AND THE
// WALK SAYS TWELVE; the walk wins, and the gate re-derives it every run rather than trusting either -- A NUMBER
// THAT NOTHING DERIVES IS A MEMORY, AND MEMORIES ARE WRONG BY ONE. That is this project's signature defect
// wearing a new subject: A PROPERTY WRITTEN DOWN IN TWELVE FILES WHERE NOTHING RECOMPUTES IT.
//
// A Poisson bracket is what "symplectic" MEANS. {f,g} = sum_i (df/dq_i dg/dp_i - df/dp_i dg/dq_i), and a map is
// symplectic exactly when it PRESERVES brackets. So one definition here gives every integrator in the tree the
// same checkable statement, and the check that says velocity-Verlet is symplectic is the same check that must
// say RK4 is not.
//
// *** AND THE TRAP IS NAMED BEFORE IT IS WALKED INTO, BECAUSE THIS SESSION HAS FOUND IT FIVE TIMES: THE JACOBI
// IDENTITY IS AN EXACT IDENTITY AND IT CANNOT SEE A BROKEN INTEGRATOR. *** It holds for any smooth f, g and h
// whatever map you are stepping with, because it is a property OF THE BRACKET rather than of the dynamics.
// Jacobi tests the bracket implementation; PRESERVATION tests the map. Two different questions that both sound
// like "is this symplectic", and conflating them would hand back a satisfied identity as proof of a property it
// has no contact with -- Friedmann's Omega closure in a different subject.
//
// Everything is central differences and arithmetic: no transcendental, deterministic and cross-arch.
"use strict";

/** Central-difference partial of a scalar field over a flat [q..., p...] state vector. */
function d(f, z, i, eps) {
    const a = z.slice(), b = z.slice();
    a[i] += eps; b[i] -= eps;
    return (f(a) - f(b)) / (2 * eps);
}

/**
 * {f,g} over n degrees of freedom, on a state laid out as [q_0..q_{n-1}, p_0..p_{n-1}].
 *
 * `dropSecond` is the PLANTED wrong bracket: keep df/dq dg/dp and drop df/dp dg/dq. It is what you write if you
 * read the definition as a product rule rather than an antisymmetric pairing. *** IT LEAVES {q,p} = 1 EXACTLY
 * RIGHT, because the dropped term vanishes for that pair -- so the canonical check cannot see it and
 * antisymmetry catches it outright. ***
 */
export function bracket(f, g, z, n, { eps = 1e-5, dropSecond = false } = {}) {
    let s = 0;
    for (let i = 0; i < n; i++) {
        const fq = d(f, z, i, eps), gp = d(g, z, n + i, eps);
        const fp = d(f, z, n + i, eps), gq = d(g, z, i, eps);
        s += dropSecond ? fq * gp : fq * gp - fp * gq;
    }
    return s;
}

/** The Jacobi sum {f,{g,h}} + {g,{h,f}} + {h,{f,g}}, which must vanish. */
export function jacobi(f, g, h, z, n, opts = {}) {
    const B = (u, v) => (w) => bracket(u, v, w, n, opts);
    return bracket(f, B(g, h), z, n, opts) + bracket(g, B(h, f), z, n, opts) + bracket(h, B(f, g), z, n, opts);
}

/** The 2n x 2n symplectic form J: [[0, I], [-I, 0]]. */
export function J(n) {
    const m = Array.from({ length: 2 * n }, () => new Float64Array(2 * n));
    for (let i = 0; i < n; i++) { m[i][n + i] = 1; m[n + i][i] = -1; }
    return m;
}

/** Numerical Jacobian of a map z -> map(z), by central differences. NO symplectic theory anywhere in it. */
export function jacobian(map, z, eps = 1e-6) {
    const N = z.length, M = Array.from({ length: N }, () => new Float64Array(N));
    for (let j = 0; j < N; j++) {
        const a = z.slice(), b = z.slice();
        a[j] += eps; b[j] -= eps;
        const fa = map(a), fb = map(b);
        for (let i = 0; i < N; i++) M[i][j] = (fa[i] - fb[i]) / (2 * eps);
    }
    return M;
}

/**
 * *** THE CONDITION ITSELF: a map is symplectic exactly when M^T J M = J. *** Returns the worst absolute
 * element of the defect, which is ZERO for a symplectic map and a POSITIVE NUMBER WITH A KNOWN SIZE for the
 * others -- explicit Euler on a harmonic oscillator gives exactly dt^2, which is a prediction rather than a
 * tolerance.
 */
export function symplecticDefect(map, z, eps = 1e-6) {
    const M = jacobian(map, z, eps), N = z.length, n = N / 2, Jm = J(n);
    let worst = 0;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            let s = 0;
            for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) s += M[a][i] * Jm[a][b] * M[b][j];
            worst = Math.max(worst, Math.abs(s - Jm[i][j]));
        }
    }
    return worst;
}

// ---------------------------------------------------------------------------------------------------------------
// FOUR STEPPERS ON THE UNIT HARMONIC OSCILLATOR, H = (q^2 + p^2)/2. One degree of freedom, exact by hand, and
// the cheapest fixture that can tell a symplectic map from a plausible one.
// ---------------------------------------------------------------------------------------------------------------
export const H = (z) => (z[0] * z[0] + z[1] * z[1]) / 2;
const dHdq = (q) => q, dHdp = (p) => p;

/** Velocity Verlet -- the integrator eleven files in this tree call symplectic. */
export const verletStep = (dt) => ([q, p]) => {
    const pHalf = p - (dt / 2) * dHdq(q);
    const q1 = q + dt * dHdp(pHalf);
    return [q1, pHalf - (dt / 2) * dHdq(q1)];
};
/** Explicit (forward) Euler. Its map is [[1, dt], [-dt, 1]], whose determinant is EXACTLY 1 + dt^2. */
export const eulerStep = (dt) => ([q, p]) => [q + dt * dHdp(p), p - dt * dHdq(q)];
/** Semi-implicit (symplectic) Euler -- first order AND symplectic, so order and symplecticity come apart. */
export const semiEulerStep = (dt) => ([q, p]) => { const p1 = p - dt * dHdq(q); return [q + dt * dHdp(p1), p1]; };
/** Classical RK4 -- fourth order and NOT symplectic, which is the pair the lab has always described in prose. */
export const rk4Step = (dt) => (z) => {
    const f = ([q, p]) => [dHdp(p), -dHdq(q)];
    const add = (a, b, s) => [a[0] + s * b[0], a[1] + s * b[1]];
    const k1 = f(z), k2 = f(add(z, k1, dt / 2)), k3 = f(add(z, k2, dt / 2)), k4 = f(add(z, k3, dt));
    return [z[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
            z[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
};

export const STEPPERS = { verlet: verletStep, semiEuler: semiEulerStep, euler: eulerStep, rk4: rk4Step };
