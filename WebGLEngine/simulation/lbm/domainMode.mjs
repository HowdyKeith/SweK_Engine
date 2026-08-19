// WebGLEngine/simulation/lbm/domainMode.mjs -- v3348
//
// WHAT IS THE MODE? v3347 EXCLUDED SHEDDING AND DELIBERATELY DID NOT NAME A REPLACEMENT.
//
// The frequency held constant to 2% while the body grew 33% (and Reynolds with it), and St tracked D to within
// 2% of the fixed-frequency prediction. So it is set by neither the body nor the flow speed. THREE CANDIDATES
// WERE LEFT LIVE AND UNRANKED: a standing wave set by the domain length, a recirculation-bubble oscillation,
// or an artefact of the outlet condition.
//
// *** THIS PREDICTION IS WRITTEN AND COMMITTED BEFORE THE SWEEP RUNS. *** v3347's gate checks that its own
// prediction was not reworded to fit the result, and that check is worth nothing if the next round quietly
// drops the practice. The sweep varies nx -- THE DOMAIN LENGTH -- while leaving the body, the inlet and the
// probe exactly where they are: cx stays 70, D stays 12, and the wake probe sits at min(nx-3, cx+4D) = 118 for
// every nx tried, so the ONLY thing that changes is how much channel exists downstream of the probe.
export const NX_SWEEP_PREDICTION = {
    vary: "nx (domain length) at fixed tau, U, D, cx and yOffset -- the probe stays at x=118 in every case",
    baseline: "nx 300 measured at v3347: fWake 9.673892e-4, stWake 0.12899",
    ifDomainStandingWave:
        "f scales as 1/nx -- a wave whose wavelength is set by the box. nx 300 -> 200 should RAISE f by ~1.5x " +
        "(to ~1.45e-3); nx 300 -> 450 should LOWER it by ~1.5x (to ~6.4e-4).",
    ifLocalMode:
        "f is INDEPENDENT of nx -- a recirculation bubble or near-body oscillation does not know how long the " +
        "channel is behind it. All three frequencies land within a few percent of 9.67e-4.",
    ifOutletArtefact:
        "f moves with nx but NOT as a clean 1/nx -- the outlet is a boundary condition rather than a resonant " +
        "length, so a reflection time would scale with the distance from probe to outlet, which is nx-118 " +
        "rather than nx. That predicts a DIFFERENT ratio from the standing wave and is the reason to compute " +
        "both rather than eyeballing 'it moved'.",
    confound:
        "Cost scales with nx, so the long case is the expensive one and only three points are affordable. THREE " +
        "POINTS CAN SEPARATE THESE BRANCHES BUT CANNOT FIT AN EXPONENT -- if the answer is 'moves, but not " +
        "cleanly as either', that is the honest ceiling and it must be reported as such rather than rounded " +
        "toward whichever branch is closer.",
};

/** Which branch does a pair support? Both candidate lengths are computed, never just the convenient one. */
export function branchForNx(a, b, probeX = 118) {
    const fRatio = b.fWake / a.fWake;
    return {
        fRatio,
        standingWavePredicts: a.nx / b.nx,                       // f ~ 1/nx
        outletPredicts: (a.nx - probeX) / (b.nx - probeX),       // f ~ 1/(distance to outlet)
        localPredicts: 1,
        near: (x) => Math.abs(fRatio - x) / x < 0.1,
    };
}

// ============================================================================================================
// RESULT (v3348). MEASURED at tau 0.55, U 0.09, D 12, cx 70, yOffset 1.5, settle 6000 + record 18000:
//
//     nx     fWake          stWake     ratio vs nx=300
//     200    1.727459e-3    0.23033    1.7857
//     300    9.673892e-4    0.12899    1.0000   (v3347 baseline)
//     450    7.421280e-4    0.09895    0.7671
//
// *** THE LOCAL-MODE BRANCH IS DECISIVELY EXCLUDED: the frequency moves 2.3-fold across the nx range while the
// body, the inlet and the probe never move. *** A recirculation bubble does not know how long the channel is
// behind it. Whatever this is, THE DOMAIN SETS IT.
//
// *** AND NO TESTED LENGTH SCALE FITS ALL THREE POINTS. THIS IS THE PRE-REGISTERED HONEST CEILING, REPORTED AS
// SUCH RATHER THAN ROUNDED TOWARD THE NEAREST BRANCH: ***
//
//     branch                    300->200 predicts / measured 1.7857   300->450 predicts / measured 0.7671
//     standing wave  1/nx             1.5000   (-16%)                       0.6667   (-13%)
//     outlet from probe                2.2195   (+24%)                       0.5482   (-29%)
//     body to outlet                   1.7692   (-1%)                        0.6053   (-21%)
//
// *** THE THIRD ROW IS A LESSON RATHER THAN AN ANSWER. *** After seeing nx=200 I formed a post-hoc hypothesis --
// that the resonant length runs from the BODY at cx=70 to the outlet -- and it matched to within 1%. I stated
// it as a prediction for nx=450 BEFORE running that case, precisely because a hypothesis fitted to the data
// that suggested it is not evidence. IT MISSED BY 21% AND IS DEAD. TWO POINTS WILL FIT ALMOST ANY LENGTH SCALE;
// the only thing that made this checkable was writing the third prediction down first.
//
// CONFOUND NAMED, NOT WAVED AWAY: a longer channel has more volume to fill, so the same settle+record budget
// buys a less-settled flow at nx=450 than at nx=200. That biases the long case and could plausibly account for
// part of its miss -- which is a reason to distrust the nx=450 point specifically, NOT a licence to drop it and
// declare body-to-outlet the winner on the two that agreed.
// ============================================================================================================

export const NX_SWEEP_V3348 = [
    { nx: 200, fWake: 1.727459e-3, stWake: 0.23033, liftAmplitude: 1.195e-1 },
    { nx: 300, fWake: 9.673892e-4, stWake: 0.12899, liftAmplitude: 5.188e-2 },
    { nx: 450, fWake: 7.421280e-4, stWake: 0.09895 },
];

/** Excluded outright, or merely unfitted? The two are different verdicts and are returned apart. */
export function domainVerdict(sweep = NX_SWEEP_V3348) {
    const f = sweep.map((s) => s.fWake);
    const spread = Math.max(...f) / Math.min(...f);
    const base = sweep.find((s) => s.nx === 300);
    const fits = sweep.filter((s) => s.nx !== 300).map((s) => {
        const b = branchForNx(base, s);
        return { nx: s.nx, ratio: b.fRatio, standingWave: b.standingWavePredicts, outlet: b.outletPredicts,
                 bodyToOutlet: (300 - 70) / (s.nx - 70) };
    });
    const within = (m, p) => Math.abs(m - p) / p < 0.1;
    return {
        spread,
        localExcluded: spread > 1.5,
        anyBranchFitsAll:
            fits.every((x) => within(x.ratio, x.standingWave)) ||
            fits.every((x) => within(x.ratio, x.outlet)) ||
            fits.every((x) => within(x.ratio, x.bodyToOutlet)),
        fits,
    };
}
