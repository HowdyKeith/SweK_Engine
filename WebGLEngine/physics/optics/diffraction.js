// physics/optics/diffraction.js
//
// Fraunhofer (far-field) diffraction as a ground-truth benchmark. We know the aperture exactly, and the far-field pattern
// of a simple aperture has an exact closed form: a single slit gives sinc squared, two slits give that times cos squared,
// a circular aperture gives the Airy pattern with its first dark ring at 1.22 lambda / D -- the Rayleigh limit. So we run
// a numerical propagator (the diffraction integral summed as phasors across the aperture) and grade it against the analytic
// pattern we already know. The propagator is real optics; the answer key is analytic; the instrument is simulated. Phasors
// use cos and sin, so this is GATED, not fingerprinted (trig is not cross-architecture).

const sinc = (u) => (u === 0 ? 1 : Math.sin(u) / u);

// ---- SINGLE SLIT -------------------------------------------------------------------------------------
// Numerical: E(theta) = sum over N aperture samples of exp(i k x sin(theta)); intensity normalized to 1 on axis.
import { meijerG } from "../../math/meijerG.js";

export function slitNumeric(a, lambda, sinThetas, N = 400) {
    const k = 2 * Math.PI / lambda, xs = [];
    for (let i = 0; i < N; i++) xs.push(-a / 2 + (i + 0.5) * a / N);
    return sinThetas.map((st) => {
        let re = 0, im = 0; for (const x of xs) { const ph = k * x * st; re += Math.cos(ph); im += Math.sin(ph); }
        return (re * re + im * im) / (N * N);
    });
}
// Analytic: sinc^2( pi a sin(theta) / lambda ). Exact.
export function slitAnalytic(a, lambda, sinThetas) {
    return sinThetas.map((st) => { const s = sinc(Math.PI * a * st / lambda); return s * s; });
}
// Analytic dark-fringe positions: sin(theta) = m lambda / a, m = 1,2,...
export function slitMinima(a, lambda, mMax = 3) { const out = []; for (let m = 1; m <= mMax; m++) out.push(m * lambda / a); return out; }

// ---- DOUBLE SLIT (Young) -----------------------------------------------------------------------------
// Two slits of width a, centers separated by d. Intensity = single-slit envelope * cos^2( pi d sin(theta)/lambda ).
export function doubleSlitNumeric(a, d, lambda, sinThetas, N = 400) {
    const k = 2 * Math.PI / lambda, xs = [];
    for (let i = 0; i < N; i++) { const x = -a / 2 + (i + 0.5) * a / N; xs.push(x - d / 2); xs.push(x + d / 2); }
    return sinThetas.map((st) => {
        let re = 0, im = 0; for (const x of xs) { const ph = k * x * st; re += Math.cos(ph); im += Math.sin(ph); }
        return (re * re + im * im) / (4 * N * N);
    });
}
export function doubleSlitAnalytic(a, d, lambda, sinThetas) {
    return sinThetas.map((st) => { const s = sinc(Math.PI * a * st / lambda), c = Math.cos(Math.PI * d * st / lambda); return s * s * c * c; });
}
// Interference maxima: sin(theta) = m lambda / d -- the fringe spacing is lambda / d.
export function doubleSlitMaxima(d, lambda, mMax = 3) { const out = []; for (let m = 0; m <= mMax; m++) out.push(m * lambda / d); return out; }

// ---- CIRCULAR APERTURE (Airy) ------------------------------------------------------------------------
// Radial numerical propagator: the far field of a disc is the Hankel transform of a top-hat. We integrate over the disc
// radially with the exact angular factor J0 built from cos, so the first dark ring can be found and checked against the
// analytic Rayleigh limit sin(theta) = 1.22 lambda / D without needing a Bessel-function library for the analytic side.
export function circularNumeric(D, lambda, sinThetas, Nr = 300, Na = 128) {
    const k = 2 * Math.PI / lambda, R = D / 2;
    return sinThetas.map((st) => {
        let re = 0, im = 0;
        for (let ir = 0; ir < Nr; ir++) {
            const r = (ir + 0.5) * R / Nr, w = r;                 // area weight r dr
            for (let ia = 0; ia < Na; ia++) {
                const phi = (ia + 0.5) * 2 * Math.PI / Na, x = r * Math.cos(phi);
                const ph = k * x * st; re += w * Math.cos(ph); im += w * Math.sin(ph);
            }
        }
        return re * re + im * im;
    });
}
// v3072 -- THE CLOSED FORM THE CIRCULAR APERTURE NEVER HAD.
//
// Slit and double-slit each shipped with BOTH a numeric integration and an analytic form, and the instrument
// grades one against the other. The circular aperture shipped with the numeric integration and a single
// CONSTANT -- the 1.22 Rayleigh factor -- which pins one point of the curve and says nothing about its shape.
// A pattern can have its first dark ring in exactly the right place and be wrong everywhere else.
//
// The Airy pattern is I(u)/I(0) = [2 J1(u) / u]^2 with u = pi D sin(theta) / lambda, and J1 is a Meijer G:
//
//     J_v(x) = G^{1,0}_{0,2}( x^2/4 | ; v/2, -v/2 )
//
// so the closed form comes from math/meijerG.js rather than from a Bessel routine written for this file. That
// matters: the G is verified against SEVEN independent reductions (meijerG-selfcheck), so this analytic curve
// inherits a check the numeric integration cannot give itself.
//
// A NOTE ON THE PARAMETERS, because it looked like a problem and is not: v = 1 gives b = (0.5, -0.5), which
// differ by the integer 1 -- the degenerate condition that collides poles. It does NOT apply here, because m = 1
// and only the FIRST m b-parameters source residues; the second sits in a denominator gamma. The refusal in
// meijerG is correctly scoped to j <= m, and this is the case that proves it.
export function circularAnalytic(D, lambda, sinThetas) {
    return sinThetas.map((st) => {
        const u = Math.PI * D * st / lambda;
        if (Math.abs(u) < 1e-9) return 1;                      // the limit 2J1(u)/u -> 1 at the centre
        const g = meijerG({ m: 1, n: 0, a: [], b: [0.5, -0.5], z: u * u / 4 });
        if (!g.ok) return NaN;                                  // refuses rather than returning a plausible curve
        const j1 = g.value;
        const amp = 2 * j1 / u;
        return amp * amp;
    });
}

// The analytic first dark ring (Rayleigh criterion).
export function airyFirstMinimum(D, lambda) { return 1.22 * lambda / D; }

// Find the first interior local minimum of a sampled pattern -> its sin(theta), for checking against the analytic ring.
export function firstMinimumAt(pattern, sinThetas) {
    for (let i = 2; i < pattern.length - 1; i++) if (pattern[i] < pattern[i - 1] && pattern[i] <= pattern[i + 1]) return sinThetas[i];
    return null;
}

// RMS relative error between a numerical and analytic pattern, both normalized to their on-axis (peak) value.
export function scorePattern(numeric, analytic) {
    const nMax = Math.max.apply(null, numeric), aMax = Math.max.apply(null, analytic) || 1;
    let se = 0, peak = 0; const n = numeric.length;
    for (let i = 0; i < n; i++) { const e = numeric[i] / nMax - analytic[i] / aMax; se += e * e; if (Math.abs(e) > peak) peak = Math.abs(e); }
    return { rms: Math.sqrt(se / n), peak };
}
