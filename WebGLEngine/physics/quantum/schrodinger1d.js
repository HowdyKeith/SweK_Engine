// physics/quantum/schrodinger1d.js
//
// THE 1D SCHRODINGER EQUATION -- v2822. A new branch for the lab: quantum mechanics, and it earns its place
// because it carries FOUR INDEPENDENT exact answers, each failing in a different way.
//
//   INFINITE SQUARE WELL   E_n = n^2 pi^2 / (2 m L^2). The levels go as n SQUARED -- so the SPACING widens.
//   HARMONIC OSCILLATOR    E_n = (n + 1/2) hbar omega. The levels are EQUALLY SPACED, and the ground state sits
//                          at half a quantum above the floor rather than at zero. Two sharp claims in one
//                          system, and they are the OPPOSITE shape to the well's -- a solver that fudged one
//                          would break the other.
//   BARRIER TUNNELLING     a particle below the barrier top still gets through, with a closed-form transmission
//                          coefficient. Classically zero; quantum mechanically not.
//   NORM CONSERVATION      a running invariant during time evolution: probability must total 1 forever.
//
// HOW THE LEVELS ARE FOUND: discretise -hbar^2/2m d^2/dx^2 + V(x) on a uniform grid and the Hamiltonian is
// SYMMETRIC TRIDIAGONAL. Its eigenvalues then follow from STURM SEQUENCE BISECTION -- count how many eigenvalues
// lie below a trial energy by walking a recurrence and counting sign changes, then bisect. No matrix library,
// no iteration to converge, and the count itself is exact integer arithmetic, so the only error is the grid.
//
// UNITS: hbar = m = 1 throughout, so energies are in the natural units of whatever length scale is chosen.
// Pure, no imports, browser-safe.

export const PI2 = Math.PI * Math.PI;

// Exact levels, for grading against.
export const wellLevel = (n, L = 1, m = 1) => (n * n * PI2) / (2 * m * L * L);          // n = 1, 2, 3, ...
export const oscillatorLevel = (n, omega = 1) => (n + 0.5) * omega;                      // n = 0, 1, 2, ...

// Closed-form transmission through a rectangular barrier of height V0 and width a, at energy E.
// Below the top it is the sinh form; above it the sin form; at E == V0 the limit is algebraic.
export function barrierTransmission(E, V0, a, m = 1) {
    if (E <= 0) return 0;
    if (Math.abs(E - V0) < 1e-12) {
        const k = Math.sqrt(2 * m * E);
        return 1 / (1 + (m * V0 * a * a) / 2);            // the E -> V0 limit
    }
    if (E < V0) {
        const kappa = Math.sqrt(2 * m * (V0 - E));
        const s = Math.sinh(kappa * a);
        return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
    }
    const k2 = Math.sqrt(2 * m * (E - V0));
    const s = Math.sin(k2 * a);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
}

// ---- the discretised Hamiltonian ---------------------------------------------------------------------
// Dirichlet walls at both ends (psi = 0 outside), which is exactly the infinite-well boundary condition.
export function hamiltonian({ N = 400, L = 1, potential = () => 0, m = 1 }) {
    const dx = L / (N + 1);
    const t = 1 / (2 * m * dx * dx);                       // hopping term hbar^2/(2 m dx^2)
    const diag = new Float64Array(N), off = new Float64Array(Math.max(0, N - 1));
    for (let i = 0; i < N; i++) diag[i] = 2 * t + potential((i + 1) * dx);
    for (let i = 0; i < N - 1; i++) off[i] = -t;
    return { diag, off, dx, N, L };
}

// STURM SEQUENCE: how many eigenvalues of the symmetric tridiagonal matrix lie strictly below `x`.
// Counting sign changes in the leading principal minors -- exact integer arithmetic, no convergence needed.
export function countBelow(diag, off, x) {
    let count = 0, d = diag[0] - x;
    if (d < 0) count++;
    for (let i = 1; i < diag.length; i++) {
        if (d === 0) d = 1e-300;                            // step off an exact zero rather than divide by it
        d = (diag[i] - x) - (off[i - 1] * off[i - 1]) / d;
        if (d < 0) count++;
    }
    return count;
}

// The k-th eigenvalue (0-based) by bisection on the Sturm count.
export function eigenvalue(diag, off, k, { lo = null, hi = null, iters = 200 } = {}) {
    let a = lo, b = hi;
    if (a === null || b === null) {
        // Gershgorin bounds: every eigenvalue lies inside these
        let mn = Infinity, mx = -Infinity;
        for (let i = 0; i < diag.length; i++) {
            const r = (i > 0 ? Math.abs(off[i - 1]) : 0) + (i < off.length ? Math.abs(off[i]) : 0);
            mn = Math.min(mn, diag[i] - r); mx = Math.max(mx, diag[i] + r);
        }
        a = mn - 1; b = mx + 1;
    }
    for (let i = 0; i < iters; i++) {
        const mid = 0.5 * (a + b);
        if (countBelow(diag, off, mid) > k) b = mid; else a = mid;
        if (b - a < 1e-13 * (1 + Math.abs(a))) break;
    }
    return 0.5 * (a + b);
}

export function levels({ N = 400, L = 1, potential = () => 0, m = 1, count = 5 }) {
    const H = hamiltonian({ N, L, potential, m });
    const out = [];
    for (let k = 0; k < count; k++) out.push(eigenvalue(H.diag, H.off, k));
    return out;
}

// Convenience: the two systems with exact spectra.
export const squareWellLevels = (opts = {}) => levels({ L: opts.L || 1, N: opts.N || 600, count: opts.count || 5, potential: () => 0, m: opts.m || 1 });
export function oscillatorLevels({ omega = 1, N = 900, span = 12, count = 5, m = 1 } = {}) {
    // centre a harmonic well in a box wide enough that the wavefunction has died before the walls
    const L = span / Math.sqrt(m * omega);
    const c = L / 2;
    return levels({ N, L, m, count, potential: (x) => 0.5 * m * omega * omega * (x - c) * (x - c) });
}

// ---- time evolution (Crank-Nicolson, unitary by construction) -----------------------------------------
// The propagator (1 + i H dt/2)^-1 (1 - i H dt/2) is unitary, so NORM IS CONSERVED EXACTLY up to round-off --
// which makes the measured norm a running check that the solve itself is sane, not a property to be tuned.
export function evolve({ N = 400, L = 1, potential = () => 0, m = 1, dt = 1e-4, steps = 200, psi0 }) {
    const H = hamiltonian({ N, L, potential, m });
    const dx = H.dx;
    let re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) { const z = psi0((i + 1) * dx); re[i] = z[0]; im[i] = z[1]; }
    const norm = () => { let s = 0; for (let i = 0; i < N; i++) s += re[i] * re[i] + im[i] * im[i]; return s * dx; };
    const n0 = norm();
    const sc = 1 / Math.sqrt(n0);
    for (let i = 0; i < N; i++) { re[i] *= sc; im[i] *= sc; }

    // Solve the complex tridiagonal system each step by Thomas elimination.
    const a = H.off, d = H.diag;
    const cr = new Float64Array(N), ci = new Float64Array(N);
    for (let s = 0; s < steps; s++) {
        // rhs = (1 - i H dt/2) psi
        const rr = new Float64Array(N), ri = new Float64Array(N);
        for (let i = 0; i < N; i++) {
            let hr = d[i] * re[i], hi = d[i] * im[i];
            if (i > 0) { hr += a[i - 1] * re[i - 1]; hi += a[i - 1] * im[i - 1]; }
            if (i < N - 1) { hr += a[i] * re[i + 1]; hi += a[i] * im[i + 1]; }
            rr[i] = re[i] + (dt / 2) * hi;       // -i*(hr+i*hi)*dt/2 -> real part gains +hi*dt/2
            ri[i] = im[i] - (dt / 2) * hr;
        }
        // solve (1 + i H dt/2) x = rhs  -- diagonal 1 + i d dt/2, off-diagonal i a dt/2
        const dr = new Float64Array(N), di = new Float64Array(N);
        for (let i = 0; i < N; i++) { dr[i] = 1; di[i] = (dt / 2) * d[i]; }
        const or_ = new Float64Array(Math.max(0, N - 1)), oi = new Float64Array(Math.max(0, N - 1));
        for (let i = 0; i < N - 1; i++) { or_[i] = 0; oi[i] = (dt / 2) * a[i]; }
        // forward sweep
        let pr = dr[0], pi = di[0];
        const div = (ar, ai, br, bi) => { const q = br * br + bi * bi; return [(ar * br + ai * bi) / q, (ai * br - ar * bi) / q]; };
        let [x0r, x0i] = div(rr[0], ri[0], pr, pi);
        cr[0] = x0r; ci[0] = x0i;
        const gr = new Float64Array(N), gi = new Float64Array(N);
        let [g0r, g0i] = div(or_[0] || 0, oi[0] || 0, pr, pi);
        gr[0] = g0r; gi[0] = g0i;
        for (let i = 1; i < N; i++) {
            const mr = dr[i] - (or_[i - 1] * gr[i - 1] - oi[i - 1] * gi[i - 1]);
            const mi = di[i] - (or_[i - 1] * gi[i - 1] + oi[i - 1] * gr[i - 1]);
            const nr = rr[i] - (or_[i - 1] * cr[i - 1] - oi[i - 1] * ci[i - 1]);
            const ni = ri[i] - (or_[i - 1] * ci[i - 1] + oi[i - 1] * cr[i - 1]);
            const [xr, xi] = div(nr, ni, mr, mi);
            cr[i] = xr; ci[i] = xi;
            if (i < N - 1) { const [ur, ui] = div(or_[i], oi[i], mr, mi); gr[i] = ur; gi[i] = ui; }
        }
        for (let i = N - 2; i >= 0; i--) {
            cr[i] -= gr[i] * cr[i + 1] - gi[i] * ci[i + 1];
            ci[i] -= gr[i] * ci[i + 1] + gi[i] * cr[i + 1];
        }
        re.set(cr); im.set(ci);
    }
    return { re, im, dx, N, norm: norm(), normDrift: Math.abs(norm() - 1) };
}
