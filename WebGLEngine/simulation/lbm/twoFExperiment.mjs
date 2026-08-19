// WebGLEngine/simulation/lbm/twoFExperiment.mjs -- v2862
//
// THE MEASUREMENT THREE ROUNDS OF DIAGNOSIS WERE BUILT FOR.
//
// v2797 measured the vortex street twice independently and got agreement, but could NOT reproduce the textbook
// relation that DRAG oscillates at TWICE the lift frequency. It recorded that honestly and guessed the fix:
// "longer runs at lower blockage".
//
// v2834 (sheddingDesign.mjs) proved that guess WRONG, with arithmetic rather than a story: in a body-force-driven
// periodic channel, shedding modulates drag, drag sets velocity, and velocity sets shedding. Those three are
// coupled, so the Reynolds number breathes and never holds still -- every attempt drifted 12-21%. No number of
// extra steps fixes a feedback loop. The prescription was a DIFFERENT BOUNDARY CONDITION: pin the velocity from
// outside and the loop breaks.
//
// v2835 built exactly that -- a Zou-He fixed-velocity inlet and pressure outlet in lbm2d -- and gated that the
// inlet does not drift.
//
// AND THEN NOBODY RAN THE EXPERIMENT. The tool was built for a question and the question was left open. This
// module is the run.
//
// IT REUSES, IT DOES NOT REIMPLEMENT: recordSeries / dominantFrequency / zeroCrossFrequency / isSustained come
// from sheddingSpectrum.mjs (gated 16/16 against synthetic sinusoids of known frequency), and the force comes
// from windTunnel.mjs solidForce (gated against the momentum-balance answer key). If this module computed its own
// spectrum it would be grading itself.
//
// CONSTRAINTS, all measured elsewhere and all binding at once:
//   tau >= ~0.54   the Zou-He inlet is only conditionally stable and diverges below this (v2835, measured)
//   U   <= ~0.1    above this LBM compressibility error stops being ignorable (sheddingDesign LBM_VALIDITY_U)
//   Re  >= ~50     for shedding at all, and CONFINEMENT RAISES THAT (v2749, measured)
//
// WHAT WOULD MAKE THIS A REAL RESULT, and what would make it another honest negative: the lift signal must be
// SUSTAINED (a decaying transient has no well-defined frequency), the inlet must NOT drift (else we are back in
// the v2834 feedback loop wearing a new hat), and only then does the drag/lift frequency ratio mean anything.
// The ratio is reported either way.
"use strict";
import { makeLBM } from "./lbm2d.js";
import { solidForce } from "./windTunnel.mjs";
import { recordSeries, dominantFrequency, zeroCrossFrequency, isSustained, amplitude, detrend, strouhal } from "./sheddingSpectrum.mjs";

export const DEFAULT_RIG = {
    nx: 300, ny: 81, tau: 0.545, U: 0.098, D: 13, cx: 70,
    // BREAK THE SYMMETRY. A perfectly symmetric cylinder in a perfectly symmetric channel is a numerically
    // symmetric problem, and the von Karman instability is a SYMMETRY-BREAKING bifurcation: with nothing to
    // break it, the discrete solution can sit on the unstable symmetric branch forever and report "no shedding"
    // at a Reynolds number well past onset. Real experiments have imperfections; this supplies one. It is a
    // legitimate technique, not a thumb on the scale -- if the flow is genuinely below onset the perturbation
    // decays and we still measure nothing.
    yOffset: 0.75,
    settle: 6000,      // let the wake establish before recording -- a transient has no frequency
    record: 18000,     // long enough for ~15 shedding periods at St~0.15
    sampleEvery: 2,
};

/** Build the fixed-inflow channel with a cylinder. Parabolic inlet, matching the gated inflow BC. */
export function makeRig(cfg = {}) {
    const c = { ...DEFAULT_RIG, ...cfg };
    const cy = (c.ny - 1) / 2, h = (c.ny - 2) / 2;
    const prof = (y) => { const d = (y - cy) / h; return c.U * Math.max(0, 1 - d * d); };
    // *** v3767 -- `dropInlet` DEFAULTS TO FALSE AND EXISTS SO A PLANT CAN RE-CREATE THE EXACT DEFECT THIS
    // MODULE WAS BUILT TO FIX. lbm2d.js says it plainly: ABSENT opts.inflow THAT BLOCK NEVER RUNS AND THE
    // SOLVER IS EXACTLY THE PRE-v2835 ONE. v2834 proved by arithmetic that a body-force-driven channel cannot
    // hold its Reynolds number -- shedding modulates drag, drag sets velocity, velocity sets shedding -- and
    // every attempt drifted 12-21%. v2835 built the Zou-He inlet to break that loop. THE INVITED REGRESSION IS
    // SOMEBODY SIMPLIFYING THE INLET BACK OUT, and it looks like a tidy-up rather than a physics change. ***
    const lbm = makeLBM({
        nx: c.nx, ny: c.ny, tau: c.tau,
        ...(c.dropInlet ? {} : { inflow: prof }),
        solidAt: (x, y) => Math.hypot(x - c.cx, y - (cy + 0.5 + (c.yOffset || 0))) < c.D / 2,
    });
    return { lbm, cfg: c, cy };
}

export const nuOf = (tau) => (tau - 0.5) / 3;
export const reOf = (U, D, tau) => (U * D) / nuOf(tau);

/**
 * Run the experiment. Returns every observable, including the ones that would DISQUALIFY the result.
 * @param {object} cfg    rig overrides
 * @param {function} [onProgress] called with (stepsDone, totalSteps)
 */
export function runTwoF(cfg = {}, onProgress) {
    const { lbm, cfg: c, cy } = makeRig(cfg);
    const nu = nuOf(c.tau);

    // settle
    for (let i = 0; i < c.settle; i++) {
        lbm.step();
        if (onProgress && i % 1000 === 0) onProgress(i, c.settle + c.record);
    }
    const inletAfterSettle = lbm.ux[lbm.idx(1, Math.round(cy))];

    // a wake probe well downstream of the body, off the centreline so it sees the alternating vortices
    const probeX = Math.min(c.nx - 3, c.cx + 4 * c.D);
    const probeY = Math.round(cy) + Math.round(c.D * 0.6);
    const series = recordSeries(lbm, {
        steps: c.record,
        forceOf: (l) => solidForce(l),
        probe: (l) => l.uy[l.idx(probeX, probeY)],
        sampleEvery: c.sampleEvery,
    });
    if (onProgress) onProgress(c.settle + c.record, c.settle + c.record);

    const inletAfterRun = lbm.ux[lbm.idx(1, Math.round(cy))];
    const inletDriftFrac = Math.abs(inletAfterRun - inletAfterSettle) / Math.max(1e-12, Math.abs(inletAfterSettle));

    // frequencies are per SAMPLE; convert to per STEP
    // v3341 -- *** .freq WAS MISSING AND EVERY FREQUENCY IN THIS FILE WAS NaN. *** dominantFrequency returns
    // { freq, power, cycles } and zeroCrossFrequency returns { freq, crossings }; dividing either OBJECT by
    // sampleEvery yields NaN, so fLift, fDrag, fWake, fLiftZC -- and dragOverLift, stLift, stWake and
    // liftWakeAgreementFrac, which are computed from them -- have been NaN since v2862. THE EXPERIMENT THAT
    // THREE ROUNDS OF DIAGNOSIS WERE BUILT FOR COULD NOT ANSWER ITS OWN QUESTION.
    //
    // EVERY OTHER CALLER IN THE TREE ALREADY GOT THIS RIGHT -- tools/shedding-settle.mjs and
    // sheddingSpectrum-selfcheck.mjs both write `dominantFrequency(x).freq / sampleEvery`, the exact idiom, in
    // the gate of the module this one imports from. A single file disagreed with three others and nothing
    // compared them.
    const perStep = (r) => r.freq / c.sampleEvery;
    const fLift = perStep(dominantFrequency(detrend(series.cl)));
    const fDrag = perStep(dominantFrequency(detrend(series.cd)));
    const fWake = perStep(dominantFrequency(detrend(series.uy)));
    const fLiftZC = perStep(zeroCrossFrequency(detrend(series.cl)));

    const healthy = [...lbm.rho].every((v) => Number.isFinite(v) && v > 0.5 && v < 2);

    return {
        config: c, nu, reNominal: reOf(c.U, c.D, c.tau),
        blockageFrac: c.D / c.ny,
        healthy,
        inletDriftFrac,
        liftSustained: isSustained(detrend(series.cl)),
        liftAmplitude: amplitude(detrend(series.cl)),
        dragAmplitude: amplitude(detrend(series.cd)),
        fLift, fDrag, fWake, fLiftZC,
        dragOverLift: fLift > 0 ? fDrag / fLift : NaN,
        stLift: strouhal(fLift, c.D, c.U),
        stWake: strouhal(fWake, c.D, c.U),
        liftWakeAgreementFrac: fWake > 0 && fLift > 0 ? Math.abs(fLift - fWake) / fWake : NaN,
        samples: series.cl.length,
    };
}

/**
 * The verdict, kept separate from the measurement so the thresholds are visible and arguable rather than buried.
 * A result only COUNTS if the rig behaved; otherwise the ratio is meaningless and saying so is the finding.
 */
export function verdictTwoF(r) {
    const reasons = [];
    if (!r.healthy) reasons.push("field diverged");
    if (!r.liftSustained) reasons.push("lift not sustained (transient, no well-defined frequency)");
    if (r.inletDriftFrac > 0.02) reasons.push("inlet drifted " + (100 * r.inletDriftFrac).toFixed(1) + "% (the v2834 feedback loop is back)");
    if (!(r.fLift > 0)) reasons.push("no lift frequency resolved");
    const qualified = reasons.length === 0;
    const ratio = r.dragOverLift;
    const near2 = Number.isFinite(ratio) && Math.abs(ratio - 2) / 2 < 0.15;
    return {
        qualified, reasons,
        ratio,
        reproduces2f: qualified && near2,
        text: !qualified ? "DISQUALIFIED: " + reasons.join("; ")
            : near2 ? "f_drag = 2 f_lift REPRODUCES (ratio " + ratio.toFixed(3) + ")"
            : "rig qualified but ratio is " + ratio.toFixed(3) + ", not 2 -- an honest negative on a valid run",
    };
}

// ---- WHAT TWO FULL RUNS ACTUALLY MEASURED (v2862) ------------------------------------------------------------
//
// Recorded as DATA so the next person inherits the numbers rather than the impression, and so the gate can assert
// the rig still behaves the way these were taken.
//
// THE HALF THAT WORKED, AND IT IS THE HALF THREE ROUNDS WERE SPENT ON. The fixed inlet HOLDS. Every prior attempt
// drifted 12-21% and that drift was the whole reason the 2f test kept failing. Measured here: 0.15% and 0.11%.
// The v2834 feedback loop -- shedding modulates drag, drag sets velocity, velocity sets shedding -- is broken.
// v2835's boundary condition does what it was built to do.
//
// THE HALF THAT DID NOT. Neither run shed. No lift frequency was resolvable at all, so the drag/lift ratio has no
// value -- not a wrong value, no value. Raising Re from 64.8 to 84.9 and deliberately breaking the symmetry grew
// the lift amplitude 5x (0.023 -> 0.115), so the perturbation took and the asymmetry is real; it simply did not
// become a sustained oscillation.
//
// WHAT THAT IS EVIDENCE FOR, stated no more strongly than it deserves: it EXTENDS v2749's measured finding that
// confinement raises the shedding onset. That round found no shedding by Re~58 at ~21% blockage. This one finds
// none by Re~85 at 16%. Two points on the same boundary, both measured on this solver, both against the
// unconfined textbook onset of ~47.
//
// WHAT IT IS NOT EVIDENCE FOR: it does not show 2f is false. The test still has not been run under conditions
// where a vortex street exists, so the original question remains exactly as open as it was -- with one fewer
// excuse, because the boundary condition is no longer the blocker.
export const RUNS_V2862 = [
    // re, blockage, tau, U, offset, drift, liftAmp, shed, healthy
    { re: 64.8, blockage: 0.148, tau: 0.55,  U: 0.09, yOffset: 0,    inletDriftFrac: 0.00145, liftAmplitude: 0.0227, shed: false, healthy: true },
    { re: 84.9, blockage: 0.160, tau: 0.545, U: 0.098, yOffset: 0.75, inletDriftFrac: 0.00114, liftAmplitude: 0.1146, shed: false, healthy: true },
    // v2862 third run: buy Reynolds by going wider and faster. THE FIELD DIVERGED. U sat exactly on the 0.1
    // validity ceiling and tau sat just above the measured 0.54 inlet floor, and at Re 120 that combination is
    // outside this solver's stable envelope. Recorded as a MEASUREMENT of the envelope, not as a failed attempt.
    { re: 120.0, blockage: 0.099, tau: 0.545, U: 0.10, yOffset: 1.0, inletDriftFrac: 0, liftAmplitude: null, shed: false, healthy: false },
];

// ---- THE ENVELOPE, WHICH IS THE ACTUAL RESULT OF v2862 -------------------------------------------------------
//
// sheddingDesign.mjs predicted these three constraints would FIGHT. Three runs now measure how hard:
//
//   tau  >= ~0.54   below it the Zou-He inlet diverges          (v2835, measured)
//   U    <= ~0.1    above it LBM compressibility error dominates (sheddingDesign)
//   Re   >  onset   and CONFINEMENT RAISES onset above ~47       (v2749, measured; extended here)
//
// Re = U*D/nu and nu = (tau-1/2)/3, so with U pinned at its ceiling and tau pinned at its floor, the ONLY
// remaining lever for Reynolds number is D -- and D must grow with ny to keep blockage low, so buying Reynolds
// costs DOMAIN AREA, quadratically. That is why this is a rig job and not a longer sandbox run: it is not more
// steps, it is more cells.
//
// WHAT THE RIG SHOULD RUN, derived rather than guessed: tau = 0.55 (a safety margin over the measured 0.54 floor
// rather than the 0.545 that diverged), U = 0.09 (margin under the ceiling), and buy Reynolds with D >= 20,
// ny >= 200 for 10% blockage. Re = 0.09*20/0.016667 = 108. Larger D raises it further at quadratic cost.
export const STABLE_TAU_FLOOR = 0.55;     // 0.545 diverged at Re 120; use a margin, not the edge
export const VALIDITY_U = 0.1;
export const INLET_DRIFT_BUDGET = 0.02;   // the v2834 failure was 0.12-0.21; anything near that is the loop returning
