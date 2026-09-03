// WebGLEngine/mesh/songLathe.mjs -- v4383
//
// *** THE LATHE'S OWN HEADER SAYS ITS JUDGE HAS NOTHING HONEST TO SCORE. THIS GIVES IT SOMETHING. ***
//
// v4255 built mesh/lathe.mjs against the judge this tree took from img2threejs (Apache-2.0, registered in
// world/reachedLicences.mjs since v3337, nothing new taken here) and wrote the limit into its own header
// before the code: "Revolving a profile produces an object whose FRONT VIEW is the profile mirrored -- so the
// front-view IoU against the source image is high almost by construction, and is close to worthless as
// evidence." That is not a small caveat. It means render/silhouette.mjs -- built at v3337, nine hundred
// rounds ago, expressly to be a HARD gate that a soft average cannot wash out -- has never once scored a
// reconstruction against a reference it did not itself produce.
//
// The missing ingredient was never a better rasteriser. It was A REFERENCE FROM SOMEWHERE ELSE.
//
// ---- WHERE THE OUTSIDE REFERENCE COMES FROM, AND IT IS NOT AN IMAGE -------------------------------------------
//
// world/songHeightfield.mjs (v4280) already says the useful half out loud: a short-time Fourier transform is a
// two-dimensional array indexed by time and frequency, so it IS a height grid rather than a metaphor for one.
// One column of that array is something the tree has never used: MAGNITUDE AGAINST FREQUENCY -- a radius as a
// function of height, which is a lathe profile in the only sense a lathe cares about.
//
// Revolve it and the solid's silhouette is the spectrum, mirrored. So far that is still the worthless test.
// What is NOT worthless is that A SPECTRUM HAS AN ANSWER KEY AND A PHOTOGRAPH DOES NOT:
//
//   1. THE CLOSED FORM. songHeightfield's header states it and this file re-derives it: a rectangular-windowed
//      sum of bin-centred sines has |X[k]| = A_k * N / 2 at each tone's bin and zero everywhere else, EXACTLY.
//      That reference is arithmetic. No transform runs to produce it, so a silhouette scored against it is
//      scored against something the geometry pipeline had no hand in making.
//   2. THE NAIVE DFT. O(N^2) straight from the definition, sharing not one line with physics/fft.js's radix-2
//      butterflies. Valid for ANY signal, including the sweeps and chords that have no closed form, which is
//      what lets the claim reach past toy inputs.
//
// MEASURED, on a three-tone chord at N = 256: max |fft - analytic| = 3.2e-13, max |fft - naiveDFT| = 4.9e-13,
// and the two lathed silhouettes agree at IoU 1.000000 -- not "0.99 and good enough", the same pixels.
//
// ---- *** THE CONTROL THAT PROVES NOTHING, KEPT BECAUSE IT LOOKS LIKE PROOF *** ---------------------------------
//
// A solid of revolution has the same silhouette from every azimuth. That property is TRUE OF ANY LATHE
// WHATSOEVER and therefore carries exactly zero information about the audio -- and it is the check a person
// reaches for first, because it is the one that sounds most like geometry. REVERSE the spectrum, so every
// tone is at the wrong frequency, and rotational invariance still reads 1.000000 while the IoU against the
// closed form collapses to 0.419142. The gate prints both side by side for that reason: the invariance number
// is what an honest reference is being contrasted AGAINST, not a second piece of evidence.
//
// ---- AND THE CROSSING FOUND A DEFECT IN THE HALF THAT WAS ALREADY SHIPPED --------------------------------------
//
// The check that says "rotational invariance proves nothing" was written with a companion that said the same
// of mesh/lathe.mjs's asymmetry(), and THE COMPANION CAME BACK RED. silhouetteMask rasterises at pixel CENTRES
// and asymmetry mirrored pixel INDICES -- two functions in one file, one pixel apart -- so a solid of
// revolution, symmetric by construction, measured 0.590698. v4255's gate never crossed them because its
// fixtures are index-space predicates that happen to be index-symmetric. Fixed there with an explicit
// convention rather than a silent switch; recorded here because the defect was in the number that file's own
// header calls the only one that tests the assumption.
//
// ---- WHAT THE CROSSING BUYS THAT NEITHER HALF HAD ALONE --------------------------------------------------------
//
// songHeightfield's header describes scalloping loss in words -- move a tone half a bin and a rectangular
// window smears it across the spectrum. Lathing it puts that sentence in the JUDGE's units: a bin-centred tone
// scores IoU 1.000000 against the closed form and the same tone half a bin higher scores 0.598592. Forty
// percent of the silhouette is the window's fault, and until there was a geometry to score, there was no
// number to attach to it.
"use strict";

import { lathe, silhouetteMask, maskIoU } from "./lathe.mjs";
import { spectrum } from "../physics/fft.js";
import { stft, DEFAULTS as SONG_DEFAULTS } from "../world/songHeightfield.mjs";

/**
 * *** THE GEOMETRY CONVENTION IS SHARED BY BOTH PATHS ON PURPOSE, AND THE REASON IS THE WHOLE CLAIM. ***
 *
 * What is meant to be independent between the measured path and the reference path is THE SPECTRUM. The units
 * -- how tall a bin is, how wide a full-scale magnitude gets drawn -- are a drawing convention, and letting the
 * two paths disagree about that would turn a comparison about audio into a comparison about millimetres.
 * So the reference is rendered through this same layout, and the only thing that differs upstream of it is
 * where the magnitudes came from.
 *
 * `radiusFloor` is not decoration; see spectrumProfile.
 */
export const LAYOUT = Object.freeze({
    width: 128, height: 128, axis: 64, maxRadius: 48, radiusFloor: 0.75, segments: 64,
});

/**
 * Magnitude to radius, and back.
 *
 * *** THE REFERENCE MAGNITUDE IS A PARAMETER AND MUST NOT BE THE FIELD'S OWN MAXIMUM. ***
 * Normalising each spectrum by its own peak is the obvious move and it is wrong here: it makes the drawing
 * scale-invariant, so an error that multiplies every magnitude by the same factor -- a window normalisation,
 * a missing 1/N, a forgotten factor of two -- produces an IDENTICAL picture and an IoU of exactly 1. The
 * closed form gives an absolute peak (peakMagnitude(A, N) = A * N / 2), so both paths are scaled by that and
 * a global factor is visible instead of invisible.
 */
export const magnitudeToRadius = (mag, ref, L = LAYOUT) =>
    L.radiusFloor + Math.max(0, Math.min(1, mag / ref)) * (L.maxRadius - L.radiusFloor);

export const radiusToMagnitude = (r, ref, L = LAYOUT) =>
    ref * (r - L.radiusFloor) / (L.maxRadius - L.radiusFloor);

/**
 * A magnitude column as a lathe profile: bin index is height, magnitude is radius.
 *
 * *** THE FLOOR RADIUS IS LOAD-BEARING AND DROPPING SILENT BINS WOULD DESTROY THE MAPPING. ***
 * mesh/lathe.mjs's own profileFromMask DROPS rows with no occupancy, and its header gives the right reason
 * for its own case: a zero-radius ring welds the surface shut and turns a gap into a pinch. Carrying that
 * habit over here would be a disaster of a different kind. A spectrum is near-zero at nearly every bin -- on
 * the three-tone chord above, 3 of 128 bins sit above 1e-6 -- so dropping the quiet ones RENUMBERS THE
 * HEIGHT AXIS: bin 70 would come out at row 2, and the object would no longer encode frequency at all while
 * still looking exactly like a plausible vase.
 *
 * Every bin therefore gets a ring, and a floor keeps the quiet ones from welding. The stem is thin and
 * visible and honest about being a stem.
 */
export function spectrumProfile(mags, ref, L = LAYOUT) {
    const rows = [];
    for (let k = 0; k < mags.length; k++) rows.push({ y: k, r: magnitudeToRadius(mags[k], ref, L) });
    return { axis: L.axis, rows, skew: 0 };
}

/**
 * REFERENCE ONE: the closed form. A rectangular-windowed sum of bin-centred sines, with no transform run.
 *
 * A sin(2 pi k n / N) is (A/2i)(e^{+} - e^{-}), whose DFT is a pair of impulses of magnitude A*N/2 at k and
 * N-k. Distinct bins do not interact, so a chord's magnitudes are its tones' magnitudes and nothing else.
 *
 * *** RETURNS NULL RATHER THAN ROUNDING FOR A TONE THAT IS NOT BIN-CENTRED. *** The whole value of this
 * function is that it is exact; a caller who hands it 32.5 wants an answer this cannot give, and rounding to
 * 32 would hand back a confident reference that is wrong by the entire scalloping loss the gate measures
 * separately. Refusing is the only honest return.
 */
export function analyticMagnitudes(tones, frameSize) {
    const half = frameSize / 2;
    const out = new Float64Array(half);
    for (const { bin, amplitude = 1 } of tones) {
        if (!Number.isInteger(bin) || bin <= 0 || bin >= half) return null;
        out[bin] += amplitude * frameSize / 2;
    }
    return out;
}

/**
 * REFERENCE TWO: the discrete Fourier transform straight from its definition, O(N^2).
 *
 * Shares nothing with physics/fft.js -- no twiddle table, no bit reversal, no butterfly -- so an error in the
 * radix-2 decomposition cannot hide in both. Slow on purpose and only ever used by references and gates;
 * nothing on a frame path may call it.
 */
export function naiveDftMagnitudes(samples) {
    const n = samples.length, out = new Float64Array(n);
    for (let k = 0; k < n; k++) {
        let re = 0, im = 0;
        for (let j = 0; j < n; j++) {
            const t = -2 * Math.PI * k * j / n;
            re += samples[j] * Math.cos(t);
            im += samples[j] * Math.sin(t);
        }
        out[k] = Math.hypot(re, im);
    }
    return out;
}

/**
 * *** THE CONSTANT IS NOT pi, AND USING pi WOULD COST FOUR ORDERS OF MAGNITUDE OF TOLERANCE. ***
 *
 * mesh/lathe.mjs revolves in `segments` flat facets, so each ring is a regular n-gon of circumradius r, whose
 * area is (n/2) r^2 sin(2 pi / n) -- NOT pi r^2. At n = 64 the ratio is 0.99839, a 0.16% deficit. A volume
 * check written against pi would need a 0.2% tolerance to pass, and a 0.2% tolerance is wide enough to
 * swallow a real fault; written against the polygon it agrees to 8.6e-8, which is float32 storage noise and
 * nothing else, because lathe() returns positions in a Float32Array.
 */
export const polygonK = (segments) => (segments / 2) * Math.sin(2 * Math.PI / segments);

/**
 * Closed-form volume of the revolved solid: a stack of polygonal frusta.
 *
 * Parallel similar cross-sections of areas A1 and A2 a height h apart enclose (h/3)(A1 + A2 + sqrt(A1 A2)),
 * and with A = K r^2 that is (h/3) K (r1^2 + r1 r2 + r2^2). The end caps close the solid and add no volume of
 * their own -- they are flat and perpendicular to the axis -- so the stack is the whole answer.
 */
export function frustumStackVolume(rows, segments = LAYOUT.segments) {
    const K = polygonK(segments);
    let v = 0;
    for (let i = 1; i < rows.length; i++) {
        const h = rows[i].y - rows[i - 1].y, a = rows[i - 1].r, b = rows[i].r;
        v += (h / 3) * K * (a * a + a * b + b * b);
    }
    return v;
}

/**
 * *** WHAT A SILHOUETTE READS BACK IS NOT THE PROFILE, AND IT IS NOT NOISE EITHER. ***
 *
 * Rasterising the solid and running mesh/lathe.mjs's profileFromMask over the result does NOT recover the
 * magnitudes. Pixel row j samples the surface at y = j + 0.5, which is halfway up the frustum between rings j
 * and j+1, so what comes back is the MIDPOINT of consecutive radii. On the chord that is brutal and exactly
 * predictable: an isolated one-bin peak is a bicone whose widest circle is infinitely thin, and the readback
 * at its own row is half its height -- worst error 50.794% of peak against the profile, and 0.794% against
 * this interpolant. A 64-fold gap between "unexplained loss" and "understood loss", and the difference is
 * one line of geometry.
 *
 * So the round trip is a lossy codec whose loss has a closed form, and what it loses most is the pure tone --
 * precisely the signal the closed forms in analyticMagnitudes are about. Stated here rather than discovered
 * by whoever next tries to read a spectrum back out of a picture.
 */
export function halfCellInterpolant(mags) {
    const out = new Float64Array(mags.length);
    for (let k = 0; k < mags.length; k++) out[k] = (mags[k] + (k + 1 < mags.length ? mags[k + 1] : mags[k])) / 2;
    return out;
}

/**
 * One frame of a clip, lathed.
 *
 * @param samples mono PCM
 * @param opts    frameIndex (which STFT column), plus anything stft() takes
 * @returns { mesh, profile, magnitudes, ref, layout, stats } or null if the clip yields no frame
 */
export function songLathe(samples, opts = {}) {
    const o = { ...SONG_DEFAULTS, ...opts };
    const L = opts.layout || LAYOUT;
    const S = stft(samples, o);
    if (!S || S.frameCount === 0) return null;
    const t = Math.max(0, Math.min(S.frameCount - 1, Math.round(opts.frameIndex ?? 0)));
    const magnitudes = S.frames[t];
    // The absolute reference, not the frame's own peak -- see magnitudeToRadius.
    const ref = (opts.amplitude ?? 1) * S.frameSize / 2;
    const profile = spectrumProfile(magnitudes, ref, L);
    return {
        mesh: lathe(profile, L.segments), profile, magnitudes, ref, layout: L,
        stats: { frameIndex: t, frameCount: S.frameCount, binCount: S.binCount,
                 frameSize: S.frameSize, sampleRate: S.sampleRate, window: o.window,
                 hzPerBin: S.sampleRate / S.frameSize },
    };
}

/** The judge, applied: IoU between two magnitude columns rendered through one layout. */
export function silhouetteAgreement(magsA, magsB, ref, L = LAYOUT) {
    const maskOf = (m) => silhouetteMask(lathe(spectrumProfile(m, ref, L), L.segments), L.width, L.height,
                                         { axis: L.axis });
    return maskIoU(maskOf(magsA), maskOf(magsB));
}

/** Rotational invariance -- the control. True of any lathe; see the header. */
export function azimuthAgreement(mags, ref, yaw, L = LAYOUT) {
    const mesh = lathe(spectrumProfile(mags, ref, L), L.segments);
    const at = (y) => silhouetteMask(mesh, L.width, L.height, { axis: L.axis, yaw: y });
    return maskIoU(at(0), at(yaw));
}

/** A rectangular-windowed frame of a single tone at an arbitrary (possibly fractional) bin. */
export function toneFrame(bin, frameSize, sampleRate, amplitude = 1) {
    const out = new Float64Array(frameSize);
    const hz = bin * sampleRate / frameSize;
    for (let i = 0; i < frameSize; i++) out[i] = amplitude * Math.sin(2 * Math.PI * hz * i / sampleRate);
    return out;
}

/** Magnitudes of one frame through physics/fft.js -- the MEASURED path, kept beside its two references. */
export const fftMagnitudes = (frame) => spectrum(frame).slice(0, frame.length / 2);
