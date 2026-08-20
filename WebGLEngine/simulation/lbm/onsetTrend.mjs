// WebGLEngine/simulation/lbm/onsetTrend.mjs -- v3344
//
// *** WITHDRAWN AT v3345. THE HEADLINE BELOW IS WRONG AND IS KEPT SO THE ERROR IS LEGIBLE. ***
//
// This file concluded "the rig cannot shed at any reachable setting" from a damping trend measured with
// settleCurve -- WHICH PROBED ONE CELL FROM THE INLET, sixty-nine cells upstream of the cylinder, at the place
// the Zou-He boundary condition PINS the velocity. THE SWEEP MEASURED HOW FAST THE DRIVE SETTLES, NOT WHETHER
// THE WAKE IS STABLE. Re-measured at the wake probe (x=118) in the same runs:
//
//     yOffset 0     wake half-range 1.530e-2 -> 1.370e-2 -> 1.516e-2   ratio 0.9908   FLAT, not decaying
//     yOffset 1.5   wake half-range 1.441e-2 -> 1.539e-2 -> 2.090e-2   ratio 1.4504   GROWING
//
// A GROWING PERTURBATION IS THE SIGNATURE OF BEING **ABOVE** ONSET, WHICH IS THE OPPOSITE OF WHAT THIS FILE
// SAID. The 2f arc is NOT closed and this rig is not obviously incapable of shedding.
//
// WHAT SURVIVES, because not all of it was probe-dependent: THE CORNER IS STILL REAL AND STILL ARITHMETIC --
// tau sits AT STABLE_TAU_FLOOR, U is at 90% of VALIDITY_U, and the only knob with headroom (D) raises blockage
// and therefore raises onset. Those come from the module's own declared constants, not from any probe. And the
// observation about shedOnset.mjs stands: it bisects a BODY-FORCE knob that v2834 proved is the feedback loop,
// so it still cannot answer an onset question for the pinned-inlet rig.
//
// WHAT DOES NOT SURVIVE: every sentence below about damping strengthening with Reynolds, and the closure drawn
// from it. THE SWEEP NUMBERS ARE REAL MEASUREMENTS OF THE WRONG QUANTITY. Left in place rather than deleted,
// because a withdrawn conclusion that leaves no trace is one somebody re-derives.
//
// SUPERSEDED HEADLINE FOLLOWS:
// *** THE 2f ARC IS CLOSED, AND THE ANSWER IS THAT THIS RIG CANNOT SHED AT ANY REACHABLE SETTING. ***
//
// v3343 showed the wake oscillation DECAYS rather than establishing, and named a candidate it refused to claim:
// that the rig sits below its confined shedding onset (v2749 measured that confinement RAISES onset). This is
// the sweep that tests it, and the result is stronger and stranger than "below onset".
//
// FIRST, THE RIG IS CORNERED, AND THE CORNER IS ARITHMETIC RATHER THAN OPINION. Re = U D / nu, and every knob
// is against a limit the module itself declares:
//
//     tau  0.55   IS STABLE_TAU_FLOOR EXACTLY. No room -- and lowering it is what diverged at Re 120.
//     U    0.09   against VALIDITY_U = 0.1. Raising it to the ceiling buys 11.1% of Re, and no more.
//     D    12     the only knob with real headroom -- AND RAISING IT RAISES BLOCKAGE, WHICH RAISES THE ONSET
//                 BEING CHASED. D 12 -> 20 takes Re 64.8 -> 108 and blockage 14.8% -> 24.7%.
//
// So at fixed blockage the ENTIRE accessible window is Re 57.6 to 72.0. That is what this sweep covers: not a
// sample of the range, THE RANGE.
//
// SECOND, AND THIS IS THE RESULT: THE DAMPING DOES NOT WEAKEN AS Re RISES. IT STRENGTHENS.
//
//     U       Re      amp per window                                  per-window factor
//     0.080   57.6    4.454% -> 1.949% -> 1.094% -> 0.665%            0.5306
//     0.090   64.8    4.639% -> 1.886% -> 1.075% -> 0.643%            0.5175
//     0.095   68.4    4.683% -> 1.862% -> 0.969% -> 0.592%            0.5020
//     0.100   72.0    4.683% -> 1.561% -> 0.636% -> 0.447%            0.4570
//
// *** A RIG APPROACHING A BIFURCATION HAS A SIGNATURE: THE DAMPING GOES TO ZERO AND THEN CHANGES SIGN. THIS
// DOES THE EXACT OPPOSITE, MONOTONICALLY, ACROSS THE WHOLE ACCESSIBLE RANGE. *** Every step toward higher
// Reynolds number makes the perturbation die FASTER. There is no approach to an onset here to be found by
// running longer, probing elsewhere, or pushing to the ceiling -- five attempts' worth of prescriptions, and
// the parameter space says no to all of them at once.
//
// WHY THE DAMPING STRENGTHENS IS A CANDIDATE AND IS NOT CLAIMED: the Zou-He inlet PINS a parabolic profile, and
// a stronger drive may re-impose that profile faster than the yOffset perturbation can break symmetry -- so the
// same boundary condition that v2835 built to KILL the feedback loop may also be suppressing the instability
// the experiment wants. Plausible, unproven, and testing it means varying the perturbation rather than the
// drive. NAMING A MECHANISM IS NOT MEASURING ONE.
//
// AND NOTE WHAT THIS DOES *NOT* OVERTURN: v2835's inlet was RIGHT for the problem it solved -- Reynolds drift
// fell 21% to 4.16% and both observables sustained at once for the first time. A fix can be correct and still
// close a door somewhere else.
//
// *** THE EXISTING ONSET INSTRUMENT CANNOT ANSWER THIS, AND THE REASON IS A THREE-ROUND-OLD ABANDONMENT NOBODY
// CONNECTED. *** tools/roundhouse/shedOnset.mjs (v2749) bisects a BODY-FORCE knob g. v2834 then proved that
// body-force drive is exactly the feedback loop -- shedding sets drag, drag sets velocity, velocity sets
// shedding -- and v2835 replaced it with the pinned inlet. The onset tool was never revisited. Using it here
// would have re-introduced the loop the rig was rebuilt to escape, and it would have looked like an onset sweep.
"use strict";
import { settleCurve } from "./settleCurve.mjs";
import { reOf } from "./twoFExperiment.mjs";

/** The measured sweep, recorded so the conclusion travels with its evidence and needs no re-run to be read. */
/** WITHDRAWN v3345: these are inlet-probe measurements and do NOT describe wake stability. Kept as the record. */
export const SWEEP_V3344_WITHDRAWN_INLET_PROBE = [
    { U: 0.080, re: 57.6, amps: [4.454, 1.949, 1.094, 0.665], factor: 0.5306 },
    { U: 0.090, re: 64.8, amps: [4.639, 1.886, 1.075, 0.643], factor: 0.5175 },
    { U: 0.095, re: 68.4, amps: [4.683, 1.862, 0.969, 0.592], factor: 0.5020 },
    { U: 0.100, re: 72.0, amps: [4.683, 1.561, 0.636, 0.447], factor: 0.4570 },
];

/** Geometric per-window decay factor. < 1 is damping; > 1 is growth; -> 1 is the approach to a bifurcation. */
export function trendFactor(amps) {
    if (!amps || amps.length < 2) return NaN;
    return Math.pow(amps[amps.length - 1] / amps[0], 1 / (amps.length - 1));
}

/** Does the damping WEAKEN as Re rises (an approach to onset) or STRENGTHEN (moving away from it)? */
export const SWEEP_V3344 = SWEEP_V3344_WITHDRAWN_INLET_PROBE;   // old name kept so nothing breaks; read the header

export function approachesOnset(sweep) {
    const byRe = [...sweep].sort((a, b) => a.re - b.re);
    const f = byRe.map((s) => s.factor ?? trendFactor(s.amps));
    return {
        factors: f,
        weakensWithRe: f.every((x, i) => i === 0 || x > f[i - 1]),   // damping factor rising toward 1
        strengthensWithRe: f.every((x, i) => i === 0 || x < f[i - 1]),
        anyGrowth: f.some((x) => x >= 1),
    };
}

export function sweepU(base, Us, { steps = 8000, D = 12 } = {}) {
    return Us.map((U) => {
        // v3345 -- MUST NAME THE INLET EXPLICITLY NOW. settleCurve defaults to the WAKE since the correction,
        // and this function reproduces the WITHDRAWN inlet sweep -- so it has to ask for the probe those numbers
        // came from. Reproducing a withdrawn measurement is still worth doing: it is how the record stays checkable.
        const c = settleCurve({ ...base, U, D }, { steps, sampleEvery: 5, windowSteps: 2000, at: "inlet" });
        const amps = c.amps.map((a) => a * 100);
        return { U, re: reOf(U, D, base.tau), amps, factor: trendFactor(amps) };
    });
}
