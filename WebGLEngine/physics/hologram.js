// physics/hologram.js
//
// The real optics under a hologram: wave interference and diffraction. A hologram is not a picture, it is a recorded
// interference pattern -- and the reason it can store a three-dimensional scene in a flat sheet is that light waves add
// as AMPLITUDES, carrying phase, not as intensities. Two coherent point sources (think object beam and reference beam)
// overlapping on a screen produce a pattern of bright and dark fringes whose spacing is lambda*D/d: set by the
// wavelength, the distance to the screen, and the separation of the sources. That fringe spacing encodes the geometry,
// so from the pattern alone you can recover the separation that made it -- record, then reconstruct. The phase and the
// wavefront are invisible; the fringes they write are real and computable. That is the hidden-and-real of holography.
//
// This uses sines and cosines of a phase, so it is gated (proven on this machine) but not part of the cross-architecture
// fingerprint -- trig of arbitrary angles is not bit-identical across libm implementations, the same honest line drawn
// for the white dwarf and the star catalogue.

// Intensity at a screen point x from a set of coherent point sources, by true wave superposition:
// I = | sum_i A_i exp(i * 2pi * pathlength_i / lambda) |^2. This is amplitude addition -- the interference is in here.
export function intensity(x, sources, lambda, screenD) {
    let re = 0, im = 0;
    for (const s of sources) {
        const dx = x - s.x, path = Math.sqrt(dx * dx + screenD * screenD);
        const phi = 2 * Math.PI * path / lambda;
        re += s.amp * Math.cos(phi); im += s.amp * Math.sin(phi);
    }
    return re * re + im * im;
}

// The same sources with phase discarded -- intensities simply summed. No interference, no fringes. (Contrast/sabotage.)
export function incoherentIntensity(x, sources) {
    let sum = 0; for (const s of sources) sum += s.amp * s.amp; return sum;
}

// Documented fringe spacing for two sources separated by d, screen at distance D: Delta y = lambda * D / d.
export function fringeSpacing(lambda, screenD, sep) { return lambda * screenD / sep; }

// Reconstruction: recover the source separation from a measured fringe spacing -- reading the geometry back out.
export function recoverSeparation(spacing, lambda, screenD) { return lambda * screenD / spacing; }

// Scan the screen and return the intensity profile plus the average spacing between bright fringes (peaks).
export function scanScreen(sources, lambda, screenD, halfWidth, n) {
    const xs = [], I = [];
    for (let i = 0; i < n; i++) { const x = -halfWidth + 2 * halfWidth * i / (n - 1); xs.push(x); I.push(intensity(x, sources, lambda, screenD)); }
    const peaks = [];
    for (let i = 1; i < n - 1; i++) if (I[i] > I[i - 1] && I[i] >= I[i + 1] && I[i] > 0.3 * Math.max(...I)) peaks.push(xs[i]);
    let spacing = 0; if (peaks.length > 1) { let sum = 0; for (let i = 1; i < peaks.length; i++) sum += peaks[i] - peaks[i - 1]; spacing = sum / (peaks.length - 1); }
    return { xs, I, peaks, spacing };
}

// Two symmetric point sources separated by d, on the line y=0.
export function twoSources(d, amp = 1) { return [{ x: -d / 2, amp }, { x: d / 2, amp }]; }
