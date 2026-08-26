// brain/rl/surprise.mjs -- WHEN IS THE PHYSICS STATE ONE THE POLICY HAS NO RIGHT TO AN OPINION ABOUT?
//
// v4031 -- Keith, on lifting the "surprise" idea from https://github.com/lucas-maes/le-wm (LeWorldModel, Maes,
// Le Lidec, Scieur, LeCun & Balestriero, 2026). That repo predicts next-frame EMBEDDINGS from pixels and uses
// high prediction error to flag physically implausible events. None of its code is here -- SweK's brain acts on
// physics-state features, not pixels, and trains no world model. THE IDEA IS WHAT TRANSFERS, and it is one idea:
//
//     PREDICTION ERROR IS A CHEAP, MODEL-FREE SIGNAL FOR "THIS STATE IS NOT LIKE THE ONES I WAS FITTED ON".
//
// *** THIS IS THE OTHER HALF OF v4027'S QUESTION, AND THE TWO DO NOT SUBSTITUTE FOR EACH OTHER. ***
// attribution.mjs answers WHY the policy acted -- which input it weighed, with completeness as the axiom that
// makes the number mean something. It answers that question about EVERY state, including states where the
// policy is extrapolating far outside anything it was trained on and its "reasons" are worth nothing. Integrated
// Gradients on garbage returns a confident, axiom-satisfying, completely meaningless attribution.
//
//     SURPRISE SAYS **WHEN** TO DISTRUST THE POLICY.   IG SAYS **WHY** IT ACTED.
//
// Neither answers the other's question, and the pairing is also a straightforward engineering win: IG costs
// `steps` gradient evaluations (64 by default), surprise costs ONE forward pass. So surprise is affordable every
// tick and IG is not -- explainIfSurprising() below spends the expensive one only where the cheap one says the
// state is worth explaining.
//
// *** WHAT A HIGH SURPRISE ACTUALLY MEANS, WHICH IS NOT "OUT OF DISTRIBUTION". ***
// It means THE FORWARD MODEL WAS WRONG. That has at least three causes and they are different facts:
//   1. EPISTEMIC -- a genuinely novel state. This is the one worth flagging.
//   2. ALEATORIC -- an in-distribution state that is simply STOCHASTIC. A collision at a grazing angle is
//      inherently hard to predict and is not novel at all. Prediction error cannot separate this from (1);
//      nothing in this file claims it can.
//   3. AN UNDERTRAINED FORWARD MODEL -- the model is wrong everywhere, so it is wrong here too. THIS ONE IS
//      DETECTABLE and calibrate() refuses rather than returning a detector that cannot detect: if the model's
//      in-distribution residual is not small relative to the spread of the data itself, there is no headroom
//      for a "surprising" reading to mean anything, and a threshold fitted anyway would fire on noise forever.
// So `surprising` here is reported as "the forward model did not predict this", never as "this is impossible".
// The honest name for the number is prediction error; "surprise" is what it is FOR.
//
// *** THE THRESHOLD IS MEASURED, NEVER A CONSTANT. *** A hardcoded "flag above 3.0" is a number nobody can
// defend and that silently means something different for every model and every feature scaling. calibrate()
// takes real in-distribution samples and returns the empirical quantile, fitting the residual scale and
// estimating the threshold ON DISJOINT HALVES so the quantile is out-of-sample. See calibrate()'s own note for
// what that split was and was NOT measured to buy on this tree's fixture -- the honest answer is "less than the
// first draft of this comment claimed", and it is written down there rather than overstated here.
"use strict";

/** Residual scale floor: a feature the model predicts PERFECTLY on calibration data would otherwise divide by
 *  zero and make every later deviation infinitely surprising. */
const SCALE_FLOOR = 1e-9;

/**
 * Per-feature residual scale from calibration samples -- the standard deviation of the model's OWN error on
 * each feature, not the spread of the feature itself.
 *
 * NORMALISING BY RESIDUAL SPREAD IS THE POINT. A feature measured in metres and one measured in radians have
 * incomparable raw errors, and an unnormalised sum lets whichever has the larger units decide every verdict.
 * Dividing by how well the model predicts THAT feature makes the terms dimensionless and comparable, so
 * surprise is "how many of its own typical errors is this model off by" rather than "how many metres".
 */
export function residualScale(residuals) {
    if (!residuals.length) throw new Error("residualScale: no samples");
    const d = residuals[0].length;
    const scale = new Float64Array(d);
    for (let i = 0; i < d; i++) {
        let mean = 0;
        for (const r of residuals) mean += r[i];
        mean /= residuals.length;
        let v = 0;
        for (const r of residuals) { const e = r[i] - mean; v += e * e; }
        scale[i] = Math.sqrt(v / residuals.length);
        if (!(scale[i] > SCALE_FLOOR)) scale[i] = SCALE_FLOOR;
    }
    return scale;
}

/**
 * The surprise of one prediction: the RMS of its per-feature residuals after scaling. Dimensionless, and
 * roughly "how many typical errors off was this" -- so ~1 is an ordinary step and a large value is not.
 */
export function surpriseOf(predicted, actual, scale) {
    if (predicted.length !== actual.length) throw new Error("surpriseOf: length mismatch " + predicted.length + " vs " + actual.length);
    let s = 0;
    for (let i = 0; i < predicted.length; i++) {
        const z = (predicted[i] - actual[i]) / (scale ? scale[i] : 1);
        s += z * z;
    }
    return Math.sqrt(s / predicted.length);
}

/** The empirical quantile of a sample, linearly interpolated. Sorts a copy -- never the caller's array. */
export function quantile(values, q) {
    if (!values.length) throw new Error("quantile: no samples");
    const v = Float64Array.from(values).sort();
    const pos = (v.length - 1) * Math.min(1, Math.max(0, q));
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? v[lo] : v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/**
 * Fit a surprise detector on in-distribution transitions.
 *
 * @param predictFn  (observation, action) => predicted next observation (array-like)
 * @param samples    [{ observation, action, next }] -- REAL transitions the policy was trained among
 * @param quantileTarget  the in-distribution fraction that must fall BELOW the threshold (0.99 => a ~1%
 *                        false-positive rate by construction)
 * @param minHeadroom  the largest in-distribution median residual, relative to the data's own spread, that
 *                     still counts as a usable model. Above it, calibrate REFUSES -- see cause (3) in the
 *                     header. Default 0.5: a model whose typical error is half the spread of the data it is
 *                     predicting has no room left to be surprised in.
 *
 * THE SPLIT: `scale` is fitted on the first half and the threshold is read off the SECOND, so the quantile is
 * an OUT-OF-SAMPLE estimate. This is methodological hygiene -- an in-sample quantile is an estimate of a
 * threshold tuned to the very rows it was measured on, and is not the (1-q) guarantee it appears to be.
 *
 * *** HONESTY ABOUT WHAT WAS MEASURED, v4031: ON THIS TREE'S FIXTURE THE BIAS IS SMALL AND ITS DIRECTION IS
 * NOT CONSISTENT. *** Over 25 independent seeds, fitting and estimating on the same rows moved the mean
 * held-out false-positive rate from 1.87% to 1.48%, and the threshold moved DOWN in only 10 of 25 trials --
 * so no clean directional claim survives contact with the measurement, and an earlier draft of this comment
 * asserting one (in each direction, on successive attempts) was wrong both times. The reason the effect is
 * muted here is that the fixture's forward model is nearly exact, so its residuals are tiny and homogeneous
 * and there is little in-sample optimism to have. The split stays because it is correct under a model that is
 * merely good rather than nearly exact -- not because this fixture proves it dramatic.
 */
export function calibrate(predictFn, samples, { quantileTarget = 0.99, minHeadroom = 0.5 } = {}) {
    if (samples.length < 8) throw new Error("calibrate: need at least 8 transitions, got " + samples.length);
    const mid = Math.floor(samples.length / 2);
    const fitRows = samples.slice(0, mid), estRows = samples.slice(mid);

    const resid = (rows) => rows.map((s) => {
        const p = predictFn(s.observation, s.action);
        if (p.length !== s.next.length) throw new Error("calibrate: predictFn returned length " + p.length + " != next " + s.next.length);
        const r = new Float64Array(p.length);
        for (let i = 0; i < p.length; i++) r[i] = p[i] - s.next[i];
        return r;
    });

    const scale = residualScale(resid(fitRows));

    // THE HEADROOM CHECK -- cause (3) in the header, made detectable rather than assumed away. Compare the
    // model's typical residual against the spread of the TARGET DATA ITSELF. A model whose error is comparable
    // to simply guessing the mean is not a forward model, and a threshold fitted on it would be decoration.
    const d = samples[0].next.length;
    const dataSpread = new Float64Array(d);
    for (let i = 0; i < d; i++) {
        let m = 0; for (const s of samples) m += s.next[i]; m /= samples.length;
        let v = 0; for (const s of samples) { const e = s.next[i] - m; v += e * e; }
        dataSpread[i] = Math.sqrt(v / samples.length);
    }
    let worst = 0, worstFeature = -1;
    for (let i = 0; i < d; i++) {
        if (!(dataSpread[i] > SCALE_FLOOR)) continue;      // a constant feature cannot be predicted badly
        const ratio = scale[i] / dataSpread[i];
        if (ratio > worst) { worst = ratio; worstFeature = i; }
    }
    const usable = worst <= minHeadroom;

    const estSurprise = resid(estRows).map((r) => {
        let s = 0; for (let i = 0; i < r.length; i++) { const z = r[i] / scale[i]; s += z * z; }
        return Math.sqrt(s / r.length);
    });

    return {
        scale,
        threshold: quantile(estSurprise, quantileTarget),
        quantileTarget,
        // REPORTED, NOT HIDDEN: a caller can see how ordinary an ordinary step is before trusting the threshold.
        inDistMedian: quantile(estSurprise, 0.5),
        inDistMax: quantile(estSurprise, 1),
        fitCount: fitRows.length,
        estCount: estRows.length,
        // The headroom verdict travels WITH the detector so it cannot be separated from it.
        usable,
        headroom: worst,
        headroomFeature: worstFeature,
        headroomNote: usable
            ? "the forward model's typical error is small relative to the spread of what it predicts, so a large surprise is informative"
            : "*** UNUSABLE: the forward model's error on feature " + worstFeature + " is " + worst.toFixed(3) +
              " of that feature's own spread. This model is wrong everywhere, so 'wrong here' says nothing about " +
              "this state. Train the forward model before reading its surprise. ***",
    };
}

/**
 * Score one transition against a calibrated detector. Returns the number AND the verdict, with the
 * calibration's own usability carried through -- a `surprising: true` from an unusable detector is not a
 * finding and must not be able to look like one.
 */
export function score(cal, predicted, actual) {
    const value = surpriseOf(predicted, actual, cal.scale);
    return {
        value,
        threshold: cal.threshold,
        // RATIO TO THE ORDINARY STEP, because "4.2" means nothing to a reader and "6x a typical step" does.
        timesTypical: cal.inDistMedian > SCALE_FLOOR ? value / cal.inDistMedian : null,
        surprising: cal.usable && value > cal.threshold,
        trustworthy: cal.usable,
        note: cal.usable ? null : cal.headroomNote,
    };
}

/**
 * *** THE PAIRING THIS FILE EXISTS FOR. *** Score the transition; only when it is surprising, spend the
 * expensive Integrated-Gradients explanation on it.
 *
 * @param explainFn  () => attribution result. Called ONLY when the state is surprising -- typically a closure
 *                   over policyAttribution(P, {...}), which costs `steps` gradient evaluations (64 by default)
 *                   against surprise's single forward pass.
 *
 * Returns { ...score, explanation } where `explanation` is null when the state was ordinary. NULL MEANS "NOT
 * ASKED", NOT "NOTHING FOUND" -- an ordinary state has reasons too, they were simply not worth 64 gradients.
 * The two are different facts and the field name is the only place to say so, hence `explained`.
 */
export function explainIfSurprising(cal, predicted, actual, explainFn) {
    const s = score(cal, predicted, actual);
    if (!s.surprising) return { ...s, explained: false, explanation: null };
    return { ...s, explained: true, explanation: explainFn() };
}
