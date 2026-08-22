// WebGLEngine/physics/tomography/reconQuality.mjs — v3340
// ---------------------------------------------------------------------------------------------------------------
// WHAT THE CT SCORE CANNOT SEE, AND WHY IT MATTERS MOST HERE.
//
// ct.js scores a reconstruction against "the truth we own" -- and the phantom IS owned: constructed from ellipses
// rather than measured, so unlike every other image comparison in this tree there is exact ground truth. That is
// what makes this the right place to point the perceptual work.
//
// *** BUT scoreRecon IS AFFINE-INVARIANT BY CONSTRUCTION, AND ITS OWN COMMENT SAYS SO. *** It subtracts both
// means and fits a gain g before computing the residual, so:
//
//     recon = truth * 1.3   ->  corr 1.0000000000000522, rms 9.9e-14
//     recon = truth + 0.4   ->  corr 1.0000000000000740, rms 2.9e-13
//
// Both report a PERFECT reconstruction. The file already warns about this from the other side (line 59: a
// backwards filter "produces a curve of exactly the right SHAPE and the wrong scale -- which a correlation check
// would" miss), and then the headline score is a correlation.
//
// FOR CT SPECIFICALLY THIS IS NOT A TECHNICALITY. The absolute attenuation IS the diagnostic content -- a
// reconstruction with the right shapes at the wrong densities is not 99% correct, it is answering a different
// question. Scale-invariance is the right choice for asking "did the ramp filter work"; it is the wrong choice
// for asking "is this reconstruction correct", and the tree only had the first.
//
// SO THIS ADDS TWO THINGS scoreRecon CANNOT PROVIDE:
//   ABSOLUTE FIDELITY -- gain and offset error against the truth, unfitted. The numbers scoreRecon divides out.
//   STRUCTURE         -- pHash, edge overlap and silhouette agreement, which see streaks and rings that a
//                        pixel-wise residual averages into a small number.
//
// *** AND THE WINDOW IS SHARED ON PURPOSE. *** Rendering each field to pixels with its own min/max would
// normalise the gain error away and hand the structural metrics the same blindness that motivated the file. Both
// images are windowed by the TRUTH's range, so a reconstruction 30% too bright is 30% too bright in pixels too.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { scoreRecon } from "./ct.js";
import { ssim, pHash, hamming, phashAgreement, edgeOverlap } from "../../render/perceptual.mjs";
import { iou, scaleDelta } from "../../render/silhouette.mjs";

/**
 * Field -> RGBA, windowed by a SUPPLIED range rather than the field's own. Passing the truth's range for both
 * images is what keeps absolute scale visible; per-image normalisation is the bug this exists to avoid.
 */
export function fieldToImage(field, N, { lo, hi }) {
    const span = (hi - lo) || 1;
    const data = new Uint8ClampedArray(N * N * 4);
    for (let k = 0; k < N * N; k++) {
        const v = Math.max(0, Math.min(255, Math.round(((field[k] - lo) / span) * 255)));
        const o = k * 4;
        data[o] = data[o + 1] = data[o + 2] = v;
        data[o + 3] = 255;
    }
    return { data, w: N, h: N };
}

export function range(field) {
    let lo = Infinity, hi = -Infinity;
    for (const v of field) { if (v < lo) lo = v; if (v > hi) hi = v; }
    return { lo, hi };
}

/**
 * ABSOLUTE fidelity: the gain and offset scoreRecon fits away. A least-squares fit of recon = g*truth + c gives
 * exactly the two numbers being divided out, so reporting them is reporting what the existing score discards.
 */
export function absoluteFidelity(recon, truth) {
    const n = truth.length;
    let st = 0, sr = 0, stt = 0, str = 0;
    for (let k = 0; k < n; k++) { st += truth[k]; sr += recon[k]; stt += truth[k] * truth[k]; str += truth[k] * recon[k]; }
    const denom = n * stt - st * st;
    const gain = denom === 0 ? 1 : (n * str - st * sr) / denom;
    const offset = (sr - gain * st) / n;
    // and the residual AFTER removing nothing: the error a clinician would see
    let se = 0, sv = 0;
    const mt = st / n;
    for (let k = 0; k < n; k++) { const e = recon[k] - truth[k]; se += e * e; const d = truth[k] - mt; sv += d * d; }
    return { gain, offset, gainError: Math.abs(gain - 1), offsetError: Math.abs(offset),
             absRms: Math.sqrt(se / n) / (Math.sqrt(sv / n) || 1) };
}

/** The full picture: what ct.js reports, what it cannot see, and the structural signals. */
export function reconQuality(recon, truth, N) {
    const win = range(truth);
    const iT = fieldToImage(truth, N, win);
    const iR = fieldToImage(recon, N, win);      // SAME window: absolute scale survives into pixels
    const base = scoreRecon(recon, truth);
    const abs = absoluteFidelity(recon, truth);
    return {
        // what the tree already had
        corr: base.corr, rms: base.rms,
        // what it divides out
        gain: abs.gain, offset: abs.offset, gainError: abs.gainError, offsetError: abs.offsetError, absRms: abs.absRms,
        // structure
        structure: phashAgreement(pHash(iT), pHash(iR)),
        phashBits: hamming(pHash(iT), pHash(iR)),
        ssim: ssim(iT, iR),
        edges: edgeOverlap(iT, iR),
        silhouetteIoU: iou(iT, iR, { thresh: 8 }).iou,
        scaleDelta: scaleDelta(iT, iR),
    };
}

/**
 * *** THE OPEN QUESTION IS ANSWERED: NO, FBP'S GAIN MUST NOT BE CORRECTED IN THE FILTER. ***
 *
 * nextRounds carried one OPEN item -- "decide whether FBP's measured gain of 0.649 should be corrected in the
 * filter". A ramp-filter normalisation would be A CONSTANT, and a constant can be divided out once and for all.
 * MEASURED ACROSS EVERY GEOMETRY KNOB, IT IS NOT ONE:
 *
 *     angles  90 / 180 / 360      gain 0.6531 / 0.6503 / 0.6489    <- nearly invariant, as a filter would be
 *     N       64 /  96 / 128      gain 0.4319 / 0.6503 / 0.8599    <- RISES WITH N
 *     nDet    96 / 140 / 200      gain 0.9340 / 0.6503 / 0.4572    <- FALLS WITH nDet
 *
 * *** IT IS A SAMPLING RATIO, NOT A FILTER CONSTANT: gain * nDet / N COLLAPSES TO 0.9456 with a spread of
 * 0.0185 across all seven configurations -- N and nDet each vary by a factor of two and the ratio does not
 * move. *** The number is the count of image pixels a detector bin is smeared over, and it has nothing to do
 * with the ramp.
 *
 * SO CORRECTING 0.649 IN THE FILTER WOULD BE RIGHT AT N=96, nDet=140 -- THE GATE'S OWN FIXTURE -- AND WRONG
 * EVERYWHERE ELSE. It is the shape this tree refuses everywhere: a round's outcome frozen as a constant, and
 * one fixture baked into shipping code. THE HONEST FIX, IF ANYBODY WANTS UNIT GAIN, IS N/nDet SCALING APPLIED
 * WHERE THE GEOMETRY IS KNOWN -- and even that is a CHOICE about what "reconstructed intensity" should mean,
 * not a bug fix.
 *
 * AND absoluteFidelity IS RIGHT TO REPORT IT RATHER THAN NORMALISE IT AWAY, which is the file's whole premise:
 * scoreRecon fits the gain out and is blind to it; this reports it. A geometry-dependent gain is exactly the
 * kind of thing that blindness hides.
 */
export const FBP_GAIN_IS_GEOMETRIC = {
    question: "should FBP's measured gain of 0.649 be corrected in the filter?",
    answer: "NO -- it is not a filter constant. gain * nDet / N = 0.9456 +/- 0.0185 across a 2x range in each.",
    measured: [
        { N: 96, nDet: 140, angles: 180, gain: 0.650279 }, { N: 96, nDet: 140, angles: 90, gain: 0.653138 },
        { N: 96, nDet: 140, angles: 360, gain: 0.648935 }, { N: 64, nDet: 140, angles: 180, gain: 0.431875 },
        { N: 128, nDet: 140, angles: 180, gain: 0.859905 }, { N: 96, nDet: 96, angles: 180, gain: 0.934002 },
        { N: 96, nDet: 200, angles: 180, gain: 0.457222 },
    ],
};

/** The collapsed constant, so the claim above is re-derived rather than quoted. */
export function gainRatio(rows = FBP_GAIN_IS_GEOMETRIC.measured) {
    const ks = rows.map((r) => r.gain * r.nDet / r.N);
    return { ks, mean: ks.reduce((a, b) => a + b, 0) / ks.length, spread: Math.max(...ks) - Math.min(...ks) };
}
