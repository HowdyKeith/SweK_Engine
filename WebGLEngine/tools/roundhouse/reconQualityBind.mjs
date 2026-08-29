// tools/roundhouse/reconQualityBind.mjs
//
// THE CT SCORE REPORTS A PERFECT RECONSTRUCTION FOR AN IMAGE THAT IS 30% TOO BRIGHT, AND ITS OWN COMMENT SAYS
// WHY.
//
// physics/tomography/ct.js scores a reconstruction against "the truth we own" -- and the phantom IS owned,
// constructed from ellipses rather than measured, so unlike every other image comparison in this tree there is
// EXACT ground truth. That is what makes this the right place to point the perceptual work, and it is also what
// makes the blind spot measurable rather than arguable.
//
// *** scoreRecon SUBTRACTS BOTH MEANS AND FITS A GAIN BEFORE COMPUTING ITS RESIDUAL, SO IT IS AFFINE-INVARIANT
// BY CONSTRUCTION. *** MEASURED:
//
//     recon = truth * 1.3    corr 1.000000000000052   rms 9.88e-14
//     recon = truth + 0.4    corr 1.000000000000074   rms 2.94e-13
//
// Both report a PERFECT reconstruction. FOR CT THIS IS NOT A TECHNICALITY: the absolute attenuation IS the
// diagnostic content, and a reconstruction with the right shapes at the wrong densities is not 99% correct, it
// is answering a different question. Scale-invariance is the right choice for "did the ramp filter work" and
// the wrong one for "is this reconstruction correct", and the tree only had the first.
//
// ================================================================================================================
// THE RECOVERY IS EXACT, WHICH IS WHAT MAKES IT A KEY RATHER THAN A SECOND OPINION
// ================================================================================================================
//
// absoluteFidelity least-squares-fits recon = g*truth + c, and g and c ARE THE TWO NUMBERS scoreRecon DIVIDES
// OUT. So it does not estimate the blindness, it RECOVERS IT: 1.3000000000000853 against a planted 1.3, and
// 0.39999999999979885 against a planted 0.4. The unfitted residual it reports beside them is 0.4182 -- the
// error a clinician would see, where scoreRecon reports 1e-13.
//
// ================================================================================================================
// *** THE PLANT IS THE MODULE'S OWN NAMED HAZARD, AND IT RESTORES THE BLINDNESS THE FILE EXISTS TO REMOVE ***
// ================================================================================================================
//
// reconQuality.mjs' header: "AND THE WINDOW IS SHARED ON PURPOSE. Rendering each field to pixels with its own
// min/max would normalise the gain error away and hand the structural metrics the same blindness that motivated
// the file." Planted, each image is windowed by ITS OWN range. MEASURED:
//
//                        structure   ssim     edges     iou
//     1.3x  shared        0.841270   0.936553  0.917526  1.0000
//     1.3x  PER-IMAGE     1.000000   1.000000  1.000000  1.0000   <- flawless, and 30% too bright
//     +0.4  shared        0.841270   0.843283  0.917526  0.4952
//     +0.4  PER-IMAGE     1.000000   1.000000  1.000000  1.0000
//
// Not degraded -- EXACTLY ONE. A single line of normalisation turns the only metrics that could see the fault
// into a second copy of the score that could not. plantKind METHOD: the comparison's arithmetic is wrong and no
// config value records it.
//
// AND THE NUMERIC HALF IS BLIND TO IT BY CONSTRUCTION, which is how the fault is localised: scoreRecon and
// absoluteFidelity work on the FIELDS and never see a pixel, so they are bit-identical under the plant. A device
// carrying only those would report the plant absent -- and a device carrying only the structural metrics would
// report the reconstruction perfect. Neither half is sufficient, which is the file's whole argument.
//
// *** THE SILHOUETTE METRICS ARE BLIND TO GAIN EVEN UNDER THE SHARED WINDOW, AND THAT IS A SEPARATE FINDING. ***
// iou reads 1.0000 for the 30%-brighter image because thresholding at 8 puts the same pixels inside the shape,
// and 0.4952 for the shifted one because a constant offset floods the background past the threshold. A metric
// blind to one affine direction and not the other is worth reporting as two numbers rather than one.
//
// ================================================================================================================
// AND AN OPEN QUESTION THE MODULE CLOSED: FBP'S GAIN IS NOT A FILTER CONSTANT
// ================================================================================================================
//
// nextRounds carried "decide whether FBP's measured gain of 0.649 should be corrected in the filter". A ramp
// normalisation would be A CONSTANT. Measured across every geometry knob it is not one -- the raw gains run
// 0.4319 to 0.9340, a factor of 2.16 -- but gain * nDet / N COLLAPSES to 0.9456 with a spread of 0.0185 while N
// and nDet each vary by a factor of two. IT IS A SAMPLING RATIO: the count of image pixels a detector bin is
// smeared over, with nothing to do with the ramp. Correcting 0.649 in the filter would be right at the gate's
// own fixture and wrong everywhere else.

import { phantomField, radon, filteredBackProjection } from "../../physics/tomography/ct.js";
import { scoreRecon } from "../../physics/tomography/ct.js";
import { reconQuality, absoluteFidelity, fieldToImage, range, gainRatio, FBP_GAIN_IS_GEOMETRIC }
    from "../../physics/tomography/reconQuality.mjs";
import { ssim, pHash, hamming, phashAgreement, edgeOverlap } from "../../render/perceptual.mjs";
import { iou, scaleDelta } from "../../render/silhouette.mjs";

export const RECONQ_OBSERVABLES = [
    "scaledCorr", "scaledRms", "shiftedCorr", "shiftedRms",
    "recoveredGain", "gainRecoveryErr", "recoveredOffset", "offsetRecoveryErr",
    "absRmsScaled", "absRmsShifted",
    "structureScaled", "ssimScaled", "edgesScaled", "iouScaled", "iouShifted",
    "fbpRatioMean", "fbpRatioSpread", "fbpGainSpread", "fbpTableWorstDrift",
];

const DEF = { N: 96, gain: 1.3, offset: 0.4, thresh: 8 };

const ELL = [{ cx: 0, cy: 0, a: 0.7, b: 0.9, rho: 1 },
             { cx: 0.2, cy: -0.1, a: 0.2, b: 0.15, rho: -0.5 },
             { cx: -0.25, cy: 0.3, a: 0.12, b: 0.12, rho: 0.6 }];

/**
 * The structural half, with the window as the fault site.
 *   HONEST  both fields windowed by the TRUTH's range -- so a reconstruction 30% too bright is 30% too bright
 *           in pixels too.
 *   PLANTED each field windowed by its OWN range, which is the module's own named hazard.
 */
function structure(truth, recon, N, thresh, planted) {
    const wT = range(truth), wR = planted ? range(recon) : wT;
    const iT = fieldToImage(truth, N, wT), iR = fieldToImage(recon, N, wR);
    return {
        structure: phashAgreement(pHash(iT), pHash(iR)),
        ssim: ssim(iT, iR),
        edges: edgeOverlap(iT, iR),
        iou: iou(iT, iR, { thresh }).iou,
    };
}

function buildReconQuality({ mode = "blindspot", config = {} } = {}) {
    const c = { ...DEF, ...config };
    const planted = !!config.planted;
    const N = Math.max(16, c.N | 0);

    const truth = phantomField(N, ELL);
    const scaled = Float64Array.from(truth, (v) => v * c.gain);
    const shifted = Float64Array.from(truth, (v) => v + c.offset);

    // ---- WHAT THE SCORE SEES. Field-space, so blind to the windowing plant BY CONSTRUCTION.
    const sSc = scoreRecon(scaled, truth), sSh = scoreRecon(shifted, truth);
    const aSc = absoluteFidelity(scaled, truth), aSh = absoluteFidelity(shifted, truth);

    // ---- WHAT IT CANNOT SEE. Pixel-space, and the window is where the plant lives.
    const stSc = structure(truth, scaled, N, c.thresh, planted);
    const stSh = structure(truth, shifted, N, c.thresh, planted);

    // ---- THE GEOMETRIC GAIN, RE-DERIVED from the recorded rows rather than quoted from the sentence beside them.
    const g = gainRatio();
    const gains = FBP_GAIN_IS_GEOMETRIC.measured.map((r) => r.gain);

    return {
        scaledCorr: sSc.corr, scaledRms: sSc.rms,
        shiftedCorr: sSh.corr, shiftedRms: sSh.rms,
        // NOT an estimate of the blindness -- a RECOVERY of it. g and c are the two numbers scoreRecon divides out.
        recoveredGain: aSc.gain, gainRecoveryErr: Math.abs(aSc.gain - c.gain),
        recoveredOffset: aSh.offset, offsetRecoveryErr: Math.abs(aSh.offset - c.offset),
        // The residual with nothing removed: the error a clinician would see.
        absRmsScaled: aSc.absRms, absRmsShifted: aSh.absRms,
        structureScaled: stSc.structure, ssimScaled: stSc.ssim, edgesScaled: stSc.edges,
        // Reported as TWO numbers because the silhouette is blind to gain and not to offset, and one number
        // averaging them would hide which affine direction it can see.
        iouScaled: stSc.iou, iouShifted: stSh.iou,
        fbpRatioMean: g.mean, fbpRatioSpread: g.spread,
        // The RAW spread, so "it collapses" is a comparison rather than an assertion.
        fbpGainSpread: Math.max(...gains) - Math.min(...gains),
        // *** v4068 -- THE TABLE'S ARITHMETIC WAS RE-DERIVED AND ITS PHYSICS WAS NOT. *** An observable census
        // flagged fbpRatioMean, fbpRatioSpread and fbpGainSpread as moved by nothing -- no knob, no plant, no
        // rung -- which is true and, for a REPLAYED MEASUREMENT, expected. gainRatio() already recomputes the
        // collapsed constant from the recorded rows, and reconQualityBind-selfcheck says so: the claim in
        // FBP_GAIN_IS_GEOMETRIC.answer cannot drift away from the rows. But the ROWS are typed gains, and
        // nothing re-measured whether an FBP at (N, nDet, angles) still produces them. A reconstruction change
        // would leave this device asserting a law about a renderer that no longer exists -- the shape v3712
        // named on blackHole's onsetHi: RE-DERIVE FROM WHAT IS IN PLAY, NEVER TYPE A NUMBER BACK IN.
        //
        // Every recorded row is now re-run. MEASURED: the live gains reproduce the table to 3e-7, which is the
        // rounding in its own six decimal places, at 25-63 ms per row. The table is CHECKED rather than quoted.
        //
        // *** AND THE NUMBER WITNESSES ITSELF, WHICH IS WHY IT IS REPORTED AS A DRIFT AND NOT AS A BOOLEAN. ***
        // The next census flagged this observable too -- no knob moves a re-derivation of a frozen table, and
        // none should. What keeps it from being a check that cannot fail is the VALUE: live 0.6502792653978106
        // against a recorded 0.650279 is 2.654e-7, exactly the six-decimal rounding of the row it re-derives.
        // A drift of EXACTLY 0 would mean the recorded value had been compared with itself -- the live
        // reconstruction never ran -- and NaN would mean it ran and failed. So the small nonzero reading is
        // the evidence that both sides are being computed, which a pass/fail boolean here would have thrown
        // away. THE PRECISION OF THE AGREEMENT IS THE WITNESS.
        fbpTableWorstDrift: Math.max(...FBP_GAIN_IS_GEOMETRIC.measured.map((r) => {
            const angles = Array.from({ length: r.angles }, (_, i) => i * Math.PI / r.angles);
            const truth = phantomField(r.N, ELL);
            const recon = filteredBackProjection(radon(truth, r.N, angles, r.nDet), r.N, angles, r.nDet);
            return Math.abs(absoluteFidelity(recon, truth).gain - r.gain);
        })),
    };
}

const RECONQUALITY_MODES = ["blindspot"];   // v4074 -- the single source `modes` and `defaults()` both read

export const reconQualityDevice = {
    plantKind: "method",
    modes: RECONQUALITY_MODES,
    name: "what-the-ct-score-cannot-see",
    observables: RECONQ_OBSERVABLES,
    build: buildReconQuality,
    // v4074 -- ONE DECLARATION, HONOURED BY BOTH FIELDS. `defaults()` used to return `mode || "blindspot"`,
    // which ECHOES ANY STRING BACK, so checkMode asked for a nonsense mode, got it back, and concluded the
    // device declared it. A mode selects WHICH PHYSICS RUNS, so a device that accepts a name it does not
    // declare runs something else and says nothing. The list was never unknown -- it is the `modes` array
    // directly above -- and build() never reads `mode` at all, so there was no second mode to protect.
    // Both fields read MODES so a future mode cannot be added to one and missed by the other.
    defaults: ({ mode } = {}) => ({ mode: RECONQUALITY_MODES.includes(mode) ? mode : RECONQUALITY_MODES[0], config: { ...DEF } }),
};

/**
 * v3327's split: this half PRINTS and reconQualityBind-selfcheck beside it is what exits nonzero.
 * *** THIS FUNCTION IS WHY THE MODULE WAS DOORLESS. *** physics/tomography/reconQuality.mjs has carried an
 * instruments row since v3340, and the bench serves a row by deriving its module from the gate field and
 * requiring reportLines() -- which reconQuality.mjs does not export. The row pointed at method-lab.html, which
 * renders the row's TEXT and never runs anything. So the subject had a door that showed its key and no door
 * that produced a number, and the register could not tell the two apart.
 */
export function reportLines() {
    const h = buildReconQuality({ mode: "blindspot", config: {} });
    const p = buildReconQuality({ mode: "blindspot", config: { planted: true } });
    const f = (v, n = 6) => (Math.abs(v) < 1e-4 && v !== 0 ? v.toExponential(3) : v.toFixed(n));
    const L = [];
    L.push("[tomography/reconQuality] what the CT score cannot see");
    L.push("");
    L.push("  THE BLIND SPOT, IN BOTH AFFINE DIRECTIONS");
    L.push("    recon = truth * 1.3    corr " + h.scaledCorr.toFixed(12) + "   rms " + f(h.scaledRms));
    L.push("    recon = truth + 0.4    corr " + h.shiftedCorr.toFixed(12) + "   rms " + f(h.shiftedRms));
    L.push("    Both report a PERFECT reconstruction. scoreRecon subtracts both means AND fits a gain,");
    L.push("    so it is affine-invariant BY CONSTRUCTION -- and for CT the absolute attenuation IS the");
    L.push("    diagnostic content, so this is not a technicality.");
    L.push("");
    L.push("  AND THE RECOVERY IS EXACT, NOT AN ESTIMATE");
    L.push("    gain   recovered " + h.recoveredGain.toFixed(13) + "   err " + f(h.gainRecoveryErr));
    L.push("    offset recovered " + h.recoveredOffset.toFixed(13) + "   err " + f(h.offsetRecoveryErr));
    L.push("    unfitted residual  " + f(h.absRmsScaled) + " scaled, " + f(h.absRmsShifted) + " shifted");
    L.push("    -- the error a clinician would see, where scoreRecon reports 1e-13.");
    L.push("");
    L.push("  WHAT SEES THROUGH IT, AND WHAT STILL DOES NOT");
    L.push("    structure " + f(h.structureScaled) + "   ssim " + f(h.ssimScaled) + "   edges " + f(h.edgesScaled));
    L.push("    iou  " + f(h.iouScaled, 4) + " scaled   " + f(h.iouShifted, 4) + " shifted");
    L.push("    *** THE SILHOUETTE IS BLIND TO GAIN AND NOT TO OFFSET. *** Scaling leaves the same pixels");
    L.push("    above the threshold; a constant offset floods the background past it. Two numbers, because");
    L.push("    one averaging them would hide which affine direction it can see.");
    L.push("");
    L.push("  FBP'S GAIN IS A SAMPLING RATIO, NOT A FILTER CONSTANT");
    L.push("    raw gains span     " + f(h.fbpGainSpread) + " across " + FBP_GAIN_IS_GEOMETRIC.measured.length + " configurations");
    L.push("    gain * nDet / N    " + f(h.fbpRatioMean) + " +/- " + f(h.fbpRatioSpread));
    L.push("    N and nDet each vary by a factor of two and the ratio does not move. Correcting 0.649 in");
    L.push("    the filter would be right at one fixture and wrong everywhere else.");
    L.push("");
    L.push("  UNDER THE PLANT -- each image windowed by ITS OWN range, the module's own named hazard");
    L.push("    structure " + f(h.structureScaled) + " -> " + p.structureScaled +
           "   ssim " + f(h.ssimScaled) + " -> " + p.ssimScaled);
    L.push("    edges     " + f(h.edgesScaled) + " -> " + p.edgesScaled +
           "   iou(shift) " + f(h.iouShifted, 4) + " -> " + p.iouShifted);
    L.push("    NOT DEGRADED -- EXACTLY ONE. A single line of normalisation turns the only metrics that");
    L.push("    could see the fault into a second copy of the score that could not.");
    L.push("    corr/rms/gain/offset  BIT-IDENTICAL: they work on the FIELDS and never see a pixel.");
    L.push("    *** NEITHER HALF IS SUFFICIENT: the numeric half reports the plant absent, the structural");
    L.push("    half reports the reconstruction perfect. ***");
    return L;
}
