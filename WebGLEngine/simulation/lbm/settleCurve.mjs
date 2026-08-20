// WebGLEngine/simulation/lbm/settleCurve.mjs -- v3343
//
// *** v3345 CORRECTION, AND IT OVERTURNS WHAT v3343 AND v3344 CONCLUDED FROM THIS FILE. ***
// This module probed x=1 -- ONE CELL FROM THE INLET, SIXTY-NINE CELLS UPSTREAM OF THE CYLINDER, at the exact
// place the Zou-He boundary condition pins the velocity. Everything below about "the oscillation decays" is
// TRUE OF THE INLET AND SAYS NOTHING ABOUT THE WAKE. Measured in the same runs with a wake probe at x=118:
//
//     yOffset 0     inlet 4.639% -> 1.886% -> 1.075%   |  wake 1.530e-2 -> 1.370e-2 -> 1.516e-2  ratio 0.9908
//     yOffset 1.5   inlet 4.823% -> 1.895% -> 1.090%   |  wake 1.441e-2 -> 1.539e-2 -> 2.090e-2  ratio 1.4504
//
// THE INLET TRANSIENT DECAYS IDENTICALLY IN BOTH. THE WAKE DOES NOT DECAY AT ALL, AND AT THE LARGER
// PERTURBATION IT GROWS. So "the wake perturbation is dying, not establishing" was a claim about the drive
// wearing the wake's name, and v3344's closure of the 2f arc is WITHDRAWN -- see onsetTrend.mjs.
//
// HOW IT HAPPENED, because the mechanism is more useful than the apology: x=1 is where runTwoF reads
// inletDriftFrac. I REUSED THE DRIFT PROBE FOR A QUESTION ABOUT THE WAKE, and it returned a beautifully clean
// monotone decay -- which is exactly what a settling drive looks like. A WRONG PROBE IN A WORKING INSTRUMENT
// DOES NOT LOOK BROKEN; IT LOOKS LIKE AN ANSWER.
//
// *** WHEN HAS THE FLOW ARRIVED? THE OBVIOUS TEST CANNOT ANSWER IT, AND THAT IS THIS FILE'S POINT. ***
//
// tools/shedding-settle.mjs (v2844) says it plainly: "when Re stops moving, the flow has arrived". So the
// natural instrument is a successive difference -- sample the inlet every N steps and watch |du|/u fall.
// MEASURED OVER 24,000 STEPS, IT DOES NOT FALL. It goes 3.0e-3, 4.7e-3, 3.4e-4, 1.6e-4, 1.6e-3, ... up to
// 3.3e-3 at 11,000 and back down to 2.8e-4 at 24,000. Non-monotone, wandering by an order of magnitude.
//
// *** IT IS NOT MEASURING SETTLING. IT IS ALIASING THE SHEDDING. *** The inlet OSCILLATES, so a difference
// between two instants depends on where in the cycle each one landed. A SUCCESSIVE-DIFFERENCE TEST CANNOT TELL
// "STILL SETTLING" FROM "SETTLED AND OSCILLATING" -- one number over two phenomena, which is this project's
// signature defect appearing in a MEASUREMENT rather than in code.
//
// SPLIT THEM AND BOTH BECOME CLEAN. Over 2000-step windows (comfortably more than one shedding period):
//
//     window        mean          half-range     amp/mean
//     0- 2000    0.090133335      4.181e-3         4.639%
//     2000- 4000 0.089984143      1.697e-3         1.886%
//     4000- 6000 0.089997435      9.679e-4         1.075%
//     ...
//     20000-22000 0.090001058     8.101e-5         0.090%
//     22000-24000 0.090001118     6.284e-5         0.070%
//
// *** THE MEAN ARRIVES BY ~4000 STEPS AND THEN HOLDS TO NINE DIGITS. THE OSCILLATION DECAYS MONOTONICALLY AND
// IS STILL FALLING AT 24,000. *** Two observables, opposite stories, and the difference test averaged them into
// noise.
//
// *** AND THAT ANSWERS A QUESTION THAT HAS BEEN OPEN SINCE v2797, ACROSS FIVE ATTEMPTS. *** The 2f arc kept
// prescribing MORE WARMUP: v2797 "longer runs", v2843 found warmup tracked every observable monotonically,
// v2844 settled for 40,000. But the thing longer warmup does here is SHRINK THE OSCILLATION. The wake
// perturbation is DECAYING, not establishing -- which is exactly what liftSustained=false has been reporting
// all along. MORE SETTLING IS THE WRONG DIRECTION: IT KILLS THE SIGNAL THE EXPERIMENT NEEDS.
//
// THE CONSISTENT READING, and it was already measured and never connected: v2749 found that CONFINEMENT RAISES
// THE SHEDDING ONSET -- a confined cylinder did not shed by Re~58, past the textbook unconfined ~47. This rig
// runs Re 64.8 at 14.8% blockage. A damped oscillation is what a rig BELOW ITS CONFINED ONSET looks like. That
// is a hypothesis this file does NOT claim to have proven -- it reports the decay and names the candidate.
"use strict";
import { makeRig } from "./twoFExperiment.mjs";

/**
 * Watch ONE relaxation and split each window into a mean and an oscillation.
 * Sampling one run beats restarting it N times: a settling curve is slice-2-minus-slice-1, and restarting
 * throws away every slice between.
 */
export function settleCurve(cfg = {}, { steps = 24000, sampleEvery = 5, windowSteps = 2000, at = "wake" } = {}) {
    const { lbm, cfg: c, cy } = makeRig(cfg);
    const row = Math.round(cy);
    // *** v3345 -- WHERE YOU PROBE IS THE WHOLE ANSWER, AND v3343 GOT IT WRONG BY DEFAULT. ***
    // The original hard-coded x=1: ONE CELL FROM THE INLET, sixty-nine cells UPSTREAM of the cylinder, at
    // exactly the place the Zou-He boundary condition PINS. It measured the DRIVE settling and was read as the
    // WAKE settling. There is no default that is safe for both questions, so the location is now named.
    const px = at === "inlet" ? 1 : Math.min(c.nx - 3, c.cx + 4 * (c.D || 12));
    const py = at === "inlet" ? row : row + Math.round((c.D || 12) * 0.6);
    const read = at === "inlet" ? (l) => l.ux[l.idx(px, py)] : (l) => l.uy[l.idx(px, py)];
    const s = [];
    for (let n = 1; n <= steps; n++) { lbm.step(); if (n % sampleEvery === 0) s.push(read(lbm)); }
    const out = analyse(s, sampleEvery, windowSteps);
    // uy in the wake oscillates about ~0, so amp/mean is meaningless there -- the RAW half-range is the measure.
    out.at = at; out.probe = { x: px, y: py };
    out.halfRanges = out.windows.map((w) => w.halfRange);
    out.growthRatio = out.halfRanges[out.halfRanges.length - 1] / out.halfRanges[0];
    return out;
}

/** Pure, so a recorded series can be re-analysed without paying for the run again. */
export function analyse(series, sampleEvery = 5, windowSteps = 2000) {
    const W = Math.max(2, Math.round(windowSteps / sampleEvery));
    const windows = [];
    for (let i = 0; i + W <= series.length; i += W) {
        const w = series.slice(i, i + W);
        const mean = w.reduce((a, b) => a + b, 0) / W;
        const halfRange = (Math.max(...w) - Math.min(...w)) / 2;
        windows.push({ from: i * sampleEvery, to: (i + W) * sampleEvery, mean, halfRange, ampFrac: halfRange / mean });
    }
    // THE MEAN: where does it stop moving? Reported as the first window after which every later mean agrees
    // with the last to within tol -- a PLATEAU, not a single quiet step, because one quiet step is a phase
    // coincidence and that is the whole error this file exists to avoid.
    const last = windows[windows.length - 1].mean;
    const tol = 1e-4;
    let meanSettledAt = null;
    for (let i = 0; i < windows.length; i++) {
        if (windows.slice(i).every((w) => Math.abs(w.mean - last) / Math.abs(last) < tol)) { meanSettledAt = windows[i].from; break; }
    }
    // THE OSCILLATION: strictly monotone decay is the claim, and it is checkable window to window.
    const amps = windows.map((w) => w.ampFrac);
    const monotoneDecay = amps.every((a, i) => i === 0 || a < amps[i - 1]);
    const ratios = amps.slice(0, -1).map((a, i) => a / amps[i + 1]);
    // The naive test, computed HERE so the comparison is in one place rather than in a paragraph.
    const naive = windows.slice(1).map((w, i) => Math.abs(w.mean - windows[i].mean) / Math.abs(w.mean));
    const naiveMonotone = naive.every((d, i) => i === 0 || d < naive[i - 1]);
    return { windows, meanSettledAt, amps, monotoneDecay, ratios, naive, naiveMonotone, finalAmpFrac: amps[amps.length - 1] };
}
