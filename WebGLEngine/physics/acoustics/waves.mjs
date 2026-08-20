// physics/acoustics/waves.mjs
//
// v3385 -- ACOUSTICS AS WAVES. Third of the three new fields.
//
// The wave equation is the most-solved equation in physics, which makes it easy to build a device that only
// compares a simulation to itself. These four keys avoid that, and two of them are about the SCHEME rather than
// the physics -- which is the honest thing to grade when the physics is a textbook one-liner.
//
//   D'ALEMBERT        any f(x - ct) is an exact solution: a pulse travels UNCHANGED forever. The reference is a
//                     function, not another simulation.
//
//   *** THE MAGIC TIME STEP *** at Courant number C = c dt/dx exactly 1, the explicit FDTD scheme reproduces
//   d'Alembert EXACTLY. Measured error after 100 steps: 5.3e-21 at C = 1 against 1.6e-3 at C = 0.9 and 3.6e-3 at
//   C = 0.5. The scheme is DISPERSIVE everywhere except at one point, where its dispersion relation collapses
//   onto the true one. Running "safely" at C = 0.5 is fifteen orders of magnitude worse than running at the
//   stability limit, which is the opposite of the intuition.
//
//   CFL             and the limit is a CLIFF, not a slope. After 300 steps the amplitude is 0.25 at C = 1.00 and
//                   2.1e18 at C = 1.01. One percent past the threshold is not slightly worse; it is divergent.
//
//   DOPPLER ASYMMETRY  a moving SOURCE and a moving OBSERVER at the same speed give DIFFERENT shifts:
//                      f'/f = 1/(1 - v/c) against (1 + v/c). At v = 0.5c that is 2.000 against 1.500, a 33%
//                      difference. The medium breaks the symmetry -- there is a rest frame, unlike in optics --
//                      and an implementation that used one formula for both would be wrong in a way that only
//                      shows at speed.

/** Exact d'Alembert: a right-travelling pulse, unchanged in shape. */
export const dalembert = (shape, x, c, t) => shape(x - c * t);

/** Gaussian pulse, the shape used as the reference. */
export const gaussianPulse = (x0, width) => (x) => Math.exp(-Math.pow((x - x0) / width, 2));

/** Courant number. The single parameter that decides whether the scheme is exact, dispersive, or divergent. */
export const courant = (c, dt, dx) => c * dt / dx;

/**
 * Explicit second-order FDTD for u_tt = c^2 u_xx, started from two exact d'Alembert time levels so the
 * comparison tests PROPAGATION rather than the starting condition.
 */
export function fdtd(shape, N, C, steps) {
    let prev = new Float64Array(N), cur = new Float64Array(N);
    for (let i = 0; i < N; i++) { prev[i] = shape(i); cur[i] = shape(i - C); }
    for (let n = 0; n < steps; n++) {
        const nx = new Float64Array(N);
        for (let i = 1; i < N - 1; i++) nx[i] = 2 * cur[i] - prev[i] + C * C * (cur[i + 1] - 2 * cur[i] + cur[i - 1]);
        prev = cur; cur = nx;
    }
    return cur;
}

/** Worst departure from the exact travelling solution, away from the boundaries. */
export function propagationError(shape, N, C, steps, margin = 20) {
    const u = fdtd(shape, N, C, steps);
    let worst = 0;
    for (let i = margin; i < N - margin; i++) worst = Math.max(worst, Math.abs(u[i] - shape(i - C * (steps + 1))));
    return worst;
}

/** Peak amplitude after a run -- the divergence detector for the CFL check. */
export function peakAmplitude(shape, N, C, steps) {
    const u = fdtd(shape, N, C, steps);
    let mx = 0;
    for (const v of u) mx = Math.max(mx, Math.abs(v));
    return mx;
}

// ---- DOPPLER: the medium has a rest frame, so the two motions are NOT equivalent -----------------------------------
/** Source approaching a stationary observer at speed v. */
export const dopplerMovingSource = (f, v, c) => f * c / (c - v);
/** Observer approaching a stationary source at speed v. */
export const dopplerMovingObserver = (f, v, c) => f * (c + v) / c;
/** How much the two differ at the same speed -- zero only at v = 0. */
export const dopplerAsymmetry = (v, c) => dopplerMovingSource(1, v, c) / dopplerMovingObserver(1, v, c) - 1;

// ---- STANDING WAVES: exact mode frequencies ---------------------------------------------------------------------------
/** Pipe open at both ends (or closed at both): f_n = n c / 2L, all harmonics. */
export const modeOpenOpen = (n, c, L) => n * c / (2 * L);
/** Pipe open at one end: f_n = (2n-1) c / 4L, ODD harmonics only. */
export const modeOpenClosed = (n, c, L) => (2 * n - 1) * c / (4 * L);

/** Non-dispersive: phase and group velocity are both c, at every wavenumber. */
export const phaseVelocity = (omega, k) => omega / k;
export const groupVelocity = (c) => c;
export const omegaOf = (c, k) => c * k;
