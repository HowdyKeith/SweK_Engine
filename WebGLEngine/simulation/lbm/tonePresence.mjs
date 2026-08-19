// WebGLEngine/simulation/lbm/tonePresence.mjs -- v3349
//
// *** I PROPOSED THAT THE WAKE "FREQUENCY" WAS THE DFT REPORTING NOISE. IT IS NOT. THE TONES ARE REAL, AND
// MEASURING PROPERLY IS WHAT KILLED MY OWN HYPOTHESIS. ***
//
// v3348 found the frequency non-monotone in domain length (nx 200/300/450/600 -> 1.7275e-3, 9.674e-4, 7.421e-4,
// 8.839e-4 -- falls, falls, RISES). I read that as an estimator with no peak to find. Two corrections came out
// of testing it:
//
// FIRST, A CORRECTION TO WHAT I SAID ABOUT THE EXISTING FIELDS. I suggested `power` and `cycles` were the
// "is there a tone" fields I had been ignoring. THEY ARE NOT, AND CANNOT BE: `power` is bestMag, an ABSOLUTE
// magnitude that scales with the signal's amplitude and says nothing about whether the peak stands out from its
// own spectrum; `cycles` is freq * N, which is RESOLUTION rather than PROMINENCE -- a noise peak high in the
// band reports plenty of cycles. THE ESTIMATOR GENUINELY HAD NO WAY TO SAY "THERE IS NO TONE HERE", so
// peakProminence was added to sheddingSpectrum: peak magnitude over the MEDIAN magnitude of the same scan.
// Median rather than mean, because a genuine peak drags a mean upward and would flatter itself.
//
// CALIBRATED ON SIGNALS WHOSE ANSWER IS KNOWN BY CONSTRUCTION, 9000 samples each:
//     clean sine                  4654.95
//     sine + 20% noise              54.92
//     sine + equal-amplitude noise  11.47
//     sine + 5x noise                3.49    <- and it reports the WRONG frequency
//     PURE NOISE, no tone            3.52    <- indistinguishable from the buried sine
//     random walk (drift, NO tone) 1136.42    <- *** HIGH PROMINENCE WITH NO TONE AT ALL ***
//
// THE LAST ROW IS THE ONE THAT MATTERS FOR HONESTY: a linear detrend does NOT flatten a random walk, and its
// power piles up at the bottom of the band, so drift FAKES a prominent peak. PROMINENCE ALONE IS NOT PROOF --
// it must be read together with where the peak sits and how many cycles it spans.
//
// MEASURED ON THE REAL RUN (tau 0.55, U 0.09, D 12, nx 300, yOffset 1.5, settle 6000 + record 18000):
//
//     signal    prominence   peak f (per step)   cycles
//     lift cl     3105.21        1.0964e-2        197.3
//     drag cd      532.44        4.8617e-4          8.8
//     wake uy      618.75        9.6739e-4         17.4
//
// *** ALL THREE ARE HUNDREDS TIMES THE NOISE FLOOR. THE TONES ARE REAL AND MY HYPOTHESIS IS DEAD. ***
//
// AND THE ACTUAL PICTURE IS SHARPER THAN "NOISE" WOULD HAVE BEEN: THEY ARE THREE DIFFERENT TONES. Lift sits at
// 1.0964e-2, wake at 9.6739e-4 -- ELEVEN TIMES APART, which is exactly the liftWakeAgreementFrac of 10.33 that
// v3346 recorded and treated as a disagreement to be explained away. IT WAS NOT AN ERROR BAR. IT WAS TWO
// SEPARATE OSCILLATIONS. In a von Karman street lift and wake share a frequency and drag runs at twice it; here
// no pair is related by any small integer ratio.
//
// *** AND THE LIFT TONE WAS DISMISSED FOR THE WRONG REASON. *** v3346 reported stLift 1.4618 and I called it
// nonsense consistent with an unsustained lift. It is a HIGHLY PROMINENT tone spanning 197 CYCLES -- the best
// resolved signal in the rig. It only looks like nonsense if you assume it must be shedding, and by v3347
// shedding was already excluded. A NUMBER THAT CONTRADICTS AN ASSUMPTION IS EVIDENCE ABOUT THE ASSUMPTION.
//
// LEAST TRUSTWORTHY OF THE THREE, STATED RATHER THAN BURIED: the DRAG tone spans only 8.8 cycles and sits near
// the bottom of the band, which is where the random-walk failure mode lives. Its prominence of 532 is exactly
// what a drifting signal produces, and this rig's drag has never been shown to have settled.
"use strict";

export const TONES_V3349 = {
    calibration: { cleanSine: 4654.95, sinePlus20pctNoise: 54.92, sinePlusEqualNoise: 11.47,
                   sineBuried5x: 3.49, pureNoise: 3.52, randomWalkNoTone: 1136.42 },
    measured: [
        { signal: "lift", prominence: 3105.21, freqPerStep: 1.0964e-2, cycles: 197.3 },
        { signal: "drag", prominence: 532.44, freqPerStep: 4.8617e-4, cycles: 8.8 },
        { signal: "wake", prominence: 618.75, freqPerStep: 9.6739e-4, cycles: 17.4 },
    ],
    noiseFloor: 3.52,
};

/** Is a reported tone believable? Prominence AND cycles, because drift fakes the first on its own. */
export function toneVerdict(t, floor = TONES_V3349.noiseFloor) {
    const prominent = t.prominence > 20 * floor;
    const resolved = t.cycles >= 20;
    return { prominent, resolved, trustworthy: prominent && resolved,
             why: !prominent ? "indistinguishable from noise"
                 : !resolved ? "prominent but spans too few cycles -- this is where drift fakes a peak"
                 : "prominent and well resolved" };
}

/** Do any two of the tones stand in a small-integer ratio, as a vortex street requires? */
export function relatedBySmallInteger(tones = TONES_V3349.measured, tol = 0.1) {
    const out = [];
    for (let i = 0; i < tones.length; i++) for (let j = i + 1; j < tones.length; j++) {
        const r = Math.max(tones[i].freqPerStep, tones[j].freqPerStep) / Math.min(tones[i].freqPerStep, tones[j].freqPerStep);
        const near = [1, 2, 3, 4].find((n) => Math.abs(r - n) / n < tol) || null;
        out.push({ pair: tones[i].signal + "/" + tones[j].signal, ratio: r, smallInteger: near });
    }
    return out;
}
