// WebGLEngine/physics/astroparticle/jeans.js — v3429
// ---------------------------------------------------------------------------------------------------------------
// THE JEANS INSTABILITY — a threshold with a regime where the interesting thing provably CANNOT happen.
//
// A self-gravitating gas has two tendencies pulling opposite ways: pressure smooths a lump out, gravity pulls it
// in. Which wins depends only on the wavelength, and the answer is exact:
//
//     omega^2 = c_s^2 k^2 - 4 pi G rho0
//
// Short wavelengths oscillate as ordinary sound waves; long ones grow exponentially and become stars. The
// crossover is at k_J = sqrt(4 pi G rho0) / c_s, where omega is EXACTLY ZERO -- marginal stability, neither
// growing nor ringing.
//
// *** THIS IS THE SAME SHAPE AS THE TURING ROUND, ON PURPOSE. *** There, a diffusion ratio below threshold meant
// no pattern could form however long you waited, and the theorem (equal diffusion cannot destabilise a stable
// state) was the sabotage. Here, WITHOUT GRAVITY NO WAVELENGTH IS EVER UNSTABLE: set G to zero and omega^2 =
// c_s^2 k^2 > 0 for every k, so the gas rings forever and collapses never. That is not "usually stable", it is
// stable identically, and it is a stronger statement than any numerical comparison.
//
// THE GRAVITY IS SOLVED ON THE GRID, NOT IN FOURIER SPACE. Solving Poisson spectrally would hand back
// -4 pi G rho0 delta_k / k^2 and the measured growth rate would be the dispersion relation restated -- the
// solver would be marking its own homework, which is the trap the waveguide round named. So the potential comes
// from a real-space second-difference Poisson solve, and the discrete Laplacian's eigenvalue (2/dx^2)(1-cos(k
// dx)) is what the prediction must use -- the same correction the Brusselator round needed, for the same reason.
//
// AND THE PERIODIC POISSON EQUATION HAS A NULL SPACE. A constant density offset produces no force and the solve
// is singular in that direction; the mean is projected out explicitly rather than left to the iteration to
// wander in.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

export const G_GRAV = 1;      // working units: G = 1, so lengths and times are in the natural units of the problem

/** The exact dispersion relation. Negative omega^2 means growth at rate sqrt(-omega^2). */
export const omegaSquared = (k, { cs, rho0, G = G_GRAV }) => cs * cs * k * k - 4 * Math.PI * G * rho0;

/** Jeans wavenumber: where omega is exactly zero. */
export const jeansK = ({ cs, rho0, G = G_GRAV }) => Math.sqrt(4 * Math.PI * G * rho0) / cs;

/** Jeans length, the wavelength at that crossover. */
export const jeansLength = (p) => 2 * Math.PI / jeansK(p);

/** Jeans mass: the mass in a sphere of half a Jeans wavelength. */
export const jeansMass = (p) => (4 / 3) * Math.PI * Math.pow(jeansLength(p) / 2, 3) * p.rho0;

/** Growth rate for an unstable mode, or null if the mode oscillates instead. */
export function growthRate(k, p) {
    const w2 = omegaSquared(k, p);
    return w2 < 0 ? Math.sqrt(-w2) : null;
}

/** The discrete Laplacian eigenvalue the GRID has, which is not k^2. Same correction the Brusselator needed. */
export const discreteK = (k, dx) => Math.sqrt((2 / (dx * dx)) * (1 - Math.cos(k * dx)));

/**
 * Solve the periodic 1D Poisson equation d2phi/dx2 = 4 pi G rho0 delta by Jacobi iteration on the real-space
 * second difference. The mean of delta is projected out first: a uniform overdensity exerts no force and would
 * otherwise make the solve singular.
 */
export function poisson(delta, dx, { rho0, G = G_GRAV, iters = 4000 }) {
    const n = delta.length;
    let mean = 0;
    for (const d of delta) mean += d;
    mean /= n;
    const src = new Float64Array(n);
    for (let i = 0; i < n; i++) src[i] = 4 * Math.PI * G * rho0 * (delta[i] - mean);
    let phi = new Float64Array(n), next = new Float64Array(n);
    const h2 = dx * dx;
    for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i++) {
            const l = phi[(i - 1 + n) % n], r = phi[(i + 1) % n];
            next[i] = 0.5 * (l + r - h2 * src[i]);
        }
        // project out the mean of phi too: it is a gauge freedom and drifts otherwise
        let m = 0;
        for (const v of next) m += v;
        m /= n;
        for (let i = 0; i < n; i++) phi[i] = next[i] - m;
    }
    return phi;
}

/**
 * Linearised self-gravitating gas on a periodic grid. Seeded with one Fourier mode, so the measured response is
 * that mode's rather than a mixture.
 *
 *     d(delta)/dt = -div v
 *     d(v)/dt     = -cs^2 grad(delta) - grad(phi)
 */
export function makeField({ n = 128, L = 1, cs = 1, rho0 = 1, mode = 4, amp = 1e-6, G = G_GRAV } = {}) {
    const dx = L / n;
    const delta = new Float64Array(n), v = new Float64Array(n);
    for (let i = 0; i < n; i++) delta[i] = amp * Math.cos(2 * Math.PI * mode * i / n);
    return { n, L, dx, cs, rho0, G, delta, v, modeIndex: mode, k: 2 * Math.PI * mode / L };
}

const grad = (f, n, dx) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = (f[(i + 1) % n] - f[(i - 1 + n) % n]) / (2 * dx);
    return out;
};

export function step(F, dt, { poissonIters = 2000 } = {}) {
    const { n, dx, cs, rho0, G, delta, v } = F;
    const phi = poisson(delta, dx, { rho0, G, iters: poissonIters });
    const gPhi = grad(phi, n, dx), gDelta = grad(delta, n, dx);
    for (let i = 0; i < n; i++) v[i] += dt * (-cs * cs * gDelta[i] - gPhi[i]);
    const gV = grad(v, n, dx);
    for (let i = 0; i < n; i++) delta[i] += dt * (-gV[i]);
    return F;
}

/** Amplitude of the seeded mode, isolated by projection onto its own cosine. */
export function modeAmplitude(F) {
    let s = 0;
    for (let i = 0; i < F.n; i++) s += F.delta[i] * Math.cos(2 * Math.PI * F.modeIndex * i / F.n);
    return 2 * s / F.n;
}

/** Measure the exponential growth rate of an unstable mode while it is still linear. */
export function measureGrowth({ dt = 2e-3, tStart = 0.5, tEnd = 2.5, sample = 0.1, poissonIters = 1500, ...opts } = {}) {
    const F = makeField(opts);
    const steps = Math.round(tEnd / dt), every = Math.max(1, Math.round(sample / dt));
    const ts = [], logs = [];
    for (let s = 0; s <= steps; s++) {
        if (s % every === 0 && s * dt >= tStart) {
            const a = Math.abs(modeAmplitude(F));
            if (a > 0 && a < 1e-2) { ts.push(s * dt); logs.push(Math.log(a)); }
        }
        step(F, dt, { poissonIters });
    }
    if (ts.length < 3) return { rate: null, points: ts.length };
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const n = ts.length;
    for (let i = 0; i < n; i++) { sx += ts[i]; sy += logs[i]; sxx += ts[i] * ts[i]; sxy += ts[i] * logs[i]; }
    const rate = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const kd = discreteK(F.k, F.dx);
    return { rate, points: n, k: F.k, kDiscrete: kd,
             predicted: growthRate(kd, { cs: F.cs, rho0: F.rho0, G: F.G }),
             predictedContinuum: growthRate(F.k, { cs: F.cs, rho0: F.rho0, G: F.G }) };
}

/** Oscillation frequency of a STABLE mode, measured by counting zero crossings of the amplitude. */
export function measureOscillation({ dt = 1e-3, tEnd = 6, poissonIters = 1500, ...opts } = {}) {
    const F = makeField(opts);
    const steps = Math.round(tEnd / dt);
    let prev = modeAmplitude(F), crossings = 0, firstT = null, lastT = null;
    for (let s = 1; s <= steps; s++) {
        step(F, dt, { poissonIters });
        const a = modeAmplitude(F);
        if (prev <= 0 && a > 0) { crossings++; if (firstT === null) firstT = s * dt; lastT = s * dt; }
        prev = a;
    }
    if (crossings < 2) return { omega: null, crossings };
    const period = (lastT - firstT) / (crossings - 1);
    const kd = discreteK(F.k, F.dx);
    const w2 = omegaSquared(kd, { cs: F.cs, rho0: F.rho0, G: F.G });
    return { omega: 2 * Math.PI / period, crossings, predicted: w2 > 0 ? Math.sqrt(w2) : null };
}
