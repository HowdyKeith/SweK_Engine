// tools/roundhouse/fftBind.mjs -- v3769
//
// *** TIER 2. physics/fft.js had a selfcheck and NO DEVICE, so gradedCoverage counted it among the ungraded.
// The obvious key is Parseval, and MEASURING IT FIRST IS WHAT SAVED THE ROUND. ***
//
// *** PARSEVAL PINS THE NORMALISATION ONLY IF ITS CONSTANT IS FIXED, AND THAT DISTINCTION IS THE ROUND'S
// FIRST FINDING. Measured: under the shipped convention (no scale forward, 1/N back) sum|x|^2 == (1/N)sum|X|^2
// to 6.111e-16. Under the SYMMETRIC convention (1/sqrt(N) both ways) the identity ALSO HOLDS EXACTLY -- defect
// 0.000e+0 -- BUT WITH A DIFFERENT CONSTANT (no 1/N at all).
// SO: "the transform is unitary UP TO SOME SCALE" is satisfied by every convention and is not a key.
//     "sum|x|^2 == (1/N) sum|X|^2" NAMES the scale and IS one -- it reads 9.844e-1 under the plant below.
// THE FORM SHIPPED HERE FIXES THE CONSTANT, SO IT IS A REAL KEY. I wrote the looser claim first and the
// measurement corrected it; the difference is a whole grade of evidence and is worth stating out loud. ***
//
// *** WHAT DOES PIN IT: ABSOLUTE AMPLITUDES THE CODE IS NEVER TOLD.
//     a constant c            ->  |X[0]| = c*N exactly          (the DC bin IS the sum)
//     c*sin(2 pi k n / N)     ->  |X[k]| = c*N/2 exactly        (the energy splits over +/-k)
// Measured on the shipped transform at N=64: 64.0000000000 for c=1, 32.0000000000 for a unit sinusoid, and
// 192 / 64 for the mixed signal 3 + 2 sin. THESE ARE EXACT, NOT TOLERANCED. ***
//
// *** AND THE ROUND TRIP IS A MIRROR, DEMONSTRATED RATHER THAN ASSERTED: rescaling the forward transform by
// 1/sqrt(N) and letting the inverse compensate leaves ifft(fft(x)) CORRECT TO 2.220e-16. A convention slip
// applied to BOTH directions is invisible to the round trip by construction -- the same shape as the
// interferometer's shared lambda and kepler's shared mu. THE ROUND TRIP IS REPORTED, NOT GRADED. ***

import { fft, ifft, spectrum, peakBin } from "../../physics/fft.js";

export const FFT_OBSERVABLES = [
    "parsevalDefect", "dcErrFrac", "sinusoidErrFrac", "mixedDcErrFrac", "mixedToneErrFrac",
    "roundTripWorst", "peakBinFound", "peakBinExpected", "conventionHolds", "N", "tone", "amplitude",
];

export const FFT_MODES = ["absolute", "parseval", "roundtrip", "halfscale"];

const DEF = { N: 64, tone: 5, amplitude: 1, offset: 0 };

export function fftDefaults(hyp) {
    const h = { mode: "absolute", ...(hyp || {}) };
    const c = { ...DEF, ...(h.config || {}) };
    const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
    // N must be a power of two for a radix-2 transform, and the tone must sit strictly inside the lower half
    let n = Math.min(1024, Math.max(8, num(c.N, DEF.N) | 0));
    c.N = 1 << Math.round(Math.log2(n));
    c.tone = Math.min((c.N >> 1) - 1, Math.max(1, num(c.tone, DEF.tone) | 0));
    c.amplitude = Math.min(1e3, Math.max(1e-3, num(c.amplitude, DEF.amplitude)));
    c.offset = Math.min(1e3, Math.max(0, num(c.offset, DEF.offset)));
    h.config = c;
    if (!FFT_MODES.includes(h.mode)) h.mode = "absolute";
    return h;
}

const signalOf = (c) => {
    const x = new Float64Array(c.N);
    for (let n = 0; n < c.N; n++) x[n] = c.offset + c.amplitude * Math.sin(2 * Math.PI * c.tone * n / c.N);
    return x;
};

export async function buildFFT(hyp, base = {}) {
    const h = fftDefaults({ ...hyp, config: { ...(hyp && hyp.config), ...base } });
    const c = h.config;
    // *** THE PLANT: "halfscale" DIVIDES THE FORWARD TRANSFORM BY sqrt(N) AND MULTIPLIES THE INVERSE BACK.
    // THAT IS THE SYMMETRIC CONVENTION -- a legitimate choice in half the literature and the wrong one HERE,
    // because spectrum() and every caller of it read absolute magnitudes. IT IS INVISIBLE TO THE ROUND TRIP
    // AND TO PARSEVAL, AND ONLY THE ABSOLUTE KEYS SEE IT. ***
    const fwdScale = h.mode === "halfscale" ? 1 / Math.sqrt(c.N) : 1;

    const x = signalOf(c);
    const mag = spectrum(x).map((v) => v * fwdScale);

    const out = { N: c.N, tone: c.tone, amplitude: c.amplitude };

    // Parseval, stated WITH its convention: the 1/N belongs to the shipped forward-unscaled transform.
    let timeE = 0, freqE = 0;
    for (let n = 0; n < c.N; n++) timeE += x[n] * x[n];
    for (let k = 0; k < c.N; k++) freqE += mag[k] * mag[k];
    out.parsevalDefect = Math.abs(timeE - freqE / c.N) / Math.max(timeE, 1e-300);

    // The absolute keys. Nothing in fft.js is told either number.
    const dcExpect = c.offset * c.N;
    const toneExpect = c.amplitude * c.N / 2;
    out.dcErrFrac = dcExpect > 0 ? Math.abs(mag[0] - dcExpect) / dcExpect : null;
    out.sinusoidErrFrac = Math.abs(mag[c.tone] - toneExpect) / toneExpect;
    out.mixedDcErrFrac = out.dcErrFrac;
    out.mixedToneErrFrac = out.sinusoidErrFrac;
    // *** A BINARY, BECAUSE THE CONVENTION IS NOT A TOLERANCE QUESTION. ***
    out.conventionHolds = out.sinusoidErrFrac < 1e-9 && (out.dcErrFrac === null || out.dcErrFrac < 1e-9);

    // Reported, NOT graded -- see the header.
    const re = Float64Array.from(x), im = new Float64Array(c.N);
    fft(re, im);
    for (let k = 0; k < c.N; k++) { re[k] *= fwdScale; im[k] *= fwdScale; }
    const back = ifft(re, im);
    let worst = 0;
    for (let n = 0; n < c.N; n++) worst = Math.max(worst, Math.abs(back.re[n] / fwdScale - x[n]));
    out.roundTripWorst = worst;

    out.peakBinFound = peakBin(x);
    out.peakBinExpected = c.tone;
    return out;
}

export const fftDevice = {
    modes: FFT_MODES,
    // "absolute" is FIRST so the mode-plant contract compares the plant against the mode that owns the keys.
    plantMode: "halfscale", plantFlips: "sinusoidErrFrac", plantKind: "mode",
    name: "dft-absolute-amplitudes", observables: FFT_OBSERVABLES,
    build: buildFFT, defaults: fftDefaults,
};
