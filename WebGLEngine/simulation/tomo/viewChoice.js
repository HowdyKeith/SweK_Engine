// simulation/tomo/viewChoice.js -- where should a thing look?
//
// Keith asked how a blob sees: not everywhere at once, so what does it focus on? The obvious answer -- look where
// you are most surprised -- is wrong, and finding out why is the useful part. This file holds the machinery and the
// measurements, so nobody has to re-run the argument from scratch.
//
// FIRST, TWO DEAD ENDS WORTH KEEPING, because they rule out the whole class of shortcut:
//
//   Ranking a view by its VARIANCE says the richest look at a row of five blobs is the one where all five stack
//   into a single tall spike. That view is the emptiest possible: one number, consistent with any arrangement of
//   mass along that line. Variance ranks the emptiest view first.
//
//   Ranking it by HIGH-FREQUENCY content says the same thing, for a different reason: a narrow spike is broadband.
//   A delta function has energy at every frequency.
//
//   That is not two unlucky choices. THERE IS NO MODEL-FREE MEASURE OF WHAT A VIEW IS WORTH. A view carries
//   information only RELATIVE TO WHAT IS ALREADY BELIEVED -- which is Keith's question answered before the eye is
//   even built: a thing cannot know where to look until it already has a model. The caveman needs "that bright
//   thing moves" before a parting sky means anything. Without a proto-model, a parting sky is just more sky.
//
// SO: SURPRISE. Predict what a view would show, take it, and measure the disagreement. That works -- but a
// predictor must first be CALIBRATED, because a forward projector that speaks a different dialect from the sensor
// reports disagreement that is only its own accent (measured: 7% even against a model fit to 60 views; anything
// smaller than that is noise, not news).
//
// AND THEN THE RESULT, WHICH IS NEGATIVE AND IS THE POINT:
//
//   views    uniform (rote)    active (surprise-led)
//      4       178.04%              357.33%
//      8        83.22%              194.84%
//     16        20.73%               78.26%
//
// Looking where surprised LOSES, two to three times over, at every budget. And the reason is not the weighting --
// weighting each view by the angular gap it truly owns does not rescue it:
//
//   clustered views, gap-weighted:   6 -> 152.96%,  8 -> 152.60%,  12 -> 152.24%,  16 -> 151.89%     FLAT.
//
// Adding views to a cluster buys NOTHING. Each view is one line through the object's Fourier transform; miss a
// direction and that structure is absent, and no weighting invents data that was never collected. An eye that
// chases surprise CLUSTERS, and clustering is blindness in every direction it did not visit.
//
// THE REAL ANSWER, and it is better than the one that was proposed:
//
//   Curiosity that chases novelty gets stuck. Systematic coverage wins. The caveman does not learn the sun's cycle
//   by staring at the interesting part of the sky -- he learns it by watching the WHOLE sky, evenly, for years,
//   until the pattern falls out of the coverage.
//
//   And the sharp edge: selective looking is only affordable WITH A PRIOR. FBP is a linear reconstructor with no
//   beliefs -- it cannot fill a gap, so it demands uniform coverage. A reconstructor that carries a prior about
//   what worlds are possible (total-variation, L1, compressed sensing) CAN exploit clustered views, because it can
//   fill the unmeasured directions from the prior rather than from data. So the theory is what buys the right to
//   be selective. Perception without a prior must be exhaustive.
//
// That is the honest state of it: the machinery below is real and measured, and the strategy it was built to
// support does not work with the reconstructor this engine has. What would come next is a reconstructor with a
// prior -- and only then does an active eye have anything to win.
"use strict";

// What would this model show at angle theta? Bilinear, to match the reconstruction's own interpolation.
// CALIBRATION (measured, 60-view model): reproduces a fitted view to ~7%. Treat smaller disagreements as accent.
function forwardProject(img, n, theta, nDet) {
    const out = new Float64Array(nDet), ct = Math.cos(theta), st = Math.sin(theta), S = 200;
    for (let i = 0; i < nDet; i++) {
        const s = -1 + (i + 0.5) * 2 / nDet;
        let acc = 0;
        for (let k = 0; k < S; k++) {
            const t = -1 + (k + 0.5) * 2 / S;
            const x = s * ct - t * st, y = s * st + t * ct;
            const fx = (x + 1) * n / 2 - 0.5, fy = (y + 1) * n / 2 - 0.5;
            const i0 = Math.floor(fx), j0 = Math.floor(fy);
            if (i0 < 0 || j0 < 0 || i0 + 1 >= n || j0 + 1 >= n) continue;
            const a = fx - i0, b = fy - j0;
            acc += ((img[j0*n+i0]*(1-a) + img[j0*n+i0+1]*a) * (1-b)
                  + (img[(j0+1)*n+i0]*(1-a) + img[(j0+1)*n+i0+1]*a) * b) * (2 / S);
        }
        out[i] = acc;
    }
    return out;
}

// how far a real view sits from what the model expected. Above ~0.07 it means something; below, it is the accent.
function surprise(img, n, theta, realView) {
    const pred = forwardProject(img, n, theta, realView.length);
    let d = 0, m = 0;
    for (let i = 0; i < realView.length; i++) { d += (realView[i] - pred[i]) ** 2; m += realView[i] * realView[i]; }
    return Math.sqrt(d / Math.max(m, 1e-12));
}

// How evenly has the circle been covered? 1.0 is perfectly uniform, 0 is everything in one place.
// This is the quantity that actually predicts reconstruction quality -- not surprise, not variance.
function coverage(angles) {
    if (angles.length < 2) return 0;
    const s = [...angles].map((a) => ((a % Math.PI) + Math.PI) % Math.PI).sort((x, y) => x - y);
    const gaps = [];
    for (let i = 0; i < s.length; i++) gaps.push(i === s.length - 1 ? (s[0] + Math.PI - s[i]) : (s[i+1] - s[i]));
    const ideal = Math.PI / s.length;
    let worst = 0;
    for (const g of gaps) worst = Math.max(worst, Math.abs(g - ideal));
    return Math.max(0, 1 - worst / Math.PI);
}

// So: the honest strategy. Look where you have NOT looked -- the middle of the widest unseen gap.
function nextAngleByCoverage(seen) {
    if (!seen.length) return 0;
    const s = [...seen].map((a) => ((a % Math.PI) + Math.PI) % Math.PI).sort((x, y) => x - y);
    let best = null;
    for (let i = 0; i < s.length; i++) {
        const a = s[i], b = i === s.length - 1 ? s[0] + Math.PI : s[i+1];
        if (!best || b - a > best.gap) best = { gap: b - a, mid: (a + b) / 2 };
    }
    return best.mid % Math.PI;
}
export { forwardProject, surprise, coverage, nextAngleByCoverage };
