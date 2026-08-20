// simulation/cosmo/grf.js -- the universe's initial conditions, and a way to prove they are what we asked for.
//
// The cosmic web is not painted. It GROWS: start with a nearly-smooth universe carrying faint random density ripples,
// let gravity pull harder where it is denser, and filaments, sheets and voids fall out. Everything therefore rests on
// the ripples being RIGHT, and "right" has a precise meaning -- their POWER SPECTRUM P(k), the variance carried at
// each spatial frequency.
//
// So this file can be checked in a way a picture never could: build a field to a prescribed P(k), then MEASURE the
// power spectrum back out of it and see whether it is the one requested. A closed round trip against a known answer.
// A wrong field would still look like a cosmic web -- plausible, beautiful, meaningless -- which is exactly why the
// round trip is not optional.
//
// CONVENTION (stated, because a power spectrum is meaningless without one): the field is dimensionless density
// contrast delta = rho/rhobar - 1 on an n^3 grid spanning boxSize. Modes are indexed by the integer wavevector
// (kx, ky, kz) with the Nyquist wrapping applied, and the physical wavenumber is k = 2*pi*|kvec|/boxSize.
// Each mode gets amplitude sqrt(P(k) / boxSize^3) * (a unit complex Gaussian), and reality is enforced by building
// the field from a real white-noise field and filtering it -- which gives Hermitian symmetry for free and avoids the
// classic bug of a field that is subtly not real and gets silently truncated to its real part.
"use strict";
import { fft3d } from "./fft.js";

// deterministic, seeded, portable -- so a "random" universe is reproducible across machines and reruns.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// Box-Muller: uniform -> unit-variance Gaussian
function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
// the integer wavevector of index i on an n-grid, with Nyquist wrapping (bins above n/2 are NEGATIVE frequencies)
const kOf = (i, n) => (i <= n / 2 ? i : i - n);

// Build delta(x) with the prescribed P(k). White noise has flat power, so filtering white noise by sqrt(P(k)) gives
// exactly P(k) -- and starting from a REAL noise field means the result is automatically real.
function makeGRF({ n = 64, boxSize = 100, P = (k) => (k > 0 ? Math.pow(k, -2) : 0), seed = 1234 } = {}) {
    const N = n * n * n;
    const rng = mulberry32(seed);
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = gauss(rng);          // real white noise, unit variance per cell
    fft3d(re, im, n, false);
    const kf = 2 * Math.PI / boxSize;                        // the fundamental wavenumber
    const cellVol = Math.pow(boxSize / n, 3);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const kx = kOf(x, n), ky = kOf(y, n), kz = kOf(z, n);
        const k = kf * Math.sqrt(kx*kx + ky*ky + kz*kz);
        // white noise of unit variance per cell has power spectrum cellVol; scale to the target
        const amp = k > 0 ? Math.sqrt(P(k) / cellVol) : 0;
        const j = (z*n + y)*n + x;
        re[j] *= amp; im[j] *= amp;
    }
    fft3d(re, im, n, true);
    return { delta: re, n, boxSize };
}

// Measure P(k) back out: |delta(k)|^2 averaged over spherical shells in k.
//
// Pass the reference spectrum as `Pref` and each shell also reports `Ptruth` -- the reference AVERAGED OVER THE SAME
// MODES. Compare against that, never against Pref(k_mean). The distinction is not pedantry: P(k) = k^-2 is convex, so
// the average of the curve across a shell sits ABOVE the curve at the shell's average k. Reading that gap as an error
// in the field cost a round; it is Jensen's inequality, and it lives in the question, not in the universe.
function measureP({ delta, n, boxSize }, nBins = 16, Pref = null) {
    const N = n*n*n;
    const re = Float64Array.from(delta), im = new Float64Array(N);
    fft3d(re, im, n, false);
    const kf = 2*Math.PI/boxSize, boxVol = Math.pow(boxSize, 3);
    const kNyq = kf * n/2;
    const sum = new Float64Array(nBins), cnt = new Float64Array(nBins), kSum = new Float64Array(nBins), tSum = new Float64Array(nBins);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const kx = kOf(x,n), ky = kOf(y,n), kz = kOf(z,n);
        const k = kf * Math.sqrt(kx*kx + ky*ky + kz*kz);
        if (k <= 0 || k > kNyq) continue;
        const b = Math.min(nBins-1, Math.floor(nBins * Math.log(k/kf) / Math.log(kNyq/kf)));
        if (b < 0) continue;
        const j = (z*n + y)*n + x;
        sum[b] += (re[j]*re[j] + im[j]*im[j]) / (n*n*n) / (n*n*n) * boxVol;
        cnt[b]++; kSum[b] += k;
        if (Pref) tSum[b] += Pref(k);
    }
    const out = [];
    for (let b = 0; b < nBins; b++) if (cnt[b] > 0)
        out.push({ k: kSum[b]/cnt[b], P: sum[b]/cnt[b], modes: cnt[b], Ptruth: Pref ? tSum[b]/cnt[b] : null });
    return out;
}
export { makeGRF, measureP, mulberry32 };
