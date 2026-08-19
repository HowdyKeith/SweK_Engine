// WebGLEngine/simulation/lbm/dSweep.mjs -- v3347
//
// *** THE WAKE FREQUENCY IS NOT SHEDDING. THE ARC'S PREMISE WAS WRONG, AND THE TEST THAT SETTLED IT WAS WRITTEN
// DOWN BEFORE IT RAN. ***
//
// v3346 recorded D_SWEEP_PREDICTION as executable intent, with two branches and no third:
//   IF SHEDDING     f scales as U/D, so St stays near 0.13 and the raw frequency MOVES
//   IF DOMAIN MODE  f stays FIXED as D changes, so St moves in proportion to D
//
// MEASURED (tau 0.55, U 0.09, yOffset 1.5, settle 6000 + record 18000, ~120s each):
//
//     D    Re     blockage   fWake          stWake
//      8   43.2     9.9%     4.804020e-4    0.04270
//     12   64.8    14.8%     9.673892e-4    0.12899
//     16   86.4    19.8%     9.479221e-4    0.16852
//
// *** BETWEEN D=12 AND D=16 THE FREQUENCY IS CONSTANT TO 2% WHILE D GROWS 33%. *** That is the DOMAIN-MODE
// branch, and it matches QUANTITATIVELY rather than merely in direction: with f fixed, St must scale as D, so
// St should rise by 16/12 = 1.3333. MEASURED St RATIO 0.16852 / 0.12899 = 1.3064 -- WITHIN 2% OF THE PREDICTION.
// Reynolds changed by the same 33% across that pair, so a frequency invariant to both is set by neither.
//
// SHEDDING IS EXCLUDED, NOT MERELY UNSUPPORTED: it requires f PROPORTIONAL TO 1/D, so f should have FALLEN from
// D=12 to D=16. It did not fall. And St, which shedding holds roughly flat over this Reynolds range, VARIES
// FOUR-FOLD across the sweep. Both halves of the shedding signature fail at once.
//
// *** D=8 FITS NEITHER BRANCH AND IS REPORTED RATHER THAN DROPPED. *** f there is HALF the other two. At Re 43.2
// the flow is plausibly below any instability at all, and a DFT run on a featureless signal RETURNS A NUMBER
// REGARDLESS -- dominantFrequency has no way to say "there is no tone here". So that point is evidence of
// nothing, which is different from evidence against, and a sweep that quietly kept only its two agreeing points
// would be the shape of every result this project distrusts.
//
// WHAT THIS EXPLAINS RETROACTIVELY, AND IT IS THE WHOLE ARC:
//   - THE LIFT NEVER SUSTAINED (v3341, v3346) because there is no shedding force to sustain it. Six rounds
//     prescribed longer runs, different probes, lower blockage and more warmup for a street that was not there.
//   - THE WAKE PROBE KEPT A CLEAN FREQUENCY because a domain mode really is present -- it just is not the body
//     shedding.
//   - MY OWN "CONSISTENT STROUHAL" CORROBORATION (v3341, retracted v3346) looked strong ONLY because those runs
//     shared D. Vary D and the consistency evaporates, which is exactly what the retraction anticipated.
//
// NOT CLAIMED: WHAT the mode is. A standing wave set by the domain length, a recirculation-bubble oscillation,
// or an artefact of the outlet condition are all live, and separating them needs the DOMAIN varied rather than
// the body. NAMING A MECHANISM IS STILL NOT MEASURING ONE.
"use strict";

export const D_SWEEP_V3347 = [
    { D: 8, re: 43.2, blockage: 8 / 81, fWake: 4.804020e-4, stWake: 0.04270, liftAmplitude: 3.275e-2 },
    { D: 12, re: 64.8, blockage: 12 / 81, fWake: 9.673892e-4, stWake: 0.12899, liftAmplitude: 5.188e-2 },
    { D: 16, re: 86.4, blockage: 16 / 81, fWake: 9.479221e-4, stWake: 0.16852, liftAmplitude: 5.276e-2 },
];

/** Which branch of the pre-registered prediction does a pair support? */
export function branchFor(a, b) {
    const fRatio = b.fWake / a.fWake, dRatio = b.D / a.D, stRatio = b.stWake / a.stWake;
    return {
        fRatio, dRatio, stRatio,
        fixedFrequency: Math.abs(fRatio - 1) < 0.05,          // domain-mode branch
        stTracksD: Math.abs(stRatio / dRatio - 1) < 0.05,      // its quantitative consequence
        sheddingWouldNeed: 1 / dRatio,                          // f ratio shedding demands
        sheddingExcluded: Math.abs(fRatio - 1 / dRatio) > 0.2,
    };
}
